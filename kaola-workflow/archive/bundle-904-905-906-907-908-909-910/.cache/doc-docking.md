# Documentation docking — bundle-904-905-906-907-908-909-910

**Verdict: DOCKED**

## Changed files reviewed

27 code/test files across four editions, plus 7 prose files. Full list in the finalize envelope's
`changed_paths`. Grouped by the behaviour they carry:

- `kaola-workflow-validation-runner.js` ×4 — sandbox root (#904), `--keep-output` (#905),
  `resolveRecordFolder` export (#910).
- `kaola-workflow-adaptive-schema.js` ×4 — `parsePorcelainPaths` rewrite plus `splitNulPaths` and
  `unquoteCStyle` (#907).
- `kaola-workflow-claim.js` ×4 — archive move-aside and `uncomparable[]` (#906), the swallowed-`git
  add` typed findings and Step 8a staleness (#907, R1/R2).
- `kaola-workflow-sink-merge.js` ×4 — `.git` gitlink boundary, journal glob, unbacked symlinks (#907,
  C1/C3/S1).
- `kaola-workflow-run-chains.js` ×4 — receipt placement (#910), `isEditionCouplingPath` and
  `--no-renames` (#907, R3).
- 6 test files — pins for all of the above.

## Documents checked

`README.md` · `docs/api.md` · `docs/architecture.md` · `docs/workflow-state-contract.md` ·
`docs/conventions.md` · `CHANGELOG.md` · `docs/decisions/` · `kaola-workflow/ROADMAP.md` ·
`docs/agents-source.md` · `templates/routing/` skeletons · the seven issue statements.

## Gaps found and fixed

| gap | resolution |
|---|---|
| `docs/api.md`'s `--project` row was factually wrong once #910 landed | rewritten, plus a record-follows-folder / hash-follows-tree paragraph |
| `--keep-output` undocumented | usage block + subsection, incl. that an interrupted run retains nothing and WHY that is correct |
| `mismatched` described as "different bytes" only — already inaccurate pre-bundle | corrected; `uncomparable[]` documented as a strict subset with its sentinels |
| new `finalize_transaction` fields undocumented | thirteen-row table; `finalize_commit: 'unknown'` explained as *we could not tell*, not *nothing happened* |
| `D-697-01:57` forbade persisting raw child output | amended with the owner's opt-in carve-out, original sentence kept verbatim |
| `D-579-01:99` documented the superseded parser behaviour | corrected with a dated block |
| #909's unrepairable findings had no durable record | `D-909-01` created |
| #908's ten dispositions had no durable record | `D-908-01` created |
| finding-type divergence miscounted as four-vs-five | corrected to five-vs-six after independent re-derivation |

## No-impact, with reasons

- `README.md`, `docs/architecture.md` — checked section by section; nothing they describe changed.
- `docs/conventions.md` — the three conventions it records (a guard reads what ships; a threshold
  cannot see a rule beneath its bar; specify the result not the method) were all *exercised* this run
  but none was amended, so no edit is owed. Worth noting the run produced fresh evidence for the
  third: an implementer removed an export it had added for a test's convenience once the test author
  pinned the result instead.
- `docs/agents-source.md` — vendored-agent delta record, unreached.
- `templates/routing/` — no rendered surface changed, so no skeleton edit and no regeneration.
- `kaola-workflow/ROADMAP.md` — generated mirror; closure regenerates it. Not hand-edited.
- No `.env.example` in this repo.

## Ordering note

All prose landed BEFORE the chain receipt at `cf40c549`. `CHANGELOG.md`, `docs/api.md` and
`docs/workflow-state-contract.md` are test-consumed, so a post-receipt edit would have staled the
receipt. Nothing was written to those paths after the receipt was taken.

## Anti-fabrication

No structured section was written from an agent report. Field names, counts and line numbers were
read at their sites; two draft errors were caught and corrected that way (see `.cache/doc-updater.md`).
No `BLOCK:` was raised — nothing needed a code change to be documented truthfully.
