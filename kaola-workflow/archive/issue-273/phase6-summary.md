# Phase 6 - Summary: issue-273

## Delivered

Two independent follow-up fixes for #264:

**Fix 1 — `legacy-worktree-cleanup` dry-run/execute branch mismatch (Option B)**
Dropped the vestigial `would_delete_branch` bucket from `cmdLegacyWorktreeCleanup` dry-run output across all 4 forge editions. The execute path has always intentionally preserved branch refs (#264 "safe direction"); the dry-run was incorrectly advertising it would delete them. Removal aligns the advertised contract with actual behavior.

**Fix 2 — `workflow-init` worktree-note parity**
Updated all 6 `<!-- KW-CLAUDE-TEMPLATE-START/END -->` files (3 command + 3 SKILL.md, across GitHub/GitLab/Gitea forges) from the stale sibling-worktree path (`<repo>.kw/<project>/`) to the #264-canonical repo-local path (`<repo-root>/.kw/worktrees/<project>/`). Applied byte-identically to preserve within-pair parity assertions.

## Files Changed

**Fix 1 — claim.js (4 editions):**
- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

**Fix 1 — tests (3 files):**
- `scripts/simulate-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

**Fix 2 — workflow-init (6 files):**
- `commands/workflow-init.md`
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitea/commands/workflow-init.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`

**Docs:**
- `docs/api.md` — `would_delete_branch` removed from dry-run JSON block; advisory mismatch note removed
- `CHANGELOG.md` — `[Unreleased] ### Fixed` entry for #273 added; #264 follow-up note resolved
- `.env.example` — stale `KAOLA_WORKTREE_NATIVE` comment updated to repo-local path

## Test Coverage

All 115 walkthrough tests pass. Full `npm test` (all 4 forge editions) exits 0. New tests: absence assertion `!('would_delete_branch' in out)` added to `testLegacyWorktreeCleanupDryRun` in all 3 test suites.

## Final Validation Evidence

- `node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation passed" (115 tests)
- `npm test` — exit 0, all 4 edition suites (claude/codex/gitlab/gitea) green
- Evidence: `.cache/final-validation.md`

## Adaptive Barrier

All 4 script-enforced gates passed:
- `--resume-check`: `{"ok":true,"planHash":"b7c3b432..."}` (exit 0)
- `--gate-verify`: `{"ok":true,"unsatisfied":[]}` (exit 0)
- `--barrier-check`: `{"result":"pass","errors":[]}` (exit 0)
- `--verdict-check`: `{"ok":true,"failures":[],"checked":["review"]}` (exit 0)

## Documentation Docking

DOCKED — evidence: `.cache/doc-docking.md`

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

None. All acceptance criteria for #273 are met. No deferred items, no partial implementation, no open review follow-ups.

## Closure Decision

No deferred items found in scan. Issue #273 is complete and ready to close.

## Commit And Push

Pending final Git gate; final hash is reported after push and is not written back here.

## GitHub Issue

Ready to close (#273) — all acceptance criteria pass.

## Roadmap

Pending regeneration (Step 7).

## Archive

Pending (Step 8b — cmdFinalize).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | `.cache/doc-updater.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| closure advisor gate | N/A | closure scan — no deferred items found | no advisor needed |
| final-validation fix executors | N/A | `.cache/final-validation.md` — no failures | no failures to fix |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status confirms uncommitted changes; sink is merge | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
