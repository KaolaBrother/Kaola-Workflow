#!/usr/bin/env node
'use strict';

// full-advance.js (#457) — the full-path phase transaction owner.
//
// Full-path phase transaction owner. Moves the full (6-phase) path's
// deterministic mechanical transitions out of the `contractor` subagent and
// into a typed transaction script, matching the adaptive path's direct
// script-owned route and the fast path's fast-advance.js (ADR 0004).
//
// The main session (orchestrator) still owns ALL judgment — research synthesis,
// approach selection, blueprint completeness, review verdict, severity triage.
// This script only authors the durable phase files from the verbatim content the
// orchestrator hands it and mutates workflow-state.md in crash-safe order,
// emitting typed JSON. It never dispatches a role, asks the user, judges
// severity, re-selects an approach, designs, or invents a write set.
//
// Scope: this script owns the phase 1/2/3/5 checkpoint + phase-file authoring.
//   - Phase 1: state checkpoint only — phase1-research.md is the orchestrator's
//     research synthesis (already on disk; NOT authored here). The per-issue
//     roadmap init-issue + git add stays in the command prose (a direct
//     `node ... init-issue` call against the roadmap script, which resolves to
//     the forge-correct name per edition).
//   - Phase 2/3/5: author the phase file from the orchestrator's verbatim packet,
//     then advance the state pointer.
// Phase 4 (the per-task execute loop + failure ledger) is owned by the separate
// phase4-advance.js transaction (#458).
//
// EDITION SHAPE: command and skill route names (the phase / research / ideation /
// plan / execute / finalize commands+skills) are assembled from the split constant
// KW below so the dumb rename-normalizer in validate-script-sync.js (which rewrites
// every contiguous `kaola-workflow-<n>` token to `kaola-<forge>-workflow-<n>`)
// cannot mangle them — commands and skills keep their name across editions. The
// ONLY contiguous `kaola-workflow-<n>` token is the `require` of the same-edition
// repair-state (for self-validation), which rename-normalizes correctly: the codex
// copy is byte-identical to canonical, and the gitlab/gitea ports carry
// `kaola-<forge>-workflow-repair-state.js`. So this script is rename-normalized per
// edition (like the adaptive aggregators), not KW-split byte-identical.
//
// Subcommands (all require --project <P> and --json):
//   orient                          read-only; reports derived full-path step
//   phase1-complete                 phase 1 -> step:complete checkpoint
//   phase2-finalize --stdin         author phase2-ideation.md + checkpoint
//   phase3-finalize --stdin         author phase3-plan.md + checkpoint
//   phase5-finalize --stdin         author phase5-review.md + checkpoint
//   phase5-verify                   read-only point-of-use Finalization gate

const fs = require('fs');
const path = require('path');
// Self-validation against the REAL phase-boundary gate. This require is the ONE
// contiguous `kaola-workflow-<name>` token in the file, so full-advance.js is
// rename-normalized per edition (like the adaptive aggregators) rather than
// KW-split byte-identical: the require resolves to the same-edition repair-state
// (the forge ports carry `kaola-<forge>-workflow-repair-state.js`). Command and
// skill ROUTE names below stay KW-split so they keep their un-prefixed names
// across editions. Reusing the real gate (instead of duplicating its compliance
// vocabulary) keeps the script and the resume/finalize router in lockstep.
const repair = require('./kaola-workflow-repair-state.js');

// Forge-neutral command/skill prefix. Split so renameNormalize cannot see a
// contiguous `kaola-workflow-` token (see header note). Runtime value is the
// edition-independent `kaola-workflow-`.
const KW = 'kaola' + '-workflow-';

// delegation_policy -> the compliance status the repair-state delegation
// cross-check accepts for an ACTIVE delegation-controlled row under that policy.
// Used only for the default rows when the orchestrator omits compliance; explicit
// orchestrator rows are transcribed verbatim and then self-validated. Absent/other
// policy -> plain `invoked` (the cross-check is inert when no policy is set).
const POLICY_ACTIVE_STATUS = {
  'delegate': 'subagent-invoked',
  'local-authorized': 'local-fallback-explicit',
  'tool-unavailable': 'local-fallback-tool-unavailable',
};
function defaultActiveStatus(stateContent) {
  const policy = stateField(stateContent, 'delegation_policy');
  return (policy && POLICY_ACTIVE_STATUS[policy]) ? POLICY_ACTIVE_STATUS[policy] : 'invoked';
}

const REVIEW_STATUSES = ['PASSED', 'PASSED WITH FOLLOW-UPS'];
const REVIEWER_INVOKED_STATUSES = new Set(['invoked', 'subagent-invoked']);
const FIX_EXECUTOR_RESOLVED_STATUSES = new Set([
  'invoked', 'subagent-invoked', 'local-fallback-explicit', 'local-fallback-tool-unavailable',
]);

// ---------------------------------------------------------------------------
// operator_hint registry — one actionable sentence per refusal reason (#445 style)
// ---------------------------------------------------------------------------
const OPERATOR_HINT_REGISTRY = {
  invalid_args: () => 'Bad arguments. Run the subcommand with --project <issue-N> --json (and --stdin where required).',
  invalid_project: () => 'The --project segment is reserved or unsafe (no /, \\, .., and never the literal kaola-workflow). Pass the issue project, e.g. issue-123.',
  unknown_subcommand: (ctx) => 'Unknown subcommand "' + (ctx.detail || '') + '". Use one of: orient, phase1-complete, phase2-finalize, phase3-finalize, phase5-finalize, phase5-verify.',
  state_missing: () => 'workflow-state.md is absent for this project. Claim/startup the project first (the full path checkpoints an already-claimed state).',
  research_missing: () => 'phase1-research.md is absent. Author the Phase 1 research synthesis on disk before running phase1-complete (this script never authors it).',
  progress_missing: () => 'phase4-progress.md is absent. Complete Phase 4 and author its task ledger before finalizing Phase 5.',
  progress_incomplete: () => 'phase4-progress.md does not contain a non-empty Tasks table whose every row is complete. Finish Phase 4 before finalizing Phase 5.',
  review_missing: () => 'phase5-review.md is absent. Run the Phase 5 review transaction before Finalization.',
  bad_packet: () => 'The --stdin packet was not parseable JSON. Pipe a single JSON object on stdin.',
  invalid_review_status: (ctx) => 'phase5-finalize requires review_status to be one of ' + REVIEW_STATUSES.join(' | ') + ' (got "' + (ctx.detail || '?') + '").',
  bad_compliance: (ctx) => 'The compliance packet field must be an array of {requirement,status,...} rows (offending: ' + (ctx.detail || '') + ').',
  project_path_unsafe: (ctx) => 'A full-path project artifact is outside the project authority, is a symlink, or has the wrong file type (offending: ' + (ctx.detail || 'unknown') + '). Replace it with a regular path under <root>/kaola-workflow/<project> before retrying.',
  reviewer_prerequisite: (ctx) => 'Named review execution is a hard Phase 5 prerequisite. Pass exactly one fresh code-reviewer row, exactly one invoked security-reviewer row or file-risk N/A decision, and exactly one resolved review-fix executors row with canonical .cache/review-fix-{n}.md evidence or N/A stating no blocking findings (offending: ' + (ctx.detail || '') + '). Every invoked row must record the exact seeded evidence-binding header and the canonical evidence must preserve it above a substantive full body. Reviewer fallback, missing, duplicate, stale, forged, absolute, traversal, empty, seed-only, compact-summary-only, and symlink evidence cannot finalize.',
  unresolved_compliance: (ctx) => 'The rendered phase file would FAIL the repair-state phase-boundary gate (unresolved: ' + (ctx.detail || '') + '). Supply compliance rows that resolve under this project\'s delegation_policy — `invoked`/`subagent-invoked`/`local-fallback-explicit`/`local-fallback-tool-unavailable` WITH an evidence path, or `n/a` WITH a skip reason. No file was written.',
};

