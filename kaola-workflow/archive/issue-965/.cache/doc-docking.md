# Documentation docking — issue-965

Docked by the orchestrator inline, not dispatched: the change is one behavior sentence per edition
doc, and `doc-updater` fabricates structured detail when it is not handed exact text.

## Changed files reviewed

- `install-opencode.sh` — `install_support_scripts()` now converges `$dest` on the manifest.
- `install-kimi.sh` — same.
- `scripts/test-opencode-edition.js` — `S1b`.
- `scripts/test-kimi-edition.js` — `P1b`.
- `CHANGELOG.md` — `[Unreleased] ### Fixed`.

## Documents checked

| document | outcome |
|---|---|
| `CHANGELOG.md` | **Updated.** `[Unreleased] ### Fixed` created — the section did not exist, v9.7.0 was at the top. |
| `docs/opencode-edition.md` | **Updated** (~:212). Described the install as only *copying* support scripts; the removal half is the user-visible surprise and is now stated, with its `*.js` scope. |
| `docs/kimi-edition.md` | **Updated** (~:228). Same gap, same fix. |
| `docs/opencode-edition.md` `--uninstall` section (~:300) | No change. It already describes removal by source-tree filename and is unaffected; the new prune is on the install path. |
| `README.md` | No impact. It covers install invocation and forge selection, never the deployed-script lifecycle. |
| `docs/architecture.md` | No impact. No structural change — one function per installer gained a sweep. |
| `docs/api.md` | No impact. No script CLI, flag, envelope or exit code changed. |
| `docs/conventions.md` | No impact. No new convention; this makes two installers obey an existing one. |
| `CLAUDE.md` | No impact. The additive-edition rule it states is unchanged and was followed. |
| `.env.example` | No impact. No new environment variable. |
| `kaola-workflow/ROADMAP.md` | Generated mirror; closure owns it. |

## Gaps found and fixed

The two edition docs each said the installer "copies the support scripts" and stopped there. After
this change that is an incomplete description of what running the installer does to a user's
directory — a stray `.js` alongside is now removed. Both now state the convergence and its scope.

## Verdict

DOCKED
