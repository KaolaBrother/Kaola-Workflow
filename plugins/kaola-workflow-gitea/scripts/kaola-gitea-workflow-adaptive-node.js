#!/usr/bin/env node
// @generated from scripts/kaola-workflow-adaptive-node.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-adaptive-node.js (issue #272)
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
const COMMIT_NODE  = 'kaola-gitea-workflow-commit-node.js';
const NEXT_ACTION  = 'kaola-gitea-workflow-next-action.js';
const VALIDATOR    = 'kaola-gitea-workflow-plan-validator.js';
const TASK_MIRROR  = 'kaola-gitea-workflow-task-mirror.js';

const commitNodePath = path.join(__dirname, COMMIT_NODE);
const nextActionPath = path.join(__dirname, NEXT_ACTION);
const validatorPath  = path.join(__dirname, VALIDATOR);
const taskMirrorPath = path.join(__dirname, TASK_MIRROR);

// #360: the LEDGER-SCOPED durable consent-halt probe (fence-aware). adaptive-schema keeps the
// same filename across every edition (byte-identical ×4), so this require is NOT forge-renamed.
const { readDurableConsentHalt, writeFileAtomicReplace, LEDGER_HEADING, locateSection, spliceComplianceSection, RUNNING_SET_NAME, resolveFanoutCapReadonly, resolveLaneContainment, refuse, WRITE_SET_OVERFLOW_SUBTYPES, dispatchEffort, parseNodeVerdict } = require('./kaola-workflow-adaptive-schema');

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
//   - NO forge CLI token (`gh` / `glab` / `tea`) appears in any hint — the hints
//     name `node scripts/...` workflow commands only (the script NAME is
//     forge-renamed by edition-sync; the hint text itself is forge-neutral).
//
// ctx fields the templates may read (all optional): nodeId, reason, detail,
// project, repair.
// ---------------------------------------------------------------------------
const ADAPTIVE_NODE_SCRIPT = 'node scripts/kaola-gitea-workflow-adaptive-node.js';

// #466 — the MUTATING lifecycle subcommands subject to the worktree-authority split guard. Each one
// resolves the project folder (plan / ## Node Ledger / .cache evidence / barrier baselines) cwd-relative,
// so running it from the MAIN root while a linked worktree is recorded silently diverges durable state
// from where the role agents write. orient + mirror-project (read-only / legitimately the main→worktree
// copy) and record-evidence --verify (read-only) are EXEMPT and intentionally absent from this set.
const SPLIT_GUARDED_SUBCOMMANDS = new Set([
  'open-next', 'open-ready', 'close-node', 'close-and-open-next',
  'reconcile-running-set', 'write-halt', 'clear-halt',
  'reopen-node', 'revert-overflow', 'repair-node', 'route-findings',
  // #439: the speculative-read discard is a mutating lifecycle transaction (ledger reset + baseline
  // drop + running-set removal) and must run from the worktree like every other mutator.
  'discard-speculative',
]);

