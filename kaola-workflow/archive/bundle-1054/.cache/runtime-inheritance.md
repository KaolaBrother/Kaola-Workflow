# Investigation: does a dispatched subagent see the global contract carrier and project instructions?

Issue #1054, mission 8. Read-only measurement. No tracked files edited.

## Setup

- Repo commit at measurement time: `d02f82b7` on `main` (v10.5.0), worktree `bundle-1054`.
- Fixture repo (git-initialized, unrelated to the kaola-workflow repo):
  `/private/tmp/claude-501/.../scratchpad/kw1054-fixture`, containing:
  - `AGENTS.md` with the sentence: `This project contains the sentinel sentence: KW1054-PROJECT-SENTINEL-a91f7c3e-in-AGENTS.`
  - `CLAUDE.md` = `@AGENTS.md` (bridge).
  - `.claude/agents/probe.md` (Claude-only custom subagent, body: report any sentinel/contract verbatim).
- Installed carriers checked directly: `~/.claude/rules/kaola-workflow-global.md`, `~/.codex/AGENTS.md`,
  `~/.config/opencode/AGENTS.md`, `~/.kimi-code/AGENTS.md`, `~/.grok/rules/kaola-workflow-global.md`,
  `~/.cursor/rules/kaola-workflow-global.mdc`, `~/.zcode/AGENTS.md` — all present, all begin with
  `# Global Workflow Contract` (grok/cursor prepend a `KW-COMPACT-RECOVERY` block first).
- `which zcode` → exit 1 (no binary). `~/.zcode` exists (agents/cli/commands/config.json/kaola-workflow)
  but there is no CLI to dispatch anything with. **zcode: NOT RUN.**
- Watchdog: macOS has no `timeout`/`gtimeout`; used `perl -e 'alarm 300; exec @ARGV' <cmd>` for every
  headless call (300 s alarm). No command hit the alarm.
- Documentation evidence already on file (not new measurement): `templates/global/runtime-contract-adapters.json`
  and `templates/agents/runtime-capabilities.json` in the worktree. These describe *carriers and precedence*
  but say nothing about subagent context inheritance specifically — that gap is why this is a live-measurement
  task, not a doc-reading task.

## Observations

All commands run from the fixture directory. Full JSON/JSONL/err transcripts are alongside this file in
`kaola-workflow/bundle-1054/.cache/` (`claude-*`, `codex-*`, `opencode-*`, `kimi-*`, `grok-*`, `cursor-*`).

| Runtime | Primary sees project AGENTS.md sentinel | Primary sees global contract | Subagent sees project sentinel | Subagent sees global contract | Command (primary / subagent) |
|---|---|---|---|---|---|
| claude | YES | YES | **YES** | **YES** | `claude -p ... --output-format json` / `claude -p "Dispatch the 'probe' subagent..." --output-format json` |
| codex | YES | YES | UNKNOWN | UNKNOWN | `codex exec -s read-only -C fixture --json "..."` / see Codex subsection below |
| opencode | YES | YES | **YES** | **YES** | `opencode run --dir fixture --format json "..."` / same, prompted to use the `task` tool with `subagent_type: implementer` |
| kimi | YES | YES | **NO** | **NO** | `kimi -p "..." --output-format text` / `kimi -p "Use the Agent tool..." --output-format stream-json` |
| grok | YES | YES | **YES** | **YES** | `grok --cwd fixture --output-format json -p "..."` / same, prompted to use `spawn_subagent` |
| cursor | YES | **NO** | YES | **NO** | `cursor-agent -p --trust --output-format json --workspace fixture "..."` / `... --output-format stream-json` prompted to use the `Task` tool |
| zcode | NOT RUN (no binary) | NOT RUN | NOT RUN | NOT RUN | — |

Verbatim key results:

**claude** — primary (`claude-primary.json`, exit 0): result quotes the AGENTS.md sentence and
`# Global Workflow Contract` from `/Users/ylminiserver/.claude/rules/kaola-workflow-global.md`.
Subagent (`claude-subagent.json`, exit 0): `subagent_stats` shows a real dispatch
(`"spawned":1,"completed":1,"by_type":{"probe":1}`). The probe's verbatim reply, forwarded by the
parent, quotes both the AGENTS.md sentence (loaded "via `@AGENTS.md` in the project `CLAUDE.md`")
and `# Global Workflow Contract` from `/Users/ylminiserver/.claude/rules/kaola-workflow-global.md`.

