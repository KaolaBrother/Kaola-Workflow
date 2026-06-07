non_tdd_reason: hardening pass — three surgical fixes with RED→GREEN TDD per fix; all
regression-green: npm test exit 0 across all 4 editions (claude/codex/gitlab/gitea)

# harden node evidence — issue-291

## Fixes applied

### R1: runSealMember idempotency guard (parallel-batch.js ~line 440)
Added an early-return after the `if (!member)` check in `runSealMember`:
```js
if (member.sealed) {
  return { result: 'ok', sealed: nodeId, state: manifest.state, alreadySealed: true };
}
```
This prevents `sealOne` (and its `appendComplianceRow`) from running a second time when the member is already sealed. `runSeal` already had this guard; `runSealMember` was the gap.

### R2: runOpenBatch BASELINES-FIRST atomicity (parallel-batch.js ~line 300)
Reordered `runOpenBatch` to record ALL N baselines via `commit-node --start` BEFORE the ledger-flip loop and BEFORE `writeFile(planPath, ...)`. On any baseline failure, returns `{result:'refuse', reason:'baseline_failed'}` having made ZERO plan/ledger mutation — no orphan possible. Honest scope: the plan-write→manifest-write gap remains (two files, not atomically writable); still fails closed.

### R4: Partial-seal subset predicate at TWO coordinated sites
Both sites now compare `in_progress` rows against ONLY the UNSEALED manifest members (`.filter(m => !m.sealed)`), not all members.
- Site (a) `crossCheckStatus` in parallel-batch.js (~line 215)
- Site (b) `runOrient` AC#5 gate in adaptive-node.js (~line 399)
Comment added at each: `// R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.`
Existing orphan tests P6c/T20b/T20d remain correct: their manifest members are all unsealed, so the filter is a no-op for them.

## Byte-identity confirmation
Both PROD pairs edited identically via cp after scripts/ was final:
- scripts/kaola-workflow-parallel-batch.js → plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js
- scripts/kaola-workflow-adaptive-node.js  → plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js

`node scripts/validate-script-sync.js` output: `OK: 18 common scripts and 7 byte-identical file group in sync.`

## RED

Tests written first (before any fix), run to verify they fail for the right reason:

```
FAIL: R1: alreadySealed===true on repeat call
FAIL: R1: exactly ONE compliance row for v1 after double-seal, found 2
FAIL: R2: v1 still pending (no orphan flip when baseline fails)
FAIL: R2: v2 still pending (no orphan flip when baseline fails)
FAIL: R4a: partial-seal manifest with in_progress=unsealed-members → valid (not orphan)
FAIL: R4a: partial-seal must NOT be flagged orphan_member_set_mismatch
parallel-batch tests FAILED (6 failures, 80 passed)

FAIL: R4b: partial-seal (a=sealed, b+c in_progress) → result ok (NOT orphan_multi_in_progress)
FAIL: R4b: batch object present (valid partial-seal batch)
adaptive-node tests FAILED (2 failures, 136 passed)
```

All 8 new assertions failed for the correct reasons (implementation not yet changed).

## GREEN

After implementing all 3 fixes:

```
parallel-batch tests passed (86 assertions)
adaptive-node tests passed (138 assertions)
```

All 3 fix validations pass. Existing tests P6c/T20b/T20d confirmed still correct (unsealed filter is no-op for fully-unsealed members).

## npm test final status

Full suite (all 4 editions) — exit code 0:

```
OK: 18 common scripts and 7 byte-identical file group in sync.
Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
...
adaptive-node tests passed (138 assertions)
parallel-batch tests passed (86 assertions)
...
Workflow walkthrough simulation passed

Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed

Kaola-Workflow GitLab contract validation passed
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed

Kaola-Workflow Gitea contract validation passed
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```

`node scripts/simulate-workflow-walkthrough.js` — exit 0: `Workflow walkthrough simulation passed`
