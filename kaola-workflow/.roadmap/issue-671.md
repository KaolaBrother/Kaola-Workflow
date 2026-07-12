issue: #671
title: fix(scripts): task-mirror refreshTaskMirror fail-opens with a raw EISDIR stack trace on a workflow-tasks.json dir collision
status: open
workflow_project: —
next_step: Surfaced by the bundle-664-665 review (R4). test-adaptive-node.js's #437-lane fixture (workflow-tasks.json collides with a directory) drives refreshTaskMirror (task-mirror.js:~143) to throw EISDIR, caught by the deliberate fail-open contract — suite exits 0 but 4 raw EISDIR stack traces print to stderr. Pre-existing (task-mirror.js not in the bundle diff). The fail-open is by design, but (a) the raw stack trace is noise that can mask real failures, and (b) a production EISDIR on the tasks path silently skips the mirror. Fix (S, low): catch EISDIR/collision explicitly, emit a one-line warning instead of a stack trace, keep the fail-open; add a regression asserting no stack-trace output on the collision path. Full body on GitHub #671.
