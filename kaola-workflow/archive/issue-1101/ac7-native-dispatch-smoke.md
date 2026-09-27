# #1101 AC7 — live native-dispatch smoke and environment limits

Acceptance (AC7): 实际 native dispatch smoke 仅在可用运行时中验证并记录环境限制，不捏造未执行的 live 证明 —
verify real native dispatch on the runtimes that are available, record the concrete limit for the
rest, and assert nothing that was not observed.

- Smoke candidate: branch `workflow/issue-1101` at `014de4cd16ae00eeb02250abe5b0df6e852424d9` (base
  origin/main `209be26f`). The smoke itself changed no tracked file. It exposed a Codex migration
  defect, which repair round 3 fixed in `d9f0cd31` (see "Codex migration on this machine" below).
- Run: 2026-09-27, 06:18–06:55 UTC, on one macOS machine (Darwin 27.0.0). The #1101 Main
  Orchestrator ran it in the foreground.
- Raw evidence is in `ac7-evidence/` beside this file: transcripts, exit codes, versions and
  contract sources. The working copies stayed under `/tmp/kw1101-smoke/`.
- `codex-rollout-excerpt-*.jsonl` and `grok-session-excerpt.json` are curated excerpts. The raw
  Codex rollouts are in `/tmp/kw1101-smoke/codex-rollouts/`, and the raw Grok sessions are in the
  machine's `~/.grok/sessions/`. Neither is archived.
- Redaction policy: local-only identifiers that prove nothing about dispatch are replaced with
  `[redacted: local environment]`. These are the connector and MCP names, skill and slash-command
  lists, memory and socket paths from the Claude and Grok init events, and Droid attempt 1's call
  into a user-installed runner Skill. `devin-models.txt` is trimmed to the SWE-2 family. Everything
  that proves dispatch is kept.

## Method

1. **Scratch projects.** Each runtime got its own throwaway git repository,
   `/tmp/kw1101-smoke/<runtime>/`, holding two files:
   - `AGENTS.md` carries the candidate's own rendered dispatch contract and runtime adapter for
     that runtime, byte for byte. `ac7-evidence/build.js` generates it, and
     `ac7-evidence/<runtime>.contract-source` records the source and its sha256. The sources are:
     - Claude: the `## Delegation` through `## Runtime adapter facts` section of `commands/workflow-next.md`.
     - Codex: the same section of `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`.
     - OpenCode and Kimi: the same section of the candidate edition trees, which
       `sync-*-edition.js --write` rendered into an isolated `KAOLA_EDITION_TREE_ROOT=/tmp/kw1101-smoke/tree`.
     - Grok, Cursor, Devin, Droid and DSH: `renderCompactRecoveryPrompt(<runtime>, 'github')`,
       which is the candidate's always-loaded carrier for those hosts.
   - `nonce.txt` holds a random token. The parent can only return it through the child, as long
     as it does not read the file itself.
2. **Prompt.** Every runtime got the same bounded prompt (`ac7-evidence/prompt.txt`):
   - Delegate exactly one item through the host's native subagent mechanism, "as the Delegation
     section and the Runtime adapter facts in AGENTS.md instruct".
   - The child reads `nonce.txt`; the parent does not.
   - The parent then reports `TOOL`, `TYPE`, `CATALOG` and `CHILD_RESULT`.
3. **Pass rule.** A run passes when all three of these hold:
   - The transcript shows the host's native delegation tool call.
   - The child returns the exact nonce. For Codex and Grok this is shown through the child's own
     session.
   - No Kaola-authored profile was the dispatched type, and the call carried no Kaola-pinned
     model or effort.
4. **What was isolated, and what was not.**
   - Nothing was installed into the user's HOME. No runtime config, account or plugin was changed,
     and existing logins were used without being altered. The only per-session switches were the
     permission and tool flags listed per runtime.
   - The runtimes still wrote their own session logs under HOME, for example
     `~/.codex/sessions/.../rollout-*.jsonl` and `~/.grok/sessions/...`.
   - The runs were **not** isolated from home-level instruction files. The table's "Home context"
     column says, per runtime, what else was loaded besides the candidate's `AGENTS.md`.
   - On Grok, Cursor and Droid that home context was the previous release's global rule. It still
     names the Kaola roles and pins, so it pushed toward Kaola roles. The hosts chose built-in
     types anyway.
5. **Old profiles still installed.** This HOME still holds the previous release's installed Kaola
   role profiles, 7 each: `~/.claude/agents/*.md`, `~/.codex/agents/kaola-workflow/*.toml`
   (registered in `~/.codex/config.toml`), `~/.grok/agents/*.md` and `~/.cursor/agents/*.md`. The
   smoke did not touch them. Where a host's catalog listed them, the table says so. No run
   dispatched one of them.

## Results

