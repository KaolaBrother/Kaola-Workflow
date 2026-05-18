# Phase 2 - Ideation: issue-91

## Approaches Evaluated

### Option A: Static validator-only assertions

Add assertions that the skill docs mention `delegation_policy` and that
advisor/finalize rows keep `invoked`.

Pros: smallest patch, easy to validate.

Cons: does not actually read workflow state or validate a phase ledger against
policy; weak fit for acceptance criterion 1.

Risk: future artifacts can still contradict `delegation_policy:` undetected.

Complexity: low.

What not to build: no runtime phase-artifact parser.

### Option B: Repair-state post-phase check plus validator fixtures

Add a policy helper where repair-state already parses phase compliance ledgers,
then assert helper behavior from Codex and GitLab validators with synthetic
state and phase content.

Pros: validates real ledger semantics, blocks unsafe phase-boundary routing,
keeps tests deterministic, and preserves non-role `invoked` rows.

Cons: touches both GitHub/Codex and GitLab repair-state paths.

Risk: over-strict matching could fail legitimate `N/A` delegable rows; handle
that explicitly.

Complexity: moderate.

What not to build: runtime probing for subagent availability.

### Option C: Convert every compliance row to typed delegation vocabulary

Make advisor and finalize non-doc rows use `subagent-invoked` or fallback
statuses.

Pros: uniform surface vocabulary.

Cons: semantically wrong for non-Codex-role workflow gates and broader than the
issue asks.

Risk: hides the distinction that acceptance criterion 3 wants preserved or
explained.

Complexity: moderate to high because examples and commands would need broader
updates.

What not to build: a global status migration.

## Advisor Findings

The advisor gate selected Option B. Static checks alone are too weak, while a
blanket vocabulary migration conflates non-role workflow gates with Codex role
delegation. The helper should ignore intentional non-role `invoked` rows and
allow delegable rows to be `N/A` only with evidence or skip reason.

## Selected Approach

Implement Option B:

- Add delegation-policy compliance helpers to Codex repair-state and GitLab
  repair-state.
- Preserve `delegation_policy:` when repair-state rewrites state.
- Add validator fixtures that call the helpers against synthetic
  `workflow-state.md` and phase artifact content.
- Update next-skill Routing text to extract/reassign `delegation_policy:`.
- Add comments near advisor/finalize non-doc compliance tables and validator
  assertions proving plain `invoked` is intentional for non-Codex-role gates.

## Out of Scope

- Probe-based subagent availability detection.
- Machine-readable runtime delegation enforcement inside Codex.
- Changes to `validate-workflow-contracts.js`.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | local-fallback-tool-unavailable | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
