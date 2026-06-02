# Fast Planner — issue-221

## Write set (2 files, test-only)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js

## Single approach
Yes. CRITICAL: the issue's literal `withForge({closeIssue: throw})` CANNOT work — the forge sink tests spawn sink-merge as a SUBPROCESS (spawnSync), so an in-process forge stub never reaches the child. Correct approach: clone the existing online-close-cwd SUCCESS block in each forge test and change two things: (1) the mock CLI script exits 1 on the close subcommand, (2) flip assertions to the failure set.

## Forge close-failure mechanics
- closeIssue → glabExec/teaExec → execFileSync(KAOLA_*_MOCK_SCRIPT); non-zero exit throws → the :269 catch fires.
- Mock must check the CLOSE subcommand FIRST (startsWith 'issue close' / 'issues close') BEFORE the update/edit branch, so label removal (issue update/edit) still succeeds → keeps claim_label_removed==='removed' (negative control).
- setupRealRepoWithBareRemote required (sink pushes origin main before close).
- Env: GitLab KAOLA_GLAB_MOCK_SCRIPT; Gitea KAOLA_TEA_MOCK_SCRIPT. Gitea subcommands: 'issues close'/'issues edit'.

## Forge-specific WARNING assertions (verify verbatim at :269 each)
- GitLab: result.stderr.includes('Manually run: glab issue close 168')
- Gitea:  result.stderr.includes('Manually run: tea issues close 168')
- Receipt: closure_receipt.remote_issue_closed==='failed'; closure_receipt.claim_label_removed==='removed'.

## Placement
No registry — bare top-level blocks run sequentially. Add each new block right after the existing online-close-cwd block (gitlab ~after :553; gitea ~after :519). sinkScript scoping: gitlab block redeclares `const sinkScript` locally; gitea reuses the module-level const (verify at edit time).

## Acceptance
- npm run test:kaola-workflow:gitlab  (spawns test-gitlab-sinks.js)
- npm run test:kaola-workflow:gitea   (spawns test-gitea-sinks.js)
- npm test (chains all 4)
Positive signal: "close-fail warning regression test passed" line in each forge run.

## Out of scope
- No edit to kaola-*-workflow-sink-merge.js (failure branch already correct, byte-equiv to root).
- No edit to scripts/simulate-workflow-walkthrough.js (root test already exists).
- No new withForge stub; no npm-script/walkthrough/registry changes.
