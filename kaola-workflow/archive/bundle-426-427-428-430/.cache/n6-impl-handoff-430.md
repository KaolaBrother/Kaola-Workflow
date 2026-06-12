evidence-binding: n6-impl-handoff-430 fd62c3abb169
non_tdd_reason: defensive guard in runHandoff — pure state-parsing coherence check; verified by regression-green four-chain suite
regression-green

## Task

Implement bundle state coherence check in `kaola-workflow-adaptive-handoff.js` (issue #430 handoff piece). After the state file is read and confirmed non-empty, add a guard that: (1) detects a set `bundle_id` field; (2) if present, verifies `issue_numbers` is also present and parses to at least one positive integer; (3) verifies the `bundle_id` matches the expected `bundle-N-M-K` format for the sorted issue list. Refuse with `plan_invalid` / `bundle_state_incoherent` on any violation. Applied identically to all four edition files (root, codex plugin twin, gitlab port, gitea port).

## Files Changed

- `scripts/kaola-workflow-adaptive-handoff.js` — added #430 bundle coherence block in `runHandoff` after the stateContent read guard, before Step 1 (validator call)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js` — byte-identical twin; same change
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js` — same change; forge edition port
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js` — same change; forge edition port

## Byte-Identity Verification

```
diff scripts/kaola-workflow-adaptive-handoff.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
```
Exit code: 0 (empty diff — byte-identical)

## Verification Commands + Results

### Baseline (before change)
Command: `npm run test:kaola-workflow:claude`
Exit code: 0
Sentinel: "Workflow walkthrough simulation passed"

### After change — four-chain sequential
Command: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`
- claude chain: exit 0 — "Workflow walkthrough simulation passed"
- codex chain: exit 0 — "Kaola-Workflow walkthrough simulation passed"
- gitlab chain: exit 0 — "GitLab workflow walkthrough simulation passed" + "GitLab Codex workflow walkthrough simulation passed"
- gitea chain: exit 0 — "Gitea Codex workflow walkthrough simulation passed"

All four chains green. No regressions.
