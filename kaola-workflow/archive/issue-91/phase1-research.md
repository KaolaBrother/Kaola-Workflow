# Phase 1 - Research: issue-91

## Deliverable

Add policy-ledger validation so Codex and GitLab workflow checks can detect
phase artifacts whose `Required Agent Compliance` rows contradict
`delegation_policy:` in `workflow-state.md`.

## Why

After issue #77 introduced typed delegation acknowledgement vocabulary, the
workflow still has no cross-check that a resumed session is using ledger rows
consistent with the policy selected at startup. This can hide incorrect local
fallbacks under a `delegate` policy and can blur the intended distinction
between Codex role delegation rows and non-role workflow gates.

## Affected Area

- `scripts/validate-kaola-workflow-contracts.js`
- `scripts/kaola-workflow-repair-state.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- Advisor/finalize skill docs that use intentional plain `invoked` rows.

## Key Patterns Found

1. `scripts/kaola-workflow-repair-state.js` parses `## Required Agent Compliance`
   via `complianceRows()` and blocks boundary routing through
   `unresolvedCompliance()`.
2. `scripts/kaola-workflow-repair-state.js` preserves `## Sink` during repair
   but currently drops scalar `delegation_policy:` if state is reconstructed.
3. `scripts/validate-kaola-workflow-contracts.js` is the Codex-only validator
   and is allowed to add Codex-specific assertions.
4. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
   is the GitLab equivalent for Codex plugin contracts.
5. `scripts/validate-script-sync.js` requires root shared scripts and
   `plugins/kaola-workflow/scripts/*` shared mirrors to stay byte-identical.
6. Advisor rows in ideation/plan and finalize non-doc rows currently use plain
   `invoked`, which should remain intentional for non-Codex-role gates.

## Test Patterns

- Framework: Node.js assertion scripts and npm scripts.
- Location: `scripts/validate-kaola-workflow-contracts.js`,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`.
- Structure: add deterministic contract assertions/fixtures to validators, then
  run `npm run test:kaola-workflow:codex` and
  `npm run test:kaola-workflow:gitlab`.

## External Docs

None. This is internal workflow behavior.

## Completeness Score

9/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | local-fallback-tool-unavailable | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | No external behavior or API dependency. |
