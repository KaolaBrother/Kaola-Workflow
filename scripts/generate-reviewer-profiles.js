#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BEHAVIOR_SOURCE = 'templates/reviewers/behavior-contracts.json';
const ADAPTER_SOURCE = 'templates/reviewers/runtime-adapters.json';
const ZERO_HASH = '0'.repeat(64);

const ROLES = Object.freeze(['code-reviewer', 'adversarial-verifier']);
const SECTION_IDS = Object.freeze({
  'code-reviewer': Object.freeze([
    'prompt-defense',
    'role-boundary',
    'review-process',
    'admission-policy',
    'proof-burden',
    'false-positive-controls',
    'discovery-closure',
    'finding-contract',
    'receipt-contract',
  ]),
  'adversarial-verifier': Object.freeze([
    'prompt-defense',
    'role-boundary',
    'inverted-burden',
    'falsification-method',
    'mode-policy',
    'aggregation-policy',
    'finding-contract',
    'receipt-contract',
  ]),
});

const EXPECTED_DOMAIN_OUTCOMES = Object.freeze({
  'code-reviewer': Object.freeze(['approved', 'changes_requested']),
  'adversarial-verifier': Object.freeze(['refuted', 'not_refuted', 'indeterminate']),
});

const REQUIRED_BEHAVIOR_TOKENS = Object.freeze({
  'code-reviewer': Object.freeze([
    '>80%',
    'candidate-caused',
    'unchanged or pre-existing',
    'exact trigger',
    'HIGH or CRITICAL',
    'zero findings',
    'style preferences',
    'Consolidate',
    'review phase',
    'review_scope_expanded',
    'finding-anchor-v1',
    'domain_outcome: approved',
    'domain_outcome: changes_requested',
    'execution_status',
    'gate_effect',
  ]),
  'adversarial-verifier': Object.freeze([
    'Presume the claim false',
    'Uncertainty counts against the claim',
    'one context-provided claim',
    'strongest failure path',
    'attempted counterexample',
    'gate_mode',
    'investigation mode',
    'change_gate mode',
    'gate_aggregation',
    'replicated_majority',
    'partitioned_all',
    'finding-anchor-v1',
    'domain_outcome: refuted',
    'domain_outcome: not_refuted',
    'domain_outcome: indeterminate',
    'claim_outcome',
    'execution_status',
    'gate_effect',
  ]),
});

const ADAPTER_DEFINITIONS = Object.freeze({
  'claude-base': Object.freeze({
    tools: 'claude-read-shell',
    model_policy_ref: 'claude-standard',
    evidence_transport: 'return-for-recording',
  }),
  'claude-higher': Object.freeze({
    tools: 'claude-read-shell',
    model_policy_ref: 'claude-reasoning',
    evidence_transport: 'return-for-recording',
  }),
  codex: Object.freeze({
    tools: 'codex-read-shell',
    model_policy_ref: 'codex-inherit-by-omission',
    evidence_transport: 'write-seeded-cache',
  }),
});

const OUTPUT_SPECS = Object.freeze([
  Object.freeze({
    path: 'agents/code-reviewer.md',
    role: 'code-reviewer',
    runtime: 'claude',
    variant: 'base',
    adapter: 'claude-base',
    format: 'markdown',
  }),
  Object.freeze({
    path: 'agents/profiles/higher/code-reviewer.md',
    role: 'code-reviewer',
    runtime: 'claude',
    variant: 'higher',
    adapter: 'claude-higher',
    format: 'markdown',
  }),
  Object.freeze({
    path: 'agents/adversarial-verifier.md',
    role: 'adversarial-verifier',
    runtime: 'claude',
    variant: 'base',
    adapter: 'claude-base',
    format: 'markdown',
  }),
  ...['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'].flatMap(edition =>
    ROLES.map(role => Object.freeze({
      path: `plugins/${edition}/agents/${role}.toml`,
      role,
      runtime: 'codex',
      variant: 'inherited',
      adapter: 'codex',
      format: 'toml',
    }))),
]);

