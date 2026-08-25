#!/usr/bin/env node
'use strict';
// Child processes in this file are classified per site (ADR 0013). The ratchet
// reads the spawn line or the line above it. Two classes appear here:
//   environment    installer / --write materialize / TREE_ROOT git probe
//   cli-contract   --check / --help / unknown --forge refuse / --print-tree-root

// ---------------------------------------------------------------------------
// test-zcode-edition.js — structural + parity validator for the ZCode runtime
// edition. Hand-rolled asserts (no framework). Mirror of
// test-cursor-edition.js / test-grok-edition.js, scoped to the additive zcode
// surface. Run directly:
//   node scripts/test-zcode-edition.js
//
// ZCode (measured against ZCode 3.9.1) is a coding-agent RUNTIME, not a forge,
// and it does not ride install.sh / edition-sync.js / npm test. It is delivered
// the ZCode-native way: named agents under `.zcode/agents/<role>.md` (Agent
// dispatch types), flat commands under `.zcode/commands/<name>.md`, a merged
// `.zcode/config.json` (hooks object, seven events, no SubagentStart), and
// support scripts/hooks under `.zcode/kaola-workflow/{scripts,hooks}`.
//
// ZCode discovers subagents ONLY at user scope (~/.zcode/agents), so the
// installer syncs the staged `.zcode/agents/` roster to the user home as well.
//
// Frontmatter pins (measured on ZCode 3.9.1): every agent carries
// `model: GLM-5.3` plus exactly ONE `thoughtLevel:` pinned by its canonical
// tier — standard → high, reasoning → max, heavy (fable) → max. The frontmatter
// key is `thoughtLevel`, NOT `reasoningEffort`/`effort`.
//
// Outside `npm test`, the forge chains, and the fast gate: an additive
// runtime edition is not a forge. The script exists so the suite is
// runnable and discoverable by name rather than only by remembering the path.
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const forgeLayout = require('./runtime-edition-forge.js');
const reviewerGenerator = require('./generate-reviewer-profiles.js');

const REPO = path.resolve(__dirname, '..');
const SYNC_JS = path.join(REPO, 'scripts', 'sync-zcode-edition.js');
const INSTALLER = path.join(REPO, 'install-zcode.sh');
const DEFAULT_FORGE = 'github';

// The generator does not exist yet (TDD red): require it lazily and fail with
// a plain assert rather than a module-resolution throw, so the suite always
// parses, runs, and reports.
let syncMod = null;
let syncModError = '';
if (fs.existsSync(SYNC_JS)) {
  try { syncMod = require('./sync-zcode-edition.js'); } catch (e) { syncModError = String(e && e.message || e); }
} else {
  syncModError = 'scripts/sync-zcode-edition.js is not present';
}
// #975: a fixture root must not resolve against the CURRENT DIRECTORY.
// `os.tmpdir()` returns TMPDIR verbatim, so TMPDIR=. makes every root here
// relative and every fixture lands in the checkout. A relative TMPDIR is
// treated as unset — `/tmp` is what os.tmpdir() itself falls back to.
function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

// ---------------------------------------------------------------------------
// TREE_ROOT — the checkout the GENERATED tree lives in, which is NOT where the
// canonical sources are read from. Under a linked worktree the two differ.
// COMPUTED HERE RATHER THAN IMPORTED: this is a second, independent statement
// of where the tree belongs, and it is what keeps D1 able to fail.
// ---------------------------------------------------------------------------
const TREE_ROOT = (() => {
  // spawn-class: environment
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) return REPO;
  const common = String(r.stdout || '').trim();
  if (!common) return REPO;
  const abs = path.resolve(REPO, common);
  return path.basename(abs) === '.git' ? path.dirname(abs) : REPO;
})();

function treeLabel(forge) {
  return '.zcode' + forgeLayout.outSuffix(forge);
}

const TREE_LABELS = new Set(forgeLayout.FORGES.map(f => treeLabel(f)));
const rootOf = rel => (TREE_LABELS.has(String(rel).split(/[\\/]/)[0]) ? TREE_ROOT : REPO);
const read = rel => fs.readFileSync(path.join(rootOf(rel), rel), 'utf8');
const exists = rel => fs.existsSync(path.join(rootOf(rel), rel));
let passed = 0, failed = 0;
function assertReal(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}
// The early load guard above runs before assertReal is declared; re-issue it
// now against the real counter so the missing-generator failure is counted.
assertReal(typeof syncMod === 'object' && syncMod !== null,
  'G0: scripts/sync-zcode-edition.js loads as a module — ' + syncModError);

function runGenerator(args) {
  // spawn-class: environment
  return spawnSync(process.execPath, [SYNC_JS].concat(args), { encoding: 'utf8' });
}
function runGeneratorCli(args) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [SYNC_JS].concat(args), { encoding: 'utf8' });
}

function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: {}, raw: '', body: String(text) };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return { fm, raw: m[1], body: String(text).slice(m[0].length) };
}

