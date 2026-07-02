evidence-binding: n3-review 26c285a6dba1
## Code Review — issue #592 (sink-merge closure gate for no-primary bundles) — n3-review gate

### Scope reviewed
Full uncommitted diff: canonical scripts/kaola-workflow-sink-merge.js, codex twin plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, gitlab/gitea ports, three RED test files, and four docs surfaces (CHANGELOG, api.md, workflow-state-contract.md, new D-592-01.md).

### 1. Gate widening correctness — VERIFIED
Traced both invocation shapes against runSinkTransaction closure step (scripts/kaola-workflow-sink-merge.js:1171-1207):
- --issue-numbers 9601,9602 (no primary): gate true; primary close block skipped; bundle loop bound 2 > 0 true; both members close. Correct.
- --issue 588 --issue-numbers 588,591: gate true; primary 588 closes; bound 2 > 1 true; loop skips 588, closes 591. Identical to pre-fix.
- --issue-numbers 9601 (single, no primary): bound 1 > 0 true; closes 9601 — the exact previously-missed shape.
- No off-by-one: --issue 588 --issue-numbers 588 gives bound 1 > 1 false, no double-close of primary.
Label removal runs per-member inside the bundle loop (not skipped on no-primary path). Roadmap-source handling keyed on issueSet from issueNumbers (line 902-922), not args.issue. No args.issue null-deref on the sink path.

### 2. AC3 behavioral no-change — VERIFIED (one disclosed additive field)
For --issue N and --issue N --issue-numbers A,B: closed set, label removals, verdict, status identical to pre-fix. The one observable delta: receipt.closed_issues now recorded on the SUCCESS path — intentional, documented (ADR decision (a), api.md, CHANGELOG). No test asserts absence of closed_issues on a --sink success receipt; sink receipt not run through checkClosureInvariants; testSinkTransactionCleanEndToEnd stays green. Non-blocking.

### 3. Resume semantics — VERIFIED
On genuine close failure: receipt.closed_issues set (accurate partial set), receipt written, sink_incomplete emitted, returns WITHOUT stepDone('closure') — resume re-enters the step. closeOne probes each issue first (probeIssueClosed) so already-closed members bucket into closed without re-close: genuine verify-then-retry. closed_issues accurate on both paths. closure: done short-circuit only on full success — correct.

### 4. Fail-closed preservation — VERIFIED
sink_incomplete / step: closure / remote_issue_closed: partial refuse with exit 1 and no stepDone unchanged in all four editions, fires in both shapes whenever failed.length > 0.

### 5. Cross-edition fidelity — VERIFIED
cmp canonical vs codex twin: byte-identical. gitlab/gitea ports: same gate widening, same loop bound, same closed_issues success-path recording, same refuse — differ only by forge nouns. Ports fold !args.keepIssueOpen into the gate (pre-existing shape; equivalent because --keep-issue-open asserts args.issue != null, impossible on the no-primary shape). No semantic divergence.

### 6. Test quality — VERIFIED (genuine RED)
All three new tests drive the REAL --sink transaction end-to-end against a bare remote with a forge mock, assert close:9601/close:9602 actually invoked — pre-fix the close loop never runs so the tests fail on old code. Also assert receipt.steps.closure === 'done' and receipt.closed_issues contains both members; gitlab/gitea additionally assert status: sinked.

### 7. Contract needles — VERIFIED
--issue-numbers, isSinkMode, sink-receipt.json, sink_blocked all present in all four sink-merge editions.

### 8. Docs accuracy — VERIFIED
api.md § Closure Contract, workflow-state-contract.md, CHANGELOG, D-592-01.md accurately describe the widened gate, success/failure closed_issues recording, and the permanent-miss resume rationale. Provenance only in docs/CHANGELOG/ADR (correct home).

### Verification run (from worktree)
- node scripts/test-bundle-finalize.js -> all 118 tests passed (incl. #592)
- node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js -> PASSED
- node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js -> PASSED
- node scripts/simulate-workflow-walkthrough.js -> Workflow walkthrough simulation passed
- cmp canonical vs codex twin -> byte-identical

### Findings
- [noise] CHANGELOG phrase "behaviorally unchanged" refers to close behavior/verdict; success --sink receipt for primary shapes now additionally carries closed_issues — intentional, disclosed in the next CHANGELOG sentence and api.md, breaks no test/invariant. No action needed.

No BLOCKING, HIGH, MEDIUM, or LOW findings.

verdict: pass
findings_blocking: 0
