# TDD Task 5 - Create test-gitea-sinks.js

## Created File
plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js

## RED Evidence
node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
→ Error: Cannot find module './kaola-gitea-workflow-sink-pr' (before file existed)

## GREEN Evidence
node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
→ Gitea sink tests passed (exit 0)

## Coverage
- PR reuse and create (sink-pr)
- mergePullRequest opts verification
- routePullRequestState
- closeLinkedIssue gate (final validation)
- runDirectMerge skipGit → {merged:true, close:{comment_id}}
- finalValidationPassed from archive fallback
- runDirectMerge succeeds after archive
- missing full_name → discoverProject fallback (NEW, required by advisor)
- full_name present → no discoverProject call (NEW, required by advisor)
- appendSummary false/true cases
- branch name leading-hyphen rejection
- classifyMergeError unit tests
- exit-2 subprocess (FORCE_FF_FAIL=3)
- exit-3 subprocess (FORCE_MERGE_IMPOSSIBLE, sink-fallback.json receipt)
- success-path subprocess (branch deleted, DEBUG_CWD written)
- exit-3-archived subprocess (no receipt, stderr mentions 'project archived')
