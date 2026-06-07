# claim-posture-attest evidence
node: claim-posture-attest
issue: #277 (M4 run_posture + M2 WARN-FIRST attestation)

## RED

Repro run BEFORE edits — helpers not yet exported from claim.js:

```
$ node /tmp/claim-attest-repro.js

=== deriveRunPosture ===
/private/tmp/claim-attest-repro.js:37
check('truthy path -> worktree', deriveRunPosture('/some/path') === 'worktree');
                                 ^

TypeError: deriveRunPosture is not a function
    at Object.<anonymous> (/private/tmp/claim-attest-repro.js:37:34)
    ...

Exit code: 1
```

## GREEN

Repro run AFTER edits — 16/16 assertions pass:

```
$ node /tmp/claim-attest-repro.js

=== deriveRunPosture ===
  PASS: truthy path -> worktree
  PASS: empty string -> in-place
  PASS: null/undefined -> in-place

=== checkDispatchAttestations: no log found ===
  PASS: no-log: claim_planner_attested=missing
  PASS: no-log: finalize_contractor_attested=missing
  PASS: no-log: exactly 1 warning
  PASS: no-log: warning mentions dispatch-log

=== checkDispatchAttestations: log with planner + contractor ===
  PASS: both-attested: claim_planner_attested=attested
  PASS: both-attested: finalize_contractor_attested=attested
  PASS: both-attested: zero warnings

=== checkDispatchAttestations: log with planner only (contractor missing) ===
  PASS: planner-only: claim_planner_attested=attested
  PASS: planner-only: finalize_contractor_attested=missing
  PASS: planner-only: 1 warning for contractor
  PASS: planner-only: warning mentions contractor

=== closure_invariants.ok unaffected (warn-first guarantee) ===
  PASS: warn-first: no new violations from missing attestations (handled in receipt.warnings not violations)
  PASS: warn-first: warnings array present

=== SUMMARY ===
Passed: 16 / Failed: 0

Exit code: 0
```

## Regression-green (simulate)

```
$ node scripts/simulate-workflow-walkthrough.js
...
testAdaptiveWorktreeProvisionedE2E: PASSED
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed

Exit code: 0
```

`closure_invariants.ok === true` assertions all pass (the no-log warn-first path emits
`claim_planner_attested='missing'` + `finalize_contractor_attested='missing'` into
`receipt.warnings`, never into `violations`).

## validate-script-sync

```
$ node scripts/validate-script-sync.js
OK: 15 common scripts and 5 byte-identical file group in sync.

Exit code: 0
```

## git status

Only the 4 declared claim.js files were modified by this node. All other modified
files (closure-contract.js, validate-*, agents, commands, skills) are from prior
nodes in this adaptive run and were already present in the working tree at node start.

## All-editions GREEN

Each of the 4 editions loaded, exported both helpers, and passed 9 behavioral
assertions (deriveRunPosture + checkDispatchAttestations with no-log and both-attested
fixtures):

```
=== scripts/kaola-workflow-claim.js ===  PASS: all 9 assertions OK
=== plugins/kaola-workflow/scripts/kaola-workflow-claim.js ===  PASS: all 9 assertions OK
=== plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js ===  PASS: all 9 assertions OK
=== plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js ===  PASS: all 9 assertions OK
```

## cmdFinalize wiring (end-to-end confirmation)

Offline finalize on a minimal in-place project (no dispatch-log present):

```
claim_planner_attested: missing
finalize_contractor_attested: missing
warnings: ["attestation: dispatch-log not found (SubagentStart hook not installed) — detector inactive"]
closure_invariants.ok: true
PASS: cmdFinalize wiring confirmed end-to-end
```

Both fields set to 'missing' (not the 'failed' default); exactly 1 soft warning; ok=true.

## Note on simulate coverage

Dedicated simulate test coverage for deriveRunPosture and checkDispatchAttestations
(verifying run_posture appears in workflow-state.md, and the warn-first receipt fields
in finalize output) is added by the simulate-coverage node (next in the plan).
