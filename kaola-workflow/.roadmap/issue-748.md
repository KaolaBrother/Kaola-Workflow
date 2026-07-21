issue: #748
title: bug(repair/replay): attempt-local replay exemption wedges multi-attempt journals mid-replay — prior consumed attempt at the same gate fails identity validation after the cone reset, replan escape unreachable
status: ready — filed 2026-07-21 (post-v6.24.0 audit; HIGH — reproduced regression in the released descendant replay, live in installed runtimes)
workflow_project: —
next_step: URGENT, before the control-plane bundle — journal-global exemption or fifth admission guard; pays the replay coverage debt (multi-attempt pin, post-replay run-to-green, walkthrough, decline reasons, budget)
