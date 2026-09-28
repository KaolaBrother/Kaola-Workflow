#!/usr/bin/env node
'use strict';

// Issue #1033 — acceptance for the AGENTS-first, runtime-adapted architecture.
//
// This suite owns outcomes, not a source directory or serialization format. Kaola-Workflow defines
// no subagent roles, role profiles, or subagent model and effort bindings (#1101, ADR 0029): the
// runtime adapter facts (scripts/runtime-adapter-facts.js over templates/agents/runtime-
// capabilities.json) record only what each host itself provides, and the one native-only dispatch
// contract is rendered beside them on every Next/Finalize carrier. The suite asks the production
// adapter-facts module and routing engine for their real inputs and renders, then mutates those
// inputs in memory. Generated renders are the subject; mocks replace neither the renderer nor its
// source data.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// The seven roles #1101 retired. Named here only so the native-only detectors can recognise a
// reintroduction; no current surface may carry them.
const RETIRED_ROLE_NAMES = Object.freeze([
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'tdd-guide',
]);
const RUNTIME_NAMES = Object.freeze([
  'claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin', 'droid', 'dsh',
]);
const SORTED_RUNTIME_NAMES = Object.freeze(sorted(RUNTIME_NAMES));
// The two sentences the native-only dispatch contract carries (ADR 0029 decision 2).
const NATIVE_ONLY_STATEMENTS = Object.freeze([
  'Kaola-Workflow defines no subagent roles, role profiles, or subagent model and effort bindings.',
  'Kaola-Workflow installing no profiles is never evidence that the host lacks subagent capability.',
]);

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

