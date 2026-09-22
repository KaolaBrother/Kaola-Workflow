# Documentation docking — bundle-1089 (#1089), candidate cab0dbbc

Checked against AGENTS.md's documentation checklist (diff f8b7dedb..cab0dbbc):

- README.md — updated (ea62b1c9): mission ledger replaces Mission List in overview, mermaid, layout tree (`.ledger/issue-<N>.jsonl`), format paragraph.
- docs/api.md — updated (ea62b1c9, fee248ff): kernel exports (LEDGER_*, ledgerPath, validateLedger, serializeLedger), claim exports, claim envelope `ledger_path`/`ledger_finding`, archive `ledger` result, `closure_receipt.mission_ledger`, goal declaration `source: env|ledger|null`, retired `MISSION_LIST_FILE`/`parseGoal`/`compareLedgers`.
- CHANGELOG.md [Unreleased] — updated: Changed (ledger contract) + Removed (mission-list.md and mirror machinery); fee248ff adds `closure_receipt.mission_ledger`.
- ADR — docs/decisions/0027-the-mission-ledger.md added; 0017 carries a supersession note for its carrier section.
- Architecture/contract docs — docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/README.md index, edition docs (cursor/devin/droid/dsh/opencode), docs/task-quality.md updated.
- Global contract — templates/global/kaola-workflow-global.md Mission Ledger section.
- AGENTS.md — durable-state sentence names `kaola-workflow/.ledger/issue-<N>.jsonl`.
- Public-interface comments — claim.js / adaptive-schema.js ledger functions carry #1089 comments.
- Examples — README/api examples use the real JSONL shape (validated by test-issue-1089-mission-ledger).

No fix needed at finalize; no doc edit after the candidate was frozen.

DOCKED
