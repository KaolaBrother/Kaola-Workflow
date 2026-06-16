# Final Validation — bundle-496-497

## Adaptive barrier (script-enforced, #231)
- `--resume-check`  → exit 0 (plan_hash integrity, structure, closed library)
- `--gate-verify`   → exit 0 (every code node post-dominated by a completed reviewer)
- `--barrier-check` → exit 0 (no unreviewed sensitive write, no out-of-lane production write)
- `--verdict-check` → exit 0 (every gate-role node recorded verdict:pass / findings_blocking:0)

## Four-chain validation (#307) — independently re-run by the orchestrator
verdict: pass
```
validate-script-sync: OK (canonical↔codex byte-identical)
test:kaola-workflow:claude  → exit 0  (Workflow walkthrough simulation passed)
test:kaola-workflow:codex   → exit 0  (Kaola-Workflow walkthrough simulation passed)
test:kaola-workflow:gitlab  → exit 0  (GitLab Codex workflow walkthrough simulation passed)
test:kaola-workflow:gitea   → exit 0  (Gitea Codex workflow walkthrough simulation passed)
test-route-reachability.js  → exit 0  (62 assertions, incl. T6 closure-audit pin ×6 surfaces)
validate-workflow-contracts / validate-kaola-workflow-contracts → exit 0
```

## Reuse boundary (#324 AC3)
The four-chain + route-reachability runs above cover code/test/prose impact through node n4
(n1 sink-merge fix, n2 closure-audit wiring, n4 docs). The n5 finalize-node touches are
archive/roadmap bookkeeping + this evidence — outside the rerun trigger (no code/behavior change).
