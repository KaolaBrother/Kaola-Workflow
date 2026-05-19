# Security Review — Issue #89

## HIGH: Argument injection via unvalidated branch name in git checkout calls

**File:** plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
**Lines:** runDirectMerge arg validation (line 218), git checkout calls (lines ~87, 150, 156, 168, 257)

**Issue:** `args.branch` is validated only as truthy and not 'TBD'. `isSafeName()` is not called on it, and `isSafeName` does not block leading hyphens. A branch value starting with `-` (e.g. `--orphan`) would pass validation and be interpreted by git as an option flag, not a branch name.

**Remediation:** Extend the branch assert in `runDirectMerge` to match the GitHub reference main() validation:
```js
assert(
  args.branch && args.branch !== 'TBD' &&
  !args.branch.startsWith('-') && !args.branch.includes('\0') &&
  args.branch !== '.' && args.branch !== '..',
  '--branch is invalid or TBD'
);
```
Note: `git checkout -- <branch>` is not valid syntax for switching branches. The correct protection is the leading-hyphen guard at validation time.

## LOW: Arbitrary path write via KAOLA_WORKFLOW_DEBUG_CWD in exit handler
**Lines:** 235-243
Content written is benign (cwd string), but destination is env-var-controlled. Low severity in local toolchain context — this is a test-only hook with no production use.

## LOW: closeLinkedIssue forge calls not wrapped in try/catch
**Lines:** 100-101
Only reachable via skipGit legacy path (tests only). Low severity.

## Not Findings
- No hardcoded secrets
- execFileSync array args throughout (no shell injection)
- isSafeName() on args.project prevents path traversal in receipt path
- Forge API calls in new pipeline properly swallowed in try/catch

## Verdict
1 HIGH (branch name validation gap), 2 LOW. HIGH must be fixed before Phase 6.
