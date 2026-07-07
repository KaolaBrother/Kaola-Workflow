evidence-binding: n2-review 81aeb0a528ec
verdict: pass
findings_blocking: 0

finding: id=R5 scope=pre_existing action=follow_up status=deferred severity=medium fix_role=none rationale=run-chains suites (claude test-run-chains.js, gitlab/gitea counterparts) flake on this host independent of this diff — stash-verified identical failures on unmodified source; blocks a literal four-chain-green recording at finalize; file a follow-up issue

# n2-review — REPAIR PASS review of n1-scheduler-fixes (code-reviewer, second pass)

Scope of this pass: the R4 repair (`lane_group_live` speculative-write exclusion) plus end-to-end
re-confirmation of the whole n1 node. Prior approval was NOT trusted; every hunk of the live diff
(16 hunks in canonical, 546-line test delta) was re-read, and all validation commands were re-run
independently in this session.

## 1. The R4 fix — correct and complete

- Location: `scripts/kaola-workflow-adaptive-node.js` `runOpenReady`, lines 4341-4356 — a single
  additive `else if (liveGroupId)` branch between the sibling `no_leg_capability` (4338) and
  `parent_dirty` (4357) exclusions, excluding ALL speculative write candidates with typed reason
  `lane_group_live` while any write lane_group descriptor is live.
- Completeness verified by exhausting the formation paths. Descriptor CREATION has exactly one site
  (the `laneGroupEntry` write, :4652, fed by `groupForm`); `groupForm` is set on exactly two branches:
  (a) the speculative-write branch — now excluded by `liveGroupId`; (b) the non-speculative co-open
  branch — gated by `liveNodes.length === 0`, unreachable while any group member is live (non-last
  member close removes only the closing member from `nodes` and keeps `lane_group`; `merge_awaits_read_drain`
  and all group-barrier refusals are zero-mutation, so a live group always implies a live member).
  Every other running-set writer preserves or deletes the descriptor, never creates: the read/gate
  co-open path falls back to `existingLaneGroup` verbatim (:4624-4648), the main-session-gate entry
  writer spreads `...base` (:3496-3500), non-last close updates `closed_members` only (:5182),
  last-member close deletes after merge (:5306), reconcile deletes only when `!laneGroupSurvives`
  (:5642). `runOpenNext` refuses under `excl: ['scheduler']` while a running set is live, and
  close-and-open-next carries the lane-group member fence — neither can collide. Crash states
  (opening running set) are refused with `reconcile_first` before any of this logic runs.
- Sibling exclusions unaffected: `no_leg_capability` is checked first (unchanged); `parent_dirty`
  is checked after — in the `liveGroupId` case the parent-clean fence subprocess is now not spawned,
  which only matters when all candidates were being excluded anyway (strictly cheaper, outcome
  identical: `toOpen = []` + a typed `speculativeWriteExcluded`).
- Cost check: the fix removes no reachable parallelism — the excluded write waits, and the test's
  recovery leg proves W2 opens through the ORDINARY path the moment its gate completes.
- The alternative (guarding the descriptor assignment itself) was considered and reasonably rejected
  in the evidence: exclusion-at-selection short-circuits before leg provisioning/baseline recording,
  avoiding provision-then-unwind churn, and mirrors the established sibling-exclusion pattern.

## 2. No regression to #621/#622/#633 — confirmed

- All 16 diff hunks in the canonical file re-read: #621 fused-advance baseline-first (:2483-2507,
  refusal leaves the next row PENDING, close-half preserved) and reopen-node idempotency
  (:2917-2925 `alreadyAtTarget` tolerance + :3045-3060 baseline-while-PENDING then flip); #622
  relaxation (:4226-4243 `liveHasLeglessWrite`), descriptor preservation (:4624-4648), last-member
  merge fence (:5199-5217); #633 `legMirrorPath` (:3808), tracked-stub seeding (:4535-4572),
  leg-preferred evidence read (:4895-4911, with a pure `running0`/`lg` hoist). The R4 repair touches
  none of them — it is the one additive branch plus comment-only `liveHasWrite`→`liveHasLeglessWrite`
  renames in two comments.
- Test suite: `node scripts/test-adaptive-node.js` re-run this session — 1478/1478 assertions pass.
  Arithmetic consistent with the evidence: pre-fix run "11 failures, 1467 passed" = 1478 total.
