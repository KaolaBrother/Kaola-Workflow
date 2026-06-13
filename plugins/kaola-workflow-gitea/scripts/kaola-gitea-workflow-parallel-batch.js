#!/usr/bin/env node
// @generated from scripts/kaola-workflow-parallel-batch.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-parallel-batch.js (issue #281)
//
// The parallel-batch STATE aggregator for true parallel ready-set execution.
//
// SCOPE (blueprint §0/§9): this aggregator owns batch STATE ONLY and NEVER
// dispatches an agent. The harness's only real concurrency is the MAIN SESSION
// issuing multiple Agent() calls in one message; a script cannot spawn agents
// and a subagent cannot dispatch a subagent. The plan-run SKILL (main session)
// owns concurrent DISPATCH; this script manages the batch lifecycle so the SKILL
// can open → dispatch N → seal → join → advance. A green plan-run is NOT evidence
// of wall-clock parallelism; the unit suite proves STATE correctness only.
//
// PURE COMPOSITION over next-action.js + commit-node.js (+ plan-validator.js):
// it shells those siblings via execFileSync (mirroring adaptive-node.js:66-75)
// and never require()-and-mutates them. For ledger flips it imports the PURE
// spliceLedgerNode from adaptive-node.js (importing a pure splicer is composition;
// the mutation happens via this aggregator's OWN writeFile).
//
// Subcommands (all require --project P and --json; exit≠0 on refuse):
//   open-batch   --project P [--max N]     (MUTATES ledger + baselines + manifest)
//   top-up       --project P [--max N]     (MUTATES ledger + baselines + manifest; rolling dispatch)
//   seal-member  --project P --node-id N    (MUTATES ledger + manifest member)
//   seal         --project P                (MUTATES ledger + manifest)
//   join         --project P                (MUTATES manifest; read-only batches have nothing to merge — #364)
//   reconcile    --project P [--abort]     (MUTATES ledger + manifest; crash repair)
//   status       --project P                (READ-ONLY)
//
// Manifest: kaola-workflow/{project}/.cache/active-batch.json (single active
// batch; non-hashed runtime artifact). createdAt is injected (deterministic).
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');
// #354: the shared fence-aware compliance-section appender (single home for the section shape).
// adaptive-schema.js is the byte-identical ×4 anchor (same filename across editions — NOT renamed),
// so this require is identical in every port.
const { spliceComplianceSection, RUNNING_SET_NAME } = require('./kaola-workflow-adaptive-schema');

// ---------------------------------------------------------------------------
// Sibling-script filename constants — the ONLY lines the forge forks rename.
// Keep each on its own clearly-named line so a port is a one-line edit.
// ---------------------------------------------------------------------------
const NEXT_ACTION = 'kaola-gitea-workflow-next-action.js';
const COMMIT_NODE = 'kaola-gitea-workflow-commit-node.js';
const VALIDATOR   = 'kaola-gitea-workflow-plan-validator.js';
const TASK_MIRROR = 'kaola-gitea-workflow-task-mirror.js';
const ADAPTIVE_NODE = './kaola-gitea-workflow-adaptive-node';
const PLAN_VALIDATOR = './kaola-gitea-workflow-plan-validator';
const CLASSIFIER     = './kaola-gitea-workflow-classifier';

const nextActionPath = path.join(__dirname, NEXT_ACTION);
const commitNodePath = path.join(__dirname, COMMIT_NODE);
const validatorPath  = path.join(__dirname, VALIDATOR);
const taskMirrorPath = path.join(__dirname, TASK_MIRROR);

// ---------------------------------------------------------------------------
// BATCH_STATES — closed batch lifecycle vocabulary (blueprint D3). Lives HERE
// (NOT in adaptive-schema.js — no node in the frozen plan may write the schema).
//
// #303: the lifecycle is `opening → open → sealed → joined`.
//   opening — crash-safe transaction marker: the manifest is written with the intended
//             member set BEFORE the ledger rows are flipped (open-batch) or a top-up member
//             is added, so a crash between the two file writes is RECONCILABLE (reconcile),
//             never an undiagnosable orphan. Promoted to `open` once the ledger agrees.
//   open    — members are in_progress and dispatchable; rolling top-up may add more.
//   sealed  — every member's ledger row is terminal (evidence-shape + barrier passed).
//   joined  — finalized (a no-op for read-only batches: nothing to merge parent-side).
// The legacy `dispatched` state was declared but NEVER written by any transition (it was
// dead vocabulary); it was removed in favour of the crash-safe `opening` marker. #364
// likewise removed `joining` — it was only ever written for write-role members, which now
// serial-degrade unconditionally, so no manifest ever carries a write-role member to merge.
// ---------------------------------------------------------------------------
const BATCH_STATES = Object.freeze(['opening', 'open', 'sealed', 'joined']);

const MANIFEST_NAME = 'active-batch.json';

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  const s = String(str || '');
  try { return JSON.parse(s); } catch (_) {}
  // #355: parse the LAST line that is valid JSON — a stray log/warning line before the framed
  // JSON must NOT turn a success into an empty {} (treated as a refusal by callers).
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch (_) {}
  }
  return {};
}

// ---------------------------------------------------------------------------
// getRoot — resolve the user-repo root via git rev-parse (cwd fallback).
// ---------------------------------------------------------------------------
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// #364: the write-role member-worktree isolation machinery (snapshotMember /
// anchorMergeRef / per-member worktree provisioning / mergeRef capture / join's
// checkout-from-member-tree / memberDirty seal-vacuity guard) was EXCISED. It was
// unreachable by default (cwdEnforced defaulted false; open-batch serial-degraded
// any write-role frontier) and non-functional if force-enabled (the harness cannot
// force a dispatched subagent's CWD; members wrote to the PARENT worktree and seal
// then refused empty_member AFTER the work was done — a documented isolation leak).
// Read-only fan-out batches stay (no worktrees; evidence parent-side). Write-role
// frontiers serial-degrade UNCONDITIONALLY (the current effective behavior). See
// docs/decisions/0008-excise-write-role-batch-isolation.md for the reintroduction
// condition (a real harness cwd-forcing primitive — tracked by #376/#377).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// shellNode — thin seam: execute a Node.js script and return {exitCode,...json}.
// Fail-closed: exitCode 1 + {} on throw with no stdout. (Mirrors adaptive-node.js.)
// ---------------------------------------------------------------------------
function shellNode(scriptPath, args) {
  let stdout;
  try {
    stdout = execFileSync('node', [scriptPath, ...(args || [])], { encoding: 'utf8' });
    // #355: exitCode is a RESERVED key set LAST so a payload field named exitCode can never clobber it.
    return { ...safeJsonParse(stdout), exitCode: 0 };
  } catch (err) {
    const status = (err.status == null) ? 1 : err.status;
    return { ...safeJsonParse(err.stdout), exitCode: status };
  }
}

// ---------------------------------------------------------------------------
// #317 — mutation-time task-mirror sync + machine-readable UI transitions.
// refreshTaskMirror is fail-OPEN: a regeneration failure is recorded in the returned
// taskMirror field and NEVER rolls back a correct ledger/manifest mutation. buildTransition
// maps the ledger status to the UI status via the task-mirror's mapLedgerStatus (single source).
// Called ONLY after the final stable plan/manifest write of a successful mutation.
// ---------------------------------------------------------------------------
function refreshTaskMirror(project, shell) {
  if (!project) return { status: 'skipped' };
  const outPath = 'kaola-workflow/' + project + '/workflow-tasks.json';
  let res;
  try { res = shell(taskMirrorPath, ['--project', project, '--json']); }
  catch (_) { return { status: 'failed', path: outPath }; }
  return { status: (res && res.exitCode === 0) ? 'updated' : 'failed', path: outPath };
}