const EXPECTED_OUTPUT_PATHS = Object.freeze(OUTPUT_SPECS.map(spec => spec.path));
const PROVENANCE_BAN = /#\d{1,6}|D-\d{3}-\d{2}|\bINV-\d+|\bADR(?:[ -]\d{2,4})?|\b(?:PR|MR|AC)#\d+/;
const RUNTIME_NOUN_BAN = /\b(?:Claude|Codex|OpenCode|GitHub|GitLab|Gitea)\b/i;
const CORE_START = '<!-- reviewer-behavior-core:start -->';
const CORE_END = '<!-- reviewer-behavior-core:end -->';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error('canonical_json_number_invalid: only safe integers are supported');
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new Error('canonical_json_type_invalid: unsupported value');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}_invalid: expected object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    const unknown = actual.filter(key => !wanted.includes(key));
    const missing = wanted.filter(key => !actual.includes(key));
    throw new Error(`${label}_keys_invalid: closed schema; unknown=[${unknown.join(',')}] missing=[${missing.join(',')}]`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || /[\r\n]/.test(value)) {
    throw new Error(`${label}_invalid: expected non-empty single-line string`);
  }
}

function assertNoProvenance(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const match = text.match(PROVENANCE_BAN);
  if (match) throw new Error(`${label}_provenance_forbidden: ${match[0]}`);
}

function contradictoryDescription(role, description, body) {
  const desc = description.toLowerCase();
  if (role === 'code-reviewer') {
    if (/(?:report|include)[^.]{0,80}(?:uncertain|speculative|low-confidence|low confidence)/.test(desc)
        || /zero findings[^.]{0,40}(?:fail|invalid|incomplete)/.test(desc)
        || /refute-if-uncertain/.test(desc)) {
      return true;
    }
    if (body.includes('>80%') && /regardless of confidence/.test(desc)) return true;
  }
  if (role === 'adversarial-verifier') {
    if (/(?:uncertainty|incomplete confirmation)[^.]{0,60}(?:passes|approves|supports)/.test(desc)
        || /precision-first[^.]{0,40}report only/.test(desc)) {
      return true;
    }
  }
  return false;
}

function validateBehaviorContracts(source) {
  exactKeys(source, ['schema_version', 'roles'], 'behavior_contracts');
  if (source.schema_version !== 1) {
    throw new Error(`behavior_contracts_schema_version_unsupported: ${source.schema_version}`);
  }
  exactKeys(source.roles, ROLES, 'behavior_contract_roles');

  for (const role of ROLES) {
    const contract = source.roles[role];
    exactKeys(contract, [
      'behavior_contract_version',
      'description',
      'nickname_candidates',
      'sections',
      'receipt_contract',
    ], `behavior_contract_${role}`);
    if (contract.behavior_contract_version !== 2) {
      throw new Error(`behavior_contract_version_unsupported: ${role}=${contract.behavior_contract_version}`);
    }
    nonEmptyString(contract.description, `behavior_contract_${role}_description`);
    if (RUNTIME_NOUN_BAN.test(contract.description)) {
      throw new Error(`behavior_contract_${role}_description_not_runtime_neutral`);
    }
    if (!Array.isArray(contract.nickname_candidates) || contract.nickname_candidates.length === 0) {
      throw new Error(`behavior_contract_${role}_nickname_candidates_invalid`);
    }
    const nicknames = new Set();
    for (const nickname of contract.nickname_candidates) {
      nonEmptyString(nickname, `behavior_contract_${role}_nickname`);
      if (nicknames.has(nickname)) throw new Error(`behavior_contract_${role}_nickname_duplicate: ${nickname}`);
      nicknames.add(nickname);
    }
    if (!Array.isArray(contract.sections)) {
      throw new Error(`behavior_contract_${role}_sections_invalid`);
    }
    const expectedIds = SECTION_IDS[role];
    const actualIds = contract.sections.map(section => section && section.id);
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      throw new Error(`behavior_contract_${role}_section_ids_invalid: closed ordered ids required`);
    }
    const seenIds = new Set();
    for (const section of contract.sections) {
      exactKeys(section, ['id', 'heading', 'lines'], `behavior_contract_${role}_section`);
      nonEmptyString(section.id, `behavior_contract_${role}_section_id`);
      nonEmptyString(section.heading, `behavior_contract_${role}_${section.id}_heading`);
      if (seenIds.has(section.id)) throw new Error(`behavior_contract_${role}_section_duplicate: ${section.id}`);
      seenIds.add(section.id);
      if (!Array.isArray(section.lines) || section.lines.length === 0) {
        throw new Error(`behavior_contract_${role}_${section.id}_lines_invalid`);
      }
      for (const line of section.lines) {
        nonEmptyString(line, `behavior_contract_${role}_${section.id}_line`);
      }
    }
    exactKeys(contract.receipt_contract, ['domain_outcomes', 'finding_schema'],
      `behavior_contract_${role}_receipt`);
    if (JSON.stringify(contract.receipt_contract.domain_outcomes)
        !== JSON.stringify(EXPECTED_DOMAIN_OUTCOMES[role])) {
      throw new Error(`behavior_contract_${role}_domain_outcomes_invalid`);
    }
    if (contract.receipt_contract.finding_schema !== 'finding-anchor-v1') {
      throw new Error(`behavior_contract_${role}_finding_schema_invalid`);
    }
    const contractText = contract.sections.flatMap(section => section.lines).join(' ');
    if (RUNTIME_NOUN_BAN.test(contractText)) {
      throw new Error(`behavior_contract_${role}_core_not_runtime_neutral`);
    }
    for (const token of REQUIRED_BEHAVIOR_TOKENS[role]) {
      if (!contractText.includes(token)) {
        throw new Error(`behavior_contract_${role}_required_policy_missing: ${token}`);
      }
    }
    if (contradictoryDescription(role, contract.description, contractText.toLowerCase())) {
      throw new Error(`behavior_contract_${role}_contradictory_description`);
    }
    assertNoProvenance(contract, `behavior_contract_${role}`);
  }
  return true;
}

