## port-gitea evidence

### RED

Before fixing kaola-gitea-workflow-sink-merge.js, the new Test 22 in test-gitea-sinks.js failed:

```
AssertionError [ERR_ASSERTION]:
  actual: 'failed'
  expected: 'missing'
  operator: 'strictEqual'
```

The test failed at the claim_planner_attested assertion because checkDispatchAttestations was never called — the emptyReceipt default of 'failed' was retained verbatim in the closure receipt.

### GREEN

After porting the fix (two edits to kaola-gitea-workflow-sink-merge.js):

```
attestation fields populated by checkDispatchAttestations: PASSED
Gitea sink tests passed
```

Both claim_planner_attested and finalize_contractor_attested now resolve to 'missing' (the detector-inactive sentinel, not the unresolved-error 'failed') when no dispatch-log is present.

### Changes made

kaola-gitea-workflow-sink-merge.js:
1. Line 9 require destructure: added checkDispatchAttestations alongside checkClosureInvariants.
2. In postMergeCleanup, after buildClosureReceipt and before checkClosureInvariants: inserted the two-candidate checkDispatchAttestations call mirroring the GitLab port exactly.

test-gitea-sinks.js:
Test 22 added (the RED→GREEN assertion block) before the final console.log.

### Verification

npm test exits 0 across all four editions (GitHub/Claude, Codex, GitLab, Gitea).
validate-script-sync.js reports '18 common scripts and 7 byte-identical file group in sync'.
