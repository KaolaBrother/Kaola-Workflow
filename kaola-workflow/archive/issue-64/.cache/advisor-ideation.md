# Advisor — Issue #64 Ideation

## Verdict

Option B is the right call — the sync-validator constraint is decisive and was correctly identified. Don't pivot.

## Verifications performed

- `grep -n "require" scripts/kaola-workflow-sink-merge.js | head` →
  `5:const { getCoordRoot, removeWorktree } = require('./kaola-workflow-claim.js');`
  → precedent confirmed.
- `head -50 scripts/validate-script-sync.js` → `COMMON_SCRIPTS` allowlist
  confirmed; both `kaola-workflow-claim.js` and `kaola-workflow-classifier.js`
  are on it. Simulator NOT on the list (good — no plugin sync needed there).

## Two additions to fold into the strategy

### 1. Per-call memo for `isIssueClosed` inside `readActiveFolders`

Classifier overlap scans N active folders → today each closed-check is a fresh
`gh issue view`. A 5-line `Map<number, boolean>` cache scoped to a single
`readActiveFolders` call costs nothing and avoids N duplicate round-trips.
Trivial to add now, awkward to retrofit. The planner flagged it as "deferred"
— do not defer; it's free.

### 2. Explicit test-scenario inventory

Phase 2 must list these by name so Phase 3 builds a write set:

- folder-based overlap (red exact-path, yellow shared-infra) — replaces
  existing lock-planting cases.
- closed-issue residue ignored (active folder + closed GH issue → not in
  overlap, not picked by startup).
- lock-without-folder ignored (lock file present, no folder → no overlap
  contribution).
- `status: released` folder excluded.

### 3. Sync step must run per-caller-migration, not once at the end

Planner's migration order ("classifier first, then claim.js") is sequential
within Phase 4. The sync-to-plugin-tree + `node scripts/validate-script-sync.js`
step must run **after each caller migration**, not just at the end —
otherwise an intermediate commit fails the validator. Phase 3's task ordering
must make this explicit.

## Final recommendation

Ship Option B. Apply the three additions above. Write `phase2-ideation.md`,
route to Phase 3.