function sorted(values) {
  return [...values].sort();
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

function roleNamesIn(text) {
  const prose = String(text || '').toLowerCase();
  return RETIRED_ROLE_NAMES.filter(role => new RegExp(`(?:^|[^a-z0-9-])${role}(?:$|[^a-z0-9-])`).test(prose));
}

// #1101 — the retired role layer, as it used to appear in adapter renders and dispatch carriers: a
// `**Roles:**` roster, a `**Subagent default:**` binding, a pinned subagent model or effort, a
// Kaola profile lookup path, the "installs no Kaola role profiles" design sentence, a named-role
// `capability_gap`, and any retired role name. A native-only surface carries none of them.
const RETIRED_BINDING_PATTERNS = Object.freeze([
  ['roles-roster', /\*\*roles:\*\*/i],
  ['subagent-default', /\*\*subagent default:\*\*|subagent[ _]default/i],
  ['pinned-model', /gpt-6-luna|gpt-5\.6-sol|grok-4\.7|\bmodel\s*[:=]\s*["'`]?(?:sonnet|opus|haiku|fable|inherit)\b/i],
  ['pinned-effort', /model_reasoning_effort|\[effort=/i],
  ['profile-lookup', /\.(?:claude|grok|cursor)\/agents\/|\.codex\/agents\/kaola-workflow|<role>\.toml|installed\s+`?agents\.toml`?|find[^.]{0,120}\bagents\.toml\b/i],
  ['kaola-profile', /kaola role profiles?|named kaola role/i],
  ['capability-gap', /capability_gap/],
]);

function retiredBindingHits(text) {
  const hits = RETIRED_BINDING_PATTERNS.filter(([, pattern]) => pattern.test(String(text || '')))
    .map(([name]) => name);
  for (const role of roleNamesIn(text)) hits.push('role:' + role);
  return hits;
}

// Mutation proof: the retired single Codex binding (the #1049/#1062 carrier text) is flagged on
// every axis it used to carry, and native adapter prose passes.
const RETIRED_CODEX_BINDING_FIXTURE = [
  '**Subagent default:** every installed Kaola TOML profile pins `model = "gpt-6-luna"`',
  'and `model_reasoning_effort = "max"`; file values take precedence.',
  '**Roles:** `implementer`, `tdd-guide`.',
].join(' ');
{
  const hits = retiredBindingHits(RETIRED_CODEX_BINDING_FIXTURE);
  for (const expected of ['subagent-default', 'pinned-model', 'pinned-effort', 'roles-roster',
    'role:implementer', 'role:tdd-guide']) {
    assert(hits.includes(expected), `A1049/oracle RED: the retired Codex binding is flagged as ${expected}`);
  }
  assert(retiredBindingHits('Dispatch with the `spawn_agent` schema this Codex host exposes; child model and '
    + 'reasoning effort follow Codex\'s own defaults and the user\'s configuration.').length === 0,
  'A1049/oracle: native Codex adapter prose carries no retired binding');
  assert(retiredBindingHits('Look up `.codex/agents/kaola-workflow/<role>.toml` first.').includes('profile-lookup'),
    'A1049/oracle RED: a Kaola Codex profile lookup is flagged');
  assert(retiredBindingHits('Every generated agent pins grok-4.7[effort=medium].').includes('pinned-effort'),
    'A1049/oracle RED: a pinned Cursor/Grok model-effort carrier is flagged');
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

// #1101 — a concrete dispatch call names a host-reported type and carries no per-call model or
// effort pin; the retired finalize role call card (`Agent(subagent_type="implementer", …)`) and
// its per-call default model/effort must not return.
function concreteCallViolations(runtime, text) {
  const typeField = runtime === 'codex' ? 'agent_type' : 'subagent_type';
  const violations = [];
  for (const [index, block] of concreteDispatchBlocks(runtime, text).entries()) {
    const type = quotedCallField(block, typeField);
    if (type && RETIRED_ROLE_NAMES.includes(type)) violations.push(`call-${index}-retired-role`);
    if (quotedCallField(block, 'model') !== null) violations.push(`call-${index}-pinned-model`);
    if (quotedCallField(block, 'reasoning_effort') !== null) violations.push(`call-${index}-pinned-effort`);
  }
  return violations;
}

function codexV2FieldHits(text) {
  return String(text || '').split(/\r?\n/)
    .filter(line => /^\s*(?:task_name|agent_type|message|reasoning_effort|fork_turns)\s*=/.test(line));
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
  // #1101: the decision contract no longer reasons from a named role. The old premise ("the absence
  // of an exact named role is not proof that all native dispatch is unavailable") is replaced by
  // the native-only statement that Kaola installing no profiles is never evidence of absent
  // capability, which dispatchContractGaps requires of the full block.
  if (/named role/.test(prose)) gaps.push('retired-named-role-premise');
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

  const prose = normalizedProse(block).toLowerCase();
  if (/choose dispatch or inline per item/.test(prose)) gaps.push('retired-dispatch-policy');
  for (const statement of NATIVE_ONLY_STATEMENTS) {
    if (!prose.includes(normalizedProse(statement).toLowerCase())) gaps.push('native-only-statement');
  }
  // The host, not Kaola, decides child model, effort, tools, nesting, concurrency, isolation, and
  // resume; a required native type is one the host reports, under its real meaning (the native
  // successor of the retired no-impersonation rule).
  if (!/own defaults, limits, and permissions.{0,80}user's explicit instructions.{0,12}decide model, effort/.test(prose)) {
    gaps.push('host-owned-bindings');
  }
  if (!/where the native schema requires a type, pass one the host reports, under its real meaning/.test(prose)) {
    gaps.push('reported-type-real-meaning');
  }
  if (/capability_gap/.test(prose)) gaps.push('retired-capability-gap');
  if (/named role/.test(prose) || roleNamesIn(block).length > 0) gaps.push('retired-role-layer');
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

const CURSOR_REPORTED_ROUTE_ONLY = Object.freeze([
  /use only .*this host.*report/, /only .*currently reported/, /route.*when .*host.*reports/,
]);

function runtimeDelegationGaps(runtime, text) {
  const prose = normalizedProse(text).toLowerCase();
  const gaps = [];
  const needs = (name, alternatives) => {
    if (!alternatives.some(pattern => pattern.test(prose))) gaps.push(name);
  };

  // Runtime adapters own only runtime-specific facts. The universal item-local judgment and the
  // native-only rule are checked once in the marked shared dispatch block (dispatchContractGaps).
  // #1101: an adapter names the host it applies to, the host's own native dispatch carrier and
  // routes, and — where the host documents it — that child model and effort are host-owned. It
  // carries no role roster, subagent default, pinned model or effort, or Kaola profile lookup.
  const host = runtime === 'dsh' ? 'dsh' : runtime;
  needs('host-boundary', [new RegExp(`if the running host is not ${host}, ignore this adapter section`)]);
  const runtimeNeeds = {
    cursor: [
      ['host-catalog-variation', [/cli, app local, and app cloud are separate hosts/]],
    ],
    zcode: [['compact-recovery', [/native skill invocation/]]],
    devin: [['compact-recovery', [/userpromptsubmit/]]],
  };
  for (const [name, alternatives] of runtimeNeeds[runtime] || []) needs(name, alternatives);
  for (const hit of retiredBindingHits(text)) gaps.push('retired:' + hit);
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
        : runtime === 'zcode'
          ? edition.renderSkill(content, edition.skillNameForCommandBase(basename), row.forge)
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

// A2 — root project instructions are a single repository-level surface. #1080: Claude Code
// (>= 2.1.277) reads AGENTS.md directly, but any root CLAUDE.md / .claude/CLAUDE.md /
// CLAUDE.local.md shadows it. The repository ships none; this negative pin replaces the retired
// "exactly one @AGENTS.md bridge" assertion.
for (const shadowing of ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md']) {
  assert(!fs.existsSync(path.join(ROOT, shadowing)),
    'A2: no root ' + shadowing + ' — AGENTS.md is the only repository-level instruction surface');
}

// A3 — workflow-init is a project-only consumer of a compatible global contract.
const initSource = read('templates/routing/init.skeleton.md') || '';
// #1095 (receipt I4): the single-file loop became a direct `test ! -f AGENTS.md || { … cat AGENTS.md; }`;
// the outcome pinned — root AGENTS.md is read, by name, with no discovery — is unchanged.
assert(/test ! -f AGENTS\.md \|\| \{ printf '\\n--- AGENTS\.md ---\\n'; cat AGENTS\.md; \}/.test(initSource)
    && /for file in CLAUDE\.md \.claude\/CLAUDE\.md CLAUDE\.local\.md; do/.test(initSource)
    && /SHADOWING INSTRUCTION FILE/.test(initSource)
    && !/git ls-files|find \. -name AGENTS\.md/.test(initSource),
  'A3: workflow-init reads root AGENTS.md and reports shadowing repository CLAUDE.md files '
    + 'without Git-index or repository-wide discovery');
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
  // #1101: custody is a task/result constraint — "the implementation", not a named role.
  const teachesTestOwnerRepair = text =>
    /(?:implementer|implementation|test author) may delete, weaken, or reinterpret (?:that acceptance|them) to pass/i.test(norm(text));
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
    /the implementation does not delete, weaken, or reinterpret them to pass/i,
    'the implementation may delete, weaken, or reinterpret them to pass')),
  'A3[mission-granularity] mutation RED: silent production repair by the test/implementer owner is detected');

  const retired = /Repair or re-review work (?:must append|appends) (?:a )?new mission(?: rather than rewriting the closed item)?\./i;
  const keepsFinalizationOutsideList = text => {
    const n = norm(text);
    return /Finalization, Issue closure, archive, and sink are not missions\./i.test(n)
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
    return /Finalization, issue closure, archive, and sink are not missions/i.test(n)
      && /last mission[^.]*readiness/i.test(n)
      && /lifecycle records[^.]*final truth/i.test(n);
  };
  const globalAttemptBoundary = text => {
    const n = norm(text);
    return /A mission is a recoverable outcome/i.test(n)
      && /A failed command, intermediate finding, repair attempt, or review round does not create another mission/i.test(n);
  };
  const nextMissionEnumeration = text => {
    const n = norm(text);
    return /An item is a mission — a recoverable outcome/i.test(n)
      && /Append a mission only for a new recoverable outcome/i.test(n)
      && /independent causal class/i.test(n);
  };
  assert(globalLifecycleBoundary(globalContract)
      && issue1042OperationSources.every(text => !/Finalization[^.]*are missions/i.test(norm(text))),
    'A3[issue-1042]: global authority keeps lifecycle work outside the mission ledger and operations do not contradict it');
  assert(issue1042OperationSources.every(text => !retired.test(norm(text))),
    'A3[issue-1042]: next/finalize reject the old absolute repair/re-review append rule');
  assert(globalAttemptBoundary(globalContract)
      && issue1042OperationSources.every(text => !/repair or re-review work must append/i.test(norm(text))),
    'A3[issue-1042]: global authority keeps attempts inside the recoverable outcome and operations do not restore attempt missions');
  assert(nextMissionEnumeration(nextSource),
    'A3[issue-1042]: Next teaches the mission-is-not enumeration and causal-class append judgment');
  assert(compactRecoverySources.every(text => text.split(globalContract.trim()).length - 1 === 1),
    'A3[issue-1042]: every compact prompt reloads the exact global contract once');
  assert(compactRecoverySources.every(text => globalAttemptBoundary(text)
    && globalLifecycleBoundary(text)),
    'A3[issue-1042]: compact recovery retains attempt/lifecycle boundary through the global source');
  const compactSurfaceNorms = compactRecoverySources.map(norm);
  assert(compactSurfaceNorms.every(text => /A `done` or `failed` line is immutable/i.test(text)
    && /one dispatch has one result/i.test(text)),
    'A3[issue-1042]: generated compact prompts retain immutability and one-dispatch/one-result invariants');
  const fixture = 'Finalization, Issue closure, archive, and sink are not missions. The last run mission establishes readiness for finalization. The finalization summary, closure evidence, archive state, and sink receipt own the transaction\'s truth. A failed command, intermediate finding, repair attempt, or review round does not by itself create a mission. Keep working within the current promised outcome while custody and causal boundary remain unchanged. Append a mission only for a new recoverable outcome that changes custody or for a newly discovered independent causal class.';
  assert(keepsFinalizationOutsideList(fixture) && keepsAttemptsInsideOutcome(fixture),
    'A3[issue-1042] mutation setup: canonical boundary fixture is accepted');
  assert(!keepsFinalizationOutsideList(fixture.replace('are not', 'are')),
    'A3[issue-1042] mutation RED: finalization inside the mission ledger is rejected');
  assert(!keepsAttemptsInsideOutcome(fixture.replace('does not by itself', 'must')),
    'A3[issue-1042] mutation RED: one mission per repair/re-review attempt is rejected');
  const compactRecoveryMutationSubject = compactRecoverySources[0] || '';
  assert(!nextMissionEnumeration(nextSource.replace(
    /An item is a mission — a recoverable outcome/i, 'An item is a specification and selector')),
  'A3[issue-1042] next mutation RED: mission enumeration teaching is rejected');
  assert(!/Finalization, issue closure, archive, and sink are not missions/i.test(
    compactRecoveryMutationSubject.replace('are not missions', 'are missions')),
  'A3[issue-1042] compact-prompt mutation RED: finalization inside the mission ledger is rejected');
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

// A5 — Kaola-Workflow defines no subagent roles (#1101, ADR 0029). There is no profile generator and
// no role behavior authority; the one adapter-facts module exposes measured runtime facts and their
// rendered adapter section, and nothing that renders or enumerates a role.
const generatorCandidates = fs.readdirSync(path.join(ROOT, 'scripts'))
  .filter(name => /^generate-.*profiles\.js$/.test(name))
  .sort();
assert(generatorCandidates.length === 0,
  'A5: no profile generator exists — found ' + JSON.stringify(generatorCandidates));
// Name assembled so the native-only guard's retired-caller scan does not read this absence check
// as a caller of the retired authority.
assert(!fs.existsSync(path.join(ROOT, 'templates', 'agents', ['behavior-contracts', 'json'].join('.'))),
  'A5: no role behavior authority exists');

const ADAPTER_FACTS_PATH = 'scripts/runtime-adapter-facts.js';
let adapterFacts = null;
try { adapterFacts = require(path.join(ROOT, ADAPTER_FACTS_PATH)); }
catch (error) { assert(false, 'A5: the runtime adapter-facts module loads — ' + error.message); }
adapterFacts = adapterFacts || {};
for (const api of [
  'loadRuntimeAdapters', 'validateRuntimeAdapters', 'runtimeAdapter', 'runtimeHostName',
  'renderRuntimeDelegationGuidance', 'renderRuntimeDelegationGuidanceForRuntime',
  'replaceRuntimeDelegationGuidance', 'deferRuntimeDispatchBlock',
]) {
  assert(typeof adapterFacts[api] === 'function', `A5: ${ADAPTER_FACTS_PATH} exposes ${api}`);
}
for (const retiredApi of [
  'renderProfiles', 'loadBehaviorContracts', 'checkGeneratedProfiles', 'renderRuntimeRole',
  'ROLES', 'BEHAVIOR_SOURCE',
]) {
  assert(!Object.prototype.hasOwnProperty.call(adapterFacts, retiredApi),
    `A5: ${ADAPTER_FACTS_PATH} exposes no retired role/profile API ${retiredApi}`);
}

let adapters = null;
try { adapters = adapterFacts.loadRuntimeAdapters(ROOT); }
catch (error) { assert(false, 'A6: runtime adapter map loads and validates — ' + error.message); }

// A6 — ten declared runtime families, each native-only, and no Kaola role profile on any runtime.
const adapterView = adapterEntries(adapters);
const RETIRED_CAPABILITIES = Array.isArray(adapterFacts.RETIRED_CAPABILITIES)
  ? adapterFacts.RETIRED_CAPABILITIES : [];
assert(RETIRED_CAPABILITIES.length > 0
    && ['named_roles', 'role_dispatch', 'subagent_default', 'model_carrier', 'profile_format',
      'tool_binding', 'dispatch_conformance', 'capability_gap', 'intent_mapping']
      .every(key => RETIRED_CAPABILITIES.includes(key)),
  'A6: the adapter-facts module names every retired role/profile/model-binding capability it rejects');
assert(adapters && adapters.schema_version === 2,
  'A6: runtime adapter facts are schema_version 2 (native facts only)');
const declaredRuntimes = sorted(new Set(adapterView.entries.map(entry => entry.runtime).filter(Boolean)));
assert(JSON.stringify(declaredRuntimes) === JSON.stringify(SORTED_RUNTIME_NAMES),
  'A6: adapters declare all ten runtime families exactly — got ' + JSON.stringify(declaredRuntimes));
for (const runtime of RUNTIME_NAMES) {
  const entries = adapterView.entries.filter(entry => entry.runtime === runtime);
  assert(entries.length > 0, `A6[${runtime}]: a declared runtime adapter exists`);
  assert(entries.every(entry => {
    const capabilities = capabilityObject(entry.adapter);
    return capabilities && Object.keys(capabilities).length > 0;
  }), `A6[${runtime}]: adapter declares non-empty native capabilities`);
  assert(entries.every(entry => {
    const capabilities = capabilityObject(entry.adapter) || {};
    return RETIRED_CAPABILITIES.every(key => !Object.prototype.hasOwnProperty.call(capabilities, key));
  }), `A6[${runtime}]: adapter is native-only — it carries no retired role, profile, or model-binding capability`);
  assert(entries.every(entry => {
    const guidance = (capabilityObject(entry.adapter) || {}).delegation_guidance;
    return guidance && JSON.stringify(Object.keys(guidance).sort()) === JSON.stringify(['availability', 'native_routes']);
  }), `A6[${runtime}]: delegation guidance is exactly the host's native routes and their availability`);
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
      && entry.adapter.surfaces.app.execution_hosts.cloud.reload === 'new_same_repository_cloud_parent_after_environment_save'
      && !Object.prototype.hasOwnProperty.call(entry.adapter.surfaces.app.execution_hosts.cloud, 'named_catalog')
      && entry.adapter.surfaces.cli.execution_hosts
      && entry.adapter.surfaces.cli.execution_hosts.local
      && entry.adapter.surfaces.cli.execution_hosts.local.required_project_materialization === 'yes'),
      'A6[cursor]: surfaces split CLI from App, keep App-local discovery unknown, and carry no named role catalog');
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

// No runtime renders or ships a Kaola role profile: the Claude and Codex profile trees and the
// Codex registrations are gone, and no additive edition exports a profile renderer.
for (const relativePath of [
  'agents',
  ...['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'].flatMap(edition => [
    `plugins/${edition}/agents`, `plugins/${edition}/config/agents.toml`]),
]) {
  assert(!fs.existsSync(path.join(ROOT, relativePath)),
    `A6: no Kaola role profile tree or registration ships — ${relativePath}`);
}
for (const runtime of ['opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin', 'droid', 'dsh']) {
  const edition = require(path.join(ROOT, 'scripts', `sync-${runtime}-edition.js`));
  assert(!Object.prototype.hasOwnProperty.call(edition, 'renderAgent'),
    `A6[${runtime}]: the edition renders zero Kaola role profiles (no renderAgent)`);
}

// The adapter render is deterministic: identical adapter input renders byte-identical guidance.
if (adapters) {
  let reloaded = null;
  try { reloaded = adapterFacts.loadRuntimeAdapters(ROOT); } catch (_) { reloaded = null; }
  const renderAll = source => adapterEntries(source).entries
    .map(entry => [entry.name, adapterFacts.renderRuntimeDelegationGuidance(clone(entry.adapter))]);
  assert(reloaded && JSON.stringify(renderAll(adapters)) === JSON.stringify(renderAll(reloaded)),
    'A6: identical adapter inputs render byte-identical native guidance');
}

// A7 — the three Codex adapters are forge-neutral: one native guidance for every forge.
{
  const codexGuidance = adapterView.entries.filter(entry => entry.runtime === 'codex')
    .map(entry => adapterFacts.renderRuntimeDelegationGuidance(entry.adapter));
  assert(codexGuidance.length === 3 && new Set(codexGuidance).size === 1,
    'A7: forge-neutral Codex adapter guidance is byte-identical across the three forges');
}

// #1049/#1062 → #1101 — the single Codex child binding is retired. The carriers it used to reach
// (Codex Next, Finalize, and compact recovery) are checked on the generated subject, fresh and
// tracked, so a stale carrier cannot ship a pinned model while the adapter map looks native.
{
  const codexEntries = adapterView.entries.filter(entry => entry.runtime === 'codex');
  assert(codexEntries.length === 3
      && JSON.stringify(codexEntries.map(entry => entry.name).sort())
        === JSON.stringify(['codex-gitea', 'codex-github', 'codex-gitlab']),
    'A1049/source: exactly the GitHub, GitLab, and Gitea Codex adapters are covered');

  const sourceBindingHits = codexEntries.flatMap(entry => {
    const capabilities = capabilityObject(entry.adapter) || {};
    const hits = [];
    if (Object.prototype.hasOwnProperty.call(capabilities, 'subagent_default')) hits.push('subagent-default');
    if (Object.prototype.hasOwnProperty.call(capabilities, 'intent_mapping')
        || (capabilities.delegation_guidance
            && Object.prototype.hasOwnProperty.call(capabilities.delegation_guidance, 'tiers'))) {
      hits.push('retired-tier-axis');
    }
    return hits.map(hit => `${entry.name}/${hit}`);
  });
  assert(sourceBindingHits.length === 0,
    'A1049/source: no Codex adapter carries a subagent_default binding or a tier axis — found '
      + JSON.stringify(sourceBindingHits));

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

  const operationHits = freshOperationCarriers.flatMap(carrier =>
    retiredBindingHits(carrier.content).map(hit => `${carrier.label}/${hit}`));
  assert(freshOperationCarriers.length === 6 && operationHits.length === 0,
    'A1049/render: fresh Codex next/finalize carriers across all three forges carry no subagent '
      + 'binding, pinned model or effort, or role roster — found ' + JSON.stringify(operationHits));

  // #1054 item 25, the global-recovery dedupe: codex is not an always-loaded dispatch carrier
  // (RECOVERY_FULL_DISPATCH_RUNTIMES), so its compact-recovery render points at the full
  // Next/Finalize reload instead of restating the dispatch contract a second time.
  const codexKeepsDispatch = (Array.isArray(routing && routing.RECOVERY_FULL_DISPATCH_RUNTIMES)
    ? routing.RECOVERY_FULL_DISPATCH_RUNTIMES : ['grok', 'cursor']).includes('codex');
  const compactHits = freshCompactCarriers.flatMap(carrier =>
    retiredBindingHits(carrier.content).map(hit => `${carrier.label}/${hit}`));
  assert(freshCompactCarriers.length === 3 && compactHits.length === 0,
    'A1049/render: fresh Codex compact carriers carry no retired subagent binding — found '
      + JSON.stringify(compactHits));
  if (!codexKeepsDispatch) {
    const deferredGaps = freshCompactCarriers
      .filter(carrier => !/already carries the full runtime dispatch contract|does not restate/i.test(carrier.content))
      .map(carrier => carrier.label);
    assert(freshCompactCarriers.length === 3 && deferredGaps.length === 0,
      'A1049/render: fresh Codex compact carriers across all three forges point at the full '
        + 'reload instead of restating the dispatch contract — gaps ' + JSON.stringify(deferredGaps));
  }

  const trackedOperationRows = routing
    ? routing.GENERATED_SURFACES.filter(row => row.surface_type === 'skill'
      && ['next', 'finalize'].includes(row.topic))
    : [];
  const trackedRecoveryRows = routing
    ? routing.RUNTIME_RECOVERY_SURFACES.filter(row => row.runtime === 'codex')
    : [];
  const trackedOperationHits = trackedOperationRows.flatMap(row => {
    const content = read(row.path);
    if (typeof content !== 'string') return [`${row.path}/missing`];
    return retiredBindingHits(content).map(hit => `${row.path}/${hit}`);
  });
  assert(trackedOperationRows.length === 6 && trackedOperationHits.length === 0,
    'A1049/tracked: generated Codex next/finalize bytes across all three forges carry no retired '
      + 'subagent binding — found ' + JSON.stringify(trackedOperationHits));
  const trackedRecoveryGaps = trackedRecoveryRows.flatMap(row => {
    const content = read(row.path);
    if (typeof content !== 'string') return [`${row.path}/missing`];
    const hits = retiredBindingHits(content).map(hit => `${row.path}/${hit}`);
    if (!codexKeepsDispatch && !/already carries the full runtime dispatch contract|does not restate/i.test(content)) {
      hits.push(`${row.path}/deferred-note-missing`);
    }
    return hits;
  });
  assert(trackedRecoveryRows.length === 3 && trackedRecoveryGaps.length === 0,
    'A1049/tracked: generated Codex compact-recovery bytes across all three forges match this '
      + 'runtime\'s carrier role and carry no retired binding — gaps ' + JSON.stringify(trackedRecoveryGaps));
}

// A8 — provenance is outside every generated prompt but remains durable and discoverable.
const provenancePattern = /Everything Claude Code|\bvendored\b|upstream provenance|source-commit|source-blob-sha|\bcopyright\b|\blicense:\s*/i;
{
  const routing = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
  const promptBytes = new Map();
  for (const row of [...routing.GENERATED_SURFACES, ...routing.RUNTIME_RECOVERY_SURFACES]) {
    promptBytes.set(row.path, read(row.path) || '');
  }
  for (const entry of adapterView.entries) {
    promptBytes.set(`adapter:${entry.name}`, adapterFacts.renderRuntimeDelegationGuidance(entry.adapter));
  }
  for (const carrier of ['next', 'finalize'].flatMap(topic => freshRoutingCarriers(topic))) {
    promptBytes.set(`${carrier.label}/${carrier.topic}`, carrier.content);
  }
  assert(promptBytes.size > 24, 'A8: the provenance scan covers tracked surfaces, adapter renders, and edition carriers');
  const provenanceOutputs = [...promptBytes]
    .filter(([, content]) => provenancePattern.test(content))
    .map(([relativePath]) => relativePath);
  assert(provenanceOutputs.length === 0,
    'A8: generated agent-facing prompt bytes contain no provenance narration — found '
    + JSON.stringify(provenanceOutputs));
}
const provenanceDoc = read('docs/agents-source.md') || '';
// #1101: provenance.json is schema 3 — history only, one `retired_roles` record per role retired by
// #1101, plus an `earlier_retired_roles` record for each role retired by #1062 whose earlier contract
// carried an ECC `history` (build-error-resolver, code-architect, planner). docs/agents-source.md
// documents both under "Historical origin" with the ECC origin facts, and says truthfully where
// ECC-derived bytes still exist (repository-only migration fixtures, excluded from the package).
const ECC_EARLIER_RETIRED = ['build-error-resolver', 'code-architect', 'planner'];
for (const token of [
  'Repository:', 'Pinned commit:', 'Upstream blob SHA', 'License:', 'Copyright:',
  'kaola_authored', 'Historical origin', 'retired_roles', 'earlier_retired_roles',
  'code-explorer', 'doc-updater', 'tdd-guide', ...ECC_EARLIER_RETIRED,
  'scripts/fixtures/issue-1101/',
]) {
  assert(provenanceDoc.includes(token), `A8: durable provenance metadata records ${token}`);
}
assert(!/No current file contains that material/.test(provenanceDoc),
  'A8: the doc must not claim no current file contains ECC-derived material (the migration fixtures do)');
{
  let provenance = null;
  try { provenance = JSON.parse(read('templates/agents/provenance.json') || 'null'); } catch (_) { provenance = null; }
  const retired = provenance && provenance.retired_roles ? provenance.retired_roles : {};
  assert(provenance && provenance.schema_version === 3
      && JSON.stringify(sorted(Object.keys(retired))) === JSON.stringify(RETIRED_ROLE_NAMES)
      && Object.values(retired).every(record => record.retired_by === '#1101'),
    'A8: provenance.json (schema 3) keeps one retired_roles history record per role retired by #1101');
  const earlier = provenance && provenance.earlier_retired_roles ? provenance.earlier_retired_roles : {};
  assert(JSON.stringify(sorted(Object.keys(earlier))) === JSON.stringify(sorted(ECC_EARLIER_RETIRED))
      && ECC_EARLIER_RETIRED.every(role => earlier[role].retired_by === '#1062'
        && earlier[role].history && earlier[role].history.origin === 'everything_claude_code'
        && earlier[role].history.source_commit === '922d2d8f8b64f4e50936e24465cb3bcac81ac0e1'),
    'A8: provenance.json keeps the ECC history of the three roles retired by #1062');
}

// A9 — mutation proof: the one shared dispatch contract reaches every runtime carrier. The contract
// is a single slot (templates/routing/dispatch-contract.md); a marker written into it in memory must
// reach every fresh Next/Finalize carrier — the always-loaded recovery render on full-dispatch
// runtimes, the operation render elsewhere — and vanish again once restored.
{
  const routing = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
  const { SLOTS } = require('../templates/routing/slots.js');
  const FULL_DISPATCH = routing.RECOVERY_FULL_DISPATCH_RUNTIMES;
  const marker = 'Shared dispatch mutation witness 1101.';
  const original = SLOTS['runtime-dispatch-common'];
  const subjectOf = carrier => FULL_DISPATCH.includes(carrier.runtime)
    ? routing.renderCompactRecoveryPrompt(carrier.runtime, carrier.forge)
    : carrier.content;
  let reached = [];
  let missed = [];
  try {
    SLOTS['runtime-dispatch-common'] = original + '\n\n' + marker;
    for (const carrier of ['next', 'finalize'].flatMap(topic => freshRoutingCarriers(topic))) {
      (subjectOf(carrier).includes(marker) ? reached : missed).push(`${carrier.runtime}/${carrier.forge}/${carrier.topic}`);
    }
  } finally {
    SLOTS['runtime-dispatch-common'] = original;
  }
  assert(reached.length === 42 && missed.length === 0,
    'A9: a shared dispatch-contract mutation reaches every runtime carrier — missed ' + JSON.stringify(missed));
  assert(['claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode'].every(runtime =>
    reached.some(label => label.startsWith(runtime + '/'))),
  'A9: shared dispatch-contract mutation reaches every carrier runtime family');
  const restored = ['next', 'finalize'].flatMap(topic => freshRoutingCarriers(topic))
    .filter(carrier => subjectOf(carrier).includes(marker));
  assert(restored.length === 0, 'A9: restoring the shared contract removes the mutation witness everywhere');
}

// A10 — the adapter validator is the native-only gate: every real adapter passes, deleting a
// required capability is rejected, and reintroducing any retired role, profile, or model-binding
// capability (subagent_default, role_dispatch, tool_binding, …) or a role/tier key inside the
// delegation guidance is rejected.
if (adapters && typeof adapterFacts.validateRuntimeAdapters === 'function') {
  const rejects = source => {
    try { adapterFacts.validateRuntimeAdapters(source); return false; } catch (_) { return true; }
  };
  assert(!rejects(clone(adapters)), 'A10: the real adapter map validates');
  const cursorEntry = adapterView.entries.find(entry => entry.runtime === 'cursor');
  const codexEntry = adapterView.entries.find(entry => entry.name === 'codex-github');
  assert(!!cursorEntry && !!codexEntry, 'A10: cursor and codex-github adapters exist for mutation proofs');
  if (cursorEntry && codexEntry) {
    for (const key of ['instruction_loading', 'hook_scope', 'delegation_guidance']) {
      const deleted = clone(adapters);
      deleteCapability(deleted, cursorEntry, key);
      assert(rejects(deleted), `A10: deleting the required cursor capability ${key} is rejected`);
    }
    const reintroduced = {
      subagent_default: { model: 'gpt-6-luna', effort: 'max' },
      role_dispatch: 'named_profile',
      named_roles: [...RETIRED_ROLE_NAMES],
      tool_binding: 'profile_tools',
      model_carrier: 'frontmatter',
    };
    for (const key of RETIRED_CAPABILITIES) {
      for (const entry of [cursorEntry, codexEntry]) {
        const mutated = clone(adapters);
        setCapability(mutated, entry, key, Object.prototype.hasOwnProperty.call(reintroduced, key)
          ? clone(reintroduced[key]) : 'reintroduced');
        assert(rejects(mutated), `A10: reintroducing the retired capability ${key} on ${entry.name} is rejected`);
      }
    }
    for (const key of ['roles', 'tiers', 'subagent_default']) {
      const mutated = clone(adapters);
      adapterEntries(mutated).root[codexEntry.name].capabilities.delegation_guidance[key] = 'reintroduced';
      assert(rejects(mutated), `A10: a ${key} key inside codex-github delegation guidance is rejected`);
    }
  }

  // Isolation through the production file-backed API: a cursor adapter change written to a
  // disposable root reaches every and only the cursor adapter render.
  if (cursorEntry) {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-adapter-isolation-'));
    try {
      const mutated = clone(adapters);
      const marker = 'kw-cursor-adapter-mutation-1101';
      adapterEntries(mutated).root[cursorEntry.name].capabilities.delegation_guidance.native_routes += ' ' + marker;
      const target = path.join(sandbox, 'templates', 'agents', 'runtime-capabilities.json');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(mutated, null, 2) + '\n');
      const changed = [];
      for (const runtime of RUNTIME_NAMES) {
        for (const forge of runtime === 'codex' ? ['github', 'gitlab', 'gitea'] : ['github']) {
          const before = adapterFacts.renderRuntimeDelegationGuidanceForRuntime(runtime, forge, ROOT);
          const after = adapterFacts.renderRuntimeDelegationGuidanceForRuntime(runtime, forge, sandbox);
          if (before !== after) changed.push(runtime);
          if (runtime === 'cursor') {
            assert(after.includes(marker), 'A10: the cursor adapter mutation reaches the cursor render');
          }
        }
      }
      assert(JSON.stringify(sorted(new Set(changed))) === JSON.stringify(['cursor']),
        'A10: cursor adapter mutation changes only cursor-family renders — changed ' + JSON.stringify(changed));
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  }
}

// A10-native-carriers — #1101 retired the adapter-owned model and effort identifiers (Cursor's and
// Grok's `grok-4.7`, Codex's `gpt-6-luna`/`max`, Claude's `sonnet`). No adapter capability, no
// rendered adapter section, and no line of the adapter-facts renderer pins a subagent model or
// effort; child model and effort belong to the host and the user.
{
  const MODEL_PIN = /gpt-\d[\w.-]*|grok-\d[\w.-]*|\b(?:sonnet|opus|haiku|fable)\b|\[effort=|model_reasoning_effort|\beffort\s*[:=]\s*["'`]?(?:low|medium|high|xhigh|max)\b/i;
  for (const entry of adapterView.entries) {
    const capabilities = JSON.stringify(capabilityObject(entry.adapter) || {});
    const guidance = adapterFacts.renderRuntimeDelegationGuidance(entry.adapter);
    const hit = capabilities.match(MODEL_PIN) || guidance.match(MODEL_PIN);
    assert(!hit, `A10-native[${entry.name}]: adapter capabilities and render pin no subagent model or effort`
      + (hit ? ' — found ' + hit[0] : ''));
  }
  const factsSource = read(ADAPTER_FACTS_PATH) || '';
  const sourceHit = factsSource.match(MODEL_PIN);
  assert(factsSource.length > 0 && !sourceHit,
    'A10-native: the adapter-facts renderer contains no model or effort identifier'
    + (sourceHit ? ' — found ' + sourceHit[0] : ''));
  assert(MODEL_PIN.test('**Subagent default:** `grok-4.7[effort=medium]`')
      && MODEL_PIN.test('model = "gpt-6-luna"') && MODEL_PIN.test('model: sonnet'),
  'A10-native mutation RED: a reintroduced Grok/Cursor, Codex, or Claude model pin is detected');
}

// A10-delegation-routing — #1035. The observed Cursor run turned two item-local facts into a
// run-wide inline posture. Acceptance has two deliberately separate layers:
//
//   (1) one runtime-neutral decision contract, shared byte-for-byte from the AGENTS axiom through
//       the dispatch contract, workflow-next, finalize, and every fresh runtime render; and
//   (2) runtime-native execution guidance rendered from that runtime's adapter, because a generic
//       sentence cannot tell Cursor, Codex, Kimi, or any other host which child route it actually
//       exposes. #1101: that guidance names the host's own routes and never a Kaola role.
//
// Full native paragraphs are NOT required to match across runtimes. Only the common invariant does.
// The adapter field layout is also not an oracle: the production API receives an adapter object,
// and the mutation below proves some adapter-owned scalar reaches the rendered guidance.
{
  assert(!fs.existsSync(path.join(ROOT, 'templates/axioms.md')),
    'A10-delegation/common: templates/axioms.md is not an active policy source');

  const dispatchSource = read('templates/routing/dispatch-contract.md') || '';
  assert(!/Choose dispatch or inline per item/.test(dispatchSource),
    'A10-delegation/common-source: dispatch-contract.md does not carry a KW dispatch-or-inline policy');
  for (const statement of NATIVE_ONLY_STATEMENTS) {
    assert(dispatchSource.includes(statement),
      `A10-delegation/common-source: dispatch-contract.md states ${JSON.stringify(statement)}`);
  }
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

  const renderGuidance = adapterFacts.renderRuntimeDelegationGuidance;
  assert(typeof renderGuidance === 'function',
    'A10-delegation/adapter-api: the adapter-facts module exposes renderRuntimeDelegationGuidance(adapter)');

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
        `A10-delegation/adapter[${entry.name}]: guidance names its host boundary and native routes and carries no retired role layer — gaps ${JSON.stringify(gaps)}`);

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
    }

    // Codex lookup bite: the retired Kaola profile locators (the installed TOML profile path and the
    // agents.toml registration) must not return to the native Codex guidance.
    const codexEntry = adapterView.entries.find(entry => entry.runtime === 'codex');
    const codexGuidance = codexEntry ? guidanceByAdapter.get(codexEntry.name) : '';
    if (codexGuidance) {
      for (const injected of [
        'Look up `~/.codex/agents/kaola-workflow/<role>.toml` before dispatch.',
        'Find the role in the installed `agents.toml` registration.',
      ]) {
        assert(runtimeDelegationGaps('codex', codexGuidance + '\n' + injected).includes('retired:profile-lookup'),
          `A10-delegation/codex-lookup-mutation RED: reintroducing a Kaola profile locator is detected — ${injected}`);
      }
    }

    // Roster bite: no adapter render carries a role roster, and reintroducing one into a native
    // render is detected (the retired common-roster witness, inverted).
    const rosterWitness = guidanceByAdapter.get('claude') || '';
    assert(rosterWitness.length > 0 && !/\*\*Roles:\*\*/.test(rosterWitness),
      'A10-delegation/common-roster: the Claude adapter render carries no Kaola role roster');
    const withRoster = rosterWitness.replace('## Runtime adapter facts',
      '## Runtime adapter facts\n\n**Roles:** `' + RETIRED_ROLE_NAMES.join('`, `') + '`.');
    const rosterGaps = runtimeDelegationGaps('claude', withRoster);
    assert(withRoster !== rosterWitness && rosterGaps.includes('retired:roles-roster')
        && RETIRED_ROLE_NAMES.every(role => rosterGaps.includes('retired:role:' + role)),
    'A10-delegation/roster-mutation RED: reintroducing the seven-role roster into an adapter render is detected');
  }

  function adapterForCarrier(carrier) {
    if (carrier.runtime === 'codex') {
      return adapterView.entries.find(entry => entry.name === 'codex-' + carrier.forge);
    }
    return adapterView.entries.find(entry => entry.runtime === carrier.runtime);
  }

  // #1069: on always-loaded-carrier runtimes the marked dispatch region lives in the rule /
  // compact-recovery carrier; the command render carries only the pointer. Everything that proved
  // contract completeness is therefore measured against the recovery render for those runtimes.
  const routingMod = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
  const FULL_DISPATCH = routingMod.RECOVERY_FULL_DISPATCH_RUNTIMES;
  const dispatchPointer = adapterFacts.ALWAYS_LOADED_DISPATCH_POINTER;
  assert(typeof dispatchPointer === 'string' && dispatchPointer.length > 0,
    'A10-delegation/pointer: the adapter-facts module exports the always-loaded dispatch pointer');
  const dispatchPointerHolds = content => !/<!--\s*KW-RUNTIME-DISPATCH-(?:START|END)\s*-->/.test(content)
    && content.split(dispatchPointer).length - 1 === 1
    && !/Runtime dispatch contract \(always loaded\)/.test(content);
  for (const carrier of carriers) {
    const fullDispatchCarrier = FULL_DISPATCH.includes(carrier.runtime);
    const subject = fullDispatchCarrier
      ? routingMod.renderCompactRecoveryPrompt(carrier.runtime, carrier.forge)
      : carrier.content;
    const where = `${carrier.runtime}/${carrier.forge}/${carrier.topic}`;
    if (fullDispatchCarrier) {
      assert(dispatchPointerHolds(carrier.content),
        `A10-delegation/pointer[${where}]: command render carries the pointer once, no dispatch markers, no restated contract heading`);
      const pointerless = carrier.content.replace(dispatchPointer, '');
      assert(!dispatchPointerHolds(pointerless),
        `A10-delegation/pointer-mutation RED[${where}]: deleting the pointer fails the pointer assertion`);
    }
    const gaps = runtimeDelegationGaps(carrier.runtime, subject);
    assert(!/Choose dispatch or inline per item/.test(subject),
      `A10-delegation/carrier[${where}]: fresh render carries no KW dispatch-or-inline policy`);
    const contractGaps = dispatchContractGaps(subject);
    assert(contractGaps.length === 0,
      `A10-delegation/contract[${where}]: fresh render carries one complete native-only dispatch contract — gaps ${JSON.stringify(contractGaps)}`);
    assert(gaps.length === 0,
      `A10-delegation/carrier[${where}]: ${carrier.label} states its runtime-native routes and no retired role layer — gaps ${JSON.stringify(gaps)}`);
    if (carrier.topic === 'next') {
      assert(!RETIRED_RUN_WIDE_INLINE.test(carrier.content),
        `A10-delegation/next-whole-surface[${carrier.runtime}/${carrier.forge}]: ${carrier.label} rejects the retired run-wide "cannot spawn a role agent -> inline" fallback anywhere in the render`);
    }
    if (carrier.runtime === 'claude' || carrier.runtime === 'codex') {
      const callViolations = concreteCallViolations(carrier.runtime, carrier.content);
      assert(callViolations.length === 0,
        `A10-delegation/concrete-calls[${where}]: no concrete dispatch call names a retired role or pins a per-call model${carrier.runtime === 'codex' ? '/effort' : ''} — found ${JSON.stringify(callViolations)}`);
    }
    if (carrier.runtime !== 'codex') {
      assert(codexV2FieldHits(carrier.content).length === 0,
        `A10-delegation/codex-v2-scope[${where}]: Codex V2 call fields do not leak into universal or another runtime's render`);
    }
    if (typeof renderGuidance === 'function') {
      const entry = adapterForCarrier(carrier);
      const guidance = entry ? guidanceByAdapter.get(entry.name) : '';
      assert(!!entry && guidance.length > 0
        && normalizedProse(subject).includes(normalizedProse(guidance)),
      `A10-delegation/carrier-source[${where}]: fresh carrier includes its exact adapter-rendered native guidance`);
    }
  }

  const dispatchWitness = carriers.find(carrier => carrier.runtime === 'claude'
    && carrier.forge === 'github' && carrier.topic === 'next');
  if (dispatchWitness) {
    const content = dispatchWitness.content;
    assert(dispatchContractGaps(content).length === 0,
      'A10-delegation/mutation setup: the Claude next witness carries a complete dispatch contract');
    const withoutStart = content.replace(/<!--\s*KW-RUNTIME-DISPATCH-START\s*-->/, '');
    assert(dispatchContractGaps(withoutStart).includes('dispatch-start-marker'),
      'A10-delegation/dispatch-marker-mutation RED: deleting the shared dispatch start marker is detected');

    const withoutNativeOnly = content.split(NATIVE_ONLY_STATEMENTS[1]).join('');
    assert(withoutNativeOnly !== content
      && dispatchContractGaps(withoutNativeOnly).includes('native-only-statement'),
    'A10-delegation/native-only-mutation RED: removing "installing no profiles is never evidence" is detected');

    const withoutReportedType = content.replace(
      /Where the native schema requires a type, pass one the host\s+reports, under its real meaning\./,
      'Pass whichever type name is convenient.');
    assert(withoutReportedType !== content
      && dispatchContractGaps(withoutReportedType).includes('reported-type-real-meaning'),
    'A10-delegation/reported-type-mutation RED: removing the host-reported, real-meaning type rule is detected');

    const withoutHostBindings = content.replace(/let its own defaults, limits, and\s+permissions/,
      'pin the Kaola subagent model');
    assert(withoutHostBindings !== content
      && dispatchContractGaps(withoutHostBindings).includes('host-owned-bindings'),
    'A10-delegation/host-bindings-mutation RED: replacing host-owned model/effort with a Kaola pin is detected');

    const withCapabilityGap = content.replace('<!-- KW-RUNTIME-DELEGATION-START -->',
      'When the named role is missing, record the specific `capability_gap`.\n<!-- KW-RUNTIME-DELEGATION-START -->');
    const capabilityGapGaps = dispatchContractGaps(withCapabilityGap);
    assert(withCapabilityGap !== content && capabilityGapGaps.includes('retired-capability-gap')
        && capabilityGapGaps.includes('retired-role-layer'),
    'A10-delegation/capability-gap-mutation RED: reintroducing the named-role capability_gap fallback is detected');

    const withPolicy = content.replace('<!-- KW-RUNTIME-DELEGATION-START -->',
      'Choose dispatch or inline per item: re-evaluate every mission item.\n<!-- KW-RUNTIME-DELEGATION-START -->');
    assert(withPolicy !== content && dispatchContractGaps(withPolicy).includes('retired-dispatch-policy'),
      'A10-delegation/policy-mutation RED: reintroducing the KW dispatch-or-inline policy is detected');
  }

  // Concrete-call bites: the retired finalize role call card, and a per-call model/effort pin on an
  // otherwise native call, are each detected; a native call naming a host-reported type passes.
  for (const runtime of ['claude', 'codex']) {
    const subject = carriers.find(carrier => carrier.runtime === runtime
      && carrier.forge === 'github' && carrier.topic === 'finalize');
    if (!subject) continue;
    const native = runtime === 'claude'
      ? '\nAgent(\n  subagent_type="general-purpose",\n  prompt="bounded brief"\n)\n'
      : '\nspawn_agent(\n  agent_type="worker",\n  task_name="repair_item",\n  message="bounded brief",\n)\n';
    assert(concreteCallViolations(runtime, subject.content + native).length === 0,
      `A10-delegation/concrete-call-boundary[${runtime}]: a native call naming a host-reported type is accepted`);
    const roleCard = runtime === 'claude'
      ? '\nAgent(\n  subagent_type="implementer",\n  prompt="repair"\n)\n'
      : '\nspawn_agent(\n  agent_type="tdd-guide",\n  task_name="tdd_guide",\n  message="write tests",\n)\n';
    assert(concreteCallViolations(runtime, subject.content + roleCard).some(v => v.endsWith('-retired-role')),
      `A10-delegation/role-card-mutation RED[${runtime}]: reintroducing a retired role call card is detected`);
    const pinned = native.replace(/\n\)\n$/, runtime === 'claude'
      ? '\n  model="opus",\n)\n'
      : '\n  reasoning_effort="low",\n)\n');
    assert(concreteCallViolations(runtime, subject.content + pinned)
      .some(v => v.endsWith(runtime === 'claude' ? '-pinned-model' : '-pinned-effort')),
    `A10-delegation/per-call-pin-mutation RED[${runtime}]: injecting a per-call ${runtime === 'claude' ? 'model' : 'effort'} into a native call is detected`);
  }

  const cleanItemLocal = 'Inline the current item only when no adequate native route exists; re-evaluate the next item.';
  assert(!RETIRED_RUN_WIDE_INLINE.test(cleanItemLocal),
    'A10-delegation/next-whole-surface-mutation: an item-local exhausted-route fallback is accepted');
  assert(RETIRED_RUN_WIDE_INLINE.test(cleanItemLocal
    + ' If the runtime cannot spawn a role agent, keep the work inline and say so.'),
  'A10-delegation/next-whole-surface-mutation: appending the retired broad fallback anywhere in the render is detected');
  assert(codexV2FieldHits(dispatchSource).length === 0
    && codexV2FieldHits(dispatchSource + '\n  task_name="universal_repair",').length === 1,
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
  console.error(`\nruntime-agent-architecture test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`runtime-agent-architecture test passed (${passed} assertions). [adapter facts: ${ADAPTER_FACTS_PATH}]`);
