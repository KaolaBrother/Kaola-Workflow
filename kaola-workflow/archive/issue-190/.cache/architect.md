# Architect Output — issue-190

## Key Corrections vs Phase 1/2 Context

### D2 — Adaptation #2 (cross-ref) is dropped / not applied
Fast SKILLs have `## Escalation` (a template-fence line), not `## Mid-Flight Escalation` with the eligibility rubric. The rubric lives in `commands/kaola-workflow-fast.md`. The command-file cross-ref text is kept verbatim. Applying the stated adaptation #2 would create a dangling reference.

### D3 — Validators are 3 per-edition, not 1
- GitHub Codex: `scripts/validate-kaola-workflow-contracts.js`
- GitLab Codex: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Gitea Codex: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
`scripts/validate-workflow-contracts.js` (claude edition) needs no change.

## Port Source per Edition
- GitHub SKILL.md: `commands/workflow-next.md` lines 80-117
- GitLab SKILL.md: `plugins/kaola-workflow-gitlab/commands/workflow-next.md` (its Step 0a-1, already has glab/MR refs)
- Gitea SKILL.md: `plugins/kaola-workflow-gitea/commands/workflow-next.md` (its Step 0a-1, already has tea refs)

Apply ONLY adaptation #3: "Step 0b" → "the Startup transaction" (2 occurrences each).

## Write Sets

| Task | Files |
|------|-------|
| T-M1a (validators/RED) | scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js |
| T-M1b (SKILLs/GREEN) | plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md |
| T-M2 | .env.example, docs/api.md |
| T-M3 | package-lock.json |
| T-Docs | CHANGELOG.md |

## Required Output 3-line addition (each SKILL)
Insert between `Pending gates:` line and `Next skill:` line:
```
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {fast|full — from KAOLA_PATH or Step 0a-1 judgment}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
```

## Validator Assertions to Add (4 per edition)
- `assertIncludes(skillContent, 'Startup Step 0a-1')`
- `assertIncludes(skillContent, 'Branch: {branch from Sink block')`
- `assertIncludes(skillContent, 'Workflow path: {fast|full')`
- `assertIncludes(skillContent, 'Parallel decision: {green|yellow|red')`

## M2 .env.example Removals (exact blocks)
- Lines 11-13: KAOLA_ENFORCE_PLATFORM_SESSION + comment
- Lines 15-17: KAOLA_KERNEL_SESSION_SKIP + comment
- Lines 19-21: KAOLA_COORD_ROOT + comment
- Lines 27-28: KAOLA_SESSION_ID + comment (hook reference)
- Lines 30-31: KAOLA_KERNEL_SESSION_FAKE_PID + comment
- PRESERVE lines 23-25 (KAOLA_WORKTREE_PATH)

## M2 docs/api.md
- Remove line 109 only (KAOLA_KERNEL_SESSION_FAKE_PID bullet)

## M3 package-lock.json
- Lines 3 and 9: "3.16.0" → "3.16.1"

## Out of Scope (O1)
docs/investigations/init-architecture-fit-2026-05-17.md:28 references KAOLA_SESSION_ID — historical record, intentionally not touched (flagged, not silently dropped).

## Validation Commands
```bash
node scripts/validate-kaola-workflow-contracts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node scripts/simulate-workflow-walkthrough.js
npm test
```