function getOperatorHint(reason, ctx) {
  const tmpl = OPERATOR_HINT_REGISTRY[reason];
  const fallback = 'Refusal reason: ' + (reason || 'unknown') + '. Run orient --project <P> --json to inspect full-path state.';
  if (typeof tmpl !== 'function') return fallback;
  try {
    const out = tmpl(ctx || {});
    return (typeof out === 'string' && out.trim()) ? out : fallback;
  } catch (_) { return fallback; }
}

function refuse(reason, extra) {
  const out = Object.assign({ result: 'refuse', reason }, extra || {});
  out.operator_hint = getOperatorHint(reason, out);
  return out;
}

// ---------------------------------------------------------------------------
// small filesystem + parsing helpers (inline; no kaola-script requires)
// ---------------------------------------------------------------------------
function readFileOr(p, dflt) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return dflt; }
}

// Crash-safe atomic replace: temp + fsync + rename. Idempotent: returns false
// (no write) when the on-disk content already matches.
function writeFileAtomic(filePath, content) {
  let existing = null;
  try { existing = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
  if (existing === content) return false;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Math.random().toString(16).slice(2) + '.tmp');
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
  // #689 (same gap #685 fixed on the adaptive path's writeFileAtomicReplace): fsync the PARENT
  // DIRECTORY after the rename settles — on POSIX filesystems a rename's directory-entry update is
  // not itself durable until the containing directory is fsynced, so without this a settled write can
  // still revert to the pre-rename entry after power loss even though the tmp file's own contents were
  // fsynced above. Platform fail-soft is a HARD requirement: some platforms/filesystems refuse to open
  // or fsync a directory (Windows, EISDIR/EACCES/EINVAL) — degrade silently rather than turning a
  // previously-accepted write into a refusal; nothing in this block may rethrow or affect the return value.
  let dirFd;
  try {
    dirFd = fs.openSync(dir, 'r');
    fs.fsyncSync(dirFd);
  } catch (_) {
    // fail-soft: directory fsync unsupported/denied here — the rename above already succeeded.
  } finally {
    if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch (_) {} }
  }
  return true;
}

function safeJsonParse(str) {
  const s = String(str || '');
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  // tolerate trailing/leading noise: accept the last line that is a JSON object
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const p = JSON.parse(lines[i]);
      if (typeof p === 'object' && p !== null && !Array.isArray(p)) return p;
    } catch (_) {}
  }
  return null;
}

// project name: reject path traversal + the reserved literal
function validateProject(project) {
  if (!project || typeof project !== 'string') return false;
  if (project === 'kaola-workflow') return false;
  if (project === '.' || project === '..') return false;
  if (/[\\/]/.test(project)) return false;
  if (project.includes('..')) return false;
  if (project.startsWith('.')) return false;
  return true;
}

// Read a flat `name: value` field from state content.
function stateField(content, name) {
  if (!content) return null;
  const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.+)$', 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// renderers
// ---------------------------------------------------------------------------
const STATE_FIELD_ORDER = [
  'phase', 'phase_name', 'step', 'workflow_path', 'next_command', 'next_skill',
  'main_session_role', 'implementation_owner', 'inline_emergency_fallback_authorized',
];

