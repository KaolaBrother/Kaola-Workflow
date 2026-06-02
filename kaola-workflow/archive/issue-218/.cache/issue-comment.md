## Resolved — fail-closed `probeIssueState` in the GitLab/Gitea ports

**Fix:** both ports' `probeIssueState` replaced the binary `state === 'closed' ? 'closed' : 'open'` ternary with a fail-closed three-way (`closed`→closed, `open`→open, **residual→`unavailable`**). A degraded but exit-0 forge response (empty stdout or non-JSON stdout) now resolves to `{state:'unavailable', reason:'glab/tea issue state unverified'}`, so `claimProject`'s fail-closed guard fires instead of claiming an unverifiable issue. Root + Codex were already correct and are unchanged.

**Files**
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (+3 tests)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (+3 tests)

**Validation:** RED-first (pre-fix the new shim tests showed `state=open`, proving the mock drives the real `glabExec/teaExec → parseJson → normalizeIssue` pipeline) → GREEN. `npm test` passes across all four editions (claude/codex/gitlab/gitea); both port contract validators pass. Code review + security review: zero CRITICAL/HIGH.

**Planned commit:** `fix(#218): fail-closed GitLab/Gitea probeIssueState on degraded exit-0 forge response`

**Related follow-up (not filed — flagged for triage):** the two port classifiers carry the same latent degraded fail-open — `checkDependsOn`, `classifyIssue`, `cmdClassify` treat a degraded `state:'unknown'` as claimable-open. This was deliberately left out of #218 (which is probe-scoped per the title + suggested fix). Worth a separate issue if you want forge-wide fail-closed parity.
