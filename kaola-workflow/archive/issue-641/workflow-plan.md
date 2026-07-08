# Workflow Plan — issue-641

<!-- plan_hash: db326648f1678a4884a31cf8a7b9d1f79d255f6d9fb04152ecf43b7a94bb523b -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

Relax the two over-conservative read∥write concurrency guards in the adaptive scheduler (G1 read-first
partition + G2 `write_awaits_drain`) while KEEPING the other 17 guards the issue's audit proved load-
bearing. Two slices, BOTH approved for this run: R1 (default-on, structural) — a leg-contained writer
co-opens behind live reads (the mirror of the shipped #622 read-direction relaxation; reuse the #596
size-1 lane-group machinery; retain the G4 `merge_awaits_read_drain` fence), fail-closed on legCoupled +
parent-clean (G5) + `--parallel-safe` ok (G6/G7/G13) + no live lane_group (G8), any miss → today's hold
byte-identical with a typed `serialDegradeReason`. R2 (consent-tier) — a freeze-validated `observes:
scratch` node annotation (legal ONLY on an adversarial-verifier read node; the freeze validator REFUSES
it on code-reviewer/security-reviewer/main-session-gate), hash-covered, that permits a LEGLESS writer
co-open ONLY when the writer's declared set ⊆ (allowband docs MINUS #547 test-consumed prose, per
`isValidationInvisible`) ∪ its own evidence file.

