<!-- SLOT:in-frontmatter -->

<!-- SLOT:in-h1 -->

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Initializing a repository, rewriting an existing instructions file that already carries the user's
own content, and editing runtime configuration under `$HOME` are all in that class: propose the
change, show the minimal diff, and wait for the answer. Creating a missing scaffold file is not —
get on with it.
<!-- /PIN -->
<!-- REGION:command -->

Prepare the current project for repeated `/workflow-next` implementation cycles.

This command is a bootstrapper. It should preserve existing project instructions and docs, add only missing workflow guidance, and avoid replacing user-authored content.

## Inputs

Use `$ARGUMENTS` as optional project context.

---

## Step 1 — Scan Project State

Inspect the project root:
<!-- /REGION -->
<!-- REGION:skill -->

Bootstrap the current repo for repeated Kaola-Workflow for Codex cycles. Preserve existing project guidance and add only missing Codex-specific structure.

## Required Behavior

1. Read applicable `AGENTS.md` files first.
2. Inspect project state:
<!-- /REGION -->

```bash
pwd
<!-- REGION:command -->
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
<!-- /REGION -->
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
<!-- REGION:command -->
test -f package.json && node -e "const p=require('./package.json'); console.log('package scripts:', Object.keys(p.scripts||{}).join(', ')||'none')"
find . -maxdepth 2 \( -name 'Makefile' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' \) -print
```

<!-- SPLICE:in-cmd-001 -->

<!-- SPLICE:in-cmd-002 -->

```bash
<!-- SPLICE:in-cmd-003 -->
```

<!-- SPLICE:in-cmd-004 -->

---

## Step 2 — Synthesize `CLAUDE.md`

Create `CLAUDE.md` if missing. If it exists, preserve user-authored content and add only missing durable guidance. Do not paste full source files, roadmaps, changelogs, API docs, or long skill text into `CLAUDE.md`.

Target size: under 200 lines. Hard limit: if the result would exceed 240 lines, stop and summarize what should move to docs, `.claude/rules/`, skills, or `CLAUDE.local.md`.

Use this policy:

| Section | Required | Purpose |
|---------|----------|---------|
| Project Snapshot | yes | What this project is, stack, and main architecture in 2-5 bullets |
| Commands | yes | Install, test, lint/typecheck/build, dev server commands; use `unknown` when not detected |
| Non-Negotiable Rules | yes | Stable constraints agents must follow every session |
| Validation Policy | yes | Treat background hooks as advisory and avoid duplicate validation |
| Kaola-Workflow | yes | Orchestrator, roadmap, compliance, and archive rules in concise form |
| Project Conventions | optional | Only real detected or user-provided conventions |
| Known Gotchas | optional | Only repeated hazards that would waste time |
| Documentation Map | yes | Pointers to docs, not embedded docs |
| Maintenance | yes | Rules for keeping `CLAUDE.md` short |

Optional content belongs elsewhere unless it must be read in every session:
- Put path-specific rules in `.claude/rules/*.md`.
- Put private machine/user notes in `CLAUDE.local.md`.
- Put long procedures in skills or command files.
- Put API details, decisions, architecture, and changelog entries in `docs/` and `CHANGELOG.md`.
- Use plain path references for optional docs. Do not use `@path` imports unless the content must always enter context.

### Compact Template

Append equivalent missing sections only. Treat headings with the same meaning as equivalent; do not duplicate. Replace bracketed placeholders with detected values; do not leave placeholder text in `CLAUDE.md`. Omit optional sections when there is no real content.
<!-- /REGION -->
<!-- REGION:skill -->
```

3. Create or update `AGENTS.md` only when needed. Preserve user-authored content.
4. Create or update `CLAUDE.md` with canonical workflow guidance. If `CLAUDE.md` already exists, update the `## Non-Negotiable Rules` section in-place with the canonical 5 bullets.

<!-- SPLICE:in-sk-001 -->

   Kaola-Workflow agent profiles live in `.codex/agents/kaola-workflow/` and are wired by the managed block in `.codex/config.toml`.
<!-- /REGION -->

