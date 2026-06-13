# Adaptive Workflow Plan — bundle-445-446

<!-- plan_hash: d47bdab15d955e34f1c47f0d1112d8cf88c12a46d739ed7b903bd2df7a22dcd4 -->

## Meta
issues: 445, 446
labels: enhancement, area:scripts, area:workflow-phases
bundle_id: bundle-445-446

## Summary

Bundle implements #421 Parts 3 & 4 (token-efficiency track), building on the now-shipped
#444/#438/#433/#434/#424.

- **#445 P3** — slim resident executor: (a) `operator_hint` on every typed refusal/halt envelope
  across the four script aggregators (adaptive-node, commit-node, plan-validator, parallel-batch),
  generated from per-reason templates living IN each script (single source); (b) plan-run prose
  reduced to a loop skeleton with per-situation reference cards moved to `docs/plan-run-cards/`
  (single-copy docs, non-resident); the ×6 plan-run surfaces carry only the skeleton; the pinned
  `frontier unit` literal + route-reachability contract survive in the skeleton.
- **#446 P4** — (a) `route-findings` subcommand on adaptive-node.js parses a gate node's evidence
  `finding:` lines into `.cache/findings-route.json` (owning_node = write-set lookup; unowned →
  `owning_node: null` plan-repair signal); `close-and-open-next` invokes it when closing a
  VERDICT_ROLES node; (b) envelope diet: new `--summary` mode prints a one-line `summary:` and
  writes the full envelope to `.cache/<op>-envelope.json`; the interactive loop uses `--summary`
  and drills into the cached envelope only on `result: refuse`.

