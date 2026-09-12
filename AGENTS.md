# Kaola-Workflow Repository Instructions

Kaola-Workflow is a forge-issue-driven loop for coding agents. It records claims under
`kaola-workflow/<run>/workflow-state.md` and the run itself in
`kaola-workflow/<run>/mission-list.md`; completed runs move to `kaola-workflow/archive/`.
`docs/decisions/0017-the-mission-list.md` is the Mission List design record, and
`kaola-workflow/.roadmap/_rules.md` is the only optional local roadmap file.

## Source layout

- `scripts/kaola-workflow-claim.js` owns selection, claims, status, worktrees, finalization, archive,
  and claim release.
- `scripts/kaola-workflow-run-chains.js` runs validation chains and writes candidate-bound receipts.
- `scripts/kaola-workflow-sink-merge.js` owns the merge sink and reports the branch state it found.
- `scripts/kaola-workflow-adaptive-schema.js` contains forge-neutral constants and shared helpers.
- `scripts/simulate-workflow-walkthrough.js` is the integration walkthrough.
- `templates/routing/` is the authoring source for generated command and skill surfaces. Edit the
  skeleton or slot, then regenerate; never hand-edit a rendered surface.
- `templates/agents/behavior-contracts.json` and
  `templates/agents/runtime-capabilities.json` are the behavior and runtime-adapter authorities for
  generated role profiles.
- `templates/global/kaola-workflow-global.md` and
  `templates/global/runtime-contract-adapters.json` own the machine-global workflow contract and
  its measured runtime carriers.
- `plugins/` contains the Codex forge editions; forge mirrors are generated from the shared kernel.

## Commands and validation

- Install or refresh every supported local runtime: `./install-all.sh --yes`.
- Verify installed runtimes without mutation: `./install-all.sh --check`.
- Run the producer-selected cross-forge chains: `npm test`.
- Run all declared edition chains in parallel: `npm run test:parallel`.
- Run focused additive-runtime suites: `npm run test:kaola-workflow:editions`.
- Run the full Claude/producer chain when required: `npm run test:kaola-workflow:claude:full`.
- Run the integration walkthrough before claiming workflow behavior complete:
  `node scripts/simulate-workflow-walkthrough.js`.

There is no separate lint, typecheck, or build command: this repository is standard-library
JavaScript and shell. Run focused suites for every changed render, installer, routing, or forge
surface, then the required integration chain. A release requires the complete unwaived chain receipt
bound to the exact publication commit.

## Change discipline

- `AGENTS.md` and `CLAUDE.md` are owner-authorized, Agent-maintained content; verify the repository
  before editing them.
- Preserve unrelated work in a dirty tree. Do not overwrite generated mirrors independently.
- Tests own acceptance meaning. Production work may update only mechanical fixtures or generated
  manifests when their meaning is unchanged.
- Keep agent-facing behavior free of provenance and licensing narration; those facts belong in
  `templates/agents/provenance.json` and [docs/agents-source.md](docs/agents-source.md).
- Runtime-specific behavior may differ only where the adapter records a measured capability.
  Unknown capability fields stay unknown, and the live native schema wins.

## Documentation

For every user-visible change, update [README.md](README.md), [docs/api.md](docs/api.md),
[CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`, architecture or ADR documentation when the design
changes, and public-interface comments. [docs/README.md](docs/README.md) is the documentation index;
keep links and examples executable against the current tree.
