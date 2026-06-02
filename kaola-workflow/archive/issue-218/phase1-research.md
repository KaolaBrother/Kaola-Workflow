# Phase 1 - Research / Discovery: issue-218

## Deliverable
Fix `probeIssueState` in the GitLab and Gitea forge ports so a degraded but
exit-0 forge response (empty stdout OR non-JSON stdout) returns
`{ state: 'unavailable' }` instead of `{ state: 'open' }`, restoring the
fail-closed claim guard. Add port-level tests asserting `unavailable` for the
empty and non-JSON degraded shapes (parity with root's
`testProbeIssueStateEmptyGhResponse`).

## Why
`claimProject` keys a deliberate fail-closed guard on
`probe.state === 'unavailable'` (refuse to claim an issue whose remote state
could not be verified). Today the ports route the probe through
`forge.viewIssue` → `parseJson(raw, {})`, which swallows both degraded cases to
`{}` → `normalizeIssue({})` → state `unknown` → `probeIssueState` returns
`open`. A degraded-but-exit-0 forge response (the most common shape: a CLI
emitting a warning/progress line, or empty stdout) is therefore treated as a
verified-open issue, so the guard never fires and the workflow can begin work on
a closed/unverifiable issue.

## Affected Area
- ROOT (reference, already correct — DO NOT change):
  `scripts/kaola-workflow-active-folders.js:56-70` (`probeIssueState`);
  guard `scripts/kaola-workflow-claim.js:392-399`.
- GitLab port (needs fix):
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js:51-62`
  (`probeIssueState`); `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`
  (`viewIssue:138`, `parseJson:26`, `normalizeIssue:94`, `normalizeState:62`).
- Gitea port (needs fix):
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js:51-65`
  (`probeIssueState`); `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
  (`viewIssue:168`, `parseJson:44`, `normalizeIssue:122`, `normalizeState:80`).
- Tests: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`.
- Claim guards in both ports are already correct; no change there.

## Key Patterns Found
1. Root three-way logic to mirror: empty raw → `unavailable`; `JSON.parse`
   throw (incl. non-JSON) → catch → `unavailable`; parsed → closed/open.
   `scripts/kaola-workflow-active-folders.js:56-70`. Root inspects raw BEFORE
   `JSON.parse` because it calls `ghExec` directly (no forge layer).
2. The swallow: ports call `forge.viewIssue` →
   `normalizeIssue(parseJson(raw, {}))`. `parseJson` returns `{}` for empty
   (`!raw`) and non-JSON (catch). `normalizeIssue({}).state === 'unknown'`
   (`normalizeState(undefined)` → `'unknown'`). Port ternary
   `'unknown' !== 'closed'` → `'open'`. `kaola-gitlab-forge.js:26,62,94,138`;
   `kaola-gitea-forge.js:44,80,122,168`.
3. No `viewIssueRaw`-style raw accessor exists in either forge — port
   `probeIssueState` cannot see the raw string today.
4. Two viable fix loci (a Phase-2 decision, NOT chosen here):
   (a) add a raw accessor (e.g. `viewIssueRaw`) + replicate root's empty/throw
   three-way check in port `probeIssueState`; or
   (b) map `normalizeIssue` state `unknown` → `unavailable` inside port
   `probeIssueState` (minimal: issue states are only opened/closed, so
   `unknown` reliably signals a degraded response).

## Test Patterns
- Framework: hand-rolled `assert` in root walkthrough; Node `assert` module in
  the GitLab/Gitea port test files.
- Location: new tests go in
  `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
  (run via `simulate-gitlab/gitea-workflow-walkthrough.js` →
  `run('test-*-workflow-scripts.js')`).
- Structure: existing `withForge` in-process stubs (`viewIssue` → null/throw/
  closed) at gitlab `410-439` / gitea `420-443`; subprocess shim helpers
  `writeShimFiles` + `glabMockEnv`/`teaMockEnv` already present
  (gitlab `122/126`, gitea `120/124`). Reference: root
  `testProbeIssueStateEmptyGhResponse` (`simulate-workflow-walkthrough.js:813`).
- Injection choice (Phase-2/3 decision): `withForge` stub of `viewIssue`
  returning `{state:'unknown'}` (tests probeIssueState mapping; bypasses real
  swallow) vs. subprocess shim feeding empty/non-JSON exit-0 (tests the full
  glabExec→parseJson→normalizeIssue→probeIssueState path; direct root mirror).

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE` → probe short-circuits to `{open, offline-or-null}`
  (all editions); guard skips `unavailable` refusal when offline.
- `KAOLA_GH_REMOTE_TIMEOUT_MS` — exec timeout (same name across editions).
- `KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT` / `KAOLA_GH_MOCK_SCRIPT` —
  test CLI override (subprocess via `process.execPath [mockScript, ...args]`).
- CLI: GitLab `glab issue view {iid} --output json`; Gitea
  `tea issues view {num} --output json`; root `gh issue view {n} --json state`.

## Contract / Parity Constraints (hard gates)
- `validate-kaola-workflow-gitlab-contracts.js:387-393` — every GitLab port JS
  must satisfy `!/\bgh\b/` (no `gh` token) + no cross-tree requires.
- `validate-kaola-workflow-gitea-contracts.js:394-400` — every Gitea port JS
  must satisfy `!/\bglab\b/` AND `!/\bgh\b/` + no cross-tree requires.
  → New reason strings must read e.g. `empty glab response` / `empty tea
  response`, never `gh`.
- `validate-script-sync.js` — root ↔ Codex byte-identity for COMMON_SCRIPTS;
  GitLab/Gitea are independent (editing the ports needs no root/Codex change).
- `node scripts/simulate-workflow-walkthrough.js` must still exit 0.

## External Docs
docs-lookup: N/A — internal forge-port logic only; no external library/API
behavior to verify (the `glab`/`tea`/`gh` CLI contracts in scope are already
encoded in the repo's own port code).

## GitHub Issue
KaolaBrother/Kaola-Workflow#218

## Completeness Score
10/10 (goal 3/3, expected outcome 3/3, scope boundaries 2/2, constraints 2/2)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal forge-port logic; no external API behavior to verify | no external/library/framework dependency in scope |

## Notes / Future Considerations
- The Codex twin (`plugins/kaola-workflow/scripts/...`) uses the root inline
  `ghExec` implementation and is already correct — out of scope.
- Decision deferred to Phase 2: which fix locus (raw accessor vs.
  unknown→unavailable mapping) and which test injection level. Per the active
  /goal, this human-style design decision will follow the advisor's
  recommendation if it remains genuinely ambiguous after Phase 2 ideation.
