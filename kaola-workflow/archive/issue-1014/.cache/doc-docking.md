# Documentation docking — issue #1014

**verdict: DOCKED**

Worktree HEAD at docking: `e25ac72b` (implementation `019a4062` plus Codex `COMMON_SCRIPTS` validator mirror).

## Changed files reviewed

Tracked delivery: `templates/routing/next.skeleton.md`, `templates/routing/init.skeleton.md`, generated next/init command and init skill surfaces (three forges), `scripts/sync-cursor-edition.js`, `install-cursor.sh`, `scripts/test-cursor-edition.js`, `scripts/validate-workflow-contracts.js` + Codex plugin mirror + gitlab/gitea contract validators, `README.md`, `docs/README.md`, `docs/cursor-edition.md`, `CHANGELOG.md`.

## Documents checked

| Document | Result |
|---|---|
| `README.md` | Cursor install-all blurb and `### cursor` state workspace Task catalog, `--global` dual-write, omit-`model`, cold start. |
| `docs/cursor-edition.md` | Task types load from workspace `.cursor/agents`; GLOBAL dual-write; cold start. |
| `docs/README.md` | Cursor edition index line matches. |
| `CHANGELOG.md` `[Unreleased]` | #1014 Changed entry present. |
| `docs/api.md` | No impact — does not document `install-cursor.sh` (same as other additive installers). |
| `docs/architecture.md` | No impact — install/model cells still point at `docs/cursor-edition.md`. |
| `.env.example` | No impact — no env contract change. |
| Issue #1014 comments | Plan of record `5380834329` is what shipped; body honesty-bound was answered by Probe A. No comment correction required. |

## Gaps found and fixed

None at docking. `doc-updater` made no further edits.

## No-impact reasons

- `docs/api.md` / `.env.example`: no public script CLI flag table or env schema for the cursor installer.
- Architecture table is pointer-valued; the pointed section was updated.

## Live evidence docking

`.cache/live-cursor.md` plus `probe-a.ndjson` / `probe-23.ndjson` / `probe-4.ndjson` bind Probe A reject, dual-write envelopes medium vs high, and fail-closed no `generalPurpose`.