This is fully DIAGNOSED (the issue carries the guard inventory, exact line refs, the R1/R2 designs, the
(role, write-target) qualification matrix, and rejected alternatives), so this is a build DAG, not a
shape-first investigation. It is ONE cohesive cross-edition change spanning THREE generated aggregators
(`kaola-workflow-plan-validator.js`, `kaola-workflow-adaptive-schema.js`, `kaola-workflow-adaptive-node.js`),
each ×4 editions. The generated-aggregator coupling (`generated_port_split`) + the #340 forge-port
ordering rule force each aggregator's root + all its ports into a SINGLE node, and R2 is one feature whose
freeze contract (validator) and consumer (adaptive-node legless co-open) are two ends of one module
boundary — so they move ATOMICALLY in one implement node (no per-node file-count ceiling; a coherent
generated-aggregator write set stays in one node). Correctness is the driver (precedence #1): this is a
subtle concurrency + freeze-grammar change, and the four-chain suite is partly CIRCULAR (`npm test`
exercises the very adaptive-node scheduler being changed) — hence a read-only `adversarial-verifier` that
RUNS the reproductions and asks "invariant preserved, or symptom-masked green?" as a non-redundant gate.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-relax-scheduler | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/test-validation-allowband.js, scripts/test-adaptive-handoff.js, scripts/simulate-workflow-walkthrough.js | 16 | sequence | reasoning | — |
| n2-review | code-reviewer | n1-relax-scheduler | — | 1 | sequence | reasoning | — |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning | — |
| n4-docs | doc-updater | n3-adversary | docs/decisions/D-641-01.md, docs/architecture.md, docs/plan-run-cards/frontier-batch.md, docs/workflow-state-contract.md | 4 | sequence | standard | — |
| n5-finalize | finalize | n4-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **One atomic implement node, NOT split (grammar-forced + contract-coherent).** The change spans three
  GENERATED aggregators — `kaola-workflow-plan-validator.js`, `kaola-workflow-adaptive-schema.js`
  (byte-identical group), `kaola-workflow-adaptive-node.js` — each with a canonical + codex twin + two
  forge-renamed ports. `generated_port_split` forces any node editing a root to also declare all four of
  that aggregator's edition files; the #340 forge-port ordering rule forbids a port-writing node from
  sitting upstream of a later root edit — so an aggregator's root + ports cannot be split across serial
  nodes. R1 (adaptive-node) and R2b (adaptive-node legless co-open) therefore CANNOT be two nodes (both
  edit `adaptive-node.js`), and R2a (the validator freeze contract) and R2b (its adaptive-node consumer)
  are two ends of ONE module boundary (adaptive-node `require`s the new plan-validator predicate). Keeping
  all three slices in one node keeps that validator↔adaptive-node contract inside one agent (no cross-agent
  seam on a security-critical invariant) and keeps the scheduler drain-hold region coherent. This is not
  scope-widening — it is one file-coupled cross-edition change; parallelism is a means, not a goal
  (precedence #3), and this scope genuinely does not decompose into disjoint files. NEVER hand-add
  `parallel_safe`.
- **The node edits CANONICAL for each aggregator, then regenerates the ports** via `npm run sync:editions`
  ( `--write`); `edition-sync.js --check` (in the gitlab/gitea chains) verifies byte-identity of the
  regenerated plan-validator + adaptive-node ports, and `validate-script-sync.js` verifies the
  adaptive-schema byte-identical group (all four copies keep the CANONICAL name — the gitlab/gitea schema
  files are NOT forge-renamed). If R2 needs a shared forge-neutral constant (e.g. the annotation token),
  add it to the schema and it propagates to all four copies through the same sync; if the annotation is
  fully expressible inside the plan-validator, the schema copies stay untouched (under-write with a
  skip-reason is safe — they are declared defensively).
- **CLAUDE-ONLY test surfaces.** `scripts/test-adaptive-node.js` (the scheduler/validator unit surface —
  home of `runOpenNext` / lane-group / evidence-shape / annotation-refusal tests), `scripts/test-validation-allowband.js`
  (the `isValidationInvisible` band predicate R2 reuses), `scripts/test-adaptive-handoff.js` (the freeze
  transaction where a new annotation-refusal is asserted end-to-end), and `scripts/simulate-workflow-walkthrough.js`
  are CLAUDE-ONLY — the codex/forge walkthroughs test DIFFERENT surfaces and are NEVER byte-synced
  (`validate-script-sync.js` note), so no edition copies of these four are declared. The walkthrough is
  declared defensively (a scheduler behavior change plausibly forces an integration-assertion update, a
  co-mover that must not stall the run); under-write with a skip-reason is safe if it is not touched.
- **n1-relax-scheduler (tdd-guide, reasoning) — implements all three slices, RED-first, one at a time:**
  - **R1 (default-on, structural)** — relax only the G2 `write_awaits_drain` else-branch (adaptive-node.js
    ~`:4532-4535`): when the frontier is write-only and every live member is a read, attempt a
    leg-contained lane-group open (a lone writer forms a size-1 group, reusing the #596 speculative-write
    group machinery verbatim — `closeGroupMember` already degenerates to "last member" for size 1) under
    EXACTLY four preconditions, each fail-closed to today's hold: (1) `legCoupled`
    (`parallelWritesDefaultOn`; `KAOLA_PARALLEL_WRITES=0` forces the hold — G12); (2)
    `parentCarriesProductionDirt() === pass` (G5); (3) validator `--parallel-safe` ok across {candidates ∪
    live writes} (G6/G7/G13); (4) no live `lane_group` descriptor (G8). Leave the G1 read-first partition
    (`:4389`) UNCHANGED (reads still open tick 1). ANY precondition miss ⇒ the today `write_awaits_drain`
    return, byte-identical envelope, plus a typed `serialDegradeReason` label naming the cause (mirror the
    #616 telemetry pattern). RED: a write-only frontier with only live reads + all four preconditions ok
    co-opens as a leg-contained group (running set carries mixed read + leg-write members) instead of
    holding; the last-member merge STILL refuses `merge_awaits_read_drain` while any read is live (G4
    retained); each fail-closed row (AC2) reproduced with zero mutation + its typed reason; and a mixed
    read+leg-write running set survives crash-reconcile. The #588 mixed-frontier pin STAYS for LEGLESS
    writers (G3).
  - **R2a (consent-tier, validator contract)** — add the `observes: scratch` node annotation to
    `parseNodes` + freeze validation: ACCEPT only on a read node with role `adversarial-verifier`; REFUSE
    (typed) on `code-reviewer`, `security-reviewer`, and `main-session-gate` (their role definition IS
    tree/diff observation, so the annotation is incoherent). Fold the annotation into the hash-covered
    surface so `plan_hash` changes when it changes (tamper-evident). Expose the co-open legality predicate
    adaptive-node will consume: a writer's declared set ⊆ (`isValidationInvisible` allowband — allowband
    docs MINUS #547 test-consumed prose, PV:293) ∪ the writer's own `.cache` evidence file. RED (in
    `test-validation-allowband.js` for the band predicate + `test-adaptive-handoff.js` for the freeze
    refusal): `observes: scratch` on an adversarial-verifier freezes; on a code-reviewer / security-reviewer
    / main-session-gate the handoff returns `plan_invalid` with a typed reason; the predicate admits
    `docs/decisions/**` + non-test-consumed `docs/**` but rejects `docs/api.md` / `CHANGELOG.md` /
    `README.md`.
  - **R2b (consent-tier, adaptive-node consumer)** — when the write-only-frontier + live-reads shape holds
    but R1's leg path does NOT apply (a LEGLESS parent writer that must see uncommitted context), permit the
    co-open of an `observes: scratch` adversarial-verifier ∥ legless writer IFF the writer's declared set
    satisfies R2a's predicate; the dispatch card the aggregator composes for that annotated node PINS the
    observation contract ("verdict from `.cache` evidence of closed nodes + scratch only; do not read the
    worktree tree or diff"). Annotation ABSENT ⇒ serialize (today's behavior, byte-identical). RED (in
    `test-adaptive-node.js`): annotated-gate ∥ `docs/decisions/**` legless writer co-opens; annotated-gate
    ∥ `docs/api.md` / `CHANGELOG.md` writer holds; un-annotated gate ∥ any shared-tree writer holds.
  - `reasoning` because R1's fail-closed matrix + the retained G4 merge fence + the byte-identical serial
    fallback (AC5) and R2's freeze-grammar refusals + hash-coverage + the legless-co-open band predicate are
    reasoning-bounded correctness (partly novel — R2 has no production precedent, unlike R1's #622 mirror),
    and rework here is the most expensive outcome (precedence #1).
- **Serial-fallback byte-identity (AC5) is a first-class assertion**, not an afterthought: with
  `KAOLA_PARALLEL_WRITES=0` + no running set + ≤1 in_progress, every touched path stays byte-identical to
  main. The `serialDegradeReason` label is `null` (no field emitted) on every non-relaxed degrade cause so
  the two pre-existing serial-degrade causes stay distinguishable (mirror #616).
- **n2-review (code-reviewer, reasoning)** post-dominates the sole code node n1 (G1). `reasoning` because
  this is subtle cross-edition concurrency + freeze-grammar correctness — the review must confirm the R1
  fail-closed matrix (each precondition miss → byte-identical hold), that G4/G3/G5–G8 stay intact, the R2
  freeze refusals + hash-coverage, the byte/rename edition parity of all three aggregators, and AC5 serial
  byte-identity. It runs `validation_command` (the four chains — the #307 cross-edition obligation, since
  the diff touches the edition trees) sequentially.
- **n3-adversary (adversarial-verifier, reasoning)** — read-only with Bash; RUNS the reproductions (the R1
  co-run → mixed running set + the merge fence held while reads live; each AC2 fail-closed row → today's
  hold byte-identical; the mixed-running-set crash-reconcile; the R2 freeze refusals and the legless-co-open
  band cap) and asks "closed-work-observation invariant PRESERVED (by isolation for R1, by contract for
  R2), or symptom-masked green?" Non-redundant with n2 (diff-reading) and with the four-chain suite (partly
  CIRCULAR — `npm test` exercises the very adaptive-node scheduler under change). Read-only, so no write set.
- **n4-docs (doc-updater, standard)** — records the durable contract changes, GROUNDED in the actual diff
  (not fabricated): a NEW decision record `docs/decisions/D-641-01.md` (D-641-01 is the next free id — the
  next-numbered record after the existing series) covering the G1/G2 relaxation, the R1 leg-contained co-open + retained G4
  fence, and the R2 `observes: scratch` contract; `docs/architecture.md` (running-set scheduler
  exclusivity / read∥write co-open section); `docs/plan-run-cards/frontier-batch.md` (the
  `write_awaits_drain` reason semantics + the new `serialDegradeReason` label + the R2 annotation);
  `docs/workflow-state-contract.md` (the leg-contained co-open / merge-fence contract note). NO
  `CHANGELOG.md` here (PROTECTED file kept on the sink). Depends on n3-adversary (NOT parallel with it): on
  the current pre-#641 scheduler a docs WRITE behind a live gate READ serializes anyway (`write_awaits_drain`
  — the very hold this issue fixes), so parallel authoring buys nothing at runtime and risks documenting a
  pre-reopen tree; serial-after-adversary documents the final adversary-approved state and keeps the
  test-consumed `docs/workflow-state-contract.md` edit strictly clear of the gate's chain runs. Under-write
  any doc that proves unnecessary with a skip-reason (safe).
- **n5-finalize (finalize)** — unique docs/state sink; writes only `CHANGELOG.md` (`[Unreleased]`). Depends
  on n4-docs. Because it post-dominates every code node and lands after docs, the four-chain finalize
  receipt is generated over the final post-docs tree (the #547 code-tree hash includes the test-consumed
  `docs/workflow-state-contract.md` + `CHANGELOG.md` edits), so no `chains_stale` gap.
- **Scope boundaries (surgical — touch only what the task requires).** NO routing-surface (#400 six-surface)
  edits: the "dispatch-pinned" R2 observation contract is composed by `adaptive-node.js` when it opens the
  annotated node (already in n1's write set), and no user-facing routing prose describes the read∥write
  hold today (AC6 is conditional — "if any routing-surface prose is added"; none is required for the
  mechanism, matching the #622 co-open precedent which touched no routing surfaces). NO planner-agent-profile
  edit teaching `observes: scratch`: the freeze-time predicate itself guides the planner (a bad annotation
  refuses), and the issue scopes R2 to the mechanism; teaching the planner to author it is a separate
  follow-up. NO new agent/role ⇒ NO agent-registration surface. If the reviewer/adversary judges a
  routing-surface or planner-profile note genuinely required, that is a filed follow-up, not silent
  scope-creep.
- **No security-reviewer (G2)**: labels carry no security sensitivity (efficiency/scripts; the issue's
  labels are empty). **No main-session-gate (G3)**: acceptance is fully machine-checkable — RED-first tests
  (co-run, merge fence, each fail-closed row, crash-reconcile, R2 freeze refusals), the four chains, and the
  adversarial reproductions; no GPU/visual/device/human-signoff hinge. **No knowledge-lookup**: every
  design decision is confirmable in-repo (the cited line numbers, the #622/#596/#615/#616 precedents, the
  `isValidationInvisible` predicate at PV:293).

## Node Ledger

| id | status |
| --- | --- |
| n1-relax-scheduler | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-docs | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-relax-scheduler) | subagent-invoked | evidence-binding: n1-relax-scheduler ae07e8754897 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 70c6071464c4 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary de189afb38cb | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 5b2d36d49d32 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 38a5a128a814 | |
