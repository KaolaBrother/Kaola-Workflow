#!/usr/bin/env node
'use strict';

// test-issue-1101-native-only.js — Kaola-Workflow defines no subagent roles (#1101, ADR 0029).
//
// Subagent capability belongs to the running Agent Harness. Kaola ships no role catalog, no role
// profiles, no profile generator or manifest, no role->model map, and no pinned subagent model or
// effort on any runtime. These guards fail when any of that is reintroduced:
//
//   1. retired artifacts: a tracked role profile, profile generator, behavior-contract authority,
//      generated-profile manifest, or Codex agents.toml registration; a package or plugin manifest
//      that ships or advertises agent profiles; a script or chain that still calls the generator;
//   2. agent-facing text: every generated command/skill/recovery surface, every runtime's compact
//      recovery render, every additive-edition render, and the routing/global sources carry no role
//      name, role roster, role placeholder, subagent default binding, cheap/fast child tier, or
//      pinned subagent model/effort — and every dispatch block states the native-only rule;
//   3. data authorities: the runtime adapter facts carry no role or model-binding capability, the
//      Codex-session module carries no role->model map, and the kernel exports no pinned Codex
//      role model/effort.
//
// Each detector is mutation-proven below against a synthetic reintroduction, so a guard that
// silently stopped matching fails here rather than passing vacuously.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SELF = path.relative(ROOT, __filename);

// The seven roles retired by #1101. Listed here only so the guard can recognise them.
const RETIRED_ROLES = Object.freeze([
  'code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide',
]);
const ROLE_RE = new RegExp('\\b(?:' + RETIRED_ROLES.join('|') + ')\\b');

// The two sentences every dispatch block carries (AC3): Kaola defines no roles, and the absence of
// Kaola profiles is never read as the absence of native subagent capability.
const NATIVE_ONLY_STATEMENTS = Object.freeze([
  'Kaola-Workflow defines no subagent roles, role profiles, or subagent model and effort bindings.',
  'Kaola-Workflow installing no profiles is never evidence that the host lacks subagent capability.',
]);

