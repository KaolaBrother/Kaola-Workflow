# Kaola-Workflow

A 6-phase development workflow for Claude Code and Codex with per-phase file artifacts, multi-model orchestration, and full resumability across sessions and context resets.

## Overview

```
   /workflow-init       once per project — generates CLAUDE.md,
        │               ROADMAP.md, and the docs map
        ▼
   /workflow-next       per cycle — resumes from
        │               kaola-workflow/{project}/workflow-state.md
        │
        ├──► Fast path (KAOLA_PATH=fast)
        │      plan + implement + review in one pass ──► Phase 6
        │
        ├──► Adaptive path (KAOLA_PATH=adaptive, opt-in)
        │      freely composed task-shaped DAG of roles ──► Phase 6
        │
        └──► Full 6-phase flow:
                                                              output file
            Phase 1  Research    code-explorer, docs-lookup    phase1-research.md
            Phase 2  Ideation    planner  (advisor gate)       phase2-ideation.md
            Phase 3  Plan        code-architect                phase3-plan.md
            Phase 4  Execute     tdd-guide                     phase4-progress.md
                                 build-error-resolver
            Phase 5  Review      code-reviewer                 phase5-review.md
                                 security-reviewer (cond.)
            Phase 6  Finalize    doc-updater                   phase6-summary.md
                                 sink-merge | sink-pr
                                       │
                                       ▼
                       archive folder, close issue,
                       push branch or open PR,
                       refresh ROADMAP.md
```

## Autonomy and goal contract

Kaola-Workflow is goal-driven. Use `/goal` in either Claude Code or Codex
to keep a session working on a single objective across many turns until
the platform's stop condition is satisfied. The Kaola-Workflow Codex
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
technical decisions should consult the configured expert internally, then apply
and record the chosen answer: Claude Code uses the advisor/Opus path, while
Codex uses the strongest available expert model or agent profile for the
session. Prompt the user only for true external authorization or materially
user-owned choices, such as risky Git synchronization, destructive rewrites,
credential or deployment actions, or issue/roadmap reorganization.

Each `/workflow-next` run targets one issue and ends at Phase 6 closure.
The agent does not auto-continue across issues; cross-issue work requires
explicit user direction — typically stated upfront in `/goal` text (for
example, "finish all remaining open issues"), which then drives one
`/workflow-next` run per issue until the scope is met.

## Vendored Claude Code agents

Kaola-Workflow installs the Claude Code agents it needs directly from this
repository. The agent prompts are derived from Everything Claude Code (ECC) and
vendored under the MIT License; see [docs/agents-source.md](docs/agents-source.md)
for the pinned upstream commit, attribution, and refresh procedure.

| Agent | Phase | Model | Higher profile |
|-------|-------|-------|----------------|
| `code-explorer` | 1 — Research/Discovery (code facts) | Sonnet | |
| `docs-lookup` | 1 — Research/Discovery (external docs, when needed) | Sonnet | |
| `planner` | 2 — Ideation | Opus | |
| `code-architect` | 3 — Plan | Sonnet | yes |
| `tdd-guide` | 4 — Execute (per-task TDD executor) | Sonnet | |
| `implementer` | 4 — Execute (implementation without test-first ceremony; refactors, scaffolding, config, UI, migrations) | Sonnet | |
| `build-error-resolver` | 4–6 — Validation repair when needed | Sonnet | |
| `code-reviewer` | 5 — Review | Sonnet | yes |
| `security-reviewer` | 5 — Review (conditional) | Sonnet | yes |
| `doc-updater` | 6 — Finalize | Sonnet | |
| `adversarial-verifier` | Adaptive path — read-only skeptic (never a gate) | Sonnet | |
| `contractor` | All paths — mechanical bookkeeper (runs scripts + writes durable state; never a gate) | Sonnet | no |
| `workflow-planner` | Adaptive path — front-end (claims + authors the `## Nodes` DAG; runs the handoff which freezes mechanically) | Opus | no |

The **Model** column is the `common` profile. The **default** install profile is
`higher`, so the three agents marked _yes_ (`code-architect`, `code-reviewer`,
`security-reviewer`) install on **Opus** unless you pass `--profile=common`.

