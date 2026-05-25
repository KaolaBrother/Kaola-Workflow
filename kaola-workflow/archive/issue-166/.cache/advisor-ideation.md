# advisor-ideation raw output — issue-166 (Phase 2 gate)

## Advisor verdict: plan sound, proceed.
The five recommendations are conservative and well-justified; planner correctly
caught the highest-risk silent bug (D2 state-casing). No missed approaches that
would change the decision. D1–D5 recommendations stand; no risk re-rating.

## Verifications required before Phase 3 (all completed in-session)
1. **glab label-filter flag spelling** — VERIFIED: `glab issue list` uses `-l`/`--label`
   (singular; multiple labels comma-separated or by repeating the flag). The D1 forge
   change `args.push('--label', label)` per label is correct and matches the existing
   `updateIssue` flag (forge.js:139). Cover in the new forge unit test.
2. **Separate `plugins/kaola-workflow-gitlab-codex/` tree?** — VERIFIED: NO. `ls plugins/`
   shows only `kaola-workflow`, `kaola-workflow-gitlab`, `kaola-workflow-gitea`. The
   codex variant test sits in-tree (`simulate-gitlab-codex-workflow-walkthrough.js`
   inside kaola-workflow-gitlab/scripts/). No extra copy obligation. Planner's
   "no sync obligation" confirmed.
3. **Forge-API test placement** — add a DIRECT test for `listIssues({state,labels})`
   producing the right glab args in `test-gitlab-forge-helpers.js` (forge-API unit-test
   home), separate from the audit-behavior tests in `test-gitlab-workflow-scripts.js`.
   Don't conflate forge-API coverage with audit-behavior coverage.

## D2 reinforcement (highest-risk silent bug)
Lowercase MR-state compare is the single most dangerous line. Name the guard test
explicitly (e.g. `testClosureAuditUnarchivedMrFolderMergedLowercase`) so the casing
constraint is visible at the test-runner registration site. If a future refactor
reintroduces `.toUpperCase()` mirroring GitHub, the test name flags what's protected.

## Forward note (#167 Gitea port)
The Gitea port will face the SAME listIssues label gap and likely the same state-casing
question in kaola-gitea-forge.js. The decision template locked in here transfers
directly — when reaching #167, verify each gap exists in the Gitea forge, apply the
same recommendation, document the parallel; don't re-ideate the five decisions.
