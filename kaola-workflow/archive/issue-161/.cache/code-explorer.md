# Code Explorer — Closure System Research (Issue #161)

## Entry Points

- `finalize` subcommand: triggered by agent at end of Phase 6 before sink-merge, or from the Phase 6 skill directly
- `release`/`discard` subcommand: triggered when abandoning active work
- `sink-merge` (Phase 6 merge path): runs rebase, FF-merge, push, then calls `gh issue close` and label removal inline
- `sink-pr` (Phase 6 PR path): pushes branch and creates PR; closure is deferred to `watch-pr`/`watch-mr`
- `watch-pr` (GitHub) / `watch-mr` (GitLab) / `watch-pr` (Gitea): periodic scan that detects merged/closed PRs and archives

---

## Execution Flow

### Path A — Direct merge (`sink: merge`)

1. `sink-merge.js main()` — remove worktree (step 0), fetch (step 1), clean-worktree assert, checkout branch, assert no live workflow-state.md, assert branch pushed to upstream
2. Rebase onto `origin/main` (step 3), run `npm test` (step 4)
3. FF-merge loop with retries (steps 5–6)
4. `postMergeCleanup()` — push (step 7): if push fails with classifiable error, write `.cache/sink-fallback.json` receipt and exit 3; else close issue via `gh issue close` (step 8, best-effort), remove label (step 8, best-effort), delete local and remote branch (step 9, both best-effort)
5. `cmdFinalize` is expected to have been called (and the archive committed) before sink-merge runs, enforced by `assertNoLiveWorkflowFolder` guard

### Path B — PR (`sink: pr`)

1. `sink-pr.js main()` — push branch, create PR via `gh pr create`, record `pr_url`/`pr_number` in `workflow-state.md` Sink block and `phase6-summary.md`, write metadata commit
2. `watch-pr` (called separately, periodically): for each active folder with `sink: pr` and a `pr_url`, calls `gh pr view` to get PR state; if MERGED → `archiveProjectDir('closed')` + `removeWorktree` + `clearAdvisoryClaim`; if CLOSED → `archiveProjectDir('abandoned')` + `removeWorktree` + `clearAdvisoryClaim`

### `cmdFinalize` (both paths, but called explicitly before merge sink)

`scripts/kaola-workflow-claim.js` lines 539–564:
1. `archiveProjectDir(root, project, 'closed')` — moves folder to `archive/`, updates `workflow-state.md` status/step, strips legacy state blocks (GitHub only), deletes `.roadmap/issue-N.md`, calls `roadmapModule.regenerateRoadmap(root)` (all three wrapped in a single `try/catch` that is non-fatal)
2. If `--keep-worktree`: skip `removeWorktree`, instead commit archive to feature branch (for sink-merge guard)
3. If no `--keep-worktree`: `try { removeWorktree(...) } catch (_) {}` — silently swallowed
4. `clearAdvisoryClaim(folder.issue_number, 'finalized')` — silently swallowed

---

## Key Functions with File:Line References

| Function | File | Lines | Role |
|---|---|---|---|
| `archiveProjectDir(root, project, statusValue, suffix)` | `scripts/kaola-workflow-claim.js` | 496–537 | Moves live folder to archive, stamps status/step, deletes roadmap source file, regenerates ROADMAP.md |
| `clearAdvisoryClaim(issueNumber, reason)` | `scripts/kaola-workflow-claim.js` | 346–352 | Removes `workflow:in-progress` label via `gh issue edit`, adds comment; both calls entirely swallowed |
| `cmdFinalize()` | `scripts/kaola-workflow-claim.js` | 539–564 | Full finalize: archive → optional worktree commit → clearAdvisory |
| `cmdRelease()` / discard | `scripts/kaola-workflow-claim.js` | 572–582 | Same shape as finalize; archives with `statusValue='abandoned'` and timestamped suffix |
| `cmdWatchPr()` | `scripts/kaola-workflow-claim.js` | 833–858 | Polls PR state, calls archive+removeWorktree+clearAdvisory on MERGED or CLOSED |
| `postMergeCleanup(args, mainRoot)` | `scripts/kaola-workflow-sink-merge.js` | 191–239 | Steps 7–9 of merge sink: push, close issue, delete branch |
| `classifyMergeError(stderr)` | `scripts/kaola-workflow-sink-merge.js` | 40–50 | Classifies push error into `permission_denied`, `branch_protected`, `non_fast_forward`, or `null` |
| `watchMergeRequests(root, args)` | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 801–822 | GitLab equivalent of cmdWatchPr, watches MRs |
| `watchMergeRequests(root, args)` | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 786–807 | Gitea equivalent |
| `cmdSinkFallback()` | `scripts/kaola-workflow-claim.js` | 817–831 | Updates `sink: pr` in state when merge exit-3 triggers fallback |
| `removeLegacyStateBlocks(content)` | `scripts/kaola-workflow-claim.js` | 330–344 | Strips retired `## Lease` block and legacy fields before archiving |
| `regenerateRoadmap(root)` | `scripts/kaola-workflow-roadmap.js` | (exported) | Silent roadmap regeneration from `.roadmap/issue-*.md`; called from `archiveProjectDir` |

