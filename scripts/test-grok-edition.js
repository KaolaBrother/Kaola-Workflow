#!/usr/bin/env node
'use strict';
// Child processes in this file are classified per site (ADR 0013). The ratchet
// reads the spawn line or the line above it. Two classes appear here:
//   environment    installer / --write materialize / TREE_ROOT git probe
//   cli-contract   --check / --help / unknown --forge refuse / --print-tree-root

// ---------------------------------------------------------------------------
// test-grok-edition.js — structural + parity validator for the Grok CLI
// runtime edition (#1008). Hand-rolled asserts (no framework). Mirror of
// test-kimi-edition.js / test-opencode-edition.js, scoped to the additive
// grok surface. Run directly:
//   node scripts/test-grok-edition.js
//
// Grok CLI is a coding-agent RUNTIME, not a forge, and it does not ride
// install.sh / edition-sync.js / npm test. It is delivered the Grok-native
// way: flat commands under `.grok/commands/<name>.md`; the machine-global
// transaction owns the one compact-safe Rule. Kaola-Workflow ships no Grok
// agents and pins no subagent model or effort (#1101): subagents are Grok's
// own `spawn_subagent` types, and the generated tree's agents/ directory is a
// retired surface that --check flags and --write prunes.
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
const adapterFacts = require('./runtime-adapter-facts.js');
const globalContract = require('./kaola-workflow-global-contract.js');

const REPO = path.resolve(__dirname, '..');
const SYNC_JS = path.join(REPO, 'scripts', 'sync-grok-edition.js');
const INSTALLER = path.join(REPO, 'install-grok.sh');
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
  // An explicit isolated root bound to THIS checkout wins, as in the generators: both
  // KAOLA_EDITION_TREE_ROOT and KAOLA_EDITION_TREE_FOR absolute, the latter naming REPO.
  {
    const root = process.env.KAOLA_EDITION_TREE_ROOT;
    const forRepo = process.env.KAOLA_EDITION_TREE_FOR;
    const real = p => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
    if (root && forRepo && path.isAbsolute(root) && path.isAbsolute(forRepo)
        && real(forRepo) === real(REPO)) return path.resolve(root);
  }
  // spawn-class: environment
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) return REPO;
  const common = String(r.stdout || '').trim();
  if (!common) return REPO;
  const abs = path.resolve(REPO, common);
  return path.basename(abs) === '.git' ? path.dirname(abs) : REPO;
})();

function treeLabel(forge) {
  return '.grok' + forgeLayout.outSuffix(forge);
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

function generatedTreeFiles(label) {
  return walkFiles(path.join(TREE_ROOT, label), label);
}

const commandNamesFor = forge => forgeLayout.commandSources(forge)
  .map(s => s.basename.replace(/\.md$/, '')).sort();

// The seven Kaola roles retired by #1101, named only so this suite can prove none returns.
const RETIRED_ROLES = Object.freeze([
  'code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide',
]);
const RETIRED_ROLE_RE = new RegExp('\\b(?:' + RETIRED_ROLES.join('|') + ')\\b');

// The Grok adapter records only native facts; no Kaola role or model-binding capability.
const GROK_ADAPTER = adapterFacts.loadRuntimeAdapters(REPO).runtimes.grok;

// ---------------------------------------------------------------------------
// GROK_RUNTIME_NATIVE — the native-only subagent rule as a DECLARED table
// entry, not merely as prose. Deleting the declaration reds this suite.
// ---------------------------------------------------------------------------
const GROK_RUNTIME_NATIVE = Object.freeze({
  native_subagents:
    'Grok subagents are the host\'s own spawn_subagent types; the edition ships no agents and sets no per-call or profile model or effort.',
});

const GROK_SYNC_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'sync-grok-edition.js'), 'utf8');

