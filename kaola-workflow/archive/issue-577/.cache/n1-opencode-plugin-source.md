evidence-binding: n1-opencode-plugin-source eeb29e4e9e6f

## RED

Pre-fix state: clean worktree with `.opencode/` fully absent (gitignored, untracked, not seeded).
Running `node scripts/test-opencode-edition.js` crashed immediately before reaching A11/P1/G1/H1:

```
Error: ENOENT: no such file or directory, scandir
  '/.../.kw/worktrees/issue-577/.opencode/agent'
    at Object.readdirSync (node:fs:1569:26)
    at Object.<anonymous> (.../scripts/test-opencode-edition.js:74:26)
```

Root cause: `fs.readdirSync(sync.OUT_AGENT_DIR)` at line 74 threw because `.opencode/agent/`
did not exist (no plugin source → no sync → no generated tree). A11 (plugin present at
`.opencode/plugins/kaola-workflow-hooks.js`) would also have failed: sync's `--write` path had
no `writePlugin()` step, and install-opencode.sh line 170 copied from `.opencode/plugins/` with
`2>/dev/null || true` — a self-referential silent no-op in a fresh clone. P1 and G1 likewise
failed because the installer deployed no plugin. H1 failed because it reads
`.opencode/plugins/kaola-workflow-hooks.js` directly (absent in a clean worktree).

RED: test-opencode-edition crashes at line 74 (scandir ENOENT .opencode/agent) — A11/P1/G1/H1
unreachable; the entire opencode suite is RED from a clean worktree with no tracked plugin source.

## GREEN

Post-fix, running `node scripts/test-opencode-edition.js` from the clean worktree:

```
opencode-edition test passed (496 assertions).
```

All assertions pass including A11 (plugin deployed and syntactically valid), A11-canon (tracked
canonical source exists + byte-identical), P1 (default install deploys hooks plugin), G1
(global install deploys hooks plugin), and H1 (hookPath resolves via plugin-sibling ../hooks).

GREEN: test-opencode-edition passes; 496/496 assertions green (was crash + 0 green pre-fix).

## Summary of changes

**4 files changed:**

1. `templates/opencode/plugins/kaola-workflow-hooks.js` (NEW tracked canonical source):
   Byte-for-byte copy of the live plugin from the main tree (7832 bytes). This is the new
   single canonical source of truth for the opencode hooks adapter.

2. `scripts/sync-opencode-edition.js`:
   Added `CANON_PLUGINS_DIR` + `OUT_PLUGINS_DIR` constants; `PLUGIN_SCRIPTS` array; `writePlugin()`
   function (mirrors `writeHooks()` byte-copy pattern from `templates/opencode/plugins/`); invoked
   from `runWrite()`; asserted in `runCheck()` (missing or drifted plugin = parity failure); new
   constants and `writePlugin` added to `module.exports`.

3. `install-opencode.sh`:
   In `copy_tree`: moved plugin deployment BEFORE the self-dev guard; changed source from
   `.opencode/plugins/` to `templates/opencode/plugins/`; removed the silent `2>/dev/null || true`
   so a missing template is a loud install error. In `uninstall_edition`: updated the plugin
   enumeration glob to `templates/opencode/plugins/` to match tracked source.

4. `scripts/test-opencode-edition.js`:
   Added self-provision block at the top (before A1) that runs `sync --write` to regenerate
   `.opencode/` from tracked sources in a clean worktree; added `A11-canon` assertions confirming
   `templates/opencode/plugins/kaola-workflow-hooks.js` exists and is byte-identical to the
   regenerated `.opencode/plugins/kaola-workflow-hooks.js`.
