# Phase 3 - Plan: issue-47

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Delete `runBootstrapClaimFirstAvailable`; rewrite `cmdBootstrap` with explicit-target contract | Core change: remove auto-pick |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy from scripts/ | Mirror invariant |
| `scripts/simulate-workflow-walkthrough.js` | Rewrite tests 6G, 8I-a/b, 12D, 13A, 13B; add 8I-c | Tests must match new contract |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | Byte-identical copy from scripts/ | Mirror invariant |
| `scripts/validate-workflow-contracts.js` | Replace L226 assertion string | Validator must assert new contract |
| `scripts/validate-kaola-workflow-contracts.js` | Replace L182, update L194 | Same |
| `README.md` | Update bootstrap feature table + description | Doc accuracy |
| `CHANGELOG.md` | Add [Unreleased] entry | Change log |
| `CLAUDE.md` | Add cmdBootstrap to explicit-target section | Design principles |

### Build Sequence
1. Task 1 — Modify `scripts/kaola-workflow-claim.js` (no dependencies)
2. Task 2 — Copy claim script to plugin (depends on Task 1)
3. Task 3 — Rewrite test blocks in simulate script (depends on Task 1)
4. Task 4 — Copy simulate script to plugin (depends on Task 3)
5. Task 5 — Update `validate-workflow-contracts.js` (depends on Task 1)
6. Task 6 — Update `validate-kaola-workflow-contracts.js` (depends on Tasks 1 and 3)
7. Task 7 — Update docs (depends on Task 1)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1 | foundation; all others depend on it |
| B | 2, 3 | after Task 1; 2 and 3 touch disjoint files |
| C | 4, 5, 6, 7 | after Tasks 2/3; all touch disjoint files |

### External Dependencies
None.

## Task List

### Task 1: Delete `runBootstrapClaimFirstAvailable` and rewrite `cmdBootstrap`
- **File**: `scripts/kaola-workflow-claim.js`
- **Write Set**: `scripts/kaola-workflow-claim.js`
- **Depends On**: none
- **Parallel Group**: A
- **Action**: MODIFY

**Delete** `runBootstrapClaimFirstAvailable` function (L1223–1232 in current file). This is the only auto-pick path.

**Rewrite** `cmdBootstrap` body. The existing function starts around L1234. Replace the body entirely with:

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

**Notes:**
- `runBootstrapClaim` (L1205–1221) must NOT be deleted — it is called inside `claimExplicitTarget`.
- `claimExplicitTarget` signature (L1285): `(claimScript, classifierScript, args, targetIssue, coordRoot, root)` — first arg is `__filename`.
- Adding `claim: 'owned'` to the owned-path output is new. Safe: `receipt.claim` at L460/L463 reads startup receipts only; 8I-owned checks only `verdict: 'owned'`.
- Offline path: `classifyIssueCandidate` try/catch (L1164) catches spawn failures. `claimExplicitTarget` returns `target_unavailable` when classifier is absent or throws. No extra offline guard needed.
- Owned + mismatched target: if session owns X and caller passes `--target-issue Y`, the `ownedActiveProject` check fires first and returns resume JSON for X, ignoring Y. Intentional; no code change.

**Validate**: `node scripts/validate-script-sync.js` (after Task 2)

---

### Task 2: Mirror claim script to plugin
- **File**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- **Write Set**: plugin claim script only
- **Depends On**: Task 1
- **Parallel Group**: B
- **Action**: MODIFY (byte-identical copy)

```bash
cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
```

**Validate**: `node scripts/validate-script-sync.js`

---

### Task 3: Rewrite test blocks in simulate script
- **File**: `scripts/simulate-workflow-walkthrough.js`
- **Write Set**: simulate script only
- **Depends On**: Task 1
- **Parallel Group**: B
- **Action**: MODIFY

Seven sub-changes. Mirror the Epic 14A–14E explicit-target startup pattern.

#### 6G (L1089–1134)
Current: auto-picks free issue 21 (no `--target-issue`).
New: add `--target-issue 21` to bootstrap invocation. Simplify gh shim — remove issue 19 entries; only serve issue 21. Update assertions:
- `r6G.claim === 'acquired'`
- `r6G.target_source === 'user_directed'`
- `r6G.issue === 21`
- Lock file `issue-21.lock` exists

Remove assertion that issue-19 lock must not exist (no longer needed).

#### 8I-a
Current: `bootstrap --runtime codex` (no `--session`, no `--target-issue`) → auto-picks 11.
New: add `--target-issue 11`. Update assertions:
- `out8i1.claim === 'acquired'`
- `out8i1.issue === 11`
- `out8i1.target_source === 'user_directed'`

#### 8I-owned
**PRESERVE unchanged.** Owned-project resume path uses `--session <existing>`, no `--target-issue`. Still expects `verdict: 'owned'`, `issue: 11`.

#### 8I-b
Current: second bootstrap (no `--target-issue`) picks issue 12.
New: fresh session bootstrap with `--target-issue 11` (issue 11 is already locked). Expect:
- exit code 1
- `verdict: 'target_occupied'`
- `claim: 'none'`

Remove all assertions about claiming issue 12 or generating a second session for 12.

#### 8I-c (NEW — insert after 8I-b)
New test in a fresh temp dir. Bootstrap with no `--target-issue`. Expect:
- exit code 1
- `verdict: 'no_target'`
- `claim: 'none'`
- `project: null`
- `issue: null`
- stderr contains `'bootstrap: --target-issue <N> is required'`

Gh shim can be minimal (just serve a valid gh repo view response).

#### 12D
Current: `bootstrap --session <sess> --runtime codex` (no `--target-issue`) → auto-picks `freeIssue`.
New: add `--target-issue <freeIssue>` to the invocation. Update assertions:
- `picked.claim === 'acquired'`
- `picked.issue === freeIssue`

