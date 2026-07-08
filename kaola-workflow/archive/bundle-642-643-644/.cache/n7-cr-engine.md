evidence-binding: n7-cr-engine 39d0b80762bc
verdict: pass
findings_blocking: 0

upstream_read: n1-architect 416c5fde30b3
upstream_read: n2-validator 4e6f3bce0f6b
upstream_read: n3-adaptive a3878b70de9c

finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=universal n/a-skip carve-out landed in checkUpstreamConsumed exactly as prescribed — verified in code, pinned, no fabrication hole opened
finding: id=R2 scope=in_scope action=fix status=resolved severity=low fix_role=tdd-guide rationale=brief_duplicate_node typed freeze refusal + operator hint landed with a briefs-dup pin — verified in code and test
finding: id=R3 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=adversary-surfaced fused-advance gate-window hold landed — order-independent, self-close deadlock-free (verified structurally and empirically), pinned both orders plus controls

# n7-cr-engine — FRESH G1 re-review after three engine repairs (reopened, nonce 39d0b80762bc)

Scope: the three repair diffs over the previously-reviewed engine state (working-tree modifications to `scripts/kaola-workflow-plan-validator.js`, `scripts/kaola-workflow-adaptive-node.js`, their codex twins and gitlab/gitea forge ports, `scripts/test-adaptive-node.js`, `scripts/test-adaptive-handoff.js`), plus full re-validation. The prior review's findings on the base engine diff stand (all checklist properties 1-8 re-confirmed green via the full chains); this review verifies the deltas.

## (a) The three repairs — correct, minimal, ×4-propagated

**R1 — n/a-skip carve-out (adaptive-node.js:1524-1526).** Landed byte-consistent with `checkEvidenceShape`'s carve-out (`content.trim().startsWith('n/a')` → exempt), placed after `const content = evidenceContent || ''` and before the enforcement loop — exactly the prescribed one-liner, nothing else touched in the function. The two close gates now render the same verdict on the same n/a evidence. Pinned: direct (`ok:true, hard:false` on n/a-first evidence with the seeded key and no echo) + close-path (close does not refuse `upstream_not_consumed`).

**R2 — brief_duplicate_node (plan-validator.js:1428-1446 + operator hint :109).** Seen-Set wall inside the existing briefs loop, mirroring the dup-node-id wall style; unknown-check still evaluated first per entry; typed refusal + `OPERATOR_HINT_REGISTRY` entry; freeze-only (revalidateForResume untouched — briefs remain hash-covered, so a frozen plan can never carry a dup). Pinned in test-adaptive-handoff (`briefs-dup`: refuse + offending id named in errors). Minimal — no other validator logic touched.

**R3 — fused-advance gate-window hold (adaptive-node.js:2827-2846).** Closes a real, adversary-reproduced bypass: open-next and open-ready were gate-fenced but the fused advance in `runCloseAndOpenNext` was the one unfenced open door — a closing sibling could flip the next writer `in_progress` while a `kind:'gate'` member was mid-verdict. The hold re-reads the running set and returns the closed-only envelope (`result:'ok', closed, opened:null, reason:'gate_live', liveGates:[...]`), mirroring open-ready's hold vocabulary. Placement verified sound:
- It sits AFTER the running-set removal (`nodes.filter(n => n.id !== nodeId)` + rewrite/unlink), so the re-read is post-removal.
- The `enterBatch` early-return above the hold is safe: batch opens route through open-ready, which holds writers via its own `gate_live` check; reads are observers like the gate itself (no verdict-window violation).
- No open mutation (baseline record, ledger splice) is reachable while a gate is live, regardless of `## Nodes` table order.

## (b) No fabrication hole from the carve-out — empirically verified

