# Documentation docking — issue-1095

Candidate: workflow/issue-1095 @ 5775c352 (rebased on c6911753).

## Checked files
- CHANGELOG.md — FIXED: `[Unreleased]` entry for #1095 (Next/Finalization/Init prose pass), after #1094's entries. No version section added (no release).
- docs/api.md — FIXED: the fill-if-empty paragraph now says the summary card pre-creates `## Validation` / `## Changed Paths` with empty bodies (matches F1).
- docs/architecture.md — FIXED: `## Backlog` states `list-open`'s real bounds (up to 100 issues; `P<n>` tier, `priority_top_tier_labels` = tier 1, neither = last; an empty list means unmeasured) — N1/F6 accuracy.
- README.md — no impact: quotes none of the changed prompt text; no CLI, flag, or setup change.
- docs/README.md — no impact: line 141 summarizes ADR 0018's decision record (historical wording of that ADR), not the live prompt.
- docs/conventions.md (:478-486, :527-532) — no impact: already states the transaction writes `validation` / `changed_paths` durably under the two headings.
- docs/workflow-state-contract.md (:123-127) — no impact: already names the two transaction-owned headings.
- docs/decisions/* — no impact: no design change; ADR 0018's `in-shared-001` mention is historical (splice removed as unused, T1).
- Public-interface comments — FIXED: `scripts/kaola-workflow-claim.js` (+ codex mirror, gitlab/gitea ports) list-open comment (T2) and the #1004 appendSummarySection comment.

No CLI signature, flag, JSON field, or schema changed: `--target-source`, `--target-issue`, `issue_action`, and `validation-runner record --verdict` already existed and are transcribed as they are.

DOCKED
