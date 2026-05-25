# Phase 4 - Implementation: issue-165

## Implementation owner
Orchestrator (Opus). Sonnet quota exhausted this session, so the phase4 TDD
subagent dispatch (model=sonnet) would fail; implemented directly per advisor
direction (.cache/scope-decision.md D4, .cache/advisor-plan.md). TDD spirit
honored: tests written alongside the script, then driven to green.

## Tasks

### Task 1: scripts/kaola-workflow-closure-audit.js — CREATE — DONE
Functions: assert/ghExec/parseArgs (inlined, mirror sink-merge); collectClosedSet
(sole issueIsClosed caller, deduped); roadmapSourceFiles; archiveClosedIssues;
detectStaleRoadmapSources ((a)/(d), closed_remote wins); detectMirrorClosed (b);
detectStaleLabels (c, skipped_offline); isDirty + detectActiveClosedFolders (e,
report-only); detectUnarchivedPrFolders (f, report-only, skipped_offline);
buildAuditReport; executeRepairs (consumes report, no re-detect; roadmap_regenerated
true unless regenerateRoadmap throws); main. ZERO changes to claim.js.
Smoke-tested on real repo: offline → skipped_offline sentinels; online dry-run →
surfaced 18 closed issues still carrying workflow:in-progress (incl. #127 from #161).

### Task 2: scripts/simulate-workflow-walkthrough.js — MODIFY — DONE
Added closureAuditScript const, runClosureAudit + runClosureAuditOffline helpers,
closureAuditShim helper, and 11 test functions; registered all 11 in main().
All 11 PASS; full walkthrough prints "Workflow walkthrough simulation passed", exit 0.

### Task 3: byte-copy + COMMON_SCRIPTS — DONE
plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js byte-identical (diff clean).
Added 'kaola-workflow-closure-audit.js' to COMMON_SCRIPTS in validate-script-sync.js
(after classifier). validate-script-sync.js → "OK: 10 common scripts ... in sync."

## Validation
- node scripts/simulate-workflow-walkthrough.js → passed, exit 0 (all 11 new tests green).
- node scripts/validate-script-sync.js → OK.
- npm test (all 4 editions, no forced OFFLINE) → exit 0. Claude/Codex/GitLab/Gitea all pass.
- NOTE: a global KAOLA_WORKFLOW_OFFLINE=1 makes an unrelated gitlab forge-helper subprocess
  fail (discoverProject returns ''); that is an env artifact, not a regression — CI runs
  npm test without forcing offline. Verified: gitlab forge helper exits 0 without OFFLINE.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| TDD implementation subagent (model=sonnet) | N/A | code in scripts/kaola-workflow-closure-audit.js + 11 tests | Sonnet quota exhausted this session; subagent dispatch returns quota error. Orchestrator (Opus) implemented directly, tests-alongside-then-green (advisor-directed, D4). |
| Tests written and passing | done | 11 test fns in simulate-workflow-walkthrough.js; npm test exit 0 | |
| Byte-sync to plugin tree | done | validate-script-sync.js OK | |
