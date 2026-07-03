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

## Kaola-Workflow

- Use `/workflow-next` as the workflow entrypoint and router.
- Keep node work scoped, resumable, and recorded under `kaola-workflow/`.
- Maintain `workflow-state.md` for active work; it records the frozen plan reference, the running set, pending gates, and the next command.
- The workflow runs an adaptive, task-shaped DAG of role nodes: the `planner` authors and freezes `workflow-plan.md`, then the executor runs it node-by-node via the running-set scheduler.
- Delegate node work to the vendored Claude Code agents by default; the main session owns orchestration, review, validation, integration, and final decisions.
- Name nodes by function: read/research → `code-explorer`/`knowledge-lookup`; strategy/blueprint → `planner`/`code-architect`; execution → `tdd-guide` (test-first) or `implementer` (refactors, scaffolding, or config with no natural failing test); gates → `code-reviewer`/`adversarial-verifier`; docs → `doc-updater`.
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
- The adaptive DAG is the default workflow; `fast` and `full` are install-time opt-ins (`--with-fast` / `--with-full`) that run only on an explicit keyword.
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

- `ok`: `multi_agent` and `multi_agent_v2` are enabled, generated role profiles are fresh, agent limits are absent or sufficient, AND `dispatch_posture` reads `proactive`.
- `explicit_request_only`: features are enabled and profiles are fresh, but `dispatch_posture` reads `explicitRequestOnly` — report the doctor's `dispatch_posture_warning` remediation verbatim (`model_reasoning_effort = "ultra"` in `~/.codex/config.toml`, per-session `codex -c model_reasoning_effort=ultra`, or an explicit in-session ask). NEVER report this state as `ok` — features enabled alone is not dispatch-ready.
- `warning_only`: only `[notice].suppress_unstable_features_warning = true` differs; this is optional warning posture, not dispatch proof.
- `needs_update`: V2/subagent config is missing or too constrained for Kaola's intended behavior, or `dispatch_posture` reads `none`.
- `blocked`: config is malformed, policy-managed, or conflicts with a user/admin constraint.

Supported V2 config forms are `multi_agent_v2 = true`, `multi_agent_v2 = { enabled = true, ... }`, and `[features.multi_agent_v2]` with `enabled = true`. Warning suppression is independent: never treat `[notice].suppress_unstable_features_warning = true` as evidence that V2 is enabled. Do not silently edit `~/.codex/config.toml`; if a required setting is missing, show the minimal diff and apply it only when the user asked the agent to configure this machine or explicitly consents. Do not claim effort-safe dispatch from config text alone; a tiered fallback still needs a child-session effort proof — for Codex, that proof is the doctor's `dispatch_posture` field, not the feature flags alone.

Trust the hooks once with `/hooks` in Codex. If an older project-local `.codex/hooks.json`
exists from a prior version, remove it (or run `uninstall.sh`) to avoid double-firing.

### Install-time path opt-ins (`--with-fast` / `--with-full`)

The adaptive path is the unconditional default and is **always** installed; there
is no per-session switch. The fast and full six-phase paths are install-time
opt-ins, passed to the same `install-codex-agent-profiles.js` step above:

```bash
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global --with-fast   # also install the fast path
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global --with-full   # also install the full six-phase path
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global --with-fast --with-full  # both opt-ins
```

The opt-in is recorded in the shared `~/.config/kaola-workflow/config.json`
`installed_paths` field via a UNION read-modify-write: a re-install **never
removes** a previously-installed path (`--with-fast` once, then a bare re-install,
preserves `fast`). Adaptive is implicit-always and never appears in
`installed_paths`; only `fast`/`full` can. Uninstall then reinstall is the reset to
adaptive-only. `--enable-adaptive` is retired and accepted-but-ignored.

At runtime, a `KAOLA_PATH` (or `--workflow-path`) naming a path that is not
installed returns a typed `path_not_installed` refusal — never a silent adaptive
substitution.

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
