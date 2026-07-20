evidence-binding: n5-front-agents-diet 2dc6c8beb4a1
upstream_read: n4-finalize-adapt-certify 02c3f39b8ef6

non_tdd_reason: behavior-preserving refactor (prose diet) — the two orchestration-agent profiles were trimmed to terse Band-1 bullets with the five contract validators plus the out-of-write-set parity / route-reachability / bash-block guards as the oracle. There is no natural failing unit test for a prose reduction; the change preserves every load-bearing needle token and keeps the guard-executed Step-8a bash block functionally verbatim.

verification_tier: regression-green
regression-green: full constraint suite green BEFORE and AFTER with no new failures — the 5 target validators (validate-workflow-contracts.js + its byte-twin plugin copy, codex, gitlab, gitea) exit 0; the out-of-write-set pin guards test-agent-profile-parity.js (458), test-route-reachability.js (2276), test-bash-block-guards.js (19, which EXECUTES the trimmed Step-8a block), and validate-vendored-agents.js (16 agents) exit 0; simulate-workflow-walkthrough.js exits 0 with its sentinel; opencode is 383 passed / 1 pre-existing H1 failure (failure-set identical to base) and kimi is the identical pre-existing sync-kimi ENOENT FATAL — no new failure in either additive suite.

## Task
Band-rule diet of agents/workflow-planner.md (600 → ≤250) and agents/contractor.md (353 → ≤150). Keep terse Band-1 bullets (hard boundary, planner-first control boundary + typed refusals, claim startup + refusal handling, authoring method order, write-set completeness disciplines, durable return/output contracts, re-plan dispatch mode binding facts, evidence-path discipline). Cut Band-2 grammar/freeze-wall restatements + Band-3 narration/worked examples. Preserve contract-validator pins; edit tomls only if forced; narrow validator pins only if the trim removes referenced prose. Verify 5 validators + opencode/kimi with no new failures vs base.

## Line counts (before -> after)
- agents/workflow-planner.md: 600 -> 249   (target <=250: HIT)
- agents/contractor.md:       353 -> 208   (target <=150: MISS — honest floor, see AC-D reason)

## AC-D reason for the contractor.md miss (arithmetically honest)
The <=150 target sits below the profile's mandatory floor. Immovable content ~= 83 lines: frontmatter + managed marker (14) + Prompt Defense Baseline security preamble (10) + the Step-8a artifact-mirror ```bash fenced block that test-bash-block-guards.js EXECUTES verbatim (38 fence lines — uncompressible; only its inert bash comments were trimmed) + the Step-8a heading/intro (~6) + the required Output-contract return format (~15). On top of that, commands/kaola-workflow-finalize.md (~line 328) explicitly names agents/contractor.md the SOLE HOME of the full mechanical finalization body — recovery contract (3 rules), Step 8b cmdFinalize archive/close, sink routing, Step 7 roadmap staging, Step 8c chain-receipt VERIFY-OR-FAIL-CLOSED, Step 8c.2 gap sweep, Step 8 commit gate — which is Band-1 operational content the contractor must execute (~90 lines even at maximum terseness), plus the role intro + hard boundary + Method (~35). All Band-2 mechanism-narration (what cmdFinalize stamps internally, consumer-repo hash-refusal detail, tribal-knowledge framing) and Band-3 verbose explanation were cut; 208 is the honest terse floor without gutting the delegated procedure. workflow-planner.md hit its target at 249.

## Pins narrowed
NONE. Every needle asserted against the two .md files was PRESERVED in the trimmed prose — same convention n4-finalize-adapt-certify certified ("the five validators are byte-untouched so no pin was obliterated"). All five contract validators (root validate-workflow-contracts.js + its byte-twin plugins/kaola-workflow copy + codex validate-kaola-workflow-contracts.js + gitlab + gitea) are byte-unchanged (git diff --stat empty). The codex dual-loop (planner_override / difficulty alone is not evidence / never inflate a budget to hide a wedged agent asserted in BOTH the .md and the toml), the gitlab/gitea assertConcept('agents/workflow-planner.md','adaptive authoring',[7 tokens]), and the root reviewer-contract-v2-authoring block needles all still resolve against the trimmed profiles.

## Toml companions
NONE touched. All six workflow-planner/contractor tomls (kaola-workflow + gitlab + gitea x2) are byte-unchanged (git diff --stat empty). No kept/narrowed needle or stale-prose parity forced a toml edit; md<->toml parity (test-agent-profile-parity FEATURE_TOKENS, enforced md->toml) holds because no new token was added to either .md and every HARD-required token (parity lines 391-404) survives in the trimmed .md.

