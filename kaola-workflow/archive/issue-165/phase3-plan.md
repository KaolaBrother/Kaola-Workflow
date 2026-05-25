# Phase 3 - Plan: issue-165

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| scripts/kaola-workflow-closure-audit.js | GitHub-edition closure-drift audit/repair script, invoked directly `node ... [--execute]` | inlines ghExec/parseArgs/output/assert/isSafeName/getRoot; imports readActiveFolders,issueIsClosed,field,getRoot,isSafeName (active-folders) + regenerateRoadmap,readRoadmapIssues,roadmapDir (roadmap) |
| plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js | Byte-identical copy | (sync guard enforces) |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| scripts/validate-script-sync.js | Add `'kaola-workflow-closure-audit.js',` after `'kaola-workflow-classifier.js',` in COMMON_SCRIPTS | enforce root↔plugin byte-sync of new script |
| scripts/simulate-workflow-walkthrough.js | Add closureAuditScript const + runClosureAudit/offline variant (~line 482); add 11 test fns; register in main() (~line 2974) | canonical test gate per CLAUDE.md |

### Build Sequence
1. Write tests in simulate-workflow-walkthrough.js FIRST (TDD; fail because script absent) — but script require would throw, so: write script skeleton + tests together, run, iterate to green.
   (Pragmatic TDD given require-time failure: write the 11 test fns, then implement closure-audit.js, then green.)
2. Implement scripts/kaola-workflow-closure-audit.js per function decomposition.
3. Run `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed".
4. Byte-copy to plugins/kaola-workflow/scripts/.
5. Edit validate-script-sync.js COMMON_SCRIPTS; run `node scripts/validate-script-sync.js` → OK.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | all | single implementer (orchestrator/Opus); files interdependent |

### External Dependencies
None. Node stdlib (fs, path, child_process) + existing repo modules only.

## Task List

### Task 1: Implement closure-audit.js
- File: scripts/kaola-workflow-closure-audit.js
- Test File: scripts/simulate-workflow-walkthrough.js
- Write Set: scripts/kaola-workflow-closure-audit.js
- Depends On: none
- Parallel Group: serial
- Action: CREATE
- Implement: collectClosedSet (dedupe issueIsClosed), roadmapSourceFiles, archiveClosedIssues,
  detectStaleRoadmapSources ((a)/(d), closed_remote precedence), detectMirrorClosed (b),
  detectStaleLabels (c, skipped_offline), detectActiveClosedFolders+isDirty (e, report-only),
  detectUnarchivedPrFolders (f, report-only, skipped_offline), buildAuditReport, executeRepairs
  (consumes report, roadmap_regenerated:true unless throw), main. Locked JSON shape only.
- Mirror: scripts/kaola-workflow-sink-merge.js:12-62 (inlined header)
- Validate: node scripts/kaola-workflow-closure-audit.js (dry) on tmp fixture

### Task 2: Add 11 walkthrough tests + register
- File: scripts/simulate-workflow-walkthrough.js
- Write Set: scripts/simulate-workflow-walkthrough.js
- Depends On: Task 1 (script must exist to require/spawn)
- Action: MODIFY
- Implement: closureAuditScript + runClosureAudit (mirror runClaimOnline:482) + offline variant; tests below.
- Validate: node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed"

### Task 3: Byte-copy + sync guard
- Write Set: plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js, scripts/validate-script-sync.js
- Depends On: Task 1, Task 2
- Action: CREATE + MODIFY
- Validate: node scripts/validate-script-sync.js → OK

## Test Plan (11 functions)
| Test fn | gh shim | Assertion focus |
|---|---|---|
| testClosureAuditOfflineRemoteClassesSkipped | none, OFFLINE=1 | stale_in_progress_labels==="skipped_offline" && unarchived_pr_folders==="skipped_offline"; dry_run:true, offline:true |
| testClosureAuditClosedRemoteRoadmapSource | issue view→closed | entry reason:"closed_remote"; counts.stale_roadmap_sources===1 |
| testClosureAuditArchiveClosedDrift | issue view→open | archive status:closed + roadmap N → reason:"archive_closed" |
| testClosureAuditDedupRoadmapAndArchive | issue view→closed + archive closed | exactly ONE entry, reason:"closed_remote" |
| testClosureAuditMirrorListsClosedIssues | issue view→closed | mirror_lists_closed_issues includes N |
| testClosureAuditStaleInProgressLabels | issue list→[{number,title,url}] | stale_in_progress_labels length 1 |
| testClosureAuditActiveFolderForClosedIssueReportsDirty | issue view→closed | dirty tracked file; active_folder_for_closed_issue[].dirty===true |
| testClosureAuditUnarchivedPrFolderMerged | pr view→{"state":"MERGED"} | sink:pr+pr_url folder in unarchived_pr_folders |
| testClosureAuditExecuteRepairsRoadmapAndLabels | issue view→closed, issue list→labelled, issue edit --remove-label→marker | dry_run:false; roadmap_sources_removed:[N], labels_removed:[N], roadmap_regenerated:true; marker exists; .roadmap/issue-N.md gone |
| testClosureAuditExecuteNeverTouchesActiveFolders | issue view→closed | active folder present before+after --execute; in reported_not_repaired.active_folder_for_closed_issue |
| testClosureAuditDryRunNeverCallsRemoveLabel (advisor-added) | issue edit --remove-label→marker | marker does NOT exist after dry-run |

## Advisor Notes
Blueprint approved. 3 refinements applied: (1) +11th test (dry-run no-remove-label side-effect);
(2) roadmap_regenerated:true unless regenerateRoadmap throws (treat 'up-to-date' as success);
(3) dirty fixtures use initGitRepo (confirmed). Invariants: collectClosedSet sole issueIsClosed
caller; executeRepairs consumes report (no re-detect); locked JSON is the contract; write tests
directly (no Sonnet tdd-guide — quota). No architect-revision needed (no gaps).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md (model=opus) | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no blueprint gaps; revision branch not triggered |
