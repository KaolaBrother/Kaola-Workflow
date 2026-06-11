evidence-binding: n5-docs 3a4df3662693

## Node n5-docs — CHANGELOG + ADR 0009

### Files written

1. `CHANGELOG.md` — prepended a `### Fixed` block under `## [Unreleased]` with three
   bullet entries covering #415 and #416 A/B.

2. `docs/decisions/0009-freeze-wall-absolute-path-and-finalize-probe-classification.md`
   — new ADR following the established template (Date / Status / Issues / Related /
   Context / Decision / Consequences).

### CHANGELOG entries added

Under `## [Unreleased] > ### Fixed`:

- **plan-validator: refuse absolute-path and drive-letter write-set tokens at freeze
  (typed reason: `absolute_path`) — guaranteed `write_set_overflow` at barrier
  prevented (#415).**
  Explains: tokens such as `/abs/path` and `C:src/app.js` were accepted at freeze but
  always failed the per-node barrier with `write_set_overflow` because the barrier
  resolves repo-relative paths only. Added a pre-grammar check that recognises both
  forms and emits a typed `{ result:'refuse', reason:'absolute_path' }` refusal.

- **plan-validator: correct `barrier_base_mismatch` recovery hint at both sites to
  steer toward `--drop-base` + `--record-base` or ref-restore; adds
  laundering-warning (#416 Part A).**
  Explains: both hint sites previously said "re-run `--record-base`", which cannot
  converge because the idempotent-reuse branch returns early when a base file already
  exists. Corrected to `--drop-base` then `--record-base`, or ref-restore; added
  explicit laundering-warning.

- **claim: exclude `skipped_offline` from `closePendingFinalize`; surface
  `probe_degraded` in receipt — forge-outage probe failure no longer silently
  downgrades `remote-members-closed` invariant (#416 Part B).**
  Explains: a forge-outage probe recorded `'skipped_offline'` and `closePendingFinalize`
  counted it as `close_pending`, satisfying the `remote-members-closed` invariant under
  false pretences. `'skipped_offline'` is now excluded from that bucket; receipt gains
  `probe_degraded: true` on degraded runs.

### ADR 0009 summary

- **Title:** Freeze-wall absolute-path refusal and finalize probe-classification
  correction
- **Status:** Accepted
- **Issues:** #415, #416
- **Context sections:** Three bugs — (1) absolute-path tokens freeze but fail barrier,
  (2) non-converging `barrier_base_mismatch` hint, (3) `skipped_offline` misclassified
  as `close_pending`.
- **Decision sections:** (1) pre-grammar `absolute_path` typed refuse at freeze;
  (2) corrected two-site hint + laundering-warning; (3) exclude `skipped_offline` from
  `closePendingFinalize` + `probe_degraded` field in receipt.
- **Consequences sections:** per-decision impact on operators, backward-compatibility
  notes, and observable improvements.

### Write-set compliance

Only the two declared files were written:
- `CHANGELOG.md`
- `docs/decisions/0009-freeze-wall-absolute-path-and-finalize-probe-classification.md`
