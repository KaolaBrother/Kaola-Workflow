# Planner Output: issue-137

## Approach A — Sibling assertX helper (RECOMMENDED)
Add `assertBranchPushedToUpstream(mainRoot, branch)` adjacent to `assertNoLiveWorkflowFolder`.
- Called from `main()` after `assertNoLiveWorkflowFolder`, before merge-base check
- Throws Error with branch name, upstream, ahead count, representative commits
- Skipped when OFFLINE=true

## Approach B — Inline check in main()
Inline rev-list/log calls directly in main().
- Breaks guard convention; harder to read

## Approach C — Shared publish-guard module
Extract to new shared module.
- Speculative abstraction; no current second caller

## Recommended: Approach A

## Git primitives
1. `git rev-parse --abbrev-ref --symbolic-full-name <branch>@{u}` — resolve upstream
2. `git rev-list --count <branch>@{u}..<branch>` — ahead count
3. `git log --format=%h %s -n 5 <branch>@{u}..<branch>` — representative commits

## Tests
- Add `initGitRepoWithBareRemote(tmp)` helper
- Add `testSinkMergeBlocksUnpushedCommits` — block path test
- Add `testSinkMergeOfflineSkipsPublishGuard` — offline skip test

## Open Questions
1. No-upstream policy: default strict (block with remediation hint `git push -u origin <branch>`)

## Out of Scope
- sink-pr.js (different flow)
- Shared module extraction (YAGNI)
- Force/override knob beyond OFFLINE skip

## Files
- `scripts/kaola-workflow-sink-merge.js` — guard + wiring
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — sync copy
- `scripts/simulate-workflow-walkthrough.js` — helper + tests
- `CHANGELOG.md` — [Unreleased] entry
