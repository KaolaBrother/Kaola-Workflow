# Advisor Plan Gate Output — Issue 112

## Blueprint gaps to close

1. setupRealRepo + tempRoot: must be COPIED verbatim into test-gitea-sinks.js from test-gitlab-sinks.js.
   They are not imports — they must exist as local helpers in the new test file.

2. readProjectInfo fallback: wrap forge.discoverProject() in try/catch returning
   { full_name: '', html_url: '' } on failure. OFFLINE mode may return empty string
   from teaExec → normalizeProject({}) → { full_name: '', html_url: '' } (safe), but
   network errors could throw. Defensive wrap is required.

3. gitExec injection contract: skipMetadataCommit defaults to true when options.gitExec
   is passed. Must be explicit in task description so developer doesn't "fix" the coupling.

4. runDirectMerge({ skipGit: true }) return shape: must return
   { merged: true, close: <closeLinkedIssue result> } — match GitLab sink-merge.js exactly.

## Sound
- Build sequence, checkRepoSquashEnabled === false, sink-fallback out-of-scope, no --root flag, source_branch field all confirmed correct.
