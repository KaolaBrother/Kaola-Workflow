## doc-docking evidence

### Changed code/config/test/workflow files reviewed
- scripts/kaola-workflow-claim.js — added detectFinalizeIncomplete, archiveDirDirty, cmdResume branch, cmdFinalize --keep-worktree re-entry fix
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js — byte-identical mirror
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — B2 fix (B1 not needed: gitlab uses `git add -A kaola-workflow/`)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — same
- scripts/simulate-workflow-walkthrough.js — 4 new crash-resume tests

### Documents checked
- CHANGELOG.md: ✅ [Unreleased] ### Fixed entry documents the fix precisely
- agents/contractor.md: ✅ Step 8b Crash recovery paragraph added
- commands/kaola-workflow-finalize.md: ✅ ## Crash Recovery section added
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md: ✅ same
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md: ✅ same
- README.md: no public user-facing behavior change — no update needed (crash-resume is internal)
- docs/api.md: no new API/schema/contract change
- docs/architecture.md: no structural change
- .env.example: no new env vars

### Gaps found
None.

### No-impact reasons for skipped document classes
- README.md: crash-resumability is an internal recovery path, not a user-visible feature or command
- docs/api.md: no new events, schemas, or external contracts
- docs/architecture.md: no new components or data-flow changes
- docs/conventions.md: no new conventions
- docs/workflow-state-contract.md: workflow-state.md fields unchanged

### Final verdict: DOCKED
