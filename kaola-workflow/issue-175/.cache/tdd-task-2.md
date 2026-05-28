# TDD Task 2: Gitea classifier OFFLINE guard

## Status: PASSED

## Changes
File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`

### Site A — classifyIssue (lines 253-262, was 253-255)
Replaced 3-line `if (OFFLINE) { return classify(...) }` with 9-line guard that checks roadmapFile + activeFolders before falling through to classify().

### Site B — cmdClassify (lines 293-305, was 293-297)
Replaced 4-line `if (OFFLINE) { ... write classify result ... }` with 11-line guard that checks roadmapFile + activeFolders, writes target_unverified JSON if no evidence, then falls through to existing classify path.

## Smoke Test
```
{"verdict":"target_unverified","reasoning":"OFFLINE and no local evidence for issue #999 (no kaola-workflow/.roadmap/issue-999.md and no active folder in this repository)"}
exit=0
```

## Validation
`node --check` exit 0 — no syntax errors.
`issue_iid` field confirmed (not `issue_number`).
`fs` and `path` already imported.
