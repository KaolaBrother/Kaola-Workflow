# doc-updater — issue #1014

**Worktree:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`  
**HEAD:** `019a4062`  
**Date:** 2026-08-22  
**Codemaps:** skipped — neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists; did not invent that tree.

**Another commit needed:** no.

## Commands run

- Glob for `scripts/codemaps/**` and `docs/CODEMAPS/**` (0 files).
- Grep of worktree for `--global`, dual-write, `CURSOR_MODEL_DISPATCH`, `copyListCanonAgents`, `Agent Model Dispatch`.
- Read: `install-cursor.sh` (header, `usage()`, `copy_agents`/`copy_commands`, global dual-write at 447–457), `scripts/sync-cursor-edition.js` (`copyListCanonAgents`, `CURSOR_MODEL_DISPATCH_BLOCK`, exports), `docs/cursor-edition.md`, `docs/README.md`, `CHANGELOG.md` `[Unreleased]`, `README.md` Cursor sections, `docs/architecture.md` runtime table, `docs/api.md` Installation and edition sync, generated `.cursor/commands/workflow-next.md` substituted block.
- Shell (cwd = worktree):

```
ls -1 agents/*.md | wc -l
#       14
ls -1 agents/*.md | xargs -n1 basename | sed 's/\.md$//' | sort
# adversarial-verifier
# build-error-resolver
# code-architect
# code-explorer
# code-reviewer
# doc-updater
# implementer
# investigator
# knowledge-lookup
# metric-optimizer
# planner
# security-reviewer
# synthesizer
# tdd-guide

./install-cursor.sh --help
# Usage: ./install-cursor.sh [--target DIR] [--forge=github|gitlab|gitea] [--global]
#                          [--regenerate] [--uninstall] [--no-scripts] [--yes]
#   --target DIR     deploy agents+commands into DIR/.cursor (default: current directory)
#   --forge F        github (default), gitlab, or gitea — which forge's workflow prose
#                    and support scripts to deploy
#   --global         deploy agents+commands into ${CURSOR_HOME:-~/.cursor} (all projects)
#   --regenerate     refresh the in-repo .cursor/ tree from canonical, then exit
#   --uninstall      remove the kaola-deployed cursor edition from the resolved scope
#                    (honors --target/--global), then exit
#   --no-scripts     skip support scripts, hook scripts, and the hooks JSON copy
#   --yes            non-interactive (skip the confirmation prompt)
# (SUPPORT SCRIPTS + HOOKS / UNINSTALL paragraphs omitted here; match install-cursor.sh usage() 71–82)

node -e 'const m=require("./scripts/sync-cursor-edition.js"); console.log(Object.keys(m).sort().join("\n"))'
# includes: copyListCanonAgents, CURSOR_MODEL_DISPATCH_BLOCK, CURSOR_MODEL_DISPATCH_GUIDANCE,
# MODEL_DISPATCH_HEADING, listCanonAgents, …
```

## Ground truth used (not invented)

**Dual-write (`install-cursor.sh` 22–28, 434–457):** GLOBAL lands under `${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}` with no nested `.cursor/` under `CURSOR_HOME`. When cwd is inside a git work tree, if `$(git rev-parse --show-toplevel)/.cursor` is not the same as `LAYOUT_DEST` and toplevel is not `DEST_ROOT`, it also runs `copy_agents` + `copy_commands` into that project `.cursor/` (agents+commands only; hooks stay on `LAYOUT_DEST`). Empty toplevel (`git` fail) does not invent a project tree.

**`copyListCanonAgents(srcDir, destDir)` (`sync-cursor-edition.js` 99–107):** `mkdirSync` dest; `listCanonAgents()` names (canon `agents/*.md` stems); copy `<name>.md` only if source exists; skip missing; not a glob of dest `*.md`.

**`CURSOR_MODEL_DISPATCH_BLOCK` heading in generated surfaces:** `## Generated agent tier pins` (canonical heading `## Agent Model Dispatch` is substituted; verified in `.cursor/commands/workflow-next.md` lines 28–53). Block facts: omit per-call `model` including `inherit`; `Task` with `subagent_type: "<role>"` only; do not substitute `generalPurpose`; catalog probe `.cursor/agents/implementer.md`; copy only canonical Kaola role names from git toplevel `.cursor/agents/` then `${CURSOR_HOME:-$HOME/.cursor}/agents/`; else print `./install-cursor.sh --target "$PWD"`; mid-session copy → cold start new chat; 14 agent files; `Invalid enum value` … `received '<role>'` → inline + tool-unavailable, no `generalPurpose` / `inherit` retry.

**Agent count:** 14 files under worktree `agents/*.md` (list above).

## Documents checked

| Surface | Verdict |
|---|---|
| `README.md` | Already matches. Cursor install blurb (~254) and `### cursor` (~401–410) state workspace `.cursor/agents` (not `~/.cursor/agents`), `--global` / `install-all.sh` not dispatch-capable unless dual-write from a git work tree, worktree-as-cwd / 14 files / new-chat after materialize, Grok 4.6 pins + omit `Task` `model`. Example comment: `./install-cursor.sh --global --yes   # ${CURSOR_HOME:-~/.cursor} plus project .cursor/ when cwd is a git tree`. |
| `docs/cursor-edition.md` | Already matches. § Tiered frontmatter pins (72–80) and § Installer GLOBAL bullets (150–156) transcribe dual-write, skip-when-no-git, agents+commands only. Bash example `# agents+commands → ${CURSOR_HOME:-~/.cursor}` is shorter than README’s comment; GLOBAL prose immediately below carries the dual-write. Not a contradiction; no churn. |
| `docs/README.md` | Already matches (cursor Edition index line: workspace Task types; `--global` dual-write). |
| `CHANGELOG.md` `[Unreleased]` | Already matches #1014 Changed entry (workspace catalog, dual-write, omit `model`/`inherit`, forbid `generalPurpose`, fail closed, new chat). |
| `docs/api.md` | No impact. Installation table documents `sync-cursor-edition.js` (`--refresh-present`, `--print-tree-root`) and does **not** document `install-cursor.sh` (also no `install-opencode.sh` / `install-kimi.sh` / `install-grok.sh` / `install-all.sh`). Public envelope of those sync flags is unchanged by #1014. Per brief: do not add the installer here. |
| `docs/architecture.md` | No impact. Cursor **install path** still `install-cursor.sh`; `docs/cursor-edition.md` § Installer — pointer still resolves; dual-write lives in that section, not a new architecture cell. **model & tier** still `docs/cursor-edition.md` § Tiered frontmatter pins and runtime limits. |
| `docs/conventions.md`, ADRs, other edition docs | Skipped — no public contract / structure change that those surfaces author. |
| Generated `commands/` / `plugins/*/commands/` / skills | Checked as evidence of substitution; **not edited** (do not restamp; surfaces generate from skeletons). |
| `install-cursor.sh` `usage()` `--help` | Not a markdown doc. `--global` help line does not mention dual-write; file header comments 22–28 do. User-facing prose (README, cursor-edition, CHANGELOG) already states dual-write. Left the installer unedited (production script; HEAD already owns it). |

## Edits made

None.

## Skips with reason

- Codemap generation: tooling absent.
- `docs/api.md`: installer not in that catalog.
- `docs/architecture.md`: pointer still correct.
- Aligning `docs/cursor-edition.md` `--global` bash comment with README: would be comment-only churn; GLOBAL bullets already complete.
- `install-cursor.sh` `--help`: out of doc-updater write set; documented surfaces already carry the fact.
- Tests / agent frontmatter: forbidden by brief.
