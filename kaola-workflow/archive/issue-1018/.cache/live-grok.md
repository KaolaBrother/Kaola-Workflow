# Issue #1018 live Grok heavy-tier probe

Runtime: Grok CLI 1.0.5. Candidate: `f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438`.
An isolated `GROK_HOME` was populated from the candidate with `./install-grok.sh --global --yes --forge=github`.
The generated planner profile carried `model: inherit` and `effort: xhigh`.

Parent session:

```text
id: b33944b0-715d-4a17-a2b3-ce8c0bfae7e9
current_model_id: grok-4.6
reasoning_effort: xhigh
exit: 0
```

The recorded parent `spawn_subagent` input was:

```json
{"description":"Acceptance probe reply","prompt":"Reply exactly HEAVY_CHILD_OK","subagent_type":"planner","background":false}
```

It carried no model override. The child session record was:

```text
id: 01a033ca-9559-73a1-88dc-06ee8726019c
agent_name: planner
session_kind: subagent
current_model_id: grok-4.6
reasoning_effort: xhigh
output: HEAVY_CHILD_OK
```

Result: Grok agent frontmatter honors `effort: xhigh`; AC-3 selects the candidate's `fable -> xhigh` binding rather than the documented `high` fallback.
