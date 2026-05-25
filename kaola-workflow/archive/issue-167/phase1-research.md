# Phase 1 - Research / Discovery: issue-167

## Deliverable
Port the `closure-audit` command to the Gitea edition as a dedicated standalone
script `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`,
mirroring the just-shipped GitLab port (#166) with Gitea-specific substitutions,
plus Gitea walkthrough tests, install wiring, contract-validator array updates,
and docs/api.md coverage.

## Why
Edition parity. #165 shipped closure-audit GitHub-only; #166 ported to GitLab.
This follow-up (#167) closes the last gap for the Gitea edition.

## Affected Area
- NEW: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (listIssues labels opt)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` (export roadmapDir)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (tests + helpers)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` (forge-API labels test)
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (TWO hardcoded arrays)
- `install.sh` (Gitea SUPPORT_SCRIPT_NAMES, lines 157-168)
- `docs/api.md` (heading 627, new Gitea subsection after 713, flow row 747, follow-up bullet 757)

## Key Patterns Found
1. Structural template: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
   (302 lines) — mirror with Gitea substitutions. GitHub original `scripts/kaola-workflow-closure-audit.js`
   supplies the `unarchived_pr_folders` naming Gitea keeps.
2. `kaola-gitea-forge.js`: `listIssues({state,perPage})` — NO labels filter (gap, must add; tea uses
   `--labels`); `viewPullRequest(prNumber)` — takes a **NUMBER** (`tea pr view <n>`), `.state` LOWERCASE
   via `normalizeState` (74-80); `updateIssueLabels(project, issueNum, {remove})` — project ignored in body
   (164-172, can pass null); `CLAIM_LABEL='workflow:in-progress'`; mock env `KAOLA_TEA_MOCK_SCRIPT`.
3. `kaola-gitea-workflow-active-folders.js` exports field/getRoot/issueIsClosed/readActiveFolders;
   folders carry `pr_url`+`pr_number` (NOT mr_*); parseStateFile (64-83) already does issue_iid||issue_number (D4).
4. `kaola-gitea-workflow-claim.js`: `prNumberFromFolder` (904-909, folder.pr_number then regex `/\/pulls\/(\d+)/`),
   `cmdWatchPr`/`watchMergeRequests` (911-973) lowercase merged/closed compare, `clearAdvisoryClaim` (294-309)
   label-removal reference via `updateIssueLabels(projectInfo, iid, {remove:[CLAIM_LABEL]})`.
5. `kaola-gitea-workflow-roadmap.js`: `roadmapDir` defined (57) but NOT exported (352-363) — must add export.

## Gitea deltas vs the GitLab template (the plan MUST apply)
- **KEEP PR naming**: `unarchived_pr_folders`, item fields `pr_url`/`pr_state`, gate `f.sink !== 'pr'`,
  `f.pr_url` — do NOT rename to MR (issue #167 explicit).
- **viewPullRequest takes a NUMBER**: resolve via `prNumberFromFolder(f)` (regex `/pulls/(\d+)`); cannot pass `f.pr_url`.
- **Label removal**: `forge.updateIssueLabels(project, it.number, {remove:[CLAIM_LABEL]})` (project can be null).
- **State LOWERCASE** (same as GitLab; NOT GitHub uppercase) — highest-risk silent bug.
- **listIssues labels filter** must be added (verify exact `tea issues list` flag — likely `--labels`).
- **roadmapDir export** must be added.
- **D4**: archiveClosedIssues reads `field(content,'issue_iid')||field(content,'issue_number')`.
- **Contract validator** forbids `glab` (NOT gh) in scripts; avoid `glab` + MR/merge-request wording.
  Rewrite GitHub `gh`-flavored stderr to `tea issues list failed`.
- **TWO hardcoded arrays in validate-kaola-workflow-gitea-contracts.js** (scriptFiles 146-160,
  installSupportScripts 164-175) MUST add the new script name or the validator FAILS.

## Test Patterns
- Framework: hand-rolled `require('assert')`, no test runner.
- Location: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — has `withForge`,
  `writeState`, `writeShimFiles`, `teaMockEnv`/`KAOLA_TEA_MOCK_SCRIPT`; mixed registration (inline IIFEs +
  named functions). Add `runClosureAudit`/`runClosureAuditOffline`/`closureAuditShim`(writes `tea` shim)/
  `makePrSinkFolder` (sink: pr + pr_url `/pulls/N` + pr_number). Register 11 `testClosureAudit*` at file tail
  (read the tail first).
- Forge-API: `test-gitea-forge-helpers.js` — add a `listIssues({labels})` test (tea uses `--limit` not `--per-page`).
- Entry: `npm run test:kaola-workflow:gitea` (validate-vendored-agents, validate-kaola-workflow-gitea-contracts,
  simulate-gitea-workflow-walkthrough, simulate-gitea-codex-workflow-walkthrough).

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — gates remote classes (stale_in_progress_labels, unarchived_pr_folders) to "skipped_offline".
- `KAOLA_TEA_MOCK_SCRIPT` — test injection of the `tea` binary.
- install.sh Gitea SUPPORT_SCRIPT_NAMES (157-168). No validate-script-sync obligation (edition scripts tree-specific).

## External Docs
None. docs-lookup: N/A — internal patterns sufficient; `tea` CLI wrapped by `kaola-gitea-forge.js`.

## GitHub Issue
KaolaBrother/kaola-workflow#167

## Completeness Score
10/10 (goal 3, outcome 3, scope 2, constraints 2)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md (model=opus; Sonnet rate-limited) | |
| docs-lookup | N/A | docs impact check: pure internal patterns, tea wrapped by forge | no external/library behavior needed |

## Notes / Future Considerations
- Phase 2 must verify the exact `tea issues list` label-filter flag (analog of #166's verified `glab --label`).
- This is the last of the two #161/#165 follow-up ports; after #167 the cross-forge closure-audit coverage is complete.