// ---------------------------------------------------------------------------
// Additive boundary — grok is a runtime, not a forge. Read the tree; do not
// modify those files. install-all.sh MUST name grok (red until wired).
// ---------------------------------------------------------------------------
{
  const editionSyncSrc = fs.readFileSync(path.join(REPO, 'scripts', 'edition-sync.js'), 'utf8');
  const forgesDecl = editionSyncSrc.match(/const FORGES\s*=\s*\[([^\]]*)\]/);
  assert(!!forgesDecl, 'B0: edition-sync.js declares FORGES');
  const forges = forgesDecl
    ? forgesDecl[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
    : [];
  assert(!forges.includes('grok'),
    'B0: edition-sync.js FORGES does not include grok — got ' + JSON.stringify(forges));

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const npmTest = String((pkg.scripts && pkg.scripts.test) || '');
  assert(!npmTest.includes('test-grok-edition.js'),
    'B0: package.json scripts.test does not invoke test-grok-edition.js');

  const installSh = fs.readFileSync(path.join(REPO, 'install.sh'), 'utf8');
  assert(!/\bgrok\b/i.test(installSh),
    'B0: install.sh does not mention grok as a runtime to install');

  const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
  assert(/\bgrok\b/.test(installAll) && installAll.includes('install-grok.sh'),
    'B0: install-all.sh MUST name grok and install-grok.sh (additive runtime, not a forge gate)');
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
    'D0: the forge axis includes github (the default grok tree label is .grok)');
  for (const forge of forgeLayout.FORGES) {
    const label = treeLabel(forge);
    if (!fs.existsSync(treeRootFor(forge))) { absent.push(label); continue; }
    if (!fs.existsSync(SYNC_JS)) {
      console.error('grok-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk but scripts/sync-grok-edition.js is missing, so drift cannot be observed.');
      process.exit(1);
    }
    const r = runGeneratorCli(['--forge=' + forge, '--check']);
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\ngrok-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-grok-edition.js --forge=' + forge + ' --write'
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
// Self-provision: regenerate .grok/ from tracked canonical sources before any
// assertion that reads it. If the generator is missing, fail with a clear
// "generator not present" (the HEAD-red this suite is authored to produce).
// ---------------------------------------------------------------------------
{
  if (!fs.existsSync(SYNC_JS)) {
    assert(false, 'generator not present: scripts/sync-grok-edition.js is required to materialize the grok edition');
    console.error('FATAL: generator not present (scripts/sync-grok-edition.js). '
      + 'The grok edition suite cannot self-provision or judge a generated tree.');
    console.error('\ngrok-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
      + driftVerdict);
    process.exit(1);
  }
  const r = runGenerator(['--write']);
  if (r.status !== 0) {
    console.error('FATAL: sync-grok-edition --write failed (test cannot proceed):');
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
assert(fs.existsSync(path.join(TREE_ROOT, '.grok')),
  'D1: the github tree lands at <tree-root>/.grok (got missing at ' + path.join(TREE_ROOT, '.grok') + ')');
assert(treeLabel('github') === '.grok'
  && treeLabel('gitlab') === '.grok-gitlab'
  && treeLabel('gitea') === '.grok-gitea',
  'D1: treeLabel is .grok / .grok-gitlab / .grok-gitea (kimi-style outSuffix)');

const canonCommandNames = commandNamesFor(DEFAULT_FORGE);

// ---------------------------------------------------------------------------
// G0 — THE SUBJECT UNDER TEST IS THE GENERATOR'S OUTPUT, derived from TRACKED
// canonical sources. An absent tree must fail loudly rather than let every
// readdir-driven loop iterate over nothing.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(path.join(TREE_ROOT, '.grok', 'commands'));
  assert(provisioned,
    'G0: the generated .grok/commands tree exists after sync --write');
  if (!provisioned) {
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.grok') + ' — nothing below can be tested.');
    process.exit(1);
  }
  assert(canonCommandNames.length > 0,
    'G0-roster: the routing-registry command surfaces are non-empty');
  assert(!fs.existsSync(path.join(REPO, 'agents')),
    'G0-roster: the repository tracks no canonical agents/ role inventory (#1101)');
  const caps = GROK_ADAPTER.capabilities || {};
  for (const retired of ['named_roles', 'subagent_default', 'dispatch_conformance', 'role_dispatch',
    'model_carrier', 'profile_format']) {
    assert(!Object.prototype.hasOwnProperty.call(caps, retired),
      'G0-binding: the Grok adapter records no ' + retired + ' role or model-binding capability');
  }
  assert(!/spawn_subagent|subagent_type/.test(String((caps.delegation_guidance || {}).native_routes || '')),
    'G0-adapter: the Grok adapter does not teach a spawn_subagent type catalog');
  assert(!/const\s+GROK_MODEL_EFFORTS\b|function\s+effortForModelToken\b/.test(GROK_SYNC_SRC),
    'G0-adapter: sync-grok-edition carries no executable hardcoded effort table; '
    + 'runtime-capabilities.json is the sole runtime identifier authority');
  assert(!/renderAgent|writeAgents|listCanonAgents/.test(GROK_SYNC_SRC)
    && /require\('\.\/runtime-adapter-facts'\)/.test(GROK_SYNC_SRC),
    'G0-adapter: sync-grok-edition renders no agent and takes its adapter facts from runtime-adapter-facts');
}

function commandRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/commands/' + name + '.md';
}

// ---------------------------------------------------------------------------
// G1: agents — Kaola-Workflow ships no Grok agents (#1101). After --write the
// generated tree has no agents/ directory at all, and no generated file carries
// a profile frontmatter model: or effort: binding.
// ---------------------------------------------------------------------------
{
  assert(!fs.existsSync(path.join(TREE_ROOT, '.grok', 'agents')),
    'G1: the generated .grok tree has no agents/ directory after sync --write');
  for (const rel of generatedTreeFiles('.grok')) {
    const { raw } = parseFrontmatter(read(rel));
    assert(!/^\s*(?:model|effort|reasoning_effort)\s*:/m.test(raw),
      'G1: ' + rel + ' carries no pinned model/effort frontmatter');
  }
}

// ---------------------------------------------------------------------------
// G2: commands — exact set = routing-registry commandSources() for the forge,
// not a hand list. No Agent(/spawn_subagent( role card and no retired role name
// (#1101). No CLAUDE_PLUGIN_ROOT, no ~/.claude/kaola-workflow. --runtime grok
// present (not --runtime claude). No model="{...}" placeholders, no per-call
// model=" overrides, no vendor slugs.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.grok', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .grok/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const COMPACT_START = '<!-- KW-COMPACT-RECOVERY-START -->';
  const COMPACT_END = '<!-- KW-COMPACT-RECOVERY-END -->';
  const DISPATCH_END = '<!-- KW-RUNTIME-DISPATCH-END -->';
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
    if (name === 'workflow-init') continue;
    const canonStart = canon.indexOf(COMPACT_START);
    const canonEnd = canon.indexOf(COMPACT_END);
    const grokStart = content.indexOf(COMPACT_START);
    const grokEnd = content.indexOf(COMPACT_END);
    assert(canonStart >= 0 && canonEnd > canonStart,
      'G2[' + name + ']: canonical command owns one complete compact recovery block');
    assert(grokStart >= 0 && grokEnd > grokStart,
      'G2[' + name + ']: generated command keeps the complete compact recovery block');
    const grokBlock = grokStart >= 0 && grokEnd > grokStart
      ? content.slice(grokStart, grokEnd + COMPACT_END.length) : '';
    // #1069: the dispatch contract moved to the always-loaded Rule; the command carries the
    // pointer once and no marked dispatch region.
    const dispatchNeedle = /Runtime dispatch contract \(always loaded\)/i;
    assert(!dispatchNeedle.test(content) && !content.includes(DISPATCH_END)
      && content.split(adapterFacts.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 1,
      'G2[' + name + ']: generated command carries the always-loaded-carrier pointer once, no dispatch block');
    assert(!/^(?:Agent|Task|spawn_subagent)\(/m.test(content) && !/subagent_type\s*=/.test(content),
      'G2[' + name + ']: no role dispatch card (Agent( / spawn_subagent( with subagent_type=) remains');
    const role = content.match(RETIRED_ROLE_RE);
    assert(!role,
      'G2[' + name + ']: generated command names no retired Kaola role — found ' + JSON.stringify(role && role[0]));
  }
}

{
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
  // #1101 — no pinned binding remains, so a vendor model slug is banned everywhere.
  const VENDOR_SLUG = /\bgrok-4\.\d\b|\bgrok-build\b/;
  let runtimeGrok = 0;
  for (const rel of generatedTreeFiles('.grok')) {
    const content = read(rel);
    assert(!/CLAUDE_PLUGIN_ROOT/.test(content),
      'G2-leak: ' + rel + ': no CLAUDE_PLUGIN_ROOT');
    assert(!/~\/\.claude\/kaola-workflow/.test(content)
      && !/\$HOME\/\.claude\/kaola-workflow/.test(content),
      'G2-leak: ' + rel + ': no ~/.claude/kaola-workflow');
    assert(!/--runtime claude\b/.test(content),
      'G2-leak: ' + rel + ': no --runtime claude (rewritten to --runtime grok)');
    assert(!/model="\{/.test(content),
      'G2-leak: ' + rel + ': no model="{...}" placeholder');
    assert(!/\bmodel="/.test(content),
      'G2-leak: ' + rel + ': no per-call model=" override');
    assert(!VENDOR_SLUG.test(content),
      'G2-leak: ' + rel + ': no vendor model slug (grok-4.x / grok-build)');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          'G2-leak: ' + rel + ':' + (i + 1) + ': Claude model noun "' + m[0]
          + '" leaked into generated grok prose');
      }
    }
    if (/--runtime grok\b/.test(content)) runtimeGrok++;
  }
  assert(runtimeGrok > 0,
    'G2: at least one generated file stamps --runtime grok (claim/startup bite)');
  assert(/--runtime grok\b/.test(read(commandRel('workflow-next'))),
    'G2[workflow-next]: claim invocation stamps --runtime grok');
}