#### 13A (true parallel race)
Current: sequential — pre-lock 901 via gh shim, then one bootstrap call.
New comment: `// 13A: real parallel bootstrap coordination and claim-race retry — two bootstraps target issue 901 concurrently; one wins acquired, one gets target_occupied`

Replace test body:
1. Set up temp dir + git init + locks dir
2. Gh shim serves issue 901 (and optionally 902) — no lock injection in shim; `runBootstrapClaim` handles the race atomically
3. Spawn two child processes concurrently, both: `bootstrap --target-issue 901 --session sess-race-a/b --runtime codex`
4. Use existing `spawn()` + `waitExit()` pattern
5. Wait for both to complete
6. Assert:
   - Exactly one process exited 0 with `claim: 'acquired'` and `issue: 901`
   - Exactly one process exited 1 with `verdict: 'target_occupied'` and `claim: 'none'`
   - `issue-901.lock` exists

#### 13B (parallel explicit-target)
Current: two parallel bootstraps (no `--target-issue`) auto-split across 911/912.
New comment: `// 13B: parallel explicit-target bootstrap splits across independent issues`

Replace with:
1. Set up temp dir + git init + locks dir
2. Gh shim serves issues 911 and 912
3. Spawn two child processes concurrently:
   - Process A: `bootstrap --target-issue 911 --session sess-parallel-a --runtime codex`
   - Process B: `bootstrap --target-issue 912 --session sess-parallel-b --runtime codex`
4. Both must exit 0
5. Assert:
   - Both have `claim: 'acquired'`
   - A has `issue: 911`, B has `issue: 912`
   - Both `issue-911.lock` and `issue-912.lock` exist

**Validate**: `node scripts/simulate-workflow-walkthrough.js`

---

### Task 4: Mirror simulate script to plugin
- **File**: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- **Depends On**: Task 3
- **Parallel Group**: C
- **Action**: MODIFY (byte-identical copy)

```bash
cp scripts/simulate-workflow-walkthrough.js plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
```

**Validate**: `node scripts/validate-script-sync.js`

---

### Task 5: Update `validate-workflow-contracts.js`
- **File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `scripts/validate-workflow-contracts.js`
- **Depends On**: Task 1
- **Parallel Group**: C
- **Action**: MODIFY

L226: Replace:
```javascript
assertIncludes('scripts/kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable');
```
With:
```javascript
assertIncludes('scripts/kaola-workflow-claim.js', 'bootstrap: --target-issue <N> is required');
```

**Validate**: `node scripts/validate-workflow-contracts.js`

---

### Task 6: Update `validate-kaola-workflow-contracts.js`
- **File**: `scripts/validate-kaola-workflow-contracts.js`
- **Write Set**: `scripts/validate-kaola-workflow-contracts.js`
- **Depends On**: Tasks 1 and 3
- **Parallel Group**: C
- **Action**: MODIFY

**L182**: Replace:
```javascript
assertIncludes(..., 'function runBootstrapClaimFirstAvailable');
```
With:
```javascript
assertIncludes(..., 'bootstrap: --target-issue <N> is required');
```

**L193**: Keep as-is. The new 13A comment contains `'real parallel bootstrap coordination and claim-race retry'` so the assertion still holds.

**L194**: Replace the assertion string from `'startup transaction syncs issue roadmap'` with `'parallel explicit-target bootstrap splits across independent issues'` (matches new 13B comment).

**Validate**: `node scripts/validate-kaola-workflow-contracts.js`

---

### Task 7: Update docs
- **Files**: `README.md`, `CHANGELOG.md`, `CLAUDE.md`
- **Depends On**: Task 1
- **Parallel Group**: C
- **Action**: MODIFY

**README.md L308**: Update bootstrap feature table entry — note that `--target-issue N` is now required.

**README.md L520**: Replace:
> `bootstrap continues scanning the open issue list and claims the next green/yellow issue automatically`

With:
> `bootstrap requires explicit --target-issue N; the agent selects the issue before invoking bootstrap. Auto-scan removed.`

**CHANGELOG.md [Unreleased]**: Add:
```
- feat: bootstrap now requires explicit --target-issue N; removed runBootstrapClaimFirstAvailable auto-pick (issue #47)
```

**CLAUDE.md**: Add `cmdBootstrap` alongside `cmdStartup` and `cmdPickNext` in the explicit-target enforcement section. Pattern: scripts must not auto-select issues; agents pass `--target-issue N`.

**Validate**: Visual inspection.

---

## Advisor Notes

Phase 3 advisor gate found one blocker: 13A in the original architect blueprint was sequential (pre-lock then two sequential bootstrap calls), but the test comment claimed "parallel coordination and claim-race retry." This is a coverage regression that would also make the L193 validator assertion `'real parallel bootstrap coordination'` a lie.

**Fix applied**: 13A is now a true parallel race test — two child processes both with `--target-issue 901` spawned concurrently. One wins the lock atomically via `runBootstrapClaim`; one loses and returns `target_occupied`. This matches the L193 validator string truthfully.

Additional advisor items incorporated:
- Validator assertion strings use the full stderr message `'bootstrap: --target-issue <N> is required'` (not weak `'no_target'` substring)
- Stdout JSON always includes `{project, issue, verdict, claim, session}` with `null` for unknown fields in the `no_target` path
- Offline: no extra guard needed — `claimExplicitTarget` returns `target_unavailable` structurally when classifier is absent/throws
- L193/L194 validator assertions are chosen to match the NEW 13A/13B comment strings (fix in correct order)
- Owned + mismatched target: documented as intentional behavior; `ownedActiveProject` resume takes priority over `--target-issue`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect.md updated (13A fix, owned+mismatch note) | |
