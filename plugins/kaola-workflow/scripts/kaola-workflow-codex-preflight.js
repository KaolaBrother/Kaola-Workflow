#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-codex-preflight.js (issue #266 AC-B; extended by #332)
//
// Hard-gates Codex agent-profile freshness BEFORE any subagent-invoked compliance
// is claimed. Verifies:
//   (a) .codex/agents/kaola-workflow/<role>.toml exists for every REQUIRED role
//       AND is schema-valid (top-level non-empty `name` matching the role, omitted runtime-strength
//       keys for parent inheritance, non-empty `description`, valid `nickname_candidates`,
//       and a non-blank developer_instructions block) - codex >=0.138 silently ignores
//       a profile without a non-empty `name`.
//   (b) .codex/config.toml contains the managed block with an [agents.{role}] entry
//       for every REQUIRED role, and NO retired/foreign [agents.*] inside the block.
//   (c) no stale/retired Kaola profile files survive in the target dir (#332).
//
// REQUIRED role set = UNION of:
//   (a) template roles from ../config/agents.toml (relative to this script, present
//       in the 3 plugin trees; absent in the claude scripts/ tree — graceful degrade)
//   (b) DELEGATED plan roles from --plan <path> (## Nodes role column), when supplied.
//       The built-in, intentionally non-delegable roles (main-session-gate,
//       finalize) carry no profile or template entry by design and are exempt (#716).
//
// Auto-installs (re-runs install-codex-agent-profiles.js) when the ONLY problem
// is a stale/missing/malformed managed block, profile file, or stale Kaola file
// (safe, idempotent). Typed-refuses when conflicts exist outside the markers, the
// installer is unavailable, a plan role is absent from the template, or the local
// manifest carries an unsupported (future) schema_version.
//
// --doctor mode is READ-ONLY (never runs the installer): it reports user, project,
// and plugin-cache scope freshness with concrete per-scope repair commands. Plugin
// cache inspection is read-only, but exact source-byte or schema drift fails the doctor gate.
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
const crypto = require('crypto');

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
const REVIEWER_ROLES = Object.freeze(['code-reviewer', 'adversarial-verifier', 'security-reviewer']);
const REVIEWER_BEHAVIOR_CONTRACT_VERSION = 2;
const REVIEWER_SOURCE_REPAIR = 'node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check';
const CODEX_ROLE_TOP_LEVEL_FIELDS = Object.freeze([
  'name', 'description', 'nickname_candidates', 'developer_instructions',
]);

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

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Managed role profiles intentionally use one small canonical TOML grammar: four bare,
// column-zero assignments and one triple-quoted developer_instructions block, with no tables.
// Reject every other spelling rather than approximating TOML acceptance. This makes quoted,
// dotted, indented, or table-scoped keys fail closed even when Codex itself parses them.
const TOML_KEY_SEGMENT_PATTERN = `(?:"(?:\\\\.|[^"\\\\])*"|'[^']*'|[A-Za-z0-9_-]+)`;
const TOML_ASSIGNMENT_PATTERN = new RegExp(
  `^(\\s*)(${TOML_KEY_SEGMENT_PATTERN}(?:\\s*\\.\\s*${TOML_KEY_SEGMENT_PATTERN})*)\\s*=`,
);

function tomlKeyLabel(raw) {
  const key = String(raw).trim();
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  if (/^"(?:\\.|[^"\\])*"$/.test(key)) {
    try { return JSON.parse(key); } catch (_) { return key; }
  }
  if (/^'[^']*'$/.test(key)) return key.slice(1, -1);
  return key.replace(/\s+/g, '');
}

