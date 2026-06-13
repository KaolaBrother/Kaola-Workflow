evidence-binding: n6-security b609bea7f32d
verdict: pass
findings_blocking: 0

# n6-security — D-419 Part 2 group-scoped close barrier (G2 security gate)

Mandate: confirm the union-diff attribution closes the close-side hole with NO weaker write
coverage than the serial barrier, and that flag-OFF is byte-identical.

VERDICT: PASS. The group barrier closes the serial close-side hole, the union allowlist is
exactly as restrictive as the serial allowlist (provably, because members are disjoint), the
flag-OFF path is byte-identical (guarded, not vacuous), the shared baseline reuses the serial
machinery including the #368 ref-mismatch cross-check, and the cross-lane stray HARD-refuses.
All four edition trees carry byte-identical security-critical functions. All four test chains
green.

## 1. Group barrier closes the serial-barrier close-side hole — CONFIRMED

scripts/kaola-workflow-adaptive-node.js closeGroupMember (L2996-3138):
- NON-LAST close (L3030-3073) DEFERS the diff barrier (`barrier: deferred_to_group`); it runs
  only the per-member in-lane vacuity presence check (memberInLaneChanges, scoped to the
  member's OWN declared set) — never the diff barrier. So no false `write_set_overflow` from a
  sibling's in-lane writes sitting in the shared worktree. This is the precise structural break
  the settlement fixes.
- LAST-member close (L3075-3088) runs `--group-barrier --group-id <id>` ONCE while
  lane_group.members STILL holds the full set. The validator (plan-validator.js L1978-1981)
  diffs the GROUP BASELINE (recorded at open-ready, pre-any-writes) -> `now` snapshot, so it
  sees ALL writes from every member.
- Attribution uses the UNION of member write sets as the allowlist (barrierCheck opts.groupMembers
  arm, L676-682): for each member id, union in n.writeSet. Any file written by A or B to its own
  declared set is in the union ⇒ within allowlist ⇒ no false overflow.
- A file written by NEITHER member ⇒ falls to the EXISTING rank-4 out-of-allowlist arm
  (L719-722, reason `write_set_overflow`/`unattributed_write`) — same handling as the serial
  barrier's out-of-declared-set refusal. No new reason code.
Test: D437-CLOSE-NODE-GROUP-PASS (test-adaptive-node.js L5029-5054) drives the REAL subprocess
in a REAL git repo (#292 io-shim trap avoided): writes ax.js + by.js, closes A (deferred) then
B (last) → single group barrier over union(A,B) PASSES, both complete, lane_group cleared,
group baseline dropped. Confirms BOTH members' writes pass the one group barrier.

## 2. No write-set weakening — CONFIRMED

The union allowlist is exactly as restrictive as the serial per-node allowlist because the
members are PROVABLY disjoint:
- `--parallel-safe` (plan-validator.js L1627-1675) runs BEFORE co-open (tryFormLaneGroup,
  adaptive-node.js L2522-2536). It rejects exact-file overlap (antichain RED rule, L1663) AND
  coarse/shared-infra non-green (classifier.disjointWriteSets, L1665). Overlap ⇒ result:'refuse'
  ⇒ open-ready DEGRADES to a single serial write (L2646-2649).
- Therefore every path in the union maps to exactly ONE (unique) member's declared set. A path
  written by A: allowed by union (A's set subset-of union); also would be allowed by A's serial
  barrier ⇒ equivalent. A path written by B at the LAST close: allowed by union; under the broken
  serial A-barrier it would have false-refused ⇒ the group barrier is strictly CORRECT here (the
  serial was wrong). A path written by neither: refused by both ⇒ equivalent.
- "Both declare the same file" cannot occur: the disjointness gate forbids co-open on overlap.
Test: D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP (L4972-4985): aSet==bSet==ax.js ⇒ NO laneGroup,
serial degrade. Proves the union is only ever formed over disjoint sets.

## 3. Flag-OFF invariant (security angle) — CONFIRMED

resolveLaneContainment (adaptive-schema.js L352-355) fail-closed default FALSE; only 1/true/yes
opts in.
- open-ready: the group-form branch is gated on `containment && writeNodes.length >= 2`
  (L2625-2626). Flag OFF ⇒ falls to the single-serial write open (L2650-2652) — no lane_group,
  no group baseline, no new surface.
- close-node: the member branch is gated on `resolveLaneContainment && running0.lane_group &&
  members.includes(nodeId)` (L2890-2899). Flag OFF ⇒ lg is null ⇒ the serial per-node barrier
  (L2901-2978) runs verbatim.
Tests: D437-OPEN-READY-FLAG-OFF (L4987-5001), D437-CLOSE-NODE-FLAG-OFF-SERIAL (L5101-5119), and
the explicit anti-vacuity guard D437-MUTATION-GUARD-NOT-VACUOUS (L5121-5135) prove the toggle
guard is not vacuous (flag-OFF opens exactly one write, no lane_group key). S-BYTE serial
byte-identity invariant (L4094) preserved.

## 4. Baseline integrity — CONFIRMED

- Shared group baseline recorded ONCE at open-ready, BEFORE any per-member baseline and before
  any write (adaptive-node.js L2682-2694), via `--record-base --node-id <group_id>` — the SAME
  cacheBaseFile/barrierRef/anchorBase/snapshotWorktree machinery as the serial baseline
  (plan-validator.js L1541-1573, L1753/L1758; the group_id is just a string node-id through the
  identical [^A-Za-z0-9_-] sanitizer).
- Not overwritten by later writes: recorded in Phase 1; the lane_group manifest carries the SHA
  (L2707-2713); never re-recorded.
- #368 ref-vs-file mismatch cross-check IS replicated for the group baseline (plan-validator.js
  L1972-1977: refuse `barrier_base_mismatch` when the .cache file SHA != the gc-anchored ref) —
  blocks the launder-via-re-record vacuous pass.
- The group baseline `--drop-base` happens AFTER the barrier passed and AFTER the last member
  closed (adaptive-node.js L3118). The group_id has no ledger row, so the #424 window-lock
  (plan-validator.js L1822-1826, checks `in_progress`) returns undefined and permits the drop —
  but there is no laundering window because the barrier already ran against the live baseline
  before the drop. Ordering is correct.
Test: D437-CLOSE-NODE-GROUP-PASS asserts the group baseline file is gone post-close (L5050-5052).

## 5. Input validation — CONFIRMED

- `--parallel-safe`: missing --nodes ⇒ `missing_nodes` (L1637-1641); <2 ids ⇒ `too_few_nodes`
  (L1643-1647); unknown id ⇒ `node_not_found` naming the missing ids (L1650-1655). All typed
  refusals, exit 1 — not silent pass.
- `--group-barrier`: missing --group-id ⇒ typed refusal (L1925-1928); unreadable running-set ⇒
  `running_set_unreadable` (L1946-1949); group_id not the live lane_group ⇒ `group_not_found`
  (L1951-1954); empty members ⇒ `group_not_found (no members)` (L1959-1962); no recorded group
  base ⇒ `no_group_base` (L1968-1971); root mismatch ⇒ `root_mismatch` fail-closed (L1937-1940).
- close-node validates membership before the deferred path: `isMember` (L2893) gates
  closeGroupMember; a non-member serial node takes the verbatim per-node path.

## 6. Cross-lane stray scenario — CONFIRMED (HARD refuse, not advisory)

A write to a file declared by NEITHER member is caught by the union allowlist's rank-4
out-of-allow arm (plan-validator.js L719-722, L760-771), reason `write_set_overflow`/
`unattributed_write`. closeGroupMember treats a non-pass group barrier as a typed refusal with
NO ledger advance, lane_group untouched, baseline retained (adaptive-node.js L3079-3088).
Test: D437-CLOSE-NODE-CROSS-LANE-STRAY (test-adaptive-node.js L5076-5099): writes ax.js + by.js
+ z.js (undeclared); A defers ok (z.js invisible at A's vacuity probe), B (last) REFUSES with
write_set_overflow/unattributed_write, B stays in_progress, lane_group NOT cleared. Hard refuse
confirmed.

## Cross-edition parity (the #291/#332 landmine)

This is a cross-edition diff (gitlab/gitea/codex plugin trees touched). Verified the
security-critical functions are BYTE-IDENTICAL across all four trees (not merely count-identical
— the #332 false byte-identity lesson):
- barrierCheck (union attribution core): sha 5230fa1a... identical x4.
- closeGroupMember (deferred/group choreography): sha d5f3549a... identical x4.
- groupMembers arm / --group-barrier / --parallel-safe / barrier_base_mismatch / closeGroupMember
  / resolveLaneContainment / deferred_to_group counts all identical x4.

## Test evidence

- node scripts/test-adaptive-node.js → 623 assertions passed (incl. all D437 lane-group tests).
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed".
- All four chains green (run sequentially):
  - test:kaola-workflow:codex → exit 0, "Kaola-Workflow walkthrough simulation passed".
  - test:kaola-workflow:gitlab → exit 0, "GitLab Codex workflow walkthrough simulation passed".
  - test:kaola-workflow:gitea → exit 0, all PASSED.
  No FAIL/Error in any chain log.

## Machine-readable findings

finding: id=S1 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=group_barrier_union_attribution_closes_close_side_hole_verified
finding: id=S2 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=union_allowlist_equally_restrictive_members_provably_disjoint_via_parallel_safe
finding: id=S3 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=flag_off_byte_identical_guarded_not_vacuous_S_BYTE_and_mutation_guard_tests
finding: id=S4 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=group_baseline_reuses_serial_machinery_368_ref_mismatch_crosscheck_replicated_no_launder_window
finding: id=S5 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=input_validation_typed_refusals_on_missing_node_group_base_membership
finding: id=S6 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=cross_lane_stray_hard_refuse_no_ledger_advance_lane_group_retained
finding: id=S7 scope=in_scope action=none status=resolved severity=advisory fix_role=none rationale=security_critical_functions_byte_identical_across_4_editions_four_chains_green
