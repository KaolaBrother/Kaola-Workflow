# doc-updater — bundle-904-905-906-907-908-909-910

**Not re-dispatched at Step 4, deliberately.** The documentation pass ran EARLIER in this run, before
the chain receipt, and re-running it now would edit test-consumed paths and stale the receipt taken at
`cf40c549`. `CHANGELOG.md`, `docs/api.md` and `docs/workflow-state-contract.md` are all in
`TEST_CONSUMED_PATHS` (`kaola-workflow-validation-runner.js:16-22`), so prose must land BEFORE the
receipt, not after. That ordering was chosen at dispatch time and is the reason the receipt is valid.

Full report: `.cache/docs.md` (three passes — initial, plus two addenda as the tree moved under it).

## What was written

| file | change |
|---|---|
| `CHANGELOG.md` | 7 entries under `[Unreleased]`, one per issue. #904 leads with the migration consequence (an inherited `{command_id, required_pass_vector_id}` obligation is now unsatisfiable). #907 leads with the user-facing consequence — finalize could report success while committing nothing, including healthy files, on `--keep-worktree` linked runs. |
| `docs/api.md` | `--project` row corrected (factually wrong post-#910); record-follows-folder / hash-follows-tree paragraph; `--keep-output` usage + subsection incl. the retain-after-last-repetition note; new "Kernel path-stream decoders" section covering the new parser contract, `splitNulPaths`, `unquoteCStyle`, and the four readers deliberately NOT converted; `mismatched` correction with `uncomparable[]` as a strict subset; `archive_embedded_repos`; a thirteen-row `finalize_transaction` table; the `finalize_commit: 'unknown'` paragraph; the edition note (five-vs-six finding types). |
| `docs/workflow-state-contract.md` | three-key archive-completeness return; the crash-resume backstop now moving rather than deleting. |
| `docs/decisions/D-697-01.md` | AMENDED, dated, with the original `:57` sentence kept VERBATIM and an inline note — records the owner's opt-in carve-out for `--keep-output` without rewriting history. |
| `docs/decisions/D-579-01.md` | `:99` corrected with a dated block; D-579's own mechanism unchanged. |
| `docs/decisions/D-909-01.md` | NEW — the four unrepairable citation findings, incl. issue-891's false positive recorded as the fossil of #910. |
| `docs/decisions/D-908-01.md` | NEW — dispositions for all ten of #908's items. |

## Anti-fabrication

Every field name was read at its site in `scripts/kaola-workflow-claim.js` rather than taken from an
implementer's report — including the six finding-type names at their `recordFinalizeFinding(` call
sites, with line numbers recorded in `.cache/docs.md`. Two errors were caught this way:

- its own draft claimed the four fixed archive filenames are "required unconditionally"; measured,
  `listSourceEvidenceFiles` (`claim.js:5398-5410`) includes each only when the source holds it, and
  only `workflow-state.md` is unconditional (`:5486`). Corrected before verifying.
- the finding-type count was four-vs-five, taken from a leg-specific table; measured across editions
  it is five-vs-six. Corrected after an independent reviewer re-derived it.

`api.md:1309` was checked and needed NO change — no `module.exports` line moved in `claim.js`,
`sink-merge.js` or `run-chains.js`; only `adaptive-schema` and `validation-runner` gained exports.

## No-impact, with reasons checked

`README.md` and `docs/architecture.md` — the run-chains row, the validation-runner row, the archive
sentence and architecture's validation and sink sections all describe nothing this bundle changed.
`docs/agents-source.md` — the vendored-agent delta record, unreached. No `templates/routing/`
skeleton needed changing, so nothing was regenerated.

## Verification

`generate-routing-surfaces.js --check` exit 0, all **18** surfaces byte-match the skeleton.
`validate-workflow-contracts.js` exit 0. `validate-kaola-workflow-contracts.js` exit 0 (after the
final `sync:editions`). No CI/CD mentioned anywhere.
