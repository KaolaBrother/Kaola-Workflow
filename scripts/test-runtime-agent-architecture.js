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

// A roster may be a bullet, table row, or sentence. Its serialization is not the contract; the
// observable contract is that a tier-labelled role-membership unit names exactly the roles derived
// from behavior-contracts.json. Keep the unit bounded before the next tier-roster marker so nearby
// runtime-specific model bindings cannot make a wrong membership look complete.
function tierRosterGaps(text, expected) {
  const prose = normalizedProse(text).toLowerCase();
  const markers = {};
  for (const tier of Object.keys(expected)) {
    const patterns = [
      new RegExp(`\\b${tier}\\b.{0,48}\\broles?\\b`, 'g'),
      new RegExp(`\\broles?\\b.{0,48}\\b${tier}\\b`, 'g'),
    ];
    markers[tier] = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(prose)) !== null) markers[tier].push(match.index);
    }
    markers[tier] = [...new Set(markers[tier])].sort((a, b) => a - b);
  }

  const allMarkers = Object.entries(markers)
    .flatMap(([tier, indices]) => indices.map(index => ({ tier, index })))
    .sort((a, b) => a.index - b.index);
  const gaps = [];
  for (const tier of Object.keys(expected)) {
    const found = markers[tier].some(index => {
      const next = allMarkers.find(marker => marker.index > index);
      const segment = prose.slice(index, next ? next.index : Math.min(prose.length, index + 1200));
      return JSON.stringify(roleNamesIn(segment).sort()) === JSON.stringify(expected[tier]);
    });
    if (!found) gaps.push(`${tier}-role-roster`);
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

function mutateConcreteDispatchBlock(runtime, text, role, mutate) {
  let changed = false;
  const call = runtime === 'claude' ? 'Agent' : runtime === 'codex' ? 'spawn_agent' : null;
  if (!call) return { changed, output: String(text || '') };
  const pattern = new RegExp(`^${call}\\(\\n[\\s\\S]*?^\\)`, 'gm');
  const output = String(text || '').replace(pattern, block => {
    const roleField = runtime === 'codex' ? 'agent_type' : 'subagent_type';
    if (changed || quotedCallField(block, roleField) !== role) return block;
    changed = true;
    return mutate(block);
  });
  return { changed, output };
}

function dispatchDefaultGaps(runtime, text, roleContracts) {
  if (runtime !== 'claude' && runtime !== 'codex') return [];
  const expected = {
    claude: {
      standard: { model: 'sonnet' },
      reasoning: { model: 'opus' },
      heavy: { model: 'fable' },
    },
    codex: {
      standard: { model: 'gpt-5.6-luna', effort: 'max' },
      reasoning: { model: 'gpt-5.6-sol', effort: 'medium' },
      heavy: { model: 'gpt-5.6-sol', effort: 'high' },
    },
  }[runtime];
  const blocks = concreteDispatchBlocks(runtime, text);
  const gaps = [];
  const requiredRoles = ['tdd-guide', 'build-error-resolver', 'doc-updater'];
  for (const role of requiredRoles) {
    const block = blocks.find(candidate => roleNamesIn(candidate).includes(role));
    if (!block) {
      gaps.push(`${role}-concrete-call`);
      continue;
    }
    const tier = roleContracts[role] && roleContracts[role].intent_class;
    const binding = expected[tier];
    if (!binding || !new RegExp(`\\bmodel\\s*=\\s*["']${binding.model.replace(/\./g, '\\.') }["']`).test(block)) {
      gaps.push(`${role}-default-model`);
    }
    if (runtime === 'codex'
        && !new RegExp(`\\breasoning_effort\\s*=\\s*["']${binding && binding.effort}["']`).test(block)) {
      gaps.push(`${role}-default-effort`);
    }
    if (runtime === 'codex') {
      if (quotedCallField(block, 'agent_type') !== role) gaps.push(`${role}-agent-type`);
      const taskName = quotedCallField(block, 'task_name');
      const sanitizedRole = role.replace(/-/g, '_');
      if (taskName === null || taskName.length === 0) {
        gaps.push(`${role}-task-name-required`);
      } else {
        if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(taskName)) {
          gaps.push(`${role}-task-name-sanitize`);
        }
        if (!taskName.includes(sanitizedRole)) gaps.push(`${role}-task-name-role`);
      }
      if (!quotedCallField(block, 'message')) gaps.push(`${role}-message`);
      if (quotedCallField(block, 'fork_turns') !== 'none') gaps.push(`${role}-fork-turns`);
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

  // Every runtime must describe the honest item-local fallback. A generic/native child is valid
  // only as itself: its brief carries the missing profile's task/custody/evidence/stop contract,
  // and absence of every adequate route inlines this item with a concrete capability_gap.
  needs('exact-role-fallback', [/exact named role/, /exact role name/]);
  needs('native-alternative', [/built-in/, /generic/, /native child/]);
  needs('honest-mechanism', [/actual mechanism/, /name(?:s|d)? the .*mechanism/, /as itself/]);
  needs('no-impersonation', [/not (?:pretend|present|claim).*named role/, /never .*named role/,
    /no impersonation/, /does not impersonate/]);
  for (const boundary of ['task', 'custody', 'evidence', 'stop']) {
    if (!prose.includes(boundary)) gaps.push('brief-' + boundary);
  }
  needs('current-item-only', [/current item only/, /only (?:the )?current item/, /inline this item/]);
  needs('all-adequate-routes-exhausted', [/no adequate .*route/, /every adequate .*unavailable/,
    /only when no .*adequate/]);
  if (!(prose.includes('capability_gap') && prose.includes('specific'))) gaps.push('specific-capability-gap');

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
      ['reasoning-tier', [/reasoning.*gpt-5\.6-sol.*medium|gpt-5\.6-sol.*medium.*reasoning/]],
      ['heavy-tier', [/heavy.*gpt-5\.6-sol.*high|gpt-5\.6-sol.*high.*heavy/]],
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
      ['project-catalog-reachability', [/project.catalog materializ/, /project.*\.cursor\/agents\/.*catalog/,
        /catalog.*project.*\.cursor\/agents\//]],
      ['user-file-is-not-catalog-proof', [/user (?:equivalents|scope|files?).*(?:but|not|insufficient).*project.catalog/,
        /user.*(?:alone|only).*not.*catalog.*project/]],
      ['carrier', [/live [`]?task[`]? schema/]],
      ['standard-tier', [/standard.*grok-4\.6.*medium|grok-4\.6.*medium.*standard/]],
      ['reasoning-tier', [/reasoning.*grok-4\.6.*high|grok-4\.6.*high.*reasoning/]],
      ['heavy-tier', [/heavy.*grok-4\.6.*xhigh|grok-4\.6.*xhigh.*heavy/]],
      // Cursor catalogs vary by host. The measured supported CLI exposed a writable
      // generalPurpose route (stream identity: unspecified) and project custom profiles; another
      // host may expose scoped Explore/Bash/Browser instead. Guidance must therefore name the
      // measured generic honestly while making the live host catalog—not one frozen enum—the rule.
      ['custom-route', [/custom.*(?:task|subagenttype)|(?:task|subagenttype).*custom/]],
      ['measured-writable-generic', [/(?:supported|measured) cli.*writable.*generalpurpose/,
        /generalpurpose.*writable.*(?:supported|measured) cli/]],
      ['generic-stream-identity', [/generalpurpose.*subagenttype\.unspecified/,
        /subagenttype\.unspecified.*generalpurpose/]],
      ['current-task-catalog', [/live task (?:catalog|enum)/, /current task (?:catalog|enum)/,
        /runtime.report.*task (?:catalog|enum)/]],
      ['host-catalog-variation', CURSOR_HOST_CATALOG_VARIATION],
      ['reported-route-only', CURSOR_REPORTED_ROUTE_ONLY],
      // #1036: named_roles and omit-model are CLI-with-project-catalog facts, not a Cursor-family
      // universal. A Cloud catalog-miss host uses live built-ins as themselves; files already
      // present plus a built-in-only enum is a capability_gap, not an install miss.
      ['named-roles-not-host-universal', [/named_roles is not host-universal/,
        /named roles is not host-universal/]],
      ['omit-model-when-named', [/omit a requested per-call model only when/,
        /omit that per-call model only when/]],
      ['catalog-miss-capability-gap', [/capability_gap, not an install miss/]],
      ['catalog-miss-model-lever', [/resolver-listed model slug/]],
      ['cloud-explore-route', [/cloud catalog-miss host exposed [`']?explore/]],
      ['global-install-no-ambient-repo', [/does not write an ambient git repository/]],
      ['cursor-app-cli-distinct', [/product surfaces are cli and app/]],
      ['app-cloud-not-local-ide', [/app local ide and app-started cloud/]],
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
  ['authority-layout class', /authority_layout_equivalent/],
  ['execution-default consent', /execution_default_change/],
  ['state-schema fence', /state_schema_incompatible/],
  ['unknown-or-mixed class', /unknown_or_mixed/],
]) {
  assert(pattern.test(initSource), `A3: workflow-init carries the ${label} migration outcome`);
}
// The executable distribution module is now the sole consumer-template authoring surface;
// workflow-init describes and invokes it without embedding a second copy.
const consumerTemplateSource = read('scripts/kaola-workflow-project-instruction-templates.js') || '';
const markerRows = [...consumerTemplateSource.matchAll(/<!--\s*(KW-[A-Z0-9-]+)-(START|END)\s*-->/g)]
  .map(match => ({ name: match[1], edge: match[2] }));
const neutralMarkerNames = [...new Set(markerRows.map(row => row.name)
  .filter(name => !name.includes('CLAUDE')))];
const pairedNeutralMarker = neutralMarkerNames.find(name =>
  markerRows.some(row => row.name === name && row.edge === 'START')
  && markerRows.some(row => row.name === name && row.edge === 'END'));
assert(!!pairedNeutralMarker,
  'A3: the distribution consumer template declares a paired runtime-neutral managed region');
assert(!/KW-CLAUDE-(?:TEMPLATE|MANAGED)/.test(initSource),
  'A3: universal workflow-init regions no longer use retired KW-CLAUDE naming');

{
  const nextSource = read('templates/routing/next.skeleton.md') || '';
  const finalizeSource = read('templates/routing/finalize.skeleton.md') || '';
  const consumerSource = read('scripts/kaola-workflow-project-instruction-templates.js') || '';
  const surfaces = [nextSource, finalizeSource, consumerSource];
  const norm = text => String(text).replace(/\s+/g, ' ');
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
  assert(teachesSelectorAsMission(norm(nextSource).replace(/not by itself a mission/g, 'is itself a mission')),
    'A3[mission-granularity] mutation RED: teaching one selector as a mission is detected');
  assert(teachesImmediateBlocked(norm(nextSource).replace(/Do not return `BLOCKED` merely because/g,
    'return `BLOCKED` merely because')),
  'A3[mission-granularity] mutation RED: requiring immediate BLOCKED on same-custody work is detected');
  assert(teachesTestOwnerRepair(norm(nextSource).replace(
    /An implementer may not delete, weaken, or reinterpret that acceptance to pass\./,
    'An implementer may delete, weaken, or reinterpret that acceptance to pass.')),
  'A3[mission-granularity] mutation RED: silent production repair by the test/implementer owner is detected');
}

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

  function runMigrationHelper(helperPath, mode, projectRoot) {
    // spawn-class: environment
    const result = spawnSync(process.execPath,
      [helperPath, mode, '--project-root', projectRoot, '--json'], { encoding: 'utf8' });
    let envelope = null;
    try { envelope = JSON.parse(String(result.stdout || '').trim()); } catch (_) { /* asserted below */ }
    return { ...result, envelope };
  }

  function exactLineCount(bytes, line) {
    return String(bytes).split(/\r?\n/).filter(candidate => candidate === line).length;
  }

  function hasRepositorySpecificContract(bytes) {
    return [
      /Kaola-Workflow Repository Instructions/,
      /Kaola-Workflow is a loop-engineering system/,
      /scripts\/kaola-workflow-claim\.js/,
      /simulate-workflow-walkthrough\.js/,
      /npm run test:kaola-workflow:claude/,
      /docs\/decisions\/0017-the-mission-list\.md/,
    ].some(pattern => pattern.test(String(bytes)));
  }

  function injectManagedDrift(bytes, marker) {
    const token = Buffer.from(`<!-- ${marker}-START -->`);
    const at = bytes.indexOf(token);
    if (at < 0) return bytes;
    const insertion = at + token.length;
    return Buffer.concat([
      bytes.subarray(0, insertion),
      Buffer.from('\nKW_ACCEPTANCE_DRIFT'),
      bytes.subarray(insertion),
    ]);
  }

  function bufferEndsWith(bytes, suffix) {
    return bytes.length >= suffix.length && bytes.subarray(bytes.length - suffix.length).equals(suffix);
  }

  function exactManagedSlice(bytes, marker) {
    const startToken = Buffer.from(`<!-- ${marker}-START -->`);
    const endToken = Buffer.from(`<!-- ${marker}-END -->`);
    const start = bytes.indexOf(startToken);
    const endStart = bytes.indexOf(endToken);
    if (start < 0 || endStart < start) return null;
    return bytes.subarray(start, endStart + endToken.length);
  }

  function releasedConsumerTemplate() {
    const source = gitBlob('a503edd8:templates/routing/init.skeleton.md');
    if (!source) return null;
    const startToken = Buffer.from('<!-- KW-CLAUDE-TEMPLATE-START -->\n```markdown\n');
    const endToken = Buffer.from('\n```\n<!-- KW-CLAUDE-TEMPLATE-END -->');
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start + startToken.length);
    if (start < 0 || end < 0) return null;
    return source.subarray(start + startToken.length, end);
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
    const missionList = [
      '# goal',
      '',
      '- item: keep extra fields',
      '  status: done',
      '  dispatched: self',
      '  result: already landed',
      '  role: implementer',
      '  depends_on: none',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(stateDir, 'mission-list.md'), missionList);
    const active = runMigration('apply', activeRoot);
    assert(active.status === 0 && active.envelope
      && active.envelope.status === 'applied'
      && active.envelope.changed === true
      && active.envelope.files.agents.compatibility === 'authority_layout_equivalent'
      && active.envelope.files.claude.compatibility === 'authority_layout_equivalent',
    'A3[active]: a compatible authority-layout migration applies during an active run');
    const stateAfter = fs.readFileSync(path.join(stateDir, 'workflow-state.md'), 'utf8');
    assert(stateAfter.includes('status: active'),
      'A3[active]: layout adoption does not rewrite claim/worktree status');
    assert(fs.readFileSync(path.join(stateDir, 'mission-list.md'), 'utf8') === missionList,
      'A3[active]: Mission List bytes including extra fields stay untouched');
    const receiptPath = path.join(stateDir, '.cache', 'instruction-adoption.json');
    assert(fs.existsSync(receiptPath),
      'A3[active]: layout adoption writes a recovery receipt under the active run .cache');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert(receipt.kind === 'instruction_adoption'
      && receipt.fresh_session_requirement === 'not_inspected_by_init'
      && receipt.files.agents.before_sha256
      && receipt.files.agents.after_sha256
      && receipt.files.agents.before_sha256 !== receipt.files.agents.after_sha256,
    'A3[active]: receipt carries old/new hashes and does not inspect the adapter');
    assert(/<!--\s*KW-AGENTS-MANAGED-START\s*-->/.test(fs.readFileSync(path.join(activeRoot, 'AGENTS.md'), 'utf8'))
      && exactLineCount(fs.readFileSync(path.join(activeRoot, 'CLAUDE.md')), '@AGENTS.md') === 1,
    'A3[active]: active-run layout adoption reaches AGENTS-canonical plus a thin Claude bridge');
  } finally {
    try { fs.rmSync(activeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  const execRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1037-exec-default-'));
  try {
    const canonicalTemplates = require(path.join(ROOT, 'scripts',
      'kaola-workflow-project-instruction-templates.js'));
    const driftedAgents = injectManagedDrift(
      Buffer.from(canonicalTemplates.AGENTS_TEMPLATE), migrationModule.AGENTS_MARKER);
    writeInstructionFixture(execRoot, driftedAgents, Buffer.from(canonicalTemplates.CLAUDE_TEMPLATE));
    const stateDir = path.join(execRoot, 'kaola-workflow', 'active-run');
    fs.mkdirSync(stateDir, { recursive: true });
    const stateBytes = '# Kaola-Workflow State\n\n## Project\nname: active-run\nstatus: active\n';
    fs.writeFileSync(path.join(stateDir, 'workflow-state.md'), stateBytes);
    const planned = runMigration('plan', execRoot);
    assert(planned.envelope && planned.envelope.files.agents.compatibility === 'execution_default_change',
      'A3[active-execution]: drifted AGENTS managed region is execution_default_change');
    const applied = runMigration('apply', execRoot);
    assert(applied.status === 2 && applied.envelope
      && applied.envelope.status === 'decision_required'
      && applied.envelope.changed === false && applied.envelope.writes.length === 0,
    'A3[active-execution]: execution-default change during an active run does not write');
    assert(fs.readFileSync(path.join(execRoot, 'AGENTS.md')).equals(driftedAgents),
      'A3[active-execution]: AGENTS bytes stay until conversation consent');
    assert(fs.readFileSync(path.join(stateDir, 'workflow-state.md'), 'utf8') === stateBytes,
      'A3[active-execution]: workflow-state is never a write target');
    assert(planned.envelope.files.agents.before_sha256
      !== planned.envelope.files.agents.after_sha256,
    'A3[active-execution]: plan still shows exact old/new hashes for consent');
    assert(!fs.existsSync(path.join(stateDir, '.cache', 'instruction-adoption.json')),
      'A3[active-execution]: refused execution-default writes leave no adoption receipt');
  } finally {
    try { fs.rmSync(execRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  assert(migrationModule.COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT === 'authority_layout_equivalent'
    && migrationModule.COMPATIBILITY.EXECUTION_DEFAULT_CHANGE === 'execution_default_change'
    && migrationModule.COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE === 'state_schema_incompatible'
    && migrationModule.COMPATIBILITY.UNKNOWN_OR_MIXED === 'unknown_or_mixed',
  'A3[compat]: helper exports the four repository compatibility classes');
  assert(migrationModule.compatibilityFor('agents', { classification: 'known_legacy_redirect' })
    === 'authority_layout_equivalent',
  'A3[compat]: known legacy redirect is authority-layout equivalent');
  assert(migrationModule.compatibilityFor('agents', { classification: 'managed_region', changed: true })
    === 'execution_default_change',
  'A3[compat]: AGENTS managed-region drift is an execution-default change');
  assert(migrationModule.compatibilityFor('claude', { classification: 'managed_region', changed: true })
    === 'authority_layout_equivalent',
  'A3[compat]: Claude overlay managed-region rewrite stays layout-equivalent');
  assert(migrationModule.compatibilityFor('agents', { classification: 'state_schema_incompatible' })
    === 'state_schema_incompatible',
  'A3[compat]: a state-schema classification stays non-layout');
  assert(migrationModule.compatibilityFor('agents', { classification: 'owner_only' })
    === 'unknown_or_mixed',
  'A3[compat]: owner-only authority is unknown_or_mixed');

  // A3-installed — workflow-init runs from the distribution that actually ships. Copy each plugin
  // root away from this repository so an implementation cannot accidentally borrow root-only
  // AGENTS.md/CLAUDE.md bytes. A successful apply therefore proves that the consumer templates are
  // owned by, and reachable from, that installed distribution.
  for (const distribution of [
    { label: 'github', root: 'plugins/kaola-workflow' },
    { label: 'gitlab', root: 'plugins/kaola-workflow-gitlab' },
    { label: 'gitea', root: 'plugins/kaola-workflow-gitea' },
  ]) {
    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kw-1033-${distribution.label}-dist-`));
    try {
      const installedRoot = path.join(isolatedRoot, 'installed-plugin');
      const consumerRoot = path.join(isolatedRoot, 'consumer-project');
      fs.cpSync(path.join(ROOT, distribution.root), installedRoot, { recursive: true });
      fs.mkdirSync(consumerRoot, { recursive: true });
      const helperPath = path.join(installedRoot, 'scripts',
        'kaola-workflow-project-instructions.js');
      const plan = runMigrationHelper(helperPath, 'plan', consumerRoot);
      const applied = runMigrationHelper(helperPath, 'apply', consumerRoot);
      const agentsPath = path.join(consumerRoot, 'AGENTS.md');
      const claudePath = path.join(consumerRoot, 'CLAUDE.md');
      const agentsAfter = readOptionalFixture(agentsPath);
      const claudeAfter = readOptionalFixture(claudePath);

      assert(plan.status === 0 && plan.envelope && plan.envelope.status === 'planned'
        && applied.status === 0 && applied.envelope && applied.envelope.status === 'applied',
      `A3[installed/${distribution.label}]: the isolated vendored helper can plan and apply using `
        + 'distribution-owned consumer templates');
      assert(!!agentsAfter && !!claudeAfter
        && /<!--\s*KW-AGENTS-MANAGED-START\s*-->/.test(String(agentsAfter))
        && /<!--\s*KW-CLAUDE-OVERLAY-MANAGED-START\s*-->/.test(String(claudeAfter))
        && exactLineCount(claudeAfter, '@AGENTS.md') === 1,
      `A3[installed/${distribution.label}]: installed templates create one universal AGENTS authority `
        + 'and one load-bearing Claude bridge');
      assert(!hasRepositorySpecificContract(agentsAfter || Buffer.alloc(0))
        && !hasRepositorySpecificContract(claudeAfter || Buffer.alloc(0)),
      `A3[installed/${distribution.label}]: a new consumer receives no Kaola-Workflow repository-specific contract`);

      const canonicalTemplates = require(path.join(ROOT, 'scripts',
        'kaola-workflow-project-instruction-templates.js'));
      const expectedManaged = exactManagedSlice(
        Buffer.from(canonicalTemplates.AGENTS_TEMPLATE), migrationModule.AGENTS_MARKER);
      const installedManaged = agentsAfter
        ? exactManagedSlice(agentsAfter, migrationModule.AGENTS_MARKER) : null;
      assert(!!expectedManaged && !!installedManaged && installedManaged.equals(expectedManaged),
        `A3[installed/${distribution.label}]: workflow-init installs the consumer AGENTS managed block `
          + 'byte-equal to the distribution-owned template module');
    } finally {
      try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }

  // A distribution can accidentally inline today's identical bytes and still satisfy a snapshot
  // comparison. Mutate only an isolated installed template module and require the real helper to
  // consume that changed authority; this proves the module remains the live source, not a mirror.
  const sourceProbeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-template-source-probe-'));
  try {
    const installedRoot = path.join(sourceProbeRoot, 'installed-plugin');
    const consumerRoot = path.join(sourceProbeRoot, 'consumer-project');
    fs.cpSync(path.join(ROOT, 'plugins/kaola-workflow'), installedRoot, { recursive: true });
    const templatePath = path.join(installedRoot, 'scripts',
      'kaola-workflow-project-instruction-templates.js');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const exportLine = 'module.exports = { AGENTS_TEMPLATE, CLAUDE_TEMPLATE };';
    const probeLine = [
      "const PROBED_AGENTS_TEMPLATE = AGENTS_TEMPLATE.replace(",
      "  '<!-- KW-AGENTS-MANAGED-START -->',",
      "  '<!-- KW-AGENTS-MANAGED-START -->\\nKW_TEMPLATE_SOURCE_PROBE=isolated-distribution');",
      'module.exports = { AGENTS_TEMPLATE: PROBED_AGENTS_TEMPLATE, CLAUDE_TEMPLATE };',
    ].join('\n');
    assert(templateSource.includes(exportLine),
      'A3[single-source/mutation]: isolated distribution template exposes the expected export seam');
    fs.writeFileSync(templatePath, templateSource.replace(exportLine, probeLine));
    fs.mkdirSync(consumerRoot, { recursive: true });
    const helperPath = path.join(installedRoot, 'scripts',
      'kaola-workflow-project-instructions.js');
    const applied = runMigrationHelper(helperPath, 'apply', consumerRoot);
    const agentsAfter = readOptionalFixture(path.join(consumerRoot, 'AGENTS.md'));
    const managedAfter = agentsAfter
      ? exactManagedSlice(agentsAfter, migrationModule.AGENTS_MARKER) : null;
    assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied'
      && !!managedAfter
      && managedAfter.includes(Buffer.from('KW_TEMPLATE_SOURCE_PROBE=isolated-distribution')),
    'A3[single-source/mutation]: workflow-init consumes its adjacent template module as the live '
      + 'consumer AGENTS source');
  } finally {
    try { fs.rmSync(sourceProbeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  // A3-released-template — v9.17.2 emitted a complete consumer CLAUDE.md whose universal contract
  // lived outside the retired managed region. Exact released bytes are therefore one known whole-
  // file artifact: retaining their prefix/suffix would preserve a second universal authority. The
  // whole file may migrate only while its byte identity is intact. Any changed or owner-authored
  // byte outside that old region makes ownership ambiguous and must require a decision with no
  // partial migration.
  const releasedClaude = releasedConsumerTemplate();
  assert(Buffer.isBuffer(releasedClaude),
    'A3[released-template]: the exact v9.17.2 workflow-init consumer template loads from a503edd8');
  if (releasedClaude) {
    const oldMarker = 'KW-CLAUDE-MANAGED';
    const oldManaged = exactManagedSlice(releasedClaude, oldMarker);
    const oldStart = oldManaged ? releasedClaude.indexOf(oldManaged) : -1;
    const releasedPrefix = oldStart >= 0 ? releasedClaude.subarray(0, oldStart) : Buffer.alloc(0);
    const releasedSuffix = oldStart >= 0
      ? releasedClaude.subarray(oldStart + oldManaged.length) : Buffer.alloc(0);
    assert(!!oldManaged && releasedPrefix.length > 0 && releasedSuffix.length > 0,
      'A3[released-template]: released fixture has a bounded old managed region plus universal outer bytes');

    const releasedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-released-template-'));
    try {
      writeInstructionFixture(releasedRoot, Buffer.from(legacyRedirect), releasedClaude);
      const applied = runMigration('apply', releasedRoot);
      const agentsAfter = fs.readFileSync(path.join(releasedRoot, 'AGENTS.md'));
      const claudeAfter = fs.readFileSync(path.join(releasedRoot, 'CLAUDE.md'));
      const canonicalTemplates = require(path.join(ROOT, 'scripts',
        'kaola-workflow-project-instruction-templates.js'));
      const expectedAgents = Buffer.from(canonicalTemplates.AGENTS_TEMPLATE);
      const expectedClaude = Buffer.from(canonicalTemplates.CLAUDE_TEMPLATE);

      assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied'
        && applied.envelope.changed === true,
      'A3[released-template]: the exact released instruction pair migrates automatically');
      assert(agentsAfter.equals(expectedAgents),
        'A3[released-template]: the legacy AGENTS redirect becomes the canonical consumer authority');
      assert(claudeAfter.equals(expectedClaude),
        'A3[released-template]: the exact released CLAUDE template is replaced whole-file by the canonical thin bridge');
      assert(exactLineCount(claudeAfter, '@AGENTS.md') === 1
        && !claudeAfter.includes(Buffer.from('<!-- KW-CLAUDE-MANAGED-START -->'))
        && !!exactManagedSlice(claudeAfter, migrationModule.CLAUDE_MARKER)
        && !/^##\s+(?:Project Snapshot|Commands|Non-Negotiable Rules|First Principles|Kaola-Workflow|Documentation Map|Maintenance)\s*$/mi.test(String(claudeAfter)),
      'A3[released-template]: migrated CLAUDE.md contains one bridge and none of the retired universal sections');

      const firstAgents = Buffer.from(agentsAfter);
      const firstClaude = Buffer.from(claudeAfter);
      const rerun = runMigration('apply', releasedRoot);
      assert(rerun.status === 0 && rerun.envelope && rerun.envelope.status === 'converged'
        && rerun.envelope.changed === false && rerun.envelope.writes.length === 0,
      'A3[released-template]: migrated released consumer converges on its second apply');
      assert(fs.readFileSync(path.join(releasedRoot, 'AGENTS.md')).equals(firstAgents)
        && fs.readFileSync(path.join(releasedRoot, 'CLAUDE.md')).equals(firstClaude),
      'A3[released-template]: converged rerun leaves both migrated files byte-identical');
    } finally {
      try { fs.rmSync(releasedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }

    const mixedReleasedVariants = [
      {
        label: 'changed-prefix',
        bytes: Buffer.from(String(releasedClaude).replace(
          '# Project Instructions', '# Owner-adjusted Project Instructions')),
      },
      {
        label: 'owner-suffix',
        bytes: Buffer.concat([
          releasedClaude,
          Buffer.from('\nOWNER_CLAUDE_SUFFIX=must-not-be-adopted\n'),
        ]),
      },
    ];
    for (const variant of mixedReleasedVariants) {
      const mixedReleasedRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), `kw-1033-released-mixed-${variant.label}-`));
      try {
        assert(!!oldManaged && !!exactManagedSlice(variant.bytes, oldMarker)
          && exactManagedSlice(variant.bytes, oldMarker).equals(oldManaged)
          && !variant.bytes.equals(releasedClaude),
        `A3[released-mixed/${variant.label}]: fixture changes only bytes outside the intact old managed region`);
        const agentsBefore = Buffer.from(legacyRedirect);
        const claudeBefore = Buffer.from(variant.bytes);
        writeInstructionFixture(mixedReleasedRoot, agentsBefore, claudeBefore);
        const applied = runMigration('apply', mixedReleasedRoot);
        assert(applied.status === 2 && applied.envelope
          && applied.envelope.status === 'decision_required'
          && applied.envelope.changed === false && applied.envelope.writes.length === 0,
        `A3[released-mixed/${variant.label}]: changed outer bytes require an ownership decision, not partial adoption`);
        assert(fs.readFileSync(path.join(mixedReleasedRoot, 'AGENTS.md')).equals(agentsBefore)
          && fs.readFileSync(path.join(mixedReleasedRoot, 'CLAUDE.md')).equals(claudeBefore),
        `A3[released-mixed/${variant.label}]: decision-required leaves both instruction files byte-identical`);
      } finally {
        try { fs.rmSync(mixedReleasedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }
  }

  // A3-v9 — use the exact supported pre-migration files, not a friendly synthetic owner overlay.
  function gitBlob(revisionPath) {
    // spawn-class: environment
    const result = spawnSync('git', ['show', revisionPath], { cwd: ROOT, encoding: null });
    return result.status === 0 ? result.stdout : null;
  }

  function readOptionalFixture(file) {
    try { return fs.readFileSync(file); } catch (_) { return null; }
  }

  const v9Agents = gitBlob('a503edd8:AGENTS.md');
  const v9Claude = gitBlob('a503edd8:CLAUDE.md');
  assert(Buffer.isBuffer(v9Agents) && Buffer.isBuffer(v9Claude),
    'A3[v9-exact]: exact a503edd8 AGENTS.md and CLAUDE.md fixtures load from the baseline commit');
  if (v9Agents && v9Claude) {
    const v9Root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-v9-exact-'));
    try {
      writeInstructionFixture(v9Root, v9Agents, v9Claude);
      const applied = runMigration('apply', v9Root);
      const agentsAfter = fs.readFileSync(path.join(v9Root, 'AGENTS.md'));
      const claudeAfter = fs.readFileSync(path.join(v9Root, 'CLAUDE.md'));
      assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied',
        'A3[v9-exact]: the exact a503edd8 instruction pair has a deterministic migration');
      const universalHeadings = [
        'Project Overview', 'The mission list', 'Durable State Contract', 'First Principles',
        'Non-Negotiable Rules',
      ];
      const duplicated = universalHeadings.filter(heading => {
        const pattern = new RegExp('^##\\s+' + heading.replace(/ /g, '\\s+'), 'mi');
        return pattern.test(String(agentsAfter)) && pattern.test(String(claudeAfter));
      });
      assert(duplicated.length === 0 && exactLineCount(claudeAfter, '@AGENTS.md') === 1,
        'A3[v9-exact]: migration leaves exactly one universal authority and one Claude bridge — duplicated '
        + JSON.stringify(duplicated));
      assert(!hasRepositorySpecificContract(agentsAfter) && !hasRepositorySpecificContract(claudeAfter),
        'A3[v9-exact]: migration does not install Kaola-Workflow repository-specific instructions into a consumer');
      assert(!/# Kaola-Workflow — Claude Code Instructions/.test(String(claudeAfter))
        && !/READ CLAUDE\.md|only to direct you there/i.test(String(agentsAfter)),
      'A3[v9-exact]: retired v9 universal Claude authority and AGENTS redirect are both removed');

      const v9ActiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1037-v9-active-'));
      try {
        writeInstructionFixture(v9ActiveRoot, v9Agents, v9Claude);
        const stateDir = path.join(v9ActiveRoot, 'kaola-workflow', 'active-run');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'workflow-state.md'),
          '# Kaola-Workflow State\n\n## Project\nname: active-run\nstatus: active\n');
        fs.writeFileSync(path.join(stateDir, 'mission-list.md'),
          '# goal\n\n- item: keep me\n  status: done\n  dispatched: self\n  result: already landed\n');
        const appliedActive = runMigration('apply', v9ActiveRoot);
        assert(appliedActive.status === 0 && appliedActive.envelope
          && appliedActive.envelope.status === 'applied'
          && appliedActive.envelope.files.agents.compatibility === 'authority_layout_equivalent',
        'A3[v9-active]: exact v9 pair adopts AGENTS-canonical layout during an active run');
    assert(fs.readFileSync(path.join(stateDir, 'mission-list.md'), 'utf8').includes('keep me'),
      'A3[v9-active]: Mission List bytes are unchanged');
    assert(fs.existsSync(path.join(stateDir, '.cache', 'instruction-adoption.json')),
      'A3[v9-active]: compatible layout adoption leaves a recovery receipt');
      } finally {
        try { fs.rmSync(v9ActiveRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    } finally {
      try { fs.rmSync(v9Root, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }

    const unknownClaudeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-unknown-claude-'));
    try {
      const unknownClaude = Buffer.from([
        '# Existing project instructions',
        '',
        '## Build and release',
        '',
        'OWNER_CLAUDE_AUTHORITY=unclassified',
        '',
      ].join('\n'));
      writeInstructionFixture(unknownClaudeRoot, v9Agents, unknownClaude);
      const result = runMigration('apply', unknownClaudeRoot);
      assert(result.status === 2 && result.envelope
        && result.envelope.status === 'decision_required'
        && result.envelope.changed === false && result.envelope.writes.length === 0,
      'A3[unknown-claude]: a known legacy AGENTS redirect does not make unknown CLAUDE authority safe');
      assert(fs.readFileSync(path.join(unknownClaudeRoot, 'AGENTS.md')).equals(v9Agents)
        && fs.readFileSync(path.join(unknownClaudeRoot, 'CLAUDE.md')).equals(unknownClaude),
      'A3[unknown-claude]: decision-required preserves both instruction files byte-for-byte');
    } finally {
      try { fs.rmSync(unknownClaudeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }

  // A3-bridge — the Claude import is load-bearing state, not decorative bytes outside convergence.
  const bridgeOwnerBytes = Buffer.from('\nOWNER_BRIDGE_SUFFIX=preserve-byte-for-byte\n');
  for (const mutation of [
    { label: 'deleted', apply: text => text.replace(/^@AGENTS\.md\r?\n/m, '') },
    { label: 'duplicated', apply: text => text.replace(/^@AGENTS\.md$/m, '@AGENTS.md\n@AGENTS.md') },
    { label: 'altered', apply: text => text.replace(/^@AGENTS\.md$/m, '@README.md') },
  ]) {
    const bridgeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kw-1033-bridge-${mutation.label}-`));
    try {
      const agentsBytes = Buffer.concat([Buffer.from(agentsRoot), bridgeOwnerBytes]);
      const claudeBytes = Buffer.concat([Buffer.from(mutation.apply(claudeRoot)), bridgeOwnerBytes]);
      writeInstructionFixture(bridgeRoot, agentsBytes, claudeBytes);
      const beforeCheck = fs.readFileSync(path.join(bridgeRoot, 'CLAUDE.md'));
      const checked = runMigration('check', bridgeRoot);
      assert(checked.status === 3 && checked.envelope && checked.envelope.status === 'drift'
        && checked.envelope.writes.length === 0,
      `A3[bridge/${mutation.label}]: check rejects Claude bridge ${mutation.label} drift without writing`);
      assert(fs.readFileSync(path.join(bridgeRoot, 'CLAUDE.md')).equals(beforeCheck),
        `A3[bridge/${mutation.label}]: check leaves owner and drift bytes untouched`);
      const applied = runMigration('apply', bridgeRoot);
      const claudeAfter = fs.readFileSync(path.join(bridgeRoot, 'CLAUDE.md'));
      assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied'
        && exactLineCount(claudeAfter, '@AGENTS.md') === 1
        && !/^@README\.md$/m.test(String(claudeAfter)),
      `A3[bridge/${mutation.label}]: apply restores exactly one canonical @AGENTS.md bridge`);
      assert(bufferEndsWith(claudeAfter, bridgeOwnerBytes),
        `A3[bridge/${mutation.label}]: bridge repair preserves owner bytes outside the managed envelope`);
    } finally {
      try { fs.rmSync(bridgeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }

  // A3-byte-safety — migration owns only its byte envelope. Non-UTF-8 owner bytes, restrictive
  // permissions, and symlink topology are not valid collateral for a text-template update.
  const invalidOwnerBytes = Buffer.from([0xff, 0xfe, 0x41, 0x0a]);
  const byteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-invalid-bytes-'));
  try {
    const agentsBefore = Buffer.concat([
      injectManagedDrift(Buffer.from(agentsRoot), migrationModule.AGENTS_MARKER), invalidOwnerBytes,
    ]);
    const claudeBefore = Buffer.concat([
      injectManagedDrift(Buffer.from(claudeRoot), migrationModule.CLAUDE_MARKER), invalidOwnerBytes,
    ]);
    writeInstructionFixture(byteRoot, agentsBefore, claudeBefore);
    const applied = runMigration('apply', byteRoot);
    const agentsAfter = fs.readFileSync(path.join(byteRoot, 'AGENTS.md'));
    const claudeAfter = fs.readFileSync(path.join(byteRoot, 'CLAUDE.md'));
    assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied',
      'A3[invalid-utf8]: managed drift remains safely repairable around non-UTF-8 owner bytes');
    assert(bufferEndsWith(agentsAfter, invalidOwnerBytes)
      && applied.envelope.files.agents.outside_bytes_preserved === true,
    'A3[invalid-utf8]: AGENTS owner bytes outside the managed region remain byte-identical');
    assert(bufferEndsWith(claudeAfter, invalidOwnerBytes)
      && applied.envelope.files.claude.outside_bytes_preserved === true,
    'A3[invalid-utf8]: CLAUDE owner bytes outside the managed region remain byte-identical');
  } finally {
    try { fs.rmSync(byteRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  const modeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-mode-'));
  try {
    writeInstructionFixture(modeRoot,
      injectManagedDrift(Buffer.from(agentsRoot), migrationModule.AGENTS_MARKER),
      injectManagedDrift(Buffer.from(claudeRoot), migrationModule.CLAUDE_MARKER));
    fs.chmodSync(path.join(modeRoot, 'AGENTS.md'), 0o600);
    fs.chmodSync(path.join(modeRoot, 'CLAUDE.md'), 0o600);
    const applied = runMigration('apply', modeRoot);
    const agentsMode = fs.statSync(path.join(modeRoot, 'AGENTS.md')).mode & 0o777;
    const claudeMode = fs.statSync(path.join(modeRoot, 'CLAUDE.md')).mode & 0o777;
    assert(applied.status === 0 && applied.envelope && applied.envelope.status === 'applied',
      'A3[mode]: managed instruction drift remains repairable for restrictive owner files');
    assert(agentsMode === 0o600 && claudeMode === 0o600,
      'A3[mode]: atomic replacement preserves 0600 on both instruction files — got '
      + agentsMode.toString(8) + '/' + claudeMode.toString(8));
  } finally {
    try { fs.rmSync(modeRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  for (const symlinkName of ['AGENTS.md', 'CLAUDE.md']) {
    const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1033-symlink-'));
    try {
      const agentsBytes = Buffer.from(agentsRoot);
      const claudeBytes = Buffer.from(claudeRoot);
      writeInstructionFixture(symlinkRoot, agentsBytes, claudeBytes);
      const marker = symlinkName === 'AGENTS.md'
        ? migrationModule.AGENTS_MARKER : migrationModule.CLAUDE_MARKER;
      const targetPath = path.join(symlinkRoot, 'owner-shared-instructions.md');
      const targetBefore = injectManagedDrift(
        symlinkName === 'AGENTS.md' ? agentsBytes : claudeBytes, marker);
      fs.writeFileSync(targetPath, targetBefore);
      const linkPath = path.join(symlinkRoot, symlinkName);
      fs.unlinkSync(linkPath);
      fs.symlinkSync(targetPath, linkPath);
      const otherName = symlinkName === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md';
      const otherBefore = fs.readFileSync(path.join(symlinkRoot, otherName));
      const result = runMigration('apply', symlinkRoot);
      assert(result.status === 2 && result.envelope
        && result.envelope.status === 'decision_required'
        && result.envelope.changed === false && result.envelope.writes.length === 0,
      `A3[symlink/${symlinkName}]: an instruction symlink requires an owner decision and is not written`);
      assert(fs.lstatSync(linkPath).isSymbolicLink()
        && fs.readFileSync(targetPath).equals(targetBefore)
        && fs.readFileSync(path.join(symlinkRoot, otherName)).equals(otherBefore),
      `A3[symlink/${symlinkName}]: refusal preserves link topology, target bytes, and peer instructions`);
    } finally {
      try { fs.rmSync(symlinkRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
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
      && entry.adapter.surfaces.app.execution_hosts.cloud.named_catalog === 'built_in_only'
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

  for (const skeletonPath of [
    'templates/routing/next.skeleton.md',
    'templates/routing/finalize.skeleton.md',
  ]) {
    assert(choiceContract(read(skeletonPath) || '') === common,
      `A10-delegation/common-source: ${skeletonPath} carries the one AGENTS decision wording exactly`);
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
      const rosterGaps = tierRosterGaps(guidance, intentRosters);
      assert(guidance.length > 0 && gaps.length === 0,
        `A10-delegation/adapter[${entry.name}]: guidance names lookup scope, native carrier, ADR 0019 tiers, honest fallback, custody brief, and item-local capability gap — missing ${JSON.stringify(gaps)}`);
      assert(rosterGaps.length === 0,
        `A10-delegation/adapter-roster[${entry.name}]: guidance exposes behavior-authority role membership for standard/reasoning/heavy — missing ${JSON.stringify(rosterGaps)}`);

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

    // Cursor mutation bite: the measured CLI enum is evidence for that host, not a schema to
    // promote across every Cursor surface. Remove both host-variation and current-host-only
    // qualifiers from the real rendered guidance; the classifier must reject that frozen-enum
    // near miss while leaving generalPurpose itself available as an honest measured fallback.
    const cursorEntry = adapterView.entries.find(entry => entry.runtime === 'cursor');
    const cursorGuidance = cursorEntry ? guidanceByAdapter.get(cursorEntry.name) : '';
    if (cursorGuidance) {
      const subject = normalizedProse(cursorGuidance).toLowerCase();
      const variation = CURSOR_HOST_CATALOG_VARIATION.find(pattern => pattern.test(subject));
      const currentHostOnly = CURSOR_REPORTED_ROUTE_ONLY.find(pattern => pattern.test(subject));
      assert(!!variation && !!currentHostOnly,
        'A10-delegation/cursor-host-mutation: rendered Cursor guidance exposes both catalog-variation and current-host-only seams');
      if (variation && currentHostOnly) {
        const frozenEnum = subject
          .replace(variation, 'one cursor catalog')
          .replace(currentHostOnly, 'always use that fixed catalog');
        const frozenGaps = runtimeDelegationGaps('cursor', frozenEnum);
        assert(frozenEnum !== subject
          && frozenGaps.includes('host-catalog-variation')
          && frozenGaps.includes('reported-route-only'),
        'A10-delegation/cursor-host-mutation: universalizing one measured Cursor enum fails host-scoped acceptance');
      }
      const catalogMiss = /capability_gap, not an install miss/;
      assert(catalogMiss.test(subject),
        'A10-delegation/cursor-catalog-miss-mutation: rendered Cursor guidance names already-present plus built-in-only as capability_gap, not an install miss');
      const strippedMiss = subject.replace(catalogMiss, 'proceed with named omit-model dispatch');
      const missGaps = runtimeDelegationGaps('cursor', strippedMiss);
      assert(strippedMiss !== subject && missGaps.includes('catalog-miss-capability-gap'),
        'A10-delegation/cursor-catalog-miss-mutation: restoring already-present → named omit-model fails catalog-miss acceptance');
      assert(subject.includes('does not write an ambient git repository'),
        'A10-delegation/cursor-global-first-mutation: rendered Cursor guidance forbids ambient Git writes from --global');
      const strippedAmbient = subject.replaceAll('does not write an ambient git repository',
        'also mirrors into the invoking git work tree');
      const ambientGaps = runtimeDelegationGaps('cursor', strippedAmbient);
      assert(strippedAmbient !== subject && ambientGaps.includes('global-install-no-ambient-repo'),
        'A10-delegation/cursor-global-first-mutation: restoring ambient dual-write fails global-first acceptance');
      assert(subject.includes('product surfaces are cli and app'),
        'A10-delegation/cursor-app-cli-mutation: rendered Cursor guidance names CLI and App as distinct product surfaces');
      const strippedAppCli = subject.replaceAll('product surfaces are cli and app',
        'one cursor product surface');
      const appCliGaps = runtimeDelegationGaps('cursor', strippedAppCli);
      assert(strippedAppCli !== subject && appCliGaps.includes('cursor-app-cli-distinct'),
        'A10-delegation/cursor-app-cli-mutation: collapsing App into CLI fails surface acceptance');
      assert(subject.includes('app local ide and app-started cloud'),
        'A10-delegation/cursor-app-host-mutation: rendered Cursor guidance separates App local IDE from App-started Cloud');
      const strippedHosts = subject.replaceAll('app local ide and app-started cloud', 'the app host');
      const hostGaps = runtimeDelegationGaps('cursor', strippedHosts);
      assert(strippedHosts !== subject && hostGaps.includes('app-cloud-not-local-ide'),
        'A10-delegation/cursor-app-host-mutation: collapsing Cloud into local IDE fails host acceptance');
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

    const rosterWitness = guidanceByAdapter.values().next().value || '';
    if (tierRosterGaps(rosterWitness, intentRosters).length === 0) {
      const missingStandardRole = intentRosters.standard[0];
      const mutatedRoster = rosterWitness.replaceAll(missingStandardRole, 'missing-standard-role');
      assert(tierRosterGaps(mutatedRoster, intentRosters).includes('standard-role-roster'),
        'A10-delegation/roster-mutation: deleting one behavior-authority member from its rendered tier makes the roster fail');
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
    const rosterGaps = tierRosterGaps(carrier.content, intentRosters);
    assert(choiceContract(carrier.content) === common,
      `A10-delegation/carrier[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: fresh render carries the one common item-local decision contract`);
    assert(gaps.length === 0,
      `A10-delegation/carrier[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: ${carrier.label} states native lookup/carrier/tier/fallback semantics — missing ${JSON.stringify(gaps)}`);
    assert(rosterGaps.length === 0,
      `A10-delegation/carrier-roster[${carrier.runtime}/${carrier.forge}/${carrier.topic}]: ${carrier.label} exposes the behavior-authority standard/reasoning/heavy role roster — missing ${JSON.stringify(rosterGaps)}`);
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

  const codexFinalize = carriers.find(carrier => carrier.runtime === 'codex'
    && carrier.forge === 'github' && carrier.topic === 'finalize');
  if (codexFinalize) {
    let armed = codexFinalize.content;
    for (const role of ['tdd-guide', 'build-error-resolver', 'doc-updater']) {
      const safeName = `finalize_${role.replace(/-/g, '_')}`;
      const ensured = mutateConcreteDispatchBlock('codex', armed, role, block =>
        quotedCallField(block, 'task_name') !== null
          ? block
          : block.replace(/(^\s*agent_type\s*=.*$)/m, `$1\n  task_name="${safeName}",`));
      assert(ensured.changed,
        `A10-delegation/codex-task-name-mutation[${role}]: real finalize render contains the role's concrete spawn_agent example`);
      armed = ensured.output;
    }
    assert(dispatchDefaultGaps('codex', armed, roleContracts).length === 0,
      'A10-delegation/codex-task-name-mutation: completing only the missing safe role task names makes the current concrete examples structurally valid');
    const deleted = mutateConcreteDispatchBlock('codex', armed, 'tdd-guide', block =>
      block.replace(/^\s*task_name\s*=.*\n/m, ''));
    const deletedGaps = dispatchDefaultGaps('codex', deleted.output, roleContracts);
    assert(deleted.changed && deletedGaps.includes('tdd-guide-task-name-required'),
      'A10-delegation/codex-task-name-mutation RED: deleting task_name from an otherwise valid concrete V2 call is detected');
  }

  // Concrete-call mutation bites are conditional on the subject becoming compliant: corrupt one
  // role's call-carried default while leaving the tier table and prose untouched. This catches the
  // review's believable near miss where guidance describes the right default but the executable
  // call still inherits or selects the wrong child configuration.
  for (const runtime of ['claude', 'codex']) {
    const subject = carriers.find(carrier => carrier.runtime === runtime
      && carrier.forge === 'github' && carrier.topic === 'finalize');
    if (!subject || dispatchDefaultGaps(runtime, subject.content, roleContracts).length !== 0) continue;
    const corrupted = runtime === 'claude'
      ? subject.content.replace(/model\s*=\s*["']sonnet["']/, 'model="opus"')
      : subject.content.replace(/reasoning_effort\s*=\s*["']max["']/, 'reasoning_effort="low"');
    const corruptedGaps = dispatchDefaultGaps(runtime, corrupted, roleContracts);
    assert(corrupted !== subject.content
      && corruptedGaps.includes(runtime === 'claude'
        ? 'tdd-guide-default-model' : 'tdd-guide-default-effort'),
    `A10-delegation/finalize-default-mutation[${runtime}]: corrupting a concrete standard-tier call fails even when the surrounding tier table remains correct`);
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
