# Documentation docking — issue-1075

verdict: DOCKED
candidate: 250c1fd3968d94fe9ea03aa30673393b9b52a80c

## Checked files

- `CHANGELOG.md` — updated under `[Unreleased]` → `### Fixed`: co-active sibling live claim folders are verified instead of refused; the #893 carried-byte-equal read restored.
- `docs/api.md` — updated: new sink preflight bullet after the #893 bullet listing every verification leg and the classification-only boundary.
- `README.md` — no-impact: no CLI, command, or install surface changed; the one "parallel" mention (background/parallel/resume limits) is about runtime adapters and does not contradict the new behaviour.
- `docs/architecture.md` — no-impact: the sink pipeline diagram ("preflight: pure read; names any foreign dirt") remains accurate.
- `docs/decisions/` — no-impact: no design change; ADR 0018 (sink) still describes the buckets; the new arm is a classification refinement inside bucket 3.
- Public-interface comments — `coActiveSiblingProjects` and the preflight arm carry full in-source comments in the canonical script and the three forge ports.
- `templates/`, generated command/skill surfaces, agent profiles — no-impact: untouched (`generate-routing-surfaces.js --check`, `generate-agent-profiles.js --check`, `edition-sync.js --check` all pass in the chain preamble).

## Evidence

- Chain receipt: `kaola-workflow/issue-1075/.cache/chain-receipt.json` (`headSha` 250c1fd3, `workTreeHash: clean`, scope `all-four`, all chains exit 0).
- `git diff --stat main...HEAD`: 7 files, +511/−2.