Scratch probes against this worktree (all three shapes):
- Binding-line-first + `n/a` below (the record-evidence auto-prepend shape, i.e. the lazy dodge): consumed-proof still HARD-refuses `upstream_not_consumed`, and `checkEvidenceShape` ALSO refuses it (binding-first n/a misses the shape carve-out and hits the tdd-guide branch missing RED) — the two gates agree on refusal.
- Mid-file `n/a` mention alongside real work tokens: still HARD-enforced.
- Only the deliberate n/a-FIRST protocol exempts — the identical shape the pre-existing shape-gate carve-out has always honored. An n/a claim is exactly as visible as before; the barrier still commits any diff a lying skipper produced, and G1/G3 gates still post-dominate every IMPLEMENT node. No new hole.

## (c) The fused-advance hold cannot deadlock — verified structurally AND empirically

Structural: the just-closed node is removed from the running set before the hold's `readRunningSet` re-read; the code comment documents the ordering dependency at the exact spot.
Empirical scratch run: a `main-session-gate` (`g1`, the SOLE running-set member, `kind:'gate'`) closing ITSELF via `runCloseAndOpenNext` returned `{result:'ok', closed:'g1', opened:'wb', reason:null}` — no self-hold, fused advance proceeded normally. A held sibling-close scenario recovers when the gate drains (orchestrator re-runs orient/open-next per the envelope); a crashed-gate stale entry is repairable via the pre-existing `reconcile-running-set` path — fail-closed is the correct posture.

## Test pins — genuine, non-tautological

- NA-skip block: direct + close-path assertions on the exact protocol shape (n/a-first, binding below, seeded key present, no echo).
- briefs-dup: refuse + id-in-errors through the REAL validator subprocess.
- FUSED-GATE-HOLD: BOTH table orders (writer-first AND gate-first) assert closed-only + `reason:'gate_live'` + the `wb` ledger row still `pending` (no open mutation); FUSED-GATE-CONTROL both orders proves the no-gate path opens `wb` `in_progress` — the hold is the only behavioral difference.

## Cross-edition propagation

- `cmp`: both codex twins byte-identical to canonical (adaptive-node + plan-validator).
- `node scripts/edition-sync.js --check` → exit 0 (10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity).
- gitlab/gitea ports carry the repair tokens with forge renames (`gate_live` ×6 in each adaptive port, `brief_duplicate_node` ×2 in each validator port).

## FULL VALIDATION — real exit codes, sequential, box constraint applied

Direct suites (file-captured exit codes, not piped tails):
- `node scripts/test-adaptive-node.js` → exit 0, `adaptive-node tests passed (1610 assertions)`.
- `node scripts/test-adaptive-handoff.js` → exit 0, `adaptive-handoff tests passed (153 assertions)`.
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, `Workflow walkthrough simulation passed`.

Four chains, run SEQUENTIALLY with `KAOLA_RUN_CHAINS_CONCURRENCY=serial`, per-chain exit codes captured to file:
- `npm run test:kaola-workflow:claude` → claude_exit=0 (log sentinels: adaptive-handoff 153, adaptive-node 1610, walkthrough passed)
- `npm run test:kaola-workflow:codex` → codex_exit=0
- `npm run test:kaola-workflow:gitlab` → gitlab_exit=0
- `npm run test:kaola-workflow:gitea` → gitea_exit=0

(The EISDIR stderr traces in the claude log remain the pre-existing lane-fixture task-mirror noise — `kaola-workflow-task-mirror.js` is untouched by this run.)

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass (R1, R3 resolved and pinned) |
| LOW      | 0     | pass (R2 resolved and pinned) |

Verdict: APPROVE (verdict: pass, findings_blocking: 0). All three repairs are correct, minimal, pinned with genuine controls, and propagated ×4 editions; the carve-out opens no fabrication hole; the fused-advance hold is order-independent and deadlock-free including gate self-close; all suites and all four forge chains are green with real captured exit codes. Zero new findings — the engine diff is clean to proceed. (The n4/n5/n6 prose repairs land after this gate and are n8-cr-surface's scope; not reviewed here.)