**opencode** — primary (`opencode-primary.jsonl`): quotes both verbatim. Subagent
(`opencode-subagent.jsonl`): a real `task` tool call (`subagent_type: implementer`) ran in a
**distinct child session** (`ses_f7a518868ffeCHcEMgMUOVzY5Q` vs. parent `ses_f7a51a0c...`) and its
`task_result` quotes the AGENTS.md sentence and `# Global Workflow Contract` (sourced explicitly
from `/Users/ylminiserver/.config/opencode/AGENTS.md`).

**kimi** — primary (`kimi-primary.txt`): quotes both (the first-line pick for the contract was
slightly off — it quoted the first content paragraph rather than the `#` heading line — but it
demonstrably has both documents in context). Subagent (`kimi-subagent2.jsonl`, `stream-json`): a
real `Agent` tool call fired (`tool_calls[0].function.name=="Agent"`,
`arguments.subagent_type=="kaola-role-implementer"`), and the tool result carries
`agent_id: agent-0`, `actual_subagent_type: kaola-role-implementer`. Its reply, verbatim:
> **Sentinel string search:** NONE FOUND — the string `KW1054-PROJECT-SENTINEL` does not appear
> anywhere in my visible context (system prompt, role instructions, runtime adapter block, or
> conversation).
> **"Global Workflow Contract" document:** NONE FOUND — no document with that title is loaded in
> my visible context... My context contains a behavior contract version/hash header and
> prompt-defense/role/verification instructions, but nothing titled "Global Workflow Contract."

This is a real, tool-confirmed dispatch, not a hallucinated refusal.

**grok** — primary (`grok-primary.json`): quotes both. Subagent (`grok-subagent-stream.jsonl`,
`streaming-json`): a real `spawn_subagent` tool call (`subagent_type: implementer`,
`background: true`) returned `subagent_id: 01a085b4-9ee9-70c1-aac8-687de23a49b9`; a follow-up
`get_command_or_subagent_output` call (10.683 s duration) returned:
`"This project contains the sentinel sentence: KW1054-PROJECT-SENTINEL-a91f7c3e-in-AGENTS.\n\n# Global Workflow Contract\n..."`
Both present.

**cursor** — primary (`cursor-primary.json`, then re-run without `--mode plan` in
`cursor-primary2.json`, 2/2 reproducible): finds the AGENTS.md sentinel but answers
`NONE FOUND` for the Global Workflow Contract document, despite
`~/.cursor/rules/kaola-workflow-global.mdc` existing with `alwaysApply: true`. A follow-up prompt
asking it to enumerate loaded Rule documents (`cursor-rules-list.json`) lists `@AGENTS.md` and
several apparently built-in/system rule fragments but never lists the Global Workflow Contract
heading. Subagent: first attempt with `subagent_type: implementer` (`cursor-subagent-stream.jsonl`)
was **rejected by the live Task tool schema**:
`"Invalid enum value. Expected 'generalPurpose' | 'explore' | 'shell' | 'cursor-guide' | 'ci-investigator' | 'bugbot' | 'security-review' | 'best-of-n-runner' | 'probe', received 'implementer'"`
(this Cursor CLI build `2026.09.02-c22c1a3` exposes no Kaola-named subagent type at all — a
different, more restrictive catalog than the `cursor_cli_named_profile_20260827` positive-control
evidence already on file in `runtime-capabilities.json`, which recorded an *older* build,
`2026.08.25-3e8eec8`, successfully dispatching a named `implementer` type). Retried with
`subagent_type: generalPurpose` (`cursor-subagent-stream2.jsonl`): a real dispatch ran
(`agentId: f1c3971c-...`, `durationMs: "13160"`, `machine.sameMachine`), and its verbatim reply is
`"This project contains the sentinel sentence: KW1054-PROJECT-SENTINEL-a91f7c3e-in-AGENTS.\n\nNONE FOUND"`
— same pattern as the primary: project sentinel YES, global contract NO.

## Reproduction

- claude, opencode, grok subagent-sees-both: reproduces (1/1 each, but each result carries an
  unambiguous tool-level dispatch marker — `subagent_stats`, a distinct child `session_id`, and a
  distinct `subagent_id` respectively — so these are not single-sample coin flips on a hallucination).
- kimi subagent-sees-neither: reproduces via a tool-confirmed dispatch (`agent_id: agent-0`) in one run;
  not independently repeated a second time, but the mechanism evidence (explicit `Agent` tool_call +
  tool result, not just assistant prose) makes a hallucinated refusal unlikely.
