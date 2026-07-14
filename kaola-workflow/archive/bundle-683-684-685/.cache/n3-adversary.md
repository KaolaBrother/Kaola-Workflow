evidence-binding: n3-adversary 63515a1a3587
verdict: pass
findings_blocking: 0
upstream_read: n1-fix e5791320d595

finding: id=N3R1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=the R7 predicate `(a.logical_gate.members||[]).some(m => ledgerStatuses[m] !== 'complete')` treats EVERY non-complete status as "owner gate will re-review", including `n/a` — a pruned gate that never re-reviews AND (unlike in_progress) is not caught by would_orphan_in_progress at :5110. Unreachable today (the sole n/a ledger writer is selector-arm pruning foldSelectorArms :1854; a gate with a repair record sits in a SELECTED arm; selectors resolve once before arms run; unselected-arm gates never open so hold no repair record; reopen/repair fold only GATE_ROLES never a selector). Stricter fail-closed predicate: `∈ {'pending','in_progress'}`. Same character as N2R2 — record in D-683-01 so a future selector×repair change re-examines it.

# Adversarial re-attack — R7 fix + sixth-hole hunt

## Priority 3 — R7 refutation re-confirmed (EXECUTED, three drivers)
- n10's original `attack-p3b-temporal.js`: `repair gb:2/wb WITH ax@v3` => `repair_requires_replan /
  candidate_delta_unattributed paths=["ax.js"]`, ATTACK REFUSED, exit 0.
- `escape-r7.js`: escape => candidate_delta_unattributed, `gb:2.rebind.length=0 refMoved=false`, FIXED — ZERO
  durable mutation. The LEGIT co-repair on the way in works: `repair gb:1/wb => ok` (LIVE P3b, ledger(ga)=pending),
  `ga:2=ok ledger(ga)=complete`.
- Full suite: adaptive-node tests passed (2156 assertions), exit 0.

## Priority 1 — temporal edge cases (EXECUTED, three-gate chain)
Built `seed→{wa,wb,wc}→{ga|wa,gb|wb,gc|wc}→finalize`. gb:1 absorbs ax@v2 via LIVE P3b (ga pending); fence lifts;
ga+gb re-pass to complete, gc re-fails (gc:2). Moved ax→v3 out-of-band and tried to launder through the STILL-OPEN
third gate: `repair gc:2/wc WITH ax@v3 => candidate_delta_unattributed paths=["ax.js"]` — REFUSED (predicate reads
ga=complete, gb=complete at repair entry, so wa ∉ repairWriters). 1(a)/1(b) subsumed — ga re-reviews the current
tree at its own close (never a stale value); a re-failing owner gate stays a blocker fenced by reviewJournalBlocker.

## Priority 2 — `.some` fanout quantifier (defense-in-depth verified)
`.some(!=='complete')` is true iff the gate is not fully discharged → a partial state still means the gate WILL
re-review (aggregate needs all members' receipts on one candidate, else finalize is fenced). Independently, the
predicate at :4931 is PURE (only sets pendingRebind :4949); performRebind :5125 sits AFTER would_orphan_in_progress
:5107. A partial fanout leaves an in_progress member that the all-complete group-fold :5098 skips → orphan →
refuse BEFORE any durable byte. Could not construct a mutating partial-fanout admit.

## Priority 4 — new-axis hunt
(a) crash-resume STEP-5 hoist :4845 short-circuits BEFORE the rebind proof, performs NO new rebind. (b)
ledger/digest instant consistency: proofLedger :4881 and the tree digest :4894 are read within one repair-node
invocation under the guard prologue's project-lock mutual exclusion — no concurrent mutation. (c) `|| {}` fallback
degrades to pre-fix admit only when the ledger is absent — unreachable (a frozen journal plan always carries a Node
Ledger). The one genuine divergence: `n/a` status (N3R1) — admitted as "will re-review" though an n/a gate is
pruned and never re-reviews and escapes the orphan guard — but provably unreachable today (traced above).
Empirically: a verdict gate cannot self-skip to any status (closing g1 with n/a evidence => refuse, ledger stays
in_progress).

## Verdict
NOT-REFUTED (confidence high). Attacked priorities 1-4 with executed drivers; every escape (2-gate original,
escape-r7, N11, 3-gate chain) refused with candidate_delta_unattributed and zero durable mutation; the legitimate
co-repair recovers; the only predicate-breadth divergence (n/a) is provably unreachable — filed non-blocking
(N3R1), not a sixth hole. No executed path drives an unreviewed change to finalize. No repo file left modified.
