# Documentation Docking — issue-1097

Checked the repository documentation checklist (AGENTS.md) against every changed public behavior
on the branch (`workflow/issue-1097` @ `57c60106`, 37 files over `d11a949e`). Files checked, with
the fix that landed or the no-impact reason:

| File | Status | Evidence |
|---|---|---|
| `docs/api.md` | fixed on-branch | The W-model sink transaction (merge in the isolated `W`, publication as a non-forced compare-and-swap, report-only checkout advance), the kernel publish primitives row (`acquirePublishLock`: per-repository lock in the git common dir, provable-death takeover, unreadable-after-age takeover, `lock_error`), the envelope fields (`publish_busy` typed queueable report exit 2, `invalidated_evidence`, `receipt.candidate_head/base`, `integration_worktree_failed`), and the round-2 push-fault wording (the pre-#1097 `push_main` row; the `non_fast_forward` second cause with the relayed `detail`). |
| `README.md` | fixed on-branch | The sink/merge description carries the isolated-integration shape; no version bump (v12.2.6 stays). |
| `CHANGELOG.md` | fixed on-branch | `[Unreleased]` entry for #1097: the one-repository lock wording, the compare-and-swap publication, the resumable envelope. |
| `docs/decisions/0028-the-merge-sink-leaves-the-shared-checkout.md` | created on-branch | The merge-sink ADR: the W-model, one lock per repository, seconds-only hold, never a force. |
| `docs/architecture.md` | fixed on-branch | The flow diagram/prose for the merge path reflects the isolated integration worktree. |
| `docs/workflow-state-contract.md` | fixed on-branch | The orphan paragraph retired; contract fields aligned with the envelope the sink now emits. |
| `docs/README.md` | fixed on-branch | Index links executable against the current tree (ADR 0028 added). |
| `commands/`, `plugins/*/commands/`, `plugins/*/skills/` | regenerated, not hand-edited | 24 routing surfaces byte-matched from `templates/routing/` (the finalize skeleton PIN sentence); `test-generate-routing-surfaces` 480 assertions green; the issue-1055 render baseline re-captured in the same commit. |
| Public-interface comments (root, codex mirror, gitlab, gitea) | fixed on-branch | `runIntegrationPublish` returns-list and the caller's `not_published` comment carry the push-fault class; the deleted `stagedPathsUnder` doc comment removed with its function (round 2 verified 0 leftover lines). |

No BLOCKED items. No public behavior changed on the branch without its documentation surface.

DOCKED
