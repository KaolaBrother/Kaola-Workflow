# Workflow Plan — bundle-498-499-516

<!-- plan_hash: fd3e931e256dbeb409346d79e2637313c5f914b705cf569e0d66f18222a54091 -->

## Meta

labels: bug, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/test-parallel-batch.js | 6 | sequence | opus |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | opus |
| n3-docs | doc-updater | n2-review | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/plan-run-cards/resume.md | 7 | sequence | sonnet |
| n4-finalize | finalize | n3-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

All three issues are bugs in the adaptive-node aggregator `kaola-workflow-adaptive-node.js`,
which is a GENERATED_AGGREGATOR shipping in 4 editions (root + codex twin + the two forge-NAMED
ports). They are genuinely same-scope (same file), so the code fix is ONE node (n1-fix) — the
four editions are atomically coupled (generated_port_split) and cannot be split. Bug fixes with
reproducible failing tests → `tdd-guide` (write the RED test first, then the fix).

- **#498 (HIGH, toggle-gated):** write co-open engages on `KAOLA_LANE_CONTAINMENT` alone; the
  attribution-blind union barrier passes a cross-member overwrite when leg-isolation is off.
  Apply the issue's RECOMMENDED gate-CONJUNCTION fix in `adaptive-node.js`: gate co-open on
  leg-isolation TOO (serial-degrade writers when `KAOLA_LEG_ISOLATION` is off, so concurrent
  writers only ever run with the fence + per-leg barrier live), and drop the
  `groupCeiling = Math.max(2, groupCeiling)` floor when the operator set a cap of 1
  (`scripts/kaola-workflow-adaptive-node.js:3823, 3834, 3908`). The issue EXPLICITLY REJECTS the
  deeper attribution-aware union-barrier rewrite in `plan-validator.js` as over-engineering —
  DO NOT touch `plan-validator.js` (that file belongs to #501/#509 later in the sweep). This keeps
  the bundle disjoint from the plan-validator.
- **#499 (HIGH, requires tamper):** the serial resume / open-next path has no `plan_hash` integrity
  gate. Add the `--resume-check` integrity layer to `open-next` (pass `integrity:true` to
  `mutationGuardPrologue` at `:1631`), OR make `orient` refuse on tamper rather than reporting it
  as an advisory field — pick the cheapest sufficient per the issue. The existing `open-ready`/
  `close-node` integrity tests (`S387a`/`S387b` in `test-adaptive-node.js`) are the RED-test
  pattern for the analogous `open-next` gate. Align the recovery card `docs/plan-run-cards/resume.md`
  (n3-docs) to the fields `orient` actually emits — its current `plan_frozen`/`resume_state`/
  `active_node` references do not exist in orient's success envelope, so the §6 tamper-stop can
  never fire.
- **#516 (LOW):** `open-next` dispatch emits a bare, cwd-relative `evidence_file: .cache/<node-id>.md`
  that a worktree subagent mis-resolves to the worktree-ROOT `.cache/` → `write_set_overflow`
  barrier. Apply the issue's smallest fix: emit the PROJECT-QUALIFIED evidence path
  (`kaola-workflow/{project}/.cache/<node-id>.md`) in the dispatch packet instead of the bare
  `.cache/...` (the `seedEvidenceFile` return + the dispatch-context emit,
  `scripts/kaola-workflow-adaptive-node.js:571, 596, 599, 617, 625, ~1047`).

**Cross-edition canonical spec (n1-fix).** The codex twin and the two forge-NAMED ports
(`kaola-{gitlab,gitea}-workflow-adaptive-node.js`) must mirror the FULL root diff modulo
forge nouns — `edition-sync.js --check` (gitlab/gitea chains) enforces parity. The behavioral
RED tests live in `scripts/test-adaptive-node.js` (claude chain) and, for #498's group-barrier
serial-degrade, `scripts/test-parallel-batch.js`; the codex/forge `simulate-*-walkthrough.js`
suites do not assert these specific behaviors and only need to stay green via the parity check.

**n3-docs scope.** #498's misleading summary-line prose ("write parallelism requires
`KAOLA_LANE_CONTAINMENT=true`") lives in all SIX routing surfaces (3 `commands/kaola-workflow-plan-run.md`
+ 3 `skills/kaola-workflow-plan-run/SKILL.md`) per the #400 routing-prose propagation contract — it
must name `KAOLA_LEG_ISOLATION` + `--write-overlap-consent` as the safety co-requisites so it stops
contradicting the #500 L2 recipe below it. #499's `docs/plan-run-cards/resume.md` is a single root
file (plan-run-cards are not edition-mirrored).

**Decision records:** none of D-498-NN / D-499-NN / D-516-NN exist yet in the repo. The finalize
sink writes only CHANGELOG.md (docs/state). No decision record is hardcoded in a write set.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-docs | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix a733db787a9b | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 3124333a0053 | |
| doc-updater (n3-docs) | subagent-invoked | evidence-binding: n3-docs a717b721945c | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 332c86a965b4 | |
