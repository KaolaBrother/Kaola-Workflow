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
// way: named agents under `.grok/agents/<role>.md` (spawn_subagent types),
// flat commands under `.grok/commands/<name>.md`, and `.grok/hooks/`
// (generated hooks.json with the compact-resume hook). THREE canonical model
// classes: every subagent keeps model: inherit, while standard/reasoning/heavy
// agents carry the native effort pins medium/high/xhigh respectively.
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

function canonicalAgentClass(name) {
  const { fm } = parseFrontmatter(read('agents/' + name + '.md'));
  const model = String(fm.model || '').trim().toLowerCase();
  const binding = GROK_MODEL_CLASS_TIERS[model];
  return binding
    ? { model, tier: binding.tier, effort: binding.effort }
    : { model, tier: 'unknown', effort: null };
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
// GROK_RUNTIME_NATIVE — the three-tier effort binding as a DECLARED table entry,
// not merely as prose. Deleting the declaration reds this suite.
// ---------------------------------------------------------------------------
const GROK_RUNTIME_NATIVE = Object.freeze({
  tiered_effort_pin:
    'Grok subagents inherit the session model, so generated agents keep model: inherit while canonical standard/reasoning/heavy model classes stamp effort: medium/high/xhigh respectively.',
});

// The canonical model tokens are the existing portable class markers, not a
// second role roster. Derive each expected Grok binding from agents/*.md so a
// role addition or tier move is judged by the canonical frontmatter itself.
const GROK_SYNC_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'sync-grok-edition.js'), 'utf8');
const GROK_ADAPTER_EFFORTS = reviewerGenerator.loadRuntimeAdapters(REPO)
  .runtimes.grok.capabilities.intent_mapping;
const GROK_MODEL_CLASS_TIERS = Object.freeze({
  sonnet: Object.freeze({ tier: 'standard', effort: GROK_ADAPTER_EFFORTS.standard }),
  opus: Object.freeze({ tier: 'reasoning', effort: GROK_ADAPTER_EFFORTS.reasoning }),
  fable: Object.freeze({ tier: 'heavy', effort: GROK_ADAPTER_EFFORTS.heavy }),
});

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

const canonAgents = trackedAgents();
const canonCommandNames = commandNamesFor(DEFAULT_FORGE);
const canonRosters = canonicalRosters(canonAgents);

// ---------------------------------------------------------------------------
// G0 — THE SUBJECT UNDER TEST IS THE GENERATOR'S OUTPUT, derived from TRACKED
// canonical sources. An absent tree must fail loudly rather than let every
// readdir-driven loop iterate over nothing.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(path.join(TREE_ROOT, '.grok', 'agents'))
    && fs.existsSync(path.join(TREE_ROOT, '.grok', 'commands'));
  assert(provisioned,
    'G0: the generated .grok/agents and .grok/commands trees exist after sync --write');
  if (!provisioned) {
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.grok') + ' — nothing below can be tested.');
    process.exit(1);
  }
  assert(canonAgents.length > 0 && canonCommandNames.length > 0,
    'G0-roster: the canonical agents/ inventory and routing-registry command surfaces are both non-empty');
  assert(canonAgents.includes('knowledge-lookup'),
    'G0-roster: knowledge-lookup is in the canonical agents/*.md inventory');
  assert(canonRosters.standard.length > 0,
    'G0-roster: canonical sonnet model class derives a non-empty standard roster');
  assert(canonRosters.reasoning.length > 0,
    'G0-roster: canonical opus model class derives a non-empty reasoning roster');
  assert(canonRosters.heavy.includes('planner') && canonRosters.heavy.includes('code-architect'),
    'G0-roster: planner-class (planner, code-architect) is the heavy (fable) roster — heavy='
    + JSON.stringify(canonRosters.heavy));
  assert(canonRosters.unknown.length === 0,
    'G0-roster: every canonical agent model belongs to the known sonnet/opus/fable classes — unknown='
    + JSON.stringify(canonRosters.unknown));
  assert(GROK_ADAPTER_EFFORTS.heavy === 'xhigh' || GROK_ADAPTER_EFFORTS.heavy === 'high',
    'G0-fable: runtime adapter heavy effort must be xhigh or high — got '
    + JSON.stringify(GROK_ADAPTER_EFFORTS.heavy));
  assert(!/const\s+GROK_MODEL_EFFORTS\b|function\s+effortForModelToken\b/.test(GROK_SYNC_SRC),
    'G0-adapter: sync-grok-edition carries no executable hardcoded effort table; '
    + 'runtime-capabilities.json is the sole runtime identifier authority');
  for (const name of canonAgents) {
    if (name === 'planner' || name === 'code-architect') continue;
    assert(canonicalAgentClass(name).model !== 'fable',
      'G0-roster: ' + name + ' must not change tier to fable — got ' + canonicalAgentClass(name).model);
  }
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
      'G0-ac6: no grok heavy-variant reviewer agent ' + name + ' in the canonical roster (escalation is claude+codex only)');
    assert(!exists(agentRel(name)),
      'G0-ac6: generated grok tree must not ship ' + name);
  }
}

