#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-codex-preflight.js — Codex runtime readiness gate.
//
// Kaola-Workflow defines no subagent roles and installs no Codex role profiles (#1101); subagents
// are the host's native capability. This gate checks only the host facts Kaola-Workflow depends on,
// plus Kaola-owned leftovers of earlier releases. It sets no Codex version floor: the retired
// 0.145.0 floor (#775) existed only to make multi_agent_v2 the dispatch path for Kaola roles.
//   (a) config-layer safety: HOME and every trusted project .codex layer must be regular,
//       non-symlink paths that stay inside their scope, and project_root_markers must parse;
//   (b) the effective persisted runtime (HOME overlaid by every trusted repository-root-to-cwd
//       project layer): the features.multi_agent_v2 and model_reasoning_effort values read from
//       config, and any numeric V2 fields present in that config. These are config facts, reported
//       only — never a session tool inventory, dispatch authorization, or refusal;
//   (c) retired-role residue: a RETIRED_PROFILE_FILES or ownership-manifest file still inside the
//       Kaola-owned .codex/agents/kaola-workflow/ directory, or the "# BEGIN/END kaola-workflow
//       agents" marker block still in config.toml, in HOME or any project .codex layer. Only those
//       exact names count: other files and user [agents.*] tables are never residue.
//
// This file never deletes anything. Residue is removed by the Kaola Codex installer
// (install-codex-agent-profiles.js): without --no-autofix the gate runs it for each residue scope
// and then re-runs itself read-only; --no-autofix only reports.
//
// --doctor mode is READ-ONLY (never runs the installer): it reports the installed plugin identity (for a plugin-cache copy, its marketplace/name/version path), the
// effective runtime, and per-scope residue with the exact installer command for each scope.
//
// TRUE 4-tree byte-identical: requires ONLY Node built-ins and the forge-neutral kernel
// (kaola-workflow-adaptive-schema.js, a sibling in every tree — see KERNEL_COPIES in
// validate-script-sync.js), which owns the retired profile inventory.
//
// CLI:
//   node kaola-workflow-codex-preflight.js --project-root <dir>
//     [--no-autofix] [--json] [--home <dir>]
//   node kaola-workflow-codex-preflight.js --doctor [--project-root <dir>]
//     [--home <dir>] [--json]
// Unknown arguments (including the retired --codex-version) are ignored.
//
// Exit 0 = fresh (or autofixed-then-fresh); non-zero = typed refusal:
//   1 retired_role_residue (--doctor: stale; after autofix: autofix_attempted, the files the
//     installer preserved), 2 plugin_identity_invalid (--doctor),
//   4 config_layer_unsafe / scope_authority_unsafe / project_root_markers_invalid / autofix_unsafe,
//   5 installer_failed.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  MANIFEST_BASENAME,
  RETIRED_PROFILE_FILES,
  escapeRegExp,
} = require('./kaola-workflow-adaptive-schema');

// The marker pair earlier installers wrapped around their [agents.*] registrations in config.toml.
const BEGIN_MARKER = '# BEGIN kaola-workflow agents';
const END_MARKER = '# END kaola-workflow agents';


const RETIRED_ROLE_RESIDUE_STATUS = 'retired_role_residue';
const INSTALLER_BASENAME = 'install-codex-agent-profiles.js';

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
    escaped = false;
  }
  return line;
}

// Return a line-for-line structural view of TOML while masking multiline string
// bodies. Configuration prose may contain text such as `[agents.foo]` or
// `[features.multi_agent_v2]`; those bytes are data, not declarations. Ordinary
// quoted values stay intact because the small parsers below still need them.
function tomlStructuralContent(content) {
  const source = String(content || '');
  let output = '';
  let mode = 'normal';
  let escaped = false;

  function quoteRun(start, quote) {
    let end = start;
    while (end < source.length && source[end] === quote) end++;
    return end - start;
  }

  function precedingBackslashes(start) {
    let count = 0;
    for (let index = start - 1; index >= 0 && source[index] === '\\'; index--) count++;
    return count;
  }

  for (let index = 0; index < source.length; index++) {
    const ch = source[index];

    if (mode === 'multiline-basic' || mode === 'multiline-literal') {
      const quote = mode === 'multiline-basic' ? '"' : "'";
      const run = ch === quote ? quoteRun(index, quote) : 0;
      const closes = run >= 3
        && (mode === 'multiline-literal' || precedingBackslashes(index) % 2 === 0);
      if (closes) {
        output += ' '.repeat(run);
        index += run - 1;
        mode = 'normal';
      } else {
        output += ch === '\n' || ch === '\r' ? ch : ' ';
      }
      continue;
    }

    if (mode === 'comment') {
      output += ch;
      if (ch === '\n') mode = 'normal';
      continue;
    }

    if (mode === 'basic') {
      output += ch;
      if (ch === '\n' || ch === '\r') {
        mode = 'normal';
        escaped = false;
      } else if (ch === '\\' && !escaped) {
        escaped = true;
      } else {
        if (ch === '"' && !escaped) mode = 'normal';
        escaped = false;
      }
      continue;
    }

    if (mode === 'literal') {
      output += ch;
      if (ch === "'") mode = 'normal';
      else if (ch === '\n' || ch === '\r') mode = 'normal';
      continue;
    }

    if (ch === '#') {
      output += ch;
      mode = 'comment';
      continue;
    }
    if (source.startsWith('"""', index)) {
      output += '   ';
      index += 2;
      mode = 'multiline-basic';
      continue;
    }
    if (source.startsWith("'''", index)) {
      output += '   ';
      index += 2;
      mode = 'multiline-literal';
      continue;
    }
    output += ch;
    if (ch === '"') {
      mode = 'basic';
      escaped = false;
    } else if (ch === "'") {
      mode = 'literal';
    }
  }

  return output;
}

function tomlStructuralLines(content) {
  return tomlStructuralContent(content).split(/\r?\n/);
}

function decodeTomlBasicStringBody(value) {
  const source = String(value || '');
  let decoded = '';
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if (ch !== '\\') {
      decoded += ch;
      continue;
    }
    if (++index >= source.length) return null;
    const escape = source[index];
    const simple = {
      b: '\b',
      t: '\t',
      n: '\n',
      f: '\f',
      r: '\r',
      '"': '"',
      '\\': '\\',
    };
    if (Object.prototype.hasOwnProperty.call(simple, escape)) {
      decoded += simple[escape];
      continue;
    }
    if (escape !== 'u' && escape !== 'U') return null;
    const width = escape === 'u' ? 4 : 8;
    const digits = source.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !/^[0-9A-Fa-f]+$/.test(digits)) return null;
    const codePoint = parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
    decoded += String.fromCodePoint(codePoint);
    index += width;
  }
  return decoded;
}

function parseTomlDottedKeySegments(bodyValue) {
  const body = String(bodyValue || '').trim();
  if (!body) return null;
  const segments = [];
  let i = 0;
  function skipSpace() {
    while (i < body.length && /\s/.test(body[i])) i++;
  }

  while (i < body.length) {
    skipSpace();
    if (i >= body.length) return null;
    const quote = body[i];
    if (quote === '"' || quote === "'") {
      i++;
      let value = '';
      let escaped = false;
      let closed = false;
      while (i < body.length) {
        const ch = body[i];
        if (quote === '"' && ch === '\\' && !escaped) {
          escaped = true;
          value += ch;
          i++;
          continue;
        }
        if (ch === quote && (quote === "'" || !escaped)) {
          closed = true;
          i++;
          break;
        }
        value += ch;
        escaped = false;
        i++;
      }
      if (!closed) return null;
      if (quote === '"') {
        value = decodeTomlBasicStringBody(value);
        if (value === null) return null;
      }
      segments.push({ value, quoted: true });
    } else {
      const m = body.slice(i).match(/^[A-Za-z0-9_-]+/);
      if (!m) return null;
      segments.push({ value: m[0], quoted: false });
      i += m[0].length;
    }

    skipSpace();
    if (i >= body.length) break;
    if (body[i] !== '.') return null;
    i++;
  }

  return segments;
}

function parseTomlTableName(line) {
  const trimmed = String(line || '').trim();
  let body = null;
  let isArrayTable = false;
  if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
    body = trimmed.slice(2, -2).trim();
    isArrayTable = true;
  } else if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[[')) {
    body = trimmed.slice(1, -1).trim();
  } else {
    return null;
  }
  const segments = parseTomlDottedKeySegments(body);
  return segments ? { segments, isArrayTable } : null;
}

function parseTomlAssignment(line) {
  const source = String(line || '');
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '=' && !inSingle && !inDouble) {
      const key = parseTomlDottedKeySegments(source.slice(0, index));
      return key ? { key, value: source.slice(index + 1).trim() } : null;
    } else if (ch === '#' && !inSingle && !inDouble) {
      return null;
    }
    escaped = false;
  }
  return null;
}