function buildTransition(id, ledgerStatus, reason, note) {
  const { mapLedgerStatus } = require(taskMirrorPath);
  const t = { id: id, status: mapLedgerStatus(ledgerStatus), ledger_status: ledgerStatus, reason: reason };
  if (note) t.note = note;
  return t;
}

// ---------------------------------------------------------------------------
// Pure helpers — composition over plan-validator / classifier (read-only require).
// ---------------------------------------------------------------------------

// parseLedgerMap — read the ## Node Ledger into a Map<id,status>. Composes the
// validator's parseLedger (pure/read-only); [] on any failure (fail-closed).
function parseLedgerMap(content) {
  try {
    const { parseLedger } = require(PLAN_VALIDATOR);
    return parseLedger(content);
  } catch (_) {
    return new Map();
  }
}

// parseWriteSet — structural declared_write_set parse, reusing the classifier's
// parseWriteSetCell so this re-check shares freeze-time semantics (comma/space
// split, the — / - empty marker). Returns a Set of normalized paths.
function parseWriteSet(cell) {
  try {
    const { parseWriteSetCell } = require(CLASSIFIER);
    return parseWriteSetCell(cell);
  } catch (_) {
    const set = new Set();
    const raw = String(cell || '').trim();
    if (!raw || raw === '—' || raw === '-') return set;
    for (const tok of raw.split(/[\s,]+/)) if (tok) set.add(tok);
    return set;
  }
}

// ---------------------------------------------------------------------------
// deriveReadyPending — readySet members whose OWN ledger status === 'pending'.
//
// next-action.js does not (yet) return readyPending; we derive it locally from
// its readySet (which excludes terminal nodes but INCLUDES in_progress) and the
// ledger statuses. This is the openable frontier (blueprint §1/D1).
// ---------------------------------------------------------------------------
function deriveReadyPending(readySet, ledger) {
  const st = id => (ledger && ledger.get(id)) || 'pending';
  // #334: a non-delegable main-session-gate node is never an openable BATCH member — the main
  // session executes it serially (schema.MAIN_SESSION_GATE_ROLE). Filtering here covers both
  // open-batch and top-up; a gate-only frontier falls into the existing empty-frontier defer
  // (open-batch returns {result:'ok', opened: []} → orchestrator routes to open-next).
  return (readySet || []).filter(n => st(n.id) === 'pending' && n.role !== 'main-session-gate');
}

// ---------------------------------------------------------------------------
// classifyBatchKind — decide the batch kind and member subset (blueprint §2/D5).
//
//   all read-only (empty write sets) → { kind:'read_only', members:<all> }
//   all write-role (non-empty)       → { kind:'write_role', members:<all> }
//   MIXED                            → { kind:'read_only', members:<read-only subset> }
//                                       (open the read-only subset first; NOT a refuse)
// ---------------------------------------------------------------------------
function classifyBatchKind(members) {
  const list = members || [];
  const isReadOnly = m => parseWriteSet(m.declared_write_set).size === 0;
  const readOnly = list.filter(isReadOnly);
  const writeRole = list.filter(m => !isReadOnly(m));

  if (writeRole.length === 0) {
    return { kind: 'read_only', members: readOnly };
  }
  if (readOnly.length === 0) {
    return { kind: 'write_role', members: writeRole };
  }
  // Mixed: open the zero-blast-radius read-only subset first.
  return { kind: 'read_only', members: readOnly };
}

// ---------------------------------------------------------------------------
// checkDisjoint — re-confirm pairwise-disjoint declared write sets, reusing the
// classifier's disjointWriteSets so this re-check cannot diverge from freeze-time
// semantics. verdict 'red' (exact/coarse overlap) → NOT disjoint (fail-closed).
// ---------------------------------------------------------------------------
function checkDisjoint(members) {
  const sets = (members || []).map(m => parseWriteSet(m.declared_write_set));
  let dj;
  try {
    const { disjointWriteSets } = require(CLASSIFIER);
    dj = disjointWriteSets(sets);
  } catch (_) {
    dj = { verdict: 'green', reasoning: 'classifier unavailable' };
  }
  return { disjoint: dj.verdict !== 'red', verdict: dj.verdict, reasoning: dj.reasoning };
}

// ---------------------------------------------------------------------------
// capMembers — clamp to min(members.length, FANOUT_CAP, --max). Document order.
// ---------------------------------------------------------------------------
function capMembers(members, opts) {
  const list = members || [];
  const fanoutCap = (opts && Number.isInteger(opts.fanoutCap) && opts.fanoutCap >= 1)
    ? opts.fanoutCap : 4;
  let cap = Math.min(list.length, fanoutCap);
  if (opts && Number.isInteger(opts.max) && opts.max >= 1) {
    cap = Math.min(cap, opts.max);
  }
  return list.slice(0, cap);
}

// ---------------------------------------------------------------------------
// hasInflightOpening — #305: true when a live manifest carries any member with
// opening:true (an interrupted rolling top-up; whole-batch state stays 'open').
// The read-side gates (crossCheckStatus / runOrient) route such a manifest to
// reconcile, and every MUTATING batch command refuses reconcile_first while it
// exists — so a crash mid-top-up is never silently mutated over. (runTopUp sets
// and clears these flags WITHIN a single call, so a flag surviving into a fresh
// invocation means a crash, not a normal top-up in flight.)
// ---------------------------------------------------------------------------
function hasInflightOpening(manifest) {
  return !!(manifest && (manifest.members || []).some(m => m.opening));
}

