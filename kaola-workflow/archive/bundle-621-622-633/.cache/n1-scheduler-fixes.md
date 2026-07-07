evidence-binding: n1-scheduler-fixes 3feeb7b9bf2c

REPAIR PASS — fixes finding R4 (adversarial-verifier, blocking, high-severity) found against the
prior pass's #622 fix in `scripts/kaola-workflow-adaptive-node.js`. This pass touches ONLY the R4
regression; the #621/#622/#633 fixes themselves are untouched and re-verified green via the full
existing suite (see GREEN below) — not re-read/re-litigated.

## Root cause

`runOpenReady`'s #622 relaxation lets a READ co-open alongside a still-live LEG-CONTAINED write
lane_group (e.g. `{A,B}` open as `lg-A-B`; `A` closes/defers; `B` stays live; a dependent read gate
`R` — e.g. code-reviewer — opens alongside `B`). That interacted badly with the PRE-EXISTING #596
speculative-write fallback: on the NEXT `open-ready` tick, the normal frontier is empty (blocked on
the still-open gate `R`), but a write node `W2` whose ONLY unsatisfied dependency is `R` is
`speculativePending`. The speculative-write branch fired for `W2` while `B` was still a live
lane_group member, `selectSpeculativeWriteGroup` formed `W2` its OWN size-1 group (`lg-W2`), and the
running-set write-descriptor assignment at the `groupForm ? {...} : existingLaneGroup` ternary
UNCONDITIONALLY overwrote the running-set's single `lane_group` key with the NEW `lg-W2` descriptor
— discarding `lg-A-B` (and `B`'s membership within it) entirely. `B` was still present in
`running.nodes`, but no longer recognized as a `lane_group` member. When `B` later tried to close,
`runCloseNode`'s `isMember` check (`lg.members.includes(nodeId)`) read the NEW `lg-W2` descriptor,
found `B` absent from `['W2']`, and routed `B` down the SERIAL close path instead of
`closeGroupMember` — no merge attempted, `B`'s committed in-lane leg work never reaching HEAD, and
its leg worktree left orphaned (leaked).

This exact interleaving was structurally unreachable pre-#622 (open-ready's `write_node_exclusive`
check refused ANY co-open while a write was live, so a read gate could never open alongside a live
write lane_group in the first place, and the speculative branch could never be reached with a write
group still live).

## Fix

