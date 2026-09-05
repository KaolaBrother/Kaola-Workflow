#!/usr/bin/env node
'use strict';

// Issue #1033 — acceptance for the AGENTS-first, runtime-adapted architecture.
//
// This suite owns outcomes, not a source directory or serialization format. It discovers the
// profile generator by capability, asks that generator for its behavior authority, adapters, and
// rendered profiles, then mutates those inputs in memory. Generated files are the subject; mocks
// replace neither the generator nor its source data.

const fs = require('fs');
const path = require('path');

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

function normalizedProse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function rolesByIntent(roleContracts) {
  const rosters = { standard: [], reasoning: [], heavy: [] };
  for (const [role, contract] of Object.entries(roleContracts || {})) {
    if (Object.prototype.hasOwnProperty.call(rosters, contract && contract.intent_class)) {
      rosters[contract.intent_class].push(role);
    }
  }
  for (const tier of Object.keys(rosters)) rosters[tier].sort();
  return rosters;
}

function roleNamesIn(text) {
  const prose = String(text || '').toLowerCase();
  return ROLE_NAMES.filter(role => new RegExp(`(?:^|[^a-z0-9-])${role}(?:$|[^a-z0-9-])`).test(prose));
}

// Role membership is derived once from behavior-contracts.json. It is a shared authority check,
// not a requirement that every runtime adapter or every generated carrier repeat the full roster.
function tierRosterGaps(text, expected) {
  const prose = normalizedProse(text).toLowerCase();
  const roster = prose.match(/\brole roster:\s*(.*?)(?=\.(?:\s|$)|$)/);
  const gaps = [];
  for (const [tier, roles] of Object.entries(expected)) {
    const segment = roster && roster[1].match(
      new RegExp(`\\b${tier}\\s+[—-]\\s*(.*?)(?=;\\s*(?:standard|reasoning|heavy)\\s+[—-]|$)`));
    const found = segment ? roleNamesIn(segment[1]).sort() : [];
    if (JSON.stringify(found) !== JSON.stringify(roles)) gaps.push(`${tier}-role-roster`);
  }
  return gaps;
}

const RETIRED_RUN_WIDE_INLINE = /if\s+the\s+runtime\s+cannot\s+spawn\s+(?:an?\s+)?role\s+agent[\s\S]{0,100}?keep\s+the\s+work\s+inline/i;

function concreteDispatchBlocks(runtime, text) {
  const call = runtime === 'claude' ? 'Agent' : runtime === 'codex' ? 'spawn_agent' : null;
  if (!call) return [];
  const pattern = new RegExp(`^${call}\\(\\n[\\s\\S]*?^\\)`, 'gm');
  return [...String(text || '').matchAll(pattern)].map(match => match[0]);
}

function quotedCallField(block, field) {
  const match = String(block || '').match(new RegExp(`\\b${field}\\s*=\\s*["']([^"']*)["']`));
  return match ? match[1] : null;
}

function codexV2FieldHits(text) {
  return String(text || '').split(/\r?\n/)
    .filter(line => /^\s*(?:task_name|agent_type|message|reasoning_effort|fork_turns)\s*=/.test(line));
}

// #1049 — Codex tier defaults are a dispatch contract carried by each Codex forge adapter and
// rendered into Next, Finalize, and compact-recovery surfaces. Profiles still inherit the host
// model by omission; these defaults describe the explicit dispatch fields only.
const CODEX_TIER_DEFAULTS = Object.freeze({
  standard: Object.freeze({ model: 'gpt-5.6-luna', effort: 'max' }),
  reasoning: Object.freeze({ model: 'gpt-6-astra', effort: 'medium' }),
  heavy: Object.freeze({ model: 'gpt-6-astra', effort: 'high' }),
});

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasToken(text, token) {
  return new RegExp(`(?:^|[^a-z0-9])${regexEscape(token)}(?:$|[^a-z0-9])`, 'i').test(text);
}

function codexTierDefaultGaps(text) {
  const prose = normalizedProse(text);
  const gaps = [];
  for (const [tier, binding] of Object.entries(CODEX_TIER_DEFAULTS)) {
    const match = prose.match(new RegExp(
      `\\b${tier}\\s*(?:→|—|-)\\s*([\\s\\S]*?)(?=;\\s*(?:standard|reasoning|heavy)\\s*(?:→|—|-)\\s*|$)`,
      'i'));
    const segment = match ? match[1] : '';
    if (!hasToken(segment, binding.model) || !hasToken(segment, binding.effort)) gaps.push(tier);
  }
  return gaps;
}

const CODEX_TIER_FIXTURE = [
  '**Tier defaults:** standard — standard → `gpt-5.6-luna` with reasoning effort `max`;',
  'reasoning — reasoning → `gpt-6-astra` with reasoning effort `medium`;',
  'heavy — heavy → `gpt-6-astra` with reasoning effort `high`.',
].join(' ');
assert(codexTierDefaultGaps(CODEX_TIER_FIXTURE).length === 0,
  'A1049/oracle: decimal model versions and the requested three tier pairs parse as valid');
assert(codexTierDefaultGaps(CODEX_TIER_FIXTURE.replaceAll('gpt-6-astra', 'gpt-5.6-sol'))
    .includes('reasoning')
    && codexTierDefaultGaps(CODEX_TIER_FIXTURE.replaceAll('gpt-6-astra', 'gpt-5.6-sol'))
      .includes('heavy'),
  'A1049/oracle RED: the historical Sol reasoning/heavy pair is rejected');
assert(codexTierDefaultGaps(CODEX_TIER_FIXTURE.replace('effort `high`', 'effort `xhigh`'))
    .includes('heavy'),
  'A1049/oracle RED: heavy high does not accept the stronger xhigh token');

function dispatchBinding(runtime, role, roleContracts) {
  const expected = {
    claude: {
      standard: { model: 'sonnet' },
      reasoning: { model: 'opus' },
      heavy: { model: 'fable' },
    },
    codex: {
      standard: CODEX_TIER_DEFAULTS.standard,
      reasoning: CODEX_TIER_DEFAULTS.reasoning,
      heavy: CODEX_TIER_DEFAULTS.heavy,
    },
  }[runtime];
  const tier = roleContracts[role] && roleContracts[role].intent_class;
  return expected && expected[tier] ? expected[tier] : null;
}

function dispatchDefaultGaps(runtime, text, roleContracts) {
  if (runtime !== 'claude' && runtime !== 'codex') return [];
  const blocks = concreteDispatchBlocks(runtime, text);
  const gaps = [];
  const roleField = runtime === 'codex' ? 'agent_type' : 'subagent_type';
  for (const [index, block] of blocks.entries()) {
    const callLabel = `call-${index}`;
    const role = quotedCallField(block, roleField);
    if (!role || !Object.prototype.hasOwnProperty.call(roleContracts, role)) {
      gaps.push(`${callLabel}-role`);
      continue;
    }
    const binding = dispatchBinding(runtime, role, roleContracts);
    if (!binding || quotedCallField(block, 'model') !== binding.model) {
      gaps.push(`${callLabel}-default-model`);
    }
    if (runtime === 'codex' && (!binding || quotedCallField(block, 'reasoning_effort') !== binding.effort)) {
      gaps.push(`${callLabel}-default-effort`);
    }
    if (runtime === 'codex') {
      if (quotedCallField(block, 'agent_type') !== role) gaps.push(`${callLabel}-agent-type`);
      const taskName = quotedCallField(block, 'task_name');
      const sanitizedRole = role.replace(/-/g, '_');
      if (taskName === null || taskName.length === 0) {
        gaps.push(`${callLabel}-task-name-required`);
      } else {
        if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(taskName)) gaps.push(`${callLabel}-task-name-sanitize`);
        if (!taskName.includes(sanitizedRole)) gaps.push(`${callLabel}-task-name-role`);
      }
    }
  }
  const prose = normalizedProse(text).toLowerCase();
  if (!(prose.includes('task-sensitive') && prose.includes('override'))) gaps.push('task-sensitive-override');
  return gaps;
}

