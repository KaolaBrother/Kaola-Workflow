# Issue #1052 doc-updater call chain (C4 README)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
Evidence: this file (MAIN checkout `kaola-workflow/issue-1052/.cache/doc-updater-call-chain.md`)  
Date: 2026-09-07  
Role: doc-updater. Docs only. Did not change production code or tests. Did not touch `bundle-1051`. Did not rewrite mission-list done rows. Did not invent live Task / same-process hot-load claims.

Codemaps: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists. Did not invent that tree.

## Production transcribed (`scripts/sync-cursor-edition.js`)

`transformCommandBody` when `basename === 'workflow-next.md'`:

1. Unstamped App/Cloud startup stays:
   `node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`
2. CLI/local startup is inserted in a following fence:
   `node "$CLAIM_JS" startup --runtime cursor --product cli --host local --cursor-workspace "$CURSOR_WORKSPACE" --target-issues "$KAOLA_TARGET_ISSUES"`
   (`cursorCliOperatorIdentityArgv()`)
3. First `## Resume` fence is `cursorCliResumeRecoveryFence(forge)`: inlines `cursorKaolaScript(forge)` then
   `CLAIM_JS="$(kaola_script <named claim.js>)"` then
   `node "$CLAIM_JS" resume --runtime cursor --product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`
4. Unstamped App/Cloud resume stays:
   `node "$CLAIM_JS" resume --runtime cursor`
5. Then the existing `On resume, read mission-list.md` prose.
6. Appends `cursorCliStartupResumePrepProse()` (`## Cursor standalone CLI startup and resume Repo role prep`, `--ensure-target`, `--cursor-workspace` / recorded `main_root`, App/Cloud must not inherit/infer the CLI materialization rule, file-ready vs live catalog, `new_process_same_chat`, no hot load).

Install still writes one `.cursor/commands/workflow-next.md`; that file contains both operator argv classes.

## Files changed (worktree)

| File | Reconciled against | Change |
|---|---|---|
| `README.md` | AGENTS.md user-visible change rule; C4 pins in `scripts/test-issue-1052-cursor-cli-startup-prep.js` (`#1052-c4-readme-surface`, `#1052-c4-readme-prep`, `#1052-c4-readme-app-cloud`); last two docs passes skipped README and that skip is invalid | After the edition list: short Cursor `workflow-next` `startup`/`resume` note — one `.cursor/commands` file, two argv classes, CLI/local `--product cli --host local` `--ensure-target` Repo role prep / project-role materialization, `--cursor-workspace "$CURSOR_WORKSPACE"`, App/Cloud do not inherit that CLI ensure, file-ready ≠ live Task catalog, pointer to `docs/cursor-edition.md` |
| `CHANGELOG.md` `[Unreleased]` | User-visible signature change in generated Next | Replaced the single shared cli/local rewrite sentence with two operator paths + `--cursor-workspace "$CURSOR_WORKSPACE"` + self-contained Resume `CLAIM_JS` resolver. `[10.4.0]` and earlier untouched |
| `docs/cursor-edition.md` | Still described a single GitLab/Gitea cli/local stamp with no App executable path | One sentence: one `workflow-next.md`, two argv classes (unstamped App/Cloud + CLI `--product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`) |
| `docs/api.md` | Same single-stamp sentence under Claim API Cursor prep | Same one-sentence sync |

## Surfaces skipped (with reason)

| Surface | Reason |
|---|---|
| `docs/architecture.md` | Still has “Generated GitLab/Gitea Next stamps `--product cli --host local`”; this pass was limited to one sentence in `docs/cursor-edition.md` / `docs/api.md` only |
| `docs/runtime-capabilities.md` | Already documents CLI/local `--ensure-target` and App/Cloud exclusion; not a single-stamp command-file claim |
| `docs/README.md` | Index only; no operator argv |
| `docs/installation.md` | No Next startup/resume argv classes |
| `docs/CODEMAPS/*` | Directory does not exist |
| Production JS / tests | Out of custody |
| `kaola-workflow/bundle-1051` | Forbidden |
| `kaola-workflow/issue-1052/mission-list.md` done rows | Forbidden |
| Live Task catalog / same-process hot load | Not claimed; not executed |

## Commands run

- Glob for `scripts/codemaps/**` and `docs/CODEMAPS/**` (none)
- Read `scripts/sync-cursor-edition.js` (`cursorCliOperatorIdentityArgv`, `cursorCliResumeRecoveryFence`, `transformCommandBody` Next branch)
- Read README, CHANGELOG `[Unreleased]`, `docs/cursor-edition.md`, `docs/api.md`, C4 asserts in `scripts/test-issue-1052-cursor-cli-startup-prep.js`
- `node -e` README regex check against the three C4 asserts → `{ a: true, b: true, c: true, d: true }`
- Did not edit or run the independent test file in this pass

## Not claimed

Live named Task dispatch, live Task catalog visibility after `status: materialized`, and same-process hot load were not executed and are not documented as proven.
