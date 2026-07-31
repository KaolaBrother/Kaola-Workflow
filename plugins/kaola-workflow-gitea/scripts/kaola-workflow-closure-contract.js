#!/usr/bin/env node
'use strict';

// Closure Contract schema (issue #161, Option B).
//
// Pure data: no I/O, no forge calls, no callers in #161. This is the single
// machine-readable source of truth for the closure receipt. The follow-up
// shared closure executor (#164) is expected to require() this module and seed
// a receipt with emptyReceipt(), then flip each field from its 'failed' default
// to a success enum as each closure step completes.
//
// Byte-identical copies live in all four forge trees and are pinned by
// validate-script-sync.js (BYTE_IDENTICAL_GROUPS). The human-readable contract
// lives in docs/api.md § Closure Contract.

// Each closure-receipt field maps to its allowed enum values. The first value
// is NOT a default; emptyReceipt() defaults every status field to 'failed'
// (fail-loud: an unpopulated receipt reads as total failure, not silent
// success). `warnings` is a free-form string array.
const CLOSURE_RECEIPT_FIELDS = {
  project: 'string',
  issue_number: 'number',
  archive: ['closed', 'abandoned', 'skipped', 'failed'],
  roadmap_source_removed: ['removed', 'absent', 'kept', 'failed'],
  roadmap_regenerated: ['regenerated', 'skipped', 'failed'],
  // #369: `partial` is the truthful ONLINE token for a bundle where some members closed and some
  // did not (online must never read `skipped_offline`). `skipped_offline` stays for the offline path.
  // #396 (D2): `close_pending` is the truthful token for the merge-lane finalize that runs BEFORE
  // sink-merge closes members — the members are not yet closed, but not because of a partial failure.
  remote_issue_closed: ['closed', 'already_closed', 'kept_open', 'partial', 'close_pending', 'skipped_offline', 'failed'],
  claim_label_removed: ['removed', 'already_absent', 'skipped_offline', 'failed'],
  worktree_removed: ['removed', 'missing', 'kept', 'failed'],
  branch_removed: ['removed', 'kept', 'failed'],
  // WARN-FIRST detection invariant (#277 Phase 2 / M2) — recorded, not hard-blocking. The
  // CLAIM/AUTHOR seam is the only attested seam: the finalize seam is orchestrator-owned by
  // design, so it emits no attestation field. A LEGACY receipt carrying the retired
  // finalize-side field is read and preserved verbatim; it is simply not re-emitted.
  claim_planner_attested: ['attested', 'missing', 'failed'],
  warnings: 'string[]',
  // #369 BUNDLE post-attached arrays (NOT builder fields — emptyReceipt does not seed them; the
  // sink-merge / cmdFinalize close path attaches them only for a bundle with issue_numbers.length>1):
  //   closed_issues:          numbers closed successfully (or already-closed)
  //   failed_issue_closures:  numbers whose remote close FAILED while online
  //   open_issues:            numbers probed STILL OPEN while online (recorded — never silently neither)
  // #396 (D2) close-disposition qualifier (builder field so it SURVIVES into the receipt JSON):
  //   close_disposition: 'close_pending' — set by cmdFinalize on the merge lane (members are not yet
  //     closed because sink-merge runs AFTER finalize). checkClosureInvariants SKIPS the
  //     remote-members-closed invariant when this is 'close_pending' (the members WILL close at sink).
  //     sink-merge / watch-pr (post-sink) leave it UNSET, so the invariant fires there truthfully.
  close_disposition: ['close_pending'],
  // #396.3 keep-open intent (builder field). The archive side keys keep-open on args.keepOpen; the
  // invariant checker must key on this RECORDED INTENT, not the mutable remote_issue_closed token
  // (which flips to 'already_closed' when the issue was auto-closed on the forge — flipping the
  // checker into the wrong branch). true = keep-open was REQUESTED for this finalize.
  keep_open_requested: 'boolean',
  // #426: absolute path to main repo root this finalize operated against.
  anchored_root: 'string',
  // Advisory goal DECLARATION. Replaces the retired `goal_check`, whose enum
  // ('satisfied' | 'unsatisfied' | 'absent') rendered a presence check as a verdict: the negative
  // case was unreachable ("reserved for future use"), and — worse — the positive case named a
  // check that exists nowhere in this workflow. The comment that stood here claimed 'satisfied'
  // meant "AC verified"; nothing verifies acceptance criteria, so a run that achieved nothing
  // wrote `goal_check: satisfied` into its terminal record whenever KAOLA_GOAL was set at all.
  // These three fields say only what was inspected, and `unsatisfied` is gone WITH the enum rather
  // than lingering as a value that could never be produced:
  //   goal_declared        — a goal TEXT was found. Not a claim that it was achieved.
  //   goal_declared_source — 'env' (KAOLA_GOAL) | 'plan' (a `goal:` line in ## Meta); null when
  //                          none was declared, and null in emptyReceipt() until evaluated.
  //   goal_declared_probed — the exact plan paths examined, in order, so the check is re-runnable
  //                          by hand. Empty when KAOLA_GOAL answered before any file was opened.
  // ARCHIVED receipts predating this change carry `goal_check`, and they are correct AS HISTORY —
  // they record what the code of their day emitted. Do NOT migrate them, and do not "finish" this
  // rename by editing an archived receipt or an archive fixture.
  goal_declared: 'boolean',
  goal_declared_source: ['env', 'plan'],
  goal_declared_probed: 'string[]',
  // #653 (D3): advisory selection-evidence probe. 'present' = a selection-evidence.* file was
  // found under the project's .cache/ (the no-target survey's selection record, docked before
  // dispatching the executor); 'absent' = none found — expected for a user-named claim, which
  // never runs a backlog survey. null in emptyReceipt() (not yet probed). Advisory only: no
  // invariant, no warning on absence.
  selection_evidence: ['present', 'absent'],
};