function walkFiles(absDir, relDir) {
  const out = [];
  if (!fs.existsSync(absDir)) return out;
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? relDir + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walkFiles(path.join(absDir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const trackedAgents = () => fs.readdirSync(path.join(REPO, 'agents'))
  .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
const commandNamesFor = forge => forgeLayout.commandSources(forge)
  .map(s => s.basename.replace(/\.md$/, '')).sort();

// ---------------------------------------------------------------------------
// ZCODE_RUNTIME_NATIVE — the frontmatter thoughtLevel pin as a DECLARED
// table entry, not merely as prose. Deleting the declaration reds this suite.
// ---------------------------------------------------------------------------
const ZCODE_RUNTIME_NATIVE = Object.freeze({
  frontmatter_thought_level_pin:
    'ZCode generated agent frontmatter pins every agent to model: GLM-5.3 plus exactly one camelCase thoughtLevel: field set by canonical tier — standard high, reasoning max, heavy (fable) max. The key is thoughtLevel, NOT reasoningEffort/effort.',
});

// The canonical model tokens are the existing portable class markers. Derive
// each expected ZCode binding from agents/*.md so a role addition or tier move
// is judged by the canonical frontmatter itself.
const ZCODE_MODEL_CLASS_TIERS = Object.freeze({
  sonnet: Object.freeze({ tier: 'standard', model: 'GLM-5.3', thoughtLevel: 'high' }),
  standard: Object.freeze({ tier: 'standard', model: 'GLM-5.3', thoughtLevel: 'high' }),
  opus: Object.freeze({ tier: 'reasoning', model: 'GLM-5.3', thoughtLevel: 'max' }),
  reasoning: Object.freeze({ tier: 'reasoning', model: 'GLM-5.3', thoughtLevel: 'max' }),
  fable: Object.freeze({ tier: 'heavy', model: 'GLM-5.3', thoughtLevel: 'max' }),
  heavy: Object.freeze({ tier: 'heavy', model: 'GLM-5.3', thoughtLevel: 'max' }),
});

// ZCode 3.9.1 hook events (measured). SubagentStart does NOT exist on ZCode.
const ZCODE_HOOK_EVENTS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'PostToolUseFailure', 'Stop',
]);

function canonicalAgentClass(name) {
  const { fm } = parseFrontmatter(read('agents/' + name + '.md'));
  const model = String(fm.model || '').trim().toLowerCase();
  const binding = ZCODE_MODEL_CLASS_TIERS[model];
  return binding
    ? { model, tier: binding.tier, pin: binding }
    : { model, tier: 'unknown', pin: null };
}

function canonicalRosters(names) {
  const rosters = { standard: [], reasoning: [], heavy: [], unknown: [] };
  for (const name of names) {
    const tier = canonicalAgentClass(name).tier;
    if (!rosters[tier]) rosters[tier] = [];
    rosters[tier].push(name);
  }
  for (const tier of Object.keys(rosters)) rosters[tier].sort();
  return rosters;
}

// ---------------------------------------------------------------------------
// B0 — additive boundary. zcode is a runtime, not a forge. Read the tree; do
// not modify those files. install-all.sh MUST name zcode (red until wired).
// ---------------------------------------------------------------------------
{
  const editionSyncSrc = fs.readFileSync(path.join(REPO, 'scripts', 'edition-sync.js'), 'utf8');
  const forgesDecl = editionSyncSrc.match(/const FORGES\s*=\s*\[([^\]]*)\]/);
  assertReal(!!forgesDecl, 'B0: edition-sync.js declares FORGES');
  const forges = forgesDecl
    ? forgesDecl[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
    : [];
  assertReal(!forges.includes('zcode'),
    'B0: edition-sync.js FORGES does not include zcode — got ' + JSON.stringify(forges));

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const npmTest = String((pkg.scripts && pkg.scripts.test) || '');
  assertReal(!npmTest.includes('test-zcode-edition.js'),
    'B0: package.json scripts.test does not invoke test-zcode-edition.js');

  const installSh = fs.readFileSync(path.join(REPO, 'install.sh'), 'utf8');
  assertReal(!/\bzcode\b/i.test(installSh),
    'B0: install.sh does not mention zcode as a runtime to install');

  const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
  assertReal(/\bzcode\b/.test(installAll) && installAll.includes('install-zcode.sh'),
    'B0: install-all.sh MUST name zcode and install-zcode.sh (additive runtime, not a forge gate)');
  {
    const runtimesDecl = installAll.match(/RUNTIMES=\(([^)]*)\)/);
    const runtimes = runtimesDecl
      ? runtimesDecl[1].split(/\s+/).map(s => s.trim()).filter(Boolean)
      : [];
    assertReal(runtimes.includes('zcode'),
      'B0: install-all.sh RUNTIMES array includes zcode — got ' + JSON.stringify(runtimes));
  }

  const installAllTestSrc = fs.readFileSync(path.join(REPO, 'scripts', 'test-install-all.js'), 'utf8');
  const rowRe = /\{\s*runtime:\s*'zcode'\s*,\s*file:\s*'install-zcode\.sh'\s*/;
  assertReal(rowRe.test(installAllTestSrc),
    'B0: scripts/test-install-all.js KNOWN_INSTALLERS carries a {runtime:\'zcode\', '
    + 'file:\'install-zcode.sh\'} row');
}

// ---------------------------------------------------------------------------
// B0-claim — claim help USAGE runtime enum ends with |zcode. The mirror copies
// under plugins/kaola-workflow*/scripts/ carry the same enum. cursor is
// intentionally absent there — that drift is NOT to be fixed here.
// ---------------------------------------------------------------------------
{
  const claimCopies = [
    path.join(REPO, 'scripts', 'kaola-workflow-claim.js'),
  ].concat((() => {
    const out = [];
    const pluginsDir = path.join(REPO, 'plugins');
    if (!fs.existsSync(pluginsDir)) return out;
    for (const p of fs.readdirSync(pluginsDir)) {
      if (!p.startsWith('kaola-workflow')) continue;
      const scripts = path.join(pluginsDir, p, 'scripts');
      if (!fs.existsSync(scripts)) continue;
      // The github mirror keeps the canonical basename; gitlab/gitea mirrors
      // carry the forge-ported basename (kaola-gitlab-workflow-claim.js, ...).
      for (const f of fs.readdirSync(scripts)) {
        if (/^kaola-(?:\w+-)?workflow-claim\.js$/.test(f)) out.push(path.join(scripts, f));
      }
    }
    return out;
  })());
  assertReal(claimCopies.length >= 1,
    'B0-claim: at least the root claim script exists to pin the USAGE enum');
  for (const abs of claimCopies) {
    const rel = path.relative(REPO, abs);
    const src = fs.readFileSync(abs, 'utf8');
    const usage = src.match(/--runtime claude\|codex\|opencode\|kimi\|grok(\|cursor)?\|?/);
    assertReal(src.includes('--runtime claude|codex|opencode|kimi|grok|zcode'),
      'B0-claim[' + rel + ']: USAGE runtime enum ends with |zcode '
      + '(--runtime claude|codex|opencode|kimi|grok|zcode)');
  }
}

// ---------------------------------------------------------------------------
// B0-wiring — the routing generator refreshes the zcode tree when present.
// ---------------------------------------------------------------------------
{
  const grsSrc = fs.readFileSync(path.join(REPO, 'scripts', 'generate-routing-surfaces.js'), 'utf8');
  const refreshDecl = grsSrc.match(/function refreshPresentEditionTrees\(\)\s*\{[\s\S]*?\n\}/);
  assertReal(!!refreshDecl, 'B0-wiring: generate-routing-surfaces.js declares refreshPresentEditionTrees');
  assertReal(!!refreshDecl && refreshDecl[0].includes('sync-zcode-edition.js'),
    'B0-wiring: refreshPresentEditionTrees includes sync-zcode-edition.js in its refresh list');
}

// ---------------------------------------------------------------------------
// D0 — DRIFT IS OBSERVED BEFORE IT IS REPAIRED.
//
// Self-provision below runs `sync --write`, which REPAIRS the generated tree.
// Run first, it destroys the only evidence that the tree on this disk had
// drifted from canonical. So --check runs HERE, ahead of the write, and
// reports what it found on disk. Drift EXITS rather than counting a failure:
// continuing would reach --write, repair the tree, and erase the finding.
//
// ABSENT IS A SKIP, AND THE SKIP IS LOUD. These trees are gitignored.
// ---------------------------------------------------------------------------
let driftVerdict = '';
const treeRootFor = forge => path.join(TREE_ROOT, treeLabel(forge));
const treeWhere = TREE_ROOT === REPO ? '' : ' [tree root: ' + TREE_ROOT + ', not this checkout]';
{
  const verified = [];
  const absent = [];
  assertReal(forgeLayout.FORGES.length > 0,
    'D0: the forge axis must be non-empty — an empty axis probes nothing and would skip in silence');
  assertReal(forgeLayout.FORGES.includes(DEFAULT_FORGE),
    'D0: the forge axis includes github (the default zcode tree label is .zcode)');
  for (const forge of forgeLayout.FORGES) {
    const label = treeLabel(forge);
    if (!fs.existsSync(treeRootFor(forge))) { absent.push(label); continue; }
    if (!fs.existsSync(SYNC_JS)) {
      console.error('zcode-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk but scripts/sync-zcode-edition.js is missing, so drift cannot be observed.');
      process.exit(1);
    }
    const r = runGeneratorCli(['--forge=' + forge, '--check']);
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\nzcode-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-zcode-edition.js --forge=' + forge + ' --write'
        + '\nThe suite stops here rather than continue into its own sync --write, which would repair '
        + 'this tree and erase the finding.');
      process.exit(1);
    }
    verified.push(label);
  }
  for (const label of verified) console.log('D0: ' + label + ' is present and in parity with canonical.' + treeWhere);
  for (const label of absent) {
    console.log('D0: SKIPPED — ' + label + ' is absent from disk, so nothing was compared '
      + '(gitignored generated tree; a fresh clone has none).' + treeWhere);
  }
  driftVerdict = ' [drift-check: '
    + (verified.length ? verified.length + ' tree(s) in parity (' + verified.join(', ') + ')'
                       : 'NO tree verified')
    + (absent.length ? '; ' + absent.length + ' ABSENT, not checked (' + absent.join(', ') + ')' : '')
    + ']' + treeWhere;
}

// ---------------------------------------------------------------------------
// Self-provision: regenerate .zcode/ from tracked canonical sources before any
// assertion that reads it. If the generator is missing, fail with a clear
// "generator not present" (the HEAD-red this suite is authored to produce).
// ---------------------------------------------------------------------------
{
  if (!fs.existsSync(SYNC_JS)) {
    console.error('FATAL: generator not present (scripts/sync-zcode-edition.js). '
      + 'The zcode edition suite cannot self-provision or judge a generated tree.');
    console.error('\nzcode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
      + driftVerdict);
    process.exit(1);
  }
  const r = runGenerator(['--write']);
  if (r.status !== 0) {
    console.error('FATAL: sync-zcode-edition --write failed (test cannot proceed):');
    console.error(r.stderr || r.stdout || '(no output)');
    process.exit(1);
  }
}

