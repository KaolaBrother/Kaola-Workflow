evidence-binding: n3-review fef1d7aa6ed8
verdict: pass
findings_blocking: 0
upstream_read: n1-plan-validator d1ca893a604b
upstream_read: n2-sweep d6a23e2c521b
finding: id=R1 scope=pre_existing action=follow_up status=open severity=low fix_role=none rationale=uncapped unbounded-in-dirty-size status-porcelain family (plan-validator:3253 -uall dirty-fence probe fails OPEN to empty on ENOBUFS; sink-merge:984 -uall; adaptive-node:4455; claim:483/532/1634) — explicitly outside the task's confirmed-site list per n1 evidence; candidate for a #668-style hygiene follow-up

## Review — n3-review (G1 post-dominance gate over n1-plan-validator + n2-sweep, issue-666)

Reviewed the accumulated diff `33fa1825..HEAD` (HEAD = octopus merge `3cd0220f`; legs `c966923b` n1, `a2db8089` n2). Diff scope: 23 files — 5 canonical scripts × 4 editions (20), `scripts/test-adaptive-node.js`, and the 2 evidence files. No files outside the declared write set.

### (a) Site coverage and no-needless-caps — PASS
- plan-validator.js: exactly 10 capped sites (2488 ls-tree -r crash site; 2507/2508 diff --name-only + ls-files --others; 3047/3194/3218/3342/3605 diff-tree -r --name-only; 3056 whole-plan diff --name-only; 3550 release-surface diff base...HEAD). Every uncapped remainder is a fixed-size probe (rev-parse, merge-base, is-ancestor, update-ref, read-tree, add -A stdio-ignored, write-tree/commit-tree). No fixed-size probe needlessly capped.
- adaptive-node.js: 1 capped site (5422 leg-scoped diff --name-only).
- claim.js: 2 capped sites (357/361 ls-files -z --others + diff HEAD in exportWorktreeDiff); remote show timeout-bounded, diff --cached --name-only single-pathspec at 1844 correctly uncapped.
- sink-merge.js: 1 capped site (263 diff --name-only base...branch); log -n 5 and --quiet uncapped.
- run-chains.js: 1 capped site (369 spawnSync git diff HEAD in getWorkTreeHash).

### (b) Four-edition propagation — PASS
- edition-sync.js --check → exit 0: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity.
- validate-script-sync.js → exit 0: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 7 forge export-superset families in sync.
- GIT_MAX_BUFFER counts identical across all 4 editions: plan-validator 11×4 (1 const + 10 sites), adaptive-node 2×4.
- All 6 hand-patched forge ports spot-grepped: gitlab/gitea claim (const 45; ls-files + diff HEAD capped), gitlab/gitea sink-merge (const 28; diff --name-only capped), gitlab/gitea run-chains (const 121; spawnSync diff HEAD 369 capped).
- n2's classification correction VERIFIED TRUE: run-chains is absent from GENERATED_AGGREGATORS (edition-sync.js:46); its gitlab/gitea ports live in RENAME_NORMALIZED_FAMILIES (validate-script-sync.js:269-276, check-only) — manual hand-patch was the correct mechanism, parity machine-checked.

### (c) Regression test genuinely exercises the bug — PASS
- Test #666-ENOBUFS-TREE-HASH (test-adaptive-node.js after line 6101) builds a 4200-file/196-char-name tree, calls computeCodeTreeHash → snapshotWorktree → git ls-tree -r, asserts /^[0-9a-f]{64}$/ plus determinism repeat.
- Independent RED corroboration: reproduced fixture in scratchpad — default-buffer ls-tree -r threw ENOBUFS; maxBuffer 64MB returned a 1,096,200-byte (~1.05MB) listing. Unpatched computeCodeTreeHash try/catch at 2488 swallows → returns null → fails the 64-hex assertion (matches n1's captured RED).
- node scripts/test-adaptive-node.js in merged tree → exit 0, "adaptive-node tests passed (1730 assertions)".

### (d) Constant locality / schema anchor untouched — PASS
- GIT_MAX_BUFFER = 64*1024*1024 declared per-script near top of each of the 5 canonical scripts, each with a locality-justifying comment.
- git diff 33fa1825..HEAD -- scripts/kaola-workflow-adaptive-schema.js empty; zero adaptive-schema files in the diff — 4-edition byte-anchor untouched, legs stayed decoupled.

### Whole-tree checks
- node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed".

### Non-blocking observations
1. (R1) Uncapped status --porcelain family is the same ENOBUFS pattern one tier down; plan-validator:3253 (-uall dirty-fence, catch → porcelain='' = fence sees zero dirty paths, fail-open on overflow). Deliberately out of scope per the task's confirmed-site list; hygiene follow-up candidate.
2. n1's noted run-to-run truncation flake reproduced on pristine main per their evidence — pre-existing environment noise, not introduced here.

### Finalization note
Cross-edition diff (touches plugins/kaola-workflow-{gitlab,gitea}/): Finalization MUST record all four chains green, run sequentially. Not run at this gate (parity + walkthrough verified here per gate scope).

Verdict: APPROVE — surgical, correctly scoped (no needless caps, no missed flagged sites), propagated to all four editions with machine-verified parity, pinned by a regression whose RED mechanism was independently reproduced.
