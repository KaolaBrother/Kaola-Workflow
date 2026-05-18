# Advisor Gate: issue-42 Ideation

## Verdict
Approach B confirmed. Do not switch.

## Items to Pin in Phase 3

1. **Reason-token mapping table (load-bearing)**: Issue lists four merge-impossible modes: branch protection, missing push permission, conflicts with target, non-fast-forwardable. Planner has three tokens. Phase 3 must record explicit mapping table: "conflicts with target" → `non_fast_forward` (since sink-merge is FF-only). If "conflicts with target" means divergent merge-base after rebase (with actual conflicts), that is user-correctable — not a pivot trigger. Document this distinction explicitly.

2. **git push --dry-run empirical verification (load-bearing)**: Verify that `git push --dry-run origin main` triggers GH006 from branch protection on this repo BEFORE finalizing Phase 3. If dry-run does NOT trigger protection, swap to post-failure-recovery-as-primary (`git reset --hard origin/main` after push failure). Do not commit to pre-flight as primary based on documentation alone.

3. **cmdSinkFallback field preservation**: "Atomically rewrites" must mean: reuses existing `updateSinkLease()` path; preserves `branch:`, `issue_number:`, `claimed_at:` in ## Sink; preserves entire ## Lease block. Phase 3 must make this explicit.

4. **Phase 6 wrapper post-pivot exit semantics**: If sink-pr.js fails AFTER pivot, wrapper does NOT retry; sink-pr.js exit code propagates as final Phase 6 exit. Must be specified in Phase 3 plan.

5. **Grep acceptance criterion timing**: `grep -r "workflow-next-pr" .` will match active `kaola-workflow/issue-42/` folder (phase1-research.md, etc.) until Phase 6 archives it. Phase 6 final-validation must run AFTER archive, OR exclude the active workflow folder in the grep command. Note this in Phase 3 validation plan.

6. **codex-parity/phase2-ideation.md status**: Check `kaola-workflow/codex-parity/workflow-state.md` before deciding annotate-vs-scrub. If in-flight: annotate with forward reference to issue-42. If released/archived: scrub.
