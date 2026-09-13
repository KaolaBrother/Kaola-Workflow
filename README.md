# Kaola-Workflow

Kaola-Workflow turns forge issues into verified, recoverable software delivery. Agents own the
planning and execution; Kaola-Workflow preserves the work, its evidence, and the path to completion
across coding runtimes. Reusing an issue name keeps historical archives separate;
finalization and sink follow the current run’s claim and archive destination.

Give it a forge issue: the agent claims the work, records a resumable Mission List, runs it with
native subagents when useful, validates the resulting bytes against the exact candidate, and settles
the issue through finalize, archive, and sink.

The workflow supports **Claude Code, Codex, OpenCode, Kimi Code, Grok CLI, Cursor, ZCode, and Devin CLI** on
**GitHub, GitLab, and Gitea**. Runtime-specific model, dispatch, hook, and installation behavior is
measured rather than flattened into a lowest-common-denominator abstraction.

## Token usage at a glance

Workflow prompts use part of your context before task work begins. The table below estimates that
**static prompt footprint for v12.0.0**, so you can compare runtimes when planning your token budget.

| Runtime | Workflow Next | Finalize | Global rule | Combined, one copy each |
|---|---:|---:|---:|---:|
| Claude Code | 2,860 | 3,220 | 490 | 6,570 |
| Codex | 2,810 | 3,080 | 490 | 6,380 |
| Cursor | 2,380 | 2,640 | 1,550 | 6,570 |
| Grok CLI | 2,000 | 2,370 | 1,370 | 5,740 |
| Devin CLI | 2,030 | 2,430 | 1,340 | 5,800 |
| Kimi Code | 2,710 | 3,110 | 490 | 6,310 |
| OpenCode | 2,720 | 3,110 | 490 | 6,320 |
| ZCode | 2,730 | 3,110 | 490 | 6,330 |

**Approximate tokens, not a hard budget or measured task consumption.** We count whitespace-separated
words in the generated GitHub edition, multiply by **1.5**, and round each component to the nearest
10 tokens; the total sums those displayed components. This is a rough planning heuristic, not a
model tokenizer measurement. Your model's tokenizer may produce different counts.

The total includes Next, Finalize, and the global rule once each. It excludes Init, role prompts,
separate compact-recovery injections, vendor system prompts, project instructions, conversation
history, tool results, reasoning, and output. Repeated requests, retained context, caching, and
compaction affect actual usage and billing. Cursor, Grok, and Devin keep their dispatch guidance in
the global carrier, which explains their larger global-rule column.

See [measurement details and reproduction](docs/prompt-size.md) for raw counts and scope. Pending
prompt reductions are not included; refresh these figures from the final generated candidate when
prompt content changes.

## Install, update, and remove