// ---------------------------------------------------------------------------
// crossCheckStatus — legality gate (blueprint §3, AC#5/#6). Multiple in_progress
// ledger rows are LEGAL ONLY with a valid active manifest whose member set EXACTLY
// equals them; else the orphan condition.
//
//   ≤1 in_progress (with or without manifest) → valid (legacy single-node path)
//   ≥1 in_progress + manifest matches set      → valid batch
//   >1 in_progress + no manifest/mismatch      → invalid, orphan
//
// #293 (align): the ≤1 guard is hoisted ABOVE the manifest branch so a single
// in_progress row is legacy-valid regardless of the manifest — matching the
// runOrient AC#5 gate (else if inProgressNodes.length > 1).
// ---------------------------------------------------------------------------
function crossCheckStatus(manifest, inProgressIds, runningSet) {
  const ip = (inProgressIds || []).slice().sort();

  // #377: the per-node running-set.json is the post-#364 successor of active-batch.json. The #293
  // legality invariant re-keys to it: when the in_progress rows match the running-set node set the
  // multi-in_progress is a valid per-node fan-out. A crashed 'opening' running set (or an opening:true
  // node) is RECONCILABLE (run `reconcile-running-set`), never an orphan — mirror the batch markers.
  // Checked BEFORE the ≤1 legacy path so a partial flip is not masked as idle/single_in_progress.
  if (runningSet && (runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening))) {
    return { valid: false, orphan: false, reconcilable: true, reason: 'running_set_opening_incomplete' };
  }
  if (runningSet && ip.length >= 1) {
    const rsIds = (runningSet.nodes || []).filter(n => !n.opening).map(n => n.id).slice().sort();
    if (rsIds.length === ip.length && rsIds.every((id, i) => id === ip[i])) {
      return { valid: true, orphan: false, reason: 'valid_running_set' };
    }
  }

  // #303 (gap #7): an 'opening' manifest is a crash-safe transaction marker — the open-batch
  // / top-up mutation did not finish (manifest written but the ledger flips, baselines, or
  // worktrees are incomplete, or vice-versa). It is RECONCILABLE (run `reconcile`), NEVER an
  // undiagnosable orphan, regardless of how many rows were flipped before the crash. Check it
  // FIRST so a partial flip (0 or 1 rows) is not masked by the ≤1 legacy path below.
  if (manifest && manifest.state === 'opening') {
    return { valid: false, orphan: false, reconcilable: true, reason: 'batch_opening_incomplete' };
  }

  // #305: a member-level `opening:true` marker is an interrupted ROLLING TOP-UP — `top-up`
  // appended the in-flight member to the manifest (whole-batch state stays 'open') BEFORE flipping
  // its ledger row, and a crash struck in that window. Like the whole-batch 'opening' marker above
  // it is RECONCILABLE (run `reconcile`), never an orphan and never a dispatchable valid batch —
  // and the verdict must be the SAME regardless of how many rows flipped before the crash. Check it
  // BEFORE the ≤1 legacy path and the member-set equality so a partial flip (0 or 1 rows) is not
  // masked as `idle`/`single_in_progress` and a full flip is not mis-accepted as `valid_batch`.
  if (hasInflightOpening(manifest)) {
    return { valid: false, orphan: false, reconcilable: true, reason: 'batch_topup_incomplete' };
  }

  // ≤1 in_progress — always the legacy single-node path regardless of manifest.
  if (ip.length <= 1) {
    return { valid: true, orphan: false, reason: ip.length === 1 ? 'single_in_progress' : 'idle' };
  }

  if (!manifest) {
    // >1 in_progress + no manifest → orphan.
    return { valid: false, orphan: true, reason: 'orphan_multi_in_progress' };
  }

  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  // #303: also exclude `opening:true` members — a top-up member mid-transaction is in-flight
  // (manifest-appended, ledger not yet flipped) and must not be counted against the live set.
  const memberIds = (manifest.members || []).filter(m => !m.sealed && !m.opening).map(m => m.id).slice().sort();
  const setsEqual = memberIds.length === ip.length && memberIds.every((id, i) => id === ip[i]);

  if (setsEqual) {
    return { valid: true, orphan: false, reason: 'valid_batch' };
  }
  return { valid: false, orphan: true, reason: 'orphan_member_set_mismatch' };
}

// ---------------------------------------------------------------------------
// allMembersTerminal — true when every manifest member's ledger row is terminal.
// ---------------------------------------------------------------------------
function allMembersTerminal(manifest, ledger) {
  const TERMINAL = new Set(['complete', 'n/a']);
  return (manifest.members || []).every(m => TERMINAL.has((ledger.get(m.id) || 'pending')));
}

// ---------------------------------------------------------------------------
// readManifest — parse the manifest, or null if absent/corrupt.
// ---------------------------------------------------------------------------
function readManifest(manifestPath, cacheExists, readFile) {
  if (cacheExists && !cacheExists(manifestPath)) return null;
  let raw;
  try { raw = readFile(manifestPath); } catch (_) { return null; }
  const parsed = safeJsonParse(raw);
  return (parsed && parsed.members) ? parsed : null;
}

