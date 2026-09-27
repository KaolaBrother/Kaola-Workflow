# Documentation docking — issue-1101

Checked against AGENTS.md's documentation checklist (README, API docs, CHANGELOG [Unreleased],
architecture/ADR, public-interface comments, docs index), at the rebased candidate on origin/main d70173e2.

| File | Result |
|---|---|
| README.md | updated: native-only dispatch; no Kaola role profiles on any runtime |
| docs/api.md | updated: runtime-adapter-facts.js, retired-agents module, Codex installer retirement contract (hooks.state tables, kept record), exports corrected |
| CHANGELOG.md [Unreleased] | updated: Removed/Changed/Fixed entries for #1101, kept beside #1098's entries after the rebase |
| docs/decisions/0029-native-subagents-only.md | new ADR; ADR 0025 marked superseded |
| docs/README.md | index links ADR 0029, 0025 marked historical |
| docs/architecture.md, docs/runtime-capabilities.md, docs/conventions.md, docs/workflow-state-contract.md | updated to the native-only rule |
| docs/installation.md | upgrade section: proof-based retirement per runtime, report lines and reasons |
| docs/agents-source.md, templates/agents/provenance.json | historical attribution kept (retired roles and earlier ECC-derived roles) |
| docs/*-edition.md, docs/prompt-size.md | updated (native routes; prompt footprint re-measured) |
| AGENTS.md | source layout / change discipline state the native-only rule |

Links: routing surfaces regenerate byte-identically (`generate-routing-surfaces --check`, 24/24);
the doc-link checks run inside the four chains of the candidate's chain receipt.

DOCKED
