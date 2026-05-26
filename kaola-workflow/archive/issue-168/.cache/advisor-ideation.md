# Advisor Gate: issue-168 Ideation

## Verdict: Approach A is sound. Proceed.

The plan correctly identifies root cause, picks the right fix pattern (uses the existing exec-options seam matching `-C mainRoot` discipline), and rejects B/C with valid reasoning.

## Key Findings After Code Verification

The CWD fix (`forgeOpts = { cwd: mainRoot }` / `{ execOptions: { cwd: mainRoot } }`) is ALREADY applied in all three editions and the plugin copy. Commit `fa609dd feat(#164)` introduced this.

The `testSinkMergeMockabilityAndReceipt` test already exists with:
- CWD-aware shim that checks `.git` exists
- `remote_issue_closed === 'closed'` assertion
- All tests pass (`npm test` exits 0)

## Remaining Work (AC#3 only)

The only gap is AC#3: **non-silent failure warning when `closeIssue` fails**.

Current: `catch (_) { remoteIssueClosed = 'failed'; }` — silently swallows the error in all three editions.

Required: `catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for N; receipt.remote_issue_closed=failed. Manually run: gh issue close N\n'); }`

## Confirmed Scope

1. Add stderr warning on `closeIssue` catch in GitHub canonical (line 239)
2. Sync plugin copy (`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`)
3. Add stderr warning on `closeIssue` catch in GitLab edition (line 269)
4. Add stderr warning on `closeIssue` catch in Gitea edition (line 269)

## Advisor Recommendations

1. Make the shim CWD-check mandatory for regression value — already done in `testSinkMergeMockabilityAndReceipt`.
2. Bake the negative-control proof into Phase 5 review.
3. The Gitea `discoverProject` fallback deferral is correctly scoped.
4. CHANGELOG.md under [Unreleased] — Phase 6 owns this.

## Decision

Approach A confirmed. Minimal remaining scope: 4 files (3 source + 1 plugin copy), one catch block per edition, stderr warning only.