// Surgical state update (the claim.js updateState norm): replace each given field
// in place and append a missing one, while preserving EVERY other line and section
// (the rich claim-time `## Project` / `## Current Position` runtime+fix_owner /
// `## Pending Gates` / `## Last Evidence` / `## Last Updated` / `## Sink` blocks)
// byte-for-byte. A whitelist-reconstruct here would silently destroy those sections
// on the first full-path write and turn the archive normalizations into no-ops.
// Builds a minimal flat state only when no prior state file exists.
function applyStateFields(existing, fields) {
  if (!existing || !existing.trim()) {
    const lines = [];
    for (const k of STATE_FIELD_ORDER) {
      if (fields[k] !== undefined && fields[k] !== null) lines.push(k + ': ' + fields[k]);
    }
    return lines.join('\n') + '\n';
  }
  let out = existing;
  const missing = [];
  for (const k of STATE_FIELD_ORDER) {
    const v = fields[k];
    if (v === undefined || v === null) continue;
    const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*.*$', 'm');
    if (re.test(out)) out = out.replace(re, k + ': ' + v);
    else missing.push(k + ': ' + v);
  }
  if (missing.length) {
    const block = missing.join('\n') + '\n';
    if (/^## Pending Gates[ \t]*$/m.test(out)) {
      out = out.replace(/^(## Pending Gates[ \t]*)$/m, block + '$1');
    } else if (/^## Sink[ \t]*$/m.test(out)) {
      out = out.replace(/^(## Sink[ \t]*)$/m, block + '$1');
    } else {
      out = out.replace(/\s*$/, '\n') + block;
    }
  }
  return out;
}

// Render the `## Required Agent Compliance` table. Rows are the orchestrator's
// normalized packet (or a resolved default). Each value is forced into one
// Markdown cell so packet pipes/newlines cannot create forged rows. The
// repair-state.js phase-boundary
// gate (unresolvedCompliance) blocks the crossing unless every row is RESOLVED:
// `invoked` WITH evidence, or `n/a`/`skipped` WITH evidence or skip_reason.
function markdownCell(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\|/g, '｜');
}

function complianceTable(rows) {
  const header = '| Requirement | Status | Evidence | Skip Reason |\n'
    + '|-------------|--------|----------|-------------|';
  const body = rows.map(r =>
    '| ' + markdownCell(r.requirement) + ' | ' + markdownCell(r.status) + ' | '
    + markdownCell(r.evidence) + ' | ' + markdownCell(r.skip_reason) + ' |').join('\n');
  return header + '\n' + body;
}

function reviewComplianceTable(rows) {
  const header = '| Requirement | Status | Evidence | Binding | Skip Reason |\n'
    + '|-------------|--------|----------|---------|-------------|';
  const body = rows.map(r =>
    '| ' + markdownCell(r.requirement) + ' | ' + markdownCell(r.status) + ' | '
    + markdownCell(r.evidence) + ' | ' + markdownCell(r.binding) + ' | '
    + markdownCell(r.skip_reason) + ' |').join('\n');
  return header + '\n' + body;
}

// Coerce a packet compliance value into the row shape, or null if not an array.
function normalizeCompliance(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return undefined; // signals bad_compliance
  return value.map(r => ({
    requirement: r && r.requirement != null ? markdownCell(r.requirement) : '',
    status: r && r.status != null ? markdownCell(r.status) : '',
    evidence: r && r.evidence != null ? markdownCell(r.evidence) : '',
    binding: r && r.binding != null ? markdownCell(r.binding) : '',
    skip_reason: r && (r.skip_reason != null ? r.skip_reason : r.skipReason) != null
      ? markdownCell(r.skip_reason != null ? r.skip_reason : r.skipReason) : '',
  }));
}

// Parse the canonical Phase 4 `## Tasks` ledger. A missing/empty/malformed table
// is not vacuously complete: Phase 5 requires one strict Markdown table, at least
// one task row, and every row must carry the exact terminal status `complete`.
function phase4TaskRows(content) {
  return repair.phase4TaskRows(content);
}

function allPhase4TasksComplete(content) {
  const parsed = phase4TaskRows(content);
  return parsed.valid && parsed.rows.length > 0
    && parsed.rows.every(row => row.status === 'complete');
}

// Generic compliance resolution intentionally permits documented fallback
// vocabulary for other phases. Phase 5 is stricter: the named review roles must
// actually have run, and a security-reviewer row may be inactive only as N/A.
function pathIsWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}

function lstatOrNull(filePath) {
  try { return fs.lstatSync(filePath); }
  catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function validateExistingArtifact(filePath, expectedType, realParent) {
  const metadata = lstatOrNull(filePath);
  if (metadata === null) return null;
  if (metadata.isSymbolicLink()) return path.basename(filePath) + ' is a symlink';
  if (expectedType === 'file' && !metadata.isFile()) return path.basename(filePath) + ' is not a regular file';
  if (expectedType === 'directory' && !metadata.isDirectory()) return path.basename(filePath) + ' is not a directory';
  const realPath = fs.realpathSync(filePath);
  if (path.dirname(realPath) !== realParent) return path.basename(filePath) + ' escapes its parent';
  return null;
}

function reviewFixArtifactNames(ctx) {
  const names = fs.readdirSync(ctx.cacheDir)
    .filter(name => name.startsWith('review-fix-'));
  if (names.some(name => !/^review-fix-[1-9][0-9]*\.md$/.test(name))) return null;
  return names;
}

// Fail closed before reading durable state. The project and .cache directories
// must be real direct children of their authority, and every managed artifact
// that already exists must be a regular non-symlink file in that directory.
// This is called again immediately before each transaction write to narrow the
// read/check/write race without following an attacker-controlled link.
function validateProjectAuthority(ctx) {
  try {
    const rootMetadata = lstatOrNull(ctx.rootPath);
    if (!rootMetadata || (!rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink())) return 'root is not a directory';
    const realRoot = fs.realpathSync(ctx.rootPath);
    const workflowMetadata = lstatOrNull(ctx.workflowDir);
    if (!workflowMetadata || workflowMetadata.isSymbolicLink() || !workflowMetadata.isDirectory()) {
      return 'kaola-workflow is missing, linked, or not a directory';
    }
    const realWorkflow = fs.realpathSync(ctx.workflowDir);
    if (path.dirname(realWorkflow) !== realRoot || path.basename(realWorkflow) !== 'kaola-workflow') {
      return 'kaola-workflow escapes root';
    }
    const projectMetadata = lstatOrNull(ctx.baseDir);
    if (!projectMetadata || projectMetadata.isSymbolicLink() || !projectMetadata.isDirectory()) {
      return ctx.project + ' is missing, linked, or not a directory';
    }
    const realProject = fs.realpathSync(ctx.baseDir);
    if (path.dirname(realProject) !== realWorkflow || path.basename(realProject) !== ctx.project) {
      return ctx.project + ' escapes kaola-workflow';
    }
    for (const filePath of [
      ctx.statePath, ctx.researchPath, ctx.ideationPath, ctx.planPath,
      ctx.progressPath, ctx.reviewPath,
    ]) {
      const violation = validateExistingArtifact(filePath, 'file', realProject);
      if (violation) return violation;
    }
    const cacheViolation = validateExistingArtifact(ctx.cacheDir, 'directory', realProject);
    if (cacheViolation) return cacheViolation;
    const cacheMetadata = lstatOrNull(ctx.cacheDir);
    if (cacheMetadata) {
      const realCache = fs.realpathSync(ctx.cacheDir);
      for (const name of ['code-reviewer.md', 'security-reviewer.md']) {
        const violation = validateExistingArtifact(path.join(ctx.cacheDir, name), 'file', realCache);
        if (violation) return '.cache/' + violation;
      }
      const fixArtifactNames = reviewFixArtifactNames(ctx);
      if (fixArtifactNames === null) return '.cache contains a noncanonical review-fix artifact name';
      for (const name of fixArtifactNames) {
        const violation = validateExistingArtifact(path.join(ctx.cacheDir, name), 'file', realCache);
        if (violation) return '.cache/' + violation;
      }
    }
    return null;
  } catch (err) {
    return err && err.message ? err.message : String(err);
  }
}

function newestReviewFixMtime(ctx) {
  let newest = -Infinity;
  try {
    const names = reviewFixArtifactNames(ctx);
    if (names === null) return Infinity;
    for (const name of names) {
      const metadata = fs.lstatSync(path.join(ctx.cacheDir, name));
      if (metadata.isSymbolicLink() || !metadata.isFile()) return Infinity;
      newest = Math.max(newest, metadata.mtimeMs);
    }
  } catch (err) {
    if (!err || err.code !== 'ENOENT') return Infinity;
  }
  return newest;
}

function reviewFixEvidenceNames(ctx) {
  try {
    return reviewFixArtifactNames(ctx);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    return null;
  }
}

function validEvidenceBinding(row) {
  return /^evidence-binding: [A-Za-z0-9._:-]+ [A-Za-z0-9._:-]+$/.test(String(row.binding || ''));
}

const REVIEW_FINDING_SCOPES = new Set(['in_scope', 'out_of_scope', 'pre_existing', 'needs_user_decision']);
const REVIEW_FINDING_ACTIONS = new Set(['fix', 'follow_up', 'document', 'none']);
const REVIEW_FINDING_STATUSES = new Set(['open', 'resolved', 'deferred']);
const REVIEW_RESERVED_KEYS = [
  'domain_outcome', 'verdict', 'findings_blocking', 'review_summary',
  'review_attestation', 'review_conclusion', 'finding',
];
const REVIEW_RESERVED_COMPACT_KEYS = REVIEW_RESERVED_KEYS.map(key => key.replace(/_/g, ''));
const REVIEW_FINDING_GATE_KEYS = ['scope', 'action', 'status'];
const REVIEW_BODY_UNSAFE_CODE_POINT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

function stringsWithinOneEdit(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const mismatches = [];
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) mismatches.push(i);
    }
    if (mismatches.length <= 1) return true;
    return mismatches.length === 2 && mismatches[1] === mismatches[0] + 1
      && left[mismatches[0]] === right[mismatches[1]]
      && left[mismatches[1]] === right[mismatches[0]];
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) shortIndex += 1;
    else if (skipped) return false;
    else skipped = true;
    longIndex += 1;
  }
  return true;
}

