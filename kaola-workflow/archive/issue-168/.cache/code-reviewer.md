# Code Review: issue-168

## Verdict: APPROVE

0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (non-blocking).

## Verification Summary

- `ghExec(args, {cwd})` signature confirmed to thread `cwd` correctly (scripts/kaola-workflow-sink-merge.js:20-25)
- `glabExec` reads `options.execOptions` (kaola-gitlab-forge.js:14-17,137-162) — CWD fix is real
- `teaExec` reads `options.execOptions` (kaola-gitea-forge.js:12-18,167-192) — CWD fix is real
- Warning fires only at `closeIssue` catch; label-removal and merge-note catches remain `catch (_)` (intentionally silent)
- `Object.assign({ unlabels/remove: [...] }, forgeOpts)` — fresh literal as target, `forgeOpts` not mutated
- `args.issue` is integer from `parseInt`, used only in `process.stderr.write` human message — no injection risk
- Walkthrough shim discriminator `a.includes('issue close')` does not false-match `issue edit --remove-label`; negative control `claim_label_removed === 'removed'` is valid
- GitLab/Gitea CWD regression tests use real `git rev-parse --show-toplevel` — genuine proof
- All suites green: validate-script-sync, walkthrough (testSinkMergeCloseFailureWarning: PASSED), GitLab + Gitea sink tests

## Findings

### CRITICAL
none

### HIGH
none

### MEDIUM
none

### LOW

**[LOW-1]** `catch (e)` binds error but `e.message` is never surfaced in the warning. Operator gets the actionable manual-fix command but not the failure reason (auth, rate-limit, network). Does not violate AC#3 — optional improvement only.

**[LOW-2]** Trailing newline removed at end of `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`. Cosmetic, from the parallel session's edit.
