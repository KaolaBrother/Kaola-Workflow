issue: #635
title: test(run-chains): signal-death assertions (T20-T28) are load-sensitive flakes — block literal four-chain-green recording under load
status: open
workflow_project: —
next_step: P2: make the signal-death assertions deterministic (inject the terminating signal via the runner's stub/mock seam, or assert killed-by-signal class not exact SIGKILL where the harness can't guarantee which signal wins under load)
