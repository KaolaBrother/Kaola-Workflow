#!/usr/bin/env node
'use strict';

const forge = require('./kaola-gitea-forge');
const active = require('./kaola-gitea-workflow-active-folders');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema'); // LANE_STALENESS_MS (byte-identical anchor)

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function labelName(label) {
  return String((label && label.name) || label || '');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}

const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;
function parseDependsOn(labels) {
  for (const label of labels || []) {
    const match = labelName(label).match(DEPENDS_ON_REGEX);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function checkDependsOn(depIid) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depIid + ' label present; conservative block' };
  }
  let state = 'open';
  try {
    state = forge.viewIssue(depIid).state || 'open';
  } catch (_) {}
  if (state !== 'closed') return { verdict: 'blocked', reasoning: 'depends-on:#' + depIid + ' is still open' };
  return null;
}

function issueHasWorkflowInProgressLabel(labels) {
  return (labels || []).some(function(label) {
    return labelName(label) === forge.CLAIM_LABEL;
  });
}

// #519 (site 5 equivalent): claim-DETECTION is best-effort. A no-CLI / spawn fault, a genuine
// non-zero, or a malformed/swallowed body all stay a return-false (no detectable claim), UNCHANGED.
// We re-throw a TransientFetchError ONLY when the exec stderr carries a KNOWN transient-infra
// signature (TLS timeout / rate-limit / DNS) — that blip would otherwise conflate to "no claim". The
// narrow signature predicate keeps the no-CLI / offline path returning false (not escalating).
function isInfraTransientExec(e) {
  if (e instanceof TransientFetchError || e.transient === true) return true;
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

function issueHasRemoteClaimNotes(issueIid) {
  if (OFFLINE) return false;
  let project;
  try {
    project = forge.discoverProject();
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('tea repo view transient fault', e);
    return false;
  }
  if (!project || !project.full_name) return false;
  try {
    const notes = forge.listIssueComments(project, issueIid) || [];
    return notes.some(function(note) {
      if (!note || !note.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(note.body)) return false;
      if (!note.updated_at) return true;
      return Date.now() - new Date(note.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('tea api comments transient fault', e);
    return false;
  }
}

// The classifier reports facts about a candidate issue's STATE — is a prerequisite still open, is
// the issue already claimed, does it exist. It does not decide whether two pieces of work may run at
// the same time: the runtime agent owns that, and where the runtime supports concurrency it is on.
function classify(issue) {
  const depIid = parseDependsOn(issue.labels || []);
  if (depIid !== null) {
    const blocked = checkDependsOn(depIid);
    if (blocked) return blocked;
  }
  return { verdict: 'green', reasoning: 'no dependency block' };
}

// #507: boundary-2 fetch error classification — mirrors root classifier classifyFetchError.
// Partitions the error from a tea/forge CLI fetch into three buckets:
//   'spawn_fault'   — CLI never started (ENOENT/EAGAIN/EMFILE/ENOMEM; e.status is null, no signal)
//   'killed'        — CLI was signalled or timed out (e.killed===true or e.signal present)
//   'clean_nonzero' — CLI ran and exited non-zero (e.status is a non-null number); determinate
function classifyFetchError(e) {
  if (e.status != null) return 'clean_nonzero';
  if (e.killed === true || e.signal) return 'killed';
  if (e.code && ['ENOENT', 'EAGAIN', 'EMFILE', 'ENOMEM'].indexOf(e.code) !== -1) return 'spawn_fault';
  return 'killed'; // unknown non-status fault — treat as transient
}

// #519: AXIS REPLACEMENT — partition a tea/forge CLI fetch error by its stderr ERROR-CLASS, not by
// exit code alone. A clean_nonzero exit carrying a TRANSIENT-INFRA signature (TLS handshake timeout /
// API rate-limit / DNS "Could not resolve host" / connection reset / ETIMEDOUT / 5xx) escalates like
// a killed/spawn-fault; a genuine-negative (404 / "Could not resolve to an Issue" / closed) — and ANY
// UNRECOGNIZED stderr — stays determinate-refuse (escalation requires positive infra evidence).
const TRANSIENT_FETCH_STDERR = [
  /\bTLS\b/i,
  /handshake/i,
  /\btimed?\s*out\b/i,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /connection reset/i,
  /connection refused/i,
  /\bECONNREFUSED\b/i,
  /rate limit/i,
  /\b429\b/,
  /could not resolve host/i,
  /\bEAI_AGAIN\b/i,
  /temporary failure in name resolution/i,
  /\bdial tcp\b/i,
  /\b5\d\d\b\s*(?:internal|bad gateway|service unavailable|gateway timeout)?/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway time-?out/i,
  /\bi\/o timeout\b/i,
  /network is unreachable/i,
  /\bEHOSTUNREACH\b/i,
];

// #519: true iff captured stderr/stdout carries a KNOWN transient-infra signature.
function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #519: a typed transient-fetch fault — thrown when a transient-infra exec fault (e.g. discoverProject
// / listIssueComments for claim-detection) must route to the indeterminate/escalate emitter instead of
// silently catching to "no claim". Mirrors the root classifier's TransientFetchError.
class TransientFetchError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransientFetchError';
    this.transient = true;
    this.cause = cause;
    if (cause) { this.code = cause.code; this.signal = cause.signal; }
  }
}

// #519: combine the exit-code class with the stderr error-class into a single transient verdict.
// spawn_fault / killed → always transient; clean_nonzero → transient only on a known stderr signature.
function isTransientFetchError(e) {
  const cls = classifyFetchError(e);
  if (cls !== 'clean_nonzero') return true;
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

// #507: overridable backoff for boundary-2 retry. Tests set KAOLA_CLASSIFIER_BACKOFF_MS=0.
function fetchBackoffMs() {
  const v = parseInt(process.env.KAOLA_CLASSIFIER_BACKOFF_MS || '', 10);
  return (Number.isFinite(v) && v >= 0) ? v : 50;
}

// #507: synchronous sleep for retry backoff (Atomics.wait — safe in sync path).
function syncSleepFetch(ms) {
  if (ms <= 0) return;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {}
}

// #507/#519: shared fetch-with-retry logic used by both classifyIssue (in-process) and cmdClassify.
// The transient/genuine partition is by stderr ERROR-CLASS (isTransientFetchError), not exit code
// alone (#519): a clean_nonzero carrying a transient-infra signature now retries + escalates; a
// genuine-negative / unrecognized clean_nonzero stays determinate-refuse. (The #510 exit-0-degraded
// case — empty/unparseable body swallowed by parseJson to {} — is handled by the _st guard in the
// callers, mapped to indeterminate, so forge.viewIssue stays the single stubbable fetch seam.)
// Returns { issue } on success; { error: 'target_unavailable'|'indeterminate', payload } on failure.
function fetchIssueWithRetry(issueIid, forgeViewFn) {
  const viewFn = forgeViewFn || forge.viewIssue.bind(forge);
  const MAX_FETCH_ATTEMPTS = 3;
  const backoffMs = fetchBackoffMs();
  let lastFetchErr = null;
  let lastFetchTransient = false;
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) syncSleepFetch(backoffMs);
    try {
      const issue = viewFn(issueIid);
      return { issue };
    } catch (e) {
      lastFetchErr = e;
      lastFetchTransient = isTransientFetchError(e);
      if (!lastFetchTransient) break; // genuine-negative / unrecognized — determinate, do not retry
    }
  }
  if (!lastFetchTransient) {
    return { error: 'target_unavailable', payload: { verdict: 'target_unavailable', reasoning: 'tea issue fetch failed; not claiming outside KAOLA_WORKFLOW_OFFLINE=1' } };
  }
  const errCode = (lastFetchErr && lastFetchErr.code) || '';
  const signal = (lastFetchErr && lastFetchErr.signal) || '';
  return {
    error: 'indeterminate',
    payload: {
      verdict: 'indeterminate',
      reasoning_class: 'classifier_error',
      reasoning: 'tea issue fetch transient fault after ' + MAX_FETCH_ATTEMPTS + ' attempts' +
        (errCode ? ' (code=' + errCode + ')' : '') +
        (signal ? ' (signal=' + signal + ')' : '')
    }
  };
}

function classifyIssue(issueIid, root) {
  const repoRoot = root || active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);
  // #328: bundle-member overlap — owned if scalar or bundle member
  if (activeFolders.some(folder => folder.issue_iid === issueIid) ||
      activeFolders.some(folder => Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(issueIid))) {
    return { verdict: 'owned', reasoning: 'active local folder already exists' };
  }

  // ADR 0018 §5 named accepted loss: no local evidence source survives the roadmap-source
  // retirement. A target not already caught by the active-folder check above answers
  // target_unverified honestly, rather than reading a local roadmap file that no longer exists as a
  // producer. This also drops the `blocked by #N` -> depends-on:#N offline inference (same loss).
  if (OFFLINE) {
    return {
      verdict: 'target_unverified',
      reasoning: 'OFFLINE and no local evidence for issue #' + issueIid + ' (not in an active folder in this repository)'
    };
  }

  // #507/#519: bounded retry; transient/genuine by stderr-class. A genuine-negative clean_nonzero
  // (e.g. 404) is determinate-refuse; a transient-infra fault retries → indeterminate.
  const fetchResult = fetchIssueWithRetry(issueIid, forge.viewIssue.bind(forge));
  if (fetchResult.error) return fetchResult.payload;
  const issue = fetchResult.issue;

  // #510: an exit-0 unparseable/empty body is swallowed by parseJson(raw,{}) to {} → state 'unknown'.
  // Under the corrected taxonomy this is a TRANSIENT degradation (escalate), NOT a determinate refuse:
  // a malformed/empty response is an infra-degradation signal, not a genuine "issue gone".
  const _st = (issue.state || '').toLowerCase();
  if (_st !== 'open' && _st !== 'closed') {
    return { verdict: 'indeterminate', reasoning_class: 'classifier_error', reasoning: 'tea issue response unparseable/empty (exit 0); transient' };
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    return { verdict: 'red', reasoning: 'issue #' + issueIid + ' is already closed' };
  }

  // #519: issueHasRemoteClaimNotes can throw a TransientFetchError (site-5 equivalent) — route it to
  // the indeterminate emitter rather than crashing or silently catching to "no remote claim". The
  // label check runs FIRST and short-circuits (preserving the pre-#519 OR order) so the remote-claim
  // probe is skipped — and cannot transient-fault — when the in-progress label already says blocked.
  const blockedByLabel = issueHasWorkflowInProgressLabel(issue.labels || []);
  let blocked = blockedByLabel;
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimNotes(issueIid);
    } catch (e) {
      if (e instanceof TransientFetchError || e.transient === true) {
        return {
          verdict: 'indeterminate',
          reasoning_class: 'classifier_error',
          reasoning: 'tea remote-claim probe transient fault' +
            (e.code ? ' (code=' + e.code + ')' : '') + (e.signal ? ' (signal=' + e.signal + ')' : '')
        };
      }
      throw e;
    }
  }
  // Name WHICH artifact blocked: the two are not interchangeable and the short-circuit above
  // already knows which one fired. The label never expires and only a hand-removal clears it; a
  // timestamped kw:claim comment stops blocking 24h after its last update.
  if (blocked) {
    return {
      verdict: 'blocked',
      reasoning: blockedByLabel
        ? 'issue #' + issueIid + ' has a remote workflow claim: the ' + forge.CLAIM_LABEL + ' label is on the issue. '
          + 'That label never expires — remove it from the issue to release the claim.'
        : 'issue #' + issueIid + ' has a remote workflow claim: a kw:claim marker comment is on the issue. '
          + 'Delete that comment to release the claim; a timestamped marker also stops blocking 24h after its last update.'
    };
  }

  return classify(issue);
}

