# Code Review — Issue-44: Agent-Directed Issue Picking

Reviewed files:
- `scripts/kaola-workflow-claim.js` (parseArgs, claimExplicitTarget, cmdStartup, cmdPickNext)
- `scripts/simulate-workflow-walkthrough.js` (Epic 14A/B/C/D/E, 14a, 14b, 5k-a/b/c)
- `scripts/validate-kaola-workflow-contracts.js` (new contract assertions)
- `commands/workflow-next.md` and `plugins/.../SKILL.md` (updated docs)

---

## Findings

---

### [HIGH] Receipt overwrite on target_mismatch invalidates authorization for the still-owned project

**File:** `scripts/kaola-workflow-claim.js` lines 1350-1370 (cmdStartup)

**Issue:** When a session already owns a project and `--target-issue` mismatches, `writeStartupReceipt` is called with `claim: 'none'`. This overwrites the prior startup receipt at `startupReceiptPath(coordRoot, session)`. After the overwrite, `startupReceiptAuthorizesProject` returns false for the project the session still legitimately owns (the check at line 460 requires `claim === 'acquired'`; the check at line 463 requires `claim === 'owned'`). Any subsequent `verify-startup` call against the previously owned project will return `authorized: false`, potentially blocking legitimate phase work.

**Reproducer path:** Session S claims project A. Agent mistakenly calls `startup --target-issue B`. Receipt is overwritten to `claim: 'none'`. `verify-startup --project A --session S` now fails even though the lock on A has not been released.

**Fix:** On target_mismatch do not call `writeStartupReceipt`. Write the refusal only to stderr and stdout without updating the persisted receipt file. Alternatively, read the existing receipt, preserve its `claim` and `project` fields, and merge in the `verdict: 'target_mismatch'` so downstream reads still see authorization for A.

```javascript
// BAD (current): overwrites valid receipt
const receipt = writeStartupReceipt(coordRoot, args.session, {
  verdict: 'target_mismatch', claim: 'none', ...
});

// GOOD: emit refusal on stdout without persisting
const refusal = { startup_completed: true, verdict: 'target_mismatch',
  claim: 'none', project: owned.project, issue: owned.issue_number, ...};
process.stderr.write('startup: ...\n');
process.stdout.write(JSON.stringify(refusal) + '\n');
process.exitCode = 1;
return;
```

---

### [MEDIUM] Dead function: `runStartupClaimFirstAvailable` has no callers

**File:** `scripts/kaola-workflow-claim.js` lines 1284-1289

**Issue:** `runStartupClaimFirstAvailable` was the auto-pick entry point used by the old `cmdStartup`. The diff removed its only call site. It is now defined but never called. Its transitive helper chain is intact through `cmdBootstrap` (`runBootstrapClaimFirstAvailable` → `selectFirstClaimable` → `pickFirstActionableIssue`), so only `runStartupClaimFirstAvailable` itself is orphaned.

**Fix:** Remove the function. It is consistent with the issue-44 design principle that startup no longer auto-picks.

---

### [MEDIUM] `fetchOpenIssueRecords` call is wasted work in `cmdPickNext`

**File:** `scripts/kaola-workflow-claim.js` line 2390

**Issue:** After the agent-directed gate (`if (!args.targetIssue) { ... return; }`), `fetchOpenIssueRecords(root)` is called but only `issueFetch.status` is read — the issue list itself is not used. For the explicit-target path the issue list is irrelevant; the classifier resolves the target directly via number. `fetchOpenIssueRecords` may involve a network call to GitHub, so this is an unnecessary side effect on every `pick-next` invocation.

**Fix:** Remove the `fetchOpenIssueRecords` call from `cmdPickNext` and use a static value or skip the field in the receipt when it is not needed, or set `issue_sync: 'skipped'` directly.

```javascript
// BAD (current)
const issueFetch = fetchOpenIssueRecords(root);  // unused network call

// GOOD
// Remove the call; in writeStartupReceipt use issue_sync: 'skipped'
```

