evidence-binding: n7-finalize f2bb81e4aecc

compliance: main-session-direct
verdict: pass
findings_blocking: 0

Finalize sink bookkeeping (main-session-direct per plan-run contract):
- Adaptive barriers: resume=0 gate=0 barrier=0 verdict=0 (script-enforced, exit codes captured directly).
- Chain receipt verified HEAD-bound (b64a5734), 4/4 green, timed_out false ×4 (recorded by n6-review).
- Gap sweep: generated then --check pass (sweptClasses []).
- Opencode: sync --check parity; suite 499 green.
- doc-docking: DOCKED (.cache/doc-docking.md).
- finalization-summary.md written; closure decision: none needed.
- Mechanical finalize delegated to contractor; sink: merge --sink with --issue 607 --issue-numbers 607,608 (bundle all_or_nothing).
