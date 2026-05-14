# Code Explorer: claim-hardening-followups

## File Line Counts

- `scripts/kaola-workflow-claim.js`: 469 lines
- `scripts/simulate-workflow-walkthrough.js`: 1271 lines

---

## 1. updateSinkLease Function (Item 1 — replace parity)

**Lines 113–139**

Two problematic string-form `.replace()` calls at lines 133–137:

```js
// line 133-136
let updated = content.replace(
  /\n## Sink[\s\S]*?(?=\n## [^SL]|\n## L|$)/,
  sinkBlock                   // ← string-form — $& / $1 expansion risk
);
// line 137
updated = updated.replace(/(?:^|\n)(## Lease[\s\S]*?)(?=\n##|[\s]*$)/, '\n' + leaseBlock.slice(1));
//                                                                        ↑ string-form — same risk
```

`sinkBlock` and `leaseBlock` are built from `lockData.project`, `lockData.session_id`, and other
fields at lines 117–125. Any `$&`/`$1` sequences in those values expand silently.

## 2. cmdPatchBranch Function-Form Pattern to Mirror

**Line 387**

```js
const patched = content.replace(/^branch:.*$/m, () => 'branch: ' + args.branch);
```

Arrow function `() => <value>` as second arg — the replacement string is never interpreted.
This is the exact pattern to use for both updateSinkLease replacements.

## 3. updateLeaseInPlace — Additional Non-Function-Form (Completeness Scan)

**Lines 147–148**

```js
.replace(/^expires:.*$/m, 'expires: ' + lockData.expires)
.replace(/^last_heartbeat:.*$/m, 'last_heartbeat: ' + lockData.last_heartbeat)
```

Values are ISO dates from `new Date(...).toISOString()` — internally generated, never contain
`$` patterns. Lower risk than project/session_id. NOT in scope for issue #11 but noted.

**Line 19** (intentional `$&` — do NOT change):
```js
const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

## 4. Test 8D Block (Item 2 — assertion tightening)

**Lines 1111–1115**

```js
const entry8d = results8d.find(e => e.lock && e.lock.project === 'epic8d');
assert(
  entry8d == null || (entry8d.drift && entry8d.drift.includes('session_id unsafe')),
  '8D: unsafe session_id entry must be absent or have drift ["session_id unsafe"]'
);
```

`cmdStatus` always returns an entry for a valid lock; `entry8d` will never be null when a lock
exists. The `== null` branch creates a false-pass window if entry8d were silently dropped.

Fix: split into two asserts:
1. `assert(entry8d != null, '8D: status must include entry for epic8d lock')`
2. `assert(entry8d.drift && entry8d.drift.includes('session_id unsafe'), '8D: ...')`

## 5. Test 8E Label (Item 3)

**Line 1180** (comment):
```js
// 8E: re-claim must refresh issue_number and claimed_at (M1 probe)
```

No literal string "re-claim Sink refresh" exists verbatim. The label is the inline comment.
Fix: prepend "claim-after-release — " to accurately describe the test sequence.

## 6. runClaim Helper (Item 4 — stderr surfacing)

**Lines 1061–1077**

```js
function runClaim(workdir, sessionId, issue, claimProject) {
  execFileSync(process.execPath, [
    claimScript, 'claim',
    '--session', sessionId,
    '--project', claimProject,
    '--issue', String(issue)
  ], {
    cwd: workdir, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],  // stderr piped but not captured
    env: { ...process.env, HOME: workdir, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  return {
    lockPath: path.join(workdir, 'kaola-workflow', '.locks', claimProject + '.lock'),
    statePath: path.join(workdir, 'kaola-workflow', claimProject, 'workflow-state.md')
  };
}
```

`execFileSync` throws on non-zero exit but stderr is inaccessible from the throw.
`spawnSync` (already imported at line 5) returns `{ status, stdout, stderr }` — preferred.

## 7. Test Framework

**Lines 10–13** — hand-rolled assert:
```js
function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}
```

## Precise Targets

| Item | File | Line(s) | Change |
|------|------|---------|--------|
| 1a | kaola-workflow-claim.js | 133-136 | `sinkBlock` → `() => sinkBlock` |
| 1b | kaola-workflow-claim.js | 137 | `'\n' + leaseBlock.slice(1)` → `() => '\n' + leaseBlock.slice(1)` |
| 2 | simulate-workflow-walkthrough.js | 1112-1115 | Split null-or into two sequential asserts |
| 3 | simulate-workflow-walkthrough.js | 1180 | Update comment to include "claim-after-release" |
| 4 | simulate-workflow-walkthrough.js | 1062-1077 | Replace execFileSync with spawnSync + surface stderr |
