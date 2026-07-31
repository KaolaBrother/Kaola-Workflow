## Mixed-tests triage (ADR 0017 — DAG executor retirement)

Classification key: **DAG** = dies with the node/DAG executor (roles, `depends_on`, declared write
sets, `## Nodes`/`## Node Ledger`, `plan_hash`, epoch/re-plan CAS, barrier baselines, post-dominance
gates — see ADR 0017 "What is retired"). **SURVIVOR** = tests behaviour that outlives it. Read
[docs/decisions/0017-the-mission-list.md](../../../docs/decisions/0017-the-mission-list.md) first.

---

## 1. `scripts/test-claim-hardening.js` (6,251 lines) — tests `kaola-workflow-claim.js`

38 top-level `// #NNN` scenario groups (each holds several `assert()`s). **8 DAG, 30 SURVIVOR** by
group count — but the DAG groups are fixture-heavy: they cover ~3,432 of 6,251 lines (~55%).

### DAG groups (8)
| Group | Lines | Subject |
|---|---|---|
| #522 | 1207–1579 | `cmdFinalize` gate — verifies via `## Nodes`/`## Node Ledger`/`plan_hash`/`epoch_lineage_id` fixture |
| #816 | 1579–2245 | `cmdFinalize` "one resumable transaction" — same node-ledger/plan_hash/epoch fixture |
| #686 (A) | 3096–3170 | archive-time reap of dangling `refs/kaola-workflow/barrier/<tag>/*` (per-node barrier refs) |
| #686 (B) | 3170–3891 | legacy `barrier-ref-sweep` subcommand — same per-node barrier-ref namespace |
| #699 | 3891–4358 | fresh claim persists `claim_root`/`epoch_lineage_id`/`plan_hash` identity |
| #735 | 4715–4966 | abandon must not demand run-state artifacts — drives a `## Node Ledger` (roles: implementer/code-reviewer/finalize) fixture |
| #755 | 4966–5287 | abandon authority downgrade must not mask a real fault — same node-ledger fixture |
| #837 | 5287–5847 | finalize refusal ladder subtracted (`--check` precondition report + script-owned mirror sync) |

**Important sub-distinction inside the DAG bucket:** #522, #816 and #837 are not pure DAG debris.
Their *fixtures* are node-ledger/plan_hash/epoch — dead — but their *subject* (cmdFinalize must
verify a chain-receipt exists, report every unmet precondition in one read-only pass, and own the
worktree→main mirror sync) is exactly what ADR 0017's build sequence step 3 names as load-bearing:
*"the finalize door currently runs through the plan-validator's whole-plan attribution sweep and
must be re-pointed at the recorded per-item locators."* These three groups should be **rewritten
against the mission-list's per-item locators, not deleted with the executor** — deleting them
wholesale loses the "finalize refuses an incomplete/unverified run" coverage entirely. #686 (barrier
refs) and #699 (epoch/claim-root identity) carry no such callout and are safe to delete outright with
the mechanism they test. #735/#755 sit in between: `abandon` itself is a surviving claim verb
(`release`/`discard` per CLAUDE.md), but its current "don't demand artifacts / don't mask a fault"
logic is keyed on ledger completeness and needs re-derivation once evidence is item-keyed instead of
node-keyed.

