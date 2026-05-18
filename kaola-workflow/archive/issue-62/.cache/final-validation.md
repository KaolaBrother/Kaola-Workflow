# Phase 6 - Final Validation (issue-62)

All required test gates ran from main repo and exit 0.

## npm test (default — runs both Claude and Codex packs)

```
> kaola-workflow@3.8.0 test
> npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex

OK: 8 common scripts in sync.
Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Workflow contract validation passed
Workflow walkthrough simulation passed
OK: 8 common scripts in sync.
Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed
```

## npm run test:kaola-workflow:gitlab

```
Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow GitLab contract validation passed
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed
```

## Components verified

- `validate-script-sync.js` — byte-identity of 8 common scripts (includes the GitHub claim.js pair)
- `validate-vendored-agents.js` — 9 vendored agents at expected commit
- `validate-workflow-contracts.js` — Claude contract validator
- `validate-kaola-workflow-contracts.js` — Codex contract validator
- `validate-kaola-workflow-gitlab-contracts.js` — GitLab contract validator
- `simulate-workflow-walkthrough.js` — full Claude walkthrough + 3 new regression tests for issue-62
- `simulate-kaola-workflow-walkthrough.js` — Codex walkthrough
- `simulate-gitlab-workflow-walkthrough.js` — GitLab Claude walkthrough
- `simulate-gitlab-codex-workflow-walkthrough.js` — GitLab Codex walkthrough

All pass. No failures, no failure-ledger rows needed.
