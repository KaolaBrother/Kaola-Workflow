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
// ZCode (measured against ZCode 3.10.1/3.10.1.6272) is a coding-agent RUNTIME, not a forge,
// and it does not ride install.sh / edition-sync.js / npm test. It is delivered
// the ZCode-native way: named agents under `.zcode/agents/<role>.md` (Agent
// dispatch types), flat commands under `.zcode/commands/<name>.md`, and
// support scripts under `.zcode/kaola-workflow/scripts`. ZCode deliberately
// carries no Kaola hook declaration or executable hook subprocess: its measured
// one-million-token context does not need compact prompt hooks, and the live
// hook experiment self-locked Workflow Next.
//
// ZCode discovers subagents ONLY at user scope (~/.zcode/agents), so the
// installer syncs the staged `.zcode/agents/` roster to the user home as well.
//
// Frontmatter pins (measured on ZCode 3.10.1/3.10.1.6272): every agent carries
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
const reviewerGenerator = require('./generate-agent-profiles.js');

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

// ZCode 3.10.1 stores matcher rows under hooks.events.<Event>. Each matcher
// row owns its executable entries in row.hooks[]. Keep the legacy direct-row
// branch only for foreign configuration fixtures and pre-3.10.1 migration
// checks; all generated ZCode command assertions consume the nested entries.
function hookCommandsFromRow(row) {
  if (!row || typeof row !== 'object') return [];
  const nested = Array.isArray(row.hooks) ? row.hooks : [];
  const entries = nested.length > 0 ? nested : [row];
  return entries.map(entry => String((entry && entry.command) || ''))
    .filter(Boolean);
}

function hookRowsFromConfig(config) {
  const hooks = config && config.hooks && typeof config.hooks === 'object'
    ? config.hooks : {};
  const direct = Object.entries(hooks).flatMap(([event, entries]) =>
    event === 'enabled' || event === 'events' || !Array.isArray(entries)
      ? [] : entries.map(entry => ({ event, entry })));
  const wrapped = hooks.events && typeof hooks.events === 'object' && !Array.isArray(hooks.events)
    ? Object.entries(hooks.events).flatMap(([event, entries]) =>
      !Array.isArray(entries) ? [] : entries.map(entry => ({ event, entry })))
    : [];
  return direct.concat(wrapped);
}

const trackedAgents = () => fs.readdirSync(path.join(REPO, 'agents'))
  .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
const commandNamesFor = forge => forgeLayout.commandSources(forge)
  .map(s => s.basename.replace(/\.md$/, '')).sort();
const behaviorContracts = reviewerGenerator.loadBehaviorContracts(REPO).roles;

function expectedNativeTools(role) {
  const required = new Set(behaviorContracts[role].capability_requirements || []);
  const tools = ['Read', 'Grep', 'Glob'];
  if (required.has('scoped_write')) tools.splice(1, 0, 'Write', 'Edit');
  if (required.has('command_execution')) tools.push('Bash');
  if (required.has('external_research')) tools.push('WebSearch', 'WebFetch');
  return tools;
}

