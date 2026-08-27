#!/usr/bin/env node
'use strict';
// Child processes in this file are classified per site (ADR 0013). The ratchet
// reads the spawn line or the line above it. Two classes appear here:
//   environment    installer / --write materialize / TREE_ROOT git probe
//   cli-contract   --check / --help / unknown --forge refuse / --print-tree-root

// ---------------------------------------------------------------------------
// test-cursor-edition.js — structural + parity validator for the Cursor
// runtime edition. Hand-rolled asserts (no framework). Mirror of
// test-grok-edition.js, scoped to the additive cursor surface. Run directly:
//   node scripts/test-cursor-edition.js
//
// Cursor is a coding-agent RUNTIME, not a forge, and it does not ride
// install.sh / edition-sync.js / npm test. It is delivered the Cursor-native
// way: named agents under `.cursor/agents/<role>.md` (Task types),
// flat commands under `.cursor/commands/<name>.md`, hook scripts under
// `.cursor/hooks/`, and `.cursor/hooks.json` (sessionStart compact-resume inject).
// Three canonical model classes: standard/reasoning/heavy
// agents carry unquoted Grok 4.6 frontmatter pins with medium/high/xhigh effort. Named-profile
// command cards carry no static per-dispatch model override; a built-in-only catalog-miss path may
// use only a resolver-listed live model slug. Compact resume after a session compact is a declared
// divergence: preCompact cannot inject; sessionStart additional_context can, on a new session only.
//
// Outside `npm test`, the forge chains, and the fast gate: an additive
// runtime edition is not a forge. The script exists so the suite is
// runnable and discoverable by name rather than only by remembering the path.
// ---------------------------------------------------------------------------

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const forgeLayout = require('./runtime-edition-forge.js');
const reviewerGenerator = require('./generate-agent-profiles.js');
const G = require('./test-git-fixture');
const syncMod = require('./sync-cursor-edition.js');
const cursorSurface = require('./kaola-workflow-cursor-surface.js');

const REPO = path.resolve(__dirname, '..');
const SYNC_JS = path.join(REPO, 'scripts', 'sync-cursor-edition.js');
const INSTALLER = path.join(REPO, 'install-cursor.sh');
const DEFAULT_FORGE = 'github';

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
  return '.cursor' + forgeLayout.outSuffix(forge);
}

const TREE_LABELS = new Set(forgeLayout.FORGES.map(f => treeLabel(f)));
const rootOf = rel => (TREE_LABELS.has(String(rel).split(/[\\/]/)[0]) ? TREE_ROOT : REPO);
const read = rel => fs.readFileSync(path.join(rootOf(rel), rel), 'utf8');
const exists = rel => fs.existsSync(path.join(rootOf(rel), rel));
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}

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

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function generatedTreeFiles(label) {
  return walkFiles(path.join(TREE_ROOT, label), label);
}

// Path B is a semantic relation, not a bag of nearby words. The live Cursor
// enum's built-in-only case carries the omitted model on the parent; it does
// not resolve a generated profile pin. Keep this oracle on the generated
// command bytes because those are what workflow-next and finalize ship.
const PATH_B_COMMANDS = Object.freeze(['workflow-next', 'kaola-workflow-finalize']);

