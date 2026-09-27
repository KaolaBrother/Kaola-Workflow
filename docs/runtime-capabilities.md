# Runtime Capabilities and Instruction Bridges

This document describes the capability boundary behind Kaola-Workflow's runtime adapters. The
machine-readable authority is `templates/agents/runtime-capabilities.json` (`schema_version: 2`),
loaded and validated by `scripts/runtime-adapter-facts.js`; this page explains its operational
consequences and records the first-party evidence used through 2026-09-19. The authority records
facts only: instruction loading, hook scope, native subagent routes and their availability, the
compact-recovery carrier, and install scope.

## One repository authority

Root `AGENTS.md` is the repository's project-instruction authority. An Agent maintains it so that
project instructions supplement verified local facts and constraints; a project exception must
state its scope and must not weaken higher-priority instructions or host safety boundaries.
Universal Workflow behavior is supplied by the machine-global carrier. A runtime reads `AGENTS.md` directly within its documented scope; a runtime that cannot may keep the smallest native entrypoint bridge. Runtime-specific files may add native
command or skill syntax, hooks, and install paths, but do not copy the machine-global contract.

Claude Code reads `AGENTS.md` directly from v2.1.277, so no runtime needs a repository bridge on the
normal path. Any repository `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` counts as a project
instruction file and shadows `AGENTS.md` unless it only imports it, so this repository ships none.
Sessions that cannot read `AGENTS.md` (older versions; Amazon Bedrock / Vertex / third-party
providers or telemetry disabled, which do not fetch the feature flag; the first session after an
install or upgrade; or the `claude-md` / `managed-only` project-instructions setting) may keep an
owner-chosen `CLAUDE.md` containing `@AGENTS.md` as a stated exception. The workflow states that
environment requirement and does not provision or maintain the file. Codex, opencode, Kimi Code,
Grok, Cursor, ZCode, Devin, Droid, and DSH have direct `AGENTS.md` support.

## Capability map

Kaola-Workflow installs no subagent profile on any runtime; every route below is the host's own.

| Runtime | Native dispatch | Native routes | Native limits that affect routing |
| --- | --- | --- | --- |
| Claude Code | `Agent`; `subagent_type` names a type from the current catalog, including any agent the user, project, or another plugin defines | Built-in `general-purpose`; read-only `Explore` and `Plan`; catch-all `claude`; background or isolated children and optional agent teams | Inspect the current Agent type catalog and its effective precedence; Claude Code owns child model and effort defaults and permits recursive subagents to its native, host-configurable depth limit |
| Codex | The `spawn_agent` schema this host exposes; `agent_type` names a type the host reports | General `default`, implementation-owning `worker`, read-heavy `explorer`, and other host-reported types; supported `fork_turns` and service-tier choices | Multi-agent exposure, V1/V2 call schema, type catalog, history forking, nesting, and concurrency are host-owned; child model and reasoning effort follow Codex's defaults and the user's configuration |
| OpenCode | `task` with a `subagent_type` from the runtime's own catalog, or direct `@name` | Broad `general`, read-only local `explore`, read-only external-research `scout`; `task_id` resume and experimental background | Default child depth is one unless user configuration raises it; task permissions and effective merged config may hide a route; children inherit the session model and variant |
| Kimi Code | `Agent` (resume/background) or `AgentSwarm` (up to 128 parallel items) | Writable `coder`, read-only `explore`, non-shell `plan`, used under their actual boundaries | Built-ins are leaves; children inherit the session model and effort; the user-owned `[secondary_model]` section stays opt-in |
| Grok Build | `spawn_subagent`; `subagent_type` names a type from the live catalog | Full `general-purpose`; read/shell `explore` and `plan`; background, isolation, resume, and cwd options | Children cannot spawn descendants; child model and effort follow Grok's defaults; the root runtime's other choices remain available |
| Cursor | `Task`; `subagent_type` names a type from the live catalog. CLI and App are separate product surfaces; App local vs Cloud are different hosts | Host-dependent: measured hosts exposed writable `generalPurpose` and host-specific built-ins; some hosts document scoped `Explore`, `Bash`, or `Browser` | The live Task catalog is authoritative; a CLI catalog reload requires a new process. Cloud requires an Agent-confirmed environment setup, manual Save, and a new same-repository parent. `install-all.sh` is local-only and never deploys Cloud |
| ZCode | Automatic selection or native `@`; optional call fields follow the live Agent schema | Full `general-purpose` and read-only `Explore`; foreground/background stays native | Children follow the main Agent's model and cannot spawn children; the root runtime's other native routes remain available |
| Devin CLI | Live schema: `run_subagent` / `read_subagent` with the session-start profile catalog, or the measured Fusion `sidekick` route | `subagent_explore`, parent-model `subagent_general`, and user-owned profiles routed by the host | Catalog fixed at session start; default nesting is one; background tools needing new approval are denied; the host router owns the model |
| Droid CLI | Live `Task` schema | General-purpose `worker`, read-only `explorer`, and custom droids from `~/.factory/droids/`; sibling Task calls can run in parallel | A spawned route resolves its model from the invoking route and the parent's complexity routing and inherits the parent when unpinned; spawned routes cannot spawn descendants; background and resume remain runtime-owned |
| DSH | Live `subagent` / `subagent_fork` tools | Fresh `subagent` (no parent conversation) and `subagent_fork`; background, depth, and child model fields follow the live schema | User DSH config is owner-owned; this edition writes no settings, `.env`, credentials, or hooks; post-compaction AGENTS.md reload is unmeasured |

