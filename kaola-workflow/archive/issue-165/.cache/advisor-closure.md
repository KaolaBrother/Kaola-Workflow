# Advisor — Phase 6 Closure Decision Gate

Authorization: per active /goal ("finish all roadmap issues; follow advisor on human
decisions"), this advisor record + the goal hook is the durable authorization for
autonomous closure. Advisor: "Don't ask me again before closing."

## (1) #165 ready to close? YES
All AC met: dry-run JSON default ✓; --execute removes stale roadmap sources + regenerates
(test 9) ✓; --execute removes stale labels when online (test 9) ✓; dirty/ambiguous active
folders reported not deleted, remediation in api.md (test 10) ✓; offline audits local + marks
remote skipped (test 1) ✓; tests for the shipped edition ("where applicable" = GitHub-only
scope) ✓; documents difference from stale-worktree-check/cleanup (api.md table) ✓.

## (2) #161 ready to close after #165? YES
AC1 (contract doc) shipped in #161; AC2/AC3 (shared shape, finalize/sink-merge/watch mapped)
via #162/#163/#164; AC4 (follow-ups cover work) all closed/closing; AC5 ("existing stale closed
issues cleaned OR reported by the audit command") — audit REPORTS 18 stale labels → "reported"
satisfies the literal AC.

## (3) File gitlab/gitea port follow-ups? YES, but do NOT auto-run this session.
Filing gh issues does NOT add them to "the roadmap you're finishing now" — the roadmap is
kaola-workflow/.roadmap/issue-*.md (populated by phase-1 init-issue), not by gh issue create.
Single-issue completion contract + "separate roadmap session owns discovering future work" mean
new gh issues don't pull into the current goal cycle. After #165's .roadmap source is deleted
(Step 7), the goal evaluates against an empty roadmap → satisfied → hook unblocks. Decomposition
hygiene preserved without auto-extending the session.

## (4) Run --execute on the 18 stale labels? NO.
AC5 = "cleaned OR reported"; reporting suffices. Auto-cleaning 18 closed issues unrelated to
#165's deliverable is a bulk side-action for the maintainer to run deliberately (dogfoods the
dry-run discipline). Keep the dry-run output as evidence in the #161 closure comment.

## Sequence (Step 7+)
1. Phase 6 commit (script + plugin copy + COMMON_SCRIPTS + tests + docs + archive of issue-165
   folder + .roadmap/issue-165.md deletion + ROADMAP.md regen).
2. sink-merge → closes #165, deletes local branch. Parse closure_receipt; if remote_issue_closed
   != "closed", manual `gh issue close 165` (memory: sink-merge-issue-close-verify).
3. gh issue create x2 (GitLab port, Gitea port) linked to #161/#165.
4. gh issue close 161 with AC1-AC5 summary + dry-run evidence (18 labels reported) + links to
   #165 and the two port issues.

## Pre-sink verification (advisor)
worktree_path is empty (KAOLA_WORKTREE_NATIVE=0), so finalize runs from main root. Confirm
finalize archived kaola-workflow/issue-165 → kaola-workflow/archive/issue-165 BEFORE commit
(sink-merge refuses exit 1 if workflow-state.md still on branch HEAD). Check git status after.

## Non-blocking
LOW follow-ups (roadmap_sources_failed symmetry; pr_url/worktree_path hardening; it.number guard)
— note in closure comment or a single LOW issue. architecture.md no-impact is fine.
