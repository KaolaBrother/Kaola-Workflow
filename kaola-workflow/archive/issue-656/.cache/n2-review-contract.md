evidence-binding: n2-review-contract 15e488a89604
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=All three literal Claude workflow-planner prompts remain self-contained and structurally inspected
finding: id=R2 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=Exact Codex spawn-object parser now rejects duplicates conflicting values transient fields unknown keys reorderings and omissions across all six surfaces

# Code Review — n2-review-contract (fourth gate attempt)

## CRITICAL

None open.

## HIGH

None.

## MEDIUM

None.

## LOW

None.

No blocking findings were found.

## Prior-finding dispositions

- R1 RESOLVED and stable. `commands/kaola-workflow-adapt.md:97-106`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:95-104`, and `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:95-104` still carry repository root, selected issue/set/project, the `kaola-workflow-adapt` skill and workflow-planner contract, the `agents/workflow-planner.md` Method, and bounded durable handoff return directly inside each literal native Claude `Agent(... prompt=...)`.
- R1 structural guard PASS. `scripts/validate-workflow-contracts.js:78-88` extracts the literal workflow-planner Agent block and its prompt; lines 846-850 invoke it for all three Claude adapt commands. The plugin validator remains byte-identical.
- R2 RESOLVED. `scripts/test-route-reachability.js:28-47` extracts the fenced direct `agents.spawn_agent` object, parses every object line, requires exactly the ordered four-key schema `task_name`, `agent_type`, `fork_turns`, `message`, checks exact task/role/fork values, and checks repository/target/contract/return/full-history message invariants. Any duplicate, unknown, malformed, reordered, transient, conflicting, or missing key fails closed.
- R2 committed mutation coverage PASS. `scripts/test-route-reachability.js:50-58` builds duplicate task/role/fork/message cases while retaining the good fields; the next and adapt loops apply those controls to all six SKILL surfaces. The standard combined corruption separately exercises forbidden fork plus transient model/effort.

## Invariant-by-invariant review

- Six Claude/Codex routing pairs: PASS. All twelve next/adapt surfaces carry the shared isolated control-plane invariant, and the Claude adapt literals plus all six Codex objects are structurally inspected.
- Direct Codex v2 tool: PASS. Each literal object uses direct `agents.spawn_agent`; no object uses `functions.exec`, Code Mode, or the reserved collaboration namespace.
- Exact Codex object shape: PASS. All six real objects are accepted only with one ordered task, role, fork, and message field. Stable expected task names and explicit named roles are enforced.
- Literal isolation: PASS. Exact `fork_turns: "none"` is required; a second or replacement `fork_turns: "all"` is rejected; prose also forbids full-history dispatch.
- Transient/unknown keys: PASS. In-memory model-only, reasoning-effort-only, and unknown-key mutations were independently rejected on every next/adapt edition. The exact four-key parser inherently fails any extra key.
- Self-contained bounded message: PASS. The one message must start with repository-root context, include target/profile/bounded-return fields and `Return only`, and reject full-parent-conversation inheritance.
- Stable/valid v2 identity: PASS. Issue-scout uses `issue_scout`; workflow-planner uses `workflow_planner_<issue-or-project>` with lowercase-letter/digit/underscore suffix sanitization.
- v1 isolation: PASS at the routing-contract level. Both roles retain `fork_turns: "none"` and the established identity/header convention without inherited history.
- Malformed-shape retry: PASS. Same-role/task/brief/return correction is retried exactly once; inline issue selection/DAG authoring is prohibited for that refusal; `local-fallback-tool-unavailable` is reserved for genuine tool absence.
- Generated next parity: PASS. All 12 generated surfaces byte-match the canonical skeleton.
- Adapt mirror parity: PASS. Claude/Codex additions are synchronized across GitHub, GitLab, and Gitea modulo established forge nouns.
- Common validator identity: PASS. Root/plugin workflow validators are byte-identical with SHA-256 `710eadfaade102046b11ab5f5ebc89351c228f8cb5280ce69933a39949448f1b`.
- Forge-neutral prose: PASS. GitLab and Gitea forbidden-only validators passed over their four changed routing files.
- Scope/security/maintainability: PASS. The 18 changed product/test files remain inside the frozen 25-file write set; the exact parser is small and fail-closed; no security-sensitive runtime implementation changed; `git diff --check` passed.

## Independent corruption matrix

- Evaluated the actual `controlPlaneBlockValid` and `conflictingControlPlaneMutations` implementations in memory against all three next and all three adapt Codex SKILLs.
- For every one of the six files, the real object returned `true`.
- For every one of the six files, duplicate wrong task, duplicate wrong role, duplicate `fork_turns: "all"`, and duplicate full-parent-history message returned `false` while the good field remained in the same object.
- For every one of the six files, standalone `model`, standalone `reasoning_effort`, unknown `timeout`, reordered task/role keys, and missing fork returned `false`.
- Total: 60 independent checks, 0 failures.

## Command outcomes

- Focused chain: `node scripts/test-route-reachability.js && node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js && cmp -s scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js && node scripts/generate-routing-surfaces.js --check && node scripts/edition-sync.js --check && node scripts/test-install-model-rendering.js` — exit 0. Receipts: 456 route assertions, both contract validators, common-validator byte identity, all 12 generated surfaces, edition sync (10 forge ports / 24 COMMON_SCRIPTS / 27 byte-identical groups), and install model rendering passed.
- Forge chain: GitLab and Gitea `--forbidden-only` validators over their four changed routing files — exit 0 for both.
- Required sequential chain: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0. All four edition validators, walkthroughs, parity checks, and generated-surface checks completed green. Expected negative-fixture error text inside passing Claude tests did not affect the chain result.
- Upstream evidence reviewed: `kaola-workflow/issue-656/.cache/n1-pin-control-plane-spawn.md`, including the original implementation and the R1, adversarial-v2, and R2 repair RED/GREEN cycles.

## Verdict

APPROVE. R1 and R2 are resolved, the exact-object repair withstands all independent mutations, no new defects or missing-test blockers were found, and focused plus mandatory sequential cross-edition validations are green.