function stringIsSubsequence(needle, haystack) {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return needle.length === 0;
}

function reviewerReservedKeyIsObfuscated(line) {
  const text = String(line || '');
  if (REVIEW_RESERVED_KEYS.some(key => text.startsWith(key + ':'))) return false;
  const trimmed = text.trimStart();
  const firstToken = trimmed.split(/\s/u, 1)[0] || '';
  const normalizedToken = firstToken.normalize('NFKD')
    .replace(/[\u02D0\u2236\uA789]/gu, ':').replace(/\uA78A/gu, '=');
  const delimiterIndexes = [];
  for (let index = 0; index < normalizedToken.length; index += 1) {
    if (normalizedToken[index] === ':' || normalizedToken[index] === '=') {
      delimiterIndexes.push(index);
    }
  }
  const candidates = delimiterIndexes.length
    ? delimiterIndexes.map(index => normalizedToken.slice(0, index)) : [normalizedToken];
  const alteredShape = delimiterIndexes.length > 0 || /[^A-Za-z_]/u.test(firstToken)
    || /^\S+[ \t]+:/.test(trimmed);
  return alteredShape && candidates.some(candidate => {
    const compact = candidate.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const oneEdit = REVIEW_RESERVED_COMPACT_KEYS.some(key => stringsWithinOneEdit(compact, key));
    const visibleConfusable = /[^\x00-\x7F]/u.test(firstToken) && compact.length >= 3
      && REVIEW_RESERVED_COMPACT_KEYS.some(key => stringIsSubsequence(compact, key));
    return oneEdit || visibleConfusable;
  });
}

function reviewerFindingTokenKeyIsObfuscated(token) {
  const text = String(token || '');
  if (REVIEW_FINDING_GATE_KEYS.some(key => text.startsWith(key + '='))) return false;
  const normalized = text.normalize('NFKD');
  const equals = normalized.indexOf('=');
  if (equals < 0) return false;
  const compact = normalized.slice(0, equals).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const rawEquals = text.indexOf('=');
  const rawKey = rawEquals < 0 ? text : text.slice(0, rawEquals);
  if (/[^\x00-\x7F]/u.test(rawKey)) return true;
  return REVIEW_FINDING_GATE_KEYS.some(key => stringsWithinOneEdit(compact, key));
}

function reviewerFindingGateKeyCandidate(candidate) {
  const text = String(candidate || '');
  const compact = text.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  for (const key of REVIEW_FINDING_GATE_KEYS) {
    if (compact === key || stringsWithinOneEdit(compact, key)) return key;
    if (/[^\x00-\x7F]/u.test(text) && compact.length >= 2 && stringIsSubsequence(compact, key)) {
      return key;
    }
  }
  return null;
}

function reviewerFindingPayloadGateKeys(line) {
  const tokens = String(line || '').trim().split(/\s+/u).filter(Boolean);
  const keys = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index].normalize('NFKD').replace(/\p{M}/gu, '')
      .replace(/[\u02D0\uA789]/gu, ':').replace(/\uA78A/gu, '=');
    for (const match of normalized.matchAll(/([\p{L}\p{N}_]+)[:=]+(?=[^:=\s])/gu)) {
      const key = reviewerFindingGateKeyCandidate(match[1]);
      if (key) keys.add(key);
    }
    const next = tokens[index + 1] || '';
    const normalizedNext = next.normalize('NFKD').replace(/\uA78A/gu, '=');
    const spacedEquals = /^=[^:=\s]+/u.test(normalizedNext)
      || (normalizedNext === '=' && Boolean(tokens[index + 2]));
    if (/^[\p{L}\p{N}_]+$/u.test(normalized) && spacedEquals) {
      const key = reviewerFindingGateKeyCandidate(normalized);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function reviewerLineBeginsFindingLike(line) {
  const firstToken = String(line || '').trimStart().split(/\s/u, 1)[0] || '';
  const compact = firstToken.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (stringsWithinOneEdit(compact, 'finding')) return true;
  return /[^\x00-\x7F]/u.test(firstToken) && compact.length >= 3
    && stringIsSubsequence(compact, 'finding');
}

function reviewerAlternatingFindingGateKeys(line) {
  if (!reviewerLineBeginsFindingLike(line)) return new Set();
  const tokens = String(line || '').trim().split(/\s+/u).filter(Boolean).slice(1);
  const keys = new Set();
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const key = reviewerFindingGateKeyCandidate(tokens[index]);
    if (!key) continue;
    const nextIsDelimiter = /^[:=]+$/u.test(tokens[index + 1]);
    if ((!nextIsDelimiter && tokens[index + 1])
        || (nextIsDelimiter && tokens[index + 2])) keys.add(key);
  }
  return keys;
}

function reviewerLineHasMalformedFindingPayload(line) {
  const text = String(line || '');
  if (text.startsWith('finding:')) return false;
  return reviewerFindingPayloadGateKeys(text).size === REVIEW_FINDING_GATE_KEYS.length
    || reviewerAlternatingFindingGateKeys(text).size === REVIEW_FINDING_GATE_KEYS.length;
}

