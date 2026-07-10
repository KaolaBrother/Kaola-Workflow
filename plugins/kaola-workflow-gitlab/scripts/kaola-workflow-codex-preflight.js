#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-codex-preflight.js (issue #266 AC-B; extended by #332)
//
// Hard-gates Codex agent-profile freshness BEFORE any subagent-invoked compliance
// is claimed. Verifies:
//   (a) .codex/agents/kaola-workflow/<role>.toml exists for every REQUIRED role
//       AND is schema-valid (top-level non-empty `name` matching the role, the governed
//       standalone Sol/medium or Sol/xhigh profile pin, non-empty `description`, valid `nickname_candidates`,
//       and a non-blank developer_instructions block) - codex >=0.138 silently ignores
//       a profile without a non-empty `name`.
//   (b) .codex/config.toml contains the managed block with an [agents.{role}] entry
//       for every REQUIRED role, and NO retired/foreign [agents.*] inside the block.
//   (c) no stale/retired Kaola profile files survive in the target dir (#332).
//
// REQUIRED role set = UNION of:
//   (a) template roles from ../config/agents.toml (relative to this script, present
//       in the 3 plugin trees; absent in the claude scripts/ tree — graceful degrade)
//   (b) plan roles from --plan <path> (## Nodes role column), when supplied
//
// Auto-installs (re-runs install-codex-agent-profiles.js) when the ONLY problem
// is a stale/missing/malformed managed block, profile file, or stale Kaola file
// (safe, idempotent). Typed-refuses when conflicts exist outside the markers, the
// installer is unavailable, a plan role is absent from the template, or the local
// manifest carries an unsupported (future) schema_version.
//
// --doctor mode is READ-ONLY (never runs the installer): it reports user, project,
// and plugin-cache scope freshness with concrete per-scope repair commands. Plugin
// cache findings are evidence-only and never set the exit code (#332 AC11).
//
// TRUE 4-tree byte-identical: requires ONLY fs + path + os + inline regex. No
// require() of edition-specific scripts. The #332 schema regexes + constants below
// are DELIBERATELY DUPLICATED from install-codex-agent-profiles.js (the root scripts/
// tree has no installer to require); keep the two copies in lock-step.
//
// CLI:
//   node kaola-workflow-codex-preflight.js --project-root <dir>
//     [--plan <plan-path>] [--no-autofix] [--json]
//   node kaola-workflow-codex-preflight.js --doctor [--project-root <dir>]
//     [--home <dir>] [--json]
//
// Exit 0 = fresh (or autofixed-then-fresh); non-zero = typed refusal.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const os = require('os');

const BEGIN_MARKER = '# BEGIN kaola-workflow agents';
const END_MARKER = '# END kaola-workflow agents';

// #332 schema constants — MIRROR of install-codex-agent-profiles.js. Keep in sync.
const MANIFEST_BASENAME = '.kaola-managed-profiles.json';
const RETIRED_PROFILE_FILES = [
  'docs-lookup.toml',
  // #451: the six `<role>-max` xhigh effort-variant profiles are retired - a surviving copy reads as
  // stale here (repaired by the installer). NEVER blanket-glob `*-max` (a user may own one).
  'planner-max.toml',
  'code-architect-max.toml',
  'tdd-guide-max.toml',
  'code-reviewer-max.toml',
  'security-reviewer-max.toml',
  'adversarial-verifier-max.toml',
];
const EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh'];
const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
  'code-explorer', 'knowledge-lookup', 'tdd-guide', 'implementer',
  'doc-updater', 'issue-scout', 'contractor', 'metric-optimizer',
]);
const CODEX_PINNED_REASONING_ROLES = Object.freeze([
  'planner', 'code-architect', 'build-error-resolver', 'code-reviewer',
  'security-reviewer', 'adversarial-verifier', 'workflow-planner', 'synthesizer',
]);
// Workflow-planner and contractor are dispatched outside the adaptive Node Ledger. Their
// workflow/plan/finalization artifacts are the authoritative durable result, with an additional
// cache mirror only when a caller supplies a seeded evidence file. All other profiles are DAG node
// roles and must self-write the exact seeded cache artifact before returning a compact summary.
const CODEX_ORCHESTRATION_ROLES = Object.freeze(['contractor', 'workflow-planner']);
const CODEX_STANDARD_MODEL = 'gpt-5.6-sol';
const CODEX_STANDARD_EFFORT = 'medium';
const CODEX_REASONING_MODEL = 'gpt-5.6-sol';
const CODEX_REASONING_EFFORT = 'xhigh';
const MANIFEST_SCHEMA_VERSION = 1;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTopLevelString(top, key) {
  const re = new RegExp('^' + escapeRegExp(key) + '\\s*=\\s*"([^"]*)"\\s*$', 'm');
  const m = top.match(re);
  return m ? m[1] : null;
}

function parseStringArrayLine(top, key) {
  const re = new RegExp('^' + escapeRegExp(key) + '\\s*=\\s*\\[([^\\]]*)\\]\\s*$', 'm');
  const m = top.match(re);
  if (!m) return { present: false, values: [], valid: true };
  const body = m[1].trim();
  if (!body) return { present: true, values: [], valid: true };
  const values = [];
  const parts = body.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const pm = part.match(/^"([^"]+)"$/);
    if (!pm) return { present: true, values: [], valid: false };
    values.push(pm[1]);
  }
  return { present: true, values, valid: true };
}

function sameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

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

  return { segments, isArrayTable };
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

function splitInlineTomlFields(body) {
  const fields = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === ',' && !inSingle && !inDouble) {
      fields.push(body.slice(start, i).trim());
      start = i + 1;
    }
    escaped = false;
  }
  fields.push(body.slice(start).trim());
  return fields.filter(Boolean);
}

function parseMultiAgentV2Value(value) {
  const trimmed = String(value || '').trim();
  const bool = parseTomlBoolean(trimmed);
  if (bool !== null) return { valid: true, enabled: bool };

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { valid: false, enabled: false };
  }

  let found = false;
  let enabled = false;
  for (const field of splitInlineTomlFields(trimmed.slice(1, -1))) {
    const m = field.match(/^enabled\s*=\s*(.+)$/);
    if (!m) continue;
    if (found) return { valid: false, enabled: false };
    const fieldBool = parseTomlBoolean(m[1]);
    if (fieldBool === null) return { valid: false, enabled: false };
    found = true;
    enabled = fieldBool;
  }

  return found ? { valid: true, enabled } : { valid: false, enabled: false };
}

