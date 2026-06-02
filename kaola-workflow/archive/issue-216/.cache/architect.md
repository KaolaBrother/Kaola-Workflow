# Code Architect — issue-216: sink-merge archive-safety guard

## Resolved open question

The tracked-vs-untracked placement question is resolved. `cmdFinalize --keep-worktree` (`kaola-workflow-claim.js` lines 654–662) runs `git add -A kaola-workflow/` + `git commit` on the feature branch to commit the archive. The archive is git-tracked on the feature branch. `git reset --hard origin/main` wipes it. The **post-checkout placement** is required.

Comment at line 647 even says: "commit the archive so the feature branch HEAD no longer has the live folder (required by sink-merge guard)."

## Files to Create

None.

## Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add `testSinkMergeSkipsArchivedProjectPhantom` test + register in run list | Write-test-first RED gate; must FAIL against current code |
| `scripts/kaola-workflow-sink-merge.js` | Add Layer 1 early-exit in `main()` post-checkout + Layer 2 guard in `postMergeCleanup` before `fs.mkdirSync` | Eliminate phantom active folder |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Identical diff, verbatim | Preserve byte-identical parity with root |

## Build Sequence

1. (MANDATORY) Write failing regression test; confirm RED.
2. Add Layer 1 + Layer 2 guards to root `scripts/kaola-workflow-sink-merge.js`.
3. Apply identical diff to Codex `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`.
4. Run suite; confirm GREEN + no regressions.
5. Verify byte-identity: `diff` + `shasum` comparison.

## Task List

### Task 1 — Write failing regression test (RED)

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write set:** `scripts/simulate-workflow-walkthrough.js` (exclusive)
- **Depends on:** none
- **Parallel group:** A (must complete before Tasks 2/3)
- **Action:** MODIFY
- **What to implement:**
  - New function `testSinkMergeSkipsArchivedProjectPhantom()` placed adjacent to `testSinkMergeMockabilityAndReceipt` (~line 3487).
  - Register in run list after `testSinkMergeCloseFailureWarning();` (~line 4280).
  - Setup:
    1. `const tmp = fs.realpathSync(fs.mkdtempSync(...))`; `const remotePath = initGitRepoWithBareRemote(tmp);`
    2. Set up `binDir` + `writeGhShimForStartup(binDir)`.
    3. Use real finalize mechanism: `runClaimOnline(['startup', '--target-issue', '850'], tmp, binDir)` → creates worktree + feature branch. Then in worktree: `runClaimOnline(['finalize', '--project', 'issue-850', '--keep-worktree'], wtPath, binDir)`. This archives via `fs.renameSync` AND commits `git add -A kaola-workflow/` on the feature branch.
    4. Push the feature branch upstream; return to main.
    5. `spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-850', '--branch', 'workflow/issue-850', '--issue', '850'], { cwd: tmp, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_GH_MOCK_SCRIPT: mockJs } })`
  - Assertions:
    - `result.status === 3`
    - `!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850'))` — no phantom live folder
    - `!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850', '.cache', 'sink-fallback.json'))` — no receipt written
    - `fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-850'))` — archive intact
    - stderr includes "project archived"
  - `finally`: clean up both `tmp` and `remotePath`.
  - **Confirm RED** before any source edit.
- **Mirror:** `testSinkMergeMockabilityAndReceipt` (lines 3487–3574); `testFinalizeReleaseCleansWorktree` (lines 1180–1205); `testSinkFallbackSkipsArchivedProject` (lines 1138–1144).
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` — expect FAILURE on new test only.

### Task 2 — Root source guards (Layer 1 + Layer 2)

- **File:** `scripts/kaola-workflow-sink-merge.js`
- **Write set:** `scripts/kaola-workflow-sink-merge.js` (exclusive)
- **Depends on:** Task 1 (test RED)
- **Parallel group:** B
- **Action:** MODIFY
- **What to implement:**
  - **Layer 1:** In `main()`, add guard AFTER `assertNoLiveWorkflowFolder(mainRoot, args.project)` and BEFORE `assertBranchPushedToUpstream`. Compute `liveDir` and `archiveDir`; if `!fs.existsSync(liveDir) && fs.existsSync(archiveDir)` → stderr `sink-merge: project archived (<project>), skipping merge` → `process.exitCode = 3; return;`
  - **Layer 2:** In `postMergeCleanup`, inside the classified-error `catch`, AFTER `git reset --hard origin/main`, BEFORE `fs.mkdirSync(path.dirname(receiptPath), ...)` → same condition → stderr `sink-merge: project archived (<project>), skipping receipt write` → `return { exitCode: 3 };`
- **Logical ordering constraints:**
  - Layer 1: after `assertNoLiveWorkflowFolder`, before `assertBranchPushedToUpstream`
  - Layer 2: after the `git reset --hard origin/main` try/catch, before `fs.mkdirSync`
- **Mirror:** Layer 1 message from GitLab lines 320–328; Layer 2 message from GitLab lines 241–246. Exact stderr strings: `skipping merge` (Layer 1), `skipping receipt write` (Layer 2).
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` — expect GREEN; full suite `Workflow walkthrough simulation passed` (exit 0).

### Task 3 — Codex byte-identical copy

- **File:** `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- **Write set:** `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (exclusive)
- **Depends on:** Task 2
- **Parallel group:** B
- **Action:** MODIFY
- **What to implement:** Identical diff from Task 2.
- **Validate:**
  - `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → no output
  - `shasum scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → same hash
  - `node scripts/simulate-workflow-walkthrough.js` → exit 0

## Guard Placement Logical Constraints

- **Layer 1 (main()):** AFTER `git checkout args.branch` AND `assertNoLiveWorkflowFolder(mainRoot, args.project)`; BEFORE `assertBranchPushedToUpstream` / merge-base check / `doRebase` / `ffMergeLoop`. Rationale: archive only on disk after feature branch checkout.
- **Layer 2 (postMergeCleanup):** AFTER `git reset --hard origin/main` try/catch; BEFORE `fs.mkdirSync(path.dirname(receiptPath), { recursive: true })`.

## Byte-sync discipline

Root `scripts/kaola-workflow-sink-merge.js` and Codex `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` are currently byte-identical. Task 3 must apply the identical diff verbatim. Confirm with `diff` (no output) and `shasum` (equal hashes).

## Explicit Out-of-Scope

- `finalValidationPassed` gate (separate issue)
- Pre-git/pre-checkout early-exit without a test
- `runDirectMerge` wrapper extraction
- `cmdSinkFallback` changes
- GitLab/Gitea edition changes
