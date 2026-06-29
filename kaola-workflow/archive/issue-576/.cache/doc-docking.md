# Documentation Docking — issue-576

## Changed files reviewed (git diff vs main)
21 files: 5 contract validators + opencode test (guard); 13 prompt surfaces (strip); docs/conventions.md + docs/decisions/D-576-01.md; CHANGELOG.md.

## Documents checked vs change
- **docs/conventions.md** — provenance section updated from prose-only to machine-enforced: full banlist regex, per-edition surface-placement table, banned/allowed taxonomy (incl. PR#/MR#/AC# row, placeholders, runtime vars, grey-zone labels), failure-message format. ✔ matches the guard implementation.
- **docs/decisions/D-576-01.md** — new ADR records the guard, taxonomy, allowlist + mechanical basis, per-edition placement; supersedes the "deferred" note in D-575-01. ✔ consistent with implementation + D-575-01 format.
- **CHANGELOG.md** — [Unreleased] Added entry describes guard + strip + verification + cross-edition greenness + D-576-01. ✔
- **README.md** — no impact (no feature/usage/env-var/SemVer surface changed by a lint guard). Skipped: no public-behavior/setup impact.
- **docs/architecture.md / docs/api.md** — no impact (no structural or API/schema change; the validators gained an internal check, no new external contract). Skipped: no-impact.
- **.env.example** — no impact (no new env var).
- **CLAUDE.md** — the "Keep provenance out of agent-facing prompts" rule already exists (added in #575); #576 adds the machine guard behind it, no rule-text change needed.

## Gaps found and fixed
None. Substantive docs (conventions + D-576-01) authored in n2; CHANGELOG authored at finalize.

## Verdict
DOCKED
