# code-explorer raw output — issue-167 (Gitea closure-audit port)

> NOTE: dispatched with model=opus (Sonnet rate-limited). Gitea-specific deltas vs the #166 GitLab template.

Headline: Gitea keeps GitHub's `pr`/PR naming (NOT renamed to MR), but matches GitLab's lowercase remote state and forge-object routing.

## 1. Gitea layout — NO existing kaola-gitea-workflow-closure-audit.js (confirmed)
Siblings: kaola-gitea-forge.js, kaola-gitea-workflow-active-folders.js, kaola-gitea-workflow-roadmap.js, kaola-gitea-workflow-claim.js, test-gitea-workflow-scripts.js, test-gitea-forge-helpers.js, simulate-gitea-workflow-walkthrough.js, validate-kaola-workflow-gitea-contracts.js.

## 2. kaola-gitea-forge.js API
- CLAIM_LABEL='workflow:in-progress' (7), exported (285).
- teaExec(args,opts) (12-36): OFFLINE via KAOLA_WORKFLOW_OFFLINE==='1' (6) + options.offline→offlineStdout||'' (15). Mock env **KAOLA_TEA_MOCK_SCRIPT** (21). Injected options.execFileSync runner (17-19). Live calls do one-time `tea --version>=0.9.2` check (24-34); tests bypass via injected runner/env mock.
- **listIssues(opts)** (151-157): NO labels filter. Args=['issues','list','--output','json','--limit',String(perPage||100)] then optional `--state <state>` (154). SAME gap as GitLab — must ADD labels push. tea uses **`--labels`** (plural); updateIssueLabels uses `--add-labels=`/`--remove-labels=` comma-joined (167-168), so idiomatic list filter likely `--labels=<csv>`. VERIFY exact tea flag in Phase 2 (analog of #166 glab --label check).
- viewIssue(issueNum,opts) (159-162): `tea issues view <n> --output json`; .state lowercased.
- **updateIssueLabels(project, issueNum, {add,remove})** (164-172): uses **{remove}** (NOT GitLab {unlabels}). Runs `tea issues edit <n> --remove-labels=<csv>`. CRITICAL: `project` param declared but NEVER read in body — can pass null/undefined; tea resolves repo from cwd.
- **viewPullRequest(prNumber, opts)** (221-224): PR-view named **viewPullRequest** (NOT viewMergeRequest). **Takes a NUMBER not a URL** (`tea pr view <prNumber> --output json`). Returns normalizePullRequest; .state via normalizeState.
- normalizeState(raw) (74-80): **LOWERCASES** → open/closed/merged. viewPullRequest(...).state is lowercase. Compare `state==='merged'||state==='closed'` (lowercase, MATCHES GitLab, OPPOSITE GitHub uppercase).
- Exports (284-294): CLAIM_LABEL, QUEUED_LABEL, teaExec, labelsOf, uniqueLabels, preserveWorkflowLabels, normalizeState, normalizeProject, normalizeIssue, normalizePullRequest, discoverProject, listIssues, viewIssue, updateIssueLabels, closeIssue, createIssueComment, listIssueComments, updateIssueComment, createPullRequest, viewPullRequest, listPullRequests, checkServerVersion, checkRepoSquashEnabled, mergePullRequest, ensureLabel.

## 3. kaola-gitea-workflow-active-folders.js
- Exports (134-142): field, getRoot, isSafeName, issueIsClosed, probeIssueState, parseStateFile, readActiveFolders. All closure-audit imports present.
- firstPositiveInteger (34-40) PRIVATE — not needed (D4 handled in parseStateFile).
- Folder PR fields (80-82, 124-125): **pr_url** and **pr_number** (NOT pr_iid, NOT mr_*). sink defaults 'merge' (77).
- parseStateFile (64-83): D4 handled — issue_iid=firstPositiveInteger(field('issue_iid'),field('issue_number')) (66); sets both issue_iid+issue_number (70-71). archiveClosedIssues can read issue_iid||issue_number.
- readActiveFolders(root,{excludeClosedIssues}) (89-132): items expose project, project_dir, issue_number, issue_iid, sink, pr_url, pr_number, worktree_path, full_name, project_html_url.

## 4. kaola-gitea-workflow-roadmap.js
- roadmapDir(root) DEFINED (57) but **NOT EXPORTED** (352-363). SAME gap as GitLab — MUST add export.
- regenerateRoadmap (358) + readRoadmapIssues (356) exported. Good.

## 5. kaola-gitea-workflow-claim.js references
- **prNumberFromFolder(folder)** (904-909): parses folder.pr_number first (905), else folder.pr_url matched `/\/pulls\/(\d+)/` (907). Returns NUMBER. closure-audit helper named prNumberFromFolder, regex `/pulls/(\d+)` (Gitea URL shape, NOT GitLab merge_requests/N).
- PR-watch: watchMergeRequests(root,args) (911) dispatched by cmdWatchPr() (973, 'watch-pr' at 1034). Gates folder.sink!=='pr' (917), prNumberFromFolder (918), forge.viewPullRequest(prNumber).state (922), lowercase 'merged' (923)/'closed' (947). detectUnarchivedPrFolders mirrors this.
- clearAdvisoryClaim(issueIid,reason,projectInfo) (294-309): returns 'skipped_offline' (295)/'removed' (300)/'failed' (296). Calls forge.updateIssueLabels(projectInfo, issueIid, {remove:[CLAIM_LABEL]}) (299); guards on projectInfo.full_name truthy (298) — convention, not hard requirement (forge ignores project).

## 6. Test infra (test-gitea-workflow-scripts.js)
- withForge(stubs,fn) (27-38). writeState(root,project,issueNum,extra) (44-73) — issue_number:+sink: merge, extra appends. writeShimFiles(shimPath,jsLines) (119-121) writes <shimPath>.js. **teaMockEnv(binDir)** (123-126) → {KAOLA_TEA_MOCK_SCRIPT: <binDir>/tea.js}. runClaimOnline(args,cwd,binDir) (100-114) uses teaMockEnv. NO existing runClosureAudit/Offline/closureAuditShim/makePrSinkFolder — CREATE (mirror GitLab).
- Registration: MIXED pattern (inline withForge IIFEs at top-level + named functions testStaleWorktreeCheck/Cleanup, testGiteaRoadmapValidateRemote, testGiteaClassifierFailClosed). New testClosureAudit* invoked at file bottom after existing named-test calls. READ the tail before adding calls.
- Forge-API: test-gitea-forge-helpers.js exists; listIssues tests (97-98) assert `issues list --output json --limit 100` and `--limit 50 --state open`. NO labels test. ADD one (mirror GitLab 95-96, tea arg shape). Note tea uses **`--limit`** not `--per-page`.
- Mock env KAOLA_TEA_MOCK_SCRIPT; shim binary **tea** (tea.js).
- Walkthrough: simulate-gitea-workflow-walkthrough.js.

## 7. install.sh Gitea SUPPORT_SCRIPT_NAMES
Lines **157-168** (gitea case, SOURCE_SCRIPTS_DIR at 155). Add kaola-gitea-workflow-closure-audit.js.

## 8. docs/api.md insertion points
- Heading 627: `### Closure audit and repair (issue #165; GitLab port #166)` → add Gitea (`; Gitea port #167`).
- Drift table 653 documents unarchived_pr_folders — Gitea keeps this name.
- After GitLab subsection (713-731): add parallel `#### Gitea edition (issue #167)` — keeps unarchived_pr_folders/pr_url/pr_state (NO MR rename), lowercase merged/closed from forge.viewPullRequest, label removal via forge.updateIssueLabels(project, n, {remove}).
- Flow-map row 747 ends `...Gitea deferred (#167). | #166` — mark Gitea shipped.
- Follow-up bullet 757 ends `...Gitea port remains as follow-up #167.` — mark shipped.

## 9. validate-kaola-workflow-gitea-contracts.js — forbidden token
- Gitea forbidden token is **`glab`**, NOT gh. assertNoForbidden (43-58) forbids /\bglab\b/ (49) + gitlab.com/GitLab/MR URL/MR number/merge request (50-55) — applied to commands/skills/hooks/agents (133-135), NOT scripts/*.js.
- Scripts loop (351-357): every scripts/*.js (except validator) asserts !/\bglab\b/ (355) + no root/GitHub fallback require('../...') (356). New script auto-covered.
- Implication: avoid `glab` + MR/merge-request wording. GitHub source uses `gh` (not banned in gitea scripts) but rewrite to tea-flavored ('tea issues list failed') for consistency.
- TWO hardcoded arrays that DON'T auto-discover — MUST update or validator FAILS:
  - scriptFiles (146-160): exact-match exists checks. Add kaola-gitea-workflow-closure-audit.js.
  - installSupportScripts (164-175): asserts install.sh includes each name. Add kaola-gitea-workflow-closure-audit.js.

## GitLab→Gitea substitution map
- require ./kaola-gitea-forge / -active-folders / -roadmap.
- forge.viewMergeRequest(mrIid) → forge.viewPullRequest(prNumber) (NUMBER arg).
- mrIidFromFolder + merge_requests/(\d+) → prNumberFromFolder + /pulls/(\d+); folder.pr_number then folder.pr_url.
- class unarchived_mr_folders/mr_url/mr_state/sink!=='mr' → unarchived_pr_folders/pr_url/pr_state/sink!=='pr' (KEEP GitHub names per #167).
- state compare lowercase merged/closed — SAME.
- forge.updateIssue(it.number,{unlabels:[CLAIM_LABEL]}) → forge.updateIssueLabels(project, it.number, {remove:[CLAIM_LABEL]}) — project can be null.
- stderr 'glab issue list failed' → 'tea issues list failed' (avoid glab).
- test helpers: closureAuditShim writes tea shim (<binDir>/tea.js + KAOLA_TEA_MOCK_SCRIPT); makePrSinkFolder writes sink: pr + pr_url (/pulls/N) + pr_number.
- listIssues({labels}) added — Gitea uses tea arg shape (likely --labels=<csv>; VERIFY).
- roadmapDir export added to kaola-gitea-workflow-roadmap.js.

## TWO new Gitea deltas beyond GitLab template
1. viewPullRequest takes a NUMBER not URL — MUST resolve via prNumberFromFolder(f), cannot pass f.pr_url.
2. updateIssueLabels requires project first-arg in signature but ignores it — pass null (simplest) or discovered project for symmetry. No discoverProject() needed.

## 11 testClosureAudit* to mirror (GitLab calls 2128-2138)
OfflineRemoteClassesSkipped, ClosedRemoteRoadmapSource, ArchiveClosedDrift, DedupRoadmapAndArchive, MirrorListsClosedIssues, StaleInProgressLabels, ActiveFolderForClosedIssueReportsDirty, UnarchivedMrFolderMergedLowercase (→ rename ...PrFolder...), ExecuteRepairsRoadmapAndLabels, ExecuteNeverTouchesActiveFolders, DryRunNeverCallsRemoveLabel.
