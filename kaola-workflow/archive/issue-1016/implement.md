# implement.md — issue #1016

## task

Make G10 (`scripts/test-cursor-edition.js`) green in worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016` per
comment 5383907624 as amended by 5383958037 (catalog freshness; global
`$cursorHome/agents` is source of truth). Production only. Frozen:
`templates/routing/init.skeleton.md`, `Task(model=)`, #1013 pins,
`scripts/kaola-workflow-install-manifest.js`, `scripts/test-cursor-edition.js`,
no `generate-routing-surfaces.js`.

## verification tier

`tests-green`

## files changed

Worktree production:

- `scripts/kaola-workflow-ensure-cursor-catalog.js` (new)
- `scripts/sync-cursor-edition.js` (`CURSOR_MODEL_DISPATCH_BLOCK`, second
  `sessionStart` ensure wrapper, `expectedHookFiles` / write / check)
- `install-cursor.sh` (Cursor-only extra-script copy + uninstall `rm`)
- `docs/cursor-edition.md`
- `docs/README.md`
- `README.md`
- `CHANGELOG.md` (`## [Unreleased]` above `[9.14.1]`)

Generated (TREE_ROOT = main checkout, gitignored): `.cursor/`,
`.cursor-gitlab/`, `.cursor-gitea/` via
`node scripts/sync-cursor-edition.js --refresh-present`.

## frozen / not touched

- `scripts/test-cursor-edition.js`
- `templates/routing/init.skeleton.md`
- `scripts/kaola-workflow-install-manifest.js` (`supportScripts('github')` still
  excludes the ensure JS)
- `CURSOR_MODEL_CLASS_PINS` / generated agent model lines (#1013)
- no `Task(model=)` added
- no `generate-routing-surfaces.js`

## verification commands

```
cwd: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016
```

1. `node scripts/sync-cursor-edition.js --write` — exit 0 (github)
2. `node scripts/sync-cursor-edition.js --refresh-present` — exit 0 (all three
   present trees; needed so D0 does not stop on stale `.cursor-gitlab` /
   `.cursor-gitea`)
3. `node scripts/sync-cursor-edition.js --forge=github --check` — exit 0
4. `node scripts/sync-cursor-edition.js --forge=gitlab --check` — exit 0
5. `node scripts/sync-cursor-edition.js --forge=gitea --check` — exit 0
6. `node scripts/test-cursor-edition.js` — **exit 0**
   (`cursor-edition test passed (687 assertions).`)

Did not run four-chain. Did not drive host `~/.cursor` except via G10 hermetic
HOME/CURSOR_HOME installer tests.

## before

HEAD `f3642cb0`: `node scripts/test-cursor-edition.js` RED — 28 fail / 608 pass
(G10 absent / old Layer 1–2 prose).

## after

Same command: exit 0, 687 assertions passed. D0: three trees in parity
(`.cursor`, `.cursor-gitlab`, `.cursor-gitea`).

## notes

`CURSOR_MODEL_DISPATCH_BLOCK` names the ensure script and `kaola_script` /
`$CURSOR_HOME/kaola-workflow/scripts/` / self-dev `./scripts/`, but does **not**
name `kaola-workflow-claim.js` (G8-gitlab forbids the github claim basename in
gitlab-shaped `workflow-next`). Resolver described as “the same `kaola_script`
this card already uses for claim.js”.
