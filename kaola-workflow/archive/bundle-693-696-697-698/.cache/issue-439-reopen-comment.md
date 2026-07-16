## 2026-07-15 live regression: serial entrypoint suppresses auto speculation

The active adaptive bundle for #693/#696/#697/#698 reproduced a violation of this issue's mechanical eligibility contract.

Frozen-plan facts:

- `speculative_open_policy: auto`
- `n8-code-review` is an open read-only gate
- `n9-security-review` is read-only and its only unsatisfied dependency is that open gate
- n8 was opened through the documented serial `open-next` path

Reproduction from the claimed worktree:

```text
node scripts/kaola-workflow-adaptive-node.js open-ready --project bundle-693-696-697-698 --json
{"result":"refuse","reason":"serial_node_live","inProgress":["n8-code-review"],"runningSet":[],"repair":"close the live serial node (close-and-open-next) before fanning out","operator_hint":"A serial node is still in_progress (n8-code-review). Close it (close-and-open-next) before fanning out."}
```

This means the attainable workflow shape depends on whether the orchestrator happened to open the gate with `open-next` or `open-ready`, even though the frozen DAG and policy are identical. The unconditional serial-live exclusion currently runs before speculative-pending admission. The safe serial-writer refusal from #383 must remain; this defect concerns adopting an already-open read gate into the running-set transaction so its eligible read-only dependent can open.

### Required repair contract

- [ ] A gate opened by `open-next` followed by `open-ready` admits an eligible speculative read under `auto`.
- [ ] Opening the same gate through `open-ready` yields the same attainable running set.
- [ ] Adoption/representation of the live gate and dependent admission is atomic and leaves no orphan union state.
- [ ] A live serial writer still refuses with `serial_node_live`.
- [ ] `auto`, `consent`, and `off` remain behaviorally distinct.
- [ ] Close/reconcile crash prefixes are idempotent.
- [ ] Four editions plus the stateful walkthrough reproduce the failure before the fix and pass after it.

Cross-references: #597 (`auto` policy), #383 (coordination/exclusivity safety). This is not #699 (replacement-plan epochs) or #700 (sink/archive collision).
