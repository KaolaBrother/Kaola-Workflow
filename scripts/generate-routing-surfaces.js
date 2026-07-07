#!/usr/bin/env node
'use strict';

// generate-routing-surfaces.js — the routing-surface render engine + CLI.
//
// Regenerates the 12 template-shaped surfaces (plan-run x6 + next x6) from one
// canonical skeleton per topic. A skeleton is the UNION structure of a topic's
// command + skill surfaces, annotated with directives on their own comment
// lines:
//
//   <!-- SLOT:name -->            replaced by slot data resolved for the render
//                                 context (surface_type x forge)
//   <!-- SPLICE:name -->          replaced by a mid-paragraph variant resolved
//                                 for the render context
//   <!-- REGION:cond -->          keep the body only when cond matches the
//   ...body...                    context (a '+'-joined AND of surface_type /
//   <!-- /REGION -->              forge tags), else drop the whole region
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
const schema = require('./kaola-workflow-adaptive-schema.js');
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');

const REPO = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(REPO, 'templates', 'routing');
const stripSlash = c => String(c).replace(/^\//, '');

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

// Topic config. Basenames derive from the schema registry (the same anchor the
// T1/T2 emitted-target set uses) for plan-run; next is ASYMMETRIC (command
// basename workflow-next vs skill basename kaola-workflow-next).
const TOPICS = {
  'plan-run': {
    skeleton: 'plan-run.skeleton.md',
    command_basename: stripSlash(schema.PLAN_RUN_COMMAND),
    skill_basename: schema.PLAN_RUN_SKILL,
  },
  next: {
    skeleton: 'next.skeleton.md',
    command_basename: 'workflow-next',
    skill_basename: 'kaola-workflow-next',
  },
};

// deriveSurfacePath — compute the surface path exactly as the reachability
// checker derives it (single source): command -> `${dir}/${base}.md`,
// skill -> `${dir}/${base}/SKILL.md`.
function deriveSurfacePath(surface_type, dir, base) {
  return surface_type === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`;
}

// GENERATED_SURFACES — the 12 registry rows { topic, surface_type, forge, path,
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

// ---------------------------------------------------------------------------
// Render engine (pure — no fs). renderSkeleton(skeletonText, ctx, ir) -> string
// where ctx = { surface_type, forge } and ir = { slots, splices }.
// ---------------------------------------------------------------------------
const RE_SLOT = /^<!--\s*SLOT:([A-Za-z0-9_-]+)\s*-->$/;
const RE_SPLICE = /^<!--\s*SPLICE:([A-Za-z0-9_-]+)\s*-->$/;
const RE_REGION_OPEN = /^<!--\s*REGION:([A-Za-z0-9_+-]+)\s*-->$/;
const RE_REGION_CLOSE = /^<!--\s*\/REGION\s*-->$/;

// condMatches — a '+'-joined AND of tags; each tag matches surface_type or forge.
function condMatches(cond, ctx) {
  return cond.split('+').every(tag => tag === ctx.surface_type || tag === ctx.forge);
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
function loadSkeleton(skeletonFile) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, skeletonFile), 'utf8');
}

function renderSurface(row, ir) {
  const skeletonText = loadSkeleton(row.skeleton);
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
  if (arg === '--write') return cmdWrite(ir);
  if (arg === '--check') return cmdCheck(ir);
  console.error(`usage: generate-routing-surfaces.js [--check|--write]`);
  process.exit(2);
}

if (require.main === module) main();

module.exports = {
  GENERATED_SURFACES,
  renderSkeleton,
  condMatches,
  resolveKeyed,
  TOPICS,
  COMMAND_EDITIONS,
  SKILL_EDITIONS,
};
