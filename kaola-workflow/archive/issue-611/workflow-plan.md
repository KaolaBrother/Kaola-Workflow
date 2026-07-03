# Adaptive Workflow Plan — issue-611

<!-- plan_hash: 487431c483bae366ff39ae45ed851be6897b6ce0c428f6e449be31176df50b23 -->

Codex dispatch JOIN protocol — the complement of the authorization half. Adds wait budgets,
agent-lifecycle hygiene, writer kill-safety, and frontier discipline so authorized Codex spawns
no longer degrade into serial busy-waiting punctuated by impatience-kills of healthy agents.

## Meta

labels: enhancement, area:scripts, area:workflow-phases
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-engine | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | opus |
| n2-preflight | tdd-guide | — | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js | 1 | sequence | sonnet |
| n3-prose | implementer | n1-engine | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, docs/plan-run-cards/join-protocol.md | 1 | sequence | sonnet |
| n4-adversarial | adversarial-verifier | n1-engine | — | 1 | sequence | opus |
| n5-docs | doc-updater | n1-engine, n2-preflight, n3-prose | CHANGELOG.md, docs/decisions/D-611-01.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/plan-run-cards/README.md | 1 | sequence | sonnet |
| n6-review | code-reviewer | n1-engine, n2-preflight, n3-prose, n4-adversarial, n5-docs | — | 1 | sequence | opus |
| n7-finalize | finalize | n6-review | — | 1 | sequence | — |

## Plan Notes

**AC → node map.**
- AC2 (dispatch cards carry `wait_budget_minutes`, effort-tier default + planner-overridable; walkthrough asserts presence) → **n1-engine** (`buildDispatch` in adaptive-node.js reads a tier→budget derivation living beside `dispatchEffort` in adaptive-schema.js; claude walkthrough asserts presence; unit coverage in test-adaptive-node.js).
- AC3 (extend `reconcile-running-set` to diff an interrupted writer's actual worktree changes vs its declared write set, emit typed `adopt | revert | halt`, fail-closed on out-of-write-set) → **n1-engine** (extend the existing `runReconcileRunningSet` — reuse before adding, per the NON-goal "no new subcommand if extending fits").
- AC5 (typed delegation outcomes `completed | returned_partial | interrupted_unresponsive | interrupted_obsolete` in the node evidence contract; walkthrough exercises `completed` + one interrupted path) → **n1-engine** (evidence contract + claude walkthrough coverage).
- AC1 (Join Protocol section — arms A–C+F — in the three Codex plan-run SKILL packs) + AC4 (Codex dispatch prose mandates `fork_turns: "none"` for EVERY role dispatch, dropping the tiered-only qualifier) + AC7 six-surface routing-prose propagation → **n3-prose** (all 6 plan-run surfaces + the join-protocol plan-run card + the token pins in all 5 edition contract validators, following the existing `planRunSurfaces` six-surface sentinel pattern).
- AC6 (preflight/installer report effective v2 slots + wait-timeout bounds + recommended `[features.multi_agent_v2]` config, version-guarded like the authorization posture check) → **n2-preflight** (extends the report in kaola-workflow-codex-preflight.js AND the duplicated derivation/emission in install-codex-agent-profiles.js; codex walkthrough + test-install-model-rendering.js assert the report). The human-facing recommended-config prose lands in docs via **n5-docs**.
- AC7 (walkthrough + all four chains green) → the run-wide obligation; **n6-review** runs all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains sequentially as the accuracy gate, HEAD-bound after every writer + n5-docs.

**Cross-edition write-set walls honored.**
- `adaptive-node.js` is a GENERATED_AGGREGATOR — n1 declares the canonical + codex twin + the two RENAMED forge ports (`kaola-gitlab-workflow-`/`kaola-gitea-workflow-`) atomically (`generated_port_split`).
- `adaptive-schema.js` (×4), `kaola-workflow-codex-preflight.js` (×4), `install-codex-agent-profiles.js` (×3 — no root copy), and `validate-workflow-contracts.js` (claude↔codex COMMON pair) are byte-identical SYNC-GROUPS — every peer is co-declared in its node so no `sync-group gap` at freeze. The forge ports/mirrors are regenerated via `edition-sync.js --write` / byte-copy and stay in the declaring node's set.
- The three renamed forge contract validators (`validate-kaola-workflow-{,gitlab,gitea}-contracts.js`) are distinct files, all co-declared in n3.

**Parallelism (accuracy first, then makespan).** n1-engine ∥ n2-preflight is a genuine antichain — exact-file-disjoint (adaptive-* / engine tests vs codex-preflight / installer / codex walkthrough), no dep edge, so the scheduler co-opens them in isolated legs by default under the retained net (post-dominating n6 code-reviewer, no PROTECTED file in either set) and serial-degrades safely on a host without worktree support. n3-prose and n4-adversarial both fan out after n1. n2 hides under the n1→n3→n5 critical path. `parallel_safe` is left for the validator to derive — never hand-authored.

**n3 role rationale (implementer, non_tdd_reason).** Agent-facing prose propagation across the six plan-run surfaces plus edition contract-validator token pins — config/prose/wiring with no behavioral unit-under-test; the contract validators ARE the propagation assertions, authored alongside the prose (they turn a six-surface drop RED), not a failing behavior spec. Agent-facing surfaces stay forge-neutral and provenance-free; provenance lives in n5-docs (CHANGELOG / the decision record / commit messages).

**n4 adversarial rationale.** AC3's writer kill-safety is a fail-closed safety mechanism directly analogous to a prior fail-closed takeover design whose adversarial gate refuted a concurrent hole the standard tdd+review flow missed. A read-only opus adversarial pass over the reconcile `adopt|revert|halt` verdicts + the out-of-write-set fail-closed classification is justified insurance (accuracy is non-negotiable; a leaked partial edit is the exact hazard this issue exists to fix). Zero blast radius; hidden under the critical path.

**Decision record.** `D-611-01` is the next free number (the repo's latest record is `D-610-01 (existing)`; no `D-611` exists). Authored by n5-docs.

**NON-goals respected (from the issue).** No proactive heartbeat/progress-file protocol; no new adaptive-node subcommand (extend `reconcile-running-set`); posture/authorization stays the authorization-half's territory — out of scope here.

## Node Ledger

| id | status |
| --- | --- |
| n1-engine | complete |
| n2-preflight | complete |
| n3-prose | complete |
| n4-adversarial | complete |
| n5-docs | complete |
| n6-review | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-engine) | subagent-invoked | evidence-binding: n1-engine 3bcefe063772 | |
| adversarial-verifier (n4-adversarial) | subagent-invoked | evidence-binding: n4-adversarial 0d805b7d474e | |
| tdd-guide (n2-preflight) | subagent-invoked | deferred_to_group | |
| implementer (n3-prose) | subagent-invoked | group_passed | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs bfab3912f9d5 | |
| code-reviewer | subagent-invoked | evidence-binding: n6-review c98bf4fa6b67 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 330fc752c29f | |
