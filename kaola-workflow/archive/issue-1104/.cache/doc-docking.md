# Documentation Docking: issue-1104

Candidate: `c99ded062c0da72732f4bbd27d048bc4835e8d90` (base `04866c50`).

Checked against the AGENTS.md documentation checklist:

- `CHANGELOG.md` — updated: `[Unreleased]` → `### Fixed` entry for #1104 describing the lexical-first
  containment check with the realpath fallback, both `--home` forms refusing drift with exit 2
  `plugin_identity_invalid`, and the symlinked `~/.codex` now failing earlier with exit 2
  `plugin_cache_path_unsafe` (base: exit 1 `stale`). Measured at `c99ded06`.
- `README.md` — no impact: does not describe the preflight plugin identity / cache containment check
  (`grep -n "plugin_identity_invalid\|plugin_cache_path_unsafe\|readPluginIdentity" README.md` → 0 hits).
- `docs/api.md` — no impact: line 1903 describes `kaola-workflow-codex-preflight.js --doctor` only as
  an explicit diagnostic of plugin/profile/config/manifest/hook state; the identity check's path
  comparison, flags, and output fields are unchanged (no new status or field; `plugin_identity_invalid`,
  `plugin_manifest_version_mismatch`, `plugin_cache_path_unsafe` all pre-exist).
- Architecture docs / ADRs (`docs/decisions/`) — no impact: no design change; a private comparison fix.
- Public-interface comments — `readPluginIdentity` carries a `#1104` comment stating why the resolved
  fallback exists. No exported signature changed (`runDoctor`, `runPreflight` unchanged).
- Setup / environment / validation commands / examples — no impact.

DOCKED
