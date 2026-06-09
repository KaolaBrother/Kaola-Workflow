finalize node (DAG sink) bookkeeping — issue #328 multi-issue bundle lane
- CHANGELOG.md: added the #328 [Unreleased] -> Added entry (multi-issue bundle lane, all 4 editions).
- This is the DAG sink node; the actual merge/close/archive happens at /kaola-workflow-finalize (Completion).
- NOTE: one blocking review finding (CR1: forge claim.js finalization parity) remains; it is repaired via reopen-node forge-claim-ports at allDone BEFORE the actual sink/merge.
