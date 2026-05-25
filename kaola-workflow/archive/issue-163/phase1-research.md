# Phase 1 - Research / Discovery: issue-163

## Deliverable
Make `workflow:in-progress` label cleanup observable and reliable: add fallback issue-number derivation in `cmdFinalize`, make `clearAdvisoryClaim` return a status enum, emit `claim_label_removed` in closure receipt, extend `checkClosureInvariants` to check `in-progress-label-removed`, add `audit-labels` + `repair-labels` subcommands (GitHub only; GitLab/Gitea best-effort where API supports it). Regression tests cover all cited AC scenarios.

## Why
Closed GitHub issues can still carry `workflow:in-progress`. Current cleanup is a triple silent failure: null-guard no-op (when issue already closed before finalize), API error swallowed, result never emitted. Observed stale labels on #127, #147, #157, #160.

## Affected Area

### Core changes
- `scripts/kaola-workflow-claim.js`: `clearAdvisoryClaim` (L347), `cmdFinalize` (L570), `checkClosureInvariants` (L549), new `cmdAuditLabels`/`cmdRepairLabels`, `main()` dispatch (L897–914)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`: byte-identical to above (COMMON_SCRIPTS)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`: equivalent changes, GitLab API
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`: equivalent changes, Gitea API

### Sink-merge (best-effort capture only)
- `scripts/kaola-workflow-sink-merge.js`: `postMergeCleanup` L228 — note result but cannot fully receipt-track (no mock support)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`: two call sites
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`: two call sites

### Tests
- `scripts/simulate-workflow-walkthrough.js`: new label-cleanup tests using gh mock shim

### Docs
- `docs/api.md`: `claim_label_removed` already documented; add note on `in-progress-label-removed` invariant check and audit/repair commands
- `CHANGELOG.md`: add [Unreleased] entry

## Key Patterns Found

1. **`clearAdvisoryClaim()` returns nothing; no-ops on null** — L347 `if (OFFLINE || issueNumber == null) return;`; both API calls wrapped in `catch (_) {}`. Fix: return `'removed' | 'skipped_offline' | 'failed'`; treat null issueNumber as `'skipped_offline'`. (`scripts/kaola-workflow-claim.js:347`)

2. **`cmdFinalize` null-folder gap** — `archiveProjectDir` runs first (L575); then `clearAdvisoryClaim(folder && folder.issue_number, ...)` (L593) is a no-op when folder is null. Fix: read `issue_number` from `result.dest + '/workflow-state.md'` using `field()` after `archiveProjectDir` returns. (`scripts/kaola-workflow-claim.js:570-597`)

3. **Receipt schema already complete** — `CLOSURE_RECEIPT_FIELDS.claim_label_removed: ['removed', 'already_absent', 'skipped_offline', 'failed']` (L27); `CLOSURE_INVARIANTS[4].id === 'in-progress-label-removed'` (L41). Only wiring missing. (`scripts/kaola-workflow-closure-contract.js:27,41`)

4. **`checkClosureInvariants` ignores `in-progress-label-removed`** — currently only checks roadmap invariants. Extend to check `receipt.claim_label_removed` is not `'failed'`. (`scripts/kaola-workflow-claim.js:549-568`)

5. **Audit pattern: `stale-worktree-check`/`stale-worktree-cleanup`** — dry-run/execute split via `const dryRun = !args.execute`. Register in dispatch chain and usage string. Use `gh issue list --state closed --label workflow:in-progress --json number,title,url`. (`scripts/kaola-workflow-claim.js:724-764`)

6. **Sink-merge ghExec does NOT support mock** — `scripts/kaola-workflow-sink-merge.js` calls `execFileSync('gh', ...)` directly; `KAOLA_GH_MOCK_SCRIPT` has no effect. Sink-merge label removal tests must use `KAOLA_WORKFLOW_OFFLINE=1`. Sink-merge receipt tracking is out of scope for this issue (defer to #164 shared executor).

7. **Four trees, byte-identity constraint** — COMMON_SCRIPTS and BYTE_IDENTICAL_GROUPS both apply. GitHub `scripts/` + Codex `plugins/kaola-workflow/scripts/` must be byte-identical. GitLab + Gitea are manual sync but functionally equivalent.

8. **`already_absent` vs `removed` distinction** — `gh issue edit --remove-label` exits 0 even when label is absent (idempotent). Cannot distinguish without a prior label check. For simplicity: on API success → `'removed'`; on OFFLINE → `'skipped_offline'`; on null issueNumber → `'skipped_offline'`; on exception → `'failed'`. The `already_absent` value from the schema is preserved for future use (e.g., by audit-and-repair path that first fetches issue labels).

## Test Patterns
- Framework: hand-rolled assertions; no external runner
- Location: `scripts/simulate-workflow-walkthrough.js`
- Label interception: shim checks `a.includes('issue') && a.includes('remove-label')` and returns `'{}'` or sets a flag
- Offline test: `KAOLA_WORKFLOW_OFFLINE: '1'` env — `clearAdvisoryClaim` returns `'skipped_offline'`, `claim_label_removed === 'skipped_offline'` in output
- Null-folder test: start with issue already closed on GitHub (use shim that returns `state: 'closed'` for issue view); run finalize; assert `claim_label_removed !== 'skipped_offline'` (fallback read worked)

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — skips all gh calls; `claim_label_removed: 'skipped_offline'`
- `KAOLA_GH_MOCK_SCRIPT` — path to gh.js mock (works for claim scripts but NOT sink-merge)
- `CLAIM_LABEL = 'workflow:in-progress'` (hardcoded in each forge script)

## External Docs
None needed — gh CLI and forge APIs already used in codebase. Node built-ins only for fallback reads.

## GitHub Issue
KaolaBrother/Kaola-Workflow#163

## Completeness Score
9/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient; gh CLI already used in codebase | no external library behavior needed |

## Notes / Future Considerations
- `already_absent` receipt value is defined in schema but not easily produced without a prior label-check API call. Defer `already_absent` to future; use `removed` for any API success.
- Sink-merge label removal receipt tracking deferred to #164 (shared closure executor). Sink-merge's `ghExec` not mockable.
- GitLab/Gitea `clearAdvisoryClaim` — GitLab uses `forge.updateIssue(iid, { unlabels: [CLAIM_LABEL] })`; Gitea uses `forge.updateIssueLabels(projectInfo, iid, { remove: [CLAIM_LABEL] })`. Both already exist; fix is same logical change.
- `cmdRelease` and `cmdWatchPr` pass non-null issue numbers already — the null-gap fix only matters for `cmdFinalize`.
