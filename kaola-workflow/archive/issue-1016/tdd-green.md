# tdd-green — issue #1016 G10 confirm

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`

Command: `node scripts/test-cursor-edition.js` (cwd = worktree)

Exit code: **0**

Counts: **687 assertions**, `cursor-edition test passed`

SHA: `f3642cb0b4fdffdd6b9d248d709bb734aef7b566` (`chore: release 9.14.1`)

Worktree dirty: **yes** — production from implementer plus G10 tests (not a clean commit). Porcelain:

```
 M CHANGELOG.md
 M README.md
 M docs/README.md
 M docs/cursor-edition.md
 M install-cursor.sh
 M scripts/sync-cursor-edition.js
 M scripts/test-cursor-edition.js
?? scripts/kaola-workflow-ensure-cursor-catalog.js
```

Baseline RED was the same SHA with G10 pins only (`tdd-red.md`: 28 fail / 608 pass). GREEN here is that SHA **plus** the dirty production tree. Assertion count rose 608→687 because RED short-circuited several G10 blocks with `assert(false)` before nested pins ran.

Edition-only: no `phaseCommands` pin; no four-chain tests. No pins weakened. No new pins added (G10 vs comments 5383907624 / 5383958037 — no hole found).

---

## G10 now passing (was RED)

### G10-ensure

- exports `ensureCursorCatalog({ cwd, cursorHome })`
- **already-present:** all `listCanonAgents()` dest files byte-identical to `$cursorHome/agents`
- **lone-implementer:** incomplete dest is `copied`, not `already-present`
- **drift:** dest bytes that differ from global are refreshed from `$cursorHome/agents`
- **copied:** dest empty-of-canon copies `listCanonAgents()` names from `$cursorHome/agents` only
- **global-source:** copy from `$cursorHome/agents`, not git toplevel in preference to home
- **missing-source:** empty global canon → `missing-source`, no invented files

### G10-cli

- script exists
- isolated `require()` without `sync-cursor-edition.js` beside it
- stdout tokens `already-present` | `copied` | `missing-source`
- `already-present` and `copied` exit 0; `missing-source` exits non-zero

### G10-block (`CURSOR_MODEL_DISPATCH_BLOCK` and `.cursor/commands/workflow-next.md`)

- names `kaola-workflow-ensure-cursor-catalog.js`
- names status tokens; `already-present` → named omit-model Task (not “only implementer.md exists”)
- `missing-source` → print `./install-cursor.sh --target "$PWD"` (or global install path); do not name a Task type
- still **no** `in order: git toplevel` (`!/in order:\s*git\s+toplevel/i`)

G2 needles on the same block (inherit omit, `subagent_type: "<role>"`, generalPurpose, sentinel path, copied → new chat / workflow-next, Invalid-enum) remain in the same `assertG10Block` helper and passed with the rest of the suite.

### G10-install

- `--global` deploys the extra-script to `$CURSOR_HOME/kaola-workflow/scripts/`
- re-run `--global` (stale-clean) leaves it in the deployed set
- `--uninstall --global` removes it
- `supportScripts('github')` still excludes `kaola-workflow-ensure-cursor-catalog.js`

### G10-overlay-untouched

Still green: `templates/routing/init.skeleton.md` contains neither `generalPurpose` nor `kaola-workflow-ensure-cursor-catalog`.

### G10-hook

- second `sessionStart` command for ensure (compact wrapper remains)
- ensure hook under `.cursor/hooks/`
- missing catalog: stdout `{}` (or empty `additional_context`); dest then has `implementer.md` when global can supply it

---

## Overlay / manifest freeze (worktree vs HEAD)

`git diff --name-only HEAD -- templates/routing/init.skeleton.md scripts/kaola-workflow-install-manifest.js` → **empty**.

`scripts/kaola-workflow-install-manifest.js` has **no** ensure filename. Tests file vs HEAD is G10 additions only (`scripts/test-cursor-edition.js | 500 insertions`); production files in the dirty list are implementer’s, not this confirm.

---

## Mutation thought-check (read, not applied)

If `CURSOR_MODEL_DISPATCH_BLOCK` dropped the ensure script name, `assertG10Block` would fail:

`G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: names kaola-workflow-ensure-cursor-catalog.js`

(`/\kaola-workflow-ensure-cursor-catalog\.js/` on the block text; same pin on generated `workflow-next.md`.)

---

## Verdict

**GREEN.** G10 labels that were RED on `f3642cb0` now pass against that SHA with implementer production in the dirty worktree. Overlay freeze holds. Test custody unchanged (no new pins, no weakened pins, no production edits in this confirm).
