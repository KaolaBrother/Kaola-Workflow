# code-architect raw output — issue-167 (Gitea closure-audit port) — model=opus

Faithful template-port of the shipped #166 GitLab script with the locked Gitea substitution map. All remote I/O through kaola-gitea-forge.js; execFileSync only for isDirty git. Test mocking via KAOLA_TEA_MOCK_SCRIPT (tea.js shim), NOT a PATH glab/gh binary. NEW vs GitLab: the Gitea contract validator has TWO fail-closed hardcoded arrays + a /\bglab\b/ forbidden-token loop scanning every scripts/*.js.

## Files to Create
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js (B1)

## Files to Modify
- kaola-gitea-forge.js — D1 listIssues labels CSV (A1)
- kaola-gitea-workflow-roadmap.js — D3 export roadmapDir (A2)
- docs/api.md — Gitea coverage 4 edits (A3)
- test-gitea-workflow-scripts.js — 4 helpers + 11 tests (C2)
- test-gitea-forge-helpers.js — D1 forge-API test (C3)
- install.sh — Gitea SUPPORT_SCRIPT_NAMES (C1)
- validate-kaola-workflow-gitea-contracts.js — BOTH fail-closed arrays (C4) [NEW vs GitLab]

## Build Sequence
1. Group A (parallel disjoint): A1 forge D1, A2 roadmap D3, A3 docs.
2. Group B (after A1+A2): B1 script.
3. Group C (C2 after B1, C3 after A1, C1+C4 after B1): C1 install.sh, C2 audit tests, C3 forge-API test, C4 contract-validator arrays.

