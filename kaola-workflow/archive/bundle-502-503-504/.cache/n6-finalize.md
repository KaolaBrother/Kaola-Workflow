evidence-binding: n6-finalize 7e9c45c2d493

Finalization (main-session-direct, non-delegable sink). Phase-6 readiness:
- All four test chains GREEN (claude/codex/gitlab/gitea) — cross-edition requirement #307 satisfied; chain-receipt recorded.
- Adaptive barrier gates all exit 0: resume-check, gate-verify, barrier-check, verdict-check.
- G1 code-reviewer (n4) verdict: pass, findings_blocking: 0 (R1 regression repaired + re-reviewed).
- Parallel-safety vs #500 confirmed: no write touches the adaptive-engine core.
Next: close node → allDone → sink-merge --sink from main root (FF-merge, push, close #502/#503/#504 all-or-nothing, archive).
