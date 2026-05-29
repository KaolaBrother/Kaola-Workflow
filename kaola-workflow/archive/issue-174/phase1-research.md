# Phase 1 - Research / Discovery: issue-174

## Deliverable
Update GitLab and Gitea Codex `kaola-workflow-next/SKILL.md` files to match GitHub's Codex skill for workflow-next routing: rename `PICK_NEXT_PROJECT` → `KAOLA_PROJECT`, add `KAOLA_VERDICT`/`KAOLA_REASONING` extraction, add `target_unverified` to typed refusals, add startup refusal diagnostics, add target-existence validation step, align Git Freshness Block Recovery behavior, reposition Co-active Folders Advisory. Also add contract validator assertions to catch this class of drift.

## Why
Codex GitLab/Gitea routing behavior diverges from GitHub Codex and the forge command docs on 7 dimensions, causing inconsistent agent behavior when users invoke workflow-next from GitLab or Gitea Codex.

## Affected Area
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` (237 lines)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` (235 lines)
- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical copy)

## Key Patterns Found
1. GitHub reference SKILL.md: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — authoritative; 236 lines
2. Forge command docs already have parity: `plugins/kaola-workflow-gitlab/commands/workflow-next.md` and `plugins/kaola-workflow-gitea/commands/workflow-next.md` use `KAOLA_PROJECT`, include `target_unverified`, and have target-existence validation
3. Claim scripts already correct: both `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` output `verdict` + `reasoning` in startup JSON; the runtime is sound — only SKILL.md instructions lag

## Test Patterns
- Framework: hand-rolled assert, no external test framework
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: sequential `test*` functions, `assert()` calls; no SKILL.md-specific tests exist

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — used in offline branch of target-existence validation
- `KAOLA_TARGET_ISSUE` — target issue number
- `KAOLA_PROJECT` — project folder name (replaces `PICK_NEXT_PROJECT`)
- `KAOLA_VERDICT`, `KAOLA_REASONING` — extracted from startup JSON output

## External Docs
N/A — internal instruction files only

## GitHub Issue
KaolaBrother/Kaola-Workflow#174

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | — | Internal patterns only; no external API/library |

## Notes / Future Considerations
- Gap 7 (Co-active Folders Advisory positioning) is a minor cosmetic gap; consider whether to align it or leave it — the content is present either way. Phase 2 will decide.
- The contract validator additions will need `node scripts/validate-workflow-contracts.js` to exit 0, and `npm test` must pass (which runs the full walkthrough suite).
- If new contract assertions are added to `scripts/validate-workflow-contracts.js`, the byte-identical copy at `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` must receive the same change.
