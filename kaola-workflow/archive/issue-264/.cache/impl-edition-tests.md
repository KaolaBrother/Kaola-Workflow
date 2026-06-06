# Node `impl-edition-tests` evidence — issue #264

Role: `tdd-guide` (write-set: gitlab + gitea `test-*-workflow-scripts.js`)

## Deliverable

Added a feature-detecting test PAIR to each forge test file:

- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

Each file gained two named functions registered synchronously between
`testGit{lab,ea}PatchBranchGuards()` and the async `testGit{Lab,ea}RoadmapInitIssueExclusiveAndUpdate` tail.

---

## Test #10 (GitLab) / #11 (Gitea) — Test pair per forge

### Test A: `worktreePathFor` hidden-local-path assertion

Function names:
- `testGitlabWorktreePathForHiddenLocal`
- `testGiteaWorktreePathForHiddenLocal`

**Signal detected on:** `typeof claim.legacySiblingWorktreePathFor === 'function'`

**Old-behavior branch (currently active — signal ABSENT):**
Asserts that `claim.worktreePathFor(root, project)` returns the OLD sibling path:
- ends with `path.sep + project`
- contains `.kw` + `path.sep` + project
- does NOT contain `path.join('.kw', 'worktrees')`

This is a structural assertion (not exact path equality) to avoid macOS symlink
fragility (`/var/folders` vs `/private/var`).

**New-behavior branch (activates when impl-claim lands — RED-pending):**
Asserts the path contains `path.join('.kw', 'worktrees', project)`, confirming
the repo-local hidden path per AC1.

**Currently prints:** `testGitlab/GiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=false)`

---

### Test B: `legacy-worktree-cleanup` dry-run assertion

Function names:
- `testGitlabLegacyWorktreeCleanupDryRun`
- `testGiteaLegacyWorktreeCleanupDryRun`

**Signal detected on:** invokes `legacy-worktree-cleanup` (offline); recognized iff
exit 0 AND stdout parses to JSON with a `dry_run` field present.

**SKIP branch (currently active — subcommand NOT recognized):**
Prints a SKIPPED line and returns immediately. No fixture is built. The forge
walkthrough stays green.

**Recognized branch (activates when impl-claim lands — RED-pending, authored but unrun):**
- Builds a legacy-path worktree under `<parent>/<repo>.kw/issue-264-legacy`
- Runs `legacy-worktree-cleanup` without `--execute`
- Asserts `dry_run === true`
- Asserts `would_remove` array contains a path with `issue-264-legacy`
- Asserts the worktree still exists after dry-run (nothing removed)
- Cleanup: `git worktree remove --force` + rmSync of the legacy container

The recognized-branch assertions use `JSON.stringify(p).includes('issue-264-legacy')` on each
`would_remove` element so the check is shape-agnostic (survives string OR object elements).
The recognized branch is authored-but-unrun; impl-claim must confirm `would_remove`'s element shape
matches and apply the D5 absorb fixup if any assertion fires unexpectedly after impl-claim lands.

**Currently prints:** `testGitlab/GiteaLegacyWorktreeCleanupDryRun: SKIPPED (...)`

---

## RED baseline → GREEN after this node

Before adding the tests, each forge walkthrough had N tests printing PASSED/SKIPPED.
After, N+2 per forge (two new functions registered and running their old-behavior/SKIP branch).

Both signal checks are currently ABSENT:
1. `legacySiblingWorktreePathFor` not exported by either forge claim (confirmed by
   `grep module.exports` — only `worktreePathFor` appears, no `legacySiblingWorktreePathFor`).
2. `legacy-worktree-cleanup` not dispatched by either forge claim (confirmed by grep — no hits).

These tests become strict-asserting RED→GREEN in **node 8 (`impl-claim`)** when:
- `legacySiblingWorktreePathFor` is added and exported to both forge claims
- `cmdLegacyWorktreeCleanup` + `legacy-worktree-cleanup` dispatch is added to both forge claims
- `worktreePathFor` body is updated to the new repo-local path

This is the same RED-pending forward dependency that node 1 (`impl-gitignore-sim`) uses
for `testWorktreeAdaptiveProvisioned`, `testStartupJsonAndHiddenLocalWorktrees`, etc.

---

## Forge walkthrough tails (GREEN now)

### GitLab walkthrough tail (node scripts/simulate-gitlab-workflow-walkthrough.js)
```
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGitlabAdaptive: PASSED
testGitlab237DotPathExtraction: PASSED
GitLab workflow walkthrough simulation passed
```

### Gitea walkthrough tail (node scripts/simulate-gitea-workflow-walkthrough.js)
```
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGiteaAdaptive: PASSED
testGitea237DotPathExtraction: PASSED
Gitea workflow walkthrough simulation passed
```

### Main suite tail (node scripts/simulate-workflow-walkthrough.js)
```
testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed
```

### Test file direct run (confirms new tests ran and printed their lines)

GitLab (`node test-gitlab-workflow-scripts.js`) last lines:
```
testGitlabWorktreePathForHiddenLocal: PASSED (hasNewApi=false)
testGitlabLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)
GitLab workflow script tests passed
```

Gitea (`node test-gitea-workflow-scripts.js`) last lines:
```
testGiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=false)
testGiteaLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)
Gitea workflow script tests passed
```

---

## Note on `run()` and walkthrough output capture

The forge walkthroughs invoke `run('test-*-workflow-scripts.js')` via `execFileSync`
with `stdio: 'pipe'`, so test-file output is captured (not echoed). The walkthrough
checks exit code only. To verify the new tests RAN, run the test file directly
(shown above) or confirm exit 0 of the walkthrough.

---

## Forward dependency note

These tests go STRICT (real RED→GREEN) when `impl-claim` (node 8) ports:
1. `worktreePathFor` new body (repo-local `.kw/worktrees/<project>`) into both forge claims
2. `legacySiblingWorktreePathFor` export added to both forge claims
3. `cmdLegacyWorktreeCleanup` + `legacy-worktree-cleanup` dispatch added to both forge claims

After impl-claim, both forge walkthroughs + `npm test` must be green per §3 safety note.