function cmdClassify() {
  const args = parseArgs(process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const repoRoot = active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);

  // #328: bundle-member overlap — owned if scalar or bundle member
  if (activeFolders.some(function(folder) { return folder.issue_iid === args.issue; }) ||
      activeFolders.some(function(folder) { return Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(args.issue); })) {
    process.stdout.write(JSON.stringify({ verdict: 'owned', reasoning: 'active local folder already exists' }) + '\n');
    return;
  }

  // ADR 0018 §5 named accepted loss: same honest OFFLINE answer as classifyIssue above.
  if (OFFLINE) {
    process.stdout.write(JSON.stringify({
      verdict: 'target_unverified',
      reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (not in an active folder in this repository)'
    }) + '\n');
    return;
  }

  // #507/#519: bounded retry; transient/genuine by stderr-class. A genuine-negative clean_nonzero
  // (e.g. 404) is determinate-refuse; a transient-infra fault retries → indeterminate.
  const fetchResult2 = fetchIssueWithRetry(args.issue, forge.viewIssue.bind(forge));
  if (fetchResult2.error) {
    process.stdout.write(JSON.stringify(fetchResult2.payload) + '\n');
    return;
  }
  const issue = fetchResult2.issue;

  // #510: an exit-0 unparseable/empty body swallowed to {} → state 'unknown' is a TRANSIENT
  // degradation (escalate), NOT a determinate refuse (mirrors classifyIssue above).
  const _st2 = (issue.state || '').toLowerCase();
  if (_st2 !== 'open' && _st2 !== 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'indeterminate', reasoning_class: 'classifier_error', reasoning: 'tea issue response unparseable/empty (exit 0); transient' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  // #519: issueHasRemoteClaimNotes can throw a TransientFetchError (site-5 equivalent) — route it to
  // the indeterminate emitter rather than crashing or silently catching to "no remote claim". The
  // label check runs FIRST and short-circuits (preserving the pre-#519 OR order) so the remote-claim
  // probe is skipped — and cannot transient-fault — when the in-progress label already says blocked.
  const blockedByLabel = issueHasWorkflowInProgressLabel(issue.labels || []);
  let blocked = blockedByLabel;
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimNotes(args.issue);
    } catch (e) {
      if (e instanceof TransientFetchError || e.transient === true) {
        process.stdout.write(JSON.stringify({
          verdict: 'indeterminate',
          reasoning_class: 'classifier_error',
          reasoning: 'tea remote-claim probe transient fault' +
            (e.code ? ' (code=' + e.code + ')' : '') + (e.signal ? ' (signal=' + e.signal + ')' : '')
        }) + '\n');
        return;
      }
      throw e;
    }
  }
  // Name WHICH artifact blocked — see the same emitter in classifyIssue above.
  if (blocked) {
    process.stdout.write(JSON.stringify({
      verdict: 'blocked',
      reasoning: blockedByLabel
        ? 'issue #' + args.issue + ' has a remote workflow claim: the ' + forge.CLAIM_LABEL + ' label is on the issue. '
          + 'That label never expires — remove it from the issue to release the claim.'
        : 'issue #' + args.issue + ' has a remote workflow claim: a kw:claim marker comment is on the issue. '
          + 'Delete that comment to release the claim; a timestamped marker also stops blocking 24h after its last update.'
    }) + '\n');
    return;
  }

  const result = classify(issue);
  process.stdout.write(JSON.stringify(result) + '\n');
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitea-workflow-classifier.js <classify>');
  if (sub === 'classify') return cmdClassify();
  throw new Error('unknown subcommand: ' + sub);
}

