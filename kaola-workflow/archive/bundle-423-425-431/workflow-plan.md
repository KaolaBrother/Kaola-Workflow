# Adaptive Workflow Plan — bundle-423-425-431

<!-- plan_hash: e839328df1c273e58846e1cfa3ea55f3ec34a617b060fc2754c2fd44b7566e40 -->

## Meta

issues: 423, 425, 431
labels: bug, enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-test-fixture | tdd-guide | — | scripts/test-bash-block-guards.js | 1 | sequence | sonnet |
| n2-contractor-guard | implementer | — | agents/contractor.md, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml | 4 | sequence | sonnet |
| n3-validator | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 4 | sequence | opus |
| n4-adaptive-node | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 4 | sequence | sonnet |
| n5-planner-prose | implementer | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 4 | sequence | sonnet |
| n6-planrun-prose | implementer | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 4 | sequence | sonnet |
| n7-walkthrough | implementer | n3-validator | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js | 4 | sequence | sonnet |
| n8-code-review | code-reviewer | n1-test-fixture, n2-contractor-guard, n3-validator, n4-adaptive-node, n5-planner-prose, n6-planrun-prose, n7-walkthrough | — | 1 | sequence | opus |
| n9-docs | doc-updater | n8-code-review | docs/api.md, docs/decisions/D-423-01.md, docs/decisions/D-425-01.md, docs/decisions/D-431-01.md | 4 | sequence | sonnet |
| finalize | finalize | n9-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

Bundle of three area:scripts issues against the adaptive freeze/finalize machinery. Lanes are
organized by FILE so shared surfaces never collide. n1–n6 are file-disjoint and share no
dependency, so they form the initial ready frontier (the executor batches them; they are NOT a
fanout group — several write under the shared `scripts/`/`plugins/` top-level dirs, which fan-out
disjointness checks at top-level-directory granularity, so they are authored as sibling `sequence`
nodes on a shared empty frontier instead). n7 alone depends on n3 because its walkthrough scenarios
assert the validator's NEW refusal reasons. n8 (G1 code-reviewer) post-dominates every
code-producing node n1–n7. n9 docs + finalize close docs/state only.

### Issue-to-node map

- **#423** (bug, claude chain red since 58ffd81): `n1-test-fixture` repairs the
  `test-bash-block-guards.js` scenario-A fixture (write a minimal `## Node Ledger` after the
  workflow-state write so the Step-8a ledger-compare guard finds a readable `--source` plan) AND
  adds the new no-plan negative scenario (block still exits 0 + mirrors renames). `n2-contractor-guard`
  lands the production presence-guard: the Step-8a block (`agents/contractor.md:~136-141` + the 3
  byte-mirror `contractor.toml` twins — the guard shipped to ALL trees in 58ffd81) presence-checks
  the `--source` plan and no-ops with a logged skip token when absent (full/fast-path projects have
  no `workflow-plan.md`), keeping its teeth only when a ledger exists to regress.
- **#425** (bug, ledger-header freeze wall): `n3-validator` adds the `ledger_header_invalid`
  freeze-wall in `validatePlan()` (refuse a present `## Node Ledger` whose header lacks `id`+`status`,
  case-insensitive; typed error names the columns found) AND the `--repair` normalization in
  `reconcileLedger` ({`node`,`node_id`,`node-id`} → `id`, hash-safe since the ledger is outside
  `plan_hash`, report `header_normalized: true`). `n4-adaptive-node` adds the self-diagnosing
  `diagnostic` to `spliceLedgerNode`/`readLedgerStatuses` (section present but no `id` column →
  detected columns + requirement), surfaced by `open-next` in the `node_not_in_ledger` refusal.
  `n5-planner-prose` pins the literal `## Node Ledger` / `| id | status |` template block into the
  planner md + 3 tomls.
- **#431** (enhancement, generated_port_split freeze wall): `n3-validator` ALSO adds the
  `generated_port_split` freeze-wall in the per-node write-set wall (after FILE_CEILING, ~:862):
  a node writing `scripts/<base>` where `<base>` ∈ `GENERATED_AGGREGATORS` must in the SAME node
  also write the codex byte-twin `plugins/kaola-workflow/scripts/<base>` + both `forgeRel` ports;
  mapping IMPORTED from `scripts/edition-sync.js` (`GENERATED_AGGREGATORS` + `forgeRel`, exported at
  :213), anchor-gated inert when the module is absent (forge/codex/user installs). `n5-planner-prose`
  adds the aggregator-coupling rule subsection to the planner md + 3 tomls. `n6-planrun-prose` adds
  the plan-run dispatch prose (why a canonical-editing node expects regenerated ports in its diff;
  plans reaching plan-run already passed this wall) across the plan-run command + 3 codex SKILL packs.