function detectCodexDispatchMode(configContent) {
  const lines = String(configContent || '').split(/\r?\n/);
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

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent_v2\s*=\s*(.+)$/);
      if (m) record(parseMultiAgentV2Value(m[1]));
    } else if (tomlTableNameMatches(table, 'features.multi_agent_v2')) {
      const m = line.match(/^enabled\s*=\s*(.+)$/);
      if (m) record({ valid: parseTomlBoolean(m[1]) !== null, enabled: parseTomlBoolean(m[1]) === true });
    }
  }

  enabled = seen && !ambiguous && enabled;
  return {
    dispatch_mode: enabled ? 'v2-task-name' : 'v1-thread-id',
    multi_agent_v2_enabled: enabled,
  };
}

// ---------------------------------------------------------------------------
// #598: MultiAgentMode dispatch-POSTURE derivation. This is DIFFERENT from
// dispatch_mode above (which only reports whether the spawn TOOLS are exposed):
// the Codex runtime injects a developer message that model-refuses spawns
// unless the effective posture is 'proactive', regardless of tool exposure.
//
// VERSION-GUARD (verified on codex-tui 0.142.5; may change in a future Codex
// release): MultiAgentMode = none | explicitRequestOnly | proactive.
//   - [features] multi_agent / multi_agent_v2 both absent-or-false -> 'none'
//     (spawn tools are not exposed at all; nothing to gate).
//   - otherwise, effort-gated: a root-level model_reasoning_effort = "ultra"
//     -> 'proactive'; any other value or absent -> 'explicitRequestOnly'.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws, and the
// caller must never let this change an install/preflight exit code — it only
// informs a REPORT/WARN. Duplicated byte-identically alongside the #332 schema
// helpers above (installer <-> preflight, x7 files total); keep in lock-step.
// ---------------------------------------------------------------------------
const DISPATCH_POSTURE_VERSION_NOTE = 'effort-gated multi-agent dispatch posture is Codex CLI runtime behavior verified on codex-tui 0.142.5; it may change in a future Codex release.';

// `[features] multi_agent = <bool>` — the base (v1) tool-exposure flag, distinct from
// multi_agent_v2 (already parsed by detectCodexDispatchMode above). Same strict
// first-match/ambiguous-fails-closed strategy: a repeated key or malformed boolean
// short-circuits to false rather than guessing.
function parseFeaturesMultiAgentEnabled(configContent) {
  const lines = String(configContent || '').split(/\r?\n/);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent\s*=\s*(.+)$/);
      if (m) {
        const b = parseTomlBoolean(m[1]);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
        }
      }
    }
  }

  return seen && !ambiguous && enabled;
}

// Root-level `model_reasoning_effort` (NOT the per-profile agents/*.toml field of the
// same name) — the effort setting that gates MultiAgentMode. TOML root keys must
// precede the first [table] header, so scanning the text up to the first top-level
// table line is the correct (and only valid) place a user- or installer-owned root
// key can live — the same `top` convention used by validateProfileText.
function parseTopLevelModelReasoningEffort(configContent) {
  const text = String(configContent || '');
  const firstTableIdx = text.search(/^\[/m);
  const top = firstTableIdx === -1 ? text : text.slice(0, firstTableIdx);
  const m = top.match(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/m);
  return m ? m[1] : null;
}

// Exact remediation text for a non-proactive posture; null when nothing to remediate. Leads with
// the always-available, always-documented in-session ask; the ultra reasoning-effort route is
// offered second and qualified as undocumented/plan-gated (many Codex plans currently top out
// at xhigh, so the config.toml / per-session route is not always actionable).
function dispatchPostureRemediation(posture) {
  if (posture === 'proactive') return null;
  if (posture === 'none') {
    return 'Codex sub-agent spawn tools are not exposed ([features] multi_agent / multi_agent_v2 absent-or-false). '
      + 'Enable them, then explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex '
      + 'exposes an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the '
      + '/model picker), set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c '
      + 'model_reasoning_effort=ultra) for proactive delegation.';
  }
  return 'Codex will refuse sub-agent spawns unless explicitly requested this session (multi_agent_mode: explicitRequestOnly). '
    + 'To dispatch now, explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes '
    + 'an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker), '
    + 'set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) '
    + 'for proactive delegation.';
}

function deriveDispatchPosture(configContent) {
  const dispatchMode = detectCodexDispatchMode(configContent);
  const multiAgentEnabled = parseFeaturesMultiAgentEnabled(configContent);
  const featuresEnabled = multiAgentEnabled || dispatchMode.multi_agent_v2_enabled;
  const effort = parseTopLevelModelReasoningEffort(configContent);
  const posture = !featuresEnabled ? 'none' : (effort === 'ultra' ? 'proactive' : 'explicitRequestOnly');
  return {
    dispatch_posture: posture,
    model_reasoning_effort: effort,
    multi_agent_enabled: multiAgentEnabled,
    dispatch_posture_warning: dispatchPostureRemediation(posture),
  };
}

// ---------------------------------------------------------------------------
// MultiAgentV2 concurrency + wait-timeout bounds — extends the dispatch-posture report
// above with the effective v2 slot budget and wait-timeout knobs, version-guarded the
// same way. `max_concurrent_threads_per_session` INCLUDES the root/orchestrator thread,
// so effective subagent width = threads - 1. A controlled probe on codex-tui 0.142.5
// observed a default budget of 4 (width 3) when the key is absent; that default is NOT
// published in official Codex docs, so it is surfaced as an OBSERVED fallback (source:
// 'observed_default'), never asserted as guaranteed Codex behavior. The three
// *_wait_timeout_ms bounds have no independently verified default — read ONLY when
// explicitly present in config; null when absent (no fabricated fallback for those three).
//
// Bounds are only meaningful when v2 dispatch is actually active (dispatch_mode ===
// 'v2-task-name'); when v2 is not enabled, every field reports not_applicable/null —
// mirrors how dispatch_posture itself collapses to 'none' when features are off.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws. Duplicated
// byte-identically alongside the dispatch-posture helpers above (installer <-> preflight,
// x7 files total); keep the two copies in lock-step.
// ---------------------------------------------------------------------------
const OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION = 4;

const MULTI_AGENT_V2_BOUNDS_NOTE = 'Recommended [features.multi_agent_v2] config for Kaola-Workflow dispatch: set '
  + 'max_concurrent_threads_per_session high enough for the intended fan-out width plus 1 (the budget INCLUDES '
  + 'the orchestrator thread) and max_wait_timeout_ms near the longest expected node runtime so long-poll joins '
  + 'are not capped short. Example:\n[features.multi_agent_v2]\nmax_concurrent_threads_per_session = 5\n'
  + 'max_wait_timeout_ms = 1800000\nNote: [agents].max_threads (the v1 concurrency knob) cannot be set once '
  + 'features.multi_agent_v2 is enabled — codex-tui 0.142.5 rejects it. Effective subagent width, the observed '
  + 'default budget of 4 (width 3) when max_concurrent_threads_per_session is absent, and the wait-timeout bounds '
  + 'are Codex CLI runtime behavior verified on codex-tui 0.142.5; they may change in a future Codex release.';

const MULTI_AGENT_V2_NUMERIC_FIELDS = [
  'max_concurrent_threads_per_session',
  'min_wait_timeout_ms',
  'max_wait_timeout_ms',
  'default_wait_timeout_ms',
];

// Parses the four MultiAgentV2ConfigToml numeric fields from either syntax: the
// inline-object form (`multi_agent_v2 = { max_concurrent_threads_per_session = N, ... }`)
// or the dotted-table form (`[features.multi_agent_v2]` with the fields as separate
// lines) — the same two representations detectCodexDispatchMode already parses for
// `enabled`. Same first-match/fail-to-absent discipline as the rest of this file: a
// non-integer or repeated value is treated as not-configured rather than guessed at.
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

  function recordFromInlineObject(body) {
    for (const field of splitInlineTomlFields(body)) {
      const m = field.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (m) recordField(m[1], m[2]);
    }
  }

  const lines = String(configContent || '').split(/\r?\n/);
  let table = null;
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent_v2\s*=\s*(.+)$/);
      if (m) {
        const v = m[1].trim();
        if (v.startsWith('{') && v.endsWith('}')) recordFromInlineObject(v.slice(1, -1));
      }
    } else if (tomlTableNameMatches(table, 'features.multi_agent_v2')) {
      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (m) recordField(m[1], m[2]);
    }
  }

  return fields;
}

