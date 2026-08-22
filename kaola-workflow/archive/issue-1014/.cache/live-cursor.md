# Issue #1014 cold-session Cursor evidence

Cursor CLI: `2026.08.11-e8db854`. Parent model for every probe: `--model cursor-grok-4.6-xhigh` (`Cursor Grok 4.6 Extra High`). Fresh `agent -p --output-format stream-json` chats (no `--resume` / `--continue`). Mid-session install does not count; each probe is a new process.

Installer under test: worktree `install-cursor.sh` at
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`.
Generated source tree is the main-checkout `.cursor/` (worktree `--print-tree-root`).

Host `~/.cursor/agents/implementer.md` was already present for Probe A (the #1013 global pin). That is not the Task catalog.

---

## 1. Probe A — control (no project `.cursor/agents`)

- Workspace: `/tmp/kw-cursor-1014-probeA.mpdk00` (`git init`, no `.cursor/`).
- Global `~/.cursor/agents/implementer.md` present.
- Prompt: call `Task` with `subagent_type=implementer`, omit `model`; do not substitute `generalPurpose`.
- Session: `acddc60d-d6c2-4112-abe9-44b1b8e2e426`.
- Stream: `kaola-workflow/issue-1014/.cache/probe-a.ndjson`
  SHA-256 `fa10d149bde2f8a0fe3819a7dea79812d490038ad58f3e96c65da845a93aa916`
- Tool result (schema reject):

```
Invalid enum value. Expected 'generalPurpose' | 'cursor-guide' | 'bugbot' | 'security-review' | 'best-of-n-runner', received 'implementer'
```

The parent did **not** retry as `generalPurpose`. Same catalog-load split as the 2026-08-22 diagnosis.

---

## 2–3. `--global` dual-write, then named omit-`model` envelopes

- Isolated git repo: `/tmp/kw-cursor-1014-probe23.f5IY91`
- Hermetic `CURSOR_HOME=/tmp/kw-cursor-1014-chome.yb3Fg4` (does not overwrite the host `~/.cursor`; dual-write still targets the git toplevel).
- Command (cwd = the git repo):

```
install-cursor.sh --global --yes --no-scripts
```

`--no-scripts` skipped hooks/support scripts so the probe does not merge `hooks.json`; agents+commands still deploy. Install log: `.cache/probe-23-install.log`.

Observed:

- Un-nested `$CURSOR_HOME/agents/implementer.md`
- **No** nested `$CURSOR_HOME/.cursor/`
- Dual-write: `<repo>/.cursor/agents/implementer.md` and `code-reviewer.md`
- Installer printed: `Task types are workspace-scoped; also deploying agents+commands → …/.cursor`
- Raw pins in the project tree: `model: grok-4.6[effort=medium]` (implementer) and `model: grok-4.6[effort=high]` (code-reviewer)

Then a **new** chat (`--workspace` the same repo):

- Session: `223ae129-3773-4112-a841-02f14851bee6`
- Stream: `kaola-workflow/issue-1014/.cache/probe-23.ndjson`
  SHA-256 `5d5e9801bd7adfb4994ee0a20554e2dbd84d289bf0a24c18fd2951373e431dd7`
- 34/34 events `JSON.parse` clean
- Started/completed envelope pairs (Cursor injects the resolved model on the Task envelope, same carrier as #1013):

| `subagentType.custom.name` | envelope `model` | child text |
|---|---|---|
| `implementer` | `cursor-grok-4.6-medium` | `STANDARD_CHILD_1014` |
| `code-reviewer` | `cursor-grok-4.6-high` | `REASONING_CHILD_1014` |

No `generalPurpose`. No authored `inherit`. Named custom types only.

---

## 4. Fail-closed tape — no project agents, no catalog to materialize

- Workspace: `/tmp/kw-cursor-1014-probe4.gh8zC0` — only `.cursor/commands/workflow-next.md` (the generated next card). **No** `.cursor/agents/`.
- `CURSOR_HOME=/tmp/kw-cursor-1014-p4chome.7Vrj79` empty (so `${CURSOR_HOME:-$HOME/.cursor}/agents/` does not resolve to the host global copy).
- Prompt: follow that card’s catalog preflight; dispatch implementer; do not substitute `generalPurpose`.
- Session: `42414d3a-f889-4f78-b517-841a3307c98d`
- Stream: `kaola-workflow/issue-1014/.cache/probe-4.ndjson`
  SHA-256 `c02cff081f729e264b4f1e609ac38bafb85b3309e23b1c65378e80806850a71b`
- No `Task` call. No `generalPurpose` tool call. Workspace still has no `.cursor/agents/` after the chat.
- Parent fail-closed: print `./install-cursor.sh --target "$PWD"`, do not name a Task type, start a new chat after install.

---

## Verdict

`PASS` — Probe A still rejects named types when the workspace catalog is empty (global `~/.cursor/agents` is not enough). `--global` from a git cwd dual-writes the 14 agents into `<toplevel>/.cursor/agents`. A fresh xhigh parent then dispatches `implementer` / `code-reviewer` with `model` omitted and the streamed envelopes resolve `cursor-grok-4.6-medium` vs `cursor-grok-4.6-high`. A next-card parent with no catalog and no copy source does not impersonate via `generalPurpose`.
