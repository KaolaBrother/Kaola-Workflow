# tdd-task-2 — Script (B1) + behavior tests (C2)

> tdd-guide dispatched with model=opus (Sonnet rate-limited this session).

## Modified files (exactly the 2 in write set)
1. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js (CREATE, 302 lines)
2. plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (added 3 runner helpers + 2 fixture helpers + 11 tests, registered sync between last sync call and async .then())

## RED evidence
11 tests added, script not yet created → first test fails:
```
1 !== 0  at runClosureAuditOffline (...:151:10) ... ERR_ASSERTION; EXIT: 1
```
(exit 1: closure-audit module did not exist)

## GREEN evidence (orchestrator re-ran independently)
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`:
all 11 `testClosureAudit*: PASSED` + existing suite → `GitLab workflow script tests passed` EXIT 0.

## Smoke (fresh git init tmp dir)
Dry-run JSON valid: dry_run true, offline false, 5 drift keys + 5 counts (all empty/0), exit 0.
Online smoke with real glab + no GitLab remote → glab errors to stderr; detectStaleLabels catches and returns empty array (the "online glab failure = empty, not skip" contract). Offline smoke → both remote classes "skipped_offline", exit 0, no stderr.

## Orchestrator verification of the five pitfalls (read script directly)
1. No inlined ghExec; `forge = require('./kaola-gitlab-forge')` (39); `CLAIM_LABEL = forge.CLAIM_LABEL` (41). ✓
2. OFFLINE guard precedes forge in detectStaleLabels (127) and detectUnarchivedMrFolders (179). ✓
3. Lowercase MR-state compare `state === 'merged' || state === 'closed'` — NO toUpperCase (189). ✓
4. `forge.updateIssue(it.number, { unlabels: [CLAIM_LABEL] })` in executeRepairs (252). ✓
5. D4 `parseInt(field(content,'issue_iid') || field(content,'issue_number'),10)` (91). ✓
Structure matches GitHub: dry_run/execute branches, pretty-print null,2 (277/284), exports 4 fns (297-302), top-level try/catch exitCode=1 (293-295). unarchived_mr_folders key in drift+counts+reported_not_repaired.

## Deviations
None of substance. Two named fixture helpers (plantClosureRoadmapSource, makeMrSinkFolder) instead of inlining — matches the file's helper-driven idiom; makeMrSinkFolder does the pinned inline mutation (replace sink: mr, append mr_url/mr_iid), no sink param added to writeState.

## Git policy
No commits created.
