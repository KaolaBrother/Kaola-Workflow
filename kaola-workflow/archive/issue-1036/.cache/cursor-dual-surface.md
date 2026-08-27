# Cursor APP/Cloud and CLI acceptance — Issue #1036 / PR #1038

candidate: `0501f2527e04c1ecd896df418e50c97b279aa568`

## APP / Cloud Agent surface

Issue #1036 is first-party live evidence from Cursor Agent runs launched through the APP/Cloud surface, not an inference from the CLI:

- Consumer parent `bc-58906f62-9bc3-4b87-b546-3ff8f77ae3b6` exposed a built-in-only Task enum with `generalPurpose`, `explore`, `cursor-guide`, `bugbot`, `security-review`, and `best-of-n-runner`, and no Kaola named types.
- Its omit-model `generalPurpose` child `bc-d19a73e6-64c8-5e58-8fd7-3cdfba0eee19` returned `PROBE_OK omit-model generalPurpose`; `inherit` and resolver-listed `cursor-grok-4.6-high-fast` also ran, while `cursor-grok-4.6-high` was resolver-rejected.
- The later producer parent `bc-01a0426b-3f61-7e04-b801-b9b913c09401` independently repeated the built-in-only catalog and additionally exposed `computerUse` and `videoReview`. Its live `explore`, omit-model `generalPurpose`, and `cursor-grok-4.6-high-fast` generic children all succeeded.
- Candidate routing preserves that measured Path B: use reported built-ins only as themselves, treat absent custody-bearing Kaola roles as a per-item `capability_gap`, do not misclassify files-already-present as an install miss, and do not claim consumer Cloud boot-load.

APP / Cloud verdict: `pass` from the live Issue #1036 probes and the generated Path B semantic oracle.

## Local Cursor CLI surface

Environment:

- `agent --version`: `2026.08.25-3e8eec8`
- authenticated account: `yanleichen@hotmail.com`
- workspace: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1036`
- project catalog: 14 `.cursor/agents/*.md` profiles
- parent model: `cursor-grok-4.6-xhigh`

The parent-authored probe prompts explicitly omitted the Task model field and forbade built-in substitution. The CLI resolved each exact Kaola name as `subagentType.custom.name` and injected the profile tier into the emitted Task call:

| intent | named type | resolved model | child result |
| --- | --- | --- | --- |
| standard | `implementer` | `cursor-grok-4.6-medium` | `PROBE_OK named implementer` |
| reasoning | `code-reviewer` | `cursor-grok-4.6-high` | `PROBE_OK named code-reviewer` |
| heavy | `planner` | `cursor-grok-4.6-xhigh` | `PROBE_OK named planner` |

CLI session / child identities:

- session `e7f49e00-8da1-417a-8401-fb2f7a55e799`, implementer child `9ad4b0ee-1501-49ca-8ecd-57e2dfc4f87c`
- session `7bce15f9-b88a-4146-beb3-f6946908064e`, code-reviewer child `92286896-8af9-4683-b34f-05d3fbdbdb95`, planner child `ccc8b166-2b8b-46a1-bbc8-2c626fd5ef3e`

All calls exited successfully and performed no repository mutation.

CLI verdict: `pass` for named catalog discovery, omit-model parent authoring, and profile-carried medium/high/xhigh tiers.

## Combined verdict

`pass` — APP/Cloud and CLI are separate behavior modes and both have a successful, mode-appropriate path. The APP/Cloud proof is built-in-only Path B; the current local CLI proof is named-profile Path A. Neither is used as evidence for the other's catalog.
