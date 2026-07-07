# Adversarial verification: n4-adversary (bundle-617-618)

Claim under test: n1-fix-617 + n2-fix-618 (commit 3660ef11 on baseline 866421aa) are ROOT-CAUSE
fixed, not symptom-masked, for #617 and #618, fail-CLOSED across all four editions.

## Disproof attempts — #618
1. Self-SIGKILL child, sync+async, independent scratch repro: baseline exitCode=0 (false-green
   reproduced independently), fixed exitCode=1 with signal recorded on both paths.
2. Self-SIGKILL end-to-end CLI in scratch git repo: fixed serial/concurrent both fail-closed with
   signal recorded; baseline on identical input passes exit 0 with no signal field (full incident
   reproduced end-to-end).
3. Empty-chains receipt vs --finalize-check: fixed refuses chains_empty (also on missing chains
   field); one-red still chains_red (precedence empty>red confirmed); baseline passes exit 0 on
   empty receipt (fail-open reproduced). Producer no_chains guard still fires correctly.
4. Fixed pattern present in all four plan-validator + run-chains copies (byte-identical
   root/claude-plugin). Two residual OLD-pattern consumers found — see R1 below.
5. test-run-chains.js genuinely spawns real SIGKILL children (not mocked); wired into claude chain
   before the walkthrough; 143 assertions pass standalone.
Verdict: #618 root-cause fail-CLOSED. One theoretical sync-path residue (status==null with neither
signal nor error) is unreachable under POSIX spawnSync semantics.

## Disproof attempts — #617
1. SINK_STEPS ordering verified directly (grep, not comment-trust) in all four editions:
   closure now after push_main; byte-identical root vs claude-plugin.
2. Incident-shape end-to-end repro: resumed --sink transaction with unmerged branch refuses
   remote_closed_after_publish_unverified, exit 1, closure left pending, zero closes attempted;
   after actually merging, re-run completes and verifies. Gate runs even under OFFLINE (before the
   OFFLINE guard). Garbage/deleted ref -> refuse.
3. git merge-base --is-ancestor gate exercised directly (verifyImplPublished): non-ancestor/null/
   garbage all -> false/refuse; ancestor -> true/verified. verify-sink CLI: unmerged -> exit 1;
   merged+cleaned -> exit 0.
4. Every close call-site across four editions traced: cmdFinalize gated by mergeLaneDeferred
   (fails TOWARD deferral on missing/unreadable state); --sink transaction closure gated by the
   ancestor check (verified above); legacy postMergeCleanup closes only after push succeeds and
   ffMergeLoop already merged (control-flow-safe, invariant wiring there is post-hoc reporting —
   see R3); cmdWatchPr's no-opts call is correct (it observes, doesn't close); pr-lane skips
   cmdFinalize entirely, closes via forge on PR merge.
Verdict: #617 root-cause fail-CLOSED on every choreographed path.

## Findings (non-blocking)

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=release.js chainReceiptGreenness (scripts/kaola-workflow-release.js:249, x4 edition copies) still returns green:true on chains:[] AND on a missing chains field (proven by execution); impact informational-only today (feeds only a --verify chain_warning; --cut never consults it despite a stale comment claiming otherwise). Worth a follow-up issue to mirror chains_empty + fix the stale comment.

finding: id=R2 scope=pre_existing action=document status=open severity=low fix_role=none rationale=cmdFinalize can still close with zero publish verification if sink:pr AND an operator manually runs finalize -- choreographically unreachable (finalize SKILL skips Step 8b for pr; pr-lane closure owned by forge/watch-pr) and pre-existing behavior deliberately preserved by the fix. No action needed.

finding: id=R3 scope=in_scope action=document status=resolved severity=low fix_role=none rationale=in the LEGACY non---sink merge pipeline, invariant wiring is post-hoc receipt reporting not a pre-close gate; ordering safety rests on control flow (push-success precedes close, ffMergeLoop precedes push), which holds. Gated-before-close enforcement lives in the --sink transaction path (verified by execution). No action needed.

Reviewer's known follow-up (verify-sink false-alarm on rebased branch) independently confirmed real
but already filed by n3-review — not re-litigated here.

## Verdict

#617: root-cause fail-CLOSED — NOT-REFUTED (confidence: high).
#618: root-cause fail-CLOSED — NOT-REFUTED (confidence: high).

evidence-binding: n4-adversary e0975cd5899d
verdict: pass
