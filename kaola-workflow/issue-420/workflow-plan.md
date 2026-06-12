# Workflow Plan — issue-420

<!-- plan_hash: c43e1560307bff5cc667870b0b88bc7c38f022a84fa2dff5a2cc1164e55bdf26 -->

design(adaptive/auto): goal-driven automation — autopilot over scout→claim→plan→run,
consent-halt triage with proposed remediation, goal-conditioned bundles, release aggregator.

This is a DESIGN TRACK (mirrors #419 / #422): the deliverable is design records — a grounding
investigation doc plus two clustered ADRs (D-420-01 covers Parts 1+3, D-420-02 covers Parts 2+4),
gated by an adversarial design review, with the decisions index + CHANGELOG updated. No product
code is produced, so G1 (code-reviewer) is not required; the adversarial-verifier gate is the
quality wall for the high-leverage design decisions.

## Meta

labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
|----|------|-----------|--------------------|-------------|-------|-------|
| n1-survey | doc-updater | — | docs/investigations/2026-06-12-goal-driven-automation-design.md | 1 | sequence | opus |
| n2-adr-driver | doc-updater | n1-survey | docs/decisions/D-420-01.md | 1 | sequence | opus |
| n3-adr-mechanical | doc-updater | n2-adr-driver | docs/decisions/D-420-02.md | 1 | sequence | opus |
| n4-design-review | adversarial-verifier | n3-adr-mechanical | — | 1 | sequence | opus |
| n5-doc-index | doc-updater | n4-design-review | docs/README.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-doc-index | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Deliverable shape.** Pure design/documentation, modeled on the #419 track: ONE grounding
  investigation doc cited by the ADRs, TWO clustered ADRs over disjoint files, an adversarial
  design review gate, then the docs/README.md decisions index + a CHANGELOG entry. There is no
  code-producing node, so the validator does not require a `code-reviewer` (G1) gate. The authoring
  nodes use `doc-updater` (a WRITE role) rather than `code-architect` (a READ-ONLY analysis role
  that cannot declare a write set); all authored paths are docs paths so the write role does not
  trip G1.

- **Part-to-record clustering (mirrors #419's two-ADR split).** Issue #420 has four parts with
  differing dependency profiles; they cluster into two coherent records:
  - **D-420-01 (n2) — Parts 1 + 3 (the "driver + termination" cluster):** Part 1 autopilot loop
    over scout→claim→plan→run→finalize (confidence-threshold gating, #44-preserving auditable
    selection-aloud, typed stop conditions, never silent) and Part 3 goal-conditioned bundles
    (optional milestone/goal input flowing scout → planner `## Meta` goal line, HASH-COVERED → a
    finalize AC-vs-goal check). These pair because the goal line is the autopilot's termination
    condition ("goal satisfied" beats "backlog empty").
  - **D-420-02 (n3) — Parts 2 + 4 (the "mechanical-transaction" cluster):** Part 2 consent-halt
    triage (teach `write-halt` to attach a classified payload: offending paths + matched mechanical
    class + ready-made plan-repair diff; same pattern for `test_thrash` with the failing-test delta)
    and Part 4 a release aggregator (`kaola-workflow-release.js --verify/--cut`: fuse tag-before-test,
    3-manifest lockstep, README bump, the forge release-publish step, changelog-completeness into one
    typed transaction). These pair because both convert an error-prone manual/archaeology step into a
    single typed transaction with a classified payload.

- **n1 grounding survey (doc-updater, opus).** Read-and-author a runtime-grounded investigation
  doc that the two ADRs cite, covering the four touched surfaces: (a) the scout→claim→plan→run→
  finalize pipeline and the issue-scout role (`agents/issue-scout.md`) for the autopilot driver;
  (b) the existing `write-halt`/`clear-halt` + `consent`/`security`/`test_thrash` machinery in
  `scripts/kaola-workflow-adaptive-node.js` for Part 2; (c) the `## Meta` hash-covered region in
  `scripts/kaola-workflow-plan-validator.js` (plan_hash covers `## Meta` + `## Nodes` only) for the
  goal line in Part 3; (d) the release surfaces `scripts/release-surface-drift.js`,
  `kaola-workflow-sink-merge.js`, the 3-manifest lockstep, and #417's CHANGELOG-gap audit finding
  for Part 4. Ground every design claim in a real file/line so the ADRs are not speculative. This
  is opus: it constrains all downstream design and the two ADRs depend on it.

- **n2 / n3 ADRs (doc-updater, opus, sequence).** Each authors ONE ADR file in the #419 ADR house
  style: Date/Status/Issue/Related header, Context, Decision (per-part, with numbered invariants
  `[INV-n]`), open questions (recorded NOT resolved), Consequences. The two ADRs are logically
  independent (D-420-01.md vs D-420-02.md), but write-role fan-out disjointness is checked at
  TOP-LEVEL-DIRECTORY granularity and both files live under `docs/` — they collide at the coarse
  `docs` area, so they are SERIALIZED (n3 after n2) rather than fanned out. This is a forced
  coarse-area lane serialization, not artificial ordering. Both cite the n1 investigation doc and
  cross-reference each other and the #419 records. Both are opus: design decisions that constrain
  downstream implementation issues.

- **n4 adversarial design review (adversarial-verifier, opus, read-only).** Gate the design quality
  before it is indexed: probe each ADR for under-specified invariants, hash-coverage claims that do
  not match the validator's actual `## Meta`-only hash region, autopilot stop conditions that could
  go silent (violating #44), a forge release-publish step that is not forge-neutral (the editions
  contract forbids naming a forge CLI), and goal-line claims that would change `plan_hash`
  unexpectedly. Read-only (`—` write set): post-dominates both ADR nodes. Emits lowercase
  `verdict: pass` / `findings_blocking: 0` per the gate-verdict contract. Opus: this is the
  quality wall on high-leverage design records.

- **n5 doc index (doc-updater, sonnet).** Resolve the docs/README.md decisions index: add the two
  new D-420-01 / D-420-02 entries alongside the existing D-419-01 (existing) / D-419-02 (existing) /
  D-422-01 (existing) lines.
  Mechanical index maintenance against a written checklist → sonnet. Owns docs/README.md ONLY;
  CHANGELOG.md is owned by the finalize sink (disjoint lanes — no write-set overlap with n6).

- **n6 finalize (finalize, model omitted).** Docs/state bookkeeping only: the CHANGELOG.md
  [Unreleased] entry for the #420 design records. CHANGELOG.md is a docs path so the sink does not
  trip G1. The finalize sink carries NO model cell (it is never dispatched as a subagent).

- **Decision-record numbering (#337).** Read of `docs/decisions/` at authoring time shows
  D-419-01 (existing), D-419-02 (existing), D-422-01 (existing) and no existing D-420 record, so the
  next-free numbers for issue #420 are D-420-01 and D-420-02. These two ids are hardcoded above and
  are free (no `decision_id_conflict`); the three #419/#422 ids are deliberate references to shipped
  records, annotated `(existing)`.

- **Forge-neutral authoring (#341).** The ADRs and investigation doc live under `docs/` (not the
  plugin trees), so the byte-mirror agent-profile contract does not apply. However the Part-4
  release-aggregator design must describe the `--latest` publish step in forge-neutral terms ("the
  forge release-create command / the forge CLI") rather than naming a forge-specific binary, since
  the design is intended to inform an edition-portable `kaola-workflow-release.js`; the n4 review
  checks this.

- **No edition / count-bump surface touched.** This is a docs-only design track: no agent-set
  delta, no script add/rename, no validator count bump, no `## Meta`/grammar change. The
  cross-edition four-chain gate is therefore not triggered by the authored files; the finalize
  sink writes only CHANGELOG.md.

## Node Ledger

| id | status |
|----|--------|
| n1-survey | complete |
| n2-adr-driver | complete |
| n3-adr-mechanical | complete |
| n4-design-review | complete |
| n5-doc-index | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n1-survey) | subagent-invoked | # n1-survey evidence | |
| doc-updater (n2-adr-driver) | subagent-invoked | # n2-adr-driver evidence | |
| doc-updater (n3-adr-mechanical) | subagent-invoked | # n3-adr-mechanical evidence | |
| adversarial-verifier (n4-design-review) | subagent-invoked | # n4-design-review evidence | |
| doc-updater (n5-doc-index) | subagent-invoked | # n5-doc-index evidence | |
| finalize (n6-finalize) | main-session-direct | # n6-finalize evidence | |