<!-- KW-CLAUDE-TEMPLATE-START -->
```markdown
# Project Instructions

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
- Goal-driven execution: Define verifiable success criteria before starting. Keep the tests in separate custody from the code they judge — whoever implements a behavior does not author its tests. Loop until criteria pass; don't declare done on weak signals.
- Verify facts, don't fabricate: do not guess API/library behavior, interfaces, or signatures — confirm them against documentation, source, or a run before relying on them. Do not claim to understand code, errors, or requirements you have not verified; name what you do not know and find out.
- Reuse before adding: before writing a new interface, search for an existing equivalent and extend it rather than duplicate functionality.
- Escalate irreversible changes: do not unilaterally make hard-to-reverse changes or alter a user-owned contract (public API, schema or data migration, dependency or build-tooling swap, deletion of working capability); state the decision and its evidence, then get confirmation before proceeding.

## First Principles

These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already settled.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when nothing else covers a situation, resolve it by walking these axioms in order and record a one-line derivation alongside the work. Recording it is useful and never required.

**Dispatch production; keep decisions:** the orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default and only the deciding stays inline; weigh the economics per case by judgment, with no justifier, evidence line, or approval attached.

**Parallel by default:** concurrency is the standing default for independent work, and work that genuinely feeds other work runs in order because it has to. Nothing inspects that choice — no proof, no evidence line, no cap: you can tell the difference, and the frontier is in front of you. Width stays sized to the true shape of the task rather than pushed as wide as it will go.

## Kaola-Workflow

- Start and resume all workflow work through the workflow router entrypoint your runtime installs.
- A run claims one issue — or one explicitly selected same-scope set — and records what it owns in `kaola-workflow/{project}/workflow-state.md`: which issue, which branch, which worktree.
- The run's coordination record is `kaola-workflow/{project}/mission-list.md`: an H1 carrying the goal, then one item per mission with `item`, `status` (`todo`/`in-flight`/`done`), `dispatched`, and `result`. The agent writes it; no script owns it.
- Three write moments, and they are the whole discipline: write the item at creation; write `dispatched` and flip to `in-flight` BEFORE the work goes out; write `result` and flip to `done` at close. Writing `dispatched` afterwards is the failure the file exists to prevent.
- An item is a mission, not a specification — one line of prose carrying what to achieve plus the facts already known, never a role, a file list, a dependency edge, a model, or a shape. Decide how to run it when you reach it.
- The frontier is not computed: it is the list minus done minus in-flight, visible by reading. How much of it to open, and whether to dispatch or work inline, is the agent's call and nothing inspects it.
- Delegate work to the vendored subagents by default; the main session owns orchestration, review, validation, integration, and final decisions. Subagents and worktrees are tools — offered, and declinable.
- Name roles by function and reasoning tier, never by a vendor model name — write `planner (reasoning tier)`, not `planner (<model>)`. Keep this section runtime-neutral so it reads correctly on every runtime that reads this repo.
- For read/research work, spawn `code-explorer` for codebase research and `knowledge-lookup` when external library/API behavior or open-web/expertise knowledge that cannot be confirmed locally is needed.
- Custody, not order, splits the two writing roles: `tdd-guide` authors the tests and writes no production code; `implementer` writes the production code and reads and runs the tests but never writes them.
- Route build/type/lint validation failures to `build-error-resolver`; route behavior, coverage, and test-defect failures back to `tdd-guide`, the role that owns the test artifact.
- Route documentation work to `doc-updater`, and require it to transcribe verified ground truth — real command output, real signatures, existing schema — or to say what it needs; never let it invent field names, keys, enum values, or example numbers.
- Use the vendored agent role names exactly as installed; prefer short names like `planner`. When spawning a Kaola subagent, pass the role's configured model on the spawn call — each agent ships its model in its installed profile.
- At workflow-router startup, fetch remote-tracking refs, classify local/upstream sync state, and ask before any risky synchronization.
- Use a persistent-objective prompt so work continues until its objective and completion audit are satisfied.
- That objective prompt must not use "next issue in line" or any phrasing that implies automatic cross-issue continuation. Each workflow run targets one issue; finishing it is the terminal event. The single-issue completion contract requires explicit re-direction for the next issue.
- Treat nonessential workflow bookkeeping as autonomous: generated project names, collision suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected automatically and recorded.
- For essential technical decisions, apply your own judgment, apply the selected answer, and say what the evidence was.
- Take irreversible and value-laden calls to the user and ask, in conversation, before acting: risky Git synchronization, destructive rewrites, deployment or credential actions, and issue or roadmap reorganization. Nothing collects that approval for you.
<!-- SPLICE:in-shared-001 -->
- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`; do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Roadmap/research sessions create or refine issues; workflow runs implement one selected item and refresh the mirror.
- After resume or compaction, read `workflow-state.md` and `mission-list.md` before continuing: the H1 is the goal, `done` items carry what is already known, `in-flight` items are the decision to make, `todo` items are what remains.
- Resuming an `in-flight` item means looking for the WORK, not the worker: if the output its `dispatched` line promised has landed, close it; otherwise re-dispatch, unless the dispatch is provably still alive.
- End each cycle by docking docs against code changes, resolving closure decisions, updating issues, refreshing the roadmap, archiving completed workflow folders, and then the final commit and push.
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

