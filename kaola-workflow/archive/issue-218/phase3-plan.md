# Phase 3 - Plan: issue-218

Approach: **Option A (LOCKED)** — fail-closed three-way `probeIssueState` in the
GitLab + Gitea ports. Reason strings refined to `unverified` per advisor (reads
true for both empty and non-JSON degraded shapes; contract-safe).

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` (`probeIssueState`, ~51-62) | Binary `closed?:open` ternary → three-way: `closed`→closed, `open`→open, residual→`{state:'unavailable', reason:'glab issue state unverified'}` | Fail-closed on degraded exit-0 so the claim guard fires |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` (`probeIssueState`, ~51-65) | Symmetric rewrite; reason `'tea issue state unverified'`; param `issueNumber` | Symmetric fix |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `testGitlabProbeResidualEmptyExit0` + `testGitlabProbeResidualNonJsonExit0` (subprocess shim via `KAOLA_GLAB_MOCK_SCRIPT`, in-process `active.probeIssueState`); register near `:2737`. Optional supplementary `withForge` residual block near `:429-439` | RED-first proof through the real pipeline |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Mirror with `KAOLA_TEA_MOCK_SCRIPT`; register near `:2704`; supplementary near `:436-443` | RED-first proof, symmetric |

### Exact change shape
GitLab:
```diff
   try {
     const issue = forge.viewIssue(issueIid);
-    return { state: issue.state === 'closed' ? 'closed' : 'open', reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'glab issue state unverified' };
   } catch (err) {
```
Gitea:
```diff
   try {
     const issue = forge.viewIssue(issueNumber);
-    const state = issue.state === 'closed' ? 'closed' : 'open';
-    return { state, reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'tea issue state unverified' };
   } catch (err) {
```
(Read `issue.state` AFTER normalization — `normalizeState` maps `'opened'`→`'open'`,
so the `=== 'open'` arm matches normalized values; degraded `{}` → `'unknown'` →
residual → `unavailable`.)

### Build Sequence
1. Write the 4 named shim tests + 2 supplementary `withForge` blocks; register the
   named fns in each file's bottom sequential block. [no dep]
2. **RED checkpoint** — run both test files on UNFIXED code; the 4 shim tests MUST
   fail with `state === 'open'` (old ternary maps residual `unknown`→`open`). A
   pre-fix failure showing `state === 'unavailable'` is NOT acceptable — it means
   the shim threw and the catch fabricated `unavailable`, bypassing
   `parseJson`/`normalizeIssue` (vacuous test); fix the shim until pre-fix is
   `open`. [dep: 1]
3. Apply GitLab `probeIssueState` rewrite. [dep: 2 — lock pattern here first]
4. Apply Gitea `probeIssueState` rewrite (symmetric). [dep: 3]
5. **GREEN checkpoint** — re-run both test files; all 4 shim + 2 supplementary pass. [dep: 3,4]
6. Run both contract validators; confirm `unverified` reason strings pass. [dep: 3,4]
7. Regression — both simulate walkthroughs + root walkthrough + `npm test` exit 0. [dep: 5,6]

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| G1 | Task 1 (GitLab src+test) | Write set disjoint from G2 |
| G2 | Task 2 (Gitea src+test) | Write set disjoint from G1 |

Shared concern = SYMMETRY (same three-way shape/branch order/reason structure).
Recommended sequencing: complete G1 through its RED checkpoint to lock the pattern,
then mirror to G2 — cheaper than fixing an asymmetry after both are written.

### External Dependencies
None. No new packages, imports, env vars, or config flags.

## Task List

### Task 1: GitLab port fail-closed probe + RED-first tests
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: those two files only
- Depends On: none
- Parallel Group: G1
- Action: MODIFY
- Implement: three-way `probeIssueState` (closed/open/residual→unavailable,
  reason `'glab issue state unverified'`); add `testGitlabProbeResidualEmptyExit0`
  (shim `["process.exit(0);"]`) + `testGitlabProbeResidualNonJsonExit0` (shim
  `["process.stdout.write('rate limit exceeded\\n');"]`), both set
  `KAOLA_GLAB_MOCK_SCRIPT` to `binDir/glab.js`, call `active.probeIssueState(N)`
  in-process, assert `state==='unavailable'` and reason; restore prev mock env +
  rm temp in `finally`; register both near `:2737`. Optional supplementary
  `withForge({viewIssue(){return {state:'unknown'}}})` residual block near `:429`.
- Mirror: `writeShimFiles:122` + `glabMockEnv:126` idiom; exemplar
  `writeGlabShimForStale:189-200`; root `testProbeIssueStateEmptyGhResponse`.
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
  then `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`

### Task 2: Gitea port fail-closed probe + RED-first tests
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: those two files only
- Depends On: Task 1 (pattern lock; otherwise independent)
- Parallel Group: G2
- Action: MODIFY
- Implement: symmetric three-way (reason `'tea issue state unverified'`, param
  `issueNumber`); add `testGiteaProbeResidualEmptyExit0` + `testGiteaProbeResidualNonJsonExit0`
  using `KAOLA_TEA_MOCK_SCRIPT`→`binDir/tea.js`; register near `:2704`; supplementary
  `withForge` block near `:436`.
- Mirror: `writeShimFiles:120` + `teaMockEnv:124`.
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
  then `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

### Final validation (after Task 1 + 2)
```
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node scripts/simulate-workflow-walkthrough.js
npm test
```

## Test-wiring fact (reconciled — was a subagent contradiction)
`npm test` (`package.json:35`) → `test:kaola-workflow:gitlab` (`:38`) →
`simulate-gitlab-workflow-walkthrough.js` → `:157 run('test-gitlab-workflow-scripts.js')`;
and `test:kaola-workflow:gitea` (`:39`) → `simulate-gitea-workflow-walkthrough.js` →
`:245 run('test-gitea-workflow-scripts.js')`. **The new tests ARE in the `npm test`
regression path** — code-explorer §5 confirmed, architect §6 ("npm test does not run
them") was incorrect. No CI-orphan; nothing to surface as a wiring gap in Phase 6.
The direct `node` invocations remain the fast isolated path for the RED checkpoint.

## Advisor Notes
Plan gate PASSED (`.cache/advisor-plan.md`): dependency-safe, implementable from the
plan alone, edge cases covered. RED-first nuance (pre-fix must fail `open`, not
`unavailable`) is the key guard. Claim-level integration test is optional — do not
expand scope. Reason strings refined to `unverified`. Option A locked.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor gate passed with no blueprint gaps; only a subagent fact-conflict (test wiring) which the orchestrator resolved in-tree |

## Out of Scope
Forge files, claim/`claimExplicitTarget`, closure-audit, `issueIsClosed`, root,
Codex — all untouched. No new exports/signatures/consumer changes. **Named
follow-up (not fixed here):** classifier latent fail-open on degraded state
(`checkDependsOn:157`, `classifyIssue:302`, `cmdClassify:352` in both port
classifiers) — file as a new issue, note in Phase-6 close note / PR body / final report.