Cursor and ZCode do not publish one complete Task/Agent call schema. Their adapter facts name the
verified routes, then tell the orchestrator to use the current session's exposed schema and
catalog. Cursor's IDE documentation, supported CLI, and measured Cloud Agent catalogs demonstrably
expose different built-ins, so no one list is treated as universal. Static request fields whose
names or shapes remain unverified are not emitted.

Cursor keeps its field spaces separate: the controller call uses only the flat fields exposed by
the live `Task` schema, including `subagent_type`; `providerOptions.cursor.modelName` is
post-dispatch provider evidence; and internal provider encodings such as `subagentType.custom.name`
are not construction instructions.

## Runtime/surface install matrix

Global-first is an observable install-scope contract, not a family slogan. `--global` writes the
runtime's user/global root when that root is the installer's global target; it does not mutate an
ambient Git repository and is not permission to refresh every consumer repo. Project carriers are
an explicit `--target`. `workflow-init` does not install runtime
carriers. Unknown stays `unknown`; a documented path is not a live PASS.

| Runtime / surface | Global install root | Ambient git write from `--global` | Required project materialization | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | user/plugin (`~/.claude/`) | no | no | documented |
| Codex | user `~/.codex` plus plugin | no | no | documented |
| OpenCode | `${OPENCODE_CONFIG_DIR:-~/.config/opencode}` | no | no | documented |
| Kimi Code | `${KIMI_CODE_HOME:-~/.kimi-code}` | no | no | documented |
| Grok CLI | `${GROK_HOME:-~/.grok}` | no | no | documented |
| ZCode | `${ZCODE_HOME:-~/.zcode}` | no | no | documented |
| Droid CLI | `${DROID_HOME:-~/.factory}` | no | no | documented; Droid 0.220.0 direct-load probe |
| DSH | `${DSH_HOME:-~/.dsh}` | no | no | documented; DSH 0.1.5-rc.2 CLI/dump-config probe |
| Cursor CLI / local | `${CURSOR_HOME:-~/.cursor}/commands` (un-nested) | **no** | yes (explicit `--target`; all four claim trees spawn installed `--ensure-target` after `applyDemonstratedCursorCliHost` when identity is `cursor`/`cli`/`local`: explicit argv, or omitted product/host plus a living CLI-shaped ancestor `…/YYYY.MM.DD-<hash>/index.js` or `cursor-agent` **and** `--workspace` sharing git identity with cwd; generic `--workspace` on an unrelated tool skips; `--worker-dir` present with or without `--workspace` skips; no `--workspace` skips; Darwin unquoted `ps args=` remainder until next `--<flag>` reconstitutes paths with spaces, Linux `/proc` NUL cmdline unchanged; `--cursor-workspace` when set, else recorded `main_root` on resume, else claim.js `getRoot()` on first claim) | live CLI Task catalog, 2026-08-27 |
| Cursor App / local IDE | same documented user carrier; App is not inferred from a CLI binary | **no** | `unknown` | live App Task catalog, 2026-08-27 |
| Cursor App / Cloud host | saved remote environment managed by Cursor | **no** | yes; a confirmed environment-setup Agent materializes the selected repository before Save | live saved-Build Task catalog from a new same-repository parent, 2026-08-28 |

