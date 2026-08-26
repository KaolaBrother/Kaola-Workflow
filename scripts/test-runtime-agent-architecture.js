#!/usr/bin/env node
'use strict';

// Issue #1033 — acceptance for the AGENTS-first, runtime-adapted architecture.
//
// This suite owns outcomes, not a source directory or serialization format. It discovers the
// profile generator by capability, asks that generator for its behavior authority, adapters, and
// rendered profiles, then mutates those inputs in memory. Generated files are the subject; mocks
// replace neither the generator nor its source data.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ROLE_NAMES = Object.freeze([
  'adversarial-verifier',
  'build-error-resolver',
  'code-architect',
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'metric-optimizer',
  'planner',
  'security-reviewer',
  'synthesizer',
  'tdd-guide',
]);
const RUNTIME_NAMES = Object.freeze([
  'claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode',
]);
const SORTED_RUNTIME_NAMES = Object.freeze(sorted(RUNTIME_NAMES));
const COVERAGE_FIELDS = Object.freeze({
  purpose: ['purpose', 'success_outcome'],
  inputs: ['inputs', 'required_inputs'],
  authority_custody: ['authority_custody', 'authority_and_custody', 'read_write_custody'],
  writes: ['writes', 'write_boundary', 'landing_writes'],
  deliverable: ['deliverable', 'landing_contract', 'required_deliverable'],
  verification: ['verification', 'verification_responsibility'],
  stop_conditions: ['stop_conditions', 'failure_conditions', 'stop_and_failure_conditions'],
});

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; return; }
  failed++;
  console.error('FAIL: ' + message);
}

function read(relativePath) {
  try { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); } catch (_) { return null; }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function meaningful(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

function sorted(values) {
  return [...values].sort();
}

function profileKey(profile) {
  return String(profile.path || [profile.runtime, profile.role, profile.variant || 'base'].join(':'));
}

function profileMap(profiles) {
  return new Map(profiles.map(profile => [profileKey(profile), String(profile.content || '')]));
}

function changedProfileKeys(before, after) {
  const beforeMap = profileMap(before);
  const afterMap = profileMap(after);
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  return sorted([...keys].filter(key => beforeMap.get(key) !== afterMap.get(key)));
}

function parseFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fields: {}, raw: '' };
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const row = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (row) fields[row[1]] = row[2].trim();
  }
  return { fields, raw: match[1] };
}

function expectedNativeTools(contract, runtime) {
  const required = new Set(contract.capability_requirements || []);
  const tools = ['Read', 'Grep', 'Glob'];
  if (required.has('scoped_write')) tools.splice(1, 0, 'Write', 'Edit');
  if (required.has('command_execution')) tools.push('Bash');
  if (required.has('external_research')) {
    tools.push('WebSearch', runtime === 'kimi' ? 'FetchURL' : 'WebFetch');
  }
  return tools;
}

function replaceExactScalar(value, needle, replacement, stats) {
  if (Array.isArray(value)) {
    return value.map(item => replaceExactScalar(item, needle, replacement, stats));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.includes(needle)) {
      stats.replacements++;
      return value.split(needle).join(replacement);
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    replaceExactScalar(item, needle, replacement, stats),
  ]));
}

function runtimeProfilesFor(sourceProfiles, runtime) {
  return sourceProfiles.filter(profile => profile.runtime === runtime);
}

function runtimeForAdapter(name, adapter) {
  const declared = adapter && typeof adapter.runtime === 'string' ? adapter.runtime.toLowerCase() : '';
  if (RUNTIME_NAMES.includes(declared)) return declared;
  const lower = String(name).toLowerCase();
  return RUNTIME_NAMES.find(runtime => lower === runtime || lower.startsWith(runtime + '-')) || null;
}

function adapterEntries(source) {
  const root = source && source.runtimes && typeof source.runtimes === 'object'
    ? source.runtimes
    : source && source.adapters && typeof source.adapters === 'object'
      ? source.adapters
      : null;
  if (!root) return { root: null, entries: [] };
  return {
    root,
    entries: Object.entries(root).map(([name, adapter]) => ({
      name,
      adapter,
      runtime: runtimeForAdapter(name, adapter),
    })),
  };
}

function capabilityObject(adapter) {
  if (!adapter || typeof adapter !== 'object') return null;
  if (adapter.capabilities && typeof adapter.capabilities === 'object'
      && !Array.isArray(adapter.capabilities)) return adapter.capabilities;
  const metadata = new Set([
    'runtime', 'name', 'id', 'evidence', 'evidence_url', 'evidence_source',
    'required_capabilities', 'requiredCapabilities',
  ]);
  return Object.fromEntries(Object.entries(adapter).filter(([key]) => !metadata.has(key)));
}

