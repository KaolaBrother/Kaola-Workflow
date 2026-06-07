# task-mirror — node evidence (issue #266, AC-C)

Node: task-mirror | Role: tdd-guide | Issue: #266

## RED — scratch test failure (before implementation)

Command: `node /tmp/test-task-mirror-red.js`

```
RED: require failed (expected before implementation): Cannot find module
'/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-266/scripts/kaola-workflow-task-mirror.js'
Require stack:
- /private/tmp/test-task-mirror-red.js
Exit code: 1
```

Scratch test covered:
- Frozen plan with mixed ledger statuses (complete / in_progress / pending / n/a)
- Unfrozen plan (no plan_hash) -> typed refusal { status: 'plan_not_frozen' }
- Determinism check (same now => byte-identical output)
- mapLedgerStatus for all 4 known values + unknown/undefined -> pending

## GREEN — scratch test pass (after implementation)

Command: `node /tmp/test-task-mirror-red.js`

```
GREEN: all assertions passed
Exit code: 0
```

All assertions verified:
- source_plan_hash = 64-hex from readStoredHash
- tasks[] in ## Nodes row order (explore, architect, implement, skip-node)
- ledger_status: 'complete' -> status: 'completed'
- ledger_status: 'in_progress' -> status: 'in_progress'
- ledger_status: 'pending' -> status: 'pending'
- ledger_status: 'n/a' -> status: 'completed' (ledger_status preserved as 'n/a')
- unfrozen plan -> { status: 'plan_not_frozen' }
- determinism: JSON.stringify(result1) === JSON.stringify(result2) for same now

## CLI smoke tests

Happy path (frozen plan, real workflow-plan.md):
```
node scripts/kaola-workflow-task-mirror.js --project _smoke --now "2026-06-07T12:00:00.000Z" --json
# Produces: { source_plan_hash, tasks:[...], last_synced_from_ledger }
# 2-space indent, stable key order, trailing newline. Exit 0.
```

Refusal path (unfrozen plan, plan_hash stripped):
```
node scripts/kaola-workflow-task-mirror.js --project _smoke2 --now ... --json
{ "status": "plan_not_frozen" }
Exit code: 1
No workflow-tasks.json written (confirmed: ls returns ENOENT)
```

## Determinism check

Same planContent + same now => byte-identical JSON.stringify output. Confirmed
by calling generateMirror({ planContent: FROZEN_PLAN, now: NOW }) twice and
asserting strict equality of the stringified results.

## Byte-identity: claude == codex

```
cmp scripts/kaola-workflow-task-mirror.js plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js
IDENTICAL (exit 0)
```

Both files are byte-for-byte identical (copied with `cp`, not hand-authored separately).

## gitlab port — single-line diff confirmation

```
diff scripts/kaola-workflow-task-mirror.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js
25c25
< const { parseNodes, parseLedger, readStoredHash } = require('./kaola-workflow-plan-validator');
---
> const { parseNodes, parseLedger, readStoredHash } = require('./kaola-gitlab-workflow-plan-validator');
```

Exactly ONE line differs (the require path).

## gitea port — single-line diff confirmation

```
diff scripts/kaola-workflow-task-mirror.js plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js
25c25
< const { parseNodes, parseLedger, readStoredHash } = require('./kaola-workflow-plan-validator');
---
> const { parseNodes, parseLedger, readStoredHash } = require('./kaola-gitea-workflow-plan-validator');
```

Exactly ONE line differs (the require path).

## validate-script-sync.js PASS (dangling reference cleared)

```
node scripts/validate-script-sync.js
OK: 17 common scripts and 7 byte-identical file group in sync.
Exit code: 0
```

The preflight node previously added 'kaola-workflow-task-mirror.js' to COMMON_SCRIPTS,
creating a dangling reference. Now that both base-named copies exist and are byte-identical,
validate-script-sync.js passes cleanly.

## git status sanity

```
git status --short (task-mirror files only):
?? plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js
?? plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js
?? plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js
?? scripts/kaola-workflow-task-mirror.js
```

Exactly the 4 declared write-set files are new (plus pre-existing kaola-workflow/issue-266/
artifacts and the preflight-node files which are exempt).

## 4 files created

- scripts/kaola-workflow-task-mirror.js (claude base)
- plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js (codex — BYTE-IDENTICAL to claude base)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js (gitlab PORT — single-line require diff)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js (gitea PORT — single-line require diff)

build-green
