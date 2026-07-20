# Workflow Plan — issue #725 (epic Phase E: mega-test overlap prune)

<!-- plan_hash: ca05e3d9d5b4c9112341deb5bd6067d698593507794c567ea08dfaf2cac23905 -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
goal: finish issue 725 — Phase E mega-test overlap prune, then close the epic.
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
validation_command: npm test && node scripts/test-mega-mutation-spotcheck.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n9-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Plan Notes

Fresh epoch-1 plan for the FINAL phase (E) of the issue #725 adaptive-only epic. Phases A–D are
already shipped on main (run base `3907fb18`); this run authors Phase E only ("mega-test overlap
prune") and, on success, closes the epic. `test-adaptive-node.js` (~19,001 lines) and
`simulate-workflow-walkthrough.js` (~19,204 lines) cover the adaptive lifecycle at two altitudes with
a large duplicate band. The phase prunes that duplicate band while keeping each altitude's unique
value, consolidates the 4× bundle-claim entrypoint asserts to a single keeper, and adds a persistent
mutation spot-check gate — all claude-chain-only test surfaces (none live in the edition trees, none
are in `validate-script-sync.js`/`edition-sync.js` byte groups, none have codex twins or forge ports),
so no cross-edition mirror is required.

Map-first, single-writer-gate-per-leg shape (the #739 discipline): `n1-dedup-map` builds the dedup map
FIRST as read-only evidence and is a true upstream dependency of BOTH prune writers — no prune lands
without a map row. The two prune writers are a genuine antichain over DISJOINT files
(`n2-overlap-prune` writes the two altitude files; `n4-bundle-claim-consolidate` writes the two claim
test files), so the validator derives `parallel_safe` and they co-open in isolated legs. Each writer
carries its OWN interior adversarial change gate (`n3`, `n5`) that certifies only that writer; there
is NO bundle-wide gate acting as the sole per-writer verifier, so a fail is localized to one
writer+its gate (reopen-node repair) and never escalates to a whole-antichain replan. `n6` adds the
distinct mutation spot-check deliverable and is itself interior-gated by `n7`. `n9-code-certify` is
the single required schema-2 common CODE certifier wall (G1) that post-dominates every code producer
(`n2`, `n4`, `n6`); it reviews the final accumulated tree and runs the recorded validation command —
it is the holistic G1 wall, not the per-writer localizer.

Explicitly KEEP (do NOT prune their coverage): `scripts/test-plan-run.js` (only coverage of the
`$KAOLA_SCRIPTS` shell plumbing) and `scripts/test-barrier-base-integrity.js` (plan-validator baseline
distinct from commit-node). Neither is in any write set; `n9` verifies both remain untouched.

No `security-reviewer` / no inherited frontier: Phase E touches only claude-chain test files, a new
test script, and docs — no auth, no untrusted-input execution, no credential or path-resolution
surface, and no sensitive label — so `security_certifier: none`, `inherited_frontier_classes: none`.
This is a fresh epoch-1 authoring (no replan lineage); the frozen parent lineage fields do not apply.

Validation posture (epic close, AC-6): even though the Phase E diff is claude-chain-only, the epic's
final sink wants the FULL four-chain receipt. The recorded `validation_command` is `npm test`
(claude && codex && gitlab && gitea, run serially by `&&`) plus the new
`node scripts/test-mega-mutation-spotcheck.js`, so the four-chain gate AND the mutation gate are both
receipt-covered at certify and finalize. KNOWN-HOST GOTCHA: when the main session drives the chains
via `run-chains.js`, it MUST use `KAOLA_RUN_CHAINS_CONCURRENCY=serial` — `auto` concurrency
jetsam-SIGKILLs the git-merge-octopus step inside `test-adaptive-node.js` on this macOS box. Raw
`npm test` is already serial by `&&`, so it is safe. Always capture the real exit code / success
sentinel, never a piped `| tail`.

The mutation spot-check (`scripts/test-mega-mutation-spotcheck.js`) is a persistent, committed gate
artifact: it reintroduces 3–5 historical closed-issue bug shapes into ISOLATED copies (never the
working tree) and asserts the pruned suite stays RED on each. It is NOT wired into the default claude
chain (that would undo Phase B's receipt diet); it is enforced here through the recorded
`validation_command` at certify/finalize and stays re-runnable on demand for future mega-test edits.

No decision record is authored here: the superseding ADR for the adaptive-only axis was filed in
Phase A; Phase E adds no user-owned-contract change. Provenance (issue refs, ADR/decision IDs) stays
out of any agent-facing prompt surface — none of the Phase E write sets is a prompt surface;
CHANGELOG provenance lives in CHANGELOG only.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-dedup-map | code-explorer | — | — | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-overlap-prune | implementer | n1-dedup-map | scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 2 | sequence | — | standard | — | — | — | — | — | — |
| n3-falsify-overlap-prune | adversarial-verifier | n2-overlap-prune | — | 1 | sequence | — | reasoning | — | — | every assert pruned from test-adaptive-node.js or simulate-workflow-walkthrough.js has its invariant genuinely preserved at the OTHER altitude per the n1 dedup map (no coverage lost): the unit file retains all refusal seams, envelope shapes, and fault-injection cases, the walkthrough retains every end-to-end journey and cross-process behavior INCLUDING the kept bundle-lane journey, the remaining claude chain stays green, and the measured overlap band is cut at least 25 percent | the accumulated diff on test-adaptive-node.js and simulate-workflow-walkthrough.js vs run base 3907fb18, cross-checked against the n1 dedup map's invariant to other-altitude file:line citations and the recorded pre-prune overlap-band measurement | sequence | n2-overlap-prune |
| n4-bundle-claim-consolidate | implementer | n1-dedup-map | scripts/test-bundle-state.js, scripts/test-claim-hardening.js | 2 | sequence | — | standard | — | — | — | — | — | — |
| n5-falsify-bundle-consolidate | adversarial-verifier | n4-bundle-claim-consolidate | — | 1 | sequence | — | reasoning | — | — | every bundle-claim entrypoint assert dropped from test-bundle-state.js and test-claim-hardening.js is still covered by test-bundle-claim.js and the retained walkthrough bundle-lane journey (no bundle-claim coverage lost), and no non-bundle-claim assertion in either file was disturbed | the accumulated diff on test-bundle-state.js and test-claim-hardening.js vs run base 3907fb18, cross-checked against test-bundle-claim.js and the walkthrough bundle-lane journey retained as the single keeper | sequence | n4-bundle-claim-consolidate |
| n6-mutation-spotcheck | tdd-guide | n3-falsify-overlap-prune, n5-falsify-bundle-consolidate | scripts/test-mega-mutation-spotcheck.js | 1 | sequence | — | standard | — | — | — | — | — | — |
| n7-falsify-mutation | adversarial-verifier | n6-mutation-spotcheck | — | 1 | sequence | — | reasoning | — | — | the mutation spot-check harness genuinely fails (stays RED) on each of the 3 to 5 reintroduced historical bug shapes by running the ACTUAL pruned suite, the mutations are real closed-issue bug shapes applied to isolated copies (never the working tree), and the harness cannot pass trivially or without running the suite | scripts/test-mega-mutation-spotcheck.js and its execution: each reintroduced bug shape, the isolated-copy mutation mechanism, and proof that removing any single pruned-away invariant's coverage would flip a mutation from red to green | sequence | n6-mutation-spotcheck |
| n8-docs | doc-updater | n7-falsify-mutation | CHANGELOG.md, docs/conventions.md | 2 | sequence | — | standard | — | — | — | — | — | — |
| n9-code-certify | code-reviewer | n8-docs | — | 1 | sequence | — | reasoning | — | — | the complete Phase E candidate satisfies AC-E and introduces no regression: the measured overlap band is cut at least 25 percent with every pruned invariant preserved at the surviving altitude per the dedup map, the bundle-claim consolidation keeps exactly one keeper (test-bundle-claim.js plus the walkthrough bundle-lane journey), the mutation spot-check stays red on every reintroduced bug shape, test-plan-run.js and test-barrier-base-integrity.js coverage is untouched, and the recorded validation command is green across all four npm chains plus the mutation spot-check | the entire Phase E accumulated diff vs run base 3907fb18 — both altitude test files, the two bundle-claim consolidation files, the new mutation spot-check script, and the CHANGELOG/conventions documentation — validated by running the recorded validation_command end to end | sequence | — |
| n10-finalize | finalize | n9-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-dedup-map

Read-only analysis; the map is the gating input to every prune and is written to this node's evidence
file `kaola-workflow/issue-725/.cache/n1-dedup-map.md`. Two deliverables:

1. MEASURE the overlap band. Define and record a concrete, reproducible measure of the duplicate band
   between `scripts/test-adaptive-node.js` and `scripts/simulate-workflow-walkthrough.js` (e.g. count
   of asserts / test-case blocks whose invariant is covered at both altitudes). Record the exact
   before-number and the method so the ≥25% reduction in AC-E can be recomputed after the prune.
2. BUILD the dedup map. For each candidate assert to prune, write one row: the invariant it checks,
   which altitude KEEPS it, and the exact `file:line` where the OTHER altitude covers the same
   invariant. Enforce the division of labor: the unit file (`test-adaptive-node.js`) keeps refusal
   seams / envelope shapes / fault injection; the walkthrough keeps end-to-end journeys
   (claim→freeze→nodes→barrier→sink) and cross-process behavior. Mark the walkthrough's existing
   bundle-lane E2E journey (around `simulate-workflow-walkthrough.js:15893`/`:17727`) as KEEP — it is
   the designated bundle-claim keeper the consolidation relies on, so the overlap prune must NOT
   remove it. Also map the 4× bundle-claim entrypoint asserts: `test-bundle-claim.js` + the walkthrough
   journey KEEP; `test-bundle-state.js` and `test-claim-hardening.js` copies DROP — cite where the
   keeper covers each dropped invariant. EXPLICITLY EXCLUDE from all prune scope: `test-plan-run.js`
   ($KAOLA_SCRIPTS shell plumbing — unique) and `test-barrier-base-integrity.js` (plan-validator
   baseline — unique). No prune without a map row is the hard rule the downstream gates enforce.

### n2-overlap-prune

Read `kaola-workflow/issue-725/.cache/n1-dedup-map.md` FIRST; prune ONLY what has a map row.
`non_tdd_reason`: this is a coverage-preserving refactor of test files (removing duplicate asserts),
not a behavioral fix — there is no failing-unit-test-first; the safety oracle is that the remaining
claude chain stays green and the downstream mutation spot-check proves no unique coverage was lost, so
`implementer`, not `tdd-guide`. Write set is exactly the two altitude files.

In `scripts/test-adaptive-node.js`: drop the asserts the map assigns to the walkthrough altitude
(end-to-end journey / cross-process duplicates); KEEP every refusal seam, envelope-shape, and
fault-injection case. In `scripts/simulate-workflow-walkthrough.js`: drop the asserts the map assigns
to the unit altitude (refusal-seam / envelope-shape duplicates); KEEP every end-to-end journey and
cross-process behavior AND the bundle-lane E2E journey marked KEEP by the map. Do not touch
`test-plan-run.js` or `test-barrier-base-integrity.js` (out of scope). After pruning, run the two files
and confirm they are green: `node scripts/test-adaptive-node.js` and
`node scripts/simulate-workflow-walkthrough.js` (real exit 0, success sentinel). Recompute the
overlap-band number by the map's method and confirm ≥25% reduction. These two files are claude-only —
no codex twin, no forge port, not in `validate-script-sync.js`/`edition-sync.js` byte groups — so edit
in place with no mirror.

### n3-falsify-overlap-prune

Interior adversarial change gate for `n2-overlap-prune` (certifies it). Read the n1 dedup map and the
n2 evidence/diff first. Try to REFUTE the headline claim: find any pruned assert whose invariant is
NOT genuinely covered at the cited other-altitude `file:line` (a coverage hole), any kept-side over-
prune (a refusal seam / envelope shape / fault-injection case lost from the unit file, or an
end-to-end journey / cross-process behavior — including the bundle-lane keeper — lost from the
walkthrough), any map row that misattributes coverage, or a measured band reduction below 25%. Run
`node scripts/test-adaptive-node.js` and `node scripts/simulate-workflow-walkthrough.js` and confirm
green. Record a gate verdict (lowercase `verdict: pass` / `verdict: fail` with `findings_blocking`),
not implementation advice; pass only if no counterexample survives.

### n4-bundle-claim-consolidate

Read the n1 dedup map FIRST; drop ONLY the bundle-claim entrypoint copies it marks DROP.
`non_tdd_reason`: coverage-preserving refactor (removing duplicate entrypoint asserts) with no
failing-test-first — `implementer`. Write set is exactly `scripts/test-bundle-state.js` and
`scripts/test-claim-hardening.js`. Remove their duplicate bundle-claim entrypoint asserts, leaving
`test-bundle-claim.js` and the walkthrough bundle-lane journey as the single keeper (do NOT edit
`test-bundle-claim.js` or the walkthrough here — those keepers are out of this node's write set; the
walkthrough belongs to n2). Do not disturb any non-bundle-claim assertion in either file. After the
drop, run `node scripts/test-bundle-state.js` and `node scripts/test-claim-hardening.js` (real exit 0)
and confirm `node scripts/test-bundle-claim.js` still passes. Both files are claude-only — no mirror.

### n5-falsify-bundle-consolidate

Interior adversarial change gate for `n4-bundle-claim-consolidate` (certifies it). Read the n1 map and
the n4 diff first. Try to REFUTE: any dropped bundle-claim invariant NOT still covered by
`test-bundle-claim.js` or the retained walkthrough bundle-lane journey (a coverage hole), or any
non-bundle-claim assertion accidentally disturbed in `test-bundle-state.js` / `test-claim-hardening.js`.
Run the three relevant suites green. Record a gate verdict; pass only if no counterexample survives.

### n6-mutation-spotcheck

Distinct Phase E deliverable: author `scripts/test-mega-mutation-spotcheck.js`, a persistent, committed
gate artifact (not a throwaway). It reintroduces 3–5 historical bug shapes sourced from closed-issue
repro notes (e.g. the barrier `.cache`-exemption / evidence-path bugs, the gate `verdict` finding-line
gotcha, a selector/ledger-advance bug — pick concrete, documented shapes), applies each mutation to an
ISOLATED copy of the relevant source in `$TMPDIR` (NEVER the working tree), runs the pruned suite
(`test-adaptive-node.js` / `simulate-workflow-walkthrough.js` / the bundle-claim keepers) against the
mutated copy, and asserts the suite goes RED (non-zero) on each — i.e. the pruned suite still catches
every reintroduced bug. The harness exits 0 only when ALL mutations are caught. It self-cleans its
temp copies and reads the recorded validation command / suite scripts to invoke them. Depends on both
prune legs (n3, n5 complete) so it runs against the FINAL pruned suite. Verify `node
scripts/test-mega-mutation-spotcheck.js` exits 0. Do NOT wire it into the default claude chain in
`package.json` (that would undo Phase B's receipt diet); it is enforced via the recorded
`validation_command` at certify/finalize and stays re-runnable on demand. `tdd-guide`: this is
red/green test-coverage work whose oracle is the mutation-catch matrix.

### n7-falsify-mutation

Interior adversarial change gate for `n6-mutation-spotcheck` (certifies it). Try to REFUTE that the
harness is a real gate: confirm each of the 3–5 mutations is a genuine historical bug shape (not a
no-op), that the harness runs the ACTUAL pruned suite (not a stub), that it mutates isolated copies and
never the working tree, and that it cannot pass trivially — verify that if the pruned suite had dropped
a needed invariant, the corresponding mutation would flip red→green and the harness would fail. Run
`node scripts/test-mega-mutation-spotcheck.js` and confirm exit 0. Record a gate verdict; pass only if
the harness is a genuine, non-bypassable coverage gate.

### n8-docs

Read the n1–n7 evidence first. Docs only (no code). Write `CHANGELOG.md` BEFORE the certifier runs the
chains (otherwise the validation receipt is `chains_stale`): add one `[Unreleased]` entry recording
Phase E — the mega-test overlap prune with the measured band reduction, the bundle-claim entrypoint
consolidation to a single keeper, and the new persistent mutation spot-check gate
(`scripts/test-mega-mutation-spotcheck.js`, how/when to run it). In `docs/conventions.md` add a small,
additive testing-conventions note (do NOT disturb any existing pinned phrase) recording the durable
two-altitude division of labor: `test-adaptive-node.js` owns refusal seams / envelope shapes / fault
injection; `simulate-workflow-walkthrough.js` owns end-to-end journeys (claim→freeze→nodes→barrier→
sink) and cross-process behavior; the bundle-claim entrypoint has one keeper (`test-bundle-claim.js`
plus the walkthrough bundle-lane journey); and the mutation spot-check must stay red on each
reintroduced bug shape. No provenance (issue refs, ADR/decision IDs) in any prompt surface — these are
not prompt surfaces, but keep CHANGELOG provenance in CHANGELOG only. No decision record (the
adaptive-only ADR was filed in Phase A).

### n9-code-certify

Named schema-2 common CODE certifier wall (G1) post-dominating every code producer (n2, n4, n6). Read
the issue body (AC-E and the epic AC-6), the n1 dedup map, and the n2–n8 evidence/diffs. Verify against
the actual accumulated diff vs run base `3907fb18`: (a) the measured overlap band is cut ≥25% by the
map's own method; (b) every pruned invariant is preserved at the surviving altitude per the map — no
coverage hole, no kept-side over-prune; (c) the bundle-claim consolidation keeps exactly ONE keeper
(`test-bundle-claim.js` + the walkthrough bundle-lane journey) and drops only the duplicate copies;
(d) `test-plan-run.js` and `test-barrier-base-integrity.js` are untouched; (e) the mutation spot-check
stays red on every reintroduced bug shape (real historical shapes, isolated copies). Then RUN the
recorded `validation_command` end to end over the final tree with REAL exit codes:
`npm test && node scripts/test-mega-mutation-spotcheck.js` — all four npm chains green plus the
mutation gate. On this host, if driving the chains through `run-chains.js`, use
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` (raw `npm test` is already serial by `&&`); if a chain reds under
`npm test`'s short-circuit, run the failing chain's commands individually to locate the exact failure.
Record `verdict: pass` / `findings_blocking: 0` only if all hold; otherwise record the blocking
findings.

### n10-finalize

Unique sink. This is the EPIC-CLOSING finalize. Confirm the fresh validation receipt from
`n9-code-certify` (four npm chains + mutation spot-check green) and that the named code certifier and
all three interior adversarial gates are complete; do NOT re-run the chains or write any
chain-asserted doc here (that would stale the receipt — CHANGELOG was written in n8). Close issue #725
(the epic — all five phases A–E now shipped), drop the `workflow:in-progress` label, and let the
finalize transaction remove `kaola-workflow/.roadmap/issue-725.md` and regenerate
`kaola-workflow/ROADMAP.md`. Docs/state only.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-dedup-map) | subagent-invoked | evidence-binding: n1-dedup-map b15c42d5d73d | |
| implementer (n2-overlap-prune) | subagent-invoked | evidence-binding: n2-overlap-prune c5205c75b0d9; barrier: group_passed | |
| adversarial-verifier (n3-falsify-overlap-prune) | subagent-invoked | evidence-binding: n3-falsify-overlap-prune 2461bc5cfa1a | |
| implementer (n4-bundle-claim-consolidate) | subagent-invoked | evidence-binding: n4-bundle-claim-consolidate 6859243b6b47; barrier: deferred_to_group | |
| adversarial-verifier (n5-falsify-bundle-consolidate) | subagent-invoked | evidence-binding: n5-falsify-bundle-consolidate 7be9cef9d217 | |
| tdd-guide (n6-mutation-spotcheck) | subagent-invoked | evidence-binding: n6-mutation-spotcheck 285f0b82afae | |
| adversarial-verifier (n7-falsify-mutation) | subagent-invoked | evidence-binding: n7-falsify-mutation 056912cb74d4 | |
| doc-updater (n8-docs) | subagent-invoked | evidence-binding: n8-docs 475e1d2880ad | |
| code-reviewer (n9-code-certify) | subagent-invoked | evidence-binding: n9-code-certify d49b89a7a722 | |
| finalize (n10-finalize) | pending | | |

## Node Ledger

| id | status |
| --- | --- |
| n1-dedup-map | complete |
| n2-overlap-prune | complete |
| n3-falsify-overlap-prune | complete |
| n4-bundle-claim-consolidate | complete |
| n5-falsify-bundle-consolidate | complete |
| n6-mutation-spotcheck | complete |
| n7-falsify-mutation | complete |
| n8-docs | complete |
| n9-code-certify | complete |
| n10-finalize | complete |