// ---------------------------------------------------------------------------
// G1: agents — exact set = canonical agents/*.md. knowledge-lookup MUST be
// present. Frontmatter: name, description, model: inherit, and effort derived
// from the canonical model class (standard/sonnet → medium, reasoning/opus →
// high, heavy/fable → xhigh). `reasoning_effort:` is not a Grok agent field. Frontmatter `tools:`
// is the enforced native allowlist derived from the role capability contract; prose-only
// restrictions do not satisfy this contract. Body examples may still name MCP tool ids.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.grok', 'agents');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonAgents),
    'G1: .grok/agents set == canonical agents/*.md — canonical=' + JSON.stringify(canonAgents)
    + ' generated=' + JSON.stringify(gen));
  assert(gen.includes('knowledge-lookup'),
    'G1: knowledge-lookup MUST be present under .grok/agents/');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    assert(exists(rel), 'G1[' + name + ']: generated agent exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm, raw } = parseFrontmatter(content);
    assert(fm.name === name, 'G1[' + name + ']: frontmatter name is the role — got ' + JSON.stringify(fm.name));
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G1[' + name + ']: frontmatter has a non-empty description');
    assert(fm.model === 'inherit',
      'G1[' + name + ']: frontmatter model is inherit — got ' + JSON.stringify(fm.model));
    assert(fm.promptMode === 'full',
      'G1[' + name + ']: native camelCase promptMode is full — got ' + JSON.stringify(fm.promptMode));
    const expectedPermissionMode = behaviorContracts[name].capability_requirements.includes('scoped_write')
      ? 'default' : 'plan';
    assert(fm.permissionMode === expectedPermissionMode,
      'G1[' + name + ']: native camelCase permissionMode follows write capability — expected '
      + JSON.stringify(expectedPermissionMode) + ' got ' + JSON.stringify(fm.permissionMode));
    assert(fm.agentsMd === 'true',
      'G1[' + name + ']: native camelCase agentsMd enables project instructions — got '
      + JSON.stringify(fm.agentsMd));
    assert(!/^(?:prompt_mode|permission_mode|agents_md)\s*:/m.test(raw),
      'G1[' + name + ']: frontmatter contains no ignored snake_case spellings for Grok native fields');
    const canonical = canonicalAgentClass(name);
    assert(canonical.tier !== 'unknown',
      'G1[' + name + ']: canonical model class is known — got ' + JSON.stringify(canonical.model));
    const expectedEffort = canonical.effort;
    assert(fm.effort === expectedEffort,
      'G1[' + name + ']: effort is ' + JSON.stringify(expectedEffort) + ' for canonical '
      + canonical.tier + ' tier — got ' + JSON.stringify(fm.effort));
    assert((raw.match(/^\s*effort\s*:/gm) || []).length === 1,
      'G1[' + name + ']: carries exactly one effort: field');
    assert(!/^\s*reasoning_effort\s*:/m.test(raw),
      'G1[' + name + ']: does not use reasoning_effort: (Grok native field is effort:)');
    assert(!/\bmcp__/.test(raw),
      'G1[' + name + ']: frontmatter carries no Claude MCP tool id (mcp__) — a tools: list of those '
      + 'ids drops the agent on Grok inspect; body examples may still name them');
    let tools = null;
    try { tools = JSON.parse(fm.tools); } catch (_) { tools = null; }
    const expectedTools = expectedNativeTools(name);
    assert((raw.match(/^tools\s*:/gm) || []).length === 1 && Array.isArray(tools),
      'G1[' + name + ']: frontmatter carries exactly one executable tools allowlist');
    assert(Array.isArray(tools) && JSON.stringify(tools) === JSON.stringify(expectedTools),
      'G1[' + name + ']: tools allowlist derives from behavior capabilities — expected '
      + JSON.stringify(expectedTools) + ' got ' + JSON.stringify(tools));
    if (!behaviorContracts[name].capability_requirements.includes('command_execution')) {
      assert(Array.isArray(tools) && !tools.includes('Bash'),
        'G1[' + name + ']: a no-shell role lacks Bash in its enforced tools allowlist');
    }
  }
}