function normalizePathBTerm(value) {
  return String(value || '').replace(/[\`'"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/^(?:a|an|the)\s+/, '');
}

function pathBRelations(text) {
  return String(text || '').split(/\r?\n/).map((line, index) => {
    if (!/\bbuilt-in-only\b/i.test(line) || !/\bomit-model\b/i.test(line)) return null;
    const m = line.match(/\bomit-model\s+is\s+the\s+([^,.;]+?)\s*,\s*not\s+(?:a\s+)?([^,.;]+)/i);
    return {
      lineNumber: index + 1,
      line,
      positive: m ? normalizePathBTerm(m[1]) : null,
      negative: m ? normalizePathBTerm(m[2]) : null,
    };
  }).filter(Boolean);
}

function inspectPathBConsumers(root) {
  const errors = [];
  const relations = {};
  for (const name of PATH_B_COMMANDS) {
    const rel = path.join('.cursor', 'commands', name + '.md');
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute)) {
      errors.push(name + ': missing generated consumer ' + rel);
      continue;
    }
    const found = pathBRelations(fs.readFileSync(absolute, 'utf8'));
    relations[name] = found;
    if (found.length !== 1) {
      errors.push(name + ': expected exactly one built-in-only omit-model relation, found ' + found.length);
      continue;
    }
    const relation = found[0];
    if (relation.positive !== 'parent' || relation.negative !== 'profile pin') {
      errors.push(name + ':' + relation.lineNumber + ': expected omit-model → parent and not → profile pin; '
        + 'got omit-model → ' + JSON.stringify(relation.positive) + ' and not → '
        + JSON.stringify(relation.negative));
    }
  }
  return { ok: errors.length === 0, errors, relations };
}

// The measured standalone CLI needs project profiles before it can expose the
// named Task catalog. That exception is a pre-dispatch transaction, not an
// ambient hook and not a fact that may be inferred onto either Cursor App
// host. Judge the generated consumer bytes so a renderer that drops, moves,
// or broadens the rule cannot hide behind a correct adapter source.
const CURSOR_CLI_MATERIALIZATION_COMMANDS = Object.freeze([
  'workflow-next',
  'kaola-workflow-finalize',
]);

function cursorCliMaterializationVerdict(text, forge) {
  const errors = [];
  const source = String(text || '');
  const heading = '## Cursor standalone CLI pre-dispatch materialization';
  const start = source.indexOf(heading);
  const end = start < 0 ? -1 : source.indexOf('\n## ', start + heading.length);
  const block = start < 0 ? '' : source.slice(start, end < 0 ? source.length : end);
  const ensureCalls = block.split(/\r?\n/)
    .filter(line => /\bnode\b/.test(line) && /--ensure-target\b/.test(line));

  if (start < 0) errors.push('missing standalone CLI pre-dispatch materialization section');
  if (ensureCalls.length !== 1) {
    errors.push('expected one installed-helper --ensure-target call, found ' + ensureCalls.length);
  } else {
    const call = ensureCalls[0];
    if (!/--ensure-target\s+"\$PWD"(?:\s|$)/.test(call)) {
      errors.push('helper target is not the exact explicit "$PWD" workspace');
    }
    if (!call.includes('--forge=' + forge)) {
      errors.push('helper call does not carry the generated forge --forge=' + forge);
    }
    if (!/node\s+"\$CURSOR_MATERIALIZER"/.test(call)) {
      errors.push('helper call does not execute the installed materializer binding');
    }
  }
  if (!/CURSOR_MATERIALIZER=.*\$\{CURSOR_HOME:-\$HOME\/\.cursor\}\/kaola-workflow\/scripts\/kaola-workflow-cursor-surface\.js/.test(block)) {
    errors.push('materializer is not resolved from the installed global Cursor authority');
  }
  if (!/only when[^.]*standalone Cursor CLI[^.]*local host/i.test(block)) {
    errors.push('materialization branch is not limited to standalone Cursor CLI local');
  }
  if (!/Cursor App[\s\S]{0,180}App-started Cloud[\s\S]{0,220}(?:do not|never) apply or infer[^.]*CLI materialization rule[^.]*App host/i.test(block)) {
    errors.push('App local and App-started Cloud do not retain a shared negative CLI-rule boundary');
  }
  if (!/Cursor App[\s\S]{0,180}App-started Cloud[^.]*separate hosts[^.]*inspect their live Task catalog/i.test(block)) {
    errors.push('App local and App-started Cloud are not separate live-catalog decisions');
  }
  if (!/Immediately before the first named Kaola child dispatch/i.test(block)) {
    errors.push('installed helper is not required immediately before named dispatch');
  }
  const flatBlock = block.replace(/\s+/g, ' ');
  const currentAt = flatBlock.indexOf('status: current');
  const noOpAt = flatBlock.indexOf('no-op', currentAt);
  const materializedAt = flatBlock.indexOf('status: materialized');
  const stopAt = flatBlock.indexOf('stop named dispatch', materializedAt);
  const restartAt = flatBlock.indexOf('new Cursor CLI process', stopAt);
  if (!(currentAt >= 0 && noOpAt > currentAt && materializedAt > noOpAt
      && stopAt > materializedAt && restartAt > stopAt)) {
    errors.push('current/materialized outcomes do not preserve no-op versus restart behavior');
  }
  const missingAt = flatBlock.indexOf('Missing or stale global authority');
  const collisionAt = flatBlock.indexOf('collision', missingAt);
  const symlinkAt = flatBlock.indexOf('symlink', collisionAt);
  const closedAt = flatBlock.indexOf('fails closed before project mutation', symlinkAt);
  if (!(missingAt >= 0 && collisionAt > missingAt && symlinkAt > collisionAt && closedAt > symlinkAt)) {
    errors.push('authority/collision/symlink failures are not specified as fail-closed');
  }
  if (!/never substitute an ambient cwd copier or a sessionStart materializer/i.test(block)) {
    errors.push('ambient and sessionStart materialization are not explicitly excluded');
  }
  return { ok: errors.length === 0, errors, block, ensureCalls };
}

// A child mode lets the mutation fixture exercise this same generated-byte
// oracle without recursively running the full edition suite.
if (process.argv.includes('--path-b-oracle')) {
  const verdict = inspectPathBConsumers(TREE_ROOT);
  if (!verdict.ok) {
    for (const error of verdict.errors) console.error('PATH-B-ORACLE RED: ' + error);
    process.exit(1);
  }
  console.log('PATH-B-ORACLE GREEN: built-in-only omit-model carries the parent, not a profile pin');
  process.exit(0);
}

const trackedAgents = () => fs.readdirSync(path.join(REPO, 'agents'))
  .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
const commandNamesFor = forge => forgeLayout.commandSources(forge)
  .map(s => s.basename.replace(/\.md$/, '')).sort();

function canonicalAgentClass(name) {
  const { fm } = parseFrontmatter(read('agents/' + name + '.md'));
  const model = String(fm.model || '').trim().toLowerCase();
  const binding = CURSOR_MODEL_CLASS_TIERS[model];
  return binding
    ? { model, tier: binding.tier, pin: binding.pin }
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
// CURSOR_RUNTIME_NATIVE — the frontmatter tier pin as a DECLARED
// table entry, not merely as prose. Deleting the declaration reds this suite.
// ---------------------------------------------------------------------------
const CURSOR_RUNTIME_NATIVE = Object.freeze({
  frontmatter_tier_pin:
    'Cursor generated agent frontmatter pins canonical standard/reasoning/heavy model classes to unquoted grok-4.6[effort=medium/high/xhigh]; command cards omit per-call model dispatch.',
  session_start_resume_injection:
    'Cursor preCompact cannot inject into the agent after compact; sessionStart additional_context is the injection surface, and only on a new session. Durable resume is mission-list.md.',
});

// The canonical model tokens are the existing portable class markers, not a
// second role roster. Derive each expected Cursor binding from agents/*.md so a
// role addition or tier move is judged by the canonical frontmatter itself.
const CURSOR_MODEL_CLASS_TIERS = Object.freeze({
  sonnet: Object.freeze({ tier: 'standard', pin: 'grok-4.6[effort=medium]' }),
  standard: Object.freeze({ tier: 'standard', pin: 'grok-4.6[effort=medium]' }),
  opus: Object.freeze({ tier: 'reasoning', pin: 'grok-4.6[effort=high]' }),
  reasoning: Object.freeze({ tier: 'reasoning', pin: 'grok-4.6[effort=high]' }),
  fable: Object.freeze({ tier: 'heavy', pin: 'grok-4.6[effort=xhigh]' }),
  heavy: Object.freeze({ tier: 'heavy', pin: 'grok-4.6[effort=xhigh]' }),
});

// #1018: CURSOR_MODEL_CLASS_PINS is the production map (not exported). The
// allowlist/pin must gain fable -> grok-4.6[effort=xhigh].
const CURSOR_SYNC_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'sync-cursor-edition.js'), 'utf8');
const CURSOR_MODEL_CLASS_PINS_PIN = (() => {
  const m = CURSOR_SYNC_SRC.match(/const CURSOR_MODEL_CLASS_PINS = Object\.freeze\(\{([\s\S]*?)\}\)/);
  const out = {};
  if (!m) return out;
  for (const row of m[1].split('\n')) {
    const mm = row.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*'([^']+)'/);
    if (mm) out[mm[1]] = mm[2];
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Additive boundary — cursor is a runtime, not a forge. Read the tree; do not
// modify those files. install-all.sh MUST name cursor (red until wired).
// ---------------------------------------------------------------------------
{
  const editionSyncSrc = fs.readFileSync(path.join(REPO, 'scripts', 'edition-sync.js'), 'utf8');
  const forgesDecl = editionSyncSrc.match(/const FORGES\s*=\s*\[([^\]]*)\]/);
  assert(!!forgesDecl, 'B0: edition-sync.js declares FORGES');
  const forges = forgesDecl
    ? forgesDecl[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
    : [];
  assert(!forges.includes('cursor'),
    'B0: edition-sync.js FORGES does not include cursor — got ' + JSON.stringify(forges));

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const npmTest = String((pkg.scripts && pkg.scripts.test) || '');
  assert(!npmTest.includes('test-cursor-edition.js'),
    'B0: package.json scripts.test does not invoke test-cursor-edition.js');

  const installSh = fs.readFileSync(path.join(REPO, 'install.sh'), 'utf8');
  assert(!/\bcursor\b/i.test(installSh),
    'B0: install.sh does not mention cursor as a runtime to install');

  const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
  assert(/\bcursor\b/.test(installAll) && installAll.includes('install-cursor.sh'),
    'B0: install-all.sh MUST name cursor and install-cursor.sh (additive runtime, not a forge gate)');
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
  assert(forgeLayout.FORGES.length > 0,
    'D0: the forge axis must be non-empty — an empty axis probes nothing and would skip in silence');
  assert(forgeLayout.FORGES.includes(DEFAULT_FORGE),
    'D0: the forge axis includes github (the default cursor tree label is .cursor)');
  for (const forge of forgeLayout.FORGES) {
    const label = treeLabel(forge);
    if (!fs.existsSync(treeRootFor(forge))) { absent.push(label); continue; }
    if (!fs.existsSync(SYNC_JS)) {
    console.error('cursor-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
      + 'disk but scripts/sync-cursor-edition.js is missing, so drift cannot be observed.');
      process.exit(1);
    }
    const r = runGeneratorCli(['--forge=' + forge, '--check']);
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\ncursor-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-cursor-edition.js --forge=' + forge + ' --write'
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
// Self-provision: regenerate .cursor/ from tracked canonical sources before any
// assertion that reads it. If the generator is missing, fail with a clear
// "generator not present" (the HEAD-red this suite is authored to produce).
// ---------------------------------------------------------------------------
{
  if (!fs.existsSync(SYNC_JS)) {
    assert(false, 'generator not present: scripts/sync-cursor-edition.js is required to materialize the cursor edition');
    console.error('FATAL: generator not present (scripts/sync-cursor-edition.js). '
      + 'The cursor edition suite cannot self-provision or judge a generated tree.');
    console.error('\ncursor-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
      + driftVerdict);
    process.exit(1);
  }
  const r = runGenerator(['--write']);
  if (r.status !== 0) {
    console.error('FATAL: sync-cursor-edition --write failed (test cannot proceed):');
    console.error(r.stderr || r.stdout || '(no output)');
    process.exit(1);
  }
}

// D1 — D0's presence probe must be able to SEE a materialized tree.
assert(fs.existsSync(treeRootFor(DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked '
  + 'nothing. This checkout is ' + REPO + '; the tree root resolved to ' + TREE_ROOT + '. If those '
  + 'differ, the writer put the tree somewhere else and the two resolutions have diverged');
assert(fs.existsSync(path.join(TREE_ROOT, '.cursor')),
  'D1: the github tree lands at <tree-root>/.cursor (got missing at ' + path.join(TREE_ROOT, '.cursor') + ')');
assert(treeLabel('github') === '.cursor'
  && treeLabel('gitlab') === '.cursor-gitlab'
  && treeLabel('gitea') === '.cursor-gitea',
  'D1: treeLabel is .cursor / .cursor-gitlab / .cursor-gitea (kimi-style outSuffix)');

const canonAgents = trackedAgents();
const canonCommandNames = commandNamesFor(DEFAULT_FORGE);
const canonRosters = canonicalRosters(canonAgents);

// ---------------------------------------------------------------------------
// G0 — THE SUBJECT UNDER TEST IS THE GENERATOR'S OUTPUT, derived from TRACKED
// canonical sources. An absent tree must fail loudly rather than let every
// readdir-driven loop iterate over nothing.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(path.join(TREE_ROOT, '.cursor', 'agents'))
    && fs.existsSync(path.join(TREE_ROOT, '.cursor', 'commands'));
  assert(provisioned,
    'G0: the generated .cursor/agents and .cursor/commands trees exist after sync --write');
  if (!provisioned) {
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.cursor') + ' — nothing below can be tested.');
    process.exit(1);
  }
  assert(canonAgents.length > 0 && canonCommandNames.length > 0,
    'G0-roster: the canonical agents/ inventory and routing-registry command surfaces are both non-empty');
  assert(canonAgents.includes('knowledge-lookup'),
    'G0-roster: knowledge-lookup is in the canonical agents/*.md inventory');
  assert(canonRosters.standard.length > 0,
    'G0-roster: canonical sonnet/standard model class derives a non-empty standard roster');
  assert(canonRosters.reasoning.length > 0,
    'G0-roster: canonical opus/reasoning model class derives a non-empty reasoning roster');
  assert(canonRosters.heavy.includes('planner') && canonRosters.heavy.includes('code-architect'),
    'G0-roster: planner-class (planner, code-architect) is the heavy (fable) roster — heavy='
    + JSON.stringify(canonRosters.heavy));
  assert(canonRosters.unknown.length === 0,
    'G0-roster: every canonical agent model belongs to the known sonnet/opus/fable classes — unknown='
    + JSON.stringify(canonRosters.unknown));
  assert(Object.prototype.hasOwnProperty.call(CURSOR_MODEL_CLASS_PINS_PIN, 'fable'),
    'G0-fable: CURSOR_MODEL_CLASS_PINS must include a fable entry');
  assert(CURSOR_MODEL_CLASS_PINS_PIN.fable === 'grok-4.6[effort=xhigh]',
    'G0-fable: CURSOR_MODEL_CLASS_PINS.fable must be grok-4.6[effort=xhigh] — got '
    + JSON.stringify(CURSOR_MODEL_CLASS_PINS_PIN.fable));
  for (const name of canonAgents) {
    if (name === 'planner' || name === 'code-architect') continue;
    assert(canonicalAgentClass(name).model !== 'fable',
      'G0-roster: ' + name + ' must not change tier to fable — got ' + canonicalAgentClass(name).model);
  }
}

// An unrecognised canonical class must be rejected by the subject rather than
// silently inventing a fallback roster or emitting inherit. This synthetic
// canonical document exercises the generator's fail-closed branch directly.
{
  const unknownCanonical = [
    '---',
    'name: cursor-unknown-class-probe',
    'description: unknown class probe',
    'model: unsupported-class-token',
    '---',
    '',
    'probe',
    '',
  ].join('\n');
  let rejected = false;
  try {
    syncMod.renderAgent(unknownCanonical, 'cursor-unknown-class-probe');
  } catch (_) {
    rejected = true;
  }
  assert(rejected,
    'G0-roster: renderAgent rejects an unsupported canonical model token (fail closed; no invented roster)');
}

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
  assert(accepted,
    'G0-fable: renderAgent accepts fable (must not silently classify as standard) — ' + rendered);
  assert(/model: grok-4\.6\[effort=xhigh\]/.test(rendered),
    'G0-fable: renderAgent pins fable as grok-4.6[effort=xhigh] — got ' + rendered.slice(0, 200));
}

function agentRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/agents/' + name + '.md';
}
function commandRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/commands/' + name + '.md';
}

{
  const heavyVariants = ['code-reviewer-heavy', 'adversarial-verifier-heavy', 'security-reviewer-heavy'];
  for (const name of heavyVariants) {
    assert(!canonAgents.includes(name),
      'G0-ac6: no cursor heavy-variant reviewer agent ' + name + ' (escalation is claude+codex only)');
    assert(!exists(agentRel(name)),
      'G0-ac6: generated cursor tree must not ship ' + name);
  }
}

// ---------------------------------------------------------------------------
// G1: agents — exact set = canonical agents/*.md. knowledge-lookup MUST be
// present. Frontmatter: name, description, and one exact unquoted model pin
// derived from the canonical model class. NO separate effort: /
// reasoning_effort: field. Frontmatter `tools:` is absent or contains no Claude MCP
// tool ids (mcp__). Body examples may still name those tools — Grok inspect
// dropped knowledge-lookup for an unquoted YAML description, not for body mcp__.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.cursor', 'agents');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonAgents),
    'G1: .cursor/agents set == canonical agents/*.md — canonical=' + JSON.stringify(canonAgents)
    + ' generated=' + JSON.stringify(gen));
  assert(gen.includes('knowledge-lookup'),
    'G1: knowledge-lookup MUST be present under .cursor/agents/');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    assert(exists(rel), 'G1[' + name + ']: generated agent exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm, raw } = parseFrontmatter(content);
    assert(fm.name === name, 'G1[' + name + ']: frontmatter name is the role — got ' + JSON.stringify(fm.name));
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G1[' + name + ']: frontmatter has a non-empty description');
    const canonical = canonicalAgentClass(name);
    assert(canonical.tier !== 'unknown',
      'G1[' + name + ']: canonical model class is known — got ' + JSON.stringify(canonical.model));
    const modelLines = raw.split(/\r?\n/).filter(line => /^\s*model\s*:/.test(line));
    assert(modelLines.length === 1 && modelLines[0] === 'model: ' + canonical.pin,
      'G1[' + name + ']: model line is exactly the unquoted canonical tier pin '
      + JSON.stringify(canonical.pin) + ' — got ' + JSON.stringify(modelLines));
    assert(!/^\s*model\s*:\s*["']/m.test(raw),
      'G1[' + name + ']: model pin is not YAML-quoted (bracket syntax must remain raw)');
    assert(!/^\s*effort\s*:/m.test(raw) && !/^\s*reasoning_effort\s*:/m.test(raw),
      'G1[' + name + ']: no separate effort: / reasoning_effort: field (effort belongs in model ID)');
    assert(fm.readonly === 'true' || fm.readonly === 'false',
      'G1[' + name + ']: frontmatter readonly is true or false — got ' + JSON.stringify(fm.readonly));
    assert(!/^\s*prompt_mode\s*:/m.test(raw) && !/^\s*permission_mode\s*:/m.test(raw)
      && !/^\s*agents_md\s*:/m.test(raw),
      'G1[' + name + ']: NO Grok-only prompt_mode / permission_mode / agents_md fields');
    assert(!/\bmcp__/.test(raw),
      'G1[' + name + ']: frontmatter carries no Claude MCP tool id (mcp__) — a tools: list of those '
      + 'ids is not a Cursor agent field; body examples may still name them');
    assert(!Object.prototype.hasOwnProperty.call(fm, 'tools') || !/\bmcp__/.test(String(fm.tools)),
      'G1[' + name + ']: tools: is absent, or contains no mcp__ ids — got '
      + JSON.stringify(fm.tools));
    const canonFm = parseFrontmatter(fs.readFileSync(path.join(REPO, 'agents', name + '.md'), 'utf8')).fm;
    const toolSet = new Set(syncMod.parseTools(canonFm.tools).map(x => String(x).toLowerCase()));
    const expectedReadonly = syncMod.isReadOnlyRole(toolSet) ? 'true' : 'false';
    assert(fm.readonly === expectedReadonly,
      'G1[' + name + ']: readonly matches Write/Edit derivation from canonical tools — expected '
      + expectedReadonly + ' got ' + JSON.stringify(fm.readonly));
  }
}

// ---------------------------------------------------------------------------
// G2: commands — exact set = routing-registry commandSources() for the forge,
// not a hand list. Finalize follows the live Cursor Task schema/current catalog; it must not
// mechanically translate portable Agent cards into an invented static Task field list.
// No CLAUDE_PLUGIN_ROOT, no ~/.claude/kaola-workflow. --runtime cursor present
// (not --runtime claude). No model="{...}" placeholders, no per-call model="
// overrides, and no vendor model dispatch in command cards.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.cursor', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .cursor/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const staticDispatchFields = text => String(text || '').split(/\r?\n/)
    .filter(line => /^\s*(?:subagent_type|description)\s*=/.test(line));
  const lineStartCall = text => /^(?:Agent|Task)\(/m.test(String(text || ''));
  let canonicalFinalizeRoles = [];
  for (const name of canonCommandNames) {
    const src = forgeLayout.commandSources(DEFAULT_FORGE).find(s => s.basename === name + '.md');
    assert(!!src, 'G2[' + name + ']: commandSources() names this surface');
    const canon = src ? fs.readFileSync(src.absPath, 'utf8') : '';
    const rel = commandRel(name);
    assert(exists(rel), 'G2[' + name + ']: generated command exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm } = parseFrontmatter(content);
    assert(fm.name === name, 'G2[' + name + ']: frontmatter name matches the command — got ' + JSON.stringify(fm.name));
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G2[' + name + ']: frontmatter has a non-empty description');
    assert(!/^Agent\(/m.test(content),
      'G2[' + name + ']: no line-start Claude Agent( dispatch card');
    assert(!/\bmodel\s*=\s*["']/.test(content),
      'G2[' + name + ']: generated command stays free of per-call model dispatch');
    const canonHits = [...canon.matchAll(/^Agent\(\n\s+subagent_type="([^"]+)"/gm)].map(m => m[1]);
    if (name === 'kaola-workflow-finalize') {
      canonicalFinalizeRoles = canonHits;
      assert(!lineStartCall(content),
        'G2[kaola-workflow-finalize]: live-schema Cursor guidance has no static Agent( or Task( call card');
      assert(staticDispatchFields(content).length === 0,
        'G2[kaola-workflow-finalize]: no invented static subagent_type= or description= fields escape into the Cursor render');
      for (const role of canonHits) {
        assert(content.includes(role),
          'G2[kaola-workflow-finalize]: native prose preserves the canonical dispatch role ' + role);
      }
      for (const boundary of [
        'failure command', 'evidence path', 'working directory', 'custody boundary',
        'changed files', 'checklist',
      ]) {
        assert(content.toLowerCase().includes(boundary),
          'G2[kaola-workflow-finalize]: native prose preserves the ' + boundary + ' brief boundary');
      }
      assert(/live [`]?task[`]? schema/i.test(content)
        && /(?:current|live|runtime.reported) task (?:catalog|enum)/i.test(content),
      'G2[kaola-workflow-finalize]: native prose routes through the live Task schema and current host catalog');
    }
    if (name === 'workflow-init') {
      assert(typeof fm['argument-hint'] === 'string' && fm['argument-hint'].length > 0,
        'G2[workflow-init]: preserves argument-hint (Commands support $ARGUMENTS)');
      assert(/\$ARGUMENTS/.test(content),
        'G2[workflow-init]: preserves $ARGUMENTS');
    }
  }
  assert(canonicalFinalizeRoles.length > 0,
    'G2: canonical finalize carries named-role dispatch meaning for the Cursor renderer to preserve');

  for (const name of ['workflow-next', 'kaola-workflow-finalize']) {
    const content = exists(commandRel(name)) ? read(commandRel(name)) : '';
    assert(/product surfaces and App local\/Cloud hosts remain independent/i.test(content),
      'G2[' + name + ']: Cursor CLI, App local, and App Cloud remain distinct surfaces/hosts');
    assert(/committed project profiles alone are a negative control/i.test(content),
      'G2[' + name + ']: committed project profiles are a Cloud negative control, not its carrier');
    assert(/install globally inside the dashboard-managed remote environment, have the user save it, and open a fresh parent whose visible Build identity matches the tested Build before treating a still-missing name as a capability gap/i.test(content),
      'G2[' + name + ']: Cloud gap verdict follows remote global install, user Save, and exact-Build fresh-parent reload');
    assert(/generic New Agent entry may resolve another personal environment for the repository/i.test(content),
      'G2[' + name + ']: Cloud setup guidance rejects ambiguous same-repository environment resolution');
    assert(/omit a requested per-call model only when/i.test(content),
      'G2[' + name + ']: omit-model is the named-profile carrier, not a catalog-miss substitute');
    assert(/Cloud negative control exposed [`']?explore/i.test(content),
      'G2[' + name + ']: Cloud negative control exposes explore as itself');
    assert(/corrected saved environment exposed all 14 Kaola types/i.test(content),
      'G2[' + name + ']: saved Cloud environment exposes all 14 Kaola types');
    assert(/resolver-listed model slug/i.test(content),
      'G2[' + name + ']: catalog-miss listed model slugs are a live-schema effort lever');
  }

  const pathBVerdict = inspectPathBConsumers(TREE_ROOT);
  assert(pathBVerdict.ok,
    'G2-path-b: generated workflow-next and finalize carry the built-in-only omit-model relation '
    + '(parent, not profile pin)' + (pathBVerdict.ok ? '' : ' — ' + pathBVerdict.errors.join(' | ')));

  const nativeBoundary = 'Use the live Task schema for tdd-guide with task, custody, evidence, and stop boundaries.';
  assert(!lineStartCall(nativeBoundary) && staticDispatchFields(nativeBoundary).length === 0,
    'G2-mutation: honest live-schema prose has no portable static dispatch fields');
  const inventedCard = nativeBoundary
    + '\nTask(\n  subagent_type="tdd-guide",\n  description="Routed fix"\n)';
  assert(lineStartCall(inventedCard) && staticDispatchFields(inventedCard).length === 2,
    'G2-mutation RED: appending a static Task(subagent_type, description) card is detected');
}