function tomlAssignmentPath(tableName, assignment) {
  if (!assignment) return null;
  let segments = [];
  if (tableName !== null) {
    if (!tableName || tableName.isArrayTable || !Array.isArray(tableName.segments)) return null;
    segments = tableName.segments;
  }
  return [...segments, ...assignment.key].map(segment => segment.value);
}

function tomlAssignmentPathMatches(tableName, assignment, dottedPath) {
  const actual = tomlAssignmentPath(tableName, assignment);
  if (!actual) return false;
  const expected = Array.isArray(dottedPath) ? dottedPath : String(dottedPath || '').split('.');
  return actual.length === expected.length
    && actual.every((segment, index) => segment === expected[index]);
}

function tomlTableNameMatches(tableName, dottedPath) {
  if (!tableName || tableName.isArrayTable) return false;
  const segments = Array.isArray(tableName) ? tableName : tableName.segments;
  if (!Array.isArray(segments)) return false;
  const expected = String(dottedPath || '').split('.');
  if (segments.length !== expected.length) return false;
  return segments.every((segment, index) => segment.value === expected[index]);
}

function parseTomlBoolean(value) {
  const trimmed = String(value || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return null;
}

function parseTomlString(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length < 2) return null;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return decodeTomlBasicStringBody(trimmed.slice(1, -1));
  }
  return null;
}

function splitInlineTomlFields(body) {
  const fields = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (!inSingle && !inDouble) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
    }
    if (ch === ',' && !inSingle && !inDouble && braceDepth === 0 && bracketDepth === 0) {
      fields.push(body.slice(start, i).trim());
      start = i + 1;
    }
    escaped = false;
  }
  fields.push(body.slice(start).trim());
  return fields.filter(Boolean);
}

// Parses an inline TOML table (`{ a = 1, b = true }`) into single-key assignments.
// Returns null when the value is not an inline table or any field fails to parse —
// callers treat null as "unsafe to interpret" and fail closed.
function parseInlineTomlTableAssignments(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  const assignments = [];
  for (const field of splitInlineTomlFields(body)) {
    const assignment = parseTomlAssignment(field);
    if (!assignment || assignment.key.length !== 1) return null;
    assignments.push(assignment);
  }
  return assignments;
}

// Resolves a `multi_agent_v2` VALUE to its enablement. Codex accepts either a bare boolean
// (`multi_agent_v2 = true`) or an inline table carrying `enabled` plus settings
// (`multi_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 5 }`).
// `{ valid: false }` means the shape could not be read and the caller must fail closed.
function parseMultiAgentV2Value(value) {
  const trimmed = String(value || '').trim();
  const bool = parseTomlBoolean(trimmed);
  if (bool !== null) return { valid: true, enabled: bool };

  const fields = parseInlineTomlTableAssignments(trimmed);
  if (fields === null) return { valid: false, enabled: false };

  const enabledFields = fields.filter(field => field.key[0].value === 'enabled');
  if (enabledFields.length !== 1) return { valid: false, enabled: false };
  const parsed = parseTomlBoolean(enabledFields[0].value);
  if (parsed === null) return { valid: false, enabled: false };
  return { valid: true, enabled: parsed };
}

// multi_agent_v2 is the feature flag that selects the V2 (task-name) subagent system. It is
// OPT-IN and OFF BY DEFAULT in Codex 0.145 — verified against codex 0.145.0 with an empty
// CODEX_HOME config, where the enabled-flag list omits multi_agent_v2 while V1 `multi_agent`
// is present. It therefore has to be written into config.toml for Codex to expose the V2
// spawn tools at all; nothing else turns it on.
//
// It lives under `[features]`, NOT in the top-level `[agents]` table. `[agents]` is a
// different surface (documented keys: agents.<name>.*, job_max_runtime_seconds, max_depth,
// max_threads), and a top-level `[agents] enabled = true` does NOT enable MultiAgentV2.
// Measured on codex-cli 0.145.0, isolated CODEX_HOME: that config loads clean (`codex doctor`
// reports "config loaded") while `multi_agent_v2` stays off. Do NOT explain this by saying
// `[agents]` has no `enabled` key — it has one. An UNRECOGNIZED name there is refused
// (`bogus_key = 6` -> "invalid type: integer 6, expected struct AgentRoleToml"), and so is an
// unrecognized name holding a BOOLEAN (`bogus_key = true`), which is the control that rules out
// "booleans are tolerated": `enabled` survives on its NAME, so it is a recognized field that
// simply does not gate V2. What it positively does was never measured; do not guess it here.
//
// Three legal shapes are accepted, mirroring what Codex itself parses:
//   [features]                 multi_agent_v2 = { enabled = true, ... }   (inline table)
//   [features]                 multi_agent_v2 = true                      (bare boolean)
//   [features.multi_agent_v2]  enabled = true                             (sub-table)
// plus the equivalent dotted root forms. Repeated or unreadable declarations are ambiguous
// and fail closed rather than being guessed at.
function detectCodexDispatchMode(configContent) {
  const lines = tomlStructuralLines(configContent);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;

  function record(parsed) {
    if (!parsed.valid || seen) {
      ambiguous = true;
      enabled = false;
      return;
    }
    seen = true;
    enabled = parsed.enabled;
  }

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      // Root-level `features = { multi_agent_v2 = ... }`.
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) {
        ambiguous = true;
        enabled = false;
        continue;
      }
      const v2Fields = featureFields.filter(field => field.key[0].value === 'multi_agent_v2');
      if (v2Fields.length > 1) {
        ambiguous = true;
        enabled = false;
      } else if (v2Fields.length === 1) {
        record(parseMultiAgentV2Value(v2Fields[0].value));
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      record(parseMultiAgentV2Value(assignment.value));
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'enabled'])) {
      const value = parseTomlBoolean(assignment.value);
      record({ valid: value !== null, enabled: value === true });
    }
  }

  const v2Enabled = seen && !ambiguous && enabled;
  return {
    // 'v2-task-name' when V2 is enabled; null (not a fabricated 'v1-thread-id') otherwise.
    // Report-only: the host's native dispatch applies either way.
    dispatch_mode: v2Enabled ? 'v2-task-name' : null,
    multi_agent_v2_enabled: v2Enabled,
  };
}

// ---------------------------------------------------------------------------
// Config facts for features.multi_agent_v2 and model_reasoning_effort. #1111: these reads are not
// a session tool inventory, a dispatch posture, or an authorization. The effort-gated labels
// none / explicitRequestOnly / proactive were an old Codex observation and are not derived here.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws, and the
// caller must never let this change an install/preflight exit code — it only
// informs a REPORT. The installer carries the same report; keep the two in lock-step.
// ---------------------------------------------------------------------------
const DISPATCH_POSTURE_VERSION_NOTE = 'Reading features.multi_agent_v2 and model_reasoning_effort reports config only. The effort-gated MultiAgentMode labels none, explicitRequestOnly, and proactive were observed on codex-tui 0.142.5 and were not re-verified on Codex >=0.145.0; Kaola-Workflow does not derive a dispatch posture, session tool inventory, or authorization from them.';

// #775: the legacy `[features] multi_agent` (v1) flag and the V1/V2 dual-feature OR-join are
// retired — the config read below is features.multi_agent_v2 only. It does not decide whether
// the current session exposes a spawn tool.

// Root-level `model_reasoning_effort` of the host's own Codex config — the effort setting
// that gates MultiAgentMode. TOML root keys must precede the first [table] header, so only
// assignments outside every table (or dotted from the root) count.
function parseTopLevelModelReasoningEffort(configContent) {
  let table = null;
  let seen = false;
  let effort = null;
  for (const rawLine of tomlStructuralLines(configContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }
    const assignment = parseTomlAssignment(line);
    if (!tomlAssignmentPathMatches(table, assignment, ['model_reasoning_effort'])) continue;
    const value = parseTomlString(assignment.value);
    if (seen || value === null) return null;
    seen = true;
    effort = value;
  }
  return effort;
}

// The config values actually read. dispatch_posture stays null: absence and effort are not a
// session capability or a dispatch authorization. Kaola-Workflow neither requires nor writes
// these settings.
function dispatchPostureRemediation(configContent) {
  const dispatchMode = detectCodexDispatchMode(configContent || '');
  const effort = parseTopLevelModelReasoningEffort(configContent || '');
  const flag = dispatchMode.multi_agent_v2_enabled === true
    ? 'true'
    : 'not true (absent, false, or unreadable)';
  const effortText = effort == null ? 'absent' : JSON.stringify(effort);
  return 'Config fact: features.multi_agent_v2.enabled is ' + flag
    + '; model_reasoning_effort is ' + effortText
    + '. Kaola-Workflow neither requires nor writes these settings. These reads are not a session'
    + ' tool inventory or a dispatch authorization.';
}

