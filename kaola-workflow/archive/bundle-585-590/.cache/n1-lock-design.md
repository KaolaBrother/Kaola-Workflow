evidence-binding: n1-lock-design be9697048080
Blueprint: scheduler mutual-exclusion lock (#585) + serial open-next baseline-first reorder (#590). All line refs re-verified against current code (issues' refs had drifted).

## Ground truth verified
- writeFileAtomicReplace adaptive-schema.js:670-693 — blind rename, no CAS (confirms #585 root cause). refuse() builder schema:834-836. O_EXCL precedent: roadmap.js:158-181 createFileExclusive (openSync 'wx', EEXIST→false).
- probeCoordination adaptive-node.js:3303-3325 / coordinationRefusal :3333-3366 / mutationGuardPrologue :3374-3428 — all advisory reads, no OS lock.
- runOpenNext :1682 — ledger flip write :1780 BEFORE baseline shell :1786 (confirms #590). runOpenReady safe order: opening rs-write :4123, baseline :4136, single plan write :4154, promote :4165. runCloseNode whole-plan rewrite :4378, rs update :4398-4408. reconcile :4697 iterates only running.nodes.
- SPLIT_GUARDED_SUBCOMMANDS :74-82 = the mutating set; does NOT contain record-evidence. main() :5149; project paths :5237-5241; split guard ends :5303; dispatch `let result;` :5304; decorateOperatorHint :5453; OPERATOR_HINT_REGISTRY :94-258.
- #590 close dead-end reason is validator's `no_barrier_base` (plan-validator.js:2332) surfaced via barrierCheck.reason at runCloseNode ~:4348 — NOT commit-node's baseline_missing (commit-node.js:52,183 is the --start path). adaptive-node registry has no no_barrier_base entry → generic hint fallback today.
- `.cache/scheduler.lock` is barrier-exempt (plan-validator.js:305,312-314 kaola-workflow/ prefix) — a held lock cannot trip the write-set barrier.
- Test harnesses: rsHarness test-adaptive-node.js:3226 = in-memory direct calls of run* (never enters main()); makeLaneRepo :5182 + runNode :5231 = real $TMPDIR git repo + real execFileSync subprocess through main(); two-process precedent = walkthrough runNodeAsync :68 + testRoadmapInitIssueConcurrentExclusive :1020 (Promise.all, durable end-state assertions). Current suite: 1078 assertions.
- Sync model: adaptive-node = GENERATED_AGGREGATOR; adaptive-schema = byte-identical ×4 with canonical filename in every edition; commit-node = COMMON+generated. LANE_STALENESS_MS=86400000 schema:210.

## Decisions
D1 — Lock at the main() CLI boundary, never inside run* bodies (rsHarness stays lock-free/in-memory). Acquire after the worktree-split guard (:5303), before `let result;` (:5304); wrap dispatch+decorate+emit in try/finally release. Lock wraps the whole subcommand incl. mutationGuardPrologue.
D2 — Lock exactly SPLIT_GUARDED_SUBCOMMANDS.has(subcommand). Do NOT lock record-evidence (writes only per-node .cache evidence, no plan/rs RMW), orient, mirror-project, --verify.
D3 — Lock helpers live in adaptive-schema.js (byte-identical ×4, co-located with writeFileAtomicReplace ~:693): acquireProjectLock(lockPath,{subcommand}), isStaleLock(holder), releaseProjectLock(lockPath), SCHEDULER_LOCK_NAME='scheduler.lock' (next to RUNNING_SET_NAME :193); module-level heldLock + one-time process.on('exit') unlink. Refusal vocabulary (scheduler_locked + operator_hint) in adaptive-node OPERATOR_HINT_REGISTRY (~:108 beside coordination reasons).
D4 — Typed non-blocking refusal (refuse('scheduler_locked',{holder,lockPath}), exit 1). No spin-wait/queue — one serial orchestrator is the designed model.
D5 — Staleness: same-host dead-PID probe (process.kill(pid,0) ESRCH→stale; alive/EPERM→refuse); cross-host or corrupt/pidless payload → age > LANE_STALENESS_MS. Payload {pid, host:os.hostname(), ts, subcommand}.
D6 — #590 reorder baseline-first (mirror openReady Phase2→3). Optional defense-in-depth: add no_barrier_base registry entry naming the idempotent open-next re-invoke.

## Lock contract
acquire: openSync('wx') → success: write JSON payload, fsync, close, heldLock=path, return {ok:true,release}. EEXIST: read+parse holder; if isStaleLock: RE-READ to confirm payload still the stale one (guards unlink-fresh-lock race), unlink, retry 'wx' ONCE (success→{ok:true,tookOver:true}; EEXIST→{ok:false,holder} — lost takeover race → refuse). Alive holder → {ok:false,holder}. Single-takeover-then-refuse, never loop-unlink; worst case spurious refuse (safe), never double-acquire. release: unlinkSync (swallow ENOENT), clear heldLock. exit hook unlinks heldLock.

## #590 exact reorder in runOpenNext (after targetNode finalized :1760/1764)
1. commit-node --start (+baselineOk check → refuse baseline_failed) [moved up from :1785-1796]
2. readFile plan → spliceLedgerNode in_progress allowFrom:['pending'] → writeFile [was :1767-1783]
3. appendNodeTiming/openNonce/appendProvenanceLog/seedEvidenceFile unchanged (baselineResult still in scope).
Crash analysis: crash between 1-2 → ledger pending + orphan baseline (harmless; re-record idempotent). Crash after 2 → normal close. Baseline fails → ledger never flipped (today it strands in_progress+no-baseline).

## Files
- adaptive-schema.js (canonical): new lock helpers + SCHEDULER_LOCK_NAME + exports.
- adaptive-node.js (canonical): main() lock acquire/finally-release for SPLIT_GUARDED; scheduler_locked registry entry; extended require from schema; #590 reorder; optional no_barrier_base entry.
- commit-node.js: NO change expected (hedge only).
- Ports: regenerate via npm run sync:editions — never hand-edit.
- test-adaptive-node.js: new tests below; do not renumber existing.
- Docs/CHANGELOG: n4-docs/finalize nodes own them; write chain-asserted docs BEFORE final chains.

## Test plan
#590 (rsHarness direct-call, model on :562/626/674): T-590-order — shellStub: resume-check ok, next-action ready node, commit-node --start → refuse. Track sawWrite in writeFile stub; assert baseline invoked with sawWrite===false AND envelope baseline_failed AND ledger still pending. RED today (flip precedes failing baseline); GREEN after.
#585 deterministic (makeLaneRepo+runNode, no real concurrency): T-585-live-refuse — pre-write lock {pid:process.pid live, host, ts:now}; open-ready → reason scheduler_locked, exit 1, lock present, ledger unchanged. RED today. T-585-stale-takeover — lock with dead pid 2147483646 → open-ready succeeds, lock removed after; + age-based twin (old ts) for cross-host fallback. T-585-release — serial open-ready leaves no scheduler.lock.
#585 genuine two-process race: raceTwo helper in test-adaptive-node.js — spawnSync(node -e ORCH) where ORCH Promise.all-spawns two real CLI subprocesses, returns both {code,stdout} as JSON; parent parses (genuine concurrency inside, sync join outside). ≤10-trial loop asserting durable invariants every trial. T-585-open-ready×2: 2-node ready read frontier cap≥2; exactly one non-empty open; invariant set(ledger in_progress)===set(running-set nodes). RED today (both open from rs=null). T-585-close-node×2: co-open lane group A,B in_progress + evidence via writeEvidence :5262; invariant completeMembersInLedger >= #(result:ok). RED today (second :4378 rewrite clobbers first flip → 1 complete for 2 oks). GREEN: one ok one scheduler_locked; serial retry → both complete. Alternative home: walkthrough runNodeAsync pattern; keep unit+#590 tests in test-adaptive-node.js regardless. RED-first: write tests, confirm RED pre-change (stash impl), then GREEN.

## Serial-path-unchanged proof
All 1078 existing assertions (rsHarness never enters main(); real-subprocess suites acquire cleanly with zero contention → byte-identical behavior — they ARE the serial lock regression proof). test-commit-node/test-next-action/test-adaptive-handoff unaffected. Walkthrough serial → clean acquire/release. #307: all four chains green mandatory (schema ×4 + generated adaptive-node ×4); KAOLA_RUN_CHAINS_CONCURRENCY=serial on this box.

## Do NOT touch
rsHarness internals; run* bodies (no fs lock I/O inside); mutationGuardPrologue/probeCoordination/coordinationRefusal logic; two-phase open-ready protocol; reconcile roll-forward/back; lane-group/leg machinery; writeFileAtomicReplace rename (lock chosen over per-file CAS — issue option (a)); record-evidence/orient/mirror-project stay lock-free; commit-node baseline_missing + validator no_barrier_base emits (only optionally ADD an adaptive-node registry entry); edition ports (regenerate only).