// D1 — D0's presence probe must be able to SEE a materialized tree.
assertReal(fs.existsSync(treeRootFor(DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked '
  + 'nothing. This checkout is ' + REPO + '; the tree root resolved to ' + TREE_ROOT + '. If those '
  + 'differ, the writer put the tree somewhere else and the two resolutions have diverged');
assertReal(fs.existsSync(path.join(TREE_ROOT, '.zcode')),
  'D1: the github tree lands at <tree-root>/.zcode (got missing at ' + path.join(TREE_ROOT, '.zcode') + ')');
assertReal(treeLabel('github') === '.zcode'
  && treeLabel('gitlab') === '.zcode-gitlab'
  && treeLabel('gitea') === '.zcode-gitea',
  'D1: treeLabel is .zcode / .zcode-gitlab / .zcode-gitea (kimi-style outSuffix)');

const canonAgents = trackedAgents();
const canonCommandNames = commandNamesFor(DEFAULT_FORGE);
const canonRosters = canonicalRosters(canonAgents);

// ---------------------------------------------------------------------------
// G0 — THE SUBJECT UNDER TEST IS THE GENERATOR'S OUTPUT, derived from TRACKED
// canonical sources. An absent tree must fail loudly rather than let every
// readdir-driven loop iterate over nothing.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(path.join(TREE_ROOT, '.zcode', 'agents'))
    && fs.existsSync(path.join(TREE_ROOT, '.zcode', 'commands'));
  assertReal(provisioned,
    'G0: the generated .zcode/agents and .zcode/commands trees exist after sync --write');
  if (!provisioned) {
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.zcode') + ' — nothing below can be tested.');
    process.exit(1);
  }
  assertReal(canonAgents.length > 0 && canonCommandNames.length > 0,
    'G0-roster: the canonical agents/ inventory and routing-registry command surfaces are both non-empty');
  assertReal(canonAgents.includes('knowledge-lookup'),
    'G0-roster: knowledge-lookup is in the canonical agents/*.md inventory');
  assertReal(canonRosters.standard.length > 0,
    'G0-roster: canonical sonnet/standard model class derives a non-empty standard roster');
  assertReal(canonRosters.reasoning.length > 0,
    'G0-roster: canonical opus/reasoning model class derives a non-empty reasoning roster');
  assertReal(canonRosters.heavy.length > 0,
    'G0-roster: canonical fable/heavy model class derives a non-empty heavy roster '
    + '(the fable thoughtLevel=max pin must have an agent to pin) — heavy='
    + JSON.stringify(canonRosters.heavy));
  assertReal(canonRosters.heavy.includes('planner') && canonRosters.heavy.includes('code-architect'),
    'G0-roster: planner-class (planner, code-architect) is the heavy (fable) roster — heavy='
    + JSON.stringify(canonRosters.heavy));
  assertReal(canonRosters.unknown.length === 0,
    'G0-roster: every canonical agent model belongs to the known sonnet/opus/fable classes — unknown='
    + JSON.stringify(canonRosters.unknown));
}

// An unrecognised canonical class must be rejected by the subject rather than
// silently inventing a fallback roster or emitting an unpinned agent.
{
  const unknownCanonical = [
    '---',
    'name: zcode-unknown-class-probe',
    'description: unknown class probe',
    'model: unsupported-class-token',
    '---',
    '',
    'probe',
    '',
  ].join('\n');
  let rejected = false;
  try {
    if (typeof syncMod.renderAgent === 'function') syncMod.renderAgent(unknownCanonical, 'zcode-unknown-class-probe');
  } catch (_) {
    rejected = true;
  }
  assertReal(rejected,
    'G0-roster: renderAgent rejects an unsupported canonical model token (fail closed; no invented roster)');
}

// The heavy/fable tier must render with the max thoughtLevel pin.
{
  const fableCanonical = [
    '---',
    'name: planner',
    'description: fable class probe',
    'model: fable',
    '---',
    '',
    'probe',
    '',
  ].join('\n');
  let rendered = '';
  let accepted = false;
  try {
    rendered = syncMod.renderAgent(fableCanonical, 'planner');
    accepted = true;
  } catch (e) {
    accepted = false;
    rendered = String(e && e.message || e);
  }
  assertReal(accepted,
    'G0-fable: renderAgent accepts fable (must not silently classify as standard) — ' + rendered);
  assertReal(/^model: GLM-5\.3$/m.test(rendered) && /^thoughtLevel: max$/m.test(rendered),
    'G0-fable: renderAgent pins fable as model: GLM-5.3 + thoughtLevel: max — got '
    + String(rendered).slice(0, 200));
}

function agentRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/agents/' + name + '.md';
}
function commandRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/commands/' + name + '.md';
}

// ---------------------------------------------------------------------------
// G1: agents — exact set = canonical agents/*.md. knowledge-lookup MUST be
// present. Frontmatter: name, description, model: GLM-5.3, and exactly ONE
// thoughtLevel: pinned by the canonical tier. FORBIDDEN fields: effort:,
// reasoning_effort:, reasoningEffort:, readonly:, model: inherit.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.zcode', 'agents');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assertReal(JSON.stringify(gen) === JSON.stringify(canonAgents),
    'G1: .zcode/agents set == canonical agents/*.md — canonical=' + JSON.stringify(canonAgents)
    + ' generated=' + JSON.stringify(gen));
  assertReal(gen.includes('knowledge-lookup'),
    'G1: knowledge-lookup MUST be present under .zcode/agents/');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    assertReal(exists(rel), 'G1[' + name + ']: generated agent exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm, raw } = parseFrontmatter(content);
    assertReal(fm.name === name, 'G1[' + name + ']: frontmatter name is the role — got ' + JSON.stringify(fm.name));
    assertReal(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G1[' + name + ']: frontmatter has a non-empty description');
    const canonical = canonicalAgentClass(name);
    assertReal(canonical.tier !== 'unknown',
      'G1[' + name + ']: canonical model class is known — got ' + JSON.stringify(canonical.model));
    const modelLines = raw.split(/\r?\n/).filter(line => /^\s*model\s*:/.test(line));
    assertReal(modelLines.length === 1 && modelLines[0] === 'model: ' + canonical.pin.model,
      'G1[' + name + ']: model line is exactly "model: ' + canonical.pin.model + '" — got '
      + JSON.stringify(modelLines));
    const thoughtLines = raw.split(/\r?\n/).filter(line => /^\s*thoughtLevel\s*:/.test(line));
    assertReal(thoughtLines.length === 1 && thoughtLines[0] === 'thoughtLevel: ' + canonical.pin.thoughtLevel,
      'G1[' + name + ']: exactly one thoughtLevel line, pinned by canonical tier '
      + canonical.tier + ' ("thoughtLevel: ' + canonical.pin.thoughtLevel + '") — got '
      + JSON.stringify(thoughtLines));
    assertReal(!/^\s*effort\s*:/m.test(raw),
      'G1[' + name + ']: NO effort: field (the ZCode key is thoughtLevel)');
    assertReal(!/^\s*reasoning_effort\s*:/m.test(raw) && !/^\s*reasoningEffort\s*:/m.test(raw),
      'G1[' + name + ']: NO reasoning_effort / reasoningEffort field (the ZCode key is thoughtLevel)');
    assertReal(!/^\s*readonly\s*:/m.test(raw),
      'G1[' + name + ']: NO readonly field (ZCode has no such agent field)');
    assertReal(!/^\s*model\s*:\s*inherit\b/m.test(raw),
      'G1[' + name + ']: model is never "inherit" (pinned to ' + canonical.pin.model + ')');
  }
}

