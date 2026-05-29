security-reviewer: N/A

## File-Risk Scan

Modified files:
- scripts/kaola-workflow-closure-audit.js — existing external CLI calls (gh); change removes a line, no new calls
- plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js — same (byte-identical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js — existing glab CLI calls; same removal
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js — existing tea CLI calls; same removal
- scripts/simulate-workflow-walkthrough.js — test only; disk I/O in temp dir, no auth/secrets/payments
- plugins/.../test-*.js — test only; same
- CHANGELOG.md — documentation only

## Determination

The change is a single-line deletion that removes a code path. It introduces:
- No new external API calls
- No new filesystem operations beyond pre-existing test tmpdir writes
- No new user input handling
- No new secrets, auth, or payment flows
- No new network endpoints

Security posture is strictly reduced (fewer remote CLI invocations). Security review not required.
