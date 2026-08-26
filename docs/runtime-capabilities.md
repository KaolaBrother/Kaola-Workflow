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

| Runtime | Project instruction loading | Role carrier and dispatch | Model / effort boundary | Scope and limits |
| --- | --- | --- | --- | --- |
| Claude Code | Native `CLAUDE.md`; Kaola bridges with `@AGENTS.md` | Markdown/YAML profiles in `.claude/agents/` or `~/.claude/agents/`; Agent/Task dispatch | Profile model or inheritance; subagents inherit extended thinking | Ancestor guidance and lazy subdirectory loading; imports recurse four levels; under 200 lines is advisory |
| Codex | Direct `AGENTS.md`, layered from repository root toward cwd | Generated TOML custom-agent profiles; named dispatch | Inherit by omission; host policy owns tools and task-sensitive overrides | Three forge adapters render byte-identical role behavior for GitHub, GitLab, and Gitea |
| opencode | Direct project `AGENTS.md`; global `~/.config/opencode/AGENTS.md` | Markdown profiles under `.opencode/agents/` or user config; named subagents | Profile model or session inheritance; provider options may carry effort | Startup uses the first local instruction file found while walking upward; extra/nested files use configured instruction globs; size limit unknown |
| Kimi Code | Direct global and project `AGENTS.md` discovery | Native Markdown/YAML profiles under project `.kimi-code/agents/` or `.agents/agents/`, or user `$KIMI_CODE_HOME/agents/` / `~/.agents/agents/`; Agent/AgentSwarm dispatch | Current profile `model` field is ignored; session model/thinking normally carries | Project discovery concatenates the git-root-to-cwd chain; 32 KiB is warning-only, not truncation |
| Grok Build | Direct global rules, then repository-root-to-cwd project rules | Markdown agents under `.grok/agents/` or `~/.grok/agents/`; `spawn_subagent`; native camelCase profile fields plus `model`, `effort`, and `tools` | Role/persona/parent resolution; Kaola profiles inherit model and carry native effort | Deeper rules win; official docs state files load in full without a size limit; child nesting depth is one |
| Cursor | Direct root and nested `AGENTS.md` | Markdown/YAML under `.cursor/agents/` or `~/.cursor/agents/`; Task/automatic/explicit dispatch | Exact profile model with bracketed effort parameters or inheritance | Nested rules combine with parent guidance and more specific rules win; general guidance is under 500 lines; two child levels |
| ZCode | Direct user-global `~/.zcode/AGENTS.md`, then workspace-root `AGENTS.md` | Beta user-scope Markdown/YAML profiles under `~/.zcode/agents/`; Agent or `@` dispatch | Profile `model` plus `thoughtLevel`; both inherit unless a model is explicit | Exactly the two AGENTS sources; no ancestor/child/import scan; subagents cannot spawn; hooks execute from user `${ZCODE_HOME:-~/.zcode}/cli/config.json`, not workspace config; AGENTS size and `ZCODE_HOME` relocation are unknown |

## Adapter inventory

The closed inventory contains seven runtime families and nine adapter variants:

- one Claude adapter;
- three forge-neutral Codex variants (`codex-github`, `codex-gitlab`, `codex-gitea`);
- one each for opencode, Kimi, Grok, Cursor, and ZCode.

With 14 roles, that produces 126 deterministic renders. `behavior_contract_hash` identifies the
runtime-neutral role contract; `resolved_profile_hash` identifies one native render. A shared
behavior mutation must reach every variant for that role. An adapter mutation must affect only its
runtime family. Equal behavior hashes do not promise equal natural-language outputs.

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
- [Subagents](https://cursor.com/docs/subagents) documents profile paths, dispatch, nesting, and
  model bracket parameters.
- [Hooks](https://cursor.com/docs/hooks) and [CLI usage](https://cursor.com/docs/cli/using)
  document events and CLI instruction loading.

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
- the exact Cursor version installed in this workspace (no local binary was present);
- exact ZCode 3.9.1 behavior. The public install page exposed 3.8.1 during this research, so this
  documentation does not present 3.9.1 as locally or publicly verified;
- any precedence or conflict behavior not stated by the evidence above.

An unknown stays `unknown`; it is not converted into support by a generated file existing on disk.
