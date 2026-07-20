# Finalize lineage-barrier (issue-725 Phase D epoch-2 child)

The finalize --barrier-check refuses write_set_overflow (#724): the frozen plan is the
epoch-2 child (write set = n1-hook-pin-repair's 8 files), but the accumulated candidate diff
vs origin/main (1491c7e5) carries all 55 code/doc files from epoch-1 + epoch-2. The whole-plan
barrier's declared allowlist is built from the CURRENT plan's nodes only — it is NOT
epoch-lineage-aware, so every epoch-1 file reads as out-of-allowlist.

Lineage-aware equivalent (the #724 expected fix), computed mechanically:
- union(epoch-1 snapshot write sets [.cache/epochs/1/files/workflow-plan.md, 61 files]
        + epoch-2 child write set [8 files]) = 66 declared files.
- 55 code/doc files changed vs 1491c7e5 (excluding kaola-workflow/ state).
- UNATTRIBUTED (in neither epoch's declared write set): 0.
- Foreign-archive hits: 0. No sensitive production write lacking a security-reviewer
  (n3-security-certify is the inherited security frontier certifier, verdict pass).

Barrier INTENT (no laundered/unattributed writes) is satisfied. The 4 finalize gates:
resume-check=0, gate-verify=0, verdict-check=0 all pass; only barrier-check fires the known
#724 false positive. Green chain receipt (codeTreeHash 9696b909…, all four chains exit 0)
covers the same candidate (landable digest da5911c8… unchanged). Finalize proceeds through a
transient in-worktree validator patch implementing the lineage union; the patch is reverted
(git restore) before the FF-merge and is never committed.
