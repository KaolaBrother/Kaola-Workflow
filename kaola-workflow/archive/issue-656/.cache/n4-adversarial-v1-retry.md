evidence-binding: n4-adversarial-v1-retry a62c32e5a241
verdict: pass
findings_blocking: 0
upstream_read: n1-pin-control-plane-spawn 398397900bc8
upstream_read: n2-review-contract 15e488a89604
delegation_outcome: completed
source: issue-656 repaired candidate at HEAD 05a3ae11b6e69217597801f232fe606973e03df2

# Adversarial falsification — n4-adversarial-v1-retry (final repaired candidate)

## Claim under test

Issue #656, fallback/refusal-classifier surface: the observed rejection
`Full-history forked agents inherit the parent agent type, model, and reasoning effort; omit agent_type, model, and reasoning_effort, or spawn without a full-history fork.` must route every Codex issue-scout and workflow-planner control-plane surface to exactly one corrected retry with the same named role and task identity, literal isolated context, and bounded durable return. It must never route that rejection to capacity handling, inline selection/authoring, a default role, or `local-fallback-tool-unavailable`. Codex v1 must retain literal `fork_turns: "none"`, its established identity/header convention, and enough repository/target/contract/return context to work without parent history. All GitHub/GitLab/Gitea Claude command editions must retain the shared self-contained invariant and literal prompt context without Codex tool vocabulary. The repaired exact-object assertions must neither weaken nor contradict that fallback prose.

## Strongest disproof attempts and results

### 1. Exact rejection fixture against all six Codex control-plane surfaces

- Applied the full rejection fixture as the hypothetical first spawn result on each of the three issue-scout next SKILLs. At `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:178-182` and the GitLab/Gitea same-line mirrors, the exact fixture is classified as `argument-shape refusal`, explicitly `not capacity or unavailable tooling`; the required action is to correct to the literal object and retry the same `issue-scout` role, task identity, isolated brief, and bounded return exactly once. Inline issue selection is forbidden and `local-fallback-tool-unavailable` is reserved for genuine tool absence.
- Applied the same fixture class on each of the three workflow-planner adapt SKILLs. At `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:208-216` and the two same-line forge mirrors, the observed full-history rejection is classified as `argument-shape refusal`; the same `workflow-planner` role/task/brief/return is retried exactly once. Inline DAG authoring is forbidden and tool-unavailable fallback is reserved for genuine absence.
- Tried the wrong branches explicitly: capacity remedy, default role, inline work, and tool-unavailable compliance. No control-plane retry block contains a thread/agent-limit capacity remedy; the next block explicitly excludes capacity. The next preflight paragraph at lines 156-160 separately prohibits default-role fallback for transport/schema failures, while the fixture paragraph selects same named role. The adapt planner-first boundary at lines 148-155 allows inline work only when tooling is genuinely absent, and line 216 excludes the observed argument-shape rejection from that condition.

No classifier counterexample was found.

### 2. Corrected object-to-fallback consistency after strict assertion repair

- Independently parsed the one fenced `agents.spawn_agent` object in each Codex surface. Each has exactly the ordered four-key schema `task_name`, `agent_type`, `fork_turns`, `message`; issue-scout resolves to `issue_scout` / `issue-scout`, workflow-planner to `workflow_planner_<issue-or-project>` / `workflow-planner`, and all six use literal `fork_turns: "none"`.
- Reconstructed each corrected message without the parent transcript. Every message begins with repository root, then carries target request/project, the role skill/profile contract, `Return only`, and the bounded recommendation JSON or handoff packet. None mentions parent history.
- Compared the accepted object to its adjacent retry prose: role and task identity match, `fork_turns: "none"` matches, the same isolated brief/return is named, and the retry bound is exactly once. Each role's three edition blocks are byte-identical.
- Inspected `scripts/test-route-reachability.js:28-47`: the repaired validator binds to the literal fenced object, parses every line, requires the exact four keys and exact values, validates repository/target/contract/return fields, and rejects inherited-parent wording. The negative battery at lines 50-58 and 260-303 corrupts transient fields and duplicates task, default role, full-history fork, or parent-history message while leaving good nearby prose in place. Thus the strict object check cannot be satisfied by the fallback prose and does not reinterpret or weaken it.
- Ran an independent object/prose matrix, separate from the committed helper: `final adversarial matrix passed: 283 object/prose checks across 12 surfaces`. It verified one exact object, object/message context, adjacent classifier semantics, same-role/task/once alignment, wrong-branch exclusions, v1 clauses, Claude prompt contents, edition parity, and vocabulary isolation.

