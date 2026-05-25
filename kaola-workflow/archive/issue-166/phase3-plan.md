# Phase 3 - Plan: issue-166

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | Dedicated standalone GitLab closure-drift reporter/repairer (mirror of GitHub source) | inlined `assert`/`parseArgs`; `collectClosedSet`, `roadmapSourceFiles`, `archiveClosedIssues`, `detectStaleRoadmapSources`, `detectMirrorClosed`, `detectStaleLabels`, `isDirty`, `detectActiveClosedFolders`, `mrIidFromFolder`, `detectUnarchivedMrFolders`, `buildAuditReport`, `executeRepairs`, `main`. exports `{buildAuditReport, executeRepairs, collectClosedSet, detectStaleRoadmapSources}` |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | D1: in `listIssues` (123-129) after `--state` push add `for (const label of options.labels||[]) args.push('--label', label);` | Stale-label detection needs server-side `--label` filter; forge has none |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | D3: add `roadmapDir,` to `module.exports` (352-363); fn already at 57-59 | New script imports `roadmapDir` (GitHub source does too); currently private |
| `install.sh` | Add `kaola-gitlab-workflow-closure-audit.js` to GitLab `SUPPORT_SCRIPT_NAMES` (134-145), after `kaola-gitlab-workflow-classifier.js` (138) | Installer must copy the new script |
| `docs/api.md` | 4 edits: heading 627 → "(issue #165; GitLab port #166)"; new ≤12-line GitLab subsection after line 711; flow-map row 727 → "GitLab port shipped (#166); Gitea deferred (#167)"; follow-up bullet 737 append "GitLab port shipped (#166)" | AC: document GitLab coverage. Anchor-safe (no `#closure-audit` md links) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add 4 helpers + 11 audit-behavior tests; register synchronous calls between line 1775 and async `.then()` at 1777 | Mirror GitHub's 11 closure-audit tests |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` | Add 2 response keys + 2 assertions for `listIssues({labels})` (execFileSync injection, verified pattern at 91-92) | Direct forge-API coverage for D1 |

### Build Sequence
1. **Group A** (parallel, disjoint): A1 forge D1, A2 roadmap D3, A3 docs/api.md — foundations + independent docs.
2. **Group B** (after A1+A2): B1 new closure-audit script (imports forge labels opt + roadmapDir).
3. **Group C** (C1/C2 after B1; C3 after A1): C1 install.sh, C2 audit-behavior tests, C3 forge-API test.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | A1, A2, A3 | disjoint files: forge.js / roadmap.js / docs/api.md |
| B | B1 | single file, depends on A1+A2 |
| C | C1, C2, C3 | disjoint files: install.sh / test-gitlab-workflow-scripts.js / test-gitlab-forge-helpers.js |

### External Dependencies
None new. Node builtins (`fs`, `path`, `child_process.execFileSync` for `isDirty` git only). Internal: `kaola-gitlab-forge`, `kaola-gitlab-workflow-active-folders`, `kaola-gitlab-workflow-roadmap`. `glab` CLI via forge.

## Task List

