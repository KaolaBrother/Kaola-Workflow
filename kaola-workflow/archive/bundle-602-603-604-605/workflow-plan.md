# Adaptive Workflow Plan — bundle-602-603-604-605

<!-- plan_hash: 9c290595a9aa1a55556e227609bf5859c4ce1ae9999ae0f5101a66d2ab656f66 -->

## Meta
speculative_open_policy: auto

labels: bug, enhancement, area:scripts, area:workflow-phases

validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Same-scope (`area:scripts` / `area:workflow-phases`) bundle of four companion issues from one
Codex-edition dispatch-visibility audit. Primary #602; closure all-or-nothing. The four issues
share their write surfaces almost totally (see Shared-surface map below), so wide fan-out is
impossible — instead the work is split into two exact-path-DISJOINT lanes that the scheduler
co-opens: an **engine lane** (`n1-engine`: all `kaola-workflow-adaptive-node.js` + `kaola-workflow-claim.js`
runtime behavior for #602/#603/#605, plus the walkthrough oracles that test it) and a **contracts
lane** (`n2-contracts`: all agent-facing routing/startup PROSE for #602/#603/#604/#605 plus the
contract-validator + route-reachability needles that enforce it). The two lanes touch DIFFERENT
exact files under `scripts/` and `plugins/*/scripts/`, so they are a `parallel_safe` antichain and
co-open in isolated legs.

## Shared-surface map (why the lanes are cut this way)

- `kaola-workflow-adaptive-node.js` (GENERATED_AGGREGATOR → canonical + codex twin + 2 forge ports,
  all four move atomically): the summary emitter (#602), the three `buildDispatch` call sites reading
  `codex_dispatch_mode` (#603), and the `run-progress.json` mirror write in every ledger-mutating
  subcommand (#605). → **engine lane only.**
- `kaola-workflow-claim.js` (COMMON_SCRIPTS byte-identical claude↔codex + hand-ported gitlab/gitea):
  persist the validated `codex_dispatch_mode` state field (#603). → **engine lane only.**
- The 6 `kaola-workflow-plan-run` routing surfaces (3 Claude commands + 3 Codex SKILLs) — return-shape
  fix + extended drill rule + no-improvise instruction (#602), announcement-contract lines (#604),
  chat-echo close line (#605). The 6 Codex startup SKILLs (`kaola-workflow-next`/`kaola-workflow-adapt`
  × 3 plugin editions) — the `--codex-dispatch-mode` startup step (#603). → **contracts lane only.**
- The contract validators (claude `validate-workflow-contracts.js` + its codex byte-twin, codex-checker
  `validate-kaola-workflow-contracts.js`, gitlab + gitea) and `test-route-reachability.js` — needles for
  the pre-dispatch card-acquisition sentence (#602), the three announcement formats (#604), and the
  codex startup step (#603). → **contracts lane only.**
- `docs/workflow-state-contract.md` (classification: CODE / validation-visible) — the `run-progress.json`
  generated mirror + the `codex_dispatch_mode` field (#603/#605). → **docs node.**
- `CHANGELOG.md` — four `[Unreleased]` entries at the sink.

Engine-lane `scripts/`+`plugins/*/scripts/` files (adaptive-node, claim, walkthroughs,
test-claim-hardening) and contracts-lane `scripts/`+`plugins/*/scripts/` files (validators,
route-reachability) are pairwise distinct → exact-path disjoint → co-open.

## Plan Notes

- **#602 canonical summary format (shared spec for both lanes).** The additive `--summary` segment is
  exactly `opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode> effort=<codex_reasoning_effort|inherit>`,
  one `opened=` segment per opened node (batch open-ready emits one per member; `effort=inherit` when
  null; leg paths are NOT included). Default (no-`--summary`) `--json` output stays BYTE-IDENTICAL.
  The engine lane implements this format; the contracts lane's prose DESCRIBES this same format — both
  cite the issue's canonical string so they converge by construction.
- **#602 engine invariant — byte-identical default `--json`.** The change is additive to the summary
  line ONLY (the `if (summaryMode)` branch at the single output point). n1's walkthrough MUST include
  the byte-compare oracle that default `--json` is unchanged, plus the `/opened=\S+ role=\S+ task=\S+
  mode=\S+ effort=\S+/` match for open-next AND the open-ready batch case.
- **#603 engine threading.** claim `writeState` gains a validated `codex_dispatch_mode` field: only the
  two literals `v2-task-name`/`v1-thread-id` accepted, guarded by the existing `assertNoNewline`
  anti-injection pattern (mirror `worktree_path`), any other/newline value → typed refusal at claim
  with ZERO state mutation. adaptive-node reads the field from the loaded state and threads it into the
  ctx of all THREE `buildDispatch` sites (open-next, close-and-open-next fused advance, open-ready
  batch); resolution precedence UNCHANGED (ctx → env → `v1-thread-id` fail-closed default). Absent
  field / non-codex editions ⇒ cards byte-identical to today. `kaola-workflow-adaptive-schema.js` is
  NOT touched. The invalid/newline-refusal case has walkthrough oracles (and may also add a case to
  `test-claim-hardening.js`, declared in n1).
- **#605 engine mirror — derived, fail-open, non-authoritative.** After a SUCCESSFUL ledger write, every
  ledger-mutating subcommand (open-next, open-ready, close-and-open-next, close-node,
  reconcile-running-set, reopen-node, repair-node, write-halt/clear-halt) writes
  `<main-root>/kaola-workflow/{project}/.cache/run-progress.json`. Main root is resolved via the
  EXISTING `resolveMainRoot(root)` seam (already used by `getMainRoot` in adaptive-node; adaptive-schema
  untouched) — NEVER guessed from cwd. Write failure degrades to a `run_progress_mirror: failed` warn
  field in the op envelope — NEVER a refusal, NEVER a nonzero exit; barrier/close semantics
  byte-unchanged. Never read back by any script (so the filename stays a local const in adaptive-node,
  not a shared schema constant). Root `workflow-plan.md` stays byte-untouched. Walkthrough oracles:
  (a) exists at main root + matches worktree ledger; (b) unwritable `.cache` ⇒ op still exits 0 + warn
  field (fail-open proof); (c) gone after finalize/archive; (d) absent when no worktree linked.
- **#604 announcement contract (contracts lane, prose + needles, no engine change).** Three verbatim
  formats in the Dispatch step of all 6 plan-run surfaces: run-start self-identification, pre-spawn
  `→ dispatching …`, on-return `← …`. Inline-fallback wording aligned with the existing gate-role
  degradation notice (no contradiction). One needle per format line in every edition validator +
  route-reachability, so partial propagation reds the chain.
- **Cross-edition walkthrough hedge.** All SIX walkthroughs are declared in n1 because all six exercise
  the regenerated open-next/close dispatch paths. No walkthrough asserts the summary line by
  exact-equality (verified) and every engine change is additive/back-compat, so the forge walkthroughs
  are expected to stay green WITHOUT edits — but n1 MUST run all six directly (they need only the engine
  changes, not the contracts-lane prose) before closing, so a regenerated-port assertion mismatch
  surfaces inside n1's leg rather than at the n4 four-chain gate.
- **Gating.** The three subtle engine invariants (#602 byte-identical `--json`, #605 fail-open, #603
  zero-mutation refusal) each have a DETERMINISTIC machine oracle in n1's walkthrough, re-run by n4's
  four chains; combined with the opus holistic review this is sufficient — no separate
  adversarial-verifier node is warranted (its skepticism would only re-run the same deterministic
  oracles). n4-review runs the full `validation_command` (four chains, cross-edition #307) with engine +
  contracts + docs all in place, and post-dominates every code-producing node (G1).
- **No ADR.** These are two bug fixes plus two additive, well-specified enhancements; the durable record
  is the four CHANGELOG `[Unreleased]` entries (Fixed #602, Fixed #603, Added #604, Added #605) at the
  sink plus the `docs/workflow-state-contract.md` section. No `docs/decisions/` file is authored, so no
  decision-record id is pinned.
- CI/CD is not a gate anywhere in this plan; validation is the four internal npm chains only.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-engine | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, scripts/test-claim-hardening.js | 15 | sequence | opus |
| n2-contracts | tdd-guide | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js | 18 | sequence | sonnet |
| n3-docs | doc-updater | n1-engine | docs/workflow-state-contract.md | 1 | sequence | sonnet |
| n4-review | code-reviewer | n1-engine, n2-contracts, n3-docs | — | 1 | sequence | opus |
| n5-finalize | finalize | n4-review | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-engine | complete |
| n2-contracts | complete |
| n3-docs | complete |
| n4-review | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-contracts) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-engine) | subagent-invoked | group_passed | |
| doc-updater (n3-docs) | subagent-invoked | evidence-binding: n3-docs 992101a41be1 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 3427c66aabb9 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize bc1af99b0648 | |