### SURVIVOR groups (30) — titles + line numbers
`#356` (1–207, branch-arg/ghExec hardening) · `#398.1/#398.2/#403.8` (207) · `#395.1` (233,
`buildClosureReceipt`) · `#416` (245, `computeClosePendingFinalize`/`isProbeDegraded`) · `#414.2`
(301, `defaultBranch` probe-chain) · `#476` (350, `--help`/unrecognized-flag hardening) · `#495`
(432, classifier retry envelope) · `#519` (599, gh-fetch stderr-error-class) · `#519` (687,
`probeIssueState` transient discriminant) · `#507` (719, classifier CLI-fetch transient retry) ·
`#503` (839, `resume_ambiguous`) · `#770` (1007, path selector retirement — already-shipped
fast/full removal, unrelated to the node executor) · `#536` (2245, classifier/`parallel_mode`
decoupling) · `#579` (2317, `classifyLane`) · `#579` (2411, clean-check selectivity) · `#579` (2481,
`main_root`/`session_marker`/`claim_ts` exposure) · `#579 R1` (2527, `cmdResume`/`cmdStatus`) ·
`#775` (2642, `--codex-dispatch-mode` shim) · `#619` (2661, close-helper post-probe) · `#620` (2711,
stale-worktree-cleanup vs. unmerged work) · `#672` (2798, `worktreeDirtyState` probe-failed vs.
path-missing) · `#677 (A1)` (2860) · `#677 (A2)` (2943) · `#631` (3026, `cmdVerifySink` prefers
`published_head`) · `#715 F1` (4358, restore-gate dest exemption) · `#715 F1` (4411,
`commitDiscardArchive`) · `#715 N5-A` (4470) · `#715 N5-B` (4563) · `#749 R2` (4634, discard-archive
records source removal) · `#825` (5847–end, typed selection record + `.origin/<target-key>/` staging
fold — pure claim-level bookkeeping, no DAG touch at all).

None of the SURVIVOR groups use a DAG fixture merely for filler — they exercise `claim.js`
subcommands (branch safety, classifier, resume/status, worktree cleanup, discard/restore, sink
verify, selection-record bookkeeping) that have no node/role/write-set dependency.

---

## 2. `scripts/test-gap-sweep.js` (1,115 lines) — tests `kaola-workflow-gap-sweep.js`

24 scenarios (T1–T24). **1 DAG (mixed), 23 SURVIVOR.**

- **T1 (lines 84–139)** — "SCAN dedup": asserts directly on `in_run_repair` semantics (nodeId
  reopened 2×, `sample: 'n2'`, dedup count) *and* on `deferred_red_chain`/dedup in the same scenario.
  The `in_run_repair` half is DAG (nodeId-keyed); the `deferred_red_chain` + dedup-mechanism half is
  SURVIVOR. Needs trimming, not wholesale deletion.
