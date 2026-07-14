evidence-binding: n1-fix e5791320d595
<!-- RED: paste RED here -->
RED: R7 temporal escape reproduced end-to-end through the REAL CLI on base-16561216 — repair-node gb:2/wb => {"result":"ok"}: rogue ax@v3 (a value NO gate reviewed) laundered into gb:2's rebind via P3b (absorbed ax.js@wa off the CONSUMED, DISCHARGED ga:1 repair, ledger(ga)=complete), ref moved, driving unreviewed ax@v3 to finalize. R8 RED — with only N684-5, disabling EITHER #664 fold site survives (the two sites are mutually redundant in that scenario); the journal-driven site :5031-5052 had no purpose-built single-site killer.
<!-- GREEN: paste GREEN here -->
GREEN: R7 escape now refuses repair_requires_replan/candidate_delta_unattributed naming ax.js with ZERO durable mutation (gb:2.rebind.length=0, ref unmoved); the LEGITIMATE #683 seven-step still recovers to finalize; permanent regression N11 added. R8 — N684-6 kills Site A (:5031-5052 disabled => N684-6 evidenceRemoved=[] RED, while N684-5/N11/#683/#664/#665 stay green) and Site B is independently killed (:5073-5090 disabled => #664 + #665 R2 RED, while N684-5/N684-6 stay green). Clean test-adaptive-node.js = 2156 assertions pass. Four chains green (FOURCHAIN_EXIT=0). All 4 adaptive-schema.js copies byte-identical (1 distinct md5).
upstream_read: n/a base-commit-16561216

## R7 (HIGH, safety) — the load-bearing fix

Predicate chosen (canonical `scripts/kaola-workflow-adaptive-node.js`, `proveRebindAdmissible`, the
`repairWriters` builder): a writer selected for repair by another gate is admitted into `repairWriters(X)`
— and therefore usable for P3b attribution — ONLY when its selecting gate is CURRENTLY LIVE, i.e. still
folded-to-pending (not `complete`):

    && (a.logical_gate.members || []).some(m => (ledgerStatuses || {})[m] !== 'complete')

`ledgerStatuses` is threaded in as a new `proveRebindAdmissible` ctx field, sourced at the call site from
the hoisted `proofLedger = readLedgerStatuses(initialPlan)` (the same ledger the unique-maximal producer
proof already reads). NO schema/validator change: `logical_gate.members` and the ledger are both already
available; the fix is one filter clause + one plumbed argument.

