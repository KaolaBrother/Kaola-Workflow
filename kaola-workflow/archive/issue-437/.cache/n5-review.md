evidence-binding: n5-review b0d24d55abf6
verdict: pass
findings_blocking: 0

finding: R1 scope=in_scope action=document status=open severity=advisory fix_role=none rationale=open-ready Math.max(2,groupCeiling) floors a lane group to 2 even when --max 1 was passed under containment; opens 2 disjoint writes instead of the requested 1 (no safety violation — writes are parallel-safe-verified disjoint and the group barrier still applies — but it overrides an explicit concurrency ceiling). Cleaner: suppress grouping when max===1 and degrade to serial.

## n5-review — G1 code review gate (issue-437, D-419 P2)

Reviewed: scripts/kaola-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-node.js,
scripts/kaola-workflow-parallel-batch.js + their 3 test files + the gitlab/gitea/claude-plugin ports,
all vs HEAD (==origin/main; work is uncommitted in the worktree).

### Focus-area verdicts

1. Flag-OFF byte-identity (INV-6) — PASS. resolveLaneContainment fail-closed FALSE. open-ready: flag
   OFF -> else { toOpen=[writeNodes[0]]; openKind='write' } (verbatim original); groupForm stays
   undefined so every ...(groupForm?{}:{}) spread, the group-baseline block, laneGroupEntry, and the
   lane_group key are all skipped. close-node: lg null when flag OFF (or non-member) -> closeGroupMember
   not entered, serial per-node barrier runs verbatim. parallel-batch: laneGroup omitted when no
   lane_group key. barrierCheck: opts.groupMembers absent -> existing per-node/whole-plan branches
   unchanged (GB-PURE-d locks this). Tests D437-OPEN-READY-FLAG-OFF, D437-CLOSE-NODE-FLAG-OFF-SERIAL,
   D437-MUTATION-GUARD-NOT-VACUOUS, LG2 all assert the OFF shape.

2. Group barrier correctness — PASS. Group baseline recorded in Phase 1 via --record-base --node-id
   <group_id> on the SAME pre-open tree as the per-member baselines (no writes intervene) -> baseline ==
   open-ready state. Allowlist = UNION over lg.members write sets (barrierCheck groupMembers arm). A path
   in no member's set hits the EXISTING rank-4 outOfAllow arm (reason write_set_overflow) — no new reason
   code. Cross-lane stray verified end-to-end (D437-CLOSE-NODE-CROSS-LANE-STRAY, T-GB-2, GB-PURE-b).

3. Non-last member close — PASS. closeGroupMember non-last path: evidence-shape (done in runCloseNode
   step a) + per-member vacuity + ledger complete + deferred_to_group compliance row + closed_members
   update; NO diff barrier, NO gate-verify. D437-CLOSE-NODE-DEFERRED confirms.

4. Vacuity guard — PASS. memberInLaneChanges scopes git status --porcelain to the member's parsed
   declared set only; empty + no no_op: -> refuse member_vacuity (D437-CLOSE-NODE-VACUITY-REFUSE), no_op:
   escape works. Fail-OPEN to changed:false on git error -> caller then requires no_op: (conservative).

5. --parallel-safe — PASS. Read-only (no fs/git writes), exposes the existing antichain pair-loop
   (exact-file + classifier.disjointWriteSets). result ok|refuse(overlapping_write_sets). Does not change
   grammar; reuses overlapping_write_sets framing. T-PS-1..5.

6. Crash-safety — PASS. Group baseline recorded BEFORE running-set.json write (orphan-baseline safe
   direction; manifest never references an unanchored baseline). reconcile-running-set #437 block: group
   survives iff >=1 member survives; else drop lane_group key + group baseline (--drop-base). Close-crash
   (ledger complete before running-set write) handled by the existing #384 closed-detection feeding the
   new survival check. opening crash for the group reconciles via the existing opening machine + the new
   block. Flag-OFF running sets have no lane_group -> block is a no-op.

7. Test integrity (io-shim trap) — PASS. test-commit-node & test-adaptive-node lane-group clusters drive
   REAL validator/adaptive-node subprocesses in a REAL git repo under $TMPDIR; T-GB-6 is an explicit
   mutation/bite check (lone undeclared stray MUST refuse -> a vacuous pass is impossible). RED fixtures
   real (evidence-binding nonce read from the actual barrier-base SHA).

8. Disjointness before co-open — PASS. tryFormLaneGroup shells --parallel-safe over the frontier ids and
   returns ok:false on non-zero/non-ok -> open-ready degrades to a single serial write
   (D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP). The post-ceiling subset of a pairwise-disjoint set is still
   disjoint.

9. Four-chain green — PASS (re-ran here): claude exit 0, codex exit 0, gitlab 0-fail/25-pass, gitea
   0-fail/21-pass. Edition ports diff byte-identically to base except the correct forge-rename
   require('./kaola-{gitlab,gitea}-workflow-classifier') (those classifier files exist and export
   parseWriteSetCell). parallel-batch + validator ports are byte-identical to base (no forge require in
   the changed regions).

10. No count-bump — PASS. Only the 3 scripts + 3 ports + 3 test files changed (diffstat). No
    validate-*-contracts.js / test-*-workflow-scripts.js / count file touched. grep confirms
    --parallel-safe/--group-barrier are NOT pinned in any contract validator.

### Notes
- R1 (advisory, above): --max 1 + containment + >=2 disjoint frontier opens 2 (Math.max(2,groupCeiling)
  floor) instead of honoring the explicit ceiling. Not a safety defect (disjoint + group barrier holds);
  documented as a follow-up, non-blocking.
- gb.recordBase.base extraction with gb.base fallback is correct against commit-node --start's nested
  shape; even a null extraction is harmless (the barrier reads the .cache baseline file from disk).

Verdict: APPROVE. Zero blocking findings; one advisory follow-up (R1).
