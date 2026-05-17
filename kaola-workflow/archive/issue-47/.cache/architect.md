# Code Architect: issue-47 — Bootstrap auto-pick removal

## Design Decisions

- Delete `runBootstrapClaimFirstAvailable` (L1223–1232): the only auto-pick path in `cmdBootstrap`. Its removal is the central contract change.
- Rewrite `cmdBootstrap` to mirror `cmdStartup`'s no-target guard (L1405–1424) and explicit-target claim path (L1427–1475), but without writing a startup receipt (bootstrap predates the receipt system and callers don't consume one).
- No offline guard in `cmdBootstrap`: `classifyIssueCandidate` catches all spawn failures and returns `verdict: 'skipped'`, making `claimExplicitTarget` return `target_unavailable`. This is the same behavior `cmdStartup` exhibits offline; no deviation from the mirror.
- Stderr string: `'bootstrap: --target-issue <N> is required; agent must select an issue explicitly\n'`. The substring `'bootstrap: --target-issue <N> is required'` satisfies both validator `assertIncludes` calls.
- JSON stdout always includes `{project, issue, verdict, claim, session}`. For the `no_target` case, `project: null, issue: null`. For acquired: `claim: 'acquired', target_source: 'user_directed'`. For non-acquired: `claim: 'none', verdict: result.status`.
- Test 8I-a/8I-b become explicit-target tests with `--target-issue`. 8I-owned remains unchanged (still tests the resume path which has no `targetIssue` argument). 8I-c is new: no `--target-issue` arg, expects exit 1 and `verdict: 'no_target'`.
- 13A/13B are rewritten from auto-pick tests to explicit-target tests.
  - 13A: Pre-lock 901, call bootstrap with `--target-issue 901` → exit 1 `target_occupied`; then call bootstrap with `--target-issue 902` → exit 0 `acquired`. Comment: `// 13A: real parallel bootstrap coordination and claim-race retry — bootstrap --target-issue 902 against pre-locked 901 returns target_occupied`
  - 13B: Two parallel bootstraps each with their own different `--target-issue`. Comment: `// 13B: parallel explicit-target bootstrap splits across independent issues`. Both acquired.
- `validate-kaola-workflow-contracts.js` L193 assertion stays `'real parallel bootstrap coordination and claim-race retry'` (new 13A comment contains this); L194 changes to `'parallel explicit-target bootstrap splits across independent issues'` (new 13B comment).
- Both simulate scripts must receive byte-identical changes for tests 6G, 8I-a/b/c, 12D, 13A, 13B.
- `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` must be byte-identical.

## Files to Create

None.

## Files to Modify

| File | Purpose |
|------|---------|
| `scripts/kaola-workflow-claim.js` | Delete `runBootstrapClaimFirstAvailable`; rewrite `cmdBootstrap` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror |
| `scripts/simulate-workflow-walkthrough.js` | Rewrite tests 6G, 8I-a/b/c, 12D, 13A, 13B |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | Byte-identical mirror of simulate changes |
| `scripts/validate-workflow-contracts.js` | Replace L226 assertion |
| `scripts/validate-kaola-workflow-contracts.js` | Replace L182 assertion; update L193/L194 |
| `README.md` | Update L308 feature table entry; replace L520 auto-scan description |
| `CHANGELOG.md` | Add entry under [Unreleased] |
| `CLAUDE.md` | Add `bootstrap` to explicit-target enforcement section |

## Build Sequence

