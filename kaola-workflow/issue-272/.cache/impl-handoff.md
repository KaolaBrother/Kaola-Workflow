# impl-handoff evidence — issue #272

## RED

Test file `scripts/test-adaptive-handoff.js` was edited first:
- All `ready_to_dispatch_first_node` literal asserts renamed to `ready_to_run`
- Deleted T1 asserts on `checklist.first_node_opened` and `checklist.baseline_recorded`
- Deleted T2 compound checklist assert conjuncts `first_node_opened && baseline_recorded`
- Deleted T5 assert `checklist.first_node_opened === true`
- Commit-node stub responses (`kaola-workflow-commit-node.js:--node-id`) left intact during RED capture

RED result against unmodified handoff:
```
FAIL: T1: handoff_status===ready_to_run (NOT needs_user_approval)
FAIL: T2: ready on auto-run
FAIL: T4: ready even with no issue_number
FAIL: T5: idempotent re-run → ready
FAIL: T5: run2 → ready
FAIL: T5: run3 → ready
FAIL: T5b: run1 → ready
FAIL: T5b: run2 → ready
FAIL: T5b: run3 → ready
FAIL: T6: handoff ready
adaptive-handoff tests FAILED (10 failures, 48 passed)
```

All 10 failures are token-rename failures (no noise or infra failures).

## GREEN

Changes applied to `scripts/kaola-workflow-adaptive-handoff.js` (#1):
- Header doc comment updated: step list 8→6 steps, schema updated (ready_to_run, dropped first_node_opened/baseline_recorded)
- Dropped COMMIT_NODE constant and commitNodePath variable
- Deleted spliceLedgerNode() function entirely (moved to adaptive-node.js per blueprint)
- Dropped step 5 (commit-node --start baseline) from runHandoff()
- Dropped step 6 (spliceLedgerNode ledger splice) from runHandoff()
- Renamed step 7→5 (roadmap), step 8→6 (Planning Evidence)
- Return packet: handoff_status `ready_to_dispatch_first_node` → `ready_to_run`
- Checklist: removed `first_node_opened` and `baseline_recorded` keys
- main() exit gate: `!== 'ready_to_dispatch_first_node'` → `!== 'ready_to_run'`

After GREEN confirmed, dead commit-node stubs removed from T1, T2, T4, T5, T5b, T6 test cases.

Codex copy (#2): `cp scripts/kaola-workflow-adaptive-handoff.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js` — BYTE-IDENTICAL (confirmed by diff).

Forge ports (#3 gitlab, #4 gitea): Same structural edits applied preserving forge-renamed requires/consts:
- gitlab port: `COMMIT_NODE = 'kaola-gitlab-workflow-commit-node.js'` dropped; same steps dropped
- gitea port: `COMMIT_NODE = 'kaola-gitea-workflow-commit-node.js'` dropped; same steps dropped

`scripts/simulate-workflow-walkthrough.js` changes:
- testAdaptiveHandoffInGrammarReady: status → `ready_to_run`; deleted `first_node_opened`/`baseline_recorded` asserts; deleted `in_progress` ledger assert and `barrier-base-explore` existence assert; added ledger-remains-pending assert
- testAdaptiveHandoffAskFreezesNotApproval: status → `ready_to_run`; deleted `first_node_opened`/`baseline_recorded` asserts
- testAdaptiveHandoffIdempotentReRun: status → `ready_to_run` (both runs); ledger `in_progress` assert → `pending` assert
- testAdaptiveHandoffProjectFlagResolvesRepoRoot: status → `ready_to_run`
- Updated function header comments and git-repo setup comment

## Gate Results

All three gates pass GREEN:

1. `node scripts/test-adaptive-handoff.js`
   → `adaptive-handoff tests passed (58 assertions)`

2. `node scripts/validate-script-sync.js`
   → `OK: 14 common scripts and 5 byte-identical file group in sync.`
   (confirms scripts/kaola-workflow-adaptive-handoff.js and plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js are BYTE-IDENTICAL)

3. `node scripts/simulate-workflow-walkthrough.js`
   → `Workflow walkthrough simulation passed`

## Frozen-Core Untouched

Confirmed via `git diff --name-only` on the 5 frozen-core scripts:
- scripts/kaola-workflow-next-action.js — UNTOUCHED
- scripts/kaola-workflow-commit-node.js — UNTOUCHED
- scripts/kaola-workflow-plan-validator.js — UNTOUCHED
- scripts/kaola-workflow-adaptive-schema.js — UNTOUCHED
- scripts/kaola-workflow-resolve-agent-model.js — UNTOUCHED

Write set discipline: exactly 6 declared files touched (+ this evidence file).
The package.json diff shown in `git diff --name-only` was a pre-existing change from the impl-core node, not introduced by impl-handoff.
