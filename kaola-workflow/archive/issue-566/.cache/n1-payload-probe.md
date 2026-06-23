evidence-binding: n1-payload-probe 0974938a2331
## Findings: does the SubagentStart hook payload carry `model`?

### What the hook currently parses
`hooks/kaola-workflow-subagent-dispatch-log.sh` reads exactly three JSON keys from stdin: `agent_type`, `agent_id`, `cwd`, and emits `{ts, agent_type, agent_id, cwd}`. It does not read `model`. The implementation is best-effort, so an absent `model` is tolerated regardless — but the docs must state which runtimes actually supply it.

### Per-runtime verdict

| Runtime | `model` in SubagentStart payload? | Confidence | Source |
|---|---|---|---|
| **Claude Code** (native SubagentStart hook) | **Absent** | Confirmed absent | Official docs code.claude.com/docs/en/hooks: "Common input fields" lists only `session_id, transcript_path, cwd, permission_mode, effort, hook_event_name` (+ `agent_id/agent_type` in subagent context). Verbatim: "Only `SessionStart` hooks can receive a `model` field, and it is not guaranteed to be present." (Retrieved 2026-06-23.) |
| **codex CLI** (github-codex edition) | **Present** | Confirmed present | Official docs developers.openai.com/codex/hooks: shared "Common input fields" includes `model` described as "Codex-specific extension. Active model slug." SubagentStart adds `turn_id, agent_id, agent_type, permission_mode` on top. (Retrieved 2026-06-23.) Minor caveat: "active model slug" does not disambiguate parent-vs-subagent model on SubagentStart. |
| **gitlab / gitea editions** | **Present** when run on codex CLI; **Absent** when run on Claude Code | Confirmed (runtime-dependent) | Forge editions ship byte-identical dispatch-log hooks (validate-script-sync.js:157-162 lists the 4 byte-synced copies) AND Claude-Code hook configs. Availability follows the active runtime, not the forge name. |
| **opencode** | **Absent** | Confirmed absent | opencode has no native SubagentStart-on-stdin mechanism; this edition bridges via an adapter plugin `.opencode/plugins/kaola-workflow-hooks.js` that constructs a Claude-style JSON `{agent_type, agent_id, cwd}` only. opencode's `task` tool has no per-call model/variant override. |

### Bottom line for docs
`model` is present **only on the codex CLI runtime** (github-codex, and the gitlab/gitea editions when running on codex CLI); it is **absent from Claude Code's SubagentStart** (Claude exposes `model` only on `SessionStart`, and not guaranteed there) and **absent from opencode** (the adapter constructs `{agent_type, agent_id, cwd}` only). Therefore the dispatch-log `model` field is inherently **best-effort / may be empty** — correct to record it when the payload exposes it, and tolerate its absence elsewhere. `model_planned` (resolved via scripts/kaola-workflow-resolve-agent-model.js) is the reliable always-populated field for a known role.

Suggested single doc statement: *"model is supplied by the codex CLI runtime; Claude Code and opencode do not expose the dispatched model on SubagentStart. model_planned is always resolved from the agent manifest."*
