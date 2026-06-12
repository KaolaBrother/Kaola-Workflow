# Workflow Plan — issue-419

<!-- plan_hash: b85a1a8d6116ffd2c0bc2497834f18d13cc0055f9d3797f4dd983eb6932a1ed9 -->

Design track: parallelism v3 for the adaptive path. Goal is wall-clock efficiency, grounded
in the 2026-06-12 architecture review. The deliverable is a DESIGN: a durable architecture
decision record (`D-419-NN` series) capturing the four-Part design and the preserved
invariants, plus a runtime-grounded investigation document mirroring the existing
`docs/investigations/2026-06-10-parallelism-redesign.md` pattern, then wired into the docs
index / architecture cross-references / CHANGELOG. No production-script change is in scope —
this issue produces the design that downstream implementation issues will descend from;
companion design tracks #420 (autopilot) and #421 (token efficiency) are separate.

## Meta

labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-survey | code-explorer | — | — | 1 | sequence | sonnet |
| n2-architect | code-architect | n1-survey | — | 1 | sequence | opus |
| n3-author | doc-updater | n2-architect | docs/decisions/D-419-01.md, docs/decisions/D-419-02.md, docs/investigations/2026-06-12-parallelism-v3-design.md | 1 | sequence | opus |
| n4-review | code-reviewer | n3-author | — | 1 | sequence | opus |
| n5-wire | doc-updater | n4-review | docs/README.md, docs/architecture.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-wire | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Shape rationale.** This is a single-author design DAG with a genuinely serial critical
  path: the survey establishes runtime ground truth, the architect settles the design, the
  author writes the records, the reviewer gates them, the doc-updater wires the references,
  finalize closes. Each step consumes the prior step's output — there is no independent sibling
  work to fan out. Read-only survey / architect / review are kept as their own nodes so the
  single writing node (n3-author) carries only the record authoring and the gate sits cleanly
  between authoring (n3) and reference-wiring (n5).

- **Role split (read-only vs write).** In this validator `code-explorer` and `code-architect`
  are READ-ONLY roles (no write set permitted) and `doc-updater` is the WRITE role that authors
  markdown. So the design THINKING is the `code-architect` node (n2, read-only) and the design
  WRITING — the records + investigation — is a `doc-updater` node (n3). A docs-only `doc-updater`
  write set does not trip G1 (docs trivial band), but a review gate is still authored deliberately
  (n4) because the records describe machinery touching load-bearing invariants.

