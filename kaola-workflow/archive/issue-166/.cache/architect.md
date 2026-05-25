# code-architect raw output — issue-166 (GitLab closure-audit port)

> NOTE: dispatched with model=opus (Sonnet rate-limited this session). code-architect agent.

# Architecture: GitLab `closure-audit` Port (issue #166)

Faithful parity port of `scripts/kaola-workflow-closure-audit.js` (297 lines) to the GitLab
edition as a dedicated standalone script, all remote calls routed through the forge object,
PR→MR substitutions, mandatory lowercase MR-state compare. JSON shape preserves GitHub
contract except `unarchived_pr_folders`→`unarchived_mr_folders`, item `pr_url`/`pr_state`→`mr_url`/`mr_state`.

## Design Decisions (locked)
- D1: extend `forge.listIssues({state,perPage,labels})` — `for (const label of options.labels||[]) args.push('--label',label)`. New script: `forge.listIssues({state:'closed',labels:[CLAIM_LABEL]})`.
- D2: rename PR-specific surface only; KEEP issue_number in items; inline mrIidFromFolder; LOWERCASE compare `state==='merged'||state==='closed'` (NO .toUpperCase()).
- D3: add `roadmapDir` to GitLab roadmap module.exports (private at 57-59).
- D4: inline archive read `parseInt(field(content,'issue_iid')||field(content,'issue_number'),10)`; do NOT export firstPositiveInteger.
- D5: NO closure-contract/receipt.
- Forge-replaces-ghExec (advisor pin): DELETE inlined ghExec; all remote I/O via forge; import CLAIM_LABEL from forge; keep execFileSync for isDirty git calls; keep inlined assert+parseArgs.

## Files to Create
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` — dedicated standalone GitLab closure-drift reporter/repairer. Functions: inlined assert/parseArgs; collectClosedSet, roadmapSourceFiles, archiveClosedIssues, detectStaleRoadmapSources, detectMirrorClosed, detectStaleLabels, isDirty, detectActiveClosedFolders, detectUnarchivedMrFolders, mrIidFromFolder, buildAuditReport, executeRepairs, main. exports `{buildAuditReport, executeRepairs, collectClosedSet, detectStaleRoadmapSources}` (mirror GitHub 291-296).

## Files to Modify
- `kaola-gitlab-forge.js` — D1: in listIssues (123-129) after `--state` push add `for (const label of options.labels||[]) args.push('--label',label);`. Priority 1.
- `kaola-gitlab-workflow-roadmap.js` — D3: add `roadmapDir,` to module.exports (352-363); function at 57-59. Priority 1.
- `install.sh` — add `kaola-gitlab-workflow-closure-audit.js` to GitLab SUPPORT_SCRIPT_NAMES (134-145), after kaola-gitlab-workflow-classifier.js (138). Priority 3.
- `docs/api.md` — 4 edits (below). Priority 1 (parallel).
- `test-gitlab-workflow-scripts.js` — 11 audit-behavior tests + 4 helpers; register between line 1775 and async .then() at 1777. Priority 4.
- `test-gitlab-forge-helpers.js` — direct listIssues({labels}) forge-API test (D1). Priority 3.

### docs/api.md edits (4 spots)
1. Heading 627: `### Closure audit and repair (GitHub only, issue #165)` → `### Closure audit and repair (issue #165; GitLab port #166)`.
2. New GitLab subsection after "How this differs" table (after 711, before `### Flow mapping` 713): ≤12 lines — GitLab ships kaola-gitlab-workflow-closure-audit.js, identical contract, MR substitutions (unarchived_mr_folders, mr_url, mr_state, lowercase merged/closed), invoked `node ~/.claude/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js [--execute]`.
3. Flow-map row 727: `GitLab/Gitea ports deferred to follow-ups.` → `GitLab port shipped (#166); Gitea deferred (#167).`
4. Follow-up bullet 737: append `GitLab port shipped (#166)`, leave Gitea remaining.