// ---------------------------------------------------------------------------
// listInProgress — enumerate ALL in_progress ledger row ids (blueprint §3).
// ---------------------------------------------------------------------------
function listInProgress(ledger) {
  const ids = [];
  for (const [id, st] of ledger) {
    if (st === 'in_progress') ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// batchCoordinationGuard (#383/#391b) — the layered HALT-FENCE + LIVE-COORDINATION prologue for the
// batch-scheduler subcommands (open-batch / top-up). Composes the SHARED adaptive-node probe so the
// mutual-exclusion vocabulary (serial_node_live / scheduler_active / batch_active) and the #293
// orphan-legality agreement never drift between the serial spine and the batch surface.
//   excl: any subset of {serial, scheduler, batch}.
// Returns a typed refusal (zero mutation) on the first tripped layer, or null to proceed. Vacuously-
// pass under serial-fallback (no halt, no running set, ≤1 in_progress that the caller's own manifest
// precondition then handles).
// ---------------------------------------------------------------------------
function batchCoordinationGuard(opts, excl) {
  const { planPath, readFile, cacheExists } = opts;
  const { readDurableConsentHalt } = require('./kaola-workflow-adaptive-schema');
  const { probeCoordination, coordinationRefusal } = require(ADAPTIVE_NODE);

  // Layer 2 — durable consent-halt fence (#391b).
  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}
  if (readDurableConsentHalt(planContent)) {
    return { result: 'refuse', reason: 'halt_pending', detail: 'a durable consent_halt: pending marker is set in the ## Node Ledger — clear it (clear-halt) before scheduling a batch' };
  }

  // Layer 3 — live-coordination mutual exclusion (#383).
  const coord = probeCoordination({ planPath, readFile, cacheExists });
  return coordinationRefusal(coord, excl);
}

// ---------------------------------------------------------------------------
// runOpenBatch — MUTATES ledger + baselines + manifest.
//
// 1. shell next-action; readyPending = openable frontier.
// 2. empty frontier → defer ({result:'ok',allDone,opened:[]}); no manifest.
// 3. classify kind + member subset (mixed → read-only subset); write_role →
//    re-confirm disjoint (fail-closed not_disjoint).
// 4. cap at min(frontier, FANOUT_CAP, --max).
// 5. flip each member ledger row → in_progress (allowFrom ['pending']); write plan.
// 6. shell commit-node --node-id id --start per member (idempotent baseline).
// 7. write manifest state:'open' LAST.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// appendBatchTiming (#373 / D1) — best-effort wall-clock telemetry sidecar (batch
// member lifecycle). Appends ONE JSON line per transition to
// kaola-workflow/{project}/.cache/node-timings.jsonl. Append-only; NEVER throws — a
// timings write failure must never refuse or alter a transition.
// ---------------------------------------------------------------------------
function appendBatchTiming(planPath, node, event) {
  try {
    const fs = require('fs');
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(
      path.join(cacheDir, 'node-timings.jsonl'),
      JSON.stringify({ node: node, event: event, ts: new Date().toISOString() }) + '\n'
    );
  } catch (_) { /* best-effort: telemetry never blocks a member transition */ }
}

function runOpenBatch(opts) {
  const {
    planPath, manifestPath, max, fanoutCap, fanoutCapReadonly, shell, readFile, writeFile, mkdirp, now,
    project,
  } = opts;

  // Pull spliceLedgerNode (pure import — composition).
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  // #303 (gap #8): INTEGRITY GATE before any mutation. A tampered or structurally-invalid frozen
  // plan must not be partially executed by the scheduler. --resume-check covers hash-freeze +
  // post-freeze tamper + cycle + unique-sink + role-library membership + depends_on resolvability
  // (full graph integrity, not just the hash). Fail-closed: any non-ok refuses with zero mutation.
  const integrity = shell(validatorPath, [planPath, '--resume-check', '--json']);
  if (integrity.exitCode !== 0 || integrity.ok !== true) {
    return { result: 'refuse', reason: 'plan_integrity_failed', detail: integrity.reason || null };
  }

  // #391b HALT FENCE + #383 LIVE-COORDINATION (matrix: open-batch excl serial + scheduler). A durable
  // consent_halt fences the scheduler too; a live serial node (open-next) or a live running-set fan-out
  // (open-ready) must not be co-scheduled against by opening a batch (the #383(a)/(b) union wedge). The
  // batch's OWN active-manifest precondition is checked just below — excl-batch is not applicable here.
  const coGuard = batchCoordinationGuard(opts, ['serial', 'scheduler']);
  if (coGuard) return coGuard;

  const nextAction = shell(nextActionPath, [planPath, '--json']);
  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }
  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: [], taskTransitions: [] };
  }

  let planContent = readFile(planPath);
  const ledger = parseLedgerMap(planContent);

  // #303 (gap #6): ACTIVE-MANIFEST PRECONDITION. An existing live batch must never be silently
  // overwritten. Compare the existing manifest's UNSEALED members against the ledger in_progress
  // rows (the frontier empties once opened, so the live set is the in_progress set, not readyPending).
  //   'opening'                          → a crash-in-progress: refuse with a reconcile pointer.
  //   'open' + members == in_progress    → idempotent re-open of THIS live batch: return it as-is.
  //   'open'/'sealed' other              → a different / mid-finalize batch: refuse active_batch_exists.
  //   'joined'                           → a finished batch not yet cleared: proceed (overwrite).
  const existing = readManifest(manifestPath, opts.cacheExists, readFile);
  if (existing && existing.state !== 'joined') {
    if (existing.state === 'opening') {
      return { result: 'refuse', reason: 'reconcile_first', state: 'opening', batchId: existing.batchId };
    }
    // #305: a member.opening:true marker (interrupted top-up; state still 'open') must be
    // reconciled before a fresh open, not mis-reported as active_batch_exists below.
    if (hasInflightOpening(existing)) {
      return { result: 'refuse', reason: 'reconcile_first', state: existing.state, batchId: existing.batchId, detail: 'member_opening_incomplete' };
    }
    const liveIds = (existing.members || []).filter(m => !m.sealed).map(m => m.id).slice().sort();
    const ipSorted = listInProgress(ledger).slice().sort();
    const matchesLive = liveIds.length === ipSorted.length && liveIds.every((id, i) => id === ipSorted[i]);
    if (existing.state === 'open' && matchesLive) {
      return {
        result: 'ok', idempotent: true, batchId: existing.batchId, state: existing.state, kind: existing.kind,
        members: (existing.members || []).map(m => ({
          id: m.id, role: m.role, model: m.model, declared_write_set: m.declared_write_set,
          kind: m.kind, baseline: m.baseline,
        })),
        allDone: false,
        // #317: re-emit each live member → in_progress (idempotent re-open of THIS batch).
        taskTransitions: (existing.members || []).filter(m => !m.sealed).map(m => buildTransition(m.id, 'in_progress', 'open-batch')),
        taskMirror: refreshTaskMirror(project, shell),
      };
    }
    return { result: 'refuse', reason: 'active_batch_exists', state: existing.state, batchId: existing.batchId };
  }

  const frontier = deriveReadyPending(nextAction.readySet || [], ledger);
  if (frontier.length === 0) {
    // No openable (own-pending) frontier — defer to the legacy single-node loop.
    return { result: 'ok', allDone: false, opened: [], taskTransitions: [] };
  }

  // Classify; mixed frontier → the read-only subset.
  const classified = classifyBatchKind(frontier);
  const kind = classified.kind;

  // Write-role batch eligibility.
  if (kind === 'write_role') {
    // #320/#364: a write-role batch can only stay isolated if each member subagent runs from its
    // OWN member worktree, and this harness cannot force a dispatched subagent's CWD — the writes
    // land in the PARENT worktree (the #249 leak). The member-worktree isolation path was excised
    // (#364): write-role frontiers now serial-degrade UNCONDITIONALLY — a zero-mutation return the
    // orchestrator routes to the single-node open-next path. The degrade fires for ANY write-role
    // frontier (file-disjoint OR coarse-area overlapping), so a coarse-overlap antichain
    // serial-degrades gracefully instead of hard-refusing as not_disjoint — the runtime side of the
    // #321 freeze/runtime alignment (freeze keeps such an antichain as in-grammar/ask, runtime runs
    // it serially; neither refuses). The `degraded:true` shape is preserved for prose compatibility.
    // Reintroduction condition: a real harness cwd-forcing primitive (#376 lane-containment hook +
    // #377 per-node running-set scheduler). See docs/decisions/0008-excise-write-role-batch-isolation.md.
    return { result: 'ok', degraded: true, reason: 'cwd_unenforceable', opened: [], allDone: false, taskTransitions: [] };
  }

  // Cap the member set. The frontier may be WIDER than the cap (#303: planner fan-out width
  // is uncapped at validation); we open at most cap members now and leave the remaining
  // ready-pending siblings as the implicit QUEUE that `top-up` drains by rolling dispatch.
  // #375 (D3): read-only batches use the higher read-only cap (write-role degrades above).
  const effectiveCap = fanoutCapReadonly || fanoutCap;
  const capped = capMembers(classified.members, { fanoutCap: effectiveCap, max });

  // BASELINES-FIRST: record all N baselines BEFORE any ledger flip or plan write.
  // commit-node --start is record-base-only / idempotent / ledger-independent, so
  // recording a baseline before the row is flipped is safe. On any baseline failure
  // we return refuse having made ZERO plan/ledger mutation (no orphan). NOTE: this
  // survives a crash DURING baseline recording but does NOT make open-batch fully
  // atomic — the plan-write → manifest-write gap remains (two files can't be written
  // atomically). Still fails closed. #364: every opened member is read-only (write-role
  // frontiers degrade above), so the baseline is recorded against the parent planPath.
  const members = [];
  for (const m of capped) {
    const baseline = shell(commitNodePath, [planPath, '--node-id', m.id, '--start', '--json']);
    const baselineOk = baseline.exitCode === 0 && baseline.result === 'ok';
    if (!baselineOk) {
      // No ledger/manifest mutation has happened yet — refuse leaves zero orphans.
      return { result: 'refuse', reason: 'baseline_failed', nodeId: m.id, baselineResult: baseline };
    }
    members.push({
      id: m.id,
      role: m.role,
      model: m.model,
      declared_write_set: m.declared_write_set,
      kind,
      baseline: 'recorded',
      sealed: false,
    });
  }

  // #303 (gap #7): CRASH-SAFE ordering. Write the manifest in state:'opening' (the transaction
  // marker) with the FULL intended member set BEFORE flipping the ledger rows. If a crash strikes
  // between the manifest write and the ledger write (or mid-flip), orient/status see an 'opening'
  // manifest covering the intended members and route to `reconcile` (recoverable) instead of an
  // undiagnosable orphan_multi_in_progress. Baselines + worktrees are already recorded above.
  const batchId = 'batch-' + (capped.map(m => m.id).join('-'));
  const createdAt = (typeof now === 'function') ? now() : new Date(0).toISOString();
  if (mkdirp) mkdirp(path.dirname(manifestPath));
  const openingManifest = { batchId, state: 'opening', kind, members, createdAt };
  writeFile(manifestPath, JSON.stringify(openingManifest, null, 2));

  // Flip each member's ledger row → in_progress (allowFrom ['pending']).
  for (const m of capped) {
    const spliced = spliceLedgerNode(planContent, m.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) {
      return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: m.id };
    }
    if (spliced.changed) planContent = spliced.content;
  }
  writeFile(planPath, planContent);

  // Promote the manifest → 'open' (the ledger now agrees with the intended member set).
  const manifest = { ...openingManifest, state: 'open' };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // #373: best-effort telemetry — every member opened.
  for (const m of capped) appendBatchTiming(planPath, m.id, 'opened');

  // #317: every opened member flipped pending → in_progress; refresh the durable mirror
  // (AFTER the manifest is promoted to 'open') and return one in_progress transition per member
  // so the orchestrator marks them all in_progress BEFORE dispatching their subagents.
  return {
    result: 'ok',
    batchId,
    state: 'open',
    kind,
    members: members.map(m => ({
      id: m.id, role: m.role, model: m.model,
      declared_write_set: m.declared_write_set, kind: m.kind,
      baseline: m.baseline,
    })),
    allDone: false,
    taskTransitions: capped.map(m => buildTransition(m.id, 'in_progress', 'open-batch')),
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// sealOne — INTERNAL: barrier + close + manifest member flip for one member.
// Returns { ok, reason?, barrierOut?, manifest, planContent }. Does NOT advance.
// ---------------------------------------------------------------------------
function sealOne(member, ctx) {
  const { planPath, shell, readFile } = ctx;
  let { manifest, planContent } = ctx;
  const { spliceLedgerNode, checkEvidenceShape } = require(ADAPTIVE_NODE);

  const role = member.role || 'unknown';

  // #303 (gap #4 / gap #10 / sub-gap A): EVIDENCE-SHAPE PRESENCE check — the SAME contract the
  // serial close-and-open-next applies, so a batch member cannot become `complete` without the
  // role-shaped evidence a serial node requires. The canonical evidence path is the PARENT
  // project `.cache/{node-id}.md` — the orchestrator records every member's evidence parent-side
  // via `record-evidence --project P`, so this read and the recorded evidence resolve to ONE path.
  let evidence = '';
  try { evidence = readFile(path.join(ctx.cacheDir, member.id + '.md')); } catch (_) { evidence = ''; }
  const shapeCheck = (typeof checkEvidenceShape === 'function')
    ? checkEvidenceShape(role, member.id, evidence)
    : { ok: !!(evidence && evidence.trim()) };
  if (!evidence || !evidence.trim() || !shapeCheck.ok) {
    // #319: split absent evidence from malformed (shape) evidence, and carry the
    // missing token class, so a seal refusal names the actual fault instead of the
    // old catch-all 'evidence_missing' (which forced manual build-green patching).
    const absent = !evidence || !evidence.trim() || shapeCheck.kind === 'absent';
    return {
      ok: false,
      reason: absent ? 'evidence_absent' : 'evidence_shape_failed',
      missingTokenClass: shapeCheck.missingTokenClass || null,
      detail: shapeCheck.reason || 'cache file absent',
      expected: shapeCheck.expected || [],
      manifest, planContent,
    };
  }

  // BARRIER (#292, D3): #364 — every batch member is read-only (write-role frontiers
  // serial-degrade and never enter a manifest), so the barrier always shells commit-node
  // against the PARENT planPath (an out-of-lane write refuses barrier_failed).
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', member.id, '--json']);
  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    return { ok: false, reason: 'barrier_failed', barrierOut, manifest, planContent };
  }

  // Close: ledger row → complete (allowFrom ['in_progress','n/a']).
  const closeResult = spliceLedgerNode(planContent, member.id, 'complete', { allowFrom: ['in_progress', 'n/a'] });
  if (closeResult.changed) planContent = closeResult.content;

  // Append a compliance row (mirrors adaptive-node close path). `evidence` + `role` were read
  // above for the evidence-shape gate; reuse them (no second read).
  const summary = evidence ? evidence.split('\n')[0].slice(0, 80) : 'evidence present';
  planContent = appendComplianceRow(planContent, role, member.id, summary);

  // Flip manifest member sealed:true.
  manifest = {
    ...manifest,
    members: manifest.members.map(m => m.id === member.id ? { ...m, sealed: true } : m),
  };

  return { ok: true, barrierOut, manifest, planContent };
}