function profileTopLevelShape(text) {
  const source = String(text);
  const instructionRe = /^developer_instructions\s*=\s*"""([\s\S]*?)"""\s*(?:\r?\n|$)/gm;
  const instructionMatches = [...source.matchAll(instructionRe)];
  let outside = '';
  let cursor = 0;
  for (const match of instructionMatches) {
    outside += source.slice(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  outside += source.slice(cursor);

  const fields = instructionMatches.map(() => 'developer_instructions');
  const violations = [];
  if (source.includes('\r')) violations.push({ kind: 'line_endings', value: 'LF required' });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
    violations.push({ kind: 'control', value: 'raw TOML control character' });
  }
  const instructionBackslash = instructionMatches.some(match => match[1].includes('\\'));
  if (source.includes('\\')) {
    violations.push(instructionBackslash
      ? { kind: 'instruction_backslash', value: 'backslash in multiline basic string' }
      : { kind: 'backslash', value: 'backslash in managed TOML' });
  }
  for (const [index, line] of outside.split(/\r?\n/).entries()) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const table = line.match(/^\s*(\[\[?.*?\]\]?)\s*(?:#.*)?$/);
    if (table) {
      violations.push({ kind: 'table', value: table[1], line: index + 1 });
      continue;
    }
    const assignment = line.match(TOML_ASSIGNMENT_PATTERN);
    if (!assignment) {
      violations.push({ kind: 'syntax', value: line.trim(), line: index + 1 });
      continue;
    }
    const rawKey = assignment[2];
    const field = tomlKeyLabel(rawKey);
    fields.push(field);
    if (assignment[1] !== '' || !/^[A-Za-z0-9_-]+$/.test(rawKey)) {
      violations.push({ kind: 'syntax', value: `noncanonical key ${rawKey}`, line: index + 1 });
    }
    if (!CODEX_ROLE_TOP_LEVEL_FIELDS.includes(field)) {
      violations.push({ kind: 'field', value: field, line: index + 1 });
    }
  }
  for (const field of CODEX_ROLE_TOP_LEVEL_FIELDS) {
    const count = fields.filter(value => value === field).length;
    if (count > 1) violations.push({ kind: 'duplicate', value: field, count });
  }
  return {
    source,
    outside,
    fields,
    violations,
    instructionMatches,
    instructionMatch: instructionMatches.length === 1 ? instructionMatches[0] : null,
    instructionBody: instructionMatches.length === 1 ? instructionMatches[0][1] : null,
  };
}

function genericShapeReasons(shape) {
  return shape.violations.map(violation => {
    if (violation.kind === 'line_endings') return 'codex_role_toml_line_endings_forbidden';
    if (violation.kind === 'control') return 'codex_role_toml_control_character_forbidden';
    if (violation.kind === 'instruction_backslash') return 'codex_role_instruction_toml_backslash_forbidden';
    if (violation.kind === 'backslash') return 'codex_role_toml_backslash_forbidden';
    if (violation.kind === 'field') return `codex_role_field_forbidden: ${violation.value}`;
    if (violation.kind === 'table') return `codex_role_table_forbidden: ${violation.value}`;
    if (violation.kind === 'duplicate') return `codex_role_top_level_field_duplicate: ${violation.value}`;
    return `codex_role_top_level_syntax_forbidden: line=${violation.line} ${violation.value}`;
  });
}

function reviewerShapeReasons(shape) {
  return shape.violations.map(violation => {
    if (violation.kind === 'line_endings') return 'reviewer_toml_line_endings_forbidden';
    if (violation.kind === 'control') return 'reviewer_toml_control_character_forbidden';
    if (violation.kind === 'instruction_backslash') return 'reviewer_instruction_toml_backslash_forbidden';
    if (violation.kind === 'backslash') return 'reviewer_toml_backslash_forbidden';
    if (violation.kind === 'field') return `reviewer_adapter_field_forbidden: ${violation.value}`;
    if (violation.kind === 'table') return `reviewer_adapter_table_forbidden: ${violation.value}`;
    if (violation.kind === 'duplicate') return `reviewer_top_level_field_duplicate: ${violation.value}`;
    return `reviewer_adapter_syntax_forbidden: line=${violation.line} ${violation.value}`;
  });
}

function reviewerProfileContract(text, role) {
  const reasons = [];
  if (!REVIEWER_ROLES.includes(role)) return { reasons, identity: null };

  const shape = profileTopLevelShape(text);
  const source = shape.source;
  const instructionMatch = shape.instructionMatch;
  const instructionText = shape.instructionBody || '';
  reasons.push(...reviewerShapeReasons(shape));

  const coreStarts = instructionText.split('<!-- reviewer-behavior-core:start -->').length - 1;
  const coreEnds = instructionText.split('<!-- reviewer-behavior-core:end -->').length - 1;
  let core = '';
  let coreStart = -1;
  let coreEnd = -1;
  if (coreStarts !== 1 || coreEnds !== 1) {
    reasons.push(`reviewer_behavior_core_invalid: starts=${coreStarts} ends=${coreEnds}`);
  } else {
    coreStart = instructionText.indexOf('<!-- reviewer-behavior-core:start -->');
    const endMarkerStart = instructionText.indexOf('<!-- reviewer-behavior-core:end -->', coreStart);
    coreEnd = endMarkerStart + '<!-- reviewer-behavior-core:end -->'.length;
    if (endMarkerStart < coreStart) {
      reasons.push('reviewer_behavior_core_invalid: markers_out_of_order');
      coreStart = -1;
      coreEnd = -1;
    } else {
      core = instructionText.slice(coreStart, coreEnd);
    }
  }
  const coreRoleMatches = [...core.matchAll(/^role:[ \t]*([^\r\n]+)[ \t]*$/gm)];
  if (coreRoleMatches.length !== 1) {
    reasons.push(`reviewer_behavior_core_role_not_unique: count=${coreRoleMatches.length}`);
  } else if (coreRoleMatches[0][1].trim() !== role) {
    reasons.push('reviewer_behavior_core_role_mismatch');
  }

  const versionFields = [...instructionText.matchAll(
    /^behavior_contract_version[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let coreVersion = null;
  if (versionFields.length === 0) {
    reasons.push('reviewer_behavior_core_version_missing');
  } else if (versionFields.length !== 1) {
    reasons.push(`reviewer_behavior_contract_version_not_unique: count=${versionFields.length}`);
  } else {
    const rawVersion = versionFields[0][1].trim();
    if (!/^\d+$/.test(rawVersion)) {
      reasons.push('reviewer_behavior_core_version_missing');
    } else {
      coreVersion = Number(rawVersion);
    }
    if (coreStart < 0 || versionFields[0].index < coreStart
        || versionFields[0].index + versionFields[0][0].length > coreEnd) {
      reasons.push('reviewer_behavior_contract_version_outside_core');
    }
  }
  if (coreVersion !== null && coreVersion !== REVIEWER_BEHAVIOR_CONTRACT_VERSION) {
    reasons.push(`reviewer_contract_version_unsupported: expected=${REVIEWER_BEHAVIOR_CONTRACT_VERSION} got=${coreVersion}`);
  }

  const behaviorFields = [...instructionText.matchAll(
    /^behavior_contract_hash[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let coreBehaviorHash = null;
  if (behaviorFields.length === 0) {
    reasons.push('reviewer_behavior_core_hash_missing');
  } else if (behaviorFields.length !== 1) {
    reasons.push(`reviewer_behavior_contract_hash_not_unique: count=${behaviorFields.length}`);
  } else {
    const rawHash = behaviorFields[0][1].trim();
    if (/^[0-9a-f]{64}$/.test(rawHash)) coreBehaviorHash = rawHash;
    else reasons.push('reviewer_behavior_core_hash_missing');
    if (coreStart < 0 || behaviorFields[0].index < coreStart
        || behaviorFields[0].index + behaviorFields[0][0].length > coreEnd) {
      reasons.push('reviewer_behavior_contract_hash_outside_core');
    }
  }

  const identityStarts = instructionText.split('<!-- reviewer-profile-identity:start -->').length - 1;
  const identityEnds = instructionText.split('<!-- reviewer-profile-identity:end -->').length - 1;
  let identityStart = -1;
  let identityEnd = -1;
  if (identityStarts !== 1 || identityEnds !== 1) {
    reasons.push(`reviewer_profile_identity_invalid: starts=${identityStarts} ends=${identityEnds}`);
  } else {
    identityStart = instructionText.indexOf('<!-- reviewer-profile-identity:start -->');
    const endMarkerStart = instructionText.indexOf('<!-- reviewer-profile-identity:end -->', identityStart);
    identityEnd = endMarkerStart + '<!-- reviewer-profile-identity:end -->'.length;
    if (endMarkerStart < identityStart) {
      reasons.push('reviewer_profile_identity_invalid: markers_out_of_order');
      identityStart = -1;
      identityEnd = -1;
    }
  }

  const resolvedFields = [...instructionText.matchAll(
    /^resolved_profile_hash[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let resolvedProfileHash = null;
  if (resolvedFields.length === 0) {
    reasons.push('reviewer_resolved_profile_hash_missing');
  } else if (resolvedFields.length !== 1) {
    reasons.push(`reviewer_resolved_profile_hash_not_unique: count=${resolvedFields.length}`);
  } else {
    const match = resolvedFields[0];
    const rawHash = match[1].trim();
    if (/^[0-9a-f]{64}$/.test(rawHash)) {
      resolvedProfileHash = rawHash;
      const bodyOffset = instructionMatch.index + instructionMatch[0].indexOf(instructionMatch[1]);
      const valueOffset = bodyOffset + match.index + match[0].indexOf(rawHash);
      const normalized = source.slice(0, valueOffset) + '0'.repeat(64)
        + source.slice(valueOffset + rawHash.length);
      const expected = sha256Hex(normalized);
      if (resolvedProfileHash !== expected) {
        reasons.push(`reviewer_resolved_profile_hash_mismatch: expected=${expected} got=${resolvedProfileHash}`);
      }
    } else {
      reasons.push('reviewer_resolved_profile_hash_missing');
    }
    if (identityStart < 0 || match.index < identityStart
        || match.index + match[0].length > identityEnd) {
      reasons.push('reviewer_resolved_profile_hash_outside_identity');
    }
  }

  const identity = reasons.length === 0
      && coreVersion === REVIEWER_BEHAVIOR_CONTRACT_VERSION
      && coreBehaviorHash && resolvedProfileHash
    ? {
      behavior_contract_version: coreVersion,
      behavior_contract_hash: coreBehaviorHash,
      resolved_profile_hash: resolvedProfileHash,
    }
    : null;
  return { reasons: [...new Set(reasons)], identity };
}

function repositoryRepairCommand(scriptDir) {
  let cursor = path.resolve(scriptDir);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(cursor, 'scripts', 'generate-reviewer-profiles.js'))) {
      return `cd ${cursor} && ${REVIEWER_SOURCE_REPAIR}`;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return 'Refresh the kaola-workflow plugin source, then re-run the profile installer.';
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

function parseTomlAssignmentKey(line) {
  const assignment = parseTomlAssignment(line);
  return assignment ? assignment.key : null;
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

function parseMultiAgentV2Value(value) {
  const trimmed = String(value || '').trim();
  const bool = parseTomlBoolean(trimmed);
  if (bool !== null) return {
    valid: true,
    enabled: bool,
    non_code_mode_only: null,
    hide_spawn_agent_metadata: null,
    tool_namespace: null,
  };

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { valid: false, enabled: false, non_code_mode_only: null };
  }

  let enabledFound = false;
  let enabled = false;
  let transportFound = false;
  let transportAmbiguous = false;
  let nonCodeModeOnly = null;
  let metadataFound = false;
  let metadataAmbiguous = false;
  let hideSpawnAgentMetadata = null;
  let namespaceFound = false;
  let namespaceAmbiguous = false;
  let toolNamespace = null;
  for (const field of splitInlineTomlFields(trimmed.slice(1, -1))) {
    const assignment = parseTomlAssignment(field);
    if (!assignment || assignment.key.length !== 1) continue;
    const key = assignment.key[0].value;
    if (key === 'enabled') {
      if (enabledFound) return { valid: false, enabled: false, non_code_mode_only: null };
      const fieldBool = parseTomlBoolean(assignment.value);
      if (fieldBool === null) return { valid: false, enabled: false, non_code_mode_only: null };
      enabledFound = true;
      enabled = fieldBool;
      continue;
    }
    if (key === 'non_code_mode_only') {
      if (transportFound) {
        transportAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(assignment.value);
      transportFound = true;
      if (fieldBool === null) transportAmbiguous = true;
      else nonCodeModeOnly = fieldBool;
      continue;
    }
    if (key === 'hide_spawn_agent_metadata') {
      if (metadataFound) {
        metadataAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(assignment.value);
      metadataFound = true;
      if (fieldBool === null) metadataAmbiguous = true;
      else hideSpawnAgentMetadata = fieldBool;
      continue;
    }
    if (key === 'tool_namespace') {
      if (namespaceFound) {
        namespaceAmbiguous = true;
        continue;
      }
      const fieldString = parseTomlString(assignment.value);
      namespaceFound = true;
      if (fieldString === null) namespaceAmbiguous = true;
      else toolNamespace = fieldString;
    }
  }

  return enabledFound
    ? {
      valid: true,
      enabled,
      non_code_mode_only: nonCodeModeOnly,
      transport_ambiguous: transportAmbiguous,
      hide_spawn_agent_metadata: hideSpawnAgentMetadata,
      metadata_ambiguous: metadataAmbiguous,
      tool_namespace: toolNamespace,
      namespace_ambiguous: namespaceAmbiguous,
    }
    : { valid: false, enabled: false, non_code_mode_only: null };
}

function detectCodexDispatchMode(configContent) {
  const lines = tomlStructuralLines(configContent);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;
  let transportSeen = false;
  let transportAmbiguous = false;
  let nonCodeModeOnly = null;
  let metadataSeen = false;
  let metadataAmbiguous = false;
  let hideSpawnAgentMetadata = null;
  let namespaceSeen = false;
  let namespaceAmbiguous = false;
  let toolNamespace = null;
  let forcedUnsafe = false;

  function forceUnsafe() {
    forcedUnsafe = true;
    transportAmbiguous = true;
    metadataAmbiguous = true;
    namespaceAmbiguous = true;
  }

  function recordTransport(value) {
    if (value === null || value === undefined) return;
    if (transportSeen || typeof value !== 'boolean') {
      transportAmbiguous = true;
      nonCodeModeOnly = null;
      return;
    }
    transportSeen = true;
    nonCodeModeOnly = value;
  }

  function record(parsed) {
    if (!parsed.valid || seen) {
      ambiguous = true;
      enabled = false;
      return;
    }
    seen = true;
    enabled = parsed.enabled;
    recordTransport(parsed.non_code_mode_only);
    if (parsed.transport_ambiguous) transportAmbiguous = true;
    recordMetadata(parsed.hide_spawn_agent_metadata);
    if (parsed.metadata_ambiguous) metadataAmbiguous = true;
    recordNamespace(parsed.tool_namespace);
    if (parsed.namespace_ambiguous) namespaceAmbiguous = true;
  }

  function recordMetadata(value) {
    if (value === null || value === undefined) return;
    if (metadataSeen || typeof value !== 'boolean') {
      metadataAmbiguous = true;
      hideSpawnAgentMetadata = null;
      return;
    }
    metadataSeen = true;
    hideSpawnAgentMetadata = value;
  }

  function recordNamespace(value) {
    if (value === null || value === undefined) return;
    if (namespaceSeen || typeof value !== 'string' || value.length === 0) {
      namespaceAmbiguous = true;
      toolNamespace = null;
      return;
    }
    namespaceSeen = true;
    toolNamespace = value;
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
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) {
        forceUnsafe();
        continue;
      }
      const v2Fields = featureFields.filter(field => field.key[0].value === 'multi_agent_v2');
      if (v2Fields.length > 1) {
        forceUnsafe();
        continue;
      }
      if (v2Fields.length === 1) {
        const parsed = parseMultiAgentV2Value(v2Fields[0].value);
        if (parsed.valid) record(parsed);
        else forceUnsafe();
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      record(parseMultiAgentV2Value(assignment.value));
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'enabled'])) {
        record({
          valid: parseTomlBoolean(assignment.value) !== null,
          enabled: parseTomlBoolean(assignment.value) === true,
          non_code_mode_only: null,
          hide_spawn_agent_metadata: null,
          tool_namespace: null,
        });
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'non_code_mode_only'])) {
        const transportValue = parseTomlBoolean(assignment.value);
        if (transportValue === null) transportAmbiguous = true;
        else recordTransport(transportValue);
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'hide_spawn_agent_metadata'])) {
        const metadataValue = parseTomlBoolean(assignment.value);
        if (metadataValue === null) metadataAmbiguous = true;
        else recordMetadata(metadataValue);
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'tool_namespace'])) {
        const namespaceValue = parseTomlString(assignment.value);
        if (namespaceValue === null) namespaceAmbiguous = true;
        else recordNamespace(namespaceValue);
    }
  }

  enabled = forcedUnsafe || (seen && !ambiguous && enabled);
  const transportMode = !enabled
    ? 'not_applicable'
    : (transportAmbiguous
      ? 'unknown'
      : (nonCodeModeOnly === false ? 'nested-allowed' : 'direct-only'));
  const directTransportReady = enabled ? transportMode === 'direct-only' : null;
  const effectiveNamespace = !enabled
    ? null
    : (namespaceAmbiguous ? null : (toolNamespace || 'collaboration'));
  const roleMetadataVisible = !enabled
    ? null
    : (metadataAmbiguous ? null : hideSpawnAgentMetadata === false);
  const roleTransportReady = enabled
    ? directTransportReady === true
      && effectiveNamespace === CODEX_V2_ROLE_TOOL_NAMESPACE
      && roleMetadataVisible === true
    : null;
  let transportWarning = null;
  if (enabled && directTransportReady !== true) {
    transportWarning = CODEX_V2_DIRECT_TRANSPORT_NOTE;
  } else if (enabled && roleTransportReady !== true) {
    transportWarning = CODEX_V2_ROLE_TRANSPORT_NOTE;
  }
  return {
    dispatch_mode: enabled ? 'v2-task-name' : 'v1-thread-id',
    multi_agent_v2_enabled: enabled,
    codex_v2_transport_mode: transportMode,
    codex_v2_direct_transport_ready: directTransportReady,
    codex_v2_tool_namespace: effectiveNamespace,
    codex_v2_role_metadata_visible: roleMetadataVisible,
    codex_v2_role_transport_ready: roleTransportReady,
    codex_v2_transport_warning: transportWarning,
  };
}

const CODEX_V2_TRANSPORT_UNSAFE_STATUS = 'codex_v2_encrypted_transport_unsafe';
const CODEX_V2_DIRECT_TRANSPORT_NOTE = 'Codex MultiAgentV2 encrypted task messages require direct-only collaboration tools. Set non_code_mode_only = true in the enabled [features] multi_agent_v2 inline object or [features.multi_agent_v2] table (or omit that field to use the Codex 0.144.1 direct-only default), then start a fresh Codex session; never dispatch spawn_agent, send_message, or followup_task through functions.exec or Code Mode.';
const CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS = 'codex_v2_role_transport_unsafe';
const CODEX_V2_ROLE_TOOL_NAMESPACE = 'agents';
const CODEX_V2_ROLE_TRANSPORT_NOTE = 'Kaola-Workflow role-aware MultiAgentV2 on Codex 0.144.1 requires tool_namespace = "agents", hide_spawn_agent_metadata = false, and non_code_mode_only = true. The default collaboration.spawn_agent name is server-reserved: exposing agent_type/model/reasoning fields there fails the first request with HTTP 400, while hiding them removes Kaola role selection. Apply the settings in the enabled [features] multi_agent_v2 object or [features.multi_agent_v2] table, then start a fresh Codex session and call the direct agents namespace, never functions.exec or Code Mode.';

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
  const lines = tomlStructuralLines(configContent);
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

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) continue;
      for (const field of featureFields) {
        if (field.key[0].value !== 'multi_agent') continue;
        const b = parseTomlBoolean(field.value);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
        }
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent'])) {
        const b = parseTomlBoolean(assignment.value);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
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
      const assignment = parseTomlAssignment(field);
      if (assignment && assignment.key.length === 1) {
        recordField(assignment.key[0].value, assignment.value);
      }
    }
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
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) continue;
      for (const field of featureFields) {
        if (field.key[0].value !== 'multi_agent_v2') continue;
        const value = field.value.trim();
        if (value.startsWith('{') && value.endsWith('}')) {
          recordFromInlineObject(value.slice(1, -1));
        }
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
        const v = assignment.value.trim();
        if (v.startsWith('{') && v.endsWith('}')) recordFromInlineObject(v.slice(1, -1));
    } else {
      const prefix = ['features', 'multi_agent_v2'];
      const fullPath = tomlAssignmentPath(table, assignment);
      if (fullPath && fullPath.length === 3
          && fullPath[0] === prefix[0] && fullPath[1] === prefix[1]) {
        recordField(fullPath[2], assignment.value);
      }
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

// Codex overlays config keys from ~/.codex, then project .codex directories from
// repository root to cwd. Parse only the transport/posture fields this gate owns,
// retain whether each field was explicitly present, and overlay high layers over
// low layers without treating an absent project field as a reset.
function parseRuntimeLayerOverrides(configContent) {
  const overrides = {};
  let table = null;
  let v2Shape = null;
  let v2ShapeSource = null;

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

  function recordV2Shape(kind, source) {
    if (v2Shape === null) {
      v2Shape = kind;
      v2ShapeSource = source;
      return;
    }
    const recursivelyMergeable = v2Shape === 'table' && kind === 'table'
      && v2ShapeSource !== 'inline' && source !== 'inline';
    if (!recursivelyMergeable) {
      v2Shape = 'invalid';
      v2ShapeSource = 'invalid';
    }
  }

  function recordV2Object(body) {
    for (const field of splitInlineTomlFields(body)) {
      const assignment = parseTomlAssignment(field);
      if (!assignment || assignment.key.length !== 1) continue;
      const key = assignment.key[0].value;
      const raw = assignment.value;
      if (key === 'enabled') recordBoolean('v2_enabled', raw);
      else if (key === 'non_code_mode_only') recordBoolean('v2_non_code_mode_only', raw);
      else if (key === 'hide_spawn_agent_metadata') recordBoolean('v2_hide_spawn_agent_metadata', raw);
      else if (key === 'tool_namespace') {
        const value = parseTomlString(raw);
        record('v2_tool_namespace', value, value !== null && value.length > 0);
      } else if (MULTI_AGENT_V2_NUMERIC_FIELDS.includes(key)) {
        recordInteger(`v2_${key}`, raw);
      }
    }
  }

  function recordV2Value(rawValue) {
    const value = String(rawValue).trim();
    const bool = parseTomlBoolean(value);
    if (bool !== null) {
      recordV2Shape('scalar', 'scalar');
      record('v2_enabled', bool, true);
    } else if (value.startsWith('{') && value.endsWith('}')) {
      recordV2Shape('table', 'inline');
      recordV2Object(value.slice(1, -1));
    } else {
      recordV2Shape('invalid', 'invalid');
      record('v2_enabled', null, false);
    }
  }

  function recordFeaturesValue(rawValue) {
    const featureFields = parseInlineTomlTableAssignments(rawValue);
    if (featureFields === null) {
      recordV2Shape('invalid', 'invalid');
      record('v2_enabled', null, false);
      return;
    }
    for (const field of featureFields) {
      const key = field.key[0].value;
      if (key === 'multi_agent') recordBoolean('multi_agent', field.value);
      else if (key === 'multi_agent_v2') recordV2Value(field.value);
    }
  }

  for (const rawLine of tomlStructuralLines(configContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      if (tomlTableNameMatches(table, 'features.multi_agent_v2')) {
        recordV2Shape('table', 'structural');
      }
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['model_reasoning_effort'])) {
        const value = parseTomlString(assignment.value);
        record('model_reasoning_effort', value, value !== null);
    }

    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      recordFeaturesValue(assignment.value);
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent'])) {
      recordBoolean('multi_agent', assignment.value);
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      recordV2Value(assignment.value);
    } else {
      const fullPath = tomlAssignmentPath(table, assignment);
      if (!fullPath || fullPath.length !== 3
          || fullPath[0] !== 'features' || fullPath[1] !== 'multi_agent_v2') continue;
      if (!tomlTableNameMatches(table, 'features.multi_agent_v2')) {
        recordV2Shape('table', 'structural');
      }
      const key = fullPath[2];
      const raw = assignment.value;
      if (key === 'enabled') recordBoolean('v2_enabled', raw);
      else if (key === 'non_code_mode_only') recordBoolean('v2_non_code_mode_only', raw);
      else if (key === 'hide_spawn_agent_metadata') recordBoolean('v2_hide_spawn_agent_metadata', raw);
      else if (key === 'tool_namespace') {
        const value = parseTomlString(raw);
        record('v2_tool_namespace', value, value !== null && value.length > 0);
      } else if (MULTI_AGENT_V2_NUMERIC_FIELDS.includes(key)) {
        recordInteger(`v2_${key}`, raw);
      }
    }
  }
  if (v2Shape !== null) {
    overrides._v2_shape = {
      present: true,
      valid: v2Shape !== 'invalid',
      value: v2Shape === 'invalid' ? null : v2Shape,
    };
    if (v2Shape === 'invalid') {
      overrides.v2_enabled = { present: true, valid: false, value: null };
    }
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
    const nextShape = layer._v2_shape;
    if (nextShape && nextShape.present) {
      const previousShape = effective._v2_shape;
      const previousKind = previousShape && previousShape.valid ? previousShape.value : 'invalid';
      const nextKind = nextShape.valid ? nextShape.value : 'invalid';
      if (nextKind !== 'table' || (previousShape && previousKind !== 'table')) {
        for (const key of Object.keys(effective)) {
          if (key.startsWith('v2_')) delete effective[key];
        }
      }
      effective._v2_shape = { ...nextShape, configPath };
    }
    for (const [key, field] of Object.entries(layer)) {
      if (key === '_v2_shape') continue;
      effective[key] = { ...field, configPath };
    }
  }

  const lines = [];
  const effort = effective.model_reasoning_effort;
  if (effort && effort.present && effort.valid) {
    lines.push(`model_reasoning_effort = ${JSON.stringify(effort.value)}`, '');
  }
  lines.push('[features]');
  if (effective.multi_agent && effective.multi_agent.present) {
    lines.push(`multi_agent = ${effective.multi_agent.valid ? effective.multi_agent.value : 'false'}`);
  }

  const v2Keys = Object.keys(effective).filter(key => key.startsWith('v2_'));
  if (v2Keys.length > 0) {
    lines.push('', '[features.multi_agent_v2]');
    const enabled = effective.v2_enabled;
    const forceUnknown = !!(enabled && enabled.present && !enabled.valid);
    if (enabled && enabled.present) {
      lines.push(`enabled = ${enabled.valid ? enabled.value : 'true'}`);
    }
    const booleans = [
      ['v2_non_code_mode_only', 'non_code_mode_only'],
      ['v2_hide_spawn_agent_metadata', 'hide_spawn_agent_metadata'],
    ];
    for (const [stateKey, outputKey] of booleans) {
      const field = effective[stateKey];
      if (field && field.present) {
        lines.push(`${outputKey} = ${field.valid ? field.value : '"invalid"'}`);
      }
    }
    if (forceUnknown && !effective.v2_non_code_mode_only) {
      lines.push('non_code_mode_only = "invalid"');
    }
    const namespace = effective.v2_tool_namespace;
    if (namespace && namespace.present) {
      lines.push(`tool_namespace = ${namespace.valid ? JSON.stringify(namespace.value) : '123'}`);
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
  let transportConfigPath = null;
  if (dispatch.codex_v2_direct_transport_ready === false) {
    transportConfigPath = (effective.v2_non_code_mode_only || effective.v2_enabled || {}).configPath || null;
  } else if (dispatch.codex_v2_role_transport_ready === false) {
    const namespaceBad = dispatch.codex_v2_tool_namespace !== CODEX_V2_ROLE_TOOL_NAMESPACE;
    const metadataBad = dispatch.codex_v2_role_metadata_visible !== true;
    transportConfigPath = (namespaceBad ? effective.v2_tool_namespace : null)?.configPath
      || (metadataBad ? effective.v2_hide_spawn_agent_metadata : null)?.configPath
      || (effective.v2_enabled || {}).configPath
      || null;
  }
  return {
    ...dispatch,
    ...posture,
    ...bounds,
    effective_config: effectiveContent,
    effective_config_paths: [...new Set(configPaths)],
    transport_config_path: transportConfigPath,
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

function scopeAuthorityIssue(codexDir, templateRoles) {
  const checks = [
    { target: codexDir, kind: 'directory', optional: true },
    { target: path.join(codexDir, 'agents'), kind: 'directory', optional: true },
    { target: path.join(codexDir, 'agents', 'kaola-workflow'), kind: 'directory', optional: true },
    { target: path.join(codexDir, 'config.toml'), kind: 'file', optional: true },
    {
      target: path.join(codexDir, 'agents', 'kaola-workflow', MANIFEST_BASENAME),
      kind: 'file', optional: true,
    },
    ...(templateRoles || []).map(role => ({
      target: path.join(codexDir, 'agents', 'kaola-workflow', `${role}.toml`),
      kind: 'file',
      optional: true,
    })),
  ];

  let authorityReal = null;
  try { authorityReal = fs.realpathSync(codexDir); } catch (_) {}
  for (const check of checks) {
    let stat;
    try {
      stat = fs.lstatSync(check.target);
    } catch (error) {
      if (check.optional && error && error.code === 'ENOENT') continue;
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
      repair: `Replace ${configRead.configPath} with a readable regular non-symlink config.toml, then re-run the profile preflight.`,
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
      repair: `Replace ${issue.path} with the expected regular non-symlink path inside ${codexDir}, then re-run the canonical profile installer.`,
    },
  };
}

function projectTrustRequiredResult(projectRoot, trustLevel) {
  return {
    exitCode: 4,
    result: {
      status: 'project_trust_required',
      stale: true,
      safe_autofix: false,
      project_root: path.resolve(projectRoot),
      project_trust: trustLevel,
      repair: 'Codex ignores project .codex layers unless the project is trusted. Trust this project in Codex and start a fresh session, or install canonical Kaola profiles globally and remove the ignored project Kaola override.',
    },
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
  const shape = profileTopLevelShape(text);
  const top = shape.outside;
  reasons.push(...genericShapeReasons(shape));

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

  const modelLines = shape.fields.filter(field => field === 'model');
  const effortLines = shape.fields.filter(field => field === 'model_reasoning_effort');
  if (!CODEX_PINNED_STANDARD_ROLES.includes(role) && !CODEX_PINNED_REASONING_ROLES.includes(role)) {
    reasons.push(`role "${role}" has no Codex profile-tier policy`);
  }
  if (modelLines.length > 0) reasons.push("top-level 'model' must be omitted to inherit the parent session");
  if (effortLines.length > 0) reasons.push("top-level 'model_reasoning_effort' must be omitted to inherit the parent session");

  const instrMatch = shape.instructionMatch;
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

  reasons.push(...reviewerProfileContract(text, role).reasons);

  return [...new Set(reasons)];
}

function classifyProfilePinPosture(text) {
  const top = profileTopLevelShape(text).outside;
  const models = [...top.matchAll(/^model\s*=\s*"([^"]*)"\s*$/gm)].map(m => m[1]);
  const efforts = [...top.matchAll(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/gm)].map(m => m[1]);
  const anyModelLine = (top.match(/^model\s*=.*$/gm) || []).length;
  const anyEffortLine = (top.match(/^model_reasoning_effort\s*=.*$/gm) || []).length;
  if (anyModelLine === 0 && anyEffortLine === 0) return 'inherit';
  if (anyModelLine === 1 && anyEffortLine === 1 && models.length === 1 && efforts.length === 1
      && models[0] === CODEX_STANDARD_MODEL && [CODEX_STANDARD_EFFORT, CODEX_REASONING_EFFORT].includes(efforts[0])) {
    return 'legacy_pinned';
  }
  return 'malformed';
}

const LEGACY_PIN_ONLY_REASONS = new Set([
  'codex_role_field_forbidden: model',
  'codex_role_field_forbidden: model_reasoning_effort',
  "top-level 'model' must be omitted to inherit the parent session",
  "top-level 'model_reasoning_effort' must be omitted to inherit the parent session"
]);

// ---------------------------------------------------------------------------
// Template role parsing — reads config/agents.toml via inline regex (no TOML lib).
// Each tree has its own copy of this file at <scriptDir>/../config/agents.toml.
// Returns { roles: string[], error: string|null }
// ---------------------------------------------------------------------------
function bundledSourceAuthorityIssue(pluginRoot, target, expectedKind, label) {
  const resolvedRoot = path.resolve(pluginRoot);
  const resolvedTarget = path.resolve(target);
  const lexicalRelative = path.relative(resolvedRoot, resolvedTarget);
  if (lexicalRelative === '..' || lexicalRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(lexicalRelative)) {
    return `${label}_unsafe: ${resolvedTarget} escapes ${resolvedRoot}`;
  }
  let stat;
  try { stat = fs.lstatSync(resolvedTarget); }
  catch (error) {
    return error && error.code === 'ENOENT'
      ? `${label}_missing: ${resolvedTarget}`
      : `${label}_unsafe: cannot inspect ${resolvedTarget}: ${error.message}`;
  }
  const correctKind = expectedKind === 'directory' ? stat.isDirectory() : stat.isFile();
  if (stat.isSymbolicLink() || !correctKind) {
    return `${label}_unsafe: ${resolvedTarget} must be a regular non-symlink ${expectedKind}`;
  }
  try {
    const realRoot = fs.realpathSync(resolvedRoot);
    const realTarget = fs.realpathSync(resolvedTarget);
    const realRelative = path.relative(realRoot, realTarget);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`)
        || path.isAbsolute(realRelative)) {
      return `${label}_unsafe: ${resolvedTarget} resolves outside ${resolvedRoot}`;
    }
  } catch (error) {
    return `${label}_unsafe: cannot resolve ${resolvedTarget}: ${error.message}`;
  }
  return null;
}

function readTemplateRoles(scriptDir) {
  const pluginRoot = path.resolve(scriptDir, '..');
  const configDir = path.join(pluginRoot, 'config');
  const templatePath = path.join(configDir, 'agents.toml');
  const sourceAgentsDir = path.join(pluginRoot, 'agents');
  const authorityIssues = [
    bundledSourceAuthorityIssue(pluginRoot, pluginRoot, 'directory', 'plugin_source_root'),
    bundledSourceAuthorityIssue(pluginRoot, configDir, 'directory', 'plugin_config_path'),
    bundledSourceAuthorityIssue(pluginRoot, templatePath, 'file', 'plugin_config_path'),
    bundledSourceAuthorityIssue(pluginRoot, sourceAgentsDir, 'directory', 'plugin_agents_path'),
  ].filter(Boolean);
  if (authorityIssues.length > 0) {
    return { roles: [], entries: [], content: '', error: null, sourceErrors: authorityIssues };
  }
  let content;
  try {
    content = fs.readFileSync(templatePath, 'utf8');
  } catch (e) {
    return { roles: [], entries: [], content: '', error: `template_missing: cannot read ${templatePath}: ${e.message}` };
  }
  const roles = [];
  const entries = [];
  const lines = content.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\[agents\.([a-z0-9-]+)\]\s*$/);
    if (head) {
      current = { role: head[1], description: null, nicknameCandidates: [], configFile: null, basename: null };
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
      continue;
    }
    const configFile = line.match(/^config_file\s*=\s*"([^"]*)"\s*$/);
    if (configFile) {
      current.configFile = configFile[1];
      current.basename = path.basename(configFile[1]);
    }
  }
  if (roles.length === 0) {
    return { roles: [], entries: [], content, error: `template_missing: no [agents.*] entries found in ${templatePath}` };
  }
  const sourceErrors = [];
  const seenRoles = new Set();
  const seenConfigFiles = new Set();
  const seenBasenames = new Set();
  for (const entry of entries) {
    if (seenRoles.has(entry.role)) {
      sourceErrors.push(`agents.toml duplicate [agents.${entry.role}] entry`);
    }
    seenRoles.add(entry.role);
    if (!entry.configFile || !entry.basename) continue;
    if (seenConfigFiles.has(entry.configFile)) {
      sourceErrors.push(`agents.toml duplicate config_file "${entry.configFile}" reference`);
    }
    seenConfigFiles.add(entry.configFile);
    if (seenBasenames.has(entry.basename)) {
      sourceErrors.push(`agents.toml duplicate config_file basename "${entry.basename}" reference`);
    }
    seenBasenames.add(entry.basename);
    const canonicalBasename = `${entry.role}.toml`;
    if (entry.basename !== canonicalBasename) {
      sourceErrors.push(
        `agents.toml [agents.${entry.role}] config_file basename must be "${canonicalBasename}" `
        + `(got "${entry.basename}")`
      );
    }
  }
  const referenced = new Set();
  for (const entry of entries) {
    if (!entry.basename) {
      sourceErrors.push(`agents.toml [agents.${entry.role}] has no config_file line`);
      continue;
    }
    referenced.add(entry.basename);
    const sourcePath = path.join(sourceAgentsDir, entry.basename);
    const sourceIssue = bundledSourceAuthorityIssue(
      pluginRoot, sourcePath, 'file', 'plugin_source_profile');
    if (sourceIssue) {
      sourceErrors.push(sourceIssue);
      continue;
    }
    let sourceText;
    try { sourceText = fs.readFileSync(sourcePath, 'utf8'); }
    catch (error) {
      sourceErrors.push(`plugin_source_profile_unsafe: cannot read ${sourcePath}: ${error.message}`);
      continue;
    }
    entry.sourcePath = sourcePath;
    entry.sourceText = sourceText;
    entry.sourceSha256 = 'sha256:' + sha256Hex(Buffer.from(sourceText, 'utf8'));
    entry.profileContract = reviewerProfileContract(sourceText, entry.role).identity;
    for (const reason of validateProfileText(sourceText, entry.role, entry)) {
      sourceErrors.push(`agents/${entry.basename}: ${reason}`);
    }
  }
  for (const file of fs.readdirSync(sourceAgentsDir).filter(name => name.endsWith('.toml')).sort()) {
    if (!referenced.has(file)) {
      sourceErrors.push(`agents/${file}: not referenced by any [agents.*] entry in config/agents.toml`);
    }
  }
  return { roles, entries, content, error: null, sourceErrors };
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
// #716: built-in, intentionally non-delegable workflow roles. A frozen plan's
// ## Nodes table may list them (the gates and the finalize sink run in the main
// session, never as delegated subagents), so they have no Codex profile and no
// config/agents.toml entry BY DESIGN. They are exempt from the template/profile
// availability checks in runPreflight; every other (delegated) plan role stays
// fail-closed (role_not_in_template / profiles_missing).
// ---------------------------------------------------------------------------
const PLAN_BUILTIN_NON_DELEGABLE_ROLES = Object.freeze(['main-session-gate', 'finalize']);

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
function canonicalManagedBlockBodies(templateContent) {
  const template = String(templateContent || '').trim();
  if (!template) return { full: '', agentOnly: '' };
  const firstAgent = template.search(/^\[agents\./m);
  const agentOnly = firstAgent >= 0 ? template.slice(firstAgent).trim() : '';
  return {
    full: `\n${template}\n`,
    agentOnly: agentOnly ? `\n${agentOnly}\n` : '',
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

function containsExternalFeaturesTable(content) {
  let currentTable = null;
  for (const rawLine of tomlStructuralLines(content)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      currentTable = tableName;
      if (tomlTableNameMatches(tableName, 'features')) return true;
      continue;
    }
    if (currentTable !== null) continue;
    const assignment = parseTomlAssignment(line);
    if (assignment && assignment.key[0] && assignment.key[0].value === 'features') return true;
  }
  return false;
}

function outsideAgentDeclarations(outsideContent) {
  const declarations = [];
  let currentTable = null;
  for (const rawLine of tomlStructuralLines(outsideContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName) {
      currentTable = tableName;
      if (Array.isArray(tableName.segments)
          && tableName.segments[0] && tableName.segments[0].value === 'agents') {
        const role = tableName.segments.slice(1).map(segment => segment.value).join('.');
        declarations.push(role || '*');
      }
      continue;
    }
    const assignmentKey = currentTable === null ? parseTomlAssignmentKey(line) : null;
    if (assignmentKey && assignmentKey[0] && assignmentKey[0].value === 'agents') {
      declarations.push('*');
    }
  }
  return [...new Set(declarations)];
}

function managedRoleConflicts(conflictingRolesOutside, templateRoles) {
  return (conflictingRolesOutside || []).filter(role =>
    role === '*' || (templateRoles || []).some(templateRole =>
      role === templateRole || role.startsWith(templateRole + '.')));
}

function checkManagedBlock(configContent, templateContent = '') {
  const markerRange = managedMarkerRange(configContent);

  let blockFound = false;
  let blockBody = '';
  let outsideContent = configContent;

  if (markerRange.state === 'present') {
    blockFound = true;
    blockBody = configContent.slice(
      markerRange.start + BEGIN_MARKER.length,
      markerRange.endMarkerStart,
    );
    outsideContent = configContent.slice(0, markerRange.start)
      + configContent.slice(markerRange.end);
  }

  // Parse [agents.{role}] entries inside the block
  const rolesInBlock = [];
  const blockRe = /^\[agents\.([a-z0-9-]+)\]/gm;
  let m;
  while ((m = blockRe.exec(blockBody)) !== null) {
    rolesInBlock.push(m[1]);
  }

  // Any agents declaration outside the owned markers is a higher-precedence
  // override, including quoted/dotted/indented tables and `[agents]` inline maps.
  const conflictingRolesOutside = outsideAgentDeclarations(outsideContent);

  const expectedBodies = canonicalManagedBlockBodies(templateContent);
  const expectedBody = containsExternalFeaturesTable(outsideContent)
    ? expectedBodies.agentOnly
    : expectedBodies.full;
  const managedBlockDrift = markerRange.state === 'invalid'
    || (blockFound && expectedBody ? blockBody !== expectedBody : false);

  return { blockFound, managedBlockDrift, rolesInBlock, conflictingRolesOutside };
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
function inspectScope({
  codexDir,
  templateRoles,
  templateEntries,
  templateContent = '',
  configContentOverride,
  inspectProfiles = true,
}) {
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');
  const configPath = path.join(codexDir, 'config.toml');
  const roleSet = new Set(templateRoles);
  const metaByRole = new Map((templateEntries || []).map(e => [e.role, e]));

  const exists = fs.existsSync(codexDir);

  let configContent = typeof configContentOverride === 'string' ? configContentOverride : '';
  if (typeof configContentOverride !== 'string' && fs.existsSync(configPath)) {
    try { configContent = fs.readFileSync(configPath, 'utf8'); } catch { configContent = ''; }
  }
  const dispatchMode = detectCodexDispatchMode(configContent);
  const posture = deriveDispatchPosture(configContent);
  const v2Bounds = deriveMultiAgentV2Bounds(configContent, dispatchMode.multi_agent_v2_enabled);
  const { blockFound, managedBlockDrift, rolesInBlock, conflictingRolesOutside } =
    checkManagedBlock(configContent, templateContent);
  const managedRoleConflictsOutside = managedRoleConflicts(
    conflictingRolesOutside, templateRoles,
  );

  const missingFromBlock = templateRoles.filter(r => !rolesInBlock.includes(r));
  const staleRolesInBlock = rolesInBlock.filter(r => !roleSet.has(r));

  const { missingRoles: missingProfiles } = inspectProfiles
    ? checkProfiles(agentsDir, templateRoles)
    : { missingRoles: [] };

  // Inspect the agents dir contents: malformed required profiles + stale/extra files.
  const malformed = [];
  const legacyPinnedProfiles = [];
  const staleProfileMap = new Map();
  const staleFiles = [];
  const extraUnmanaged = [];
  const manifest = inspectProfiles ? readManifest(agentsDir) : null;
  const manifestFiles = (manifest && manifest.files && typeof manifest.files === 'object')
    ? new Set(Object.keys(manifest.files))
    : new Set();

  const manifestFileExists = inspectProfiles
    && fs.existsSync(path.join(agentsDir, MANIFEST_BASENAME));
  let manifestStatus = manifestFileExists ? 'invalid' : 'absent';
  if (manifest) {
    manifestStatus = (typeof manifest.schema_version === 'number' && manifest.schema_version > MANIFEST_SCHEMA_VERSION)
      ? 'unsupported'
      : (manifest.schema_version === MANIFEST_SCHEMA_VERSION ? 'present' : 'outdated');
  }

  function addStaleProfile(role, file, reason) {
    const key = `${role}\0${file}`;
    if (!staleProfileMap.has(key)) staleProfileMap.set(key, { role, file, reasons: [] });
    const item = staleProfileMap.get(key);
    if (!item.reasons.includes(reason)) item.reasons.push(reason);
  }

  if (inspectProfiles && fs.existsSync(agentsDir)) {
    let names = [];
    try { names = fs.readdirSync(agentsDir); } catch { names = []; }
    for (const name of names) {
      if (!name.endsWith('.toml')) continue;
      const role = name.replace(/\.toml$/, '');
      if (roleSet.has(role)) {
        // Required role: schema-check it.
        let txt = '';
        try { txt = fs.readFileSync(path.join(agentsDir, name), 'utf8'); } catch { txt = ''; }
        const posture = classifyProfilePinPosture(txt);
        const expected = metaByRole.get(role) || null;
        const reasons = validateProfileText(txt, role, expected);
        const sourceDrift = !!(expected && typeof expected.sourceText === 'string' && txt !== expected.sourceText);
        if (posture === 'legacy_pinned') {
          const nonPinReasons = reasons.filter(reason => !LEGACY_PIN_ONLY_REASONS.has(reason));
          if (nonPinReasons.length === 0) legacyPinnedProfiles.push({ role, file: name });
          else malformed.push({ role, file: name, reasons: nonPinReasons });
        } else if (reasons.length > 0) {
          if (sourceDrift && REVIEWER_ROLES.includes(role)) {
            addStaleProfile(role, name, 'profile_bytes_mismatch: installed profile differs from bundled source');
            for (const reason of reasons) addStaleProfile(role, name, reason);
          } else {
            malformed.push({ role, file: name, reasons });
          }
        } else if (sourceDrift) {
          addStaleProfile(role, name, 'profile_bytes_mismatch: installed profile differs from bundled source');
        }

        if (manifest && manifest.schema_version === MANIFEST_SCHEMA_VERSION) {
          const actualFileHash = 'sha256:' + sha256Hex(Buffer.from(txt, 'utf8'));
          const recordedFileHash = manifest.files && manifest.files[name];
          if (recordedFileHash !== actualFileHash) {
            addStaleProfile(role, name,
              `manifest_file_hash_mismatch: expected=${actualFileHash} got=${recordedFileHash || 'missing'}`);
          }
          if (REVIEWER_ROLES.includes(role)) {
            const actualIdentity = reviewerProfileContract(txt, role).identity;
            const recordedIdentity = manifest.profile_contracts && manifest.profile_contracts[name];
            if (!actualIdentity || JSON.stringify(recordedIdentity) !== JSON.stringify(actualIdentity)) {
              addStaleProfile(role, name, 'manifest_profile_contract_mismatch');
              manifestStatus = 'outdated';
            }
          }
        }
      } else if (manifestFiles.has(name) || RETIRED_PROFILE_FILES.includes(name)) {
        staleFiles.push(name);
      } else {
        extraUnmanaged.push(name);
      }
    }
  }

  malformed.sort((a, b) => a.role.localeCompare(b.role));
  legacyPinnedProfiles.sort((a, b) => a.role.localeCompare(b.role));
  const staleProfiles = [...staleProfileMap.values()].sort((a, b) => a.role.localeCompare(b.role));
  staleFiles.sort();
  extraUnmanaged.sort();

  return {
    exists,
    blockFound,
    managedBlockDrift,
    rolesInBlock,
    missingFromBlock,
    staleRolesInBlock,
    conflictingRolesOutside,
    managedRoleConflictsOutside,
    missingProfiles,
    malformed,
    legacyPinnedProfiles,
    staleProfiles,
    staleFiles,
    extraUnmanaged,
    manifest: manifestStatus,
    dispatch_mode: dispatchMode.dispatch_mode,
    multi_agent_v2_enabled: dispatchMode.multi_agent_v2_enabled,
    codex_v2_transport_mode: dispatchMode.codex_v2_transport_mode,
    codex_v2_direct_transport_ready: dispatchMode.codex_v2_direct_transport_ready,
    codex_v2_tool_namespace: dispatchMode.codex_v2_tool_namespace,
    codex_v2_role_metadata_visible: dispatchMode.codex_v2_role_metadata_visible,
    codex_v2_role_transport_ready: dispatchMode.codex_v2_role_transport_ready,
    codex_v2_transport_warning: dispatchMode.codex_v2_transport_warning,
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

// The repository-root CLI is a documented entrypoint, while its canonical
// profiles, manifest, and installer live in plugins/kaola-workflow. Resolve that
// one source-tree layout explicitly. Installed/cache copies retain their direct
// scriptDir and therefore their own exact manifest/path authority.
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

function codexV2TransportEnvelope(scope) {
  return {
    codex_v2_transport_mode: scope.codex_v2_transport_mode,
    codex_v2_direct_transport_ready: scope.codex_v2_direct_transport_ready,
    codex_v2_tool_namespace: scope.codex_v2_tool_namespace,
    codex_v2_role_metadata_visible: scope.codex_v2_role_metadata_visible,
    codex_v2_role_transport_ready: scope.codex_v2_role_transport_ready,
    codex_v2_transport_warning: scope.codex_v2_transport_warning,
  };
}

function unsafeCodexV2Transport(scope, scopeName, codexDir, configPath = null) {
  const directUnsafe = scope.codex_v2_direct_transport_ready === false;
  return {
    exitCode: 7,
    result: {
      status: directUnsafe
        ? CODEX_V2_TRANSPORT_UNSAFE_STATUS
        : CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS,
      scope: scopeName,
      stale: true,
      safe_autofix: false,
      repair: directUnsafe ? CODEX_V2_DIRECT_TRANSPORT_NOTE : CODEX_V2_ROLE_TRANSPORT_NOTE,
      extra_unmanaged: scope.extraUnmanaged,
      dispatch_mode: scope.dispatch_mode,
      multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
      ...codexV2TransportEnvelope(scope),
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
      config_path: configPath || path.join(codexDir, 'config.toml'),
      effective_config_paths: scope.effective_config_paths || [],
    },
  };
}

function unsupportedManifestResult({
  scope,
  agentsDir,
  scriptDir,
  projectRoot,
  globalInstall = false,
  scopeName,
}) {
  const installTarget = globalInstall ? '--global' : projectRoot;
  return {
    exitCode: 6,
    result: {
      status: 'profile_schema_version_unsupported',
      scope: scopeName,
      stale: true,
      extra_unmanaged: scope.extraUnmanaged,
      repair: `The local profile manifest (${path.join(agentsDir, MANIFEST_BASENAME)}) declares an unsupported schema_version — upgrade kaola-workflow, then run node ${path.join(scriptDir, 'install-codex-agent-profiles.js')} ${installTarget}`,
      safe_autofix: false,
      dispatch_mode: scope.dispatch_mode,
      multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
      ...codexV2TransportEnvelope(scope),
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
  const sourceScriptDir = resolvePreflightSourceScriptDir(scriptDir, homeDir);

  let activeProjectRoot = path.resolve(projectRoot);
  let codexDir = path.join(activeProjectRoot, '.codex');
  let agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');

  // --- Read template roles (may fail gracefully) ---
  const template = readTemplateRoles(sourceScriptDir);
  const { roles: templateRoles, entries: templateEntries, content: templateContent,
    error: templateError, sourceErrors = [] } = template;
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
  if (sourceErrors.length > 0) {
    return {
      exitCode: 2,
      result: {
        status: 'profile_source_stale',
        malformed: sourceErrors,
        stale: true,
        safe_autofix: false,
        repair: repositoryRepairCommand(sourceScriptDir),
      },
    };
  }

  // --- Read plan roles ---
  const planRoles = readPlanRoles(planPath);
  // #716: built-in non-delegable roles are exempt from the template/profile
  // availability checks; delegated plan roles stay fail-closed.
  const delegatedPlanRoles = planRoles.filter(r => !PLAN_BUILTIN_NON_DELEGABLE_ROLES.includes(r));

  // --- Check delegated plan roles against template ---
  const rolesNotInTemplate = delegatedPlanRoles.filter(r => !templateRoles.includes(r));
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

  // --- Build REQUIRED role set: union of template + delegated plan roles ---
  const requiredRoles = [...templateRoles];
  for (const r of delegatedPlanRoles) {
    if (!requiredRoles.includes(r)) requiredRoles.push(r);
  }

  // Codex derives the project root from the persisted global
  // `project_root_markers`, then considers every .codex layer root -> cwd. Trust
  // is decided independently for each layer: exact layer, detected root, then
  // root Git project. Only trusted layers enter the effective runtime overlay.
  const globalCodexDir = path.join(homeDir, '.codex');
  const globalConfigRead = readConfigLayer(globalCodexDir);
  if (!globalConfigRead.ok) return unsafeConfigLayerResult(globalConfigRead);
  const globalConfigPath = globalConfigRead.configPath;
  const globalConfigContent = globalConfigRead.content;
  const markerConfig = parseProjectRootMarkers(globalConfigContent);
  if (!markerConfig.valid) {
    return {
      exitCode: 4,
      result: {
        status: 'project_root_markers_invalid',
        stale: true,
        safe_autofix: false,
        config_path: globalConfigPath,
        repair: 'Set top-level project_root_markers to exactly one TOML array of strings, then start a fresh Codex session.',
      },
    };
  }
  const detectedProjectRoot = findProjectRoot(projectRoot, markerConfig.markers);
  const repoRoot = findRepoRootForTrust(projectRoot);
  const projectLayerDirs = projectCodexLayerDirs(projectRoot, markerConfig.markers);
  const layerTrustLevels = projectLayerDirs.map(layerCodexDir => projectTrustLevel(
    globalConfigContent,
    path.dirname(layerCodexDir),
    detectedProjectRoot,
    repoRoot,
  ));
  const projectTrust = layerTrustLevels[layerTrustLevels.length - 1] || 'unknown';
  const projectConfigReads = projectLayerDirs.map(readConfigLayer);
  const globalAuthorityIssue = scopeAuthorityIssue(globalCodexDir, templateRoles);
  if (globalAuthorityIssue) {
    return unsafeScopeAuthorityResult(globalCodexDir, 'global', globalAuthorityIssue);
  }
  {
    const unsafeProjectConfig = projectConfigReads.find((configRead, index) =>
      layerTrustLevels[index] === 'trusted' && !configRead.ok);
    if (unsafeProjectConfig) return unsafeConfigLayerResult(unsafeProjectConfig);
    for (let index = 0; index < projectLayerDirs.length; index++) {
      if (layerTrustLevels[index] !== 'trusted') continue;
      const layerCodexDir = projectLayerDirs[index];
      const issue = scopeAuthorityIssue(layerCodexDir, templateRoles);
      if (issue) return unsafeScopeAuthorityResult(layerCodexDir, 'project', issue);
    }
  }

  const projectLayers = projectLayerDirs.map((layerCodexDir, index) => {
    const configRead = projectConfigReads[index];
    // Codex ignores project config when trust is absent. Never follow or gate an
    // unsafe ignored layer; a safe ignored layer is parsed only to identify a
    // Kaola footprint that requires an explicit trust decision.
    const configContent = configRead.ok ? configRead.content : '';
    const layerScope = inspectScope({
      codexDir: layerCodexDir, templateRoles, templateEntries, templateContent,
      configContentOverride: configContent,
      inspectProfiles: layerTrustLevels[index] === 'trusted',
    });
    const layerAgentsDir = path.join(layerCodexDir, 'agents', 'kaola-workflow');
    const kaolaConflicts = layerScope.managedRoleConflictsOutside;
    let agentsFootprint = false;
    try {
      fs.lstatSync(layerAgentsDir);
      agentsFootprint = true;
    } catch (_) {}
    const footprint = agentsFootprint
      || layerScope.blockFound
      || layerScope.rolesInBlock.length > 0
      || kaolaConflicts.length > 0;
    return {
      codexDir: layerCodexDir,
      projectRoot: path.dirname(layerCodexDir),
      agentsDir: layerAgentsDir,
      scope: layerScope,
      kaolaConflicts,
      footprint,
      configContent,
      trust: layerTrustLevels[index],
    };
  });
  const ignoredKaolaLayer = projectLayers.find(layer =>
    layer.footprint && layer.trust !== 'trusted');
  if (ignoredKaolaLayer) {
    return projectTrustRequiredResult(ignoredKaolaLayer.projectRoot, ignoredKaolaLayer.trust);
  }
  const loadedProjectLayers = projectLayers.filter(layer => layer.trust === 'trusted');
  const overrideLayers = loadedProjectLayers.filter(layer => layer.footprint);
  const selectedLayer = overrideLayers.find(layer => layer.kaolaConflicts.length > 0)
    || overrideLayers.find(layer => !scopeProfilesFresh(layer.scope))
    || overrideLayers[overrideLayers.length - 1]
    || loadedProjectLayers[loadedProjectLayers.length - 1]
    || projectLayers[projectLayers.length - 1];
  activeProjectRoot = selectedLayer.projectRoot;
  codexDir = selectedLayer.codexDir;
  agentsDir = selectedLayer.agentsDir;

  const rawGlobalScope = inspectScope({
    codexDir: globalCodexDir, templateRoles, templateEntries, templateContent,
  });
  const effectiveRuntime = deriveEffectiveRuntime([
    { content: globalConfigContent, configPath: globalConfigPath },
    ...loadedProjectLayers.map(layer => ({
      content: layer.configContent,
      configPath: path.join(layer.codexDir, 'config.toml'),
    })),
  ]);
  const projectKaolaOverridePresent = overrideLayers.length > 0;
  const activeInstallGlobal = !projectKaolaOverridePresent;
  if (activeInstallGlobal) {
    activeProjectRoot = null;
    codexDir = globalCodexDir;
    agentsDir = path.join(globalCodexDir, 'agents', 'kaola-workflow');
  }
  const scope = {
    ...(activeInstallGlobal ? rawGlobalScope : selectedLayer.scope),
    ...effectiveRuntime,
  };
  const globalScope = { ...rawGlobalScope, ...effectiveRuntime };

  if (effectiveRuntime.codex_v2_role_transport_ready === false) {
    return unsafeCodexV2Transport(
      scope, 'effective', codexDir, effectiveRuntime.transport_config_path,
    );
  }

  // Any managed-role collision in a loaded project layer is unsafe; a higher
  // fresh layer does not authorize silently rewriting a lower user block.
  // Unrelated project-local agent declarations remain user-owned and valid.
  const conflictingLayer = overrideLayers.find(layer => layer.kaolaConflicts.length > 0);
  if (conflictingLayer) {
    const conflictScope = { ...conflictingLayer.scope, ...effectiveRuntime };
    const conflictingRoles = conflictingLayer.kaolaConflicts;
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        stale: true,
        conflicting_roles_outside_markers: conflictingRoles,
        extra_unmanaged: conflictScope.extraUnmanaged,
        repair: `Remove or migrate the hand-authored [agents.*] entries outside the managed block markers in ${path.join(conflictingLayer.codexDir, 'config.toml')}, then re-run install-codex-agent-profiles.js.`,
        safe_autofix: false,
        dispatch_mode: conflictScope.dispatch_mode,
        multi_agent_v2_enabled: conflictScope.multi_agent_v2_enabled,
        ...codexV2TransportEnvelope(conflictScope),
        dispatch_posture: conflictScope.dispatch_posture,
        model_reasoning_effort: conflictScope.model_reasoning_effort,
        multi_agent_enabled: conflictScope.multi_agent_enabled,
        dispatch_posture_warning: conflictScope.dispatch_posture_warning,
        max_concurrent_threads_per_session: conflictScope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: conflictScope.max_concurrent_threads_per_session_source,
        effective_subagent_width: conflictScope.effective_subagent_width,
        min_wait_timeout_ms: conflictScope.min_wait_timeout_ms,
        max_wait_timeout_ms: conflictScope.max_wait_timeout_ms,
        default_wait_timeout_ms: conflictScope.default_wait_timeout_ms,
      },
    };
  }

  // The global layer is always loaded. A hand-authored declaration outside the
  // managed markers can therefore override a managed Kaola role even when a
  // project layer supplies otherwise-fresh profiles. Preserve unrelated user
  // roles, but fail closed for wildcard, exact, and nested Kaola collisions.
  const globalKaolaConflicts = rawGlobalScope.managedRoleConflictsOutside;
  if (globalKaolaConflicts.length > 0) {
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        stale: true,
        conflicting_roles_outside_markers: globalKaolaConflicts,
        extra_unmanaged: globalScope.extraUnmanaged,
        repair: `Remove or migrate the hand-authored [agents.*] entries outside the managed block markers in ${globalConfigPath}, then re-run install-codex-agent-profiles.js.`,
        safe_autofix: false,
        dispatch_mode: globalScope.dispatch_mode,
        multi_agent_v2_enabled: globalScope.multi_agent_v2_enabled,
        ...codexV2TransportEnvelope(globalScope),
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

  if (!projectKaolaOverridePresent && scopeProfilesFresh(rawGlobalScope)) {
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
        ...codexV2TransportEnvelope(globalScope),
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

  // --- Unsupported (future) manifest schema is NOT autofixable ---
  if (scope.manifest === 'unsupported') {
    return unsupportedManifestResult({
      scope,
      agentsDir,
      scriptDir: sourceScriptDir,
      projectRoot: activeProjectRoot,
      globalInstall: activeInstallGlobal,
      scopeName: activeInstallGlobal ? 'global' : activeProjectRoot,
    });
  }

  // --- Delegated plan roles: union members not in the template profile dir (missing-only) ---
  const { missingRoles: missingPlanProfiles } = checkProfiles(agentsDir, delegatedPlanRoles);
  const missingProfiles = [...new Set([...scope.missingProfiles, ...missingPlanProfiles])];
  const missingFromBlock = requiredRoles.filter(r => !scope.rolesInBlock.includes(r));

  const installerForRepair = findInstaller(sourceScriptDir);
  const repairCmd = installerForRepair
    ? `node ${installerForRepair} ${activeInstallGlobal ? '--global' : activeProjectRoot}`
    : 'install-codex-agent-profiles.js not found alongside this script.';

  // --- Priority-ordered staleness classification ---
  // profiles_malformed / profiles_stale / profiles_missing / config_stale outrank
  // managed_block_stale so the existing #266 fixtures keep their statuses.
  const blockMissing = !scope.blockFound;
  const malformedFirst = scope.malformed.length > 0;
  const legacyPinsPresent = scope.legacyPinnedProfiles.length > 0;
  const profileDriftPresent = scope.staleProfiles.length > 0
    || (scope.manifest !== 'present' && scope.missingProfiles.length === 0 && scope.blockFound);
  const staleFilesPresent = scope.staleFiles.length > 0;
  const profilesMissing = missingProfiles.length > 0;
  const configStale = blockMissing || scope.managedBlockDrift || missingFromBlock.length > 0;
  const onlyBlockRolesStale = scope.staleRolesInBlock.length > 0;

  const isStale = malformedFirst || legacyPinsPresent || profileDriftPresent || staleFilesPresent || profilesMissing || configStale || onlyBlockRolesStale;

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
        ...codexV2TransportEnvelope(scope),
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
        ...codexV2TransportEnvelope(scope),
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
    if (legacyPinsPresent) {
      return {
        status: 'profiles_stale',
        stale_profiles: scope.legacyPinnedProfiles,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        ...codexV2TransportEnvelope(scope),
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
    if (profileDriftPresent) {
      return {
        status: 'profiles_stale',
        stale_profiles: scope.staleProfiles,
        manifest: scope.manifest,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
        dispatch_mode: scope.dispatch_mode,
        multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
        ...codexV2TransportEnvelope(scope),
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
        ...codexV2TransportEnvelope(scope),
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
        ...codexV2TransportEnvelope(scope),
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
        ...codexV2TransportEnvelope(scope),
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
      ...codexV2TransportEnvelope(scope),
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
  const installerPath = installerForRepair;
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
        ...codexV2TransportEnvelope(scope),
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

  // Every trusted project layer with a Kaola footprint participates in Codex's
  // loaded authority. Repair every stale footprint from repository root to cwd;
  // fixing only the first one can leave a higher stale layer active while the
  // gate incorrectly reports success.
  const repairTargets = activeInstallGlobal
    ? [{
      projectRoot: null,
      globalInstall: true,
      label: 'global',
      codexDir: globalCodexDir,
      agentsDir: path.join(globalCodexDir, 'agents', 'kaola-workflow'),
      configContent: globalConfigContent,
      scope: rawGlobalScope,
    }]
    : overrideLayers
      .filter(layer => !scopeProfilesFresh(layer.scope))
      .map(layer => ({
        projectRoot: layer.projectRoot,
        globalInstall: false,
        label: layer.projectRoot,
        codexDir: layer.codexDir,
        agentsDir: layer.agentsDir,
        configContent: layer.configContent,
        scope: layer.scope,
      }));
  if (repairTargets.length === 0) {
    const fallbackLayer = activeInstallGlobal ? null : selectedLayer;
    repairTargets.push({
      projectRoot: activeProjectRoot,
      globalInstall: activeInstallGlobal,
      label: activeInstallGlobal ? 'global' : activeProjectRoot,
      codexDir: activeInstallGlobal ? globalCodexDir : fallbackLayer.codexDir,
      agentsDir: activeInstallGlobal
        ? path.join(globalCodexDir, 'agents', 'kaola-workflow')
        : fallbackLayer.agentsDir,
      configContent: activeInstallGlobal ? globalConfigContent : fallbackLayer.configContent,
      scope: activeInstallGlobal ? rawGlobalScope : fallbackLayer.scope,
    });
  }

  // Prove every target is repairable before the first installer subprocess can
  // mutate anything. A later future manifest or ambiguous marker range is a
  // manual/upgrade repair, not permission to partially update earlier layers.
  const unsupportedTarget = repairTargets.find(target => target.scope.manifest === 'unsupported');
  if (unsupportedTarget) {
    return unsupportedManifestResult({
      scope: { ...unsupportedTarget.scope, ...effectiveRuntime },
      agentsDir: unsupportedTarget.agentsDir,
      scriptDir: sourceScriptDir,
      projectRoot: unsupportedTarget.projectRoot,
      globalInstall: unsupportedTarget.globalInstall,
      scopeName: unsupportedTarget.label,
    });
  }
  const ambiguousTarget = repairTargets.find(target =>
    managedMarkerRange(target.configContent).state === 'invalid');
  if (ambiguousTarget) {
    const targetScope = { ...ambiguousTarget.scope, ...effectiveRuntime };
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        scope: ambiguousTarget.label,
        stale: true,
        safe_autofix: false,
        config_path: path.join(ambiguousTarget.codexDir, 'config.toml'),
        extra_unmanaged: targetScope.extraUnmanaged,
        repair: `Repair the ambiguous kaola-workflow managed block markers in ${path.join(ambiguousTarget.codexDir, 'config.toml')} before reinstalling any loaded layer.`,
        dispatch_mode: targetScope.dispatch_mode,
        multi_agent_v2_enabled: targetScope.multi_agent_v2_enabled,
        ...codexV2TransportEnvelope(targetScope),
        dispatch_posture: targetScope.dispatch_posture,
        model_reasoning_effort: targetScope.model_reasoning_effort,
        multi_agent_enabled: targetScope.multi_agent_enabled,
        dispatch_posture_warning: targetScope.dispatch_posture_warning,
        max_concurrent_threads_per_session: targetScope.max_concurrent_threads_per_session,
        max_concurrent_threads_per_session_source: targetScope.max_concurrent_threads_per_session_source,
        effective_subagent_width: targetScope.effective_subagent_width,
        min_wait_timeout_ms: targetScope.min_wait_timeout_ms,
        max_wait_timeout_ms: targetScope.max_wait_timeout_ms,
        default_wait_timeout_ms: targetScope.default_wait_timeout_ms,
      },
    };
  }
  for (const target of repairTargets) {
    const repairRun = runInstaller(
      installerPath, target.projectRoot, target.globalInstall, homeDir,
    );
    if (!repairRun.success) {
      return {
        exitCode: 5,
        result: {
          status: 'installer_failed',
          scope: target.label,
          extra_unmanaged: scope.extraUnmanaged,
          stale: true,
          repair: `Installer error for ${target.label}: ${repairRun.stderr}`,
          safe_autofix: false,
          dispatch_mode: scope.dispatch_mode,
          multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
          ...codexV2TransportEnvelope(scope),
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
  }

  // Re-enter the complete read-only gate so root markers, per-layer trust,
  // authority paths, conflicts, every trusted loaded profile set, and the
  // effective runtime overlay are all rediscovered from persisted bytes.
  const verified = runPreflight({
    ...opts,
    noAutofix: true,
  });
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
    },
  };
}

// ---------------------------------------------------------------------------
// #332 doctor mode — READ-ONLY multi-scope reporting. Never runs the installer.
// Scopes: user (<home>/.codex), project (<projectRoot>/.codex), plugin_cache
// (cached source profiles, exact-byte + schema proof, read-only but gate-affecting).
// ---------------------------------------------------------------------------
function scopeIsStale(s) {
  return s.exists && (
    s.malformed.length > 0 ||
    s.legacyPinnedProfiles.length > 0 ||
    s.staleProfiles.length > 0 ||
    s.staleFiles.length > 0 ||
    s.missingProfiles.length > 0 ||
    !s.blockFound ||
    s.managedBlockDrift ||
    s.missingFromBlock.length > 0 ||
    s.staleRolesInBlock.length > 0 ||
    s.managedRoleConflictsOutside.length > 0 ||
    s.manifest !== 'present' ||
    s.codex_v2_role_transport_ready === false
  );
}

// Profile/config provenance only. Runtime transport is derived from the merged
// layer stack, so an unsafe lower transport field can be safely overridden by a
// complete higher layer without making otherwise-canonical global profiles stale.
function scopeProfilesFresh(s) {
  return s.exists
    && s.malformed.length === 0
    && s.legacyPinnedProfiles.length === 0
    && s.staleProfiles.length === 0
    && s.staleFiles.length === 0
    && s.missingProfiles.length === 0
    && s.blockFound
    && !s.managedBlockDrift
    && s.missingFromBlock.length === 0
    && s.staleRolesInBlock.length === 0
    && s.managedRoleConflictsOutside.length === 0
    && s.manifest === 'present';
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
    managed_block_drift: scope.managedBlockDrift,
    profiles: scope.rolesInBlock,
    missing_roles: scope.missingProfiles,
    missing_from_block: scope.missingFromBlock,
    malformed: scope.malformed,
    stale_profiles: [...scope.legacyPinnedProfiles, ...scope.staleProfiles],
    profile_byte_drift: scope.staleProfiles,
    stale_files: scope.staleFiles,
    stale_roles_in_block: scope.staleRolesInBlock,
    conflicting_roles_outside: scope.conflictingRolesOutside,
    managed_role_conflicts_outside: scope.managedRoleConflictsOutside,
    extra_unmanaged: scope.extraUnmanaged,
    manifest: scope.manifest,
    dispatch_mode: scope.dispatch_mode,
    multi_agent_v2_enabled: scope.multi_agent_v2_enabled,
    ...codexV2TransportEnvelope(scope),
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
    effective_config_paths: scope.effective_config_paths || [],
    transport_config_path: scope.transport_config_path || null,
    read_only: !!readOnly,
    repair: scope.codex_v2_role_transport_ready === false
      ? (scope.codex_v2_direct_transport_ready === false
        ? CODEX_V2_DIRECT_TRANSPORT_NOTE
        : CODEX_V2_ROLE_TRANSPORT_NOTE)
      : repair,
  };
}

function readPluginIdentity(scriptDir, home) {
  const pluginRoot = path.resolve(scriptDir, '..');
  const manifestDir = path.join(pluginRoot, '.codex-plugin');
  const manifestPath = path.join(manifestDir, 'plugin.json');
  const cacheRoot = path.resolve(home, '.codex', 'plugins', 'cache');
  const relativeRoot = path.relative(cacheRoot, pluginRoot);
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
    const configDir = path.join(pluginRoot, 'config');
    const configPath = path.join(configDir, 'agents.toml');
    const configDirIssue = cachePathIssue(configDir, 'plugin_config_path');
    if (configDirIssue) return { identity: null, error: configDirIssue, manifestPath };
    const configFileIssue = cacheFileIssue(configPath, 'plugin_config_path');
    if (configFileIssue) return { identity: null, error: configFileIssue, manifestPath };
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

function cacheFileIssue(target, label) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    return error && error.code === 'ENOENT'
      ? `${label}_missing: ${target}`
      : `${label}_unsafe: cannot inspect ${target}: ${error.message}`;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return `${label}_unsafe: ${target} must be a regular non-symlink file`;
  }
  return null;
}

function pathEntryInspection(target, label) {
  try {
    fs.lstatSync(target);
    return { exists: true, issue: null };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false, issue: null };
    return {
      exists: false,
      issue: `${label}_unsafe: cannot inspect ${target}: ${error.message}`,
    };
  }
}

function pluginCacheRootComponents(home) {
  const codexRoot = path.join(home, '.codex');
  const pluginsRoot = path.join(codexRoot, 'plugins');
  return [codexRoot, pluginsRoot, path.join(pluginsRoot, 'cache')];
}

// Find only this installed plugin's exact name/version cache under
// <home>/.codex/plugins/cache. Other plugins and old versions are not part of
// this preflight's authority and must not affect its result.
function findPluginCacheAgentDirs(home, identity) {
  const cacheRoot = path.join(home, '.codex', 'plugins', 'cache');
  const out = [];
  const cacheEntry = pathEntryInspection(cacheRoot, 'plugin_cache_path');
  if (cacheEntry.issue) {
    return [{
      dir: cacheRoot,
      plugin: identity.name,
      marketplace: null,
      version: identity.version,
      manifestPath: null,
      reasons: [cacheEntry.issue],
    }];
  }
  if (!cacheEntry.exists) return out;
  const rootIssue = pluginCacheRootComponents(home)
    .map(component => cachePathIssue(component, 'plugin_cache_path'))
    .find(Boolean) || null;
  if (rootIssue) {
    return [{
      dir: cacheRoot,
      plugin: identity.name,
      marketplace: null,
      version: identity.version,
      manifestPath: null,
      reasons: [rootIssue],
    }];
  }
  let marketplaces = [];
  try {
    marketplaces = fs.readdirSync(cacheRoot);
  } catch (error) {
    return [{
      dir: cacheRoot,
      plugin: identity.name,
      marketplace: null,
      version: identity.version,
      manifestPath: null,
      reasons: [`plugin_cache_path_unsafe: cannot list ${cacheRoot}: ${error.message}`],
    }];
  }
  for (const mk of marketplaces) {
    const mkDir = path.join(cacheRoot, mk);
    const mkIssue = cachePathIssue(mkDir, 'plugin_cache_path');
    if (mkIssue) {
      out.push({
        dir: mkDir,
        plugin: identity.name,
        marketplace: mk,
        version: identity.version,
        manifestPath: null,
        reasons: [mkIssue],
      });
      continue;
    }
    const pluginDir = path.join(mkDir, identity.name);
    const pluginEntry = pathEntryInspection(pluginDir, 'plugin_cache_path');
    if (pluginEntry.issue) {
      out.push({
        dir: pluginDir,
        plugin: identity.name,
        marketplace: mk,
        version: identity.version,
        manifestPath: null,
        reasons: [pluginEntry.issue],
      });
      continue;
    }
    if (!pluginEntry.exists) continue;
    const reasons = [];
    const pluginIssue = cachePathIssue(pluginDir, 'plugin_cache_path');
    if (pluginIssue) reasons.push(pluginIssue);
    const versionDir = path.join(pluginDir, identity.version);
    const versionEntry = pluginIssue
      ? { exists: false, issue: null }
      : pathEntryInspection(versionDir, 'plugin_cache_path');
    if (versionEntry.issue) {
      reasons.push(versionEntry.issue);
    } else if (!pluginIssue && !versionEntry.exists) {
      continue;
    }
    const versionIssue = (pluginIssue || versionEntry.issue)
      ? null
      : cachePathIssue(versionDir, 'plugin_cache_path');
    if (versionIssue) reasons.push(versionIssue);
    const agentsDir = path.join(versionDir, 'agents');
    const configDir = path.join(versionDir, 'config');
    const configPath = path.join(configDir, 'agents.toml');
    const manifestDir = path.join(versionDir, '.codex-plugin');
    const manifestPath = path.join(manifestDir, 'plugin.json');
    if (reasons.length === 0) {
      const agentsIssue = cachePathIssue(agentsDir, 'plugin_cache_agents_path');
      if (agentsIssue) reasons.push(agentsIssue);
      const configDirIssue = cachePathIssue(configDir, 'plugin_config_path');
      if (configDirIssue) reasons.push(configDirIssue);
      if (!configDirIssue) {
        const configFileIssue = cacheFileIssue(configPath, 'plugin_config_path');
        if (configFileIssue) reasons.push(configFileIssue);
      }
      const manifestDirIssue = cachePathIssue(manifestDir, 'plugin_manifest_path');
      if (manifestDirIssue) reasons.push(manifestDirIssue);
      if (!manifestDirIssue) {
        let manifestStat;
        try { manifestStat = fs.lstatSync(manifestPath); } catch (error) {
          reasons.push(`plugin_manifest_unsafe: cannot inspect ${manifestPath}: ${error.message}`);
        }
        if (manifestStat && (manifestStat.isSymbolicLink() || !manifestStat.isFile())) {
          reasons.push(`plugin_manifest_unsafe: ${manifestPath} must be a regular non-symlink file`);
        }
      }
    }
    if (reasons.length === 0) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.name !== identity.name) {
          reasons.push(`plugin_manifest_name_mismatch: expected=${identity.name} got=${String(manifest.name)}`);
        }
        if (manifest.version !== identity.version) {
          reasons.push(`plugin_manifest_version_mismatch: expected=${identity.version} got=${String(manifest.version)}`);
        }
      } catch (error) {
        reasons.push(`plugin_manifest_invalid: cannot parse ${manifestPath}: ${error.message}`);
      }
    }
    out.push({
      dir: agentsDir,
      plugin: identity.name,
      marketplace: mk,
      version: identity.version,
      configPath,
      manifestPath,
      reasons,
    });
  }
  return out;
}

function runDoctor(opts) {
  const { projectRoot, home, scriptDir } = opts;
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
  const pluginIdentity = pluginIdentityRead.identity;
  const template = readTemplateRoles(sourceScriptDir);
  const { roles: templateRoles, entries: templateEntries, content: templateContent,
    error: templateError, sourceErrors = [] } = template;

  if (templateError) {
    return {
      exitCode: 2,
      result: { status: 'template_missing', error: templateError, scopes: [] },
    };
  }

  const scopes = [];

  scopes.push({
    scope: 'repository',
    codex_dir: path.join(sourceScriptDir, '..', 'agents'),
    exists: true,
    managed_block: 'n/a',
    managed_block_drift: false,
    profiles: templateRoles,
    missing_roles: [],
    missing_from_block: [],
    malformed: sourceErrors,
    stale_profiles: [],
    profile_byte_drift: [],
    stale_files: [],
    stale_roles_in_block: [],
    conflicting_roles_outside: [],
    extra_unmanaged: [],
    manifest: 'n/a',
    read_only: true,
    repair: repositoryRepairCommand(sourceScriptDir),
  });

  // User + every project layer share the same persisted-config overlay as the
  // normal gate. Refuse unsafe config paths without following them.
  const userCodex = path.join(home, '.codex');
  const userConfig = readConfigLayer(userCodex);
  const markerConfig = userConfig.ok
    ? parseProjectRootMarkers(userConfig.content)
    : { valid: true, markers: ['.git'] };
  if (!markerConfig.valid) {
    scopes.push({
      scope: 'user', codex_dir: userCodex, config_path: userConfig.configPath,
      exists: true, project_root_markers_invalid: true,
      managed_block: 'n/a', managed_block_drift: false,
      profiles: [], missing_roles: [], missing_from_block: [], malformed: [],
      stale_profiles: [], profile_byte_drift: [], stale_files: [],
      stale_roles_in_block: [], conflicting_roles_outside: [], extra_unmanaged: [],
      manifest: 'n/a', read_only: true,
      repair: 'Set top-level project_root_markers to exactly one TOML array of strings.',
    });
    return { exitCode: 1, result: { status: 'stale', scopes } };
  }
  const detectedProjectRoot = findProjectRoot(projectRoot, markerConfig.markers);
  const repoRoot = findRepoRootForTrust(projectRoot);
  const projectDirs = projectCodexLayerDirs(projectRoot, markerConfig.markers);
  const projectConfigs = projectDirs.map(readConfigLayer);
  const layerTrustLevels = projectDirs.map(projectCodex => userConfig.ok
    ? projectTrustLevel(
      userConfig.content,
      path.dirname(projectCodex),
      detectedProjectRoot,
      repoRoot,
    )
    : 'unknown');
  const projectTrust = layerTrustLevels[layerTrustLevels.length - 1] || 'unknown';
  // Project config is not part of Codex's runtime authority until the project is
  // trusted. Unsafe ignored paths are reported as ignored, not followed or gated.
  const unsafeConfigs = [userConfig,
    ...projectConfigs.filter((configRead, index) => layerTrustLevels[index] === 'trusted')]
    .filter(configRead => !configRead.ok);
  for (const unsafe of unsafeConfigs) {
    scopes.push({
      scope: unsafe === userConfig ? 'user' : 'project_layer',
      codex_dir: path.dirname(unsafe.configPath),
      config_path: unsafe.configPath,
      exists: true,
      config_layer_unsafe: true,
      error: unsafe.error,
      managed_block: 'n/a',
      managed_block_drift: false,
      profiles: [], missing_roles: [], missing_from_block: [], malformed: [],
      stale_profiles: [], profile_byte_drift: [], stale_files: [],
      stale_roles_in_block: [], conflicting_roles_outside: [], extra_unmanaged: [],
      manifest: 'n/a', read_only: true,
      repair: unsafeConfigLayerResult(unsafe).result.repair,
    });
  }
  if (unsafeConfigs.length > 0) {
    return { exitCode: 1, result: { status: 'stale', scopes } };
  }

  const authorityChecks = [
    { codexDir: userCodex, scope: 'user' },
    ...projectDirs.filter((_, index) => layerTrustLevels[index] === 'trusted')
      .map(codexDir => ({ codexDir, scope: 'project_layer' })),
  ];
  const authorityIssues = authorityChecks.map(check => ({
    ...check,
    issue: scopeAuthorityIssue(check.codexDir, templateRoles),
  })).filter(check => check.issue);
  for (const authority of authorityIssues) {
    scopes.push({
      scope: authority.scope,
      codex_dir: authority.codexDir,
      exists: true,
      scope_authority_unsafe: true,
      authority_path: authority.issue.path,
      error: authority.issue.error,
      managed_block: 'n/a', managed_block_drift: false,
      profiles: [], missing_roles: [], missing_from_block: [], malformed: [],
      stale_profiles: [], profile_byte_drift: [], stale_files: [],
      stale_roles_in_block: [], conflicting_roles_outside: [], extra_unmanaged: [],
      manifest: 'n/a', read_only: true,
      repair: unsafeScopeAuthorityResult(
        authority.codexDir, authority.scope, authority.issue,
      ).result.repair,
    });
  }
  if (authorityIssues.length > 0) {
    return {
      exitCode: 1,
      result: {
        status: 'stale',
        scope_authority_unsafe: true,
        project_trust: projectTrust,
        scopes,
      },
    };
  }

  const effectiveRuntime = deriveEffectiveRuntime([
    ...(userConfig.ok ? [{ content: userConfig.content, configPath: userConfig.configPath }] : []),
    ...projectConfigs
      .filter((configRead, index) => configRead.ok && layerTrustLevels[index] === 'trusted')
      .map(configRead => ({
      content: configRead.content, configPath: configRead.configPath,
      })),
  ]);

  const userScopeRaw = inspectScope({
    codexDir: userCodex, templateRoles, templateEntries, templateContent,
    configContentOverride: userConfig.content,
  });
  const userScope = { ...userScopeRaw, ...effectiveRuntime };
  const userReport = scopeReport(
    userScope, 'user', userCodex,
    `node ${path.join(sourceScriptDir, 'install-codex-agent-profiles.js')} ${home}`,
    false,
  );
  const userKaolaConflicts = userScopeRaw.managedRoleConflictsOutside;
  userReport.kaola_footprint = fs.existsSync(path.join(userCodex, 'agents', 'kaola-workflow'))
    || userScope.blockFound || userScope.rolesInBlock.length > 0
    || userKaolaConflicts.length > 0;
  userReport.kaola_state = userReport.kaola_footprint ? 'configured' : 'not_installed';
  scopes.push(userReport);

  const projectScopes = [];
  for (let index = 0; index < projectDirs.length; index += 1) {
    const projectCodex = projectDirs[index];
    const raw = inspectScope({
      codexDir: projectCodex, templateRoles, templateEntries, templateContent,
      configContentOverride: projectConfigs[index].ok ? projectConfigs[index].content : '',
      inspectProfiles: layerTrustLevels[index] === 'trusted',
    });
    const scope = { ...raw, ...effectiveRuntime };
    const kaolaConflicts = raw.managedRoleConflictsOutside;
    let agentsFootprint = false;
    try {
      fs.lstatSync(path.join(projectCodex, 'agents', 'kaola-workflow'));
      agentsFootprint = true;
    } catch (_) {}
    const footprint = agentsFootprint
      || raw.blockFound || raw.rolesInBlock.length > 0 || kaolaConflicts.length > 0;
    const name = index === projectDirs.length - 1 ? 'project' : 'project_layer';
    const report = scopeReport(
      scope, name, projectCodex,
      `node ${path.join(sourceScriptDir, 'install-codex-agent-profiles.js')} ${path.dirname(projectCodex)}`,
      false,
    );
    report.kaola_footprint = footprint;
    report.kaola_state = footprint ? 'configured' : 'not_installed';
    report.project_trust = layerTrustLevels[index];
    report.config_layer_ignored = layerTrustLevels[index] !== 'trusted';
    if (!projectConfigs[index].ok && layerTrustLevels[index] !== 'trusted') {
      report.ignored_config_error = projectConfigs[index].error;
    }
    scopes.push(report);
    projectScopes.push({ scope, footprint, trust: layerTrustLevels[index] });
  }

  // plugin_cache scope(s) — exact-byte + schema proof, read-only but gate-affecting.
  for (const c of findPluginCacheAgentDirs(home, pluginIdentity)) {
    const malformed = c.reasons.length > 0
      ? [{ role: 'plugin-cache', file: c.manifestPath || c.dir, reasons: [...c.reasons] }]
      : [];
    const staleProfiles = [];
    const staleFiles = [];
    const missingRoles = [];
    let names = [];
    if (c.reasons.length === 0) {
      try {
        names = fs.readdirSync(c.dir);
      } catch (error) {
        malformed.push({
          role: 'plugin-cache',
          file: c.dir,
          reasons: [`plugin_cache_agents_path_unsafe: cannot list ${c.dir}: ${error.message}`],
        });
      }
      const expectedByFile = new Map((templateEntries || []).map(entry => [entry.basename, entry]));
      for (const entry of (templateEntries || [])) {
        if (entry.basename && !names.includes(entry.basename)) missingRoles.push(entry.role);
      }
      let cachedConfig = null;
      try { cachedConfig = fs.readFileSync(c.configPath); } catch (error) {
        malformed.push({
          role: 'plugin-config',
          file: c.configPath,
          reasons: [`plugin_config_path_unsafe: cannot read ${c.configPath}: ${error.message}`],
        });
      }
      if (cachedConfig && !cachedConfig.equals(Buffer.from(templateContent, 'utf8'))) {
        malformed.push({
          role: 'plugin-config',
          file: c.configPath,
          reasons: ['plugin_config_bytes_mismatch: cached config/agents.toml differs from bundled source'],
        });
      }
      for (const name of names) {
        if (!name.endsWith('.toml')) continue;
        const expected = expectedByFile.get(name) || null;
        if (!expected) {
          staleFiles.push(name);
          continue;
        }
        const role = expected.role;
        const profilePath = path.join(c.dir, name);
        let profileStat;
        try { profileStat = fs.lstatSync(profilePath); } catch (error) {
          malformed.push({
            role,
            file: name,
            reasons: [`plugin_cache_profile_unsafe: cannot inspect ${profilePath}: ${error.message}`],
          });
          continue;
        }
        if (profileStat.isSymbolicLink() || !profileStat.isFile()) {
          malformed.push({
            role,
            file: name,
            reasons: [`plugin_cache_profile_unsafe: ${profilePath} must be a regular non-symlink file`],
          });
          continue;
        }
        let txt = '';
        try { txt = fs.readFileSync(profilePath, 'utf8'); } catch { txt = ''; }
        const reasons = validateProfileText(txt, role, expected);
        const sourceDrift = typeof expected.sourceText === 'string' && txt !== expected.sourceText;
        if (sourceDrift) {
          staleProfiles.push({ role, file: name, reasons: [
            'profile_bytes_mismatch: cached profile differs from bundled source', ...reasons,
          ] });
        } else if (reasons.length > 0) malformed.push({ role, file: name, reasons });
      }
    }
    malformed.sort((a, b) => a.role.localeCompare(b.role));
    staleProfiles.sort((a, b) => a.role.localeCompare(b.role));
    staleFiles.sort();
    missingRoles.sort();
    scopes.push({
      scope: 'plugin_cache',
      codex_dir: c.dir,
      marketplace: c.marketplace,
      plugin_name: c.plugin,
      plugin_version: c.version,
      config_path: c.configPath || null,
      plugin_manifest: c.manifestPath,
      exists: true,
      managed_block: 'n/a',
      managed_block_drift: false,
      profiles: [],
      missing_roles: missingRoles,
      missing_from_block: [],
      malformed,
      stale_profiles: staleProfiles,
      profile_byte_drift: staleProfiles,
      stale_files: staleFiles,
      stale_roles_in_block: [],
      conflicting_roles_outside: [],
      extra_unmanaged: [],
      manifest: c.reasons.length === 0 ? 'present' : 'invalid',
      dispatch_mode: 'n/a',
      multi_agent_v2_enabled: false,
      codex_v2_transport_mode: 'n/a',
      codex_v2_direct_transport_ready: null,
      codex_v2_tool_namespace: 'n/a',
      codex_v2_role_metadata_visible: null,
      codex_v2_role_transport_ready: null,
      codex_v2_transport_warning: null,
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
      repair: c.marketplace
        ? `codex plugin remove ${c.plugin}@${c.marketplace} && codex plugin add ${c.plugin}@${c.marketplace}  # refresh plugin cache`
        : `Replace ${c.dir} with a regular non-symlink plugin cache directory, then refresh ${c.plugin}.`,
    });
  }

  const pluginCacheStale = scopes.some(scope => scope.scope === 'plugin_cache'
    && (scope.malformed.length > 0 || scope.stale_profiles.length > 0
      || scope.missing_roles.length > 0 || scope.stale_files.length > 0));
  const effectiveTransportUnsafe = effectiveRuntime.codex_v2_role_transport_ready === false;
  const projectStale = projectScopes.some(item =>
    item.trust === 'trusted' && item.footprint && scopeIsStale(item.scope));
  const projectTrustRequired = projectScopes.some(item =>
    item.trust !== 'trusted' && item.footprint);
  const gating = sourceErrors.length > 0
    || unsafeConfigs.length > 0
    || (userReport.kaola_footprint && scopeIsStale(userScope))
    || projectStale
    || projectTrustRequired
    || effectiveTransportUnsafe
    || pluginCacheStale;
  return {
    exitCode: gating ? 1 : 0,
    result: {
      status: gating ? 'stale' : 'ok',
      project_trust: projectTrust,
      project_trust_required: projectTrustRequired,
      scopes,
    },
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
        const stale = s.kaola_footprint === false
          ? false
          : s.scope === 'repository'
          ? s.malformed.length > 0
          : (s.scope === 'plugin_cache'
            ? (s.malformed.length > 0 || s.stale_profiles.length > 0
              || s.missing_roles.length > 0 || s.stale_files.length > 0)
            : (s.exists && (s.malformed.length || s.profile_byte_drift.length || s.stale_files.length || s.missing_roles.length || s.managed_block === 'absent' || s.managed_block_drift || s.missing_from_block.length || s.stale_roles_in_block.length || (s.managed_role_conflicts_outside || []).length || s.manifest !== 'present' || s.codex_v2_role_transport_ready === false)));
        const state = s.kaola_footprint === false
          ? 'not-installed'
          : (!s.exists ? 'absent' : (stale ? 'stale' : 'ok'));
        process.stdout.write(`${s.scope}: ${state} (${s.codex_dir})\n`);
        if (stale) process.stdout.write(`  repair: ${s.repair}\n`);
        if (s.codex_v2_transport_warning) process.stdout.write(`  transport: ${s.codex_v2_transport_warning}\n`);
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
  reviewerProfileContract,
  classifyProfilePinPosture,
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
  REVIEWER_ROLES,
  REVIEWER_BEHAVIOR_CONTRACT_VERSION,
  REVIEWER_SOURCE_REPAIR,
  // #598: effort-gated dispatch-posture derivation (pure; exported for unit tests).
  detectCodexDispatchMode,
  codexV2TransportEnvelope,
  CODEX_V2_TRANSPORT_UNSAFE_STATUS,
  CODEX_V2_DIRECT_TRANSPORT_NOTE,
  CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS,
  CODEX_V2_ROLE_TOOL_NAMESPACE,
  CODEX_V2_ROLE_TRANSPORT_NOTE,
  deriveDispatchPosture,
  parseFeaturesMultiAgentEnabled,
  parseTopLevelModelReasoningEffort,
  dispatchPostureRemediation,
  DISPATCH_POSTURE_VERSION_NOTE,
  // #611: MultiAgentV2 concurrency + wait-timeout bounds derivation (pure; exported for unit tests).
  parseMultiAgentV2NumericFields,
  deriveMultiAgentV2Bounds,
  parseRuntimeLayerOverrides,
  deriveEffectiveRuntime,
  OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION,
  MULTI_AGENT_V2_BOUNDS_NOTE,
};