On the measured standalone Cursor CLI only, Workflow `startup`/`resume` run Repo prep — the
installed safe materializer `--ensure-target` — from all four claim trees (canonical GitHub,
COMMON_SCRIPTS Codex copy, GitLab
hand-port, Gitea hand-port) after `applyDemonstratedCursorCliHost`. Explicit `--product`/`--host`
still win. Generated startup/resume fences do not stamp `--product cli --host local`; claim.js
stamps in-process before the single claim and on resume without re-claim. When `--runtime cursor`
and both are omitted, a living CLI-shaped ancestor (`…/YYYY.MM.DD-<hash>/index.js` or
`cursor-agent`) **and** `--workspace <opened dir>` that shares git identity with cwd stamps
`product=cli`, `host=local`, and `cursorWorkspace=<that dir>` and ensure runs against that dir.
Generic `--workspace` on an unrelated tool is not CLI and skips. `--worker-dir` present, with or
without `--workspace`, is App-like and skips; no `--workspace` is unknown and skips. Darwin
unquoted `ps args=` reconstitutes `--workspace` as the remainder until the next `--<flag>` (full
path including spaces); Linux `/proc` NUL cmdline is unchanged. The documented generated
CLI-positive fence is unstamped `node "$CLAIM_JS" startup --runtime cursor --target-issues
"$KAOLA_TARGET_ISSUES"`. Resume is unstamped `node "$CLAIM_JS" resume --runtime cursor` with
`kaola_script` / `CLAIM_JS=` outside any `if`. There is no `cursorCliHostGateOpen`. Real Cursor CLI
`2026.09.02-c22c1a3` does not export `CURSOR_PRODUCT`, `CURSOR_HOST`, `KAOLA_CURSOR_*`, or
`CURSOR_WORKSPACE`; operators do not pre-export those names. Those claim.js no longer
`unknown_flag`. Helper spawn is that edition's install-authority `--forge=` (`github` /
`gitlab` / `gitea` on the matching claim tree); `--forge` is not a claim.js operator flag.
Claim.js target is `--cursor-workspace` when set, else recorded `main_root` on resume, else
invoking `getRoot()` (`git rev-parse --show-toplevel`) on first claim — not nested cwd and not the
write-worktree unless they are that demonstrated opened dir. Repo prep materializes the project's
commands, Rule, and hooks, never agents, and there is no pre-dispatch materialization before a
child. The helper derives
bytes from the receipt-verified global authority, is a no-op when `status: current`, and returns
`materialized` when it writes (the claim/resume `cursor_prep` report carries
`restart_boundary: "new_process_same_chat"`); it fails before writing
on missing/stale authority, collision, symlink, or modified ownership. File-ready bytes are not live
Task catalog proof or same-process hot-load proof. Cursor App local and Cloud
do not inherit that CLI rule. There is no `sessionStart` materializer and no `--global` dual-write.
`install-all.sh` installs only its current machine. Only an Agent that has established it is in
Cursor Cloud environment setup may install the remote authority and selected repository, report
the successful Build ID, and ask the user to click Save. A new top-level Agent in that same
repository must visibly match the Build before its catalog is trusted.
The global-contract transaction installs one local user `alwaysApply` Rule shared by CLI and App.
Cloud setup explicitly materializes identical bytes in the selected repository because the remote
host cannot inherit a local user carrier. It installs no Cursor hook.

## Compact recovery carriers

The invariant is model-visible content, not hook symmetry: after a real compact and before the next
model inference, restore the active Workflow Next or Finalization operation rule plus the dispatch
contract. No runtime needs Kaola context before or after every tool.