// ---------------------------------------------------------------------------
// ZCODE_RUNTIME_NATIVE — the frontmatter thoughtLevel pin as a DECLARED
// table entry, not merely as prose. Deleting the declaration reds this suite.
// ---------------------------------------------------------------------------
const ZCODE_RUNTIME_NATIVE = Object.freeze({
  frontmatter_thought_level_pin:
    'ZCode generated agent frontmatter pins every agent to model: GLM-5.3 plus exactly one camelCase thoughtLevel: field set by canonical tier — standard high, reasoning max, heavy (fable) max. The key is thoughtLevel, NOT reasoningEffort/effort.',
});
const ZCODE_SYNC_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'sync-zcode-edition.js'), 'utf8');
const ZCODE_ADAPTER = reviewerGenerator.loadRuntimeAdapters(REPO).runtimes.zcode;

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
  assertReal(JSON.stringify(ZCODE_ADAPTER).includes('GLM-5.3'),
    'G0-adapter: runtime-capabilities.json owns the rendered ZCode model identifier GLM-5.3');
  assertReal(!/const\s+ZCODE_MODEL_CLASS_PINS\b|function\s+zcodeModelPin\b/.test(ZCODE_SYNC_SRC),
    'G0-adapter: sync-zcode-edition carries no executable hardcoded model/thought table; '
    + 'runtime-capabilities.json is the sole runtime identifier authority');
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
    let tools = null;
    try { tools = JSON.parse(fm.tools); } catch (_) { tools = null; }
    const expectedTools = expectedNativeTools(name);
    assertReal((raw.match(/^tools\s*:/gm) || []).length === 1 && Array.isArray(tools),
      'G1[' + name + ']: frontmatter carries exactly one executable tools allowlist');
    assertReal(Array.isArray(tools) && JSON.stringify(tools) === JSON.stringify(expectedTools),
      'G1[' + name + ']: tools allowlist derives from behavior capabilities — expected '
      + JSON.stringify(expectedTools) + ' got ' + JSON.stringify(tools));
    if (!behaviorContracts[name].capability_requirements.includes('command_execution')) {
      assertReal(Array.isArray(tools) && !tools.includes('Bash'),
        'G1[' + name + ']: a no-shell role lacks Bash in its enforced tools allowlist');
    }
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
// not a hand list. Finalize uses automatic selection, native @role, or the exact live Agent schema;
// it must not publish a static Agent field list that the adapter explicitly treats as host-reported.
// --runtime zcode stamp present. Leak scans.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.zcode', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assertReal(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .zcode/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const staticDispatchFields = text => String(text || '').split(/\r?\n/)
    .filter(line => /^\s*(?:subagent_type|description)\s*=/.test(line));
  const lineStartCall = text => /^(?:Agent|Task)\(/m.test(String(text || ''));
  const rolePattern = role => new RegExp('`' + String(role).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`');
  const namedRolesIn = text => reviewerGenerator.ROLES.filter(role => rolePattern(role).test(String(text || '')));
  let canonicalFinalizeRoles = [];
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
    assertReal(!/^Task\(/m.test(content) && !/spawn_subagent\(/.test(content),
      'G2[' + name + ']: no sibling-runtime Task( / spawn_subagent( dispatch wording');
    assertReal(!/\bmodel\s*=\s*["']/.test(content),
      'G2[' + name + ']: generated command stays free of per-call model dispatch');
    // The compressed routing cards no longer carry a static Agent(...) sample.
    // Preserve the named-role contract by comparing the generated roster that
    // the canonical runtime-delegation slot actually publishes.
    const canonHits = namedRolesIn(canon);
    if (name === 'kaola-workflow-finalize') {
      canonicalFinalizeRoles = canonHits;
      assertReal(!lineStartCall(content),
        'G2[kaola-workflow-finalize]: native ZCode guidance has no static Agent( or Task( call card');
      assertReal(staticDispatchFields(content).length === 0,
        'G2[kaola-workflow-finalize]: no invented static subagent_type= or description= fields escape into the ZCode render');
      for (const role of canonHits) {
        assertReal(content.includes(role),
          'G2[kaola-workflow-finalize]: native prose preserves the canonical dispatch role ' + role);
      }
      for (const boundary of [
        'outcome', 'evidence', 'worktree/commit', 'custody', 'stop condition',
      ]) {
        assertReal(content.toLowerCase().includes(boundary),
          'G2[kaola-workflow-finalize]: native prose preserves the ' + boundary + ' brief boundary');
      }
      assertReal(/automatic selection/i.test(content) && /@<role>|@.*role/i.test(content)
        && /live schema/i.test(content),
      'G2[kaola-workflow-finalize]: native prose keeps automatic/@role routing and defers optional Agent fields to the live schema');
    }
    if (name === 'workflow-init') {
      assertReal(typeof fm['argument-hint'] === 'string' && fm['argument-hint'].length > 0,
        'G2[workflow-init]: preserves argument-hint (Commands support $ARGUMENTS)');
      assertReal(/\$ARGUMENTS/.test(content),
        'G2[workflow-init]: preserves $ARGUMENTS');
    }
  }
  assertReal(canonicalFinalizeRoles.length > 0,
    'G2: canonical finalize carries named-role dispatch meaning for the ZCode renderer to preserve');

  const nativeBoundary = 'Use native @tdd-guide selection with task, custody, evidence, and stop boundaries.';
  assertReal(!lineStartCall(nativeBoundary) && staticDispatchFields(nativeBoundary).length === 0,
    'G2-mutation: honest @role prose has no portable static dispatch fields');
  const inventedCard = nativeBoundary
    + '\nAgent(\n  subagent_type="tdd-guide",\n  description="Routed fix"\n)';
  assertReal(lineStartCall(inventedCard) && staticDispatchFields(inventedCard).length === 2,
    'G2-mutation RED: appending a static Agent(subagent_type, description) card is detected');
}

// G2-leak: no Claude plugin env, no ~/.claude paths, no --runtime claude, no
// model="{...}" placeholders, no vendor slugs from sibling editions, no
// spawn_subagent( / Task( rewrites anywhere in the generated tree.
{
  const VENDOR_SLUG = /\bgrok-4\.\d\b|\bgrok-build\b|\bcursor-grok\b/;
  const VENDOR_NOUN = /\b(?:opus|sonnet|grok|cursor)\b/i;
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
  }
  const generatedNext = exists(commandRel('workflow-next')) ? read(commandRel('workflow-next')) : '';
  const generatedFinalize = exists(commandRel('kaola-workflow-finalize'))
    ? read(commandRel('kaola-workflow-finalize')) : '';
  const configRel = treeLabel(DEFAULT_FORGE) + '/config.json';
  const generatedConfig = exists(configRel) ? read(configRel) : '';
  let configValue = null;
  if (generatedConfig) {
    try { configValue = JSON.parse(generatedConfig); } catch (_) { /* assertion below */ }
  }
  assertReal(!generatedConfig || !!configValue,
    'G2[config]: optional generated ZCode config remains valid JSON');
  const configEvents = configValue && configValue.hooks && typeof configValue.hooks === 'object'
    ? configValue.hooks : {};
  const directEvents = Object.keys(configEvents).filter(key => key !== 'enabled' && key !== 'events');
  const nestedEvents = configEvents.events && typeof configEvents.events === 'object'
    && !Array.isArray(configEvents.events) ? Object.keys(configEvents.events) : [];
  const configRows = hookRowsFromConfig(configValue).map(row => hookCommandsFromRow(row.entry)).flat();
  assertReal(directEvents.length === 0 && nestedEvents.length === 0 && configRows.length === 0,
    'G2[config]: generated ZCode config declares no direct/nested event or Kaola hook row — direct='
      + JSON.stringify(directEvents) + ' nested=' + JSON.stringify(nestedEvents));
  assertReal(!/kaola-workflow[/\\](?:hooks|runtime-hook)|compact-(?:context|resume)/i.test(generatedConfig),
    'G2[config]: generated ZCode config carries no Kaola hook executable path');
  assertReal(/workflow-next/.test(generatedNext) && /kaola-workflow-finalize/.test(generatedFinalize),
    'G2[workflow-next]: slash commands retain their own initial loading surfaces');
  assertReal(!/(?:before\s+any\s+other\s+tool|before\s+ordinary\s+tools)[\s\S]{0,180}prompt\s+bind/i.test(generatedNext),
    'G2[workflow-next]: command does not require the model to execute prompt bind after UserPromptSubmit activation');
  const generatedHookShells = generatedTreeRelFiles()
    .filter(rel => /kaola-workflow[/\\]hooks[/\\].+\.(?:sh|command)$/.test(rel));
  assertReal(generatedHookShells.length === 0,
    'G2[config]: generated ZCode tree carries no executable Kaola hook shell — got '
      + JSON.stringify(generatedHookShells));
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
// G5: ZCode deliberately has no Kaola hook carrier.  The optional generated
// config may exist for unrelated runtime settings, but it must contain no
// direct event key, hooks.events matcher row, Kaola hook path, or executable
// shell under `.zcode/kaola-workflow/hooks`. Support scripts remain a normal
// deployment surface and are checked independently below.
// ---------------------------------------------------------------------------
{
  const configRel = '.zcode/config.json';
  const configExists = exists(configRel);
  let parsed = null;
  if (configExists) {
    try { parsed = JSON.parse(read(configRel)); } catch (_) { parsed = null; }
  }
  assertReal(!configExists || parsed !== null,
    'G5: optional .zcode/config.json is valid JSON');
  const hooks = parsed && parsed.hooks && typeof parsed.hooks === 'object'
    ? parsed.hooks : {};
  const directEvents = Object.keys(hooks).filter(key => key !== 'enabled' && key !== 'events');
  const nestedEvents = hooks.events && typeof hooks.events === 'object' && !Array.isArray(hooks.events)
    ? Object.keys(hooks.events) : [];
  const rows = hookRowsFromConfig(parsed);
  const commands = rows.flatMap(row => hookCommandsFromRow(row.entry));
  assertReal(directEvents.length === 0 && nestedEvents.length === 0 && commands.length === 0,
    'G5: generated ZCode config declares no Kaola hook event or command — direct='
      + JSON.stringify(directEvents) + ' nested=' + JSON.stringify(nestedEvents));
  assertReal(!/CLAUDE_PLUGIN_ROOT/.test(configExists ? read(configRel) : '')
    && !/kaola-workflow[/\\](?:hooks|runtime-hook)|compact-(?:context|resume)/i
      .test(configExists ? read(configRel) : ''),
    'G5: generated ZCode config carries no external or Kaola hook path');

  const manifest = require('./kaola-workflow-install-manifest.js');
  const scriptsDir = path.join(TREE_ROOT, '.zcode', 'kaola-workflow', 'scripts');
  assertReal(fs.existsSync(scriptsDir),
    'G5: .zcode/kaola-workflow/scripts/ remains the support-script surface');
  const deployed = fs.existsSync(scriptsDir)
    ? fs.readdirSync(scriptsDir).map(f => f.replace(/\.js$/, '')) : [];
  for (const base of manifest.supportScripts(DEFAULT_FORGE)) {
    assertReal(deployed.indexOf(String(base).replace(/\.js$/, '')) !== -1,
      'G5: install-manifest support script deployed under .zcode/kaola-workflow/scripts/ — ' + base);
  }
  const hooksDir = path.join(TREE_ROOT, '.zcode', 'kaola-workflow', 'hooks');
  const hookFiles = fs.existsSync(hooksDir)
    ? fs.readdirSync(hooksDir).filter(f => /\.(?:sh|command)$/.test(f)) : [];
  assertReal(hookFiles.length === 0,
    'G5: generated ZCode tree carries no executable hook shell — got ' + JSON.stringify(hookFiles));
}

// ---------------------------------------------------------------------------
// G6: generator CLI — --write, --check, --refresh-present, --forge=,
// --print-tree-root, and the receipt-owned --strip-hooks migration utility.
// Fresh ZCode rendering no longer exposes a hook merge path.
// --help names the flags.
// ---------------------------------------------------------------------------
{
  const help = runGeneratorCli(['--help']);
  const helpOut = String(help.stdout || '') + String(help.stderr || '');
  assertReal(/--write/.test(helpOut) && /--check/.test(helpOut)
    && /--refresh-present/.test(helpOut) && /--print-tree-root/.test(helpOut)
    && /--forge/.test(helpOut) && /--strip-hooks/.test(helpOut),
    'G6: --help names --write / --check / --refresh-present / --print-tree-root / --forge= / --strip-hooks');

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

  const missingDest = runGeneratorCli(['--strip-hooks']);
  assertReal(missingDest.status === 2,
    'G6: --strip-hooks without --dest=PATH exits 2 (got ' + missingDest.status + ')');
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
    // Issue #1032: inspect the shipped source so the retired dispatch hook stays in the bounded
    // list and both install/uninstall paths consume that list without touching a real home.
    const retiredHooks = src.match(/\bRETIRED_HOOKS\s*=\s*\(([^)]*)\)/);
    const hasRetiredHookCleanup = body => {
      const loop = String(body).match(/^[ \t]*for[ \t]+retired[ \t]+in[^\n]*RETIRED_HOOKS[^\n]*;[ \t]*do[ \t]*\n([\s\S]*?)^[ \t]*done[ \t]*$/m);
      return !!loop && /\brm\s+-f\b/.test(loop[1]) && /\$retired\b/.test(loop[1]) && /hooks/.test(loop[1]);
    };
    const installStart = src.indexOf('install_support_scripts() {');
    const uninstallStart = src.indexOf('uninstall_edition() {');
    assertReal(retiredHooks && /\bkaola-workflow-subagent-dispatch-log\.sh\b/.test(retiredHooks[1]),
      'R1: RETIRED_HOOKS contains kaola-workflow-subagent-dispatch-log.sh');
    assertReal(installStart >= 0 && uninstallStart > installStart
      && hasRetiredHookCleanup(src.slice(installStart, uninstallStart)),
      'R2: install cleanup consumes the bounded RETIRED_HOOKS list for hook removal');
    assertReal(uninstallStart >= 0 && hasRetiredHookCleanup(src.slice(uninstallStart)),
      'R3: uninstall cleanup consumes the bounded RETIRED_HOOKS list for hook removal');

    const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
    function runInstaller(extraArgs, opts) {
      opts = opts || {};
      const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-home-'));
      const zcodeHome = opts.zcodeHome || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-ch-'));
      const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'zcode-i-dest-'));
      if (typeof opts.beforeRun === 'function') opts.beforeRun({ home, zcodeHome, dest });
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

    const liveConfigPath = fixture => path.join(fixture.zcodeHome, 'cli', 'config.json');
    const legacyHomeConfigPath = fixture => path.join(fixture.zcodeHome, 'config.json');
    const projectConfigPath = fixture => path.join(fixture.dest, '.zcode', 'config.json');
    const projectReceiptPath = fixture => path.join(fixture.dest, '.zcode', 'kaola-workflow', 'zcode-hooks-state.json');
    const legacyReceiptPath = fixture => path.join(fixture.zcodeHome, 'kaola-workflow', 'zcode-hooks-state.json');
    const userConfigSeed = () => ({
      theme: 'user-owned-theme',
      hooks: {
        enabled: true,
        UserPromptSubmit: [{ command: 'echo user-owned' }],
      },
    });
    function seedUserConfig(fixture) {
      const live = liveConfigPath(fixture);
      fs.mkdirSync(path.dirname(live), { recursive: true });
      fs.writeFileSync(live, JSON.stringify(userConfigSeed(), null, 2) + '\n');
    }
    function kaolaHookCommands(config) {
      return hookRowsFromConfig(config)
        .flatMap(row => hookCommandsFromRow(row.entry))
        .filter(command => /kaola-workflow[/\\]hooks[/\\]|(?:^|[/\\])runtime-hook(?:\.sh)?\b|compact-(?:context|resume)/i.test(command));
    }
    function jsonBytes(value) {
      return JSON.stringify(value, null, 2) + '\n';
    }
    function configMode(file) {
      return fs.statSync(file).mode & 0o777;
    }
    function hasExactEntry(config, event, expected) {
      const topLevel = config && config.hooks && config.hooks[event];
      const wrapped = config && config.hooks && config.hooks.events && config.hooks.events[event];
      return [topLevel, wrapped].some(entries => Array.isArray(entries)
        && entries.some(entry => JSON.stringify(entry) === JSON.stringify(expected)));
    }

    // Project deploy: commands remain project-local. ZCode has no Kaola hook
    // declaration carrier; pre-existing user/project config is not rewritten
    // merely because the edition is installed.
    {
      const projectDecoy = JSON.stringify({ project_decoy: 'must-stay-byte-identical' }, null, 2) + '\n';
      const homeDecoy = JSON.stringify({ home_decoy: 'must-stay-byte-identical' }, null, 2) + '\n';
      const r = runInstaller([], { beforeRun: fixture => {
        seedUserConfig(fixture);
        fs.mkdirSync(path.dirname(projectConfigPath(fixture)), { recursive: true });
        fs.writeFileSync(projectConfigPath(fixture), projectDecoy);
        fs.writeFileSync(legacyHomeConfigPath(fixture), homeDecoy);
      } });
      assertReal(r.status === 0,
        'G8-project: install-zcode.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const commandsDir = path.join(r.dest, '.zcode', 'commands');
      for (const name of canonCommandNames) {
        assertReal(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.zcode/commands/');
      }
      const configFile = liveConfigPath(r);
      assertReal(fs.existsSync(configFile),
        'G8-project: pre-existing user ${ZCODE_HOME}/cli/config.json survives');
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { cfg = null; }
      assertReal(!!cfg && cfg.theme === 'user-owned-theme'
        && cfg.hooks && cfg.hooks.enabled === true,
      'G8-project: user config preserves its top-level keys and enabled state');
      assertReal(!!cfg && Array.isArray(cfg.hooks.UserPromptSubmit)
        && cfg.hooks.UserPromptSubmit[0].command === 'echo user-owned',
      'G8-project: user config preserves the user-owned hook entry');
      assertReal(kaolaHookCommands(cfg).length === 0,
        'G8-project: user config carries no ambient Kaola hook command');
      const userConfigBefore = fs.readFileSync(configFile, 'utf8');
      let projectCfg = null;
      try { projectCfg = JSON.parse(fs.readFileSync(projectConfigPath(r), 'utf8')); }
      catch (_) { projectCfg = null; }
      assertReal(!!projectCfg && projectCfg.project_decoy === 'must-stay-byte-identical'
        && kaolaHookCommands(projectCfg).length === 0,
        'G8-project: a pre-existing project config remains a foreign no-hook config');
      assertReal(fs.readFileSync(projectConfigPath(r), 'utf8') === projectDecoy,
        'G8-project: installer does not replace a foreign project config with hook declarations');
      assertReal(fs.readFileSync(legacyHomeConfigPath(r), 'utf8') === homeDecoy,
        'G8-project: legacy ${ZCODE_HOME}/config.json is not used or rewritten');
      assertReal(fs.readFileSync(configFile, 'utf8') === userConfigBefore,
        'G8-project: user config remains byte-identical when no ownership receipt exists');
      assertReal(!fs.existsSync(projectReceiptPath(r)) && !fs.existsSync(legacyReceiptPath(r)),
        'G8-project: no hook ownership receipt is created');
      assertReal(!/(?:approve all|pending review|hooks trust review|workspace hook declarations)/i.test(r.stdout + r.stderr),
        'G8-project: install output has no retired ZCode hook approval/declaration hand-off');
      const projectHooksDir = path.join(r.dest, '.zcode', 'kaola-workflow', 'hooks');
      assertReal(!fs.existsSync(projectHooksDir)
        || fs.readdirSync(projectHooksDir).filter(f => /\.(?:sh|command)$/.test(f)).length === 0,
        'G8-project: no executable Kaola hook shell is staged in the project');
      for (const name of canonAgents) {
        assertReal(fs.existsSync(path.join(r.zcodeHome, 'agents', name + '.md')),
          'G8-project[' + name + ']: authoritative agent installed under $ZCODE_HOME/agents/');
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
      const homeDecoy = JSON.stringify({ home_decoy: 'must-stay-byte-identical' }, null, 2) + '\n';
      const globalUserConfigBytes = jsonBytes(userConfigSeed());
      const r = runInstaller(['--global'], { skipTarget: true, beforeRun: fixture => {
        seedUserConfig(fixture);
        fs.writeFileSync(legacyHomeConfigPath(fixture), homeDecoy);
      } });
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
      const globalConfig = liveConfigPath(r);
      assertReal(fs.existsSync(globalConfig),
        'G8-global: pre-existing user config remains available');
      let globalCfg = null;
      try { globalCfg = JSON.parse(fs.readFileSync(globalConfig, 'utf8')); } catch (_) { globalCfg = null; }
      assertReal(!!globalCfg && globalCfg.theme === 'user-owned-theme'
        && Array.isArray(globalCfg.hooks.UserPromptSubmit)
        && globalCfg.hooks.UserPromptSubmit[0].command === 'echo user-owned',
      'G8-global: user config preserves foreign keys and hook entries');
      assertReal(kaolaHookCommands(globalCfg).length === 0,
        'G8-global: global install creates no ambient Kaola hook command');
      assertReal(fs.readFileSync(globalConfig, 'utf8') === globalUserConfigBytes,
        'G8-global: global install does not rewrite the user config');
      assertReal(fs.readFileSync(legacyHomeConfigPath(r), 'utf8') === homeDecoy,
        'G8-global: legacy ${ZCODE_HOME}/config.json is not used or rewritten');
      assertReal(!fs.existsSync(projectReceiptPath(r)) && !fs.existsSync(legacyReceiptPath(r)),
        'G8-global: global install creates no hook ownership receipt');
      assertReal(!/(?:approve all|pending review|hooks trust review|workspace hook declarations)/i.test(r.stdout + r.stderr),
        'G8-global: install output has no retired ZCode hook approval/declaration hand-off');

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
      const wfInit = fs.existsSync(path.join(commandsDir, 'workflow-init.md'))
        ? fs.readFileSync(path.join(commandsDir, 'workflow-init.md'), 'utf8') : '';
      const finalize = fs.existsSync(path.join(commandsDir, 'kaola-workflow-finalize.md'))
        ? fs.readFileSync(path.join(commandsDir, 'kaola-workflow-finalize.md'), 'utf8') : '';
      // The compressed card still carries the forge-specific claim helper and
      // the ZCode startup runtime. No prompt lifecycle hook is implied by
      // this command-level forge routing assertion.
      assertReal(wfNext.includes(gitlabClaim) && /startup --runtime zcode\b/.test(wfNext),
        'G8-gitlab: compressed workflow-next keeps the forge-specific ZCode startup route ' + gitlabClaim);
      assertReal(!wfNext.includes(githubClaim),
        'G8-gitlab: deployed workflow-next must not name the github claim script ' + githubClaim);
      assertReal(finalize.includes(gitlabClaim) && !finalize.includes(githubClaim),
        'G8-gitlab: finalization keeps the forge-specific claim script ' + gitlabClaim);
      assertReal(/\bglab\b/.test(wfInit),
        'G8-gitlab: workflow-init keeps glab (gitlab routing surface)');
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

    // --no-scripts skips support scripts and still must not create a ZCode hook
    // declaration or an approval/trust route.
    {
      const r = runInstaller(['--no-scripts'], { beforeRun: seedUserConfig });
      assertReal(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assertReal(fs.existsSync(path.join(r.zcodeHome, 'agents', 'knowledge-lookup.md')),
        'G8-noscripts: authoritative user-scope agents still deploy');
      assertReal(fs.existsSync(path.join(r.dest, '.zcode', 'commands', 'workflow-next.md')),
        'G8-noscripts: commands still deploy');
      assertReal(!fs.existsSync(path.join(r.zcodeHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $ZCODE_HOME/kaola-workflow/scripts');
      const noScriptsConfig = fs.existsSync(liveConfigPath(r))
        ? JSON.parse(fs.readFileSync(liveConfigPath(r), 'utf8')) : null;
      assertReal(kaolaHookCommands(noScriptsConfig).length === 0,
        'G8-noscripts: live user config carries no Kaola hook whose script was skipped');
      assertReal(!fs.existsSync(projectConfigPath(r))
        && !fs.existsSync(projectReceiptPath(r)) && !fs.existsSync(legacyReceiptPath(r)),
        'G8-noscripts: no project config or hook receipt is created');
      assertReal(!/(?:approve all|pending review|hooks trust review|workspace hook declarations)/i.test(r.stdout + r.stderr),
        'G8-noscripts: install output has no retired ZCode hook approval/declaration hand-off');
      clean(r);
    }

    // --uninstall removes only kaola-deployed names: user agents in
    // ~/.zcode/agents and foreign config keys/entries survive.
    {
      const r = runInstaller([], { beforeRun: fixture => {
        seedUserConfig(fixture);
        const seeded = JSON.parse(fs.readFileSync(liveConfigPath(fixture), 'utf8'));
        seeded.model = 'GLM-5.3-user';
        fs.writeFileSync(liveConfigPath(fixture), JSON.stringify(seeded, null, 2) + '\n');
      } });
      assertReal(r.status === 0, 'G8-uninstall: seed install exits 0');
      const userAgent = path.join(r.zcodeHome, 'agents', 'user-notes.md');
      fs.mkdirSync(path.dirname(userAgent), { recursive: true });
      fs.writeFileSync(userAgent, 'user-owned, not kaola-deployed\n');
      const configFile = liveConfigPath(r);
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { cfg = null; }
      const userConfigBefore = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
      const projectConfig = projectConfigPath(r);
      let projectCfg = null;
      try { projectCfg = JSON.parse(fs.readFileSync(projectConfig, 'utf8')); } catch (_) { projectCfg = null; }
      assertReal(kaolaHookCommands(cfg).length === 0,
        'G8-uninstall: seed install leaves no ambient Kaola hooks in the user config');
      assertReal(!projectCfg || kaolaHookCommands(projectCfg).length === 0,
        'G8-uninstall: seed install creates no project Kaola hook declaration');
      assertReal(!fs.existsSync(projectReceiptPath(r)) && !fs.existsSync(legacyReceiptPath(r)),
        'G8-uninstall: seed install creates no hook ownership receipt');
      assertReal(!/(?:approve all|pending review|hooks trust review|workspace hook declarations)/i.test(r.stdout + r.stderr),
        'G8-uninstall: seed install has no retired ZCode hook approval/declaration hand-off');
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
      assertReal(fs.readFileSync(configFile, 'utf8') === userConfigBefore,
        'G8-uninstall: user config remains byte-identical because no ambient carrier was installed');
      let projectAfter = null;
      try { projectAfter = JSON.parse(fs.readFileSync(projectConfig, 'utf8')); } catch (_) { projectAfter = null; }
      assertReal(!projectAfter || kaolaHookCommands(projectAfter).length === 0,
        'G8-uninstall: every receipt-owned project Kaola declaration is stripped');
      assertReal(!fs.existsSync(projectReceiptPath(r)),
        'G8-uninstall: project hook receipt is removed after receipt-owned stripping');
      clean(r);
    }

    // Security R3 (#1033): the live ZCode hook carrier is shared by every
    // project using the same ZCODE_HOME. Installing Kaola must not turn dormant
    // foreign commands on merely because Kaola itself needs hooks enabled.
    {
      const foreignStop = { command: 'sh /opt/foreign/dormant-stop.sh', timeout: 17 };
      const original = {
        theme: 'foreign-disabled-theme',
        hooks: {
          enabled: false,
          Stop: [foreignStop],
        },
      };
      const originalBytes = jsonBytes(original);
      const r = runInstaller([], { beforeRun: fixture => {
        const live = liveConfigPath(fixture);
        fs.mkdirSync(path.dirname(live), { recursive: true });
        fs.writeFileSync(live, originalBytes, { mode: 0o600 });
      } });
      const live = liveConfigPath(r);
      let after = null;
      try { after = JSON.parse(fs.readFileSync(live, 'utf8')); } catch (_) { after = null; }
      assertReal(!!after && after.hooks && after.hooks.enabled === false,
        'R3-disabled-foreign: project install never silently activates a dormant foreign '
        + 'global hook when hooks.enabled started false (status=' + r.status + ')');
      assertReal(hasExactEntry(after, 'Stop', foreignStop),
        'R3-disabled-foreign: the dormant foreign Stop entry survives byte-for-byte in meaning');
      assertReal(fs.readFileSync(live, 'utf8') === originalBytes,
        'R3-disabled-foreign: no-hook project install leaves the foreign user config byte-identical');
      assertReal(!fs.existsSync(projectConfigPath(r)) && !fs.existsSync(projectReceiptPath(r)),
        'R3-disabled-foreign: no project hook config or receipt is created');
      clean(r);
    }

    // A path substring is not an ownership identity. These two commands are
    // deliberately plausible false positives for the old broad regex: one
    // contains kaola-workflow/hooks and one contains kaola-workflow/scripts.
    // Reinstall/migration must remove only the exact rows named by the old
    // user-level receipt. With no ZCode hook carrier, the foreign project
    // config remains unchanged and no replacement project receipt is created.
    {
      const foreignHookPath = {
        command: 'sh /opt/customer/kaola-workflow/hooks/user-session-start.sh',
        timeout: 23,
        owner: 'foreign-hook-fixture',
      };
      const foreignScriptPath = {
        command: 'node /opt/customer/kaola-workflow/scripts/user-pre-tool.js',
        timeout: 29,
        owner: 'foreign-script-fixture',
      };
      const legacySession = { command: 'sh legacy-kaola-session-start.sh', timeout: 5 };
      const legacyPre = { command: 'sh legacy-kaola-pre-tool.sh', timeout: 5 };
      const seed = {
        hooks: {
          enabled: true,
          SessionStart: [foreignHookPath, legacySession],
          PreToolUse: [foreignScriptPath, legacyPre],
        },
      };
      const projectForeign = {
        matcher: '*',
        hooks: [{ type: 'command', command: 'echo project-foreign', timeout: 11 }],
      };
      const projectSeed = {
        hooks: { enabled: true, events: { SessionStart: [projectForeign] } },
      };
      const r = runInstaller([], { beforeRun: fixture => {
        const live = liveConfigPath(fixture);
        fs.mkdirSync(path.dirname(live), { recursive: true });
        fs.writeFileSync(live, jsonBytes(seed), { mode: 0o600 });
        fs.mkdirSync(path.dirname(projectConfigPath(fixture)), { recursive: true });
        fs.writeFileSync(projectConfigPath(fixture), jsonBytes(projectSeed), { mode: 0o600 });
        const legacyReceipt = {
          schema: 'kaola-workflow-zcode-hooks-v1',
          destination: path.resolve(live),
          priorEnabled: { present: true, value: true },
          priorEvents: { present: false },
          added: [
            { event: 'SessionStart', entry: legacySession },
            { event: 'PreToolUse', entry: legacyPre },
          ],
        };
        fs.mkdirSync(path.dirname(legacyReceiptPath(fixture)), { recursive: true });
        fs.writeFileSync(legacyReceiptPath(fixture), jsonBytes(legacyReceipt), { mode: 0o600 });
      } });
      assertReal(r.status === 0,
        'R3-exact-ownership: seed install exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const live = liveConfigPath(r);
      let installed = null;
      try { installed = JSON.parse(fs.readFileSync(live, 'utf8')); } catch (_) { installed = null; }
      assertReal(hasExactEntry(installed, 'SessionStart', foreignHookPath),
        'R3-exact-ownership: a foreign command merely containing kaola-workflow/hooks survives install');
      assertReal(hasExactEntry(installed, 'PreToolUse', foreignScriptPath),
        'R3-exact-ownership: a foreign command merely containing kaola-workflow/scripts survives install');
      assertReal(!hasExactEntry(installed, 'SessionStart', legacySession)
        && !hasExactEntry(installed, 'PreToolUse', legacyPre),
        'R3-exact-ownership: reinstall removes only exact receipt-owned legacy rows');
      assertReal(!fs.existsSync(legacyReceiptPath(r)),
        'R3-exact-ownership: legacy migration consumes its exact ownership receipt');
      let projectInstalled = null;
      try { projectInstalled = JSON.parse(fs.readFileSync(projectConfigPath(r), 'utf8')); }
      catch (_) { projectInstalled = null; }
      assertReal(hasExactEntry(projectInstalled, 'SessionStart', projectForeign),
        'R3-exact-ownership: project foreign matcher row survives no-hook install');
      const installedRows = hookRowsFromConfig(projectInstalled)
        .filter(row => !hasExactEntry(projectSeed, row.event, row.entry));
      assertReal(installedRows.length === 0,
        'R3-exact-ownership: project install adds no replacement Kaola matcher rows');
      assertReal(fs.readFileSync(projectConfigPath(r), 'utf8') === jsonBytes(projectSeed),
        'R3-exact-ownership: project config remains byte-identical when no hook receipt is created');
      assertReal(!fs.existsSync(projectReceiptPath(r)),
        'R3-exact-ownership: project install creates no ownership receipt');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
        encoding: 'utf8',
      });
      assertReal(ru.status === 0,
        'R3-exact-ownership: uninstall exits 0 (got ' + ru.status + ' — ' + firstLine(ru) + ')');
      let uninstalled = null;
      try { uninstalled = JSON.parse(fs.readFileSync(live, 'utf8')); } catch (_) { uninstalled = null; }
      assertReal(hasExactEntry(uninstalled, 'SessionStart', foreignHookPath)
        && hasExactEntry(uninstalled, 'PreToolUse', foreignScriptPath),
        'R3-exact-ownership: uninstall preserves every foreign path-lookalike entry');
      assertReal(!hasExactEntry(uninstalled, 'SessionStart', legacySession)
        && !hasExactEntry(uninstalled, 'PreToolUse', legacyPre),
        'R3-exact-ownership: uninstall does not resurrect retired legacy rows');
      let uninstalledProject = null;
      try { uninstalledProject = JSON.parse(fs.readFileSync(projectConfigPath(r), 'utf8')); }
      catch (_) { uninstalledProject = null; }
      assertReal(hasExactEntry(uninstalledProject, 'SessionStart', projectForeign),
        'R3-exact-ownership: uninstall preserves the foreign project matcher row');
      assertReal(fs.readFileSync(projectConfigPath(r), 'utf8') === jsonBytes(projectSeed),
        'R3-exact-ownership: uninstall preserves the foreign project config bytes');
      assertReal(installedRows.every(row => !hasExactEntry(uninstalledProject, row.event, row.entry)),
        'R3-exact-ownership: uninstall removes every exact project receipt row');
      assertReal(!fs.existsSync(projectReceiptPath(r)),
        'R3-exact-ownership: uninstall removes the project ownership receipt');
      clean(r);
    }

    // A disabled legacy user carrier is not a reason for a project install to
    // create any project hook declaration. Both install and uninstall preserve
    // the legacy target's exact prior bytes.
    {
      const seed = { hooks: { enabled: false } };
      const r = runInstaller([], { beforeRun: fixture => {
        const live = liveConfigPath(fixture);
        fs.mkdirSync(path.dirname(live), { recursive: true });
        fs.writeFileSync(live, jsonBytes(seed), { mode: 0o600 });
      } });
      assertReal(r.status === 0,
        'R3-enabled-restore: install beside a disabled legacy carrier exits 0');
      const live = liveConfigPath(r);
      const legacyBefore = fs.readFileSync(live, 'utf8');
      assertReal(fs.readFileSync(live, 'utf8') === legacyBefore
        && JSON.parse(legacyBefore).hooks.enabled === false,
        'R3-enabled-restore: project install leaves the disabled legacy carrier unchanged');
      assertReal(!fs.existsSync(projectConfigPath(r)) && !fs.existsSync(projectReceiptPath(r)),
        'R3-enabled-restore: disabled legacy carrier does not produce a project hook config or receipt');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
        encoding: 'utf8',
      });
      const after = JSON.parse(fs.readFileSync(live, 'utf8'));
      let projectAfter = null;
      try { projectAfter = JSON.parse(fs.readFileSync(projectConfigPath(r), 'utf8')); }
      catch (_) { projectAfter = null; }
      assertReal(ru.status === 0 && after.hooks.enabled === false
        && fs.readFileSync(live, 'utf8') === legacyBefore,
        'R3-enabled-restore: uninstall preserves the exact prior disabled legacy state');
      assertReal(!projectAfter || kaolaHookCommands(projectAfter).length === 0,
        'R3-enabled-restore: uninstall leaves no project Kaola hook declaration');
      assertReal(!fs.existsSync(projectReceiptPath(r)),
        'R3-enabled-restore: uninstall removes the project ownership receipt');
      clean(r);
    }

    // Project .zcode/config.json is the active declaration carrier, while the
    // legacy ZCODE_HOME/config.json is only a migration target. Without an
    // exact receipt identifying either file as a former Kaola carrier,
    // uninstall must not normalize or strip their bytes.
    {
      const legacyEntry = {
        command: 'sh /srv/archive/kaola-workflow/hooks/user-owned-legacy.sh',
        owner: 'foreign-legacy-fixture',
      };
      const projectBytes = '{\n  "project": "spacing-is-user-owned",\n  "hooks": {"enabled": false, "Stop": '
        + JSON.stringify([legacyEntry]) + '}\n}\n';
      const homeBytes = '{"home":"legacy-user-owned","hooks":{"enabled":true,"PreToolUse":'
        + JSON.stringify([legacyEntry]) + '}}\n';
      const r = runInstaller(['--uninstall'], { beforeRun: fixture => {
        fs.mkdirSync(path.dirname(projectConfigPath(fixture)), { recursive: true });
        fs.writeFileSync(projectConfigPath(fixture), projectBytes, { mode: 0o600 });
        fs.writeFileSync(legacyHomeConfigPath(fixture), homeBytes, { mode: 0o600 });
      } });
      assertReal(r.status === 0,
        'R3-ignored-configs: uninstall with no ownership receipt exits 0');
      assertReal(fs.readFileSync(projectConfigPath(r), 'utf8') === projectBytes,
        'R3-ignored-configs: unreceipted project .zcode/config.json remains byte-identical');
      assertReal(fs.readFileSync(legacyHomeConfigPath(r), 'utf8') === homeBytes,
        'R3-ignored-configs: unreceipted legacy ZCODE_HOME/config.json remains byte-identical');
      clean(r);
    }

    // Never follow a project config.json symlink during either half of the
    // lifecycle. A project receipt and a receipt-owned legacy migration target
    // are present as well: refusing the operation must preserve all three
    // ownership boundaries, rather than partially migrating the legacy target.
    for (const operation of ['install', 'uninstall']) {
      const externalProjectBytes = jsonBytes({
        project: 'external-project-owned',
        hooks: {
          enabled: true,
          events: {
            SessionStart: [{
              matcher: '*',
              hooks: [{ type: 'command', command: 'echo external-user-owned', timeout: 5 }],
            }],
          },
        },
      });
      const legacyOwned = { command: 'sh legacy-kaola-migration.sh', timeout: 5 };
      const legacyForeign = { command: 'sh foreign-user-hook.sh', timeout: 7 };
      const legacyConfigBytes = jsonBytes({
        hooks: { enabled: true, SessionStart: [legacyOwned, legacyForeign] },
      });
      let projectReceiptBytes = '';
      let legacyReceiptBytes = '';
      const r = runInstaller(operation === 'uninstall' ? ['--uninstall'] : [], {
        beforeRun: fixture => {
          const projectConfig = projectConfigPath(fixture);
          const externalProject = path.join(fixture.home, 'external-project-config-'
            + operation + '.json');
          fs.mkdirSync(path.dirname(projectConfig), { recursive: true });
          fs.writeFileSync(externalProject, externalProjectBytes, { mode: 0o600 });
          fs.symlinkSync(externalProject, projectConfig);
          const projectReceipt = {
            schema: 'kaola-workflow-zcode-hooks-v1',
            destination: path.resolve(projectConfig),
            priorEnabled: { present: true, value: true },
            priorEvents: { present: true },
            added: [],
          };
          projectReceiptBytes = jsonBytes(projectReceipt);
          fs.mkdirSync(path.dirname(projectReceiptPath(fixture)), { recursive: true });
          fs.writeFileSync(projectReceiptPath(fixture), projectReceiptBytes, { mode: 0o600 });

          const legacyConfig = liveConfigPath(fixture);
          fs.mkdirSync(path.dirname(legacyConfig), { recursive: true });
          fs.writeFileSync(legacyConfig, legacyConfigBytes, { mode: 0o600 });
          const legacyReceipt = {
            schema: 'kaola-workflow-zcode-hooks-v1',
            destination: path.resolve(legacyConfig),
            priorEnabled: { present: true, value: true },
            priorEvents: { present: false },
            added: [{ event: 'SessionStart', entry: legacyOwned }],
          };
          legacyReceiptBytes = jsonBytes(legacyReceipt);
          fs.mkdirSync(path.dirname(legacyReceiptPath(fixture)), { recursive: true });
          fs.writeFileSync(legacyReceiptPath(fixture), legacyReceiptBytes, { mode: 0o600 });
        },
      });
      const externalProject = path.join(r.home, 'external-project-config-' + operation + '.json');
      const projectConfig = projectConfigPath(r);
      assertReal(r.status !== 0,
        'R3-config-symlink[' + operation + ']: installer fails closed on project config.json symlink '
        + '(got status ' + r.status + ')');
      assertReal(fs.lstatSync(projectConfig).isSymbolicLink(),
        'R3-config-symlink[' + operation + ']: project config path remains a symlink, never replaced or followed');
      assertReal(fs.readFileSync(externalProject, 'utf8') === externalProjectBytes,
        'R3-config-symlink[' + operation + ']: external project target remains byte-identical');
      assertReal(fs.existsSync(projectReceiptPath(r))
        && fs.readFileSync(projectReceiptPath(r), 'utf8') === projectReceiptBytes,
        'R3-config-symlink[' + operation + ']: project config receipt remains byte-identical');
      assertReal(fs.readFileSync(liveConfigPath(r), 'utf8') === legacyConfigBytes,
        'R3-config-symlink[' + operation + ']: legacy migration target remains byte-identical');
      assertReal(fs.existsSync(legacyReceiptPath(r))
        && fs.readFileSync(legacyReceiptPath(r), 'utf8') === legacyReceiptBytes,
        'R3-config-symlink[' + operation + ']: legacy migration receipt remains byte-identical');
      clean(r);
    }

    // Atomic replacement must preserve a user's restrictive mode on both
    // merge and uninstall, even though a fresh inode is published.
    {
      const r = runInstaller([], { beforeRun: fixture => {
        const live = liveConfigPath(fixture);
        fs.mkdirSync(path.dirname(live), { recursive: true });
        fs.writeFileSync(live, jsonBytes(userConfigSeed()), { mode: 0o600 });
        fs.chmodSync(live, 0o600);
      } });
      const live = liveConfigPath(r);
      assertReal(r.status === 0 && configMode(live) === 0o600,
        'R3-config-mode: install preserves an existing live config mode of 0600');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, ZCODE_HOME: r.zcodeHome }),
        encoding: 'utf8',
      });
      assertReal(ru.status === 0 && configMode(live) === 0o600,
        'R3-config-mode: uninstall preserves an existing live config mode of 0600');
      clean(r);
    }

    // A same-directory atomic publisher needs directory write permission to
    // create and rename its temporary sibling. With that publication step
    // denied, receipt-owned strip must fail and retain the complete original
    // bytes. Fresh ZCode installation never invokes the retired merge path.
    for (const operation of ['strip']) {
      const dir = fs.mkdtempSync(path.join(tmpBase(), 'zcode-r3-atomic-'));
      const dest = path.join(dir, 'config.json');
      let originalBytes = jsonBytes({
        sentinel: operation + '-original-bytes',
        hooks: {
          enabled: true,
          Stop: [{ command: 'echo kaola-atomic-owned' }, { command: 'echo foreign-atomic-fixture' }],
        },
      });
      try {
        fs.writeFileSync(dest, originalBytes, { mode: 0o600 });
        const receipt = {
          schema: 'kaola-workflow-zcode-hooks-v1',
          destination: path.resolve(dest),
          priorEnabled: { present: true, value: true },
          priorEvents: { present: false },
          added: [{ event: 'Stop', entry: { command: 'echo kaola-atomic-owned' } }],
        };
        fs.writeFileSync(dest + '.kaola-workflow-hooks-state.json', jsonBytes(receipt), { mode: 0o600 });
        fs.chmodSync(dir, 0o500);
        const attempted = runGeneratorCli([
          '--strip-hooks',
          '--dest=' + dest,
        ]);
        assertReal(attempted.status !== 0,
          'R3-atomic[' + operation + ']: denied same-directory publication exits non-zero '
          + '(got ' + attempted.status + ')');
        assertReal(fs.readFileSync(dest, 'utf8') === originalBytes,
          'R3-atomic[' + operation + ']: publication failure leaves the original config bytes intact');
        assertReal(configMode(dest) === 0o600,
          'R3-atomic[' + operation + ']: publication failure leaves the original 0600 mode intact');
      } finally {
        try { fs.chmodSync(dir, 0o700); } catch (_) { /* cleanup only */ }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// D2 — docs existence asserts (read-only). docs/zcode-edition.md carries the
// measured tier mapping, the 1M-context/no-hook rationale, and the honest
// live-dispatch boundary; the indexes name zcode; CHANGELOG has an entry.
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
    assertReal(/3\.10\.1/.test(doc),
      'D2: docs/zcode-edition.md mentions the ZCode 3.10.1 measurement');
    assertReal(/(?:1[,.]?000[,.]?000|1\s*million|1M)\b/i.test(doc),
      'D2: docs/zcode-edition.md records the measured one-million-token context');
    assertReal(/(?:no|without|does\s+not|not?)\s+(?:install|declare|use|need|require)?[\s\w-]{0,36}hooks?|hooks?[\s\w-]{0,36}(?:none|disabled|by\s+design|unneeded|not\s+installed)/i.test(doc),
      'D2: docs/zcode-edition.md states that ZCode has no Kaola hooks by design');
    assertReal(/self[- ]lock|self[- ]deadlock|deadlock|prompt\s+bind[\s\S]{0,100}(?:lock|loop)/i.test(doc),
      'D2: docs/zcode-edition.md records the live hook self-lock evidence');
    assertReal(/(?:bundled|locally\s+installed)[\s\S]{0,120}(?:ZCode(?:\s+App)?|CLI)/i.test(doc)
      && /live\s+named-subagent\/model\s+resolution\s+remains\s+\*\*unknown\*\*/i.test(doc)
      && /standalone[\s\S]{0,180}(?:executable|binary)[\s\S]{0,100}(?:absent|missing|not\s+available|not\s+on\s+PATH|unknown)/i.test(doc),
    'D2: docs/zcode-edition.md keeps bundled/installed and no-standalone/live-dispatch unknown boundaries honest');
    assertReal(!/zcode\s+hooks\s+trust\s+review|approve\s+all\s+(?:five|two|six)/i.test(doc),
      'D2: docs/zcode-edition.md does not advertise the retired ZCode hook trust flow');
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