- cursor primary-does-not-see-global-contract: reproduces 2/2 (with and without `--mode plan`).
- codex subagent: does **not** reproduce a completed measurement — see below.

## Narrowing (codex, one axis: `features.multi_agent_v2.non_code_mode_only`)

- **Leg 1 — default config** (`non_code_mode_only=true`, the box's actual installed default).
  Three separate runs (`codex-subagent.jsonl`, `codex-subagent2.jsonl`) explicitly instructed the
  model to call `agents.spawn_agent`. In every run the only collaboration-tool event logged was a
  `collab_tool_call` of type `"wait"` with `"receiver_thread_ids":[]` — no `spawn_agent` call item
  ever appeared — and the model then answered the sentinel question directly from its own (primary)
  context. A dedicated enumeration prompt (`codex-tools.jsonl`) confirms `agents.spawn_agent` *is*
  present in the tool schema (`agents.spawn_agent`, `agents.wait_agent`, etc. all listed), so the
  tool exists but was never actually invoked under default config. **This eliminates "codex
  subagents inherit context the same way as primary" as directly observable under default settings
  — no real subagent ever ran to check.**
- **Leg 2 — override** (`-c features.multi_agent_v2.non_code_mode_only=false`). A real spawn was
  now attempted: `codex-subagent3.jsonl` shows `"The subagent is still working; I'm waiting for its
  answer"` followed by `"Agent errored: stream disconnected before completion: Encrypted function
  output content could not be decrypted or decoded."` Three further retries in the background job
  (`codex-subagent-retry1/2/3.jsonl`) all failed with the identical error. **This eliminates "the
  override alone is sufficient to get a measurable codex subagent answer on this box"** — the spawn
  mechanism engages (real wait/error lifecycle, not silent) but the child's output never decodes
  successfully across 4/4 attempts, which reads as a transient host/session-layer fault unrelated to
  context-carrier content, not a context-visibility signal either way.

## Inferences

- Claude, opencode, and grok subagents each demonstrably inherit **both** the global workflow
  contract carrier and the project AGENTS.md/CLAUDE.md-bridge content, via a tool-confirmed real
  dispatch (not the primary agent answering in the subagent's stead). — confidence: high;
  refuted by a future dispatch on any of these three returning `NONE FOUND` for either sentinel
  under the same fixture and prompt shape.
- Kimi subagents (dispatched via `Agent`, profile `kaola-role-implementer`) do **not** inherit
  either the global contract carrier (`~/.kimi-code/AGENTS.md`) or the project AGENTS.md/CLAUDE.md
  content; the child explicitly describes its own context as "system prompt, role instructions,
  runtime adapter block" only. — confidence: high for this one confirmed dispatch; would be
  strengthened by a second independent run, which was not done here for time.
- Cursor CLI (this box's installed build) subagents inherit the project AGENTS.md sentinel but not
  the global-contract carrier — and neither does the *primary* agent in this build, so the
  subagent behavior here is consistent with, not additional evidence against, whatever is
  suppressing the global-contract carrier for the primary agent on this box. — confidence:
  moderate; the root cause of the primary-agent miss (CLI build regression vs. environment
  misconfiguration vs. an account/sync gate) was not isolated and is out of scope for this
  read-only measurement.
- Codex's actual subagent behavior on the boundary-inheritance question is **unresolved** on this
  box: default config never spawns, and the override spawns but never returns decodable output. A
  role-body-vs-shared-carrier decision for codex cannot be grounded in a real subagent observation
  from this session. — confidence: this is an absence of evidence, not evidence of absence, in
  either direction.

## Open

- Codex: whether a successfully-completed codex subagent sees the global-contract carrier and
  AGENTS.md is unmeasured; the `Encrypted function output content could not be decrypted or
  decoded` error recurred 4/4 times with the override on and needs its own investigation (likely a
  codex-host/session bug, independent of #1054) before this axis can be settled.
- Cursor: why the primary agent (and downstream generalPurpose subagent) on this specific CLI build
  does not see `~/.cursor/rules/kaola-workflow-global.mdc` despite `alwaysApply: true`, and why this
  build's live Task enum carries no Kaola-named subagent type at all (contradicting the
  `cursor_cli_named_profile_20260827` positive control already on file for an older build), is
  unmeasured here — flagged for whoever owns the cursor edition, not diagnosed.
- Kimi: only one subagent dispatch was run; a second independent sample was not collected.
- Zcode: entirely unmeasured — no binary on this machine to dispatch anything with.
