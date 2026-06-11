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
  remote_issue_closed: ['closed', 'already_closed', 'kept_open', 'partial', 'skipped_offline', 'failed'],
  claim_label_removed: ['removed', 'already_absent', 'skipped_offline', 'failed'],
  worktree_removed: ['removed', 'missing', 'kept', 'failed'],
  branch_removed: ['removed', 'kept', 'failed'],
  // WARN-FIRST detection invariants (#277 Phase 2 / M2) — recorded, not hard-blocking.
  claim_planner_attested: ['attested', 'missing', 'failed'],
  finalize_contractor_attested: ['attested', 'missing', 'failed'],
  warnings: 'string[]',
  // #369 BUNDLE post-attached arrays (NOT builder fields — emptyReceipt does not seed them; the
  // sink-merge / cmdFinalize close path attaches them only for a bundle with issue_numbers.length>1):
  //   closed_issues:          numbers closed successfully (or already-closed)
  //   failed_issue_closures:  numbers whose remote close FAILED while online
  //   open_issues:            numbers probed STILL OPEN while online (recorded — never silently neither)
};

// The ten closure invariants for a completed linked issue N. `id` is a stable
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
  // WARN-FIRST detection invariants (#277 Phase 2 / M2) — recorded, not hard-blocking.
  { id: 'claim-planner-attested', description: 'A workflow-planner subagent spawn is recorded in the dispatch log (.cache/dispatch-log.jsonl) BEFORE the plan was frozen.' },
  { id: 'finalize-contractor-attested', description: 'A contractor subagent spawn is recorded in the dispatch log during the finalize window.' },
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
    // WARN-FIRST detection invariants (#277 Phase 2 / M2) — recorded, not hard-blocking.
    claim_planner_attested: 'failed',
    finalize_contractor_attested: 'failed',
    warnings: [],
  };
}

module.exports = { CLOSURE_RECEIPT_FIELDS, CLOSURE_INVARIANTS, emptyReceipt };