// G1-declaration: ZCODE_RUNTIME_NATIVE.frontmatter_thought_level_pin exists and
// states the measured tier mapping; the generated tree matches it.
{
  const KEY = 'frontmatter_thought_level_pin';
  const reason = ZCODE_RUNTIME_NATIVE[KEY];
  assertReal(typeof reason === 'string' && reason.trim().length >= 20,
    'G1-declaration: ZCODE_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason');
  assertReal(/frontmatter/i.test(reason) && /thoughtLevel/i.test(reason)
    && /GLM-5\.3/i.test(reason) && /high/i.test(reason) && /max/i.test(reason)
    && /standard/i.test(reason) && /reasoning/i.test(reason) && /heavy|fable/i.test(reason)
    && /NOT\s+reasoningEffort/i.test(reason),
    'G1-declaration: the "' + KEY + '" reason must state GLM-5.3 with thoughtLevel '
    + 'high/max/max for standard/reasoning/heavy and that the key is thoughtLevel, NOT reasoningEffort');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    if (!exists(rel)) continue;
    const { raw } = parseFrontmatter(read(rel));
    const canonical = canonicalAgentClass(name);
    assertReal(raw.split(/\r?\n/).includes('model: ' + canonical.pin.model),
      'G1-declaration: ' + rel + ' carries the canonical model pin "model: ' + canonical.pin.model + '"');
    assertReal(raw.split(/\r?\n/).includes('thoughtLevel: ' + canonical.pin.thoughtLevel),
      'G1-declaration: ' + rel + ' carries the canonical tier thoughtLevel pin "thoughtLevel: '
      + canonical.pin.thoughtLevel + '"');
  }
}