// ---------------------------------------------------------------------------
// G2-declaration: GROK_RUNTIME_NATIVE.native_subagents exists, states the
// native-only rule, and the generated tree matches it: no generated file pins a
// model or effort, per call or in frontmatter, and nothing dispatches a role.
// ---------------------------------------------------------------------------
{
  const KEY = 'native_subagents';
  const reason = GROK_RUNTIME_NATIVE[KEY];
  assert(typeof reason === 'string' && reason.trim().length >= 20,
    'G2-declaration: GROK_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason');
  assert(/spawn_subagent/.test(reason) && /no agents/i.test(reason) && /no\b[^.]*model/i.test(reason),
    'G2-declaration: the "' + KEY + '" reason must state native spawn_subagent types, no agents, no model');
  for (const rel of generatedTreeFiles('.grok')) {
    const content = read(rel);
    assert(!/\bmodel="/.test(content) && !/\beffort="/.test(content),
      'G2-declaration: ' + rel + ' carries a per-call model/effort override, contradicting ' + KEY);
    assert(!/^\s*(?:model|effort)\s*:/m.test(parseFrontmatter(content).raw),
      'G2-declaration: ' + rel + ' carries a pinned model/effort frontmatter line, contradicting ' + KEY);
  }
}

// ---------------------------------------------------------------------------
// G3: --check re-renders from canonical and agrees with the tree --write just
// produced (render determinism across processes). Then a planted drift must
// turn --check red. A planted leftover agents/*.md (a pre-#1101 role render)
// is reported as a retired role profile, and --write prunes it along with the
// then-empty agents/ directory.
// ---------------------------------------------------------------------------
{
  const ok = runGeneratorCli(['--check']);
  assert(ok.status === 0,
    'G3: sync-grok-edition --check exits 0 against the tree --write just produced'
    + (ok.status !== 0 ? ' — ' + String(ok.stderr || ok.stdout).split('\n')[0] : ''));
  const probe = path.join(TREE_ROOT, '.grok', 'commands', 'workflow-next.md');
  assert(fs.existsSync(probe), 'G3: commands/workflow-next.md exists to plant drift against');
  const orig = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : '';
  try {
    fs.appendFileSync(probe, '\n<!-- grok-edition drift probe -->\n');
    const drifted = runGeneratorCli(['--check']);
    assert(drifted.status !== 0,
      'G3: --check exits non-zero on a drifted generated command (got ' + drifted.status + ')');
  } finally {
    try { fs.writeFileSync(probe, orig); } catch (_) { /* restore best-effort */ }
  }
  assert(runGeneratorCli(['--check']).status === 0,
    'G3: --check exits 0 after the planted drift is restored');

  const agentsDir = path.join(TREE_ROOT, '.grok', 'agents');
  const leftover = path.join(agentsDir, 'implementer.md');
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(leftover, '---\nname: implementer\nmodel: grok-4.7\neffort: medium\n---\nretired render\n');
    const flagged = runGeneratorCli(['--check']);
    const out = String(flagged.stdout || '') + String(flagged.stderr || '');
    assert(flagged.status !== 0,
      'G3-retired: --check exits non-zero on a leftover agents/implementer.md (got ' + flagged.status + ')');
    assert(/\.grok\/agents\/implementer\.md/.test(out) && /retired role profile/.test(out),
      'G3-retired: --check names the leftover as a retired role profile — got '
      + JSON.stringify(out.split('\n').filter(l => /agents/.test(l)).slice(0, 2)));
    const w = runGenerator(['--write']);
    assert(w.status === 0 && /pruned\s+\.grok\/agents\/implementer\.md \(retired role profile\)/.test(String(w.stdout || '')),
      'G3-retired: --write prunes the leftover as a retired role profile');
    assert(!fs.existsSync(leftover) && !fs.existsSync(agentsDir),
      'G3-retired: after --write neither the leftover nor the empty agents/ directory remains');
    assert(runGeneratorCli(['--check']).status === 0,
      'G3-retired: --check is green again after --write prunes the leftover');
  } finally {
    try { fs.rmSync(leftover, { force: true }); fs.rmdirSync(agentsDir); } catch (_) { /* pruned */ }
  }
}

