evidence-binding: n6-review 8e28a9237116
verdict: pass
findings_blocking: 0

finding: R1 | severity=low | action=note | status=noise | api.md receipt-schema example uses `exit` field name where the real receipt field is `exitCode`; pre-existing schematic representation (the field name predates #608), surrounding prose is accurate and the finalize gate is name-agnostic — out of scope, not a #607/#608 regression.
finding: R2 | severity=low | action=note | status=noise | gate-window fence default-ON means the write-lane hook now runs `git rev-parse` + a node manifest read on every Write/Edit in every session (previously exited early when KAOLA_LANE_CONTAINMENT was unset); this is the accepted, documented cost of default-ON (the fence is inert without an open gate), not a defect.

## Verdict

APPROVE — bundle-607-608 (#607 + #608). Zero CRITICAL/HIGH findings. Implementation is correct,
thoroughly tested (RED-first), byte-identical across all four editions, docs accurate to shipped
behavior, all acceptance criteria MET, and the four cross-edition chains are green over HEAD.

## Issue #608 — run-chains timeout observability + default recalibration

- [MET] AC1 Receipt per-chain entries carry `timed_out`; timeout vs genuine red distinguishable from
  the receipt alone. `chainResults.map` adds `timed_out: ch._timedOut === true`
  (`kaola-workflow-run-chains.js:608`); `_timedOut` is the FINAL attempt's marker (a timeout is
  non-retryable, `runChainWithRetry:225`), correct after a retry. Live proof: this run's receipt
  records `timed_out: false` on all four green chains.
- [MET] AC2 Failure summary + finalize `chains_red` hint name the timeout + the env-var remedy when
  timed out. `label()` in the stderr summary (`run-chains:642`) emits
  `<name> (TIMEOUT at <N>s — raise KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)`;
  plan-validator `chains_red` hint (`OPERATOR_HINT_REGISTRY.chains_red`) names the same remedy ONLY
  when a red chain actually timed out (`timedOutChains` filter), keeping the generic hint otherwise.
- [MET] AC3 Default budget 1800000ms; env override unchanged. `resolveTimeoutMs` returns 1800000
  (`run-chains:660`); invalid/zero/negative still fall back (T12).
- [MET] AC4 Guard tests cover both directions. `test-run-chains.js` 117→125 assertions: T24 (real
  hang-mock at a 600ms budget → `timed_out:true` + `exitCode:1` + TIMEOUT-labelled stderr naming the
  env var) and T25 (green chain → `timed_out:false`), plus T12 default/fallbacks. `test-run-chains.js`
  passes standalone (125 assertions, exit 0).
- [MET] AC5 Cross-edition: `run-chains.js` + `plan-validator.js` move together (root↔codex
  byte-identical; gitlab/gitea rename-normalized identical for run-chains, expected @generated/path
  diffs for plan-validator); four chains green run sequentially.

## Issue #607 — main-session-gate runtime write fence (3 layers)

- [MET] AC1 `open-next` + fused advance record an opened `main-session-gate` as `kind:'gate'`
  (`recordGateInRunningSet`, scoped to role main-session-gate, AFTER the ledger flip, id-keyed
  idempotent, preserves other members); close + reconcile remove/preserve correctly. Kind-consumer
  audit verified with NO false-fence or miscount: `liveHasWrite`/`selectSpeculativeWriteGroup` key on
  `kind==='write'` (a gate is invisible); `open-ready` slot base now `cap - liveNodes.filter(n =>
  n.kind !== 'gate').length`; `reconcile-running-set` roll-forward excludes `kind!=='gate'`. The
  serial-open close path (`close-and-open-next`) runs a halt-only guard (no scheduler/serial
  exclusion), so recording the gate does NOT false-fence its own close. Tests T607-L2a/b/c/d/e + KC1.
- [MET] AC2 Hook rule (c): in-worktree out-of-band Write/Edit denied (exit 2) during a gate window
  with a message naming the legal exits; workflow bands, `.kw/` band, member worktrees, co-open
  writer lanes, and out-of-repo paths allowed; DEFAULT-ON with `KAOLA_GATE_WINDOW_FENCE=0` opt-out;
  all #376 fail-open exits preserved when no gate is open (falls through to exit 0). Walkthrough
  matrix c1-c8b (default-on deny, opt-out, co-open lane allow, out-of-band-still-denied, `.kw`, bands,
  out-of-repo, no-gate-inert, no-manifest/malformed-stdin fail-open).
- [MET] AC3 Gate evidence requires column-0 `instrumentation: none | <node-id>`; close refuses on
  absence (alongside the missing-verdict check); a named node must exist in the ledger as a writer
  (non-empty declared write set). Scoped strictly to role main-session-gate. Tests T607-L3a-g; the
  ledger is threaded into all three close/verify callers (`ledgerNodes`).
- [MET] AC4 Planner surfaces mandate upstream provisioning + the durability decision; a
  main-session-gate node body never instructs authoring. Present in `agents/workflow-planner.md`, the
  3 `kaola-workflow-adapt` SKILLs, the codex planner `.toml` triple (parity token `the gate never
  authors or deletes files` in `test-agent-profile-parity.js`), and the 6 plan-run routing surfaces
  (PIN `gate-instrumentation-provisioning` + `KAOLA_GATE_WINDOW_FENCE=0`, enforced by
  route-reachability T15 + all edition contract validators).
- [MET] AC5 `finalize` sink writes + non-adaptive sessions unaffected (fence inert without an open
  gate — walkthrough c7/c8; finalize is not a gate role).
- [MET] AC6 Walkthrough exercises the hook with fabricated stdin + fixture manifests over the
  allow/deny matrix; the write-then-delete probe shape is refused at WRITE time (c1); evidence-token
  refusal covered (T607-L3a).
- [MET] AC7 Hook + adaptive-node propagate to gitlab/gitea (byte-identity verified); routing prose to
  all six surfaces; four chains green. (Codex `/hooks` re-trust on the hook content change is an
  operational finalize note.)

## Chain receipt (headSha-bound to HEAD)

headSha: b64a573438913f7b0ac6211c7f86ff67dbf0904a == `git rev-parse HEAD`  | source: npm-default
completedAt: 2026-07-03T12:45:18Z | KAOLA_RUN_CHAINS_CONCURRENCY=serial

  claude   exitCode=0  timed_out=false  duration_ms=841674  attempts=1
  codex    exitCode=0  timed_out=false  duration_ms=18080   attempts=1
  gitlab   exitCode=0  timed_out=false  duration_ms=220389  attempts=1
  gitea    exitCode=0  timed_out=false  duration_ms=223592  attempts=1

Overall: PASS (every chain exitCode 0, timed_out false). test-run-chains.js standalone: 125
assertions, exit 0.

## Review narrative

Reviewed the full diff `cfa910d9..HEAD` (three legs + synth merge + docs) across code, tests, docs,
and cross-edition parity.

Prose↔impl agreement on the shared token spec is tight and consistent across all surfaces: the env
var `KAOLA_GATE_WINDOW_FENCE=0` opt-out (default-ON) semantics, the running-set `kind: 'gate'`
channel, the evidence token `instrumentation: none | <node-id>`, and the refusal text naming the
legal exits (upstream writer node / route-findings / repair-node / write-halt --reason consent) all
tell the same story in the hook, adaptive-node, the six plan-run surfaces, the planner surfaces, and
the docs (api.md, workflow-state-contract, conventions, architecture INV-2 narrowing, .env.example,
README, ADR D-607-01).

Load-bearing correctness check — the kind-consumer audit: recording a `main-session-gate` into
running-set.json flips a gate window's coordination classification from serialLive to runningSetLive.
I traced every guard call site: the only mutating subcommands run during a gate window on the normal
flow are `close-and-open-next`/`close-node`, both of which run WITHOUT the scheduler/serial exclusion,
so closing the gate does not false-refuse. `open-ready` (excl serial) now proceeds during a gate
window instead of refusing serial — this is the intended #596 speculative-open-behind-a-gate
enablement, exercised green by T607-KC1 (both speculative reads open with the full cap, the gate does
not consume a slot). `open-next` (excl scheduler) would now correctly refuse a stray open during a
gate window (more correct, not a regression). No false-fence on any legitimate path; the #293
cross-consistency invariant is machine-tested and green in every chain.

Code quality is solid: `recordGateInRunningSet` is best-effort (never bricks a lifecycle open),
id-keyed idempotent, and preserves co-open members (concat-not-replace, KC1-verified). The evidence
regex is column-0 anchored and role-scoped. The hook composes rule (c) ahead of the lane arm with all
five carve-outs, `declSet` handles both array and string write-set forms. `_timedOut` promotion is
backward-compatible (absent ⇒ false) and the refuse/pass decision is byte-for-byte unchanged.

Two LOW noise notes recorded above (a pre-existing api.md `exit`-vs-`exitCode` schematic label; the
accepted default-ON hook cost) — neither is in scope or blocking.
