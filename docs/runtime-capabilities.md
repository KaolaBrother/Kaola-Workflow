# Runtime Capabilities and Instruction Bridges

This document describes the capability boundary behind Kaola-Workflow's runtime adapters. The
machine-readable authority is `templates/agents/runtime-capabilities.json`; this page explains its
operational consequences and records the first-party evidence used on 2026-08-27.

## One repository authority

Root `AGENTS.md` is the only universal repository instruction authority. A runtime either reads it
directly within its documented scope or reaches it through the smallest native entrypoint bridge.
Runtime-specific files may add native profile syntax, tools, permissions, model/effort settings,
hooks, and install paths. They must not copy the universal contract.

Claude Code is the only supported runtime that needs a bridge. Root `CLAUDE.md` begins with
`@AGENTS.md`, then contains only the Claude-specific overlay. Codex, opencode, Kimi Code, Grok,
Cursor, and ZCode have documented direct `AGENTS.md` support.

## Capability map

| Runtime | Profile lookup and native dispatch | Honest native alternatives | Native limits that affect routing |
| --- | --- | --- | --- |
| Claude Code | Project `.claude/agents/`, user `~/.claude/agents/`, plugin `agents/`, managed/session definitions; `Agent` with named `subagent_type` | Full `general-purpose`; read-only `Explore` and `Plan`; catch-all `claude`; background, isolation, and agent-team options | Effective precedence and the live Agent/Task catalog decide availability; recursive depth remains runtime/configuration owned |
| Codex | The effective project or user `.codex/config.toml` owns managed `[agents.<role>]` registration and points to `.codex/agents/kaola-workflow/<role>.toml`; the current host's `spawn_agent` schema supplies named `agent_type`. Bundled `agents.toml` is installer source, not an installed lookup path | General `default`, implementation-owning `worker`, read-heavy `explorer`, and other types reported by the host | V1/V2 fields, history forking, service tier, nesting, and concurrency are host/version gated; Kaola invents none |
| OpenCode | Project `.opencode/agents/`, user `~/.config/opencode/agents/`, or `opencode.json`; `task` with named `subagent_type`, or direct `@name` | Broad `general`, read-only local `explore`, read-only external-research `scout`; `task_id` resume and experimental background | Default child depth is one unless user configuration raises it; task permissions and effective merged config may hide a route |
| Kimi Code | Project `.kimi-code/agents/` or `.agents/agents/`, user `$KIMI_CODE_HOME/agents/` or `~/.agents/agents/`; `Agent`/`AgentSwarm` with `kaola-role-<role>` | Writable `coder`, read-only `explore`, non-shell `plan`; custom agents and AgentSwarm lists up to 128 items | Built-ins are leaves; custom profiles may allowlist deeper agents. Resume/background remain native options |
| Grok Build | Project `.grok/agents/` or user `~/.grok/agents/`; `spawn_subagent` with named `subagent_type` | Full `general-purpose`; read/shell `explore` and `plan`; background, isolation, resume, cwd, and optional per-call model | Children cannot spawn descendants; the root runtime's other choices remain available |
| Cursor | Documented project/user `.cursor/agents/` plus compatibility paths; explicit `/role`, natural-language routing, or the live Task schema. CLI and App are separate product surfaces; App local vs Cloud are different hosts. `named_roles` is a CLI compatibility summary, not host-universal: prior CLI evidence (`prior_probe_not_re-run_here`) reached project custom types after catalog materialization; measured Cloud hosts stayed built-in-only for Kaola names even when those files were already on disk; local App/IDE is unprobed | Host-dependent: IDE docs describe `Explore`, `Bash`, and `Browser`; prior CLI exposed writable `generalPurpose`, specialist built-ins, and project custom types; measured Cloud catalog-miss exposed `explore` plus `generalPurpose` and specialists, not Kaola names | The current Task catalog is the authority. Omit-model is the named-profile carrier only when the live enum contains the Kaola name. A catalog-miss host uses live members as themselves; files already present plus a built-in-only enum is a capability_gap, not an install miss. `--global` does not write ambient git. Cloud boot-load is unclaimed |
| ZCode | Runtime-loaded user `${ZCODE_HOME:-~/.zcode}/agents/`; project `.zcode/agents/` is installer staging; automatic selection, native `@role`, or the live Agent schema | Full `general-purpose` and read-only `Explore`; foreground/background stays native | Profiles load in a new session and children cannot spawn. The staged project tree is not runtime profile discovery |

