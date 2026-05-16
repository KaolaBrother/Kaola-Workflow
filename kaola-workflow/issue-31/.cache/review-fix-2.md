# Security Fix Report: Issue-31 Session Identity Binding

**Date:** 2026-05-16
**Session:** TDD security fix pass

---

## Modified Files

- `scripts/kaola-workflow-claim.js` (3 changes: H1 guard consistency, isSafeName extension, H2 call-site validation)
- `scripts/simulate-workflow-walkthrough.js` (2 new test blocks: 8N-task-security-fix-1, 8N-task-security-fix-2)

---

## RED Evidence (tests failing before fixes)

### security-fix-1 (H1)
```
Error: security-fix-1: all KAOLA_KERNEL_SESSION_SKIP checks must use strict === '1' or !== '1' comparison. Bad lines:
  if (derived.sid === null && !process.env.KAOLA_KERNEL_SESSION_SKIP) {
  if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(args.session, coordRoot, args);
  if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(args.session, coordRoot, args);
```

### security-fix-2 (H2)
Verified separately with inline node script before fix:
```
status: 0
stdout: "bad\ninjection\n"
```
The malformed SID was returned verbatim by `derive-session` with the unfixed code.

---

## GREEN Evidence

```
Workflow walkthrough simulation passed
```
Process exited 0. All prior tests and both new security test blocks passed.

---

## Changes Applied

### H1: KAOLA_KERNEL_SESSION_SKIP guard consistency

**Lines changed in claim.js:** 546, 1117, 1171

Before:
```javascript
if (derived.sid === null && !process.env.KAOLA_KERNEL_SESSION_SKIP) {
if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(...);
if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(...);
```

After:
```javascript
if (derived.sid === null && process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') {
if (process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') enforcePlatformSessionOrExit(...);
if (process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') enforcePlatformSessionOrExit(...);
```

Line 210 (`=== '1'`) was already correct and unchanged.

### H2: isSafeName validation in derivePlatformSessionId

**Call-site fix (lines 232-234 in claim.js):**
```javascript
if (!isSafeName(data.sid)) {
  return { sid: null, source: 'invalid_sid' };
}
return { sid: data.sid, source: 'file' };
```
Inserted after the start_time check (line 231) and before the return.

**isSafeName extension (lines 15-19):**
```javascript
function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && !name.includes('\n') &&
    !name.includes('\r') && !name.includes('\t') &&
    name !== '.' && name !== '..';
}
```

---

## Deviations

### D1: isSafeName extended beyond task literal text

**Task prescribed:** insert `if (!isSafeName(data.sid))` at call site in `derivePlatformSessionId`.

**Issue discovered:** The existing `isSafeName` only rejects `/`, `\`, `\0`, `.`, `..`. It does NOT reject newlines. A SID of `'bad\ninjection'` returned `isSafeName() === true`, meaning the call-site check alone would not have blocked injection.

**Resolution:** Extended `isSafeName` to also reject `\n`, `\r`, and `\t`. This is strictly additive to the task's prescribed call-site insertion. All existing test fixtures use clean identifiers (e.g. `sid-from-file`, `fake-sid`, `owner-session`) and are unaffected. The H2 test (which greps for the malformed output) now correctly discriminates: RED without the fix, GREEN with it.

**Rationale:** Strengthening `isSafeName` is defense-in-depth — every other call site (project names, `--session` args, lock file session_id fields) benefits from the stronger check. The task's injection threat model requires newline rejection to be meaningful.

### D2: Test RED ordering — security-fix-2 verified separately

Because `security-fix-1` halts the suite first (assertion failure), `security-fix-2` was verified as RED using a standalone inline node script before applying fixes. Both were confirmed RED against the unfixed codebase.
