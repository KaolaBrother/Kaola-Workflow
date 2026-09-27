# #1101 retirement fixtures and catalogs — provenance

Kaola-Workflow ships no subagent roles (#1101). The installers retire what earlier releases
installed only on proof. This directory freezes the evidence the migration suites
(`scripts/test-issue-1101-*-agent-migration.js`) start from. No suite reads git history.

## Installed-state fixtures (`<era>/home/`)

Each era is a real install of that release into an empty sandbox HOME, captured afterwards.

- The release was taken from `git archive <ref>` into a scratch directory with its own `git init`.
- The installers ran with `env -i HOME=<sandbox> PATH=<node>:/usr/bin:/bin:/usr/sbin:/sbin`:
  - `install.sh --yes --forge=github --no-settings-merge`
  - `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js --global` and `<sandbox>/proj`
  - `install-grok.sh --global --yes` and `--target <sandbox>/gproj`
  - `install-cursor.sh --global --yes` and `--target <sandbox>/cproj`
  - `install-{zcode,kimi,opencode}.sh --global --yes` and `--target <sandbox>/proj`
  - `install-devin.sh --global` and `--project=<sandbox>/proj`

| era | ref | what it proves |
|---|---|---|
| `v12.2.6-46fbe12d` | `46fbe12d` (pre-#1101 baseline) | upgrade from the current release. Claude five-column manifest, Codex record and seven-role block, Grok, Cursor global and project receipts, and every global-contract record |
| `v11.1.1` | tag `kaola-workflow--v11.1.1` | fourteen-role era: Claude, Codex (record and fourteen-role block), Grok, Cursor authority receipt. Also the last ZCode (global and project), Devin, Kimi native-agent (manifest) and OpenCode `agents/` (manifest) installs |
| `v10.0.1` | tag `kaola-workflow--v10.0.1` | Cursor global profiles with no receipt, proven by the catalog alone |
| `v9.17.1` | tag `kaola-workflow--v9.17.1` | Kimi role Skills (`skills/kaola-role-*`) that are not the v9.17.2 bytes |
| `v9.12.0` | tag `kaola-workflow--v9.12.0` | Claude two-column manifest; early Grok renders |
| `v9.4.0` | tag `kaola-workflow--v9.4.0` | OpenCode singular `agent/` with its manifest |
| `v6.8.0` | tag `kaola-workflow--v6.8.0` | OpenCode first era: `agent/` with no manifest, and the nested global `~/.config/opencode/.opencode/agent` |
| `v5.11.0` | tag `kaola-workflow--v5.11.0` | Claude contractor/workflow-planner era plus `.kaola-agent-models.json`; Codex pre-#332 project install with no record and a `[features]` block |

What was kept:

- The current era is kept whole, restricted to the agent, record, config, rule and receipt files.
- Older eras keep three roles each. Each ownership record is filtered to exactly the kept rows; a
  filtered record is still a true record of those files.

Path handling:

- The sandbox HOME is replaced by `@@HOME@@` and the release tree by `@@SRC@@`. The suites
  substitute their own sandbox for `@@HOME@@`.
- Every leading-dot path segment is stored as `dot-<name>` (e.g. `dot-claude/`, because the repo
  `.gitignore` excludes `.claude/`, `.codex/`, …). The suites map it back.

## Released-render catalogs (in the installers)

A catalog entry is the sha256 of a file some Kaola commit rendered for that runtime's installer,
which copied it verbatim (verified per runtime against the installers of every era). Catalogs are
frozen and never extended by a future render. They cover every commit from the runtime's first to
the baseline `46fbe12d`, not only tags, because `install.sh` bootstraps from `main`.

| runtime | where | digests | how it was produced |
|---|---|---|---|
| Codex profiles | `RELEASED_PROFILE_SHA256` in `plugins/*/scripts/install-codex-agent-profiles.js` | 347 (24 names) | every git blob ever at `plugins/kaola-workflow{,-gitlab,-gitea}/agents/*.toml`. Pre-rename `plugins/codex-workflow` blobs are excluded (#1101 H6: report only) |
| Codex block bodies | `RELEASED_BLOCK_BODY_SHA256`, same file | 41 | every blob of `config/agents.toml`, trimmed, plus the variant with its top-level `[features]` table removed. The pre-#775 installer wrote that variant when the user already had a `[features]` table |
| Claude | `CATALOG.claude` in `scripts/kaola-workflow-retired-agents.js` | 539 (18 names) | every blob tracked at `agents/*.md` reachable from `46fbe12d` (the earliest installers copied it verbatim), plus every file each commit's own `install.sh` wrote into an empty sandbox `~/.claude/agents` (commits touching `agents/`, `install.sh`, or the profile generator and its sources; later installers rewrote frontmatter while copying) |
| Grok | `CATALOG.grok` in `scripts/kaola-workflow-retired-agents.js` | 89 | render loop over `ac7a90b7^..46fbe12d` (347 commits) |
| Cursor | `CATALOG.cursor` | 89 | render loop over `966d3138^..46fbe12d` (344 commits) |
| ZCode | `CATALOG.zcode` | 49 | render loop over `42ce7de6^..46fbe12d` |
| Devin | `CATALOG.devin` | 15 | render loop over `aca5afec^..46fbe12d` |
| Kimi native agents | `CATALOG.kimi` | 31 | render loop over `f6dbf40d^..46fbe12d` (`.kimi*/agents/*.md`) |
| Kimi role Skills | `SKILL_CATALOG.kimi` | 79 (16 names) | same loop (`.kimi*/skills/kaola-role-*/SKILL.md`) |
| OpenCode | `CATALOG.opencode` | 131 (17 names) | render loop over `74da6a5b^..46fbe12d` (`.opencode*/agent/*.md`, `.opencode*/agents/*.md`). It also contains all 21 blobs ever tracked at `.opencode/agent/` |

The generators are kept beside this file and are not run by any suite:

- `tools/codex-catalog.js <repo>` rebuilds the two Codex lists.
- `tools/claude-catalog.sh <repo>` rebuilds the Claude list (sandbox `HOME`, cut `PATH`; 0 commits
  failed to install agents, 22 were skipped for having no `install.sh` or `agents/`).
- `tools/render-edition-catalog.sh <repo> <runtime> <first-commit>` rebuilds one runtime's rows.

The render loop, per commit:

1. `git archive <commit> <render inputs present at that commit>` into a scratch directory, then
   `git init` there, so the generator's tree root is the scratch directory. Archive only the inputs
   that exist at that commit: a pathspec missing at a commit fails the whole archive, which first
   hid the early OpenCode commits.
2. Run `node scripts/sync-<rt>-edition.js --forge=<f> --write` for `github`, `gitlab` and `gitea`.
3. Hash every generated `*/agents/*.md`, `*/agent/*.md` and `*/skills/kaola-role-*/SKILL.md`.

Commits with no sync script for that runtime (side-branch commits) are skipped. There were 0
render failures.

Cross-checks run when the catalogs were frozen:

- Every file of every captured era above matches its catalog: Codex blocks and profiles in all 5
  eras, Grok 14/14, Cursor 7/7, ZCode, Devin, Kimi 28/28, OpenCode 58/58 over the full installs.
- A real developer machine's `~/.cursor/agents` (seven files, v12 era) matched 7/7. Its hashes
  were read only; the files were not modified.
- Rendering is deterministic: the agent renders read no clock, HOME, cwd or environment, and two
  renders of the same commit are byte-identical.

## Orphan fixture (`orphan-80244600/`)

`docs-lookup.md` is `git show 80244600:agents/docs-lookup.md`, the released bytes an install between
`docs-lookup`'s retirement (2026-06-09) and the installer's retired-agent sweep (`299adb02`,
2026-07-25) left with the managed marker and no manifest row. Case C14 of the Claude suite retires
it through `CATALOG.claude`.