Cursor and ZCode do not publish one complete Task/Agent call schema. Their generated guidance names
the verified routes, then tells the orchestrator to use the current session's exposed schema and
catalog. Cursor's IDE documentation, supported CLI, and measured Cloud Agent catalogs demonstrably
expose different built-ins, so no one list is treated as universal. Omit-model is the custom-profile
carrier on a host whose live enum contains Kaola names; on a catalog-miss host a resolver-listed
model slug from that live schema is an effort lever, not an unpublished field. Static request
fields whose names or shapes remain unverified are not emitted.

## Runtime/surface install matrix

Global-first is an observable install-scope contract, not a family slogan. `--global` writes the
runtime's user/global root when that root is the installer's global target; it does not mutate an
ambient Git repository and is not permission to refresh every consumer repo. Project catalogs are
an explicit `--target` (or a non-global project install). `workflow-init` does not install runtime
catalogs. Unknown stays `unknown`; a documented path is not a live named-role PASS.

| Runtime / surface | Global install root | Ambient git write from `--global` | Required project materialization | Named-catalog evidence |
| --- | --- | --- | --- | --- |
| Claude Code | user/plugin (`~/.claude/`) | no | no | documented global profiles |
| Codex | user/project `.codex` plus plugin; global profiles are the install authority | no | no | documented; existing end-to-end global convergence |
| OpenCode | `${OPENCODE_CONFIG_DIR:-~/.config/opencode}` | no | no | documented user config root |
| Kimi Code | `${KIMI_CODE_HOME:-~/.kimi-code}` | no | no | documented; live lookup `documented_live_unverified` |
| Grok CLI | `${GROK_HOME:-~/.grok}` | no | no | documented user `~/.grok/agents/` |
| ZCode | `${ZCODE_HOME:-~/.zcode}` (project tree is staging; runtime loads user agents) | no | no (staging only) | documented user-scope discovery |
| Cursor CLI / local | `${CURSOR_HOME:-~/.cursor}/{agents,commands}` (un-nested) | **no** | yes (explicit `--target`; prior CLI user-only miss) | prior CLI project catalog (`prior_probe_not_re-run_here`; not re-run here) |
| Cursor App / local IDE | same user carrier; App is not inferred from a CLI binary | **no** | `unknown` | `unknown` / `unprobed` |
| Cursor App / Cloud host | local user home is not available remotely | **no** | `unknown` (project/remote route only if proved) | built-in-only (`capability_gap`, not an install miss); Cloud boot-load unclaimed |

Cursor family `named_roles: true` remains a CLI compatibility summary, not host-universal. Disk
`.cursor/agents/` plus a still-built-in-only live Task enum is a `capability_gap`. The sessionStart
`kaola-workflow-ensure-cursor-catalog.js` hook is a CLI derived catalog-ensure, not installer
dual-write; `--global` does not do that hook's job.

## Default tier bindings

The shared role contract supplies only `standard`, `reasoning`, or `heavy`. The generator derives
each tier's role-membership roster directly from `templates/agents/behavior-contracts.json` and
renders that roster beside the adapter's carrier-specific defaults; adapters do not maintain a
second membership list. The runtime adapter exposes the following **default dispatch binding** in
both `workflow-next` and `kaola-workflow-finalize`:

| Intent | Claude | Codex | OpenCode | Kimi | Grok | Cursor | ZCode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| standard | `sonnet`; runtime effort | `gpt-5.6-luna` / `max` | session; optional standard model pin | session model/thinking | inherited model + profile `medium` | profile `grok-4.6[effort=medium]` | profile `GLM-5.3` / `thoughtLevel: high` |
| reasoning | `opus`; runtime effort | `gpt-5.6-sol` / `medium` | optional reasoning-role model pin, otherwise session | session model/thinking | inherited model + profile `high` | profile `grok-4.6[effort=high]` | profile `GLM-5.3` / `thoughtLevel: max` |
| heavy | `fable`; runtime effort | `gpt-5.6-sol` / `high` | classifies with reasoning for the optional pin, otherwise session | session model/thinking | inherited model + profile `xhigh` | profile `grok-4.6[effort=xhigh]` | profile `GLM-5.3` / `thoughtLevel: max` |

This is not a Kaola scheduler or a blanket prohibition on task-sensitive runtime choices. Claude
and Codex may carry a selected default on the native call when their live schema permits it;
OpenCode has no per-call model/effort field; normal Kimi profiles inherit. Kimi's experimental
secondary-model pool is used only when the user explicitly opts into it. Grok effort and the
Cursor/ZCode tier pairs live in the named profile when that profile is actually in the live catalog.
On a Cursor catalog-miss host there is no profile pin; omit-model follows the parent. Native
automatic, background, parallel, resume,
nesting, history, service-tier, and model choices stay available wherever the runtime actually
supports them.

