# closure-invariants node evidence (M2 — #277 Phase 2)

Node: closure-invariants (add two closure attestation invariant definitions)
Write set: 4 byte-identical copies of `kaola-workflow-closure-contract.js`

---

## RED

Repro run BEFORE any edits, against the unmodified file.
Command: `node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/closure-inv-repro.js`

```
--- closure-invariants repro ---
  FAIL: CLOSURE_INVARIANTS has claim-planner-attested
  FAIL: CLOSURE_INVARIANTS has finalize-contractor-attested
  FAIL: CLOSURE_RECEIPT_FIELDS.claim_planner_attested is array
  FAIL: CLOSURE_RECEIPT_FIELDS.claim_planner_attested includes attested/missing/failed
  FAIL: CLOSURE_RECEIPT_FIELDS.finalize_contractor_attested is array
  FAIL: CLOSURE_RECEIPT_FIELDS.finalize_contractor_attested includes attested/missing/failed
  FAIL: emptyReceipt().claim_planner_attested === 'failed'
  FAIL: emptyReceipt().finalize_contractor_attested === 'failed'

Results: 0 passed, 8 failed
STATUS: FAIL
exit: 1
```

---

## GREEN

Repro run AFTER edits to all four byte-identical copies.
Command: `node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/closure-inv-repro.js`

```
--- closure-invariants repro ---
  PASS: CLOSURE_INVARIANTS has claim-planner-attested
  PASS: CLOSURE_INVARIANTS has finalize-contractor-attested
  PASS: CLOSURE_RECEIPT_FIELDS.claim_planner_attested is array
  PASS: CLOSURE_RECEIPT_FIELDS.claim_planner_attested includes attested/missing/failed
  PASS: CLOSURE_RECEIPT_FIELDS.finalize_contractor_attested is array
  PASS: CLOSURE_RECEIPT_FIELDS.finalize_contractor_attested includes attested/missing/failed
  PASS: emptyReceipt().claim_planner_attested === 'failed'
  PASS: emptyReceipt().finalize_contractor_attested === 'failed'

Results: 8 passed, 0 failed
STATUS: PASS
exit: 0
```

---

## Deferred items

- Committed regression test deferred to the simulate-coverage node. No test file
  is in this node's write set (a non-.md file inside the repo tree would trip the
  per-node barrier).
- Warn-first ENFORCEMENT (reading the dispatch log and checking attestation) is
  the NEXT node (claim.js). This node adds pure-DATA definitions only — no I/O,
  no require()s, no checking logic.

---

## validate-script-sync confirmation

Command: `node scripts/validate-script-sync.js`

```
OK: 15 common scripts and 5 byte-identical file group in sync.
exit: 0
```

All four byte-identical copies confirmed in sync:
- scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
