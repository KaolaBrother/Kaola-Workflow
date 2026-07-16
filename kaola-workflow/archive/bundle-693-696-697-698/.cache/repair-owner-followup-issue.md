## Problem

The failed-review repair protocol asks the agent to select a semantic owner from canonical `ownership_candidates`, but `repair-node` admits only a graph-maximal producer. A serial tail writer can therefore be structurally admissible while owning none of the blocking findings, and the true semantic owner is unrecoverable in-plan.

This was reproduced live by adaptive bundle `bundle-693-696-697-698` on 2026-07-15.

## Live evidence

The frozen chain is:

```text
n4-review-engine -> n5-runtime-guidance -> n6-installed-contract-proof -> n7-documentation -> n8-code-review
```

Review attempt `n8-code-review:1` failed with six concrete findings in A4-owned lifecycle/schema/test files. Its producer slice is A2–A7. The canonical compact finding rows carry no affected file/anchor, so every route has `ownership_candidates: []`.

The official repair command for the semantic owner returned a zero-mutation refusal:

```text
node scripts/kaola-workflow-adaptive-node.js repair-node \
  --project bundle-693-696-697-698 \
  --attempt-id n8-code-review:1 \
  --node-id n4-review-engine \
  --json

{"result":"repair_requires_replan","attempt_id":"n8-code-review:1","producer_slice":["n2-profile-contracts","n3-validation-runner","n4-review-engine","n5-runtime-guidance","n6-installed-contract-proof","n7-documentation"]}
```

`n7-documentation` is the only graph-maximal producer but its declared write set is documentation-only. Selecting it cannot repair A4 code. Simply admitting A4 would also be unsafe today because `repair-node` folds downstream gates, not completed dependent writers A5–A7; those outputs could remain stale.

## Contract conflict

- #446 / D-446-01: affected file determines the frozen writer owner; unowned paths require plan repair.
- #682 / D-682-01 and #684: only a unique maximal executed producer may reopen; a non-maximal producer must return `repair_requires_replan`.
- #683/#664: sibling rebind and gate-evidence rotation do not solve serial descendant replay.
- #699: owns claim-preserving replacement-plan activation after a valid replan refusal; it does not select the semantic writer.

The conservative refusal is correct. The missing behavior is a concrete bridge between semantic ownership, safe descendant invalidation, and the #699 fallback.

## Required design

- [ ] Schema-1 findings resolve ownership from canonical affected files; schema-2 findings resolve ownership from immutable anchors/paths.
- [ ] Compact receipts and the authoritative journal preserve enough ownership data for deterministic routing; prose-only paths are insufficient.
- [ ] A graph-maximal writer that owns no blocking finding refuses with `repair_writer_ownership_mismatch`, with zero mutation.
- [ ] A uniquely owned upstream writer may reopen only through one crash-safe transaction that invalidates/replays every affected completed descendant writer and downstream gate, preserving original baselines, provenance, candidate binding, and idempotency.
- [ ] If ownership is absent/ambiguous, findings span incomparable writers, descendant replay is unsafe, or topology must change, return a detailed `repair_requires_replan` such as `dependent_producer_replay_required`, naming the semantic owner and blocking descendants for #699.
- [ ] Preserve #684 antichain refusal, the five-consumed-repair breaker, candidate/repair-delta binding, and anti-laundering invariants.
- [ ] Add crash-prefix/idempotent-retry tests and four-edition stateful walkthrough coverage.

## Regression shape

Freeze `impl -> guidance -> docs -> review -> sink`, with the blocking finding uniquely anchored to an `impl` path.

1. Routing produces `ownership_candidates:["impl"]`.
2. `repair-node --node-id docs` refuses the ownership mismatch even though docs is structurally maximal.
3. `repair-node --node-id impl` either performs the complete descendant-replay transaction or returns the detailed #699 handoff with no mutation.
4. Crash at every durable boundary and retry to the same terminal state.

Parent/cross-reference: #695, #446, #682, #683, #684, #698, #699.
