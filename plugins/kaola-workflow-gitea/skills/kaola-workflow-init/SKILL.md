---
name: kaola-workflow-init
description: Use when setting up a project for Kaola-Workflow for Codex, also called kaola-workflow or workflow-init, or refreshing its Codex-specific guidance, roadmap, and documentation scaffold.
---

# Kaola-Workflow Init

Bootstrap the current repo for repeated Kaola-Workflow for Codex cycles. Preserve existing project guidance and add only missing Codex-specific structure.

## Required Behavior

1. Read applicable `AGENTS.md` files first.
2. Inspect project state:

```bash
pwd
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
```

3. Create or update `AGENTS.md` only when needed. Preserve user-authored content.
4. Create or update `CLAUDE.md` with canonical workflow guidance. If `CLAUDE.md` already exists, update the `## Non-Negotiable Rules` section in-place with the canonical 5 bullets.

   Active folder lifecycle: `kaola-gitea-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-pr, and finalize/archive. No legacy coordination layer is used.

   Kaola-Workflow agent profiles live in `.codex/agents/kaola-workflow/` and are wired by the managed block in `.codex/config.toml`.

<!-- KW-CLAUDE-TEMPLATE-START -->
```markdown
# Claude Project Instructions

## Project Snapshot

- Purpose: [one sentence from README, package metadata, or user context]
- Stack: [detected languages/frameworks/tools]
- Architecture: [2-3 bullets max, or "unknown"]

## Commands

- Install: `[command or unknown]`
- Test: `[command or unknown]`
- Lint/typecheck/build: `[commands or unknown]`
- Dev server: `[command or unknown]`

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and relevant surrounding conventions immediately before editing or creating files.
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Goal-driven execution: Define verifiable success criteria before starting. Prefer write-the-failing-test-first for bugs and features. Loop until criteria pass; don't declare done on weak signals.
- Verify facts, don't fabricate: do not guess API/library behavior, interfaces, or signatures — confirm them against documentation, source, or a run before relying on them. Do not claim to understand code, errors, or requirements you have not verified; name what you do not know and find out.
- Reuse before adding: before writing a new interface, search for an existing equivalent and extend it rather than duplicate functionality.
- Escalate irreversible changes: do not unilaterally make hard-to-reverse changes or alter a user-owned contract (public API, schema or data migration, dependency or build-tooling swap, deletion of working capability); state the decision and its evidence, then get confirmation before proceeding.

## First Principles

These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when no shipped rule covers a situation, resolve it by walking these axioms in order and record a one-line derivation in the node's evidence file. This derivation is optional — its absence never blocks a gate.

**Tighten-only boundary:** an axiom may only make an agent stricter, never looser. Never cite an axiom to skip a typed gate, refusal, or barrier — gates define the allowed space; axioms only break ties inside it.

**Parallel by default:** concurrency is the standing default for independent work. Holding work serial is a positive claim that requires present-tense, checkable evidence — a named data dependency (name the artifact one unit consumes from the other), a named shared irreversible resource, or a host without isolated worktrees; guesses and anticipations ("might overlap") never justify serial. Wrongly-parallel work costs one bounded reconcile inside isolated legs; wrongly-serial work silently costs wall-clock on every frontier. This governs whether to run work concurrently — width stays sized to the true shape of the task.

## Kaola-Workflow