// `multi_agent_enabled` mirrors the config flag already reported as multi_agent_v2_enabled.
// dispatch_posture is null on every input.
function deriveDispatchPosture(configContent) {
  const dispatchMode = detectCodexDispatchMode(configContent);
  const effort = parseTopLevelModelReasoningEffort(configContent);
  return {
    dispatch_posture: null,
    model_reasoning_effort: effort,
    multi_agent_enabled: dispatchMode.multi_agent_v2_enabled,
    dispatch_posture_warning: dispatchPostureRemediation(configContent),
  };
}

// ---------------------------------------------------------------------------
// Numeric features.multi_agent_v2 fields. Report a value only when the config contains it.
// #1111: do not fill a historical Codex >=0.145.0 default of 4 and do not infer an effective
// subagent width (threads - 1). When the flag is not read as enabled, the fields are
// not_applicable. agents.max_threads is not an alias for max_concurrent_threads_per_session.
// A 0.145.0 isolated probe showed Codex doctor did not expose a resolved thread cap either way.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws. The installer carries the
// same report; keep the two in lock-step.
// ---------------------------------------------------------------------------
const MULTI_AGENT_V2_BOUNDS_NOTE = 'Numeric fields under [features.multi_agent_v2] are reported only when the config contains them '
  + '(Kaola-Workflow neither requires nor writes any of it). Absent max_concurrent_threads_per_session stays absent; '
  + 'this report does not apply a historical Codex >=0.145.0 source default and does not infer an effective subagent width. '
  + 'The *_wait_timeout_ms keys are read only when explicitly configured. '
  + 'agents.max_threads is a separate [agents] key, NOT an alias for '
  + 'max_concurrent_threads_per_session, and a stray one does not change the reported thread count.';

const MULTI_AGENT_V2_NUMERIC_FIELDS = [
  'max_concurrent_threads_per_session',
  'min_wait_timeout_ms',
  'max_wait_timeout_ms',
  'default_wait_timeout_ms',
];

// #775: parses the four MultiAgentV2ConfigToml numeric fields from `features.multi_agent_v2`, in
// the same three shapes the enable flag is read in: the [features.multi_agent_v2] sub-table, the
// inline `multi_agent_v2 = { ... }` under [features], and the dotted root form. There is NO
// `max_threads` alias — MULTI_AGENT_V2_NUMERIC_FIELDS above is the closed field list.
// Same first-match/fail-to-absent discipline as the rest of this file: a non-integer or repeated
// value is treated as not-configured rather than guessed at.
function parseMultiAgentV2NumericFields(configContent) {
  const fields = {
    max_concurrent_threads_per_session: null,
    min_wait_timeout_ms: null,
    max_wait_timeout_ms: null,
    default_wait_timeout_ms: null,
  };

  function recordField(key, rawValue) {
    if (!MULTI_AGENT_V2_NUMERIC_FIELDS.includes(key) || fields[key] !== null) return;
    const m = String(rawValue).trim().match(/^-?\d+$/);
    if (!m) return;
    fields[key] = parseInt(m[0], 10);
  }

  function recordInlineFields(value) {
    const inline = parseInlineTomlTableAssignments(value);
    if (inline === null) return;
    for (const field of inline) recordField(field.key[0].value, field.value);
  }

  const lines = tomlStructuralLines(configContent);
  let table = null;
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (!assignment) continue;

    // [features.multi_agent_v2] sub-table (or the dotted root equivalent): plain scalars.
    if (tomlTableNameMatches(table, 'features.multi_agent_v2') && assignment.key.length === 1) {
      recordField(assignment.key[0].value, assignment.value);
      continue;
    }
    // [features] multi_agent_v2 = { ... } — settings live inside the inline table.
    if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      recordInlineFields(assignment.value);
      continue;
    }
    // Dotted form: features.multi_agent_v2.<field> = <n>.
    for (const key of MULTI_AGENT_V2_NUMERIC_FIELDS) {
      if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2', key])) {
        recordField(key, assignment.value);
        break;
      }
    }
  }

  return fields;
}

function deriveMultiAgentV2Bounds(configContent, v2Enabled) {
  const raw = v2Enabled ? parseMultiAgentV2NumericFields(configContent) : null;
  const configuredThreads = raw && raw.max_concurrent_threads_per_session;
  const hasThreads = Number.isInteger(configuredThreads) && configuredThreads >= 1;
  return {
    max_concurrent_threads_per_session: hasThreads ? configuredThreads : null,
    max_concurrent_threads_per_session_source: !v2Enabled ? 'not_applicable' : (hasThreads ? 'config' : 'absent'),
    effective_subagent_width: null,
    min_wait_timeout_ms: raw ? raw.min_wait_timeout_ms : null,
    max_wait_timeout_ms: raw ? raw.max_wait_timeout_ms : null,
    default_wait_timeout_ms: raw ? raw.default_wait_timeout_ms : null,
  };
}

// Codex overlays config keys from ~/.codex, then project .codex directories from
// repository root to cwd. Parse only the multi_agent_v2/posture fields this gate owns,
// retain whether each field was explicitly present, and overlay high layers over
// low layers without treating an absent project field as a reset. Each field overlays
// independently.
function parseRuntimeLayerOverrides(configContent) {
  const overrides = {};
  let table = null;

  function record(key, value, valid = true) {
    if (overrides[key] && overrides[key].present) {
      overrides[key] = { present: true, valid: false, value: null };
      return;
    }
    overrides[key] = { present: true, valid, value: valid ? value : null };
  }

  function recordBoolean(key, raw) {
    const value = parseTomlBoolean(raw);
    record(key, value, value !== null);
  }

  function recordInteger(key, raw) {
    const match = String(raw).trim().match(/^-?\d+$/);
    record(key, match ? parseInt(match[0], 10) : null, !!match);
  }

  for (const rawLine of tomlStructuralLines(configContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['model_reasoning_effort'])) {
      const value = parseTomlString(assignment.value);
      record('model_reasoning_effort', value, value !== null);
      continue;
    }
    if (!assignment) continue;

    // [features.multi_agent_v2] sub-table: plain scalar keys.
    if (tomlTableNameMatches(table, 'features.multi_agent_v2') && assignment.key.length === 1) {
      recordV2Field(assignment.key[0].value, assignment.value);
      continue;
    }
    // [features] multi_agent_v2 = { ... } (or the dotted root equivalent).
    if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      const bool = parseTomlBoolean(assignment.value);
      if (bool !== null) {
        record('v2_enabled', bool);
        continue;
      }
      const inline = parseInlineTomlTableAssignments(assignment.value);
      if (inline === null) {
        record('v2_enabled', null, false);
        continue;
      }
      for (const field of inline) recordV2Field(field.key[0].value, field.value);
      continue;
    }
    // Dotted form: features.multi_agent_v2.<field> = <value>.
    if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2', 'enabled'])) {
      recordBoolean('v2_enabled', assignment.value);
      continue;
    }
    for (const numericKey of MULTI_AGENT_V2_NUMERIC_FIELDS) {
      if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2', numericKey])) {
        recordInteger(`v2_${numericKey}`, assignment.value);
        break;
      }
    }
  }

  function recordV2Field(key, raw) {
    if (key === 'enabled') recordBoolean('v2_enabled', raw);
    else if (MULTI_AGENT_V2_NUMERIC_FIELDS.includes(key)) recordInteger(`v2_${key}`, raw);
  }

  return overrides;
}

function deriveEffectiveRuntime(configLayers) {
  const effective = {};
  const configPaths = [];
  for (const input of configLayers || []) {
    const content = input && typeof input === 'object' ? input.content : input;
    const configPath = input && typeof input === 'object' ? input.configPath || null : null;
    if (configPath) configPaths.push(configPath);
    const layer = parseRuntimeLayerOverrides(content);
    for (const [key, field] of Object.entries(layer)) {
      effective[key] = { ...field, configPath };
    }
  }

  const lines = [];
  const effort = effective.model_reasoning_effort;
  if (effort && effort.present && effort.valid) {
    lines.push(`model_reasoning_effort = ${JSON.stringify(effort.value)}`, '');
  }

  const v2Keys = Object.keys(effective).filter(key => key.startsWith('v2_'));
  if (v2Keys.length > 0) {
    lines.push('[features.multi_agent_v2]');
    const enabled = effective.v2_enabled;
    if (enabled && enabled.present) {
      lines.push(`enabled = ${enabled.valid ? enabled.value : 'true'}`);
    }
    for (const key of MULTI_AGENT_V2_NUMERIC_FIELDS) {
      const field = effective[`v2_${key}`];
      if (field && field.present && field.valid) lines.push(`${key} = ${field.value}`);
    }
  }

  const effectiveContent = lines.join('\n') + '\n';
  const dispatch = detectCodexDispatchMode(effectiveContent);
  const posture = deriveDispatchPosture(effectiveContent);
  const bounds = deriveMultiAgentV2Bounds(effectiveContent, dispatch.multi_agent_v2_enabled);
  return {
    ...dispatch,
    ...posture,
    ...bounds,
    effective_config: effectiveContent,
    effective_config_paths: [...new Set(configPaths)],
  };
}