function reviewerFindingState(line) {
  const text = String(line || '');
  if (!/^\s*finding\s*:/i.test(text)) return null;
  if (!/^finding:[ \t]+\S.*$/.test(text)) return { valid: false, blocking: false };
  const gateValues = { scope: [], action: [], status: [] };
  const findingTokens = text.slice('finding:'.length).trim().split(/[ \t]+/);
  if (findingTokens.some(token => !/^[a-z][a-z0-9_]*=\S+$/.test(token)
      || reviewerFindingTokenKeyIsObfuscated(token))) {
    return { valid: false, blocking: false };
  }
  for (const token of findingTokens) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const folded = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(gateValues, folded)) {
      if (key !== folded) return { valid: false, blocking: false };
      gateValues[folded].push(token.slice(eq + 1));
    }
  }
  if (gateValues.scope.length !== 1 || gateValues.action.length !== 1 || gateValues.status.length !== 1) {
    return { valid: false, blocking: false };
  }
  const scope = gateValues.scope[0];
  const action = gateValues.action[0];
  const status = gateValues.status[0];
  if (!REVIEW_FINDING_SCOPES.has(scope)
      || !REVIEW_FINDING_ACTIONS.has(action)
      || !REVIEW_FINDING_STATUSES.has(status)) {
    return { valid: false, blocking: false };
  }
  return { valid: true, blocking: scope === 'in_scope' && action === 'fix' && status === 'open' };
}

function evidenceHasSubstantiveBody(content, row, roleKind) {
  const lines = String(content || '').split(/\r?\n/);
  if (lines[0] !== row.binding || !validEvidenceBinding(row)) return false;
  const rawBodyLines = lines.slice(1);
  const bodyLines = rawBodyLines.map(line => line.trim()).filter(Boolean);
  if (bodyLines.length < 2) return false;
  const body = bodyLines.join('\n');
  if (/^[^\n]+ (?:code-reviewer|security-reviewer|tdd-guide|build-error-resolver): [^\n;]+; evidence=[^\n]+$/.test(body)) {
    return false;
  }
  if (roleKind === 'reviewer') {
    if (rawBodyLines.some(line => REVIEW_BODY_UNSAFE_CODE_POINT.test(line))) return false;
    if (rawBodyLines.some(reviewerReservedKeyIsObfuscated)) return false;
    if (rawBodyLines.some(reviewerLineHasMalformedFindingPayload)) return false;
    const domainOutcomes = rawBodyLines.filter(line => /^\s*domain_outcome\s*:/i.test(line));
    const verdicts = rawBodyLines.filter(line => /^\s*verdict\s*:/i.test(line));
    const blockerCounts = rawBodyLines.filter(line => /^\s*findings_blocking\s*:/i.test(line));
    const summaries = rawBodyLines.filter(line => /^\s*review_summary\s*:/i.test(line));
    const attestations = rawBodyLines.filter(line => /^\s*review_attestation\s*:/i.test(line));
    const conclusions = rawBodyLines.filter(line => /^\s*review_conclusion\s*:/i.test(line));
    if (domainOutcomes.length !== 1 || domainOutcomes[0] !== 'domain_outcome: approved') return false;
    if (verdicts.length !== 1 || verdicts[0] !== 'verdict: pass') return false;
    if (blockerCounts.length !== 1 || blockerCounts[0] !== 'findings_blocking: 0') return false;
    if (summaries.length !== 1 || summaries[0] !== 'review_summary: no_blocking_findings') return false;
    if (attestations.length !== 1
        || attestations[0] !== 'review_attestation: full_review_completed') return false;
    if (conclusions.length !== 1) return false;
    const conclusionMatch = conclusions[0].match(/^review_conclusion: (\S.*)$/);
    if (!conclusionMatch) return false;
    const conclusionText = conclusionMatch[1];
    if (conclusionText !== conclusionText.trimEnd()
        || /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(conclusionText)) return false;
    const conclusionWords = conclusionText.match(/[\p{L}\p{N}]+/gu) || [];
    const conclusionCharacters = conclusionText.match(/[\p{L}\p{N}]/gu) || [];
    if (conclusionCharacters.length < 24 || conclusionWords.length < 4) return false;
    const lastBodyLine = rawBodyLines.filter(line => line.trim()).slice(-1)[0];
    if (lastBodyLine !== conclusions[0]) return false;
    const findings = rawBodyLines.map(reviewerFindingState).filter(Boolean);
    if (findings.some(finding => !finding.valid || finding.blocking)) return false;
    return true;
  }
  return (/^RED:\s*\S.+$/m.test(body) && /^GREEN:\s*\S.+$/m.test(body))
    || /^build-green:\s*\S.+$/m.test(body);
}

