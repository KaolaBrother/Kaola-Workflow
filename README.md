# Kaola-Workflow

Bookkeeping for coding agents. Give Kaola-Workflow a forge issue and the agent claims the work,
records a resumable Mission List, runs it with native subagents when useful, validates the resulting
bytes, and settles the issue.

The workflow supports **Claude Code, Codex, OpenCode, Kimi Code, Grok CLI, Cursor, and ZCode** on
**GitHub, GitLab, and Gitea**. Runtime-specific model, dispatch, hook, and installation behavior is
measured rather than flattened into a lowest-common-denominator abstraction.

Codex dispatch defaults are `gpt-5.6-luna`/max for standard work and `gpt-6-astra`/medium or
`gpt-6-astra`/high for reasoning or heavy work. Codex role profiles omit a fixed model and inherit
the active host policy; other runtimes keep their native mappings.

## Why it exists

A capable coding agent can decompose, dispatch, review, and repair work without a scheduler. What it
cannot reconstruct after a dead session is which outcomes were finished, which were in flight, and
where their evidence was expected to land. Kaola-Workflow persists exactly that coordination gap:

- one `mission-list.md` per run;
- four fields per mission: `item`, `status`, `dispatched`, and `result`;
- three write moments: create, before dispatch, and close;
- no plan grammar, DAG, execution engine, or dispatch quota.

The forge remains the backlog. Git remains the content record. The Agent keeps ownership of
decomposition, runtime routing, product judgment, review, and the final done verdict.

## What ships

- Resumable single-issue and multi-issue runs with collision-safe claims and optional worktrees.
- Fourteen shared role behaviors rendered into native profiles for every supported runtime.
- GitHub, GitLab, and Gitea claim, closure, merge-sink, and PR/MR fallback surfaces.
- Local, candidate-bound validation receipts and an exact-commit release transaction.
- Runtime-native compact recovery for the measured compact-risk hosts, without pre/post tool prompt
  injection or inference-time prompt-composition scripts.
- A machine-global workflow contract plus Agent-maintained repository instructions containing only
  verified project facts and stricter local constraints.

See the [documentation index](docs/README.md) for architecture, APIs, runtime evidence, edition
guides, conventions, and design decisions.

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

- Codex `kaola-workflow` plugin manifest: `10.2.1`
- Codex `kaola-workflow-gitlab` plugin manifest: `10.2.1`
- Codex `kaola-workflow-gitea` plugin manifest: `10.2.1`
- Claude Code command install, GitHub edition: `10.2.1`
- Claude Code command install, GitLab edition: `10.2.1`
- Claude Code command install, Gitea edition: `10.2.1`

Update every local runtime from the synchronized checkout:

```bash
cd ~/kaola-workflow
git pull --ff-only
./install-all.sh --yes --forge=github
./install-all.sh --check
```

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
   reads the repository, and maintains concise project instructions grounded in actual commands,
   tests, documentation, and stricter local constraints. Rewriting existing owner-authored
   instructions requires owner authorization; installation checks remain a separate release-tree
   operation.
2. Run `workflow-next` to select or resume work, claim it, write the Mission List, and execute the
   current frontier. A specifically named issue always wins over automatic selection.
3. Run `kaola-workflow-finalize` when all missions are done. It validates the frozen candidate,
   reconciles documentation, writes closure evidence, archives the run, commits, and sinks.

A typical request is simply:

```text
Use Workflow Next to finish issue #42, then finalize it.
```

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

## Runtime and forge support

| Runtime | Native workflow carrier | Install entry |
|---|---|---|
| Claude Code | commands, `CLAUDE.md` bridge, native agents | `./install.sh` |
| Codex | skills, direct `AGENTS.md`, native agents | matching plugin plus profile installer |
| OpenCode | commands and native agents | `./install-opencode.sh` |
| Kimi Code | skills and native agents | `./install-kimi.sh` |
| Grok CLI | commands, named agents, persistent recovery Rule | `./install-grok.sh` |
| Cursor CLI/App/Cloud | commands, named agents, persistent recovery Rule | `./install-cursor.sh` |
| ZCode | commands and named agents | `./install-zcode.sh` |

All forge-aware installers accept `--forge=github|gitlab|gitea`. Codex chooses the forge through
the installed plugin entry. For measured profile discovery, model/effort carriers, dispatch schema,
background/parallel/resume limits, hook behavior, instruction precedence, and known unknowns, read
[Runtime Capabilities](docs/runtime-capabilities.md) and the relevant edition guide:

- [OpenCode](docs/opencode-edition.md)
- [Kimi Code](docs/kimi-edition.md)
- [Grok](docs/grok-edition.md)
- [Cursor](docs/cursor-edition.md)
- [ZCode](docs/zcode-edition.md)

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

Kaola-Workflow is released under the MIT License; see [LICENSE](LICENSE). Six shared role contracts
retain pinned Everything Claude Code provenance under the same license. Their source and attribution
are recorded outside agent-facing prompts in [Agent Sources](docs/agents-source.md).