| Family | Measured compact-recovery carrier |
| --- | --- |
| Claude / Codex | One `SessionStart(source=compact)` command directly prints static V2: global contract, operation reload route, mandatory dispatch contract, and runtime adapter. No compact-time JS or tool/Stop recovery hooks. |
| Grok | One machine-global native Rule at `$GROK_HOME/rules/kaola-workflow-global.md`. Rules enter every interaction while passive hook stdout is ignored. Edition installs emit no duplicate Rule or compact/tool/Stop hook. |
| Cursor CLI / App local / App Cloud | One V2 `alwaysApply` Rule: local CLI/App share the user carrier; Cloud explicitly materializes identical bytes in the selected repository. Cloud has no `sessionStart`, and `preCompact` cannot inject. Cursor hooks stay empty. |
| OpenCode | No new Issue #1044 prompt lifecycle; the initial command remains authority and the existing compact-state behavior is unchanged. |
| Kimi | No Kaola prompt lifecycle; upgrade removes the retired managed PostCompact block. |
| ZCode | No prompt lifecycle; the measured 1,000,000-token session and a live PreToolUse self-lock argue against a speculative compact gate. Under #1079 the `${ZCODE_HOME:-~/.zcode}/AGENTS.md` managed region renders the full compact-recovery prompt (its prefix survives compaction, KPR #75), and recovery re-invokes `/kaola-workflow-next` or `/kaola-workflow-finalize` as a native Skill tool call (ZCode 3.12.3 + KPR ACP 0.3.3). |
| Devin CLI | One `UserPromptSubmit` command hook injects a short pointer to the managed global carrier only when V2 is absent. This carrier is used because measured compaction drops AGENTS/rules and `PostCompaction` does not inject `additionalContext`. |
| Droid CLI | No Kaola prompt-lifecycle hook is installed. The personal `~/.factory/AGENTS.md` carrier and invoked skill are the authority; post-compaction reload is unmeasured, so recovery re-invokes the skill and resumes from durable state. |

Across all families, ordinary tool use adds 0 Kaola recovery bytes and starts 0 Kaola recovery
subprocesses. Recovery-enabled runtimes receive an already-generated artifact, reread durable state,
then completely reload the installed Workflow Next or Finalization prompt. There is no compact-time
JS, native session token, sidecar, chunk bitmap, or acknowledgement state.

## Native subagents only

