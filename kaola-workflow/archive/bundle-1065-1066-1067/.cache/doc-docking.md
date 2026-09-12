# Documentation docking — bundle-1065-1066-1067

verdict: DOCKED
candidate: a153c215ec5cdb3c03814222e161eba9155fd330

## Checked files

- `README.md` — updated: same-name archive reuse (#1067) and dispatch-evidence limits (#1065) with a link to the Devin edition evidence section.
- `docs/api.md` — updated: "Same-name archive resolution" section (#1067) and verbatim command installation without placeholder substitution (#1066).
- `CHANGELOG.md` — updated under `[Unreleased]`: Changed (#1066, #1065 including the live-schema Devin route) and Fixed (#1067). No version bump; no release requested.
- `docs/architecture.md` — updated: project-name reuse and current-transaction identity (#1067).
- `docs/devin-edition.md` — updated: "Dispatch and model ownership" states the live schema owns the route, the measured Fusion `sidekick` event, unknown child model, and that narrated replies do not establish a dispatch (#1065).
- `docs/runtime-capabilities.md` — updated: Devin rows describe live-schema native dispatch (profile routes or Fusion `sidekick`) instead of `run_subagent`-only wording; consistent with `templates/agents/runtime-capabilities.json` `native_routes` at a153c215.
- `docs/README.md` — updated: Devin edition index entry reads "live-schema vendor-harness dispatch".
- `docs/decisions/` — no-impact: no new design; ADR 0017 (Mission List) and ADR 0025 (native-only runtimes) remain the records of design. No new run-record field, gate, or name scheme was introduced.
- Public-interface comments — `mirrorFinalizationArtifacts`, `resolveFinalizeAuthority`, `sinkPreflight`, `resolveSinkReceiptPath`, `resolveRunRecordDir`, `resolveScope`, `partitionDriftByScope` carry their identity semantics in the canonical script and the three forge ports (edition-sync parity verified in the chain preamble).
- `templates/routing/` — no-impact: no skeleton or slot changed; `generate-routing-surfaces.js --check` byte-matches 24 surfaces.
- `templates/agents/runtime-capabilities.json` — changed (Devin `native_routes` wording); `generate-agent-profiles.js --check` current; installed carriers converge on the next `install-all.sh --yes`.

## Evidence

- Chain receipt: `kaola-workflow/bundle-1065-1066-1067/.cache/chain-receipt.json` (`headSha` a153c215, `workTreeHash: clean`, scope `all-four`, 24 changed files, all chains exit 0).
- `git diff 2b1af448 a153c215 --stat`: 24 files, 679 insertions, 174 deletions.