// The closure invariants for a completed linked issue N. `id` is a stable
// machine token; `description` mirrors docs/api.md § Closure Contract.
const CLOSURE_INVARIANTS = [
  { id: 'roadmap-source-absent', description: 'kaola-workflow/.roadmap/issue-N.md is absent.' },
  { id: 'roadmap-mirror-clean', description: 'Generated kaola-workflow/ROADMAP.md does not list #N as active work.' },
  { id: 'keep-open-roadmap-preserved', description: 'Keep-open finalize (issue_action: comment_keep_open): kaola-workflow/.roadmap/issue-N.md is preserved and the regenerated ROADMAP.md still lists #N.' },
  { id: 'active-folder-absent', description: 'kaola-workflow/{project}/ is absent from active folders.' },
  { id: 'archive-state-closed', description: 'kaola-workflow/archive/{project}/workflow-state.md exists with status: closed and step: complete when local archive is available.' },
  { id: 'remote-closed-after-publish', description: 'The remote issue is closed only after acceptance criteria pass and implementation is published.' },
  // #369 BUNDLE all-or-nothing: every member of issue_numbers must be closed (or already closed).
  // WARN-FIRST but VISIBLE — a member left in failed_issue_closures/open_issues while online flags
  // this invariant (closure_invariants.ok becomes false) so a partial close is never a clean success.
  { id: 'remote-members-closed', description: 'For a bundle (issue_numbers), every member is closed; none remains in failed_issue_closures or open_issues while online.' },
  { id: 'in-progress-label-removed', description: 'The remote issue does not have workflow:in-progress after closure.' },
  { id: 'branch-worktree-resolved', description: 'Any branch/worktree cleanup is either complete or explicitly reported by stale-worktree tooling.' },
  // WARN-FIRST detection invariant (#277 Phase 2 / M2) — recorded, not hard-blocking.
  { id: 'claim-planner-attested', description: 'A workflow-planner subagent spawn is recorded in the dispatch log (.cache/dispatch-log.jsonl) BEFORE the plan was frozen.' },
  { id: 'roadmap-residue-clean', description: 'No .roadmap/issue-N.md source survives in any tree after closure.' },
];

// Returns a fresh receipt for the given project/issue with every status field
// defaulted to its failure state and warnings empty. Callers flip fields to a
// success enum as each step completes.
function emptyReceipt(project, issueNumber) {
  return {
    project: project,
    issue_number: issueNumber,
    archive: 'failed',
    roadmap_source_removed: 'failed',
    roadmap_regenerated: 'failed',
    remote_issue_closed: 'failed',
    claim_label_removed: 'failed',
    worktree_removed: 'failed',
    branch_removed: 'failed',
    // WARN-FIRST detection invariant (#277 Phase 2 / M2) — recorded, not hard-blocking.
    claim_planner_attested: 'failed',
    warnings: [],
    // Advisory goal declaration — null until evaluated (nothing inspected yet).
    goal_declared: null,
    goal_declared_source: null,
    goal_declared_probed: null,
    // #653 (D3): advisory selection-evidence probe — null until evaluated.
    selection_evidence: null,
  };
}

// Archive callers may proceed with destructive cleanup only after one of the
// two explicitly successful outcomes.  Every other result shape (including a
// thrown/caught error converted to an object) is a refusal.
function archiveSucceeded(result) {
  return !!result && (result.archived === true || result.skipped === 'source-missing');
}

module.exports = { CLOSURE_RECEIPT_FIELDS, CLOSURE_INVARIANTS, emptyReceipt, archiveSucceeded };
