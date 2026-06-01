# Advisor — Closure / Done-Check Gate (issue-210)

Greenlight. Implementation locked (RED→GREEN, byte-identity, clean 9-file diff,
npm test green ×2, code-reviewer traced prose against delegationPolicyCompliance).
Don't re-verify. Proceed to the sink. The merge-vs-PR confirmation is the right
(and only) one to ask — push-to-main + close-#210 is the sole irreversible outward
step; ask once, crisply; everything up to the push is already authorized by
"ship at 1.8.2" + "use workflow".

## Critical post-sink check (from memory sink_merge_issue_close_verify)
- `sink-merge.js` can EXIT 0 (branch merged) yet leave #210 OPEN — its `gh issue
  close` can fail mid-merge, surfacing as `remote_issue_closed: failed` in the
  closure receipt. Exit 0 = merged, NOT closed. After the sink: parse the receipt
  AND run `gh issue view 210 --json state`; if OPEN, `gh issue close 210` manually.
  Do not report "#210 closed" from the exit code alone.
- Same post-sink: confirm `git status --short --branch` shows on `main`, pushed,
  worktree clean.

## Sink-step guards
- Stage precisely: only the 9 tracked source files + kaola-workflow/issue-210/
  artifacts + roadmap delete/regen. Let cmdFinalize's archive rename ride the
  commit (don't hand-move). Confirm NO package.json/commands/byte-synced file in
  the staged set one last time (pre-commit hook won't catch a boundary breach).
- If merge not clean: exit 1 (conflict) / exit 2 (FF race) → follow printed
  remediation, don't force.

## Closure decision
AC fully met; the single follow-up (cross-forge parity guard) is optional + out of
scope and does NOT block closing #210. The `## [Unreleased]` CHANGELOG bullet lands
on main as-is and folds into the next root release — that's the follow-up's natural
home. Do NOT create a follow-up issue unless the user asks.