function deriveMultiAgentV2Bounds(configContent, v2Enabled) {
  if (!v2Enabled) {
    return {
      max_concurrent_threads_per_session: null,
      max_concurrent_threads_per_session_source: 'not_applicable',
      effective_subagent_width: null,
      min_wait_timeout_ms: null,
      max_wait_timeout_ms: null,
      default_wait_timeout_ms: null,
    };
  }

  const raw = parseMultiAgentV2NumericFields(configContent);
  const configuredThreads = raw.max_concurrent_threads_per_session;
  const usingDefault = !(Number.isInteger(configuredThreads) && configuredThreads >= 1);
  const threads = usingDefault ? OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION : configuredThreads;

  return {
    max_concurrent_threads_per_session: threads,
    max_concurrent_threads_per_session_source: usingDefault ? 'observed_default' : 'config',
    effective_subagent_width: Math.max(threads - 1, 0),
    min_wait_timeout_ms: raw.min_wait_timeout_ms,
    max_wait_timeout_ms: raw.max_wait_timeout_ms,
    default_wait_timeout_ms: raw.default_wait_timeout_ms,
  };
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = null;
  let planPath = null;
  let noAutofix = false;
  let json = false;
  let doctor = false;
  let home = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[++i];
    } else if (args[i] === '--plan' && args[i + 1]) {
      planPath = args[++i];
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

  return { projectRoot, planPath, noAutofix, json, doctor, home };
}

// ---------------------------------------------------------------------------
// #332 schema check — inline regex, no TOML lib. MIRROR of the installer's
// validateProfileText. Returns [] when valid, or a list of human-readable reasons.
// ---------------------------------------------------------------------------
function validateProfileText(text, role, expectedMeta = null) {
  const reasons = [];
  const firstTableIdx = text.search(/^\[/m);
  const top = firstTableIdx === -1 ? text : text.slice(0, firstTableIdx);

  const nameMatch = top.match(/^name\s*=\s*"([^"]*)"\s*$/m);
  if (!nameMatch) {
    reasons.push("missing or empty top-level 'name' (codex >=0.138 ignores the profile)");
  } else if (nameMatch[1] === '') {
    reasons.push("top-level 'name' is empty");
  } else if (nameMatch[1] !== role) {
    reasons.push(`top-level 'name' is "${nameMatch[1]}" but must equal the role "${role}"`);
  }

  const desc = parseTopLevelString(top, 'description');
  if (desc === null) {
    reasons.push("missing top-level 'description'");
  } else if (desc.trim() === '') {
    reasons.push("top-level 'description' is empty");
  } else if (expectedMeta && expectedMeta.description && desc !== expectedMeta.description) {
    reasons.push("top-level 'description' does not match config/agents.toml");
  }

  const nick = parseStringArrayLine(top, 'nickname_candidates');
  if (nick.present && !nick.valid) {
    reasons.push("top-level 'nickname_candidates' must be a TOML string array");
  } else if (nick.present && nick.values.length === 0) {
    reasons.push("top-level 'nickname_candidates' must not be empty when present");
  }
  if (expectedMeta && expectedMeta.nicknameCandidates && expectedMeta.nicknameCandidates.length > 0) {
    if (!nick.present) {
      reasons.push("missing top-level 'nickname_candidates'");
    } else if (!sameStringArray(nick.values, expectedMeta.nicknameCandidates)) {
      reasons.push("top-level 'nickname_candidates' does not match config/agents.toml");
    }
  }

  const modelMatch = top.match(/^model\s*=\s*"([^"]*)"\s*$/m);
  const effortMatch = top.match(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/m);
  if (effortMatch && !EFFORT_VALUES.includes(effortMatch[1])) {
    reasons.push(`model_reasoning_effort "${effortMatch[1]}" is not one of ${EFFORT_VALUES.join('/')}`);
  }
  const pinnedStandard = CODEX_PINNED_STANDARD_ROLES.includes(role);
  const pinnedReasoning = CODEX_PINNED_REASONING_ROLES.includes(role);
  if (!pinnedStandard && !pinnedReasoning) {
    reasons.push(`role "${role}" has no Codex profile-tier policy`);
  } else if (pinnedStandard) {
    if (!modelMatch) reasons.push(`missing top-level 'model' pin (expected ${CODEX_STANDARD_MODEL})`);
    else if (modelMatch[1] !== CODEX_STANDARD_MODEL) {
      reasons.push(`top-level 'model' is "${modelMatch[1]}" but pinned standard roles require "${CODEX_STANDARD_MODEL}"`);
    }
    if (!effortMatch) reasons.push(`missing top-level 'model_reasoning_effort' pin (expected ${CODEX_STANDARD_EFFORT})`);
    else if (effortMatch[1] !== CODEX_STANDARD_EFFORT) {
      reasons.push(`model_reasoning_effort is "${effortMatch[1]}" but pinned standard roles require "${CODEX_STANDARD_EFFORT}"`);
    }
  } else {
    if (!modelMatch) reasons.push(`missing top-level 'model' pin (expected ${CODEX_REASONING_MODEL})`);
    else if (modelMatch[1] !== CODEX_REASONING_MODEL) {
      reasons.push(`top-level 'model' is "${modelMatch[1]}" but pinned reasoning roles require "${CODEX_REASONING_MODEL}"`);
    }
    if (!effortMatch) reasons.push(`missing top-level 'model_reasoning_effort' pin (expected ${CODEX_REASONING_EFFORT})`);
    else if (effortMatch[1] !== CODEX_REASONING_EFFORT) {
      reasons.push(`model_reasoning_effort is "${effortMatch[1]}" but pinned reasoning roles require "${CODEX_REASONING_EFFORT}"`);
    }
  }

  const instrMatch = text.match(/^developer_instructions\s*=\s*"""([\s\S]*?)"""/m);
  if (!instrMatch) {
    reasons.push("missing top-level 'developer_instructions' triple-quoted block");
  } else if (instrMatch[1].trim() === '') {
    reasons.push("'developer_instructions' body is blank");
  } else {
    if (!instrMatch[1].includes('FULL')) {
      reasons.push("developer_instructions missing FULL durable-result contract");
    }
    if (!instrMatch[1].includes('compact orchestrator summary')) {
      reasons.push("developer_instructions missing compact orchestrator summary contract");
    }
    if (CODEX_ORCHESTRATION_ROLES.includes(role)) {
      if (!instrMatch[1].includes('durable full result')) {
        reasons.push("orchestration-role developer_instructions missing canonical durable full result contract");
      }
    } else {
      if (!instrMatch[1].includes('dispatch.evidence_file')) {
        reasons.push("node-role developer_instructions missing durable dispatch.evidence_file contract");
      }
      if (!instrMatch[1].includes('evidence-binding')) {
        reasons.push("node-role developer_instructions missing evidence-binding preservation contract");
      }
    }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Template role parsing — reads config/agents.toml via inline regex (no TOML lib).
// Each tree has its own copy of this file at <scriptDir>/../config/agents.toml.
// Returns { roles: string[], error: string|null }
// ---------------------------------------------------------------------------
function readTemplateRoles(scriptDir) {
  const templatePath = path.join(scriptDir, '..', 'config', 'agents.toml');
  let content;
  try {
    content = fs.readFileSync(templatePath, 'utf8');
  } catch (e) {
    return { roles: [], entries: [], error: `template_missing: cannot read ${templatePath}: ${e.message}` };
  }
  const roles = [];
  const entries = [];
  const lines = content.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\[agents\.([a-z0-9-]+)\]\s*$/);
    if (head) {
      current = { role: head[1], description: null, nicknameCandidates: [] };
      roles.push(current.role);
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const desc = line.match(/^description\s*=\s*"([^"]*)"\s*$/);
    if (desc) {
      current.description = desc[1];
      continue;
    }
    const nick = line.match(/^nickname_candidates\s*=\s*\[([^\]]*)\]\s*$/);
    if (nick) {
      const parsed = parseStringArrayLine(line, 'nickname_candidates');
      current.nicknameCandidates = parsed.valid ? parsed.values : [];
    }
  }
  if (roles.length === 0) {
    return { roles: [], entries: [], error: `template_missing: no [agents.*] entries found in ${templatePath}` };
  }
  return { roles, entries, error: null };
}

