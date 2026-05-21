# Phase 1 - Research / Discovery: issue-137

## Deliverable
A guard function `assertBranchFullyPushed(mainRoot, branch)` in `scripts/kaola-workflow-sink-merge.js` that blocks the merge sink when the feature branch has unpushed commits on `origin/main`. Guard reports: branch name, upstream ref, ahead count, and up to 5 representative commit SHAs/titles.

## Why
Closing GitHub issues while local commits haven't been pushed to `origin/main` creates divergence between "done" (issue closed) and "shipped" (code on remote). A fresh clone would miss the completed work. The guard enforces the invariant that closing = shipped.

## Affected Area
- `scripts/kaola-workflow-sink-merge.js` — primary: new `assertBranchFullyPushed` guard between lines 266–283
- `scripts/simulate-workflow-walkthrough.js` — test coverage (new test modeled on `testSinkMergeRefusesLiveFolder` at line 1089)
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — plugin sync (validate-script-sync.js requirement)

## Key Patterns Found

1. Guard pattern: `scripts/kaola-workflow-sink-merge.js:64–78` — `assertCleanWorktree` and `assertNoLiveWorkflowFolder` — throw `new Error(message)`, caught at entry point, written to stderr + exit 1
2. Guard chain: `scripts/kaola-workflow-sink-merge.js:264–266` — sequential assert calls; new guard inserts at line ~267
3. OFFLINE skip: `scripts/kaola-workflow-sink-merge.js:125,172,203,210` — `if (!OFFLINE)` gates all network calls
4. Push location: `scripts/kaola-workflow-sink-merge.js:173` — `git push origin main` inside `postMergeCleanup()`
5. Test skeleton: `scripts/simulate-workflow-walkthrough.js:1089–1113` — `testSinkMergeRefusesLiveFolder`: run-subprocess → assert exit != 0 + stderr contains guard message

## Test Patterns
- Framework: hand-rolled assert in `simulate-workflow-walkthrough.js`
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `initGitRepo(tmp)` + spawnSync + assert exit code + assert stderr message
- New test name: `testSinkMergeRefusesAheadOfUpstream`

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — skip all network calls; guard must respect this constant
- `OFFLINE` constant at `kaola-workflow-sink-merge.js` top-level (pattern: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'`)

## External Docs
None required — all git primitives are well-known.

## GitHub Issue
KaolaBrother/Kaola-Workflow#137

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | Internal scripts only; no external library/API behavior needed |

## Notes / Future Considerations
- Publish guard also applies to `sink-pr.js` (pushes feature branch); considered in-scope if time allows, but primary AC covers `sink-merge` path
- CHANGELOG and README update needed per doc checklist