- Use `/workflow-next` as the workflow entrypoint and router.
- Keep node work scoped, resumable, and recorded under `kaola-workflow/`.
- Maintain `workflow-state.md` for active work; it records the frozen plan reference, the running set, pending gates, and the next command.
- The workflow runs an adaptive, task-shaped DAG of role nodes: the `planner` authors and freezes `workflow-plan.md`, then the executor runs it node-by-node via the running-set scheduler.
- Delegate node work to the vendored Claude Code agents by default; the main session owns orchestration, review, validation, integration, and final decisions.
- Name nodes by function: read/research → `code-explorer`/`knowledge-lookup`; strategy/blueprint → `planner`/`code-architect`; execution → `tdd-guide` (test-first) or `implementer` (refactors, scaffolding, or config with no natural failing test); gates → `code-reviewer`/`adversarial-verifier`; docs → `doc-updater`.
- Name roles by function and reasoning tier, never by a vendor model name — write `planner (reasoning tier)`, not `planner (<model>)`. Keep this section runtime-neutral so it reads correctly on every runtime that reads this repo.
- For read/research nodes, spawn `code-explorer` for codebase research and `knowledge-lookup` when external library/API behavior or open-web/expertise knowledge that cannot be confirmed locally is needed.
- `tdd-guide` runs a node test-first; `tdd-workflow` is the RED -> GREEN -> REFACTOR playbook it follows.
- Route build/type/lint validation failures to `build-error-resolver`; route behavior or coverage failures back to `tdd-guide`.
- Use the vendored agent role names exactly as installed; prefer short names like `planner`. When spawning a Kaola subagent, pass the role's configured model on the spawn call — each agent ships its model in its installed profile.
- At `/workflow-next` startup, fetch remote-tracking refs, classify local/upstream sync state, and ask before any risky synchronization.
- Use `/goal` or equivalent prompt-based Stop-hook wording so work continues until its objective and completion audit are satisfied.
- The `/goal` template must not use "next issue in line" or any phrasing that implies automatic cross-issue continuation. Each `/workflow-next` run targets one issue; finishing it is the terminal event. The single-issue completion contract requires explicit re-direction for the next issue.
- Treat nonessential workflow bookkeeping as autonomous: generated project names, collision suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected automatically and recorded.
- For essential technical decisions, apply your own judgment, apply the selected answer, and record the evidence under `.cache/{node-id}.md`.
- Prompt the user only for true external authorization or materially user-owned choices, including risky Git synchronization, destructive rewrites, deployment/credential actions, and issue or roadmap reorganization.
- Gitea issues are the roadmap source of truth when available; `kaola-workflow/ROADMAP.md` is the local active-work mirror.
- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`; do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, the frozen `workflow-plan.md` (its `## Node Ledger`), and per-node `.cache/{node-id}.md` evidence.
- Roadmap/research sessions create or refine issues; `/workflow-next` sessions implement one selected item and refresh the mirror.
- After resume or compaction, read `workflow-state.md`, `workflow-plan.md` (the `## Node Ledger`), and the compliance ledger before continuing.
- State Bootstrap And Repair: if `/workflow-next` safely reconstructs one next command from `workflow-plan.md` and its `## Node Ledger`, run the state repair helper and repair `workflow-state.md` before routing.
- The adaptive DAG is the only workflow path.
- End each cycle by docking docs against code changes, resolving closure decisions, updating issues, refreshing the roadmap, archiving completed workflow folders, and clearing pending compliance rows before the final commit and push.
- Active issue work runs in a repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
- Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`) when the repo uses something other than P0–P3 naming.

## Project Conventions

[detected or user-provided conventions only; omit this section if none]

## Known Gotchas

[real repeated hazards only; omit this section if none]

## Documentation Map

- `README.md` — project overview and usage.
- `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — documentation index.
- `docs/architecture.md` — system structure and data flow.
- `docs/api.md` — APIs, schemas, events, and external contracts.
- `docs/conventions.md` — coding, testing, Git, and review rules.
- `docs/workflow-state-contract.md` — detailed durable state and generated mirror contract.
- `docs/decisions/` — architecture decision records.
- `kaola-workflow/ROADMAP.md` — active implementation roadmap.

## Maintenance

- Keep this file under 200 lines; move detail to docs or skills.
- Add rules only after repeated mistakes, review feedback, or stable project conventions.
- Do not use `@path` imports for optional reference material.
```
<!-- KW-CLAUDE-TEMPLATE-END -->

5. Agent role profiles are a one-time GLOBAL install — `workflow-init` does NOT install them per repo.

Profiles install once into `~/.codex` and are available in every repo (parity with Claude global agents). `workflow-init` only scaffolds the project. If not yet installed (or after upgrade), run the one-time global install:

```bash
plugin_root="plugins/kaola-workflow-gitea"
if [ ! -f "$plugin_root/scripts/install-codex-agent-profiles.js" ]; then
  script_path="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)"
  plugin_root="$(dirname "$(dirname "$script_path")")"
