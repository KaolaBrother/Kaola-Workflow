# implement — issue #1014

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`  
Branch: `workflow/issue-1014`

**task:** Make Layer 1–2 production surfaces green against the already-RED pins: next `REGION:command` Agent Model Dispatch, init overlay rewrite, strengthened shared Cursor dispatch block + catalog preflight on init, `copyListCanonAgents`, `--global` git-toplevel dual-write, docs/README/CHANGELOG.

**verification tier:** `tests-green`

## Dual-write

`install-cursor.sh --global` still copies agents+commands un-nested into `${CURSOR_HOME}/{agents,commands}` (no nested `.cursor/` under `CURSOR_HOME`). After that copy, if `git rev-parse --show-toplevel` from the **installer process cwd** returns a path, and that path is not the same as `CURSOR_HOME` / `LAYOUT_DEST`, it also `copy_agents` / `copy_commands` into `$(git rev-parse --show-toplevel)/.cursor/{agents,commands}` and prints that Task types are workspace-scoped. A `--global` run from a directory with no git toplevel does not invent a project `.cursor/` tree. `install-all.sh` `--global` default is unchanged.

## Files changed (this implementer)

Production / generated / docs (not tests):

- `templates/routing/next.skeleton.md` — `REGION:command` `## Agent Model Dispatch` after Consent, before Step 1
- `templates/routing/init.skeleton.md` — KW-CLAUDE-TEMPLATE overlay bullet (plan sentence)
- `commands/workflow-next.md` + gitlab/gitea twins — generated heading + `You MUST pass \`model=` (no `model="{`)
- `commands/workflow-init.md` + gitlab/gitea twins + three `kaola-workflow-init` SKILL.md — generated overlay
- `scripts/sync-cursor-edition.js` — `CURSOR_MODEL_DISPATCH_BLOCK`, `copyListCanonAgents`, init inject of the same block, export
- `install-cursor.sh` — dual-write + header DEPLOY LAYOUT note
- `docs/cursor-edition.md`, `README.md`, `CHANGELOG.md` `[Unreleased]`

Test files were already RED in this worktree (`scripts/test-cursor-edition.js`, `scripts/validate-workflow-contracts.js`, gitlab/gitea contract validators). This role did not edit them.

Generated gitignored trees refreshed as a side effect of `generate-routing-surfaces.js --write` (`.cursor*`, `.grok*`, `.opencode*`, `.kimi*`). Not committed.

Codex `kaola-workflow-next` skills were not given the command heading (`REGION:command` stripped). Grok effort pins were not changed.

## Verification commands (after)

From the worktree:

```
node scripts/generate-routing-surfaces.js --check          # exit 0
node scripts/validate-workflow-contracts.js                # exit 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  # exit 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js    # exit 0
node scripts/test-cursor-edition.js                        # exit 0 (584 assertions)
```

## before

tdd-red: cursor-edition 22 FAIL / 560 passed; github validator threw on missing `## Agent Model Dispatch` on `commands/workflow-next.md`; gitlab/gitea twins same first throw.

## after

All five commands above exit 0. Last line of cursor suite: `cursor-edition test passed (584 assertions).`
