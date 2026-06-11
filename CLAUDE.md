# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a 6-phase workflow system built on top of GitHub issues and Claude Code. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Durable State Contract

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.

## Workflow Design Principles

### Agent Owns Reasoning; Scripts Own Atomicity (issue #44)

Issue selection is an agent decision, not a hidden script decision.

- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: agent inspects local roadmap, GitHub issues, recent completed work, active folders, and user goal, then states the selected issue before claiming via `KAOLA_TARGET_ISSUE=N`.
- **Startup scripts validate, not select**: `cmdStartup`, `cmdPickNext`, and `cmdBootstrap` now require explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, release/discard, status, patch-branch, watch-pr, bootstrap/startup, pick-next, resume, finalize, worktree-status, worktree-finalize subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap generation from GitHub issues
- `scripts/kaola-workflow-plan-validator.js` — adaptive-path (#227) plan validator: closed-library + three-shape grammar + unique sink + post-dominance gates + caps + disjointness + risk-assessment governance (`--json`/`--freeze`/`--resume-check`); `plan_hash` lives inside `workflow-plan.md`. Toggle-agnostic.
- `scripts/kaola-workflow-adaptive-schema.js` — adaptive-path forge-neutral constants + toggle resolution; byte-identical across all four editions (cross-edition drift anchor).
- `scripts/kaola-workflow-next-action.js` — adaptive aggregator: ready-set / next node / resolved model from a frozen `workflow-plan.md` (n/a-aware; typed refusal on a stalled/corrupt DAG). Shelled by `kaola-workflow-adaptive-node.js`.
- `scripts/kaola-workflow-commit-node.js` — adaptive aggregator: composes the per-node barrier choreography (`--record-base` → `--barrier-check` + `--gate-verify`) by shelling the plan-validator. Shelled by `kaola-workflow-adaptive-node.js`; fails closed on a missing baseline; never mutates the ledger/state.
- `scripts/kaola-workflow-adaptive-handoff.js` — adaptive aggregator (#255): collapses the planner freeze/orient chain into ONE mechanical transaction. Branches on validator `result` (in-grammar → freeze + resume-check + roadmap + Planning Evidence → `ready_to_run`; refuse → `plan_invalid`, no mutation). Does NOT open node1 or record its baseline — plan-run owns the full node lifecycle. `decision:ask` is audit metadata, not a gate. Run by the `workflow-planner`; the orchestrator drives the bounded repair loop on `plan_invalid`.
- `scripts/kaola-workflow-adaptive-node.js` — adaptive aggregator (#272): owns the per-node lifecycle for `/kaola-workflow-plan-run` (subcommands: `orient` [read-only], `open-next` [ledger + baseline], `record-evidence` [.cache], `close-and-open-next` [evidence-check + barrier + close + compliance + selector + fused advance], `write-halt` [consent/security/test_thrash escalation]). Pure composition over `next-action.js` + `commit-node.js` + `plan-validator.js`; never imports-and-mutates them. Runs every node including the first. Ships in 4 editions; registered in COMMON_SCRIPTS and all three install.sh SUPPORT_SCRIPT_NAMES blocks.

## Running Tests
```bash
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".

For any **cross-edition** diff (see Validation Policy), run all four chains sequentially:
```bash
npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && \
  npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
```

## Documentation Update Checklist

- [ ] README.md - update feature list, usage examples, env vars
- [ ] API docs - add/update endpoint descriptions and examples
- [ ] CHANGELOG.md - add entry under [Unreleased]
- [ ] Architecture docs - update if structure changed
- [ ] .env.example - add any new environment variables
- [ ] Inline comments - update where public interfaces changed

## Commands

- Install: `./install.sh --forge=github` (Claude Code), `--forge=gitlab` (GitLab edition), or `--forge=gitea` (Gitea edition).
- Test: `node scripts/simulate-workflow-walkthrough.js` and `npm test`.
- Lint/typecheck/build: unknown (Node scripts only, no formal pipeline).
- Dev server: not applicable.

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and relevant surrounding conventions immediately before editing or creating files.
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Goal-driven execution: Define verifiable success criteria before starting. Prefer write-the-failing-test-first for bugs and features. Loop until criteria pass; don't declare done on weak signals.

## Validation Policy

- Background hooks (pre-commit, subagent-dispatch-log) are advisory; do not re-run their checks redundantly.
- Verify with `node scripts/simulate-workflow-walkthrough.js` before claiming workflow-related changes complete.
- **Cross-edition diffs require all four chains green (#307).** A diff touching the edition trees (`plugins/kaola-workflow-{gitlab,gitea}/`, the codex/forge contract validators, or any edition-port script) MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green — run sequentially — recorded before Finalization. A green claude chain alone is **insufficient evidence**: `npm test` chains the four with `&&`, so it short-circuits on the first failure and a red codex/gitlab/gitea chain behind a green claude one is never reached. See `docs/conventions.md`.
- **Adaptive / routing / finalize-wiring prose propagates to SIX surfaces (#400)** — the 3 Claude commands + the 3 Codex SKILL packs (incl. the two forge-codex SKILL packs, the historic dead zone). A change reaching only 4 of 6 (the CHANGELOG "×4" wording is the symptom) is a propagation gap; the route-reachability contract (`scripts/test-route-reachability.js` + all four `validate-*-contracts.js`) machine-enforces it. See `docs/conventions.md` § Routing / adaptive prose.

## Documentation Map

- `README.md` — project overview and install.
- `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — documentation index.
- `docs/architecture.md` — system structure and data flow.
- `docs/api.md` — APIs, schemas, events, external contracts.
- `docs/conventions.md` — coding, testing, Git, review rules.
- `docs/workflow-state-contract.md` — durable state and generated mirror contract.
- `docs/decisions/` — architecture decision records.
- `kaola-workflow/ROADMAP.md` — active implementation roadmap mirror.

## Maintenance

- Keep this file under 200 lines; move detail to `docs/` or skills.
- Add rules only after repeated mistakes, review feedback, or stable project conventions.
- Do not use `@path` imports for optional reference material.
