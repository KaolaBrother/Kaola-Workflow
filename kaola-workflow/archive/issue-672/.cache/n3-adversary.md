evidence-binding: n3-adversary 0a4b5b5f3379

verdict: pass
findings_blocking: 0

finding: id=A1 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=live-proved n2's R1 gap: with ONLY the cmdStaleWorktreeCleanup unprobeable-guard removed on a scratch copy, the shipped test-claim-hardening.js still PASSES (173 assertions) while a live ENOBUFS-shaped stale sweep physically DELETES the worktree AND its branch — mirror the #672 regression for the stale sweep in a future test pass (shipped code itself verified correct live).
finding: id=A2 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=existsSync-fail-false boundary (stat failure, NOT the porcelain probe #672 fixed): an EXISTING stale worktree behind a chmod-000 parent classifies 'missing' -> registration pruned + reported removed + its fully-MERGED branch ref deleted. NO content deletion possible on this path (dir+files survive; 'missing' never calls removeWorktree; removeBranchIfMerged refuses unmerged work) — distinct fault family, adjacent to the filed #669 probe-fail-open family.

# n3-adversary (CHANGE-GATE) — adversarial verification of the #672 fail-closed claim

## Claim Under Test
"For #672, both porcelain-probe fail-opens are now genuinely fail-CLOSED: (1) `synthesizeLevel`'s leg-dirty probe failure loudly refuses (`leg_dirty_probe_failed`) so no real leg content is ever silently dropped from the octopus merge; (2) `worktreeDirtyState` returns a distinct `'unprobeable'` state that BOTH destructive sweep consumers (`cmdStaleWorktreeCleanup`, `cmdLegacyWorktreeCleanup`) unconditionally KEEP — a probe failure can never cause a worktree removal, under any flag."

## Disproof Attempt — VERDICT: could not refute (NOT-REFUTED, confidence: high)

### R1 headline: the cmdStaleWorktreeCleanup 'unprobeable' keep HOLDS under LIVE test
The code-review had verified this consumer by code-reading only (R1). I drove the real
`stale-worktree-cleanup` CLI subcommand against a real repo with a registered, ARCHIVED
`workflow/issue-96723` worktree carrying uncommitted `real-work.txt` and a corrupted `.git`
link (path EXISTS, porcelain throws). Result across dry-run, `--execute`, `--execute --force`,
`--execute --archive`, `--execute --export`, `--execute --force --archive --export`, and
`--execute --keep-branch --force`: KEPT every time — recorded in `skipped_unprobeable`, never in
`removed`/`deleted_branch`; dir + content survive; worktree stays REGISTERED; branch survives.
Repeated with an ENOBUFS-shaped worktree (healthy git state, 70MB porcelain via a PATH git shim,
so `git worktree remove --force` WOULD have succeeded): also kept under `--execute --force`.

### (1) Site 1 — synthesizeLevel probe shapes (constructed + RUN, via the module export)
- Control: healthy legs -> `ok:true`, merge M contains BOTH ax.js and by.js.
- Shape a (broken gitdir link, non-zero git exit): `{ok:false, reason:'leg_dirty_probe_failed', leg:'A'}`, HEAD unchanged, ax.js preserved.
- Shape b (garbage `.git` content — a DIFFERENT git error family, "invalid gitfile format"): same refuse, HEAD unchanged.
- Shape c (>64MB porcelain, git exit 0, throws past the cap): refuse with `detail:"spawnSync git ENOBUFS"`, HEAD unchanged.
- Caller halts: adaptive-node.js:5920-5926 — the SOLE runtime call site — returns `{result:'refuse', reason:synth.reason, ...}` BEFORE `level_merged` telemetry, the group barrier, the ledger close, and the compliance row. No other clean-guessing path in synthesizeLevel (all catches enumerated: `leg_capture_failed` refuse, `merge_conflict` abort+refuse, `merge_head_unresolved` refuse, `appendNodeTiming` telemetry-only; the `!leg.legPath continue` at :4520 is a manifest-structure guard unreachable from a probe fault). The sibling root-status probe at claim.js:537 is already fail-closed (catch -> dirty); the remaining porcelain siblings (adaptive-node :5493/:5508 gate checks) are the already-filed #669 family, not these two sites.

### (2) Site 2 — destructive residual, LIVE, both consumers, both editions
- Legacy sweep: corrupted-link worktree AND ENOBUFS worktree under the real sibling `.kw` container, driven via `legacy-worktree-cleanup` across dry/execute/--force/--archive/--export/all-combined: both KEPT in `skipped_unprobeable` every time; `container_not_empty` reported (rmdir refuses non-empty — never recursive).
- Stale sweep: as in the R1 headline above (all flags).
- Boundary, both directions: genuinely-ABSENT path -> `'missing'` (pruned + reported removed — no keep-forever leak); existing-but-unprobeable (both corrupted-link and ENOBUFS shapes) -> `'unprobeable'` (kept). Verified via `stale-worktree-check` state output + cleanup behavior.
- existsSync edge (chmod-000 parent): see finding A2 — registry prune + merged-branch-ref deletion, but NO worktree/content removal is reachable ('missing' never calls removeWorktree); a stat failure is outside the porcelain-probe claim.

### (3) Masked-fix discrimination (scratch copies only; zero repo edits)
- Cap-only site-1 fix (== HEAD file: cap present, catch->''): replay of shape a -> `ok:true`, HEAD ADVANCED, merge silently DROPS ax.js — exactly the two S5-PROBE-FAILED-REFUSE assertions -> RED. Regression discriminates.
- State-added-but-LEGACY-consumer-untaught: live replay -> the ENOBUFS legacy worktree was PHYSICALLY DELETED (fall-through to `git worktree remove --force`), `skipped_unprobeable` empty -> the shipped #672 asserts (survive/removed/skipped_unprobeable) go RED. Regression discriminates.
- State-added-but-STALE-consumer-untaught: shipped suite stays GREEN (173) — the R1 coverage gap, finding A1 — while my live ENOBUFS stale replay shows the worktree AND branch deleted. Shipped code verified correct live; gap is test-coverage only.

### (4) Cross-edition
- `node scripts/edition-sync.js --check` -> "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical." (clean).
- Structural: helper `return 'unprobeable'` x1 + `state === 'unprobeable'` guard x2 (BOTH consumers) + `skipped_unprobeable` x6 in canonical, codex twin, gitlab (:2690/:3204) and gitea (:2685/:3196) claim ports; `leg_dirty_probe_failed` 1 hit in all four adaptive-node editions.
- LIVE against the gitlab AND gitea forge ports (correct `workflow/gitlab-issue-N` / `workflow/gitea-issue-N` conventions): stale sweep `--execute --force` keeps both shapes in `skipped_unprobeable`; the full legacy flag-matrix PASSED on both ports.

### (5) Suites (in-tree, this worktree)
- `node scripts/test-adaptive-node.js` -> adaptive-node tests passed (1789 assertions)
- `node scripts/test-claim-hardening.js` -> claim-hardening tests passed (173 assertions)
- `node scripts/simulate-workflow-walkthrough.js` -> Workflow walkthrough simulation passed

## Verdict
NOT-REFUTED (confidence: high) — every constructed disproof failed against the shipped code: no probe-failure shape reaches a silent-clean, a silent merge, or any worktree removal, under any flag, in any of the four editions; both regressions discriminate their masked-fix variants. The two residuals (A1 test-coverage gap, A2 stat-failure boundary) are out-of-scope, non-blocking, deferred.