**Plugin mirrors** — GitLab and Gitea have near-identical `archiveProjectDir`, `clearAdvisoryClaim`, `cmdFinalize`, `cmdRelease`, and `watchMergeRequests` in:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

---

## Multi-Forge Organization

Three fully separate code trees:

| Edition | Primary claim script | Sink-merge | Sink-pr |
|---|---|---|---|
| GitHub | `scripts/kaola-workflow-claim.js` | `scripts/kaola-workflow-sink-merge.js` | `scripts/kaola-workflow-sink-pr.js` |
| GitLab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` |
| Gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` |

---

## Error Handling Patterns: Best-Effort vs Hard-Fail

**Hard-fail (throws, exits non-zero):**
- `assertNoLiveWorkflowFolder` in sink-merge — throws if live `workflow-state.md` on branch HEAD (lines 71–90)
- `assertBranchPushedToUpstream` — throws if branch has no upstream or has unpushed commits (lines 92–115)
- `assertCleanWorktree` — throws if worktree has staged/unstaged changes
- `fs.renameSync(src, dest)` in `archiveProjectDir` — hard-fails if rename fails (folder move itself is not swallowed)
- `main()` outer `try/catch` — writes `err.message` to stderr and sets `exitCode = 1`

**Silent best-effort (all swallowed with `catch (_) {}`):**
- `clearAdvisoryClaim` — label removal (line 348) and comment post (line 350): two separate catches, both silent
- `removeWorktree` in `cmdFinalize` line 546, `cmdRelease` line 579, `cmdWatchPr` lines 849/853
- Roadmap cleanup in `archiveProjectDir` lines 526–534: outer `try` catches everything — "roadmap mirror cleanup is non-fatal; archive already completed"
- `gh issue close` in `postMergeCleanup` line 229
- Label removal in `postMergeCleanup` line 231
- Local and remote branch delete in `postMergeCleanup` lines 234, 236

The pattern: **archive folder move is the only guaranteed-atomic step.** Every remote call and worktree removal can silently fail without leaving any evidence.

---

## Existing Partial Receipt / Audit Structure

**`sink-fallback.json`** — the only closure receipt that currently exists:
- Written at: `kaola-workflow/{project}/.cache/sink-fallback.json`
- Written only on the exit-3 (merge-impossible) path in `postMergeCleanup`
- Schema:
  ```json
  {
    "project": "issue-N",
    "branch": "workflow/issue-N",
    "issue_number": 42,
    "reason": "permission_denied|branch_protected|non_fast_forward",
    "timestamp": "2026-05-25T..."
  }
  ```
- All three forge editions have this receipt in their respective sink-merge scripts
- Natural template for a generalized closure receipt

**`archiveProjectDir` return value** — partial structured outcome:
- Returns `{archived: true, dest}` on success or `{skipped: 'source-missing'}` on skip
- No fields for: label removal, roadmap cleanup, worktree removal, branch deletion

**`cmdFinalize` stdout** — emits `{status: 'closed', archived: true, dest: '...'}`:
- No `label_removed`, `roadmap_cleaned`, `worktree_removed`, or `branch_deleted` fields

