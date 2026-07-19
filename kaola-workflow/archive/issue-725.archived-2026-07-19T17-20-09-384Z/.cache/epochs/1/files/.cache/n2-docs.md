evidence-binding: n2-docs 500c77477a04
upstream_read: n1-receipt-diet 8176ed345212
docs_updated: CLAUDE.md (142->143 lines, one new Validation Policy bullet: run-chains.js now auto-applies the unchanged cross-edition all-four rule at finalize via diff-scoping, release stays unconditionally all-four; no provenance/issue refs added); CHANGELOG.md ([Unreleased]/### Added, one new entry "Phase B of the adaptive-only consolidation (#725)" describing B0 per-step steps[] decomposition, B1 finalize-scoped `scope` block (decision/reason/base/touchedEditionPaths/changedFileCount; claude-only+non_edition_diff vs all-four+edition_coupling|base_unresolved; bare/release path stays unscoped), B2 shared `preamble.steps[]` hoist, B3 concurrency/TMPDIR isolation unchanged (KAOLA_RUN_CHAINS_CONCURRENCY), and the honestly-measured ~20% common-case wall-clock cut (never claimed 50%)).

All factual claims (field names `scope.decision`/`scope.reason`/`scope.base`/`scope.touchedEditionPaths`/`scope.changedFileCount`, `preamble.steps[]`, per-chain `steps[]` with `{command, duration_ms, exitCode}`, decision values claude-only/all-four/explicit/no_narrowing, reason values non_edition_diff/edition_coupling/base_unresolved/diff_unresolved/claude_chain_absent/explicit_chains/mock_or_unresolved/no_project_context, the finalizeContext = (--project or --plan present) with no --chains/--mock-chain gate, and the env var KAOLA_RUN_CHAINS_CONCURRENCY auto/serial/<N>) were verified directly against the shipped code in scripts/kaola-workflow-run-chains.js (its own header doc comment block plus the classifyScope/runPreamble/dispatchChain functions), not taken on faith from n1's prose summary.

One correction to the brief's own phrasing: there is no `--serial` CLI flag on run-chains.js (grepped, none found) — serial dispatch is selected only via the KAOLA_RUN_CHAINS_CONCURRENCY env var (value "serial" or "1"). CHANGELOG/CLAUDE.md wording avoids claiming a `--serial` flag exists; it names the env var only.

No fact was left unverifiable — nothing skipped.

status: complete
