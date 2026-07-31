#!/usr/bin/env node
'use strict';

// generate-routing-surfaces.js — the routing-surface render engine + CLI.
//
// Regenerates the 18 template-shaped surfaces (next x6 + init x6 + finalize x6)
// from one canonical skeleton per topic. A skeleton is the UNION
// structure of a topic's command + skill surfaces, annotated with directives on
// their own comment lines:
//
//   <!-- SLOT:name -->            replaced by slot data resolved for the render
//                                 context (surface_type x forge)
//   <!-- SPLICE:name -->          replaced by a mid-paragraph variant resolved
//                                 for the render context
//   <!-- REGION:cond — why -->    keep the body only when cond matches the
//   ...body...                    context, else drop the whole region. cond is
//   <!-- /REGION -->              a ','-joined OR of '+'-joined ANDs of
//                                 surface_type / forge tags, e.g.
//                                 `command+github` or `gitlab,gitea`.
//
// A REGION open directive carries its own justification after an em dash: the
// capability difference that makes the divergence real, in one clause, on the
// same line as the condition. It is authoring metadata — the renderer reads the
// condition and drops the rest, so no reason ever reaches a shipped surface. A
// region records THAT a surface diverges; the reason records WHY, and a region
// whose reason cannot name a runtime difference is drift to be collapsed rather
// than a divergence to be kept.
//
// REGION vs SPLICE is not a style choice. A SPLICE always emits exactly one
// value, so its smallest possible rendering is one line — it cannot express
// "these lines exist on some contexts and not others". Lines that are ABSENT
// on a context must therefore be a REGION, and lines that merely READ
// DIFFERENTLY across contexts should be a SPLICE. Body text shared by several
// (but not all) forges belongs in ONE `gitlab,gitea`-style region rather than
// being copied into a per-forge branch: a copy is a place two forges can
// silently diverge, which is the whole failure class the skeleton exists to
// close.
//
// After slot/splice/region resolution, forge-noun renames are applied (github
// is the canonical namespace; gitlab/gitea rename per rename-table.js).
//
// CLI:
//   --write   render every surface and write it to its path
//   --check   render in-memory, byte-compare against the committed surface,
//             print a minimal diff and exit(1) on any mismatch
//   (no args) == --check
//
// The skeletons + slots + rename-table are reverse-engineered from the current
// committed surfaces, so `--check` is a byte-for-byte no-op on a clean tree.
// There is NO in-file @generated banner (it would break byte-identity); the
// generated status is recorded out-of-band.

const fs = require('fs');
const path = require('path');
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');

const REPO = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(REPO, 'templates', 'routing');

// ---------------------------------------------------------------------------
// Editions — reuse the same per-forge dir layout the reachability checker uses
// (claude/command surfaces on the claude editions, codex/skill surfaces on the
// codex editions). Ordered github, gitlab, gitea.
// ---------------------------------------------------------------------------
const COMMAND_EDITIONS = [
  { forge: 'github', dir: 'commands' },
  { forge: 'gitlab', dir: 'plugins/kaola-workflow-gitlab/commands' },
  { forge: 'gitea', dir: 'plugins/kaola-workflow-gitea/commands' },
];
const SKILL_EDITIONS = [
  { forge: 'github', dir: 'plugins/kaola-workflow/skills' },
  { forge: 'gitlab', dir: 'plugins/kaola-workflow-gitlab/skills' },
  { forge: 'gitea', dir: 'plugins/kaola-workflow-gitea/skills' },
];

// Topic config — the whole command surface, three topics. `next` and `init` are
// ASYMMETRIC (command basenames workflow-next / workflow-init vs skill
// basenames kaola-workflow-next / kaola-workflow-init); finalize is symmetric.
const TOPICS = {
  next: {
    skeleton: 'next.skeleton.md',
    command_basename: 'workflow-next',
    skill_basename: 'kaola-workflow-next',
  },
  init: {
    skeleton: 'init.skeleton.md',
    command_basename: 'workflow-init',
    skill_basename: 'kaola-workflow-init',
  },
  finalize: {
    skeleton: 'finalize.skeleton.md',
    command_basename: 'kaola-workflow-finalize',
    skill_basename: 'kaola-workflow-finalize',
  },
};