function validateRuntimeAdapters(source) {
  exactKeys(source, ['schema_version', 'adapters'], 'runtime_adapters');
  if (source.schema_version !== 1) {
    throw new Error(`runtime_adapters_schema_version_unsupported: ${source.schema_version}`);
  }
  exactKeys(source.adapters, Object.keys(ADAPTER_DEFINITIONS), 'runtime_adapter_names');
  for (const [name, expected] of Object.entries(ADAPTER_DEFINITIONS)) {
    const adapter = source.adapters[name];
    exactKeys(adapter, ['tools', 'model_policy_ref', 'evidence_transport'], `runtime_adapter_${name}`);
    for (const key of Object.keys(expected)) {
      nonEmptyString(adapter[key], `runtime_adapter_${name}_${key}`);
      if (adapter[key] !== expected[key]) {
        throw new Error(`runtime_adapter_${name}_${key}_not_in_closed_enum: ${adapter[key]}`);
      }
    }
    assertNoProvenance(adapter, `runtime_adapter_${name}`);
  }
  return true;
}

function readJsonSource(root, relativePath, label) {
  const absolute = path.join(root, relativePath);
  let text;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    throw new Error(`${label}_missing: ${absolute}: ${error.message}`);
  }
  if (text.includes('\r')) throw new Error(`${label}_line_endings_invalid: LF required`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_json_invalid: ${error.message}`);
  }
}

function loadBehaviorContracts(root = ROOT) {
  const source = readJsonSource(root, BEHAVIOR_SOURCE, 'behavior_contracts');
  validateBehaviorContracts(source);
  return source;
}

function loadRuntimeAdapters(root = ROOT) {
  const source = readJsonSource(root, ADAPTER_SOURCE, 'runtime_adapters');
  validateRuntimeAdapters(source);
  return source;
}

function behaviorContractHash(source, role) {
  const contract = source.roles[role];
  const normalized = {
    schema_version: source.schema_version,
    role,
    behavior_contract_version: contract.behavior_contract_version,
    description: contract.description,
    nickname_candidates: contract.nickname_candidates,
    sections: contract.sections,
    receipt_contract: contract.receipt_contract,
  };
  return sha256(canonicalJson(normalized));
}

function titleForRole(role) {
  return role.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function renderBehaviorCore(source, role, hash) {
  const contract = source.roles[role];
  const lines = [
    CORE_START,
    `role: ${role}`,
    `behavior_contract_version: ${contract.behavior_contract_version}`,
    `behavior_contract_hash: ${hash}`,
    `description: ${contract.description}`,
    '',
    `# ${titleForRole(role)} Behavior Contract`,
  ];
  for (const section of contract.sections) {
    lines.push('', `## ${section.heading}`, '', ...section.lines);
  }
  lines.push(CORE_END);
  return lines.join('\n');
}

