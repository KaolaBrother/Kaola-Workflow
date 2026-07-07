# Workflow Plan — bundle-621-622-633

<!-- plan_hash: 0501e1993a317331e7fce71ef3df674b0484f977bae883a561fc5c25b1b3fd18 -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

Bundle of three adaptive-scheduler bug/perf fixes, all landing in the SAME file
`scripts/kaola-workflow-adaptive-node.js` (a GENERATED_AGGREGATOR) with their RED tests in the SAME
surface `scripts/test-adaptive-node.js`. All three are DIAGNOSED (each roadmap source carries an
explicit P2 next-step with exact line numbers and a prescribed fix direction), so this is a build DAG,
not a shape-first investigation. The three fixes are ONE cohesive cross-edition change: the generated-
aggregator coupling (`generated_port_split`) forces every root edit to also carry the codex twin + two
forge ports in the SAME node, and the forge-port ordering rule (#340) forbids a port-writing node from
sitting upstream of a later root edit — so splitting the three fixes across serial nodes is grammar-
impossible (validator: `forge-port ordering gap`). They therefore move ATOMICALLY in one implement node
(no per-node file-count ceiling; a coherent generated-aggregator write set stays in one node). Three
distinct RED-first tests (one per bug) still land in that node's `test-adaptive-node.js`. Correctness is
the driver (precedence #1): these are subtle concurrency fixes — a crash-window re-order (#621), an
exclusivity-invariant relaxation that co-runs reads with live write legs (#622), and a git untracked-vs-
tracked merge collision hit LIVE in a prior run (#633). A passing unit test can mask an incomplete fix
(reintroduce the race / merge collision), and the four-chain suite is partly CIRCULAR here — `npm test`
exercises the very adaptive-node scheduler being changed. Hence a read-only `adversarial-verifier` that
RUNS the reproductions (the crash windows, the mixed read+write frontier, the 2-member lane group with
real evidence) and asks "root-cause fixed, or symptom-masked?" as a non-redundant gate.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-scheduler-fixes | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 6 | sequence | standard | — |
| n2-review | code-reviewer | n1-scheduler-fixes | — | 1 | sequence | reasoning | — |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning | — |
| n4-docs | doc-updater | n2-review | docs/decisions/D-622-01.md, docs/architecture.md, docs/plan-run-cards/frontier-batch.md, docs/workflow-state-contract.md | 4 | sequence | standard | — |
| n5-finalize | finalize | n3-adversary, n4-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **One atomic implement node, NOT three (grammar-forced).** `kaola-workflow-adaptive-node.js` is a
  GENERATED_AGGREGATOR (`edition-sync.js` GENERATED_AGGREGATORS; COMMON byte-identical claude↔codex,
  rename-normalized gitlab/gitea ports). `generated_port_split` forces any node editing the root to also
  declare all four edition files; the #340 forge-port ordering rule forbids a port-writing node from
  being upstream of a later root edit. With three root edits those two walls collide unless a SINGLE node
  owns the root + ports — so all three fixes move atomically in `n1-scheduler-fixes`. The node edits
  canonical, then regenerates the three ports via `npm run sync:editions --write`; `edition-sync.js
  --check` in the gitlab/gitea chains verifies the ports stayed in sync. This is not scope-widening — the
  three fixes are one file's worth of coupled scheduler change; parallelism is a means, not a goal
  (precedence #3), and this scope genuinely does not decompose into disjoint files. NEVER hand-add
  `parallel_safe`.
- **CLAUDE-ONLY test surfaces.** `scripts/test-adaptive-node.js` (the scheduler unit surface, ~10k lines,
  home of `spliceLedgerNode` / `runOpenNext` / `runCloseAndOpenNext` / lane-group tests) and
  `scripts/simulate-workflow-walkthrough.js` are CLAUDE-ONLY — the codex/forge walkthroughs test DIFFERENT
  surfaces and are NEVER byte-synced (`validate-script-sync.js` note), so no edition copies of those two
  are declared. The walkthrough is declared defensively: each scheduler behavior change plausibly forces
  an integration-assertion update there (it exercises `open-ready` mutual-exclusion, baseline recording,
  evidence stubs, and the `lane_group` sink backstop) — a co-mover that must not stall the run; under-write
  with a skip-reason is safe if it is not touched.
- **n1-scheduler-fixes (tdd-guide, standard) — implements all three, RED-first, one bug at a time:**
  - **#633** — the lane-group synthesizer octopus merge refuses `Untracked working tree file
    '…/.cache/{node-id}.md' would be overwritten by merge` — a structural untracked(parent-seed)-vs-
    tracked(leg-committed) evidence-file collision at last-member `close-node`, NOT a real content
    conflict. Fix in `open-ready` (evidence-stub seeding), `synthesizeLevel`, `closeGroupMember` per the
    roadmap next-step: seed the member's `.cache/{node-id}.md` as a TRACKED committed stub on the parent
    branch at group-open (so the leg's real-content commit becomes an ordinary tracked modification), or
    make the shape-check read leg-aware — whichever the RED test proves clean. RED: a 2-member write lane
    group where BOTH members self-write real (non-empty) `.cache` evidence, asserting last-member
    `close-node` reaches `barrier: group_passed` without manual intervention.
  - **#622** — reads and leg-contained write lane groups are mutually exclusive (`write_node_exclusive`
    ~`:4180` blocks ALL read opens while any lane-group member is live; mixed frontiers run two serial
    waves). Fix per the roadmap next-step: relax to the leg-contained invariant `!liveHasWrite` + a
    last-member merge fence, MIRRORING the #596 speculative-path precedent (~`:4246-4251`) that already
    co-runs writers with live reads and merges at last-member close; keep STRICT exclusivity for legless
    serial writers and main-session gates. RED: a mixed [reads, disjoint writes] frontier co-opens with
    makespan max(reads, writes) in the timing telemetry; legless serial writers + main-session gates stay
    strictly exclusive; the merge-fence race (last-member merge held until live reads drain).
  - **#621** — the #590 baseline-first ordering (record the barrier baseline BEFORE flipping the ledger
    row to in_progress) was applied to `runOpenNext` but NOT to the two other openers. Fix per the roadmap
    next-step: (1) in `runCloseAndOpenNext` fused advance (~`:2484-2502`) move the `--start` baseline call
    AHEAD of the splice+write, returning `baseline_failed` with the row left PENDING on failure; (2) in
    `reopen-node` (~`:3019-3023`, top reset `:2896`) record the fresh baseline while the row is still
    PENDING so reopen is idempotent across its own crash window. RED: both crash windows reproduced,
    asserting a crash leaves a PENDING row or a harmless orphaned baseline — never in_progress-without-
    baseline — and that reopen-node is idempotent.
  - `standard` because the fixes are implementation against a written spec (exact line numbers + a
    production precedent for #622), with the reasoning-tier gates below as the safety net.
- **n2-review (code-reviewer, reasoning)** post-dominates the sole code node n1 (G1). `reasoning` because
  these are subtle concurrency/ordering correctness fixes across four editions — the review must confirm
  the fix DIRECTION (no reintroduced race/collision/crash-window), the byte/rename edition parity, and
  that the #622 relaxation preserves strict exclusivity for legless serial writers and main-session gates.
  It runs `validation_command` (the four chains — the #307 cross-edition obligation, since the diff touches
  the edition trees).
- **n3-adversary (adversarial-verifier, reasoning)** — read-only with Bash; RUNS the reproductions (the
  #621 crash windows → PENDING-or-orphaned-baseline never in_progress-without-baseline; the #622 mixed
  frontier → max(reads, writes) makespan + strict exclusivity preserved for serial writers/gates; the #633
  2-member lane group with real evidence → group_passed) and asks "root-cause fixed, or symptom-masked
  green?" Non-redundant with n2 (diff-reading) and with the four-chain suite (partly CIRCULAR: `npm test`
  exercises the very adaptive-node scheduler under change). Sole unsatisfied dep is the n2 gate ⟹
  speculative-open-eligible under `auto`; read-node keep-or-discard on a fail.
- **n4-docs (doc-updater, standard)** — records the durable contract changes: a NEW decision record
  `docs/decisions/D-622-01.md` (D-622-01 is the next free id — no existing D-621/D-622/D-633 record)
  covering the coupled lane-group scheduler changes (the #622 leg-contained exclusivity relaxation + the
  #633 tracked-evidence-seeding contract); updates `docs/architecture.md` (running-set scheduler
  exclusivity / lane-group co-open section) and `docs/plan-run-cards/frontier-batch.md` (the
  `write_node_exclusive` / `write_awaits_drain` reason semantics #622 changes) for #622, and
  `docs/workflow-state-contract.md` (the `.cache` evidence-seeding / barrier commit-order contract) for
  #633. NO `CHANGELOG.md` here (protected file kept on the sink); all four paths are exactly-resolvable
  docs with no protected file ⟹ speculative-open-eligible behind the n2 gate; disjoint sibling of n3 (n3
  writes nothing). Under-write any doc that proves unnecessary with a skip-reason (safe). #621 is a pure
  bug fix (restores intended baseline-first ordering) and needs no ADR beyond the CHANGELOG entry.
- **n5-finalize (finalize)** — unique docs/state sink; writes only `CHANGELOG.md` (`[Unreleased]`).
  Depends on BOTH n3-adversary and n4-docs so finalization is provably impossible until the adversarial
  gate passes AND the docs land.
- **No security-reviewer (G2)**: labels carry no security sensitivity (bug/perf/scripts; issue labels are
  empty). **No main-session-gate (G3)**: acceptance is fully machine-checkable — RED-first tests, the #622
  timing telemetry, the four chains, and the adversarial reproductions; no GPU/visual/device/human-signoff
  hinge. **No knowledge-lookup**: every fix is confirmable in-repo (the cited line numbers, the #596
  speculative-path precedent, the #590 baseline-first comment).

## Node Ledger

| id | status |
| --- | --- |
| n1-scheduler-fixes | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-docs | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-scheduler-fixes) | subagent-invoked | evidence-binding: n1-scheduler-fixes 5544a6b2ca96 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review caaf774268fe | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary f7252a3f9c5c | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 7db14465c5f3 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 3f6ddffe30f0 | |