// Collect one TOML array value that begins on startIndex. The surrounding
// structural view has already masked multiline-string prose, while this scanner
// additionally ignores brackets in ordinary strings and line comments. Project
// root markers intentionally accept only ordinary TOML strings, so a multiline
// string inside this small configuration field is rejected instead of being
// mistaken for masked whitespace.
function collectProjectRootMarkerArray(structuralLines, rawLines, startIndex, initialValue) {
  const fragments = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const first = String(initialValue || '').trim();
  if (!first.startsWith('[')) {
    return { valid: false, value: '', endIndex: startIndex };
  }

  for (let lineIndex = startIndex; lineIndex < structuralLines.length; lineIndex++) {
    // tomlStructuralContent changes bytes only for multiline string bodies.
    // Marker entries containing those bodies are outside this strict string-array
    // contract; comments and ordinary strings remain byte-identical.
    if (structuralLines[lineIndex] !== rawLines[lineIndex]) {
      return { valid: false, value: '', endIndex: lineIndex };
    }
    const fragment = lineIndex === startIndex
      ? first
      : stripTomlComment(structuralLines[lineIndex]).trim();
    fragments.push(fragment);

    for (let offset = 0; offset < fragment.length; offset++) {
      const ch = fragment[offset];
      if (inDouble) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inDouble = false;
        continue;
      }
      if (inSingle) {
        if (ch === "'") inSingle = false;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '[') {
        depth += 1;
        continue;
      }
      if (ch !== ']') continue;
      depth -= 1;
      if (depth < 0) {
        return { valid: false, value: '', endIndex: lineIndex };
      }
      if (depth === 0) {
        if (fragment.slice(offset + 1).trim()) {
          return { valid: false, value: '', endIndex: lineIndex };
        }
        return {
          valid: true,
          value: fragments.join('\n'),
          endIndex: lineIndex,
        };
      }
    }

    // Ordinary TOML strings cannot continue across a physical newline.
    if (inSingle || inDouble || escaped) {
      return { valid: false, value: '', endIndex: lineIndex };
    }
  }

  return { valid: false, value: '', endIndex: structuralLines.length - 1 };
}

function parseProjectRootMarkers(globalConfigContent) {
  let table = null;
  let seen = false;
  let markers = null;
  let valid = true;
  const structuralLines = tomlStructuralLines(globalConfigContent);
  const rawLines = String(globalConfigContent || '').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < structuralLines.length; lineIndex++) {
    const rawLine = structuralLines[lineIndex];
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }
    if (table !== null) continue;
    const assignment = parseTomlAssignment(line);
    if (!assignment || assignment.key.length !== 1
        || assignment.key[0].value !== 'project_root_markers') continue;
    if (seen) {
      valid = false;
      continue;
    }
    seen = true;
    const collected = collectProjectRootMarkerArray(
      structuralLines, rawLines, lineIndex, assignment.value,
    );
    lineIndex = collected.endIndex;
    if (!collected.valid) {
      valid = false;
      continue;
    }
    const value = collected.value;
    const body = value.slice(1, -1).trim();
    if (!body) {
      markers = [];
      continue;
    }
    const parsed = splitInlineTomlFields(body).map(parseTomlString);
    if (parsed.some(entry => entry === null)) {
      valid = false;
      continue;
    }
    markers = parsed;
  }
  return { valid, markers: seen && valid ? markers : ['.git'] };
}

function findProjectRoot(projectRoot, projectRootMarkers) {
  const cwd = path.resolve(projectRoot);
  if ((projectRootMarkers || []).length === 0) return cwd;
  let cursor = cwd;
  while (true) {
    if ((projectRootMarkers || []).some(marker => fs.existsSync(path.join(cursor, marker)))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return cwd;
}

function projectCodexLayerDirs(projectRoot, projectRootMarkers = ['.git']) {
  const cwd = path.resolve(projectRoot);
  const detectedRoot = findProjectRoot(cwd, projectRootMarkers);
  const relative = path.relative(detectedRoot, cwd);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return [path.join(cwd, '.codex')];
  }
  const directories = [detectedRoot];
  let current = detectedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    directories.push(current);
  }
  return [...new Set(directories.map(directory => path.join(directory, '.codex')))];
}

function findRepoRootForTrust(projectRoot) {
  const cwd = path.resolve(projectRoot);
  let checkoutRoot = null;
  for (let cursor = cwd; ; cursor = path.dirname(cursor)) {
    if (fs.existsSync(path.join(cursor, '.git'))) {
      checkoutRoot = cursor;
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
  }
  if (!checkoutRoot) return null;
  const dotGit = path.join(checkoutRoot, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return checkoutRoot;
    const value = fs.readFileSync(dotGit, 'utf8').trim();
    const match = value.match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const gitDir = path.resolve(checkoutRoot, match[1]);
    const worktreesDir = path.dirname(gitDir);
    if (path.basename(worktreesDir) !== 'worktrees') return null;
    return path.dirname(path.dirname(worktreesDir));
  } catch (_) {
    return null;
  }
}

function normalizedProjectTrustKeys(projectPath) {
  const lexical = path.resolve(projectPath);
  let canonical = lexical;
  try { canonical = fs.realpathSync(lexical); } catch (_) {}
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  return [...new Set([normalize(canonical), normalize(lexical)])];
}

function projectTrustLevel(globalConfigContent, layerDir, detectedProjectRoot, repoRoot) {
  const records = [];
  let currentRecord = null;
  let inProjectsContainer = false;
  let unparsedProjectsDeclaration = false;
  for (const rawLine of tomlStructuralLines(globalConfigContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      const currentProject = !tableName.isArrayTable
        && Array.isArray(tableName.segments)
        && tableName.segments.length === 2
        && tableName.segments[0].value === 'projects'
        ? tableName.segments[1].value
        : null;
      currentRecord = currentProject === null
        ? null
        : { project: currentProject, trustAssignments: [] };
      inProjectsContainer = !tableName.isArrayTable
        && Array.isArray(tableName.segments)
        && tableName.segments.length === 1
        && tableName.segments[0].value === 'projects';
      if (Array.isArray(tableName.segments)
          && tableName.segments[0] && tableName.segments[0].value === 'projects'
          && currentProject === null && !inProjectsContainer) {
        unparsedProjectsDeclaration = true;
      }
      if (currentRecord) records.push(currentRecord);
      continue;
    }
    if (currentRecord !== null) {
      const assignment = parseTomlAssignment(line);
      if (assignment && assignment.key.length === 1
          && assignment.key[0].value === 'trust_level') {
        const value = parseTomlString(assignment.value);
        currentRecord.trustAssignments.push(
          value === 'trusted' || value === 'untrusted' ? value : null,
        );
      }
    } else {
      const assignment = parseTomlAssignment(line);
      if (assignment && (inProjectsContainer
          || (assignment.key[0] && assignment.key[0].value === 'projects'))) {
        unparsedProjectsDeclaration = true;
      }
    }
  }

  if (unparsedProjectsDeclaration) return 'ambiguous';

  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const lookupKeys = [...new Set([
    ...normalizedProjectTrustKeys(layerDir),
    ...normalizedProjectTrustKeys(detectedProjectRoot),
    ...(repoRoot ? normalizedProjectTrustKeys(repoRoot) : []),
  ])];
  for (const lookupKey of lookupKeys) {
    const matching = records.filter(record => normalize(record.project) === lookupKey);
    if (matching.length > 1) return 'ambiguous';
    if (matching.length === 0 || matching[0].trustAssignments.length === 0) continue;
    const assignments = matching[0].trustAssignments;
    if (assignments.length !== 1 || assignments[0] === null) return 'ambiguous';
    return assignments[0];
  }
  return 'unknown';
}

function readConfigLayer(codexDir) {
  const configPath = path.join(codexDir, 'config.toml');
  try {
    const codexStat = fs.lstatSync(codexDir);
    if (codexStat.isSymbolicLink()) {
      return { ok: false, configPath, error: 'Codex scope directory is a symlink' };
    }
    if (!codexStat.isDirectory()) {
      return { ok: false, configPath, error: 'Codex scope path is not a directory' };
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      return { ok: false, configPath, error: error.message };
    }
  }
  let stat;
  try {
    stat = fs.lstatSync(configPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, configPath, content: '' };
    }
    return { ok: false, configPath, error: error.message };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, configPath, error: 'config path is a symlink' };
  }
  if (!stat.isFile()) {
    return { ok: false, configPath, error: 'config path is not a regular file' };
  }
  try {
    return { ok: true, configPath, content: fs.readFileSync(configPath, 'utf8') };
  } catch (error) {
    return { ok: false, configPath, error: error.message };
  }
}

