# Security Review — issue-38 Phase 4

## Verdict: APPROVE

0 CRITICAL, 0 HIGH findings. All subprocess calls use execFileSync with array arguments. No hardcoded secrets. No injection paths.

## Scope

Reviewed: buildClaimedBranchSet, fetchOpenIssues, findMainWorktree, detectCurrentProject, scanPhaseArtifacts, commitWorktreeArtifacts, and cmdPickNext/cmdResume/cmdWorktreeStatus/cmdWorktreeFinalize changes.

## Findings

### CRITICAL
none

### HIGH
none

### MEDIUM
none

### LOW

**LOW-1 (line 2359):** `commitWorktreeArtifacts` has no internal `isSafeName` guard; relies on the single caller (`cmdWorktreeFinalize`) having already called `isSafeName(args.project)`. Chain is intact; no current exploit path.

**LOW-2 (line 2247):** `detectCurrentProject` returns `args.project` without pre-checking it. Only caller (`cmdResume`) asserts `isSafeName(project)` before use. Chain intact.

**LOW-3 (line 2260):** `scanPhaseArtifacts` concatenates `project` into nextCommand strings. `isSafeName` permits spaces, which would inject extra words. Not exploitable in practice: all callers ensure project is `'issue-' + integer` or passes `isSafeName` before reaching this function.

## Other Areas Checked (clean)

- `buildClaimedBranchSet`: literal argv only, no user data in subprocess
- `fetchOpenIssues`: literal argv only; integer extraction via parseInt
- `findMainWorktree`: no user input, pure git output parsing
- `cmdWorktreeStatus`: branch-derived issue numbers via regex (digits only) before `gh issue view`
- `fs.cpSync`: `dereference: false` (default), no symlink traversal risk
- No hardcoded secrets in new code
