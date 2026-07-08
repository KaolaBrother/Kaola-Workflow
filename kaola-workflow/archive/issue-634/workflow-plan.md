# Adaptive Workflow Plan — issue-634

<!-- plan_hash: 59bf4cc5466ba9849b4af4ddd6f86cbbac7a7a72e03078edb1f5a95e334d8ecf -->

feat(adaptive): optimize-shaped node — a bounded metric-ratchet loop via a new
`metric-optimizer` role, serving direction-not-destination work ("make it faster / smaller /
less flaky") that no task-shaped node can express honestly. The issue body carries a COMPLETE,
settled D1–D7 design; this plan delivers the 9 acceptance-criteria checkboxes.

## Meta

labels: —
speculative_open_policy: off
validation_command: node scripts/simulate-workflow-walkthrough.js

## Plan Notes

**Case A (build run).** The shape is knowable and the answer is settled — this is NOT an
investigation/shaping run. Issue #634's D1–D7 is the authoritative design; the nodes below
IMPLEMENT it. Do NOT re-derive the design. Line numbers cited in the issue may have drifted —
`n1-plan` re-verifies them against current source and emits the exact edit map the write nodes
follow verbatim.

### Why a mostly-serial spine (faithful decomposition, not under-parallelization)

This is a tightly-coupled cross-edition change: ONE contract design (the `optimize(<id>)` Meta
block, the `metric: <number>` output contract, the `ROLE_TOKEN_REGISTRY` evidence tokens, OPT-1..6)
is referenced by the validator (parse+validate), the schema (caps), the dispatch aggregators
(thread onto the card), the agent profile (ratchet protocol), the routing surfaces, and the tests.
The dominant risk is **divergence** of that single contract across surfaces — a precedence-#1
accuracy failure. The engine (contract source) is therefore ONE node; registration and routing
read its committed tokens and mirror them, so they are serialized AFTER it rather than authored in
parallel from the spec (which would let independent heads diverge on field/token spelling). The
only genuinely-independent, zero-conflict antichain is the read-only/docs tail (`n6-adversary`
[read-only] ∥ `n7-docs` [docs-only]), which is co-opened. Serial here is the correct reading of
genuine coupling, matching the proven large-cross-edition pattern — not a missed parallelism.

### Cross-edition surface map (declare-completeness reference)

**GENERATED_AGGREGATORS** (edit canonical, then `npm run sync:editions` regenerates the codex twin
+ the two renamed forge ports; each base's 4 editions MUST co-occur in ONE node —
`generated_port_split`): `kaola-workflow-plan-validator.js`, `kaola-workflow-next-action.js`,
`kaola-workflow-adaptive-node.js`, `kaola-workflow-commit-node.js`. Forge ports are named
`kaola-{gitlab,gitea}-workflow-<base>.js`.

**BYTE-IDENTICAL GROUPS** (all 4 copies co-occur in ONE node — #274/#301): `adaptive-schema.js`
(the `OPTIMIZE_ITER_CAP`/`OPTIMIZE_WALLCLOCK_CAP`/defaults live here), `resolve-agent-model.js`
(the `metric-optimizer` model-default row). `npm run sync:editions --write` also byte-copies these.

**22-path agent-registration surface** (validator refuses the freeze if the plan adds
`agents/metric-optimizer.md` but the UNION omits any of these — `agentRegistrationSurface`,
`plan-validator.js:627-665,1747-1749`): `agents/metric-optimizer.md`; the 3 plugin
`agents/metric-optimizer.toml`; the 3 plugin `config/agents.toml` (the `[agents.metric-optimizer]`
codex-dispatch table); `scripts/validate-vendored-agents.js` (`localAgents`); `install.sh`
(REQUIRED_AGENTS + the `sonnet` model case-list); `uninstall.sh` (REQUIRED_AGENTS); the 4
`resolve-agent-model.js` copies; the 4 `plan-validator.js` editions; the 2 forge
`validate-kaola-workflow-{gitlab,gitea}-contracts.js`; the 2 forge
`test-{gitlab,gitea}-workflow-scripts.js`. Split in this plan: the resolve-agent-model ×4 and
plan-validator ×4 (paths 11–18) ride the engine node `n2` (they are the byte/generated groups it
already owns); the remaining 14 ride `n3`.

**#307 four-chain proof.** This is a cross-edition diff, so all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (run sequentially —
`npm test` short-circuits on the first `&&` failure) BEFORE finalize. `n4-routing` (last write
node) records the full four-chain green as its `regression-green` evidence; `n6-adversary`
re-runs them independently; the finalize gate carries the receipt. The codex chain runs the codex
walkthrough + `validate-kaola-workflow-contracts.js`; the forge chains run `edition-sync --check` +
the forge walkthroughs (incl. the `*-codex-*` walkthroughs) + `generate-routing-surfaces --check`.

### n2-engine — the contract engine (canonical spec; implement D1/D2/D3/D5/D7 EXACTLY)

- **D1 role sets** (`plan-validator.js`): add `metric-optimizer` to `CANONICAL_ROLES` (:151),
  `WRITE_ROLES` (:168), `IMPLEMENT_ROLES` (:169). NOT in `GATE_VERDICT_ROLES` (it is a producer,
  not a gate). `IMPLEMENT_ROLES` membership makes an optimize node `producesCode` ⇒ G1
  (code-reviewer) and G3 (main-session-gate) post-dominance are inherited with NO gate-plumbing
  change — prove this with an in-grammar EXAMPLE plan inside the walkthrough (AC1).
- **D6 evidence contract**: add the `ROLE_TOKEN_REGISTRY` row (:191-199) EXACTLY
  `'metric-optimizer': ['evidence-binding', 'metric_baseline', 'metric_final', 'iterations_used', 'regression-green']`
  — this single object feeds BOTH the evidence-shape gate and the open-time seed (adaptive-node
  imports it), so it must be authored once here.
- **D2 optimize contract**: parse a `## Meta` `optimize(<id>)` block keyed by node id (refuse if
  the keyed node is absent or not `metric-optimizer`). Fields: `metric_command`, `metric_paths`,
  `direction ∈ {min,max}`, `budget_iterations`, optional `budget_wallclock_minutes`,
  `regression_gate`, `metric_repeats` (default 1), `min_delta` (default 0), `patience`. The metric
  output contract: `metric_command` MUST print `metric: <number>` at column 0; last-match-wins
  (mirror `parseNodeVerdict` discipline). `computePlanHash` already hashes the Meta body, so the
  contract is `plan_hash`-covered (AC2 mutation ⇒ resume refusal — add a case).
- **D3 freeze rules (all fail-closed, each with an ACCEPT case + a typed-REFUSE case in the
  walkthrough — AC2)**: OPT-1 (1:1 metric-optimizer↔optimize block); OPT-2 (`metric_paths`
  non-empty AND disjoint from the node's `declared_write_set` — evaluation isolation, AC3);
  OPT-3 (`1 ≤ budget_iterations ≤ OPTIMIZE_ITER_CAP`=50, `budget_wallclock_minutes ≤
  OPTIMIZE_WALLCLOCK_CAP`=120 — new `adaptive-schema.js` constants); OPT-4 (`direction ∈ {min,max}`,
  `metric_repeats ≥ 1`, `min_delta ≥ 0`); OPT-5 (a **change-gate `adversarial-verifier` must
  post-dominate every optimize node** — reuse `gateUncovered` exactly as G1/G2 do; AC4, refuse when
  absent); OPT-6 (`regression_gate` resolves non-empty — explicit or inherited from Meta
  `validation_command`; refuse when neither).
- **dispatch envelope**: thread the parsed contract onto the dispatch card in `next-action`
  /`buildDispatch` (aggregators); `budget_wallclock_minutes` overrides the card's
  `wait_budget_minutes` (applied by the existing orchestrator wait-budget ladder — no daemon, no
  scheduler change).
- **resolve-agent-model**: add `'metric-optimizer': 'sonnet'` to `DEFAULT_AGENT_MODELS` (standard
  tier per D1; a plan may raise per node).
- **D5 barrier tests (AC5)**: a node performing ≥3 intermediate commit/revert cycles inside a leg
  passes `--leg-barrier` + the commit-based `--group-barrier` + the per-node net-diff barrier with
  an UNCHANGED declared write set (the net diff is commit-count-indifferent — snapshot→snapshot).
  No barrier machinery changes; this is a characterization/regression test.
- **D7 verifier reproduction test (AC4)**: an optimize plan whose `adversarial-verifier` posts
  `verdict: fail` blocks finalize via the existing `--verdict-check` (change-gate position makes it
  non-exempt — `advVerifierIsChangeGate`).
- **tdd-guide discipline**: write the OPT-1..6 refuse cases (expect the typed refusal) RED-first,
  then implement each rule GREEN. After the 6 canonical edits, run `npm run sync:editions` to
  regenerate the 18 forge/codex script copies, then confirm `npm run test:kaola-workflow:claude`
  green. The dedicated unit tests (`test-agent-model-resolver.js`, `test-next-action.js`,
  `test-commit-node.js`, `test-adaptive-node.js`) are declared as the barrier upper bound; add
  focused cases for the model row + dispatch-card threading where they exercise new behavior.

### n3-register — role registration, agent profile, cross-edition count/parity surfaces (D4/D6)

- **agent profile (the ratchet protocol — the agent-facing `program.md` analogue, D4)**: author
  `agents/metric-optimizer.md` + the 3 byte-mirror `.toml` editions carrying: (1) run
  `metric_command` `metric_repeats`× (median) → record `metric_baseline`; (2) per iteration propose
  ONE change strictly inside `declared_write_set` → apply → run `regression_gate`; red ⇒ revert; (3)
  accept iff improved by ≥`min_delta` in `direction`, then `git add <write-set> && git commit`
  (`kw-opt(<node-id>) iter <k>: <old> -> <new>`); (4) **revert is SCOPED**
  (`git restore --source=HEAD -- <write-set paths>`) — `git reset --hard` is FORBIDDEN (it would
  destroy uncommitted workflow artifacts in a shared worktree); (5) stop at `budget_iterations` /
  `patience` consecutive rejects / wallclock — whichever first; record EVERY iteration (accepted AND
  rejected, with metric values); (6) never ask inside the loop, never widen scope — anything needing
  judgment ⇒ stop and route via the existing `write-halt` valve. Evidence body carries one
  `iter <k>: <metric> <accepted|rejected> <summary>` line per iteration + the D6 tokens. Mirror the
  ROLE_TOKEN_REGISTRY tokens n2 committed VERBATIM. Keep plugin `.toml` prose FORGE-NEUTRAL (no
  `gh`/`glab`, no forge brand). **No provenance refs in any agent-facing surface (AC6/AC7)** — no
  `#NNN`, `D-NNN-NN`, `[INV-NN]`.
- **registration bookkeeping**: `validate-vendored-agents.js` (`localAgents`); `install.sh`
  (REQUIRED_AGENTS + the `sonnet` `default_agent_model` case-list, :367); `uninstall.sh`
  (REQUIRED_AGENTS — parity-guarded against install.sh); the 3 `config/agents.toml`
  `[agents.metric-optimizer]` codex-dispatch tables.
- **cross-edition count/parity surfaces** (declared as the barrier upper bound — adding an agent
  bumps codex TOML-entry counts + md↔toml parity): the 2 forge `validate-*-contracts.js`, the 2
  forge `test-*-workflow-scripts.js`, the codex + forge + forge-codex walkthroughs, the codex
  `validate-kaola-workflow-contracts.js`, `test-agent-profile-parity.js`.

### n4-routing — dispatch prose (byte-generated) + the plan-run card (#627 lean budget)

Per #627 the six plan-run surfaces stay lean: the six surfaces get only a MINIMAL dispatch note;
the ratchet DETAIL lives in the role profile (n3) + a NEW `docs/plan-run-cards/metric-optimizer.md`
card. The six plan-run surfaces are BYTE-GENERATED from `templates/routing/plan-run.skeleton.md`
(+`slots.js`) via `scripts/generate-routing-surfaces.js` (`--check` is wired into all four chains),
so edit the SKELETON + slots and run `generate-routing-surfaces.js --write` to reproduce the six
surfaces — do NOT hand-edit them (a divergence reds `--check`). If the note warrants a route pin,
add it to `test-route-reachability.js` / `required-blocks.js` (declared), NOT a per-surface hack.
The `.opencode` plan-run command is declared defensively in case the generator reproduces it (it is
additive, D-530-02 (existing) — no independent #307 obligation). This node records the full four-chain green.

### non_tdd_reason (implementer nodes)

- **n3-register**: registration bookkeeping + agent-profile/prose propagation across editions. There
  is no natural failing UNIT test for a role profile or a REQUIRED_AGENTS/localAgents/count entry;
  correctness is machine-enforced by the 22-path `agentRegistrationSurface` refusal + the forge
  contract-validator counts + md↔toml parity + the four chains (verified in-node and re-checked by
  n5/n6), not a per-node RED assertion. Mirroring the committed evidence tokens verbatim is wiring.
- **n4-routing**: routing-prose propagation is byte-GENERATED from one skeleton; correctness is the
  `generate-routing-surfaces --check` byte-reproduction + route-reachability parity exercised by the
  four chains, not a per-node failing assertion. The card is documentation.

### Decision record

`D-634-01` is the next free id (no `D-634-*` records exist). doc-updater writes it.

### Reviewer dispatch policy (session-standing)

`n5-review` (code-reviewer) and `n6-adversary` (adversarial-verifier) carry model `—`; the
orchestrator dispatches every reviewer-shaped role at model=fable regardless of the role default,
per session policy. `n6-adversary` is a CHANGE-gate (a code producer forward-reaches it and it
reaches the sink → `advVerifierIsChangeGate` true → non-exempt from `--verdict-check`): it re-runs
the OPT walkthrough cases, confirms the four chains reproduce green, and spot-checks that the
metric-output/evidence/OPT contract is consistent across the validator, profile, and card.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-plan | planner | — | — | 1 | sequence | reasoning |
| n2-engine | tdd-guide | n1-plan | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js, scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, scripts/simulate-workflow-walkthrough.js, scripts/test-agent-model-resolver.js, scripts/test-next-action.js, scripts/test-commit-node.js, scripts/test-adaptive-node.js | 29 | sequence | reasoning |
| n3-register | implementer | n2-engine | agents/metric-optimizer.md, plugins/kaola-workflow/agents/metric-optimizer.toml, plugins/kaola-workflow-gitlab/agents/metric-optimizer.toml, plugins/kaola-workflow-gitea/agents/metric-optimizer.toml, plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, scripts/validate-vendored-agents.js, install.sh, uninstall.sh, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, scripts/validate-kaola-workflow-contracts.js, scripts/test-agent-profile-parity.js | 21 | sequence | standard |
| n4-routing | implementer | n3-register | templates/routing/plan-run.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/plan-run-cards/metric-optimizer.md, scripts/test-route-reachability.js, .opencode/command/kaola-workflow-plan-run.md | 12 | sequence | standard |
| n5-review | code-reviewer | n4-routing | — | 1 | sequence | — |
| n6-adversary | adversarial-verifier | n5-review | — | 1 | sequence | — |
| n7-docs | doc-updater | n5-review | CHANGELOG.md, docs/decisions/D-634-01.md, docs/api.md, docs/architecture.md | 4 | sequence | standard |
| n8-finalize | finalize | n6-adversary, n7-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-plan | complete |
| n2-engine | complete |
| n3-register | complete |
| n4-routing | complete |
| n5-review | complete |
| n6-adversary | complete |
| n7-docs | complete |
| n8-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (n1-plan) | subagent-invoked | edit-map for n1-plan | |
| tdd-guide (n2-engine) | subagent-invoked | evidence-binding: n2-engine a54feaea3bbf | |
| implementer (n3-register) | subagent-invoked | evidence-binding: n3-register 0e67934ae3db | |
| implementer (n4-routing) | subagent-invoked | evidence-binding: n4-routing 2efad3532a73 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 14e1976670b6 | |
| adversarial-verifier (n6-adversary) | subagent-invoked | evidence-binding: n6-adversary de0655416c81 | |
| doc-updater (n7-docs) | subagent-invoked | evidence-binding: n7-docs 283ca305ae26 | |
