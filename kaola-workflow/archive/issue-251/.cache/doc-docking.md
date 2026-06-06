# Documentation Docking — issue #251

## Changed files reviewed (git diff vs origin/main)
- scripts/kaola-workflow-adaptive-schema.js (+3 plugin copies) — parseNodeVerdict + verdict vocab
- scripts/kaola-workflow-plan-validator.js (+3 copies) — verifyVerdictBlock + --verdict-check
- scripts/kaola-workflow-commit-node.js (+3 copies) — verdictCheck wiring
- agents/{code-reviewer,security-reviewer,adversarial-verifier}.md (+2 higher profiles) — verdict emission
- commands/kaola-workflow-phase6.md (+gitea+gitlab) — --verdict-check merge gate
- commands/kaola-workflow-plan-run.md, claude SKILL, +gitea+gitlab — Part A doc-honesty
- scripts/simulate-workflow-walkthrough.js — testAdaptiveVerdictCheck
- CHANGELOG.md — [Unreleased] entry

## Documents checked
- CHANGELOG.md — UPDATED ([Unreleased] entry added). ✓
- plan-run command + SKILL (×4) — UPDATED in-band (Part A is itself the doc-honesty deliverable). ✓
- Agent docs (5) — UPDATED with the verdict-emission contract. ✓
- README.md — no impact (no install/usage surface change; --verdict-check is an internal adaptive gate). Skip (no-impact).
- .env.example — no new env vars. Skip (no-impact).
- docs/conventions.md, docs/workflow-state-contract.md — no impact. Skip (no-impact).

## Gaps found
- docs/api.md and docs/architecture.md document the `--gate-verify` validator subcommand and would gain
  a `--verdict-check` sibling entry for full parity. This is **deliberately deferred**: it is NOT in
  issue #251's acceptance criteria (Part A scopes the doc work to the three plan-run claims), it is NOT
  validator-forced, and neither file is in any frozen node write set (editing them would fall outside the
  plan's union allowlist). Recorded as a follow-up, not a docking blocker. (The plan's `## Nodes` note
  states this scope boundary explicitly; no doc-updater node was pre-allocated.)

## Follow-ups (non-blocking)
- F1: add a `--verdict-check` entry to docs/api.md + docs/architecture.md (parity with --gate-verify).
- F2: repair-state.js resume-display parity — surface a pending `--verdict-check` gate alongside
  `--gate-verify` in the non-blocking resume `pendingGates` view (4 copies; observability-only).
- F3 (review LOW): add a combineResults-layer test in test-commit-node.js for a present-and-failing
  whole-plan verdictCheck (currently covered at the validator layer by testAdaptiveVerdictCheck).
- F4 (review LOW): adversarial-verifier.md documents only the fan-out cache path; a single/sequence
  verifier fails-closed (over-block, never leak) — document the .cache/{node-id}.md path if that shape
  is ever exercised.

## Final verdict
DOCKED — every in-scope public-behavior change is reflected in CHANGELOG + the in-band doc-honesty
rewrite + the agent contracts. The api.md/architecture.md `--verdict-check` parity is an explicit,
recorded out-of-AC/out-of-write-set deferral (F1), not an unaccounted gap.
