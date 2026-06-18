evidence-binding: n5-finalize 977eb73b0723

finalize: main-session-direct. The installed contractor still carries the #522 run-chains bug
(the very defect this issue fixes), and the finalize node is non-delegable — so the orchestrator
runs the mechanical finalize directly: commit impl, main-session run-chains (4-chain #307 gate +
chain-receipt at the impl commit), cmdFinalize --keep-worktree (the NEW fail-closed gate validates
the receipt → archives + commits), manual FF sink + close #522. This run dogfoods the fix:
cmdFinalize's own gate now guards #522's archive commit.
Doc impact: CHANGELOG [Unreleased] + docs/decisions/D-522-01.md (n4). DOCKED.
Run gaps: none beyond the run itself (no deferred reviewer findings; G1 verdict pass / 0 blocking).
