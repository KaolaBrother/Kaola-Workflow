# Planner: issue-47 — Bootstrap auto-pick removal

## Approaches Evaluated

### Option A: Mirror `cmdStartup` explicit-target pattern (RECOMMENDED)

**Summary:** Remove `runBootstrapClaimFirstAvailable`, add `--target-issue` guard to `cmdBootstrap`, call `claimExplicitTarget` directly — exactly mirroring how `cmdStartup` was rewritten for issue-44.

**Pros:**
- Proven pattern: issue-44 already established the exact guard + `claimExplicitTarget` call sequence; copy-paste and rename
- Minimal diff: ~30 lines changed in `cmdBootstrap`, ~10 lines deleted (`runBootstrapClaimFirstAvailable`)
- All existing infrastructure stays: `runBootstrapClaim`, `runBootstrapSweep`, `runBootstrapWatchPr`, `ownedActiveProject` check are preserved
- Stdout-only: bootstrap never calls `writeStartupReceipt`, so the new path correctly emits JSON-only (no side-effect file write)
- Clear failure modes: `no_target` (no --target-issue), `target_occupied`, `target_unavailable`, `user_target_blocked`, `user_target_red`, `acquired`

**Cons:**
- Bootstrap and startup diverge slightly: startup writes a receipt file; bootstrap emits stdout-only. This divergence already exists and is correct by design (bootstrap is a lightweight re-entry point, not a session initializer)

**Risk:** Low — mirrors an already-tested pattern

**Complexity:** Small

### Option B: Delegate bootstrap to startup internally

**Summary:** Have `cmdBootstrap` call `cmdStartup` (or the startup logic) internally to reuse the full startup path including the receipt write.

**Why rejected:**
- `cmdBootstrap` is stdout-only JSON; `cmdStartup` calls `writeStartupReceipt` which creates a session file under `kaola-workflow/.sessions/`. Mixing them would change `verify-startup` semantics — bootstrap callers would now produce startup receipts they don't expect.
- Bootstrap's contract is lighter-weight than startup. Callers use bootstrap for re-entry without re-issuing a full startup transaction.
- Adding receipt writes to bootstrap is a scope expansion beyond this bug fix.

**Risk:** Medium (behavior change beyond fix scope)

### Option C: Remove bootstrap subcommand entirely

**Summary:** Delete `cmdBootstrap` and `runBootstrapClaimFirstAvailable` and update docs to say "use startup instead."

**Why rejected:**
- Bootstrap appears in CLAUDE.md and README as a documented contract
- Codex and other runtimes may depend on the `bootstrap` subcommand name
- Too invasive for a targeted bug fix; issue-44 preserved bootstrap and only changed startup

**Risk:** High (breaking change)

---

## Recommended Implementation Plan (Option A)

### Step 1: `scripts/kaola-workflow-claim.js`

**Delete `runBootstrapClaimFirstAvailable` (L1223–1232):**
Remove the entire function.

**Rewrite `cmdBootstrap` (L1234–1262):**

Keep:
- `const args = parseArgs(process.argv.slice(3))` — already parses `--target-issue`
- `if (ownedActiveProject(...)) { emit resume JSON, return }` — resume path unchanged
- `runBootstrapSweep(...)` and `runBootstrapWatchPr(...)` calls — background housekeeping preserved

Add at top (after `ownedActiveProject` check and before sweep calls):
```javascript
if (!args.targetIssue) {
  process.stderr.write('bootstrap: --target-issue <N> is required\n');
  process.stdout.write(JSON.stringify({ verdict: 'no_target', claim: 'none', session: args.session }) + '\n');
  process.exit(1);
}
```

Replace the `runBootstrapClaimFirstAvailable` call with:
```javascript
const result = claimExplicitTarget(claimScript, classifierScript, args, args.targetIssue, coordRoot, root);
if (result.status !== 'acquired') {
  process.stdout.write(JSON.stringify({ verdict: result.status, claim: 'none', issue: result.issue, project: result.project, session: args.session, reasoning: result.reasoning }) + '\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ verdict: 'acquired', claim: 'acquired', target_source: 'user_directed', issue: result.issue, project: result.project, session: args.session }) + '\n');
```

