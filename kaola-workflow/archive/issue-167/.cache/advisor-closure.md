# advisor-closure — issue-167 (Closure Decision Gate, terminal issue)

## Verdict: close #167 on successful sink-merge; do NOT file a new issue for the lone INFO.
The isSafeName archive-loop note is the security reviewer's conditional non-finding ("only if a future change adds
delete/write keyed on archive subdir names") — not deferred work. Recorded in phase5-review.md + phase6-summary.md of
BOTH #166 and #167 (same disposition). A tracker issue would be a phantom-vulnerability follow-up with no actionable
trigger. (If ever hardened, it'd be ONE cross-edition issue spanning all three closure-audit scripts — only worth filing
if the hardening will actually be done soon.)

## Final sanity check
AC fully met (6 items incl. Gitea D2 lowercase-PR-state + D4 issue_iid). npm test PASS all four editions exit 0, no
regression. Code review APPROVE (0); security CLEAN (0 + 1 INFO). Contract validator passes with new script in both
arrays. sink: merge direct-to-main. Branch rebased onto fae0698 mid-Phase-2; final commit will be first on this branch.

## BLOCKING watch-item (carry-over from #166, memory: feedback_sink_merge_issue_close_verify)
EXPECT recurrence: sink-merge likely exits 0 but closure receipt shows remote_issue_closed: 'failed' (deterministic —
stale CWD after worktree cleanup, "not a git repository" stderr mid-merge; hit #166 exactly). After sink-merge exit 0,
PARSE the receipt; if remote_issue_closed: failed, manually `gh issue close 167` with the merge-commit comment.

## Pre-commit reminders
- Honor Staging Guard (only issue-167 project folder; PROJECT_COUNT=0 expected).
- Use `git commit -F /tmp/...` (HEREDOC tripped the shell parser on #166).
- After cmdFinalize, capture SINK_BRANCH/SINK_ISSUE/SINK_KIND first (state file moves to archive).
- After push, verify git status local on main in sync with origin/main.

## After #167 closes
Standing goal "finish all issues" satisfied (#166 + #167 closed; no other open issues). Stop hook auto-clears. Do NOT
auto-route. SEPARATELY worth filing (not part of goal, orchestrator's call): a new issue for the sink-merge gh-issue-close
failure mode — two consecutive reproductions (#166, #167) make it real deferred work with a clear actionable trigger
(stale CWD after worktree cleanup in sink-merge post-merge close step), unlike the INFO note.

## Disposition: proceed Step 7 roadmap → Step 8b cmdFinalize → Step 8 commit → Step 9 sink-merge → verify close.