// ---------------------------------------------------------------------------
// G2: commands — exact set = routing-registry commandSources() for the forge,
// not a hand list. ZCode's dispatch tool is ALSO Agent(, so the canonical
// Agent( cards are kept verbatim (NO Task( / spawn_subagent( rewrite).
// --runtime zcode stamp present. Leak scans.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.zcode', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assertReal(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .zcode/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const CANON_CARD = /^Agent\(/m;
  let canonCards = 0;
  let zcodeCards = 0;
  for (const name of canonCommandNames) {
    const src = forgeLayout.commandSources(DEFAULT_FORGE).find(s => s.basename === name + '.md');
    assertReal(!!src, 'G2[' + name + ']: commandSources() names this surface');
    const canon = src ? fs.readFileSync(src.absPath, 'utf8') : '';
    const rel = commandRel(name);
    assertReal(exists(rel), 'G2[' + name + ']: generated command exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm } = parseFrontmatter(content);
    assertReal(fm.name === name, 'G2[' + name + ']: frontmatter name matches the command — got ' + JSON.stringify(fm.name));
    assertReal(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G2[' + name + ']: frontmatter has a non-empty description');
    assertReal(CANON_CARD.test(content),
      'G2[' + name + ']: keeps the line-start Agent( dispatch card (ZCode dispatches via Agent too — no rewrite)');
    assertReal(!/^Task\(/m.test(content) && !/spawn_subagent\(/.test(content),
      'G2[' + name + ']: no Task( / spawn_subagent( rewrite of the Agent( dispatch card');
    assertReal(!/\bmodel\s*=\s*["']/.test(content),
      'G2[' + name + ']: generated cards stay free of per-call model dispatch');
    const canonHits = [...canon.matchAll(/^Agent\(\n\s+subagent_type="([^"]+)"/gm)].map(m => m[1]);
    const zcodeHits = [...content.matchAll(/^Agent\(\n\s+subagent_type="([^"]+)"/gm)].map(m => m[1]);
    canonCards += canonHits.length;
    zcodeCards += zcodeHits.length;
    assertReal(zcodeHits.length === canonHits.length,
      'G2[' + name + ']: Agent( card count matches canonical (' + canonHits.length
      + ') — got ' + zcodeHits.length);
    const n = Math.min(canonHits.length, zcodeHits.length);
    for (let i = 0; i < n; i++) {
      assertReal(zcodeHits[i] === canonHits[i],
        'G2[' + name + '#' + i + ']: Agent keeps the canonical role "' + canonHits[i]
        + '" as a named type (got "' + zcodeHits[i] + '")');
    }
    if (name === 'workflow-init') {
      assertReal(typeof fm['argument-hint'] === 'string' && fm['argument-hint'].length > 0,
        'G2[workflow-init]: preserves argument-hint (Commands support $ARGUMENTS)');
      assertReal(/\$ARGUMENTS/.test(content),
        'G2[workflow-init]: preserves $ARGUMENTS');
    }
  }
  assertReal(canonCards > 0,
    'G2: canonical command surfaces carry at least one line-start Agent( card (parity bite)');
  assertReal(zcodeCards === canonCards,
    'G2: generated Agent( count equals canonical Agent( count');
}

// G2-leak: no Claude plugin env, no ~/.claude paths, no --runtime claude, no
// model="{...}" placeholders, no vendor slugs from sibling editions, no
// spawn_subagent( / Task( rewrites anywhere in the generated tree.
{
  const VENDOR_SLUG = /\bgrok-4\.\d\b|\bgrok-build\b|\bcursor-grok\b/;
  const VENDOR_NOUN = /\b(?:opus|sonnet|grok|cursor)\b/i;
  let runtimeZcode = 0;
  for (const rel of generatedTreeRelFiles()) {
    const content = read(rel);
    assertReal(!/CLAUDE_PLUGIN_ROOT/.test(content),
      'G2-leak: ' + rel + ': no CLAUDE_PLUGIN_ROOT');
    assertReal(!/~\/\.claude\/kaola-workflow/.test(content)
      && !/\$HOME\/\.claude\/kaola-workflow/.test(content),
      'G2-leak: ' + rel + ': no ~/.claude/kaola-workflow');
    assertReal(!/--runtime claude\b/.test(content),
      'G2-leak: ' + rel + ': no --runtime claude (rewritten to --runtime zcode)');
    assertReal(!/model="\{/.test(content),
      'G2-leak: ' + rel + ': no model="{...}" placeholder');
    assertReal(!/\bmodel="/.test(content),
      'G2-leak: ' + rel + ': no per-call model=" override in generated dispatch surfaces');
    assertReal(!/spawn_subagent\(/.test(content) && !/\bTask\(/.test(content),
      'G2-leak: ' + rel + ': no spawn_subagent( / Task( dispatch wording');
    if (!/\/agents\//.test(rel)) {
      assertReal(!VENDOR_SLUG.test(content) && !VENDOR_NOUN.test(content),
        'G2-leak: ' + rel + ': no vendor slug/noun (grok, opus, sonnet, cursor) in command/hook surfaces');
    }
    if (/--runtime zcode\b/.test(content)) runtimeZcode++;
  }
  assertReal(runtimeZcode > 0,
    'G2: at least one generated file stamps --runtime zcode (claim/startup bite)');
  assertReal(exists(commandRel('workflow-next')) && /--runtime zcode\b/.test(read(commandRel('workflow-next'))),
    'G2[workflow-next]: claim invocation stamps --runtime zcode');
}
function generatedTreeRelFiles(label) {
  return walkFiles(path.join(TREE_ROOT, label || '.zcode'), label || '.zcode');
}

// ---------------------------------------------------------------------------
// G3: --check re-renders from canonical and agrees with the tree --write just
// produced (render determinism across processes). Then a planted drift must
// turn --check red.
// ---------------------------------------------------------------------------
{
  const ok = runGeneratorCli(['--check']);
  assertReal(ok.status === 0,
    'G3: sync-zcode-edition --check exits 0 against the tree --write just produced'
    + (ok.status !== 0 ? ' — ' + String(ok.stderr || ok.stdout).split('\n')[0] : ''));
  const probe = path.join(TREE_ROOT, '.zcode', 'agents', 'implementer.md');
  assertReal(fs.existsSync(probe), 'G3: implementer.md exists to plant drift against');
  const orig = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : '';
  try {
    fs.appendFileSync(probe, '\n<!-- zcode-edition drift probe -->\n');
    const drifted = runGeneratorCli(['--check']);
    assertReal(drifted.status !== 0,
      'G3: --check exits non-zero on a drifted generated agent (got ' + drifted.status + ')');
  } finally {
    try { fs.writeFileSync(probe, orig); } catch (_) { /* restore best-effort */ }
  }
  assertReal(runGeneratorCli(['--check']).status === 0,
    'G3: --check exits 0 after the planted drift is restored');
}

// ---------------------------------------------------------------------------
// G4: reviewer roles keep behavior_contract_version/hash + a restamped
// resolved_profile_hash (opencode/kimi/cursor discipline).
// ---------------------------------------------------------------------------
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const zcodeText = read(agentRel(role));
  let zcode = null;
  try { zcode = reviewerGenerator.behaviorIdentityFromCore(zcodeText); } catch (e) {
    assertReal(false, 'G4-reviewer[' + role + ']: the generated agent still carries an extractable behavior core — ' + e.message);
    zcode = { role: null, behavior_contract_version: null, behavior_contract_hash: null, core: null };
  }
  assertReal(zcode.role === canonical.role
    && zcode.behavior_contract_version === canonical.behavior_contract_version
    && zcode.behavior_contract_hash === canonical.behavior_contract_hash,
    'G4-reviewer[' + role + ']: zcode agent retains normalized reviewer behavior identity');
  assertReal(zcode.core === canonical.core,
    'G4-reviewer[' + role + ']: zcode render preserves reviewer behavior-core bytes');
  const zcodeHash = (zcodeText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assertReal(zcodeHash && /^[0-9a-f]{64}$/.test(zcodeHash),
    'G4-reviewer[' + role + ']: zcode agent carries a resolved_profile_hash');
  assertReal((zcodeText.match(/^resolved_profile_hash\s*:\s*[0-9a-f]{64}\s*$/gm) || []).length === 1,
    'G4-reviewer[' + role + ']: zcode agent carries EXACTLY ONE resolved_profile_hash line');
  let zcodeHashVerifies = true;
  try { reviewerGenerator.verifyResolvedProfileHash(zcodeText); } catch (_) { zcodeHashVerifies = false; }
  assertReal(zcodeHashVerifies,
    'G4-reviewer[' + role + ']: resolved_profile_hash verifies over the zcode bytes (zeroed-self sha256)');
  const clHash = (read('agents/' + role + '.md').match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assertReal(zcodeHash !== clHash,
    'G4-reviewer[' + role + ']: zcode hash is re-stamped over zcode bytes (not the reused Claude render hash)');
  assertReal(new RegExp('^behavior_contract_version:\\s*' + canonical.behavior_contract_version + '\\s*$', 'm').test(zcodeText),
    'G4-reviewer[' + role + ']: zcode agent preserves the canonical behavior_contract_version line');
  assertReal(new RegExp('^behavior_contract_hash:\\s*' + canonical.behavior_contract_hash + '\\s*$', 'm').test(zcodeText),
    'G4-reviewer[' + role + ']: zcode agent preserves the canonical behavior_contract_hash line');
}

// ---------------------------------------------------------------------------
// G5: config.json — valid JSON, top-level hooks object with "enabled": true,
// event keys drawn ONLY from ZCode's seven events, NO SubagentStart. Hook
// command paths resolve inside the edition (.zcode/kaola-workflow/...).
// Support scripts land per the install manifest; hooks under .../hooks/.
// ---------------------------------------------------------------------------
{
  const configRel = '.zcode/config.json';
  assertReal(exists(configRel), 'G5: .zcode/config.json exists (ZCode hook mapping)');
  let parsed = null;
  try { parsed = JSON.parse(read(configRel)); } catch (_) { parsed = null; }
  assertReal(parsed !== null && parsed !== undefined,
    'G5: .zcode/config.json is valid JSON');
  assertReal(!!parsed && parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks),
    'G5: config.json has a top-level hooks object');
  assertReal(!!parsed && parsed.hooks && parsed.hooks.enabled === true,
    'G5: hooks.enabled is exactly true');
  const eventKeys = parsed && parsed.hooks
    ? Object.keys(parsed.hooks).filter(k => k !== 'enabled') : [];
  assertReal(eventKeys.length > 0,
    'G5: hooks registers at least one event');
  for (const k of eventKeys) {
    assertReal(ZCODE_HOOK_EVENTS.includes(k),
      'G5: hook event key ' + JSON.stringify(k) + ' is one of ZCode\'s seven events '
      + '(SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PostToolUseFailure/Stop)');
  }
  assertReal(!parsed || !('SubagentStart' in (parsed.hooks || {})) && !/["']SubagentStart["']/.test(read(configRel)),
    'G5: NO SubagentStart event (ZCode 3.9.1 has no such hook event)');
  assertReal(!/CLAUDE_PLUGIN_ROOT/.test(read(configRel)),
    'G5: config.json carries no CLAUDE_PLUGIN_ROOT');
  const blob = JSON.stringify(parsed && parsed.hooks || {});
  assertReal(/\.zcode\/kaola-workflow\//.test(blob),
    'G5: hook command paths reference .zcode/kaola-workflow/ (edition-resident scripts/hooks)');
  assertReal(!/~\/\.claude\//.test(blob),
    'G5: hook command paths do not point outside the edition (~/.claude)');

  // Every hook command named in the mapping resolves to a file in the tree.
  {
    const commands = [];
    for (const k of eventKeys) {
      const v = parsed.hooks[k];
      const arr = Array.isArray(v) ? v : (v && Array.isArray(v.commands) ? v.commands : [v]);
      for (const entry of arr || []) {
        const cmd = String((entry && (entry.command || entry.cmd)) || entry || '');
        for (const token of cmd.split(/&&|;/)) {
          const m = token.match(/\.zcode\/kaola-workflow\/[^\s"']+/);
          if (m) commands.push(m[0]);
        }
      }
    }
    assertReal(commands.length > 0,
      'G5: at least one hook command names an edition-resident path');
    for (const rel of commands) {
      const abs = path.join(TREE_ROOT, rel);
      assertReal(fs.existsSync(abs),
        'G5: hook command path resolves in the generated tree — ' + rel);
    }
  }

  // Support scripts + shell hooks.
  {
    const manifest = require('./kaola-workflow-install-manifest.js');
    const scriptsDir = path.join(TREE_ROOT, '.zcode', 'kaola-workflow', 'scripts');
    assertReal(fs.existsSync(scriptsDir),
      'G5: .zcode/kaola-workflow/scripts/ exists');
    const deployed = fs.existsSync(scriptsDir)
      ? fs.readdirSync(scriptsDir).map(f => f.replace(/\.js$/, '')) : [];
    for (const base of manifest.supportScripts(DEFAULT_FORGE)) {
      assertReal(deployed.indexOf(String(base).replace(/\.js$/, '')) !== -1,
        'G5: install-manifest support script deployed under .zcode/kaola-workflow/scripts/ — ' + base);
    }
    const hooksDir = path.join(TREE_ROOT, '.zcode', 'kaola-workflow', 'hooks');
    assertReal(fs.existsSync(hooksDir),
      'G5: .zcode/kaola-workflow/hooks/ exists (shell hooks)');
    if (fs.existsSync(hooksDir)) {
      const hookFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh'));
      assertReal(hookFiles.length > 0,
        'G5: .zcode/kaola-workflow/hooks/ carries at least one shell hook');
      for (const f of hookFiles) {
        const text = fs.readFileSync(path.join(hooksDir, f), 'utf8');
        assertReal(text.startsWith('#!'),
          'G5: hook ' + f + ' keeps its shebang as line 1 so ZCode can exec it');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// G6: generator CLI — --write, --check, --refresh-present, --forge=,
// --print-tree-root, --merge-hooks/--strip-hooks. Unknown forge refused.
// --help names the flags.
// ---------------------------------------------------------------------------
{
  const help = runGeneratorCli(['--help']);
  const helpOut = String(help.stdout || '') + String(help.stderr || '');
  assertReal(/--write/.test(helpOut) && /--check/.test(helpOut)
    && /--refresh-present/.test(helpOut) && /--print-tree-root/.test(helpOut)
    && /--forge/.test(helpOut) && /--merge-hooks/.test(helpOut) && /--strip-hooks/.test(helpOut),
    'G6: --help names --write / --check / --refresh-present / --print-tree-root / --forge= / --merge-hooks / --strip-hooks');

  const printed = runGeneratorCli(['--print-tree-root']);
  assertReal(printed.status === 0, 'G6: --print-tree-root exits 0 (got ' + printed.status + ')');
  const line = String(printed.stdout || '').replace(/\n$/, '');
  assertReal(path.isAbsolute(line) && !line.includes('\n'),
    'G6: --print-tree-root prints one absolute path on stdout (installers consume it as a path) — got '
    + JSON.stringify(line));
  let printedReal = line;
  let treeReal = TREE_ROOT;
  try { printedReal = fs.realpathSync(line); } catch (_) { /* literal stands */ }
  try { treeReal = fs.realpathSync(TREE_ROOT); } catch (_) { /* literal stands */ }
  assertReal(line === TREE_ROOT || printedReal === treeReal,
    'G6: --print-tree-root agrees with this suite\'s independently computed TREE_ROOT — printed '
    + JSON.stringify(line) + ' vs ' + JSON.stringify(TREE_ROOT));
  assertReal(!/NOTE/.test(String(printed.stdout || '')),
    'G6: --print-tree-root stdout carries no advisory (a caller will try to open that line)');

  const refresh = runGenerator(['--refresh-present']);
  assertReal(refresh.status === 0,
    'G6: --refresh-present exits 0 (got ' + refresh.status + ': '
    + String(refresh.stderr || refresh.stdout).split('\n')[0] + ')');

  const bad = runGeneratorCli(['--forge=svn', '--check']);
  assertReal(bad.status === 2,
    'G6: sync --forge=svn refuses with exit 2 rather than defaulting to github (got ' + bad.status + ')');

  const missingDest = runGeneratorCli(['--merge-hooks']);
  assertReal(missingDest.status === 2,
    'G6: --merge-hooks without --dest=PATH exits 2 (got ' + missingDest.status + ')');

  const mergeDir = fs.mkdtempSync(path.join(tmpBase(), 'zcode-merge-'));
  try {
    const dest = path.join(mergeDir, 'config.json');
    fs.writeFileSync(dest, JSON.stringify({
      model: 'GLM-5.3',
      hooks: {
        enabled: true,
        UserPromptSubmit: [{ command: 'echo user-owned' }],
      },
    }, null, 2) + '\n');
    const before = JSON.parse(fs.readFileSync(dest, 'utf8'));
    const beforeEvents = Object.keys(before.hooks).filter(k => k !== 'enabled');
    const merged = runGenerator(['--merge-hooks', '--dest=' + dest]);
    assertReal(merged.status === 0, 'G6-merge: --merge-hooks exits 0 (got ' + merged.status + ')');
    const after = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assertReal(after.model === 'GLM-5.3',
      'G6-merge: preserves the foreign top-level key "model"');
    assertReal(Array.isArray(after.hooks.UserPromptSubmit)
      && after.hooks.UserPromptSubmit[0].command === 'echo user-owned',
      'G6-merge: preserves the foreign UserPromptSubmit entry');
    assertReal(after.hooks.enabled === true,
      'G6-merge: hooks.enabled stays true');
    const afterEvents = Object.keys(after.hooks).filter(k => k !== 'enabled');
    const added = afterEvents.filter(k => beforeEvents.indexOf(k) === -1);
    assertReal(added.length > 0,
      'G6-merge: appends kaola hook events — got ' + JSON.stringify(afterEvents));
    const stripped = runGenerator(['--strip-hooks', '--dest=' + dest]);
    assertReal(stripped.status === 0, 'G6-strip: --strip-hooks exits 0 (got ' + stripped.status + ')');
    const gone = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assertReal(Array.isArray(gone.hooks.UserPromptSubmit)
      && gone.hooks.UserPromptSubmit[0].command === 'echo user-owned',
      'G6-strip: foreign hook entries remain');
    for (const k of added) {
      assertReal(!(k in gone.hooks),
        'G6-strip: kaola-owned event ' + JSON.stringify(k) + ' is removed');
    }
    fs.writeFileSync(dest, 'not-json{');
    const refuse = runGeneratorCli(['--merge-hooks', '--dest=' + dest]);
    assertReal(refuse.status === 1,
      'G6-merge: unreadable dest JSON fails closed (got ' + refuse.status + ')');
  } finally {
    try { fs.rmSync(mergeDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// G7: forge axis — --forge=gitlab / --forge=gitea write sibling trees from
// commandSources(), never a hand-ported command list.
// ---------------------------------------------------------------------------
{
  for (const forge of ['gitlab', 'gitea']) {
    const w = runGenerator(['--forge=' + forge, '--write']);
    assertReal(w.status === 0,
      'G7[' + forge + ']: sync --write exits 0 (got ' + w.status + ': '
      + String(w.stderr || '').slice(0, 200) + ')');
    const label = '.zcode-' + forge;
    const abs = path.join(TREE_ROOT, label);
    assertReal(fs.existsSync(abs),
      'G7[' + forge + ']: generated tree lands at ' + label);
    const expected = commandNamesFor(forge);
    const cmdDir = path.join(abs, 'commands');
    const actual = fs.existsSync(cmdDir)
      ? fs.readdirSync(cmdDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assertReal(JSON.stringify(actual) === JSON.stringify(expected),
      'G7[' + forge + ']: ' + label + '/commands is exactly commandSources(' + forge
      + ') — expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
    const agentDir = path.join(abs, 'agents');
    const agents = fs.existsSync(agentDir)
      ? fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assertReal(JSON.stringify(agents) === JSON.stringify(canonAgents),
      'G7[' + forge + ']: agent set is the canonical roster, including knowledge-lookup');
    const c = runGeneratorCli(['--forge=' + forge, '--check']);
    assertReal(c.status === 0,
      'G7[' + forge + ']: --check is green after --write (got ' + c.status + ')');
  }
}

// ---------------------------------------------------------------------------
// G8: install-zcode.sh — hermetic cases against the REAL installer with temp
// HOME + ZCODE_HOME + --target under tmpBase(), never the host ~/.zcode.
// ---------------------------------------------------------------------------
{
  assertReal(fs.existsSync(INSTALLER),
    'G8: installer not present: install-zcode.sh is required for the hermetic install contract');
  {
    // spawn-class: cli-contract
    const syntax = spawnSync('bash', ['-n', INSTALLER], { encoding: 'utf8' });
    assertReal(syntax.status === 0,
      'G8: bash -n install-zcode.sh (got ' + syntax.status + ' — '
      + String(syntax.stderr || syntax.stdout).split('\n')[0] + ')');
  }
  if (fs.existsSync(INSTALLER)) {
    const src = fs.readFileSync(INSTALLER, 'utf8');
    assertReal(/additive/i.test(src) && /does\s+not\s+(?:modify|touch|edit)\s+install\.sh/i.test(src),
      'G8: header comment declares the installer additive standalone (does not modify install.sh)');
    assertReal(/--target/.test(src) && /--forge/.test(src) && /--global/.test(src)
      && /--regenerate/.test(src) && /--uninstall/.test(src) && /--no-scripts/.test(src)
      && /--yes/.test(src),
      'G8: usage names --target / --forge / --global / --regenerate / --uninstall / --no-scripts / --yes');
    assertReal(/user scope/i.test(src) && /\.zcode\/agents/i.test(src),
      'G8: header documents that ZCode discovers subagents only at user scope (~/.zcode/agents)');

    const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
    function runInstaller(extraArgs, opts) {
      opts = opts || {};
      const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-home-'));
      const zcodeHome = opts.zcodeHome || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-ch-'));
      const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-dest-'));
      const args = ['--yes'].concat(opts.skipTarget ? [] : ['--target', dest]).concat(extraArgs || []);
      const spawnOpts = {
        env: Object.assign({}, process.env, { HOME: home, ZCODE_HOME: zcodeHome }),
        encoding: 'utf8',
      };
      if (opts.cwd) spawnOpts.cwd = opts.cwd;
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER].concat(args), spawnOpts);
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home, zcodeHome, dest };
    }
    const clean = r => {
      for (const d of [r.home, r.zcodeHome, r.dest]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    };

    // Project deploy: commands + merged config.json under <target>/.zcode/,
    // agents staged there AND synced to user scope (ZCode discovery).
    {
      const r = runInstaller([]);
      assertReal(r.status === 0,
        'G8-project: install-zcode.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const commandsDir = path.join(r.dest, '.zcode', 'commands');
      const agentsDir = path.join(r.dest, '.zcode', 'agents');
      for (const name of canonCommandNames) {
        assertReal(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.zcode/commands/');
      }
      const configFile = path.join(r.dest, '.zcode', 'config.json');
      assertReal(fs.existsSync(configFile),
        'G8-project: config.json lands at <target>/.zcode/config.json');
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { cfg = null; }
      assertReal(!!cfg && cfg.hooks && cfg.hooks.enabled === true,
        'G8-project: merged config.json parses with hooks.enabled true');
      for (const name of canonAgents) {
        assertReal(fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-project[' + name + ']: agent staged under <target>/.zcode/agents/');
        assertReal(fs.existsSync(path.join(r.zcodeHome, 'agents', name + '.md')),
          'G8-project[' + name + ']: agent synced to $ZCODE_HOME/agents/ (ZCode discovers subagents only at user scope)');
      }
      assertReal(fs.existsSync(path.join(r.zcodeHome, 'kaola-workflow', 'scripts')),
        'G8-project: support scripts land at $ZCODE_HOME/kaola-workflow/scripts');
      clean(r);
    }

    // A project whose <target>/.zcode is also $ZCODE_HOME exercises the same
    // physical support-script directory as --global, without the GLOBAL flag.
    // The ordinary project copy order must still leave the real support script
    // available to a consumer cwd rather than the generated self-launcher.
    {
      const aliasDest = fs.mkdtempSync(path.join(tmpBase(), 'zcode-alias-dest-'));
      const aliasHome = fs.mkdtempSync(path.join(tmpBase(), 'zcode-alias-home-'));
      const aliasZcodeHome = path.join(aliasDest, '.zcode');
      const consumerCwd = fs.mkdtempSync(path.join(tmpBase(), 'zcode-alias-consumer-'));
      const consumerPackage = path.join(consumerCwd, 'package.json');
      try {
        fs.writeFileSync(consumerPackage, JSON.stringify({ name: 'zcode-alias-consumer-fixture' }) + '\n');
        const r = runInstaller([], {
          home: aliasHome,
          zcodeHome: aliasZcodeHome,
          dest: aliasDest,
          cwd: consumerCwd,
        });
        assertReal(path.resolve(r.dest, '.zcode') === path.resolve(r.zcodeHome),
          'G8-project-alias: fixture has <target>/.zcode exactly equal to $ZCODE_HOME');
        assertReal(r.status === 0,
          'G8-project-alias: install-zcode.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
        const consumerScriptName = 'kaola-workflow-claim.js';
        const consumerScript = path.join(r.zcodeHome, 'kaola-workflow', 'scripts', consumerScriptName);
        const deployedSource = fs.existsSync(consumerScript)
          ? fs.readFileSync(consumerScript, 'utf8') : '';
        const consumerPackageJson = JSON.parse(fs.readFileSync(consumerPackage, 'utf8'));
        assertReal(consumerPackageJson.name !== 'kaola-workflow',
          'G8-project-alias: fixture package name is not kaola-workflow, so installed-first resolution is exercised');
        // spawn-class: environment
        const invoked = spawnSync(process.execPath, [consumerScript, '--help'], {
          cwd: consumerCwd,
          env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
          encoding: 'utf8',
          timeout: 1000,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024,
        });
        const timedOut = !!invoked.error && invoked.error.code === 'ETIMEDOUT';
        const isLauncher = /zcode-edition support launcher/.test(deployedSource);
        assertReal(!isLauncher && invoked.status === 0 && !timedOut,
          'G8-project-alias-consumer: when <target>/.zcode === $ZCODE_HOME, the installed '
          + consumerScriptName + ' is the real support script (not a self-launcher) and '
          + '--help exits 0 from a non-kaola-workflow cwd — launcher=' + isLauncher
          + ', status=' + invoked.status + ', error=' + (invoked.error && invoked.error.code || 'none'));
      } finally {
        for (const d of [consumerCwd, aliasHome, aliasDest]) {
          try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        }
      }
    }

    // --global: agents/commands land under ZCODE_HOME, un-nested.
    {
      const r = runInstaller(['--global'], { skipTarget: true });
      assertReal(r.status === 0,
        'G8-global: install-zcode.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      for (const name of canonAgents) {
        assertReal(fs.existsSync(path.join(r.zcodeHome, 'agents', name + '.md')),
          'G8-global[' + name + ']: agent deployed under $ZCODE_HOME/agents/ (un-nested)');
      }
      for (const name of canonCommandNames) {
        assertReal(fs.existsSync(path.join(r.zcodeHome, 'commands', name + '.md')),
          'G8-global[' + name + ']: command deployed under $ZCODE_HOME/commands/');
      }
      assertReal(!fs.existsSync(path.join(r.zcodeHome, '.zcode')),
        'G8-global: creates NO nested .zcode/ under ZCODE_HOME');
      const globalConfig = path.join(r.zcodeHome, 'config.json');
      assertReal(fs.existsSync(globalConfig), 'G8-global: merges hooks into $ZCODE_HOME/config.json');

      // A consumer cwd must prefer the real support script installed in the global
      // support directory. The generated edition launcher has the same basename;
      // if it overwrites the real script, a non-kaola-workflow package cwd selects
      // that launcher first and recursively re-executes it. The invocation is
      // deliberately bounded so the regression witness can never recurse forever.
      const consumerCwd = fs.mkdtempSync(path.join(tmpBase(), 'zcode-consumer-'));
      const consumerPackage = path.join(consumerCwd, 'package.json');
      const consumerScriptName = 'kaola-workflow-claim.js';
      const consumerScript = path.join(r.zcodeHome, 'kaola-workflow', 'scripts', consumerScriptName);
      try {
        fs.writeFileSync(consumerPackage, JSON.stringify({ name: 'zcode-consumer-fixture' }) + '\n');
        const consumerPackageJson = JSON.parse(fs.readFileSync(consumerPackage, 'utf8'));
        assertReal(consumerPackageJson.name !== 'kaola-workflow',
          'G8-global-consumer: fixture package name is not kaola-workflow, so installed-first resolution is exercised');
        const deployedSource = fs.existsSync(consumerScript)
          ? fs.readFileSync(consumerScript, 'utf8') : '';
        // spawn-class: environment
        const invoked = spawnSync(process.execPath, [consumerScript, '--help'], {
          cwd: consumerCwd,
          env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
          encoding: 'utf8',
          timeout: 1000,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024,
        });
        const timedOut = !!invoked.error && invoked.error.code === 'ETIMEDOUT';
        const isLauncher = /zcode-edition support launcher/.test(deployedSource);
        assertReal(!isLauncher && invoked.status === 0 && !timedOut,
          'G8-global-consumer: from a non-kaola-workflow package cwd, the installed '
          + consumerScriptName + ' is the real support script (not a self-launcher) and '
          + '--help exits 0 — launcher=' + isLauncher + ', status=' + invoked.status
          + ', error=' + (invoked.error && invoked.error.code || 'none'));
      } finally {
        try { fs.rmSync(consumerCwd, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
      clean(r);
    }

    // --forge=gitlab deploys the gitlab-shaped command set from the sibling tree.
    {
      const r = runInstaller(['--forge=gitlab']);
      assertReal(r.status === 0,
        'G8-gitlab: install-zcode.sh --forge=gitlab exits 0 (got ' + r.status
        + ' — ' + firstLine(r) + ')');
      const commandsDir = path.join(r.dest, '.zcode', 'commands');
      const expected = commandNamesFor('gitlab');
      for (const name of expected) {
        assertReal(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-gitlab[' + name + ']: command deployed under <target>/.zcode/commands/');
      }
      const gitlabClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'gitlab');
      const githubClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'github');
      assertReal(gitlabClaim !== githubClaim && gitlabClaim.length > 0,
        'G8-gitlab: gitlab claim basename is distinct from github — otherwise the content pin is vacuous');
      const wfNext = fs.existsSync(path.join(commandsDir, 'workflow-next.md'))
        ? fs.readFileSync(path.join(commandsDir, 'workflow-next.md'), 'utf8') : '';
      assertReal(wfNext.includes(gitlabClaim),
        'G8-gitlab: deployed workflow-next is gitlab-shaped — names ' + gitlabClaim);
      assertReal(!wfNext.includes(githubClaim),
        'G8-gitlab: deployed workflow-next must not name the github claim script ' + githubClaim);
      assertReal(/\bglab\b/.test(wfNext),
        'G8-gitlab: deployed workflow-next names glab (gitlab routing surface)');
      clean(r);
    }

    // Unknown forge exit 2, nothing written to --target.
    {
      const r = runInstaller(['--forge=svn']);
      assertReal(r.status === 2,
        'G8-unknown: install-zcode.sh --forge=svn exits 2 (got ' + r.status + ')');
      const leftover = walkFiles(r.dest, '');
      assertReal(leftover.length === 0,
        'G8-unknown: unknown forge writes nothing under --target — found ' + leftover.slice(0, 6).join(', '));
      clean(r);
    }

    // --no-scripts skips scripts; agents/commands/config still deploy.
    {
      const r = runInstaller(['--no-scripts']);
      assertReal(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assertReal(fs.existsSync(path.join(r.dest, '.zcode', 'agents', 'knowledge-lookup.md')),
        'G8-noscripts: agents still deploy');
      assertReal(fs.existsSync(path.join(r.dest, '.zcode', 'commands', 'workflow-next.md')),
        'G8-noscripts: commands still deploy');
      assertReal(!fs.existsSync(path.join(r.zcodeHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $ZCODE_HOME/kaola-workflow/scripts');
      clean(r);
    }

    // --uninstall removes only kaola-deployed names: user agents in
    // ~/.zcode/agents and foreign config keys/entries survive.
    {
      const r = runInstaller([]);
      assertReal(r.status === 0, 'G8-uninstall: seed install exits 0');
      const userAgent = path.join(r.zcodeHome, 'agents', 'user-notes.md');
      fs.mkdirSync(path.dirname(userAgent), { recursive: true });
      fs.writeFileSync(userAgent, 'user-owned, not kaola-deployed\n');
      const configFile = path.join(r.dest, '.zcode', 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { cfg = {}; }
      cfg.model = 'GLM-5.3-user';
      cfg.hooks = cfg.hooks || {};
      cfg.hooks.UserPromptSubmit = [{ command: 'echo user-owned' }];
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
        encoding: 'utf8',
      });
      assertReal(ru.status === 0,
        'G8-uninstall: --uninstall exits 0 (got ' + ru.status + ' — ' + firstLine(ru) + ')');
      for (const name of canonAgents) {
        assertReal(!fs.existsSync(path.join(r.zcodeHome, 'agents', name + '.md')),
          'G8-uninstall[' + name + ']: kaola agent copy removed from ~/.zcode/agents/');
        assertReal(!fs.existsSync(path.join(r.dest, '.zcode', 'agents', name + '.md')),
          'G8-uninstall[' + name + ']: staged kaola agent removed from <target>/.zcode/agents/');
      }
      for (const name of canonCommandNames) {
        assertReal(!fs.existsSync(path.join(r.dest, '.zcode', 'commands', name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed command is removed');
      }
      assertReal(fs.existsSync(userAgent) && fs.readFileSync(userAgent, 'utf8') === 'user-owned, not kaola-deployed\n',
        'G8-uninstall: a user-owned agent in ~/.zcode/agents survives');
      assertReal(fs.existsSync(configFile),
        'G8-uninstall: does not delete the user config.json file');
      let after = null;
      try { after = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { after = null; }
      assertReal(!!after && after.model === 'GLM-5.3-user',
        'G8-uninstall: foreign top-level config key survives');
      assertReal(!!after && Array.isArray(after.hooks.UserPromptSubmit)
        && after.hooks.UserPromptSubmit[0].command === 'echo user-owned',
        'G8-uninstall: foreign hook entries survive (--strip-hooks removes only kaola-owned hooks)');
      clean(r);
    }
  }
}

// ---------------------------------------------------------------------------
// D2 — docs existence asserts (read-only). docs/zcode-edition.md carries the
// measured tier mapping; the indexes name zcode; CHANGELOG has an entry.
// ---------------------------------------------------------------------------
{
  const docPath = path.join(REPO, 'docs', 'zcode-edition.md');
  assertReal(fs.existsSync(docPath),
    'D2: docs/zcode-edition.md exists');
  if (fs.existsSync(docPath)) {
    const doc = fs.readFileSync(docPath, 'utf8');
    assertReal(/GLM-5\.3/.test(doc),
      'D2: docs/zcode-edition.md names GLM-5.3');
    assertReal(/thoughtLevel/i.test(doc) && /high/i.test(doc) && /max/i.test(doc),
      'D2: docs/zcode-edition.md carries the measured thoughtLevel high/max/max tier mapping');
    assertReal(/standard/i.test(doc) && /reasoning/i.test(doc) && /heavy|fable/i.test(doc),
      'D2: docs/zcode-edition.md names the standard/reasoning/heavy tier mapping');
    assertReal(/thoughtLevel/i.test(doc) && /NOT reasoningEffort/i.test(doc),
      'D2: docs/zcode-edition.md notes the frontmatter key is thoughtLevel, NOT reasoningEffort');
    assertReal(/3\.9\.1/.test(doc),
      'D2: docs/zcode-edition.md mentions the ZCode 3.9.1 measurement');
  }
  for (const rel of ['README.md', 'docs/README.md', 'docs/architecture.md']) {
    const abs = path.join(REPO, ...rel.split('/'));
    assertReal(fs.existsSync(abs) && /zcode/i.test(fs.readFileSync(abs, 'utf8')),
      'D2: ' + rel + ' mentions zcode');
  }
  {
    const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
    // A release cut moves the entry out of [Unreleased]. Keep the witness over
    // every bracketed release section, including [Unreleased] when present.
    function hasZcodeReleaseEntry(text) {
      const lines = String(text).split(/\r?\n/);
      let inRelease = false;
      let bullet = [];
      let found = false;
      const flush = () => {
        if (inRelease && bullet.length && /\bzcode\b/i.test(bullet.join('\n'))) found = true;
        bullet = [];
      };
      for (const line of lines) {
        if (/^##\s+/.test(line)) {
          flush();
          inRelease = /^##\s+\[[^\]]+\]/.test(line);
          continue;
        }
        if (inRelease && /^###\s+/.test(line)) {
          flush();
          continue;
        }
        if (inRelease && /^\s*[-*]\s+/.test(line)) {
          flush();
          bullet = [line];
          continue;
        }
        if (inRelease && bullet.length) {
          if (line.trim() === '') flush();
          else bullet.push(line);
        }
      }
      flush();
      return found;
    }
    function removeZcodeEntries(text) {
      const lines = String(text).split(/\r?\n/);
      const out = [];
      let inRelease = false;
      let bullet = [];
      const flush = () => {
        if (!bullet.length || !/\bzcode\b/i.test(bullet.join('\n'))) out.push(...bullet);
        bullet = [];
      };
      for (const line of lines) {
        if (/^##\s+/.test(line)) {
          flush();
          inRelease = /^##\s+\[[^\]]+\]/.test(line);
          out.push(line);
          continue;
        }
        if (inRelease && (/^###\s+/.test(line) || line.trim() === '')) {
          flush();
          out.push(line);
          continue;
        }
        if (inRelease && /^\s*[-*]\s+/.test(line)) {
          flush();
          bullet = [line];
          continue;
        }
        if (inRelease && bullet.length) bullet.push(line);
        else out.push(line);
      }
      flush();
      return out.join('\n');
    }
    assertReal(hasZcodeReleaseEntry(changelog),
      'D2: CHANGELOG.md has a zcode entry in a release section (including [Unreleased])');
    const withoutZcode = removeZcodeEntries(changelog);
    assertReal(withoutZcode !== changelog,
      'D2-mutation: removing the zcode entry changes the changelog witness input');
    assertReal(!hasZcodeReleaseEntry(withoutZcode),
      'D2-mutation: removing the zcode entry makes the release-stable witness fail');
  }
}

if (failed) {
  console.error('\nzcode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('zcode-edition test passed (' + passed + ' assertions).' + driftVerdict);
