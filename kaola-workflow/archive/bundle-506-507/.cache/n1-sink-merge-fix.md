evidence-binding: n1-sink-merge-fix ff4ac1fab33a
<!-- RED: paste RED here -->
RED: testAssertWorktreeCleanFailsClosedOnListProbeFault — AssertionError: #506 refusal must name the unverifiable worktree-list cause (pre-impl: FORCE_WT_LIST_FAIL is a no-op, outer probe succeeds, no worktree-list refusal emitted in stderr; assert on stderr message fails, exit 1)
<!-- GREEN: paste GREEN here -->
GREEN: testAssertWorktreeCleanFailsClosedOnListProbeFault passes; 1/1 new #506 list-probe assertions green (+ full walkthrough simulation passed, gitlab/gitea sink parity tests passed)
