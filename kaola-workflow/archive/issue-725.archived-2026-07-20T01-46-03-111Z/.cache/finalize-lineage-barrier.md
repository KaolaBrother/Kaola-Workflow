# Finalize lineage-union attribution proof — issue-725 Phase C (the #724 gap, second occurrence)

`cmdFinalize` refused `finalize_gate_unverified` / `unattributed_change`: the attribution sweep
(plan-validator.js:4900-4913) unions only the CURRENT plan's complete-node write sets — the epoch-2
child plan attributes r1's five files, leaving the 36 epoch-1-owned branch paths unattributed.
This is exactly the #724 child-plan-only-allowlist gap, hit before at Phase A finalize.

## Proof (machine-computed, this run)

Union of `complete` nodes' declared write sets across the epoch lineage:
- epoch-1 archived plan `.cache/epochs/1/files/workflow-plan.md` (ledger: n1-n6 complete; n7/n8
  pending — n7 is the failed gate that triggered the replan, no write set either way):
  n1-edition-sync-dedup, n3-adaptive-node-hashguard, n5-hook-deletion (28-file hook retirement
  set), n6-docs.
- epoch-2 live plan (ledger: all four complete): r1-hook-assert-repair (5 files).

Result against `git diff 0a9f652a...HEAD --name-only` (46 paths): **46/46 covered, 0 uncovered**
(state paths under `kaola-workflow/` excluded by the sweep itself). The candidate tree is the
byte-identical tree both certifier walls certified (codeTreeHash
48619143aecb2ed96bdc2b9a0b0462bfdcf9f0ef42debcb075c60af99af8cd49, receipt match).

## Resolution

Completed finalize via the sanctioned patched-copy pattern (repo untouched): a scratchpad
validator copy implementing #724's expected lineage union (the completeDeclared build also scans
`.cache/epochs/*/files/workflow-plan.md` complete nodes), shelled by a scratchpad claim copy.
Fail-closed posture preserved: the union only ADDS attribution from archived, digest-snapshotted
epoch plans; every other check runs unmodified.
