#!/usr/bin/env node
'use strict';

// fixtures-orphan-legality.js — shared fixture for the #293 "align" node.
//
// Provides the canonical input that exposes the crossCheckStatus / runOrient
// disagreement (issue #293, #291 finding F1):
//
//   manifest  = [{ id: 'a', sealed: true }]   (all members sealed)
//   inProgressIds = ['a']                      (one stale in_progress row)
//
// crossCheckStatus (BEFORE the fix) incorrectly reports orphan_member_set_mismatch
// because it compares unsealed members (empty) to ip (['a']) — sets unequal.
// runOrient ALREADY correctly returns result:ok / batch:null because its
// AC#5 gate short-circuits on inProgressNodes.length <= 1.
//
// After the fix both must agree: legacy single-node path, NOT orphan.
//
// Importing this fixture in BOTH test files is the anti-drift mechanism
// required by #293: a single definition prevents the two assertions from
// diverging on what the "same input" actually is.

// ---------------------------------------------------------------------------
// INPUT — the shared trigger that exposed the disagreement.
// ---------------------------------------------------------------------------

/** Active-batch manifest: one member 'a', already sealed. */
const ORPHAN_LEGALITY_MANIFEST = [{ id: 'a', sealed: true }];

/** inProgressIds: one stale in_progress row whose member is already sealed. */
const ORPHAN_LEGALITY_IN_PROGRESS_IDS = ['a'];

// ---------------------------------------------------------------------------
// EXPECTED OUTCOMES
// ---------------------------------------------------------------------------

/**
 * crossCheckStatus expected result (after the fix):
 * The single in_progress row must be treated as the legacy single-node path —
 * valid:true, orphan:false, reason:'single_in_progress'.
 */
const CROSS_CHECK_EXPECTED = {
  valid: true,
  orphan: false,
  reason: 'single_in_progress',
};

/**
 * runOrient expected result (already correct today):
 * A single in_progress row (regardless of manifest) falls through to the
 * legacy single-node path — result:'ok', batch:null.
 */
const RUN_ORIENT_EXPECTED = {
  result: 'ok',
  batch: null,
};

// ---------------------------------------------------------------------------
// #305 — interrupted rolling top-up (member.opening:true) shared shape.
//
// A live batch manifest (state 'open') whose last top-up member 'c' is still
// mid-transaction (opening:true): appended to the manifest by `top-up` BEFORE
// its ledger row flipped (or before the flip was persisted). A crash in that
// window leaves the manifest 'open' (NOT the whole-batch 'opening' marker) with
// one opening member. crossCheckStatus and runOrient must AGREE that this is a
// RECONCILABLE interrupted top-up — never orphan, never a dispatchable valid
// batch — and must agree BOTH before the in-flight row flips (in_progress=[a,b])
// AND after it (in_progress=[a,b,c]). Sharing one definition across both test
// files is the anti-drift mechanism (#293/#302 lineage).
// ---------------------------------------------------------------------------

/** Interrupted-top-up manifest: a,b open + c still opening:true; whole-batch state 'open'. */
const TOPUP_INCOMPLETE_MANIFEST = {
  batchId: 'batch-a-b-c',
  state: 'open',
  kind: 'read_only',
  members: [
    { id: 'a', sealed: false },
    { id: 'b', sealed: false },
    { id: 'c', sealed: false, opening: true },
  ],
};

/** in_progress ids BEFORE the in-flight member's ledger row flips. */
const TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE = ['a', 'b'];

/** in_progress ids AFTER the in-flight member's ledger row flips. */
const TOPUP_INCOMPLETE_IN_PROGRESS_AFTER = ['a', 'b', 'c'];

/** Shared typed reason: reconcilable, not orphan, not valid/dispatchable. */
const TOPUP_INCOMPLETE_REASON = 'batch_topup_incomplete';

module.exports = {
  ORPHAN_LEGALITY_MANIFEST,
  ORPHAN_LEGALITY_IN_PROGRESS_IDS,
  CROSS_CHECK_EXPECTED,
  RUN_ORIENT_EXPECTED,
  TOPUP_INCOMPLETE_MANIFEST,
  TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE,
  TOPUP_INCOMPLETE_IN_PROGRESS_AFTER,
  TOPUP_INCOMPLETE_REASON,
};
