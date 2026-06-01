# Advisor — Closure Decision Gate (issue-211)

**Close #211 — clear call.** All 3 ACs pass with empirical evidence (RED both directions, clean-tree pass, full `npm test` green across 4 chains). Closing is the normal terminal event of this run, not a roadmap reorganization → within the `/goal`'s autonomy; no user pause needed.

**Do NOT auto-create a follow-up issue for the 3 LOWs.** Reasons: (1) all three are latent, no-current-trigger, and were consciously scoped out in Phase 2/3 with recorded reasoning; (2) creating a GitHub issue is an outward-facing action — "follow advisor's recommendation" resolves to "don't take one." They are durably recorded in `phase5-review.md` / `phase6-summary.md` Follow-Up sections (the right home). Surface them to the user in the final message so they can file if they want; do not decide it for them.

**Operational blind spot to close (determines whether the goal is met):** per memory [[feedback_sink_merge_issue_close_verify]], sink-merge's `gh issue close` can fail mid-merge — exit 0 on the merge but `remote_issue_closed:failed` in the receipt, leaving #211 OPEN. The goal is "finish the issue," so after Step 9:
- Parse the sink-merge closure receipt; confirm `remote_issue_closed` is success, not `failed`.
- If failed, run `gh issue close 211` manually before declaring done.
- Independently verify: `gh issue view 211 --json state` → expect `CLOSED`.

Nothing else blocks. Implementation, reviews, validation, docking are sound; staging is single-project; CHANGELOG [Unreleased] placement keeps the [3.17.2] assert green (re-verified). Proceed: finalize, commit, sink — then confirm the close landed.

## Decision applied (per /goal: follow advisor)
- Close #211 via sink-merge.
- No follow-up issue created; 3 LOWs recorded as follow-ups + surfaced to user.
- Post-sink: parse closure receipt + `gh issue view 211` to confirm CLOSED; manual `gh issue close 211` if needed.