- Pre-existing assertions: the full test-file diff contains exactly ONE modified pre-existing
  assertion — S5-MULTI-LEVEL's level-2 leg-baseline check, replaced (1-for-1) by a
  `merge-base --is-ancestor` ancestry assertion. That change belongs to the ORIGINAL #633 fix (the
  tracked stub-seed commit moves the leg branch-point one commit past M1, so byte-equality to M1 is
  structurally impossible post-fix), is documented in-line, and the replacement still pins the
  meaningful invariant (legs branch off the prior level's commit chain). NOT a repair-pass weakening;
  no other pre-existing assertion was touched — everything else in the 546-line test delta is added
  lines (the three original RED blocks + the 318-line R4-REGRESSION block).

## 3. RED test quality — genuine end-to-end

- `R4-REGRESSION` (test-adaptive-node.js :7204-7345): `makeR4Repo` builds a REAL temp git repo
  (mkdtemp + git init + real commits), freezes a REAL 7-node plan via the actual validator
  subprocess, and drives the actual adaptive-node CLI via `runNode` = `execFileSync('node', [NODE_CLI, ...])`.
  No mocks, no stubs, no in-process shortcuts.
- It reproduces the exact R4 interleaving: {A,B} co-open -> A defers -> gateR (read) co-opens
  alongside live B (the #622 relaxation working as designed) -> the regression tick with W2
  speculativePending — then asserts exclusion (`lane_group_live`), descriptor survival (original
  group_id + B's membership), W2 untouched (ledger pending, absent from running set), the merge-fence
  hold, the post-drain `group_passed` merge with BOTH ar4.js and br4.js reaching HEAD, leg-worktree
  teardown, and W2's ordinary open afterward.
- The 11-failures-pre-fix claim is plausible: the harness assert is soft-counting (continues past
  failures), and pre-fix the cascade fails exactly the assertions the evidence lists verbatim
  (opened.length, exclusion reason, W2 ledger/running-set, group_id flip to lg-W2, members collapse
  to [W2], B routed to the serial close (no barrier field), ar4/br4 missing from HEAD, leaked legs,
  W2 reopen shape).

## 4. Cross-edition parity + four chains — re-verified independently

- `node scripts/edition-sync.js --check` (this session): "10 forge aggregator ports in
  rename-normalized parity with canonical". `cmp` canonical vs `plugins/kaola-workflow/scripts/`
  twin: byte-identical. All three ports grep exactly one `lane_group_live` occurrence, matching
  canonical.
- `npm run test:kaola-workflow:codex`: fully GREEN end-to-end (this session).
- `node scripts/simulate-workflow-walkthrough.js`: "Workflow walkthrough simulation passed" (this session).
- claude chain: every substantive component green (test-adaptive-node 1478, walkthrough, edition
  checks) EXCEPT `scripts/test-run-chains.js`. Flake claim INDEPENDENTLY VERIFIED, three ways:
  (a) `test-run-chains.js` has ZERO references to `kaola-workflow-adaptive-node.js` (it exercises the
  chain-runner with MOCK chain scripts); (b) three runs on the SAME modified source failed 16
  assertions each but on DIFFERENT subsets (T20/T22/T26/T27/T28 vs T22/T25x2/T27/T28) with different
  pass counts (89 vs 103) — non-deterministic subprocess-signal timing (SIGTERM recorded as
  timed_out:true), impossible for a deterministic regression; (c) the decisive check — I stashed all
  five modified files (diff snapshotted first, restored byte-identical after pop, verified by diff
  against the snapshot) and re-ran on UNMODIFIED source: identical 16-failure signature. The flake is
  pre-existing and environment-level (Node v25.5.0 signal/receipt timing).
- gitlab/gitea chains: all forge contract validators + walkthrough tests green up to their own
  `test-*-run-chains.js` counterparts, which fail the same way — zero adaptive-node references, and a
  DIFFERENT assertion per retry (gitea: G2 on run 1, G3 on run 2), matching the evidence's reported
  pattern. Recorded as finding R5 (pre_existing, follow_up): it is orthogonal infra noise, but it
  prevents a literal #307 "all four chains green" recording at finalize on this host and deserves its
  own issue.

## 5. Scope discipline — confirmed

- `git status`: exactly the five declared files modified (`scripts/kaola-workflow-adaptive-node.js`,
  the codex twin, the gitlab/gitea ports, `scripts/test-adaptive-node.js`).
  `scripts/simulate-workflow-walkthrough.js` untouched — the plan pre-authorizes this under-write
  ("under-write with a skip-reason is safe if it is not touched"); it was declared defensively and
  the scheduler changes required no integration-assertion update there (the walkthrough passes as-is).
- The only untracked path is `kaola-workflow/bundle-621-622-633/` (this run's own workflow state).

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info (pre-existing, non-blocking — finding R5) |
| LOW      | 0     | pass   |

Verdict: APPROVE — the R4 repair is a correct, complete, purely additive closure of the
speculative-write/live-lane-group collision; the #621/#622/#633 fixes are intact and re-verified
green; the RED test is a genuine end-to-end reproduction; cross-edition parity holds; the sole open
concern (run-chains flake) is proven pre-existing and out of scope.