function validReviewFixEvidence(ctx, row) {
  if (!validEvidenceBinding(row)) return false;
  if (!/^\.cache\/review-fix-[1-9][0-9]*\.md$/.test(row.evidence.trim())) return false;
  const evidencePath = path.join(ctx.baseDir, row.evidence.trim());
  try {
    const metadata = fs.lstatSync(evidencePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
    const realProject = fs.realpathSync(ctx.baseDir);
    const realEvidence = fs.realpathSync(evidencePath);
    if (!pathIsWithin(realProject, realEvidence)) return false;
    const progressMetadata = fs.lstatSync(ctx.progressPath);
    if (progressMetadata.isSymbolicLink() || !progressMetadata.isFile()) return false;
    if (metadata.mtimeMs <= progressMetadata.mtimeMs) return false;
    return evidenceHasSubstantiveBody(fs.readFileSync(evidencePath, 'utf8'), row, 'fix');
  } catch (_) {
    return false;
  }
}

function validReviewFixDecision(ctx, row) {
  const evidence = String(row.evidence || '').split(',').map(value => value.trim()).filter(Boolean);
  const bindings = String(row.binding || '').split(',').map(value => value.trim()).filter(Boolean);
  let names;
  try {
    const allFixArtifacts = reviewFixArtifactNames(ctx);
    if (allFixArtifacts === null) return false;
    names = allFixArtifacts
      .sort((a, b) => Number(a.match(/[0-9]+/)[0]) - Number(b.match(/[0-9]+/)[0]));
  } catch (_) {
    return false;
  }
  const expectedEvidence = names.map(name => '.cache/' + name);
  if (names.length === 0 || evidence.length !== names.length || bindings.length !== names.length) return false;
  if (evidence.some((value, index) => value !== expectedEvidence[index])) return false;
  return evidence.every((value, index) => validReviewFixEvidence(ctx, {
    evidence: value,
    binding: bindings[index],
  }));
}

function validReviewerEvidence(ctx, row, reviewer) {
  if (!validEvidenceBinding(row)) return false;
  const relativeEvidence = '.cache/' + reviewer + '.md';
  if (row.evidence.trim() !== relativeEvidence) return false;
  const projectDir = path.resolve(path.dirname(ctx.statePath));
  const evidencePath = path.resolve(projectDir, relativeEvidence);
  const canonicalPath = path.join(projectDir, '.cache', reviewer + '.md');
  if (evidencePath !== canonicalPath || !pathIsWithin(projectDir, evidencePath)) return false;
  try {
    const metadata = fs.lstatSync(evidencePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
    const realProject = fs.realpathSync(projectDir);
    const realEvidence = fs.realpathSync(evidencePath);
    if (!pathIsWithin(realProject, realEvidence)) return false;
    const progressMetadata = fs.lstatSync(ctx.progressPath);
    if (progressMetadata.isSymbolicLink() || !progressMetadata.isFile()) return false;
    if (metadata.mtimeMs <= progressMetadata.mtimeMs) return false;
    if (metadata.mtimeMs <= newestReviewFixMtime(ctx)) return false;
    return evidenceHasSubstantiveBody(fs.readFileSync(evidencePath, 'utf8'), row, 'reviewer');
  } catch (_) {
    return false;
  }
}

function reviewerPrerequisiteViolation(ctx, rows) {
  const named = name => rows.filter(row => row.requirement.trim().toLowerCase() === name);
  const validInvocation = (row, reviewer) =>
    REVIEWER_INVOKED_STATUSES.has(row.status.trim().toLowerCase()) && validReviewerEvidence(ctx, row, reviewer);
  const codeRows = named('code-reviewer');
  if (codeRows.length !== 1) return 'code-reviewer row count must be exactly one';
  if (!validInvocation(codeRows[0], 'code-reviewer')) return 'code-reviewer';
  const securityRows = named('security-reviewer');
  if (securityRows.length !== 1) return 'security-reviewer row count must be exactly one';
  const securityRow = securityRows[0];
  const securityStatus = securityRow.status.trim().toLowerCase();
  if (securityStatus === 'n/a' || securityStatus === 'na') {
    if (securityRow.binding.trim().toLowerCase() !== 'n/a') return 'security-reviewer n/a requires binding n/a';
    if (!securityRow.skip_reason.trim()) return 'security-reviewer n/a requires file-risk skip reason';
  } else if (!validInvocation(securityRow, 'security-reviewer')) return 'security-reviewer';
  const fixRows = named('review-fix executors');
  if (fixRows.length !== 1) return 'review-fix executors row count must be exactly one';
  const fixRow = fixRows[0];
  const fixStatus = fixRow.status.trim().toLowerCase();
  const fixEvidenceNames = reviewFixEvidenceNames(ctx);
  if (fixEvidenceNames === null) return 'review-fix evidence directory unreadable';
  if (fixStatus === 'n/a' || fixStatus === 'na') {
    if (fixRow.binding.trim().toLowerCase() !== 'n/a') return 'review-fix executors n/a requires binding n/a';
    if (fixEvidenceNames.length > 0) return 'review-fix executors n/a contradicts review-fix evidence';
    if (!/^(?:no blocking findings|no critical\/high findings|no critical\/high blocking findings)$/i.test(fixRow.skip_reason.trim())) {
      return 'review-fix executors n/a requires a no-blocking-findings reason';
    }
  } else if (!FIX_EXECUTOR_RESOLVED_STATUSES.has(fixStatus) || !validReviewFixDecision(ctx, fixRow)) {
    return 'review-fix executors must reject noncanonical artifact names and enumerate every numeric fix artifact with matching bindings and substantive bodies';
  }
  return null;
}

const TRANSACTION_OWNED_HEADINGS = new Map([
  'Approaches Evaluated',
  'Selected Approach',
  'Out of Scope (explicit)',
  'Blueprint',
  'Task List',
  'Code Review Findings',
  'Security Review',
  'Required Agent Compliance',
  'Fixes Applied',
  'Validation Evidence',
  'Follow-Up Items',
  'Review Status',
].map(heading => [heading.toLowerCase(), heading]));

// User-authored narrative may contain arbitrary Markdown, but renderer-owned
// headings are transaction authority. Escape every packet-supplied copy so the
// persisted parsers observe exactly one authoritative section of each kind.
function narrative(value, fallback) {
  const text = value == null || value === '' ? fallback : String(value);
  return text.replace(/^[ \t]*##[ \t]+([^\r\n]+?)[ \t]*$/gm, (line, heading) => {
    const reserved = TRANSACTION_OWNED_HEADINGS.get(heading.trim().toLowerCase());
    return reserved ? '> Reserved heading escaped: ' + reserved : line;
  });
}

function renderIdeation(project, parts) {
  return [
    '# Phase 2 - Ideation: ' + project,
    '',
    '## Approaches Evaluated',
    narrative(parts.approaches_evaluated, '[pending]'),
    '',
    '## Selected Approach',
    narrative(parts.selected_approach, '[pending]'),
    '',
    '## Out of Scope (explicit)',
    narrative(parts.out_of_scope, 'none'),
    '',
    '## Required Agent Compliance',
    complianceTable(parts.compliance),
    '',
  ].join('\n');
}

function renderPlan(project, parts) {
  return [
    '# Phase 3 - Plan: ' + project,
    '',
    '## Blueprint',
    narrative(parts.blueprint, '[pending]'),
    '',
    '## Task List',
    narrative(parts.task_list, '[pending]'),
    '',
    '## Required Agent Compliance',
    complianceTable(parts.compliance),
    '',
  ].join('\n');
}

function renderReview(project, parts) {
  return [
    '# Phase 5 - Review: ' + project,
    '',
    '## Code Review Findings',
    narrative(parts.code_review_findings, 'none'),
    '',
    '## Security Review',
    narrative(parts.security_review, 'ran: no and reason: no security-sensitive files in write set'),
    '',
    '## Required Agent Compliance',
    reviewComplianceTable(parts.compliance),
    '',
    '## Fixes Applied',
    narrative(parts.fixes_applied, 'none'),
    '',
    '## Validation Evidence',
    narrative(parts.validation_evidence, '[pending]'),
    '',
    '## Follow-Up Items',
    narrative(parts.followups, 'none'),
    '',
    '## Review Status',
    parts.review_status,
    '',
  ].join('\n');
}

function parsePersistedReviewCompliance(content) {
  const source = String(content || '');
  if ((source.match(/^## Required Agent Compliance\s*$/gm) || []).length !== 1) {
    return { valid: false, rows: [] };
  }
  const start = source.search(/^## Required Agent Compliance\s*$/m);
  const section = [];
  for (const line of source.slice(start).split(/\r?\n/).slice(1)) {
    if (/^##\s+/.test(line)) break;
    section.push(line);
  }
  while (section.length > 0 && section[0].trim() === '') section.shift();
  const tableLines = [];
  let ended = false;
  for (const line of section) {
    if (line.trim() === '') {
      ended = true;
      continue;
    }
    if (ended) return { valid: false, rows: [] };
    tableLines.push(line);
  }
  const parseRow = line => {
    if (!/^\|.*\|$/.test(line)) return null;
    return line.split('|').slice(1, -1).map(cell => cell.trim());
  };
  const expectedHeader = ['Requirement', 'Status', 'Evidence', 'Binding', 'Skip Reason'];
  const header = tableLines.length > 0 ? parseRow(tableLines[0]) : null;
  if (!header || header.length !== expectedHeader.length
      || header.some((cell, index) => cell !== expectedHeader[index])) {
    return { valid: false, rows: [] };
  }
  const separator = tableLines.length > 1 ? parseRow(tableLines[1]) : null;
  if (!separator || separator.length !== expectedHeader.length
      || separator.some(cell => !/^-{3,}$/.test(cell))) {
    return { valid: false, rows: [] };
  }
  const rows = [];
  for (const line of tableLines.slice(2)) {
    const columns = parseRow(line);
    if (!columns || columns.length !== expectedHeader.length || !columns[0] || !columns[1]) {
      return { valid: false, rows: [] };
    }
    rows.push({
      requirement: columns[0],
      status: columns[1],
      evidence: columns[2],
      binding: columns[3],
      skip_reason: columns[4],
    });
  }
  if (rows.length === 0 || tableLines.join('\n') !== reviewComplianceTable(rows)) {
    return { valid: false, rows: [] };
  }
  return { valid: true, rows };
}

function persistedReviewStatus(content) {
  const source = String(content || '');
  if ((source.match(/^## Review Status\s*$/gm) || []).length !== 1) return '';
  const start = source.search(/^## Review Status\s*$/m);
  const body = [];
  for (const line of source.slice(start).split(/\r?\n/).slice(1)) {
    if (/^##\s+/.test(line)) break;
    if (line.trim()) body.push(line.trim());
  }
  return body.length === 1 && REVIEW_STATUSES.includes(body[0]) ? body[0] : '';
}

// ---------------------------------------------------------------------------
// state checkpoints
// ---------------------------------------------------------------------------
// Each phase transition only TOUCHES the fields the transition changes (phase,
// phase_name, step, next_command, next_skill). Every other field claim.js set
// (workflow_path, main_session_role, the ## Sink block, etc.) is preserved by
// applyStateFields. The phase->skill route map mirrors repair-state.js:
//   1 research, 2 ideation, 3 plan, 4 execute, 5 review, 6 finalize.
function checkpointFields(project, phase, phaseName, nextPhaseCmd, nextSkill) {
  return {
    phase: phase,
    phase_name: phaseName,
    step: 'complete',
    next_command: '/' + KW + nextPhaseCmd + ' ' + project,
    next_skill: KW + nextSkill + ' ' + project,
  };
}

// ---------------------------------------------------------------------------
// subcommand implementations
// ---------------------------------------------------------------------------
function runOrient(ctx) {
  const stateContent = readFileOr(ctx.statePath, null);
  const files = {
    research: fs.existsSync(ctx.researchPath),
    ideation: fs.existsSync(ctx.ideationPath),
    plan: fs.existsSync(ctx.planPath),
    progress: fs.existsSync(ctx.progressPath),
    review: fs.existsSync(ctx.reviewPath),
  };
  // Derive the next full-path step from the highest phase artifact present.
  let fullStep, route;
  if (files.review) { fullStep = 'finalize'; route = '/' + KW + 'finalize ' + ctx.project; }
  else if (files.progress) { fullStep = 'review'; route = '/' + KW + 'phase5 ' + ctx.project; }
  else if (files.plan) { fullStep = 'execute'; route = '/' + KW + 'phase4 ' + ctx.project; }
  else if (files.ideation) { fullStep = 'plan'; route = '/' + KW + 'phase3 ' + ctx.project; }
  else if (files.research) { fullStep = 'ideation'; route = '/' + KW + 'phase2 ' + ctx.project; }
  else { fullStep = 'research'; route = '/' + KW + 'phase1 ' + ctx.project; }
  return {
    result: 'ok',
    project: ctx.project,
    full_step: fullStep,
    phase: stateField(stateContent, 'phase'),
    step: stateField(stateContent, 'step'),
    phase_files: files,
    next_command: route,
  };
}

function runPhase1Complete(ctx) {
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  if (!fs.existsSync(ctx.researchPath)) return refuse('research_missing', { project: ctx.project });
  const fields = checkpointFields(ctx.project, '1', 'Research', 'phase2', 'ideation');
  const authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) return refuse('project_path_unsafe', { project: ctx.project, detail: authorityViolation });
  const wrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, fields));
  return { result: 'ok', project: ctx.project, phase: 1, step: 'complete', state_written: wrote, idempotent: !wrote, next_command: fields.next_command };
}

// Shared phase-file finalizer: SELF-VALIDATE the rendered phase file against the
// real repair-state phase-boundary gate (unresolvedCompliance, checked WITH the
// live state for the delegation_policy cross-check — exactly as route() /
// routeFinalization() do downstream), fail closed with zero mutation if it would
// not pass, THEN author the phase FILE and advance the state pointer LAST
// (crash-safe: a crash leaves the phase file written and the pointer un-advanced
// -> resume re-runs idempotently and converges to a gate-PASSING state).
function finalizePhase(ctx, opts) {
  const existing = opts.existing;
  if (existing === null || existing === undefined) return refuse('state_missing', { project: ctx.project });
  const unresolved = repair.unresolvedCompliance(opts.content, existing);
  if (unresolved.length) {
    return refuse('unresolved_compliance', { project: ctx.project, detail: unresolved.map(r => r.requirement).join(', ') });
  }
  let authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) return refuse('project_path_unsafe', { project: ctx.project, detail: authorityViolation });
  const fileWrote = writeFileAtomic(opts.filePath, opts.content);
  authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) return refuse('project_path_unsafe', { project: ctx.project, detail: authorityViolation });
  const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, opts.fields));
  return {
    result: 'ok',
    project: ctx.project,
    phase: opts.phaseNum,
    step: 'complete',
    phase_file_written: fileWrote,
    state_written: stWrote,
    idempotent: !fileWrote && !stWrote,
    next_command: opts.fields.next_command,
  };
}

function runPhase2Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    compliance = [{ requirement: 'planner', status: defaultActiveStatus(existing), evidence: '.cache/planner.md', skip_reason: '' }];
  }
  const content = renderIdeation(ctx.project, {
    approaches_evaluated: packet.approaches_evaluated,
    selected_approach: packet.selected_approach,
    out_of_scope: packet.out_of_scope,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '2', 'Ideation', 'phase3', 'plan');
  return finalizePhase(ctx, { existing, phaseNum: 2, filePath: ctx.ideationPath, content, fields });
}

function runPhase3Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    compliance = [
      { requirement: 'code-architect', status: defaultActiveStatus(existing), evidence: '.cache/architect.md', skip_reason: '' },
      { requirement: 'architect revisions', status: 'n/a', evidence: '', skip_reason: 'no revision needed' },
    ];
  }
  const content = renderPlan(ctx.project, {
    blueprint: packet.blueprint,
    task_list: packet.task_list,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '3', 'Plan', 'phase4', 'execute');
  return finalizePhase(ctx, { existing, phaseNum: 3, filePath: ctx.planPath, content, fields });
}

function runPhase5Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) return refuse('progress_missing', { project: ctx.project });
  if (!allPhase4TasksComplete(progress)) return refuse('progress_incomplete', { project: ctx.project });
  const reviewStatus = packet.review_status != null ? String(packet.review_status).trim() : '';
  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    return refuse('invalid_review_status', { project: ctx.project, detail: reviewStatus || '(missing)' });
  }
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    return refuse('reviewer_prerequisite', { project: ctx.project, detail: 'explicit compliance array missing' });
  }
  const reviewerViolation = reviewerPrerequisiteViolation(ctx, compliance);
  if (reviewerViolation) {
    return refuse('reviewer_prerequisite', { project: ctx.project, detail: reviewerViolation });
  }
  const content = renderReview(ctx.project, {
    code_review_findings: packet.code_review_findings,
    security_review: packet.security_review,
    fixes_applied: packet.fixes_applied,
    validation_evidence: packet.validation_evidence,
    followups: packet.followups,
    review_status: reviewStatus,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '5', 'Review', 'finalize', 'finalize');
  return finalizePhase(ctx, { existing, phaseNum: 5, filePath: ctx.reviewPath, content, fields });
}