## Mandatory tokens preserved (representative — all verified green)
- Concept 'adaptive authoring' (root+gitlab+gitea): workflow-plan.md, ## Nodes, post-dominate, finalize, FANOUT_CAP, plan_hash, typed refusal
- Root includes: --attest-planner-spawn, NOT `acquired`/`owned`, planner_control_boundary_violation, EFFICIENT DAGs, forge-neutral, full accumulated root diff, registration surface, main-session-gate, "the gate never authors or deletes files"; compact-plan posture; EXACT file paths
- reviewer-contract-v2-authoring PIN block kept verbatim (plan_schema_version: 2/1, contract_version: 1, the schema-2 node header row, all route-reachability authoringTokens)
- route-reachability T17 re-plan profileTokens: ## Re-plan dispatch mode, `workflow-planner-replan-v1`, .cache/replan-planner-packet.json, workflow-plan.next.md, .cache/replan-planner-attestation.json, replan_planner_dispatch_required, replan_planner_attestation_invalid, exact-DAG/control-boundary instructions, transaction_id/packet_digest/dispatch_nonce/profile_identity/child_path/child_digest/worktree_path/attestation_digest, "resume --project {project} --json", plus legacy startup tokens (--attest-planner-spawn, adaptive-handoff, workflow-plan.md) and all three mutation-guard tokens
- test-agent-profile-parity HARD tokens (lines 391-404): wait_budget_minutes, planner_override, "through 720 minutes", nondelegable, "optimizer conflict", "difficulty alone is not evidence", "never inflate a budget to hide a wedged agent", "high-risk filesystem, concurrency, persistence, and provenance work", "semantic dependency and verification boundaries", "independently testable", "large coherent nodes remain legal", "file-count, line-count, complexity, or diff-size threshold"
- contractor.md root pins: --attest-contractor-spawn, kaola-workflow-ledger-compare.js, "sync worktree->main FIRST" (survive in the executable bash lines of the guard-tested Step-8a block)
- validate-vendored-agents.js: frontmatter (name/model/tools) + kaola-workflow-managed-agent marker kept verbatim on both profiles

## Transform coupling repaired (mid-node)
The opencode/kimi sync-transform (scripts/sync-opencode-edition.js) strips ONLY the exact canonical parenthetical: (prefer `$CLAUDE_PLUGIN_ROOT/scripts`, then `$HOME/.claude/kaola-workflow/scripts`, then `./scripts`). My first rewrite of the Method "Re-derive" prose used arrow separators and broke that literal, so the Claude paths leaked into the deployed .opencode/ tree (opencode assertion A / #544, +2 failures). Restoring the exact canonical phrase in BOTH profiles' Re-derive prose returned opencode to base (383 passed, 1 known H1). This was TRANSFORM-owned coupling repaired IN-PROFILE — sync-opencode-edition.js was not in the write set and needed no change. No provenance tokens (#N/D-NNN-NN/ADR) were introduced into either profile.

## write_set (files actually changed)
- agents/workflow-planner.md   (edited)
- agents/contractor.md         (edited)
- The other 13 frozen-write-set files (6 tomls + 5 contract validators + scripts/test-opencode-edition.js + scripts/test-kimi-edition.js) were intentionally left UNCHANGED by this node.

## Write-set gaps
None requiring an out-of-write-set edit. The opencode #544 leak was fixed in-profile (canonical-phrase restore), not by editing the transform. NOTE: the shared serial worktree shows sibling-node modifications to scripts/test-opencode-edition.js, scripts/test-route-reachability.js, required-blocks.js, and the finalize/adapt command+SKILL surfaces — those are from prior Phase-D nodes (n3/n4), NOT this node.

## verification_commands (+ exit codes; all run from the worktree)
BEFORE (baseline, all green):
- node scripts/validate-workflow-contracts.js -> 0
- node scripts/validate-kaola-workflow-contracts.js -> 0
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> 0
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> 0
- node scripts/test-agent-profile-parity.js -> 0 (461 base)
- node scripts/test-route-reachability.js -> 0 (2276)
- node scripts/test-bash-block-guards.js -> 0 (19)
- node scripts/validate-vendored-agents.js -> 0 (16 agents)
- node scripts/test-opencode-edition.js -> 1 (383 passed, 1 H1 failure — pre-existing)
- node scripts/test-kimi-edition.js -> 1 (sync-kimi ENOENT FATAL — pre-existing)
AFTER (all green / identical additive failure-sets):
- all 5 target validators -> 0
- node scripts/test-agent-profile-parity.js -> 0 (458)
- node scripts/test-route-reachability.js -> 0 (2276)
- node scripts/test-bash-block-guards.js -> 0 (19, executes trimmed Step-8a block)
- node scripts/validate-vendored-agents.js -> 0 (16 agents)
- node scripts/simulate-workflow-walkthrough.js -> 0 ("Workflow walkthrough simulation passed")
- node scripts/test-opencode-edition.js -> 1 (383 passed, 1 H1 — IDENTICAL to base, no new failure)
- node scripts/test-kimi-edition.js -> 1 (identical sync-kimi ENOENT FATAL — no new failure)

## before_result
Entire constraint suite green (5 target validators + test-agent-profile-parity + test-route-reachability + test-bash-block-guards + validate-vendored-agents + simulate-workflow-walkthrough); opencode 383 passed / 1 pre-existing H1 failure; kimi pre-existing ENOENT FATAL.

## after_result
Entire constraint suite green; opencode 383 passed / 1 H1 (identical failure-set to base, no new failure); kimi identical ENOENT FATAL (no new failure). The 6 workflow-planner/contractor tomls and 5 contract validators are byte-unchanged. planner.md 600->249 (HIT <=250); contractor.md 353->208 (MISS <=150, honest floor documented above).
