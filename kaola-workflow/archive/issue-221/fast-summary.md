# Fast Summary: issue-221

## Status
PASSED

## Scope
- Write Set: plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- Acceptance: npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea && npm test — new close-fail block asserts exit 0 + forge-specific WARNING (glab/tea) + remote_issue_closed=failed + claim_label_removed=removed (negative control)

## Plan
Port close-mid-merge FAILURE coverage into both forge sink suites. Issue's literal withForge suggestion was wrong (forge sink tests spawn a SUBPROCESS; in-process stubs don't reach the child). Correct approach: clone each file's existing online-close success block; mock CLI exits 1 on the close subcommand (checked first so label-removal still succeeds); assert the failure set. No production code change. See .cache/planner.md.

## Implementation Evidence
- Verified WARNING strings from real :269: gitlab "Manually run: glab issue close 168", gitea "Manually run: tea issues close 168".
- GREEN: npm run test:kaola-workflow:gitlab → exit 0; :gitea → exit 0 (independently re-run by orchestrator). Direct invocation prints "close-fail warning regression test passed".
- RED proof: setting remoteIssueClosed='failed'→'closed' in gitlab sink-merge :269 made the new test fail (`'closed' !== 'failed'`); reverted → GREEN. The test bites.
- git diff --stat: only the 2 forge test files (+81).

## Review
PASS (code-reviewer, opus) — 0 findings. Assertions match real catch behavior; negative control correct; hermetic temp repos; no production code touched; wired into both npm targets (execFileSync stdio:'pipe' propagates failure).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
