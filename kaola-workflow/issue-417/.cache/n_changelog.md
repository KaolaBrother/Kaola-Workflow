b8e05a5fd36c
evidence-binding: n_changelog b8e05a5fd36c

## Summary of CHANGELOG.md changes

Three targeted edits applied to CHANGELOG.md in the `## [5.15.0]` section:

### (a) Backfill 91d9e5e — new `### Fixed` entry added under `## [5.15.0]`

Added after the existing `### Fixed` entries (after #393a/#394/#395/#396/#397/#398/#403 entry) and before `### Changed`:

- **adaptive/validator: freeze hardening — #388 round-2 write-set refusal shapes, #389 atomic freeze write, #390 point-of-use `model_invalid` gate, #385 baseline-freshness `barrier-open-<id>` token + `stale:head_advanced` warning (#385, #388, #389, #390).**

Covers: round-2 write-set refusal shapes (#388), atomic freeze write for plan_hash idempotency (#389), point-of-use model_invalid gate (#390), and barrier-open-<id> baseline-freshness token with stale:head_advanced warning (#385). References commit 91d9e5e. No close-keywords used.

### (b) #401 Part 2 — two changes

1. Amended existing `#401 Parts 1 + 3` entry (line 56): changed "Part 2 — promoting the plan-validator into edition-sync generation — is deferred behind #404/#406's in-flight plan-validator edits" to past-tense "Part 2 — promoting the plan-validator into edition-sync generation — shipped (see `## [5.15.0]`)".

2. Added new `### Added` entry for #401 Part 2 (after the Parts 1+3 bullet, before `### Fixed`):

- **editions/adaptive: plan-validator promoted into `GENERATED_AGGREGATORS` — forge ports now regenerated via `npm run sync:editions` (#401 Part 2).**

References commit 0c6e314. No close-keywords used.

### (c) "Prose x4" -> "Prose x6"

In the `#383, #384, #385, #386, #387, #391, #392, #403` entry under `### Fixed`, changed:

  "Prose x4 (claude command + codex SKILL + gitlab/gitea commands) instruct..."

to:

  "Prose x6 (claude command + codex SKILL + gitlab/gitea commands + the two forge-codex plan-run SKILLs carry the nonce/evidence-binding prose — x4 is the documented #400 symptom) instruct..."

docs: complete
