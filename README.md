# Kaola-Workflow

**Bookkeeping for coding agents.** You hand Kaola-Workflow an issue; it claims the work, writes the run's **mission list**, and runs it. The mission list is one file per run — an H1 carrying the goal, then items with four fields: `item` / `status` / `dispatched` / `result`. That is the whole coordination mechanism, and it exists so a session that dies mid-flight can be resumed by a successor with no context at all. Runs on seven agent runtimes — **Claude Code, Codex, [opencode](https://opencode.ai), [Kimi Code](https://www.kimi.com/code), Grok CLI, Cursor, and ZCode** — across the **GitHub, GitLab, and Gitea** forges.

## Philosophy

**The agent can already do this. Write down what it cannot remember.**

A capable orchestrator decomposes work, dispatches subagents, runs independent things concurrently, and does not drift — with no framework at all. What it cannot survive is being killed mid-run: content lives in git, but **what was in flight** and **what remained to do** live only in a process, and die with it.

So the design is sized to exactly that gap. Coordination state moves onto disk, and nothing else is added:

- **One file per run**, `kaola-workflow/{project}/mission-list.md`. Not a plan, not a schedule — a record.
- **Four fields per item**: the mission in one line of prose, its status, what went out and to whom, and where the outcome landed.
- **Three write moments**: created, dispatched, closed. `dispatched` is written *before* the work goes out, because everything between dispatch and return is the window in which a process dies.
- **No script required.** A file convention suffices.

That creed in one line:

**Make coding agents do more — more automation, less manual toil, faster results — without ever trading away accuracy.**

It is codified as five **first-principles axioms**, canonical in `templates/axioms.md` and reproduced here byte-for-byte. When they conflict, the higher one wins.

## First Principles

The numbered axioms are tie-breakers, applied in priority order whenever a situation is not already settled; the paragraphs that follow them are standing defaults that hold whether or not anything else settles the case.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when nothing else covers a situation, resolve it by walking these axioms in order and record a one-line derivation alongside the work. Recording it is useful and never required.

**Check the premise before it shapes the work:** an issue is a claim recorded earlier against a tree that has since moved, so establish what is true *now* at the place it points and let the measurement rather than the filed text decide what gets built. The usual outcome is neither *right* nor *wrong* but right-with-a-detail-that-misroutes — a stale locator, a miscounted set, a clause that breaks if executed literally — so carry the measurement forward, never a bare verdict. Where the two disagree the issue gets corrected, not quietly worked around. Nothing inspects that you did this.

**Dispatch production; keep decisions:** the orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default and only the deciding stays inline; weigh the economics per case by judgment, with no justifier, evidence line, or approval attached.

**Parallel by default:** concurrency is the standing default for independent work, and work that genuinely feeds other work runs in order because it has to. Nothing inspects that choice — no proof, no evidence line, no cap: you can tell the difference, and the frontier is in front of you. Width stays sized to the true shape of the task rather than pushed as wide as it will go.

That block is not a paraphrase of the canonical one — it is a byte-identical copy, and so are the generated `workflow-init` surfaces this project ships and the root `CLAUDE.md` it runs on. The test suite holds that set to the same bytes (`testAxiomBlockByteIdentity` prints the count), which means the axioms you just read are themselves one of the guarded surfaces.

A few beliefs follow from that order.

**An item is a mission, not a specification.** It carries no role, no file list, no dependency edge, no model, no width. Carrying evidence is the point — *"investigate whether X still holds; the claim is at `foo.js:120`"* is an item; a schedule is not. The orchestrator decides how to run an item **when it reaches it**, with everything it has learned by then.

**Concurrency carries no machinery at all.** There is no disjointness proof and no serializer taxonomy. The frontier is not computed — it is the list minus done minus in-flight, visible by reading.

**Tools stay tools.** Subagents and worktrees are offered and declinable — decline either and the run still finishes. A tool you cannot decline and still finish would be a gate wearing a tool's name, and there are none.

**Measure, then report; the agent owns the outcome.** Validation, the paths a run changed, and the sink all *measure* and hand the finding to the orchestrator instead of slamming a door. That is not "proceed anyway": moving the verdict moves the **accountability**, onto the only party with enough context to fix what it finds.

**Humans decide what only humans should.** Questions of fact are resolved autonomously. Irreversible and value-laden calls — a destructive Git operation, a deployment, a credential action, a schema or public-API change, reorganizing your issues — are put to you in conversation, before they are taken.

**Correctness *is* efficiency.** Independent review and local, self-owned validation catch mistakes before they compound. Preventing rework is the cheapest optimization there is, and no external pipeline is ever the judge of done.

## What you get

- **One resumable file per run** — a successor with no context reads it top to bottom: the H1 is the goal, `done` items and their `result` are what is known, `in-flight` items are the only decision to make, `todo` is what remains.
- **A claim that is bookkeeping, not a gate** — it records which issues, branch and worktree the run owns, so parallel sessions do not collide.
- **Subagents and worktrees** as declinable tools, with 14 vendored roles across all seven runtimes.
- **Multi-model** across Claude Code, Codex, opencode, Kimi Code, Grok CLI, and Cursor, right-sizing the model per dispatch (Grok inherits the session model and stamps standard/reasoning/heavy effort at `medium`/`high`/`xhigh`; Cursor renders standard/reasoning/heavy frontmatter pins at medium/high/xhigh and leaves `Task` cards model-free).
- **Independent review** — generated, runtime-neutral reviewer contracts (`code-reviewer`, `adversarial-verifier`, `security-reviewer`) with deterministic profile identity across runtimes.
- **Self-owned validation** — the four local edition chains produce a candidate-bound receipt; a consumer repo records its own verdict instead. Nothing waits on a hosted pipeline.
- **A finalization that reports** — validation classification, the paths the run changed, and the sink's findings all land on the envelope *and* durably in the archived summary.
- **Seven agent runtimes** (Claude Code, Codex, opencode, Kimi Code, Grok CLI, Cursor, ZCode) across **three forges** (GitHub, GitLab, Gitea).

## Overview

```
   /workflow-init            once per project — generates CLAUDE.md,
        │                    AGENTS.md, and the docs map
        ▼
   /workflow-next            per cycle
        │
        ├─ pick the work     you read the backlog and rank it; the user's
        │                    named issue always wins
        ├─ claim             kaola-workflow/{project}/workflow-state.md
        │                    + a repo-local worktree
        ├─ write the list    kaola-workflow/{project}/mission-list.md
        │                    — the goal, then one item per mission
        └─ run it            decide dispatch-or-do-it-yourself when you
             │               reach each item; three write moments
             ▼
   /kaola-workflow-finalize  validate · dock docs · summary · closure ·
                             archive · commit · sink. Every step measures
                             and reports; you own the outcome.
```

## Autonomy and goal contract

`/goal` is a **platform** stop-condition wrapper, not a Kaola mechanism — it is
the outer loop around the workflow. Use it in either Claude Code or
Codex to keep a session working on one objective across many turns.

### Using `/goal` with Claude Code or Codex

