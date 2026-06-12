evidence-binding: n7-walkthrough e9daff9e626f
non_tdd_reason: walkthrough scenarios are the behavioral test fixtures; these assert the new freeze-wall behaviors
regression-green: all four edition chains (claude/codex/gitlab/gitea) green before and after

## task
Add freeze-refusal scenarios to all 4 edition walkthrough files asserting the NEW validator behaviors from n3-validator (#425 and #431).

## non_tdd_reason
walkthrough scenarios are the behavioral test fixtures; the simulate-*-walkthrough.js files ARE the test suite. These scenarios assert the new freeze-wall behaviors (ledger_header_invalid and generated_port_split) that n3-validator implemented. Category: walkthrough scenario fixtures — direct behavioral assertions, not ceremonial RED→GREEN.

## verification_tier
regression-green

## write_set
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js

## scenarios_added

### Canonical (scripts/simulate-workflow-walkthrough.js)
1. testAdaptiveLedgerHeaderInvalid425 — asserts (a) validatePlan refuses with ledger_header_invalid on `| node | status |` header, (b) --freeze --repair normalizes to `| id | status |` and emits header_normalized:true
2. testAdaptiveGeneratedPortSplit431 — asserts (a) split plan (canonical+codex only, no forge ports) refuses with generated_port_split, (b) bundled plan (all 4 editions) passes in-grammar

### Codex (plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js)
1. testCodexLedgerHeaderInvalid425 — same ledger_header_invalid scenario via codex validator
2. testCodexGeneratedPortSplit431 — (a) codex validator is inert for generated_port_split (anchor-gated, edition-sync absent in codex tree), (b) root canonical validator fires the split-wall, (c) bundled plan passes

### GitLab (plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js)
Added inside testGitlabAdaptive: #425 ledger_header_invalid + --repair header_normalized assertion, #431 forge-inert anchor assertion (gitlab validator has editionSync=null)

### Gitea (plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js)
Added inside testGiteaAdaptive: same pattern as gitlab modulo gitea forge nouns

## verification_commands
```
node scripts/simulate-workflow-walkthrough.js --only testAdaptiveLedgerHeaderInvalid425
node scripts/simulate-workflow-walkthrough.js --only testAdaptiveGeneratedPortSplit431
npm run test:kaola-workflow:claude
npm run test:kaola-workflow:codex
npm run test:kaola-workflow:gitlab
npm run test:kaola-workflow:gitea
```

## before_result
All four chains were green before this node's changes (baseline established by n3-validator and prior nodes). Confirmed by running the walkthrough prior to implementing the new scenarios.

## after_result
All four chains green after adding the new scenarios:
- claude chain: Workflow walkthrough simulation passed (testAdaptiveLedgerHeaderInvalid425: PASSED, testAdaptiveGeneratedPortSplit431: PASSED)
- codex chain: Kaola-Workflow walkthrough simulation passed (testCodexLedgerHeaderInvalid425: PASSED, testCodexGeneratedPortSplit431: PASSED)
- gitlab chain: GitLab workflow walkthrough simulation passed (testGitlabAdaptive: PASSED — includes #425/#431 assertions)
- gitea chain: Gitea workflow walkthrough simulation passed (testGiteaAdaptive: PASSED — includes #425/#431 assertions)