function kaolaAgentsDir(codexDir) {
  return path.join(codexDir, 'agents', 'kaola-workflow');
}

// Config-layer safety for one Codex scope. The scope directory, its config.toml, and — only when
// present — the Kaola-owned agents/kaola-workflow/ directory must be regular non-symlink paths that
// resolve inside the scope, so neither this gate nor the installer it may run follows a link out of
// it. The rest of a user's agents/ tree is not Kaola's and is not inspected.
function scopeAuthorityIssue(codexDir) {
  const checks = [
    { target: codexDir, kind: 'directory' },
    { target: path.join(codexDir, 'config.toml'), kind: 'file' },
    { target: kaolaAgentsDir(codexDir), kind: 'directory' },
  ];

  let authorityReal = null;
  try { authorityReal = fs.realpathSync(codexDir); } catch (_) {}
  for (const check of checks) {
    let stat;
    try {
      stat = fs.lstatSync(check.target);
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) continue;
      return { path: check.target, error: error.message };
    }
    if (stat.isSymbolicLink()) {
      return { path: check.target, error: `${check.kind} authority is a symlink` };
    }
    if (check.kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
      return { path: check.target, error: `expected a regular ${check.kind}` };
    }
    if (authorityReal && check.target !== codexDir) {
      let targetReal;
      try { targetReal = fs.realpathSync(check.target); } catch (error) {
        return { path: check.target, error: error.message };
      }
      const relative = path.relative(authorityReal, targetReal);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return { path: check.target, error: 'resolved authority escapes the Codex scope' };
      }
    }
  }
  return null;
}

function unsafeConfigLayerResult(configRead) {
  return {
    exitCode: 4,
    result: {
      status: 'config_layer_unsafe',
      stale: true,
      safe_autofix: false,
      config_path: configRead.configPath,
      error: configRead.error,
      repair: `Replace ${configRead.configPath} with a readable regular non-symlink config.toml, then re-run this preflight.`,
    },
  };
}

function unsafeScopeAuthorityResult(codexDir, scopeName, issue) {
  return {
    exitCode: 4,
    result: {
      status: 'scope_authority_unsafe',
      scope: scopeName,
      stale: true,
      safe_autofix: false,
      codex_dir: codexDir,
      authority_path: issue.path,
      error: issue.error,
      repair: `Replace ${issue.path} with the expected regular non-symlink path inside ${codexDir}, then re-run this preflight.`,
    },
  };
}

// The effective-runtime report every result carries. Report-only: none of it gates.
function runtimeFields(runtime) {
  return {
    dispatch_mode: runtime.dispatch_mode,
    multi_agent_v2_enabled: runtime.multi_agent_v2_enabled,
    dispatch_posture: runtime.dispatch_posture,
    model_reasoning_effort: runtime.model_reasoning_effort,
    multi_agent_enabled: runtime.multi_agent_enabled,
    dispatch_posture_warning: runtime.dispatch_posture_warning,
    max_concurrent_threads_per_session: runtime.max_concurrent_threads_per_session,
    max_concurrent_threads_per_session_source: runtime.max_concurrent_threads_per_session_source,
    effective_subagent_width: runtime.effective_subagent_width,
    min_wait_timeout_ms: runtime.min_wait_timeout_ms,
    max_wait_timeout_ms: runtime.max_wait_timeout_ms,
    default_wait_timeout_ms: runtime.default_wait_timeout_ms,
    effective_config_paths: runtime.effective_config_paths || [],
  };
}

// Codex derives the project root from the persisted global `project_root_markers`, then considers
// every .codex layer root -> cwd. Trust is decided independently for each layer: exact layer,
// detected root, then root Git project. Only trusted layers enter the effective runtime overlay.
// A project layer that is HOME's own .codex is the user scope and is not listed twice.
function discoverCodexLayers(projectRoot, homeDir) {
  const globalCodexDir = path.join(homeDir, '.codex');
  const globalConfigRead = readConfigLayer(globalCodexDir);
  const globalConfigContent = globalConfigRead.ok ? globalConfigRead.content : '';
  const markerConfig = globalConfigRead.ok
    ? parseProjectRootMarkers(globalConfigContent)
    : { valid: true, markers: ['.git'] };
  const markers = markerConfig.valid ? markerConfig.markers : ['.git'];
  const detectedProjectRoot = findProjectRoot(projectRoot, markers);
  const repoRoot = findRepoRootForTrust(projectRoot);
  const projectLayers = projectCodexLayerDirs(projectRoot, markers)
    .filter(codexDir => path.resolve(codexDir) !== path.resolve(globalCodexDir))
    .map(codexDir => ({
      codexDir,
      projectRoot: path.dirname(codexDir),
      trust: globalConfigRead.ok
        ? projectTrustLevel(globalConfigContent, path.dirname(codexDir), detectedProjectRoot, repoRoot)
        : 'unknown',
      configRead: readConfigLayer(codexDir),
    }));
  const projectTrust = projectLayers.length > 0
    ? projectLayers[projectLayers.length - 1].trust
    : 'unknown';
  return {
    globalCodexDir,
    globalConfigRead,
    globalConfigContent,
    markerConfig,
    projectLayers,
    projectTrust,
  };
}

// ---------------------------------------------------------------------------
// Retired-role residue — read-only. Names only what earlier Kaola releases wrote: a file whose
// basename is in RETIRED_PROFILE_FILES or is the ownership manifest, directly inside the Kaola-owned
// agents/kaola-workflow/ directory, and the managed marker block in config.toml. Files anywhere else
// and user [agents.*] tables outside the markers are never residue. A symlinked or non-directory
// agents/kaola-workflow is not followed (scopeAuthorityIssue refuses it for a loaded scope).
// ---------------------------------------------------------------------------
function inspectRetiredRoleResidue(codexDir, configContent) {
  const residueDir = kaolaAgentsDir(codexDir);
  const configPath = path.join(codexDir, 'config.toml');
  const owned = new Set([...RETIRED_PROFILE_FILES, MANIFEST_BASENAME]);
  const profileFiles = [];
  let dirStat = null;
  try { dirStat = fs.lstatSync(residueDir); } catch (_) {}
  if (dirStat && dirStat.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(residueDir); } catch (_) {}
    for (const name of names.sort()) {
      if (owned.has(name)) profileFiles.push(path.join(residueDir, name));
    }
  }
  const managedBlock = managedMarkerRange(configContent).state;
  const residuePaths = [...profileFiles, ...(managedBlock === 'absent' ? [] : [configPath])];
  return {
    codex_dir: codexDir,
    config_path: configPath,
    retired_profile_files: profileFiles,
    managed_block: managedBlock,
    residue_paths: residuePaths,
    present: residuePaths.length > 0,
  };
}

// User scope first, then every project layer root -> cwd. An ignored (untrusted) layer is still
// Kaola-owned disk state the installer removes, so it is inspected too — but never through an
// unsafe path: such a layer is skipped rather than followed.
function collectResidueScopes(layers) {
  const scopes = [{
    label: 'global',
    globalInstall: true,
    projectRoot: null,
    trust: null,
    residue: inspectRetiredRoleResidue(layers.globalCodexDir, layers.globalConfigContent),
  }];
  for (const layer of layers.projectLayers) {
    if (layer.trust !== 'trusted' && scopeAuthorityIssue(layer.codexDir)) continue;
    scopes.push({
      label: layer.projectRoot,
      globalInstall: false,
      projectRoot: layer.projectRoot,
      trust: layer.trust,
      residue: inspectRetiredRoleResidue(
        layer.codexDir, layer.configRead.ok ? layer.configRead.content : ''),
    });
  }
  return scopes;
}

function residueInstallCommand(installerPath, scope, homeDir) {
  if (!scope.globalInstall) return `node ${installerPath} ${scope.projectRoot}`;
  const homePrefix = path.resolve(homeDir) === path.resolve(os.homedir()) ? '' : `HOME=${homeDir} `;
  return `${homePrefix}node ${installerPath} --global`;
}

