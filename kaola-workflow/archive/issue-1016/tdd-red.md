# tdd-red — issue #1016 G10 pins

baseline: `f3642cb0b4fdffdd6b9d248d709bb734aef7b566` (`workflow/issue-1016`; worktree HEAD equals this SHA; no production fix)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`

Command: `node scripts/test-cursor-edition.js` (cwd = worktree)

Exit code: **1**

Counts: **28 failure(s), 608 passed**

Production / skeletons / generators / installers (`templates/routing/init.skeleton.md`, `install-cursor.sh`, `scripts/sync-cursor-edition.js`, and any other source): **not edited**.

Edition-only: no `phaseCommands` pin; no four-chain tests.

Acceptance surface: comments override the body — plan of record `5383907624`, Layer 1–2 overridden by amendment `5383958037` (global `$cursorHome/agents` is source of truth; `already-present` = all `listCanonAgents()` names byte-identical to global). A pin requiring git-toplevel-over-home was **not** written.

---

## Files changed (tests only)

- `scripts/test-cursor-edition.js` (worktree)

---

## Green on this baseline (regression / freeze)

- Existing G2 inherit / named-role / generalPurpose / sentinel `.cursor/agents/implementer.md` / cold-start / Invalid-enum needles: still pass.
- Existing G8 / G9 pins: still pass.
- **G10-overlay-untouched stayed green:** `templates/routing/init.skeleton.md` contains neither `generalPurpose` nor `kaola-workflow-ensure-cursor-catalog`.
- **G10-install `supportScripts('github')` exclusion stayed green:** that filename is already absent from the forge manifest (Cursor-only extra script; must remain absent).

---

## Failure signatures (RED as intended)

```
FAIL: G10-ensure: scripts/kaola-workflow-ensure-cursor-catalog.js exports ensureCursorCatalog({ cwd, cursorHome }) — file missing
FAIL: G10-ensure[already-present]: all listCanonAgents() dest files byte-identical to $cursorHome/agents → already-present (module missing)
FAIL: G10-ensure[lone-implementer]: a lone dest implementer.md is not already-present (module missing)
FAIL: G10-ensure[drift]: dest bytes that differ from global are refreshed from $cursorHome/agents (module missing)
FAIL: G10-ensure[copied]: dest empty-of-canon copies listCanonAgents() names from $cursorHome/agents only (module missing)
FAIL: G10-ensure[global-source]: copy from $cursorHome/agents, not git toplevel in preference to home (module missing)
FAIL: G10-ensure[missing-source]: empty global canon → missing-source, no invented files (module missing)
FAIL: G10-cli: scripts/kaola-workflow-ensure-cursor-catalog.js exists
FAIL: G10-cli: isolated require() of kaola-workflow-ensure-cursor-catalog.js without sync-cursor-edition.js beside it (file missing)
FAIL: G10-cli: stdout contains already-present | copied | missing-source (file missing)
FAIL: G10-cli: already-present and copied exit 0; missing-source exits non-zero (file missing)
FAIL: G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: names kaola-workflow-ensure-cursor-catalog.js
FAIL: G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: names status tokens already-present | copied | missing-source
FAIL: G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: already-present → named omit-model Task (not “only implementer.md exists”)
FAIL: G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: missing-source → print ./install-cursor.sh --target "$PWD" (or global install path); do not name a Task type
FAIL: G10-block[CURSOR_MODEL_DISPATCH_BLOCK]: must not prefer git toplevel over $CURSOR_HOME/agents as catalog source
FAIL: G10-block[.cursor/commands/workflow-next.md]: names kaola-workflow-ensure-cursor-catalog.js
FAIL: G10-block[.cursor/commands/workflow-next.md]: names status tokens already-present | copied | missing-source
FAIL: G10-block[.cursor/commands/workflow-next.md]: already-present → named omit-model Task (not “only implementer.md exists”)
FAIL: G10-block[.cursor/commands/workflow-next.md]: missing-source → print ./install-cursor.sh --target "$PWD" (or global install path); do not name a Task type
FAIL: G10-block[.cursor/commands/workflow-next.md]: must not prefer git toplevel over $CURSOR_HOME/agents as catalog source
FAIL: G10-install: --global deploys kaola-workflow-ensure-cursor-catalog.js to $CURSOR_HOME/kaola-workflow/scripts/
FAIL: G10-install: extra-script is in the deployed set so post-manifest stale cleanup does not delete it
FAIL: G10-install: --uninstall --global removes kaola-workflow-ensure-cursor-catalog.js
FAIL: G10-hook: sessionStart includes a second command for ensure (not folded into the compact wrapper) — got [{"command":".cursor/hooks/kaola-workflow-compact-context.sh","timeout":5}]
FAIL: G10-hook: sessionStart has an ensure-catalog command distinct from compact-context.sh
FAIL: G10-hook: ensure hook script exists under .cursor/hooks/ — looked for ""
FAIL: G10-hook: driving the ensure hook on a missing catalog (hook script missing)
```

G10-block inherit / `subagent_type: "<role>"` / generalPurpose / sentinel / cold-start / Invalid-enum / “copied → new chat / workflow-next” needles on the *current* DIY block stayed green (G2 lock). The RED G10-block lines are the amendment surface: script name, status tokens, `already-present` routing, `missing-source` routing, and dropping git-toplevel-as-preferred-source.

---

## What implementer must make green (do not write that production here)

- Add self-contained `scripts/kaola-workflow-ensure-cursor-catalog.js` exporting `ensureCursorCatalog({ cwd, cursorHome })` with dest always `<cwd>/.cursor/agents`, check set = `listCanonAgents()` names, source of truth `$cursorHome/agents`, statuses `already-present` | `copied` | `missing-source`, CLI stdout tokens and exit codes as pinned.
- Point `CURSOR_MODEL_DISPATCH_BLOCK` (hence generated next) at that script and the three result routes; keep G2 needles; do not prefer git toplevel over global.
- `install-cursor.sh --global` extra-script deploy + stale-clean membership + `--uninstall --global` removal; keep it out of `supportScripts('github')`.
- Layer 3b: second `sessionStart` ensure command (compact wrapper remains), hook under `.cursor/hooks/`, `{}` / empty `additional_context` on a missing catalog, dest then has `implementer.md` when global can supply it; 5s-compatible timeout.
- Do not rewrite `templates/routing/init.skeleton.md`. Do not add `Task(model=)`. Do not restamp #1013 frontmatter.
