# Documentation docking — issue #1108

Candidate: `2276a35fc0760de561459ade1c3889a3d887b667` (branch `workflow/issue-1108`, rebased on a3506ef5)

## Changed behavior

`install-codex-agent-profiles.js` `updateHooks()` now deletes its owned
`~/.codex/hooks.json.kaola-backup-<pid>-<hex>` hard link after a successful update. It first checks
that the backup is still the same inode, with unchanged size and mtime and the original bytes.
Rollback behavior is unchanged. The CLI, its flags, exit codes, and report lines are unchanged.

## AGENTS.md documentation checklist

| Surface | Checked | Action |
|---|---|---|
| `README.md` | `grep -n "kaola-backup\|hooks.json" README.md` = 0 hits | No impact: README does not describe the hooks.json write. |
| `docs/api.md` | `install-codex-agent-profiles.js` row (:2054) | FIXED: the row now describes the owned backup: restore on failure, delete after success only while it is the same file with the original bytes. |
| `docs/installation.md` | Codex installer paragraph (:104) | FIXED: describes the backup lifecycle and how to remove leftovers from releases through 12.3.0 by hand (`rm ~/.codex/hooks.json.kaola-backup-*` after confirming the live hooks.json). The installer never deletes them automatically. |
| `CHANGELOG.md` | top of file | FIXED: #1108 entry under the single `## [Unreleased]` / `### Fixed`, which it shares with #1107 (`grep -c "^## \[Unreleased\]"` = 1). |
| Architecture / ADR docs | no design change | No impact: this is a transaction-internal ownership re-verification; no ADR covers the hook backup. |
| Public-interface comments | `promotedHookBackupStat` | Added: a comment explains why the ctime changes and what is re-verified. |
| `docs/README.md` index | no new page | No impact. |

## Verdict

DOCKED
