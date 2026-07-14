evidence-binding: n2-review f086e43862b8
verdict: pass
findings_blocking: 0
upstream_read: n1-fix e5791320d595

finding: id=N2R1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=the `(ledgerStatuses || {})` fallback in proveRebindAdmissible degrades to PRE-FIX admit semantics (every lookup undefined => member non-complete => writer attributable) if a future caller omits the ctx field or the plan carries no Node Ledger — unreachable today (single call site :4934 always threads proofLedger from the integrity-guarded initialPlan); a fail-closed default (refuse attribution when the ledger is absent) is the stricter posture — file as follow-up
finding: id=N2R2 scope=in_scope action=document status=open severity=low fix_role=none rationale=the quantifier `.some(members, status !== 'complete')` admits an owner writer while its fan-out gate is only PARTIALLY non-complete; no reachable mixed complete/pending state constructible today (collective fold moves members together; the (3b) would_orphan_in_progress guard fences mid-vote repairs) and every non-complete member must still re-review the post-absorption tree before finalize; the clause is a strict narrowing of base in every state — record the invariant-dependence in D-683-01 so a future per-member-fold change re-examines this quantifier

# Gate review — R7 + R8 delta over base 16561216

## The R7 fix — read, attacked, executed

**Predicate:** `proveRebindAdmissible` (adaptive-node.js:4646-4650) now admits a writer into `repairWriters(X)`
only when its selecting gate has some ledger-non-complete member — a PURE ADDITIONAL CONJUNCT on the base
filter. Every state the new predicate admits was admitted at base, so the delta cannot introduce a new fail-open;
it can only convert former P3b admits into `candidate_delta_unattributed` refusals. No pre-existing typed refusal
renamed/removed/re-routed.

**Attack 1 — soundness both directions (EXECUTED):** re-ran n10's ORIGINAL attack driver (real CLI subprocesses,
real frozen plan):
- FIXED worktree: `ATTACK REFUSED at repair: candidate_delta_unattributed paths=["ax.js"] rebindLen=0` — the exact
  escape dies at the repair, no rebind record.
- copy with ONLY the R7 clause reverted to a tautology: full escape reproduces — `ESCAPE CONFIRMED: finalize opened
  with ax.js@v3`, `ga:2 outcome=pass consumed_by=null` while `gb:2` absorbed the rogue move. Independently
  reproduces the RED on base semantics AND proves the single clause is load-bearing.
- LEGITIMATE seven-step: N11 drives it in-flow (asserts `repair gb:1/wb` absorbs `ax.js@wa` via a LIVE P3b while
  `ledger(ga)==='pending'`); the #683 E2E recovers to finalize with a byte-identical plan_hash — both green.
  Strict narrowing confirmed, not a blanket P3b ban.

**Attack 2 — staleness / manipulability / quantifier:** `proofLedger` (:4881) is a hoist of the identical
`readLedgerStatuses(initialPlan)` the unique-maximal proof already made; `initialPlan` read once at :4808 inside
the guard prologue's mutual exclusion — no new staleness surface. Forging owner gate `pending` when discharged
requires hand-editing the ledger, which also schedules the re-review it claims (self-consistent; hand-editing
durable state is outside the threat model). Forging `complete` when folded → refuse (fail-closed). Missing/empty
ledger degrades to base admit via `|| {}` — unreachable today (N2R1). The `.some` fan-out quantifier: every
partially-complete construction is closed by the collective fold or the (3b) would_orphan_in_progress guard, and
the clause is strictly tighter than base in all states (N2R2).

**Attack 3 — mutation-kill of N11 (EXECUTED):** full suite on the reverted copy → EXACTLY 2 failures, both N11
(the escape assertion got `result:"ok"`, the base laundering payload; and the zero-durable-mutation assertion);
2154/2156 green. Double result: N11 is a genuine single-line killer, AND the base↔fixed behavioral delta across
the entire 2156-assertion surface is ONLY the R7 escape — strongest possible evidence every pre-existing refusal
keeps exact semantics.

## R8 — per-fold-site killers (EXECUTED)

- Site A disabled (journal-driven fold, `if (repairAttempt)` :5044): 21 failures = N684-6 (`evidenceRemoved=[]` —
  the `completedJournalGates`-fed purge at :5208 is load-bearing) + R21/R22/R23/R24. ZERO N684-5/N11 → N684-6
  single-site attributable. CONFIRMS the R9 explanation: R21-R24 genuinely kill site A in the full suite (the
  n11 replica simply never contained them) — verified by execution.
- Site B disabled (#664 ledger-fanout :5086): exactly 8 failures, all #664 + #665 R2; N684-5 AND N684-6 green →
  site B independently killed, N684-6 not spuriously dependent on it.
- N684-6 pins current behavior (clean suite green); no production fold code changed in the delta.

## Breaker, ports, chains, hygiene

- Five-consumed-repairs breaker (STEP 6, :4867-4873) untouched, still above every rebind proof/mutation; STEP-5
  consumption-resume untouched, appends no rebind.
- `edition-sync.js --check` → 10 ports, 24 mirrors, 27 byte-identical groups, exit 0; all 3 port diffs' added
  lines md5-identical to canonical.
- 4 adaptive-schema.js copies one sha256 (05e001ace225…), untouched.
- Chains: implementer `fourchain.out` FOURCHAIN_EXIT=0, mtime postdates all sources; my spot-checks: clean
  `test-adaptive-node.js` → 2156 assertions, 0 FAIL; walkthrough passed.
- Write-set = exactly the 5 declared files, unchanged after my runs.

## Verdict
Went looking for the sixth hole; did not find one. The executed escape refuses with zero mutation; the reverted
copy proves both the RED and the single-line load-bearing claim; the base↔fixed suite delta is exactly N11; both
fold sites have independent single-site killers; ports/schema/chains in order. The two findings are fail-closed
hardening/doc notes, non-blocking. PASS.
