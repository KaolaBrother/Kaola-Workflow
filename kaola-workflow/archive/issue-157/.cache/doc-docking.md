# Documentation Docking — issue-157

Date: 2026-05-22

## Changed files reviewed

### Implementation
- scripts/kaola-workflow-claim.js — new cmdStaleWorktreeCleanup, collectStale, stashWorktree, exportWorktreeDiff, removeBranch, failed_preserve bucket
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js — byte-identical mirror
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — GitLab edition
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — Gitea edition
- scripts/kaola-workflow-classifier.js — KAOLA_GH_MOCK_SCRIPT (test infra only)
- scripts/kaola-workflow-active-folders.js — KAOLA_GH_MOCK_SCRIPT (test infra only)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js — KAOLA_GLAB_MOCK_SCRIPT (test infra only)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js — KAOLA_TEA_MOCK_SCRIPT (test infra only)

### Tests
- scripts/simulate-workflow-walkthrough.js — testStaleWorktreeCleanup 8 sub-cases
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js — same 8 sub-cases
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js — same 8 sub-cases

### Validators
- scripts/validate-workflow-contracts.js — extended assertConcept
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — new assertConcept
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — new assertConcept

### Documentation (changed)
- README.md — stale-worktree-cleanup row in subcommands table; capability sentence updated
- CHANGELOG.md — [Unreleased] entry added
- docs/api.md — full stale-worktree-cleanup section added

## Documents checked

| Document | Status | Note |
|----------|--------|------|
| README.md | DOCKED | stale-worktree-cleanup row at line 534; capability sentence at line 489 |
| CHANGELOG.md | DOCKED | [Unreleased] entry with all 5 flags and 8 sub-cases |
| docs/api.md | DOCKED | Full section with invocation, flags, behavior, exit codes, JSON schema, workflow example, offline mode |
| docs/architecture.md | SKIP | Cleanup is operational utility; no Phase 6 sink architecture impact |
| .env.example | SKIP | KAOLA_*_MOCK_SCRIPT are test-only; no user-facing env var added |
| Phase 1 success criteria | DOCKED | Dry-run default ✓, --execute ✓, --archive/--export/--force ✓, --keep-branch ✓, all 3 forge editions ✓, README documented ✓ |
| Phase 3 task blueprint | DOCKED | All 7 tasks (1, 2, 3a, 3b, 4, 5a, 5b, 6, 7) complete and documented |
| Phase 4 implementation | DOCKED | plus task 4b (macOS shim fix) and Phase 5 review fix (failed_preserve bucket) |
| Phase 5 review findings | DOCKED | HIGH fixed; 2 MEDIUM addressed (1 fixed, 1 deferred as follow-up) |

## Gaps found and fixed

None. doc-updater added CHANGELOG.md entry and docs/api.md section; README.md was already updated by Task 7.

## Explicit no-impact reasons for skipped document classes

- docs/architecture.md: stale worktree cleanup is an operational maintenance subcommand; it does not change the Phase 6 sink flow, worktree provisioning architecture, or CI/CD pipeline structure described there.
- .env.example: KAOLA_GH_MOCK_SCRIPT, KAOLA_GLAB_MOCK_SCRIPT, KAOLA_TEA_MOCK_SCRIPT are set only by the test harness (ghMockEnv/glabMockEnv/teaMockEnv helpers) to route execFileSync through process.execPath on macOS 15. They are never needed in production workflow configurations.

## Final verdict: DOCKED