- **T2–T24 (SURVIVOR, 23 scenarios)** — gate mapping (filed:/noise:), vacuous pass, CLI arg parsing,
  manual-seed (`run-gaps-manual.md`), reverse-containment (#653 D1), archived-project refusal (#675),
  foreign-output refusal (#679/#681), regex robustness (#726), prefix/elaboration containment
  (#836). None of these depend on node semantics for their *point under test*.
  - Several (T2, T3, T4, T11, T12, T14, T15, T16) merely **use** `writeProvenance(nodeId opened
    2×)` as a cheap vehicle to synthesize *some* swept class (any class would do) so the generic
    gate/CLI logic under test has something to react to. The DAG fixture provides: one
    `in_run_repair` swept-class row. It is trivially replaceable by the `deferred_red_chain` fixture
    (`writeChainReceipt` with `accepted_red:true`) or the `manual:*` fixture (a `run-gaps-manual.md`
    line) — both already exist in the suite and require zero node concept.

**Verdict on `kaola-workflow-gap-sweep.js` itself** (does its detection have meaning post-DAG?):
The scanner sweeps three reason classes (`scripts/kaola-workflow-gap-sweep.js:35–38` comment,
functions at `:69–140`):
1. `in_run_repair` (`scanProvenance`, `:71–92`) — keyed on a `nodeId` with >1 `open` events in
   `provenance-log.jsonl`. This is literally the node-execution concept: no node, no open/reopen
   event, no meaning. **Dies outright** with the executor (unless a future mission-list
   `dispatched`-repeat signal is derived to replace it — not something to preserve as-is).
2. `deferred_red_chain` (`scanChainReceipt`, `:94–108`) — keyed on `chain-receipt.json`'s
   `accepted_red`, produced by `kaola-workflow-run-chains.js`, which survives. **Fully meaningful**
   post-DAG, zero change needed.
3. `manual:<slug>` (`scanManual`, `:110–140`) — hand-authored `gap: <class> — <text>` lines in
   `.cache/run-gaps-manual.md`. Pure operator free text. **Fully meaningful** post-DAG.

The gate half (`runCheck`/`parseGapSection`/`samplesMatch`, `:258–487`) that cross-checks the
`## Run gaps` section of `finalization-summary.md` against `sweptClasses` is generic string/JSON
matching with **zero node dependency** and survives entirely.

**So the script survives**, with exactly one dead reason class (`in_run_repair`) to drop or
re-derive; the scanner+gate machinery around it is otherwise intact and load-bearing.

---

## 3. `scripts/test-run-chains.js` (1,522 lines) — tests `kaola-workflow-run-chains.js`

41 scenarios (T1–T39 plus T‑788 and T38b). **0 DAG, 41 SURVIVOR.** This suite is entirely about the
chain-receipt producer's own behaviour: receipt schema, exit codes, `--accept-known-red`,
`resolveChains`/`resolveTimeoutMs`/`resolveConcurrency`/`resolveChainRetry`, concurrency dispatch,
TRANSIENT/DETERMINATE/TIMEOUT retry classification, signal-kill handling, per-chain temp-root
isolation, and (T32–T39) the diff-scope chain-selection logic (`--project`/`--plan` finalize context,
edition-coupling detection, step hoisting, fail-closed on an unresolved diff base, root
cross-edition read surfaces, the Oracle Kernel special case). None reference `nodeId`,
`declared_write_set`, `depends_on`, or `## Nodes` (confirmed by grep — the only hits are contextual
prose, not tested behaviour).

**One caveat, not a DAG classification but worth flagging:** T29 (line 967–1001) drives
`kaola-workflow-plan-validator.js --finalize-check` to prove it refuses a fresh, HEAD-bound,
empty-`chains[]` receipt (`chains_empty`). The *subject* (finalize must not vacuously pass an empty
receipt) is a SURVIVOR requirement — its fixture is a bare `# plan\n`, no node table at all — but its
current *host script* (`plan-validator.js --finalize-check`) is the DAG-hosted verb ADR 0017's build
sequence says must be "re-pointed at the recorded per-item locators." T29 needs to move to wherever
that check ends up living; it should not simply disappear when `plan-validator.js` does.

---

## 4. `scripts/test-sink-merge.js` (1,405 lines) — tests `kaola-workflow-sink-merge.js`

18 scenarios (a–q, with c/d combined). **3 DAG, 15 SURVIVOR.**

### DAG (3)
- **(i) #707, lines 669–716** — "evidence-empty live folder whose ledger PROVES recorded node
  evidence must refuse loudly" — reads `## Node Ledger` rows to determine which `.cache/<nodeId>.md`
  files must exist. Dies with the ledger.
- **(j) #707, lines 718–758** — `verifyArchiveComplete` unit with `requireLedgerEvidence` — same
  ledger/nodeId keying.
- **(n) #746, lines 1179–1205** — "swallowed epoch-authority refusal fails loud" — its fixture
  (`buildSchema2AuthorityDriftFixture`) drives `depends_on`, `declared_write_set`, roles, and the
  full epoch-lineage envelope (`schema.buildEpochLineage`, `epoch_lineage_id`) purely to produce
  `state_ledger_progress_invalid`. Dies with epoch/re-plan CAS machinery.

**Both (i) and (n) are additionally significant for a second, independent reason:** they assert a
typed `result:refuse` + non-zero exit. ADR 0017's R3 section states the sink's refusal is retired
sink-wide — *"the sink is the last mechanism to lose its verdict... Nothing in the mission-list
design refuses"* — so these two scenarios are doubly dead: dead fixture, and dead verb shape
(`refuse`→ must become a report). (l) and (m) (`sink_blocked` on foreign dirt) and the
`branch_tbd_requires_sink` check inside `#711` also assert `result:refuse`, so while they classify
SURVIVOR on the DAG axis here, they too will need conversion to the report shape once R3 lands —
orthogonal to this triage but likely to bite next.

### SURVIVOR (15)
(a) #694 line 315 · (b) #694 line 359 · (c) #694 line 390 · (c/d) #700 line 256 · (e) #705 line 426 ·
(f) #705 line 462 · (g) #705 line 491 · **(h) #707 line 624** (worktree evidence landing — uses a
`## Node Ledger` fixture only to satisfy the archive evidence-floor precondition; the landing
mechanism itself is a generic git worktree→archive union-copy) · **#711 line 812** (branchless/
in-place sink — same single-node ledger fixture, filler only) · (k) #715 line 879 · (l) #715 line 919
· (m) #715 line 969 · (o) #746 line 1207 (journal-only benign skip) · (p) #832 line 1231
(`removeWorktree` archive-rescue) · **(q) #832 line 1363** (gitignored-archive commit honesty —
`planWithLedger` fixture is filler content, not exercised semantics).

