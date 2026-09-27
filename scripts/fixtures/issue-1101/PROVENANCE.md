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

| era | ref | what it proves |
|---|---|---|
| `v12.2.6-46fbe12d` | `46fbe12d` (pre-#1101 baseline) | upgrade from the current release. Claude five-column manifest, Codex record and seven-role block, Grok, Cursor global and project receipts, and every global-contract record |
| `v11.1.1` | tag `kaola-workflow--v11.1.1` | fourteen-role era: Claude, Codex (record and fourteen-role block), Grok, Cursor authority receipt |
| `v10.0.1` | tag `kaola-workflow--v10.0.1` | Cursor global profiles with no receipt, proven by the catalog alone |
| `v9.12.0` | tag `kaola-workflow--v9.12.0` | Claude two-column manifest; early Grok renders |
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
which copied it verbatim. Catalogs are frozen and never extended by a future render. They cover
every commit from the runtime's first to the baseline `46fbe12d`, not only tags, because
`install.sh` bootstraps from `main`.

| runtime | where | how it was produced |
|---|---|---|
| Codex profiles and block bodies | `RELEASED_PROFILE_SHA256` / `RELEASED_BLOCK_BODY_SHA256` in `plugins/*/scripts/install-codex-agent-profiles.js` | every git blob ever at `plugins/kaola-workflow{,-gitlab,-gitea}/agents/*.toml` (347 digests, 24 names). Block bodies are every blob of `config/agents.toml`, trimmed, plus the variant with its top-level `[features]` table removed, which the pre-#775 installer wrote when the user had one (41 digests). Pre-rename `plugins/codex-workflow` blobs are excluded (#1101 H6: report only) |
| Grok / Cursor | `CATALOG.grok` / `CATALOG.cursor` in `scripts/kaola-workflow-retired-agents.js` | for every commit `ac7a90b7^..46fbe12d` (Grok, 347 commits) and `966d3138^..46fbe12d` (Cursor, 344 commits): `git archive` into a scratch git root, then `node scripts/sync-<rt>-edition.js --forge=<f> --write` for each forge. The digests are the sha256 of each `.<rt>{,-gitlab,-gitea}/agents/*.md`. 89 digests each, 0 render failures |

Cross-checks run when the catalogs were frozen:

- Every file of every captured era above matches its catalog.
- A real developer machine's `~/.cursor/agents` (seven files, v12 era) matched 7/7. Its hashes
  were read only; the files were not modified.
- Rendering is deterministic: the agent renders read no clock, HOME, cwd or environment.