// ---------------------------------------------------------------------------
// G2-cli-materialization — both generated dispatch consumers preserve the
// standalone-CLI-only safe materialization transaction. Mutate the generated
// subject itself to prove the oracle rejects an omitted/ambient target and an
// App/Cloud scope inversion.
// ---------------------------------------------------------------------------
{
  for (const name of CURSOR_CLI_MATERIALIZATION_COMMANDS) {
    const rel = commandRel(name);
    const content = exists(rel) ? read(rel) : '';
    const verdict = cursorCliMaterializationVerdict(content, DEFAULT_FORGE);
    assert(verdict.ok,
      'G2-cli-materialization[' + name + ']: generated consumer runs the installed safe helper '
      + 'with explicit "$PWD" only for standalone CLI before named dispatch — '
      + verdict.errors.join(' | '));

    if (verdict.block) {
      const omitted = content.replace('--ensure-target "$PWD"', '--ensure-target');
      const omittedVerdict = cursorCliMaterializationVerdict(omitted, DEFAULT_FORGE);
      assert(omitted !== content && !omittedVerdict.ok
        && omittedVerdict.errors.some(error => /exact explicit/.test(error)),
      'G2-cli-materialization-mutation[' + name + ']: removing the explicit target is rejected — '
        + omittedVerdict.errors.join(' | '));

      const ambient = content.replace('--ensure-target "$PWD"', '--ensure-target "."');
      const ambientVerdict = cursorCliMaterializationVerdict(ambient, DEFAULT_FORGE);
      assert(ambient !== content && !ambientVerdict.ok
        && ambientVerdict.errors.some(error => /exact explicit/.test(error)),
      'G2-cli-materialization-mutation[' + name + ']: ambientizing the target to cwd shorthand is rejected — '
        + ambientVerdict.errors.join(' | '));

      const appScoped = content.replace(
        'do not apply or infer this CLI materialization rule for either App host',
        'apply this CLI materialization rule for both App hosts');
      const appVerdict = cursorCliMaterializationVerdict(appScoped, DEFAULT_FORGE);
      assert(appScoped !== content && !appVerdict.ok
        && appVerdict.errors.some(error => /negative CLI-rule boundary/.test(error)),
      'G2-cli-materialization-mutation[' + name + ']: applying the CLI rule to App local/Cloud is rejected — '
        + appVerdict.errors.join(' | '));
    }
  }
}

// ---------------------------------------------------------------------------
// G2-path-b-mutation — mutate the actual Cursor adapter authority in a
// throwaway source tree, regenerate both shipped consumers, and require the
// semantic oracle above to go RED. A phrase-presence check or the exported
// CURSOR_MODEL_DISPATCH_BLOCK residue would not observe this path.
// ---------------------------------------------------------------------------
{
  const SOURCE_TREES = ['scripts', 'agents', 'commands', 'hooks', 'templates'];
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(tmpBase(), 'cursor-g2-path-b-')));
  try {
    const missing = SOURCE_TREES.filter(name => !fs.existsSync(path.join(REPO, name)));
    assert(missing.length === 0,
      'G2-path-b-mutation: fixture source trees exist — missing ' + JSON.stringify(missing));
    if (missing.length === 0) {
      for (const name of SOURCE_TREES) {
        fs.cpSync(path.join(REPO, name), path.join(scratch, name), { recursive: true });
      }

      const adapterPath = path.join(scratch, 'templates', 'agents', 'runtime-capabilities.json');
      const adapterText = fs.readFileSync(adapterPath, 'utf8');
      let authority = null;
      try { authority = JSON.parse(adapterText); } catch (e) {
        assert(false, 'G2-path-b-mutation: runtime-capabilities.json parses — ' + e.message);
      }

      const carrier = authority && authority.runtimes && authority.runtimes.cursor
        && authority.runtimes.cursor.capabilities
        && authority.runtimes.cursor.capabilities.delegation_guidance
        && authority.runtimes.cursor.capabilities.delegation_guidance.dispatch_carrier;
      const authorityRelation = pathBRelations(carrier);
      const relationReady = typeof carrier === 'string'
        && authorityRelation.length === 1
        && authorityRelation[0].positive === 'parent'
        && authorityRelation[0].negative === 'profile pin';
      assert(relationReady,
        'G2-path-b-mutation: Cursor adapter dispatch_carrier has the parent/not-profile Path B relation');

      if (relationReady) {
        const parentRelation = /\bomit-model\s+is\s+the\s+parent\s*,\s*not\s+(?:a\s+)?profile\s+pin\b/i;
        const mutatedCarrier = carrier.replace(parentRelation,
          'omit-model is the profile pin, not the parent');
        const carrierCount = adapterText.split(carrier).length - 1;
        const mutationReady = mutatedCarrier !== carrier && carrierCount === 1;
        assert(mutationReady,
          'G2-path-b-mutation: the actual Cursor dispatch_carrier has one reversible Path B predicate '
          + '(occurrences=' + carrierCount + ')');

        if (mutationReady) {
          fs.writeFileSync(adapterPath, adapterText.replace(carrier, mutatedCarrier));

          const syncPath = path.join(scratch, 'scripts', 'sync-cursor-edition.js');
          // spawn-class: environment
          const rootProbe = spawnSync(process.execPath, [syncPath, '--print-tree-root'], {
            cwd: scratch, encoding: 'utf8',
          });
          const printedRoot = String(rootProbe.stdout || '').trim();
          const rootReady = rootProbe.status === 0 && printedRoot === scratch;
          assert(rootReady,
            'G2-path-b-mutation: scratch generator writes its own tree — status ' + rootProbe.status
            + ', root ' + JSON.stringify(printedRoot) + ', expected ' + JSON.stringify(scratch));

          if (rootReady) {
            // spawn-class: environment
            const generated = spawnSync(process.execPath, [syncPath, '--write'], {
              cwd: scratch, encoding: 'utf8',
            });
            const generatedOutput = String(generated.stdout || '') + String(generated.stderr || '');
            assert(generated.status === 0,
              'G2-path-b-mutation: reversed adapter regenerates Cursor consumers — exit '
              + generated.status + ' — ' + generatedOutput.split('\n').slice(0, 3).join(' | '));

            if (generated.status === 0) {
              const mutatedVerdict = inspectPathBConsumers(scratch);
              const oppositeReached = PATH_B_COMMANDS.every(name => {
                const rows = mutatedVerdict.relations[name] || [];
                return rows.length === 1
                  && rows[0].positive === 'profile pin'
                  && rows[0].negative === 'parent';
              });
              assert(oppositeReached,
                'G2-path-b-mutation: adapter reversal reaches both generated consumers with the '
                + 'opposite profile-pin/not-parent relation — ' + JSON.stringify(mutatedVerdict.relations));
              assert(!mutatedVerdict.ok && mutatedVerdict.errors.length === PATH_B_COMMANDS.length,
                'G2-path-b-mutation: generated semantic reversal is rejected for both consumers — '
                + mutatedVerdict.errors.join(' | '));

              // spawn-class: environment
              const probe = spawnSync(process.execPath,
                [path.join(scratch, 'scripts', 'test-cursor-edition.js'), '--path-b-oracle'], {
                  cwd: scratch, encoding: 'utf8',
                });
              const probeOutput = String(probe.stdout || '') + String(probe.stderr || '');
              assert(probe.status !== 0,
                'G2-path-b-mutation RED: the focused generated-consumer oracle exits non-zero on the '
                + 'reversed adapter relation (got ' + probe.status + ')');
              assert(/PATH-B-ORACLE RED: workflow-next:/.test(probeOutput)
                && /PATH-B-ORACLE RED: kaola-workflow-finalize:/.test(probeOutput),
              'G2-path-b-mutation RED: oracle names both contradictory generated consumers — '
                + JSON.stringify(probeOutput.trim()));
            }
          }
        }
      }
    }
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// G2-leak forbids vendor model slugs on command/hook cards except for the
// explicit tier bindings inside the runtime-delegation block on next/finalize.
{
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
  const VENDOR_SLUG = /\bgrok-4\.\d\b|\bgrok-build\b/;
  const DELEGATION_START = '<!-- KW-RUNTIME-DELEGATION-START -->';
  const DELEGATION_END = '<!-- KW-RUNTIME-DELEGATION-END -->';
  const TIER_GUIDANCE_COMMANDS = new Set([
    commandRel('workflow-next'),
    commandRel('kaola-workflow-finalize'),
  ]);

  function vendorSlugScope(rel, content) {
    if (!TIER_GUIDANCE_COMMANDS.has(rel)) {
      return VENDOR_SLUG.test(content)
        ? { ok: false, reason: 'vendor model slug outside an allowed command' }
        : { ok: true, reason: '' };
    }

    const startCount = content.split(DELEGATION_START).length - 1;
    const endCount = content.split(DELEGATION_END).length - 1;
    const start = content.indexOf(DELEGATION_START);
    const end = content.indexOf(DELEGATION_END);
    if (startCount !== 1 || endCount !== 1 || start < 0 || end < start) {
      return { ok: false, reason: 'runtime-delegation block is not unique and ordered' };
    }

    const inside = content.slice(start + DELEGATION_START.length, end);
    const outside = content.slice(0, start) + content.slice(end + DELEGATION_END.length);
    if (!VENDOR_SLUG.test(inside)) {
      return { ok: false, reason: 'runtime-delegation block has no tier model slug' };
    }
    if (VENDOR_SLUG.test(outside)) {
      return { ok: false, reason: 'vendor model slug escaped the runtime-delegation block' };
    }
    return { ok: true, reason: '' };
  }

  let runtimeCursor = 0;
  for (const rel of generatedTreeFiles('.cursor')) {
    const content = read(rel);
    assert(!/CLAUDE_PLUGIN_ROOT/.test(content),
      'G2-leak: ' + rel + ': no CLAUDE_PLUGIN_ROOT');
    assert(!/~\/\.claude\/kaola-workflow/.test(content)
      && !/\$HOME\/\.claude\/kaola-workflow/.test(content),
      'G2-leak: ' + rel + ': no ~/.claude/kaola-workflow');
    assert(!/--runtime claude\b/.test(content),
      'G2-leak: ' + rel + ': no --runtime claude (rewritten to --runtime cursor)');
    assert(!/model="\{/.test(content),
      'G2-leak: ' + rel + ': no model="{...}" placeholder');
    assert(!/\bmodel="/.test(content),
      'G2-leak: ' + rel + ': no per-call model=" override in generated dispatch surfaces');
    if (!/\/agents\//.test(rel)) {
      const scope = vendorSlugScope(rel, content);
      assert(scope.ok,
        'G2-leak: ' + rel + ': vendor model slugs are confined to the unique runtime-delegation tier block on next/finalize — '
        + scope.reason);
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          'G2-leak: ' + rel + ':' + (i + 1) + ': Claude model noun "' + m[0]
          + '" leaked into generated cursor prose');
      }
    }
    if (/--runtime cursor\b/.test(content)) runtimeCursor++;
  }
  assert(runtimeCursor > 0,
    'G2: at least one generated file stamps --runtime cursor (claim/startup bite)');
  assert(/--runtime cursor\b/.test(read(commandRel('workflow-next'))),
    'G2[workflow-next]: claim invocation stamps --runtime cursor');
  assert(/CURSOR_HOME/.test(read(commandRel('workflow-next'))),
    'G2[workflow-next]: script resolver names CURSOR_HOME');

  // Mutation bite: an allowed command path is not itself a blanket exemption.
  // The same scope check must reject a tier slug copied past the closing marker.
  for (const rel of TIER_GUIDANCE_COMMANDS) {
    const mutated = read(rel) + '\nOutside-block mutation: grok-4.6\n';
    const scope = vendorSlugScope(rel, mutated);
    assert(!scope.ok && scope.reason === 'vendor model slug escaped the runtime-delegation block',
      'G2-leak-mutation: ' + rel + ': vendor slug outside the marked block still fails');
  }
}

// ---------------------------------------------------------------------------
// G2-declaration: CURSOR_RUNTIME_NATIVE.frontmatter_tier_pin exists, names
// the two canonical class pins, and the generated tree matches it.
// ---------------------------------------------------------------------------
{
  const KEY = 'frontmatter_tier_pin';
  const reason = CURSOR_RUNTIME_NATIVE[KEY];
  assert(typeof reason === 'string' && reason.trim().length >= 20,
    'G2-declaration: CURSOR_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason');
  assert(/frontmatter/i.test(reason) && /standard/i.test(reason) && /reasoning/i.test(reason)
    && /medium/i.test(reason) && /high/i.test(reason) && /unquoted/i.test(reason) && /heavy|xhigh/i.test(reason),
    'G2-declaration: the "' + KEY + '" reason must state unquoted standard/reasoning/heavy medium/high/xhigh frontmatter pins');
  const resumeKey = 'session_start_resume_injection';
  const resumeReason = CURSOR_RUNTIME_NATIVE[resumeKey];
  assert(typeof resumeReason === 'string' && resumeReason.trim().length >= 20,
    'G2-declaration: CURSOR_RUNTIME_NATIVE must declare "' + resumeKey + '" with a one-line reason');
  assert(/preCompact/i.test(resumeReason) && /cannot inject/i.test(resumeReason)
    && /sessionStart/i.test(resumeReason) && /additional_context/i.test(resumeReason),
    'G2-declaration: the "' + resumeKey + '" reason must state that preCompact cannot inject and that sessionStart additional_context is the injection surface');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    if (!exists(rel)) continue;
    const { raw } = parseFrontmatter(read(rel));
    const canonical = canonicalAgentClass(name);
    assert(raw.split(/\r?\n/).includes('model: ' + canonical.pin),
      'G2-declaration: ' + rel + ' carries the canonical unquoted frontmatter pin '
      + JSON.stringify(canonical.pin));
    assert(!/^\s*effort\s*:/m.test(raw) && !/^\s*reasoning_effort\s*:/m.test(raw),
      'G2-declaration: ' + rel + ' carries a separate effort field; effort belongs in the model ID');
  }
  for (const rel of generatedTreeFiles('.cursor')) {
    const content = read(rel);
    assert(!/\bmodel="/.test(content),
      'G2-declaration: ' + rel + ' carries a per-call model=" override; command cards must omit dispatch model');
  }
}

