# Integration occupancy — bundle-1051 / issue #1051

status: running-sink
candidate: 715c9f92ebcd660e5c600e7bf1e1e66b278100c9
branch: workflow/bundle-1051
command: node scripts/kaola-workflow-sink-merge.js --branch workflow/bundle-1051 --issue 1051 --issue-numbers 1051 --project bundle-1051 --sink --json
note: Sink may re-run producer tests after rebase. #1052 should not start competing full suites until sink completes and main has #1051.
