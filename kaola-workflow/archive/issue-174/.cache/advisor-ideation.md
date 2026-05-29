# Advisor — Ideation Gate: issue-174

## Critical Correction: Gap 6 Direction Was Wrong

The planner recommended removing `git pull --ff-only` from Git Freshness Block Recovery in the SKILL.md files to match the GitHub SKILL.md. **This is wrong and was corrected.**

Confirmed: both GitLab and Gitea command docs (`commands/workflow-next.md`) DO include the ff-only recovery attempt — `git fetch --prune && git pull --ff-only` → release if still blocked. This is the correct behavior per the AC target ("mirror the same-forge command doc"). The GitHub SKILL.md apparently omits this step, but the command docs are the correct reference for behavior.

**Gap 6 correction**: Not a real gap in the "remove" direction. The only fix needed in the recovery section is `PICK_NEXT_PROJECT → KAOLA_PROJECT` in the release command — already covered by Gap 1.

## Validator Location Correction

The planner named `scripts/validate-workflow-contracts.js` and `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` as the target files. **These validate the GitHub plugin, not GitLab/Gitea.**

Confirmed from `package.json`:
- `npm test` → `test:kaola-workflow:gitlab` runs `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `npm test` → `test:kaola-workflow:gitea` runs `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

**Corrected validator targets**: 
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

These already have a `kaola-workflow-next/SKILL.md` assertion section (delegation policy check). The new parity assertions should be added adjacent to that section.

## Gap 7 (Co-active Folders Advisory)
Non-blocking but acceptable to fix. Confirmed placement change matches command doc structure.

## Approach A Still Correct
Surgical patch is the right call. Gaps 1-5 correctly specced; assertions for KAOLA_VERDICT=, target_unverified, refusal print, offline roadmap path are all high-signal.