1. Modify `scripts/kaola-workflow-claim.js` — delete `runBootstrapClaimFirstAvailable`, rewrite `cmdBootstrap`
2. Copy byte-identical to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
3. Rewrite test blocks in `scripts/simulate-workflow-walkthrough.js`
4. Copy byte-identical to `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
5. Run `node scripts/simulate-workflow-walkthrough.js` — must exit 0
6. Run `node scripts/validate-script-sync.js` — must exit 0
7. Update `scripts/validate-workflow-contracts.js` L226
8. Update `scripts/validate-kaola-workflow-contracts.js` L182, L193, L194
9. Update `README.md`, `CHANGELOG.md`, `CLAUDE.md`

## Task List

### Task 1 — Delete `runBootstrapClaimFirstAvailable` and rewrite `cmdBootstrap`

- **File**: `scripts/kaola-workflow-claim.js`
- **Test File**: `scripts/simulate-workflow-walkthrough.js`
- **Write Set**: `scripts/kaola-workflow-claim.js`
- **Depends On**: none
- **Parallel Group**: A
- **Action**: MODIFY

**Implement**: Delete `runBootstrapClaimFirstAvailable` function (L1223–1232). Replace `cmdBootstrap` body (L1234–1262) with explicit-target implementation:

```javascript
function cmdBootstrap() {
  const args = parseArgs(process.argv.slice(3));
  args.session = currentSessionId(args);
  assertSafeSession(args.session, '--session/current platform session id');
  const root = getRoot();
  const coordRoot = getCoordRoot();
  if (process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') enforcePlatformSessionOrExit(args.session, coordRoot, args);
  runBootstrapSweep(__filename, root);
  runBootstrapWatchPr(__filename, root);
  const owned = ownedActiveProject(coordRoot, root, args.session);
  if (owned) {
    process.stdout.write(JSON.stringify({
      project: owned.project,
      issue: owned.issue_number,
      verdict: 'owned',
      claim: 'owned',
      session: args.session,
      resumed: true
    }) + '\n');
    return;
  }
  if (!args.targetIssue) {
    process.stdout.write(JSON.stringify({
      project: null,
      issue: null,
      verdict: 'no_target',
      claim: 'none',
      session: args.session
    }) + '\n');
    process.stderr.write('bootstrap: --target-issue <N> is required; agent must select an issue explicitly\n');
    process.exitCode = 1;
    return;
  }
  const classifierScript = path.join(path.dirname(__filename), 'kaola-workflow-classifier.js');
  const result = claimExplicitTarget(__filename, classifierScript, args, args.targetIssue, coordRoot, root);
  if (result.status !== 'acquired') {
    process.stdout.write(JSON.stringify({
      project: result.project || null,
      issue: result.issue || null,
      verdict: result.status,
      claim: 'none',
      session: args.session,
      reasoning: result.reasoning || ''
    }) + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify({
    project: result.project,
    issue: result.issue,
    verdict: result.verdict,
    claim: 'acquired',
    target_source: 'user_directed',
    session: args.session
  }) + '\n');
}
```

**Offline behavior**: No extra guard needed. `classifyIssueCandidate` catches all spawner failures and returns `verdict: 'skipped'`, so `claimExplicitTarget` returns `target_unavailable` offline. Mirrors `cmdStartup` exactly.

**Mirror**: `cmdStartup` no-target guard (L1405–1424); `claimExplicitTarget` call pattern (L1427–1475).

**Validate**: `node scripts/validate-script-sync.js` (after Task 2)

---

### Task 2 — Mirror claim script changes to plugin

- **File**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- **Write Set**: plugin claim script only
- **Depends On**: Task 1
- **Parallel Group**: A (sequential after Task 1)
- **Action**: MODIFY (byte-identical copy)

**Implement**: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

**Validate**: `node scripts/validate-script-sync.js`

---

### Task 3 — Rewrite test blocks in simulate script

- **File**: `scripts/simulate-workflow-walkthrough.js`
- **Write Set**: simulate script only
- **Depends On**: Task 1
- **Parallel Group**: B
- **Action**: MODIFY

**Implement** (6 sub-changes):

**6G (L1089–1134)**: Add `--target-issue 21` to bootstrap invocation. Simplify gh shim to only serve issue 21. Assert `r6G.claim === 'acquired'`, `r6G.target_source === 'user_directed'`, `r6G.issue === 21`, lock file for issue-21 exists.

**8I-a (L2086–2092)**: Add `--target-issue 11` to bootstrap invocation. Assert `out8i1.claim === 'acquired'`, `out8i1.issue === 11`, `out8i1.target_source === 'user_directed'`.

**8I-owned (L2094–2100)**: PRESERVE unchanged. (Owned-project resume path, no `--target-issue`.)

**8I-b (L2102–2113)**: Add `--target-issue 11` to fresh session bootstrap. Expect exit 1, `verdict: 'target_occupied'`, `claim: 'none'`. Remove assertions about claiming issue 12.

**8I-c (NEW)**: After 8I-b, add new test: bootstrap with no `--target-issue`. Fresh temp dir + gh shim. Expect exit 1, `verdict: 'no_target'`, `claim: 'none'`, `project: null`, `issue: null`.

**12D (L3002–3021)**: Add `--target-issue <freeIssue>` to bootstrap invocation. Assert `picked.claim === 'acquired'`, `picked.issue === freeIssue`.

**13A (L3086–3158)**: Replace with a true parallel race test. Comment: `// 13A: real parallel bootstrap coordination and claim-race retry — two bootstraps target issue 901 concurrently; one wins acquired, one gets target_occupied`. Spawn two child processes simultaneously, both with `--target-issue 901`. Wait for both to complete. Assert: exactly one exits 0 with `claim: 'acquired'`, exactly one exits 1 with `verdict: 'target_occupied'` and `claim: 'none'`. Assert `issue-901.lock` exists. Use `spawn()` + `waitExit()` pattern (same as existing 13B infrastructure).

**13B (L3160–3228)**: Replace with: Comment `// 13B: parallel explicit-target bootstrap splits across independent issues`. Two parallel bootstraps: `--target-issue 911` and `--target-issue 912`. Both expect `claim: 'acquired'`.

**Mirror**: Epic 14A–14E pattern (explicit-target startup tests).

**Validate**: `node scripts/simulate-workflow-walkthrough.js`

---

### Task 4 — Mirror simulate script changes to plugin

- **File**: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- **Depends On**: Task 3
- **Parallel Group**: B (sequential after Task 3)
- **Action**: MODIFY (byte-identical copy)

**Implement**: `cp scripts/simulate-workflow-walkthrough.js plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`

**Validate**: `node scripts/validate-script-sync.js`

---

### Task 5 — Update `validate-workflow-contracts.js`

- **File**: `scripts/validate-workflow-contracts.js`
- **Depends On**: Task 1
- **Parallel Group**: C
- **Action**: MODIFY

**Implement**: L226: Replace `assertIncludes('scripts/kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable');` with `assertIncludes('scripts/kaola-workflow-claim.js', 'bootstrap: --target-issue <N> is required');`

**Validate**: `node scripts/validate-workflow-contracts.js`

---

### Task 6 — Update `validate-kaola-workflow-contracts.js`

- **File**: `scripts/validate-kaola-workflow-contracts.js`
- **Depends On**: Tasks 1, 3
- **Parallel Group**: C (after Tasks 1 and 3)
- **Action**: MODIFY

**Implement**:
- L182: Replace `'function runBootstrapClaimFirstAvailable'` assertion with `'bootstrap: --target-issue <N> is required'`
- L193: Keep as-is (new 13A comment contains `'real parallel bootstrap coordination and claim-race retry'`)
- L194: Replace `'startup transaction syncs issue roadmap'` with `'parallel explicit-target bootstrap splits across independent issues'`

**Validate**: `node scripts/validate-kaola-workflow-contracts.js`

---

### Task 7 — Update docs

- **Files**: `README.md`, `CHANGELOG.md`, `CLAUDE.md`
- **Depends On**: Task 1
- **Parallel Group**: D
- **Action**: MODIFY

**Implement**:

README.md L308: Update feature table bootstrap entry to note `--target-issue N` required.

README.md L520: Replace `bootstrap continues scanning the open issue list and claims the next green/yellow issue automatically` with: `bootstrap requires explicit --target-issue N; the agent selects the issue before invoking bootstrap. Auto-scan removed.`

CHANGELOG.md [Unreleased]: `- feat: bootstrap now requires explicit --target-issue N; removed runBootstrapClaimFirstAvailable auto-pick (issue #47)`

CLAUDE.md: Add `cmdBootstrap` alongside `cmdStartup` and `cmdPickNext` in the explicit-target enforcement section.

**Validate**: Visual inspection.

## Owned + Mismatched Target Behavior

If a session owns project X and runs `bootstrap --target-issue Y` (Y ≠ X), the `ownedActiveProject` check fires first and returns the resume JSON for X, ignoring Y. This is intentional — resume takes priority. No code change needed; document as intended behavior.

## Explicit Out-of-Scope Items

- Pre-existing `validate-workflow-contracts.js` failures unrelated to issue-47
- `cmdPickNext` — already explicit-target; no changes
- `cmdStartup` — already explicit-target; no changes
- Dispatcher line L2773 — unchanged
- `claimExplicitTarget` (L1285–1308) — unchanged
- `runBootstrapClaim` (L1205–1221) — unchanged

## Offline Behavior Decision

No extra offline guard needed in `cmdBootstrap`. `classifyIssueCandidate` catches all spawn failures and returns `verdict: 'skipped'`, so `claimExplicitTarget` returns `target_unavailable` offline. This mirrors `cmdStartup`'s behavior exactly.
