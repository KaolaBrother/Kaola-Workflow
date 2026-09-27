# Documentation docking — issue-1102

Checked against AGENTS.md's documentation checklist (README, API docs, CHANGELOG [Unreleased],
architecture/ADR, public-interface comments, docs index), at the rebased candidate on origin/main 20a2b369.

| File | Result |
|---|---|
| docs/api.md | updated: `claim.js stale-worktree-check` sink-resumability pin — integration arm read, the lane arm's three outcomes (table), the unclaimed derived folders, the #694 dating, the "never pins a newer resolved run" guarantee and its exact limit, and the difference from `currentArchiveDir` |
| CHANGELOG.md [Unreleased] | updated: one Fixed entry for #1102, filed under main's existing Fixed section after the rebase onto #1098/#1101 |
| README.md | no impact: README does not describe the stale-worktree sweep or its pin |
| docs/architecture.md, docs/workflow-state-contract.md | no impact: they describe `sink-receipt.json` as the sink's resume record, which is unchanged; neither describes the stale sweep's pin |
| ADR / docs/decisions | no impact: no design decision changed; the lane arm reads existing run records (no new identity mechanism) |
| docs/README.md | no impact: no new document |
| public-interface comments | updated: `laneReceiptDirs`, `currentRun`, `unclaimedDerivedDirs` and `sinkReceiptResumable` comments in all four claim copies state the behavior; `module.exports` unchanged |

DOCKED
