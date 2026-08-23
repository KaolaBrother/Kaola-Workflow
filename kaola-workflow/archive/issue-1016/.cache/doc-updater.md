# doc-updater — issue #1016

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`  
**Date:** 2026-08-23  
**Codemaps:** skipped — neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists; did not invent that tree.

**Another commit needed:** no (docs-only edits in the worktree).

## Commands run

- Glob `scripts/codemaps/**` and `docs/CODEMAPS/**` (0 files).
- Grep: `ensureCursorCatalog`, `CURSOR_MODEL_DISPATCH_BLOCK`, `ensure-cursor-catalog`, `already-present`, `CURSOR_HOME` in docs/api.md, `.env.example`, `init.skeleton.md`.
- Read: `scripts/kaola-workflow-ensure-cursor-catalog.js` (full), `scripts/sync-cursor-edition.js` `CURSOR_MODEL_DISPATCH_BLOCK` (179–216) and `renderEnsureWrapper` (460–489), `install-cursor.sh` extra-script deploy (255–261) and uninstall `rm -f` (401), `docs/cursor-edition.md`, `docs/README.md` cursor index line, `README.md` Cursor paragraphs (~254, ~401–410), `CHANGELOG.md` `[Unreleased]`, `docs/api.md` Installation table, `docs/architecture.md` runtime table (~335–339), `.env.example`.
- Shell (cwd = worktree):

```
node scripts/kaola-workflow-ensure-cursor-catalog.js --help
# stdout: already-present
# EXIT:0
# (no usage/help text; unknown argv is ignored; CLI has no flags)

node -e 'const m=require("./scripts/kaola-workflow-ensure-cursor-catalog.js"); …'
# exports: ensureCursorCatalog,listCanonAgents,CANON_AGENT_NAMES
# CANON_AGENT_NAMES: adversarial-verifier, build-error-resolver, code-architect,
#   code-explorer, code-reviewer, doc-updater, implementer, investigator,
#   knowledge-lookup, metric-optimizer, planner, security-reviewer, synthesizer, tdd-guide
# ensureCursorCatalog({cwd: missing, cursorHome: missing}) → {"status":"missing-source"}

grep git|toplevel in scripts/kaola-workflow-ensure-cursor-catalog.js → NO_GIT_IN_ENSURE
grep ensure-cursor-catalog|CURSOR_MODEL_DISPATCH in templates/routing/init.skeleton.md → none
grep CURSOR_HOME in .env.example → none
```

## Ground truth used (not invented)

**`ensureCursorCatalog({ cwd, cursorHome })`** (`scripts/kaola-workflow-ensure-cursor-catalog.js` 39–71):
- `cwd` defaults `process.cwd()`; `cursorHome` defaults `process.env.CURSOR_HOME` else `path.join(HOME, '.cursor')`.
- Source `path.join(cursorHome, 'agents')`; dest `path.join(cwd, '.cursor', 'agents')`.
- Sentinel: source `implementer.md` missing (or empty name list) → `{ status: 'missing-source' }`.
- All 14 dest files exist and `Buffer.equals` vs source → `{ status: 'already-present' }`.
- Else `mkdirSync` dest, `copyFileSync` each existing source `<name>.md` → `{ status: 'copied' }`.
- Isolated: no `require` of `sync-cursor-edition.js`; no git / toplevel lookup.

**CLI `main()`** (74–91): writes `result.status + '\n'`; exit 0 iff token is `already-present` or `copied`; else exit 1. No `--help`.

**`CURSOR_MODEL_DISPATCH_BLOCK`** (`sync-cursor-edition.js` 179–216): names `kaola-workflow-ensure-cursor-catalog.js`; source `${CURSOR_HOME:-$HOME/.cursor}/agents`; dest `<cwd>/.cursor/agents`; honor `already-present` | `copied` | `missing-source`; omit per-call model including `inherit`; `Task` with `subagent_type: "<role>"` only; no `generalPurpose` impersonation; `copied` → stop named dispatch, cold start, new chat, re-run `/workflow-next`; `missing-source` → print `./install-cursor.sh --target "$PWD"`; Invalid-enum → inline, no `generalPurpose`/`inherit` retry.

**Ensure wrapper** (`renderEnsureWrapper`): generated `kaola-workflow-ensure-cursor-catalog.sh`; runs JS with stdout discarded; `printf '{}\n'`.

**Installer extra:** `install-cursor.sh` copies `kaola-workflow-ensure-cursor-catalog.js` after the manifest loop; `--uninstall` `rm -f` that basename. Not in `kaola-workflow-install-manifest.js` `SUPPORT_SCRIPTS`.

**Overlay freeze:** `templates/routing/init.skeleton.md` contains neither `kaola-workflow-ensure-cursor-catalog` nor `generalPurpose`. Not edited.

## Documents checked

| Surface | Verdict |
|---|---|
| `docs/cursor-edition.md` | Implementer already had dest/source, `{}` wrapper, Cloud Agents, cold start, no `Task(model=)` workaround. **Gap:** status tokens, extra-script-not-in-manifest, overlay-not-a-dispatch-surface. **Fixed** this turn. |
| `README.md` | Already matches (workspace catalog from `$CURSOR_HOME/agents`, 14 byte-identical, `sessionStart` `{}`, next runs ensure, dual-write caveat, worktree-as-cwd, new chat, Cloud Agents may not fire `sessionStart`, omit `Task` `model`). Status-token detail lives in edition + API, not restated here. **No further edit.** |
| `docs/README.md` | Cursor index line already matches catalog source, dual-write, `{}` hook, Cloud Agents. **No further edit.** |
| `CHANGELOG.md` `[Unreleased]` | Implementer had #1016 Changed bullet. **Updated** this turn to name the JS/SH, three tokens, dest/source expansion, extra-script, overlay unchanged. Did **not** restamp #1013 / `[9.14.0]`. |
| `docs/api.md` | **Gap:** new CLI missing from Installation table. **Fixed** this turn (row transcribed from the file: no flags, exports, tokens, exit codes, isolation, extra-script). Module Exports GitHub/GitLab/Gitea sections: no-impact (script is Cursor-only, not a forge claim export). |
| `docs/architecture.md` | **No-impact.** Cursor **install path** still `install-cursor.sh` + `docs/cursor-edition.md` § Installer. **hooks** still `docs/cursor-edition.md` § Hooks (`sessionStart` injection / `preCompact` cannot inject) — catalog-ensure is additional prose in that same section, not a new architecture cell. **dispatch carrier** / **model & tier** pointers still resolve. |
| `.env.example` | **No-impact.** `CURSOR_HOME` is an existing Cursor-home default (`install-cursor.sh`, resolver, now also ensure). Not a new `KAOLA_*` knob; was already omitted historically. Did not add it. |
| `docs/conventions.md`, ADRs | Skipped — no public contract they author. |
| Generated `.cursor/**`, `commands/`, skills | Not edited (generated; overlay freeze). |
| Tests | Not edited. |

## Edits made this turn

1. `docs/cursor-edition.md` — status tokens + dest `<cwd>/.cursor/agents` + extra-script not in manifest + overlay not a dispatch surface.
2. `docs/api.md` — Installation table row for `kaola-workflow-ensure-cursor-catalog.js`.
3. `CHANGELOG.md` `[Unreleased]` — reconcile #1016 bullet to the same tokens/paths/extra-script/overlay facts.

## Deliberately skipped

- Codemaps (`scripts/codemaps/`, `docs/CODEMAPS/`) — absent.
- `install-cursor.sh` `usage()` still says support-script list comes from the manifest only — production installer, not a markdown surface; left unedited (docs-only).
- `templates/routing/init.skeleton.md` — frozen; no generalPurpose/ensure.
- `#1013` frontmatter / `[9.14.0]` — not restamped.
