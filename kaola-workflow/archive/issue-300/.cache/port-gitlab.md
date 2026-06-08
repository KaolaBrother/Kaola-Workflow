## port-gitlab evidence

### RED

Before the fix, running the new test against the unmodified kaola-gitlab-workflow-sink-merge.js:

```
AssertionError [ERR_ASSERTION]: attestation test: claim_planner_attested must be "missing"
(not "failed") — checkDispatchAttestations not called
+ actual - expected

+ 'failed'
- 'missing'
```

The postMergeCleanup path in the GitLab sink-merge built its closure receipt via buildClosureReceipt but never called checkDispatchAttestations, so both claim_planner_attested and finalize_contractor_attested retained the emptyReceipt default of 'failed' — even in the normal no-dispatch-log case where 'missing' is correct.

### GREEN

After the fix, the same test passes:

```
attestation fields populated by checkDispatchAttestations: PASSED
GitLab sink tests passed
```

Full npm test exits clean across all editions (GitHub, GitLab, Gitea, Codex variants).

### Changes made

kaola-gitlab-workflow-sink-merge.js:
1. Line 9 — added checkDispatchAttestations to the destructured require from ./kaola-gitlab-workflow-claim.
2. Lines 320-327 — inserted checkDispatchAttestations([archiveDest/.cache, live/.cache], receipt) call in postMergeCleanup success path, between buildClosureReceipt and checkClosureInvariants, mirroring GitHub edition exactly.

test-gitlab-sinks.js:
Added new subprocess test block (lines 806-833) that runs the GitLab sink-merge OFFLINE against a real temp repo, parses the closure_receipt, and asserts both claim_planner_attested === 'missing' and finalize_contractor_attested === 'missing'.
