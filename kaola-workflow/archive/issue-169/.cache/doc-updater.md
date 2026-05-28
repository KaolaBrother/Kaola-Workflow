# Doc Updater Output — issue-169

## Files Updated
1. **CHANGELOG.md** — Added entry under `[Unreleased]`:
   - Added section: new `target_unverified` classifier verdict (with offline + no-evidence semantics, distinguishing from `target_unavailable` and `user_target_red`)
   - Added section: classifier CLI ergonomics (top-level `--issue N`, `--help` flag)
   - Changed section: `commands/workflow-next.md` + SKILL.md updates (KAOLA_VERDICT/REASONING extraction; Step 0 target-existence check; consumer-repo wording; Required Output enum)

2. **docs/api.md** — Added new subsection "Verdict: `target_unverified`" under "Startup Classifier and Remote Validation":
   - Returned when condition
   - Applies to
   - Distinct from
   - Impact
   - Root cause
   - Agent remedy

## No-Impact Files (with reasons)
- **README.md** — `target_unverified` is an internal classifier diagnostic, not user-facing CLI. No installation/usage change.
- **docs/architecture.md** — No structural change; classifier internal flow unchanged.
- **docs/conventions.md** — No coding/testing/Git/review rule change.
- **docs/workflow-state-contract.md** — No durable state contract change (workflow-state.md format unchanged).
- **.env.example** — No new env vars (`KAOLA_WORKFLOW_OFFLINE`, `KAOLA_TARGET_ISSUE` pre-existing).
- **docs/decisions/** — No ADR needed; this is a tooling refinement of an existing pattern, not a new architectural decision.
- **Inline comments** — Reasoning strings + doc prose are self-documenting; no public interface comment needed.