function setCapability(source, entry, key, value) {
  const { root } = adapterEntries(source);
  const target = root[entry.name];
  if (target.capabilities && typeof target.capabilities === 'object') {
    target.capabilities[key] = value;
  } else {
    target[key] = value;
  }
}

function deleteCapability(source, entry, key) {
  const { root } = adapterEntries(source);
  const target = root[entry.name];
  if (target.capabilities && typeof target.capabilities === 'object') {
    delete target.capabilities[key];
  } else {
    delete target[key];
  }
}

// A1 — root project instruction authority is inverted, not duplicated.
const agentsRoot = read('AGENTS.md') || '';
const claudeRoot = read('CLAUDE.md') || '';
for (const [label, pattern] of [
  ['project overview', /##\s+Project Overview/i],
  ['Mission List contract', /Mission List/i],
  ['durable-state contract', /Durable State Contract/i],
  ['First Principles', /##\s+First Principles/i],
  ['Non-Negotiable Rules', /##\s+Non-Negotiable Rules/i],
  ['validation expectations', /##\s+(?:Running Tests|Validation)/i],
]) {
  assert(pattern.test(agentsRoot), `A1: root AGENTS.md carries the runtime-neutral ${label}`);
}
assert(!/READ CLAUDE\.md|single canonical source[^\n]*CLAUDE\.md|only to direct you there/i.test(agentsRoot),
  'A1: root AGENTS.md is the project contract, not an AGENTS→CLAUDE redirect');
const universalVendor = agentsRoot.match(/\b(?:Claude|Codex|OpenCode|Kimi|Grok|Cursor|ZCode)\b/i);
assert(!universalVendor,
  'A1: universal AGENTS.md contains no runtime brand vocabulary'
  + (universalVendor ? ' — found ' + universalVendor[0] : ''));

assert(/AGENTS\.md/.test(claudeRoot) && /\bClaude\b/i.test(claudeRoot),
  'A2: root CLAUDE.md is a Claude overlay that explicitly bridges to AGENTS.md');
const duplicatedUniversalSections = [
  'Project Overview', 'Mission List', 'Durable State Contract', 'First Principles',
  'Non-Negotiable Rules',
].filter(heading => new RegExp('^##\\s+' + heading.replace(/ /g, '\\s+'), 'mi').test(claudeRoot));
assert(duplicatedUniversalSections.length === 0,
  'A2: CLAUDE.md duplicates no universal managed section — duplicated '
  + JSON.stringify(duplicatedUniversalSections));
assert(Buffer.byteLength(claudeRoot) < Buffer.byteLength(agentsRoot),
  'A2: CLAUDE.md is a thin overlay, smaller than the universal AGENTS.md contract');

// A3 — workflow-init states all ownership cases and uses runtime-neutral universal markers.
const initSource = read('templates/routing/init.skeleton.md') || '';
for (const [label, pattern] of [
  ['user ownership', /user-authored/i],
  ['byte preservation', /byte-for-byte/i],
  ['idempotent reruns', /idempotent/i],
  ['conflict escalation', /ask in conversation/i],
  ['version-fenced active work', /older installed version|claimed under[^\n]*version/i],
]) {
  assert(pattern.test(initSource), `A3: workflow-init carries the ${label} migration outcome`);
}
const markerRows = [...initSource.matchAll(/<!--\s*(KW-[A-Z0-9-]+)-(START|END)\s*-->/g)]
  .map(match => ({ name: match[1], edge: match[2] }));
const neutralMarkerNames = [...new Set(markerRows.map(row => row.name)
  .filter(name => !name.includes('CLAUDE')))];
const pairedNeutralMarker = neutralMarkerNames.find(name =>
  markerRows.some(row => row.name === name && row.edge === 'START')
  && markerRows.some(row => row.name === name && row.edge === 'END'));
assert(!!pairedNeutralMarker,
  'A3: workflow-init declares a paired runtime-neutral managed region for universal project bytes');
assert(!/KW-CLAUDE-(?:TEMPLATE|MANAGED)/.test(initSource),
  'A3: universal workflow-init regions no longer use retired KW-CLAUDE naming');

// The shipped workflow-init text is necessary but cannot prove that owner bytes survive a real
// migration. Discover the production migration seam by capability, then exercise its public CLI on
// temporary projects. No module path is part of the acceptance contract.
const migrationCandidates = fs.readdirSync(path.join(ROOT, 'scripts'))
  .filter(name => name.endsWith('.js'))
  .filter(name => (read('scripts/' + name) || '').includes('classifyProjectInstructions'))
  .sort();
let migrationModule = null;
let migrationPath = null;
for (const name of migrationCandidates) {
  try {
    const candidate = require(path.join(ROOT, 'scripts', name));
    if (candidate && typeof candidate.classifyProjectInstructions === 'function') {
      migrationModule = candidate;
      migrationPath = path.join(ROOT, 'scripts', name);
      break;
    }
  } catch (_) { /* another module owns the matching prose; keep discovering */ }
}
assert(!!migrationModule,
  'A3: workflow-init exposes a production ownership-classification seam for byte-level fixtures');

if (migrationModule) {
  const legacyRedirect = [
    '# AGENTS.md',
    '',
    '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**',
    '>',
    '> `CLAUDE.md` in this repository root is the **single canonical source** for all',
    '> non-negotiable rules, project conventions, workflow constraints, and agent',
    '> behavior. AGENTS.md exists **only** to direct you there.',
    '>',
    '> **Required at session start, before any tool call, edit, or response:**',
    '>',
    '> 1. Read `CLAUDE.md` in full.',
    '> 2. Treat its `## Non-Negotiable Rules` section as binding for every action you take in this repo.',
    '> 3. If `CLAUDE.md` is missing, **stop and ask the user** — do not proceed on assumptions.',
    '>',
    '> Do not skip this step because the task looks small. Do not rely on prior',
    '> session memory. Re-read on every new session.',
    '',
    '---',
    '',
    '*All other guidance — the workflow, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*',
    '',
  ].join('\n');

  function writeInstructionFixture(root, agentsBytes, claudeBytes) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), agentsBytes);
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeBytes);
  }

  function runMigration(mode, projectRoot) {
    // spawn-class: environment
    const result = spawnSync(process.execPath,
      [migrationPath, mode, '--project-root', projectRoot, '--json'], { encoding: 'utf8' });
    let envelope = null;
    try { envelope = JSON.parse(String(result.stdout || '').trim()); } catch (_) { /* asserted below */ }
    return { ...result, envelope };
  }

  const ownerAgents = '\nOWNER_AGENTS_SENTINEL=preserve-this-byte-for-byte\n';
  const ownerClaude = '# Claude owner overlay\n\nOWNER_CLAUDE_SENTINEL=preserve-this-byte-for-byte\n';
  const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-mixed-'));
  try {
    const agentsBefore = legacyRedirect + ownerAgents;
    writeInstructionFixture(mixedRoot, agentsBefore, ownerClaude);

    const planned = runMigration('plan', mixedRoot);
    assert(planned.status === 0 && planned.envelope && planned.envelope.status === 'planned',
      'A3[mixed]: plan classifies a known managed redirect without writing');
    assert(planned.envelope && planned.envelope.schema_version === 1
      && planned.envelope.mode === 'plan' && Array.isArray(planned.envelope.writes)
      && planned.envelope.writes.length === 0,
    'A3[mixed]: plan returns the stable non-writing JSON envelope');
    assert(fs.readFileSync(path.join(mixedRoot, 'AGENTS.md'), 'utf8') === agentsBefore
      && fs.readFileSync(path.join(mixedRoot, 'CLAUDE.md'), 'utf8') === ownerClaude,
    'A3[mixed]: plan preserves both files byte-for-byte');

    const applied = runMigration('apply', mixedRoot);
    assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied'
      && applied.envelope.changed === true,
    'A3[mixed]: apply migrates the recognized managed bytes');
    const agentsAfter = fs.readFileSync(path.join(mixedRoot, 'AGENTS.md'), 'utf8');
    const claudeAfter = fs.readFileSync(path.join(mixedRoot, 'CLAUDE.md'), 'utf8');
    assert(agentsAfter.includes(ownerAgents) && claudeAfter.includes(ownerClaude),
      'A3[mixed]: apply preserves surrounding AGENTS and CLAUDE owner bytes exactly');
    const afterMarkers = [...agentsAfter.matchAll(/<!--\s*(KW-[A-Z0-9-]+)-(START|END)\s*-->/g)]
      .map(match => ({ name: match[1], edge: match[2] }));
    const neutralNames = [...new Set(afterMarkers.map(row => row.name)
      .filter(name => !name.includes('CLAUDE')))];
    assert(neutralNames.some(name => afterMarkers.some(row => row.name === name && row.edge === 'START')
      && afterMarkers.some(row => row.name === name && row.edge === 'END')),
    'A3[mixed]: applied universal bytes use paired runtime-neutral managed markers');
    assert(!/READ CLAUDE\.md|only to direct you there/i.test(agentsAfter)
      && /AGENTS\.md/.test(claudeAfter),
    'A3[mixed]: apply reverses the redirect and leaves a Claude→AGENTS bridge');
    assert(applied.envelope && applied.envelope.files
      && applied.envelope.files.agents.outside_bytes_preserved === true
      && applied.envelope.files.claude.outside_bytes_preserved === true,
    'A3[mixed]: apply attests owner-byte preservation for both instruction files');

    const firstBytes = { agents: agentsAfter, claude: claudeAfter };
    const rerun = runMigration('apply', mixedRoot);
    assert(rerun.status === 0 && rerun.envelope && rerun.envelope.status === 'converged'
      && rerun.envelope.changed === false && rerun.envelope.writes.length === 0,
    'A3[mixed]: a second apply is a byte-idempotent converged no-op');
    assert(fs.readFileSync(path.join(mixedRoot, 'AGENTS.md'), 'utf8') === firstBytes.agents
      && fs.readFileSync(path.join(mixedRoot, 'CLAUDE.md'), 'utf8') === firstBytes.claude,
    'A3[mixed]: converged rerun leaves both files byte-identical');
    const checked = runMigration('check', mixedRoot);
    assert(checked.status === 0 && checked.envelope && checked.envelope.status === 'converged'
      && checked.envelope.writes.length === 0,
    'A3[mixed]: check reports convergence and never writes');
  } finally {
    try { fs.rmSync(mixedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  const conflictRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-conflict-'));
  try {
    const conflictAgents = '# Owner AGENTS\n\nOWNER_AUTHORITY_SENTINEL\n';
    const conflictClaude = '# Owner CLAUDE\n\nOWNER_RUNTIME_SENTINEL\n';
    writeInstructionFixture(conflictRoot, conflictAgents, conflictClaude);
    const conflict = runMigration('apply', conflictRoot);
    assert(conflict.status === 2 && conflict.envelope
      && conflict.envelope.status === 'decision_required'
      && conflict.envelope.changed === false && conflict.envelope.writes.length === 0,
    'A3[conflict]: unknown owner authority requests a decision and writes nothing');
    assert(fs.readFileSync(path.join(conflictRoot, 'AGENTS.md'), 'utf8') === conflictAgents
      && fs.readFileSync(path.join(conflictRoot, 'CLAUDE.md'), 'utf8') === conflictClaude,
    'A3[conflict]: decision-required leaves all owner bytes untouched');
  } finally {
    try { fs.rmSync(conflictRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  const activeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-active-'));
  try {
    writeInstructionFixture(activeRoot, legacyRedirect, ownerClaude);
    const stateDir = path.join(activeRoot, 'kaola-workflow', 'active-run');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'workflow-state.md'),
      '# Kaola-Workflow State\n\n## Project\nname: active-run\nstatus: active\n');
    const active = runMigration('apply', activeRoot);
    assert(active.status === 0 && active.envelope
      && active.envelope.status === 'active_run_preserved'
      && active.envelope.changed === false && active.envelope.writes.length === 0,
    'A3[active]: an older active run is version-fenced from instruction migration');
    assert(fs.readFileSync(path.join(activeRoot, 'AGENTS.md'), 'utf8') === legacyRedirect
      && fs.readFileSync(path.join(activeRoot, 'CLAUDE.md'), 'utf8') === ownerClaude,
    'A3[active]: active-run preservation leaves both files byte-identical');
  } finally {
    try { fs.rmSync(activeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

for (const relativePath of ['templates/routing/next.skeleton.md', 'templates/routing/finalize.skeleton.md']) {
  const text = read(relativePath) || '';
  assert(/AGENTS\.md/.test(text), `A4: ${relativePath} reads universal project rules from AGENTS.md`);
  assert(!/(?:project-root|workflow-init)\s+`?CLAUDE\.md`?/i.test(text),
    `A4: ${relativePath} does not route universal rules through CLAUDE.md`);
}

// A5 — discover the profile generator by behavior, not filename.
const generatorCandidates = fs.readdirSync(path.join(ROOT, 'scripts'))
  .filter(name => /^generate-.*profiles\.js$/.test(name))
  .sort();
let generator = null;
let generatorPath = null;
for (const name of generatorCandidates) {
  const candidate = require(path.join(ROOT, 'scripts', name));
  if (candidate && typeof candidate.renderProfiles === 'function'
      && typeof candidate.loadBehaviorContracts === 'function'
      && typeof candidate.loadRuntimeAdapters === 'function') {
    generator = candidate;
    generatorPath = 'scripts/' + name;
    break;
  }
}
assert(!!generator,
  'A5: one profile generator exposes behavior authority, runtime adapters, and deterministic rendering');

let behavior = null;
let adapters = null;
let profiles = [];
if (generator) {
  try { behavior = generator.loadBehaviorContracts(ROOT); }
  catch (error) { assert(false, 'A5: behavior authority loads — ' + error.message); }
  try { adapters = generator.loadRuntimeAdapters(ROOT); }
  catch (error) { assert(false, 'A6: runtime adapter map loads — ' + error.message); }
  if (behavior && adapters) {
    try { profiles = generator.renderProfiles(behavior, adapters); }
    catch (error) { assert(false, 'A6: native profiles render — ' + error.message); }
  }
}

const roleContracts = behavior && behavior.roles && typeof behavior.roles === 'object'
  ? behavior.roles : {};
assert(JSON.stringify(sorted(Object.keys(roleContracts))) === JSON.stringify(ROLE_NAMES),
  'A5: exactly the 14 supported roles have one behavior authority — got '
  + JSON.stringify(sorted(Object.keys(roleContracts))));
if (generator && Array.isArray(generator.ROLES)) {
  assert(JSON.stringify(sorted(generator.ROLES)) === JSON.stringify(ROLE_NAMES),
    'A5: generator role coverage equals the complete 14-role authority');
}

for (const role of ROLE_NAMES) {
  const contract = roleContracts[role];
  assert(!!contract && typeof contract === 'object', `A5[${role}]: behavior authority exists`);
  if (!contract || typeof contract !== 'object') continue;
  const coverage = contract.coverage || contract.behavior_coverage || contract.coverage_fields;
  assert(!!coverage && typeof coverage === 'object',
    `A5[${role}]: behavior authority declares acceptance coverage fields`);
  if (!coverage || typeof coverage !== 'object') continue;
  for (const [claim, aliases] of Object.entries(COVERAGE_FIELDS)) {
    const key = aliases.find(alias => Object.prototype.hasOwnProperty.call(coverage, alias));
    assert(!!key && meaningful(coverage[key]),
      `A5[${role}]: behavior coverage declares ${claim}`);
  }
}

const behaviorVendor = JSON.stringify(behavior || {}).match(
  /\b(?:Claude|Codex|OpenCode|Kimi|Grok|Cursor|ZCode|sonnet|opus|fable)\b|(?:^|["'\s])(?:~\/|\$HOME\/|\.claude\/|\.codex\/)/i);
assert(!behaviorVendor,
  'A5: universal role behavior authority contains no runtime/model/path vocabulary'
  + (behaviorVendor ? ' — found ' + behaviorVendor[0] : ''));

// A6 — seven declared runtime adapters and the complete native render matrix.
const adapterView = adapterEntries(adapters);
const declaredRuntimes = sorted(new Set(adapterView.entries.map(entry => entry.runtime).filter(Boolean)));
assert(JSON.stringify(declaredRuntimes) === JSON.stringify(SORTED_RUNTIME_NAMES),
  'A6: adapters declare all seven runtime families exactly — got ' + JSON.stringify(declaredRuntimes));
for (const runtime of RUNTIME_NAMES) {
  const entries = adapterView.entries.filter(entry => entry.runtime === runtime);
  assert(entries.length > 0, `A6[${runtime}]: a declared runtime adapter exists`);
  assert(entries.every(entry => {
    const capabilities = capabilityObject(entry.adapter);
    return capabilities && Object.keys(capabilities).length > 0;
  }), `A6[${runtime}]: adapter declares non-empty native capabilities`);
}

assert(Array.isArray(profiles), 'A6: generator returns a profile list');
const outputKeys = profiles.map(profileKey);
assert(new Set(outputKeys).size === outputKeys.length,
  'A6: every generated runtime profile has one unique output identity');
const expectedCounts = {
  claude: 14,
  codex: 42,
  opencode: 14,
  kimi: 14,
  grok: 14,
  cursor: 14,
  zcode: 14,
};
for (const runtime of RUNTIME_NAMES) {
  const runtimeProfiles = profiles.filter(profile => profile.runtime === runtime);
  assert(runtimeProfiles.length === expectedCounts[runtime],
    `A6[${runtime}]: generator renders ${expectedCounts[runtime]} native profiles — got `
    + runtimeProfiles.length);
  const roles = new Set(runtimeProfiles.map(profile => profile.role));
  assert(JSON.stringify(sorted(roles)) === JSON.stringify(ROLE_NAMES),
    `A6[${runtime}]: native output covers all 14 roles`);
}

if (generator && behavior && adapters && profiles.length > 0) {
  let second = [];
  try { second = generator.renderProfiles(clone(behavior), clone(adapters)); }
  catch (error) { assert(false, 'A6: second deterministic render succeeds — ' + error.message); }
  assert(JSON.stringify([...profileMap(profiles)]) === JSON.stringify([...profileMap(second)]),
    'A6: identical behavior plus adapter inputs render byte-identical profiles');
  if (typeof generator.checkGeneratedProfiles === 'function') {
    let drift = [];
    try { drift = generator.checkGeneratedProfiles(ROOT); }
    catch (error) { drift = ['check threw: ' + error.message]; }
    assert(Array.isArray(drift) && drift.length === 0,
      'A6: generated tracked profile bytes equal a fresh native render — drift '
      + JSON.stringify(drift));
  }
}

for (const role of ROLE_NAMES) {
  const codexProfiles = profiles.filter(profile => profile.runtime === 'codex' && profile.role === role);
  assert(codexProfiles.length === 3,
    `A7[${role}]: Codex renders one profile for each of three forges`);
  assert(new Set(codexProfiles.map(profile => profile.content)).size === 1,
    `A7[${role}]: forge-neutral Codex triples are byte-identical`);
}

// A8 — provenance is outside every generated prompt but remains durable and discoverable.
const provenancePattern = /Everything Claude Code|\bvendored\b|upstream provenance|source-commit|source-blob-sha|\bcopyright\b|\blicense:\s*/i;
const trackedPromptPaths = [
  ...fs.readdirSync(path.join(ROOT, 'agents')).filter(name => name.endsWith('.md'))
    .map(name => 'agents/' + name),
  ...['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'].flatMap(edition =>
    fs.readdirSync(path.join(ROOT, 'plugins', edition, 'agents'))
      .filter(name => name.endsWith('.toml'))
      .map(name => `plugins/${edition}/agents/${name}`)),
];
const promptBytes = new Map(trackedPromptPaths.map(relativePath => [relativePath, read(relativePath) || '']));
for (const profile of profiles) promptBytes.set(profileKey(profile), String(profile.content || ''));
const provenanceOutputs = [...promptBytes]
  .filter(([, content]) => provenancePattern.test(content))
  .map(([relativePath]) => relativePath);
assert(provenanceOutputs.length === 0,
  'A8: generated agent-facing prompt bytes contain no provenance narration — found '
  + JSON.stringify(provenanceOutputs));
const provenanceDoc = read('docs/agents-source.md') || '';
for (const token of [
  'Repository:', 'Pinned commit:', 'Upstream blob SHA', 'License:', 'Copyright:', 'Local Overrides',
  'build-error-resolver', 'code-architect', 'code-explorer', 'doc-updater', 'planner', 'tdd-guide',
]) {
  assert(provenanceDoc.includes(token), `A8: durable provenance metadata records ${token}`);
}

// A9 — mutation proof: one shared role contract reaches every runtime render for only that role.
// code-reviewer is deliberately the witness because it already has a behavior authority on the
// pre-#1033 tree; the baseline therefore exercises the mutation and proves its missing five-runtime
// reach instead of skipping behind a not-yet-created role contract.
if (generator && behavior && adapters && roleContracts['code-reviewer'] && profiles.length > 0) {
  const mutatedBehavior = clone(behavior);
  mutatedBehavior.roles['code-reviewer'].description += ' Shared behavior mutation witness 1033.';
  let mutatedProfiles = [];
  try { mutatedProfiles = generator.renderProfiles(mutatedBehavior, clone(adapters)); }
  catch (error) { assert(false, 'A9: shared behavior mutation remains renderable — ' + error.message); }
  const changed = changedProfileKeys(profiles, mutatedProfiles);
  const changedProfiles = mutatedProfiles.filter(profile => changed.includes(profileKey(profile)));
  const expectedRoleKeys = sorted(profiles.filter(profile => profile.role === 'code-reviewer').map(profileKey));
  assert(JSON.stringify(changed) === JSON.stringify(expectedRoleKeys),
    'A9: a code-reviewer behavior mutation changes every and only code-reviewer runtime render — changed '
    + JSON.stringify(changed));
  assert(JSON.stringify(sorted(new Set(changedProfiles.map(profile => profile.runtime))))
      === JSON.stringify(SORTED_RUNTIME_NAMES),
  'A9: shared behavior mutation reaches all seven runtime families');
}

// A10 — mutation proof: a valid adapter change is isolated, and deleting that required capability
// is rejected. Select a capability value already declared by another runtime so the mutation stays
// inside the adapter vocabulary rather than inventing an invalid enum.
if (generator && behavior && adapters && profiles.length > 0) {
  const cursorEntry = adapterView.entries.find(entry => entry.runtime === 'cursor');
  assert(!!cursorEntry, 'A10: cursor adapter exists for isolation/deletion mutation proofs');
  if (cursorEntry) {
    const cursorCapabilities = capabilityObject(cursorEntry.adapter) || {};
    let mutation = null;
    for (const [key, value] of Object.entries(cursorCapabilities)) {
      if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
      for (const other of adapterView.entries.filter(entry => entry.runtime !== 'cursor')) {
        const otherValue = (capabilityObject(other.adapter) || {})[key];
        if (typeof otherValue === typeof value && otherValue !== value) {
          mutation = { key, value: otherValue };
          break;
        }
      }
      if (mutation) break;
    }
    assert(!!mutation,
      'A10: runtime adapter map exposes a valid capability variation for isolation proof');
    if (mutation) {
      const mutatedAdapters = clone(adapters);
      setCapability(mutatedAdapters, cursorEntry, mutation.key, mutation.value);
      let mutatedProfiles = [];
      try { mutatedProfiles = generator.renderProfiles(clone(behavior), mutatedAdapters); }
      catch (error) { assert(false, 'A10: valid cursor adapter mutation renders — ' + error.message); }
      const changed = changedProfileKeys(profiles, mutatedProfiles);
      const changedRuntimeSet = sorted(new Set(mutatedProfiles
        .filter(profile => changed.includes(profileKey(profile)))
        .map(profile => profile.runtime)));
      assert(changed.length > 0 && JSON.stringify(changedRuntimeSet) === JSON.stringify(['cursor']),
        'A10: cursor adapter mutation changes only cursor-family outputs — changed runtimes '
        + JSON.stringify(changedRuntimeSet));

      const deletedAdapters = clone(adapters);
      deleteCapability(deletedAdapters, cursorEntry, mutation.key);
      let deletionRejected = false;
      try { generator.renderProfiles(clone(behavior), deletedAdapters); }
      catch (_) { deletionRejected = true; }
      assert(deletionRejected,
        'A10: deleting a required cursor adapter capability makes focused generation fail');
    }
  }
}

// A10-native-carriers — runtime-specific model and effort identifiers are adapter data. A
// renderer may understand a carrier shape, but it must not know Cursor's model family or ZCode's
// model name as a literal. Mutating either identifier must change every and only the target
// runtime's profiles.
if (generator && behavior && adapters && profiles.length > 0) {
  const generatorSource = read(generatorPath) || '';
  for (const runtime of ['cursor', 'zcode']) {
    const entry = adapterView.entries.find(candidate => candidate.runtime === runtime);
    const runtimeProfiles = runtimeProfilesFor(profiles, runtime);
    const renderedModels = sorted(new Set(runtimeProfiles.map(profile => {
      const { fields } = parseFrontmatter(profile.content);
      return String(fields.model || '').replace(/\[effort=[^\]]+\]$/, '');
    }).filter(Boolean)));
    assert(!!entry, `A10-native[${runtime}]: target adapter exists`);
    assert(renderedModels.length === 1,
      `A10-native[${runtime}]: all target profiles use one adapter-owned model identifier — got `
      + JSON.stringify(renderedModels));
    if (!entry || renderedModels.length !== 1) continue;

    const modelIdentifier = renderedModels[0];
    assert(JSON.stringify(entry.adapter).includes(modelIdentifier),
      `A10-native[${runtime}]: adapter data owns rendered model identifier `
      + JSON.stringify(modelIdentifier));
    assert(!generatorSource.includes(modelIdentifier),
      `A10-native[${runtime}]: profile renderer contains no hardcoded model identifier `
      + JSON.stringify(modelIdentifier));

    const replacement = `kw-${runtime}-model-mutation-1033`;
    const stats = { replacements: 0 };
    const mutatedAdapters = replaceExactScalar(clone(adapters), modelIdentifier, replacement, stats);
    assert(stats.replacements > 0,
      `A10-native[${runtime}]: model mutation changed adapter data rather than renderer source`);
    if (stats.replacements === 0) continue;
    let mutatedProfiles = [];
    try { mutatedProfiles = generator.renderProfiles(clone(behavior), mutatedAdapters); }
    catch (error) {
      assert(false, `A10-native[${runtime}]: adapter-owned model mutation renders — ${error.message}`);
    }
    const changed = changedProfileKeys(profiles, mutatedProfiles);
    const expected = sorted(runtimeProfiles.map(profileKey));
    assert(JSON.stringify(changed) === JSON.stringify(expected),
      `A10-native[${runtime}]: model mutation changes every and only target profile — changed `
      + JSON.stringify(changed));
    const targetOutputs = runtimeProfilesFor(mutatedProfiles, runtime);
    assert(targetOutputs.length === expected.length
      && targetOutputs.every(profile => profile.content.includes(replacement)),
    `A10-native[${runtime}]: mutated adapter model reaches all ${expected.length} native carriers`);

    const intentMutation = clone(adapters);
    const intentEntry = adapterEntries(intentMutation).entries.find(candidate => candidate.runtime === runtime);
    intentEntry.adapter.capabilities.intent_mapping.standard = `kw-${runtime}-effort-mutation-1033`;
    let intentProfiles = [];
    try { intentProfiles = generator.renderProfiles(clone(behavior), intentMutation); }
    catch (error) {
      assert(false, `A10-native[${runtime}]: adapter-owned effort mutation renders — ${error.message}`);
    }
    const intentChanged = changedProfileKeys(profiles, intentProfiles);
    assert(JSON.stringify(intentChanged) === JSON.stringify(expected),
      `A10-native[${runtime}]: standard effort mutation changes every and only target runtime profiles — changed `
      + JSON.stringify(intentChanged));
    const mutatedStandard = intentProfiles.filter(profile => profile.runtime === runtime
      && roleContracts[profile.role].intent_class === 'standard');
    assert(mutatedStandard.length > 0 && mutatedStandard.every(profile =>
      profile.content.includes(`kw-${runtime}-effort-mutation-1033`)),
    `A10-native[${runtime}]: adapter-owned standard effort reaches every standard native carrier`);
  }
}

// A10-native-tools — runtimes that declare profile_tools enforce the role capability contract in
// native frontmatter. Prose restrictions cannot substitute for the carrier: the allowlist must be
// present exactly once and roles without a capability must lack its native tools.
if (generator && behavior && adapters && profiles.length > 0) {
  const profileToolRuntimes = ['kimi', 'grok', 'zcode'];
  for (const runtime of profileToolRuntimes) {
    const entry = adapterView.entries.find(candidate => candidate.runtime === runtime);
    assert(!!entry && capabilityObject(entry.adapter).tool_binding === 'profile_tools',
      `A10-tools[${runtime}]: adapter declares profile_tools enforcement`);
    for (const profile of runtimeProfilesFor(profiles, runtime)) {
      const contract = roleContracts[profile.role];
      const expected = expectedNativeTools(contract, runtime);
      const { fields, raw } = parseFrontmatter(profile.content);
      let actual = null;
      try { actual = JSON.parse(fields.tools); } catch (_) { actual = null; }
      assert((raw.match(/^tools\s*:/gm) || []).length === 1 && Array.isArray(actual),
        `A10-tools[${runtime}/${profile.role}]: native frontmatter carries one executable tools allowlist`);
      assert(Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected),
        `A10-tools[${runtime}/${profile.role}]: tools derive exactly from behavior capabilities — expected `
        + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
    }
  }

  const reducedBehavior = clone(behavior);
  reducedBehavior.roles.implementer.capability_requirements = ['repository_read'];
  let reducedProfiles = [];
  try { reducedProfiles = generator.renderProfiles(reducedBehavior, clone(adapters)); }
  catch (error) { assert(false, 'A10-tools: reduced read-only capability mutation renders — ' + error.message); }
  for (const runtime of profileToolRuntimes) {
    const profile = reducedProfiles.find(candidate =>
      candidate.runtime === runtime && candidate.role === 'implementer');
    const { fields, raw } = parseFrontmatter(profile && profile.content);
    let actual = null;
    try { actual = JSON.parse(fields.tools); } catch (_) { actual = null; }
    assert((raw.match(/^tools\s*:/gm) || []).length === 1
      && JSON.stringify(actual) === JSON.stringify(['Read', 'Grep', 'Glob'])
      && !/\b(?:Write|Edit|Bash)\b/.test(String(fields.tools || '')),
    `A10-tools[${runtime}/mutation]: removing write and shell capabilities removes Write/Edit/Bash `
      + 'from the enforced native allowlist');
  }
}

// A11 — old Claude-first paraphrase and prose-rewrite machinery is deleted with its mechanism.
assert(!fs.existsSync(path.join(ROOT, 'scripts', 'test-agent-profile-parity.js')),
  'A11: retired hand-maintained Markdown↔TOML paraphrase suite is deleted');
const packageText = read('package.json') || '';
assert(!packageText.includes('test-agent-profile-parity.js'),
  'A11: package test chains no longer register the retired paraphrase suite');
const retiredTransformPatterns = [
  /MODEL_DISPATCH_HEADING/,
  /MODEL_MENTION/,
  /stripCardModelPlaceholders/,
  /assertNoModelDispatchResidue/,
  /model-dispatch anchor/i,
];
for (const relativePath of [
  'scripts/sync-opencode-edition.js',
  'scripts/sync-kimi-edition.js',
  'scripts/sync-grok-edition.js',
  'scripts/sync-cursor-edition.js',
  'scripts/sync-zcode-edition.js',
]) {
  const text = read(relativePath) || '';
  const retired = retiredTransformPatterns.filter(pattern => pattern.test(text)).map(String);
  assert(retired.length === 0,
    `A11: ${relativePath} contains no retired Claude-prose transform — found `
    + JSON.stringify(retired));
}

if (failed > 0) {
  console.error(`\nruntime-agent-architecture test FAILED: ${failed} failure(s), ${passed} passed.`
    + (generatorPath ? ` [generator: ${generatorPath}]` : ' [generator: NOT FOUND]'));
  process.exit(1);
}
console.log(`runtime-agent-architecture test passed (${passed} assertions). [generator: ${generatorPath}]`);
