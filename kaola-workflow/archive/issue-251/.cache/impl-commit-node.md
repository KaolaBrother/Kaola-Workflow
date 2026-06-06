## impl-commit-node evidence — issue #251

### RED

Command:
```
node /tmp/test-commit-node-verdict.js
```

Output (exit 1):
```
Test 1: per-node with failing verdictCheck — informational
  PASS: per-node overallOk is true (based on barrier only)
  FAIL: per-node output has verdictCheck key
  FAIL: per-node verdictCheck.informational === true
  FAIL: per-node verdictCheck.ok === false (original value preserved)

Test 2: whole-plan with failing verdictCheck — blocking
  FAIL: whole-plan overallOk is false when verdictCheck fails
  FAIL: whole-plan output has verdictCheck key
  PASS: whole-plan verdictCheck has no informational flag

Test 3: whole-plan with all passing — overallOk true
  PASS: whole-plan overallOk is true when all pass
  FAIL: whole-plan output has verdictCheck key

Test 4: per-node-start — verdictCheck should be null
  PASS: per-node-start overallOk is true
  PASS: per-node-start verdictCheck is null

Results: 5 passed, 6 failed
RED confirmed: combineResults does not yet thread verdictCheck.
```

### GREEN

Command (after editing scripts/kaola-workflow-commit-node.js):
```
node /tmp/test-commit-node-verdict.js
```

Output (exit 0):
```
Test 1: per-node with failing verdictCheck — informational
  PASS: per-node overallOk is true (based on barrier only)
  PASS: per-node output has verdictCheck key
  PASS: per-node verdictCheck.informational === true
  PASS: per-node verdictCheck.ok === false (original value preserved)

Test 2: whole-plan with failing verdictCheck — blocking
  PASS: whole-plan overallOk is false when verdictCheck fails
  PASS: whole-plan output has verdictCheck key
  PASS: whole-plan verdictCheck has no informational flag

Test 3: whole-plan with all passing — overallOk true
  PASS: whole-plan overallOk is true when all pass
  PASS: whole-plan output has verdictCheck key

Test 4: per-node-start — verdictCheck should be null
  PASS: per-node-start overallOk is true
  PASS: per-node-start verdictCheck is null

Results: 11 passed, 0 failed
GREEN: all assertions passed.
```

Key contract confirmed:
- per-node: overallOk is barrier-only (informational), verdictCheck carries `informational:true`
- whole-plan: overallOk = barrierPass && gatePass && verdictPass (BLOCKING), no informational flag
- per-node-start: verdictCheck is null

### verdictCheck key in commit-node whole-plan output

Command:
```
node scripts/kaola-workflow-commit-node.js kaola-workflow/issue-251/workflow-plan.md --json
```

Output (relevant fields):
```json
{
  "verdictCheck key present": true,
  "mode": "whole-plan",
  "verdictCheck": {"exitCode":0,"ok":true,"failures":[],"checked":[]}
}
```

`checked:[]` is expected — no gate-role nodes are marked complete in the ledger yet.

### root ↔ plugins/kaola-workflow byte-identical

Command:
```
cmp scripts/kaola-workflow-commit-node.js plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js
```
Result: IDENTICAL (cmp exited 0, no output)

### Fork port confirmation

gitea diff (exactly one line):
```
33c33
< const VALIDATOR = 'kaola-workflow-plan-validator.js';
---
> const VALIDATOR = 'kaola-gitea-workflow-plan-validator.js';
```

gitlab diff (exactly one line):
```
33c33
< const VALIDATOR = 'kaola-workflow-plan-validator.js';
---
> const VALIDATOR = 'kaola-gitlab-workflow-plan-validator.js';
```

All other lines are byte-identical to root.

### Regression walkthrough

Command:
```
node scripts/simulate-workflow-walkthrough.js
```

Exit code: 0
Last lines:
```
testAdaptiveCheapWinFixes: PASSED
testAdaptiveAuditCoverage: PASSED
Workflow walkthrough simulation passed
```

verdict: pass
findings_blocking: 0
