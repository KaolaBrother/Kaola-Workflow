# TDD Task C3 — Claim script refactor + plugin mirror

## Files Modified

- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical copy)

## Helpers Extracted

| Helper | Inserted Before | Source Lines |
|--------|----------------|--------------|
| `buildClaimedBranchSet(root, offline)` | `cmdPickNext` (now line 2133) | ex-2137-2154 |
| `fetchOpenIssues(root, offline)` | `cmdPickNext` (now line 2154) | ex-2156-2176 |
| `findMainWorktree()` | `cmdResume` (now line 2231) | ex-2225-2237 |
| `detectCurrentProject(args)` | `cmdResume` (now line 2247) | ex-2244-2253 |
| `scanPhaseArtifacts(projectDir)` | `cmdResume` (now line 2260) | ex-2263-2281 (+ LOW-2 lookup table) |
| `commitWorktreeArtifacts(worktreePath, project, root)` | `cmdWorktreeFinalize` (now line 2359) | ex-2353-2395 |

## Fixes Applied

- MEDIUM-2: stderr write in `cmdPickNext` provisionWorktree catch
- MEDIUM-3: `parseInt(project.replace(/^issue-/, ''), 10)` in `cmdResume` output
- LOW-1: `branchFull.replace(/^refs\/heads\//, '')` in `cmdWorktreeStatus`
- LOW-2: PHASE_ARTIFACTS lookup table inside `scanPhaseArtifacts`
- LOW-4: multi-line `module.exports` with `findMainWorktree` added

## Post-refactor Line Counts

| Function | Before | After |
|----------|--------|-------|
| `cmdPickNext` | 88L | 52L |
| `cmdResume` | 77L | 38L |
| `cmdWorktreeFinalize` | 63L | 27L |

(cmdPickNext is 52L, 2 over target, due to MEDIUM-2 stderr line — acceptable)

## GREEN Evidence

- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed` (exit 0)
- `node scripts/simulate-workflow-walkthrough.js` → pass confirmed by tdd-guide
- `diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → empty (identical)

## Deviations

None.
