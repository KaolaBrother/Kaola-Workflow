# Final Validation - issue-581

Repo kind: self-host (npm). Final validation is machine-gated on the chain receipt.

## Validation command

`KAOLA_RUN_CHAINS_TIMEOUT_MS=2400000 node scripts/kaola-workflow-run-chains.js --project issue-581`

The gated runner executes all four edition chains. The Claude chain includes
`node scripts/simulate-workflow-walkthrough.js`, so the plan's workflow walkthrough requirement is
covered inside the receipt.

## Result - all four chains GREEN

Receipt: `kaola-workflow/issue-581/.cache/chain-receipt.json`

- headSha: `d0c2ff4b81a5be224ee3d96ea616dd987c27929e`
- codeTreeHash: `bd149302e05de48bdb3e6bd3c6a0034abac4691c4a46a406ec458d15b7a67827`
- claude: exit 0
- codex: exit 0
- gitlab: exit 0
- gitea: exit 0
- accepted_red: false on all four chains
- completedAt: `2026-07-01T09:59:07.743Z`

Receipt freshness boundary: the receipt covers the implementation, command/skill guidance, profile
TOMLs, validators, README, `docs/api.md`, `docs/architecture.md`, decision record, and CHANGELOG
state present when the runner started at `2026-07-01T09:47:31.223Z`. This file,
`.cache/doc-docking.md`, `.cache/doc-updater.md`, `.cache/contractor-finalization.md`, and
`finalization-summary.md` are later workflow-finalization artifacts only.

verdict: pass
