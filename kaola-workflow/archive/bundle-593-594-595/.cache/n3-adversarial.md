evidence-binding: n3-adversarial c691d13c8f87
## n3-adversarial — change-gate adversarial verification (opus, read-only)

Claim under test: the bundle's three fixes (#595 lock-orphan unlink, #594 dead batch_active guard removal, #593 exact-path co-open default-relax) are correct, complete, and regression-free.

### Attack results (all executed, not speculative)
(a) #593 unsafe co-open — WITHSTOOD. $TMPDIR fixture plans driven through --parallel-safe: NET-1 leg-scoped (gate covering only leg A refuses; non-code-reviewer gate refuses; gateUncovered targets role code-reviewer, plan-validator.js:2131). NET-2 PROTECTED via basename (package-lock.json) and path-marker (kaola-workflow/.roadmap/, archive/) refuse inside coarse overlap; control relaxes. Case-collision refuses kind:exact (classifier case-folds at classifier.js:515, never reaches coarse arm). Exact overlap refuses; writeOverlapRelaxable returns false for kind:'exact'.
(b) Resolvability fallback — WITHSTOOD. Glob, trailing-slash dir, and `crates/a/.` (normalizes to `crates/a/`) all refuse. `crates//a/z.rs` normalizes to a distinct concrete file -> correctly relaxes. `..` traversal green short-circuit is pre-existing and unchanged. Bare-existing-dir shape is rejected at freeze by the statSync bare-dir wall (plan-validator.js:1322-1326); even in a legacy path the per-leg exact-path barrier + merge barrier prevent silent clobber.
(c) Verdict purity — WITHSTOOD. writeOverlapRelaxable has exactly ONE callsite (plan-validator.js:2147); classifier.disjointWriteSets byte-unchanged (empty diff); freeze-time #232 antichain loop (:1614-1615), G-SEL-4 (:1550-1552), scanClaimedOverlap read only dj.verdict — freeze-time coarse behavior unchanged; walkthrough green.
(d) #595 no-takeover / orphan — WITHSTOOD. Runtime repros: contended EEXIST acquire preserves the foreign lock (no unlink); injected fsyncSync throw unlinks OUR lock and rethrows (no orphan); post-failure re-acquire succeeds. Unlink guarded by fd !== undefined, set only after openSync('wx') succeeds — can only remove the file THIS call created. Exit hook touches only _heldSchedulerLock (never set on the failure path). Schema byte-identical x4.
(e) #594 interleave / dangling — WITHSTOOD (one documented non-blocking residual). Zero writers of active-batch.json anywhere; removed excl:['batch'] arms and batch_active/active_batch_exists refusals were vacuously dead -> behavior-neutral removal. All four editions carry 0 batch-guard code refs. Residual: orient (adaptive-node.js:1338 +3 ports) still reads active-batch.json for the legality reconstruction — documented deliberate scope boundary (contract-bearing T20a, byte-identical for every producible state since the manifest is always null); non-blocking.
(f) Emission/envelope drift — WITHSTOOD. relaxed[kind]/overlapping[kind]/green short-circuit/too_few_nodes envelopes match pre-change semantics (pinned by re-pinned T463 floors + T546G2); writeOverlapRelaxable + hasUnresolvableEntry byte-identical across four editions; all nine changed ports pass node --check.

Suites executed green: test-commit-node.js (123), test-adaptive-node.js (1248), simulate-workflow-walkthrough.js (passed).

finding: id=R1 scope=needs_user_decision action=document status=deferred severity=low fix_role=none rationale=orient still reads active-batch.json (adaptive-node.js:1338 +3 ports) vs #594 AC "no active-batch.json in live scheduler code"; documented deliberate scope boundary, byte-identical for all producible states, non-blocking

NOT-REFUTED (confidence: high).

verdict: pass
findings_blocking: 0
