# Planner: Issue #149 — Align worktree provisioning with KAOLA_WORKTREE_NATIVE docs

## Key Correction to Phase 1

Four script trees, not three:
1. `scripts/kaola-workflow-claim.js:342` (canonical GitHub) — `if (!OFFLINE && hasGitHistory(root))`
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:342` (bundled mirror, byte-identical) — same gate
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:295` — `if (hasGitHistory(root))` (missing OFFLINE + WORKTREE_NATIVE)
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:298` — same gaps as GitLab

`scripts/validate-script-sync.js` (lines 42-52) enforces byte-identity between #1 and #2. Fix idiom: edit `scripts/kaola-workflow-claim.js`, then `cp scripts/$f plugins/kaola-workflow/scripts/$f`.

## Central Tension

README/`.env.example:42` say default-OFF (opt-in). But GitHub walkthrough test asserts non-empty `worktree_path` at 12+ sites using `runClaimOnline` which doesn't set `KAOLA_WORKTREE_NATIVE`. A default-OFF gate breaks all of these unless test helpers inject `KAOLA_WORKTREE_NATIVE: '1'`.

## Approaches

### Approach A — Strict docs-aligned gate, default OFF + test-helper migration (RECOMMENDED)

Add `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';` next to each `OFFLINE` const. Change each gate to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`. Migrate test helpers to inject `KAOLA_WORKTREE_NATIVE: '1'`. Add regression test for default-OFF path.

- Pros: Actually fixes the bug. Matches established OFFLINE pattern. Single-line code edit per tree. Drift guard auto-verifies GitHub parity.
- Cons: Touches three test suites.
- Risk: Medium — must not miss raw spawnSync sites that bypass helpers. GitLab line 919, Gitea line 916 are bypass sites.
- Complexity: Moderate, mostly mechanical.

### Approach B — Gate defaults ON (`!== '0'`)

Does not fix the issue. README still says OFF; code still acts ON.
- Risk: High (delivers nothing). Rejected.

### Approach C — Code-only gate, defer tests

Build goes red immediately. Not viable.

## Architectural Fit

Approach A fits cleanly. `WORKTREE_NATIVE` const sits beside `OFFLINE`, reusing `=== '1'` boolean-env idiom. Combined guard `!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)` closes both WORKTREE_NATIVE gap and secondary OFFLINE divergence. No changes to `provisionWorktree`/`worktree-status`/`worktree-finalize`/`stale-worktree-check` internals.

## Recommended Approach: A, Phased Per-Forge

**Phase 1 — GitHub (two files, lockstep):**
- Edit `scripts/kaola-workflow-claim.js:~18`: add `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';`
- Change line 342 gate to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
- `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- In `simulate-workflow-walkthrough.js`: add `KAOLA_WORKTREE_NATIVE: '1'` to `runClaimOnline` env (lines 410-415) and `runClaimOnlineLastJson` env (lines 430-435)
- Add regression test: claim online without `KAOLA_WORKTREE_NATIVE` → `worktree_path === ''`

**Phase 2 — GitLab:**
- Edit `kaola-gitlab-workflow-claim.js:19`: add `WORKTREE_NATIVE` const
- Change line 295 gate to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
- In `test-gitlab-workflow-scripts.js`: add `KAOLA_WORKTREE_NATIVE: '1'` to `runClaimOnline` (line 98-102) AND raw spawn at line 919-920
- Add two tests: default-OFF → empty path; OFFLINE=1 + NATIVE=1 → empty path

**Phase 3 — Gitea:**
- Mirror of Phase 2 against `kaola-gitea-workflow-claim.js:298`, `test-gitea-workflow-scripts.js` (helper at line 100-106, raw spawn at line 916)

## Explicit NOT to Build

- No README changes (docs are the spec)
- No `--worktree-native` CLI flag
- No migration logic for existing active folders
- No changes to `provisionWorktree`/internals
- No tests added to bundled Codex walkthrough (OFFLINE-only)
- No default-ON "flip later" path

## Missing Facts

None blocking. Minor: confirm exact Gitea raw-spawn worktree-asserting site at edit time.

## Key File References

- `scripts/kaola-workflow-claim.js:17,342`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:17,342`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:19,295`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:19,298`
- `scripts/validate-script-sync.js:42-52,84-87`
- `scripts/simulate-workflow-walkthrough.js:410-415,430-435`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:98-102,919-920`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:100-106,916`
- `.env.example:42`
