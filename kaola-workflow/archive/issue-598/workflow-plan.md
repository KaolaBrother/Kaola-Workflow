# Workflow Plan — issue #598

<!-- plan_hash: f5e5b95cf15928d413d28dcc0f3dba75e0406670c86a543c49e5e88129603f04 -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts, area:workflow-phases
validation_command: node scripts/test-install-model-rendering.js && node scripts/validate-kaola-workflow-contracts.js && node scripts/validate-workflow-contracts.js && node scripts/validate-script-sync.js && KAOLA_RUN_CHAINS_CONCURRENCY=serial npm run test:kaola-workflow:claude && KAOLA_RUN_CHAINS_CONCURRENCY=serial npm run test:kaola-workflow:codex && KAOLA_RUN_CHAINS_CONCURRENCY=serial npm run test:kaola-workflow:gitlab && KAOLA_RUN_CHAINS_CONCURRENCY=serial npm run test:kaola-workflow:gitea

## Plan Notes

Goal: make the Codex runtime's local dispatch configuration a VERIFIED part of the install contract so a
run can never silently degrade to inline self-review while every current check reports "ok". Direct
follow-up to #584 (which added `multi_agent_v2` detection) — #598 adds the effort-gated dispatch MODE
that #584 left, fixes the `--global`-blind delegation probe, and makes gate-role degradation loud.

This is a BUILD (shape fully known): the Codex mechanics are verified in the issue (codex-tui 0.142.5) —
`MultiAgentMode = none | explicitRequestOnly | proactive`, effort-gated (`model_reasoning_effort = "ultra"`
→ proactive, else explicitRequestOnly), no working config key for the mode. No `knowledge-lookup` node:
the external facts are supplied and verified. Cross-edition change → all four chains are the acceptance
gate (#307); run chains with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` on this host (octopus-merge SIGKILL).

Node roles map 1:1 to the ACs; no security-sensitive surface (no G2). The whole issue is about a gate that
fail-opened silently and a false-"ok" that passed every check, so an independent adversarial gate ahead of
the final code review is warranted (find the fail-open hole: a fatal WARN, a mis-derived posture, prose the
harness can still override). The two gates are SERIAL (adversarial → code-review) so the code-reviewer is a
choke point that post-dominates both code nodes (G1); the doc node then depends solely on that gate, exposing
speculative overlap under the default `auto` policy.

Shared canonical specs (the cross-edition mirror nodes converge by construction, not free-form):

- n1 (AC1 installer report + AC2 preflight WARN) — the effort→mode derivation is authored ONCE and mirrored
  byte-identically across the installer (×3, `validate-script-sync.js` "codex agent-profile installer copies"
  group) and the preflight (×4, "codex-preflight copies" group). Derivation: `model_reasoning_effort = "ultra"`
  → proactive; lower/absent effort → explicitRequestOnly; `[features] multi_agent`/`multi_agent_v2` absent-or-false
  → none. VERSION-GUARD the coupling (0.142.5 CLI behavior, may change): the report/WARN MUST be attestation-style
  NON-FATAL — it may NEVER red an otherwise-fresh install or preflight. Keep the existing `dispatch_mode`
  (`v2-task-name`/`v1-thread-id`) field UNCHANGED; the posture is additive. Installer (AC1): after a successful
  install, REPORT the effective dispatch posture + exact remediation (`model_reasoning_effort = "ultra"`, per-session
  `codex -c model_reasoning_effort=ultra`, or an explicit in-session "use subagents" request) whenever the posture is
  explicitRequestOnly/none — an install that prints `status: ok` while dispatch is model-refused is a failed install
  for the workflow's purposes. Preflight/doctor (AC2): add the effort/mode signal to the scope report and WARN
  (non-fatal) on explicitRequestOnly/none, naming the remediation. Extend the `assertDispatchModeForConfig`-style
  coverage in the codex walkthrough + effort→mode unit tests in `test-install-model-rendering.js` + the two forge
  test scripts.

- n2 (AC3 delegation probe + AC4 gate degradation) — forge-neutral prose only (no `gh`/`glab`/brand tokens).
  AC3: the delegation probe must accept BOTH project-local `.codex/agents/kaola-workflow/` AND global
  `$CODEX_HOME/agents/kaola-workflow/` (`~/.codex/agents/kaola-workflow/`); a `--global` install (#571) satisfies
  delegation exactly as a project-local one does. Keep the existing `.codex/agents/kaola-workflow/` needle GREEN
  (add, never remove). Mirror across the 3 Codex editions' `kaola-workflow-next` + `kaola-workflow-adapt` SKILLs.
  AC4: gate-role degradation must surface LOUDLY at run start — when dispatch is unavailable (profiles missing OR
  effort-gated mode-refused), the plan-run executor posts a prominent notice naming which gate roles
  (adversarial-verifier/code-reviewer/security-reviewer) would self-review, and for adversarial-verifier/code-reviewer
  routes through the consent-halt valve (`write-halt --reason consent`) instead of silently recording a self-issued
  `verdict: pass` (an inline gate reviewing its own writer-context is no gate). Mirror across the 6 plan-run routing
  surfaces (3 Claude commands + 3 Codex SKILLs) per the six-surface contract. Add contract-validator needles (all 3
  editions: `validate-kaola-workflow-contracts.js` + the two forge ports) machine-guarding the global-path acceptance
  and the gate-degradation notice so a partial propagation reds the chain.

- n5 (docs) — README Codex install section documents the dispatch-posture report + remediation (AC1);
  `docs/api.md` (preflight/doctor CLI) + `docs/architecture.md` (preflight gate) document the additive effort→mode
  WARN/posture; the `workflow-init` config-audit guidance (command + SKILL, 3 editions — byte-pairs, keep parity)
  is extended so "features enabled" alone is no longer reported as effort-safe dispatch-ready (report the effort→mode
  posture consistently with the installer/preflight — the same false-"ok" surface). `D-598-01` records the decision
  (design boundary: installer REPORTS, never silently writes user-owned effort config). Do not edit existing decision
  records.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-runtime-dispatch-contract | tdd-guide | — | plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 11 | sequence | sonnet | — |
| n2-delegation-gate-prose | tdd-guide | — | plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 15 | sequence | sonnet | — |
| n3-adversarial | adversarial-verifier | n1-runtime-dispatch-contract, n2-delegation-gate-prose | — | 1 | sequence | opus | — |
| n4-review | code-reviewer | n3-adversarial | — | 1 | sequence | opus | — |
| n5-docs | doc-updater | n4-review | README.md, docs/api.md, docs/architecture.md, commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, docs/decisions/D-598-01.md | 10 | sequence | sonnet | — |
| n6-finalize | finalize | n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-runtime-dispatch-contract | complete |
| n2-delegation-gate-prose | complete |
| n3-adversarial | complete |
| n4-review | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-delegation-gate-prose) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-runtime-dispatch-contract) | subagent-invoked | group_passed | |
| adversarial-verifier (n3-adversarial) | subagent-invoked | evidence-binding: n3-adversarial 0bbae22da610 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 8a1ed664eb4e | |
| doc-updater (n5-docs) | subagent-invoked | group_passed | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize ff5311751a8b | |
