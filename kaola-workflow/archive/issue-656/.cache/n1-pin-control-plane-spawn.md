evidence-binding: n1-pin-control-plane-spawn 398397900bc8
<!-- RED: paste RED here -->
RED: `node scripts/test-route-reachability.js; node scripts/validate-workflow-contracts.js; node scripts/validate-kaola-workflow-contracts.js` failed before prose implementation (real fixture root created with `mktemp -d "${TMPDIR:-/tmp}/issue-656-red.XXXXXX"`): route=1/root=1/codex=1. Representative signature: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md must pin isolated issue-scout control-plane token task_name: "issue_scout"`; root validator: `commands/workflow-next.md must include: isolated, self-contained control-plane brief`; Codex validator: `kaola-workflow-next/SKILL.md must include: agent_type: "issue-scout"`. Route battery reported 45 failures, 375 passes.
<!-- GREEN: paste GREEN here -->
GREEN: The same focused route/root/Codex contract surfaces passed after implementation: `Route-reachability test passed (420 assertions)`, `Workflow contract validation passed`, and `Kaola-Workflow Codex contract validation passed`. Required sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` exited 0; each edition completed its validator/walkthrough/generator checks.

## Assigned task
n1-pin-control-plane-spawn: pin isolated, self-contained issue-scout and workflow-planner control-plane dispatch across Claude/Codex and GitHub/GitLab/Gitea routing surfaces, including stable v2 identity, literal `fork_turns: "none"`, bounded prompt/return context, v1 isolation, and same-role one-retry argument-shape correction.

## Write set used
- Canonical/generated next: `templates/routing/next.skeleton.md`, `templates/routing/required-blocks.js`, the three `commands/workflow-next.md` editions, and the three Codex `kaola-workflow-next/SKILL.md` editions.
- Manual adapt mirrors: three `commands/kaola-workflow-adapt.md` editions and three Codex `kaola-workflow-adapt/SKILL.md` editions.
- Tests/contracts: `scripts/test-route-reachability.js`, root/plugin byte-identical `validate-workflow-contracts.js`, and `scripts/validate-kaola-workflow-contracts.js`.
- No product/test file outside the frozen 25-file declared write set was changed. The seeded evidence file is the sole extra write.

## Tests changed
- `scripts/test-route-reachability.js`: asserts literal direct v2 issue-scout/workflow-planner shapes, stable task names, isolated context, bounded return, one retry, and full-history prohibition across all Codex SKILL editions.
- `scripts/validate-workflow-contracts.js` and byte-identical plugin mirror: assert runtime-neutral isolation and refusal classification on Claude next/adapt commands.
- `scripts/validate-kaola-workflow-contracts.js`: asserts direct Codex role/task/fork shape and retry contract on next/adapt SKILLs.
- `templates/routing/required-blocks.js`: makes the generated Codex/Claude next tokens required blocks.

## Implementation files changed
`templates/routing/next.skeleton.md`; six generated next surfaces; six manual adapt surfaces. Codex examples use direct `agents.spawn_agent`, `task_name: "issue_scout"` / `task_name: "workflow_planner_<issue-or-project>"`, explicit named role, and `fork_turns: "none"`; no transient model/effort argument is present. Claude commands retain native `Agent(...)` and install-time model placeholders.

## Validation commands and results
- RED command above: expected failure, exit tuple 1/1/1.
- `node scripts/generate-routing-surfaces.js --write`: rendered 12 surfaces.
- `node scripts/test-route-reachability.js && node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js`: exit 0.
- `node scripts/generate-routing-surfaces.js --check`: all 12 surfaces byte-match skeleton.
- `node scripts/edition-sync.js --check`: 10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity.
- `cmp -s scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`: exit 0, byte-identical.
- GitLab/Gitea validators with `--forbidden-only` and their four changed plugin routing files: each passed (4 files).
- `node scripts/test-install-model-rendering.js`: passed.
- Codex, GitLab-Codex, and Gitea-Codex walkthrough commands: passed.
- Sequential Meta four-chain command: exit 0. Claude, Codex, GitLab, and Gitea chains all passed; generator checks remained green at each edition boundary.

## Refactor and residual risk
Refactor stayed limited to canonical prose reuse, generated synchronization, and byte-identical validator mirroring. No coverage command is defined; the frozen Meta validation command was used. Residual risk is low: prose semantics are contract-token tested rather than exercising a live Codex v1/v2 spawn service, so direct runtime acceptance remains dependent on the installed tool schema; the literal argument objects and observed rejection classification are pinned for detached review/adversarial verification.

## Reviewer repair — literal Claude planner prompt binding

RED: Added `assertWorkflowPlannerPromptSelfContained(file)` to the byte-identical root/plugin workflow contract validators. It extracts the literal `Agent(` block whose `subagent_type="workflow-planner"`, extracts that block's `prompt="..."`, and requires `Repository root:`, `Selected issue/set/project:`, the workflow-planner contract/profile path, and `bounded durable handoff packet` inside that prompt itself. With a real temporary fixture root from `mktemp -d "${TMPDIR:-/tmp}/issue-656-repair-red.XXXXXX"`, `node scripts/validate-workflow-contracts.js` exited 1 before prose repair: `commands/kaola-workflow-adapt.md workflow-planner literal prompt missing: Repository root:`.

GREEN: Updated the literal native `Agent(...)` prompt in the GitHub, GitLab, and Gitea Claude adapt commands. Each prompt now directly carries `{repo-root}`, `{issue-or-project}`, the `kaola-workflow-adapt` skill plus workflow-planner contract and `agents/workflow-planner.md` Method, and the bounded durable handoff-packet return. Native Agent syntax and `model="{WORKFLOW_PLANNER_MODEL}"` remain intact. `node scripts/validate-workflow-contracts.js` then passed, proving all three extracted prompt blocks satisfy the structural contract.