// What the user does with what the installer keeps. config.toml is never deleted: it holds the
// user's own settings, and only the managed block inside it is Kaola's.
const PRESERVED_REPAIR = 'What the installer keeps (modified since install, or with no ownership '
  + 'record) is yours to review: in config.toml remove only the lines from "' + BEGIN_MARKER + '" to "'
  + END_MARKER + '" (never the file), and remove a kept profile under .codex/agents/kaola-workflow/ '
  + 'only after checking no remaining config_file line points at it.';

function residueScopeRepair(installerPath, scope, homeDir) {
  const command = residueInstallCommand(installerPath, scope, homeDir);
  if (scope.residue.managed_block === 'invalid') {
    return `${scope.residue.config_path} holds an unbalanced "${BEGIN_MARKER}" / "${END_MARKER}" `
      + 'marker pair. Remove those marker lines and the retired [agents.*] registrations Kaola-Workflow '
      + `wrote between them by hand, then run: ${command}`;
  }
  return 'Kaola-Workflow no longer installs Codex role profiles. Re-run the Kaola Codex installer for '
    + `this scope; it removes the Kaola-owned retired role profiles and managed config block: ${command}. `
    + PRESERVED_REPAIR;
}

function residueScopeReport(installerPath, scope, homeDir) {
  return {
    scope: scope.label,
    codex_dir: scope.residue.codex_dir,
    config_path: scope.residue.config_path,
    ...(scope.globalInstall ? {} : { project_trust: scope.trust }),
    retired_profile_files: scope.residue.retired_profile_files,
    managed_block: scope.residue.managed_block,
    residue_paths: scope.residue.residue_paths,
    safe_autofix: scope.residue.managed_block !== 'invalid',
    repair: residueScopeRepair(installerPath, scope, homeDir),
  };
}

function retiredRoleResidueResult(residueScopes, runtime, installerPath, installerFound, homeDir) {
  const residue = residueScopes.map(scope => residueScopeReport(installerPath, scope, homeDir));
  return {
    exitCode: 1,
    result: {
      status: RETIRED_ROLE_RESIDUE_STATUS,
      stale: true,
      safe_autofix: installerFound && residue.every(scope => scope.safe_autofix),
      residue_paths: residue.flatMap(scope => scope.residue_paths),
      residue,
      repair: residue.map(scope => scope.repair).join('\n'),
      ...runtimeFields(runtime),
    },
  };
}

function managedMarkerRange(configContent) {
  const source = String(configContent || '');
  const structural = tomlStructuralContent(source);
  const beginPattern = new RegExp(`^${escapeRegExp(BEGIN_MARKER)}\\r?$`, 'gm');
  const endPattern = new RegExp(`^${escapeRegExp(END_MARKER)}\\r?$`, 'gm');
  const begins = [...structural.matchAll(beginPattern)];
  const ends = [...structural.matchAll(endPattern)];
  if (begins.length === 0 && ends.length === 0) {
    return { state: 'absent', start: -1, end: -1 };
  }
  if (begins.length !== 1 || ends.length !== 1 || begins[0].index >= ends[0].index) {
    return { state: 'invalid', start: -1, end: -1 };
  }
  let end = ends[0].index + END_MARKER.length;
  if (source.slice(end, end + 2) === '\r\n') end += 2;
  else if (source[end] === '\n') end += 1;
  return { state: 'present', start: begins[0].index, end, endMarkerStart: ends[0].index };
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = null;
  let noAutofix = false;
  let json = false;
  let doctor = false;
  let home = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[++i];
    } else if (args[i] === '--no-autofix') {
      noAutofix = true;
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--doctor') {
      doctor = true;
    } else if (args[i] === '--home' && args[i + 1]) {
      home = args[++i];
    }
  }

  return { projectRoot, noAutofix, json, doctor, home };
}

// ---------------------------------------------------------------------------
// Find the installer script sibling to this script.
// Returns the absolute path if it exists, or null.
// ---------------------------------------------------------------------------
function findInstaller(scriptDir) {
  const installerPath = path.join(scriptDir, INSTALLER_BASENAME);
  return fs.existsSync(installerPath) ? installerPath : null;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function regularNonSymlinkFile(target) {
  try {
    const stat = fs.lstatSync(target);
    return !stat.isSymbolicLink() && stat.isFile();
  } catch (_) {
    return false;
  }
}

// The repository-root CLI is a documented entrypoint, while its plugin manifest and
// installer live in plugins/kaola-workflow. Resolve that one source-tree layout
// explicitly. Installed/cache copies retain their direct scriptDir and therefore
// their own exact manifest/path authority.
function resolvePreflightSourceScriptDir(scriptDir, home) {
  const requested = path.resolve(scriptDir);
  const requestedRoot = path.resolve(requested, '..');
  const directManifest = path.join(requestedRoot, '.codex-plugin', 'plugin.json');
  try {
    fs.lstatSync(directManifest);
    return requested;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') return requested;
  }

  const cacheRoot = path.resolve(home || os.homedir(), '.codex', 'plugins', 'cache');
  if (pathIsWithin(cacheRoot, requestedRoot)) return requested;
  if (path.basename(requested) !== 'scripts') return requested;

  const packagePath = path.join(requestedRoot, 'package.json');
  const rootPreflight = path.join(requested, 'kaola-workflow-codex-preflight.js');
  const bundledRoot = path.join(requestedRoot, 'plugins', 'kaola-workflow');
  const bundledScripts = path.join(bundledRoot, 'scripts');
  const bundledPreflight = path.join(bundledScripts, 'kaola-workflow-codex-preflight.js');
  const bundledManifest = path.join(bundledRoot, '.codex-plugin', 'plugin.json');
  if (!regularNonSymlinkFile(packagePath)
      || !regularNonSymlinkFile(rootPreflight)
      || !regularNonSymlinkFile(bundledPreflight)
      || !regularNonSymlinkFile(bundledManifest)) return requested;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!packageJson || packageJson.name !== 'kaola-workflow') return requested;
  } catch (_) {
    return requested;
  }
  return bundledScripts;
}

// ---------------------------------------------------------------------------
// Run the installer (positional arg: projectRoot — NOT --project-root flag).
// Returns { success: boolean, stderr: string }
// ---------------------------------------------------------------------------
function runInstaller(installerPath, projectRoot, globalInstall = false, home = null) {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      [installerPath, ...(globalInstall ? ['--global'] : [projectRoot])],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: home ? { ...process.env, HOME: home } : process.env,
      }
    );
    if (result.status === 0) {
      return { success: true, stderr: result.stderr || '' };
    }
    return {
      success: false,
      stderr: (result.stderr || '') + (result.error ? result.error.message : '')
    };
  } catch (e) {
    return { success: false, stderr: e.message };
  }
}

function realpathOrResolved(target) {
  const resolved = path.resolve(target);
  try { return fs.realpathSync(resolved); } catch (_) { return resolved; }
}

function readPluginIdentity(scriptDir, home) {
  const pluginRoot = path.resolve(scriptDir, '..');
  const manifestDir = path.join(pluginRoot, '.codex-plugin');
  const manifestPath = path.join(manifestDir, 'plugin.json');
  const cacheRoot = path.resolve(home, '.codex', 'plugins', 'cache');
  let relativeRoot = path.relative(cacheRoot, pluginRoot);
  // #1104: the CLI's __dirname is realpath-resolved while home may be reached
  // through a symlink, so fall back to comparing the resolved paths.
  if (!pathIsWithin(cacheRoot, pluginRoot)) {
    relativeRoot = path.relative(realpathOrResolved(cacheRoot), realpathOrResolved(pluginRoot));
  }
  const insideCache = relativeRoot !== '' && relativeRoot !== '..'
    && !relativeRoot.startsWith('..' + path.sep) && !path.isAbsolute(relativeRoot);
  const cacheParts = insideCache ? relativeRoot.split(path.sep) : null;
  if (insideCache) {
    if (cacheParts.length !== 3) {
      return {
        identity: null,
        error: `plugin_cache_path_unsafe: ${pluginRoot} is not a marketplace/name/version cache root`,
        manifestPath,
      };
    }
    for (const component of [...pluginCacheRootComponents(home), path.join(cacheRoot, cacheParts[0]),
      path.join(cacheRoot, cacheParts[0], cacheParts[1]), pluginRoot]) {
      const issue = cachePathIssue(component, 'plugin_cache_path');
      if (issue) return { identity: null, error: issue, manifestPath };
    }
  }
  const manifestDirIssue = cachePathIssue(manifestDir, 'plugin_manifest_path');
  if (manifestDirIssue) return { identity: null, error: manifestDirIssue, manifestPath };
  let stat;
  try {
    stat = fs.lstatSync(manifestPath);
  } catch (error) {
    return {
      identity: null,
      error: `plugin_manifest_unsafe: cannot inspect ${manifestPath}: ${error.message}`,
      manifestPath,
    };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return {
      identity: null,
      error: `plugin_manifest_unsafe: ${manifestPath} must be a regular non-symlink file`,
      manifestPath,
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      identity: null,
      error: `plugin_manifest_invalid: cannot parse ${manifestPath}: ${error.message}`,
      manifestPath,
    };
  }
  const name = manifest && typeof manifest.name === 'string' ? manifest.name : '';
  const version = manifest && typeof manifest.version === 'string' ? manifest.version : '';
  if (!name || !version || name === '.' || name === '..' || version === '.' || version === '..'
      || name.includes('/') || name.includes('\\') || version.includes('/') || version.includes('\\')) {
    return {
      identity: null,
      error: `plugin_manifest_invalid: ${manifestPath} must declare safe non-empty name and version strings`,
      manifestPath,
    };
  }
  if (insideCache) {
    if (cacheParts[1] !== name) {
      return {
        identity: null,
        error: `plugin_manifest_name_mismatch: expected=${cacheParts[1]} got=${name}`,
        manifestPath,
      };
    }
    if (cacheParts[2] !== version) {
      return {
        identity: null,
        error: `plugin_manifest_version_mismatch: expected=${cacheParts[2]} got=${version}`,
        manifestPath,
      };
    }
  }
  return { identity: { name, version }, error: null, manifestPath };
}

