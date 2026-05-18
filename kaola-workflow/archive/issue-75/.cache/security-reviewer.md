# Security Review: issue-75 — Lifecycle Cleanup Gaps

## Files Reviewed
- `scripts/kaola-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js`

## Findings

### [MEDIUM] Missing `isSafeName` validation in `cmdSinkFallback`

**File:** `scripts/kaola-workflow-claim.js`, lines 539–552

`cmdSinkFallback` receives `args.project` from `process.argv` and passes it to `projectDir(root, args.project)` without `isSafeName` guard. `path.join` does not sanitize traversal sequences — a value like `../../foo` resolves outside `kaola-workflow/`. If that path exists, `updateState` reads and writes a file at an attacker-chosen location.

Every sibling function validates: `claimProject`, `archiveProjectDir`, `cmdFinalize`, `cmdRelease` all have `assert(isSafeName(project), 'unsafe project name')`.

**Fix:** Add `assert(isSafeName(args.project), 'unsafe project name')` after the existing `assert(args.project, ...)` line. Apply the same fix to `cmdPatchBranch` (pre-existing gap, out of scope for this issue but worth tracking).

Note: Local CLI only — not remotely exploitable. Practical threat is crafted CI script or shell alias.

---

### [LOW] Missing `--` separator before path in `removeWorktree`

**File:** `scripts/kaola-workflow-claim.js`, lines 123

`execFileSync('git', ['worktree', 'remove', '--force', wtPath], ...)` has no `--` separator. `provisionWorktree` (lines 167, 172) correctly uses `'--', wtPath`. If `wtPath` (from state file) begins with `--`, git could interpret it as a flag.

**Fix:** Change to `execFileSync('git', ['worktree', 'remove', '--force', '--', wtPath], ...)`.

---

### [LOW] pr_url from state file passed to `gh pr view` without domain validation

**File:** `scripts/kaola-workflow-claim.js`, line 565

`folder.pr_url` is read from the state file and passed to `gh pr view`. Array args prevent shell injection. Worst case: wrong PR queried if state file is tampered. Fully acceptable given threat model.

---

### Positive Confirmations

- All `execFileSync`/`ghExec` calls use array arguments throughout — no shell injection surface
- `issueNumber` values are always `parseInt`'d before use
- No hardcoded secrets, tokens, or credentials introduced
- The `catch (_) {}` on `removeWorktree` is intentional best-effort cleanup, not a security concern

## Verdict

MEDIUM should be fixed before merge. LOWs are defense-in-depth improvements.

No CRITICAL or HIGH issues.
