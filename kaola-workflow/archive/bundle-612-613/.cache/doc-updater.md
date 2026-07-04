evidence-binding: finalize doc-updater

Documentation update was performed by the frozen plan's own n3-docs node (doc-updater, sonnet),
not re-dispatched here — its scope determination and diff are cited as evidence per the
Validation De-Duplication principle (no relevant doc-impact facts changed since).

## Checklist walk (from CLAUDE.md's Documentation Update Checklist)

- [x] CHANGELOG.md — n3-docs added two `### Fixed` bullets under `[Unreleased]` for #612 and #613
  (see `git show 077341c264a195564489824ee80ba02f1fb83f6f -- CHANGELOG.md`), matching existing style.
- [ ] README.md — no public feature/usage/env-var change (internal test-hygiene + defensive
  production hardening only). N/A, no impact.
- [ ] API docs — no endpoint/schema/external-contract change. N/A, no impact.
- [ ] Architecture docs — no structural change (a defensive guard added to an existing internal
  function, not a new component or data-flow change). N/A, no impact.
- [ ] .env.example — no new environment variable introduced. N/A, no impact.
- [x] Inline comments — both n1-fix612 and n2-fix613's diffs carry WHY-focused comments explaining
  the fail-closed guard rationale and the SIGTERM-shim rationale (reviewed directly in n4-review).

## Rationale (carried from the frozen plan's own Plan Notes)

"No public API/architecture/interface changes in either fix (internal test hygiene + fixture
isolation only) — CHANGELOG entry under [Unreleased] is sufficient; no ADR/decision record
warranted for either fix (narrow test-only corrections, not architecture decisions), no
docs/api.md or docs/architecture.md changes needed." This determination was made at planning time
and re-confirmed true after the mid-run scope widening (the widened #612 fix is still an internal
defensive hardening of an existing function's write-guard, not a new public surface).

verdict: no further documentation impact beyond n3-docs's CHANGELOG entry.
