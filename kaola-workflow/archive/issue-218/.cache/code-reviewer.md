# code-reviewer — issue-218 (model: opus) — review only

## Verdict: APPROVE — nothing blocking (0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW)

### Three-way correctness (verified end-to-end)
- viewIssue → normalizeIssue(parseJson(raw,{})) → normalizeState(data.state) (gitlab-forge :62-68, gitea-forge :80-86).
- Degraded exit-0 (empty/non-JSON) → parseJson {} → data.state undefined → normalizeState 'unknown' → residual branch → {state:'unavailable'}. Correct.
- Open: GitLab 'opened' / Gitea 'open' both normalize to 'open' → branch 2. Reading the post-normalized value handles 'opened'→'open'. Correct.
- Closed → branch 1. 'merged' cannot reach an issue probe (issues are open/closed only). No legit state wrongly mapped to unavailable.
- Fail-closed wiring real: claimProject gates on probe.state === 'unavailable' (gitlab-claim :365, gitea-claim :369) → target_unavailable refusal — exactly the path the binary ternary defeated.

### Test quality (non-vacuous, confirmed)
- Subprocess mock: KAOLA_GLAB/TEA_MOCK_SCRIPT → glabExec/teaExec spawn process.execPath <shim> via execFileSync → real parseJson→normalizeIssue→normalizeState. Both empty (process.exit(0)) + non-JSON ("rate limit exceeded") covered per port.
- Each test asserts the EXACT reason string ("glab/tea issue state unverified"), discriminating the residual branch from the timeout/fetch-failed catch → a green test proves the shim flowed through the residual path, not a catch.
- withForge stub returning {state:'unknown'} adds direct branch coverage. Module OFFLINE=false (both files delete KAOLA_WORKFLOW_OFFLINE at :14) → no vacuous OFFLINE short-circuit.
- try/finally restores prevMock + fs.rmSync(recursive,force). No leakage. Both suites exit 0.

### Other checks
- Scope: only the 4 expected files. .roadmap/issue-218.md is a permitted durable-state source; issue-218/ + investigations doc are untracked workflow artifacts. No code-scope violation.
- Symmetry: GitLab vs Gitea differ only by param name (issueIid/issueNumber) + forge token (glab/tea).
- Token contract clean: no \bgh\b anywhere; no glab/gh in Gitea; no tea/KAOLA_TEA cross-contamination in GitLab.
- Style/limits: probeIssueState 14 (GitLab) / 15 (Gitea) lines (<50); files 152/150 lines (<800); no debug/leftover; immutable return objects.

### Non-blocking note (informational, not a finding)
issueIsClosed (gitlab/gitea active-folders :42-49) has the same degraded-response shape but is intentionally out of scope: it feeds folder filtering, not the claim guard, and its "treat unverifiable as not-closed" default is the safe direction there. No action for #218.