function runPhase5Verify(ctx) {
  let authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) return refuse('project_path_unsafe', { project: ctx.project, detail: authorityViolation });
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) return refuse('progress_missing', { project: ctx.project });
  if (!allPhase4TasksComplete(progress)) return refuse('progress_incomplete', { project: ctx.project });
  const review = readFileOr(ctx.reviewPath, null);
  if (review === null) return refuse('review_missing', { project: ctx.project });
  if (!persistedReviewStatus(review)) {
    return refuse('invalid_review_status', { project: ctx.project, detail: 'persisted review status missing or malformed' });
  }
  const parsed = parsePersistedReviewCompliance(review);
  if (!parsed.valid) {
    return refuse('reviewer_prerequisite', { project: ctx.project, detail: 'persisted compliance table is not canonical' });
  }
  const reviewerViolation = reviewerPrerequisiteViolation(ctx, parsed.rows);
  if (reviewerViolation) {
    return refuse('reviewer_prerequisite', { project: ctx.project, detail: reviewerViolation });
  }
  const stateContent = readFileOr(ctx.statePath, '');
  const unresolved = repair.unresolvedCompliance(review, stateContent);
  if (unresolved.length) {
    return refuse('unresolved_compliance', { project: ctx.project, detail: unresolved.map(r => r.requirement).join(', ') });
  }
  authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) return refuse('project_path_unsafe', { project: ctx.project, detail: authorityViolation });
  return {
    result: 'ok',
    project: ctx.project,
    phase5_verified: true,
    review_status: persistedReviewStatus(review),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const hasJson = args.includes('--json');
  const hasStdin = args.includes('--stdin');
  const projectIdx = args.indexOf('--project');
  const rootIdx = args.indexOf('--root');

  function emit(result) {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result && result.result === 'refuse') process.exitCode = 1;
  }

  if (!hasJson) {
    emit(refuse('invalid_args', { errors: ['--json is required'] }));
    return;
  }
  if (!subcommand || subcommand.startsWith('--')) {
    emit(refuse('invalid_args', { errors: ['subcommand is required'] }));
    return;
  }
  const known = ['orient', 'phase1-complete', 'phase2-finalize', 'phase3-finalize', 'phase5-finalize', 'phase5-verify'];
  if (!known.includes(subcommand)) {
    emit(refuse('unknown_subcommand', { detail: subcommand }));
    return;
  }
  const project = (projectIdx >= 0 && projectIdx + 1 < args.length) ? args[projectIdx + 1] : null;
  if (!project) { emit(refuse('invalid_args', { errors: ['--project is required'] })); return; }
  if (!validateProject(project)) { emit(refuse('invalid_project', { project })); return; }

  const root = (rootIdx >= 0 && rootIdx + 1 < args.length) ? args[rootIdx + 1] : process.cwd();
  const rootPath = path.resolve(root);
  const workflowDir = path.join(rootPath, 'kaola-workflow');
  const baseDir = path.join(workflowDir, project);
  const ctx = {
    project, cwd: root, rootPath, workflowDir, baseDir,
    statePath: path.join(baseDir, 'workflow-state.md'),
    researchPath: path.join(baseDir, 'phase1-research.md'),
    ideationPath: path.join(baseDir, 'phase2-ideation.md'),
    planPath: path.join(baseDir, 'phase3-plan.md'),
    progressPath: path.join(baseDir, 'phase4-progress.md'),
    reviewPath: path.join(baseDir, 'phase5-review.md'),
    cacheDir: path.join(baseDir, '.cache'),
  };

  const authorityViolation = validateProjectAuthority(ctx);
  if (authorityViolation) {
    emit(refuse('project_path_unsafe', { project, detail: authorityViolation }));
    return;
  }

  let packet = null;
  const needsStdin = hasStdin && (subcommand === 'phase2-finalize' || subcommand === 'phase3-finalize' || subcommand === 'phase5-finalize');
  if (needsStdin) {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
    packet = safeJsonParse(raw);
  }

  let result;
  try {
    if (subcommand === 'orient') {
      result = runOrient(ctx);
    } else if (subcommand === 'phase1-complete') {
      result = runPhase1Complete(ctx);
    } else if (subcommand === 'phase2-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase2-finalize requires --stdin'] }); }
      else { result = runPhase2Finalize(ctx, packet); }
    } else if (subcommand === 'phase3-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase3-finalize requires --stdin'] }); }
      else { result = runPhase3Finalize(ctx, packet); }
    } else if (subcommand === 'phase5-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase5-finalize requires --stdin'] }); }
      else { result = runPhase5Finalize(ctx, packet); }
    } else if (subcommand === 'phase5-verify') {
      result = runPhase5Verify(ctx);
    }
  } catch (err) {
    result = refuse('invalid_args', { project, errors: ['internal error: ' + (err && err.message ? err.message : String(err))] });
  }
  emit(result);
}

if (require.main === module) main();

module.exports = {
  KW, REVIEW_STATUSES,
  validateProject, stateField, safeJsonParse,
  applyStateFields, normalizeCompliance, complianceTable,
  reviewComplianceTable, renderIdeation, renderPlan, renderReview,
  parsePersistedReviewCompliance, runPhase5Verify,
  // #689: exported for the parent-dir-fsync-after-rename regression (the established
  // fs-singleton monkey-patch seam).
  writeFileAtomic,
};
