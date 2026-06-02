# Phase 3 - Plan: issue-216

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add `testSinkMergeSkipsArchivedProjectPhantom` + register in run list | Write-failing-test-first; must FAIL on phantom-folder assertions against current code |
| `scripts/kaola-workflow-sink-merge.js` | Layer 1 early-exit in `main()` (post-checkout + branch restore) + Layer 2 guard in `postMergeCleanup` before `fs.mkdirSync` | Eliminate phantom active folder |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Identical diff to root, verbatim | Preserve byte-identical parity (Codex) |

### Build Sequence
1. Write failing regression test; confirm RED on **phantom-folder/receipt assertions** specifically.
2. Verify test git state: `git cat-file -e workflow/issue-850:kaola-workflow/archive/issue-850` must pass.
3. Add Layer 1 + Layer 2 guards to root `scripts/kaola-workflow-sink-merge.js`.
4. Apply identical diff to Codex `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`.
5. Run suite; confirm GREEN; no regressions; `diff` + `shasum` byte-parity confirmed.

### Parallelization Plan
| Group | Tasks | Notes |
|-------|-------|-------|
| A | Task 1 (test) | Must complete RED before any source edit |
| B-serial | Task 2 then Task 3 | Serial: Codex copies exact root diff; not parallel |

### External Dependencies
None — `fs`, `path`, `execFileSync` already imported.

---

## Task List

### Task 1: Write failing regression test (RED gate)
- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** none
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:**
  - New function `testSinkMergeSkipsArchivedProjectPhantom()` adjacent to `testSinkMergeMockabilityAndReceipt` (~line 3487).
  - Register after `testSinkMergeCloseFailureWarning()` in run list (~line 4280).
  - Setup: `initGitRepoWithBareRemote(tmp)` + `writeGhShimForStartup(binDir)`. Use finalize's real archive mechanism — startup inside a linked worktree then `finalize --keep-worktree` which commits `git add -A kaola-workflow/` on the feature branch (via `claim.js:655–661`). If in-harness worktree orchestration is brittle, fall back to direct git commands: create feature branch, `git mv kaola-workflow/issue-850 kaola-workflow/archive/issue-850`, commit — this is the faithful minimum.
  - **Hard gate — assert git state before invoking sink-merge:** `git cat-file -e workflow/issue-850:kaola-workflow/archive/issue-850` must succeed (archive committed on feature branch); `git cat-file -e workflow/issue-850:kaola-workflow/issue-850/workflow-state.md` must fail (live path gone on feature branch). If either fails, the test setup is wrong — fix setup, do not proceed.
  - Invoke sink-merge with `KAOLA_WORKFLOW_OFFLINE: '0'` + `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected'`.
  - **Assertions (RED/GREEN discriminators — NOT exit code):**
    - `!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850'))` — no phantom live folder
    - `!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850', '.cache', 'sink-fallback.json'))` — no receipt written
    - `fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-850'))` — archive intact
    - `execSync('git -C ' + tmp + ' rev-parse --abbrev-ref HEAD').trim() === 'main'` — repo restored to main
    - stderr includes "project archived"
  - Note: `result.status === 3` holds in BOTH buggy and fixed worlds — it is not a discriminator. The phantom-folder assertion is the discriminator.
  - `finally`: clean up `tmp` and `remotePath`.
- **Mirror:** `testSinkMergeMockabilityAndReceipt` (lines 3487–3574); worktree lifecycle from `testFinalizeReleaseCleansWorktree` (lines 1180–1205); skip assertion style from `testSinkFallbackSkipsArchivedProject` (lines 1138–1144).
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` → expect FAILURE specifically on phantom-folder assertion.

### Task 2: Root source guard (single pre-reset guard in `postMergeCleanup`)

> ⚠️ **Plan updated post-Task-2 execution.** The originally planned two-layer fix was revised based on empirical testing. See deviation notes in `phase4-progress.md`.

- **File:** `scripts/kaola-workflow-sink-merge.js`
- **Write Set:** `scripts/kaola-workflow-sink-merge.js`
- **Depends On:** Task 1 RED confirmed
- **Parallel Group:** B-serial (first)
- **Action:** MODIFY
- **Implement (actual shipped design):**
  - **Single guard** in `postMergeCleanup()` classified-error catch, BEFORE `git reset --hard origin/main`:
    - Compute `liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project)` and `archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project)`.
    - Condition: `!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)`.
    - Action: stderr `sink-merge: project archived (<project>), skipping receipt write\n`; `try { execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], ...) } catch (_) {}`; `return { exitCode: 3 };`.
    - Skips the reset, the receipt `fs.mkdirSync`, and `fs.writeFileSync` — preventing the phantom resurrection.
  - **Why Layer 1 (post-checkout in `main()`) was not added:** After `git checkout feature-branch`, the archive is already on disk for EVERY normal finalize→sink-merge flow (archive exists, live is gone). Layer 1 at that position fires unconditionally, breaking the normal success path (`testE2EGitHubMergeFullChain`). The catch block is structurally isolated to push-failure paths.
  - **Why pre-reset position IS operative:** `ffMergeLoop` FF-merges the feature branch to local main. At the catch, local main has the archive (committed or untracked). Forge's post-reset Layer 2 (GitLab lines 241–246) is NOT operative — the reset wipes the tracked archive before that guard runs. Root's pre-reset guard fires before the wipe, where the archive is still present.
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` → full suite GREEN, `Workflow walkthrough simulation passed` (exit 0).

### Task 3: Codex byte-identical copy
- **File:** `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- **Write Set:** `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- **Depends On:** Task 2 complete
- **Parallel Group:** B-serial (second)
- **Action:** MODIFY
- **Implement:** Apply the identical diff from Task 2, verbatim. No independent edits.
- **Validate:**
  - `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → no output
  - `shasum scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → matching hashes
  - `node scripts/simulate-workflow-walkthrough.js` → exit 0

---

## Hard Phase 4 Gates (not footnotes)

1. **Phantom-folder discriminator:** Confirm RED specifically on `!fs.existsSync(liveDir)` or `!fs.existsSync(receiptPath)` assertions — NOT on `result.status`. Exit code 3 is invariant across buggy and fixed worlds.
2. **Git state assertion before invoking sink-merge:** `git cat-file -e workflow/issue-850:kaola-workflow/archive/issue-850` must succeed. If it fails, the archive was never committed on the feature branch — fix the test setup before proceeding.
3. **Branch restore assertion:** After sink-merge exits 3 (Layer 1 path), `git rev-parse --abbrev-ref HEAD` must be `main`. Layer 1 must call `git checkout main` before returning to be consistent with the normal exit-3 path.

---

## Advisor Notes

Four gaps identified and folded into this plan:
1. Exit-3 is not the RED/GREEN discriminator — filesystem state is. Layer 1 must include `git checkout main` before returning to preserve branch consistency. Use phantom-folder/receipt assertions as the discriminator.
2. Test must verify the archive is committed on the feature branch (git cat-file gate) before invoking sink-merge — otherwise the tracked-archive reproduction is not exercised.
3. Layer 1 fires post-checkout, leaving the repo on the feature branch; add `git checkout main` before `process.exitCode = 3; return` to match the normal exit-3 path.
4. Confirmed exactly 4 sink-merge copies; only root and Codex need changes (GitLab/Gitea already carry both guards). Tasks 2 and 3 are serial.

---

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | no gaps requiring re-architecting | advisor gaps folded directly into plan as hard gates |
