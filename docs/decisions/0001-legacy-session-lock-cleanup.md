# 1. Legacy session and lock cleanup: no durable tooling

Date: 2026-05-28
Status: Accepted
Issue: #173 (follow-up from #169)

## Context

Earlier worktree-coordination work left transitional artifacts under:

- `.git/kaola-workflow/.sessions/*.json` (and `*.startup.json`)
- `.git/kaola-workflow/.locks/*.lock`

These paths predate the current claim model. Current scripts no longer rely on
them as a durable contract; the only remaining references are in
`scripts/validate-kaola-workflow-contracts.js` and
`scripts/validate-workflow-contracts.js`, both of which use `assertConcept` to
pin them as **legacy or transitional**, not as live contracts.

Survey of the working checkout shows `.git/kaola-workflow/.sessions/` is empty
in normal use. Stale files only appear when a session is killed mid-flight or
when a simulate-test fails to tear down (a known minor isolation gap, tracked
separately).

## Decision

Drop. We do **not** add cleanup tooling.

- No audit script.
- No cleanup-on-startup logic.
- If files ever accumulate, manual `rm -rf .git/kaola-workflow/.sessions .git/kaola-workflow/.locks` is sufficient.

The validator `assertConcept` entries stay as-is: they document the legacy
status, which is exactly the contract we want to preserve.

## Consequences

Positive:
- No new code paths, no new failure modes, no tests to maintain.
- The transitional status is documented in the validator and now in an ADR.

Negative:
- A developer encountering stale files must know to remove them manually. This
  ADR serves as the discoverable explanation.

## Alternatives considered

- **B. Audit-only script** — rejected: adds maintenance for a problem that
  occurs rarely and is trivial to fix by hand.
- **C. Cleanup-on-startup** — rejected: startup paths are already busy; adding
  filesystem mutation for a non-issue risks masking real bugs (e.g., a session
  that should still exist getting wiped).
