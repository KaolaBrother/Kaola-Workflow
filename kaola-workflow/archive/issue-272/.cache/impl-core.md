# impl-core evidence — kaola-workflow-adaptive-node.js (issue #272)

## Node: impl-core
Role: tdd-guide

RED:

```
node scripts/test-adaptive-node.js
node:internal/modules/cjs/loader:1450
  throw err;
  ^

Error: Cannot find module './kaola-workflow-adaptive-node'
Require stack:
- /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-272/scripts/test-adaptive-node.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1447:15)
    ...
    code: 'MODULE_NOT_FOUND'
```

GREEN:

```
node scripts/test-adaptive-node.js
adaptive-node tests passed (104 assertions)
```

## Frozen-core scripts NOT modified

The following 5 scripts were NOT edited or mutated — only shelled (child_process) or
read-only required:

- scripts/kaola-workflow-next-action.js
- scripts/kaola-workflow-commit-node.js
- scripts/kaola-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-resolve-agent-model.js

`git status` confirms only 3 declared files changed:
- scripts/kaola-workflow-adaptive-node.js (NEW)
- scripts/test-adaptive-node.js (NEW)
- package.json (EDIT — test wired after test-adaptive-handoff.js)

## Post-advisor fixes (applied after GREEN)

Two issues surfaced by advisor review and corrected:

1. **spliceComplianceRow header format**: Changed `| Requirement | Attestation | Evidence | Timestamp |`
   to canonical `| Requirement | Status | Evidence | Skip Reason |` with proper `|-------------|...|`
   separator — matching the fixture in `validate-kaola-workflow-contracts.js` and the column
   layout expected by `complianceRows()` in `kaola-workflow-repair-state.js`.
   Verified: `delegationPolicyCompliance()` returns `{ok:true}` for both `tdd-guide (impl-core)`
   and bare `code-reviewer` rows with `subagent-invoked` status.

2. **runWriteHalt write order**: State write moved AFTER plan write to honour crash-safe order
   (plan ledger = durable marker; state regenerated from plan on crash recovery).
   Old: writeFile(state) → writeFile(plan).  New: writeFile(plan) → writeFile(state).

All 104 assertions still pass after both fixes. `npm test` exits 0 across all 4 editions.

## Test coverage (104 assertions across 19 test groups)

- T1-T5: spliceLedgerNode — all transitions (pending→in_progress, idempotent, out-of-allowFrom, in_progress→complete, not-found)
- T6: checkEvidenceShape — tdd-guide (missing GREEN, both present, n/a)
- T7: checkEvidenceShape — implementer (missing reason, missing token, all 3 change-type tokens, n/a)
- T8: checkEvidenceShape — other roles (present, null, empty)
- T9: runOrient — read-only (writeFile seam never called)
- T10: runOpenNext — first open (in_progress + baseline)
- T11: runOpenNext — allDone short-circuit
- T12: runOpenNext — --node-id not in ready set → refuse
- T13: runRecordEvidence — stdin → .cache verbatim
- T14: runCloseAndOpenNext — barrier exit0 + evidence → close + compliance + fused advance
- T14b: runCloseAndOpenNext — code-reviewer uses BARE role string in compliance row
- T15: runCloseAndOpenNext — barrier exit1 → refuse, no write
- T16: runCloseAndOpenNext — evidence_missing → refuse, no mutation
- T17: runCloseAndOpenNext — selector arms → n/a BEFORE fused advance
- T18: runWriteHalt — consent writes both markers; idempotent (single occurrence each)
- T19: shellNode seam — stub exiting 1 with canned JSON → {exitCode:1,...parsed}
