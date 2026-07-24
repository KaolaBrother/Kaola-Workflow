# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a loop-engineering system for coding agents — an adaptive, GitHub-issue-driven workflow for Claude Code: the `planner` authors and freezes a task-shaped DAG of role nodes in `workflow-plan.md`, then the executor runs it node-by-node via the running-set scheduler. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Durable State Contract

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, the frozen `workflow-plan.md` (its `## Node Ledger`), and per-node `.cache/{node-id}.md` evidence.

## First Principles

These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when no shipped rule covers a situation, resolve it by walking these axioms in order and record a one-line derivation in the node's evidence file. This derivation is optional — its absence never blocks a gate.

**Tighten-only boundary:** an axiom may only make an agent stricter, never looser. Never cite an axiom to skip a typed gate, refusal, or barrier — gates define the allowed space; axioms only break ties inside it.

## Workflow Design Principles

### Agent Owns Reasoning; Scripts Own Atomicity

Issue selection is an agent decision, not a hidden script decision.

- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: agent inspects local roadmap, GitHub issues, recent completed work, active folders, and user goal, then states the selected issue before claiming via `KAOLA_TARGET_ISSUE=N`.
- **Startup scripts validate, not select**: `cmdStartup`, `cmdPickNext`, and `cmdBootstrap` require an explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

### Maximize Workflow Efficiency by Faithful Decomposition

The objective is **minimum makespan and minimum wasted work at fixed correctness.** Efficiency comes from faithfully decomposing a task into its genuinely-independent units and running them at the highest *safe* concurrency — **not** from maximizing fan-out width (over-fanning fragments context and adds synthesis overhead — itself a cost), and **not** from cutting correctness gates (rework is the most expensive inefficiency of all). The adaptive path composes a task-shaped DAG for *any* shape of work; serve a new shape by composing existing roles, never a special-case lane.