### Task A1: Forge listIssues labels option
- File: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js
- Test File: plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js (C3)
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: in `listIssues` after line 126 (`--state` push), add `for (const label of options.labels || []) args.push('--label', label);`. Push order: `--output json --per-page N` → `--state` → `--label` per label.
- Mirror: per-label flag idiom in `updateIssue` (kaola-gitlab-forge.js:139-140). `glab issue list` uses `--label` (verified).
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js`

### Task A2: Export roadmapDir
- File: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js
- Test File: smoke node -e
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: add `roadmapDir,` to `module.exports` (352-363); function already exists at 57-59.
- Mirror: GitHub roadmap module exports roadmapDir (GitHub closure-audit imports it).
- Validate: `node -e "console.log(typeof require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap').roadmapDir)"` → `function`

### Task A3: docs/api.md GitLab coverage
- File: docs/api.md
- Write Set: docs/api.md
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: 4 edits (heading 627, new GitLab subsection after 711 before Flow mapping 713, flow row 727, follow-up bullet 737). MR terms (unarchived_mr_folders, mr_url, mr_state, lowercase merged/closed). Pretty-print JSON examples.
- Mirror: existing GitHub closure-audit section structure (627-711).
- Validate: `grep -n "unarchived_mr_folders\|#166" docs/api.md`

### Task B1: New closure-audit script
- File: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js
- Test File: plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (C2)
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js
- Depends On: A1, A2
- Parallel Group: B (alone)
- Action: CREATE
- Implement: full mirror of scripts/kaola-workflow-closure-audit.js with deltas (see .cache/architect.md "B1" per-element spec). Requires fs/path + active-folders {field,getRoot,issueIsClosed,readActiveFolders} + roadmap {regenerateRoadmap,readRoadmapIssues,roadmapDir} + forge. `CLAIM_LABEL=forge.CLAIM_LABEL`; `OFFLINE=env.KAOLA_WORKFLOW_OFFLINE==='1'`. DELETE inlined ghExec; keep execFileSync for isDirty git; keep inlined assert+parseArgs.
  - D4: archiveClosedIssues reads `parseInt(field(content,'issue_iid')||field(content,'issue_number'),10)`.
  - D1: detectStaleLabels → `if(OFFLINE) return 'skipped_offline';` then `forge.listIssues({state:'closed',labels:[CLAIM_LABEL]}).map(i=>({number:i.number,title:i.title,url:i.url}))` in try/catch→[].
  - D2: detectUnarchivedMrFolders → `if(OFFLINE) return 'skipped_offline';` gate `f.sink!=='mr'||!f.mr_url`; `mrIidFromFolder(f)`; `forge.viewMergeRequest(mrIid).state`; LOWERCASE `state==='merged'||state==='closed'`; push `{project,issue_number,mr_url,mr_state}`. key `unarchived_mr_folders`.
  - executeRepairs label loop → `forge.updateIssue(it.number,{unlabels:[CLAIM_LABEL]})`; reported_not_repaired key unarchived_mr_folders.
  - main/exports verbatim (pretty-print null,2).
- Mirror: scripts/kaola-workflow-closure-audit.js:1-297; mrIidFromFolder claim.js:917-922; lowercase compare claim.js:930-936/960.
- Validate: run script in fresh `git init` tmp dir → `{dry_run:true,...}` JSON, exit 0; then C2 tests.

### Task C1: install.sh registration
- File: install.sh
- Write Set: install.sh
- Depends On: B1
- Parallel Group: C
- Action: MODIFY
- Implement: add `kaola-gitlab-workflow-closure-audit.js` to GitLab SUPPORT_SCRIPT_NAMES (134-145) after classifier (138).
- Mirror: GitHub block placement of kaola-workflow-closure-audit.js (install.sh:116).
- Validate: `bash -n install.sh` && `grep -n closure-audit install.sh`

### Task C2: Audit-behavior tests
- File: plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- Write Set: plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- Depends On: B1
- Parallel Group: C
- Action: MODIFY
- Implement: helpers (closureAuditScript const near 19; runClosureAudit via glabMockEnv+PATH; runClosureAuditOffline via KAOLA_WORKFLOW_OFFLINE=1; closureAuditShim writes `glab`). 11 tests mirroring GitHub 3013-3303 (see architect.md table). MR-folder fixtures via inline sink:mr rewrite (do NOT add sink param to writeState). Execute shims use `issue update`+`--unlabel`. Register 11 sync calls between 1775 and 1777.
- Mirror: scripts/simulate-workflow-walkthrough.js:3008-3303; test infra writeState (38), writeShimFiles/glabMockEnv (115-122).
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → "GitLab workflow script tests passed"

### Task C3: Forge-API test (D1)
- File: plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js
- Write Set: plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js
- Depends On: A1
- Parallel Group: C
- Action: MODIFY
- Implement: add 2 response keys to the object (62-88): `'issue list --output json --per-page 100 --state closed --label workflow:in-progress'`→`[{iid:7,state:'closed'}]`; `'... --label workflow:in-progress --label workflow:queued'`→`[{iid:8,state:'closed'}]`. Add 2 assertions after 92: `forge.listIssues({execFileSync,state:'closed',labels:[forge.CLAIM_LABEL]})[0].issue_iid===7` and `{...labels:[CLAIM_LABEL,QUEUED_LABEL]}[0].issue_iid===8`. (execFileSync injection pattern verified at 91-92.)
- Mirror: test-gitlab-forge-helpers.js:62-92 existing listIssues injection tests.
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` → "GitLab forge helper tests passed"

### Final gate (all tasks)
- Validate: `npm run test:kaola-workflow:gitlab` must pass (runs forge-helpers + workflow-scripts + sinks). Also run `node scripts/simulate-workflow-walkthrough.js` (no regressions to GitHub edition) since shared install.sh touched.

## Advisor Notes
Advisor verdict: blueprint implementable, proceed to Phase 4, no architect revision. Blocking
pre-B1 check RESOLVED: forge-helpers uses execFileSync injection (91-92), so C3 assertion shape
correct. Dependency graph (A→B→C, C3←A1) verified safe; no file in two parallel tasks. Five
highest-risk pitfalls pinned: (1) no inlined ghExec — forge only; (2) OFFLINE guard precedes forge
calls in both remote detectors; (3) lowercase MR-state compare (no .toUpperCase); (4) `issue update
--unlabel` not `issue edit --remove-label`; (5) D4 fixtures write issue_iid. docs heading change
anchor-safe (no `#closure-audit` md links found). Full text in .cache/advisor-plan.md.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md (model=opus; Sonnet rate-limited) | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor found no blueprint gaps; blocking check resolved by orchestrator read, no design change |