// ---------------------------------------------------------------------------
// G3: --check re-renders from canonical and agrees with the tree --write just
// produced (render determinism across processes). Then a planted drift must
// turn --check red.
// ---------------------------------------------------------------------------
{
  const ok = runGeneratorCli(['--check']);
  assert(ok.status === 0,
    'G3: sync-cursor-edition --check exits 0 against the tree --write just produced'
    + (ok.status !== 0 ? ' — ' + String(ok.stderr || ok.stdout).split('\n')[0] : ''));
  const probe = path.join(TREE_ROOT, '.cursor', 'agents', 'implementer.md');
  assert(fs.existsSync(probe), 'G3: implementer.md exists to plant drift against');
  const orig = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : '';
  try {
    fs.appendFileSync(probe, '\n<!-- cursor-edition drift probe -->\n');
    const drifted = runGeneratorCli(['--check']);
    assert(drifted.status !== 0,
      'G3: --check exits non-zero on a drifted generated agent (got ' + drifted.status + ')');
  } finally {
    try { fs.writeFileSync(probe, orig); } catch (_) { /* restore best-effort */ }
  }
  assert(runGeneratorCli(['--check']).status === 0,
    'G3: --check exits 0 after the planted drift is restored');
}

// ---------------------------------------------------------------------------
// G4: reviewer roles keep behavior_contract_version/hash + a restamped
// resolved_profile_hash (opencode/kimi discipline).
// ---------------------------------------------------------------------------
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const cursorText = read(agentRel(role));
  let cursor = null;
  try { cursor = reviewerGenerator.behaviorIdentityFromCore(cursorText); } catch (e) {
    assert(false, 'G4-reviewer[' + role + ']: the generated agent still carries an extractable behavior core — ' + e.message);
    cursor = { role: null, behavior_contract_version: null, behavior_contract_hash: null, core: null };
  }
  assert(cursor.role === canonical.role
    && cursor.behavior_contract_version === canonical.behavior_contract_version
    && cursor.behavior_contract_hash === canonical.behavior_contract_hash,
    'G4-reviewer[' + role + ']: cursor agent retains normalized reviewer behavior identity');
  assert(cursor.core === canonical.core,
    'G4-reviewer[' + role + ']: cursor render preserves reviewer behavior-core bytes');
  const cursorHash = (cursorText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(cursorHash && /^[0-9a-f]{64}$/.test(cursorHash),
    'G4-reviewer[' + role + ']: cursor agent carries a resolved_profile_hash');
  assert((cursorText.match(/^resolved_profile_hash\s*:\s*[0-9a-f]{64}\s*$/gm) || []).length === 1,
    'G4-reviewer[' + role + ']: cursor agent carries EXACTLY ONE resolved_profile_hash line');
  let cursorHashVerifies = true;
  try { reviewerGenerator.verifyResolvedProfileHash(cursorText); } catch (_) { cursorHashVerifies = false; }
  assert(cursorHashVerifies,
    'G4-reviewer[' + role + ']: resolved_profile_hash verifies over the cursor bytes (zeroed-self sha256)');
  const clHash = (read('agents/' + role + '.md').match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(cursorHash !== clHash,
    'G4-reviewer[' + role + ']: cursor hash is re-stamped over cursor bytes (not the reused Claude render hash)');
  assert(new RegExp('^behavior_contract_version:\\s*' + canonical.behavior_contract_version + '\\s*$', 'm').test(cursorText),
    'G4-reviewer[' + role + ']: cursor agent preserves the canonical behavior_contract_version line');
  assert(new RegExp('^behavior_contract_hash:\\s*' + canonical.behavior_contract_hash + '\\s*$', 'm').test(cursorText),
    'G4-reviewer[' + role + ']: cursor agent preserves the canonical behavior_contract_hash line');
}

// ---------------------------------------------------------------------------
// G5: hooks — generated mapping at `.cursor/hooks.json` (Cursor loads that
// path, not hooks/hooks.json). The surviving sessionStart compact wrapper
// wraps stdout as additional_context; the dispatch-log hook is retired.
// ---------------------------------------------------------------------------
{
  const hooksJsonRel = '.cursor/hooks.json';
  assert(exists(hooksJsonRel), 'G5: .cursor/hooks.json exists (Cursor loads project-root mapping)');
  assert(!exists('.cursor/hooks/hooks.json'),
    'G5: mapping is NOT nested under .cursor/hooks/hooks.json');
  let parsed = null;
  try { parsed = JSON.parse(read(hooksJsonRel)); } catch (_) { parsed = null; }
  assert(parsed && parsed.hooks && typeof parsed.hooks === 'object',
    'G5: hooks.json parses with a hooks object');
  assert(parsed.version === 1, 'G5: hooks.json version is 1 — got ' + JSON.stringify(parsed.version));
  const events = parsed && parsed.hooks ? Object.keys(parsed.hooks).sort() : [];
  assert(events.includes('sessionStart'),
    'G5: hooks.json registers sessionStart — got ' + JSON.stringify(events));
  const session = parsed && parsed.hooks ? parsed.hooks.sessionStart : [];
  const sessionBlob = JSON.stringify(session || []);
  assert(/compact/i.test(sessionBlob),
    'G5: sessionStart registers the compact wrapper');
  assert(/\.cursor\/hooks\//.test(sessionBlob),
    'G5: project-shaped mapping commands start with .cursor/hooks/');
  assert(!/CLAUDE_PLUGIN_ROOT/.test(read(hooksJsonRel)),
    'G5: hooks.json carries no CLAUDE_PLUGIN_ROOT');

  assert(exists('.cursor/hooks/kaola-workflow-compact-context.sh'),
    'G5: compact wrapper is generated');
  assert(read('.cursor/hooks/kaola-workflow-compact-context.sh').startsWith('#!/bin/sh\n'),
    'G5: compact wrapper keeps the shebang as line 1');
}

{
  const wrapPath = path.join(TREE_ROOT, '.cursor', 'hooks', 'kaola-workflow-compact-context.sh');
  assert(fs.existsSync(wrapPath), 'G5-compact: wrapper exists to drive');
  const dir = fs.mkdtempSync(path.join(tmpBase(), 'cursor-compact-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'kaola-workflow' }) + '\n');
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts', 'kaola-workflow-compact-context.js'),
      'process.stdout.write("resume-text-from-compact");\n');
    // spawn-class: environment
    const r = spawnSync('bash', [wrapPath], {
      cwd: dir, input: '{}', encoding: 'utf8',
    });
    assert(r.status === 0, 'G5-compact: wrapper exits 0 (got ' + r.status + ')');
    let parsed = null;
    try { parsed = JSON.parse(String(r.stdout || '').trim()); } catch (_) { parsed = null; }
    assert(parsed && parsed.additional_context === 'resume-text-from-compact',
      'G5-compact: stdout is JSON {additional_context} wrapping compact-context.js — got '
      + JSON.stringify(String(r.stdout || '').slice(0, 200)));
    fs.writeFileSync(path.join(dir, 'scripts', 'kaola-workflow-compact-context.js'),
      'process.stdout.write("");\n');
    // spawn-class: environment
    const empty = spawnSync('bash', [wrapPath], { cwd: dir, input: '{}', encoding: 'utf8' });
    assert(String(empty.stdout || '').trim() === '{}',
      'G5-compact: empty compact text yields {} (fail-open) — got '
      + JSON.stringify(String(empty.stdout || '').slice(0, 80)));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// G6: generator CLI — --write, --check, --refresh-present, --forge=,
// --print-tree-root. Unknown forge refused. --help names the flags.
// ---------------------------------------------------------------------------
{
  const help = runGeneratorCli(['--help']);
  const helpOut = String(help.stdout || '') + String(help.stderr || '');
  assert(/--write/.test(helpOut) && /--check/.test(helpOut)
    && /--refresh-present/.test(helpOut) && /--print-tree-root/.test(helpOut)
    && /--forge/.test(helpOut) && /--merge-hooks/.test(helpOut) && /--strip-hooks/.test(helpOut),
    'G6: --help names --write / --check / --refresh-present / --print-tree-root / --forge= / --merge-hooks / --strip-hooks');

  const printed = runGeneratorCli(['--print-tree-root']);
  assert(printed.status === 0, 'G6: --print-tree-root exits 0 (got ' + printed.status + ')');
  const line = String(printed.stdout || '').replace(/\n$/, '');
  assert(path.isAbsolute(line) && !line.includes('\n'),
    'G6: --print-tree-root prints one absolute path on stdout (installers consume it as a path) — got '
    + JSON.stringify(line));
  let printedReal = line;
  let treeReal = TREE_ROOT;
  try { printedReal = fs.realpathSync(line); } catch (_) { /* literal stands */ }
  try { treeReal = fs.realpathSync(TREE_ROOT); } catch (_) { /* literal stands */ }
  assert(line === TREE_ROOT || printedReal === treeReal,
    'G6: --print-tree-root agrees with this suite\'s independently computed TREE_ROOT — printed '
    + JSON.stringify(line) + ' vs ' + JSON.stringify(TREE_ROOT));
  assert(!/NOTE/.test(String(printed.stdout || '')),
    'G6: --print-tree-root stdout carries no advisory (a caller will try to open that line)');

  const refresh = runGenerator(['--refresh-present']);
  assert(refresh.status === 0,
    'G6: --refresh-present exits 0 (got ' + refresh.status + ': '
    + String(refresh.stderr || refresh.stdout).split('\n')[0] + ')');

  const bad = runGeneratorCli(['--forge=svn', '--check']);
  assert(bad.status === 2,
    'G6: sync --forge=svn refuses with exit 2 rather than defaulting to github (got ' + bad.status + ')');

  const missingDest = runGeneratorCli(['--merge-hooks']);
  assert(missingDest.status === 2,
    'G6: --merge-hooks without --dest=PATH exits 2 (got ' + missingDest.status + ')');

  const mergeDir = fs.mkdtempSync(path.join(tmpBase(), 'cursor-merge-'));
  try {
    const dest = path.join(mergeDir, 'hooks.json');
    fs.writeFileSync(dest, JSON.stringify({
      version: 1,
      hooks: { beforeShellExecution: [{ command: 'echo user-owned' }] },
    }, null, 2) + '\n');
    const merged = runGenerator(['--merge-hooks', '--dest=' + dest]);
    assert(merged.status === 0, 'G6-merge: --merge-hooks exits 0 (got ' + merged.status + ')');
    let after = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert(Array.isArray(after.hooks.beforeShellExecution) && after.hooks.beforeShellExecution.length === 1,
      'G6-merge: preserves the user beforeShellExecution entry');
    assert(Array.isArray(after.hooks.sessionStart),
      'G6-merge: appends sessionStart');
    const stripped = runGenerator(['--strip-hooks', '--dest=' + dest]);
    assert(stripped.status === 0, 'G6-strip: --strip-hooks exits 0 (got ' + stripped.status + ')');
    after = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert(Array.isArray(after.hooks.beforeShellExecution),
      'G6-strip: user entries remain');
    assert(!after.hooks.sessionStart,
      'G6-strip: kaola sessionStart is removed');
    fs.writeFileSync(dest, 'not-json{');
    const refuse = runGeneratorCli(['--merge-hooks', '--dest=' + dest]);
    assert(refuse.status === 1,
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
    assert(w.status === 0,
      'G7[' + forge + ']: sync --write exits 0 (got ' + w.status + ': '
      + String(w.stderr || '').slice(0, 200) + ')');
    const label = '.cursor-' + forge;
    const abs = path.join(TREE_ROOT, label);
    assert(fs.existsSync(abs),
      'G7[' + forge + ']: generated tree lands at ' + label);
    const expected = commandNamesFor(forge);
    const cmdDir = path.join(abs, 'commands');
    const actual = fs.existsSync(cmdDir)
      ? fs.readdirSync(cmdDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      'G7[' + forge + ']: ' + label + '/commands is exactly commandSources(' + forge
      + ') — expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
    const agentDir = path.join(abs, 'agents');
    const agents = fs.existsSync(agentDir)
      ? fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assert(JSON.stringify(agents) === JSON.stringify(canonAgents),
      'G7[' + forge + ']: agent set is the canonical roster, including knowledge-lookup');
    for (const name of CURSOR_CLI_MATERIALIZATION_COMMANDS) {
      const rel = commandRel(name, forge);
      const verdict = cursorCliMaterializationVerdict(exists(rel) ? read(rel) : '', forge);
      assert(verdict.ok,
        'G7[' + forge + '][' + name + ']: generated CLI materializer keeps explicit "$PWD" and exact '
        + '--forge=' + forge + ' without applying the rule to App local/Cloud — '
        + verdict.errors.join(' | '));
    }
    const c = runGeneratorCli(['--forge=' + forge, '--check']);
    assert(c.status === 0,
      'G7[' + forge + ']: --check is green after --write (got ' + c.status + ')');
  }
  const isolatedRoot = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g7-isolated-root-'));
  try {
    const staged = runGenerator(['--forge=github', '--write', '--tree-root=' + isolatedRoot]);
    assert(staged.status === 0
      && fs.existsSync(path.join(isolatedRoot, '.cursor', 'agents', 'implementer.md'))
      && fs.existsSync(path.join(isolatedRoot, '.cursor', 'commands', 'workflow-next.md')),
    'G7[isolated]: --tree-root renders a complete github source under the explicit staging root');
    const relative = runGeneratorCli(['--write', '--tree-root=relative-staging']);
    assert(relative.status === 2,
      'G7[isolated]: --tree-root refuses a relative path (got ' + relative.status + ')');
    const occupiedRoot = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g7-occupied-root-'));
    fs.writeFileSync(path.join(occupiedRoot, 'owner.txt'), 'OWNER\n');
    const occupied = runGeneratorCli(['--write', '--tree-root=' + occupiedRoot]);
    assert(occupied.status === 2 && fs.readFileSync(path.join(occupiedRoot, 'owner.txt'), 'utf8') === 'OWNER\n',
      'G7[isolated]: --tree-root refuses an occupied directory without touching owner bytes');
    fs.rmSync(occupiedRoot, { recursive: true, force: true });
  } finally {
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// G8: install-cursor.sh — hermetic cases against the REAL installer with temp
// HOME + CURSOR_HOME + --target under tmpBase(), never the host ~/.cursor.
// ---------------------------------------------------------------------------
{
  assert(fs.existsSync(INSTALLER),
    'G8: installer not present: install-cursor.sh is required for the hermetic install contract');
  {
    // spawn-class: cli-contract
    const syntax = spawnSync('bash', ['-n', INSTALLER], { encoding: 'utf8' });
    assert(syntax.status === 0,
      'G8: bash -n install-cursor.sh (got ' + syntax.status + ' — '
      + String(syntax.stderr || syntax.stdout).split('\n')[0] + ')');
  }
  if (fs.existsSync(INSTALLER)) {
    // Issue #1032/#1039: the active receipt transaction—not dormant shell cleanup—owns the
    // retired dispatch hook. Install strips that exact Kaola namespace entry while uninstall
    // removes only entries recorded in the receipt.
    const installerSource = fs.readFileSync(INSTALLER, 'utf8');
    const cursorSurfaceSource = fs.readFileSync(path.join(REPO, 'scripts',
      'kaola-workflow-cursor-surface.js'), 'utf8');
    assert(/compact-context\|ensure-cursor-catalog\|subagent-dispatch-log/.test(cursorSurfaceSource),
      'R1: the active hook classifier contains the retired subagent-dispatch-log name');
    assert(/filter\(entry => !isKaolaHookEntry\(entry\)\)\.concat\(entries\)/.test(cursorSurfaceSource),
      'R2: install hook merge strips bounded retired Kaola entries before adding the current mapping');
    assert(/removeRecordedHooks\(hooksFile, info\.receipt\.hook_entries \|\| \{\}\)/.test(cursorSurfaceSource),
      'R3: uninstall removes only exact receipt-recorded hook entries');
    assert(!/install_support_scripts\(\) \{|uninstall_edition\(\) \{/.test(installerSource),
      'R4: installer carries no dormant legacy cleanup implementation beside the active transaction');
    assert(!/also deploying agents\+commands/.test(installerSource),
      'G8-source: --global no longer dual-writes the invoking Git repository');
    assert(!/git rev-parse --show-toplevel/.test(installerSource),
      'G8-source: --global does not resolve an ambient git toplevel to copy into');
    assert(/mktemp -d "\$KW_TMPDIR\/kaola-cursor-staging\.XXXXXX"/.test(installerSource)
      && /--tree-root="\$STAGING_ROOT"/.test(installerSource),
    'G8-source: normal installs render canonical Cursor bytes only in an isolated staging root');
    const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
    function runInstaller(extraArgs, opts) {
      opts = opts || {};
      const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-home-'));
      const cursorHome = opts.cursorHome || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-ch-'));
      const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-dest-'));
      const args = ['--yes'].concat(opts.skipTarget ? [] : ['--target', dest]).concat(extraArgs || []);
      const spawnOpts = {
        env: Object.assign({}, process.env, { HOME: home, CURSOR_HOME: cursorHome }, opts.env || {}),
        encoding: 'utf8',
      };
      if (opts.cwd) spawnOpts.cwd = opts.cwd;
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER].concat(args), spawnOpts);
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home, cursorHome, dest };
    }
    const clean = r => {
      for (const d of [r.home, r.cursorHome, r.dest]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    };

    // Project deploy.
    {
      const r = runInstaller([]);
      assert(r.status === 0,
        'G8-project: install-cursor.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      const commandsDir = path.join(r.dest, '.cursor', 'commands');
      assert(fs.existsSync(path.join(agentsDir, 'knowledge-lookup.md')),
        'G8-project: deploys knowledge-lookup.md under <target>/.cursor/agents/');
      for (const name of canonAgents) {
        assert(fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-project[' + name + ']: agent deployed under <target>/.cursor/agents/');
      }
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.cursor/commands/');
      }
      const scriptsDir = path.join(r.cursorHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir),
        'G8-project: support scripts land at $CURSOR_HOME/kaola-workflow/scripts');
      assert(fs.existsSync(path.join(r.dest, '.cursor', 'hooks')),
        'G8-project: hooks land under <target>/.cursor/hooks/');
      assert(fs.existsSync(path.join(r.dest, '.cursor', 'hooks.json')),
        'G8-project: mapping lands at <target>/.cursor/hooks.json');
      assert(!fs.existsSync(path.join(r.cursorHome, 'hooks.json')),
        'G8-project: does not merge into $CURSOR_HOME/hooks.json (Cursor has project-scoped hooks)');
      clean(r);
    }

    // --global: agents/commands land under CURSOR_HOME (the ~/.cursor equivalent), un-nested.
    {
      const stagingParent = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-staging-parent-'));
      const r = runInstaller(['--global'], {
        skipTarget: true,
        env: { TMPDIR: stagingParent },
      });
      assert(r.status === 0,
        'G8-global: install-cursor.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(fs.existsSync(path.join(r.cursorHome, 'agents', 'knowledge-lookup.md')),
        'G8-global: deploys knowledge-lookup under $CURSOR_HOME/agents/ (un-nested)');
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(r.cursorHome, 'commands', name + '.md')),
          'G8-global[' + name + ']: command deployed under $CURSOR_HOME/commands/');
      }
      assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
        'G8-global: creates NO nested .cursor/ under CURSOR_HOME (Cursor scans CURSOR_HOME itself)');
      const globalJson = path.join(r.cursorHome, 'hooks.json');
      assert(fs.existsSync(globalJson), 'G8-global: merges mapping into $CURSOR_HOME/hooks.json');
      const globalMapping = fs.readFileSync(globalJson, 'utf8');
      assert(/\./.test(globalMapping) && /"\.\/hooks\//.test(globalMapping),
        'G8-global: mapping commands are rewritten to ./hooks/');
      assert(!/\.cursor\/hooks\//.test(globalMapping),
        'G8-global: mapping commands do not keep the project-shaped .cursor/hooks/ prefix');
      assert(fs.readdirSync(stagingParent).length === 0,
        'G8-global: isolated generated source is removed after the install transaction');
      clean(r);
      try { fs.rmSync(stagingParent, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }

    // #1039: --global from a git work tree must NOT write the invoking repository.
    // Explicit --target remains the project materialization. Do NOT spawn --global
    // with cwd = this repo.
    {
      const gitRepo = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-git-'));
      try {
        G.init(gitRepo);
        fs.mkdirSync(path.join(gitRepo, '.cursor', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(gitRepo, '.cursor', 'agents', 'user-owned.md'), 'keep\n');
        const r = runInstaller(['--global'], { skipTarget: true, cwd: gitRepo });
        assert(r.status === 0,
          'G8-global-git: install-cursor.sh --global from a git-fixture cwd exits 0 (got '
          + r.status + ' — ' + firstLine(r) + ')');
        assert(!fs.existsSync(path.join(gitRepo, '.cursor', 'agents', 'implementer.md')),
          'G8-global-git: --global from a git-fixture cwd does not write <toplevel>/.cursor/agents/implementer.md');
        assert(fs.readFileSync(path.join(gitRepo, '.cursor', 'agents', 'user-owned.md'), 'utf8') === 'keep\n',
          'G8-global-git: --global leaves an existing unmanaged project file untouched');
        assert(!/also deploying/i.test(r.stdout + r.stderr),
          'G8-global-git: --global does not announce an ambient project deploy');
        assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
          'G8-global-git: still creates NO nested .cursor/ under CURSOR_HOME');
        assert(fs.existsSync(path.join(r.cursorHome, 'agents', 'knowledge-lookup.md')),
          'G8-global-git: still deploys un-nested agents under $CURSOR_HOME/agents/');
        const targeted = runInstaller(['--target', gitRepo], { skipTarget: true, cwd: gitRepo, home: r.home, cursorHome: r.cursorHome });
        assert(targeted.status === 0,
          'G8-explicit-target: --target DIR still materializes project .cursor/ (got '
          + targeted.status + ' — ' + firstLine(targeted) + ')');
        assert(fs.existsSync(path.join(gitRepo, '.cursor', 'agents', 'implementer.md')),
          'G8-explicit-target: --target DIR writes <dir>/.cursor/agents/implementer.md');
        clean(r);
      } finally {
        try { fs.rmSync(gitRepo, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // #1039: installing global sessionStart hooks must not reintroduce an ambient
    // project materializer. Drive every installed sessionStart hook from a real
    // consumer cwd and compare the whole project catalog before/after. The
    // canonical-name owner file makes the former ensure hook's overwrite visible.
    {
      const gitRepo = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-session-'));
      try {
        G.init(gitRepo);
        const ownerFile = path.join(gitRepo, '.cursor', 'agents', 'implementer.md');
        fs.mkdirSync(path.dirname(ownerFile), { recursive: true });
        fs.writeFileSync(ownerFile, 'OWNER_SESSION_START_BYTES\n');
        const r = runInstaller(['--global'], { skipTarget: true, cwd: gitRepo });
        const mapping = r.status === 0 && fs.existsSync(path.join(r.cursorHome, 'hooks.json'))
          ? JSON.parse(fs.readFileSync(path.join(r.cursorHome, 'hooks.json'), 'utf8')) : null;
        const session = mapping && mapping.hooks && Array.isArray(mapping.hooks.sessionStart)
          ? mapping.hooks.sessionStart : [];
        const beforeFiles = walkFiles(path.join(gitRepo, '.cursor'), '')
          .map(rel => rel + ':' + sha256File(path.join(gitRepo, '.cursor', rel))).sort();
        const statuses = [];
        for (const entry of session) {
          const command = String((entry && entry.command) || '');
          const match = command.match(/^\.\/hooks\/([A-Za-z0-9._-]+)$/);
          if (!match) { statuses.push('unresolved:' + command); continue; }
          // Cursor resolves a global hook relative to CURSOR_HOME while the hook's
          // process cwd remains the consumer repository.
          const hook = path.join(r.cursorHome, 'hooks', match[1]);
          // spawn-class: environment
          const driven = spawnSync('bash', [hook], {
            cwd: gitRepo,
            env: Object.assign({}, process.env, { HOME: r.home, CURSOR_HOME: r.cursorHome }),
            encoding: 'utf8',
          });
          statuses.push(driven.status);
        }
        const afterFiles = walkFiles(path.join(gitRepo, '.cursor'), '')
          .map(rel => rel + ':' + sha256File(path.join(gitRepo, '.cursor', rel))).sort();
        assert(r.status === 0 && session.length >= 1 && statuses.every(status => status === 0),
          'G8-sessionStart: installed global sessionStart hooks are runnable from a consumer cwd — got '
          + JSON.stringify(statuses));
        assert(session.every(entry => !/ensure|catalog|materializ/i.test(String(entry && entry.command))),
          'G8-sessionStart: global sessionStart contains no implicit project catalog materializer — got '
          + JSON.stringify(session));
        assert(JSON.stringify(afterFiles) === JSON.stringify(beforeFiles)
          && fs.readFileSync(ownerFile, 'utf8') === 'OWNER_SESSION_START_BYTES\n',
        'G8-sessionStart: running every global sessionStart hook leaves the ambient project catalog '
          + 'byte-identical — before ' + JSON.stringify(beforeFiles) + ' after ' + JSON.stringify(afterFiles));
        clean(r);
      } finally {
        try { fs.rmSync(gitRepo, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // Standalone CLI pre-dispatch drives the helper installed by --global, not
    // the repository installer and not a blind cwd copier. Exercise that
    // installed artifact in isolation: its first explicit target transaction
    // materializes authority bytes, its second is a byte/mtime no-op, and every
    // unproved or stale ownership shape fails before mutation.
    {
      const global = runInstaller(['--global'], { skipTarget: true });
      const targets = [];
      const makeTarget = label => {
        const dir = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-helper-' + label + '-'));
        targets.push(dir);
        return dir;
      };
      const helper = path.join(global.cursorHome, 'kaola-workflow', 'scripts',
        'kaola-workflow-cursor-surface.js');
      const authorityReceipt = path.join(global.cursorHome, 'kaola-workflow', 'cursor-authority.json');
      const snapshot = root => walkFiles(root, '').sort().map(rel => {
        const file = path.join(root, rel);
        const stat = fs.lstatSync(file, { bigint: true });
        if (stat.isSymbolicLink()) return rel + ':symlink:' + fs.readlinkSync(file);
        return rel + ':regular:' + (stat.mode & 0o777n).toString(8) + ':'
          + stat.mtimeNs.toString() + ':' + sha256File(file);
      });
      const runHelper = (args, cwd) => {
        // spawn-class: environment
        return spawnSync(process.execPath, [helper].concat(args || []), {
          cwd: cwd || REPO,
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
      };
      try {
        const receipt = global.status === 0 && fs.existsSync(authorityReceipt)
          ? JSON.parse(fs.readFileSync(authorityReceipt, 'utf8')) : null;
        const helperReady = global.status === 0 && fs.existsSync(helper)
          && receipt && receipt.files
          && receipt.files['kaola-workflow/scripts/kaola-workflow-cursor-surface.js'];
        assert(helperReady,
        'G8-installed-helper: --global installs and receipts the safe Cursor materialization helper');

        if (helperReady) {
          const fresh = makeTarget('fresh');
          const first = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          let firstBody = null;
          try { firstBody = JSON.parse(first.stdout); } catch (_) { /* asserted below */ }
          const globalAgent = path.join(global.cursorHome, 'agents', 'implementer.md');
          const targetAgent = path.join(fresh, '.cursor', 'agents', 'implementer.md');
          assert(first.status === 0 && firstBody && firstBody.status === 'materialized'
            && fs.existsSync(targetAgent) && fs.readFileSync(targetAgent).equals(fs.readFileSync(globalAgent)),
          'G8-installed-helper-materialized: first explicit target call materializes bytes from installed global authority — '
            + firstLine(first));
          const beforeCurrent = snapshot(path.join(fresh, '.cursor'));
          const second = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          let secondBody = null;
          try { secondBody = JSON.parse(second.stdout); } catch (_) { /* asserted below */ }
          const afterCurrent = snapshot(path.join(fresh, '.cursor'));
          assert(second.status === 0 && secondBody && secondBody.status === 'current'
            && JSON.stringify(afterCurrent) === JSON.stringify(beforeCurrent),
          'G8-installed-helper-current: a fresh/current second call is a byte-and-mtime no-op — before '
            + JSON.stringify(beforeCurrent) + ' after ' + JSON.stringify(afterCurrent));

          fs.writeFileSync(targetAgent, 'OWNER_MODIFIED_RECEIPT_BYTES\n');
          const beforeModified = snapshot(path.join(fresh, '.cursor'));
          const modified = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          const afterModified = snapshot(path.join(fresh, '.cursor'));
          assert(modified.status !== 0 && JSON.stringify(afterModified) === JSON.stringify(beforeModified)
            && fs.readFileSync(targetAgent, 'utf8') === 'OWNER_MODIFIED_RECEIPT_BYTES\n',
          'G8-installed-helper-modified: modified receipt-owned bytes fail closed without target mutation — '
            + firstLine(modified));

          const collision = makeTarget('collision');
          const collisionFile = path.join(collision, '.cursor', 'agents', 'implementer.md');
          fs.mkdirSync(path.dirname(collisionFile), { recursive: true });
          fs.writeFileSync(collisionFile, 'UNPROVED_OWNER_BYTES\n');
          const beforeCollision = snapshot(path.join(collision, '.cursor'));
          const collided = runHelper(['--ensure-target', collision, '--forge=github', '--json'], collision);
          const afterCollision = snapshot(path.join(collision, '.cursor'));
          assert(collided.status !== 0 && JSON.stringify(afterCollision) === JSON.stringify(beforeCollision)
            && fs.readFileSync(collisionFile, 'utf8') === 'UNPROVED_OWNER_BYTES\n',
          'G8-installed-helper-collision: unproved canonical-name bytes fail closed without overwrite — '
            + firstLine(collided));

          const symlink = makeTarget('symlink');
          const symlinkOwner = path.join(symlink, 'outside-owner.md');
          const symlinkFile = path.join(symlink, '.cursor', 'agents', 'implementer.md');
          fs.writeFileSync(symlinkOwner, 'SYMLINK_OWNER_BYTES\n');
          fs.mkdirSync(path.dirname(symlinkFile), { recursive: true });
          fs.symlinkSync(symlinkOwner, symlinkFile);
          const symlinked = runHelper(['--ensure-target', symlink, '--forge=github', '--json'], symlink);
          assert(symlinked.status !== 0 && fs.lstatSync(symlinkFile).isSymbolicLink()
            && fs.readFileSync(symlinkOwner, 'utf8') === 'SYMLINK_OWNER_BYTES\n',
          'G8-installed-helper-symlink: a managed-basename symlink fails closed without following it — '
            + firstLine(symlinked));

          const ambient = makeTarget('ambient');
          const untargeted = runHelper(['--ensure-target'], ambient);
          assert(untargeted.status !== 0 && !fs.existsSync(path.join(ambient, '.cursor')),
            'G8-installed-helper-no-target: missing explicit target fails without ambient cwd materialization — '
            + firstLine(untargeted));

          const stale = makeTarget('stale-authority');
          const globalAgentBytes = fs.readFileSync(globalAgent);
          fs.writeFileSync(globalAgent, 'STALE_GLOBAL_AUTHORITY_BYTES\n');
          const staleResult = runHelper(['--ensure-target', stale, '--forge=github', '--json'], stale);
          assert(staleResult.status !== 0 && !fs.existsSync(path.join(stale, '.cursor')),
            'G8-installed-helper-stale-authority: hash-stale global authority fails before target mutation — '
            + firstLine(staleResult));

          fs.writeFileSync(globalAgent, globalAgentBytes);
          fs.rmSync(authorityReceipt, { force: true });
          const missing = makeTarget('missing-authority');
          const missingResult = runHelper(['--ensure-target', missing, '--forge=github', '--json'], missing);
          assert(missingResult.status !== 0 && !fs.existsSync(path.join(missing, '.cursor')),
            'G8-installed-helper-missing-authority: missing global receipt fails before target mutation — '
            + firstLine(missingResult));
        }
      } finally {
        clean(global);
        for (const dir of targets) {
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        }
      }
    }

    // #1039: a project exception is explicit and ownership-safe. A canonical-name
    // regular-file collision must be diagnosed and refused; uninstall must not
    // turn a refused install into deletion by basename.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-collision-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const ownerAgent = path.join(dest, '.cursor', 'agents', 'implementer.md');
        const ownerCommand = path.join(dest, '.cursor', 'commands', 'workflow-next.md');
        fs.mkdirSync(path.dirname(ownerAgent), { recursive: true });
        fs.mkdirSync(path.dirname(ownerCommand), { recursive: true });
        fs.writeFileSync(ownerAgent, 'OWNER_AGENT_COLLISION\n');
        fs.writeFileSync(ownerCommand, 'OWNER_COMMAND_COLLISION\n');
        // spawn-class: environment
        const doctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const doctorText = String(doctor.stdout || '') + String(doctor.stderr || '');
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(/collision|unmanaged/i.test(doctorText),
          'G8-collision-doctor: doctor identifies canonical-name unmanaged collisions — got '
          + JSON.stringify(doctorText.slice(0, 500)));
        assert(installed.status !== 0,
          'G8-collision: explicit target refuses unmanaged canonical-name files (got '
          + installed.status + ' — ' + firstLine(installed) + ')');
        assert(fs.readFileSync(ownerAgent, 'utf8') === 'OWNER_AGENT_COLLISION\n'
          && fs.readFileSync(ownerCommand, 'utf8') === 'OWNER_COMMAND_COLLISION\n',
        'G8-collision: refused install preserves both agent and command owner bytes');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(ownerAgent) && fs.existsSync(ownerCommand)
          && fs.readFileSync(ownerAgent, 'utf8') === 'OWNER_AGENT_COLLISION\n'
          && fs.readFileSync(ownerCommand, 'utf8') === 'OWNER_COMMAND_COLLISION\n',
        'G8-collision-uninstall: uninstall preserves files that were never recorded as managed');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // A symlink at a managed basename is ownership, not a writable destination.
    // Neither install nor uninstall may follow it or remove it.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-symlink-'));
      const outside = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-symlink-owner-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const ownerTarget = path.join(outside, 'owner-implementer.md');
        const link = path.join(dest, '.cursor', 'agents', 'implementer.md');
        fs.writeFileSync(ownerTarget, 'OWNER_SYMLINK_TARGET\n');
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(ownerTarget, link);
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(installed.status !== 0 && fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()
          && fs.readFileSync(ownerTarget, 'utf8') === 'OWNER_SYMLINK_TARGET\n',
        'G8-symlink: explicit target refuses a managed-basename symlink without following it');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()
          && fs.readFileSync(ownerTarget, 'utf8') === 'OWNER_SYMLINK_TARGET\n',
        'G8-symlink-uninstall: uninstall preserves an unmanaged symlink and its outside target');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { fs.rmSync(outside, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // Fresh materialization must be derived from the installed global authority,
    // and doctor must expose target identity plus the exact materialized hash. A
    // missing global authority may not silently fall back to repository sources.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-fresh-'));
      const secondDest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-authority-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        const globalAgent = path.join(global.cursorHome, 'agents', 'implementer.md');
        const targetAgent = path.join(dest, '.cursor', 'agents', 'implementer.md');
        assert(installed.status === 0 && fs.existsSync(globalAgent) && fs.existsSync(targetAgent)
          && fs.readFileSync(targetAgent).equals(fs.readFileSync(globalAgent)),
        'G8-freshness: explicit target bytes equal the installed global authority');
        const targetHash = fs.existsSync(targetAgent) ? sha256File(targetAgent) : '';
        // spawn-class: environment
        const doctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const doctorText = String(doctor.stdout || '');
        assert(doctor.status === 0 && doctorText.includes(path.resolve(dest)),
          'G8-freshness-doctor: doctor reports the exact explicit project target');
        assert(!!targetHash && doctorText.includes(targetHash),
          'G8-freshness-doctor: doctor reports the exact materialized content hash ' + targetHash);
        assert(/fresh|current/i.test(doctorText) && /scope/i.test(doctorText),
          'G8-freshness-doctor: doctor reports effective scope and current/fresh state — got '
          + JSON.stringify(doctorText.slice(0, 800)));

        fs.writeFileSync(targetAgent, 'OWNER_CHANGED_AFTER_MATERIALIZATION\n');
        // spawn-class: environment
        const staleDoctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const staleText = String(staleDoctor.stdout || '') + String(staleDoctor.stderr || '');
        assert(/stale|collision|modified|mismatch/i.test(staleText),
          'G8-freshness-doctor: doctor detects a post-materialization byte mismatch');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(targetAgent)
          && fs.readFileSync(targetAgent, 'utf8') === 'OWNER_CHANGED_AFTER_MATERIALIZATION\n',
        'G8-freshness-uninstall: uninstall preserves a managed file whose bytes no longer match its manifest');

        fs.rmSync(globalAgent, { force: true });
        const missingAuthority = runInstaller(['--target', secondDest, '--no-scripts'], {
          skipTarget: true, dest: secondDest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(missingAuthority.status !== 0
          && !fs.existsSync(path.join(secondDest, '.cursor', 'agents', 'implementer.md')),
        'G8-authority: explicit target refuses a missing/stale installed global authority instead of '
          + 'falling back to repository source bytes');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { fs.rmSync(secondDest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // #1014: --global from a directory with no git toplevel must not invent cwd/.cursor/.
    {
      const plain = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-nongit-'));
      try {
        const r = runInstaller(['--global'], { skipTarget: true, cwd: plain });
        assert(r.status === 0,
          'G8-global-nongit: --global from a non-git cwd exits 0 (got ' + r.status
          + ' — ' + firstLine(r) + ')');
        assert(!fs.existsSync(path.join(plain, '.cursor')),
          'G8-global-nongit: --global from a directory with no git toplevel does not invent a project .cursor/ tree');
        assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
          'G8-global-nongit: still creates NO nested .cursor/ under CURSOR_HOME');
        clean(r);
      } finally {
        try { fs.rmSync(plain, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // #1039: doctor reports surfaces without inferring App from CLI or local from Cloud.
    {
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--product', 'app', '--host', 'cloud'], {
        encoding: 'utf8',
        env: process.env,
      });
      assert(r.status === 0, 'G8-doctor: --doctor --json exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const doc = JSON.parse(r.stdout);
      assert(doc.runtime === 'cursor', 'G8-doctor: runtime is cursor');
      assert(doc.product_surface === 'app', 'G8-doctor: product_surface is app');
      assert(doc.execution_host === 'cloud', 'G8-doctor: execution_host is cloud');
      assert(doc.inferred_from_sibling_binary === false,
        'G8-doctor: does not infer from sibling binaries');
      assert(doc.ambient_repository_write === false,
        'G8-doctor: ambient_repository_write is false');
      assert(doc.surfaces.app.execution_hosts.local.global_discovery === 'unknown',
        'G8-doctor: App local global_discovery stays unknown, not false');
      assert(doc.surfaces.app.execution_hosts.cloud.global_discovery === 'supported_in_saved_remote_environment',
        'G8-doctor: App Cloud global discovery is scoped to a saved remote environment');
      assert(doc.surfaces.app.execution_hosts.cloud.required_project_materialization === 'no',
        'G8-doctor: App Cloud does not use project materialization');
      assert(doc.surfaces.app.execution_hosts.cloud.remote_injection === 'dashboard_environment_install_and_save',
        'G8-doctor: App Cloud names the dashboard install-and-save carrier');
      assert(doc.surfaces.app.execution_hosts.cloud.named_catalog === 'user_global_when_environment_saved',
        'G8-doctor: App Cloud named catalog comes from the saved remote user carrier');
      assert(doc.surfaces.app.execution_hosts.cloud.reload === 'new_cloud_parent_after_environment_save',
        'G8-doctor: App Cloud requires a fresh parent after environment save');
      assert(doc.surfaces.cli.execution_hosts.local.required_project_materialization === 'yes',
        'G8-doctor: CLI requires explicit project materialization');
      assert(doc.named_catalog === 'user_global_when_environment_saved',
        'G8-doctor: selected App/Cloud named_catalog is flattened from the measured host surface');
      assert(typeof doc.kaola_workflow_version === 'string'
        && doc.kaola_workflow_version.length > 0,
        'G8-doctor: reports Kaola-Workflow version');
    }

    // #1039 release migration: receipt-less 10.0.1 global installs may be adopted only when the
    // published legacy hash proves ownership. A one-byte mutation must return to collision-safe
    // refusal, and retired ambient materializer bytes are removed only under the same proof.
    {
      const root = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-legacy-adoption-'));
      const rel = 'commands/workflow-next.md';
      const file = path.join(root, 'commands', 'workflow-next.md');
      const oldBytes = Buffer.from('published-legacy-command\n');
      const newBytes = Buffer.from('current-command\n');
      const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
      const desired = { [rel]: { bytes: newBytes, sha256: digest(newBytes), mode: 0o644 } };
      const receiptMissing = { status: 'missing', path: path.join(root, 'missing-receipt.json') };
      const allowed = { [rel]: digest(oldBytes) };
      const retiredRel = 'hooks/kaola-workflow-ensure-cursor-catalog.sh';
      const retiredFile = path.join(root, ...retiredRel.split('/'));
      const retiredBytes = Buffer.from('published-retired-hook\n');
      const retired = { [retiredRel]: digest(retiredBytes) };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, oldBytes);
        assert(cursorSurface.validateManagedPreflight(root, desired, receiptMissing, allowed).length === 0,
          'G8-legacy-adoption: an exact published legacy hash is adoptable without weakening current ownership');
        fs.writeFileSync(file, Buffer.concat([oldBytes, Buffer.from('mutation')]));
        assert(cursorSurface.validateManagedPreflight(root, desired, receiptMissing, allowed)
          .some(item => item.reason === 'unmanaged_collision'),
        'G8-legacy-adoption-mutation: one changed legacy byte restores unmanaged-collision refusal');

        fs.mkdirSync(path.dirname(retiredFile), { recursive: true });
        fs.writeFileSync(retiredFile, retiredBytes);
        assert(cursorSurface.validateLegacyRetired(root, receiptMissing, retired).length === 0,
          'G8-legacy-retired: exact published retired bytes pass preflight');
        assert(cursorSurface.removeLegacyRetired(root, receiptMissing, retired).includes(retiredRel)
          && !fs.existsSync(retiredFile),
        'G8-legacy-retired: exact published retired ambient materializer is removed');
        fs.mkdirSync(path.dirname(retiredFile), { recursive: true });
        fs.writeFileSync(retiredFile, Buffer.concat([retiredBytes, Buffer.from('mutation')]));
        assert(cursorSurface.validateLegacyRetired(root, receiptMissing, retired)
          .some(item => item.reason === 'legacy_retired_file_modified'),
        'G8-legacy-retired-mutation: modified retired bytes fail closed');
        assert(cursorSurface.removeLegacyRetired(root, receiptMissing, retired).length === 0
          && fs.existsSync(retiredFile),
        'G8-legacy-retired-mutation: modified retired bytes are preserved');

        assert(cursorSurface.LEGACY_10_0_1_GLOBAL_HASHES.github[rel]
          === '79e9bd53c1146fc7af9557f4757f6c38de610f2d7ae2cde06c930f3e8ef3aa6c',
        'G8-legacy-adoption: production pins the published 10.0.1 github workflow-next hash');
      } finally {
        try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // --forge=gitlab renders `.cursor-gitlab/` as the generator SOURCE tree, then
    // copies content into the runtime-native dest Cursor actually scans:
    // <target>/.cursor/{agents,commands,hooks}. Same split as kimi (.kimi-gitlab
    // → .kimi-code/skills) and opencode (.opencode-gitlab → .opencode/).
    {
      const r = runInstaller(['--forge=gitlab']);
      assert(r.status === 0,
        'G8-gitlab: install-cursor.sh --forge=gitlab exits 0 (got ' + r.status
        + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      const commandsDir = path.join(r.dest, '.cursor', 'commands');
      assert(fs.existsSync(path.join(agentsDir, 'knowledge-lookup.md')),
        'G8-gitlab: deploys knowledge-lookup under <target>/.cursor/agents/ (Cursor does not scan .cursor-gitlab/)');
      for (const name of canonAgents) {
        assert(fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-gitlab[' + name + ']: agent deployed under <target>/.cursor/agents/');
      }
      const expected = commandNamesFor('gitlab');
      for (const name of expected) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-gitlab[' + name + ']: command deployed under <target>/.cursor/commands/');
      }
      const gitlabClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'gitlab');
      const githubClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'github');
      assert(gitlabClaim !== githubClaim && gitlabClaim.length > 0,
        'G8-gitlab: gitlab claim basename is distinct from github — otherwise the content pin is vacuous');
      const wfNext = fs.existsSync(path.join(commandsDir, 'workflow-next.md'))
        ? fs.readFileSync(path.join(commandsDir, 'workflow-next.md'), 'utf8') : '';
      assert(wfNext.includes(gitlabClaim),
        'G8-gitlab: deployed workflow-next is gitlab-shaped — names ' + gitlabClaim);
      assert(!wfNext.includes(githubClaim),
        'G8-gitlab: deployed workflow-next must not name the github claim script ' + githubClaim);
      assert(/\bglab\b/.test(wfNext),
        'G8-gitlab: deployed workflow-next names glab (gitlab routing surface)');
      clean(r);
    }

    // Unknown forge exit 2, nothing written to --target.
    {
      const r = runInstaller(['--forge=svn']);
      assert(r.status === 2,
        'G8-unknown: install-cursor.sh --forge=svn exits 2 (got ' + r.status + ')');
      const leftover = walkFiles(r.dest, '');
      assert(leftover.length === 0,
        'G8-unknown: unknown forge writes nothing under --target — found ' + leftover.slice(0, 6).join(', '));
      clean(r);
    }

    // --no-scripts skips scripts/hooks; agents/commands still deploy.
    {
      const withScripts = runInstaller([]);
      const scriptsDir = path.join(withScripts.cursorHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).length > 0,
        'G8-noscripts: default install deploys support scripts (the --no-scripts contrast)');
      assert(fs.existsSync(path.join(withScripts.dest, '.cursor', 'hooks')),
        'G8-noscripts: default install deploys hooks (the --no-scripts contrast)');
      clean(withScripts);

      const r = runInstaller(['--no-scripts']);
      assert(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(fs.existsSync(path.join(r.dest, '.cursor', 'agents', 'knowledge-lookup.md')),
        'G8-noscripts: agents still deploy');
      assert(!fs.existsSync(path.join(r.cursorHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $CURSOR_HOME/kaola-workflow/scripts');
      const hooksDir = path.join(r.dest, '.cursor', 'hooks');
      const hookFiles = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
      assert(hookFiles.length === 0,
        'G8-noscripts: skips hooks — found ' + hookFiles.join(', '));
      clean(r);
    }

    // Merge preserves user hook entries; uninstall strips kaola entries only.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-dest-'));
      fs.mkdirSync(path.join(dest, '.cursor'), { recursive: true });
      const userHooks = {
        version: 1,
        hooks: { beforeShellExecution: [{ command: 'echo user-owned' }] },
      };
      fs.writeFileSync(path.join(dest, '.cursor', 'hooks.json'), JSON.stringify(userHooks, null, 2) + '\n');
      const r = runInstaller([], { dest });
      assert(r.status === 0, 'G8-merge: install over an existing hooks.json exits 0 (got '
        + r.status + ' — ' + firstLine(r) + ')');
      const merged = JSON.parse(fs.readFileSync(path.join(dest, '.cursor', 'hooks.json'), 'utf8'));
      assert(Array.isArray(merged.hooks.beforeShellExecution)
        && merged.hooks.beforeShellExecution[0].command === 'echo user-owned',
        'G8-merge: preserves the user beforeShellExecution entry');
      assert(Array.isArray(merged.hooks.sessionStart),
        'G8-merge: appends kaola sessionStart');
      const userFile = path.join(dest, '.cursor', 'agents', 'notes.md');
      fs.writeFileSync(userFile, 'user-owned, not kaola-deployed\n');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, CURSOR_HOME: r.cursorHome }),
        encoding: 'utf8',
      });
      assert(ru.status === 0, 'G8-merge-uninstall: --uninstall exits 0 (got ' + ru.status + ')');
      const hooksPath = path.join(dest, '.cursor', 'hooks.json');
      assert(fs.existsSync(hooksPath),
        'G8-merge-uninstall: does not delete the user hooks.json file');
      const stripped = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert(Array.isArray(stripped.hooks.beforeShellExecution),
        'G8-merge-uninstall: user hook entries remain');
      assert(!stripped.hooks.sessionStart,
        'G8-merge-uninstall: kaola sessionStart is stripped');
      assert(fs.existsSync(userFile),
        'G8-merge-uninstall: a user-owned file in the agents dir survives');
      clean(r);
    }

    // --uninstall removes only kaola-deployed names.
    {
      const r = runInstaller([]);
      assert(r.status === 0, 'G8-uninstall: seed install exits 0');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      const userFile = path.join(agentsDir, 'notes.md');
      const userBody = 'user-owned, not kaola-deployed\n';
      fs.writeFileSync(userFile, userBody);
      const userJs = path.join(r.cursorHome, 'kaola-workflow', 'scripts', 'my-local-helper.js');
      const userJsBody = '// user-authored\n';
      if (fs.existsSync(path.dirname(userJs))) fs.writeFileSync(userJs, userJsBody);
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, CURSOR_HOME: r.cursorHome }),
        encoding: 'utf8',
      });
      assert(ru.status === 0,
        'G8-uninstall: --uninstall exits 0 (got ' + ru.status + ' — ' + firstLine(ru) + ')');
      for (const name of canonAgents) {
        assert(!fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed agent is removed');
      }
      for (const name of canonCommandNames) {
        assert(!fs.existsSync(path.join(r.dest, '.cursor', 'commands', name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed command is removed');
      }
      assert(fs.existsSync(userFile) && fs.readFileSync(userFile, 'utf8') === userBody,
        'G8-uninstall: a user-owned file in the agents dir survives (only kaola-deployed names are removed)');
      if (fs.existsSync(path.dirname(userJs))) {
        assert(fs.existsSync(userJs) && fs.readFileSync(userJs, 'utf8') === userJsBody,
          'G8-uninstall: a user-authored helper in the scripts dir survives');
      }
      clean(r);
    }
  }
}

// #1014: catalog preflight copies only listCanonAgents() names. A stray
// user-agent.md in CURSOR_HOME/agents must not land in project .cursor/agents.
// Prefer the exported helper; missing export is RED.
{
  const copy = syncMod.copyListCanonAgents;
  assert(typeof copy === 'function',
    'G9-catalog: sync-cursor-edition.js exports copyListCanonAgents(srcDir, destDir) '
    + '(copies only listCanonAgents() names; not a glob of *.md)');
  if (typeof copy === 'function') {
    const src = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g9-src-'));
    const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g9-dest-'));
    try {
      fs.writeFileSync(path.join(src, 'implementer.md'), '# implementer\n');
      fs.writeFileSync(path.join(src, 'user-agent.md'), '# stray\n');
      copy(src, dest);
      assert(fs.existsSync(path.join(dest, 'implementer.md')),
        'G9-catalog: listCanonAgents() name implementer.md is copied into the project agents dir');
      assert(!fs.existsSync(path.join(dest, 'user-agent.md')),
        'G9-catalog: stray user-agent.md in CURSOR_HOME/agents is NOT copied into project .cursor/agents');
    } finally {
      try { fs.rmSync(src, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
}

// ---------------------------------------------------------------------------
// G10 (#1016 retired by #1039): the former ambient catalog ensure mechanism
// remains driven only while its production file still exists, so the new RED
// can prove exactly what is being removed. The durable acceptance is below:
// project materialization is explicit and sessionStart is non-materializing.
// ---------------------------------------------------------------------------
const G10_ENSURE_JS = 'kaola-workflow-ensure-cursor-catalog.js';
const G10_ENSURE_PATH = path.join(REPO, 'scripts', G10_ENSURE_JS);

function g10LoadEnsure() {
  if (!fs.existsSync(G10_ENSURE_PATH)) {
    return { ok: false, reason: 'file missing' };
  }
  try {
    const resolved = require.resolve(G10_ENSURE_PATH);
    delete require.cache[resolved];
    const mod = require(G10_ENSURE_PATH);
    if (typeof mod.ensureCursorCatalog !== 'function') {
      return { ok: false, reason: 'ensureCursorCatalog export missing', mod: mod };
    }
    return { ok: true, fn: mod.ensureCursorCatalog, mod: mod };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

function g10StatusToken(result) {
  if (result == null) return '';
  if (typeof result === 'string') {
    const m = String(result).match(/\b(already-present|copied|missing-source)\b/);
    return m ? m[1] : String(result).trim();
  }
  if (typeof result === 'object') {
    const s = result.status || result.token || result.result;
    if (typeof s === 'string') {
      const m = s.match(/\b(already-present|copied|missing-source)\b/);
      return m ? m[1] : s.trim();
    }
  }
  return '';
}

function g10WriteCanonAgents(dir, bodyForName) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of canonAgents) {
    fs.writeFileSync(path.join(dir, name + '.md'), bodyForName(name), 'utf8');
  }
}

function g10Rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
}

if (fs.existsSync(G10_ENSURE_PATH)) {
  const loaded = g10LoadEnsure();
  const destOf = cwd => path.join(cwd, '.cursor', 'agents');

  assert(loaded.ok,
    'G10-ensure: scripts/' + G10_ENSURE_JS + ' exports ensureCursorCatalog({ cwd, cursorHome }) — '
    + loaded.reason);

  // already-present: all canon names exist under dest AND each is byte-identical
  // to the same name under $cursorHome/agents. A unique marker that matches global stays.
  {
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-ap-cwd-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-ap-home-'));
    try {
      const marker = 'G10-MARKER-ALREADY-PRESENT-' + Date.now() + '\n';
      g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# global ' + n + '\n' + marker);
      g10WriteCanonAgents(destOf(cwd), n => '# global ' + n + '\n' + marker);
      if (!loaded.ok) {
        assert(false, 'G10-ensure[already-present]: all listCanonAgents() dest files byte-identical '
          + 'to $cursorHome/agents → already-present (module missing)');
      } else {
        const result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        assert(g10StatusToken(result) === 'already-present',
          'G10-ensure[already-present]: status already-present when dest is complete and '
          + 'byte-identical to global — got ' + JSON.stringify(result));
        const body = fs.readFileSync(path.join(destOf(cwd), 'implementer.md'), 'utf8');
        assert(body.includes(marker.trim()),
          'G10-ensure[already-present]: matching dest marker survives (do not overwrite in-sync dest)');
      }
    } finally {
      g10Rm(cwd); g10Rm(cursorHome);
    }
  }

  // Lone implementer.md is not already-present.
  {
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-lone-cwd-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-lone-home-'));
    try {
      g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# home ' + n + '\n');
      fs.mkdirSync(destOf(cwd), { recursive: true });
      fs.writeFileSync(path.join(destOf(cwd), 'implementer.md'), '# home implementer\n');
      if (!loaded.ok) {
        assert(false, 'G10-ensure[lone-implementer]: a lone dest implementer.md is not already-present '
          + '(module missing)');
      } else {
        const result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        assert(g10StatusToken(result) === 'copied',
          'G10-ensure[lone-implementer]: incomplete dest is copied, not already-present — got '
          + JSON.stringify(result));
        for (const name of canonAgents) {
          assert(fs.existsSync(path.join(destOf(cwd), name + '.md')),
            'G10-ensure[lone-implementer]: dest has canon name ' + name + '.md after refresh');
        }
      }
    } finally {
      g10Rm(cwd); g10Rm(cursorHome);
    }
  }

  // Drifted dest prompt is not present → copy/overwrite from global.
  {
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-drift-cwd-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-drift-home-'));
    try {
      g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# HOME ' + n + '\n');
      g10WriteCanonAgents(destOf(cwd), n => '# DRIFT ' + n + '\n');
      if (!loaded.ok) {
        assert(false, 'G10-ensure[drift]: dest bytes that differ from global are refreshed from '
          + '$cursorHome/agents (module missing)');
      } else {
        const result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        assert(g10StatusToken(result) === 'copied',
          'G10-ensure[drift]: drifted dest is copied, not already-present — got '
          + JSON.stringify(result));
        const body = fs.readFileSync(path.join(destOf(cwd), 'implementer.md'), 'utf8');
        assert(body === '# HOME implementer\n',
          'G10-ensure[drift]: dest implementer.md is replaced by global bytes — got '
          + JSON.stringify(body.slice(0, 80)));
      }
    } finally {
      g10Rm(cwd); g10Rm(cursorHome);
    }
  }

  // Refresh copies only listCanonAgents() names from $cursorHome/agents.
  // Dest is always <cwd>/.cursor/agents. Stray user-agent.md in dest or home stays out.
  {
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-copy-cwd-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-copy-home-'));
    try {
      g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# HOME ' + n + '\n');
      fs.writeFileSync(path.join(cursorHome, 'agents', 'user-agent.md'), '# stray-home\n');
      fs.mkdirSync(destOf(cwd), { recursive: true });
      const destStray = path.join(destOf(cwd), 'user-agent.md');
      fs.writeFileSync(destStray, '# stray-dest\n');
      if (!loaded.ok) {
        assert(false, 'G10-ensure[copied]: dest empty-of-canon copies listCanonAgents() names from '
          + '$cursorHome/agents only (module missing)');
      } else {
        const result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        assert(g10StatusToken(result) === 'copied',
          'G10-ensure[copied]: incomplete dest → copied — got ' + JSON.stringify(result));
        assert(fs.existsSync(path.join(destOf(cwd), 'implementer.md')),
          'G10-ensure[copied]: dest is <cwd>/.cursor/agents and receives implementer.md');
        assert(fs.readFileSync(path.join(destOf(cwd), 'implementer.md'), 'utf8') === '# HOME implementer\n',
          'G10-ensure[copied]: canon files come from $cursorHome/agents');
        for (const name of canonAgents) {
          assert(fs.existsSync(path.join(destOf(cwd), name + '.md')),
            'G10-ensure[copied]: dest receives canon name ' + name + '.md');
        }
        assert(fs.existsSync(destStray) && fs.readFileSync(destStray, 'utf8') === '# stray-dest\n',
          'G10-ensure[copied]: user-owned extra file in dest is not touched');
        assert(fs.readFileSync(destStray, 'utf8') !== '# stray-home\n',
          'G10-ensure[copied]: $cursorHome/agents/user-agent.md is not copied into dest');
      }
    } finally {
      g10Rm(cwd); g10Rm(cursorHome);
    }
  }

  // Drop git-toplevel-as-preferred-source: even when git toplevel has a different
  // catalog, dest is <cwd>/.cursor/agents and bytes come from $cursorHome/agents.
  {
    const repo = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-git-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-git-home-'));
    try {
      G.init(repo);
      g10WriteCanonAgents(path.join(repo, '.cursor', 'agents'), n => '# TOPLEVEL ' + n + '\n');
      g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# HOME ' + n + '\n');
      const cwd = path.join(repo, 'consumer');
      fs.mkdirSync(cwd, { recursive: true });
      if (!loaded.ok) {
        assert(false, 'G10-ensure[global-source]: copy from $cursorHome/agents, not git toplevel '
          + 'in preference to home (module missing)');
      } else {
        const result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        assert(g10StatusToken(result) === 'copied',
          'G10-ensure[global-source]: empty dest under cwd → copied from global — got '
          + JSON.stringify(result));
        const destBody = fs.existsSync(path.join(destOf(cwd), 'implementer.md'))
          ? fs.readFileSync(path.join(destOf(cwd), 'implementer.md'), 'utf8') : '';
        assert(destBody === '# HOME implementer\n',
          'G10-ensure[global-source]: dest bytes are from $cursorHome/agents, not git toplevel — got '
          + JSON.stringify(destBody.slice(0, 80)));
        const topBody = fs.readFileSync(path.join(repo, '.cursor', 'agents', 'implementer.md'), 'utf8');
        assert(topBody === '# TOPLEVEL implementer\n',
          'G10-ensure[global-source]: git-toplevel catalog is not the dest and is not preferred');
      }
    } finally {
      g10Rm(repo); g10Rm(cursorHome);
    }
  }

  // missing-source: $cursorHome/agents has no implementer.md. Do not invent files.
  {
    const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-miss-cwd-'));
    const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-miss-home-'));
    try {
      fs.mkdirSync(path.join(cursorHome, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(cursorHome, 'agents', 'user-agent.md'), '# not-canon\n');
      if (!loaded.ok) {
        assert(false, 'G10-ensure[missing-source]: empty global canon → missing-source, no invented '
          + 'files (module missing)');
      } else {
        let threw = false;
        let result = null;
        try {
          result = loaded.fn({ cwd: cwd, cursorHome: cursorHome });
        } catch (e) {
          threw = true;
          result = e;
        }
        const token = g10StatusToken(result);
        assert(token === 'missing-source' || (threw && /missing-source/i.test(String(result))),
          'G10-ensure[missing-source]: status missing-source when $cursorHome/agents has no '
          + 'implementer.md — got ' + JSON.stringify(token || String(result && result.message || result)));
        assert(!fs.existsSync(path.join(destOf(cwd), 'implementer.md')),
          'G10-ensure[missing-source]: does not invent dest implementer.md');
      }
    } finally {
      g10Rm(cwd); g10Rm(cursorHome);
    }
  }
}

if (fs.existsSync(G10_ENSURE_PATH)) {
  assert(fs.existsSync(G10_ENSURE_PATH),
    'G10-cli: scripts/' + G10_ENSURE_JS + ' exists');

  const iso = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-'));
  try {
    if (!fs.existsSync(G10_ENSURE_PATH)) {
      assert(false, 'G10-cli: isolated require() of ' + G10_ENSURE_JS
        + ' without sync-cursor-edition.js beside it (file missing)');
    } else {
      const isoFile = path.join(iso, G10_ENSURE_JS);
      fs.copyFileSync(G10_ENSURE_PATH, isoFile);
      assert(!fs.existsSync(path.join(iso, 'sync-cursor-edition.js')),
        'G10-cli: isolation dir has no sync-cursor-edition.js');
      try {
        const resolved = require.resolve(isoFile);
        delete require.cache[resolved];
        const mod = require(isoFile);
        assert(typeof mod.ensureCursorCatalog === 'function',
          'G10-cli: isolated require() exports ensureCursorCatalog (self-contained under '
          + '$CURSOR_HOME/kaola-workflow/scripts/)');

        const destOfIso = cwd => path.join(cwd, '.cursor', 'agents');
        function isoDestNames(cwd) {
          const dest = destOfIso(cwd);
          if (!fs.existsSync(dest)) return [];
          return fs.readdirSync(dest).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
        }
        function assertIsoRoster(names, label) {
          assert(Array.isArray(names) && names.length === canonAgents.length,
            'G10-cli[isolated-drive]: ' + label + ' roster length equals canonAgents ('
            + canonAgents.length + ') — got ' + JSON.stringify(names));
          for (const name of canonAgents) {
            assert(names.indexOf(name) !== -1,
              'G10-cli[isolated-drive]: ' + label + ' includes canon name ' + name
              + ' — got ' + JSON.stringify(names));
          }
        }

        if (typeof mod.listCanonAgents === 'function') {
          assertIsoRoster(mod.listCanonAgents(), 'isolated listCanonAgents()');
        }

        {
          const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-copy-cwd-'));
          const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-copy-home-'));
          try {
            g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# ISO-HOME ' + n + '\n');
            fs.writeFileSync(path.join(cursorHome, 'agents', 'user-agent.md'), '# stray-home\n');
            const result = mod.ensureCursorCatalog({ cwd: cwd, cursorHome: cursorHome });
            assert(g10StatusToken(result) === 'copied',
              'G10-cli[isolated-drive]: dest empty-of-canon → copied — got '
              + JSON.stringify(result));
            assertIsoRoster(isoDestNames(cwd).filter(n => n !== 'user-agent'),
              'dest after isolated copy');
            for (const name of canonAgents) {
              assert(fs.existsSync(path.join(destOfIso(cwd), name + '.md')),
                'G10-cli[isolated-drive]: dest has canon name ' + name + '.md');
            }
            assert(!fs.existsSync(path.join(destOfIso(cwd), 'user-agent.md')),
              'G10-cli[isolated-drive]: dest does not receive $cursorHome/agents/user-agent.md');
          } finally {
            g10Rm(cwd); g10Rm(cursorHome);
          }
        }

        {
          const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-lone-cwd-'));
          const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-lone-home-'));
          try {
            g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# ISO-HOME ' + n + '\n');
            fs.mkdirSync(destOfIso(cwd), { recursive: true });
            fs.writeFileSync(path.join(destOfIso(cwd), 'implementer.md'),
              '# ISO-HOME implementer\n');
            const result = mod.ensureCursorCatalog({ cwd: cwd, cursorHome: cursorHome });
            assert(g10StatusToken(result) === 'copied',
              'G10-cli[isolated-drive]: lone matching dest implementer.md → copied, not '
              + 'already-present — got ' + JSON.stringify(result));
            assert(g10StatusToken(result) !== 'already-present',
              'G10-cli[isolated-drive]: lone dest implementer.md is not already-present');
            assertIsoRoster(isoDestNames(cwd), 'dest after isolated lone-implementer copy');
            for (const name of canonAgents) {
              assert(fs.existsSync(path.join(destOfIso(cwd), name + '.md')),
                'G10-cli[isolated-drive]: lone dest then has canon name ' + name + '.md');
            }
          } finally {
            g10Rm(cwd); g10Rm(cursorHome);
          }
        }

        if (typeof mod.listCanonAgents !== 'function') {
          const cwd = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-roster-cwd-'));
          const cursorHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-iso-roster-home-'));
          try {
            g10WriteCanonAgents(path.join(cursorHome, 'agents'), n => '# ISO-HOME ' + n + '\n');
            mod.ensureCursorCatalog({ cwd: cwd, cursorHome: cursorHome });
            assertIsoRoster(isoDestNames(cwd), 'dest after copy (listCanonAgents not exported)');
          } finally {
            g10Rm(cwd); g10Rm(cursorHome);
          }
        }
      } catch (e) {
        assert(false, 'G10-cli: isolated require() without sync-cursor-edition.js beside it must work — '
          + String((e && e.message) || e));
      }
    }
  } finally {
    g10Rm(iso);
  }

  function runEnsureCli(cwd, cursorHome) {
    // spawn-class: environment
    return spawnSync(process.execPath, [G10_ENSURE_PATH], {
      cwd: cwd,
      env: Object.assign({}, process.env, { CURSOR_HOME: cursorHome }),
      encoding: 'utf8',
    });
  }

  if (!fs.existsSync(G10_ENSURE_PATH)) {
    assert(false, 'G10-cli: stdout contains already-present | copied | missing-source (file missing)');
    assert(false, 'G10-cli: already-present and copied exit 0; missing-source exits non-zero (file missing)');
  } else {
    const homeAp = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-ap-home-'));
    const cwdAp = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-ap-cwd-'));
    const homeCp = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-cp-home-'));
    const cwdCp = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-cp-cwd-'));
    const homeMs = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-ms-home-'));
    const cwdMs = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-cli-ms-cwd-'));
    try {
      g10WriteCanonAgents(path.join(homeAp, 'agents'), n => '# cli ' + n + '\n');
      g10WriteCanonAgents(path.join(cwdAp, '.cursor', 'agents'), n => '# cli ' + n + '\n');
      const ap = runEnsureCli(cwdAp, homeAp);
      const apOut = String(ap.stdout || '') + String(ap.stderr || '');
      assert(/\balready-present\b/.test(apOut),
        'G10-cli: stdout contains already-present when dest is in-sync — got '
        + JSON.stringify(apOut.slice(0, 200)));
      assert(ap.status === 0,
        'G10-cli: already-present exits 0 (got ' + ap.status + ')');

      g10WriteCanonAgents(path.join(homeCp, 'agents'), n => '# cli-home ' + n + '\n');
      const cp = runEnsureCli(cwdCp, homeCp);
      const cpOut = String(cp.stdout || '') + String(cp.stderr || '');
      assert(/\bcopied\b/.test(cpOut),
        'G10-cli: stdout contains copied when dest is filled from global — got '
        + JSON.stringify(cpOut.slice(0, 200)));
      assert(cp.status === 0, 'G10-cli: copied exits 0 (got ' + cp.status + ')');

      fs.mkdirSync(path.join(homeMs, 'agents'), { recursive: true });
      const ms = runEnsureCli(cwdMs, homeMs);
      const msOut = String(ms.stdout || '') + String(ms.stderr || '');
      assert(/\bmissing-source\b/.test(msOut),
        'G10-cli: stdout contains missing-source when global has no implementer.md — got '
        + JSON.stringify(msOut.slice(0, 200)));
      assert(ms.status !== 0 && ms.status != null,
        'G10-cli: missing-source exits non-zero (got ' + ms.status + ')');
    } finally {
      g10Rm(homeAp); g10Rm(cwdAp); g10Rm(homeCp); g10Rm(cwdCp); g10Rm(homeMs); g10Rm(cwdMs);
    }
  }
}

{
  const manifest = require('./kaola-workflow-install-manifest.js');
  const githubScripts = manifest.supportScripts('github');
  assert(Array.isArray(githubScripts) && !githubScripts.includes(G10_ENSURE_JS),
    'G10-install: supportScripts(\'github\') does not include ' + G10_ENSURE_JS
    + ' (ambient project materialization is retired)');

  const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
  function runInstaller(extraArgs, opts) {
    opts = opts || {};
    const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-i-home-'));
    const cursorHome = opts.cursorHome || fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-i-ch-'));
    const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'cursor-g10-i-dest-'));
    const args = ['--yes'].concat(opts.skipTarget ? [] : ['--target', dest]).concat(extraArgs || []);
    const spawnOpts = {
      env: Object.assign({}, process.env, { HOME: home, CURSOR_HOME: cursorHome }),
      encoding: 'utf8',
    };
    if (opts.cwd) spawnOpts.cwd = opts.cwd;
    // spawn-class: environment
    const r = spawnSync('bash', [INSTALLER].concat(args), spawnOpts);
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home, cursorHome, dest };
  }
  const clean = r => {
    for (const d of [r.home, r.cursorHome, r.dest]) g10Rm(d);
  };

  {
    const r = runInstaller(['--global'], { skipTarget: true });
    assert(r.status === 0,
      'G10-install: install-cursor.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
    assert(!fs.existsSync(path.join(r.cursorHome, 'kaola-workflow', 'scripts', G10_ENSURE_JS))
      && !fs.existsSync(path.join(r.cursorHome, 'hooks',
        'kaola-workflow-ensure-cursor-catalog.sh')),
    'G10-install: --global deploys no ambient project-catalog ensure script or hook');
    assert(!fs.existsSync(G10_ENSURE_PATH),
      'G10-install: the retired ambient catalog materializer is absent from the shipped source');
    clean(r);
  }
}

{
  const skelPath = path.join(REPO, 'templates', 'routing', 'init.skeleton.md');
  assert(fs.existsSync(skelPath), 'G10: templates/routing/init.skeleton.md exists');
}

{
  const initRel = commandRel('workflow-init');
  const initBody = exists(initRel) ? read(initRel) : '';
  assert(exists(initRel),
    'G11: generated ' + initRel + ' exists');
  assert(!/KW-AGENTS-TEMPLATE-(?:START|END)/.test(initBody)
      && /## Step 2 — Reconcile project instructions/.test(initBody)
      && /kaola-workflow-project-instruction-templates\.js/.test(initBody)
      && /kaola-workflow-project-instructions\.js/.test(initBody),
    'G11: generated workflow-init must carry the shared AGENTS.md authority migration job '
    + 'through the sole distribution module and writer, not an inline Cursor copy');
}

{
  const mappingText = typeof syncMod.renderCursorHooksJson === 'function'
    ? syncMod.renderCursorHooksJson()
    : (exists('.cursor/hooks.json') ? read('.cursor/hooks.json') : '{}');
  let parsed = null;
  try { parsed = JSON.parse(mappingText); } catch (_) { parsed = null; }
  const session = parsed && parsed.hooks && Array.isArray(parsed.hooks.sessionStart)
    ? parsed.hooks.sessionStart : [];
  const sessionBlob = JSON.stringify(session);
  const hasAmbientMaterializer = entries => entries.some(entry =>
    /ensure|catalog|materializ/i.test(String(entry && entry.command)));
  assert(session.length >= 1 && /compact/i.test(sessionBlob),
    'G10-hook: compact wrapper remains as a non-materializing sessionStart command');
  const ensureEntries = session.filter(e => /ensure|catalog/i.test(String((e && e.command) || '')));
  assert(ensureEntries.length === 0,
    'G10-hook: sessionStart contains no ambient ensure/catalog materializer — got '
    + JSON.stringify(ensureEntries));
  for (const e of session) {
    const t = e && e.timeout;
    assert(t === 5 || t === undefined || t <= 5,
      'G10-hook: sessionStart timeout stays 5s-compatible — got ' + JSON.stringify(t));
  }
  assert(hasAmbientMaterializer(session.concat({
    command: '.cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh', timeout: 5,
  })),
  'G10-hook mutation RED: an injected ambient project-catalog sessionStart command is detected');
}

if (failed) {
  console.error('\ncursor-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('cursor-edition test passed (' + passed + ' assertions).' + driftVerdict);