- **Decompose to genuine independence, then dispatch concurrently** — fan out exactly as wide as the task decomposes, no wider, no narrower. Reserve `sequence` for true dependencies.
- **Read frontiers run concurrently today** (`code-explorer`, `knowledge-lookup`, `adversarial-verifier`; the `adversarial-verifier` majority-refute fan-out is the parallel-skeptic shape). **Planner-proven-disjoint (`parallel_safe` antichain) write** frontiers co-open in isolated legs by default — contained per-leg + reconciled by the synthesizer; serial holds only on an evidence-named serializer or a consent-gated surface (next principle).
- **Schedule critical-path-first; right-size the model tier** (don't spend Opus where Sonnet suffices — raise only at the reasoning floor); consider `speculative_open_policy` where a gate is very likely to pass.
- **Dispatch production; keep decisions.** The orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default, and what stays inline is the deciding itself. Weigh these economics per case with your own judgment; no justifier, evidence line, or approval attaches to the choice.
- **Correctness is efficiency.** Fail-closed gates + adversarial verify prevent the rework that dwarfs any parallelism win. Investigation composes as probe → assume → adversarial critique → converge (read phases fanned out; shape-first read-only then re-plan when the shape depends on findings, freeze-once). Question/bug-shaped handling is not yet shipped.
- **Escalate values, not facts** — route value / standing / irreversible calls to the `consent`-halt valve; never bolt an approval gate onto the planner.

### Parallel by Default; Serial Requires Evidence

Concurrency is the standing default for any frontier. Holding work serial is a positive claim that must cite **present-tense, checkable evidence** for a named serializer — never a guess, anticipation, or prediction:

- **S1 — data dependency**: name the concrete artifact one unit consumes from another ("name it or co-open").
- **S2 — shared irreversible effect**: name the shared resource both units mutate (resource identity, not a conflict forecast).
- **S3 — environment**: a failed worktree-support probe (a measurement).

Uncertainty is not a serializer — uncertain writes co-open in isolated legs and reconcile at the join. Rationale: wrong-parallel costs one bounded, visible synthesis pass; wrong-serial costs invisible wall-clock on every frontier, so the burden of proof sits on serial. This governs **mode** only: width stays governed by faithful decomposition, and the recorded evidence line is audit-only (the only mechanical check allowed is that it exists).

### Self-Sufficient by Default; CI/CD Is Not a Gate

Minimize **synergy** (coupling to systems the workflow does not own); maximize **independence**. A run must complete on a repo with **no CI/CD configured**, with no degradation.

- **CI/CD is never a required gate** — not a plan node, not a finalization precondition, not something the orchestrator / `--sink` / finalize waits on or blocks on. Coupling correctness to an external pipeline assumes infrastructure that may not exist and hands the verdict to a system we don't own.
- **Silent by default** — do not mention CI/CD in plans, prose, finalize output, roadmap, or suggestions **unless the user clearly states CI/CD is mandated** for that context. Default posture is CI/CD *absent*, not "optional"; only an explicit mandate flips it on.
- **Accuracy still comes from inside** — this does not weaken axiom 1. Keep the internal self-contained gates (adversarial verify, fail-closed barriers, gate-role nodes, the four `npm` chains, `simulate-workflow-walkthrough.js`); reject only the *external pipeline as a gate*.

### The Adaptive Workflow

The workflow runs one path; the orchestrator does not spend tokens or wall-clock choosing between paths.

- **The workflow is adaptive.** Every install ships it; there is nothing to select or configure.
- **There is no path to select or refuse.** A stale `KAOLA_PATH` / `--workflow-path` request runs adaptive (the flag is a warn-and-ignore shim; the env var is ignored), rather than refusing. This deliberately supersedes the former "never silently substitute adaptive for a named path" stance and retires the `fast`/`full` vocabulary and the `path_not_installed` refusal — a values call (First Principle 4) that became moot once exactly one path remained.
- **When adaptive can't proceed, it recovers inside adaptive**: bounded planner repair → discard+restart → stop+ask. Repair and the in-place posture are the only fallbacks.

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, release/discard, status, patch-branch, watch-pr, bootstrap/startup, pick-next, resume, finalize, worktree-status, worktree-finalize subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap generation from GitHub issues
- `scripts/kaola-workflow-plan-validator.js` — adaptive-path plan validator: closed-library + three-shape grammar + unique sink + post-dominance gates + caps + disjointness + risk-assessment governance (`--json`/`--freeze`/`--resume-check`/`--freeze-checked`/`--governance-ack`); `plan_hash` lives inside `workflow-plan.md`. Emits a typed `reason` field in `barrierCheck` output (the emit envelope — precedence-ordered failure family so callers classify structurally, never by string-match).
- `scripts/kaola-workflow-adaptive-schema.js` — adaptive-path forge-neutral constants + toggle resolution; byte-identical across all four editions (cross-edition drift anchor).
- `scripts/kaola-workflow-next-action.js` — adaptive aggregator: ready-set / next node / resolved model from a frozen `workflow-plan.md` (n/a-aware; typed refusal on a stalled/corrupt DAG). Shelled by `kaola-workflow-adaptive-node.js`.
- `scripts/kaola-workflow-commit-node.js` — adaptive aggregator: composes the per-node barrier choreography (`--record-base` → `--barrier-check` + `--gate-verify`) by shelling the plan-validator. Shelled by `kaola-workflow-adaptive-node.js`; fails closed on a missing baseline; never mutates the ledger/state.
- `scripts/kaola-workflow-adaptive-handoff.js` — adaptive aggregator: collapses the planner freeze/orient chain into ONE mechanical transaction. `--freeze-checked --json` validates and returns the governance payload WITHOUT writing; `--freeze --governance-ack <planHash> --json` re-validates, asserts hash unchanged (`governance_ack_stale` refuse on tamper), writes atomically, and folds `--resume-check` into its emission. Branches on validator `result` (in-grammar → freeze + roadmap + Planning Evidence → `ready_to_run`; refuse → `plan_invalid`, no mutation). Does NOT open node1 or record its baseline — plan-run owns the full node lifecycle. `decision:ask` is audit metadata, not a gate. Run by the `workflow-planner`; the orchestrator drives the bounded repair loop on `plan_invalid`.
- `scripts/kaola-workflow-adaptive-node.js` — adaptive aggregator: owns the per-node lifecycle for `/kaola-workflow-plan-run` (subcommands: `orient` [read-only], `open-next` [ledger + baseline], `open-ready` [running-set scheduler open], `record-evidence` [.cache], `close-and-open-next` [evidence-check + barrier + close + compliance + selector + fused advance], `close-node` [running-set scheduler close], `reconcile-running-set` [crash repair for running-set], `write-halt` [consent/security/test_thrash escalation]). Runs a layered guard prologue before every mutating subcommand: integrity → consent-halt fence → live-coordination mutual exclusion → body. `--freeze-checked`/`--governance-ack` are handled by `kaola-workflow-adaptive-handoff.js` (not this script). Pure composition over `next-action.js` + `commit-node.js` + `plan-validator.js`; never imports-and-mutates them. Runs every node including the first. Ships in 4 editions; registered in COMMON_SCRIPTS and all three install.sh SUPPORT_SCRIPT_NAMES blocks.

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
- Verify facts, don't fabricate: do not guess API/library behavior, interfaces, or signatures — confirm them against documentation, source, or a run before relying on them. Do not claim to understand code, errors, or requirements you have not verified; name what you do not know and find out.
- Reuse before adding: before writing a new interface, search for an existing equivalent and extend it rather than duplicate functionality.
- Escalate irreversible changes: do not unilaterally make hard-to-reverse changes or alter a user-owned contract (public API, schema or data migration, dependency or build-tooling swap, deletion of working capability); state the decision and its evidence, then get confirmation before proceeding.
- **Keep provenance out of agent-facing prompts.** Agent definitions, commands, and skills carry the *rule*, never its origin — no issue refs, decision IDs, invariant tags, or ADR citations in those surfaces. Provenance belongs in `CHANGELOG.md`, `docs/decisions/`, and commit messages. Runtime target-issue variables (`KAOLA_TARGET_ISSUE=N`, `"issue N"`) are not provenance. See `docs/conventions.md`.

## Validation Policy

- Background hooks (subagent-dispatch-log) are advisory; do not re-run their checks redundantly.
- Verify with `node scripts/simulate-workflow-walkthrough.js` before claiming workflow-related changes complete.
- **Cross-edition diffs require all four chains green.** A diff touching the edition trees (`plugins/kaola-workflow-{gitlab,gitea}/`, the codex/forge contract validators, or any edition-port script) MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green — run sequentially — recorded before Finalization. A green claude chain alone is **insufficient evidence**: `npm test` chains the four with `&&`, so it short-circuits on the first failure and a red codex/gitlab/gitea chain behind a green claude one is never reached. See `docs/conventions.md`.
- **`run-chains.js` applies that rule automatically at finalize.** In finalize context (`--project`/`--plan`, no `--chains`/`--mock-chain` override) it diff-scopes the chain selection: a non-edition-touching diff runs the `claude` chain alone, and an edition-touching diff — or an unresolved diff base — fails closed to all four. The rule itself is unchanged; only who evaluates it moved from the operator to the producer. A release tag always requires the full, unwaived four-chain receipt regardless of scope.
- **Adaptive / routing / finalize-wiring prose propagates to SIX surfaces.** The propagation surfaces are the 3 Claude commands + the 3 Codex SKILL packs, including the two forge-codex SKILL packs. A change reaching only 4 of 6 is a propagation gap; the route-reachability contract (`scripts/test-route-reachability.js` + all four `validate-*-contracts.js`) machine-enforces it. See `docs/conventions.md` § Routing / adaptive prose.
- **opencode edition is additive.** It is a runtime edition, not a forge: it is **not** wired into `npm test`, `edition-sync.js`, `install.sh`, or the SIX routing surfaces. An opencode-only diff triggers no four-chain obligation; run its own suite (`node scripts/test-opencode-edition.js`) instead.
- **kimi edition is additive.** It is a runtime edition, not a forge: it is **not** wired into `npm test`, `edition-sync.js`, `install.sh`, or the SIX routing surfaces. A kimi-only diff triggers no four-chain obligation; run its own suite (`node scripts/test-kimi-edition.js`) instead.

## Documentation Map

- `README.md` — project overview and install.
- `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — documentation index.
- `docs/architecture.md` — system structure and data flow.
- `docs/api.md` — APIs, schemas, events, external contracts.
- `docs/conventions.md` — coding, testing, Git, review rules.
- `docs/workflow-state-contract.md` — durable state and generated mirror contract.
- `docs/opencode-edition.md` — additive opencode runtime edition (installed via `install-opencode.sh`; not wired into `npm test`).
- `docs/kimi-edition.md` — additive Kimi Code runtime edition (installed via `install-kimi.sh`; not wired into `npm test`).
- `docs/decisions/` — architecture decision records.
- `kaola-workflow/ROADMAP.md` — active implementation roadmap mirror.

## Maintenance

- Keep this file under 200 lines; move detail to `docs/` or skills.
- Add rules only after repeated mistakes, review feedback, or stable project conventions.
- Do not use `@path` imports for optional reference material.