- **Decision-record numbering (#337).** The repo currently records `D-422-01 (existing)` and the numbered
  ADRs `0001`–`0009`; NO `D-419-*` record exists yet (verified by grep across `docs/`,
  `CHANGELOG.md`, `README.md`). The next free ids in the issue-419 series are therefore
  `D-419-01` and `D-419-02`. `D-419-01` holds the Part 1 coordination-kernel decision (the
  precondition: serial = running-set max=1, one transition function, one membership guard every
  open AND close passes through; preserves mutual exclusion, crash-resume typed states, ledger as
  single source of truth). `D-419-02` holds Parts 2–4 as a layered roadmap with their stated
  preconditions: Part 2 lane-attributed disjoint write parallelism (#376 graduation — attribute
  writes by lane membership for validator-stamped `parallel_safe` disjoint pairs, out-of-lane
  writes still trip `unattributed_write`, scheduler lifts `write_node_exclusive` only for stamped
  pairs; mind the #283 seal-vacuity non-empty-in-lane guard), Part 3 scheduler-default posture
  (`run_in_background` + rolling top-up as the documented default, serial as degraded mode, plus
  the planner rubric line rewarding overlap via `longestPathToSink`), and Part 4 optional
  consent-gated speculative open across gates (only after Part 1; speculative work discardable,
  close still awaits the gate verdict so post-dominance stays intact).

- **n1-survey (code-explorer, read-only, sonnet).** Map the present-day runtime so the architect
  cites evidence not memory: the three coordination machines (serial loop + #377 running-set in
  `adaptive-node.js`, `parallel-batch.js`), the hand-maintained pairwise exclusion matrix (#383
  guard prologue) and #411 close-side matrix holes, ADR 0008 (write-role isolation excised;
  reintroduction tracked by #376+#377) and its #386 addendum (write-lane hook self-exempt), the
  dormant `KAOLA_LANE_CONTAINMENT`, whether freeze stamps `parallel_safe`/`write_node_exclusive`
  today, `longestPathToSink` priority in `next-action.js`, and the "one frontier unit at a time"
  frontmatter across the six plan-run surfaces. Sonnet — an evidence-collection sweep.

- **n2-architect (code-architect, read-only, opus).** Settles the design from the survey
  evidence: the one-kernel unification (serial = running-set max=1), the lane-attribution
  mechanism and its exact freeze/scheduler contract, the scheduler-default posture, and the
  speculative-open path with its consent gate and rollback. Opus because these decisions
  constrain every downstream implementation issue. Read-only (the thinking node); hands the
  settled design to n3 to write.

- **n3-author (doc-updater, write, opus).** Authors `D-419-01` + `D-419-02` + the investigation
  doc (3 files, within FILE_CEILING). Opus because the prose IS the durable design contract that
  downstream work executes against; it must explicitly enumerate and preserve EVERY invariant the
  issue lists (freeze wall, per-node barrier attribution, post-dominance gates, unique sink,
  evidence binding, durable halt fence, agent-owns-selection #44) and carry the #283 seal-vacuity
  guard into the Part 2 specification. Docs-only write set.

- **n4-review (code-reviewer, read-only, opus, GATE).** Post-dominates the record authoring.
  A deliberate review wall: a design that mis-states an invariant or contains an internal
  contradiction (a lane-attribution rule that silently defeats the barrier ground-truth, a
  speculative-open path that breaks post-dominance, a kernel unification that loses a crash-resume
  typed state) would constrain all downstream work wrongly. Opus for adversarial scrutiny of a
  constraining design. Verifies: every stated invariant is preserved as written; Part 1 is
  correctly the precondition for Parts 2–4; Part 4 stays consent-gated and discardable; the #283
  seal-vacuity guard is present; record numbering is correct and non-conflicting.

- **n5-wire (doc-updater, write, sonnet).** After the gate passes, wires the records into the
  durable surface: add `D-419-01`/`D-419-02` to the `docs/README.md` Decisions index and add a
  parallelism-v3 cross-reference paragraph to `docs/architecture.md` (alongside the existing
  parallelism-v2 / #377 running-set section). Docs-only write set (2 files). Sonnet — mechanical
  wiring against the already-settled design. The CHANGELOG entry is left to the sink to keep n5's
  write set disjoint from finalize.

- **n6-finalize (finalize sink).** Unique docs/state sink. Touches only `CHANGELOG.md` (docs) —
  no non-docs write, so it does not trip G1 on the sink. No model cell (the sink is never
  dispatched as a subagent). Adds the `[Unreleased]` design/docs entry and closes the run.

- **No `tdd-guide`/`implementer`, no `security-reviewer`, no `knowledge-lookup`.** The deliverable
  is a design document — no behavioral code, no failing unit test, so neither implement role
  applies. `enhancement, area:scripts` are not SENSITIVE_LABELS and the design touches no
  secrets/auth/credentials surface, so G2 is not triggered. Everything is grounded in the local
  codebase + the 2026-06-12 review, so no external-knowledge node.

## Node Ledger

| id | status |
| --- | --- |
| n1-survey | complete |
| n2-architect | complete |
| n3-author | complete |
| n4-review | complete |
| n5-wire | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-survey) | subagent-invoked | 89f266aae9e5 | |
| code-architect (n2-architect) | subagent-invoked | 8ea49bd30cfc | |
| doc-updater (n3-author) | subagent-invoked | 24667cd377de | |
| code-reviewer | subagent-invoked | b8c032274328 | |
| doc-updater (n5-wire) | subagent-invoked | fb5da0dd8d68 | |
| finalize (n6-finalize) | main-session-direct | 863047d67d7c | |