`/goal` originated in Codex and was adopted by Claude Code. Both
platforms treat it the same way: you type a goal in plain
language and the session keeps working without pausing until the goal is
satisfied (or the platform's budget runs out).

**Claude Code.** `/goal` is built in from v2.1.139+. An evaluator model
checks the goal at the end of every turn; the session continues up to a
default cap of 500 turns. Examples:

```text
/goal use the kaola-workflow commands to finish issue #42.
/goal finish issue #42 — every mission-list item done, validation green,
      the issue closed and the folder archived.
/goal use kaola-workflow to finish all remaining open issues, one at a
      time, until the open issue list is empty.
```

**Codex.** `/goal` is gated behind a feature flag in current Codex CLI
versions — enable it by setting `goals = true` under `[features]` in
`~/.codex/config.toml`. The runtime continues until the goal reaches
`complete` or `budget_limited`. Examples:

```text
/goal use the workflow-next skill to finish issue #42.
/goal use the workflow-next skill to finish all remaining open issues.
```

`/goal` is optional. Invoking a command or skill directly — for example
`Use the workflow-next skill to finish issue #42.` — is enough on its own;
the run is driven by its mission list, not by a platform continuation flag.

Separately, `KAOLA_GOAL` is the operator-side goal text. Finalization records
that a goal was **declared**, with its source — never that it was met; nothing
in this workflow checks whether a goal was achieved.

Routine workflow bookkeeping is autonomous. Generated project/folder names,
collision suffixes such as `-2`, cache/artifact paths, and ordering that does
not affect user intent should be chosen automatically and recorded. Essential
technical decisions should be made with the orchestrator's own judgment, then
applied and recorded. Prompt the user only for true external authorization or
materially user-owned choices, such as risky Git synchronization, destructive
rewrites,
credential or deployment actions, or issue reorganization.

Each `/workflow-next` run targets one explicitly selected set of issues —
normally three to five, sometimes one — and ends at Finalization closure,
which closes every issue in the set. The agent does not auto-continue past
that set; further work requires explicit user direction — typically stated
upfront in `/goal` text (for example, "finish all remaining open issues"),
which then drives one `/workflow-next` run per set until the scope is met.

## Workflow roles

The workflow is built from a small, shared set of **roles**. All seven runtimes provide the same role set — Claude Code installs vendored agents, Codex installs native `.toml` role profiles, opencode generates `.opencode/agent/` definitions, Kimi Code generates `kaola-role-*` role-contract Skills, Grok CLI generates named `.grok/agents/` definitions, Cursor generates named `.cursor/agents/` definitions, and ZCode generates named `.zcode/agents/` definitions — so the roles and model tiers below apply across runtimes. On Grok, every subagent inherits the session model while canonical standard/reasoning/heavy classes emit `medium`/`high`/`xhigh` effort; on Cursor the canonical `sonnet`/`opus`/`fable` classes render medium/high/xhigh frontmatter pins and command cards omit per-call `model`.

Claude Code's agents are vendored directly from this repository; the prompts are derived from Everything Claude Code (ECC) under the MIT License (see [docs/agents-source.md](docs/agents-source.md) for the pinned upstream commit, attribution, and refresh procedure).

| Agent | Role kind | Tier |
|-------|-----------|------|
| `code-explorer` | Read — code-fact discovery | standard |
| `investigator` | Read — investigations that must RUN: builds, tests, reproductions, measurements, bisects, A/B legs (executes, never edits tracked files) | standard |
| `knowledge-lookup` | Read — external docs (when needed) | standard |
| `planner` | Planning — plan authoring | heavy |
| `code-architect` | Planning — design | heavy |
| `tdd-guide` | Write — per-task TDD executor | standard |
| `implementer` | Write — implementation without test-first ceremony; refactors, scaffolding, config, UI, migrations | standard |
| `build-error-resolver` | Write — validation repair when needed | reasoning |
| `code-reviewer` | Gate — review | reasoning |
| `security-reviewer` | Gate — review (conditional) | reasoning |
| `doc-updater` | Finalization — docs | standard |
| `adversarial-verifier` | Read-only falsifier; graph-derived investigation or change gate | reasoning |
| `synthesizer` | Parallel-write convergence (reconciles concurrent write legs by intent on a real merge conflict) | reasoning |
| `metric-optimizer` | Bounded metric-ratchet for optimize-shaped work (propose → apply → gate → measure → accept or revert) | standard |

**Roles are tools, not assignments.** No role is pre-assigned to anything: the orchestrator reaches
for one by name at the moment it needs it, and running an item inline instead is an equally valid
call. There is no planning agent and no bookkeeping agent — the orchestrator writes the mission list
and runs the finalize transaction itself.

The **Tier** column is each role's *static classification*. For Claude Code and opencode it also
selects the `DEFAULT_AGENT_MODELS` fallback when a dispatch names no tier. Claude Code's install
path has **no install-time model axis**: every install ships the same assignment, and the
orchestrator may pass a different model on any single dispatch. The additive runtimes have their
own model-and-effort rules, documented in their edition guides.

For an **installed Claude Code** agent the tier above is the only thing that decides: install
rewrites each installed agent's frontmatter to `model: inherit`, so the resolver's
frontmatter step never fires and the chain is `dispatch → DEFAULT_AGENT_MODELS
→ inherit`. Each role's *source* frontmatter carries the identical value and
governs exactly one case — an ad-hoc dispatch pointed at this repository's
`agents/` directory rather than the installed one. The two are kept byte-equal by
`test-agent-model-resolver.js`, so a role runs at the same tier whichever
directory it was dispatched from.

Codex keeps those role classifications unchanged but resolves them explicitly at each subagent
spawn: `standard` dispatches as `gpt-5.6-luna` / `max`, `reasoning` dispatches as
`gpt-5.6-sol` / `medium`, and `heavy` dispatches as `gpt-5.6-sol` / `high`. Those mappings are
fixed: a role's tier pair never changes for an individual task, except the one reviewer-class
heavy re-dispatch carve-out on the next/finalize routing pin. Other runtimes retain their
edition-specific model routing.

Claude reviewer-class roles rest on their `opus` profile. The `/workflow-next` and
`/kaola-workflow-finalize` command runtime permits one bounded re-dispatch at the approved
`fable` profile when a reasoning-tier review fails to finish or the surface is judged complex
before dispatch; every reviewer dispatch states the surface under review and what acceptance
looks like. Generated additive-runtime command surfaces preserve the scope-and-acceptance packet
but omit that dynamic reviewer escalation because those runtimes have no equivalent per-call
override.

Three roles are locally authored rather than derived from ECC:

- `adversarial-verifier` — a refute-by-default skeptic generated from the same versioned reviewer
  behavior source as `code-reviewer`. It is always read-only (touches zero repository files). Point
  it at a claim you want broken, not at work you want approved.
- `synthesizer` — a reasoning-class write-convergence specialist. Reach for it when two concurrent
  write legs collide and the reconciliation is by *intent* rather than by textual hunks; it is
  pointless for cleanly-disjoint legs.
- `metric-optimizer` — a bounded ratchet for *direction-not-destination* work ("make it faster /
  smaller / less flaky") where no acceptance threshold is knowable up front. Each iteration proposes
  a change, applies it, runs the regression gate, measures the metric (median-of-K), and accepts or
  reverts against the running baseline until a stop condition fires.

One rule about review is worth stating because it is judgment, not machinery: a review gate reviewing
its own writer-context is no gate. If the same session did the work, take the finding to the user
rather than self-issuing a pass.

For Claude Code, when agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. That rendered literal is what puts the role on its assigned
model: a dispatch that carries no `model=` runs on the session's own model
instead.

### Named-role handoffs

When `/workflow-next` or `/kaola-workflow-finalize` dispatches a named role, main supplies a
bounded, falsifiable brief that is self-sufficient from the brief, the installed role profile,
and named repository evidence; inherited conversation is not required. The packet carries only
task-specific facts, authority, scope, acceptance, a locator, and stop conditions. Universal
behavior remains owned by the profile, while main keeps product intent, integration, and the final
done verdict. The canonical wording lives in the [routing slot](templates/routing/slots.js) and is
inserted by the [next](templates/routing/next.skeleton.md) and
[finalize](templates/routing/finalize.skeleton.md) skeletons.

## Installation

### Runtimes and forges

Kaola-Workflow installs along two independent axes:

- **Agent runtime** — where the coding agent runs: **Claude Code**, **Codex**, **opencode**, **Kimi Code**, **Grok CLI**, or **Cursor**. Each has its own installer.
- **Git forge** — where issues and PRs/MRs live: **GitHub** (default), **GitLab**, or **Gitea**.

| Runtime | Installer | Forge selection |
|---|---|---|
| **Claude Code** | `./install.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **Codex** | `codex plugin marketplace add` + the matching plugin entry | per-plugin entry (`kaola-workflow`, `-gitlab`, `-gitea`) |
| **opencode** | `./install-opencode.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **Kimi Code** | `./install-kimi.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **Grok CLI** | `./install-grok.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **Cursor** | `./install-cursor.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **ZCode** | `./install-zcode.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |

**Install/refresh every runtime at once — `./install-all.sh`.** To reinstall every runtime from the current checkout in one step, run `./install-all.sh --yes` (defaults: `--forge=github`, `--global`). It is a thin orchestrator: it runs each per-runtime installer above unchanged, prints the short SHA being installed, and ends with a per-runtime **PASS/FAIL summary table** — exiting non-zero if any runtime fails (continue-through by default; `--strict` aborts at the first failure). Skip one with `--skip=<runtime[,...]>` (logged, never silent) and preview without changes via `--check`. This entrypoint never folds the additive editions into `install.sh`/`npm test`/`edition-sync` — the per-runtime installers remain the individual path. The individual installers below are still fully supported.

Forge editions:

- **GitHub**: default. GitHub issues, pull requests, `gh`.
- **GitLab**: opt-in. GitLab issues, merge requests, `glab`.
- **Gitea**: opt-in. Gitea issues, pull requests, `tea` ≥ 0.9.2, Gitea server ≥ 1.17. **Forgejo** ≥ 1.18 is expected to work via the shared API surface but is not explicitly tested.

Claude Code and Codex share the forge editions — pick one forge at a time; all editions share the same command names. **opencode** is an **additive** runtime (like Codex — not a git forge): `./install-opencode.sh` touches none of the existing edition machinery, and it is fully **standalone** — it resolves its support scripts under `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts` and never touches `~/.claude/`, so it runs on a machine with no Claude Code installed. Its `--forge` flag selects which forge's workflow prose and support scripts to deploy; the forge variants are **generated** from the same routing surfaces the Claude/Codex editions ship, so there is no hand-ported per-forge tree. See [docs/opencode-edition.md](docs/opencode-edition.md).

**Kimi Code** is likewise an **additive** runtime (not a git forge): `./install-kimi.sh` touches none of the existing edition machinery, resolves its support scripts under `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts`, and never touches `~/.claude/`. It takes the same generated `--forge` axis. See [docs/kimi-edition.md](docs/kimi-edition.md).

**Grok CLI** is likewise an **additive** runtime (not a git forge): `./install-grok.sh` touches none of the existing edition machinery, resolves its support scripts under `${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts`, and never touches `~/.claude/`. Named roles ship as `.grok/agents/*.md` (`spawn_subagent` types); the three commands ship as `.grok/commands/*.md`. Every subagent inherits the session model; standard/reasoning/heavy roles carry `medium`/`high`/`xhigh` effort, with heavy verified live. It takes the same generated `--forge` axis. See [docs/grok-edition.md](docs/grok-edition.md).

**Cursor** is likewise an **additive** runtime (not a git forge): `./install-cursor.sh` touches none of the existing edition machinery, resolves its support scripts under `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`, and never touches `~/.claude/`. Named roles ship as `.cursor/agents/*.md` (`Task` types); the three commands ship as `.cursor/commands/*.md`. Cursor CLI loads those Task types from the **workspace** `.cursor/agents`, not `~/.cursor/agents`. The workspace catalog is refreshed from `$CURSOR_HOME/agents` (all 14 roles byte-identical; global is the source of truth). A `sessionStart` ensure hook prints `{}`; `/workflow-next` runs the ensure script. `./install-all.sh` / `install-cursor.sh --global` is not dispatch-capable by itself unless the installer dual-wrote the project catalog (cwd inside a git work tree). A worktree is a cwd; do not point the Cursor workspace at `.kw/worktrees/<project>/` unless the 14 agent files exist there before the session. After materializing agents, start a new chat — a mid-session copy does not change this session's Task enum. Cloud Agents may not fire `sessionStart`. Canonical standard/reasoning/heavy classes render unquoted Grok 4.6 medium/high/xhigh model-effort pins in agent frontmatter, while `Task` cards omit per-call `model`; cold-start, picker-clamp, resume, and cloud/local limits remain documented. Compact resume after a session compact is a declared divergence (`sessionStart` `additional_context`; `preCompact` cannot inject). It takes the same generated `--forge` axis. See [docs/cursor-edition.md](docs/cursor-edition.md).

**ZCode** is likewise an **additive** runtime (not a git forge): `./install-zcode.sh` touches none of the existing edition machinery, resolves its support scripts under `${ZCODE_HOME:-$HOME/.zcode}/kaola-workflow/scripts`, and never touches `~/.claude/`. Named roles ship as `.zcode/agents/*.md` (`Agent` types) and are additionally synced to `~/.zcode/agents/` — ZCode (3.9.1) discovers subagents only at user scope. The three commands ship as `.zcode/commands/*.md`, and hooks merge into a `.zcode/config.json` whose top-level `hooks` object requires `"enabled": true` and offers seven events (no `SubagentStart`). Every agent pins `model: GLM-5.3` plus a canonical-tier `thoughtLevel` (standard `high`, reasoning `max`, heavy `max`); dispatch cards omit per-call model overrides. It takes the same generated `--forge` axis. Generated launchers stage first and real manifest support scripts win last wherever the edition layout and `${ZCODE_HOME:-$HOME/.zcode}` coincide; with distinct paths, project launchers remain under `<project>/.zcode/kaola-workflow/scripts` and real scripts remain in the shared home path, so a consumer cwd resolves real support scripts without launcher recursion. See [docs/zcode-edition.md](docs/zcode-edition.md).

Being additive is about *edition machinery*, not about forge support: these runtimes remain outside `install.sh`, `edition-sync.js`, `npm test`, and the routing-surface contract, and each keeps its own suite (`node scripts/test-opencode-edition.js`, `node scripts/test-kimi-edition.js`, `node scripts/test-grok-edition.js`, `node scripts/test-cursor-edition.js`, `node scripts/test-zcode-edition.js`).

**The same workflow runs everywhere** — Claude Code, Codex, opencode, Kimi Code, Grok CLI, Cursor, and ZCode. No installer writes the shared `~/.config/kaola-workflow/config.json`: there is no workflow path to select and no install-time configuration to seed. See [opencode](docs/opencode-edition.md) / [Kimi Code](docs/kimi-edition.md) / [Grok CLI](docs/grok-edition.md) / [Cursor](docs/cursor-edition.md) / [ZCode](docs/zcode-edition.md) for each additive runtime.

### Claude Code

Claude Code installs use `install.sh` only. Do not install Kaola-Workflow through
the Claude Code plugin marketplace; `install.sh` copies the slash commands,
support scripts, optional hook config, and vendored agents into `~/.claude/`.
During install, slash commands render each installed Kaola agent's frontmatter
model into concrete `Agent(..., model="...")` examples so each spawned subagent
runs on its assigned model.
If an older Claude Code plugin install is present, the installer refuses to run
until the plugin is removed:

```bash
claude plugin uninstall kaola-workflow@kaolabrother-kaola-workflow
claude plugin uninstall kaola-workflow-gitlab@kaolabrother-kaola-workflow  # if installed
claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed
claude plugin marketplace remove kaolabrother-kaola-workflow
```

GitHub edition, default behavior:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash
```

GitLab edition:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash -s -- --forge=gitlab
```

Gitea edition:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash -s -- --forge=gitea
```

From a local clone:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git
cd Kaola-Workflow
./install.sh --forge=github  # default GitHub edition
# or
./install.sh --forge=gitlab  # GitLab edition
# or
./install.sh --forge=gitea   # Gitea edition
```

#### Agent model tiers

There is **no install-time model axis**. Every install ships one model assignment
per role (the **Tier** column under [Workflow roles](#workflow-roles)), and passing
a different `model=` on a single dispatch is the way to right-size one piece of work
up or down. The retired install-time model-profile flag
is now an unknown argument and fails loudly at the terminal — by design.

```bash
./install.sh                              # GitHub edition
./install.sh --forge=gitlab               # GitLab edition
```

#### Nothing to configure

There is one workflow and no path to select. `./install.sh` installs it and nothing else.

Then in Claude Code:

```text
/workflow-init
/workflow-next
```

Uninstall:

```bash
./uninstall.sh --forge=github
./uninstall.sh --forge=gitlab
./uninstall.sh --forge=gitea
./uninstall.sh --forge=all
```

If you installed with the one-liner and do not have a local clone, clone the
repository first, then run the matching uninstall command.

### GitLab prerequisites

Before using the GitLab edition in a target project:

- Install and authenticate `glab`.
- Use a GitLab-hosted project remote, or provide an explicit GitLab project
  selection when the CLI cannot infer one from `origin`.
- Enable GitLab issues and merge requests for the project.
- Keep the workflow labels available: `workflow:queued` and
  `workflow:in-progress`.

### Gitea prerequisites

Before using the Gitea edition in a target project:

- Install `tea` ≥ 0.9.2 and authenticate: `tea login add`.
- Set `GITEA_SERVER_URL` and `GITEA_TOKEN` environment variables (or configure `tea` with `tea login add`).
- Use a Gitea-hosted project remote.
- Enable Gitea issues and pull requests for the project.
- Keep the workflow labels available: `workflow:queued` and `workflow:in-progress`.
- Gitea server ≥ 1.17 is required. Forgejo ≥ 1.18 is expected to work but is not explicitly tested.

### opencode

opencode is an additive runtime — installed by its own script, not `--forge`. From a local clone:

```bash
./install-opencode.sh                 # deploy into the current project (.opencode/ + opencode.json)
./install-opencode.sh --global        # deploy agents + commands into ~/.config/opencode (all projects)
./install-opencode.sh --regenerate    # refresh the in-repo .opencode/ tree from canonical
./install-opencode.sh --adopt-config  # replace an existing opencode.json with a freshly generated one
```

**A subagent runs the model and the reasoning effort of the session that dispatched it.** Nothing is configured per role and there is nothing to pass — opencode's `task` tool has no model or effort parameter. To make a dispatched role think harder, raise the session's own effort; every role you dispatch follows it. (Pinning a *model* per tier is a separate opt-in, via `KAOLA_OPENCODE_STANDARD_MODEL` / `KAOLA_OPENCODE_REASONING_MODEL`.) `opencode.json` is yours: an install preserves an existing one and names any `agent.<role>` entries still pinning per-role effort, which no longer does anything; only `--adopt-config` rewrites it — whole-file, not a merge, after copying the old one to a timestamped `.bak` it names. Full detail: [docs/opencode-edition.md](docs/opencode-edition.md).

### kimi

Kimi Code is an additive runtime — installed by its own script, not `--forge`. The kimi edition delivers the workflow the Kimi-native way: the three commands become directory-form Skills (so `/workflow-next` works as-is) and each vendored role ships as a `kaola-role-*` contract Skill, which dispatch prompts bind to Kimi's built-in `coder`/`explore` subagents. Every subagent **inherits the session model** — there is no per-dispatch three-tier effort mapping, and a role's standard/reasoning/heavy tier is declarative metadata only. From a local clone:

```bash
./install-kimi.sh --global --yes   # deploy skills into ${KIMI_CODE_HOME:-~/.kimi-code}/skills (all projects)
./install-kimi.sh --yes            # deploy into the current project (.kimi-code/skills/)
```

Hooks install as a managed `[[hooks]]` block in the **global** Kimi `config.toml` — Kimi has no project-scoped hooks config, so the hooks activate machine-wide whatever the install scope. Full detail: [docs/kimi-edition.md](docs/kimi-edition.md).

### grok

Grok CLI is an additive runtime — installed by its own script, not `--forge`. The grok edition delivers the workflow the Grok-native way: the three commands become flat `.grok/commands/*.md` slash commands and each vendored role ships as a named `.grok/agents/<role>.md` (`spawn_subagent` type). Every subagent **inherits the session model**; canonical standard/reasoning/heavy roles emit `effort: medium`/`high`/`xhigh`, while their class tokens remain portable metadata. From a local clone:

```bash
./install-grok.sh --global --yes   # deploy agents+commands into ${GROK_HOME:-~/.grok}
./install-grok.sh --yes            # deploy into the current project (.grok/{agents,commands})
```

Hooks install as `${GROK_HOME:-~/.grok}/hooks/kaola-workflow-hooks.json` — global regardless of install scope. Full detail: [docs/grok-edition.md](docs/grok-edition.md).

### cursor

Cursor is an additive runtime — installed by its own script, not `--forge`. The cursor edition delivers the workflow the Cursor-native way: the three commands become flat `.cursor/commands/*.md` slash commands (not Skills — Skills lack `$ARGUMENTS`) and each vendored role ships as a named `.cursor/agents/<role>.md` (`Task` type). Cursor CLI loads those Task types from the **workspace** `.cursor/agents`, not `~/.cursor/agents`. The workspace catalog is refreshed from `$CURSOR_HOME/agents` (all 14 byte-identical; global is source of truth). `sessionStart` runs an ensure hook that prints `{}`; next runs the ensure script. `--global` / `install-all.sh` default is not dispatch-capable by itself unless the dual-write materialized project agents (cwd inside a git work tree). A worktree is a cwd; do not point the workspace at `.kw/worktrees/<project>/` unless the 14 agent files exist there before the session. After materializing agents, start a new chat — a mid-session copy does not change this session's Task enum. Cloud Agents may not fire `sessionStart`. Canonical standard/reasoning/heavy classes render unquoted Grok 4.6 `medium`/`high`/`xhigh` pins in agent frontmatter; `Task` omits per-call `model`, and Cursor's cold-start, picker-clamp, resume, and cloud/local limits remain declared. From a local clone:

```bash
./install-cursor.sh --global --yes   # ${CURSOR_HOME:-~/.cursor} plus project .cursor/ when cwd is a git tree
./install-cursor.sh --yes            # deploy into the current project (.cursor/{agents,commands})
```

Hooks merge into `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (global). Compact resume injects via `sessionStart` `additional_context`; a second `sessionStart` ensure hook prints `{}`. `preCompact` cannot inject. Full detail: [docs/cursor-edition.md](docs/cursor-edition.md).

### zcode

ZCode is an additive runtime — installed by its own script, not `--forge`. The zcode edition delivers the workflow the ZCode-native way: the three commands become flat `.zcode/commands/*.md` slash commands and each canonical role ships as a named `.zcode/agents/<role>.md` (`Agent` type). ZCode (3.9.1) discovers subagents **only at user scope**, so the installer also syncs the roster to `${ZCODE_HOME:-~/.zcode}/agents/`. Hooks merge into a `.zcode/config.json` whose top-level `hooks` object requires `"enabled": true` and offers seven events (there is no `SubagentStart`). Canonical standard/reasoning/heavy classes render `model: GLM-5.3` plus a camelCase `thoughtLevel` pin — `high` / `max` / `max`; the key is `thoughtLevel`, NOT `reasoningEffort`, and dispatch cards omit per-call model overrides. From a local clone:

```bash
./install-zcode.sh --global --yes   # ${ZCODE_HOME:-~/.zcode} (agents+commands un-nested)
./install-zcode.sh --yes            # deploy into the current project (.zcode/{agents,commands} + ~/.zcode/agents sync)
```

Full detail: [docs/zcode-edition.md](docs/zcode-edition.md).

## Codex

This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills and `kaola-workflow/` project
artifacts rather than Claude Code slash commands. Codex uses `AGENTS.md` as its
entrypoint, which redirects to `CLAUDE.md` as the single canonical source of repo
guidance — the same `CLAUDE.md` contract applies to Codex and Claude Code alike.

- GitHub edition: `plugins/kaola-workflow/`
- GitLab edition: `plugins/kaola-workflow-gitlab/`
- Gitea edition: `plugins/kaola-workflow-gitea/`

`.agents/plugins/marketplace.json` is the Codex registration manifest. Codex's
CLI requires this file (its only registration command is `plugin marketplace
add <path>`) — it contains `kaola-workflow`, `kaola-workflow-gitlab`, and
`kaola-workflow-gitea` entries so a single local-path registration exposes all
three editions.

### Install

Prerequisites:

- Codex >= 0.145.0 is installed and authenticated on your computer.
- Your computer can access this GitHub repository.

The steps below follow Codex's official separation between adding a marketplace
source and installing a plugin from that source. See
[Install and use plugins](https://learn.chatgpt.com/docs/plugins#install-and-use-a-plugin)
and [Package your plugin](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli).

Clone the repository and add its local marketplace:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git ~/kaola-workflow
codex plugin marketplace add ~/kaola-workflow
```

The local marketplace exposes all three entries: `kaola-workflow` for GitHub,
`kaola-workflow-gitlab` for GitLab, and `kaola-workflow-gitea` for Gitea.
Marketplace registration alone does not install a plugin. Install exactly one
edition, either through `/plugins` or with the matching CLI command:

```bash
# GitHub
codex plugin add kaola-workflow@kaolabrother-kaola-workflow

# GitLab
codex plugin add kaola-workflow-gitlab@kaolabrother-kaola-workflow

# Gitea
codex plugin add kaola-workflow-gitea@kaolabrother-kaola-workflow
```

Current Codex releases enable general subagent workflows by default. Kaola-Workflow
uses a stricter, fail-closed V2 task-name dispatch contract, so it additionally
requires this explicit setting in `~/.codex/config.toml`:

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 5
```

MultiAgentV2 is **opt-in and off by default** — only V1 `multi_agent` is on by
default — so this has to be written for Codex to expose the V2 task-name spawn
tools at all. The inline `multi_agent_v2 = { enabled = true, ... }` under
`[features]` and a bare `multi_agent_v2 = true` are equally accepted. A
top-level `[agents] enabled = true` does **not** enable it — `[agents]`
configures roles and limits, and Codex 0.145.0 loads such a config clean with
`multi_agent_v2` still off.

`multi_agent_v2` is not carried in the public Codex configuration reference,
which documents `[features] multi_agent` for enabling subagents and `[agents]`
only for role/limit settings (`max_threads`, `max_depth`). The V2 flag and its
bounds are verified against upstream SOURCE at tag `rust-v0.145.0` —
`codex-rs/core/src/config/mod.rs` defines
`DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION = 4` and
`effective_agent_max_threads` uses `saturating_sub(1)`, both from PR #19792 —
never against published documentation, and may change in a future release. See the official
[Subagents guide](https://learn.chatgpt.com/docs/agent-configuration/subagents#global-settings)
for Codex's defaults.

Start a new Codex chat/session after installing the plugin or changing
`config.toml`. Then open your project and ask Codex to initialize the selected
workflow:

```text
Use Kaola-Workflow for Codex in this repo.
Run workflow-init for Kaola-Workflow for Codex.

Use Kaola-Workflow GitLab for Codex in this repo.
Run workflow-init for Kaola-Workflow GitLab for Codex.

Use Kaola-Workflow Gitea for Codex in this repo.
Run workflow-init for Kaola-Workflow Gitea for Codex.
```

#### Trust the hooks (required — they stay inert until you do)

`install-codex-agent-profiles.js` (run by the Codex `kaola-workflow-init` skill and
re-run on every upgrade) installs the lifecycle hooks **globally** into
`~/.codex/hooks.json` and copies their scripts into `~/.codex/kaola-workflow/{hooks,scripts}`.
Because hooks land in `~/.codex` — not in a project-local `.codex/hooks.json` — a
single install covers all projects on the machine and a plugin upgrade refreshes the
global copy automatically; no per-repository re-init is needed to pick up hook changes.

Agent profiles and the managed `.codex/config.toml` block install **globally** into
`~/.codex` by default (one install, all repos — parity with Claude global agents).
Project-local is an optional override: pass the repo path positionally to the installer.

Codex (>= 0.139) will **not execute any command hook until you review and trust it** —
trust is recorded against each hook's content hash and persisted per machine. So a
freshly installed machine has the hook files on disk yet **no hook fires yet**; this
is the usual cause of "the hooks were never added to Codex".

To activate them, open a Codex session and run:

```text
/hooks
```

Review the `kaola-workflow:` entries and trust them. This is a one-time step per
machine (trust survives across projects and upgrades as long as a hook's content does
not change; editing a hook re-marks it untrusted, so re-run `/hooks` after an upgrade
that changes a hook's content).

After trusting new or changed Kaola hooks, exit that Codex session and re-run the
same profile installer once, then run the doctor:

```bash
node <plugin-root>/scripts/install-codex-agent-profiles.js --global
node <plugin-root>/scripts/kaola-workflow-codex-preflight.js --doctor --project-root <project-root> --json
```

Codex 0.145.0 can persist its new `[hooks.state]` trust tables immediately before
a trailing comment in `config.toml`. When that comment is Kaola's
`# END kaola-workflow agents` marker, the trust tables temporarily appear inside
the managed block and the doctor correctly reports `status: stale`. Re-running
the installer preserves the trusted hashes while restoring the end marker above
`[hooks.state]`; do not delete or hand-edit the trust tables. Start a new Codex
chat/session after this final repair.

There is **no config key, trust file, or CLI flag that persists trust
non-interactively** — the only non-interactive option is
`codex exec --dangerously-bypass-hook-trust`, which skips the check for that single run
**without** persisting trust (use it only for automation that already vets the hook
sources). Until the hooks are trusted, compaction-resume and subagent dispatch
logging do not fire.

Update an existing Codex install (durable, stale-proof flow):

```bash
cd ~/kaola-workflow
git pull
# Refresh the cached plugin bundle Codex actually loads. The Install steps above
# register the marketplace from a local path, so remove+re-add is the reliable
# refresh — it re-reads the working tree directly, no clone/network involved:
codex plugin remove kaola-workflow@<marketplace>
codex plugin marketplace remove <marketplace>
codex plugin marketplace add ~/kaola-workflow
codex plugin add kaola-workflow@<marketplace>
# Only if you registered the marketplace from a git URL/ref instead of a local path:
# `codex plugin marketplace upgrade <marketplace>` re-fetches that ref over the
# network — it requires a fresh clone every time and fails outright for a local-path
# marketplace, so it is not the default here.
# Re-run the agent-profile installer globally (validates each profile schema, prunes
# stale Kaola files like docs-lookup.toml, writes the managed manifest
# ~/.codex/agents/kaola-workflow/.kaola-managed-profiles.json, and refreshes the
# global hooks at ~/.codex/hooks.json + ~/.codex/kaola-workflow/):
node <plugin-root>/scripts/install-codex-agent-profiles.js --global
# Inspect user / project / plugin-cache scope freshness (read-only doctor):
node <plugin-root>/scripts/kaola-workflow-codex-preflight.js --doctor --project-root <project-root> --json
```

Start a new Codex chat/session to pick up the updated plugin files and config.

For the standalone-profile release, both refresh steps above are required: the plugin upgrade
replaces the cached source profiles, and the profile installer copies all 14 role TOMLs into the
active global/project scope. A plugin-only upgrade leaves stale generated profiles in place; the
doctor reports the mismatch instead of treating the install as current.

`code-reviewer`, `adversarial-verifier`, and `security-reviewer` are owned by the canonical reviewer
generator, which writes five Claude Markdown outputs and nine Codex TOML outputs across GitHub,
GitLab, and Gitea. Each role carries a normalized `behavior_contract_hash` shared across runtimes
and a per-render `resolved_profile_hash`. The generator and installers prove deterministic repository
and installed filesystem bytes; the doctor also checks user, project, and plugin-cache drift and
prints a scope-specific repair. These checks deliberately do not claim that a proprietary runtime
loaded particular prompt bytes—the runtimes expose no public prompt-loader attestation surface here.
Likewise, identical behavior contracts do not imply identical natural-language findings or verdict
prose from stochastic models.

Codex custom-agent TOMLs keep only `name`, `description`, `nickname_candidates`, and
`developer_instructions` at top level. Reviewer behavior identity and the complete-profile self-hash
are embedded in `developer_instructions`, where the runtime can verify them without adding
unsupported role-schema fields — Codex logs a role file carrying one as a malformed agent role
definition and ignores it.

Installation and upgrade are the Codex profile-readiness boundary. The authoritative
`install-codex-agent-profiles.js` transaction validates source profiles and destinations, writes and
prunes the managed profile set, records its manifest, installs hooks, and verifies the installed
result before it exits successfully. Ordinary `kaola-workflow-next` and
`kaola-workflow-finalize` entry and resume do not re-run that proof, inspect profile/config
freshness, autofix configuration, or refuse work because persisted bytes drifted.

`kaola-workflow-codex-preflight.js --doctor` remains an explicit, user-invoked diagnostic. It is
never called automatically by an ordinary workflow session. The doctor validates persisted Codex
configuration in effective precedence order: `~/.codex`,
then every trusted `.codex/config.toml` from the Git repository root through the current working
directory. Higher layers override only the transport/posture fields they actually declare. Profile authority
remains explicit: a fresh global role install is accepted only when no project layer has a Kaola
profile/config footprint. When a project Kaola footprint exists, the most-specific matching
`[projects."<absolute-path>"] trust_level = "trusted"` entry in global config must authorize it;
unknown or untrusted projects stop as `project_trust_required` because Codex would ignore their
`.codex` layer. A trusted project authority must itself be current. The managed block
must exactly match the bundled role registry, including each role's `config_file`, description, and
nickname metadata, and any `agents` declaration outside the owned markers is an unsafe conflict.
The doctor reports the persisted config path that supplied an unsafe winning field. It cannot observe
ephemeral command-line configuration supplied when Codex was launched, including `--profile` or
`-c`; do not treat a filesystem-only pass as attestation of those per-process overrides.

Re-run the profile installer (and restart Codex) rather than treating profile or config drift as a
local-tool fallback. The installer also refuses symlinked, escaping, or
wrong-type managed destinations instead of following them outside their declared project/HOME
authority.

Review works the same way on every runtime: dispatch `code-reviewer`, `security-reviewer`, or
`adversarial-verifier` when the work calls for one, and read what comes back. Their *behavior* is
generated from one versioned source and is provably identical across runtimes; what they find is not,
because they are stochastic models. Identical behavior contracts do not imply identical findings.

#### Config audit for effort-safe subagents

The profile installer refreshes Kaola-owned profiles, hooks, manifests, and the
managed `[agents.*]` block. It does **not** silently rewrite unrelated global
Codex feature settings. Treat `~/.codex/config.toml` as user-owned: audit it
first, then apply a minimal config delta only when the user has asked the agent
to configure this machine or explicitly approves the change.

The audit must keep these facts separate:

- `codex features list` should report `multi_agent_v2` as enabled.
- MultiAgentV2 is **opt-in and off by default** in Codex >=0.145.0 — only V1
  `multi_agent` is on by default — so `features.multi_agent_v2.enabled = true`
  must be written for Codex to expose the V2 task-name spawn tools at all.
- Three shapes are accepted: a `[features.multi_agent_v2]` table, the inline
  `multi_agent_v2 = { enabled = true, ... }` under `[features]`, and a bare
  `multi_agent_v2 = true`. A top-level `[agents] enabled = true` does **not**
  enable it — `[agents]` configures roles and limits (`agents.<name>.*`,
  `max_depth`, `max_threads`), and Codex 0.145.0 loads such a config clean with
  `multi_agent_v2` still off. Set the switch under `[features]` instead, in any
  of the three shapes above.
- Put the concurrency budget at
  `features.multi_agent_v2.max_concurrent_threads_per_session`, and do **not**
  also set `agents.max_threads` — it is a separate `[agents]` key, **not an
  alias**, and it does not raise the MultiAgentV2 cap, which comes from
  `features.multi_agent_v2.max_concurrent_threads_per_session` alone. Codex
  0.145.0 accepts the key rather than complaining, so a stray one leaves the cap
  where it was instead of erroring.
- `features.multi_agent_v2.enabled` is what Kaola's gate reads.
  Kaola-Workflow does **not** write it for you (owner decision D2) — a
  fresh Kaola install refuses at preflight (`codex_multi_agent_v2_required`)
  until you add it by hand. It goes under `[features]`, which never collides
  with the `# BEGIN kaola-workflow agents` managed block.
- `[notice].suppress_unstable_features_warning = true` only suppresses the
  under-development warning; it is not evidence that V2 is enabled.
- `features.multi_agent_v2.max_concurrent_threads_per_session`, when present,
  must be high enough for Kaola fan-out plus the root session — the cap is
  INCLUSIVE of the root thread, so sub-agent width is the configured cap minus
  one. `agents.max_threads` is NOT an alias for it and must not be set
  alongside: Codex 0.145.0 accepts the key rather than complaining, but it does
  not raise the MultiAgentV2 cap, so a stray one leaves the cap where it was.
- The installed plugin cache, generated role profiles, and global hooks must be
  fresh relative to the plugin source Codex is actually loading.
- Runtime profile integrity comes from omission plus preflight: every generated
  role profile omits both runtime-strength keys, and the profile-freshness
  preflight migrates or refuses any profile that pins them. The unpinned profile
  does not select the dispatch pair: each Codex spawn explicitly carries the
  model and reasoning effort selected from its role classification. Standard is
  Luna/max, reasoning is Sol/medium, and heavy is Sol/high. These mappings have
  no per-task escalation, downgrade, or other model/reasoning exception, except
  the one reviewer-class heavy re-dispatch carve-out on the next/finalize pin.

Recommended posture when the user asks the agent to configure Codex for
Kaola-Workflow:

`developer_instructions` is a top-level key, so place it before the first TOML
table. If the key already exists, merge these rules into its existing value
instead of declaring it twice. Enable MultiAgentV2 under `[features]`; a
top-level `[agents] enabled = true` does not enable it.

```toml
developer_instructions = """
Kaola-Workflow subagents may legitimately run for more than an hour while
reasoning, collecting data, calculating results, or running terminal commands.
After dispatching them, continue any useful independent work. When none remains,
call wait_agent once per join iteration with timeout_ms = 3600000. A wait timeout
is only a mailbox wake-up, not evidence that the agent stalled and not a limit on
its total runtime. While an agent is running or making progress, repeat the long
wait without a total deadline. Do not poll, list, message, or interrupt agents
merely for status. Process results immediately because the wait returns early on
an update.
"""

[notice]
suppress_unstable_features_warning = true

[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 5
default_wait_timeout_ms = 3600000
max_wait_timeout_ms = 3600000
```

Codex currently caps one `wait_agent` call at one hour. Setting both values to
that ceiling minimizes status-only wakeups; it does **not** impose a one-hour
subagent runtime limit. If no update arrives, the parent repeats the wait while
the agent remains active or is making progress, so total patience has no
Kaola-imposed deadline. A wait still returns immediately when an agent reports
completion or another update. This is a user-owned global setting; the installer
reports the effective values but does not overwrite them.

After changing these settings, start a fresh Codex session so the tool surface
and injected instructions are rebuilt. The preflight and doctor report
`multi_agent_v2_enabled`, `max_concurrent_threads_per_session[_source]`,
`effective_subagent_width`, and the wait-timeout bounds. Absent or false
`features.multi_agent_v2.enabled` refuses with the typed `codex_multi_agent_v2_required`
status (repair: the exact `[features.multi_agent_v2]\nenabled = true` diff, never written by
Kaola itself). Routing skills call the direct `agents` namespace, never the
server-reserved `collaboration` name, `functions.exec`, or Code Mode.

If the audit finds a missing required setting and the user has not authorized
config changes, stop with the minimal diff and reason. Do not claim Codex is
ready from repo source alone, from warning suppression alone, or from a stale
plugin cache.

Every install/upgrade also prints the effective dispatch **posture** automatically
(no separate command needed). Profile installation always succeeds — the installer
never refuses on `features.multi_agent_v2.enabled` (that gate lives at the later, dispatch-time
preflight, per D2) — but it re-reads the config it just wrote and reports the
effort-gated dispatch posture it derives from the local config, plus whether
`features.multi_agent_v2.enabled` is set at all:

```text
Kaola-Workflow Codex multi_agent_v2: NOT enabled (see codex_multi_agent_v2_required at preflight)
Kaola-Workflow Codex dispatch posture: none (model_reasoning_effort unset)
Kaola-Workflow Codex dispatch posture: Kaola-Workflow cannot attest its required V2 task-name dispatch path because features.multi_agent_v2.enabled is absent or false. multi_agent_v2 is opt-in and off by default in Codex >=0.145.0 (only V1 multi_agent is on by default), so it must be set explicitly. Add it, start a new Codex session, then explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes an ultra reasoning effort for your model/plan (undocumented as of Codex >=0.145.0 — check the /model picker), set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) for proactive delegation.
Kaola-Workflow Codex dispatch posture: effort-gated multi-agent dispatch posture is Codex CLI runtime behavior observed on codex-tui 0.142.5 and not re-verified on Codex >=0.145.0; it may change in a future Codex release.
status: ok
```

This report is REPORT-ONLY and never fails the install: `features.multi_agent_v2.enabled` and
`model_reasoning_effort` are both user-owned choices, so the installer never writes
them. Although current Codex releases enable general subagent workflows by default,
an install that prints `status: ok` while Kaola's `multi_agent_v2` attestation reads
NOT enabled still needs the operator to add `[features.multi_agent_v2]\nenabled = true` by hand (a
`[features]` sub-table, which never collides with the `# BEGIN kaola-workflow agents` managed block,
so its placement in the file is unconstrained — see `codex_multi_agent_v2_required`'s repair diff)
before any role agent can actually be dispatched; once enabled, a non-proactive posture still needs
one of the remediations above: explicitly ask for sub-agents / delegation / parallel
work in that session (always available and always documented), or — if your Codex
exposes an `ultra` reasoning effort for your model/plan (undocumented as of Codex
>=0.145.0; check the `/model` picker) — set `model_reasoning_effort = "ultra"` in
`~/.codex/config.toml`, or pass it per-session (`codex -c model_reasoning_effort=ultra`).
The installer and an explicitly invoked `kaola-workflow-codex-preflight.js --doctor` report the
same posture non-fatally once enabled — a `warn:` line, never a failed install — while the doctor
returns `codex_multi_agent_v2_required` (exit 7) when `features.multi_agent_v2.enabled` itself is
absent or false. Ordinary workflow sessions do not invoke the doctor. See `docs/api.md` §
Installation and edition sync for the diagnostic boundary.

Updating the Codex CLI itself never repairs Kaola-generated `.codex/` state — the
runtime and the generated role profiles / managed config block are separate
surfaces. A schema-invalid profile (one missing a non-empty top-level `name`, which
Codex >=0.138 silently ignores) or a stale profile left behind by an older install
is only repaired by re-running `install-codex-agent-profiles.js`, which validates,
prunes, and re-writes the managed manifest.

To verify a project was initialized for Codex, check that `.codex/config.toml`
contains a `# BEGIN kaola-workflow agents` managed block, that
`.codex/agents/kaola-workflow/` contains the role profile files, and that
the global hook home `~/.codex/hooks.json` plus `~/.codex/kaola-workflow/{hooks,scripts}`
exist — then trust the hooks via `/hooks` (see *Trust the hooks* above).

The read-only `--doctor` report grades four scope classes: bundled `repository` source, `user`,
`project`, and the invoking plugin's exact name/version `plugin_cache` across marketplaces. Unrelated
plugins and old versions are ignored. Repository schema failures and selected-cache manifest/path
malformation or exact-byte drift are gate-affecting even though doctor remains read-only; each stale
scope reports its own repair. Agent **profiles** install globally by default, so the `user` scope
(`~/.codex`) is the authoritative one for profiles and must read green (managed block
present; no missing, stale, or malformed roles). The `project` scope is an optional
per-repo override; when present it must also read green. The preflight gate accepts
EITHER a valid global `~/.codex` scope OR a valid project scope, and **fails closed when
neither is valid**. The **hooks** are global by design (`~/.codex`) and are reported
under the `user` scope.

The skills are:

```text
kaola-workflow-init
kaola-workflow-next
kaola-workflow-finalize
```

Each Codex pack provides the same workflow as the Claude commands — the mission list,
review, documentation docking, archive, and the sink. They depend on no
external agent packages. Instead,
`kaola-workflow-init` automatically installs Codex-native role profiles that
mirror the Claude workflow roles:

```text
code-explorer
investigator
knowledge-lookup
planner
code-architect
tdd-guide
implementer
build-error-resolver
code-reviewer
security-reviewer
doc-updater
adversarial-verifier
synthesizer
metric-optimizer
```

(`adversarial-verifier` is a read-only, refute-by-default falsifier. `synthesizer` is a
reasoning-class write-convergence role, worth reaching for only when concurrent write legs actually
conflict. `metric-optimizer` is a bounded metric-ratchet — each iteration it proposes a change,
applies it, runs the regression gate, measures the metric, and accepts or reverts it
against the running baseline until a stop condition fires.)

The managed setup copies role configs into `~/.codex/agents/kaola-workflow/` (global
default; a project-local override targets `<project>/.codex/agents/kaola-workflow/`
instead) and maintains a `# BEGIN kaola-workflow agents` block in `~/.codex/config.toml`
while preserving unrelated config. Codex workflows default to delegation
(`delegation_policy: delegate`) without prompting: the orchestrator dispatches those roles for
research, execution, repair, review, and documentation work.
When the role profiles are absent the workflow auto-detects this, keeps the
`delegate` policy, and records `local-fallback-tool-unavailable`. The current Codex session performs
the work locally under `local-authorized` only when you explicitly disable delegation.

Standalone role TOMLs include the same `description` and `nickname_candidates` metadata as the
managed `config.toml` block and deliberately omit both runtime keys. Exact historical Sol/medium or
Sol/xhigh profile pins are treated as stale managed profiles and migrated back to omission; partial
or illegal pins are malformed. Those legacy migration forms are separate from live dispatch:
Codex passes both `model` and `reasoning_effort` on each spawn from the role's three-tier
classification, using Luna/max for standard, Sol/medium for reasoning, and Sol/high for heavy. The user-owned root
`model_reasoning_effort` controls the parent session and is never rewritten by profile migration.

Every standard-tier Codex spawn explicitly carries Luna/max, every reasoning-tier spawn carries
Sol/medium, and every heavy-tier spawn carries Sol/high. The workflow does not select a different
model or reasoning effort for a role based on task or runtime conditions, except the one bounded
reviewer-class heavy re-dispatch.

**Say where the deliverable goes.** A role that can write (`Write`/`Edit` in its manifest) writes its
full deliverable to a path the dispatch names and returns a compact summary; a read-only role returns
its full deliverable as its final message, for the orchestrator to persist. Getting this backwards is
how work is lost at the dispatch boundary — a chat-only deliverable from a killed agent is gone, and
the mission list's `dispatched` field is what lets a successor go looking for the file instead.

Codex preflight and doctor output report the dispatch identity mode. `v2-task-name`
is the only mode — there is no v1/thread-id fallback. Once `features.multi_agent_v2.enabled = true`
is set, dispatches pass a sanitized `task_name` with `fork_turns: "none"` and no
conversation-history inheritance. They also pass explicit per-spawn `model` and
`reasoning_effort` values selected by the Codex routing contract; the standalone
profile remains runtime-unpinned.

## Usage

Initialize each project once:

```
/workflow-init
```

This creates or updates `CLAUDE.md`, `AGENTS.md`, and the baseline documentation map without replacing existing project guidance. The generated `CLAUDE.md` keeps commands, hard rules, durable state invariants, workflow pointers, and documentation links in root memory while leaving long details in docs or skills. `AGENTS.md` provides a mandatory redirect block that directs agents to read `CLAUDE.md` before taking any action in the repository.

In any Claude Code session, run:

```
/workflow-next
```

`/workflow-next` is the whole workflow: it picks the work, claims it, writes the run’s mission list,
and runs it.

### 1. Pick the work

**You** select the target; no script picks for you. If the user named an issue, that issue is the
target and nothing substitutes for it. If the user described a task with no issue number, resolve the
description to the issue it belongs to (or file one) first. If neither, read the backlog — the open
issue list ordered by its `P0`–`P3` priority tier (`kaola-workflow-claim.js list-open`), any
`kaola-workflow/.roadmap/_rules.md` standing rules, the active folders, and the archived summaries —
rank by that tier, then by scope, excluding what is not yours to take (closed, already claimed, or
occupied by another live session), and **state the selection aloud before claiming it**.

Before claiming, read each shortlisted candidate's own body and comments — the handful you are
ranking for this claim, never the whole list `list-open` returned. Comments are current state: where
a comment contradicts the body, the comment wins, and say so aloud when you state the selection.

Everything before the claim is free: dispatch read-only agents, read whatever you need, ask the user
when the pick is genuinely ambiguous. A clean selection claims without asking.

### 2. Claim

The claim is bookkeeping, not a gate. It atomically creates `kaola-workflow/{project}/` with its
`workflow-state.md` — recording which issues, branch and worktree this run owns — and provisions a
repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` unless `KAOLA_WORKTREE_NATIVE=0`
disables it.

The claim **answers; it does not refuse.** `owned` or `acquired` means you have the folder.
Anything else reports a fact about the target rather than a verdict about you — fix the argument,
retry, work offline, or re-state your reason and claim something else. The one thing it puts back to
you is your own uncommitted work: that is a question, not a refusal.

A name that could not be a project folder is resolved the same way. `kaola-workflow/.roadmap/` (home
to the optional `_rules.md`) and `kaola-workflow/archive/` are reserved, so a claim naming either via
`--project` claims the run's ordinary `issue-<N>` folder instead, and the envelope carries
`reserved_project` naming what it declined. The run proceeds; nothing in the reserved directory is
touched.

A run normally carries **three to five issues**; one issue is the exception rather than the norm.
Members are admissible when they are all open, unclaimed, and each **closeable on its own
evidence** — finishing one does not depend on how another turns out. See
[Multi-issue bundle lane](#multi-issue-bundle-lane).

### 3. Write the mission list

`kaola-workflow/{project}/mission-list.md` is the run’s coordination record and the one file a
successor needs. It is written immediately after the claim, before any work goes out:

````markdown
# <the goal, one line>

- item: <the mission, one line of prose>
  status: todo

- item: <the mission>
  status: in-flight
  dispatched: <what went out and to whom, and where its output was to land>

- item: <the mission>
  status: done
  dispatched: <what went out and to whom, and where its output was to land>
  result: <where the outcome landed — a path, or a few lines inline>
````

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

Items are identified by their order in the file; nothing depends on a stable ID, and items may be
added at any time.

### 4. Run it

Read the list. The frontier is the list minus done minus in-flight — visible by reading, never
computed. Pick from it.

**Decide the shape when you get there, not before.** When you reach an item, decide whether to
dispatch subagents or do the work yourself, and at what width. Nothing inspects that decision.
Independent work runs concurrently; work that genuinely feeds other work runs in order.

**The three write moments** are the whole discipline:

1. **Created** — write `item` and `status: todo`.
2. **Dispatched** — write `dispatched` and flip `status` to `in-flight`, **before the work goes out**.
   Writing it afterwards is exactly the failure this file exists to prevent. Name **where the output
   was to land**; that locator is what makes recovery possible.
3. **Closed** — write `result` and flip `status` to `done`.

Work you do yourself is still an item — `in-flight` with `dispatched: self`.

### 5. Finish

When every item is `done`:

```
/kaola-workflow-finalize {project}
```

Finalization validates, docks the documentation, writes the summary, settles closure, archives the
run, commits, and sinks. **Every step measures and reports; you decide what to do about what it
says** — which is not licence to ship something you know is wrong. Moving the verdict moves the
accountability onto you, because you are the only party with enough context to carry it.

- **Validation** — self-host repos run `kaola-workflow-run-chains.js` to produce
  `.cache/chain-receipt.json`; on a consumer repo you own verification and record the result with
  `kaola-workflow-validation-runner.js record`, which writes `.cache/final-validation.md` carrying
  three column-0 fields — `verdict: pass`, the exact command you ran, and a
  `validated_candidate_hash` bound to the tree. Run it from the working tree you validated: the
  binding follows the tree the shell is in, and a linked worktree and main hash differently until the
  branch merges. The finalize transaction classifies the result (absent / stale /
  empty / red / green) onto the envelope as `validation` and durably under `## Validation`.
- **Changed paths** — the paths the run actually touched, on the envelope as `changed_paths` and
  durably under `## Changed Paths`. Nothing compares them against a declaration; the report exists so
  a reader can notice what does not belong.
- **Mission list** — the run record read against itself: how many missions it holds, and the `item:`
  line of every one carrying an outcome while its `status` is not `done`. On the envelope as
  `mission_list` and durably under `## Mission List`; present only when the run wrote a record, and a
  record that agrees with itself still reports a zero count. Read and never repaired — what to do
  about a contradiction is the reader's call.
- **The finalize transaction** — one resumable script call covering the artifact mirror, archive and
  status close, roadmap staging, and the `chore: finalize {project}` commit gate. `--check`
  evaluates every precondition in one read-only pass and reports all of them together. Re-running the
  same call resumes at whichever step it stopped on.
- **The archive still fails loudly if it would lose a file.** That is an operation refusing to
  destroy data, and it is the one hard stop left in the phase.

### The sink reports; the orchestrator owns the outcome

The sink does not refuse and does not decide. It tells you what it found — content on the branch that
no record describes, a witness bound to different bytes than the ones being published, a merge that
did not fast-forward — and then **you** are accountable for the branch ending up right. Three
resolutions are legitimate:

- **get the merge correct** — rebase onto the updated mainline and retry the fast-forward, the normal
  answer when another lane merged first;
- **resynchronize** — reconcile whatever diverged, then re-run the sink so it resumes;
- **file a pull request instead** — a perfectly good resolution precisely because it stages the
  content for review rather than publishing it. Reach for it when the right call is a human’s.

Then clean up after the sink: dispose of the journals, remove your own branch and worktree, leave the
folder archived. Clean up **your own lane only**, and only after your own merge lands. A true content
conflict halts and asks a human; it is never auto-resolved.

### Active-work tracking

Active work is tracked under `{project-root}/kaola-workflow/{project-name}/` while active and
archived to `{project-root}/kaola-workflow/archive/`; unfinished work is the forge's own open issue
list — there is no local mirror of it. An active folder holds two durable files —
`workflow-state.md` (what the run owns) and `mission-list.md` (what it is doing) — plus a `.cache/`
directory for whatever the run chooses to keep there.

## Automation scripts

The workflow includes automation scripts installed by `install.sh` to
`~/.claude/kaola-workflow/scripts/` for the GitHub edition,
`~/.claude/kaola-workflow-gitlab/scripts/` for the GitLab edition, or
`~/.claude/kaola-workflow-gitea/scripts/` for the Gitea edition. Commands
prefer the installed support directory and fall back to the repo checkout
when developing locally. Drift between `scripts/` and
`plugins/kaola-workflow/scripts/` is detected at test time by
`validate-script-sync.js`.

### Operational scripts

| Script | What it does | When it runs |
|--------|--------------|--------------|
| `kaola-workflow-claim.js` (GitHub) / `kaola-gitlab-workflow-claim.js` (GitLab) / `kaola-gitea-workflow-claim.js` (Gitea) | Active-folder coordination: claim, release/discard, status, watch-pr (watch-mr on GitLab), bootstrap/startup, finalize, pick-next, resume, worktree-status, worktree-finalize, stale-worktree-check, stale-worktree-cleanup, legacy-worktree-cleanup. Provisions a per-claim Git worktree at `<repo-root>/.kw/worktrees/<project>/` by default on every claim; set `KAOLA_WORKTREE_NATIVE=0` to disable. | All phases |
| `kaola-workflow-active-folders.js` | Shared library: reads the active-folder table from `kaola-workflow/{project}/workflow-state.md`. Imported by claim, classifier, and sink scripts. | Library |
| `kaola-workflow-classifier.js` | Parallel-work classifier: marks each open issue green/yellow/red/blocked based on dependency graph, exact file-path overlaps, shared-infra directories, and active folders. | Startup |
| `kaola-workflow-gap-sweep.js` | Sweeps the run's own discovered defects from `.cache/` — waived red chains, plus whatever the orchestrator seeded into `.cache/run-gaps-manual.md` — and reconciles them against the summary's `## Run gaps` section in both directions. | Finalization |
| `kaola-workflow-closure-audit.js` (GitHub) / `kaola-gitlab-workflow-closure-audit.js` (GitLab) / `kaola-gitea-workflow-closure-audit.js` (Gitea) | Reports closure drift (stale `workflow:in-progress` labels, active folders for closed issues, unarchived PR/MR folders for closed issues). Dry-run JSON by default; `--execute` repairs only the stale in-progress label and never deletes active folders or worktrees. GitLab edition uses `unarchived_mr_folders` with lowercase MR state matching (`merged`/`closed`). Gitea edition keeps `unarchived_pr_folders` with lowercase PR state matching (`merged`/`closed`). Complements `stale-worktree-check`/`-cleanup` (which owns worktree/branch drift). | On demand / audit |
| `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea) | Finalization merge sink: fetch, rebase onto `origin/main`, FF-only merge with retry on race conditions, push, close the issue, and clean up the branch. Falls back to the PR sink when the merge is impossible. | Finalization |
| `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) | Finalization PR/MR sink: push the branch, open a PR via `gh pr create` (GitHub), `glab mr create` (GitLab), or `tea pr create` (Gitea), record the PR/MR URL, and optionally enable auto-merge. | Finalization |
| `kaola-workflow-compact-context.js` | Wired to the `SessionStart` (`compact`) hook. Reads the most recent `workflow-state.md` and injects a resume hint into the post-`/compact` session. | Hook |
| `kaola-workflow-run-chains.js` | Runs the edition test chains (`claude`, `codex`, `gitlab`, `gitea`) via `spawnSync` with real exit codes and produces `.cache/chain-receipt.json` (`{headSha, codeTreeHash, startedAt, chains:[{name, exit}]}`). The orchestrator runs it as the last pre-finalization action; the finalize transaction then reads and classifies the receipt. `--accept-known-red name:issue` registers a waiver for a known-red chain. Also hosts the pre-tag `--release-check` gate. | Finalization, Release |

### Validation and test scripts

| Script | What it asserts |
|--------|-----------------|
| `simulate-workflow-walkthrough.js` | End-to-end integration test of the claim, finalize, sink, and hook surfaces. Must exit 0 with `Workflow walkthrough simulation passed`. Run before claiming any workflow-related change complete. |
| `kaola-workflow-validation-runner.js` | Executes a validation command locally in a scrubbed environment, binds command/cwd/env/toolchain/candidate identities, and reduces bounded repetitions to a deterministic `pass`, `fail`, or `inconclusive` receipt. It is self-contained and does not depend on a hosted pipeline. |
| `test-finalize-door.js` | Pins the finalize door's report-don't-refuse contract: a stale, missing, or red receipt still passes and reports the typed finding twice — on the envelope and durably in the summary — while a lossy archive and a bad release candidate still refuse. |
| `validate-workflow-contracts.js` | Contractual assertions on the Claude Code surface — command files, agent installs, and documented invariants. **Tag-existence check (issue #177)**: Verifies local git tag `kaola-workflow--v<version>` matches `package.json` version; uses `git rev-parse --verify refs/tags/<tag>` to validate. Skipped when `KAOLA_WORKFLOW_OFFLINE=1` or `.git` absent. |
| `validate-kaola-workflow-contracts.js` | Same contractual assertions on the Codex plugin surface under `plugins/kaola-workflow/`. |
| `validate-script-sync.js` | Byte-identical drift guard between `scripts/` (Claude Code) and `plugins/kaola-workflow/scripts/` (Codex), plus shared hook copies that must stay in sync across GitHub, GitLab, and Gitea surfaces. |
| `validate-vendored-agents.js` | Asserts the vendored Claude Code agent prompts match the pinned upstream Everything Claude Code commit. |

### Active folder coordination

Kaola-Workflow treats `kaola-workflow/{project}/workflow-state.md` plus the configured forge's issue and PR/MR state as the durable coordination contract. No lease/session layer remains.

The detailed durable-state map lives in `docs/workflow-state-contract.md`. Keep generated root-memory files to compact invariants: the forge is the backlog — an issue's title, labels, and comments (which override the body) are what the work is, and there is no local mirror to keep current; `kaola-workflow/.roadmap/_rules.md` is the one optional local file that survives, for standing project-local rules read directly by the pick step; active work stays under `kaola-workflow/{project}/` until archive or discard, and active artifacts include `workflow-state.md`, `mission-list.md`, and the `.cache/` directory.

**Environment Variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAOLA_GH_REMOTE_TIMEOUT_MS` | `30000` | Timeout in milliseconds for GitHub/GitLab/Gitea API calls during closure audit, active-folder checks, remote validation, and sink-merge/sink-pr gh calls. Set lower in tests to simulate API hangs. Values above 600000ms (10 minutes) are clamped to 600000ms to prevent hang protection bypass (issue #185) |
| `KAOLA_RUN_CHAINS_TIMEOUT_MS` | `1800000` | Per-chain `spawnSync` kill ceiling in milliseconds for `kaola-workflow-run-chains.js`. Default 1800000 (30 min), raised from a prior 900000 (15 min, issue #512) after a live run on a constrained host outgrew that budget. Invalid/zero/negative values fall back to the default. No upper clamp (local test suite, not a remote-hang risk). A killed chain's receipt entry now records `timed_out: true` (issue #608), and the failure summary labels a timed-out chain inline so it reads distinctly from a genuine test regression |
| `KAOLA_FINALIZE_BASE` | (unset) | Override the integration-branch base for the finalize transaction's changed-paths report (`scripts/kaola-workflow-claim.js` ×4 editions). Defaults to unset → a `main` base, which is byte-equivalent for branch-per-issue runs. Set it to a project merge-base (or `HEAD` for an in-place run whose own changes are already covered by the chain receipt) so the report shows only this run's own diff on a shared or multi-issue branch. Also settable via the `--base <ref>` flag (flag wins) |
| `KAOLA_WORKFLOW_OFFLINE` | `0` | Skip GitHub/GitLab/Gitea calls for local tests or air-gapped usage. When unset and remote validation fails, startup answers `target_unavailable` (exit 0, `claim: 'none'`) instead of silently proceeding |
| `KAOLA_WORKFLOW_DEBUG_CWD` | (unset) | DEV/TEST ONLY — when set, `sink-merge.js` writes its final cwd to this file |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL` | (unset) | DEV/TEST ONLY — fail first N fast-forward merge attempts (GitHub, GitLab, and Gitea) |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | (unset) | DEV/TEST ONLY — force merge-impossible error in sink-merge fallback tests (GitHub, GitLab, and Gitea) |
| `KAOLA_WORKTREE_NATIVE` | `1` (ON) | Provision a repo-local Git worktree at `<repo-root>/.kw/worktrees/<project>/` on every claim. Set to `0` for a repo-root run with no worktree. The worktree is a tool: decline it and the run still finishes |
| `KAOLA_COTENANT` | (unset) | Set to `1` to declare that another session is active on this checkout, so lane classification treats every foreign active folder as `live` and leaves it alone |
| `KAOLA_PATH` | (unset) | Retired, with no residue. There is one workflow; the claim silently ignores this variable (any value, or unset). The requested value is not recorded either — the persisted `workflow_path` state field is the constant `adaptive`, never an echo of the request. The `--workflow-path` flag is likewise accepted-but-ignored (a stderr notice, never a refusal) |
| `KAOLA_RUNTIME` | (unset) | Explicit runtime override, read by `kaola-workflow-claim.js` when stamping `workflow-state.md`. Precedence: `--runtime` flag wins, then `KAOLA_RUNTIME`, then inference from an opencode model env var, else `claude` |
| `KAOLA_TARGET_ISSUE` | (unset) | The issue number this run targets. Equivalent to `--target-issue N` |
| `KAOLA_TARGET_ISSUES` | (unset) | Comma-separated list of issue numbers for an explicit bundle claim, e.g. `KAOLA_TARGET_ISSUES=42,47,53`. Equivalent to `--target-issues 42,47,53`. Must not be set together with `KAOLA_TARGET_ISSUE` (answers `target_ambiguity` usage at exit 0, writing nothing) |
| `KAOLA_GOAL` | (unset) | Operator-side goal text. Subagent shells do not inherit env vars across the spawn boundary, so a goal that must reach a dispatched agent travels in the dispatch prompt — the orchestrator owns placing it there. Finalization records `goal_declared: true\|false` in the closure receipt, with `goal_declared_source` (`env`\|`plan`) and `goal_declared_probed` (the paths examined) — advisory, and a record that a goal was DECLARED only: **nothing checks whether it was achieved** |

**Active-folder subcommands:**

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `startup` / `bootstrap` | `node scripts/kaola-workflow-claim.js startup --target-issue <N> [--runtime claude|codex] [--sink merge|pr]` | Validates and atomically creates or reuses the active folder for issue N |
| `status` | `node scripts/kaola-workflow-claim.js status` | Lists active folders and their issue, branch, phase, sink, and worktree metadata |
| `release` / `discard` | `node scripts/kaola-workflow-claim.js release --project <name>` | Archives an active folder as abandoned and clears advisory forge labels when online |
| `finalize` | `node scripts/kaola-workflow-claim.js finalize --project <name> [--keep-worktree] [--check] [--json] [--base <ref>]` | The one resumable finalize transaction: artifact mirror, archive + status close, roadmap staging, and the `chore: finalize <project>` commit gate. It also reports `validation`, `changed_paths` and `mission_list` on its envelope and durably in the summary. `--check` evaluates every precondition in one read-only pass, reporting all of them together with zero side effects. By default it removes the linked worktree; `--keep-worktree` preserves it for the final commit gate. `--base <ref>` (or `KAOLA_FINALIZE_BASE`) scopes the changed-paths report on a **shared/multi-issue branch** |
| `sink-fallback` | `node scripts/kaola-workflow-claim.js sink-fallback --project <name> [--reason <text>]` | Records merge-impossible fallback; updates Sink block to sink: pr; writes .cache/sink-fallback.json |
| `watch-pr` | `node scripts/kaola-workflow-claim.js watch-pr` | Archives PR-backed folders when the forge reports MERGED or CLOSED. GitLab edition uses `watch-mr` (`kaola-gitlab-workflow-claim.js watch-mr`) instead. |
| `stale-worktree-check` | `node scripts/kaola-workflow-claim.js stale-worktree-check` | Detects and reports worktrees and branches for closed or archived issues that are not currently active |
| `stale-worktree-cleanup` | `node scripts/kaola-workflow-claim.js stale-worktree-cleanup [--execute] [--archive] [--export] [--force] [--keep-branch]` | Removes stale worktrees and branches found by `stale-worktree-check`. Dry-run by default; `--execute` performs removal. For dirty worktrees: `--archive` stashes changes first (recoverable via `git stash list`), `--export` writes a patch to `kaola-workflow/archive/exports/`, `--force` discards. `--keep-branch` removes the worktree but keeps the branch (for open PRs). No strategy flag = dirty worktrees are skipped. When multiple strategy flags given, precedence is: archive > export > force. A branch that cannot be *proven* merged is never deleted — it is reported `skipped_unmerged` with its tip SHA for manual recovery. |
| `audit-labels` | `node scripts/kaola-workflow-claim.js audit-labels` | Scans for closed issues that still carry `workflow:in-progress` label; outputs JSON with stale issues and count |
| `repair-labels` | `node scripts/kaola-workflow-claim.js repair-labels [--execute]` | Finds and removes `workflow:in-progress` labels from closed issues. Dry-run by default; `--execute` performs actual removal |
| `worktree-status` / `worktree-finalize` | see `--help` usage errors | Lists workflow worktrees and mirrors final artifacts into the linked worktree |

### What the classifier decides

`kaola-workflow-classifier.js` reports facts about a candidate issue's **state**, and nothing else. It has no
configuration — there is no file to write and no flag to pass.

| verdict | meaning |
|---|---|
| `green` | claimable |
| `blocked` | an open `depends-on:#N` prerequisite, or a live remote claim on the issue |
| `owned` | an active local folder already holds this issue (or its bundle) |
| `red` | the issue is already closed |
| `target_unavailable` / `target_unverified` | the issue could not be fetched, or offline with no local evidence |
| `indeterminate` | a transient forge fault after bounded retry — escalate, do not refuse |

**It does not decide whether two pieces of work may run at the same time.** Whether work runs in parallel is
the runtime agent's call: where the runtime supports concurrency it is on, and the workflow neither enforces
nor configures it. Offline, with no active folder to serve as local evidence, classification answers
`target_unverified` rather than guessing — there is no local roadmap source left to read a `depends-on`
prerequisite from.

### Priority label configuration

The issue sort order, applied by `kaola-workflow-claim.js list-open` (called from the pick step, not
from claim startup), is determined by:

1. **Workflow label** (`workflow:queued` always wins if present)
2. **Priority tier** (based on issue labels)
3. **Issue number** (older issues first)

**Default priority tiers** use P-numbered labels:

- `P0` → tier 0 (highest)
- `P1` → tier 1
- `P2`, `P3`, etc. → tier 2, 3, ...
- Other labels → tier 99 (lowest)

**Custom priority labels** (`kaola-workflow/config.json`):

If your repo uses custom priority labels instead of the P0–P3 naming, declare them in `kaola-workflow/config.json`:

```json
{
  "priority_top_tier_labels": ["hotfix", "critical", "urgent"]
}
```

Any issue with a label matching `priority_top_tier_labels` will be sorted as tier 1 (high priority), regardless of P-label presence. The `listOpenIssues` function reads this config at startup to customize sort order.

### Agent-directed issue selection

Issue selection is an agent decision, not a hidden script decision. Agents must:

1. Read the open issue list, ordered by `P0`–`P3` priority tier (`kaola-workflow-claim.js list-open`)
2. Fetch open forge issues
3. Classify candidates as green/yellow/red/blocked (using parallel-work guidance if multi-session)
4. Select the best match based on priority, dependencies, and phase completion
5. Pass the chosen issue number via `KAOLA_TARGET_ISSUE=N` before calling `/workflow-next`

The startup script validates the agent's choice:
- Issue must be unclaimed (no active folder)
- Issue must be green or yellow (not blocked or red)
- No duplicate active folder for the same issue

If the agent does not provide an explicit target issue, startup answers `verdict: no_target` at exit 0 and claims nothing — even when exactly one active folder is present. When resuming a sole active folder, the agent must:

```bash
STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
```

Then call `/workflow-next` with `KAOLA_TARGET_ISSUE` set. Startup will return `verdict: owned`.


### PR sink

The sink mode is set at claim time and determines how Finalization delivers the completed work. Two paths are available:

**Intent detection** (recommended): If the user's initial prompt contains PR intent keywords ("open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink"), the agent exports `KAOLA_SINK=pr` before the startup call. Startup Step 0 passes `--sink pr` to `claim`, which writes `sink: pr` to the `## Sink` block of `workflow-state.md`. Finalization dispatches to `kaola-workflow-sink-pr.js` (GitHub), `kaola-gitlab-workflow-sink-mr.js` (GitLab), or `kaola-gitea-workflow-sink-pr.js` (Gitea).

**Auto-fallback**: When `sink: merge` is configured and the push to main fails with a merge-impossible error (branch protection, non-fast-forward, or permission denied), Finalization automatically pivots to PR creation. `sink-merge.js` writes a `.cache/sink-fallback.json` receipt and exits 3. Finalization calls `claim.js sink-fallback` to update the Sink block (`sink: pr`, `sink_fallback_reason: <reason>`), then dispatches to `kaola-workflow-sink-pr.js`. If the project was already archived before the push failure, the receipt write is skipped to prevent resurrecting a phantom active folder (issue #216).

**`pr_auto_merge` config key** (`~/.config/kaola-workflow/config.json`):

```json
{
  "pr_auto_merge": false
}
```

- `false` (default): open PR and watch for manual merge; `watch-pr` detects MERGED/CLOSED and archives the active folder automatically
- `true`: open PR and also call `gh pr merge --auto --squash --delete-branch` (requires branch protection rules to be enabled on the repo; failure is non-fatal)

**`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`) (GitHub: `kaola-workflow-claim.js`; GitLab: `kaola-gitlab-workflow-claim.js watch-mr`; Gitea: `kaola-gitea-workflow-claim.js`):

Called automatically at `/workflow-next` startup. Scans active folders with `sink: pr` and `pr_url`. For each:
- `MERGED`: archives the folder as closed and clears advisory forge labels
- `CLOSED` (no merge): archives the folder as abandoned and clears advisory forge labels
- `OPEN`: leaves the folder active

The sink-merge script automates the final merge sequence after Finalization's
final commit gate: fetch, rebase onto `origin/main`, fast-forward merge with
retry on race conditions, push, close the issue, and clean up the branch.
When offline, the PR sink writes a placeholder receipt so the workflow can
resume online later.

## Backlog cycle

Use a separate research session to discover future work and create or refine forge issues. `/workflow-next` is the implementation cycle: it reads the open issue list ordered by `P0`–`P3` priority tier, reads each shortlisted candidate's body and comments (comments override the body), advances one explicitly selected set of issues — normally three to five, sometimes one — then comments on or closes the linked issues after validation.

The forge is the backlog; there is no local mirror to keep current. `kaola-workflow/.roadmap/_rules.md` is the one optional local file that survives, for standing project-local rules read directly by the pick step; completed workflow folders move to `kaola-workflow/archive/`.

The workflow also encourages context discipline: `CLAUDE.md` has a recommended size of under 200 lines — advisory, never enforced, so a longer file draws a notice and an offer to trim rather than a failure — and agent prompts should include only the relevant excerpts needed for the delegated task.

Each active workflow maintains two files: `workflow-state.md`, which records what the run owns — issue, branch, worktree, sink, next command — and `mission-list.md`, which records what it is doing. After resume or compaction, read both before continuing.

Avoid redundant validation runs: an item that only touches implementation runs targeted affected checks, an item that only fixes review feedback validates just the fix or cites existing evidence, and Finalization runs each full final command once against the final candidate state. Small targeted commands may run in the main session, while expensive or noisy test/lint/type/build commands should be delegated and summarized from cache evidence.

## Hook policy

Kaola-Workflow ships two Claude Code hooks via `install.sh`. They run
silently in the background as background hygiene — they do not replace
workflow validation, and `/workflow-next` should not re-run a check the
hook already performed unless the phase requires broader validation or
the relevant files changed after the hook fired. Hook output counts as
workflow evidence only when recorded with command, scope, result, and
evidence path.

### Installed hooks

| Hook ID | Event (matcher) | Purpose | Script |
|---------|-----------------|---------|--------|
| `kaola-workflow:compact-context` | `SessionStart` (`compact`) | After Claude Code's `/compact`, injects a resume hint (active project, current phase, current step, next command, fallback authorization) read from the most recent `workflow-state.md` | `scripts/kaola-workflow-compact-context.js` |
| `kaola-workflow:subagent-dispatch-log` | `SubagentStart` (`*`) | Records each subagent spawn (`agent_type`, `agent_id`, `cwd`) as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` — an advisory spawn record; no check consumes it. Fail-open | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

### Codex lifecycle hooks

Codex wires the same two hooks via `install-codex-agent-profiles.js` (run by the
Codex `kaola-workflow-init` skill and re-run on every upgrade). Since #447, hooks
install **globally** into `~/.codex/hooks.json`; their scripts land in the stable,
version-less home `~/.codex/kaola-workflow/{hooks,scripts}`. The hooks are NOT in the
Codex plugin manifest (`plugin.json`) — they are separate from the plugin bundle.
Installing into `~/.codex` means one install covers all projects on the machine and
a plugin upgrade force-refreshes the global copy; no per-repository re-init is needed
to pick up hook changes. The stable scripts home (`#409`) ensures hook commands
survive plugin GC or a worktree purge — `codex plugin add` / upgrade never overwrites
those paths.

| Hook ID | Event (matcher) | Purpose | Script |
|---------|-----------------|---------|--------|
| `kaola-workflow:compact-context` | `SessionStart` (`compact`) | After Codex context compaction, injects a resume packet (active project, goal, next skill, in-flight items with their dispatched locators, progress counts) from `kaola-workflow-codex-compact-resume.js`. Also still invokable on demand via stdin. | `scripts/kaola-workflow-codex-compact-resume.js` |
| `kaola-workflow:subagent-dispatch-log` | `SubagentStart` (`*`) | Records each subagent spawn to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` — an advisory spawn record; no check consumes it. Fires only with Codex `multi_agent` enabled | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

**Caveats and preconditions:**

- **`/hooks` one-time trust step:** after install, run `/hooks` once in Codex to
  review and trust the command hooks (content-hash trust; editing a hook marks it
  untrusted again), then exit and follow the post-trust installer + doctor sequence
  under *Trust the hooks* above. For automation use
  `codex exec --dangerously-bypass-hook-trust`.
- **`multi_agent` precondition:** `SubagentStart` provenance requires Codex
  `multi_agent` enabled. With it off the hook never fires and no spawn record is
  written — non-fatal; the log is advisory.
- **Matcher note:** the `PreToolUse`/`PostToolUse` matchers (`Bash`, `Write|Edit`)
  follow Claude Code tool names; if a Codex build uses different tool-event names the
  matcher string in `~/.codex/hooks.json` may need adjustment.
- **Uninstall scope:** because hooks are global, `uninstall.sh` strips the managed
  `kaola-workflow:` entries from `~/.codex/hooks.json` (not from a project-local file).
  Agent profiles and the managed config block are removed from the project directory
  you run `uninstall.sh` in.

### Installation and verification

- `install.sh` copies hook files to `~/.claude/kaola-workflow/hooks/`, support
  scripts to `~/.claude/kaola-workflow/scripts/`, and auto-merges the two
  managed hook entries into `~/.claude/settings.json`.
  The merge is idempotent and identifies managed entries by `id` prefix
  `kaola-workflow:` or a command path containing `kaola-workflow`. Prior
  settings are backed up under
  `~/.claude/backups/settings.json.kaola-workflow.<ts>.bak`.
- Verify with `jq '.hooks' ~/.claude/settings.json` — expect the two ids
  above, with scripts under `~/.claude/kaola-workflow/hooks/` or
  `~/.claude/kaola-workflow/scripts/`.
- Subagent model selection comes from slash-command dispatch, not from a
  status-line override: the installer renders each installed agent's resolved
  model into concrete `model="..."` lines in the slash commands.
- If hooks are missing, re-run `./install.sh --forge=github` (or
  `--forge=gitlab` or `--forge=gitea`). Do not edit `~/.claude/settings.json` directly —
  re-running the installer is the supported path.
- Fallback when `python3` is unavailable or `--no-settings-merge` was
  passed: `install.sh` prints a manual hint and the source of truth is
  `~/.claude/kaola-workflow/hooks/hooks.json`. Merge its `hooks` block
  into the user's `~/.claude/settings.json` `hooks` object, preserving
  any non-`kaola-workflow:` entries.
- `install.sh` and `uninstall.sh` remove the legacy managed Kaola
  `subagentStatusLine` entry from earlier issue #141 installs when it is still
  present. User-owned status lines are preserved.

Finalization still owns the final full validation gate. It also reconciles
documentation with code changes and issue state, routes deferred
items or conflicts to the user before closing, and
leaves commit-and-push as the final step on a clean, synced workspace.

## Resuming

**This is what the mission list is for.** A successor with no context reads
`kaola-workflow/{project}/mission-list.md` top to bottom: the H1 is the goal, `done` items with their
`result` are what is already known, `todo` items are what remains. The `in-flight` items are the only
decision to make.

**Look for the work, not for the worker.** `dispatched` records what went out, not whether it is
still running, and a successor usually cannot probe the liveness of a process it did not start. So
check the locator: if the output the dispatch promised has landed — the file exists, the commit is in
git — close the item and write its `result`. If it has not, re-dispatch, unless you can positively
show the dispatch is still alive. Re-dispatching read-only work costs a little time; waiting on a
worker that died costs the run. That is the entire recovery procedure.

`workflow-state.md` carries the claim itself — issue, branch, worktree, sink. If it is missing or
unreadable but the folder's contents identify the run unambiguously, reconstruct it conservatively
and say that you did. If it is genuinely ambiguous, ask.

Hook installation is covered in the [Hook policy](#hook-policy) section above —
do not hand-merge entries into `~/.claude/settings.json`.

## Keep-open partial-close sinks

When a run is complete as a cycle but its issues must **stay open** (partial implementation, residual follow-ups), the main session writes `issue_action: comment_keep_open` into the `## Sink` block at the Closure Decision Gate (issue #336). That choice is **whole-run** — it takes every member of the claimed set with it, including members whose own work finished cleanly. Finalization then runs the full mechanical sink with **no manual FF-push cleanup**: `finalize --keep-open`/`--keep-issue-open` archives the folder as `closed_keep_open` (there is no local roadmap source left to preserve); `sink-merge --keep-issue-open` merges, pushes, removes the worktree/branch, and releases the claim on every issue left open — **both** artifacts, the `workflow:in-progress` label and the `kw:claim` marker comment, where a normal close removes the label alone because a marker on a closed issue is inert — but posts a keep-open comment instead of closing them. Keep-open is **merge-sink-only** — a PR/MR sink would auto-close the issue via its `Closes #N` body, so the PR/MR sink (including the exit-3 merge-impossible auto-pivot) is refused with a typed BLOCKED, and the `sink-pr`/`sink-mr` scripts themselves refuse a project carrying `issue_action: comment_keep_open`.

## Multi-issue bundle lane

The bundle lane lets N issues share one worktree, one branch, one mission list, and one finalization that closes all N issues together. It is the normal shape of a run — three to five issues; the single-issue path remains, for the issue that must run alone.

### Two entry modes

1. **Single issue** — `--target-issue N` or `KAOLA_TARGET_ISSUE=N`. No bundle fields.

2. **Bundle** — pass `--target-issues A,B,C` (comma-separated, sorted+deduped) or set `KAOLA_TARGET_ISSUES=A,B,C`. The claim script validates all targets before any mutation (all-or-nothing: if any target is invalid the whole bundle is refused). On success, one `kaola-workflow/bundle-A-B-C/` folder is created and one `workflow/bundle-A-B-C` branch is provisioned (forge editions prefix the edition name, e.g. `workflow/gitlab-bundle-A-B-C`).

Which mode applies is the orchestrator's call, made while reading the backlog: issues share a run when they are all open, unclaimed, and each closeable on its own evidence — finishing one does not depend on how another turns out. Sharing a scope is one route to that and buys a shared investigation; disjoint write surfaces are the other, and buy real concurrency — prefer disjoint when both are on offer. That is a shape judgement and nothing caps it — say which issues you bundled and why, and if you took fewer than three, say what you passed over.

An issue runs alone when it moves something the other members read — a schema, an envelope shape, a routing skeleton, a shared constant; when closing it needs a value call from the user, since all-or-nothing closure would hold every finished sibling behind that one decision; or when its scope is not knowable until it has been investigated. Size is not the test: a large change inside one module bundles fine, and a one-line change to a shared anchor does not.

Setting both `--target-issue` and `--target-issues` (or both env-var equivalents) answers `target_ambiguity` usage at exit 0; no state is written either way.

### Bundle claim semantics

`claimExplicitBundle` validates every issue in the set before mutating anything. If any single target fails validation the entire bundle is refused and no active folder is created. Bundle SIZE is not one of those validations — how many issues a claim takes is the orchestrator's call, so a wide set acquires and the envelope carries `bundle_size_note` (the count plus the recommended ceiling of 8) as advice. Only a set larger than 8 draws the note; the three-to-five norm is guidance for choosing a set, not a second threshold anything checks. Claim outcome codes (`target_ambiguity` exits 0; the rest exit non-zero):

| Code | Meaning |
|------|---------|
| `target_ambiguity` | Both scalar and multi-target provided simultaneously (usage answer, exit 0) |
| `target_set_empty` | Resolved issue list is empty after dedup |
| `target_set_conflicts_active_work` | One or more targets overlap an already-claimed active folder |
| `target_set_has_closed_issue` | One or more targets are already closed on the forge |
| `target_set_red` | One or more targets are red (conflict) per the classifier |
| `target_set_unavailable` | Remote validation failed (forge unreachable) |
| `target_set_unverified` | Offline with no local evidence for one or more targets |
| `target_set_label_rollback_failed` | Claim succeeded but in-progress-label rollback on partial failure itself failed |

### All-or-nothing finalization

`cmdFinalize` on a bundle project closes every issue in `issue_numbers` and archives the single bundle folder. Partial closure is not a success state — if one issue close fails the attempt is retried or surfaced as a failure.

## Parallel active work

Multiple Kaola-Workflow runs can coexist when each targets a distinct active folder. The source of truth is `kaola-workflow/{project}/workflow-state.md`, with the configured forge's issue state used to reject closed issues and PR/MR state used by `watch-pr` (or `watch-mr` on GitLab).

- Startup requires an explicit `--target-issue N` or `--target-issues A,B,C`; the agent chooses the issues and scripts validate them.
- Claiming uses atomic folder creation, so two agents cannot create the same `kaola-workflow/{project}/` folder.
- `status` lists active folders; `release` archives abandoned work; `finalize` archives completed work.

### Parallel execution examples

Run one session per claimed set in separate terminals. Each `/workflow-next`
claims its own `kaola-workflow/{project}/` folder atomically, and the
classifier ensures the chosen issues are green or yellow (no red conflicts)
before claiming.

Claude Code, two terminals:

```text
# Terminal A
cd ~/Workspace/Kaola-Workflow
/goal use the kaola-workflow commands to finish issue #42.

# Terminal B (same repo, different shell)
cd ~/Workspace/Kaola-Workflow
/goal use the kaola-workflow commands to finish issue #43.
```

Codex, same pattern (requires `goals = true` under `[features]` in
`~/.codex/config.toml`; without that flag, drop the `/goal ` prefix and
the skill's embedded `## Goal Contract` still drives continuation):

```text
# Terminal A
cd ~/Workspace/Kaola-Workflow
/goal use the workflow-next skill to finish issue #42.

# Terminal B
cd ~/Workspace/Kaola-Workflow
/goal use the workflow-next skill to finish issue #43.
```

By default, every claimed set runs in a
repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`, so file edits
in one run do not interfere with another (set `KAOLA_WORKTREE_NATIVE=0` to
disable).

To drive several issues from a single session instead of several
terminals, scope the goal text accordingly:

```text
/goal use kaola-workflow to finish issues #42, #43, and #44, one at a
      time, in dependency order.
```

### Per-claim Git worktrees

By default, `kaola-workflow-claim.js` provisions a Git worktree on every
claim so each claimed set has its own
checkout — separate from the main repo checkout and from every other active
run. A claim covering several issues is one project and one worktree, not one
per member. Set `KAOLA_WORKTREE_NATIVE=0` to disable (a repo-root run, no
worktree).

**Why.** With one shared checkout, two parallel sessions stepping on the
same files would collide on branch switches and stash state. A
per-claim worktree gives each session its own working tree, so file
edits, builds, and node runs in one run do not affect another.

**Where.** Worktrees live at `<repo-root>/.kw/worktrees/<project>/`.
If the main repo is `~/Workspace/Kaola-Workflow`, the worktree for
project `issue-42` is `~/Workspace/Kaola-Workflow/.kw/worktrees/issue-42/`.
The `.kw/` directory is git-ignored. The absolute path is recorded in the
active folder's Sink block as `worktree_path`, so workflow commands can resolve
the linked worktree without consulting a lock file.

**How the workflow uses it.** The workflow resolves `ACTIVE_WORKTREE_PATH` at
startup — when `KAOLA_WORKTREE_NATIVE=0` it is the current directory; when
`KAOLA_WORKTREE_NATIVE=1` it is the claimed set's worktree.
All `git`, `cp`, and path operations during the run are then anchored at
that root. Finalization's sink-merge runs against the worktree; `finalize`
removes the worktree by default after archiving the active folder, or
preserves it with `--keep-worktree` for the final commit gate.

**Listing and removal.** `kaola-workflow-claim.js worktree-status` lists
all active workflow worktrees with their issue, branch, and folder
metadata. `worktree-finalize` mirrors the final artifacts into the
linked worktree and commits them. The workflow uses `.kw/` inside the repo; a
sibling container (`<repo-parent>/<repo-name>.kw/`) is not used. Run
`kaola-workflow-claim.js legacy-worktree-cleanup` (dry-run by default;
add `--execute` to perform) to remove any worktrees still registered
under it. Dirty worktrees are skipped unless `--archive`, `--export`, or
`--force` is passed; branch refs are preserved.

## Release versioning

Current official release versions:

- Claude Code command install, GitHub edition: `9.17.0`
- Claude Code command install, GitLab edition: `9.17.0`
- Claude Code command install, Gitea edition: `9.17.0`
- Codex `kaola-workflow` plugin manifest: `7.17.0`
- Codex `kaola-workflow-gitlab` plugin manifest: `7.17.0`
- Codex `kaola-workflow-gitea` plugin manifest: `7.17.0`

The root `package.json` version is the official repository and Claude Code
command-install release version. The GitLab Claude command pack follows that
same version through the root release. Codex plugins have their own manifest
versions in `plugins/*/.codex-plugin/plugin.json`; bump the affected Codex
manifest whenever that plugin's install surface, skills, agent profiles, or
workflow behavior changes.

The root `kaola-workflow--v<X.Y.Z>` tag is the single source of truth for the
entire release surface, **including** these Codex manifest versions. A Codex
manifest bump is a release-surface change: it must ride a new root version + tag,
not land on the default branch after the tag for the current root version. The
full `npm test` enforces this — it fails when a Codex manifest version differs
from the value recorded at the `kaola-workflow--v<package.json version>` tag
(unless `KAOLA_WORKFLOW_OFFLINE=1` is set).

The npm package includes `"plugins/"` in `package.json#files`, so all three
Codex packs and the GitLab Claude command sources are part of the packaged
release surface.

Use SemVer for both versions:

- `MAJOR`: breaking command, artifact, plugin, or workflow-contract changes.
- `MINOR`: backward-compatible workflow capabilities, agent roles, install features,
  or new automation.
- `PATCH`: compatible bug fixes, validation fixes, documentation-only updates,
  or small install clarifications.

`scripts/kaola-workflow-release.js` scripts a split release transaction. `--prepare`
edits and receipts the release surface but cannot authorize or create a tag; `--tag`
accepts only a committed, fully validated candidate whose receipt, commit, chain
receipt, and tree all agree. `--cut` is retained only as a typed refusal that prints
the replacement sequence. `--push` emits forge-neutral publication guidance and
does not invoke a forge CLI. See `docs/conventions.md` § "Release cutting" and
`docs/decisions/D-661-01.md`.

Official release checklist (run the steps in order):

```bash
# 1. Prepare exactly the release surface (optionally choose the independent
#    Codex-series version explicitly).
node scripts/kaola-workflow-release.js --prepare --version X.Y.Z
# node scripts/kaola-workflow-release.js --prepare --version X.Y.Z --codex-version A.B.C

# 2. Commit only CHANGELOG.md, README.md, package.json, the three Codex
#    manifests, and the two Claude manifests. This must be one release-only
#    commit from the baseline recorded by prepare.
git add CHANGELOG.md README.md package.json \
  plugins/kaola-workflow{,-gitlab,-gitea}/.codex-plugin/plugin.json \
  plugins/kaola-workflow-{gitlab,gitea}/.claude-plugin/plugin.json
git commit -m "chore: release X.Y.Z"

# 3. Run every declared edition chain offline at that clean candidate. Offline
#    suppresses the tag-existence check; it does not weaken chain greenness.
KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js

# 4. Independently check that the full, unwaived, all-green receipt is clean
#    and bound by exact SHA to HEAD.
node scripts/kaola-workflow-run-chains.js --release-check

# 5. Authorize and create the tag. The command verifies candidate provenance,
#    receipt coherence, raw candidate bytes, and raw tag-tree bytes.
node scripts/kaola-workflow-release.js --tag --version X.Y.Z

# 6. Validate with the tag present.
npm test

# 7. Push only the named tag, then publish against that pushed tag using the
#    appropriate forge-specific release command.
git push origin kaola-workflow--v<X.Y.Z>
node scripts/kaola-workflow-release.js --push
```

Any rebase or extra commit changes the candidate SHA. Do not move a release tag
around the transaction: prepare again from a clean baseline, make a new
release-only commit, restamp all chains, re-run `--release-check`, and invoke
`--tag` again. The tag command itself verifies that the tag resolves to candidate
HEAD and that every prepared file in the tag tree matches the recorded raw bytes.

Tag rules:
- Tag only through the checked `--tag` transaction; it targets candidate HEAD.
- GitHub/main tag (`kaola-workflow--v<X.Y.Z>`) is required. GitLab tag
  (`kaola-workflow-gitlab--v<X.Y.Z>`) is optional (no 3.12.0 GitLab tag
  was published — intentional). Gitea has no separate release tag.
- Never use `--tags` or `git push origin main --tags`; push only the
  single new tag by name.

Create a tag only when publishing a tagged release. For normal development
pushes, update the versions and changelog, run validation, commit, and push the
branch.

## Updating

If installed via one-liner, re-run it:

```bash
curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash
```

If installed from a local clone:

```bash
cd Kaola-Workflow
git pull
./install.sh
```

To converge every runtime from one synchronized checkout, reinstall each runtime explicitly
(replace the Codex marketplace selector with the installed row reported by
`codex plugin list --json`):

```bash
git pull --ff-only

# Claude Code — choose the forge actually used on this machine.
./install.sh --yes --forge=github

# Codex — refresh the marketplace, replace the selected cached plugin, then copy
# its validated role profiles/hooks into the global runtime authority. Remove+re-add
# both the plugin and the marketplace itself; for a local-path marketplace (the
# default from the Install steps) this re-reads the working tree directly, no
# clone/network involved. (`codex plugin marketplace upgrade` only applies if you
# registered the marketplace from a git URL/ref instead — it fails outright for a
# local-path marketplace and otherwise requires a fresh network clone every time.)
codex plugin remove kaola-workflow@<marketplace>
codex plugin marketplace remove <marketplace>
codex plugin marketplace add ~/kaola-workflow
codex plugin add kaola-workflow@<marketplace>
node <active-plugin-root>/scripts/install-codex-agent-profiles.js --global

# opencode — additive runtime, global install.
./install-opencode.sh --global --yes

# Kimi Code — additive runtime, global install.
./install-kimi.sh --global --yes

# Grok CLI — additive runtime, global install.
./install-grok.sh --global --yes

# Cursor — additive runtime, global install.
./install-cursor.sh --global --yes
```

Restart Claude Code after reinstalling. If Codex hook content changed, open a new
Codex session, use `/hooks` to renew trust for the changed entries, exit, and
follow the post-trust installer + doctor sequence under *Trust the hooks* above.
Start the working Codex chat/session only after that final doctor returns `status: ok`;
the generated reviewer roles should then load without malformed-agent warnings.

## License

Kaola-Workflow is released under the MIT License — see [LICENSE](LICENSE)
for the full text. The vendored Claude Code agent prompts under
`agents/` are derived from Everything Claude Code (ECC) and are also
MIT-licensed; their pinned upstream commit and attribution live in
[docs/agents-source.md](docs/agents-source.md).
