evidence-binding: n2-docs f5d06a00c10b

## Summary of doc changes

### `docs/opencode-edition.md` (updated)

Three surgical additions:

1. **"What gets generated" table** — added a row for
   `templates/opencode/plugins/*.js` → `.opencode/plugins/kaola-workflow-hooks.js`,
   describing it as byte-copied from the tracked canonical source by
   `sync-opencode-edition.js --write` (verified by `--check`). Updated the
   "authored" blurb from "Two files" to "One file" (removing the plugin entry now
   that it is generated, not hand-authored).

2. **Hooks section** — added a paragraph after the hook-model intro explaining the
   canonical-source path: tracked source at `templates/opencode/plugins/kaola-workflow-hooks.js`,
   `--write` byte-copies it, `--check` asserts parity, `install-opencode.sh` deploys from
   the tracked source (not a self-referential `.opencode/` copy), and a missing plugin is a
   loud install error.

3. **Verification section** — added `A11-canon` to the assertion list: the tracked source
   exists and the regenerated `.opencode/plugins/kaola-workflow-hooks.js` is byte-identical
   to it, closing the fresh-clone gap permanently.

### `docs/decisions/D-577-01.md` (new)

Decision record for the canonical-source convention:

- Context: #577 — no tracked source → fresh-clone install deploys nothing + clean-worktree
  test failures (A11/P1/G1/H1).
- Decision: track plugin under `templates/opencode/plugins/`; `sync --write` regenerates it;
  `--check` asserts parity; `install-opencode.sh` deploys from tracked source (no self-referential
  copy; missing = loud error); `test-opencode-edition.js` adds A11-canon.
- Scope: opencode-edition-only (additive, per D-530-02; no #307 four-chain obligation).
- Format follows the established decision record style (D-575-01 / D-530-02).