function renderAdapter(role, adapter) {
  const lines = [
    '<!-- reviewer-runtime-adapter:start -->',
    '## Runtime adapter',
    '',
  ];
  if (adapter.tools === 'claude-read-shell') {
    lines.push('- Tool policy: use Read, Grep, Glob, and Bash only. Do not use Write or Edit.');
  } else if (adapter.tools === 'codex-read-shell') {
    lines.push('- Tool policy: use read-only repository inspection and shell execution tools. Do not edit product files; the exact seeded evidence file is the only write exception.');
  } else {
    throw new Error(`runtime_adapter_tools_unhandled: ${adapter.tools}`);
  }

  if (adapter.evidence_transport === 'return-for-recording') {
    lines.push('- Evidence transport: RETURN the FULL structured result in the final response. Do not write a workflow cache file; the orchestrator persists it through record-evidence.');
  } else if (adapter.evidence_transport === 'write-seeded-cache') {
    lines.push('- Evidence transport: write the FULL structured result directly to the exact dispatch.evidence_file and preserve its evidence-binding header byte-for-byte, writing only below that header.');
    lines.push(`- After the evidence is complete, return only a compact orchestrator summary: <node-id> ${role}: <outcome>; evidence=<dispatch.evidence_file>.`);
  } else {
    throw new Error(`runtime_adapter_evidence_transport_unhandled: ${adapter.evidence_transport}`);
  }
  lines.push('<!-- reviewer-runtime-adapter:end -->');
  return lines.join('\n');
}

function resolvedHashMatches(text) {
  const re = /^(resolved_profile_hash\s*(?::|=)\s*"?)([0-9a-f]{64})("?\s*)$/gm;
  return [...text.matchAll(re)];
}

function normalizeResolvedProfileHash(text) {
  const matches = resolvedHashMatches(text);
  if (matches.length !== 1) {
    throw new Error(`resolved_profile_hash_not_unique: expected 1 field, got ${matches.length}`);
  }
  const match = matches[0];
  return text.slice(0, match.index) + match[1] + ZERO_HASH + match[3]
    + text.slice(match.index + match[0].length);
}

function finalizeResolvedProfile(textWithZeroHash) {
  const normalized = normalizeResolvedProfileHash(textWithZeroHash);
  const digest = sha256(normalized);
  if (!normalized.includes(ZERO_HASH)) {
    throw new Error('resolved_profile_hash_zero_slot_missing');
  }
  return {
    content: normalized.replace(ZERO_HASH, digest),
    resolved_profile_hash: digest,
  };
}

function verifyResolvedProfileHash(text) {
  const matches = resolvedHashMatches(text);
  if (matches.length !== 1) {
    throw new Error(`resolved_profile_hash_not_unique: expected 1 field, got ${matches.length}`);
  }
  const actual = matches[0][2];
  const normalized = normalizeResolvedProfileHash(text);
  const expected = sha256(normalized);
  if (actual !== expected) {
    throw new Error(`resolved_profile_hash_mismatch: expected ${expected}, got ${actual}`);
  }
  return true;
}

function yamlArray(values) {
  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`;
}

function renderMarkdown(contract, core, adapter, adapterText, behaviorHash) {
  const model = adapter.model_policy_ref === 'claude-standard'
    ? 'sonnet'
    : (adapter.model_policy_ref === 'claude-reasoning' ? 'opus' : null);
  if (!model) throw new Error(`claude_model_policy_unhandled: ${adapter.model_policy_ref}`);
  const body = [
    '---',
    `name: ${contract.role}`,
    `description: ${contract.description}`,
    `nickname_candidates: ${yamlArray(contract.nickname_candidates)}`,
    'tools: ["Read", "Grep", "Glob", "Bash"]',
    `model: ${model}`,
    `behavior_contract_version: ${contract.behavior_contract_version}`,
    `behavior_contract_hash: ${behaviorHash}`,
    `resolved_profile_hash: ${ZERO_HASH}`,
    '---',
    '<!--',
    'kaola-workflow-managed-agent: true',
    'generated-reviewer-profile: true',
    '-->',
    '',
    core,
    '',
    adapterText,
  ].join('\n') + '\n';
  return finalizeResolvedProfile(body);
}

function tomlArray(values) {
  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`;
}

