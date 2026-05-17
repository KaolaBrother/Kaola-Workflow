# Phase 2 - Ideation: issue-38

## Approaches Evaluated

### Option A: Contract-only test (minimal)
- Summary: Fix phase4.md:63 and add a string-pattern assertion to validate-workflow-contracts.js.
- Pros: Smallest diff; fast review.
- Cons: Does not exercise behavior. A future edit with the correct string but wrong awk slice index passes the test undetected.
- Risk: Medium — brittle to whitespace and refactors.
- Complexity: Small.

### Option B: Behavior test via simulate-workflow-walkthrough.js (RECOMMENDED)
- Summary: Fix phase4.md:63 and add Case 17K: from inside `pick17a.worktree_path`, execute the bash one-liner and assert `COORD_ROOT == epic17Tmp`. Apply quality-polish items (MEDIUM-1 through MEDIUM-6, LOW-1 through LOW-4) to claim script, test suite, and validator.
- Pros: Tests actual behavior. Future regressions in phase4.md fail loudly. Single source of truth stays in markdown.
- Cons: Test requires bash (POSIX-only, consistent with the rest of Case 17).
- Risk: Low.
- Complexity: Low–Medium.

### Option C: New JS subcommand `main-worktree`
- Summary: Add `cmdMainWorktree()`, change phase4.md to call `node "$_CLAIM_JS" main-worktree`.
- Pros: DRY across MD and JS callers.
- Cons: Over-engineering. Only one MD file has the bug. Adds new wire-protocol surface and an extra node spawn.
- Risk: Medium — subcommand creep.
- Complexity: Medium.

## Advisor Findings

Advisor confirmed Approach B is sound and identified four gaps in the planner output:

1. **MEDIUM-1 under-delivered**: Planner only extracted `findMainWorktree`, but the AC requires all three functions under 50 lines. Full extraction set:
   - `cmdPickNext`: extract `buildClaimedBranchSet(root, offline)` and `fetchOpenIssues(root, offline)`
   - `cmdResume`: extract `findMainWorktree()`, `detectCurrentProject(args)`, `scanPhaseArtifacts(projectDir)`
   - `cmdWorktreeFinalize`: reuse `findMainWorktree()`, extract `commitWorktreeArtifacts(worktreePath, project)`

2. **LOW-3 missing**: `simulate-workflow-walkthrough.js:4811` uses `epic17Tmp + '.kw'` string concatenation; fix is `path.dirname(pick17a.worktree_path)`.

3. **LOW-2 with false attribution**: Planner falsely attributed an advisor warning as justification to skip LOW-2. Decision: do LOW-2. Extract 7-arm if/else chain in `cmdResume:2267–2281` into a `PHASE_ARTIFACTS` lookup table.

4. **Validator content-check for phase4.md**: Add `assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain")` to validate-workflow-contracts.js.

## Selected Approach

**Approach B — Behavior test via simulate-workflow-walkthrough.js**

Rationale: Behavioral test coverage is the only approach that catches future regressions reliably. The bash snippet is proven correct by the existing JS pattern in cmdResume and cmdWorktreeFinalize. All other approaches either under-test or over-engineer.

## Implementation Plan (4 commits)

### Commit 1 — Bug fix + behavior test (Phase 1 + 2 in planner numbering)
1. `commands/kaola-workflow-phase4.md:63` — replace `git rev-parse --show-toplevel` with `git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'`
2. Case 17K — from inside `pick17a.worktree_path`, execute the bash one-liner, assert `COORD_ROOT == epic17Tmp`

### Commit 2 — Negative-path tests (MEDIUM-5)
3. Case 17G: `resume` with no project/branch context → `resumed: false, reason: cannot determine project`
4. Case 17H: `worktree-finalize --project issue-999` (never provisioned) → non-zero exit, stderr has `worktree not provisioned at`
5. Case 17I: dirty file in `kaola-workflow/issue-701/` → non-zero exit, stderr has `uncommitted changes`
6. Case 17J: `worktree-finalize` with committed artifact → HEAD before vs after differs

### Commit 3 — Contract validator hardening (MEDIUM-6)
7. Strengthen dispatcher route checks: `if (sub === 'pick-next')`, `if (sub === 'worktree-status')`, `if (sub === 'worktree-finalize')`
8. Add `assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain")`
9. Add plugins/ mirror parity check (all four `cmd*` function names and `if (sub === ...)` lines present in both scripts/ and plugins/)

### Commit 4 — Claim-script quality polish + plugins/ mirror
10. Extract `findMainWorktree()` — replace inline blocks at `cmdResume:2228–2236` and `cmdWorktreeFinalize:2360–2363`. Export.
11. Extract `buildClaimedBranchSet(root, offline)` from `cmdPickNext:2138–2153`
12. Extract `fetchOpenIssues(root, offline)` from `cmdPickNext:2155–2176`
13. Extract `detectCurrentProject(args)` from `cmdResume:2244–2259`
14. Extract `scanPhaseArtifacts(projectDir)` from `cmdResume:2263–2281`
15. Extract `commitWorktreeArtifacts(worktreePath, project)` from `cmdWorktreeFinalize` dirty-check + stage + commit block
16. LOW-2: replace 7-arm if/else chain in `cmdResume:2267–2281` with `PHASE_ARTIFACTS` lookup table
17. MEDIUM-2: add `process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + _.message + '\n')` in `cmdPickNext` catch
18. MEDIUM-3: change `project.replace(/^issue-/, '')` to `parseInt(project.replace(/^issue-/, ''), 10)` in `cmdResume`. Add Case 17D assertion `resume17d.issue === 701`.
19. LOW-1: anchor `refs/heads/` regex in `cmdWorktreeStatus:2319` to `/^refs\/heads\//`
20. LOW-3: `simulate-workflow-walkthrough.js:4811` — replace `epic17Tmp + '.kw'` with `path.dirname(pick17a.worktree_path)`
21. LOW-4: reformat `module.exports` to multi-line consistent form; add `findMainWorktree` to exports
22. Mirror all steps 10–21 into `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

## Out of Scope (explicit)

- No new JS subcommand `main-worktree` (Approach C rejected)
- No extraction of single-caller helpers beyond the six named above
- No splitting of cmdPickNext/cmdResume/cmdWorktreeFinalize beyond the extractions above
- No fix for `_TICKER_PID_FILE` `--show-toplevel` usages — those are intentional (per-worktree path)
- No phase-routing for `fetchOpenIssues` / `scanPhaseArtifacts` beyond the two real callers
- No CHANGELOG.md update beyond listing the phase4.md fix and `cmdResume.issue` type change

## Open Questions (pre-implementation)
- Grep `commands/*.md` for any consumer that parses `resume.issue` as a string before merging MEDIUM-3.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
