# Issue #1052 doc-updater — C1 host gate

Role: doc-updater. Docs only.

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
This record: `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1052/.cache/doc-updater-c1-host-gate.md`  
Date: 2026-09-07

Did not change production or tests. Did not touch `kaola-workflow/bundle-1051`. Did not invent `scripts/codemaps/` or `docs/CODEMAPS/` (neither exists). Did not claim live Task catalog, same-process hot-load, or that Cursor CLI currently exports `CURSOR_PRODUCT` / `CURSOR_HOST` (no such export is recorded in this tree; only generated Next shell and tests set or delete those names).

## Reconciled against

`scripts/sync-cursor-edition.js` (`cursorCliHostGateOpen`, `cursorCliGatedOperatorLines`, `cursorCliResumeRecoveryFence`):

```
if [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ] || [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; then
```

- CLI-stamped Next `startup`/`resume` argv remains `--runtime cursor --product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`, but only on the `then` branch of that gate.
- Unset App/Cloud-like env takes unstamped `--runtime cursor` and does not run `--product cli --host local`.
- Standalone CLI/local must set `CURSOR_PRODUCT=cli` and `CURSOR_HOST=local` (or `KAOLA_CURSOR_PRODUCT` / `KAOLA_CURSOR_HOST`) so CLI ensure is not skippable-by-omission.
- First Resume fence still inlines `kaola_script` / `CLAIM_JS="$(kaola_script …)"` **outside** the `if`.
- claim.js identity (`isCursorCliLocalWorkflowPath` / `ensureCursorCliLocalPrep`) is unchanged: ensure still requires explicit `--runtime cursor --product cli --host local`.

## Files updated (worktree)

| File | Change vs prior #1052 docs |
|---|---|
| `README.md` | User-visible Cursor Next paragraph no longer stops at two argv classes. Documents the executable env gate, unstamped App/Cloud-like path, required CLI env pair (or KAOLA twins), unknown Cursor CLI export, Resume `CLAIM_JS` resolver outside `if`. Keeps `App/Cloud do not inherit that CLI ensure` so existing README pin `#1052-c4-readme-app-cloud` still matches. File-ready bytes still not live Task proof. |
| `CHANGELOG.md` `[Unreleased]` | Same #1052 bullet; replaced “two operator argv classes / unguarded CLI stamp lines” with the shell gate, unset-env unstamped path, required CLI env, unknown Cursor CLI export, Resume resolver outside `if` / `then` CLI vs `else` unstamped resume. `[10.4.0]` and earlier untouched. |
| `docs/cursor-edition.md` | Replaced unguarded “two operator argv classes” at generated Next. Compact-recovery and `--ensure-target` installer bullets now say generated Next forges CLI identity flags only inside that gate. Still does not claim Cursor CLI exports `CURSOR_*`. |
| `docs/api.md` | Cursor CLI/local startup/resume section same gate. `--ensure-target` table row same gate (table cell escapes `\|\|`). Environment Variables → Targeting and posture: documents `CURSOR_PRODUCT`/`CURSOR_HOST` and `KAOLA_CURSOR_*` twins as **generated Next shell only**, not claim.js; unknown whether Cursor CLI exports `CURSOR_*`. |

## Surfaces skipped (with reason)

| Surface | Reason |
|---|---|
| `scripts/codemaps/`, `docs/CODEMAPS/` | Neither exists. Did not invent. |
| `.env.example` | Header: a knob with no script reader does not belong. These names are consumed by generated Next shell, not by a repository JS/sh reader. |
| `docs/architecture.md` | Still says “Generated GitLab/Gitea Next stamps `--product cli --host local`” without the env `if`. Parent brief named README, CHANGELOG, cursor-edition, api. Left stale on purpose. |
| `docs/runtime-capabilities.md` | Same unguarded “Generated GitLab/Gitea Next stamps” sentence. Same skip. |
| `docs/README.md`, `docs/installation.md`, ADRs | No user-visible install/index change; identity flags on claim.js unchanged. |
| Public-interface comments in JS | Production; forbidden this mission. |
| Tests | Forbidden this mission. |
| Generated `.cursor*/commands/workflow-next.md` | Render targets; generator already owns the gate. |

## Commands run

- Glob: `scripts/codemaps/**`, `docs/CODEMAPS/**` (0 hits).
- Grep/Read in worktree: `CURSOR_PRODUCT`, `KAOLA_CURSOR_*`, `--product cli`, README/CHANGELOG/`docs/cursor-edition.md`/`docs/api.md`, `scripts/sync-cursor-edition.js` host-gate helpers, `#1052-c4-readme-*` pins.
- No `npm test`, no edition suites, no walkthrough (docs-only; tests not executed).

## Stop

C1 host-gate docs in the named surfaces match generated Next’s executable env gate. Architecture and runtime-capabilities still describe an unguarded generated stamp; they were not in the edit set.

## Follow-up (AGENTS.md architecture + runtime-capabilities)

Date: 2026-09-07. Docs only. Production and tests untouched. Codemaps still absent; not invented.

Reconciled against `scripts/sync-cursor-edition.js` `cursorCliHostGateOpen` (same `if` line as above). Generator is GitHub/GitLab/Gitea Next, not GitLab/Gitea-only.

| File | Change |
|---|---|
| `docs/architecture.md` | Replaced “Generated GitLab/Gitea Next stamps `--product cli --host local`” with Next (all three forges) forging that pair only inside `cursorCliHostGateOpen`; unset App/Cloud-like env stays unstamped `--runtime cursor`; CLI/local must set `CURSOR_PRODUCT`/`CURSOR_HOST` or `KAOLA_CURSOR_*`; does not claim Cursor CLI exports `CURSOR_*`. |
| `docs/runtime-capabilities.md` | Same retarget of the unguarded stamp sentence. Table row for Cursor CLI/local still describes claim.js `--runtime cursor --product cli --host local` ensure (unchanged identity gate). |

Prior skip of those two files is withdrawn. Remaining skips (`.env.example`, `docs/README.md`, `docs/installation.md`, ADRs, JS comments, tests, generated mirrors) unchanged.

Commands: Read architecture ~449–452 and runtime-capabilities ~64–66; Read `cursorCliHostGateOpen`; StrReplace those two sentences; Grep confirmed no remaining `Generated GitLab/Gitea Next stamps`.

## Stop (follow-up)

`docs/architecture.md` and `docs/runtime-capabilities.md` now name `scripts/sync-cursor-edition.js` `cursorCliHostGateOpen` as the generated Next CLI-identity gate.
