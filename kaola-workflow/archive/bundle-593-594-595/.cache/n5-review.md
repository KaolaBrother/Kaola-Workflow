evidence-binding: n5-review 9215ae7cb1e8
## n5-review — G1 code-reviewer gate (opus, read-only) over n1/n2/n4

### Verification runs (worktree)
- test-adaptive-node.js -> exit 0, 1248 assertions; test-commit-node.js -> 123; simulate-workflow-walkthrough.js -> passed; test-route-reachability.js -> 185; all four contract validators pass; edition-sync --check 10 ports in parity; validate-script-sync 24 common scripts in sync; cmp schema anchor byte-identical x4.

### #595 — correct
Unlink only inside the fd !== undefined branch (acquireProjectLock, schema L791-802); fd set exclusively by this call's own openSync('wx'), reset only after full write+fsync+close success -> unlink can only remove the file THIS call created. EEXIST classification path untouched. No remaining orphan window. T-595-orphan is a genuine fault-injection RED test. Byte-identity x4 confirmed.

### #594 — complete
Removed across all four editions: probeCoordination active-batch.json read; readCoordinationState batch fields + serialLive/collisions use; coordinationRefusal batch_active arm (+batchState from every refusal payload); 'batch' from all three excl arrays; batch_active + active_batch_exists hints; batch arms in runReopenNode/runRepairNode. Grep across scripts/ + 3 plugin trees: only remaining tokens are explanatory comments; only remaining LIVE active-batch.json reference is orient's read-only legality reconstruction (L1338). Fixture updates justified. serial_node_live/scheduler_active payloads no longer carry batchState (0 code refs).

### #593 — correct (high-risk area cleared)
Coarse arm default-relax under the SAME retained net as shared-infra: NET-1 gatePresent = leg-scoped gateUncovered(role code-reviewer, --nodes set), NET-2 no PROTECTED file; hasUnresolvableEntry (trailing / or *?[]{}) keeps the coarse refusal when disjointness unprovable. No exact overlap can reach relax: same-string overlap caught at the callsite (L2143-2144) pre-predicate; case-collision caught by classifier case-fold -> kind:'exact' -> predicate final return false. Classifier diff EMPTY (verdict purity). Consent/policy vestigial-but-parsed; exact policy value still freeze-refused (L1191-1193). T463 re-pins protective (assert relaxed[kind:'coarse'] + byte-equal emission with/without consent). AC1 real-git co-open lifecycle test verified end-to-end (legs -> per-leg barriers -> octopus -> union barrier -> ls-tree). AC2/3/4/6 covered. Forge ports carry same semantics.

### Docs / CHANGELOG — accurate
Six routing surfaces in lockstep, stale consent claim gone x6, PIN needles preserved; api.md matches code envelopes; architecture/conventions/frontier-card/workflow-state-contract accurate; CHANGELOG #594 Removed / #595 Fixed / #593 Changed, each citing its ADR; D-593-01/D-594-01/D-595-01 structured.

### Findings
- [LOW] R1 — orient's retained read-only active-batch.json legality read (adaptive-node.js:1338 +3 ports) vs #594 AC's broad wording; deliberate documented scope boundary, behavior-neutral (manifest always null), contract-bearing (T20a). Concur with adversarial gate: non-blocking.

No BLOCKING, HIGH, or MEDIUM findings.

finding: id=R1 scope=needs_user_decision action=document status=deferred severity=low fix_role=none rationale=orient retains a read-only active-batch.json legality read (adaptive-node.js:1338 +3 ports) vs #594 AC broad wording; documented deliberate scope boundary, behavior-neutral (manifest always null), non-blocking

verdict: pass
findings_blocking: 0
