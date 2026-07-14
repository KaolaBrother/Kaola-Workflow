# Workflow Plan — bundle-683-684-685 (#683, #684, #685)

<!-- plan_hash: e6e7a66b4915e1658db397af012c05dab180acda30f2d27961166d1c0907e4d3 -->

## Meta

labels: bug, tests, enhancement
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 1 | sequence | reasoning |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-docs | doc-updater | n3-adversary | docs/decisions/D-683-01.md, docs/api.md, CHANGELOG.md | 1 | sequence | standard |
| n5-finalize | finalize | n4-docs | — | 1 | sequence | — |

## Plan Notes

- This is a RE-PLAN of a wedged run. The verified base for #683/#684/#685 is already COMMITTED on
  branch `workflow/bundle-683-684-685` (commit 16561216); the provisioned worktree REUSES that branch,
  so the rebind mechanism (#683), mutation coverage (#684), and parent-dir fsync (#685) are already
  present and each passed a prior code-reviewer gate. The ONLY new work is the two outstanding
  adversarial findings R7 and R8, plus review, a repairable adversarial re-attack, docs, and finalize.
  Do NOT re-implement the base.
- Single-writer adversarial-repairability (learned from the prior mechanical wedge): the prior run
  died because a single fan-out adversarial gate post-dominated an ANTICHAIN of three independent
  writers — a refutation had no unique maximal producer, so `repair-node` returned
  `repair_requires_replan` and only whole-plan discard recovered. This plan concentrates ALL new write
  work in ONE writer (`n1-fix`); both gates (`n2-review`, `n3-adversary`) post-dominate that single
  writer, so ANY refutation is single-writer repairable (reopen `n1-fix`), never a replan dead-end.
  R7 (adaptive-node.js) and R8 (test-adaptive-node.js) also share `test-adaptive-node.js`, so they
  cannot be disjoint co-open siblings — merging them into one node is both correct and required.
- `scripts/kaola-workflow-adaptive-node.js` is a GENERATED aggregator (edition-sync manifest). After
  editing the canonical file, `n1-fix` must run `npm run sync:editions` to regenerate the three edition
  ports; all four edition copies are declared in its write set (generated_port_split). The R7 fix is
  self-contained to adaptive-node.js (it reads `a.consumed_by`, already a required journal field) — NO
  `adaptive-schema.js` change and NO contract-validator needle change (the tightening adds no new
  refusal reason; a now-unqualified path falls to the existing `candidate_delta_unattributed`).
- `docs/decisions/D-683-01.md` is the next free record for #683 — absent on `main` and on the base
  branch (verified). `n4-docs` CREATES it and records the P3b temporal fix alongside the #683 decision.
- validation_command `npm test` runs all FOUR chains sequentially; every write node here touches the
  edition trees, so the four-chain green is the exit gate (a green claude chain alone is insufficient).

## Node Briefs

### n1-fix

Fix the two outstanding adversarial findings against the already-committed base. RED-first (tdd-guide).
Touch ONLY R7 (P3b temporal soundness) and R8 (mutation-kill strengthening); do NOT re-implement the
#683/#684/#685 base already on the branch.

R7 (HIGH, safety — `scripts/kaola-workflow-adaptive-node.js`): the #683 rebind proof's P3b attribution
is TEMPORALLY UNSOUND. `repairWriters(X)` (~line 4636-4639) filters attempts on
`a.repair.selected_writer != null && a.logical_gate.key !== X.logical_gate.key`, but
`repair.selected_writer` is set once and NEVER cleared — so an owner whose gate already re-reviewed an
earlier value and went `complete` is PERMANENTLY in `repairWriters`, laundering a later out-of-band
movement of its declared path into an UNRELATED gate's rebind (P3b clause ~4654). An executed
counterexample drives an unreviewed `ax.js@v3` to `finalize`. Bounded fix: P3b may only attribute an
owner whose repair is CURRENTLY live/unconsumed — restrict `repairWriters(X)` membership to owners
whose repair attempt still has `consumed_by == null` AND whose post-dominating gate is currently
folded-to-pending (not discharged/`complete`). Equivalent acceptable forms per the analysis: require
the owner's gate set to intersect the repairing gate's post-dominators, or re-fold the owner's gate
when its declared path is absorbed. Keep every refusal typed + fail-closed; do NOT relax
`would_orphan_in_progress` (P0) or any existing refusal. `a.consumed_by` is already a required journal
field, so NO `adaptive-schema.js` change is needed.

RED-first for R7: FIRST add a new negative test to `scripts/test-adaptive-node.js` that reproduces the
temporal escape through the REAL CLI (use the `make596Repo`/real-frozen-plan pattern with a real
validator `--freeze`; NOT the unfrozen `makePlan()` shortcut). Shape:
`seed → {wa:ax.js, wb:bx.js} parallel-safe antichain → {ga gates wa, gb gates wb} → finalize(ga,gb)`.
Drive `ga` to PASS on `ax@v2` and go `complete`, `gb` to fail again on `bx@v2`; then out-of-band edit
`ax.js → v3`; then `repair-node --attempt-id gb:2 --node-id wb` — TODAY this returns `result: ok` and
launders `ax@v3` to `finalize` via the consumed `ga:1` repair (assert RED). After the fix it must
refuse (`candidate_delta_unattributed` or the analysis-equivalent), ZERO mutation, and `ax.js` never
reaches the sink at an unreviewed value. Full analysis: `scratchpad/n10.body.md`.

R8 (MEDIUM, coverage — `scripts/test-adaptive-node.js`): N684-5 (the #664 collective-fold E2E) does NOT
kill a single-site fold mutation. The two fold implementations in adaptive-node.js are mutually
redundant in N684-5's scenario — (a) the journal-driven fold inside the `if (repairAttempt) { …
latestJournalAttemptByGate … addGateReset(memberId) }` block (~:5031-5052), and (b) the #664
collective-fold branch `else if (dn.role === 'adversarial-verifier' && … fanout … cardinality '1')`
(~:5073-5090) — so disabling EITHER alone leaves every N684-5 assertion GREEN. Strengthen N684-5 (or
add a paired fixture) so EACH fold site has its OWN single-mutation killer: one scenario reachable only
via the journal-driven fold (no fanout member post-dominating in the simple path graph) and one
reachable only via the #664 collective-fold branch. VERIFY the kills are real: disable site (a) → its
paired test goes RED; disable site (b) → its paired test goes RED. This also discharges follow-up R9
(the pre-existing journal-driven fold's missing mutation pin) — the finalize node marks R9 resolved.
Full analysis: `scratchpad/n11.body.md`.

Cross-edition + exit: after editing `scripts/kaola-workflow-adaptive-node.js`, run
`npm run sync:editions` to regenerate the three declared edition ports (never hand-edit a port). Run
the recorded `validation_command` (`npm test`) — all FOUR chains sequentially — green before close.
Authoritative #683 design (P0–P5 partition, no-silent-waiver theorem): `scratchpad/n4.body.md`; the
passed #683 gate review with R1/R3/R4: `scratchpad/n6c.body.md`.

### n2-review

G1 code review of `n1-fix`. Read its evidence first. Verify: (1) the R7 RED reproduction was real —
driven through the CLI, RED before the fix; (2) the P3b fix is minimal and fail-closed — an owner whose
repair is consumed/discharged can NO LONGER launder a later out-of-band path movement into an unrelated
gate's rebind, and no new laundering surface is introduced; (3) P0 (`would_orphan_in_progress`) and
every existing refusal are unregressed; (4) R8's paired tests EACH kill their target fold-site mutation
(not mutually redundant) and R9 is discharged; (5) `npm run sync:editions` produced byte-consistent
edition ports and all four `npm test` chains are green. Fail closed: block on any residual laundering
vector, a non-killing test, or a red chain. Reference `scratchpad/n10.body.md`, `n11.body.md`,
`n4.body.md`.

### n3-adversary

Repairable adversarial RE-ATTACK of the whole #683 no-silent-waiver theorem, THROUGH the single writer
`n1-fix`, focused on the P3b temporal fix. This gate post-dominates exactly ONE writer, so any
refutation is single-writer repairable (reopen `n1-fix`) — do NOT reproduce the prior run's
fan-out-over-antichain shape that could not be routed to a unique maximal producer. Try to construct a
SIXTH silent-waiver hole: any executed sequence through the real `kaola-workflow-adaptive-node.js` CLI
that drives an unreviewed byte to `finalize` AFTER the R7 fix. Re-run the `scratchpad/n10.body.md`
temporal-escape driver and variants (consumed-then-moved owner; multi-gate discharge chains; crash
windows around the tightened `repairWriters`; attempts to re-launder off a discharged sibling repair).
Also confirm R8's fold-site killers are real by disabling each fold site and checking the paired test
fails. Read-only with Bash (execute repros; write NOTHING to the worktree; verdict from `.cache`
evidence + scratch, never the worktree diff). On a refutation, emit a typed `verdict: fail` finding —
it routes to `n1-fix`, the unique maximal producer. Reference `scratchpad/n10.body.md`,
`scratchpad/n4.body.md`.

### n4-docs

Record the durable decision + user-visible changes. Docs only; no code.
- CREATE `docs/decisions/D-683-01.md` (absent at HEAD and on the base branch): the #683
  no-silent-waiver decision — P3 as the UNION-of-declared partition, the mode+sha candidate "stick"
  (the immutable candidate binding), AND the P3b TEMPORAL soundness fix (attribution only to a
  currently-live/unconsumed repair owner). Follow the record shape of the already-shipped decision record D-682-01 (existing)
  (Status / Date / Context / Decision).
- Update `docs/api.md`: the review-attempts journal schema section — reflect the tightened P3b
  attribution predicate (no new key; the `repairWriters` membership tightening). Cite EXACT text
  against the real code / `--json` output; do NOT fabricate schema (dictate exact text or diff against
  real output).
- Update `CHANGELOG.md` `[Unreleased]`: one entry for the R7 P3b temporal-soundness fix and one for the
  R8/R9 mutation-kill strengthening.
Keep provenance (issue refs, decision IDs, invariant tags) OUT of agent-facing prompt surfaces — it
belongs in these docs, CHANGELOG, and the commit message. Use decision id D-683-01 (next free).

### n5-finalize

Terminal sink for the bundle (#683, #684, #685; closure all_or_nothing; sink: merge). Run the recorded
`validation_command` (`npm test` — four chains sequentially) as the exit gate; feature commit;
run-chains receipt (serial, `--project`); `cmdFinalize --keep-worktree`; push branch; `sink-merge
--sink merge` from the main root. Resolve the gate-finding fence: mark R7 and R8 `status=resolved`
(fixed in-run) and R9 `status=resolved` (discharged by R8's journal-fold pin). FILE the deferred,
out-of-scope follow-ups as new issues and record `status=deferred filed=#N` for each: R5 (a node id
literally named `__proto__` wedges fail-closed via `readLedgerStatuses` plain-object key drop → add a
reserved-name grammar refusal in plan-validator.js), R6 (canonical-integer path keys enumerate
numeric-first, so a correct declared blob map can fail its own `isCanonicalBlobMap` check → order-
insensitive canonicalization or grammar refusal), and the fast/full/phase4-advance `writeFileAtomic`
missing parent-dir fsync gap (#685's fix not applied to the opt-in paths). Verify each issue actually
CLOSED (not merely `gh` exit 0). CI/CD is not a gate.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-docs | complete |
| n5-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix e5791320d595 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review f086e43862b8 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 63515a1a3587 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs d930835b8e38 | |
