# Node `impl-gitignore-sim` evidence — issue #264

Role: `tdd-guide` (write set: `.gitignore`, `scripts/simulate-workflow-walkthrough.js`)

---

## Gitignore RED→GREEN cycle

### Before (RED) — `.kw/` absent

Command run:
```
node scripts/simulate-workflow-walkthrough.js
```

Relevant output (tail):
```
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
Error: .gitignore must contain a line exactly equal to ".kw/" (AC2 #264); got lines:
[".DS_Store","node_modules/",".claude/",".codex/","kaola-workflow/.locks/",
"kaola-workflow/.sessions/","kaola-workflow/.tickers/",".kw-env","kaola-workflow/issue-55/",""]
    at assert (scripts/simulate-workflow-walkthrough.js:23:25)
    at testGitignoreCoversKw (scripts/simulate-workflow-walkthrough.js:7327:3)
    at main (scripts/simulate-workflow-walkthrough.js:7883:5)
```

Exit code: 1 (RED confirmed — only `testGitignoreCoversKw` failed, no other test was affected)

### After (GREEN) — `.kw/` appended to `.gitignore`

Command run:
```
node scripts/simulate-workflow-walkthrough.js
```

Relevant output (tail):
```
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
testGitignoreCoversKw: PASSED
testWorktreeHiddenLocalPath: PASSED
testLegacyWorktreeCleanupDryRun: SKIPPED (impl-claim pending)
testLegacyWorktreeCleanupDirtySkip: SKIPPED (impl-claim pending)
testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)
testSinkRefusesWorkflowOnlyBranch: SKIPPED (impl-sink-guard pending)
testSinkAllowsMixedBranch: SKIPPED (impl-sink-guard pending)
testPlanRunWiredForWorktree: SKIPPED (impl-plan-run pending)
Workflow walkthrough simulation passed
```

Exit code: 0 (GREEN)

---

## Tests authored

All tests are in `scripts/simulate-workflow-walkthrough.js`, wired in the `// issue #264` block in `main()`.

### 1. `testGitignoreCoversKw` (STRICT — this node's own RED→GREEN)

- File: `scripts/simulate-workflow-walkthrough.js`
- Feature-detect: NONE (strict assert, no signal gate)
- Current state: PASSED
- Node that owns it: `impl-gitignore-sim` (this node)
- What it asserts: reads repo-root `.gitignore`; asserts a line exactly equal to `.kw/` exists (AC2)

### 2. `testStartupJsonAndHiddenLocalWorktrees` (INVERTED from `testStartupJsonAndSiblingWorktrees`)

- Feature-detect signal: `claimSignal()` = `typeof require(claimScript).legacySiblingWorktreePathFor === 'function'`
- Current state (signal absent): asserts OLD sibling path `<parent>/<repo>.kw/issue-501` and `issue-502`; keeps no-nesting assertion
- When signal present (impl-claim lands): asserts NEW hidden-local path `<root>/.kw/worktrees/issue-501` and `issue-502`; updates no-nesting substring to `issue-501/.kw`
- Node that flips to strict: **impl-claim** (node 8)
- Wired in `main()`: replaces the old `testStartupJsonAndSiblingWorktrees` call

### 3. `testWorktreeAdaptiveProvisioned` (INVERTED from `testWorktreeAdaptiveSuppressed`)

- Feature-detect signal: `claimSignal()` (same as above)
- Current state (signal absent): asserts `worktree_path === ''` (old suppression), no `worktree_error`
- When signal present: asserts `worktree_path === <root>/.kw/worktrees/issue-507`, `worktree_error === undefined`
- Node that flips to strict: **impl-claim** (node 8)
- Wired in `main()`: replaces the old `testWorktreeAdaptiveSuppressed` call

### 4. `testWorktreeHiddenLocalPath` (NEW)

- Feature-detect signal: `claimSignal()`
- Current state (signal absent): PASSED — asserts old sibling path `<parent>/<repo>.kw/issue-510`
- When signal present: asserts `<root>/.kw/worktrees/issue-510` + `fs.existsSync(expectedPath)` (proves provisioning ran)
- Node that flips to strict: **impl-claim** (node 8)

### 5. `testLegacyWorktreeCleanupDryRun` (NEW)

- Feature-detect signal: `claimSignal()` (gates the ENTIRE test body including setup — advisor guidance followed)
- Current state (signal absent): SKIPPED (early return, green)
- When signal present: registers a worktree at the legacy sibling path via `legacySiblingWorktreePathFor`; runs `legacy-worktree-cleanup` (no `--execute`); asserts `dry_run:true`, `would_remove` contains the legacy path, worktree dir still exists (AC3 dry-run-default)
- Node that flips to strict: **impl-claim** (node 8)

### 6. `testLegacyWorktreeCleanupDirtySkip` (NEW)

- Feature-detect signal: `claimSignal()` (gates the entire body)
- Current state (signal absent): SKIPPED (early return, green)
- When signal present: plants dirty legacy worktree; `--execute` without `--force` → `skipped_dirty`, dir survives (AC4); `--execute --force` → `removed`, dir gone
- Node that flips to strict: **impl-claim** (node 8)

