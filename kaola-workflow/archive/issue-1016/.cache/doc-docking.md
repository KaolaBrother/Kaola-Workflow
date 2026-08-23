# doc-docking — issue #1016

**Date:** 2026-08-23  
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`  
**Codemaps:** skipped (no `scripts/codemaps/`, no `docs/CODEMAPS/`).

## Changed files reviewed (production)

| File | Facts transcribed |
|---|---|
| `scripts/kaola-workflow-ensure-cursor-catalog.js` | `ensureCursorCatalog({ cwd, cursorHome })`; dest `<cwd>/.cursor/agents`; source `$CURSOR_HOME/agents` (`CURSOR_HOME` else `$HOME/.cursor`); statuses `already-present` \| `copied` \| `missing-source`; CLI prints token, exit 0 on first two; 14 `CANON_AGENT_NAMES`; isolated; no git-toplevel |
| `scripts/sync-cursor-edition.js` | `CURSOR_MODEL_DISPATCH_BLOCK` names the JS and the three routes; `renderEnsureWrapper` prints `{}` via `kaola-workflow-ensure-cursor-catalog.sh` |
| `install-cursor.sh` | extra-script copy after manifest loop; uninstall `rm -f` that basename; not in `kaola-workflow-install-manifest.js` |
| `templates/routing/init.skeleton.md` | **untouched**; no ensure script, no `generalPurpose` |

## Documents checked

| Surface | Before this turn | After |
|---|---|---|
| `docs/cursor-edition.md` | dest/source, `{}` hook, Cloud Agents, cold start, no `Task(model=)` | plus status tokens, extra-script, overlay-not-dispatch |
| `README.md` | already matched high-level facts | no edit |
| `docs/README.md` | already matched index line | no edit |
| `CHANGELOG.md` `[Unreleased]` | #1016 present, tokens unnamed | named JS/SH, three tokens, extra-script, overlay frozen |
| `docs/api.md` | no ensure CLI | Installation table row added |
| `docs/architecture.md` | pointers still valid | no edit |
| `.env.example` | no `CURSOR_HOME` (pre-existing omission) | no edit |

## Gaps found and fixed

1. **API docs omitted the new CLI.** `docs/api.md` Installation table now has `kaola-workflow-ensure-cursor-catalog.js` from the file itself: no flags, exports `ensureCursorCatalog({ cwd, cursorHome })` / `listCanonAgents` / `CANON_AGENT_NAMES`, source/dest, three status tokens and exit codes, isolated, extra-script not in the manifest.
2. **Status tokens and extra-script were missing from edition prose.** `docs/cursor-edition.md` now honors `already-present` \| `copied` \| `missing-source`, dest `<cwd>/.cursor/agents`, and states the installer extra is not in `kaola-workflow-install-manifest.js`. Overlay called out as not a Cursor catalog dispatch surface.
3. **CHANGELOG #1016 bullet under-specified.** `[Unreleased]` now names the script, tokens, wrapper `{}`, extra-script, and frozen overlay. `#1013` / `[9.14.0]` not restamped.

## No-impact reasons

- **`docs/architecture.md`:** Cursor install path still `install-cursor.sh` → `docs/cursor-edition.md` § Installer. Hooks cell still points at § Hooks (`sessionStart` / `preCompact` cannot inject); catalog-ensure is documented there, not a new runtime-table cell. Dispatch carrier and model/tier pointers unchanged.
- **`.env.example`:** `CURSOR_HOME` is not a new `KAOLA_*` variable; install-cursor and the script resolver already used it. No new reader class that the example file authors.
- **`README.md` / `docs/README.md`:** already stated workspace dest, global source of truth, `sessionStart` `{}`, next runs ensure, cold start, Cloud Agents may not fire `sessionStart`, no `Task(model=)` workaround. Token-level CLI belongs in API + edition.
- **Codemaps:** tooling absent.
- **Generated command/skill surfaces and tests:** not edited. Overlay frozen.

## Verification (CLI, not invented)

```
node scripts/kaola-workflow-ensure-cursor-catalog.js --help
→ stdout already-present, exit 0  (no help text; no flags)

ensureCursorCatalog({ cwd: absent, cursorHome: absent })
→ { status: 'missing-source' }
```

`CURSOR_MODEL_DISPATCH_BLOCK` names `kaola-workflow-ensure-cursor-catalog.js` and the three status routes. Wrapper `printf '{}\n'`.

## Verdict

**DOCKED**