## Task A1 — Forge listIssues labels CSV (MODIFY, group A, deps none)
In listIssues (151-157), after `if(options.state) args.push('--state', options.state);` (154), before teaExec (155):
```
// Pass --labels=<csv> matching the forge's existing --remove-labels=/--add-labels= idiom.
const csv = (options.labels || []).join(',');
if (csv) args.push('--labels=' + csv);
```
`=` form, single token (mirrors updateIssueLabels 167-168). tea uses --limit (153, don't touch). VERIFIED tea issues list --labels <csv>.
Validate: node test-gitea-forge-helpers.js.

## Task A2 — Export roadmapDir (MODIFY, group A, deps none)
Add `roadmapDir,` to module.exports (352-363); fn at 57-59. Validate: node -e typeof require(...).roadmapDir → function.

## Task A3 — docs/api.md (MODIFY, group A, deps none)
4 edits: heading 627 append `; Gitea port #167`; new `#### Gitea edition (issue #167)` subsection after GitLab subsection (after 731, before Flow mapping 733) — KEEP PR naming (unarchived_pr_folders/pr_url/pr_state, sink: pr), lowercase merged/closed, label via forge.updateIssueLabels(project,n,{remove}), install path ~/.claude/kaola-workflow-gitea/scripts/; flow-map row 747 → Gitea shipped (#167), follow-up cell #166→~~#166~~ ~~#167~~; follow-up bullet 757 → Gitea port shipped (#167). NOTE docs/api.md NOT scanned by gitea validator (only scripts/*.js) — MR/GitLab wording is style note not gate.
Validate: grep -n "Gitea port #167\|#### Gitea edition (issue #167)\|unarchived_pr_folders" docs/api.md.

## Task B1 — New script (CREATE, group B, deps A1+A2)
Mirror plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js:1-303 with substitution map:
- Requires fs, path, {execFileSync}; active-folders {field,getRoot,issueIsClosed,readActiveFolders}; roadmap {regenerateRoadmap,readRoadmapIssues,roadmapDir}; forge=require('./kaola-gitea-forge'); CLAIM_LABEL=forge.CLAIM_LABEL; OFFLINE. Inline assert+parseArgs. execFileSync only for isDirty.
- Header comment Gitea + #167. NO bare glab token (forbidden-token loop scans this file). PR naming in comments.
- prNumberFromFolder(f): parseInt(f.pr_number) finite>0; else regex /\/pulls\/(\d+)/ on f.pr_url; else null (mirror claim.js:904-909).
- detectUnarchivedPrFolders(folders): if(OFFLINE) return 'skipped_offline'; loop `if(f.sink!=='pr'||!f.pr_url) continue; const prNumber=prNumberFromFolder(f); if(!prNumber) continue; try{state=String(forge.viewPullRequest(prNumber).state||'')}catch(_){continue}` LOWERCASE `if(state==='merged'||state==='closed')` push {project,issue_number,pr_url,pr_state:state}. NO toUpperCase. Pass NUMBER not URL.
- detectStaleLabels(): if(OFFLINE) return 'skipped_offline'; try forge.listIssues({state:'closed',labels:[CLAIM_LABEL]}).map(i=>({number:i.number,title:i.title,url:i.url})); catch stderr `'closure-audit: tea issues list failed; reporting empty stale_in_progress_labels\n'` (tea NOT glab); return [].
- archiveClosedIssues D4: `const n=parseInt(field(content,'issue_iid')||field(content,'issue_number'),10);`.
- executeRepairs label loop: `forge.updateIssueLabels(null, it.number, {remove:[CLAIM_LABEL]}); labelsRemoved.push(it.number);` try / labelsFailed catch. Comment: `// project ignored by forge.updateIssueLabels body today (forge:164-172); revisit if it starts consuming the arg.`
- Output keys unarchived_pr_folders (drift+counts Array.isArray guard; reported_not_repaired). main/require.main/try-catch exitCode=1/exports {buildAuditReport,executeRepairs,collectClosedSet,detectStaleRoadmapSources} verbatim. Pretty-print null,2.
Validate (offline smoke fresh git tmp): {dry_run:true,offline:true, stale_in_progress_labels:'skipped_offline', unarchived_pr_folders:'skipped_offline'}, exit 0.

## Task C1 — install.sh (MODIFY, group C, deps B1)
Insert kaola-gitea-workflow-closure-audit.js after kaola-gitea-workflow-classifier.js (line 164 post-rebase). grep -n SUPPORT_SCRIPT_NAMES fresh first (rebased onto fae0698). Validate: bash -n install.sh && grep -n closure-audit install.sh.

## Task C2 — Audit tests + helpers (MODIFY, group C, deps B1)
Helpers: const closureAuditScript (~23-25); closureAuditShim(binDir,lines)→writeShimFiles(path.join(binDir,'tea'),lines) (tea shim NOT glab/gh); runClosureAudit (mirror runClaimOnline 100-114, env KAOLA_WORKFLOW_OFFLINE:'0' + teaMockEnv(binDir) + PATH binDir:nodedir, status 0, JSON.parse stdout); runClosureAuditOffline (env KAOLA_WORKFLOW_OFFLINE:'1', no shim); makePrSinkFolder(root,project,issueNumber) (writeState then inline sink: pr + pr_url https://gitea.example/group/project/pulls/N + pr_number: N; mirror GitLab makeMrSinkFolder 173-180). Check/port initGitRepo/plantClosureRoadmapSource if absent.
11 tests mirror GitLab testClosureAudit* (1834-2126), Mr→Pr. Shim regexes: `issues view`, `issues list`, `issues edit`+`--remove-labels`, `pr view`. Casing-guard named testClosureAuditUnarchivedPrFolderMergedLowercase (pr view→{"state":"merged"}, assert unarchived_pr_folders[0].pr_state==='merged' lowercase). D4 archive fixtures hand-write issue_iid: N + status: closed. Execute tests: shim marker on `issues edit`+`--remove-labels`; assert marker present after --execute, absent after dry-run. NO bare glab token.
Register 11 sync calls between testGiteaOfflineBypassesFailClosed(); (1747) and async testGiteaRoadmapInitIssueExclusiveAndUpdate().then() (1749).
Validate: node test-gitea-workflow-scripts.js → "Gitea workflow script tests passed" exit 0.

## Task C3 — Forge-API test (MODIFY, group C, deps A1)
Response key (byte-exact = form): `'issues list --output json --limit 100 --state closed --labels=workflow:in-progress': JSON.stringify([{number:7,state:'closed'}])`. Assertion: `forge.listIssues({execFileSync, state:'closed', labels:[forge.CLAIM_LABEL]})[0].issue_iid===7`. tea --limit 100 not --per-page. tea-bin loop 160-162 safe. Validate: node test-gitea-forge-helpers.js exit 0 (confirm final-line string by reading tail).

## Task C4 — Contract-validator arrays (MODIFY, group C, deps B1) [NEW vs GitLab]
Add 'kaola-gitea-workflow-closure-audit.js' to BOTH: scriptFiles (146-160, after classifier 150) AND installSupportScripts (164-175, after classifier 168). Both fail-closed (scriptFiles asserts file exists 161; installSupportScripts asserts install.sh references it 176-178). Validate: node validate-kaola-workflow-gitea-contracts.js → "Kaola-Workflow Gitea contract validation passed" exit 0 (re-runs forbidden-token loop 351-357 over new script + edited test).

## Validation Commands (final gate)
1. npm run test:kaola-workflow:gitea (primary).
2. Per-file: test-gitea-forge-helpers.js, test-gitea-workflow-scripts.js, validate-kaola-workflow-gitea-contracts.js.
3. roadmapDir smoke → function.
4. bash -n install.sh && grep closure-audit.
5. B1 offline dry-run smoke.
6. No GitHub regression (shared install.sh+docs): node scripts/simulate-workflow-walkthrough.js. Also full npm test in Phase 6.

## Out of Scope (phase2-ideation.md)
No PR→MR rename; no folder/worktree deletion in --execute ((e)/(f) report-only); no new drift classes; no closure-contract; no Gitea audit-labels/repair-labels; no edits to GitHub source or shipped GitLab port; no new framework; no widening active-folders API; no client-side issue dumping; no rename issue_number.

## Highest-risk pitfalls
1. Lowercase state compare (NO toUpperCase) — guard test testClosureAuditUnarchivedPrFolderMergedLowercase.
2. `glab` forbidden token — validator loop 351-357 scans new script + edited test; rewrite all glab→tea in code/comments/stderr.
3. TWO fail-closed contract-validator arrays (scriptFiles 147-161, installSupportScripts 164-178) + C1 must all land — NEW vs GitLab.
4. viewPullRequest takes a NUMBER not URL — prNumberFromFolder resolves number first.
5. updateIssueLabels(null, n, {remove:[CLAIM_LABEL]}) — signature (project,issueNum,opts), project ignored; remove: key (NOT unlabels).
6. D4 issue_iid fixtures — writeState writes issue_number only; archive fixtures hand-write issue_iid: N + status: closed.
7. C3 --labels= byte-exact match between A1 push and C3 response key (= form both halves).