No strict-assertion contradiction or coverage-laundering counterexample was found.

### 3. v1 identity/header and parent-history removal attack

- All three next SKILLs state at lines 173-181 that the control-plane brief is isolated/self-contained, v1 uses literal `fork_turns: "none"`, the established identity/header convention is preserved, and no control-plane dispatch uses `fork_turns: "all"`.
- All three adapt SKILLs state the same v1 preservation and isolation at lines 208-216.
- The unchanged established v1 dispatch convention remains concrete in `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md:109-114`: omit `task_name`, retain the named `agent_type`, use `fork_turns: "none"`, omit transient model/effort, prefix the identity header, and supply working context. Issue #656 changes no dispatch runtime or agent profile, so the convention is retained rather than silently replaced.
- With parent history removed, the control-plane objects still carry repository, target, contract, and bounded-return context, and the v1 clauses explicitly preserve that same isolated identity/brief convention.

No v1 identity-loss or missing-context counterexample was found.

### 4. Claude prompt repair and vocabulary-leak attack

- The three Claude next invariant blocks at `commands/workflow-next.md:159-166` and forge same-line mirrors require repository root, selected request, issue-scout profile/read-only contract, complete recommendation JSON, isolated identity, same-role one retry, and no inline selection.
- The three literal Claude workflow-planner `Agent(...)` prompts at `commands/kaola-workflow-adapt.md:97-106` and forge mirrors directly contain repository root, selected issue/set/project, `kaola-workflow-adapt` plus workflow-planner contract, `agents/workflow-planner.md` Method, and bounded durable handoff return. Their adjacent shared invariant prohibits inherited main-session context and inline authoring.
- Scanned all six complete Claude command files with token-bounded patterns for `agents.spawn_agent`, `collaboration.spawn_agent`, `functions.exec`, standalone `task_name`/`agent_type`, `fork_turns`, `local-fallback-tool-unavailable`, and `Code Mode`; all six were clean. An initial unbounded probe matched native Claude `subagent_type` as the substring `agent_type`; the corrected token-bounded probe passed, confirming a probe false positive rather than a product leak.

No prompt regression, edition drift, or Codex-vocabulary leak was found.

## Executed validation

- `node scripts/test-route-reachability.js` — exit 0, 456 assertions including exact-object positive and mutation-negative controls.
- `node scripts/validate-workflow-contracts.js` — exit 0.
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0.
- `node scripts/generate-routing-surfaces.js --check` — exit 0; all 12 generated surfaces match the skeleton.
- `node scripts/edition-sync.js --check` — exit 0; 10 forge ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- `node scripts/test-install-model-rendering.js` — exit 0.
- `git diff --check` — exit 0.
- Fresh upstream n1 and n2 evidence were read completely. n1 records the R1, adversarial-v2, and R2 RED/GREEN repair cycles and a green sequential four-edition command. n2 independently reports 60 corruption checks with zero failures and a green fresh sequential four-edition command.

## Verdict

NOT-REFUTED, high confidence. The final repaired candidate survived the exact fixture, all wrong-route branches, object/prose mismatch attempts, v1 no-history reconstruction, strict-assertion review, cross-edition comparison, and whole-command vocabulary scan. No in-scope blocking finding remains.