function cachePathIssue(target, label) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    return error && error.code === 'ENOENT'
      ? `${label}_missing: ${target}`
      : `${label}_unsafe: cannot inspect ${target}: ${error.message}`;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    return `${label}_unsafe: ${target} must be a regular non-symlink directory`;
  }
  return null;
}

function pluginCacheRootComponents(home) {
  const codexRoot = path.join(home, '.codex');
  const pluginsRoot = path.join(codexRoot, 'plugins');
  return [codexRoot, pluginsRoot, path.join(pluginsRoot, 'cache')];
}

function projectRootMarkersInvalidResult(configPath) {
  return {
    exitCode: 4,
    result: {
      status: 'project_root_markers_invalid',
      stale: true,
      safe_autofix: false,
      config_path: configPath,
      repair: 'Set top-level project_root_markers to exactly one TOML array of strings, then start a fresh Codex session.',
    },
  };
}

// ---------------------------------------------------------------------------
// Core preflight check
// ---------------------------------------------------------------------------
function runPreflight(opts) {
  const {
    projectRoot,
    noAutofix,
    scriptDir,
    home,
  } = opts;
  const homeDir = home || os.homedir();
  const sourceScriptDir = resolvePreflightSourceScriptDir(scriptDir, homeDir);

  // --- Config-layer safety: HOME always, project layers only once Codex loads them. ---
  const layers = discoverCodexLayers(projectRoot, homeDir);
  if (!layers.globalConfigRead.ok) return unsafeConfigLayerResult(layers.globalConfigRead);
  if (!layers.markerConfig.valid) {
    return projectRootMarkersInvalidResult(layers.globalConfigRead.configPath);
  }
  const globalAuthorityIssue = scopeAuthorityIssue(layers.globalCodexDir);
  if (globalAuthorityIssue) {
    return unsafeScopeAuthorityResult(layers.globalCodexDir, 'global', globalAuthorityIssue);
  }
  const loadedProjectLayers = layers.projectLayers.filter(layer => layer.trust === 'trusted');
  const unsafeProjectConfig = loadedProjectLayers.find(layer => !layer.configRead.ok);
  if (unsafeProjectConfig) return unsafeConfigLayerResult(unsafeProjectConfig.configRead);
  for (const layer of loadedProjectLayers) {
    const issue = scopeAuthorityIssue(layer.codexDir);
    if (issue) return unsafeScopeAuthorityResult(layer.codexDir, 'project', issue);
  }

  const effectiveRuntime = deriveEffectiveRuntime([
    { content: layers.globalConfigContent, configPath: layers.globalConfigRead.configPath },
    ...loadedProjectLayers.map(layer => ({
      content: layer.configRead.content,
      configPath: layer.configRead.configPath,
    })),
  ]);

  // --- Retired-role residue ---
  const installerFound = findInstaller(sourceScriptDir);
  const installerPath = installerFound || path.join(sourceScriptDir, INSTALLER_BASENAME);
  const residueScopes = collectResidueScopes(layers).filter(scope => scope.residue.present);
  if (residueScopes.length === 0) {
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        autofixed: false,
        project_trust: layers.projectTrust,
        scopes_checked: [layers.globalCodexDir, ...layers.projectLayers.map(layer => layer.codexDir)],
        ...runtimeFields(effectiveRuntime),
      },
    };
  }

  const finding = retiredRoleResidueResult(
    residueScopes, effectiveRuntime, installerPath, !!installerFound, homeDir);
  if (noAutofix) return finding;

  // --- Autofix: only the installer removes residue; this file never deletes anything. ---
  if (!installerFound) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        stale: true,
        safe_autofix: false,
        residue_paths: finding.result.residue_paths,
        residue: finding.result.residue,
        repair: `${INSTALLER_BASENAME} not found alongside this script; refresh the kaola-workflow plugin, then re-run this preflight.`,
        ...runtimeFields(effectiveRuntime),
      },
    };
  }

  // Prove every target is repairable before the first installer subprocess can mutate anything:
  // an unbalanced marker pair is a manual repair, not permission to partially clean other scopes.
  const ambiguousScope = residueScopes.find(scope => scope.residue.managed_block === 'invalid');
  if (ambiguousScope) {
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        scope: ambiguousScope.label,
        stale: true,
        safe_autofix: false,
        config_path: ambiguousScope.residue.config_path,
        residue_paths: finding.result.residue_paths,
        residue: finding.result.residue,
        repair: residueScopeRepair(installerPath, ambiguousScope, homeDir),
        ...runtimeFields(effectiveRuntime),
      },
    };
  }

  for (const scope of residueScopes) {
    const repairRun = runInstaller(installerPath, scope.projectRoot, scope.globalInstall, homeDir);
    if (!repairRun.success) {
      return {
        exitCode: 5,
        result: {
          status: 'installer_failed',
          scope: scope.label,
          stale: true,
          safe_autofix: false,
          residue_paths: finding.result.residue_paths,
          residue: finding.result.residue,
          repair: `Installer error for ${scope.label}: ${repairRun.stderr}`,
          ...runtimeFields(effectiveRuntime),
        },
      };
    }
  }

  // Re-enter the complete read-only gate so every layer is rediscovered from persisted bytes.
  const verified = runPreflight({
    ...opts,
    noAutofix: true,
  });
  if (verified.exitCode === 1 && verified.result.status === RETIRED_ROLE_RESIDUE_STATUS) {
    // The installer succeeded but preserved what it could not prove Kaola installed (an edited
    // profile, an unrecorded file, a changed block). That is residue for the user, not an
    // installer failure.
    return {
      exitCode: 1,
      result: {
        ...verified.result,
        autofix_attempted: true,
        repair: 'The Kaola Codex installer ran and kept what it cannot prove Kaola installed '
          + `unchanged. ${PRESERVED_REPAIR} Then re-run this preflight.`,
      },
    };
  }
  if (verified.exitCode !== 0) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        stale: true,
        safe_autofix: false,
        repair: 'Installer ran, but the complete persisted-layer re-verification still refused.',
        postcheck: verified.result,
      },
    };
  }
  return {
    exitCode: 0,
    result: {
      ...verified.result,
      autofixed: true,
      autofixed_residue_paths: finding.result.residue_paths,
    },
  };
}

// ---------------------------------------------------------------------------
// Doctor mode — READ-ONLY multi-scope reporting. Never runs the installer.
// Scopes: user (<home>/.codex) and every project .codex layer root -> cwd.
// ---------------------------------------------------------------------------
function doctorScopeReport(name, residue, runtime, repair, extra = {}) {
  return {
    scope: name,
    codex_dir: residue.codex_dir,
    config_path: residue.config_path,
    exists: fs.existsSync(residue.codex_dir),
    ...extra,
    retired_role_residue: residue.present,
    retired_profile_files: residue.retired_profile_files,
    managed_block: residue.managed_block,
    residue_paths: residue.residue_paths,
    ...runtimeFields(runtime),
    read_only: true,
    repair: residue.present ? repair : null,
  };
}

