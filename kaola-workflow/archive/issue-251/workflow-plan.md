# Workflow Plan — issue-251

<!-- plan_hash: 5c1bf8d0c82264b609a46a79128d825047a1451ee62f1643dd8450b46aa672b6 -->

Two paired adaptive-path-only changes (no phase4/6-phase change; toggle-agnostic). **Part A
(doc-honesty):** rewrite three over-promising claims (script-decidable `dry_streak` convergence,
"orchestrator quorum/decision node", `validateNodeOutput()` schema checkpoints) so the plan-run
command + SKILL surfaces stop implying a mechanical loop/quorum/schema engine the code does not have.
**Part B (verdict gate):** add `parseNodeVerdict` + the verdict vocabulary to the byte-identical
cross-edition anchor `kaola-workflow-adaptive-schema.js` (×4); add a pure-read `--verdict-check`
subcommand to `plan-validator.js` (×4, fail-closed, `majority-refute` over an adversarial-verifier
fan-out); wire it into `commit-node.js` per-node (×4) and the phase6 merge gate (×3) beside
`--gate-verify`; have the gap-finder agents (`code-reviewer`, `security-reviewer`,
`adversarial-verifier`, incl. the `higher` profiles) emit the schema'd PASS/FAIL block; add
`parseNodeVerdict` + `--verdict-check` unit coverage (pass / fail / missing / fan-out quorum) to the
walkthrough suite.

The cross-edition byte-identical constraint duplicates each script family across 4 copies (root +
`plugins/kaola-workflow` sync-pair + gitea + gitlab ports, gitea/gitlab validator+commit-node are
infixed `kaola-gitea-…`/`kaola-gitlab-…`). All copies live under the shared `scripts/` + `plugins/`
top-level dirs, so the implement work is split into a SERIALIZED chain of single-family nodes (one
reaches the next → no concurrent antichain pair, no shared-infra fan-out) rather than a fan-out, with
each node ≤ FILE_CEILING (6) paths, under one trailing `code-reviewer` (G1) post-dominating the whole
chain.

Scope boundary: `docs/api.md` / `docs/architecture.md` also describe `--gate-verify` and will gain a
`--verdict-check` sibling, but that drift is NOT in the issue's AC (Part A is scoped to the three
plan-run claims) and is not validator-forced — left for the orchestrator to govern; no `doc-updater`
node is pre-allocated. No `security` label and no declared write-set path matches the sensitivity
patterns → no G2 / `security-reviewer` node is required (the security-reviewer *verdict emission* is
work content inside `impl-agents`, not plan topology).

## Meta

labels: documentation, enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| plan | code-architect | explore | — | 1 | sequence |
| impl-schema | tdd-guide | plan | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js | 1 | sequence |
| impl-validator | tdd-guide | impl-schema | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js | 1 | sequence |
| impl-commit-node | tdd-guide | impl-validator | scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js | 1 | sequence |
| impl-agents | tdd-guide | impl-commit-node | agents/code-reviewer.md, agents/security-reviewer.md, agents/adversarial-verifier.md, agents/profiles/higher/code-reviewer.md, agents/profiles/higher/security-reviewer.md | 1 | sequence |
| impl-phase6 | tdd-guide | impl-agents | commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md | 1 | sequence |
| impl-docs-tests | tdd-guide | impl-phase6 | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | impl-docs-tests | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | barrier:0; .cache/explore.md present/non-empty |
| plan | complete | barrier:0; .cache/plan.md present/non-empty |
| impl-schema | complete | barrier:0; RED+GREEN confirmed; byte-identical ×4 |
| impl-validator | complete | barrier:0; RED+GREEN confirmed; 4 plan-validator.js copies verified |
| impl-commit-node | complete | barrier:0; RED+GREEN confirmed; 4 commit-node.js copies verified |
| impl-agents | complete | barrier:0; RED+GREEN confirmed; 5 agent .md files verified |
| impl-phase6 | complete | barrier:0; RED+GREEN confirmed; 3 phase6 command files verified |
| impl-docs-tests | complete | barrier:0; RED+GREEN confirmed; 4 plan-run doc files + walkthrough verified; test_thrash:0 |
| review | complete | barrier:0; .cache/review.md present/non-empty; verdictCheck ok:true (verdict:pass, findings_blocking:0); barrierCheck pass (no write set); G1 APPROVE — CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 3 (note) |
| finalize | in_progress | base:aba3762d05b31d4ca59aba6320473578152a0f23 |

## Required Agent Compliance

| node | status | evidence | notes |
| --- | --- | --- | --- |
| code-reviewer | subagent-invoked | `.cache/review.md` — verdict:pass, findings_blocking:0; G1 GATE (post-dominates impl-schema/impl-validator/impl-commit-node/impl-agents/impl-phase6/impl-docs-tests); APPROVE; CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 3 (note, non-blocking); barrier:0 (no write set; barrierCheck pass); per-instance disambiguation: node id `review` | |
