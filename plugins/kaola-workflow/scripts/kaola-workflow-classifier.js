#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readActiveFolders } = require('./kaola-workflow-active-folders');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema'); // LANE_STALENESS_MS (byte-identical anchor)

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

// ---------------------------------------------------------------------------
// Shared utilities (copied from kaola-workflow-claim.js)
// ---------------------------------------------------------------------------

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function ghExec(args) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], { encoding: 'utf8' }).trim();
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

// #507: boundary-2 fetch error classification — mirrors claim.js classifySubprocessError.
// Partitions the error from a gh/forge CLI fetch into three buckets:
//   'spawn_fault'   — CLI never started (ENOENT/EAGAIN/EMFILE/ENOMEM; e.status is null, no signal)
//   'killed'        — CLI was signalled or timed out (e.killed===true or e.signal present)
//   'clean_nonzero' — CLI ran and exited non-zero (e.status is a non-null number); determinate
function classifyFetchError(e) {
  if (e.status != null) return 'clean_nonzero';
  if (e.killed === true || e.signal) return 'killed';
  if (e.code && ['ENOENT', 'EAGAIN', 'EMFILE', 'ENOMEM'].indexOf(e.code) !== -1) return 'spawn_fault';
  return 'killed'; // unknown non-status fault — treat as transient
}

// #519: AXIS REPLACEMENT — partition a gh/forge CLI fetch error by its stderr ERROR-CLASS,
// not by exit code alone. A `clean_nonzero` exit (the CLI ran and exited non-zero) is no longer
// blanket-determinate: a TRANSIENT-INFRA signature in stderr (TLS handshake timeout / API
// rate-limit / DNS "Could not resolve host" / connection reset / ETIMEDOUT / 5xx) must escalate
// like a killed/spawn-fault, NOT refuse. A genuine-negative (404 / "Could not resolve to an
// Issue" / closed / assigned) — and ANY UNRECOGNIZED stderr — stays determinate-refuse: escalation
// requires POSITIVE evidence of an infra fault; "can't tell" at a claim gate stays refuse so a
// genuinely-gone target is never silently held for a human.
//
// KNOWN TRANSIENT-INFRA STDERR SIGNATURES (the ONLY patterns that flip clean_nonzero → transient).
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

// #519: true iff the captured stderr/stdout text carries a KNOWN transient-infra signature.
function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #519: combine the exit-code class with the stderr error-class into a single transient verdict.
// Returns true iff the fault should ESCALATE (retry + indeterminate), false iff it should refuse.
// - spawn_fault / killed → ALWAYS transient (the CLI never produced a determinate verdict).
// - clean_nonzero → transient ONLY when stderr carries a known transient signature; else refuse.
// A real gh error writes to STDERR, but the CLI mock seam may surface a signature on STDOUT, so
// both streams are consulted (the execFileSync sites capture both).
function isTransientFetchError(e) {
  const cls = classifyFetchError(e);
  if (cls !== 'clean_nonzero') return true; // spawn_fault / killed — transient by construction
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

// #507: overridable backoff for boundary-2 retry (mirrors claim.js classifierTimeoutMs pattern).
// Tests set KAOLA_CLASSIFIER_BACKOFF_MS=0 to keep the suite fast.
function fetchBackoffMs() {
  const v = parseInt(process.env.KAOLA_CLASSIFIER_BACKOFF_MS || '', 10);
  return (Number.isFinite(v) && v >= 0) ? v : 50;
}

// #507: synchronous sleep for retry backoff (Atomics.wait — safe in sync path).
function syncSleepFetch(ms) {
  if (ms <= 0) return;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {}
}

// #519: a typed transient-fetch fault — thrown by a wrapped exec when the underlying gh/forge
// fault carries a known transient-infra signature, so the cmdClassify catch can route it to the
// EXISTING indeterminate/escalate emitter instead of crashing to clean_nonzero (the live repro).
class TransientFetchError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransientFetchError';
    this.transient = true;
    this.cause = cause;
    if (cause) { this.code = cause.code; this.signal = cause.signal; }
  }
}