<!-- REGION:command -->
> **Codex hooks note:** Running `install-codex-agent-profiles.js --global` installs the
> agent profiles **globally** into `~/.codex` (one install, all repos) AND refreshes the
> global hooks. Trust hooks once via `/hooks`. If a project-local `.codex/hooks.json`
> already exists, remove it (or run `uninstall.sh`) to avoid double-firing.
> Audit Codex config before claiming role dispatch readiness: Codex >=0.145.0 is required
> (`kaola-workflow-codex-preflight.js` refuses `codex_version_unsupported` below that floor), and
> `kaola-workflow-codex-preflight.js --doctor --json` must show `features.multi_agent_v2.enabled`
> true. MultiAgentV2 is **opt-in and off by default** — only V1 `multi_agent` is on by default —
> so it has to be written into `config.toml` for Codex to expose the V2 task-name spawn tools at
> all. Three shapes are accepted: `[features.multi_agent_v2]` with `enabled = true`, the inline
> `multi_agent_v2 = { enabled = true, ... }` under `[features]`, and a bare
> `multi_agent_v2 = true`. A top-level `[agents] enabled = true` does **not** enable it — `[agents]`
> configures roles and limits (`agents.<name>.*`, `max_depth`, `max_threads`), and Codex 0.145.0
> loads such a config clean with the feature still off, so set the switch in one of the three shapes
> above instead. Put the concurrency budget at
> `features.multi_agent_v2.max_concurrent_threads_per_session` and do **not** also set
> `agents.max_threads` — it is a separate `[agents]` key, **not an alias**, and it does not raise
> the MultiAgentV2 cap; Codex 0.145.0 accepts the key rather than complaining, so a stray one
> leaves the cap where it was instead of erroring. Note that
> `multi_agent_v2` is not carried in the public Codex configuration reference, which documents
> `[features] multi_agent` for enabling subagents and `[agents]` only for role/limit settings
> (`max_threads`, `max_depth`). The V2 flag and its bounds are verified against upstream SOURCE at
> tag `rust-v0.145.0` — `codex-rs/core/src/config/mod.rs` defines
> `DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION = 4` and `effective_agent_max_threads`
> uses `saturating_sub(1)` — source-verified, never documentation-verified, and both may change in a
> future release. Kaola never
> writes this flag for you; if it is not explicitly true, preflight refuses
> `codex_multi_agent_v2_required` and its diff must be applied by hand with user authorization —
> never silently. Warning suppression under `[notice]` is not feature enablement. Enablement alone
> is NOT the same as dispatch-ready: read the doctor JSON's additive `dispatch_posture` field too
> — `proactive` (`model_reasoning_effort = "ultra"`) accepts a spawn with no per-session ask;
> `explicitRequestOnly` (effort below `ultra`, or unset) model-refuses spawns unless explicitly asked
> for sub-agents/delegation/parallel work — always available and always documented
> — or, only if your Codex exposes an `ultra` reasoning effort for your model/plan (undocumented as
> of Codex >=0.145.0; check the `/model` picker), the operator sets
> `model_reasoning_effort = "ultra"`. Report the doctor's `dispatch_posture_warning` remediation
> verbatim; do not claim readiness from the enabled flag alone. Never silently edit
> `~/.codex/config.toml`; show the minimal diff and apply it only with user authorization.

> **Claude dispatch posture note:** Audit dispatch posture for this session before claiming
> role-dispatch readiness: probe the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable
> first; if unset, fall back to the session settings env block. Report
> `claude_dispatch_posture: teams | classic` — `teams` when the flag resolves truthy, `classic`
> otherwise. This audit is report-only: never write or edit user settings/config to flip the
> flag. Remediation leads with the classic path — the synchronous dispatch flow is always
> available and requires no flag — and only then notes that agent teams is an experimental,
> flag-gated alternative for a session that has explicitly opted in.

Keep the working-principle bullets concise.