The finalize surface makes the defaults operational rather than leaving them as a lookup table:
its Claude `Agent(...)` examples pass the tier model and retain runtime-default effort, while its
Codex `spawn_agent(...)` examples pass both the tier model and `reasoning_effort`. Those examples do
not outlaw a task-sensitive override, a supported inherited pair, or another native choice exposed
by the active runtime.

## Per-item fallback principle

Dispatch-vs-inline is decided again for every mission item. One absent exact role does not prove all
native child routes are absent and never creates a run-wide inline policy. Inspect the active
runtime's named, built-in, and generic routes. Use one only if its real task, custody, evidence, and
stop boundaries fit the item.

A brief can assign custody to a generic worker, but the worker remains that generic worker; it does
not impersonate a missing `tdd-guide`, reviewer, or other named role. If no adequate native route
exists, inline that item, record the specific `capability_gap`, and reconsider the next item. A
cohesive production owner owns only that production surface; independent research, test authorship,
documentation, and review remain separately dispatchable.

## Adapter inventory

The closed inventory contains seven runtime families and nine adapter variants:

- one Claude adapter;
- three forge-neutral Codex variants (`codex-github`, `codex-gitlab`, `codex-gitea`);
- one each for opencode, Kimi, Grok, Cursor, and ZCode.

With 14 roles, that produces 126 deterministic renders. `behavior_contract_hash` identifies the
runtime-neutral role contract; `resolved_profile_hash` identifies one native render. A shared
behavior mutation must reach every variant for that role. An adapter mutation must affect only its
runtime family. Equal behavior hashes do not promise equal natural-language outputs.

The same capability adapter also owns a routing-only `delegation_guidance` block. The profile
generator renders it into the `runtime-delegation` slot in both next/finalize skeletons: commands
receive Claude guidance, forge-matched skills receive Codex guidance, and each additive edition
replaces the marked block with its own runtime render. `workflow-init` intentionally has no dispatch
block. Routing-only guidance is excluded from the adapter hash, so explaining an already-supported
route does not churn `resolved_profile_hash` or all 126 role profiles.

## First-party evidence

### Claude Code