| Runtime | Version | Command (in `/tmp/kw1101-smoke/<runtime>`) | Exit | Dispatched by (native) | Home context loaded besides the candidate `AGENTS.md` | Evidence excerpt | Limit |
|---|---|---|---|---|---|---|---|
| Claude Code | 2.1.283 | `claude -p "<prompt>" --setting-sources project,local --no-session-persistence --output-format stream-json --verbose --allowedTools "Read,Agent" --max-turns 8` | 0 | `Agent`, `subagent_type: "Explore"` (built-in) | User settings were excluded by `--setting-sources`. The smoke did not establish whether the user rule `~/.claude/rules/kaola-workflow-global.md` was loaded; that file carries no role or pin text | init `agents=["claude","Explore","general-purpose","Plan","statusline-setup"]`; `TOOL_USE Agent {"subagent_type":"Explore",…}` with no model field; child (`parent_tool_use_id=toolu_018zuu…`) ran `Read nonce.txt` → `KW1101-CLAUDE-7560fcd5a8da`; `subagent_stats.by_type={"Explore":1}` | none |
| Codex CLI | 0.157.1 | `codex exec --ignore-user-config --sandbox read-only --json -C . "<prompt>"` (`codex2.*`; the first run added `--ephemeral`, same outcome, no rollout) | 0 | `spawn_agent`, `agent_type: "default"` (built-in) | `config.toml` was ignored. Codex's global `~/.codex/AGENTS.md` is in scope; it carries no role or pin text | parent rollout `spawn_agent {"task_name":"read_nonce","agent_type":"default","fork_turns":"none",…}` with no model field; child rollout `session_meta.source.subagent.thread_spawn {parent_thread_id:01a0e186-b63b…, depth:1, agent_role:"default"}`; child ran `exec_command cat nonce.txt` → `KW1101-CODEX-0438599175e8`; child model `gpt-6-astra`, effort `low` (host defaults) | The catalog still listed the 7 previous-release profiles from `~/.codex/agents/kaola-workflow/`, even with `--ignore-user-config`; the built-in `default` was dispatched |
| Grok CLI | 1.0.41 | `grok -p "<prompt>" --cwd . --output-format streaming-messages-json --max-turns 10 --always-approve` | 0 | `spawn_subagent` (the schema exposed no type parameter; the host ran `general-purpose`) | Parent session `01a0e189-d84e…` `prompt_context.json` loaded `~/.grok/rules/kaola-workflow-global.md` (previous release: names the roles and says profiles pin `model: grok-4.7`) and `~/.claude/rules/kaola-workflow-global.md`. The project `AGENTS.md` was not auto-loaded; the parent read it with `grep`/`read_file` | parent `spawn_subagent {"description":"Read nonce.txt contents",…}` with no model field; child session `01a0e18b-1e4c-72c0-a6cc-43ca5328a984` (`session_kind: subagent`) ran `read_file nonce.txt` with the same call id `call-ffed93c3…` (`grok-session-excerpt.json`; that read shows `parent_tool_use_id: null` in `grok.jsonl`) → `SubagentCompleted {"output":"KW1101-GROK-391b881a688c","subagent_type":"general-purpose","tool_calls":1}`; the child session's model was `grok-4.7`, chosen by the host (the parent ran on `grok-4.7-build`) | Headless default permissions cancelled `spawn_subagent` in attempt 1. `--allow spawn_subagent` did not lift that (attempt 2); only the session flag `--always-approve` did |
| Cursor Agent CLI | 2026.09.26-dd393fe | `cursor-agent -p "<prompt>" --output-format stream-json --workspace . --trust` | 0 | `Task` (`taskToolCall`, `subagentType: unspecified`, reported as `generalPurpose`) | `~/.cursor/rules/kaola-workflow-global.mdc` (`alwaysApply: true`) was in scope. It is the previous release's rule, with the old role route and pin text | `taskToolCall.args {"subagentType":{"unspecified":{}},"model":"grok-4.7-xhigh",…}`, the session's own model set by the host, not the old Kaola pin (`grok-4.7`/medium); result `success`, child `agentId 70e46500…` → `KW1101-CURSOR-c0bd39e9833d`; reported catalog `generalPurpose, explore, shell, cursor-guide, ci-investigator, bugbot, security-review, best-of-n-runner` (built-ins only) | Attempt 1 wrote 0 bytes in 600 s and was stopped with SIGTERM (exit 143). A trivial "OK" probe then succeeded, and the retry passed in 41 s |
| Kimi Code CLI | 2.1.1 | `kimi -p "<prompt>" --output-format stream-json` | 0 | `Agent`, `subagent_type: "explore"` (built-in) | `~/.kimi-code/AGENTS.md` is in scope and carries no role or pin text | `Agent {"subagent_type":"explore",…}` → `agent_id: agent-0, actual_subagent_type: explore, status: completed … KW1101-KIMI-e6a1c1a4cd98`; reported catalog `coder, explore, plan` | none |
| Factory Droid | 0.228.0 | `droid exec --cwd . --auto high --remove-tools Skill,Execute,ApplyPatch,Edit,Create -o stream-json "<prompt>"` | 0 | `Task`, `subagent_type: "explorer"` (built-in) | `~/.factory/AGENTS.md` was loaded. It is the previous release's text, including the "cheaper child" and "default binding" lines | `Task {"subagent_type":"explorer","complexity":"light","await":true,…}` with no model field → `session_id: 09564aaa… KW1101-DROID-bd1702fcfed3`; reported catalog `worker, explorer` | `Task` is blocked below `--auto high` (`droid exec --list-tools`). Attempt 1, at the default level, reached for a user-installed runner Skill, and droid stopped its shell call ("insufficient permission", exit 1). In the passing run the init tool list still included `Execute`, `Edit`, `ApplyPatch`, `Create` and `Skill` despite `--remove-tools`; the transcript shows only the `Task` call |
| OpenCode | 2.0.18 | `opencode run [--standalone] --format json "<prompt>"` | 1 | — (not reached) | — | standalone: `{"type":"error","sessionID":"","error":{"message":"UnexpectedStatus: 502"}}`, twice, and the same for a trivial "OK" probe; `--print-logs` showed only "cli starting". Background service: `Error: Timed out waiting for the background service to start`. `opencode auth list` was killed at 60 s | **Not verified.** The CLI could not create any session on this machine. No login or config change was attempted |
| Devin CLI | 3000.11.3 | `devin -p [--model swe-2-medium] --respect-workspace-trust false --export … -- "<prompt>"` | 1 | — (not reached) | — | `Error: session/set_config_option (model) failed: Resource not found: {"uri": "Model not found: swe-2-high. Available models: "}`, twice with the configured default and once with `--model swe-2-medium`. `devin auth status` said "Logged in", and `devin models list` lists `swe-2-high`/`swe-2-medium` as Free | **Not verified.** Sessions start with an empty model list on the server side. No account or setting change was attempted |
| DSH (DeepSeek Harness) | 0.1.5-rc.3 | `dsh --profile headless "<prompt>"` | 1 | — (not reached) | — | `dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY …` | **Not verified.** No DeepSeek credential is configured, and adding one is an owner/account decision |
| ZCode | desktop app `/Applications/ZCode.app`; no `zcode` CLI on PATH | not run | — | — | — | — | **Not attempted.** There is no headless CLI. The only programmatic route is a runner-owned ACP translator over the desktop app-server, which registers a Coding Plan provider in memory and pins its own host model. That is outside a bounded, config-neutral smoke |

