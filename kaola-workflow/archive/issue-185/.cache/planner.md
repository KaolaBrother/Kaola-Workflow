# Planner Output — issue-185: Cap KAOLA_GH_REMOTE_TIMEOUT_MS upper bound

## Context recap (verified against source)

All 6 sites currently share the identical validation expression:
```js
const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
return Number.isInteger(n) && n > 0 ? n : 30000;
```
- Sites 1–4 confirmed byte-identical (IIFE form, `scripts/` + `plugins/kaola-workflow/scripts/`). `validate-script-sync.js` enforces byte-equality on these — editing one of a pair without the other fails the sync gate.
- Sites 5–6 are forge-specific `remoteTimeoutMs()` functions (gitlab/gitea), NOT tracked by the sync validator — edit independently.
- The bug is real: `parseInt('999999999999999999999', 10)` → `1e21`; `Number.isInteger(1e21) === true`, so the guard passes and yields a ~31-year timeout, defeating the #178 hang protection.

## Approaches Evaluated

### Option A — Inline `Math.min(n, 600000)` (clamp) — RECOMMENDED

```js
return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
```

- Pros: Matches spec verb "clamp"; matches archived #178 prior art; smallest diff; keeps sync pairs byte-identical easily; mid-range valid values pass through
- Cons: `600000` bare literal repeated 6× (no inline note)
- Risk: Low | Complexity: Small | Architectural fit: Strongest

### Option B — Named constant + `Math.min`

```js
const MAX_REMOTE_TIMEOUT_MS = 600000;
return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_REMOTE_TIMEOUT_MS) : 30000;
```

- Pros: Self-documenting
- Cons: Contradicts "no named constant" prior art; enlarges byte-equality surface; introduces a new convention for a one-line fix
- Risk: Low | Complexity: Small | Architectural fit: Weaker

### Option C — Tighten condition (reject-to-default) — REJECTED

```js
return Number.isInteger(n) && n > 0 && n <= 600000 ? n : 30000;
```

- Cons: Reset-to-default, not clamp — spec violation. Penalizes valid large values (e.g. 700000ms → 30000). Phase 1 notes explicitly warn against this. The prescribed success-shim test **cannot** distinguish C from A, so it passes while being wrong.
- Risk: Medium (silent spec violation) | Complexity: Small | Architectural fit: Poor

## Recommended option: A — inline `Math.min(n, 600000)`

Rationale: only candidate satisfying the spec verb "clamp"; reproduces #178 prior art; minimal diff; leaves all existing hang tests (`'300'`) undisturbed.

Keep `Number.isInteger` as-is — do NOT switch to `Number.isFinite`. `parseInt` never yields `Infinity`, so the integer check is sufficient.

## Implementation surface

1. Edit Sites 1 + 3 identically (active-folders IIFE, lines 9–12)
2. Edit Sites 2 + 4 identically (closure-audit IIFE, lines 42–45)
3. Edit Site 5 (`kaola-gitlab-forge.js:10-13`) independently
4. Edit Site 6 (`kaola-gitea-forge.js:12-15`) independently
5. Add one over-cap test fn to each of the 3 suites, passing `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }` with a success-returning shim, asserting `closed_remote` routing
6. Register the new test fn in each runner (not just define it)

## Verification gates

- `node scripts/validate-script-sync.js` → must print OK
- `node scripts/simulate-workflow-walkthrough.js` → exit 0
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → green
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → green

## Missing fact — RESOLVED

**Question**: Does `execFileSync(..., { timeout: 1e21 })` throw `ERR_OUT_OF_RANGE`?
**Answer**: YES — confirmed by running:
```
node -e "const {execFileSync}=require('child_process'); try{execFileSync(process.execPath,['-e','0'],{timeout:1e21});console.log('accepted')}catch(e){console.log('threw',e.code)}"
# output: threw ERR_OUT_OF_RANGE
```
**Implication**: Pre-fix, the audit throws ERR_OUT_OF_RANGE on the first remote call → exits non-zero (test RED). Post-fix, `Math.min(1e21, 600000) = 600000`, bounded timeout → success shim routes `closed_remote` (test GREEN). The new test is a true RED→GREEN regression guard.

## Explicit items NOT to build

- No `console.warn`, no throw, no log — silent fallback is established
- No named constant for the cap — keep `600000` inline
- No env var to configure the cap; 600000 is fixed
- Do NOT refactor IIFEs into a shared helper (byte-identity contract)
- Do NOT touch NaN/zero/negative handling (#184 owns lower-bound cases)
- Do NOT change the 30000 default or switch `Number.isInteger` → `Number.isFinite`
- Do NOT add the cap outside these 6 sites
