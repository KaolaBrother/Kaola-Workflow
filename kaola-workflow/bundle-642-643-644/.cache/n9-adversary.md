evidence-binding: n9-adversary d30b9ba5710a
verdict: pass
findings_blocking: 0
upstream_read: n7-cr-engine 39d0b80762bc

finding: id=R3 scope=in_scope action=document status=open severity=low fix_role=none rationale=fused-advance gate hold is order-independent in EFFECT (closed-only, writer stays pending, both orders proven real-CLI) but the typed gate_live reason surfaces only when next-action picks a PENDING writer — in gate-row-first order the pre-existing in_progress-dedup branch returns closed-only with NO reason field; the new test pins both orders via a next-action STUB that always returns the pending writer, so the "typed reason in both orders" prose overstates the end-to-end envelope — telemetry/doc nuance only, no safety gap, no fix required

# n9-adversary — RE-VERIFICATION after the three in-run engine repairs (fresh nonce d30b9ba5710a)

## Claim Under Test
"The three in-run engine repairs — (1) the fused-advance gate-window hold in `runCloseAndOpenNext`, (2) the `brief_duplicate_node` freeze refusal, (3) the n/a carve-out (previously verified) — are correct, complete, and regression-free," executed against the worktree scripts, never the installed copies.

## Disproof Attempt

### 1. Prior counterexample (fused-advance gate bypass) — NOW DEAD, both table orders
Re-ran the exact kw6/kw7 repro in fresh sandboxes (kw6b/kw7b: freeze → probe close → `open-next wa` → `open-next g1` (gate live, `kind:'gate'` in running-set.json) → record wa → `close-and-open-next wa`):
- writer-row-first (the prior bypass order): now `{result: ok, closed: wa, opened: null, reason: 'gate_live', liveGates: ['g1']}` — wb stays `pending`. The bypass that previously opened wb in_progress inside the gate window is gone.
- gate-row-first: `{result: ok, closed: wa, opened: null}` — wb stays `pending` — via the pre-existing in_progress-dedup branch (real next-action surfaces the in_progress gate as `readySet[0]`), so NO `reason: gate_live` / `liveGates` on the envelope. Safe outcome, untyped telemetry (finding R3 above; the new check at adaptive-node.js:2837-2845 fires end-to-end exactly in the dangerous configuration — a pending writer surfaced as the advance target).
- Drain / no deadlock: recorded g1's verdict evidence and closed it, after which orient surfaces wb and it opens normally.

### 2. Gate self-close — NO self-hold, confirmed
`close-and-open-next g1` (the gate closing ITSELF, with wb pending next): `{result: ok, closed: g1, opened: wb}` — the post-removal re-read works, the running set emptied, wb flipped in_progress, orient consistent. The hold cannot deadlock the drain: the gate's own fused close IS the drain and immediately opens the held writer.

### 3. brief_duplicate_node — CONFIRMED with controls
Two `### design` blocks → `refuse` / `brief_duplicate_node` with the typed operator hint. Controls: single brief → in-grammar; a FENCED pseudo-duplicate (fenced `### design` inside the brief body) → in-grammar (fence-awareness preserved in the dup scan — the round-1 attack re-applied to the new wall).

### 4. Regression sweep — GREEN
- `node scripts/test-adaptive-node.js` → exit 0, `adaptive-node tests passed (1610 assertions)` (1598 + the 12 new fused-gate pins).
- Fresh consumed-proof sandbox (kw10): open envelope carries ONLY the node's own nonce; fused-advance envelope has zero occurrences of the upstream nonce; wrong-nonce echo → `upstream_not_consumed` refuse, exit 1, plan byte-identical; correct line-1 echo → close ok, advanced. Fabrication resistance unregressed.

### 5. New-line attacks
- liveGates leak: the `gate_live` envelope contains no 12-hex token at all (regex sweep) — `liveGates` is ids-only. No nonce channel opened.
- Hold placement: `enterBatch` (≥2 pending writers + live gate) returns a frontier without opening and the subsequent `open-ready` holds `gate_live` (proven round 1); `frontier_blocked` path opens nothing. No route around the hold found.
- Corrupt running-set.json at the advance → `readRunningSet` null → no hold: pre-existing fail-soft posture shared by every running-set consumer (reconcile owns repair) — not a new hole.
- Edition parity: both codex twins byte-identical (cmp); gitlab/gitea ports carry the GATE-WINDOW HOLD and `brief_duplicate_node`; `edition-sync.js --check` exit 0.
- Test-vacuity probe: the both-orders `gate_live` assertion holds under the stubbed next-action (always returns pending wb); recorded as R3 (document-only). The controls (no gate ⇒ wb opens, ledger flips) are genuine and match the real-CLI control.

## Verdict
NOT-REFUTED (confidence: high). The fix kills the demonstrated bypass in both table orders with zero open mutation, the gate self-close drains cleanly with no deadlock, the dup-brief wall refuses with correct fence-aware controls, the suite is 1610-green with fabrication resistance intact, and the new envelope leaks nothing. The single residual (R3) is a telemetry/doc nuance on which safe closed-only shape is returned in gate-first order — no safety gap, no fix required, recorded for the record.
