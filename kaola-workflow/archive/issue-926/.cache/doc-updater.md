# Issue 926 Documentation Audit

verdict: DOCKED

The audit used the issue statement, the exact Git diff, generated-surface output, the candidate-bound
chain receipt, and a real explicit `--doctor --json` invocation as ground truth.

- `README.md` now names install/upgrade as the readiness boundary and `--doctor` as explicit only.
- `docs/api.md` records both the authoritative installer transaction and the diagnostic-only doctor.
- `docs/architecture.md` records the install-time ownership boundary.
- `docs/conventions.md` removes the recurring gate rule and preserves genuine tool-unavailability semantics.
- `docs/decisions/D-687-01.md` qualifies its historical entry/resume premise with issue 926.
- `CHANGELOG.md` records the user-visible behavior under `[Unreleased]`.
- `.env.example` has no impact: no environment variable or configuration key changed.
- Roadmap prose has no behavior delta; normal issue closure owns mirror reconciliation.

No unverified API field, CLI flag, schema, enum, or example value was added.