// #579: Lane-session helpers — resolveSessionMarker + classifyLane.
// These are PURE functions (no I/O, no forge CLI), exported for in-process
// consumption by claim.js cmdStatus + cmdResume. resolveSessionMarker is also
// imported by claim.js to stamp session_marker at writeState time.
// (Byte-identical to canonical classifier.js #579 block — no forge renaming needed.)
// ---------------------------------------------------------------------------

function resolveSessionMarker(env) {
  const src = env || process.env;
  const fixed = src && src.KAOLA_SESSION_MARKER;
  if (fixed && String(fixed).trim()) return String(fixed).trim();
  return 's-' + process.pid + '-' + Date.now().toString(36);
}

function classifyLane(lane, ctx) {
  const { ownSession, explicitResumeIssues, coTenantSignal, now, staleMs } = ctx;
  const ms = typeof staleMs === 'number' ? staleMs : adaptiveSchema.LANE_STALENESS_MS;
  const ts = typeof now === 'number' ? now : Date.now();
  if (lane.session_marker && lane.session_marker === ownSession) {
    return { bucket: 'mine', reasoning: 'session_marker matches own session' };
  }
  if (explicitResumeIssues && explicitResumeIssues.size > 0) {
    const memberSet = new Set([lane.issue_number].concat(lane.issue_numbers || []));
    for (const n of memberSet) {
      if (n != null && explicitResumeIssues.has(n)) {
        return { bucket: 'stale', reasoning: 'explicit resume instruction for issue #' + n };
      }
    }
  }
  if (coTenantSignal) {
    return { bucket: 'live', reasoning: 'co-tenant signal indicates another active session' };
  }
  if (lane.claim_ts) {
    const age = ts - Date.parse(lane.claim_ts);
    if (Number.isFinite(age) && age < ms) {
      return { bucket: 'ambiguous', reasoning: 'fresh liveness marker (age ' + Math.round(age / 1000) + 's < ' + Math.round(ms / 1000) + 's threshold) — ask before stomping' };
    }
  }
  return { bucket: 'stale', reasoning: lane.claim_ts ? 'liveness marker is stale (age > threshold)' : 'no liveness marker (pre-#579 or abandoned)' };
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  classify,
  classifyIssue,
  issueHasRemoteClaimNotes,
  issueHasWorkflowInProgressLabel,
  parseDependsOn,
  // #519: stderr-error-class axis — transient-infra signature detection + the combined verdict.
  // (Required by kaola-gitea-workflow-run-chains.js's single-source transient-retry surface;
  // omitting these makes `isTransientFetchStderr` undefined → TypeError on a failing chain — #550.)
  classifyFetchError,
  isTransientFetchStderr,
  isTransientFetchError,
  TransientFetchError,
  // #579: lane session helpers.
  resolveSessionMarker,
  classifyLane,
};
