# Phase 1 - Research / Discovery: issue-38

## Deliverable
Fix `commands/kaola-workflow-phase4.md` to derive `COORD_ROOT` from `git worktree list --porcelain` instead of `--show-toplevel`, add a test verifying the fix, and apply nine quality-polish items (MEDIUM-1 through MEDIUM-6, LOW-1 through LOW-4) to `scripts/kaola-workflow-claim.js`, `scripts/simulate-workflow-walkthrough.js`, and `scripts/validate-workflow-contracts.js`, mirroring claim-script changes into `plugins/kaola-workflow/scripts/`.

## Why
When Phase 4 runs from inside an issue worktree (the normal landing point after `pick-next`), `git rev-parse --show-toplevel` returns the issue-worktree path, not the main repo. This makes `ACTIVE_WORKTREE_PATH` resolve to the wrong root, defeating the worktree-native premise. Without this fix, `KAOLA_WORKTREE_NATIVE=1` is safe only from the main worktree. The quality items address maintainability debt (oversized functions, silent failures, type inconsistency) captured during the issue-37 Phase 5 review.

## Affected Area

| File | Change |
|---|---|
| `commands/kaola-workflow-phase4.md:63` | Replace `--show-toplevel` with `git worktree list --porcelain` pattern |
| `scripts/kaola-workflow-claim.js` | MEDIUM-1 (refactor 3 oversized functions), MEDIUM-2 (log provisionWorktree failure), MEDIUM-3 (normalize `issue` field type), LOW-1 (anchor regex), LOW-2 (phase-routing table), LOW-4 (module.exports format) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Mirror all claim-script changes |
| `scripts/simulate-workflow-walkthrough.js` | MEDIUM-5 (add 17G–17J failure-path tests), LOW-3 (derive .kw path from pick17a) |
| `scripts/validate-workflow-contracts.js` | MEDIUM-6 (strengthen routing checks) |

## Key Patterns Found

1. **Main-worktree detection via porcelain** — `cmdResume:2228-2236` and `cmdWorktreeFinalize:2360-2363` both use `git worktree list --porcelain`, reading the first `worktree ` line. Bash equivalent: `git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'`
2. **provisionWorktree error logging** — `cmdClaim:1361-1368` logs to stderr and sets `process.exitCode = 2`; `cmdPickNext:2214` silently swallows. Fix: add identical stderr write in the catch block.
3. **Phase-routing lookup table** — `cmdResume:2267-2281` has a 7-arm if/else chain; converting to a `PHASE_ARTIFACTS` array decouples the phase list from the conditional logic.

## Test Patterns
- Framework: hand-rolled `assert()` + `assertIncludes()` in `scripts/simulate-workflow-walkthrough.js`
- Location: `scripts/simulate-workflow-walkthrough.js`, Epic Case 17 (lines 4703–4815)
- Structure: temp git repo in `mkdtempSync`, `gh` shim for offline testing, `finally` cleanup
- New tests (17G–17J) follow the same temp-dir + exec pattern as 17D–17F

## Config & Env
- `KAOLA_WORKTREE_NATIVE=1` — enables worktree-native mode; checked in `commands/kaola-workflow-phase4.md:62`
- `KAOLA_WORKFLOW_OFFLINE=1` — disables network calls; used in test shims

## External Docs
None — `git worktree list --porcelain` behavior is proven by existing usage in the codebase.

## GitHub Issue
KaolaBrother/Kaola-Workflow#38

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | All changes are internal; git porcelain format proven by existing code |

## Notes / Future Considerations
- The `findMainWorktree()` helper extracted for MEDIUM-1 could be exported and shared across `cmdPickNext`, `cmdResume`, and `cmdWorktreeFinalize`, but the refactor scope is limited to the three named functions.
- The acceptance criteria require a bash-level test verifying `COORD_ROOT` resolves correctly from inside an issue worktree. This can be implemented in Case 17 as a Node.js `execSync` of the bash snippet against the already-provisioned issue worktree from 17A.