// ---------------------------------------------------------------------------
// appendComplianceRow — build the batch member's compliance row (bare-role string for review
// roles) then delegate the fence-aware section find/append to the shared spliceComplianceSection
// (#354 dedup — the section shape + create-below-ledger logic lives once in adaptive-schema).
// ---------------------------------------------------------------------------
function appendComplianceRow(content, role, nodeId, summary) {
  const bareRoles = ['code-reviewer', 'security-reviewer'];
  const requirementCell = bareRoles.includes(role) ? role : role + ' (' + nodeId + ')';
  const newRow = '| ' + requirementCell + ' | subagent-invoked | ' + summary + ' | |';
  return spliceComplianceSection(content, newRow);
}

// ---------------------------------------------------------------------------
// runSealMember — MUTATES ledger + manifest member. Seals ONE member; does NOT
// advance. Refuses on barrier fail (no close). (blueprint §2 seal-member.)
// ---------------------------------------------------------------------------
function runSealMember(opts) {
  const {
    planPath, cacheDir, manifestPath, nodeId, shell, readFile, writeFile, cacheExists,
    project,
  } = opts;

  const manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }
  // #305: refuse over an interrupted top-up (member.opening:true) until reconciled.
  if (hasInflightOpening(manifest)) {
    return { result: 'refuse', reason: 'reconcile_first', state: manifest.state, detail: 'member_opening_incomplete' };
  }
  const member = manifest.members.find(m => m.id === nodeId);
  if (!member) {
    return { result: 'refuse', reason: 'not_a_member', nodeId };
  }

  if (member.sealed) {
    return { result: 'ok', sealed: nodeId, state: manifest.state, alreadySealed: true, taskTransitions: [buildTransition(nodeId, 'complete', 'seal-member')], taskMirror: refreshTaskMirror(project, shell) };
  }

  let planContent = readFile(planPath);
  const sealed = sealOne(member, {
    planPath, cacheDir, shell, readFile, manifest, planContent, project,
  });
  if (!sealed.ok) {
    return { result: 'refuse', reason: sealed.reason, missingTokenClass: sealed.missingTokenClass || null, nodeId, barrierOut: sealed.barrierOut };
  }

  // Persist plan (ledger + compliance) then manifest.
  writeFile(planPath, sealed.planContent);
  writeFile(manifestPath, JSON.stringify(sealed.manifest, null, 2));

  // #373: best-effort telemetry — the member closed (sealed).
  appendBatchTiming(planPath, nodeId, 'closed');

  // #317: the sealed member's ledger row → complete; refresh + return the transition.
  return { result: 'ok', sealed: nodeId, state: sealed.manifest.state, taskTransitions: [buildTransition(nodeId, 'complete', 'seal-member')], taskMirror: refreshTaskMirror(project, shell) };
}

