# doc-updater host-identity (#1052)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`

## Detection

- `scripts/codemaps/` — absent
- `docs/CODEMAPS/` — absent
- Codemaps not invented.

## Signatures transcribed from source

### `scripts/kaola-workflow-claim.js`

- `KNOWN_VALUE_FLAGS` (lines 69–80) includes `product`, `host`, `cursorWorkspace`.
- `--cursor-workspace` is the kebab-case argv for `cursorWorkspace` via `parseArgs` (`key.slice(2).replace(/-([a-z])/g, camelCase)`); the flag is a known value flag, not a boolean.
- `isCursorCliLocalWorkflowPath` (lines 1976–1980): true iff `normalizeHostIdentityToken` of runtime/product/host equals `cursor` / `cli` / `local`.
- `ensureCursorCliLocalPrep` (line 2015): `if (!isCursorCliLocalWorkflowPath(args)) return { skipped: true };` — omitted, unknown, app, cloud, or incomplete pairs skip ensure.
- `cmdStartup` still calls `ensureCursorCliLocalPrep` then proceeds to claim when skipped (lines 2206–2228).
- `cmdResume` still calls `ensureCursorCliLocalPrep` then emits `resumed: true` when skipped (lines 2400–2409).
- `resolveCursorCliEnsureTarget` (lines 1982–1991): `--cursor-workspace` (`args.cursorWorkspace`) wins via `path.resolve(process.cwd(), locator)`; else non-empty `recordedMainRoot`; else `invokingRoot`.
- First-claim site: `resolveCursorCliEnsureTarget(args, root, '')` with `root = getRoot()` (line 2207).
- Resume site: `resolveCursorCliEnsureTarget(args, root, folder.main_root)` (lines 2402–2403).
- Helper spawn (lines 2022–2029): `spawnSync(process.execPath, [helper, '--ensure-target', root, '--forge=' + forge, '--json'], { cwd: root, ... })`.
- Fail-closed: `refuseCursorPrep` emits `result: 'refuse'`, `reason: 'cursor_prep_failed'`, `claim: 'none'` (lines 2003–2011).
- `cmdStatus` (line 5464) and `cmdListOpen` (line 289) do not call `ensureCursorCliLocalPrep`.

### `scripts/sync-cursor-edition.js`

- Next startup rewrite (lines 268–271): `node "$CLAIM_JS" startup --runtime cursor --product cli --host local`
- Resume section (lines 272–275): `node "$CLAIM_JS" resume --runtime cursor --product cli --host local` then still reads `mission-list.md`
- Finalize helper line (line 237): `node "$CURSOR_MATERIALIZER" --ensure-target "$PWD" --forge=' + forge + ' --json` — no CLI identity flags on ensure-target.

## Files changed (worktree)

| File | Reconciled against |
| --- | --- |
| `CHANGELOG.md` `[Unreleased]` #1052 bullet | explicit `--runtime cursor --product cli --host local` gate; `KNOWN_VALUE_FLAGS` `product`/`host`/`cursorWorkspace`; locator order; helper spawn unchanged; `status`/`list-open` zero-write; Next startup/resume rewrite; Finalize `$PWD` without identity flags |
| `docs/api.md` Claim API prep section | same gate, skip-but-claim, `resolveCursorCliEnsureTarget`, helper argv `--ensure-target <target> --forge=<forge\|github> --json` |
| `docs/api.md` `--ensure-target` row | same; Finalize `$PWD` unchanged |
| `docs/cursor-edition.md` | old `product not app` / getRoot-only locator retargeted; compact-recovery locator retargeted |
| `docs/architecture.md` | old getRoot-only spawn retargeted |
| `docs/runtime-capabilities.md` table + CLI paragraph | old `product not app` / getRoot-only locator retargeted |

## Surfaces skipped (with reason)

- `scripts/codemaps/` / `docs/CODEMAPS/` — tooling absent; not invented.
- `README.md`, `docs/README.md` — no old `product!=app` / getRoot-as-only-CLI-workspace gate text.
- Released `CHANGELOG.md` entries — not rewritten.
- Tests — not modified.
- `scripts/sync-cursor-edition.js` — source already ships explicit CLI/local flags; docs transcribe it; generator not a listed user-visible doc.
- Generated edition mirrors / plugins — not independently overwritten.
- `kaola-workflow/bundle-1051` and `.kw/worktrees/bundle-1051` — not touched.

## Kept (unchanged facts)

- App/Cloud exclusion
- no `sessionStart` materializer
- no `--global` dual-write
- Finalize independent `--ensure-target "$PWD"`
- file-ready ≠ live Task catalog
- no live-dispatch claim
