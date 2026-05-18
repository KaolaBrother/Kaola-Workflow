# Advisor — Phase 3 Plan Gate: issue-81

## Verdict
PASSED — Proceed to Phase 4. No architect revision needed.

## Findings

### Build sequence: correct
A→B serial because T2 would false-green against pre-fix code. C-F parallel because file write sets are disjoint. Shape parity bug threaded correctly into Task A.

### Implementation details to capture in phase3-plan.md

1. **`worktree_path` placement in base object literal (NOT after Object.assign)**:
   - `acquired` case: `result.worktree_path` overrides base — same value, fine.
   - `owned` case: `result` has no top-level `worktree_path` (nested in `folder`) — base value persists. ✓
   - Failure cases: no `worktree_path` in result — base empty string persists. ✓
   If placed after Object.assign, `owned` case would work but `acquired` result would override with its own value (fine, same result). But the constraint is that it must be in the base to survive when result doesn't have it.

2. **Tests T1/T2/T3 must use `runNode` (line 20), not `runClaimOnline`**. The latter throws on exit ≠ 0. T4 can use `runClaimOnline` because it expects success.

3. **Doc rewrites (C/D/E/F) must include a bash one-liner**, not just prose intent. Exact pattern for Phase 4:
   ```bash
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
   Without this, the four files may diverge in phrasing.

### Scope check (non-blocking)
`CLAUDE.md` lines 21-22 are correct as-is. Consider adding one-line affirmation: "Sole-active resume is agent-driven: derive the issue number from `node CLAIM_JS status` before calling startup." This prevents future readers from re-introducing the carve-out. Record as Phase 6 doc-updater consideration if not added now.

### Cosmetic
Architect table heading "Phase 2 Entry Conditions Resolution" should read "Phase 3 Entry Conditions" — fix in phase3-plan.md. Content is correct.
