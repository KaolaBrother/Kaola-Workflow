# Security Review — Issue #149 (WORKTREE_NATIVE opt-in gate)

Scope: review only, no edits. Reviewed the 7 modified files plus the gated
`provisionWorktree()` / `hasGitHistory()` helpers they call.

## Verdict

PASS. No CRITICAL, HIGH, or MEDIUM findings. The change is a defense-in-depth
improvement: it makes worktree provisioning (which performs filesystem writes
and `git` subprocess calls) opt-in and strictly more restrictive than before.
Two LOW/informational notes only.

## Change summary (as reviewed)

Each of the four claim scripts adds:
`const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';`
and tightens the provisioning guard to:
`if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`.

The three test files inject `KAOLA_WORKTREE_NATIVE: '1'` into spawned-subprocess
env blocks so existing online tests keep exercising the worktree path, plus add
default-OFF and OFFLINE-wins regression tests.

## Security focus areas — findings

### 1. Gate bypass / unconditional reach to provisionWorktree — CLEAR
Verified every `provisionWorktree` reference in all four claim scripts:
- `scripts/kaola-workflow-claim.js`: def (L180), single gated call (L344), export (L725)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`: single gated call (L344)
- `plugins/kaola-workflow-gitlab/.../kaola-gitlab-workflow-claim.js`: def (L106), single gated call (L297), export (L726)
- `plugins/kaola-workflow-gitea/.../kaola-gitea-workflow-claim.js`: def (L106), single gated call (L300), export (L711)

There is exactly one call site per file, all guarded by `!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)`.
No bare `if (hasGitHistory(root))` call remains. Notably, the GitLab and Gitea
editions previously used a bare `if (hasGitHistory(root))` with no `!OFFLINE`
check; this change adds BOTH `!OFFLINE` and `WORKTREE_NATIVE`, so behavior is
strictly more restrictive. No regression.

Gate completeness confirmed repo-wide: a `grep -rn "provisionWorktree"` over all
`*.js` returns ONLY the per-file definition, single gated call site, and module
export — no external script consumes the export (e.g. via
`require(...).provisionWorktree(...)`). The gate is therefore complete, not partial.

### 2. Strict equality (`=== '1'`) — CORRECT
`process.env.KAOLA_WORKTREE_NATIVE === '1'` defaults to OFF and resists
truthy-coercion (e.g. `KAOLA_WORKTREE_NATIVE=true`/`yes`/`2` all evaluate false).
Consistent with the established `OFFLINE` flag convention in the same files.

### 3. Env var injection into test subprocess env — NOT EXPLOITABLE
The injected value `'1'` is a hardcoded string literal, not derived from any
external/attacker-controlled input. There is no pathway where issue content,
CLI args, network responses, or file contents reach these env-block values.
This is test-only code.

### 4. process.env spread to child (`{ ...process.env, ... }`) — ACCEPTABLE
The spread propagates the parent process environment (which may contain tokens
like GH_TOKEN/GITLAB_TOKEN) to a Node subprocess that runs the project's own
claim script. This is intentional and pre-existing — the pattern was already in
`runClaimOnline`/`runClaimOnlineLastJson`; the diff only inserts one extra known
key. No new secret is added, and no env is forwarded to any external/untrusted
binary. Test-only, local trust boundary. Informational, not a finding.

### 5. Hardcoded secrets — NONE
Grep of all added (`+`) lines across the 7 files for secret/token/key/password/
private-key/cloud-credential patterns: none found.

### 6. Filesystem & subprocess safety of the gated code — SOUND
`provisionWorktree()` (the now-gated code) uses `execFileSync('git', [argv...])`
with argument arrays — no shell interpolation — and uses `--` separators before
path/branch operands, preventing both command injection and git option
injection even though `branch` derives from issue number/project/`args.branch`.
`hasGitHistory()` likewise uses `execFileSync` with a fixed argv. Gating these
behind opt-in REDUCES how often filesystem writes (`fs.mkdirSync`) and git
subprocess calls execute; it opens no new write path.

## OWASP Top 10 / other checks
- Injection: no shell-string construction; argv arrays + `--`. N/A.
- Broken auth / access control: no auth or route logic touched. N/A.
- Sensitive data exposure: no new logging of secrets; no secrets added. N/A.
- Misconfiguration: secure-by-default (opt-in OFF) — improvement.
- Insecure deserialization: `JSON.parse` only on the script's own stdout in
  test code; trusted source. N/A.
- Vulnerable dependencies: no dependency changes in this diff.

## Validation performed
- `node scripts/simulate-workflow-walkthrough.js` -> "Workflow walkthrough
  simulation passed" (exit 0), including the two new #149 tests.
- Secret-pattern grep over added lines: clean.

## LOW / informational
- L1 (informational): GitLab/Gitea editions gained an `!OFFLINE` precondition
  they previously lacked — a behavior tightening, not a concern. The new
  OFFLINE-wins regression tests assert the intended behavior, so no further
  confirmation is needed.
