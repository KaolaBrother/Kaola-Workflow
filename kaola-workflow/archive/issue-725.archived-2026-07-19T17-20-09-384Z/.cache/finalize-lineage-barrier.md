# #724 lineage-union attribution proof — issue-725 Phase B finalize (epoch-2)

The finalize-check attribution sweep builds its allowlist from the ACTIVE child plan only (the
filed #724 gap), so the two-epoch accumulated candidate (9 paths) would refuse
`unattributed_change` on the n2 docs writes (CLAUDE.md, CHANGELOG.md — attributed only in the
epoch-1 parent snapshot). Mechanical lineage-union re-run of BOTH checks (same merge-base diff
`git diff main...HEAD`, declared set unioned across the child plan + the verbatim
`.cache/epochs/1/files/workflow-plan.md` parent snapshot, per-epoch ledgers preserved):

```json
{
  "changed_total": 9,
  "child_ledger": {
    "c1-scope-timeout-fix": "complete",
    "c2-code-review": "complete",
    "c3-finalize": "in_progress"
  },
  "parent_ledger": {
    "n1-receipt-diet": "complete",
    "n2-docs": "complete",
    "n3-code-review": "pending",
    "n4-finalize": "pending"
  },
  "union_declared_count": 9,
  "sweep_unattributed": [],
  "sweep_result": "pass",
  "synthesized_barrier_check": {
    "result": "pass",
    "reason": null,
    "errors": [],
    "sensitiveHits": [],
    "outOfAllow": [],
    "foreignArchiveHits": [],
    "unattributed": []
  }
}
```

Verdict: 9/9 changed paths attributed to complete epoch nodes (c1: the 7 run-chains/test files;
n2: CLAUDE.md + CHANGELOG.md); synthesized whole-plan barrierCheck passes with zero sensitive /
foreign-archive / out-of-allow hits. Finalize proceeds via the scratchpad-patched validator copy
implementing #724's expected lineage union (Phase-A precedent, workaround documented on the
issue); no repo file mutated. Evidence script: scratchpad `finalize-lineage-check.js` (row regex
generalized to `[a-z]\d` ids for the c-prefixed child epoch).
