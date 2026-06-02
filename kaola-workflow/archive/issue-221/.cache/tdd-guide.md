# Fast Executor (tdd-guide) — issue-221

## Verified WARNING strings (from real :269)
- GitLab: "Manually run: glab issue close 168"
- Gitea:  "Manually run: tea issues close 168"

## Code added (2 forge test files only)
- test-gitlab-sinks.js: new block (before exit-3-archived block) — setupRealRepoWithBareRemote + mock CLI exits 1 on `issue close` (checked first), success JSON on `issue update`/`api`; asserts status 0, stderr includes glab manual-close WARNING, closure_receipt.remote_issue_closed='failed', closure_receipt.claim_label_removed='removed'. KAOLA_GLAB_MOCK_SCRIPT env.
- test-gitea-sinks.js: analogous Test 17c (reuses module-level sinkScript const) — mock exits 1 on `issues close`, success on `issues edit`/`api`; tea manual-close WARNING. KAOLA_TEA_MOCK_SCRIPT env.

## RED→GREEN proof
- GREEN: both forge suites pass; "close-fail warning regression test passed" printed for each.
- RED: temporarily set remoteIssueClosed='failed'→'closed' in gitlab sink-merge :269 catch → new test FAILED: `'closed' !== 'failed'` (ERR_ASSERTION). git checkout -- reverted → GREEN again. Proves the test guards the failure behavior.

## Tree
Only the 2 forge test files modified (M). Design doc + issue-221 scaffolding untracked (expected).