// ---------------------------------------------------------------------------
// G5: the edition emits no second Rule. The machine-global transaction renders
// the complete persistent Grok Rule from the one contract source.
// ---------------------------------------------------------------------------
{
  const retiredRel = '.grok/rules/kaola-workflow-compact-recovery.md';
  assert(!exists(retiredRel), 'G5: generated edition has no duplicate compact recovery Rule');
  const registry = JSON.parse(read('templates/global/runtime-contract-adapters.json'));
  const target = registry.targets.find(row => row.id === 'grok-local');
  const rule = globalContract.renderContract({
    source: read('templates/global/kaola-workflow-global.md'), target,
  }).toString('utf8');
  assert(/KW-COMPACT-RECOVERY-V2/.test(rule)
    && /Runtime dispatch contract \(always loaded\)/.test(rule),
  'G5: global transaction renders complete V2 recovery and dispatch into the Grok Rule');
  assert(JSON.stringify(require('./sync-grok-edition.js').expectedHookFiles()) === '[]',
    'G5: Grok edition emits no compact hook files');
  assert(JSON.stringify(require('./sync-grok-edition.js').expectedRuleFiles()) === '[]',
    'G5: Grok edition emits no second persistent Rule');
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
    && /--forge/.test(helpOut),
    'G6: --help names --write / --check / --refresh-present / --print-tree-root / --forge=');

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
    const label = '.grok-' + forge;
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
    assert(!fs.existsSync(agentDir),
      'G7[' + forge + ']: ' + label + ' has no agents/ directory (Kaola ships no Grok agents)');
    const c = runGeneratorCli(['--forge=' + forge, '--check']);
    assert(c.status === 0,
      'G7[' + forge + ']: --check is green after --write (got ' + c.status + ')');
  }
}

