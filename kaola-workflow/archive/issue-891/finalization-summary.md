## Validation

classification: chains_unverified
green: false
mode: chain-receipt

no chain receipt at /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-891/kaola-workflow/issue-891/.cache/chain-receipt.json — run kaola-workflow-run-chains.js after the LAST commit so HEAD is covered; prose "all four chains green" is not evidence

No chain receipt found. Run kaola-workflow-run-chains.js after the last commit so HEAD is covered.

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- install-kimi.sh
- install-opencode.sh
- install.sh
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- scripts/kaola-workflow-classifier.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-bundle-claim.js
- scripts/test-bundle-state.js
- scripts/test-claim-hardening.js
- scripts/test-forge-bundle-lane.js
- scripts/test-install-adaptive-config.js
- scripts/test-install-model-rendering.js
- scripts/test-kernel-conformance.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-workflow-contracts.js

## Orchestrator verdict on the chain-receipt finding

The finding is a **receipt-location/HEAD-binding report, not evidence of untested code.** Owned and
resolved here rather than waived.

All four chains ran green and **unwaived**, serially and offline, at commit `d05421b4`:
claude exit 0 (222s), codex exit 0 (6s), gitlab exit 0 (59s), gitea exit 0 (57s);
`scope.chains = ["claude","codex","gitlab","gitea"]`, no `accepted_red`, `workTreeHash: clean`.
The receipt landed at the repository-root `.cache/chain-receipt.json` because the run carried no
`--project` context, which is the path finalize probed and did not find.

Only two commits follow that receipt — `d4f63794` (the mission list) and `f50d0b2c` (finalize's own
`chore: archive issue-891`) — and between them they touch exactly three run-record files inside
`kaola-workflow/issue-891/`. The instrument for that question answers it directly:

    computeCodeTreeHash(root, 'issue-891') at HEAD = 027c34ff5f04dd9ceab777522375707b7916a547ef58adf41433bc60ae2e6b2a
    receipt codeTreeHash                           = 027c34ff5f04dd9ceab777522375707b7916a547ef58adf41433bc60ae2e6b2a

Byte-identical, so the receipt covers the code at HEAD exactly.

Additional verification outside the chains, because the fast gate samples the walkthrough at a
rotating 1/12 shard and a sampled green is not a verified suite:

- `simulate-workflow-walkthrough.js` at **full scope: 183/183, exit 0**.
- The two additive edition suites, which are absent from `npm test`: opencode 490 assertions,
  kimi 505 assertions, both green.
- Behavioural proof that the removed gate is gone rather than defaulted-off, in a hermetic sandbox
  with **no `~/.config` present at all**: an exact file-path overlap between two claimed projects now
  returns `{"verdict":"green"}` and the run creates no config file. The kept refusals still fire —
  already-claimed → exit 2, open `depends-on:#55` → `blocked`, closed issue → `red`.
- Both changed test sites are mutation-proven, with byte-identical restores verified after each.

## Sink Findings

post_rebase_tests: skipped
