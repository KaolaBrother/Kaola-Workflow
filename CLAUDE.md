# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a 6-phase workflow system built on top of GitHub issues and Claude Code. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Durable State Contract

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.

## Workflow Design Principles

**Design theory.** Kaola-Workflow exists to enhance what agents do — more automation, less human toil, shorter wall-clock — **without ever sacrificing accuracy.** Every mechanism is a *means*, ordered by this precedence when they conflict:

1. **Accuracy is non-negotiable** — never trade correctness for speed or cost; rework is the most expensive outcome of all.
2. **Then automation & efficiency** — remove human steps and shorten makespan.
3. **Then the cheapest sufficient mechanism** — parallelism, speculation, extra agents, and higher model tiers are means, not goals. Pick the simplest one that achieves 1–2; don't over-engineer, and don't spend tokens a smaller approach wouldn't. Size fan-out width, agent count, and model tier to the *genuine scope* of the work.

Parallelism is one such means: powerful when work genuinely decomposes, wasteful when forced — over-fanning burns tokens and context for no accuracy or makespan gain.

### Agent Owns Reasoning; Scripts Own Atomicity (issue #44)

Issue selection is an agent decision, not a hidden script decision.

- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: agent inspects local roadmap, GitHub issues, recent completed work, active folders, and user goal, then states the selected issue before claiming via `KAOLA_TARGET_ISSUE=N`.
- **Startup scripts validate, not select**: `cmdStartup`, `cmdPickNext`, and `cmdBootstrap` now require explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

### Maximize Workflow Efficiency by Faithful Decomposition (#472, #463, #439, #486)

The objective is **minimum makespan and minimum wasted work at fixed correctness.** Efficiency comes from faithfully decomposing a task into its genuinely-independent units and running them at the highest *safe* concurrency — **not** from maximizing fan-out width (over-fanning fragments context and adds synthesis overhead — itself a cost), and **not** from cutting correctness gates (rework is the most expensive inefficiency of all). The adaptive path composes a task-shaped DAG for *any* shape of work; serve a new shape by composing existing roles, never a special-case lane.