// ---------------------------------------------------------------------------
// Plan role parsing — reads ## Nodes table from the frozen plan (inline regex only).
// Column layout: | id | role | depends_on | ...
// Returns string[] of unique roles (empty if --plan not supplied or table absent).
// ---------------------------------------------------------------------------
function readPlanRoles(planPath) {
  if (!planPath) return [];
  let content;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch {
    return [];
  }

  const roles = [];
  // Find the ## Nodes heading
  const nodesHeadRe = /^##\s+Nodes\s*$/m;
  const headMatch = content.match(nodesHeadRe);
  if (!headMatch) return [];

  const afterHead = content.slice(headMatch.index + headMatch[0].length);
  // Next ## heading terminates the section
  const nextH2 = afterHead.search(/^##\s/m);
  const section = nextH2 < 0 ? afterHead : afterHead.slice(0, nextH2);

  // Table rows: | id | role | ...
  // Skip the header row (contains "id") and the separator row (contains ---)
  const rowRe = /^\|([^|]+)\|([^|]+)\|/gm;
  let row;
  while ((row = rowRe.exec(section)) !== null) {
    const idCell = row[1].trim();
    const roleCell = row[2].trim();
    // Skip header and separator rows
    if (idCell === 'id' || /^[-: ]+$/.test(idCell)) continue;
    if (roleCell && !/^[-: ]+$/.test(roleCell)) {
      const role = roleCell.trim();
      if (role && !roles.includes(role)) {
        roles.push(role);
      }
    }
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Profile check: assert .codex/agents/kaola-workflow/<role>.toml exists for all roles.
// Returns { missingRoles: string[] }
// ---------------------------------------------------------------------------
function checkProfiles(agentsDir, requiredRoles) {
  const missingRoles = [];
  for (const role of requiredRoles) {
    const profilePath = path.join(agentsDir, `${role}.toml`);
    if (!fs.existsSync(profilePath)) {
      missingRoles.push(role);
    }
  }
  return { missingRoles };
}

// ---------------------------------------------------------------------------
// Managed block check: locate the # BEGIN / # END block in config.toml, parse
// [agents.{role}] entries inside it, and detect conflicting [agents.*] entries
// outside the markers.
//
// Returns:
//   {
//     blockFound: boolean,
//     rolesInBlock: string[],
//     conflictingRolesOutside: string[]  // [agents.*] entries outside the markers
//   }
// ---------------------------------------------------------------------------
function checkManagedBlock(configContent) {
  const beginIdx = configContent.indexOf(BEGIN_MARKER);
  const endIdx = configContent.indexOf(END_MARKER);

  let blockFound = false;
  let blockBody = '';
  let outsideContent = configContent;

  if (beginIdx !== -1 && endIdx !== -1 && beginIdx < endIdx) {
    blockFound = true;
    blockBody = configContent.slice(beginIdx + BEGIN_MARKER.length, endIdx);
    outsideContent = configContent.slice(0, beginIdx) + configContent.slice(endIdx + END_MARKER.length);
  }

  // Parse [agents.{role}] entries inside the block
  const rolesInBlock = [];
  const blockRe = /^\[agents\.([a-z0-9-]+)\]/gm;
  let m;
  while ((m = blockRe.exec(blockBody)) !== null) {
    rolesInBlock.push(m[1]);
  }

  // Detect [agents.*] entries outside the markers (conflict)
  const conflictingRolesOutside = [];
  const outsideRe = /^\[agents\.([a-z0-9-]+)\]/gm;
  let o;
  while ((o = outsideRe.exec(outsideContent)) !== null) {
    conflictingRolesOutside.push(o[1]);
  }

  return { blockFound, rolesInBlock, conflictingRolesOutside };
}

// ---------------------------------------------------------------------------
// #332 manifest read — returns the parsed local manifest or null on absent/corrupt.
// ---------------------------------------------------------------------------
function readManifest(agentsDir) {
  const p = path.join(agentsDir, MANIFEST_BASENAME);
  if (!fs.existsSync(p)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// #332 scope inspector — the single source of truth for both the normal gate and
// doctor mode. Inspects a target .codex dir against the current template roles.
// Pure read-only.
// ---------------------------------------------------------------------------
function inspectScope({ codexDir, templateRoles, templateEntries }) {
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');
  const configPath = path.join(codexDir, 'config.toml');
  const roleSet = new Set(templateRoles);
  const metaByRole = new Map((templateEntries || []).map(e => [e.role, e]));

  const exists = fs.existsSync(codexDir);

  let configContent = '';
  if (fs.existsSync(configPath)) {
    try { configContent = fs.readFileSync(configPath, 'utf8'); } catch { configContent = ''; }
  }
  const dispatchMode = detectCodexDispatchMode(configContent);
  const posture = deriveDispatchPosture(configContent);
  const v2Bounds = deriveMultiAgentV2Bounds(configContent, dispatchMode.multi_agent_v2_enabled);
  const { blockFound, rolesInBlock, conflictingRolesOutside } = checkManagedBlock(configContent);

  const missingFromBlock = templateRoles.filter(r => !rolesInBlock.includes(r));
  const staleRolesInBlock = rolesInBlock.filter(r => !roleSet.has(r));

  const { missingRoles: missingProfiles } = checkProfiles(agentsDir, templateRoles);

  // Inspect the agents dir contents: malformed required profiles + stale/extra files.
  const malformed = [];
  const staleFiles = [];
  const extraUnmanaged = [];
  const manifest = readManifest(agentsDir);
  const manifestFiles = (manifest && manifest.files && typeof manifest.files === 'object')
    ? new Set(Object.keys(manifest.files))
    : new Set();

  let manifestStatus = 'absent';
  if (manifest) {
    manifestStatus = (typeof manifest.schema_version === 'number' && manifest.schema_version > MANIFEST_SCHEMA_VERSION)
      ? 'unsupported'
      : 'present';
  }

  if (fs.existsSync(agentsDir)) {
    let names = [];
    try { names = fs.readdirSync(agentsDir); } catch { names = []; }
    for (const name of names) {
      if (!name.endsWith('.toml')) continue;
      const role = name.replace(/\.toml$/, '');
      if (roleSet.has(role)) {
        // Required role: schema-check it.
        let txt = '';
        try { txt = fs.readFileSync(path.join(agentsDir, name), 'utf8'); } catch { txt = ''; }
        const reasons = validateProfileText(txt, role, metaByRole.get(role));
        if (reasons.length > 0) malformed.push({ role, file: name, reasons });
      } else if (manifestFiles.has(name) || RETIRED_PROFILE_FILES.includes(name)) {
        staleFiles.push(name);
      } else {
        extraUnmanaged.push(name);
      }
    }
  }

  malformed.sort((a, b) => a.role.localeCompare(b.role));
  staleFiles.sort();
  extraUnmanaged.sort();

  return {
    exists,
    blockFound,
    rolesInBlock,
    missingFromBlock,
    staleRolesInBlock,
    conflictingRolesOutside,
    missingProfiles,
    malformed,
    staleFiles,
    extraUnmanaged,
    manifest: manifestStatus,
    dispatch_mode: dispatchMode.dispatch_mode,
    multi_agent_v2_enabled: dispatchMode.multi_agent_v2_enabled,
    dispatch_posture: posture.dispatch_posture,
    model_reasoning_effort: posture.model_reasoning_effort,
    multi_agent_enabled: posture.multi_agent_enabled,
    dispatch_posture_warning: posture.dispatch_posture_warning,
    max_concurrent_threads_per_session: v2Bounds.max_concurrent_threads_per_session,
    max_concurrent_threads_per_session_source: v2Bounds.max_concurrent_threads_per_session_source,
    effective_subagent_width: v2Bounds.effective_subagent_width,
    min_wait_timeout_ms: v2Bounds.min_wait_timeout_ms,
    max_wait_timeout_ms: v2Bounds.max_wait_timeout_ms,
    default_wait_timeout_ms: v2Bounds.default_wait_timeout_ms,
  };
}

// ---------------------------------------------------------------------------
// Find the installer script sibling to this script.
// Returns the absolute path if it exists, or null.
// ---------------------------------------------------------------------------
function findInstaller(scriptDir) {
  const installerPath = path.join(scriptDir, 'install-codex-agent-profiles.js');
  return fs.existsSync(installerPath) ? installerPath : null;
}

// ---------------------------------------------------------------------------
// Run the installer (positional arg: projectRoot — NOT --project-root flag).
// Returns { success: boolean, stderr: string }
// ---------------------------------------------------------------------------
function runInstaller(installerPath, projectRoot) {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      [installerPath, projectRoot],
      { encoding: 'utf8', timeout: 30000 }
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

// ---------------------------------------------------------------------------
// Core preflight check
// ---------------------------------------------------------------------------
function runPreflight(opts) {
  const {
    projectRoot,
    planPath,
    noAutofix,
    scriptDir,
    home,
  } = opts;
  const homeDir = home || os.homedir();

  const codexDir = path.join(projectRoot, '.codex');
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');

  // --- Read template roles (may fail gracefully) ---
  const { roles: templateRoles, entries: templateEntries, error: templateError } = readTemplateRoles(scriptDir);
  if (templateError) {
    return {
      exitCode: 2,
      result: {
        status: 'template_missing',
        error: templateError,
        stale: true,
        safe_autofix: false,
        repair: 'Install or update kaola-workflow to get the bundled config/agents.toml',
      },
    };
  }

  // --- Read plan roles ---
  const planRoles = readPlanRoles(planPath);

  // --- Check plan roles against template ---
  const rolesNotInTemplate = planRoles.filter(r => !templateRoles.includes(r));
  if (rolesNotInTemplate.length > 0) {
    return {
      exitCode: 3,
      result: {
        status: 'role_not_in_template',
        missing_roles: rolesNotInTemplate,
        stale: true,
        repair: 'Update kaola-workflow to a version that includes the required roles, then re-install agent profiles.',
        safe_autofix: false,
      },
    };
  }

  // --- Build REQUIRED role set: union of template + plan roles ---
  const requiredRoles = [...templateRoles];
  for (const r of planRoles) {
    if (!requiredRoles.includes(r)) requiredRoles.push(r);
  }

  // --- #571: global scope satisfies the gate (install once, all repos — Claude parity).
  // Plan roles ⊆ template roles (role_not_in_template above guarantees it), so a global
  // scope fresh for every template role is fresh for every plan role too. Check global
  // FIRST: a fresh global scope PASSES without inspecting/installing a redundant
  // project-local copy. A non-fresh global scope falls through to the existing
  // project-scope inspection + autofix path UNCHANGED (back-compat + fail-closed preserved).
  const globalCodexDir = path.join(homeDir, '.codex');
  const globalScope = inspectScope({ codexDir: globalCodexDir, templateRoles, templateEntries });
  if (scopeIsFresh(globalScope)) {
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        scope: 'global',
        roles_checked: requiredRoles,
        extra_unmanaged: globalScope.extraUnmanaged,
        autofixed: false,
        dispatch_mode: globalScope.dispatch_mode,
        multi_agent_v2_enabled: globalScope.multi_agent_v2_enabled,
        dispatch_posture: globalScope.dispatch_posture,
        model_reasoning_effort: globalScope.model_reasoning_effort,
        multi_agent_enabled: globalScope.multi_agent_enabled,
        dispatch_posture_warning: globalScope.dispatch_posture_warning,
        max_concurrent_threads_per_session: globalScope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: globalScope.max_concurrent_threads_per_session_source,
        effective_subagent_width: globalScope.effective_subagent_width,
        min_wait_timeout_ms: globalScope.min_wait_timeout_ms,
        max_wait_timeout_ms: globalScope.max_wait_timeout_ms,
        default_wait_timeout_ms: globalScope.default_wait_timeout_ms,
      },
    };
  }

  // --- Inspect the project scope (template roles only; plan roles handled below) ---
  const scope = inspectScope({ codexDir, templateRoles, templateEntries });

  // --- Conflicting [agents.*] outside managed block is UNSAFE to autofix ---
  if (scope.conflictingRolesOutside.length > 0) {
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        stale: true,
        conflicting_roles_outside_markers: scope.conflictingRolesOutside,
        extra_unmanaged: scope.extraUnmanaged,
        repair: `Remove or migrate the hand-authored [agents.*] entries outside the managed block markers in ${path.join(codexDir, 'config.toml')}, then re-run install-codex-agent-profiles.js.`,
        safe_autofix: false,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      },
    };
  }

  // --- Unsupported (future) manifest schema is NOT autofixable ---
  if (scope.manifest === 'unsupported') {
    return {
      exitCode: 6,
      result: {
        status: 'profile_schema_version_unsupported',
        stale: true,
        extra_unmanaged: scope.extraUnmanaged,
        repair: `The local profile manifest (${path.join(agentsDir, MANIFEST_BASENAME)}) declares an unsupported schema_version — upgrade kaola-workflow, then re-run install-codex-agent-profiles.js --project-root ${projectRoot}`,
        safe_autofix: false,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      },
    };
  }

  // --- Plan roles: union members not in the template profile dir (missing-only) ---
  const { missingRoles: missingPlanProfiles } = checkProfiles(agentsDir, planRoles);
  const missingProfiles = [...new Set([...scope.missingProfiles, ...missingPlanProfiles])];
  const missingFromBlock = requiredRoles.filter(r => !scope.rolesInBlock.includes(r));

  const repairCmd = `run install-codex-agent-profiles.js --project-root ${projectRoot}`;

  // --- Priority-ordered staleness classification ---
  // profiles_malformed / profiles_stale / profiles_missing / config_stale outrank
  // managed_block_stale so the existing #266 fixtures keep their statuses.
  const blockMissing = !scope.blockFound;
  const malformedFirst = scope.malformed.length > 0;
  const staleFilesPresent = scope.staleFiles.length > 0;
  const profilesMissing = missingProfiles.length > 0;
  const configStale = blockMissing || missingFromBlock.length > 0;
  const onlyBlockRolesStale = scope.staleRolesInBlock.length > 0;

  const isStale = malformedFirst || staleFilesPresent || profilesMissing || configStale || onlyBlockRolesStale;

  if (!isStale) {
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        roles_checked: requiredRoles,
        extra_unmanaged: scope.extraUnmanaged,
        autofixed: false,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      },
    };
  }

  function staleResult() {
    if (malformedFirst) {
      return {
        status: 'profiles_malformed',
        malformed: scope.malformed,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      };
    }
    if (staleFilesPresent) {
      return {
        status: 'profiles_stale',
        stale_files: scope.staleFiles,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      };
    }
    if (profilesMissing) {
      return {
        status: 'profiles_missing',
        missing_roles: [...new Set([...missingProfiles, ...missingFromBlock])],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      };
    }
    if (configStale) {
      return {
        status: 'config_stale',
        missing_roles: [...new Set([...missingProfiles, ...missingFromBlock])],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      };
    }
    // onlyBlockRolesStale: full current set present, retired [agents.*] inside markers.
    return {
      status: 'managed_block_stale',
      stale_roles_in_block: scope.staleRolesInBlock,
      extra_unmanaged: scope.extraUnmanaged,
      stale: true,
      repair: repairCmd,
      safe_autofix: true,
      dispatch_mode: scope.dispatch_mode,
      multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
      dispatch_posture: scope.dispatch_posture,
      model_reasoning_effort: scope.model_reasoning_effort,
      multi_agent_enabled: scope.multi_agent_enabled,
      dispatch_posture_warning: scope.dispatch_posture_warning,
      max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
      max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
      effective_subagent_width: scope.effective_subagent_width,
      min_wait_timeout_ms: scope.min_wait_timeout_ms,
      max_wait_timeout_ms: scope.max_wait_timeout_ms,
      default_wait_timeout_ms: scope.default_wait_timeout_ms,
    };
  }

  // --- Stale: attempt autofix if allowed ---
  if (noAutofix) {
    return { exitCode: 1, result: staleResult() };
  }

  // --- Try autofix ---
  const installerPath = findInstaller(scriptDir);
  if (!installerPath) {
    const r = staleResult();
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: r.missing_roles || [],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: 'install-codex-agent-profiles.js not found alongside this script.',
        safe_autofix: false,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      },
    };
  }

  const { success, stderr } = runInstaller(installerPath, projectRoot);
  if (!success) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: `Installer error: ${stderr}`,
        safe_autofix: false,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        dispatch_posture: scope.dispatch_posture,
        model_reasoning_effort: scope.model_reasoning_effort,
        multi_agent_enabled: scope.multi_agent_enabled,
        dispatch_posture_warning: scope.dispatch_posture_warning,
        max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
        effective_subagent_width: scope.effective_subagent_width,
        min_wait_timeout_ms: scope.min_wait_timeout_ms,
        max_wait_timeout_ms: scope.max_wait_timeout_ms,
        default_wait_timeout_ms: scope.default_wait_timeout_ms,
      },
    };
  }

  // --- Re-verify after autofix: re-run ALL checks (#332). ---
  const after = inspectScope({ codexDir, templateRoles, templateEntries });
  const { missingRoles: afterMissingPlan } = checkProfiles(agentsDir, planRoles);
  const afterMissingProfiles = [...new Set([...after.missingProfiles, ...afterMissingPlan])];
  const afterMissingFromBlock = requiredRoles.filter(r => !after.rolesInBlock.includes(r));

  const stillStale =
    after.malformed.length > 0 ||
    after.staleFiles.length > 0 ||
    afterMissingProfiles.length > 0 ||
    !after.blockFound ||
    afterMissingFromBlock.length > 0 ||
    after.staleRolesInBlock.length > 0;

  if (stillStale) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: [...new Set([...afterMissingProfiles, ...afterMissingFromBlock])],
        extra_unmanaged: after.extraUnmanaged,
        stale: true,
        repair: 'Installer ran but profiles/block are still stale after re-verify.',
        safe_autofix: false,
        dispatch_mode: after.dispatch_mode,
        multi_agent_v2_enabled: after.multi_agent_v2_enabled,
        dispatch_posture: after.dispatch_posture,
        model_reasoning_effort: after.model_reasoning_effort,
        multi_agent_enabled: after.multi_agent_enabled,
        dispatch_posture_warning: after.dispatch_posture_warning,
        max_concurrent_threads_per_session: after.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: after.max_concurrent_threads_per_session_source,
        effective_subagent_width: after.effective_subagent_width,
        min_wait_timeout_ms: after.min_wait_timeout_ms,
        max_wait_timeout_ms: after.max_wait_timeout_ms,
        default_wait_timeout_ms: after.default_wait_timeout_ms,
      },
    };
  }

  return {
    exitCode: 0,
    result: {
      status: 'ok',
      roles_checked: requiredRoles,
      extra_unmanaged: after.extraUnmanaged,
      autofixed: true,
      dispatch_mode: after.dispatch_mode,
      multi_agent_v2_enabled: after.multi_agent_v2_enabled,
      dispatch_posture: after.dispatch_posture,
      model_reasoning_effort: after.model_reasoning_effort,
      multi_agent_enabled: after.multi_agent_enabled,
      dispatch_posture_warning: after.dispatch_posture_warning,
      max_concurrent_threads_per_session: after.max_concurrent_threads_per_session,
      max_concurrent_threads_per_session_source: after.max_concurrent_threads_per_session_source,
      effective_subagent_width: after.effective_subagent_width,
      min_wait_timeout_ms: after.min_wait_timeout_ms,
      max_wait_timeout_ms: after.max_wait_timeout_ms,
      default_wait_timeout_ms: after.default_wait_timeout_ms,
    },
  };
}

