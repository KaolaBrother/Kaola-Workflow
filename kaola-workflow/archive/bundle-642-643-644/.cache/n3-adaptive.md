evidence-binding: n3-adaptive a3878b70de9c

# n3-adaptive — REPAIR 2 (adversary finding, operator-mandated): fused-advance gate-window hold

Reopen scope: the adversarial verifier EXECUTED an end-to-end bypass of the gate-window invariant —
the FUSED ADVANCE in close-and-open-next had no live-gate check. With a main-session-gate live in
the running set (kind:'gate'), closing a serial writer via close-and-open-next opened the next
pending writer in_progress WHILE the gate was live (table-order-dependent). The other two open
doors were already fenced (open-next: scheduler_active; open-ready: gate_live — my earlier work);
only the fused advance was blind. This reopen adds ONLY the fused-advance hold + its pins.

I re-read both upstream evidence files this open and echo their CURRENT line-1 nonces
(n2's evidence was re-recorded under a NEW nonce during its own repair — verified by reading line 1):

upstream_read: n1-architect 416c5fde30b3
upstream_read: n2-validator 4e6f3bce0f6b

## RED → GREEN (failing-test-first, this repair)

RED: node scripts/test-adaptive-node.js — 6 failures, 1604 passed (pre-hold). Signatures (BOTH table orders — the bypass demonstrated open in both): "FUSED-GATE-HOLD(writer-first): opened is null while the gate is live, got \"wb\""; "FUSED-GATE-HOLD(writer-first): typed reason gate_live, got undefined"; "FUSED-GATE-HOLD(writer-first): wb ledger row stays pending (no open mutation), got \"in_progress\""; and the same three for FUSED-GATE-HOLD(gate-first). The no-gate controls passed pre-fix (existing behavior).
GREEN: node scripts/test-adaptive-node.js — exit 0, "adaptive-node tests passed (1610 assertions)", 0 FAIL. Both table orders now return CLOSED-ONLY (closed:wa, opened:null, reason:'gate_live', liveGates:['g1']) with wb's ledger row left pending; both no-gate controls stay byte-identical (fused advance opens wb, ledger flips in_progress). All prior pins (channel V1/V2/V3, V6, A1/A2, n/a carve-out) stay green.
GREEN: node scripts/simulate-workflow-walkthrough.js — exit 0, "Workflow walkthrough simulation passed".

## The fix

In runCloseAndOpenNext's fused-advance path (scripts/kaola-workflow-adaptive-node.js), immediately
after the `!nextNode` frontier_blocked guard and BEFORE any open mutation (baseline / ledger splice):
re-read the running set and, if ANY live member has kind:'gate', return the CLOSED-ONLY envelope —
the frontier_blocked shape with the typed `reason: 'gate_live'` (mirroring open-ready's hold
vocabulary) plus `liveGates: [<ids>]`. Order-INDEPENDENT (fires regardless of ## Nodes table order).
The running set is re-read POST-removal of the just-closed node, so a gate closing ITSELF never
self-holds. No live gate ⇒ the block is a no-op (byte-identical fused advance — pinned by the
controls). The orchestrator re-runs orient/open-next after the gate drains (that door already
refuses scheduler_active while the gate is live — consistent).

Pinned RED-first in scripts/test-adaptive-node.js (block "Fused-advance gate-window hold"): BOTH
table orders (writer-rows-first AND gate-row-first) with g1 live as kind:'gate' → close-and-open-next
on wa returns closed-only (opened:null + reason gate_live, wb stays pending); BOTH orders' no-gate
controls → fused advance opens wb exactly as before.

## Files changed (this repair — all inside the declared write set)

- scripts/kaola-workflow-adaptive-node.js (canonical: the fused-advance gate-window hold)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js (codex twin, edition-sync)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js (edition-sync)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (edition-sync)
- scripts/test-adaptive-node.js (FUSED-GATE-HOLD ×2 orders + FUSED-GATE-CONTROL ×2 orders appended)
- scripts/simulate-workflow-walkthrough.js — in the declared set, UNCHANGED this repair
(The plan-validator ×4 + test-adaptive-handoff.js diffs visible in the worktree are n2-validator's
own repair, present before this reopen — not mine.)

## Verification commands + exit codes

- node -c scripts/kaola-workflow-adaptive-node.js — syntax OK
- node scripts/test-adaptive-node.js — exit 0 (1610 assertions, 0 FAIL; was 6 FAIL pre-fix, 1604 passed)
- node scripts/edition-sync.js --write — 3 files updated (codex twin + gitlab/gitea ports)
- node scripts/edition-sync.js --check — exit 0 (10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity)
- node scripts/simulate-workflow-walkthrough.js — exit 0 ("Workflow walkthrough simulation passed")
- git status --porcelain (scripts + plugins) — my writes: adaptive-node.js ×4 + test-adaptive-node.js, no stray artifacts

## Prior scope re-assertion

The prior gate-reviewed n3-adaptive scope STANDS unchanged: the durable node channel
(deriveDispatchChannel + upstream_evidence conditional-attach + 3 opener wirings + seed stubs +
record-evidence re-injection), the consumed-proof (checkUpstreamConsumed hard/advisory in both close
paths + operator hint) including the repair-1 universal n/a carve-out, the checkEvidenceShape
registry-driven generalization, and the scheduler gate-count work (liveReadsAtMerge gate counting,
open-ready gate_live hold, tryR2bLeglessCoopen gate guard, testConsumedExtra threading). This reopen
adds only the fused-advance gate-window hold + its four pins, closing the last unfenced open door.
