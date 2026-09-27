# Finalization Summary — issue #1108

## Delivered

A successful Codex `hooks.json` update no longer leaves a `~/.codex/hooks.json.kaola-backup-*`
file behind.

Root cause: `createOwnedHookFileBackup()` hard-links the live `hooks.json` and records its stat
while nlink = 2. `renameSync(stage, hooks.json)` drops the old inode to nlink = 1, which advances
its ctime. The success path's `cleanupOwnedFile` → `sameFileVersion` then compares ctime and refuses
to delete, so every successful update of an existing hooks.json leaked one backup.

Fix: a new `promotedHookBackupStat(backup, originalBytes)` re-captures the backup's lstat on the
success path, just before cleanup. It returns the new stat only while the backup is a regular
non-symlink file with the same dev/ino, the same size and mtime, and bytes equal to the original
hooks.json. Otherwise it returns `null` and cleanup refuses, as before. The stat is taken before the
read, so any later write advances ctime and the existing `sameFileVersion` check still refuses.
Rollback paths are unchanged: they use identity-only `ownedPathMatches`, which the ctime change
never affected.

Choice: re-verifying after the rename keeps the existing "delete only what is provably ours and
original" rule and does not depend on filesystem-specific ctime semantics. Predicting the
post-rename version would.

## Files Changed

| File | Change |
|---|---|
| `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` | +19 / −1: `promotedHookBackupStat` and its use on the success-path cleanup (the reference copy per `validate-script-sync.js`) |
| `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js` | +19 / −1, byte-identical copy |
| `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js` | +19 / −1, byte-identical copy |
| `scripts/test-install-model-rendering.js` | +106: `#1108` block, 4 fixtures |
| `CHANGELOG.md` | `[Unreleased]` / `### Fixed` entry |
| `docs/installation.md` | backup lifecycle and manual cleanup of old leftovers |
| `docs/api.md` | installer row describes the owned backup |

## Test Coverage

`scripts/test-install-model-rendering.js`, block `#1108`, isolated temp HOME:
1. `issue-1108-success-leaves-no-backup`: update → `updated`, no `hooks.json.kaola-*` sibling;
   rerun → `unchanged`, still none. RED on the a0813186 installer:
   `AssertionError: #1108: a successful hooks.json update must not leave a .kaola-backup-* file behind`
   (actual `['hooks.json.kaola-backup-12738-508701…']`). GREEN after the fix.
2. `issue-1108-backup-replaced-after-promotion`: a foreign inode at the backup path survives.
3. `issue-1108-backup-rewritten-after-promotion`: a same-inode, same-length rewrite with a pinned
   whole-second mtime survives, so only the byte check can refuse.
4. `issue-1108-rollback-after-promotion`: a post-promotion failure still restores hooks.json from
   the backup and leaves no sibling.

Mutants were all killed: no byte check (fixture 3), identity-only (fixture 3), unconditional unlink
(fixture 2).

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- docs/installation.md
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- scripts/test-install-model-rendering.js

## Acceptance — issue statement walked part by part

| Issue part | Satisfied by |
|---|---|
| A successful update of an existing hooks.json leaves no `*.kaola-backup-*` file | Fixture 1 (RED on a0813186, GREEN on 2276a35f) |
| Every rollback path still restores from the owned backup | Rollback code unchanged; fixture 4, plus the pre-existing `file-live-replaced`, `file-stage-replaced` and `file-backup-replaced-after-create` fixtures, all green |
| An unowned or replaced backup is never deleted | Fixtures 2 and 3; `cleanupOwnedFile` still refuses on a `null` or mismatched version |
| Regression test fails on current code, isolated HOME | Fixture 1; `mkdtemp` HOME, the real `~/.codex` was never touched |
| Document cleanup of backups older installs left; no automatic deletion | `docs/installation.md` (manual `rm` after confirming live hooks.json); the installer deletes only its own current backup |

## Documentation Docking

`DOCKED`: see `.cache/doc-docking.md`.

## Follow-Up Items

None. No run-discovered defect outside the fix. No correction comment is owed: the issue's
mechanism was confirmed exactly as stated.

## Readiness

- Candidate: `2276a35fc0760de561459ade1c3889a3d887b667` (rebased on origin/main a3506ef5; one
  CHANGELOG conflict, resolved to a single `[Unreleased]` / `### Fixed` holding the #1107 and #1108
  entries).
- Focused re-validation on 2276a35f, all exit 0: test-install-model-rendering, validate-script-sync,
  edition-sync --check, the Codex walkthrough, and simulate-workflow-walkthrough (204/204).
- Four-chain receipt: `/tmp/kw1108/chain-receipt.json`, headSha 2276a35f, claude/codex/gitlab/gitea
  all exit 0, no waiver, isolated HOME. `--release-check --candidate HEAD` exits 0.
- `.cache/final-validation.md`: `verdict: pass`.
- Sink: merge to main, no PR. Issue action: close.

Status: **ready to finalize**.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1108/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1108/.cache/doc-docking.md
- kaola-workflow/archive/issue-1108/.cache/final-validation.md
- kaola-workflow/archive/issue-1108/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1108/finalization-summary.md
- kaola-workflow/archive/issue-1108/mission-ledger.jsonl
- kaola-workflow/archive/issue-1108/workflow-state.md