function runDoctor(opts) {
  const { projectRoot, scriptDir } = opts;
  const home = opts.home || os.homedir();
  const sourceScriptDir = resolvePreflightSourceScriptDir(scriptDir, home);
  const pluginIdentityRead = readPluginIdentity(sourceScriptDir, home);
  if (pluginIdentityRead.error) {
    return {
      exitCode: 2,
      result: {
        status: 'plugin_identity_invalid',
        error: pluginIdentityRead.error,
        plugin_manifest: pluginIdentityRead.manifestPath,
        scopes: [],
      },
    };
  }
  const installerPath = findInstaller(sourceScriptDir)
    || path.join(sourceScriptDir, INSTALLER_BASENAME);

  const layers = discoverCodexLayers(projectRoot, home);
  const userConfig = layers.globalConfigRead;
  const refused = (scopes, extra = {}) => ({
    exitCode: 1,
    result: {
      status: 'stale',
      project_trust: layers.projectTrust,
      plugin: pluginIdentityRead.identity,
      ...extra,
      scopes,
    },
  });

  if (!layers.markerConfig.valid) {
    return refused([{
      scope: 'user',
      codex_dir: layers.globalCodexDir,
      config_path: userConfig.configPath,
      exists: true,
      project_root_markers_invalid: true,
      read_only: true,
      repair: projectRootMarkersInvalidResult(userConfig.configPath).result.repair,
    }]);
  }

  // Project config is not part of Codex's runtime authority until the project is trusted. Unsafe
  // ignored paths are reported as ignored, not followed or gated.
  const loadedProjectLayers = layers.projectLayers.filter(layer => layer.trust === 'trusted');
  const unsafeConfigs = [
    ...(userConfig.ok ? [] : [{ scope: 'user', configRead: userConfig }]),
    ...loadedProjectLayers.filter(layer => !layer.configRead.ok)
      .map(layer => ({ scope: 'project_layer', configRead: layer.configRead })),
  ];
  if (unsafeConfigs.length > 0) {
    return refused(unsafeConfigs.map(({ scope, configRead }) => ({
      scope,
      codex_dir: path.dirname(configRead.configPath),
      config_path: configRead.configPath,
      exists: true,
      config_layer_unsafe: true,
      error: configRead.error,
      read_only: true,
      repair: unsafeConfigLayerResult(configRead).result.repair,
    })));
  }

  const authorityIssues = [
    { codexDir: layers.globalCodexDir, scope: 'user' },
    ...loadedProjectLayers.map(layer => ({ codexDir: layer.codexDir, scope: 'project_layer' })),
  ].map(check => ({ ...check, issue: scopeAuthorityIssue(check.codexDir) }))
    .filter(check => check.issue);
  if (authorityIssues.length > 0) {
    return refused(authorityIssues.map(authority => ({
      scope: authority.scope,
      codex_dir: authority.codexDir,
      exists: true,
      scope_authority_unsafe: true,
      authority_path: authority.issue.path,
      error: authority.issue.error,
      read_only: true,
      repair: unsafeScopeAuthorityResult(
        authority.codexDir, authority.scope, authority.issue,
      ).result.repair,
    })), { scope_authority_unsafe: true });
  }

  const effectiveRuntime = deriveEffectiveRuntime([
    { content: layers.globalConfigContent, configPath: userConfig.configPath },
    ...loadedProjectLayers.map(layer => ({
      content: layer.configRead.content, configPath: layer.configRead.configPath,
    })),
  ]);

  const residueByDir = new Map(collectResidueScopes(layers)
    .map(scope => [scope.residue.codex_dir, scope]));
  const scopes = [];
  const userScope = residueByDir.get(layers.globalCodexDir);
  scopes.push(doctorScopeReport(
    'user', userScope.residue, effectiveRuntime,
    residueScopeRepair(installerPath, userScope, home),
  ));
  layers.projectLayers.forEach((layer, index) => {
    const name = index === layers.projectLayers.length - 1 ? 'project' : 'project_layer';
    const extra = {
      project_trust: layer.trust,
      config_layer_ignored: layer.trust !== 'trusted',
    };
    if (!layer.configRead.ok) extra.ignored_config_error = layer.configRead.error;
    const residueScope = residueByDir.get(layer.codexDir);
    if (!residueScope) {
      // An ignored layer behind an unsafe path: reported, never followed.
      const issue = scopeAuthorityIssue(layer.codexDir);
      extra.ignored_authority_error = issue ? `${issue.path}: ${issue.error}` : null;
      scopes.push(doctorScopeReport(name, {
        codex_dir: layer.codexDir,
        config_path: layer.configRead.configPath,
        retired_profile_files: [],
        managed_block: 'n/a',
        residue_paths: [],
        present: false,
      }, effectiveRuntime, null, extra));
      return;
    }
    scopes.push(doctorScopeReport(
      name, residueScope.residue, effectiveRuntime,
      residueScopeRepair(installerPath, residueScope, home), extra,
    ));
  });

  const residuePaths = scopes.flatMap(scope => scope.residue_paths || []);
  const gating = residuePaths.length > 0;
  return {
    exitCode: gating ? 1 : 0,
    result: {
      status: gating ? 'stale' : 'ok',
      project_trust: layers.projectTrust,
      plugin: pluginIdentityRead.identity,
      retired_role_residue: residuePaths.length > 0,
      residue_paths: residuePaths,
      ...runtimeFields(effectiveRuntime),
      scopes,
    },
  };
}

// MultiAgentV2 bounds line: report-only, never affects exitCode. null when v2 not active.
function boundsNote(result) {
  if (result.max_concurrent_threads_per_session === null
      || result.max_concurrent_threads_per_session === undefined) return null;
  return `config features.multi_agent_v2.max_concurrent_threads_per_session=${result.max_concurrent_threads_per_session} `
    + `[${result.max_concurrent_threads_per_session_source}]; not an inferred session concurrency cap`;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { projectRoot: rawRoot, noAutofix, json, doctor, home: rawHome } = parseArgs(process.argv);
  const resolvedRoot = rawRoot ? path.resolve(rawRoot) : process.cwd();
  const resolvedHome = rawHome ? path.resolve(rawHome) : os.homedir();
  const scriptDir = __dirname;

  if (doctor) {
    const { exitCode, result } = runDoctor({
      projectRoot: resolvedRoot,
      home: resolvedHome,
      scriptDir,
    });

    if (json || exitCode !== 0) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      for (const s of (result.scopes || [])) {
        const state = s.config_layer_ignored ? 'ok (ignored: project not trusted)' : 'ok';
        process.stdout.write(`${s.scope}: ${state} (${s.codex_dir})\n`);
      }
      process.stdout.write(`multi_agent_v2: ${result.multi_agent_v2_enabled ? 'enabled' : 'not enabled'}\n`);
      // #598: report-only — the dispatch-posture note never affects exitCode.
      if (result.dispatch_posture_warning) process.stdout.write(`note: ${result.dispatch_posture_warning}\n`);
      const note = boundsNote(result);
      if (note) process.stdout.write(`note: ${note}\n`);
    }
    process.exit(exitCode);
  }

  const { exitCode, result } = runPreflight({
    projectRoot: resolvedRoot,
    noAutofix,
    scriptDir,
    home: resolvedHome,
  });

  if (json || exitCode !== 0) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Fresh (exit 0, no --json): print human-readable summary
    const autofixNote = result.autofixed ? ' (retired role residue removed by the installer)' : '';
    process.stdout.write(
      `ok: no retired role residue; multi_agent_v2 ${result.multi_agent_v2_enabled ? 'enabled' : 'not enabled'}${autofixNote}\n`
    );
    // #598: report-only — the dispatch-posture note never affects exitCode.
    if (result.dispatch_posture_warning) {
      process.stdout.write(`note: ${result.dispatch_posture_warning}\n`);
    }
    const note = boundsNote(result);
    if (note) process.stdout.write(`note: ${note}\n`);
  }

  process.exit(exitCode);
}

module.exports = {
  runPreflight,
  runDoctor,
  parseArgs,
  // Retired-role residue (read-only; the installer owns removal).
  RETIRED_ROLE_RESIDUE_STATUS,
  RETIRED_PROFILE_FILES,
  MANIFEST_BASENAME,
  inspectRetiredRoleResidue,
  managedMarkerRange,
  // #598: effort-gated dispatch-posture derivation (pure; exported for unit tests).
  detectCodexDispatchMode,
  deriveDispatchPosture,
  parseTopLevelModelReasoningEffort,
  dispatchPostureRemediation,
  DISPATCH_POSTURE_VERSION_NOTE,
  // #611: MultiAgentV2 concurrency + wait-timeout bounds derivation (pure; exported for unit tests).
  parseMultiAgentV2NumericFields,
  deriveMultiAgentV2Bounds,
  parseRuntimeLayerOverrides,
  deriveEffectiveRuntime,
  MULTI_AGENT_V2_BOUNDS_NOTE,
};
