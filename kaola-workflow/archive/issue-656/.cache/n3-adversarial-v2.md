evidence-binding: n3-adversarial-v2 78eca06b2075
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=Exact literal-object parsing now rejects the prior full-history/transient corruption and every strengthened duplicate/conflict/unknown-key mutation across all six Codex surfaces

# Adversarial Falsification — n3-adversarial-v2 (repaired candidate)

## Claim under test

Issue #656, Codex v2 issue-scout/workflow-planner control-plane surface: each literal direct `agents.spawn_agent` object is schema-valid, isolated, explicit-role, stable-identity, self-contained, and bounded; it uses `fork_turns: "none"`, omits transient model/effort, and is protected by a fail-closed structural regression barrier.

## Prior finding disposition

Prior adversarial R1 is RESOLVED. The reviewer tracks this exact-object repair as R2 because its R1 names the separate Claude prompt-binding repair. `scripts/test-route-reachability.js:28-47` now extracts the fenced `agents.spawn_agent` object, parses every object line, requires exactly the ordered four keys `task_name`, `agent_type`, `fork_turns`, `message`, checks the expected values and message invariants, and rejects every extra, duplicate, malformed, reordered, or missing key. The six next/adapt applications are at `scripts/test-route-reachability.js:252-310`.

## Disproof attempts and results

### Actual literal objects

The three issue-scout objects at `plugins/kaola-workflow*/skills/kaola-workflow-next/SKILL.md:165-171` and the three workflow-planner objects at `plugins/kaola-workflow*/skills/kaola-workflow-adapt/SKILL.md:208-215` were evaluated with the actual `controlPlaneBlockValid` implementation loaded directly from the test source. All six returned accepted. Each of the six files contains exactly one fenced `agents.spawn_agent` object.

The actual objects have exactly one of each required field, exact named role, exact stable task template, `fork_turns: "none"`, and one message beginning with repository-root context and containing target, contract, `Return only`, and bounded durable return context. Neither object carries `model`, `reasoning_effort`, or an unknown field.

### Strengthened mutation matrix

For every one of the six actual files, I retained the compliant fields inside the same literal object and independently injected:

1. duplicate `task_name: "wrong_task"`;
2. duplicate `agent_type: "default"`;
3. second `fork_turns: "all"`;
4. duplicate `message: "inherit the full parent conversation"`;
5. transient `model`;
6. transient `reasoning_effort`;
7. unknown `timeout`;
8. unknown `parent_history`;
9. reordered task/role keys;
10. missing fork; and
11. one combined corruption retaining every good field while adding the wrong task, default role, full-history fork, both transient fields, an unknown key, and the conflicting parent-history message.

Result: all 66 mutants were rejected; all six unmodified controls were accepted (72 independent outcomes, zero unexpected results). This closes the prior bypass in which compliant v1/prohibition prose elsewhere in the document satisfied whole-file token checks.

The committed battery additionally covers duplicate task/role/fork/message cases at `scripts/test-route-reachability.js:50-58`, the combined fork/model/effort corruption at lines 264-267 and 297-300, and applies those controls across all six editions. `node scripts/test-route-reachability.js` passed with 456 assertions. `node scripts/validate-workflow-contracts.js`, `node scripts/validate-kaola-workflow-contracts.js`, common-validator byte identity, `node scripts/generate-routing-surfaces.js --check`, and `git diff --check` also passed.

### Installed direct-tool schema reconstruction

The session-exposed `agents.spawn_agent` schema accepts the installed `issue-scout` and `workflow-planner` role names, a non-empty `message`, `fork_turns: "none"`, and task names made from lowercase letters, digits, and underscores. The installed profiles are present at `~/.codex/agents/kaola-workflow/issue-scout.toml:1` and `~/.codex/agents/kaola-workflow/workflow-planner.toml:1`, with profile-owned model/effort pins rather than transient call overrides.

Concrete reconstructed calls passed every exposed field constraint:

- issue-scout: `issue_scout`, role `issue-scout`, isolated next-issue/bundle request;
- single issue `Issue #656`: `workflow_planner_issue_656`;
- bundle `Issues #42, #47, #53`: `workflow_planner_issues_42_47_53`;
- project `API Gateway / Release-2.0`: `workflow_planner_api_gateway_release_2_0`.

Each planner object used role `workflow-planner`, `fork_turns: "none"`, the absolute repository root, target, skill/profile contract, bounded handoff return, and no transient pair. The raw documentation placeholder `workflow_planner_<issue-or-project>` is intentionally not schema-valid by itself; the immediately adjacent instruction at `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:216` requires converting its suffix to lowercase letters, digits, and underscores before dispatch.

### Contradiction and fallback search

No contrary active path was found. The next surface forbids the reserved `collaboration.spawn_agent`, `functions.exec`, and Code Mode at `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:156-160`, forbids `fork_turns: "all"` at line 176, and routes argument-shape refusal to the same role/identity exactly once without inline issue selection at lines 178-182. The adapt surface gives the same isolation/retry/inline-authoring rule at line 216. Its inline fallback at `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:148-155` is limited to genuine absence at both installed profile paths and therefore does not convert a malformed available-tool call into inline authoring.

## Verdict

NOT-REFUTED — confidence 0.99. The repaired candidate accepts all six real literal objects, rejects the complete prior corruption and the strengthened 66-mutant matrix, reconstructs valid issue/bundle/project calls under the installed direct-tool schema, and contains no contradictory active transport/history/fallback instruction. No blocking counterexample was found.