// ---------------------------------------------------------------------------
// runSeal — MUTATES ledger + manifest. Seal every still-open member in document
// order; manifest → 'sealed' only when ALL members complete/n/a. (blueprint §2.)
// ---------------------------------------------------------------------------
function runSeal(opts) {
  const {
    planPath, cacheDir, manifestPath, shell, readFile, writeFile, cacheExists,
    project,
  } = opts;

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }
  // #305: refuse over an interrupted top-up (member.opening:true) until reconciled.
  if (hasInflightOpening(manifest)) {
    return { result: 'refuse', reason: 'reconcile_first', state: manifest.state, detail: 'member_opening_incomplete' };
  }

  let planContent = readFile(planPath);
  const sealedIds = [];
  const failures = [];

  for (const member of manifest.members) {
    if (member.sealed) { sealedIds.push(member.id); continue; }
    const res = sealOne(member, {
      planPath, cacheDir, shell, readFile, manifest, planContent, project,
    });
    if (!res.ok) {
      failures.push({ id: member.id, reason: res.reason, missingTokenClass: res.missingTokenClass || null });
      continue;
    }
    manifest = res.manifest;
    planContent = res.planContent;
    sealedIds.push(member.id);
  }

  writeFile(planPath, planContent);

  // Transition manifest → 'sealed' only when ALL members are terminal in the ledger.
  const ledger = parseLedgerMap(planContent);
  const pending = manifest.members.filter(m => !m.sealed).map(m => m.id);
  const allTerminal = allMembersTerminal(manifest, ledger) && failures.length === 0;
  if (allTerminal) {
    manifest = { ...manifest, state: 'sealed' };
  }
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // #317: every genuinely-sealed member's ledger row is now complete (true even on a partial
  // seal that still has failures) — refresh the mirror and return one completed transition each.
  return {
    result: failures.length === 0 ? 'ok' : 'refuse',
    state: manifest.state,
    sealed: sealedIds,
    pending,
    failures,
    taskTransitions: sealedIds.map(id => buildTransition(id, 'complete', 'seal')),
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runJoin — MUTATES manifest only. Precondition: manifest NOT in {opening,open}
// (else not_all_sealed). #364: every batch is read-only (write-role frontiers
// serial-degrade and never enter a manifest), so join has NOTHING to merge
// parent-side — read-only members' evidence already lives parent-side. join just
// transitions a fully-sealed manifest → 'joined' so the orchestrator's
// seal → join → advance choreography still terminates cleanly. IDEMPOTENT: a
// repeat call sees state 'joined' and returns the same {result:'ok',state:'joined'}.
// ---------------------------------------------------------------------------
function runJoin(opts) {
  const { manifestPath, readFile, writeFile, cacheExists } = opts;

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }
  // #305: refuse over an interrupted top-up (member.opening:true) until reconciled — a clearer
  // typed reason than the not_all_sealed that the open-state precondition below would emit.
  if (hasInflightOpening(manifest)) {
    return { result: 'refuse', reason: 'reconcile_first', state: manifest.state, detail: 'member_opening_incomplete' };
  }

  // Precondition: refuse ONLY when not yet sealed. {sealed,joined} proceed (joined makes a
  // repeat call idempotent). An 'opening' manifest is a crash-in-progress to reconcile, not join.
  if (manifest.state === 'open' || manifest.state === 'opening') {
    return { result: 'refuse', reason: 'not_all_sealed', state: manifest.state };
  }

  // All members are read-only — nothing to merge into the parent tree.
  const skipped_read_only = (manifest.members || []).map(m => m.id);

  manifest = { ...manifest, state: 'joined' };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return { result: 'ok', state: 'joined', joined: [], skipped_read_only };
}