const TEXT_VIOLATIONS = Object.freeze([
  ['retired role name', ROLE_RE],
  ['role placeholder', /<role>/],
  ['role roster', /\*\*Roles:\*\*/],
  ['subagent default binding', /subagent[ _]default|default binding/i],
  ['cheap or fast child tier', /\bcheap(?:er)?\b|\bfast(?:er)?\s+(?:child|children|implementer|subagent|worker)/i],
  ['pinned subagent model', /\bpins?\b[^\n]{0,80}\bmodel\b|\bmodel\s*[:=]\s*["'`]?(?:sonnet|opus|haiku|fable|inherit|gpt-[\w.-]+|grok-[\w.-]+)/i],
  ['pinned subagent effort', /model_reasoning_effort|\beffort\s*[:=]\s*["'`]?(?:low|medium|high|xhigh|max)\b/i],
  ['Kaola-owned role profile', /installed Kaola profile|Kaola role profile|named Kaola role|Kaola-installed role/i],
  ['named-role fallback', /exact named role|named role's identity/i],
]);

function textViolations(label, text) {
  const out = [];
  for (const [kind, re] of TEXT_VIOLATIONS) {
    const m = String(text).match(re);
    if (m) out.push(`${label}: ${kind} (${JSON.stringify(m[0])})`);
  }
  return out;
}

function dispatchBlockViolations(label, text) {
  const body = String(text);
  if (!body.includes('<!-- KW-RUNTIME-DISPATCH-START -->')) return [];
  return NATIVE_ONLY_STATEMENTS.filter(s => !body.includes(s))
    .map(s => `${label}: dispatch block lacks the native-only statement ${JSON.stringify(s)}`);
}

const RETIRED_PATHS = Object.freeze([
  [/^agents\//, 'tracked Claude role profile or generated-profile manifest'],
  [/^plugins\/[^/]+\/agents\//, 'tracked Codex role profile'],
  [/^plugins\/[^/]+\/config\/agents\.toml$/, 'tracked Codex role registration'],
  [/(?:^|\/)\.(?:grok|cursor)(?:-[a-z]+)?\/agents\//, 'tracked Grok/Cursor role profile'],
  [/^templates\/agents\/behavior-contracts\.json$/, 'role behavior-contract authority'],
  [/^scripts\/generate-agent-profiles\.js$/, 'role profile generator'],
  [/^scripts\/validate-vendored-agents\.js$/, 'generated role profile validator'],
]);

function retiredPathViolations(files) {
  const out = [];
  for (const file of files) {
    for (const [re, kind] of RETIRED_PATHS) if (re.test(file)) out.push(`${file}: ${kind}`);
  }
  return out;
}

const FORBIDDEN_ADAPTER_KEYS = Object.freeze([
  'named_roles', 'deterministic_profiles', 'role_dispatch', 'profile_format', 'model_carrier',
  'tool_binding', 'subagent_default', 'intent_mapping', 'dispatch_conformance', 'profile_lookup',
  'dispatch_carrier', 'tool_boundary', 'fallback_search',
]);

function adapterViolations(source) {
  const out = [];
  (function walk(value, where) {
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${where}[${i}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_ADAPTER_KEYS.includes(key)) out.push(`runtime adapter ${where}.${key}: role or model-binding capability`);
      walk(child, `${where}.${key}`);
    }
  })(source, '$');
  // Evidence claims are dated historical observations and may name what was measured then; every
  // current fact outside them must not name a retired role.
  const text = JSON.stringify(Object.assign({}, source, { evidence: undefined }));
  const role = text.match(ROLE_RE);
  if (role) out.push(`runtime adapter names retired role ${role[0]}`);
  return out;
}

const ROLE_MODEL_MAP_RE = new RegExp(`['"](?:${RETIRED_ROLES.join('|')})['"]\\s*:\\s*['"][\\w.-]+['"]`);

function sessionModuleViolations(mod, text) {
  const out = [];
  for (const name of ['DEFAULT_AGENT_MODELS', 'resolveAgentModel', 'formatAgentArgument', 'extractFrontmatterModel']) {
    if (Object.prototype.hasOwnProperty.call(mod, name)) out.push(`Codex session module exports ${name}`);
  }
  if (typeof mod.loadCodexSessionProof !== 'function') out.push('Codex session module lost loadCodexSessionProof');
  if (ROLE_MODEL_MAP_RE.test(text)) out.push('Codex session module carries a role->model map');
  return out;
}

function kernelViolations(mod, text) {
  const out = [];
  for (const name of ['CODEX_PINNED_MODEL', 'CODEX_PINNED_EFFORT', 'CODEX_PINNED_ROLES', 'validateProfileText']) {
    if (Object.prototype.hasOwnProperty.call(mod, name)) out.push(`kernel exports ${name}`);
  }
  const pinned = String(text).match(/gpt-6-luna|gpt-5\.6-sol/);
  if (pinned) out.push(`kernel names pinned Codex model ${pinned[0]}`);
  return out;
}

// ---------------------------------------------------------------------------
// Mutation proofs: every detector flags a synthetic reintroduction.
// ---------------------------------------------------------------------------
function mustFlag(list, what) {
  assert.ok(list.length > 0, `detector missed a reintroduced ${what}`);
}
mustFlag(textViolations('m', 'Dispatch with `Agent` and `subagent_type="implementer"`.'), 'role call card');
mustFlag(textViolations('m', 'Use the tdd-guide to hold the tests.'), 'role name');
mustFlag(textViolations('m', '**Roles:** `a`, `b`.'), 'role roster');
mustFlag(textViolations('m', 'Dispatch with `spawn_agent` and `agent_type: "<role>"`.'), 'role placeholder');
mustFlag(textViolations('m', '**Subagent default:** every profile runs sonnet.'), 'subagent default binding');
mustFlag(textViolations('m', 'When the cheaper child keeps failing, take over.'), 'cheap child tier');
mustFlag(textViolations('m', 'Prefer a fast implementer for mechanical edits.'), 'fast child tier');
mustFlag(textViolations('m', '---\nname: helper\nmodel: sonnet\n---'), 'pinned model frontmatter');
mustFlag(textViolations('m', 'model = "gpt-6-luna"'), 'pinned Codex model');
mustFlag(textViolations('m', 'model_reasoning_effort = "max"'), 'pinned Codex effort');
mustFlag(textViolations('m', 'Every generated agent pins grok-4.7 as its model.'), 'pinned Grok model');
mustFlag(textViolations('m', 'installed Kaola profiles carry the tool boundary'), 'Kaola profile reference');
mustFlag(textViolations('m', 'The absence of an exact named role is not proof that dispatch is unavailable.'), 'named-role fallback');
mustFlag(dispatchBlockViolations('m', '<!-- KW-RUNTIME-DISPATCH-START -->\n## Delegation\n'), 'dispatch block without the native-only rule');
assert.deepStrictEqual(dispatchBlockViolations('m',
  '<!-- KW-RUNTIME-DISPATCH-START -->\n' + NATIVE_ONLY_STATEMENTS.join('\n')), [],
  'a dispatch block that states the native-only rule passes');
mustFlag(retiredPathViolations(['agents/implementer.md']), 'Claude role profile');
mustFlag(retiredPathViolations(['agents/generated-agent-manifest.json']), 'profile manifest');
mustFlag(retiredPathViolations(['plugins/kaola-workflow-gitea/agents/tdd-guide.toml']), 'Codex role profile');
mustFlag(retiredPathViolations(['plugins/kaola-workflow/config/agents.toml']), 'Codex role registration');
mustFlag(retiredPathViolations(['scripts/generate-agent-profiles.js']), 'profile generator');
mustFlag(retiredPathViolations(['templates/agents/behavior-contracts.json']), 'behavior authority');
mustFlag(retiredPathViolations(['.cursor/agents/helper.md']), 'Cursor role profile');
mustFlag(adapterViolations({ runtimes: { claude: { capabilities: { subagent_default: { model: 'sonnet' } } } } }), 'subagent_default capability');
mustFlag(adapterViolations({ runtimes: { codex: { capabilities: { role_dispatch: 'named_profile' } } } }), 'named-profile dispatch');
mustFlag(adapterViolations({ runtimes: { grok: { note: 'dispatch the code-reviewer' } } }), 'role name in adapter facts');
mustFlag(sessionModuleViolations({ loadCodexSessionProof() {}, DEFAULT_AGENT_MODELS: {} }, ''), 'role model export');
mustFlag(sessionModuleViolations({ loadCodexSessionProof() {} }, "const M = { 'implementer': 'sonnet' };"), 'role->model map');
mustFlag(sessionModuleViolations({}, ''), 'lost session-proof capability');
mustFlag(kernelViolations({ CODEX_PINNED_MODEL: 'gpt-6-luna' }, ''), 'pinned Codex model export');
mustFlag(kernelViolations({}, "const X = 'gpt-6-luna';"), 'pinned Codex model literal');

// ---------------------------------------------------------------------------
// 1. Retired artifacts, packaging, and callers.
// ---------------------------------------------------------------------------
function trackedFiles() {
  // spawn-class: environment
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'git ls-files failed: ' + r.stderr);
  return r.stdout.split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)));
}
const files = trackedFiles();
const failures = [];
failures.push(...retiredPathViolations(files));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if ((pkg.files || []).some(entry => /^agents\/?$/.test(entry))) failures.push('package.json files ships agents/');
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  for (const retired of ['generate-agent-profiles', 'validate-vendored-agents', 'test-issue-1054-role-redesign', 'test-agent-model-resolver']) {
    if (cmd.includes(retired)) failures.push(`package.json script ${name} still runs ${retired}`);
  }
}
if (!String(pkg.scripts['test:kaola-workflow:claude'] || '').includes(SELF)
    || !String(pkg.scripts['test:kaola-workflow:claude:full'] || '').includes(SELF)) {
  failures.push(`package.json claude chains must run ${SELF}`);
}
for (const manifest of files.filter(f => /(?:^|\/)\.(?:claude|codex)-plugin\/plugin\.json$/.test(f))) {
  const text = fs.readFileSync(path.join(ROOT, manifest), 'utf8');
  const parsed = JSON.parse(text);
  if (Object.prototype.hasOwnProperty.call(parsed, 'agents')) failures.push(`${manifest}: registers an agents directory`);
  if (/agent profiles?/i.test(text)) failures.push(`${manifest}: advertises agent profiles`);
}

// No executable source may still reach for the retired generator or role-model resolution.
const CALLER_RE = /generate-agent-profiles|resolveAgentModel|DEFAULT_AGENT_MODELS|behavior-contracts\.json/;
for (const file of files) {
  if (file === SELF || file === 'templates/agents/provenance.json' || !/\.(?:js|sh|json)$/.test(file)) continue;
  if (/^kaola-workflow\/|^docs\/|(?:^|\/)fixtures\//.test(file)) continue;
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = text.match(CALLER_RE);
  if (m) failures.push(`${file}: still references ${m[0]}`);
}

// ---------------------------------------------------------------------------
// 2. Agent-facing text.
// ---------------------------------------------------------------------------
const routing = require('./generate-routing-surfaces.js');
const surfaces = new Map();
for (const row of [...routing.GENERATED_SURFACES, ...routing.RUNTIME_RECOVERY_SURFACES]) {
  surfaces.set(row.path, fs.readFileSync(path.join(ROOT, row.path), 'utf8'));
}
for (const f of fs.readdirSync(path.join(ROOT, 'templates', 'routing')).filter(f => f.endsWith('.md'))) {
  surfaces.set('templates/routing/' + f, fs.readFileSync(path.join(ROOT, 'templates', 'routing', f), 'utf8'));
}
for (const rel of ['templates/global/kaola-workflow-global.md', 'templates/axioms.md']) {
  surfaces.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
const RECOVERY_RUNTIMES = ['claude', 'codex', 'grok', 'cursor', 'devin', 'droid', 'dsh', 'zcode'];
for (const runtime of RECOVERY_RUNTIMES) {
  for (const forge of routing.FORGES) {
    surfaces.set(`compact-recovery render ${runtime}/${forge}`, routing.renderCompactRecoveryPrompt(runtime, forge));
  }
}

// Additive runtime editions render in memory from the same canonical surfaces.
const forgeLayout = require('./runtime-edition-forge.js');
const editions = {
  grok: require('./sync-grok-edition.js'),
  cursor: require('./sync-cursor-edition.js'),
  kimi: require('./sync-kimi-edition.js'),
  opencode: require('./sync-opencode-edition.js'),
  zcode: require('./sync-zcode-edition.js'),
  devin: require('./sync-devin-edition.js'),
  droid: require('./sync-droid-edition.js'),
  dsh: require('./sync-dsh-edition.js'),
};
for (const forge of routing.FORGES) {
  for (const source of forgeLayout.commandSources(forge)) {
    const canon = fs.readFileSync(source.absPath, 'utf8');
    const name = source.basename.replace(/\.md$/, '');
    for (const runtime of ['grok', 'cursor', 'kimi']) {
      surfaces.set(`${runtime}/${forge}/${name}`, editions[runtime].renderCommand(canon, name, forge));
    }
    surfaces.set(`opencode/${forge}/${name}`, editions.opencode.renderCommand(canon, forge, name));
  }
  for (const source of editions.zcode.skillSources(forge)) {
    surfaces.set(`zcode/${forge}/${source.skillName}`,
      editions.zcode.renderSkill(fs.readFileSync(source.absPath, 'utf8'), source.skillName, forge));
  }
  for (const runtime of ['devin', 'droid', 'dsh']) {
    for (const [rel, bytes] of editions[runtime].expected(forge)) surfaces.set(`${runtime}:${rel}`, bytes);
  }
}
// Edition generators carry their own runtime prose constants; scan the sources too.
for (const runtime of Object.keys(editions)) {
  const rel = `scripts/sync-${runtime}-edition.js`;
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [kind, re] of TEXT_VIOLATIONS.filter(([kind]) => /pinned|cheap|default binding|roster|placeholder/.test(kind))) {
    const m = text.match(re);
    if (m) failures.push(`${rel}: ${kind} (${JSON.stringify(m[0])})`);
  }
}

let dispatchBlocks = 0;
for (const [label, text] of surfaces) {
  failures.push(...textViolations(label, text));
  // A skeleton carries the dispatch contract as a SLOT; its renders are checked instead.
  if (!/\.skeleton\.md$/.test(label)) failures.push(...dispatchBlockViolations(label, text));
  if (text.includes('<!-- KW-RUNTIME-DISPATCH-START -->')) dispatchBlocks++;
}
if (dispatchBlocks === 0) failures.push('no scanned surface carries a dispatch block');
const contract = fs.readFileSync(path.join(ROOT, 'templates', 'routing', 'dispatch-contract.md'), 'utf8');
for (const statement of NATIVE_ONLY_STATEMENTS) {
  if (!contract.includes(statement)) failures.push(`dispatch-contract.md lacks ${JSON.stringify(statement)}`);
}

// Test custody and repair custody survive as task/result constraints, not as roles (AC4). Before
// #1101 these sentences named the retired test-author and implementer roles.
const CUSTODY = Object.freeze([
  ['next', 'When someone other than the implementing context holds the acceptance tests, the implementation\ndoes not delete, weaken, or reinterpret them to pass'],
  ['finalize', 'A repair may change acceptance meaning only where you hold that meaning'],
  ['finalize', 'a fix that\nfollows a review finding waits for your own verdict on the finding'],
]);
for (const row of routing.GENERATED_SURFACES) {
  for (const [topic, sentence] of CUSTODY) {
    if (row.topic === topic && !surfaces.get(row.path).includes(sentence)) {
      failures.push(`${row.path}: lost the custody constraint ${JSON.stringify(sentence.split('\n')[0])}`);
    }
  }
}

// Compact-recovery carrier dedupe (moved here from the retired test-issue-1054-role-redesign.js
// Group F, whose remaining groups pinned role bodies that no longer exist). Claude and Codex
// recovery reloads the full Next/Finalize prompt, which already carries dispatch, so their recovery
// render points there instead of repeating it; the always-loaded carriers keep it exactly once.
{
  const full = routing.RECOVERY_FULL_DISPATCH_RUNTIMES;
  if (full.includes('claude') || full.includes('codex')) failures.push('claude/codex must not be always-loaded dispatch carriers');
  for (const row of routing.RUNTIME_RECOVERY_SURFACES) {
    const rendered = routing.renderCompactRecoveryPrompt(row.runtime, row.forge);
    const keeps = full.includes(row.runtime);
    if (rendered.includes('KW-RUNTIME-DISPATCH-START') !== keeps
        || /Runtime adapter facts/.test(rendered) !== keeps) {
      failures.push(`recovery ${row.runtime}/${row.forge}: dispatch embed does not match its carrier role`);
    }
    if (!keeps && !/does not restate/.test(rendered)) failures.push(`recovery ${row.runtime}/${row.forge}: no deferred-dispatch pointer`);
  }
  for (const runtime of full) {
    const rendered = routing.renderCompactRecoveryPrompt(runtime, 'github', { globalContract: 'placeholder contract text' });
    const starts = (rendered.match(/KW-RUNTIME-DISPATCH-START/g) || []).length;
    if (starts !== 1 || !/Runtime adapter facts/.test(rendered)) {
      failures.push(`recovery ${runtime}: the always-loaded carrier must hold the dispatch block exactly once`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Data authorities.
// ---------------------------------------------------------------------------
failures.push(...adapterViolations(JSON.parse(fs.readFileSync(
  path.join(ROOT, 'templates', 'agents', 'runtime-capabilities.json'), 'utf8'))));
const SESSION_MODULES = [
  'scripts/kaola-workflow-resolve-agent-model.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js',
];
for (const rel of SESSION_MODULES) {
  const abs = path.join(ROOT, rel);
  failures.push(...sessionModuleViolations(require(abs), fs.readFileSync(abs, 'utf8')).map(v => `${rel}: ${v}`));
}
const KERNELS = [
  'scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
];
for (const rel of KERNELS) {
  const abs = path.join(ROOT, rel);
  failures.push(...kernelViolations(require(abs), fs.readFileSync(abs, 'utf8')).map(v => `${rel}: ${v}`));
}
for (const rel of ['scripts/kaola-workflow-codex-preflight.js', 'scripts/kaola-workflow-cursor-surface.js']) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = text.match(/gpt-6-luna|gpt-5\.6-sol|CODEX_PINNED_\w+|agents\/implementer\.md|listCanonAgents|CODEX_MIN_VERSION|codex_version_unsupported|codex_multi_agent_v2_required/);
  if (m) failures.push(`${rel}: still enforces the retired role catalog or its dispatch-mode gates (${m[0]})`);
}

if (failures.length) {
  console.error(`test-issue-1101-native-only: ${failures.length} violation(s)`);
  for (const f of failures.slice(0, 200)) console.error('  - ' + f);
  if (failures.length > 200) console.error(`  ... ${failures.length - 200} more`);
  process.exit(1);
}
console.log(`test-issue-1101-native-only: PASS (${surfaces.size} agent-facing renders, ${dispatchBlocks} dispatch blocks, ${files.length} tracked files; detectors mutation-proven)`);
