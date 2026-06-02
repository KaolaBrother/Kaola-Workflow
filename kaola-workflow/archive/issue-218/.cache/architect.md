# code-architect — issue-218 blueprint (model: opus) — Option A LOCKED

## Design decisions
- Three-way on the RESIDUAL, fail-closed: explicit `closed`/`open` arms + residual `else` → `{state:'unavailable'}`. Keys on residual (not literal `=== 'unknown'`) so any future non-open/non-closed value also fails closed. Invariant: GitLab/Gitea issues are only opened/closed.
- No forge change, no new export, no consumer change. Verified consumers already fail-closed on `'unavailable'`: GitLab claim `:362-367` (target_unavailable), closure-audit `:67-68` (unresolved); Gitea claim `:365`, finalize `:677-678` (only branches on 'closed', residual → unchanged else). Fix contained in `probeIssueState`.
- Contract-safe reasons: GitLab `'glab issue state unparseable'` (bare `glab` OK; no `gh`/compound-glab/GitHub/PR). Gitea `'tea issue state unparseable'` (`tea` OK; no `glab`/`gh`/GitLab/MR).
- Decisive test = in-process `active.probeIssueState(N)` + subprocess shim via `KAOLA_GLAB_MOCK_SCRIPT`/`KAOLA_TEA_MOCK_SCRIPT` (read at call-time in glabExec/teaExec). Module OFFLINE const already false (test file deletes KAOLA_WORKFLOW_OFFLINE at `:14` before require at `:17`). No `-e` wrapper needed (that idiom at `:2659` only restores OFFLINE=1, which we don't want).

## Files to modify (only these)
1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js:51-62` — rewrite probeIssueState body.
2. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js:51-65` — symmetric rewrite (param issueNumber, token tea).
3. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — 2 named shim tests + 1 supplementary withForge block; register near `:2737`.
4. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — mirror; register near `:2704`.

## GitLab probeIssueState (diff)
```diff
   try {
     const issue = forge.viewIssue(issueIid);
-    return { state: issue.state === 'closed' ? 'closed' : 'open', reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'glab issue state unparseable' };
   } catch (err) {
```
## Gitea probeIssueState (diff)
```diff
   try {
     const issue = forge.viewIssue(issueNumber);
-    const state = issue.state === 'closed' ? 'closed' : 'open';
-    return { state, reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'tea issue state unparseable' };
   } catch (err) {
```

## House test idiom (confirmed)
- `writeShimFiles(shimPath, jsLines)` writes `shimPath + '.js'` with `jsLines.join('\n')` (GitLab `:122`, Gitea `:120`). Exemplar `writeGlabShimForStale` `:189-200`.
- forge reads `KAOLA_GLAB_MOCK_SCRIPT`/`KAOLA_TEA_MOCK_SCRIPT` at call time → `execFileSync(process.execPath,[mock,...args])`.
- in-process `active.probeIssueState(N)`; temp via `fs.mkdtempSync`; cleanup `fs.rmSync(...,{recursive,force})` in finally; restore prev mock env.

## New tests (GitLab) — append ~after :2674, register at bottom
testGitlabProbeResidualEmptyExit0: shim `["process.exit(0);"]` (empty exit0) → assert state==='unavailable', reason==='glab issue state unparseable'.
testGitlabProbeResidualNonJsonExit0: shim `["process.stdout.write('rate limit exceeded\\n');"]` → same asserts.
Supplementary withForge near `:429-439`: `viewIssue(){return {state:'unknown'}}` → assert unavailable + reason.
(Gitea mirror: testGiteaProbeResidualEmptyExit0 / NonJsonExit0 with `tea` shim + `tea issue state unparseable`; register near `:2704`; supplementary near `:436-443`.)

## Build sequence (RED-first)
1. Write 4 named shim tests + 2 supplementary blocks; register named fns.
2. RED checkpoint: run both test files on UNFIXED code. New shim tests MUST fail with state==='open' (old ternary maps residual 'unknown'→'open'). A failure with state==='unavailable' is NOT acceptable — means shim threw (caught → fabricated unavailable, bypassing parseJson/normalizeIssue) = broken setup. Fix shim until pre-fix state is 'open'.
3. Apply GitLab rewrite.
4. Apply Gitea rewrite (symmetric).
5. GREEN: re-run both test files; all 4 shim tests + 2 supplementary pass.
6. Run both contract validators; new reason strings pass.
7. Regression: both simulate walkthroughs + root walkthrough exit 0.

## Parallelization
G1 (GitLab): active-folders + test-gitlab — disjoint. G2 (Gitea): active-folders + test-gitea — disjoint. Parallel-safe. Shared concern = SYMMETRY: same three-way shape/branch order/reason structure; only param name, token, pre-existing style differ. Recommended: do G1 through RED first to lock pattern, then mirror to G2.

## Validation command set (verified)
```
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js   # new tests live here — NOT in npm test
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js     # new tests live here — NOT in npm test
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
node scripts/simulate-workflow-walkthrough.js
npm test
```
CAVEAT: `npm test` does NOT run test-gitlab/gitea-workflow-scripts.js — the two direct `node` invocations are MANDATORY.

## Out of scope
Forge files, claim/claimExplicitTarget, closure-audit, classifier follow-up, issueIsClosed (`:42-49`), root, Codex. No new exports/signatures/consumer changes.

## Missing facts / risks
None blocking. All line numbers + residual mechanism (normalizeState('')→'unknown') + consumer fail-closed + validator regexes + walkthrough mock + absence of any residual→'open' test verified against live files. Likeliest slip: shim path wrong / shim throws → pre-fix shows 'unavailable' (treat as setup bug). Reason-string arbiter = contract validators.
