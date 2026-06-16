<!-- plan_hash: 7b96c40f670e25a1688b59cf23c2c4942749fe5aed34cc655e5395f8db490129 -->
<!-- workflow-plan for bundle-513-514 (#513 + #514 same-scope bundle) -->

## Meta

labels: enhancement, bug
bundle_id: bundle-513-514
issue_numbers: 513, 514

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-impl-513-planner-heuristic | implementer | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-agent-profile-parity.js, docs/plan-run-cards/speculative-open.md | 6 | sequence | sonnet |
| n2-impl-514-cosmetic-nits | implementer | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-route-reachability.js | 5 | sequence | sonnet |
| n3-review-513 | code-reviewer | n1-impl-513-planner-heuristic | — | 1 | sequence | opus |
| n4-review-514 | code-reviewer | n2-impl-514-cosmetic-nits | — | 1 | sequence | sonnet |
| n5-docs | doc-updater | n3-review-513, n4-review-514 | CHANGELOG.md, docs/decisions/D-513-01.md, docs/decisions/D-514-01.md | 3 | sequence | sonnet |
| n6-finalize | finalize | n5-docs | kaola-workflow/ROADMAP.md | 1 | sequence | — |

## Plan Notes

- **Bundle shape (#307 cross-edition).** #513 (planner authoring heuristic) and #514 (two cosmetic
  nits) have DISJOINT write sets — planner profiles + parity test vs. adaptive-node.js editions +
  route-reachability test. They are an antichain: n1 and n2 carry NO dep edge so the validator
  derives `parallel_safe` ([INV-17] — never hand-added) and the scheduler overlaps the two write
  legs under lane containment. Each leg is post-dominated by `code-reviewer` (G1).
- **Safe-parallel forbidden-file fence (another machine concurrently builds #512).** NO node — not
  n1/n2/n5/n6 — may name `scripts/kaola-workflow-run-chains.js` (or its 3 edition ports),
  `scripts/test-run-chains.js`, or `scripts/simulate-workflow-walkthrough.js`. #513's
  machine-enforcement proof lives ONLY in `scripts/test-agent-profile-parity.js`; #514's lives ONLY
  in `scripts/test-route-reachability.js`. The four-chains-green requirement is the executor's
  finalize concern, NOT a write-set member, so the proof never pulls the walkthrough file in.
- **n1 — #513 planner authoring heuristic (net-new work only).** #500 L3 already wired the plan-run
  skeleton (T9 pins `<!-- CARD: speculative-open -->` + `--speculative-consent` across the 6 plan-run
  surfaces — that half is DONE). n1's job is the AUTHORING rubric: teach the `workflow-planner` to
  recognize when a read-only node whose sole unsatisfied predecessor is an in-progress gate (very
  likely to pass) should be authored with `## Meta: speculative_open_policy: consent` so the executor
  runs it ahead via `open-ready --speculative-consent` (rollback on `verdict:fail`). Surfaces:
  `agents/workflow-planner.md` (canonical, fuller prose) + the 3 byte-identical `workflow-planner.toml`
  twins (forge-neutral per #341 — name NO `gh`/`glab`/forge brand). Add `speculative_open_policy` to the
  `FEATURE_TOKENS` array in `scripts/test-agent-profile-parity.js` (the existing #422.2 needle-pattern)
  so the heuristic token cannot silently drift out of a twin. Add an in-grammar WORKED EXAMPLE of the
  speculative-open topology to `docs/plan-run-cards/speculative-open.md` (and reference it from the
  profile) as a cheap hedge against the "inert rubric" relapse (#463 lesson). This is an EXISTING
  profile edit, so the #340 22-path registration surface does NOT apply (add/remove only). No worked
  example is auto-validated by any test in this write set (`validatePlanFixture` lives in the forbidden
  walkthrough file + the validator) — write the example genuinely in-grammar by hand.
- **n2 — #514 two cosmetic nits (comment-only, behavior-preserving).** R1:
  `scripts/kaola-workflow-adaptive-node.js` ~line 3374 — reword the stale "stays parent-side **until
  Slice 3**" fragment (Slice 3 shipped, #463 AC18 PASS); drop "until Slice 3" / use "routing into legs
  landed in Slice 3". adaptive-node.js is a GENERATED_AGGREGATOR, so the SAME node declares all 4
  edition copies (root + codex-plugin + gitlab port + gitea port) per the `generated_port_split` rule;
  the executor regenerates the 3 forge ports with `node scripts/edition-sync.js --write` and verifies
  `git diff --name-only` shows the 3 `kaola-*-workflow-adaptive-node.js` ports changed. R2:
  `scripts/test-route-reachability.js` ~line 261 — fix the T9 block-header comment `<!-- PIN:
  speculative-open -->` → `<!-- CARD: speculative-open -->` (the assert at ~line 276 already checks
  CARD correctly; one-line comment-only). `non_tdd_reason`: both nits are comment-only, zero behavior
  impact, no natural failing unit test — behavior-preserving cosmetic edits + a generated-port mirror.
  n1's `non_tdd_reason`: planner rubric is LLM-read prose with no behavioral oracle; the parity
  `FEATURE_TOKENS` entry is a drift-guard regression needle, not a behavioral RED.
- **n3 (opus) / n4 (sonnet) review split.** n3 reviews #513 on `opus` — its reasoning-bounded job is
  to catch the "inert rubric" relapse (#463 lesson): confirm the heuristic is genuinely ACTIONABLE
  (a planner could recognize the speculative-eligible shape from it) and the worked example is REAL,
  not decorative. n4 reviews the comment-only #514 diff on `sonnet` (trivial, opus would be wasted).
  Split reviewers let each leg's review start when its leg finishes and keep opus off the cosmetic diff.
- **n5 doc-updater (sonnet).** #513 changes a public-interface authoring rubric → CHANGELOG entry +
  `docs/decisions/D-513-01.md` (next free in the series — no D-513 record exists). #514 cosmetic →
  `docs/decisions/D-514-01.md` (next free — no D-514 record exists). Both under [Unreleased].
- **n6 finalize (no model — not a dispatchable subagent).** Docs/state sink only — regenerates the
  `kaola-workflow/ROADMAP.md` mirror. The Phase-6 sink; all four `npm run
  test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green before finalization (#307,
  cross-edition diff) — that is the executor's finalize gate, run sequentially, NOT a write-set member.
- **Audit metadata (NOT an approval gate).** #513 ships a planner rubric + parity needle + worked
  example but NO live makespan probe, so the commit should lean "Refs #513" discipline unless a live
  demonstration is produced. This is advisory audit metadata only — `decision:ask` is advisory;
  planner-first (#44/#287) means NO `main-session-gate` and NO approval gate is authored for it.

## Node Ledger

| id | status |
| --- | --- |
| n1-impl-513-planner-heuristic | complete |
| n2-impl-514-cosmetic-nits | complete |
| n3-review-513 | complete |
| n4-review-514 | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-impl-513-planner-heuristic) | subagent-invoked | evidence-binding: n1-impl-513-planner-heuristic 0c19a8197de0 | |
| implementer (n2-impl-514-cosmetic-nits) | subagent-invoked | evidence-binding: n2-impl-514-cosmetic-nits 3a7734100afe | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review-513 38a5fc3ec433 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 9c922a21c36c | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize b62b5fd570df | |
