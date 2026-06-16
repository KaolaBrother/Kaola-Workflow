evidence-binding: n6-finalize b62b5fd570df

role: finalize (Phase-6 sink)
verdict: pass

## Phase-6 evidence
- All six nodes complete: n1 (#513 impl), n2 (#514 impl), n3 (#513 review pass/0), n4 (#514 review pass/0), n5 (docs), n6 (this).
- Cross-edition diff (#307) → all four chains green (sequential, from the worktree):
  - claude  exit=0 (~222s — under run-chains' 600s ceiling; #512 slow-chain did not bite)
  - codex   exit=0
  - gitlab  exit=0
  - gitea   exit=0
- finalization-summary.md written (Delivered / Files Changed / Run gaps / Closure Decision).
- Closure: CLOSE both #513 and #514 (all-or-nothing bundle). #513 scope (authoring rubric + worked example + parity needle) met; #514 both nits fixed.
- Safe-parallel fence held: no node touched any #512 file (run-chains.js, test-run-chains.js, simulate-workflow-walkthrough.js).

## Sink plan
cmdFinalize (archive + roadmap close of issue-513 + issue-514) → run-chains receipt over committed HEAD →
merge to main → close #513 + #514 → delete branch/worktree → regenerate ROADMAP once.
