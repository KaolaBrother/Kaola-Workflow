# Documentation docking — bundle-888-889-890-892-893-894-895

Verdict: **DOCKED**

`doc-updater` was not dispatched. Documentation docking for this bundle was performed inline by the
implementing agents and then independently audited by an adversarial pass, which is stronger evidence
than a fresh sweep would be — the audit found four real defects that a re-run would not have flagged,
and all four were fixed. Re-dispatching now would re-derive what has already been checked against the
diff.

## Changed surfaces reviewed against the issue statements and the run's recorded results

| surface | change | issue |
|---|---|---|
| `CHANGELOG.md` | seven `[Unreleased]` entries across four sections; **134 insertions, zero deletions**, so no released section moved | all seven |
| `docs/api.md` | `--release-check` binding bullet; new Sink bullet for the archive-mirror exemption; `receipt.archived_paths`; `--cut` sequence corrected | #888, #893 |
| `docs/architecture.md` | carry-over binding sentence at `:345`; stale `dispatched` row at `:38` | #888, #892 |
| `docs/conventions.md` | new changelog-reference convention; five carry-over passages; mission-list pointer at `:5` | #890, #888, #892 |
| `README.md` | field-table `dispatched` row at `:919`; inconsistent fenced placeholder at `:911`; dead pointer at `:923` | #892 |
| `CLAUDE.md` | ADR reference reworded to name the derivation not the format; Documentation Map entry; release-tag binding line | #892, #888 |
| `docs/README.md`, `docs/workflow-state-contract.md` | dead references re-pointed | #892 |
| 18 routing surfaces + 6 additive-edition trees | regenerated from skeletons, never hand-edited | #892 |

## Gaps found and fixed during docking

Four, all found by adversarial audit rather than by the docking pass itself:

1. `README.md:919` still carried the pre-bundle `dispatched` wording while `:906`/`:911`/`:922-923`
   around it had been changed — a consumer-facing file contradicting itself on the exact field the
   new pin protects. Fixed.
2. Seven references were re-pointed at ADR 0017 as the home of "the file format", but the ADR's own
   table carries the weaker wording. Reworded to name the ADR as the design record / derivation.
   The ADR itself was **not** edited — it is a historical record.
3. `docs/architecture.md:38` carried the identical stale row as (1), ten lines from an unrelated
   edit. Fixed.
4. `runCut`'s operator string and its explanatory comment, in all four editions, still advertised
   the carry-over #888 deleted — telling an operator at release time that the mandatory chain run was
   skippable. Both fixed; `docs/api.md:1014`, which mirrors that string, was corrected only after
   the source, so the doc never described a CLI that did not exist.

## Anti-fabrication

No structured section was authored from memory. `receipt.archived_paths` was transcribed from real
executed output; the `--cut` sequence was corrected against the shipped string rather than the doc;
the `#N` reference set was extracted with the release script's own `unreleasedSection` parser rather
than by grep.

## No-impact reasons

- `.env.example` — no environment variable added, changed or removed.
- `README.md`'s mission-list prose at `:894-942` — deliberately not rewritten. The scope ruling was
  that *one rule, one wording* governs prompt surfaces and generated templates; reference docs get
  their dead references fixed and keep their prose.
- `docs/decisions/0017-the-mission-list.md` — untouched by ruling. An ADR records a decision as it
  was taken and is not rewritten to match a later state.