function renderToml(contract, core, adapter, adapterText, behaviorHash) {
  if (adapter.model_policy_ref !== 'codex-inherit-by-omission') {
    throw new Error(`codex_model_policy_unhandled: ${adapter.model_policy_ref}`);
  }
  const instructions = `${core}\n\n${adapterText}`;
  if (instructions.includes('"""')) throw new Error('toml_developer_instructions_delimiter_collision');
  const body = [
    `name = ${JSON.stringify(contract.role)}`,
    `description = ${JSON.stringify(contract.description)}`,
    `nickname_candidates = ${tomlArray(contract.nickname_candidates)}`,
    `behavior_contract_version = ${contract.behavior_contract_version}`,
    `behavior_contract_hash = ${JSON.stringify(behaviorHash)}`,
    `resolved_profile_hash = ${JSON.stringify(ZERO_HASH)}`,
    'developer_instructions = """',
    instructions,
    '"""',
  ].join('\n') + '\n';
  if (/^model\s*=/m.test(body) || /^model_reasoning_effort\s*=/m.test(body)) {
    throw new Error('codex_model_pin_forbidden: inherit-by-omission required');
  }
  return finalizeResolvedProfile(body);
}

function renderProfiles(behaviorContracts, runtimeAdapters) {
  validateBehaviorContracts(behaviorContracts);
  validateRuntimeAdapters(runtimeAdapters);
  const hashes = Object.fromEntries(ROLES.map(role =>
    [role, behaviorContractHash(behaviorContracts, role)]));
  const cores = Object.fromEntries(ROLES.map(role =>
    [role, renderBehaviorCore(behaviorContracts, role, hashes[role])]));

  return OUTPUT_SPECS.map(spec => {
    const sourceContract = behaviorContracts.roles[spec.role];
    const contract = { ...sourceContract, role: spec.role };
    const adapterData = runtimeAdapters.adapters[spec.adapter];
    const adapterText = renderAdapter(spec.role, adapterData);
    const rendered = spec.format === 'markdown'
      ? renderMarkdown(contract, cores[spec.role], adapterData, adapterText, hashes[spec.role])
      : renderToml(contract, cores[spec.role], adapterData, adapterText, hashes[spec.role]);
    if (PROVENANCE_BAN.test(rendered.content)) {
      throw new Error(`generated_profile_provenance_forbidden: ${spec.path}`);
    }
    return Object.freeze({
      ...spec,
      behavior_contract_version: sourceContract.behavior_contract_version,
      behavior_contract_hash: hashes[spec.role],
      resolved_profile_hash: rendered.resolved_profile_hash,
      content: rendered.content,
    });
  });
}

function extractBehaviorCore(text) {
  const starts = text.split(CORE_START).length - 1;
  const ends = text.split(CORE_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(`behavior_core_markers_invalid: starts=${starts} ends=${ends}`);
  }
  const start = text.indexOf(CORE_START);
  const end = text.indexOf(CORE_END, start);
  if (end < start) throw new Error('behavior_core_markers_invalid: end precedes start');
  return text.slice(start, end + CORE_END.length);
}

function behaviorIdentityFromCore(text) {
  const core = extractBehaviorCore(text);
  const role = /^role:\s*([^\n]+)$/m.exec(core);
  const version = /^behavior_contract_version:\s*(\d+)$/m.exec(core);
  const hash = /^behavior_contract_hash:\s*([0-9a-f]{64})$/m.exec(core);
  if (!role || !version || !hash) throw new Error('behavior_core_identity_missing');
  return {
    role: role[1],
    behavior_contract_version: Number(version[1]),
    behavior_contract_hash: hash[1],
    core,
  };
}

