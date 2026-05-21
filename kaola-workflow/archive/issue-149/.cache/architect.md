# Architect: Issue #149 — Align Worktree Provisioning with KAOLA_WORKTREE_NATIVE

## Design Decisions

- Strict opt-in gate, default OFF. `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';` + gate `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`.
- `!OFFLINE` added to GitLab and Gitea gates too (closes secondary divergence).
- Migrate online test helpers (inject `KAOLA_WORKTREE_NATIVE: '1'`) rather than rewrite assertions.
- Helper env-key ordering: `KAOLA_WORKTREE_NATIVE: '1'` BEFORE `...(extraEnv || {})` so default-OFF test can override.
- GitHub mirror via `cp` only, never hand-edited.

## Files to Create

None.

## Files to Modify

| File | Exact change | Why |
|------|--------------|-----|
| `scripts/kaola-workflow-claim.js` | After line 17: add `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';`. Line 342: `if (!OFFLINE && hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` | Canonical GitHub gate |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | After line 19: add `const WORKTREE_NATIVE = ...`. Line 295: `if (hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` | GitLab gate + OFFLINE normalization |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | After line 19: add `const WORKTREE_NATIVE = ...`. Line 298: `if (hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` | Gitea gate + OFFLINE normalization |
| `scripts/simulate-workflow-walkthrough.js` | `runClaimOnline` (lines 410-415) + `runClaimOnlineLastJson` (lines 430-435): add `KAOLA_WORKTREE_NATIVE: '1',` first in env after `...process.env,`. Add 2 tests. | Preserve existing assertions + add coverage |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | `runClaimOnline` (lines 98-102): add `KAOLA_WORKTREE_NATIVE: '1',`. Raw bypass site (~919-921): `env: process.env` → `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }`. Add 2 tests. | Helper injection + bypass fix |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | `runClaimOnline` (lines 103-107): add `KAOLA_WORKTREE_NATIVE: '1',`. Raw bypass site (~916-921): `env: process.env` → `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }`. Add 2 tests. | Helper injection + bypass fix |
| `CHANGELOG.md` | Add Breaking/Upgrade entry: worktree provisioning now opt-in; "Set `KAOLA_WORKTREE_NATIVE=1` to preserve prior behavior." | Behavior change notice |

## Test Additions (per forge)

**Test 1 — Default-OFF:**
- GitHub: `runClaimOnline([...], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' })` → assert `worktree_path === ''`
- GitLab/Gitea: raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0'` → assert exit 0 + `worktree_path === ''`

**Test 2 — OFFLINE wins over NATIVE:**
- All three forges: raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1'` → assert exit 0 + `worktree_path === ''`

## Build Sequence

1. Task A — GitHub canonical (`scripts/kaola-workflow-claim.js`)
2. Task A2 — GitHub mirror (`cp`)  [after A]
3. Task B — GitLab script [parallel with A+C]
4. Task C — Gitea script [parallel with A+B]
5. Task D — GitHub tests [after A2]
6. Task E — GitLab tests [after B]
7. Task F — Gitea tests [after C]
8. Task G — CHANGELOG [last, independent]

## Parallelization Groups

- Group 1: A → A2 → D (GitHub, sequential)
- Group 2: B → E (GitLab, sequential)
- Group 3: C → F (Gitea, sequential)
- Groups 1/2/3 have disjoint write sets; run concurrently.
- Task G: serial, after all groups.

## Validation Commands

- After A2: `node scripts/validate-script-sync.js` (drift guard, must exit 0)
- After D: `node scripts/simulate-workflow-walkthrough.js` (must exit 0)
- After E: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (must exit 0)
- After F: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (must exit 0)
- Final: `npm test` (all suites, must exit 0)

## Explicit Out-of-Scope

- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — OFFLINE-only, no worktree assertions, untouched
- `runNode` helper and offline `spawnSync` sites — hard-code OFFLINE=1, never provisioned, untouched
- Phase 4 command files, Phase 6 SKILL.md — already gate on `${KAOLA_WORKTREE_NATIVE:-0}`, no changes
- README — already correct, no changes
- Install scripts/hooks — must NOT auto-set KAOLA_WORKTREE_NATIVE=1
