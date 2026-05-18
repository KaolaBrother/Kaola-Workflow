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
4. Do not create or edit CLAUDE.md.
5. Install or refresh the managed Codex agent role profiles:

```bash
plugin_root="plugins/kaola-workflow"
if [ ! -f "$plugin_root/scripts/install-codex-agent-profiles.js" ]; then
  script_path="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)"
  plugin_root="$(dirname "$(dirname "$script_path")")"
fi
test -f "$plugin_root/scripts/install-codex-agent-profiles.js"
node "$plugin_root/scripts/install-codex-agent-profiles.js" "$PWD"
```

This creates or refreshes `.codex/agents/kaola-workflow/*.toml` and a managed
`# BEGIN kaola-workflow agents` block in `.codex/config.toml`. Preserve all
unrelated `.codex/config.toml` content.

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

## `AGENTS.md` Addendum

Add a concise `## Kaola-Workflow` section if none exists:

- Use `kaola-workflow-next` as the router for active workflow projects.
- Store active workflow artifacts under `kaola-workflow/{project}/`.
- Keep `workflow-state.md` current during active work.
- Use GitHub issues as source of truth when available; keep `kaola-workflow/ROADMAP.md` as the local active-work mirror.
- Treat `kaola-workflow/.roadmap/issue-*.md` as the durable local roadmap source; `kaola-workflow/ROADMAP.md` is generated from it and should not be hand-edited.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.
- Preserve user changes and avoid destructive Git operations without explicit approval.
- Verify relevant tests before claiming completion.
- Kaola-Workflow agent profiles live in `.codex/agents/kaola-workflow/` and are
  wired by the managed block in `.codex/config.toml`.
- Active folder lifecycle: `kaola-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-pr, and finalize/archive. No legacy coordination layer is used.
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/` when `KAOLA_WORKTREE_NATIVE=1`; see README for the full contract.
- Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`) when the repo uses something other than P0–P3 naming.

## Initial Roadmap Body

```markdown
# Kaola-Workflow Roadmap

This file mirrors active unfinished work. GitHub issues are the source of truth when available.

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
| none | Initialize roadmap | open | none | Link GitHub issues or add active work |
```
