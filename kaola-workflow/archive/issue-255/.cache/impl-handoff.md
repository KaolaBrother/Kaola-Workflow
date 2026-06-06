# Node: impl-handoff — RED→GREEN Evidence

## RED Output (module not yet present — expected failure)

```
node:internal/modules/cjs/loader:1450
  throw err;
  ^

Error: Cannot find module './kaola-workflow-adaptive-handoff'
Require stack:
- /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/test-adaptive-handoff.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1447:15)
    ...
    code: 'MODULE_NOT_FOUND'

EXIT: 1
```

## GREEN Output (all assertions passing)

```
adaptive-handoff tests passed (45 assertions)
EXIT: 0
```

## Final test-run exit code: 0

## Key design note: planPath-first argument order

All shelled scripts (plan-validator, commit-node) take planPath as args[0], matching their
`const planPath = args[0]` convention. Implementation verified by running:
  node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-255/workflow-plan.md --json  → exit 0 (correct)
  node scripts/kaola-workflow-plan-validator.js --json kaola-workflow/issue-255/workflow-plan.md  → refuse (wrong order)

The implementation uses [planPath, '--json'], [planPath, '--freeze', '--json'], etc.
The test stubs use args.includes(flag) (not args[0]) to discriminate calls correctly.

## Mandatory Assertion Notes (T1–T8)

- **T1 (regression):** `decision:ask` → `ready_to_dispatch_first_node`, `decision==='ask'`, all 7 checklist fields true, `risk.blastRadius===true` echoed, `risk_authorized` key ABSENT. PRESENT (10 assertions).
- **T2 (auto-run→ready):** `in-grammar+auto-run` → `ready_to_dispatch_first_node`, all checklist true, no `risk_authorized`. PRESENT (4 assertions).
- **T3 (refuse→plan_invalid + no mutation):** validator `result:refuse` → `plan_invalid`, errors surfaced, `validator_verdict` present, `writeFile` NEVER called, `--freeze` NOT called. PRESENT (5 assertions).
- **T4 (no issue_number):** state with no `issue_number` in `## Sink` → `roadmap_staged:true` vacuously, roadmap init NOT called, handoff still ready. PRESENT (3 assertions).
- **T5 (idempotent re-run):** plan already node1 `in_progress`; freeze same hash, baseline `reused:true`, init-issue skip → ready, `## Planning Evidence` appears exactly once (replaced not appended). PRESENT (2 assertions).
- **T6 (## Sink preserved):** state has `## Sink` with trailing `pr_url:` and `worktree_path:` → after insert `## Planning Evidence` appears before `## Last Updated`, `## Sink` block byte-identical, `pr_url` and `worktree_path` preserved. PRESENT (5 assertions).
- **T7 (state-missing→plan_invalid no-mutation):** missing state file → `plan_invalid`, errors contain `workflow-state.md missing`, `writeFile` not called, shell not called. PRESENT (4 assertions).
- **T8 (shellHandoff seam):** stub validator in `os.tmpdir` exiting 1 with canned JSON → `shellHandoff` captures `{exitCode:1, result:'refuse', errors:['T8 stub validator error']}`. Temp dir cleaned via `finally fs.rmSync`. PRESENT (3 assertions).

Total: 45 assertions across T1–T8.
