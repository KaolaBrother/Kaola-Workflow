# Code Explorer Notes - issue-91

Status: local-fallback-tool-unavailable

The named workflow role `code-explorer` is not available as a callable Codex
subagent role in this session, so this read-only exploration was performed
locally under `delegation_policy: tool-unavailable`.

## Issue

GitHub issue #91 is open:
`Enh: policy-ledger cross-check - enforce delegation_policy against per-step compliance ledger`.

Acceptance criteria:

1. Codex contract validator and GitLab equivalent must gain an assertion or
   post-phase check that reads `delegation_policy:` from `workflow-state.md`
   when present and verifies phase compliance ledgers are consistent with it.
2. `kaola-workflow-next/SKILL.md` Routing must explicitly list
   `delegation_policy:` as a field to extract and reassign on resume, alongside
   `next_skill` and `phase`.
3. Advisor gate rows and finalize non-doc rows must either adopt delegation
   vocabulary or have validator assertions that `invoked` is intentional for
   non-Codex-role steps, with a comment explaining the distinction.

Out of scope:

- Probe-based subagent availability detection.
- Runtime-level Codex delegation enforcement.
- Changes to `validate-workflow-contracts.js`, the byte-sync Claude pair.

## Files Inspected

- `scripts/validate-kaola-workflow-contracts.js`
  - Codex-only static validator.
  - Already checks issue #77 typed vocabulary across Codex phase skills.
  - Does not currently exercise any actual workflow-state/phase-artifact
    policy cross-check.
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
  - GitLab-specific Codex validator.
  - Mirrors issue #77 vocabulary checks for GitLab skills.
  - Has no delegation-policy fixture or assertion yet.
- `scripts/kaola-workflow-repair-state.js`
  - Parses `## Required Agent Compliance` via `complianceRows()`.
  - Blocks phase-boundary routing when `unresolvedCompliance()` reports pending,
    missing, or evidence-less rows.
  - Reconstructs state and currently preserves only `## Sink`, not the scalar
    `delegation_policy:` field.
- `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`
  - Byte-sync pair with `scripts/kaola-workflow-repair-state.js`; must stay
    identical because `scripts/validate-script-sync.js` checks it.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
  - Similar route reconstruction for GitLab, but currently lacks compliance
    gate parsing.
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
  - Routing section says to read state and use repaired state but does not
    explicitly list `delegation_policy:` as a resume field to extract/reassign.
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
  - Same gap for GitLab.
- `plugins/kaola-workflow/skills/kaola-workflow-ideation/SKILL.md`
  - Advisor row is `invoked`; no explanatory comment distinguishing it from
    Codex role delegation rows.
- `plugins/kaola-workflow/skills/kaola-workflow-plan/SKILL.md`
  - Advisor row is `invoked`; no explanatory comment.
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
  - Non-doc rows use `invoked`; no explanatory comment.
- GitLab equivalents of the three skills have the same pattern.

## Test Patterns

- `npm run test:kaola-workflow:codex`
  - Runs script sync, `scripts/validate-kaola-workflow-contracts.js`, and the
    Codex walkthrough simulator.
- `npm run test:kaola-workflow:gitlab`
  - Runs vendored-agent validation, GitLab contract validation, and GitLab
    walkthrough simulations.
- `npm test`
  - Runs Claude and Codex suites, but the issue explicitly excludes changing
    `validate-workflow-contracts.js`.

## Key Implementation Pattern

The lowest-risk post-phase enforcement point is `kaola-workflow-repair-state.js`,
because it already parses compliance ledgers and blocks unsafe phase-boundary
routing. Validators can then assert the helper behavior with synthetic
`workflow-state.md` and phase artifact content without depending on live active
workflow folders.
