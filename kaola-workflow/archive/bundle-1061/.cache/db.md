# #1061 Adaptive subagent task-difficulty probe — DB query summary

Query target: `~/.local/share/devin/cli/sessions.db`, session `thankful-dragon`.

## sessions row

| id | model | created_at | last_activity_at |
|---|---|---|---|
| `thankful-dragon` | `adaptive` | 1789191477 | 1789191570 |

No separate sessions were created for the subagents; all subagent contexts appear as nodes within the parent session's `message_nodes` tree.

## `message_nodes` findings

- Parent `powered by` nodes (message_id `721038a2-5804-4e9b-8692-890267573bbb`) all report `You are powered by Adaptive.`
- Each successful subagent has its own distinct `powered by` system node:
  - Task A (TRIVIAL): message_id `c84cf313-c125-4391-8c08-16d5b54a8b42`
  - Task B (MEDIUM): message_id `ac600b77-0882-43f5-8194-8dcd42f689d9`
  - Task C (COMPLEX): message_id `f838d755-9bd2-4b05-a770-628478529362`
  - Task D attempts: message_id `d44c4e1a-dd9a-423d-ab3b-0e085d776368` and two more (all rejected)
- Every subagent `powered by` node contains exactly `You are powered by Adaptive.`

## `generation_model` / `model_name` in metadata

Queried `json_extract(metadata, '$.generation_model')` and `json_extract(metadata, '$.model_name')` for:
- Parent assistant nodes → `gpt-5-6-sol-low` / `gpt-5-6-sol-low`
- Subagent assistant reply nodes → both fields **empty/null**
- Subagent `powered by` system nodes → both fields **empty/null**

## Conclusion from local data

The local session DB does **not** expose a concrete resolved model id for subagent inference when the profile is `model: adaptive`. We can observe that each subagent receives a fresh context, and that all report `powered by Adaptive`, but we cannot see whether the underlying `generation_model` differed by task difficulty.
