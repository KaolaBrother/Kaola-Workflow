# Planner Output — Issue #89

## Recommended Approach: C — Internalize GitHub structure, preserve public API

### Approach A: Monolithic port
- **Pros:** Maximum behavioral parity; future GitHub diffs easy to forward-port
- **Cons:** Deletes `fastForwardMain` body + `{skipGit, gitExec}` test seam; breaks four existing assertions
- **Risk:** High — re-writing existing passing tests as collateral; loses GitLab-specific divergences if ported carelessly
- **Complexity:** Medium

### Approach B: Incremental gap-fill
- **Pros:** Existing tests untouched
- **Cons:** `fastForwardMain` becomes a chimera; control flow tangles; drifts further from GitHub reference
- **Risk:** High — easy to leave subtle gaps (reset-on-classified-failure, FF retry semantics, merge-base check with OFFLINE)
- **Complexity:** Medium-high (cognitive)

### Approach C: Internalize GitHub structure, preserve public API ⭐
- **Pros:** Existing tests keep passing; GitHub structural parity; exit-2/3 directly testable via env vars + spawnSync; finalValidationPassed gate preserved; clear separation of concerns
- **Cons:** Requires explicit branch in `runDirectMerge`: when `opts.skipGit === true`, take legacy path; otherwise run new pipeline
- **Risk:** Medium — needs care on import surface, OFFLINE gate on forge.closeIssue, process.on('exit') ordering
- **Complexity:** Medium

**Rationale:** C ships full GitHub contract without breaking existing tests or muddying control flow. `fastForwardMain` is not imported by any external caller, so the wrapper can stay narrow.

## Implementation Steps

### Phase 1 — Helpers and imports
1. Add imports: `os`, `removeWorktree`, `getCoordRoot`, `readActiveFolders` from claim.js; `mainRootFromCoord` helper; env constants OFFLINE/FORCE_FF_FAIL/FORCE_MERGE_IMPOSSIBLE
2. Add `classifyMergeError` with GitLab-specific patterns:
   - `/protected branch|pre-receive hook declined|server rejected/i` → `branch_protected`
   - `rejected` + `non-fast-forward` → `non_fast_forward`
   - `/permission denied|403|not authorized/i` → `permission_denied`
   - `/conflicts with target/i` → `non_fast_forward`
   - `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` override
   - Unclassified → `null` (re-throw)

### Phase 2 — Pipeline restructure
3. Implement `doRebase`, `ffMergeLoop`, `postMergeCleanup` ported from GitHub:
   - `postMergeCleanup`: `git push origin main` → classify error on failure → write receipt → return `{ exitCode: 3 }`; on success: `forge.closeIssue` + `forge.createIssueNote` (gated on `!OFFLINE && args.issue != null`); `git branch -d` + `git push origin --delete` (both swallowed)
4. Rewrite `runDirectMerge` as orchestrator:
   - If `opts.skipGit === true`: take legacy path (delegate to fastForwardMain + closeLinkedIssue) — preserves existing test seam
   - Otherwise: full pipeline (steps 0–9); map exitCode from result; register process.on('exit') chdir restore
5. Adapt `main()`: if result has `exitCode`, set `process.exitCode = result.exitCode`
6. Keep `fastForwardMain` as compatibility wrapper (no callers outside this module + test file)

### Phase 3 — Tests
7. Add `setupRealRepo(name)` helper in test file: `git init`, main branch with one commit, feature branch with extra commit, workflow-state.md + phase6-summary.md
8. Exit-2 test: `spawnSync` with `KAOLA_WORKFLOW_FORCE_FF_FAIL=3` + `KAOLA_WORKFLOW_OFFLINE=1`; assert `result.status === 2`
9. Exit-3 test: `spawnSync` with `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected`; assert `result.status === 3`; assert receipt JSON
10. Success path test: `spawnSync` with `KAOLA_WORKFLOW_OFFLINE=1`; assert worktree removed, local branch deleted, cwd restored (via `KAOLA_WORKFLOW_DEBUG_CWD`)
11. `classifyMergeError` unit test (optional): direct calls asserting each pattern → token

## Things NOT to Build
- `GH006` pattern in classifyMergeError (GitHub-specific)
- MR-creation path inside sink-merge (Phase 6 owns the pivot)
- `gh`/`glab` CLI calls for issue close (use forge API)
- Forge wrapper for branch-delete (use git directly)
- Remove `finalValidationPassed` gate
- New forge.closeIssue behavior that lacks OFFLINE gate (gate on `!OFFLINE && args.issue != null`)

## Key Risks
- `forge.closeIssue` not OFFLINE-gated today → add early return when OFFLINE
- GitLab push-rejection strings may differ from patterns → treat as best-effort, document
- `getCoordRoot` signature differs from GitHub → call `getCoordRoot(opts.root)` when root passed
- `process.on('exit')` chdir hook in spawnSync tests: safe (separate process)
- `removeWorktree` with undefined folder: falls back to `worktreePathFor` (verified safe)
- Branch-delete after OFFLINE FF merge: only assert in tests with actual merge
