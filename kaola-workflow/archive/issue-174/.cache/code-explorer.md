# Code Explorer — issue-174

## Summary
7 divergence gaps between GitLab/Gitea Codex SKILL.md and GitHub reference.

## Gap 1 — PICK_NEXT_PROJECT → KAOLA_PROJECT (3 occurrences each)
- Delegation Contract patch command
- Startup bash block project extraction
- Git Freshness Block Recovery release command
GitHub SKILL.md and both forge `commands/workflow-next.md` use `KAOLA_PROJECT` throughout.

## Gap 2 — Missing KAOLA_VERDICT and KAOLA_REASONING extraction
GitHub startup block extracts both; GitLab/Gitea startup blocks are missing them entirely.

## Gap 3 — Missing `target_unverified` in typed refusal list
GitHub lists: `target_occupied`, `user_target_blocked`, `user_target_red`, `target_mismatch`, `target_unavailable`, `target_unverified`
GitLab/Gitea list: same minus `target_unverified`.

## Gap 4 — Missing startup refusal diagnostics print
GitHub: prints `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING`
GitLab/Gitea: no equivalent.

## Gap 5 — Missing target-existence validation step (Agent Issue Selection step 6)
GitHub SKILL.md has online/offline validation step before startup. GitLab/Gitea skip from step 5 to "state the number."

## Gap 6 — Git Freshness Block Recovery behavior divergence
GitHub: release then stop immediately.
GitLab/Gitea: attempt ff-only first, then release — and use old `PICK_NEXT_PROJECT` in release.

## Gap 7 — Co-active Folders Advisory placement
GitHub: subsection of Startup. GitLab/Gitea: subsection of Routing.

## Contract Validation
Neither `scripts/validate-workflow-contracts.js` nor `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` has any assertions for SKILL.md files. Zero coverage.

## Test Coverage
No SKILL.md-specific tests in `simulate-workflow-walkthrough.js`.

## Key Files
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — GitHub reference (authoritative)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` — needs update (237 lines)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` — needs update (235 lines)
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` — already has parity, reference
- `plugins/kaola-workflow-gitea/commands/workflow-next.md` — already has parity, reference
- `scripts/validate-workflow-contracts.js` — needs new SKILL.md assertions
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — same, byte-identical copy

## Decision: KAOLA_PROJECT
Use `KAOLA_PROJECT` — it's the established name in both forge command docs and GitHub SKILL.md. `PICK_NEXT_PROJECT` is legacy in SKILL.md only.

## Claim Scripts — No Changes Needed
Both `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` already fully implement `target_unverified` with `verdict` + `reasoning` in output. The runtime is correct; only the SKILL.md instructions are wrong.