function checkGeneratedProfiles(root = ROOT, options = {}) {
  const behaviorContracts = options.behaviorContracts || loadBehaviorContracts(root);
  const runtimeAdapters = options.runtimeAdapters || loadRuntimeAdapters(root);
  const expected = renderProfiles(behaviorContracts, runtimeAdapters);
  const errors = [];
  for (const profile of expected) {
    const absolute = path.join(root, profile.path);
    if (!fs.existsSync(absolute)) {
      errors.push(`generated_profile_missing: ${profile.path}`);
      continue;
    }
    const actual = fs.readFileSync(absolute, 'utf8');
    if (actual.includes('\r') || !actual.endsWith('\n') || actual.endsWith('\n\n')) {
      errors.push(`generated_profile_line_endings_invalid: ${profile.path}`);
    }
    if (profile.runtime === 'codex'
        && (/^model\s*=/m.test(actual) || /^model_reasoning_effort\s*=/m.test(actual))) {
      errors.push(`codex_model_pin_forbidden: ${profile.path}`);
    }
    try {
      verifyResolvedProfileHash(actual);
    } catch (error) {
      errors.push(`generated_profile_hash_invalid: ${profile.path}: ${error.message}`);
    }
    const provenance = actual.match(PROVENANCE_BAN);
    if (provenance) errors.push(`generated_profile_provenance_forbidden: ${profile.path}: ${provenance[0]}`);
    try {
      if (extractBehaviorCore(actual) !== extractBehaviorCore(profile.content)) {
        errors.push(`generated_profile_behavior_core_drift: ${profile.path}`);
      }
    } catch (error) {
      errors.push(`generated_profile_behavior_core_invalid: ${profile.path}: ${error.message}`);
    }
    if (actual !== profile.content) errors.push(`generated_profile_drift: ${profile.path}`);
  }
  return errors;
}

function writeProfiles(root = ROOT, options = {}) {
  const behaviorContracts = options.behaviorContracts || loadBehaviorContracts(root);
  const runtimeAdapters = options.runtimeAdapters || loadRuntimeAdapters(root);
  const profiles = renderProfiles(behaviorContracts, runtimeAdapters);
  for (const profile of profiles) {
    const absolute = path.join(root, profile.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, profile.content, 'utf8');
  }
  return profiles;
}

function manifestForProfiles(profiles) {
  return {
    schema_version: 1,
    generator: 'reviewer-profile-generator-v1',
    profiles: profiles.map(profile => ({
      path: profile.path,
      role: profile.role,
      runtime: profile.runtime,
      variant: profile.variant,
      behavior_contract_version: profile.behavior_contract_version,
      behavior_contract_hash: profile.behavior_contract_hash,
      resolved_profile_hash: profile.resolved_profile_hash,
      rendered_sha256: sha256(profile.content),
    })),
  };
}

function main(argv = process.argv.slice(2)) {
  const allowed = new Set(['--write', '--check', '--manifest-json']);
  const unknown = argv.filter(arg => !allowed.has(arg));
  if (unknown.length > 0 || argv.length === 0) {
    console.error('Usage: node scripts/generate-reviewer-profiles.js [--write] [--check] [--manifest-json]');
    if (unknown.length > 0) console.error(`Unknown arguments: ${unknown.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  try {
    let profiles = null;
    if (argv.includes('--write')) {
      profiles = writeProfiles(ROOT);
      console.error(`Wrote ${profiles.length} reviewer profiles.`);
    }
    if (argv.includes('--check')) {
      const errors = checkGeneratedProfiles(ROOT);
      if (errors.length > 0) {
        for (const error of errors) console.error(error);
        process.exitCode = 1;
        return;
      }
      console.error('Reviewer profile generation check passed.');
    }
    if (argv.includes('--manifest-json')) {
      profiles = profiles || renderProfiles(loadBehaviorContracts(ROOT), loadRuntimeAdapters(ROOT));
      process.stdout.write(`${JSON.stringify(manifestForProfiles(profiles), null, 2)}\n`);
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  ROOT,
  ROLES,
  OUTPUT_SPECS,
  EXPECTED_OUTPUT_PATHS,
  PROVENANCE_BAN,
  canonicalJson,
  sha256,
  loadBehaviorContracts,
  loadRuntimeAdapters,
  validateBehaviorContracts,
  validateRuntimeAdapters,
  behaviorContractHash,
  renderBehaviorCore,
  renderProfiles,
  extractBehaviorCore,
  behaviorIdentityFromCore,
  normalizeResolvedProfileHash,
  verifyResolvedProfileHash,
  checkGeneratedProfiles,
  writeProfiles,
  manifestForProfiles,
  main,
};