// ---------------------------------------------------------------------------
// #332 doctor mode — READ-ONLY multi-scope reporting. Never runs the installer.
// Scopes: user (<home>/.codex), project (<projectRoot>/.codex), plugin_cache
// (cached source profiles, schema-only, evidence-only — excluded from exit code).
// ---------------------------------------------------------------------------
function scopeIsStale(s) {
  return s.exists && (
    s.malformed.length > 0 ||
    s.staleFiles.length > 0 ||
    s.missingProfiles.length > 0 ||
    !s.blockFound ||
    s.missingFromBlock.length > 0 ||
    s.staleRolesInBlock.length > 0 ||
    s.conflictingRolesOutside.length > 0 ||
    s.manifest === 'unsupported'
  );
}

// #571: a scope is "fresh" iff it exists AND inspectScope finds nothing stale.
// The `s.exists` guard is LOAD-BEARING: an absent scope reads "not stale" inside
// scopeIsStale (the `s.exists &&` short-circuits), so without this guard an absent
// ~/.codex would wrongly count as "fresh" and PASS the gate.
function scopeIsFresh(s) {
  return s.exists && !scopeIsStale(s);
}

function scopeReport(scope, name, codexDir, repair, readOnly) {
  return {
    scope: name,
    codex_dir: codexDir,
    exists: scope.exists,
    managed_block: scope.blockFound ? 'present' : 'absent',
    profiles: scope.rolesInBlock,
    missing_roles: scope.missingProfiles,
    missing_from_block: scope.missingFromBlock,
    malformed: scope.malformed,
    stale_files: scope.staleFiles,
    stale_roles_in_block: scope.staleRolesInBlock,
    conflicting_roles_outside: scope.conflictingRolesOutside,
    extra_unmanaged: scope.extraUnmanaged,
    manifest: scope.manifest,
    dispatch_mode: scope.dispatch_mode,
    multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
    dispatch_posture: scope.dispatch_posture,
    model_reasoning_effort: scope.model_reasoning_effort,
    multi_agent_enabled: scope.multi_agent_enabled,
    dispatch_posture_warning: scope.dispatch_posture_warning,
    max_concurrent_threads_per_session: scope.max_concurrent_threads_per_session,
    max_concurrent_threads_per_session_source: scope.max_concurrent_threads_per_session_source,
    effective_subagent_width: scope.effective_subagent_width,
    min_wait_timeout_ms: scope.min_wait_timeout_ms,
    max_wait_timeout_ms: scope.max_wait_timeout_ms,
    default_wait_timeout_ms: scope.default_wait_timeout_ms,
    read_only: !!readOnly,
    repair,
  };
}