If an existing `CLAUDE.md` is bloated or duplicates the sections above, do not silently replace it. Add a short `## Maintenance Note` with the proposed consolidation and ask before destructive rewriting.

---

## Step 3 — Create `AGENTS.md`
<!-- /REGION -->
<!-- REGION:skill -->
5. Agent role profiles are a one-time GLOBAL install — `workflow-init` does NOT install them per repo.

Profiles install once into `~/.codex` and are available in every repo (parity with Claude global agents). `workflow-init` only scaffolds the project. If not yet installed (or after upgrade), run the one-time global install:

```bash
<!-- SPLICE:in-sk-002 -->
if [ ! -f "$plugin_root/scripts/install-codex-agent-profiles.js" ]; then
<!-- SPLICE:in-sk-003 -->
  plugin_root="$(dirname "$(dirname "$script_path")")"
fi
test -f "$plugin_root/scripts/install-codex-agent-profiles.js"
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global
```

Writes `~/.codex/agents/kaola-workflow/*.toml` + the managed block in `~/.codex/config.toml`, refreshes global hooks — one install, all repos. The preflight gate accepts the global scope. (To pin to one repo instead, pass the repo path positionally — `… "$PWD"` — optional override.)

Run an agent-guided Codex config audit before claiming role dispatch readiness:

```bash
codex features list | rg 'multi_agent_v2' || true
node "$plugin_root/scripts/kaola-workflow-codex-preflight.js" --doctor --project-root "$PWD" --json
```

Read the doctor JSON's `codex_version` field first — it gates everything else.
Codex >=0.145.0 stabilized MultiAgentV2, but it stays **opt-in and off by
default** — only V1 `multi_agent` is on by default — so
`features.multi_agent_v2.enabled = true` must be written for Codex to expose the
V2 task-name spawn tools at all; an unsupported version returns a typed
`codex_version_unsupported` refusal (repair: upgrade Codex) before any
profile/config check runs. Once the version floor is met, read the
per-scope `dispatch_posture` field alongside the existing checks — it is the
effort-gated Kaola dispatch posture, distinct from Codex's general default:
`none` (Kaola's explicit V2 attestation is absent-or-false), `explicitRequestOnly`
(tools exposed, but the runtime model-refuses a spawn unless explicitly
asked), or `proactive` (`model_reasoning_effort = "ultra"` — the
runtime accepts a spawn with no per-session ask). Classify the result:

- `ok`: `multi_agent_v2_enabled` reads `true` (`features.multi_agent_v2.enabled
  = true`), generated role profiles are fresh, agent limits are absent or
  sufficient, AND `dispatch_posture` reads `proactive`.
- `explicit_request_only`: `multi_agent_v2_enabled` reads `true` and profiles
  are fresh, but `dispatch_posture` reads `explicitRequestOnly` — report the
  doctor's `dispatch_posture_warning` remediation verbatim (leads with an
  explicit in-session ask for sub-agents/delegation/parallel work — always
  available and always documented — and only then, if your Codex exposes an
  `ultra` reasoning effort for your model/plan (undocumented as of Codex
  >=0.145.0; check the `/model` picker), `model_reasoning_effort = "ultra"` in
  `~/.codex/config.toml` or per-session `codex -c model_reasoning_effort=ultra`).
  NEVER report this state as `ok` — enablement alone is not dispatch-ready.
- `warning_only`: only `[notice].suppress_unstable_features_warning = true`
  differs; this is optional warning posture, not dispatch proof.
- `needs_update`: `features.multi_agent_v2.enabled` is missing or false, or
  `dispatch_posture` reads `none`. Preserve the typed
  `codex_multi_agent_v2_required` refusal and show its repair diff verbatim —
  Kaola does not write this flag for you.
- `blocked`: config is malformed, policy-managed, or conflicts with a
  user/admin constraint.

