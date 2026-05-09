---
description: Initialize a project for Claude Workflow with CLAUDE.md guidance, roadmap tracking, docs structure, and Git/GitHub issue conventions.
argument-hint: (optional project context)
---

# Workflow Init

Prepare the current project for repeated `/claude-workflow` implementation cycles.

This command is a bootstrapper. It should preserve existing project instructions and docs, add only missing workflow guidance, and avoid replacing user-authored content.

## Inputs

Use `$ARGUMENTS` as optional project context.

Prefer the local Karpathy skills source when available:

1. `/Volumes/WorkspaceA/ylminiserver/workspace/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md`
2. `../andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md`

If neither exists, use the concise fallback in this command.

---

## Step 1 — Scan Project State

Inspect the project root:

```bash
pwd
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d claude-workflow && find claude-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
test -f package.json && node -e "const p=require('./package.json'); console.log('package scripts:', Object.keys(p.scripts||{}).join(', ')||'none')"
find . -maxdepth 2 \( -name 'Makefile' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' \) -print
```

If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that GitHub issue sync is pending until a GitHub remote exists.

If `gh` is available and a GitHub repo can be inferred from `origin`, inspect open issues:

```bash
gh issue list --limit 100
```

If there is no GitHub remote, or if `gh` is unavailable or unauthenticated, skip issue fetching immediately and note that GitHub roadmap sync is pending. Do not spend time retrying GitHub calls during init.

---

## Step 2 — Synthesize `CLAUDE.md`

Create `CLAUDE.md` if missing. If it exists, preserve user-authored content and add only missing durable guidance. Do not paste full source files, roadmaps, changelogs, API docs, or long skill text into `CLAUDE.md`.

Target size: under 120 lines. Hard limit: if the result would exceed 150 lines, stop and summarize what should move to docs, `.claude/rules/`, skills, or `CLAUDE.local.md`.

Use this policy:

| Section | Required | Purpose |
|---------|----------|---------|
| Project Snapshot | yes | What this project is, stack, and main architecture in 2-5 bullets |
| Commands | yes | Install, test, lint/typecheck/build, dev server commands; use `unknown` when not detected |
| Non-Negotiable Rules | yes | Stable constraints agents must follow every session |
| Claude Workflow | yes | Orchestrator, roadmap, compliance, and archive rules in concise form |
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
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Preserve user changes; never revert unrelated work without explicit request.
- Verify with the relevant command before claiming completion.

## Claude Workflow

- The main session is the orchestrator for `/claude-workflow`.
- Keep phase work scoped, resumable, and recorded under `claude-workflow/`.
- Delegate phase-specific work to ECC agents by default; the main session owns orchestration, review, validation, integration, and final decisions.
- Phase boundaries: Phase 1 discovers facts, Phase 2 chooses strategy, Phase 3 creates the executable blueprint.
- In Phase 1, spawn `code-explorer` for codebase research and `docs-lookup` when external/library/API documentation is needed.
- In Phase 4, spawn `tdd-guide` per task as the executor. `tdd-guide` is the ECC agent; `tdd-workflow` is the RED -> GREEN -> REFACTOR playbook it follows.
- Route build/type/lint validation failures to `build-error-resolver`; route behavior or coverage failures back to `tdd-guide`.
- Use the ECC agent names exactly as Claude Code lists them; prefer short names like `planner` when available, otherwise use the `everything-claude-code:` prefix.
- GitHub issues are the roadmap source of truth when available; `claude-workflow/ROADMAP.md` is the local active-work mirror.
- Roadmap/research sessions create or refine issues; `/claude-workflow` sessions implement one selected item and refresh the mirror.
- After resume or compaction, read the current phase file and compliance ledger before continuing.
- End each cycle by updating issues, refreshing the roadmap, archiving completed workflow folders, and clearing pending compliance rows.

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
- `docs/decisions/` — architecture decision records.
- `claude-workflow/ROADMAP.md` — active implementation roadmap.

## Maintenance

- Keep this file under 120 lines; move detail to docs or skills.
- Add rules only after repeated mistakes, review feedback, or stable project conventions.
- Do not use `@path` imports for optional reference material.
```

Keep the Karpathy-style principles concise. If the local Karpathy skill file is available, use it only to confirm the short working-principle bullets; do not paste the long source into `CLAUDE.md`.

If an existing `CLAUDE.md` is bloated or duplicates the sections above, do not silently replace it. Add a short `## Maintenance Note` with the proposed consolidation and ask before destructive rewriting.

---

## Step 3 — Create Missing Workflow Structure

Create only missing directories/files. Do not overwrite existing content.

Required structure:

```text
claude-workflow/
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

### `claude-workflow/ROADMAP.md`

```markdown
# Claude Workflow Roadmap

This file mirrors active unfinished work. GitHub issues are the source of truth when available.

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
| none | Initialize roadmap | open | none | Link GitHub issues or add active work |

## Rules

- A separate roadmap/research session owns discovering and adding future work to GitHub issues.
- `/claude-workflow` fetches GitHub issues, mirrors active implementation work here, and advances one item per cycle.
- After each `/claude-workflow` cycle, refresh this file from issue state.
- Move completed workflow project folders to `claude-workflow/archive/`.
- Close linked GitHub issues only after acceptance criteria pass.
```

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

- Initialized Claude Workflow documentation structure.
```

## Step 4 — Git And Roadmap Summary

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l CLAUDE.md` and report whether it is under the 120-line target.
3. Summarize:
   - whether Git is initialized
   - whether a GitHub remote exists
   - whether `CLAUDE.md` was created or updated
   - which required `CLAUDE.md` sections are present
   - which docs/roadmap files were created
   - whether GitHub issues were available for sync
4. Do not commit unless the user explicitly asks.

End with the next useful command:

```text
/claude-workflow
```