### 7. `testAdaptiveWorktreeProvisionedE2E` (NEW — AC6+AC8 anchor)

- Feature-detect signal: behavior-detect — `sResult.worktree_path` non-empty after adaptive claim (impl-claim + impl-plan-run both needed)
- Current state: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)
- When signal present: adaptive claim → assert worktree exists; mirror plan+.cache into worktree; land impl file in worktree; worktree-finalize + finalize --keep-worktree; sink-merge; assert merged main contains `impl-test.txt` (AC8 core assertion)
- Note: the strict arm is currently unexercised (skip-gated). Reviewed against existing helpers (`runClaimOnline`, `runClaimOnlineLastJson`, `testE2EGitHubMergeFullChain` pattern).
- Node that flips to strict: **impl-claim** (provisioning) + **impl-plan-run** (worktree cwd wiring, both required)

### 8. `testSinkRefusesWorkflowOnlyBranch` (NEW)

- Feature-detect signal: `sinkSignal()` = `typeof require(sinkMergeScript).assertBranchHasNonWorkflowChanges === 'function'`
- Current state (signal absent): SKIPPED (early return, green)
- When signal present: calls `assertBranchHasNonWorkflowChanges(tmp, 'workflow/issue-911')` DIRECTLY on a workflow-only branch; asserts it throws with a message matching `kaola-workflow|workflow-only|no implementation` (AC7 refuse arm)
- Design: direct helper call avoids OFFLINE/ONLINE/push/gh machinery; no ambiguity about which guard fires
- Note: uses archived folder (not live folder) so the existing `assertNoLiveWorkflowFolder` guard does not interfere
- Node that flips to strict: **impl-sink-guard** (node 2)

### 9. `testSinkAllowsMixedBranch` (NEW)

- Feature-detect signal: `sinkSignal()` (gates the entire body)
- Current state (signal absent): SKIPPED (early return, green)
- When signal present: calls `assertBranchHasNonWorkflowChanges(tmp, 'workflow/issue-912')` DIRECTLY on a mixed branch (impl file + archived workflow); asserts it does NOT throw (AC7 allow arm — no false positive)
- Design: direct helper call is the correct way to verify the allow arm; OFFLINE subprocess would skip the guard entirely and prove nothing
- Node that flips to strict: **impl-sink-guard** (node 2)

### 10. `testPlanRunWiredForWorktree` (NEW — governance D3)

- Feature-detect signal: `planRunSignal()` = `commands/kaola-workflow-plan-run.md` contains `ACTIVE_WORKTREE_PATH`
- Current state (signal absent): SKIPPED (impl-plan-run pending)
- When signal present: strict-asserts plan-run.md ALSO contains a `Working directory:` line (proves impl-plan-run wired contractor dispatches into the worktree)
- Node that flips to strict: **impl-plan-run** (node 3)

---

## Cross-cutting summary for reviewers

IMPORTANT: the feature-detect tests being in their "old branch" or "SKIPPED" state is NOT a test failure for this node. It is by design per governance D1 (fail-fast harness; hard-RED walls off all later tests). Each test strict-verifies its capability the moment the owning node lands its signal.

| Test | Current state | Flips to strict when... |
|---|---|---|
| `testGitignoreCoversKw` | PASSED (strict now) | this node |
| `testStartupJsonAndHiddenLocalWorktrees` | PASSED (old branch) | impl-claim |
| `testWorktreeAdaptiveProvisioned` | PASSED (old branch) | impl-claim |
| `testWorktreeHiddenLocalPath` | PASSED (old branch) | impl-claim |
| `testLegacyWorktreeCleanupDryRun` | SKIPPED | impl-claim |
| `testLegacyWorktreeCleanupDirtySkip` | SKIPPED | impl-claim |
| `testAdaptiveWorktreeProvisionedE2E` | SKIPPED | impl-claim + impl-plan-run |
| `testSinkRefusesWorkflowOnlyBranch` | SKIPPED (sinkSignal absent) | impl-sink-guard |
| `testSinkAllowsMixedBranch` | SKIPPED (sinkSignal absent) | impl-sink-guard |
| `testPlanRunWiredForWorktree` | SKIPPED | impl-plan-run |

Full walkthrough exit code after this node: **0** ("Workflow walkthrough simulation passed")

---

## This node's completion criteria — all satisfied

- [x] `.gitignore` contains `.kw/` (AC2)
- [x] `node scripts/simulate-workflow-walkthrough.js` prints "Workflow walkthrough simulation passed" and exits 0
- [x] All 10 tests authored with correct feature-detect signals (per governance D1)
- [x] `testGitignoreCoversKw` showed genuine RED before the `.gitignore` edit, GREEN after
- [x] Cross-cutting "pending node" tests are green-now (skip/old-branch), strict-assert when their node lands
- [x] No files outside the two-file write-set were modified
