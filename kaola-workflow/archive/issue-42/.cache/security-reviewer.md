# Security Review: issue-42

## Reviewed Files
- scripts/kaola-workflow-sink-merge.js (classifyMergeError, postMergeCleanup)
- scripts/kaola-workflow-claim.js (cmdSinkFallback, buildSinkBlock, isSafeName)
- scripts/simulate-workflow-walkthrough.js (Epic Case 18A)

## CRITICAL
None.

## HIGH

**1. KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE has no production guard (sink-merge.js:9, 40, 144)**
- If set in production, push is silently bypassed without any warning. Script writes receipt and exits 3 without attempting push.
- Fix applied: added stderr warning in FORCE branch of classifyMergeError.

## MEDIUM

**2. receipt.reason written to markdown without allowlist (claim.js:2786, 2790, buildSinkBlock:723)**
- Crafted reason value (with newlines) could inject content into workflow-state.md Sink block.
- Sources: env var (operator-controlled) and TOCTOU window between write and read of receipt file.
- Fix applied: assert(_VALID_REASONS.includes(receipt.reason)) before use.

**3. Divergent isSafeName — sink-merge.js copy permits \\n\\r\\t (sink-merge.js:13-17 vs claim.js:16-22)**
- Path traversal blocked in both. Concern: newline injection into JSON receipt.
- Deferred: exporting from claim.js and importing in sink-merge.js is non-trivial.

## LOW

**4. git checkout missing -- separator (sink-merge.js multiple sites)**
- args guard prevents flag injection. -- is defense-in-depth.
- Deferred.

**5. KAOLA_WORKFLOW_DEBUG_CWD unguarded write at exit (sink-merge.js:207-211)**
- Writes process.cwd() to env-var-controlled path. Content is CWD string, limited impact.
- Deferred.

**6. git reset --hard origin/main assumption undocumented (sink-merge.js:158)**
- Assumes local main has no unpushed commits. Valid in normal workflow use.
- Deferred: add comment.

## No Issues Found
- No hardcoded secrets or credentials
- Subprocess invocation in tests uses array form (no shell injection)
- isSafeName blocks path traversal for args.project in both copies
