# Planner — issue-156

## Key Corrections to Phase 1 (Evidence-Backed)

**Correction 1: HEAD is NOT the 3.13.0 release commit.**
Only commit since `kaola-workflow--v3.12.0` is `b654850 fix(#155)`. CHANGELOG.md files #155 under `[Unreleased]` above the `[3.13.0]` section. Tagging HEAD would tag a commit containing unreleased work. Release commit is HEAD's parent.

**Correction 2: GitLab edition tags are NOT published in lockstep.**
GitHub tags: 3.4.0, 3.8.0, 3.8.1, 3.12.0. GitLab tags: 3.8.0, 3.8.1 only — no 3.12.0 GitLab tag. GitLab tag is optional at maintainer discretion; Gitea has no tags.

## Recommended Approach A (Publish-branch)

1. Add CHANGELOG drift guard to `scripts/validate-workflow-contracts.js` (after existing version block, lines 263-281)
2. Byte-identical mirror copy to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
3. Fix README tag format and expand checklist with edition policy + commit-selection guidance
4. Document tag-publish command as maintainer step (NOT agent-executed)

## Rejected Approaches

- **Approach B (doc-walkback)**: Move [3.13.0] to [Unreleased] — wrong, destroys release provenance
- **Approach C (standalone release script)**: Deferred as follow-up; over-build for this issue

## Explicitly Do NOT Build

- No agent-executed `git push --tags` (irreversible; wrong-SHA risk)
- No tag-existence check inside `npm test` (violates KAOLA_WORKFLOW_OFFLINE=1 contract)
- No `kaola-workflow-gitea--v3.13.0` tag
- No mandatory `kaola-workflow-gitlab--v3.13.0` (optional per precedent)
- No CI/CD pipeline
- No standalone release-gate script (Approach C deferred)

## Files to Touch

- `scripts/validate-workflow-contracts.js` — insert CHANGELOG guard after line 281
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical cp
- `README.md` lines 424-435 — fix tag format + edition policy

## Testing

- `node scripts/simulate-workflow-walkthrough.js` + full `npm test` pass
- CHANGELOG guard is self-testing via `validate-workflow-contracts.js`
- `validate-script-sync.js` will catch a missed mirror copy