---

### [MEDIUM] Input validation: non-numeric `--target-issue` silently degrades to `no_target`

**File:** `scripts/kaola-workflow-claim.js` line 158

**Issue:** `parseInt('foo', 10)` returns `NaN`. `NaN` is falsy, so `!args.targetIssue` evaluates to `true`, causing both `cmdStartup` and `cmdPickNext` to fall through to the `no_target` path as if the flag was never provided. An agent passing a malformed value (e.g., a branch name instead of a number) gets a misleading `no_target` verdict rather than an explicit parse error.

**Fix:** Add a validation assert after the parse:

```javascript
if (argv[i] === '--target-issue' && argv[i + 1]) {
  args.targetIssue = parseInt(argv[++i], 10);
  continue;
}
// ... then in cmdStartup/cmdPickNext before use:
assert(!args.targetIssue || Number.isFinite(args.targetIssue),
  '--target-issue must be a valid integer');
```

---

### [LOW] Inconsistent exit codes on refusal paths between cmdStartup and cmdPickNext

**File:** `scripts/kaola-workflow-claim.js` lines 2358-2401

**Issue:** `cmdStartup` consistently sets `process.exitCode = 1` on every refusal path (`no_target`, `target_mismatch`, typed refusals). `cmdPickNext` returns without setting an exit code on the `target_mismatch` path (lines 2358-2366) and on the `no_target` path (lines 2380-2387). It also returns without exit code on the typed-refusal path (lines 2393-2401). The shell wrapper in `workflow-next.md` reads `verdict` rather than exit code, so this is not an immediate breakage, but callers in CI pipelines or test scripts that rely on non-zero exit for any refusal will be silently misled.

**Fix:** Add `process.exitCode = 1` (or `process.exit(1)`) before each early return on refusal in `cmdPickNext`, matching `cmdStartup` behavior.

---

### [LOW] `target_occupied` project name reconstructed manually when lock has canonical name

**File:** `scripts/kaola-workflow-claim.js` line 1293

**Issue:** When `issueAlreadyClaimed` fires, the returned `project` field is `'issue-' + targetIssue` (manual reconstruction). The existing lock file holds the canonical project name (which may differ if the project directory was named differently). The classifier-path branches use `candidate.project` from the classifier, which is the authoritative source. This is a minor inconsistency in the error payload seen by callers.

**Fix:** In `claimExplicitTarget`, when the issue is already claimed, look up the lock for the issue to return its canonical project name before falling back to the reconstructed form:

```javascript
if (issueAlreadyClaimed(coordRoot, root, targetIssue)) {
  const lock = readLockFiles(coordRoot, root).find(l => l.issue_number === targetIssue);
  const project = (lock && lock.project) || ('issue-' + targetIssue);
  return { status: 'target_occupied', issue: targetIssue, project };
}
```

---

## Scope compliance

The implementation correctly enforces the issue-44 design contract:
- Scripts do not auto-pick; `cmdStartup` and `cmdPickNext` refuse with `no_target` when `--target-issue` is absent.
- The agent owns issue selection; scripts validate, classify, and claim explicit targets.
- All five typed refusals (`target_occupied`, `target_unavailable`, `user_target_blocked`, `user_target_red`, `target_mismatch`) are present and wired through.
- `target_source: 'user_directed'` is recorded on acquired receipts.
- `claimExplicitTarget` is 24 lines — well under the 50-line limit.
- No `console.log` debug statements.
- `parseArgs` addition is clean, minimal, and follows the existing pattern.
- Test coverage in the walkthrough is comprehensive; 14D and 14E specifically cover the occupied and blocked refusal paths.

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 1     | warn   |
| MEDIUM   | 3     | info   |
| LOW      | 2     | note   |

Verdict: WARNING — 1 HIGH issue (receipt overwrite on target_mismatch) should be resolved before merge. The receipt overwrite can silently break `verify-startup` authorization for a project the session still owns. The MEDIUM issues are clean-up items that do not affect correctness of the happy path.
