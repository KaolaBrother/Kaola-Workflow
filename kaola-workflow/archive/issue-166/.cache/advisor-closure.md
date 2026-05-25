# advisor-closure — issue-166 (Closure Decision Gate)

## Verdict: close #166 on successful sink-merge; do NOT create follow-up issues for the two recorded LOWs.

- LOW #1 (unused parity `assert`, closure-audit.js:44): intentional GitHub-parity structure — filing would be filing against parity itself. If the parity convention is ever revisited, that's a cross-edition cleanup spanning both scripts, a different work item. Recording in phase5-review.md is correct.
- LOW #2 (isSafeName at archive loop 83-87): the security reviewer's own informational "not a finding" note, conditional on a future change that doesn't exist (delete/write keyed on archive subdir names). The code that introduces such a sink should add the guard then. Recorded in phase5-review.md + phase6-summary.md — correct disposition; a new issue would be a phantom-vulnerability follow-up.

The Closure Decision Gate is for deferred work someone owes. Two informational notes already recorded are context for future readers, not deferred work.

## Final sanity check before sink-merge
- Single-issue contract: this run finishes #166; Stop hook re-fires for #167.
- AC fully met (6 items verified). npm test PASS all four editions, exit 0, no regression.
- Code review APPROVE; security review CLEAN. No CRITICAL/HIGH.
- sink: merge — direct-to-main, matches recent repo commits. Branch ahead 0 / behind 0 of origin/main at startup.

## Pre-commit: honor the Staging Guard (Step 8) — only the issue-166 project folder (+ .roadmap/issue-166.md until Step 7 deletes it, then ROADMAP.md). One active project → passes trivially; cheap insurance.

## BLOCKING watch-item during sink-merge (memory: feedback_sink_merge_issue_close_verify)
After sink-merge exit 0, parse the closure receipt: `gh issue-close` can fail mid-merge with `remote_issue_closed: 'failed'` while the script still exits 0, leaving #166 OPEN. If so, manually `gh issue close 166` and confirm. Do not skip this verification.

## Disposition: proceed Step 8b cmdFinalize → Step 8 commit → Step 9 sink-merge.