// ---------------------------------------------------------------------------
// G8: install-grok.sh — hermetic cases against the REAL installer with temp
// HOME + GROK_HOME + --target under tmpBase(), never the host ~/.grok.
// ---------------------------------------------------------------------------
{
  assert(fs.existsSync(INSTALLER),
    'G8: installer not present: install-grok.sh is required for the hermetic install contract');
  if (fs.existsSync(INSTALLER)) {
    // Issue #1032: inspect the shipped source so the retired dispatch hook stays in the bounded
    // list and both install/uninstall paths consume that list without touching a real home.
    const installerSource = fs.readFileSync(INSTALLER, 'utf8');
    const retiredHooks = installerSource.match(/\bRETIRED_HOOKS\s*=\s*\(([^)]*)\)/);
    const hasRetiredHookCleanup = body => {
      const loop = String(body).match(/^[ \t]*for[ \t]+retired[ \t]+in[^\n]*RETIRED_HOOKS[^\n]*;[ \t]*do[ \t]*\n([\s\S]*?)^[ \t]*done[ \t]*$/m);
      return !!loop && /\brm\s+-f\b/.test(loop[1]) && /\$retired\b/.test(loop[1]) && /hooks/.test(loop[1]);
    };
    const installStart = installerSource.indexOf('install_support_scripts() {');
    const uninstallStart = installerSource.indexOf('uninstall_edition() {');
    assert(retiredHooks && /\bkaola-workflow-subagent-dispatch-log\.sh\b/.test(retiredHooks[1]),
      'R1: RETIRED_HOOKS contains kaola-workflow-subagent-dispatch-log.sh');
    assert(installStart >= 0 && uninstallStart > installStart
      && hasRetiredHookCleanup(installerSource.slice(installStart, uninstallStart)),
      'R2: install cleanup consumes the bounded RETIRED_HOOKS list for hook removal');
    assert(uninstallStart >= 0 && hasRetiredHookCleanup(installerSource.slice(uninstallStart)),
      'R3: uninstall cleanup consumes the bounded RETIRED_HOOKS list for hook removal');
    const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
    // #1101: the edition deploys no agent; any Markdown under an agents/ dir is user-owned.
    const agentFiles = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : []);
    function runInstaller(extraArgs, opts) {
      opts = opts || {};
      const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'grok-i-home-'));
      const grokHome = opts.grokHome || fs.mkdtempSync(path.join(tmpBase(), 'grok-i-gh-'));
      const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'grok-i-dest-'));
      const args = ['--yes'].concat(opts.skipTarget ? [] : ['--target', dest]).concat(extraArgs || []);
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER].concat(args), {
        env: Object.assign({}, process.env, { HOME: home, GROK_HOME: grokHome }),
        encoding: 'utf8',
      });
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home, grokHome, dest };
    }
    const clean = r => {
      for (const d of [r.home, r.grokHome, r.dest]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    };

    // Project deploy.
    {
      const r = runInstaller([]);
      assert(r.status === 0,
        'G8-project: install-grok.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.grok', 'agents');
      const commandsDir = path.join(r.dest, '.grok', 'commands');
      assert(agentFiles(agentsDir).length === 0,
        'G8-project: deploys no agent under <target>/.grok/agents/ — found '
        + JSON.stringify(agentFiles(agentsDir)));
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.grok/commands/');
      }
      const scriptsDir = path.join(r.grokHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir),
        'G8-project: support scripts land at $GROK_HOME/kaola-workflow/scripts');
      const projectRulePath = path.join(r.dest, '.grok', 'rules', 'kaola-workflow-compact-recovery.md');
      assert(!fs.existsSync(projectRulePath),
        'G8-project: edition install does not duplicate the install-all-owned global Rule');
      assert(!fs.existsSync(path.join(r.grokHome, 'hooks', 'kaola-workflow-hooks.json')),
        'G8-project: project install creates no global compact hook');
      clean(r);
    }

    // --global: commands land under GROK_HOME (the ~/.grok equivalent), un-nested; no agents.
    {
      const r = runInstaller(['--global'], { skipTarget: true });
      assert(r.status === 0,
        'G8-global: install-grok.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(agentFiles(path.join(r.grokHome, 'agents')).length === 0,
        'G8-global: deploys no agent under $GROK_HOME/agents/ — found '
        + JSON.stringify(agentFiles(path.join(r.grokHome, 'agents'))));
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(r.grokHome, 'commands', name + '.md')),
          'G8-global[' + name + ']: command deployed under $GROK_HOME/commands/');
      }
      assert(!fs.existsSync(path.join(r.grokHome, '.grok')),
        'G8-global: creates NO nested .grok/ under GROK_HOME (Grok scans GROK_HOME itself)');
      const globalRulePath = path.join(r.grokHome, 'rules', 'kaola-workflow-compact-recovery.md');
      assert(!fs.existsSync(globalRulePath),
        'G8-global: edition install leaves the global-contract carrier to install-all');
      assert(!fs.existsSync(path.join(r.grokHome, 'hooks', 'kaola-workflow-hooks.json')),
        'G8-global: global install emits no compact hook mapping');
      clean(r);
    }

    // --forge=gitlab renders `.grok-gitlab/` as the generator SOURCE tree, then
    // copies content into the runtime-native dest Grok actually scans:
    // <target>/.grok/commands. Same split as kimi (.kimi-gitlab
    // → .kimi-code/skills) and opencode (.opencode-gitlab → .opencode/).
    {
      const r = runInstaller(['--forge=gitlab']);
      assert(r.status === 0,
        'G8-gitlab: install-grok.sh --forge=gitlab exits 0 (got ' + r.status
        + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.grok', 'agents');
      const commandsDir = path.join(r.dest, '.grok', 'commands');
      assert(agentFiles(agentsDir).length === 0,
        'G8-gitlab: deploys no agent under <target>/.grok/agents/ — found ' + JSON.stringify(agentFiles(agentsDir)));
      const expected = commandNamesFor('gitlab');
      for (const name of expected) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-gitlab[' + name + ']: command deployed under <target>/.grok/commands/');
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
        'G8-unknown: install-grok.sh --forge=svn exits 2 (got ' + r.status + ')');
      const leftover = walkFiles(r.dest, '');
      assert(leftover.length === 0,
        'G8-unknown: unknown forge writes nothing under --target — found ' + leftover.slice(0, 6).join(', '));
      clean(r);
    }

    // --no-scripts skips executable support; neither mode emits a duplicate Rule.
    {
      const withScripts = runInstaller([]);
      const scriptsDir = path.join(withScripts.grokHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).length > 0,
        'G8-noscripts: default install deploys support scripts (the --no-scripts contrast)');
      assert(!fs.existsSync(path.join(withScripts.dest, '.grok', 'rules',
        'kaola-workflow-compact-recovery.md')),
      'G8-noscripts: default edition install emits no duplicate recovery Rule');
      clean(withScripts);

      const r = runInstaller(['--no-scripts']);
      assert(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(canonCommandNames.every(n => fs.existsSync(path.join(r.dest, '.grok', 'commands', n + '.md'))),
        'G8-noscripts: commands still deploy');
      assert(!fs.existsSync(path.join(r.grokHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $GROK_HOME/kaola-workflow/scripts');
      assert(!fs.existsSync(path.join(r.dest, '.grok', 'rules',
        'kaola-workflow-compact-recovery.md')),
      'G8-noscripts: no-scripts edition install also emits no duplicate recovery Rule');
      const hooksDir = path.join(r.dest, '.grok', 'hooks');
      const hookFiles = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
      assert(hookFiles.length === 0,
        'G8-noscripts: skips hooks — found ' + hookFiles.join(', '));
      clean(r);
    }

    // --uninstall removes only kaola-deployed names. Ownership is never inferred from a retired
    // role's name (#1101): a user-authored agents/implementer.md survives install and uninstall.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'grok-i-dest-'));
      const agentsDir = path.join(dest, '.grok', 'agents');
      const userRole = path.join(agentsDir, 'implementer.md');
      const userRoleBody = '---\nname: implementer\ndescription: my own agent\n---\nuser-authored\n';
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(userRole, userRoleBody);
      const r = runInstaller([], { dest });
      assert(r.status === 0, 'G8-uninstall: seed install exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(fs.existsSync(userRole) && fs.readFileSync(userRole, 'utf8') === userRoleBody,
        'G8-install: a user-authored agent named like a retired role survives install byte-for-byte');
      const userFile = path.join(agentsDir, 'notes.md');
      const userBody = 'user-owned, not kaola-deployed\n';
      fs.writeFileSync(userFile, userBody);
      const userJs = path.join(r.grokHome, 'kaola-workflow', 'scripts', 'my-local-helper.js');
      const userJsBody = '// user-authored\n';
      if (fs.existsSync(path.dirname(userJs))) fs.writeFileSync(userJs, userJsBody);
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, GROK_HOME: r.grokHome }),
        encoding: 'utf8',
      });
      assert(ru.status === 0,
        'G8-uninstall: --uninstall exits 0 (got ' + ru.status + ' — ' + firstLine(ru) + ')');
      for (const name of canonCommandNames) {
        assert(!fs.existsSync(path.join(r.dest, '.grok', 'commands', name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed command is removed');
      }
      assert(fs.existsSync(userFile) && fs.readFileSync(userFile, 'utf8') === userBody,
        'G8-uninstall: a user-owned file in the agents dir survives (only kaola-deployed names are removed)');
      assert(fs.existsSync(userRole) && fs.readFileSync(userRole, 'utf8') === userRoleBody,
        'G8-uninstall: a user-authored agent named like a retired role survives uninstall');
      if (fs.existsSync(path.dirname(userJs))) {
        assert(fs.existsSync(userJs) && fs.readFileSync(userJs, 'utf8') === userJsBody,
          'G8-uninstall: a user-authored helper in the scripts dir survives');
      }
      clean(r);
    }
  }
}

