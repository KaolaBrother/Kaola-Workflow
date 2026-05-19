# Architect Output — Issue 112

## Build Sequence
1. MODIFY kaola-gitea-forge.js — add checkRepoSquashEnabled, wire into mergePullRequest
2. MODIFY test-gitea-forge-helpers.js — add squash-gate test cases
3. CREATE kaola-gitea-workflow-sink-pr.js — port of kaola-gitlab-workflow-sink-mr.js
4. CREATE kaola-gitea-workflow-sink-merge.js — port of kaola-gitlab-workflow-sink-merge.js
5. CREATE test-gitea-sinks.js — port of test-gitlab-sinks.js

## Key Design Decisions
- full_name/project_html_url written to ## Sink block by sink-pr, read by sink-merge
- readProjectInfo falls back to discoverProject() when full_name missing
- Worktree helpers from ../../../scripts/kaola-workflow-claim
- checkRepoSquashEnabled uses === false (not !== true) — absent/null is permissive
- No --root CLI flag; subprocess tests use cwd
- sink-fallback tests NOT ported (no Gitea claim.js yet)

## Validate Commands
- Task 2: node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
- Task 5: node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js

See full blueprint in architect output.