// Find cached plugin source-agent dirs under <home>/.codex/plugins/cache.
// Returns [{ dir, plugin, marketplace, version }].
function findPluginCacheAgentDirs(home) {
  const cacheRoot = path.join(home, '.codex', 'plugins', 'cache');
  const out = [];
  if (!fs.existsSync(cacheRoot)) return out;
  let marketplaces = [];
  try { marketplaces = fs.readdirSync(cacheRoot); } catch { return out; }
  for (const mk of marketplaces) {
    const mkDir = path.join(cacheRoot, mk);
    let plugins = [];
    try { plugins = fs.readdirSync(mkDir); } catch { continue; }
    for (const pl of plugins) {
      const plDir = path.join(mkDir, pl);
      let versions = [];
      try { versions = fs.readdirSync(plDir); } catch { continue; }
      for (const ver of versions) {
        const agentsDir = path.join(plDir, ver, 'agents');
        if (fs.existsSync(agentsDir)) {
          out.push({ dir: agentsDir, plugin: pl, marketplace: mk, version: ver });
        }
      }
    }
  }
  return out;
}

function runDoctor(opts) {
  const { projectRoot, home, scriptDir } = opts;
  const { roles: templateRoles, entries: templateEntries, error: templateError } = readTemplateRoles(scriptDir);

  if (templateError) {
    return {
      exitCode: 2,
      result: { status: 'template_missing', error: templateError, scopes: [] },
    };
  }

  const scopes = [];

  // user scope
  const userCodex = path.join(home, '.codex');
  const userScope = inspectScope({ codexDir: userCodex, templateRoles, templateEntries });
  scopes.push(scopeReport(
    userScope, 'user', userCodex,
    `node ${path.join(scriptDir, 'install-codex-agent-profiles.js')} ${home}`,
    false,
  ));

  // project scope
  const projectCodex = path.join(projectRoot, '.codex');
  const projectScope = inspectScope({ codexDir: projectCodex, templateRoles, templateEntries });
  scopes.push(scopeReport(
    projectScope, 'project', projectCodex,
    `node ${path.join(scriptDir, 'install-codex-agent-profiles.js')} ${projectRoot}`,
    false,
  ));

  // plugin_cache scope(s) — schema-only, evidence-only, read-only.
  for (const c of findPluginCacheAgentDirs(home)) {
    const malformed = [];
    let names = [];
    try { names = fs.readdirSync(c.dir); } catch { names = []; }
    for (const name of names) {
      if (!name.endsWith('.toml')) continue;
      const role = name.replace(/\.toml$/, '');
      let txt = '';
      try { txt = fs.readFileSync(path.join(c.dir, name), 'utf8'); } catch { txt = ''; }
      const expected = (templateEntries || []).find(e => e.role === role) || null;
      const reasons = validateProfileText(txt, role, expected);
      if (reasons.length > 0) malformed.push({ role, file: name, reasons });
    }
    malformed.sort((a, b) => a.role.localeCompare(b.role));
    scopes.push({
      scope: 'plugin_cache',
      codex_dir: c.dir,
      exists: true,
      managed_block: 'n/a',
      profiles: [],
      missing_roles: [],
      missing_from_block: [],
      malformed,
      stale_files: [],
      stale_roles_in_block: [],
      conflicting_roles_outside: [],
      extra_unmanaged: [],
      manifest: 'n/a',
      dispatch_mode: 'n/a',
      multi_agent_v2_enabled: false,
      dispatch_posture: 'n/a',
      model_reasoning_effort: null,
      multi_agent_enabled: false,
      dispatch_posture_warning: null,
      max_concurrent_threads_per_session: null,
      max_concurrent_threads_per_session_source: 'n/a',
      effective_subagent_width: null,
      min_wait_timeout_ms: null,
      max_wait_timeout_ms: null,
      default_wait_timeout_ms: null,
      read_only: true,
      repair: `codex plugin remove ${c.plugin}@${c.marketplace} && codex plugin add ${c.plugin}@${c.marketplace}  # refresh plugin cache`,
    });
  }

  // Exit code: only user + project scopes set it; plugin_cache is evidence-only.
  const gating = scopeIsStale(userScope) || scopeIsStale(projectScope);
  return {
    exitCode: gating ? 1 : 0,
    result: { status: gating ? 'stale' : 'ok', scopes },
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { projectRoot: rawRoot, planPath, noAutofix, json, doctor, home: rawHome } = parseArgs(process.argv);
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
        const stale = (s.scope !== 'plugin_cache')
          ? (s.exists && (s.malformed.length || s.stale_files.length || s.missing_roles.length || s.managed_block === 'absent' || s.missing_from_block.length || s.stale_roles_in_block.length || s.conflicting_roles_outside.length || s.manifest === 'unsupported'))
          : (s.malformed.length > 0);
        const state = !s.exists ? 'absent' : (stale ? 'stale' : 'ok');
        process.stdout.write(`${s.scope}: ${state} (${s.codex_dir})\n`);
        if (stale) process.stdout.write(`  repair: ${s.repair}\n`);
        // #598: ATTESTATION-STYLE / NON-FATAL — dispatch-posture WARN never affects exitCode.
        if (s.dispatch_posture_warning) process.stdout.write(`  warn: ${s.dispatch_posture_warning}\n`);
        // MultiAgentV2 bounds: report-only, never affects exitCode. null when v2 not active.
        if (s.max_concurrent_threads_per_session !== null) {
          process.stdout.write(
            `  multi_agent_v2: effective subagent width ${s.effective_subagent_width} `
            + `(max_concurrent_threads_per_session=${s.max_concurrent_threads_per_session} `
            + `[${s.max_concurrent_threads_per_session_source}])\n`
          );
        }
      }
    }
    process.exit(exitCode);
  }

  const { exitCode, result } = runPreflight({
    projectRoot: resolvedRoot,
    planPath: planPath ? path.resolve(planPath) : null,
    noAutofix,
    scriptDir,
    home: resolvedHome,
  });

  if (json || exitCode !== 0) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Fresh (exit 0, no --json): print human-readable summary
    const autofixNote = result.autofixed ? ' (autofixed)' : '';
    process.stdout.write(
      `ok: ${result.roles_checked.length} roles verified${autofixNote}\n`
    );
    // #598: ATTESTATION-STYLE / NON-FATAL — dispatch-posture WARN never affects exitCode
    // (an otherwise-fresh preflight must never be reddened by this report).
    if (result.dispatch_posture_warning) {
      process.stdout.write(`warn: ${result.dispatch_posture_warning}\n`);
    }
    // MultiAgentV2 bounds: report-only, never affects exitCode. null when v2 not active.
    if (result.max_concurrent_threads_per_session !== null) {
      process.stdout.write(
        `note: multi_agent_v2 effective subagent width ${result.effective_subagent_width} `
        + `(max_concurrent_threads_per_session=${result.max_concurrent_threads_per_session} `
        + `[${result.max_concurrent_threads_per_session_source}])\n`
      );
    }
  }

  process.exit(exitCode);
}

