# Kaola-Workflow

**Loop engineering for coding agents.** Instead of prompting an agent and hoping, you hand Kaola-Workflow an issue and it designs the loop that prompts the agent for you: a **task-shaped DAG of role nodes** sized to the issue, each node running inside a verified act → check → close cycle, with fail-closed **exit conditions**, adversarial **verification loops**, and **durable state** that survives sessions and context resets — all inside a locked claim → worktree → *free design* → Finalization frame. Runs on three agent runtimes — **Claude Code, Codex, and [opencode](https://opencode.ai)** — across the **GitHub, GitLab, and Gitea** forges. A fast single-pass path and the classic full phase sequence remain as optional alternatives.

## Philosophy

**You don't prompt the agent. You design the loop.**

The leverage in agentic coding has moved from writing prompts to engineering the loops that run agents: what feeds them context, what verifies their output, and what decides whether to iterate, escalate, or stop. Kaola-Workflow is that loop, engineered with discipline — no *loopmaxxing*. Every loop has a grader, a circuit breaker, and a fail-closed exit condition, because an unverified iteration is just expensive noise. The point is not loops that run unattended; it is **loops that are safe to leave running**.

That discipline comes from one creed:

**Make coding agents do more — more automation, less manual toil, faster results — without ever trading away accuracy.**

The creed is codified as five **first-principles axioms** (`templates/axioms.md`), applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal. When they conflict, the higher one wins:

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome there is.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own — CI, an external service — be the judge of done.

The axiom layer is embedded byte-identically into every generated project's guidance (all six `workflow-init` surfaces, with a machine-enforced drift guard) and is **tighten-only**: an axiom may make an agent stricter, but never licenses skipping a typed gate, refusal, or barrier.

A few beliefs follow from that order.

**Correctness *is* efficiency.** Independent, adversarial verification and **fail-closed** checkpoints catch mistakes before they compound. Preventing rework is the cheapest optimization there is.

**Parallelism is a means, not a goal.** The agent runs genuinely independent work at the same time to save you time — but it never forces fan-out for its own sake. Over-parallelizing just burns tokens and context for no real gain. **Width is sized to the true shape of the task.**

**One engine, not a mode per problem.** A single adaptive planner composes a task-shaped plan for *any* kind of work — building a feature, fixing a bug, or investigating an open question — from a small set of **reusable roles**. There's no separate pipeline to learn for each problem type.

**Spend to match the work.** Parallel width, number of agents, and model strength all scale to the genuine scope of the issue. Small work stays small. Nothing is over-engineered.

**Humans decide what only humans should.** The system investigates and resolves questions of **fact** on its own. It escalates genuine matters of **judgment, value, and taste** to you.

### The loop vocabulary, mapped to mechanisms

Every loop-engineering concept here is backed by a concrete mechanism — nothing is framing without a script or gate behind it:

| Loop-engineering concept | Kaola-Workflow mechanism |
|---|---|
| Agent loop | Per-node role execution via the running-set scheduler |
| Verification loop / grader | Adversarial verifier + fail-closed quality gates |
| Exit condition | Post-dominance gates and the finalization sink — nodes close on recorded evidence, not on exit-0 |
| Circuit breaker | Bounded planner repair → discard + restart → stop and ask; never a silent fallback |
| Durable state tracking | `workflow-state.md`, the frozen plan ledger, and per-node evidence — resumable across sessions and context resets |
| Human-in-the-loop escalation | Consent-halt valve: facts are resolved autonomously, judgment goes to you |
| Outer loop | `/goal` cross-turn autonomy toward one objective |
| Harness | The locked claim → worktree → free design → finalization frame |

### What you get

- **Engineered loops, not one-shot prompts** — every node runs act → verify → close, and the run iterates, escalates, or stops on explicit conditions, never on hope.
- **Adaptive, task-shaped planning** sized to each issue — plus optional fast single-pass and full 6-phase paths.
- **Multi-model** across Claude Code, Codex, and opencode, right-sizing the model for each step.
- **Parallel where it's safe, serial where it isn't** — concurrency only for genuinely independent work. Write frontiers the planner proves **disjoint** co-open as isolated parallel legs **by default** (per-leg worktree isolation + a mandatory synthesizer reconcile are the correctness net); only genuinely-overlapping writes stay serial/consent-gated, and any host without worktree support degrades to serial.
- **Independent adversarial verification** plus fail-closed quality gates.
- **Optimize-shaped work** ("make it faster / smaller / less flaky") via a bounded metric-ratchet role — direction, not destination, with a regression gate on every step.
- **Durable per-step artifacts** with full resumability across sessions and context resets.
- A locked **claim → isolated worktree → free design → finalization** frame.
- **Three agent runtimes** (Claude Code, Codex, opencode) across **three forges** (GitHub, GitLab, Gitea).
- **Goal-driven autonomy** via `/goal` — keep a session working toward one objective across many turns.

## Overview

```
   /workflow-init       once per project — generates CLAUDE.md,
        │               ROADMAP.md, and the docs map
        ▼
   /workflow-next       per cycle — resumes from
        │               kaola-workflow/{project}/workflow-state.md
        │
        ├──► Adaptive path  ★ DEFAULT
        │      the agent freely composes a task-shaped DAG of role nodes,
        │      sized to the issue — sequence, fan-out, loop, or select —
        │      then runs it node-by-node ──────────────────► Finalization
        │
        │      ┄┄ optional alternatives (explicit opt-in) ┄┄
        │
        ├──► Fast path (KAOLA_PATH=fast)
        │      plan + implement + review in one pass ──────► Finalization
        │
        └──► Full 6-phase flow (KAOLA_PATH=full)
            1 Research → 2 Ideation → 3 Plan → 4 Execute → 5 Review
                                       │
                                       ▼
   Finalization   doc-updater · sink-merge | sink-pr
                  archive folder, close issue,
                  push branch or open PR, refresh ROADMAP.md
```

## Autonomy and goal contract

Kaola-Workflow is goal-driven — `/goal` is the **outer loop** around the
per-issue workflow loop. Use it in either Claude Code or Codex to keep a
session working on a single objective across many turns until the
platform's stop condition is satisfied. The Kaola-Workflow Codex
skills also embed a `## Goal Contract` for phase-level continuation that
works even when `/goal` is not in play.

### Using `/goal` with Claude Code or Codex

`/goal` originated in Codex and was adopted by Claude Code. Both
platforms treat it as a stop-condition wrapper: you type a goal in plain
language and the session keeps working without pausing until the goal is
satisfied (or the platform's budget runs out).

**Claude Code.** `/goal` is built in from v2.1.139+. An evaluator model
checks the goal at the end of every turn; the session continues up to a
default cap of 500 turns. Examples:

```text
/goal use the kaola-workflow commands to finish issue #42.
/goal finish phase 4 for issue #42 — all tasks done, validation green,
      phase4-progress.md updated.
/goal use kaola-workflow to finish all remaining open issues, one at a
      time, until ROADMAP.md has no active entries.
```

**Codex.** `/goal` is gated behind a feature flag in current Codex CLI
versions — enable it by setting `goals = true` under `[features]` in
`~/.codex/config.toml`. The runtime continues until the goal reaches
`complete` or `budget_limited`. Examples:

```text
/goal use the workflow-next skill to finish issue #42.
/goal use the workflow-next skill to finish all remaining open issues.
```

Each Kaola-Workflow Codex skill also embeds a `## Goal Contract` section
that holds a phase-level continuation rule. That contract is independent
of the platform `/goal` and applies even when `/goal` is not active —
invoking a skill alone (for example, `Use the workflow-next skill
to finish issue #42.`) is enough to keep it working until its phase
objective, evidence, and `workflow-state.md` next pointer are complete.

Routine workflow bookkeeping is autonomous. Generated project/folder names,
collision suffixes such as `-2`, cache/artifact paths, and ordering that does
not affect user intent should be chosen automatically and recorded. Essential
technical decisions should be made with the orchestrator's own judgment, then
applied and recorded. Prompt the user only for true external authorization or
materially user-owned choices, such as risky Git synchronization, destructive
rewrites,
credential or deployment actions, or issue/roadmap reorganization.

Each `/workflow-next` run targets one issue and ends at Finalization closure.
The agent does not auto-continue across issues; cross-issue work requires
explicit user direction — typically stated upfront in `/goal` text (for
example, "finish all remaining open issues"), which then drives one
`/workflow-next` run per issue until the scope is met.

## Workflow roles

Every path is built from a small, shared set of **roles**. All three runtimes provide the same role set — Claude Code installs vendored agents, Codex installs native `.toml` role profiles, and opencode generates `.opencode/agent/` definitions — so the roles, phases, and model tiers below apply across runtimes.

Claude Code's agents are vendored directly from this repository; the prompts are derived from Everything Claude Code (ECC) under the MIT License (see [docs/agents-source.md](docs/agents-source.md) for the pinned upstream commit, attribution, and refresh procedure).

| Agent | Phase | Model | Higher profile |
|-------|-------|-------|----------------|
| `code-explorer` | 1 — Research/Discovery (code facts) | Sonnet | |
| `knowledge-lookup` | 1 — Research/Discovery (external docs, when needed) | Sonnet | |
| `planner` | 2 — Ideation | Opus | |
| `code-architect` | 3 — Plan | Sonnet | yes |
| `tdd-guide` | 4 — Execute (per-task TDD executor) | Sonnet | |
| `implementer` | 4 — Execute (implementation without test-first ceremony; refactors, scaffolding, config, UI, migrations) | Sonnet | |
| `build-error-resolver` | 4–6 — Validation repair when needed | Sonnet | |
| `code-reviewer` | 5 — Review | Sonnet | yes |
| `security-reviewer` | 5 — Review (conditional) | Sonnet | yes |
| `doc-updater` | 6 — Finalization | Sonnet | |
| `adversarial-verifier` | Adaptive path — read-only skeptic (never a gate) | Sonnet | |
| `contractor` | All paths — mechanical bookkeeper (runs scripts + writes durable state; never a gate) | Sonnet | no |
| `workflow-planner` | Adaptive path — front-end (claims + authors the `## Nodes` DAG; runs the handoff which freezes mechanically) | Opus | no |
| `issue-scout` | Bundle lane — read-only selection agent (recommends same-scope issue sets; never claims, writes, or dispatches) | Sonnet | yes |
| `synthesizer` | Adaptive path — parallel-write convergence (reconciles concurrent write legs by intent on a real merge conflict) | Opus | no |
| `metric-optimizer` | Adaptive path — bounded metric-ratchet for optimize-shaped work (propose → apply → gate → measure → accept or revert) | Sonnet | |

The **Model** column is the `common` profile. The **default** install profile is
`higher`, so the four agents marked _yes_ (`code-architect`, `code-reviewer`,
`security-reviewer`, `issue-scout`) install on **Opus** unless you pass
`--profile=common`.

On the current Codex runtime, role profiles own the pair. Eight carry-out roles (`code-explorer`,
`knowledge-lookup`, `tdd-guide`, `implementer`, `doc-updater`, `issue-scout`, `contractor`, and
`metric-optimizer`) pin `gpt-5.6-sol` at `medium`. The remaining planning, architecture, repair,
review, security, adversarial, workflow-planning, and synthesis roles use standalone profiles that
pin `gpt-5.6-sol` at `xhigh`. No Kaola role inherits its pair from the parent. The legacy
`opus`/`sonnet` plan aliases remain accepted as `reasoning`/`standard`, but a node tier must match its
role's static profile class; a mismatch is refused before spawn.

`adversarial-verifier` is locally authored for the [adaptive workflow](#adaptive-workflow-the-default-path)
(issue #227) rather than derived from ECC — a dedicated refute-by-default skeptic that
reuses no vendored profile. It is read-only (touches zero repository files), is exercised
only on the adaptive path, and is never a review gate. It installs on every edition
regardless of whether the adaptive path is enabled.

`contractor` is locally authored for the lean-orchestrator (issue #242): a mechanical Sonnet
bookkeeper that runs the workflow scripts and writes the durable bookkeeping (ledger rows, phase
files, `workflow-state.md`, roadmap, archive) at every seam, returning a compact summary. The main
Opus session keeps all judgment, dispatch, synthesis, and the sink/close. It never dispatches a
role, judges, gates, or asks the user, and stays Sonnet even under `--profile=higher` (there is no
`profiles/higher/contractor.md`).

`workflow-planner` is locally authored for the [adaptive workflow](#adaptive-workflow-the-default-path) front end: a
fixed-Opus agent the main session dispatches **once** at the start of the adaptive path. It runs the
claim/startup (worktree + `workflow-state.md`), **authors** the `## Nodes` DAG, per-node
`## Node Briefs` (each node's goal line — the durable node-to-node information channel,
hash-covered when present), plus an empty `## Node Ledger` into `workflow-plan.md`, runs the
plan-validator `--json` as a self-check, and then
**runs `kaola-workflow-adaptive-handoff.js`** — which freezes mechanically on `result:in-grammar`,
resume-checks, stages the roadmap, and writes `## Planning Evidence` into `workflow-state.md`
(preserving the `## Sink` block) — returning a checklist-backed packet (`handoff_status: ready_to_run`
with advisory `first_node` metadata on success; `plan_invalid` with no mutation on `refuse`). The
handoff does **not** open the first node or record its baseline — `/kaola-workflow-plan-run` owns the
complete node lifecycle including the first node, opening and dispatching every node via
`kaola-workflow-adaptive-node.js`. It never **judges** risk and never asks the user —
`decision:auto-run` vs `ask` is audit metadata recorded by the handoff; the run proceeds either way
with no approval gate. It never dispatches a subagent (a subagent cannot dispatch a subagent — it
returns control to main), and stays Opus regardless of profile (there is no
`profiles/higher/workflow-planner.md`). It is DISTINCT from the vendored read-only `planner`, which
stays a read-only in-plan node role.

`issue-scout` is locally authored for the [bundle lane](#multi-issue-bundle-lane-adaptive-only) (issue #328): a read-only selection agent the orchestrator may dispatch to recommend a same-scope issue set for a bundle claim. It reads forge issues, the local roadmap, and active folders to surface candidate sets, then returns a structured recommendation. It MUST NOT claim issues, write files, author plans, close issues, or dispatch other agents. Its output is advisory input — the orchestrator decides whether to proceed as a bundle. Since issue #646 its model tier is governed like the reviewers': the default `higher` profile installs it on Opus (`common` keeps Sonnet), and the router dispatches it with the install-rendered model rather than a hardcoded tier.

`synthesizer` is locally authored for the adaptive parallel-write path (issue #463): a reasoning-class (Opus) write-convergence specialist. When planner-proven-disjoint write legs co-open as isolated worktrees, the last member's close octopus-merges them mechanically; the `synthesizer` is dispatched **only** when that mechanical merge hits a real conflict, and reconciles the legs into the feature branch by *intent* rather than by textual hunks. It is never invoked for cleanly-disjoint legs and stays Opus regardless of profile (there is no `profiles/higher/synthesizer.md`).

`metric-optimizer` is locally authored for optimize-shaped work (issue #634) — *direction-not-destination* deliverables ("make it faster / smaller / less flaky") where no acceptance threshold is knowable at freeze. Each iteration of its bounded, budget-capped ratchet loop proposes a change, applies it, runs the regression gate, measures the metric (median-of-K), and accepts or reverts against the running baseline, until a stop condition fires. It is an ordinary `sequence`-shaped implement role — `code-reviewer` still post-dominates it, its contract lives in the plan's `## Meta` `optimize(<node-id>)` block, and a change-gate `adversarial-verifier` reproduces the final metric before finalize.

When agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. This makes Claude Code's built-in model badge render on every
subagent dispatch (the badge renders only when a concrete `model=` literal
differs from the agent's frontmatter). **After installing or re-running
`install.sh`, restart Claude Code for the model badges to take effect.**

> **Badge visibility by session model (Claude Code platform behaviour):**
> - **Session on Sonnet** — only Opus subagents show a badge. Sonnet-dispatched
>   agents (`code-explorer`, `tdd-guide`, `implementer`, `build-error-resolver`, `knowledge-lookup`,
>   `doc-updater`, `adversarial-verifier`, `contractor`, `metric-optimizer`) run silently.
>   Opus-dispatched agents (`planner`, `workflow-planner`, `synthesizer`, plus
>   `code-architect`, `code-reviewer`, `security-reviewer`, and `issue-scout` on the
>   default `higher` profile) badge as expected.
> - **Session on Opus** — all subagents show a badge, regardless of their model.
>
> The badge is a model-switch indicator: it renders when the subagent's model
> differs from the session's default. This is by design in Claude Code.

## Installation

### Runtimes and forges

Kaola-Workflow installs along two independent axes:

- **Agent runtime** — where the coding agent runs: **Claude Code**, **Codex**, or **opencode**. Each has its own installer.
- **Git forge** — where issues and PRs/MRs live: **GitHub** (default), **GitLab**, or **Gitea**.

| Runtime | Installer | Forge selection |
|---|---|---|
| **Claude Code** | `./install.sh [--forge=github\|gitlab\|gitea]` | `--forge` flag |
| **Codex** | `codex plugin marketplace add` + the matching plugin entry | per-plugin entry (`kaola-workflow`, `-gitlab`, `-gitea`) |
| **opencode** | `./install-opencode.sh` | — (runtime-only; no forge axis) |

Forge editions:

- **GitHub**: default. GitHub issues, pull requests, `gh`.
- **GitLab**: opt-in. GitLab issues, merge requests, `glab`.
- **Gitea**: opt-in. Gitea issues, pull requests, `tea` ≥ 0.9.2, Gitea server ≥ 1.17. **Forgejo** ≥ 1.18 is expected to work via the shared API surface but is not explicitly tested.

Claude Code and Codex share the forge editions — pick one forge at a time; all editions share the same command names. **opencode** is an **additive** runtime (like Codex — not a git forge): it has no separate forge editions, `./install-opencode.sh` touches none of the existing edition machinery, and it is fully **standalone** — it resolves its support scripts under `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts` and never touches `~/.claude/`, so it runs on a machine with no Claude Code installed. See [docs/opencode-edition.md](docs/opencode-edition.md).

**Path selection is identical across all three editions.** Adaptive is the unconditional default everywhere — Claude Code, Codex, and opencode — and `fast` / `full` are install-time opt-ins (`--with-fast` / `--with-full`) on every edition, never installed by default. Each installer records the opt-ins by UNION into the shared `~/.config/kaola-workflow/config.json` `installed_paths` field (canonical order `["fast","full"]`; a re-install never removes a prior opt-in), and the runtime gate refuses a path that is not installed with a typed `path_not_installed` — never a silent fallback. See [docs/decisions/D-543-01.md](docs/decisions/D-543-01.md).

### Claude Code

Claude Code installs use `install.sh` only. Do not install Kaola-Workflow through
the Claude Code plugin marketplace; `install.sh` copies the slash commands,
support scripts, optional hook config, and vendored agents into `~/.claude/`.
During install, slash commands render each installed Kaola agent's frontmatter
model into concrete `Agent(..., model="...")` examples so spawned subagents can
show Claude Code's built-in model badge.
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

#### Agent profiles

The default profile is `higher`: `code-architect`, `code-reviewer`,
`security-reviewer`, and `issue-scout` install on Opus (deeper threat modeling,
architecture analysis, and backlog clustering; roughly 3× cost for those four
agents). All other agents are unaffected. The `common` profile (those four on
Sonnet) must be requested explicitly with `--profile=common`.

```bash
./install.sh                              # GitHub edition, higher profile (Opus reviewers) by default
./install.sh --forge=gitlab               # GitLab edition, higher profile by default
```

To install the four profile-governed agents on Sonnet, request the `common` profile:

```bash
./install.sh --profile=common             # Sonnet assignments for the four profile-governed agents
```

#### Adaptive workflow path

The [adaptive workflow](#adaptive-workflow-the-default-path) — Kaola-Workflow's
**default path** — requires no configuration: a bare `./install.sh` installs the
adaptive path and nothing else. To also install the fast or full paths:

```bash
./install.sh --with-fast                 # adds the fast path (opt-in)
./install.sh --with-full                 # adds the full six-phase path (opt-in)
./install.sh --with-fast --with-full     # both opt-ins together
```

Adaptive is the unconditional default in `/workflow-next` — `fast` and `full` are
explicit path-naming escapes, available only when installed. Re-install unions what is
already installed with any new `--with-*` flags; it never removes a previously-installed
path. There is no per-session switch.

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
./install-opencode.sh --with-fast     # opt-in: add the fast path (adaptive is the default)
./install-opencode.sh --with-full     # opt-in: add the full six-phase path
```

The same `--with-fast` / `--with-full` opt-in semantics that `install.sh` exposes for Claude Code
apply here, recorded by UNION into the same shared `~/.config/kaola-workflow/config.json`. The
install seeds `opencode.json` with **two model tiers as reasoning-effort variants of your inherited model** — no model is pinned, so both tiers inherit whatever model you already use in opencode. The reasoning tier (the canonical `opus` roles plus the `higher`-profile reviewers) gets the model's **top** effort variant; the standard tier gets the **second** (e.g. `max` / `high` on GLM-5.2 and Anthropic, `xhigh` / `high` on OpenAI, `high` / `low` on Google). The mapping (`mapTier` + `CONTRACT_EFFORT_TABLE` + `contractForProvider`) is contract-keyed — the effort knob follows the model's API contract, not its brand name — and lives in `kaola-workflow-adaptive-schema.js`. Adaptive is the unconditional default path on opencode. Full detail: [docs/opencode-edition.md](docs/opencode-edition.md).

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

- Codex is installed and authenticated on your computer.
- Your computer can access this GitHub repository.
- Restart Codex after adding or updating the plugin.

Clone the repository, then register it with Codex from the local path:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git ~/kaola-workflow
codex plugin marketplace add ~/kaola-workflow
```

The local marketplace exposes all three entries: `kaola-workflow` for GitHub,
`kaola-workflow-gitlab` for GitLab, and `kaola-workflow-gitea` for Gitea.

For direct config enablement, add the desired entry to your Codex configuration:

```toml
[plugins."kaola-workflow@kaolabrother-kaola-workflow"]
enabled = true

[plugins."kaola-workflow-gitlab@kaolabrother-kaola-workflow"]
enabled = true

[plugins."kaola-workflow-gitea@kaolabrother-kaola-workflow"]
enabled = true
```

After restarting Codex, open your project and ask Codex to initialize the
selected workflow:

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
There is **no config key, trust file, or CLI flag that persists trust
non-interactively** — the only non-interactive option is
`codex exec --dangerously-bypass-hook-trust`, which skips the check for that single run
**without** persisting trust (use it only for automation that already vets the hook
sources). Until the hooks are trusted, compaction-resume, the commit-lane guard, and
subagent dispatch logging do not fire.

Update an existing Codex install (durable, stale-proof flow):

```bash
cd ~/kaola-workflow
git pull
# Refresh the cached plugin bundle Codex actually loads. Prefer the marketplace
# upgrade; fall back to remove+add when upgrade is unavailable or the cache is stale:
codex plugin marketplace upgrade kaola-workflow
#   or: codex plugin remove kaola-workflow@<marketplace> && codex plugin add kaola-workflow@<marketplace>
# Re-run the agent-profile installer globally (validates each profile schema, prunes
# retired Kaola files like docs-lookup.toml, writes the managed manifest
# ~/.codex/agents/kaola-workflow/.kaola-managed-profiles.json, and refreshes the
# global hooks at ~/.codex/hooks.json + ~/.codex/kaola-workflow/):
node <plugin-root>/scripts/install-codex-agent-profiles.js --global
# Inspect user / project / plugin-cache scope freshness (read-only doctor):
node <plugin-root>/scripts/kaola-workflow-codex-preflight.js --doctor --project-root <project-root> --json
```

Restart Codex to pick up the updated plugin files.

For the standalone-profile release, both refresh steps above are required: the plugin upgrade
replaces the cached source profiles, and the profile installer copies all 16 role TOMLs into the
active global/project scope. A plugin-only upgrade leaves stale generated profiles in place; the
doctor reports the mismatch instead of treating the install as current.

#### Config audit for effort-safe subagents

The profile installer refreshes Kaola-owned profiles, hooks, manifests, and the
managed `[agents.*]` block. It does **not** silently rewrite unrelated global
Codex feature settings. Treat `~/.codex/config.toml` as user-owned: audit it
first, then apply a minimal config delta only when the user has asked the agent
to configure this machine or explicitly approves the change.

The audit must keep these facts separate:

- `codex features list` should report `multi_agent` and `multi_agent_v2` as
  enabled for V2 task-name dispatch.
- The active Codex config may express V2 as `multi_agent_v2 = true`,
  `multi_agent_v2 = { enabled = true, ... }`, or
  `[features.multi_agent_v2]` with `enabled = true`.
- On Codex 0.144.1, V2 collaboration must remain direct-only: omit
  `non_code_mode_only` (the runtime default is `true`) or set it explicitly to
  `true`. Setting it to `false` exposes collaboration through the nested Code
  Mode adapter, which cannot supply the Responses-encrypted task argument that
  MultiAgentV2 expects.
- `[notice].suppress_unstable_features_warning = true` only suppresses the
  under-development warning; it is not evidence that V2 is enabled.
- `[agents].max_threads` and `[agents].max_depth`, when present, must be high
  enough for Kaola fan-out and root-to-subagent dispatch.
- The installed plugin cache, generated role profiles, and global hooks must be
  fresh relative to the plugin source Codex is actually loading.
- Runtime profile integrity still requires child-session proof: verify the
  spawned child session JSONL records `gpt-5.6-sol` with `turn_context.effort`
  `medium` for a standard profile and `xhigh` for a reasoning profile.

Recommended posture when the user asks the agent to configure Codex for
Kaola-Workflow:

```toml
[notice]
suppress_unstable_features_warning = true

[features]
multi_agent = true
multi_agent_v2 = { enabled = true, hide_spawn_agent_metadata = false, non_code_mode_only = true }
```

After changing this setting, start a fresh Codex session so the tool surface is
rebuilt. The preflight and doctor report `codex_v2_transport_mode`,
`codex_v2_direct_transport_ready`, and `codex_v2_transport_warning`; an enabled
V2 config that permits nested collaboration refuses with
`codex_v2_encrypted_transport_unsafe` instead of attempting a spawn. Routing
skills likewise call collaboration tools directly, never through
`functions.exec` or Code Mode.

If the audit finds a missing required setting and the user has not authorized
config changes, stop with the minimal diff and reason. Do not claim Codex is
ready from repo source alone, from warning suppression alone, or from a stale
plugin cache.

Every install/upgrade also prints the effective dispatch **posture** automatically
(no separate command needed). After writing/refreshing the managed config block, the
installer re-reads the config it just wrote and reports the effort-gated MultiAgentMode
the Codex runtime will actually enforce — features enabled is not the same as
dispatch-ready:

```text
Kaola-Workflow Codex multi_agent_v2 transport: direct-only
Kaola-Workflow Codex dispatch posture: explicitRequestOnly (model_reasoning_effort unset)
Kaola-Workflow Codex dispatch posture: Codex will refuse sub-agent spawns unless explicitly requested this session (multi_agent_mode: explicitRequestOnly). To dispatch now, explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker), set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) for proactive delegation.
Kaola-Workflow Codex dispatch posture: effort-gated multi-agent dispatch posture is Codex CLI runtime behavior verified on codex-tui 0.142.5; it may change in a future Codex release.
status: ok
```

This report is REPORT-ONLY and never fails the install: `model_reasoning_effort` is a
user-owned cost/latency choice, so the installer never writes it. An install that prints
`status: ok` while the posture reads `explicitRequestOnly` or `none` still needs one of
the remediations above before a role agent can actually be dispatched: explicitly ask
for sub-agents / delegation / parallel work in that session (always available and always
documented), or — if your Codex exposes an `ultra` reasoning effort for your model/plan
(undocumented as of codex-tui 0.142.5; check the `/model` picker) — set
`model_reasoning_effort = "ultra"` in `~/.codex/config.toml`, or pass it per-session
(`codex -c model_reasoning_effort=ultra`). `kaola-workflow-codex-preflight.js` (both the normal gate
and `--doctor`) reports the same posture non-fatally — a `warn:` line, never a red
preflight. See `docs/api.md` § Codex Harness Scripts for the JSON field names.

Updating the Codex CLI itself never repairs Kaola-generated `.codex/` state — the
runtime and the generated role profiles / managed config block are separate
surfaces. A schema-invalid profile (one missing a non-empty top-level `name`, which
Codex >=0.138 silently ignores) or a retired profile left behind by an older install
is only repaired by re-running `install-codex-agent-profiles.js`, which validates,
prunes, and re-writes the managed manifest.

To verify a project was initialized for Codex, check that `.codex/config.toml`
contains a `# BEGIN kaola-workflow agents` managed block, that
`.codex/agents/kaola-workflow/` contains the role profile files, and that
the global hook home `~/.codex/hooks.json` plus `~/.codex/kaola-workflow/{hooks,scripts}`
exist — then trust the hooks via `/hooks` (see *Trust the hooks* above).

The read-only `--doctor` report grades three scopes: `user`, `project`, and
`plugin_cache`. Agent **profiles** install globally by default, so the `user` scope
(`~/.codex`) is the authoritative one for profiles and must read green (managed block
present; no missing, stale, or malformed roles). The `project` scope is an optional
per-repo override; when present it must also read green. The preflight gate accepts
EITHER a valid global `~/.codex` scope OR a valid project scope, and **fails closed when
neither is valid**. The **hooks** are global by design (`~/.codex`) and are reported
under the `user` scope.

The primary skills are:

```text
kaola-workflow-init
kaola-workflow-next
kaola-workflow-research
kaola-workflow-ideation
kaola-workflow-plan
kaola-workflow-execute
kaola-workflow-review
kaola-workflow-finalize
```

Both Codex packs keep the same six-phase shape, state repair, compliance ledger,
TDD evidence, review, documentation docking, roadmap refresh, archive, and a
final commit-and-push step. They do not depend on external agent dependencies.
Instead,
`kaola-workflow-init` automatically installs Codex-native role profiles that
mirror the Claude workflow roles:

```text
code-explorer
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
contractor
workflow-planner
issue-scout
synthesizer
metric-optimizer
```

(`adversarial-verifier` is the read-only skeptic for the opt-in adaptive path; it is
mirrored into the Codex editions for parity and is never a review gate. `contractor`,
`workflow-planner`, and `issue-scout` are the adaptive lean-orchestrator roles —
bookkeeper, DAG front end, and read-only bundle-lane backlog scout. `synthesizer` is the
adaptive parallel-write convergence role (#463) — reasoning-class (Opus), dispatched only
to reconcile concurrent write legs by intent on a real merge conflict. `metric-optimizer`
is the adaptive bounded metric-ratchet role — each iteration it proposes a change,
applies it, runs the regression gate, measures the metric, and accepts or rejects it
against the running baseline until a stop condition fires.)

The managed setup copies role configs into `~/.codex/agents/kaola-workflow/` (global
default; a project-local override targets `<project>/.codex/agents/kaola-workflow/`
instead) and maintains a `# BEGIN kaola-workflow agents` block in `~/.codex/config.toml`
while preserving unrelated config. Codex workflows default to delegation
(`delegation_policy: delegate`) without prompting: phases invoke those roles for
delegated research, planning, execution, repair, review, and documentation work.
When the role profiles are absent the workflow auto-detects this, keeps the
`delegate` policy, and records the affected rows as evidenced
`local-fallback-tool-unavailable`. The current Codex session performs the work
locally under `local-authorized` only when you explicitly disable delegation.

Codex 0.144 reloads a named role profile after transient spawn overrides, so Kaola
does not rely on per-spawn `model` or `reasoning_effort`. Standalone role TOMLs
include the same `description` and `nickname_candidates` metadata as the managed
`config.toml` block. The eight carry-out profiles additionally pin
`model = "gpt-5.6-sol"` and `model_reasoning_effort = "medium"`; every other
profile pins the same model with `model_reasoning_effort = "xhigh"`. The retired
`<role>-max` effort-variant profiles are not used.

The adaptive planner still writes portable `reasoning`/`standard` tier tokens, but
on Codex it must use the role's static class. Dispatch cards expose
`codex_profile_mode: "pinned"`, the expected model/effort pair, and a
compatibility boolean. A conflicting plan tier refuses as
`codex_profile_tier_mismatch`; a child-session JSONL pair that does not match the
standalone profile expectation refuses as `codex_profile_runtime_mismatch`.

Every Codex DAG node role writes its full nonce-bound deliverable directly to the seeded
`dispatch.evidence_file` under `kaola-workflow/{project}/.cache/` before returning. Its final message
is only a compact `<node-id> <role>: <outcome>; evidence=<path>` summary for the main orchestrator.
Dependent nodes consume the full cache artifact through `dispatch.upstream_evidence`; plan-run runs
`record-evidence --verify` before closing the producer, and a seed-only or malformed artifact cannot
advance the DAG. If the parent summary transport disconnects, a terminal child plus a green verified
cache artifact may continue as `returned_partial`; without that artifact the node stays open.

`workflow-planner` and `contractor` run outside the Node Ledger. Their complete workflow-state,
plan, phase, and finalization artifacts are the authoritative durable full result; they return a
compact summary to the orchestrator and also mirror the full packet into `dispatch.evidence_file`
when their dispatch supplies a seeded cache file.

Codex preflight and doctor output report the dispatch identity mode. The stable
default is `v1-thread-id`, where wait/close rows may still show runtime thread IDs
and the prompt/evidence carry the node mapping. When the operator explicitly enables
Codex v2 multi-agent support, the descriptor reports `v2-task-name` and plan-run
passes `task_name: dispatch.codex_task_name`, a sanitized value derived from the
workflow node id and role. Both modes use `fork_turns: "none"` and omit transient
model/effort overrides. Before real role work, plan-run proves the applicable
profile mode from the spawned child's JSONL `turn_context.model` and
`turn_context.effort`; a parent-side descriptor or spawn argument is not proof.

## Usage

Initialize each project once:

```
/workflow-init
```

This creates or updates `CLAUDE.md`, `AGENTS.md`, `kaola-workflow/ROADMAP.md`, and the baseline documentation map without replacing existing project guidance. The generated `CLAUDE.md` keeps commands, hard rules, durable state invariants, workflow pointers, and documentation links in root memory while leaving long details in docs or skills. `AGENTS.md` provides a mandatory redirect block that directs agents to read `CLAUDE.md` before taking any action in the repository.

In any Claude Code session, run:

```
/workflow-next
```

The command is a thin router. It first checks local/remote Git state, safely fast-forwards clean behind-only branches, and asks before risky synchronization such as diverged history, dirty worktrees with upstream changes, rebases, merges, stashes, resets, or conflicts. It then scans `kaola-workflow/`, reads `workflow-state.md` when present, and routes to the right phase command.

### Adaptive workflow (the default path)

This is Kaola-Workflow's primary design. For most issues — from a one-line fix (a degenerate single-node DAG) to work that fans out into disjoint sub-areas, needs parallel research across several subsystems, or calls for a non-standard verification shape — the adaptive path lets the agent **freely compose a task-shaped DAG of role nodes** inside Kaola's locked lifecycle frame (claim → branch/worktree → *free design* → Finalization sink), instead of following a fixed sequence. Adaptive is the **unconditional default**: a bare `./install.sh` installs it; no switch to flip, nothing to deliberate. `fast` and `full` are install-time opt-ins (`--with-fast` / `--with-full`) and explicit path-naming escapes once installed (see [Other paths](#other-paths-fast-and-full-optional) below).

```
/workflow-next                       # adaptive is the default route
KAOLA_PATH=adaptive /workflow-next   # force adaptive explicitly
```

`/kaola-workflow-adapt` opens by dispatching the `workflow-planner` front-end subagent **once**: it claims/starts up (writes `workflow-state.md` and provisions a worktree at `.kw/worktrees/<project>/` — startup records `run_posture: worktree` in the `## Sink` block, derived from the actual worktree resolution; the planner authors the plan at repo-root and the executor operates inside the provisioned worktree), authors the plan as a `workflow-plan.md` (a `## Nodes` DAG, per-node `## Node Briefs`, plus an empty `## Node Ledger`), and runs `kaola-workflow-adaptive-handoff.js`. The plan must be **in-grammar**: roles drawn from the closed role library, one of four shapes (`sequence`, fan-out over pairwise-disjoint write sets, a bounded loop, or a selective-execution `select(<group>)` arm), a single unique `finalize` sink, and computed **post-dominance gates** (`code-reviewer` over every code-producing node, `security-reviewer` over every sensitive node). The handoff script branches on the plan-validator `--json` `result`: on `in-grammar` it freezes mechanically — writing a `plan_hash` inside `workflow-plan.md` (re-checked on every load, so post-freeze tampering is refused) — resume-checks, stages the roadmap, and writes `## Planning Evidence` into `workflow-state.md`, then returns `handoff_status: ready_to_run` with a checklist and advisory `first_node` metadata. As its last step the handoff also **mechanically mirrors** the frozen `kaola-workflow/<project>/` from the main checkout into the provisioned worktree (atomic copy → `plan_hash` re-verification → rename promote), surfaced in the packet as `worktree_mirror` (#335); `/kaola-workflow-plan-run` re-runs the idempotent `kaola-workflow-adaptive-node.js mirror-project` at entry, and `orient` fails closed with a typed `plan_not_mirrored` refusal (naming the exact mirror command) when run against an unmirrored worktree — there is no manual `cp` step. The handoff does **not** open the first node or record its baseline. `decision:auto-run` vs `ask` is **audit metadata** recorded in the packet — the run proceeds either way with no user-approval gate. On `refuse` the handoff returns `plan_invalid` with no mutation; the orchestrator drives a bounded repair loop (re-dispatching the planner with validator errors) rather than silently looping. The main session routes directly to `/kaola-workflow-plan-run`, which opens and dispatches every node including the first via `kaola-workflow-adaptive-node.js` transactions, with per-node checkpoints; it is resume-safe and toggle-agnostic (a frozen plan finishes even if the switch is later turned off) and hands off to Finalization on an all-complete ledger.

Beyond the vendored set, the adaptive path adds locally-authored roles: `adversarial-verifier` (a read-only, refute-by-default skeptic used in verification fan-outs — never a review gate, touches zero repository files), `synthesizer` (parallel-write convergence on a real merge conflict), and `metric-optimizer` (bounded metric-ratchet for optimize-shaped work), alongside the `workflow-planner`/`contractor`/`issue-scout` orchestration roles described in [Workflow roles](#workflow-roles).

**Per-node mechanics.** Several machine-checked contracts underpin the executor: each node's `.cache/<id>.md` evidence is seeded with a binding header + role-specific token stubs and re-seeded on reopen (stale evidence from a prior open cannot be replayed); every typed refusal/halt envelope from the four aggregators carries a one-sentence `operator_hint` and, for halts, a structured `triage` payload (with sanctioned-repair primitives the orchestrator can apply directly); gate findings are routed to their owning node — or flagged for plan-repair when no node declared the file; and plans may carry an optional `goal:` line (hash-covered, surfaced to `issue-scout`, recorded as `goal_check` in the closure receipt). Nodes are also fed through a **durable node-to-node information channel**: every dispatch card carries the node's `goal_line` (from the plan's `## Node Briefs`) and `upstream_evidence` pointers to its dependencies' recorded evidence, and a node cannot close without a **consumed-proof** — a recorded `upstream_read: <id> <nonce>` line proving it actually opened each upstream producer's evidence. Every node role carries a registry-backed, machine-checked evidence-recording contract (role-specific required tokens in its `.cache` evidence). See `docs/decisions/` (D-445-01, D-446-01) for the contracts.

#### Supported adaptive patterns

The four shapes (`sequence`, `fanout`, `loop`, `select`) are a *grammar*, not a fixed menu — the planner composes them with `depends_on` edges and the right role on each node into a task-shaped DAG. The patterns below are **composable building blocks, not options to choose between**: the planner draws *several* into one DAG to fit the issue (the final **Composed** row stacks three at once). Each row is a real, in-grammar `workflow-plan.md` the validator accepts; the **Governance** column is the decision `kaola-workflow-plan-validator.js` returns (`auto-run` = proceeds immediately; `ask` = recorded as audit metadata by the handoff, which still freezes and proceeds — no approval gate — but the blast-radius reason is surfaced in the packet for the orchestrator).

| Pattern | What it is | How the planner composes it | Governance |
|---|---|---|---|
| **Plan-then-implement** | The linear shape: explore, plan, implement, review, finalize. | `code-explorer` → `planner` → `tdd-guide` → `code-reviewer` → `finalize`, each `depends_on` the previous (`shape: sequence`). | `auto-run` (no fan-out, no loop) |
| **Fan-out-and-synthesize** | Work that splits into disjoint sub-areas, then merges. | `fanout(impl)`: N `tdd-guide` nodes over **pairwise-disjoint** top-level directories (e.g. `api/` and `cli/`), then a `code-reviewer` node that `depends_on` every leg — the merge/synthesize point. The logical width is unbounded by `KAOLA_FANOUT_CAP` (default 4); that cap limits only how many members run at once, and the executor drains a wider fan-out by rolling bounded dispatch. | `ask` (write-role fan-out → blast-radius) |
| **Adversarial verification** | Re-test a finished claim with independent skeptics. | After the `code-reviewer` gate, a read-only `fanout(verify)` of `adversarial-verifier` nodes (empty write sets, each prompted to *refute*) feeding the sink; the orchestrator tallies a quorum from their `verdict: pass\|fail` evidence. Read-only fan-out has **zero** blast radius. | `auto-run` |
| **Bounded loop (review-fix)** | Re-run one role until a mechanical verdict passes. | A `loop(<cap>)` node (e.g. a `code-reviewer` or `build-error-resolver` cycle) re-invoked up to a static cap (`LOOP_CAP` = 5); a #251 `verdict: pass` exits early. The cap is the halting guarantee — the loop can only end sooner, never run longer. | `ask` (loop present) |
| **Generate-and-filter** | Generate several candidate approaches, filter to the best, then build it. | Read-only `fanout(gen)` of angled `planner` attempts → a `planner` reduce node (the rubric/filter that picks one) → a single `tdd-guide` implements the winner → `code-reviewer` gate → `finalize`. The "discard" is the reduce node's choice, not a grammar feature. | `auto-run` (read-only generators + one sequential implement) |
| **Tournament** | Competing candidate plans reduced to a winner by pairwise judges. | Read-only `fanout(attempt)` of `planner` nodes → hand-wired pairwise `code-reviewer` judges (each `depends_on` two attempts) → a final judge → `finalize`. There is no native bracket shape — the bracket is ordinary `depends_on` wiring; feed the winner to a downstream `tdd-guide` to build it. | `auto-run` (read-only) |
| **Classify-And-Act** | Routing to exactly one of several mutually-exclusive arms based on what a read-only classifier finds (e.g. "fix the CSV exporter **or** the HTML renderer, whichever is at fault"). | A read-only `code-explorer` classifier node writes `selector: <arm-id>` to its `.cache/<id>.md` evidence; each arm carries `shape: select(<group>)` and a `selector_source` pointing to the classifier. On the classifier's commit, `plan-validator --selector-check` reads the selector and **fail-closes (exit 1, blocking the commit) on a missing or foreign value** — the script-mechanical guarantee that neither "run all" nor "run none" can occur. It returns `armsToNa`; the contractor marks unselected arms `n/a` in the ledger, and `next-action.js` treats `n/a` arms as terminal so only the one selected arm becomes ready. Risk is assessed over the union of all arms; the selector is read-only (zero blast radius); `n/a` arms cannot smuggle unreviewed writes because they never execute. | `auto-run` (selector is read-only; write-role arms are mutually exclusive, not concurrent) |
| **Non-delegable acceptance gate** (`main-session-gate`, #334) | A required acceptance check no subagent can perform — a GPU/visual confirmation, a device-in-hand verification, an explicit human sign-off. | A built-in `main-session-gate` node (no agent profile; the main session itself runs the check and records `verdict: pass\|fail` into `.cache/<id>.md`) placed **after** `code-reviewer` so it post-dominates every code-producing node (**G3**). It is read-only, shape `sequence` only, never a fan-out/select arm, and never a frontier fan-out member. `--gate-verify`/`--verdict-check` block finalization until it is complete with a passing verdict — there is no legal `n/a` skip, so a numerical-green implement path can never reach the sink without crossing the manual decision. | `auto-run` (read-only gate) |
| **Composed (multi-pattern)** | The realistic case — several patterns stacked in one DAG. The planner *composes*, it does not pick one. | e.g. a read-only multi-modal sweep (`fanout(sweep)` of `code-explorer` → `planner`) **then** a parallel implement (`fanout(impl)` of `tdd-guide` → `code-reviewer` gate) **then** an adversarial-verify skeptic fan-out → `finalize`: one 10-node plan in which `code-reviewer` still post-dominates **both** implement legs. Locked as a fixture in `testAdaptivePatternLibrary`. | `ask` (write-role fan-out present) |

The first seven are building blocks; the last row stacks three of them. The two read-only design shapes (**Generate-and-filter**, **Tournament**) — they compare or select approaches and write nothing, so they carry zero blast radius and auto-run; the chosen approach then flows into an ordinary write-role implement under the same gates. Every plan, whatever its shape, still crosses the same non-removable walls: a single unique `finalize` sink, `code-reviewer` **post-dominating** every code-producing node, and `security-reviewer` post-dominating every sensitive node (re-derived from the files actually touched, not an author flag). A plan that routes a gate around itself is a typed refusal, not a silent pass.

#### Parallel ready-set execution (issue #281, superseded by the running-set scheduler #377/#542)

The executor runs **one FRONTIER UNIT at a time** rather than strictly one node at a time. A frontier unit is either a single node (the legacy path, unchanged) or a fan-out of ready siblings when `next-action.js` reports `readyPending.length >= 2`.

**Responsibility split.** `kaola-workflow-adaptive-node.js` owns fan-out **STATE**: it opens the frontier (`open-ready`), closes members individually (`close-node`), and repairs a crashed manifest (`reconcile-running-set`) against `kaola-workflow/{project}/.cache/running-set.json`. The plan-run SKILL running in the main session owns concurrent **DISPATCH**: after `open-ready` completes, the main session issues multiple `Agent()` calls in one message — one per opened member. The script never spawns an agent; a subagent cannot dispatch a subagent. A green plan-run is not evidence of wall-clock parallelism — the only observable concurrency is at host runtime when the main session issues those concurrent `Agent()` calls.

**Read-only fan-out** (fully supported): siblings with empty declared write sets need no filesystem isolation. They share the active worktree; each writes `.cache/{id}.md` evidence; `close-node` trivially passes the per-node barrier (empty declared set → empty diff). Use cases include Fan-out-and-synthesize research legs, Adversarial Verification skeptic fan-outs, and quorum reviews.

**Write-role fan-out** (`fanout(...)` over disjoint write sets): each member requires an isolated node worktree keyed by `(project, node-id)`. Disjointness is proven at validator freeze time and re-confirmed at `open-ready` (fail-closed on overlap). **Planner-proven-disjoint write frontiers co-open as isolated parallel legs by default** (D-542-01) — per-leg worktree isolation plus the mandatory synthesizer reconcile are the correctness net, so no operator toggle is needed to opt in. At the last member's `close-node`, the synthesizer octopus-merges the disjoint legs into the feature branch and a group barrier diffs against the UNION of every member's declared write set — no attribution ambiguity is possible because every path belongs to exactly one member. Only genuinely-overlapping (non-disjoint) writes stay serial and consent-gated (`--write-overlap-consent` + `write_overlap_policy`). Where the host lacks isolated-worktree support — or when `KAOLA_PARALLEL_WRITES=0` forces it — write-role fan-out members **degrade to serialized execution**, opened one at a time through the same per-node lifecycle. Correctness is preserved; wall-clock parallelism is forgone. Full mechanics: `docs/plan-run-cards/frontier-batch.md`.

**`kaola-workflow-adaptive-node.js`** is pure composition over `next-action.js`, `commit-node.js`, and `plan-validator.js`. It adds no new barrier or gate surface — the per-member close calls the same `commit-node --node-id N` barrier (deferred to the group barrier for a lane-group member); Finalization `--barrier-check` sees normal `complete` rows in the ledger after the last member closes.

**`workflow-planner` now authors efficient DAGs**: expose independent work as siblings (a shared ready frontier) so the executor can open them together; serialize only for true dependencies, shared file lanes, selectors, loops, or gates.

**Running-set scheduler (#377):** the executor tracks a *running set* — the set of nodes currently open and executing. Serial execution is simply the running set at a concurrency ceiling of one; a fan-out raises the cap up to `FANOUT_CAP` (write, default 4) or `FANOUT_CAP_READONLY` (read-only, default 8). `open-ready` enters a node into the running set, `close-node` removes it, and `reconcile-running-set` repairs the set after a crash. There is no separate "serial mode" — serial is just the running-set scheduler with a cap of one. The prior standalone `parallel-batch` aggregator was retired (D-586-01): it was off the live executor path (nothing shelled it), and the running-set scheduler above already owns the frontier path in full, including default-on disjoint write co-open.

**Read∥write co-open (#622/#641):** read and write frontiers may also overlap, in both directions. A read node co-opens behind a live leg-contained write, and a leg-contained write co-opens *behind live reads*, whenever four fail-closed preconditions hold (leg-coupled write, clean parent tree, disjointness proven, no live lane group) — any miss returns the byte-identical serial hold with a typed `serialDegradeReason` explaining why. A consent-tier `observes: scratch` plan annotation additionally lets a legless docs writer co-open behind a scratch-only `adversarial-verifier` gate. The `merge_awaits_read_drain` fence is the isolation net: each leg's merge is held until live reads drain, so the parent tree the reads observe stays untouched.

For the design history, see `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

### Other paths: fast and full (optional)

Two non-default paths remain for cases the adaptive planner does not fit. Both are install-time opt-ins (`--with-fast` / `--with-full`); once installed they are reachable by an explicit path-naming request or `KAOLA_PATH`. A request for a path that is not installed returns a typed `path_not_installed` refusal — never a silent adaptive substitution.

#### Fast path

For small, well-scoped issues where the approach is unambiguous and mechanical — exactly one sensible way to do it (a rename or move, threading an existing field through a known call path, a behavior-preserving refactor, repetitive parallel edits, or a bug fix whose root cause is already located), confined to a single area of ≤ 5 files with no new external deps, no public API/schema/migration change, no security/auth/encryption concern, and no `depends-on:#N` — request the fast path. Anything with ≥ 2 materially-different viable approaches stays on the full path regardless of size, because that is a design choice where full-workflow ideation earns its keep:

```
KAOLA_PATH=fast /workflow-next
```

Fast path executes Plan, Implement, and Review in a single pass, writing `fast-summary.md` instead of the full 6-phase artifacts. If the planner surfaces ≥ 2 materially-different viable approaches (`approach_ambiguity`), or scope expands during execution (beyond the declared write set by more than 1 file or past the absolute backstop of 6 files, security concerns, dependencies, new packages), fast path escalates automatically to the full workflow. Otherwise, it routes directly to Finalization.

#### Full path — the six phases

The classic fixed sequence, reachable with `KAOLA_PATH=full /workflow-next` (requires `--with-full` at install time). Each phase writes one durable artifact:

| # | Phase | What happens | Output file |
|---|-------|-------------|-------------|
| 1 | Research/Discovery | Facts only: requirement parsing → code-explorer maps affected code/patterns/tests/config → knowledge-lookup checks external docs when needed → completeness gate | `phase1-research.md` |
| 2 | Ideation | Strategy only: planner generates 2–3 grounded approaches → orchestrator selects | `phase2-ideation.md` |
| 3 | Plan | Blueprint only: code-architect turns selected approach into files, tasks, write sets, dependencies, parallel groups, and validation | `phase3-plan.md` |
| 4 | Execute | Per-task TDD loop: tdd-guide executes RED → GREEN → REFACTOR; main session reviews, validates, and checkpoints | `phase4-progress.md` |
| 5 | Review | code-reviewer always; security-reviewer conditional; review fixes delegated to tdd-guide/build-error-resolver | `phase5-review.md` |
| 6 | Finalization | Full validation with delegated repair if needed, documentation docking, closure decisions, issue/roadmap/archive updates, final commit and push | `finalization-summary.md` |

All phase files are written to `{project-root}/kaola-workflow/{project-name}/` while active. Completed workflow folders are archived to `{project-root}/kaola-workflow/archive/`. Active unfinished work is tracked in `{project-root}/kaola-workflow/ROADMAP.md`. The adaptive default does not follow this fixed numbered sequence — it composes role nodes into a `workflow-plan.md` DAG (frozen `plan_hash` + `## Node Ledger`) and runs them dynamically — but it lands in the same Finalization sink, so the artifacts/archive/roadmap contract above is shared by all three paths.

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
| `kaola-workflow-claim.js` (GitHub) / `kaola-gitlab-workflow-claim.js` (GitLab) / `kaola-gitea-workflow-claim.js` (Gitea) | Active-folder coordination: claim, release/discard, status, watch-pr (watch-mr on GitLab), bootstrap/startup, finalize, pick-next, resume, worktree-status, worktree-finalize, stale-worktree-check, stale-worktree-cleanup, legacy-worktree-cleanup. Provisions a per-issue Git worktree at `<repo-root>/.kw/worktrees/<project>/` by default on all workflow paths (full, fast, adaptive); set `KAOLA_WORKTREE_NATIVE=0` to disable. | All phases |
| `kaola-workflow-active-folders.js` | Shared library: reads the active-folder table from `kaola-workflow/{project}/workflow-state.md`. Imported by claim, classifier, and sink scripts. | Library |
| `kaola-workflow-classifier.js` | Parallel-work classifier: marks each open issue green/yellow/red/blocked based on dependency graph, exact file-path overlaps, shared-infra directories, and active folders. | Startup |
| `kaola-workflow-roadmap.js` (GitHub) / `kaola-gitlab-workflow-roadmap.js` (GitLab) / `kaola-gitea-workflow-roadmap.js` (Gitea) | Regenerates `kaola-workflow/ROADMAP.md` from `kaola-workflow/.roadmap/issue-{N}.md`, and appends an optional project-local `kaola-workflow/.roadmap/_rules.md` to the generated `## Rules` section under a `### Project rules` sub-heading (no-op, byte-identical output, when the file is absent or empty). Shared subcommands: `generate`, `validate`, `validate-remote`, `init-issue`, `project-name`; GitHub also supports `migrate`, while GitLab/Gitea support `refresh`. | Phase 1, Finalization |
| `kaola-workflow-repair-state.js` | Reconstructs `workflow-state.md` from existing phase artifacts or `fast-summary.md` when state is missing or stale, so a resumed session has a single safe next command. | Init / Resume |
| `kaola-workflow-closure-audit.js` (GitHub) / `kaola-gitlab-workflow-closure-audit.js` (GitLab) / `kaola-gitea-workflow-closure-audit.js` (Gitea) | Reports closure drift (stale `.roadmap` sources, `ROADMAP.md` listing closed issues, stale `workflow:in-progress` labels, active folders/unarchived PR/MR folders for closed issues). Dry-run JSON by default; `--execute` repairs only safe local roadmap/label drift and never deletes active folders or worktrees. GitLab edition uses `unarchived_mr_folders` with lowercase MR state matching (`merged`/`closed`). Gitea edition keeps `unarchived_pr_folders` with lowercase PR state matching (`merged`/`closed`). Complements `stale-worktree-check`/`-cleanup` (which owns worktree/branch drift). | On demand / audit |
| `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea) | Finalization merge sink: fetch, rebase onto `origin/main`, FF-only merge with retry on race conditions, push, close the issue, and clean up the branch. Falls back to the PR sink when the merge is impossible. | Finalization |
| `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) | Finalization PR/MR sink: push the branch, open a PR via `gh pr create` (GitHub), `glab mr create` (GitLab), or `tea pr create` (Gitea), record the PR/MR URL, and optionally enable auto-merge. | Finalization |
| `kaola-workflow-compact-context.js` | Wired to the `SessionStart` (`compact`) hook. Reads the most recent `workflow-state.md` and injects a resume hint into the post-`/compact` session. | Hook |
| `kaola-workflow-fast-audit.js` | Read-only fast-path calibration audit: scans archived and active `fast-summary.md` files and reports status counts, escalation-reason histogram, file-count distribution, and review mode (delegated `code-reviewer` vs self-review). Human table by default; `--json` for machine-readable output. Always exits 0. | On demand / audit |
| `kaola-workflow-run-chains.js` | Runs all four edition test chains (`claude`, `codex`, `gitlab`, `gitea`) via `spawnSync` with real exit codes and produces `.cache/chain-receipt.json` (`{headSha, workTreeHash, startedAt, chains:[{name, exit}]}`). Used by the contractor at Finalization (Step 8c) and gated by `--finalize-check` (`chains_unverified`, `chains_stale`, `chains_red`). `--accept-known-red name:issue` registers a waiver for a known-red chain. | Finalization |

### Validation and test scripts

| Script | What it asserts |
|--------|-----------------|
| `simulate-workflow-walkthrough.js` | End-to-end integration test of the claim, repair, roadmap, and hook surfaces. Must exit 0 with `Workflow walkthrough simulation passed`. Run before claiming any workflow-related change complete. |
| `validate-workflow-contracts.js` | Contractual assertions on the Claude Code surface — command files, agent installs, and documented invariants. **Tag-existence check (issue #177)**: Verifies local git tag `kaola-workflow--v<version>` matches `package.json` version; uses `git rev-parse --verify refs/tags/<tag>` to validate. Skipped when `KAOLA_WORKFLOW_OFFLINE=1` or `.git` absent. |
| `validate-kaola-workflow-contracts.js` | Same contractual assertions on the Codex plugin surface under `plugins/kaola-workflow/`. |
| `validate-script-sync.js` | Byte-identical drift guard between `scripts/` (Claude Code) and `plugins/kaola-workflow/scripts/` (Codex), plus shared hook copies that must stay in sync across GitHub, GitLab, and Gitea surfaces. |
| `validate-vendored-agents.js` | Asserts the vendored Claude Code agent prompts match the pinned upstream Everything Claude Code commit. |
| `test-fast-audit.js` | Regression test for `kaola-workflow-fast-audit.js` — 40 assertions over synthetic fast-summary fixtures (status/escalation/file-count/review-mode parsing, empty-corpus and malformed-input robustness). Uses temp-dir fixtures only, never the real archive. |

### Active folder coordination

Kaola-Workflow treats `kaola-workflow/{project}/workflow-state.md` plus the configured forge's issue and PR/MR state as the durable coordination contract. No lease/session layer remains.

The detailed durable-state map lives in `docs/workflow-state-contract.md`. Keep generated root-memory files to compact invariants: `ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `kaola-workflow/.roadmap/_rules.md` appended under `### Project rules`), `.roadmap/` is not purged wholesale, active work stays under `kaola-workflow/{project}/` until archive or discard, and active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.

**Environment Variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAOLA_GH_REMOTE_TIMEOUT_MS` | `30000` | Timeout in milliseconds for GitHub/GitLab/Gitea API calls during closure audit, active-folder checks, remote validation, and sink-merge/sink-pr gh calls. Set lower in tests to simulate API hangs. Values above 600000ms (10 minutes) are clamped to 600000ms to prevent hang protection bypass (issue #185) |
| `KAOLA_RUN_CHAINS_TIMEOUT_MS` | `1800000` | Per-chain `spawnSync` kill ceiling in milliseconds for `kaola-workflow-run-chains.js`. Default 1800000 (30 min), raised from a prior 900000 (15 min, issue #512) after a live run on a constrained host outgrew that budget. Invalid/zero/negative values fall back to the default. No upper clamp (local test suite, not a remote-hang risk). A killed chain's receipt entry now records `timed_out: true` (issue #608), and the failure summary labels a timed-out chain inline so it reads distinctly from a genuine test regression |
| `KAOLA_GATE_WINDOW_FENCE` | `1` (ON) | Default-ON write-lane hook fence (issue #607): while a `main-session-gate` node is open, an in-worktree out-of-band `Write`/`Edit` outside the workflow bands is denied by default (exit 2) — the workflow bands, the `.kw/` band, member worktrees, and a co-open writer's own declared lane stay legal. Set to `0` (also `false`/`no`) to opt out |
| `KAOLA_FINALIZE_BASE` | (unset) | Override the integration-branch base for `cmdFinalize`'s `--finalize-check` attribution sweep (`scripts/kaola-workflow-claim.js` ×4 editions). Defaults to unset → the validator's `main` default (byte-equivalent for branch-per-issue runs). Set to a project merge-base (or `HEAD` for an in-place run whose own changes are already verified by the chain receipt) so the sweep attributes only the project's own diff on a shared/multi-issue branch. Also settable via the `--base <ref>` flag (flag wins). The per-node `--barrier-check` anti-laundering guard still rejects `--base` (issue #539) |
| `KAOLA_WORKFLOW_OFFLINE` | `0` | Skip GitHub/GitLab/Gitea calls for local tests or air-gapped usage. When unset and remote validation fails, startup returns `target_unavailable` refusal instead of silently proceeding |
| `KAOLA_WORKFLOW_DEBUG_CWD` | (unset) | DEV/TEST ONLY — when set, `sink-merge.js` writes its final cwd to this file |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL` | (unset) | DEV/TEST ONLY — fail first N fast-forward merge attempts (GitHub, GitLab, and Gitea) |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | (unset) | DEV/TEST ONLY — force merge-impossible error in sink-merge fallback tests (GitHub, GitLab, and Gitea) |
| `KAOLA_PATH` | (unset) | Set to `fast`, `full`, or `adaptive` to name a specific path explicitly. Adaptive is the unconditional default when unset. Naming a path that is not installed returns a typed `path_not_installed` refusal — never a silent substitution |
| `KAOLA_FANOUT_CAP` | `4` | Runtime concurrency limit: the executor runs at most this many adaptive fan-out members at once and drains a wider fan-out by rolling bounded dispatch (`top-up`). NOT a planning validity cap — a logical fan-out MAY be wider |
| `KAOLA_PARALLEL_WRITES` | `1` (ON) | Default-ON master switch for default-on disjoint write parallelism (D-542-01). When ON, write frontiers the planner proves **disjoint** (`parallel_safe`) co-open as isolated parallel legs — per-leg worktree isolation + the mandatory synthesizer reconcile are the correctness net. Set to `0` (also `false`/`no`) to force every write frontier serial. Overlapping (non-disjoint) writes stay serial/consent-gated regardless, and a host without worktree support degrades to serial regardless |
| `--write-overlap-consent` / `write_overlap_policy` | (overlap only) | The overlap-only consent gate. `--write-overlap-consent` plus a plan `write_overlap_policy: coarse` (anything other than `off`) is what permits a **genuinely-overlapping** (non-disjoint) write frontier to co-open under a coarse shared lane; it does NOT gate disjoint co-open (that is default-on, above). With the policy `off` or consent absent, an overlapping frontier stays serial |
| `KAOLA_LANE_CONTAINMENT` / `KAOLA_LEG_ISOLATION` | (advanced / legacy) | Advanced/legacy lane-containment and per-leg-isolation toggles. Default-on disjoint co-open (`KAOLA_PARALLEL_WRITES`) supersedes the operator-facing role these once played; the per-leg git-worktree isolation is the real containment and the `KAOLA_LANE_CONTAINMENT` `PreToolUse` hook is defense-in-depth only (fail-open). Not needed for normal use |
| `KAOLA_TARGET_ISSUES` | (unset) | Comma-separated list of issue numbers for an explicit bundle claim, e.g. `KAOLA_TARGET_ISSUES=42,47,53`. Equivalent to `--target-issues 42,47,53`. Must not be set together with `KAOLA_TARGET_ISSUE` (sets off the `target_ambiguity` refusal). Adaptive path only |
| `KAOLA_BUNDLE_MAX_ISSUES` | `4` | Maximum number of issues allowed in a single bundle. Bundles larger than this cap are refused with `target_set_too_large`. Applies to both explicit (`--target-issues`) and scout-recommended bundles |
| `KAOLA_GOAL` | (unset) | Operator-side goal text for goal-conditioned bundles (#441). When set, the orchestrator places the goal in the `workflow-planner` dispatch prompt so it is transcribed as `goal: <text>` into `## Meta` of `workflow-plan.md`, hash-covered by `computePlanHash`. The `issue-scout` reads `KAOLA_GOAL` as clustering context and surfaces a `goal_alignment` note in its recommendation. Finalization emits `goal_check: satisfied|unsatisfied|absent` in the closure receipt (advisory in v1; does not block) |

**Active-folder subcommands:**

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `startup` / `bootstrap` | `node scripts/kaola-workflow-claim.js startup --target-issue <N> [--runtime claude|codex] [--sink merge|pr]` | Validates and atomically creates or reuses the active folder for issue N |
| `status` | `node scripts/kaola-workflow-claim.js status` | Lists active folders and their issue, branch, phase, sink, and worktree metadata |
| `release` / `discard` | `node scripts/kaola-workflow-claim.js release --project <name>` | Archives an active folder as abandoned and clears advisory forge labels when online |
| `finalize` | `node scripts/kaola-workflow-claim.js finalize --project <name> [--keep-worktree] [--base <ref>]` | Marks the folder closed and moves it to `kaola-workflow/archive/`; by default removes the linked worktree, while `--keep-worktree` preserves it for the final commit gate. `--base <ref>` (or `KAOLA_FINALIZE_BASE`) scopes the finalize-check attribution sweep to the project's own diff on a **shared/multi-issue branch** — pass the project merge-base (or `HEAD` for an in-place run verified by the chain receipt); defaults to unset → the validator's `main` default, so branch-per-issue runs are byte-equivalent. The per-node `--barrier-check` anti-laundering guard still rejects `--base` (#539) |
| `sink-fallback` | `node scripts/kaola-workflow-claim.js sink-fallback --project <name> [--reason <text>]` | Records merge-impossible fallback; updates Sink block to sink: pr; writes .cache/sink-fallback.json |
| `watch-pr` | `node scripts/kaola-workflow-claim.js watch-pr` | Archives PR-backed folders when the forge reports MERGED or CLOSED. GitLab edition uses `watch-mr` (`kaola-gitlab-workflow-claim.js watch-mr`) instead. |
| `stale-worktree-check` | `node scripts/kaola-workflow-claim.js stale-worktree-check` | Detects and reports worktrees and branches for closed or archived issues that are not currently active |
| `stale-worktree-cleanup` | `node scripts/kaola-workflow-claim.js stale-worktree-cleanup [--execute] [--archive] [--export] [--force] [--keep-branch]` | Removes stale worktrees and branches found by `stale-worktree-check`. Dry-run by default; `--execute` performs removal. For dirty worktrees: `--archive` stashes changes first (recoverable via `git stash list`), `--export` writes a patch to `kaola-workflow/archive/exports/`, `--force` discards. `--keep-branch` removes the worktree but keeps the branch (for open PRs). No strategy flag = dirty worktrees are skipped. When multiple strategy flags given, precedence is: archive > export > force. A branch that cannot be *proven* merged is never deleted — it is reported `skipped_unmerged` with its tip SHA for manual recovery. |
| `audit-labels` | `node scripts/kaola-workflow-claim.js audit-labels` | Scans for closed issues that still carry `workflow:in-progress` label; outputs JSON with stale issues and count |
| `repair-labels` | `node scripts/kaola-workflow-claim.js repair-labels [--execute]` | Finds and removes `workflow:in-progress` labels from closed issues. Dry-run by default; `--execute` performs actual removal |
| `worktree-status` / `worktree-finalize` | see `--help` usage errors | Lists workflow worktrees and mirrors final artifacts into the linked worktree |

### Classifier configuration

The `kaola-workflow-classifier.js` script uses `~/.config/kaola-workflow/config.json` for parallel-work settings:

```json
{
  "parallel_mode": "auto"
}
```

Valid `parallel_mode` values:

- `auto` (default): Classify each issue as green/yellow/red/blocked before claiming, based on dependency graphs, exact file-path overlaps, file-area overlaps, and active folders.
- Other values: Bypass classification; treat all issues as green for fast claiming.

Exact file-path overlap returns `red`, including shared-infrastructure files such as `scripts/kaola-workflow-claim.js` and packaged plugin files under `plugins/kaola-workflow/`. Different files in the same shared-infrastructure directory can still return `yellow`. Offline roadmap classification reads explicit paths and `touches:` metadata from `kaola-workflow/.roadmap/issue-{N}.md`. A claimed project's in-flight file-set is read from its `phase3-plan.md`/`phase1-research.md` or, for a fast-path project, from the `- Write Set:` declaration in its `fast-summary.md` `## Scope` section — so fast projects participate in overlap detection at parity with full projects.

When an issue receives a `yellow` verdict (shared infrastructure warning), a cache file is written to `kaola-workflow/{project}/.cache/parallel-classifier.md` to flag the caution for the phase team.

### Priority label configuration

The issue sort order in `/workflow-next` startup is determined by:

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

1. Inspect the local roadmap (`kaola-workflow/ROADMAP.md`)
2. Fetch open forge issues
3. Classify candidates as green/yellow/red/blocked (using parallel-work guidance if multi-session)
4. Select the best match based on priority, dependencies, and phase completion
5. Pass the chosen issue number via `KAOLA_TARGET_ISSUE=N` before calling `/workflow-next`

The startup script validates the agent's choice:
- Issue must be unclaimed (no active folder)
- Issue must be green or yellow (not blocked or red)
- No duplicate active folder for the same issue

If the agent does not provide an explicit target issue, startup refuses with `verdict: no_target` — even when exactly one active folder is present. When resuming a sole active folder, the agent must:

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

## Roadmap cycle

Use a separate research or roadmap session to discover future work and create or refine forge issues. `/workflow-next` is the implementation cycle: it fetches open forge issues, mirrors active unfinished work into `kaola-workflow/ROADMAP.md`, advances one selected item, then comments on or closes linked issues after validation.

The local roadmap is a working mirror, not the source of truth. Keep only active unfinished work there; completed workflow folders move to `kaola-workflow/archive/`.

The workflow also enforces context discipline: `CLAUDE.md` targets under 200 lines, the local roadmap should not become history storage, and agent prompts should include only the relevant phase excerpts needed for the delegated task.

Each phase records a required-agent compliance ledger. Each active workflow also maintains `workflow-state.md`, which records the current phase, intra-phase step, next command, pending gates, and ownership rules. After resume or compaction, the main session must read that state file and the relevant compliance ledger before continuing.

Avoid redundant validation runs: Phase 4 uses targeted affected checks, Phase 5 validates only review fixes or cites existing evidence, and Finalization runs each full final command once against the final candidate state. Small targeted commands may run in the main session, while expensive or noisy test/lint/type/build commands should be delegated and summarized from cache evidence.

## Hook policy

Kaola-Workflow ships four Claude Code hooks via `install.sh`. They run
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
| `kaola-workflow:pre-commit-guard` | `PreToolUse` (`Bash`) | Blocks `git commit` invocations whose staged files span more than one `kaola-workflow/{project}/` folder (archive, `.roadmap/`, and `ROADMAP.md` are exempt) | `hooks/kaola-workflow-pre-commit.sh` |
| `kaola-workflow:subagent-dispatch-log` | `SubagentStart` (`*`) | Records each subagent spawn (`agent_type`, `agent_id`, `cwd`) as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` for WARN-FIRST closure attestation (#277 M1). Fail-open | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

### Codex lifecycle hooks

Codex wires the same three hooks via `install-codex-agent-profiles.js` (run by the
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
| `kaola-workflow:compact-context` | `SessionStart` (`compact`) | After Codex context compaction, injects a resume packet (active project, next skill, in-progress node, pending gates, consent markers, task summary) from `kaola-workflow-codex-compact-resume.js`. Also still invokable on demand via stdin. | `scripts/kaola-workflow-codex-compact-resume.js` |
| `kaola-workflow:pre-commit-guard` | `PreToolUse` (`Bash`) | Blocks `git commit` invocations whose staged files span more than one `kaola-workflow/{project}/` folder | `hooks/kaola-workflow-pre-commit.sh` |
| `kaola-workflow:subagent-dispatch-log` | `SubagentStart` (`*`) | Records each subagent spawn to `kaola-workflow/{project}/.cache/dispatch-log.jsonl`, making `checkDispatchAttestations` (closure attestation) live on Codex when `multi_agent` is enabled | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

**Caveats and preconditions:**

- **`/hooks` one-time trust step:** after install, run `/hooks` once in Codex to
  review and trust the command hooks (content-hash trust; editing a hook marks it
  untrusted again). For automation use `codex exec --dangerously-bypass-hook-trust`.
- **`multi_agent` precondition:** `SubagentStart` provenance requires Codex
  `multi_agent` enabled. With it off the hook never fires and closure attestation
  reads `missing` — non-fatal, WARN-first (closure still succeeds).
- **Matcher note:** the `PreToolUse`/`PostToolUse` matchers (`Bash`, `Write|Edit`)
  follow Claude Code tool names; if a Codex build uses different tool-event names the
  matcher string in `~/.codex/hooks.json` may need adjustment.
- **Uninstall scope:** because hooks are global, `uninstall.sh` strips the managed
  `kaola-workflow:` entries from `~/.codex/hooks.json` (not from a project-local file).
  Agent profiles and the managed config block are removed from the project directory
  you run `uninstall.sh` in.

### Installation and verification

- `install.sh` copies hook files to `~/.claude/kaola-workflow/hooks/`, support
  scripts to `~/.claude/kaola-workflow/scripts/`, and auto-merges the four
  managed hook entries into `~/.claude/settings.json`.
  The merge is idempotent and identifies managed entries by `id` prefix
  `kaola-workflow:` or a command path containing `kaola-workflow`. Prior
  settings are backed up under
  `~/.claude/backups/settings.json.kaola-workflow.<ts>.bak`.
- Verify with `jq '.hooks' ~/.claude/settings.json` — expect the four ids
  above, with scripts under `~/.claude/kaola-workflow/hooks/` or
  `~/.claude/kaola-workflow/scripts/`.
- Model badges are enforced by slash-command dispatch, not by a status-line
  override: the installer renders each installed agent's resolved model into
  concrete `model="..."` lines in the slash commands.
- **Badge not showing for some subagents?** By design: on a Sonnet session,
  only Opus subagents show a badge. On an Opus session, all subagents badge.
  See the vendored-agents note above for details.
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
documentation with code changes and issue/roadmap state, routes deferred
items or conflicts to the user before closing, and
leaves commit-and-push as the final step on a clean, synced workspace.

## Resuming

Any interrupted session resumes from `workflow-state.md` first, then reconstructs from phase files or `fast-summary.md` if state is missing or stale. Phase 4 tracks `pending / in_progress / complete` per task in `phase4-progress.md`, and all phases record intra-phase checkpoints in `workflow-state.md`.

### State bootstrap and repair

When `/workflow-next` can reconstruct one safe next command from phase
artifacts or `fast-summary.md`, it repairs or creates `kaola-workflow/{project}/workflow-state.md`
before routing by running `scripts/kaola-workflow-repair-state.js` when the
helper is available. It does not create state for brand-new work, ambiguous
active projects, contradictory phase files, or unresolved compliance gates that
make the next command unsafe.

Hook installation is covered in the [Hook policy](#hook-policy) section above —
do not hand-merge entries into `~/.claude/settings.json`.

## Keep-open partial-close sinks

When a run is complete as a cycle but the issue must **stay open** (partial implementation, residual follow-ups), the main session writes `issue_action: comment_keep_open` into the `## Sink` block at the Closure Decision Gate (issue #336). Finalization then runs the full mechanical sink with **no manual FF-push cleanup**: `finalize --keep-open`/`--keep-issue-open` preserves the per-issue roadmap source (instead of deleting it) and regenerates `ROADMAP.md` still listing `#N`; `sink-merge --keep-issue-open` merges, pushes, removes the worktree/branch, and releases the claim exactly like a normal close, but posts a keep-open comment instead of closing the issue. Keep-open is **merge-sink-only** — a PR/MR sink would auto-close the issue via its `Closes #N` body, so the PR/MR sink (including the exit-3 merge-impossible auto-pivot) is refused with a typed BLOCKED, and the `sink-pr`/`sink-mr` scripts themselves refuse a project carrying `issue_action: comment_keep_open`.

## Multi-issue bundle lane (adaptive-only)

Issue #328 adds an additive bundle lane that lets N same-scope issues share one worktree, one branch, one `workflow-plan.md`, and one finalization that closes all N issues together. The single-issue path is byte-unchanged.

### Three entry modes

1. **Single issue (unchanged)** — `--target-issue N` or `KAOLA_TARGET_ISSUE=N`. No bundle fields. Behavior identical to prior releases.

2. **Explicit bundle** — pass `--target-issues A,B,C` (comma-separated, sorted+deduped) or set `KAOLA_TARGET_ISSUES=A,B,C`. Adaptive path only. The claim script validates all targets before any mutation (all-or-nothing: if any target is invalid the whole bundle is refused). On success, one `kaola-workflow/bundle-A-B-C/` folder is created and one `workflow/bundle-A-B-C` branch is provisioned (forge editions prefix the edition name, e.g. `workflow/gitlab-bundle-A-B-C`).

3. **Auto-bundle via `issue-scout`** — the orchestrator may dispatch the read-only `issue-scout` agent to recommend a same-scope issue set. The scout returns a structured recommendation; the orchestrator decides whether to proceed as a bundle. The scout MUST NOT claim, write files, author plans, or dispatch agents.

Setting both `--target-issue` and `--target-issues` (or both env-var equivalents) is refused with a `target_ambiguity` typed error before any state is written.

### Bundle claim semantics

`claimExplicitBundle` validates every issue in the set before mutating anything. If any single target fails validation the entire bundle is refused and no active folder is created. Typed refusal codes:

| Code | Meaning |
|------|---------|
| `target_ambiguity` | Both scalar and multi-target provided simultaneously |
| `target_set_empty` | Resolved issue list is empty after dedup |
| `target_set_too_large` | Bundle exceeds `KAOLA_BUNDLE_MAX_ISSUES` (default 4) |
| `bundle_requires_adaptive` | Bundle requested but `workflow_path` is not adaptive |
| `target_set_conflicts_active_work` | One or more targets overlap an already-claimed active folder |
| `target_set_has_closed_issue` | One or more targets are already closed on the forge |
| `target_set_red` | One or more targets are red (conflict) per the classifier |
| `target_set_unavailable` | Remote validation failed (forge unreachable) |
| `target_set_unverified` | Offline with no local evidence for one or more targets |
| `target_set_label_rollback_failed` | Claim succeeded but in-progress-label rollback on partial failure itself failed |

### All-or-nothing finalization

`cmdFinalize` on a bundle project closes every issue in `issue_numbers`, removes every `.roadmap/issue-N.md` source file, regenerates `ROADMAP.md` once, and archives the single bundle folder. Partial closure is not a success state — if one issue close fails the attempt is retried or surfaced as a failure.

### Adaptive path only

The bundle lane requires `workflow_path: adaptive`. Attempting a bundle claim on any other path returns `bundle_requires_adaptive`.

## Parallel active work

Multiple Kaola-Workflow runs can coexist when each targets a distinct active folder. The source of truth is `kaola-workflow/{project}/workflow-state.md`, with the configured forge's issue state used to reject closed issues and PR/MR state used by `watch-pr` (or `watch-mr` on GitLab).

- Startup requires an explicit `--target-issue N`; the agent chooses the issue and scripts validate it.
- Claiming uses atomic folder creation, so two agents cannot create the same `kaola-workflow/{project}/` folder.
- `status` lists active folders; `release` archives abandoned work; `finalize` archives completed work.
- The pre-commit hook blocks commits that stage multiple workflow project folders together.

### Parallel execution examples

Run one session per issue in separate terminals. Each `/workflow-next`
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

By default, every active issue (full, fast, and adaptive paths) runs in a
repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`, so file edits
in one issue do not interfere with another (set `KAOLA_WORKTREE_NATIVE=0` to
disable).

To drive several issues from a single session instead of several
terminals, scope the goal text accordingly:

```text
/goal use kaola-workflow to finish issues #42, #43, and #44, one at a
      time, in dependency order.
```

### Per-issue Git worktrees

By default, `kaola-workflow-claim.js` provisions a Git worktree on every
claim (full, fast, and adaptive paths) so each active issue has its own
checkout — separate from the main repo checkout and from every other active
issue. Set `KAOLA_WORKTREE_NATIVE=0` to disable (a repo-root run, no
worktree).

**Why.** With one shared checkout, two parallel sessions stepping on the
same files would collide on branch switches and stash state. A
per-issue worktree gives each session its own working tree, so file
edits, builds, and Phase 4 TDD runs in one issue do not affect another.

**Where.** Worktrees live at `<repo-root>/.kw/worktrees/<project>/`.
If the main repo is `~/Workspace/Kaola-Workflow`, the worktree for
project `issue-42` is `~/Workspace/Kaola-Workflow/.kw/worktrees/issue-42/`.
The `.kw/` directory is git-ignored. The absolute path is recorded in the
active folder's Sink block as `worktree_path`, so phase commands can resolve
the linked worktree without consulting a lock file.

**How phases use it.** Phase 4 resolves `ACTIVE_WORKTREE_PATH` at
startup — when `KAOLA_WORKTREE_NATIVE=0` it is the current directory; when
`KAOLA_WORKTREE_NATIVE=1` it is the per-issue worktree.
All `git`, `cp`, and path operations in Phases 4–6 are then anchored at
that root. Finalization's sink-merge runs against the worktree; `finalize`
removes the worktree by default after archiving the active folder, or
preserves it with `--keep-worktree` for the final commit gate.

**Listing and removal.** `kaola-workflow-claim.js worktree-status` lists
all active workflow worktrees with their issue, branch, and folder
metadata. `worktree-finalize` mirrors the final phase artifacts into the
linked worktree and commits them. The old visible sibling container
(`<repo-parent>/<repo-name>.kw/`) is deprecated; run
`kaola-workflow-claim.js legacy-worktree-cleanup` (dry-run by default;
add `--execute` to perform) to remove any worktrees still registered
under it. Dirty worktrees are skipped unless `--archive`, `--export`, or
`--force` is passed; branch refs are preserved.

## Release versioning

Current official release versions:

- Claude Code command install, GitHub edition: `6.21.4`
- Claude Code command install, GitLab edition: `6.21.4`
- Claude Code command install, Gitea edition: `6.21.4`
- Codex `kaola-workflow` plugin manifest: `4.21.4`
- Codex `kaola-workflow-gitlab` plugin manifest: `4.21.4`
- Codex `kaola-workflow-gitea` plugin manifest: `4.21.4`

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

`scripts/kaola-workflow-release.js` scripts this checklist. Run `--verify` first (changelog completeness + chain-receipt greenness check), then `--cut --version X.Y.Z` to rename `[Unreleased]`, bump `package.json` and the three Codex manifests in lockstep, and create the local tag in one crash-resumable transaction. Run `--push` last to receive forge-neutral guidance for pushing the tag and publishing the forge release; no forge CLI is invoked by the script itself. See `docs/conventions.md` § "Release cutting" and `docs/decisions/D-442-01.md` for the full contract.

Official release checklist (run the steps in order). `npm test` requires the
release tag to exist, so the tag is created **before** the test run:

```bash
# 1. Sanity-check the working tree (no whitespace errors / conflict markers).
git diff --check

# 2. Create the tag on the release commit (the commit that bumped package.json
#    and the release surface), not HEAD.
git tag kaola-workflow--v<X.Y.Z> <release-commit>

# 3. Validate. The full run verifies the tag exists and that the release surface
#    (including Codex manifest versions) matches the tag.
npm test

# 4. Push the new tag by name — BEFORE `gh release create`. An unpushed tag
#    makes `gh release create` create the REMOTE tag at the default-branch tip
#    (a different commit than your local tag target). npm test enforces the tag
#    is an ancestor of HEAD (issue #402), so a rebased-but-not-re-pointed tag reds.
git push origin kaola-workflow--v<X.Y.Z>

# 5. Only now publish the GitHub Release against the pushed tag.
gh release create kaola-workflow--v<X.Y.Z> --latest --notes-from-tag
```

If the release stack is rebased after tagging (origin advanced), the tag is
orphaned onto the pre-rebase commit. Re-point it onto the new release commit and
force-push the moved tag before publishing:

```bash
git tag -f kaola-workflow--v<X.Y.Z> <new-release-commit>
git push --force origin kaola-workflow--v<X.Y.Z>
```

**Note:** the full `npm test` requires the release tag to exist **and** to match
the current release surface, which is why the tag is created before the test run.
`KAOLA_WORKFLOW_OFFLINE=1` skips the tag-existence and release-surface checks (and
remote calls) for quick local iteration before the tag exists; it is not the
canonical release gate — the full online `npm test` after tagging is.

Tag rules:
- Tag the specific release commit (the commit that bumped `package.json`
  version and added the CHANGELOG section), not HEAD.
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

## License

Kaola-Workflow is released under the MIT License — see [LICENSE](LICENSE)
for the full text. The vendored Claude Code agent prompts under
`agents/` are derived from Everything Claude Code (ECC) and are also
MIT-licensed; their pinned upstream commit and attribution live in
[docs/agents-source.md](docs/agents-source.md).