`adversarial-verifier` is locally authored for the [adaptive path](#adaptive-path-optional)
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

`workflow-planner` is locally authored for the [adaptive path](#adaptive-path-optional) front end: a
fixed-Opus agent the main session dispatches **once** at the start of the adaptive path. It runs the
claim/startup (worktree + `workflow-state.md`), **authors** the `## Nodes` DAG plus an empty
`## Node Ledger` into `workflow-plan.md`, runs the plan-validator `--json` as a self-check, and then
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

When agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. This makes Claude Code's built-in model badge render on every
subagent dispatch (the badge renders only when a concrete `model=` literal
differs from the agent's frontmatter). **After installing or re-running
`install.sh`, restart Claude Code for the model badges to take effect.**

> **Badge visibility by session model (Claude Code platform behaviour):**
> - **Session on Sonnet** — only Opus subagents show a badge. Sonnet-dispatched
>   agents (`code-explorer`, `tdd-guide`, `implementer`, `build-error-resolver`, `docs-lookup`,
>   `doc-updater`, `adversarial-verifier`) run silently. Opus-dispatched agents (`planner`,
>   `code-architect`, `code-reviewer`, `security-reviewer` on the default
>   `higher` profile) badge as expected.
> - **Session on Opus** — all subagents show a badge, regardless of their model.
>
> The badge is a model-switch indicator: it renders when the subagent's model
> differs from the session's default. This is by design in Claude Code.

The Opus advisor gates in Phases 2, 3, and conditional Phase 5 require
`"advisorModel": "opus"` in `~/.claude/settings.json` or an equivalent Claude
Code advisor configuration.

## Installation

### Choose an edition

Kaola-Workflow has three sibling editions:

- **GitHub edition**: default. Uses GitHub issues, pull requests, and `gh`.
- **GitLab edition**: opt-in. Uses GitLab issues, merge requests, and `glab`.
- **Gitea edition**: opt-in. Uses Gitea issues, pull requests, and `tea`. Requires `tea` ≥ 0.9.2 and Gitea server ≥ 1.17. **Forgejo note:** Forgejo ≥ 1.18 is expected to work via shared API surface but is not explicitly tested.

All editions share the same command names, so a manual Claude Code install
picks one forge at a time. Use the `--forge` flag on `install.sh` to select
the edition.

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

The default profile is `higher`: `code-architect`, `code-reviewer`, and
`security-reviewer` install on Opus (deeper threat modeling and architecture
analysis; roughly 3× cost for those three agents). All other agents are
unaffected. The `common` profile (those three on Sonnet) must be requested
explicitly with `--profile=common`.

```bash
./install.sh                              # GitHub edition, higher profile (Opus reviewers) by default
./install.sh --forge=gitlab               # GitLab edition, higher profile by default
```

To install the three reviewer agents on Sonnet, request the `common` profile:

```bash
./install.sh --profile=common             # Sonnet assignments for the three reviewer agents
```

#### Adaptive workflow path (opt-in)

The [adaptive workflow path](#adaptive-path-optional) — a third path beside fast and
full — is **OFF by default**. Enable it at install time:

```bash
./install.sh --enable-adaptive=yes        # writes enable_adaptive:true to ~/.config/kaola-workflow/config.json
```

The flag only flips the `enable_adaptive` switch that lets the path be *selected*; the
`/kaola-workflow-adapt` and `/kaola-workflow-plan-run` commands and the
`adversarial-verifier` agent install on every run regardless. The default
(`--enable-adaptive=no`) writes nothing, so the switch stays absent and the path stays
off. You can also enable it per session with `KAOLA_ENABLE_ADAPTIVE=1` (environment
overrides config).

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

## Codex packs

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

Update an existing Codex install:

```bash
cd ~/kaola-workflow
git pull
```

Restart Codex to pick up the updated plugin files.

To verify a project was initialized for Codex, check that `.codex/config.toml`
contains a `# BEGIN kaola-workflow agents` managed block and that
`.codex/agents/kaola-workflow/` contains the role profile files.

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
docs-lookup
planner
code-architect
tdd-guide
build-error-resolver
code-reviewer
security-reviewer
doc-updater
adversarial-verifier
```

(`adversarial-verifier` is the read-only skeptic for the opt-in adaptive path; it is
mirrored into the Codex editions for parity and is never a review gate.)

The managed setup copies role configs into `.codex/agents/kaola-workflow/` and
maintains a `# BEGIN kaola-workflow agents` block in `.codex/config.toml` while
preserving unrelated config. Codex workflows default to delegation
(`delegation_policy: delegate`) without prompting: phases invoke those roles for
delegated research, planning, execution, repair, review, and documentation work.
When the role profiles are absent the workflow auto-detects this, keeps the
`delegate` policy, and records the affected rows as evidenced
`local-fallback-tool-unavailable`. The current Codex session performs the work
locally under `local-authorized` only when you explicitly disable delegation.

Codex profiles intentionally do not pin model names, so model upgrades can flow
through the user's active Codex configuration. They only set reasoning effort:

| Role | Reasoning effort |
| --- | --- |
| `code-explorer` | `medium` |
| `docs-lookup` | `medium` |
| `planner` | `xhigh` |
| `code-architect` | `high` |
| `tdd-guide` | `medium` |
| `build-error-resolver` | `medium` |
| `code-reviewer` | `high` |
| `security-reviewer` | `high` |
| `doc-updater` | `low` |
| `adversarial-verifier` | `high` |

There is no separate Codex advisor role. Codex advisor gates use the strongest
available expert model/profile for the current session, or the current session
performs the same review locally when no detached advisor profile is available.

## Release versioning

Current official release versions:

- Claude Code command install, GitHub edition: `5.7.0`
- Claude Code command install, GitLab edition: `5.7.0`
- Claude Code command install, Gitea edition: `5.7.0`
- Codex `kaola-workflow` plugin manifest: `3.7.0`
- Codex `kaola-workflow-gitlab` plugin manifest: `3.7.0`
- Codex `kaola-workflow-gitea` plugin manifest: `3.7.0`

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
- `MINOR`: backward-compatible workflow phases, agent roles, install features,
  or new automation.
- `PATCH`: compatible bug fixes, validation fixes, documentation-only updates,
  or small install clarifications.

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

# 4. Push only the new tag by name.
git push origin kaola-workflow--v<X.Y.Z>
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

### Fast path (optional)

For small, well-scoped issues where the approach is unambiguous and mechanical — exactly one sensible way to do it (a rename or move, threading an existing field through a known call path, a behavior-preserving refactor, repetitive parallel edits, or a bug fix whose root cause is already located), confined to a single area of ≤ 5 files with no new external deps, no public API/schema/migration change, no security/auth/encryption concern, and no `depends-on:#N` — request the fast-path workflow. Anything with ≥ 2 materially-different viable approaches stays on full regardless of size, because that is a design choice where full-workflow ideation earns its keep:

```
KAOLA_PATH=fast /workflow-next
```

Fast path executes Plan, Implement, and Review in a single pass, writing `fast-summary.md` instead of the full 6-phase artifacts. If the planner surfaces ≥ 2 materially-different viable approaches (`approach_ambiguity`), or scope expands during execution (beyond the declared write set by more than 1 file or past the absolute backstop of 6 files, security concerns, dependencies, new packages), fast path escalates automatically to the full workflow. Otherwise, it routes directly to Phase 6.

### Adaptive path (optional)

For larger, **structurally non-linear** issues — work that naturally fans out into disjoint sub-areas, needs parallel research across several subsystems, or calls for a non-standard verification shape — the adaptive path lets the agent **freely compose a task-shaped DAG of role nodes** inside Kaola's locked lifecycle frame (claim → branch/worktree → *free design* → Phase-6 sink), instead of following the fixed fast or full sequence. It is **opt-in and OFF by default**: enable it at install time with `./install.sh --enable-adaptive=yes` (writes `enable_adaptive: true` to `~/.config/kaola-workflow/config.json`) or per session with `KAOLA_ENABLE_ADAPTIVE=1` (precedence: env > config > OFF). With the switch off, behavior is exactly as before — `adaptive` is absent from path selection and `KAOLA_PATH=adaptive` is a typed refusal, never a silent downgrade.

```
KAOLA_PATH=adaptive /workflow-next
```

`/kaola-workflow-adapt` opens by dispatching the `workflow-planner` front-end subagent **once**: it claims/starts up (writes `workflow-state.md` and provisions a worktree at `.kw/worktrees/<project>/` — startup records `run_posture: worktree` in the `## Sink` block, derived from the actual worktree resolution; the planner authors the plan at repo-root and the executor operates inside the provisioned worktree), authors the plan as a `workflow-plan.md` (a `## Nodes` DAG plus an empty `## Node Ledger`), and runs `kaola-workflow-adaptive-handoff.js`. The plan must be **in-grammar**: roles drawn from the closed role library, one of four shapes (`sequence`, bounded fan-out over pairwise-disjoint write sets up to `KAOLA_FANOUT_CAP`, a bounded loop, or a selective-execution `select(<group>)` arm), a single unique `finalize` sink, and computed **post-dominance gates** (`code-reviewer` over every code-producing node, `security-reviewer` over every sensitive node). The handoff script branches on the plan-validator `--json` `result`: on `in-grammar` it freezes mechanically — writing a `plan_hash` inside `workflow-plan.md` (re-checked on every load, so post-freeze tampering is refused) — resume-checks, stages the roadmap, and writes `## Planning Evidence` into `workflow-state.md`, then returns `handoff_status: ready_to_run` with a checklist and advisory `first_node` metadata. The handoff does **not** open the first node or record its baseline. `decision:auto-run` vs `ask` is **audit metadata** recorded in the packet — the run proceeds either way with no user-approval gate. On `refuse` the handoff returns `plan_invalid` with no mutation; the orchestrator drives a bounded repair loop (re-dispatching the planner with validator errors) rather than silently looping. The main session routes directly to `/kaola-workflow-plan-run`, which opens and dispatches every node including the first via `kaola-workflow-adaptive-node.js` transactions, with per-node checkpoints; it is resume-safe and toggle-agnostic (a frozen plan finishes even if the switch is later turned off) and hands off to Phase 6 on an all-complete ledger.

The adaptive path adds one role — `adversarial-verifier`, a read-only, refute-by-default skeptic used in read-only verification fan-outs. It is never a review gate and touches zero repository files.

#### Supported adaptive patterns

The four shapes (`sequence`, `fanout`, `loop`, `select`) are a *grammar*, not a fixed menu — the planner composes them with `depends_on` edges and the right role on each node into a task-shaped DAG. The patterns below are **composable building blocks, not options to choose between**: the planner draws *several* into one DAG to fit the issue (the final **Composed** row stacks three at once). Each row is a real, in-grammar `workflow-plan.md` the validator accepts; the **Governance** column is the decision `kaola-workflow-plan-validator.js` returns (`auto-run` = proceeds immediately; `ask` = recorded as audit metadata by the handoff, which still freezes and proceeds — no approval gate — but the blast-radius reason is surfaced in the packet for the orchestrator).

| Pattern | What it is | How the planner composes it | Governance |
|---|---|---|---|
| **Plan-then-implement** | The linear shape: explore, plan, implement, review, finalize. | `code-explorer` → `planner` → `tdd-guide` → `code-reviewer` → `finalize`, each `depends_on` the previous (`shape: sequence`). | `auto-run` (no fan-out, no loop) |
| **Fan-out-and-synthesize** | Work that splits into disjoint sub-areas, then merges. | `fanout(impl)`: N `tdd-guide` nodes over **pairwise-disjoint** top-level directories (e.g. `api/` and `cli/`), then a `code-reviewer` node that `depends_on` every leg — the merge/synthesize point. Width is bounded by `KAOLA_FANOUT_CAP` (default 4). | `ask` (write-role fan-out → blast-radius) |
| **Adversarial verification** | Re-test a finished claim with independent skeptics. | After the `code-reviewer` gate, a read-only `fanout(verify)` of `adversarial-verifier` nodes (empty write sets, each prompted to *refute*) feeding the sink; the orchestrator tallies a quorum from their `verdict: pass\|fail` evidence. Read-only fan-out has **zero** blast radius. | `auto-run` |
| **Bounded loop (review-fix)** | Re-run one role until a mechanical verdict passes. | A `loop(<cap>)` node (e.g. a `code-reviewer` or `build-error-resolver` cycle) re-invoked up to a static cap (`LOOP_CAP` = 5); a #251 `verdict: pass` exits early. The cap is the halting guarantee — the loop can only end sooner, never run longer. | `ask` (loop present) |
| **Generate-and-filter** | Generate several candidate approaches, filter to the best, then build it. | Read-only `fanout(gen)` of angled `planner` attempts → a `planner` reduce node (the rubric/filter that picks one) → a single `tdd-guide` implements the winner → `code-reviewer` gate → `finalize`. The "discard" is the reduce node's choice, not a grammar feature. | `auto-run` (read-only generators + one sequential implement) |
| **Tournament** | Competing candidate plans reduced to a winner by pairwise judges. | Read-only `fanout(attempt)` of `planner` nodes → hand-wired pairwise `code-reviewer` judges (each `depends_on` two attempts) → a final judge → `finalize`. There is no native bracket shape — the bracket is ordinary `depends_on` wiring; feed the winner to a downstream `tdd-guide` to build it. | `auto-run` (read-only) |
| **Classify-And-Act** | Routing to exactly one of several mutually-exclusive arms based on what a read-only classifier finds (e.g. "fix the CSV exporter **or** the HTML renderer, whichever is at fault"). | A read-only `code-explorer` classifier node writes `selector: <arm-id>` to its `.cache/<id>.md` evidence; each arm carries `shape: select(<group>)` and a `selector_source` pointing to the classifier. On the classifier's commit, `plan-validator --selector-check` reads the selector and **fail-closes (exit 1, blocking the commit) on a missing or foreign value** — the script-mechanical guarantee that neither "run all" nor "run none" can occur. It returns `armsToNa`; the contractor marks unselected arms `n/a` in the ledger, and `next-action.js` treats `n/a` arms as terminal so only the one selected arm becomes ready. Risk is assessed over the union of all arms; the selector is read-only (zero blast radius); `n/a` arms cannot smuggle unreviewed writes because they never execute. | `auto-run` (selector is read-only; write-role arms are mutually exclusive, not concurrent) |
| **Composed (multi-pattern)** | The realistic case — several patterns stacked in one DAG. The planner *composes*, it does not pick one. | e.g. a read-only multi-modal sweep (`fanout(sweep)` of `code-explorer` → `planner`) **then** a parallel implement (`fanout(impl)` of `tdd-guide` → `code-reviewer` gate) **then** an adversarial-verify skeptic fan-out → `finalize`: one 10-node plan in which `code-reviewer` still post-dominates **both** implement legs. Locked as a fixture in `testAdaptivePatternLibrary`. | `ask` (write-role fan-out present) |

The first seven are building blocks; the last row stacks three of them. The two read-only design shapes (**Generate-and-filter**, **Tournament**) — they compare or select approaches and write nothing, so they carry zero blast radius and auto-run; the chosen approach then flows into an ordinary write-role implement under the same gates. Every plan, whatever its shape, still crosses the same non-removable walls: a single unique `finalize` sink, `code-reviewer` **post-dominating** every code-producing node, and `security-reviewer` post-dominating every sensitive node (re-derived from the files actually touched, not an author flag). A plan that routes a gate around itself is a typed refusal, not a silent pass.

#### Parallel ready-set execution (issue #281)

The executor runs **one FRONTIER UNIT at a time** rather than strictly one node at a time. A frontier unit is either a single node (the legacy path, unchanged) or a **batch** of ready siblings when `next-action.js` reports `readyPending.length >= 2`.

**Responsibility split.** `kaola-workflow-parallel-batch.js` owns batch **STATE** only: it opens the batch (`open-batch`), seals members individually (`seal-member`, `seal`), and merges results (`join`). The plan-run SKILL running in the main session owns concurrent **DISPATCH**: after `open-batch` completes, the main session issues multiple `Agent()` calls in one message — one per batch member. The script never spawns an agent; a subagent cannot dispatch a subagent. A green plan-run is not evidence of wall-clock parallelism — the only observable concurrency is at host runtime when the main session issues those concurrent `Agent()` calls.

**Read-only batches** (fully supported): siblings with empty declared write sets need no filesystem isolation. They share the active worktree; each writes `.cache/{id}.md` evidence; `seal-member` trivially passes the per-node barrier (empty declared set → empty diff). Use cases include Fan-out-and-synthesize research legs, Adversarial Verification skeptic fan-outs, and quorum reviews.

**Write-role batches** (`fanout(...)` over disjoint write sets): each member requires an isolated node worktree keyed by `(projTag, node-id)`. Disjointness is proven at validator freeze time and re-confirmed in `open-batch` (fail-closed on overlap). The `join` step performs a path-scoped, idempotent checkout into the parent worktree; no attribution ambiguity is possible because every path belongs to exactly one member. Where the host lacks isolated-worktree support, write-role batch members **degrade to serialized execution** — opened one at a time through the same per-node lifecycle. Correctness is preserved; wall-clock parallelism is forgone.

**`parallel-batch.js`** is pure composition over `next-action.js`, `commit-node.js`, and `plan-validator.js`, mirroring the pattern `adaptive-node.js` uses. It adds no new barrier or gate surface — `seal-member` calls the unchanged `commit-node --node-id N` barrier for each member; Phase-6 `--barrier-check` sees normal `complete` rows in the ledger after `join`.

**`workflow-planner` now authors efficient DAGs**: expose independent work as siblings (a shared ready frontier) so the executor can open them as one batch; serialize only for true dependencies, shared file lanes, selectors, loops, or gates.

For the full design, see `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

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
| `kaola-workflow-roadmap.js` (GitHub) / `kaola-gitlab-workflow-roadmap.js` (GitLab) / `kaola-gitea-workflow-roadmap.js` (Gitea) | Regenerates `kaola-workflow/ROADMAP.md` from `kaola-workflow/.roadmap/issue-{N}.md`, and appends an optional project-local `kaola-workflow/.roadmap/_rules.md` to the generated `## Rules` section under a `### Project rules` sub-heading (no-op, byte-identical output, when the file is absent or empty). Shared subcommands: `generate`, `validate`, `validate-remote`, `init-issue`, `project-name`; GitHub also supports `migrate`, while GitLab/Gitea support `refresh`. | Phase 1, Phase 6 |
| `kaola-workflow-repair-state.js` | Reconstructs `workflow-state.md` from existing phase artifacts or `fast-summary.md` when state is missing or stale, so a resumed session has a single safe next command. | Init / Resume |
| `kaola-workflow-closure-audit.js` (GitHub) / `kaola-gitlab-workflow-closure-audit.js` (GitLab) / `kaola-gitea-workflow-closure-audit.js` (Gitea) | Reports closure drift (stale `.roadmap` sources, `ROADMAP.md` listing closed issues, stale `workflow:in-progress` labels, active folders/unarchived PR/MR folders for closed issues). Dry-run JSON by default; `--execute` repairs only safe local roadmap/label drift and never deletes active folders or worktrees. GitLab edition uses `unarchived_mr_folders` with lowercase MR state matching (`merged`/`closed`). Gitea edition keeps `unarchived_pr_folders` with lowercase PR state matching (`merged`/`closed`). Complements `stale-worktree-check`/`-cleanup` (which owns worktree/branch drift). | On demand / audit |
| `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea) | Phase 6 merge sink: fetch, rebase onto `origin/main`, FF-only merge with retry on race conditions, push, close the issue, and clean up the branch. Falls back to the PR sink when the merge is impossible. | Phase 6 |
| `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) | Phase 6 PR/MR sink: push the branch, open a PR via `gh pr create` (GitHub), `glab mr create` (GitLab), or `tea pr create` (Gitea), record the PR/MR URL, and optionally enable auto-merge. | Phase 6 |
| `kaola-workflow-compact-context.js` | Wired to the `SessionStart` (`compact`) hook. Reads the most recent `workflow-state.md` and injects a resume hint into the post-`/compact` session. | Hook |
| `kaola-workflow-fast-audit.js` | Read-only fast-path calibration audit: scans archived and active `fast-summary.md` files and reports status counts, escalation-reason histogram, file-count distribution, and review mode (delegated `code-reviewer` vs self-review). Human table by default; `--json` for machine-readable output. Always exits 0. | On demand / audit |

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
| `KAOLA_WORKFLOW_OFFLINE` | `0` | Skip GitHub/GitLab/Gitea calls for local tests or air-gapped usage. When unset and remote validation fails, startup returns `target_unavailable` refusal instead of silently proceeding |
| `KAOLA_WORKFLOW_DEBUG_CWD` | (unset) | DEV/TEST ONLY — when set, `sink-merge.js` writes its final cwd to this file |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL` | (unset) | DEV/TEST ONLY — fail first N fast-forward merge attempts (GitHub, GitLab, and Gitea) |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | (unset) | DEV/TEST ONLY — force merge-impossible error in sink-merge fallback tests (GitHub, GitLab, and Gitea) |
| `KAOLA_PATH` | (unset) | Set to `fast` to request fast-path execution, or `adaptive` to request the adaptive (dynamic-composition) path when `enable_adaptive` is on; defaults to the full six-phase flow |
| `KAOLA_ENABLE_ADAPTIVE` | (unset) | Per-session override of the `enable_adaptive` install switch (`1`/`true`/`yes` on, `0`/`false`/`no` off). Precedence: env > `~/.config/kaola-workflow/config.json` > OFF |
| `KAOLA_FANOUT_CAP` | `4` | Maximum width of an adaptive fan-out group (governance bound) |

**Active-folder subcommands:**

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `startup` / `bootstrap` | `node scripts/kaola-workflow-claim.js startup --target-issue <N> [--runtime claude|codex] [--sink merge|pr]` | Validates and atomically creates or reuses the active folder for issue N |
| `status` | `node scripts/kaola-workflow-claim.js status` | Lists active folders and their issue, branch, phase, sink, and worktree metadata |
| `release` / `discard` | `node scripts/kaola-workflow-claim.js release --project <name>` | Archives an active folder as abandoned and clears advisory forge labels when online |
| `finalize` | `node scripts/kaola-workflow-claim.js finalize --project <name> [--keep-worktree]` | Marks the folder closed and moves it to `kaola-workflow/archive/`; by default removes the linked worktree, while `--keep-worktree` preserves it for the final commit gate |
| `sink-fallback` | `node scripts/kaola-workflow-claim.js sink-fallback --project <name> [--reason <text>]` | Records merge-impossible fallback; updates Sink block to sink: pr; writes .cache/sink-fallback.json |
| `watch-pr` | `node scripts/kaola-workflow-claim.js watch-pr` | Archives PR-backed folders when the forge reports MERGED or CLOSED. GitLab edition uses `watch-mr` (`kaola-gitlab-workflow-claim.js watch-mr`) instead. |
| `stale-worktree-check` | `node scripts/kaola-workflow-claim.js stale-worktree-check` | Detects and reports worktrees and branches for closed or archived issues that are not currently active |
| `stale-worktree-cleanup` | `node scripts/kaola-workflow-claim.js stale-worktree-cleanup [--execute] [--archive] [--export] [--force] [--keep-branch]` | Removes stale worktrees and branches found by `stale-worktree-check`. Dry-run by default; `--execute` performs removal. For dirty worktrees: `--archive` stashes changes first (recoverable via `git stash list`), `--export` writes a patch to `kaola-workflow/archive/exports/`, `--force` discards. `--keep-branch` removes the worktree but keeps the branch (for open PRs). No strategy flag = dirty worktrees are skipped. When multiple strategy flags given, precedence is: archive > export > force. |
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

The sink mode is set at claim time and determines how Phase 6 delivers the completed work. Two paths are available:

**Intent detection** (recommended): If the user's initial prompt contains PR intent keywords ("open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink"), the agent exports `KAOLA_SINK=pr` before the startup call. Startup Step 0 passes `--sink pr` to `claim`, which writes `sink: pr` to the `## Sink` block of `workflow-state.md`. Phase 6 dispatches to `kaola-workflow-sink-pr.js` (GitHub), `kaola-gitlab-workflow-sink-mr.js` (GitLab), or `kaola-gitea-workflow-sink-pr.js` (Gitea).

**Auto-fallback**: When `sink: merge` is configured and the push to main fails with a merge-impossible error (branch protection, non-fast-forward, or permission denied), Phase 6 automatically pivots to PR creation. `sink-merge.js` writes a `.cache/sink-fallback.json` receipt and exits 3. Phase 6 calls `claim.js sink-fallback` to update the Sink block (`sink: pr`, `sink_fallback_reason: <reason>`), then dispatches to `kaola-workflow-sink-pr.js`. If the project was already archived before the push failure, the receipt write is skipped to prevent resurrecting a phantom active folder (issue #216).

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

The sink-merge script automates the final merge sequence after Phase 6's
final commit gate: fetch, rebase onto `origin/main`, fast-forward merge with
retry on race conditions, push, close the issue, and clean up the branch.
When offline, the PR sink writes a placeholder receipt so the workflow can
resume online later.

## Roadmap cycle

Use a separate research or roadmap session to discover future work and create or refine forge issues. `/workflow-next` is the implementation cycle: it fetches open forge issues, mirrors active unfinished work into `kaola-workflow/ROADMAP.md`, advances one selected item, then comments on or closes linked issues after validation.

The local roadmap is a working mirror, not the source of truth. Keep only active unfinished work there; completed workflow folders move to `kaola-workflow/archive/`.

The workflow also enforces context discipline: `CLAUDE.md` targets under 200 lines, the local roadmap should not become history storage, and agent prompts should include only the relevant phase excerpts needed for the delegated task.

Each phase records a required-agent compliance ledger. Each active workflow also maintains `workflow-state.md`, which records the current phase, intra-phase step, next command, pending gates, and ownership rules. After resume or compaction, the main session must read that state file and the relevant compliance ledger before continuing.

Avoid redundant validation runs: Phase 4 uses targeted affected checks, Phase 5 validates only review fixes or cites existing evidence, and Phase 6 runs each full final command once against the final candidate state. Small targeted commands may run in the main session, while expensive or noisy test/lint/type/build commands should be delegated and summarized from cache evidence.

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
| `kaola-workflow:phantom-advisor` | `PostToolUse` (`Write\|Edit`) | Blocks writes/edits to files under `kaola-workflow/{project}/` that cite the advisor without a backing `.cache/advisor-*.md` evidence file in the same project | `hooks/kaola-workflow-phantom-advisor.sh` |
| `kaola-workflow:subagent-dispatch-log` | `SubagentStart` (`*`) | Records each subagent spawn (`agent_type`, `agent_id`, `cwd`) as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` for WARN-FIRST closure attestation (#277 M1). Fail-open; Claude-Code editions only | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

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

Phase 6 still owns the final full validation gate. It also reconciles
documentation with code changes and issue/roadmap state, consults the
advisor before closing when deferred items or conflicts remain, and
leaves commit-and-push as the final step on a clean, synced workspace.

## Phases

| # | Phase | What happens | Output file |
|---|-------|-------------|-------------|
| 1 | Research/Discovery | Facts only: requirement parsing → code-explorer maps affected code/patterns/tests/config → docs-lookup checks external docs when needed → completeness gate | `phase1-research.md` |
| 2 | Ideation | Strategy only: planner generates 2–3 grounded approaches → advisor gate → user selects | `phase2-ideation.md` |
| 3 | Plan | Blueprint only: code-architect turns selected approach into files, tasks, write sets, dependencies, parallel groups, and validation | `phase3-plan.md` |
| 4 | Execute | Per-task TDD loop: tdd-guide executes RED → GREEN → REFACTOR; main session reviews, validates, and checkpoints | `phase4-progress.md` |
| 5 | Review | code-reviewer always; security-reviewer conditional; review fixes delegated to tdd-guide/build-error-resolver | `phase5-review.md` |
| 6 | Finalize | Full validation with delegated repair if needed, documentation docking, closure decisions, issue/roadmap/archive updates, final commit and push | `phase6-summary.md` |

All phase files are written to `{project-root}/kaola-workflow/{project-name}/` while active. Completed workflow folders are archived to `{project-root}/kaola-workflow/archive/`. Active unfinished work is tracked in `{project-root}/kaola-workflow/ROADMAP.md`.

The optional [adaptive path](#adaptive-path-optional) does not follow this fixed numbered sequence: it composes role nodes into a `workflow-plan.md` DAG (with a frozen `plan_hash` and a `## Node Ledger`) and runs them dynamically, still landing in the same Phase-6 sink. The fast and adaptive paths are opt-in; the full six phases above are the default.

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
that root. Phase 6's sink-merge runs against the worktree; `finalize`
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
