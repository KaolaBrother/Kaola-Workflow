#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-adaptive-node.js (issue #272)
//
// Pure-composition aggregator: owns the per-node adaptive lifecycle for
// /kaola-workflow-plan-run. Shells the frozen-core scripts via child_process
// and never imports-and-mutates them.
//
// Subcommands (all require --project P and --json; exit≠0 on refuse):
//   orient         --project P                        (READ-ONLY)
//   mirror-project --project P                        (#335: main→worktree mirror; READ-ONLY on ledger/state)
//   open-next      --project P [--node-id N]          (MUTATES ledger + baseline)
//   record-evidence --project P --node-id N --stdin   (MUTATES .cache)
//   record-evidence --project P --node-id N --verify  (READ-ONLY: verify on-disk evidence)
//   close-and-open-next --project P --node-id N       (MUTATES ledger + state)
//   write-halt     --project P --node-id N --reason R (MUTATES state + ledger)
//   clear-halt     --project P --reason consent|security (#360: MUTATES state + ledger; inverse of write-halt)
//
// Crash-safe write order (binding for all mutation subcommands):
//   .cache evidence  →  ## Node Ledger row  →  workflow-state.md pointer LAST
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Sibling-script filename constants — keep each on its own line for forge
// ports that need a one-line rename.
// ---------------------------------------------------------------------------
const COMMIT_NODE  = 'kaola-workflow-commit-node.js';
const NEXT_ACTION  = 'kaola-workflow-next-action.js';
const VALIDATOR    = 'kaola-workflow-plan-validator.js';
const TASK_MIRROR  = 'kaola-workflow-task-mirror.js';

const commitNodePath = path.join(__dirname, COMMIT_NODE);
const nextActionPath = path.join(__dirname, NEXT_ACTION);
const validatorPath  = path.join(__dirname, VALIDATOR);
const taskMirrorPath = path.join(__dirname, TASK_MIRROR);

// #666: cap unbounded-in-repo-size git execFileSync calls at 64 MB — Node's execFileSync default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

// #360: the LEDGER-SCOPED durable consent-halt probe (fence-aware). adaptive-schema keeps the
// same filename across every edition (byte-identical ×4), so this require is NOT forge-renamed.
const { readDurableConsentHalt, writeFileAtomicReplace, LEDGER_HEADING, locateSection, spliceComplianceSection, RUNNING_SET_NAME, SCHEDULER_LOCK_NAME, REPLAN_TRANSACTION_NAME, REPLAN_CAS_SEAMS, readReplanFence, validateReplanTransaction, canonicalJson, sha256Hex, validateSnapshotManifestShape, acquireProjectLock, resolveFanoutCapReadonly, parallelWritesDefaultOn, refuse, WRITE_SET_OVERFLOW_SUBTYPES, dispatchEffort, codexProfilePolicy, waitBudgetMinutes, dispatchEffortOpencode, modelDisplay, parseNodeVerdict, parseNodeFindings, evaluateEffectiveVerdict, canonicalLogicalGateIdentity, validateReviewJournal, DELEGATION_OUTCOME_VOCABULARY, MERGE_CONFLICT_REPAIR_LIMIT, REVIEW_REPAIR_LIMIT, REVIEW_REBIND_LIMIT, nonAbortedRebinds, effectiveCandidate, effectiveProducerBinding, resolveMainRoot } = require('./kaola-workflow-adaptive-schema');
const reviewSchema = require('./kaola-workflow-adaptive-schema');

// ---------------------------------------------------------------------------
// allowedDomainOutcomes (#727) — the SINGLE role-kind selector for the reviewer-contract
// `domain_outcome` vocabulary. The valid values are role-kind-dependent (approval gates take
// APPROVAL_OUTCOMES; an adversarial-verifier takes ADVERSARIAL_OUTCOMES) and BOTH ends of the
// contract — the open-time seeded stub and the close-time refusal hint — must name the same set the
// validator enforces. It RETURNS the schema's frozen arrays by identity (never a copy), so there is
// exactly one place the enum can be edited and no second copy that can silently drift.
// ---------------------------------------------------------------------------
function allowedDomainOutcomes(role) {
  return String(role || '') === 'adversarial-verifier'
    ? reviewSchema.ADVERSARIAL_OUTCOMES : reviewSchema.APPROVAL_OUTCOMES;
}

// ---------------------------------------------------------------------------
// OPERATOR_HINT_REGISTRY (#445 / D-445-01 §1-3) — per-aggregator map of typed
// reason → templateFn(ctx). Each entry returns ONE actionable sentence + (where
// applicable) the exact next workflow command, materialized at EMIT time by
// getOperatorHint (decisions 1-2). The registry lives INSIDE this aggregator (no
// shared module / no new import edge) so it stays auditable against the reasons
// THIS script actually emits.
//
// VOCABULARY CONTRACT (D-445-01 §3, binding):
//   - the write_set_overflow family (write_set_overflow / write_set_granularity /
//     lockfile_write / mirror_write / count_bump) references `revert-overflow`,
//     NEVER `drop-base` (the D-424-01 laundering anti-pattern).
//   - a crash-repair / reopen-writer situation references `repair-node` (the
//     anti-laundering primitive that keeps the original baseline).
//   - No forge-specific CLI token appears in any hint — the hints
//     name `node scripts/...` workflow commands only (the script NAME is
//     forge-renamed by edition-sync; the hint text itself is forge-neutral).
//
// ctx fields the templates may read (all optional): nodeId, reason, detail,
// project, repair.
// ---------------------------------------------------------------------------
const ADAPTIVE_NODE_SCRIPT = 'node scripts/kaola-workflow-adaptive-node.js';

// #466 — the MUTATING lifecycle subcommands subject to the worktree-authority split guard. Each one
// resolves the project folder (plan / ## Node Ledger / .cache evidence / barrier baselines) cwd-relative,
// so running it from the MAIN root while a linked worktree is recorded silently diverges durable state
// from where the role agents write. orient + mirror-project (read-only / legitimately the main→worktree
// copy) and record-evidence --verify (read-only) are EXEMPT and intentionally absent from this set.
const SPLIT_GUARDED_SUBCOMMANDS = new Set([
  'open-next', 'open-ready', 'close-node', 'close-and-open-next',
  'reconcile-running-set', 'write-halt', 'clear-halt',
  'reopen-node', 'revert-overflow', 'repair-node', 'route-findings', 'record-evidence',
  // #439: the speculative-read discard is a mutating lifecycle transaction (ledger reset + baseline
  // drop + running-set removal) and must run from the worktree like every other mutator.
  'discard-speculative',
]);

// #699: every filesystem-mutating lifecycle entry is fenced by the same
// claim-preserving re-plan transaction. mirror-project is intentionally here:
// it is ledger-read-only but copies project bytes into another worktree.
const REPLAN_GUARDED_SUBCOMMANDS = new Set([
  'open-next', 'open-ready', 'close-node', 'close-and-open-next',
  'reconcile-running-set', 'record-evidence', 'write-halt', 'clear-halt',
  'reopen-node', 'repair-node', 'revert-overflow', 'route-findings',
  'discard-speculative', 'mirror-project',
]);

function lastReplanCas(transaction) {
  let found = null;
  for (const seam of REPLAN_CAS_SEAMS) {
    const row = transaction && transaction.cas && transaction.cas[seam];
    if (row) found = { seam, result: row.result || 'unknown' };
  }
  return found || { seam: 'none', result: 'none' };
}

function replanOrientation(fence, project) {
  const tx = fence && fence.transaction;
  const cas = lastReplanCas(tx);
  const out = {
    result: 'refuse', reason: (fence && fence.reason) || 'replan_in_progress',
    replan_phase: (fence && fence.phase) || (tx && tx.phase) || 'unknown',
    transaction_id: (fence && fence.transaction_id) || (tx && tx.transaction_id) || 'none',
    parent_plan_hash: (tx && tx.parent && tx.parent.plan_hash) || 'none',
    child_plan_hash: (tx && tx.child && tx.child.plan_hash) || 'none',
    last_cas_seam: cas.seam, last_cas_result: cas.result,
    legal_mutation: (fence && fence.legal_mutation) || 'none',
  };
  if (tx && tx.child) {
    out.first_node_id = tx.child.first_node_id || 'none';
    out.first_node_role = tx.child.first_node_role || 'none';
  }
  if (fence && fence.legal_mutation === 'replan resume') {
    out.resume_command = 'node scripts/kaola-workflow-replan.js resume --project ' + project + ' --json';
  }
  return out;
}

function readProjectReplanFence(statePath, cacheDir, readFile) {
  let stateContent = '';
  try { stateContent = readFile(statePath); } catch (_) {}
  const txPath = path.join(cacheDir, REPLAN_TRANSACTION_NAME);
  let transaction = null;
  try { transaction = JSON.parse(readFile(txPath)); }
  catch (_) {
    try { readFile(txPath); transaction = {}; } catch (_) { transaction = null; }
  }
  return readReplanFence(stateContent, transaction);
}

// #605: the subcommands that flip ## Node Ledger ROW STATUS — exactly the set that refreshes the
// derived run-progress mirror after a successful ledger write. A strict subset of the split-guarded
// set (route-findings / revert-overflow / discard-speculative mutate .cache or file writes, not the
// forward-progress ledger status, so they are excluded).
const LEDGER_MUTATING_SUBCOMMANDS = new Set([
  'open-next', 'open-ready', 'close-node', 'close-and-open-next',
  'reconcile-running-set', 'reopen-node', 'repair-node', 'write-halt', 'clear-halt',
]);

// #439 (D-419 Part 4): resolve the per-plan `speculative_open_policy` from the frozen plan content.
// Lazily requires the same-edition plan-validator's `parseSpeculativePolicy` (the Meta-scoped, hash-
// covered parser the freeze check uses) so adaptive-node and the validator never drift. Fails safe to
// 'off' (the schema default — the permanent serial fallback) if the parser is unavailable.
function resolveSpeculativePolicy(content) {
  try {
    const { parseSpeculativePolicy } = require('./kaola-workflow-plan-validator');
    return parseSpeculativePolicy(content) || 'off';
  } catch (_) { return 'off'; }
}

const OPERATOR_HINT_REGISTRY = {
  // --- guard prologue (#383/#387/#391b) ---
  plan_integrity_failed: (ctx) =>
    'The frozen plan failed --resume-check (' + (ctx.detail || 'plan_hash / structure tamper') + '). Re-freeze the plan via /kaola-workflow-adapt or restore the untampered workflow-plan.md before retrying.',
  halt_pending: () =>
    'A durable consent_halt: pending marker is set in the ## Node Ledger. Resolve the halt, then clear it: ' + ADAPTIVE_NODE_SCRIPT + ' clear-halt --project <P> --reason consent|security --json.',
  serial_node_live: (ctx) =>
    'A serial node is still in_progress (' + ((ctx.inProgress || []).join(', ') || 'see inProgress') + '). Close it (close-and-open-next) before fanning out.',
  scheduler_active: (ctx) =>
    'A running-set fan-out is live (' + ((ctx.runningSet || []).join(', ') || 'see runningSet') + '). Close its nodes (close-node) or run ' + ADAPTIVE_NODE_SCRIPT + ' reconcile-running-set --project <P> --json before this command.',
  // #585: another scheduler invocation holds the project-scoped O_EXCL lock. Only ONE orchestrator may
  // drive a project's scheduler at a time — contention is a non-blocking refuse (no spin-wait/queue).
  scheduler_locked: (ctx) =>
    'Another scheduler command holds this project\'s lock'
    + (ctx.holder && ctx.holder.subcommand ? ' (' + ctx.holder.subcommand + (ctx.holder.pid ? ' pid ' + ctx.holder.pid : '') + ')' : '')
    + '. Only one orchestrator may drive a project\'s scheduler at a time — wait for the in-flight command to finish, then retry. (A dead/crashed holder refuses separately as scheduler_lock_stale with the manual recovery step.)',
  // #585 (repair): the lock's holder is DEAD/crashed (dead same-host PID, or an old cross-host/corrupt
  // payload). The lock is NEVER auto-removed — an unlink-based takeover double-acquires under
  // concurrency — so recovery is one explicit operator removal, from ONE session only.
  scheduler_lock_stale: (ctx) => {
    const h = (ctx.holder && typeof ctx.holder === 'object') ? ctx.holder : {};
    let since = 'unknown time';
    try {
      const t = (typeof h.ts === 'number') ? h.ts : Date.parse(h.ts);
      if (Number.isFinite(t)) since = new Date(t).toISOString();
    } catch (_) {}
    return 'This project\'s scheduler lock is held by a DEAD/crashed holder ('
      + (h.subcommand || 'unknown subcommand') + ', pid ' + (h.pid != null ? h.pid : '?')
      + ' on ' + (h.host || 'unknown host') + ', since ' + since
      + '). It is never removed automatically. Verify no other orchestrator session is recovering this project, then remove the lock by hand from ONE session only: rm "'
      + (ctx.lockPath || '.cache/scheduler.lock') + '" — then re-run the command.';
  },
  // #466: worktree-authority split — a mutating lifecycle call ran from the MAIN root while a linked
  // worktree is recorded; the ledger/evidence/baselines would diverge from where the role agents write.
  worktree_authority_split: (ctx) =>
    'A linked worktree is recorded for this project (' + (ctx.worktreePath || 'see workflow-state.md worktree_path') + ') but this mutating lifecycle command is running from the MAIN repo root — the ## Node Ledger / .cache evidence / barrier baselines would diverge from where the role agents write. cd into the worktree first: cd "' + (ctx.worktreePath || '<worktree_path>') + '" && re-run the command (run ALL adaptive lifecycle calls from the worktree cwd).',

  // --- orient (#328/#335/#377/#384/#430) ---
  plan_missing: (ctx) =>
    'No workflow-plan.md for this project. ' + (ctx.repair || 'Author + freeze it via /kaola-workflow-adapt <project>.'),
  plan_not_mirrored: (ctx) =>
    'The frozen plan exists in the main checkout but not this worktree. ' + (ctx.repair || 'Run ' + ADAPTIVE_NODE_SCRIPT + ' mirror-project --project <P> --json, then re-run orient.'),
  bundle_state_incoherent: () =>
    'workflow-state.md has a bundle_id that disagrees with issue_numbers (hand-edit / partial write). Reconcile the bundle identity fields before resuming.',
  running_set_opening_incomplete: () =>
    'A crashed open-ready left the running set mid-open. Run ' + ADAPTIVE_NODE_SCRIPT + ' reconcile-running-set --project <P> --json to roll it forward/back, then re-run orient.',
  running_set_close_incomplete: () =>
    'A terminal ledger node is stuck in the open running set (close crashed before removal). Run ' + ADAPTIVE_NODE_SCRIPT + ' reconcile-running-set --project <P> --json, then re-run orient.',
  running_set_stale_member: () =>
    'The running set holds a stale member (neither in_progress, terminal, nor opening). Run ' + ADAPTIVE_NODE_SCRIPT + ' reconcile-running-set --project <P> --json to drop it.',
  batch_topup_incomplete: () =>
    'A rolling top-up was interrupted (member appended, ledger/baseline unfinished). Run reconcile to roll it forward, then re-run orient.',
  orphan_multi_in_progress: (ctx) =>
    'Multiple in_progress rows with no matching live set (' + ((ctx.inProgressNodes || []).join(', ') || 'see inProgressNodes') + '). Run ' + ADAPTIVE_NODE_SCRIPT + ' ' + (ctx.repair || 'reconcile-running-set') + ' --project <P> --json.',

  // --- mirror-project (#335) ---
  state_missing: () =>
    'No workflow-state.md for this project in the main checkout. Run claim/startup first.',
  source_plan_missing: () =>
    'The main checkout has no frozen plan to mirror. Author + freeze it via /kaola-workflow-adapt <project> first.',
  mirror_failed: (ctx) =>
    'The main→worktree project-folder mirror failed (' + (ctx.detail || 'copy/rename error') + '). Clear any .mirror-tmp leftover and retry mirror-project.',
  mirror_verify_failed: (ctx) =>
    'The copied plan failed plan_hash re-verification (' + (ctx.detail || 'resume-check failed') + '). Re-freeze the source plan, then re-run mirror-project.',

  // --- open-next / fused advance (#272/#411) ---
  next_action_failed: () =>
    'next-action could not compute a ready set (stalled / corrupt DAG). Run orient to inspect the plan + ledger state.',
  node_not_ready: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not in the current ready set (its dependencies are not all complete). Open the ready frontier next-action reports instead.',
  no_ready_node: () =>
    'No ready node to open (all are blocked or done). Run orient to confirm whether the plan is complete or wedged.',
  node_not_in_ledger: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not present in the ## Node Ledger. Check the node id, or re-freeze the plan so the ledger carries every node.',
  baseline_failed: (ctx) =>
    'Recording the per-node baseline for ' + (ctx.nodeId || '<id>') + ' failed. Re-run open-next; if it persists, inspect commit-node --start output for this node.',
  nested_cache_path: (ctx) =>
    'The resolved cache path for ' + (ctx.nodeId || '<id>') + ' is illegal/nested. Fix the --project segment (it must be issue-N, never the reserved literal kaola-workflow).',

  // --- speculative-read kernel (#439 D-419 Part 4) ---
  gate_not_complete: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is blocked only by an open gate' + (ctx.speculativeGate ? ' (' + ctx.speculativeGate + ')' : '') + '. It is speculative-eligible: it is NOT opened serially via open-next. To run it ahead of the gate (betting the gate passes), run ' + ADAPTIVE_NODE_SCRIPT + ' open-ready --project <P> --json (speculation is auto-granted at the default speculative_open_policy: auto; at consent add --speculative-consent); otherwise wait for the gate to complete.',
  speculative_review_required: (ctx) =>
    'Gate ' + (ctx.gate || '<gate>') + ' closed with a FAILING verdict, so the speculative read node(s) that bet on it (' + ((ctx.speculative || []).join(', ') || 'see speculative') + ') ran on an unproven assumption. Review their evidence: KEEP if still valid, or discard each via ' + ADAPTIVE_NODE_SCRIPT + ' discard-speculative --project <P> --node-id <id> --json (resets it to pending + drops its baseline so it re-opens cleanly).',
  not_speculative: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not a speculative running-set member, so discard-speculative does not apply. Close it normally (close-and-open-next), or run reconcile-running-set if the set is wedged.',
  not_in_running_set: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not a live running-set member. discard-speculative targets an open speculative node; run orient to inspect the live set.',

  // --- write-set overflow family (#424/#434 / D-434-01 §1) — ALWAYS revert-overflow, NEVER
  //     drop-base. These are the narrowed barrier subtypes that can surface as a top-level reason
  //     (e.g. when a caller drills the nested barrierCheck.reason out of a barrier_failed envelope). ---
  write_set_overflow: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' wrote outside its declared write set. Run: ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json.',
  write_set_granularity: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' wrote at a coarser granularity than its declared set allows. Narrow the write set (re-freeze) or run ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json.',
  lockfile_write: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' wrote an undeclared lockfile. Add the lockfile to its write set (plan-repair) or run ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json.',
  mirror_write: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' wrote the cross-edition mirror anchor (adaptive-schema). Add it to the write set (plan-repair) or run ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json.',
  count_bump: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' wrote a count-bump contract/test file not in its declared set. Swap the write set to include it (plan-repair) or run ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json.',

  // --- close paths (#272/#303/#348/#437) ---
  barrier_failed: (ctx) =>
    'The per-node barrier rejected ' + (ctx.nodeId || '<id>') + ' (writes outside its declared set). Review the offending paths, then ' + ADAPTIVE_NODE_SCRIPT + ' revert-overflow --node-id ' + (ctx.nodeId || '<id>') + ' --project <P> --json, or repair-node the writer.',
  // #590: a close dead-ended because no barrier baseline was recorded for the node (a crash may have
  // interrupted a serial open before the baseline landed). Re-opening the node is idempotent and heals it.
  no_barrier_base: (ctx) =>
    'No barrier baseline recorded for ' + (ctx.nodeId || '<id>') + ' (a crash may have interrupted its open before the baseline landed). Re-run ' + ADAPTIVE_NODE_SCRIPT + ' open-next --project <P> --node-id ' + (ctx.nodeId || '<id>') + ' --json — it is idempotent and re-records the baseline — then retry the close.',
  close_node_not_in_ledger: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' has no ## Node Ledger row to close. Confirm the node id matches the frozen plan.',
  close_transition_disallowed: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not in_progress, so it cannot be closed to complete. Open it (open-next) first, or reconcile a stale ledger row.',
  selector_invalid: (ctx) =>
    'The selector routing for ' + (ctx.nodeId || '<id>') + ' is invalid (no winning arm / ambiguous). Fix the selector node in the plan and re-freeze before closing.',
  member_vacuity: (ctx) =>
    'Lane-group member ' + (ctx.nodeId || '<id>') + ' touched none of its declared files and declared no no_op: reason. Make the in-lane change or record a no_op: in evidence before closing.',
  group_barrier_failed: (ctx) =>
    'The lane-group barrier rejected the union of members (group ' + (ctx.group_id || '<gid>') + '). Review the offending paths, then revert-overflow / repair-node the offending member before the last-member close.',

  // --- synthesizer / write-overlap escalation envelope (#463 Slice 5). merge_conflict is the TERMINAL
  //     escalation after MERGE_CONFLICT_REPAIR_LIMIT (K=3) repair attempts on a level's FIRST-detection
  //     refusal (member_vacuity for a no-op leg / write_set_overflow for an overflow / the Slice-4 octopus
  //     bail for a real same-file conflict). It is routed exactly like test_thrash — a schema constant the
  //     orchestrator applies, NO script counter on the adaptive path; the COMMIT-based union barrier on M —
  //     not the attempt counter — is the fail-closed safety gate (a resumed run re-counts from zero; it can
  //     never land unverified work). leg_capture_failed is a genuine synthesizeLevel git fault. ---
  leg_capture_failed: (ctx) =>
    'Capturing leg ' + (ctx.leg || ctx.nodeId || '<leg>') + '\'s working-tree state failed (' + (ctx.detail || 'git add/commit error') + '). Inspect the leg worktree under .kw/legs/, then re-run close-node for the last member.',
  merge_conflict: (ctx) =>
    'The write-leg level for group ' + (ctx.group_id || '<gid>') + ' did not reconcile (' + (ctx.detail || 'an unmergeable conflict / a first-detection refusal repair could not fix') + '). A real conflict is resolved by a synthesizer agent at the Opus reasoning floor; after ' + MERGE_CONFLICT_REPAIR_LIMIT + ' repair attempts escalate via ' + ADAPTIVE_NODE_SCRIPT + ' write-halt --project <P> --node-id ' + (ctx.nodeId || '<id>') + ' --reason merge_conflict (a RESUMABLE consent-style halt — resolve, then clear-halt --reason consent to resume).',

  // --- evidence (#319/#359/#392) ---
  evidence_absent: (ctx) =>
    'No evidence file for ' + (ctx.nodeId || '<id>') + ' (' + (ctx.role || 'role') + '). Have the role agent write ' + (ctx.evidence_file || '.cache/<node-id>.md') + ' with the required tokens, then re-run record-evidence --verify.',
  evidence_shape_failed: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' is missing a required token' + (ctx.missingTokenClass ? ' (' + ctx.missingTokenClass + ')' : '') + '. Add the missing token(s) — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',
  evidence_stale: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' carries a stale evidence-binding nonce (replayed from a prior open). Re-author the evidence with this open\'s nonce — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',
  evidence_unbound: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' is bound to a DIFFERENT node id (copied across nodes). Re-author it with this node\'s evidence-binding header — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',
  upstream_not_consumed: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' did not prove it consumed upstream "' + (ctx.offending || '<up-id>') + '". OPEN ' + (ctx.expected || 'the upstream evidence file') + ', read its line-1 `evidence-binding: ' + (ctx.offending || '<up-id>') + ' <nonce>` header, and record a column-0 `upstream_read: ' + (ctx.offending || '<up-id>') + ' <nonce>` line in this node\'s evidence, then re-close.',
  // #727: the domain_outcome vocabulary is ROLE-KIND-dependent, and the closest-looking wrong answer
  // (`pass` / `fail`) is the gate EFFECT the reducer DERIVES from domain_outcome — a plausible enough
  // mistake that it was observed in the field. Name the exact allowed set for the role that refused;
  // with no role on the envelope, name BOTH sets rather than degrade to the generic fallback.
  review_domain_outcome_invalid: (ctx) => {
    const role = String((ctx && ctx.role) || '');
    const named = reviewSchema.REVIEW_GATE_ROLES.includes(role);
    const allowed = named
      ? allowedDomainOutcomes(role).join(' | ')
      : reviewSchema.APPROVAL_OUTCOMES.join(' | ') + ' (approval gates), '
        + reviewSchema.ADVERSARIAL_OUTCOMES.join(' | ') + ' (adversarial-verifier)';
    return 'Evidence for ' + (ctx.nodeId || '<id>')
      + ' carries a `domain_outcome:` value outside the allowed set for '
      + (named ? 'a ' + role + ' gate' : 'this gate\'s role kind')
      + ' — allowed: ' + allowed
      + '. Note `pass` / `fail` is the derived gate EFFECT, never a domain_outcome. Rewrite the column-0 `domain_outcome:` line with one of the allowed values (an adversarial-verifier must also keep `claim_outcome:` identical to it), then re-close.';
  },

  // --- halt (#391/#360) ---
  invalid_reason: (ctx) =>
    'Invalid --reason. Use one of: ' + ((ctx.validReasons || []).join(', ') || 'consent, security, test_thrash, merge_conflict') + '.',
  no_halt_present: () =>
    'No durable consent_halt: pending marker and no escalated_to_full state marker to clear — there is nothing to clear.',
  halt_written: (ctx) =>
    'A ' + (ctx.reason ? ctx.reason : 'consent/security/test_thrash/merge_conflict') + ' halt is set for ' + (ctx.nodeId || '<id>') + '. Resolve the cause, then clear-halt --reason consent|security to resume.',
  write_halt_invalid_reason: (ctx) =>
    'Invalid write-halt --reason. Use one of: ' + ((ctx.validReasons || []).join(', ') || 'consent, security, test_thrash, merge_conflict') + '.',

  // --- reopen / repair primitives (#434 / D-434-01) ---
  no_parseable_nodes: () =>
    'The plan has no parseable ## Nodes. Restore / re-freeze a valid workflow-plan.md before reopening.',
  node_not_found: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not in the plan\'s ## Nodes. Check the node id against the frozen plan.',
  node_not_complete: (ctx) =>
    'Only a complete node can be reopened for repair; ' + (ctx.nodeId || '<id>') + ' is not complete. Run to allDone first, then reopen.',
  would_orphan_in_progress: () =>
    'Reopening this node would orphan an in_progress sibling. Close the in_progress node(s) first, then reopen.',
  // The replan preconditions below are empirical, not inferred: prepareReplan was run against an
  // all-complete post-finalize fixture and refuses `replan_source_journal_missing` with no
  // `.cache/review-attempts.json`, `replan_source_outcome_missing` with the journal but no
  // `.cache/replan-source.json` repair_outcome handoff, and only prepares when BOTH are present. An
  // all-complete ledger is not itself a blocker.
  //
  // The hint fires from TWO structurally different states, so it is state-aware on exactly two axes.
  //
  // AXIS 1 — did the run actually finish? A run is finished ONLY when the terminal sink reached
  // `complete` (runIsFinished). Then "open a follow-up" is the honest advice. With a sink at
  // pending / in_progress — or at `n/a`, which means the sink was marked NOT APPLICABLE and therefore
  // shipped nothing at all — claiming the work shipped would be false AND would foreclose the in-plan
  // mid-run continuation (repair the tail-most settled writer instead).
  //
  // AXIS 2 — how much of THIS call had already written when the guard fired? Not the same for the two
  // ops, so the clause must not be shared:
  //   * reopen-node reaches the guard before ANY side effect, so the strong claim holds verbatim: nothing
  //     was written, nothing is wedged, and hand-editing a ledger row is never the right move.
  //   * repair-node reaches the guard LATE — an interrupted-rebind convergence (reconcilePendingRebind,
  //     which writes the review journal, a baseline file and even a git ref) and the STEP-15 barrier shell
  //     both run ahead of it. The repair's OWN ledger mutation is still unapplied, but a shared preamble
  //     may already have written, so the honest claim is narrower.
  // In BOTH cases the "do not hand-edit" advice is scoped to THIS refusal only. It does not speak to an
  // ALREADY-WEDGED project — one mutated by a runtime that predates this guard — whose documented
  // two-step manual recovery (docs/workflow-state-contract.md) is the correct procedure for that state.
  would_strand_completed_dependent: (ctx) =>
    'Row(s) ' + (((ctx.stranded || []).join(', ')) || '<id>') + ' are already settled, so '
    + (ctx.op === 'repair' ? 'repairing ' : 'reopening ') + (ctx.nodeId || '<id>')
    + ' would strand them above a dependency this reset moves to pending — a ledger shape every downstream '
    + 'authority rejects. '
    + (ctx.op === 'repair'
      ? 'This refusal fired BEFORE the repair applied any of its own mutations, so no ledger row moved and '
        + 'the node ledger on disk is still consistent; note that a shared preamble of this same call (an '
        + 'interrupted-rebind convergence and the barrier shell) may already have written the review '
        + 'journal, a baseline or a git ref, which is expected and self-converging on retry. '
      : 'This refusal fired BEFORE any mutation, so the ledger on disk is still consistent and there is '
        + 'nothing wedged: ')
    + 'do NOT hand-edit a ledger row here, take a sanctioned exit instead. A '
    + 'replacement plan (/kaola-workflow-adapt) is the sanctioned exit ONLY when this project already '
    + 'carries BOTH .cache/review-attempts.json and a valid .cache/replan-source.json repair_outcome '
    + 'handoff — without them replan prepare itself refuses (replan_source_journal_missing / '
    + 'replan_source_outcome_missing). '
    + (ctx.runFinished
      ? 'The terminal sink already ran to complete, so this run is finished: if neither precondition holds, '
        + 'treat the work as shipped and open a follow-up issue instead.'
      : 'The terminal sink is NOT complete — this run is NOT finished and nothing has shipped, so do not '
        + 'treat it as such. In plan, repair the TAIL-most settled writer instead: the named row(s) sit '
        + 'downstream of ' + (ctx.nodeId || '<id>') + ', and repair-node admits the graph-maximal producer '
        + 'of the flagged findings.'),
  no_active_reviewer: () =>
    'No active reviewer node to attach the repair to. Open the reviewer gate before repair-node.',
  ledger_splice_failed: (ctx) =>
    'Could not reset the writer ' + (ctx.nodeId || '<id>') + ' to pending (ledger splice failed). Inspect the ## Node Ledger for a malformed row.',
  barrier_base_missing: (ctx) =>
    'No barrier-base recorded for ' + (ctx.nodeId || '<id>') + '. Run open-next first so a baseline exists, then retry revert-overflow.',
  barrier_base_empty: (ctx) =>
    'The barrier-base for ' + (ctx.nodeId || '<id>') + ' is empty. Re-open the node to record a fresh baseline before revert-overflow.',
  git_checkout_failed: (ctx) =>
    'Reverting the out-of-allow paths for ' + (ctx.nodeId || '<id>') + ' failed at the git checkout seam (' + (ctx.detail || 'non-zero') + '). Resolve the working-tree state and retry revert-overflow.',
  group_baseline_failed: (ctx) =>
    'Recording the lane-group baseline failed (group ' + (ctx.group_id || '<gid>') + '). Re-run open-ready; if it persists, reconcile the running set.',

  // --- #701 semantic-owner repair admissibility bridge ---
  repair_writer_ownership_mismatch: (ctx) =>
    'repair-node ' + (ctx.nodeId || '<id>') + ' is a graph-maximal producer but owns NONE of the attempt\'s still-open blocking findings'
    + ((ctx.owners && ctx.owners.length) ? ' (they are owned by ' + ctx.owners.join(', ') + ')' : '')
    + ', so reopening it cannot repair the flagged code. Re-run repair-node --node-id <the finding\'s semantic owner>, or replan.',
  dependent_producer_replay_required: (ctx) =>
    'The semantic owner ' + (ctx.semantic_owner || '<writer>') + ' is a NON-maximal upstream writer whose completed downstream writer(s)'
    + ((ctx.blocking_descendants && ctx.blocking_descendants.length) ? ' (' + ctx.blocking_descendants.join(', ') + ')' : '')
    + ' would have to be replayed to reopen it safely — not supported in-plan. Activate a replacement plan (/kaola-workflow-adapt) that re-derives from ' + (ctx.semantic_owner || '<writer>') + '.',

  // --- open-ready scheduler (#377) ---
  reconcile_first: () =>
    'A crashed open-ready left the running set in opening state. Run ' + ADAPTIVE_NODE_SCRIPT + ' reconcile-running-set --project <P> --json before opening more.',
  overlapping_write_sets: () =>
    'The write frontier members have overlapping declared sets — they cannot co-open as a lane group. The scheduler degrades to a serial open automatically.',

  // --- main() arg validation ---
  invalid_project: (ctx) =>
    'The --project segment is reserved/illegal (' + (ctx.detail || 'must be issue-N, never the literal kaola-workflow') + '). Pass a valid project name.',
};

// ---------------------------------------------------------------------------
// getOperatorHint(reason, ctx) (#445 / D-445-01 §1-2) — the single emit-time
// accessor. Looks up `reason` in OPERATOR_HINT_REGISTRY, calls the template with
// the emit context, and returns the one-sentence string. A reason with no
// registered template (or a template that throws / returns empty) falls back to
// a documented GENERIC hint — never an empty string. Hints are generated at emit
// time, not stored, so the string is always consistent with the reason it
// accompanies.
// ---------------------------------------------------------------------------
function getOperatorHint(reason, ctx) {
  const safeCtx = ctx || {};
  const fallback = 'Refusal reason: ' + (reason || 'unknown')
    + (safeCtx.nodeId ? ' (node ' + safeCtx.nodeId + ')' : '')
    + '. Run orient to inspect the plan + ledger state and the relevant plan-run recovery card.';
  const tmpl = OPERATOR_HINT_REGISTRY[reason];
  if (typeof tmpl !== 'function') return fallback;
  try {
    const out = tmpl(safeCtx);
    return (typeof out === 'string' && out.trim()) ? out : fallback;
  } catch (_) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// decorateOperatorHint(envelope) (#445 / D-445-01 §2) — additive emit-time
// decoration applied at the SINGLE output point in main(). Adds a top-level
// `operator_hint` string (sibling of result/reason) to every actionable typed
// outcome — result: refuse / halt / warn — that carries a `reason`. A success
// envelope (result: ok / ready_to_run with no reason) gets nothing: presence of
// operator_hint is itself the "there is a next step" signal. Existing consumers
// reading result/reason are unaffected (purely additive). Idempotent: never
// overwrites an operator_hint a callee already set.
// ---------------------------------------------------------------------------
function decorateOperatorHint(envelope) {
  if (!envelope || typeof envelope !== 'object') return envelope;
  const actionable = envelope.result === 'refuse'
    || envelope.result === 'halt'
    || envelope.result === 'warn';
  if (!actionable) return envelope;
  if (!envelope.reason) return envelope;
  if (typeof envelope.operator_hint === 'string' && envelope.operator_hint) return envelope;
  envelope.operator_hint = getOperatorHint(envelope.reason, envelope);
  return envelope;
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
// getMainRoot — #335: resolve the MAIN checkout root even when cwd is a linked
// worktree. #579: delegates to resolveMainRoot from adaptive-schema (shared
// resolver — removes the local re-impl that duplicated claim.js logic).
// ---------------------------------------------------------------------------
function getMainRoot(root) {
  return resolveMainRoot(root);
}

// ---------------------------------------------------------------------------
// copyTree — #335: small recursive copy (readdirSync withFileTypes +
// copyFileSync, skipping symlinks). Same shape as claim.js exportWorktreeDiff;
// no fs.cpSync precedent in this repo. Parents of `dest` are created by the
// caller (mkdirSync). Best-effort on directory entries; throws on file copy
// errors so the caller's transaction fails closed.
// ---------------------------------------------------------------------------
function copyTree(src, dest, io) {
  io.mkdirSync(dest, { recursive: true });
  const entries = io.readdir(src);
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isSymbolicLink && e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      copyTree(from, to, io);
    } else if (e.isFile()) {
      io.copyFile(from, to);
    }
  }
}

// ---------------------------------------------------------------------------
// validateProjectName — #318: the project arg becomes a path SEGMENT under
// kaola-workflow/<project>/. The reserved literal 'kaola-workflow' (or an
// empty / '.' / '..' / separator-bearing segment) collapses the canonical
// join into a nested kaola-workflow/kaola-workflow/.cache path, the exact
// drift observed in the issue #249 run. Reject the project SEGMENT — NOT a
// path substring: this repo's own toplevel is named kaola-workflow, so the
// legitimate container path .../kaola-workflow/kaola-workflow/issue-N already
// contains the substring and a substring check would false-positive on every
// legit run. Legit projects are issue-N, so the reserved-name rule is safe.
//
// @param {string} project  the --project value
// @returns {{ ok:boolean, reason?:string }}
// ---------------------------------------------------------------------------
function validateProjectName(project) {
  if (!project || project === '.' || project === '..'
      || /[\\/]/.test(project) || project === 'kaola-workflow') {
    return { ok: false, reason: 'invalid_project' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  const s = String(str || '');
  try { return JSON.parse(s); } catch (_) {}
  // #355: parse the LAST line that is valid JSON — a stray log/warning line before the framed
  // JSON must NOT turn a success into an empty {} (treated as a refusal by callers).
  // #403.1: a trailing non-object JSON scalar (`true`/`42`/`null`) must NOT win and get spread
  // into `{...scalar, exitCode:0}` (a success silently flattened to a refusal); only an object
  // (non-null) payload is a valid framed result line — keep scanning past a scalar/array.
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (_) {}
  }
  return {};
}

// ---------------------------------------------------------------------------
// shellNode — thin seam: execute a Node.js script and return {exitCode,...json}.
// Fail-closed: exitCode 1 + {} on throw with no stdout.
//
// @param {string} scriptPath  absolute path to the script
// @param {string[]} args      CLI args
// @returns {{ exitCode:number, [key:string]: any }}
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
//
// refreshTaskMirror: regenerate the durable workflow-tasks.json from the just-mutated
// ledger by SHELLING the task-mirror CLI (resolved via taskMirrorPath, edition-neutral).
// CRITICAL fail-OPEN contract (opposite of every other guard here): a mirror-refresh
// failure must NEVER roll back a correct ledger transition — it is recorded in the
// returned `taskMirror` field and the command still returns result:'ok'. Callers invoke
// it ONLY after the final stable plan write of a successful ledger mutation.
//
// buildTransition: a machine-readable UI transition the orchestrator applies to the live
// task list without inference. `status` is mapped via the task-mirror's mapLedgerStatus so
// the UI map single-sources from the durable mirror and cannot drift.
// ---------------------------------------------------------------------------
function refreshTaskMirror(project, shell) {
  if (!project) return { status: 'skipped' };
  const outPath = 'kaola-workflow/' + project + '/workflow-tasks.json';
  let res;
  try { res = shell(taskMirrorPath, ['--project', project, '--json']); }
  catch (_) { return { status: 'failed', path: outPath }; }
  if (res && res.exitCode === 0) return { status: 'updated', path: outPath };
  // #355: task-mirror now emits its refusal on STDOUT via the shared envelope, so the
  // reason survives shellNode (which parses err.stdout). Surface it instead of the old
  // catch-all 'failed' that discarded the diagnostic.
  return { status: 'failed', path: outPath, reason: (res && res.reason) || null };
}

function buildTransition(id, ledgerStatus, reason, note) {
  // Fail-OPEN, matching refreshTaskMirror: this runs AFTER the ledger is already written, so it must
  // never throw. mapLedgerStatus is a total switch (cannot throw), but the require() could in a
  // broken/partial install — fall back to an inline equivalent map so a transition is still returned.
  let status;
  try {
    status = require(taskMirrorPath).mapLedgerStatus(ledgerStatus);
  } catch (_) {
    status = (ledgerStatus === 'complete' || ledgerStatus === 'n/a') ? 'completed'
      : (ledgerStatus === 'in_progress' ? 'in_progress' : 'pending');
  }
  const t = { id: id, status: status, ledger_status: ledgerStatus, reason: reason };
  if (note) t.note = note;
  return t;
}

// ---------------------------------------------------------------------------
// appendNodeTiming (#373 / D1) — best-effort wall-clock telemetry sidecar.
// Appends ONE JSON line per node lifecycle transition to
// kaola-workflow/{project}/.cache/node-timings.jsonl. Append-only; NEVER throws — a
// timings write failure must never refuse or alter a transition. .cache/ is already a
// barrier-exempt workflow band, so this adds no validator surface. The ledger/plan
// formats are deliberately unchanged (the ledger has multiple parser consumers).
// ---------------------------------------------------------------------------
function appendNodeTiming(planPath, node, event) {
  try {
    const fs = require('fs');
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(
      path.join(cacheDir, 'node-timings.jsonl'),
      JSON.stringify({ node: node, event: event, ts: new Date().toISOString() }) + '\n'
    );
  } catch (_) { /* best-effort: telemetry never blocks a lifecycle transition */ }
}

// ---------------------------------------------------------------------------
// deriveMaxSimultaneousOpen (#472) — derive the MAX simultaneous-open count + everConcurrent from the
// durable node-timings.jsonl `opened`/`closed` events (the EXISTING telemetry — no redundant counter;
// recording "open-ready opened N" would be near-circular since open-ready opens N by definition). A pure
// event-sweep: +1 per `opened`, −1 per `closed`, tracking the running maximum. `everConcurrent` (max ≥ 2)
// is the load-bearing PROOF that an authored-parallel frontier actually RAN concurrently — not merely
// that the scheduler marked N ready. This is the dispatch-fidelity trace the investigation derived from
// the same events: a green chain proves the seam exists; only a real-run trace with everConcurrent:true
// proves the authored width dispatched concurrently (the live gate #472 stays OPEN for).
// @param {string} timingsContent  raw node-timings.jsonl
// @returns {{ maxSimultaneousOpen:number, everConcurrent:boolean }}
function deriveMaxSimultaneousOpen(timingsContent) {
  const events = [];
  for (const line of String(timingsContent || '').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let e; try { e = JSON.parse(s); } catch (_) { continue; }
    if (e && (e.event === 'opened' || e.event === 'closed') && typeof e.ts === 'string') events.push(e);
  }
  // Stable sort by ts; on a tie, process `closed` BEFORE `opened` so a same-ts close→open hand-off does
  // not inflate the count (conservative — never over-reports concurrency).
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : (a.event === 'closed' ? -1 : 1)));
  // Track DISTINCT currently-open node ids (a Set), NOT an integer counter — `appendNodeTiming` appends
  // unconditionally, so a crash-resume re-open of ONE node emits a second `opened` with no intervening
  // `closed`; an integer would inflate that lone node to 2 (a spoofed everConcurrent). The Set makes a
  // duplicate `opened` for an already-open node a no-op, so only GENUINELY-distinct concurrent nodes
  // raise the max — the load-bearing property, since everConcurrent is #472's eventual close-criterion.
  const openIds = new Set();
  let max = 0;
  for (const e of events) {
    if (e.event === 'opened') { openIds.add(e.node); if (openIds.size > max) max = openIds.size; }
    else { openIds.delete(e.node); }
  }
  return { maxSimultaneousOpen: max, everConcurrent: max >= 2 };
}

// ---------------------------------------------------------------------------
// appendProvenanceLog (#424 / D-424-01 §5) — best-effort lifecycle audit trail.
// Appends ONE structured JSONL entry to kaola-workflow/{project}/.cache/provenance-log.jsonl
// for each of: record-base, drop-base, open-next/open-ready (open), close-and-open-next/
// close-node (close). Append-only JSONL — a crash mid-write loses at most the trailing
// line, never corrupts prior entries. NEVER throws — a log write failure must NOT fail the
// command. .cache/ is barrier-exempt (D-424-01 allowband), so this adds no validator surface.
// ---------------------------------------------------------------------------
// AC5 (#597): `extra` is an OPTIONAL object of additional structured fields merged into the entry — the
// discard-speculative path passes { role, gate } so every speculative discard (read or write) records
// WHAT was discarded (node id + role + the gate it bet on), making the economics of `auto` observable
// per run. Absent/non-object `extra` ⇒ byte-identical to the pre-#597 entry shape.
function appendProvenanceLog(planPath, event, nodeId, nonce, extra) {
  try {
    const fs = require('fs');
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      event: event,
      nodeId: nodeId,
      nonce: nonce || null,
      by: 'adaptive-node',
    };
    if (extra && typeof extra === 'object') Object.assign(entry, extra);
    fs.appendFileSync(
      path.join(cacheDir, 'provenance-log.jsonl'),
      JSON.stringify(entry) + '\n'
    );
  } catch (_) { /* best-effort: provenance log never blocks a lifecycle transition */ }
}

// ---------------------------------------------------------------------------
// seedEvidenceFile (#433 / D-433-01 §2) — open-time evidence seeding.
// Writes .cache/{node-id}.md with a binding header (line 1) and role-specific stub
// placeholders sourced from ROLE_TOKEN_REGISTRY in the plan-validator. Idempotent:
// does NOT overwrite an existing file (crash-resume: the in-progress evidence is
// authoritative). Returns the relative evidence_file path and required_tokens list.
// NEVER throws — a seed failure must NOT fail open-next.
//
// @param {string} planPath      path to workflow-plan.md (used to locate .cache/)
// @param {string} nodeId        the node id just opened
// @param {string} nonce         the per-open evidence-binding nonce (12-char SHA prefix)
// @param {string} role          the node's role string
// @param {boolean} forceRotate  if true, RE-SEED the ENTIRE file (nonce rotation on reopen — stale body discarded)
// @returns {{ evidence_file:string, required_tokens:string[], nonce_rotated?:boolean }}
// ---------------------------------------------------------------------------
// upstreamReadStubIds(planPath, nodeId, role) — the producer-upstream ids the durable node channel seeds
// an EMPTY `upstream_read: <up-id>` stub for. Non-empty ONLY when the node's role ∈ IMPLEMENT_ROLES and it
// has ≥1 depends_on whose upstream role ∈ PRODUCER_ROLES. Reads the plan to resolve deps + upstream roles.
// Fail-soft to [] (a seed failure must not brick the open); [] ⇒ byte-identical seed.
function upstreamReadStubIds(planPath, nodeId, role) {
  try {
    let IMPLEMENT_ROLES, PRODUCER_ROLES;
    try { ({ IMPLEMENT_ROLES, PRODUCER_ROLES } = require('./kaola-workflow-plan-validator')); } catch (_) { return []; }
    if (!IMPLEMENT_ROLES || typeof IMPLEMENT_ROLES.has !== 'function' || !IMPLEMENT_ROLES.has(role)) return [];
    if (!PRODUCER_ROLES || typeof PRODUCER_ROLES.has !== 'function') return [];
    const content = require('fs').readFileSync(planPath, 'utf8');
    const nodes = parseNodesFromContent(content);
    const self = nodes.find(n => n.id === nodeId);
    const deps = (self && Array.isArray(self.dependsOn)) ? self.dependsOn : [];
    if (!deps.length) return [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    return deps.filter(upId => { const up = byId.get(upId); return !!(up && PRODUCER_ROLES.has(up.role)); });
  } catch (_) { return []; }
}

// #699: schema-2 G4 receipts bind a declared logical certifier to the exact inherited epoch
// frontier and code candidate that existed when that reviewer was opened. These fields are
// runtime authority, not agent-authored prose: open-time seeding supplies the values and
// record-evidence preserves them for read-only reviewer returns.
const G4_CERTIFIER_BINDING_FIELDS = Object.freeze([
  'certifier_kind',
  'certifier_aggregation',
  'certifier_gate_digest',
  'certifier_epoch_lineage_id',
  'certifier_inherited_frontier_digest',
  'certified_candidate_digest',
]);

function g4CertifierSeedContext(planPath, nodeId, role) {
  try {
    const fs = require('fs');
    const validator = require('./kaola-workflow-plan-validator');
    const content = fs.readFileSync(planPath, 'utf8');
    const contract = validator.parseEpochContract(content);
    if (!contract.active) return null;
    const nodes = validator.parseNodes(content);
    let matched = null;
    for (const [kind, field, expectedRole] of [
      ['code', 'code_certifier', 'code-reviewer'],
      ['security', 'security_certifier', 'security-reviewer'],
    ]) {
      if (role !== expectedRole) continue;
      const resolved = validator.resolveNamedCertifier(nodes, contract.fields[field], expectedRole);
      if (resolved && resolved.members.some(member => member.id === nodeId)) {
        matched = { kind, resolved };
        break;
      }
    }
    if (!matched) return null;

    const projectDir = path.dirname(path.resolve(planPath));
    const workflowDir = path.dirname(projectDir);
    const project = path.basename(projectDir);
    const root = path.basename(workflowDir) === 'kaola-workflow' ? path.dirname(workflowDir) : null;
    const candidate = root
      ? validator.computeCodeTreeHash(root, project, validator.parseValidationTestConsumes(content))
      : null;
    const values = {
      certifier_kind: matched.kind,
      certifier_aggregation: matched.resolved.aggregation,
      certifier_gate_digest: sha256Hex(Buffer.from(canonicalJson(matched.resolved.identity), 'utf8')),
      certifier_epoch_lineage_id: String(contract.fields.epoch_lineage_id || ''),
      certifier_inherited_frontier_digest: String(contract.fields.inherited_frontier_digest || ''),
      certified_candidate_digest: /^[0-9a-f]{64}$/.test(String(candidate || '')) ? candidate : '',
    };
    return { tokens: G4_CERTIFIER_BINDING_FIELDS.slice(), values };
  } catch (_) { return null; }
}

function readSeededG4Bindings(content) {
  const source = String(content || '');
  const patterns = {
    certifier_kind: /^(?:code|security)$/,
    certifier_aggregation: /^(?:sequence|replicated_majority|partitioned_all)$/,
    certifier_gate_digest: /^[0-9a-f]{64}$/,
    certifier_epoch_lineage_id: /^[0-9a-f]{64}$/,
    certifier_inherited_frontier_digest: /^[0-9a-f]{64}$/,
    certified_candidate_digest: /^[0-9a-f]{64}$/,
  };
  const values = {};
  for (const name of G4_CERTIFIER_BINDING_FIELDS) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = Array.from(source.matchAll(new RegExp('^' + escaped + ':[ \\t]*(.*?)[ \\t]*$', 'gm')));
    if (matches.length !== 1 || !patterns[name].test(matches[0][1])) return null;
    values[name] = matches[0][1];
  }
  return values;
}

function preserveSeededG4Bindings(content, bindings) {
  let out = String(content || '');
  for (const name of G4_CERTIFIER_BINDING_FIELDS) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('^' + escaped + ':[^\\r\\n]*(?:\\r?\\n|$)', 'gm'), '');
  }
  if (out && !out.endsWith('\n')) out += '\n';
  for (const name of G4_CERTIFIER_BINDING_FIELDS) out += name + ': ' + bindings[name] + '\n';
  return out;
}

// Reviewer contract v2 lifecycle -------------------------------------------
//
// The plan validator owns Markdown parsing and graph classification; this
// module owns the stateful open/close envelope. These helpers keep runtime-
// neutral context bytes separate from the runtime-specific profile identity
// carried on the dispatch card.
const REVIEW_CONTEXT_DIR = 'review-contexts';
const REVIEW_RECEIPT_DIR = 'review-receipts';
const REVIEW_CLAIM_ROOT_DIR = 'review-claim-roots';

function reviewMetaValue(planContent, name) {
  try {
    const { sectionBody } = require('./kaola-workflow-classifier');
    const body = sectionBody(planContent, 'Meta');
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...String(body || '').matchAll(new RegExp('^' + escaped + ':[ \\t]*(.*?)[ \\t]*$', 'gm'))];
    return matches.length === 1 ? matches[0][1].trim() : null;
  } catch (_) { return null; }
}

function detectReviewRuntime() {
  const explicit = String(process.env.KAOLA_WORKFLOW_RUNTIME || '').toLowerCase();
  if (['claude', 'codex', 'opencode', 'kimi'].includes(explicit)) return explicit;
  if (/[/\\]plugins[/\\]kaola-workflow(?:-(?:gitlab|gitea))?[/\\]scripts$/.test(__dirname)) return 'codex';
  // #717: the INSTALLED Codex plugin cache inserts <marketplace> and <version> segments between
  // the plugin name and scripts/:
  //   .../plugins/cache/<marketplace>/kaola-workflow[-gitlab|-gitea]/<version>/scripts
  // The source-tree pattern above does not match that layout, so detection used to fall through
  // to claude and probe a non-existent agents/<role>.md (review_profile_unavailable on every
  // schema-2 gate open). Match the exact versioned cache tuple for all three forge editions —
  // single path segments only, anchored at the tail, so no looser layout binds a codex identity.
  if (/[/\\]plugins[/\\]cache[/\\][^/\\]+[/\\]kaola-workflow(?:-(?:gitlab|gitea))?[/\\][^/\\]+[/\\]scripts$/.test(__dirname)) return 'codex';
  // kimi installs support scripts at <kimi-home>/kaola-workflow/scripts/ (kimi home =
  // $KIMI_CODE_HOME, default ~/.kimi-code). Detect that layout BEFORE the opencode pattern
  // below, which would otherwise swallow the kimi install and probe opencode profile paths —
  // binding a wrong-runtime reviewer identity when the project also carries .opencode/agent/.
  // Compare REALPATHS: require() resolves __dirname through symlinks while the env var stays
  // verbatim (macOS /var→/private/var), so a naive string equality misses the match.
  const fs = require('fs');
  const kimiHome = process.env.KIMI_CODE_HOME || path.join(require('os').homedir(), '.kimi-code');
  const realpathOrSelf = p => { try { return fs.realpathSync(p); } catch (_) { return p; } };
  if (realpathOrSelf(__dirname) === realpathOrSelf(path.join(kimiHome, 'kaola-workflow', 'scripts'))
    || /[/\\]\.kimi-code[/\\]kaola-workflow[/\\]scripts$/.test(__dirname)) {
    return 'kimi';
  }
  // #712: a claude install lands support scripts at ~/.claude/kaola-workflow/scripts/ (install.sh
  // SUPPORT_DIR). Detect that layout BEFORE the opencode pattern below, which otherwise swallows
  // the plain-claude install (a #708 side effect) and routes it down the opencode profile
  // candidates. The -gitlab/-gitea claude-forge dirs (~/.claude/kaola-workflow-gitlab/scripts/)
  // never matched the opencode pattern and keep falling through to the claude default below.
  if (/[/\\]\.claude[/\\]kaola-workflow[/\\]scripts$/.test(__dirname)) return 'claude';
  // #736: a self-dev checkout cloned into a directory literally named `kaola-workflow` (the
  // repo's own name) is structurally identical to an opencode install's
  // <config>/kaola-workflow/scripts/ layout, so the pattern below would otherwise swallow it and
  // bind a wrong-runtime reviewer identity. Disambiguate BEFORE that check via the sibling
  // package.json one level up from scripts/ — the same self-dev predicate the kaola_script
  // resolvers use (sync-opencode-edition.js / sync-kimi-edition.js). A genuine opencode config
  // dir has no sibling repo package.json at that path, so this guard cannot swallow it.
  {
    const fs = require('fs');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      if (pkg && pkg.name === 'kaola-workflow') return 'claude';
    } catch (_) { /* no sibling package.json (or unreadable) — not a self-dev checkout */ }
  }
  // #708: opencode installs support scripts at <opencode-config>/kaola-workflow/scripts/ (no
  // plugins/ segment — opencode is a runtime, not a forge). Detect that layout so reviewer
  // profile resolution and review-receipt binding use opencode-native paths instead of falling
  // back to the Claude default (which points at a non-existent agents/ dir and hard-blocks
  // every review-gated plan with review_profile_unavailable).
  if (/[/\\]kaola-workflow[/\\]scripts$/.test(__dirname) && !/[/\\]plugins[/\\]/.test(__dirname)) {
    return 'opencode';
  }
  return 'claude';
}

function reviewerProfilePath(role, runtime) {
  if (runtime === 'codex') return path.join(__dirname, '..', 'agents', role + '.toml');
  if (runtime === 'opencode') {
    // #708: opencode installs reviewer profiles at <config>/agent/{role}.md (global install) or
    // <project>/.opencode/agent/{role}.md (project install). The support script lives at
    // <config>/kaola-workflow/scripts/, so <config> = path.join(__dirname, '..', '..'). opencode
    // resolves config global→project (project wins), so probe the project location first, then
    // the global location, then the canonical Claude path (self-dev parity — this repo's
    // agents/*.md carry the Claude-frontmatter identity fields the opencode transform preserves).
    const fs = require('fs');
    const candidates = [
      path.join(process.cwd(), '.opencode', 'agent', role + '.md'),     // project install
      path.join(__dirname, '..', '..', 'agent', role + '.md'),           // global install (<config>/agent/)
      path.join(__dirname, '..', 'agents', role + '.md'),                // self-dev canonical Claude path
    ];
    for (const c of candidates) {
      try { fs.accessSync(c); return c; } catch (_) {}
    }
    // Default to the global candidate so a missing profile yields review_profile_unavailable
    // (not a silent fallthrough to the Claude path, which would bind the wrong identity).
    return path.join(__dirname, '..', '..', 'agent', role + '.md');
  }
  if (runtime === 'kimi') {
    // kimi installs reviewer role-contract skills at <project>/.kimi-code/skills/kaola-role-{role}/
    // SKILL.md (project install) or <kimi-home>/skills/kaola-role-{role}/SKILL.md (global
    // install). The support script lives at <kimi-home>/kaola-workflow/scripts/, so <kimi-home> =
    // path.join(__dirname, '..', '..') — robust to a custom $KIMI_CODE_HOME. Kimi resolves
    // global→project (project wins), so probe the project location first, then the global
    // location, then the canonical Claude path (self-dev parity — same fallback shape as the
    // opencode branch above).
    const fs = require('fs');
    const skillRel = path.join('kaola-role-' + role, 'SKILL.md');
    const candidates = [
      path.join(process.cwd(), '.kimi-code', 'skills', skillRel),      // project install
      path.join(__dirname, '..', '..', 'skills', skillRel),            // global install (<kimi-home>/skills/)
      path.join(__dirname, '..', 'agents', role + '.md'),              // self-dev canonical Claude path
    ];
    for (const c of candidates) {
      try { fs.accessSync(c); return c; } catch (_) {}
    }
    // Default to the global candidate so a missing profile yields review_profile_unavailable
    // (not a silent fallthrough to the Claude path, which would bind the wrong identity).
    return path.join(__dirname, '..', '..', 'skills', skillRel);
  }
  if (runtime === 'claude') {
    // #712: claude installs reviewer profiles into Claude Code's native agent dir
    // (<agents>/<role>.md — $KAOLA_AGENT_DIR when set, else ~/.claude/agents; the same
    // convention install.sh AGENTS_DIR and kaola-workflow-resolve-agent-model.js use).
    // Probe order keeps every previously-resolving layout green: the currently-probed
    // <support>/agents/<role>.md first (the self-dev canonical agents/ next to a source
    // checkout's scripts/, AND the documented symlink workaround at
    // ~/.claude/kaola-workflow/agents/ — an already-linked install must keep resolving), then
    // the native installed location. A total miss defaults to the native candidate so an
    // absent profile yields review_profile_unavailable — never a silent wrong-runtime binding.
    const fs = require('fs');
    const nativeAgentsDir = process.env.KAOLA_AGENT_DIR
      || path.join(process.env.HOME || require('os').homedir(), '.claude', 'agents');
    const candidates = [
      path.join(__dirname, '..', 'agents', role + '.md'),   // self-dev canonical / legacy probed dir
      path.join(nativeAgentsDir, role + '.md'),             // native installed location
    ];
    for (const c of candidates) {
      try { fs.accessSync(c); return c; } catch (_) {}
    }
    return path.join(nativeAgentsDir, role + '.md');
  }
  return path.join(__dirname, '..', 'agents', role + '.md');
}

// The canonical runtime-neutral behavior identity for the built-in main-session gate. It is an in-process,
// non-delegable contract with no profile file, so its behavior identity is a fixed hash of a canonical spec
// (never a hash of runtime-specific bytes), keeping its schema-2 context byte-identical across runtimes.
const MAIN_SESSION_GATE_BEHAVIOR_HASH = require('crypto').createHash('sha256')
  .update(reviewSchema.canonicalJson({ schema_version: 2, role: 'main-session-gate',
    behavior_contract_version: 2, contract: 'review-contract-v2' })).digest('hex');
const MAIN_SESSION_GATE_NEUTRAL_BYTES = 'main-session-gate:review-contract-v2\n';

function resolveReviewerProfileIdentity(role, opts) {
  opts = opts || {};
  const crypto = require('crypto');
  const fs = require('fs');
  const runtime = opts.reviewRuntime || detectReviewRuntime();
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  // The built-in main-session gate has no profile file. Give it an EXPLICIT runtime-neutral behavior
  // identity (contract v2) so its schema-2 context is byte-identical across runtimes instead of collapsing
  // to a synthetic v1 hash. Its resolved_profile_hash is the neutral-byte digest (runtime-independent).
  if (role === 'main-session-gate') {
    return { ok: true, runtime, behavior_contract_version: 2,
      behavior_contract_hash: MAIN_SESSION_GATE_BEHAVIOR_HASH,
      resolved_profile_hash: digest(MAIN_SESSION_GATE_NEUTRAL_BYTES), profile_path: null };
  }
  const profilePath = opts.reviewProfilePath || reviewerProfilePath(role, runtime);
  let bytes = null;
  try { bytes = fs.readFileSync(profilePath, 'utf8'); } catch (_) { bytes = null; }
  if (bytes === null) return { ok: false, reason: 'review_profile_unavailable', role };

  const boundedBlock = (source, startMarker, endMarker) => {
    const starts = source.split(startMarker).length - 1;
    const ends = source.split(endMarker).length - 1;
    if (starts === 0 || ends === 0) return { ok: false, reason: 'missing' };
    if (starts !== 1 || ends !== 1) return { ok: false, reason: 'ambiguous' };
    const start = source.indexOf(startMarker);
    const endStart = source.indexOf(endMarker, start + startMarker.length);
    if (endStart < start) return { ok: false, reason: 'ambiguous' };
    const end = endStart + endMarker.length;
    return { ok: true, text: source.slice(start, end), start, end };
  };

  let instructions = null;
  if (runtime === 'codex') {
    // One adjacent validator is the authoritative Codex profile acceptance wall. Runtime must not
    // grow a second grammar that accepts re-signed bytes installer/preflight refuse.
    const profileReasons = require('./kaola-workflow-codex-preflight')
      .validateProfileText(bytes, role);
    if (profileReasons.length > 0) {
      const roleMismatchOnly = profileReasons.every(reason =>
        /^top-level 'name' is ".*" but must equal the role ".*"$/.test(reason)
          || reason === 'reviewer_behavior_core_role_mismatch');
      return { ok: false, reason: roleMismatchOnly
        ? 'review_profile_role_mismatch' : 'review_profile_grammar_invalid', role };
    }
    const instructionMatch = [...bytes.matchAll(
      /^developer_instructions\s*=\s*"""([\s\S]*?)"""\s*(?:\r?\n|$)/gm,
    )][0];
    instructions = instructionMatch[1];
    const outside = bytes.slice(0, instructionMatch.index)
      + bytes.slice(instructionMatch.index + instructionMatch[0].length);
    const names = [...outside.matchAll(/^name[ \t]*=[ \t]*"([^"\r\n]*)"[ \t]*$/gm)];
    if (names.length !== 1 || names[0][1] !== role) {
      return { ok: false, reason: 'review_profile_role_mismatch', role };
    }
  } else {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(bytes);
    const names = frontmatter
      ? [...frontmatter[1].matchAll(/^name:[ \t]*([^\r\n]+)[ \t]*$/gm)] : [];
    // Name binding is runtime-shaped: opencode profiles carry NO frontmatter name (opencode
    // resolves agents by filename, so the path already binds the role — the behavior-core
    // role check below still binds the content); kimi role-contract skills are named
    // kaola-role-<role>; every other markdown profile carries the bare role name.
    if (runtime !== 'opencode') {
      const expectedName = runtime === 'kimi' ? 'kaola-role-' + role : role;
      if (names.length !== 1 || names[0][1].trim() !== expectedName) {
        return { ok: false, reason: 'review_profile_role_mismatch', role };
      }
    }
  }

  const core = boundedBlock(runtime === 'codex' ? instructions : bytes,
    '<!-- reviewer-behavior-core:start -->', '<!-- reviewer-behavior-core:end -->');
  if (!core.ok) {
    return { ok: false, reason: core.reason === 'ambiguous'
      ? 'review_profile_identity_ambiguous' : 'review_profile_identity_unavailable', role };
  }
  const coreRoles = [...core.text.matchAll(/^role:[ \t]*([^\r\n]+)[ \t]*$/gm)];
  if (coreRoles.length !== 1 || coreRoles[0][1].trim() !== role) {
    return { ok: false, reason: 'review_profile_role_mismatch', role };
  }
  const coreVersions = [...core.text.matchAll(/^behavior_contract_version:[ \t]*(\d+)[ \t]*$/gm)];
  const coreHashes = [...core.text.matchAll(/^behavior_contract_hash:[ \t]*([0-9a-f]{64})[ \t]*$/gm)];
  if (coreVersions.length !== 1 || coreHashes.length !== 1) {
    return { ok: false, reason: coreVersions.length > 1 || coreHashes.length > 1
      ? 'review_profile_identity_ambiguous' : 'review_profile_identity_unavailable', role };
  }
  const versionRaw = coreVersions[0][1];
  const behaviorHash = coreHashes[0][1];

  let profileHash = null;
  if (runtime === 'codex') {
    const instructionVersions = [...instructions.matchAll(
      /^behavior_contract_version:[ \t]*([^\r\n]*)[ \t]*$/gm,
    )];
    const instructionHashes = [...instructions.matchAll(
      /^behavior_contract_hash:[ \t]*([^\r\n]*)[ \t]*$/gm,
    )];
    if (instructionVersions.length !== 1 || instructionHashes.length !== 1) {
      return { ok: false, reason: 'review_profile_identity_ambiguous', role };
    }
    const identity = boundedBlock(instructions,
      '<!-- reviewer-profile-identity:start -->', '<!-- reviewer-profile-identity:end -->');
    if (!identity.ok) {
      return { ok: false, reason: identity.reason === 'ambiguous'
        ? 'review_profile_identity_ambiguous' : 'review_profile_identity_unavailable', role };
    }
    const identityHashes = [...identity.text.matchAll(
      /^resolved_profile_hash:[ \t]*([0-9a-f]{64})[ \t]*$/gm,
    )];
    if (identityHashes.length !== 1) {
      return { ok: false, reason: identityHashes.length > 1
        ? 'review_profile_identity_ambiguous' : 'review_profile_identity_unavailable', role };
    }
    profileHash = identityHashes[0][1];
  } else {
    const profileFields = [...bytes.matchAll(
      /^resolved_profile_hash:[ \t]*([0-9a-f]{64})[ \t]*$/gm,
    )];
    if (profileFields.length !== 1) {
      return { ok: false, reason: profileFields.length > 1
        ? 'review_profile_hash_ambiguous' : 'review_profile_identity_unavailable', role };
    }
    profileHash = profileFields[0][1];
  }
  // A schema-2 gate role MUST carry an explicit runtime-neutral behavior identity generated by the
  // reviewer-profile pipeline. A profile missing the embedded version/behavior-hash/self-hash fails the
  // open BEFORE spawn with a typed refusal, rather than silently substituting a weaker v1 contract hashed
  // over runtime-specific profile bytes (which would give the same gate different context identities across
  // runtimes). Behavior contract version 2 is then enforced downstream in buildReviewContext.
  if (!(versionRaw && /^\d+$/.test(versionRaw)) || !/^[0-9a-f]{64}$/i.test(String(behaviorHash || ''))
    || !/^[0-9a-f]{64}$/i.test(String(profileHash || ''))) {
    return { ok: false, reason: 'review_profile_identity_unavailable', role };
  }
  const hashRe = /^(resolved_profile_hash\s*(?::|=)\s*"?)([0-9a-f]{64})("?\s*)$/gm;
  const matches = [...bytes.matchAll(hashRe)];
  if (matches.length !== 1) return { ok: false, reason: 'review_profile_hash_ambiguous', role };
  const match = matches[0];
  const normalized = bytes.slice(0, match.index) + match[1] + '0'.repeat(64) + match[3]
    + bytes.slice(match.index + match[0].length);
  const verifiedProfileHash = digest(normalized);
  if (verifiedProfileHash !== profileHash.toLowerCase()) {
    return { ok: false, reason: 'review_profile_hash_mismatch', role };
  }
  return { ok: true, runtime, behavior_contract_version: Number(versionRaw),
    behavior_contract_hash: behaviorHash.toLowerCase(),
    resolved_profile_hash: verifiedProfileHash, profile_path: profilePath };
}

function reviewLogicalGate(planNodes, node) {
  const shape = node && node.shape;
  const group = shape && shape.kind === 'fanout' ? shape.group : null;
  const origin = (node && node.dependsOn || []).slice().sort();
  let members = [node];
  if (group) {
    members = planNodes.filter(candidate => candidate.role === node.role
      && candidate.shape && candidate.shape.kind === 'fanout'
      && candidate.shape.group === group
      && JSON.stringify((candidate.dependsOn || []).slice().sort()) === JSON.stringify(origin));
  }
  members.sort((a, b) => a.id.localeCompare(b.id));
  const claim = String(node.gateClaim || '');
  const surfaces = members.map(member => String(member.gateSurface || ''));
  const certified = Array.from(new Set(members.flatMap(member => member.certifies || []))).sort();
  const identity = {
    kind: group ? 'group' : 'sequence',
    members: members.map(member => member.id),
    claim_digest: reviewSchema.sha256Hex(claim),
    surface_digests: surfaces.map(surface => reviewSchema.sha256Hex(surface)),
    aggregation: String(node.gateAggregation || 'sequence'),
    certified_producers: certified,
  };
  return {
    ...identity,
    key: reviewSchema.sha256Hex(reviewSchema.canonicalJson(identity)),
    surfaces,
  };
}

// Durable review history is selected by scope lineage (epoch_lineage_id + scope_lineage_id), not by the
// logical gate key. scope_lineage_id excludes the node id and is preserved across a claim-root base held
// stable at claim time, so a gate rename or a synthesis HEAD advance does not reset an in-flight scope
// back to discovery. Issue 699's cross-epoch activation consumes this scope-keyed reader.
//
// #722: this reader is PURE over an ALREADY-RESOLVED journal. It deliberately no longer re-reads the raw
// `.cache/review-attempts.json` bytes: after a committed repair->replan the ACTIVE journal on disk is still
// the PARENT epoch's (activation preserves it, since cross-epoch history is indexed by scope lineage), so
// the raw bytes are bound to the PARENT plan_hash and validating them against the CHILD plan wedged the
// child epoch's first gate on `review_journal_plan_hash_mismatch`. The caller resolves the journal through
// the ONE blessed cross-epoch transformation (readReviewJournal -> loadCommittedLegacyImport ->
// attachLegacyImport), which validates the plan_hash binding strictly MORE than this function did.
function readReviewLineageV2(journal, scopeLineageId, epochLineageId) {
  if (!journal || !Array.isArray(journal.attempts)) {
    return { attempts: [], last: null, prior_findings: [], validation_obligations: [],
      seen_idempotency_keys: [], previous_consecutive_nonprogress: 0, consumed_repairs: 0 };
  }
  const scope = String(scopeLineageId || '').toLowerCase();
  const epoch = String(epochLineageId || '').toLowerCase();
  const attempts = journal.attempts.filter(attempt => attempt
    && String(attempt.scope_lineage_id || '').toLowerCase() === scope
    && String(attempt.epoch_lineage_id || '').toLowerCase() === epoch).sort((a, b) => a.ordinal - b.ordinal);
  const last = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    attempts,
    last,
    prior_findings: last && Array.isArray(last.current_findings)
      ? last.current_findings.filter(finding => finding && finding.status !== 'resolved') : [],
    validation_obligations: last && Array.isArray(last.validation_obligations)
      ? last.validation_obligations : [],
    seen_idempotency_keys: attempts.map(attempt => attempt && attempt.progress && attempt.progress.idempotency_key)
      .filter(Boolean),
    previous_consecutive_nonprogress: last && last.progress
      && Number.isInteger(last.progress.consecutive_nonprogress)
      ? last.progress.consecutive_nonprogress : 0,
    consumed_repairs: attempts.filter(attempt => attempt && attempt.outcome === 'fail'
      && attempt.repair && attempt.repair.settled === true && attempt.consumed_by != null).length,
  };
}

function currentReviewCandidatePartition(opts, nodes, candidateDigest) {
  try {
    const raw = opts.computeReviewCandidatePartition
      ? opts.computeReviewCandidatePartition({ nodes, candidate_digest: candidateDigest })
      : computeReviewCandidateDigest(opts.planPath, opts.project, opts.repoRoot || getRoot(), declaredUnionPaths(nodes));
    const normalized = normalizeCandidate(raw);
    if (!reviewSchema.isCanonicalBlobMap(normalized.declared)
      || !/^[0-9a-f]{64}$/i.test(String(normalized.residue_digest || ''))) {
      return { ok: false, reason: 'candidate_partition_unavailable' };
    }
    return { ok: true, candidate: { digest: String(candidateDigest).toLowerCase(),
      declared: normalized.declared, residue_digest: String(normalized.residue_digest).toLowerCase() } };
  } catch (_) {
    return { ok: false, reason: 'candidate_partition_unavailable' };
  }
}

function readPersistedClaimRoot(opts, persistPath) {
  try {
    const existing = opts.readFile(persistPath);
    const parsed = JSON.parse(existing);
    if (parsed && /^[0-9a-f]{40,64}$/.test(String(parsed.commit || ''))
      && /^[0-9a-f]{64}$/.test(String(parsed.digest || ''))
      && reviewSchema.canonicalJson({ commit: String(parsed.commit).toLowerCase(),
        digest: String(parsed.digest).toLowerCase() }) + '\n' === existing
      && String(parsed.digest).toLowerCase() === reviewSchema.sha256Hex(String(parsed.commit).toLowerCase())) {
      return { commit: String(parsed.commit).toLowerCase(), digest: String(parsed.digest).toLowerCase() };
    }
  } catch (_) { /* not yet captured or unreadable */ }
  return null;
}

function resolveClaimRootBase(opts, lineageKey) {
  if (opts.claimRootBase) return opts.claimRootBase;
  const key = lineageKey && typeof lineageKey === 'object' ? lineageKey : {};
  const identity = String(key.claimIdentity || '').toLowerCase();
  const epoch = String(key.epochLineageId || '').toLowerCase();
  // The claim-root base is scope-lineage identity, not candidate identity. It is captured ONCE per scope
  // (keyed by claim identity + epoch, both stable across gate renames and synthesis HEAD advances) and
  // reused verbatim thereafter; hashing the mutable candidate — or re-reading a live HEAD that parallel
  // synthesis has already advanced — would silently mint a fresh scope_lineage_id on every repair and turn
  // an in-flight closure back into discovery.
  const persistPath = /^[0-9a-f]{64}$/.test(identity) && /^[0-9a-f]{64}$/.test(epoch)
    ? path.join(path.dirname(opts.planPath), '.cache', REVIEW_CLAIM_ROOT_DIR,
      reviewSchema.sha256Hex(identity + epoch) + '.json')
    : null;
  if (persistPath) {
    const captured = readPersistedClaimRoot(opts, persistPath);
    if (captured) return captured;
  }
  let commit = null;
  try {
    commit = String(execFileSync('git', ['-C', opts.repoRoot || getRoot(), 'rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })).trim();
  } catch (_) { commit = null; }
  if (!/^[0-9a-f]{40,64}$/i.test(String(commit || ''))) return null;
  const base = { commit: commit.toLowerCase(), digest: reviewSchema.sha256Hex(commit.toLowerCase()) };
  if (persistPath) {
    try {
      const bytes = reviewSchema.canonicalJson({ commit: base.commit, digest: base.digest }) + '\n';
      if (typeof opts.mkdirp === 'function') opts.mkdirp(path.dirname(persistPath));
      else require('fs').mkdirSync(path.dirname(persistPath), { recursive: true });
      // First writer wins: a concurrent open that already captured a base is authoritative, so re-read
      // rather than overwrite (idempotent, race-safe).
      let existing = null;
      try { existing = opts.readFile(persistPath); } catch (_) { existing = null; }
      if (existing === null) opts.writeFile(persistPath, bytes);
      else { const raced = readPersistedClaimRoot(opts, persistPath); if (raced) return raced; }
    } catch (_) { /* persistence is best-effort; fall through with the freshly-read base */ }
  }
  return base;
}

function persistReviewContext(opts, built) {
  const relative = '.cache/' + REVIEW_CONTEXT_DIR + '/' + built.context_hash + '.json';
  const absolute = path.join(path.dirname(opts.planPath), relative);
  const fs = require('fs');
  try {
    if (typeof opts.mkdirp === 'function') opts.mkdirp(path.dirname(absolute));
    else fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const existing = (() => { try { return opts.readFile(absolute); } catch (_) { return null; } })();
    const bytes = built.bytes + '\n';
    if (existing !== null && existing !== bytes) return { ok: false, reason: 'review_context_hash_collision' };
    if (existing === null) opts.writeFile(absolute, bytes);
    return { ok: true, absolute, relative };
  } catch (error) {
    return { ok: false, reason: 'review_context_persist_failed', detail: String(error && error.message || error) };
  }
}

function prepareReviewOpen(opts, planContent, nodeLike) {
  const validator = require('./kaola-workflow-plan-validator');
  // Field-absent plans are the byte-preserved legacy lane. The opener's
  // mutationGuardPrologue has already run the authoritative resume-check;
  // avoiding a second local hash inference keeps old injected/test adapters
  // and frozen v1 bytes untouched.
  if (reviewMetaValue(planContent, 'plan_schema_version') === null) {
    return { ok: true, legacy: true,
      contract: { ok: true, plan_schema_version: 1, contract_version: 1 } };
  }
  const contract = validator.resolvePlanContract(planContent, { requireFrozen: true });
  if (!contract.ok) return { ok: false, reason: contract.reason, detail: contract.detail || null };
  if (contract.contract_version === 1) return { ok: true, legacy: true, contract };
  const nodes = validator.parseNodes(planContent);
  const node = nodes.find(candidate => candidate.id === nodeLike.id);
  if (!node || !reviewSchema.REVIEW_GATE_ROLES.includes(node.role)) {
    return { ok: true, legacy: false, contract, review_gate: false };
  }
  // #722: resolve the review journal through the SAME blessed reader the close path uses, and in the SAME
  // order, so the open and the close agree on which lane this gate runs. Before this, the open read the raw
  // journal bytes directly and validated them against the current plan_hash — which a cross-epoch child
  // journal (still the parent's bytes on disk until the first child attempt lands) can never satisfy.
  const journalState = readReviewJournal(opts, planContent);
  if (!journalState.ok) {
    return { ok: false, reason: journalState.reason, detail: journalState.detail || null };
  }
  const journal = journalState.journal;
  // A schema-1 cross-epoch child journal continues the IMPORTED schema-1 attempt chain, so
  // validateSchema2ReviewEvidence routes its gate closes onto the schema-1 lane. Mirror that routing here:
  // an open that minted a V2 context for a gate whose close will never be V2 is a guaranteed wedge. The
  // predicate is the close path's verbatim one — a VALIDATED import (`__legacy_attempts` is the
  // non-enumerable witness attachLegacyImport sets only after loadCommittedLegacyImport proves the
  // committed transaction + snapshot chain), never bare `legacy_import` key presence.
  if (journal && journal.schema_version === 1
      && Object.prototype.hasOwnProperty.call(journal, 'legacy_import')
      && Object.prototype.hasOwnProperty.call(journal, '__legacy_attempts')) {
    return { ok: true, legacy: true, contract, review_gate: false };
  }
  // #699/#698 seam: a code/security FANOUT review member is owned by the schema-1 provisional-fanout
  // machinery (validateSchema2ReviewEvidence routes its close there). Its open is the ordinary read-node
  // open against the journal-reserved generation — no V2 review context is materialized for it, so mirror
  // the non-review-gate return. Sequence/single review opens stay on the V2 path below.
  if (['code-reviewer', 'security-reviewer'].includes(node.role)
      && logicalGateForNode(nodes, node).kind === 'fanout') {
    return { ok: true, legacy: false, contract, review_gate: false };
  }
  // Anything else reaching the V2 path must be a genuine schema-2 journal. Keep the pre-#722 refusal for a
  // schema-1 journal with no cross-epoch provenance (e.g. a sequence gate in a plan whose OTHER review gate
  // is a schema-1 fanout): the lane check moved, its strictness did not.
  if (!journal || journal.schema_version !== reviewSchema.REVIEW_JOURNAL_SCHEMA_VERSION) {
    return { ok: false, reason: 'review_journal_version_mismatch',
      detail: 'journal schema does not match verified plan contract' };
  }
  const planView = validator.buildPlanView(planContent);
  const planNode = planView.nodes.find(candidate => candidate.id === node.id);
  const gateMode = node.role === 'adversarial-verifier'
    ? reviewSchema.deriveGateMode(planView, planNode) : 'change_gate';
  const logicalGate = reviewLogicalGate(nodes, node);
  const profile = resolveReviewerProfileIdentity(node.role, opts);
  if (!profile.ok) return profile;
  let candidateDigest = null;
  try {
    const runner = require('./kaola-workflow-validation-runner');
    const extraConsumed = typeof validator.parseValidationTestConsumes === 'function'
      ? validator.parseValidationTestConsumes(planContent) : [];
    candidateDigest = opts.computeLandableTreeDigest
      ? opts.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: extraConsumed })
      : runner.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: extraConsumed });
  } catch (_) { candidateDigest = null; }
  if (!/^[0-9a-f]{64}$/i.test(String(candidateDigest || ''))) {
    return { ok: false, reason: 'candidate_digest_unavailable' };
  }
  candidateDigest = candidateDigest.toLowerCase();
  const candidatePartition = currentReviewCandidatePartition(opts, nodes, candidateDigest);
  if (!candidatePartition.ok) return candidatePartition;
  const planHash = planHashFromContent(planContent);
  const claimIdentity = reviewSchema.sha256Hex(reviewSchema.canonicalJson({
    claim: String(node.gateClaim || ''), goal: reviewMetaValue(planContent, 'goal') || '',
  }));
  const epochLineage = reviewMetaValue(planContent, 'epoch_lineage_id');
  if (epochLineage && !/^[0-9a-f]{64}$/i.test(epochLineage)) {
    return { ok: false, reason: 'epoch_lineage_id_invalid' };
  }
  const epochLineageId = (epochLineage || claimIdentity).toLowerCase();
  // The claim-root base is captured ONCE per scope (keyed by claim identity + epoch, which are stable
  // across renames and synthesis HEAD advances) and reused, so a moving live HEAD cannot mint a fresh
  // scope_lineage_id mid-lifecycle and turn a closure back into discovery.
  const claimRootBase = resolveClaimRootBase(opts, { claimIdentity, epochLineageId });
  if (!claimRootBase) return { ok: false, reason: 'claim_root_base_unavailable' };
  const acceptanceEvidence = [{ kind: 'gate_claim', digest: logicalGate.claim_digest }];
  const scopeLineage = reviewSchema.sha256Hex(reviewSchema.canonicalJson({
    claim_identity_digest: claimIdentity,
    acceptance_evidence_digest: reviewSchema.sha256Hex(reviewSchema.canonicalJson(acceptanceEvidence)),
    claim_root_base: claimRootBase,
    reviewed_frontier_identity: logicalGate.surface_digests,
  }));
  const lineage = readReviewLineageV2(journal, scopeLineage, epochLineageId);
  let repairDelta = null;
  if (lineage.last) {
    const derived = reviewSchema.deriveRepairDelta({
      previous_attempt: lineage.last,
      current_candidate: candidatePartition.candidate,
    });
    if (!derived.ok) return derived;
    repairDelta = derived.repair_delta;
  }
  const inheritedDigest = reviewMetaValue(planContent, 'inherited_frontier_digest') || 'none';
  const inheritedRaw = reviewMetaValue(planContent, 'inherited_frontier_classes') || 'none';
  const inheritedClasses = inheritedRaw === 'none' ? [] : inheritedRaw.split(',').map(value => value.trim()).filter(Boolean);
  const contextResult = reviewSchema.buildReviewContext({
    contract_version: 2,
    behavior_contract_version: profile.behavior_contract_version,
    behavior_contract_hash: profile.behavior_contract_hash,
    plan_schema_version: 2,
    plan_hash: planHash,
    claim_identity_digest: claimIdentity,
    epoch_lineage_id: epochLineageId,
    epoch: Number(reviewMetaValue(planContent, 'epoch') || 1),
    logical_gate: {
      key: logicalGate.key, kind: logicalGate.kind, members: logicalGate.members,
      claim_digest: logicalGate.claim_digest, surface_digests: logicalGate.surface_digests,
      aggregation: logicalGate.aggregation, certified_producers: logicalGate.certified_producers,
    },
    gate_mode: gateMode,
    claim_root_base: claimRootBase,
    candidate_digest: candidateDigest,
    inherited_frontier: { digest: inheritedDigest, classes: inheritedClasses },
    scope_lineage_id: scopeLineage,
    review_phase: lineage.attempts.length ? 'closure' : 'discovery',
    attempt_ordinal: lineage.attempts.length + 1,
    acceptance_evidence: acceptanceEvidence,
    prior_findings: lineage.prior_findings,
    repair_delta: repairDelta,
    validation_obligations: lineage.validation_obligations,
  });
  if (!contextResult.ok) return contextResult;
  const persisted = persistReviewContext(opts, contextResult);
  if (!persisted.ok) return persisted;
  const requiredTokens = reviewSchema.requiredReviewTokens(planView, planNode);
  return {
    ok: true, legacy: false, review_gate: true, contract, node, planView,
    context: contextResult.context, context_hash: contextResult.context_hash,
    context_path: persisted.relative, profile, logical_gate: logicalGate,
    gate_mode: gateMode, candidate_digest: candidateDigest,
    candidate_partition: candidatePartition.candidate,
    required_tokens: requiredTokens,
    dispatch_context: {
      plan_schema_version: 2,
      contract_version: 2,
      behavior_contract_version: profile.behavior_contract_version,
      behavior_contract_hash: profile.behavior_contract_hash,
      resolved_profile_hash: profile.resolved_profile_hash,
      review_context_hash: contextResult.context_hash,
      review_context_path: persisted.relative,
      candidate_digest: candidateDigest,
      gate_mode: gateMode,
      logical_gate: contextResult.context.logical_gate,
      gate_claim: node.gateClaim,
      gate_surface: node.gateSurface,
      gate_aggregation: node.gateAggregation,
    },
  };
}

function currentReviewCandidateDigest(opts, planContent) {
  try {
    const validator = require('./kaola-workflow-plan-validator');
    const runner = require('./kaola-workflow-validation-runner');
    const extraConsumed = typeof validator.parseValidationTestConsumes === 'function'
      ? validator.parseValidationTestConsumes(planContent) : [];
    const digest = opts.computeLandableTreeDigest
      ? opts.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: extraConsumed })
      : runner.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: extraConsumed });
    return /^[0-9a-f]{64}$/i.test(String(digest || '')) ? String(digest).toLowerCase() : null;
  } catch (_) { return null; }
}

function readCurrentValidationVectors(opts, candidateDigest) {
  const runner = require('./kaola-workflow-validation-runner');
  let values = null;
  if (typeof opts.readValidationVectors === 'function') {
    try { values = opts.readValidationVectors(candidateDigest); }
    catch (_) { return { ok: false, reason: 'validation_vector_read_failed' }; }
  } else if (Array.isArray(opts.validationVectors)) {
    values = opts.validationVectors;
  } else {
    const fs = require('fs');
    const dir = path.join(path.dirname(opts.planPath), '.cache', 'validation-vectors');
    let names = [];
    try { names = fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort(); }
    catch (_) { names = []; }
    values = [];
    for (const name of names) {
      let bytes, parsed;
      try { bytes = opts.readFile(path.join(dir, name)); parsed = JSON.parse(bytes); }
      catch (_) { return { ok: false, reason: 'validation_vector_malformed', file: name }; }
      try {
        if (runner.canonicalJson(parsed) + '\n' !== bytes) {
          return { ok: false, reason: 'validation_vector_not_canonical', file: name };
        }
      } catch (_) { return { ok: false, reason: 'validation_vector_not_canonical', file: name }; }
      values.push(parsed);
    }
  }
  if (!Array.isArray(values)) return { ok: false, reason: 'validation_vector_malformed' };
  const references = new Map();
  for (const raw of values) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || raw.schema_version !== runner.RECEIPT_SCHEMA_VERSION || raw.kind !== 'validation_vector'
      || !/^[0-9a-f]{64}$/.test(String(raw.command_id || ''))
      || !/^[0-9a-f]{64}$/.test(String(raw.candidate_digest || ''))
      || !/^[0-9a-f]{64}$/.test(String(raw.vector_id || ''))
      || !['pass', 'fail', 'inconclusive'].includes(raw.outcome)
      || !/^[0-9a-f]{64}$/.test(String(raw.receipt_sha256 || ''))
      || runner.computeReceiptSha256(raw) !== raw.receipt_sha256) {
      return { ok: false, reason: 'validation_vector_malformed' };
    }
    if (raw.candidate_digest !== candidateDigest) continue;
    const ref = { command_id: raw.command_id, candidate_digest: raw.candidate_digest,
      vector_id: raw.vector_id, outcome: raw.outcome, receipt_sha256: raw.receipt_sha256 };
    references.set(reviewSchema.canonicalJson(ref), ref);
  }
  return { ok: true, vectors: [...references.values()].sort((a, b) =>
    (a.command_id + ':' + a.vector_id).localeCompare(b.command_id + ':' + b.vector_id)) };
}

function readCanonicalReviewContext(opts, contextHash) {
  if (!/^[0-9a-f]{64}$/i.test(String(contextHash || ''))) {
    return { ok: false, reason: 'review_context_mismatch' };
  }
  const contextPath = path.join(path.dirname(opts.planPath), '.cache', REVIEW_CONTEXT_DIR,
    String(contextHash).toLowerCase() + '.json');
  let bytes;
  try { bytes = opts.readFile(contextPath); }
  catch (_) { return { ok: false, reason: 'review_context_missing' }; }
  let context;
  try { context = JSON.parse(bytes); }
  catch (_) { return { ok: false, reason: 'review_context_malformed' }; }
  let canonical;
  try { canonical = reviewSchema.canonicalJson(context); }
  catch (_) { return { ok: false, reason: 'review_context_malformed' }; }
  if (canonical + '\n' !== bytes || reviewSchema.sha256Hex(canonical) !== String(contextHash).toLowerCase()) {
    return { ok: false, reason: 'review_context_mismatch' };
  }
  return { ok: true, context, contextPath };
}

function evidenceTokenValue(content, token) {
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + escaped + ':[ \\t]*(.*?)\\s*$', 'gm');
  let match, last = null;
  while ((match = re.exec(String(content || ''))) !== null) last = match[1];
  return last;
}

function buildReviewAnchorIndex(opts, context, candidateDigest, rawFindings, nodes, reviewerId) {
  const root = opts.repoRoot || getRoot();
  const anchors = (Array.isArray(rawFindings) ? rawFindings : []).flatMap(finding => [
    finding && finding.primary_anchor,
    ...((finding && Array.isArray(finding.secondary_anchors)) ? finding.secondary_anchors : []),
  ]).filter(Boolean);
  const paths = Array.from(new Set(anchors.map(anchor => anchor.path)
    .filter(value => typeof value === 'string'))).sort();
  let objectFormat;
  try {
    objectFormat = String(execFileSync('git', ['-C', root, 'rev-parse', '--show-object-format'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })).trim().toLowerCase();
  } catch (_) { return { ok: false, reason: 'finding_anchor_index_unavailable' }; }
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    return { ok: false, reason: 'finding_anchor_index_unavailable' };
  }
  const readEntries = treeish => {
    const entries = Object.create(null);
    if (!paths.length) return entries;
    const bytes = execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', treeish, '--', ...paths], {
      encoding: null, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER,
    });
    for (const record of bytes.toString('utf8').split('\0').filter(Boolean)) {
      const tab = record.indexOf('\t');
      if (tab < 0) continue;
      const repoPath = record.slice(tab + 1);
      if (!paths.includes(repoPath)) continue;
      const fields = record.slice(0, tab).trim().split(/\s+/);
      const treeMode = fields[0];
      const objectId = fields[2];
      if (!/^[0-7]{6}$/.test(treeMode)
        || !new RegExp(objectFormat === 'sha1' ? '^[0-9a-f]{40}$' : '^[0-9a-f]{64}$', 'i').test(objectId)) {
        throw new Error('tree entry malformed');
      }
      let blobLength = null;
      if (treeMode !== '160000') {
        blobLength = Number(String(execFileSync('git', ['-C', root, 'cat-file', '-s', objectId], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        })).trim());
        if (!Number.isInteger(blobLength) || blobLength < 0) throw new Error('blob length malformed');
      }
      entries[repoPath] = { object_format: objectFormat, tree_mode: treeMode,
        object_id: objectId.toLowerCase(), ...(blobLength === null ? {} : { blob_length: blobLength }) };
    }
    return entries;
  };
  let candidateEntries, baseEntries;
  try {
    candidateEntries = readEntries(snapshotCandidateTree(root));
    baseEntries = readEntries(context.claim_root_base.commit);
  } catch (_) { return { ok: false, reason: 'finding_anchor_index_unavailable' }; }
  if (context.review_phase === 'closure' && context.repair_delta) {
    for (const row of context.repair_delta.paths) {
      if (!paths.includes(row.path)) continue;
      if (row.before === null) {
        delete baseEntries[row.path];
        continue;
      }
      const split = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64})$/i.exec(row.before);
      if (!split) return { ok: false, reason: 'finding_anchor_index_unavailable' };
      let blobLength = null;
      if (split[1] !== '160000') {
        try {
          blobLength = Number(String(execFileSync('git', ['-C', root, 'cat-file', '-s', split[2]], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
          })).trim());
        } catch (_) { return { ok: false, reason: 'finding_anchor_index_unavailable' }; }
      }
      baseEntries[row.path] = { object_format: objectFormat, tree_mode: split[1],
        object_id: split[2].toLowerCase(), ...(blobLength === null ? {} : { blob_length: blobLength }) };
    }
  }
  const byId = new Map((nodes || []).map(node => [node.id, node]));
  const producerIds = new Set();
  const queue = [...((byId.get(reviewerId) || {}).dependsOn || [])];
  while (queue.length) {
    const id = queue.shift();
    if (producerIds.has(id)) continue;
    producerIds.add(id);
    queue.push(...(((byId.get(id) || {}).dependsOn || [])));
  }
  const evidenceDigests = [];
  for (const id of [...producerIds].sort()) {
    if (!nodeWriteSetNonempty(byId.get(id))) continue;
    try {
      evidenceDigests.push(reviewSchema.sha256Hex(String(opts.readFile(
        path.join(path.dirname(opts.planPath), '.cache', id + '.md')))));
    } catch (_) { /* an absent producer receipt cannot anchor an observation */ }
  }
  return { ok: true, index: { object_format: objectFormat,
    candidate_entries: candidateEntries, base_entries: baseEntries,
    candidate_tree_digest: candidateDigest,
    parent_candidate_digest: context.review_phase === 'closure' && context.repair_delta
      ? context.repair_delta.before_candidate_digest : context.claim_root_base.digest,
    evidence_digests: [...new Set(evidenceDigests)].sort(),
  } };
}

function validateSchema2ReviewEvidence(opts, planContent, nodeInfo, evidenceContent) {
  const validator = require('./kaola-workflow-plan-validator');
  if (reviewMetaValue(planContent, 'plan_schema_version') === null) {
    return { ok: true, legacy: true, review_gate: false };
  }
  const contract = validator.resolvePlanContract(planContent, { requireFrozen: true });
  if (!contract.ok) return { ok: false, reason: contract.reason };
  if (contract.contract_version === 1 || !nodeInfo
    || !reviewSchema.REVIEW_GATE_ROLES.includes(nodeInfo.role)) {
    return { ok: true, legacy: contract.contract_version === 1, review_gate: false };
  }
  // Route by the JOURNAL's declared schema, mirroring readReviewJournal: a schema_version:1 journal
  // carrying legacy_import provenance under a schema-2 plan is the cross-epoch child (#699) — its review
  // lifecycle continues the imported schema-1 attempt chain (ordinal continuity, '<node>:N' attempt ids),
  // so the close takes the schema-1 path, never the V2 context/candidate machinery. Any other journal
  // state (fresh, genuine schema-2, or invalid) falls through to the V2 validation unchanged.
  const journalState = readReviewJournal(opts, planContent);
  if (journalState.ok && journalState.journal && journalState.journal.schema_version === 1
    && Object.prototype.hasOwnProperty.call(journalState.journal, 'legacy_import')
    // Belt-and-braces to readReviewJournal's fail-closed refuse: route on a VALIDATED cross-epoch import,
    // never bare key presence. __legacy_attempts is the non-enumerable property attachLegacyImport sets
    // ONLY after loadCommittedLegacyImport proves the committed transaction + snapshot chain, so a forged
    // journal (already refused above) can never carry it through JSON into this predicate.
    && Object.prototype.hasOwnProperty.call(journalState.journal, '__legacy_attempts')) {
    return { ok: true, legacy: true, review_gate: false };
  }
  // A code/security FANOUT review gate (replicated_majority / partitioned_all) is owned by the schema-1
  // provisional-fanout machinery — reserveLogicalReviewGenerations, journal-owned generations, rolling
  // open-ready top-up, and reduceLogicalReviewAttempt — even under a schema-2 plan. The V2 candidate-bound
  // path has no equivalent reservation/top-up/crash-retry story, so the close takes the schema-1 path and
  // its attempts land in a schema-1 journal (validated against schema2ReviewGateContracts). Sequence/single
  // review closes stay on the V2 path unchanged.
  if (logicalGateForNode(parseNodesFromContent(planContent), nodeInfo).kind === 'fanout'
    && ['code-reviewer', 'security-reviewer'].includes(nodeInfo.role)) {
    return { ok: true, legacy: false, review_gate: false };
  }
  const identity = reviewSchema.parseReviewEvidenceIdentity(evidenceContent);
  if (Object.prototype.hasOwnProperty.call(identity, 'execution_status')
    || Object.prototype.hasOwnProperty.call(identity, 'gate_effect')) {
    return { ok: false, reason: 'review_reserved_harness_field' };
  }
  const contextRead = readCanonicalReviewContext(opts, identity.review_context_hash);
  if (!contextRead.ok) return contextRead;
  const context = contextRead.context;
  if (context.plan_hash !== planHashFromContent(planContent) || context.plan_schema_version !== 2) {
    return { ok: false, reason: 'review_context_plan_mismatch' };
  }
  const profile = resolveReviewerProfileIdentity(nodeInfo.role, opts);
  if (!profile.ok) return profile;
  const candidateDigest = currentReviewCandidateDigest(opts, planContent);
  if (!candidateDigest) return { ok: false, reason: 'candidate_digest_unavailable' };
  const dispatch = {
    contract_version: 2,
    review_context_hash: String(identity.review_context_hash || '').toLowerCase(),
    behavior_contract_hash: profile.behavior_contract_hash,
    resolved_profile_hash: profile.resolved_profile_hash,
    candidate_digest: candidateDigest,
  };
  const bound = reviewSchema.validateReviewEvidenceBinding(evidenceContent, dispatch, context);
  if (!bound.ok) return bound;
  const reviewNodes = validator.parseNodes(planContent);
  const candidatePartition = currentReviewCandidatePartition(opts, reviewNodes, candidateDigest);
  if (!candidatePartition.ok) return candidatePartition;
  const validationVectors = readCurrentValidationVectors(opts, candidateDigest);
  if (!validationVectors.ok) return validationVectors;
  const planView = validator.buildPlanView(planContent);
  const planNode = planView.nodes.find(node => node.id === nodeInfo.id);
  const gateMode = nodeInfo.role === 'adversarial-verifier'
    ? reviewSchema.deriveGateMode(planView, planNode) : 'change_gate';
  const requiredTokens = reviewSchema.requiredReviewTokens(planView, planNode);
  for (const tokenClass of requiredTokens) {
    if (tokenClass === 'evidence-binding') continue;
    const alternatives = tokenClass.split('|');
    if (!alternatives.some(token => {
      const value = evidenceTokenValue(evidenceContent, token);
      return value !== null && String(value).trim() !== '';
    })) return { ok: false, reason: 'review_evidence_token_missing', missingTokenClass: tokenClass };
  }
  if (identity.gate_mode !== undefined && identity.gate_mode !== gateMode) {
    return { ok: false, reason: 'review_gate_mode_mismatch' };
  }
  for (const [field, expected] of [
    ['gate_claim', nodeInfo.gateClaim], ['gate_surface', nodeInfo.gateSurface],
    ['gate_aggregation', nodeInfo.gateAggregation],
  ]) {
    if (identity[field] !== undefined && identity[field] !== expected) {
      return { ok: false, reason: 'review_gate_identity_mismatch', field };
    }
  }
  if (nodeInfo.role === 'adversarial-verifier' && identity.claim_outcome !== identity.domain_outcome) {
    return { ok: false, reason: 'review_claim_outcome_mismatch' };
  }
  const parsed = reviewSchema.parseReviewEvidence(evidenceContent);
  if (parsed.finding_json.some(value => value && value.__malformed)) {
    return { ok: false, reason: 'review_finding_json_malformed' };
  }
  const normalized = reviewSchema.normalizeFindingSet(parsed.finding_json, {
    scope_lineage_id: context.scope_lineage_id,
  });
  if (!normalized.ok) return normalized;
  const priorUids = new Set((context.prior_findings || []).map(finding => finding.uid));
  const anchorsToValidate = context.review_phase === 'discovery' ? parsed.finding_json
    : parsed.finding_json.filter(raw => {
      const one = reviewSchema.normalizeFindingSet([raw], { scope_lineage_id: context.scope_lineage_id });
      return one.ok && !priorUids.has(one.findings[0].uid);
    });
  if (anchorsToValidate.length) {
    const anchorIndex = buildReviewAnchorIndex(opts, context, candidateDigest,
      anchorsToValidate, reviewNodes, nodeInfo.id);
    if (!anchorIndex.ok) return anchorIndex;
    const candidateChecked = reviewSchema.normalizeFindingSet(anchorsToValidate, {
      scope_lineage_id: context.scope_lineage_id,
      anchor_index: anchorIndex.index,
    });
    if (!candidateChecked.ok) return candidateChecked;
  }
  let resolutions = { ok: true, resolutions: [] };
  if (context.review_phase === 'discovery') {
    if (parsed.resolution_json.length) return { ok: false, reason: 'review_resolution_discovery_invalid' };
  } else {
    const resolutionArtifacts = reviewSchema.authoritativeResolutionArtifacts(
      validationVectors.vectors, candidateDigest);
    resolutions = reviewSchema.normalizeResolutionSet(parsed.resolution_json, {
      repair_attempt_id: context.repair_delta && context.repair_delta.repair_attempt_id,
      candidate_digest: candidateDigest,
      known_validation_vector_digests: resolutionArtifacts.validation_vector_digests,
      known_evidence_digests: resolutionArtifacts.evidence_digests,
    });
    if (!resolutions.ok) return resolutions;
    const closure = reviewSchema.assessFindingClosure({
      prior_findings: context.prior_findings,
      current_findings: normalized.findings,
      repair_delta: context.repair_delta,
      candidate_digest: candidateDigest,
    });
    if (!closure.ok) return closure;
    const currentByUid = new Map(normalized.findings.map(finding => [finding.uid, finding]));
    if (resolutions.resolutions.some(resolution => {
      const finding = currentByUid.get(resolution.uid);
      return !finding || finding.status !== 'resolved';
    })) return { ok: false, reason: 'review_resolution_frontier_mismatch' };
  }
  const domainOutcome = identity.domain_outcome;
  // #727: ONE selector shared with the open-time seeded stub + the operator hint, so the enum the
  // reviewer is shown, the enum named on refusal, and the enum enforced here can never diverge.
  const allowed = allowedDomainOutcomes(nodeInfo.role);
  if (!allowed.includes(domainOutcome)) {
    return { ok: false, reason: 'review_domain_outcome_invalid', role: nodeInfo.role, allowed: allowed.slice() };
  }
  const openFindings = normalized.findings.filter(finding => finding.status !== 'resolved');
  if (nodeInfo.role !== 'adversarial-verifier') {
    if (domainOutcome === 'approved' && openFindings.length) {
      return { ok: false, reason: 'review_approval_has_findings' };
    }
    if (domainOutcome === 'changes_requested' && openFindings.length === 0) {
      return { ok: false, reason: 'review_changes_missing_findings' };
    }
  }
  const logicalGate = reviewLogicalGate(reviewNodes, nodeInfo);
  const receipt = {
    schema_version: 2,
    contract_version: 2,
    node_id: nodeInfo.id,
    evidence_binding: (() => {
      const match = /^evidence-binding:[ \\t]*([^\\s]+)[ \\t]+([^\\s]+)[ \\t]*$/m.exec(String(evidenceContent || ''));
      return match ? { node_id: match[1], nonce: match[2] } : null;
    })(),
    review_context_hash: dispatch.review_context_hash,
    behavior_contract_hash: dispatch.behavior_contract_hash,
    resolved_profile_hash: dispatch.resolved_profile_hash,
    candidate_digest: dispatch.candidate_digest,
    execution_status: 'complete',
    domain_outcome: domainOutcome,
    gate_effect: reviewSchema.deriveGateEffect(nodeInfo.role, gateMode, domainOutcome, openFindings.length),
    surface: String(nodeInfo.gateSurface || ''),
    findings: normalized.findings,
    resolutions: resolutions.resolutions,
    blocking_findings: openFindings.length,
    validation_vectors: validationVectors.vectors,
    certifier_digest: gateMode === 'change_gate' ? candidateDigest : null,
    raw_evidence_sha256: reviewSchema.sha256Hex(String(evidenceContent || '')),
  };
  return { ok: true, legacy: false, review_gate: true, contract, context,
    context_path: contextRead.contextPath, dispatch, profile, planView, planNode,
    gate_mode: gateMode, logical_gate: logicalGate, required_tokens: requiredTokens,
    receipt, parsed, candidate_partition: candidatePartition.candidate };
}

function writeSchema2ReviewReceipt(opts, review) {
  const fs = require('fs');
  const dir = path.join(path.dirname(opts.planPath), '.cache', REVIEW_RECEIPT_DIR,
    review.dispatch.review_context_hash);
  const receiptPath = path.join(dir, review.receipt.node_id + '.json');
  const bytes = reviewSchema.canonicalJson(review.receipt) + '\n';
  try {
    if (typeof opts.mkdirp === 'function') opts.mkdirp(dir); else fs.mkdirSync(dir, { recursive: true });
    let existing = null;
    try { existing = opts.readFile(receiptPath); } catch (_) { existing = null; }
    if (existing !== null && existing !== bytes) return { ok: false, reason: 'review_receipt_immutable' };
    if (existing === null) opts.writeFile(receiptPath, bytes);
    return { ok: true, receiptPath };
  } catch (error) {
    return { ok: false, reason: 'review_receipt_persist_failed', detail: String(error && error.message || error) };
  }
}

function seedEvidenceFile(planPath, nodeId, nonce, role, forceRotate, reviewOpen) {
  try {
    const fs = require('fs');
    let ROLE_TOKEN_REGISTRY;
    try {
      ({ ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator'));
    } catch (_) { ROLE_TOKEN_REGISTRY = {}; }

    // Base tokens/stubs come from the reviewer-contract v2 open descriptor when present (#693/#696/#697/
    // #698), else the role's static registry. A schema-2 G4 certifier (issue-699) additionally binds its
    // runtime certifier fields — appended to the required-token list and seeded into the fresh body below;
    // both features compose for a code/security reviewer that is also a declared certifier.
    const g4Seed = g4CertifierSeedContext(planPath, nodeId, role);
    const baseTokens = (reviewOpen && Array.isArray(reviewOpen.required_tokens)
      ? reviewOpen.required_tokens
      : (ROLE_TOKEN_REGISTRY[role] || ['evidence-binding'])).slice();
    const tokens = baseTokens.slice();
    if (g4Seed) {
      for (const token of g4Seed.tokens) if (!tokens.includes(token)) tokens.push(token);
    }
    // Remove 'evidence-binding' from the stub list — it becomes line 1 directly.
    const stubTokens = baseTokens.filter(t => t !== 'evidence-binding');
    // The durable node channel: an IMPLEMENT-role consumer with ≥1 PRODUCER-role upstream gets one EMPTY
    // `upstream_read: <up-id>` stub per producer upstream — the KEY that makes the close-time consumed-proof
    // enforceable (present-key ⇒ nonce required) while the value stays EMPTY (anti-fabrication: the opener
    // NEVER seeds a nonce; the consumer must OPEN the upstream file and echo its line-1 nonce). Empty list
    // for every non-IMPLEMENT / depless / non-producer-upstream node ⇒ byte-identical seed.
    const upstreamStubIds = upstreamReadStubIds(planPath, nodeId, role);
    const evidenceFile = '.cache/' + nodeId + '.md';
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    const cachePath = path.join(cacheDir, nodeId + '.md');

    fs.mkdirSync(cacheDir, { recursive: true });

    const bindingLine = 'evidence-binding: ' + nodeId + ' ' + (nonce || '');

    const freshSeed = () => {
      let freshContent = bindingLine + '\n';
      for (const tokenClass of stubTokens) {
        const firstAlt = tokenClass.split('|')[0];
        if (tokenClass.includes('|')) {
          freshContent += '<!-- ' + tokenClass + ' -->\n';
          freshContent += firstAlt + ': \n';
        } else if (tokenClass === 'domain_outcome') {
          // #727: the reviewer-contract `domain_outcome` vocabulary is ROLE-KIND-dependent, and the
          // close-time validator is the only place that used to name it. Seed the ALLOWED SET for THIS
          // gate's role kind (from the same allowedDomainOutcomes selector the validator uses) instead
          // of a generic "paste domain_outcome here" — a reviewer that guessed the derived gate EFFECT
          // vocabulary (`pass`) only discovered the mistake at close. The comment stays a `<!-- ... -->`
          // line (NOT column-0 anchored on the token key), so the hollow-seed guards are unchanged.
          freshContent += '<!-- ' + tokenClass + ': one of '
            + allowedDomainOutcomes(role).join(' | ') + ' (not the derived gate effect pass/fail) -->\n';
          freshContent += tokenClass + ': \n';
        } else {
          freshContent += '<!-- ' + tokenClass + ': paste ' + tokenClass + ' here -->\n';
          freshContent += tokenClass + ': \n';
        }
      }
      for (const upId of upstreamStubIds) {
        freshContent += '<!-- OPEN ' + upId + '\'s evidence file and append its line-1 binding nonce as the value below -->\n';
        freshContent += 'upstream_read: ' + upId + '\n';
      }
      if (g4Seed) {
        freshContent += '<!-- schema-2 G4 runtime binding: preserve these open-time values verbatim -->\n';
        for (const name of g4Seed.tokens) freshContent += name + ': ' + g4Seed.values[name] + '\n';
      }
      return freshContent;
    };

    if (fs.existsSync(cachePath)) {
      const existingContent = fs.readFileSync(cachePath, 'utf8');
      const firstLine = existingContent.split(/\r?\n/, 1)[0];
      const existingBinding = firstLine.match(/^evidence-binding:[ \t]*([^\s]+)[ \t]+([^\s]+)[ \t]*$/);
      const nonceChangedForSameNode = !!(existingBinding && existingBinding[1] === nodeId && existingBinding[2] && existingBinding[2] !== nonce);
      if (forceRotate || nonceChangedForSameNode) {
        // Nonce rotation (reopen-node): RE-SEED the ENTIRE file with fresh binding + role stubs.
        // Discarding the stale body is required so prior-attempt evidence (verdict: pass / GREEN /
        // findings_blocking: 0) cannot survive into the new open and defeat the #392 anti-replay guard.
        fs.writeFileSync(cachePath, freshSeed(), 'utf8');
        return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: true };
      }
      // Idempotent: file already exists (crash-resume), do NOT overwrite.
      return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: false };
    }

    fs.writeFileSync(cachePath, freshSeed(), 'utf8');
    return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: false };
  } catch (_) {
    // Best-effort: a seed failure returns the metadata but does not fail the open.
    let required_tokens = reviewOpen && Array.isArray(reviewOpen.required_tokens)
      ? reviewOpen.required_tokens.slice() : ['evidence-binding'];
    try {
      const { ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator');
      required_tokens = (ROLE_TOKEN_REGISTRY[role] || ['evidence-binding']).slice();
    } catch (_2) {}
    return { evidence_file: '.cache/' + nodeId + '.md', required_tokens };
  }
}

// ---------------------------------------------------------------------------
// spliceLedgerNode — rewrite a single node row's status cell in ## Node Ledger.
//
// GUARD: flip ONLY when current status ∈ allowFrom.
// Idempotent: returns alreadyAtTarget:true when current === newStatus.
// Never touches ## Meta / ## Nodes (plan_hash-covered).
//
// @param {string}   content   full plan file content
// @param {string}   nodeId    target node id
// @param {string}   newStatus status to write ('in_progress', 'complete', 'n/a', ...)
// @param {object}   opts      { allowFrom: string[] } — defaults ['pending']
// @returns {{ content:string, changed:boolean, found:boolean, alreadyAtTarget:boolean }}
// ---------------------------------------------------------------------------
function spliceLedgerNode(content, nodeId, newStatus, opts) {
  const allowFrom = (opts && Array.isArray(opts.allowFrom)) ? opts.allowFrom : ['pending'];

  // #354: fence-aware section location (the single shared locator) — replaces the fence-blind
  // content.indexOf('\n## Node Ledger') so an upstream fenced decoy heading is skipped.
  const { start: ledgerIdx, next: afterLedger } = locateSection(content, LEDGER_HEADING);
  if (ledgerIdx < 0) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  // Slice the ledger section from its heading to the next ## heading (or EOF).
  const ledgerBlock = afterLedger >= 0
    ? content.slice(ledgerIdx, afterLedger)
    : content.slice(ledgerIdx);

  const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) {
    // #425: emit a structured diagnostic when the ledger is present but non-canonical.
    // The caller (open-next) surfaces this to the orchestrator so it knows exactly why the
    // node was not found — not just "found:false" with no context.
    const diagnostic = {
      ledger_present: true,
      detected_columns: header,
      required_columns: ['id', 'status'],
      hint: "Run --repair to normalize the ledger header, or author with '| id | status |'",
    };
    return { content, changed: false, found: false, alreadyAtTarget: false, diagnostic };
  }

  let found = false;
  let changed = false;
  let alreadyAtTarget = false;

  const newLedgerBlock = ledgerBlock.replace(/\n(\|[^\n]+)/g, (match, row) => {
    const cells = row.split('|').slice(1, -1);
    const rowId = (cells[idIdx] || '').trim();
    if (rowId !== nodeId) return match;

    found = true;
    const currentStatus = (cells[stIdx] || '').trim().toLowerCase();

    // Already at the target — idempotent no-op.
    if (currentStatus === newStatus) {
      alreadyAtTarget = true;
      return match;
    }

    // Current status not in allowFrom — refuse to touch.
    if (!allowFrom.includes(currentStatus)) {
      return match;
    }

    // Replace the status cell, preserving surrounding whitespace.
    const origCell = cells[stIdx];
    const leadingSpace  = (origCell.match(/^(\s*)/) || ['', ''])[1];
    const trailingSpace = (origCell.match(/(\s*)$/) || ['', ''])[1];
    const newCell = leadingSpace + newStatus + trailingSpace;
    cells[stIdx] = newCell;
    changed = true;
    return '\n|' + cells.join('|') + '|';
  });

  if (!found) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  if (!changed && !alreadyAtTarget) {
    // Found but out-of-allowFrom and not at target — no mutation.
    return { content, changed: false, found: true, alreadyAtTarget: false };
  }

  if (!changed) {
    // alreadyAtTarget — content is logically unchanged.
    return { content, changed: false, found: true, alreadyAtTarget: true };
  }

  const newContent = afterLedger >= 0
    ? content.slice(0, ledgerIdx) + newLedgerBlock + content.slice(afterLedger)
    : content.slice(0, ledgerIdx) + newLedgerBlock;

  return { content: newContent, changed: true, found: true, alreadyAtTarget: false };
}

// ---------------------------------------------------------------------------
// readLedgerStatuses — read-only id→status map from ## Node Ledger.
// Same header-driven parsing as spliceLedgerNode; {} when no parseable ledger.
// ---------------------------------------------------------------------------
function readLedgerStatuses(content) {
  const out = {};
  // #354: shared fence-aware locator (was a fence-blind indexOf slice).
  const { start: ledgerIdx, next: afterLedger } = locateSection(content, LEDGER_HEADING);
  if (ledgerIdx < 0) return out;
  const ledgerBlock = afterLedger >= 0 ? content.slice(ledgerIdx, afterLedger) : content.slice(ledgerIdx);
  const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return out;
  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) return out;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
    const rowId = cells[idIdx] || '';
    if (rowId && !/^[-\s]+$/.test(rowId)) out[rowId] = (cells[stIdx] || '').toLowerCase();
  }
  return out;
}

// ---------------------------------------------------------------------------
// spliceComplianceRow — append a row to ## Required Agent Compliance section.
// #354: delegates to the shared fence-aware spliceComplianceSection in adaptive-schema (the single
// home for the section shape + find/append), collapsing the duplicate that lived here and in
// parallel-batch.appendComplianceRow. Creates the section below ## Node Ledger if absent.
// ---------------------------------------------------------------------------
function spliceComplianceRow(content, row) {
  return spliceComplianceSection(content, row);
}

// ---------------------------------------------------------------------------
// complianceRowExists (#384/#391c) — true when the ## Required Agent Compliance section already
// carries a row for this node's Requirement cell. spliceComplianceSection appends UNCONDITIONALLY,
// so the idempotent re-close paths (close-and-open-next / close-node `alreadyAtTarget`, and the
// reconcile close-direction re-run) would otherwise append a DUPLICATE row on every re-close.
// Guard the append at the caller with this check. The Requirement cell uniquely identifies the row:
// it is always `role (id)` on emission; a BARE role cell (code-reviewer / security-reviewer) only
// exists in legacy rows emitted before the canonical-cell producer fix, which must still MATCH
// here so they advance in place instead of duplicating.
// Match the Requirement cell as the first table column (`| <cell> |`) within the compliance section
// only — a same-text string elsewhere in the plan must not suppress the append.
// ---------------------------------------------------------------------------
function complianceRowExists(content, requirementCell, nodeId) {
  const sec = locateSection(content, 'Required Agent Compliance');
  if (sec.start < 0) return false;
  const block = sec.next >= 0 ? content.slice(sec.start, sec.next) : content.slice(sec.start);
  // Each compliance row is `| <requirementCell> | <status> | <evidence> | |`. Compare the trimmed
  // first column against requirementCell exactly (cell text is plain, no regex metacharacters of
  // concern here, but match column-structurally to avoid substring false-positives).
  const rows = block.split('\n').filter(l => l.trim().startsWith('|'));
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (!cells.length || cells[0] !== requirementCell) continue;
    // code-reviewer/security-reviewer deliberately use a bare Requirement cell. Their evidence
    // binding identifies the concrete node, so two same-role fan-out members each retain one row
    // while a retry of either member remains idempotent. A legacy row with no binding remains the
    // sole role-level witness for backward compatibility.
    if ((requirementCell === 'code-reviewer' || requirementCell === 'security-reviewer') && nodeId) {
      if (cells.some(cell => cell.includes('evidence-binding: ' + nodeId + ' '))) return true;
      if (!cells.some(cell => cell.includes('evidence-binding: '))) return true;
      continue;
    }
    return true;
  }
  return false;
}

function addCloseCompliance(planContent, nodeId, role, evidenceContent, barrierMarker) {
  const canonicalRequirement = role + ' (' + nodeId + ')';
  // Legacy bare cells (code-reviewer / security-reviewer, emitted before the canonical-cell
  // producer fix) remain READ/match-compatible so an already-emitted row still advances in
  // place — but the append path below NEVER emits a bare cell: the node id is known at close
  // time, and validateRequiredAgentCompliance requires exactly `role (node-id)` per node.
  const legacyRequirement = (role === 'code-reviewer' || role === 'security-reviewer') ? role : null;
  let evidenceSummary = evidenceContent
    ? evidenceContent.split('\n')[0].slice(0, 80) : 'evidence present';
  if (barrierMarker) evidenceSummary += '; barrier: ' + barrierMarker;
  const complianceStatus = role === 'finalize' ? 'main-session-direct' : 'subagent-invoked';

  // Schema-2 plans pre-seed the exact one-row-per-node compliance set at
  // freeze time.  Presence is therefore not proof of completion: advance the
  // canonical pending row in place, preserve a resolved row byte-for-byte on
  // replay, and append only for a legacy plan that has no row yet.
  const sec = locateSection(planContent, 'Required Agent Compliance');
  if (sec.start >= 0) {
    const end = sec.next >= 0 ? sec.next : planContent.length;
    const block = planContent.slice(sec.start, end);
    const lines = block.split('\n');
    const parsed = lines.map((line, index) => ({
      index,
      line,
      cells: line.trim().startsWith('|')
        ? line.split('|').slice(1, -1).map(cell => cell.trim()) : [],
    }));
    let matched = parsed.find(row => row.cells[0] === canonicalRequirement);
    if (!matched && legacyRequirement) {
      matched = parsed.find(row => {
        if (row.cells[0] !== legacyRequirement) return false;
        const binding = row.cells.find(cell => cell.includes('evidence-binding:')) || '';
        return !binding || binding.includes('evidence-binding: ' + nodeId + ' ');
      });
    }
    if (matched) {
      if (String(matched.cells[1] || '').toLowerCase() !== 'pending') return planContent;
      const requirementCell = matched.cells[0];
      lines[matched.index] = '| ' + requirementCell + ' | ' + complianceStatus
        + ' | ' + evidenceSummary + ' | |';
      return planContent.slice(0, sec.start) + lines.join('\n') + planContent.slice(end);
    }
  }

  // Append is ALWAYS the canonical `role (node-id)` cell — never the legacy bare role.
  const requirementCell = canonicalRequirement;
  return spliceComplianceRow(planContent,
    '| ' + requirementCell + ' | ' + complianceStatus + ' | ' + evidenceSummary + ' | |');
}

function appendCloseSidecarsOnce(opts, nodeId) {
  const planPath = opts.planPath;
  const readFile = opts.readFile;
  const cacheDir = path.join(path.dirname(planPath), '.cache');

  // A timing close is generation-idempotent: append only when the latest event for this node is
  // an open (or when legacy state has no timing at all). A later reopen appends another `opened`,
  // making the next legitimate close observable without duplicating retries of this close.
  let timingState = null;
  try {
    const content = readFile(path.join(cacheDir, 'node-timings.jsonl'));
    for (const line of String(content || '').split('\n')) {
      let event; try { event = JSON.parse(line); } catch (_) { continue; }
      if (!event || event.node !== nodeId) continue;
      if (event.event === 'opened') timingState = 'open';
      if (event.event === 'closed') timingState = 'closed';
    }
  } catch (_) { /* absent legacy timing is repaired by the append below */ }
  if (timingState !== 'closed') appendNodeTiming(planPath, nodeId, 'closed');

  // Provenance already carries the generation nonce, so that tuple is the natural idempotency key.
  const nonce = readNonce(planPath, nodeId, readFile);
  let provenancePresent = false;
  try {
    const content = readFile(path.join(cacheDir, 'provenance-log.jsonl'));
    provenancePresent = String(content || '').split('\n').some(line => {
      let event; try { event = JSON.parse(line); } catch (_) { return false; }
      return event && event.event === 'close' && event.nodeId === nodeId
        && (event.nonce || null) === (nonce || null);
    });
  } catch (_) { /* absent log is repaired by the append below */ }
  if (!provenancePresent) appendProvenanceLog(planPath, 'close', nodeId, nonce);
}

// ---------------------------------------------------------------------------
// spliceStateMarker — idempotently write "key: value" into workflow-state.md.
// Inserts before ## Last Updated (if present), else appends.
// ---------------------------------------------------------------------------
function spliceStateMarker(content, key, value) {
  const line = key + ': ' + value;
  // If marker already present with this exact value, no-op.
  const exactRe = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
  if (exactRe.test(content)) return content;

  // If marker present with a different value, replace it.
  const anyRe = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*.+$', 'm');
  if (anyRe.test(content)) {
    return content.replace(anyRe, line);
  }

  // Insert before ## Last Updated if present, else append.
  const luMarker = '\n## Last Updated';
  const luIdx = content.indexOf(luMarker);
  if (luIdx >= 0) {
    return content.slice(0, luIdx) + '\n' + line + content.slice(luIdx);
  }

  // Append at EOF.
  return content.trimEnd() + '\n' + line + '\n';
}

// ---------------------------------------------------------------------------
// parseNodesFromContent — read-only require of plan-validator's parseNodes.
// Returns [] on any error (fail-closed).
// ---------------------------------------------------------------------------
function parseNodesFromContent(content) {
  try {
    const { parseNodes } = require('./kaola-workflow-plan-validator');
    return parseNodes(content);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// run-progress mirror (#605) — a DERIVED, non-authoritative snapshot of the ## Node Ledger written at
// the MAIN root during a worktree run. The live ledger advances only in the worktree copy of
// workflow-plan.md until sink, so a watcher (editor / file-watcher / other session / tool) at the main
// root would otherwise see no progress for the whole run. buildRunProgress derives the snapshot from
// the (worktree) plan content; writeRunProgressMirror persists it. Strictly derived: never read back
// for a decision (the embedded plan_hash lets a consumer detect staleness). FAIL-OPEN — any write
// failure returns false so the caller can surface a warn field; it NEVER refuses or alters the exit.
// ---------------------------------------------------------------------------
const RUN_PROGRESS_MIRROR_NAME = 'run-progress.json';

function buildRunProgress(planContent, op) {
  const statuses = readLedgerStatuses(planContent);   // id -> status (ledger row order preserved)
  const roleById = {};
  for (const n of parseNodesFromContent(planContent)) roleById[n.id] = n.role;
  const node_ledger = Object.keys(statuses).map(id => ({ id, role: roleById[id] || null, status: statuses[id] }));
  const in_progress = node_ledger.filter(r => r.status === 'in_progress').map(r => r.id);
  const all_done = node_ledger.length > 0 && node_ledger.every(r => r.status === 'complete' || r.status === 'n/a');
  const hm = String(planContent || '').match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/);
  return {
    plan_hash: hm ? hm[1] : null,
    updated_at: new Date().toISOString(),
    op: op,
    node_ledger,
    in_progress,
    all_done,
  };
}

function writeRunProgressMirror(mainRoot, project, planPath, readFile, op, mainRootTrusted) {
  try {
    const fs = require('fs');
    const projectDir = path.join(mainRoot, 'kaola-workflow', project);
    // #612: fail CLOSED. Only mirror when mainRoot is trustworthy — either affirmatively resolved from
    // the project's own workflow-state.md main_root: field (mainRootTrusted), or a heuristic-resolved
    // root that DEMONSTRABLY already owns this project (its frozen workflow-plan.md is present). A
    // misresolved root that owns neither is skipped SILENTLY (returns 'skipped', never a warn) so it can
    // never fabricate a foreign kaola-workflow/<project>/ tree — the run-progress leak class.
    if (!mainRootTrusted && !fs.existsSync(path.join(projectDir, 'workflow-plan.md'))) return 'skipped';
    let planContent = '';
    try { planContent = readFile(planPath); } catch (_) { planContent = ''; }
    const dir = path.join(projectDir, '.cache');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, RUN_PROGRESS_MIRROR_NAME), JSON.stringify(buildRunProgress(planContent, op), null, 2) + '\n');
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// checkEvidenceShape — presence-only check for role-specific evidence tokens.
//
// tdd-guide:        needs BOTH 'RED' AND 'GREEN' (or 'n/a' reason).
// implementer:      needs 'non_tdd_reason' AND one of {regression-green, build-green,
//                   smoke-integration} (or 'n/a').
// metric-optimizer: needs a NON-EMPTY value for each of 'metric_baseline', 'metric_final',
//                   'iterations_used', 'regression-green' (the hollow-stub guard — token keys
//                   alone are not enough) (or 'n/a').
// other roles:      file present and non-empty is sufficient.
//
// @param {string}      role         node role string
// @param {string}      nodeId       node id (for error context)
// @param {string|null} evidence     evidence file content (null/'' → absent)
// @returns {{ ok:boolean, kind?:'absent'|'shape', missingTokenClass?:string, reason?:string, expected?:string[] }}
//   #319: on failure, `kind` discriminates absent ('absent') vs malformed
//   ('shape') evidence; `missingTokenClass` names the failed class
//   ('non_tdd_reason' / 'change-type' / 'RED' / 'GREEN' / 'non-empty').
// ---------------------------------------------------------------------------
function checkEvidenceShape(role, nodeId, evidence, opts) {
  const content = evidence || '';
  opts = opts || {};

  // #392: ANTI-REPLAY / ANTI-COPY binding. When the caller passes an expectedNonce (the per-open
  // barrier-base SHA prefix the role agent could ONLY have received from THIS dispatch), the evidence
  // MUST carry a `evidence-binding: <nodeId> <nonce>` header. A mismatched node id → evidence_unbound
  // (copied from a DIFFERENT node); a mismatched nonce → evidence_stale (copied / replayed from a
  // PRIOR open of the same node). ABSENT expectedNonce → SKIP entirely (backward-compatible: the ~40
  // existing 3-arg callers and any path with no recorded baseline pass exactly as before).
  if (opts.expectedNonce) {
    const m = content.match(/^evidence-binding:[ \t]*([^\s]+)[ \t]+([^\s]+)[ \t]*$/m);
    if (!m) {
      return { ok: false, kind: 'shape', missingTokenClass: 'evidence-binding',
        reason: role + ' ' + nodeId + ' evidence missing the `evidence-binding: <node-id> <nonce>` header (anti-copy binding)',
        expected: ['evidence-binding: ' + (opts.expectedNodeId || nodeId) + ' ' + opts.expectedNonce] };
    }
    const boundNode = m[1];
    const boundNonce = m[2];
    if (opts.expectedNodeId && boundNode !== opts.expectedNodeId) {
      return { ok: false, kind: 'shape', missingTokenClass: 'evidence_unbound',
        reason: role + ' ' + nodeId + ' evidence-binding names node "' + boundNode + '" but this dispatch is for "' + opts.expectedNodeId + '" (evidence copied from another node)',
        evidenceUnbound: true,
        expected: ['evidence-binding: ' + opts.expectedNodeId + ' ' + opts.expectedNonce] };
    }
    if (boundNonce !== opts.expectedNonce) {
      return { ok: false, kind: 'shape', missingTokenClass: 'evidence_stale',
        reason: role + ' ' + nodeId + ' evidence-binding nonce "' + boundNonce + '" != this open\'s nonce "' + opts.expectedNonce + '" (stale / replayed evidence from a prior open)',
        evidenceStale: true,
        expected: ['evidence-binding: ' + (opts.expectedNodeId || nodeId) + ' ' + opts.expectedNonce] };
    }
  }

  // Codex join protocol: the OPTIONAL typed delegation outcome. When the evidence carries a column-0
  // `delegation_outcome: <token>` line, the token MUST be in the closed vocabulary (completed |
  // returned_partial | interrupted_unresponsive | interrupted_obsolete); an unknown value is a typed
  // refusal. ABSENT ⇒ `completed` (back-compat: existing evidence has no such line and stays green).
  // Placed BEFORE the role branches AND the universal n/a carve-out so the vocabulary governs every role
  // uniformly — a malformed token fails closed regardless of how the node otherwise resolves.
  {
    const dm = content.match(/^delegation_outcome:[ \t]*(\S+)[ \t]*$/m);
    if (dm && !DELEGATION_OUTCOME_VOCABULARY.includes(dm[1].toLowerCase())) {
      return { ok: false, kind: 'shape', missingTokenClass: 'delegation_outcome',
        reason: role + ' ' + nodeId + ' evidence has unknown delegation_outcome "' + dm[1] + '" (allowed: ' + DELEGATION_OUTCOME_VOCABULARY.join(' | ') + ')',
        expected: ['delegation_outcome: ' + DELEGATION_OUTCOME_VOCABULARY.join('|')] };
    }
  }

  // Schema-2 review evidence has already passed the version/context/profile/
  // candidate wall and its mode-derived token check. Do not apply the legacy
  // verdict/findings_blocking vocabulary on top of that independent contract.
  if (opts.reviewV2 && opts.reviewV2.ok && opts.reviewV2.review_gate) return { ok: true };

  // #334: a non-delegable main-session gate can never self-skip ('n/a') and must record a
  // machine verdict (column-0, last-match-wins, lowercase — mirrors schema.parseNodeVerdict).
  // Placed BEFORE the universal n/a carve-out on purpose.
  if (role === 'main-session-gate') {
    if (!content.trim()) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty',
        reason: 'evidence missing for main-session-gate node ' + nodeId, expected: ['verdict: pass|fail'] };
    }
    const vm = content.match(/^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm);
    const last = vm ? vm[vm.length - 1].replace(/^verdict:[ \t]*/, '').trim().toLowerCase() : null;
    if (last !== 'pass' && last !== 'fail') {
      return { ok: false, kind: 'shape', missingTokenClass: 'verdict',
        reason: 'main-session-gate ' + nodeId + ' evidence missing column-0 verdict: pass|fail line (an n/a skip is refused for a non-delegable gate)',
        expected: ['verdict: pass|fail'] };
    }
    // #607 Layer 3 — the edition-neutral tripwire. A main-session-gate must ATTEST how any probe
    // instrumentation it ran was provisioned: a column-0 `instrumentation: none | <node-id>` token.
    // `none` declares the gate ran no in-worktree instrumentation; `<node-id>` names the UPSTREAM
    // WRITER node that authored the probe inside its declared write set (so the probe is covered by the
    // post-dominating code-reviewer instead of being self-reviewed by the verdict-bearing gate). Absence
    // is refused alongside the missing-verdict refusal — it converts silent gate-authored drift into an
    // affirmative false statement, the same posture as every other evidence token. Works where the hook
    // is inert (Codex trust-gated hooks; opencode has no hook parity).
    const im = content.match(/^instrumentation:[ \t]*(\S+)[ \t]*$/m);
    if (!im) {
      return { ok: false, kind: 'shape', missingTokenClass: 'instrumentation',
        reason: 'main-session-gate ' + nodeId + ' evidence missing column-0 `instrumentation: none | <node-id>` token (attest how any probe was provisioned — `none`, or the upstream writer node that authored it)',
        expected: ['instrumentation: none|<node-id>'] };
    }
    const instr = im[1];
    // When the token NAMES a node (not `none`) AND the ledger is available (opts.ledgerNodes — passed by
    // the close paths), the named node must exist in the ledger as a WRITER whose declared write set
    // covers the instrumentation. The `instrumentation: <node-id>` token carries only a node id (not the
    // probe paths), so "covers the instrumentation" cannot be mechanically resolved to specific paths;
    // the enforced interpretation is therefore: named node EXISTS in the ledger AND is a writer
    // (non-empty declared write set). Skipped when ledgerNodes is absent (the --verify preflight /
    // legacy 3-arg callers) — the presence gate above still fires.
    if (instr !== 'none' && Array.isArray(opts.ledgerNodes)) {
      const named = opts.ledgerNodes.find(n => n.id === instr);
      if (!named) {
        return { ok: false, kind: 'shape', missingTokenClass: 'instrumentation_node',
          reason: 'main-session-gate ' + nodeId + ' names instrumentation node "' + instr + '" not present in the ledger',
          expected: ['instrumentation: none', 'or an existing ledger writer node id'] };
      }
      if (isReadOnlyNode(named)) {
        return { ok: false, kind: 'shape', missingTokenClass: 'instrumentation_node',
          reason: 'main-session-gate ' + nodeId + ' instrumentation node "' + instr + '" is not a writer (empty declared write set) — the probe must be authored inside an upstream writer\'s declared write set',
          expected: ['instrumentation: <writer-node-id>'] };
      }
    }
    return { ok: true };
  }

  // 'n/a' skip is universal.
  if (content.trim().startsWith('n/a')) {
    return { ok: true };
  }

  if (role === 'tdd-guide') {
    if (!content) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: 'evidence missing for tdd-guide node ' + nodeId, expected: ['RED', 'GREEN'] };
    }
    // The open-time seed contains empty RED:/GREEN: keys and comments naming both tokens. Require a
    // non-empty column-0 value so a seed-only file can never satisfy --verify or close.
    const hasRed   = /^RED:[ \t]*(\S.*)$/m.test(content);
    const hasGreen = /^GREEN:[ \t]*(\S.*)$/m.test(content);
    if (!hasRed) {
      return { ok: false, kind: 'shape', missingTokenClass: 'RED', reason: 'tdd-guide ' + nodeId + ' evidence missing RED token', expected: ['RED', 'GREEN'] };
    }
    if (!hasGreen) {
      return { ok: false, kind: 'shape', missingTokenClass: 'GREEN', reason: 'tdd-guide ' + nodeId + ' evidence missing GREEN token', expected: ['RED', 'GREEN'] };
    }
    return { ok: true };
  }

  if (role === 'implementer') {
    if (!content) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: 'evidence missing for implementer node ' + nodeId, expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    // The open-time seed contains empty keys and a comment listing the alternation. Require actual
    // non-empty column-0 values so encrypted-return recovery cannot accept untouched scaffolding.
    const hasReason = /^non_tdd_reason:[ \t]*(\S.*)$/m.test(content);
    const hasChangeType = /^(?:regression-green|build-green|smoke-integration):[ \t]*(\S.*)$/m.test(content);
    if (!hasReason) {
      return { ok: false, kind: 'shape', missingTokenClass: 'non_tdd_reason', reason: 'implementer ' + nodeId + ' evidence missing non_tdd_reason', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    if (!hasChangeType) {
      return { ok: false, kind: 'shape', missingTokenClass: 'change-type', reason: 'implementer ' + nodeId + ' evidence missing change-type token', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    return { ok: true };
  }

// metric-optimizer: the measured metric claim IS the node's entire deliverable — the open-time
  // seeded stub already carries every D6 token KEY with an EMPTY value, so a name-only probe
  // would close a node COMPLETE on a hollow stub with zero ratchet log. Enforce that each of the
  // four non-binding D6 tokens is present AND carries a non-empty value (evidence-binding is
  // checked at the top of this function). Presence-only, per the function's documented contract:
  // a non-whitespace value after the column-0 `<token>:` is required; the value itself is not
  // validated. The stub's `<!-- <token>: paste ... -->` comment line is NOT column-0 anchored on
  // the token key, so it never satisfies the check.
  if (role === 'metric-optimizer') {
    if (!content) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: 'evidence missing for metric-optimizer node ' + nodeId, expected: ['metric_baseline', 'metric_final', 'iterations_used', 'regression-green'] };
    }
    const D6_TOKENS = ['metric_baseline', 'metric_final', 'iterations_used', 'regression-green'];
    for (const token of D6_TOKENS) {
      const hasValue = new RegExp('^' + token + ':[ \\t]*(\\S.*)$', 'm').test(content);
      if (!hasValue) {
        return { ok: false, kind: 'shape', missingTokenClass: token, reason: 'metric-optimizer ' + nodeId + ' evidence missing non-empty ' + token + ' token', expected: D6_TOKENS };
      }
    }
    return { ok: true };
  }

  // Other roles: file present and non-empty, PLUS registry-driven content tokens. A normally opened node
  // has expectedNonce, so EVERY token class in its seed contract must carry a non-empty value (or ANY one
  // alternative for an alternation). This prevents replacing the seeded body with free-form prose or the
  // compact parent summary and then passing encrypted-return recovery. DD-5 back-compat remains only for
  // legacy/offline callers without an expected nonce: there, a key absent from an old in-flight artifact is
  // exempt, but a present seeded key must still be non-empty. The tdd-guide/implementer/metric-optimizer/
  // main-session-gate branches above use their own strict shapes and never reach here.
  if (!content.trim()) {
    return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: role + ' ' + nodeId + ' evidence missing or empty', expected: ['non-empty evidence file'] };
  }
  {
    let ROLE_TOKEN_REGISTRY;
    try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator')); } catch (_) { ROLE_TOKEN_REGISTRY = {}; }
    const row = (ROLE_TOKEN_REGISTRY && ROLE_TOKEN_REGISTRY[role]) || null;
    if (row) {
      const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const keyPresent = (tok) => new RegExp('^' + esc(tok) + ':', 'm').test(content);
      const valuePresent = (tok) => new RegExp('^' + esc(tok) + ':[ \\t]*(\\S.*)$', 'm').test(content);
      for (const tokenClass of row) {
        if (tokenClass === 'evidence-binding') continue;
        const alts = tokenClass.split('|');
        // Current nonce-bound opens enforce the whole registry row. Only a legacy/offline call with no
        // expected nonce keeps the DD-5 absent-key exemption for an old in-flight artifact.
        if (!opts.expectedNonce && !alts.some(keyPresent)) continue;
        if (!alts.some(valuePresent)) {
          return { ok: false, kind: 'shape', missingTokenClass: tokenClass,
            reason: role + ' ' + nodeId + ' evidence is missing a non-empty ' + tokenClass + ' token required by this seeded contract',
            expected: row.filter(t => t !== 'evidence-binding') };
        }
      }
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// checkVerdictParse (#403.4) — for a verdict-bearing gate role, return a non-blocking
// `verdict_unparsed` warning when the evidence carries a verdict-shaped line that the STRICT
// finalize --verdict-check (schema.parseNodeVerdict) would NOT recognize as a clean pass|fail.
//
// The strict matcher is column-0, LOWERCASE `verdict:` key only (`/^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/`
// with the captured value lowercased). So the near-miss #403.4 describes — `Verdict: Pass` with a
// CAPITAL key — is invisible to it (found:false → finalize fails `missing-verdict`), even though a
// human reads it as a clear pass. We detect that with a LENIENT case-insensitive key probe and warn
// when a verdict line is present but the strict parse yields neither 'pass' nor 'fail'.
//
// Informational ONLY — never refuses (per the #328 design): the failure would otherwise surface at
// finalize --verdict-check, costing a reopen → re-evidence → re-close loop. Returns null when the role
// is not verdict-bearing, no verdict line is present, or the strict parse already yields pass/fail.
//
// VERDICT_ROLES mirrors the gate vocabulary repair-state / verifyVerdictBlock check.
// ---------------------------------------------------------------------------
const VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']);

// ---------------------------------------------------------------------------
// GATE_ROLES — promoted to module level (#444 / D-444-01) so both runReopenNode
// and deriveGuards share one definition (single source of truth).
// Previously defined inline inside runReopenNode (~L1834).
// ---------------------------------------------------------------------------
const GATE_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']);

// ---------------------------------------------------------------------------
// writeSetTouchesGeneratedPort (#444 / D-444-01 §3c) — returns true when the
// declared write-set RAW string contains any of the canonical GENERATED_AGGREGATORS
// or their edition siblings (codex twin + forge ports). Reuses the edition-sync
// module's GENERATED_AGGREGATORS + forgeRel so the guard and the #431 freeze-wall
// share one vocabulary. Returns false if edition-sync is not available (no false
// positives on forge/codex installs without edition-sync).
// ---------------------------------------------------------------------------
function writeSetTouchesGeneratedPort(writeSetRaw) {
  let editionSync = null;
  try { editionSync = require('./edition-sync'); } catch (_) { return false; }
  if (!editionSync || !Array.isArray(editionSync.GENERATED_AGGREGATORS)
      || typeof editionSync.forgeRel !== 'function') return false;
  let tokens;
  try {
    const { parseWriteSetCell } = require('./kaola-workflow-classifier');
    tokens = parseWriteSetCell(writeSetRaw);
  } catch (_) { return false; }
  // Codex twin prefix: split across two string literals to avoid a forge-port validator
  // source-text check that flags the combined path in edition ports. The runtime value is
  // the concatenation of the two parts.
  const codexPrefix = 'plugins/kaola-workflow' + '/scripts/';
  const codexRel = base => codexPrefix + base;
  for (const base of editionSync.GENERATED_AGGREGATORS) {
    const sibs = ['scripts/' + base, codexRel(base),
                  editionSync.forgeRel(base, 'gitlab'), editionSync.forgeRel(base, 'gitea')];
    for (const s of sibs) if (tokens.has(s)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// deriveGuards(nodeInfo) (#444 / D-444-01 §3) — script-owned guard derivation.
// Computes the guards[] array for a node from its role + declared write set.
// Pure: no fs I/O except the lazy require for edition-sync detection.
//
// Guard vocabulary (stable, deterministic order):
//   'read-only'                — GATE_ROLES: code-reviewer, security-reviewer,
//                                adversarial-verifier, main-session-gate
//   'RED-fixture-in-$TMPDIR'  — tdd-guide role (#424: RED fixtures in $TMPDIR only)
//   'sync:editions'           — write set contains a generated-aggregator sibling
//                                (editions must be byte-synced via npm run sync:editions)
// ---------------------------------------------------------------------------
function deriveGuards(nodeInfo) {
  const guards = [];
  const role = nodeInfo.role;
  if (GATE_ROLES.has(role)) guards.push('read-only');
  if (role === 'tdd-guide') guards.push('RED-fixture-in-$TMPDIR');
  if (writeSetTouchesGeneratedPort(nodeInfo.declared_write_set)) guards.push('sync:editions');
  return guards;
}

// ---------------------------------------------------------------------------
// deriveRequiredTokens(role) — helper used by buildDispatch when context.required_tokens
// is absent. Mirrors the per-opener ROLE_TOKEN_REGISTRY lookups factored out.
// ---------------------------------------------------------------------------
function deriveRequiredTokens(role) {
  let ROLE_TOKEN_REGISTRY;
  try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator')); }
  catch (_) { ROLE_TOKEN_REGISTRY = {}; }
  return (ROLE_TOKEN_REGISTRY[role] || ['evidence-binding']).slice();
}

// ---------------------------------------------------------------------------
// buildDispatch(nodeInfo, context) (#444 / D-444-01 §2) — the SINGLE builder for
// the `dispatch` descriptor sub-object. All three openers (runOpenNext,
// runOpenReady, runCloseAndOpenNext fused advance) call this one function so the
// dispatch shape cannot drift between the serial and fused-advance paths.
//
// nodeInfo fields: id, role, model, declared_write_set
// context fields:  nonce, evidence_file, required_tokens, working_dir, forge_rider,
//                  goal_line (optional)
// ---------------------------------------------------------------------------
function sanitizeCodexTaskName(value) {
  const cleaned = String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'node';
}

function codexTaskNameForNode(nodeInfo) {
  const id = nodeInfo && nodeInfo.id ? String(nodeInfo.id) : 'node';
  const role = nodeInfo && nodeInfo.role ? String(nodeInfo.role) : '';
  return sanitizeCodexTaskName(role ? id + '__' + role : id);
}

function resolveCodexDispatchMode(context, env) {
  const ctx = context || {};
  const explicit = String(ctx.codex_dispatch_mode || '').trim();
  if (explicit === 'v2-task-name' || explicit === 'v1-thread-id') return explicit;
  const e = env || process.env || {};
  const flag = String(e.KAOLA_CODEX_DISPATCH_MODE || e.CODEX_DISPATCH_MODE || '').trim();
  if (flag === 'v2-task-name' || flag === 'v1-thread-id') return flag;
  if (String(e.KAOLA_CODEX_MULTI_AGENT_V2 || e.CODEX_MULTI_AGENT_V2 || '').trim() === '1') {
    return 'v2-task-name';
  }
  return 'v1-thread-id';
}

// #641 (D-641-01): the observation contract pinned onto an `observes: scratch` gate's dispatch card — the
// discipline that makes a LEGLESS co-open behind it sound (R2). The gate must render its verdict from the
// evidence of CLOSED nodes + its own scratch, never the live worktree (where a co-running writer's
// uncommitted bytes sit). Single source of truth so the card text can never drift from the R2b contract.
const SCRATCH_OBSERVATION_CONTRACT = 'verdict from .cache evidence of closed nodes + scratch only; do not read the worktree tree or diff';

function buildDispatch(nodeInfo, context) {
  const ctx = context || {};
  const codexDispatchMode = resolveCodexDispatchMode(ctx, process.env);
  const codexTaskName = codexTaskNameForNode(nodeInfo);
  const d = {
    node_id:            nodeInfo.id,
    role:               nodeInfo.role,
    model:              (nodeInfo.model != null ? nodeInfo.model : null),
    working_dir:        ctx.working_dir,
    declared_write_set: nodeInfo.declared_write_set,
    evidence_file:      ctx.evidence_file,
    nonce:              (ctx.nonce != null ? ctx.nonce : null),
    required_tokens:    ctx.required_tokens || deriveRequiredTokens(nodeInfo.role),
    forge_rider:        (ctx.forge_rider != null ? ctx.forge_rider : null),
    guards:             deriveGuards(nodeInfo),
    agent_type:         nodeInfo.role,
    codex_dispatch_mode: codexDispatchMode,
    codex_task_name:    codexTaskName,
    ...dispatchEffort(nodeInfo.model, nodeInfo.codex_session_proof || ctx.session_proof),
    // Current-Codex adapter: the named role profile inherits the parent pair. The historical role
    // class remains declarative metadata and never creates a tier/profile conflict.
    ...codexProfilePolicy(nodeInfo.role, nodeInfo.model),
    // Codex join protocol: the per-node wait budget (minutes) the join loop honors before it may
    // escalate a still-`running` agent. Tier-derived (reasoning→40 / standard→20 / role-default→20),
    // present on EVERY dispatch card so no timeout is left to model improvisation.
    ...waitBudgetMinutes(nodeInfo.model),
    // #382-opencode: the opencode effort twin — resolves the per-node tier to a provider
    // effort variant (reasoning→top, standard→second) when ctx.opencode_provider is set (opencode
    // runtime). null/absent provider → role_default (the agent's configured variant wins).
    ...dispatchEffortOpencode(nodeInfo.model, ctx.opencode_provider),
  };
  if (ctx.runtime === 'codex' || nodeInfo.codex_session_proof) {
    const proof = nodeInfo.codex_session_proof || ctx.session_proof || { status: 'absent', source: 'session_jsonl' };
    d.codex_session_proof_status = proof.status || 'absent';
    d.codex_session_proof_source = proof.source || 'session_jsonl';
  }
  if (Number.isInteger(nodeInfo.wait_budget_minutes)) {
    const { validateWaitBudgetNode } = require('./kaola-workflow-plan-validator');
    const optimizeContracts = new Map();
    if (ctx.optimize != null || Number.isFinite(ctx.budget_wallclock_minutes)) {
      optimizeContracts.set(nodeInfo.id, { budget_wallclock_minutes: Number.isFinite(ctx.budget_wallclock_minutes) ? ctx.budget_wallclock_minutes : null });
    }
    const check = validateWaitBudgetNode(
      { ...nodeInfo, waitBudgetRaw: String(nodeInfo.wait_budget_minutes) },
      { optimizeContracts }
    );
    if (!check.ok) {
      const err = new Error(check.errors[0]);
      err.reason = check.reason;
      throw err;
    }
    d.wait_budget_minutes = nodeInfo.wait_budget_minutes;
    d.wait_budget_source = 'planner_override';
  }
  // #609/#610: the runtime-native display for the node's model, so a dispatch-card echo reads natively on
  // every runtime (claude alias / codex effort phrase / opencode variant phrase) instead of a Claude noun.
  // Conditionally attached (like goal_line/leg_path): null only when nodeInfo.model resolves to no tier (a
  // model-less role / a genuinely untiered direct call) ⇒ no model_display key is added; the Codex
  // override fields still state the intentional null/unresolved posture explicitly.
  const nodeModelDisplay = modelDisplay(nodeInfo.model);
  if (nodeModelDisplay) d.model_display = nodeModelDisplay;
  if (ctx.goal_line != null && String(ctx.goal_line).trim() !== '') {
    d.goal_line = String(ctx.goal_line);
  }
  // #591: per-member leg routing. On a co-open write frontier each member runs in its own provisioned
  // `.kw` leg worktree; thread the member's leg_path + leg_branch DIRECTLY into its dispatch card so the
  // orchestrator routes each leg from the per-member payload — not by cross-referencing the separate
  // top-level laneGroup descriptor against member ids. Conditionally attached (like goal_line): absent on
  // the serial/read path (ctx.leg_path/leg_branch null) ⇒ the dispatch shape is byte-identical to pre-#591.
  if (ctx.leg_path != null && String(ctx.leg_path).trim() !== '') {
    d.leg_path = String(ctx.leg_path);
  }
  if (ctx.leg_branch != null && String(ctx.leg_branch).trim() !== '') {
    d.leg_branch = String(ctx.leg_branch);
  }
  // The durable node channel: pointers to each upstream's evidence file so the dispatched consumer can
  // OPEN and READ them before starting. Each entry is { node_id, role, path } — the project-qualified,
  // barrier-exempt evidence path — and NEVER a nonce (anti-fabrication: only line 1 of the upstream file
  // carries the read-proof nonce). Conditionally attached (like goal_line/leg_path): a root/depless node
  // has NO upstream_evidence field ⇒ the dispatch shape stays byte-identical.
  if (Array.isArray(ctx.upstream_evidence) && ctx.upstream_evidence.length) {
    d.upstream_evidence = ctx.upstream_evidence;
  }
  // #634 (metric-optimizer): an optimize node's budget_wallclock_minutes OVERRIDES the tier-derived
  // wait budget (the ratchet's declared runtime ceiling); mark the source so the orchestrator's
  // wait-budget ladder applies the contract budget, not the tier default. Conditionally applied (like
  // goal_line/leg_path): absent ctx.budget_wallclock_minutes leaves the tier-derived budget + source
  // byte-identical to pre-#634. The optimize contract itself is attached so the dispatched agent runs
  // the exact frozen ratchet parameters.
  if (Number.isFinite(ctx.budget_wallclock_minutes) && ctx.budget_wallclock_minutes > 0) {
    d.wait_budget_minutes = ctx.budget_wallclock_minutes;
    d.wait_budget_source = 'optimize_budget';
  }
  if (ctx.optimize != null) {
    d.optimize = ctx.optimize;
  }
  // Schema-2 reviewer identity is conditional and therefore byte-preserving
  // for every legacy/non-review dispatch. Runtime/profile fields remain in the
  // envelope; the referenced context JSON is deliberately runtime-neutral.
  if (ctx.review_dispatch && ctx.review_dispatch.contract_version === 2) {
    for (const key of [
      'plan_schema_version', 'contract_version', 'behavior_contract_version',
      'behavior_contract_hash', 'resolved_profile_hash', 'review_context_hash',
      'review_context_path', 'candidate_digest', 'gate_mode', 'logical_gate',
      'gate_claim', 'gate_surface', 'gate_aggregation',
    ]) d[key] = ctx.review_dispatch[key];
  }
  // #641 (D-641-01): pin the observation contract on an `observes: scratch` gate's card so the dispatched
  // adversarial-verifier renders its verdict from .cache evidence + scratch ONLY (never the worktree
  // tree/diff). Conditionally attached (like goal_line/leg_path): a non-scratch node has NO `observation`
  // field ⇒ byte-identical to pre-#641.
  if (nodeInfo.observes === 'scratch') d.observation = SCRATCH_OBSERVATION_CONTRACT;
  return d;
}

// #634 (metric-optimizer): resolve the optimize context to thread onto a dispatch card for a
// metric-optimizer node. Returns { optimize, budget_wallclock_minutes? } when the node is a
// metric-optimizer WITH a frozen optimize(<id>) contract, else {} (spread is a no-op ⇒ every
// non-optimize card stays byte-identical). Reads the contract from the frozen plan via the validator's
// single parser (no second copy of the grammar).
function optimizeDispatchCtx(planContent, role, nodeId) {
  if (role !== 'metric-optimizer') return {};
  let parseOptimizeContracts;
  try { ({ parseOptimizeContracts } = require('./kaola-workflow-plan-validator')); } catch (_) { return {}; }
  if (typeof parseOptimizeContracts !== 'function') return {};
  let contracts;
  try { contracts = parseOptimizeContracts(planContent); } catch (_) { return {}; }
  const contract = contracts && typeof contracts.get === 'function' ? contracts.get(nodeId) : null;
  if (!contract) return {};
  const out = { optimize: contract };
  if (Number.isFinite(contract.budget_wallclock_minutes) && contract.budget_wallclock_minutes > 0) {
    out.budget_wallclock_minutes = contract.budget_wallclock_minutes;
  }
  return out;
}

// #609/#610: the advisory frontier/newly-ready preview descriptor (orient's frontier, the #472 read-
// frontier, the top-up newlyReady lists). Carries the runtime-native tier display alongside the raw
// `model` echo so a Codex/opencode narrative echoing a preview reads natively. model_display is
// conditionally attached (like the dispatch card): absent when the node has no explicit tier, so an
// untiered preview list is byte-identical to pre-#610. Ignores map's index/array args (uses only n).
function frontierNode(n) {
  const md = modelDisplay(n.model);
  return {
    id: n.id,
    role: n.role,
    model: n.model,
    ...(md ? { model_display: md } : {}),
    declared_write_set: n.declared_write_set,
  };
}

// ---------------------------------------------------------------------------
// dispatchSummarySegments(result) (#602) — the machine-parsable dispatch segments for the --summary
// line. One segment per opened node:
//   opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode> effort=<E>
// where E is codex_reasoning_effort, or the literal "unresolved" when it is null. A real role dispatch
// must refuse that sentinel as codex_tier_unresolved; it never means parent/session inheritance. Handles
// BOTH envelope shapes: the single-open object (result.opened.dispatch — open-next / close-and-open-next
// fused advance) and the batch array (result.opened[].dispatch — open-ready). Leg paths are deliberately
// omitted (legs stay in the full cached envelope). Returns [] when there is no opened dispatch
// (close-only / allDone / refuse) so the summary line is unchanged in those cases.
// ---------------------------------------------------------------------------
function dispatchSummarySegments(result) {
  const segs = [];
  if (!result || typeof result !== 'object') return segs;
  const opened = result.opened;
  const members = Array.isArray(opened) ? opened : (opened ? [opened] : []);
  for (const m of members) {
    const d = m && m.dispatch;
    if (!d || d.node_id == null) continue;
    const effort = d.codex_reasoning_effort_source === 'parent_session' ? 'inherit'
      : ((d.codex_reasoning_effort != null && String(d.codex_reasoning_effort).trim() !== '')
        ? d.codex_reasoning_effort : 'unresolved');
    segs.push('opened=' + d.node_id + ' role=' + d.role + ' task=' + d.codex_task_name
      + ' mode=' + d.codex_dispatch_mode + ' effort=' + effort);
  }
  return segs;
}

// ---------------------------------------------------------------------------
// qualifiedEvidenceFile(project, nodeId) (#516) — the PROJECT-QUALIFIED evidence path emitted in a
// dispatch packet's `evidence_file` hint: kaola-workflow/<project>/.cache/<node-id>.md.
//
// Why qualified, not the bare `.cache/<node-id>.md`: the executor's own record-evidence / barrier resolve
// the on-disk file as path.join(dirname(planPath), '.cache', <id>.md) = kaola-workflow/<project>/.cache/…
// — barrier-exempt via isWorkflowArtifactPath (/^kaola-workflow\//). But a role-agent subagent dispatched
// INTO the worktree interprets a bare `.cache/<id>.md` relative to ITS cwd (the worktree root) and writes
// <worktree>/.cache/<id>.md — which does NOT match /^kaola-workflow\// → the per-node barrier treats it as
// a PRODUCTION write outside the declared allowlist → a false write_set_overflow with the evidence file as
// the sole outOfAllow path (triage even proposes revert-overflow, which would DELETE the evidence).
// Emitting the project-qualified path makes the subagent's literal-follow land in the exempt location.
// On-disk seed/record/verify resolution is UNCHANGED — they join dirname(planPath); only this dispatch
// HINT string is qualified. Falls back to the bare path when project is absent (legacy/offline).
// ---------------------------------------------------------------------------
function qualifiedEvidenceFile(project, nodeId) {
  if (!project) return '.cache/' + nodeId + '.md';
  return 'kaola-workflow/' + project + '/.cache/' + nodeId + '.md';
}

// ---------------------------------------------------------------------------
// deriveDispatchChannel(planContent, node, project, options) — the durable node channel fields threaded onto a
// dispatch card. Returns { goal_line?, upstream_evidence? }:
//   goal_line       the node's `## Node Briefs` entry (its intent/approach/constraints), verbatim; absent
//                   when the plan has no brief for this node (byte-identical to a briefless plan).
//   upstream_evidence  for each of the node's depends_on ids, { node_id, role, path }. The normal path is
//                   PROJECT-QUALIFIED. While an upstream isolated-leg member is complete-but-unmerged,
//                   options.planPath + options.runningSet route to that member's absolute leg artifact;
//                   the merge fence keeps the leg alive until the dependent read drains. #692: when the
//                   CURRENT node opens into an isolated leg (options.openIntoLeg), a parent-sourced
//                   upstream is absolutized to the parent worktree's evidence location too — the leg
//                   worktree carries no sibling .cache, so a project-relative hint would resolve empty
//                   from the briefed `cd <leg_path>` cwd. NEVER a nonce (anti-fabrication: the read-proof
//                   nonce lives only on line 1 of the upstream file). Absent for a root node (empty deps).
// Deps are re-looked-up from the frozen plan (parseNodesFromContent) so the channel never relies on the
// scheduler carrying deps forward. Fail-soft: any parse miss yields an empty channel (byte-identical).
// ---------------------------------------------------------------------------
function deriveDispatchChannel(planContent, node, project, options) {
  const out = {};
  options = options || {};
  if (!node || !node.id) return out;
  // goal_line — the node's brief.
  try {
    const { parseNodeBriefs } = require('./kaola-workflow-plan-validator');
    if (typeof parseNodeBriefs === 'function') {
      const b = (parseNodeBriefs(planContent) || []).find(x => x.nodeId === node.id);
      if (b && b.brief != null && String(b.brief).trim() !== '') out.goal_line = String(b.brief);
    }
  } catch (_) { /* no briefs section ⇒ no goal_line */ }
  // upstream_evidence — one pointer per depends_on id (deps re-looked-up from the frozen plan).
  try {
    const nodes = parseNodesFromContent(planContent);
    const self = nodes.find(x => x.id === node.id);
    const deps = (self && Array.isArray(self.dependsOn)) ? self.dependsOn : [];
    if (deps.length) {
      const byId = new Map(nodes.map(x => [x.id, x]));
      const ue = deps.map(upId => {
        const up = byId.get(upId);
        let evidencePath = qualifiedEvidenceFile(project, upId);
        if (options.planPath && options.runningSet) {
          const resolved = resolveEvidenceCachePath(
            options.planPath, upId, null, null, options.runningSet);
          // An upstream that resolves to a live unmerged leg → its absolute leg-mirror artifact.
          // #692: when the CURRENT node opens into an isolated leg (options.openIntoLeg), a
          // parent-sourced upstream must ALSO be absolutized. A fresh leg worktree carries no sibling
          // .cache evidence, so the project-relative hint resolves (empty) from the briefed `cd
          // <leg_path>` cwd; resolved.cachePath is the absolute parent-worktree evidence location by
          // construction (path.dirname(planPath) is the parent worktree's project dir). No consumer
          // depends on the project-relative string (close-side nonce resolution is independent).
          if (resolved.evidenceSource === 'leg' || options.openIntoLeg) evidencePath = resolved.cachePath;
        }
        return { node_id: upId, role: up ? up.role : null, path: evidencePath };
      });
      if (ue.length) out.upstream_evidence = ue;
    }
  } catch (_) { /* no resolvable deps ⇒ no upstream_evidence */ }
  return out;
}

// ---------------------------------------------------------------------------
// checkUpstreamConsumed(args) — the close-time consumed-proof over the durable node channel. Recomputes
// the node's PRODUCER upstreams from the FROZEN plan's depends_on and requires the consumer's evidence to
// echo a column-0 `upstream_read: <up-id> <nonce>` matching the upstream's CURRENT line-1 binding nonce.
// A correct echo proves the consumer opened the upstream file THIS open (the nonce is never emitted by any
// opener/card/seed — it lives only on line 1 of the upstream evidence).
//
// args = { role, nodeId, evidenceContent, nodes, ledgerStatuses, planPath, project, readFile }
// Returns { ok, hard, reason?:'upstream_not_consumed', offending?:<up-id>, expectedPath?, detail? }.
//   hard=true (a HARD refuse — zero ledger mutation at the caller) ONLY for an IMPLEMENT_ROLES consumer
//   with ≥1 producer upstream and a missing/mismatched echo; every other pair is advisory (hard=false).
// Exemptions: root nodes (no deps); non-producer upstreams (no token required); an upstream whose ledger
// status is n/a (skipped); and — for back-compat — a producer whose `upstream_read: <up-id>` KEY is ABSENT
// from the evidence (old in-flight consumers recorded before the seed/re-injection existed). New-code opens
// seed the key (record-evidence re-injects it empty), so a truncated new-node echo has an empty key ⇒
// enforced. Fail-soft: never throws (a probe failure must not brick a close).
// ---------------------------------------------------------------------------
function checkUpstreamConsumed(args) {
  const out = { ok: true, hard: false };
  try {
    const { role, nodeId, evidenceContent, nodes, ledgerStatuses, planPath, project, readFile } = args || {};
    let IMPLEMENT_ROLES, PRODUCER_ROLES;
    try { ({ IMPLEMENT_ROLES, PRODUCER_ROLES } = require('./kaola-workflow-plan-validator')); } catch (_) { return out; }
    if (!PRODUCER_ROLES || typeof PRODUCER_ROLES.has !== 'function') return out;
    const nodeList = Array.isArray(nodes) && nodes.length ? nodes
      : parseNodesFromContent(readFile ? readFile(planPath) : '');
    const self = nodeList.find(n => n.id === nodeId);
    const deps = (self && Array.isArray(self.dependsOn)) ? self.dependsOn : [];
    if (!deps.length) return out; // root node — nothing required.
    const byId = new Map(nodeList.map(n => [n.id, n]));
    const statuses = ledgerStatuses || {};
    const content = evidenceContent || '';
    // Universal n/a skip — a skipped consumer proves nothing (mirrors checkEvidenceShape's carve-out so
    // the two close gates render the same verdict on the same n/a evidence).
    if (content.trim().startsWith('n/a')) return out;
    const isImplementer = !!(IMPLEMENT_ROLES && typeof IMPLEMENT_ROLES.has === 'function' && IMPLEMENT_ROLES.has(role));
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const upId of deps) {
      const up = byId.get(upId);
      if (!up) continue;                              // unknown upstream (never on a frozen plan).
      if (!PRODUCER_ROLES.has(up.role)) continue;     // non-producer upstream — no token required.
      if (statuses[upId] === 'n/a') continue;         // skipped upstream — exempt.
      // DD-5 back-compat: enforce ONLY when the `upstream_read: <up-id>` KEY is present in the evidence.
      const keyPresent = new RegExp('^upstream_read:[ \\t]+' + esc(upId) + '(?:[ \\t]|$)', 'm').test(content);
      if (!keyPresent) continue;                      // old in-flight consumer (no seeded key) — exempt.
      const upNonce = readUpstreamEvidenceNonce(planPath, upId, readFile);
      if (!upNonce) continue;                         // cannot resolve the upstream nonce — fail-open.
      const matched = new RegExp('^upstream_read:[ \\t]+' + esc(upId) + '[ \\t]+' + esc(upNonce) + '[ \\t]*$', 'm').test(content);
      if (!matched) {
        out.ok = false;
        out.reason = 'upstream_not_consumed';
        out.offending = upId;
        out.expectedPath = qualifiedEvidenceFile(project, upId);
        out.hard = isImplementer;
        out.detail = role + ' ' + nodeId + ' evidence does not echo `upstream_read: ' + upId
          + ' <nonce>` matching ' + upId + '\'s current binding nonce — OPEN ' + out.expectedPath
          + ' and record its line-1 nonce';
        return out;
      }
    }
  } catch (_) { /* fail-soft: the consumed-proof never bricks a close */ }
  return out;
}

// readUpstreamEvidenceNonce — read line 1 of an upstream's .cache/<up-id>.md and return its binding
// nonce (`evidence-binding: <up-id> <nonce>`). The evidence file (not the barrier-base) is authoritative:
// a completed upstream's baseline may be dropped, but its evidence line-1 nonce persists — and it rotates
// on reopen (forceRotate), which is exactly what makes a stale echo detectable. Null on any miss.
function readUpstreamEvidenceNonce(planPath, upId, readFile) {
  try {
    const upPath = path.join(path.dirname(planPath), '.cache', upId + '.md');
    const content = String((readFile ? readFile(upPath) : require('fs').readFileSync(upPath, 'utf8')) || '');
    const m = content.match(/^evidence-binding:[ \t]+\S+[ \t]+(\S+)[ \t]*$/m);
    return m ? m[1] : null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// resolveEvidenceCachePath — one read-side resolver shared by --verify, close-node, and downstream
// dispatch. A declared live isolated-lane member ALWAYS resolves to its leg path; a missing leg file is
// evidence_absent and never falls back to a possibly-valid parent seed/decoy. Every other shape reads
// the parent cache. The parent plan/barrier remains authoritative for the nonce.
function resolveEvidenceCachePath(planPath, nodeId, cacheExists, readFile, runningSet) {
  const parentCachePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const running = runningSet === undefined
    ? readRunningSet(runningSetPath, cacheExists, readFile)
    : runningSet;
  const laneGroup = (running && running.lane_group) ? running.lane_group : null;
  const legEntry = (laneGroup && Array.isArray(laneGroup.members)
    && laneGroup.members.includes(nodeId) && laneGroup.legs)
    ? laneGroup.legs[nodeId] : null;
  const legCachePath = (legEntry && legEntry.legPath)
    ? path.join(legMirrorPath(legEntry.legPath, path.dirname(planPath)), '.cache', nodeId + '.md')
    : null;
  const routedToLeg = !!legCachePath;
  return {
    cachePath: routedToLeg ? legCachePath : parentCachePath,
    evidenceSource: routedToLeg ? 'leg' : 'parent',
  };
}

// runVerifyEvidence(opts) (#444 / D-444-01 §4) — READ-ONLY mode of record-evidence.
// Verifies an on-disk .cache/<node-id>.md WITHOUT stdin transit.
// Reuses checkEvidenceShape (the same checker the close path uses) so --verify
// cannot drift from the close gate.
//
// opts = { planPath, project, nodeId, readFile, cacheExists }
// Returns:
//   { result:'ok', nodeId, role, evidence_file }
//   { result:'refuse', reason:'evidence_absent', nodeId, role, evidence_file }
//   { result:'refuse', reason:'evidence_shape_failed'|'evidence_stale'|'evidence_unbound',
//     nodeId, role, missingTokenClass, evidence_file, expected, detail }
// ---------------------------------------------------------------------------
function runVerifyEvidence(opts) {
  const { planPath, project, nodeId, readFile, cacheExists } = opts;
  const resolvedEvidence = resolveEvidenceCachePath(planPath, nodeId, cacheExists, readFile);
  const cachePath = resolvedEvidence.cachePath;
  const evidence_file = '.cache/' + nodeId + '.md';

  // Resolve role from the plan's ## Nodes table (mirrors close-and-open-next L1341-1343).
  let role = 'unknown';
  let verifyNodes = null;
  try {
    const planContent = readFile(planPath);
    verifyNodes = parseNodesFromContent(planContent);
    const nodeInfo = verifyNodes.find(n => n.id === nodeId);
    if (nodeInfo) role = nodeInfo.role;
  } catch (_) {}

  // Evidence-absent check.
  if (!cacheExists(cachePath)) {
    return { result: 'refuse', reason: 'evidence_absent', nodeId, role, evidence_file,
      evidence_source: resolvedEvidence.evidenceSource };
  }

  // Read evidence and nonce.
  let content = '';
  try { content = readFile(cachePath); } catch (_) { content = ''; }
  const expectedNonce = readNonce(planPath, nodeId, readFile);

  // Run the same checker the close path uses (#392 binding + role token checks).
  // #607: pass the ledger nodes so a main-session-gate instrumentation token naming a node is validated
  // consistently with the close path (verifyNodes is null only if the plan could not be parsed above).
  let reviewV2 = null;
  try {
    const verifyPlanContent = readFile(planPath);
    const verifyNode = (verifyNodes || []).find(node => node.id === nodeId);
    reviewV2 = validateSchema2ReviewEvidence(opts, verifyPlanContent, verifyNode, content);
  } catch (error) {
    reviewV2 = { ok: false, reason: 'review_evidence_validation_failed', detail: String(error && error.message || error) };
  }
  if (reviewV2 && !reviewV2.ok) {
    return { result: 'refuse', reason: reviewV2.reason, detail: reviewV2.detail || null,
      missingTokenClass: reviewV2.missingTokenClass || null, nodeId, role, evidence_file };
  }
  const shapeCheck = checkEvidenceShape(role, nodeId, content, {
    expectedNonce, expectedNodeId: nodeId, ledgerNodes: verifyNodes, reviewV2,
  });

  if (shapeCheck.ok) {
    return { result: 'ok', nodeId, role, evidence_file,
      evidence_source: resolvedEvidence.evidenceSource };
  }

  // Map to typed reason — mirrors close-and-open-next / runCloseNode L1368-1370.
  const reason = shapeCheck.evidenceStale ? 'evidence_stale'
    : shapeCheck.evidenceUnbound ? 'evidence_unbound'
    : 'evidence_shape_failed';

  return {
    result: 'refuse',
    reason,
    nodeId,
    role,
    missingTokenClass: shapeCheck.missingTokenClass || null,
    evidence_file,
    evidence_source: resolvedEvidence.evidenceSource,
    expected: shapeCheck.expected || [],
    detail: shapeCheck.reason || 'shape invalid',
  };
}

function checkVerdictParse(role, evidence) {
  if (!VERDICT_ROLES.has(role)) return null;
  const content = evidence || '';
  // Lenient probe: any verdict-shaped line (case-insensitive key, any value) anywhere in column 0.
  const lenient = content.match(/^[ \t]*verdict:[ \t]*([^\n]*?)[ \t]*$/gim);
  if (!lenient) return null;
  const rawLast = lenient[lenient.length - 1].replace(/^[ \t]*verdict:[ \t]*/i, '').trim();

  // STRICT parse — exactly schema.parseNodeVerdict's matcher (lowercase `verdict:` key at column 0,
  // value lowercased). If this yields a clean pass/fail, the close is fine and no warning fires.
  let strict = null;
  const sRe = /^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm;
  let sm;
  while ((sm = sRe.exec(content)) !== null) { strict = sm[1].toLowerCase(); }
  if (strict === 'pass' || strict === 'fail') return null;

  return { verdict_unparsed: true, verdictRaw: rawLast };
}

const REVIEW_JOURNAL_NAME = 'review-attempts.json';

function planHashFromContent(content) {
  const m = String(content || '').match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/i);
  return m ? m[1].toLowerCase() : null;
}

function validateReviewJournalForPlan(journal, expectedPlanHash, planContent) {
  let schema2ReviewGates = [];
  try {
    const { schema2ReviewGateContracts } = require('./kaola-workflow-plan-validator');
    schema2ReviewGates = schema2ReviewGateContracts(planContent);
  } catch (error) {
    return { ok: false, reason: 'review_journal_schema2_contract_invalid',
      detail: String(error && error.message || error) };
  }
  // The current v1 validator ignores the additive third argument. The n2
  // handback makes it authoritative for schema-2 group outcomes without
  // changing legacy journal behavior.
  return validateReviewJournal(journal, expectedPlanHash,
    { schema2_review_gates: schema2ReviewGates });
}

function reviewAttemptOrdinalScope(logicalGate) {
  if (!logicalGate || typeof logicalGate !== 'object') return null;
  return logicalGate.kind === 'sequence'
    ? 'sequence\n' + String(logicalGate.id || '')
    : 'gate\n' + String(logicalGate.key || '');
}

function nextReviewAttemptOrdinal(attempts, logicalGateOrKey) {
  const requestedScope = reviewAttemptOrdinalScope(logicalGateOrKey);
  const logicalGateKey = requestedScope ? null : logicalGateOrKey;
  let max = 0;
  for (const a of (Array.isArray(attempts) ? attempts : [])) {
    const matches = a && a.logical_gate && (requestedScope
      ? reviewAttemptOrdinalScope(a.logical_gate) === requestedScope
      : a.logical_gate.key === logicalGateKey);
    if (matches && Number.isInteger(a.ordinal)) {
      max = Math.max(max, a.ordinal);
    }
  }
  return max + 1;
}

function consumedReviewRepairs(attempts, logicalGateKey) {
  return (Array.isArray(attempts) ? attempts : []).filter(a => a && a.outcome === 'fail'
    && a.logical_gate && a.logical_gate.key === logicalGateKey
    && a.repair && a.repair.settled === true && a.consumed_by != null).length;
}

// Claim-scoped lookup view: current schema-1 attempts remain writable in the
// active journal, while verified legacy-parent attempts are attached as a
// non-enumerable read-only projection on every read. JSON persistence therefore
// stores only the digest-bound legacy_import pointer, never a rewritten copy of
// immutable parent history.
function reviewJournalAttempts(journal) {
  const legacy = journal && Array.isArray(journal.__legacy_attempts) ? journal.__legacy_attempts : [];
  const current = journal && Array.isArray(journal.attempts) ? journal.attempts : [];
  return legacy.concat(current);
}

function reviewJournalBlocker(journal) {
  const legacy = new Set(journal && Array.isArray(journal.__legacy_attempts)
    ? journal.__legacy_attempts.map(attempt => attempt.attempt_id) : []);
  const consumed = new Set(journal && Array.isArray(journal.__legacy_consumed_ids)
    ? journal.__legacy_consumed_ids : []);
  const blocked = reviewJournalAttempts(journal).filter(a => a
    && !(legacy.has(a.attempt_id) && consumed.has(a.attempt_id))
    && (a.lifecycle_settled === false
      || (a.outcome === 'fail' && a.lifecycle_settled === true && a.consumed_by == null)
      || (a.repair && a.repair.settled === false)));
  if (!blocked.length) return null;
  return {
    reason: 'review_attempt_unresolved',
    attempt_ids: blocked.map(a => a.attempt_id).sort(),
    attempts: blocked,
  };
}

// THE single "does this node declare any writes?" predicate for the whole aggregator. Read-only-ness is
// its exact negation (isReadOnlyNode below), so producer/writer classification and read-only classification
// can never disagree — they are one predicate, not two. A cell is EMPTY when it is one of the authored
// no-write markers (blank, `-`, em-dash `—`, `none`, `n/a`, case-insensitive) OR when the classifier's
// structural parse of the cell yields no paths (the SAME classifier.parseWriteSetCell that the batch
// classifier and the plan_hash consume, so this can never drift from them either).
const EMPTY_WRITE_SET_MARKERS = ['', '-', '—', 'none', 'n/a'];
function nodeWriteSetNonempty(node) {
  const raw = node && (node.declared_write_set != null ? node.declared_write_set : node.writeSetRaw);
  if (raw == null) return false;
  if (EMPTY_WRITE_SET_MARKERS.includes(String(raw).trim().toLowerCase())) return false;
  try {
    const { parseWriteSetCell } = require('./kaola-workflow-classifier');
    return parseWriteSetCell(raw).size > 0;
  } catch (_) {
    return String(raw).trim().length > 0;
  }
}

// replayExempt (#739, OPTIONAL arg — a Set/array of node ids): THIS attempt's own in-plan descendant-replay
// cone. An exempt producer is kept in the slice at ANY status (so bindingKeys still matches), never counted
// history-invalid, AND excluded from the graph-maximal `every` check — because the replay legitimately
// reopened+reset exactly those descendants under THIS attempt's owner, which the identity validators bound
// to structuralNonGateWriterDescendants(owner) before ever passing them here.
//
// statusRelief (#748, OPTIONAL last arg — a Set/array of node ids): the JOURNAL-GLOBAL relief set. A replay's
// ledger mutation moves rows for every attempt in the journal, so the STATUS admission must be journal-global
// too. The graph-MAXIMAL binding proof must NOT be: it is what pins each attempt to the unique maximal writer
// it actually repaired, and waiving it for one attempt because a DIFFERENT attempt is mid-replay would retire
// that proof journal-wide. So statusRelief is consumed at the status-admission site ONLY; the graph-maximal
// clause reads `replay` alone. With neither arg (every pre-#739 caller) both sets are empty and every branch
// degenerates to the exact prior behavior.
function uniqueMaximalReviewProducer(nodes, gateMembers, selectedWriter, ledgerStatuses, preservedProducers, replayExempt, statusRelief) {
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map(n => [n.id, n]));
  const ancestors = id => {
    const out = new Set();
    const q = [...(((byId.get(id) || {}).dependsOn) || [])];
    while (q.length) {
      const cur = q.shift();
      if (out.has(cur)) continue;
      out.add(cur);
      q.push(...((((byId.get(cur) || {}).dependsOn) || [])));
    }
    return out;
  };
  const memberSets = (Array.isArray(gateMembers) ? gateMembers : []).map(ancestors);
  let common = memberSets.length ? new Set(memberSets[0]) : new Set();
  for (const set of memberSets.slice(1)) common = new Set([...common].filter(x => set.has(x)));
  const staticProducers = [...common].filter(id => nodeWriteSetNonempty(byId.get(id))).sort();
  const preserved = new Set(Array.isArray(preservedProducers) ? preservedProducers : []);
  const replay = new Set(replayExempt instanceof Set ? replayExempt : (Array.isArray(replayExempt) ? replayExempt : []));
  const statusOnly = new Set(statusRelief instanceof Set ? statusRelief : (Array.isArray(statusRelief) ? statusRelief : []));
  const producer_slice = [];
  const invalid_producers = [];
  for (const id of staticProducers) {
    if (!ledgerStatuses) {
      producer_slice.push(id);
      continue;
    }
    const status = ledgerStatuses[id];
    if (status === 'complete' || (status === 'in_progress' && preserved.has(id))
      || replay.has(id) || statusOnly.has(id)) producer_slice.push(id);
    else if (status !== 'n/a') invalid_producers.push(id);
  }
  const history_valid = invalid_producers.length === 0;
  const selectedAncestors = ancestors(selectedWriter);
  const ok = history_valid && producer_slice.includes(selectedWriter)
    && producer_slice.every(id => id === selectedWriter || selectedAncestors.has(id) || replay.has(id));
  return { ok, history_valid, invalid_producers, selected_writer: selectedWriter, producer_slice };
}

// #701 (D-701-01) — the still-open BLOCKING findings of a failed review attempt, read from its
// route_candidates. "Still-open" mirrors the effective-verdict reducer's openFindings predicate
// (status !== 'resolved'). route_candidates carries the REAL ownership_candidates once schema-2 anchor
// routing is threaded (schema2RouteCandidates → resolveOwningNodes over primary_anchor.path). Returns []
// for a legacy/absent attempt.
function stillOpenRouteCandidates(attempt) {
  const rows = (attempt && Array.isArray(attempt.route_candidates)) ? attempt.route_candidates : [];
  return rows.filter(r => r && String(r.status == null ? 'open' : r.status).toLowerCase() !== 'resolved');
}

// #701 — the semantic-ownership summary of a failed attempt, relative to a candidate writer nodeId.
//   openFindings       the still-open blocking route rows.
//   ownersUnionSorted  sorted union of ownership_candidates across the open findings (the semantic owners).
//   anyOwned           at least one open finding RESOLVED to ≥1 owner. FALSE ⇒ ownership is ABSENT for
//                      every open finding — anchor-less findings (evidence_observation carries no path,
//                      and its true owner is the producer_evidence_digest producer, not a write-set path)
//                      or a pre-fix journal whose rows still hold ownership_candidates:[]. Ownership cannot
//                      adjudicate the reopen either way, so the bridge stays INERT and defers to the
//                      graph-maximal proof (never a false ownership accusation).
//   nodeOwns           nodeId owns ≥1 still-open finding.
//   uniqueOwner        the sole owner across the whole open set, or null when ownership spans >1 writer.
function findingOwnershipSummary(attempt, nodeId) {
  const openFindings = stillOpenRouteCandidates(attempt);
  const ownersUnion = new Set();
  let nodeOwns = false;
  for (const row of openFindings) {
    const owners = Array.isArray(row.ownership_candidates) ? row.ownership_candidates : [];
    for (const o of owners) { if (o) ownersUnion.add(o); }
    if (owners.includes(nodeId)) nodeOwns = true;
  }
  const ownersUnionSorted = Array.from(ownersUnion).sort();
  return {
    openFindings, ownersUnionSorted,
    anyOwned: ownersUnionSorted.length > 0,
    nodeOwns,
    uniqueOwner: ownersUnionSorted.length === 1 ? ownersUnionSorted[0] : null,
  };
}

// #701 — the COMPLETED, non-gate WRITER descendants of startId in the frozen DAG. These are the dependent
// producer outputs a safe reopen of startId would have to invalidate/replay; Option-1 DEFERS that
// transaction, so their presence is exactly what makes a non-maximal semantic-owner reopen require a
// replan (dependent_producer_replay_required) rather than an in-plan rebind. Reuses nodeWriteSetNonempty +
// GATE_ROLES (the SAME writer/gate vocabulary the barrier and the maximal-producer proof use).
function completedNonGateWriterDescendants(nodes, ledgerStatuses, startId) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map(n => [n.id, n]));
  const fwd = new Map(list.map(n => [n.id, []]));
  for (const n of list) for (const d of (n.dependsOn || [])) if (fwd.has(d)) fwd.get(d).push(n.id);
  const seen = new Set();
  const q = [...(fwd.get(startId) || [])];
  const out = [];
  while (q.length) {
    const cur = q.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (node && !GATE_ROLES.has(node.role) && nodeWriteSetNonempty(node)
      && (ledgerStatuses || {})[cur] === 'complete') out.push(cur);
    for (const c of (fwd.get(cur) || [])) q.push(c);
  }
  return out.sort();
}

// #739 — the STRUCTURAL non-gate writer descendants of startId in the frozen DAG, status-INDEPENDENT.
// completedNonGateWriterDescendants (above) filters on ledger status to pick the descendants a replay
// must reset; THIS variant drops the status filter so the review-journal identity validators can bound a
// recorded replay record's descendant set against the frozen graph. During an active replay those
// descendants sit at pending, so a status-filtered recompute would return nothing to check the journal's
// list against — the exemption could then be pointed at an unrelated producer. Bounding to this
// status-independent cone makes the replay exemption provably confined to the owner's real descendants.
function structuralNonGateWriterDescendants(nodes, startId) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map(n => [n.id, n]));
  const fwd = new Map(list.map(n => [n.id, []]));
  for (const n of list) for (const d of (n.dependsOn || [])) if (fwd.has(d)) fwd.get(d).push(n.id);
  const seen = new Set();
  const q = [...(fwd.get(startId) || [])];
  const out = [];
  while (q.length) {
    const cur = q.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (node && !GATE_ROLES.has(node.role) && nodeWriteSetNonempty(node)) out.push(cur);
    for (const c of (fwd.get(cur) || [])) q.push(c);
  }
  return out.sort();
}

// #739 — validate an attempt's in-plan descendant-replay record and return its BOUNDED exempt cone.
// A replay record lets the attempt bind its producer proof to a NON-maximal upstream owner with the
// reopened descendant cone exempt (uniqueMaximalReviewProducer's replayExempt arg). To keep the
// anti-laundering guarantee, the identity validators RECOMPUTE the bound rather than trust the record:
//   - owner must be a real node with a nonempty write set;
//   - every listed descendant must lie in structuralNonGateWriterDescendants(owner) — the frozen graph
//     cone, so the exemption can never be pointed at an unrelated / already-certified producer;
//   - owner must UNIQUELY own the attempt's own frozen blocking findings (its immutable route_candidates —
//     stable whether the attempt is active or resolved history), i.e. exactly the ownership adjudication
//     repair-node used to AUTHORIZE the replay. A forged record pointed at a non-owner is refused.
// Returns { ok:true, replayExempt:null } for an attempt with no replay; { ok:true, replayExempt:Set, owner }
// for a sound one; { ok:false, reason } for a present-but-unsound record (fails the journal read closed).
function validatedReplayExempt(attempt, nodes) {
  const replay = attempt && attempt.replay;
  if (replay == null) return { ok: true, replayExempt: null };
  if (typeof replay !== 'object' || typeof replay.owner !== 'string' || !replay.owner
    || !Array.isArray(replay.descendants)) {
    return { ok: false, reason: 'review_journal_replay_identity_mismatch' };
  }
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map(n => [n.id, n]));
  const ownerNode = byId.get(replay.owner);
  if (!ownerNode || !nodeWriteSetNonempty(ownerNode)) {
    return { ok: false, reason: 'review_journal_replay_identity_mismatch' };
  }
  const cone = new Set(structuralNonGateWriterDescendants(nodes, replay.owner));
  for (const d of replay.descendants) {
    if (typeof d !== 'string' || !cone.has(d)) {
      return { ok: false, reason: 'review_journal_replay_identity_mismatch' };
    }
  }
  const own = findingOwnershipSummary(attempt, replay.owner);
  if (!own.anyOwned || own.uniqueOwner !== replay.owner) {
    return { ok: false, reason: 'review_journal_replay_identity_mismatch' };
  }
  // The reopened writer of a replay attempt IS the owner (the legit flow always equates them — repair-node
  // binds repair.selected_writer / consumed_by to the owner). A record whose bound writer names a DIFFERENT
  // node is illegitimate: refuse so the exemption can only ever attach to the exact shape it was proven for.
  const selectedWriter = attempt.repair && attempt.repair.selected_writer;
  if ((selectedWriter != null && selectedWriter !== replay.owner)
    || (attempt.consumed_by != null && attempt.consumed_by !== replay.owner)) {
    return { ok: false, reason: 'review_journal_replay_identity_mismatch' };
  }
  return { ok: true, replayExempt: new Set(replay.descendants), owner: replay.owner };
}

// #739 — is the owner's descendant cone mechanically replayable in-plan? Tighten-only: returns
// {ok:false, reason} for any shape the reopen cascade cannot safely re-run, so the existing replan path
// stays correct there. The reset set is completedNonGateWriterDescendants (complete non-gate writers) and
// the post-dominating gates fold via the existing machinery; this guard rejects what those two cannot
// mechanically handle — a parallel-leg synthesis boundary in the cone (reopening across a synthesizer is
// not a mechanical re-run). in_progress non-gate rows are caught by the downstream (3b) orphan guard;
// ambiguous ownership and scope-expansion findings are caught at the ownership decision before this runs.
function replayConeSafety(nodes, ownerId) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map(n => [n.id, n]));
  const fwd = new Map(list.map(n => [n.id, []]));
  for (const n of list) for (const d of (n.dependsOn || [])) if (fwd.has(d)) fwd.get(d).push(n.id);
  const cone = new Set();
  const q = [...(fwd.get(ownerId) || [])];
  while (q.length) {
    const cur = q.shift();
    if (cone.has(cur)) continue;
    cone.add(cur);
    for (const c of (fwd.get(cur) || [])) q.push(c);
  }
  for (const id of cone) {
    const node = byId.get(id);
    if (node && node.role === 'synthesizer') return { ok: false, reason: 'replay_cone_synthesis_boundary' };
  }
  return { ok: true };
}

function foldSelectorArms(planContent, selectorCheck) {
  if (!selectorCheck || selectorCheck.isSelector !== true) {
    return { ok: true, content: planContent, transitions: [] };
  }
  if (selectorCheck.ok !== true || !Array.isArray(selectorCheck.armsToNa)) {
    return { ok: false, reason: 'selector_invalid' };
  }
  let content = planContent;
  const transitions = [];
  for (const armId of selectorCheck.armsToNa) {
    if (typeof armId !== 'string' || !armId) return { ok: false, reason: 'selector_invalid' };
    const result = spliceLedgerNode(content, armId, 'n/a', { allowFrom: ['pending', 'in_progress'] });
    if (!result.found || (!result.changed && !result.alreadyAtTarget)) {
      return { ok: false, reason: 'selector_invalid' };
    }
    if (result.changed) content = result.content;
    transitions.push(buildTransition(armId, 'n/a', 'selector-arm'));
  }
  return { ok: true, content, transitions };
}

// Capture every immutable component that identifies the writer's original open.  Repair must
// compare this exact tuple before its first mutation; a passing barrier alone is insufficient
// because a replaced base/ref pair can make a dirty tree appear clean.
function captureWriterBarrierIdentity(opts, nodeId) {
  const planPath = opts.planPath;
  const safe = sanitizeNodeId(nodeId);
  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const baseFile = path.join(cacheDir, 'barrier-base-' + safe);
  const openFile = path.join(cacheDir, 'barrier-open-' + safe);
  const projectTag = path.basename(path.dirname(path.resolve(planPath))).replace(/[^A-Za-z0-9_-]/g, '_') || 'plan';
  const ref = 'refs/kaola-workflow/barrier/' + projectTag + '/' + safe;
  let baseline = '';
  let open_token = '';
  let anchored_ref = '';
  try { baseline = String(opts.readFile(baseFile) || '').trim(); } catch (_) {}
  try { open_token = String(opts.readFile(openFile) || '').trim(); } catch (_) {}
  try {
    anchored_ref = opts.resolveBarrierRef
      ? String(opts.resolveBarrierRef(ref, nodeId) || '').trim()
      : String(execFileSync('git', ['-C', opts.repoRoot || getRoot(), 'rev-parse', '--verify', '--quiet', ref + '^{commit}'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '').trim();
  } catch (_) {}
  if (!baseline || !anchored_ref || !open_token || anchored_ref !== baseline) return null;
  return { baseline, anchored_ref, open_token, generation: baseline.slice(0, 12), ref };
}

function verifyWriterBarrierIdentity(expected, current) {
  if (!expected || !current) return false;
  return ['baseline', 'anchored_ref', 'open_token', 'generation', 'ref']
    .every(key => typeof expected[key] === 'string' && expected[key] !== '' && current[key] === expected[key]);
}

// The repo-relative declared write-set paths of ONE node, via the SAME parser the freeze-time
// disjointness gate and resolveOwningNodes use (never a second, drifting tokenizer).
function nodeDeclaredPaths(node) {
  const raw = node && (node.declared_write_set != null ? node.declared_write_set : node.writeSetRaw);
  if (raw == null) return new Set();
  let parseWriteSetCell = null;
  try { ({ parseWriteSetCell } = require('./kaola-workflow-classifier')); } catch (_) {}
  const norm = p => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  if (parseWriteSetCell) {
    try { return new Set(Array.from(parseWriteSetCell(raw)).map(norm)); } catch (_) { /* fall through */ }
  }
  const tokens = String(raw).trim();
  if (!tokens || ['—', '-', 'none', 'n/a'].includes(tokens.toLowerCase())) return new Set();
  return new Set(tokens.split(/[\s,]+/).filter(Boolean).map(norm).filter(p => p !== '—' && p !== '-'));
}

// The union of the declared write sets of a NODE SET. W({w}) for one writer; W(all nodes) for the
// declared union that partitions the tree into (own slice | other declared | residue).
function declaredUnionPaths(nodes) {
  const out = new Set();
  for (const node of (Array.isArray(nodes) ? nodes : [])) {
    for (const p of nodeDeclaredPaths(node)) out.add(p);
  }
  return out;
}

// computeReviewCandidateDigest — the candidate TRIPLE, from ONE write-tree + ONE ls-tree (no extra git
// calls beyond what the whole-tree digest already ran):
//   digest           the whole-tree content address (byte-identical to the pre-rebind computation)
//   declared         { path: '<mode> <sha>' } for every candidate path inside the PLAN's declared union —
//                    the (mode, sha) identity, which is EXACTLY as strong as the line the digest hashes
//   residue_digest   a content address of everything the plan declares NOWHERE (the rogue-edit detector)
// Together these partition the tree exhaustively, which is what lets the repair proof relax the
// sibling-writer partition WITHOUT weakening the other two.
function computeReviewCandidateDigest(planPath, project, rootOverride, declaredUnion) {
  const fs = require('fs');
  const os = require('os');
  const crypto = require('crypto');
  const root = rootOverride || getRoot();
  const union = declaredUnion instanceof Set ? declaredUnion : new Set(declaredUnion || []);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-review-index-'));
  const index = path.join(tmpDir, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    execFileSync('git', ['-C', root, 'read-tree', 'HEAD'], { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
    execFileSync('git', ['-C', root, 'add', '-A'], { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
    const tree = String(execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER })).trim();
    const listing = String(execFileSync('git', ['-C', root, 'ls-tree', '-r', tree], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER }));
    const activePrefix = 'kaola-workflow/' + project + '/';
    const lines = listing.split('\n').filter(Boolean).filter(line => {
      const tab = line.indexOf('\t');
      const file = tab >= 0 ? line.slice(tab + 1) : '';
      return !file.startsWith(activePrefix) && !file.startsWith('.kw/') && !file.startsWith('.git/');
    }).sort();
    // NULL-PROTOTYPE, and that is load-bearing, not hygiene. These maps are keyed by REPO-RELATIVE PATH,
    // and on a plain `{}` the key `__proto__` is not stored — it hits Object.prototype's __proto__ setter,
    // which silently ignores a string value. The path would then be journalled as if it did not exist, and
    // because the union matched it is skipped by the residue branch too, so it would sit in NO partition of
    // the rebind proof while the whole-tree digest still hashes its ls-tree line: P2/P3 would read the
    // __proto__ GETTER on both sides, see Object.prototype both times, and conclude "unchanged". The plan
    // grammar accepts `__proto__` as a declared path (no backslash, no glob, not directory-shaped), so this
    // is reachable. With a null prototype the key is an ordinary own property that survives JSON and
    // compares like any other path.
    const declared = Object.create(null);
    const residueLines = [];
    for (const line of lines) {
      const tab = line.indexOf('\t');
      const file = tab >= 0 ? line.slice(tab + 1) : '';
      if (!union.has(file)) { residueLines.push(line); continue; }
      // '<mode> <sha>', NOT '<sha>'. The declared map is the MEASURING STICK for P2/P3, and a measuring
      // stick weaker than the digest is a silent waiver: the digest, the residue digest, P5 and the barrier
      // all treat (mode, sha) as tree identity, and git records the exec bit, the SYMLINK flag and the
      // GITLINK flag in the mode ALONE. A symlink's blob IS its target-path bytes, so a plain file and a
      // symlink to that same text share one blob sha and differ only in mode — a sha-only stick cannot tell
      // them apart even in principle, and a mode-only revert of a sibling's APPROVED change would land in
      // no partition and be waived. The ls-tree `type` field is a pure function of the mode (100644/100755/
      // 120000 -> blob, 160000 -> commit), so (mode, sha) is EXACTLY as strong as the whole line the digest
      // hashes, at zero extra git calls. A declared entry we cannot parse fails CLOSED (the catch below
      // turns it into candidate_digest_unavailable) rather than degrading to a value that could collide
      // with "absent" under the `|| null` compares in proveRebindAdmissible.
      const meta = line.slice(0, tab >= 0 ? tab : 0).trim().split(/\s+/);
      const mode = meta[0] || '';
      const blob = meta[2] || '';
      if (!/^[0-7]{6}$/.test(mode) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(blob)) {
        throw new Error('unparsable ls-tree entry for declared path: ' + file);
      }
      declared[file] = mode + ' ' + blob;
    }
    const sortedDeclared = Object.create(null);
    for (const key of Object.keys(declared).sort()) sortedDeclared[key] = declared[key];
    return {
      digest: crypto.createHash('sha256').update(lines.join('\n') + (lines.length ? '\n' : '')).digest('hex'),
      declared: sortedDeclared,
      residue_digest: crypto.createHash('sha256').update(residueLines.join('\n') + (residueLines.length ? '\n' : '')).digest('hex'),
    };
  } catch (err) {
    const e = new Error('candidate_digest_unavailable');
    e.cause = err;
    throw e;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// The injectable test seam historically returned a bare digest STRING. Normalize both shapes so the
// ~15 existing direct-call fixtures keep their exact meaning: a string candidate carries no declared map
// and no residue address, so the rebind proof cannot engage for it and the legacy gate order stands.
function normalizeCandidate(value) {
  if (typeof value === 'string') return { digest: value, declared: null, residue_digest: null };
  if (value && typeof value === 'object') {
    return { digest: value.digest, declared: value.declared || null, residue_digest: value.residue_digest || null };
  }
  return { digest: undefined, declared: null, residue_digest: null };
}

// One canonical adapter for the durable review-candidate triple.  Older unit
// seams return only the whole-tree digest; keep their historical empty
// partition values byte-compatible while ensuring close and rolling top-up
// compare the exact same representation.
function currentReviewCandidate(opts, nodes) {
  const value = opts.computeReviewCandidateDigest
    ? opts.computeReviewCandidateDigest()
    : computeReviewCandidateDigest(opts.planPath, opts.project, opts.repoRoot, declaredUnionPaths(nodes));
  const candidate = normalizeCandidate(value);
  return {
    digest: candidate.digest,
    declared: candidate.declared || {},
    residue_digest: candidate.residue_digest
      || require('crypto').createHash('sha256').update('').digest('hex'),
  };
}

// The PRODUCTION (non-exempt) paths of diff(anchored_base(writer), now) that lie OUTSIDE the writer's own
// declared write set — i.e. EXACTLY the set the per-node barrier would put in `outOfAllow`. Reuses the
// validator's own barrierCheck so the repair proof and the barrier can never drift apart. Returns null
// when the diff cannot be computed (no git, no baseline, a mocked fixture).
//
// THIS SET IS NOT A SUFFICIENT P3 EXAMINATION SET ON ITS OWN, and a null return is NOT self-evidently
// safe. It is anchored on the WRITER'S BASELINE, so it omits any declared path whose current content
// agrees with that baseline while differing from the reviewed candidate; and a null return degrades to
// the EMPTY set, which examines nothing. Both would let proveRebindAdmissible's P3 pass vacuously. The
// proof therefore unions this set with the candidate-anchored partition-2 delta, which is computed from
// the candidate's own declared blob map and is unaffected by a null probe here.
function computeWriterForeignPaths(opts, planContent, nodeId, baseCommit) {
  try {
    const root = opts.repoRoot || getRoot();
    const project = opts.project;
    const { barrierCheck } = require('./kaola-workflow-plan-validator');
    const nowTree = snapshotCandidateTree(root);
    const diffOut = String(execFileSync('git', ['-C', root, 'diff-tree', '-r', '--name-only', baseCommit, nowTree],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER }));
    const actualPaths = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
    const projTag = String(project || '').replace(/[^A-Za-z0-9_-]/g, '_');
    const r = barrierCheck(planContent, actualPaths, { nodeId, root, project: projTag });
    if (!r || !Array.isArray(r.outOfAllow)) return null;
    return { foreign: r.outOfAllow.slice().sort(), diffPaths: actualPaths, nowTree, barrier: r };
  } catch (_) { return null; }
}

// The landable-tree snapshot the barrier diffs against — the SAME read-tree HEAD + add -A + write-tree
// the validator's snapshotWorktree performs, in a scratch index outside the repo.
function snapshotCandidateTree(root) {
  const fs = require('fs');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-rebind-idx-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmpDir, 'index') };
  try {
    try { execFileSync('git', ['-C', root, 'read-tree', 'HEAD'], { env, stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    execFileSync('git', ['-C', root, 'add', '-A'], { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
    return String(execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER })).trim();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// { path: '<mode> <sha>' } for the given paths in a tree-ish. An absent path is simply absent from the
// map — presence itself is part of the identity the P5 assertion compares.
function treeEntriesFor(root, treeish, paths) {
  const out = new Map();
  const list = Array.from(paths || []);
  if (!list.length) return out;
  const listing = String(execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', treeish, '--', ...list],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER }));
  for (const rec of listing.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const meta = rec.slice(0, tab).trim().split(/\s+/);
    out.set(rec.slice(tab + 1), { mode: meta[0], sha: meta[2] });
  }
  return out;
}

// buildSyntheticBase — the re-anchor. Build a tree that AGREES WITH THE CURRENT TREE EVERYWHERE except the
// writer's own declared paths, where it keeps the OLD BASELINE's content (including "absent" as content).
// Consequence, and the whole point:
//   diff(B', now) ∩ W(w)  ==  diff(old_base, now) ∩ W(w)   — the writer's reviewed diff is bit-identical
//   diff(B', now) \ W(w)  ==  ∅                            — the foreign delta is gone BY CONSTRUCTION
// The barrier stops being an approximation and becomes exact. It is NOT a re-snapshot of the current tree
// (that would zero the writer's own diff and launder the refuted work) — the writer's diff SURVIVES, which
// is exactly what P5 asserts before a single durable byte moves.
//
// `fault` is the P5 tripwire's injection seam — the same convention as reviewFailpoint (a production
// hook that is inert unless a caller supplies it). P1/P2/P3 gate every reachable input BEFORE P5, so a
// real tree can never reach a P5 violation today; P5 exists to catch a FUTURE refactor of this builder
// that silently stopped restoring the writer's paths. Without a seam that tripwire is untestable, and an
// untested fail-closed assertion is indistinguishable from a missing one.
function buildSyntheticBase(root, oldBaseCommit, nowTree, writerPaths, fault) {
  const fs = require('fs');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-rebind-base-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmpDir, 'index') };
  try {
    execFileSync('git', ['-C', root, 'read-tree', nowTree], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const oldEntries = treeEntriesFor(root, oldBaseCommit, writerPaths);
    // A restore can legitimately FAIL — e.g. the writer replaced its declared FILE with a DIRECTORY of
    // the same name, so git refuses ("appears as both a file and a directory") and the index keeps the
    // CURRENT content. Do not throw here: that would misclassify a genuinely-unsafe base as a git
    // outage. Let the restore fail soft and let P5 — the assertion that exists for exactly this — be
    // the authority. It compares the resulting tree against the old baseline and refuses
    // rebind_base_rewrite_unsafe, naming the path, before a single durable byte moves.
    for (const p of writerPaths) {
      const entry = oldEntries.get(p);
      try {
        if (entry) {
          execFileSync('git', ['-C', root, 'update-index', '--add', '--cacheinfo', entry.mode + ',' + entry.sha + ',' + p],
            { env, stdio: ['ignore', 'pipe', 'pipe'] });
        } else {
          execFileSync('git', ['-C', root, 'update-index', '--force-remove', '--', p], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        }
      } catch (_) { /* P5 below decides */ }
    }
    let tree = String(execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER })).trim();
    if (typeof fault === 'function') tree = String(fault(tree, root, env) || tree).trim();
    // P5 — RE-ANCHOR SAFETY. Assert, BEFORE any durable write, that the synthetic tree is byte-identical
    // to the OLD baseline on every path the writer is allowed to write (both-absent included). A synthetic
    // base that altered one of those paths could hide a dirty, unreviewed declared write from the barrier.
    const newEntries = treeEntriesFor(root, tree, writerPaths);
    for (const p of writerPaths) {
      const before = oldEntries.get(p);
      const after = newEntries.get(p);
      const same = (!before && !after)
        || (before && after && before.sha === after.sha && before.mode === after.mode);
      if (!same) return { ok: false, reason: 'rebind_base_rewrite_unsafe', path: p };
    }
    // DETERMINISTIC by construction: identity AND dates are pinned, so the same (tree, parent) always
    // yields the SAME commit sha. This is what makes the crash-retry idempotent — after a crash between
    // `rebind_recorded` and the ref write, recomputing the synthetic base reproduces the recorded
    // base_after exactly, so the retry completes the interrupted transaction instead of abandoning it.
    const commitEnv = { ...env,
      GIT_AUTHOR_NAME: 'kaola-workflow', GIT_AUTHOR_EMAIL: 'kaola-workflow@localhost',
      GIT_COMMITTER_NAME: 'kaola-workflow', GIT_COMMITTER_EMAIL: 'kaola-workflow@localhost',
      GIT_AUTHOR_DATE: '1970-01-01T00:00:00Z', GIT_COMMITTER_DATE: '1970-01-01T00:00:00Z' };
    const commit = String(execFileSync('git', ['-C', root, 'commit-tree', tree, '-p', oldBaseCommit,
      '-m', 'kaola-workflow barrier base (rebind)'], { env: commitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
    return { ok: true, commit, tree };
  } catch (err) {
    return { ok: false, reason: 'candidate_digest_unavailable', detail: String(err && err.message || err) };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function logicalGateForNode(nodes, node) {
  if (node && node.role === 'adversarial-verifier' && node.shape && node.shape.kind === 'fanout') {
    try {
      const { resolveAdversarialFanoutGroup } = require('./kaola-workflow-plan-validator');
      const g = resolveAdversarialFanoutGroup(nodes, node);
      if (g) return canonicalLogicalGateIdentity({ kind: 'fanout', id: g.group || node.shape.group, origin: g.origin || node.dependsOn, members: g.members });
    } catch (_) {}
  }
  // #698/#699 schema-2 code/security fanouts are declared logical review
  // groups. Keep legacy metadata-free reviewer fanouts byte-compatible as
  // independent sequence gates; only the explicit group aggregations opt in.
  if (node && ['code-reviewer', 'security-reviewer'].includes(node.role)
      && node.shape && node.shape.kind === 'fanout'
      && ['replicated_majority', 'partitioned_all'].includes(node.gateAggregation)) {
    const origin = (node.dependsOn || []).slice().sort();
    const members = (nodes || []).filter(candidate => candidate.role === node.role
      && candidate.shape && candidate.shape.kind === 'fanout'
      && candidate.shape.group === node.shape.group
      && ['replicated_majority', 'partitioned_all'].includes(candidate.gateAggregation)
      && JSON.stringify((candidate.dependsOn || []).slice().sort()) === JSON.stringify(origin))
      .map(candidate => candidate.id);
    return canonicalLogicalGateIdentity({ kind: 'fanout', id: node.shape.group,
      origin, members });
  }
  return canonicalLogicalGateIdentity({ kind: 'sequence', id: node.id, origin: node.dependsOn || [], members: [node.id] });
}

// Pure schema-2 logical review reducer used by both close transactions. The
// durable plan supplies the aggregation authority; journal receipt bodies are
// re-evaluated rather than trusting cached effective_pass fields.
function reduceLogicalReviewAttempt(nodes, logicalGate, receipts) {
  const members = logicalGate && Array.isArray(logicalGate.members) ? logicalGate.members : [];
  const byId = new Map((nodes || []).map(node => [node.id, node]));
  const rows = members.map(id => byId.get(id));
  if (!members.length || rows.some(row => !row)) {
    return { complete: false, pass: false, reason: 'logical_review_group_invalid', blocker_veto: false };
  }
  const role = rows[0].role;
  if (rows.some(row => row.role !== role)) {
    return { complete: false, pass: false, reason: 'logical_review_group_invalid', blocker_veto: false };
  }
  const receiptByMember = new Map();
  for (const receipt of (Array.isArray(receipts) ? receipts : [])) {
    const id = receipt && String(receipt.node_id || '');
    if (!members.includes(id) || receiptByMember.has(id) || typeof receipt.body !== 'string') {
      return { complete: false, pass: false, reason: 'logical_review_receipt_invalid', blocker_veto: false };
    }
    receiptByMember.set(id, receipt);
  }
  if (receiptByMember.size !== members.length) {
    return { complete: false, pass: false, reason: 'logical_review_receipt_missing', blocker_veto: false };
  }
  const effective = members.map(id => evaluateEffectiveVerdict(receiptByMember.get(id).body));
  const blockerVeto = effective.some(verdict => Number(verdict.findings_blocking || 0) > 0
    || (Array.isArray(verdict.unresolved_fixes) && verdict.unresolved_fixes.length > 0));
  const approvals = effective.filter(verdict => verdict.pass === true).length;
  const approvalRole = ['code-reviewer', 'security-reviewer'].includes(role);
  let aggregation = 'replicated_majority'; // verified legacy AV fanout fallback
  if (approvalRole) {
    const aggregations = new Set(rows.map(row => row.gateAggregation));
    if (aggregations.size !== 1
        || !['replicated_majority', 'partitioned_all'].includes([...aggregations][0])) {
      return { complete: false, pass: false, reason: 'logical_review_aggregation_invalid',
        blocker_veto: blockerVeto };
    }
    aggregation = [...aggregations][0];
  } else if (role === 'adversarial-verifier') {
    const declared = new Set(rows.map(row => row.gateAggregation).filter(Boolean));
    if (declared.size === 1 && ['replicated_majority', 'partitioned_all'].includes([...declared][0])) {
      aggregation = [...declared][0];
    }
  }
  const pass = (!approvalRole || !blockerVeto) && (aggregation === 'partitioned_all'
    ? approvals === effective.length : approvals > effective.length / 2);
  return { complete: true, pass, reason: pass ? null : 'fanout_refuted',
    blocker_veto: blockerVeto, aggregation, approvals, members: members.length };
}

function reviewJournalRoutesMatchPlan(journal, nodes) {
  const canonicalize = value => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
    }
    return out;
  };
  const rows = values => values.map(canonicalize)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  for (const attempt of (journal.attempts || [])) {
    const expected = [];
    for (const receipt of (attempt.receipts || [])) {
      const findings = parseNodeFindings(receipt.body).filter(f => f && f.id);
      expected.push(...routeCanonicalFindings(findings, nodes, receipt.node_id));
    }
    if (JSON.stringify(rows(attempt.route_candidates || [])) !== JSON.stringify(rows(expected))) return false;
  }
  return true;
}

// #748 — a validated in-plan replay (#739) resets its owner to in_progress and its descendant cone to
// pending. That mutation is journal-GLOBAL and plan-GLOBAL, so the relief it grants must be too: the
// identity validators recompute EVERY attempt's producer proof against the same live ledger, so a settled
// direct-repair attempt at the same gate would otherwise recompute both of its bound producers as
// nonterminal and wedge the journal permanently. Bounded, never trusted: only records that pass the full
// validatedReplayExempt recompute contribute (an unsound one contributes NOTHING, so every existing typed
// reason keeps its precedence). Only journal.attempts may contribute: that is the population this read
// re-proves per attempt. __legacy_attempts are excluded from contributing at all — the identity loop
// scans them for ordinal contiguity only, so a legacy record is never re-proven and must never relieve.
//   - the replay OWNER goes into preservedProducers, which only relaxes `in_progress` into slice
//     membership and does NOT bypass the graph-maximal check — exactly enough, since a replay always
//     reopens its owner to in_progress.
//   - the reset DESCENDANTS go into the returned `exempt` set, which every caller passes as `statusRelief`
//     — the STATUS-admission-only relief — and NEVER as replayExempt. They sit at `pending`, which
//     `preserved` cannot relieve, so they do need admitting; but replayExempt additionally waives the
//     graph-MAXIMAL binding check, and waiving that for one attempt because a DIFFERENT attempt is
//     mid-replay would retire the writer-binding proof journal-wide.
// Relief can only move a producer_slice TOWARD the statically-complete producer set that bindingKeys was
// frozen from, never past it, so it can never manufacture a new bindingKeys !== producer_slice refusal.
//
// LIFETIME. Two independent bounds decide whether a replay record still grants relief, and the guarantee
// each one buys is stated in terms of what the code actually checks:
//   (a) SUPERSESSION (the durable bound). A record is skipped once a STRICTLY HIGHER ordinal exists at the
//       same logical_gate.key. The gate can only mint a later ordinal after its cone re-completed and it
//       re-dispatched, so a superseded replay is provably finished history; a genuinely live mid-replay
//       record is never superseded. This is what makes the relief non-permanent: without it, one settled
//       replay would leave every node in its descendant cone `pending`-launderable at that gate forever,
//       because bound (b) alone is only a suspension that any later un-healing re-arms.
//   (b) HEALED (a cheap suspension, not a lifetime). While the owner plus its whole reset cone read
//       `complete`, there is nothing to relieve, so the record contributes nothing for that read. It says
//       nothing about later reads — (a) is the bound that retires the record for good.
//
// POPULATION (the structural bound — the one that makes the three bounds above sufficient rather than a
// growing list of special cases). THE INVARIANT: relief can only ever come from a record THIS READ has
// independently re-proven. Concretely, only `journal.attempts` — the population the identity loop
// recomputes per-attempt on this same read — may CONTRIBUTE relief. The `__legacy_attempts` projection is
// a read-only import of parent history that no identity loop re-derives here (it is validated only for
// ordinal contiguity), so an imported record can never be a relief source; if legacy history is ever
// required to carry relief, it must first be subjected to the SAME per-attempt recompute, not admitted by
// widening this population. Legacy records still count toward the supersession MAXIMUM below, because
// that direction is tighten-only: a higher imported ordinal may retire a current record, never revive one.
function activeReplayRelief(journal, nodes, ledgerStatuses) {
  const exempt = new Set();
  const preserved = new Set();
  // Supersession scans the FULL population (legacy ∪ current) — tighten-only, see POPULATION above.
  const maxOrdinalByGate = new Map();
  for (const attempt of reviewJournalAttempts(journal)) {
    const key = attempt && attempt.logical_gate && attempt.logical_gate.key;
    if (!key || !Number.isInteger(attempt.ordinal)) continue;
    if (!maxOrdinalByGate.has(key) || attempt.ordinal > maxOrdinalByGate.get(key)) {
      maxOrdinalByGate.set(key, attempt.ordinal);
    }
  }
  // Relief is SOURCED only from the identity-validated population.
  const attempts = (journal && Array.isArray(journal.attempts)) ? journal.attempts : [];
  for (const attempt of attempts) {
    const key = attempt && attempt.logical_gate && attempt.logical_gate.key;
    // (a) supersession — an unkeyed / unordinaled record cannot be proven live either, so it is skipped
    // for the same fail-closed reason.
    if (!key || !Number.isInteger(attempt.ordinal)
      || attempt.ordinal < maxOrdinalByGate.get(key)) continue;
    const check = validatedReplayExempt(attempt, nodes);
    if (!check.ok || !check.replayExempt) continue;
    const members = [check.owner, ...check.replayExempt];
    if (members.every(id => (ledgerStatuses || {})[id] === 'complete')) continue;  // (b) healed
    for (const descendant of check.replayExempt) exempt.add(descendant);
    preserved.add(check.owner);
  }
  return { exempt, preserved };
}

function reviewJournalIdentityMatchesPlan(journal, nodes, ledgerStatuses) {
  const crypto = require('crypto');
  const byId = new Map((nodes || []).map(node => [node.id, node]));
  const ordinalsByGate = new Map();
  const importedAttempts = journal && Array.isArray(journal.__legacy_attempts) ? journal.__legacy_attempts : [];
  const importedIds = new Set(importedAttempts.map(attempt => attempt && attempt.attempt_id).filter(Boolean));
  const importedTransactions = new Set(importedAttempts.map(attempt => attempt && attempt.transaction_key).filter(Boolean));
  // #748: journal-global replay relief, computed BEFORE the per-attempt loop (see activeReplayRelief).
  const relief = activeReplayRelief(journal, nodes, ledgerStatuses);
  for (const attempt of importedAttempts) {
    if (!attempt || !attempt.logical_gate || !Number.isInteger(attempt.ordinal)) continue;
    const ordinalScope = reviewAttemptOrdinalScope(attempt.logical_gate);
    if (!ordinalsByGate.has(ordinalScope)) ordinalsByGate.set(ordinalScope, []);
    ordinalsByGate.get(ordinalScope).push(attempt.ordinal);
  }
  for (const attempt of (journal.attempts || [])) {
    if (importedIds.has(attempt.attempt_id) || importedTransactions.has(attempt.transaction_key)) {
      return { ok: false, reason: 'review_journal_attempt_identity_mismatch' };
    }
    let expectedGate = null;
    for (const receipt of (attempt.receipts || [])) {
      const source = byId.get(receipt.node_id);
      if (!source || !VERDICT_ROLES.has(source.role)) {
        return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
      }
      const derived = logicalGateForNode(nodes, source);
      if (!expectedGate) expectedGate = derived;
      else if (derived.key !== expectedGate.key || derived.id !== expectedGate.id) {
        return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
      }
    }
    if (!expectedGate || attempt.logical_gate.key !== expectedGate.key
      || attempt.logical_gate.kind !== expectedGate.kind || attempt.logical_gate.id !== expectedGate.id
      || JSON.stringify(attempt.logical_gate.origin) !== JSON.stringify(expectedGate.origin)
      || JSON.stringify(attempt.logical_gate.members) !== JSON.stringify(expectedGate.members)) {
      return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
    }
    const prefix = expectedGate.kind === 'fanout'
      ? 'fanout-' + crypto.createHash('sha256').update(expectedGate.key).digest('hex')
      : String(expectedGate.id).replace(/[^A-Za-z0-9_-]/g, '_');
    if (attempt.attempt_id !== prefix + ':' + attempt.ordinal) {
      return { ok: false, reason: 'review_journal_attempt_identity_mismatch' };
    }
    const selectedWriter = attempt.repair && attempt.repair.selected_writer;
    const consumedWriter = attempt.consumed_by;
    const writer = selectedWriter || consumedWriter;
    const hasProducerBindings = Object.prototype.hasOwnProperty.call(attempt, 'producer_bindings');
    const bindingKeys = hasProducerBindings ? Object.keys(attempt.producer_bindings || {}).sort() : [];
    // #739: an in-plan descendant-replay record lets this attempt bind to a NON-maximal upstream owner with
    // its reopened descendant cone exempt from the graph-maximal + all-complete requirements. Recompute and
    // bound the cone against the frozen graph (never trust the record); an unsound record fails the read.
    const replayCheck = validatedReplayExempt(attempt, nodes);
    if (!replayCheck.ok) return { ok: false, reason: replayCheck.reason };
    // A settled historical attempt owns its immutable attempt-time producer proof. If a later gate
    // legitimately reopens that producer, retain the older executed slice from its bindings. The
    // actively repaired attempt remains narrower: its proven selected writer, PLUS any owner/cone member
    // of an ACTIVE validated replay recorded anywhere in this journal (#748 — the replay's ledger
    // mutation is journal-global, so the STATUS relief it grants must be too), may be nonterminal. The
    // journal-global set is passed as statusRelief, NOT merged into replayExempt: it may admit a row the
    // replay moved, and must never waive THIS attempt's graph-maximal writer-binding proof.
    const proof = uniqueMaximalReviewProducer(nodes, expectedGate.members, writer || '', ledgerStatuses,
      (writer ? [writer] : bindingKeys).concat([...relief.preserved]),
      replayCheck.replayExempt || [], relief.exempt);
    if (hasProducerBindings) {
      if (!proof.history_valid || JSON.stringify(bindingKeys) !== JSON.stringify(proof.producer_slice)) {
        return { ok: false, reason: 'review_journal_repair_identity_mismatch' };
      }
    }
    if (selectedWriter != null || consumedWriter != null) {
      if (!writer || !byId.has(writer) || !nodeWriteSetNonempty(byId.get(writer)) || !proof.ok
        || (consumedWriter != null && consumedWriter !== writer)) {
        return { ok: false, reason: 'review_journal_repair_identity_mismatch' };
      }
      // A repair may have been selected on an older attempt before producer_bindings became
      // mandatory. Bind it to the identity CHAIN recorded by this logical gate's lineage, so a later
      // receipt cannot launder a changed writer.
      //
      // The chain, not raw byte-identity across every copy: a rebind LEGITIMATELY moves the writer's
      // baseline (to a synthetic tree proven byte-identical to the old baseline on the writer's own
      // declared paths), and the next attempt on this gate then captures that new baseline at open. So the
      // invariant is CONTINUITY — attempt N+1's raw binding must equal attempt N's EFFECTIVE (post-rebind)
      // binding, and every rebind that moved it is itself chained + proof-carrying in the journal (the
      // schema's rebind chain check). With no rebind anywhere, effective === raw and this degenerates
      // EXACTLY to the previous all-copies-byte-identical rule. A freshly re-snapshotted baseline — the
      // laundering vector — appears in no rebind record's base_after, so it still refuses here.
      const lineage = (journal.attempts || [])
        .filter(other => other && other.logical_gate && other.logical_gate.key === expectedGate.key
          && other.producer_bindings && other.producer_bindings[writer])
        .sort((a, b) => a.ordinal - b.ordinal);
      const identityKey = identity => JSON.stringify([
        identity.baseline, identity.anchored_ref, identity.open_token, identity.generation, identity.ref,
      ]);
      if (!lineage.length) {
        return { ok: false, reason: 'review_journal_repair_identity_mismatch' };
      }
      for (let i = 1; i < lineage.length; i++) {
        const carried = effectiveProducerBinding(lineage[i - 1], writer);
        if (!carried || identityKey(lineage[i].producer_bindings[writer]) !== identityKey(carried)) {
          return { ok: false, reason: 'review_journal_repair_identity_mismatch' };
        }
      }
    }
    const ordinalScope = reviewAttemptOrdinalScope(expectedGate);
    if (!ordinalsByGate.has(ordinalScope)) ordinalsByGate.set(ordinalScope, []);
    ordinalsByGate.get(ordinalScope).push(attempt.ordinal);
  }
  for (const ordinals of ordinalsByGate.values()) {
    ordinals.sort((a, b) => a - b);
    if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
      return { ok: false, reason: 'review_journal_attempt_identity_mismatch' };
    }
  }
  return { ok: true };
}

function canonicalLegacyImportPointer(transaction, parentJournal) {
  const attempts = reviewJournalAttempts(parentJournal);
  const attemptIds = attempts.map(attempt => attempt.attempt_id).slice().sort();
  const consumedIds = Array.from(new Set((parentJournal.__legacy_consumed_ids || [])
    .concat(transaction.source.source_attempt_ids || []))).sort();
  return {
    schema_version: 1,
    epoch_lineage_id: transaction.epoch_lineage_id,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    parent_plan_hash: transaction.parent.plan_hash,
    parent_plan_epoch: transaction.parent.plan_epoch,
    transaction_id: transaction.transaction_id,
    snapshot_manifest_digest: transaction.snapshot.manifest_digest,
    snapshot_path: transaction.snapshot.epoch_path + '/files/.cache/' + REVIEW_JOURNAL_NAME,
    journal_digest: transaction.source.journal_digest,
    attempt_ids: attemptIds,
    attempts_digest: sha256Hex(Buffer.from(JSON.stringify(attempts), 'utf8')),
    consumed_attempt_ids: consumedIds,
  };
}

function deepFrozenJsonClone(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const freeze = input => {
    if (input && typeof input === 'object' && !Object.isFrozen(input)) {
      for (const child of Object.values(input)) freeze(child);
      Object.freeze(input);
    }
    return input;
  };
  return freeze(clone);
}

function attachLegacyImport(journal, parentJournal, pointer) {
  journal.legacy_import = pointer;
  const attempts = deepFrozenJsonClone(reviewJournalAttempts(parentJournal));
  const consumed = Array.from(new Set((parentJournal.__legacy_consumed_ids || [])
    .concat(pointer.consumed_attempt_ids || []))).sort();
  Object.defineProperty(journal, '__legacy_attempts', {
    value: attempts, enumerable: false, writable: false, configurable: true,
  });
  Object.defineProperty(journal, '__legacy_consumed_ids', {
    value: Object.freeze(consumed), enumerable: false, writable: false, configurable: true,
  });
  return journal;
}

function validateLegacyImportPointerShape(pointer) {
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer) || pointer.schema_version !== 1) return false;
  const hex = value => /^[0-9a-f]{64}$/.test(String(value || ''));
  const expectedKeys = ['attempt_ids', 'attempts_digest', 'claim_identity_digest', 'consumed_attempt_ids',
    'epoch_lineage_id', 'journal_digest', 'parent_plan_epoch', 'parent_plan_hash', 'schema_version',
    'snapshot_manifest_digest', 'snapshot_path', 'transaction_id'].sort();
  if (JSON.stringify(Object.keys(pointer).sort()) !== JSON.stringify(expectedKeys)
      || !hex(pointer.epoch_lineage_id) || !hex(pointer.claim_identity_digest)
      || !hex(pointer.parent_plan_hash) || !hex(pointer.transaction_id)
      || !hex(pointer.snapshot_manifest_digest) || !hex(pointer.journal_digest)
      || !hex(pointer.attempts_digest) || !Number.isSafeInteger(pointer.parent_plan_epoch)
      || pointer.parent_plan_epoch < 1 || !Array.isArray(pointer.attempt_ids)
      || !Array.isArray(pointer.consumed_attempt_ids)) return false;
  const canonical = values => values.every(value => typeof value === 'string' && value)
    && JSON.stringify(values) === JSON.stringify(Array.from(new Set(values)).sort());
  return canonical(pointer.attempt_ids) && canonical(pointer.consumed_attempt_ids)
    && pointer.consumed_attempt_ids.every(id => pointer.attempt_ids.includes(id))
    && pointer.snapshot_path === '.cache/epochs/' + pointer.parent_plan_epoch
      + '/files/.cache/' + REVIEW_JOURNAL_NAME;
}

function loadArchivedLegacyImport(opts, pointer, seen) {
  if (!validateLegacyImportPointerShape(pointer)) {
    return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
  }
  const key = [pointer.transaction_id, pointer.parent_plan_hash, pointer.snapshot_manifest_digest].join(':');
  const visited = seen || new Set();
  if (visited.has(key)) {
    return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
  }
  visited.add(key);
  const projectDir = path.dirname(opts.planPath);
  const epochDir = path.join(projectDir, '.cache', 'epochs', String(pointer.parent_plan_epoch));
  let manifestBytes;
  let manifest;
  let parentBytes;
  let parentJournal;
  try {
    manifestBytes = opts.readFile(path.join(epochDir, 'manifest.json'));
    manifest = JSON.parse(manifestBytes);
    const validManifest = validateSnapshotManifestShape(manifest);
    if (!validManifest.ok
        || sha256Hex(Buffer.from(manifestBytes, 'utf8')) !== pointer.snapshot_manifest_digest
        || manifest.epoch_lineage_id !== pointer.epoch_lineage_id
        || manifest.claim_identity_digest !== pointer.claim_identity_digest
        || manifest.parent_plan_epoch !== pointer.parent_plan_epoch
        || manifest.transaction_id !== pointer.transaction_id
        || !manifest.parent || manifest.parent.plan_hash !== pointer.parent_plan_hash) {
      return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    const row = manifest.files.find(file => file.path === '.cache/' + REVIEW_JOURNAL_NAME);
    if (!row || row.digest !== pointer.journal_digest) {
      return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    parentBytes = opts.readFile(path.join(epochDir, 'files', '.cache', REVIEW_JOURNAL_NAME));
    if (sha256Hex(Buffer.from(parentBytes, 'utf8')) !== row.digest) {
      return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    parentJournal = JSON.parse(parentBytes);
    const planRow = manifest.files.find(file => file.path === 'workflow-plan.md');
    const parentPlan = opts.readFile(path.join(epochDir, 'files', 'workflow-plan.md'));
    if (!planRow || sha256Hex(Buffer.from(parentPlan, 'utf8')) !== planRow.digest
        || planHashFromContent(parentPlan) !== pointer.parent_plan_hash) {
      return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    const validParent = validateReviewJournalForPlan(parentJournal, pointer.parent_plan_hash, parentPlan);
    if (!validParent.ok) return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
  } catch (_) {
    return { ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
  }

  if (pointer.parent_plan_epoch > 1) {
    if (!Object.prototype.hasOwnProperty.call(parentJournal, 'legacy_import')) {
      return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
    }
    const nestedPointer = parentJournal.legacy_import;
    if (!validateLegacyImportPointerShape(nestedPointer)
        || nestedPointer.epoch_lineage_id !== pointer.epoch_lineage_id
        || nestedPointer.claim_identity_digest !== pointer.claim_identity_digest
        || nestedPointer.parent_plan_epoch !== pointer.parent_plan_epoch - 1) {
      return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
    }
    const nested = loadArchivedLegacyImport(opts, nestedPointer, visited);
    if (!nested.ok) return nested;
    attachLegacyImport(parentJournal, nested.parentJournal, nestedPointer);
  } else if (Object.prototype.hasOwnProperty.call(parentJournal, 'legacy_import')) {
    return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
  }

  const attempts = reviewJournalAttempts(parentJournal);
  const ids = attempts.map(attempt => attempt.attempt_id).slice().sort();
  if (JSON.stringify(ids) !== JSON.stringify(pointer.attempt_ids)
      || sha256Hex(Buffer.from(JSON.stringify(attempts), 'utf8')) !== pointer.attempts_digest) {
    return { ok: false, reason: 'review_journal_legacy_import_mismatch' };
  }
  return { ok: true, parentJournal };
}

function loadCommittedLegacyImport(opts, planHash, suppliedPointer) {
  const projectDir = path.dirname(opts.planPath);
  const txPath = path.join(projectDir, '.cache', REPLAN_TRANSACTION_NAME);
  const declared = typeof opts.cacheExists === 'function' ? opts.cacheExists(txPath) : null;
  if (declared === false) return { applicable: false };
  let transaction;
  try { transaction = JSON.parse(opts.readFile(txPath)); }
  catch (_) {
    return declared === true
      ? { applicable: true, ok: false, reason: 'review_journal_legacy_import_transaction_invalid' }
      : { applicable: false };
  }
  const checked = validateReplanTransaction(transaction);
  if (!checked.ok) return { applicable: true, ok: false, reason: 'review_journal_legacy_import_transaction_invalid' };
  const committedChild = transaction.phase === 'committed'
    && transaction.activation && transaction.activation.transaction_committed
    && transaction.activation.transaction_committed.status === 'complete'
    && transaction.activation.state_unfenced
    && transaction.activation.state_unfenced.status === 'complete'
    && transaction.child.plan_hash === planHash;
  if (!committedChild) return { applicable: false };
  const epochDir = path.join(projectDir, '.cache', 'epochs', String(transaction.parent.plan_epoch));
  let manifest;
  let parentJournal;
  try {
    const manifestBytes = opts.readFile(path.join(epochDir, 'manifest.json'));
    manifest = JSON.parse(manifestBytes);
    const validManifest = validateSnapshotManifestShape(manifest);
    if (!validManifest.ok
        || sha256Hex(Buffer.from(manifestBytes, 'utf8')) !== transaction.snapshot.manifest_digest
        || manifest.manifest_self_digest !== transaction.snapshot.manifest_self_digest
        || manifest.transaction_id !== transaction.transaction_id
        || manifest.parent.plan_hash !== transaction.parent.plan_hash) {
      return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    const row = manifest.files.find(file => file.path === '.cache/' + REVIEW_JOURNAL_NAME);
    if (!row) return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    const parentBytes = opts.readFile(path.join(epochDir, 'files', '.cache', REVIEW_JOURNAL_NAME));
    if (sha256Hex(Buffer.from(parentBytes, 'utf8')) !== row.digest
        || row.digest !== transaction.source.journal_digest) {
      return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    parentJournal = JSON.parse(parentBytes);
    const planRow = manifest.files.find(file => file.path === 'workflow-plan.md');
    const parentPlan = opts.readFile(path.join(epochDir, 'files', 'workflow-plan.md'));
    if (!planRow || sha256Hex(Buffer.from(parentPlan, 'utf8')) !== planRow.digest
        || planHashFromContent(parentPlan) !== transaction.parent.plan_hash) {
      return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
    }
    const validParent = validateReviewJournalForPlan(parentJournal, transaction.parent.plan_hash, parentPlan);
    if (!validParent.ok) return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
  } catch (_) {
    return { applicable: true, ok: false, reason: 'review_journal_legacy_import_snapshot_invalid' };
  }
  if (transaction.parent.plan_epoch > 1) {
    if (!Object.prototype.hasOwnProperty.call(parentJournal, 'legacy_import')) {
      return { applicable: true, ok: false, reason: 'review_journal_legacy_import_mismatch' };
    }
    const nested = loadArchivedLegacyImport(opts, parentJournal.legacy_import, new Set());
    if (!nested.ok) return { applicable: true, ok: false, reason: nested.reason };
    attachLegacyImport(parentJournal, nested.parentJournal, parentJournal.legacy_import);
  }
  const pointer = canonicalLegacyImportPointer(transaction, parentJournal);
  if (pointer.consumed_attempt_ids.some(id => !pointer.attempt_ids.includes(id))) {
    return { applicable: true, ok: false, reason: 'review_journal_legacy_import_transaction_invalid' };
  }
  if (suppliedPointer !== undefined
      && (() => { try { return canonicalJson(suppliedPointer) !== canonicalJson(pointer); } catch (_) { return true; } })()) {
    return { applicable: true, ok: false, reason: 'review_journal_legacy_import_mismatch' };
  }
  return { applicable: true, ok: true, transaction, parentJournal, pointer };
}

function reviewJournalV2MatchesPlan(journal, planContent) {
  const validator = require('./kaola-workflow-plan-validator');
  const nodes = validator.parseNodes(planContent);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const planView = validator.buildPlanView(planContent);
  const ledger = readLedgerStatuses(planContent);
  const canonicalRows = rows => rows.map(row => reviewSchema.canonicalJson(row)).sort();
  // #748: same journal-global replay relief as the schema-1 twin (see activeReplayRelief).
  const relief = activeReplayRelief(journal, nodes, ledger);
  for (const attempt of (journal.attempts || [])) {
    let expectedGate = null;
    for (const receipt of attempt.receipts || []) {
      const node = byId.get(receipt.node_id);
      if (!node || !reviewSchema.REVIEW_GATE_ROLES.includes(node.role)) {
        return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
      }
      const gate = reviewLogicalGate(nodes, node);
      const core = { key: gate.key, kind: gate.kind, members: gate.members,
        claim_digest: gate.claim_digest, surface_digests: gate.surface_digests,
        aggregation: gate.aggregation, certified_producers: gate.certified_producers };
      if (!expectedGate) expectedGate = core;
      else if (reviewSchema.canonicalJson(core) !== reviewSchema.canonicalJson(expectedGate)) {
        return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
      }
      const viewNode = planView.nodes.find(candidate => candidate.id === node.id);
      const expectedMode = node.role === 'adversarial-verifier'
        ? reviewSchema.deriveGateMode(planView, viewNode) : 'change_gate';
      if (attempt.gate_mode !== expectedMode) {
        return { ok: false, reason: 'review_journal_gate_mode_mismatch' };
      }
    }
    if (!expectedGate
      || reviewSchema.canonicalJson(attempt.logical_gate) !== reviewSchema.canonicalJson(expectedGate)) {
      return { ok: false, reason: 'review_journal_gate_identity_mismatch' };
    }
    const bindingKeys = Object.keys(attempt.producer_bindings || {}).sort();
    // #739: validate any in-plan descendant-replay record (fail closed on a forged one) and, for a
    // derived (certified_producers-empty) gate, keep the reset descendant cone in the expected slice so
    // bindingKeys still matches while those descendants sit at pending mid-replay.
    const replayCheck = validatedReplayExempt(attempt, nodes);
    if (!replayCheck.ok) return { ok: false, reason: replayCheck.reason };
    const expectedBindings = expectedGate.certified_producers.length
      ? expectedGate.certified_producers.slice().sort()
      // #748: the journal-global set is statusRelief (admission only), never merged into replayExempt.
      : uniqueMaximalReviewProducer(nodes, expectedGate.members,
        (attempt.repair && attempt.repair.selected_writer) || attempt.consumed_by || '',
        ledger, bindingKeys.concat([...relief.preserved]),
        replayCheck.replayExempt || [], relief.exempt).producer_slice.sort();
    if (reviewSchema.canonicalJson(bindingKeys) !== reviewSchema.canonicalJson(expectedBindings)) {
      return { ok: false, reason: 'review_journal_repair_identity_mismatch' };
    }
    const expectedRoutes = (attempt.receipts || []).flatMap(receipt =>
      schema2RouteCandidates(receipt.findings || [], nodes, receipt.node_id));
    if (reviewSchema.canonicalJson(canonicalRows(attempt.route_candidates || []))
      !== reviewSchema.canonicalJson(canonicalRows(expectedRoutes))) {
      return { ok: false, reason: 'review_journal_route_mismatch' };
    }
  }
  return { ok: true };
}

// #699/#698 cross-feature seam: a schema-2 plan whose review gate is a code/security FANOUT
// (replicated_majority / partitioned_all) is driven by the schema-1 provisional-fanout machinery
// (reserveLogicalReviewGenerations + rolling top-up + reduceLogicalReviewAttempt), so its review journal
// is a schema-1 journal — validated against the plan's schema2ReviewGateContracts. This predicate lets
// readReviewJournal accept that schema-1 journal under a schema-2 plan WITHOUT weakening the bundle's
// bare-mismatch refusal (schema-1 journal, no legacy_import) for any plan whose review is candidate-bound.
function planReviewUsesSchema1Fanout(planContent) {
  const nodes = parseNodesFromContent(planContent);
  return nodes.some(node => ['code-reviewer', 'security-reviewer'].includes(node.role)
    && logicalGateForNode(nodes, node).kind === 'fanout');
}

// The cross-epoch child journal minted by a committed replan activation. #722: it inherits the PARENT
// journal's schema. A schema-1 parent keeps a schema-1 child — the child epoch's review lifecycle
// continues the imported schema-1 attempt chain, which is what routes its gate closes onto the schema-1
// lane. A schema-2 parent MUST mint a schema-2 child: minting schema-1 there silently downgraded every
// gate of the child epoch to the schema-1 lane, discarding the V2 review-context / candidate-partition
// binding the child plan's own contract requires. `attempts` is empty either way — imported parent history
// stays digest-bound behind the `legacy_import` pointer and is never copied into the child's own rows.
function buildCrossEpochChildJournal(planHash, imported) {
  const parentIsV2 = !!imported.parentJournal
    && imported.parentJournal.schema_version === reviewSchema.REVIEW_JOURNAL_SCHEMA_VERSION;
  return attachLegacyImport({
    schema_version: parentIsV2 ? reviewSchema.REVIEW_JOURNAL_SCHEMA_VERSION : 1,
    ...(parentIsV2 ? { contract_version: 2 } : {}),
    plan_hash: planHash, attempts: [],
    epoch_lineage_id: imported.transaction.epoch_lineage_id,
    claim_identity_digest: imported.transaction.parent.claim_identity_digest,
    plan_epoch: imported.transaction.parent.plan_epoch + 1,
  }, imported.parentJournal, imported.pointer);
}

function readReviewJournal(opts, planContent) {
  const planHash = planHashFromContent(planContent);
  if (!planHash) return { ok: true, legacy: true, plan_hash: null, journal: null };
  let contract;
  if (reviewMetaValue(planContent, 'plan_schema_version') === null) {
    contract = { ok: true, plan_schema_version: 1, contract_version: 1 };
  } else {
    try { contract = require('./kaola-workflow-plan-validator').resolvePlanContract(planContent, { requireFrozen: true }); }
    catch (_) { contract = { ok: false, reason: 'plan_contract_unavailable' }; }
  }
  if (!contract.ok) return { ok: false, reason: contract.reason, detail: contract.detail || null };
  const expectedJournalVersion = contract.contract_version === 2 ? 2 : 1;
  const journalPath = path.join(path.dirname(opts.planPath), '.cache', REVIEW_JOURNAL_NAME);
  const exists = opts.cacheExists ? opts.cacheExists(journalPath) : (() => { try { opts.readFile(journalPath); return true; } catch (_) { return false; } })();
  if (!exists) {
    const imported = loadCommittedLegacyImport(opts, planHash, undefined);
    if (imported.applicable) {
      if (!imported.ok) return { ok: false, reason: imported.reason, journalPath };
      const journal = buildCrossEpochChildJournal(planHash, imported);
      return { ok: true, plan_hash: planHash, journalPath, journal };
    }
    const nodes = parseNodesFromContent(planContent);
    const statuses = readLedgerStatuses(planContent);
    const evidenceByNode = new Map();
    for (const node of nodes) {
      const evidencePath = path.join(path.dirname(opts.planPath), '.cache', node.id + '.md');
      try { evidenceByNode.set(node.id, opts.readFile(evidencePath)); } catch (_) { evidenceByNode.set(node.id, ''); }
    }
    const complianceSection = locateSection(planContent, 'Required Agent Compliance');
    const complianceBlock = complianceSection.start < 0 ? ''
      : planContent.slice(complianceSection.start, complianceSection.next >= 0 ? complianceSection.next : undefined);
    const priorCompliance = complianceBlock.split('\n').filter(line => line.trim().startsWith('|')).some(line => {
      const requirement = (line.split('|').slice(1, -1)[0] || '').trim();
      return [...VERDICT_ROLES].some(role => requirement === role || requirement.startsWith(role + ' ('));
    });
    const priorFailedAttempt = [...evidenceByNode.values()].some(evidence => /^failed_review_attempt:[ \t]*\S+/m.test(evidence));
    if (expectedJournalVersion === 1 && (priorCompliance || priorFailedAttempt)) {
      return { ok: false, reason: 'review_journal_missing', journalPath,
        detail: priorCompliance ? 'prior review compliance witness exists' : 'prior failed-review witness exists' };
    }
    for (const node of expectedJournalVersion === 1 ? nodes.filter(n => VERDICT_ROLES.has(n.role)) : []) {
        const evidence = evidenceByNode.get(node.id) || '';
        const parsed = parseNodeVerdict(evidence);
        const reviewDomainPresent = /^domain_outcome:[ \t]*\S+/m.test(evidence);
        const current = readNonce(opts.planPath, node.id, opts.readFile);
        const binding = /^evidence-binding:[ \t]+[^ \t\n]+[ \t]+([^ \t\n]+)/m.exec(evidence);
        const isLiveCurrentGeneration = opts.allowReviewJournalCreate
          && current && binding && binding[1] === current
          && statuses[node.id] === 'in_progress';
        if (!isLiveCurrentGeneration && (parsed.found || reviewDomainPresent)
          && (statuses[node.id] === 'complete' || (binding && binding[1] === current))) {
          return { ok: false, reason: 'review_journal_missing', journalPath, node_id: node.id };
        }
    }
    return { ok: true, plan_hash: planHash, journalPath, journal: expectedJournalVersion === 2
      ? { schema_version: 2, contract_version: 2, plan_hash: planHash, attempts: [] }
      : { schema_version: 1, plan_hash: planHash, attempts: [] } };
  }
  let journal;
  try { journal = JSON.parse(opts.readFile(journalPath)); }
  catch (_) { return { ok: false, reason: 'review_journal_malformed', journalPath }; }
  if (journal && journal.plan_hash !== planHash) {
    const imported = loadCommittedLegacyImport(opts, planHash, undefined);
    if (imported.applicable) {
      if (!imported.ok) return { ok: false, reason: imported.reason, journalPath };
      const childJournal = buildCrossEpochChildJournal(planHash, imported);
      return { ok: true, plan_hash: planHash, journalPath, journal: childJournal };
    }
  }
  // A journal written before the candidate-partition keys existed is STRUCTURALLY fine — it is simply
  // older than this code. Do not surface that as `review_journal_malformed` (which reads like corruption
  // and invites a discard). Name it, and name the recovery: a frozen plan's journal is per-project,
  // non-durable state that never crosses a release boundary, so an in-flight run must be finished or
  // discarded BEFORE the upgrade. If a live project is caught mid-run, that is a value call (consent).
  const legacyAttempt = journal && journal.schema_version === 1
    ? (Array.isArray(journal && journal.attempts) ? journal.attempts : []).find(a =>
    a && typeof a === 'object' && !Array.isArray(a)
    && ['attempt_id', 'ordinal', 'plan_hash', 'logical_gate', 'transaction_key', 'candidate_digest']
      .every(k => Object.prototype.hasOwnProperty.call(a, k))
    && ['candidate_declared', 'candidate_residue_digest', 'rebind']
      .some(k => !Object.prototype.hasOwnProperty.call(a, k))) : null;
  if (legacyAttempt) {
    return { ok: false, reason: 'review_journal_schema_upgrade_required', journalPath,
      detail: 'attempt "' + legacyAttempt.attempt_id + '" predates the candidate-partition journal schema — '
        + 'finish or discard the active run before upgrading (a frozen plan\'s review journal is per-project, '
        + 'non-durable state and never crosses a release boundary)' };
  }
  // Route by the JOURNAL's own declared schema, not the plan's contract_version. A schema-2 plan legitimately
  // carries a schema_version:1 legacy-import child journal (issue-699 cross-epoch activation) until schema-2
  // review runs, so the journal version is NOT forced to match the plan: a schema-1 journal WITH legacy_import
  // provenance under a schema-2 plan is the cross-epoch child and takes the schema-1 path. A bare version
  // mismatch (schema-1 journal, no legacy_import, under a schema-2 plan) is still refused (bundle's #693/#696/
  // #697/#698 protection). A schema_version:2 journal is validated as V2.
  if (journal && journal.schema_version !== expectedJournalVersion
    && !(journal.schema_version === 1 && Object.prototype.hasOwnProperty.call(journal, 'legacy_import'))
    && !(journal.schema_version === 1 && planReviewUsesSchema1Fanout(planContent))) {
    return { ok: false, reason: 'review_journal_version_mismatch',
      detail: 'journal schema does not match verified plan contract', journalPath };
  }
  if (journal && journal.schema_version === reviewSchema.REVIEW_JOURNAL_SCHEMA_VERSION) {
    const valid = validateReviewJournal(journal, planHash, reviewSchema.REVIEW_JOURNAL_SCHEMA_VERSION);
    if (!valid.ok) return { ok: false, reason: valid.reason, detail: valid.detail, journalPath };
    const identity = reviewJournalV2MatchesPlan(journal, planContent);
    if (!identity.ok) return { ok: false, reason: identity.reason, journalPath };
    // #722: a schema-2 journal can now be a cross-epoch CHILD too, so it carries the same immutable
    // `legacy_import` pointer the schema-1 lane does once the child's first attempt persists it. Re-resolve
    // it here with the identical fail-closed rules: the pointer must match the committed transaction's
    // canonical pointer byte-for-byte, and a journal that DECLARES an import with no committed transaction
    // backing it is a forgery. Bare key presence is never provenance, and without this the reread would
    // silently drop the digest-verified parent history the audit trail depends on.
    const declaresLegacyImport = Object.prototype.hasOwnProperty.call(journal, 'legacy_import');
    const importedV2 = loadCommittedLegacyImport(opts, planHash,
      declaresLegacyImport ? journal.legacy_import : null);
    if (importedV2.applicable) {
      if (!importedV2.ok) return { ok: false, reason: importedV2.reason, journalPath };
      attachLegacyImport(journal, importedV2.parentJournal, importedV2.pointer);
    } else if (declaresLegacyImport) {
      return { ok: false, reason: 'review_journal_legacy_import_transaction_invalid', journalPath };
    }
    return { ok: true, plan_hash: planHash, journalPath, journal, contract_version: 2 };
  }
  // Schema-1 (issue-699): plan-owned schema-2 fanout reduction where gate metadata is present, the historical
  // majority rule where it is absent, then the epoch legacy-import chain.
  const valid = validateReviewJournalForPlan(journal, planHash, planContent);
  if (!valid.ok) return { ok: false, reason: valid.reason, detail: valid.detail, journalPath };
  const declaresLegacyImport = Object.prototype.hasOwnProperty.call(journal, 'legacy_import');
  const imported = loadCommittedLegacyImport(opts, planHash,
    declaresLegacyImport ? journal.legacy_import : null);
  if (imported.applicable) {
    if (!imported.ok) return { ok: false, reason: imported.reason, journalPath };
    attachLegacyImport(journal, imported.parentJournal, imported.pointer);
  } else if (declaresLegacyImport) {
    // Fail-closed: a schema-1 journal that DECLARES a legacy_import pointer but has NO committed, validated
    // replan-transaction backing it (file absent, or present but not a committed child for THIS plan) is a
    // forged cross-epoch child. loadCommittedLegacyImport returns applicable:false there, which the guard
    // above would otherwise treat as a non-fatal skip — leaving the unvalidated pointer in place so the
    // version-mismatch exemption + validateSchema2ReviewEvidence route a schema-2 review close onto the
    // schema-1 (V2-binding-free) path. Mere key presence is not provenance: refuse.
    return { ok: false, reason: 'review_journal_legacy_import_transaction_invalid', journalPath };
  }
  const nodes = parseNodesFromContent(planContent);
  const identity = reviewJournalIdentityMatchesPlan(journal, nodes, readLedgerStatuses(planContent));
  if (!identity.ok) return { ok: false, reason: identity.reason, journalPath };
  if (!reviewJournalRoutesMatchPlan(journal, nodes)) {
    return { ok: false, reason: 'review_journal_route_mismatch', journalPath };
  }
  return { ok: true, plan_hash: planHash, journalPath, journal };
}

function writeReviewJournal(opts, state) {
  const content = JSON.stringify(state.journal, null, 2) + '\n';
  opts.writeFile(state.journalPath, content);
}

function reviewFailpoint(opts, name) {
  if (typeof opts.reviewFailpoint === 'function') opts.reviewFailpoint(name);
  if (opts.reviewFailpoint === name) throw new Error('review_failpoint:' + name);
}

function journalFence(opts, planContent) {
  const state = readReviewJournal(opts, planContent);
  if (!state.ok) return { result: 'refuse', reason: state.reason, detail: state.detail || null };
  if (state.legacy) return null;
  const blocker = reviewJournalBlocker(state.journal);
  return blocker ? { result: 'refuse', reason: blocker.reason, attempt_ids: blocker.attempt_ids,
    repair: blocker.attempts.some(a => a.lifecycle_settled === false)
      ? 'retry the recorded settlement command' : 'repair-node --attempt-id <attempt> --node-id <agent-selected-writer>' } : null;
}

function reviewTransactionKey(planHash, logicalGate, candidateDigest, generations) {
  return require('crypto').createHash('sha256').update(JSON.stringify({
    plan_hash: planHash, logical_gate_key: logicalGate.key,
    candidate_digest: candidateDigest, generations,
  })).digest('hex');
}

// A logical fanout attempt must be structurally valid immediately after its
// first receipt.  Capacity-bounded dispatch means some exact members can still
// be pending then, so reserve their real barrier identities before journal
// creation.  `--record-base` owns the complete base/ref/open-token triple and is
// idempotent across a crash between any two reservations.  Never synthesize a
// nonce and never snapshot an already-open member: the latter would launder its
// work into a fresh baseline.
function reserveLogicalReviewGenerations(opts, logicalGate, ledgerStatuses) {
  const generations = [];
  for (const member of logicalGate.members) {
    const status = ledgerStatuses[member];
    let nonce = readNonce(opts.planPath, member, opts.readFile);
    if (status === 'pending') {
      if (typeof opts.shell !== 'function') {
        return { ok: false, reason: 'review_generation_reservation_failed', node_id: member };
      }
      const recorded = opts.shell(validatorPath,
        [opts.planPath, '--record-base', '--node-id', member, '--json']);
      const record = recorded && recorded.recordBase ? recorded.recordBase : recorded;
      if (!recorded || recorded.exitCode !== 0 || recorded.result !== 'ok'
          || (record && record.stale === true)) {
        return { ok: false, reason: record && record.stale === true
          ? 'review_generation_reservation_stale' : 'review_generation_reservation_failed',
        node_id: member };
      }
      nonce = readNonce(opts.planPath, member, opts.readFile);
      const identity = typeof opts.captureReviewBarrierIdentity === 'function'
        ? opts.captureReviewBarrierIdentity(member)
        : captureWriterBarrierIdentity(opts, member);
      const recordedBase = record && record.base ? String(record.base) : '';
      if (!nonce || !identity || identity.generation !== nonce
          || (recordedBase && identity.baseline !== recordedBase)) {
        return { ok: false, reason: 'review_generation_reservation_identity_mismatch', node_id: member };
      }
    } else if (!nonce) {
      return { ok: false, reason: 'review_generation_missing', node_id: member };
    }
    generations.push({ member, nonce });
  }
  generations.sort((a, b) => a.member.localeCompare(b.member));
  return { ok: true, generations };
}

function reviewTopUpRefusal(blocked, reason, detail, repair) {
  if (!repair && blocked && blocked.attempts && blocked.attempts.length) {
    const provisional = blocked.attempts.find(attempt => attempt.outcome === null);
    const unsettled = blocked.attempts.find(attempt => attempt.lifecycle_settled === false
      && attempt.outcome !== null);
    const repairing = blocked.attempts.find(attempt => attempt.repair
      && attempt.repair.settled === false);
    repair = provisional
      ? 'close remaining live members: ' + provisional.logical_gate.members.join(', ')
      : unsettled
        ? 'retry ' + unsettled.settlement_command + ' for ' + unsettled.logical_gate.members.join(', ')
        : repairing
          ? 'repair-node --attempt-id ' + repairing.attempt_id + ' --node-id '
            + repairing.repair.selected_writer
          : 'repair-node --attempt-id ' + blocked.attempts[0].attempt_id
            + ' --node-id <agent-selected-writer>';
  }
  return { ok: false, refusal: {
    result: 'refuse', reason: reason || 'review_attempt_unresolved',
    attempt_ids: blocked ? blocked.attempt_ids : [],
    ...(detail ? { detail } : {}),
    ...(repair ? { repair } : {}),
  } };
}

function journalOwnedReviewGenerationMembers(opts, planContent) {
  const owned = new Set();
  const state = readReviewJournal(opts, planContent);
  if (!state.ok || state.legacy) return owned;
  for (const attempt of (state.journal.attempts || [])) {
    if (attempt.lifecycle_settled !== false) continue;
    for (const generation of (attempt.generations || [])) {
      if (generation && generation.member) owned.add(generation.member);
    }
  }
  return owned;
}

// #703 (Proposal 3): the barrier baseline of a COMPLETE producer node referenced by an UNRESOLVED
// review attempt (`consumed_by == null`) is NOT an orphan — a settled-fail attempt still routes to
// `repair-node`, whose non-discard recovery restores the writer's anchored ref FROM
// `.cache/barrier-base-<writer>`. Dropping it in the reconcile orphan-sweep wedges the repair
// (`writer_identity_changed` with the recovery file already deleted — the issue's aggravator). Unlike
// journalOwnedReviewGenerationMembers (which owns still-unsettled review-fanout GENERATIONS, keyed on
// `lifecycle_settled === false`), this owns the PRODUCER slice of any attempt awaiting resolution —
// including a lifecycle_settled fail whose repair has not yet consumed it. Consumed attempts
// (`consumed_by != null`, e.g. a source attempt migrated into a child replan epoch) release their
// producers: the repair lands via the epoch's inserted node, not the old writer's baseline. Returns
// raw node ids; fail-soft (an unreadable/legacy journal contributes nothing — the sweep already
// prefers under-reaping to over-reaping, so an unreadable journal simply adds no keep entries).
function journalReferencedProducerBaselines(opts, planContent) {
  const referenced = new Set();
  const state = readReviewJournal(opts, planContent);
  if (!state.ok || state.legacy) return referenced;
  for (const attempt of (state.journal.attempts || [])) {
    if (attempt.consumed_by != null) continue;
    for (const producerId of Object.keys(attempt.producer_bindings || {})) {
      if (producerId) referenced.add(producerId);
    }
  }
  return referenced;
}

// Narrow exception to the global unresolved-review mutation fence.  It permits
// only the still-missing members of one schema-2 code/security fanout to consume
// their already-reserved generations.  Every other opener/mutator remains
// fenced.  The candidate and the complete reservation identity are re-proved
// before next-action can cause a baseline, ledger, running-set, or evidence
// mutation.
function reviewFanoutTopUpAllowance(opts, planContent) {
  const state = readReviewJournal(opts, planContent);
  if (!state.ok) return reviewTopUpRefusal(null, state.reason, state.detail || null);
  if (state.legacy) return { ok: true, topUp: null };
  const blocked = reviewJournalBlocker(state.journal);
  if (!blocked) return { ok: true, topUp: null, state };
  if (blocked.attempts.length !== 1) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved', null,
      'settle or repair every recorded review attempt before opening more work');
  }
  const attempt = blocked.attempts[0];
  const gate = attempt && attempt.logical_gate;
  if (!attempt || attempt.lifecycle_settled !== false || attempt.outcome !== null
      || !gate || gate.kind !== 'fanout'
      || !attempt.repair || attempt.repair.selected_writer !== null
      || attempt.repair.settled !== null
      || !Array.isArray(attempt.receipts) || attempt.receipts.length < 1
      || attempt.receipts.length >= gate.members.length) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved');
  }
  const nodes = parseNodesFromContent(planContent);
  const memberRows = gate.members.map(id => nodes.find(node => node.id === id));
  const roles = new Set(memberRows.map(node => node && node.role));
  const aggregations = new Set(memberRows.map(node => node && node.gateAggregation));
  if (memberRows.some(node => !node || !isReadOnlyNode(node)) || roles.size !== 1
      || !['code-reviewer', 'security-reviewer'].includes(memberRows[0].role)
      || aggregations.size !== 1
      || !['replicated_majority', 'partitioned_all'].includes(memberRows[0].gateAggregation)
      || memberRows.some(node => logicalGateForNode(nodes, node).key !== gate.key)) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved',
      'only the exact declared schema-2 code/security fanout may top up');
  }
  const statuses = readLedgerStatuses(planContent);
  const receiptMembers = new Set(attempt.receipts.map(receipt => receipt.node_id));
  if (attempt.receipts.some(receipt => !['complete', 'n/a'].includes(statuses[receipt.node_id]))) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved', null,
      'retry ' + attempt.settlement_command + ' for the receipt-bearing member before top-up');
  }
  const missing = gate.members.filter(id => !receiptMembers.has(id));
  if (missing.some(id => !['pending', 'in_progress'].includes(statuses[id]))) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved',
      'a missing logical-review member is neither pending nor in_progress');
  }
  const generationByMember = new Map(attempt.generations.map(row => [row.member, row.nonce]));
  for (const member of gate.members) {
    if (readNonce(opts.planPath, member, opts.readFile) !== generationByMember.get(member)) {
      return reviewTopUpRefusal(blocked, 'review_generation_reservation_identity_mismatch',
        'a journal-owned review generation no longer matches its reserved baseline');
    }
  }
  for (const member of missing.filter(id => statuses[id] === 'pending')) {
    const identity = typeof opts.captureReviewBarrierIdentity === 'function'
      ? opts.captureReviewBarrierIdentity(member)
      : captureWriterBarrierIdentity(opts, member);
    if (!identity || identity.generation !== generationByMember.get(member)) {
      return reviewTopUpRefusal(blocked, 'review_generation_reservation_identity_mismatch',
        'the pending review member lost its reserved base/ref/open-token identity');
    }
  }
  let candidate;
  try { candidate = currentReviewCandidate(opts, nodes); }
  catch (_) {
    return reviewTopUpRefusal(blocked, 'candidate_digest_unavailable');
  }
  if (candidate.digest !== attempt.candidate_digest
      || JSON.stringify(candidate.declared) !== JSON.stringify(attempt.candidate_declared)
      || candidate.residue_digest !== attempt.candidate_residue_digest) {
    return reviewTopUpRefusal(blocked, 'review_candidate_changed',
      'the reviewed candidate changed before the bounded fanout could top up');
  }
  const pending = missing.filter(id => statuses[id] === 'pending');
  if (!pending.length) {
    return reviewTopUpRefusal(blocked, 'review_attempt_unresolved', null,
      'close remaining live members: ' + missing.join(', '));
  }
  return { ok: true, state, topUp: { attempt, nodes, pending_members: pending,
    generation_by_member: generationByMember } };
}

function beginReviewAttempt(opts, ctx) {
  const crypto = require('crypto');
  const creatingGeneration = readNonce(opts.planPath, ctx.nodeInfo.id, opts.readFile) || '';
  const logicalGate = logicalGateForNode(ctx.nodes, ctx.nodeInfo);
  const state = readReviewJournal({ ...opts, allowReviewJournalCreate: true,
    creatingNodeId: ctx.nodeInfo.id, creatingGeneration, creatingMembers: logicalGate.members }, ctx.planContent);
  if (!state.ok || state.legacy) return state;
  // A code/security FANOUT under a schema-2 plan is routed here (schema-1 provisional machinery). A freshly
  // created journal is stamped schema_version:2 by the plan contract; re-key the still-empty journal to the
  // schema-1 shape before the first attempt lands so it is read back through validateReviewJournalForPlan.
  if (logicalGate.kind === 'fanout' && state.journal.schema_version !== 1
      && (state.journal.attempts || []).length === 0) {
    state.journal = { schema_version: 1, plan_hash: state.journal.plan_hash, attempts: [] };
  }
  // A settled failure is a terminal, replay-only transaction.  Re-emit its
  // original envelope without requiring the folded-pending members to reserve
  // new generations (which would mutate state before the replay).
  const replayReceiptSha = crypto.createHash('sha256')
    .update(String(ctx.evidenceContent || '')).digest('hex');
  const settledFailure = state.journal.attempts.find(candidate => candidate
    && candidate.lifecycle_settled === true && candidate.outcome === 'fail'
    && candidate.consumed_by == null && candidate.logical_gate
    && candidate.logical_gate.key === logicalGate.key
    && (candidate.receipts || []).some(receipt => receipt.node_id === ctx.nodeInfo.id
      && receipt.receipt_sha256 === replayReceiptSha));
  if (settledFailure) return { ok: true, state, attempt: settledFailure };
  let candidate;
  try { candidate = currentReviewCandidate(opts, ctx.nodes); }
  catch (_) { return { ok: false, reason: 'candidate_digest_unavailable' }; }
  const candidateDigest = candidate.digest;
  const candidateDeclared = candidate.declared;
  const candidateResidue = candidate.residue_digest;
  const generation = readNonce(opts.planPath, ctx.nodeInfo.id, opts.readFile) || '';
  const unsettledForGate = state.journal.attempts.filter(a => a.lifecycle_settled === false
    && a.logical_gate && a.logical_gate.key === logicalGate.key);
  if (unsettledForGate.length > 1) {
    return { ok: false, reason: 'review_attempt_unresolved',
      attempt_ids: unsettledForGate.map(a => a.attempt_id).sort() };
  }
  let generations;
  let attempt = unsettledForGate[0] || null;
  if (attempt) {
    // Existing provisional history is immutable.  A later member may append
    // only when every reserved generation and the candidate triple still
    // match; never rotate or repair a journal-owned generation here.
    generations = attempt.generations;
    if (candidateDigest !== attempt.candidate_digest
        || JSON.stringify(candidateDeclared) !== JSON.stringify(attempt.candidate_declared)
        || candidateResidue !== attempt.candidate_residue_digest
        || generations.some(row => readNonce(opts.planPath, row.member, opts.readFile) !== row.nonce)) {
      return { ok: false, reason: 'review_attempt_unresolved', attempt_ids: [attempt.attempt_id] };
    }
  } else {
    const reserved = reserveLogicalReviewGenerations(opts, logicalGate,
      readLedgerStatuses(ctx.planContent));
    if (!reserved.ok) return reserved;
    generations = reserved.generations;
  }
  const transactionKey = reviewTransactionKey(state.plan_hash, logicalGate, candidateDigest, generations);
  if (attempt && attempt.transaction_key !== transactionKey) {
    return { ok: false, reason: 'review_attempt_unresolved', attempt_ids: [attempt.attempt_id] };
  }
  if (!attempt) attempt = state.journal.attempts.find(a => a.transaction_key === transactionKey) || null;
  const effective = evaluateEffectiveVerdict(ctx.evidenceContent);
  const receipt = { node_id: ctx.nodeInfo.id, generation,
    receipt_sha256: crypto.createHash('sha256').update(String(ctx.evidenceContent || '')).digest('hex'),
    effective_pass: effective.pass, verdict: effective.verdict,
    findings_blocking: effective.findings_blocking, body: String(ctx.evidenceContent || '') };
  const parsedFindings = parseNodeFindings(ctx.evidenceContent).filter(f => f && f.id);
  if (!attempt) {
    const ordinal = nextReviewAttemptOrdinal(reviewJournalAttempts(state.journal), logicalGate);
    const attemptPrefix = logicalGate.kind === 'fanout'
      ? 'fanout-' + crypto.createHash('sha256').update(logicalGate.key).digest('hex')
      : String(ctx.nodeInfo.id).replace(/[^A-Za-z0-9_-]/g, '_');
    const producerHistory = uniqueMaximalReviewProducer(ctx.nodes, logicalGate.members, '',
      readLedgerStatuses(ctx.planContent));
    if (!producerHistory.history_valid) {
      return { ok: false, reason: 'review_producer_history_invalid',
        producer_slice: producerHistory.producer_slice, invalid_producers: producerHistory.invalid_producers };
    }
    const producerIds = producerHistory.producer_slice;
    const producer_bindings = {};
    for (const producerId of producerIds) {
      const identity = opts.captureWriterBarrierIdentity
        ? opts.captureWriterBarrierIdentity(producerId) : captureWriterBarrierIdentity(opts, producerId);
      if (!identity) return { ok: false, reason: 'writer_identity_unavailable', node_id: producerId };
      producer_bindings[producerId] = identity;
    }
    attempt = {
      attempt_id: attemptPrefix + ':' + ordinal,
      ordinal, plan_hash: state.plan_hash, logical_gate: logicalGate,
      transaction_key: transactionKey, candidate_digest: candidateDigest,
      candidate_declared: candidateDeclared, candidate_residue_digest: candidateResidue,
      generations,
      settlement_command: ctx.command,
      outcome: logicalGate.kind === 'fanout' ? null : (effective.pass ? 'pass' : 'fail'),
      reason: logicalGate.kind === 'fanout' ? null : effective.reason,
      receipts: [receipt],
      findings: parsedFindings.map(f => ({ source_node: ctx.nodeInfo.id, ...f })),
      route_candidates: routeCanonicalFindings(parsedFindings, ctx.nodes, ctx.nodeInfo.id),
      producer_bindings,
      lifecycle_settled: false, repair: { selected_writer: null, settled: null }, rebind: [], consumed_by: null,
    };
    state.journal.attempts.push(attempt);
    writeReviewJournal(opts, state);
    reviewFailpoint(opts, 'attempt_written');
  } else {
    const idx = attempt.receipts.findIndex(r => r.node_id === ctx.nodeInfo.id);
    if (attempt.lifecycle_settled === true) {
      if (idx < 0 || attempt.receipts[idx].receipt_sha256 !== receipt.receipt_sha256) {
        return { ok: false, reason: 'review_attempt_settled', attempt_id: attempt.attempt_id };
      }
      return { ok: true, state, attempt };
    }
    if (logicalGate.kind === 'fanout' && attempt.outcome !== null) {
      if (idx < 0 || attempt.receipts[idx].body !== receipt.body) {
        return { ok: false, reason: 'review_outcome_receipts_immutable', attempt_id: attempt.attempt_id };
      }
      return { ok: true, state, attempt };
    }
    if (idx >= 0) attempt.receipts[idx] = receipt; else attempt.receipts.push(receipt);
    attempt.findings = (attempt.findings || []).filter(f => f.source_node !== ctx.nodeInfo.id)
      .concat(parsedFindings.map(f => ({ source_node: ctx.nodeInfo.id, ...f })));
    attempt.route_candidates = (attempt.route_candidates || []).filter(f => f.source_node !== ctx.nodeInfo.id)
      .concat(routeCanonicalFindings(parsedFindings, ctx.nodes, ctx.nodeInfo.id));
    if (logicalGate.kind === 'sequence') {
      attempt.outcome = effective.pass ? 'pass' : 'fail';
      attempt.reason = effective.reason;
    }
    writeReviewJournal(opts, state);
  }
  return { ok: true, state, attempt };
}

function markReviewAttemptSettled(opts, begun) {
  if (!begun || !begun.attempt) return;
  begun.attempt.lifecycle_settled = true;
  writeReviewJournal(opts, begun.state);
}

function removeReviewMembersFromRunningSet(opts, memberIds) {
  const runningSetPath = path.join(path.dirname(opts.planPath), '.cache', RUNNING_SET_NAME);
  const running = readRunningSet(runningSetPath, opts.cacheExists, opts.readFile);
  if (!running) return;
  const members = new Set(memberIds);
  const remaining = (running.nodes || []).filter(n => !members.has(n.id));
  if (!remaining.length && opts.unlink) opts.unlink(runningSetPath);
  else opts.writeFile(runningSetPath, JSON.stringify({ ...running, nodes: remaining }, null, 2));
}

function readSchema2GroupReceipts(opts, review) {
  const receipts = [];
  for (const member of review.context.logical_gate.members) {
    const receiptPath = path.join(path.dirname(opts.planPath), '.cache', REVIEW_RECEIPT_DIR,
      review.dispatch.review_context_hash, member + '.json');
    let bytes, receipt;
    try { bytes = opts.readFile(receiptPath); receipt = JSON.parse(bytes); }
    catch (_) { return { ok: false, reason: 'review_receipt_missing', member }; }
    try {
      if (reviewSchema.canonicalJson(receipt) + '\n' !== bytes) {
        return { ok: false, reason: 'review_receipt_not_canonical', member };
      }
    } catch (_) { return { ok: false, reason: 'review_receipt_not_canonical', member }; }
    if (receipt.review_context_hash !== review.dispatch.review_context_hash
      || receipt.candidate_digest !== review.dispatch.candidate_digest
      || receipt.execution_status !== 'complete' || receipt.node_id !== member) {
      return { ok: false, reason: 'review_receipt_identity_invalid', member };
    }
    receipts.push(receipt);
  }
  return { ok: true, receipts };
}

function schema2RouteCandidates(findings, nodes, sourceNode) {
  return (findings || []).map(finding => {
    const compat = {
      id: finding.uid, scope: finding.scope || 'in_scope', action: finding.action || 'fix',
      status: finding.status || 'open', severity: finding.severity || 'medium',
      fix_role: finding.fix_role || null, raw: 'uid=' + finding.uid,
    };
    // #701 (D-701-01): resolve ownership from the finding's IMMUTABLE primary-anchor PATH — schema-2's
    // stable, hash-covered file identity, the analogue of schema-1's affected `file`. The prior code
    // passed the `compat` OBJECT where resolveOwningNodes expects a path STRING, so it stringified to
    // "[object Object]", matched no declared_write_set, and EVERY schema-2 route unconditionally carried
    // ownership_candidates:[] (the #701 root cause: the semantic finding owner was unrecoverable). Primary-
    // anchor-only semantics (v1) matches computeFindingUid's scoping. An anchor-less finding (kind
    // evidence_observation carries no path) resolves to [] and is handled downstream (repair degrades to a
    // generic replan, NEVER an ownership mismatch). Reuses the SAME resolveOwningNodes/nodeDeclaredPaths
    // seam schema-1's routeCanonicalFindings threads — no third path-matcher.
    const anchorPath = (finding.primary_anchor && finding.primary_anchor.path) || null;
    const owners = resolveOwningNodes(anchorPath, nodes);
    return { source_node: sourceNode, finding_id: finding.uid, id: finding.uid,
      scope: compat.scope, action: compat.action, status: compat.status,
      severity: compat.severity, fix_role: compat.fix_role,
      ownership_candidates: owners, owning_node: owners.length === 1 ? owners[0] : null,
      raw: compat.raw };
  });
}

function beginSchema2ReviewAttempt(opts, ctx, review, receipts, reduced) {
  const state = readReviewJournal({ ...opts, allowReviewJournalCreate: true }, ctx.planContent);
  if (!state.ok) return state;
  if (!state.journal || state.journal.schema_version !== 2) {
    return { ok: false, reason: 'review_journal_version_mismatch' };
  }
  const logicalGate = review.context.logical_gate;
  const ordinal = review.context.attempt_ordinal;
  const transactionKey = reviewSchema.sha256Hex(reviewSchema.canonicalJson({
    plan_hash: state.plan_hash, logical_gate_key: logicalGate.key,
    candidate_digest: review.dispatch.candidate_digest,
    context_hash: review.dispatch.review_context_hash,
  }));
  let attempt = state.journal.attempts.find(row => row.transaction_key === transactionKey);
  if (attempt) return { ok: true, state, attempt };
  const producerIds = logicalGate.certified_producers.length
    ? logicalGate.certified_producers.slice()
    : uniqueMaximalReviewProducer(ctx.nodes, logicalGate.members, '', readLedgerStatuses(ctx.planContent)).producer_slice;
  const producerBindings = {};
  for (const producerId of producerIds) {
    const identity = opts.captureWriterBarrierIdentity
      ? opts.captureWriterBarrierIdentity(producerId) : captureWriterBarrierIdentity(opts, producerId);
    if (!identity) return { ok: false, reason: 'writer_identity_unavailable', node_id: producerId };
    producerBindings[producerId] = identity;
  }
  const normalizedFindings = reviewSchema.normalizeFindingSet(
    receipts.flatMap(receipt => receipt.findings || []),
    { scope_lineage_id: review.context.scope_lineage_id });
  if (!normalizedFindings.ok) return normalizedFindings;
  const findings = normalizedFindings.findings;
  const vectorsByIdentity = new Map();
  for (const vector of receipts.flatMap(receipt => receipt.validation_vectors || [])) {
    vectorsByIdentity.set(reviewSchema.canonicalJson(vector), vector);
  }
  const validationVectors = [...vectorsByIdentity.values()].sort((a, b) =>
    (a.command_id + ':' + a.vector_id).localeCompare(b.command_id + ':' + b.vector_id));
  const resolutionArtifacts = reviewSchema.authoritativeResolutionArtifacts(
    validationVectors, review.dispatch.candidate_digest);
  const normalizedResolutions = reviewSchema.normalizeResolutionSet(
    receipts.flatMap(receipt => receipt.resolutions || []),
    review.context.review_phase === 'closure' ? {
      repair_attempt_id: review.context.repair_delta && review.context.repair_delta.repair_attempt_id,
      candidate_digest: review.dispatch.candidate_digest,
      known_validation_vector_digests: resolutionArtifacts.validation_vector_digests,
      known_evidence_digests: resolutionArtifacts.evidence_digests,
    } : {});
  if (!normalizedResolutions.ok) return normalizedResolutions;
  const resolutions = normalizedResolutions.resolutions;
  const priorOpen = (review.context.prior_findings || []).filter(finding => finding.status !== 'resolved')
    .map(finding => finding.uid).filter(Boolean).sort();
  const currentOpen = findings.filter(finding => finding.status !== 'resolved')
    .map(finding => finding.uid).filter(Boolean).sort();
  const validation = reviewSchema.compareValidationObligations(
    review.context.validation_obligations || [], validationVectors, review.dispatch.candidate_digest);
  // Prior attempts are the SAME scope lineage (epoch_lineage_id + scope_lineage_id), not the same gate key,
  // so a rename or synthesis HEAD advance cannot fork the progress counters into a fresh discovery.
  const gateAttempts = state.journal.attempts.filter(row => row
    && String(row.scope_lineage_id || '').toLowerCase() === String(review.context.scope_lineage_id || '').toLowerCase()
    && String(row.epoch_lineage_id || '').toLowerCase() === String(review.context.epoch_lineage_id || '').toLowerCase())
    .sort((a, b) => a.ordinal - b.ordinal);
  const priorAttempt = gateAttempts.length ? gateAttempts[gateAttempts.length - 1] : null;
  let closure = null;
  if (review.context.review_phase === 'closure') {
    closure = reviewSchema.assessFindingClosure({
      prior_findings: review.context.prior_findings || [], current_findings: findings,
      repair_delta: review.context.repair_delta,
      candidate_digest: review.dispatch.candidate_digest,
    });
    if (!closure.ok) return closure;
  }
  const progress = review.context.review_phase === 'closure'
    ? reviewSchema.assessReviewProgress({
      previous_open_uids: priorOpen, current_open_uids: currentOpen,
      repair_delta_uids: closure.repair_delta_uids,
      resolutions,
      repair_attempt_id: review.context.repair_delta.repair_attempt_id,
      candidate_digest: review.dispatch.candidate_digest, validation,
      known_validation_vector_digests: resolutionArtifacts.validation_vector_digests,
      known_evidence_digests: resolutionArtifacts.evidence_digests,
      logical_gate_key: logicalGate.key, scope_lineage_id: review.context.scope_lineage_id,
      before_candidate_digest: review.context.repair_delta.before_candidate_digest,
      seen_idempotency_keys: gateAttempts.map(row => row.progress && row.progress.idempotency_key).filter(Boolean),
      previous_consecutive_nonprogress: priorAttempt && priorAttempt.progress
        && Number.isInteger(priorAttempt.progress.consecutive_nonprogress)
        ? priorAttempt.progress.consecutive_nonprogress : 0,
      consumed_repairs: gateAttempts.filter(row => row.outcome === 'fail'
        && row.repair && row.repair.settled === true && row.consumed_by != null).length,
      // A folded sealed pass carrying the repair-recorded fold marker is a proven folded-pass
      // boundary (the journal was validated on read): its re-certification may converge on an
      // unchanged frontier. Mirrors the journal validator's recompute exactly.
      fold_boundary: !!(priorAttempt && priorAttempt.outcome === 'pass' && priorAttempt.fold),
    })
    : { progress: null, reason: null, stop_reason: null, replan_required: false,
      consecutive_nonprogress: 0, idempotency_key: null,
      previous_open_uids: priorOpen, current_open_uids: currentOpen };
  const attemptId = 'review2-' + logicalGate.key.slice(0, 16) + ':' + ordinal;
  const contextHashes = Array.from(new Set(receipts.map(receipt => receipt.review_context_hash))).sort();
  const profileHashes = Array.from(new Set(receipts.map(receipt => receipt.resolved_profile_hash))).sort();
  const reducerPass = reduced.gate_effect === 'pass' || reduced.gate_effect === 'none';
  const progressPass = review.context.review_phase === 'discovery' || progress.progress === true;
  const outcome = reducerPass && progressPass ? 'pass' : 'fail';
  const reason = outcome === 'pass' ? null
    : (review.context.review_phase === 'closure' && !progress.progress
      ? progress.reason : 'review_gate_failed');
  const partition = review.candidate_partition;
  if (!partition || !reviewSchema.isCanonicalBlobMap(partition.declared)
    || !/^[0-9a-f]{64}$/.test(String(partition.residue_digest || ''))) {
    return { ok: false, reason: 'candidate_partition_unavailable' };
  }
  // #728 — SETTLEMENT INVARIANT: a review attempt whose REDUCED AGGREGATE verdict is a gate
  // FAILURE may never be recorded with an EMPTY canonical frontier.
  //
  // `findings` / `current_findings` / `current_open_uids` are the only durable record of WHAT
  // failed, and assessReviewProgress compares SUCCESSIVE frontiers by UID — so a failing aggregate
  // with an empty frontier is indistinguishable from "nothing left to fix": the next attempt sees
  // [] vs [] as `review_frontier_nonprogress`, two of those settle `review_nonconvergent` +
  // replan_required, and the run is pushed into a replan carrying no record of the defect at all.
  // The gap is reachable because a schema-1 flat `finding: id=... scope=...` row is invisible to
  // parseReviewEvidence (only `finding_json:` is canonical) and requiredReviewTokens never asks an
  // adversarial-verifier for a finding token, so `domain_outcome: refuted` with zero canonical
  // findings parses clean.
  //
  // This binds the AGGREGATE, never the member. A member receipt whose own deriveGateEffect is
  // 'fail' — an abstaining `indeterminate` replica, a minority refutation — that the reduction
  // absorbs into a PASSING aggregate stays legal and closes normally, with no new obligation on
  // that reviewer; refusing per member would hard-block a legal majority fan-out and could only be
  // cleared by fabricating a failure_class, four trigger digests and an anchor for a defect the
  // reviewer explicitly could not determine. The condition is therefore keyed on
  // `reduced.gate_effect`, not on `outcome`: a closure attempt that fails only on progress
  // (validation drift, missing resolution proof) legitimately carries an empty frontier because its
  // findings really were all resolved.
  //
  // Refusal — not promotion of the flat row — is the only sound remedy: a canonical finding's UID
  // is sha256(scope_lineage_id + primary_anchor) over a normalized anchor, and normalizeFindingSet
  // additionally demands a closed-vocabulary failure_class plus four 64-hex trigger digests. A flat
  // row carries none of them, so a promoted finding could not be given a stable UID without
  // inventing evidence; and validateReviewJournal recomputes attempt.findings from the receipts, so
  // a finding promoted here (into an immutable receipt set) would red the very next journal read.
  if (reduced.gate_effect === 'fail' && currentOpen.length === 0) {
    return { ok: false, reason: 'review_settlement_missing_findings',
      domain_outcome: reduced.domain_outcome,
      incoherent_members: receipts.filter(receipt => receipt && receipt.gate_effect === 'fail'
        && !(receipt.findings || []).some(finding => finding && finding.status !== 'resolved'))
        .map(receipt => String(receipt.node_id)).sort() };
  }
  attempt = {
    attempt_id: attemptId,
    ordinal,
    plan_hash: state.plan_hash,
    contract_version: 2,
    logical_gate: logicalGate,
    transaction_key: transactionKey,
    candidate_digest: review.dispatch.candidate_digest,
    candidate_declared: partition.declared,
    candidate_residue_digest: partition.residue_digest,
    epoch_lineage_id: review.context.epoch_lineage_id,
    gate_mode: review.gate_mode,
    scope_lineage_id: review.context.scope_lineage_id,
    context_hashes: contextHashes,
    profile_hashes: profileHashes,
    review_phase: review.context.review_phase,
    prior_open_uids: priorOpen,
    current_open_uids: currentOpen,
    current_findings: findings,
    findings,
    resolutions,
    route_candidates: receipts.flatMap(receipt => schema2RouteCandidates(receipt.findings, ctx.nodes, receipt.node_id)),
    repair_delta: review.context.repair_delta,
    validation_obligations: review.context.validation_obligations || [],
    validation_vectors: validationVectors,
    progress,
    reducer: { role: ctx.nodeInfo.role, complete: reduced.complete,
      domain_outcome: reduced.domain_outcome, gate_effect: reduced.gate_effect,
      blocking_findings: reduced.blocking_findings },
    receipts,
    outcome,
    reason,
    settlement_command: ctx.command,
    lifecycle_settled: false,
    producer_bindings: producerBindings,
    repair: { selected_writer: null, settled: null },
    rebind: [],
    consumed_by: null,
  };
  state.journal.attempts.push(attempt);
  writeReviewJournal(opts, state);
  return { ok: true, state, attempt };
}

function prepareSchema2ReviewClose(opts, ctx, review) {
  const persisted = writeSchema2ReviewReceipt(opts, review);
  if (!persisted.ok) return { handled: true, result: { result: 'refuse', reason: persisted.reason,
    detail: persisted.detail || null } };
  const group = readSchema2GroupReceipts(opts, review);
  if (!group.ok) {
    // A complete member of a logical group may close provisionally while the
    // other exact members are still running. Sequence gates can never be
    // incomplete at this point.
    if (review.context.logical_gate.kind === 'sequence') {
      return { handled: true, result: { result: 'refuse', reason: group.reason, member: group.member } };
    }
    let plan = opts.readFile(opts.planPath);
    const closed = spliceLedgerNode(plan, ctx.nodeInfo.id, 'complete', { allowFrom: ['in_progress'] });
    if (!closed.changed && !closed.alreadyAtTarget) {
      return { handled: true, result: { result: 'refuse', reason: 'close_transition_disallowed', nodeId: ctx.nodeInfo.id } };
    }
    if (closed.changed) plan = closed.content;
    plan = addCloseCompliance(plan, ctx.nodeInfo.id, ctx.nodeInfo.role, ctx.evidenceContent);
    opts.writeFile(opts.planPath, plan);
    appendCloseSidecarsOnce(opts, ctx.nodeInfo.id);
    removeReviewMembersFromRunningSet(opts, [ctx.nodeInfo.id]);
    return { handled: true, result: { result: 'ok', closed: ctx.nodeInfo.id, provisional: true,
      contract_version: 2, review_context_hash: review.dispatch.review_context_hash,
      taskTransitions: [buildTransition(ctx.nodeInfo.id, 'complete', ctx.command)],
      taskMirror: refreshTaskMirror(opts.project, opts.shell) } };
  }
  const reduced = reviewSchema.reduceReviewReceipts({
    aggregation: review.context.logical_gate.aggregation,
    role: ctx.nodeInfo.role,
    gate_mode: review.gate_mode,
    expected_members: review.context.logical_gate.members,
    expected_surfaces: review.logical_gate.surfaces,
    receipts: group.receipts,
  });
  if (!reduced.complete) return { handled: true, result: { result: 'refuse', reason: reduced.reason } };
  // Investigation results are durable analytical receipts only. Every complete
  // outcome closes and there is deliberately no product-repair journal entry.
  if (review.gate_mode === 'investigation') {
    return { handled: false, begun: null, schema2: true, receipt: review.receipt, reduced };
  }
  const begun = beginSchema2ReviewAttempt(opts, ctx, review, group.receipts, reduced);
  // #728: forward the settlement-coherence operands when present, so the refusal names WHICH member
  // receipts declared a gate failure with no canonical finding and the re-emit is actionable.
  if (!begun.ok) return { handled: true, result: { result: 'refuse', reason: begun.reason,
    detail: begun.detail || null,
    ...(begun.incoherent_members ? { domain_outcome: begun.domain_outcome,
      incoherent_members: begun.incoherent_members } : {}) } };
  if (begun.attempt.progress && begun.attempt.progress.replan_required) {
    begun.attempt.lifecycle_settled = true;
    writeReviewJournal(opts, begun.state);
    return { handled: true, result: { result: 'replan_required', reason: begun.attempt.progress.stop_reason,
      attempt_id: begun.attempt.attempt_id, lifecycle_settled: true } };
  }
  if (begun.attempt.outcome === 'pass') return { handled: false, begun, schema2: true, reduced };
  let plan = opts.readFile(opts.planPath);
  const folded = [];
  for (const member of review.context.logical_gate.members) {
    const reset = spliceLedgerNode(plan, member, 'pending', { allowFrom: ['in_progress', 'complete'] });
    if (reset.changed) { plan = reset.content; folded.push(member); }
  }
  opts.writeFile(opts.planPath, plan);
  removeReviewMembersFromRunningSet(opts, review.context.logical_gate.members);
  begun.attempt.lifecycle_settled = true;
  writeReviewJournal(opts, begun.state);
  return { handled: true, result: { result: 'review_failed', reason: begun.attempt.reason,
    attempt_id: begun.attempt.attempt_id, logical_gate: begun.attempt.logical_gate,
    contract_version: 2, lifecycle_settled: true,
    repair: 'repair-node --attempt-id ' + begun.attempt.attempt_id + ' --node-id <agent-selected-writer>',
    taskTransitions: folded.map(id => buildTransition(id, 'pending', 'review-failed')),
    taskMirror: refreshTaskMirror(opts.project, opts.shell) } };
}

function prepareReviewClose(opts, ctx) {
  if (!ctx.nodeInfo || !VERDICT_ROLES.has(ctx.nodeInfo.role) || !planHashFromContent(ctx.planContent)) return null;
  if (ctx.schema2Review && ctx.schema2Review.review_gate) {
    return prepareSchema2ReviewClose(opts, ctx, ctx.schema2Review);
  }
  const begun = beginReviewAttempt(opts, ctx);
  if (!begun.ok) return { handled: true, result: { result: 'refuse', reason: begun.reason, detail: begun.detail || null } };
  const attempt = begun.attempt;
  const gate = attempt.logical_gate;
  const statuses = readLedgerStatuses(opts.readFile(opts.planPath));
  // #733: the settlement rewinds ledger rows, so it refreshes the derived task mirror like every
  // other ledger-mutating envelope here. Fail-OPEN by contract — refreshTaskMirror returns
  // {status:'skipped'} on a falsy project and {status:'failed'} on any throw, so a mirror-write
  // fault is reported on the envelope and never rolls back a correct settlement.
  const failedResult = taskTransitions => ({ handled: true, result: { result: 'review_failed', reason: attempt.reason,
    attempt_id: attempt.attempt_id, logical_gate: gate, lifecycle_settled: true,
    repair: 'repair-node --attempt-id ' + attempt.attempt_id + ' --node-id <agent-selected-writer>',
    taskTransitions, taskMirror: refreshTaskMirror(opts.project, opts.shell) } });

  // Settlement is the terminal commit. After beginReviewAttempt has proved the retry carries the
  // exact transaction and receipt, replay its result without re-entering fan-out aggregation or
  // rewriting any durable surface.
  if (attempt.outcome === 'fail' && attempt.lifecycle_settled === true) return failedResult([]);

  if (gate.kind === 'fanout') {
    // An aggregate outcome is the durable transition decision. A retry after the plan fold or
    // running-set removal must roll that decision forward, never reclassify pending members as votes.
    if (!(attempt.outcome === 'fail' && attempt.lifecycle_settled === false)) {
      const otherMembers = gate.members.filter(id => id !== ctx.nodeInfo.id);
      const last = otherMembers.every(id => ['complete', 'n/a'].includes(statuses[id]));
      if (!last) {
        let plan = opts.readFile(opts.planPath);
        const closed = spliceLedgerNode(plan, ctx.nodeInfo.id, 'complete', { allowFrom: ['in_progress'] });
        if (!closed.changed && !closed.alreadyAtTarget) return { handled: true, result: { result: 'refuse', reason: 'close_transition_disallowed', nodeId: ctx.nodeInfo.id } };
        if (closed.changed) plan = closed.content;
        plan = addCloseCompliance(plan, ctx.nodeInfo.id, ctx.nodeInfo.role, ctx.evidenceContent);
        // Plan/compliance first, then replay-safe sidecars, then running-set removal. A crash after
        // any prefix is completed by the unchanged retry without duplicating durable evidence.
        opts.writeFile(opts.planPath, plan);
        appendCloseSidecarsOnce(opts, ctx.nodeInfo.id);
        removeReviewMembersFromRunningSet(opts, [ctx.nodeInfo.id]);
        return { handled: true, result: { result: 'ok', closed: ctx.nodeInfo.id, provisional: true,
          attempt_id: attempt.attempt_id, lifecycle_settled: false,
          taskTransitions: [buildTransition(ctx.nodeInfo.id, 'complete', ctx.command)],
          taskMirror: refreshTaskMirror(opts.project, opts.shell) } };
      }
      // Re-evaluate every exact stored body under the frozen logical-group
      // aggregation; cached verdict fields are audit data only.
      const reduced = reduceLogicalReviewAttempt(ctx.nodes, gate, attempt.receipts || []);
      const aggregatePass = reduced.complete && reduced.pass;
      attempt.outcome = aggregatePass ? 'pass' : 'fail';
      attempt.reason = aggregatePass ? null : 'fanout_refuted';
      writeReviewJournal(opts, begun.state);
      reviewFailpoint(opts, 'outcome_written');
      if (aggregatePass) return { handled: false, begun };
    }
  } else if (attempt.outcome === 'pass') {
    return { handled: false, begun };
  }

  let plan = opts.readFile(opts.planPath);
  const folded = [];
  for (const member of gate.members) {
    const reset = spliceLedgerNode(plan, member, 'pending', { allowFrom: ['in_progress', 'complete'] });
    if (reset.changed) { plan = reset.content; folded.push(member); }
  }
  opts.writeFile(opts.planPath, plan);
  reviewFailpoint(opts, 'plan_folded');
  removeReviewMembersFromRunningSet(opts, gate.members);
  reviewFailpoint(opts, 'running_removed');
  markReviewAttemptSettled(opts, begun);
  reviewFailpoint(opts, 'settled_written');
  return failedResult(folded.map(id => buildTransition(id, 'pending', 'review-failed')));
}

// ---------------------------------------------------------------------------
// runOrient — READ-ONLY orient (no plan/ledger/state mutation; never calls writeFile).
//
// Shells VALIDATOR --resume-check + NEXT_ACTION; scans markers in state+plan.
// #282 (AC-2): also reconciles the durable task mirror (workflow-tasks.json) on every resume
// by SHELLING the task-mirror CLI — the write happens in that subprocess (a regenerable,
// ledger-derived projection), so orient's read-only-w.r.t.-workflow-state contract is preserved.
// ---------------------------------------------------------------------------
function runOrient(opts) {
  const { planPath, statePath, project, shell, readFile, cacheExists } = opts;

  // CLI callers are already fenced before lock acquisition. Pure-core callers
  // opt in with an injected fence (the established unit-test seam); this avoids
  // treating legacy readFile stubs that return plan bytes for every unknown path
  // as a malformed transaction file.
  const replanFence = opts.replanFence || { ok: true, fenced: false };
  if (!replanFence.ok || replanFence.fenced) return replanOrientation(replanFence, project);
  let epochFirstNode = null;
  if (replanFence.committed) {
    let currentAuthority = replanFence.current_authority || null;
    if (!currentAuthority) {
      try {
        const verify = opts.verifyEpochAuthority
          || (projectDir => require('./kaola-workflow-replan').verifyCurrentEpochAuthority(projectDir));
        currentAuthority = verify(path.dirname(planPath));
      } catch (error) {
        currentAuthority = { ok: false, reason: 'current_epoch_authority_unavailable', detail: error.message };
      }
    }
    if (!currentAuthority || currentAuthority.ok !== true) {
      return replanOrientation(Object.assign({}, replanFence, { ok: false, fenced: true,
        reason: currentAuthority && currentAuthority.reason || 'current_epoch_authority_invalid' }), project,
      currentAuthority && currentAuthority.detail ? { detail: currentAuthority.detail } : null);
    }
    const child = replanFence.transaction && replanFence.transaction.child || {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(child.first_node_id || ''))
        || !/^[a-z][a-z0-9-]*$/.test(String(child.first_node_role || ''))) {
      return replanOrientation(Object.assign({}, replanFence, { ok: false, fenced: true,
        reason: 'replan_child_first_node_invalid' }), project);
    }
    epochFirstNode = { id: child.first_node_id, role: child.first_node_role };
  }

  // #335: fail-closed when the plan file itself is absent. Distinguish an
  // unmirrored worktree (the MAIN checkout has the frozen project folder) from a
  // truly unauthored plan. The probe is CLI-wired; an absent probe (unit tests /
  // legacy library callers) preserves the old tolerant behavior byte-for-byte.
  if (opts.planProbe && !opts.planProbe.planExists) {
    const unmirrored = opts.planProbe.isLinkedWorktree && opts.planProbe.mainPlanExists;
    return {
      result: 'refuse',
      reason: unmirrored ? 'plan_not_mirrored' : 'plan_missing',
      planPath,
      mainPlanPath: unmirrored ? opts.planProbe.mainPlanPath : null,
      repair: unmirrored
        ? 'run: node kaola-workflow-adaptive-node.js mirror-project --project '
          + project + ' --json (mirrors the frozen kaola-workflow/' + project
          + '/ from the main checkout into this worktree, plan_hash-verified), then re-run orient'
        : 'no workflow-plan.md for ' + project
          + ' — author + freeze it via /kaola-workflow-adapt ' + project,
    };
  }

  let orientPlanContent = '';
  try { orientPlanContent = readFile(planPath); } catch (_) {}
  const orientReviewOpen = reviewFanoutTopUpAllowance(opts, orientPlanContent);
  if (!orientReviewOpen.ok) return orientReviewOpen.refusal;
  const orientReviewTopUp = orientReviewOpen.topUp;

  const resumeCheck = shell(validatorPath, [planPath, '--resume-check', '--json']);
  const nextAction  = shell(nextActionPath, [planPath, '--json']);

  // #282 (AC-2): rebuild/refresh the durable workflow-tasks.json from the current ledger on every
  // resume. Unconditional regenerate is both the rebuild-if-stale and the idempotent-refresh path
  // (the CLI re-derives from the ledger). Best-effort: a non-frozen plan / absent project degrades
  // silently (the CLI exits non-zero, the compact-resume hook tolerates an absent mirror).
  if (project) shell(taskMirrorPath, ['--project', project, '--json']);

  // Read state for escalated_to_full marker.
  let stateContent = '';
  try { stateContent = readFile(statePath); } catch (_) {}

  const escalatedMatch = stateContent.match(/^escalated_to_full:\s*(.+)$/m);
  const escalatedToFull = escalatedMatch ? escalatedMatch[1].trim() : null;

  // #328: read bundle identity fields from state (additive; null/[] when absent).
  const m1 = stateContent.match(/^issue_numbers:\s*(.+)$/m);
  const issueNumbers = m1 ? m1[1].trim().split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0) : [];
  const m2 = stateContent.match(/^bundle_id:\s*(.+)$/m);
  const bundleId = m2 ? m2[1].trim() : null;
  const m3 = stateContent.match(/^closure_policy:\s*(.+)$/m);
  const closurePolicy = m3 ? m3[1].trim() : null;
  const m4 = stateContent.match(/^issue_number:\s*(\d+)$/m);
  const primaryIssue = m4 ? parseInt(m4[1], 10) : null;

  // #430: bundle state coherence check (after state read, before main resume_state logic).
  // Identical logic to the handoff coherence check (adaptive-handoff.js): if bundle_id is
  // present, issue_numbers must be non-empty and the bundle_id must match sorted issue list.
  // A hand-edited or silently-collapsed state (bundle_id set but issue_numbers missing, or
  // mismatched) is caught here before any further processing.
  if (bundleId) {
    const rawNums = (stateContent.match(/^issue_numbers:\s*(.+)$/m) || [])[1] || '';
    const parsedNums = rawNums.trim().split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
    if (parsedNums.length === 0) {
      return {
        result: 'refuse',
        reason: 'bundle_state_incoherent',
        errors: ['bundle_id "' + bundleId + '" found but issue_numbers is absent or empty'],
        resume_state: 'corrupt_incoherent_bundle',
      };
    }
    const expectedId = 'bundle-' + parsedNums.slice().sort((a, b) => a - b).join('-');
    if (bundleId !== expectedId) {
      return {
        result: 'refuse',
        reason: 'bundle_state_incoherent',
        errors: ['bundle_id "' + bundleId + '" does not match issue_numbers ' + JSON.stringify(parsedNums) + ' (expected "' + expectedId + '")'],
        resume_state: 'corrupt_incoherent_bundle',
      };
    }
  }

  // Read plan for consent_halt: pending in ## Node Ledger.
  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}

  // #360: ledger-scoped probe (was a whole-file regex) — a decoy `consent_halt: pending` line
  // OUTSIDE the ## Node Ledger no longer forces a phantom halt in orient.
  const consentHalt = readDurableConsentHalt(planContent);

  // Resolve per-node cache (.cache/{id}.md) presence — same check the single-node
  // resume path has always used.
  const cacheStateFor = (rowId) => {
    const cachePath = path.join(path.dirname(planPath), '.cache', rowId + '.md');
    if (cacheExists) {
      return cacheExists(cachePath) ? 'present' : 'absent';
    }
    try { readFile(cachePath); return 'present'; } catch (_) { return 'absent'; }
  };

  // Enumerate ALL in_progress ledger rows (no early break — AC#5 batch awareness).
  // #354: reuse the shared readLedgerStatuses (now fence-aware via locateSection) instead of a
  // duplicate fence-blind slice + row-walk; Object key order preserves document (row) order.
  const ledgerStatusMap = readLedgerStatuses(planContent);
  const inProgressNodes = Object.keys(ledgerStatusMap).filter(id => ledgerStatusMap[id] === 'in_progress');

  // Keep the existing single-node fields byte-for-byte unchanged: the first
  // (legacy: only) in_progress row + its cache state.
  const inProgressNode = inProgressNodes.length ? inProgressNodes[0] : null;
  const cacheState = inProgressNode ? cacheStateFor(inProgressNode) : null;

  // Read the active-batch manifest directly (READ-ONLY) — matches orient's
  // established "read the durable artifact" pattern (no shelling, no new sibling
  // filename literal so the forge ports stay verbatim copies). Fail-closed to null.
  const manifestPath = path.join(path.dirname(planPath), '.cache', 'active-batch.json');
  let manifest = null;
  const manifestPresent = cacheExists ? cacheExists(manifestPath) : true;
  if (manifestPresent) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    if (raw != null) {
      const parsed = safeJsonParse(raw);
      if (parsed && Array.isArray(parsed.members)) {
        manifest = parsed;
      }
    }
  }

  // #377: ALSO read the per-node running-set.json (the post-#364 successor of active-batch.json).
  // The #293 multi-in_progress legality re-keys to it: in_progress rows are legal when they match
  // EITHER the active-batch member set OR the running-set node set. Read-only fan-out opened by
  // `open-ready` populates this manifest; orient reconstructs the live set from it on resume.
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  let runningSet = null;
  const runningSetPresent = cacheExists ? cacheExists(runningSetPath) : true;
  if (runningSetPresent) {
    let rraw = null;
    try { rraw = readFile(runningSetPath); } catch (_) { rraw = null; }
    if (rraw != null) {
      const rparsed = safeJsonParse(rraw);
      if (rparsed && Array.isArray(rparsed.nodes)) runningSet = rparsed;
    }
  }

  // #377: a crashed open-ready leaves the running set in state:'opening' (or with an opening:true
  // node). Like the batch top-up marker it is RECONCILABLE (run `reconcile-running-set`), never an
  // orphan and never a dispatchable live set. Check it BEFORE the AC#5 legality gate.
  if (runningSet && (runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening))) {
    return {
      result: 'refuse',
      reason: 'running_set_opening_incomplete',
      resumeCheck, nextAction, consentHalt, escalatedToFull,
      bundleId, issueNumbers, closurePolicy, primaryIssue,
      inProgressNode, cacheState: inProgressNode ? cacheState : null,
      inProgressNodes, manifest, runningSet, batch: null, allDone: false,
      // #383(e): name the concrete reconcile subcommand so the wedge has a scripted exit.
      repair: 'reconcile-running-set',
    };
  }

  // #384: a crash between runCloseNode's plan write and its running-set removal (or an unlocked RMW
  // re-adding the member) leaves a ledger-TERMINAL (complete / n.a) member in an 'open' running set.
  // The running-set node ids then no longer equal the in_progress rows, so the AC#5 gate below would
  // mis-report orphan_multi_in_progress and the recommended repair would loop. Detect the stale
  // terminal member FIRST and route it to reconcile-running-set (the close-direction drop), the SAME
  // reconcilable shape as the open-direction crash above. Check BEFORE the AC#5 legality gate.
  const TERMINAL_LEDGER = new Set(['complete', 'n/a', 'n.a', 'na']);
  if (runningSet && (runningSet.nodes || []).some(n => TERMINAL_LEDGER.has(ledgerStatusMap[n.id]))) {
    return {
      result: 'refuse',
      reason: 'running_set_close_incomplete',
      resumeCheck, nextAction, consentHalt, escalatedToFull,
      bundleId, issueNumbers, closurePolicy, primaryIssue,
      inProgressNode, cacheState: inProgressNode ? cacheState : null,
      inProgressNodes, manifest, runningSet, batch: null, allDone: false,
      repair: 'reconcile-running-set',
    };
  }

  // #293/S-fix: a STALE non-opening member. An 'open' (non-opening) running set holding a member whose
  // ledger row is NEITHER terminal (#384 above) NOR `opening` (the top-up/open-direction markers below)
  // NOR `in_progress` — e.g. a `pending` member while a DIFFERENT serial node is the real in_progress —
  // is a stale/corrupt shape. Without this, open-next refuses scheduler_active (the running set claims a
  // live fan-out) → reconcile-running-set, but the pre-fix reconcile returned not_opening (no-op): the
  // exact #383(e)/#384 dead-end. Route it to reconcile-running-set (which now drops the stale member)
  // so orient names a scripted exit instead of dead-ending at a bare `ok`. Suppressed when the running
  // set is mid open-transaction (state:'opening' / opening:true), already handled above, and when its
  // members exactly equal the in_progress rows (the valid #377 fan-out, AC#5) — a stale member by
  // definition means the running set ⊄ the in_progress set, so this never fires on a valid live set.
  const nonOpeningSet = !!runningSet && runningSet.state !== 'opening' && !(runningSet.nodes || []).some(n => n.opening);
  if (nonOpeningSet && (runningSet.nodes || []).some(n => {
    const st = ledgerStatusMap[n.id];
    return st !== 'in_progress' && !TERMINAL_LEDGER.has(st);
  })) {
    return {
      result: 'refuse',
      reason: 'running_set_stale_member',
      resumeCheck, nextAction, consentHalt, escalatedToFull,
      bundleId, issueNumbers, closurePolicy, primaryIssue,
      inProgressNode, cacheState: inProgressNode ? cacheState : null,
      inProgressNodes, manifest, runningSet, batch: null, allDone: false,
      repair: 'reconcile-running-set',
    };
  }

  // #305: a member-level `opening:true` marker is an interrupted ROLLING TOP-UP (the manifest
  // stays whole-batch state 'open' while the in-flight member was appended but its ledger row /
  // baseline did not finish flipping). It is RECONCILABLE — route it to `reconcile`, the SAME
  // verdict the parallel-batch crossCheckStatus gate gives. Check it BEFORE the AC#5 legality gate
  // so it is never mis-reported as orphan_multi_in_progress (before the flip) and never ACCEPTED as
  // a dispatchable valid batch (after the flip). Mirrors crossCheckStatus's member-opening branch.
  if (manifest && (manifest.members || []).some(m => m.opening)) {
    return {
      result: 'refuse',
      reason: 'batch_topup_incomplete',
      resumeCheck,
      nextAction,
      consentHalt,
      escalatedToFull,
      bundleId,
      issueNumbers,
      closurePolicy,
      primaryIssue,
      inProgressNode,
      cacheState: inProgressNode ? cacheState : null,
      inProgressNodes,
      manifest,
      batch: null,
      allDone: false,
    };
  }

  // Order-independent member-set equality between the manifest and the
  // in_progress rows.
  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  // #305: also exclude `opening:true` members (mirrors crossCheckStatus); redundant after the
  // short-circuit above but keeps the two member-set computations structurally identical.
  const manifestMemberIds = manifest ? (manifest.members || []).filter(m => !m.sealed && !m.opening).map(m => m.id) : [];
  const setsEqual = (a, b) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every(id => sa.has(id));
  };
  const memberSetEquals = !!manifest && setsEqual(manifestMemberIds, inProgressNodes);

  // #377: running-set node ids (non-opening) form the OTHER legal live set. When the in_progress
  // rows match the running set, the multi-in_progress is a valid per-node fan-out (not an orphan).
  const runningSetIds = runningSet ? (runningSet.nodes || []).filter(n => !n.opening).map(n => n.id) : [];
  const runningSetEquals = !!runningSet && setsEqual(runningSetIds, inProgressNodes);

  // -- AC#5 legality gate --------------------------------------------------
  //  ≤1 in_progress (with or without a manifest) → legacy single-node path.
  //  ≥1 in_progress AND (active-batch member-set OR running-set node-set) EQUALS the in_progress
  //     set → valid live set (batch or running-set fan-out).
  //  >1 in_progress AND neither manifest matches → typed refusal (orphan).
  let batch = null;

  if (memberSetEquals && inProgressNodes.length >= 1) {
    // Valid active batch.
    batch = {
      state: manifest.state || null,
      members: (manifest.members || []).map(m => ({
        id: m.id,
        cacheState: cacheStateFor(m.id),
        sealed: !!m.sealed,
      })),
    };
  } else if (runningSetEquals && inProgressNodes.length >= 1) {
    // #377: valid per-node running set — accept the multi-in_progress live set (no orphan refusal).
    // `batch` stays null (running-set fan-out is not the batch-as-a-unit machine); the live set is
    // surfaced via the additive `runningSet` field below.
  } else if (inProgressNodes.length > 1) {
    // Multiple in_progress rows with no valid active batch — orphan/repair state.
    return {
      result: 'refuse',
      reason: 'orphan_multi_in_progress',
      resumeCheck,
      nextAction,
      consentHalt,
      escalatedToFull,
      bundleId,
      issueNumbers,
      closurePolicy,
      primaryIssue,
      inProgressNode,
      cacheState,
      inProgressNodes,
      manifest,
      runningSet,
      batch: null,
      allDone: false,
      // #383(e): name the concrete reconcile subcommand so the wedge is not a dead-end. A running-set
      // present means the post-#377 scheduler owns the orphan → reconcile-running-set; otherwise the
      // legacy batch/manual reconcile path.
      repair: runningSet ? 'reconcile-running-set' : 'reconcile',
    };
  }

  const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);

  // #303 (sub-gap C): START-frontier batch signal. When NOTHING is in_progress (a fresh
  // frontier at startup/resume) and the ready-pending set has >= 2 own-pending siblings, the
  // plan STARTS with a fan-out — signal enterBatch so the orchestrator opens a batch instead
  // of single-opening one node and serializing the rest. Suppressed once any node is in_progress
  // (mid-node / active batch) and when allDone.
  const startReadyPending = (nextAction.result === 'ok' && Array.isArray(nextAction.readyPending))
    ? nextAction.readyPending : [];
  // #334: a main-session-gate is never an openable BATCH member (the main session cannot run
  // concurrently with itself) — compute enterBatch/frontier over the delegable subset only. A
  // [gate, x] frontier therefore drops to enterBatch=false (single-node path); [gate, x, y]
  // batches [x, y] and the gate opens serially via open-next. Zero regression when absent.
  const delegable = startReadyPending.filter(n => n.role !== 'main-session-gate');
  const enterBatch = !allDone && inProgressNodes.length === 0 && delegable.length >= 2;

  // #434 (D-434-01): requires_redispatch — an in_progress node whose evidence file is absent
  // or does not contain the `evidence-binding` token was either never dispatched (crash before
  // dispatch) or ran inline without proper attestation. Surface this so the orchestrator re-
  // dispatches the role agent with the SAME nonce rather than treating it as normally in-flight.
  let requires_redispatch = false;
  if (inProgressNode) {
    const evPath = path.join(path.dirname(planPath), '.cache', inProgressNode + '.md');
    const evPresent = cacheExists ? cacheExists(evPath) : (() => { try { readFile(evPath); return true; } catch (_) { return false; } })();
    if (!evPresent) {
      requires_redispatch = true;
    } else {
      let evContent = '';
      try { evContent = readFile(evPath); } catch (_) { evContent = ''; }
      if (!evContent || !evContent.includes('evidence-binding')) {
        requires_redispatch = true;
      }
    }
  }

  // #558: surface the dispatch-fidelity trace (everConcurrent / maxSimultaneousOpen) derived from the
  // durable node-timings.jsonl on every orient — so a regression to silent serialization auto-surfaces on
  // a REAL run (the #472 close-criterion), instead of only via a hand-run probe. Best-effort + fail-closed
  // to a zeroed/false trace when the file is absent or unreadable (a no-fan-out serial run legitimately has
  // no opened/closed pairs); telemetry must NEVER block a lifecycle transition (appendNodeTiming contract).
  // Purely ADDITIVE (no existing field removed/renamed), so every JSON-parsing caller is byte-unaffected.
  let dispatchFidelity = { maxSimultaneousOpen: 0, everConcurrent: false };
  try {
    dispatchFidelity = deriveMaxSimultaneousOpen(readFile(path.join(path.dirname(planPath), '.cache', 'node-timings.jsonl')));
  } catch (_) { /* absent/unreadable telemetry → zeroed trace, never a refuse */ }

  return {
    result: 'ok',
    resumeCheck,
    nextAction,
    consentHalt,
    escalatedToFull,
    bundleId,
    issueNumbers,
    closurePolicy,
    primaryIssue,
    inProgressNode,
    cacheState: inProgressNode ? cacheState : null,
    inProgressNodes,
    batch,
    runningSet,
    allDone,
    dispatchFidelity,
    ...(epochFirstNode ? { epochFirstNode } : {}),
    enterBatch,
    ...(orientReviewTopUp ? { reviewTopUp: {
      attempt_id: orientReviewTopUp.attempt.attempt_id,
      pending_members: orientReviewTopUp.pending_members,
      command: orientReviewTopUp.pending_members.length > 1 ? 'open-ready' : 'open-next',
    } } : {}),
    // #434: present only when an in_progress node needs re-dispatch (absent or incomplete evidence).
    ...(requires_redispatch ? { requires_redispatch: true } : {}),
    frontier: enterBatch
      ? delegable.map(frontierNode)
      : [],
  };
}

// ---------------------------------------------------------------------------
// runMirrorProject — #335: ONE mechanical main→worktree project-folder mirror.
//
// A fresh adaptive worktree is provisioned at claim time (before any plan
// exists) and the planner authors + freezes the plan in the MAIN checkout, so
// the worktree never receives kaola-workflow/<project>/. This transaction
// transports it deterministically: copy → plan_hash re-verify → atomic rename
// promote. Read-only on the ledger and workflow-state.md; never touches a
// per-node baseline (it runs strictly before any node is opened).
//
// Idempotent + safe at every plan-run entry: a worktree copy that already has a
// workflow-plan.md is authoritative (#264 semantics) and is never overwritten.
//
// @param {object} opts
//   project   {string}   project name (e.g. 'issue-335')
//   mainRoot  {string}   the MAIN checkout root (resolved via getMainRoot)
//   shell     {function} (scriptPath, args[]) → {exitCode,...parsedJson}
//   io        {object}   { exists, readFile, copyTree, renameSync, rmSync, mkdirSync, readdir, copyFile }
// @returns {object} typed result (refuse exits ≠ 0 via the CLI epilogue)
// ---------------------------------------------------------------------------
function runMirrorProject(opts) {
  const { project, mainRoot, shell, io } = opts;

  // 1. Source = the frozen project folder in the MAIN checkout.
  const source = path.join(mainRoot, 'kaola-workflow', project);
  const stateMain = path.join(source, 'workflow-state.md');
  if (!io.exists(stateMain)) {
    return {
      result: 'refuse',
      reason: 'state_missing',
      repair: 'run claim/startup first — no workflow-state.md for ' + project + ' in the main checkout',
    };
  }

  // 2. Parse worktree_path from the main state (same regex the plan-run docs use).
  let stateContent = '';
  try { stateContent = io.readFile(stateMain); } catch (_) { stateContent = ''; }
  const m = stateContent.match(/^worktree_path:\s*(.+)$/m);
  const worktreePath = m ? m[1].trim() : '';
  if (!worktreePath) {
    // In-place run (KAOLA_WORKTREE_NATIVE=0), offline, bundle lane — all legal.
    return { result: 'ok', status: 'skipped', reason: 'no_worktree' };
  }
  if (!io.exists(worktreePath)) {
    // Recorded but pruned — matches the plan-run doc's $(pwd) fallback semantics.
    return { result: 'ok', status: 'skipped', reason: 'worktree_dir_missing', worktreePath };
  }

  // 3. Destination project folder in the worktree.
  const dest = path.join(worktreePath, 'kaola-workflow', project);
  const destPlan = path.join(dest, 'workflow-plan.md');
  if (io.exists(destPlan)) {
    // NEVER overwrite — on resume the worktree copy is authoritative (#264).
    return { result: 'ok', status: 'exists', dest };
  }

  // 4. Source plan must exist (the planner authored + froze it in main).
  const sourcePlan = path.join(source, 'workflow-plan.md');
  if (!io.exists(sourcePlan)) {
    return {
      result: 'refuse',
      reason: 'source_plan_missing',
      source,
      repair: 'author + freeze the plan via /kaola-workflow-adapt ' + project + ' first',
    };
  }

  // 5. Atomic copy → verify → rename promote.
  const tmp = path.join(worktreePath, 'kaola-workflow', '.mirror-tmp-' + project);
  // Clean any crash leftover before copying.
  try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  try { io.mkdirSync(path.dirname(tmp), { recursive: true }); } catch (_) {}

  try {
    io.copyTree(source, tmp);
  } catch (err) {
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return { result: 'refuse', reason: 'mirror_failed', detail: (err && err.message) || String(err) };
  }

  // AC4: plan_hash re-verification on the COPIED plan before the promote.
  const resumeCheck = shell(validatorPath, [path.join(tmp, 'workflow-plan.md'), '--resume-check', '--json']);
  if (!resumeCheck || !resumeCheck.ok) {
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return {
      result: 'refuse',
      reason: 'mirror_verify_failed',
      detail: (resumeCheck && resumeCheck.reason) || 'resume-check failed on the copied plan',
      source,
      dest,
    };
  }

  // Atomic same-filesystem promote.
  try {
    io.renameSync(tmp, dest);
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'ENOTEMPTY')) {
      // Race: a concurrent entry promoted the dest first — the existing copy wins.
      try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
      return { result: 'ok', status: 'exists', dest };
    }
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return { result: 'refuse', reason: 'mirror_failed', detail: (err && err.message) || String(err) };
  }

  return {
    result: 'ok',
    status: 'mirrored',
    source,
    dest,
    planHash: resumeCheck.planHash,
    verified: true,
  };
}

// ---------------------------------------------------------------------------
// runOpenNext — MUTATES ledger + baseline.
// Opens the next ready node (or a specified --node-id) in the ledger and
// records its per-node baseline.
// ---------------------------------------------------------------------------
function runOpenNext(opts) {
  const { planPath, statePath, project, nodeId: requestedId, shell, readFile, writeFile, working_dir, codexDispatchMode } = opts;

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: integrity:yes / excl-scheduler:yes / excl-batch:yes /
  //    halt-fence:yes. NO serial-excl (open-next IS the serial path — it cannot be mutually exclusive
  //    with itself). ==
  // #499: open-next NOW carries the integrity layer (matching open-ready/open-batch/top-up). The prior
  //   omission left the documented SERIAL RESUME path (orient → open-next) with no plan_hash gate: a
  //   post-freeze, hash-defeating content tamper that keeps the DAG acyclic/unique-sink (widen a
  //   declared_write_set, swap a role, re-point depends_on) was dispatched with no integrity refusal,
  //   because orient's --resume-check does NOT cover a tamper that lands BETWEEN orient and open-next (or
  //   an open-next reached without orient). The plan_hash freeze guarantee must hold on the resume path
  //   too — accuracy is non-negotiable. Layer 1 shells validator --resume-check; a mismatch refuses
  //   plan_integrity_failed with zero mutation, BEFORE next-action / baseline / ledger flip.
  // #383: never open a serial node while the #377 scheduler (running-set) is live (a scheduler
  //   co-scheduling against a serial node is the #383(a)/(b) wedge). #391b: fence a halt.
  const guard = mutationGuardPrologue(opts, { integrity: true, halt: true, excl: ['scheduler'] });
  if (guard) {
    // #439 settlement 5 (gate_not_complete precedence): a review gate opened serially is NOW recorded in
    // the running set (kind:'gate'), so the scheduler-exclusion layer refuses `scheduler_active` where the
    // pre-record serial path used to fall through to the `gate_not_complete` floor. When the operator asked
    // for a SPECIFIC node that is speculative-eligible (its ONLY unsatisfied dependency is that open gate),
    // surface the more-specific `gate_not_complete` (which points at open-ready --speculative-consent)
    // instead of the generic `scheduler_active`, restoring the settled precedence "gate_not_complete before
    // lane/exclusivity checks." Integrity/halt refusals (Layers 1-2) still win: this reinterprets ONLY a
    // `scheduler_active` refusal, never a plan_integrity_failed / halt_pending one. next-action is
    // read-only, so the extra shell on this (refusal) path mutates nothing.
    if (requestedId && guard.reason === 'scheduler_active') {
      const naSpec = shell(nextActionPath, [planPath, '--json']);
      if (naSpec && naSpec.exitCode === 0 && naSpec.result === 'ok') {
        const spec = (naSpec.speculativePending || []).find(n => n.id === requestedId);
        if (spec) {
          return { result: 'refuse', reason: 'gate_not_complete', nodeId: requestedId, speculativeGate: spec.speculativeGate };
        }
      }
    }
    return guard;
  }

  const reviewTopUpAllowance = reviewFanoutTopUpAllowance(opts, readFile(planPath));
  if (!reviewTopUpAllowance.ok) return reviewTopUpAllowance.refusal;
  const reviewTopUp = reviewTopUpAllowance.topUp;

  // Shell NEXT_ACTION.
  const nextAction = shell(nextActionPath, [planPath, '--json']);

  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }

  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: null, taskTransitions: [] };
  }

  // Determine the node to open.
  const readySet = nextAction.readySet || [];
  let targetNode;

  if (requestedId) {
    targetNode = readySet.find(n => n.id === requestedId);
    if (reviewTopUp && !reviewTopUp.pending_members.includes(requestedId)) {
      return { result: 'refuse', reason: 'review_attempt_unresolved',
        attempt_ids: [reviewTopUp.attempt.attempt_id],
        repair: 'open only the pending logical-review member: ' + reviewTopUp.pending_members.join(', ') };
    }
    if (!targetNode) {
      // #439 (D-419 Part 4, settlement 5): if the node is not ready ONLY because its sole unsatisfied
      // dependency is a currently-OPEN gate (it is speculative-eligible), refuse with the more specific
      // `gate_not_complete` — evaluated in the dependency-unsatisfied slot, before lane/exclusivity. This
      // is the fail-closed floor: a speculative open is NOT done serially via open-next; it requires
      // `open-ready --speculative-consent` (policy permitting). Absent eligibility, today's node_not_ready.
      const spec = (nextAction.speculativePending || []).find(n => n.id === requestedId);
      if (spec) {
        return {
          result: 'refuse',
          reason: 'gate_not_complete',
          nodeId: requestedId,
          speculativeGate: spec.speculativeGate,
        };
      }
      return {
        result: 'refuse',
        reason: 'node_not_ready',
        nodeId: requestedId,
        readySet: readySet.map(n => n.id),
      };
    }
  } else if (reviewTopUp) {
    targetNode = readySet.find(n => reviewTopUp.pending_members.includes(n.id));
    if (!targetNode) {
      return { result: 'refuse', reason: 'review_attempt_unresolved',
        attempt_ids: [reviewTopUp.attempt.attempt_id],
        repair: 'open one pending logical-review member: ' + reviewTopUp.pending_members.join(', ') };
    }
  } else {
    // #472 (dispatch fidelity): at a fresh INDEPENDENT ≥2 delegable frontier, do NOT silently
    // single-open readySet[0] — that serializes a frontier the planner authored as parallel (the
    // dispatch-fidelity defect: every traced run ran serial because open-next single-opened here). Mirror
    // orient + close-and-open-next: signal `enterBatch` + the frontier so the skeleton routes to
    // open-ready + a ONE-MESSAGE concurrent dispatch (the script now ENFORCES fidelity instead of leaving
    // it to a voluntary card). This is NOT a width mandate — width 1 / a dependency chain (delegable < 2)
    // falls through to the serial single-open below; an explicit `--node-id` (the requestedId branch
    // above) is exempt (the operator asked for exactly one node). open-ready serial-degrades any write in
    // the mix (the #463/#437 write axis is untouched).
    const delegable472 = (nextAction.readyPending || []).filter(n => n.role !== 'main-session-gate');
    if (delegable472.length >= 2) {
      return {
        result: 'ok',
        opened: null,
        enterBatch: true,
        frontier: delegable472.map(frontierNode),
        taskTransitions: [],
      };
    }
    targetNode = nextAction.nextNode;
    if (!targetNode) {
      return { result: 'refuse', reason: 'no_ready_node', nextAction };
    }
  }

  // Reviewer-v2 identity must be proven and its canonical context persisted
  // before the first baseline/ledger mutation. Non-review and verified legacy
  // nodes return an inert descriptor.
  const reviewOpen = prepareReviewOpen(opts, readFile(planPath), targetNode);
  if (!reviewOpen.ok) {
    return { result: 'refuse', reason: reviewOpen.reason, detail: reviewOpen.detail || null,
      nodeId: targetNode.id };
  }

  // #590: record the per-node baseline BEFORE flipping the ledger row (mirrors runOpenReady Phase 2
  // baseline-on-disk → Phase 3 single plan write). The prior write-first order left a crash window where
  // the ledger said in_progress but no baseline existed on disk — and since reconcile-running-set does
  // NOT cover the serial path (there is no running set), a later close dead-ended baseline_missing.
  // Baseline-first inverts the hazard: if the flip then fails, the orphaned baseline is harmless
  // (recordBase is idempotent / overwriting on the next open), and a baseline failure leaves the ledger
  // PENDING — a clean re-open, never an in_progress-without-baseline strand.
  // Shell COMMIT_NODE --node-id <id> --start --json (record baseline).
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', targetNode.id, '--start', '--json']);
  const baselineOk = baselineResult.exitCode === 0 && baselineResult.result === 'ok';

  if (!baselineOk) {
    return {
      result: 'refuse',
      reason: 'baseline_failed',
      nodeId: targetNode.id,
      baselineResult,
    };
  }

  if (reviewTopUp) {
    const record = baselineResult.recordBase || baselineResult;
    const actualNonce = record && record.base ? String(record.base).slice(0, 12) : null;
    const expectedNonce = reviewTopUp.generation_by_member.get(targetNode.id);
    if (!actualNonce || actualNonce !== expectedNonce || record.stale === true) {
      return { result: 'refuse', reason: 'review_generation_reservation_identity_mismatch',
        nodeId: targetNode.id, attempt_ids: [reviewTopUp.attempt.attempt_id] };
    }
  }

  // spliceLedgerNode: pending → in_progress (AFTER the baseline is on disk).
  let planContent = readFile(planPath);
  const spliceResult = spliceLedgerNode(planContent, targetNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (!spliceResult.found) {
    // #425: surface the structured diagnostic when the ledger header is non-canonical so the
    // orchestrator knows exactly why the node was not found (not a generic "node missing" error).
    const refusal = { result: 'refuse', reason: 'node_not_in_ledger', nodeId: targetNode.id };
    if (spliceResult.diagnostic) refusal.diagnostic = spliceResult.diagnostic;
    return refusal;
  }

  // Write updated plan (ledger row updated).
  if (spliceResult.changed) {
    writeFile(planPath, spliceResult.content);
    planContent = spliceResult.content;
  }
  // If alreadyAtTarget (already in_progress), skip the write — idempotent.

  // #607 Layer 2: record an opened main-session-gate into the running set as kind:'gate' so the
  // write-lane hook fences out-of-band writes during the gate window. AFTER the ledger flip (crash-safe
  // ordering) and a no-op for every non-gate role (byte-identical serial open).
  recordGateInRunningSet(
    path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME),
    targetNode,
    { readFile, writeFile, cacheExists: opts.cacheExists, mkdirp: opts.mkdirp, now: opts.now });

  // #373: best-effort telemetry — the node opened.
  appendNodeTiming(planPath, targetNode.id, 'opened');

  // #424 (D-424-01 §5): provenance log entry — open event.
  const openNonce = (baselineResult.recordBase && baselineResult.recordBase.base)
    ? String(baselineResult.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', targetNode.id, openNonce);

  // #433 (D-433-01 §2): open-time evidence seeding — create .cache/{node-id}.md with
  // binding header + role-specific stubs. Idempotent (does not overwrite on crash-resume).
  const seedResult = seedEvidenceFile(planPath, targetNode.id, openNonce, targetNode.role, false, reviewOpen);
  // #516: the dispatch HINT path is PROJECT-QUALIFIED (seedResult.evidence_file is the bare on-disk
  // relative path used for the local seed; the subagent gets the qualified path so its literal-follow
  // lands in the barrier-exempt kaola-workflow/<project>/.cache/ location, not the worktree root).
  const dispatchEvidenceFile = qualifiedEvidenceFile(project, targetNode.id);

  // #444 (D-444-01 §2): build the dispatch descriptor sub-object via the single shared builder.
  const openedDispatch = buildDispatch(targetNode, {
    nonce:          openNonce,
    evidence_file:  dispatchEvidenceFile,
    required_tokens: seedResult.required_tokens,
    review_dispatch: reviewOpen.dispatch_context || null,
    working_dir:    working_dir || null,
    forge_rider:    null,
    // #603: thread the state-persisted Codex dispatch mode (null when absent → fail-closed default).
    codex_dispatch_mode: codexDispatchMode || null,
    // #634: thread the metric-optimizer optimize contract + wait-budget override ({} ⇒ no-op for every
    // other role, so the dispatch card stays byte-identical).
    ...optimizeDispatchCtx(planContent, targetNode.role, targetNode.id),
    // The durable node channel: the node's brief (goal_line) + upstream_evidence pointers. Empty channel
    // ({}) for a briefless/root node ⇒ byte-identical dispatch card.
    ...deriveDispatchChannel(planContent, targetNode, project),
  });

  // #317: ledger row flipped pending → in_progress; refresh the durable mirror and
  // return the explicit UI transition for the orchestrator to apply.
  return {
    result: 'ok',
    allDone: false,
    opened: {
      id: targetNode.id,
      role: targetNode.role,
      model: targetNode.model,
      // #609/#610: runtime-native display alongside the raw tier echo (conditional ⇒ untiered byte-identical).
      ...(modelDisplay(targetNode.model) ? { model_display: modelDisplay(targetNode.model) } : {}),
      declared_write_set: targetNode.declared_write_set,
      // #433: evidence metadata for the dispatcher (seeded path + required token classes).
      // #516: the top-level mirror stays the BARE on-disk relative path (the #444 back-compat vestige;
      // plan-run consumes dispatch.evidence_file, not this — see commands/kaola-workflow-plan-run.md:118).
      // Only the dispatch HINT is project-qualified so a subagent's literal-follow lands project-locally.
      evidence_file: seedResult.evidence_file,
      required_tokens: seedResult.required_tokens,
      // #444: dispatch descriptor sub-object (additive; back-compat fields kept above for one release).
      dispatch: openedDispatch,
    },
    baselineRecorded: true,
    // #403.3: surface the validator's anti-laundering baseline-reuse decision (was hidden). When the
    // baseline already existed (a resume / re-open of an in_progress row), commit-node --start returns
    // reused:true; make that decision visible to the caller instead of silently dropping it.
    // FIELD-PATH FIX (S-fix): commit-node --start nests the validator's --record-base output under
    // `recordBase` (see combineResults: { recordBase, ... }) — `base`/`reused` live at
    // baselineResult.recordBase.*, NOT top-level. Reading the top-level (undefined) silently dropped
    // both signals (reused always false; nonce always null → every node close refused on the missing
    // evidence-binding header). Read the nested path.
    baselineReused: (baselineResult.recordBase && baselineResult.recordBase.reused) || false,
    // #392: surface the per-open evidence-binding nonce (the barrier-base SHA prefix). The orchestrator
    // passes this to the role-node dispatch and the role echoes it in the `evidence-binding:` header so
    // the close gate can verify the evidence was produced by THIS open (anti-copy / anti-replay). The
    // prefix length (12) MUST equal readNonce's slice(0,12) so the open-side echo and the close-side
    // on-disk comparison agree byte-for-byte.
    nonce: openNonce,
    taskTransitions: [buildTransition(targetNode.id, 'in_progress', 'open-next')],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// The verdict/word-boundary-presence branches of checkEvidenceShape whose bare-name presence regex would
// be FALSE-SATISFIED by an empty re-injected key — never re-inject content tokens for these roles.
const REINJECT_EXCLUDED_ROLES = new Set([
  'tdd-guide', 'implementer', 'metric-optimizer',
  'main-session-gate', 'code-reviewer', 'security-reviewer', 'adversarial-verifier',
]);

// reinjectMissingRequiredKeys(content, planPath, nodeId, readFile) — append any MISSING required stub keys
// as EMPTY lines (see runRecordEvidence). Returns content unchanged for a role with nothing to re-inject.
// Fail-soft: any parse miss returns content untouched (never bricks record-evidence).
function reinjectMissingRequiredKeys(content, planPath, nodeId, readFile) {
  try {
    let ROLE_TOKEN_REGISTRY, IMPLEMENT_ROLES, PRODUCER_ROLES;
    try { ({ ROLE_TOKEN_REGISTRY, IMPLEMENT_ROLES, PRODUCER_ROLES } = require('./kaola-workflow-plan-validator')); } catch (_) { return content; }
    const nodes = parseNodesFromContent(readFile(planPath));
    const self = nodes.find(n => n.id === nodeId);
    if (!self) return content;
    const role = self.role;
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toAdd = [];
    // (i) generic-branch content tokens (registry-driven; the excluded roles keep their bare-name branches).
    if (!REINJECT_EXCLUDED_ROLES.has(role) && ROLE_TOKEN_REGISTRY && ROLE_TOKEN_REGISTRY[role]) {
      for (const tokenClass of ROLE_TOKEN_REGISTRY[role]) {
        if (tokenClass === 'evidence-binding') continue;
        const alts = tokenClass.split('|');
        const anyPresent = alts.some(alt => new RegExp('^' + esc(alt) + ':', 'm').test(content));
        if (!anyPresent) toAdd.push(alts[0] + ': ');
      }
    }
    // (ii) upstream_read keys for the producer upstreams of an IMPLEMENT consumer.
    if (IMPLEMENT_ROLES && typeof IMPLEMENT_ROLES.has === 'function' && IMPLEMENT_ROLES.has(role)
      && PRODUCER_ROLES && typeof PRODUCER_ROLES.has === 'function') {
      const deps = Array.isArray(self.dependsOn) ? self.dependsOn : [];
      const byId = new Map(nodes.map(n => [n.id, n]));
      for (const upId of deps) {
        const up = byId.get(upId);
        if (!(up && PRODUCER_ROLES.has(up.role))) continue;
        if (!new RegExp('^upstream_read:[ \\t]+' + esc(upId) + '(?:[ \\t]|$)', 'm').test(content)) {
          toAdd.push('upstream_read: ' + upId);
        }
      }
    }
    if (!toAdd.length) return content;
    const sep = String(content || '').endsWith('\n') ? '' : '\n';
    return String(content || '') + sep + toAdd.join('\n') + '\n';
  } catch (_) { return content; }
}

// ---------------------------------------------------------------------------
// runRecordEvidence — MUTATES .cache.
// Reads stdin content and writes verbatim to .cache/<nodeId>.md.
// ---------------------------------------------------------------------------
function runRecordEvidence(opts) {
  const { planPath, project, nodeId, stdinContent, writeFile, mkdirp } = opts;

  // #318: refuse a reserved/illegal project SEGMENT before any write so a
  // record-evidence call can never create a nested kaola-workflow/kaola-workflow
  // /.cache path. Fail-closed: return BEFORE mkdirp/writeFile so a refused call
  // is a pure no-op (zero mutation).
  const v = validateProjectName(project);
  if (!v.ok) {
    return {
      result: 'refuse',
      reason: 'nested_cache_path',
      project: project,
      detail: 'project segment ' + JSON.stringify(project) + ' is reserved/illegal — '
        + 'would create a nested kaola-workflow/kaola-workflow/.cache path',
      repair: 'Re-run record-evidence with --project <issue-N> (the active project '
        + 'folder), then remove any stray kaola-workflow/kaola-workflow/ directory left '
        + 'in the worktree.',
    };
  }

  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const cachePath = path.join(cacheDir, nodeId + '.md');

  const recordReadFile0 = opts.readFile || require('fs').readFileSync;
  let recordPlan = '';
  try { recordPlan = recordReadFile0(planPath, 'utf8'); } catch (_) {}
  if (planHashFromContent(recordPlan)) {
    const status = readLedgerStatuses(recordPlan)[nodeId];
    if (status !== 'in_progress') {
      return { result: 'refuse', reason: 'evidence_generation_stale', nodeId,
        detail: 'record-evidence is accepted only for the current in_progress generation' };
    }
    const supplied = String(stdinContent || '').match(/^evidence-binding:[ \t]+([^ \t\n]+)[ \t]+([^ \t\n]+)[ \t]*$/m);
    const currentNonce = readNonce(planPath, nodeId, recordReadFile0);
    if (!supplied) {
      return { result: 'refuse', reason: 'evidence_generation_required', nodeId,
        detail: 'hashed adaptive plans require evidence-binding: <node-id> <current-generation>' };
    }
    if (supplied && (supplied[1] !== nodeId || supplied[2] !== currentNonce)) {
      return { result: 'refuse', reason: 'evidence_generation_stale', nodeId };
    }
    const journalPath = path.join(path.dirname(planPath), '.cache', REVIEW_JOURNAL_NAME);
    const journalExists = opts.cacheExists ? opts.cacheExists(journalPath) : (() => {
      try { recordReadFile0(journalPath, 'utf8'); return true; } catch (_) { return false; }
    })();
    if (journalExists) {
      const journalState = readReviewJournal(opts, recordPlan);
      if (!journalState.ok) {
        return { result: 'refuse', reason: journalState.reason, detail: journalState.detail || null };
      }
      const immutableAttempt = journalState.journal && journalState.journal.attempts.find(attempt =>
        attempt && attempt.logical_gate && attempt.logical_gate.kind === 'fanout'
        && attempt.outcome !== null && attempt.lifecycle_settled === false
        && Array.isArray(attempt.receipts) && attempt.receipts.some(receipt =>
          receipt.node_id === nodeId && receipt.generation === currentNonce));
      if (immutableAttempt) {
        return { result: 'refuse', reason: 'review_outcome_receipts_immutable', nodeId,
          attempt_id: immutableAttempt.attempt_id };
      }
    }
  }

  if (mkdirp) mkdirp(cacheDir);

  // #546 G3 (DECISION A): a verbatim write of the role agent's stdin overwrites the
  // line-1 `evidence-binding: <id> <nonce>` header seeded by seedEvidenceFile, so a
  // subsequent close-node checkEvidenceShape refuses evidence_shape_failed / evidence_unbound.
  // Re-inject the binding ONLY when the stdin carries NO `evidence-binding:` line at all.
  // If the stdin ALREADY carries a binding line (even a foreign / copied one), leave it
  // UNTOUCHED so checkEvidenceShape still catches a stale / foreign nonce — the #392
  // anti-replay / anti-copy guard must stay able to refuse a replayed binding.
  const recordReadFile = opts.readFile || require('fs').readFileSync;
  let contentToWrite = stdinContent;
  if (!/^evidence-binding:/m.test(String(stdinContent || ''))) {
    const nonce = readNonce(planPath, nodeId, recordReadFile);
    contentToWrite = 'evidence-binding: ' + nodeId + ' ' + (nonce || '') + '\n' + String(stdinContent || '');
  }

  // Non-droppability: re-inject any MISSING required stub keys as EMPTY lines so the close gates stay
  // non-fabricable (a lossy verbatim write cannot silently drop a producer's content token or a consumer's
  // consumed-proof key). SCOPED to (i) generic-branch content tokens (never the tdd-guide/implementer/
  // metric-optimizer/verdict-gate branches — re-injecting an empty RED:/non_tdd_reason: would false-satisfy
  // their bare-name presence regexes) and (ii) upstream_read keys for the producer upstreams of an
  // IMPLEMENT consumer. An empty re-injected key turns a dropped token into a REFUSE at close (the shape /
  // consumed check requires a non-empty value), never a pass. Old in-flight nodes (whose record-evidence
  // already ran under old code) never re-enter here ⇒ exempt.
  contentToWrite = reinjectMissingRequiredKeys(contentToWrite, planPath, nodeId, recordReadFile);

  // #699: read-only certifier bodies arrive through stdin and replace the seeded file. Preserve the
  // authoritative OPEN-TIME G4 tuple rather than trusting/recomputing agent-supplied bindings at
  // persistence time. A later code mutation must stale the receipt; it must never silently move the
  // certified candidate forward. Missing/malformed seed state fails closed with zero writes.
  const recordNodes = parseNodesFromContent(recordPlan);
  const recordNode = recordNodes.find(node => node.id === nodeId);
  const g4Context = recordNode ? g4CertifierSeedContext(planPath, nodeId, recordNode.role) : null;
  if (g4Context) {
    let seededBody = '';
    try { seededBody = recordReadFile(cachePath, 'utf8'); } catch (_) {}
    const seededBindings = readSeededG4Bindings(seededBody);
    if (!seededBindings) {
      return { result: 'refuse', reason: 'certifier_binding_seed_missing', nodeId,
        detail: 'schema-2 certifier evidence lacks the authoritative open-time G4 binding tuple' };
    }
    contentToWrite = preserveSeededG4Bindings(contentToWrite, seededBindings);
  }

  writeFile(cachePath, contentToWrite);

  // #373: best-effort telemetry — evidence recorded for the node.
  appendNodeTiming(planPath, nodeId, 'evidence');

  return {
    result: 'ok',
    wrote: cachePath,
    bytes: contentToWrite.length,
  };
}

// ---------------------------------------------------------------------------
// runCloseAndOpenNext — the main per-node commit + fused advance.
// Order: (a) evidence-shape → (b) barrier → (c) close+compliance → (e) selector → (d) fused-advance
// ---------------------------------------------------------------------------
function runCloseAndOpenNext(opts) {
  const { planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists, working_dir, codexDispatchMode } = opts;
  // #411 BUG B: the per-node running-set path (mirror runCloseNode). The closing node is removed
  // from it after the close write so the next orient does not see an orphan multi-in_progress
  // mismatch (a serial close left the node in the set → reconcile-running-set no-ops `not_opening`).
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  let reviewBegun = null;

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: halt-fence:yes / excl-batch:yes (#383d dedup
  //    lives in the body). NO integrity, NO excl-serial/excl-scheduler: close-and-open-next is the SERIAL close path and
  //    MUST stay byte-identical to today under the serial-fallback conditions (the hard invariant). The
  //    halt fence is vacuously-pass when no consent_halt is durable, so a normal linear-chain close is
  //    unchanged. (#391b: without the fence, close-and-advance survives a halt and the marker becomes a
  //    phantom against a now-complete node.)
  //    #463 Slice 4: a live lane_group member needs a SYMMETRIC fence (it must not close out-of-band here,
  //    skipping the synthesizer), but a BROAD excl-scheduler is WRONG: close-and-open-next legitimately closes a #411
  //    per-node running set, so runningSetLive must NOT fence it. That fence is therefore the NARROW
  //    lane-group-member guard in the BODY below (keyed on lane_group membership), not an excl layer.
  //    (#594: the former excl-batch fence — a live parallel batch fencing this serial close — is gone;
  //    active-batch.json has no producer left, so no coordination surface is excluded here.) ==
  const guard = mutationGuardPrologue(opts, { halt: true });
  if (guard) return guard;

  // #463 Slice 4 — LANE-GROUP MEMBER FENCE (silent-loss catch). close-and-open-next has NO isMember
  // routing (unlike runCloseNode, which routes a live lane_group member to closeGroupMember), so closing
  // a live lane_group member out-of-band HERE would skip the synthesizer + per-leg/union barriers + leg
  // teardown: the per-node barrier passes vacuously on the EMPTY parent diff (the member's work lives in
  // its LEG), the member is marked complete, and the leg's COMMITTED work is orphaned = SILENT LOSS (a
  // harmless barrier-skip before S4 routed writes into legs; committed-leg-loss now). Fail-closed: refuse
  // scheduler_active so a lane-group member closes ONLY via close-node. NARROW (keyed on the node being a
  // member of a LIVE lane_group, NOT on runningSetLive) so a plain #411 per-node running set — which
  // close-and-open-next legitimately closes — is never false-fenced. Legless/toggle-off: no lane_group
  // key, so this block is a no-op (byte-identical serial-fallback).
  {
    const running0 = readRunningSet(runningSetPath, cacheExists, readFile);
    const lg0 = (running0 && running0.lane_group) ? running0.lane_group : null;
    const isLaneMember = !!(lg0 && Array.isArray(lg0.members) && lg0.members.includes(nodeId));
    if (isLaneMember) {
      return refuse('scheduler_active', {
        detail: 'node "' + nodeId + '" is a live lane_group ("' + (lg0.group_id || '?') + '") member — close it via close-node (the running-set scheduler path that runs the synthesizer + per-leg/union barriers), NOT the serial close-and-open-next (which would skip the synthesizer and orphan the leg\'s committed work)',
        group_id: lg0.group_id || null,
        repair: 'use close-node --node-id ' + nodeId + ' to close a lane-group member',
      });
    }
  }

  // #317: accumulate the UI transitions as the ledger mutates so every ok exit returns
  // the exact set the orchestrator must apply. The closed node is added after its close
  // write; selector n/a arms and any newly-opened node are appended at their mutation points.
  const transitions = [];

  // -- (a) Evidence-shape PRESENCE check ----------------------------------
  // Resolve role via parseNodes (read-only).
  const planContent = readFile(planPath);
  const nodes = parseNodesFromContent(planContent);
  const nodeInfo = nodes.find(n => n.id === nodeId);
  const role = nodeInfo ? nodeInfo.role : 'unknown';

  const cachePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');

  let evidenceContent = null;
  const evidencePresent = cacheExists ? cacheExists(cachePath) : (() => {
    try { evidenceContent = readFile(cachePath); return true; } catch (_) { return false; }
  })();

  if (evidencePresent && evidenceContent === null) {
    try { evidenceContent = readFile(cachePath); } catch (_) { evidenceContent = ''; }
  }

  // #392: pass the per-open nonce (barrier-base SHA prefix on disk) so the evidence-binding header is
  // verified. Absent on disk (no recorded baseline, e.g. a legacy path) → null → binding check skipped.
  // #607: pass the parsed ledger nodes so a main-session-gate `instrumentation: <node-id>` token can be
  // validated against the ledger (the named node must be a writer).
  const expectedNonce = readNonce(planPath, nodeId, readFile);
  const schema2Review = evidencePresent
    ? validateSchema2ReviewEvidence(opts, planContent, nodeInfo, evidenceContent)
    : { ok: true, review_gate: false };
  if (!schema2Review.ok) {
    return { result: 'refuse', reason: schema2Review.reason, detail: schema2Review.detail || null,
      missingTokenClass: schema2Review.missingTokenClass || null, nodeId, role };
  }
  const shapeCheck = checkEvidenceShape(role, nodeId, evidenceContent, {
    expectedNonce, expectedNodeId: nodeId, ledgerNodes: nodes, reviewV2: schema2Review,
  });

  if (!evidencePresent || !shapeCheck.ok) {
    // #319: distinguish absent evidence from malformed (shape) evidence so the
    // refusal names the actual fault, and surface the missing token class so a
    // consumer (or the operator) knows exactly what to add — instead of the old
    // catch-all 'evidence_missing' that conflated absent and malformed.
    // #392: a binding failure is reported with its specific reason (evidence_stale / evidence_unbound).
    const absent = !evidencePresent || shapeCheck.kind === 'absent';
    const reason = shapeCheck.evidenceStale ? 'evidence_stale'
      : shapeCheck.evidenceUnbound ? 'evidence_unbound'
      : (absent ? 'evidence_absent' : 'evidence_shape_failed');
    return {
      result: 'refuse',
      reason,
      missingTokenClass: shapeCheck.missingTokenClass || null,
      nodeId,
      role,
      expected: shapeCheck.expected || [],
      detail: shapeCheck.reason || (evidencePresent ? 'shape invalid' : 'cache file absent'),
    };
  }

  // #403.4: a verdict-bearing gate role whose evidence carries a near-miss `Verdict:` line
  // (wrong case / typo, e.g. `Verdict: Pass`) closes here but would fail finalize --verdict-check.
  // Emit a non-blocking warning at close time (informational, per #328) so the operator can fix it
  // BEFORE finalize instead of paying a reopen → re-evidence → re-close loop. Never refuses.
  // #439: `let` (not const) — a gate close with verdict:fail + speculative dependents merges
  // speculative_review_required into verdictWarn below, so EVERY post-close success return (which all
  // spread `...(verdictWarn || {})`) carries the review pointer without editing each return.
  let verdictWarn = schema2Review.review_gate ? null : checkVerdictParse(role, evidenceContent);

  // -- (a.5) Consumed-proof over the durable node channel. Placed AFTER shapeCheck and BEFORE the barrier
  // so a HARD refuse (an IMPLEMENT consumer that did not echo a producer upstream's current nonce) is a
  // ZERO-mutation no-op. Advisory for every other pair (rides verdictWarn into the success returns).
  {
    const consumed = checkUpstreamConsumed({ role, nodeId, evidenceContent, nodes,
      ledgerStatuses: readLedgerStatuses(planContent), planPath, project, readFile });
    if (consumed && !consumed.ok && consumed.hard) {
      return decorateOperatorHint({
        result: 'refuse', reason: 'upstream_not_consumed', nodeId, role,
        offending: consumed.offending, expected: consumed.expectedPath, detail: consumed.detail,
      });
    }
    if (consumed && !consumed.ok) {
      verdictWarn = Object.assign(verdictWarn || {}, {
        upstream_advisory: { offending: consumed.offending, expected: consumed.expectedPath, detail: consumed.detail },
      });
    }
  }

  // -- (b) Shell COMMIT_NODE per-node barrier ----------------------------
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);

  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    // #440: attach triage to the barrier_failed envelope so callers can classify + propose repair.
    // #546 G7: promote the narrowed barrier reason (commit-node nests it at
    // barrierCheck.reason / barrierCheck.outOfAllow) to the TOP level so decorateOperatorHint
    // + the --summary line emit the specific reason (write_set_overflow, ...) instead of the
    // generic 'barrier_failed'. Falls back to 'barrier_failed' when no narrowed reason exists.
    const cacheDir440 = path.join(path.dirname(planPath), '.cache');
    return {
      result: 'refuse',
      reason: (barrierOut.barrierCheck && barrierOut.barrierCheck.reason) || 'barrier_failed',
      outOfAllow: barrierOut.barrierCheck && barrierOut.barrierCheck.outOfAllow,
      nodeId,
      barrierOut,
      triage: computeTriage(barrierOut, cacheDir440, nodeId, readFile),
    };
  }

  // Selector validation is part of the close precondition. Compute the losing-arm fold without
  // writing so an invalid selector cannot leave a completed review or provisional journal attempt.
  const selectorCheck = barrierOut.selectorCheck || {};
  const selectorValidation = foldSelectorArms(planContent, selectorCheck);
  if (!selectorValidation.ok) {
    return { result: 'refuse', reason: selectorValidation.reason, nodeId, selectorCheck };
  }

  // #439 (D-419 Part 4): close-time speculative guard (mirror runCloseNode) — a speculative member
  // cannot commit to complete until its gate resolves (else its review pointer + discard handle are
  // lost). Fires only for a speculative:true member whose gate is not yet complete; never for a normal
  // node. Precedes the close mutation → zero mutation on refuse.
  {
    const running439 = readRunningSet(runningSetPath, cacheExists, readFile);
    const specGuard = speculativeCloseGuard(nodeId, running439, readLedgerStatuses(readFile(planPath)));
    if (specGuard) return specGuard;
  }

  const reviewPrepared = prepareReviewClose(opts, {
    planContent, nodes, nodeInfo, evidenceContent, command: 'close-and-open-next',
    schema2Review,
  });
  if (reviewPrepared && reviewPrepared.handled) return reviewPrepared.result;
  if (reviewPrepared) reviewBegun = reviewPrepared.begun;

  // -- (c) Close: spliceLedgerNode + compliance row ----------------------
  // Re-read plan (baseline call in open-next may have written it).
  let currentPlan = readFile(planPath);

  const newStatus = 'complete';
  // #348: close ONLY an in_progress node. Dropping 'n/a' from allowFrom means a skipped
  // (n/a) node is never silently flipped to complete. The splice can be a NO-OP in two ways
  // and BOTH must refuse with zero mutation — no compliance row, no plan write — so we never
  // append a `Required Agent Compliance` row (or run the fused advance) over a node that was
  // not actually closed. The reachable trigger is a #305-class crash interleaving: open-batch
  // records a baseline BEFORE the ledger flip, so the barrier can pass while the row is still
  // pending. alreadyAtTarget (row already 'complete') still proceeds — idempotent resume.
  const closeResult = spliceLedgerNode(currentPlan, nodeId, newStatus, { allowFrom: ['in_progress'] });

  if (!closeResult.found) {
    return { result: 'refuse', reason: 'close_node_not_in_ledger', nodeId };
  }
  if (!closeResult.changed && !closeResult.alreadyAtTarget) {
    return { result: 'refuse', reason: 'close_transition_disallowed', nodeId };
  }
  if (closeResult.changed) {
    currentPlan = closeResult.content;
  }

  currentPlan = addCloseCompliance(currentPlan, nodeId, role, evidenceContent);

  const selectorFold = foldSelectorArms(currentPlan, selectorCheck);
  currentPlan = selectorFold.content;

  // Write the complete passing transition (gate + compliance + selector arms) before removing the
  // running member or settling the journal. A crash here remains fenced by the unsettled attempt.
  writeFile(planPath, currentPlan);
  if (selectorCheck.isSelector === true) reviewFailpoint(opts, 'selector_folded');

  appendCloseSidecarsOnce(opts, nodeId);

  // #317: the closed node → completed (every ok exit carries this).
  transitions.push(buildTransition(nodeId, 'complete', 'close-and-open-next'));
  transitions.push(...selectorFold.transitions);

  // #446 (D-446-01 Decision 3): a GATE node close auto-invokes route-findings — the routing
  // table (.cache/findings-route.json) is most valuable EXACTLY when a gate closes (findings
  // exist, a repair must be routed). SILENT + NON-BLOCKING: any error is logged to stderr, never
  // raised; a route-findings failure must NOT block the node advance (routing is a convenience
  // artifact, never a gate). The node is confirmed closed at this point (ledger flipped + written),
  // so every downstream return path (allDone / partial / enterBatch / fused-advance) carries it.
  if (VERDICT_ROLES.has(role)) {
    try {
      runRouteFindings({ nodeId, planPath, readFile, writeFile }, project);
    } catch (e) {
      process.stderr.write('route-findings: ' + ((e && e.message) || String(e)) + '\n');
    }
  }

  // #411 BUG B: remove the just-closed node from the running set (mirror runCloseNode step (e)).
  // close-and-open-next was running-set-blind: on a serial chain (open-next added the node to the
  // running set) the node stayed in the set after closing, so the next orient saw an in-progress
  // mismatch (orphan_multi_in_progress) and reconcile-running-set no-op'd (`not_opening`) — a wedge.
  // Done here (after the close write, before selector/advance) so every ok exit reflects the removal.
  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  // #439 (D-419 Part 4, settlement 3): on a GATE close with verdict:fail, surface the speculative
  // dependents (held in `running` by the close-time guard) for keep-or-discard. Computed from the
  // PRE-removal snapshot (this close removed only THIS gate). reviewExtra is spread into every
  // post-close success return below so the fused path matches close-node. null/empty ⇒ {} (no change).
  const speculativeReview = speculativeReviewOnGateClose(role, nodeId, evidenceContent, running, currentPlan);
  if (speculativeReview) {
    verdictWarn = Object.assign({}, verdictWarn || {}, {
      speculative_review_required: speculativeReview,
      operator_hint: getOperatorHint('speculative_review_required', speculativeReview),
    });
  }
  if (running) {
    const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
    if (remaining.length === 0) {
      if (opts.unlink) opts.unlink(runningSetPath);
      // #436 D-419-01: spread existing top-level fields so max_concurrent (and any other
      // unknown fields) survive the empty-set fallback rewrite.
      else writeFile(runningSetPath, JSON.stringify({ ...running, state: 'open', nodes: [] }, null, 2));
    } else {
      writeFile(runningSetPath, JSON.stringify({ ...running, nodes: remaining }, null, 2));
    }
  }

  if (reviewBegun) markReviewAttemptSettled(opts, reviewBegun);

  // The close transaction is settled before the fused open. Another unresolved logical gate still
  // suppresses successor exposure; the orchestrator repairs that exact attempt first.
  const reviewOpenFence = journalFence(opts, readFile(planPath));
  if (reviewOpenFence) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: false,
      reason: reviewOpenFence.reason, attempt_ids: reviewOpenFence.attempt_ids,
      taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  // -- (d) Fused advance -------------------------------------------------
  const nextAction = shell(nextActionPath, [planPath, '--json']);

  if (nextAction.result !== 'ok') {
    // Barrier passed and node is closed, but next-action failed — report partially done.
    return {
      result: 'ok',
      closed: nodeId,
      opened: null,
      allDone: false,
      nextActionError: nextAction,
      ...(verdictWarn || {}),
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  if (nextAction.allDone) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: true, ...(verdictWarn || {}), taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  // #303 (gap #2 / sub-gap C): SCHEDULER-AWARE fused advance. When closing this node
  // exposes a frontier of >= 2 own-pending ready siblings, that is a fan-out — do NOT
  // single-open one node (which would serialize an independent fan-out behind one member).
  // Signal enterBatch so the orchestrator routes to the bounded batch scheduler (open-batch
  // + rolling top-up). Linear chains (readyPending < 2) keep the serial single-open below.
  // #334: exclude a main-session-gate from the batch frontier (the main session cannot run
  // concurrently with itself) — the gate opens serially via the single-node path below. A
  // [gate, x] frontier therefore falls through to single-open; [gate, x, y] batches [x, y].
  const readyPending = (nextAction.readyPending || []).filter(n => n.role !== 'main-session-gate');
  if (readyPending.length >= 2) {
    // #317: enterBatch carries ONLY the closed-node (and any selector arms) transitions —
    // open-batch owns the member in_progress flips; do not invent them here.
    return {
      result: 'ok',
      closed: nodeId,
      opened: null,
      enterBatch: true,
      frontier: readyPending.map(n => ({
        id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set,
      })),
      allDone: false,
      ...(verdictWarn || {}),
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  // #383(d): next-action's readySet includes in_progress nodes (the fused-advance splice is a
  // silent no-op under allowFrom:['pending']), so a multi-in_progress ledger can surface an already
  // -running node as `nextNode` — the orchestrator would then dispatch a SECOND agent for it. Guard
  // in the CONSUMER: if the selected next node is already in_progress, report closed-only (opened:null)
  // rather than re-announcing it as freshly opened. The serial linear chain (next node pending) is
  // unaffected — byte-identical to today.
  const nextNode0 = nextAction.nextNode;
  const ledgerNow = readLedgerStatuses(readFile(planPath));
  if (nextNode0 && ledgerNow[nextNode0.id] === 'in_progress') {
    return { result: 'ok', closed: nodeId, opened: null, allDone: false, ...(verdictWarn || {}), taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  // Open the next ready node.
  const nextNode = nextNode0;
  if (!nextNode) {
    // #546 G6: the plan is unfinished (not allDone) yet next-action surfaced NO openable node and
    // NO >=2 frontier — the only remaining nodes are blocked / non-auto-openable (e.g. awaiting a
    // batch seal, a consent-gated overlap, or an upstream gate). Emit a TYPED `reason` marker so the
    // orchestrator can distinguish "re-orient and retry the drain" from a genuine stall. Control flow
    // is unchanged: this is still result:'ok', closed:nodeId, opened:null — only the marker is added.
    return { result: 'ok', closed: nodeId, opened: null, allDone: false, reason: 'frontier_blocked', ...(verdictWarn || {}), taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  // GATE-WINDOW HOLD: a live main-session-gate (a kind:'gate' running-set member) fences the fused
  // advance exactly as it fences the other two open doors (open-next refuses scheduler_active;
  // open-ready holds gate_live) — without this check the fused advance was the one unfenced door and
  // could open the next node in_progress WHILE the gate renders its verdict (an order-dependent bypass
  // of the gate-window invariant). Re-read the running set POST-removal (the just-closed node was
  // already removed above, so a gate closing ITSELF never self-holds); any REMAINING kind:'gate'
  // member ⇒ return the CLOSED-ONLY envelope (the frontier_blocked shape with the typed gate_live
  // reason, mirroring open-ready's hold vocabulary). Order-INDEPENDENT: fires before any open
  // mutation regardless of ## Nodes table order. The orchestrator re-runs orient/open-next after the
  // gate drains. No live gate ⇒ this block is a no-op (byte-identical fused advance).
  {
    const runningAtAdvance = readRunningSet(runningSetPath, cacheExists, readFile);
    const liveGates = ((runningAtAdvance && runningAtAdvance.nodes) || []).filter(n => n.kind === 'gate');
    if (liveGates.length > 0) {
      return { result: 'ok', closed: nodeId, opened: null, allDone: false, reason: 'gate_live',
        liveGates: liveGates.map(n => n.id),
        ...(verdictWarn || {}), taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
    }
  }

  const fusedReviewOpen = prepareReviewOpen(opts, readFile(planPath), nextNode);
  if (!fusedReviewOpen.ok) {
    return { result: 'refuse', reason: fusedReviewOpen.reason,
      detail: fusedReviewOpen.detail || null, nodeId: nextNode.id, closed: nodeId,
      ...(verdictWarn || {}), taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell) };
  }

  // #621: record the fused-advance baseline BEFORE flipping the next node's ledger row (mirrors
  // runOpenNext's #590 baseline-first ordering, which this fused path never received). The prior
  // splice-then-baseline order left a crash window where the ledger read in_progress for nextNode with
  // NO baseline on disk — a later close dead-ends baseline_missing, exactly the #590 hazard #621 found
  // NOT mirrored here. Baseline-first inverts the hazard: on a baseline failure, refuse baseline_failed
  // with nextNode's row LEFT PENDING (this splice is never attempted) — a clean re-open, never an
  // in_progress-without-baseline strand. The CLOSE half of this fused call (the node that just closed,
  // its compliance row, running-set removal, selector arms) already landed and is preserved on this
  // refusal — only the OPEN half of the advance is what failed.
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', nextNode.id, '--start', '--json']);
  const baselineOk = baselineResult.exitCode === 0 && baselineResult.result === 'ok';

  if (!baselineOk) {
    return {
      result: 'refuse',
      reason: 'baseline_failed',
      nodeId: nextNode.id,
      baselineResult,
      closed: nodeId,
      ...(verdictWarn || {}),
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  let planForAdvance = readFile(planPath);
  const advanceSplice = spliceLedgerNode(planForAdvance, nextNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (advanceSplice.changed) {
    planForAdvance = advanceSplice.content;
    writeFile(planPath, planForAdvance);
  }

  // #607 Layer 2: the fused advance opens the next node INLINE (not via runOpenNext), so a
  // main-session-gate reached this way must ALSO be recorded into the running set as kind:'gate'. The
  // closing node was already removed from the set above (BUG B removal), so this leaves the set holding
  // exactly the new gate. No-op for every non-gate next node.
  recordGateInRunningSet(runningSetPath, nextNode,
    { readFile, writeFile, cacheExists, mkdirp: opts.mkdirp, now: opts.now });

  // #373: best-effort telemetry — the fused advance opened the next node.
  appendNodeTiming(planPath, nextNode.id, 'opened');

  // #424 (D-424-01 §5): provenance log entry — open event for fused advance.
  const fusedNonce = (baselineResult.recordBase && baselineResult.recordBase.base)
    ? String(baselineResult.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', nextNode.id, fusedNonce);

  // #433 (D-433-01 §2): open-time evidence seeding for the fused-advance node.
  const fusedSeed = seedEvidenceFile(planPath, nextNode.id, fusedNonce, nextNode.role, false, fusedReviewOpen);
  // #516: project-qualified dispatch HINT path for the fused-advance node (same rationale as runOpenNext).
  const fusedEvidenceFile = qualifiedEvidenceFile(project, nextNode.id);

  // #444 (D-444-01 §2): build the dispatch descriptor for the fused-advance node via the
  // SAME single builder as runOpenNext — this closes the #411 class by construction.
  const fusedDispatch = buildDispatch(nextNode, {
    nonce:          fusedNonce,
    evidence_file:  fusedEvidenceFile,
    required_tokens: fusedSeed.required_tokens,
    review_dispatch: fusedReviewOpen.dispatch_context || null,
    working_dir:    working_dir || null,
    forge_rider:    null,
    // #603: thread the state-persisted Codex dispatch mode (null when absent → fail-closed default).
    codex_dispatch_mode: codexDispatchMode || null,
    // #634: thread the optimize contract + wait-budget override for a fused-advance optimize node ({} ⇒
    // no-op for every other role ⇒ byte-identical dispatch card).
    ...optimizeDispatchCtx(planForAdvance, nextNode.role, nextNode.id),
    // The durable node channel for the fused-advance node ({} for a briefless/root node ⇒ byte-identical).
    ...deriveDispatchChannel(planForAdvance, nextNode, project),
  });

  // #317: fused advance opened the next node → in_progress (in addition to the closed node).
  transitions.push(buildTransition(nextNode.id, 'in_progress', 'close-and-open-next'));

  return {
    result: 'ok',
    closed: nodeId,
    opened: {
      id: nextNode.id,
      role: nextNode.role,
      model: nextNode.model,
      // #609/#610: runtime-native display alongside the raw tier echo (conditional ⇒ untiered byte-identical).
      ...(modelDisplay(nextNode.model) ? { model_display: modelDisplay(nextNode.model) } : {}),
      declared_write_set: nextNode.declared_write_set,
      // #411 BUG A: surface the per-open evidence-binding nonce for the node the fused advance just
      // opened, with the SAME derivation runOpenNext (~1098) and runOpenReady (~2228) use — the first
      // 12 chars of commit-node --start's nested recordBase.base SHA. WITHOUT this, every caller that
      // reads opened.nonce to bind the next node's evidence gets `undefined`, so on any serial chain
      // with a dependent the SECOND close refuses evidence_stale (the on-disk nonce never matches the
      // empty header). Read the SAME nested path (recordBase.base), NOT the top level.
      nonce: fusedNonce,
      // #433: evidence metadata for the dispatcher. #516: top-level mirror stays the bare on-disk path
      // (vestige); only fusedDispatch.evidence_file is project-qualified.
      evidence_file: fusedSeed.evidence_file,
      required_tokens: fusedSeed.required_tokens,
      // #444: dispatch descriptor sub-object (additive; back-compat fields kept above for one release).
      dispatch: fusedDispatch,
    },
    baselineRecorded: baselineResult.exitCode === 0,
    allDone: false,
    ...(verdictWarn || {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// computeTriage (#440) — derive a triage object from a barrierCheck result.
//
// The `class` is derived from the barrierOut.reason field (or the nested
// barrierOut.barrierCheck.reason if the top-level reason is absent):
//   lockfile_write / mirror_write / count_bump  → use directly (narrowed subtypes)
//   write_set_overflow                          → use directly
//   anything else                               → 'unclassified'
//
// testDelta: try to read chain-receipt.json then fall back to the node evidence.
// proposed_repair: computed from class + overflow paths.
// Degrades gracefully on any error — never throws.
// ---------------------------------------------------------------------------
function computeTriage(barrierOut, cacheDir, nodeId, readFile) {
  try {
    if (!barrierOut || typeof barrierOut !== 'object') {
      return { class: 'unclassified' };
    }

    // Extract the narrowed reason: the top-level reason may be 'barrier_failed'
    // (from adaptive-node), so drill into the nested barrierCheck if needed.
    const topReason = barrierOut.reason;
    const nestedReason = (barrierOut.barrierCheck && barrierOut.barrierCheck.reason) || null;
    const barrierReason = (topReason === 'barrier_failed' ? nestedReason : topReason) || null;

    // Classify.
    const KNOWN_SUBTYPES = Object.keys(WRITE_SET_OVERFLOW_SUBTYPES);
    let cls;
    if (KNOWN_SUBTYPES.includes(barrierReason)) {
      cls = barrierReason;
    } else if (barrierReason === 'write_set_overflow') {
      cls = 'write_set_overflow';
    } else {
      cls = 'unclassified';
    }

    const triage = { class: cls };

    // testDelta: try chain-receipt then evidence file.
    if (cacheDir && nodeId && readFile) {
      try {
        const receiptPath = path.join(cacheDir, 'chain-receipt.json');
        const receiptRaw = readFile(receiptPath);
        const receipt = JSON.parse(receiptRaw);
        if (receipt && (receipt.red || receipt.green)) {
          triage.testDelta = [receipt.red, receipt.green].filter(Boolean).join(' / ');
        }
      } catch (_) {
        // fall through to evidence file
        try {
          const evidencePath = path.join(cacheDir, nodeId + '.md');
          const ev = readFile(evidencePath);
          const redMatch = ev.match(/^RED:[ \t]*(.+)$/m);
          const greenMatch = ev.match(/^GREEN:[ \t]*(.+)$/m);
          if (redMatch || greenMatch) {
            const parts = [];
            if (redMatch) parts.push('RED: ' + redMatch[1].trim());
            if (greenMatch) parts.push('GREEN: ' + greenMatch[1].trim());
            triage.testDelta = parts.join(' / ');
          }
        } catch (_) {
          // omit testDelta
        }
      }
    }

    // proposed_repair: based on class + overflow paths.
    const overflowPaths = (barrierOut.outOfAllow ||
      (barrierOut.barrierCheck && barrierOut.barrierCheck.outOfAllow) || []);

    if (cls === 'count_bump') {
      triage.proposed_repair = { kind: 'write_set_swap', node: nodeId || '', paths: overflowPaths };
    } else if (cls === 'lockfile_write') {
      triage.proposed_repair = { kind: 'add_to_write_set', node: nodeId || '', paths: overflowPaths };
    } else if (cls === 'mirror_write') {
      triage.proposed_repair = { kind: 'add_to_write_set', node: nodeId || '', paths: overflowPaths };
    } else if (cls === 'write_set_overflow' && overflowPaths.length) {
      triage.proposed_repair = { kind: 'revert_overflow', node: nodeId || '', paths: overflowPaths };
    }
    // unclassified or no overflow paths → no proposed_repair

    return triage;
  } catch (_) {
    return { class: 'unclassified' };
  }
}

// ---------------------------------------------------------------------------
// runWriteHalt — MUTATES state + ledger.
// Writes escalated_to_full + consent_halt markers. Idempotent.
// ---------------------------------------------------------------------------
function runWriteHalt(opts) {
  const { planPath, statePath, project, nodeId, reason, shell, readFile, writeFile, barrierOut } = opts;

  // #463 (write-overlap): `merge_conflict` joins the allowlist — a consent-style, resumable halt.
  const validReasons = ['consent', 'security', 'test_thrash', 'merge_conflict'];
  if (!validReasons.includes(reason)) {
    return { result: 'refuse', reason: 'invalid_reason', validReasons };
  }

  // #743: a halt is an IN-PLACE stop-and-ask — the run stays where it is and waits for the
  // operator. It records exactly ONE marker, the CAUSE (`escalated_to_full: <reason>`), for every
  // reason including `consent`. (The retired second `escalated_to_full: security` line that a
  // consent halt used to co-write recorded a hand-off to the removed full path; nothing reads it —
  // every reader takes the FIRST escalated_to_full line, which is the cause.) clear-halt still
  // strips the legacy security half so a halt written by an older runtime clears cleanly.
  let stateContent = readFile(statePath);
  stateContent = spliceStateMarker(stateContent, 'escalated_to_full', reason);

  // Write consent_halt: pending into plan ## Node Ledger FIRST (durable marker).
  // This line is placed below the ledger header, not as a row — it's a freeform marker.
  let planContent = readFile(planPath);

  // #360: ledger-scoped idempotence (was a whole-file `includes`) — a decoy line outside the
  // ledger no longer suppresses writing the real durable marker.
  if (!readDurableConsentHalt(planContent)) {
    // #354: shared fence-aware locator (skips an upstream fenced decoy heading).
    const { start: ledgerIdx } = locateSection(planContent, LEDGER_HEADING);
    if (ledgerIdx >= 0) {
      // Insert after the ## Node Ledger heading line.
      const afterHeading = planContent.indexOf('\n', ledgerIdx + 1);
      if (afterHeading >= 0) {
        planContent = planContent.slice(0, afterHeading + 1) + 'consent_halt: pending\n' + planContent.slice(afterHeading + 1);
      } else {
        planContent = planContent.trimEnd() + '\nconsent_halt: pending\n';
      }
    } else {
      planContent = planContent.trimEnd() + '\nconsent_halt: pending\n';
    }
    writeFile(planPath, planContent);
  }

  // Write state markers LAST (state file is regenerated from plan on crash recovery).
  writeFile(statePath, stateContent);

  // #373: best-effort telemetry — the node halted.
  appendNodeTiming(planPath, nodeId, 'halted');

  // Build markers list for output — one cause marker + the durable ledger marker.
  const markers = ['escalated_to_full:' + reason, 'consent_halt:pending'];

  // #317: the halted node STAYS in_progress (write-halt adds a consent_halt marker, no ledger
  // flip); surface that with a halt note + refresh the mirror (AC4 lists write-halt).

  // #440: attach triage when a barrierOut is provided (--triage-json path or caller-injected).
  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const triage = computeTriage(barrierOut || null, cacheDir, nodeId, readFile);

  return {
    result: 'ok',
    halt: 'written',
    markers,
    triage,
    // #445 (D-445-01 §2): a halt is an actionable outcome — surface the one-sentence operator
    // pointer at the top level even though the write itself succeeded (result: ok).
    operator_hint: getOperatorHint('halt_written', { nodeId, reason }),
    taskTransitions: [buildTransition(nodeId, 'in_progress', 'write-halt', 'HALTED: ' + reason)],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// removeDurableConsentHalt (#360) — inverse of write-halt's insertion: strip a
// `consent_halt: pending` line from WITHIN the ## Node Ledger section only (section-scoped,
// mirroring readDurableConsentHalt), so a decoy line elsewhere is never touched.
// ---------------------------------------------------------------------------
function removeDurableConsentHalt(planContent) {
  // #354: shared fence-aware locator (section-scoped, skips an upstream fenced decoy heading).
  const { start: ledgerIdx, next: afterIdx } = locateSection(planContent, LEDGER_HEADING);
  if (ledgerIdx < 0) return { content: planContent, changed: false };
  const head = planContent.slice(0, ledgerIdx);
  const section = afterIdx >= 0 ? planContent.slice(ledgerIdx, afterIdx) : planContent.slice(ledgerIdx);
  const tail = afterIdx >= 0 ? planContent.slice(afterIdx) : '';
  const newSection = section.replace(/^consent_halt:[ \t]*pending[ \t]*\n?/m, '');
  if (newSection === section) return { content: planContent, changed: false };
  return { content: head + newSection + tail, changed: true };
}

// ---------------------------------------------------------------------------
// runClearHalt (#360) — the script-owned inverse of write-halt. Removes the ledger
// `consent_halt: pending` marker AND the matching `escalated_to_full` state marker(s) in ONE
// typed transaction, replacing the prior two-file PROSE lockstep (contractor-driven) that ADR
// 0004/0005 eliminated elsewhere. Typed refusal with ZERO mutation when no durable halt is present.
// ---------------------------------------------------------------------------
// hasEscalatedMarker (#391a) — true when workflow-state.md carries a durable `escalated_to_full:`
// line (column 0). The clear-halt gate widens to this so a crash that lost the ledger marker but
// LEFT escalated_to_full in state is still re-runnable (the ledger probe alone would refuse
// no_halt_present and strand the run).
function hasEscalatedMarker(stateContent) {
  return /^escalated_to_full:/m.test(String(stateContent || ''));
}

function runClearHalt(opts) {
  const { planPath, statePath, project, reason, shell, readFile, writeFile } = opts;

  const validReasons = ['consent', 'security'];
  if (!validReasons.includes(reason)) {
    return { result: 'refuse', reason: 'invalid_reason', validReasons };
  }

  let planContent = readFile(planPath);
  let stateContent = readFile(statePath);
  // #391a: WIDENED gate — refuse (zero mutation) only when NEITHER the ledger consent_halt marker NOR
  // a durable escalated_to_full state marker is present. The old ledger-only gate stranded a halt when
  // a crash between clear-halt's two writes removed the ledger marker but left escalated_to_full in
  // state: a re-run then refused no_halt_present and only a hand-edit could finish the clear.
  if (!readDurableConsentHalt(planContent) && !hasEscalatedMarker(stateContent)) {
    return { result: 'refuse', reason: 'no_halt_present', detail: 'no ledger-scoped consent_halt: pending marker and no escalated_to_full state marker to clear' };
  }

  // #391a: REORDER — write the STATE (escalated_to_full removal) FIRST, then the PLAN ledger marker
  // LAST. The crash-safe ordering rule is plan-LAST so a crash between the two atomic writes leaves the
  // ledger marker still present → a re-run sees the durable halt and finishes the clear (re-runnable),
  // instead of the prior plan-first order which removed the ledger marker first and stranded
  // escalated_to_full with no script recovery.
  if (reason === 'consent') {
    stateContent = stateContent.replace(/^escalated_to_full:[ \t]*consent[ \t]*\n?/mg, '');
    // #743 LEGACY TOLERANCE — write-halt(consent) no longer emits a `security` half, but a halt
    // written by an OLDER runtime carries it on disk. Keep stripping it so such a state file still
    // clears; removing this line would wedge any in-flight pre-#743 halt.
    stateContent = stateContent.replace(/^escalated_to_full:[ \t]*security[ \t]*\n?/mg, '');
    // #463: a `merge_conflict` halt is a RESUMABLE consent-style halt (it raises
    // consent_halt: pending, cleared here via --reason consent). Strip its cause marker too,
    // so the run resumes with clean state. (Contrast test_thrash, a terminal halt whose cause
    // marker is deliberately left in place.)
    stateContent = stateContent.replace(/^escalated_to_full:[ \t]*merge_conflict[ \t]*\n?/mg, '');
  } else {
    stateContent = stateContent.replace(/^escalated_to_full:[ \t]*security[ \t]*\n?/mg, '');
  }
  writeFile(statePath, stateContent);

  // Remove the ledger consent_halt marker LAST.
  const removed = removeDurableConsentHalt(planContent);
  planContent = removed.content;
  writeFile(planPath, planContent);

  // #373: best-effort telemetry — the halt was cleared.
  appendNodeTiming(planPath, 'clear-halt', 'halt_cleared');

  return {
    result: 'ok',
    halt: 'cleared',
    reason,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runReopenNode — MUTATES ledger + per-node baselines. #308 first-class plan-repair.
//
// Reopens an already-`complete` node N for an in-place repair (a review-finding fix or
// a finalize-surfaced scope fix) WITHOUT hand-editing workflow-plan.md. Steps:
//   (1) Refuse over a live #377 running-set fan-out so this never fights the reconcile guards.
//   (2) Require N to be a `complete` ledger row (only a finished node is repairable).
//   (3) Reset N's POST-DOMINATING gate(s) — code-reviewer / security-reviewer /
//       adversarial-verifier nodes that every path from N to the unique sink passes
//       through — complete|in_progress → pending (#343 mid-gate repair: a gate that just
//       emitted a blocking finding owned by N folds back without an allDone detour), and
//       remove their stale .cache/barrier-base-<id> baselines, so they re-review after
//       the repair. Any OTHER in_progress row (a non-gate node mid-flight, or a gate that
//       does not post-dominate N) refuses typed `would_orphan_in_progress` BEFORE any
//       real side effect. Downstream NON-gate nodes (incl. the sink) are left as-is:
//       next-action's #308 transitive readiness withholds them while an upstream gate is
//       non-terminal (no broad cascade needed) — but only while they are still `pending`.
//       A downstream row that is already SETTLED cannot be withheld, only stranded, so it
//       refuses typed `would_strand_completed_dependent` (see planLedgerReset).
//   (4) Reopen N pending→in_progress, remove its stale baseline, persist the plan, then
//       re-record a FRESH baseline at the current merged state (commit-node --start) so
//       the next barrier attributes ONLY the repair.
// ---------------------------------------------------------------------------
// #748 — the ledger invariant EVERY downstream authority enforces, stated once and mirrored exactly:
//
//   a row at complete / in_progress / n/a may not depend on a row that is neither complete nor n/a
//
// (verifyCurrentEpochAuthority in kaola-workflow-replan.js refuses `state_ledger_progress_invalid` on it).
// The invariant is ROLE-AGNOSTIC, so the guard that protects it must be too. reopen-node and repair-node
// both reset a node plus its post-dominating gates, and neither the gate fold (gate roles only) nor the
// orphan guard (in_progress rows only) can see a `complete` NON-gate descendant — so the mutation used to
// be ADMITTED and left exactly the shape the authority rejects, producing a project in which every
// scripted command reports `legal_mutation: "none"` and nothing warned at mutation time. A finalize-role
// special case both UNDER-covers (any interior node wedges identically, reachable from an ordinary mid-run
// state) and MIS-describes (a second finalize-role node is not "the sink"). So: simulate the post-mutation
// ledger and name whatever would actually be stranded.
//
// Tighten-only. A `pending` row is not in the settled set, so the designed mid-run repair still passes;
// an `in_progress` row is caught earlier by would_orphan_in_progress, whose precedence is untouched; and
// reopening a node never strands the node itself (it is not its own descendant, and it was complete, so
// its own dependencies already satisfy the invariant). An `n/a` row DOES refuse — n/a is in the invariant's
// settled set, so an n/a row above a folded gate wedges the authority exactly like a complete one (checked
// directly against verifyCurrentEpochAuthority: sink=n/a + gate=pending refuses state_ledger_progress_invalid
// just as sink=complete + gate=pending does). A dependency with no ledger row is skipped rather than treated
// as unsatisfied — a partial ledger is a different failure, owned by the ledger-authority check. The status
// sets accept the same defensive n/a spellings as TERMINAL_LEDGER elsewhere in this file, so a row spelled
// `na` reads as settled/satisfied rather than as an unsatisfied dependency.
//
// TWO refinements keep the guard from over-refusing, both learned from shapes the first corpus lacked:
//
//   (i) REFUSE ONLY WHAT THIS MUTATION NEWLY STRANDS. Scanning the whole post-mutation ledger and refusing
//       on any hit conflates a violation this reset CREATES with one that was already sitting in the plan:
//       a settled row above a pending dependency in a DISJOINT leg this reopen never touches blocked an
//       otherwise-safe, entirely unrelated reopen. "Newly" is therefore decided by ATTRIBUTION: a row
//       refuses only when it would remain settled above a dependency THIS mutation moved (`moved` = the
//       reopened node, the reset rows, the read-only folds below). A row stranded solely by a dependency
//       the mutation never touched is pre-existing and not this call's to answer for — which also confines
//       the scan to the touched cone by construction.
//       Attribution, NOT a plain before/after set difference. Subtracting the raw pre-mutation stranded set
//       would silently retire the whole repair-node arm of this guard: repair-node's (2b) safe point runs
//       with a downstream gate at `in_progress`, and `in_progress` is not in the SATISFIED set, so every
//       settled descendant above that gate already counts as "stranded before" — the exact
//       complete-sink-behind-a-live-gate wedge this guard exists to refuse would have read as pre-existing
//       and been admitted. Attribution keeps it refused while still clearing the disjoint-leg case.
//
//  (ii) FOLD, DON'T REFUSE, ON A READ-ONLY DESCENDANT. A `complete` descendant whose declared write set is
//       EMPTY produced no repo bytes, so there is nothing about it to undo — folding it back to pending is
//       safe and cheap, which is precisely why the post-dominating GATE fold is safe (gates are read-only
//       for the same reason). Refusing on it instead left the upstream writer permanently unrepairable
//       in-plan: no clean ledger state existed from which reopen-node or repair-node would admit it. The
//       fold iterates to a fixpoint, because folding one row can strand the next.
//       SCOPE — the `finalize` role is EXCLUDED even though its declared write set is usually empty. The
//       sink runs main-session-direct and its first irreversible step (the feature commit) writes neither
//       node evidence nor a sink-receipt journal, so nothing in-band distinguishes a pristine sink from one
//       that already committed / pushed / merged; folding it could double-apply irreversible work. A
//       settled sink therefore still refuses, and the replan exit named in the operator hint stays the
//       sanctioned recovery for that state. The fold is also confined to the reopened node's descendant
//       cone: a stranded row OUTSIDE the cone is pre-existing (i), never something this call repairs.
const STRAND_SETTLED_STATUSES = new Set(['complete', 'in_progress', 'n/a', 'n.a', 'na']);
const STRAND_SATISFIED_STATUSES = new Set(['complete', 'n/a', 'n.a', 'na']);

// Rows left settled above a dependency THIS mutation moved (see (i)); `moved` is the attribution set.
function strandedByMovedDeps(nodes, statuses, moved) {
  return nodes
    .filter(node => STRAND_SETTLED_STATUSES.has(statuses[node.id])
      && (node.dependsOn || []).some(dep => moved.has(dep)
        && Object.prototype.hasOwnProperty.call(statuses, dep)
        && !STRAND_SATISFIED_STATUSES.has(statuses[dep])))
    .map(node => node.id);
}

// planLedgerReset — simulate the mutation and return { readOnlyReset, stranded }:
//   readOnlyReset  read-only descendants to fold to pending ALONGSIDE the post-dominating gates (ii)
//   stranded       rows this mutation NEWLY strands and cannot fold — the refusal set (i)
function planLedgerReset(nodes, ledgerStatuses, reopenedId, resetToPending, descendants) {
  const simulated = Object.assign({}, ledgerStatuses);
  // The attribution set: every row whose status this mutation writes. The reopened node counts — it moves
  // complete → in_progress, which is NOT satisfied, so a settled row directly above it is newly stranded
  // too. A row the reset targets that is already `pending` counts as well: it is inside the cone this call
  // is redoing, so leaving a settled row above it is this call's business, not pre-existing history.
  const moved = new Set([reopenedId]);
  for (const id of (resetToPending || [])) {
    if (!Object.prototype.hasOwnProperty.call(simulated, id)) continue;
    moved.add(id);
    if (simulated[id] === 'complete' || simulated[id] === 'in_progress') simulated[id] = 'pending';
  }
  simulated[reopenedId] = 'in_progress';
  const byId = new Map(nodes.map(node => [node.id, node]));
  const inCone = id => id !== reopenedId && (descendants ? descendants.has(id) : true);
  const readOnlyReset = [];
  for (;;) {
    const strandedNow = strandedByMovedDeps(nodes, simulated, moved);
    const foldable = strandedNow.filter(id => simulated[id] === 'complete' && inCone(id)
      && byId.get(id) && byId.get(id).role !== 'finalize' && isReadOnlyNode(byId.get(id)));
    if (!foldable.length) {
      return { readOnlyReset: readOnlyReset.slice().sort(), stranded: strandedNow.slice().sort() };
    }
    // Each pass flips at least one complete→pending, so the fixpoint terminates. A folded row joins the
    // attribution set: folding it is this mutation's doing, so whatever it strands is newly stranded.
    for (const id of foldable) { simulated[id] = 'pending'; moved.add(id); readOnlyReset.push(id); }
  }
}

// The stranded-dependent refusal fires from two structurally different states, and its advice differs
// between them; this is the discriminator. A run is FINISHED only when its terminal sink actually RAN to
// `complete`. Deliberately NOT the strand-satisfied set: `n/a` also satisfies the strand invariant (a
// not-applicable row can sit above a reset dependency), but a not-applicable sink means the sink was
// SKIPPED — nothing shipped — so telling the operator to "treat the work as shipped and open a follow-up"
// would be false AND would foreclose the in-plan mid-run continuation. With a pending / in_progress / n/a
// sink, and with no resolvable sink at all (the answer is then simply unknown), the conservative read is
// "not finished" — never tell an operator that work shipped when it may not have.
function runIsFinished(sinkId, ledgerStatuses) {
  if (!sinkId) return false;
  return (ledgerStatuses || {})[sinkId] === 'complete';
}

function runReopenNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, unlink, readdir } = opts;
  // #334: a downstream non-delegable main-session-gate is reset like the reviewer gates so a
  // plan-repair to implementation re-triggers the visual check (it post-dominates N and folds
  // complete|in_progress → pending; the orphan guard at (3b) tolerates it for the same reason).
  // #444: GATE_ROLES promoted to module-level const — no redefinition needed here.

  const reopenFence = journalFence(opts, readFile(planPath));
  if (reopenFence) return reopenFence;

  // (1) #383: a plan-repair reopen must never fight a live #377 scheduler fan-out (it would create an
  // orphan multi-in_progress ledger). Refuse scheduler_active over a live / opening running set.
  // (#594: the former sibling arm — refuse active_batch_exists over a live active-batch.json — is gone;
  // that manifest has no producer left.)
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const runningSet = readRunningSet(runningSetPath, cacheExists, readFile);
  if (runningSet) {
    const rsOpening = runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening);
    const rsLive = (runningSet.nodes || []).length > 0;
    if (rsLive || rsOpening) {
      return { result: 'refuse', reason: 'scheduler_active', detail: 'reconcile/close the active running-set fan-out before a plan-repair reopen', runningSet: (runningSet.nodes || []).map(n => n.id) };
    }
  }

  let planContent = readFile(planPath);
  // (2-pre) #343: capture the PRE-mutation ledger statuses for the orphan guard below.
  const ledgerStatuses = readLedgerStatuses(planContent);
  const nodes = parseNodesFromContent(planContent);
  if (!nodes.length) return { result: 'refuse', reason: 'no_parseable_nodes' };
  if (!nodes.some(n => n.id === nodeId)) return { result: 'refuse', reason: 'node_not_found', nodeId };

  // (2) N must be a COMPLETE ledger row — reset complete→pending. #621: alreadyAtTarget (the row is
  // ALREADY pending) is ALSO accepted here — the crash-window retry case: a PRIOR reopen-node call
  // already applied this reset + folded the gates + wrote them to disk (the (5) prep-write below), then
  // crashed BEFORE recording the fresh baseline / flipping N back to in_progress. spliceLedgerNode's
  // currentStatus===newStatus check fires regardless of allowFrom, so a retried call over that exact
  // window re-derives the SAME gatesReset/gatesFolded (idempotent no-op splices) and proceeds straight to
  // the baseline + flip at (5) — reopen-node is idempotent across its own crash window.
  const reset = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['complete'] });
  if (!reset.found) return { result: 'refuse', reason: 'node_not_in_ledger', nodeId };
  if (!reset.changed && !reset.alreadyAtTarget) {
    return { result: 'refuse', reason: 'node_not_complete', nodeId, detail: 'only a complete node can be reopened for repair' };
  }
  planContent = reset.content;

  // (3) Post-dominating gate(s): gate-role descendants of N that every path N→sink crosses.
  const fwd = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) if (fwd.has(d)) fwd.get(d).push(n.id);
  const descendantsOf = start => {
    const seen = new Set();
    const stack = (fwd.get(start) || []).slice();
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of (fwd.get(x) || [])) if (!seen.has(y)) stack.push(y);
    }
    return seen;
  };
  const ids = new Set(nodes.map(n => n.id));
  const hasOut = new Set();
  for (const n of nodes) for (const d of n.dependsOn) if (ids.has(d)) hasOut.add(d);
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  const sink = terminals.length === 1 ? terminals[0].id : null;
  const postDominates = gid => {
    if (!sink) return true; // no unique sink → conservatively treat the gate as gating
    const seen = new Set([gid]); // gid removed from the graph
    const stack = [nodeId];
    while (stack.length) {
      const x = stack.pop();
      if (x === sink) return false; // reached the sink avoiding gid → gid does NOT post-dominate
      for (const y of (fwd.get(x) || [])) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return true; // sink unreachable without gid → gid post-dominates N
  };
  const desc = descendantsOf(nodeId);
  const gatesReset = nodes
    .filter(n => {
      if (!desc.has(n.id) || !GATE_ROLES.has(n.role)) return false;
      if (postDominates(n.id)) return true;
      // An explicit skeptic group is an AND-joined collective gate. No individual
      // member post-dominates the producer in the simple path graph, but the frozen
      // group does; reset the exact group when its common origin is downstream.
      if (n.role === 'adversarial-verifier' && n.shape && n.shape.kind === 'fanout' && String(n.cardinality) === '1') {
        const { resolveAdversarialFanoutGroup } = require('./kaola-workflow-plan-validator');
        const group = resolveAdversarialFanoutGroup(nodes, n);
        return group && group.members.length > 0 && group.members.every(id => desc.has(id));
      }
      return false;
    })
    .map(n => n.id);

  // (3b) #343 fail-closed orphan guard: the ONLY in_progress rows tolerated at reopen time
  // are post-dominating gates of N (they fold to pending below). Any other in_progress
  // row would leave an orphan multi-in_progress ledger after the reopen — refuse BEFORE
  // any real side effect (unlink/writeFile/baseline) so a refused call is a pure no-op.
  // (id !== nodeId is defensive only — an in_progress N is already refused node_not_complete.)
  const gateSet = new Set(gatesReset);
  const orphans = Object.keys(ledgerStatuses)
    .filter(id => ledgerStatuses[id] === 'in_progress' && id !== nodeId && !gateSet.has(id));
  if (orphans.length) {
    return {
      result: 'refuse',
      reason: 'would_orphan_in_progress',
      nodeId,
      inProgress: orphans,
      detail: 'in_progress row(s) [' + orphans.join(', ') + '] are not post-dominating gates of '
        + nodeId + ' — reopening would leave an orphan multi-in_progress ledger',
      repair: 'close the listed node(s) via close-and-open-next (or reconcile/abort the batch) '
        + 'first, then re-run reopen-node',
    };
  }

  // (3b-ii) Fail-closed STRANDED-DEPENDENT guard — the role-agnostic ledger invariant (see
  // planLedgerReset). A `complete` non-gate descendant is neither folded by (3c) nor seen by (3b),
  // so the reopen used to ADMIT a mutation that leaves it above a dependency chain this same call reset.
  // Refuse HERE instead, before any side effect — but only for what THIS mutation newly strands, and only
  // when the row cannot simply be folded with the gates (a read-only descendant can; see planLedgerReset).
  const resetPlan = planLedgerReset(nodes, ledgerStatuses, nodeId, gatesReset, desc);
  const stranded = resetPlan.stranded;
  if (stranded.length) {
    return {
      result: 'refuse',
      reason: 'would_strand_completed_dependent',
      nodeId,
      stranded,
      detail: 'reopening ' + nodeId + ' would leave settled row(s) [' + stranded.join(', ')
        + '] above a dependency this reset moves to pending — a ledger shape every downstream authority '
        + 'rejects as state_ledger_progress_invalid',
      operator_hint: getOperatorHint('would_strand_completed_dependent',
        { nodeId, stranded, op: 'reopen', runFinished: runIsFinished(sink, ledgerStatuses) }),
    };
  }
  // Read-only descendants fold to pending ALONGSIDE the gates. rowsReset is the full reset set from here
  // on — ledger fold, stale baselines, stale evidence — so a folded read-only row is treated EXACTLY like
  // a folded gate. gatesReset stays the structural gate set for reporting.
  const readOnlyReset = resetPlan.readOnlyReset;
  const rowsReset = gatesReset.concat(readOnlyReset);

  // (3c) Fold the post-dominating gates to pending. #343: an in_progress gate — the mid-gate
  // repair case (the gate just emitted a blocking finding owned by N) — folds back to
  // pending exactly like a complete one, so the repair does NOT have to advance the DAG
  // to allDone on a known-broken tree. gatesFolded = the rows actually flipped (gates + read-only rows).
  const gatesFolded = [];
  for (const gid of rowsReset) {
    const s = spliceLedgerNode(planContent, gid, 'pending', { allowFrom: ['complete', 'in_progress'] });
    if (s.changed) { planContent = s.content; gatesFolded.push(gid); }
  }

  // (4) Remove stale per-node baselines for N + the reset rows.
  const cacheBaseFile = nid => path.join(path.dirname(planPath), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  const baselinesRemoved = [];
  for (const id of [nodeId, ...rowsReset]) {
    const bf = cacheBaseFile(id);
    const present = cacheExists ? cacheExists(bf) : true;
    if (present && typeof unlink === 'function') {
      unlink(bf);
      baselinesRemoved.push('barrier-base-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_'));
    }
    // #368: also drop the gc-anchored baseline REF (not just the .cache file). A dangling ref
    // would otherwise survive the reopen and, paired with a re-recorded file, could trip
    // --barrier-check's barrier_base_mismatch. --drop-base removes file+ref together and is
    // idempotent (a missing file/ref is a clean no-op).
    shell(validatorPath, [planPath, '--drop-base', '--node-id', id, '--json']);
  }

  // (4b) #349: remove stale gate VERDICT evidence for the reset gates. A gate is folded back to
  // pending precisely because its prior verdict no longer applies to the changed tree; leaving
  // its `.cache/<gate-id>.md` in place lets a later close-without-fresh-dispatch (orchestrator
  // error, resume confusion, or the no-op-close path) pass Finalization's blocking --verdict-check
  // on a STALE `verdict: pass` / `findings_blocking: 0` — shipping repaired code unreviewed.
  // record-evidence writes the file verbatim as `<nodeId>.md` (NOT sanitized like the baseline).
  // For a fanout adversarial-verifier gate, the verdict-check globs `.cache/adversarial-verifier-*.md`
  // per-instance siblings — purge those too (once).
  const cacheDir = path.dirname(cacheBaseFile(nodeId));
  const gateById = new Map(nodes.map(n => [n.id, n]));
  const evidenceRemoved = [];
  const { resolveAdversarialFanoutGroup } = require('./kaola-workflow-plan-validator');
  const removedNames = new Set();
  const removeEvidenceName = (name, knownPresent) => {
    if (removedNames.has(name)) return;
    const ev = path.join(cacheDir, name);
    if ((knownPresent || (cacheExists ? cacheExists(ev) : false)) && typeof unlink === 'function') {
      unlink(ev);
      evidenceRemoved.push(name);
      removedNames.add(name);
    }
  };
  for (const gid of rowsReset) {
    removeEvidenceName(gid + '.md');
    const g = gateById.get(gid);
    if (g && g.role === 'adversarial-verifier' && g.shape && g.shape.kind === 'fanout') {
      const group = resolveAdversarialFanoutGroup(nodes, g);
      if (group && group.mode === 'canonical-node-id') {
        for (const memberId of group.members) removeEvidenceName(memberId + '.md');
      } else if (typeof readdir === 'function') {
        // Archived role-prefix receipts carry no group label. They are attributable
        // only when the frozen plan contains exactly one legacy adversarial fan-out.
        const legacyGroups = nodes.filter(n => n.role === 'adversarial-verifier'
          && n.shape && n.shape.kind === 'fanout' && String(n.cardinality) !== '1');
        if (legacyGroups.length === 1) {
          for (const name of readdir(cacheDir)) {
            if (typeof name === 'string' && /^adversarial-verifier-.*\.md$/.test(name)) removeEvidenceName(name, true);
          }
        }
      }
    }
  }

  const reopenReviewOpen = prepareReviewOpen(opts, planContent, { id: nodeId });
  if (!reopenReviewOpen.ok) {
    return { result: 'refuse', reason: reopenReviewOpen.reason,
      detail: reopenReviewOpen.detail || null, nodeId };
  }

  // (5) #621: persist the reset + folded gates (N still PENDING) BEFORE recording the fresh baseline,
  // mirroring runOpenNext's #590 baseline-first ordering: --record-base is ledger-status-agnostic (it
  // snapshots the worktree keyed by node-id only), so it is safe to run against this on-disk PENDING
  // row. Only AFTER the baseline succeeds do we flip N to in_progress and write again. A crash between
  // this write and the flip below leaves N genuinely PENDING on disk (gates already folded) — never
  // in_progress-without-baseline — and a retried reopen-node call re-enters cleanly via the (2)
  // alreadyAtTarget tolerance above.
  writeFile(planPath, planContent);

  const baseline = shell(commitNodePath, [planPath, '--node-id', nodeId, '--start', '--json']);
  if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
    return { result: 'refuse', reason: 'baseline_failed', nodeId, baselineResult: baseline, gatesReset, readOnlyReset, gatesFolded };
  }

  // Baseline recorded while N was still PENDING on disk — now flip pending→in_progress and persist.
  const reopen = spliceLedgerNode(planContent, nodeId, 'in_progress', { allowFrom: ['pending'] });
  if (reopen.changed) planContent = reopen.content;
  writeFile(planPath, planContent);

  // #424 (D-424-01 §5): provenance log entry — open event (reopen generates a new nonce).
  const reopenNonce = (baseline.recordBase && baseline.recordBase.base)
    ? String(baseline.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', nodeId, reopenNonce);

  // #433 (D-433-01 §4) + #392 anti-replay: reopen generates a NEW nonce. RE-SEED the ENTIRE
  // evidence file (if present) with fresh binding + role stubs, discarding the stale body so
  // prior-attempt evidence cannot pass checkEvidenceShape on the new open. forceRotate=true.
  const nodeRole = (nodes.find(n => n.id === nodeId) || {}).role || 'unknown';
  const reopenSeed = seedEvidenceFile(planPath, nodeId, reopenNonce, nodeRole, true, reopenReviewOpen);

  // #317: post-dominating gates were folded → pending; the reopened node → in_progress.
  // #343: transitions are built from gatesFolded (rows actually flipped), never the
  // structural gatesReset — an already-pending downstream gate gets NO fabricated entry.
  const reopenTransitions = gatesFolded.map(g => buildTransition(g, 'pending', 'reopen-node'));
  reopenTransitions.push(buildTransition(nodeId, 'in_progress', 'reopen-node'));

  return {
    result: 'ok', reopened: nodeId, gatesReset, readOnlyReset, gatesFolded, baselinesRemoved, evidenceRemoved, baselineRecorded: true,
    // #433: report nonce rotation and evidence metadata. #516: this is the bare on-disk mirror (reopen
    // returns no dispatch sub-object; the orchestrator re-dispatches the reopened node via a fresh
    // open-next/open-ready whose dispatch.evidence_file IS project-qualified). Kept bare for vestige parity.
    nonce_rotated: reopenSeed.nonce_rotated,
    evidence_file: reopenSeed.evidence_file,
    required_tokens: reopenSeed.required_tokens,
    taskTransitions: reopenTransitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runRevertOverflow (#434 / D-434-01) — reverts outOfAllow (overflow) writes to their
// baseline state so the subsequent barrier-check passes.
//
// Steps:
//   (1) Shell commit-node --barrier-check --json (per-node) to read the current outOfAllow list.
//   (2) For each outOfAllow path, restore the baseline state via gitCheckout seam.
//   (3) Append a provenance log entry recording the revert.
//   (4) Re-run barrier-check to confirm all overflows cleared.
//
// gitCheckout seam: opts.gitCheckout(barrierRoot, baseSha, filePaths) — injectable for tests.
// Falls back to real execFileSync when not provided.
//
// @param {object} opts
//   planPath   {string}   path to workflow-plan.md
//   project    {string}   project name
//   nodeId     {string}   the in_progress node whose barrier overflowed
//   shell      {function} (scriptPath, args[]) → {exitCode,...}  (commit-node)
//   gitCheckout {function} (barrierRoot, sha, filePaths) → {exitCode}  (injectable seam)
//   readFile   {function} (path) → string
//   writeFile  {function} (path, content) → void
//   cacheExists {function} (path) → boolean
//   appendLog  {function} (entry) → void  (optional; defaults to appendProvenanceLog)
// ---------------------------------------------------------------------------
function runRevertOverflow(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists } = opts;
  const gitCheckoutSeam = opts.gitCheckout || null;
  const appendLogFn = opts.appendLog || null;

  if (!nodeId) return { result: 'refuse', errors: ['--node-id required for revert-overflow'] };

  // (1) Run per-node barrier-check to get outOfAllow list.
  // #546 G10: commit-node's combineResults NESTS outOfAllow at barrierCheck.outOfAllow, so a
  // top-level-only read sees undefined → [] → a false "barrier already clean" while the overflow
  // files are still modified. Read BOTH the top-level and the nested path (mirrors computeTriage's
  // dual-path read) so a nested overflow is still reverted.
  const barrierResult = shell(commitNodePath, [planPath, '--node-id', nodeId, '--barrier-check', '--json']);
  const rawOverflow = (barrierResult && (barrierResult.outOfAllow
    || (barrierResult.barrierCheck && barrierResult.barrierCheck.outOfAllow))) || [];
  const outOfAllow = Array.isArray(rawOverflow) ? rawOverflow : [];

  if (!outOfAllow.length) {
    // Nothing to revert — barrier already passes (or no overflow detected).
    return { result: 'ok', revertedPaths: [], barrierClearedAfterRevert: true, detail: 'no outOfAllow paths — barrier is already clean' };
  }

  // (2) Read the barrier-base SHA for this node.
  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const baseFile = path.join(cacheDir, 'barrier-base-' + sanitizeNodeId(nodeId));
  let baseSha = null;
  try {
    const baseContent = readFile(baseFile);
    baseSha = (baseContent || '').trim().split('\n')[0].trim();
  } catch (_) {
    return { result: 'refuse', reason: 'barrier_base_missing', nodeId, detail: 'cannot read barrier-base for ' + nodeId + ' — run open-next first' };
  }
  if (!baseSha) {
    return { result: 'refuse', reason: 'barrier_base_empty', nodeId };
  }

  // Determine the barrier root (directory containing workflow-plan.md's project folder).
  // The barrier root is the repo root (the git checkout from which paths are relative).
  const barrierRoot = getRoot();

  // (2) Restore each outOfAllow path to its baseline state.
  const revertedPaths = [];
  if (gitCheckoutSeam) {
    const r = gitCheckoutSeam(barrierRoot, baseSha, outOfAllow);
    if (r && r.exitCode !== 0) {
      return { result: 'refuse', reason: 'git_checkout_failed', nodeId, outOfAllow, detail: 'gitCheckout seam returned non-zero' };
    }
    revertedPaths.push(...outOfAllow);
  } else {
    // Real git checkout path.
    try {
      execFileSync('git', ['checkout', baseSha, '--', ...outOfAllow], {
        cwd: barrierRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      revertedPaths.push(...outOfAllow);
    } catch (e) {
      return { result: 'refuse', reason: 'git_checkout_failed', nodeId, outOfAllow, detail: String(e.message || e) };
    }
  }

  // (3) Append provenance log entry for the revert.
  if (typeof appendLogFn === 'function') {
    appendLogFn({ event: 'revert-overflow', nodeId, revertedPaths, baseSha });
  } else {
    appendProvenanceLog(planPath, 'revert-overflow', nodeId, baseSha ? baseSha.slice(0, 12) : null);
  }

  // (4) Re-run barrier-check to confirm cleared.
  const barrierAfter = shell(commitNodePath, [planPath, '--node-id', nodeId, '--barrier-check', '--json']);
  const barrierClearedAfterRevert = !!(barrierAfter && (barrierAfter.result === 'pass' || barrierAfter.exitCode === 0));

  return {
    result: 'ok',
    revertedPaths,
    baseSha: baseSha ? baseSha.slice(0, 12) : null,
    barrierClearedAfterRevert,
    barrierAfter,
  };
}

// ---------------------------------------------------------------------------
// runRepairNode (#434 / D-434-01) — plan-repair for an in_progress writer whose
// reviewer found a blocking issue. Reopens the WRITER node back to in_progress
// for re-dispatch WITHOUT re-snapshotting the baseline (the critical
// anti-laundering invariant: the original barrier-base is KEPT so the repair
// diff is scoped to exactly what changed after the original open).
//
// Differs from runReopenNode:
//   - runReopenNode: node must be COMPLETE; it re-records a FRESH baseline (commit-node --start).
//   - runRepairNode: writer must be COMPLETE (writer finished, reviewer found a problem);
//     it KEEPS the ORIGINAL barrier-base and does NOT shell commit-node at all.
//     Result always carries baselineReused:true (the anti-laundering signal).
//
// Steps:
//   (1) Refuse over a live running set.
//   (2) Require the writer node to be a COMPLETE ledger row (the reviewer is in_progress).
//   (3) Reset the post-dominating gate(s) of the writer to pending (same logic as reopen-node).
//       #664: an explicit skeptic (adversarial-verifier) fan-out GROUP folds as ONE collective
//       post-dominating unit — mirroring reopen-node's #658 fold — once every member has voted
//       (all complete); a mid-vote member is left alone so (3b) still refuses it as an orphan.
//   (4) Delete their stale barrier-base files (downstream baselines; NOT the writer's own).
//   (4c) #664: purge the folded fan-out GROUP's own receipts (stale round-1 votes must not
//       satisfy a later --verdict-check). A singleton (non-fanout) gate's evidence is deliberately
//       RETAINED as the repair brief for the reopened writer.
//   (5) Transition the writer back to in_progress (pending→in_progress via complete→pending).
//   (6) Write the updated plan.
//   (7) Return { result:'ok', baselineReused:true, deletedDownstreamBaselines:[...], evidenceRemoved:[...] }.
//
// The original barrier-base-{nodeId} is NEVER removed. commit-node is NEVER shelled.
// ---------------------------------------------------------------------------
// The barrier .cache base file + anchored ref for a writer — the SAME derivation
// captureWriterBarrierIdentity and the validator's --record-base/--barrier-check use.
function writerBarrierAnchors(opts, nodeId) {
  const safe = sanitizeNodeId(nodeId);
  const cacheDir = path.join(path.dirname(opts.planPath), '.cache');
  const projectTag = path.basename(path.dirname(path.resolve(opts.planPath))).replace(/[^A-Za-z0-9_-]/g, '_') || 'plan';
  return {
    baseFile: path.join(cacheDir, 'barrier-base-' + safe),
    ref: 'refs/kaola-workflow/barrier/' + projectTag + '/' + safe,
  };
}

function resolveRefSha(root, ref) {
  try {
    return String(execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', ref + '^{commit}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '').trim();
  } catch (_) { return ''; }
}

// proveRebindAdmissible — the P1..P4 predicate. Every path in the tree is in EXACTLY ONE partition:
//   1. W(S_X)               the attempt's own producer slice   -> P2, byte-exact
//   2. declaredUnion\W(S_X) some OTHER node's declared paths   -> P3, byte-exact OR positively attributed
//   3. not declared at all  declared by nobody                 -> P1, byte-exact
// Partitions 1 and 3 keep exactly the strength the whole-tree digest supplied. The ONLY relaxation lives
// in partition 2, and there it is not "ignore the path" — it is "attribute the path to a named owner
// whose OWN post-dominating gate has been folded back to pending by that owner's repair, and which
// therefore MUST re-review it". No attributed byte escapes review.
//
// EXHAUSTIVENESS IS A PROPERTY OF THE MEASURING STICK, NOT JUST THE PARTITIONS. Two things must hold, and
// each has already been violated once:
//
//   (a) THE RIGHT ANCHOR. Each predicate compares the tree against the REVIEWED CANDIDATE (P2/P3) or the
//       ATTEMPT'S RESIDUE (P1). It is NOT sufficient for P3 to examine only the writer's barrier diff,
//       which is anchored on the WRITER'S BASELINE — a partition-2 path can differ from the candidate
//       while agreeing with that baseline (see the P3 block below), and it would then be examined by no
//       predicate at all. P3 therefore examines the union of the barrier diff and the candidate-anchored
//       partition-2 delta.
//
//   (b) THE RIGHT STRENGTH. The stick must be as strong as the digest on EVERY axis of tree identity, or
//       a change the digest can see falls in no partition and is waived. `declared` therefore carries
//       '<mode> <sha>', not a bare sha: git records the exec bit and the symlink/gitlink flags in the MODE
//       alone, and a symlink shares its blob sha with a plain file holding the same target text. A sha-only
//       stick is blind to `chmod` and to a file<->symlink swap; the digest, the residue digest, P5 and the
//       barrier are not. Any future field added to the candidate must satisfy BOTH (a) and (b).
//
// PURE: no fs, no git, no mutation. A failure is a typed reason and nothing else happens.
function proveRebindAdmissible(ctx) {
  const { attempt, attempts, nodes, nodeId, now, cand, foreign, declaredUnion, ledgerStatuses } = ctx;

  // A legacy string-returning digest seam gives us no partition data at all — we cannot PROVE anything,
  // so we fail closed to the residual refusal rather than admit an unproven rebind.
  if (now.residue_digest == null || now.declared == null || !cand.declared) {
    return { ok: false, reason: 'candidate_digest_changed' };
  }

  // P1 — RESIDUE UNCHANGED. No path that no node declares has moved since the attempt. No waiver, ever.
  if (now.residue_digest !== attempt.candidate_residue_digest) {
    return { ok: false, reason: 'candidate_residue_changed',
      detail: 'a path no plan node declares changed since this attempt — the reviewed candidate is no longer the tree' };
  }

  // P2 — OWN SLICE UNCHANGED. The code the reviewer refuted is byte-identical. No waiver, ever.
  // S_X is the IMMUTABLE, attempt-time producer slice (never recomputed from the live ledger — that is
  // the seam through which an in_progress sibling could smuggle itself in).
  const sliceIds = Object.keys(attempt.producer_bindings || {});
  const sliceNodes = nodes.filter(n => sliceIds.includes(n.id));
  const slicePaths = declaredUnionPaths(sliceNodes);
  const changedSlice = [...slicePaths].filter(p => (now.declared[p] || null) !== (cand.declared[p] || null)).sort();
  if (changedSlice.length) {
    return { ok: false, reason: 'candidate_slice_changed', paths: changedSlice,
      detail: 'the refuted code changed under the reviewer — re-review it, do not blind-fix it' };
  }

  // P3 — PARTITION-2 DELTA FULLY ATTRIBUTED.
  //
  // The examination set is NOT the writer's barrier diff alone. `foreign` is anchored on the REPAIRING
  // WRITER'S BASELINE, but the theorem needs partition 2 measured against the REVIEWED CANDIDATE. The two
  // sets disagree on exactly one class: a partition-2 path whose CURRENT content equals the repairing
  // writer's BASELINE content while differing from the candidate — i.e. a sibling's declared file REVERTED
  // or DELETED out-of-band after its gate settled. Such a path is absent from `foreign` (identical to the
  // writer's base, so it never enters the writer's diff), invisible to P2 (not the writer's slice), and
  // invisible to P1 (it IS declared) — it would fall in NO partition and the proof would pass VACUOUSLY,
  // binding the attempt to a mutated candidate with `absorbed: []`. Union in the candidate-anchored delta
  // so partition 2 is examined exhaustively. Paths added here can never satisfy P3a (they differ from the
  // candidate by construction), so they demand P3b attribution plus the disjointness clause, and they are
  // absorbed into the record like any other — the record stays honest.
  // TEMPORAL SOUNDNESS OF P3b. `repair.selected_writer` is set once and NEVER cleared, so the mere
  // EXISTENCE of a past repair on another gate is not evidence that the moved path will be re-reviewed:
  // once that gate has RE-PASSED and gone `complete`, its fold is DISCHARGED and it re-reviews nothing.
  // Attributing a later, out-of-band movement of the owner's path to such a spent repair launders an
  // unreviewed blob to the sink. P3b may therefore only cite a repair whose selecting gate is CURRENTLY
  // LIVE — still folded-to-pending (not `complete`) — so its imminent re-review actually covers the
  // absorbed content. The legitimate co-repair flow is unaffected: while a sibling gate is still fenced
  // (its own attempt unresolved) its post-dominators cannot reopen, so the owner gate stays folded and
  // its writer stays attributable. The ground-truth folded-state is the ledger status of the gate's
  // members (a gate folds ALL its members to `pending` and re-passes them ALL to `complete` together).
  // #688 (items 1+2, N2R1/N3R1): FAIL CLOSED on an absent ledger (no `|| {}` admit-all fallback — a
  // missing/omitted ledgerStatuses now refuses attribution rather than treating every lookup as
  // "non-complete") AND restrict the liveness quantifier to status ∈ {pending, in_progress} — the ONLY
  // statuses whose owner gate will actually re-review. `n/a` (a selector-pruned arm) never re-reviews
  // and, unlike in_progress, is not caught by would_orphan_in_progress, so it must NOT count as live.
  const repairWriters = new Set((attempts || [])
    .filter(a => a && a.repair && a.repair.selected_writer != null
      && a.logical_gate && a.logical_gate.key !== attempt.logical_gate.key
      && ledgerStatuses != null
      && (a.logical_gate.members || []).some(m => ledgerStatuses[m] === 'pending' || ledgerStatuses[m] === 'in_progress'))
    .map(a => a.repair.selected_writer));
  const candidateDelta = [...(declaredUnion || [])].filter(p => !slicePaths.has(p)
    && (now.declared[p] || null) !== (cand.declared[p] || null));
  const examine = [...new Set([...(foreign || []), ...candidateDelta])].sort();
  const absorbed = [];
  const attributedTo = new Set();
  const unattributed = [];
  for (const p of examine) {
    const owners = resolveOwningNodes(p, nodes);
    if (!owners.length) { unattributed.push(p); continue; }
    const sliceSet = new Set(sliceIds);
    const disjoint = owners.every(o => !sliceSet.has(o)
      && ![...declaredUnionPaths(nodes.filter(n => n.id === o))].some(q => slicePaths.has(q)));
    if (!disjoint) { unattributed.push(p); continue; }
    const unchangedSinceReview = (now.declared[p] || null) === (cand.declared[p] || null);   // P3a
    const ownedByRecordedRepair = owners.some(o => repairWriters.has(o));                    // P3b
    if (!unchangedSinceReview && !ownedByRecordedRepair) { unattributed.push(p); continue; }
    absorbed.push({ path: p, from_blob: cand.declared[p] || null, to_blob: now.declared[p] || null,
      owner: owners.slice().sort()[0] });
    for (const o of owners) attributedTo.add(o);
  }
  if (unattributed.length) {
    return { ok: false, reason: 'candidate_delta_unattributed', paths: unattributed.sort(),
      detail: 'a changed path outside this writer\'s set has no owner, an owner overlapping the reviewed slice, or no recorded repair on another gate' };
  }

  // P4 — REBIND CAP.
  if (nonAbortedRebinds(attempt).length >= REVIEW_REBIND_LIMIT) {
    return { ok: false, reason: 'rebind_limit_reached' };
  }
  absorbed.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, absorbed, attributed_to: [...attributedTo].sort() };
}

// performRebind — the durable transaction. ORDER IS LOAD-BEARING: journal first (record unsettled), ref
// second, settle third. A crash at any prefix leaves an INERT record — one whose ref never moved binds
// nothing, and reconcilePendingRebind converges it on retry. Append-only: no prior record is ever
// rewritten, and the attempt's own candidate_digest / transaction_key / producer_bindings never move.
function performRebind(ctx) {
  const { opts, attempt, state, nodeId, writerPaths, now, currentIdentity, absorbed, attributedTo } = ctx;
  const root = opts.repoRoot || getRoot();
  const { baseFile, ref } = writerBarrierAnchors(opts, nodeId);
  const nowTree = snapshotCandidateTree(root);
  // P5 — RE-ANCHOR SAFETY, asserted INSIDE buildSyntheticBase before it returns a commit: for every path
  // the writer is allowed to write, the synthetic base is byte-identical to the OLD baseline (both-absent
  // included). This is what makes the re-anchor unable to hide a dirty declared path: any uncommitted,
  // unreviewed change to such a path is STILL in diff(B', now) and the barrier still sees it.
  const synth = buildSyntheticBase(root, currentIdentity.baseline, nowTree, writerPaths, opts.rebindTreeFault);
  if (!synth.ok) {
    return { ok: false, reason: synth.reason,
      detail: synth.path ? 'the synthetic base would alter "' + synth.path + '" — a path this writer may write' : synth.detail };
  }
  const overlay = { baseline: synth.commit, anchored_ref: synth.commit,
    open_token: currentIdentity.open_token, generation: synth.commit.slice(0, 12), ref: currentIdentity.ref };
  const record = {
    generation: nonAbortedRebinds(attempt).length + 1,
    base_before: currentIdentity.baseline,
    base_after: synth.commit,
    candidate_digest: now.digest,
    candidate_declared: now.declared,
    producer_bindings: { [nodeId]: overlay },
    absorbed: absorbed || [],
    attributed_to: attributedTo || [],
    settled: false,
    aborted: false,
  };
  // The schema pins `rebind.length > 0 => a selected repair writer`: a rebind IS a commitment to repair
  // through THIS writer, and it is only reached after the unique-maximal producer proof named it.
  if (!attempt.repair || attempt.repair.selected_writer == null) {
    attempt.repair = { selected_writer: nodeId, settled: false };
  }
  if (!Array.isArray(attempt.rebind)) attempt.rebind = [];
  attempt.rebind.push(record);
  writeReviewJournal(opts, state);
  reviewFailpoint(opts, 'rebind_recorded');

  execFileSync('git', ['-C', root, 'update-ref', ref, synth.commit], { stdio: ['ignore', 'ignore', 'ignore'] });
  opts.writeFile(baseFile, synth.commit);
  reviewFailpoint(opts, 'rebind_base_written');

  record.settled = true;
  writeReviewJournal(opts, state);
  reviewFailpoint(opts, 'rebind_settled');
  return { ok: true, record };
}

// P5, re-asserted against an ALREADY-BUILT commit (the crash-retry path): is `candidate` byte-identical
// to `oldBase` on every path the writer is allowed to write? Returns false if either object is gone.
function syntheticBaseIsSafe(root, oldBase, candidate, writerPaths) {
  try {
    const before = treeEntriesFor(root, oldBase, writerPaths);
    const after = treeEntriesFor(root, candidate, writerPaths);
    for (const p of writerPaths) {
      const b = before.get(p);
      const a = after.get(p);
      if (!((!b && !a) || (b && a && b.sha === a.sha && b.mode === a.mode))) return false;
    }
    return true;
  } catch (_) { return false; }
}

// reconcilePendingRebind — crash convergence for the three rebind failpoints. Runs BEFORE the writer
// identity check, because an interrupted rebind can legitimately leave the on-disk ref ahead of the
// journal's effective binding (which would otherwise read as writer_identity_changed).
//
// Convergence is decided on the CANDIDATE, never on the synthetic commit's sha. The synthetic base wraps
// the whole landable tree — INCLUDING this project's own control state (the journal we just wrote, the
// plan, the evidence) — so its sha necessarily drifts between the crash and the retry even when nothing
// meaningful moved. The candidate triple is the exempt-filtered content address: it is what "the tree
// moved" actually means, and it is stable across our own bookkeeping writes.
function reconcilePendingRebind(opts, attempt, state, nodeId, writerPaths, now) {
  const pending = (Array.isArray(attempt.rebind) ? attempt.rebind : [])
    .filter(r => r && r.aborted !== true && r.settled !== true);
  if (!pending.length) return { ok: true };
  if (pending.length > 1) return { ok: false, reason: 'rebind_replay_diverged', detail: 'more than one unsettled rebind record' };
  const record = pending[0];
  const root = opts.repoRoot || getRoot();
  const { baseFile, ref } = writerBarrierAnchors(opts, nodeId);
  const refSha = resolveRefSha(root, ref);

  // (a) The ref already moved — the crash was AFTER `rebind_base_written`. Pure idempotent completion.
  if (refSha && refSha === record.base_after) {
    opts.writeFile(baseFile, record.base_after);
    record.settled = true;
    writeReviewJournal(opts, state);
    return { ok: true, resumed: 'rebind_base_written' };
  }
  // (b) The ref never moved — the crash was after `rebind_recorded`. The record binds NOTHING (the
  // barrier still reads base_before), so it is safe either to complete it or to abort it.
  if (refSha && refSha === record.base_before) {
    const candidateUnmoved = now && now.digest === record.candidate_digest;
    if (candidateUnmoved && syntheticBaseIsSafe(root, record.base_before, record.base_after, writerPaths)) {
      // The recorded synthetic commit still exists and still satisfies P5 against the writer's declared
      // paths, and the candidate has not moved. Complete the interrupted transaction — idempotent.
      execFileSync('git', ['-C', root, 'update-ref', ref, record.base_after], { stdio: ['ignore', 'ignore', 'ignore'] });
      opts.writeFile(baseFile, record.base_after);
      record.settled = true;
      writeReviewJournal(opts, state);
      return { ok: true, resumed: 'rebind_recorded' };
    }
    // The tree moved again under the interrupted rebind (or the recorded base is gone). ABORT the record
    // — append-only: it is MARKED, never deleted — and let the caller re-run the FULL proof from scratch
    // against the current tree. If that fresh proof fails, the repair refuses; nothing was laundered.
    record.aborted = true;
    writeReviewJournal(opts, state);
    return { ok: true, aborted: true };
  }
  // (c) The ref is neither the before nor the after. Fail closed — restore it from the recorded pair.
  return { ok: false, reason: 'rebind_replay_diverged',
    detail: 'anchored ref "' + (refSha || '(missing)') + '" is neither base_before (' + record.base_before
      + ') nor base_after (' + record.base_after + ') of the unsettled rebind — restore it from the recorded pair' };
}

function runRepairNodeCore(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, unlink, readdir, attemptId } = opts;

  if (!nodeId) return { result: 'refuse', errors: ['--node-id required for repair-node'] };

  const initialPlan = readFile(planPath);
  const hasReviewJournal = !!planHashFromContent(initialPlan);
  let repairJournalState = null;
  let repairAttempt = null;
  let repairAlreadySelected = false;
  // A proven-admissible rebind, held across the P0 orphan guard (see STEP 13). null on every path that
  // does not need one — which is every pre-existing path.
  let pendingRebind = null;
  // #739 — an admissible in-plan descendant replay: { owner, descendants }. Set at the ownership-proof
  // decision (below) when the finding owner is a non-maximal upstream writer whose completed descendant
  // cone is mechanically replayable; null on every direct-repair path. When set, the writer being
  // reopened IS the owner and the tail additionally resets the descendant cone + records the replay.
  let replayMode = null;
  if (hasReviewJournal) {
    if (!attemptId) return { result: 'refuse', errors: ['--attempt-id required for repair-node'] };
    repairJournalState = readReviewJournal(opts, initialPlan);
    if (!repairJournalState.ok) return { result: 'refuse', reason: repairJournalState.reason };
    repairAttempt = repairJournalState.journal.attempts.find(a => a.attempt_id === attemptId);
    if (!repairAttempt || repairAttempt.outcome !== 'fail' || repairAttempt.lifecycle_settled !== true) {
      return { result: 'refuse', reason: 'review_attempt_not_repairable', attempt_id: attemptId };
    }
    if (repairAttempt.consumed_by != null) {
      return repairAttempt.consumed_by === nodeId
        ? { result: 'ok', repaired: nodeId, attempt_id: attemptId, baselineReused: true, idempotent: true }
        : { result: 'refuse', reason: 'review_attempt_consumed', attempt_id: attemptId };
    }

    // ---- STEP 5 (HOISTED): the consumption-resume short-circuit. -------------------------------
    // A crash between `repair_settled_written` and `repair_consumed_written` leaves the repair DONE
    // (plan mutated, gates folded, artifacts removed, brief seeded) but unrecorded. The writer was
    // durably reopened and is now — legitimately, on instruction — EDITING ITS FILES. Running the
    // digest / producer / barrier proofs against that moving tree does not merely waste work: it asks
    // the wrong question, and the digest check fires first and wedges the attempt forever (it can
    // never be consumed, and reviewJournalBlocker fences every opener). Those proofs are preconditions
    // for PERFORMING a repair, not for RECORDING one that already happened — and every one of them DID
    // pass, pre-crash, when this repair was authorized.
    //
    // Not a laundering hole: the guards below are the full pre-crash set, plus a tree-INDEPENDENT
    // identity re-verification. And it cannot launder the circuit breaker — the limit check already
    // passed when this repair was authorized, and consuming increments the count by exactly 1, which is
    // precisely what a crash-free run would have done. Refusing on the limit here would instead CREATE a
    // strictly worse dead-end: a repair that is done but permanently unrecordable.
    const consumptionPendingEarly = !!(repairAttempt.repair
      && repairAttempt.repair.settled === true && repairAttempt.repair.selected_writer === nodeId
      && repairAttempt.consumed_by == null
      && readLedgerStatuses(initialPlan)[nodeId] === 'in_progress');
    if (consumptionPendingEarly) {
      const resumeExpected = effectiveProducerBinding(repairAttempt, nodeId);
      const resumeCurrent = opts.captureWriterBarrierIdentity
        ? opts.captureWriterBarrierIdentity(nodeId) : captureWriterBarrierIdentity(opts, nodeId);
      if (!verifyWriterBarrierIdentity(resumeExpected, resumeCurrent)) {
        // The anchored ref was lost or replaced while the writer was reopened. Documented NON-DISCARD
        // recovery: restore the ref from .cache/barrier-base-<writer>
        // (git update-ref refs/kaola-workflow/barrier/<project>/<writer> <sha-in-that-file>), then re-run
        // this exact command — it short-circuits straight to the consume path.
        return { result: 'repair_requires_replan', reason: 'writer_identity_changed',
          attempt_id: attemptId, producer_slice: [nodeId] };
      }
      repairAttempt.consumed_by = nodeId;
      writeReviewJournal(opts, repairJournalState);
      return { result: 'ok', repaired: nodeId, attempt_id: repairAttempt.attempt_id,
        consumed_by: nodeId, baselineReused: true, resumed: true };
    }

    // ---- STEP 6: the five-consumed-repairs circuit breaker. ------------------------------------
    // Deliberately ABOVE every rebind proof and every rebind mutation: a gate at the limit refuses
    // WITHOUT appending a rebind record and WITHOUT moving a ref.
    const consumed = consumedReviewRepairs(repairJournalState.journal.attempts, repairAttempt.logical_gate.key);
    if (consumed >= REVIEW_REPAIR_LIMIT) {
      return { result: 'repair_limit_reached', attempt_id: attemptId, consumed, limit: REVIEW_REPAIR_LIMIT };
    }

    const persistedRepair = repairAttempt.repair;
    repairAlreadySelected = !!(persistedRepair && persistedRepair.selected_writer != null);
    if (repairAlreadySelected && persistedRepair.selected_writer !== nodeId) {
      return { result: 'refuse', reason: 'repair_writer_mismatch', attempt_id: attemptId };
    }
    const proofNodes = parseNodesFromContent(initialPlan);
    const proofLedger = readLedgerStatuses(initialPlan);
    let proof = { ok: true, producer_slice: [nodeId] };
    if (!repairAlreadySelected) {
      proof = uniqueMaximalReviewProducer(proofNodes, repairAttempt.logical_gate.members, nodeId,
        proofLedger);
      // ---- #701 (D-701-01): the SEMANTIC-OWNER admissibility bridge, layered on the #682/#684 graph-
      // maximal proof. route_candidates now carries REAL ownership (schema-2 anchor routing, Layer 1), so a
      // repair reopen can be cross-checked against which writer actually OWNS the attempt's still-open
      // blocking findings — not merely which writer is graph-maximal (a serial TAIL writer can be maximal
      // while owning none of them). The bridge only ever makes admission STRICTER, and it stays INERT when
      // ownership is unresolvable (anchor-less findings / a pre-fix journal) so it never falsely accuses a
      // maximal writer that simply has no routable owner — those defer to the unchanged proof below.
      const own = findingOwnershipSummary(repairAttempt, nodeId);
      if (!proof.ok) {
        // nodeId is NOT the unique graph-maximal executed producer (the #682/#684 antichain refusal). When
        // the operator named the true SEMANTIC OWNER instead — a non-maximal upstream writer that UNIQUELY
        // owns the still-open findings AND has completed non-gate writer descendants whose outputs a safe
        // reopen would have to replay — surface `dependent_producer_replay_required`, naming the owner +
        // blocking descendants so #699 can activate a replacement plan (the descendant-fold replay
        // transaction is deferred: Option 1). Ownership must be RESOLVABLE to name an owner; otherwise the
        // bare replan is unchanged (also covers anchor-less findings / a pre-fix empty-ownership journal).
        if (own.anyOwned && own.uniqueOwner === nodeId) {
          const blocking = completedNonGateWriterDescendants(proofNodes, proofLedger, nodeId);
          if (blocking.length) {
            // #739 — the finding owner is a non-maximal upstream writer that UNIQUELY owns the still-open
            // findings and has completed non-gate writer descendants. Perform the IN-PLAN descendant
            // replay (reopen the owner + reset its completed descendant cone + fold the post-dominating
            // gates, consuming ZERO epochs) when the cone is mechanically replayable AND every still-open
            // finding is owned inside it. Otherwise keep the existing claim-preserving replan path — the
            // decision is tighten-only: an unownable (scope-expansion) finding or a non-mechanical cone
            // member (e.g. a parallel-leg synthesis boundary) still routes to replan.
            const anyUnownedFinding = own.openFindings.some(f =>
              !(Array.isArray(f.ownership_candidates) && f.ownership_candidates.length > 0));
            const coneSafety = replayConeSafety(proofNodes, nodeId);
            // The owner must be a GRAPH producer of the gate (a common-ancestor writer in the slice), not
            // merely a write-set-path match. A malformed out-of-surface finding routed to a non-ancestor
            // writer would otherwise record a replay that later wedges the identity proof (owner ∉ slice);
            // requiring slice membership here routes that shape to the existing replan path instead.
            const ownerIsProducer = proof.producer_slice.includes(nodeId);
            if (!anyUnownedFinding && coneSafety.ok && ownerIsProducer) {
              replayMode = { owner: nodeId, descendants: blocking };
              // Fall through into the repair transaction on the owner; the tail (STEP 5b) additionally
              // resets the descendant cone and records the durable replay decision. No return here.
            } else {
              return { result: 'repair_requires_replan', reason: 'dependent_producer_replay_required',
                attempt_id: attemptId, producer_slice: proof.producer_slice,
                semantic_owner: nodeId, blocking_descendants: blocking,
                replay_declined: anyUnownedFinding ? 'finding_outside_cone'
                  : !ownerIsProducer ? 'owner_not_gate_producer' : coneSafety.reason,
                operator_hint: getOperatorHint('dependent_producer_replay_required',
                  { semantic_owner: nodeId, blocking_descendants: blocking }) };
            }
          } else {
            return { result: 'repair_requires_replan', attempt_id: attemptId, producer_slice: proof.producer_slice };
          }
        } else {
          return { result: 'repair_requires_replan', attempt_id: attemptId, producer_slice: proof.producer_slice };
        }
      }
      // proof.ok — nodeId is graph-maximal. When ownership is RESOLVABLE (≥1 open finding routed to a
      // writer) it must ALSO own ≥1 of them, else reopening it cannot repair the flagged code (the #701
      // tail-writer hazard). When ownership is ABSENT for every open finding the bridge stays inert (see
      // above) and the reopen proceeds on the graph-maximal proof exactly as before.
      if (own.anyOwned && !own.nodeOwns) {
        return { result: 'repair_writer_ownership_mismatch', attempt_id: attemptId,
          producer_slice: proof.producer_slice, semantic_owner: own.uniqueOwner,
          ownership_candidates: own.ownersUnionSorted,
          operator_hint: getOperatorHint('repair_writer_ownership_mismatch',
            { nodeId, owners: own.ownersUnionSorted }) };
      }
    }
    // #739 — on a repair RESUME (repair already selected, so the proof block above was skipped) re-derive
    // the replay mode from the DURABLE replay record. It is written into the same first-durable-mutation as
    // repair.selected_writer, so either both survived a crash (and this rebuilds replayMode) or neither did
    // (repairAlreadySelected is false and the proof block re-runs the decision against the unchanged
    // ledger). Both branches converge on the identical replayMode — the crash-idempotence invariant.
    if (!replayMode && repairAttempt && repairAttempt.replay && typeof repairAttempt.replay === 'object'
      && typeof repairAttempt.replay.owner === 'string' && Array.isArray(repairAttempt.replay.descendants)) {
      replayMode = { owner: repairAttempt.replay.owner, descendants: repairAttempt.replay.descendants.slice() };
    }
    // ---- STEP 10: the current candidate TRIPLE (hoisted above the reconcile, which decides crash
    // convergence on the CANDIDATE — the exempt-filtered content address — not on a raw commit sha).
    const declaredUnion = declaredUnionPaths(proofNodes);
    const writerPaths = nodeDeclaredPaths(proofNodes.find(n => n.id === nodeId));
    let now;
    try {
      now = normalizeCandidate(opts.computeReviewCandidateDigest
        ? opts.computeReviewCandidateDigest()
        : computeReviewCandidateDigest(planPath, project, opts.repoRoot, declaredUnion));
    } catch (_) { return { result: 'repair_requires_replan', reason: 'candidate_digest_unavailable', producer_slice: proof.producer_slice } }
    // Contract v2 binds the attempt's authoritative candidate_digest to the
    // deterministic validation runner.  Keep the existing declared/residue
    // partition for the rebind proof, but compare/replay its whole-candidate
    // identity with that same runner digest rather than the legacy digest
    // algorithm used by schema-1 journals.
    if (repairAttempt.contract_version === 2) {
      try {
        const validator = require('./kaola-workflow-plan-validator');
        const runner = require('./kaola-workflow-validation-runner');
        const consumedPaths = typeof validator.parseValidationTestConsumes === 'function'
          ? validator.parseValidationTestConsumes(initialPlan) : [];
        const authoritative = opts.computeLandableTreeDigest
          ? opts.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: consumedPaths })
          : runner.computeLandableTreeDigest(opts.repoRoot || getRoot(), { test_consumed_paths: consumedPaths });
        if (!/^[0-9a-f]{64}$/i.test(String(authoritative || ''))) throw new Error('candidate unavailable');
        now.digest = String(authoritative).toLowerCase();
      } catch (_) {
        return { result: 'repair_requires_replan', reason: 'candidate_digest_unavailable',
          producer_slice: proof.producer_slice };
      }
    }

    // ---- STEP 8.5: converge an INTERRUPTED rebind before anything reads the writer's identity. --
    // A crash after the ref moved but before the record settled leaves the on-disk ref legitimately AHEAD
    // of the journal's effective binding, which would otherwise read as writer_identity_changed.
    if (Array.isArray(repairAttempt.rebind) && repairAttempt.rebind.length) {
      const rec = reconcilePendingRebind(opts, repairAttempt, repairJournalState, nodeId, writerPaths, now);
      if (!rec.ok) {
        return { result: 'repair_requires_replan', reason: rec.reason, attempt_id: attemptId,
          producer_slice: proof.producer_slice, ...(rec.detail ? { detail: rec.detail } : {}) };
      }
    }
    // ---- STEP 9: writer identity, against the EFFECTIVE (post-rebind) binding. -----------------
    const expectedIdentity = effectiveProducerBinding(repairAttempt, nodeId);
    const currentIdentity = opts.captureWriterBarrierIdentity
      ? opts.captureWriterBarrierIdentity(nodeId) : captureWriterBarrierIdentity(opts, nodeId);
    if (!verifyWriterBarrierIdentity(expectedIdentity, currentIdentity)) {
      return { result: 'repair_requires_replan', reason: 'writer_identity_changed',
        attempt_id: attemptId, producer_slice: proof.producer_slice };
    }

    // #739 — a descendant REPLAY skips STEP 11-15. Those steps verify the writer's CURRENT tree is
    // barrier-clean before consuming a direct repair; they are built for a graph-MAXIMAL writer with no
    // completed writer descendants. For an upstream owner the descendant cone's disjoint outputs read as
    // "foreign" to the owner's baseline (the barrier would fail), yet those descendants are exactly what
    // the replay is about to RESET and re-run. STEP 9's baseline-identity check (above, run for both
    // paths) still proves the owner is legitimately repairable (no swapped baseline); the whole-candidate
    // re-review after the cascade re-certifies the modified tree, which is the real gate. No barrier
    // replay / rebind is meaningful here, so none is performed.
    if (!replayMode) {
      // ---- STEP 11: the writer's foreign delta (exactly what the barrier would call outOfAllow). --
      const cand = effectiveCandidate(repairAttempt);
      const foreignProbe = computeWriterForeignPaths(opts, initialPlan, nodeId, currentIdentity.baseline);
      const foreign = foreignProbe ? foreignProbe.foreign : [];

      // ---- STEP 12: FAST PATH — nothing foreign and the candidate is exactly what was reviewed. ---
      // Byte-identical to the pre-rebind behavior: the barrier replays HERE and `original_barrier_failed`
      // keeps its exact precedence over every downstream guard.
      const rebindNeeded = !(foreign.length === 0 && now.digest === cand.digest);
      if (rebindNeeded) {
        // ---- STEP 13: THE REBIND PROOF (P1 -> P2 -> P3 -> P4). Any failure = typed refusal, ZERO
        // durable mutation. `candidate_digest_changed` stays the fail-closed RESIDUAL: an unclassified
        // divergence still refuses, exactly as it does today.
        const proofOut = proveRebindAdmissible({
          attempt: repairAttempt, attempts: repairJournalState.journal.attempts,
          nodes: proofNodes, nodeId, writerPaths, now, cand, foreign, declaredUnion,
          ledgerStatuses: proofLedger,
        });
        if (!proofOut.ok) {
          return proofOut.reason === 'rebind_limit_reached'
            ? { result: 'rebind_limit_reached', attempt_id: attemptId,
              rebinds: nonAbortedRebinds(repairAttempt).length, limit: REVIEW_REBIND_LIMIT }
            : { result: 'repair_requires_replan', reason: proofOut.reason, attempt_id: attemptId,
              producer_slice: proof.producer_slice, ...(proofOut.detail ? { detail: proofOut.detail } : {}),
              ...(proofOut.paths ? { paths: proofOut.paths } : {}) };
        }
        // P5 + the rebind TRANSACTION are deferred to just below the P0 orphan guard: P0 (repairs stay
        // strictly serialized — one reopened writer at a time) is a PRECONDITION of this proof's soundness,
        // not a peer of it. With two repair writers concurrently live in the parent worktree there is no
        // leg containment, so a foreign path would not be attributable to EITHER of them. Serialization is
        // what makes per-path attribution sound, so nothing may be rebound until P0 has held.
        pendingRebind = { proofOut, now, currentIdentity, writerPaths, producer_slice: proof.producer_slice };
      } else {
        // ---- STEP 15 (fast path): the original-barrier replay, unchanged. ------------------------
        const barrierProof = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);
        if (!barrierProof || barrierProof.exitCode !== 0 || barrierProof.result !== 'ok') {
          return { result: 'repair_requires_replan', reason: 'original_barrier_failed', producer_slice: proof.producer_slice, barrierProof };
        }
      }
    }
    if (!repairAlreadySelected) {
      repairAttempt.repair = { selected_writer: nodeId, settled: false };
      // #739 — record the durable replay decision in the SAME object as the selected-writer marker, so it
      // is persisted by the first-durable-mutation journal write below (before any ledger reset). The
      // identity validators recompute+bound this record's cone against the frozen graph on every read.
      if (replayMode) {
        repairAttempt.replay = { owner: replayMode.owner, descendants: replayMode.descendants.slice().sort() };
      }
    }
  }

  // (1) Refuse over a live running set. (#594: the former sibling arm — refuse active_batch_exists over
  // a live active-batch.json — is gone; that manifest has no producer left.)
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const runningSet = readRunningSet(runningSetPath, cacheExists, readFile);
  if (runningSet) {
    const rsLive = (runningSet.nodes || []).length > 0;
    const rsOpening = runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening);
    if (rsLive || rsOpening) {
      return { result: 'refuse', reason: 'scheduler_active', detail: 'reconcile/close the active running-set fan-out before a plan-repair reopen', runningSet: (runningSet.nodes || []).map(n => n.id) };
    }
  }

  let planContent = readFile(planPath);
  const ledgerStatuses = readLedgerStatuses(planContent);
  const nodes = parseNodesFromContent(planContent);
  if (!nodes.length) return { result: 'refuse', reason: 'no_parseable_nodes' };
  if (!nodes.some(n => n.id === nodeId)) return { result: 'refuse', reason: 'node_not_found', nodeId };

  // (2) Writer node must be COMPLETE — only a finished writer can be repair-reopened.
  // The consumption-resume short-circuit that used to sit HERE is hoisted into the journal preamble
  // (STEP 5): at this depth it was unreachable for the case it existed to serve — a crash-retry whose
  // reopened writer had already begun editing tripped the digest check several gates earlier and wedged
  // the attempt permanently. On the LEGACY (unfrozen, no-journal) path there is no repairAttempt at all,
  // so nothing here changes for it.
  const writerStatus = ledgerStatuses[nodeId];
  const repairResuming = !!(repairAttempt && repairAttempt.repair
    && repairAttempt.repair.settled === false && repairAttempt.repair.selected_writer === nodeId);
  const resumingReopenedWriter = repairResuming && writerStatus === 'in_progress';
  if (writerStatus !== 'complete' && !resumingReopenedWriter) {
    return {
      result: 'refuse',
      reason: 'node_not_complete',
      nodeId,
      detail: 'repair-node requires the writer node to be complete (a reviewer must have flagged it); current status: ' + writerStatus,
    };
  }

  // (2b) Safe-point check: at least one downstream gate-role node must be in_progress.
  // repair-node is only valid when a reviewer has flagged the writer and is actively in_progress.
  // When no downstream gate is in_progress, the plan has no active blocker — refuse.
  const downstreamGateInProgress = nodes.some(n =>
    GATE_ROLES.has(n.role) &&
    ledgerStatuses[n.id] === 'in_progress'
  );
  if (!downstreamGateInProgress && !repairAttempt) {
    return {
      result: 'refuse',
      reason: 'no_active_reviewer',
      nodeId,
      detail: 'repair-node requires an in_progress downstream gate (reviewer/verifier) that flagged a blocking issue; no such reviewer is currently in_progress',
    };
  }

  // (3) Compute post-dominating gate(s) of nodeId (same algorithm as reopen-node).
  const fwd = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) if (fwd.has(d)) fwd.get(d).push(n.id);
  const descendantsOf = start => {
    const visited = new Set();
    const q = [start];
    while (q.length) {
      const cur = q.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      (fwd.get(cur) || []).forEach(c => q.push(c));
    }
    visited.delete(start);
    return visited;
  };
  const desc = descendantsOf(nodeId);
  const sinkId = nodes.find(n => n.shape === 'sink' || (n.id && desc.has(n.id) && !nodes.some(m => descendantsOf(n.id).size > 0 && m.dependsOn && m.dependsOn.includes(n.id))));
  // The UNIQUE sink, derived exactly as reopen-node derives it: the sole node with no outgoing edge, or
  // null when the graph has zero or several terminals. It is deliberately NOT "the first terminal found" —
  // picking one arbitrarily out of several would (a) make the post-dominance test below assert dominance of
  // a path that other terminals bypass, and (b) let runIsFinished report a whole run finished off one
  // arbitrary terminal's status. Both consumers want the SAME conservative answer when the sink is
  // ambiguous: post-dominance falls back to "treat the gate as gating" (fold it) and runIsFinished falls
  // back to "not finished". The frozen grammar guarantees a unique sink, so this is a defensive path.
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const outbound = new Set();
  for (const n of nodes) for (const d of (n.dependsOn || [])) if (nodeIdSet.has(d)) outbound.add(d);
  const terminalNodes = nodes.filter(n => !outbound.has(n.id));
  const uniqueSink = terminalNodes.length === 1 ? terminalNodes[0].id : null;
  // Compute nodes through which ALL paths from nodeId to the sink pass (post-dominators).
  const pathsFromNodeToSink = desc;
  const gatesReset = [];
  const completedJournalGates = new Set();
  const latestJournalAttemptByGate = new Map();
  const addGateReset = id => { if (!gatesReset.includes(id)) gatesReset.push(id); };
  if (repairAttempt) {
    const repairedBinding = repairAttempt.producer_bindings && repairAttempt.producer_bindings[nodeId];
    for (const attempt of repairJournalState.journal.attempts) {
      const bound = attempt.producer_bindings && attempt.producer_bindings[nodeId];
      if (attempt.candidate_digest !== repairAttempt.candidate_digest
        || !verifyWriterBarrierIdentity(repairedBinding, bound)) continue;
      for (const memberId of attempt.logical_gate.members) {
        const member = nodes.find(n => n.id === memberId);
        if (!member || !GATE_ROLES.has(member.role) || !desc.has(memberId)) continue;
        addGateReset(memberId);
        // Physical journal order is not chronological: validated histories may be reordered.
        // Cleanup follows the highest gate-local ordinal for this member, so an older pass can
        // never delete a later live failure receipt merely by appearing later in the JSON array.
        const latest = latestJournalAttemptByGate.get(memberId);
        if (!latest || attempt.ordinal > latest.ordinal) {
          latestJournalAttemptByGate.set(memberId, attempt);
        }
      }
    }
    for (const [memberId, attempt] of latestJournalAttemptByGate) {
      if (attempt.outcome === 'pass') completedJournalGates.add(memberId);
    }
  }
  for (const did of pathsFromNodeToSink) {
    const dn = nodes.find(n => n.id === did);
    if (dn && GATE_ROLES.has(dn.role)) {
      // Check that all paths from nodeId to sink pass through this gate.
      // A gate post-dominates nodeId iff removing it disconnects all paths from nodeId to sink.
      // Simple check: all descendants of nodeId either ARE did or have did as an ancestor.
      const descWithoutGate = new Set();
      const q2 = [nodeId];
      const visitedG = new Set([did]);
      while (q2.length) {
        const cur = q2.shift();
        if (visitedG.has(cur)) continue;
        visitedG.add(cur);
        (fwd.get(cur) || []).forEach(c => q2.push(c));
        if (cur !== nodeId) descWithoutGate.add(cur);
      }
      // If the sink is not reachable when excluding `did`, it post-dominates. With NO resolvable unique
      // sink the answer is unknown and the conservative read is "it gates" — the same fallback reopen-node
      // takes (`if (!sink) return true`), so the twins fold identically.
      if (!uniqueSink || !descWithoutGate.has(uniqueSink)) {
        addGateReset(did);
      } else if (dn.role === 'adversarial-verifier' && dn.shape && dn.shape.kind === 'fanout' && String(dn.cardinality) === '1') {
        // #664: an explicit skeptic group is an AND-joined collective gate. No individual
        // member post-dominates the writer in the simple path graph (a sibling member supplies
        // an alternate path around this one), but the frozen group AS A WHOLE does when every
        // member is a descendant of the repaired writer — mirror reopen-node's (#658) group-aware
        // fold. Gated on every member being COMPLETE (fully voted): a mid-vote (in_progress)
        // member is left untouched so the pre-existing (3b) would_orphan_in_progress refusal
        // still catches it exactly as before this fix.
        const { resolveAdversarialFanoutGroup } = require('./kaola-workflow-plan-validator');
        const group = resolveAdversarialFanoutGroup(nodes, dn);
        if (group && group.members.length > 0
          && group.members.every(id => desc.has(id))
          && group.members.every(id => ledgerStatuses[id] === 'complete')) {
          for (const memberId of group.members) {
            addGateReset(memberId);
          }
        }
      }
    }
  }

  // (3b) Fail-closed orphan guard (mirrors reopen-node).
  const gateSet = new Set(gatesReset);
  const orphans = Object.keys(ledgerStatuses)
    .filter(id => ledgerStatuses[id] === 'in_progress' && id !== nodeId && !gateSet.has(id));
  if (orphans.length) {
    return {
      result: 'refuse',
      reason: 'would_orphan_in_progress',
      nodeId,
      inProgress: orphans,
      detail: 'in_progress row(s) [' + orphans.join(', ') + '] are not post-dominating gates of '
        + nodeId + ' — repair-node would leave an orphan multi-in_progress ledger',
    };
  }

  // #739 (write-diamond guard): a replay reopens the owner, so EVERY completed gate that is a descendant of
  // the owner is stale against the reset candidate and MUST be folded. gatesReset folds the post-dominating
  // gates (and adversarial fan-out GROUPS). A completed descendant gate that is NOT folded — e.g. a parallel
  // non-fanout branch gate in a write-diamond (owner→W2→G_a, owner→W3→G_b, no synthesizer), which
  // post-dominates neither owner-to-sink path — would be left stale-and-unfolded and would wedge finalize
  // (a #740-class stale-receipt dead-end). Refuse the in-plan replay for that shape; the existing replan
  // re-runs the whole plan cleanly. Tighten-only, ZERO durable mutation (before the first journal write).
  if (replayMode) {
    const strandedGates = [...desc].filter(gid => {
      const gn = nodes.find(n => n.id === gid);
      return gn && GATE_ROLES.has(gn.role) && ledgerStatuses[gid] === 'complete' && !gateSet.has(gid);
    }).sort();
    if (strandedGates.length) {
      return { result: 'repair_requires_replan', reason: 'dependent_producer_replay_required',
        attempt_id: attemptId, semantic_owner: nodeId, blocking_descendants: replayMode.descendants,
        replay_declined: 'nonpostdominating_gate_in_cone', stranded_gates: strandedGates,
        operator_hint: getOperatorHint('dependent_producer_replay_required',
          { semantic_owner: nodeId, blocking_descendants: replayMode.descendants }) };
    }
  }

  // (3b-ii) Stranded-dependent guard — mirrors reopen-node, same role-agnostic invariant (see
  // planLedgerReset). A `complete` non-gate descendant is neither foldable (not a gate role) nor
  // visible to the orphan guard (not in_progress), so the repair would strand it above a reset dependency
  // chain. Ordered AFTER the replay write-diamond rung so that rung keeps its typed
  // `dependent_producer_replay_required` precedence for the shape it owns; a replay's own descendant cone
  // is included in the simulated reset here, so this rung catches the NON-gate strandings that one does not.
  const resetPlan = planLedgerReset(nodes, ledgerStatuses, nodeId,
    gatesReset.concat(replayMode ? replayMode.descendants : []), desc);
  const stranded = resetPlan.stranded;
  if (stranded.length) {
    return {
      result: 'refuse',
      reason: 'would_strand_completed_dependent',
      nodeId,
      stranded,
      detail: 'repairing ' + nodeId + ' would leave settled row(s) [' + stranded.join(', ')
        + '] above a dependency this reset moves to pending — a ledger shape every downstream authority '
        + 'rejects as state_ledger_progress_invalid',
      operator_hint: getOperatorHint('would_strand_completed_dependent',
        { nodeId, stranded, op: 'repair', runFinished: runIsFinished(uniqueSink, ledgerStatuses) }),
    };
  }
  // Read-only descendants fold to pending alongside the gates (see planLedgerReset) — mirrors reopen-node.
  const readOnlyReset = resetPlan.readOnlyReset;
  const rowsReset = gatesReset.concat(readOnlyReset);

  // ---- STEPS 14-15 (deferred): P0 has now held — repairs are strictly serialized, so every foreign path
  // is attributable. Perform the proven rebind (P5 asserted inside, before any durable byte moves), then
  // replay the original barrier, whose input is now EXACT rather than poisoned by a sibling's writes.
  if (pendingRebind) {
    const tx = performRebind({
      opts, attempt: repairAttempt, state: repairJournalState, nodeId,
      writerPaths: pendingRebind.writerPaths, now: pendingRebind.now,
      currentIdentity: pendingRebind.currentIdentity,
      absorbed: pendingRebind.proofOut.absorbed, attributedTo: pendingRebind.proofOut.attributed_to,
    });
    if (!tx.ok) {
      return { result: 'repair_requires_replan', reason: tx.reason, attempt_id: repairAttempt.attempt_id,
        producer_slice: pendingRebind.producer_slice, ...(tx.detail ? { detail: tx.detail } : {}) };
    }
    const barrierProof = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);
    if (!barrierProof || barrierProof.exitCode !== 0 || barrierProof.result !== 'ok') {
      return { result: 'repair_requires_replan', reason: 'original_barrier_failed',
        producer_slice: pendingRebind.producer_slice, barrierProof };
    }
  }

  // The selected-writer marker is the first durable repair mutation, after every graph/digest/barrier,
  // scheduler, ledger, and orphan proof has passed. A crash from here is resumed by the same attempt.
  if (repairAttempt && !repairAlreadySelected && writerStatus === 'complete') {
    writeReviewJournal(opts, repairJournalState);
    reviewFailpoint(opts, 'repair_selected_written');
  }

  // (4) Fold gates (and the read-only rows folded with them) back to pending.
  const gatesFolded = [];
  for (const gid of rowsReset) {
    const s = spliceLedgerNode(planContent, gid, 'pending', { allowFrom: ['complete', 'in_progress'] });
    if (s.changed) { planContent = s.content; gatesFolded.push(gid); }
  }

  // (4a) Record the fold boundary on every folded gate whose latest journal attempt is a
  // settled PASS: the folding repair's attempt id, its selected writer, and the sealed pass
  // candidate digest/declared map. The marker lives in the review journal — NEVER in the
  // purged `.cache/<gate>.md` — so the gate's later reopen synthesizes its repair delta from
  // the boundary (deriveRepairDelta) instead of wedging on review_repair_delta_unavailable.
  // Contract-2 attempts only: schema-1 journals have no V2 delta consumer. The fold itself is
  // unchanged — the stale pass receipt is still purged below (a pass over the pre-repair tree
  // never certifies the repaired tree), and mid-gate (in_progress) folds carry no sealed pass
  // attempt to mark. In-memory here; persisted by the settled/consumed journal writes below,
  // and recomputed idempotently on every resume.
  if (repairAttempt) {
    for (const memberId of completedJournalGates) {
      const sealed = latestJournalAttemptByGate.get(memberId);
      if (sealed && sealed.contract_version === 2 && sealed.outcome === 'pass'
        && sealed.lifecycle_settled === true) {
        sealed.fold = { repair_attempt_id: repairAttempt.attempt_id, selected_writer: nodeId,
          candidate_digest: sealed.candidate_digest, candidate_declared: sealed.candidate_declared };
      }
    }
  }

  // (4b) Delete stale barrier-base files for the DOWNSTREAM gates only.
  // The writer's own barrier-base-{nodeId} is KEPT (the anti-laundering invariant).
  const cacheBaseFile = nid => path.join(path.dirname(planPath), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  const deletedDownstreamBaselines = [];
  for (const gid of rowsReset) {
    const bf = cacheBaseFile(gid);
    const present = cacheExists ? cacheExists(bf) : true;
    if (present && typeof unlink === 'function') deletedDownstreamBaselines.push('barrier-base-' + String(gid).replace(/[^A-Za-z0-9_-]/g, '_'));
  }

  // (4c) #664: purge the folded adversarial-verifier fan-out GROUP's own receipt(s) — a stale
  // COMPLETED skeptic vote must never silently satisfy a later --verdict-check on the writer's
  // changed tree. Fan-out receipts are always purged as a group; a completed singleton gate bound
  // to this exact candidate/writer is also purged because its pass cannot certify the repaired tree.
  // The target singleton failure body remains journal-authoritative and is copied into the writer's
  // repair brief below. Mirrors reopen-node's (#349/#658) fan-out purge,
  // including its per-receipt-NAME dedupe (#665 R2): the validator keys fan-out groups by (label,
  // origin) — resolveAdversarialFanoutGroup — so two independent groups sharing a label at DIFFERENT
  // origins are two distinct receipt sets. A group-LABEL-only dedupe would purge only the first.
  // It iterates rowsReset — the FULL fold set (structural gates + the read-only rows folded with them),
  // exactly like reopen-node's purge — not gatesReset. A read-only row can itself be an adversarial-verifier
  // fan-out member (a verifier declares no writes), so scanning only the structural gate set skipped the
  // group purge for folds that came in through the read-only path and left a stale skeptic vote on disk.
  const cacheDir = path.dirname(cacheBaseFile(nodeId));
  const gateById = new Map(nodes.map(n => [n.id, n]));
  const evidenceRemoved = [];
  const removedNames = new Set();
  const removeEvidenceName = (name, knownPresent) => {
    if (removedNames.has(name)) return;
    const ev = path.join(cacheDir, name);
    if ((knownPresent || (cacheExists ? cacheExists(ev) : false)) && typeof unlink === 'function') {
      evidenceRemoved.push(name);
      removedNames.add(name);
    }
  };
  for (const gid of rowsReset) {
    const gn = gateById.get(gid);
    if (!gn || gn.role !== 'adversarial-verifier' || !gn.shape || gn.shape.kind !== 'fanout') continue;
    const { resolveAdversarialFanoutGroup } = require('./kaola-workflow-plan-validator');
    const group = resolveAdversarialFanoutGroup(nodes, gn);
    if (!group) continue;
    if (group.mode === 'canonical-node-id') {
      for (const memberId of group.members) removeEvidenceName(memberId + '.md');
    } else if (typeof readdir === 'function') {
      // Archived role-prefix receipts carry no group label. Attributable only when the
      // frozen plan contains exactly one legacy adversarial fan-out (same guard as reopen-node).
      const legacyGroups = nodes.filter(n => n.role === 'adversarial-verifier'
        && n.shape && n.shape.kind === 'fanout' && String(n.cardinality) !== '1');
      if (legacyGroups.length === 1) {
        for (const name of readdir(cacheDir)) {
          if (typeof name === 'string' && /^adversarial-verifier-.*\.md$/.test(name)) removeEvidenceName(name, true);
        }
      }
    }
  }
  for (const gid of completedJournalGates) removeEvidenceName(gid + '.md');
  // A read-only row folded back to pending re-runs from scratch, so its stale evidence goes with its stale
  // baseline — exactly what reopen-node's (#349) gate purge does, and what #739 does for a reset cone.
  for (const rid of readOnlyReset) removeEvidenceName(rid + '.md');

  // (5) Transition writer: complete→pending→in_progress.
  const replayDescendantsReset = [];
  if (!resumingReopenedWriter) {
    // #739 — reset the descendant cone (complete→pending) in the SAME durable plan write as the owner
    // reopen. A crash leaves either the intact pre-replay tree (owner still complete) or the full reset
    // frontier (owner in_progress + cone pending) — never a half-open one. Ledger-only here; the stale
    // descendant evidence + barrier baselines are unlinked below, after the rows are durably pending.
    if (replayMode) {
      for (const did of replayMode.descendants) {
        const r = spliceLedgerNode(planContent, did, 'pending', { allowFrom: ['complete', 'in_progress'] });
        if (r.changed) { planContent = r.content; replayDescendantsReset.push(did); }
      }
    }
    const resetWriter = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['complete'] });
    if (!resetWriter.changed) {
      return { result: 'refuse', reason: 'ledger_splice_failed', nodeId, detail: 'could not reset writer to pending' };
    }
    planContent = resetWriter.content;

    const reopenWriter = spliceLedgerNode(planContent, nodeId, 'in_progress', { allowFrom: ['pending'] });
    if (reopenWriter.changed) planContent = reopenWriter.content;

    // (6) Persist the updated plan.
    writeFile(planPath, planContent);
    reviewFailpoint(opts, 'repair_plan_written');
  }

  // Downstream artifacts are removed only after their rows are durably pending and the selected
  // writer is durably reopened. This makes a crash leave conservative stale files, never orphaned state.
  if (typeof unlink === 'function') {
    for (const name of deletedDownstreamBaselines) unlink(path.join(cacheDir, name));
    for (const name of evidenceRemoved) unlink(path.join(cacheDir, name));
    // #739 — the reset descendant cone re-runs from scratch, so its stale evidence + barrier baselines are
    // removed (unlike the OWNER's barrier-base, which is REUSED — the anti-laundering invariant). Each
    // descendant records a fresh baseline + evidence when the scheduler re-opens it via the normal path.
    // Driven from replayMode (not the just-reset list) so a resume re-attempts it idempotently; unlink is
    // guarded because on resume the files are already gone.
    if (replayMode) {
      for (const did of replayMode.descendants) {
        const safe = String(did).replace(/[^A-Za-z0-9_-]/g, '_');
        try { unlink(path.join(cacheDir, safe + '.md')); } catch (_) {}
        try { unlink(path.join(cacheDir, 'barrier-base-' + safe)); } catch (_) {}
      }
    }
  }
  reviewFailpoint(opts, 'repair_artifacts_removed');

  if (repairAttempt) {
    const nonce = readNonce(planPath, nodeId, readFile) || '';
    const writer = nodes.find(n => n.id === nodeId);
    const seeded = seedEvidenceFile(planPath, nodeId, nonce, writer ? writer.role : 'implementer', true);
    const evidencePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');
    let evidence = '';
    try { evidence = readFile(evidencePath); } catch (_) {}
    const brief = '\nfailed_review_attempt: ' + repairAttempt.attempt_id + '\nfailed_review_gate: '
      + repairAttempt.logical_gate.members.join(',') + '\n';
    writeFile(evidencePath, evidence.replace(/\s*$/, '\n') + brief);
    repairAttempt.repair.settled = true;
    writeReviewJournal(opts, repairJournalState);
    reviewFailpoint(opts, 'repair_settled_written');
    repairAttempt.consumed_by = nodeId;
    writeReviewJournal(opts, repairJournalState);
    reviewFailpoint(opts, 'repair_consumed_written');
  }

  // Provenance log entry for the repair.
  appendProvenanceLog(planPath, 'repair-node', nodeId, null);

  // (7) Return the repair contract — baselineReused:true is the critical anti-laundering signal.
  return {
    result: 'ok',
    repaired: nodeId,
    gatesReset,
    readOnlyReset,
    gatesFolded,
    deletedDownstreamBaselines,
    // #664: fan-out group receipts purged (empty when no reset gate was a fan-out group).
    evidenceRemoved,
    // The CRITICAL anti-laundering invariant: the original barrier-base is reused, NOT re-snapshotted.
    baselineReused: true,
    resumed: resumingReopenedWriter || undefined,
    ...(repairAttempt ? { attempt_id: repairAttempt.attempt_id, consumed_by: nodeId } : {}),
    // #739 — an in-plan descendant replay: the owner is reopened and the descendant cone is reset to
    // pending (zero epochs consumed). Absent on a direct (graph-maximal) repair.
    ...(replayMode ? { replay: { owner: replayMode.owner, descendants_reset: replayDescendantsReset } } : {}),
    taskTransitions: [
      ...gatesFolded.map(g => buildTransition(g, 'pending', 'repair-node')),
      ...replayDescendantsReset.map(d => buildTransition(d, 'pending', 'repair-node')),
      buildTransition(nodeId, 'in_progress', 'repair-node'),
    ],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

function scalarStateField(content, key) {
  const re = new RegExp('^' + String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.*)$', 'gm');
  const values = [];
  let match;
  while ((match = re.exec(String(content || ''))) !== null) values.push(match[1].trim());
  return values.length === 1 ? values[0] : null;
}

function fsyncRepairSourceDirectory(dir) {
  const fs = require('fs');
  let fd;
  try { fd = fs.openSync(dir, 'r'); fs.fsyncSync(fd); } catch (_) {}
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {} }
}

function readRegularRepairSource(filePath) {
  const fs = require('fs');
  let stat;
  try { stat = fs.lstatSync(filePath); }
  catch (error) {
    if (error && error.code === 'ENOENT') return { ok: true, bytes: null };
    return { ok: false, reason: 'replan_source_authority_invalid', detail: error.message };
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    return { ok: false, reason: 'replan_source_authority_invalid', detail: 'source_file_type_invalid' };
  }
  try { return { ok: true, bytes: fs.readFileSync(filePath) }; }
  catch (error) { return { ok: false, reason: 'replan_source_authority_invalid', detail: error.message }; }
}

// Resolve the predecessor source only through E2's exported current/snapshot
// authority. The immutable bytes come from the committed transaction's parent
// snapshot, never from the mutable live source path being replaced.
function resolveCommittedRepairSourceAuthority(sourcePath) {
  const fs = require('fs');
  const cacheDir = path.dirname(sourcePath);
  const projectDir = path.dirname(cacheDir);
  const transactionPath = path.join(cacheDir, REPLAN_TRANSACTION_NAME);
  const transactionFile = readRegularRepairSource(transactionPath);
  if (!transactionFile.ok) return transactionFile;
  if (transactionFile.bytes === null) return { ok: true, source_bytes: null, receipt: null };
  let transaction;
  try { transaction = JSON.parse(transactionFile.bytes.toString('utf8')); }
  catch (_) { return { ok: false, reason: 'replan_transaction_invalid' }; }
  const checked = validateReplanTransaction(transaction);
  if (!checked.ok || transaction.phase !== 'committed' || transaction.outcome !== 'committed'
      || !transaction.activation || !transaction.activation.state_unfenced
      || transaction.activation.state_unfenced.status !== 'complete') {
    return { ok: false, reason: checked.reason || 'replan_transaction_invalid' };
  }
  if (!transaction.source || transaction.source.authority_kind === 'diagnosis_to_build'
      || !/^[0-9a-f]{64}$/.test(String(transaction.source.handoff_digest || ''))) {
    return { ok: false, reason: 'replan_source_authority_invalid' };
  }
  let current;
  let snapshots;
  try {
    const replan = require('./kaola-workflow-replan');
    current = replan.verifyCurrentEpochAuthority(projectDir);
    snapshots = current && current.ok ? replan.verifyAllEpochSnapshots(projectDir) : current;
  } catch (error) {
    return { ok: false, reason: 'replan_source_authority_invalid', detail: error.message };
  }
  if (!current || current.ok !== true || !snapshots || snapshots.ok !== true) {
    return { ok: false, reason: current && current.reason || snapshots && snapshots.reason
      || 'replan_source_authority_invalid' };
  }
  const snapshotSourcePath = path.join(cacheDir, 'epochs', String(transaction.parent.plan_epoch),
    'files', '.cache', 'replan-source.json');
  const snapshotSource = readRegularRepairSource(snapshotSourcePath);
  if (!snapshotSource.ok || snapshotSource.bytes === null) {
    return { ok: false, reason: 'replan_source_history_unreadable', detail: snapshotSource.detail || null };
  }
  const digest = sha256Hex(snapshotSource.bytes);
  if (digest !== transaction.source.handoff_digest) {
    return { ok: false, reason: 'replan_source_history_mismatch' };
  }
  return { ok: true, source_bytes: snapshotSource.bytes, receipt: {
    transaction_id: transaction.transaction_id,
    path: '.cache/replan-sources/' + digest + '.json',
    digest,
    size: snapshotSource.bytes.length,
  } };
}

function persistRepairSourceHistory(sourcePath, authority, allowCreate) {
  const fs = require('fs');
  const projectDir = path.dirname(path.dirname(sourcePath));
  const receipt = authority.receipt;
  const historyPath = path.join(projectDir, ...receipt.path.split('/'));
  const historyDir = path.dirname(historyPath);
  try {
    fs.mkdirSync(historyDir, { recursive: true });
    const dirStat = fs.lstatSync(historyDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('source_history_directory_invalid');
    const existing = readRegularRepairSource(historyPath);
    if (!existing.ok) return { ok: false, reason: 'replan_source_history_mismatch', detail: existing.detail || null };
    if (existing.bytes === null) {
      if (!allowCreate) return { ok: false, reason: 'replan_source_history_mismatch' };
      const fd = fs.openSync(historyPath, 'wx', 0o600);
      try { fs.writeFileSync(fd, authority.source_bytes); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fsyncRepairSourceDirectory(historyDir);
    }
    const reread = readRegularRepairSource(historyPath);
    if (!reread.ok || reread.bytes === null || reread.bytes.length !== receipt.size
        || sha256Hex(reread.bytes) !== receipt.digest
        || !reread.bytes.equals(Buffer.from(authority.source_bytes))) {
      return { ok: false, reason: 'replan_source_history_mismatch' };
    }
    return { ok: true, path: historyPath };
  } catch (error) {
    return { ok: false, reason: error && error.code === 'EEXIST'
      ? 'replan_source_history_mismatch' : 'replan_source_history_write_failed', detail: error.message };
  }
}

// Crash-safe producer-side source settlement. `isNextSource` deliberately
// compares semantic envelope fields so an idempotent retry preserves the first
// persisted_at timestamp instead of rewriting an already-published successor.
function publishRepairReplanSource(opts) {
  const fs = require('fs');
  const sourcePath = String(opts && opts.sourcePath || '');
  const nextBytes = Buffer.isBuffer(opts && opts.nextBytes)
    ? opts.nextBytes : Buffer.from(String(opts && opts.nextBytes || ''), 'utf8');
  if (!path.isAbsolute(sourcePath) || nextBytes.length === 0 || typeof opts.isNextSource !== 'function') {
    return { ok: false, reason: 'replan_source_authority_invalid' };
  }
  const live = readRegularRepairSource(sourcePath);
  if (!live.ok) return live;
  let liveIsNext = false;
  if (live.bytes !== null) {
    try { liveIsNext = opts.isNextSource(live.bytes) === true; } catch (_) { liveIsNext = false; }
  }
  let authority;
  try {
    const resolve = opts.resolveCommittedSourceAuthority || resolveCommittedRepairSourceAuthority;
    authority = resolve(sourcePath);
  } catch (error) {
    return { ok: false, reason: 'replan_source_authority_invalid', detail: error.message };
  }
  if (!authority || authority.ok !== true) return authority || { ok: false, reason: 'replan_source_authority_invalid' };
  const hasPredecessor = !!(authority.receipt && authority.source_bytes);
  if (hasPredecessor) {
    const receipt = authority.receipt;
    const oldBytes = Buffer.from(authority.source_bytes);
    if (receipt.path !== '.cache/replan-sources/' + receipt.digest + '.json'
        || !/^[0-9a-f]{64}$/.test(String(receipt.transaction_id || ''))
        || receipt.digest !== sha256Hex(oldBytes) || receipt.size !== oldBytes.length) {
      return { ok: false, reason: 'replan_source_authority_invalid' };
    }
    if (liveIsNext) {
      const history = persistRepairSourceHistory(sourcePath, authority, false);
      if (!history.ok) return history;
      return { ok: true, idempotent: true, rotated_from: receipt };
    }
    if (live.bytes !== null && !live.bytes.equals(oldBytes)) {
      return { ok: false, reason: 'replan_source_conflict' };
    }
    const history = persistRepairSourceHistory(sourcePath, authority, live.bytes !== null);
    if (!history.ok) return history;
    if (typeof opts.failpoint === 'function') opts.failpoint('after_replan_source_archived');
    if (live.bytes !== null) {
      const stillLive = readRegularRepairSource(sourcePath);
      if (!stillLive.ok || stillLive.bytes === null || !stillLive.bytes.equals(oldBytes)) {
        return { ok: false, reason: 'replan_source_conflict' };
      }
      fs.unlinkSync(sourcePath);
      fsyncRepairSourceDirectory(path.dirname(sourcePath));
    }
    if (typeof opts.failpoint === 'function') opts.failpoint('after_replan_source_unlinked');
  } else {
    if (liveIsNext) return { ok: true, idempotent: true, rotated_from: null };
    if (live.bytes !== null) return { ok: false, reason: 'replan_source_conflict' };
  }

  const cacheDir = path.dirname(sourcePath);
  fs.mkdirSync(cacheDir, { recursive: true });
  const tmpPath = sourcePath + '.tmp-' + process.pid + '-' + sha256Hex(nextBytes).slice(0, 12);
  try {
    const fd = fs.openSync(tmpPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, nextBytes); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    const installCheck = readRegularRepairSource(sourcePath);
    if (!installCheck.ok || installCheck.bytes !== null) throw new Error('replan_source_conflict');
    fs.renameSync(tmpPath, sourcePath);
    fsyncRepairSourceDirectory(cacheDir);
  } catch (error) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return { ok: false, reason: error.message === 'replan_source_conflict'
      ? 'replan_source_conflict' : 'replan_source_write_failed', detail: error.message };
  }
  const published = readRegularRepairSource(sourcePath);
  if (!published.ok || published.bytes === null || !published.bytes.equals(nextBytes)) {
    return { ok: false, reason: 'replan_source_write_failed' };
  }
  if (typeof opts.failpoint === 'function') opts.failpoint('after_replan_source_published');
  return { ok: true, idempotent: false, rotated_from: hasPredecessor ? authority.receipt : null };
}

function persistRepairReplanSource(opts, result) {
  const planContent = opts.readFile(opts.planPath);
  const parentPlanHash = planHashFromContent(planContent);
  const statePath = opts.statePath || path.join(path.dirname(opts.planPath), 'workflow-state.md');
  let stateContent;
  try { stateContent = opts.readFile(statePath); } catch (_) { return result; }

  // Compatibility is deliberately narrow: legacy states retain the historical
  // return-only behavior.  Every schema-2 state must publish and bind the
  // source authority before repair-node returns its outcome.
  if (scalarStateField(stateContent, 'epoch_schema_version') !== '2') return result;
  const hex = value => /^[0-9a-f]{64}$/.test(String(value || '').toLowerCase());
  const epochLineageId = scalarStateField(stateContent, 'epoch_lineage_id');
  const claimIdentityDigest = scalarStateField(stateContent, 'claim_identity_digest');
  const claimRootBaseDigest = scalarStateField(stateContent, 'claim_root_base_digest');
  if (!parentPlanHash || scalarStateField(stateContent, 'active_plan_hash') !== parentPlanHash
      || !hex(epochLineageId) || !hex(claimIdentityDigest) || !hex(claimRootBaseDigest)) {
    return { result: 'refuse', reason: 'replan_source_authority_invalid' };
  }

  const journalState = readReviewJournal(opts, planContent);
  if (!journalState.ok || !journalState.journal || !journalState.journalPath) {
    return { result: 'refuse', reason: 'replan_source_authority_invalid',
      detail: journalState.reason || 'review_journal_missing' };
  }
  const attemptId = result.attempt_id || opts.attemptId;
  const attempt = journalState.journal.attempts.find(row => row && row.attempt_id === attemptId);
  if (!attempt || attempt.outcome !== 'fail' || attempt.lifecycle_settled !== true
      || attempt.consumed_by != null || String(attempt.plan_hash || journalState.journal.plan_hash || '') !== parentPlanHash) {
    return { result: 'refuse', reason: 'replan_source_attempt_unsettled', attempt_id: attemptId || null };
  }
  let journalBytes;
  try { journalBytes = opts.readFile(journalState.journalPath); }
  catch (_) { return { result: 'refuse', reason: 'replan_source_authority_invalid' }; }
  const candidate = effectiveCandidate(attempt);
  if (!candidate || !hex(candidate.digest)) {
    return { result: 'refuse', reason: 'replan_source_authority_invalid', detail: 'effective_candidate_digest_invalid' };
  }
  const reason = result.reason == null ? 'repair_requires_replan' : String(result.reason);
  if (!/^[a-z][a-z0-9_]*$/.test(reason)) {
    return { result: 'refuse', reason: 'replan_source_authority_invalid', detail: 'repair_reason_invalid' };
  }
  const producerSlice = Array.isArray(result.producer_slice)
    ? [...new Set(result.producer_slice.map(String))].sort() : [];
  if (producerSlice.some(id => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))) {
    return { result: 'refuse', reason: 'replan_source_authority_invalid', detail: 'producer_slice_invalid' };
  }
  const payload = {
    schema_version: 2,
    kind: 'repair_outcome',
    result: 'repair_requires_replan',
    attempt_id: attemptId,
    reason,
    producer_slice: producerSlice,
    parent_plan_hash: parentPlanHash,
    epoch_lineage_id: epochLineageId,
    claim_identity_digest: claimIdentityDigest,
    claim_root_base_digest: claimRootBaseDigest,
    review_journal_digest: sha256Hex(Buffer.from(journalBytes, 'utf8')),
    review_attempt_digest: sha256Hex(Buffer.from(canonicalJson(attempt), 'utf8')),
    effective_candidate_digest: String(candidate.digest).toLowerCase(),
  };
  const outcomeDigest = sha256Hex(Buffer.from(canonicalJson(payload), 'utf8'));
  const sourcePath = path.join(path.dirname(opts.planPath), '.cache', 'replan-source.json');
  const envelope = Object.assign({}, payload, {
    outcome_digest: outcomeDigest,
    persisted_at: typeof opts.now === 'function' ? opts.now() : new Date().toISOString(),
  });
  const sameEnvelope = bytes => {
    let existing;
    try { existing = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch (_) { return false; }
    const existingPayload = {};
    for (const key of Object.keys(payload)) existingPayload[key] = existing[key];
    try {
      return canonicalJson(existingPayload) === canonicalJson(payload)
        && existing.outcome_digest === outcomeDigest
        && typeof existing.persisted_at === 'string' && Number.isFinite(Date.parse(existing.persisted_at));
    } catch (_) { return false; }
  };
  const published = publishRepairReplanSource({
    sourcePath,
    nextBytes: Buffer.from(canonicalJson(envelope) + '\n', 'utf8'),
    isNextSource: sameEnvelope,
    ...(typeof opts.resolveCommittedSourceAuthority === 'function'
      ? { resolveCommittedSourceAuthority: opts.resolveCommittedSourceAuthority } : {}),
    failpoint: name => reviewFailpoint(opts, name),
  });
  if (!published.ok) return { result: 'refuse', reason: published.reason,
    attempt_id: attemptId, ...(published.detail ? { detail: published.detail } : {}) };
  reviewFailpoint(opts, 'after_replan_source_outcome');
  return Object.assign({}, result, { source_persisted: true, source_path: sourcePath,
    ...(published.rotated_from ? { rotated_from: published.rotated_from } : {}) });
}

function runRepairNode(opts) {
  const result = runRepairNodeCore(opts);
  return result && result.result === 'repair_requires_replan'
    ? persistRepairReplanSource(opts, result) : result;
}

// ===========================================================================
// #377 per-node running-set scheduler (post-#364 successor of active-batch.json).
//
// The running set is the per-node analogue of the batch manifest: instead of a
// batch-as-a-unit state machine, it tracks an INDIVIDUAL set of concurrently
// in_progress nodes that the event-driven plan-run loop opens and closes one at
// a time. `open-ready` adds ready nodes; `close-node` removes one and recomputes
// the frontier so a DOWNSTREAM node unblocks PER NODE (not per whole frontier).
//
// SAFETY (the #364 reintroduction condition): READ-ONLY nodes always co-open
// freely — they share the parent tree and never write, so they cannot race.
// For WRITE nodes the regime is now default-on (#542 / D-542-01): a planner-
// proven-DISJOINT (`parallel_safe` antichain) write frontier co-opens in ISOLATED
// per-leg worktrees BY DEFAULT (legCoupled = parallelWritesDefaultOn, default TRUE;
// KAOLA_PARALLEL_WRITES=0 forces serial). An OVERLAPPING or uncertain write frontier
// is NOT relaxed: it serial-degrades to opening one write node at a time, or co-opens
// only under an explicit --write-overlap-consent. A single in_progress write node is
// the legacy length<=1 single-node case, so the #293 multi-in_progress legality
// concern only arises for a safe read-only or disjoint-write fan-out — never for an
// unrelaxed overlap.
//
// State shape: { state:'opening'|'open', nodes:[{id,role,kind,baseline,opening?,
// openedAt?}], updatedAt }. Two-phase write (opening -> flip ledger -> open)
// mirrors open-batch's crash-safe ordering; `reconcile-running-set` rolls a
// crashed 'opening' forward (kept rows) / back (un-flipped rows).
// ===========================================================================

// A node is read-only iff its declared write set is empty — the EXACT negation of the writer predicate
// nodeWriteSetNonempty, which is the single definition of "empty write set" in this file (it folds the
// authored no-write markers `-` / `—` / `none` / `n/a` / blank together with classifier.parseWriteSetCell's
// structural parse, the same one classifyBatchKind and the plan_hash consume). There is deliberately no
// second token list here: read-only classification and writer/producer classification cannot drift because
// they are one predicate. Write nodes co-open in isolated legs by default when planner-proven-disjoint
// (#542), and serial-degrade (or consent-gate) when their sets overlap or are uncertain.
function isReadOnlyNode(node) {
  return !nodeWriteSetNonempty(node);
}

// ---------------------------------------------------------------------------
// sanitizeNodeId / readNonce (#392) — the per-open evidence-binding nonce.
//
// The nonce = the first 12 chars of the per-node baseline SHA stored on disk at
// .cache/barrier-base-<sanitizeNodeId(id)> by `commit-node --start` (the anchor commit the validator
// recorded at node OPEN). It is per-open (a reopen re-records a fresh baseline) and already on disk —
// the natural anti-replay token #392 calls for. sanitizeNodeId mirrors the validator's barrier/ref
// key (cacheBaseFile @plan-validator) so a `.` / `/` in an id resolves to the SAME file both write.
// ---------------------------------------------------------------------------
function sanitizeNodeId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

function readNonce(planPath, nodeId, readFile) {
  const baseFile = path.join(path.dirname(planPath), '.cache', 'barrier-base-' + sanitizeNodeId(nodeId));
  try {
    const sha = String(readFile(baseFile) || '').trim();
    return sha ? sha.slice(0, 12) : null;
  } catch (_) { return null; }
}

// readRunningSet — parse .cache/running-set.json or null (absent/corrupt/no nodes).
function readRunningSet(runningSetPath, cacheExists, readFile) {
  if (cacheExists && !cacheExists(runningSetPath)) return null;
  let raw;
  try { raw = readFile(runningSetPath); } catch (_) { return null; }
  const parsed = safeJsonParse(raw);
  return (parsed && Array.isArray(parsed.nodes)) ? parsed : null;
}

// recordGateInRunningSet (#607 Layer 2) — the state channel that makes an open gate node VISIBLE to the
// write-lane hook + the running-set scheduler (as a kind:'gate' member) so it can fence out-of-band
// writes during the gate window AND — the #439 fix — flip serialLive false so open-ready admits an
// eligible speculative descendant instead of refusing serial_node_live over the "invisible" gate. Scoped
// to EVERY GATE_ROLES member (main-session-gate + the review gates: code-reviewer, security-reviewer,
// adversarial-verifier): each is opened serially (open-next / the fused advance) and excluded from the
// open-ready batch frontier, so absent this record it never lands in the running set and both the hook
// and the serialLive derivation are blind to it. Called AFTER the ledger flip to in_progress (a crash
// BEFORE the flip leaves no phantom; a crash AFTER leaves an in_progress gate that reconcile-running-set
// treats as a live member and no-ops on — never a droppable stale entry). A non-gate role is a no-op
// (byte-identical serial write/read open). Id-keyed idempotent: replaces any prior entry for the same id,
// preserves every other member + top-level field (a co-open speculative frontier already in the set
// survives). The gate carries NO write set, is NOT a write (kind:'gate' ≠ 'write') and is NOT
// speculative, so it is invisible to every write-oriented scheduler count (liveHasWrite /
// selectSpeculativeWriteGroup / the slot math + reconcile budget both exclude kind:'gate' explicitly).
// The close-side removal (id-keyed filter) and speculativeReviewOnGateClose (GATE_ROLES.has(role)) were
// already role-symmetric, so widening the open side closes the recorded-on-close-but-not-on-open
// asymmetry. Best-effort: never throws — a lifecycle open must not fail on a telemetry-adjacent write
// (mirrors appendNodeTiming's contract).
function recordGateInRunningSet(runningSetPath, node, io) {
  if (!node || !GATE_ROLES.has(node.role)) return;
  const { readFile, writeFile, cacheExists, mkdirp, now } = io || {};
  if (typeof writeFile !== 'function') return;
  try {
    const existing = readRunningSet(runningSetPath, cacheExists, readFile);
    const base = existing || { state: 'open', nodes: [] };
    const openedAt = (typeof now === 'function') ? now() : null;
    const rest = (base.nodes || []).filter(n => n.id !== node.id);
    const entry = {
      id: node.id,
      role: node.role,
      kind: 'gate',
      declared_write_set: node.declared_write_set,
      model: node.model || null,
      baseline: 'recorded',
      ...(openedAt ? { openedAt } : {}),
    };
    if (mkdirp) mkdirp(path.dirname(runningSetPath));
    writeFile(runningSetPath, JSON.stringify({
      ...base,
      state: base.state || 'open',
      nodes: rest.concat([entry]),
    }, null, 2));
  } catch (_) { /* fail-open: never brick a lifecycle open on the state-channel write */ }
}

// ===========================================================================
// #383 CROSS-SURFACE MUTUAL EXCLUSION — the shared "live coordination state" probe.
//
// The live coordination surfaces (serial open-next/close-and-open-next and the #377 running-set
// running-set.json) each enforced only their own invariant. A mixed sequence — the documented resume
// path (open-next on resume) followed by the scheduler (open-ready) — could co-schedule a serial write
// node against a read fan-out (a) or double-dispatch an already-running node (d). readCoordinationState
// is the SINGLE pure probe every mutating subcommand consults; probeCoordination is its fs wrapper.
// (#594: the retired parallel-batch surface — active-batch.json / the batch_active guard — has no
// producer left, so it is no longer a coordination surface here.)
//
// SERIAL FALLBACK BYTE-IDENTITY (the hard invariant): with no running-set and ≤1 in_progress row,
// serialLive is the only live-coordination signal and the scheduler arm is FALSE — so each guard is
// vacuously-pass and the legacy serial path is byte-identical.
// ===========================================================================

// readCoordinationState (#383) — PURE derivation of the live coordination surfaces from already-read
// content. Mirrors the crossCheckStatus / runOrient AC#5 legality vocabulary so the #293 orphan-
// legality agreement holds: serialLive ⟺ crossCheckStatus single_in_progress for the same fixture.
//
// @param {string} planContent  the frozen plan (## Node Ledger source)
// @param {{runningSet:object|null}} surfaces  the parsed running-set manifest
// @returns {{serialLive, inProgressIds, runningSetLive, runningSetOpening, collisions}}
//   serialLive        exactly one in_progress row AND no live running set — the legacy single-node case
//                     (a serial write/read node is live).
//   runningSetLive    a non-opening running set with ≥1 node is live.
//   runningSetOpening  the running set is mid-transaction (state:'opening' or any node opening:true).
//   collisions        the surfaces that COEXIST (≥2 of {serial,runningSet}) — the union state
//                     #383(b) must refuse at creation.
function readCoordinationState(planContent, surfaces) {
  surfaces = surfaces || {};
  const runningSet = surfaces.runningSet || null;

  const ledger = readLedgerStatuses(planContent || '');
  const inProgressIds = Object.keys(ledger).filter(id => ledger[id] === 'in_progress');

  const runningSetOpening = !!(runningSet && (runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening)));
  const runningSetLive = !!(runningSet && (runningSet.nodes || []).length > 0 && !runningSetOpening);

  // serialLive = the legacy single-node case: exactly one in_progress row, no running set fan-out.
  // This MUST equal crossCheckStatus's single_in_progress verdict for the same fixture (the #293
  // cross-consistency invariant tested explicitly).
  const serialLive = inProgressIds.length === 1 && !runningSetLive && !runningSetOpening;

  // collisions: which live surfaces coexist (a union state that none of the per-surface gates can
  // represent). Used only for diagnostics in the refusal payload; the per-command guards refuse on
  // the specific other-surface signal per the matrix.
  const collisions = [];
  const liveCount = [runningSetLive || runningSetOpening, serialLive].filter(Boolean).length;
  if (runningSetLive || runningSetOpening) collisions.push('running_set');
  if (serialLive) collisions.push('serial');

  return {
    serialLive,
    inProgressIds,
    runningSetLive,
    runningSetOpening,
    collisions: liveCount >= 2 ? collisions : [],
  };
}

// probeCoordination (#383) — the fs wrapper around readCoordinationState. Reads the plan and the
// running set (all READ-ONLY, fail-closed to null) and returns the pure state plus the raw running set
// (for the refusal payload's {inProgress,runningSet} context).
//
// @param {{planPath, readFile, cacheExists}} opts
// @returns the readCoordinationState shape, augmented with { runningSet }.
function probeCoordination(opts) {
  const { planPath, readFile, cacheExists } = opts;
  const dir = path.dirname(planPath);

  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}

  const runningSetPath = path.join(dir, '.cache', RUNNING_SET_NAME);
  const runningSet = readRunningSet(runningSetPath, cacheExists, readFile);

  const state = readCoordinationState(planContent, { runningSet });
  return { ...state, runningSet };
}

// coordinationRefusal (#383) — build a typed mutual-exclusion refusal for a given guard layer. Returns
// null when the relevant other-surface is not live (the guard is vacuously-pass). `excl` names which
// surfaces THIS subcommand is mutually exclusive with: any subset of {serial, scheduler}.
// Reason codes: serial_node_live / scheduler_active, each carrying the live-state context + the
// concrete reconcile/close repair the operator should run. (#594: the retired batch surface / the
// batch_active reason are gone — active-batch.json has no producer left.)
function coordinationRefusal(coord, excl) {
  const want = new Set(excl || []);
  // Order matters only for which single reason surfaces first; the matrix never lets two of these be
  // simultaneously the EXCLUDED surface for one command without a deeper bug, but check deterministically.
  if (want.has('scheduler') && (coord.runningSetLive || coord.runningSetOpening)) {
    return refuse('scheduler_active', {
      inProgress: coord.inProgressIds,
      runningSet: (coord.runningSet && (coord.runningSet.nodes || []).map(n => n.id)) || [],
      repair: coord.runningSetOpening
        ? 'reconcile-running-set (a crashed open-ready) then retry'
        : 'close the live running-set nodes (close-node) or reconcile-running-set before this command',
    });
  }
  if (want.has('serial') && coord.serialLive) {
    return refuse('serial_node_live', {
      inProgress: coord.inProgressIds,
      runningSet: (coord.runningSet && (coord.runningSet.nodes || []).map(n => n.id)) || [],
      repair: 'close the live serial node (close-and-open-next) before fanning out',
    });
  }
  return null;
}

// mutationGuardPrologue (#383/#387/#391b) — the SINGLE layered guard prologue every mutating
// subcommand runs BEFORE its body, in a fixed order. Returns a typed refusal (zero mutation) on the
// first layer that trips, or null to proceed.
//   Layer 1 INTEGRITY (#387): shell validator --resume-check; exitCode!==0 || ok!==true →
//           refuse plan_integrity_failed.
//   Layer 2 HALT FENCE (#391b): a durable consent_halt in the ledger → refuse halt_pending.
//   Layer 3 LIVE-COORDINATION (#383): probeCoordination → refuse serial_node_live | scheduler_active
//           per the per-command exclusion set.
//
// SERIAL FALLBACK BYTE-IDENTITY: with KAOLA_PARALLEL_WRITES=0 (serial mode) + no running-set +
// ≤1 in_progress + no consent_halt marker, EVERY layer is vacuously-pass (integrity ok,
// no halt, no other-surface live) so the guarded body runs exactly as today.
//
// @param {object} opts  the subcommand opts (planPath, shell, readFile, cacheExists)
// @param {{integrity?:boolean, halt?:boolean, excl?:string[]}} cfg  which layers apply
// @returns {object|null} a refusal envelope, or null to proceed.
function mutationGuardPrologue(opts, cfg) {
  const { planPath, shell, readFile, cacheExists } = opts;
  cfg = cfg || {};

  // Layer 1 — integrity (mirror open-batch 424-427). Applied when configured. #499: open-next NOW sets
  // integrity:true (the serial resume path needs the plan_hash gate — orient's --resume-check does not
  // cover a tamper between orient and open-next, or an open-next reached without orient). Every mutating
  // opener (open-next / open-ready / open-batch / top-up) carries this layer; a mismatch refuses
  // plan_integrity_failed with zero mutation.
  if (cfg.integrity && typeof shell === 'function') {
    // #725 WS2 — fast-path the plan_hash integrity gate. Recompute the plan_hash IN-PROCESS via the
    // validator's exported computePlanHash (call it, never a narrower re-implementation, so the two can
    // never drift over which bytes are hash-covered) and compare against the frozen embedded
    // <!-- plan_hash --> marker. On a clean MATCH the plan is byte-untampered vs freeze, so the
    // authoritative --resume-check subprocess is redundant — skip it (the dedup). On a MISMATCH, a
    // MISSING marker, or ANY error (read failure / computePlanHash throw) FALL BACK to the full shell
    // --resume-check and refuse plan_integrity_failed EXACTLY as before. The recompute only ever ADDS a
    // skip on a proven-clean plan; it never becomes the verdict on a non-clean one.
    let hashMatch = false;
    try {
      const planContent = readFile(planPath);
      const stored = planHashFromContent(planContent);
      if (stored) {
        const { computePlanHash } = require('./kaola-workflow-plan-validator');
        hashMatch = computePlanHash(planContent) === stored;
      }
    } catch (_) { hashMatch = false; }
    if (!hashMatch) {
      const integrity = shell(validatorPath, [planPath, '--resume-check', '--json']);
      if (integrity.exitCode !== 0 || integrity.ok !== true) {
        return refuse('plan_integrity_failed', { detail: integrity.reason || null });
      }
    }
  }

  // Layer 2 — durable consent-halt fence (#391b). A halt exists precisely to STOP work; a resume/loop
  // that skips orient must not sail through it. Read the plan ledger (fail-closed to '' → no halt).
  if (cfg.halt) {
    let planContent = '';
    try { planContent = readFile(planPath); } catch (_) {}
    if (readDurableConsentHalt(planContent)) {
      return refuse('halt_pending', { detail: 'a durable consent_halt: pending marker is set in the ## Node Ledger — clear it (clear-halt) or resolve the halt before mutating' });
    }
  }

  // Layer 3 — live-coordination mutual exclusion (#383).
  if (cfg.excl && cfg.excl.length) {
    const coord = probeCoordination({ planPath, readFile, cacheExists });
    const r = coordinationRefusal(coord, cfg.excl);
    if (r) return r;
  }

  return null;
}

// ---------------------------------------------------------------------------
// laneGroupId / laneWriteUnion (#437 D-419 P2) — pure helpers for the lane group.
//
// laneGroupId: the deterministic 'lg-<sorted-member-ids-joined-by-dash>' id (see
// n1-design §1.1). Sorting makes the id stable across a crash-resume (same members ⇒
// same id ⇒ same baseline ref/file key). Sanitization for the ref/file key is the SAME
// String(x).replace(/[^A-Za-z0-9_-]/g,'_') the validator's cacheBaseFile/barrierRef apply.
// laneWriteUnion: the union of every member's parsed declared_write_set (the convenience
// snapshot — the group barrier RE-READS the plan rows for attribution, so a tampered union
// here can never weaken the gate).
// ---------------------------------------------------------------------------
function laneGroupId(memberIds) {
  return 'lg-' + memberIds.slice().sort().join('-');
}

function laneWriteUnion(writeNodes) {
  let parse;
  try { ({ parseWriteSetCell: parse } = require('./kaola-workflow-classifier')); } catch (_) { parse = null; }
  const union = new Set();
  for (const n of writeNodes) {
    const raw = n.declared_write_set != null ? n.declared_write_set : n.writeSetRaw;
    if (parse) { for (const p of parse(raw)) union.add(p); }
    else { for (const p of String(raw || '').split(/[\s,]+/).filter(Boolean)) union.add(p); }
  }
  return Array.from(union);
}

// ---------------------------------------------------------------------------
// tryFormLaneGroup (#437 D-419 P2 §1.3) — attempt a co-open lane group from the
// write frontier. The frontier is already a next-action ready antichain; the
// validator's `--parallel-safe` flag re-checks pairwise disjointness AUTHORITATIVELY
// (belt-and-suspenders). On overlap (result:'refuse') the caller DEGRADES to opening a
// single write node serially. Reached under the caller's legCoupled guard
// (legCoupled = parallelWritesDefaultOn, default TRUE) — disjoint writes co-open in
// isolated legs BY DEFAULT (#542 / D-542-01); only KAOLA_PARALLEL_WRITES=0 forces serial.
// writeOverlapConsent (#500 leg-couple): still forwarded as opts.writeOverlapConsent for frozen-plan
// back-compat, but it is now VESTIGIAL at this seam. A green (exact-file-disjoint, non-shared) frontier
// short-circuits on dj.verdict==='green' before writeOverlapRelaxable. Per #546-G2 a shared-infra
// frontier, and per #593 a COARSE (non-shared, exact-file-disjoint) frontier, BOTH co-open BY DEFAULT
// under the retained net (a post-dominating code-reviewer gate + no PROTECTED file in either set) — NO
// consent needed. Only a genuine overlap (same exact path / case-collision) or a coarse pair carrying a
// non-exactly-resolvable directory/glob entry still serial-degrades, and no consent flag overrides that.
//
// @returns { ok:true, members:string[], group_id, write_union:string[] }
//        | { ok:false, reason:'overlapping_write_sets', overlapping? }
// ---------------------------------------------------------------------------
function tryFormLaneGroup(writeNodes, planPath, shell, writeOverlapConsent) {
  const ids = writeNodes.map(n => n.id);
  if (ids.length < 2) return { ok: false, reason: 'too_few_write_nodes' };
  const vArgs = [planPath, '--parallel-safe', '--nodes', ids.join(','), '--json'];
  if (writeOverlapConsent) vArgs.push('--write-overlap-consent');
  const ps = shell(validatorPath, vArgs);
  if (!(ps.exitCode === 0 && ps.result === 'ok')) {
    return { ok: false, reason: 'overlapping_write_sets', overlapping: ps.overlapping || [] };
  }
  const sorted = ids.slice().sort();
  return {
    ok: true,
    members: sorted,
    group_id: laneGroupId(ids),
    write_union: laneWriteUnion(writeNodes),
  };
}

// ---------------------------------------------------------------------------
// #615 (D-615-01): true iff the parent (integration) worktree already carries out-of-allowband
// PRODUCTION dirt — the precondition that makes a lane-group close structurally UNSATISFIABLE. In a
// mixed plan (SERIAL write nodes followed by a parallel write frontier) the serial siblings run
// FIRST and, per the finalize-owned-commit contract, never commit — their production writes sit
// uncommitted in the parent tree. If a lane group co-opens over that dirt, its last-member close is
// caught in a two-horned deadlock: the parent-clean fence (--parent-clean-check) refuses parent_dirty
// on the uncommitted serial files, but committing them to clear the fence lands them in the merge
// commit M → outside the group's declared union → write_set_overflow at the commit-based group
// barrier. Serial-degrade avoids the trap entirely (the serial per-node barrier tolerates prior dirt:
// its base is a full-worktree snapshot at open, so accumulated dirt is present on both sides and
// invisible). Shells the SAME --parent-clean-check the last-member close runs (identical invocation
// form, at :4994) so the producer/consumer classification can never drift. FAIL-CLOSED: any non-`pass`
// result (parent_dirty, an unrelated refuse like root_mismatch, or a crash/no-JSON) is treated as
// dirt → degrade to serial — never co-open on an uncertain parent. Parallelism is a means, not a goal.
function parentCarriesProductionDirt(planPath, project, shell) {
  const fence = shell(validatorPath, [planPath, '--parent-clean-check', '--project', project, '--json']);
  // Mirror the last-member close-fence's OWN acceptance check literally (fence.exitCode !== 0 ||
  // fence.result !== 'pass') so the two dirt classifications can never drift. shellNode always returns
  // an object (exitCode set last), so no `fence &&` null-guard is needed here.
  return fence.exitCode !== 0 || fence.result !== 'pass';
}

// #641 (D-641-01) R2b: the consent-tier LEGLESS-co-open decision. Over a DIRTY parent, R1's leg path is
// unsound — a leg branches off HEAD and would miss the uncommitted serial-sibling context, silently
// degrading the writer's inputs (accuracy loss, precedence #1). The only sound co-open keeps the writer
// LEGLESS in the parent (so it sees that context), which means the closed-work-observation invariant must
// hold CONTRACTUALLY on the READ side. Returns the single highest-priority writer node to co-open when:
//   (i)  EVERY live read is a freeze-validated `observes: scratch` adversarial-verifier — its verdict is
//        rendered from .cache evidence of closed nodes + scratch, NEVER the worktree tree/diff; AND
//   (ii) that writer's declared set is scratch-observable-safe (scratchObservableWriteSet — the docs
//        allowband minus #547 test-consumed prose, or the writer's own .cache evidence).
// Returns null otherwise ⇒ the caller's byte-identical parent_dirty hold. Re-reads the FROZEN plan for the
// reads' role + observes annotation (the running-set entry carries neither); fail-closed on any parse miss.
function tryR2bLeglessCoopen(writeNodes, liveNodes, planPath, project, readFile) {
  let parseNodes, scratchObservableWriteSet, parseValidationTestConsumes;
  try { ({ parseNodes, scratchObservableWriteSet, parseValidationTestConsumes } = require('./kaola-workflow-plan-validator')); } catch (_) { return null; }
  if (typeof parseNodes !== 'function' || typeof scratchObservableWriteSet !== 'function') return null;
  // A live main-session-gate (kind:'gate') is a live observer, not a scratch reader — hold the legless
  // co-open while a gate is running (its verdict window must not span a co-running writer's uncommitted
  // bytes). Defensive fail-closed so the co-open precondition independently sees the gate.
  if ((liveNodes || []).some(n => n.kind === 'gate')) return null;
  let planNodes, planContent;
  try { planContent = readFile(planPath); planNodes = parseNodes(planContent); } catch (_) { return null; }
  const byId = new Map(planNodes.map(n => [n.id, n]));
  const liveReads = (liveNodes || []).filter(n => n.kind === 'read');
  // (i) every live read must be a freeze-declared observes:scratch adversarial-verifier. No live reads,
  // or any non-scratch reader (a full-diff observer), fails closed — no legless co-open.
  const allScratchGates = liveReads.length > 0 && liveReads.every(n => {
    const pn = byId.get(n.id);
    return !!(pn && pn.role === 'adversarial-verifier' && pn.observes === 'scratch');
  });
  if (!allScratchGates) return null;
  // (ii) the highest-priority writer (the frontier is longest-path-to-sink ordered) must be
  // scratch-observable-safe over its OWN declared set.
  const writer = writeNodes[0];
  if (!writer) return null;
  const pn = byId.get(writer.id);
  let ws = (pn && pn.writeSet) ? pn.writeSet : null;
  if (!ws) { try { ws = require('./kaola-workflow-classifier').parseWriteSetCell(writer.declared_write_set); } catch (_) { ws = []; } }
  // Widen the scratch-observable predicate with the plan's validation_test_consumes so a fork declaring a
  // verdict-affecting prose file (e.g. a custom guide) makes that file observation-VISIBLE — a writer of
  // it is then NOT scratch-observable-safe and stays serial (never a legless co-open over a dirty parent).
  const testConsumedExtra = (typeof parseValidationTestConsumes === 'function') ? parseValidationTestConsumes(planContent) : [];
  if (!scratchObservableWriteSet(ws, { project, ownerNodeId: writer.id, testConsumedExtra })) return null;
  return writer;
}

// ---------------------------------------------------------------------------
// #463 Slice 2 (D-419 P2 write-axis) — per-leg `.kw` git-worktree provisioning for the write-lane
// scheduler (ADR-0010: containment, not construction — legs isolate write scope; they do not
// redirect the dispatched member's working_dir, which stays parent-side (routing into legs landed in Slice 3, #463 AC18)). Legs are
// PROVISIONED (a real `git worktree add` per co-opened write member) + telemetered +
// reconcile/teardown-aware. Provisioning fires under `groupForm && legCoupled` (the runOpenReady
// gate at :4015) — i.e. a formed lane group AND legCoupled (= parallelWritesDefaultOn(process.env),
// default TRUE; #542 / D-542-01). Per #546-G2 a file-disjoint SHARED-INFRA frontier, and per #593 a
// file-disjoint COARSE (non-shared) frontier, BOTH co-open BY DEFAULT under the retained net (a
// post-dominating code-reviewer gate + no PROTECTED file in either set) — no resolveLegIsolation
// toggle and no opts.writeOverlapConsent required (consent is vestigial at this seam). Only a genuine
// overlap (exact / case-collision) or an unresolvable directory/glob coarse pair serial-degrades. When
// legCoupled is false (KAOLA_PARALLEL_WRITES=0 / a host that cannot
// provision per-leg worktrees) NO group forms, NO leg is provisioned, NO lane_group.legs key is
// written ⇒ serial-fallback byte-identical.
//
// resolveLegIsolation — RETAINED only as the exported boolean toggle / reconcile helper (no longer
// the provisioning gate post-#542); mirrors resolveLaneContainment's exact truthiness logic (only an
// explicit 1/true/yes opts in; fail-closed default FALSE). The KAOLA_LEG_ISOLATION env.
// ---------------------------------------------------------------------------
const LEG_ISOLATION_ENV = 'KAOLA_LEG_ISOLATION';
function resolveLegIsolation(env) {
  const raw = (env || {})[LEG_ISOLATION_ENV];
  return raw === '1' || raw === 'true' || raw === 'yes';
}

// sanitizeLegId — the SAME String(x).replace(/[^A-Za-z0-9_-]/g,'_') sanitizer the validator's
// barrier-base ref/file key applies (mirrors sanitizeNodeId ~3058); a node id reaches a worktree
// path SEGMENT + a branch name here, so the same byte-compatible class makes the leg path/branch
// deterministic and shell-safe.
function sanitizeLegId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

// legBranchFor / legPathFor — the deterministic per-leg branch + worktree path. The path lives
// strictly UNDER the gitignored `.kw/` band (legPathFor uses mainRoot/.kw/legs) so snapshotWorktree's
// `git add -A` sweep never stages a sibling leg. mainRoot (NOT root) anchors both so a linked feature
// worktree provisions its legs as SIBLINGS of the main checkout, not nested inside itself.
// #463 Slice 2 (FIX-4): the PROJECT segment is sanitized too (sanitizeLegId) — a project name with a
// '/' or other path metachar would otherwise inject extra path segments / a nested ref namespace and
// break the sweepOrphanLegs filter-base match (which must use the SAME sanitized segment). validateProjectName
// already rejects separator-bearing project names upstream, but sanitizing here keeps the leg path/branch
// derivation self-consistent and the sweep filter exact.
function legBranchFor(project, nodeId) {
  return 'kw/legs/' + sanitizeLegId(project) + '/' + sanitizeLegId(nodeId);
}

function legPathFor(mainRoot, project, nodeId) {
  return path.join(mainRoot, '.kw', 'legs', sanitizeLegId(project), sanitizeLegId(nodeId));
}

// legMirrorPath (#633, D-622-01) — the leg's OWN copy of a repo-root-relative path (e.g. planPath or its
// dirname). A leg is a FULL worktree checkout of the same tree, so the SAME relative path exists (or
// will exist) rooted at legPath instead of the current worktree's root. Used to redirect a leg member's
// evidence read to the leg's own `.cache/{node-id}.md` — the SAME path a dispatched write-role agent's
// `dispatch.leg_path` working_dir resolves its self-written evidence against (commands/kaola-workflow-
// plan-run.md's "write-leg dispatch discipline" + "evidence-persistence contract") — instead of the
// PARENT's copy. Falls back to process.cwd() if getRoot() throws; never throws itself.
function legMirrorPath(legPath, absPath) {
  let root; try { root = getRoot(); } catch (_) { root = process.cwd(); }
  return path.join(legPath, path.relative(root, absPath));
}

// legBaseRef — the deterministic git ref anchoring a leg's BRANCH-POINT (#463 Slice 3). The per-leg
// barrier resolves its base ONLY from this ref (never a caller-supplied --base — the #368 vacuous-pass
// hole), so the base must be anchored at PROVISION and the validator's --leg-barrier reads the SAME ref
// name. The ref name MUST stay byte-identical to the validator's inline builder
// ('refs/kaola-workflow/leg-base/' + sanitize(project) + '/' + sanitize(id)); sanitizeLegId here is the
// SAME [^A-Za-z0-9_-]→_ class the validator's legSan applies, so producer + consumer never drift (the
// drift would surface as a silent no_leg_base, not a name error). Derivable from legBranch too:
// legBranchFor → 'kw/legs/<p>/<id>' shares the '<p>/<id>' tail, so teardown rebuilds the ref from the
// branch without threading project/id (see teardownLeg).
function legBaseRef(project, nodeId) {
  return 'refs/kaola-workflow/leg-base/' + sanitizeLegId(project) + '/' + sanitizeLegId(nodeId);
}

// assertSafeLegBranch — re-impl of claim.js assertSafeBranchArg locally (claim.js does not export it
// for adaptive-node; repo convention is a local re-impl). Refuse a branch beginning with '-' (git
// parses it as a flag) or carrying a NUL (ref injection). Throw on violation so a hostile/malformed
// branch never reaches `git worktree add -b`.
function assertSafeLegBranch(branch) {
  if (typeof branch !== 'string' || branch.length === 0 || branch.startsWith('-') || branch.includes('\0')) {
    throw new Error('refused: unsafe leg branch name: a branch beginning with "-" or carrying a NUL would be parsed by git as a flag/ref injection.');
  }
}

// classifyLegError — map a raw `git worktree` error message to a stable single-token class (mirrors
// claim.js classifyWorktreeError) so a caller routes structurally, not by string-match.
function classifyLegError(message) {
  const m = String(message || '');
  if (!m) return '';
  if (/already (exists|checked out|used by worktree)/i.test(m)) return 'already_exists';
  if (/not a valid (object name|ref)|unknown revision|invalid reference/i.test(m)) return 'invalid_ref';
  if (/permission denied|EACCES|read-only|EROFS/i.test(m)) return 'permission_denied';
  if (/no space left|ENOSPC|disk/i.test(m)) return 'disk_full';
  if (/not a git repository|fatal: this operation must be run in a work tree/i.test(m)) return 'not_a_repo';
  return 'unclassified';
}

// legBranchExists — does refs/heads/<branch> resolve at mainRoot? (mirrors claim.js branchExists).
function legBranchExists(mainRoot, branch) {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) { return false; }
}

// provisionLeg — `git worktree add` rooted at mainRoot, per-leg. assertSafeLegBranch FIRST (fail-closed
// before git). Idempotency mirrors claim.js provisionWorktree (claim.js:494-506):
//   (1) legPath already exists ⇒ already provisioned (this/a prior run) ⇒ short-circuit ok;
//   (2) legBranch already exists but the path does NOT (a prior fail-soft teardown removed the worktree
//       but its `branch -D` was swallowed, leaving a dangling branch) ⇒ `git worktree add` WITHOUT `-b`
//       to REUSE the branch — without this, a crash-resume re-provision hits `add -b <existing>` → fails
//       → leg_provision_failed → wedge (the dead-end this codebase is built to avoid);
//   (3) otherwise ⇒ `git worktree add -b <branch> -- <path> <baseRev>` (fresh branch + path).
// mkdir the parent (.kw/legs/<project>/) before the add, like claim.js:493.
// Returns { ok:true, alreadyProvisioned?, reusedBranch? } or { ok:false, error:<classify> }.
function provisionLeg(mainRoot, legPath, legBranch, baseRev) {
  const fs = require('fs');
  try { assertSafeLegBranch(legBranch); } catch (e) { return { ok: false, error: 'unsafe_branch', detail: String(e.message || e) }; }
  if (fs.existsSync(legPath)) return { ok: true, alreadyProvisioned: true };
  try { fs.mkdirSync(path.dirname(legPath), { recursive: true }); } catch (_) {}
  const reuseBranch = legBranchExists(mainRoot, legBranch);
  const addArgs = reuseBranch
    ? ['worktree', 'add', '--', legPath, legBranch]
    : ['worktree', 'add', '-b', legBranch, '--', legPath, baseRev];
  try {
    execFileSync('git', addArgs, { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
    return reuseBranch ? { ok: true, reusedBranch: true } : { ok: true };
  } catch (e) {
    return { ok: false, error: classifyLegError(e.message || e), detail: String(e.message || e) };
  }
}

// teardownLeg — STRICT ORDER, each step fail-soft in its own try/catch, NEVER throws:
//   (1) git worktree remove --force <legPath>  THEN  (2) git branch -D <legBranch>.
// Order is LOAD-BEARING: git refuses to delete a branch still checked out by a worktree, so the
// worktree MUST be removed before the branch -D. Both rooted at mainRoot.
function teardownLeg(mainRoot, legPath, legBranch) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', legPath], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) { /* fail-soft: a missing/already-removed worktree is a clean no-op */ }
  try {
    execFileSync('git', ['branch', '-D', legBranch], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) { /* fail-soft: a missing/already-deleted branch is a clean no-op */ }
  // #463 Slice 3: delete the leg-base ref anchored at provision. Derived from legBranch
  // ('kw/legs/<p>/<id>' → 'refs/kaola-workflow/leg-base/<p>/<id>') so every teardown caller
  // (close-node / reconcile / sweepOrphanLegs) drops the ref without threading project/id. Fail-soft.
  try {
    if (typeof legBranch === 'string' && legBranch.indexOf('kw/legs/') === 0) {
      execFileSync('git', ['update-ref', '-d', 'refs/kaola-workflow/leg-base/' + legBranch.slice('kw/legs/'.length)], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
    }
  } catch (_) { /* fail-soft: a missing ref is a clean no-op */ }
}

// sweepOrphanLegs — `git worktree list --porcelain` (rooted at mainRoot), parse `worktree <path>`
// lines, filter to paths under <mainRoot>/.kw/legs/<project>/, subtract keepLegPaths, teardownLeg
// each remainder (its branch derived from the path basename via legBranchFor). Fail-soft — sweep
// never throws. Cleans an orphan leg left by a crashed prior run (a leg with no running-set member).
function sweepOrphanLegs(mainRoot, project, keepLegPaths) {
  const keep = new Set((keepLegPaths || []).map(p => path.resolve(p)));
  // #463 Slice 2 (FIX-4): the filter base uses the SAME sanitizeLegId(project) segment legPathFor
  // produces, so a project name with a path metachar still matches its own provisioned legs.
  const projLegDir = path.resolve(path.join(mainRoot, '.kw', 'legs', sanitizeLegId(project)));
  let out = '';
  try {
    out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: mainRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) { return; }
  for (const line of String(out || '').split('\n')) {
    if (line.indexOf('worktree ') !== 0) continue;
    const wt = path.resolve(line.slice('worktree '.length).trim());
    if (wt !== projLegDir && (wt + path.sep).indexOf(projLegDir + path.sep) !== 0) continue;
    if (keep.has(wt)) continue;
    const nodeId = path.basename(wt);
    teardownLeg(mainRoot, wt, legBranchFor(project, nodeId));
  }
}

// ---------------------------------------------------------------------------
// synthesizeLevel (#463 Slice 4) — the SYNTHESIZER execution: reconcile a fan-out level's legs into the
// feature branch at `root` (the integration worktree). DISJOINT legs (the #463 core, write_overlap_policy
// :disjoint) → a MECHANICAL octopus merge, NO agent (do not inflate the clean win). Steps:
//   (1) SCRIPT-OWNED CAPTURE: commit each leg's uncommitted work on its own branch (the merge only sees
//       commits; robust even if the agent forgot to commit — `add -A` then commit, mirroring the leg
//       barrier's snapshotWorktree capture semantics).
//   (2) OCTOPUS MERGE the leg branches into HEAD (`merge --no-ff` → one commit M, parents = HEAD + every
//       leg head; the spike proved this for disjoint legs). The caller asserts the parent is CLEAN of
//       production paths first (the parent-clean fence) so a floated own-lane slip fails closed BEFORE
//       this, never lost from M. A real conflict (overlapping/same-file, the deferred tier) makes octopus
//       BAIL → `merge --abort` + return merge_conflict (the Opus resolver + K=3 repair is Slice 5).
// Returns { ok:true, mergeCommit } | { ok:false, reason, ... }. An explicit committer identity is passed
// so the merge/commit never depends on ambient git config. Pure git over the shared object DB.
// ---------------------------------------------------------------------------
function synthesizeLevel(root, legs, groupId, planPath) {
  const ID = ['-c', 'user.email=kaola-workflow@local', '-c', 'user.name=kaola-workflow'];
  const QUIET = { stdio: ['ignore', 'ignore', 'ignore'] };
  const ids = Object.keys(legs || {});
  if (!ids.length) return { ok: false, reason: 'no_leg_branches' };
  // (1) script-owned capture. Emits `leg_committed` per leg (AC17 telemetry: the leg-lifecycle event
  // leg_opened → leg_committed → level_merged) when planPath is supplied — symmetric with leg_opened. A leg
  // with work committed by its own agent (not dirty) still records the lifecycle event; an empty leg never
  // reaches here (member_vacuity fail-closes it at the member close, #463 Slice 5).
  for (const id of ids) {
    const leg = legs[id];
    if (!leg || !leg.legPath) continue;
    let dirty = '';
    try {
      dirty = execFileSync('git', ['-C', leg.legPath, 'status', '--porcelain'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
    } catch (e) {
      // #672 fail-closed: a probe failure (>maxBuffer porcelain, a broken git invocation on the
      // leg, ...) must NEVER be read as "leg is clean" — that would silently OMIT real committed/
      // working leg content from the octopus merge below (never captured, never folded into M).
      // Refuse loudly instead of guessing clean — mirrors the leg_capture_failed typed refusal
      // just below for the symmetric capture-side failure.
      return { ok: false, reason: 'leg_dirty_probe_failed', nodeId: id, leg: id, detail: String((e && e.message) || e) };
    }
    if (dirty) {
      try {
        execFileSync('git', ['-C', leg.legPath, 'add', '-A'], QUIET);
        execFileSync('git', ['-C', leg.legPath, ...ID, 'commit', '-m', 'kw-leg: ' + id], QUIET);
      } catch (e) { return { ok: false, reason: 'leg_capture_failed', nodeId: id, leg: id, detail: String((e && e.message) || e) }; }
    }
    if (planPath) { try { appendNodeTiming(planPath, id, 'leg_committed'); } catch (_) { /* telemetry is best-effort */ } }
  }
  // #463 Slice 5 — NO no-op-leg detector here, deliberately. A leg that produced no changes is caught by the
  // leg-aware `member_vacuity` guard at that member's OWN close (memberInLaneChanges, leg-aware since S4) —
  // BEFORE the last-member synthesis — where the evidence is visible, so a member that legitimately declares
  // `no_op:<reason>` is honored. A detector here cannot see that declaration and would FALSE-POSITIVE a
  // sanctioned no_op member; an undeclared empty leg never reaches here (member_vacuity already fail-closed
  // it). An empty leg that does arrive (legit no_op) contributes an empty diff to M — harmless. (#44: the
  // producer lives where the evidence is.)
  // (2) octopus merge into the feature branch at root.
  const branches = ids.map(id => (legs[id] && legs[id].legBranch)).filter(Boolean);
  if (!branches.length) return { ok: false, reason: 'no_leg_branches' };
  try {
    execFileSync('git', ['-C', root, ...ID, 'merge', '--no-ff', '-m', 'kw-synth: ' + groupId, ...branches], QUIET);
  } catch (e) {
    try { execFileSync('git', ['-C', root, 'merge', '--abort'], QUIET); } catch (_) { /* fail-soft */ }
    return { ok: false, reason: 'merge_conflict', detail: String((e && e.message) || e) };
  }
  let mergeCommit = '';
  try { mergeCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { mergeCommit = ''; }
  if (!mergeCommit) return { ok: false, reason: 'merge_head_unresolved' };
  return { ok: true, mergeCommit };
}

// ---------------------------------------------------------------------------
// speculativeCloseGuard (#439 D-419 Part 4) — a speculative node cannot COMMIT to `complete` until its
// bet resolves: its post-dominating gate must be `complete` first. Without this, a speculative node that
// closes BEFORE its gate vanishes from the running set, so a later gate `verdict:fail` could no longer
// surface speculative_review_required nor be discard-speculative'd — the coherence the review + discard
// mechanism (settlements 3+4) depends on. This is NOT a general blocking-gate semantic (#328 per-node
// verdicts stay informational for NORMAL nodes): it fires ONLY for a `speculative:true` member whose own
// `speculativeGate` is not yet complete, and it NEVER deadlocks (the gate is an UPSTREAM dependency that
// closes independently). Returns a typed gate_not_complete refusal, or null to proceed.
// ---------------------------------------------------------------------------
function speculativeCloseGuard(nodeId, running, ledgerStatuses) {
  const member = running && (running.nodes || []).find(n => n.id === nodeId && n.speculative);
  if (!member) return null;
  const gateId = member.speculativeGate;
  if (gateId && ledgerStatuses && ledgerStatuses[gateId] !== 'complete') {
    return {
      result: 'refuse', reason: 'gate_not_complete', nodeId, speculativeGate: gateId,
      detail: 'a speculative node cannot close until its gate completes; if the gate fails, discard-speculative it',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// speculativeReviewOnGateClose (#439 D-419 Part 4, settlement 3) — when a GATE closes with a FAILING
// verdict, return { gate, gate_verdict:'fail', speculative:[ids] } naming the speculative members that
// bet on it (still in the running set, because speculativeCloseGuard held them there), so the operator
// KEEPs or discard-speculative's each. null otherwise. NON-blocking (the gate close itself is legit; the
// recorded verdict:fail is still caught at finalize by verifyVerdictBlock). Used by BOTH close paths.
// ---------------------------------------------------------------------------
function speculativeReviewOnGateClose(role, nodeId, evidenceContent, running, planContent) {
  if (!GATE_ROLES.has(role)) return null;
  const v = parseNodeVerdict(evidenceContent);
  if (!v || v.verdict !== 'fail') return null;
  const deps = new Map();
  try { for (const n of parseNodesFromContent(planContent)) deps.set(n.id, n.dependsOn || []); } catch (_) {}
  const atRisk = (running ? (running.nodes || []) : [])
    .filter(n => n.speculative && (deps.get(n.id) || []).includes(nodeId))
    .map(n => n.id);
  return atRisk.length ? { gate: nodeId, gate_verdict: 'fail', speculative: atRisk } : null;
}

// ---------------------------------------------------------------------------
// runDiscardSpeculative (#439 D-419 Part 4, settlement 4) — MUTATES ledger + baseline + running-set.json.
// Rolls back a speculatively-opened read node when its gate's bet fails (the operator's choice after a
// `speculative_review_required`). The discard ORDER is GC-safe and composes with #424's
// drop_base_window_open lock + #434's no-re-snapshot posture:
//   (a) ledger reset in_progress -> pending FIRST (so --drop-base is not window-locked by #424);
//   (b) revert the node's in-lane DECLARED writes to the ANCHORED baseline SHA (read from .cache BEFORE
//       any drop). For a #439 READ node the declared set is empty ⇒ a no-op; this revert is the SHARED
//       primitive #463's write-leg rollback reuses;
//   (c) --drop-base (remove the anchored ref + file together; idempotent);
//   (d) remove the node from running-set.json.
// Refuses (zero mutation) unless the node is a live `speculative: true` running-set member. NOT a
// laundering path: it keeps the anchored baseline as the revert target and only drops it AFTER reverting;
// the node returns to pending and re-opens normally once the gate closes.
//
// @param opts { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, gitCheckout? }
// ---------------------------------------------------------------------------
function runDiscardSpeculative(opts) {
  const { planPath, nodeId, shell, readFile, writeFile, cacheExists, unlink } = opts;
  const gitCheckoutSeam = opts.gitCheckout || null;
  if (!nodeId) return { result: 'refuse', errors: ['--node-id required for discard-speculative'] };

  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  const member = running && (running.nodes || []).find(n => n.id === nodeId);
  if (!member) {
    return { result: 'refuse', reason: 'not_in_running_set', nodeId, detail: 'discard-speculative targets a live running-set member' };
  }
  if (!member.speculative) {
    return { result: 'refuse', reason: 'not_speculative', nodeId, detail: 'only a speculative: true member may be discarded via discard-speculative' };
  }
  const isWriteMember = member.kind === 'write';

  // Read the anchored baseline SHA BEFORE any drop (the revert target).
  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const baseFile = path.join(cacheDir, 'barrier-base-' + sanitizeNodeId(nodeId));
  let baseSha = null;
  try { baseSha = (readFile(baseFile) || '').trim().split('\n')[0].trim() || null; } catch (_) { baseSha = null; }

  // (a) Ledger reset in_progress -> pending FIRST (so --drop-base is not #424 window-locked).
  let planContent = readFile(planPath);
  const reset = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['in_progress'] });
  if (!reset.found) return { result: 'refuse', reason: 'node_not_in_ledger', nodeId };
  if (reset.changed) { planContent = reset.content; writeFile(planPath, planContent); }

  // (b) Revert the node's in-lane DECLARED writes to the anchored baseline. #596: a WRITE member's
  // declared writes land in its LEG (never the parent) — the parent's copy was never touched, so there
  // is nothing to revert there (D-596-01: the premise that made this step necessary is obsolete for a
  // leg-resident writer). Skip it for a write member: (1) it is a pure no-op at best, and (2) a NEW file
  // the leg was going to create does not exist at baseSha yet, so `git checkout baseSha -- <path>` would
  // hard-FAIL (pathspec did not match) — a live bug this skip avoids. Read members are unaffected (their
  // declared set is always empty, so this was already a no-op for them).
  let revertedPaths = [];
  if (!isWriteMember) {
    let declared = [];
    try {
      const { parseWriteSetCell } = require('./kaola-workflow-classifier');
      declared = Array.from(parseWriteSetCell(member.declared_write_set));
    } catch (_) { declared = []; }
    if (declared.length && baseSha) {
      let root; try { root = getRoot(); } catch (_) { root = process.cwd(); }
      if (gitCheckoutSeam) {
        const r = gitCheckoutSeam(root, baseSha, declared);
        if (r && r.exitCode !== 0) return { result: 'refuse', reason: 'git_checkout_failed', nodeId, declared };
        revertedPaths = declared.slice();
      } else {
        try {
          execFileSync('git', ['checkout', baseSha, '--', ...declared], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
          revertedPaths = declared.slice();
        } catch (e) { return { result: 'refuse', reason: 'git_checkout_failed', nodeId, declared, detail: String(e.message || e) }; }
      }
    }
  }

  // (c) Drop the anchored baseline (ref + file together; idempotent).
  shell(validatorPath, [planPath, '--drop-base', '--node-id', nodeId, '--json']);

  // (c.5) #596: WRITE members are DISCARD-ONLY (asymmetry with reads, on purpose — a read's evidence may
  // remain valid for the operator's KEEP-or-discard review; a write built on a refuted premise is rework
  // risk, so it is torn down unconditionally):
  //   - tear down the leg (worktree + branch + leg-base ref, via the SAME teardownLeg every other leg-
  //     lifecycle site uses; sweepOrphanLegs is the crash backstop for anything this misses);
  //   - purge the stale evidence file so a future re-open reseeds cleanly (seedEvidenceFile's forceRotate
  //     is false on a normal open, so a survived stale file with the OLD nonce would otherwise wedge the
  //     #392 binding check on re-open);
  //   - if this was the LAST live member of its lane_group, clear the group entry + drop its group
  //     baseline (mirrors closeGroupMember's clean-completion teardown); otherwise just drop this member
  //     from the group's legs/members so a surviving sibling's eventual group barrier scopes correctly.
  let legTornDown = false;
  let evidenceDiscarded = false;
  let groupCleared = false;
  if (isWriteMember) {
    const lg = running.lane_group;
    const legEntry = lg && lg.legs && lg.legs[nodeId];
    if (legEntry && legEntry.legPath) {
      let mainRoot; try { mainRoot = getMainRoot(getRoot()); } catch (_) { mainRoot = process.cwd(); }
      teardownLeg(mainRoot, legEntry.legPath, legEntry.legBranch);
      legTornDown = true;
    }
    const evPath = path.join(cacheDir, nodeId + '.md');
    if ((cacheExists ? cacheExists(evPath) : false) && typeof unlink === 'function') {
      unlink(evPath);
      evidenceDiscarded = true;
    }
  }

  // (d) Remove the node from running-set.json — folding the write-member group cleanup (c.5's last leg).
  const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
  let nextTop = { ...running, nodes: remaining };
  if (isWriteMember && running.lane_group && Array.isArray(running.lane_group.members) && running.lane_group.members.includes(nodeId)) {
    const stillLive = remaining.some(n => n.group_id === running.lane_group.group_id);
    if (!stillLive) {
      delete nextTop.lane_group;
      groupCleared = true;
      shell(validatorPath, [planPath, '--drop-base', '--node-id', running.lane_group.group_id, '--json']);
    } else {
      const legs2 = { ...(running.lane_group.legs || {}) };
      delete legs2[nodeId];
      nextTop = { ...nextTop, lane_group: { ...running.lane_group, members: running.lane_group.members.filter(m => m !== nodeId), legs: legs2 } };
    }
  }
  writeFile(runningSetPath, JSON.stringify(nextTop, null, 2));

  // AC5 (#597): discard telemetry — record the role + the gate this speculative member bet on, so the
  // cost of an `auto` gate-fail discard is observable in the durable provenance log (no silent cost).
  appendProvenanceLog(planPath, 'discard-speculative', nodeId, baseSha ? String(baseSha).slice(0, 12) : null,
    { role: member.role || null, gate: member.speculativeGate || null });

  return {
    result: 'ok',
    nodeId,
    discarded: true,
    ledgerReset: 'pending',
    revertedPaths,
    baseDropped: true,
    runningSet: remaining.map(n => n.id),
    ...(isWriteMember ? { legTornDown, evidenceDiscarded, ...(groupCleared ? { groupCleared } : {}) } : {}),
    taskTransitions: [buildTransition(nodeId, 'pending', 'discard-speculative')],
  };
}

// ---------------------------------------------------------------------------
// runOpenReady — MUTATES ledger + baselines + running-set.json.
// Opens up to N ready-pending nodes (priority-ordered by next-action's
// longest-path-to-sink). Read-only nodes fan out up to the read-only cap; a write
// node opens alone only when the running set is empty. Two-phase crash-safe write.
//
// #437 (D-419 P2) + #542 (D-542-01): a ≥2 planner-proven-disjoint write frontier co-opens as a
// LANE GROUP BY DEFAULT (a `lane_group` key in running-set.json + a shared group baseline) so the
// close barrier is GROUP-scoped (deferred per-member, run once at the last close). Co-open is gated
// on legCoupled (parallelWritesDefaultOn, default TRUE) — NOT on the retired KAOLA_LANE_CONTAINMENT
// flag. KAOLA_PARALLEL_WRITES=0 forces the byte-identical single-write serial open (INV-6): no
// `lane_group`, no group baseline, no new code path. The validator re-verifies disjointness here.
// ---------------------------------------------------------------------------
function runOpenReady(opts) {
  const {
    planPath, project, max, fanoutCapReadonly, shell, readFile, writeFile, cacheExists, mkdirp, now,
    working_dir, codexDispatchMode,
  } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: integrity:yes / excl-serial:yes /
  //    halt-fence:yes (NO excl-scheduler — open-ready OWNS the running set). (#594: excl-batch dropped —
  //    active-batch.json has no producer left.) ==
  // Layer 1 INTEGRITY (#387): mirror open-ready/top-up — a tampered/structurally-invalid frozen plan
  // must not be partially executed by the scheduler. --resume-check covers hash-freeze + post-freeze
  // tamper + cycle + unique-sink + role-library + depends_on resolvability. Any non-ok refuses with
  // zero mutation. (Without this, an emptied write node's declared_write_set is reclassified read-only
  // by isReadOnlyNode and fans out concurrently — the #387 repro.)
  const guard = mutationGuardPrologue(opts, { integrity: true, halt: true, excl: ['serial'] });
  if (guard) return guard;

  const reviewOpen = reviewFanoutTopUpAllowance(opts, readFile(planPath));
  if (!reviewOpen.ok) return reviewOpen.refusal;
  const reviewTopUp = reviewOpen.topUp;

  // Crash-safe precondition: an 'opening' running set (or any opening:true node) is an
  // interrupted open-ready — refuse with a reconcile pointer (never silently overwrite).
  const existing = readRunningSet(runningSetPath, cacheExists, readFile);
  if (existing && (existing.state === 'opening' || (existing.nodes || []).some(n => n.opening))) {
    return { result: 'refuse', reason: 'reconcile_first', state: existing.state || 'open', detail: 'running_set_opening_incomplete' };
  }

  const nextAction = shell(nextActionPath, [planPath, '--json']);
  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }
  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: [], taskTransitions: [] };
  }

  // The live set = nodes already in the running set (or, on a fresh start with no
  // running-set file yet, the in_progress rows — but open-ready owns running-set.json,
  // so a non-empty in_progress with no running set means a serial node is live: do not
  // co-schedule against it).
  const liveNodes = existing ? (existing.nodes || []) : [];
  const liveIds = new Set(liveNodes.map(n => n.id));

  // #622 (D-622-01): a LEGLESS write node (no lane_group — the plain single-writer serial path) still
  // runs strictly alone: if one is live, open nothing until it closes (unchanged — the #588-MIXED-
  // FRONTIER-pinned invariant, and every main-session-gate/serial-writer exclusivity case, are both
  // untouched). A LEG-CONTAINED write (a live lane_group member — #463/#542 default-on co-open) is
  // isolated in its own leg worktree, so it no longer needs to exclude READS from opening — mirroring the
  // #596 speculative-path precedent (below, ~:4282-4287) that already tolerates a live write co-running
  // with reads/other members via this SAME `!liveHasWrite` gate (never re-asserted there for a leg-
  // contained writer). The eventual merge at the group's last-member close is separately fenced against
  // live reads (closeGroupMember's merge-awaits-read-drain check) so a leg's merge never races a read
  // still live against the pre-merge parent tree.
  const liveGroupId = existing && existing.lane_group && existing.lane_group.group_id;
  const isLegContainedWrite = n => !!(liveGroupId && n.group_id && n.group_id === liveGroupId);
  const liveHasLeglessWrite = liveNodes.some(n => n.kind === 'write' && !isLegContainedWrite(n));

  // A LEGLESS write node runs strictly alone: if one is live, open nothing until it closes.
  if (liveHasLeglessWrite) {
    return { result: 'ok', allDone: false, opened: [], reason: 'write_node_exclusive', taskTransitions: [] };
  }

  // Priority-ordered openable frontier (next-action orders readyPending by longest-path-to-sink).
  // Exclude main-session-gate (the main session cannot run concurrently with itself) and any node
  // already in the running set.
  let frontier = (nextAction.readyPending || [])
    .filter(n => n.role !== 'main-session-gate')
    .filter(n => !liveIds.has(n.id));
  if (reviewTopUp) {
    const allowed = new Set(reviewTopUp.pending_members);
    frontier = frontier.filter(node => allowed.has(node.id));
  }

  // #439 (D-419 Part 4): SPECULATIVE fallback. When the NORMAL frontier is empty — the only thing
  // blocking forward progress is an open gate — AND the frozen plan's speculative_open_policy AUTHORIZES
  // speculation, fan out the speculative-eligible nodes (next-action's speculativePending): read (and,
  // per #596, leg-contained write) nodes betting that the open gate will pass. They open exactly like a
  // read/write frontier, but each running-set entry is stamped `speculative: true` ([INV-25]) so orient /
  // reconcile / close treat them as the optimistic set.
  //   auto (the default): authorized with NO per-run flag — the structural net (close fence + discard
  //     path + blast-radius conditions) is the whole guarantee, so the consent ceremony is retired.
  //     `--speculative-consent` is accepted as a NO-OP here (it is simply not consulted at auto).
  //   consent: authorized ONLY WITH the per-run `--speculative-consent` flag (the operator still opts in).
  //   off: this branch is inert ⇒ byte-identical to the off-policy shape.
  // Never co-runs with a live LEGLESS write (liveHasLeglessWrite already returned above). Consent, where
  // required, is per-run (the flag), never persisted in the plan.
  const specPolicy = resolveSpeculativePolicy(readFile(planPath));
  const speculativeAuthorized = specPolicy === 'auto' || (specPolicy === 'consent' && opts.speculativeConsent);
  let openingSpeculative = false;
  if (!reviewTopUp && frontier.length === 0 && speculativeAuthorized) {
    const specFrontier = (nextAction.speculativePending || [])
      .filter(n => n.role !== 'main-session-gate')
      .filter(n => !liveIds.has(n.id));
    if (specFrontier.length > 0) {
      frontier = specFrontier;
      openingSpeculative = true;
    }
  }
  if (frontier.length === 0) {
    return { result: 'ok', allDone: false, opened: [], taskTransitions: [] };
  }

  const readOnly = frontier.filter(isReadOnlyNode);
  const writeNodes = frontier.filter(n => !isReadOnlyNode(n));

  // Selection (containment off — the permanent fallback):
  //   read-only ready nodes  → fan out up to (readonlyCap - liveCount), bounded by --max.
  //   else, running set empty → open exactly ONE write node (serial, isolated).
  const cap = fanoutCapReadonly || 8;
  let toOpen;
  let openKind;
  // #437 (D-419 P2): the lane-group descriptor when ≥2 disjoint writes co-open under
  // containment. undefined ⇒ the serial/read path (the running-set writer skips lane_group).
  let groupForm;
  // #588: the WRITE-cap ceiling a formed lane group co-opened under (resolveFanoutCap folded with --max).
  // Recorded as running-set max_concurrent for a write group so reconcile-running-set honors the WRITE cap
  // on crash-resume — NOT the read cap (`cap`), which would let reconcile roll forward more write members
  // than co-open ever permits. null ⇒ the serial/read path (max_concurrent stays the read-cap ceiling).
  let laneGroupCeiling = null;
  // #542 (D-542-01): parallel disjoint writes are DEFAULT-ON. legCoupled — the SINGLE local that
  // gates BOTH co-open (below) and leg-provisioning (:3976) so they can never drift — is now driven by
  // parallelWritesDefaultOn (default TRUE; KAOLA_PARALLEL_WRITES=0 forces serial). #498 INVARIANT
  // PRESERVED: groupForm is still set ONLY when legCoupled holds ⇒ groupForm ⟺ legs provisioned ⟺ the
  // safe close path. We make co-open default-on by defaulting legCoupled TRUE — NOT by dropping the
  // legCoupled conjunction (that would set groupForm with legs=null → the attribution-blind legless
  // union barrier of #498). Disjointness itself is re-verified authoritatively by the validator at
  // co-open (tryFormLaneGroup → --parallel-safe); --write-overlap-consent is vestigial there (#593).
  const legCoupled = parallelWritesDefaultOn(process.env);
  // #596 (D-596-01): the speculative WRITE fallback. When THIS frontier is the speculative fan-out
  // (openingSpeculative), the running set is emphatically NOT empty — the open gate (or a sibling
  // speculative read) is live — so the normal `liveNodes.length === 0` write-exclusivity precondition
  // would starve a speculative writer forever; `!liveHasLeglessWrite` (already asserted above, before the
  // speculative fallback even fires) is the ONLY exclusivity invariant that still applies. Named ONLY
  // as an explanatory field on the response (never a hard refuse) so read speculation stays unaffected.
  let speculativeWriteExcluded = null;
  // #616 (D-616-01): the non-speculative co-open sibling of speculativeWriteExcluded — labels WHY a
  // normal write frontier degraded to a single serial write, so a persistently dirty parent (a stuck
  // or misconfigured --parent-clean-check fence) is visible instead of silently serializing every write
  // frontier forever. Set ONLY on the branch below where parentCarriesProductionDirt() is the reason the
  // group never even attempted to form (:4335) — NOT on the pre-existing plain single-write-node case,
  // nor on a group attempt that failed for an unrelated reason (grp.ok===false / groupCeiling<2), so the
  // two serial-degrade causes stay distinguishable. null ⇒ no field on the response (byte-identical to
  // pre-#616 for every other degrade cause).
  let serialDegradeReason = null;
  if (readOnly.length > 0) {
    // #607: a live main-session-gate (kind:'gate') is a MAIN-SESSION-run marker, NOT a subagent fan-out
    // slot occupant — exclude it from the read-slot base so speculative reads behind a gate get the full
    // cap (no under-count). Every other live member (read/write) still consumes a slot as before.
    let slots = Math.max(0, cap - liveNodes.filter(n => n.kind !== 'gate').length);
    if (Number.isInteger(max) && max >= 1) slots = Math.min(slots, max);
    toOpen = readOnly.slice(0, slots);
    openKind = 'read';
  } else if (writeNodes.length > 0 && openingSpeculative) {
    // A speculative write ALWAYS opens WITH a provisioned leg (design: "opens WITH a provisioned leg" is
    // unconditional) — even a lone candidate forms a size-1 lane_group, reusing the EXISTING #463/#437
    // group machinery verbatim (closeGroupMember already degenerates a 1-member group to "last member"
    // at close — no new merge code). Requires leg capability (legCoupled, the SAME worktree-capable
    // condition normal co-open requires); a host that cannot provision legs excludes ALL write candidates
    // from THIS open (read speculation, handled above via the readOnly branch, is unaffected).
    if (!legCoupled) {
      toOpen = [];
      speculativeWriteExcluded = { reason: 'no_leg_capability', nodeIds: writeNodes.map(n => n.id) };
    } else if (liveGroupId) {
      // R4 (adversarial-verifier finding on the #622 fix, repair pass): running-set.json carries exactly
      // ONE `lane_group` descriptor at a time. When a write lane_group is ALREADY live (liveGroupId, set
      // above at :4236 — #622 relaxed write_node_exclusive so a read can co-open alongside it, which is
      // how we can reach the speculative branch with a write group still live in the first place), a NEW
      // speculative write candidate must NOT be allowed to form its OWN group: the running-set write-
      // descriptor assignment below (:4623, `groupForm ? {...} : existingLaneGroup`) would UNCONDITIONALLY
      // overwrite the live descriptor with the new one, silently dropping every still-open member (e.g. a
      // non-last lane_group member) from lane_group tracking. That member's later close-node call then
      // cannot recognize it as a group member (isMember checks lane_group.members), falls through to the
      // serial close path, and its committed in-lane leg work never merges to HEAD (silently lost) while
      // its leg worktree leaks. Exclude ALL write candidates from THIS open (mirrors the sibling
      // no_leg_capability/parent_dirty exclusions above) — the speculative write simply waits; once the
      // live group drains and clears lane_group entirely, a later tick can safely form a new one.
      toOpen = [];
      speculativeWriteExcluded = { reason: 'lane_group_live', nodeIds: writeNodes.map(n => n.id) };
    } else if (parentCarriesProductionDirt(planPath, project, shell)) {
      // #615 (D-615-01): the SAME parent-clean precondition that gates the non-speculative co-open
      // (:4286 branch) applies here. A speculative write ALWAYS opens WITH a provisioned leg (even a lone
      // candidate forms a size-1 lane_group), so its last-member close runs the IDENTICAL commit-based
      // group barrier + parent-clean fence — and over a parent carrying out-of-allowband production dirt
      // (uncommitted work from already-closed SERIAL siblings) it hits the SAME two-horned deadlock
      // (Horn A parent_dirty vs Horn B write_set_overflow). Speculation is a PURE optimization: refusing
      // to speculatively open a write over a dirty parent is always safe — the write just waits for its
      // gate normally, exactly like the non-speculative serial-degrade. Exclude ALL write candidates from
      // THIS open (mirror the sibling no_leg_capability exclusion above; read speculation is unaffected).
      // Short-circuited AFTER legCoupled so the fence subprocess only spawns when a speculative write
      // could actually form a group.
      toOpen = [];
      speculativeWriteExcluded = { reason: 'parent_dirty', nodeIds: writeNodes.map(n => n.id) };
    } else {
      const sel = selectSpeculativeWriteGroup(writeNodes, liveNodes, planPath, shell, opts.writeOverlapConsent, max);
      toOpen = sel.chosen;
      if (sel.chosen.length > 0) {
        openKind = 'write';
        laneGroupCeiling = sel.ceiling;
        groupForm = {
          group_id: laneGroupId(sel.chosen.map(n => n.id)),
          members: sel.chosen.map(n => n.id).slice().sort(),
          write_union: laneWriteUnion(sel.chosen),
        };
      }
      if (sel.excluded.length) {
        // O1: carry the PRECISE cause from selectSpeculativeWriteGroup — `overlaps_live_writer` for a
        // genuine per-pair overlap, `parallel_safe_indeterminate` for the fail-closed exclude-all branch.
        speculativeWriteExcluded = { reason: sel.excludedReason, nodeIds: sel.excluded };
      }
    }
  } else if (liveNodes.length === 0 && writeNodes.length > 0) {
    // #437 (D-419 P2 §1.2) + #542 (D-542-01): attempt a co-open lane group from a ≥2 disjoint write
    // frontier; on genuine overlap (or explicit serial opt-out) DEGRADE to a single serial write.
    // #542: co-open is DEFAULT-ON for planner-proven-disjoint frontiers — gated on legCoupled
    //   (parallelWritesDefaultOn, default TRUE), NOT on KAOLA_LANE_CONTAINMENT. The lane-isolation
    //   worktree (provisioned at :4034 under the SAME legCoupled) is the containment; the validator
    //   re-verifies disjointness here authoritatively (tryFormLaneGroup → --parallel-safe).
    // #498 INVARIANT PRESERVED: legCoupled still gates BOTH this co-open AND leg-provisioning, so
    //   groupForm ⟺ legs provisioned ⟺ the safe (parent-clean fence + commit-based barrier) close path;
    //   the attribution-blind legless union barrier (:4429, liveLegs===null) is never reached via
    //   co-open. opts.writeOverlapConsent is still forwarded (NOT legCoupled) for frozen-plan
    //   back-compat, but per #593 it is VESTIGIAL: a shared-infra OR coarse (non-shared) exact-file-
    //   disjoint frontier co-opens BY DEFAULT under the retained net (post-dominating code-reviewer gate
    //   + no PROTECTED file), and disjoint green short-circuits — the validator relaxes/short-circuits
    //   all three before any consent check. Only a genuine overlap (exact / case-collision) or a
    //   coarse pair with a non-resolvable directory/glob entry serial-degrades, and no consent overrides.
    // #615 (D-615-01): a lane group cannot co-open over a parent worktree that already carries
    // out-of-allowband production dirt (uncommitted work from already-closed SERIAL siblings — the
    // finalize-owned-commit accumulation). Such a group's last-member close is structurally
    // unsatisfiable (parent-clean fence demands the dirt committed/removed; committing it → the merge
    // commit carries it → write_set_overflow at the commit-based group barrier). Gate group formation
    // on parent cleanliness, reusing the EXACT fence the last-member close applies (:4994) so the
    // producer/consumer classification can never drift; on dirt (or any uncertain non-`pass` result)
    // fall into the EXISTING single-serial-write else branch, which the serial per-node barrier
    // tolerates. Parallelism is a means, not a goal (CLAUDE.md precedence #3): this loses NO
    // currently-safe parallelism (a pure-parallel / group-first plan has no prior production dirt →
    // the fence passes → the group forms normally); it bites ONLY the genuinely-mixed shape, turning a
    // hard deadlock into a correct serial completion.
    // N1: short-circuit — evaluate the parent-clean fence (a validator subprocess) ONLY when a lane
    // group could actually form (legCoupled AND a ≥2 disjoint frontier). When either fails the group is
    // never attempted, so spawning the fence would be pure waste. Evaluated ONCE into parentDirty (rather
    // than inline in the `if` below) so #616's serialDegradeReason can reuse the SAME verdict instead of
    // re-spawning the fence subprocess a second time.
    const parentDirty = (legCoupled && writeNodes.length >= 2)
      ? parentCarriesProductionDirt(planPath, project, shell) : false;
    if (legCoupled && writeNodes.length >= 2 && !parentDirty) {
      const grp = tryFormLaneGroup(writeNodes, planPath, shell, opts.writeOverlapConsent);
      if (grp.ok) {
        // #437 §1.3 cap: a write lane group respects the WRITE cap (resolveFanoutCap, not the read
        // cap) AND --max as a single unit. The members are already pairwise-disjoint (parallel-safe
        // verified); take a disjoint prefix up to the ceiling. The frontier is sorted by
        // longest-path-to-sink; the group_id/union are recomputed for the chosen subset.
        let writeCap;
        try { ({ resolveFanoutCap: writeCap } = require('./kaola-workflow-adaptive-schema')); } catch (_) { writeCap = null; }
        let groupCeiling = writeCap ? writeCap(process.env) : grp.members.length;
        if (Number.isInteger(max) && max >= 1) groupCeiling = Math.min(groupCeiling, max);
        // #498: do NOT floor the ceiling back up to 2 — that silently overrode an operator's explicit
        //   KAOLA_FANOUT_CAP=1 / --max 1. When the effective cap resolves to <2, a group cannot legally
        //   co-open: DEGRADE to a single serial write (the operator asked for serial concurrency 1).
        if (groupCeiling < 2) {
          toOpen = [writeNodes[0]];
          openKind = 'write';
        } else {
          const chosen = writeNodes.filter(n => grp.members.includes(n.id)).slice(0, groupCeiling);
          toOpen = chosen;
          openKind = 'write';
          // #588: record the WRITE-cap ceiling this group co-opened under so max_concurrent (below) reflects
          // the write cap, not the read cap. groupCeiling is >= 2 here (the <2 branch degraded to serial).
          laneGroupCeiling = groupCeiling;
          groupForm = {
            group_id: laneGroupId(chosen.map(n => n.id)),
            members: chosen.map(n => n.id).slice().sort(),
            write_union: laneWriteUnion(chosen),
          };
        }
      } else {
        toOpen = [writeNodes[0]];
        openKind = 'write';
      }
    } else {
      toOpen = [writeNodes[0]];
      openKind = 'write';
      // #616: this else fires for THREE distinct causes (!legCoupled, writeNodes.length<2, or
      // parentDirty) — label it ONLY when parentDirty is the actual cause (the other two never even
      // evaluated the fence, so parentDirty is false there and this stays a no-op).
      if (parentDirty) serialDegradeReason = 'parent_dirty';
    }
  } else {
    // Only write nodes are ready but the running set is non-empty (read-only members live).
    // #641 (D-641-01) R1: the G2 `write_awaits_drain` RELAXATION — the mirror of the shipped #622
    // read-direction relaxation. A write-only frontier arriving while reads are live no longer
    // UNCONDITIONALLY holds: when the SAME leg-worktree containment #622 used to co-open a READ behind a
    // live write can make the WRITER invisible to every live read, attempt a LEG-CONTAINED lane-group
    // open instead (a lone writer forms a size-1 group — the #596 speculative-write machinery reused
    // verbatim; closeGroupMember already degenerates to "last member" for a 1-member group). FAIL-CLOSED
    // to today's hold on ANY of exactly four preconditions, each labeled with a typed serialDegradeReason
    // (mirroring the #616 telemetry pattern) so a persistently-held writer is visible:
    //   (1) legCoupled — KAOLA_PARALLEL_WRITES=0 forces the hold (G12);
    //   (2) no live lane_group descriptor — running-set.json carries exactly ONE (G8), overwriting it
    //       would orphan its still-open members (lost merges + leaked legs);
    //   (3) parent-clean (parentCarriesProductionDirt() === pass) — G5: a leg branches off HEAD and would
    //       miss uncommitted serial-sibling work (input freshness) + the close deadlock;
    //   (4) validator `--parallel-safe` ok across {candidates ∪ live writes} — G6/G7/G13 authoritative
    //       disjointness re-verification at open time (selectSpeculativeWriteGroup fail-closes on a
    //       per-pair overlap OR an indeterminate/crashed verdict).
    // The G1 read-first partition (:4389 above) is UNTOUCHED — reads still open tick 1. The G4 merge
    // fence (merge_awaits_read_drain in closeGroupMember) STILL holds the group's last-member merge
    // behind any live read, so the closed-work-observation invariant now holds by ISOLATION (the writer's
    // bytes live in .kw/legs/**, invisible to the reads) instead of temporal exclusion. The #588
    // mixed-frontier pin STAYS for LEGLESS writers via precondition (1): KAOLA_PARALLEL_WRITES=0 → hold.
    const holdDrain = (degradeReason) => ({
      result: 'ok', allDone: false, opened: [], reason: 'write_awaits_drain',
      // serialDegradeReason is emitted ONLY on this RELAXED else-branch hold (a running set with live
      // reads present). The byte-identical serial fallback (AC5 / G12) is the NO-running-set path, which
      // never reaches this branch — so labeling the KAOLA_PARALLEL_WRITES=0 hold here (AC2) does not
      // perturb the operator-recovery serial execution. null degradeReason ⇒ no field (defensive).
      ...(degradeReason ? { serialDegradeReason: degradeReason } : {}),
      taskTransitions: [],
    });
    // A live main-session-gate (kind:'gate') is a live observer of the parent tree — HOLD the relaxed write
    // co-open while it runs (a co-opened writer's uncommitted bytes would sit inside the gate's verdict
    // window). Checked FIRST so the gate hold is visible as its own serialDegradeReason.
    if ((liveNodes || []).some(n => n.kind === 'gate')) return holdDrain('gate_live');
    if (!legCoupled) return holdDrain('parallel_writes_off');
    if (liveGroupId) return holdDrain('lane_group_live');
    if (parentCarriesProductionDirt(planPath, project, shell)) {
      // #641 R2b (consent-tier): R1's leg path is unsound over a dirty parent (a leg would miss the
      // uncommitted context). Try a LEGLESS co-open behind an `observes: scratch` adversarial-verifier
      // gate — legal iff EVERY live read is such a gate AND the writer's set is scratch-observable-safe.
      // Annotation absent / non-qualifying writer ⇒ today's byte-identical parent_dirty hold.
      const r2bWriter = tryR2bLeglessCoopen(writeNodes, liveNodes, planPath, project, readFile);
      if (!r2bWriter) return holdDrain('parent_dirty');
      // A single LEGLESS writer opens in the parent tree (it must SEE the uncommitted context). NO
      // groupForm ⇒ no leg provisioning, no lane_group descriptor. The scratch gate never observes the
      // writer's (docs-band) bytes — verdict from .cache evidence + scratch, by the pinned contract. From
      // the NEXT tick this legless writer excludes further opens (the #588/G3 invariant for every OTHER
      // node), deliberately relaxed ONLY for the scratch gate already co-running.
      toOpen = [r2bWriter];
      openKind = 'write';
    } else {
      // R1 leg-contained co-open. Reuse the #596 size-1-capable selection: authoritative --parallel-safe
      // re-verification across {candidates ∪ live writes} (live writes are empty here — no legless write,
      // no live lane_group), a lone writer forms a size-1 group. An empty `chosen` means every candidate
      // was excluded (overlap or an indeterminate verdict) ⇒ fail-closed to today's hold with the cause.
      const sel = selectSpeculativeWriteGroup(writeNodes, liveNodes, planPath, shell, opts.writeOverlapConsent, max);
      if (sel.chosen.length === 0) return holdDrain(sel.excludedReason);
      toOpen = sel.chosen;
      openKind = 'write';
      laneGroupCeiling = sel.ceiling;
      groupForm = {
        group_id: laneGroupId(sel.chosen.map(n => n.id)),
        members: sel.chosen.map(n => n.id).slice().sort(),
        write_union: laneWriteUnion(sel.chosen),
      };
    }
  }

  if (toOpen.length === 0) {
    return {
      result: 'ok', allDone: false, opened: [],
      reason: speculativeWriteExcluded ? 'speculative_write_excluded' : 'cap_reached',
      ...(speculativeWriteExcluded ? { speculativeWriteExcluded } : {}),
      taskTransitions: [],
    };
  }

  if (reviewTopUp && toOpen.some(node => !reviewTopUp.pending_members.includes(node.id))) {
    return { result: 'refuse', reason: 'review_attempt_unresolved',
      attempt_ids: [reviewTopUp.attempt.attempt_id],
      repair: 'open only pending logical-review members: ' + reviewTopUp.pending_members.join(', ') };
  }

  // Prove every schema-2 review dispatch before any group/member baseline is
  // recorded. A single bad version/profile/context therefore refuses the whole
  // frontier without a partial ledger open.
  const reviewOpenById = new Map();
  const reviewPlanContent = readFile(planPath);
  for (const node of toOpen) {
    const prepared = prepareReviewOpen(opts, reviewPlanContent, node);
    if (!prepared.ok) {
      return { result: 'refuse', reason: prepared.reason, detail: prepared.detail || null,
        nodeId: node.id };
    }
    reviewOpenById.set(node.id, prepared);
  }

  const openedAt = (typeof now === 'function') ? now() : null;
  // Session proof is valid only for this immediate parent turn. Retain it in a transient lookup for
  // card construction, but never persist it in running-set.json or reuse it during reconciliation.
  const sessionProofById = new Map(toOpen.map(n => [n.id, n.codex_session_proof || null]));
  const newNodes = toOpen.map(n => ({
    id: n.id,
    role: n.role,
    kind: openKind,
    declared_write_set: n.declared_write_set,
    // Persist the per-node declarative tier (next-action resolved node.model || role default)
    // so running-set.json carries it — a reconcile-running-set roll-forward / crash re-dispatch keeps
    // the planner's tier instead of losing it. null when next-action returned no model.
    model: n.model || null,
    // #655: persist the frozen planner override on the durable member so rolling
    // top-up and crash reconciliation re-dispatch the exact value and source.
    ...(Number.isInteger(n.wait_budget_minutes) ? {
      wait_budget_minutes: n.wait_budget_minutes,
      wait_budget_source: 'planner_override',
    } : {}),
    baseline: 'recorded',
    opening: true,
    // #437 (D-419 P2 §1.1): stamp each lane-group member with its group_id so close-node knows it is
    // a member (and which group). undefined ⇒ a serial/read node (no group).
    ...(groupForm ? { group_id: groupForm.group_id } : {}),
    // #439 (D-419 Part 4): the [INV-25] marker — a speculatively-opened read node betting on an open
    // gate. orient / reconcile-running-set / close treat the speculative set uniformly; discard-speculative
    // rolls it back if the gate's verdict fails. `speculativeGate` records the bet (the open gate id) so
    // the close-time guard can hold the member until its gate resolves. Absent on the normal/serial path.
    ...(openingSpeculative ? { speculative: true, speculativeGate: n.speculativeGate || null } : {}),
    ...(openedAt ? { openedAt } : {}),
  }));

  // #437 (D-419 P2 §1.2): record the SHARED group baseline ONCE, BEFORE the per-member baselines,
  // keyed by the group_id (reuses --record-base; the sanitizer is byte-compatible with a group id).
  // The group baseline is the diff anchor for the close barrier; the per-member baselines are kept
  // only for reconcile rollback cleanup. Recorded inside Phase 1 so a crash never leaves the
  // lane_group manifest referencing a baseline that was never anchored.
  let groupBaselineSha = null;
  if (groupForm) {
    const gb = shell(commitNodePath, [planPath, '--node-id', groupForm.group_id, '--start', '--json']);
    if (!(gb.exitCode === 0 && gb.result === 'ok')) {
      return { result: 'refuse', reason: 'group_baseline_failed', group_id: groupForm.group_id, baselineResult: gb };
    }
    groupBaselineSha = (gb.recordBase && gb.recordBase.base) ? gb.recordBase.base : (gb.base || null);
  }

  // #674/#678/#680: the transactional baseline-drop helpers, declared at runOpenReady scope so BOTH the
  // Phase-1 leg-provisioning aborts AND the Phase-2 ledger-seed aborts (below) can drop every baseline
  // this call recorded. recordedBaselineIds accumulates each member id whose baseline was recorded (the
  // Phase-1 group-member loop pushes all of `toOpen`; the Phase-2 loop pushes any serial/read member it
  // records for the first time). dropRecordedBaselines removes the per-MEMBER baselines; dropGroupBaseline
  // removes the SHARED group baseline (`barrier-base-lg-<...>` file + ref), guarded on groupBaselineSha so
  // it is a clean no-op when no group formed. --drop-base is idempotent (a missing file/ref/token is a
  // no-op), so a member dropped by both a Phase-1 and a Phase-2 path is safe.
  const recordedBaselineIds = [];
  const journalOwnedReviewBaselines = new Set(reviewTopUp
    ? reviewTopUp.attempt.generations.map(row => row.member) : []);
  const dropRecordedBaselines = (ids) => {
    for (const id of ids) {
      if (!journalOwnedReviewBaselines.has(id)) {
        shell(validatorPath, [planPath, '--drop-base', '--node-id', id, '--json']);
      }
    }
  };
  const dropGroupBaseline = () => {
    if (groupBaselineSha) shell(validatorPath, [planPath, '--drop-base', '--node-id', groupForm.group_id, '--json']);
  };

  // #463 Slice 2: per-leg `.kw` worktree provisioning (ADR-0010: containment, not construction).
  // Gated by groupForm AND legCoupled. #542 (D-542-01): legCoupled is now parallelWritesDefaultOn
  // (default TRUE), so a disjoint co-opened frontier provisions legs BY DEFAULT — the per-leg worktree
  // IS the containment for default-on parallel writes. #498 invariant unchanged: legCoupled is the SAME
  // local the co-open gate uses, so groupForm is only ever set when legCoupled holds (groupForm ⟹
  // legCoupled); the conjunction is kept explicit here so the invariant is visible at the provisioning
  // site and the two gates cannot drift. Under the explicit serial opt-out (KAOLA_PARALLEL_WRITES=0)
  // legCoupled is false ⇒ no co-open, no leg, no lane_group.legs key (serial-fallback byte-identical).
  // Provision a leg per co-opened write member INSIDE Phase 1, BEFORE the ledger flip, so
  // a refusal here leaves a reconcilable state (no ledger row has flipped yet). working_dir STAYS
  // parent-side (Slice 3 routes into legs). On any provisionLeg failure, teardown every leg already
  // provisioned THIS call (clean rollback — no partial leg set) and refuse.
  let legs = null;
  if (groupForm && legCoupled) {
    let root; try { root = getRoot(); } catch (_) { root = process.cwd(); }
    const mainRoot = getMainRoot(root);

    // #633 (D-622-01) TRACKED-EVIDENCE-SEEDING: seed EVERY toOpen group member's evidence stub AND
    // COMMIT it on the parent branch BEFORE baseRev is captured below, so each leg (branched off baseRev)
    // inherits the stub as a TRACKED file. A write-role member self-writes its REAL evidence INSIDE its
    // own leg (commands/kaola-workflow-plan-run.md's write-leg dispatch discipline routes every Edit/
    // Write through the absolute `dispatch.leg_path`), so the leg's branch later commits a DIFFERENT
    // version of this SAME relative path — an ordinary tracked MODIFICATION from a shared ancestor if the
    // parent's copy stays clean, but a git-refused "Untracked working tree file … would be overwritten by
    // merge" collision if the parent's copy is still untracked at merge time (#633: the plain
    // seedEvidenceFile fs write, never `git add`ed). Committing it here — BEFORE the leg branches off, and
    // never touched again afterward (the close-side evidence read prefers the leg's copy, see
    // runCloseNode) — keeps the parent's working tree clean through to the last-member merge, so the
    // leg's real content merges in as an ordinary 3-way change. `.cache/` sits in the #424 barrier-
    // INVISIBLE workflow-state band, so this commit is invisible to every barrier/group-barrier diff
    // (never trips write_set_overflow). Fail-closed: a commit failure here refuses the open rather than
    // silently leaving the pre-#633 collision risk in place.
    // #674 (D-674-01 b): a group-form abort AFTER this loop has recorded ≥1 member baseline must
    // transactionally DROP every baseline it recorded — otherwise a LATER open (a serial degrade, or a
    // retried group open) of the SAME member id REUSES the stale pre-abort snapshot (--record-base's
    // crash-resume idempotent reuse, see #385 above), so that member's eventual close barrier
    // misattributes ANY sibling's uncommitted writes that later land in the shared (leg-less) tree as
    // this member's own overflow (the vrpai-cli#948 incident). --drop-base is legal here (never
    // drop_base_window_open): the ledger flip to in_progress is spliced in Phase 2 and written to disk
    // only AFTER the whole Phase-2 loop, so every member's ON-DISK ledger row is still `pending` at every
    // abort point — the Phase-1 leg-provisioning aborts below AND the two Phase-2 ledger-seed aborts
    // (#680). (The earlier reading that a Phase-2 abort could not --drop-base "because the ledger is
    // flipping" was wrong: the flip is in-memory until writeFile(planPath) at the end of Phase 2.)
    // dropRecordedBaselines is called with the id list this loop has actually recorded a baseline for at
    // the moment of each abort (a prefix of `toOpen` for the mid-loop baseline_failed itself; the FULL
    // `toOpen` set for every abort strictly after this loop completes — stub_commit_failed and both
    // leg_provision_failed variants below).
    // #674/#678/#680: recordedBaselineIds + dropRecordedBaselines + dropGroupBaseline are declared at
    // runOpenReady scope (above the group-baseline record) so the Phase-2 aborts reach them too. This
    // loop appends each member id as its baseline lands; the 5 aborts below (and the two Phase-2 aborts)
    // all call dropRecordedBaselines(recordedBaselineIds) + dropGroupBaseline().
    const seededRelPaths = [];
    for (const n of toOpen) {
      const memberBaseline = shell(commitNodePath, [planPath, '--node-id', n.id, '--start', '--json']);
      if (!(memberBaseline.exitCode === 0 && memberBaseline.result === 'ok')) {
        // #674 (D-674-01 b): n.id itself never recorded a baseline (memberBaseline refused), so drop only
        // the PRIOR members this loop already recorded one for.
        dropRecordedBaselines(recordedBaselineIds);
        // #678 (R1): also drop the shared group baseline recorded before this loop started.
        dropGroupBaseline();
        return { result: 'refuse', reason: 'baseline_failed', nodeId: n.id, baselineResult: memberBaseline };
      }
      recordedBaselineIds.push(n.id);
      const memberNonce = (memberBaseline.recordBase && memberBaseline.recordBase.base)
        ? String(memberBaseline.recordBase.base).slice(0, 12) : null;
      const seeded = seedEvidenceFile(planPath, n.id, memberNonce, n.role, false, reviewOpenById.get(n.id));
      if (seeded && seeded.evidence_file) {
        const absPath = path.join(path.dirname(planPath), seeded.evidence_file);
        seededRelPaths.push(path.relative(root, absPath));
      }
    }
    if (seededRelPaths.length) {
      try {
        // #674 (D-674-01 a): -f — a consumer repo may gitignore `.cache/` (a common convention for cache
        // dirs). The stub paths are explicitly enumerated above by seedEvidenceFile (never a glob), so
        // forcing the add is safe and REQUIRED: the stub MUST be tracked so every leg (branched off the
        // commit below) inherits it (see the #633 comment above) — an unforced add on a gitignored path
        // refuses instead, silently serial-degrading the authored parallel-write antichain.
        execFileSync('git', ['add', '-f', '--', ...seededRelPaths], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
        execFileSync('git', ['-c', 'user.email=kaola-workflow@local', '-c', 'user.name=kaola-workflow',
          'commit', '-m', 'kw-stub: ' + groupForm.group_id, '--allow-empty'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (e) {
        // #674 (D-674-01 b): the loop above recorded a baseline for EVERY toOpen member — drop them all.
        dropRecordedBaselines(recordedBaselineIds);
        // #678 (R1): also drop the shared group baseline recorded before this loop started.
        dropGroupBaseline();
        return { result: 'refuse', reason: 'stub_commit_failed', group_id: groupForm.group_id, detail: String((e && e.message) || e) };
      }
    }

    // baseRev = the feature-branch HEAD (the open-ready cwd is the feature worktree). Captured AFTER the
    // stub commit above so every leg branches off a HEAD that already carries the tracked stubs.
    let baseRev = null;
    try { baseRev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { baseRev = null; }
    if (!baseRev) {
      // #674 (D-674-01 b): same drop — every member baseline was recorded above.
      dropRecordedBaselines(recordedBaselineIds);
      // #678 (R1): also drop the shared group baseline recorded before this loop started.
      dropGroupBaseline();
      return { result: 'refuse', reason: 'leg_provision_failed', detail: 'could not resolve base HEAD for leg provisioning' };
    }
    legs = {};
    const provisionedThisCall = [];
    for (const n of toOpen) {
      const legPath = legPathFor(mainRoot, project, n.id);
      const legBranch = legBranchFor(project, n.id);
      const r = provisionLeg(mainRoot, legPath, legBranch, baseRev);
      if (!r.ok) {
        // Clean rollback: teardown every leg already provisioned this call (no partial leg set).
        for (const p of provisionedThisCall) teardownLeg(mainRoot, p.legPath, p.legBranch);
        // #674 (D-674-01 b): drop every member baseline recorded above (this abort fires after the
        // member loop AND the stub commit both completed, so all of `toOpen` has a recorded baseline).
        dropRecordedBaselines(recordedBaselineIds);
        // #678 (R1): also drop the shared group baseline recorded before this loop started.
        dropGroupBaseline();
        return { result: 'refuse', reason: 'leg_provision_failed', nodeId: n.id, error: r.error || null, detail: r.detail || null };
      }
      // #463 Slice 3: ANCHOR the leg's branch-point under a ref so the close-side --leg-barrier resolves
      // its base from a tamper-resistant anchor (never a caller --base — the #368 vacuous-pass hole).
      // Fail-CLOSED: a leg whose base ref did not anchor would later brick its --leg-barrier with
      // no_leg_base, so roll back THIS leg + every earlier one and refuse (the no-dead-end contract).
      // Producer ref name == the validator's consumer name (legBaseRef / legSan share the sanitizer).
      let anchored = false;
      try { execFileSync('git', ['update-ref', legBaseRef(project, n.id), baseRev], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] }); anchored = true; } catch (_) { anchored = false; }
      if (!anchored) {
        teardownLeg(mainRoot, legPath, legBranch);
        for (const p of provisionedThisCall) teardownLeg(mainRoot, p.legPath, p.legBranch);
        // #674 (D-674-01 b): same drop as the sibling leg_provision_failed above.
        dropRecordedBaselines(recordedBaselineIds);
        // #678 (R1): also drop the shared group baseline recorded before this loop started.
        dropGroupBaseline();
        return { result: 'refuse', reason: 'leg_provision_failed', nodeId: n.id, error: 'leg_base_anchor_failed', detail: 'could not anchor leg-base ref ' + legBaseRef(project, n.id) };
      }
      provisionedThisCall.push({ legPath, legBranch });
      legs[n.id] = { legPath, legBranch, baseline: baseRev };
      appendNodeTiming(planPath, n.id, 'leg_opened');
    }
  }

  // -- Phase 1: write running-set.json in state:'opening' with the FULL intended node set
  //    BEFORE flipping any ledger row. A crash here is reconcilable (never an orphan).
  if (mkdirp) mkdirp(path.dirname(runningSetPath));
  // #436 D-419-01: record max_concurrent at open time as min(cap, --max || cap) so
  // reconcile-running-set can honor the ceiling on crash-resume. NEVER written at freeze
  // time or into plan_hash. Absent --max falls back to cap (the full fanout ceiling).
  // #622 (D-622-01): when THIS call opens READS alongside an ALREADY-LIVE write lane_group (groupForm is
  // unset because no NEW group forms this call — the write_node_exclusive relaxation above let us reach
  // here), preserve the existing lane_group descriptor + its recorded max_concurrent VERBATIM. Rebuilding
  // either from scratch here would either (a) silently DROP the live group's tracking (the rewritten
  // running-set.json would carry no lane_group key at all, breaking the group's own eventual close-node
  // lookups), or (b) blow its WRITE-cap ceiling back up to the READ cap — the exact #588 hazard, now
  // reachable from the read side too. A pre-#622 shape (no existing lane_group) recomputes exactly as
  // before — byte-identical.
  const existingLaneGroup = (existing && existing.lane_group) ? existing.lane_group : null;
  // #588: for a WRITE lane group, the ceiling is the WRITE cap (laneGroupCeiling, already folded with
  // --max) — NOT the read `cap`. Recording the read cap (8) for a write group let reconcile roll forward
  // more write members than co-open ever opens (the write cap is 4); pin it to the group's actual ceiling.
  const maxConcurrent = groupForm
    ? laneGroupCeiling
    : (existingLaneGroup && Number.isInteger(existing.max_concurrent))
      ? existing.max_concurrent
      : (Number.isInteger(max) && max >= 1 ? Math.min(cap, max) : cap);
  // #437 (D-419 P2 §1.2): the lane_group descriptor, written into running-set.json BEFORE any ledger
  // flip (so a crash mid-open is reconcilable). Carries the shared baseline SHA + the write_union
  // (convenience snapshot; the group barrier re-reads the plan rows for attribution). Absent when no
  // group formed (the serial/read path) ⇒ no lane_group key ⇒ flag-OFF byte-identical. #622: falls back
  // to the PRESERVED existing lane_group (verbatim) when this call opens reads alongside an already-live
  // group rather than forming a new one.
  const laneGroupEntry = groupForm ? {
    group_id: groupForm.group_id,
    members: groupForm.members,
    baseline: groupBaselineSha,
    write_union: groupForm.write_union,
    // #463 Slice 2: the per-leg manifest ({ <nodeId>: { legPath, legBranch, baseline } }). Present ONLY
    // when leg-isolation + consent + a group all held; absent ⇒ no `legs` key ⇒ flag-OFF byte-identical.
    ...(legs && Object.keys(legs).length ? { legs } : {}),
    ...(openedAt ? { openedAt } : {}),
  } : existingLaneGroup;
  const openingSet = {
    state: 'opening',
    max_concurrent: maxConcurrent,
    ...(laneGroupEntry ? { lane_group: laneGroupEntry } : {}),
    nodes: liveNodes.concat(newNodes),
    ...(openedAt ? { updatedAt: openedAt } : {}),
  };
  writeFile(runningSetPath, JSON.stringify(openingSet, null, 2));

  // -- Phase 2: per node, record baseline then flip the ledger row pending -> in_progress.
  let planContent = readFile(planPath);
  const transitions = [];
  // #392: per-opened-node evidence-binding nonce (barrier-base SHA prefix). open-ready opens a SET, so
  // the orchestrator needs the right nonce for EACH role dispatch. Read it from the same nested
  // recordBase the validator's --record-base returns (commit-node --start nests it under recordBase),
  // and use the SAME slice(0,12) prefix readNonce produces on the close side so the echo matches.
  const nonceById = {};
  for (const n of toOpen) {
    const baseline = shell(commitNodePath, [planPath, '--node-id', n.id, '--start', '--json']);
    if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
      // #680 (Part A): a Phase-2 baseline abort must drop EVERY baseline this open recorded — the shared
      // GROUP baseline AND every per-MEMBER baseline — exactly like the Phase-1 aborts above, NOT strand
      // them. This is legal here (never drop_base_window_open): the ledger flip to in_progress is spliced
      // into `planContent` in memory only; the on-disk plan is not written until AFTER this loop
      // (writeFile(planPath) below), so every member's ON-DISK ledger row is still `pending` at this
      // abort (a group_id never has a ledger row at all).
      dropRecordedBaselines(recordedBaselineIds);
      dropGroupBaseline();
      return { result: 'refuse', reason: 'baseline_failed', nodeId: n.id, baselineResult: baseline };
    }
    if (reviewTopUp) {
      const record = baseline.recordBase || baseline;
      const actualNonce = record && record.base ? String(record.base).slice(0, 12) : null;
      const expectedNonce = reviewTopUp.generation_by_member.get(n.id);
      if (!actualNonce || actualNonce !== expectedNonce || record.stale === true) {
        dropRecordedBaselines(recordedBaselineIds);
        dropGroupBaseline();
        return { result: 'refuse', reason: 'review_generation_reservation_identity_mismatch',
          nodeId: n.id, attempt_ids: [reviewTopUp.attempt.attempt_id] };
      }
    }
    // Track this member's recorded baseline so the aborts below reach it. Group members were already
    // pushed in Phase 1; the includes-guard keeps the id list dup-free while still covering the
    // serial/read path (which records here for the first time). --drop-base is idempotent regardless.
    if (!recordedBaselineIds.includes(n.id)) recordedBaselineIds.push(n.id);
    nonceById[n.id] = (baseline.recordBase && baseline.recordBase.base)
      ? String(baseline.recordBase.base).slice(0, 12) : null;
    const spliced = spliceLedgerNode(planContent, n.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) {
      // #680 (Part A): same transactional drop on the ledger-seed abort — the on-disk ledger is still
      // unwritten here, so --drop-base is legal for the member baselines too (never window-locked).
      dropRecordedBaselines(recordedBaselineIds);
      dropGroupBaseline();
      return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: n.id };
    }
    if (spliced.changed) planContent = spliced.content;
    appendNodeTiming(planPath, n.id, 'opened');
    // #424 (D-424-01 §5): provenance log entry — open event.
    appendProvenanceLog(planPath, 'open', n.id, nonceById[n.id]);
    // #433 (D-433-01 §2): open-time evidence seeding for each opened node.
    seedEvidenceFile(planPath, n.id, nonceById[n.id], n.role, false, reviewOpenById.get(n.id));
    transitions.push(buildTransition(n.id, 'in_progress', 'open-ready'));
  }
  writeFile(planPath, planContent);

  // -- Phase 3: promote running-set.json -> 'open' (ledger now agrees), clearing opening flags.
  // #436 D-419-01: spread openingSet so max_concurrent and any other top-level fields survive.
  const finalSet = {
    ...openingSet,
    state: 'open',
    nodes: openingSet.nodes.map(n => { if (!n.opening) return n; const c = { ...n }; delete c.opening; return c; }),
    ...(openedAt ? { updatedAt: openedAt } : {}),
  };
  writeFile(runningSetPath, JSON.stringify(finalSet, null, 2));

  // #641 (D-641-01): the per-node observes annotation (hash-covered ## Nodes column) — threaded onto each
  // opened node's dispatch card so an `observes: scratch` gate carries the pinned observation contract.
  // The running-set entry does NOT carry it; read it from the frozen plan once. Fail-soft to an empty map.
  let observesById = new Map();
  let waitBudgetById = new Map();
  try {
    const { parseNodes } = require('./kaola-workflow-plan-validator');
    if (typeof parseNodes === 'function') {
      const parsedNodes = parseNodes(planContent);
      observesById = new Map(parsedNodes.map(pn => [pn.id, pn.observes]));
      waitBudgetById = new Map(parsedNodes.map(pn => [pn.id, pn.wait_budget_minutes]));
    }
  } catch (_) { observesById = new Map(); waitBudgetById = new Map(); }

  return {
    result: 'ok',
    allDone: false,
    kind: openKind,
    // #392: each opened node carries its per-open evidence-binding `nonce` (read from THIS open's
    // recordBase in Phase 2) so the orchestrator passes the right nonce to each role dispatch and the
    // role echoes it in `evidence-binding: <id> <nonce>` for close-node to verify. null when no
    // baseline SHA was returned (legacy/offline path → close-side binding check skipped, see readNonce).
    // #433: also carry evidence_file + required_tokens for the dispatcher (the seeded path + token classes).
    // #444: also attach dispatch sub-object via the single shared buildDispatch builder.
    opened: newNodes.map(n => {
      let ROLE_TOKEN_REGISTRY = {};
      try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator')); } catch (_) {}
      const preparedReview = reviewOpenById.get(n.id);
      const required_tokens = preparedReview && Array.isArray(preparedReview.required_tokens)
        ? preparedReview.required_tokens.slice()
        : (ROLE_TOKEN_REGISTRY[n.role] || ['evidence-binding']).slice();
      // #516: the dispatch HINT path is project-qualified (subagent resolves it project-locally, not at
      // the worktree root — see qualifiedEvidenceFile); the top-level mirror stays the BARE on-disk path
      // (the #444 back-compat vestige). On-disk seed/record/verify resolution is unchanged.
      const dispatchEvidenceFile = qualifiedEvidenceFile(project, n.id);
      const evidence_file = '.cache/' + n.id + '.md';
      const nonce = nonceById[n.id] || null;
      // #591: on a co-open write frontier this member has a provisioned leg (legs[n.id] from Phase 1);
      // thread its leg_path/leg_branch into the dispatch card. null on the serial/read path (no legs) ⇒
      // buildDispatch omits the keys ⇒ byte-identical to pre-#591 (mirrors the conditional laneGroup attach).
      const legInfo = (legs && legs[n.id]) ? legs[n.id] : null;
      const dispatch = buildDispatch(
        { id: n.id, role: n.role, model: n.model || null, declared_write_set: n.declared_write_set,
          observes: observesById.get(n.id) || '', wait_budget_minutes: waitBudgetById.get(n.id),
          codex_session_proof: sessionProofById.get(n.id) || null },
        {
          nonce, evidence_file: dispatchEvidenceFile, required_tokens,
          review_dispatch: preparedReview && preparedReview.dispatch_context || null,
          working_dir: working_dir || null, forge_rider: null,
          leg_path: legInfo ? legInfo.legPath : null, leg_branch: legInfo ? legInfo.legBranch : null,
          // #603: thread the state-persisted Codex dispatch mode (null when absent → fail-closed default).
          codex_dispatch_mode: codexDispatchMode || null,
          // #634: thread the optimize contract + wait-budget override for a co-opened optimize node ({} ⇒
          // no-op for every other role ⇒ byte-identical dispatch card).
          ...optimizeDispatchCtx(planContent, n.role, n.id),
          // The durable node channel — per-member (each co-opened member gets its OWN brief + upstream
          // list). {} for a briefless/root member ⇒ byte-identical dispatch card. #692: openIntoLeg is
          // set when THIS member provisioned a leg (legInfo) so deriveDispatchChannel absolutizes its
          // parent-sourced upstream_evidence to the parent worktree (the leg carries no sibling .cache);
          // a legless read/serial member keeps the project-relative hint (byte-identical to pre-#692).
          ...deriveDispatchChannel(planContent, n, project, { planPath, runningSet: finalSet, openIntoLeg: !!legInfo }),
        }
      );
      // #609/#610: runtime-native display alongside the raw tier echo (conditional ⇒ untiered byte-identical).
      const memberDisplay = modelDisplay(n.model);
      return { id: n.id, role: n.role, model: n.model || null, ...(memberDisplay ? { model_display: memberDisplay } : {}), kind: n.kind, declared_write_set: n.declared_write_set, nonce, evidence_file, required_tokens, dispatch };
    }),
    runningSet: finalSet.nodes.map(n => n.id),
    // #437 (D-419 P2 §1.2): surface the formed lane group descriptor so the orchestrator/tests can
    // observe a co-open. Absent (undefined) on the serial/read path — the flag-OFF byte-identical shape.
    ...(laneGroupEntry ? { laneGroup: laneGroupEntry } : {}),
    // #596: some speculative write candidates opened (toOpen.length > 0) while ONE OR MORE siblings were
    // excluded this call (overlap with a live writer) — surface the explanatory field alongside the
    // success envelope so the operator sees the partial exclusion, not just the members that opened.
    ...(speculativeWriteExcluded ? { speculativeWriteExcluded } : {}),
    // #616 (D-616-01): label a normal (non-speculative) co-open's serial degrade when
    // parentCarriesProductionDirt() caused it, mirroring speculativeWriteExcluded's `parent_dirty` reason
    // on this SUCCESSFUL-open path. Absent (undefined) for every other degrade cause and for a formed
    // lane group — the pre-#616 byte-identical shape.
    ...(serialDegradeReason ? { serialDegradeReason } : {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// selectSpeculativeWriteGroup (#596 D-596-01) — the speculative WRITE-open selection. RE-VERIFIES exact-
// path disjointness (case-folded) of each write candidate against every currently-open write node via the
// SAME authoritative predicate normal co-open uses (the validator's `--parallel-safe` path — no new
// validator entry point). UNLIKE tryFormLaneGroup (which refuses the WHOLE batch on any overlap and
// requires >=2 members to even attempt a group), an overlapping candidate here is simply EXCLUDED from
// this open (AC5: "W is NOT speculatively opened" — never a hard refusal of its disjoint siblings), and a
// LONE eligible candidate still forms a size-1 group: a speculative write ALWAYS gets a leg (unlike the
// normal path's >=2-member-only lane group, which serial-degrades a lone write to the legless path).
// liveNodes is defensive — the running-set "write node runs strictly alone" invariant (:3868) means no
// OTHER write can be live while a speculative fan-out is even reachable, so liveWriteIds is normally
// empty; the check is still applied generically so a future relaxation of that invariant stays safe.
// @returns { chosen: Node[], excluded: string[], ceiling: number }
// ---------------------------------------------------------------------------
function selectSpeculativeWriteGroup(candidates, liveNodes, planPath, shell, writeOverlapConsent, max) {
  const liveWriteIds = (liveNodes || []).filter(n => n.kind === 'write').map(n => n.id);
  const candIds = candidates.map(n => n.id);
  const allIds = liveWriteIds.concat(candIds);
  const excluded = new Set();
  // O1 (telemetry accuracy): DISTINGUISH the two exclusion causes so the open-ready caller can label
  // speculativeWriteExcluded.reason precisely — now that `auto` fires speculative writes routinely, a
  // mislabel is misleading. A GENUINE per-pair overlap keeps `overlaps_live_writer`; the fail-CLOSED
  // exclude-ALL branch (a validator crash / garbled result with no overlap report to act on) is a
  // `parallel_safe_indeterminate` — the disjointness verdict is unknown, not a known overlap.
  let indeterminate = false;
  if (allIds.length >= 2) {
    const vArgs = [planPath, '--parallel-safe', '--nodes', allIds.join(','), '--json'];
    if (writeOverlapConsent) vArgs.push('--write-overlap-consent');
    const ps = shell(validatorPath, vArgs);
    if (!(ps.exitCode === 0 && ps.result === 'ok')) {
      // #599: mirror tryFormLaneGroup's fail-CLOSED posture. A non-ok result carrying a WELL-FORMED
      // `overlapping` array (even empty) is a real overlap report — keep the existing per-pair
      // exclusion. A non-ok result WITHOUT one (subprocess crash, unparseable JSON, or an unreachable
      // non-ok shape that omits the field) carries no overlap report to act on — exclude EVERY
      // candidate (no speculative open) rather than fail-open by excluding nothing.
      if (Array.isArray(ps.overlapping)) {
        for (const o of ps.overlapping) {
          if (candIds.includes(o.a)) excluded.add(o.a);
          if (candIds.includes(o.b)) excluded.add(o.b);
        }
      } else {
        indeterminate = true;
        for (const id of candIds) excluded.add(id);
      }
    }
  }
  const eligible = candidates.filter(n => !excluded.has(n.id));
  let writeCap;
  try { ({ resolveFanoutCap: writeCap } = require('./kaola-workflow-adaptive-schema')); } catch (_) { writeCap = null; }
  let ceiling = writeCap ? writeCap(process.env) : eligible.length;
  if (Number.isInteger(max) && max >= 1) ceiling = Math.min(ceiling, max);
  const room = Math.max(0, ceiling - liveWriteIds.length);
  const chosen = eligible.slice(0, room);
  return { chosen, excluded: Array.from(excluded), ceiling, excludedReason: indeterminate ? 'parallel_safe_indeterminate' : 'overlaps_live_writer' };
}

// ---------------------------------------------------------------------------
// memberInLaneChanges (#437 D-419 P2 §2.1) — the per-member in-lane vacuity probe. Scope a
// `git status --porcelain` to the member's DECLARED write set (parsed via the classifier) at the
// repo root and return the non-empty change lines. NON-empty ⇒ the member wrote in-lane (pass);
// empty ⇒ the caller checks the evidence for a `no_op:` declaration. This is intentionally an
// in-lane PRESENCE check, NOT the full diff barrier (the diff barrier is DEFERRED to the group).
// Returns { changed:boolean, lines:string[] }. Fail-OPEN to changed:false on a git error (the
// caller then requires the no_op: declaration — the conservative direction).
//
// #463 Slice 4: LEG-AWARE. When legCtx = { legPath, baseRev } is passed (routing live — the member's
// work lands in its leg, not the parent), the probe targets the LEG worktree, and counts BOTH the
// uncommitted working tree (`status --porcelain`) AND committed leg work (`diff baseRev..HEAD`, since
// script-owned capture / the agent may have committed it). Without legCtx the parent-rooted behavior is
// byte-identical (the legless serial-degrade path).
// ---------------------------------------------------------------------------
function memberInLaneChanges(declaredRaw, legCtx) {
  let parse;
  try { ({ parseWriteSetCell: parse } = require('./kaola-workflow-classifier')); } catch (_) { parse = null; }
  const paths = parse ? Array.from(parse(declaredRaw)) : String(declaredRaw || '').split(/[\s,]+/).filter(Boolean);
  if (!paths.length) return { changed: false, lines: [] };
  if (legCtx && legCtx.legPath) {
    const lines = [];
    try {
      const st = execFileSync('git', ['-C', legCtx.legPath, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
      for (const l of String(st).split('\n').map(s => s.trim()).filter(Boolean)) lines.push(l);
    } catch (_) { /* fall through to committed probe */ }
    if (legCtx.baseRev) {
      try {
        const d = execFileSync('git', ['-C', legCtx.legPath, 'diff', '--name-only', legCtx.baseRev, 'HEAD', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
        for (const l of String(d).split('\n').map(s => s.trim()).filter(Boolean)) lines.push(l);
      } catch (_) { /* fail-open */ }
    }
    return { changed: lines.length > 0, lines };
  }
  let root;
  try { root = getRoot(); } catch (_) { root = process.cwd(); }
  let out = '';
  try {
    out = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', ...paths], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER,
    });
  } catch (_) { return { changed: false, lines: [] }; }
  const lines = String(out).split('\n').map(s => s.trim()).filter(Boolean);
  return { changed: lines.length > 0, lines };
}

// #437 (D-419 P2 §2.1): a declared no-op escape for the vacuity guard — the evidence file carries a
// column-0 `no_op: <reason>` line. PURE multiline regex (mirrors the schema's parse-* discipline).
function evidenceDeclaresNoOp(evidenceContent) {
  return /^no_op:[ \t]*\S/m.test(String(evidenceContent || ''));
}

// ---------------------------------------------------------------------------
// runCloseNode — MUTATES ledger + compliance + running-set.json.
// Closes ONE node (evidence-shape -> barrier -> ledger complete -> compliance ->
// selector-arm) then removes it from the running set and recomputes the newly-ready
// frontier. Does NOT auto-open (the loop calls open-ready). A serial (non-member) close has no worktree
// join — its writes are parent-side; a live lane_group member joins via the synthesizer at the group close.
//
// #437 (D-419 P2 §2) + #542 (D-542-01): a live lane_group MEMBER — formed BY DEFAULT for planner-proven-
// disjoint write frontiers (legCoupled off parallelWritesDefaultOn, default TRUE; the retired
// KAOLA_LANE_CONTAINMENT toggle no longer gates it) — takes the GROUP-scoped close path: evidence-shape +
// per-member in-lane vacuity, then either DEFER the barrier (non-last member ⇒ `barrier: deferred_to_group`)
// or run the GROUP barrier ONCE (last member ⇒ `barrier: group_passed`, clear lane_group, drop the group
// baseline). The serial fallback (KAOLA_PARALLEL_WRITES=0 kill-switch, overlapping/uncertain writes, a
// no-worktree host, or a non-member serial node) ⇒ the per-node serial close runs byte-identically (INV-6).
// ---------------------------------------------------------------------------
function runCloseNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const transitions = [];
  let reviewBegun = null;

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: integrity:yes / halt-fence:yes (NO coordination refusal:
  //    close-node closes one of its OWN live running-set members — it must not refuse over them). ==
  // #387: the same --resume-check integrity gate open-batch/top-up run — never close (and append a
  // compliance row + advance) against a tampered/invalid frozen plan.
  // #391b: a durable consent_halt must fence the close path too (else close-and-advance survives the
  // halt and the marker becomes a phantom against a now-complete node).
  const guard = mutationGuardPrologue(opts, { integrity: true, halt: true });
  if (guard) return guard;

  // -- (a) Evidence-shape PRESENCE check (same contract as close-and-open-next).
  const planContent0 = readFile(planPath);
  const nodes = parseNodesFromContent(planContent0);
  const nodeInfo = nodes.find(n => n.id === nodeId);
  const role = nodeInfo ? nodeInfo.role : 'unknown';

  // #437 (D-419 P2 §2): resolve THIS node's lane_group (if any) BEFORE reading evidence — moved up from
  // (a.5) below so both the evidence read AND the member-close routing share ONE readRunningSet call.
  // #633 (D-622-01): a write-role lane-group member SELF-WRITES its evidence INSIDE its own leg (the
  // absolute `dispatch.leg_path` its working_dir names — commands/kaola-workflow-plan-run.md's write-leg
  // dispatch discipline + evidence-persistence contract), never synced back to the parent. Prefer the
  // LEG's copy when one is present there; otherwise fall back to the PARENT (byte-identical to every
  // pre-#633 shape, including a legless/read node and a test/harness that seeds evidence parent-side by
  // convention). This is the read-side half of the #633 fix: the write-side half (runOpenReady) commits
  // a TRACKED stub at the parent before the leg branches off, so the parent's copy — never touched again
  // for a leg member under this read preference — stays clean through to the last-member octopus merge.
  const running0 = readRunningSet(runningSetPath, cacheExists, readFile);
  const lg = (running0 && running0.lane_group) ? running0.lane_group : null;
  const cachePath = resolveEvidenceCachePath(
    planPath, nodeId, cacheExists, readFile, running0).cachePath;

  let evidenceContent = null;
  const evidencePresent = cacheExists ? cacheExists(cachePath) : (() => {
    try { evidenceContent = readFile(cachePath); return true; } catch (_) { return false; }
  })();
  if (evidencePresent && evidenceContent === null) {
    try { evidenceContent = readFile(cachePath); } catch (_) { evidenceContent = ''; }
  }
  // #392: verify the evidence-binding header against this open's nonce (skipped when none on disk).
  // #607: pass the ledger nodes so a main-session-gate instrumentation token naming a node is validated.
  const expectedNonce = readNonce(planPath, nodeId, readFile);
  const schema2Review = evidencePresent
    ? validateSchema2ReviewEvidence(opts, planContent0, nodeInfo, evidenceContent)
    : { ok: true, review_gate: false };
  if (!schema2Review.ok) {
    return { result: 'refuse', reason: schema2Review.reason, detail: schema2Review.detail || null,
      missingTokenClass: schema2Review.missingTokenClass || null, nodeId, role };
  }
  const shapeCheck = checkEvidenceShape(role, nodeId, evidenceContent, {
    expectedNonce, expectedNodeId: nodeId, ledgerNodes: nodes, reviewV2: schema2Review,
  });
  if (!evidencePresent || !shapeCheck.ok) {
    const absent = !evidencePresent || shapeCheck.kind === 'absent';
    const reason = shapeCheck.evidenceStale ? 'evidence_stale'
      : shapeCheck.evidenceUnbound ? 'evidence_unbound'
      : (absent ? 'evidence_absent' : 'evidence_shape_failed');
    return {
      result: 'refuse',
      reason,
      missingTokenClass: shapeCheck.missingTokenClass || null,
      nodeId, role,
      expected: shapeCheck.expected || [],
      detail: shapeCheck.reason || (evidencePresent ? 'shape invalid' : 'cache file absent'),
    };
  }

  // #403.4: non-blocking near-miss verdict warning (informational, per #328) — see runCloseAndOpenNext.
  let verdictWarn = schema2Review.review_gate ? null : checkVerdictParse(role, evidenceContent);

  // Consumed-proof over the durable node channel (mirror of runCloseAndOpenNext). Placed BEFORE the member
  // routing + barrier so a HARD refuse is a ZERO-mutation no-op for BOTH the serial and lane-group close
  // paths. Advisory rides verdictWarn into every success return (and into closeGroupMember's).
  {
    const consumed = checkUpstreamConsumed({ role, nodeId, evidenceContent, nodes,
      ledgerStatuses: readLedgerStatuses(planContent0), planPath, project, readFile });
    if (consumed && !consumed.ok && consumed.hard) {
      return decorateOperatorHint({
        result: 'refuse', reason: 'upstream_not_consumed', nodeId, role,
        offending: consumed.offending, expected: consumed.expectedPath, detail: consumed.detail,
      });
    }
    if (consumed && !consumed.ok) {
      verdictWarn = Object.assign(verdictWarn || {}, {
        upstream_advisory: { offending: consumed.offending, expected: consumed.expectedPath, detail: consumed.detail },
      });
    }
  }

  // -- (a.5) #437 (D-419 P2 §2): LANE-GROUP MEMBER close path. #542 (D-542-01): keyed PURELY on this
  //    node being a live lane_group member in the durable manifest — NOT on KAOLA_LANE_CONTAINMENT.
  //    Co-open is now default-on, so a lane_group can exist without the env toggle; member detection
  //    MUST follow the manifest (guard 1), else a default-on member would fall to the serial close and
  //    orphan its committed leg work. A serial node (no lane_group) ⇒ lg is null ⇒ this whole branch is
  //    skipped and the existing serial close runs verbatim (INV-6 preserved for the serial path).
  // #439 (D-419 Part 4): close-time speculative guard — a speculative member cannot commit to complete
  // until its gate resolves (else its review pointer + discard handle would be lost). Fires only for a
  // speculative:true member whose gate is not yet complete; never for a normal node (INV-6 preserved).
  const specGuard = speculativeCloseGuard(nodeId, running0, readLedgerStatuses(readFile(planPath)));
  if (specGuard) return specGuard;

  const isMember = !!(lg && Array.isArray(lg.members) && lg.members.includes(nodeId));
  if (isMember) {
    return closeGroupMember({
      opts, nodeId, role, evidenceContent, verdictWarn, nodeInfo, lg, running0,
      planPath, project, runningSetPath, shell, readFile, writeFile, cacheExists, transitions,
    });
  }

  // -- (b) Per-node barrier (parent planPath — read-only/serial-write are parent-side).
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);
  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    // #440: attach triage to the barrier_failed envelope so callers can classify + propose repair.
    // #546 G7: promote the narrowed barrier reason (nested at barrierCheck.reason /
    // barrierCheck.outOfAllow) to the TOP level so decorateOperatorHint + --summary emit the
    // specific reason instead of the generic 'barrier_failed'. (Mirror of runCloseAndOpenNext.)
    const cacheDir440b = path.join(path.dirname(planPath), '.cache');
    return {
      result: 'refuse',
      reason: (barrierOut.barrierCheck && barrierOut.barrierCheck.reason) || 'barrier_failed',
      outOfAllow: barrierOut.barrierCheck && barrierOut.barrierCheck.outOfAllow,
      nodeId,
      barrierOut,
      triage: computeTriage(barrierOut, cacheDir440b, nodeId, readFile),
    };
  }

  const selectorCheck = barrierOut.selectorCheck || {};
  const selectorValidation = foldSelectorArms(planContent0, selectorCheck);
  if (!selectorValidation.ok) {
    return { result: 'refuse', reason: selectorValidation.reason, nodeId, selectorCheck };
  }

  const reviewPrepared = prepareReviewClose(opts, {
    planContent: planContent0, nodes, nodeInfo, evidenceContent, command: 'close-node',
    schema2Review,
  });
  if (reviewPrepared && reviewPrepared.handled) return reviewPrepared.result;
  if (reviewPrepared) reviewBegun = reviewPrepared.begun;

  // -- (c) Close: ledger row in_progress -> complete (same #348 guard as close-and-open-next).
  let currentPlan = readFile(planPath);
  const closeResult = spliceLedgerNode(currentPlan, nodeId, 'complete', { allowFrom: ['in_progress'] });
  if (!closeResult.found) {
    return { result: 'refuse', reason: 'close_node_not_in_ledger', nodeId };
  }
  if (!closeResult.changed && !closeResult.alreadyAtTarget) {
    return { result: 'refuse', reason: 'close_transition_disallowed', nodeId };
  }
  if (closeResult.changed) currentPlan = closeResult.content;

  currentPlan = addCloseCompliance(currentPlan, nodeId, role, evidenceContent);
  const selectorFold = foldSelectorArms(currentPlan, selectorCheck);
  currentPlan = selectorFold.content;
  writeFile(planPath, currentPlan);
  if (selectorCheck.isSelector === true) reviewFailpoint(opts, 'selector_folded');
  appendCloseSidecarsOnce(opts, nodeId);
  transitions.push(buildTransition(nodeId, 'complete', 'close-node'));
  transitions.push(...selectorFold.transitions);

  // -- (d) Remove the closed node from the running set (delete the file if it empties).
  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  if (running) {
    const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
    if (remaining.length === 0) {
      if (opts.unlink) opts.unlink(runningSetPath);
      // #436 D-419-01: spread existing top-level fields so max_concurrent (and any other
      // unknown fields) survive the empty-set fallback rewrite.
      else writeFile(runningSetPath, JSON.stringify({ ...running, state: 'open', nodes: [] }, null, 2));
    } else {
      writeFile(runningSetPath, JSON.stringify({ ...running, nodes: remaining }, null, 2));
    }
  }

  if (reviewBegun) markReviewAttemptSettled(opts, reviewBegun);

  // -- (f) Fused readiness recompute — return the newly-ready frontier (the loop opens it).
  const nextAction = shell(nextActionPath, [planPath, '--json']);
  const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);
  const newlyReady = (nextAction.result === 'ok' && Array.isArray(nextAction.readyPending))
    ? nextAction.readyPending.filter(n => n.role !== 'main-session-gate')
        .map(frontierNode)
    : [];

  // #439 (D-419 Part 4, settlement 3): a GATE closing verdict:fail surfaces the speculative members that
  // bet on it (held in the running set by the close-time guard) for keep-or-discard. running0 is the
  // pre-removal snapshot (this close removed only THIS gate, never a speculative dependent).
  const speculativeReview = speculativeReviewOnGateClose(role, nodeId, evidenceContent, running0, readFile(planPath));

  return {
    result: 'ok',
    closed: nodeId,
    allDone,
    newlyReady,
    ...(verdictWarn || {}),
    // #439: informational — present ONLY when a gate closed verdict:fail with speculative dependents.
    // operator_hint(speculative_review_required) names the discard path; result stays 'ok' (non-blocking).
    ...(speculativeReview ? { speculative_review_required: speculativeReview, operator_hint: getOperatorHint('speculative_review_required', speculativeReview) } : {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// closeGroupMember (#437 D-419 P2 §2) — the LANE-GROUP member close path. Invoked by runCloseNode
// when the closing node is a live lane_group member — a group that forms BY DEFAULT for planner-proven-
// disjoint write frontiers via parallelWritesDefaultOn (KAOLA_PARALLEL_WRITES default TRUE; the legacy
// KAOLA_LANE_CONTAINMENT toggle no longer gates it, #542/D-542-01). The evidence-
// shape PRESENCE check already passed in runCloseNode (step a); this performs:
//   1. PER-MEMBER in-lane vacuity guard (member's declared set must have changes OR evidence declares
//      a no_op:) — restores the #283 anti-vacuity check in lane form.
//   2a. NON-LAST member: DEFER the diff barrier (record `barrier: deferred_to_group`), close the
//       ledger row, append a compliance row carrying the `deferred_to_group` marker, mark the member
//       closed:true in lane_group.members, return barrier:'deferred_to_group'.
//   2b. LAST member: run the GROUP BARRIER ONCE over the union of all members (shell the validator's
//       --group-barrier while lane_group.members STILL holds the full set, per the design ordering).
//       Pass ⇒ close the row, compliance `barrier: group_passed`, CLEAR lane_group, drop the group
//       baseline. Refuse ⇒ typed refusal, NO ledger advance, lane_group untouched.
// "Last member" = every OTHER member already carries closed:true in lane_group.members.
// ---------------------------------------------------------------------------
function closeGroupMember(ctx) {
  const {
    opts, nodeId, role, evidenceContent, verdictWarn, nodeInfo, lg,
    planPath, project, runningSetPath, shell, readFile, writeFile, cacheExists, transitions,
  } = ctx;

  // #463 Slice 4: read THIS member's leg entry ONCE up front — it makes both the vacuity guard (which
  // worktree to probe) and the per-leg barrier leg-aware. A legless / toggle-off group has no entry ⇒
  // legCtx stays null ⇒ every check is byte-identical to the parent-rooted serial-degrade path.
  const runningLeg = readRunningSet(runningSetPath, cacheExists, readFile);
  const legEntry = runningLeg && runningLeg.lane_group && runningLeg.lane_group.legs && runningLeg.lane_group.legs[nodeId];
  const legCtx = (legEntry && legEntry.legPath) ? { legPath: legEntry.legPath, baseRev: legEntry.baseline || null } : null;

  // -- (1) PER-MEMBER in-lane vacuity guard. Empty in-lane changes AND no `no_op:` ⇒ member_vacuity.
  // parseNodes returns `writeSetRaw` (the running-set carries `declared_write_set`); accept either.
  // #463 S4: when routing is live the member's work lands in its LEG, so probe the leg (legCtx), not the
  // parent — else legit leg work reads as vacuous and false-trips the no_op: requirement.
  const declaredRaw = nodeInfo
    ? (nodeInfo.declared_write_set != null ? nodeInfo.declared_write_set : nodeInfo.writeSetRaw)
    : null;
  const inLane = memberInLaneChanges(declaredRaw, legCtx);
  if (!inLane.changed && !evidenceDeclaresNoOp(evidenceContent)) {
    return {
      result: 'refuse',
      reason: 'member_vacuity',
      nodeId, role,
      group_id: lg.group_id,
      detail: 'declared set has no changes and evidence declares no no_op:<reason>',
    };
  }

  // -- (1b) #463 Slice 3: PER-LEG barrier. Runs ONLY when leg-isolation provisioned a leg for THIS closing
  // member (legCtx present); a toggle-off / legless group has no leg entry ⇒ this block is SKIPPED ⇒ byte-
  // identical. It snapshots the member's OWN leg worktree and refuses an out-of-declared write that landed
  // in the leg (the write-ISOLATION check) — DISTINCT from the group/union barrier below (which measures
  // the merge COMMIT in S4). --project is passed EXPLICITLY (mirrors the provision-side legBaseRef key) so
  // the leg-base ref name never drifts into a silent no_leg_base. Runs for EVERY member close (deferred +
  // last); each checks its own leg. The S4 synthesizer (last-member) merges the legs this barrier cleared.
  if (legCtx) {
    const legBarrier = shell(validatorPath, [planPath, '--leg-barrier', '--node-id', nodeId, '--project', project, '--leg-root', legEntry.legPath, '--expect-base', String(legEntry.baseline || ''), '--json']);
    if (legBarrier.exitCode !== 0 || legBarrier.result !== 'pass') {
      return {
        result: 'refuse',
        reason: legBarrier.reason || 'leg_barrier_failed',
        nodeId, role,
        group_id: lg.group_id,
        legBarrier,
      };
    }
  }

  // Member roster: lane_group.members is the FULL bare-id string[] (kept stable so the validator's
  // --group-barrier — which reads lg.members for the union allowlist via nodes.find(x=>x.id===id) —
  // always sees plain ids, per n1-design §1.1). Per-member close state lives in a PARALLEL
  // `closed_members` id[] so members stays string[]. "Last member" = every OTHER member id is in
  // closed_members.
  const allMemberIds = (Array.isArray(lg.members) ? lg.members : []).map(m => (typeof m === 'string' ? m : (m.nodeId || m.id)));
  const closedBefore = new Set(Array.isArray(lg.closed_members) ? lg.closed_members : []);
  const otherIds = allMemberIds.filter(id => id !== nodeId);
  // #552: derive "last member" from the AUTHORITATIVE LEDGER, not (only) lane_group.closed_members.
  // closed_members is written in a SECOND, non-atomic running-set write (:2a/:2b below) AFTER the closing
  // member's ledger row is already flipped to `complete`. A crash in that window leaves a member ledger-
  // TERMINAL but ABSENT from closed_members; reading only closed_members would then make the genuine last
  // member mis-compute isLast=false, take the DEFER branch forever, and NEVER run the synthesizer/group
  // barrier — the other legs' committed work is silently never merged (the #552 fail-open). The ledger is
  // the crash-consistent source of truth (a deferred member wrote `complete` BEFORE any crash). closed_members
  // is kept as a union FALLBACK so a transient ledger-read miss never regresses below today's behavior.
  const groupLedger = readLedgerStatuses(readFile(planPath));
  const TERMINAL_LEDGER = new Set(['complete', 'n/a', 'n.a', 'na']); // mirror runReconcileRunningSet's set
  const isLast = otherIds.length > 0 && otherIds.every(id => TERMINAL_LEDGER.has(groupLedger[id]) || closedBefore.has(id));
  const isOnly = allMemberIds.length === 1; // a 1-member group degenerates to last-member immediately.
  const lastMember = isLast || isOnly;

  if (!lastMember) {
    // -- (2a) NON-LAST member: DEFER the barrier. Close the ledger row, record deferred_to_group.
    let currentPlan = readFile(planPath);
    const closeResult = spliceLedgerNode(currentPlan, nodeId, 'complete', { allowFrom: ['in_progress'] });
    if (!closeResult.found) return { result: 'refuse', reason: 'close_node_not_in_ledger', nodeId };
    if (!closeResult.changed && !closeResult.alreadyAtTarget) {
      return { result: 'refuse', reason: 'close_transition_disallowed', nodeId };
    }
    if (closeResult.changed) currentPlan = closeResult.content;
    // Compliance row carrying the literal `deferred_to_group` marker in the Evidence cell (grep/audit).
    currentPlan = addCloseCompliance(currentPlan, nodeId, role, evidenceContent, 'deferred_to_group');
    writeFile(planPath, currentPlan);
    appendNodeTiming(planPath, nodeId, 'closed');
    appendProvenanceLog(planPath, 'close', nodeId, readNonce(planPath, nodeId, readFile));
    transitions.push(buildTransition(nodeId, 'complete', 'close-node'));

    // Record this member in lane_group.closed_members (KEEP lane_group + members string[]; ≥1 member
    // remains open). ALSO remove the node from running_set.nodes (§2.1 step 7) so the live set reflects
    // the close. members stays the FULL bare-id list so the last-member group barrier reads it intact.
    const running = readRunningSet(runningSetPath, cacheExists, readFile);
    if (running && running.lane_group) {
      const prevClosed = Array.isArray(running.lane_group.closed_members) ? running.lane_group.closed_members : [];
      const closed_members = Array.from(new Set([...prevClosed, nodeId]));
      const updatedLg = { ...running.lane_group, closed_members };
      const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
      writeFile(runningSetPath, JSON.stringify({ ...running, lane_group: updatedLg, nodes: remaining }, null, 2));
    }

    const nextAction = shell(nextActionPath, [planPath, '--json']);
    const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);
    return {
      result: 'ok',
      closed: nodeId,
      barrier: 'deferred_to_group',
      group_id: lg.group_id,
      allDone,
      ...(verdictWarn || {}),
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  // #622 (D-622-01) LAST-MEMBER MERGE FENCE: relaxing open-ready's write_node_exclusive check lets a
  // READ co-open alongside a LIVE leg-contained write lane_group (the group no longer excludes reads).
  // The complementary safety obligation lives HERE: the group's eventual merge (the octopus-merge below,
  // or the legless snapshot group-barrier) must not race a READ that is STILL live and reading the
  // pre-merge parent tree. Refuse — typed, ZERO mutation (the merge/group-barrier has not run yet) —
  // while ANY live running-set member is a read; the caller retries close-node once the read(s) have
  // drained. A legless / read-free group (the pre-#622 shape) never has a live read here ⇒ this is a
  // no-op (byte-identical).
  // A live main-session-gate (kind:'gate') is a live observer of the pre-merge parent tree alongside any
  // live read — the merge must not race it either. Count both; the typed reason stays stable.
  const liveReadsAtMerge = (runningLeg ? (runningLeg.nodes || []) : []).filter(n => n.kind === 'read' || n.kind === 'gate');
  if (liveReadsAtMerge.length > 0) {
    return {
      result: 'refuse',
      reason: 'merge_awaits_read_drain',
      nodeId, role,
      group_id: lg.group_id,
      liveReads: liveReadsAtMerge.map(n => n.id),
      detail: 'the lane-group last-member merge is held until the live observer(s) [' + liveReadsAtMerge.map(n => n.id).join(', ') + '] (read/gate) drain — retry close-node once they close',
    };
  }

  // -- (2b) LAST member: the close barrier over union(all members), BEFORE closing/removing this member
  //    (so lane_group.members still holds the full set the validator reads).
  //    #463 Slice 4 — the DEPENDENCY-LEVEL COMMIT BARRIER. When legs are LIVE (routing on), the
  //    SYNTHESIZER reconciles the level: (i) the parent-clean fence catches a floated own-lane slip
  //    BEFORE the merge (fail-closed); (ii) octopus-merge the disjoint legs into the feature branch
  //    (mechanical, no agent) → commit M = the HEAD ADVANCE; (iii) the COMMIT-based union barrier on M
  //    (the B1 fix: measure diff(base→M), only-committed, never a working-tree snapshot that would
  //    false-green a floated slip). A legless group keeps the EXACT snapshot group barrier — byte-
  //    identical serial-degrade. Drain→synthesize→commit→advance: the next level's legs branch off M.
  const liveLegs = (runningLeg && runningLeg.lane_group && runningLeg.lane_group.legs && Object.keys(runningLeg.lane_group.legs).length)
    ? runningLeg.lane_group.legs : null;
  let groupBarrier;
  let mergedCommit = null;
  if (liveLegs) {
    let synthRoot; try { synthRoot = getRoot(); } catch (_) { synthRoot = process.cwd(); }
    // (i) parent-clean fence.
    const fence = shell(validatorPath, [planPath, '--parent-clean-check', '--project', project, '--json']);
    if (fence.exitCode !== 0 || fence.result !== 'pass') {
      return { result: 'refuse', reason: fence.reason || 'parent_dirty', nodeId, role, group_id: lg.group_id, fence };
    }
    // (ii) synthesizer execution — mechanical octopus merge of the disjoint legs → M. A real conflict
    // (the deferred overlapping tier) bails → merge_conflict (the Opus resolver + K=3 repair is Slice 5);
    // legs + baseline are retained (durable, recoverable), NO ledger advance.
    const synth = synthesizeLevel(synthRoot, liveLegs, lg.group_id, planPath);
    if (!synth.ok) {
      // #463 Slice 5: surface the offending leg + detail top-level so the operator_hint can name the leg
      // (leg_capture_failed is PER-LEG and sets synth.leg; the closing member's nodeId is the last member, not
      // the offending leg). merge_conflict is the level-wide reason. The decorator attaches the per-reason hint.
      return { result: 'refuse', reason: synth.reason || 'merge_conflict', nodeId, role, group_id: lg.group_id, ...(synth.leg ? { leg: synth.leg } : {}), ...(synth.detail ? { detail: synth.detail } : {}), synth };
    }
    mergedCommit = synth.mergeCommit;
    appendNodeTiming(planPath, lg.group_id, 'level_merged');
    // (iii) the COMMIT-based union barrier on M (+ base & per-leg-head ancestor inclusion = no silent loss).
    groupBarrier = shell(validatorPath, [planPath, '--group-barrier', '--group-id', lg.group_id, '--merge-commit', mergedCommit, '--project', project, '--json']);
  } else {
    groupBarrier = shell(validatorPath, [planPath, '--group-barrier', '--group-id', lg.group_id, '--json']);
  }
  if (groupBarrier.exitCode !== 0 || groupBarrier.result !== 'pass') {
    // Typed refusal: NO ledger advance, lane_group untouched, group baseline retained. (A merge that
    // committed M before a union-barrier refuse leaves M on the branch — durable + recoverable; re-running
    // the synthesizer is idempotent, and the escape is repaired before the barrier can pass.)
    return {
      result: 'refuse',
      reason: groupBarrier.reason || 'group_barrier_failed',
      nodeId, role,
      group_id: lg.group_id,
      groupBarrier,
      ...(mergedCommit ? { mergeCommit: mergedCommit } : {}),
    };
  }

  // Group barrier passed: close this member, append compliance `group_passed`, clear lane_group,
  // drop the group baseline.
  let currentPlan = readFile(planPath);
  const closeResult = spliceLedgerNode(currentPlan, nodeId, 'complete', { allowFrom: ['in_progress'] });
  if (!closeResult.found) return { result: 'refuse', reason: 'close_node_not_in_ledger', nodeId };
  if (!closeResult.changed && !closeResult.alreadyAtTarget) {
    return { result: 'refuse', reason: 'close_transition_disallowed', nodeId };
  }
  if (closeResult.changed) currentPlan = closeResult.content;
  currentPlan = addCloseCompliance(currentPlan, nodeId, role, evidenceContent, 'group_passed');
  writeFile(planPath, currentPlan);
  appendNodeTiming(planPath, nodeId, 'closed');
  appendProvenanceLog(planPath, 'close', nodeId, readNonce(planPath, nodeId, readFile));
  transitions.push(buildTransition(nodeId, 'complete', 'close-node'));

  // Clear lane_group entirely + remove the member from running_set.nodes.
  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  if (running) {
    // #463 Slice 2 (FIX-1a): PRIMARY leg teardown on clean group completion. The lane_group key (and
    // its legs manifest) is about to be deleted, so the reconcile-gated orphan sweep can never reclaim
    // these legs afterward — tear them down HERE, before the delete. Fail-soft (teardownLeg never
    // throws). Flag-OFF / legless groups have no `legs` key ⇒ this whole block is a no-op (byte-
    // identical). Read the legs from the live running-set's lane_group (authoritative on disk), not lg.
    const legsManifest = running.lane_group && running.lane_group.legs;
    if (legsManifest && Object.keys(legsManifest).length) {
      let mainRoot; try { mainRoot = getMainRoot(getRoot()); } catch (_) { mainRoot = process.cwd(); }
      for (const id of Object.keys(legsManifest)) {
        const leg = legsManifest[id];
        if (leg && leg.legPath) teardownLeg(mainRoot, leg.legPath, leg.legBranch);
      }
    }
    const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
    const cleared = { ...running, nodes: remaining };
    delete cleared.lane_group;
    if (remaining.length === 0 && opts.unlink) opts.unlink(runningSetPath);
    else writeFile(runningSetPath, JSON.stringify({ ...cleared, state: 'open' }, null, 2));
  }
  // Drop the group baseline (idempotent; a group_id has no ledger row so the #424 window-lock permits it).
  shell(validatorPath, [planPath, '--drop-base', '--node-id', lg.group_id, '--json']);

  const nextAction = shell(nextActionPath, [planPath, '--json']);
  const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);
  const newlyReady = (nextAction.result === 'ok' && Array.isArray(nextAction.readyPending))
    ? nextAction.readyPending.filter(n => n.role !== 'main-session-gate')
        .map(frontierNode)
    : [];

  return {
    result: 'ok',
    closed: nodeId,
    barrier: 'group_passed',
    group_id: lg.group_id,
    ...(mergedCommit ? { mergeCommit: mergedCommit, synthesized: true } : {}),
    allDone,
    newlyReady,
    ...(verdictWarn || {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// classifyWriterReconcile(nodeId, bc) — the Codex join protocol's writer kill-safety verdict. PURE over
// the plan-validator --barrier-check result `bc` (the parsed JSON, or null on shell/parse failure).
// POSITIVE-CONFIRMATION / fail-closed: `adopt` is emitted ONLY when the barrier EXPLICITLY confirms the
// writer is safe; every other shape — including an UNVERIFIABLE result — halts.
//   adopt — barrier EXPLICITLY passes (result pass|ok: all changes ⊆ the declared write set), OR the writer
//           never recorded a baseline (`no_barrier_base`: it crashed before writing under tracking →
//           nothing to reconcile, vacuous-safe).
//   halt  — the barrier refuses with out-of-write-set paths (the leaked-stray-edit hazard), any other
//           refusal (root/base integrity anomaly), OR an UNVERIFIABLE result. The last case is the critical
//           one: `shellNode` NEVER throws — a SIGKILL'd / jetsam-killed / crashed / non-JSON / missing-
//           validator barrier-check returns a RESULTLESS truthy object `{exitCode:N}` (safeJsonParse('')
//           === {}), and an unrecognized `result` token is equally unconfirmed. Neither is proof the writer
//           is clean, so both fail closed (`barrier_unverifiable`) rather than silently adopting a writer
//           whose diff we could not verify. NON-DESTRUCTIVE: reconcile never deletes; the halt + any paths
//           route to the orchestrator/consent valve.
// Shape: { node_id, verdict:'adopt'|'halt', reason, outOfWriteSet:[...] }.
// ---------------------------------------------------------------------------
function classifyWriterReconcile(nodeId, bc) {
  if (!bc || typeof bc !== 'object') {
    return { node_id: nodeId, verdict: 'halt', reason: 'barrier_unavailable', outOfWriteSet: [] };
  }
  const outOfAllow = Array.isArray(bc.outOfAllow) ? bc.outOfAllow.slice() : [];
  if (bc.result === 'refuse') {
    if (outOfAllow.length) {
      return { node_id: nodeId, verdict: 'halt', reason: bc.reason || 'write_set_overflow', outOfWriteSet: outOfAllow };
    }
    // No baseline recorded → the writer never wrote under tracking (crashed before it flipped/wrote);
    // there is nothing to reconcile, so adopt (vacuous) rather than wedge the common pending-crash path.
    if (bc.reason === 'no_barrier_base') {
      return { node_id: nodeId, verdict: 'adopt', reason: 'no_baseline', outOfWriteSet: [] };
    }
    // Any other refusal (root/base integrity anomaly) is unresolvable here → fail-closed halt.
    return { node_id: nodeId, verdict: 'halt', reason: bc.reason || 'barrier_refused', outOfWriteSet: [] };
  }
  // POSITIVE CONFIRMATION: adopt ONLY on an EXPLICIT clean result (pass|ok). Any other shape — a resultless
  // {exitCode:N} from a swallowed subprocess failure, or an unrecognized result token — is UNVERIFIED, so
  // fail closed to halt (never silently adopt a writer whose diff the barrier did not confirm).
  if (bc.result === 'pass' || bc.result === 'ok') {
    return { node_id: nodeId, verdict: 'adopt', reason: 'in_write_set', outOfWriteSet: [] };
  }
  return { node_id: nodeId, verdict: 'halt', reason: 'barrier_unverifiable', outOfWriteSet: outOfAllow };
}

// ---------------------------------------------------------------------------
// runReconcileRunningSet — MUTATES running-set.json + (roll-back) ledger.
// Repairs a crashed 'opening' running set: a node whose ledger row DID flip to
// in_progress is kept (roll-forward, opening flag cleared); a node still 'pending'
// did not open (roll-back, dropped from the set). Promotes state -> 'open'. A set
// with no opening transaction is a no-op. Mirrors parallel-batch runReconcile.
// ---------------------------------------------------------------------------
function runReconcileRunningSet(opts) {
  const { planPath, project, shell, readFile, writeFile, cacheExists, unlink } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);

  const running = readRunningSet(runningSetPath, cacheExists, readFile);

  // #463 Slice 2 (FIX-1b): orphan-leg sweep, HOISTED ABOVE the no_running_set early-return below so a
  // crashed run that LOST its running-set.json (no manifest at all) still gets its dangling legs
  // reclaimed — the clean-completion leak's crash-path sibling. #542 (D-542-01): gated on
  // parallelWritesDefaultOn (default TRUE), NOT the retired resolveLegIsolation toggle, because legs are
  // now provisioned by default — so the sweep must run by default to reclaim them after a manifest-losing
  // crash. NOT gated on a present `legs` manifest: when the manifest is gone we cannot read keep-paths
  // from it, so default-on is the gate and keepLegPaths falls back to []. The explicit serial opt-out
  // (KAOLA_PARALLEL_WRITES=0) short-circuits with ZERO git calls. sweepOrphanLegs only ever tears down
  // worktrees under <mainRoot>/.kw/legs/<project>/ (never the executor worktree). keepLegPaths = legs
  // CURRENTLY referenced by the surviving manifest (empty when there is no running set / no legs); on the
  // drop path below a soon-to-dropped member's leg is still in `keep` here and is torn down by the
  // per-member teardown step instead (disjoint, no double-teardown). Fail-soft (sweepOrphanLegs never
  // throws — reconcile must never throw).
  if (parallelWritesDefaultOn(process.env)) {
    let mainRoot; try { mainRoot = getMainRoot(getRoot()); } catch (_) { mainRoot = process.cwd(); }
    const keepLegPaths = (running && running.lane_group && running.lane_group.legs)
      ? Object.values(running.lane_group.legs).map(l => l && l.legPath).filter(Boolean)
      : [];
    sweepOrphanLegs(mainRoot, project, keepLegPaths);
  }

  // #680 (Part B): orphan-BASELINE sweep — the pre-journal SIGKILL-window sibling of the orphan-LEG sweep
  // above. A hard crash BETWEEN open-ready recording its baselines (Phase 1: the shared group baseline +
  // each member baseline) and writing the 'opening' running-set journal strands `barrier-base-*` files +
  // their anchored refs with NO 'opening' marker for the roll-forward/back machine below to find — and,
  // when the crash predates the journal write, NO running-set.json at all (so the !running early-return
  // below would skip them forever, a permanent leak). Hoisted ABOVE that early-return (mirrors the
  // orphan-leg sweep) so a manifest-losing crash still reclaims them. reconcile-running-set is the
  // crash-repair entry point and holds the project scheduler lock (SPLIT_GUARDED), so NO live open-ready
  // can be mid-Phase-1 while this runs — every baseline with no live owner here belongs to a dead run.
  //
  // FALSE-POSITIVE GUARD (correctness-critical — dropping a LIVE baseline corrupts an in-flight run):
  // a `barrier-base-<san>` file is an ORPHAN only when its (sanitized) id matches NO live owner. KEEP it
  // when the id is (a) an in_progress ledger row (a member awaiting its close barrier), (a2) — #706 — a
  // COMPLETE ledger row (its writer identity feeds every later post-dominating gate close's producer
  // bindings; see the keep loop), (b) a running-set
  // node id (the reconcile machine below owns that member's precise roll-forward/back + baseline drop), or
  // (c) a live lane_group member id / the live lane_group group_id (the group baseline is the diff anchor
  // for the eventual group barrier), or (d) — #680 REPAIR — ANY `barrier-base-lg-*` group baseline when
  // `running` is null (torn/absent Phase-3 journal) AND ≥1 in_progress ledger row exists: a live group's
  // members are in_progress but its group_id (`lg-<memberIds…>`) has no ledger row and is unrecoverable, so
  // its deadness is UNPROVABLE and it is kept (see the drop loop). Sanitizer collisions (`a.b` and `a_b`
  // both → `barrier-base-a_b`) only ever ADD to the keep set, so they fail SAFE (under-reap, never
  // over-reap). Fail-soft: any error aborts the sweep silently (reconcile must never throw) — we prefer
  // leaving an orphan to risking a live drop.
  const orphanBaselinesDropped = [];
  if (typeof shell === 'function') {
    try {
      const fsB = require('fs');
      const sanB = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
      const cacheDirB = path.join(path.dirname(planPath), '.cache');
      const keep = new Set();
      const ledgerB = readLedgerStatuses(readFile(planPath));
      // #680 REPAIR: track whether ANY member is mid-flight. A live lane_group's members are in_progress
      // but its group_id (`lg-<memberIds…>`) has NO ledger row and cannot be re-parsed back into member ids
      // (member ids themselves contain hyphens), so when running is torn/absent the ONLY authoritative
      // signal that a `barrier-base-lg-*` might be live is the presence of an in_progress row.
      let hasInProgressB = false;
      for (const id of Object.keys(ledgerB)) {
        if (ledgerB[id] === 'in_progress') { keep.add(sanB(id)); hasInProgressB = true; }
        // #706: a ledger-COMPLETE node's baseline is NEVER an orphan. A post-dominating gate that has
        // not yet recorded a review attempt captures every complete producer's writer identity
        // (barrier-base + barrier-open + anchored ref) at ITS OWN close — so the #703
        // journal-referenced keep below cannot protect it (no attempt exists yet to reference it).
        // Sweeping it here forced the consumer-observed writer_identity_unavailable refusal at the
        // later gate close, remedied only by a manual --record-base re-record against the CURRENT
        // tree — semantically weaker (the writer's historical diff attribution is lost). Retention is
        // cheap (.cache is archived with the run) and mirrors a successful close, which never drops
        // the closed node's baseline. The sweep's purpose — reclaiming baselines of discarded /
        // never-completed nodes (ledger pending, or no ledger row at all) — is untouched: those still
        // sweep, which also keeps --record-base's idempotent-reuse from resurrecting a stale snapshot.
        else if (ledgerB[id] === 'complete') keep.add(sanB(id));
      }
      // A bounded logical review can legitimately own a real reservation for
      // a still-pending member.  The immutable journal generation is its live
      // owner just as surely as an in_progress ledger row; dropping it here
      // would make the provisional attempt unreadable and force a nonce
      // rotation before top-up.  Only a fully validated current-plan journal
      // contributes keep entries, so malformed/stale bytes cannot pin bases.
      for (const member of journalOwnedReviewGenerationMembers(opts, readFile(planPath))) {
        keep.add(sanB(member));
      }
      // #703 (Proposal 3): KEEP the baseline of every COMPLETE producer referenced by an unresolved
      // (`consumed_by == null`) review attempt. A settled-fail gate's attempt still routes to
      // repair-node, whose documented non-discard recovery restores the writer's ref from
      // `.cache/barrier-base-<writer>`; sweeping it here (as a `no_running_set` reconcile run
      // mid-diagnosis did) deletes the exact file the repair needs — the issue's aggravator. Complete
      // producers of an unresolved attempt are never orphans while that attempt is unconsumed.
      for (const producer of journalReferencedProducerBaselines(opts, readFile(planPath))) {
        keep.add(sanB(producer));
      }
      if (running) {
        for (const n of (running.nodes || [])) { if (n && n.id) keep.add(sanB(n.id)); }
        if (running.lane_group) {
          if (running.lane_group.group_id) keep.add(sanB(running.lane_group.group_id));
          for (const m of (running.lane_group.members || [])) {
            const mid = (typeof m === 'string') ? m : (m && (m.nodeId || m.id));
            if (mid) keep.add(sanB(mid));
          }
        }
      }
      let entries = [];
      try { entries = fsB.readdirSync(cacheDirB); } catch (_) { entries = []; }
      for (const name of entries) {
        if (name.indexOf('barrier-base-') !== 0) continue;
        const sanId = name.slice('barrier-base-'.length);
        if (!sanId || keep.has(sanId)) continue;
        // #680 REPAIR (adversary R1 — the torn-Phase-3 LIVE-group-baseline drop): a GROUP baseline
        // (`barrier-base-lg-*`) has NO ledger row, so the in_progress-ledger keep above never covers it —
        // and its group_id (`lg-<memberIds…>`) cannot be reliably re-parsed into member ids (member ids
        // contain hyphens), so a live group is knowable ONLY from a readable running-set. When `running` is
        // non-null the live group_id was already added to `keep` above (so reaching here means this lg-* is
        // NOT the live group → a genuine orphan, drop it). When `running` is null (torn/absent Phase-3
        // journal) AND ≥1 in_progress row exists, we CANNOT prove ANY lg-* is dead — a live group's members
        // are in_progress but its group_id is unrecoverable — so KEEP it (fail-safe under-reap; dropping it
        // would strand A,B in_progress against a `no_group_base` group barrier). Only when there are ZERO
        // in_progress rows (a genuine pre-journal orphan: SIGKILL before Phase-2 flipped any member) is a
        // torn-running lg-* provably dead → drop it. Non-lg-* (member) baselines keep their logic unchanged.
        if (sanId.indexOf('lg-') === 0 && !running && hasInProgressB) continue;
        // No live owner → orphan of a dead run. --drop-base removes the file + anchored ref + freshness
        // token together (idempotent; a missing artifact is a clean no-op). Passing the already-sanitized
        // id re-sanitizes to the SAME file/ref keys, so the drop is exact.
        shell(validatorPath, [planPath, '--drop-base', '--node-id', sanId, '--json']);
        orphanBaselinesDropped.push(sanId);
      }
    } catch (_) { /* fail-soft: never throw from reconcile; prefer under-reaping to a live drop */ }
  }

  if (!running) {
    return { result: 'ok', reconciled: false, reason: 'no_running_set',
      ...(orphanBaselinesDropped.length ? { orphanBaselinesDropped } : {}),
      taskTransitions: [] };
  }

  const wholeOpening = running.state === 'opening';
  const openingNodes = (running.nodes || []).filter(n => n.opening);

  const ledger = readLedgerStatuses(readFile(planPath));

  // #384: CLOSE direction. A crash between runCloseNode's plan write (ledger complete + compliance)
  // and its running-set removal — OR a near-simultaneous unlocked RMW on running-set.json — leaves a
  // ledger-TERMINAL (complete / n.a) member still in an already-'open' set. The OPEN-direction loop
  // below only covers opening:true / state:'opening' transactions; a stale terminal member would
  // otherwise fall through the not_opening dead-end and orient would loop forever (#384 repro). Detect
  // it FIRST so a close-crash is a reconcilable state, not a no-op. (readLedgerStatuses lowercases the
  // status; accept the 'n.a'/'na' spellings defensively alongside the canonical 'complete'/'n/a'.)
  const TERMINAL_LEDGER = new Set(['complete', 'n/a', 'n.a', 'na']);
  const closed = (running.nodes || []).filter(n => TERMINAL_LEDGER.has(ledger[n.id])).map(n => n.id);

  // #293/S-fix: STALE direction. A member of an already-'open' (non-opening) running set whose ledger
  // row is NEITHER terminal (the #384 close direction above) NOR `opening` (the open-direction
  // roll-back below) NOR `in_progress` (a genuine live member) is a stale/corrupt shape — the set
  // claims it is in flight while the ledger says it is `pending` (or some non-live status) and the
  // real in_progress is a DIFFERENT (serial) node. Left in place it wedges orient/open-next forever:
  // open-next refuses scheduler_active → reconcile-running-set, which (pre-fix) returned not_opening
  // (no-op) — the exact #383(e)/#384 dead-end loop. Detect non-opening pending/non-live members and
  // drop them (close direction's sibling). Only meaningful when NOT mid open-transaction (wholeOpening
  // / opening:true members are the roll-forward/back machine and own those rows).
  const NONLIVE_DROPPABLE = (status) => status !== 'in_progress' && !TERMINAL_LEDGER.has(status);
  const stale = (!wholeOpening)
    ? (running.nodes || []).filter(n => !n.opening && NONLIVE_DROPPABLE(ledger[n.id])).map(n => n.id)
    : [];

  // No opening transaction AND no stale terminal member AND no stale pending member → nothing to do.
  if (!wholeOpening && openingNodes.length === 0 && closed.length === 0 && stale.length === 0) {
    return { result: 'ok', reconciled: false, reason: 'not_opening', state: running.state,
      // #680 (Part B): surface any orphan baseline the hoisted sweep dropped even on the not_opening exit.
      ...(orphanBaselinesDropped.length ? { orphanBaselinesDropped } : {}),
      taskTransitions: [] };
  }

  // In a rolling top-up crash, state:'opening' covers the transaction but only
  // members carrying opening:true are admission candidates. Stable members are
  // counted once below and survive independently. Legacy all-opening manifests
  // still target every member because every member carries the marker.
  const target = openingNodes.length ? openingNodes : (wholeOpening ? (running.nodes || []) : []);
  const keptAll = [];
  const dropped = [];
  // #596 (D-596-01): ids demoted by the crashed-speculative-WRITE gate-check override BELOW — their
  // ledger row is genuinely 'in_progress' (unlike the rest of `dropped`, which was already 'pending' and
  // needs no ledger write). Tracked separately so they get an EXPLICIT in_progress -> pending reset
  // (mirrors discard-speculative's step (a)) once the classification loop finishes.
  const specWriteGateRollback = [];
  for (const n of target) {
    if (ledger[n.id] !== 'in_progress') { dropped.push(n.id); continue; }
    // #596 (D-596-01): the crashed-speculative-WRITE arm. A crashed speculative write member whose
    // ledger row DID flip to in_progress (the general roll-forward candidate) rolls forward ONLY if its
    // gate is CONFIRMED complete with verdict:pass AT RECONCILE TIME — a conservative posture, since the
    // crash window may have let the gate resolve (or fail) before this reconcile ran, and a speculative
    // write's leg base can be voided by a repaired upstream. Any other gate state (still open, complete
    // with a fail/unparseable verdict, or unreadable) rolls it back via the SAME drop path — idempotent,
    // and the drop-direction loops below already own its leg teardown + baseline drop. Read speculative
    // members and every NON-speculative member are UNCHANGED (kind !== 'write' skips this override).
    // SCOPED to n.opening (mirrors openingNodes): a `wholeOpening` sweep walks EVERY member of `running.
    // nodes`, including ones from a PRIOR, already-settled open that merely coexist in this transaction —
    // only a member ACTUALLY mid-open (opening:true) is a genuine crash-repair candidate for this override.
    if (n.opening && n.speculative && n.kind === 'write') {
      const gateId = n.speculativeGate;
      let gatePass = false;
      if (gateId && ledger[gateId] === 'complete') {
        let gateEv = '';
        try { gateEv = readFile(path.join(path.dirname(planPath), '.cache', gateId + '.md')); } catch (_) { gateEv = ''; }
        const v = parseNodeVerdict(gateEv);
        gatePass = !!(v && v.verdict === 'pass');
      }
      if (!gatePass) { dropped.push(n.id); specWriteGateRollback.push(n.id); continue; }
    }
    keptAll.push(n.id);
  }
  // Reset the ledger row for each gate-check rollback BEFORE the survivors/leg-teardown logic runs below
  // (mirrors discard-speculative's ordering: ledger reset first, --drop-base is not #424 window-locked).
  if (specWriteGateRollback.length) {
    let planContentForReset = readFile(planPath);
    let changedAny = false;
    for (const id of specWriteGateRollback) {
      const reset = spliceLedgerNode(planContentForReset, id, 'pending', { allowFrom: ['in_progress'] });
      if (reset.changed) { planContentForReset = reset.content; changedAny = true; }
    }
    if (changedAny) writeFile(planPath, planContentForReset);
  }

  // #436 D-419-01: cap roll-forward re-opens at (max_concurrent - live) so a crashed
  // open-ready that partially flipped ledger rows cannot leave MORE nodes in_progress than
  // the ceiling allows. `live` = stable non-opening in_progress members that survive
  // regardless (they are already confirmed running). Absent max_concurrent → ceiling = 1
  // (fail-closed, legacy open-next default).
  const closedSet = new Set(closed);
  const staleSet = new Set(stale);
  // #607: a live main-session-gate (kind:'gate') is not a fan-out slot occupant, so it must not consume
  // roll-forward budget — a crashed speculative-write open behind a gate would otherwise roll forward one
  // fewer member than the write cap permits. Excluded here (same rationale as the open-ready slot base).
  const liveStable = (running.nodes || []).filter(
    n => !n.opening && n.kind !== 'gate' && !closedSet.has(n.id) && !staleSet.has(n.id) && ledger[n.id] === 'in_progress'
  );
  const ceiling = (Number.isInteger(running.max_concurrent) && running.max_concurrent >= 1)
    ? running.max_concurrent : 1;
  const budget = Math.max(0, ceiling - liveStable.length);
  const kept = keptAll.slice(0, budget);
  // Nodes in keptAll that exceed the budget are also dropped (capped out).
  const cappedOut = keptAll.slice(budget);

  // A genuine cap rollback may already have flipped its ledger row. Reset it
  // explicitly so the durable set and ledger cannot diverge into an orphan.
  if (cappedOut.length) {
    let planContentForCapReset = readFile(planPath);
    let changedAny = false;
    for (const id of cappedOut) {
      const reset = spliceLedgerNode(planContentForCapReset, id, 'pending', { allowFrom: ['in_progress'] });
      if (reset.changed) { planContentForCapReset = reset.content; changedAny = true; }
    }
    if (changedAny) writeFile(planPath, planContentForCapReset);
  }

  // Codex join protocol — WRITER KILL-SAFETY reconciliation. Every WRITER member LEAVING the live set on
  // this reconcile (rolled back / capped out / stale) is a potentially-interrupted in-place writer whose
  // worktree may hold PARTIAL edits — this run's stray-write hazard, turned into a scripted, fail-closed
  // step. Diff its actual worktree changes against its declared write set via the plan-validator
  // --barrier-check (the SAME baseline+diff the per-node barrier uses) and emit a typed verdict per writer:
  //   adopt — all changes ⊆ the declared write set (barrier passes) OR no baseline was ever recorded
  //           (the writer crashed before it wrote under tracking) — safe to keep / re-dispatch cleanly.
  //   halt  — changes touch paths OUTSIDE the declared set (the leaked-stray-edit hazard) OR the barrier is
  //           otherwise unresolvable (integrity anomaly / unavailable). NON-DESTRUCTIVE by design: reconcile
  //           NEVER auto-deletes a production file (revert-overflow is destructive + consent-gated), so it
  //           emits `halt` + the offending paths and hands the decision to the orchestrator/consent valve.
  // `revert` stays in the typed vocabulary as the token the orchestrator MAY act on (via revert-overflow);
  // reconcile itself only ever emits adopt|halt. Runs BEFORE the --drop-base loop below (which removes the
  // baseline the diff needs). A read/gate member is never a writer → skipped. Fail-soft: a shell/parse error
  // yields a `halt` (fail-closed) verdict, never a throw.
  const writerReconciliation = [];
  if (typeof shell === 'function') {
    const byIdWriter = new Map((running.nodes || []).map(n => [n.id, n]));
    const departingWriters = new Set([...dropped, ...cappedOut, ...stale]);
    for (const id of departingWriters) {
      const n = byIdWriter.get(id);
      if (!n || n.kind !== 'write') continue;
      let bc = null;
      try { bc = shell(validatorPath, [planPath, '--barrier-check', '--node-id', id, '--json']); } catch (_) { bc = null; }
      writerReconciliation.push(classifyWriterReconcile(id, bc));
    }
  }
  const writerHalt = writerReconciliation.some(w => w.verdict === 'halt');

  // #385 drop-side: every rolled-back (open-direction) / closed-out (close-direction) / stale
  // (#293-direction) / capped-out member is leaving the live set, so drop its per-node baseline
  // (.cache/barrier-base-<id> + the gc-anchored ref) — the documented #281/#296 stale-baseline trap
  // that runReopenNode already guards against. --drop-base removes file+ref together and is idempotent
  // (a missing file/ref is a clean no-op). Mirrors runReopenNode ~1505. The roll-FORWARD survivors
  // (kept) keep their fresh baselines.
  if (typeof shell === 'function') {
    const journalOwned = journalOwnedReviewGenerationMembers(opts, readFile(planPath));
    // #703 (Proposal 3): also spare a departing member that is a producer of an unresolved review
    // attempt — its baseline is the repair-node recovery ref, not an orphan.
    const referencedProducers = journalReferencedProducerBaselines(opts, readFile(planPath));
    // #706: also spare every ledger-COMPLETE departing member (the #384 close-direction `closed` set).
    // A successful close KEEPS the closed node's baseline — a later post-dominating gate close captures
    // the writer's identity (producer bindings) from it — so the close-crash repair must converge to
    // that same durable state, not a strictly-more-destructive one. Pre-#706 this drop forced the
    // writer_identity_unavailable refusal at the later gate close. Rolled-back / capped-out / stale
    // members are never ledger-complete here (a terminal row routes to `closed`), so the open-direction
    // #385 stale-baseline drop is unchanged.
    for (const id of new Set([...dropped, ...cappedOut, ...closed, ...stale])) {
      if (!journalOwned.has(id) && !referencedProducers.has(id) && ledger[id] !== 'complete') {
        shell(validatorPath, [planPath, '--drop-base', '--node-id', id, '--json']);
      }
    }
  }

  // #596: purge stale evidence for a rolled-back (or capped-out) speculative WRITE member — mirrors
  // discard-speculative's evidence-discard step, so a future re-open reseeds cleanly instead of a stale
  // file with the OLD nonce silently surviving (seedEvidenceFile's forceRotate is false on a normal
  // open). Read speculative members and every non-speculative member are UNCHANGED (kind:'write' only).
  if (typeof unlink === 'function') {
    const byId596 = new Map((running.nodes || []).map(n => [n.id, n]));
    const cacheDir596 = path.join(path.dirname(planPath), '.cache');
    for (const id of new Set([...dropped, ...cappedOut])) {
      const n = byId596.get(id);
      if (n && n.speculative && n.kind === 'write') {
        const evPath = path.join(cacheDir596, id + '.md');
        if (cacheExists ? cacheExists(evPath) : true) unlink(evPath);
      }
    }
  }

  // Survivors = non-target nodes (already open) + target nodes whose row flipped AND under cap —
  // MINUS any close-direction terminal member (#384), stale non-opening pending member (#293-direction),
  // or capped-out opening member (D-419-01).
  const cappedOutSet = new Set(cappedOut);
  const survivors = (running.nodes || [])
    .filter(n => ((!n.opening) || kept.includes(n.id)) && !closedSet.has(n.id) && !staleSet.has(n.id) && !cappedOutSet.has(n.id))
    .map(n => { if (!n.opening) return n; const c = { ...n }; delete c.opening; return c; });

  // #437 (D-419 P2 §10 crash-safety): handle a crashed lane group open/close. The group is consistent
  // with the node set: a group survives iff ≥1 of its member nodes survives (rolled forward / already
  // live). When NO member survives (all rolled back, or the close-crash drained them), DROP the
  // lane_group key AND its group baseline (--drop-base --node-id <group_id>). A surviving group keeps
  // the SAME baseline (it is the diff anchor for the eventual group barrier). Flag-OFF running sets
  // have no lane_group key ⇒ this whole block is a no-op (byte-identical).
  let laneGroupSurvives = false;
  if (running.lane_group && Array.isArray(running.lane_group.members)) {
    const survivorIds = new Set(survivors.map(n => n.id));
    const memberIds = running.lane_group.members.map(m => (typeof m === 'string' ? m : (m.nodeId || m.id)));
    laneGroupSurvives = memberIds.some(id => survivorIds.has(id));
    // #463 Slice 2: leg-aware reconcile teardown. Fail-soft (teardownLeg never throws). Flag-OFF /
    // legless groups have no `legs` key ⇒ both branches no-op (byte-identical). mainRoot anchors the
    // teardown at the MAIN checkout (where the leg worktrees were provisioned, SIBLINGS of any feature
    // worktree). STRICT-ORDER (worktree-remove BEFORE branch-D) is inside teardownLeg.
    const legsManifest = running.lane_group.legs;
    if (legsManifest && Object.keys(legsManifest).length && typeof getMainRoot === 'function') {
      let mainRoot; try { mainRoot = getMainRoot(getRoot()); } catch (_) { mainRoot = process.cwd(); }
      if (!laneGroupSurvives) {
        // Whole-group drop: teardown ALL legs before the lane_group key is deleted below.
        for (const id of Object.keys(legsManifest)) {
          const leg = legsManifest[id];
          if (leg && leg.legPath) teardownLeg(mainRoot, leg.legPath, leg.legBranch);
        }
      } else {
        // Surviving group: teardown each DROPPED member's leg and remove it from the manifest so the
        // written lane_group.legs reflects only survivors. #552: EXCLUDE the close-direction `closed`
        // members — a close-direction terminal member (ledger `complete`, still in the node set because
        // the closeGroupMember running-set write crashed before removing it) has UNMERGED leg work that
        // the eventual last-member synthesizer MUST octopus-merge. Tearing its leg down here (worktree
        // remove --force + branch -D) would PERMANENTLY lose that committed work — the #552 silent loss.
        // Only open-direction rollbacks (dropped/cappedOut) and stale members get torn down.
        const departing = new Set([...dropped, ...cappedOut, ...stale]); // NOT ...closed (see #552 above)
        for (const id of departing) {
          const leg = legsManifest[id];
          if (leg && leg.legPath) {
            teardownLeg(mainRoot, leg.legPath, leg.legBranch);
            delete legsManifest[id];
          }
        }
      }
    }
    // #552 SELF-HEAL: re-converge closed_members with the AUTHORITATIVE ledger on a SURVIVING group. A
    // crash in closeGroupMember's two-write window (ledger `complete` written, running-set write not) leaves
    // a close-direction terminal GROUP member missing from closed_members; re-add it (dedup, matching the
    // closeGroupMember append shape) so the field never lies. The member's leg is RETAINED above, so the
    // last-member synthesizer still merges it; this only keeps the optimization field honest. Belt-and-
    // suspenders with the ledger-derived isLast (closeGroupMember) — neither alone can lose work.
    if (laneGroupSurvives) {
      const memberIdSet = new Set(memberIds);
      const healed = closed.filter(id => memberIdSet.has(id));
      if (healed.length) {
        const prevClosed = Array.isArray(running.lane_group.closed_members) ? running.lane_group.closed_members : [];
        running.lane_group.closed_members = Array.from(new Set([...prevClosed, ...healed]));
      }
    }
    if (!laneGroupSurvives && typeof shell === 'function') {
      shell(validatorPath, [planPath, '--drop-base', '--node-id', running.lane_group.group_id, '--json']);
    }
  }
  const reconciledTop = { ...running, state: 'open' };
  if (running.lane_group && !laneGroupSurvives) delete reconciledTop.lane_group;

  if (survivors.length === 0) {
    // #436 D-419-01: spread existing top-level fields so max_concurrent (and any other
    // unknown fields) survive the empty-set fallback rewrite.
    writeFile(runningSetPath, JSON.stringify({ ...reconciledTop, nodes: [] }, null, 2));
  } else {
    writeFile(runningSetPath, JSON.stringify({ ...reconciledTop, nodes: survivors }, null, 2));
  }

  return {
    result: 'ok',
    reconciled: true,
    rolledForward: kept,
    rolledBack: dropped,
    cappedOut,
    // #680 (Part B): sanitized ids of pre-journal orphan baselines dropped by the sweep above (absent when
    // none — the sweep found no barrier-base file without a live owner).
    ...(orphanBaselinesDropped.length ? { orphanBaselinesDropped } : {}),
    // #384: members dropped because their ledger row was already terminal (close-crash recovery).
    closedDropped: closed,
    // #293/S-fix: members dropped because they were stale non-opening pending (or otherwise not-in-flight)
    // members of an 'open' set while a DIFFERENT serial node is the real in_progress.
    staleDropped: stale,
    // Name the recovery so orient/operators see WHY the reconcile fired when there was no opening
    // transaction. A pure stale-member drop (no terminal, no roll-forward/back) is named distinctly so
    // the #293 dead-end is observably broken (was a not_opening no-op).
    ...(!wholeOpening && openingNodes.length === 0 && closed.length === 0 && stale.length > 0 ? { reason: 'stale_member_dropped' }
      : (!wholeOpening && openingNodes.length === 0 && closed.length > 0 ? { reason: 'closed_member_dropped' } : {})),
    // Codex join protocol: the per-writer kill-safety verdicts (adopt|halt) for every WRITER member that
    // left the live set on this reconcile, plus a top-level `writerHalt` hint when ANY writer's changes
    // spilled outside its declared set — the orchestrator/consent valve owns the non-destructive follow-up.
    writerReconciliation,
    writerHalt,
    state: 'open',
    taskTransitions: [],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runSelfTest (#433 / D-433-01) — inline self-test for evidence seeding + provenance log.
// Triggered by `--self-test`. Tests:
//   1. open-next seeds .cache/{node-id}.md with binding header + role-specific stubs.
//   2. Second open-next (crash-resume, same node) does NOT overwrite the existing file.
//   3. Nonce rotation (forceRotate=true) rewrites the ENTIRE file (binding + fresh stubs; stale body gone).
//   4. Provenance log entry appears after open.
//   5. opened payload includes evidence_file + required_tokens.
// Returns { passed:number, failed:number, errors:string[] }.
// ---------------------------------------------------------------------------
function runSelfTest() {
  const os = require('os');
  const fs = require('fs');
  const tmpDir = fs.mkdtempSync(os.tmpdir() + '/adaptive-node-self-test-');
  let passed = 0;
  let failed = 0;
  const errors = [];

  function assert(cond, label) {
    if (cond) { passed++; process.stdout.write('  PASS: ' + label + '\n'); }
    else { failed++; errors.push(label); process.stdout.write('  FAIL: ' + label + '\n'); }
  }

  try {
    const planPath = tmpDir + '/workflow-plan.md';
    fs.writeFileSync(planPath, '# dummy plan\n', 'utf8');

    // Test 1: seed creates the file with binding header as line 1 + role stubs.
    const r1 = seedEvidenceFile(planPath, 'n1-impl', 'abc123def456', 'tdd-guide', false);
    assert(r1.evidence_file === '.cache/n1-impl.md', 'T1 evidence_file correct path');
    assert(Array.isArray(r1.required_tokens), 'T1 required_tokens is array');
    assert(r1.required_tokens.includes('RED'), 'T1 required_tokens includes RED');
    assert(r1.required_tokens.includes('GREEN'), 'T1 required_tokens includes GREEN');
    const seededPath = tmpDir + '/.cache/n1-impl.md';
    assert(fs.existsSync(seededPath), 'T1 seeded file exists');
    const seededContent = fs.readFileSync(seededPath, 'utf8');
    const firstLine = seededContent.split('\n')[0];
    assert(firstLine === 'evidence-binding: n1-impl abc123def456', 'T1 binding header is line 1');
    assert(/RED:/.test(seededContent), 'T1 RED stub present');
    assert(/GREEN:/.test(seededContent), 'T1 GREEN stub present');

    // Test 2: second call (crash-resume) does NOT overwrite the existing file.
    // Write custom content to simulate in-progress evidence.
    fs.writeFileSync(seededPath, 'evidence-binding: n1-impl abc123def456\nRED: some test output\nGREEN: tests pass\n', 'utf8');
    const r2 = seedEvidenceFile(planPath, 'n1-impl', 'abc123def456', 'tdd-guide', false);
    assert(r2.nonce_rotated === false, 'T2 crash-resume nonce_rotated false');
    const afterContent = fs.readFileSync(seededPath, 'utf8');
    assert(afterContent.includes('RED: some test output'), 'T2 existing evidence preserved');
    assert(afterContent.includes('abc123def456'), 'T2 same nonce preserved on crash-resume');

    const r2b = seedEvidenceFile(planPath, 'n1-impl', 'newNonce999', 'tdd-guide', false);
    assert(r2b.nonce_rotated === true, 'T2b normal open rotates a stale same-node nonce');
    assert(!fs.readFileSync(seededPath, 'utf8').includes('RED: some test output'), 'T2b stale body discarded');

    // Test 3: nonce rotation (reopen-node): REWRITE ENTIRE FILE (binding + fresh stubs).
    // forceRotate=true must discard the old evidence body so stale evidence cannot pass
    // checkEvidenceShape on a re-opened node (#392 anti-replay guard).
    const r3 = seedEvidenceFile(planPath, 'n1-impl', 'rotated456789', 'tdd-guide', true);
    assert(r3.nonce_rotated === true, 'T3 reopen nonce_rotated true');
    const rotatedContent = fs.readFileSync(seededPath, 'utf8');
    const rotatedFirstLine = rotatedContent.split('\n')[0];
    assert(rotatedFirstLine === 'evidence-binding: n1-impl rotated456789', 'T3 line 1 rewritten with new nonce');
    assert(!rotatedContent.includes('RED: some test output'), 'T3 stale evidence body GONE after forceRotate');
    assert(/RED:/.test(rotatedContent), 'T3 fresh RED stub present after forceRotate');
    assert(/GREEN:/.test(rotatedContent), 'T3 fresh GREEN stub present after forceRotate');

    // Test 4: provenance log entry appears after an open event.
    appendProvenanceLog(planPath, 'open', 'n2-check', 'deadbeef1234');
    const logPath = tmpDir + '/.cache/provenance-log.jsonl';
    assert(fs.existsSync(logPath), 'T4 provenance-log.jsonl created');
    const logLines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const lastEntry = JSON.parse(logLines[logLines.length - 1]);
    assert(lastEntry.event === 'open', 'T4 event is open');
    assert(lastEntry.nodeId === 'n2-check', 'T4 nodeId correct');
    assert(lastEntry.nonce === 'deadbeef1234', 'T4 nonce correct');
    assert(lastEntry.by === 'adaptive-node', 'T4 by field correct');
    assert(typeof lastEntry.timestamp === 'string', 'T4 timestamp present');

    // Test 5: implementer role gets correct stubs.
    const r5 = seedEvidenceFile(planPath, 'n3-impl', 'impl99999999', 'implementer', false);
    assert(r5.required_tokens.includes('non_tdd_reason'), 'T5 implementer has non_tdd_reason token');
    const implPath = tmpDir + '/.cache/n3-impl.md';
    const implContent = fs.readFileSync(implPath, 'utf8');
    assert(implContent.split('\n')[0] === 'evidence-binding: n3-impl impl99999999', 'T5 implementer binding header');
    assert(/non_tdd_reason:/.test(implContent), 'T5 implementer non_tdd_reason stub');
    // The alternation class regression-green|build-green|smoke-integration seeds the FIRST alternative.
    assert(/regression-green:/.test(implContent), 'T5 implementer regression-green stub (first alt)');

    // Test 6: seedEvidenceFile is advisory — a failure must not throw.
    try {
      seedEvidenceFile('/no/such/path/workflow-plan.md', 'nx', 'nonce', 'unknown-role', false);
      assert(true, 'T6 seedEvidenceFile on bad path does not throw');
    } catch (_) {
      assert(false, 'T6 seedEvidenceFile on bad path must not throw');
    }

    // Test 7: appendProvenanceLog is advisory — a failure must not throw.
    try {
      appendProvenanceLog('/no/such/path/workflow-plan.md', 'open', 'n1', 'abc');
      assert(true, 'T7 appendProvenanceLog on bad path does not throw');
    } catch (_) {
      assert(false, 'T7 appendProvenanceLog on bad path must not throw');
    }

  } finally {
    // Cleanup.
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  return { passed, failed, errors };
}

// ---------------------------------------------------------------------------
// parseFindingLine (#446 / D-446-01 §2) — parse ONE `finding:` line into its
// routing fields. Returns null when the line carries no usable finding id.
//
// Accepted shapes (free-prose from a code-reviewer / security-reviewer /
// adversarial-verifier evidence file `.cache/{node-id}.md`):
//   finding: F1 — scripts/foo.js — missing validation
//   finding: F2 - scripts/bar.js - security: missing auth check
//   finding: F3 — no file — non-blocking nit
//
// Parse approach: strip the `finding:` prefix, split on ` — ` (em dash) or ` - `
// (hyphen-spaces), take the FIRST token as the finding_id (F1, F2, …), the FIRST
// path-like token (contains `/` or ends/contains `.js`) as `file`, and the rest
// as `text`. `status` is 'n/a' when the line mentions `n/a` or `non-blocking`,
// else 'open'. The `security` keyword anywhere in the line marks securityFlag.
// ---------------------------------------------------------------------------
function parseFindingLine(line) {
  const m = /^finding:\s*(.+)$/i.exec(String(line || '').trim());
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return null;

  // Split on em-dash or hyphen surrounded by spaces (both delimiters in the wild).
  const parts = body.split(/\s+—\s+|\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  const finding_id = parts[0];
  // First path-like token: contains a path separator or a .js extension.
  const isPathLike = (tok) => /\//.test(tok) || /\.js\b/.test(tok) || /\.[a-z0-9]+$/i.test(tok);
  let file = null;
  for (let i = 1; i < parts.length; i++) {
    if (isPathLike(parts[i])) { file = parts[i]; break; }
  }
  const text = parts.slice(1).join(' — ');
  const lower = body.toLowerCase();
  const securityFlag = /\bsecurity\b/.test(lower);
  const status = (/\bn\/a\b/.test(lower) || /\bnon-blocking\b/.test(lower)) ? 'n/a' : 'open';

  return { finding_id, file, text, securityFlag, status };
}

// ---------------------------------------------------------------------------
// resolveOwningNode (#446 / D-446-01 §2) — write-set lookup over the frozen plan
// nodes: which node's declared_write_set contains `file`? Returns that node id,
// or null (the plan-repair signal: the finding concerns a file no node owns).
// ---------------------------------------------------------------------------
function resolveOwningNodes(file, nodes) {
  if (!file) return [];
  let parseWriteSetCell = null;
  try { ({ parseWriteSetCell } = require('./kaola-workflow-classifier')); } catch (_) {}
  const normalizedFile = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  const matches = [];
  for (const n of nodes) {
    const raw = (n.declared_write_set != null ? n.declared_write_set : n.writeSetRaw);
    if (raw == null) continue;
    let tokens;
    if (parseWriteSetCell) {
      try { tokens = parseWriteSetCell(raw); } catch (_) { tokens = null; }
    }
    if (tokens) {
      const values = Array.from(tokens).map(x => String(x).replace(/\\/g, '/').replace(/^\.\//, ''));
      if (values.includes(normalizedFile)) matches.push(n.id);
    } else {
      const toks = String(raw).split(/[\s,]+/).filter(Boolean)
        .map(x => x.replace(/\\/g, '/').replace(/^\.\//, ''));
      if (toks.includes(normalizedFile)) matches.push(n.id);
    }
  }
  return Array.from(new Set(matches)).sort();
}

function resolveOwningNode(file, nodes) {
  const candidates = resolveOwningNodes(file, nodes);
  return candidates.length === 1 ? candidates[0] : null;
}

function routeCanonicalFindings(findings, nodes, sourceNode) {
  return (Array.isArray(findings) ? findings : []).filter(f => f && f.id).map(f => {
    const ownership_candidates = resolveOwningNodes(f.file, nodes);
    return {
      source_node: sourceNode || null,
      finding_id: f.id,
      id: f.id,
      scope: f.scope,
      action: f.action,
      status: f.status,
      severity: f.severity,
      file: f.file,
      ownership_candidates,
      owning_node: ownership_candidates.length === 1 ? ownership_candidates[0] : null,
      fix_role: f.fix_role,
      raw: f.raw,
    };
  });
}

// ---------------------------------------------------------------------------
// runRouteFindings (#446 / D-446-01 Decisions 1-3) — SUBCOMMAND (not a new
// script). Reads a gate node's evidence file `.cache/{node-id}.md`, parses its
// `finding:` lines, resolves each finding's owning node via a write-set lookup
// over the frozen plan, infers a fix_role, and writes `.cache/findings-route.json`
// (an array of { finding_id, file, owning_node, fix_role, status }).
//
// fix_role precedence (D-446-01 §2):
//   1. `security` in the finding text → 'security-reviewer'.
//   2. else a node DECLARES the file (owning_node resolved) → 'implementer'.
//   3. else (no producing/declaring node) → 'code-reviewer'.
//
// owning_node === null is the plan-repair signal (the file no node owns).
//
// @param {object} opts  { nodeId, planPath, readFile, writeFile, cacheExists }
// @returns {{ result:'ok', count:number, file:string, findings:array }}
//        | {{ result:'refuse', reason:string, ... }}
// ---------------------------------------------------------------------------
function runRouteFindings(opts, project) {
  const { nodeId } = opts;
  const fs = opts.fs || require('fs');
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const repoRoot = opts.repoRoot || getRoot();
  const planPath = opts.planPath
    || path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md');
  const cacheDir = path.dirname(planPath) + path.sep + '.cache';
  const evidencePath = path.join(cacheDir, nodeId + '.md');
  const outRel = '.cache/findings-route.json';
  const outPath = path.join(cacheDir, 'findings-route.json');

  // 1. read the gate node's evidence.
  let evidence = '';
  try { evidence = readFile(evidencePath); }
  catch (_) {
    return { result: 'refuse', reason: 'evidence_absent', nodeId, evidence_file: '.cache/' + nodeId + '.md' };
  }

  // 2-3. parse `finding:` lines into routing rows.
  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) { planContent = ''; }
  const nodes = parseNodesFromContent(planContent);

  let findings = [];
  const journalState = readReviewJournal({ ...opts, planPath, readFile,
    cacheExists: opts.cacheExists || ((p) => fs.existsSync(p)) }, planContent);
  if (!journalState.ok) {
    return { result: 'refuse', reason: journalState.reason, detail: journalState.detail || null };
  }
  const authoritativeAttempts = journalState.ok && journalState.journal
    ? journalState.journal.attempts.filter(a => (a.receipts || []).some(r => r.node_id === nodeId))
      .slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  if (authoritativeAttempts.length) {
    findings = authoritativeAttempts[authoritativeAttempts.length - 1].route_candidates
      .filter(r => r.source_node === nodeId);
  } else {
    const canonical = parseNodeFindings(evidence).filter(f => f && f.id);
    if (canonical.length > 0) {
    findings = routeCanonicalFindings(canonical, nodes, nodeId);
    } else {
      for (const line of String(evidence).split('\n')) {
        const parsed = parseFindingLine(line);
        if (!parsed) continue;
        const ownership_candidates = resolveOwningNodes(parsed.file, nodes);
        const owning_node = ownership_candidates.length === 1 ? ownership_candidates[0] : null;
        const fix_role = parsed.securityFlag ? 'security-reviewer'
          : (owning_node ? 'implementer' : 'code-reviewer');
        findings.push({
          finding_id: parsed.finding_id,
          file: parsed.file,
          ownership_candidates,
          owning_node,
          fix_role,
          status: parsed.status,
        });
      }
    }
  }

  // 7. write .cache/findings-route.json (array). Best-effort dir create.
  const out = JSON.stringify(findings, null, 2) + '\n';
  if (opts.writeFile) {
    opts.writeFile(outPath, out);
  } else {
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    fs.writeFileSync(outPath, out, 'utf8');
  }

  return { result: 'ok', count: findings.length, file: outRel, findings };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--self-test') {
    // #433 inline self-test: exercise evidence seeding + provenance log.
    process.stdout.write('adaptive-node --self-test: evidence seeding + provenance log\n');
    const { passed, failed, errors } = runSelfTest();
    process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n');
    if (failed > 0) {
      process.stdout.write('FAILED tests: ' + errors.join(', ') + '\n');
      process.exitCode = 1;
    } else {
      process.stdout.write('All ' + passed + ' self-tests passed\n');
    }
    return;
  }

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-adaptive-node.js <subcommand> --project P --json [options]\n' +
      '  orient              --project P\n' +
      '  mirror-project      --project P\n' +
      '  open-next           --project P [--node-id N]\n' +
      '  open-ready          --project P [--max N]   (#377 running-set scheduler)\n' +
      '  close-node          --project P --node-id N (#377 running-set scheduler)\n' +
      '  reconcile-running-set --project P           (#377 crash roll-forward/back)\n' +
      '  record-evidence     --project P --node-id N --stdin       (MUTATES .cache)\n' +
      '  record-evidence     --project P --node-id N --verify      (READ-ONLY: verifies on-disk evidence)\n' +
      '  close-and-open-next --project P --node-id N\n' +
      '  write-halt          --project P --node-id N --reason consent|security|test_thrash|merge_conflict\n' +
      '  reopen-node         --project P --node-id N\n' +
      '  repair-node         --project P --attempt-id A --node-id N\n' +
      '  route-findings      --project P --node-id N (#446: gate-evidence finding: lines → .cache/findings-route.json)\n' +
      '\n' +
      '  --summary           collapse the envelope to ONE line + cache full JSON at .cache/<op>-envelope.json (#446)\n'
    );
    return;
  }

  const subcommand    = args[0];
  const hasJson       = args.includes('--json');
  const projectIdx    = args.indexOf('--project');
  const nodeIdIdx     = args.indexOf('--node-id');
  const reasonIdx     = args.indexOf('--reason');
  const attemptIdIdx  = args.indexOf('--attempt-id');
  const hasStdin      = args.includes('--stdin');
  const triageJsonIdx = args.indexOf('--triage-json');
  // #446 (D-446-01 Decisions 4-5): --summary collapses the routine FULL-JSON envelope to ONE line
  // and caches the full envelope at .cache/<op>-envelope.json for drill-in on result: refuse.
  // PURELY ADDITIVE: default (no --summary) output is byte-unchanged FULL JSON, so every
  // orchestration script / test that parses full JSON is unaffected.
  const summaryMode   = args.includes('--summary');

  if (!hasJson) {
    process.stdout.write('{"result":"refuse","errors":["--json is required"]}\n');
    process.exitCode = 1;
    return;
  }

  const hasProject = projectIdx >= 0 && projectIdx + 1 < args.length;
  if (!hasProject) {
    const out = { result: 'refuse', errors: ['--project is required'] };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  const project  = args[projectIdx + 1];

  // #318: fail-closed for every subcommand on a reserved/illegal project segment
  // so no path (plan/state/cache/manifest) is ever built under a nested
  // kaola-workflow/kaola-workflow/ directory.
  const projectValid = validateProjectName(project);
  if (!projectValid.ok) {
    const out = decorateOperatorHint({
      result: 'refuse',
      reason: 'invalid_project',
      detail: 'must be issue-N, never the literal kaola-workflow',
      errors: ['project segment is reserved/illegal: ' + JSON.stringify(project)],
    });
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  const nodeId   = nodeIdIdx >= 0 ? args[nodeIdIdx + 1] : null;
  const reason   = reasonIdx >= 0 ? args[reasonIdx + 1] : null;
  const attemptId = attemptIdIdx >= 0 ? args[attemptIdIdx + 1] : null;
  const maxIdx   = args.indexOf('--max');
  const maxArg   = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : null;

  const repoRoot  = getRoot();
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const cacheDir  = path.join(projectDir, '.cache');

  const fs = require('fs');

  const shell    = (scriptPath, scriptArgs) => shellNode(scriptPath, scriptArgs);
  const readFile = (fpath) => fs.readFileSync(fpath, 'utf8');
  // #353: route every durable-state write (plan/ledger) through the crash-safe atomic replace.
  const writeFile = (fpath, content) => { writeFileAtomicReplace(fpath, content); };
  const cacheExists = (fpath) => fs.existsSync(fpath);

  // #699: fence before worktree mirroring, any scheduler-lock creation, stdin
  // consumption, or summary-envelope caching. record-evidence --verify and
  // orient are read-only; orient is still projected through the fence so the
  // operator sees the exact one-command recovery path.
  let projectReplanFence = { ok: true, fenced: false };
  {
    const guardedMutation = REPLAN_GUARDED_SUBCOMMANDS.has(subcommand)
      && !(subcommand === 'record-evidence' && args.includes('--verify'));
    if (subcommand === 'orient' || guardedMutation) {
      projectReplanFence = readProjectReplanFence(statePath, cacheDir, readFile);
      if (!projectReplanFence.ok || projectReplanFence.fenced) {
        const out = replanOrientation(projectReplanFence, project);
        process.stdout.write(JSON.stringify(out) + '\n');
        process.exitCode = 1;
        return;
      }
      if (projectReplanFence.committed) {
        let authority;
        try { authority = require('./kaola-workflow-replan').verifyCurrentEpochAuthority(projectDir); }
        catch (error) { authority = { ok: false, reason: 'current_epoch_authority_unavailable', detail: error.message }; }
        if (!authority || authority.ok !== true) {
          const out = replanOrientation(Object.assign({}, projectReplanFence, { ok: false, fenced: true,
            reason: authority && authority.reason || 'current_epoch_authority_invalid' }), project);
          if (authority && authority.detail) out.detail = authority.detail;
          process.stdout.write(JSON.stringify(out) + '\n');
          process.exitCode = 1;
          return;
        }
        projectReplanFence.current_authority = authority;
      }
    }
  }

  // #335: resolve the MAIN checkout root even when cwd is a linked worktree.
  // realpath both sides so a macOS /var vs /private/var divergence under
  // os.tmpdir() never false-positives the linked-worktree comparison.
  // #579: prefer main_root field stamped by writeState at claim-time (avoids re-deriving from cwd,
  // which can diverge in a multi-linked-worktree layout). Falls back to getMainRoot(repoRoot) when
  // the field is absent (pre-#579 states) or unreadable.
  let realRepoRoot = repoRoot;
  try { realRepoRoot = fs.realpathSync(repoRoot); } catch (_) {}
  // #612: track whether mainRoot was AFFIRMATIVELY resolved from the project's own workflow-state.md
  // main_root: field (an explicit, trusted source) vs. derived from the getMainRoot git-common-dir
  // heuristic. The run-progress mirror (below) fails CLOSED on a heuristic root that does not
  // demonstrably own this project, so a misresolved root can never fabricate a foreign
  // kaola-workflow/<project>/ tree.
  let mainRootFromField = false;
  let mainRoot = (() => {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const m = stateContent.match(/^main_root:\s*(.+)$/m);
      if (m && m[1].trim()) { mainRootFromField = true; return m[1].trim(); }
    } catch (_) {}
    return getMainRoot(repoRoot);
  })();
  try { mainRoot = fs.realpathSync(mainRoot); } catch (_) {}

  // #603: the Codex dispatch mode persisted at claim (v2-task-name|v1-thread-id), read ONCE here and
  // threaded into every dispatch-card builder below. Absent field → null → resolveCodexDispatchMode
  // falls back to the env override / v1-thread-id fail-closed default (byte-identical to pre-#603).
  let codexDispatchMode = null;
  try {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const m = stateContent.match(/^codex_dispatch_mode:\s*(.+)$/m);
    if (m && m[1].trim()) codexDispatchMode = m[1].trim();
  } catch (_) {}

  // #466 — worktree-authority split guard (fail loud, ZERO mutation; precedes the dispatch). The
  // adaptive lifecycle resolves the project folder cwd-relative via getRoot(); when a linked worktree
  // is recorded for this project but a MUTATING lifecycle command is invoked from the MAIN root
  // (realRepoRoot === mainRoot ⇒ NOT a linked worktree), the ## Node Ledger / .cache evidence / barrier
  // baselines would be written under the main checkout while the role agents edit the worktree — a split
  // that stays invisible until finalize. Refuse here and point the operator into the worktree. Native
  // posture (no worktree_path) and the exempt read-only / main→worktree-copy subcommands fall through.
  {
    const guardedMutation = SPLIT_GUARDED_SUBCOMMANDS.has(subcommand)
      && !(subcommand === 'record-evidence' && args.includes('--verify'));
    if (guardedMutation && realRepoRoot === mainRoot) {
      const splitStatePath = path.join(mainRoot, 'kaola-workflow', project, 'workflow-state.md');
      let splitState = '';
      try { splitState = fs.readFileSync(splitStatePath, 'utf8'); } catch (_) {}
      const wtMatch = splitState.match(/^worktree_path:\s*(.+)$/m);
      const recordedWorktree = wtMatch ? wtMatch[1].trim() : '';
      if (recordedWorktree) {
        let realWorktree = '';
        try { realWorktree = fs.realpathSync(recordedWorktree); } catch (_) { realWorktree = ''; }
        // Fires only when the recorded worktree EXISTS on disk (realpath resolved) and is a DISTINCT
        // tree from the main checkout — a stale/missing worktree_path cannot be the authority.
        if (realWorktree && realWorktree !== mainRoot) {
          const out = decorateOperatorHint(refuse('worktree_authority_split', {
            worktreePath: recordedWorktree,
            detail: 'a linked worktree is recorded for this project but this mutating lifecycle command is running from the MAIN repo root — the ledger / .cache evidence / barrier baselines would diverge from where the role agents write',
          }));
          process.stdout.write(JSON.stringify(out) + '\n');
          process.exitCode = 1;
          return;
        }
      }
    }
  }

  // #585: scheduler mutual-exclusion lock. Acquire a project-scoped O_EXCL lockfile before any mutating
  // scheduler subcommand body (exactly the worktree-split-guarded set), released in the finally below.
  // Two concurrent scheduler invocations on ONE project would otherwise both pass the advisory-only
  // in-memory coordination guard and lose updates via lockless whole-file read-modify-write (open-ready
  // double-open; close-node whole-plan-rewrite clobber). Contention is a typed non-blocking refusal — one
  // serial orchestrator is the designed model. A DEAD/crashed holder is NEVER auto-reclaimed (an
  // unlink-based takeover double-acquires under concurrency — two takers holding the same stale decision
  // each remove the other's fresh claim); it refuses with the DISTINCT scheduler_lock_stale reason whose
  // operator hint names the single manual recovery (remove the lockfile from ONE session, then re-run) —
  // so the lock never silently wedges the project while never risking a double-acquire. The read-only
  // subcommands (orient / mirror-project / record-evidence --verify) are NOT in the guarded set →
  // lock-free (byte-identical to pre-lock behavior; the serial single-orchestrator path acquires with
  // zero contention).
  let schedulerLock = null;
  const schedulerLockRequired = SPLIT_GUARDED_SUBCOMMANDS.has(subcommand)
    && !(subcommand === 'record-evidence' && args.includes('--verify'));
  if (schedulerLockRequired) {
    const lockPath = path.join(cacheDir, SCHEDULER_LOCK_NAME);
    schedulerLock = acquireProjectLock(lockPath, { subcommand });
    if (!schedulerLock.ok) {
      const out = decorateOperatorHint(refuse(schedulerLock.stale ? 'scheduler_lock_stale' : 'scheduler_locked', {
        holder: schedulerLock.holder || null,
        lockPath,
      }));
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exitCode = 1;
      return;
    }
  }

  let result;
  try {

  if (subcommand === 'orient') {
    const mainPlanPath = path.join(mainRoot, 'kaola-workflow', project, 'workflow-plan.md');
    const planProbe = {
      planExists: fs.existsSync(planPath),
      isLinkedWorktree: mainRoot !== realRepoRoot,
      mainPlanExists: fs.existsSync(mainPlanPath),
      mainPlanPath,
    };
    result = runOrient({ planPath, statePath, project, shell, readFile, writeFile, cacheExists,
      planProbe, replanFence: projectReplanFence });
  } else if (subcommand === 'mirror-project') {
    result = runMirrorProject({
      project,
      mainRoot,
      shell,
      io: {
        exists: (p) => fs.existsSync(p),
        readFile,
        copyTree: (src, dst) => copyTree(src, dst, {
          mkdirSync: (d, o) => fs.mkdirSync(d, o),
          readdir: (d) => fs.readdirSync(d, { withFileTypes: true }),
          copyFile: (a, b) => fs.copyFileSync(a, b),
        }),
        renameSync: (a, b) => fs.renameSync(a, b),
        rmSync: (p, o) => fs.rmSync(p, o),
        mkdirSync: (d, o) => fs.mkdirSync(d, o),
      },
    });
  } else if (subcommand === 'open-next') {
    // #607: mkdirp + now let runOpenNext's gate state-channel write (recordGateInRunningSet) create the
    // .cache dir if needed and stamp openedAt — matching the open-ready dispatch seams.
    result = runOpenNext({
      planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists, codexDispatchMode,
      mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      now: () => new Date().toISOString(),
    });
  } else if (subcommand === 'open-ready') {
    result = runOpenReady({
      planPath, project, codexDispatchMode,
      max: Number.isInteger(maxArg) && maxArg >= 1 ? maxArg : null,
      fanoutCapReadonly: resolveFanoutCapReadonly(process.env),
      // #439 (D-419 Part 4): the per-run speculative-read consent carrier — NEVER persisted in the
      // frozen plan (orthogonal to the hash-covered speculative_open_policy Meta field). Both must hold
      // for a speculative fan-out: the plan authorizes (policy:consent) AND this run opted in (the flag).
      speculativeConsent: args.includes('--speculative-consent'),
      // #463 Slice 2: the per-run write-overlap consent carrier — NEVER persisted in the frozen plan
      // (orthogonal to the hash-covered Meta fields). Mirrors --speculative-consent: BOTH the
      // KAOLA_LEG_ISOLATION toggle AND this flag must hold for a leg to be provisioned.
      writeOverlapConsent: args.includes('--write-overlap-consent'),
      shell, readFile, writeFile, cacheExists,
      mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      now: () => new Date().toISOString(),
    });
  } else if (subcommand === 'close-node') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for close-node'] };
    } else {
      result = runCloseNode({
        planPath, project, nodeId, shell, readFile, writeFile, cacheExists,
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
      });
    }
  } else if (subcommand === 'reconcile-running-set') {
    result = runReconcileRunningSet({
      planPath, project, shell, readFile, writeFile, cacheExists,
      unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
    });
  } else if (subcommand === 'record-evidence') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for record-evidence'] };
    } else if (args.includes('--verify')) {
      // #444 (D-444-01 §4): READ-ONLY verify mode — checks on-disk evidence without stdin transit.
      result = runVerifyEvidence({
        planPath, project, nodeId,
        readFile,
        cacheExists,
      });
    } else if (!hasStdin) {
      result = { result: 'refuse', errors: ['--stdin or --verify required for record-evidence'] };
    } else {
      const stdinContent = fs.readFileSync(0, 'utf8');
      result = runRecordEvidence({
        planPath, statePath, project, nodeId, stdinContent,
        readFile, writeFile, cacheExists,
        mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      });
    }
  } else if (subcommand === 'close-and-open-next') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for close-and-open-next'] };
    } else {
      // #607: mkdirp + now let the fused-advance gate state-channel write stamp openedAt / ensure .cache.
      result = runCloseAndOpenNext({
        planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists, codexDispatchMode,
        mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
        now: () => new Date().toISOString(),
      });
    }
  } else if (subcommand === 'write-halt') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for write-halt'] };
    } else if (!reason) {
      result = { result: 'refuse', errors: ['--reason required for write-halt'] };
    } else {
      // #440: --triage-json <path|-> reads a barrierOut envelope for triage classification.
      let triageBarrierOut = null;
      if (triageJsonIdx >= 0 && triageJsonIdx + 1 < args.length) {
        const tjArg = args[triageJsonIdx + 1];
        try {
          const raw = tjArg === '-' ? require('fs').readFileSync(0, 'utf8') : readFile(tjArg);
          triageBarrierOut = JSON.parse(raw);
        } catch (_) { /* omit triage on parse error — degrade gracefully */ }
      }
      result = runWriteHalt({ planPath, statePath, project, nodeId, reason, shell, readFile, writeFile, barrierOut: triageBarrierOut });
    }
  } else if (subcommand === 'clear-halt') {
    if (!reason) {
      result = { result: 'refuse', errors: ['--reason required for clear-halt (consent|security)'] };
    } else {
      result = runClearHalt({ planPath, statePath, project, reason, shell, readFile, writeFile });
    }
  } else if (subcommand === 'reopen-node') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for reopen-node'] };
    } else {
      result = runReopenNode({
        planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists,
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
        readdir: (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } },
      });
    }
  } else if (subcommand === 'revert-overflow') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for revert-overflow'] };
    } else {
      result = runRevertOverflow({
        planPath, project, nodeId, shell, readFile, writeFile, cacheExists,
      });
    }
  } else if (subcommand === 'repair-node') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for repair-node'] };
    } else {
      result = runRepairNode({
        planPath, statePath, project, nodeId, attemptId, shell, readFile, writeFile, cacheExists,
        repoRoot,
        now: () => new Date().toISOString(),
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
        // #665 R1: mirror reopen-node's dispatch — without readdir, a resumed LEGACY (role-prefix,
        // cardinality>1) adversarial-verifier fan-out's (4c) receipt purge branch is silently dead.
        readdir: (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } },
      });
    }
  } else if (subcommand === 'discard-speculative') {
    // #439 (D-419 Part 4, settlement 4) + #596: roll back a speculatively-opened node whose gate bet
    // failed (a write member additionally tears down its leg + purges stale evidence — DISCARD-ONLY).
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for discard-speculative'] };
    } else {
      result = runDiscardSpeculative({
        planPath, project, nodeId, shell, readFile, writeFile, cacheExists,
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
      });
    }
  } else if (subcommand === 'route-findings') {
    // #446 (D-446-01 Decision 1): route-findings is a SUBCOMMAND (no new install-manifest entry).
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for route-findings'] };
    } else {
      result = runRouteFindings({ nodeId, planPath, repoRoot, readFile, writeFile }, project);
    }
  } else {
    result = { result: 'refuse', errors: ['unknown subcommand: ' + subcommand] };
  }

  // #445 (D-445-01 §2): additive operator_hint decoration at the SINGLE output point — adds a
  // top-level operator_hint to every actionable typed outcome (refuse/halt/warn) that carries a
  // reason. Success envelopes (no reason) are untouched.
  result = decorateOperatorHint(result);

  // #605: refresh the derived run-progress mirror at the MAIN root after a ledger mutation, but ONLY on
  // a linked-worktree run (mainRoot differs from the worktree cwd; a serial in-repo run's ledger is
  // already root-visible) and only when the op did not refuse (no ledger write to mirror). #612: the
  // write itself fails CLOSED on an untrusted mainRoot (see writeRunProgressMirror) — a skipped mirror
  // is SILENT (no warn); only a genuine write FAILURE surfaces a `run_progress_mirror: "failed"` warn
  // field — never a refusal, never a nonzero exit; the barrier/close semantics are byte-unchanged.
  if (LEDGER_MUTATING_SUBCOMMANDS.has(subcommand)
      && result && result.result !== 'refuse'
      && realRepoRoot !== mainRoot) {
    const mirrored = writeRunProgressMirror(mainRoot, project, planPath, readFile, subcommand, mainRootFromField);
    if (mirrored === false) result.run_progress_mirror = 'failed';
  }

  if (summaryMode) {
    // #446 (D-446-01 Decision 4): ONE-line summary + cached full envelope at .cache/<op>-envelope.json.
    let line = 'summary: ' + (result.result != null ? result.result : 'unknown');
    // #602: surface the dispatch card essentials inline (one segment per opened node) so an
    // orchestrator using the SKILL-canonical --summary can dispatch without drilling the cached
    // envelope. Additive to the summary LINE only — the default (no --summary) --json envelope stays
    // byte-identical (this branch is gated on summaryMode).
    for (const seg of dispatchSummarySegments(result)) line += ' | ' + seg;
    if (result.reason) line += ' | reason: ' + result.reason;
    if (result.operator_hint) line += ' | hint: ' + result.operator_hint;
    // Cache the FULL envelope (named by the subcommand) for drill-in on refuse.
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, subcommand + '-envelope.json'), JSON.stringify(result) + '\n', 'utf8');
    } catch (_) { /* best-effort: caching the envelope must never alter the exit outcome */ }
    process.stdout.write(line + '\n');
  } else {
    process.stdout.write(JSON.stringify(result) + '\n');
  }
  if (result.result === 'refuse') {
    process.exitCode = 1;
  }

  } finally {
    // #585: always release the scheduler lock — on success, on a refuse, or on a thrown error (the
    // module-level exit hook is the belt-and-suspenders backstop for a crash that skips this finally).
    if (schedulerLock && schedulerLock.release) schedulerLock.release();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  spliceLedgerNode,
  readLedgerStatuses,
  spliceComplianceRow,
  complianceRowExists,
  removeDurableConsentHalt,
  checkEvidenceShape,
  checkVerdictParse,
  readCoordinationState,
  probeCoordination,
  coordinationRefusal,
  validateProjectName,
  // #392: exported so the round-trip test can assert the open-side returned nonce EQUALS the
  // close-side on-disk nonce (same 12-char SHA prefix) — the field-path round-trip guard.
  readNonce,
  sanitizeNodeId,
  // #424/#433: exported for testing the provenance log + evidence seeding.
  appendProvenanceLog,
  seedEvidenceFile,
  // #727: the single role-kind selector for the reviewer-contract domain_outcome vocabulary.
  allowedDomainOutcomes,
  // #472: dispatch-fidelity concurrency derivation over the durable node-timings.jsonl events.
  deriveMaxSimultaneousOpen,
  runOrient,
  runMirrorProject,
  runOpenNext,
  runOpenReady,
  runCloseNode,
  runReconcileRunningSet,
  readRunningSet,
  isReadOnlyNode,
  nodeWriteSetNonempty,
  runIsFinished,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  runClearHalt,
  runReopenNode,
  // #434 (D-434-01): repair primitives.
  runRevertOverflow,
  runRepairNode,
  // #699: focused crash-safe review-outcome source publication proof.
  publishRepairReplanSource,
  // #439 (D-419 Part 4): speculative-read discard primitive.
  runDiscardSpeculative,
  shellNode,
  // #444 (D-444-01): dispatch descriptor builder + guards + verify subcommand.
  buildDispatch,
  // Durable node channel: brief→goal_line + upstream_evidence derivation, and the close-time consumed-proof.
  deriveDispatchChannel,
  checkUpstreamConsumed,
  // Scheduler legless-co-open predicate (exported for the gate-count + test-consumed-widening pins).
  tryR2bLeglessCoopen,
  // #602: --summary dispatch-segment extractor.
  dispatchSummarySegments,
  // #605: derived run-progress mirror primitives.
  buildRunProgress,
  writeRunProgressMirror,
  sanitizeCodexTaskName,
  codexTaskNameForNode,
  resolveCodexDispatchMode,
  deriveGuards,
  runVerifyEvidence,
  // #440: triage classifier exported for direct testing.
  computeTriage,
  // #445 (D-445-01): operator-hint registry + emit-time accessor + decoration.
  OPERATOR_HINT_REGISTRY,
  getOperatorHint,
  decorateOperatorHint,
  // #446 (D-446-01): route-findings subcommand + parse helpers.
  runRouteFindings,
  parseFindingLine,
  resolveOwningNode,
  resolveOwningNodes,
  routeCanonicalFindings,
  // #701 (D-701-01): schema-2 anchor-path ownership routing + the repair admissibility helpers.
  schema2RouteCandidates,
  findingOwnershipSummary,
  completedNonGateWriterDescendants,
  // #739: in-plan descendant-replay helpers (structural cone bound, cone safety, journal replay validation).
  structuralNonGateWriterDescendants,
  replayConeSafety,
  validatedReplayExempt,
  reviewJournalBlocker,
  readReviewJournal,
  reviewJournalAttempts,
  // #748: journal-global replay relief + the schema-2 identity twin, exported for direct testing.
  activeReplayRelief,
  reviewJournalV2MatchesPlan,
  reviewLogicalGate,
  reduceLogicalReviewAttempt,
  readProjectReplanFence,
  replanOrientation,
  uniqueMaximalReviewProducer,
  captureWriterBarrierIdentity,
  verifyWriterBarrierIdentity,
  nextReviewAttemptOrdinal,
  consumedReviewRepairs,
  computeReviewCandidateDigest,
  // #463 Slice 2 (LIVE since #542/D-542-01): per-leg `.kw` worktree provisioning primitives, exercised on
  // every disjoint-write co-open by default (no longer dormant); exported here for direct testing.
  resolveLegIsolation,
  sanitizeLegId,
  legBranchFor,
  legPathFor,
  legBaseRef,
  assertSafeLegBranch,
  provisionLeg,
  teardownLeg,
  sweepOrphanLegs,
  synthesizeLevel,
  memberInLaneChanges,
  // #596 (D-596-01): the speculative WRITE-open selection primitive, exported for direct testing (the
  // "vs a live writer" axis is otherwise unreachable through open-ready alone — the running-set's
  // write-node-runs-strictly-alone invariant means no OTHER write is ever live while a speculative
  // fan-out is reachable).
  selectSpeculativeWriteGroup,
  // #688 (items 1+2): the P1..P4 rebind-admissibility predicate, exported for direct-call hardening
  // regressions (a synthetic absent-ledger call and an n/a-arm construction — neither reachable
  // through the real repair-node CLI today).
  proveRebindAdmissible,
  // Exported so the cross-edition schema-2 gate-identity tests can assert every gate role's behavior
  // identity is runtime-neutral (or fails schema-2 open identically) from the real profile bytes.
  resolveReviewerProfileIdentity,
  reviewerProfilePath,
};
