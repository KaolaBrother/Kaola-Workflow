# resume-display (tdd-guide) — issue #328 bundle lane

Node: resume-display
Role: tdd-guide
Write set: scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, scripts/test-adaptive-node.js

---

## RED

Tests added to `scripts/test-adaptive-node.js` (three new test blocks: T-bundle-1, T-bundle-2, T-bundle-3) BEFORE implementation. Running `node scripts/test-adaptive-node.js` produced 13 failures:

```
FAIL: T-bundle-1: bundleId populated, got undefined
FAIL: T-bundle-1: issueNumbers is array of 3, got undefined
FAIL: T-bundle-1: issueNumbers values correct, got []
FAIL: T-bundle-1: closurePolicy populated, got undefined
FAIL: T-bundle-1: primaryIssue===42 (primary from issue_number), got undefined
FAIL: T-bundle-2: bundleId===null for single-issue, got undefined
FAIL: T-bundle-2: issueNumbers===[] for single-issue, got undefined
FAIL: T-bundle-2: closurePolicy===null for single-issue, got undefined
FAIL: T-bundle-2: primaryIssue===42 from issue_number in single-issue state, got undefined
FAIL: T-bundle-3: orphan refuse carries bundleId, got undefined
FAIL: T-bundle-3: orphan refuse carries issueNumbers, got undefined
FAIL: T-bundle-3: orphan refuse carries closurePolicy, got undefined
FAIL: T-bundle-3: orphan refuse carries primaryIssue, got undefined
adaptive-node tests FAILED (13 failures, 201 passed)
EXIT:1
```

---

## GREEN

Implementation: added four bundle-field reads to `runOrient` in BOTH adaptive-node.js copies (root + plugin), right after the `escalatedToFull` read. Added the four fields (`bundleId`, `issueNumbers`, `closurePolicy`, `primaryIssue`) to all three return points: `batch_topup_incomplete` refuse, `orphan_multi_in_progress` refuse, and `result:'ok'`.

### test-adaptive-node.js exit 0

```
adaptive-node tests passed (214 assertions)
EXIT:0
```

(195 previously passing + 19 new assertions = 214)

### test-bundle-finalize.js exit 0

```
test-bundle-finalize: all 57 tests passed
EXIT:0
```

### test-bundle-claim.js exit 0

```
test-bundle-claim: all 63 tests passed
EXIT:0
```

### test-bundle-state.js exit 0

```
test-bundle-state: all 25 tests passed
EXIT:0
```

### simulate-workflow-walkthrough.js exit 0

```
Workflow walkthrough simulation passed
EXIT:0
```

### validate-script-sync.js exit 0

```
OK: 18 common scripts and 7 byte-identical file group in sync.
EXIT:0
```

### Byte-diff confirmation

```
diff scripts/kaola-workflow-adaptive-node.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
(no output — IDENTICAL)
```

Both adaptive-node.js copies are byte-identical.