// ---------------------------------------------------------------------------
// runTopUp — MUTATES ledger + baselines + manifest. ROLLING BOUNDED DISPATCH (#303 gap #3).
//
// open-batch opens at most FANOUT_CAP members of a (possibly wider) ready frontier; the rest
// stay pending in the ledger as the implicit QUEUE. top-up fills FREED worker slots: when the
// running (unsealed, non-opening) member count is below FANOUT_CAP and same-kind ready-pending
// siblings remain OUTSIDE the manifest, it opens up to `capacity` more — appending them to the
// manifest and recording baselines/worktrees — so an over-cap frontier DRAINS by rolling
// dispatch (each seal-member frees a slot; each top-up fills it) instead of waiting for the whole
// first wave. Returns reason:'frontier_drained' when the queue is exhausted (the orchestrator
// then seal → join → advance) and reason:'at_capacity' when no slot is free.
// ---------------------------------------------------------------------------
function runTopUp(opts) {
  const {
    planPath, manifestPath, max, fanoutCap, fanoutCapReadonly, shell, readFile, writeFile, cacheExists,
    project,
  } = opts;
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) return { result: 'refuse', reason: 'no_active_batch' };
  if (manifest.state === 'opening') return { result: 'refuse', reason: 'reconcile_first', state: 'opening' };
  // #305: an interrupted top-up (member.opening:true) must be reconciled before another top-up.
  if (hasInflightOpening(manifest)) return { result: 'refuse', reason: 'reconcile_first', state: manifest.state, detail: 'member_opening_incomplete' };
  if (manifest.state !== 'open') return { result: 'ok', toppedUp: [], reason: 'batch_not_open', state: manifest.state, taskTransitions: [] };

  // Same integrity gate as open-batch: never schedule against a tampered/invalid plan.
  const integrity = shell(validatorPath, [planPath, '--resume-check', '--json']);
  if (integrity.exitCode !== 0 || integrity.ok !== true) {
    return { result: 'refuse', reason: 'plan_integrity_failed', detail: integrity.reason || null };
  }

  // #391b HALT FENCE + #383 LIVE-COORDINATION (matrix: top-up excl scheduler only). top-up drains the
  // OWN batch's frontier, so it is mutually exclusive with a separate running-set fan-out but not with
  // its own live batch (handled by the manifest state checks above) or a serial node (a top-up only
  // runs WITH an active batch already present, so a serial node cannot legally coexist).
  const coGuard = batchCoordinationGuard(opts, ['scheduler']);
  if (coGuard) return coGuard;

  // A member occupies a worker slot while UNSEALED (in_progress) and not mid-open (opening).
  const running = manifest.members.filter(m => !m.sealed && !m.opening).length;
  // #375 (D3): a read-only batch drains under the higher read-only cap; write-role keeps fanoutCap.
  const kindCap = (manifest.kind === 'write_role') ? fanoutCap : (fanoutCapReadonly || fanoutCap);
  const effFanout = (Number.isInteger(kindCap) && kindCap >= 1) ? kindCap : 4;
  let capacity = effFanout - running;
  if (Number.isInteger(max) && max >= 1) capacity = Math.min(capacity, max);
  if (capacity <= 0) return { result: 'ok', toppedUp: [], reason: 'at_capacity', running, cap: effFanout, taskTransitions: [] };

  let planContent = readFile(planPath);
  const ledger = parseLedgerMap(planContent);
  const nextAction = shell(nextActionPath, [planPath, '--json']);
  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }
  const readyPending = deriveReadyPending(nextAction.readySet || [], ledger);
  const memberIds = new Set(manifest.members.map(m => m.id));
  const isWriteRole = manifest.kind === 'write_role';
  // #364: a write-role manifest can no longer be created (open-batch serial-degrades write
  // frontiers), but defend against a legacy/corrupt manifest — never roll one forward, since the
  // member-worktree isolation it would need was excised. Degrade with the preserved shape.
  if (isWriteRole) return { result: 'ok', degraded: true, reason: 'cwd_unenforceable', toppedUp: [], taskTransitions: [] };
  // A top-up candidate is a CURRENT-FRONTIER SIBLING — same kind as the live batch and NOT already
  // a member — that does NOT depend on any current batch member. The dependency guard is what keeps
  // top-up from advancing to the NEXT node (e.g. a downstream review gate that becomes ready once
  // the fan-out completes): that node depends on the batch members, so it is excluded. Draining the
  // frontier is the scheduler's job; advancing past it is the orchestrator's (seal → join → advance).
  const sameKind = n => parseWriteSet(n.declared_write_set).size === 0; // read-only siblings only
  const dependsOnMember = n => (n.dependsOn || []).some(d => memberIds.has(d));
  const queue = readyPending.filter(n => !memberIds.has(n.id) && sameKind(n) && !dependsOnMember(n));
  if (queue.length === 0) return { result: 'ok', toppedUp: [], reason: 'frontier_drained', running, taskTransitions: [] };

  const toOpen = queue.slice(0, capacity);

  const newMembers = [];
  for (const m of toOpen) {
    const baseline = shell(commitNodePath, [planPath, '--node-id', m.id, '--start', '--json']);
    if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
      return { result: 'refuse', reason: 'baseline_failed', nodeId: m.id, baselineResult: baseline };
    }
    newMembers.push({
      id: m.id, role: m.role, model: m.model, declared_write_set: m.declared_write_set, kind: manifest.kind,
      baseline: 'recorded', sealed: false,
    });
  }

  // CRASH-SAFE per-member ordering (sub-gap B): append the new members to the manifest with
  // opening:true BEFORE flipping their ledger rows. crossCheckStatus/orient EXCLUDE opening:true
  // members from the live-set equality, so a crash between the manifest write and the ledger write
  // is reconcilable (reconcile clears the flags or rolls the in-flight members back), never an orphan.
  manifest = { ...manifest, members: manifest.members.concat(newMembers.map(m => ({ ...m, opening: true }))) };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  for (const m of newMembers) {
    const spliced = spliceLedgerNode(planContent, m.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: m.id };
    if (spliced.changed) planContent = spliced.content;
  }
  writeFile(planPath, planContent);

  // Clear the opening flags (the in-flight members are now fully open).
  manifest = { ...manifest, members: manifest.members.map(m => { if (!m.opening) return m; const c = { ...m }; delete c.opening; return c; }) };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // #373: best-effort telemetry — each topped-up member opened.
  for (const m of newMembers) appendBatchTiming(planPath, m.id, 'opened');

  // #317: each topped-up member flipped pending → in_progress; refresh + return transitions.
  return {
    result: 'ok',
    toppedUp: newMembers.map(m => ({ id: m.id, role: m.role, model: m.model, declared_write_set: m.declared_write_set, kind: m.kind })),
    running: running + newMembers.length,
    cap: effFanout,
    queueRemaining: queue.length - newMembers.length,
    taskTransitions: newMembers.map(m => buildTransition(m.id, 'in_progress', 'top-up')),
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runReconcile — MUTATES ledger + manifest. CRASH REPAIR (#303 gap #7 / sub-gap B).
//
// Repairs a batch left mid-transaction by a crash:
//   manifest state 'opening'                         → an interrupted open-batch (whole batch).
//   manifest state 'open' with member.opening:true   → an interrupted top-up (the in-flight subset).
// Default = ROLL FORWARD: re-record baselines (idempotent), flip the intended rows to in_progress,
//   clear the opening markers, and (whole-batch) promote 'opening' → 'open'.
// --abort = ROLL BACK: flip the intended in_progress rows back to pending, and (whole-batch) delete
//   the manifest / (top-up) drop the in-flight members. Always safe.
// A manifest with no opening transaction is a no-op (reconciled:false).
// #364: every batch member is read-only (write-role frontiers serial-degrade), so there are no
// member worktrees to roll back or to check for liveness — roll-forward always re-records against
// the parent planPath.
// ---------------------------------------------------------------------------
function runReconcile(opts) {
  const {
    planPath, manifestPath, shell, readFile, writeFile, cacheExists, unlink, abort,
    project,
  } = opts;
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) return { result: 'ok', reconciled: false, reason: 'no_active_batch', taskTransitions: [] };

  const openingMembers = (manifest.members || []).filter(m => m.opening);
  const wholeOpening = manifest.state === 'opening';
  if (!wholeOpening && openingMembers.length === 0) {
    return { result: 'ok', reconciled: false, reason: 'not_opening', state: manifest.state, taskTransitions: [] };
  }
  const target = wholeOpening ? (manifest.members || []) : openingMembers;
  let planContent = readFile(planPath);

  if (abort) {
    for (const m of target) {
      const spliced = spliceLedgerNode(planContent, m.id, 'pending', { allowFrom: ['in_progress'] });
      if (spliced.changed) planContent = spliced.content;
    }
    writeFile(planPath, planContent);
    // #385 drop-side: each aborted member is rolled back to pending and leaves the live set, so drop
    // its per-node baseline (.cache/barrier-base-<id> + the gc-anchored ref). Without this, a later
    // re-open (open-batch/top-up/open-ready) finds a STALE T0 baseline (--record-base REUSES it) and
    // the next barrier attributes foreign writes to the member — the documented #281/#296 stale-baseline
    // trap. --drop-base removes file+ref together and is idempotent (a missing file/ref is a clean
    // no-op). Mirrors adaptive-node runReopenNode / runReconcileRunningSet rollback.
    if (typeof shell === 'function') {
      for (const m of target) {
        shell(validatorPath, [planPath, '--drop-base', '--node-id', m.id, '--json']);
      }
    }
    if (wholeOpening) {
      if (typeof unlink === 'function') unlink(manifestPath);
      else writeFile(manifestPath, JSON.stringify({ batchId: manifest.batchId, state: 'aborted', members: [] }, null, 2));
      // #317: rolled-back rows → pending.
      return { result: 'ok', reconciled: true, rolledBack: target.map(m => m.id), state: 'aborted', taskTransitions: target.map(m => buildTransition(m.id, 'pending', 'reconcile-abort')), taskMirror: refreshTaskMirror(project, shell) };
    }
    const dropIds = new Set(target.map(m => m.id));
    manifest = { ...manifest, members: manifest.members.filter(m => !dropIds.has(m.id)) };
    writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return { result: 'ok', reconciled: true, rolledBack: target.map(m => m.id), state: manifest.state, taskTransitions: target.map(m => buildTransition(m.id, 'pending', 'reconcile-abort')), taskMirror: refreshTaskMirror(project, shell) };
  }

  // ROLL FORWARD.
  for (const m of target) {
    const baseline = shell(commitNodePath, [planPath, '--node-id', m.id, '--start', '--json']);
    if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
      return { result: 'refuse', reason: 'baseline_failed', nodeId: m.id, baselineResult: baseline };
    }
    const spliced = spliceLedgerNode(planContent, m.id, 'in_progress', { allowFrom: ['pending', 'in_progress'] });
    if (spliced.changed) planContent = spliced.content;
  }
  writeFile(planPath, planContent);
  manifest = { ...manifest, members: manifest.members.map(m => { if (!m.opening) return m; const c = { ...m }; delete c.opening; return c; }) };
  if (wholeOpening) manifest.state = 'open';
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  // #317: roll-forward promoted the intended rows → in_progress.
  return { result: 'ok', reconciled: true, promoted: true, state: manifest.state, members: target.map(m => m.id), taskTransitions: target.map(m => buildTransition(m.id, 'in_progress', 'reconcile')), taskMirror: refreshTaskMirror(project, shell) };
}

// ---------------------------------------------------------------------------
// recommendBatchRoute — #322: PURE derivation of the next batch-lifecycle
// command from manifest presence/state + the cross-check verdict. The "what
// comes next" routing decision used to live only in plan-run prose, so after a
// batch joined and the manifest was deleted the executor would still issue a
// rolling `top-up` and hit a spurious `no_active_batch` refusal (issue #322).
// Lifting it into a read-only `status --json` field gives the orchestrator a
// machine-readable signal to branch on. `top-up` is recommended ONLY for an
// open + valid batch (the one state that legitimizes it); a joined/cleared
// manifest routes to `orient` (→ open-batch / open-next), never top-up.
//
// @param {object|null} manifest    parsed active-batch manifest, or null
// @param {object} crossCheck       crossCheckStatus() verdict
// @returns {'orient'|'reconcile'|'top-up'|'join'} next route
// ---------------------------------------------------------------------------
function recommendBatchRoute(manifest, crossCheck) {
  if (!manifest) {
    // No active batch: an orphan (>1 in_progress, no manifest) needs repair, and a crashed
    // running set (#377 reconcilable) also routes to reconcile; otherwise idle /
    // single_in_progress / valid_running_set / joined-and-cleared → re-orient.
    return (crossCheck && (crossCheck.orphan || crossCheck.reconcilable)) ? 'reconcile' : 'orient';
  }
  if (manifest.state === 'opening' || hasInflightOpening(manifest)) {
    return 'reconcile';
  }
  if (manifest.state === 'joined') {
    return 'orient'; // terminal-but-uncleared: clear + re-orient, never top-up
  }
  if (manifest.state === 'sealed') {
    return 'join';
  }
  if (manifest.state === 'open') {
    return (crossCheck && crossCheck.valid) ? 'top-up' : 'reconcile';
  }
  return 'orient';
}

