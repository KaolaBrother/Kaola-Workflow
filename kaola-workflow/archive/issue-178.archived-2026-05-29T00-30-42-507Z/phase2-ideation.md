# Phase 2 - Ideation: issue-178

## Approaches Evaluated

### Option A: Default timeout at lowest-level exec wrapper + `skipped_timeout` sentinel
- Summary: Add `timeout: KAOLA_GH_REMOTE_TIMEOUT_MS || 30000` to the `Object.assign` in each edition's exec wrapper (`ghExec` ×2 for GitHub/Codex, `glabExec` for GL, `teaExec` for GT). Catch blocks detect `err.killed === true || err.signal === 'SIGTERM'` and return `'skipped_timeout'` sentinel (parallel to `'skipped_offline'`). Per-issue probes that time out surface in `unresolved_closed_state: [N, ...]` (omit-when-empty). Env var `KAOLA_GH_REMOTE_TIMEOUT_MS` allows test overrides.
- Pros: Single change point per edition; caller override still wins via `Object.assign` precedence; matches existing `claim.js:368` precedent exactly; `counts` block already handles non-array sentinels; no signature changes
- Cons: active-folders.js timeout also affects claim.js (intentional but must be noted); GL/GT depend on forge re-throw fidelity
- Risk: Low–Medium
- Complexity: Medium (8 script files + 3 test files; byte-identical sync pairs must be maintained)

### Option B: Per-call-site opts injection
- Summary: Pass `{ timeout: 30000 }` to each specific `ghExec(args, { timeout: N })` call in closure-audit.js only (lines 133, 180, 246), leaving active-folders.js untouched.
- Pros: Minimal blast radius; no side-effects on claim.js
- Cons: Doesn't cover `issueIsClosed` / `probeIssueState` path (O(N) calls in collectClosedSet); future call sites can forget; active-folders remains exposed
- Risk: Medium (coverage gap for the most common hang path)
- Complexity: Small

### Option C: Wrapper-level per-module env var
- Summary: Like Option A but use separate env vars per script (`KAOLA_CLOSURE_AUDIT_TIMEOUT_MS` in closure-audit.js, `KAOLA_ACTIVE_FOLDERS_TIMEOUT_MS` in active-folders.js)
- Pros: Narrower scope per variable
- Cons: Fragmented; doesn't acknowledge the cross-module dependency; adds noise
- Risk: Low
- Complexity: Small–Medium

## Advisor Findings
Option A is the right choice. Resolved items from advisor gate:
1. **Env var name**: Use `KAOLA_GH_REMOTE_TIMEOUT_MS` (not `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS`) across all four exec wrappers — honest about scope, affects claim.js (intentional improvement)
2. **Forge re-throw fidelity**: Must be verified by Phase 3 architect before writing GL/GT catches — if forge wraps `err`, propagate `.killed`/`.signal` explicitly
3. **`probeIssueState` export**: Phase 3 architect confirms export status and shape before committing to `collectClosedSet` rewrite
4. **`unresolved_closed_state`**: Omit-when-empty; present (non-empty array) in hang tests
5. **`labels_skipped_reason`**: Top-level on `repaired` object (not per-label)

## Selected Approach
**Option A** — default timeout at lowest-level exec wrapper.

Rationale: The O(N) `issueIsClosed` loop in `collectClosedSet` is the highest-frequency remote call; Option B leaves it exposed. The env-var affordance is necessary for test speed. Blast radius on claim.js is an improvement (claim.js already has a 30s timeout at line 368 for a different code path; this closes the gap for `readActiveFolders`).

## Out of Scope (explicit)
- git porcelain calls (isDirty, getRoot)
- refactoring ghExec into a shared cross-module utility (breaks byte-identical sync contract)
- changing OFFLINE semantics or `excludeClosedIssues` defaults
- retry logic (AC1 says timeout OR retry cap; pick timeout)
- other claim.js remote call sites outside active-folders flow
- Codex/skill markdown files
- Adding `KAOLA_GH_REMOTE_TIMEOUT_MS` to `.env.example` (test-only env var, not user-facing config)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