**Note:** `runBootstrapClaim` (L1205) must be KEPT — it is called inside `claimExplicitTarget` and is unrelated to the auto-pick removal.

### Step 2: Plugin mirror

Mirror all changes byte-for-byte to:
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

Run `node scripts/validate-script-sync.js` to confirm.

### Step 3: Tests — `scripts/simulate-workflow-walkthrough.js`

**Replace tests 6G, 8I-a, 8I-b, 12D, 13A, 13B in-place with explicit-target versions.**
**Keep 8I-owned unchanged** — the owned-project resume path is independent of auto-pick.
**Add 8I-c** — new no-target bootstrap test.

Test shapes (model on Epic 14A–14E at L3271):

- **6G-new**: `bootstrap --target-issue <N>` on a valid issue → `claim: 'acquired'`, `target_source: 'user_directed'`
- **8I-a-new**: `bootstrap --target-issue 11` → `claim: 'acquired'`, `issue: 11`
- **8I-c** (new): `bootstrap` with NO `--target-issue` → exit 1, `verdict: 'no_target'`, `claim: 'none'`
- **8I-b-new**: `bootstrap --target-issue 11` when 11 is already locked → exit 1, `verdict: 'target_occupied'`, `claim: 'none'`
- **12D-new**: `bootstrap --target-issue <freeIssue>` → `claim: 'acquired'`
- **13A-new**: Two parallel bootstrap calls for same `--target-issue` → one gets `acquired`, one gets `target_occupied`
- **13B-new**: Two parallel bootstrap calls for distinct issues `--target-issue 911` and `--target-issue 912` → both get `acquired`

Mirror all test changes to `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`.

### Step 4: Validators

**`scripts/validate-workflow-contracts.js` L226:**
Replace:
```javascript
assertIncludes('scripts/kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable')
```
With:
```javascript
assertIncludes('scripts/kaola-workflow-claim.js', 'no_target')
```
(Asserts the new no-target contract exists)

**`scripts/validate-kaola-workflow-contracts.js` L182:**
Replace:
```javascript
assertIncludes('.../kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable')
```
With:
```javascript
assertIncludes('.../kaola-workflow-claim.js', 'no_target')
```

**Pre-existing bugs to fix in `validate-kaola-workflow-contracts.js`:**
- L193: assertion `'real parallel bootstrap coordination and claim-race retry'` → change to match actual text `'true parallel bootstrap coordination'`
- L194: assertion `'startup transaction syncs issue roadmap'` → change to match actual text `'startup transaction syncs issues, writes a receipt'`

(These are pre-existing failures unrelated to issue-47, but fixing them is in scope per Phase 1 notes.)

### Step 5: README.md

- L308: Update feature table — remove auto-scan bootstrap description; replace with "bootstrap requires explicit `--target-issue N`"
- L520: Replace `bootstrap continues scanning the open issue list and claims the next green/yellow issue automatically` with explicit-target description

### Step 6: CHANGELOG.md

Add under [Unreleased]:
```
### Changed
- `bootstrap` subcommand now requires explicit `--target-issue N`, matching the issue-44 contract for `startup`. The `runBootstrapClaimFirstAvailable` auto-picker is removed.
```

### Step 7: CLAUDE.md

Add `bootstrap` to the explicit-target enforcement section alongside `startup`.

---

## Explicit Not-To-Build

- Do NOT add `writeStartupReceipt` to bootstrap (out of scope; changes bootstrap semantics)
- Do NOT remove `runBootstrapClaim` (still used by `claimExplicitTarget`)
- Do NOT remove `runBootstrapSweep` or `runBootstrapWatchPr` (background housekeeping preserved)
- Do NOT change the `ownedActiveProject` resume path
- Do NOT change pick-next or startup (already fixed by issue-44)
- Do NOT introduce new external dependencies

---

## Missing Facts

None — Phase 1 research is complete at 10/10 and all required code locations are identified with line numbers.