// ---------------------------------------------------------------------------
// G2: commands — exact set = routing-registry commandSources() for the forge,
// not a hand list. No line-start Agent( cards (rewrite target is spawn_subagent().
// No CLAUDE_PLUGIN_ROOT, no ~/.claude/kaola-workflow. --runtime grok present
// (not --runtime claude). No model="{...}" placeholders, no per-call model="
// overrides, no vendor slugs.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.grok', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .grok/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const CANON_CARD = /^Agent\(/m;
  let canonCards = 0;
  let grokCards = 0;
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
    assert(!CANON_CARD.test(content),
      'G2[' + name + ']: no line-start Agent( dispatch card (rewrite target is spawn_subagent()');
    const canonHits = [...canon.matchAll(/^Agent\(\n\s+subagent_type="([^"]+)"/gm)].map(m => m[1]);
    const grokHits = [...content.matchAll(/^spawn_subagent\(\n\s+subagent_type="([^"]+)"/gm)].map(m => m[1]);
    canonCards += canonHits.length;
    grokCards += grokHits.length;
    assert(grokHits.length === canonHits.length,
      'G2[' + name + ']: spawn_subagent( card count matches canonical Agent( count ('
      + canonHits.length + ') — got ' + grokHits.length);
    const n = Math.min(canonHits.length, grokHits.length);
    for (let i = 0; i < n; i++) {
      assert(grokHits[i] === canonHits[i],
        'G2[' + name + '#' + i + ']: spawn_subagent keeps the canonical role "' + canonHits[i]
        + '" as a named type (got "' + grokHits[i] + '") — Grok hosts named custom agents');
    }
  }
  assert(canonCards > 0,
    'G2: canonical command surfaces carry at least one line-start Agent( card (rewrite bite)');
  assert(grokCards === canonCards,
    'G2: generated spawn_subagent( count equals canonical Agent( count');
}

