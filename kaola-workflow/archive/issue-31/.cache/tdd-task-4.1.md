# TDD Task 4.1 — Pre-Commit Hook: Replace Env Comparison

## Summary

Task 4.1 replaces the hard-coded `$KAOLA_SESSION_ID` comparison in the pre-commit hook with a kernel-derived session ID obtained via `node scripts/kaola-workflow-claim.js derive-session`.

## TDD Cycle

### RED — Test Written First

Added test block `// 8N-task4.1` to `scripts/simulate-workflow-walkthrough.js` at line 4030 (before the existing task4.2 and task5.1 blocks).

The discriminating assertion that makes the test RED (not just GREEN-before-change) is:
```
assert(rBlock.stderr.includes('(derived)'), ...)
```
The old hook message lacked `(derived)`, so this assertion correctly failed before the hook was changed.

### RED Evidence

```
Error: AC15-block: stderr must include "(derived)" to confirm kernel-derived path, got: BLOCKED: cross-session commit on project "proj-ac15". Lock held by sess-real-owner; current session is sess-impostor.
    at assert (.../simulate-workflow-walkthrough.js:29:11)
    at main (.../simulate-workflow-walkthrough.js:4082:9)
```

Exit code: non-zero (threw).

The first two assertions (status === 2, stderr includes 'BLOCKED') passed, confirming the test infrastructure was working. Only the `(derived)` marker assertion failed — the correct RED signal.

### GREEN — Hook Implementation

Modified `hooks/kaola-workflow-pre-commit.sh` lines 85-89, replacing:

```bash
if [ "$OWNER" != "$KAOLA_SESSION_ID" ]; then
  printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s.\n' \
    "$PROJECT" "$OWNER" "$KAOLA_SESSION_ID" >&2
  exit 2
fi
```

With:

```bash
DERIVED_SID="$(node "$GIT_ROOT/scripts/kaola-workflow-claim.js" derive-session 2>/dev/null)" || DERIVED_SID=""
if [ -z "$DERIVED_SID" ]; then
  DERIVED_SID="${KAOLA_SESSION_ID:-}"
fi
if [ -n "$DERIVED_SID" ] && [ "$OWNER" != "$DERIVED_SID" ]; then
  printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s (derived).\n' \
    "$PROJECT" "$OWNER" "$DERIVED_SID" >&2
  exit 2
fi
```

Key behaviors:
- Calls `derive-session` to get kernel-derived session ID
- Falls back to `$KAOLA_SESSION_ID` if `derive-session` returns empty (non-Claude tool, no KAOLA_SESSION_ID set)
- Hook exits 0 if `DERIVED_SID` is empty (preserves backward compat for non-Claude tools)
- Prints `(derived)` in BLOCKED message to confirm new code path

### GREEN Evidence

IMPORTANT: The walkthrough exits non-zero, failing at AC13 (task 5.1 — `runTick` missing `isPidAlive(tickCtx.claudePid)` guard). This failure is pre-existing in the worktree: the test was scaffolded by a prior agent but task 5.1's implementation is marked `pending` in phase4-progress.md. It is NOT caused by task 4.1 changes.

Confirmed AC15 passes by observing the failure point moved past AC15 (previously failing at AC15's `(derived)` assertion, now failing at AC13). To isolate task 4.1 verification: with the hook change applied, AC15-block and AC15-pass both execute without throwing.

```
Error: AC13: runTick must contain isPidAlive(tickCtx.claudePid) guard
    at assert (.../simulate-workflow-walkthrough.js:4136:7)
```

AC15-block: exit 2 + BLOCKED + (derived) — PASS
AC15-pass: exit 0 for owning session — PASS
AC12 (task4.2): PASS (that implementation is already present in the branch)
AC13 (task5.1): FAIL — out of scope, pre-existing pending task

## Modified Files

- `hooks/kaola-workflow-pre-commit.sh` — replaced env-var comparison block with kernel-derived session ID logic
- `scripts/simulate-workflow-walkthrough.js` — added test block `// 8N-task4.1` with AC15-block and AC15-pass assertions

## Deviations from Spec

1. Did NOT pass `HOOK_INPUT` via env — the hook reads `HOOK_INPUT="$(cat)"` (stdin), overwriting any env value. Instead used git-staged files (same approach as Epic Case 10) so the hook reads staged files via `git diff --cached`.

2. Did NOT pass `GIT_DIR` env — used `cwd: ac15Tmp` matching Epic Case 10's pattern, which is compatible with `git rev-parse --show-toplevel`.

3. Added `(derived)` marker assertion as the discriminating RED test — without it, the test would pass on both old and new code (both exit 2 for wrong session), making TDD meaningless.

## Commands Run

- `node scripts/simulate-workflow-walkthrough.js` — RED verification (fails at AC15)
- Edit hook file
- `node scripts/simulate-workflow-walkthrough.js` — GREEN verification (AC15 passes, fails at AC13 which is task5.1)
