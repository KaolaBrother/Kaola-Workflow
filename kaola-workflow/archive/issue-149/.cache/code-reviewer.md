# Code Review — Issue #149: KAOLA_WORKTREE_NATIVE default-OFF gating

## Scope & Context

The bug: `KAOLA_WORKTREE_NATIVE` was documented as opt-in (default OFF) but the
claim scripts provisioned worktrees unconditionally. The fix adds a
module-level `WORKTREE_NATIVE` const to all three forge claim scripts, gates
provisioning on it, migrates test helpers to inject the env var, and adds two
new tests per forge (default-OFF, OFFLINE-wins-over-NATIVE).

Files reviewed (all 7 listed + staged roadmap mirror):
- scripts/kaola-workflow-claim.js (GitHub canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js (mirror)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

## Verification performed

- **Mirror byte-identity**: `diff scripts/kaola-workflow-claim.js
  plugins/kaola-workflow/scripts/kaola-workflow-claim.js` => identical (both at
  HEAD and in working tree).
- **Gate logic**: all four scripts now read
  `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`. Operator precedence
  is correct (`&&` left-to-right short-circuit), conditions are correct.
- **GitLab/Gitea secondary fix confirmed**: HEAD versions had bare
  `if (hasGitHistory(root))` with NO `!OFFLINE` guard. Both now include
  `!OFFLINE`. The previously-missing OFFLINE guard is genuinely added.
- **Const naming**: `WORKTREE_NATIVE` matches the `OFFLINE` precedent (same
  `process.env.X === '1'` boolean pattern, same module-scope placement directly
  adjacent to `OFFLINE`).
- **Env-key ordering**: in GitHub `runClaimOnline`/`runClaimOnlineLastJson` and
  GitLab `runClaimOnline`, `KAOLA_WORKTREE_NATIVE: '1'` appears BEFORE
  `...(extraEnv || {})`, so the default-OFF test (`{ KAOLA_WORKTREE_NATIVE: '0' }`)
  correctly overrides. Confirmed not reversed. `KAOLA_WORKFLOW_OFFLINE: '0'` is
  pinned AFTER the spread, which is why the OFFLINE-wins tests correctly bypass
  the helper and use raw spawnSync.
- **Test 1 (default-OFF)**: present in all three suites
  (testWorktreeNativeDefaultOff for GitHub; inline blocks for GitLab/Gitea).
  Passes NATIVE=0, asserts `worktree_path === ''`.
- **Test 2 (OFFLINE-wins)**: present in all three suites. Passes
  `{ OFFLINE=1, NATIVE=1 }`, asserts `worktree_path === ''`.
- **Raw bypass sites**: the sibling-worktree provisioning test (~line 909 GitLab
  / ~926 Gitea) WAS patched to `{ ...process.env, KAOLA_WORKTREE_NATIVE: '1' }`.
  The remaining `env: process.env` sites (repair-state CLI; startup/pick-next
  without --target-issue => no_target/exit 1; already-owned-folder startup that
  asserts only `typeof worktree_path === 'string'`) do NOT exercise fresh
  provisioning, so leaving them unpatched is correct.
- **Caller-safety (default flip ON->OFF)**: production callers that
  `cd "$ACTIVE_WORKTREE_PATH"` (phase6 finalize across all three forges) derive
  that variable from the phase4 guard
  `if [ "${KAOLA_WORKTREE_NATIVE:-0}" = "1" ]; ... else ACTIVE_WORKTREE_PATH="$(pwd)"`.
  When NATIVE is unset/0 the callers fall back to `$(pwd)`, never to an empty
  `worktree_path`. Caller and claim-script gate share the same env var, so they
  stay consistent: no silent broken `cd` into an empty path. The default flip is
  safe.
- **Tests pass**: all three suites green —
  "Workflow walkthrough simulation passed",
  "GitLab workflow script tests passed",
  "Gitea workflow script tests passed".
- **Doc consistency**: README (lines 776-777) and phase4 commands
  (`${KAOLA_WORKTREE_NATIVE:-0}`) already document default-OFF. The code change
  makes runtime behavior match the already-correct docs. No doc drift introduced.
- **Debug statements**: none introduced in added lines.
- **Function size**: changed `claimProject` is 36 lines (< 50). OK.
- **Scope**: exactly the 7 listed files + staged roadmap mirror issue-149.md.
  Untracked `.codex/` is pre-existing and unrelated.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW
None.

### Note (not a finding)
Test files exceed the 800-line guideline (1803 / 1245 / 1235). This is the
project's established single-growing-integration-suite-per-forge convention
(CLAUDE.md names simulate-workflow-walkthrough.js as THE suite). The +50/+44/+37
line additions are consistent with that pattern and are not a regression
introduced by this change.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 0     | pass   |

Verdict: APPROVE — the fix correctly gates worktree provisioning on
KAOLA_WORKTREE_NATIVE across all three forges, restores the previously-missing
OFFLINE guard for GitLab/Gitea, adds parity tests, and all suites pass. The
default flip from ON to OFF is verified safe because production callers derive
their working path from the same env var and fall back to cwd, never to an empty
worktree_path. Clean review, zero findings.
