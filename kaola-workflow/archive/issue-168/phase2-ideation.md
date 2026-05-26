# Phase 2 - Ideation: issue-168

## Revised Understanding (Post-Code-Verification)

The CWD fix (`forgeOpts = { cwd: mainRoot }` / `{ execOptions: { cwd: mainRoot } }`) is ALREADY applied in all three editions and the plugin copy (introduced in commit `fa609dd feat(#164)`). The `testSinkMergeMockabilityAndReceipt` test is ALREADY in place with CWD-aware assertions. `npm test` passes.

The remaining gap is **AC#3 only**: when `closeIssue` fails, the error is silently swallowed via `catch (_) {}`. No stderr warning is emitted. A caller cannot distinguish between "the close succeeded" and "the close failed but we hid it" without parsing the receipt.

## Approaches Evaluated

### Option A: Add stderr warning at closeIssue catch site
- Summary: Change `catch (_)` to `catch (e)` at the `closeIssue` try-block in each edition. Write one stderr line naming the issue number and the manual remediation command.
- Pros: Surgical — one catch block per edition; matches existing close-catch pattern; keep exit 0 (merge already succeeded); receipt field `remote_issue_closed: 'failed'` stays the machine-readable signal
- Cons: Must touch 3 source files + 1 plugin copy sync
- Risk: Low
- Complexity: Small

### Option B: Exit non-zero on close failure
- Rejected: The merge to `origin/main` already completed successfully in Step 7. Exiting non-zero conflates merge failure with cleanup failure, and would break any caller that treats exit 0 as "merge succeeded".

### Option C: Emit the warning from the receipt emitter (not the catch site)
- Rejected: The receipt is a JSON object emitted at end of function; by that point the CWD context is lost and the actionable warning timing is wrong. Warning belongs at the moment of failure.

## Advisor Findings

Advisor confirmed Approach A is sound. Key verification results:
- CWD fix already applied in all editions — no code change needed there
- `testSinkMergeMockabilityAndReceipt` already has CWD-aware shim and `remote_issue_closed === 'closed'` assertion
- All tests pass
- AC#3 (stderr warning) is the only remaining gap
- Gitea `discoverProject` fallback deferral correctly scoped

## Selected Approach

**Option A** — add stderr warning at `closeIssue` catch site in all three editions + sync plugin copy.

Warning format (uniform across editions, interpolate `args.issue` and forge command):
```
sink-merge: WARNING: issue close failed for <N>; receipt.remote_issue_closed=failed. Manually run: gh issue close <N>
```
(Replace `gh` with `glab`/`tea` per edition.)

Exit code stays 0. `remoteIssueClosed = 'failed'` unchanged. Add a comment above the catch documenting this as the non-silent warning contract.

## Out of Scope (explicit)

- CWD fix — already applied; no change needed
- `testSinkMergeMockabilityAndReceipt` — already complete; no change needed
- GitLab/Gitea subprocess regression tests — already covered by the existing online-mode mock tests in each edition's test file
- `discoverProject` fallback in Gitea — separate follow-up issue
- `checkClosureInvariants` extending to assert `remote_issue_closed` — out of scope per AC
- Retry/backoff, `--repo` flag, `ghExec`/`glabExec` signature refactoring

## Files to Change

| File | Change |
|------|--------|
| `scripts/kaola-workflow-sink-merge.js` | line 239: `catch (_)` → `catch (e)` + stderr warning |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | sync via `cp` after above |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | line 269: same pattern |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | line 269: same pattern |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