// #1055: transformCommandBody's line-splitting loop is a no-op pass-through
// (split(/\r?\n/) then join('\n')) — its only surviving effect is CRLF -> LF
// normalization. Pin that behavior directly: a CRLF command body must render
// byte-identically to the same body with LF endings.
{
  const grokSync = require('./sync-grok-edition.js');
  const crlfSrc = forgeLayout.commandSources(DEFAULT_FORGE).find(s => s.basename === 'workflow-next.md');
  assert(!!crlfSrc, 'CRLF: workflow-next.md is a registered command source');
  if (crlfSrc) {
    const rawBody = fs.readFileSync(crlfSrc.absPath, 'utf8');
    const lfBody = rawBody.replace(/\r\n/g, '\n');
    const crlfBody = lfBody.replace(/\n/g, '\r\n');
    const lfOut = grokSync.transformCommandBody(lfBody, DEFAULT_FORGE, 'workflow-next.md');
    const crlfOut = grokSync.transformCommandBody(crlfBody, DEFAULT_FORGE, 'workflow-next.md');
    assert(crlfOut === lfOut,
      'CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte');
    // The equality check above alone would stay green under a mutant that joins with '\r\n'
    // instead of '\n' — both outputs would still match each other, just both wrong. Pin the
    // normalization itself: neither output may carry a \r.
    assert(!crlfOut.includes('\r'),
      'CRLF: transformCommandBody(CRLF body) output must contain no \\r (normalized to LF)');
    assert(!lfOut.includes('\r'),
      'CRLF: transformCommandBody(LF body) output must contain no \\r (normalized to LF)');
  }
}

if (failed) {
  console.error('\ngrok-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('grok-edition test passed (' + passed + ' assertions).' + driftVerdict);
