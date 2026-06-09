# Workflow Plan — issue #328

<!-- plan_hash: 55ebc390080c8922efb4ba23ca1c53b8cda5d1a350dc0b11d798ce7c285b0ad6 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases, area:workflow-router

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| recon | code-explorer | — | — | 1 | sequence |
| design | code-architect | recon | — | 1 | sequence |
| state-foundation | tdd-guide | design | scripts/kaola-workflow-active-folders.js, plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js, scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, scripts/test-bundle-state.js | 1 | sequence |
| claim-startup | tdd-guide | state-foundation | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/test-bundle-claim.js | 1 | sequence |
| finalization | tdd-guide | claim-startup | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js, scripts/test-bundle-finalize.js | 1 | sequence |
| resume-display | tdd-guide | finalization | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 1 | sequence |
| scout-role | implementer | resume-display | agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml | 1 | sequence |
| scout-registration | implementer | scout-role | install.sh, scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js | 1 | sequence |
| validator-roles | implementer | scout-registration | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence |
| forge-claim-ports | implementer | validator-roles | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js | 1 | sequence |
| forge-final-ports | implementer | forge-claim-ports | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 1 | sequence |
| routing-core | implementer | forge-final-ports | commands/workflow-next.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence |
| routing-forge | implementer | routing-core | plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1 | sequence |
| contracts-registration | implementer | routing-forge | scripts/validate-vendored-agents.js, package.json, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |
| scout-forge-fix | implementer | contracts-registration | plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml | 1 | sequence |
| regression-tests | tdd-guide | scout-forge-fix | scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| code-review | code-reviewer | regression-tests | — | 1 | sequence |
| adversarial-verify | adversarial-verifier | code-review | — | 1 | sequence |
| docs | doc-updater | adversarial-verify | README.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| recon | complete |
| design | complete |
| state-foundation | complete |
| claim-startup | complete |
| finalization | complete |
| resume-display | complete |
| scout-role | complete |
| scout-registration | complete |
| validator-roles | complete |
| forge-claim-ports | complete |
| forge-final-ports | complete |
| routing-core | complete |
| routing-forge | complete |
| contracts-registration | complete |
| regression-tests | complete |
| code-review | complete |
| adversarial-verify | complete |
| docs | complete |
| finalize | complete |
| scout-forge-fix | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (recon) | subagent-invoked | # recon (code-explorer) — issue #328 multi-issue bundle lane | |

| code-architect (design) | subagent-invoked | # design (code-architect) — issue #328 same-scope multi-issue bundle lane | |
| tdd-guide (state-foundation) | subagent-invoked | # state-foundation evidence — issue #328 | |
| tdd-guide (claim-startup) | subagent-invoked | # claim-startup node evidence — issue #328 | |
| tdd-guide (finalization) | subagent-invoked | # finalization evidence — issue #328 | |
| tdd-guide (resume-display) | subagent-invoked | # resume-display (tdd-guide) — issue #328 bundle lane | |
| implementer (scout-role) | subagent-invoked | # scout-role node evidence — issue #328 | |
| implementer (scout-registration) | subagent-invoked | # scout-registration evidence — issue #328 | |
| implementer (validator-roles) | subagent-invoked | # validator-roles (implementer) — issue #328 | |
| implementer (forge-claim-ports) | subagent-invoked | # Node Evidence: forge-claim-ports | |
| implementer (forge-final-ports) | subagent-invoked | # forge-final-ports evidence — issue #328 | |
| implementer (routing-core) | subagent-invoked | # routing-core evidence — issue #328 bundle-lane routing | |
| implementer (routing-forge) | subagent-invoked | # routing-forge evidence — issue #328 bundle-lane routing (forge ports) | |
| implementer (contracts-registration) | subagent-invoked | # contracts-registration evidence — issue #328 | |
| implementer (scout-forge-fix) | subagent-invoked | # scout-forge-fix — implementer evidence | |
| tdd-guide (regression-tests) | subagent-invoked | # regression-tests node — evidence | |
| code-reviewer | subagent-invoked | verdict: fail | |
| adversarial-verifier (adversarial-verify) | subagent-invoked | verdict: fail | |
| doc-updater (docs) | subagent-invoked | # docs node evidence — issue #328 bundle lane | |
| finalize (finalize) | subagent-invoked | finalize node (DAG sink) bookkeeping — issue #328 multi-issue bundle lane | |
| implementer (forge-claim-ports) | subagent-invoked | # Node Evidence: forge-claim-ports (REOPENED — CR1: bundle finalization parity r | |
| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (adversarial-verify) | subagent-invoked | verdict: pass | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of issue #328: an additive same-scope multi-issue **bundle** lane for
the adaptive path. The BUILD DAG is sequential by design — this run executes through the INSTALLED
one-frontier-unit-at-a-time executor, and the feature touches `claim.js`, finalization, and
plan-run (the very machinery executing this run), so editing repo `scripts/` must not break the
running loop. A linear write chain has NO antichains, so the validator's disjointness checks
(exact-file RED, coarse-area RED on `plugins`, shared-infra ASK on `scripts`) are skipped for every
pair: this is the only safe shape when every concern fans across four editions whose gitlab/gitea
ports all collapse to coarse-area `plugins`. Write-role `fanout(...)` would buy ZERO build-time
concurrency (a script can't dispatch; a subagent can't dispatch a subagent) and would trip
blast-radius governance. The FEATURE supports bundles; the BUILD of it does not bundle.

