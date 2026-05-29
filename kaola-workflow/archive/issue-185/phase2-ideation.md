# Phase 2 - Ideation: issue-185

## Approaches Evaluated

### Option A: Inline `Math.min(n, 600000)` clamp — SELECTED
- Summary: Keep the existing guard; wrap the success branch in `Math.min` against the 600000ms cap. Over-cap values clamp to the bound; in-range values pass through unchanged.
- Pros: Satisfies spec verb "clamp"; matches archived #178 prior art; smallest diff; byte-sync pairs trivially kept identical; mid-range valid values (e.g. 500001ms) unaffected
- Cons: `600000` literal repeated 6× with no inline explanation
- Risk: Low
- Complexity: Small
- Architectural fit: Strongest — extends, doesn't restructure; honors silent-fallback and no-named-constant conventions

### Option B: Named constant + `Math.min`
- Summary: Same clamp semantics as A, but cap extracted to `MAX_REMOTE_TIMEOUT_MS = 600000`
- Pros: Self-documenting constant
- Cons: Contradicts "no named constant" prior art; enlarges byte-equality surface for no behavioral gain; introduces a new convention on a one-line fix
- Risk: Low
- Complexity: Small
- Architectural fit: Weaker

### Option C: Condition tightening `n <= 600000` — REJECTED
- Summary: Add `&& n <= 600000` to the guard; over-cap values fall back to 30000
- Cons: Reset-to-default, not clamp — violates spec. Penalizes legitimately-large values (700000ms → 30000 instead of 600000). Critically: the prescribed success-shim test **cannot distinguish C from A** and passes while being wrong.
- Risk: Medium (silent spec violation)
- Complexity: Small
- Architectural fit: Poor

## Advisor Findings
Option A confirmed correct. Key execution guards added to Phase 3 plan:
1. Use an **immediate-success mock** (not a hang shim) — post-fix timeout is 600000ms; a hanging mock would exceed the 60000ms harness `spawnSync` cap.
2. **Verify RED pre-fix** before claiming the new test is a regression guard — run the test against unfixed code first.
3. **Byte-identity is a separate gate**: run `node scripts/validate-script-sync.js` explicitly (the walkthrough doesn't call it).
4. **Grep to confirm exactly 6 sites**: `grep -rn KAOLA_GH_REMOTE_TIMEOUT_MS` before editing.
5. **For gitlab/gitea**: verify the forge exec wrapper passes the timeout through so RED→GREEN holds in forge suites.

## Selected Approach
**Option A — Inline `Math.min(n, 600000)` clamp**

Rationale: only candidate satisfying the spec verb "clamp"; reproduces #178 prior art expression exactly; minimal diff across 6 sites; leaves all existing hang tests and mid-range valid values undisturbed. The ERR_OUT_OF_RANGE verification (confirmed via Node shell test) makes the new test a true RED→GREEN regression guard post-fix.

Fix expression per site:
```js
// Before (all 6 sites):
return Number.isInteger(n) && n > 0 ? n : 30000;

// After (all 6 sites):
return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
```

## Out of Scope (explicit)
- No `console.warn`, no throw, no log (silent fallback is established)
- No named constant for the cap — `600000` inline
- No env var to configure the cap
- No refactor of IIFEs into a shared helper (byte-identity contract)
- No changes to NaN/zero/negative handling (#184 owns those)
- No `Number.isInteger` → `Number.isFinite` swap
- No changes outside these 6 sites + 3 test files

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
