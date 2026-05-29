# Documentation Docking — issue-174

## Changed Files Reviewed
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` — Codex instruction file
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` — Codex instruction file
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — forge validator
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — forge validator
- `CHANGELOG.md` — updated by doc-updater
- `kaola-workflow/.roadmap/issue-174.md` — roadmap mirror (to be deleted in Step 7)

## Documents Checked

### README.md
No impact — changes are internal Codex skill alignment (SKILL.md files are runtime agent instructions, not install steps or user-facing features). No README change needed.

### docs/api.md
No impact — no public API, schema, event, or external contract changed.

### CHANGELOG.md
Updated by doc-updater with entry under [Unreleased] ### Fixed for the 7 parity gaps.

### docs/architecture.md
No impact — no structural or data flow changes; only instruction text and validator assertions updated.

### .env.example
No impact — no new environment variables.

## Acceptance Criteria (from Phase 1 / GitHub Issue #174)
- ✅ GitLab Codex SKILL.md mirrors GitLab command router parity: target-existence validation, KAOLA_VERDICT, KAOLA_REASONING, refusal diagnostics, target_unverified
- ✅ Gitea Codex SKILL.md mirrors Gitea command router parity with same concepts
- ✅ KAOLA_PROJECT used (not PICK_NEXT_PROJECT) in both — decision applied consistently
- ✅ Contract validation added to catch this drift for both forge validators
- ✅ npm test passes

## Gaps Found
None. All changed surfaces are documented or explicitly noted as no-impact.

## Final Verdict
DOCKED
