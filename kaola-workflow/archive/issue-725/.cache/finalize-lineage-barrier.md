# Finalize lineage barrier evidence (#724 documented workaround)

cmdFinalize --keep-worktree refused finalize_gate_unverified/unattributed_change: the
--finalize-check attribution sweep unions complete-node write sets from the ACTIVE child plan
only (child declares n1-repair's 9 files), while the accumulated candidate carries the parent
epoch-1 writes — the KNOWN, FILED tooling gap #724 (same family observed at issue-715 epoch 3).

Lineage-aware equivalent re-run mechanically (script: finalize-lineage-check.js, read-only,
driving the validator's own exported parseNodes/parseLedger/isBarrierInvisible/barrierCheck
over the REAL child plan + the REAL .cache/epochs/1/files/workflow-plan.md snapshot, verbatim
rows and per-epoch ledgers, against the same git diff main...HEAD from the worktree):

```json
{
  "changed_total": 217,
  "child_ledger": {
    "n1-repair": "complete",
    "n2-code-certify": "complete",
    "n3-security-certify": "complete",
    "n4-finalize": "complete"
  },
  "parent_ledger": {
    "n1-recon": "complete",
    "n2-delete": "complete",
    "n3-core-scripts": "complete",
    "n4-claim": "complete",
    "n5-install": "complete",
    "n6-routing": "complete",
    "n7-opencode-kimi": "complete",
    "n8-walkthroughs": "complete",
    "n9-validators": "complete",
    "n10-docs": "complete",
    "n11-code-certify": "pending",
    "n12-finalize": "pending"
  },
  "union_declared_count": 144,
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

Verdict: pass — 217/217 actual writes attributed across the epoch lineage; synthesized
whole-plan barrierCheck pass with zero sensitive / foreign-archive / out-of-allowlist /
unattributed hits. NOT a candidate defect. Both epoch-2 certifier walls (n2-code-certify,
n3-security-certify) reviewed the FULL accumulated diff vs claim root base 33a1ca57 and
approved with zero findings; chain receipt green at headSha 98384667.