{
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
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
      'G2-leak: ' + rel + ': no per-call model=" override (inherit the session model)');
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
// G2-declaration: GROK_RUNTIME_NATIVE.tiered_effort_pin exists, names the two
// canonical effort pins, and the generated tree matches it. The separate
// model: inherit assertion below must remain even if this declaration changes.
// ---------------------------------------------------------------------------
{
  const KEY = 'tiered_effort_pin';
  const reason = GROK_RUNTIME_NATIVE[KEY];
  assert(typeof reason === 'string' && reason.trim().length >= 20,
    'G2-declaration: GROK_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason');
  assert(/standard.*reasoning/i.test(reason)
    && /medium/i.test(reason) && /high/i.test(reason) && /heavy/i.test(reason),
    'G2-declaration: the "' + KEY + '" reason must state standard/reasoning/heavy '
    + 'medium/high/xhigh effort pins');
  for (const name of canonAgents) {
    const rel = agentRel(name);
    if (!exists(rel)) continue;
    const { fm, raw } = parseFrontmatter(read(rel));
    const canonical = canonicalAgentClass(name);
    assert(/^\s*model\s*:\s*inherit\s*$/m.test(raw),
      'G2-declaration: ' + rel + ' independently carries model: inherit (the model contract is '
      + 'separate from ' + KEY + ')');
    assert(fm.effort === canonical.effort,
      'G2-declaration: ' + rel + ' carries effort: ' + canonical.effort
      + ' for canonical ' + canonical.tier + ' tier');
  }
  for (const rel of generatedTreeFiles('.grok')) {
    const content = read(rel);
    assert(!/\bmodel="/.test(content),
      'G2-declaration: ' + rel + ' carries a per-call model=" override, contradicting '
      + KEY);
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
    'G3: sync-grok-edition --check exits 0 against the tree --write just produced'
    + (ok.status !== 0 ? ' — ' + String(ok.stderr || ok.stdout).split('\n')[0] : ''));
  const probe = path.join(TREE_ROOT, '.grok', 'agents', 'implementer.md');
  assert(fs.existsSync(probe), 'G3: implementer.md exists to plant drift against');
  const orig = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : '';
  try {
    fs.appendFileSync(probe, '\n<!-- grok-edition drift probe -->\n');
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
  const grokText = read(agentRel(role));
  let grok = null;
  try { grok = reviewerGenerator.behaviorIdentityFromCore(grokText); } catch (e) {
    assert(false, 'G4-reviewer[' + role + ']: the generated agent still carries an extractable behavior core — ' + e.message);
    grok = { role: null, behavior_contract_version: null, behavior_contract_hash: null, core: null };
  }
  assert(grok.role === canonical.role
    && grok.behavior_contract_version === canonical.behavior_contract_version
    && grok.behavior_contract_hash === canonical.behavior_contract_hash,
    'G4-reviewer[' + role + ']: grok agent retains normalized reviewer behavior identity');
  assert(grok.core === canonical.core,
    'G4-reviewer[' + role + ']: grok render preserves reviewer behavior-core bytes');
  const grokHash = (grokText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(grokHash && /^[0-9a-f]{64}$/.test(grokHash),
    'G4-reviewer[' + role + ']: grok agent carries a resolved_profile_hash');
  assert((grokText.match(/^resolved_profile_hash\s*:\s*[0-9a-f]{64}\s*$/gm) || []).length === 1,
    'G4-reviewer[' + role + ']: grok agent carries EXACTLY ONE resolved_profile_hash line');
  let grokHashVerifies = true;
  try { reviewerGenerator.verifyResolvedProfileHash(grokText); } catch (_) { grokHashVerifies = false; }
  assert(grokHashVerifies,
    'G4-reviewer[' + role + ']: resolved_profile_hash verifies over the grok bytes (zeroed-self sha256)');
  const clHash = (read('agents/' + role + '.md').match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(grokHash !== clHash,
    'G4-reviewer[' + role + ']: grok hash is re-stamped over grok bytes (not the reused Claude render hash)');
  assert(new RegExp('^behavior_contract_version:\\s*' + canonical.behavior_contract_version + '\\s*$', 'm').test(grokText),
    'G4-reviewer[' + role + ']: grok agent preserves the canonical behavior_contract_version line');
  assert(new RegExp('^behavior_contract_hash:\\s*' + canonical.behavior_contract_hash + '\\s*$', 'm').test(grokText),
    'G4-reviewer[' + role + ']: grok agent preserves the canonical behavior_contract_hash line');
}

// ---------------------------------------------------------------------------
// G5: hooks — generated hooks.json (or equivalent) registers the SessionStart
// compact hook. The retired dispatch-log hook is deliberately absent.
// ---------------------------------------------------------------------------
{
  const hooksJsonRel = '.grok/hooks/hooks.json';
  assert(exists(hooksJsonRel), 'G5: .grok/hooks/hooks.json exists');
  let parsed = null;
  try { parsed = JSON.parse(read(hooksJsonRel)); } catch (_) { parsed = null; }
  assert(parsed && parsed.hooks && typeof parsed.hooks === 'object',
    'G5: hooks.json parses with a hooks object');
  const events = parsed && parsed.hooks ? Object.keys(parsed.hooks).sort() : [];
  assert(events.includes('SessionStart'),
    'G5: hooks.json registers SessionStart — got ' + JSON.stringify(events));
  const session = parsed && parsed.hooks ? parsed.hooks.SessionStart : [];
  const sessionBlob = JSON.stringify(session || []);
  assert(/compact/i.test(sessionBlob),
    'G5: SessionStart registers the compact matcher');
  assert(!/CLAUDE_PLUGIN_ROOT/.test(read(hooksJsonRel)),
    'G5: hooks.json carries no CLAUDE_PLUGIN_ROOT');

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
    const agents = fs.existsSync(agentDir)
      ? fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assert(JSON.stringify(agents) === JSON.stringify(canonAgents),
      'G7[' + forge + ']: agent set is the canonical roster, including knowledge-lookup');
    for (const name of canonAgents) {
      const rel = agentRel(name, forge);
      const content = exists(rel) ? read(rel) : '';
      const { fm } = parseFrontmatter(content);
      const canonical = canonicalAgentClass(name);
      assert(fm.model === 'inherit',
        'G7[' + forge + '][' + name + ']: generated model remains inherit');
      assert(fm.effort === canonical.effort,
        'G7[' + forge + '][' + name + ']: generated effort follows canonical '
        + canonical.tier + ' tier — expected ' + canonical.effort + ' got ' + JSON.stringify(fm.effort));
    }
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
      assert(fs.existsSync(path.join(agentsDir, 'knowledge-lookup.md')),
        'G8-project: deploys knowledge-lookup.md under <target>/.grok/agents/');
      for (const name of canonAgents) {
        assert(fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-project[' + name + ']: agent deployed under <target>/.grok/agents/');
      }
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.grok/commands/');
      }
      const scriptsDir = path.join(r.grokHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir),
        'G8-project: support scripts land at $GROK_HOME/kaola-workflow/scripts');
      assert(fs.existsSync(path.join(r.dest, '.grok', 'hooks')),
        'G8-project: hooks land under <target>/.grok/hooks/');
      clean(r);
    }

    // --global: agents/commands land under GROK_HOME (the ~/.grok equivalent), un-nested.
    {
      const r = runInstaller(['--global'], { skipTarget: true });
      assert(r.status === 0,
        'G8-global: install-grok.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(fs.existsSync(path.join(r.grokHome, 'agents', 'knowledge-lookup.md')),
        'G8-global: deploys knowledge-lookup under $GROK_HOME/agents/ (un-nested)');
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(r.grokHome, 'commands', name + '.md')),
          'G8-global[' + name + ']: command deployed under $GROK_HOME/commands/');
      }
      assert(!fs.existsSync(path.join(r.grokHome, '.grok')),
        'G8-global: creates NO nested .grok/ under GROK_HOME (Grok scans GROK_HOME itself)');
      clean(r);
    }

    // --forge=gitlab renders `.grok-gitlab/` as the generator SOURCE tree, then
    // copies content into the runtime-native dest Grok actually scans:
    // <target>/.grok/{agents,commands,hooks}. Same split as kimi (.kimi-gitlab
    // → .kimi-code/skills) and opencode (.opencode-gitlab → .opencode/).
    {
      const r = runInstaller(['--forge=gitlab']);
      assert(r.status === 0,
        'G8-gitlab: install-grok.sh --forge=gitlab exits 0 (got ' + r.status
        + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.grok', 'agents');
      const commandsDir = path.join(r.dest, '.grok', 'commands');
      assert(fs.existsSync(path.join(agentsDir, 'knowledge-lookup.md')),
        'G8-gitlab: deploys knowledge-lookup under <target>/.grok/agents/ (Grok does not scan .grok-gitlab/)');
      for (const name of canonAgents) {
        assert(fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-gitlab[' + name + ']: agent deployed under <target>/.grok/agents/');
      }
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

    // --no-scripts skips scripts/hooks; agents/commands still deploy.
    {
      const withScripts = runInstaller([]);
      const scriptsDir = path.join(withScripts.grokHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).length > 0,
        'G8-noscripts: default install deploys support scripts (the --no-scripts contrast)');
      assert(fs.existsSync(path.join(withScripts.dest, '.grok', 'hooks')),
        'G8-noscripts: default install deploys hooks (the --no-scripts contrast)');
      clean(withScripts);

      const r = runInstaller(['--no-scripts']);
      assert(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(fs.existsSync(path.join(r.dest, '.grok', 'agents', 'knowledge-lookup.md')),
        'G8-noscripts: agents still deploy');
      assert(!fs.existsSync(path.join(r.grokHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $GROK_HOME/kaola-workflow/scripts');
      const hooksDir = path.join(r.dest, '.grok', 'hooks');
      const hookFiles = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
      assert(hookFiles.length === 0,
        'G8-noscripts: skips hooks — found ' + hookFiles.join(', '));
      clean(r);
    }

    // --uninstall removes only kaola-deployed names.
    {
      const r = runInstaller([]);
      assert(r.status === 0, 'G8-uninstall: seed install exits 0');
      const agentsDir = path.join(r.dest, '.grok', 'agents');
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
      for (const name of canonAgents) {
        assert(!fs.existsSync(path.join(agentsDir, name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed agent is removed');
      }
      for (const name of canonCommandNames) {
        assert(!fs.existsSync(path.join(r.dest, '.grok', 'commands', name + '.md')),
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

if (failed) {
  console.error('\ngrok-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('grok-edition test passed (' + passed + ' assertions).' + driftVerdict);