function choiceContract(text) {
  const match = String(text || '').match(
    /(?:\*\*)?Choose dispatch or inline per item(?::(?:\*\*)?|\.)[\s\S]*?(?=\n\n|$)/);
  return normalizedProse(match ? match[0].replace(/\*\*/g, '') : '')
    .replace(/^Choose dispatch or inline per item\./, 'Choose dispatch or inline per item:');
}

function commonDelegationGaps(text) {
  const prose = normalizedProse(text).toLowerCase();
  const gaps = [];
  if (!(prose.includes('re-evaluat') && /(?:each|every) mission(?:-list)? item/.test(prose)
      && /no run-wide (?:default|posture)|never (?:becomes|establishes) (?:a )?run-wide/.test(prose))) {
    gaps.push('per-item-reset');
  }
  if (!(/exact named role/.test(prose) && /not (?:proof|evidence)/.test(prose)
      && /all (?:native )?(?:subagent|child) dispatch/.test(prose) && /unavailable/.test(prose))) {
    gaps.push('exact-role-is-not-no-dispatch');
  }
  if (!(prose.includes('cohesive production surface')
      && prose.includes('research') && prose.includes('test authorship')
      && prose.includes('documentation') && prose.includes('review'))) {
    gaps.push('production-owner-scope');
  }
  return gaps;
}

function dispatchMarkerGaps(text) {
  const source = String(text || '');
  const starts = [...source.matchAll(/<!--\s*KW-RUNTIME-DISPATCH-START\s*-->/g)];
  const ends = [...source.matchAll(/<!--\s*KW-RUNTIME-DISPATCH-END\s*-->/g)];
  const gaps = [];
  if (starts.length !== 1) gaps.push('dispatch-start-marker');
  if (ends.length !== 1) gaps.push('dispatch-end-marker');
  if (starts.length === 1 && ends.length === 1 && starts[0].index >= ends[0].index) {
    gaps.push('dispatch-marker-order');
  }
  return gaps;
}

function dispatchContractSlice(text) {
  const source = String(text || '');
  const start = source.match(/<!--\s*KW-RUNTIME-DISPATCH-START\s*-->/);
  const end = source.match(/<!--\s*KW-RUNTIME-DISPATCH-END\s*-->/);
  if (!start || !end || start.index >= end.index) return '';
  return source.slice(start.index, end.index + end[0].length);
}

function dispatchContractGaps(text) {
  const gaps = dispatchMarkerGaps(text);
  const fullBlock = dispatchContractSlice(text);
  const block = fullBlock.split(/<!--\s*KW-RUNTIME-DELEGATION-START\s*-->/)[0];
  if (!block) return gaps.concat(['dispatch-contract-missing']);

  const decision = choiceContract(block);
  for (const gap of commonDelegationGaps(decision)) gaps.push(gap);
  const prose = normalizedProse(block).toLowerCase();
  if (!(prose.includes('capability_gap') && prose.includes('specific'))) {
    gaps.push('specific-capability-gap');
  }
  if (!(/generic route\s+impersonat\w*.*named role/.test(prose)
      || /(?:never|not)\s+.*impersonat\w*.*named role/.test(prose))) {
    gaps.push('no-impersonation');
  }
  return gaps;
}

function stringLeaves(value, prefix = [], out = []) {
  if (typeof value === 'string') {
    out.push({ path: prefix, value });
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, item] of Object.entries(value)) stringLeaves(item, prefix.concat(key), out);
  return out;
}

function replaceAtPath(value, targetPath, replacement, prefix = []) {
  if (prefix.length === targetPath.length) return replacement;
  if (Array.isArray(value)) {
    return value.map((item, index) => targetPath[prefix.length] === String(index)
      ? replaceAtPath(item, targetPath, replacement, prefix.concat(String(index)))
      : item);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    targetPath[prefix.length] === key
      ? replaceAtPath(item, targetPath, replacement, prefix.concat(key))
      : item,
  ]));
}

const CURSOR_HOST_CATALOG_VARIATION = Object.freeze([
  /other cursor hosts/, /host-dependent.*catalog/, /catalog.*var(?:y|ies).*host/,
  /different cursor hosts/,
]);
const CURSOR_REPORTED_ROUTE_ONLY = Object.freeze([
  /use only .*this host.*report/, /only .*currently reported/, /route.*when .*host.*reports/,
]);

