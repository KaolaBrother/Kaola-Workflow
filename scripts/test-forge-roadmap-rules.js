#!/usr/bin/env node
'use strict';

// test-forge-roadmap-rules.js — the `## Rules` block a roadmap mirror carries, per edition, and
// whether the `workflow-init` surface that tells a consumer what that file looks like agrees.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// The four `RULES_BLOCK` constants are HAND-PORTED prose. `validate-script-sync.js` covers the
// roadmap forge ports only as a `module.exports` SUPERSET family (the `forge roadmap
// module.exports superset` entry), and a superset check over export KEYS cannot witness the VALUE
// of a template literal. So no guard in the tree reads this prose, and the two forge blocks say
// something different from canonical without that ever having been a decision: `git log -S` over
// both forge port paths finds zero commits touching the canonical sentences, so the divergence is
// ORIGINAL — the sentences were never there to drift away.
//
// The three groups answer three different questions, and each one is driven, not string-matched
// against the source: every generator assertion below runs the edition's own `regenerateRoadmap`
// into a temp root and reads the file it actually wrote.
//
// A — CONVERGENCE. The bullets that are not forge-specific must be one wording across all four
//     editions. This is the "one rule, one wording" rule applied to a rule the roadmap states.
//
// B — DIVERGENCE STAYS DECLARED. The converse pin, so "make them identical" cannot be the fix:
//     no edition may name a forge other than its own, and GitLab's `iid` — the one genuine
//     capability difference here — must stay GitLab's alone.
//
// C — PLACEMENT. "issues are the source of truth when available" exists on every edition, but
//     canonical states it in the HEADER and the two forge ports state it as a Rules BULLET. One
//     statement in two structural positions is the same defect as one statement in two wordings,
//     and neither the bullet compare in A nor the surface compare in D can see it — so it is
//     asserted as a position, equal across all four editions and equal to the surface.
//
// D — SURFACE ⇄ GENERATOR. The half the issue says nothing detects. `templates/routing/slots.js`
//     slot `in-shared-004` renders roadmap Rules bullets into all six `workflow-init` surfaces,
//     including gitlab's and gitea's. So on those forges the prose a consumer reads and the file
//     that forge's own `roadmap.js generate` writes disagree about what the roadmap says. Both
//     sides are driven here: the surfaces are read from the committed (generated) files, the
//     generator side from a real run.
//
// Non-vacuity is mechanical, never a claim in a comment:
//   * every list compare is preceded by a COUNT guard, so an extractor that silently matched
//     nothing cannot pass as `[] === []`;
//   * the surface's fenced ROADMAP template block and its `## Rules` section must be FOUND, not
//     merely agree once found;
//   * B2 asserts the forge-noun normalizer actually erased something, so a normalizer that
//     matched nothing cannot green A and D by making every string equal to itself;
//   * D2 compares the command surface against the skill surface of the SAME forge, which is the
//     positive control on the command-token normalization: if `<NEXT>` swallowed more than the
//     three command renderings, that pair would still differ.
//
// Usage
//   node scripts/test-forge-roadmap-rules.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// ---------------------------------------------------------------------------------------------
// The editions. `module` is the generator whose OUTPUT is read — never its source text.
// ---------------------------------------------------------------------------------------------
const EDITIONS = Object.freeze([
  { key: 'canonical', label: 'claude/canonical', forge: 'github', noun: 'GitHub',
    module: 'scripts/kaola-workflow-roadmap.js' },
  { key: 'codex', label: 'codex', forge: 'github', noun: 'GitHub',
    module: 'plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js' },
  { key: 'gitlab', label: 'gitlab', forge: 'gitlab', noun: 'GitLab',
    module: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js' },
  { key: 'gitea', label: 'gitea', forge: 'gitea', noun: 'Gitea',
    module: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js' },
]);

// ---------------------------------------------------------------------------------------------
// DECLARED DIVERGENCES — the named regions. "One rule, one wording" allows divergence only where
// capabilities genuinely differ AND the difference is declared; these two are the declaration.
// Anything not matched here is a SHARED bullet and must converge.
//
// A bullet reworded past its predicate falls back into the shared partition and reds. That is
// deliberate: retiring or rewording a declared divergence is a decision, not a refactor, and it
// belongs back with whoever holds this file.
// ---------------------------------------------------------------------------------------------
const DECLARED_DIVERGENCES = Object.freeze([
  {
    name: 'issue-number-mapping',
    match: /maps to workflow issue number/i,
    why: 'GitLab exposes both a global `id` and a per-project `iid`, so WHICH number a consumer '
      + 'types is genuinely forge-dependent. GitHub and Gitea have one number and say nothing.',
  },
  {
    name: 'source-of-truth',
    match: /source of truth/i,
    why: 'NOT a content divergence — every edition states it. It is excluded from the bullet '
      + 'compare only because group C asserts its structural POSITION instead, so one defect is '
      + 'not reported three times.',
  },
]);

const isDeclared = b => DECLARED_DIVERGENCES.some(d => d.match.test(b));
const sharedOnly = list => list.filter(b => !isDeclared(b));

// ---------------------------------------------------------------------------------------------
// Normalization — the two axes on which a difference is a RENDERING, not a disagreement.
// ---------------------------------------------------------------------------------------------
const FORGE_NOUN_RE = /GitHub|GitLab|Gitea/g;
// A command surface renders `/workflow-next`, a skill surface renders `kaola-workflow-next`, and
// a repo file that any runtime may read must name neither — canonical's generator writes the bare
// `workflow-next`. Three renderings of one referent.
const NEXT_CMD_RE = /`\/?(?:kaola-)?workflow-next`/g;

const collapse = s => String(s).replace(/\s+/g, ' ').trim();
const normalize = s => collapse(s).replace(NEXT_CMD_RE, '`<NEXT>`').replace(FORGE_NOUN_RE, '<FORGE>');

/** The `## Rules` section body of a roadmap document, or null when there is no such heading. */
function rulesSection(text) {
  const m = /^## Rules[ \t]*$/m.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^#{1,6} /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Everything ABOVE `## Active Work` — the header region, where canonical states source-of-truth. */
function headerSection(text) {
  const i = text.indexOf('\n## Active Work');
  return i < 0 ? text : text.slice(0, i);
}

/** Top-level bullets of a section, continuation lines folded in, whitespace collapsed. */
function bullets(section) {
  const out = [];
  for (const line of String(section).split('\n')) {
    if (/^- /.test(line)) out.push(line.slice(2));
    else if (line.trim() === '') continue;
    else if (out.length > 0 && /^\s+\S/.test(line)) out[out.length - 1] += ' ' + line.trim();
    else break;
  }
  return out.map(collapse);
}

function diffReport(aLabel, a, bLabel, b) {
  const only = (x, y) => x.filter(v => !y.includes(v));
  return '\n  ' + aLabel + ' (' + a.length + '):\n' + a.map(v => '    - ' + v).join('\n')
    + '\n  ' + bLabel + ' (' + b.length + '):\n' + b.map(v => '    - ' + v).join('\n')
    + '\n  only in ' + aLabel + ': ' + JSON.stringify(only(a, b))
    + '\n  only in ' + bLabel + ': ' + JSON.stringify(only(b, a));
}

// =============================================================================================
// Drive each generator: a real `regenerateRoadmap` into a throwaway root, then read what it wrote.
// =============================================================================================
function generate(ed) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw918-' + ed.key + '-')));
  try {
    // An empty-but-PRESENT `.roadmap/` is the sanctioned no-active-work state; the mirror is
    // written cleanly and the Rules block is emitted in full, which is all this file reads.
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const mod = require(path.join(repoRoot, ed.module));
    const outcome = mod.regenerateRoadmap(root);
    const file = path.join(root, 'kaola-workflow', 'ROADMAP.md');
    return { outcome, text: fs.readFileSync(file, 'utf8') };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const generated = new Map();
for (const ed of EDITIONS) {
  const g = generate(ed);
  assert(g.outcome === 'generated',
    'drive[' + ed.label + '] regenerateRoadmap must report "generated" on a fresh root, got '
      + JSON.stringify(g.outcome));
  generated.set(ed.key, g.text);
}

// =============================================================================================
// A — CONVERGENCE: the shared bullets are one wording across all four editions
// =============================================================================================
assert(generated.get('canonical') === generated.get('codex'),
  'A: canonical and codex generate different roadmap bodies — the Codex copy has drifted from '
    + 'scripts/kaola-workflow-roadmap.js');

const genBullets = new Map();
for (const ed of EDITIONS) {
  const section = rulesSection(generated.get(ed.key));
  assert(section !== null,
    'A[' + ed.label + '] the generated roadmap must carry a "## Rules" section — the extractor '
      + 'found no such heading, so nothing below is reading anything');
  const raw = section === null ? [] : bullets(section);
  assert(raw.length >= 4,
    'A[' + ed.label + '] the Rules extractor yielded ' + raw.length + ' bullet(s) — it is not '
      + 'reading the block; section was:\n' + section);
  const shared = sharedOnly(raw.map(normalize));
  assert(shared.length >= 2,
    'A[' + ed.label + '] every Rules bullet was absorbed by a declared divergence, leaving '
      + shared.length + ' shared bullet(s) — the partition below would compare nothing; raw: '
      + JSON.stringify(raw));
  genBullets.set(ed.key, shared);
}

// Ordered, not set-compared: a rule stated in a different ORDER on one edition is still the same
// rule stated two ways, and a set compare cannot see it.
const base = EDITIONS[0];
for (const ed of EDITIONS.slice(1)) {
  const a = genBullets.get(base.key);
  const b = genBullets.get(ed.key);
  assert(JSON.stringify(a) === JSON.stringify(b),
    'A: the shared Rules bullets must be ONE wording across every edition — ' + ed.label
      + ' disagrees with ' + base.label + '. Forge nouns and the three `workflow-next` renderings '
      + 'are already normalized away, so what is left is a real difference in what the roadmap '
      + 'says.' + diffReport(base.label, a, ed.label, b));
}

console.log('A: shared roadmap Rules bullets converge across the four editions: done');

// =============================================================================================
// B — DIVERGENCE STAYS DECLARED: "make them identical" must not be the fix
// =============================================================================================
for (const ed of EDITIONS) {
  const rawSection = rulesSection(generated.get(ed.key)) || '';
  const foreign = (rawSection.match(FORGE_NOUN_RE) || []).filter(n => n !== ed.noun);
  assert(foreign.length === 0,
    'B[' + ed.label + '] the Rules block names a forge this edition does not run on: '
      + JSON.stringify([...new Set(foreign)]) + ' — converging the shared bullets must not carry '
      + 'one forge\'s vocabulary onto another');

  // The normalizer is real, and proven so on the same text A compares: after substitution no
  // forge noun survives. A normalizer that matched nothing would green A by making every string
  // trivially equal, and this is what stops that.
  const normalizedSection = rawSection.replace(FORGE_NOUN_RE, '<FORGE>');
  assert(!FORGE_NOUN_RE.test(normalizedSection),
    'B[' + ed.label + '] a forge noun survived normalization — the substitution in `normalize` is '
      + 'not covering what the Rules block actually says:\n' + normalizedSection);
  FORGE_NOUN_RE.lastIndex = 0;
}

// GitLab's `iid` is the one genuine capability difference in this block. It stays GitLab's: not
// erased by convergence, and not copied outward.
for (const ed of EDITIONS) {
  const hasIid = /`iid`/.test(rulesSection(generated.get(ed.key)) || '');
  if (ed.key === 'gitlab') {
    assert(hasIid,
      'B[gitlab] the Rules block must still tell a consumer that the per-project `iid` is the '
        + 'number the workflow uses — GitLab is the only forge where that is ambiguous, and this '
        + 'bullet is the only place it is said. Dropping it is a decision, not a convergence.');
  } else {
    assert(!hasIid,
      'B[' + ed.label + '] the Rules block names GitLab\'s `iid`, which does not exist on this '
        + 'forge');
  }
}

console.log('B: forge-specific roadmap prose stays forge-specific: done');

// =============================================================================================
// C — PLACEMENT: "issues are the source of truth" sits in ONE structural position, everywhere
// =============================================================================================
const SOURCE_OF_TRUTH = /source of truth/i;

/** 'header' | 'rule' | 'both' | 'absent' — where a roadmap document states source-of-truth. */
function sourceOfTruthPlacement(text) {
  const inHeader = SOURCE_OF_TRUTH.test(headerSection(text));
  const inRules = SOURCE_OF_TRUTH.test(rulesSection(text) || '');
  if (inHeader && inRules) return 'both';
  if (inHeader) return 'header';
  if (inRules) return 'rule';
  return 'absent';
}

const placements = new Map(EDITIONS.map(ed => [ed.key, sourceOfTruthPlacement(generated.get(ed.key))]));
for (const ed of EDITIONS) {
  const p = placements.get(ed.key);
  assert(p !== 'absent',
    'C[' + ed.label + '] the generated roadmap states nowhere that issues are the source of truth '
      + '— the statement must survive whichever position it converges on');
  assert(p !== 'both',
    'C[' + ed.label + '] the generated roadmap states source-of-truth in BOTH the header and the '
      + 'Rules block — one statement, one place');
}
const basePlacement = placements.get(base.key);
for (const ed of EDITIONS.slice(1)) {
  assert(placements.get(ed.key) === basePlacement,
    'C: source-of-truth must sit in the SAME structural position on every edition — ' + base.label
      + ' states it in the ' + basePlacement + ' and ' + ed.label + ' states it in the '
      + placements.get(ed.key) + '. Either position can be the converged one; two cannot.');
}

console.log('C: the source-of-truth statement has one structural position: done');

// =============================================================================================
// D — SURFACE ⇄ GENERATOR: what `workflow-init` shows a consumer, against what generate writes
// =============================================================================================
const { GENERATED_SURFACES } = require('./generate-routing-surfaces.js');
const INIT_SURFACES = GENERATED_SURFACES.filter(r => r.topic === 'init');
assert(INIT_SURFACES.length === 6,
  'D: expected 6 rendered `workflow-init` surfaces (command+skill x 3 forges) from the routing '
    + 'registry, found ' + INIT_SURFACES.length + ' — this file is reading the wrong registry');

const ROADMAP_HEADING = '### `kaola-workflow/ROADMAP.md`';

/** The fenced ROADMAP.md template body a `workflow-init` surface shows the consumer. */
function roadmapTemplateBlock(surfaceText) {
  const at = surfaceText.indexOf(ROADMAP_HEADING);
  if (at < 0) return null;
  const rest = surfaceText.slice(at);
  const open = rest.indexOf('```markdown\n');
  if (open < 0) return null;
  const body = rest.slice(open + '```markdown\n'.length);
  const close = body.indexOf('\n```');
  return close < 0 ? null : body.slice(0, close);
}

const surfaceBullets = new Map();
for (const s of INIT_SURFACES) {
  const full = path.join(repoRoot, s.path);
  assert(fs.existsSync(full), 'D[' + s.path + '] rendered surface is missing');
  if (!fs.existsSync(full)) continue;

  const block = roadmapTemplateBlock(fs.readFileSync(full, 'utf8'));
  assert(block !== null,
    'D[' + s.path + '] no fenced ROADMAP.md template block found under "' + ROADMAP_HEADING
      + '" — the extractor is reading nothing');
  if (block === null) continue;

  const section = rulesSection(block);
  assert(section !== null,
    'D[' + s.path + '] the ROADMAP.md template block carries no "## Rules" section');
  const raw = section === null ? [] : bullets(section);
  assert(raw.length >= 4,
    'D[' + s.path + '] the surface Rules extractor yielded ' + raw.length + ' bullet(s) — it is '
      + 'not reading the block; section was:\n' + section);
  surfaceBullets.set(s.path, { row: s, raw, shared: sharedOnly(raw.map(normalize)), block });
}

// D2 — the control on the command-token normalization. The command and skill renderings of one
// forge differ ONLY in how they name `workflow-next`; after normalization they must be identical.
// If `<NEXT>` were over-broad it would erase a real difference here too, and this compare — of two
// texts that genuinely differ before normalization — is what would still catch it.
for (const forge of ['github', 'gitlab', 'gitea']) {
  const rows = INIT_SURFACES.filter(r => r.forge === forge).map(r => surfaceBullets.get(r.path));
  if (rows.length !== 2 || rows.some(r => !r)) {
    assert(false, 'D2[' + forge + '] expected a command and a skill surface, got ' + rows.length);
    continue;
  }
  const [a, b] = rows;
  assert(a.block !== b.block,
    'D2[' + forge + '] the command and skill ROADMAP blocks are byte-identical, so this control '
      + 'proves nothing about the command-token normalization — re-derive it');
  assert(JSON.stringify(a.shared) === JSON.stringify(b.shared),
    'D2[' + forge + '] the command and skill surfaces state different roadmap Rules once the '
      + 'command rendering is normalized away'
      + diffReport(a.row.path, a.shared, b.row.path, b.shared));
}

// D3 — the pin the issue says nothing currently detects.
for (const ed of EDITIONS) {
  for (const s of INIT_SURFACES.filter(r => r.forge === ed.forge)) {
    const sb = surfaceBullets.get(s.path);
    if (!sb) continue;
    const g = genBullets.get(ed.key);
    assert(JSON.stringify(g) === JSON.stringify(sb.shared),
      'D3[' + ed.label + '] the roadmap body `' + s.path + '` shows a consumer and the body '
        + ed.module + ' actually writes state different rules. A consumer follows the surface to '
        + 'create the file and the generator then overwrites it with something else.'
        + diffReport('generator:' + ed.label, g, 'surface:' + s.path, sb.shared));

    const sp = sourceOfTruthPlacement(sb.block);
    assert(sp === placements.get(ed.key),
      'D3[' + ed.label + '] `' + s.path + '` states source-of-truth in the ' + sp + ' while '
        + ed.module + ' states it in the ' + placements.get(ed.key) + ' — the surface and the '
        + 'generator must agree on where the roadmap says it');
  }
}

console.log('D: rendered workflow-init roadmap prose agrees with each generator: done');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
