# Phase 3 - Plan: issue-149

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| None | — | — |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add `WORKTREE_NATIVE` const after `OFFLINE`; add `&& WORKTREE_NATIVE` to gate | Canonical GitHub gate |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `cp` mirror from canonical | Byte-identical mirror; drift guard enforces parity |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `WORKTREE_NATIVE` const after `OFFLINE`; change `if (hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` | GitLab gate + close secondary OFFLINE divergence |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GitLab | Gitea gate + close secondary OFFLINE divergence |
| `scripts/simulate-workflow-walkthrough.js` | Inject `KAOLA_WORKTREE_NATIVE: '1'` in `runClaimOnline`/`runClaimOnlineLastJson` helpers; add 2 tests | Preserve existing assertions; add default-OFF and OFFLINE-wins-over-NATIVE coverage |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Inject `KAOLA_WORKTREE_NATIVE: '1'` in `runClaimOnline`; patch raw bypass site; add 2 tests | Same |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GitLab test file | Same |

### Build Sequence
1. Task A — GitHub canonical script (no dependencies)
2. Task A2 — GitHub mirror via `cp` (depends on A)
3. Task B — GitLab script (parallel with A; disjoint file)
4. Task C — Gitea script (parallel with A+B; disjoint file)
5. Task D — GitHub tests (depends on A2)
6. Task E — GitLab tests (depends on B)
7. Task F — Gitea tests (depends on C)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | A → A2 → D | GitHub canonical, mirror, and walkthrough test (sequential within group) |
| 2 | B → E | GitLab script then test (sequential within group) |
| 3 | C → F | Gitea script then test (sequential within group) |

Groups 1, 2, 3 have fully disjoint write sets and may run concurrently.

### External Dependencies
None — pure Node.js, no new packages.

## Task List

### Task A: GitHub Canonical Script
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: 1 (first step)
- Action: MODIFY
- Implement:
  1. Grep `OFFLINE =` to find the exact line of `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`
  2. Insert immediately after it: `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';`
  3. Grep `hasGitHistory(root)` to find the provisioning gate line
  4. Change `if (!OFFLINE && hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
- Mirror: Follows `const OFFLINE` pattern at lines 17-18 of same file
- Validate: `node scripts/simulate-workflow-walkthrough.js` (after Task D completes Group 1)

### Task A2: GitHub Mirror
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Test File: N/A (drift guard is the test)
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Task A
- Parallel Group: 1 (second step)
- Action: MODIFY (via cp)
- Implement:
  1. `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
  2. Do NOT hand-edit the mirror — byte-identical only
- Mirror: Drift guard idiom from Phase 1 research
- Validate: `node scripts/validate-script-sync.js` (must exit 0)

### Task B: GitLab Script
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: none
- Parallel Group: 2 (first step)
- Action: MODIFY
- Implement:
  1. Grep `OFFLINE =` to find exact line in this file
  2. Insert immediately after it: `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';`
  3. Grep `hasGitHistory(root)` to find provisioning gate
  4. Change `if (hasGitHistory(root))` → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
     (Note: this line currently lacks `!OFFLINE`; both `!OFFLINE` and `WORKTREE_NATIVE` must be added)
- Mirror: GitHub canonical pattern (Task A)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (after Task E completes Group 2)

### Task C: Gitea Script
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: none
- Parallel Group: 3 (first step)
- Action: MODIFY
- Implement: Identical to Task B — grep `OFFLINE =`, insert `WORKTREE_NATIVE` const after it, grep `hasGitHistory(root)`, change gate to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
- Mirror: GitHub canonical pattern (Task A)
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (after Task F completes Group 3)

### Task D: GitHub Tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: self (walkthrough is the test)
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task A2
- Parallel Group: 1 (third step)
- Action: MODIFY
- Implement:
  1. **GREP FIRST** — grep `runClaimOnline =` to find the exact line/block of the `runClaimOnline` helper definition
  2. **GREP FIRST** — grep `runClaimOnlineLastJson` to find that helper's definition
  3. In `runClaimOnline` env block: insert `KAOLA_WORKTREE_NATIVE: '1',` as the FIRST key after `...process.env,`, BEFORE any `...(extraEnv || {})` spread
  4. In `runClaimOnlineLastJson` env block: same injection — FIRST key after `...process.env,`, BEFORE `...(extraEnv || {})`
  5. **GREP FIRST** — grep `env: process.env` to find any raw `spawnSync` bypass sites that don't use the helpers; for each bypass site that exercises a worktree assertion, change `env: process.env` → `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }`
  6. Add Test: "default-OFF — KAOLA_WORKTREE_NATIVE not set" — call `runClaimOnline([...], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' })` → assert `worktree_path === ''`
  7. Add Test: "OFFLINE wins over NATIVE" — raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1'` → assert exit 0 + `worktree_path === ''`
- Mirror: Existing `runClaimOnline` test pattern in same file
- Validate: `node scripts/simulate-workflow-walkthrough.js` (must exit 0)

### Task E: GitLab Tests
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: Task B
- Parallel Group: 2 (second step)
- Action: MODIFY
- Implement:
  1. **GREP FIRST** — grep `runClaimOnline =` in this file to find the helper definition
  2. In `runClaimOnline` env block: insert `KAOLA_WORKTREE_NATIVE: '1',` as the FIRST key after `...process.env,`, BEFORE any `...(extraEnv || {})` spread
  3. **GREP FIRST** — grep `env: process.env` in this file to find raw bypass sites; for each bypass that exercises a worktree assertion, change `env: process.env` → `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }`
  4. Add Test: "default-OFF" — raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0'` → assert exit 0 + `worktree_path === ''`
  5. Add Test: "OFFLINE wins over NATIVE" — raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1'` → assert exit 0 + `worktree_path === ''`
- Mirror: GitHub test pattern (Task D)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (must exit 0)

### Task F: Gitea Tests
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: Task C
- Parallel Group: 3 (second step)
- Action: MODIFY
- Implement: Identical to Task E — grep `runClaimOnline =`, inject `KAOLA_WORKTREE_NATIVE: '1',` FIRST after `...process.env,` BEFORE `...(extraEnv || {})`, grep `env: process.env` for bypass sites, add same 2 tests
- Mirror: GitLab test pattern (Task E)
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (must exit 0)

## Advisor Notes

From `.cache/advisor-plan.md`:

- **Refinement 1**: CHANGELOG entry removed from Phase 4 (was Task G). Doc-updater in Phase 6 will add the CHANGELOG entry. Breaking/Upgrade note for Phase 6 doc-updater: "worktree provisioning now opt-in via `KAOLA_WORKTREE_NATIVE=1`; set to preserve prior behavior."
- **Refinement 2**: Line numbers in `.cache/architect.md` are stale-able. All Phase 4 tasks must grep fresh (grep `OFFLINE =`, `runClaimOnline =`, `hasGitHistory(root)`, `env: process.env`) rather than trusting static line numbers.
- **Refinement 3**: Env-key ordering is load-bearing. `KAOLA_WORKTREE_NATIVE: '1',` must be the FIRST key after `...process.env,`, BEFORE any `...(extraEnv || {})` spread. If reordered, the default-OFF test silently breaks. Each task touching a helper env block must follow this exactly.

What's solid per advisor: build sequence A→A2→D, B→E, C→F is dependency-safe; three forge groups have disjoint write sets; test design (default-OFF + OFFLINE-wins-over-NATIVE) is the discriminating pair; naming `WORKTREE_NATIVE` matches `OFFLINE` const convention.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Advisor approved with in-place refinements; no blueprint gaps requiring re-architecture |
