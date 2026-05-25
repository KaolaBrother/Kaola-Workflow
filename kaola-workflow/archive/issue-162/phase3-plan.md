# Phase 3 - Plan: issue-162

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add closure-contract require; replace `catch (_) {}` roadmap block with named-capture receipt logic; add receipt fields to return; add `checkClosureInvariants` helper; update `cmdFinalize` and `cmdWatchPr` | Core GitHub claim script — byte-constrained with Codex tree |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical to above | COMMON_SCRIPTS enforcement |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Same logical changes, GitLab naming | GitLab forge manual sync |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same logical changes, Gitea naming | Gitea forge manual sync |
| `scripts/simulate-workflow-walkthrough.js` | Extend 2 existing roadmap tests; add 2 new tests (failure path, watcher path); register | Regression coverage |
| `docs/api.md` | Update #162 flow-mapping row (line ~468); add receipt emission note | Contract docs |
| `CHANGELOG.md` | Add [Unreleased] entry | User-visible change |

### Build Sequence
1. Verify `scripts/kaola-workflow-closure-contract.js` (no changes needed — schema complete, `.id`-keyed invariants confirmed)
2. Task A — GitHub pair (`scripts/` + Codex) as one atomic byte-identical diff
3. Task B — GitLab claim script (parallel with A)
4. Task C — Gitea claim script (parallel with A, B)
5. Task E — Docs (parallel with A, B, C)
6. Task D — Tests (depends on A — walkthrough invokes `scripts/kaola-workflow-claim.js`)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| P1 | A, B, C, E | Disjoint write sets |
| P2 | D | Depends on A; must run after A passes validate-script-sync.js |

### External Dependencies
- `scripts/kaola-workflow-closure-contract.js` — existing module; no new package installs
- Node built-ins only: `fs`, `path`

## Task List

### Task 1: Harden archiveProjectDir in GitHub + Codex claim scripts (Task A)
- File: `scripts/kaola-workflow-claim.js`
- Mirror file (byte-identical): `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: P1 (parallel with Tasks 2, 3, 4)
- Action: MODIFY
- Implement:
  1. Near top-level requires (~line 16), add: `const closureContract = require('./kaola-workflow-closure-contract');`
  2. In `archiveProjectDir()`: declare `let roadmapSourceRemoved = 'absent'; let roadmapRegenerated = 'skipped';` before the `if (statusValue === 'closed')` block
  3. Replace entire `try { ... } catch (_) { }` roadmap block with:
     - First inner try/catch: `fs.unlinkSync(roadmapFilePath)` → `roadmapSourceRemoved = 'removed'`; catch: `roadmapSourceRemoved = (e.code === 'ENOENT') ? 'absent' : 'failed'` (NO re-throw)
     - Second inner try/catch: `roadmapModule.regenerateRoadmap(root)` → `roadmapRegenerated = 'regenerated'`; catch: `roadmapRegenerated = 'failed'`
  4. Change the closed-path return to: `return { archived: true, dest, roadmap_source_removed: roadmapSourceRemoved, roadmap_regenerated: roadmapRegenerated };`
  5. Add `checkClosureInvariants(root, receipt)` function that:
     - Checks `roadmap-source-absent`: `fs.existsSync(path.join(root,'kaola-workflow','.roadmap','issue-'+N+'.md'))` → violation
     - Checks `roadmap-mirror-clean`: reads ROADMAP.md, checks for `#N` substring → violation (use high-numbered test issues to avoid substring collision; in production this check is conservative)
     - Looks up descriptions via `closureContract.CLOSURE_INVARIANTS.find(i => i.id === ...)`
     - Returns `{ ok: violations.length === 0, violations }`; does NOT throw
  6. In `cmdFinalize` (~line 544): capture return value; call `checkClosureInvariants(root, { issue_number: issueNumber, ...archiveResult })`; merge into output: `{ status: 'closed', archived: true, dest, roadmap_source_removed, roadmap_regenerated, closure_invariants }`
  7. In `cmdWatchPr` (~line 833-858): capture `archiveProjectDir` return; if `roadmap_source_removed === 'failed'` or `roadmap_regenerated === 'failed'`, push to `warnings` array; include `warnings` in final output
  8. After editing `scripts/`, copy verbatim to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Mirror: `archiveProjectDir` pattern at `scripts/kaola-workflow-claim.js:496-537`; receipt pattern from `scripts/kaola-workflow-closure-contract.js:9-19`; `emptyReceipt()` fail-loud convention from #161
- Validate: `node scripts/validate-script-sync.js` (byte-identity); `node -e "require('./scripts/kaola-workflow-claim.js')"` (no throw on load)

