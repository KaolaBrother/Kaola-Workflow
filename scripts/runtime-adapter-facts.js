'use strict';

// runtime-adapter-facts.js — the measured runtime adapter facts and their rendered form.
//
// templates/agents/runtime-capabilities.json records, per runtime, what the host itself provides:
// how it loads instructions, which hook scope it offers, its native subagent routes and their
// availability, its compact-recovery carrier, and its install scope. Kaola-Workflow defines no
// subagent roles, role profiles, or subagent model and effort bindings (ADR 0029), so an adapter
// carries no role, profile, or model-binding capability; validateRuntimeAdapters() rejects one.
//
// The routing-surface engine and the additive runtime editions render the adapter section that
// sits beside the common dispatch contract from these facts. Build-time only: nothing here is
// installed.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_SOURCE = 'templates/agents/runtime-capabilities.json';
const RUNTIMES = Object.freeze(['claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin', 'droid', 'dsh']);
const REQUIRED_CAPABILITIES = Object.freeze(['instruction_loading', 'hook_scope', 'delegation_guidance']);
const GUIDANCE_KEYS = Object.freeze(['native_routes', 'availability']);
// Capability fields that belonged to the retired Kaola role and profile layer (#1101).
const RETIRED_CAPABILITIES = Object.freeze([
  'named_roles', 'deterministic_profiles', 'capability_gap', 'role_dispatch', 'profile_format',
  'model_carrier', 'tool_binding', 'subagent_default', 'intent_mapping', 'dispatch_conformance',
]);
const DELEGATION_GUIDANCE_START = '<!-- KW-RUNTIME-DELEGATION-START -->';
const DELEGATION_GUIDANCE_END = '<!-- KW-RUNTIME-DELEGATION-END -->';

function loadRuntimeAdapters(root = ROOT) {
  const source = JSON.parse(fs.readFileSync(path.join(root, ADAPTER_SOURCE), 'utf8'));
  validateRuntimeAdapters(source);
  return source;
}

function validateRuntimeAdapters(source) {
  if (!source || source.schema_version !== 2 || !source.evidence || !source.runtimes) {
    throw new Error('runtime-capabilities: schema_version 2, evidence, and runtimes are required');
  }
  const runtimeSet = new Set();
  for (const [name, adapter] of Object.entries(source.runtimes)) {
    if (!RUNTIMES.includes(adapter.runtime)) throw new Error('runtime-capabilities: invalid runtime ' + name);
    runtimeSet.add(adapter.runtime);
    if (!Array.isArray(adapter.evidence) || adapter.evidence.length === 0
        || adapter.evidence.some(id => !source.evidence[id])) {
      throw new Error('runtime-capabilities: missing evidence for ' + name);
    }
    const caps = adapter.capabilities;
    if (!caps || REQUIRED_CAPABILITIES.some(key => !Object.prototype.hasOwnProperty.call(caps, key))) {
      throw new Error('runtime-capabilities: incomplete capabilities for ' + name);
    }
    const retired = RETIRED_CAPABILITIES.find(key => Object.prototype.hasOwnProperty.call(caps, key));
    if (retired) throw new Error('runtime-capabilities: retired role capability ' + retired + ' on ' + name);
    const guidance = caps.delegation_guidance;
    if (!guidance
        || JSON.stringify(Object.keys(guidance).sort()) !== JSON.stringify([...GUIDANCE_KEYS].sort())
        || GUIDANCE_KEYS.some(key => typeof guidance[key] !== 'string' || !guidance[key].trim())) {
      throw new Error('runtime-capabilities: delegation guidance must be exactly native_routes and availability for ' + name);
    }
    if (adapter.runtime === 'devin') {
      if (typeof caps.nesting !== 'number'
          || typeof caps.hot_reload !== 'boolean'
          || typeof caps.rules_survive_compaction !== 'boolean') {
        throw new Error('runtime-capabilities: Devin explicit capability fields missing');
      }
      const compact = adapter.compact_protocol;
      if (!compact || !Array.isArray(compact.events) || !compact.events.includes('UserPromptSubmit')) {
        throw new Error('runtime-capabilities: Devin compact protocol must use UserPromptSubmit');
      }
    }
  }
  if (JSON.stringify([...runtimeSet].sort()) !== JSON.stringify([...RUNTIMES].sort())) {
    throw new Error('runtime-capabilities: expected all ' + RUNTIMES.length + ' runtime families');
  }
  if (Object.values(source.runtimes).filter(adapter => adapter.runtime === 'codex').length !== 3) {
    throw new Error('runtime-capabilities: expected three forge-neutral Codex adapters');
  }
}