- **Decompose to genuine independence, then dispatch concurrently** — fan out exactly as wide as the task decomposes, no wider, no narrower (width is the planner's call, #472). Reserve `sequence` for true dependencies.
- **Read frontiers run concurrently today** (shipped #472 seam — `code-explorer`, `knowledge-lookup`, `adversarial-verifier`; the `adversarial-verifier` majority-refute fan-out, `plan-validator.js:688-707`, is the parallel-skeptic shape). **Write** frontiers serial-degrade until per-leg isolation lands (#463) — the largest remaining makespan lever.
- **Schedule critical-path-first; right-size the model tier** (don't spend Opus where Sonnet suffices — raise only at the reasoning floor); consider speculative-open (#439, `speculative_open_policy`) where a gate is very likely to pass.
- **Correctness is efficiency.** Fail-closed gates + adversarial verify prevent the rework that dwarfs any parallelism win. Investigation composes as probe → assume → adversarial critique → converge (read phases fanned out; shape-first read-only then re-plan when the shape depends on findings, freeze-once). Question/bug-shaped handling is designed in **#486** (not yet shipped).
- **Escalate values, not facts** — route value / standing / irreversible calls to the `consent`-halt valve; never bolt an approval gate onto the planner (planner-first, #44/#287).

### Self-Sufficient by Default; CI/CD Is Not a Gate (#501)

Minimize **synergy** (coupling to systems the workflow does not own); maximize **independence**. A run must complete on a repo with **no CI/CD configured**, with no degradation.

- **CI/CD is never a required gate** — not a plan node, not a finalization precondition, not something the orchestrator / `--sink` / finalize waits on or blocks on. Coupling correctness to an external pipeline assumes infrastructure that may not exist and hands the verdict to a system we don't own.
- **Silent by default** — do not mention CI/CD in plans, prose, finalize output, roadmap, or suggestions **unless the user clearly states CI/CD is mandated** for that context. Default posture is CI/CD *absent*, not "optional"; only an explicit mandate flips it on.
- **Accuracy still comes from inside** — this does not weaken precedence #1. Keep the internal self-contained gates (adversarial verify, fail-closed barriers, gate-role nodes, the four `npm` chains, `simulate-workflow-walkthrough.js`); reject only the *external pipeline as a gate*. Same direction as the consumer finalize gate (push validation inward to agent checks, retire external chain/CI receipts — #475/#464).

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, release/discard, status, patch-branch, watch-pr, bootstrap/startup, pick-next, resume, finalize, worktree-status, worktree-finalize subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap generation from GitHub issues
- `scripts/kaola-workflow-plan-validator.js` — adaptive-path (#227) plan validator: closed-library + three-shape grammar + unique sink + post-dominance gates + caps + disjointness + risk-assessment governance (`--json`/`--freeze`/`--resume-check`/`--freeze-checked`/`--governance-ack`); `plan_hash` lives inside `workflow-plan.md`. Emits a typed `reason` field in `barrierCheck` output (the emit envelope — precedence-ordered failure family so callers classify structurally, never by string-match). Toggle-agnostic.
- `scripts/kaola-workflow-adaptive-schema.js` — adaptive-path forge-neutral constants + toggle resolution; byte-identical across all four editions (cross-edition drift anchor).
- `scripts/kaola-workflow-next-action.js` — adaptive aggregator: ready-set / next node / resolved model from a frozen `workflow-plan.md` (n/a-aware; typed refusal on a stalled/corrupt DAG). Shelled by `kaola-workflow-adaptive-node.js`.
- `scripts/kaola-workflow-parallel-batch.js` — adaptive parallel-batch aggregator: `open-batch` / `top-up` / `seal-member` / `seal` / `reconcile` / `status` subcommands for fan-out frontiers; crash-safe two-phase manifest; write-role frontiers serial-degrade (`degraded: true`). Shelled by `kaola-workflow-adaptive-node.js`.
- `scripts/kaola-workflow-commit-node.js` — adaptive aggregator: composes the per-node barrier choreography (`--record-base` → `--barrier-check` + `--gate-verify`) by shelling the plan-validator. Shelled by `kaola-workflow-adaptive-node.js`; fails closed on a missing baseline; never mutates the ledger/state.
- `scripts/kaola-workflow-adaptive-handoff.js` — adaptive aggregator (#255): collapses the planner freeze/orient chain into ONE mechanical transaction. `--freeze-checked --json` (SPAWN 1) validates and returns the governance payload WITHOUT writing; `--freeze --governance-ack <planHash> --json` (SPAWN 2) re-validates, asserts hash unchanged (`governance_ack_stale` refuse on tamper), writes atomically, and folds `--resume-check` into its emission. Branches on validator `result` (in-grammar → freeze + roadmap + Planning Evidence → `ready_to_run`; refuse → `plan_invalid`, no mutation). Does NOT open node1 or record its baseline — plan-run owns the full node lifecycle. `decision:ask` is audit metadata, not a gate. Run by the `workflow-planner`; the orchestrator drives the bounded repair loop on `plan_invalid`.
- `scripts/kaola-workflow-adaptive-node.js` — adaptive aggregator (#272): owns the per-node lifecycle for `/kaola-workflow-plan-run` (subcommands: `orient` [read-only], `open-next` [ledger + baseline], `open-ready` [running-set scheduler open], `record-evidence` [.cache], `close-and-open-next` [evidence-check + barrier + close + compliance + selector + fused advance], `close-node` [running-set scheduler close], `reconcile-running-set` [crash repair for running-set], `write-halt` [consent/security/test_thrash escalation]). Runs a layered guard prologue (#383 mutual-exclusion guard) before every mutating subcommand: integrity → consent-halt fence → live-coordination mutual exclusion → body. `--freeze-checked`/`--governance-ack` are handled by `kaola-workflow-adaptive-handoff.js` (not this script). Pure composition over `next-action.js` + `commit-node.js` + `plan-validator.js`; never imports-and-mutates them. Runs every node including the first. Ships in 4 editions; registered in COMMON_SCRIPTS and all three install.sh SUPPORT_SCRIPT_NAMES blocks.

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
