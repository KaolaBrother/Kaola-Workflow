# TDD-Guide Output: issue-217

## Files Changed
1. `scripts/kaola-workflow-claim.js` — guarded cmdFinalize --keep-worktree with try/catch around add + diff --cached --quiet; commit only runs in catch
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical fix applied; validate-script-sync.js confirmed in sync
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — same guard pattern
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same guard pattern
5. `scripts/simulate-workflow-walkthrough.js` — added double-finalize idempotency assertion (exit 0 + no new commit on 2nd run)

## TDD Cycle
RED: Second finalize --keep-worktree failed with "Command failed: git -C ... commit -m chore: archive issue-850" — confirmed the unguarded commit on a clean index was the bug.
GREEN: npm test exit 0.

## Final Test Output
```
Workflow walkthrough simulation passed
OK: 11 common scripts and 2 byte-identical file group in sync.
Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```

Exit code: 0