function runtimeHostName(runtime) {
  if (runtime === 'dsh') return 'DSH';
  return runtime.charAt(0).toUpperCase() + runtime.slice(1);
}

function runtimeAdapter(runtime, forge = 'github', root = ROOT) {
  const adapters = loadRuntimeAdapters(root);
  const name = runtime === 'codex' ? 'codex-' + forge : runtime;
  const adapter = adapters.runtimes[name];
  if (!adapter || adapter.runtime !== runtime) {
    throw new Error('runtime-capabilities: adapter not found for ' + runtime + '/' + forge);
  }
  return adapter;
}

function renderRuntimeDelegationGuidance(adapter) {
  if (!adapter || !adapter.runtime || !adapter.capabilities || !adapter.capabilities.delegation_guidance) {
    throw new Error('runtime delegation guidance requires one runtime adapter');
  }
  const host = runtimeHostName(adapter.runtime);
  const guidance = adapter.capabilities.delegation_guidance;
  return [
    DELEGATION_GUIDANCE_START,
    '## Runtime adapter facts',
    '',
    'Host: ' + host + '. If the running host is not ' + host + ', ignore this adapter section and'
      + ' follow the running host\'s own native subagent schema and catalog.',
    '',
    guidance.native_routes,
    guidance.availability,
    DELEGATION_GUIDANCE_END,
  ].join('\n');
}

function renderRuntimeDelegationGuidanceForRuntime(runtime, forge = 'github', root = ROOT) {
  return renderRuntimeDelegationGuidance(runtimeAdapter(runtime, forge, root));
}

const ALWAYS_LOADED_DISPATCH_POINTER = 'The always-loaded Kaola rule already carries the runtime dispatch contract and adapter facts; this prompt does not restate them.';

// Replace the whole marked dispatch region (markers included) with the pointer. A consumer that
// keys on the KW-RUNTIME-DISPATCH markers must not read the pointer as the contract, so the
// markers go with the block (same rule as generate-routing-surfaces' deferred recovery render).
function deferRuntimeDispatchBlock(content) {
  return String(content).replace(
    /^<!-- KW-RUNTIME-DISPATCH-START -->\n[\s\S]*?<!-- KW-RUNTIME-DISPATCH-END -->\n/m,
    ALWAYS_LOADED_DISPATCH_POINTER + '\n');
}

function replaceRuntimeDelegationGuidance(content, runtime, forge = 'github', root = ROOT) {
  const text = String(content);
  const start = text.indexOf(DELEGATION_GUIDANCE_START);
  const end = text.indexOf(DELEGATION_GUIDANCE_END);
  if (start < 0 || end < start
      || text.indexOf(DELEGATION_GUIDANCE_START, start + 1) >= 0
      || text.indexOf(DELEGATION_GUIDANCE_END, end + 1) >= 0) {
    throw new Error('runtime delegation guidance marker missing or duplicated for ' + runtime + '/' + forge);
  }
  const rendered = renderRuntimeDelegationGuidanceForRuntime(runtime, forge, root);
  return text.slice(0, start) + rendered + text.slice(end + DELEGATION_GUIDANCE_END.length);
}

module.exports = {
  ADAPTER_SOURCE,
  RUNTIMES,
  RETIRED_CAPABILITIES,
  DELEGATION_GUIDANCE_START,
  DELEGATION_GUIDANCE_END,
  ALWAYS_LOADED_DISPATCH_POINTER,
  loadRuntimeAdapters,
  validateRuntimeAdapters,
  runtimeHostName,
  runtimeAdapter,
  renderRuntimeDelegationGuidance,
  renderRuntimeDelegationGuidanceForRuntime,
  replaceRuntimeDelegationGuidance,
  deferRuntimeDispatchBlock,
};