function runtimeDelegationGaps(runtime, text) {
  const prose = normalizedProse(text).toLowerCase();
  const gaps = [];
  const needs = (name, alternatives) => {
    if (!alternatives.some(pattern => pattern.test(prose))) gaps.push(name);
  };

  // Runtime adapters own only runtime-specific facts. The universal item-local judgment, honest
  // fallback, capability-gap, and no-impersonation contract is checked once in the marked shared
  // dispatch block below; requiring every adapter paragraph to repeat it was both redundant and
  // incompatible with the compact generated surfaces.
  // Lookup scope, dispatch carrier, and the three tier bindings are runtime facts. ADR 0019 is the
  // oracle for the tier cells; these tokens deliberately specify results, not sentence wording.
  const runtimeNeeds = {
    claude: [
      ['lookup', [/\.claude\/agents\//]],
      ['carrier', [/\bagent\b.*subagent_type|subagent_type.*\bagent\b/]],
      ['standard-tier', [/standard.*sonnet|sonnet.*standard/]],
      ['reasoning-tier', [/reasoning.*opus|opus.*reasoning/]],
      ['heavy-tier', [/heavy.*fable|fable.*heavy/]],
      ['effort-boundary', [/runtime(?:'s)? default effort|effort.*not pinned|no .*effort pin/]],
    ],
    codex: [
      ['registration-lookup', [/\.codex\/config\.toml/]],
      ['profile-lookup', [/\.codex\/agents\/kaola-workflow\/<role>\.toml/]],
      ['carrier', [/spawn_agent.*agent_type|agent_type.*spawn_agent/]],
      ['standard-tier', [/standard.*gpt-5\.6-luna.*max|gpt-5\.6-luna.*max.*standard/]],
      ['reasoning-tier', [/reasoning.*gpt-6-astra.*medium|gpt-6-astra.*medium.*reasoning/]],
      ['heavy-tier', [/heavy.*gpt-6-astra.*high|gpt-6-astra.*high.*heavy/]],
    ],
    opencode: [
      ['lookup', [/\.opencode\/agents\//]],
      ['carrier', [/\btask\b.*subagent_type|subagent_type.*\btask\b/]],
      ['standard-tier', [/standard.*session model|session model.*standard/]],
      ['reasoning-tier', [/reasoning.*per-role override|per-role override.*reasoning/]],
      ['heavy-tier', [/heavy.*classif(?:y|ies|ied).*reasoning|reasoning.*heavy/]],
    ],
    kimi: [
      ['lookup', [/\.kimi-code\/agents\//, /kimi_code_home.*agents/]],
      ['carrier', [/\bagent(?:swarm)?\b.*subagent_type|subagent_type.*\bagent(?:swarm)?\b/]],
      ['standard-tier', [/standard.*session inherit|session inherit.*standard/]],
      ['reasoning-tier', [/reasoning.*session inherit|session inherit.*reasoning/]],
      ['heavy-tier', [/heavy.*session inherit|session inherit.*heavy/]],
    ],
    grok: [
      ['lookup', [/\.grok\/agents\//]],
      ['carrier', [/spawn_subagent.*subagent_type|subagent_type.*spawn_subagent/]],
      ['standard-tier', [/standard.*inherit.*medium|medium.*inherit.*standard/]],
      ['reasoning-tier', [/reasoning.*inherit.*high|high.*inherit.*reasoning/]],
      ['heavy-tier', [/heavy.*inherit.*xhigh|xhigh.*inherit.*heavy/]],
    ],
    cursor: [
      ['lookup', [/\.cursor\/agents\//]],
      ['carrier', [/task.*flat [`]?subagent_type|flat [`]?subagent_type.*task/]],
      ['standard-tier', [/standard.*grok-4\.6.*medium|grok-4\.6.*medium.*standard/]],
      ['reasoning-tier', [/reasoning.*grok-4\.6.*high|grok-4\.6.*high.*reasoning/]],
      ['heavy-tier', [/heavy.*grok-4\.6.*xhigh|grok-4\.6.*xhigh.*heavy/]],
      ['exact-tier-post-resolution', [/exact-tier requirement.*post-resolution assertion/]],
      ['generic-model-not-gap', [/generic task model enum.*not a named-profile capability gap/]],
      ['provider-evidence', [/provideroptions\.cursor\.modelname.*provider evidence/]],
      ['provider-not-call-shape', [/subagenttype\.custom\.name.*provider encoding.*not controller call shape/]],
      ['current-task-catalog', [/live task (?:catalog|enum)/, /live catalog/]],
      ['host-catalog-variation', [/cli, app local, and app cloud are separate hosts/]],
      ['reported-route-only', CURSOR_REPORTED_ROUTE_ONLY],
      ['cloud-save-before-gap', [/cloud requires installation in its environment setup.*user-saved build.*new top-level agent.*same repository/]],
      ['omit-model-when-named', [/must omit the per-call [`]?model/]],
      ['no-invented-fields', [/send only fields it exposes/]],
      ['named-catalog-evidence', [/app 3\.17\.21.*saved cloud build.*all 14 names.*implementer/]],
    ],
    zcode: [
      ['lookup', [/(?:~\/|\$\{?zcode_home[^ ]*).*\.zcode\/agents\//,
        /zcode_home.*agents\//, /user.scope.*\.zcode\/agents\//]],
      ['carrier', [/\bagent\b.*subagent_type|subagent_type.*\bagent\b/, /\bagent\b.*@.*dispatch/]],
      ['standard-tier', [/standard.*glm-5\.3.*thoughtlevel.*high|glm-5\.3.*high.*standard/]],
      ['reasoning-tier', [/reasoning.*glm-5\.3.*thoughtlevel.*max|glm-5\.3.*max.*reasoning/]],
      ['heavy-tier', [/heavy.*glm-5\.3.*thoughtlevel.*max|glm-5\.3.*max.*heavy/]],
    ],
  };
  for (const [name, alternatives] of runtimeNeeds[runtime] || []) needs(name, alternatives);
  if (runtime === 'codex' && /installed\s+`?agents\.toml`?|find[^.]{0,120}\bagents\.toml\b/.test(prose)) {
    gaps.push('retired-agents-toml-lookup');
  }
  return gaps;
}

function freshRoutingCarriers(topic) {
  const routing = require('./generate-routing-surfaces.js');
  const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
  const additive = {
    opencode: require('./sync-opencode-edition.js'),
    kimi: require('./sync-kimi-edition.js'),
    grok: require('./sync-grok-edition.js'),
    cursor: require('./sync-cursor-edition.js'),
    zcode: require('./sync-zcode-edition.js'),
  };
  const carriers = [];
  for (const row of routing.GENERATED_SURFACES.filter(candidate => candidate.topic === topic)) {
    const skeleton = routing.loadSkeleton(row.skeleton, row.topic);
    const content = routing.renderSkeleton(
      skeleton, { surface_type: row.surface_type, forge: row.forge }, { slots: SLOTS, splices: SPLICES });
    if (row.surface_type === 'skill') {
      carriers.push({ runtime: 'codex', forge: row.forge, topic, label: row.path, content });
      continue;
    }
    carriers.push({ runtime: 'claude', forge: row.forge, topic, label: row.path, content });
    const basename = routing.TOPICS[topic].command_basename;
    for (const [runtime, edition] of Object.entries(additive)) {
      const rendered = runtime === 'opencode'
        ? edition.renderCommand(content, row.forge, `${runtime}/${row.forge}/${basename}`)
        : edition.renderCommand(content, basename, row.forge);
      carriers.push({
        runtime,
        forge: row.forge,
        topic,
        label: `${runtime}/${row.forge}/${basename}`,
        content: rendered,
      });
    }
  }
  return carriers;
}

// A1 — root project instructions are Agent-owned local facts, not a universal runtime template.
const agentsRoot = read('AGENTS.md') || '';
const claudeRoot = read('CLAUDE.md') || '';
for (const [label, token] of [
  ['project identity', 'Kaola-Workflow'],
  ['Mission List design record', 'docs/decisions/0017-the-mission-list.md'],
  ['claim implementation', 'scripts/kaola-workflow-claim.js'],
  ['validation transaction', 'scripts/kaola-workflow-run-chains.js'],
  ['sink implementation', 'scripts/kaola-workflow-sink-merge.js'],
  ['focused validation', 'npm test'],
  ['integration validation', 'node scripts/simulate-workflow-walkthrough.js'],
]) {
  assert(agentsRoot.includes(token), `A1: root AGENTS.md retains verified local ${label}`);
}
assert(!/READ CLAUDE\.md|single canonical source[^\n]*CLAUDE\.md|only to direct you there/i.test(agentsRoot),
  'A1: root AGENTS.md is the project contract, not an AGENTS→CLAUDE redirect');
assert(!/KW-AGENTS-MANAGED|^##\s+First Principles\s*$/mi.test(agentsRoot),
  'A1: root AGENTS.md has no managed wrapper or duplicated machine-global First Principles');

assert(claudeRoot.split(/\r?\n/).filter(line => line.trim() === '@AGENTS.md').length === 1
    && /\bClaude\b/i.test(claudeRoot),
  'A2: root CLAUDE.md is a Claude overlay that explicitly bridges to AGENTS.md');
const duplicatedUniversalSections = [
  'Project Overview', 'Mission List', 'Durable State Contract', 'First Principles',
  'Non-Negotiable Rules',
].filter(heading => new RegExp('^##\\s+' + heading.replace(/ /g, '\\s+'), 'mi').test(claudeRoot));
assert(duplicatedUniversalSections.length === 0,
  'A2: CLAUDE.md duplicates no universal section — duplicated '
  + JSON.stringify(duplicatedUniversalSections));
assert(!/KW-CLAUDE-OVERLAY-MANAGED/.test(claudeRoot),
  'A2: CLAUDE.md has no script-owned overlay wrapper');

// A3 — workflow-init is a project-only consumer of a compatible global contract.
const initSource = read('templates/routing/init.skeleton.md') || '';
assert(/for file in AGENTS\.md CLAUDE\.md/.test(initSource)
    && !/git ls-files|find \. -name AGENTS\.md/.test(initSource),
  'A3: workflow-init reads root owner instructions without Git-index or repository-wide discovery');
for (const [label, pattern] of [
  ['user ownership', /user-authored/i],
  ['Agent ownership', /Agent owns the meaning and prose of project instructions/i],
  ['repository grounding', /repository facts/i],
  ['runtime-loaded global authority', /Global Workflow Contract already loaded by the runtime/i],
  ['consent before rewrite', /Before changing an existing user-authored or owner-authored instruction file/i],
  ['fresh-session verification', /fresh top-level\s+Agent\/session/i],
  ['no formatting protocol', /no required headings, order, wording,\s+bytes, or length/i],
  ['runtime-install boundary', /does not locate, execute, install, or repair runtime\/global machinery/i],
]) {
  assert(pattern.test(initSource), `A3: workflow-init carries the ${label} outcome`);
}

// #1037/#1039: workflow-init owns portable repository instructions only. It may
// explain that installers own native capabilities, but no executable block may
// invoke a runtime/global installer. Inspect the canonical source and every
// tracked rendered init consumer; generated agreement with the wrong command is
// not evidence. The in-memory injected command proves the detector is armed.
function runtimeInstallInvocations(text) {
  const matches = [];
  for (const [index, line] of String(text || '').split(/\r?\n/).entries()) {
    if (/^\s*#/.test(line)) continue;
    if (/^\s*(?:node|bash|sh|zsh)\s+[^\n]*(?:install(?:-all|-\w+)?[^\s"']*|install-[^\s"']+)[^\n]*--global\b/i.test(line)
        || /^\s*\.\/install-all\.sh\b/.test(line)) {
      matches.push({ line: index + 1, text: line.trim() });
    }
  }
  return matches;
}

const initConsumers = [
  'templates/routing/init.skeleton.md',
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  'plugins/kaola-workflow-gitea/commands/workflow-init.md',
  'plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md',
];
for (const relativePath of initConsumers) {
  const text = read(relativePath);
  assert(typeof text === 'string', `A3[init-install-boundary/${relativePath}]: tracked init surface exists`);
  const invocations = runtimeInstallInvocations(text || '');
  assert(invocations.length === 0,
    `A3[init-install-boundary/${relativePath}]: workflow-init invokes no runtime/global installer — got `
      + JSON.stringify(invocations));
}
const cleanInitConsumer = read('commands/workflow-init.md') || '';
assert(runtimeInstallInvocations(cleanInitConsumer + [
  '', '```bash', 'node "$plugin_root/scripts/install-codex-agent-profiles.js" --global', '```', '',
].join('\n')).length === 1,
'A3[init-install-boundary] mutation RED: an injected global runtime installer invocation is detected');
for (const retiredName of [
  ['kaola-workflow-project-instruction', 'templates.js'].join('-'),
  ['kaola-workflow-project', 'instructions.js'].join('-'),
]) {
  assert(!fs.existsSync(path.join(ROOT, 'scripts', retiredName)),
    `A3: retired project-prompt artifact is absent — ${retiredName}`);
}
assert(!/KW-(?:AGENTS-MANAGED|CLAUDE-OVERLAY-MANAGED)/.test(initSource),
  'A3: workflow-init contains no retired project-prompt ownership marker');

{
  const nextSource = read('templates/routing/next.skeleton.md') || '';
  const finalizeSource = read('templates/routing/finalize.skeleton.md') || '';
  const routing = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
  const compactRecoverySources = ['claude', 'codex', 'grok', 'cursor']
    .map(runtime => routing.renderCompactRecoveryPrompt(runtime, 'github'));
  const surfaces = [nextSource, finalizeSource];
  const norm = text => String(text).replace(/\s+/g, ' ').replace(/\\'/g, "'");
  const teachesSelectorAsMission = text => {
    const n = norm(text);
    return /is itself a mission/i.test(n) && !/not by itself a mission/i.test(n);
  };
  const teachesImmediateBlocked = text => {
    const n = norm(text);
    return /return `BLOCKED` merely because/i.test(n)
      && !/Do not return `BLOCKED` merely because/i.test(n);
  };
  const teachesTestOwnerRepair = text =>
    /(?:implementer|test author) may delete, weaken, or reinterpret that acceptance to pass/i.test(norm(text));
  assert(surfaces.every(text => !teachesSelectorAsMission(text)),
    'A3[mission-granularity]: shipped guidance does not teach one selector as a mission');
  assert(!teachesImmediateBlocked(nextSource),
    'A3[mission-granularity]: next does not require an immediate BLOCKED on same-custody work');
  assert(surfaces.every(text => !teachesTestOwnerRepair(text)),
    'A3[mission-granularity]: shipped guidance does not let the test owner silently repair production');
  assert(teachesSelectorAsMission(norm(nextSource).replace(
    /does not by itself create a mission/g, 'is itself a mission')),
    'A3[mission-granularity] mutation RED: teaching one selector as a mission is detected');
  assert(teachesImmediateBlocked(norm(nextSource).replace(/Do not return `BLOCKED` merely because/g,
    'return `BLOCKED` merely because')),
  'A3[mission-granularity] mutation RED: requiring immediate BLOCKED on same-custody work is detected');
  assert(teachesTestOwnerRepair(norm(nextSource).replace(
    /An implementer may not delete, weaken, or reinterpret that acceptance to pass\./,
    'An implementer may delete, weaken, or reinterpret that acceptance to pass.')),
  'A3[mission-granularity] mutation RED: silent production repair by the test/implementer owner is detected');

  const retired = /Repair or re-review work (?:must append|appends) (?:a )?new mission(?: rather than rewriting the closed item)?\./i;
  const keepsFinalizationOutsideList = text => {
    const n = norm(text);
    return /Finalization, Issue closure, archive, and sink are not Mission List items\./i.test(n)
      && /The last run mission establishes readiness for finalization\./i.test(n)
      && /The finalization summary, closure evidence, archive state, and sink receipt own the transaction's truth\./i.test(n);
  };
  const keepsAttemptsInsideOutcome = text => {
    const n = norm(text);
    return !retired.test(n)
      && /A failed command, intermediate finding, repair attempt, or review round does not by itself create a mission\./i.test(n)
      && /Keep working within the current promised outcome while custody and causal boundary remain unchanged\./i.test(n)
      && /Append a mission only for a new recoverable outcome that changes custody or for a newly discovered independent causal class\./i.test(n);
  };
  const issue1042OperationSources = [nextSource, finalizeSource];
  const globalContract = read('templates/global/kaola-workflow-global.md') || '';
  const globalLifecycleBoundary = text => {
    const n = norm(text);
    return /Finalization, issue closure, archive, and sink are not Mission List items/i.test(n)
      && /last mission[^.]*readiness/i.test(n)
      && /lifecycle records[^.]*final truth/i.test(n);
  };
  const globalAttemptBoundary = text => {
    const n = norm(text);
    return /A mission is a recoverable outcome, not a specification, selector/i.test(n)
      && /A failed command, intermediate finding, repair attempt, or review round does not create another mission/i.test(n)
      && /Append a mission only for a new recoverable outcome with new custody or a newly discovered independent causal class/i.test(n);
  };
  assert(globalLifecycleBoundary(globalContract)
      && issue1042OperationSources.every(text => !/Finalization[^.]*are Mission List items/i.test(norm(text))),
    'A3[issue-1042]: global authority keeps lifecycle work outside Mission List and operations do not contradict it');
  assert(issue1042OperationSources.every(text => !retired.test(norm(text))),
    'A3[issue-1042]: next/finalize reject the old absolute repair/re-review append rule');
  assert(globalAttemptBoundary(globalContract)
      && issue1042OperationSources.every(text => !/repair or re-review work must append/i.test(norm(text))),
    'A3[issue-1042]: global authority keeps attempts inside the causal class and operations do not restore attempt missions');
  assert(compactRecoverySources.every(text => text.split(globalContract.trim()).length - 1 === 1),
    'A3[issue-1042]: every compact prompt reloads the exact global contract once');
  assert(compactRecoverySources.every(text => globalAttemptBoundary(text)
    && globalLifecycleBoundary(text)),
    'A3[issue-1042]: compact recovery retains mission granularity and lifecycle boundary through the global source');
  const compactSurfaceNorms = compactRecoverySources.map(norm);
  assert(compactSurfaceNorms.every(text => /a completed item and (?:its )?result are immutable/i.test(text)
    && /one dispatch has one result/i.test(text)),
    'A3[issue-1042]: generated compact prompts retain immutability and one-dispatch/one-result invariants');
  const fixture = 'Finalization, Issue closure, archive, and sink are not Mission List items. The last run mission establishes readiness for finalization. The finalization summary, closure evidence, archive state, and sink receipt own the transaction\'s truth. A failed command, intermediate finding, repair attempt, or review round does not by itself create a mission. Keep working within the current promised outcome while custody and causal boundary remain unchanged. Append a mission only for a new recoverable outcome that changes custody or for a newly discovered independent causal class.';
  assert(keepsFinalizationOutsideList(fixture) && keepsAttemptsInsideOutcome(fixture),
    'A3[issue-1042] mutation setup: canonical boundary fixture is accepted');
  assert(!keepsFinalizationOutsideList(fixture.replace('are not', 'are')),
    'A3[issue-1042] mutation RED: finalization inside Mission List is rejected');
  assert(!keepsAttemptsInsideOutcome(fixture.replace('does not by itself', 'must')),
    'A3[issue-1042] mutation RED: one mission per repair/re-review attempt is rejected');
  const compactRecoveryMutationSubject = compactRecoverySources[0] || '';
  assert(!globalAttemptBoundary(compactRecoveryMutationSubject.replace(
    'not a specification, selector', 'a specification and selector')),
  'A3[issue-1042] compact-prompt mutation RED: selector-level mission teaching is rejected');
  assert(!/Finalization, issue closure, archive, and sink are not Mission List items/i.test(
    compactRecoveryMutationSubject.replace('are not Mission List items', 'are Mission List items')),
  'A3[issue-1042] compact-prompt mutation RED: finalization inside Mission List is rejected');
}

// The retired byte migrator and canonical project template are gone. Exercise every freshly
// rendered runtime/forge init carrier as the subject: each must keep the mechanical safety
// boundaries while leaving repository-specific meaning to the Agent.
const retiredPromptArtifacts = [
  ...['kaola-workflow-project-instruction-templates.js',
    'kaola-workflow-project-instructions.js'].map(name => `scripts/${name}`),
  ...['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea']
    .flatMap(plugin => ['kaola-workflow-project-instruction-templates.js',
      'kaola-workflow-project-instructions.js'].map(name => `plugins/${plugin}/scripts/${name}`)),
];
for (const relativePath of retiredPromptArtifacts) {
  assert(!fs.existsSync(path.join(ROOT, relativePath)),
    `A3[retirement]: script-owned project prompt artifact is absent — ${relativePath}`);
}

const initCarriers = freshRoutingCarriers('init');
assert(initCarriers.length === 21,
  `A3[carriers]: all 21 runtime/forge workflow-init renders are covered — got ${initCarriers.length}`);
for (const carrier of initCarriers) {
  const label = `${carrier.runtime}/${carrier.forge} (${carrier.label})`;
  const text = carrier.content;
  assert(!/kaola-workflow-project-instruction(?:-templates|s)\.js|KW-(?:AGENTS-MANAGED|CLAUDE-OVERLAY-MANAGED)/.test(text),
    `A3[carriers/${label}]: no retired project-prompt owner remains`);
  assert(/Agent owns the meaning and prose of project instructions/.test(text)
      && /repository facts/.test(text)
      && /Global Workflow Contract already loaded by the runtime/.test(text)
      && /Before changing an existing user-authored or owner-authored instruction file/.test(text),
    `A3[carriers/${label}]: Agent ownership, grounding, and consent remain load-bearing`);
  assert(/fresh top-level\s+Agent\/session/.test(text)
      && /not a prompt-write lock/.test(text),
    `A3[carriers/${label}]: active-run warning and fresh-session validation remain explicit`);
  assert(/no required headings, order, wording,\s+bytes, or length/i.test(text)
      && !/global_contract_schema\s*:|decision_required|active_run_preserved/.test(text),
    `A3[carriers/${label}]: no canonical prompt bytes, schema, or migrator verdict remains`);
  assert(runtimeInstallInvocations(text).length === 0,
    `A3[carriers/${label}]: workflow-init remains read-only toward runtime/global installation`);
}

// A3-single-source — workflow-init may describe the helper-owned reconciliation contract, but it
// must not remain a second authoring surface for the universal AGENTS template. Otherwise the prose
// template and the distribution module can drift while every generated runtime surface still agrees
// with the wrong copy. The actual installed-byte assertion above pins the one allowed source.
for (const relativePath of [
  'templates/routing/init.skeleton.md',
  'templates/routing/required-blocks.js',
  'templates/routing/slots.js',
]) {
  const text = read(relativePath) || '';
  const embedsUniversalTemplate = [
    '## Project Snapshot',
    '## Commands',
    '## Non-Negotiable Rules',
    '## First Principles',
    '## Kaola-Workflow',
  ].every(heading => text.includes(heading));
  assert(!/KW-AGENTS-TEMPLATE-(?:START|END)/.test(text),
    `A3[single-source/${relativePath}]: workflow-init authoring surfaces carry no independent `
      + 'universal AGENTS template envelope');
  assert(!embedsUniversalTemplate,
    `A3[single-source/${relativePath}]: workflow-init authoring surfaces do not duplicate the `
      + 'canonical universal heading set');
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
const intentRosters = rolesByIntent(roleContracts);
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
  if (runtime === 'cursor') {
    assert(entries.every(entry => entry.adapter && entry.adapter.surfaces
      && entry.adapter.surfaces.cli && entry.adapter.surfaces.app
      && !entry.adapter.install_scope
      && entry.adapter.surfaces.app.execution_hosts
      && entry.adapter.surfaces.app.execution_hosts.local
      && entry.adapter.surfaces.app.execution_hosts.local.global_discovery === 'unknown'
      && entry.adapter.surfaces.app.execution_hosts.cloud
      && entry.adapter.surfaces.app.execution_hosts.cloud.global_discovery === 'unsupported'
      && entry.adapter.surfaces.app.execution_hosts.cloud.required_project_materialization === 'yes'
      && entry.adapter.surfaces.app.execution_hosts.cloud.remote_injection === 'agent_confirmed_cloud_environment_setup_install_and_save'
      && entry.adapter.surfaces.app.execution_hosts.cloud.named_catalog === 'project_custom_from_saved_environment_build'
      && entry.adapter.surfaces.app.execution_hosts.cloud.reload === 'new_same_repository_cloud_parent_after_environment_save'
      && entry.adapter.surfaces.cli.execution_hosts
      && entry.adapter.surfaces.cli.execution_hosts.local
      && entry.adapter.surfaces.cli.execution_hosts.local.required_project_materialization === 'yes'),
      'A6[cursor]: surfaces split CLI from App and keep App-local discovery unknown');
  } else {
    assert(entries.every(entry => {
      const scope = entry.adapter && entry.adapter.install_scope;
      return scope && scope.global_discovery === 'supported'
        && scope.required_project_materialization === 'no'
        && scope.ambient_repository_write === false
        && typeof scope.evidence_status === 'string'
        && !entry.adapter.surfaces;
    }), `A6[${runtime}]: adapter declares global-first install_scope with no ambient repo write`);
  }
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

// #1049 — the requested Codex tier change is source-owned and must reach every tracked carrier.
// Keep this proof on the generated subject: a copied fixture or a source-only assertion would
// allow stale Next, Finalize, or compact files to ship while the adapter map looks correct.
{
  const codexEntries = adapterView.entries.filter(entry => entry.runtime === 'codex');
  assert(codexEntries.length === 3
      && JSON.stringify(codexEntries.map(entry => entry.name).sort())
        === JSON.stringify(['codex-gitea', 'codex-github', 'codex-gitlab']),
    'A1049/source: exactly the GitHub, GitLab, and Gitea Codex adapters are covered');

  const sourceTierGaps = codexEntries.flatMap(entry => {
    const capabilities = capabilityObject(entry.adapter) || {};
    const guidance = capabilities.delegation_guidance || {};
    const tiers = guidance.tiers && typeof guidance.tiers === 'object' ? guidance.tiers : {};
    const tierText = Object.values(tiers).join('; ');
    const gaps = codexTierDefaultGaps(tierText);
    for (const tier of Object.keys(CODEX_TIER_DEFAULTS)) {
      if (!capabilities.intent_mapping || capabilities.intent_mapping[tier] !== 'inherit') {
        gaps.push(`${tier}-inheritance`);
      }
    }
    return gaps.map(gap => `${entry.name}/${gap}`);
  });
  assert(sourceTierGaps.length === 0,
    'A1049/source: Codex adapters carry Luna/max, Astra/medium, Astra/high and inherit model — gaps '
      + JSON.stringify(sourceTierGaps));

  const explicitModelProfiles = profiles
    .filter(profile => profile.runtime === 'codex')
    .filter(profile => /^\s*model\s*[:=]/mi.test(String(profile.content || '')))
    .map(profileKey);
  assert(explicitModelProfiles.length === 0,
    'A1049/profiles: all 42 Codex role profiles remain model-free and inherit the native host model — '
      + JSON.stringify(explicitModelProfiles));

  let routing = null;
  let freshOperationCarriers = [];
  let freshCompactCarriers = [];
  try {
    routing = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
    freshOperationCarriers = ['next', 'finalize'].flatMap(topic =>
      freshRoutingCarriers(topic).filter(carrier => carrier.runtime === 'codex'));
    freshCompactCarriers = ['github', 'gitlab', 'gitea'].map(forge => ({
      label: `codex/${forge}/compact-recovery`,
      content: routing.renderCompactRecoveryPrompt('codex', forge),
    }));
  } catch (error) {
    assert(false, 'A1049/render: fresh Codex next/finalize/compact carriers render — ' + error.message);
  }

  const operationGaps = freshOperationCarriers.flatMap(carrier =>
    codexTierDefaultGaps(carrier.content).map(gap => `${carrier.label}/${gap}`));
  assert(freshOperationCarriers.length === 6 && operationGaps.length === 0,
    'A1049/render: fresh Codex next/finalize carriers across all three forges carry the requested '
      + 'tier defaults — gaps ' + JSON.stringify(operationGaps));

  const compactGaps = freshCompactCarriers.flatMap(carrier =>
    codexTierDefaultGaps(carrier.content).map(gap => `${carrier.label}/${gap}`));
  assert(freshCompactCarriers.length === 3 && compactGaps.length === 0,
    'A1049/render: fresh Codex compact carriers across all three forges carry the requested tier '
      + 'defaults — gaps ' + JSON.stringify(compactGaps));

  const trackedRows = routing
    ? [
      ...routing.GENERATED_SURFACES.filter(row => row.surface_type === 'skill'
        && ['next', 'finalize'].includes(row.topic)),
      ...routing.RUNTIME_RECOVERY_SURFACES.filter(row => row.runtime === 'codex'),
    ]
    : [];
  const trackedGaps = trackedRows.flatMap(row => {
    const content = read(row.path);
    if (typeof content !== 'string') return [`${row.path}/missing`];
    return codexTierDefaultGaps(content).map(gap => `${row.path}/${gap}`);
  });
  assert(trackedRows.length === 9 && trackedGaps.length === 0,
    'A1049/tracked: generated Codex next/finalize/compact bytes across all three forges carry the '
      + 'requested tier defaults — gaps ' + JSON.stringify(trackedGaps));
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
    const originalIntent = intentEntry.adapter.capabilities.intent_mapping.standard;
    const replacementIntent = ['reasoning', 'heavy']
      .map(intent => intentEntry.adapter.capabilities.intent_mapping[intent])
      .find(value => value !== originalIntent);
    assert(!!replacementIntent,
      `A10-native[${runtime}]: adapter exposes a second valid effort value for mutation`);
    if (!replacementIntent) continue;
    intentEntry.adapter.capabilities.intent_mapping.standard = replacementIntent;
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
    assert(mutatedStandard.length > 0 && mutatedStandard.every(profile => {
      const fields = parseFrontmatter(profile.content).fields;
      return runtime === 'cursor'
        ? String(fields.model || '').includes(`effort=${replacementIntent}`)
        : fields.thoughtLevel === replacementIntent;
    }),
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

// A10-delegation-routing — #1035. The observed Cursor run turned two item-local facts into a
// run-wide inline posture. Acceptance has two deliberately separate layers:
//
//   (1) one runtime-neutral decision contract, shared byte-for-byte from the AGENTS axiom through
//       workflow-next, finalize, and every fresh runtime render; and
//   (2) runtime-native execution guidance rendered from that runtime's adapter, because a generic
//       sentence cannot tell Cursor, Codex, Kimi, or any other host which child route it actually
//       exposes or where it discovers the named profile.
//
// Full native paragraphs are NOT required to match across runtimes. Only the common invariant does.
// The adapter field layout is also not an oracle: the production API receives an adapter object,
// and the mutation below proves some adapter-owned scalar reaches the rendered guidance.
{
  const axioms = read('templates/axioms.md') || '';
  const common = choiceContract(axioms);
  const commonGaps = commonDelegationGaps(common);
  assert(common.length > 0,
    'A10-delegation/common: templates/axioms.md owns the dispatch-vs-inline decision contract');
  assert(!commonGaps.includes('per-item-reset'),
    'A10-delegation/common: dispatch-vs-inline is re-evaluated for every mission item and one item establishes no run-wide default');
  assert(!commonGaps.includes('exact-role-is-not-no-dispatch'),
    'A10-delegation/common: exact named-role absence is explicitly not proof that all native subagent dispatch is unavailable');
  assert(!commonGaps.includes('production-owner-scope'),
    'A10-delegation/common: a cohesive production owner is scoped to that production surface and does not absorb research/test/docs/review items');
  assert(codexV2FieldHits(axioms).length === 0,
    'A10-delegation/common: universal axioms carry no Codex V2 task_name/agent_type/message/reasoning_effort/fork_turns call fields');

  const dispatchSource = read('templates/routing/dispatch-contract.md') || '';
  assert(choiceContract(dispatchSource) === common,
    'A10-delegation/common-source: dispatch-contract.md carries the one AGENTS decision wording exactly');
  for (const skeletonPath of [
    'templates/routing/next.skeleton.md',
    'templates/routing/finalize.skeleton.md',
  ]) {
    assert((read(skeletonPath).match(/<!-- SLOT:runtime-dispatch-common -->/g) || []).length === 1,
      `A10-delegation/common-source: ${skeletonPath} consumes the shared dispatch source once`);
  }

  let carriers = [];
  try {
    carriers = [...freshRoutingCarriers('next'), ...freshRoutingCarriers('finalize')];
  } catch (error) {
    assert(false, 'A10-delegation/render: fresh next+finalize runtime carriers render — ' + error.message);
  }
  assert(carriers.length === 42,
    'A10-delegation/render: next+finalize cover 7 runtimes x 3 forges — got ' + carriers.length);

  const renderGuidance = generator && generator.renderRuntimeDelegationGuidance;
  assert(typeof renderGuidance === 'function',
    'A10-delegation/adapter-api: profile generator exposes renderRuntimeDelegationGuidance(adapter)');

  const guidanceByAdapter = new Map();
  if (typeof renderGuidance === 'function') {
    for (const entry of adapterView.entries) {
      let guidance = '';
      try { guidance = String(renderGuidance(entry.adapter) || ''); }
      catch (error) {
        assert(false, `A10-delegation/adapter[${entry.name}]: native guidance renders — ${error.message}`);
      }
      guidanceByAdapter.set(entry.name, guidance);
      const gaps = runtimeDelegationGaps(entry.runtime, guidance);
      assert(guidance.length > 0 && gaps.length === 0,
        `A10-delegation/adapter[${entry.name}]: guidance names its runtime-specific lookup scope, native carrier, and ADR 0019 tier facts — missing ${JSON.stringify(gaps)}`);

      // Mutation reachability without freezing the adapter's field names. Find the longest
      // adapter-owned string that the production guidance actually consumes, replace that scalar
      // in memory, and require the production renderer to expose the changed bytes.
      const consumed = stringLeaves(entry.adapter)
        .filter(leaf => leaf.value.length >= 8 && guidance.includes(leaf.value))
        .sort((a, b) => b.value.length - a.value.length)[0];
      assert(!!consumed,
        `A10-delegation/adapter-mutation[${entry.name}]: rendered guidance consumes an adapter-owned scalar`);
      if (consumed) {
        const marker = `kw-dispatch-mutation-${entry.name}-1035`;
        const mutated = replaceAtPath(clone(entry.adapter), consumed.path, marker);
        let mutatedGuidance = '';
        try { mutatedGuidance = String(renderGuidance(mutated) || ''); }
        catch (error) {
          assert(false, `A10-delegation/adapter-mutation[${entry.name}]: mutated adapter renders — ${error.message}`);
        }
        assert(mutatedGuidance !== guidance && mutatedGuidance.includes(marker),
          `A10-delegation/adapter-mutation[${entry.name}]: adapter mutation reaches its native guidance bytes`);
      }
    }

    // Cursor mutation bite: retain only the facts an agent needs at dispatch time. Detailed host
    // provenance belongs in runtime-capabilities documentation, not repeated prompt prose.
    const cursorEntry = adapterView.entries.find(entry => entry.runtime === 'cursor');
    const cursorGuidance = cursorEntry ? guidanceByAdapter.get(cursorEntry.name) : '';
    if (cursorGuidance) {
      const subject = normalizedProse(cursorGuidance).toLowerCase();
      const hostSeparation = /cli, app local, and app cloud are separate hosts/;
      assert(hostSeparation.test(subject),
        'A10-delegation/cursor-host-mutation: guidance keeps the three Cursor execution hosts separate');
      const collapsedHosts = subject.replace(hostSeparation, 'all cursor products share one host');
      assert(runtimeDelegationGaps('cursor', collapsedHosts).includes('host-catalog-variation'),
        'A10-delegation/cursor-host-mutation: collapsing the three hosts fails acceptance');
      const cloudLifecycle = /cloud requires installation in its environment setup, a tested and user-saved build, then a new top-level agent in the same repository/;
      assert(cloudLifecycle.test(subject),
        'A10-delegation/cursor-cloud-lifecycle-mutation: guidance keeps the Cloud setup, Save, and same-repository handoff');
      const strippedLifecycle = subject.replace(cloudLifecycle,
        'treat the first cloud catalog miss as a capability gap');
      const lifecycleGaps = runtimeDelegationGaps('cursor', strippedLifecycle);
      assert(strippedLifecycle !== subject && lifecycleGaps.includes('cloud-save-before-gap'),
        'A10-delegation/cursor-cloud-lifecycle-mutation: deleting the saved lifecycle fails acceptance');
      const inventedFields = subject.replace('send only fields it exposes',
        'invent unpublished request fields');
      assert(runtimeDelegationGaps('cursor', inventedFields).includes('no-invented-fields'),
        'A10-delegation/cursor-schema-mutation: permitting invented Task fields fails acceptance');
    }

    const codexEntry = adapterView.entries.find(entry => entry.runtime === 'codex');
    const codexGuidance = codexEntry ? guidanceByAdapter.get(codexEntry.name) : '';
    if (codexGuidance) {
      const wrongRegistration = codexGuidance
        .replace(/\.codex\/config\.toml/g, 'agents.toml')
        .replace(/\.codex\/agents\/kaola-workflow\/<role>\.toml/g, 'agents.toml');
      const registrationGaps = runtimeDelegationGaps('codex', wrongRegistration);
      assert(registrationGaps.includes('registration-lookup')
        && registrationGaps.includes('profile-lookup')
        && registrationGaps.includes('retired-agents-toml-lookup'),
      'A10-delegation/codex-lookup-mutation: replacing effective config/profile locators with source-only agents.toml fails discovery acceptance');
    }

    // One adapter render is enough to prove that the generator derives the three tier rosters from
    // the shared behavior authority. Do not demand that every runtime repeat these role names.
    const rosterWitness = guidanceByAdapter.values().next().value || '';
    const rosterGaps = tierRosterGaps(rosterWitness, intentRosters);
    assert(rosterGaps.length === 0,
      `A10-delegation/common-roster: one shared adapter render carries behavior-authority standard/reasoning/heavy membership — missing ${JSON.stringify(rosterGaps)}`);
    if (rosterGaps.length === 0) {
      const missingStandardRole = intentRosters.standard[0];
      const mutatedRoster = rosterWitness.replaceAll(missingStandardRole, 'missing-standard-role');
      assert(tierRosterGaps(mutatedRoster, intentRosters).includes('standard-role-roster'),
        'A10-delegation/roster-mutation RED: deleting one behavior-authority member from the shared tier roster is detected');
    }

  }

  function adapterForCarrier(carrier) {
    if (carrier.runtime === 'codex') {
      return adapterView.entries.find(entry => entry.name === 'codex-' + carrier.forge);
    }
    return adapterView.entries.find(entry => entry.runtime === carrier.runtime);
  }

  for (const carrier of carriers) {
    const gaps = runtimeDelegationGaps(carrier.runtime, carrier.content);
    assert(choiceContract(carrier.content) === common,
      `A10-delegation/carrier[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: fresh render carries the one common item-local decision contract`);
    const contractGaps = dispatchContractGaps(carrier.content);
    assert(contractGaps.length === 0,
      `A10-delegation/contract[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: fresh render carries one complete marked dispatch contract — missing ${JSON.stringify(contractGaps)}`);
    assert(gaps.length === 0,
      `A10-delegation/carrier[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: ${carrier.label} states runtime-specific lookup/carrier/tier semantics — missing ${JSON.stringify(gaps)}`);
    if (carrier.topic === 'next') {
      assert(!RETIRED_RUN_WIDE_INLINE.test(carrier.content),
        `A10-delegation/next-whole-surface[${carrier.runtime}/${carrier.forge}]: ${carrier.label} rejects the retired run-wide "cannot spawn a role agent -> inline" fallback anywhere in the render`);
    }
    if (carrier.topic === 'finalize' && (carrier.runtime === 'claude' || carrier.runtime === 'codex')) {
      const defaultGaps = dispatchDefaultGaps(carrier.runtime, carrier.content, roleContracts);
      assert(defaultGaps.length === 0,
        `A10-delegation/finalize-defaults[${carrier.runtime}/${carrier.forge}]: concrete tdd/build/docs calls apply their behavior-derived default model${carrier.runtime === 'codex' ? '+effort' : ''} while preserving task-sensitive overrides — missing ${JSON.stringify(defaultGaps)}`);
    }
    if (carrier.runtime !== 'codex') {
      assert(codexV2FieldHits(carrier.content).length === 0,
        `A10-delegation/codex-v2-scope[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: Codex V2 call fields do not leak into universal or another runtime's render`);
    }
    if (typeof renderGuidance === 'function') {
      const entry = adapterForCarrier(carrier);
      const guidance = entry ? guidanceByAdapter.get(entry.name) : '';
      assert(!!entry && guidance.length > 0
        && normalizedProse(carrier.content).includes(normalizedProse(guidance)),
      `A10-delegation/carrier-source[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: fresh carrier includes its exact adapter-rendered native guidance`);
    }
  }

  const dispatchWitness = carriers.find(carrier => carrier.runtime === 'claude'
    && carrier.forge === 'github' && carrier.topic === 'next');
  if (dispatchWitness) {
    const withoutStart = dispatchWitness.content.replace(
      /<!--\s*KW-RUNTIME-DISPATCH-START\s*-->/, '');
    assert(dispatchContractGaps(withoutStart).includes('dispatch-start-marker'),
      'A10-delegation/dispatch-marker-mutation RED: deleting the shared dispatch start marker is detected');

    const withoutCapabilityGap = dispatchWitness.content.replace(
      /record the\s+specific `capability_gap`,\s+and/i, 'record a problem, and');
    assert(withoutCapabilityGap !== dispatchWitness.content
      && dispatchContractGaps(withoutCapabilityGap).includes('specific-capability-gap'),
    'A10-delegation/capability-gap-mutation RED: removing the specific capability_gap fallback is detected');

    const withoutIdentityBoundary = dispatchWitness.content.replace(
      /Never let a generic route\s+impersonate a\s+custody-bearing named role\./i,
      'Use a generic route whenever it is convenient.');
    assert(withoutIdentityBoundary !== dispatchWitness.content
      && dispatchContractGaps(withoutIdentityBoundary).includes('no-impersonation'),
    'A10-delegation/impersonation-mutation RED: removing the generic-route identity boundary is detected');
  }

  const codexFinalize = carriers.find(carrier => carrier.runtime === 'codex'
    && carrier.forge === 'github' && carrier.topic === 'finalize');
  if (codexFinalize && concreteDispatchBlocks('codex', codexFinalize.content).length > 0) {
    // Only concrete calls that the subject actually renders are in scope. The routing contract
    // may describe the host schema without shipping a fixed tdd/build/docs pipeline.
    const blocks = concreteDispatchBlocks('codex', codexFinalize.content);
    const validTarget = blocks.find(block => {
      const role = quotedCallField(block, 'agent_type');
      return role && dispatchBinding('codex', role, roleContracts)
        && quotedCallField(block, 'task_name') !== null;
    });
    if (validTarget) {
      const role = quotedCallField(validTarget, 'agent_type');
      const deletedText = codexFinalize.content.replace(validTarget,
        validTarget.replace(/^\s*task_name\s*=.*\n/m, ''));
      const deletedGaps = dispatchDefaultGaps('codex', deletedText, roleContracts);
      assert(deletedText !== codexFinalize.content
        && deletedGaps.some(gap => gap.endsWith('-task-name-required')),
      `A10-delegation/codex-task-name-mutation RED[${role}]: deleting task_name from an actual valid V2 call is detected`);
    }
  }

  // Concrete-call mutation bites are conditional on the subject becoming compliant: corrupt one
  // role's call-carried default while leaving the tier table and prose untouched. This catches the
  // review's believable near miss where guidance describes the right default but the executable
  // call still inherits or selects the wrong child configuration.
  for (const runtime of ['claude', 'codex']) {
    const subject = carriers.find(carrier => carrier.runtime === runtime
      && carrier.forge === 'github' && carrier.topic === 'finalize');
    if (!subject || dispatchDefaultGaps(runtime, subject.content, roleContracts).length !== 0) continue;
    const target = concreteDispatchBlocks(runtime, subject.content).find(block => {
      const role = quotedCallField(block, runtime === 'codex' ? 'agent_type' : 'subagent_type');
      return dispatchBinding(runtime, role, roleContracts);
    });
    if (!target) continue;
    const role = quotedCallField(target, runtime === 'codex' ? 'agent_type' : 'subagent_type');
    const binding = dispatchBinding(runtime, role, roleContracts);
    const corrupted = runtime === 'claude'
      ? subject.content.replace(target, target.replace(
        new RegExp(`model\\s*=\\s*["']${binding.model.replace(/\./g, '\\.') }["']`),
        `model="${binding.model === 'sonnet' ? 'opus' : 'sonnet'}"`))
      : subject.content.replace(target, target.replace(
        new RegExp(`reasoning_effort\\s*=\\s*["']${binding.effort}["']`),
        `reasoning_effort="${binding.effort === 'max' ? 'low' : 'max'}"`));
    const corruptedGaps = dispatchDefaultGaps(runtime, corrupted, roleContracts);
    assert(corrupted !== subject.content
      && corruptedGaps.some(gap => gap.endsWith(runtime === 'claude'
        ? '-default-model' : '-default-effort')),
    `A10-delegation/finalize-default-mutation[${runtime}/${role}]: corrupting an actual call-carried default fails even when the surrounding tier table remains correct`);
  }

  // Subject-byte mutations: remove the two observed distinctions from an otherwise-correct common
  // contract and prove the acceptance classifier notices each believable near miss independently.
  if (commonGaps.length === 0) {
    const noPerItemReset = common.replace(/[^.]*re-evaluat[^.]*\./i, '');
    assert(commonDelegationGaps(noPerItemReset).includes('per-item-reset'),
      'A10-delegation/mutation: removing the per-item reset makes the common contract fail');
    const conflatedRoleAbsence = common.replace(/[^.]*exact named role[^.]*\./i,
      'Failure to reach an exact named role makes every subagent route unavailable for the run.');
    assert(commonDelegationGaps(conflatedRoleAbsence).includes('exact-role-is-not-no-dispatch'),
      'A10-delegation/mutation: conflating exact-role absence with no dispatch makes the common contract fail');
  }
  const cleanItemLocal = 'Inline the current item only when no adequate native route exists; re-evaluate the next item.';
  assert(!RETIRED_RUN_WIDE_INLINE.test(cleanItemLocal),
    'A10-delegation/next-whole-surface-mutation: an item-local exhausted-route fallback is accepted');
  assert(RETIRED_RUN_WIDE_INLINE.test(cleanItemLocal
    + ' If the runtime cannot spawn a role agent, keep the work inline and say so.'),
  'A10-delegation/next-whole-surface-mutation: appending the retired broad fallback anywhere in the render is detected');
  assert(codexV2FieldHits(common).length === 0
    && codexV2FieldHits(common + '\n  task_name="universal_tdd_guide",').length === 1,
  'A10-delegation/codex-v2-scope-mutation: injecting task_name into the universal decision contract is detected');
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
