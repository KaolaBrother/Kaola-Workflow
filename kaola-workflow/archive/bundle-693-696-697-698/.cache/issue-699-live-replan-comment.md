## 2026-07-15 live entry fixture: legacy bundle now requires this transaction

Active project `bundle-693-696-697-698` has reached a genuine, settled `repair_requires_replan` outcome and supplies a concrete v1-parent→v2-child acceptance fixture for this issue.

Source transaction:

- parent plan hash: `d2f4efb603e4952a861c2387d979a2df2d2f317de3e48d273a80aeba5ce40f05`
- failed attempt: `n8-code-review:1`
- gate outcome: `verdict_not_pass`, six blocking findings, lifecycle settled
- current candidate remains preserved in the claimed branch/worktree
- direct repair of the semantic engine owner produced:

```json
{"result":"repair_requires_replan","attempt_id":"n8-code-review:1","producer_slice":["n2-profile-contracts","n3-validation-runner","n4-review-engine","n5-runtime-guidance","n6-installed-contract-proof","n7-documentation"]}
```

The replacement plan must be planner-authored from the evidence packet; the main orchestrator must not dictate its shape. Required facts for the packet include:

1. R1 authoritative current-candidate resolution references;
2. R2 comparable current-candidate validation passes across repair;
3. R3 validation-consumed prose in G4 producer classification;
4. R4 `epoch_lineage_id + scope_lineage_id` history and stable claim-root anchor;
5. R5 generated runtime-neutral security-reviewer contract plus contract-v2 enforcement;
6. R6 executable conformance cases replacing coverage labels.

The source plan is verified legacy v1 and must remain byte-immutable. This run therefore exercises the body's explicit compatibility requirement: snapshot the v1 plan/journal/evidence/candidate authority, establish the claim-root and inherited frontier, let `workflow-planner` author a schema-2 child, freeze it, then activate it through the journaled transaction.

New #701 records a separate repair-routing defect exposed by the same run: semantic finding ownership and graph-maximal repair admissibility are disconnected. #701 must not weaken the conservative refusal; this issue remains the fallback whenever safe descendant replay cannot be proven.

Acceptance addition from the live run:

- [ ] Use the preserved `n8-code-review:1` shape (or an exact fixture) to prove v1-parent→v2-child activation without changing parent bytes, candidate authority, issue claim, branch, or worktree.
- [ ] The child plan can widen ownership to generated security-reviewer profiles and rerun affected engine/installer/docs/review work without laundering the inherited dirty candidate.
- [ ] A crash/retry at every transition phase converges to one child epoch and one planner-authored plan.
