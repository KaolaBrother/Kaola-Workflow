# Documentation Docking — issue-578

## Changed files reviewed (git diff vs origin/main)
- `scripts/sync-opencode-edition.js` — code (set-equality guard in `runCheck()`)
- `scripts/test-opencode-edition.js` — test (RED-first `A11-allowlist` assertion)
- `docs/opencode-edition.md` — doc (Hooks "Plugin allowlist guard" + Verification A11-allowlist line)
- `docs/decisions/D-578-01.md` — doc (new ADR)
- `CHANGELOG.md` — doc (`[Unreleased]` → `### Added` #578 entry)

## Documents checked vs change
| Document | Impact | Action |
|----------|--------|--------|
| `CHANGELOG.md` | yes | `[Unreleased] ### Added` entry written |
| `docs/opencode-edition.md` | yes | documents the new `--check` set-equality guarantee |
| `docs/decisions/D-578-01.md` | yes | new decision record (created) |
| `README.md` | none | no public install/CLI/feature change (opencode-internal `--check` guard) |
| `docs/api.md` | none | no API/schema/event/contract change |
| `docs/architecture.md` | none | no structural change |
| `.env.example` | none | no new environment variables |
| `docs/conventions.md` | none | convention is opencode-edition-internal; captured in the ADR |

## Gaps found and fixed
- ADR (`docs/decisions/D-578-01.md`) test-shape narrative idealized the test ("removes the file and
  asserts `--check` passes") — the actual test asserts clean-state set-equality in assertion (a) and
  removes the probe in a `finally` for cleanup without a post-removal `--check` pass re-run. Corrected
  via the Trivial Inline Edit Exception to describe the real assertions. (Surfaced as the n3 reviewer's
  single LOW note.)

## Verdict
DOCKED — every public/behavioral surface touched is reflected in CHANGELOG + opencode-edition.md +
D-578-01; no README/api/architecture/.env impact (opencode-internal hardening). Independently
corroborated by the n3 code-reviewer gate (Axis 4 docs-accuracy PASS).
