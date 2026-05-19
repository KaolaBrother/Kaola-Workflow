# Doc-Updater Output — Issue #89

## Files Updated

1. `.env.example` — added KAOLA_WORKFLOW_FORCE_FF_FAIL and KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE (test-only hooks)
2. `README.md` — updated env vars table with 2 new test-only hooks
3. `docs/api.md` — added merge sink contract section, test hooks env vars section, module exports section
4. `CHANGELOG.md` — added [Unreleased] entry for issue #89

## Key updates
- Test hooks marked DEV/TEST ONLY throughout
- classifyMergeError export documented for both GitHub and GitLab editions
- getCoordRoot export from GitLab claim.js documented
- Exit codes 2 and 3 confirmed in sync with phase6 command docs
- KAOLA_WORKFLOW_OFFLINE and KAOLA_WORKFLOW_DEBUG_CWD documented in docs/api.md