Fixture note for (h)/#711/(q): the DAG-shaped `planWithLedger(rows)` helper provides a plan+ledger
marking N nodes `complete` purely so the sink's archive evidence-floor precondition is satisfied and
does not block the scenario from reaching its actual subject. It is directly replaceable by whatever
the mission-list's own evidence-completeness signal turns out to be (a `result` field pointing at a
path, per ADR 0017's four-field design).

---

## 5. `scripts/test-refusal-route-sweep.js` (2,225 lines) — sweeps `KERNEL_REFUSAL_REGISTRY`

**This suite's entire subject is retired — not because every cell is DAG-specific, but because ADR
0017 retires the refusal mechanism itself.**

By registry-cell count, the large majority *are* DAG/epoch/role-keyed:
- `kernel_write_failed` (4 records): `plan`/`position`/`evidence` are DAG (freeze chain, running-set
  scheduler, per-node evidence write); `forge_chain` is not (generic finalize/forge-chain retry).
- `kernel_cas_lost` (11 records): all 11 are DAG/epoch — `ledger_row`, `evidence_generation` (a
  per-node evidence-generation counter, `adaptive-schema.js:4868`), `review_receipt`/`review_attempt`/
  `review_context` (per-node review journal), `plan_hash`, `parent_plan`, `parent_state`,
  `claim_root`, `replan_source`, `governance_ack` (all epoch/re-plan CAS machinery).
- `kernel_integrity_broken` (18 named anchors): ~17/18 are DAG (`plan_hash`, `ledger_chain`,
  `epoch_lineage`, `epoch_binding`, `snapshot_manifest`, `committed_transactions`, `review_journal`,
  `review_context`, `review_receipt`, `validation_vector`, `reviewer_profile`, `barrier_base`,
  `candidate`, `acceptance_anchor`, `consent_ledger`, `writer_identity`, `legacy_claim_root`); only
  `merge_ancestry` (the forge merge chain) is not.