fi
test -f "$plugin_root/scripts/install-codex-agent-profiles.js"
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global
```

Writes `~/.codex/agents/kaola-workflow/*.toml` + the managed block in `~/.codex/config.toml`, refreshes global hooks — one install, all repos. The preflight gate accepts the global scope. (To pin to one repo instead, pass the repo path positionally — `… "$PWD"` — optional override.)

Run an agent-guided Codex config audit before claiming role dispatch readiness:

```bash
codex features list | rg 'multi_agent|multi_agent_v2' || true
node "$plugin_root/scripts/kaola-workflow-codex-preflight.js" --doctor --project-root "$PWD" --json
```

Read the doctor JSON's additive per-scope `dispatch_posture` field alongside the
existing checks — it is the effort-gated runtime dispatch MODE (version-guarded on
codex-tui 0.142.5; may change in a future Codex release), distinct from feature
enablement: `none` (spawn tools not exposed), `explicitRequestOnly` (tools exposed,
but the runtime model-refuses a spawn unless the session explicitly asks), or
`proactive` (`model_reasoning_effort = "ultra"` — the runtime accepts a spawn with
no per-session ask). Classify the result:

- `ok`: `multi_agent` and `multi_agent_v2` are enabled, `codex_v2_role_transport_ready` is `true` (`codex_v2_tool_namespace: "agents"`, visible role metadata, direct-only transport), generated role profiles are fresh, agent limits are absent or sufficient, AND `dispatch_posture` reads `proactive`.
- `explicit_request_only`: features are enabled, `codex_v2_role_transport_ready` is `true`, and profiles are fresh, but `dispatch_posture` reads `explicitRequestOnly` — report the doctor's `dispatch_posture_warning` remediation verbatim (leads with an explicit in-session ask for sub-agents/delegation/parallel work — always available and always documented — and only then, if your Codex exposes an `ultra` reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5; check the `/model` picker), `model_reasoning_effort = "ultra"` in `~/.codex/config.toml` or per-session `codex -c model_reasoning_effort=ultra`). NEVER report this state as `ok` — features enabled alone is not dispatch-ready.
- `warning_only`: only `[notice].suppress_unstable_features_warning = true` differs; this is optional warning posture, not dispatch proof.
- `needs_update`: V2/subagent config is missing or too constrained for Kaola's intended behavior, `dispatch_posture` reads `none`, or `codex_v2_role_transport_ready` is not `true`. Preserve either typed refusal (`codex_v2_encrypted_transport_unsafe` or `codex_v2_role_transport_unsafe`) and show its repair verbatim.
- `blocked`: config is malformed, policy-managed, or conflicts with a user/admin constraint.

The supported role-aware V2 form is `multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true, ... }`, or the equivalent `[features.multi_agent_v2]` table. Codex 0.144.1 reserves `collaboration.spawn_agent` for its hidden-metadata schema: visible `agent_type`/model fields under that name fail the first request with HTTP 400, while the hidden default removes Kaola role selection. Explicit `non_code_mode_only = false` remains unsafe because it exposes collaboration through the nested Code Mode adapter. Warning suppression is independent: never treat `[notice].suppress_unstable_features_warning = true` as evidence that V2 is enabled. Do not silently edit `~/.codex/config.toml`; if a required setting is missing, show the minimal diff and apply it only when the user asked the agent to configure this machine or explicitly consents. After a transport change, require a fresh Codex session. Do not claim effort-safe dispatch from config text alone; a tiered fallback still needs a child-session effort proof — for Codex, that proof is the doctor's `dispatch_posture` field, not the feature flags alone.

Trust the hooks once with `/hooks` in Codex. If an older project-local `.codex/hooks.json`
exists from a prior version, remove it (or run `uninstall.sh`) to avoid double-firing.

### The adaptive path is the only path

Adaptive is installed unconditionally — there is no install-time opt-in and no
per-session switch. The `fast` and `full` six-phase paths are retired: their
commands, skills and transaction scripts are deleted, and the installer does not
parse path opt-in flags.

At runtime, a `KAOLA_PATH` (or `--workflow-path`) naming a non-adaptive path
returns a typed `path_not_installed` refusal — never a silent adaptive
substitution. A stale `installed_paths` field left by a pre-retirement install is
tolerated on read and never re-written.

6. Create only missing scaffold files:

```text
kaola-workflow/
  ROADMAP.md
  archive/
docs/
  README.md
  architecture.md
  api.md
  conventions.md
  decisions/
CHANGELOG.md
```

7. Do not create `kaola-workflow/{project}/workflow-state.md` during init. State belongs to an active workflow project.

## Create `AGENTS.md`

Check whether `AGENTS.md` exists in the project root. Detect conformance by
reading the second non-blank line: if it equals
`> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**`,
the file is conforming — no-op. If the file is missing, write the canonical
redirect block below. If the file exists but is non-conforming (second
non-blank line does not match), prepend the redirect block, add a `---`
divider, then append the original content with the migration note line.

Worked example of a migrated AGENTS.md (two `---` dividers total):

```text
# AGENTS.md

> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**
>
> `CLAUDE.md` in this repository root is the **single canonical source** for all
> non-negotiable rules, project conventions, workflow constraints, and agent
> behavior. AGENTS.md exists **only** to direct you there.
>
> **Required at session start, before any tool call, edit, or response:**
>
> 1. Read `CLAUDE.md` in full.
> 2. Treat its `## Non-Negotiable Rules` section as binding for every action you take in this repo.
> 3. If `CLAUDE.md` is missing, **stop and ask the user** — do not proceed on assumptions.
>
> Do not skip this step because the task looks small. Do not rely on prior
> session memory. Re-read on every new session.

---

*All other guidance — the workflow, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*

---
> Note: content below was the prior AGENTS.md before init unified the contract.
[original content here]
```

Canonical `AGENTS.md` redirect block to write:

```markdown
# AGENTS.md

> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**
>
> `CLAUDE.md` in this repository root is the **single canonical source** for all
> non-negotiable rules, project conventions, workflow constraints, and agent
> behavior. AGENTS.md exists **only** to direct you there.
>
> **Required at session start, before any tool call, edit, or response:**
>
> 1. Read `CLAUDE.md` in full.
> 2. Treat its `## Non-Negotiable Rules` section as binding for every action you take in this repo.
> 3. If `CLAUDE.md` is missing, **stop and ask the user** — do not proceed on assumptions.
>
> Do not skip this step because the task looks small. Do not rely on prior
> session memory. Re-read on every new session.

---

*All other guidance — the workflow, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*
```

## Initial Roadmap Body

```markdown
# Kaola-Workflow Roadmap

This file mirrors active unfinished work. Gitea issues are the source of truth when available.

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
| none | Initialize roadmap | open | none | Link Gitea issues or add active work |
```
