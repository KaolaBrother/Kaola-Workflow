evidence-binding: n4-finalize e32efa6f2135
Finalize node evidence:
- Updated `CHANGELOG.md` so the #582 entry no longer claims the local Codex runtime proved both explicit tiers effective.
- The changelog now states the verified fail-closed contract: descriptor mapping remains, but non-null Codex tier dispatch requires fresh child-session JSONL proof for the exact requested effort and refuses with `codex_effort_override_unavailable` when proof is missing/stale/failing.

Validation:
- `node scripts/validate-workflow-contracts.js` -> passed.
- `node scripts/validate-kaola-workflow-contracts.js` -> passed.
- `node scripts/test-route-reachability.js` -> passed (185 assertions).
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> passed.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> passed.
- `node scripts/validate-script-sync.js` -> passed.
- `git diff --check` -> passed.