// ---------------------------------------------------------------------------
// runStatus — READ-ONLY. Returns the parsed manifest (or {active:false}) plus a
// cross-check of manifest members vs ledger in_progress rows. Never mutates.
// ---------------------------------------------------------------------------
function runStatus(opts) {
  const { planPath, manifestPath, readFile, cacheExists } = opts;

  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}
  const ledger = parseLedgerMap(planContent);
  const inProgress = listInProgress(ledger);

  const manifest = readManifest(manifestPath, cacheExists, readFile);
  // #377: also read the per-node running-set.json so a `status` call during a running-set fan-out
  // cross-checks against it (valid_running_set / reconcilable) instead of mis-reporting an orphan.
  const runningSetPath = path.join(path.dirname(manifestPath), RUNNING_SET_NAME);
  let runningSet = null;
  if (!cacheExists || cacheExists(runningSetPath)) {
    try { const rp = safeJsonParse(readFile(runningSetPath)); if (rp && Array.isArray(rp.nodes)) runningSet = rp; } catch (_) {}
  }
  const crossCheck = crossCheckStatus(manifest, inProgress, runningSet);
  const nextRoute = recommendBatchRoute(manifest, crossCheck);

  // #437 (D-419 P2 / n4-batch): ADDITIVE diagnostics — when a WRITE LANE GROUP is live, the
  // running-set.json carries a `lane_group` key (written by adaptive-node's open-ready co-open
  // arm; parallel-batch only READS it and never writes running-set.json). Surface it on `status`
  // so the orchestrator/operator can see the co-opened group (members + shared baseline) without
  // re-reading the file. Flag-OFF byte-identity (INV-6): a serial/read running set has NO
  // `lane_group` key, so `laneGroup` is omitted entirely and the payload is unchanged.
  const laneGroup = (runningSet && runningSet.lane_group) ? runningSet.lane_group : null;

  if (!manifest) {
    return {
      result: 'ok', active: false, inProgress, runningSet, crossCheck, nextRoute,
      ...(laneGroup ? { laneGroup } : {}),
    };
  }

  return {
    result: 'ok',
    active: true,
    batchId: manifest.batchId,
    state: manifest.state,
    kind: manifest.kind,
    members: (manifest.members || []).map(m => ({
      id: m.id,
      sealed: !!m.sealed,
      joined: !!m.joined,
      ledgerStatus: ledger.get(m.id) || 'pending',
    })),
    inProgress,
    crossCheck,
    nextRoute,
    ...(laneGroup ? { laneGroup } : {}),
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-gitea-workflow-parallel-batch.js <subcommand> --project P --json [options]\n' +
      '  open-batch   --project P [--max N]\n' +
      '  top-up       --project P [--max N]   (rolling bounded dispatch: fill freed slots)\n' +
      '  seal-member  --project P --node-id N\n' +
      '  seal         --project P\n' +
      '  join         --project P\n' +
      '  reconcile    --project P [--abort]   (repair a crash-interrupted open/top-up)\n' +
      '  status       --project P\n'
    );
    return;
  }

  const subcommand = args[0];
  const hasJson    = args.includes('--json');
  const projectIdx = args.indexOf('--project');
  const nodeIdIdx  = args.indexOf('--node-id');
  const maxIdx     = args.indexOf('--max');

  if (!hasJson) {
    process.stdout.write('{"result":"refuse","errors":["--json is required"]}\n');
    process.exitCode = 1;
    return;
  }
  if (!(projectIdx >= 0 && projectIdx + 1 < args.length)) {
    process.stdout.write(JSON.stringify({ result: 'refuse', errors: ['--project is required'] }) + '\n');
    process.exitCode = 1;
    return;
  }

  const project = args[projectIdx + 1];
  const nodeId  = nodeIdIdx >= 0 ? args[nodeIdIdx + 1] : null;
  const maxRaw  = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : null;
  const max     = Number.isInteger(maxRaw) ? maxRaw : null;

  const repoRoot   = getRoot();
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  // projTag mirrors the validator's (project) ref token (validator:1003): the project
  // folder name sanitized. Retained for crash-safe manifest/baseline keying across projects.
  const projTag    = path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_') || 'plan';
  const planPath   = path.join(projectDir, 'workflow-plan.md');
  const statePath  = path.join(projectDir, 'workflow-state.md');
  const cacheDir   = path.join(projectDir, '.cache');
  const manifestPath = path.join(cacheDir, MANIFEST_NAME);

  const fs = require('fs');
  const { resolveFanoutCap, resolveFanoutCapReadonly, writeFileAtomicReplace } = (function () {
    try { return require('./kaola-workflow-adaptive-schema'); } catch (_) { return {}; }
  })();
  const fanoutCap = (typeof resolveFanoutCap === 'function') ? resolveFanoutCap(process.env) : 4;
  // #375 (D3): read-only batches use the higher read-only cap (write-role degrades to serial — #364).
  const fanoutCapReadonly = (typeof resolveFanoutCapReadonly === 'function') ? resolveFanoutCapReadonly(process.env) : 8;

  const io = {
    shell: (scriptPath, scriptArgs) => shellNode(scriptPath, scriptArgs),
    readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
    // #353: route every durable-state write (active-batch.json manifest, plan/ledger) through the
    // crash-safe atomic replace (tmp + fsync + rename). Falls back to a plain write if the schema
    // helper is somehow unavailable.
    writeFile: (fpath, content) => {
      if (typeof writeFileAtomicReplace === 'function') writeFileAtomicReplace(fpath, content);
      else fs.writeFileSync(fpath, content, 'utf8');
    },
    cacheExists: (fpath) => fs.existsSync(fpath),
    mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
    now: () => new Date().toISOString(),
    // #303 (gap #7): manifest deletion for reconcile --abort (whole-batch roll-back).
    unlink: (fpath) => { try { fs.unlinkSync(fpath); } catch (_) {} },
    repoRoot,
  };

  const abort = args.includes('--abort');
  const ctx = { planPath, statePath, cacheDir, manifestPath, project, projTag, repoRoot, fanoutCap, fanoutCapReadonly, max, nodeId, abort, ...io };

  let result;
  if (subcommand === 'open-batch') {
    result = runOpenBatch(ctx);
  } else if (subcommand === 'top-up') {
    result = runTopUp(ctx);
  } else if (subcommand === 'seal-member') {
    if (!nodeId) result = { result: 'refuse', errors: ['--node-id required for seal-member'] };
    else result = runSealMember(ctx);
  } else if (subcommand === 'seal') {
    result = runSeal(ctx);
  } else if (subcommand === 'join') {
    result = runJoin(ctx);
  } else if (subcommand === 'reconcile') {
    result = runReconcile(ctx);
  } else if (subcommand === 'status') {
    result = runStatus(ctx);
  } else {
    result = { result: 'refuse', errors: ['unknown subcommand: ' + subcommand] };
  }

  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.result === 'refuse') process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  BATCH_STATES,
  deriveReadyPending,
  classifyBatchKind,
  checkDisjoint,
  capMembers,
  crossCheckStatus,
  recommendBatchRoute,
  hasInflightOpening,
  runOpenBatch,
  runTopUp,
  runSealMember,
  runSeal,
  runJoin,
  runReconcile,
  runStatus,
  shellNode,
  appendComplianceRow,
};
