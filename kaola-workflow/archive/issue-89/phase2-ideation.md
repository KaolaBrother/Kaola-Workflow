# Phase 2 - Ideation: issue-89

## Approaches Evaluated

### Option A: Monolithic Port
- Summary: Wholesale replace `fastForwardMain` body and control flow with direct port of GitHub implementation.
- Pros: Maximum behavioral parity; future GitHub diffs easy to forward-port.
- Cons: Deletes `fastForwardMain` body + `{skipGit, gitExec}` test seam; breaks four existing assertions.
- Risk: High — rewrites existing passing tests as collateral; loses GitLab-specific divergences if ported carelessly.
- Complexity: Medium

### Option B: Incremental Gap-Fill
- Summary: Leave `fastForwardMain` unchanged; bolt on missing features around it.
- Pros: Existing tests untouched.
- Cons: `fastForwardMain` becomes a chimera; control flow tangles; drifts further from GitHub reference.
- Risk: High — easy to leave subtle gaps (reset-on-classified-failure, FF retry semantics, merge-base check with OFFLINE).
- Complexity: Medium-high (cognitive)

### Option C: Internalize GitHub Structure, Preserve Public API ⭐
- Summary: Port GitHub's internal function structure (`doRebase`, `ffMergeLoop`, `postMergeCleanup`); branch `runDirectMerge` on `opts.skipGit`: when true, take legacy path; otherwise run the new pipeline.
- Pros: Existing tests keep passing; GitHub structural parity; exit-2/3 directly testable via env vars + spawnSync; `finalValidationPassed` gate preserved; clear separation of concerns.
- Cons: Requires explicit branch in `runDirectMerge`.
- Risk: Medium — needs care on import surface, OFFLINE gate on forge.closeIssue, process.on('exit') ordering.
- Complexity: Medium

## Advisor Findings

Approach C confirmed as correct with five refinements:

1. **closeLinkedIssue: Option A** — keep `closeLinkedIssue` untouched for legacy `skipGit` path. New pipeline adds inline close logic in `postMergeCleanup` gated on `!OFFLINE && args.issue != null`. Do NOT modify `closeLinkedIssue` to serve both paths.

2. **Explicit pipeline order** — `finalValidationPassed` check must run BEFORE the worktree escape:
   ```
   0. finalValidationPassed check
   1. chdir(os.tmpdir()) + removeWorktree + register exit hook
   2. git fetch (skip if OFFLINE)
   3. git checkout branch
   4. merge-base skip-check
   5. doRebase
   6. npm test (skip if alreadyUpToDate or OFFLINE)
   7. ffMergeLoop → exit 2 if exhausted
   8. postMergeCleanup (push → classify → receipt; or close+note+branch-delete on success)
   ```

3. **GitLab walkthroughs confirmed** — both `simulate-gitlab-workflow-walkthrough.js` and `simulate-gitlab-codex-workflow-walkthrough.js` exist. Phase 4 validates via `node test-gitlab-sinks.js`.

4. **Tightened classifyMergeError patterns** — drop `server rejected` (too generic); add `/not allowed to push|not allowed to merge/i` for GitLab-specific permission errors:
   ```js
   /protected branch|pre-receive hook declined/i → branch_protected
   /rejected/ + /non-fast-forward/ → non_fast_forward
   /conflicts with target/i → non_fast_forward
   /permission denied|403|not authorized|not allowed to push|not allowed to merge/i → permission_denied
   KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE env → override token
   unclassified → null (re-throw)
   ```

5. **FORCE_FF_FAIL semantics** — `KAOLA_WORKFLOW_FORCE_FF_FAIL=N` fails the first N FF merge attempts inside the loop (per-attempt counter). `FORCE_FF_FAIL=3` + `MAX_AUTOMERGE_RETRIES=3` → all 3 attempts fail → exit 2.

## Selected Approach
**Approach C: Internalize GitHub structure, preserve public API**

Rationale: Ships the full GitHub contract without breaking existing tests or muddying control flow. Existing callers use `skipGit: true` and continue to work unchanged. New pipeline runs when called as a CLI script (the production path). The branch in `runDirectMerge` is the only divergence from a clean port and it is minimal and well-understood.

## Out of Scope (explicit)
- `GH006` pattern in classifyMergeError (GitHub-specific)
- MR-creation path inside sink-merge (Phase 6 owns the pivot)
- `gh`/`glab` CLI calls for issue close (use forge API)
- Forge wrapper for branch-delete (use git directly)
- Remove `finalValidationPassed` gate
- Modify `closeLinkedIssue` to serve both the legacy and new paths

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