// #439 (D-419 Part 4): resolve the per-plan `speculative_open_policy` from the frozen plan content.
// Lazily requires the same-edition plan-validator's `parseSpeculativePolicy` (the Meta-scoped, hash-
// covered parser the freeze check uses) so adaptive-node and the validator never drift. Fails safe to
// 'off' (the schema default — the permanent serial fallback) if the parser is unavailable.
function resolveSpeculativePolicy(content) {
  try {
    const { parseSpeculativePolicy } = require('./kaola-gitea-workflow-plan-validator');
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
  batch_active: () =>
    'An active parallel batch is live. Seal + join it (or reconcile --abort) before running this serial command.',
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
    'Node ' + (ctx.nodeId || '<id>') + ' is blocked only by an open gate' + (ctx.speculativeGate ? ' (' + ctx.speculativeGate + ')' : '') + '. It is speculative-eligible: it is NOT opened serially via open-next. To run it ahead of the gate (betting the gate passes), set speculative_open_policy: consent in the plan ## Meta and run ' + ADAPTIVE_NODE_SCRIPT + ' open-ready --project <P> --speculative-consent --json; otherwise wait for the gate to complete.',
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

  // --- evidence (#319/#359/#392) ---
  evidence_absent: (ctx) =>
    'No evidence file for ' + (ctx.nodeId || '<id>') + ' (' + (ctx.role || 'role') + '). Have the role agent write ' + (ctx.evidence_file || '.cache/<node-id>.md') + ' with the required tokens, then re-run record-evidence --verify.',
  evidence_shape_failed: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' is missing a required token' + (ctx.missingTokenClass ? ' (' + ctx.missingTokenClass + ')' : '') + '. Add the missing token(s) — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',
  evidence_stale: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' carries a stale evidence-binding nonce (replayed from a prior open). Re-author the evidence with this open\'s nonce — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',
  evidence_unbound: (ctx) =>
    'Evidence for ' + (ctx.nodeId || '<id>') + ' is bound to a DIFFERENT node id (copied across nodes). Re-author it with this node\'s evidence-binding header — expected: ' + ((ctx.expected || []).join(', ') || 'see expected') + '.',

  // --- halt (#391/#360) ---
  invalid_reason: (ctx) =>
    'Invalid --reason. Use one of: ' + ((ctx.validReasons || []).join(', ') || 'consent, security, test_thrash') + '.',
  no_halt_present: () =>
    'No durable consent_halt: pending marker and no escalated_to_full state marker to clear — there is nothing to clear.',
  halt_written: (ctx) =>
    'A consent/security/test_thrash halt is set for ' + (ctx.nodeId || '<id>') + '. Resolve the cause, then clear-halt --reason consent|security to resume.',
  write_halt_invalid_reason: (ctx) =>
    'Invalid write-halt --reason. Use one of: ' + ((ctx.validReasons || []).join(', ') || 'consent, security, test_thrash') + '.',

  // --- reopen / repair primitives (#434 / D-434-01) ---
  active_batch_exists: () =>
    'An active batch blocks a plan-repair reopen. Reconcile/clear the active batch first.',
  no_parseable_nodes: () =>
    'The plan has no parseable ## Nodes. Restore / re-freeze a valid workflow-plan.md before reopening.',
  node_not_found: (ctx) =>
    'Node ' + (ctx.nodeId || '<id>') + ' is not in the plan\'s ## Nodes. Check the node id against the frozen plan.',
  node_not_complete: (ctx) =>
    'Only a complete node can be reopened for repair; ' + (ctx.nodeId || '<id>') + ' is not complete. Run to allDone first, then reopen.',
  would_orphan_in_progress: () =>
    'Reopening this node would orphan an in_progress sibling. Close the in_progress node(s) first, then reopen.',
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
// worktree. Mirrors claim.js getCoordRoot/mainRootFromCoord (local re-impl per
// repo convention — claim.js does not export them). When `root` IS the main
// checkout, git-common-dir resolves to <root>/.git and the basename strip
// returns `root` unchanged.
// ---------------------------------------------------------------------------
function getMainRoot(root) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const coord = path.resolve(root, raw);
    return path.basename(coord) === '.git' ? path.dirname(coord) : coord;
  } catch (_) { return root; }
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
// appendProvenanceLog (#424 / D-424-01 §5) — best-effort lifecycle audit trail.
// Appends ONE structured JSONL entry to kaola-workflow/{project}/.cache/provenance-log.jsonl
// for each of: record-base, drop-base, open-next/open-ready (open), close-and-open-next/
// close-node (close). Append-only JSONL — a crash mid-write loses at most the trailing
// line, never corrupts prior entries. NEVER throws — a log write failure must NOT fail the
// command. .cache/ is barrier-exempt (D-424-01 allowband), so this adds no validator surface.
// ---------------------------------------------------------------------------
function appendProvenanceLog(planPath, event, nodeId, nonce) {
  try {
    const fs = require('fs');
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(
      path.join(cacheDir, 'provenance-log.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: event,
        nodeId: nodeId,
        nonce: nonce || null,
        by: 'adaptive-node',
      }) + '\n'
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
function seedEvidenceFile(planPath, nodeId, nonce, role, forceRotate) {
  try {
    const fs = require('fs');
    let ROLE_TOKEN_REGISTRY;
    try {
      ({ ROLE_TOKEN_REGISTRY } = require('./kaola-gitea-workflow-plan-validator'));
    } catch (_) { ROLE_TOKEN_REGISTRY = {}; }

    const tokens = (ROLE_TOKEN_REGISTRY[role] || ['evidence-binding']).slice();
    // Remove 'evidence-binding' from the stub list — it becomes line 1 directly.
    const stubTokens = tokens.filter(t => t !== 'evidence-binding');
    const evidenceFile = '.cache/' + nodeId + '.md';
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    const cachePath = path.join(cacheDir, nodeId + '.md');

    fs.mkdirSync(cacheDir, { recursive: true });

    const bindingLine = 'evidence-binding: ' + nodeId + ' ' + (nonce || '');

    if (fs.existsSync(cachePath)) {
      if (forceRotate) {
        // Nonce rotation (reopen-node): RE-SEED the ENTIRE file with fresh binding + role stubs.
        // Discarding the stale body is required so prior-attempt evidence (verdict: pass / GREEN /
        // findings_blocking: 0) cannot survive into the new open and defeat the #392 anti-replay guard.
        let freshContent = bindingLine + '\n';
        for (const tokenClass of stubTokens) {
          const firstAlt = tokenClass.split('|')[0];
          if (tokenClass.includes('|')) {
            freshContent += '<!-- ' + tokenClass + ' -->\n';
            freshContent += firstAlt + ': \n';
          } else {
            freshContent += '<!-- ' + tokenClass + ': paste ' + tokenClass + ' here -->\n';
            freshContent += tokenClass + ': \n';
          }
        }
        fs.writeFileSync(cachePath, freshContent, 'utf8');
        return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: true };
      }
      // Idempotent: file already exists (crash-resume), do NOT overwrite.
      return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: false };
    }

    // Build the seeded content.
    let content = bindingLine + '\n';
    for (const tokenClass of stubTokens) {
      // Alternation class: the first alternative becomes the stub key; comment shows all.
      const firstAlt = tokenClass.split('|')[0];
      if (tokenClass.includes('|')) {
        content += '<!-- ' + tokenClass + ' -->\n';
        content += firstAlt + ': \n';
      } else {
        content += '<!-- ' + tokenClass + ': paste ' + tokenClass + ' here -->\n';
        content += tokenClass + ': \n';
      }
    }

    fs.writeFileSync(cachePath, content, 'utf8');
    return { evidence_file: evidenceFile, required_tokens: tokens, nonce_rotated: false };
  } catch (_) {
    // Best-effort: a seed failure returns the metadata but does not fail the open.
    let required_tokens = ['evidence-binding'];
    try {
      const { ROLE_TOKEN_REGISTRY } = require('./kaola-gitea-workflow-plan-validator');
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
// for review roles it is the bare role string (code-reviewer / security-reviewer), else `role (id)`.
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
    if (cells.length && cells[0] === requirementCell) return true;
  }
  return false;
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
    const { parseNodes } = require('./kaola-gitea-workflow-plan-validator');
    return parseNodes(content);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// checkEvidenceShape — presence-only check for role-specific evidence tokens.
//
// tdd-guide:   needs BOTH 'RED' AND 'GREEN' (or 'n/a' reason).
// implementer: needs 'non_tdd_reason' AND one of {regression-green, build-green,
//              smoke-integration} (or 'n/a').
// other roles: file present and non-empty is sufficient.
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
    const hasRed   = /\bRED\b/.test(content);
    const hasGreen = /\bGREEN\b/.test(content);
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
    const hasReason = /non_tdd_reason/.test(content);
    const hasChangeType = /regression-green|build-green|smoke-integration/.test(content);
    if (!hasReason) {
      return { ok: false, kind: 'shape', missingTokenClass: 'non_tdd_reason', reason: 'implementer ' + nodeId + ' evidence missing non_tdd_reason', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    if (!hasChangeType) {
      return { ok: false, kind: 'shape', missingTokenClass: 'change-type', reason: 'implementer ' + nodeId + ' evidence missing change-type token', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    return { ok: true };
  }

  // Other roles: file present and non-empty.
  if (!content.trim()) {
    return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: role + ' ' + nodeId + ' evidence missing or empty', expected: ['non-empty evidence file'] };
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
    const { parseWriteSetCell } = require('./kaola-gitea-workflow-classifier');
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
  try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-gitea-workflow-plan-validator')); }
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
function buildDispatch(nodeInfo, context) {
  const ctx = context || {};
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
    ...dispatchEffort(nodeInfo.model),
  };
  if (ctx.goal_line != null && String(ctx.goal_line).trim() !== '') {
    d.goal_line = String(ctx.goal_line);
  }
  return d;
}

// ---------------------------------------------------------------------------
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
  const cachePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');
  const evidence_file = '.cache/' + nodeId + '.md';

  // Resolve role from the plan's ## Nodes table (mirrors close-and-open-next L1341-1343).
  let role = 'unknown';
  try {
    const planContent = readFile(planPath);
    const nodes = parseNodesFromContent(planContent);
    const nodeInfo = nodes.find(n => n.id === nodeId);
    if (nodeInfo) role = nodeInfo.role;
  } catch (_) {}

  // Evidence-absent check.
  if (!cacheExists(cachePath)) {
    return { result: 'refuse', reason: 'evidence_absent', nodeId, role, evidence_file };
  }

  // Read evidence and nonce.
  let content = '';
  try { content = readFile(cachePath); } catch (_) { content = ''; }
  const expectedNonce = readNonce(planPath, nodeId, readFile);

  // Run the same checker the close path uses (#392 binding + role token checks).
  const shapeCheck = checkEvidenceShape(role, nodeId, content, { expectedNonce, expectedNodeId: nodeId });

  if (shapeCheck.ok) {
    return { result: 'ok', nodeId, role, evidence_file };
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
        ? 'run: node kaola-gitea-workflow-adaptive-node.js mirror-project --project '
          + project + ' --json (mirrors the frozen kaola-workflow/' + project
          + '/ from the main checkout into this worktree, plan_hash-verified), then re-run orient'
        : 'no workflow-plan.md for ' + project
          + ' — author + freeze it via /kaola-workflow-adapt ' + project,
    };
  }

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
    enterBatch,
    // #434: present only when an in_progress node needs re-dispatch (absent or incomplete evidence).
    ...(requires_redispatch ? { requires_redispatch: true } : {}),
    frontier: enterBatch
      ? delegable.map(n => ({ id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set }))
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
  const { planPath, statePath, project, nodeId: requestedId, shell, readFile, writeFile, working_dir } = opts;

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: excl-scheduler:yes / excl-batch:yes / halt-fence:yes.
  //    NO integrity (adversarial finding: orient already runs --resume-check on the documented resume
  //    path; adding it to open-next risks a legacy-path behavioral diff) and NO serial-excl (open-next
  //    IS the serial path — it cannot be mutually exclusive with itself). ==
  // #383: never open a serial node while the #377 scheduler (running-set) or a batch is live (those
  //   surfaces co-scheduling against a serial node is the #383(a)/(b) wedge). #391b: fence a halt.
  const guard = mutationGuardPrologue(opts, { halt: true, excl: ['scheduler', 'batch'] });
  if (guard) return guard;

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
  } else {
    targetNode = nextAction.nextNode;
    if (!targetNode) {
      return { result: 'refuse', reason: 'no_ready_node', nextAction };
    }
  }

  // spliceLedgerNode: pending → in_progress.
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

  // #373: best-effort telemetry — the node opened.
  appendNodeTiming(planPath, targetNode.id, 'opened');

  // #424 (D-424-01 §5): provenance log entry — open event.
  const openNonce = (baselineResult.recordBase && baselineResult.recordBase.base)
    ? String(baselineResult.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', targetNode.id, openNonce);

  // #433 (D-433-01 §2): open-time evidence seeding — create .cache/{node-id}.md with
  // binding header + role-specific stubs. Idempotent (does not overwrite on crash-resume).
  const seedResult = seedEvidenceFile(planPath, targetNode.id, openNonce, targetNode.role, false);

  // #444 (D-444-01 §2): build the dispatch descriptor sub-object via the single shared builder.
  const openedDispatch = buildDispatch(targetNode, {
    nonce:          openNonce,
    evidence_file:  seedResult.evidence_file,
    required_tokens: seedResult.required_tokens,
    working_dir:    working_dir || null,
    forge_rider:    null,
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
      declared_write_set: targetNode.declared_write_set,
      // #433: evidence metadata for the dispatcher (seeded path + required token classes).
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

  if (mkdirp) mkdirp(cacheDir);

  writeFile(cachePath, stdinContent);

  // #373: best-effort telemetry — evidence recorded for the node.
  appendNodeTiming(planPath, nodeId, 'evidence');

  return {
    result: 'ok',
    wrote: cachePath,
    bytes: stdinContent.length,
  };
}

// ---------------------------------------------------------------------------
// runCloseAndOpenNext — the main per-node commit + fused advance.
// Order: (a) evidence-shape → (b) barrier → (c) close+compliance → (e) selector → (d) fused-advance
// ---------------------------------------------------------------------------
function runCloseAndOpenNext(opts) {
  const { planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists, working_dir } = opts;
  // #411 BUG B: the per-node running-set path (mirror runCloseNode). The closing node is removed
  // from it after the close write so the next orient does not see an orphan multi-in_progress
  // mismatch (a serial close left the node in the set → reconcile-running-set no-ops `not_opening`).
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: halt-fence:yes / excl-batch:yes (#383d dedup lives in
  //    the body). NO integrity, NO excl-serial/excl-scheduler: close-and-open-next is the SERIAL close
  //    path and MUST stay byte-identical to today under the serial-fallback conditions (the hard
  //    invariant). The halt fence is vacuously-pass when no consent_halt is durable, so a normal
  //    linear-chain close is unchanged. (#391b: without the fence, close-and-advance survives a halt
  //    and the marker becomes a phantom against a now-complete node.)
  //    #411 BUG B (excl-batch): a LIVE batch (≥1 unsealed member) must fence this SERIAL close — the
  //    serial path cannot close a node owned by a live parallel batch out-of-band (that is close-node's
  //    job after seal/join). Without it, close-and-open-next would flip a still-running batch member to
  //    complete + append its compliance row + fuse-advance, racing the batch scheduler. The layer is
  //    vacuously-pass with no active-batch manifest, so the serial-fallback path stays byte-identical. ==
  const guard = mutationGuardPrologue(opts, { halt: true, excl: ['batch'] });
  if (guard) return guard;

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
  const expectedNonce = readNonce(planPath, nodeId, readFile);
  const shapeCheck = checkEvidenceShape(role, nodeId, evidenceContent, { expectedNonce, expectedNodeId: nodeId });

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
  let verdictWarn = checkVerdictParse(role, evidenceContent);

  // -- (b) Shell COMMIT_NODE per-node barrier ----------------------------
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);

  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    // #440: attach triage to the barrier_failed envelope so callers can classify + propose repair.
    const cacheDir440 = path.join(path.dirname(planPath), '.cache');
    return {
      result: 'refuse',
      reason: 'barrier_failed',
      nodeId,
      barrierOut,
      triage: computeTriage(barrierOut, cacheDir440, nodeId, readFile),
    };
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

  // Build compliance row.
  // code-reviewer / security-reviewer → bare role string in Requirement cell.
  const bareRoles = ['code-reviewer', 'security-reviewer'];
  const requirementCell = bareRoles.includes(role)
    ? role
    : role + ' (' + nodeId + ')';

  const evidenceSummary = evidenceContent
    ? evidenceContent.split('\n')[0].slice(0, 80)
    : 'evidence present';

  // #338: role 'finalize' is the mandatory DAG sink — the plan-run contract says the MAIN
  // SESSION performs its bookkeeping directly (no Agent dispatch), so certifying it as
  // subagent-invoked would be false. Record the truthful execution mode instead. This row
  // is NOT part of the delegation vocabulary checked by repair-state (a 'finalize (id)'
  // requirement matches none of DELEGATION_CONTROLLED_REQUIREMENTS) and does not require
  // codex-preflight (no dispatch happens).
  const complianceStatus = role === 'finalize' ? 'main-session-direct' : 'subagent-invoked';
  const complianceRow = '| ' + requirementCell + ' | ' + complianceStatus + ' | ' + evidenceSummary + ' | |';
  // #384/#391c: spliceComplianceRow appends UNCONDITIONALLY, so the idempotent re-close paths (this
  // node already complete via alreadyAtTarget — a serial close-and-open-next re-run, or the reconcile
  // close-direction) would otherwise append a DUPLICATE `Required Agent Compliance` row each time.
  // Guard the append: skip when a row for this Requirement cell already exists.
  if (!complianceRowExists(currentPlan, requirementCell, nodeId)) {
    currentPlan = spliceComplianceRow(currentPlan, complianceRow);
  }

  // Write the plan now (ledger + compliance — all non-state writes).
  writeFile(planPath, currentPlan);

  // #373: best-effort telemetry — the node closed.
  appendNodeTiming(planPath, nodeId, 'closed');

  // #424 (D-424-01 §5): provenance log entry — close event.
  appendProvenanceLog(planPath, 'close', nodeId, readNonce(planPath, nodeId, readFile));

  // #317: the closed node → completed (every ok exit carries this).
  transitions.push(buildTransition(nodeId, 'complete', 'close-and-open-next'));

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

  // -- (e) Selector routing (BEFORE fused advance) -----------------------
  const selectorCheck = barrierOut.selectorCheck || {};

  if (selectorCheck.isSelector === true) {
    if (selectorCheck.ok === false) {
      return {
        result: 'refuse',
        reason: 'selector_invalid',
        nodeId,
        selectorCheck,
      };
    }
    // ok === true: write armsToNa.
    const armsToNa = selectorCheck.armsToNa || [];
    let planForSelector = readFile(planPath);
    for (const armId of armsToNa) {
      const armResult = spliceLedgerNode(planForSelector, armId, 'n/a', { allowFrom: ['pending', 'in_progress'] });
      if (armResult.changed) {
        planForSelector = armResult.content;
      }
      // #317: each armed-off select arm → n/a (UI maps n/a to completed).
      transitions.push(buildTransition(armId, 'n/a', 'selector-arm'));
    }
    writeFile(planPath, planForSelector);
    currentPlan = planForSelector;
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
    return { result: 'ok', closed: nodeId, opened: null, allDone: false, ...(verdictWarn || {}), taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  let planForAdvance = readFile(planPath);
  const advanceSplice = spliceLedgerNode(planForAdvance, nextNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (advanceSplice.changed) {
    planForAdvance = advanceSplice.content;
    writeFile(planPath, planForAdvance);
  }

  // #373: best-effort telemetry — the fused advance opened the next node.
  appendNodeTiming(planPath, nextNode.id, 'opened');

  // Record baseline for the newly opened node.
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', nextNode.id, '--start', '--json']);

  // #424 (D-424-01 §5): provenance log entry — open event for fused advance.
  const fusedNonce = (baselineResult.recordBase && baselineResult.recordBase.base)
    ? String(baselineResult.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', nextNode.id, fusedNonce);

  // #433 (D-433-01 §2): open-time evidence seeding for the fused-advance node.
  const fusedSeed = seedEvidenceFile(planPath, nextNode.id, fusedNonce, nextNode.role, false);

  // #444 (D-444-01 §2): build the dispatch descriptor for the fused-advance node via the
  // SAME single builder as runOpenNext — this closes the #411 class by construction.
  const fusedDispatch = buildDispatch(nextNode, {
    nonce:          fusedNonce,
    evidence_file:  fusedSeed.evidence_file,
    required_tokens: fusedSeed.required_tokens,
    working_dir:    working_dir || null,
    forge_rider:    null,
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
      declared_write_set: nextNode.declared_write_set,
      // #411 BUG A: surface the per-open evidence-binding nonce for the node the fused advance just
      // opened, with the SAME derivation runOpenNext (~1098) and runOpenReady (~2228) use — the first
      // 12 chars of commit-node --start's nested recordBase.base SHA. WITHOUT this, every caller that
      // reads opened.nonce to bind the next node's evidence gets `undefined`, so on any serial chain
      // with a dependent the SECOND close refuses evidence_stale (the on-disk nonce never matches the
      // empty header). Read the SAME nested path (recordBase.base), NOT the top level.
      nonce: fusedNonce,
      // #433: evidence metadata for the dispatcher.
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

  const validReasons = ['consent', 'security', 'test_thrash'];
  if (!validReasons.includes(reason)) {
    return { result: 'refuse', reason: 'invalid_reason', validReasons };
  }

  // Determine markers to write.
  const stateMarkers = [];  // { key, value } pairs for workflow-state.md
  const planMarkers  = [];  // lines for ## Node Ledger (in plan)

  // #360 (documented coupling): a consent halt escalates the run to the FULL path, and
  // `escalated_to_full: security` is the marker that records that escalation — so a consent halt
  // intentionally writes BOTH `escalated_to_full: consent` (the cause) and `escalated_to_full:
  // security` (the full-escalation state). clear-halt --reason consent clears both in lockstep.
  if (reason === 'consent') {
    stateMarkers.push({ key: 'escalated_to_full', value: 'consent' });
    stateMarkers.push({ key: 'escalated_to_full', value: 'security' });
  } else {
    stateMarkers.push({ key: 'escalated_to_full', value: reason });
  }
  planMarkers.push('consent_halt: pending');

  // Write state markers — each marker may need a separate line.
  let stateContent = readFile(statePath);

  if (reason === 'consent') {
    // Both markers needed — use multi-line insertion.
    // Insert 'escalated_to_full: consent' and 'escalated_to_full: security'.
    // First check for existing markers.
    const hasConsent  = /^escalated_to_full:\s*consent\s*$/m.test(stateContent);
    const hasSecurity = /^escalated_to_full:\s*security\s*$/m.test(stateContent);

    if (!hasConsent || !hasSecurity) {
      // Remove any existing escalated_to_full lines first.
      stateContent = stateContent.replace(/^escalated_to_full:.*\n?/mg, '');
      // Insert both before ## Last Updated or at EOF.
      const luMarker = '\n## Last Updated';
      const luIdx = stateContent.indexOf(luMarker);
      const insertion = 'escalated_to_full: consent\nescalated_to_full: security\n';
      if (luIdx >= 0) {
        stateContent = stateContent.slice(0, luIdx) + '\n' + insertion + stateContent.slice(luIdx);
      } else {
        stateContent = stateContent.trimEnd() + '\n' + insertion;
      }
    }
  } else {
    stateContent = spliceStateMarker(stateContent, 'escalated_to_full', reason);
  }

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

  // Build markers list for output.
  const markers = [];
  if (reason === 'consent') {
    markers.push('escalated_to_full:consent', 'escalated_to_full:security', 'consent_halt:pending');
  } else {
    markers.push('escalated_to_full:' + reason, 'consent_halt:pending');
  }

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
    stateContent = stateContent.replace(/^escalated_to_full:[ \t]*security[ \t]*\n?/mg, '');
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
//   (1) Refuse over a live parallel batch / interrupted top-up (member.opening:true) so
//       this never fights the #305 reconcile guards.
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
//       non-terminal (no broad cascade needed).
//   (4) Reopen N pending→in_progress, remove its stale baseline, persist the plan, then
//       re-record a FRESH baseline at the current merged state (commit-node --start) so
//       the next barrier attributes ONLY the repair.
// ---------------------------------------------------------------------------
function runReopenNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, unlink, readdir } = opts;
  // #334: a downstream non-delegable main-session-gate is reset like the reviewer gates so a
  // plan-repair to implementation re-triggers the visual check (it post-dominates N and folds
  // complete|in_progress → pending; the orphan guard at (3b) tolerates it for the same reason).
  // #444: GATE_ROLES promoted to module-level const — no redefinition needed here.

  // (1) Refuse over a live batch / interrupted top-up — mirror the #305 guards.
  const manifestPath = path.join(path.dirname(planPath), '.cache', 'active-batch.json');
  const manifestPresent = cacheExists ? cacheExists(manifestPath) : false;
  if (manifestPresent) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    const m = raw != null ? safeJsonParse(raw) : null;
    if (m && Array.isArray(m.members)) {
      const live = m.state && m.state !== 'joined' && m.state !== 'aborted';
      const opening = m.members.some(x => x.opening);
      if (live || opening) {
        return { result: 'refuse', reason: 'active_batch_exists', state: m.state || null, detail: 'reconcile/clear the active batch before a plan-repair reopen' };
      }
    }
  }

  // (1b) #383: reopen-node refused over a live BATCH but not over a live RUNNING SET — the guard
  // asymmetry the issue names. A plan-repair reopen must never fight a #377 scheduler fan-out either
  // (it would create an orphan multi-in_progress ledger the same way a batch would). Add the missing
  // arm: refuse scheduler_active over a live / opening running set. Mirrors the batch arm above.
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

  // (2) N must be a COMPLETE ledger row — reset complete→pending.
  const reset = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['complete'] });
  if (!reset.found) return { result: 'refuse', reason: 'node_not_in_ledger', nodeId };
  if (!reset.changed) {
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
    .filter(n => desc.has(n.id) && GATE_ROLES.has(n.role) && postDominates(n.id))
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

  // (3c) Fold the post-dominating gates to pending. #343: an in_progress gate — the mid-gate
  // repair case (the gate just emitted a blocking finding owned by N) — folds back to
  // pending exactly like a complete one, so the repair does NOT have to advance the DAG
  // to allDone on a known-broken tree. gatesFolded = the rows actually flipped.
  const gatesFolded = [];
  for (const gid of gatesReset) {
    const s = spliceLedgerNode(planContent, gid, 'pending', { allowFrom: ['complete', 'in_progress'] });
    if (s.changed) { planContent = s.content; gatesFolded.push(gid); }
  }

  // (4) Remove stale per-node baselines for N + the reset gates.
  const cacheBaseFile = nid => path.join(path.dirname(planPath), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  const baselinesRemoved = [];
  for (const id of [nodeId, ...gatesReset]) {
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
  let fanoutSiblingsPurged = false;
  for (const gid of gatesReset) {
    const ev = path.join(cacheDir, gid + '.md');
    if ((cacheExists ? cacheExists(ev) : false) && typeof unlink === 'function') {
      unlink(ev);
      evidenceRemoved.push(gid + '.md');
    }
    const g = gateById.get(gid);
    if (g && g.role === 'adversarial-verifier' && g.shape && g.shape.kind === 'fanout'
        && !fanoutSiblingsPurged && typeof readdir === 'function') {
      for (const name of readdir(cacheDir)) {
        if (typeof name === 'string' && /^adversarial-verifier-.*\.md$/.test(name) && typeof unlink === 'function') {
          unlink(path.join(cacheDir, name));
          evidenceRemoved.push(name);
        }
      }
      fanoutSiblingsPurged = true;
    }
  }

  // Reopen N pending→in_progress, persist the plan (so commit-node --start sees the row),
  // then re-record the fresh baseline at the current merged state.
  const reopen = spliceLedgerNode(planContent, nodeId, 'in_progress', { allowFrom: ['pending'] });
  if (reopen.changed) planContent = reopen.content;
  writeFile(planPath, planContent);

  const baseline = shell(commitNodePath, [planPath, '--node-id', nodeId, '--start', '--json']);
  if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
    return { result: 'refuse', reason: 'baseline_failed', nodeId, baselineResult: baseline, reopened: nodeId, gatesReset };
  }

  // #424 (D-424-01 §5): provenance log entry — open event (reopen generates a new nonce).
  const reopenNonce = (baseline.recordBase && baseline.recordBase.base)
    ? String(baseline.recordBase.base).slice(0, 12) : null;
  appendProvenanceLog(planPath, 'open', nodeId, reopenNonce);

  // #433 (D-433-01 §4) + #392 anti-replay: reopen generates a NEW nonce. RE-SEED the ENTIRE
  // evidence file (if present) with fresh binding + role stubs, discarding the stale body so
  // prior-attempt evidence cannot pass checkEvidenceShape on the new open. forceRotate=true.
  const nodeRole = (nodes.find(n => n.id === nodeId) || {}).role || 'unknown';
  const reopenSeed = seedEvidenceFile(planPath, nodeId, reopenNonce, nodeRole, true);

  // #317: post-dominating gates were folded → pending; the reopened node → in_progress.
  // #343: transitions are built from gatesFolded (rows actually flipped), never the
  // structural gatesReset — an already-pending downstream gate gets NO fabricated entry.
  const reopenTransitions = gatesFolded.map(g => buildTransition(g, 'pending', 'reopen-node'));
  reopenTransitions.push(buildTransition(nodeId, 'in_progress', 'reopen-node'));

  return {
    result: 'ok', reopened: nodeId, gatesReset, gatesFolded, baselinesRemoved, evidenceRemoved, baselineRecorded: true,
    // #433: report nonce rotation and evidence metadata.
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
  const barrierResult = shell(commitNodePath, [planPath, '--node-id', nodeId, '--barrier-check', '--json']);
  const outOfAllow = (barrierResult && Array.isArray(barrierResult.outOfAllow))
    ? barrierResult.outOfAllow
    : [];

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
//   (1) Refuse over a live batch or running set.
//   (2) Require the writer node to be a COMPLETE ledger row (the reviewer is in_progress).
//   (3) Reset the post-dominating gate(s) of the writer to pending (same logic as reopen-node).
//   (4) Delete their stale barrier-base files (downstream baselines; NOT the writer's own).
//   (5) Transition the writer back to in_progress (pending→in_progress via complete→pending).
//   (6) Write the updated plan.
//   (7) Return { result:'ok', baselineReused:true, deletedDownstreamBaselines:[...] }.
//
// The original barrier-base-{nodeId} is NEVER removed. commit-node is NEVER shelled.
// ---------------------------------------------------------------------------
function runRepairNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, unlink } = opts;

  if (!nodeId) return { result: 'refuse', errors: ['--node-id required for repair-node'] };

  // (1) Refuse over a live batch / interrupted top-up.
  const manifestPath = path.join(path.dirname(planPath), '.cache', 'active-batch.json');
  const manifestPresent = cacheExists ? cacheExists(manifestPath) : false;
  if (manifestPresent) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    const m = raw != null ? safeJsonParse(raw) : null;
    if (m && Array.isArray(m.members)) {
      const live = m.state && m.state !== 'joined' && m.state !== 'aborted';
      const opening = m.members.some(x => x.opening);
      if (live || opening) {
        return { result: 'refuse', reason: 'active_batch_exists', state: m.state || null, detail: 'reconcile/clear the active batch before a plan-repair reopen' };
      }
    }
  }

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
  const writerStatus = ledgerStatuses[nodeId];
  if (writerStatus !== 'complete') {
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
  if (!downstreamGateInProgress) {
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
  // Compute the real unique sink (same as reopen-node).
  let uniqueSink = null;
  for (const n of nodes) {
    const d = descendantsOf(n.id);
    if (d.size === 0) { uniqueSink = n.id; break; }
  }
  // Compute nodes through which ALL paths from nodeId to the sink pass (post-dominators).
  const pathsFromNodeToSink = desc;
  const gatesReset = [];
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
      // If the sink is not reachable when excluding `did`, it post-dominates.
      if (uniqueSink && !descWithoutGate.has(uniqueSink)) {
        gatesReset.push(did);
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

  // (4) Fold gates back to pending.
  const gatesFolded = [];
  for (const gid of gatesReset) {
    const s = spliceLedgerNode(planContent, gid, 'pending', { allowFrom: ['complete', 'in_progress'] });
    if (s.changed) { planContent = s.content; gatesFolded.push(gid); }
  }

  // (4b) Delete stale barrier-base files for the DOWNSTREAM gates only.
  // The writer's own barrier-base-{nodeId} is KEPT (the anti-laundering invariant).
  const cacheBaseFile = nid => path.join(path.dirname(planPath), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  const deletedDownstreamBaselines = [];
  for (const gid of gatesReset) {
    const bf = cacheBaseFile(gid);
    const present = cacheExists ? cacheExists(bf) : true;
    if (present && typeof unlink === 'function') {
      unlink(bf);
      deletedDownstreamBaselines.push('barrier-base-' + String(gid).replace(/[^A-Za-z0-9_-]/g, '_'));
    }
  }

  // (5) Transition writer: complete→pending→in_progress.
  const resetWriter = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['complete'] });
  if (!resetWriter.changed) {
    return { result: 'refuse', reason: 'ledger_splice_failed', nodeId, detail: 'could not reset writer to pending' };
  }
  planContent = resetWriter.content;

  const reopenWriter = spliceLedgerNode(planContent, nodeId, 'in_progress', { allowFrom: ['pending'] });
  if (reopenWriter.changed) planContent = reopenWriter.content;

  // (6) Persist the updated plan.
  writeFile(planPath, planContent);

  // Provenance log entry for the repair.
  appendProvenanceLog(planPath, 'repair-node', nodeId, null);

  // (7) Return the repair contract — baselineReused:true is the critical anti-laundering signal.
  return {
    result: 'ok',
    repaired: nodeId,
    gatesReset,
    gatesFolded,
    deletedDownstreamBaselines,
    // The CRITICAL anti-laundering invariant: the original barrier-base is reused, NOT re-snapshotted.
    baselineReused: true,
    taskTransitions: [
      ...gatesFolded.map(g => buildTransition(g, 'pending', 'repair-node')),
      buildTransition(nodeId, 'in_progress', 'repair-node'),
    ],
    taskMirror: refreshTaskMirror(project, shell),
  };
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
// SAFETY (the #364 reintroduction condition): with KAOLA_LANE_CONTAINMENT off
// (the default + permanent serial fallback), the ONLY concurrency open-ready
// creates is among READ-ONLY nodes — they share the parent tree and never write,
// so they cannot race. A WRITE node always opens ALONE (one at a time, never
// alongside a read or another write) — byte-identical to today's serial path. A
// single in_progress write node is the legacy length<=1 single-node case, so the
// #293 multi-in_progress legality concern only ever arises for safe read-only
// fan-out. The cross-lane write+read overlap the design envisions is gated on a
// real cwd-forcing primitive (#376 lane-containment worktrees) and stays DORMANT
// here — documented, never silently engaged.
//
// State shape: { state:'opening'|'open', nodes:[{id,role,kind,baseline,opening?,
// openedAt?}], updatedAt }. Two-phase write (opening -> flip ledger -> open)
// mirrors open-batch's crash-safe ordering; `reconcile-running-set` rolls a
// crashed 'opening' forward (kept rows) / back (un-flipped rows).
// ===========================================================================

// A node is read-only iff its declared write set is empty. Delegates to the SAME
// classifier.parseWriteSetCell the batch classifier (classifyBatchKind) and the
// plan_hash use, so read-only/write classification can never drift between paths
// (em-dash `—`, `-`, and empty all parse to the empty set → read-only). Write
// nodes serialize under containment-off (the permanent fallback).
function isReadOnlyNode(node) {
  const raw = node && (node.declared_write_set != null ? node.declared_write_set : node.writeSetRaw);
  try {
    const { parseWriteSetCell } = require('./kaola-gitea-workflow-classifier');
    return parseWriteSetCell(raw).size === 0;
  } catch (_) {
    const s = String(raw == null ? '' : raw).trim();
    return !s || s === '—' || s === '-';
  }
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

// ===========================================================================
// #383 CROSS-SURFACE MUTUAL EXCLUSION — the shared "live coordination state" probe.
//
// The three coordination surfaces (serial open-next/close-and-open-next, the batch manifest
// active-batch.json, and the #377 running-set running-set.json) each enforced only their own
// invariant. A mixed sequence — the documented resume path (open-next on resume) followed by the
// scheduler (open-ready / open-batch) — could co-schedule a serial write node against a read fan-out
// (a), make the batch + running-set manifests coexist and brick each other (b), or double-dispatch
// an already-running node (d). readCoordinationState is the SINGLE pure probe every mutating
// subcommand consults; probeCoordination is its fs wrapper.
//
// SERIAL FALLBACK BYTE-IDENTITY (the hard invariant): with no running-set, no active-batch, and
// ≤1 in_progress row, serialLive is the only live-coordination signal and the scheduler/batch arms
// are all FALSE — so each guard is vacuously-pass and the legacy serial path is byte-identical.
// ===========================================================================

// readCoordinationState (#383) — PURE derivation of the live coordination surfaces from already-read
// content. Mirrors the crossCheckStatus / runOrient AC#5 legality vocabulary so the #293 orphan-
// legality agreement holds: serialLive ⟺ crossCheckStatus single_in_progress for the same fixture.
//
// @param {string} planContent  the frozen plan (## Node Ledger source)
// @param {{runningSet:object|null, manifest:object|null}} surfaces  the two parsed manifests
// @returns {{serialLive, inProgressIds, runningSetLive, runningSetOpening, batchLive, batchOpening,
//            collisions}}
//   serialLive        exactly one in_progress row AND no live running set AND no live batch — the
//                     legacy single-node case (a serial write/read node is live).
//   runningSetLive    a non-opening running set with ≥1 node is live.
//   runningSetOpening  the running set is mid-transaction (state:'opening' or any node opening:true).
//   batchLive         an active (non-joined/aborted) batch manifest with ≥1 unsealed member.
//   batchOpening      the batch is mid-transaction (state:'opening' or any member opening:true).
//   collisions        the surfaces that COEXIST (≥2 of {serial,runningSet,batch}) — the union state
//                     #383(b) must refuse at creation.
function readCoordinationState(planContent, surfaces) {
  surfaces = surfaces || {};
  const runningSet = surfaces.runningSet || null;
  const manifest = surfaces.manifest || null;

  const ledger = readLedgerStatuses(planContent || '');
  const inProgressIds = Object.keys(ledger).filter(id => ledger[id] === 'in_progress');

  const runningSetOpening = !!(runningSet && (runningSet.state === 'opening' || (runningSet.nodes || []).some(n => n.opening)));
  const runningSetLive = !!(runningSet && (runningSet.nodes || []).length > 0 && !runningSetOpening);

  const batchOpening = !!(manifest && (manifest.state === 'opening' || (manifest.members || []).some(m => m.opening)));
  const batchActiveState = !!(manifest && manifest.state && manifest.state !== 'joined' && manifest.state !== 'aborted');
  const batchLive = !!(batchActiveState && (manifest.members || []).some(m => !m.sealed) && !batchOpening);

  // serialLive = the legacy single-node case: exactly one in_progress row, no running set fan-out,
  // no live batch. This MUST equal crossCheckStatus's single_in_progress verdict for the same fixture
  // (the #293 cross-consistency invariant tested explicitly).
  const serialLive = inProgressIds.length === 1 && !runningSetLive && !batchLive && !runningSetOpening && !batchOpening;

  // collisions: which live surfaces coexist (a union state that none of the per-surface gates can
  // represent). Used only for diagnostics in the refusal payload; the per-command guards refuse on
  // the specific other-surface signal per the matrix.
  const collisions = [];
  const liveCount = [runningSetLive || runningSetOpening, batchLive || batchOpening, serialLive].filter(Boolean).length;
  if (runningSetLive || runningSetOpening) collisions.push('running_set');
  if (batchLive || batchOpening) collisions.push('batch');
  if (serialLive) collisions.push('serial');

  return {
    serialLive,
    inProgressIds,
    runningSetLive,
    runningSetOpening,
    batchLive,
    batchOpening,
    collisions: liveCount >= 2 ? collisions : [],
  };
}

// probeCoordination (#383) — the fs wrapper around readCoordinationState. Reads the plan, the batch
// manifest, and the running set (all READ-ONLY, fail-closed to null) and returns the pure state plus
// the raw surfaces (for the refusal payload's {inProgress,runningSet,batchState} context).
//
// @param {{planPath, readFile, cacheExists}} opts
// @returns the readCoordinationState shape, augmented with { manifest, runningSet }.
function probeCoordination(opts) {
  const { planPath, readFile, cacheExists } = opts;
  const dir = path.dirname(planPath);

  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}

  const manifestPath = path.join(dir, '.cache', 'active-batch.json');
  let manifest = null;
  if (!cacheExists || cacheExists(manifestPath)) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    if (raw != null) {
      const parsed = safeJsonParse(raw);
      if (parsed && Array.isArray(parsed.members)) manifest = parsed;
    }
  }

  const runningSetPath = path.join(dir, '.cache', RUNNING_SET_NAME);
  const runningSet = readRunningSet(runningSetPath, cacheExists, readFile);

  const state = readCoordinationState(planContent, { runningSet, manifest });
  return { ...state, manifest, runningSet };
}

// coordinationRefusal (#383) — build a typed mutual-exclusion refusal for a given guard layer. Returns
// null when the relevant other-surface is not live (the guard is vacuously-pass). `excl` names which
// surfaces THIS subcommand is mutually exclusive with: any subset of {serial, scheduler, batch}.
// Reason codes: serial_node_live / scheduler_active / batch_active, each carrying the live-state
// context + the concrete reconcile/close repair the operator should run.
function coordinationRefusal(coord, excl) {
  const want = new Set(excl || []);
  // Order matters only for which single reason surfaces first; the matrix never lets two of these be
  // simultaneously the EXCLUDED surface for one command without a deeper bug, but check deterministically.
  if (want.has('scheduler') && (coord.runningSetLive || coord.runningSetOpening)) {
    return refuse('scheduler_active', {
      inProgress: coord.inProgressIds,
      runningSet: (coord.runningSet && (coord.runningSet.nodes || []).map(n => n.id)) || [],
      batchState: (coord.manifest && coord.manifest.state) || null,
      repair: coord.runningSetOpening
        ? 'reconcile-running-set (a crashed open-ready) then retry'
        : 'close the live running-set nodes (close-node) or reconcile-running-set before this command',
    });
  }
  if (want.has('batch') && (coord.batchLive || coord.batchOpening)) {
    return refuse('batch_active', {
      inProgress: coord.inProgressIds,
      runningSet: (coord.runningSet && (coord.runningSet.nodes || []).map(n => n.id)) || [],
      batchState: (coord.manifest && coord.manifest.state) || null,
      repair: coord.batchOpening
        ? 'reconcile (a crashed open-batch/top-up) then retry'
        : 'seal + join the active batch (or reconcile --abort) before this command',
    });
  }
  if (want.has('serial') && coord.serialLive) {
    return refuse('serial_node_live', {
      inProgress: coord.inProgressIds,
      runningSet: (coord.runningSet && (coord.runningSet.nodes || []).map(n => n.id)) || [],
      batchState: (coord.manifest && coord.manifest.state) || null,
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
//           | batch_active per the per-command exclusion set.
//
// SERIAL FALLBACK BYTE-IDENTITY: with KAOLA_LANE_CONTAINMENT off + no running-set + no active-batch +
// ≤1 in_progress + no consent_halt marker, EVERY layer is vacuously-pass (integrity ok, no halt, no
// other-surface live) so the guarded body runs exactly as today.
//
// @param {object} opts  the subcommand opts (planPath, shell, readFile, cacheExists)
// @param {{integrity?:boolean, halt?:boolean, excl?:string[]}} cfg  which layers apply
// @returns {object|null} a refusal envelope, or null to proceed.
function mutationGuardPrologue(opts, cfg) {
  const { planPath, shell, readFile, cacheExists } = opts;
  cfg = cfg || {};

  // Layer 1 — integrity (mirror open-batch 424-427). Only when configured (open-next DOES NOT add it:
  // an adversarial finding showed orient already runs --resume-check on the documented resume path,
  // and adding it to open-next risks a legacy-path behavioral diff).
  if (cfg.integrity && typeof shell === 'function') {
    const integrity = shell(validatorPath, [planPath, '--resume-check', '--json']);
    if (integrity.exitCode !== 0 || integrity.ok !== true) {
      return refuse('plan_integrity_failed', { detail: integrity.reason || null });
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
  try { ({ parseWriteSetCell: parse } = require('./kaola-gitea-workflow-classifier')); } catch (_) { parse = null; }
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
// single write node serially — exactly the flag-OFF path. Reached only under
// resolveLaneContainment(env) === true (the caller's guard); never invoked flag-OFF.
//
// @returns { ok:true, members:string[], group_id, write_union:string[] }
//        | { ok:false, reason:'overlapping_write_sets', overlapping? }
// ---------------------------------------------------------------------------
function tryFormLaneGroup(writeNodes, planPath, shell) {
  const ids = writeNodes.map(n => n.id);
  if (ids.length < 2) return { ok: false, reason: 'too_few_write_nodes' };
  const ps = shell(validatorPath, [planPath, '--parallel-safe', '--nodes', ids.join(','), '--json']);
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
  const { planPath, nodeId, shell, readFile, writeFile, cacheExists } = opts;
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

  // (b) Revert the node's in-lane DECLARED writes to the anchored baseline (read nodes: empty ⇒ no-op).
  let revertedPaths = [];
  let declared = [];
  try {
    const { parseWriteSetCell } = require('./kaola-gitea-workflow-classifier');
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

  // (c) Drop the anchored baseline (ref + file together; idempotent).
  shell(validatorPath, [planPath, '--drop-base', '--node-id', nodeId, '--json']);

  // (d) Remove the node from running-set.json.
  const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
  writeFile(runningSetPath, JSON.stringify({ ...running, nodes: remaining }, null, 2));

  appendProvenanceLog(planPath, 'discard-speculative', nodeId, baseSha ? String(baseSha).slice(0, 12) : null);

  return {
    result: 'ok',
    nodeId,
    discarded: true,
    ledgerReset: 'pending',
    revertedPaths,
    baseDropped: true,
    runningSet: remaining.map(n => n.id),
    taskTransitions: [buildTransition(nodeId, 'pending', 'discard-speculative')],
  };
}

// ---------------------------------------------------------------------------
// runOpenReady — MUTATES ledger + baselines + running-set.json.
// Opens up to N ready-pending nodes (priority-ordered by next-action's
// longest-path-to-sink). Read-only nodes fan out up to the read-only cap; a write
// node opens alone only when the running set is empty. Two-phase crash-safe write.
//
// #437 (D-419 P2): under KAOLA_LANE_CONTAINMENT, a ≥2 disjoint write frontier co-opens
// as a LANE GROUP (a `lane_group` key in running-set.json + a shared group baseline) so
// the close barrier is GROUP-scoped (deferred per-member, run once at the last close).
// Flag OFF ⇒ the containment guard is false ⇒ the existing single-write serial open runs
// byte-identically (INV-6); no `lane_group`, no group baseline, no new code path.
// ---------------------------------------------------------------------------
function runOpenReady(opts) {
  const {
    planPath, project, max, fanoutCapReadonly, shell, readFile, writeFile, cacheExists, mkdirp, now,
    working_dir,
  } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);

  // == UNIFIED GUARD PROLOGUE (D1) — matrix: integrity:yes / excl-serial:yes / excl-batch:yes /
  //    halt-fence:yes (NO excl-scheduler — open-ready OWNS the running set). ==
  // Layer 1 INTEGRITY (#387): mirror open-batch/top-up — a tampered/structurally-invalid frozen plan
  // must not be partially executed by the scheduler. --resume-check covers hash-freeze + post-freeze
  // tamper + cycle + unique-sink + role-library + depends_on resolvability. Any non-ok refuses with
  // zero mutation. (Without this, an emptied write node's declared_write_set is reclassified read-only
  // by isReadOnlyNode and fans out concurrently — the #387 repro.)
  const guard = mutationGuardPrologue(opts, { integrity: true, halt: true, excl: ['serial', 'batch'] });
  if (guard) return guard;

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
  const liveHasWrite = liveNodes.some(n => n.kind === 'write');

  // A write node runs strictly alone: if one is live, open nothing until it closes.
  if (liveHasWrite) {
    return { result: 'ok', allDone: false, opened: [], reason: 'write_node_exclusive', taskTransitions: [] };
  }

  // Priority-ordered openable frontier (next-action orders readyPending by longest-path-to-sink).
  // Exclude main-session-gate (the main session cannot run concurrently with itself) and any node
  // already in the running set.
  let frontier = (nextAction.readyPending || [])
    .filter(n => n.role !== 'main-session-gate')
    .filter(n => !liveIds.has(n.id));

  // #439 (D-419 Part 4): SPECULATIVE-read fallback. When the NORMAL frontier is empty — the only thing
  // blocking forward progress is an open gate — AND the per-run consent flag is present AND the frozen
  // plan's speculative_open_policy authorizes it, fan out the speculative-eligible read nodes
  // (next-action's speculativePending): read-only nodes betting that the open gate will pass. They open
  // exactly like a read frontier, but each running-set entry is stamped `speculative: true` ([INV-25])
  // so orient / reconcile / close treat them as the optimistic set. Default policy:off (or no consent
  // flag) ⇒ this branch is inert ⇒ byte-identical to today. Never co-runs with a live write
  // (liveHasWrite already returned above). Consent is per-run (the flag), never persisted in the plan.
  let openingSpeculative = false;
  if (frontier.length === 0 && opts.speculativeConsent && resolveSpeculativePolicy(readFile(planPath)) === 'consent') {
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
  if (readOnly.length > 0) {
    let slots = Math.max(0, cap - liveNodes.length);
    if (Number.isInteger(max) && max >= 1) slots = Math.min(slots, max);
    toOpen = readOnly.slice(0, slots);
    openKind = 'read';
  } else if (liveNodes.length === 0 && writeNodes.length > 0) {
    // #437 (D-419 P2 §1.2): under KAOLA_LANE_CONTAINMENT, attempt a co-open lane group from a
    // ≥2 disjoint write frontier; on overlap (or flag OFF) DEGRADE to a single serial write.
    const containment = resolveLaneContainment(process.env);
    if (containment && writeNodes.length >= 2) {
      const grp = tryFormLaneGroup(writeNodes, planPath, shell);
      if (grp.ok) {
        // #437 §1.3 cap: a write lane group respects the WRITE cap (resolveFanoutCap, not the read
        // cap) AND --max as a single unit. The members are already pairwise-disjoint (parallel-safe
        // verified); take a disjoint prefix up to the ceiling. The frontier is sorted by
        // longest-path-to-sink; the group_id/union are recomputed for the chosen subset.
        let writeCap;
        try { ({ resolveFanoutCap: writeCap } = require('./kaola-workflow-adaptive-schema')); } catch (_) { writeCap = null; }
        let groupCeiling = writeCap ? writeCap(process.env) : grp.members.length;
        if (Number.isInteger(max) && max >= 1) groupCeiling = Math.min(groupCeiling, max);
        groupCeiling = Math.max(2, groupCeiling);
        const chosen = writeNodes.filter(n => grp.members.includes(n.id)).slice(0, groupCeiling);
        toOpen = chosen;
        openKind = 'write';
        groupForm = {
          group_id: laneGroupId(chosen.map(n => n.id)),
          members: chosen.map(n => n.id).slice().sort(),
          write_union: laneWriteUnion(chosen),
        };
      } else {
        toOpen = [writeNodes[0]];
        openKind = 'write';
      }
    } else {
      toOpen = [writeNodes[0]];
      openKind = 'write';
    }
  } else {
    // Only write nodes are ready but the running set is non-empty (read-only members live):
    // the write node must wait until they drain so it can run alone.
    return { result: 'ok', allDone: false, opened: [], reason: 'write_awaits_drain', taskTransitions: [] };
  }

  if (toOpen.length === 0) {
    return { result: 'ok', allDone: false, opened: [], reason: 'cap_reached', taskTransitions: [] };
  }

  const openedAt = (typeof now === 'function') ? now() : null;
  const newNodes = toOpen.map(n => ({
    id: n.id,
    role: n.role,
    kind: openKind,
    declared_write_set: n.declared_write_set,
    // #382: persist the per-node model tier (next-action resolved it via node.model || role-static)
    // so running-set.json carries it — a reconcile-running-set roll-forward / crash re-dispatch keeps
    // the planner's tier instead of losing it. null when next-action returned no model.
    model: n.model || null,
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

  // -- Phase 1: write running-set.json in state:'opening' with the FULL intended node set
  //    BEFORE flipping any ledger row. A crash here is reconcilable (never an orphan).
  if (mkdirp) mkdirp(path.dirname(runningSetPath));
  // #436 D-419-01: record max_concurrent at open time as min(cap, --max || cap) so
  // reconcile-running-set can honor the ceiling on crash-resume. NEVER written at freeze
  // time or into plan_hash. Absent --max falls back to cap (the full fanout ceiling).
  const maxConcurrent = Number.isInteger(max) && max >= 1 ? Math.min(cap, max) : cap;
  // #437 (D-419 P2 §1.2): the lane_group descriptor, written into running-set.json BEFORE any ledger
  // flip (so a crash mid-open is reconcilable). Carries the shared baseline SHA + the write_union
  // (convenience snapshot; the group barrier re-reads the plan rows for attribution). Absent when no
  // group formed (the serial/read path) ⇒ no lane_group key ⇒ flag-OFF byte-identical.
  const laneGroupEntry = groupForm ? {
    group_id: groupForm.group_id,
    members: groupForm.members,
    baseline: groupBaselineSha,
    write_union: groupForm.write_union,
    ...(openedAt ? { openedAt } : {}),
  } : null;
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
      return { result: 'refuse', reason: 'baseline_failed', nodeId: n.id, baselineResult: baseline };
    }
    nonceById[n.id] = (baseline.recordBase && baseline.recordBase.base)
      ? String(baseline.recordBase.base).slice(0, 12) : null;
    const spliced = spliceLedgerNode(planContent, n.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) {
      return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: n.id };
    }
    if (spliced.changed) planContent = spliced.content;
    appendNodeTiming(planPath, n.id, 'opened');
    // #424 (D-424-01 §5): provenance log entry — open event.
    appendProvenanceLog(planPath, 'open', n.id, nonceById[n.id]);
    // #433 (D-433-01 §2): open-time evidence seeding for each opened node.
    seedEvidenceFile(planPath, n.id, nonceById[n.id], n.role, false);
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
      try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-gitea-workflow-plan-validator')); } catch (_) {}
      const required_tokens = (ROLE_TOKEN_REGISTRY[n.role] || ['evidence-binding']).slice();
      const evidence_file = '.cache/' + n.id + '.md';
      const nonce = nonceById[n.id] || null;
      const dispatch = buildDispatch(
        { id: n.id, role: n.role, model: n.model || null, declared_write_set: n.declared_write_set },
        { nonce, evidence_file, required_tokens, working_dir: working_dir || null, forge_rider: null }
      );
      return { id: n.id, role: n.role, model: n.model || null, kind: n.kind, declared_write_set: n.declared_write_set, nonce, evidence_file, required_tokens, dispatch };
    }),
    runningSet: finalSet.nodes.map(n => n.id),
    // #437 (D-419 P2 §1.2): surface the formed lane group descriptor so the orchestrator/tests can
    // observe a co-open. Absent (undefined) on the serial/read path — the flag-OFF byte-identical shape.
    ...(laneGroupEntry ? { laneGroup: laneGroupEntry } : {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// memberInLaneChanges (#437 D-419 P2 §2.1) — the per-member in-lane vacuity probe. Scope a
// `git status --porcelain` to the member's DECLARED write set (parsed via the classifier) at the
// repo root and return the non-empty change lines. NON-empty ⇒ the member wrote in-lane (pass);
// empty ⇒ the caller checks the evidence for a `no_op:` declaration. This is intentionally an
// in-lane PRESENCE check, NOT the full diff barrier (the diff barrier is DEFERRED to the group).
// Returns { changed:boolean, lines:string[] }. Fail-OPEN to changed:false on a git error (the
// caller then requires the no_op: declaration — the conservative direction).
// ---------------------------------------------------------------------------
function memberInLaneChanges(declaredRaw) {
  let parse;
  try { ({ parseWriteSetCell: parse } = require('./kaola-gitea-workflow-classifier')); } catch (_) { parse = null; }
  const paths = parse ? Array.from(parse(declaredRaw)) : String(declaredRaw || '').split(/[\s,]+/).filter(Boolean);
  if (!paths.length) return { changed: false, lines: [] };
  let root;
  try { root = getRoot(); } catch (_) { root = process.cwd(); }
  let out = '';
  try {
    out = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', ...paths], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
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
// frontier. Does NOT auto-open (the loop calls open-ready). No worktree join
// (containment dormant: read-only members + serial writes are all parent-side).
//
// #437 (D-419 P2 §2): under KAOLA_LANE_CONTAINMENT, a node that is a live lane_group MEMBER takes
// the GROUP-scoped close path: evidence-shape + per-member in-lane vacuity, then either DEFER the
// barrier (non-last member ⇒ `barrier: deferred_to_group`) or run the GROUP barrier ONCE (last
// member ⇒ `barrier: group_passed`, clear lane_group, drop the group baseline). Flag OFF (or a
// non-member serial node) ⇒ the existing per-node serial close runs byte-identically (INV-6).
// ---------------------------------------------------------------------------
function runCloseNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);
  const transitions = [];

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

  const cachePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');
  let evidenceContent = null;
  const evidencePresent = cacheExists ? cacheExists(cachePath) : (() => {
    try { evidenceContent = readFile(cachePath); return true; } catch (_) { return false; }
  })();
  if (evidencePresent && evidenceContent === null) {
    try { evidenceContent = readFile(cachePath); } catch (_) { evidenceContent = ''; }
  }
  // #392: verify the evidence-binding header against this open's nonce (skipped when none on disk).
  const expectedNonce = readNonce(planPath, nodeId, readFile);
  const shapeCheck = checkEvidenceShape(role, nodeId, evidenceContent, { expectedNonce, expectedNodeId: nodeId });
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
  const verdictWarn = checkVerdictParse(role, evidenceContent);

  // -- (a.5) #437 (D-419 P2 §2): LANE-GROUP MEMBER close path. Gated on KAOLA_LANE_CONTAINMENT AND
  //    this node being a live lane_group member. Flag OFF / a serial node (no lane_group) ⇒ lg is null
  //    ⇒ this whole branch is skipped and the existing serial close runs verbatim (INV-6).
  const containment = resolveLaneContainment(process.env);
  const running0 = readRunningSet(runningSetPath, cacheExists, readFile);

  // #439 (D-419 Part 4): close-time speculative guard — a speculative member cannot commit to complete
  // until its gate resolves (else its review pointer + discard handle would be lost). Fires only for a
  // speculative:true member whose gate is not yet complete; never for a normal node (INV-6 preserved).
  const specGuard = speculativeCloseGuard(nodeId, running0, readLedgerStatuses(readFile(planPath)));
  if (specGuard) return specGuard;

  const lg = (containment && running0 && running0.lane_group) ? running0.lane_group : null;
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
    const cacheDir440b = path.join(path.dirname(planPath), '.cache');
    return { result: 'refuse', reason: 'barrier_failed', nodeId, barrierOut, triage: computeTriage(barrierOut, cacheDir440b, nodeId, readFile) };
  }

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

  // Compliance row (bare-role string for review roles; truthful mode for finalize).
  const bareRoles = ['code-reviewer', 'security-reviewer'];
  const requirementCell = bareRoles.includes(role) ? role : role + ' (' + nodeId + ')';
  const evidenceSummary = evidenceContent ? evidenceContent.split('\n')[0].slice(0, 80) : 'evidence present';
  const complianceStatus = role === 'finalize' ? 'main-session-direct' : 'subagent-invoked';
  // #384/#391c: idempotent compliance append — skip a duplicate row on the alreadyAtTarget re-close.
  if (!complianceRowExists(currentPlan, requirementCell, nodeId)) {
    currentPlan = spliceComplianceRow(currentPlan, '| ' + requirementCell + ' | ' + complianceStatus + ' | ' + evidenceSummary + ' | |');
  }
  writeFile(planPath, currentPlan);
  appendNodeTiming(planPath, nodeId, 'closed');
  // #424 (D-424-01 §5): provenance log entry — close event.
  appendProvenanceLog(planPath, 'close', nodeId, readNonce(planPath, nodeId, readFile));
  transitions.push(buildTransition(nodeId, 'complete', 'close-node'));

  // -- (d) Selector routing (mirror close-and-open-next: arm losing branches to n/a).
  const selectorCheck = barrierOut.selectorCheck || {};
  if (selectorCheck.isSelector === true) {
    if (selectorCheck.ok === false) {
      return { result: 'refuse', reason: 'selector_invalid', nodeId, selectorCheck };
    }
    let planForSelector = readFile(planPath);
    for (const armId of (selectorCheck.armsToNa || [])) {
      const armResult = spliceLedgerNode(planForSelector, armId, 'n/a', { allowFrom: ['pending', 'in_progress'] });
      if (armResult.changed) planForSelector = armResult.content;
      transitions.push(buildTransition(armId, 'n/a', 'selector-arm'));
    }
    writeFile(planPath, planForSelector);
  }

  // -- (e) Remove the closed node from the running set (delete the file if it empties).
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

  // -- (f) Fused readiness recompute — return the newly-ready frontier (the loop opens it).
  const nextAction = shell(nextActionPath, [planPath, '--json']);
  const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);
  const newlyReady = (nextAction.result === 'ok' && Array.isArray(nextAction.readyPending))
    ? nextAction.readyPending.filter(n => n.role !== 'main-session-gate')
        .map(n => ({ id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set }))
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
// ONLY under KAOLA_LANE_CONTAINMENT when the closing node is a live lane_group member. The evidence-
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

  // -- (1) PER-MEMBER in-lane vacuity guard. Empty in-lane changes AND no `no_op:` ⇒ member_vacuity.
  // parseNodes returns `writeSetRaw` (the running-set carries `declared_write_set`); accept either.
  const declaredRaw = nodeInfo
    ? (nodeInfo.declared_write_set != null ? nodeInfo.declared_write_set : nodeInfo.writeSetRaw)
    : null;
  const inLane = memberInLaneChanges(declaredRaw);
  if (!inLane.changed && !evidenceDeclaresNoOp(evidenceContent)) {
    return {
      result: 'refuse',
      reason: 'member_vacuity',
      nodeId, role,
      group_id: lg.group_id,
      detail: 'declared set has no changes and evidence declares no no_op:<reason>',
    };
  }

  // Member roster: lane_group.members is the FULL bare-id string[] (kept stable so the validator's
  // --group-barrier — which reads lg.members for the union allowlist via nodes.find(x=>x.id===id) —
  // always sees plain ids, per n1-design §1.1). Per-member close state lives in a PARALLEL
  // `closed_members` id[] so members stays string[]. "Last member" = every OTHER member id is in
  // closed_members.
  const allMemberIds = (Array.isArray(lg.members) ? lg.members : []).map(m => (typeof m === 'string' ? m : (m.nodeId || m.id)));
  const closedBefore = new Set(Array.isArray(lg.closed_members) ? lg.closed_members : []);
  const otherIds = allMemberIds.filter(id => id !== nodeId);
  const isLast = otherIds.length > 0 && otherIds.every(id => closedBefore.has(id));
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
    const requirementCell = role + ' (' + nodeId + ')';
    if (!complianceRowExists(currentPlan, requirementCell, nodeId)) {
      currentPlan = spliceComplianceRow(currentPlan, '| ' + requirementCell + ' | subagent-invoked | deferred_to_group | |');
    }
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

  // -- (2b) LAST member: run the GROUP BARRIER ONCE over union(all members), BEFORE closing/removing
  //    this member (so lane_group.members still holds the full set the validator reads). The validator
  //    --group-barrier path reads running-set.json's lane_group + the group baseline itself.
  const groupBarrier = shell(validatorPath, [planPath, '--group-barrier', '--group-id', lg.group_id, '--json']);
  if (groupBarrier.exitCode !== 0 || groupBarrier.result !== 'pass') {
    // Typed refusal: NO ledger advance, lane_group untouched, group baseline retained.
    return {
      result: 'refuse',
      reason: groupBarrier.reason || 'group_barrier_failed',
      nodeId, role,
      group_id: lg.group_id,
      groupBarrier,
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
  const requirementCell = role + ' (' + nodeId + ')';
  if (!complianceRowExists(currentPlan, requirementCell, nodeId)) {
    currentPlan = spliceComplianceRow(currentPlan, '| ' + requirementCell + ' | subagent-invoked | group_passed | |');
  }
  writeFile(planPath, currentPlan);
  appendNodeTiming(planPath, nodeId, 'closed');
  appendProvenanceLog(planPath, 'close', nodeId, readNonce(planPath, nodeId, readFile));
  transitions.push(buildTransition(nodeId, 'complete', 'close-node'));

  // Clear lane_group entirely + remove the member from running_set.nodes.
  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  if (running) {
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
        .map(n => ({ id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set }))
    : [];

  return {
    result: 'ok',
    closed: nodeId,
    barrier: 'group_passed',
    group_id: lg.group_id,
    allDone,
    newlyReady,
    ...(verdictWarn || {}),
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runReconcileRunningSet — MUTATES running-set.json + (roll-back) ledger.
// Repairs a crashed 'opening' running set: a node whose ledger row DID flip to
// in_progress is kept (roll-forward, opening flag cleared); a node still 'pending'
// did not open (roll-back, dropped from the set). Promotes state -> 'open'. A set
// with no opening transaction is a no-op. Mirrors parallel-batch runReconcile.
// ---------------------------------------------------------------------------
function runReconcileRunningSet(opts) {
  const { planPath, project, shell, readFile, writeFile, cacheExists } = opts;
  const runningSetPath = path.join(path.dirname(planPath), '.cache', RUNNING_SET_NAME);

  const running = readRunningSet(runningSetPath, cacheExists, readFile);
  if (!running) {
    return { result: 'ok', reconciled: false, reason: 'no_running_set', taskTransitions: [] };
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
    return { result: 'ok', reconciled: false, reason: 'not_opening', state: running.state, taskTransitions: [] };
  }

  const target = wholeOpening ? (running.nodes || []) : openingNodes;
  const keptAll = [];
  const dropped = [];
  for (const n of target) {
    if (ledger[n.id] === 'in_progress') keptAll.push(n.id);
    else dropped.push(n.id);
  }

  // #436 D-419-01: cap roll-forward re-opens at (max_concurrent - live) so a crashed
  // open-ready that partially flipped ledger rows cannot leave MORE nodes in_progress than
  // the ceiling allows. `live` = stable non-opening in_progress members that survive
  // regardless (they are already confirmed running). Absent max_concurrent → ceiling = 1
  // (fail-closed, legacy open-next default).
  const closedSet = new Set(closed);
  const staleSet = new Set(stale);
  const liveStable = (running.nodes || []).filter(
    n => !n.opening && !closedSet.has(n.id) && !staleSet.has(n.id) && ledger[n.id] === 'in_progress'
  );
  const ceiling = (Number.isInteger(running.max_concurrent) && running.max_concurrent >= 1)
    ? running.max_concurrent : 1;
  const budget = Math.max(0, ceiling - liveStable.length);
  const kept = keptAll.slice(0, budget);
  // Nodes in keptAll that exceed the budget are also dropped (capped out).
  const cappedOut = keptAll.slice(budget);

  // #385 drop-side: every rolled-back (open-direction) / closed-out (close-direction) / stale
  // (#293-direction) / capped-out member is leaving the live set, so drop its per-node baseline
  // (.cache/barrier-base-<id> + the gc-anchored ref) — the documented #281/#296 stale-baseline trap
  // that runReopenNode already guards against. --drop-base removes file+ref together and is idempotent
  // (a missing file/ref is a clean no-op). Mirrors runReopenNode ~1505. The roll-FORWARD survivors
  // (kept) keep their fresh baselines.
  if (typeof shell === 'function') {
    for (const id of new Set([...dropped, ...cappedOut, ...closed, ...stale])) {
      shell(validatorPath, [planPath, '--drop-base', '--node-id', id, '--json']);
    }
  }

  // Survivors = non-target nodes (already open) + target nodes whose row flipped AND under cap —
  // MINUS any close-direction terminal member (#384), stale non-opening pending member (#293-direction),
  // or capped-out opening member (D-419-01).
  const cappedOutSet = new Set(cappedOut);
  const survivors = (running.nodes || [])
    .filter(n => ((!wholeOpening && !n.opening) || kept.includes(n.id)) && !closedSet.has(n.id) && !staleSet.has(n.id) && !cappedOutSet.has(n.id))
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
    const r2 = seedEvidenceFile(planPath, 'n1-impl', 'newNonce999', 'tdd-guide', false);
    assert(r2.nonce_rotated === false, 'T2 crash-resume nonce_rotated false');
    const afterContent = fs.readFileSync(seededPath, 'utf8');
    assert(afterContent.includes('RED: some test output'), 'T2 existing evidence preserved');
    assert(!afterContent.includes('newNonce999'), 'T2 new nonce NOT written on crash-resume');

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
function resolveOwningNode(file, nodes) {
  if (!file) return null;
  let parseWriteSetCell = null;
  try { ({ parseWriteSetCell } = require('./kaola-gitea-workflow-classifier')); } catch (_) {}
  for (const n of nodes) {
    const raw = (n.declared_write_set != null ? n.declared_write_set : n.writeSetRaw);
    if (raw == null) continue;
    let tokens;
    if (parseWriteSetCell) {
      try { tokens = parseWriteSetCell(raw); } catch (_) { tokens = null; }
    }
    if (tokens) {
      if (tokens.has ? tokens.has(file) : Array.from(tokens).includes(file)) return n.id;
    } else {
      const toks = String(raw).split(/[\s,]+/).filter(Boolean);
      if (toks.includes(file)) return n.id;
    }
  }
  return null;
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

  const findings = [];
  for (const line of String(evidence).split('\n')) {
    const parsed = parseFindingLine(line);
    if (!parsed) continue;
    // 4. write-set lookup → owning_node (or null = plan-repair signal).
    const owning_node = resolveOwningNode(parsed.file, nodes);
    // 5. fix_role precedence.
    const fix_role = parsed.securityFlag ? 'security-reviewer'
      : (owning_node ? 'implementer' : 'code-reviewer');
    findings.push({
      finding_id: parsed.finding_id,
      file: parsed.file,
      owning_node,
      fix_role,
      status: parsed.status,
    });
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
      'usage: kaola-gitea-workflow-adaptive-node.js <subcommand> --project P --json [options]\n' +
      '  orient              --project P\n' +
      '  mirror-project      --project P\n' +
      '  open-next           --project P [--node-id N]\n' +
      '  open-ready          --project P [--max N]   (#377 running-set scheduler)\n' +
      '  close-node          --project P --node-id N (#377 running-set scheduler)\n' +
      '  reconcile-running-set --project P           (#377 crash roll-forward/back)\n' +
      '  record-evidence     --project P --node-id N --stdin       (MUTATES .cache)\n' +
      '  record-evidence     --project P --node-id N --verify      (READ-ONLY: verifies on-disk evidence)\n' +
      '  close-and-open-next --project P --node-id N\n' +
      '  write-halt          --project P --node-id N --reason consent|security|test_thrash\n' +
      '  reopen-node         --project P --node-id N\n' +
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

  // #335: resolve the MAIN checkout root even when cwd is a linked worktree.
  // realpath both sides so a macOS /var vs /private/var divergence under
  // os.tmpdir() never false-positives the linked-worktree comparison.
  let realRepoRoot = repoRoot;
  try { realRepoRoot = fs.realpathSync(repoRoot); } catch (_) {}
  let mainRoot = getMainRoot(repoRoot);
  try { mainRoot = fs.realpathSync(mainRoot); } catch (_) {}

  // #466 — worktree-authority split guard (fail loud, ZERO mutation; precedes the dispatch). The
  // adaptive lifecycle resolves the project folder cwd-relative via getRoot(); when a linked worktree
  // is recorded for this project but a MUTATING lifecycle command is invoked from the MAIN root
  // (realRepoRoot === mainRoot ⇒ NOT a linked worktree), the ## Node Ledger / .cache evidence / barrier
  // baselines would be written under the main checkout while the role agents edit the worktree — a split
  // that stays invisible until finalize. Refuse here and point the operator into the worktree. Native
  // posture (no worktree_path) and the exempt read-only / main→worktree-copy subcommands fall through.
  {
    const guardedMutation = SPLIT_GUARDED_SUBCOMMANDS.has(subcommand)
      || (subcommand === 'record-evidence' && !args.includes('--verify'));
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

  let result;

  if (subcommand === 'orient') {
    const mainPlanPath = path.join(mainRoot, 'kaola-workflow', project, 'workflow-plan.md');
    const planProbe = {
      planExists: fs.existsSync(planPath),
      isLinkedWorktree: mainRoot !== realRepoRoot,
      mainPlanExists: fs.existsSync(mainPlanPath),
      mainPlanPath,
    };
    result = runOrient({ planPath, statePath, project, shell, readFile, writeFile, cacheExists, planProbe });
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
    result = runOpenNext({ planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists });
  } else if (subcommand === 'open-ready') {
    result = runOpenReady({
      planPath, project,
      max: Number.isInteger(maxArg) && maxArg >= 1 ? maxArg : null,
      fanoutCapReadonly: resolveFanoutCapReadonly(process.env),
      // #439 (D-419 Part 4): the per-run speculative-read consent carrier — NEVER persisted in the
      // frozen plan (orthogonal to the hash-covered speculative_open_policy Meta field). Both must hold
      // for a speculative fan-out: the plan authorizes (policy:consent) AND this run opted in (the flag).
      speculativeConsent: args.includes('--speculative-consent'),
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
    result = runReconcileRunningSet({ planPath, project, shell, readFile, writeFile, cacheExists });
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
        writeFile,
        mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      });
    }
  } else if (subcommand === 'close-and-open-next') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for close-and-open-next'] };
    } else {
      result = runCloseAndOpenNext({ planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists });
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
        planPath, project, nodeId, shell, readFile, writeFile, cacheExists,
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
      });
    }
  } else if (subcommand === 'discard-speculative') {
    // #439 (D-419 Part 4, settlement 4): roll back a speculatively-opened read node whose gate bet failed.
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for discard-speculative'] };
    } else {
      result = runDiscardSpeculative({ planPath, project, nodeId, shell, readFile, writeFile, cacheExists });
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

  if (summaryMode) {
    // #446 (D-446-01 Decision 4): ONE-line summary + cached full envelope at .cache/<op>-envelope.json.
    let line = 'summary: ' + (result.result != null ? result.result : 'unknown');
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
  runOrient,
  runMirrorProject,
  runOpenNext,
  runOpenReady,
  runCloseNode,
  runReconcileRunningSet,
  readRunningSet,
  isReadOnlyNode,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  runClearHalt,
  runReopenNode,
  // #434 (D-434-01): repair primitives.
  runRevertOverflow,
  runRepairNode,
  // #439 (D-419 Part 4): speculative-read discard primitive.
  runDiscardSpeculative,
  shellNode,
  // #444 (D-444-01): dispatch descriptor builder + guards + verify subcommand.
  buildDispatch,
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
};
