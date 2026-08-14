# Documentation Docking — bundle-980-981

Verdict: **DOCKED**

Subagents were declined for this run (standing session instruction), so `doc-updater` was not
dispatched; the docking was done inline and is recorded here in its place. Nothing below is
transcribed from memory — each surface was opened and read before it was edited or ruled no-impact.

## Changed files reviewed

| file | user-visible change | docked where |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | new stderr note naming an un-landed staged journal | CHANGELOG `[Unreleased] / Fixed` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte-identical mirror of the above | same entry |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | hand-ported same change | same entry ("all four sink copies") |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | hand-ported same change | same entry |
| `install-opencode.sh` | `RETIRED_SUPPORT_SCRIPTS` + removal on the uninstall path | CHANGELOG; `docs/opencode-edition.md` |
| `install-kimi.sh` | same | CHANGELOG; `docs/kimi-edition.md` |
| `scripts/test-sink-merge.js` | test-only | n/a (tests are not a documented surface) |
| `scripts/test-opencode-edition.js` | test-only; new arm named in the edition doc | `docs/opencode-edition.md` (S1c) |
| `scripts/test-kimi-edition.js` | test-only; new arm named in the edition doc | `docs/kimi-edition.md` (P1c) |

## Documents checked

- `CHANGELOG.md` — **edited.** Two entries under the existing `[Unreleased] / ### Fixed`.
- `docs/opencode-edition.md` — **edited.** The `--uninstall` paragraph listed `RETIRED_WORKFLOW_COMMANDS`
  and `RETIRED_HOOKS` as the retired-name lists; `RETIRED_SUPPORT_SCRIPTS` added, the "absent from the
  source tree" clause widened to "and from the install manifest" (a support script is retired by leaving
  the manifest, not the tree), and the verification sentence now names U2 and S1c alongside U1.
- `docs/kimi-edition.md` — **edited.** Same two changes, naming P1c.
- `docs/api.md` — **no impact, and deliberately not touched.** The `#980` change adds no export
  (`armStagedJournalNote` / `disarmStagedJournalNote` are module-internal; the export list is still
  `classifyMergeError` + `assertBranchHasNonWorkflowChanges`) and adds no receipt field. Checked by
  grep: no section of `api.md` describes the worktree staging mechanism or `kw-wtsync-*` at all.
  Editing it would have staled the chain receipt for nothing — it is test-consumed.
- `README.md` — no impact. It covers overview and install, not uninstall internals or sink stderr.
- `docs/architecture.md` — no impact. No structural change; the staging/landing flow is unchanged and
  was never described there (grepped).
- `.env.example` — no impact. No new environment variable.
- `kaola-workflow/ROADMAP.md` — generated; closure owns it. Not hand-edited.
- Issue comments — closure is handled by the sink.

## Gaps found and fixed

One, and it was in the prose I had just written rather than in a pre-existing document: the `(w2)`
assertion message justified the disarm with a consequence that measurement contradicted. Corrected in
place — see `## Run gaps` in the finalization summary. No documentation gap survived the sweep.
