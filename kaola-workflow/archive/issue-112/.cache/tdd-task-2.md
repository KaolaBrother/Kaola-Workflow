# TDD Task 2 - Add squash-gate tests to test-gitea-forge-helpers.js

## Modified File
plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js

## RED Evidence
Test assertions for forge.checkRepoSquashEnabled written before implementation existed

## GREEN Evidence
node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
→ Gitea forge helper tests passed (exit 0)

## Tests Added
1. checkRepoSquashEnabled with allow_squash_merge:true → no throw
2. checkRepoSquashEnabled with allow_squash_merge:false → throws /allow_squash_merge=false/
3. checkRepoSquashEnabled with absent allow_squash_merge → permissive (no throw)
4. mergePullRequest with squash:true and allow_squash_merge:false → throws