## Data Flow
main() → getRoot() → buildAuditReport(root): readActiveFolders(root,{excludeClosedIssues:false}); roadmapSourceFiles reads roadmapDir(root) .roadmap/issue-N.md; archiveClosedIssues reads archive/*/workflow-state.md status:closed iid-first; collectClosedSet dedup via issueIsClosed (self-guards OFFLINE→false); five detectors → drift → counts (Array.isArray guard).
--execute → executeRepairs(root,report) consumes report (never re-detects): unlink stale .roadmap/issue-N.md (ENOENT=success), regenerateRoadmap(root), remove label via forge.updateIssue(it.number,{unlabels:[CLAIM_LABEL]}) when online; (e)/(f) → reported_not_repaired. Pretty-print JSON.stringify(...,null,2).

## Build Sequence
1. Group A (parallel disjoint): forge D1, roadmap D3, docs/api.md.
2. Group B (after A): new closure-audit script.
3. Group C (parallel; C1/C2 after B, C3 after A.forge): install.sh; audit-behavior tests; forge-API test.

## Task List

### Group A — foundations (parallel)
**A1 forge D1 (MODIFY)** — kaola-gitlab-forge.js. Deps none. In listIssues after 126 add per-label `--label` push. Push order: --output json --per-page N → --state → --label. Mirror updateIssue 139-140. Validate via forge-helpers test.
**A2 roadmap D3 (MODIFY)** — kaola-gitlab-workflow-roadmap.js. Deps none. Add `roadmapDir,` to exports (352-363); fn at 57-59. Validate: `node -e "console.log(typeof require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap').roadmapDir)"` → function.
**A3 docs/api.md (MODIFY)** — Deps none. 4 edits. Validate: grep -n "unarchived_mr_folders\|#166" docs/api.md.

### Group B — script (deps A1,A2)
**B1 closure-audit script (CREATE)** — kaola-gitlab-workflow-closure-audit.js. Test file C2.
Per-element logic (GitHub line → GitLab delta):
- Requires: fs, path. Import {field,getRoot,issueIsClosed,readActiveFolders} from ./kaola-gitlab-workflow-active-folders; {regenerateRoadmap,readRoadmapIssues,roadmapDir} from ./kaola-gitlab-workflow-roadmap; forge from ./kaola-gitlab-forge. const CLAIM_LABEL=forge.CLAIM_LABEL; const OFFLINE=process.env.KAOLA_WORKFLOW_OFFLINE==='1'. DELETE inlined ghExec (44-49); KEEP execFileSync for isDirty git (146/153). Keep inlined assert (42), parseArgs (51-57).
- collectClosedSet(candidateNumbers) — verbatim 62-71.
- roadmapSourceFiles(root) — verbatim 73-82 (roadmapDir, regex ^issue-(\d+)\.md$, path 'kaola-workflow/.roadmap/'+f).
- archiveClosedIssues(root) — mirror 84-99, D4: line 95 → `const n=parseInt(field(content,'issue_iid')||field(content,'issue_number'),10);`.
- detectStaleRoadmapSources — verbatim 102-116 (closed_remote wins dedup, sorted asc).
- detectMirrorClosed(root,closedSet) — verbatim 119-126 (readRoadmapIssues(roadmapDir(root)), strip #).
- detectStaleLabels() — mirror 130-139, forge + OFFLINE-guard-first: `if(OFFLINE) return 'skipped_offline';` then try {const issues=forge.listIssues({state:'closed',labels:[CLAIM_LABEL]}); return issues.map(i=>({number:i.number,title:i.title,url:i.url}));} catch(_){stderr warn; return [];}.
- isDirty(folder) — verbatim 143-159 (execFileSync git porcelain; worktree_path then project_dir).
- detectActiveClosedFolders(folders,closedSet) — verbatim 162-170 (issue_number, dirty).
- mrIidFromFolder(folder) — inline, mirror claim.js 917-922: parseInt(folder.mr_iid) if finite>0; else regex /merge_requests\/(\d+)/ on folder.mr_url; else null.
- detectUnarchivedMrFolders(folders) — port detectUnarchivedPrFolders 173-188, D2: `if(OFFLINE) return 'skipped_offline';` loop `if(f.sink!=='mr'||!f.mr_url) continue; const mrIid=mrIidFromFolder(f); if(!mrIid) continue; let state=''; try{state=String(forge.viewMergeRequest(mrIid).state||'');}catch(_){continue;}` NO toUpperCase; `if(state==='merged'||state==='closed') out.push({project:f.project,issue_number:f.issue_number,mr_url:f.mr_url,mr_state:state});`. Mirror claim watchMergeRequests 930-936/960.
- buildAuditReport(root) — mirror 191-222: key unarchived_mr_folders (drift+counts), counts Array.isArray?len:0.
- executeRepairs(root,report) — mirror 226-263, forge: label-removal loop → `for(const it of labels){try{forge.updateIssue(it.number,{unlabels:[CLAIM_LABEL]});labelsRemoved.push(it.number);}catch(_){labelsFailed.push(it.number);}}`. reported_not_repaired key unarchived_mr_folders. Roadmap unlink+regen unchanged.
- main()/require.main/module.exports — verbatim 265-296 (pretty-print; exports the 4 fns).
Validate: run script in fresh git tmp dir → {dry_run:true} JSON, exit 0.

### Group C — install + tests (parallel)
**C1 install.sh (MODIFY)** deps B1. Add line after 138. Validate bash -n install.sh; grep closure-audit.
**C2 audit-behavior tests (MODIFY)** test-gitlab-workflow-scripts.js deps B1. Helpers near 19; register 11 sync calls between 1775 and 1777. Validate node test-gitlab-workflow-scripts.js → 'GitLab workflow script tests passed'.
**C3 forge-API test (MODIFY)** test-gitlab-forge-helpers.js deps A1. 2 responses keys + 2 assertions. Validate node test-gitlab-forge-helpers.js → 'GitLab forge helper tests passed'.

## Parallelization Groups (disjoint write sets)
- A: kaola-gitlab-forge.js, kaola-gitlab-workflow-roadmap.js, docs/api.md.
- B: kaola-gitlab-workflow-closure-audit.js.
- C: install.sh, test-gitlab-workflow-scripts.js, test-gitlab-forge-helpers.js.
Each file in exactly one task; no two parallel tasks touch same file.

## Test Plan

### Helpers in test-gitlab-workflow-scripts.js
- const closureAuditScript = path.join(__dirname,'kaola-gitlab-workflow-closure-audit.js') (near 19).
- runClosureAudit(args,cwd,binDir) — mirror GitHub 526-543, env uses ...glabMockEnv(binDir) (helper at 119), KAOLA_WORKFLOW_OFFLINE:'0', prepend binDir+node dir to PATH, assert status 0, return JSON.parse(stdout). Forge reads KAOLA_GLAB_MOCK_SCRIPT at forge.js:15.
- runClosureAuditOffline(args,cwd) — mirror 545-554; env {...process.env, KAOLA_WORKFLOW_OFFLINE:'1'} (precedent stale-worktree test 1297).
- closureAuditShim(binDir,lines) — mkdirSync recursive; writeShimFiles(path.join(binDir,'glab'),lines) (mirror GitHub closureAuditShim 3008-3011 but glab).
- Fixtures: reuse writeState(root,project,issueIid,extra) (38). Roadmap sources: inline kaola-workflow/.roadmap/issue-N.md with `issue: #N` (mirror inline writes 295/590). MR-folder sink override (PINNED): write state inline — do NOT add sink param to writeState. After writeState, read state file, state.replace(/^sink:\s*.*$/m,'sink: mr') + append mr_url + mr_iid, rewrite. Mirrors GitHub inline mutation 3194-3198.

### 11 audit-behavior tests (mirror GitHub 3013-3303)
Shims answer `glab issue view N --output json`, `glab issue list --state closed --label ... --output json`, `glab mr view N --output json`. Execute uses `issue update`+`--unlabel` (NOT issue edit/--remove-label).
1. testClosureAuditOfflineRemoteClassesSkipped (3013) — offline → both remote classes 'skipped_offline'; dry_run/offline true.
2. testClosureAuditClosedRemoteRoadmapSource (3034) — roadmap 900; issue view closed; list []; stale_roadmap_sources len1 issue_number 900 reason closed_remote; counts 1.
3. testClosureAuditArchiveClosedDrift (3059) — roadmap 901 + archive issue-901/workflow-state.md `status: closed`+`issue_iid: 901` (D4, NOT issue_number); issue view open; reason archive_closed. GUARDS D4.
4. testClosureAuditDedupRoadmapAndArchive (3086) — roadmap+archive 902 (archive issue_iid:902); issue view closed; dedup 1 reason closed_remote wins.
5. testClosureAuditMirrorListsClosedIssues (3113) — roadmap 903; issue view closed; mirror includes 903; counts 1.
6. testClosureAuditStaleInProgressLabels (3140) — issue list [{number:99,title,url}]; stale_in_progress_labels len1 [0].number 99; counts 1.
7. testClosureAuditActiveFolderForClosedIssueReportsDirty (3163) — writeState issue-904 904; issue view closed; active_folder len1 project issue-904 issue_number 904 dirty true.
8. testClosureAuditUnarchivedMrFolderMergedLowercase (3188, D2 GUARD) — writeState issue-905 905 then inline sink:mr + mr_url .../merge_requests/905 + mr_iid 905; mr view {"state":"merged"} LOWERCASE; issue view open; unarchived_mr_folders len1 project issue-905 mr_state merged mr_url present. Lowercase compare load-bearing.
9. testClosureAuditExecuteRepairsRoadmapAndLabels (3218) — roadmap 906; shim marker on issue update+--unlabel; issue view closed; list [{number:906}]; dry_run false; roadmap_sources_removed includes 906; roadmap_regenerated true; labels_removed includes 906; source file deleted; marker exists; ROADMAP.md exists.
10. testClosureAuditExecuteNeverTouchesActiveFolders (3255) — writeState issue-907 907; issue view closed; --execute: folder dir exists; reported_not_repaired.active_folder_for_closed_issue issue_number 907.
11. testClosureAuditDryRunNeverCallsRemoveLabel (3283) — shim marker on issue update+--unlabel; list [{number:99}]; dry_run true; marker NOT exist.
Register all 11 between 1775 and 1777, synchronous.

### Direct forge-API test in test-gitlab-forge-helpers.js (D1)
Add 2 responses keys (object 62-88) + 2 assertions (after 92):
- 'issue list --output json --per-page 100 --state closed --label workflow:in-progress' → JSON.stringify([{iid:7,state:'closed'}]).
- 'issue list --output json --per-page 100 --state closed --label workflow:in-progress --label workflow:queued' → JSON.stringify([{iid:8,state:'closed'}]).
- assert.strictEqual(forge.listIssues({execFileSync,state:'closed',labels:[forge.CLAIM_LABEL]})[0].issue_iid,7);
- assert.strictEqual(forge.listIssues({execFileSync,state:'closed',labels:[forge.CLAIM_LABEL,forge.QUEUED_LABEL]})[0].issue_iid,8);
- Existing glab-bin assert loop (129-131) auto-covers.

## Validation Commands
- Primary gate: `npm run test:kaola-workflow:gitlab` (runs simulate-gitlab-workflow-walkthrough.js → dispatches forge-helpers, workflow-scripts, sinks).
- Dev loop: node test-gitlab-forge-helpers.js (C3+A1); node test-gitlab-workflow-scripts.js (C2+B1).
- A2 smoke: node -e roadmapDir typeof → function.
- C1: bash -n install.sh.
- B1 smoke: run script in fresh git init tmp dir → {dry_run:true} JSON exit 0.

## Out of Scope
No folder/worktree deletion in --execute ((e)/(f) report-only); no new drift classes; no receipt/closure-contract; no GitLab audit-labels/repair-labels port; no edits to GitHub source; no new test framework; no widening active-folders API; no client-side issue dumping; no rename of issue_number; no Gitea work (#167).

## Highest-risk pitfalls (advisor-confirmed)
1. Do NOT inline ghExec — forge methods only; import CLAIM_LABEL from forge.
2. OFFLINE guards MUST precede forge calls in detectStaleLabels + detectUnarchivedMrFolders (glabExec returns ''→[] offline, forge.js:13; without early return 'skipped_offline' the offline test sees [] and fails).
3. Lowercase MR-state compare — NO toUpperCase; test #8 name encodes it.
4. `issue update --unlabel` (NOT issue edit --remove-label) in script + shims (#9,#11).
5. D4 fixtures write issue_iid (#3,#4) — writing issue_number would pass without iid-first read, defeating the guard.

## Load-bearing references
- GitHub source scripts/kaola-workflow-closure-audit.js:1-297.
- GitHub tests scripts/simulate-workflow-walkthrough.js:3008-3303 (11 + closureAuditShim), :526-554 (runClosureAudit/Offline).
- GitLab forge kaola-gitlab-forge.js:123-129 (listIssues/D1), :13-17 (glabExec OFFLINE+mock), :215-239 (exports).
- GitLab active-folders :61 (iid-first parseStateFile/D4), :132-140 (exports; firstPositiveInteger private).
- GitLab roadmap :57-59 (roadmapDir), :352-363 (exports/D3).
- mrIidFromFolder + lowercase: claim.js:917-922, :930-936, :960.
- Test infra test-gitlab-workflow-scripts.js:21-32 (withForge), :38-68 (writeState), :115-122 (writeShimFiles/glabMockEnv), :137-147 (initGitRepo), :1772-1784 (runner tail/registration).
- Forge-API test pattern test-gitlab-forge-helpers.js:7-13 (runner), :62-92 (responses+listIssues injection), :129-131 (glab-bin assertion).
- install.sh GitLab block :134-145.
- docs/api.md:627, :711-713, :727, :737.
