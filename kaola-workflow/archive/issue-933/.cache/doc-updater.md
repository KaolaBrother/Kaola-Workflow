# doc-updater — SKIPPED, with reason

**Not dispatched.** The documentation for this change was written inline by the orchestrator,
against measured output rather than description.

The change adds two fields to a JSON envelope (`reserved_project`, `reserved_project_note`) and
alters a claim's folder-selection behaviour. Both are exactly the structured-surface class where a
delegated doc pass is most likely to invent field names, keys or example values — and every fact
documented here had to be transcribed from a driven run, not from the diff.

What was written, and what each statement is bound to:

| surface | statement | ground truth |
|---|---|---|
| `docs/api.md` | the two field names and their contents | verbatim from the emitted envelope of a driven `claim`/`startup` in all four editions |
| `docs/api.md` | reserved set is `archive` case-folded plus dot-prefixed | read off `isReservedWorkflowDirName` (`kaola-workflow-claim.js:2536`) |
| `docs/api.md` | `project`, `selected_project` and `workflow-state.md` `name:` all carry the substitute | asserted by `testClaimNeverAdoptsReservedDir933` and legs A–E |
| `README.md` | both doors, and that the second needs nobody to type the name | measured as R1/R2 in `repro-933.md` |
| `CHANGELOG.md` | the defect, the ruling, and the distinction from #932 | the issue statement plus the repro |

No `--json` or `--help` schema was paraphrased anywhere, and no example number appears that was not
copied from a real run. Nothing was blocked.