**Drift detection seeds:**
- `cmdStatus` (lines 584–597): partitions active folders into `{active, drift}` where `drift` = folders whose issue is already closed on remote — kernel of the audit path
- `kaola-workflow-roadmap.js validate-remote`: iterates `.roadmap/issue-*.md` with `status: open` and checks remote state — detects closed-remote drift at roadmap level

---

## Test Coverage

**Primary test file:** `scripts/simulate-workflow-walkthrough.js`

| Test function | What it covers |
|---|---|
| `testFinalize(tmp)` | Basic finalize: archive, status=closed, step=complete, legacy block removal |
| `testWatchPrArchivesClosedIssuePrFolder()` | watch-pr: MERGED → archive; folder removed |
| `testFinalizeReleaseCleansWorktree()` | finalize/release removes registered worktree |
| `testFinalizeFromLinkedWorktreeCleansMainCopy()` | finalize from linked worktree deletes main root copy |
| `testFinalizeFromMainRootNoSpuriousRemoval()` | finalize from main root doesn't accidentally erase archive |
| `testFinalizeCleansRoadmapEntry()` | finalize removes `.roadmap/issue-N.md` and regenerates ROADMAP.md |
| `testFinalizeFromLinkedWorktreeCleansRoadmapEntry()` | same, but from linked worktree; deletion staged in archive commit |
| `testSinkFallbackSkipsArchivedProject()` | sink-fallback guards against operating on archived projects |
| `testSinkMergeRefusesLiveFolder()` | `assertNoLiveWorkflowFolder` blocks merge with live workflow-state.md |
| `testSinkMergeBlocksUnpushedCommits()` | `assertBranchPushedToUpstream` blocks merge with unpushed commits |
| `testE2EGitHubMergeFullChain()` | full merge chain: startup → worktree-finalize → finalize --keep-worktree → sink-merge |
| `testE2EGitHubPrFullChain()` | full PR chain: startup → worktree-finalize → sink-pr → watch-pr MERGED → archive |
| `testStatusShowsClosedIssueDrift()` | `cmdStatus` drift partition |

No test currently verifies `clearAdvisoryClaim` is called or that label was actually removed. No test verifies `sink-merge` step-8 best-effort label/issue-close calls. Tests run with `KAOLA_WORKFLOW_OFFLINE=1`, so remote-call paths are structurally unreachable in most tests.

Plugin-specific test files:
- GitLab: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` and `test-gitlab-sinks.js`
- Gitea: `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` and `test-gitea-sinks.js`

---

## Relevant Env Vars and Feature Flags

| Variable | Role |
|---|---|
| `KAOLA_WORKFLOW_OFFLINE=1` | Skip all network calls |
| `KAOLA_WORKTREE_NATIVE=1` | Enable native worktree provisioning at claim time |
| `KAOLA_GH_MOCK_SCRIPT` | Substitute a Node script for `gh` binary in tests |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL=N` | Fail first N FF attempts (test hook) |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=token` | Force exit-3 classification (test hook) |
| `KAOLA_WORKFLOW_DEBUG_CWD=path` | Write final CWD to file on exit (test hook) |
| `KAOLA_SINK` | Override default `sink: merge` at claim time |
| `CLAIM_LABEL` | `'workflow:in-progress'` — the advisory label applied at claim, removed at closure |

---

## Cross-Forge Drift Already Present

**`archiveProjectDir` — `removeLegacyStateBlocks`:**
- GitHub (`scripts/kaola-workflow-claim.js` line 505): calls `removeLegacyStateBlocks(content)` ✓
- GitLab (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` line 504): does NOT call it ✗
- Gitea (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` line 504): does NOT call it ✗

**`clearAdvisoryClaim` — label-removal API and silent-skip condition:**
- GitHub: attempts removal regardless of whether issue number is valid (only guard is `if (OFFLINE || issueNumber == null) return`)
- Gitea: skips label removal if `projectInfo.full_name` is absent — different silent-skip surface

**`cmdSinkFallback` — live-folder guard:**
- GitHub (line 822–824): checks only `if (!fs.existsSync(projectDir(...)))` — no archive check
- GitLab/Gitea (line 864–866): checks `if (!fs.existsSync(projectDir(...)) || fs.existsSync(archivePath))` — also guards against operating if archive already exists