## Codex migration on this machine

The smoke showed that Codex still listed the 7 previous-release profiles. The repair-round-3 review
then found why an upgrade would not remove them.

- **Cause.** Codex had written its own hook-trust tables inside the Kaola block of
  `~/.codex/config.toml`, before `# END kaola-workflow agents`. These are
  `[hooks.state."<home>/.codex/hooks.json:session_start:N:0"] trusted_hash = "sha256:…"`.
  Because of them, the block no longer matched a released body.
- **Effect at `014de4cd`.** The installer kept the block (`mixed_managed_block`) and all 7 profiles
  (`referenced_by_user_config`), but it deleted the ownership record.
- **After the fix (`d9f0cd31`).** The installer proves only the released `[agents.*]` part. It
  retires the markers, those tables and the 7 profiles, and then the record. The two
  `hooks.state` tables stay byte-for-byte, and the result parses as TOML. The record is never
  deleted while it proves a kept profile.
- **Verification.** This was checked on a sandbox copy of this machine's `~/.codex`.
- **Test.** `scripts/test-issue-1101-codex-agent-migration.js` case C14 is red at `014de4cd` and
  green at `d9f0cd31`.
- **The real `~/.codex` is untouched.** Its profiles retire when the user next runs the #1101
  installer.

## Conclusion

- **Six runtimes passed.** Claude Code, Codex, Grok, Cursor, Kimi and Droid each delegated through
  their own native mechanism, with the candidate's rendered contract in the project `AGENTS.md`.
  - Each child returned the nonce.
  - No run dispatched a Kaola-authored type or carried a Kaola-pinned model or effort. The types
    were the host built-ins `Explore`, `default`, `general-purpose`, `generalPurpose`, `explore`
    and `explorer`, and the models were the hosts' own choices.
  - On Grok, Cursor and Droid the previous release's home rule was also loaded, and it names the
    Kaola roles. The hosts still chose built-in types.
- **Four runtimes are not verified.** OpenCode, Devin and DSH could not run a turn on this machine,
  for the reasons in the table. ZCode was not attempted. None of the four is claimed as verified.
- **Host policy, not Kaola behavior.** Grok and Droid only allow headless dispatch after an
  explicit session-level approval.
