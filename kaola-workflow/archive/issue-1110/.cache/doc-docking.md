# Documentation docking — issue-1110

Candidate: `1b785e55d86391a38061740f715323674dd190bc`

## Checked

- `README.md` — no-impact. It names finalization only as a workflow stage and does not state the residue-mirror contract.
- `docs/api.md` — updated in the candidate. A path absent from the worktree is copied when this run's HEAD contains that exact path, or when the main index already contains it (a staged rename or a staged add). An untracked path is copied only when HEAD contains it. `checks.residue_unattributed` and the `residue_unattributed` field row state the same rule. The field row also records that the JSON array has no source discriminator.
- `CHANGELOG.md` — the `[Unreleased]` Fixed bullet states the untracked decline, and that a path already in the main index (a staged rename or a staged add) is still copied. The `#1077` overwrite refusal and forward edits of files the worktree already holds are unchanged.
- Architecture / ADR — no-impact. This is a bugfix of the existing residue-mirror admission rule. No new decision record.
- Examples — no-impact. No executable example in the tree states the retired "absence means ownership" rule.

DOCKED
