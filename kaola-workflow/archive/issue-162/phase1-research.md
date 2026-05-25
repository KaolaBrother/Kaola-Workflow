# Phase 1 - Research / Discovery: issue-162

## Deliverable
Harden roadmap source cleanup in `archiveProjectDir()` so failures produce explicit receipt metadata and are not silently swallowed. Apply equivalent behavior to GitLab and Gitea claim scripts. Add post-closure invariant check for `roadmap-source-absent` and `roadmap-mirror-clean`. Regression tests cover: finalize from main worktree, finalize from linked worktree, watcher archive after PR/MR merge, failure path.

## Why
A closure can currently report success while `kaola-workflow/.roadmap/issue-N.md` with `status: open` remains, causing completed work to appear as active work in ROADMAP.md. The outer `catch (_)` in `archiveProjectDir` silently swallows all roadmap cleanup errors.

## Affected Area

### Core change — `archiveProjectDir()` roadmap cleanup block
- `scripts/kaola-workflow-claim.js` lines 496–537 (GitHub)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` line 495 (GitLab)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` line 480 (Gitea)

### Consumers (no changes expected, but contract-impacting)
- `scripts/kaola-workflow-claim.js` `cmdFinalize` (line 539) — calls `archiveProjectDir`
- `scripts/kaola-workflow-claim.js` `cmdWatchPr` (lines 833–858) — calls `archiveProjectDir` directly
- `scripts/kaola-workflow-sink-merge.js` — NOT affected (does not archive)

### Tests
- `scripts/simulate-workflow-walkthrough.js` lines 2054, 2084 (existing roadmap cleanup tests)
- New failure-path tests needed

### Docs (update if behavior/output changes)
- `docs/workflow-state-contract.md`
- `docs/api.md` § Closure Contract (receipt fields table)
- README closure guidance if output format changes

## Key Patterns Found

1. **Best-effort roadmap cleanup** — `archiveProjectDir()` wraps delete + regen in `catch (_) {}` making all failures silent; fix requires removing or hardening this catch. (`scripts/kaola-workflow-claim.js:534`)
2. **Receipt pattern from closure-contract** — `CLOSURE_RECEIPT_FIELDS.roadmap_source_removed` and `roadmap_regenerated` define the expected output values; `emptyReceipt()` defaults them to `'failed'`. (`scripts/kaola-workflow-closure-contract.js:9-19`)
3. **`ENOENT` is valid** — `fs.unlinkSync` in the cleanup block re-throws non-ENOENT errors only; ENOENT = `roadmap_source_removed: 'absent'`, not a failure. (`scripts/kaola-workflow-claim.js:520-522`)
4. **Three independent copies** — each forge has its own `archiveProjectDir`; roadmap block is byte-identical; `removeLegacyStateBlocks` call is the only existing delta (present only in main script). All three must be updated.
5. **`cmdFinalize` returns JSON** — outputs `{"status":"closed","archived":true,"dest":...}` as stdout; receipt fields can be added to this object.
6. **`cmdWatchPr` path** — calls `archiveProjectDir` directly for both merged (`'closed'`) and closed (`'abandoned'`) PRs; any receipt change must propagate correctly through this path too.
7. **Existing test scaffold** — `testFinalizeCleansRoadmapEntry` (line 2054) uses `plantActiveFolder` + `plantRoadmapIssue` + `runNode(claimScript, ['finalize', ...])` pattern; `assert` for file absence and ROADMAP.md content.

## Test Patterns
- Framework: hand-rolled assertions; no external runner
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `initGitRepo(tmpDir)` → `plantActiveFolder(...)` → `plantRoadmapIssue(...)` → `runNode(script, ['finalize', ...])` → `assert(...)` / `assertFileAbsent(...)` / `assertFileContains(...)`
- Failure tests: corrupt `.roadmap/` dir (e.g., remove it) before running finalize; assert `result.status !== 0`

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — suppresses `gh` calls in tests
- `KAOLA_GH_MOCK_SCRIPT` — path to `gh.js` mock (used by `runClaimOnline`)
- `KAOLA_WORKTREE_NATIVE=1` — enables linked-worktree provisioning (needed for linked-worktree test)

## External Docs
None needed — Node built-ins only (fs, path, child_process).

## GitHub Issue
KaolaBrother/Kaola-Workflow#162

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient; Node built-ins only | no external library behavior needed |

## Notes / Future Considerations
- `cmdRelease` passes `'abandoned'` to `archiveProjectDir` which skips the roadmap cleanup block entirely. Issue #162 AC does not mention hardening the abandoned path — defer to #165 (audit command catches strays).
- Receipt data from `archiveProjectDir` feeds into #164's shared closure executor design.
- Critical constraint: do NOT make `ENOENT` (source file already absent) a failure. `roadmap_source_removed: 'absent'` is a valid closed state, not an error.