Kaola-Workflow defines no subagent roles, role profiles, or subagent model or effort bindings on
any runtime ([ADR 0029](decisions/0029-native-subagents-only.md), #1101). Each adapter's
`delegation_guidance` records only the host's native routes and their availability. The host's own
defaults, limits, and permissions, and the user's explicit instructions, decide model, effort,
tools, nesting, concurrency, isolation, and resume. Where a native schema requires a type, the
orchestrator passes one the host reports, under its real meaning. Kaola installing no profile is
never evidence that the host lacks subagent capability. Native automatic, background, parallel,
resume, nesting, history, service-tier, and model choices stay available wherever the runtime
actually supports them.

Dispatch-vs-inline is decided again for every mission item; one item's choice never establishes a
run-wide default. A cohesive production owner owns only that production surface; independent
research, test authorship, documentation, and review remain separately dispatchable.

Before #1101, Claude, the three Codex variants, Grok, and Cursor installed generated Kaola role
profiles with one pinned subagent model; ADR 0029 records what was retired.

## Adapter inventory

The closed inventory contains ten runtime families and twelve adapter variants:

- one Claude adapter;
- three forge-neutral Codex variants (`codex-github`, `codex-gitlab`, `codex-gitea`);
- one each for opencode, Kimi, Grok, Cursor, ZCode, Devin, Droid, and DSH.

Every adapter renders commands or skills, any measured hooks, and the global contract only; none
installs a Kaola role profile. `scripts/runtime-adapter-facts.js` rejects every retired role,
profile, or model-binding capability (`named_roles`, `role_dispatch`, `subagent_default`,
`model_carrier`, `profile_format`, `tool_binding`, `dispatch_conformance`, `capability_gap`, …) and
renders each adapter's `delegation_guidance` into the `KW-RUNTIME-DELEGATION` section beside the
dispatch contract in both next/finalize surfaces — inline, or through the always-loaded global
carrier on runtimes whose generated commands defer to it. `workflow-init` intentionally has no
dispatch block.

## First-party evidence

### Claude Code

- [Memory and instruction discovery](https://code.claude.com/docs/en/memory) documents direct
  `AGENTS.md` reading from v2.1.277, the rule that any repository `CLAUDE.md` shadows it unless the
  file imports `@AGENTS.md`, hierarchy, imports, and the under-200-lines recommendation.
- [Custom subagents](https://code.claude.com/docs/en/sub-agents) documents profile paths, dispatch,
  and model inheritance.
- [Hooks](https://code.claude.com/docs/en/hooks) and
  [settings](https://code.claude.com/docs/en/settings) document events and configuration scopes.
- **Live probe (2026-09-19, issue #1080).** Claude Code `2.1.277`, asked via
  `claude -p --model haiku --max-turns 1` in a fresh `git init` directory to quote any probe token in
  its project instructions, answered `KAOLA-AGENTS-ONLY-7731` when only `AGENTS.md` carried it. With
  a `CLAUDE.md` carrying `KAOLA-CLAUDE-OVERLAY-4402` and no import beside the same `AGENTS.md`, it
  answered `KAOLA-CLAUDE-OVERLAY-4402` only. The shadowing rule is real, so this repository ships no
  root `CLAUDE.md`.

### Codex

- [AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md) documents
  direct root-to-cwd instruction loading.
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) documents project/user
  profiles, built-ins, profile model/effort behavior, and native multi-agent dispatch.

### opencode

- [Rules](https://opencode.ai/docs/rules/) documents direct AGENTS support, Claude fallback,
  first-match project discovery, global scope, and instruction globs.
- [Agents](https://opencode.ai/docs/agents/) documents native agent definitions, dispatch,
  permissions, and model inheritance.
- [Configuration](https://opencode.ai/docs/config/) and
  [plugins](https://opencode.ai/docs/plugins/) document locations and event support.

### Kimi Code

- [Custom agents](https://moonshotai.github.io/kimi-code/en/customization/agents.html) documents
  native profile precedence, Agent/AgentSwarm, subagent allowlists, and the ignored `model` field.
  The key project paths are `.kimi-code/agents/` and `.agents/agents/`; user paths are
  `$KIMI_CODE_HOME/agents/` and `~/.agents/agents/`.
- [`context.ts` at `@moonshot-ai/kimi-code@0.38.0`](https://github.com/MoonshotAI/kimi-code/blob/%40moonshot-ai%2Fkimi-code%400.38.0/packages/agent-core-v2/src/agent/profile/context.ts)
  is the first-party source for AGENTS discovery and the non-truncating 32 KiB warning.
- [Data locations](https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html),
  [configuration files](https://moonshotai.github.io/kimi-code/en/configuration/config-files.html),
  and [hooks](https://moonshotai.github.io/kimi-code/en/customization/hooks.html) document the
  remaining scope and event behavior.
- [Configuration files](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files.html)
  documents the optional secondary-model section. Kaola does not enable it.
- **Live subagent model inheritance (2026-09-21).** Kimi Code `2.0.2` served a spawned worker on
  `kimi-code/kimi-for-coding` @ effort `max` — byte-identical to the session `default_model` and
  `[thinking]` effort — with `modelSource: "inherited"`, because no `[secondary_model]` section is
  configured. `[secondary_model]` is a registered first-class section (no experimental gate) whose
  unset default is inherit-primary.
- **Live global lookup (2026-08-27, before #1062).** Kimi Code `0.38.0` selected a then-installed
  user-global custom agent in two unrelated empty Git repositories with no project `.kimi-code` or
  `.agents` catalog, confirming native user-global custom-agent lookup. Kaola no longer installs
  one.

### Grok Build

- [Project rules](https://docs.x.ai/build/features/project-rules) documents direct AGENTS loading,
  precedence, compatible filenames, and full-file behavior.
- [Subagents](https://docs.x.ai/build/features/subagents) and the first-party
  [source guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md)
  document native agents, dispatch, paths, model/effort resolution, and nesting.
- The first-party [`AgentDefinition` source](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-agent/src/config.rs)
  defines the accepted agent fields and its camelCase serialization, including `promptMode`,
  `permissionMode`, `agentsMd`, `capabilityMode`, `tools`, `disallowedTools`, `model`, and `effort`.
- [Hooks](https://docs.x.ai/build/features/hooks) documents the event surface.

### Cursor

- [Rules](https://cursor.com/docs/rules) documents direct root/nested AGENTS support and precedence,
  and says project Rules are persistent system-level prompt context; `Always Apply` includes a rule
  in every chat/model context.
- [Subagents](https://prod.cursor.com/docs/subagents) documents profile paths, dispatch, nesting, and
  model bracket parameters. Its IDE catalog describes scoped `Explore`, `Bash`, and `Browser` routes;
  it does not publish one portable Task call schema.
- [ACP task notifications](https://prod.cursor.com/docs/cli/acp) document observability events; their
  fields are not treated as proof of the model-call input schema.
- [Hooks](https://cursor.com/docs/hooks) says `sessionStart` can emit `additional_context` for a new
  composer but is unavailable in Cloud, while `preCompact` is observational and cannot modify the
  compacted model context. [Cloud best practices](https://cursor.com/docs/cloud-agent/best-practices)
  says repository `.cursor/rules/*.mdc` rules apply to every Cloud Agent using the repository.
  [CLI usage](https://cursor.com/docs/cli/using) documents CLI instruction loading.

Together these official contracts establish the cross-host carrier shape: an `alwaysApply` Rule.
The global transaction writes local `~/.cursor/rules/kaola-workflow-global.mdc` once for CLI/App;
Cloud setup writes identical bytes to the selected repository's
`.cursor/rules/kaola-workflow-global.mdc`. The edition installer owns neither copy and removes its
retired duplicate. Its hook mapping is deliberately empty; neither a local-only `sessionStart` nor
non-injecting `preCompact` is used as a false universal mechanism.

**Historical Cursor catalog measurements (runtime evidence, 2026-08-27/28, before #1101).** These
probes ran while Kaola still installed Cursor role profiles; they are kept for the native host
boundaries they measured, not as a Kaola catalog contract.

- **Standalone CLI** `2026.08.25-3e8eec8`: writable `generalPurpose` appeared as
  `subagentType.unspecified`; parallel Tasks and one descendant dispatch generation worked; a
  project custom profile was reachable while a user-only profile was invisible in an empty project;
  reopening the CLI process with the same chat discovered a newly added project profile, and
  same-process hot load remains unknown. With no per-call model override, a custom child resolved
  `cursor-grok-4.6-medium` in the raw Task carrier.
- **App local IDE** `3.17.21` (`8f2a112cb2845a97b75fd932ea5c470579ca4060`): the live catalog exposed
  the built-ins plus project custom types. The App result exposed neither child model/effort nor
  profile source, so App global discovery, required materialization, reload, and child-model
  observability remain unknown.
- **App-started Cloud** (#1036/#1039/#1041): parents without an installed environment Build exposed
  a built-in-only Task enum — `generalPurpose`, `explore`, `cursor-guide`, `bugbot`,
  `security-review`, `best-of-n-runner`, and on the producer also `computerUse` and `videoReview` —
  even when project profiles were git-tracked on the selected branch, or when only user-global
  profiles existed in a saved Build. `generalPurpose` succeeded with omit-model, `inherit`, and
  resolver-listed `cursor-grok-4.6-high-fast`; `cursor-grok-4.6-high` was resolver-rejected, and a
  mid-session catalog install did not refresh the enum. The environment-setup Build
  `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2` installed the remote machine authority and
  materialized the selected repository before the user saved it; a new same-repository parent
  (`bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d`) visibly used that Build and exposed a 23-type Task
  catalog including the then-installed custom types. The child model and profile source remained
  unobservable.

### Droid CLI

- [AGENTS.md discovery](https://docs.factory.ai/harness/agents-md) documents repository
  `AGENTS.md` loading plus personal carriers under `~/.factory/`, `~/.agents/`, and `~/.agent/`.
- [Skills](https://docs.factory.ai/harness/skills) documents `.factory/skills/<name>/SKILL.md`,
  user/model invocation, and the personal `~/.factory/skills/` scope.
- [Subagents](https://docs.factory.ai/harness/subagents) documents native `Task` dispatch,
  built-in `worker` / `explorer` routes, and custom droids under `.factory/droids/` or
  `~/.factory/droids/`.
- [Hooks](https://docs.factory.ai/harness/hooks) documents the available hook files and lifecycle
  events. This edition deliberately installs none.
- **Live probe (2026-09-16, issue #1078).** Droid CLI `0.220.0` loaded this repository's
  `AGENTS.md` and `CLAUDE.md` at session start and exposed `~/.factory` as the personal carrier
  home. The measured global install passed `--check`, and a read-only `droid exec` probe reported
  `kaola-workflow-finalize`, `workflow-init`, `workflow-next`, and the loaded machine-global
  carrier. Post-compaction carrier reload remains unmeasured; the adapter therefore records it as
  `unknown` and uses skill re-invocation for recovery.

### DSH (DeepSeek Harness)

- [CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md) documents
  the `dsh` launcher, profiles under `$DSH_HOME/profiles`, headless one-shot, web UI, and
  `--dump-config` / `--dump-default-config`.
- [Home paths](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/home-paths/README.md)
  documents `$DSH_HOME` over `~/.dsh`.
- [Agent instructions](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.md)
  documents user-global `$DSH_HOME/AGENTS.md` plus the project `AGENTS.md`/`CLAUDE.md` chain.
- [Skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)
  documents `<project>/.dsh/skills`, `$DSH_HOME/skills`, kebab-case `name`/`description`, and
  `/name` invocation.
- [Subagent tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md)
  documents the live `subagent` tool. Shipped profiles also mount `subagent_fork`.
- **Live probe (2026-09-19, issue #1081).** DSH CLI `0.1.5-rc.2` answered `--version`,
  `--profile headless --help`, and `--profile web --dump-default-config`. Both dumped trees
  include agent-instructions, skill-filesystem, tool-skill, and tool-subagent. A hermetic
  `DSH_HOME` install of this edition writes skills, support scripts, and `AGENTS.md` only.
  User `settings.yaml`, `.env`, and credentials were not opened. Post-compaction carrier reload
  and a live LLM catalog remain unmeasured.

### ZCode

- [Agents](https://zcode.z.ai/en/docs/agents) documents the exact two-source AGENTS merge and
  identifies `CLAUDE.md` as onboarding migration input rather than ongoing authority.
- [Subagents](https://zcode.z.ai/en/docs/subagents) documents user-only profiles, Agent dispatch,
  `model` plus `thoughtLevel`, and the no-child-spawn boundary.
- [Hooks](https://zcode.z.ai/en/docs/hooks) documents the seven current events, JSON subprocess
  protocol, user carrier, and a project-hook limitation that the local 3.10.1 App no longer follows.

**Local application measurement (2026-08-30).** `/Applications/ZCode.app` is version/build
`3.10.1/3.10.1.6272`. Its bundled CLI and App proved project hook trust/loading, and the session UI
reported 32,730 / 1,000,000 tokens. An interim approved Issue #1044 configuration then drove a real
`/workflow-next` run into a self-lock: PreToolUse denied the binding helper that was meant to satisfy
the gate. The final adapter treats this as falsification of the hook-gated design. It installs no
Kaola hook declaration, strips receipt-owned legacy project/user rows, and preserves foreign
configuration. Ordinary tool use therefore has exactly 0 Kaola prompt-recovery hook invocations and
0 injected recovery bytes. The installed App/schema is verified; live named-subagent dispatch is
not.

**Native Skill measurement (2026-09-19, issue #1079).** ZCode 3.12.3 + GLM-5.3 via the KPR ACP
adapter 0.3.3 ([kaola-project-runner#94](https://github.com/KaolaBrother/kaola-project-runner/pull/94)):
workspace `.zcode/skills/<name>/SKILL.md` with `name:` + `description:` frontmatter is natively
discovered, and `/<name>` produces an ACP `tool_call title=Skill` that loads the body (unique-marker
verified; `/$<name>` also routes). A real `/compact` completes; a previously-uninvoked Skill and a
re-invoked Skill both emit fresh Skill tool calls after it, and ZCode's AGENTS.md prefix survives
compaction (KPR #75). `~/.zcode/skills/` user scope resolves the same way. ACP exposes no
`available_commands_update`; a real 1M auto-compact leg was not run and stays unverified.

## Explicit unknowns

- opencode's hard or advisory AGENTS size limit;
- ZCode's AGENTS size limit and `ZCODE_HOME` relocation semantics;
- Cursor CLI same-process catalog hot load; App local-IDE global discovery, materialization
  necessity, reload, and child-model observability; Cloud child-model observability and catalog
  behavior beyond the saved-environment lifecycle measured above;
- live ZCode 3.10.1 named-subagent dispatch and model resolution. The installed App and hook schema
  are locally verified, but no standalone `zcode` executable is on PATH for an end-to-end Agent leg;
- any precedence or conflict behavior not stated by the evidence above.
- Cursor's and ZCode's unpublished Task/Agent JSON call fields; the live runtime schema is the
  authority when present.

An unknown stays `unknown`; it is not converted into support by a generated file existing on disk.
