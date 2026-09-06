# Issue #1052 doc-updater — C1 gate parentheses

Role: doc-updater. Docs only.

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
This record: `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1052/.cache/doc-updater-c1-gate-parens.md`  
Date: 2026-09-07

Did not change production or tests. Did not invent `scripts/codemaps/` or `docs/CODEMAPS/` (neither exists). Did not claim that Cursor CLI exports `CURSOR_PRODUCT` or `CURSOR_HOST`.

## Reconciled against

`scripts/sync-cursor-edition.js` `cursorCliHostGateOpen()` (read, not edited):

```
if { [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ]; } || { [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; }; then
```

The previous documented form was unparenthesized `A && B || C && D`. Bash left-associates that as `(A && B) || (C && D)` only when both pairs are grouped; without `{ …; }` around each `&&` pair, a true `CURSOR_PRODUCT=cli` with unset `CURSOR_HOST` can still fall through via `||` into the KAOLA pair as an ELSE-like continuation, so a documented CURSOR pair is not a closed then-arm. The generator already emits the grouped form above.

## Files updated (worktree)

| File | Change |
|---|---|
| `README.md` | Quoted gate replaced with the grouped `{ CURSOR pair } \|\| { KAOLA pair }` form. Surrounding “does not record that Cursor CLI exports” sentence unchanged. |
| `CHANGELOG.md` `[Unreleased]` | Same quoted-gate replacement inside the #1052 bullet. `[10.4.0]` and earlier untouched. “this changelog does not claim that Cursor CLI currently exports those `CURSOR_*` names” kept. |
| `docs/api.md` | Prose quote replaced. `--ensure-target` table cell same grouped form, still escaping `\|\|`. Env-var section already described pair semantics without the unparenthesized `if`; left as-is. Still does not claim Cursor CLI exports `CURSOR_*`. |
| `docs/cursor-edition.md` | Quoted gate replaced. “does not claim that Cursor CLI currently exports” kept. |
| `docs/architecture.md` | Quoted `cursorCliHostGateOpen` line replaced. “does not claim that Cursor CLI currently exports” kept. |
| `docs/runtime-capabilities.md` | Same quoted-gate replacement. “does not claim that Cursor CLI currently exports” kept. |

## Surfaces skipped (with reason)

| Surface | Reason |
|---|---|
| `scripts/codemaps/`, `docs/CODEMAPS/` | Neither exists. Did not invent. |
| `.env.example` | These names are consumed by generated Next shell, not a repository JS/sh reader. |
| `docs/README.md`, `docs/installation.md`, ADRs | No quoted unparenthesized gate. |
| `docs/api.md` Environment Variables targeting subsection | No quoted `if` line; pair semantics already correct. |
| Public-interface comments in JS / `cursorCliHostGateOpen()` | Production; already grouped; forbidden this mission. |
| Tests | Forbidden this mission. |
| Generated `.cursor*/commands/workflow-next.md` | Render targets; generator already owns the grouped gate. |

## Commands run

- Glob: `scripts/codemaps/**`, `docs/CODEMAPS/**` (0 hits).
- Read: `scripts/sync-cursor-edition.js` `cursorCliHostGateOpen` (lines 230–233).
- Grep/Read: unparenthesized `CURSOR_PRODUCT` gate in README, CHANGELOG `[Unreleased]`, `docs/api.md`, `docs/cursor-edition.md`, `docs/architecture.md`, `docs/runtime-capabilities.md`.
- StrReplace: those six quoted gates to the grouped production form (api.md table kept `\|\|`).
- Post-Grep: no remaining unparenthesized `if [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ] ||` in worktree `*.md`.
- No `npm test`, no edition suites, no walkthrough (docs-only; tests not executed).

## Stop

Quoted docs now match the grouped `cursorCliHostGateOpen()` then-arm. Production and tests untouched.
