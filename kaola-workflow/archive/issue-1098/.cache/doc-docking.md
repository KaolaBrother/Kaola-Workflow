# Documentation docking — issue-1098

DOCKED

## Changed public behavior

The PR/MR request sinks (`scripts/kaola-workflow-sink-pr.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`), the shared kernel publish
helper, the `watch-pr` / `watch-mr` reconciliation face, and the finalize routing PIN.

## Checked files

| File | Disposition |
|---|---|
| `docs/api.md` | **Updated.** PR sink section: postures defined once (non-linked = the checkout the sink runs in IS the main root), main-checkout resolution, neither-live-nor-archived refusal, pre-push identity + reuse with target-branch and per-member `Closes #n` verification, `already_merged` / `pr_closed_unmerged` / `mr_closed_unmerged`, probe-failure refusal (`pr_probe_failed` / `mr_probe_failed`), idempotent writes, archive-rides-the-request, exit codes, OFFLINE git behavior, per-sink stdout lane lines. `watch-pr` / `watch-mr` output section: `reconciled[]` fields, bounded scan with the documented residual limit, one fetch per scan. GitLab edition section: `normalizeMergeRequest` now carries `description` / `target_branch`. |
| `README.md` | **Updated.** States the PR/MR route is a request sink distinct from a merge: it reuses an open request on the same head/base rather than opening a second, carries the run's archive, and `watch-pr`/`watch-mr` reconcile it after merge, reporting publication and closeout separately. |
| `CHANGELOG.md` | **Updated** under `[Unreleased]`, two `### Changed` entries (the request-sink contract; the reconciliation face). No version bump. The blanket "never touching the main checkout's index or HEAD" claim was scoped to the linked-posture publish and the unchanged OFFLINE behavior recorded. |
| `commands/kaola-workflow-finalize.md`, the three forge `commands/kaola-workflow-finalize.md`, and the three `skills/kaola-workflow-finalize/SKILL.md` | **Updated by regeneration only.** The `sink-reports-orchestrator-owns` PIN gained the request-sink post-merge paragraph; regenerated from `templates/routing/finalize.skeleton.md` with `generate-routing-surfaces.js --write`, never hand-edited. |
| `templates/routing/finalize.skeleton.md` | **Updated** — the PIN paragraph itself. |
| `AGENTS.md` | **No impact.** No source-layout, command, or validation-chain change; the documented chains are the ones run. |
| `docs/decisions/` | **No impact.** No architectural decision changed: the sink contract, the reconciliation face and the kernel consolidation all implement the design already recorded for this issue. No new ADR is warranted. |
| `docs/api.md` interface comments | **No impact beyond the above** — the sink and watcher comments were updated in code with the behavior they describe. |

## Notes

- No example or setup command changed, so no README example needed correcting.
- `README.md` and `docs/api.md` are the only user-facing surfaces that describe this behavior; both
  were checked against the shipped code, not against the plan.