- `kernel_lock_held` (4 kinds): `replan_fence` and `stale` (running-set scheduler) are DAG;
  `project_claim` and `live_holder` are not — but ADR 0017's watch list explicitly leaves concurrent-
  writer locking **unbuilt** ("two honest live writers on one file... CAS with the conflict returned
  as data" is a watch-list item, not shipped), so this family has no mission-list home either way.
- `kernel_evidence_missing` (2 record kinds): `node_evidence` and `final_fix_register` are both DAG
  (per-node evidence write, sink-owned final-fix register keyed on node certification).
- `sink_verdict` (12 finding kinds + 8 `unattributed_paths` subtypes): mixed — `tests_red`,
  `sink_already_started`, `missing_consent`, `forge_chain_unsettled`, `foreign_archive` are generic;
  `unreviewed_change`, `unsettled_review`, `review_wall_absent`, `candidate_drift`,
  `final_fix_production_surface/_unverified`, and most `unattributed_paths` subtypes
  (`write_set_overflow`/`_granularity`, `lockfile_write`, `mirror_write`, `count_bump`,
  `sensitive_write_unreviewed`) are DAG (declared write sets, review wall, re-plan candidate).
- `consent_required` (1): not DAG at all — it is the A3 consent valve.

**But the decisive fact overrides the cell-by-cell count:** `sink_verdict` *is* R3, and ADR 0017
says R3 "is now a report" — the refusal class is retired regardless of which findings feed it.
`consent_required` is the last surviving code by the old accounting, and ADR 0017 downgrades it too:
*"A durable valve is only needed once a question must outlive the process that asked it; until that
is observed, conversation is the mechanism"* — i.e. no typed registry cell, just the orchestrator
asking. Combined with "the refusal count reaches zero" / "Nothing in the mission-list design
refuses," **the entire `KERNEL_REFUSAL_REGISTRY` + route-contract mechanism this suite sweeps is
retired**, not merely its DAG-tied majority.

**So the suite has no subject left afterwards.** Not "a small non-DAG remainder survives" — zero,
because ADR 0017 kills the typed-refusal/machine-checked-route contract wholesale, a decision that
subsumes and exceeds the DAG-specific fraction. Delete with the registry; nothing to salvage.

---

## 6. `scripts/test-interior-gate-freshness.js` (1,333 lines) and `scripts/test-barrier-base-integrity.js` (660 lines)

**Both confirmed 100% DAG. No SURVIVOR content in either.**

- **test-interior-gate-freshness.js** — 9 numbered sections (`computeLandableBlobEntries` unit;
  interior gate freshness end-to-end; interior REVIEWER gate freshness `#745`; FAIL-OPEN A pin;
  seal-time blob-map corroboration `#750`; GROUP-certifier whole-candidate wall `#751`; fail-closed
  fallback matrix for reviewer roles `#745`; INVESTIGATION-mode gate exemption `#831`; whole-candidate
  freshness on recorded `gate_effect`). Every section drives post-dominance gate certification
  (`--verdict-check`), producer_bindings, and role-scoped reviewer gates — all explicitly retired
  ("post-dominance gates G1–G4", "roles and the role manifest", "declared write sets"). Even the
  seemingly-generic `computeLandableBlobEntries` primitive (section 1, git blob-map digest) is used
  nowhere outside `kaola-workflow-plan-validator.js` and `kaola-workflow-validation-runner.js`, both
  serving only this gate-certification machinery — confirmed by grep, no independent use.
- **test-barrier-base-integrity.js** — 2 scenario blocks: `#368` (lines 36–104, 5 sub-checks T1–T5)
  cross-checks the per-node `.cache/barrier-base-<id>` file against the gc-anchored ref
  `refs/kaola-workflow/barrier/<proj>/<id>`; `#724` (lines 106–660) verifies the whole-plan barrier
  unions sealed parent-epoch write sets, driving `depends_on`, `declared_write_set`, `plan_form:
  spine`, epoch snapshots, and `kaola-workflow-replan.js`. Both are purely per-node/per-epoch
  machinery with no generic-git or generic-finalize content mixed in.

---

## Summary

| Suite | Total | DAG | SURVIVOR | Notes |
|---|---|---|---|---|
| test-claim-hardening.js | 38 groups (~6,251 lines) | 8 groups (~55% of lines) | 30 groups (~45%) | 3 of the 8 DAG groups (#522/#816/#837, cmdFinalize) test a SURVIVOR requirement ADR 0017 says must be re-pointed, not deleted |
| test-gap-sweep.js | 24 | 1 (mixed) | 23 | script itself survives; only `in_run_repair` reason class dies |
| test-run-chains.js | 41 | 0 | 41 | T29 tests a survivor requirement hosted in a dying script |
| test-sink-merge.js | 18 | 3 | 15 | (i)/(n) also test the R3 refusal shape being retired independently |
| test-refusal-route-sweep.js | registry sweep, not scenario-counted | ~80%+ of cells | 0 (post-ADR-0017) | entire refusal mechanism retired, not just DAG cells |
| test-interior-gate-freshness.js | 9 sections | 9 (100%) | 0 | — |
| test-barrier-base-integrity.js | 2 blocks | 2 (100%) | 0 | — |

**Gap-sweep verdict:** `kaola-workflow-gap-sweep.js` detects 3 reason classes
(`scripts/kaola-workflow-gap-sweep.js:35–140`): `in_run_repair` (nodeId-keyed, dies outright),
`deferred_red_chain` (chain-receipt-keyed, fully survives), `manual:*` (operator free text, fully
survives). The gate half (`:258–487`) is generic and survives entirely. The script SURVIVES; it just
needs to drop or re-derive one of its three reason classes.