// #519: getRepoOwnerName was a BARE unwrapped ghExec — a transient `gh repo view` fault propagated
// out of issueHasRemoteClaimComment (the throw is BEFORE that function's try) → out of cmdClassify →
// main() catch → exit 1 (clean_nonzero, the literal first failure in the live repro). Wrap it: a
// fault carrying a KNOWN transient-infra stderr signature (TLS timeout / rate-limit / DNS) re-throws
// as a TransientFetchError (cmdClassify → indeterminate); ANY other fault (no-CLI spawn fault, not a
// repo, genuine non-zero) returns null — best-effort, the caller proceeds (no remote identity is not
// a claim-blocking condition). The narrow signature predicate keeps the no-CLI/offline test path
// returning null instead of escalating, while still catching the live TLS-timeout repro.
function getRepoOwnerName() {
  let raw;
  try {
    raw = ghExec(['repo', 'view', '--json', 'owner,name']);
  } catch (e) {
    const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
    if (isTransientFetchStderr(combined)) throw new TransientFetchError('gh repo view transient fault', e);
    return null; // no-CLI / not-a-repo / genuine fault — no remote identity, not claim-blocking
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return { owner: d.owner.login, name: d.name };
  } catch (_) { return null; }
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// Label parsers
// ---------------------------------------------------------------------------

const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;

function parseDependsOn(labels) {
  for (const lbl of labels) {
    const m = String(lbl.name || lbl).match(DEPENDS_ON_REGEX);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function labelName(label) {
  return String((label && label.name) || label || '');
}

function issueHasWorkflowInProgressLabel(labels) {
  return (labels || []).some(function(label) {
    return labelName(label) === 'workflow:in-progress';
  });
}

// #519 (site 5): claim-DETECTION is best-effort by design — a no-CLI / spawn fault, a genuine
// non-zero, or a malformed body all stay a return-false (no detectable claim), UNCHANGED. We re-throw
// a TransientFetchError ONLY when the exec stderr carries a KNOWN transient-infra signature (TLS
// timeout / rate-limit / DNS) — that specific blip would otherwise silently conflate to "no claim"
// (a false-"unclaimed"), so it escalates. NOTE the narrower predicate (isTransientFetchStderr on the
// captured stream) vs the target-fetch axis: a spawn_fault on claim-detection means "detection
// unavailable" (best-effort false), NOT "must escalate" — only a positive infra signature escalates.
function isInfraTransientExec(e) {
  if (e instanceof TransientFetchError || e.transient === true) return true;
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

function issueHasRemoteClaimComment(issueNum) {
  if (OFFLINE) return false;
  let repo;
  try {
    repo = getRepoOwnerName(); // re-throws TransientFetchError on an infra-signature repo-view fault
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('gh repo view transient fault', e);
    return false; // no-CLI / genuine fault — claim-detection unavailable (best-effort false)
  }
  if (!repo) return false;
  let raw;
  try {
    raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/' + issueNum + '/comments']);
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('gh api comments transient fault', e);
    return false; // no-CLI / genuine fault — no detectable remote claim
  }
  try {
    const comments = JSON.parse(raw || '[]');
    return comments.some(function(comment) {
      if (!comment || !comment.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(comment.body)) return false;
      if (!comment.updated_at) return true;
      return Date.now() - new Date(comment.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (_) {
    return false; // malformed body — best-effort: treat as no detectable claim (unchanged)
  }
}

// ---------------------------------------------------------------------------
// Args parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Core classify function
// ---------------------------------------------------------------------------

function checkDependsOn(depN) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depN + ' label present; conservative block' };
  }
  let depState = 'open';
  try {
    const raw = ghExec(['issue', 'view', String(depN), '--json', 'state,closedAt']);
    depState = String(JSON.parse(raw).state || 'open').toLowerCase();
  } catch (_) {}
  if (depState !== 'closed') {
    return { verdict: 'blocked', reasoning: 'depends-on:#' + depN + ' is still open' };
  }
  return null;
}

// The classifier reports facts about a candidate issue's STATE — is a prerequisite still open, is
// the issue already claimed, does it exist. It does not decide whether two pieces of work may run at
// the same time: the runtime agent owns that, and where the runtime supports concurrency it is on.
function classify(issue) {
  const depN = parseDependsOn(issue.labels || []);
  if (depN !== null) {
    const blocked = checkDependsOn(depN);
    if (blocked) return blocked;
  }

  return { verdict: 'green', reasoning: 'no dependency block' };
}

// ---------------------------------------------------------------------------
// cmdClassify
// ---------------------------------------------------------------------------

function cmdClassify(argv) {
  const args = parseArgs(argv || process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const root = getRoot();
  const activeFolders = readActiveFolders(root);
  const activeStateIssues = new Set(activeFolders.map(folder => folder.issue_number).filter(Boolean));

  // #328: also collect all bundle member issue numbers from active folders
  const bundleMemberIssues = new Set();
  for (const f of activeFolders) for (const n of (f.issue_numbers || [])) bundleMemberIssues.add(n);

  // Already claimed (scalar) or a member of a live bundle → exit 2, no stdout
  if (activeStateIssues.has(args.issue) || bundleMemberIssues.has(args.issue)) {
    process.exitCode = 2;
    return;
  }

  // OFFLINE path — read from local roadmap file
  if (OFFLINE) {
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_number === args.issue)) {
      process.stdout.write(JSON.stringify({
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
      }) + '\n');
      return;
    }
    let labels = [];
    let body = '';
    if (fs.existsSync(roadmapFile)) {
      const content = fs.readFileSync(roadmapFile, 'utf8');
      const nextStep = field(content, 'next_step');
      if (/blocked by #\d+/i.test(nextStep)) {
        const m = nextStep.match(/#(\d+)/);
        if (m) labels = [{ name: 'depends-on:#' + m[1] }];
      }
      body = content;
    }
    const result = classify({ number: args.issue, labels, body });
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  // Online path — #507/#519: bounded retry on transient fetch faults. The transient/genuine
  // partition is by stderr ERROR-CLASS (isTransientFetchError), not by exit code alone (#519): a
  // clean_nonzero exit carrying a transient-infra signature (TLS timeout / rate-limit / DNS) now
  // retries + escalates; a genuine-negative (or unrecognized) clean_nonzero stays determinate-refuse.
  let issue;
  {
    const MAX_FETCH_ATTEMPTS = 3;
    const backoffMs = fetchBackoffMs();
    let lastFetchErr = null;
    let lastFetchTransient = false;
    let fetchSucceeded = false;
    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      if (attempt > 0) syncSleepFetch(backoffMs);
      try {
        const raw = ghExec(['issue', 'view', String(args.issue), '--json', 'number,title,body,labels,state']);
        issue = JSON.parse(raw); // exit-0 unparseable body → SyntaxError → transient (no .status)
        fetchSucceeded = true;
        break;
      } catch (e) {
        lastFetchErr = e;
        lastFetchTransient = isTransientFetchError(e);
        if (!lastFetchTransient) break; // genuine-negative / unrecognized — determinate, do not retry
        // transient (spawn_fault / killed / transient-infra stderr): loop for next attempt
      }
    }
    if (!fetchSucceeded) {
      if (!lastFetchTransient) {
        process.stdout.write(JSON.stringify({ verdict: 'target_unavailable', reasoning: 'gh issue fetch failed; not claiming outside KAOLA_WORKFLOW_OFFLINE=1' }) + '\n');
        return;
      }
      // Persistent transient fault — emit indeterminate so callers can escalate (#507/#519)
      const errCode = (lastFetchErr && lastFetchErr.code) || '';
      const signal = (lastFetchErr && lastFetchErr.signal) || '';
      process.stdout.write(JSON.stringify({
        verdict: 'indeterminate',
        reasoning_class: 'classifier_error',
        reasoning: 'gh issue fetch transient fault after ' + MAX_FETCH_ATTEMPTS + ' attempts' +
          (errCode ? ' (code=' + errCode + ')' : '') +
          (signal ? ' (signal=' + signal + ')' : '')
      }) + '\n');
      return;
    }
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  // #519: getRepoOwnerName / the comments `gh api` can throw a TransientFetchError (sites 1 + 5).
  // Route it to the EXISTING indeterminate/escalate emitter rather than crashing to clean_nonzero
  // (main()'s catch → exit 1) or silently catching to "no remote claim" → proceed. The label check
  // runs FIRST and short-circuits (preserving the pre-#519 OR evaluation order) so the remote-claim
  // probe is skipped — and cannot transient-fault — when the in-progress label already says blocked.
  let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimComment(args.issue);
    } catch (e) {
      if (e instanceof TransientFetchError || e.transient === true) {
        const errCode = e.code || '';
        const signal = e.signal || '';
        process.stdout.write(JSON.stringify({
          verdict: 'indeterminate',
          reasoning_class: 'classifier_error',
          reasoning: 'gh remote-claim probe transient fault' +
            (errCode ? ' (code=' + errCode + ')' : '') +
            (signal ? ' (signal=' + signal + ')' : '')
        }) + '\n');
        return;
      }
      throw e;
    }
  }
  if (blocked) {
    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');
    return;
  }

  const result = classify(issue);
  process.stdout.write(JSON.stringify(result) + '\n');
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(
    'usage: kaola-workflow-classifier.js [classify] --issue <N> [--json]\n' +
    '       kaola-workflow-classifier.js --issue <N> [--json]   (top-level form)\n' +
    '       kaola-workflow-classifier.js --help\n'
  );
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-classifier.js [classify] --issue <N>');
  if (sub === '--help' || sub === '-h') { printHelp(); return; }
  if (sub === '--issue') return cmdClassify(process.argv.slice(2));
  if (sub === 'classify') return cmdClassify(process.argv.slice(3));
  throw new Error('unknown subcommand: ' + sub);
}

// ---------------------------------------------------------------------------
// #579: Lane-session helpers — resolveSessionMarker + classifyLane.
// These are PURE functions (no I/O, no forge CLI), exported for in-process
// consumption by claim.js cmdStatus + cmdResume. resolveSessionMarker is also
// imported by claim.js to stamp session_marker at writeState time.
// ---------------------------------------------------------------------------

// Resolve the session marker for the CURRENT run. If KAOLA_SESSION_MARKER is set
// in `env` (or process.env), use it verbatim so all lifecycle invocations within one
// session share a stable identity. Otherwise mint a one-time `s-<pid>-<ts36>` token.
function resolveSessionMarker(env) {
  const src = env || process.env;
  const fixed = src && src.KAOLA_SESSION_MARKER;
  if (fixed && String(fixed).trim()) return String(fixed).trim();
  return 's-' + process.pid + '-' + Date.now().toString(36);
}

// Classify an active-folder lane item into one of four buckets:
//   'mine'      — this run's own session (operate normally)
//   'live'      — another active session that must not be stomped
//   'stale'     — resumable leftover (old/absent marker)
//   'ambiguous' — fresh foreign marker without an explicit instruction (ask, don't stomp)
//
// Per-lane precedence ladder (first match wins):
//   1. session_marker === ownSession → 'mine'
//   2. lane.issue_number OR any lane.issue_numbers member ∈ explicitResumeIssues → 'stale'
//      (explicit "resume N" instruction beats liveness — we know we own it)
//   3. coTenantSignal → 'live' (blanket "another session is working" signal)
//   4. Liveness heuristic:
//      a. claim_ts present AND age < staleMs → 'ambiguous' (fresh → ask)
//      b. claim_ts absent OR age >= staleMs → 'stale' (old leftover / pre-#579 markerless)
//
// ctx: { ownSession, explicitResumeIssues:Set<number>, coTenantSignal:bool,
//         now:number (Date.now()), staleMs:number }
function classifyLane(lane, ctx) {
  const { ownSession, explicitResumeIssues, coTenantSignal, now, staleMs } = ctx;
  const ms = typeof staleMs === 'number' ? staleMs : adaptiveSchema.LANE_STALENESS_MS;
  const ts = typeof now === 'number' ? now : Date.now();

  // 1. Mine
  if (lane.session_marker && lane.session_marker === ownSession) {
    return { bucket: 'mine', reasoning: 'session_marker matches own session' };
  }

  // 2. Explicit resume instruction (beats co-tenant + liveness)
  if (explicitResumeIssues && explicitResumeIssues.size > 0) {
    const memberSet = new Set([lane.issue_number].concat(lane.issue_numbers || []));
    for (const n of memberSet) {
      if (n != null && explicitResumeIssues.has(n)) {
        return { bucket: 'stale', reasoning: 'explicit resume instruction for issue #' + n };
      }
    }
  }

  // 3. Co-tenant signal
  if (coTenantSignal) {
    return { bucket: 'live', reasoning: 'co-tenant signal indicates another active session' };
  }

  // 4. Liveness heuristic
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
  // #519: stderr-error-class axis — transient-infra signature detection + the combined verdict.
  classifyFetchError,
  isTransientFetchStderr,
  isTransientFetchError,
  TransientFetchError,
  // #579: lane session helpers.
  resolveSessionMarker,
  classifyLane,
};