Repair files changed: `commands/kaola-workflow-adapt.md`, both forge command mirrors, `scripts/validate-workflow-contracts.js`, and its byte-identical `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` mirror. All are in the original declared write set.

Repair validation receipts:
- `node scripts/validate-workflow-contracts.js && cmp -s scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js && node scripts/test-route-reachability.js && node scripts/validate-kaola-workflow-contracts.js`: exit 0; structural prompt check, byte identity, 420 reachability assertions, and Codex contracts passed.
- `node scripts/generate-routing-surfaces.js --check`: all 12 surfaces byte-match the skeleton.
- `node scripts/edition-sync.js --check`: 10 forge ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- GitLab and Gitea `--forbidden-only` checks over their four changed routing files: each passed (4 files).
- Sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`: exit 0 after repair; all four edition chains and walkthroughs passed.

Repair residual risk: low. The structural validator now prevents nearby whole-file prose from satisfying the literal prompt contract. Runtime placeholder substitution remains installer/orchestrator behavior covered by the existing installation-rendering and edition suites.

## Adversarial v2 repair — literal Codex spawn-object binding

RED: Added mutation negative controls for all three Codex next SKILLs and all three Codex adapt SKILLs. Each fixture preserves the full document and nearby compliant v1/prohibition prose while corrupting only the literal `agents.spawn_agent` object: `fork_turns: "none"` → `fork_turns: "all"`, plus `model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`. With a real fixture directory from `mktemp -d "${TMPDIR:-/tmp}/issue-656-v2-red.XXXXXX"`, `node scripts/test-route-reachability.js` exited 1: six `T5b mutation` failures (one per literal issue-scout/workflow-planner block), while the prior 420 predicates still passed. This reproduced the adversarial finding that whole-document token checks were not structurally bound.

GREEN: Replaced the weak predicate with `controlPlaneBlockValid(content, spec)`, which extracts the exact fenced YAML object beginning `agents.spawn_agent:`, validates exact `task_name`, exact `agent_type`, literal `fork_turns: "none"`, required repository/target/profile/return fields inside that object's `message`, and rejects `model` or `reasoning_effort` keys inside the object. Every real literal object is positively asserted and every corrupted object is negatively asserted. `node scripts/test-route-reachability.js` passed with 432 assertions (12 new structural/mutation checks across six surfaces). Existing valid product prose required no change.

Adversarial repair file changed: `scripts/test-route-reachability.js` only, within the original declared write set; evidence appended here under the seeded binding.

Adversarial repair validation receipts:
- Focused structural/mutation plus root/Codex contracts: exit 0; route reachability 432 assertions, workflow contracts passed, Codex contracts passed, common validator pair remained byte-identical.
- `node scripts/generate-routing-surfaces.js --check`: all 12 generated surfaces byte-match the canonical skeleton.
- `node scripts/edition-sync.js --check`: 10 forge ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- GitLab and Gitea `--forbidden-only` checks over their four routing files: each passed (4 files).
- Sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`: exit 0; all four edition chains, walkthroughs, synchronization, and generator checks passed.

Adversarial repair residual risk: low. The extractor intentionally targets the first fenced YAML `agents.spawn_agent` object in each control-plane SKILL; these SKILLs currently contain exactly the relevant literal control-plane example at that seam. A future additional earlier YAML spawn example would fail or redirect the structural check and should be accompanied by an explicit role-targeted extractor update.

## R2 repair — exact Codex spawn-object schema

RED: After reading the retained blocking review, added four independent duplicate/conflict mutations per literal object while preserving every compliant field in the same block: a second `task_name: "wrong_task"`, `agent_type: "default"`, `fork_turns: "all"`, or `message: "inherit the full parent conversation"`. Applied across all three next and all three adapt Codex SKILLs, separate from the existing transient `model`/`reasoning_effort` mutation. With a real fixture directory from `mktemp -d "${TMPDIR:-/tmp}/issue-656-r2-red.XXXXXX"`, `node scripts/test-route-reachability.js` exited 1 with 24 `T5b duplicate mutation` failures while all prior 432 assertions passed.

GREEN: `controlPlaneBlockValid` now parses every line in the extracted literal object and enforces an exact ordered four-key schema: one `task_name`, one `agent_type`, one `fork_turns`, and one `message`. Any duplicate, unknown, malformed, reordered, transient, or conflicting key fails closed. Values must match the expected stable task, named role, and `fork_turns: "none"`; the single message must start with repository-root context, include the target/profile/bounded-return fields, require `Return only`, and reject parent-conversation inheritance. The corrected mutation helper targets the extracted spawn block itself. `node scripts/test-route-reachability.js` passed with 456 assertions: six positive objects, six transient corruptions, and 24 duplicate/conflict corruptions all behaved as required.

R2 repair file changed: `scripts/test-route-reachability.js` only, inside the original declared write set. Existing compliant Codex/Claude/v1 prose and generated sources were unchanged.

R2 validation receipts:
- Focused structural/mutation, root/Codex contracts, and validator byte identity: exit 0; 456 route assertions passed, both validators passed, common root/plugin pair remained byte-identical.
- `node scripts/generate-routing-surfaces.js --check`: all 12 generated surfaces byte-match the skeleton.
- `node scripts/edition-sync.js --check`: 10 forge ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- GitLab and Gitea `--forbidden-only` checks over their four routing files: each passed (4 files).
- Sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`: exit 0; all four edition validators, walkthroughs, sync checks, and generator checks passed.

R2 residual risk: low. The exact schema intentionally treats future extra spawn keys as contract changes requiring an explicit test/spec update, which is the desired fail-closed behavior for this control-plane example.