The switch is `features.multi_agent_v2.enabled`, accepted in three shapes: a
`[features.multi_agent_v2]` table, the inline `multi_agent_v2 = { enabled =
true, ... }` under `[features]`, and a bare `multi_agent_v2 = true`. A
top-level `[agents] enabled = true` does NOT enable it — `[agents]` configures
roles and limits, and Codex 0.145.0 loads such a config clean with the feature
still off, so set the switch in one of the three shapes above instead.
`features.multi_agent_v2.max_concurrent_threads_per_session` governs
sub-agent concurrency: the cap is inclusive of the root session, so sub-agent
width is the configured cap minus one. Do NOT also set `agents.max_threads` —
it is a separate `[agents]` key, not an alias, and it does not raise the
MultiAgentV2 cap; Codex 0.145.0 accepts the key rather than complaining, so a
stray one leaves the cap where it was instead of erroring. Warning suppression is
independent: never treat `[notice].suppress_unstable_features_warning = true`
as evidence that MultiAgentV2 is enabled. Kaola does not silently edit
`~/.codex/config.toml`'s `[features]` table on the user's behalf — satisfying
Kaola's explicit V2 attestation is a hand edit the user makes from the
`codex_multi_agent_v2_required` refusal's diff; Kaola also never writes or
overrides `agents.default_subagent_model` /
`agents.default_subagent_reasoning_effort` — Codex resolves the sub-agent's own
model/reasoning effort independently. After a config change, require a fresh
Codex session. Do not claim effort-safe dispatch from config text alone; a
tiered fallback still needs a child-session effort proof — for Codex, that
proof is the doctor's `dispatch_posture` field, not the feature flags alone.

Trust the hooks once with `/hooks` in Codex. If a project-local `.codex/hooks.json`
already exists, remove it (or run `uninstall.sh`) to avoid double-firing.

### How a run is coordinated

One file per run. A run claims its issue, then writes
`kaola-workflow/{project}/mission-list.md` — an H1 carrying the goal, then one item per mission
with `item`, `status`, `dispatched`, and `result`. There is nothing to select or configure, and no
script owns the file.

A stale workflow-path request from an old session or script is silently ignored; there is only one
way to run.

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
<!-- /REGION -->

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
> Note: the content below is the AGENTS.md contract.
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
<!-- REGION:command -->
```

---

## Step 4 — Create Missing Workflow Structure

Create only missing directories/files. Do not overwrite existing content.

Required structure:

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

Use these initial file bodies when a file is missing.

### `kaola-workflow/ROADMAP.md`
<!-- /REGION -->
<!-- REGION:skill -->
```

## Initial Roadmap Body
<!-- /REGION -->

```markdown
# Kaola-Workflow Roadmap

<!-- SPLICE:in-shared-002 -->

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
<!-- SPLICE:in-shared-003 -->
<!-- REGION:command -->

## Rules

<!-- SPLICE:in-cmd-005 -->
- After each `/workflow-next` cycle, refresh this file from issue state.
- Move completed workflow project folders to `kaola-workflow/archive/`.
<!-- SPLICE:in-cmd-006 -->
- Keep commit and push as the final Finalization step after docs, issues, roadmap,
  archive, and metadata are complete.
```

After creating or confirming `kaola-workflow/ROADMAP.md`, bootstrap the per-issue directory and regenerate:

```bash
mkdir -p kaola-workflow/.roadmap
<!-- SPLICE:in-cmd-007 -->
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" generate
```

<!-- SPLICE:in-cmd-008 -->

### `docs/README.md`

```markdown
# Documentation Index

- [Architecture](architecture.md)
- [API](api.md)
- [Conventions](conventions.md)
- [Decisions](decisions/)
- [Changelog](../CHANGELOG.md)
```

### `docs/architecture.md`

```markdown
# Architecture

Document system boundaries, major components, data flow, and deployment shape.
```

### `docs/api.md`

```markdown
# API

Document public APIs, endpoints, schemas, events, and integration contracts.
```

### `docs/conventions.md`

```markdown
# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.
```

### `CHANGELOG.md`

```markdown
# Changelog

## Unreleased

- Initialized Kaola-Workflow documentation structure.
```

## Active Folder Initialization

<!-- SPLICE:in-cmd-009 -->

```bash
<!-- SPLICE:in-cmd-010 -->
[ -f "$CLAIM_JS" ] && node "$CLAIM_JS" claim \
  --project "{project}" --issue {N}
```

<!-- SPLICE:in-cmd-011 -->

<!-- SPLICE:in-cmd-012 -->

---

## Step 5 — Git And Roadmap Summary

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l CLAUDE.md` and report whether it is under the 200-line target.
3. Summarize:
   - whether Git is initialized
<!-- SPLICE:in-cmd-013 -->
   - whether `CLAUDE.md` was created or updated
   - whether AGENTS.md was created, was already conforming, or was migrated
   - which required `CLAUDE.md` sections are present
   - which docs/roadmap files were created
<!-- SPLICE:in-cmd-014 -->
4. Do not commit unless the user explicitly asks.

End with the next useful command:

```text
/workflow-next
<!-- /REGION -->
```