Coupling drove the shape: `adaptive-node.js ×4` is touched by BOTH issues (operator_hint AND
route-findings/summary) so a SINGLE node (n5) carries both concerns over those four files —
splitting them into two nodes over the same root+ports created a #340 forge-port ordering
inversion. The other three aggregators fan out in parallel over disjoint editions; the ×6 plan-run
prose is one combined node (#309 semantic coupling, same files). All script ports are kept
same-node per #431 (`generated_port_split`).

## Plan Notes

- **Decision records** — next free numbers are `D-445-01` and `D-446-01` (neither exists in
  `docs/decisions/`). n1 authors both: D-445-01 settles the operator_hint reason-registry template
  contract + the skeleton/card split contract; D-446-01 settles the findings-route.json schema +
  the `--summary` envelope-diet contract. These are the canonical specs the downstream impl nodes
  mirror. (n1 is an `implementer` because `code-architect` is a read-only role and cannot author
  the records; the design IS the written artifact. non_tdd_reason: design/decision-record authoring,
  no natural failing unit test. Model opus — the contracts constrain all downstream nodes.)
- **#431 aggregator-port rule** — each aggregator node declares ALL FOUR editions of its base
  (root `scripts/<base>` + plugin codex twin + gitlab forge port `kaola-gitlab-workflow-<base>.js`
  + gitea forge port `kaola-gitea-workflow-<base>.js`). Splitting an aggregator across nodes is
  `generated_port_split`-by-construction. Each aggregator node = exactly 4 files, within FILE_CEILING.
- **#340 forge-port ordering** — adaptive-node is the only aggregator both issues touch. Carrying
  #445 operator_hint and #446 route-findings/--summary in ONE node (n5) keeps the root edit and its
  three port mirrors in a single transaction, so no port-mirror node ever precedes a later root
  edit of the same file. n5's canonical spec for its ports is the full accumulated root diff of
  `scripts/kaola-workflow-adaptive-node.js` vs the run base, mirrored modulo forge nouns (#340).
- **#306 cross-edition symbol scoping** — `operator_hint`, `--summary`, `route-findings`,
  `findings-route.json` were grepped across `scripts/` + all `plugins/*/scripts/` + edition
  commands/skills before freeze: none pre-exist; the operator_hint reason-template lives inside
  each script (no new shared module); route-findings is adaptive-node-only (its explicit #446
  propagation), so `--summary` + `route-findings` are scoped to `adaptive-node.js ×4`.
- **#309 cross-edition prose parity** — the ×6 plan-run skeleton/card split is ONE node (n9) with
  a shared canonical spec ("reduce to the loop skeleton from D-445-01; preserve `frontier unit` and
  every route-reachability pin verbatim; forge editions mirror the claude command/SKILL modulo
  forge nouns"), so the six surfaces converge by construction rather than diverging in prose.
- **#341 forge-neutral plugin prose** — the four plugin trees (codex SKILL + two forge commands/
  SKILLs) must name no forge CLI binary/brand; the new card references and skeleton stay
  edition-neutral. The new `docs/plan-run-cards/*` is root single-copy docs (not ×6).
- **#445 P3 pin safety** — the skeleton retains the `frontier unit` literal pinned at
  `scripts/validate-workflow-contracts.js:812` and keeps the route-reachability contract green
  (`scripts/test-route-reachability.js`). n8 adds the new prose/subcommand contract pins (operator
  _hint present, skeleton/card markers, route-findings subcommand) across root+codex contract
  validators and the route-reachability test; n7 carries the forge contract-validator pins + the
  forge test-script exercise of the new `route-findings` subcommand.
- **FILE_CEILING splits** — the test/contract work is split: n6 owns the root reason-registry
  table-driven test + router fixture test; n7 owns the two forge `test-*-workflow-scripts.js`
  exercise + the two forge contract validators; n8 owns the root + codex contract-validator
  prose/subcommand pins + the route-reachability test. Each node ≤ 6 exact file paths; all card
  files are declared by EXACT path (#381/#404), never a bare dir.
- **Card scope (#445)** — the cards extract the rarely-firing per-SITUATION prose branches (resume,
  governance, repair routing, re-opening a complete node, frontier/parallel batch), not one file
  per reason-code; the operator_hint reason templates (81 codes) live IN the scripts. n10 authors
  the bounded card set + index by exact path; the doc-updater (n12) wires the docs map / CHANGELOG.
- **TDD vs implementer** — script behavior changes (operator_hint emission, route-findings parse,
  --summary envelope) carry meaningful failing unit tests → `tdd-guide`. Decision-record authoring,
  prose skeleton/card split, contract-pin additions, forge mirror, and card authoring are non-TDD
  (no natural failing unit test; doc/wiring/mirror work) → `implementer` with `non_tdd_reason`.
- **Gates** — `code-reviewer` (n11) post-dominates every code-producing node (G1). No security
  label → no G2. `doc-updater` (n12) precedes `finalize` (n13) because public CLI surface
  (subcommands/flags) and docs change. Finalize sink writes docs/state only.
- **Cross-edition gate (#307)** — finalize requires all four `npm run test:kaola-workflow:*`
  chains green (this is a cross-edition diff: edition aggregators + forge validators + SKILL packs);
  the code-reviewer node's evidence records the four-chain result.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | implementer | — | docs/decisions/D-445-01.md, docs/decisions/D-446-01.md | 1 | sequence | opus |
| n2-hint-validator | tdd-guide | n1-design | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 4 | sequence | sonnet |
| n3-hint-commitnode | tdd-guide | n1-design | scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js | 4 | sequence | sonnet |
| n4-hint-parallelbatch | tdd-guide | n1-design | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js | 4 | sequence | sonnet |
| n5-adaptivenode | tdd-guide | n1-design | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 4 | sequence | opus |
| n6-root-tests | tdd-guide | n2-hint-validator, n3-hint-commitnode, n4-hint-parallelbatch, n5-adaptivenode | scripts/test-adaptive-node.js, scripts/test-commit-node.js, scripts/test-parallel-batch.js | 3 | sequence | sonnet |
| n7-forge-tests | implementer | n2-hint-validator, n3-hint-commitnode, n4-hint-parallelbatch, n5-adaptivenode | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 4 | sequence | sonnet |
| n8-contract-pins | implementer | n5-adaptivenode | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, scripts/test-route-reachability.js | 4 | sequence | sonnet |
| n9-prose-skeleton | implementer | n5-adaptivenode | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 6 | sequence | sonnet |
| n10-cards | implementer | n1-design | docs/plan-run-cards/README.md, docs/plan-run-cards/resume.md, docs/plan-run-cards/governance.md, docs/plan-run-cards/repair-routing.md, docs/plan-run-cards/reopen-complete-node.md, docs/plan-run-cards/frontier-batch.md | 6 | sequence | sonnet |
| n11-code-review | code-reviewer | n6-root-tests, n7-forge-tests, n8-contract-pins, n9-prose-skeleton, n10-cards | — | 1 | sequence | opus |
| n11b-forge-gitlab | implementer | n11-code-review | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js | 4 | sequence | sonnet |
| n11c-forge-gitea | implementer | n11b-forge-gitlab | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 4 | sequence | sonnet |
| n11d-rereview | code-reviewer | n11c-forge-gitea | — | 1 | sequence | opus |
| n11e-fix-validators | implementer | n11d-rereview | plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 2 | sequence | sonnet |
| n11f-rereview3 | code-reviewer | n11e-fix-validators | — | 1 | sequence | opus |
| n12-doc-updater | doc-updater | n11f-rereview3 | docs/README.md, docs/conventions.md, docs/api.md, README.md | 4 | sequence | sonnet |
| n13-finalize | finalize | n12-doc-updater | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-hint-validator | complete |
| n3-hint-commitnode | complete |
| n4-hint-parallelbatch | complete |
| n5-adaptivenode | complete |
| n6-root-tests | complete |
| n7-forge-tests | complete |
| n8-contract-pins | complete |
| n9-prose-skeleton | complete |
| n10-cards | complete |
| n11-code-review | complete |
| n11b-forge-gitlab | complete |
| n11c-forge-gitea | complete |
| n11d-rereview | complete |
| n11e-fix-validators | complete |
| n11f-rereview3 | complete |
| n12-doc-updater | complete |
| n13-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-design) | subagent-invoked | evidence-binding: n1-design 50272d119991 | |
| tdd-guide (n2-hint-validator) | subagent-invoked | evidence-binding: n2-hint-validator b2f8c3ac032a | |
| tdd-guide (n3-hint-commitnode) | subagent-invoked | evidence-binding: n3-hint-commitnode 2c7749c79544 | |
| tdd-guide (n4-hint-parallelbatch) | subagent-invoked | evidence-binding: n4-hint-parallelbatch 20c21cf3b13d | |
| tdd-guide (n5-adaptivenode) | subagent-invoked | evidence-binding: n5-adaptivenode 76761cba574d | |
| tdd-guide (n6-root-tests) | subagent-invoked | evidence-binding: n6-root-tests 36051accbb58 | |
| implementer (n7-forge-tests) | subagent-invoked | evidence-binding: n7-forge-tests 9881f3d3503a | |
| implementer (n8-contract-pins) | subagent-invoked | evidence-binding: n8-contract-pins 81205d012dd5 | |
| implementer (n9-prose-skeleton) | subagent-invoked | evidence-binding: n9-prose-skeleton b7503aee8a0f | |
| implementer (n10-cards) | subagent-invoked | evidence-binding: n10-cards 53719459eac4 | |
| code-reviewer | subagent-invoked | evidence-binding: n11-code-review f4bb33c2f79f | |
| implementer (n11b-forge-gitlab) | subagent-invoked | evidence-binding: n11b-forge-gitlab 97b32ca34b20 | |
| implementer (n11c-forge-gitea) | subagent-invoked | evidence-binding: n11c-forge-gitea 9b59fff51cea | |
| implementer (n11e-fix-validators) | subagent-invoked | evidence-binding: n11e-fix-validators 71a4e3bd6ffa | |
| doc-updater (n12-doc-updater) | subagent-invoked | evidence-binding: n12-doc-updater db67c7b11021 | |
