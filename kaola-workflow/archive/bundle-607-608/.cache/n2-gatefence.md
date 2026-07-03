evidence-binding: n2-gatefence 18e88f0311ef
RED: T607-L3a checkEvidenceShape('main-session-gate',…'verdict: pass' w/o instrumentation) — AssertionError: gate evidence missing instrumentation token → not ok (got {}); plus T607-L2a gate recorded as kind:gate in running-set → null; T607-L2c/L2d fused-advance/close records/removes gate → null; T607-L3e/L3f named-node ledger-writer check → {"ok":true}. Baseline: `adaptive-node tests FAILED (9 failures, 1343 passed)` (pre-impl).
GREEN: `adaptive-node tests passed (1352 assertions)` (EXIT=0) — all T607-L2a/b/c/d/e + T607-KC1 + T607-L3a..g + updated T8g green; `Workflow walkthrough simulation passed` (EXIT=0, 0 FAIL) incl. the #607 gate-window hook matrix c1..c8b. 24/24 layers 2+3 gate assertions green.

## Kind-consumer audit — verdict: state channel is SAFE (state channel kept, NO ledger-parse fallback needed)

The `open-next`/fused-advance state channel records a `main-session-gate` into running-set.json as `kind:'gate'`, SCOPED strictly to role `main-session-gate` (a serially-opened code-reviewer gate stays OUT → byte-identical). Per-consumer evidence:

- **excl-scheduler guard** (`readCoordinationState` → `runningSetLive`/`serialLive`): a lone `kind:'gate'` entry flips `serialLive`→false, `runningSetLive`→true. Effect: (a) `close-and-open-next` (closes the gate) has NO excl-scheduler → unaffected (the dominant close path); (b) `open-ready` (excl:['serial']) now sees serialLive=FALSE → PASSES — this is precisely the mechanism the #596 carve-out relies on (speculative writes co-open behind the gate exactly as behind a code-reviewer gate opened by open-ready); (c) `open-next` (excl:['scheduler']) would refuse `scheduler_active` if invoked mid-gate, but in the healthy flow open-next is never called while a gate is open (the gate is run then closed via close-and-open-next) — the only reachable effect is a more-correct refusal on a buggy re-open. NO false-fence of a legitimate transition.
- **open-ready slot math** (`cap - liveNodes.length`): a gate would consume 1 read slot → benign under-count. FIXED: slot base now `cap - liveNodes.filter(n=>n.kind!=='gate').length` (T607-KC1 pins full-cap speculative fan-out behind a live gate: both reads open).
- **liveHasWrite** (`kind==='write'`): gate is 'gate' → excluded. No miscount. No change.
- **selectSpeculativeWriteGroup** (`liveWriteIds = filter kind==='write'`): gate excluded. No change.
- **speculativeCloseGuard / speculativeReviewOnGateClose** (filter `n.speculative`): gate not speculative → excluded. No change.
- **close/removal paths** (id-keyed `filter(n=>n.id!==nodeId)` in close-and-open-next / close-node / closeGroupMember): remove the gate by id regardless of kind (T607-L2d).
- **reconcile-running-set**: a lone live gate (in_progress, non-opening) hits the `not_opening` early-return → no-op (T607-L2e). `liveStable` roll-forward budget FIXED to exclude `kind:'gate'` so a crashed speculative-write reconcile behind a gate keeps the full write-cap budget.
- **next-action.js**: reads plan shape (ledger + depends_on) only, never running-set `kind` — no change (verified: no running-set read).

## Layer 3 "covers the instrumentation" interpretation (narrowed)

The `instrumentation: <node-id>` token carries only a node id (not probe paths), so "covers the instrumentation" cannot be mechanically resolved to specific paths. Enforced interpretation (recorded per the task): the named node must EXIST in the ledger AND be a WRITER (non-empty declared write set, via `isReadOnlyNode`). Skipped when `opts.ledgerNodes` is absent (the `--verify` preflight / legacy 3-arg callers keep the token-presence gate but not the deeper ledger check).

## What changed per file

- `scripts/kaola-workflow-adaptive-node.js` (canonical; codex byte-copy + gitlab/gitea ports regenerated via `edition-sync --write`):
  - `checkEvidenceShape` main-session-gate branch: require column-0 `instrumentation: none | <node-id>` (typed refusal `missingTokenClass:'instrumentation'`); named-node ledger-writer check (`instrumentation_node`).
  - Wired `ledgerNodes` into all 3 callers (runCloseAndOpenNext, runCloseNode, runVerifyEvidence).
  - New `recordGateInRunningSet` helper (id-keyed, best-effort, gate-scoped) wired into `runOpenNext` (post ledger-flip) and the `runCloseAndOpenNext` fused-advance.
  - Slot-math (`cap - non-gate live`) + reconcile `liveStable` exclude `kind:'gate'`.
- `hooks/kaola-workflow-write-lane.sh` (byte-identical ×4): rule (c) gate-window fence — DEFAULT-ON, `KAOLA_GATE_WINDOW_FENCE=0` opt-out; two-switch top gate (dormant only when BOTH off); carve-outs: workflow bands / `.kw/` band / member worktrees / co-open declared lanes / out-of-repo; refusal names the legal exits. All #376 fail-open exits preserved when no gate is open.
- `scripts/test-adaptive-node.js`: T607 cluster (L2a/b/c/d/e + KC1 + L3a..g); updated T8g fixtures with `instrumentation: none`.
- `scripts/simulate-workflow-walkthrough.js`: #607 gate-window hook matrix (c1..c8b) extending testWriteLaneHookGuard.

## Verification

- `node scripts/test-adaptive-node.js` → passed (1352 assertions), EXIT 0.
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, EXIT 0, 0 FAIL.
- `node scripts/validate-script-sync.js` → OK (24 common, 25 byte-identical groups, sync).
- `node scripts/edition-sync.js --check` → 10 forge aggregator ports in parity.
- hook byte-identity ×4: identical shasum `884edac6…` across hooks/ + all 3 plugin trees.
- Four-chain (all EXIT=0 on the re-synced tree, run serial): claude (full chain, 0 FAIL, walkthrough + active-folders-field-parity green) / codex / gitlab / gitea. Note: the EISDIR stack trace in the claude chain stderr is the INTENTIONAL `#588-TASKMIRROR-FAILOPEN` test (forces task-mirror EISDIR to assert fail-open) — not a failure.
- New env var `KAOLA_GATE_WINDOW_FENCE` (default-ON, `=0` opt-out) is NOT yet documented in .env.example / README env tables — flagged for the n5-docs node (out of this leg's write set).
