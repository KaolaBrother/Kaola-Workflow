evidence-binding: n4-adversary 8f28af7dbd68
verdict: pass
findings_blocking: 0
instrumentation: none

finding: N1 | severity=low | action=note | status=noise | inWorkflowBand allows ANY path containing /.cache/ (pre-existing #376 band semantics) so a product write into an arbitrary .cache/ dir escapes the gate fence — non-functional for the observed Rust-probe use case (Cargo won't compile .cache/); not a #607 regression.
finding: N2 | severity=low | action=note | status=noise | Sticky-fence-after-crash: a crash mid-main-session-gate leaves a kind:'gate' entry that reconcile no-ops on (does not clear), so ALL in-worktree product writes are fenced repo-wide until the run resumes+closes the gate or KAOLA_GATE_WINDOW_FENCE=0 / manual manifest delete. Intended fail-closed tripwire (issue lists crash residue as motivation) and opt-out-able; worth a line in the n5-docs env-var doc.
finding: N3 | severity=low | action=note | status=noise | An independent non-speculative writer co-ready with a live main-session-gate now returns write_awaits_drain (delayed) instead of co-opening, because open-ready ~L4214 `liveNodes.length===0` is now false with the gate present. Pure makespan effect in a narrow/unreachable DAG shape (orchestrator drives the gate to completion serially); no correctness impact; #596 speculative path (~L4186) unaffected.
finding: N4 | severity=low | action=note | status=noise | Layer 3 `instrumentation: <node-id>` narrowing enforces only "named node is a writer," not "declared set covers the probe path" — weaker than the literal AC wording but disclosed in the issue's honest-layering section (token carries no paths). Acceptable given the token design.

## Claim Under Test

"n2-gatefence's change is correct, complete, and regression-free for issue #607 layers 2+3 — the main-session-gate runtime write fence (Layer 2 runtime gate-window fence: open-next/fused-advance record an opened main-session-gate into running-set.json as kind:'gate', and hook rule (c) in kaola-workflow-write-lane.sh denies in-worktree out-of-band Write/Edit during the gate window; Layer 3 close-time instrumentation: evidence token)."

## Disproof Attempt

Attacked all six assigned surfaces with execution, not inspection. Sandbox: a real git repo under /private/tmp/claude-501/.../scratchpad/sbx with fabricated kaola-workflow/proj/.cache/running-set.json manifests; old hook extracted from cfa910d9 for byte-diff.

1. Fence bypass (writes that SHOULD deny): during a lone-gate window the probe write crates/cadcore-verify/tests/probe_gpu_gate.rs and the Cargo.toml dev-dep edit both DENY (exit 2) — the exact observed bug shape, refused at write time before any delete. `..`-paths normalize back inside and DENY; band-prefix lookalikes (kaola-workflow-evil/, kaola-workflowX/) correctly DENY (regex requires the trailing slash); case tricks (Crates/…) resolve in the safe deny direction; symlink escape/re-entry resolves via realpath (into-tree DENIES, out-of-tree ALLOWS). No functional bypass found (the .cache-anywhere carve-out is pre-existing #376 behavior, N1).

2. False-fence (writes that MUST allow): workflow bands (kaola-workflow/, any .cache/), the .kw/ band, member worktrees (via worktreePath), co-open writer declared lanes, out-of-repo scratch, and KAOLA_GATE_WINDOW_FENCE=0|false|no opt-out all ALLOW (exit 0). Garbage opt-out values (=maybe, =2) correctly keep the fence ON. #596 speculative-write path unaffected: open-ready ~L4186 (openingSpeculative) bypasses the liveNodes.length===0 gate, and T607-KC1 (green, non-vacuous) shows both speculative reads open at full cap behind a live gate.

3. Fail-open preservation: byte-for-byte match NEW vs OLD hook (exit 0 for all) across no-manifest, non-gate manifest, empty stdin, unparseable stdin, missing file_path, non-git cwd. Lane arm (rules a/b) under KAOLA_LANE_CONTAINMENT=1 is byte-identical: member-worktree deny/allow, #386 write self-exempt, #320 read-lane leak deny. Rule (c) evaluated first is a clean no-op when gateOpen is false.

4. Kind-consumer audit: verified against code — close-and-open-next guard prologue (~L2101) intentionally omits excl-scheduler so runningSetLive (now true during a gate window) does NOT fence the gate's own close; open-ready slot base and reconcile liveStable both exclude kind:'gate'; liveHasWrite/selectSpeculativeWriteGroup key on kind==='write'; close/removal is id-keyed; reconcile no-ops (not_opening) on a lone gate and PRESERVES it; orient classifies a lone gate as a valid running-set (runningSetEquals, not orphan_multi_in_progress). Crash-during-gate → reconcile preserves → resume closes via close-and-open-next (not fenced). main() wiring passes mkdirp+now to both open-next and fused-advance gate writes; cacheExists is in scope and readRunningSet tolerates undefined. The serialLive→false / runningSetLive→true flip has no consumer that breaks (N3 is the only behavioral delta, non-blocking/unreachable).

5. Layer 3 token: direct 14-case matrix — missing token refuses with/without ledger; none (with/without space/tab) passes; named writer passes; named non-existent and named read-only (incl. the gate itself) refuse with instrumentation_node; ledger-absent skips only the deep check (presence still fires); regex is column-0 strict (indented / trailing-commentary / mid-line prose all refuse). Scoped strictly under role==='main-session-gate' — a code-reviewer gate does not inherit the requirement. All three real close paths (close-and-open-next, close-node, verify) pass ledgerNodes, so the skip-hole only touches the --verify preflight (N4 narrowing disclosed).

6. Cross-edition: hook byte-identical ×4 (884edac6…); all three adaptive-node ports carry the #607 markers; codex byte-copy line-map identical; validate-script-sync.js and edition-sync.js --check both green.

Self-verify executed: node scripts/test-adaptive-node.js → 1352 assertions, exit 0; node scripts/simulate-workflow-walkthrough.js → passed, exit 0. The walkthrough #607 matrix (c1..c8b) is non-vacuous — c1/c3b assert deny and the opt-out flips them to allow, proving discriminating power. I did not run the codex/gitlab/gitea chains (change-gate/finalize obligation), but confirmed byte-parity of the ports so an edition-specific divergence is structurally precluded.

## Verdict

NOT-REFUTED (confidence: high) — a strong, execution-based search across fence bypass, false-fence, fail-open preservation, the kind-consumer audit, the Layer 3 token, and cross-edition parity produced no counterexample; the four residual observations are disclosed design tradeoffs or unreachable/non-correctness effects, none blocking.
