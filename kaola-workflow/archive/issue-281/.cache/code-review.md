verdict: pass
findings_blocking: 0
finding: id=R1 scope=in-scope action=none status=non-blocking severity=low fix_role=none rationale=compliance-row dedup cosmetic; carried from first review, not worsened by the repair
finding: id=R2 scope=in-scope action=none status=non-blocking severity=low fix_role=none rationale=open-batch atomicity fails-closed; unchanged by the orient repair
finding: id=R3 scope=in-scope action=none status=non-blocking severity=low fix_role=none rationale=write-role-join honest partial; documented, unchanged by the orient repair
finding: id=R4 scope=in-scope action=document status=non-blocking severity=medium fix_role=tdd-guide rationale=orient (and the shared crossCheckStatus gate) treat a partial-seal batch (manifest members superset of in_progress, e.g. 3-member batch with 1 sealed) as orphan_multi_in_progress; faithful to the reviewed exact-equality predicate shared with aggregator-core; reachable only on crash-resume of a 3+ member granular-seal batch (orient runs at loop-top, not between seal-member calls); fails closed (refuse -> exitCode 1 + typed JSON -> orchestrator repair/consent, human-visible, NO auto-destruction); correct fix is a coordinated subset predicate (in_progress subset-of members) across BOTH gates -- follow-up, not a single-node re-repair

# G1 Re-Review (post-repair) — issue #281

## Verdict: PASS — 0 blocking findings

Re-review after the `orient-batch-aware` (tdd-guide) repair landed the AC#5 fix for
verifier defect A1. The repair is clean, strictly additive, read-only, correct across all
four editions, and fully tested. The whole change set re-affirms green (npm test exit 0
twice; walkthrough exit 0). One new design-level observation (R4) is recorded as a
non-blocking follow-up.

## The repair (orient-batch-aware) — verified

runOrient (scripts/kaola-workflow-adaptive-node.js:316-454):

- ENUMERATES ALL in_progress rows: the old break-on-first loop is replaced by a no-break
  `inProgressNodes.push(rowId)` accumulator (lines 345-372).
- TYPED REFUSAL: `inProgressNodes.length > 1` AND (no manifest OR member-set mismatch) ->
  `{result:'refuse', reason:'orphan_multi_in_progress', ...}` (lines 422-437). CLI dispatch
  (lines 894-896) surfaces it as JSON + exitCode 1, identical to every other refusal path,
  so plan-run reads the typed reason and routes a repair.
- STRICTLY ADDITIVE / back-compat: inProgressNode = inProgressNodes[0] and its cacheState
  preserved byte-equivalently (lines 374-377); consentHalt/escalatedToFull/allDone and the
  result:'ok' shape untouched; new fields inProgressNodes + batch added alongside. Single
  in_progress + no manifest falls through to the legacy ok-path (batch null). Proven by
  T20a + T20e.
- READ-ONLY: no writeFile/mkdirp; manifest read via existing readFile/cacheExists seams.
  Tests assert read-only on ok, batch, refuse, and mismatch branches.
- LEGALITY GATE three branches correct: (a) <=1 in_progress -> legacy (batch null);
  (b) >=1 in_progress with member-set EQUAL to manifest -> valid batch object;
  (c) >1 in_progress with no/mismatched manifest -> refuse. Set equality is
  order-independent (Set + length + every-has).
- FAIL-CLOSED manifest read: safeJsonParse returns {} on malformed JSON; a missing members
  array keeps manifest=null, so a corrupt/partial manifest cannot fake a valid batch.

## Four-edition parity — verified

- root <-> claude adaptive-node.js: diff EMPTY (byte-identical).
- gitlab fork: logic identical to root modulo gitlab rename tokens (sed-normalized diff empty).
- gitea fork: logic identical to root modulo gitea rename tokens (sed-normalized diff empty).
- adaptive-schema.js (cross-edition drift anchor): UNTOUCHED in every edition.

## Tests — real, not vacuous (now 135 assertions; +31 over the prior 104)

test-adaptive-node.js T20a-T20e each exercise a distinct branch (back-compat single-node;
matching-manifest valid batch; no-manifest refuse; mismatched-manifest refuse;
consent/escalation/allDone preserved). All read-only-asserted. Ledger fixtures match the
orient parser's header/row format.

## Whole-set re-affirmation — verified by me

- node scripts/simulate-workflow-walkthrough.js -> exit 0.
- npm test -> exit 0 (background tasks bgnysw3ky AND bfea2857b both completed exit 0).
  Tallies: next-action 65, commit-node 27, adaptive-handoff 58, adaptive-node 135,
  parallel-batch 75, vendored-agents 13, release-drift 4, fast-audit 45 — all passed.
- Earlier change set spot-checked: next-action.js adds purely additive readyPending/active
  (legacy readySet/nextNode/allDone byte-unchanged); registration/contracts/forge-forks/
  plan-run-semantics/planner-profile carry no regressions (covered by passing contract +
  sync suites).

## R4 — partial-seal batch treated as orphan (NON-BLOCKING, documented)

orient's exact-equality gate (and the shared crossCheckStatus in parallel-batch.js:203-221,
already reviewed + P6-tested with 75 assertions) treats a partially-sealed batch as an
orphan. Concretely: a 3-member batch where seal-member has closed one member's ledger row to
`complete` (sealOne line 376) while keeping it in the manifest (line 395 only sets
sealed:true, never removes) leaves manifest.members = superset of in_progress; with >=2 rows
still in_progress, orient (and crossCheckStatus) return orphan_multi_in_progress.

Why this is non-blocking:
- The task spec ITSELF defines member-set MISMATCH as a typed refusal; orient implements the
  specified gate faithfully. The conflation of "!= members" with "not-subset-of members" is a
  DESIGN-level question, not a repair bug.
- The identical predicate is the already-approved crossCheckStatus (aggregator-core); the
  repair was tasked to MIRROR it and did. Fixing orient alone to a subset predicate would
  DIVERGE the two gates — strictly worse. The correct fix is a coordinated subset predicate
  (in_progress subset-of members) across BOTH, which is a follow-up, not a single-node repair.
- Reachability is narrow: orient runs at the loop-top "On entry (and on every resume)"
  (plan-run.md:75), NOT between granular seal-member calls — so the state is observable only
  on crash-resume of a 3+ member granular-seal batch. The 2-member case drops to length 1 and
  safely hits the legacy path.
- It FAILS CLOSED: refuse -> exitCode 1 + typed JSON -> orchestrator routes repair/consent
  (human-visible). No silent corruption, no auto-destruction (the orphan config is a
  documented typed refusal at plan-run.md:230, not a state-reset).

## Scope discipline (#279)

R1/R2/R3 (first-review follow-ups) are unchanged by this repair and remain NON-BLOCKING —
none worse than first assessed. R4 is a newly-surfaced shared-predicate design property,
recorded as a non-blocking medium follow-up. No new in-scope BLOCKING defects in the orient
code. No manufactured blockers.

Verdict: APPROVE / pass — repair is correct, additive, read-only, four-edition-parity clean,
fully tested; whole set green; one documented non-blocking follow-up (R4). The G1 gate is
re-affirmed over orient-batch-aware AND all 8 original code nodes.