Why this is the precise predicate (not `consumed_by == null`): in BOTH the escape and the legitimate flow
the owner's repair attempt ga:1 is CONSUMED by the time the sibling gate is repaired, so consumption cannot
distinguish them. The distinguishing fact is the owner GATE's ledger state — the ground truth of "will this
gate re-review the current tree." A gate folds ALL its members to `pending` and re-passes them ALL to
`complete` together, so `members.some(status !== complete)` is exactly "the gate is currently folded / has
not re-passed." `repair.selected_writer` is set once and never cleared, so the mere existence of a past
repair is not evidence of an imminent re-review; once the gate has re-passed (gone `complete`) its fold is
DISCHARGED and it re-reviews nothing — attributing a later out-of-band movement to it launders an unreviewed
blob. Requiring the selecting gate to be non-complete restores the P3b justification ("the owner's gate MUST
re-review the absorbed content before the plan advances").

Why the legitimate co-repair still works (strict narrowing, verified): while a sibling gate's own attempt is
still unresolved, its post-dominators cannot reopen, so the owner gate stays folded-pending and its writer
stays attributable. Executed proof — legit #683 seven-step through the real CLI: repair ga:1/wa (P3a) => ok;
close wa with ga STILL pending (gb:1 fences its reopen); repair gb:1/wb absorbs the changed ax.js@wa via a
LIVE P3b (ledger(ga)=pending) => ok; both gates re-review PASS; open-ready => ['finalize']. The escape
diverges only in that ga has since RE-PASSED to `complete` before the gb:2 repair (its repair discharged) and
ax was then moved out-of-band — so the same clause that admits the live case refuses the spent one.

Executed receipts (real `kaola-workflow-adaptive-node.js` CLI subprocesses, real validator freeze, real git):
- BASE (pre-fix): `=== ESCAPE repair gb:2/wb => {"result":"ok"}`; `gb:2.rebind.length=1 refMoved=true absorbed=["ax.js@wa"]` — BUG PRESENT.
- FIXED: `=== ESCAPE repair gb:2/wb => {"result":"repair_requires_replan","reason":"candidate_delta_unattributed","paths":["ax.js"]}`; `gb:2.rebind.length=0 refMoved=false` — refuses, ZERO durable mutation.
- LEGIT (fixed): `repair gb:1/wb (P3b, ga PENDING) => ok`; `=== FINAL open-ready => ["finalize"]` — recovers to sink.

Permanent regression: `scripts/test-adaptive-node.js` N11 — drives the full temporal escape through the real
CLI, asserts the LIVE co-repair (gb:1 while ga folded-pending) STILL absorbs ax.js@wa via P3b, then after ga
re-passes to complete + the rogue ax@v3 edit, asserts repair gb:2/wb refuses candidate_delta_unattributed
naming ax.js with zero rebind record and an unmoved ref.

## R8 (MEDIUM, coverage) — per-fold-site mutation receipts

Paired fixture `scripts/test-adaptive-node.js` N684-6 (sequence-only impl -> g_pass[PASS,complete] ->
g_fail[FAIL,folds] -> finalize) isolates the journal-driven site's EXCLUSIVE behavior: only :5031-5052 can
attribute a COMPLETED singleton gate (a code-reviewer, not a fan-out) to this candidate+writer via its
recorded PASS attempt and thereby feed `completedJournalGates`, whose purge at :5195 removes g_pass's stale
pass receipt. Structural post-domination (:5071-5072) still folds both gates regardless, so the KILLER lives
on the receipt purge (evidenceRemoved), not on gatesReset. No production fold-code changed; the clean suite
is fully green, so the new assertion pins CORRECT behavior (a stale pass receipt cannot certify the repaired
tree) — no defect surfaced.

Single-site mutation runs (single-line guard flip on a copy; only D444-GUARDS is a shared copy-artifact from
the scripts-only copy missing plugins/, and it passes in the clean real-env run):
- Site A (:5031-5052 journal-driven) DISABLED -> `FAIL: N684-6: the stale singleton PASS receipt g_pass.md
  is purged ... got evidenceRemoved=[]` (plus R21/R22/R23/R24, which n11's budget-limited N684-5 replica
  never exercised — Site A was in fact already covered in the full suite, over-satisfying R9). N684-5, N11,
  #683, #664, #665 all stay GREEN -> N684-6 is a genuine single-site killer for :5031-5052.
- Site B (:5073-5090 ledger-fanout) DISABLED -> `FAIL: #664: repair-node folds the WHOLE completed
  adversarial-verifier fan-out group ... got gatesReset=["review"]` + av-a/av-b ledger + receipt + #665 R2
  (four receipts) RED. N684-5 AND N684-6 stay GREEN -> Site B independently killed; N684-6 does not spuriously
  depend on it. Discharges R8 + the pre-existing R9.

## Four-chain + hygiene receipt

- Canonical edit only; `npm run sync:editions` regenerated the 3 ports (codex/gitlab/gitea) — no hand-edit.
- `git status --short`: exactly the declared write set — scripts/kaola-workflow-adaptive-node.js,
  scripts/test-adaptive-node.js, plugins/kaola-workflow{,-gitlab,-gitea}/scripts/*adaptive-node.js
  (+ this evidence cache). Nothing outside the barrier's allowed set.
- Four chains SEQUENTIAL, FOURCHAIN_EXIT=0: claude `adaptive-node tests passed (2156 assertions)` +
  `Workflow walkthrough simulation passed`; codex `Kaola-Workflow walkthrough simulation passed`; gitlab
  `GitLab workflow` + `GitLab Codex workflow walkthrough simulation passed`; gitea `Gitea workflow` +
  `Gitea Codex workflow walkthrough simulation passed`.
- adaptive-schema.js UNTOUCHED; all 4 copies byte-identical (single md5 a89158085b88f7c92b8fb726d987aece,
  1 distinct hash pre- and post-sync).