- **#425 + #431 negative fixtures**: `n7-walkthrough` adds the freeze-refusal scenarios
  (`| node |`/`| node_id |` → `ledger_header_invalid`; `--repair` normalization green; split-shape
  plan → `generated_port_split`; bundled-plan green) to all four canonical edition walkthroughs.

### Aggregator coupling (this plan obeys #431's own rule)

`scripts/kaola-workflow-plan-validator.js` AND `scripts/kaola-workflow-adaptive-node.js` are both in
`GENERATED_AGGREGATORS` (`edition-sync.js:46-58`), so their forge ports are REGENERATED by
`sync:editions` and `edition-sync.js --check` runs in the gitlab/gitea chains. Verifying a canonical
edit by running the chains regenerates the codex twin + both forge ports — so `n3-validator` and
`n4-adaptive-node` each declare ALL FOUR edition files (canonical + codex twin + gitlab port + gitea
port) in ONE write set. Splitting canonical from ports across nodes is `write_set_overflow`-by-
construction (the exact #291/#431 defect); this plan does NOT split them. This is also why
`n3-validator` is the fix node for #431 yet must already follow #431's coupling rule.

### Cross-edition symbol scoping (#306) + parity (#422/#307/#400)

- `n2-contractor-guard`, `n5-planner-prose`: md↔toml byte parity (#422). The toml twins are
  byte-identical mirrors of the md modulo format; canonical spec = "mirror the md edit verbatim
  modulo toml escaping," not a free-form re-implementation, so the editions converge by construction.
- `n6-planrun-prose`: the #400 route/adaptive prose propagates to the plan-run command + the 3 codex
  SKILL packs (the historic dead zone); `test-route-reachability.js` + the four `validate-*-contracts.js`
  machine-enforce it.
- `n3-validator`, `n4-adaptive-node`, `n7-walkthrough`: GENERATED/COMMON cross-edition diffs — all
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (#307); the
  finalize seam runs all four sequentially.
- Decision-record numbering (#337): the repo records `D-419/420/422-NN` plus `0001-0009`; NO
  `D-423/D-425/D-431` records exist, so `D-423-01`/`D-425-01`/`D-431-01` are the next free ids,
  authored by `n9-docs`.

### Implement-role choices

- `n1-test-fixture` (tdd-guide): the new no-plan negative scenario is a meaningful failing-test-first
  assertion (block exits 0 + mirrors renames with no plan present).
- `n3-validator` (tdd-guide): each new freeze refusal is a failing-test-first behavior (corrupt
  header → `ledger_header_invalid`; split aggregator → `generated_port_split`; repair → normalized).
- `n4-adaptive-node` (tdd-guide): corrupt-ledger `open-next` → `diagnostic` is a failing-test-first
  behavior.
- `n2-contractor-guard`, `n5-planner-prose`, `n6-planrun-prose` (implementer):
  non_tdd_reason = agent/command/skill PROSE + shell-block edits with byte-mirror parity across
  editions; no natural failing unit test (the cross-edition parity is asserted by the contract
  validators / route-reachability in the chains, run by the gate + finalize).
- `n7-walkthrough` (implementer): non_tdd_reason = walkthrough SCENARIO FIXTURES mirroring the
  validator's new refusals across four edition files under a shared canonical spec; these fixtures
  ARE the tests, not unit-tested code.

## Node Ledger

| id | status |
| --- | --- |
| n1-test-fixture | complete |
| n2-contractor-guard | complete |
| n3-validator | complete |
| n4-adaptive-node | complete |
| n5-planner-prose | complete |
| n6-planrun-prose | complete |
| n7-walkthrough | complete |
| n8-code-review | complete |
| n9-docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n3-validator) | subagent-invoked | evidence-binding: n3-validator 81d0988c0eec | |
| tdd-guide (n1-test-fixture) | subagent-invoked | evidence-binding: n1-test-fixture 99638b5bb723 | |
| implementer (n2-contractor-guard) | subagent-invoked | evidence-binding: n2-contractor-guard e1c0f4845b41 | |
| tdd-guide (n4-adaptive-node) | subagent-invoked | evidence-binding: n4-adaptive-node fb54f3fa55a6 | |
| implementer (n5-planner-prose) | subagent-invoked | evidence-binding: n5-planner-prose 2d6f9d260ed3 | |
| implementer (n6-planrun-prose) | subagent-invoked | evidence-binding: n6-planrun-prose ee4dc715f8f2 | |
| implementer (n7-walkthrough) | subagent-invoked | evidence-binding: n7-walkthrough e9daff9e626f | |
| code-reviewer | subagent-invoked | evidence-binding: n8-code-review cee13a147854 | |
| doc-updater (n9-docs) | subagent-invoked | evidence-binding: n9-docs dd92675b28b5 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 7142fa603869 | |