module.exports = {
  runPreflight,
  runDoctor,
  readTemplateRoles,
  readPlanRoles,
  checkManagedBlock,
  checkProfiles,
  validateProfileText,
  inspectScope,
  readManifest,
  RETIRED_PROFILE_FILES,
  MANIFEST_BASENAME,
  EFFORT_VALUES,
  CODEX_PINNED_STANDARD_ROLES,
  CODEX_PINNED_REASONING_ROLES,
  CODEX_ORCHESTRATION_ROLES,
  CODEX_STANDARD_MODEL,
  CODEX_STANDARD_EFFORT,
  CODEX_REASONING_MODEL,
  CODEX_REASONING_EFFORT,
  // #598: effort-gated dispatch-posture derivation (pure; exported for unit tests).
  detectCodexDispatchMode,
  deriveDispatchPosture,
  parseFeaturesMultiAgentEnabled,
  parseTopLevelModelReasoningEffort,
  dispatchPostureRemediation,
  DISPATCH_POSTURE_VERSION_NOTE,
  // #611: MultiAgentV2 concurrency + wait-timeout bounds derivation (pure; exported for unit tests).
  parseMultiAgentV2NumericFields,
  deriveMultiAgentV2Bounds,
  OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION,
  MULTI_AGENT_V2_BOUNDS_NOTE,
};
