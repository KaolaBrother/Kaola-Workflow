evidence-binding: n4-docs 03362a304e7e

<!-- summary -->
summary: n4-docs (issue #566 docs) — edited 3 files in the STRICT write set only; no code/hooks/tests touched.
- docs/architecture.md: extended the M1 SubagentStart bullet field list (`ts, agent_type, agent_id, cwd`) to include `model_planned` (always resolved from the agent manifest via resolve-agent-model.js for a known role) and `model` (runtime-supplied tier, codex CLI only; empty for Claude Code SubagentStart and opencode); surrounding Dual-root/fail-open prose left intact.
- docs/workflow-state-contract.md: extended the dispatch-log.jsonl field tuple with `model_planned`/`model` and a brief parenthetical (model_planned always from the manifest; model runtime-supplied, codex CLI only; empty otherwise); WARN-FIRST attestation pointer left intact.
- CHANGELOG.md: inserted a new `## [Unreleased]` heading (between `# Changelog` and `## [6.9.0]`) with a single proportionate `### Changed` entry (#566, LOW/additive/fail-open) describing the dual-field model capture, payload-agnostic + fail-open + backward-compatible properties, and cross-edition four-chains-green note.