### Task 2: Harden archiveProjectDir in GitLab claim script (Task B)
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: none
- Parallel Group: P1 (parallel with Tasks 1, 3, 4)
- Action: MODIFY
- Implement: Same logical changes as Task 1. Before editing: grep for the watcher command name (may be `cmdWatchMr`/`watch-mr` not `cmdWatchPr`/`watch-pr`). Apply receipt block, `checkClosureInvariants`, require, and watcher warnings identically to the logical structure of Task 1. Do NOT fix the `removeLegacyStateBlocks` divergence (out of scope).
- Mirror: Same receipt pattern; manual sync from Task 1 diff
- Validate: `node -e "require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js')"` (no throw on load)

### Task 3: Harden archiveProjectDir in Gitea claim script (Task C)
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: none
- Parallel Group: P1 (parallel with Tasks 1, 2, 4)
- Action: MODIFY
- Implement: Same logical changes as Task 1. Before editing: grep for watcher command name in Gitea script. Apply same receipt block, helper, require, watcher warnings.
- Mirror: Same receipt pattern; manual sync
- Validate: `node -e "require('./plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js')"` (no throw on load)

### Task 4: Update docs (Task E)
- File: `docs/api.md`, `CHANGELOG.md`
- Write Set: `docs/api.md`, `CHANGELOG.md`
- Depends On: none
- Parallel Group: P1 (parallel with Tasks 1, 2, 3)
- Action: MODIFY
- Implement:
  1. In `docs/api.md` around line 468: update `#162` flow-mapping row to state cleanup now emits receipt fields (`roadmap_source_removed`, `roadmap_regenerated`) and `closure_invariants`. Preserve `## Closure Contract` and `roadmap_source_removed` tokens (required by validators).
  2. In `CHANGELOG.md`: add entry under `[Unreleased]` describing the receipt tracking change.
- Validate: `node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js`

### Task 5: Add regression tests (Task D)
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1 (Task A must pass validate-script-sync.js first)
- Parallel Group: P2
- Action: MODIFY
- Implement:
  1. Extend `testFinalizeCleansRoadmapEntry` (line 2054): after existing assertions, add:
     - `assert(result.roadmap_source_removed === 'removed' || result.roadmap_source_removed === 'absent', 'receipt: roadmap_source_removed')`
     - `assert(result.roadmap_regenerated === 'regenerated', 'receipt: roadmap_regenerated')`
     - `assert(result.closure_invariants && result.closure_invariants.ok === true, 'receipt: closure_invariants.ok')`
  2. Extend `testFinalizeFromLinkedWorktreeCleansRoadmapEntry` (line 2084): same receipt field assertions
  3. Add `testFinalizeRoadmapCleanupFailureReceipt()`:
     - Use high-numbered issue (e.g., 912) to avoid substring collision
     - Plant active folder + roadmap issue file
     - Replace `.roadmap/issue-912.md` with a directory of same name (`fs.mkdirSync`) so `unlinkSync` throws `EISDIR`/`EPERM`
     - Run `runNode(claimScript, ['finalize', '--project', folder, '--issue', '912'])`
     - Assert exit 0 (cleanup failure must not abort finalize)
     - Assert `result.roadmap_source_removed === 'failed'`
     - Assert `result.closure_invariants.ok === false`
     - Assert `result.closure_invariants.violations.some(v => v.id === 'roadmap-source-absent')`
  4. Add `testWatchPrRoadmapCleanupWarning()`:
     - Plant sink:pr folder with pr_url; write gh shim returning MERGED
     - Corrupt `.roadmap/issue-N.md` with directory trick
     - Run `runClaimOnline(['watch-pr'], cwd, binDir)`
     - Parse output; assert `warnings` array non-empty and references roadmap failure
  5. Register both new test functions in `main()` right after `testFinalizeFromLinkedWorktreeCleansRoadmapEntry()` call (~line 2312)
- Mirror: existing `plantActiveFolder` + `plantRoadmapIssue` + `runNode` + `json()` pattern; `writeShimFiles` + `runClaimOnline` pattern for watcher test
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exits 0 with `Workflow walkthrough simulation passed`)

## Advisor Notes
Advisor temporarily overloaded (third time). Direct verification confirms:
- Build sequence is dependency-safe.
- All validator scripts exist: `validate-workflow-contracts.js`, `validate-kaola-workflow-contracts.js`, `validate-script-sync.js`.
- CLOSURE_INVARIANTS use `.id` field (confirmed in source).
- No missing integration points.
- One implementation note: `roadmap-mirror-clean` substring check `#N` may match `#90` inside `#900` — use high-numbered issue IDs in tests (912, 913) to avoid false positives. Production behavior is conservative (false positive triggers invariant warning, not a crash).
Full verification in `.cache/advisor-plan.md`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked (overloaded) | .cache/advisor-plan.md | Direct verification used per session precedent |
| architect revisions | N/A | advisor found no gaps | Blueprint complete in first pass |