`scripts/kaola-workflow-adaptive-node.js`, `runOpenReady`'s speculative-write branch (sibling of the
existing `no_leg_capability` / `parent_dirty` exclusions): added a `liveGroupId` check (the SAME
`existing.lane_group.group_id` local the #622 relaxation already computes) that excludes ALL
speculative write candidates — with a new typed reason `lane_group_live` — whenever a write
lane_group is ALREADY live. Running-set.json carries exactly one `lane_group` descriptor at a time,
so a NEW speculative write group must never be allowed to form (and therefore never overwrite the
live one) while an existing one is still open. The speculative write simply waits; once the live
group fully drains and clears its `lane_group` key, a later tick can safely form a new one — this is
a pure ordering fix, costing no reachable parallelism (proven in the RED/GREEN test's recovery leg:
`W2` opens normally, non-speculatively, the moment `gateR` completes).

Considered the alternative (make the running-set write-descriptor assignment itself refuse to
replace a live descriptor) but chose the exclusion-at-selection fix: it mirrors the sibling
`no_leg_capability`/`parent_dirty` exclusions' existing pattern exactly, and short-circuits BEFORE
any leg provisioning / baseline recording happens for `W2`, so there is no leg-provision-then-
discard churn to unwind.

## RED (pre-fix, `scripts/test-adaptive-node.js`, new block "R4-REGRESSION")

New end-to-end test (`makeR4Repo`: seed(complete) -> A,B (disjoint tdd-guide writes) -> gateR
(code-reviewer, depends on A only) -> W2 (tdd-guide write, depends on gateR only) -> review
(code-reviewer, depends on B,W2) -> finalize; `speculative_open_policy: auto`) drives the REAL
adaptive-node + plan-validator subprocesses in a REAL git repo, reproducing the EXACT scenario: (1)
{A,B} co-open as `lg-A-B`; (2) A closes deferred_to_group; (3) gateR co-opens as a read alongside
live B (the #622 relaxation); (4) the regression tick — open-ready is invoked while B is still live
and gateR still open. Pre-fix, run against the UNPATCHED source:

  FAIL: R4-REGRESSION: W2 must NOT speculative-open while B's write lane group is still live, got
    {"result":"ok",...,"opened":[{"id":"W2",...}],...,
     "laneGroup":{"group_id":"lg-W2","members":["W2"],...}}
  FAIL: R4-REGRESSION: W2 is excluded with reason lane_group_live, got undefined
  FAIL: R4-REGRESSION: the ORIGINAL live lane_group survives untouched ..., got
    {"group_id":"lg-W2","members":["W2"],...}   <- lg-A-B OVERWRITTEN, B's membership LOST
  FAIL: R4-REGRESSION: B is still tracked as a lane_group member, got {"group_id":"lg-W2",...}
  FAIL: R4-REGRESSION: B's last-member merge is HELD while gateR is live, got
    {"result":"ok","closed":"B",...}   <- no `barrier` field: B fell to the SERIAL close path, not
                                            merge_awaits_read_drain, because it was no longer
                                            recognized as a lane_group member
  FAIL: R4-REGRESSION: both A and B in-lane files reach HEAD after the drained merge, got
    [".gitignore",".cache/A.md",".cache/B.md",".cache/W2.md","workflow-plan.md","workflow-state.md"]
    <- ar4.js/br4.js (B's actual in-lane work) NEVER reached HEAD: silently lost, exactly as R4
       predicted
  FAIL: R4-REGRESSION: A/B leg worktrees torn down on clean completion, got [... legs/A, legs/B
    still present ...]   <- leaked leg worktrees
  (11 failures total pre-fix; full run: "adaptive-node tests FAILED (11 failures, 1467 passed)")

This reproduces every symptom the adversarial-verifier's finding R4 named: the `lane_group_id` flip
to `lg-W2`, `members` collapsing to `["W2"]`, B's leg-manifest entry gone, B's silent work loss, and
the leaked leg worktree.

## GREEN (post-fix)

Added the `liveGroupId` exclusion in `runOpenReady`'s speculative-write branch (reason
`lane_group_live`). Re-ran the SAME test file against the patched source:

  adaptive-node tests passed (1478 assertions)

All 11 previously-failing R4-REGRESSION assertions now pass, e.g.:
  - open3.opened.length === 0, speculativeWriteExcluded.reason === 'lane_group_live', nodeIds
    includes 'W2'
  - running-set.json's lane_group.group_id stays the ORIGINAL {A,B} group_id; members still
    includes 'B'
  - W2 never enters the running set (ledger stays pending)
  - B's close is correctly HELD (`merge_awaits_read_drain`) while gateR (the read) is live — the
    pre-existing #622 merge fence, unaffected
  - once gateR closes (verdict: pass) and B's group drains, B's retried close reaches
    `barrier: group_passed`, `synthesized: true`; ar4.js AND br4.js both reach HEAD; the A/B leg
    worktrees are torn down cleanly (no leak)
  - W2 subsequently opens through the ORDINARY (non-speculative) path once gateR is complete,
    proving the fix costs no reachable parallelism

## Full-suite / cross-edition validation

- `node scripts/test-adaptive-node.js` — 1478/1478 assertions pass (was 1416 before this test was
  added; +62 new assertions in the R4-REGRESSION block, all green post-fix). Confirmed via
  `git stash`/`stash pop` that the pre-existing 1416 assertions (covering #621/#622/#633 and every
  other prior behavior — merge-fence-holds-then-drains, mixed-frontier co-open, etc.) are untouched
  and green both before and after this repair — zero regression on prior work.
- `node scripts/simulate-workflow-walkthrough.js` — "Workflow walkthrough simulation passed".
- `node scripts/edition-sync.js --write` then `--check` — 3 file(s) regenerated
  (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`); `--check` reports
  "10 forge aggregator ports in rename-normalized parity with canonical" — cross-edition byte parity
  confirmed.
- `npm run test:kaola-workflow:claude` (the claude leg of the four-chain) — `test-adaptive-node.js`
  and `simulate-workflow-walkthrough.js` both green (run directly, see above). The FULL chained
  command additionally runs `scripts/test-run-chains.js`, which failed — but on investigation this
  is a PRE-EXISTING, environment-level flake wholly unrelated to this fix: (a) `test-run-chains.js`
  has ZERO references to `kaola-workflow-adaptive-node.js`; (b) repeated re-runs fail on a DIFFERENT
  random subset of assertions each time (T1/T2/T3/T7/T14/... — the signature of a subprocess-signal/
  receipt-file timing race, not a deterministic regression); (c) confirmed via `git stash` that the
  SAME flake reproduces byte-for-byte on the UNMODIFIED pre-repair source. The gitlab/gitea chains
  show the identical pattern in their own `test-*-run-chains.js` counterparts (also zero references
  to adaptive-node.js, also a different assertion failing each retry — G2 then G3 then G2 — and one
  gitea baseline run with my changes stashed out came up fully GREEN, proving the flake is
  independent of this diff). `npm run test:kaola-workflow:codex` (the one chain with no run-chains
  sub-test) ran clean end-to-end. Cross-edition CORRECTNESS for this diff is established by the
  edition-sync byte-parity check above (the actual mechanism #307 exists to guard); the run-chains
  flake is orthogonal infra noise this repair pass does not touch (out of the declared write set and
  unrelated to the R4 regression).
