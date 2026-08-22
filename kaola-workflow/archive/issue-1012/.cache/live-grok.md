# Issue #1012 live Grok evidence

## Passing close probe

Runtime: Grok CLI 1.0.5. The parent ran with model `grok-4.6` and explicit
`--reasoning-effort xhigh`. A temporary `GROK_HOME` isolated native project-agent
discovery from older installed copies; `GROK_AUTH_PATH` pointed at the credential
file the already signed-in CLI normally reads. Session-scoped
`GROK_CLAUDE_AGENTS_ENABLED=false` and `GROK_CURSOR_AGENTS_ENABLED=false` disabled
only compatibility agent scans. No config or installed agent file was changed.

Parent session:

```text
id: 7a0a6001-dbe6-445e-8c27-1015f8ba42a6
cwd: /Users/ylpromax5/Workspace/Kaola-Workflow
current_model_id: grok-4.6
reasoning_effort: xhigh
exit: 0
```

The parent transcript recorded these exact tool arguments; neither call carried
`model`:

```json
{"prompt":"Reply exactly STANDARD_CHILD_OK","description":"tdd-guide acceptance probe","subagent_type":"tdd-guide"}
{"prompt":"Reply exactly REASONING_CHILD_OK","description":"code-reviewer acceptance probe","subagent_type":"code-reviewer"}
```

Child `summary.json` records:

```text
id: 01a028db-694f-7c62-b73d-f9ff690f7f89
agent_name: tdd-guide
session_kind: subagent
current_model_id: grok-4.6
reasoning_effort: medium

id: 01a028db-6950-7b60-944c-94cab82b7657
agent_name: code-reviewer
session_kind: subagent
current_model_id: grok-4.6
reasoning_effort: high
```

This satisfies the live acceptance sample: the parent effort differs from both
children, the model remains inherited Grok 4.6, and the standard/reasoning roles
resolve to medium/high respectively.

## Additional observed Grok 1.0.5 limitation

The first standard sample used `implementer`. Its generated native profile carried
`model: inherit` and `effort: medium`, but the child summary recorded `high`.
Successive controls removed the plausible discovery confounders:

- default home, project profile: parent `93d433d3-26d6-47d8-8bda-826a89a08bd5`;
  `implementer` child `01a028d0-40ea-7b83-ae2f-9c01e66857f0` recorded high;
- isolated Grok home with Claude/Cursor compatibility agent scans disabled: parent
  `35cf8768-c69e-4e97-ac9f-ba0da5a14ab5`; `implementer` child
  `01a028d8-e5bb-7730-9dc0-35929bc276c8` still recorded high;
- isolated directory with a minimal inline definition named `implementer`, carrying
  `model: inherit` and `effort: medium`: parent
  `2ef26662-614a-4274-be2e-c66d58116420`; child
  `01a028da-aa7c-7422-b9ef-bc73f16450bf` still recorded high;
- control names in the same runtime accepted the field: `kw-std` recorded medium and
  the actual generated `tdd-guide` recorded medium.

Inference from those A/B legs: Grok CLI 1.0.5 applies a name-scoped high-effort
override or clamp to the literal `implementer` subagent. The generator emits the
requested medium line correctly, but this runtime version does not honor it for that
one sampled name. No config seeding, per-call model override, or second pin path was
added; the limitation is carried forward for documentation and the issue record.