// deriveSurfacePath — compute the surface path exactly as the reachability
// checker derives it (single source): command -> `${dir}/${base}.md`,
// skill -> `${dir}/${base}/SKILL.md`.
function deriveSurfacePath(surface_type, dir, base) {
  return surface_type === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`;
}

// GENERATED_SURFACES — the 18 registry rows { topic, surface_type, forge, path,
// skeleton }. path is COMPUTED, never hand-typed.
const GENERATED_SURFACES = (() => {
  const rows = [];
  for (const [topic, cfg] of Object.entries(TOPICS)) {
    for (const ed of COMMAND_EDITIONS) {
      rows.push({
        topic,
        surface_type: 'command',
        forge: ed.forge,
        path: deriveSurfacePath('command', ed.dir, cfg.command_basename),
        skeleton: cfg.skeleton,
      });
    }
    for (const ed of SKILL_EDITIONS) {
      rows.push({
        topic,
        surface_type: 'skill',
        forge: ed.forge,
        path: deriveSurfacePath('skill', ed.dir, cfg.skill_basename),
        skeleton: cfg.skeleton,
      });
    }
  }
  return rows;
})();

// FORGES — the forge axis, DERIVED from the edition tables rather than restated,
// so a forge can never exist for commands but not skills (or vice versa).
const FORGES = (() => {
  const cmd = COMMAND_EDITIONS.map(e => e.forge);
  const skill = SKILL_EDITIONS.map(e => e.forge);
  if (cmd.join(',') !== skill.join(',')) {
    throw new Error(`forge axis disagrees: commands=[${cmd}] skills=[${skill}]`);
  }
  return Object.freeze(cmd.slice());
})();

// commandSurfacesForForge — the command-surface rows for ONE forge, in topic
// order. This is the forge axis as a CONSUMABLE api: a downstream runtime
// edition (opencode / Kimi Code) renders its own tree FROM these rows instead of
// reading a hardcoded `commands/` directory, so its forge variants are generated
// from the same registry that renders the committed surfaces — never hand-ported.
// Rows are the same objects `--check` byte-compares, so a topic added here
// reaches every runtime without a second registration.
function commandSurfacesForForge(forge) {
  if (!FORGES.includes(forge)) {
    throw new Error(`unknown forge "${forge}" (expected one of ${FORGES.join('/')})`);
  }
  return GENERATED_SURFACES.filter(r => r.surface_type === 'command' && r.forge === forge);
}

// ---------------------------------------------------------------------------
// Render engine (pure — no fs). renderSkeleton(skeletonText, ctx, ir) -> string
// where ctx = { surface_type, forge } and ir = { slots, splices }.
// ---------------------------------------------------------------------------
const RE_SLOT = /^<!--\s*SLOT:([A-Za-z0-9_-]+)\s*-->$/;
const RE_SPLICE = /^<!--\s*SPLICE:([A-Za-z0-9_-]+)\s*-->$/;
// The optional ` — why` tail is anchored on the em dash so a typo in the
// condition cannot be silently swallowed as prose: a directive that fails this
// match is emitted as literal text and its `<!-- /REGION -->` then throws
// 'unmatched /REGION', which is the loud failure a mistyped tag deserves.
const RE_REGION_OPEN = /^<!--\s*REGION:([A-Za-z0-9_+,-]+)(?:\s+—\s+.*?)?\s*-->$/;
const RE_REGION_CLOSE = /^<!--\s*\/REGION\s*-->$/;

// condMatches — a ','-joined OR of '+'-joined ANDs; each tag matches
// surface_type or forge. `command+github` is one AND clause; `gitlab,gitea` is
// a two-clause OR, which is how a body shared by several (but not all) forges
// is stored ONCE instead of copied per forge.
function condMatches(cond, ctx) {
  return cond.split(',').some(clause =>
    clause.split('+').every(tag => tag === ctx.surface_type || tag === ctx.forge));
}

// resolveKeyed — descend a slot/splice value by surface_type then forge until a
// string is reached. Throws on an unresolvable key (a structural authoring bug
// the self-test and --check surface immediately).
function resolveKeyed(value, ctx, kind, name) {
  if (value === undefined) throw new Error(`${kind}:${name} is not defined`);
  let v = value;
  while (v && typeof v === 'object' && !Array.isArray(v)) {
    if (Object.prototype.hasOwnProperty.call(v, ctx.surface_type)) v = v[ctx.surface_type];
    else if (Object.prototype.hasOwnProperty.call(v, ctx.forge)) v = v[ctx.forge];
    else throw new Error(`${kind}:${name} has no branch for surface_type=${ctx.surface_type} forge=${ctx.forge}`);
  }
  if (typeof v !== 'string') throw new Error(`${kind}:${name} did not resolve to a string`);
  return v;
}

// extractRegion — given the REGION open at lines[i], return the body lines
// (between open and its matching close, honoring nesting) and the index just
// past the close.
function extractRegion(lines, i) {
  let depth = 1;
  const body = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (RE_REGION_OPEN.test(l.trim())) depth++;
    else if (RE_REGION_CLOSE.test(l.trim())) {
      depth--;
      if (depth === 0) break;
    }
    body.push(l);
  }
  if (depth !== 0) throw new Error('unterminated REGION');
  return { body, next: j + 1 };
}

function renderLines(lines, ctx, ir, out) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const open = trimmed.match(RE_REGION_OPEN);
    if (open) {
      const { body, next } = extractRegion(lines, i);
      if (condMatches(open[1], ctx)) renderLines(body, ctx, ir, out);
      i = next;
      continue;
    }
    if (RE_REGION_CLOSE.test(trimmed)) {
      throw new Error('unmatched /REGION');
    }
    const slot = trimmed.match(RE_SLOT);
    if (slot) {
      out.push(resolveKeyed(ir.slots[slot[1]], ctx, 'SLOT', slot[1]));
      i++;
      continue;
    }
    const splice = trimmed.match(RE_SPLICE);
    if (splice) {
      out.push(resolveKeyed(ir.splices[splice[1]], ctx, 'SPLICE', splice[1]));
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
}

function renderSkeleton(skeletonText, ctx, ir) {
  const lines = skeletonText.split('\n');
  const out = [];
  renderLines(lines, ctx, ir, out);
  return applyRenames(out.join('\n'), ctx.forge);
}

// ---------------------------------------------------------------------------
// Surface rendering over the real template tree.
// ---------------------------------------------------------------------------

// SKELETON_MISSING — typed failure code for "the canonical source for a topic
// is not on disk". A skeleton is a TRACKED SOURCE FILE, not a build artifact:
// the surfaces it renders are committed, so a skeleton that was authored but
// never staged leaves a tree that renders fine for its author and fails for
// everyone else. That is the case this code names explicitly, because the raw
// ENOENT it replaces surfaced as an unhandled stack trace with no statement of
// what was missing or what to do about it.
const SKELETON_MISSING = 'skeleton_missing';

function loadSkeleton(skeletonFile, topic) {
  const abs = path.join(TEMPLATE_DIR, skeletonFile);
  if (!fs.existsSync(abs)) {
    const rel = path.relative(REPO, abs);
    const owner = topic ? `topic '${topic}'` : 'a registered topic';
    const surfaces = GENERATED_SURFACES.filter(r => r.skeleton === skeletonFile);
    const err = new Error(
      `MISSING SKELETON: ${rel}\n` +
      `  ${owner} renders ${surfaces.length} surface(s) from this file and cannot render without it:\n` +
      surfaces.map(r => `    ${r.path}`).join('\n') + '\n' +
      `  A skeleton is a tracked source file, not a generated artifact. If it is present in your\n` +
      `  working tree but missing here, you are running against a different checkout; if it is\n` +
      `  absent everywhere it was authored but never staged. Stage it with:\n` +
      `      git add ${rel}`);
    err.code = SKELETON_MISSING;
    throw err;
  }
  return fs.readFileSync(abs, 'utf8');
}

// reportTypedFailure — print a typed failure legibly (no stack) and return
// true, so every entry point fails the same readable way. Anything untyped is
// left to rethrow: an unexpected bug SHOULD keep its stack trace.
function reportTypedFailure(e) {
  if (!e || e.code !== SKELETON_MISSING) return false;
  console.error(e.message);
  return true;
}

function renderSurface(row, ir) {
  const skeletonText = loadSkeleton(row.skeleton, row.topic);
  return renderSkeleton(skeletonText, { surface_type: row.surface_type, forge: row.forge }, ir);
}

// minimalDiff — the first differing lines (0-based index -> 1-based label),
// bounded, so --check output stays readable during reverse-engineering.
function minimalDiff(committed, rendered, limit = 40) {
  const e = committed.split('\n');
  const a = rendered.split('\n');
  const max = Math.max(e.length, a.length);
  const out = [];
  let shown = 0;
  for (let idx = 0; idx < max && shown < limit; idx++) {
    if (e[idx] !== a[idx]) {
      out.push(`    L${idx + 1}:`);
      out.push(`      committed: ${JSON.stringify(e[idx])}`);
      out.push(`      rendered:  ${JSON.stringify(a[idx])}`);
      shown++;
    }
  }
  if (e.length !== a.length) out.push(`    (line count committed=${e.length} rendered=${a.length})`);
  return out.join('\n');
}

function cmdCheck(ir) {
  let mismatches = 0;
  for (const row of GENERATED_SURFACES) {
    const abs = path.join(REPO, row.path);
    if (!fs.existsSync(abs)) {
      console.error(`MISSING: ${row.path} (${row.topic}/${row.surface_type}/${row.forge})`);
      mismatches++;
      continue;
    }
    const committed = fs.readFileSync(abs, 'utf8');
    const rendered = renderSurface(row, ir);
    if (committed !== rendered) {
      console.error(`DRIFT: ${row.path} (${row.topic}/${row.surface_type}/${row.forge})`);
      console.error(minimalDiff(committed, rendered));
      mismatches++;
    }
  }
  if (mismatches > 0) {
    console.error(`\ngenerate-routing-surfaces --check: ${mismatches} surface(s) drifted from the skeleton.`);
    process.exit(1);
  }
  console.log(`generate-routing-surfaces --check: all ${GENERATED_SURFACES.length} surfaces byte-match the skeleton.`);
}

function cmdWrite(ir) {
  for (const row of GENERATED_SURFACES) {
    const abs = path.join(REPO, row.path);
    const rendered = renderSurface(row, ir);
    fs.writeFileSync(abs, rendered);
  }
  console.log(`generate-routing-surfaces --write: rendered ${GENERATED_SURFACES.length} surfaces.`);
}

function main() {
  const arg = process.argv[2] || '--check';
  const ir = { slots: SLOTS, splices: SPLICES };
  try {
    if (arg === '--write') return cmdWrite(ir);
    if (arg === '--check') return cmdCheck(ir);
  } catch (e) {
    if (reportTypedFailure(e)) process.exit(1);
    throw e;
  }
  console.error(`usage: generate-routing-surfaces.js [--check|--write]`);
  process.exit(2);
}

if (require.main === module) main();

module.exports = {
  GENERATED_SURFACES,
  renderSkeleton,
  condMatches,
  resolveKeyed,
  loadSkeleton,
  reportTypedFailure,
  SKELETON_MISSING,
  TOPICS,
  COMMAND_EDITIONS,
  SKILL_EDITIONS,
  FORGES,
  commandSurfacesForForge,
};
