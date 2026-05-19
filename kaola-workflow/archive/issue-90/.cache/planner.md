# Planner Output — Issue #90

## Recommendation: Option A — Append general regex to assertNoForbidden

Two-file, ~2-line surgical fix.

## Options

### Option A — Append `/\b[a-z]+glab\b/i` to existing `forbidden` array (RECOMMENDED)
- Pros: Smallest diff; reuses existing iteration; future-proofs against any `*glab` corruption
- Cons: Error message says "forbidden reference" (slightly imprecise)
- Risk: Low — regex verified safe against `glab` CLI, `glabExec`, JSON manifest files (not in validated set)
- Complexity: Small

### Option B — Dedicated `assertNoTermReplacementArtifacts` function with explicit list
- Pros: Self-documenting; precise error message
- Cons: More code; misses novel corruptions; heavier diff
- Risk: Low
- Complexity: Small-Medium

### Option C — Hybrid: new function with general regex + tailored message
- Pros: Best diagnostic clarity + coverage
- Cons: Diverges from existing pattern in file; overkill for one rule
- Risk: Low
- Complexity: Small

## Steps
1. Fix `code-architect.toml:12`: `small enouglab for` → `small enough for`
2. Add `/\b[a-z]+glab\b/i` after `/pull request/i` in `assertNoForbidden` forbidden array
3. `npm run test:kaola-workflow:gitlab` — expect pass
4. `node scripts/simulate-workflow-walkthrough.js` — expect pass

## Not to Build
- Do NOT extend GitHub validator
- Do NOT enumerate explicit typo list (general regex subsumes)
- Do NOT touch iteration at lines 114-116
- Do NOT create auto-fix script
