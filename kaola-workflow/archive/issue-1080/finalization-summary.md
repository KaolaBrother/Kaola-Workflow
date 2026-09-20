## Validation

classification: chains_stale
green: false
mode: chain-receipt
stale_kind: mixed
stale_paths_truncated: true
stale_paths:
- AGENTS.md
- CHANGELOG.md
- CLAUDE.md
- README.md
- commands/workflow-init.md
- docs/api.md
- docs/workflow-state-contract.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-run-chains.js

chain receipt codeTreeHash "78109cad7448535dd41d453a86d0f824ffce8098c7dd6cbfd3dbaa2bbcaa98bf" != current code-tree hash "6b6f8883f3ebbb96b8506d26fbef86c6e78caf003f950e6d5658124e81978d32" — code (or test-consumed prose) changed since the chains ran; regenerate the receipt

Chain receipt is stale — both code and test-consumed prose changed since the chains ran. Regenerate the receipt over HEAD.

## Changed Paths

none outside the run-state and documentation bands.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1080/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1080/finalization-summary.md
- kaola-workflow/archive/issue-1080/mission-list.md
- kaola-workflow/archive/issue-1080/verification.md
- kaola-workflow/archive/issue-1080/workflow-state.md
