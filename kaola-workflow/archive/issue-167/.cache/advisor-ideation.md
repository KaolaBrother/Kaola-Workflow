# advisor-ideation raw output — issue-167 (Phase 2 gate) — model=opus

## Verdict: plan sound, proceed. GitLab template confirmation rigorous; two Gitea divergences correctly pinned; Q1 verified.

## Q1 (tea label flag) — VERIFIED via context7 (High reputation)
`tea issues list --labels "bug,help wanted"` — single `--labels` flag, comma-joined value. Chose `--labels=<csv>`
(`=` form) for forge-convention consistency (matches existing `--remove-labels=`/`--add-labels=` at forge:167-168;
urfave/cli accepts both forms). Add a one-line comment in the forge change so the docs' space form doesn't tempt a "fix":
`// Pass --labels=<csv> matching the forge's existing --remove-labels=/--add-labels= idiom.`
detectStaleLabels calls forge.listIssues({state:'closed', labels:[CLAIM_LABEL]}) → emits `--labels=workflow:in-progress`.

## Phase 3 watch-items (load-bearing)
1. Rewrite the GitLab template's stderr `'glab issue list failed'` → `'tea issues list failed'`. `/\bglab\b/` is the
   Gitea contract validator's forbidden token (scripts loop 351-357); leaving `glab` would FAIL validation.
2. The TWO hardcoded contract-validator arrays (scriptFiles 146-160 + installSupportScripts 164-175) MUST be edited in
   the SAME task that creates the new script — both fail-closed if the new name is omitted. Bundle with install.sh
   registration into one wiring task (the #166 Task 3 equivalent).

## Pre-Phase-3 verifications — ALL DONE
1. No separate plugins/kaola-workflow-gitea-codex/ tree — confirmed (only 3 plugin trees). No extra sync obligation.
2. test-gitea-forge-helpers.js uses execFileSync injection (line 97-98: forge.listIssues({execFileSync})[0].issue_iid).
   New listIssues({labels}) test matches this shape. Uses issue_iid + perPage.
3. test-gitea-workflow-scripts.js registration tail: ends with `testGiteaClassifierFailClosed();` +
   `testGiteaOfflineBypassesFailClosed();` then async `testGiteaRoadmapInitIssueExclusiveAndUpdate().then(...)` printing
   "Gitea workflow script tests passed". New synchronous testClosureAudit* calls go AFTER testGiteaOfflineBypassesFailClosed()
   and BEFORE the async .then() block.

## D2 reinforcement
Name the casing guard test explicitly: testClosureAuditUnarchivedPrFolderMergedLowercase. Highest-risk silent bug.

## Comments (cheap insurance)
- Forge change: explain the `=<csv>` choice (above).
- updateIssueLabels(null,...) call site: `// project ignored by forge.updateIssueLabels body today (forge:164-172); revisit if it starts consuming the arg.`

## REBASE BASELINE UPDATE (user-requested rebase mid-Phase-2)
origin/main moved a6e6b2b → fae0698 ("fix(install): add kaola-workflow-closure-contract.js to all forge support scripts")
after #166 merged. Rebased workflow/issue-167 onto fae0698 (clean FF, 0 commits ahead). fae0698 touched ONLY install.sh:
added `kaola-workflow-closure-contract.js` to all three forge SUPPORT_SCRIPT_NAMES arrays. Impact on #167:
- The Gitea SUPPORT_SCRIPT_NAMES array shifted down ~2-3 lines (was research-noted 157-168). Phase 4 MUST read current
  line numbers fresh. New entry: `kaola-gitea-workflow-closure-audit.js` slots after `kaola-gitea-workflow-classifier.js`
  (alphabetical among kaola-gitea-* names; the shared closure-contract.js sits earlier after claim.js per fae0698).
- The contract validator was NOT touched by fae0698 — the two hardcoded arrays still need the new closure-audit name.
