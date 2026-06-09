# state-foundation evidence — issue #328

Node: state-foundation (tdd-guide)
Date: 2026-06-09

## RED

Test run BEFORE implementation (features not yet added to active-folders.js / classifier.js):

```
$ node scripts/test-bundle-state.js
Test (a): parseStateFile reads issue_numbers into an array
FAIL: issue_numbers is an array, got undefined
/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-328/scripts/test-bundle-state.js:136
    assert(folder.issue_numbers.length === 3, 'issue_numbers has 3 members, got ' + folder.issue_numbers.length);
                                ^

TypeError: Cannot read properties of undefined (reading 'length')
    at testBundleStateParsing (/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-328/scripts/test-bundle-state.js:136:33)
    at Object.<anonymous> (/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-328/scripts/test-bundle-state.js:145:3)
    at Module._compile (node:internal/modules/cjs/loader:1812:14)
    at Object..js (node:internal/modules/cjs/loader:1943:10)
    at Module.load (node:internal/modules/cjs/loader:1533:32)
    at Module._load (node:internal/modules/cjs/loader:1335:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/main/run_main_module:154:5)
    at node:internal/main/run_main_module:33:47

EXIT CODE: 1
```

Error: `issue_numbers` is `undefined` — `readActiveFolders` did not yet return the field, and `parseStateFile` did not yet parse it. Test correctly caught the missing feature.

## GREEN

Test run AFTER implementation:

```
$ node scripts/test-bundle-state.js
Test (a): parseStateFile reads issue_numbers into an array
Test (b): single-issue state file yields issue_numbers: [] (AC#1 regression)
Test (c): classifier blocks issue #47 (member of live bundle [42,47,53])
Test (d): classifier does NOT block issue #77 (non-member)

test-bundle-state: all 25 tests passed
EXIT CODE: 0
```

### simulate-workflow-walkthrough.js (single-issue regression)

```
$ node scripts/simulate-workflow-walkthrough.js
[... 131 PASSED lines ...]
Workflow walkthrough simulation passed
EXIT CODE: 0
```

### validate-script-sync.js (byte-pair sync)

```
$ node scripts/validate-script-sync.js
OK: 18 common scripts and 7 byte-identical file group in sync.
EXIT CODE: 0
```

### byte-diff confirmation

```
$ diff scripts/kaola-workflow-active-folders.js plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js
(no output — BYTE_IDENTICAL)

$ diff scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
(no output — BYTE_IDENTICAL)
```

## What was changed

### scripts/kaola-workflow-active-folders.js (+ plugin copy)

`parseStateFile` — additive parse of three new fields:
- `issue_numbers`: comma-separated integer list → parsed via `.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>Number.isFinite(n)&&n>0)` → `number[]`; absent/empty → `[]`
- `bundle_id`: string via `field()`, empty string when absent
- `closure_policy`: string via `field()`, empty string when absent

`readActiveFolders` — added `issue_numbers`, `bundle_id`, and `closure_policy` to the returned item shape alongside the existing `issue_number`.

Single-issue state files with no `issue_numbers`/`bundle_id`/`closure_policy` lines return `issue_numbers: []`, `bundle_id: ''`, `closure_policy: ''` — byte-identical behavior for all existing callers (AC#1).

### scripts/kaola-workflow-classifier.js (+ plugin copy)

`cmdClassify` — added a bundle-membership overlap check immediately after the scalar `activeStateIssues` check:

```js
const bundleMemberIssues = new Set();
for (const f of activeFolders) for (const n of (f.issue_numbers || [])) bundleMemberIssues.add(n);

if (activeStateIssues.has(args.issue) || bundleMemberIssues.has(args.issue)) {
  process.exitCode = 2;
  return;
}
```

A candidate issue that is a member of ANY active bundle (via `folder.issue_numbers`) is now blocked (exit 2, no stdout) — in addition to the existing scalar `issue_number` match. Single-issue active folders have `issue_numbers: []` → `bundleMemberIssues` is empty → scalar path unchanged.

### scripts/test-bundle-state.js (NEW)

Hand-rolled assert test (no framework). Four tests covering:
- (a) bundle state file parses `issue_numbers`, `bundle_id`, `closure_policy`
- (b) single-issue state file regression (AC#1) — `issue_numbers: []`, scalar unchanged
- (c) classifier blocks a bundle member (exit 2)
- (d) classifier does NOT block a non-member

All fixtures in `$TMPDIR` (mkdtempSync). OFFLINE-safe (`KAOLA_WORKFLOW_OFFLINE=1`).
