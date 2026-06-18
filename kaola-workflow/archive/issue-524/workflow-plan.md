# Adaptive Workflow Plan — issue-524

<!-- plan_hash: 5aeb0cd931dea1b40d4783426555cf24b058e895044c81c4dd0c96129b526ad0 -->

## Meta

issue: 524
labels: bug, area:scripts, area:workflow-router
goal: issue-scout ranks by roadmap priority / drive-order / Project-rules guardrails first, then scope-cohesion / actionability as a within-tier tiebreak; emits a priority_basis reconciliation field; surfaces "frontier blocked" explicitly instead of silently substituting an actionable proxy.
speculative_open_policy: off

## Plan Notes

- **Shape: Case A (#486) — shape knowable, fix design needs reasoning.** The issue is a well-specified
  instruction/objective gap in the `issue-scout` agent profile (root + 3 byte-mirror toml ports): the
  scout has no priority/drive-order ranking dimension and never reads the `### Project rules`
  guardrails or epic drive-order as priority signals, so it free-picks the most cohesive/actionable
  candidate. Root cause, files, and ACs are all named — no "shape depends on findings" uncertainty,
  so the whole design→implement→review→docs→finalize DAG is authored up front.
- **Implement role = `implementer`, not `tdd-guide`.** `non_tdd_reason`: the deliverable is
  agent-profile INSTRUCTION PROSE (the scout's ranking objective lives in the dispatched LLM agent's
  reasoning, not a code path). No contract validator pins scout prose content (only count + forbidden-
  token checks); there is no meaningful failing unit test for "the scout now ranks priority-first."
  The walls that DO bind are the cross-edition parity check (code-reviewer) and the four npm chains.
- **Cross-edition prose coupling (#309) — ONE implement node, not a fan-out.** The three scout
  `.toml` ports are byte-identical (verified md5 `ac374bbc…`) and the root `agents/issue-scout.md`
  carries the same substantive logic prose (What You May Read / Survey Process / Clustering / Bundle
  Selection / Output Format). The priority-ranking change is a SINGLE semantic change spanning 4
  editions, so it moves atomically in one node with a shared canonical spec ("mirror the root .md's
  priority-ranking prose into each toml modulo the codex-runtime wording the tomls already use") —
  splitting it across parallel implementers risks the #254 divergent-prose parity defect. No
  file-count ceiling forces a split (#453).
- **Locus is the scout profile, NOT the auto surfaces.** The `kaola-workflow-auto` command + 3 SKILL
  packs reference the scout only by name and for the `backlog_empty` terminal signal — they do NOT
  describe the scout's ranking criteria or output schema (those live entirely in the scout profile).
  So the #400 six-surface propagation does not bind this change; the auto prose stays untouched. The
  n1-design node confirms this locus call before n2 implements.
- **NOT an agent-set delta (#340).** We edit existing scout files; no agent is added/removed, so the
  22-path registration surface (CANONICAL_ROLES, resolve-agent-model, install/uninstall REQUIRED_AGENTS,
  validate-vendored-agents, config/agents.toml, contract-validator counts, test-*-workflow-scripts.js
  counts) is untouched. scout stays `sonnet` in resolve-agent-model — unchanged.
- **Forge-neutrality (#341).** The scout root `.md` may say `gh issue list` (it is the github edition);
  the three plugin `.toml` ports MUST stay forge-neutral ("the forge CLI"). n2 verifies the two forge
  ports immediately with the standalone count-independent forbidden-token check
  (`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
  --forbidden-only plugins/kaola-workflow-gitlab/agents/issue-scout.toml` and the gitea twin) instead
  of waiting for the full chains.
- **Cross-edition diff → four npm chains at finalize.** This diff touches `plugins/kaola-workflow*/`,
  so all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green
  (run sequentially) before the sink — recorded by the finalize sink.
- **Decision record: `D-524-01`** (next free number — no existing D-524 record in `docs/decisions/`).
  Records the priority-first ranking precedence (priority/drive-order/Project-rules > cohesion >
  actionability) and the explicit-frontier-blocked-over-silent-proxy rule.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | code-architect | — | — | 1 | sequence | opus |
| n2-scout-impl | implementer | n1-design | agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml | 4 | sequence | sonnet |
| n3-review | code-reviewer | n2-scout-impl | — | 1 | sequence | opus |
| n4-docs | doc-updater | n3-review | CHANGELOG.md, docs/decisions/D-524-01.md | 2 | sequence | sonnet |
| n5-finalize | finalize | n4-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-scout-impl | complete |
| n3-review | complete |
| n4-docs | complete |
| n5-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design) | subagent-invoked | evidence-binding: n1-design b5edef33e399 | |
| implementer (n2-scout-impl) | subagent-invoked | evidence-binding: n2-scout-impl 2e6d6a1b7fc7 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review bc3cfb70462e | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 8094c744d0f3 | |