- [Memory and instruction discovery](https://code.claude.com/docs/en/memory) documents
  `CLAUDE.md`, `@AGENTS.md`, hierarchy, imports, and the under-200-lines recommendation.
- [Custom subagents](https://code.claude.com/docs/en/sub-agents) documents profile paths, dispatch,
  and model inheritance.
- [Hooks](https://code.claude.com/docs/en/hooks) and
  [settings](https://code.claude.com/docs/en/settings) document events and configuration scopes.

### Codex

- [AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md) documents
  direct root-to-cwd instruction loading.
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) documents project/user
  profiles, built-ins, profile model/effort behavior, and native multi-agent dispatch.

### opencode

- [Rules](https://opencode.ai/docs/rules/) documents direct AGENTS support, Claude fallback,
  first-match project discovery, global scope, and instruction globs.
- [Agents](https://opencode.ai/docs/agents/) documents native role profiles, dispatch, permissions,
  and model inheritance.
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
  documents the optional experimental secondary-model pool. Kaola does not enable it.

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

- [Rules](https://cursor.com/docs/rules) documents direct root/nested AGENTS support and precedence.
- [Subagents](https://prod.cursor.com/docs/subagents) documents profile paths, dispatch, nesting, and
  model bracket parameters. Its IDE catalog describes scoped `Explore`, `Bash`, and `Browser` routes;
  it does not publish one portable Task call schema.
- [ACP task notifications](https://prod.cursor.com/docs/cli/acp) document observability events; their
  fields are not treated as proof of the model-call input schema.
- [Hooks](https://cursor.com/docs/hooks) and [CLI usage](https://cursor.com/docs/cli/using)
  document events and CLI instruction loading.

**Supported CLI measurement (runtime evidence, 2026-08-27, `prior_probe_not_re-run_here`).** Cursor CLI
`2026.08.11-e8db854` exposed writable `generalPurpose` as `subagentType.unspecified`, five specialist
types, and all 14 candidate project profiles. It did not expose the IDE-documented
`Explore`/`Bash`/`Browser` catalog. Exact custom dispatch succeeded; standard/reasoning/heavy
resolved to medium/high/xhigh, and parallel Tasks succeeded. A direct child dispatched once more,
while the grandchild lacked Task. A user `~/.cursor/agents/tdd-guide.md` file alone was invisible in an empty project; the
project catalog was reachable. Reopening the CLI process with the same chat after adding a project
profile made it visible, so a new chat is not required; same-process hot load remains unknown.
This CLI probe is **not re-run here**; it is not App local IDE evidence and is not inferred from
the presence of `Cursor.app`.

A separate local Cursor CLI `2026.08.25-3e8eec8` run at candidate
`0501f2527e04c1ecd896df418e50c97b279aa568` confirmed the named-profile path: `implementer`,
`code-reviewer`, and `planner` resolved to `cursor-grok-4.6-medium`,
`cursor-grok-4.6-high`, and `cursor-grok-4.6-xhigh`, respectively. All three calls exited
successfully without repository mutation. This CLI evidence is prior
(`prior_probe_not_re-run_here`), separate from the Cloud catalog measurement, and does not
establish Cloud boot-load or local App/IDE behavior.

**Cloud Agent measurement (runtime evidence, 2026-08-27, #1036).** Two Cloud parents, both
`originalModelName: cursor-grok-4.6-xhigh`, exposed a built-in-only Task enum with **no** Kaola
custom types and **no** parent-authored `subagentType.custom.name` field. This is App-started
remote Cloud evidence, not local App/IDE proof:

- Consumer `financial-agent` after 14 git-tracked project `.cursor/agents/` files existed
  (`bc-58906f62-9bc3-4b87-b546-3ff8f77ae3b6`): `generalPurpose`, `explore`, `cursor-guide`,
  `bugbot`, `security-review`, `best-of-n-runner`. `generalPurpose` succeeded with omit-model,
  `inherit`, and resolver-listed `cursor-grok-4.6-high-fast`. `cursor-grok-4.6-high` was
  resolver-rejected. CLI profile slugs `cursor-grok-4.6-medium` / `xhigh` were absent from that
  resolver list. Mid-session catalog install in the same process did not refresh the enum.
- Producer `Kaola-Workflow` new Cloud chat (`bc-01a0426b-3f61-7e04-b801-b9b913c09401`): the same
  built-in-only shape, plus `explore`, `computerUse`, and `videoReview`. No project `.cursor/agents/`
  is git-tracked in this producer.

`named_roles: true` remains the CLI-with-project-catalog fact (profiles are still generated). It is
not host-universal. Files already present plus a still-built-in-only enum is a `capability_gap`, not
an install miss. Cloud boot-load of project profiles is **unclaimed**; this measurement does not
separate same-process hot-load from boot-load on a consumer that already had the 14 files before
the session started. Local App/IDE remains `unknown`/`unprobed`. `--global` does not write an
ambient Git repository; project catalogs require explicit `--target`.

### ZCode

- [Agents](https://zcode.z.ai/en/docs/agents) documents the exact two-source AGENTS merge and
  identifies `CLAUDE.md` as onboarding migration input rather than ongoing authority.
- [Subagents](https://zcode.z.ai/en/docs/subagents) documents user-only profiles, Agent dispatch,
  `model` plus `thoughtLevel`, and the no-child-spawn boundary.
- [Hooks](https://zcode.z.ai/en/docs/hooks) documents the seven current events, the user
  `~/.zcode/cli/config.json` carrier, and that workspace hook configuration is ignored.

## Explicit unknowns

- opencode's hard or advisory AGENTS size limit;
- ZCode's AGENTS size limit and `ZCODE_HOME` relocation semantics;
- Cursor same-process profile hot load, Cloud boot-load of project `.cursor/agents/` into the Task
  enum, local App/IDE Agent named-catalog behavior (`unknown`/`unprobed`), and catalog behavior
  beyond the prior `2026.08.11-e8db854` full CLI probe and the `2026.08.25-3e8eec8` named-profile
  CLI probe (`prior_probe_not_re-run_here`; Cloud catalog-miss on the 2026-08-27 hosts above
  is measured, not unknown);
- exact ZCode 3.9.1 behavior. The public install page exposed 3.8.1 during this research, so this
  documentation does not present 3.9.1 as locally or publicly verified;
- any precedence or conflict behavior not stated by the evidence above.
- Cursor's and ZCode's unpublished Task/Agent JSON call fields; the live runtime schema is the
  authority when present.

An unknown stays `unknown`; it is not converted into support by a generated file existing on disk.