### THE LOAD-BEARING CONSTRAINT (single-issue behavior must stay unchanged — AC#1)

The feature is purely ADDITIVE. `--target-issue N` / `KAOLA_TARGET_ISSUE` keep current one-issue
behavior; `--target-issues A,B,C` / `KAOLA_TARGET_ISSUES` are the ONLY multi-issue startup path;
both-set => `target_ambiguity` refusal. `workflow-state.md` keeps `issue_number` as the primary
issue and ADDS `issue_numbers`/`bundle_id`/`closure_policy` only on bundle projects. Scripts
VALIDATE exact targets; they never select or substitute issues (the #44 agent-owns-reasoning rule).

### issue-scout is a DELIVERABLE role, not a node role in THIS plan

The new read-only `issue-scout` agent is BUILT by this run but is NOT yet in the validator's
`CANONICAL_ROLES`, so a node with `role: issue-scout` would (correctly) be refused. The `recon`
node uses `code-explorer` (existing canonical, read-only) to survey the backlog + cross-edition
surface; `issue-scout` itself is authored as a profile + registered in `scout-role` /
`scout-registration` / `validator-roles`. Auto-bundle selection (AC#5/AC#6) is an
orchestrator/agent capability surfaced by the role profile + routing docs; the main session states
the bundle before claim, scripts validate only.

### Per-node write-set rationale (FILE_CEILING = 6, four-edition parity, byte-locks)

`validate-script-sync.js` COMMON_SCRIPTS byte-locks the root↔claude-plugin pair for claim,
active-folders, classifier, roadmap, plan-validator, adaptive-node, next-action, commit-node; and
BYTE_IDENTICAL_GROUPS locks `resolve-agent-model.js` across ALL FOUR trees. Every byte-locked pair
therefore moves together in ONE node.

- `state-foundation` (tdd-guide): Phase-1 additive `issue_numbers` parsing + active-folder overlap
  (a live bundle `[42,47,53]` blocks a direct claim of #47 and any overlapping bundle, while old
  single-issue folders still parse — AC#4). `active-folders.js` + `classifier.js` byte pairs, plus
  `scripts/test-bundle-state.js` (new behavioral unit). Behavioral with a natural failing test.
- `claim-startup` (tdd-guide): Phase-2 `--target-issues` all-or-nothing multi-claim, bundle
  project/branch naming (`bundle-42-47-53`), the nine typed refusals (target_set_empty …
  target_set_label_rollback_failed) + `target_ambiguity`, rollback of labels/locks/worktree on
  partial failure (AC#2/AC#3/AC#7). `claim.js` byte pair + `scripts/test-bundle-claim.js`.
- `finalization` (tdd-guide): Phase-5 all-or-nothing closure — close every issue in
  `issue_numbers`, remove every `.roadmap/issue-N.md`, regenerate ROADMAP once, archive one bundle
  folder, extend the closure receipt (`closed_issues`/`failed_issue_closures`/removed sources),
  warning-first on a single remote-close failure (AC#11/AC#12/AC#13). `claim.js` byte pair (ordered
  AFTER claim-startup → same file, no antichain, edits accumulate under the per-node barrier) +
  `roadmap.js` byte pair + `scripts/test-bundle-finalize.js`.
- `resume-display` (tdd-guide): bundle id / primary / issue set / closure policy / next frontier in
  the adaptive resume/compact output (AC#I). `adaptive-node.js` byte pair + `test-adaptive-node.js`
  additions. Task mirrors stay NODE-based (no issue-based task state as a correctness source).
- `scout-role` (implementer, `non_tdd_reason`: durable agent PROFILE prose — root `agents/issue-scout.md`
  + the three plugin `.toml` copies; no behavioral unit under test, profiles are declarative).
- `scout-registration` (implementer, `non_tdd_reason`: wiring/registration — `install.sh`
  REQUIRED_AGENTS array + case-list gains `issue-scout`; `resolve-agent-model.js` DEFAULT_AGENT_MODELS
  gains `issue-scout: sonnet` in all FOUR byte-identical copies; no behavioral unit).
- `validator-roles` (implementer, `non_tdd_reason`: closed-library extension — add `issue-scout` to
  CANONICAL_ROLES in the root↔claude byte pair plus the two forge edition-named plan-validator ports;
  declarative list edit, the existing validator tests cover the parse).
- `forge-claim-ports` / `forge-final-ports` (implementer, `non_tdd_reason`: behavior-preserving
  renamed ports — `kaola-gitlab-workflow-*` / `kaola-gitea-workflow-*` mirror the root behavioral
  logic verbatim modulo forge nouns; coverage is the root tdd-guide tests + forge test scripts).
  Split into two nodes for FILE_CEILING (6 claim-area + 4 final-area ports). MIRROR the root
  behavioral nodes' logic verbatim modulo forge nouns — do NOT re-derive the logic independently
  (the #254 router-rewrite parity defect): the canonical spec is the matching root script.
- `routing-core` / `routing-forge` (implementer, `non_tdd_reason`: command/skill PROSE routing —
  document the explicit-bundle (`--target-issues` / natural-language "issues #A #B together") and
  auto-bundle (`issue-scout`) entries; compatibility rule that `--target-issue` is unchanged). 8
  routing files split 4+4 for FILE_CEILING. Keep the bundle-routing prose semantically identical
  across editions (shared canonical spec = the root `commands/workflow-next.md` section).
- `contracts-registration` (implementer, `non_tdd_reason`: presence/count assertions + test-runner
  wiring — `validate-script-sync.js` (any new COMMON_SCRIPTS / byte groups for the new test files),
  `package.json` test runner gains the three new `test-bundle-*.js`, the gitlab/gitea contract
  validators bump the agent-profile count 13→14 (lines ~142/143), and the two forge
  `test-{gitlab,gitea}-workflow-scripts.js` bump their installed-agent-count 13→14 (~line 2039).
  NOTE: the ROOT `validate-workflow-contracts.js` / `validate-kaola-workflow-contracts.js` do NOT
  assert a literal agent count today (grep confirmed) — do NOT add a spurious bump there.

### Cross-edition completeness (the #306/#254/#291 trap the green self-check will NOT catch)

The self-check validates grammar/gates/ceiling/disjointness — never write-set COMPLETENESS or
semantic parity. Before each node freezes its work, grep the changed symbol (`target-issues`,
`issue_numbers`, `bundle_id`, `issue-scout`, the count literal) across `scripts/` + every
`plugins/*/scripts/` + commands/skills and confirm every referencing edition file is in some node's
write set. The gitlab/gitea ports are edition-NAMED (`kaola-gitlab-workflow-*` /
`kaola-gitea-workflow-*`) and are NOT found by base-filename `find`. A missed PRODUCTION file
(contract validator, test script) makes the Phase-6 barrier refuse, not the self-check.

### Gates and verification reality

`code-review` (code-reviewer) post-dominates EVERY code-producing node (a linear chain makes this
trivially satisfied — it sits downstream of regression-tests, upstream of finalize), enforcing AC#1
single-issue regression safety. `adversarial-verify` (adversarial-verifier, read-only, empty write
set) re-tests the finished bundle claim/finalize behavior and feeds the sink. `docs` (doc-updater,
docs-only so it does not trip G1) updates README (bundle lane + env vars), docs/api.md (the
`--target-issues` contract + closure-receipt schema + `issue-bundle.json` schema), docs/architecture.md
(the bundle execution shape), docs/workflow-state-contract.md (additive bundle fields), and
docs/conventions.md (cross-edition bundle test requirement). CHANGELOG.md lives ONLY on the
`finalize` sink (no double-write). No `knowledge-lookup` — the feature is purely internal (no
external library/API). G2/security-reviewer is not planned: the union labels (enhancement +
area:scripts/workflow-phases/workflow-router) are not security-sensitive; the self-check governs.
"Verified" = `node scripts/simulate-workflow-walkthrough.js` exits 0 + all FOUR
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (run sequentially — a green
claude chain alone is insufficient evidence per the cross-edition policy) + the new `test-bundle-*.js`
units. Sink: merge (run posture worktree; the issue does not request a PR).