Clone the repository, then install all supported local runtime carriers for the selected forge:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git ~/kaola-workflow
cd ~/kaola-workflow
./install-all.sh --yes --forge=github
```

Use `--forge=gitlab` or `--forge=gitea` where appropriate. Codex additionally needs one matching
marketplace plugin entry; Cursor Cloud needs its environment saved and a fresh top-level Agent.
Those one-time steps, per-runtime/project scopes, hook trust, verification, and forge prerequisites
are in the [installation guide](docs/installation.md).

Release surface versions (maintained by the release transaction):

- Codex `kaola-workflow` plugin manifest: `12.0.0`
- Codex `kaola-workflow-gitlab` plugin manifest: `12.0.0`
- Codex `kaola-workflow-gitea` plugin manifest: `12.0.0`
- Claude Code command install, GitHub edition: `12.0.0`
- Claude Code command install, GitLab edition: `12.0.0`
- Claude Code command install, Gitea edition: `12.0.0`

Update every local runtime from the synchronized checkout:

```bash
cd ~/kaola-workflow
git pull --ff-only
./install-all.sh --yes --forge=github
./install-all.sh --check
```

Upgrading to 12.0.0 (the lean-orchestrator release) requires this reinstall on **every** machine:
the 14-role roster and the per-tier model bindings are retired, so only the new install removes
the seven retired profiles and deploys the new adapter blocks. Cursor Cloud is not covered by a
local reinstall — its saved environment must be rebuilt before the new catalog takes effect
there.

`install-all.sh` refreshes Kaola-Workflow runtime carriers. The terminal npm Codex CLI is a separate
installation: update it with `npm install --global @openai/codex`, then verify with `codex --version`.
The ChatGPT desktop application bundles its own Codex binary and is updated independently; neither
surface is installed or upgraded by `install-all.sh`.

The shared `./uninstall.sh --forge=all` removes Claude surfaces, global Kaola Codex hooks, and Codex
profiles from the directory scope in which it is run. Remove an additive runtime from its install
scope, for example `./install-cursor.sh --global --uninstall`; the corresponding OpenCode, Kimi,
Grok, and ZCode installers accept the same pattern. Codex plugin/profile scope, owner-byte
preservation, and exact commands are documented in the
[installation guide](docs/installation.md#uninstall).

## Quick start

Kaola-Workflow has three user-facing entries. Invoke them through the active runtime's native
command or skill carrier.

1. Run `workflow-init` once in a repository. The Agent consumes the runtime-loaded global contract,
   reads the repository, and maintains concise project instructions that supplement verified local
   facts and constraints. A project exception must state its scope and must not weaken
   higher-priority instructions or host safety boundaries. Rewriting existing owner-authored
   instructions requires owner authorization; installation checks remain a separate release-tree
   operation.
2. Run `workflow-next` to select or resume work, claim it, write the Mission List, and execute the
   current frontier. A specifically named issue always wins over automatic selection. Next carries
   task-clarity guidance: continue when the outcome and its acceptance basis are already clear and
   authorized, investigate missing facts before asking, and ask the user only about an unresolved
   scope, authorization, or acceptance decision; a research or design request does not authorize
   implementation. It also carries a verification-scope judgment: explain by what communication
   needs, verify by behavioral impact, and a small change never lowers acceptance. See
   [docs/task-quality.md](docs/task-quality.md).
3. Run `kaola-workflow-finalize` when all missions are done. It validates the frozen candidate,
   reconciles documentation, writes closure evidence, archives the run, commits, and sinks.

A typical request is simply:

```text
Use Workflow Next to finish issue #42, then finalize it.
```

## Runtime and forge support

| Runtime | Native workflow carrier | Install entry |
|---|---|---|
| Claude Code | commands, `CLAUDE.md` bridge, seven named agents | `./install.sh` |
| Codex | skills, direct `AGENTS.md`, seven TOML agents per plugin | matching plugin plus profile installer |
| OpenCode | commands; vendor-native dispatch (no Kaola role profiles) | `./install-opencode.sh` |
| Kimi Code | skills; vendor-native dispatch (no Kaola role profiles) | `./install-kimi.sh` |
| Grok CLI | commands, seven named agents, persistent recovery Rule | `./install-grok.sh` |
| Cursor CLI/App/Cloud | commands, seven named agents, persistent recovery Rule | `./install-cursor.sh` |
| ZCode | commands; vendor-native dispatch (no Kaola role profiles) | `./install-zcode.sh` |
| Devin CLI | inline skills; `run_subagent` via the vendor harness (no Kaola role profiles) | `./install-devin.sh` |

Each runtime that installs Kaola role profiles declares one subagent default binding: Claude
profiles pin `model: sonnet`; Codex TOML profiles pin `model = "gpt-5.6-luna"` and
`model_reasoning_effort = "max"`; Grok pins `model: grok-4.6` / `effort: medium`; Cursor pins
`grok-4.6[effort=medium]`. OpenCode, Kimi Code, ZCode, and Devin CLI install no Kaola role
profiles and dispatch through the vendor's native harness. A rendered profile carries only its
behavior body; the receipt digests that verify it (`behavior_sha256`,
`adapter_capabilities_sha256`, `resolved_profile_sha256`) live in
`agents/generated-agent-manifest.json`, never in agent-visible text.

All forge-aware installers accept `--forge=github|gitlab|gitea`. Codex chooses the forge through
the installed plugin entry. For measured profile discovery, model/effort carriers, dispatch schema,
background/parallel/resume limits, hook behavior, instruction precedence, and known unknowns, read
[Runtime Capabilities](docs/runtime-capabilities.md) and the relevant edition guide:

- [OpenCode](docs/opencode-edition.md)
- [Kimi Code](docs/kimi-edition.md)
- [Grok](docs/grok-edition.md)
- [Cursor](docs/cursor-edition.md)
- [ZCode](docs/zcode-edition.md)
- [Devin CLI](docs/devin-edition.md)

Cursor CLI host detection and profile preparation are documented in the
[Cursor edition guide](docs/cursor-edition.md). CLI, App, and Cloud retain their native setup and
reload boundaries.

## Why it exists

A capable coding agent can decompose, dispatch, review, and repair work without a scheduler. What it
cannot reconstruct after a dead session is which outcomes were finished, which were in flight, and
where their evidence was expected to land. Kaola-Workflow persists exactly that coordination gap:

- one `mission-list.md` per run;
- four fields per mission: `item`, `status`, `dispatched`, and `result`;
- three write moments: create, before dispatch, and close;
- no plan grammar, DAG, execution engine, or dispatch quota.

The forge remains the backlog. Git remains the content record. The Agent keeps ownership of
decomposition, runtime routing, product judgment, review, and the final done verdict. A child
reply in prose does not prove a dispatch; native events and the resulting work answer separate
questions (see [Devin evidence limits](docs/devin-edition.md#dispatch-and-model-ownership)).

## What ships

- Resumable single-issue and multi-issue runs with collision-safe claims and optional worktrees.
- Seven role behaviors — each with its own positioning, deliverable, unique custody, and stop
  condition — rendered into native profiles on the runtimes where a Kaola profile carries a real
  cost lever (Claude, Codex, Grok, Cursor).
- GitHub, GitLab, and Gitea claim, closure, merge-sink, and PR/MR fallback surfaces.
- Local, candidate-bound validation receipts and an exact-commit release transaction.
- Runtime-native compact recovery for the measured compact-risk hosts, without pre/post tool prompt
  injection or inference-time prompt-composition scripts.
- A machine-global workflow contract plus Agent-maintained repository instructions that supplement
  verified local facts and constraints. A project exception must state its scope and must not
  weaken higher-priority instructions or host safety boundaries.

See the [documentation index](docs/README.md) for architecture, APIs, runtime evidence, edition
guides, conventions, and design decisions.

## Durable state

Active runs live under `kaola-workflow/<run>/`:

```text
kaola-workflow/<run>/
├── workflow-state.md   # issue, claim, branch, worktree, sink, closure facts
├── mission-list.md     # goal plus item/status/dispatched/result
└── .cache/             # run-selected evidence
```

On resume, trust completed `result` entries. For an in-flight dispatch, look for its promised output:
close the mission if it landed; otherwise redispatch unless the original worker is demonstrably
alive. Finalization, issue closure, archive, and sink are lifecycle records, not Mission List items.

The complete durable-state and bundle contracts are in
[Workflow State Contract](docs/workflow-state-contract.md); the rationale is
[ADR 0017 — The Mission List](docs/decisions/0017-the-mission-list.md).

## Documentation and development

Start from [docs/README.md](docs/README.md). The main references are:

- [Architecture](docs/architecture.md) — component boundaries and data flow.
- [API](docs/api.md) — script CLIs, envelopes, schemas, configuration, and environment variables.
- [Conventions](docs/conventions.md) — testing, generation, review, release, and Git rules.
- [Agent Sources](docs/agents-source.md) — shared role behavior and provenance.
- [Installation](docs/installation.md) — scopes, runtime setup, updates, diagnostics, and uninstall.
- [Decisions](docs/decisions/) — design record, including the Mission List and Agent-owned project
  instructions.

For repository work:

```bash
npm test
node scripts/simulate-workflow-walkthrough.js
```

Generated commands, skills, runtime profiles, and forge mirrors are render targets. Edit their
sources under `templates/` or the shared kernel and regenerate them. The full script surface and
release transaction are documented in [API](docs/api.md) and [Conventions](docs/conventions.md).

## License

Kaola-Workflow is released under the MIT License; see [LICENSE](LICENSE). The seven role
contracts are Kaola-authored; their sources and history are described in
[Agent Sources](docs/agents-source.md).
