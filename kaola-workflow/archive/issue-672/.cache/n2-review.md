evidence-binding: n2-review 3d3267b92ce1
verdict: pass
findings_blocking: 0

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=cmdStaleWorktreeCleanup unprobeable-keep branch (claim.js:2932-2935) has no direct mirrored regression test (the #672 test drives legacy-worktree-cleanup only); guard is byte-similar to the tested legacy twin and the shared helper is directly tested, so non-blocking — mirror the regression for the stale sweep in a future test pass.

# n2-review (G1 gate) — review of n1-fix, issue #672

## (a) Site 1 genuinely fail-closed — PASS

- `scripts/kaola-workflow-adaptive-node.js:4522-4531`: the leg-dirty probe catch now returns `{ ok:false, reason:'leg_dirty_probe_failed', nodeId, leg, detail }`; the old `catch (_) { dirty = ''; }` silent-clean is gone. The probe carries `maxBuffer: GIT_MAX_BUFFER` (64MB, defined :44) — cap + fail-closed catch both present.
- Refuse PROPAGATES: the sole runtime caller is the last-member close path at :5920. Lines 5921-5926: `if (!synth.ok) return { result:'refuse', reason: synth.reason, nodeId, role, group_id, leg, detail, synth }` — a typed refusal emitted BEFORE `level_merged` telemetry, the group barrier, the ledger close, and the compliance row. No ledger advance; never swallowed into a success. The only other reference is the module export (:7130), consumed by the test.
- No other clean-guessing path in `synthesizeLevel`: remaining catches are `leg_capture_failed` (refuse), `merge_conflict` (refuse + `merge --abort`), `merge_head_unresolved` (refuse on empty rev-parse), and `appendNodeTiming` (telemetry, best-effort by design). The `if (!leg || !leg.legPath) continue` at :4520 is a pre-existing legs-structure guard, not a probe-fault path.
- The regression additionally asserts HEAD unchanged after the refuse — no partial merge lands.

## (b) Site 2 fail-closed on EVERY branch — PASS

- `scripts/kaola-workflow-claim.js:480-493` (`worktreeDirtyState`): `fs.existsSync` moved OUTSIDE the try, so `'missing'` is now returned only for a genuinely-absent path; the catch returns the new `'unprobeable'`. (`fs.existsSync` never throws — returns false on error — so nothing spuriously re-enters `'missing'`.)
- Exactly TWO consumers exist (grep of the whole file): `collectStale`:2864 (feeding `cmdStaleWorktreeCleanup`) and `cmdLegacyWorktreeCleanup`:3470. No third consumer changed behavior silently.
- `cmdStaleWorktreeCleanup` (loop :2923-2983): the `state === 'unprobeable'` check at :2932-2935 is the FIRST state branch — before the dirty-skip (:2937), the dry-run branch (:2942), the archive/export pre-steps (:2949-2967), the missing-prune (:2970), and the else `removeWorktree` (:2977). It consults NO args — no `--force`/`--archive`/`--export` override — and `continue`s unconditionally in both dry-run and execute mode into `skipped_unprobeable`.
- Branch-deletion phase (:2986-3008) cannot touch the kept worktree's branch: `branchesWithWorktree` includes it (:2851) so it is excluded from `stale_branches` (:2880); it never enters `removedBranches` (added only on removal); and the `stillRegistered` re-scan (:2997) is a second fence.
- `cmdLegacyWorktreeCleanup` (loop :3467-3525): identical first-branch guard :3475-3478; missing-prune :3514 and else `removeWorktree` :3520 unreachable for `'unprobeable'`. Container teardown (:3531) uses `fs.rmdirSync`, which refuses non-empty (surfaces `container_not_empty`) — never recursive.
- `'missing'` still prunes on both paths (:2970-2975, :3514-3518, unchanged) — only the new `'unprobeable'` is kept.

## (c) Cross-edition byte parity — PASS

- `node scripts/edition-sync.js --check` → `edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical.` (clean).
- `leg_dirty_probe_failed` present in all 4 adaptive-node editions (canonical, codex twin, gitlab + gitea @generated ports) — 1 hit each.
- `unprobeable` present 15x in ALL 4 claim.js editions. The DIVERGENT gitlab/gitea forge hand-ports verified structurally: helper return (gitlab :503, gitea :503) AND the guard in BOTH consumers (gitlab :2690 + :3204; gitea :2685 + :3196) with `skipped_unprobeable` in both `buckets`/`dryBuckets` literals of both commands.

## (d) Real RED→GREEN — PASS (independently reproduced)

- Reproduced RED myself: copied `scripts/` to the session scratchpad, reverted ONLY the two production scripts to HEAD (`git show HEAD:...`; grep confirms 0 `unprobeable`), re-ran both suites there:
  - `test-adaptive-node.js` → both S5-PROBE-FAILED-REFUSE asserts FAIL exactly as n1 reported: `{"ok":true,"mergeCommit":...}` with HEAD advanced — legA's `ax.js` silently dropped from M. (A 3rd failure, D444-GUARDS, is an artifact of the partial-revert scratch env — canonical reverted with no `plugins/` tree present — not a product signal; n1's in-tree RED showed exactly 2.)
  - `test-claim-hardening.js` → both #672 asserts FAIL exactly as n1 reported: the unprobeable worktree lands in `removed` via the missing-prune branch (registration pruned + mislabeled removed while the dir still exists).
