---
description: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, roadmap tracking, docs structure, and Git/Gitea issue conventions.
argument-hint: (optional project context)
---

# Workflow Init

Prepare the current project for repeated `/workflow-next` implementation cycles.

This command is a bootstrapper. It should preserve existing project instructions and docs, add only missing workflow guidance, and avoid replacing user-authored content.

## Inputs

Use `$ARGUMENTS` as optional project context.

---

## Step 1 — Scan Project State

Inspect the project root:

```bash
pwd
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
test -f package.json && node -e "const p=require('./package.json'); console.log('package scripts:', Object.keys(p.scripts||{}).join(', ')||'none')"
find . -maxdepth 2 \( -name 'Makefile' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' \) -print
```

If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that Gitea issue sync is pending until a Gitea remote exists.

If `tea` is available and a Gitea repo can be inferred from `origin`, inspect open issues:

```bash
tea issues list --limit 100
```

If there is no Gitea remote, or if `tea` is unavailable or unauthenticated, skip issue fetching immediately and note that Gitea roadmap sync is pending. Do not spend time retrying Gitea calls during init.

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

## Kaola-Workflow

- Use `/workflow-next` as the workflow entrypoint and router.
- Keep phase work scoped, resumable, and recorded under `kaola-workflow/`.
- Maintain `workflow-state.md` for active work; it records current phase, step, pending gates, and next command.
- Delegate phase-specific work to the vendored Claude Code agents by default; the main session owns orchestration, review, validation, integration, and final decisions.
- Phase boundaries: Phase 1 discovers facts, Phase 2 chooses strategy, Phase 3 creates the executable blueprint.
- In Phase 1, spawn `code-explorer` for codebase research and `knowledge-lookup` when external library/API behavior or open-web/expertise knowledge that cannot be confirmed locally is needed.
- In Phase 4, spawn `tdd-guide` per task as the executor. `tdd-guide` is the executor agent; `tdd-workflow` is the RED -> GREEN -> REFACTOR playbook it follows.
- Route build/type/lint validation failures to `build-error-resolver`; route behavior or coverage failures back to `tdd-guide`.
- Use the vendored agent role names exactly as installed; prefer short names like `planner`. When spawning a Kaola subagent, pass the role's configured model on the spawn call — each agent ships its model in its installed profile.
- At `/workflow-next` startup, fetch remote-tracking refs, classify local/upstream sync state, and ask before any risky synchronization.
- Use `/goal` or equivalent prompt-based Stop-hook wording so each phase continues until its objective and completion audit are satisfied.
- The `/goal` template must not use "next issue in line" or any phrasing that implies automatic cross-issue continuation. Each `/workflow-next` run targets one issue; finishing it is the terminal event. The single-issue completion contract requires explicit re-direction for the next issue.
- Treat nonessential workflow bookkeeping as autonomous: generated project names, collision suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected automatically and recorded.
- For essential technical decisions, apply your own judgment, apply the selected answer, and record the evidence under `.cache/` or the phase artifact.
- Prompt the user only for true external authorization or materially user-owned choices, including risky Git synchronization, destructive rewrites, deployment/credential actions, and issue or roadmap reorganization.
- Gitea issues are the roadmap source of truth when available; `kaola-workflow/ROADMAP.md` is the local active-work mirror.
- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`; do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.
- Roadmap/research sessions create or refine issues; `/workflow-next` sessions implement one selected item and refresh the mirror.
- After resume or compaction, read `workflow-state.md`, the current phase file, and the compliance ledger before continuing.
- State Bootstrap And Repair: if `/workflow-next` safely reconstructs one next command from phase artifacts or `fast-summary.md`, run the state repair helper and repair `workflow-state.md` before routing.
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

Keep the working-principle bullets concise.

If an existing `CLAUDE.md` is bloated or duplicates the sections above, do not silently replace it. Add a short `## Maintenance Note` with the proposed consolidation and ask before destructive rewriting.

---

## Step 3 — Create `AGENTS.md`

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

*All other guidance — workflow phases, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*

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

*All other guidance — workflow phases, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*
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

```markdown
# Kaola-Workflow Roadmap

This file mirrors active unfinished work. Gitea issues are the source of truth when available.

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
| none | Initialize roadmap | open | none | Link Gitea issues or add active work |

## Rules

- A separate roadmap/research session owns discovering and adding future work to Gitea issues.
- `/workflow-next` fetches Gitea issues, mirrors active implementation work here, and advances one item per cycle.
- After each `/workflow-next` cycle, refresh this file from issue state.
- Move completed workflow project folders to `kaola-workflow/archive/`.
- Close linked Gitea issues only after acceptance criteria pass.
- Keep commit and push as the final Finalization step after docs, issues, roadmap,
  archive, and metadata are complete.
```

After creating or confirming `kaola-workflow/ROADMAP.md`, bootstrap the per-issue directory and regenerate:

```bash
mkdir -p kaola-workflow/.roadmap
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-gitea-workflow-roadmap.js)"
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" generate
```

If `kaola-gitea-workflow-roadmap.js` is unavailable (not yet installed), skip this step.

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

If a Gitea issue is known, create the active workflow folder before starting:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"
[ -f "$CLAIM_JS" ] && node "$CLAIM_JS" claim \
  --project "{project}" --issue {N}
```

Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the Gitea issue number. If the issue number is unknown, omit `--issue`.

If `kaola-gitea-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local phase artifacts.

---

## Step 5 — Git And Roadmap Summary

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l CLAUDE.md` and report whether it is under the 200-line target.
3. Summarize:
   - whether Git is initialized
   - whether a Gitea remote exists
   - whether `CLAUDE.md` was created or updated
   - whether AGENTS.md was created, was already conforming, or was migrated
   - which required `CLAUDE.md` sections are present
   - which docs/roadmap files were created
   - whether Gitea issues were available for sync
4. Do not commit unless the user explicitly asks.

End with the next useful command:

```text
/workflow-next
```
