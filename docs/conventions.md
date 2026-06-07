# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.

## Subagent Seam Rule (issue #277)

The lean-orchestrator boundary is enforced through role-profile placement, not agent willpower.

- **Procedure lives in agent profiles.** The complete Phase-6 finalize procedure (scripts, bookkeeping, archive, roadmap regen) lives solely in the `contractor` agent profile. The claim + author + adaptive-handoff procedure lives solely in the `workflow-planner` profile. Orchestrator command files (`phase6.md`, `kaola-workflow-adapt.md`) keep only thin dispatch handles — they invoke the contractor or planner subagent and wait for their result; they do not duplicate bookkeeping inline.
- **Main runs dispatch handles, the per-node loop, and the sink.** The main Opus session dispatches subagents and judges their output. It also owns the adaptive per-node lifecycle transactions (`kaola-workflow-adaptive-node.js`, main-direct by design) and the Phase-6 sink (merge/PR + issue close). These two are explicitly out of attestation scope.
- **Script-side enforcement.** `validate-workflow-contracts.js` text-locks the contractor dispatch handle on all four editions. A contractor-reference removal from an orchestrator command file fails the contract gate.

## Release

- Before merging a version bump, create the matching local git tag (`git tag kaola-workflow--v<version> <sha>`); `npm test` enforces the tag exists (unless `KAOLA_WORKFLOW_OFFLINE=1`).