- Discriminating vs masked fixes: both tests corrupt the worktree `.git` link so the probe THROWS regardless of buffer size — a cap-only "fix" leaves catch→clean/missing and still fails. A state-added-but-consumer-not-taught fix routes `'unprobeable'` past the `'dirty'` skip and `'missing'` prune into the else `removeWorktree` (`git worktree remove --force`, claim.js:500) — the survive/removed/skipped_unprobeable asserts fail. Real invariants asserted: refuse reason + HEAD unchanged (no silent leg loss); dir + `real-work.txt` survive `--execute`, `removed` excludes it, `skipped_unprobeable` records it (fail LOUD).
- Count note (immaterial): claim-hardening RED = "2 failures, 171 passed" (173 total) → the new block adds 4 asserts (2 of which — dry_run, dir-survives — pass even on pre-fix code since the old path pruned rather than deleted), so the true baseline was 169, not n1's stated 171; totals are internally consistent and post-fix all 173 pass. adaptive-node arithmetic is exact (1787 + 2 = 1789).

## (e) Surgical + sibling-consumer change justified — PASS

- n1's claim is TRUE by direct code reading: pre-fix `cmdStaleWorktreeCleanup`'s state ladder (dirty-skip → dry-run → dirty pre-steps → missing-prune → ELSE `removeWorktree`) gives `'unprobeable'` — matching neither `'dirty'` nor `'missing'` — a fall-through to `removeWorktree` under `--execute`, and `removeWorktree` (claim.js:496-508) is `git worktree remove --force`. Changing the shared helper WITHOUT teaching this consumer would have upgraded its existing prune-mislabel bug into an actual forced removal. Required by the helper contract change; not scope creep.
- Diff is surgical: 10 files = 2 canonical scripts + 2 tests + 6 edition mirrors; production hunks are exactly the 3 sites (probe catch; helper; 2x guard + bucket fields). Reviewed hunk-by-hunk; no unrelated churn.

## (f) Suites — PASS

- `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1789 assertions)`
- `node scripts/test-claim-hardening.js` → `claim-hardening tests passed (173 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)
- stderr noise observed and explained: the localized `git` fatal lines during adaptive-node are intentional corrupted-repo fixtures; the "Could not resolve to an Issue with the number of 702" line during claim-hardening is pre-existing probe noise from another test block. Both suites exited green.

## Verdict

APPROVE — both fail-opens are genuinely fail-closed, the refuses propagate, every removal branch keeps `'unprobeable'` with zero override, all 4 editions are in parity, and the regressions are discriminating (RED independently reproduced). Zero blocking findings; one LOW non-blocking follow-up (R1).
