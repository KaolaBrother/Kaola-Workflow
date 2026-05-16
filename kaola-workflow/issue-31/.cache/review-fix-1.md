# Phase 5 Review Fix Results — Issue 31 Session Identity Binding

## TDD Summary

### RED Phase
Added 3 test blocks to `scripts/simulate-workflow-walkthrough.js`. The suite aborts on first failure, so RED evidence was captured as follows:

**review-fix-1 RED (direct):**
```
Error: review-fix-1: session-env.js must document the 2-hop assumption (grep for "empirically verified" or "2-hop")
```
Suite aborted here; review-fix-2 and review-fix-3 did not run yet.

**review-fix-3 RED (discriminator verified separately):**
Initial version of the test used only `exit 2` and `BLOCKED` assertions. These would pass against the old code (which exits 2 via cross-session block with `BLOCKED: cross-session commit...`). A third assertion was added:
```javascript
assert(rRf3.stderr.includes('derive-session returned no identity'), ...);
```
Old code stderr: `BLOCKED: cross-session commit on project "test-project". Lock held by owner-session; current session is some-session (derived).`
— does NOT include "derive-session returned no identity" → assertion FAILS (RED confirmed).

**review-fix-2 RED (not independently triggered):**
AC9 tests `enforcePlatformSessionOrExit` with a dead PID identity file. `isPidAlive(99999999)` returns false → `derivePlatformSessionId` returns `{sid:null}` → exit 3. This is already-implemented behavior (no new code needed in claim.js). The test closes the gap in the walkthrough suite.

### GREEN Phase
All 3 blocks pass after applying the two source fixes:
```
Workflow walkthrough simulation passed
```
(exit 0)

---

## Modified Files

### scripts/kaola-workflow-session-env.js

**Change 1 — inline comment documenting 2-hop assumption:**
Line ~42, added above `claudePid` assignment:
```javascript
// assumes Claude spawns bash directly — empirically verified Phase 0.1; 2-hop: node.ppid=bash, bash.ppid=claude
```

**Change 2 — else branch with stderr warning inside outer try:**
After the `if (claudePid && claudePid > 1) { ... }` block:
```javascript
    } else {
      process.stderr.write('[kaola-session-env] warn: could not locate Claude ancestor PID (got ' + claudePid + ') — identity file not written\n');
    }
```

### hooks/kaola-workflow-pre-commit.sh

**Changed lines 85-93 — block commit when derive-session empty under enforcement:**
```bash
DERIVED_SID="$(node "$GIT_ROOT/scripts/kaola-workflow-claim.js" derive-session 2>/dev/null)" || DERIVED_SID=""
if [ -z "$DERIVED_SID" ]; then
  if [ "${KAOLA_ENFORCE_PLATFORM_SESSION:-}" = "1" ]; then
    printf 'BLOCKED: derive-session returned no identity under enforcement for project "%s". Cannot verify session ownership.\n' \
      "$PROJECT" >&2
    exit 2
  fi
  DERIVED_SID="${KAOLA_SESSION_ID:-}"
fi
```

### scripts/simulate-workflow-walkthrough.js

Three new test blocks inserted before `console.log('Workflow walkthrough simulation passed')`:

**8N-task-review-fix-1 (structural):**
Greps `kaola-workflow-session-env.js` source for:
- `"empirically verified"` or `"2-hop"` (2-hop assumption documented)
- `"could not locate Claude ancestor PID"` (stderr warning path present)

**8N-task-review-fix-2 (AC9 — gap closure):**
- Creates tmp coordRoot with identity file for dead PID 99999999
- Runs `heartbeat --project some-project --session fake-sid` with `KAOLA_ENFORCE_PLATFORM_SESSION=1` and `KAOLA_KERNEL_SESSION_FAKE_PID=99999999`
- `isPidAlive(99999999)` returns false → `derivePlatformSessionId` returns `{sid:null}` → `enforcePlatformSessionOrExit` exits 3
- Asserts `status === 3`

**8N-task-review-fix-3 (pre-commit enforcement — gap closure):**
- Sets up tmp git repo with `test-project.lock` owned by `owner-session`
- Stages `kaola-workflow/test-project/workflow-state.md`
- Runs hook with `KAOLA_ENFORCE_PLATFORM_SESSION=1`, `KAOLA_SESSION_ID=some-session`, no `KAOLA_KERNEL_SESSION_SKIP`
- `derive-session` returns empty (no Claude ancestor in subprocess) → new enforcement branch fires
- Asserts `status === 2`, stderr includes `BLOCKED`, stderr includes `derive-session returned no identity`
