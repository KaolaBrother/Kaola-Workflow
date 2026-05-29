# TDD Task 3: GitLab claim target_unverified handler

## Status: PASSED

## Changes
File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

Inserted `target_unverified` handler between `target_unavailable` handler (line 412-414) and final `return claimProject(...)`.

## Smoke Test
```json
{"verdict":"target_unverified","claim":"none","selected_project":"issue-999","selected_issue":999,"target_source":"user_directed","worktree_path":"","status":"target_unverified","issue":999,"project":"issue-999","reasoning":"OFFLINE and no local evidence for issue #999 (no kaola-workflow/.roadmap/issue-999.md and no active folder in this repository)"}
exit=1
```

Folder not created: confirmed.

## Validation
`node --check` exit 0. End-to-end startup: exit 1, verdict:target_unverified, claim:none, no folder created.
