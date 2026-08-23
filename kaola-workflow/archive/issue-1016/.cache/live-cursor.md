# Issue #1016 live close evidence (Layer 5)

Comments override the body: plan of record `5383907624`, freshness amendment `5383958037`.
Do not re-init consumer `CLAUDE.md`. Mid-session copy does not count. `~/.cursor/agents` is not the Task catalog.

Cursor CLI: `2026.08.11-e8db854`. Every probe: fresh `agent -p --output-format stream-json --trust --force --sandbox disabled --model cursor-grok-4.6-xhigh` (no `--resume` / `--continue`). Parent init model: **Cursor Grok 4.6 Extra High**.

Ensure binary under test: worktree `scripts/kaola-workflow-ensure-cursor-catalog.js`.
Global pins already on the host: `~/.cursor/agents` (14 files). `implementer` `model: grok-4.6[effort=medium]`; `code-reviewer` `model: grok-4.6[effort=high]`.

Consumer: `/tmp/kw-1016-live-LaSoWE` (git init). **No** project `.cursor/` at control time. `CLAUDE.md` still carries the pre-#1014 overlay sentence (“pass the role's configured model on the spawn call”). That overlay was **not** rewritten.

---

## This `/workflow-next` parent (catalog already present)

Workspace `/Users/ylpromax5/Workspace/Kaola-Workflow` had `.cursor/agents` **before this chat started**. Named `Task` omit-`model` fired in this same IDE parent:

| authored `subagent_type` | agent id | `model` arg |
|---|---|---|
| `tdd-guide` | `c22458d0-35dd-477b-9030-66dd63dca0c8` (RED) / `c8f16880-5dfc-4227-8697-9b4f5b4942aa` (GREEN) | omitted |
| `implementer` | `128758b6-149f-4bea-8337-3b51ee4dd042` | omitted |

Zero `generalPurpose`. Zero `inherit`. That is the catalog-present path of the plan, exercised as the run that implements #1016. It is **not** the empty-catalog miss; that miss is the isolated consumer below.

Restarting the Cursor app was **not** required for this parent (catalog was already loaded at session start) and is **not** a substitute for the consumer new-chat below.

---

## 1. Control — named type still schema-rejected (empty catalog)

- Workspace: `/tmp/kw-1016-live-LaSoWE`, no `.cursor/` tree.
- Host `~/.cursor/agents/implementer.md` present (14 pins).
- Prompt: `Task` `subagent_type=implementer`, omit `model`; do not substitute `generalPurpose`.
- Session: `27f72171-d1f7-40bb-8040-06d9d5d1a311`
- Stream: `kaola-workflow/issue-1016/.cache/probe-control.ndjson`
  SHA-256 `8620b27c89d5537b8af17751444fa79ceef1bafa3e387d8508ce06c14291cbc8`
- One `taskToolCall`, completed with:

```
Invalid arguments:
subagent_type: Invalid enum value. Expected 'generalPurpose' | 'cursor-guide' | 'bugbot' | 'security-review' | 'best-of-n-runner', received 'implementer'
```

No retry as `generalPurpose`. Same as Probe 2 / #1014 Probe A. Global pins did not become Task types.

---

## 2. Ensure materializes the workspace catalog (this session still must not named-dispatch)

Ran from consumer cwd, `CURSOR_HOME=$HOME/.cursor`:

```
node …/issue-1016/scripts/kaola-workflow-ensure-cursor-catalog.js
```

Stdout `copied`, exit 0. Dest `<cwd>/.cursor/agents` then has all 14 canon names, byte-identical to `$CURSOR_HOME/agents` (`implementer` / `code-reviewer` `cmp` identical). A planted dest `user-agent.md` (`# stray-dest`) survived; it was not in home. Second run: stdout `already-present`, exit 0.

Control session's enum is unchanged (not re-used). Named dispatch waits for a **new** chat.

Layer 3b hook smoke (not the consumer session): generated `.cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh` with hermetic `CURSOR_HOME` + ensure JS deployed beside it. Stdout `{}`. Dest then had 14 files including `implementer.md`.

---

## 3. New chat — named omit-`model` envelopes (the close path)

**New** `agent -p` process, `--workspace` the same consumer **after** dest had the 14 files.

- Session: `812b7b22-b409-46e6-9509-5b4350ab6e3d`
- Stream: `kaola-workflow/issue-1016/.cache/probe-envelopes.ndjson`
  SHA-256 `89dcca573d78a1397ea9534af45c0bb0da24eda7ac4016a6460869356002b6b4`
- 44/44 events `JSON.parse` clean
- Parent init: Cursor Grok 4.6 Extra High. Inherit-from-parent cannot produce the split below.

Started/completed envelope pairs (`tool_call.taskToolCall.args`; Cursor injects resolved model):

| `subagentType.custom.name` | envelope `model` | child |
|---|---|---|
| `implementer` | `cursor-grok-4.6-medium` | `STANDARD_CHILD_1016_LIVE` (agent `445b8326-2628-424c-a359-7b0e0d2ccf58`) |
| `code-reviewer` | `cursor-grok-4.6-high` | agent `1188b778-4861-4943-a5b7-37749b7e5aab`; child text was a reviewer-contract gap note rather than `REASONING_CHILD_1016_LIVE` |

Zero `generalPurpose` in Task args. Zero authored `inherit`. Overlay sentence still in consumer `CLAUDE.md`; authored calls still omitted `model`.

The close bar is the **envelope split**, not the reviewer echo token. `code-reviewer` resolved `cursor-grok-4.6-high` from an xhigh parent with `model` omitted.

---

## 4. Overlay freeze

Consumer `CLAUDE.md` still contains “pass the role's configured model on the spawn call”. No `workflow-init`, no overlay rewrite, no `./install-cursor.sh --target` on this consumer. Catalog landed via the ensure CLI reading `$CURSOR_HOME/agents`.

---

## Verdict

`PASS` — empty-catalog consumer still 400s named `implementer`; ensure copies only canon names from global and leaves user extras; a **new** CLI chat then named-dispatches omit-`model` and the stream injects `cursor-grok-4.6-medium` vs `cursor-grok-4.6-high`. This IDE `/workflow-next` parent, where the workspace catalog already existed at session start, named `tdd-guide` and `implementer` without `generalPurpose`/`inherit`.
