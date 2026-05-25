# Phase 3 - Plan: issue-167

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Dedicated Gitea closure-drift reporter/repairer (mirror of GitLab #166 script with Gitea substitutions) | inlined assert/parseArgs; collectClosedSet, roadmapSourceFiles, archiveClosedIssues, detectStaleRoadmapSources, detectMirrorClosed, detectStaleLabels, isDirty, detectActiveClosedFolders, prNumberFromFolder, detectUnarchivedPrFolders, buildAuditReport, executeRepairs, main. exports `{buildAuditReport, executeRepairs, collectClosedSet, detectStaleRoadmapSources}` |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | D1: in `listIssues` (151-157) after `--state` push add `const csv=(options.labels||[]).join(','); if(csv) args.push('--labels='+csv);` w/ comment | Stale-label detection needs `--labels` filter (verified: `tea issues list --labels <csv>`) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | D3: add `roadmapDir,` to module.exports (352-363); fn at 57-59 | New script imports roadmapDir |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Add `kaola-gitea-workflow-closure-audit.js` to BOTH `scriptFiles` (146-160, after classifier 150) and `installSupportScripts` (164-175, after classifier 168) | NEW vs GitLab: both fail-closed if omitted |
| `install.sh` | Add `kaola-gitea-workflow-closure-audit.js` to Gitea SUPPORT_SCRIPT_NAMES after `kaola-gitea-workflow-classifier.js` (line 164 post-rebase) | Installer must copy the new script |
| `docs/api.md` | 4 edits: heading 627 (+`; Gitea port #167`); new `#### Gitea edition (issue #167)` subsection after GitLab subsection (after 731); flow-map row 747 (Gitea shipped); follow-up bullet 757 (Gitea shipped). KEEP PR naming, lowercase state, forge.updateIssueLabels label removal | AC: document Gitea coverage |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 4 helpers (runClosureAudit/Offline, closureAuditShim writing `tea` shim, makePrSinkFolder) + 11 audit tests; register sync calls between testGiteaOfflineBypassesFailClosed() (1747) and async block (1749) | Mirror GitLab's 11 closure-audit tests (Mr→Pr) |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | Add `listIssues({labels})` forge-API test (execFileSync injection); response key `'issues list --output json --limit 100 --state closed --labels=workflow:in-progress'` | D1 coverage |

### Build Sequence
1. **Group A** (parallel, disjoint): A1 forge D1, A2 roadmap D3, A3 docs.
2. **Group B** (after A1+A2): B1 new script.
3. **Group C** (C2 after B1, C3 after A1, C1+C4 after B1): C1 install.sh, C2 audit tests, C3 forge-API test, C4 contract-validator arrays.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | A1, A2, A3 | disjoint: forge.js / roadmap.js / docs/api.md |
| B | B1 | single file, deps A1+A2 |
| C | C1, C2, C3, C4 | disjoint: install.sh / test-gitea-workflow-scripts.js / test-gitea-forge-helpers.js / validate-kaola-workflow-gitea-contracts.js |

### External Dependencies
None new. Node builtins (fs, path, child_process.execFileSync for isDirty git only). Internal: kaola-gitea-forge, kaola-gitea-workflow-active-folders, kaola-gitea-workflow-roadmap. `tea` CLI via forge.

## Task List (execution units — bundling per advisor)

### Task 1: Foundations — forge labels (A1) + roadmapDir export (A2) + forge-API test (C3)
- Write Set: kaola-gitea-forge.js, kaola-gitea-workflow-roadmap.js, test-gitea-forge-helpers.js
- Depends On: none · Parallel Group: A (+C3) · Action: MODIFY
- Implement: A1 forge `--labels=<csv>` push (comment explaining `=` form); A2 add roadmapDir to exports; C3 add response key `'issues list --output json --limit 100 --state closed --labels=workflow:in-progress'`→`[{number:7,state:'closed'}]` + assertion `forge.listIssues({execFileSync,state:'closed',labels:[forge.CLAIM_LABEL]})[0].issue_iid===7`. Bundle so the `--labels=` byte-exactness lives in one diff (mirror #166 Task 1).
- Mirror: #166 Task 1; forge updateIssueLabels 167-168 flag idiom.
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` → "Gitea forge helper tests passed"; `node -e "...roadmapDir"` → function.

### Task 2: New closure-audit script (B1) + behavior tests (C2)
- Write Set: kaola-gitea-workflow-closure-audit.js (CREATE), test-gitea-workflow-scripts.js (MODIFY)
- Depends On: Task 1 · Parallel Group: B+C2 · Action: CREATE+MODIFY
- Implement: mirror GitLab script (.cache/architect.md "Task B1" per-element spec) with Gitea substitution map — KEEP PR naming (unarchived_pr_folders/pr_url/pr_state/sink!=='pr'); prNumberFromFolder (pr_number or /\/pulls\/(\d+)/); detectUnarchivedPrFolders OFFLINE-guard + LOWERCASE merged/closed via forge.viewPullRequest(NUMBER); detectStaleLabels forge.listIssues({labels}) + stderr `tea issues list failed` (NOT glab); executeRepairs forge.updateIssueLabels(null, it.number, {remove:[CLAIM_LABEL]}); D4 issue_iid||issue_number; pretty-print; exports 4 fns. 11 tests + helpers (tea shim, makePrSinkFolder sink: pr + pr_url /pulls/N + pr_number); D4 fixtures hand-write issue_iid; execute marker on `issues edit`+`--remove-labels`; casing-guard testClosureAuditUnarchivedPrFolderMergedLowercase; register between 1747 and 1749. NO bare `glab` token anywhere.
- Mirror: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js + test-gitlab-workflow-scripts.js (1834-2138).
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → "Gitea workflow script tests passed"; offline dry-run smoke in fresh git tmp dir.

### Task 3: Wiring — install.sh (C1) + contract-validator arrays (C4) + docs (A3)
- Write Set: install.sh, validate-kaola-workflow-gitea-contracts.js, docs/api.md
- Depends On: Task 2 (script must exist for C1/C4 assertions) · Action: MODIFY
- Implement: C1 add script to Gitea SUPPORT_SCRIPT_NAMES after classifier (grep fresh; line 164); C4 add to BOTH validator arrays (scriptFiles after 150, installSupportScripts after 168) — both fail-closed; A3 4 docs edits (Gitea subsection keeps PR naming).
- Orchestrator-owned mechanical edits (install.sh array entry, validator array entries, docs prose) — Trivial Inline + doc prose, not implementation code/tests.
- Validate: `bash -n install.sh && grep -n closure-audit install.sh`; `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → passed; `grep -n "Gitea port #167\|unarchived_pr_folders" docs/api.md`.

### Final gate (all tasks)
- Validate: `npm run test:kaola-workflow:gitea` must pass; `node scripts/simulate-workflow-walkthrough.js` (GitHub regression — shared install.sh/docs); full `npm test` in Phase 6.

## Advisor Notes
Advisor verdict: implementable, proceed to Phase 4, no revision. Seven pitfalls pinned: (1) lowercase state compare (no
toUpperCase) — guard test named; (2) `/\bglab\b/` forbidden token scans new script + edited test — all glab→tea; (3) TWO
fail-closed contract-validator arrays + C1 must all land (NEW vs GitLab); (4) viewPullRequest takes a NUMBER not URL —
prNumberFromFolder first; (5) updateIssueLabels(null, n, {remove}) signature; (6) D4 issue_iid fixtures; (7) C3 `--labels=`
byte-exact match between A1 push and C3 response key. Pre-Phase-4 verifications DONE: installSupportScripts only forward-
asserts (fae0698's closure-contract addition is fine); forge-helpers final line "Gitea forge helper tests passed". Execution
bundling: A1+A2+C3 = Task 1 (one diff for the labels contract); C1+C4 land together (Task 3). Full text in .cache/advisor-plan.md.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md (model=opus; Sonnet rate-limited) | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor found no blueprint gaps; two pre-Phase-4 checks resolved by orchestrator read, no design change |
