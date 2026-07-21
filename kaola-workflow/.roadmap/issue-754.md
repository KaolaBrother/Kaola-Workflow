issue: #754
title: bug(replan): snapshot manifest compares exact file mode, so any git round-trip permanently breaks epoch verification
status: ready — filed 2026-07-21; PRE-EXISTING, measured on the archived multi-epoch artifact and independently reproduced twice
workflow_project: —
next_step: verifySnapshotManifest compares the recorded mode against stat.mode & 0o777 while replan writes some files 0600 and git does not preserve it. Measured: epoch 1 has 1 mismatch, epoch 2 has 3, all want=600 got=644, EVERY content digest matching. Compare only bits that survive git (realistically the executable bit) or drop the mode comparison and state that snapshot integrity is content-addressed. Do NOT weaken the content digest — that is the load-bearing check. Higher impact since #724 added a fourth caller of the walk. Unblocks the #753 reproduction fixture.
