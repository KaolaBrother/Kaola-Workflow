# Phase 1 - Research: issue-72

## Scope

Implement GitLab-local forge primitives for the post-#63 migration plan, limited to `plugins/kaola-workflow-gitlab/scripts/`.

## Facts

- #72 is the first implementation issue after #66 and must not introduce workflow orchestration.
- GitLab issue identity must use `iid` as the workflow issue number while preserving `issue_iid`.
- GitLab merge request identity must preserve `mr_iid`, `web_url`, and `mr_url`.
- Durable comments must use the GitLab Notes API through `glab api`, with note IDs taken from API JSON.
- `workflow:queued` and `workflow:in-progress` labels must remain exact strings.
- The GitLab helper tree must not import or fall back to `plugins/kaola-workflow/`, root `scripts/`, GitHub URLs, or `gh`.

## Current Surface

- Existing GitLab plugin manifests are present under `plugins/kaola-workflow-gitlab/`.
- `npm run test:kaola-workflow:gitlab` is still the #58 placeholder manifest check.
- No shared forge adapter is needed for this issue.

## Research Result

Proceed with a standalone CommonJS helper module plus a focused Node test script in the GitLab plugin scripts directory.

