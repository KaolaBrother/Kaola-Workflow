# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a loop-engineering system for coding agents — an adaptive, GitHub-issue-driven workflow for Claude Code: the `planner` authors and freezes a `spine`-form `workflow-plan.md` that expands at runtime into a task-shaped DAG of role nodes, then the executor runs it node-by-node via the running-set scheduler. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Durable State Contract

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file. A source file left behind after closure is silent — the mirror still reads correct until the next `generate` publishes its dead row — and nothing invokes the detector automatically, so check it by hand with `node scripts/kaola-workflow-roadmap.js validate-remote` (exit 1 = drift; `skipped: offline` under `KAOLA_WORKFLOW_OFFLINE=1`).
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, the frozen `workflow-plan.md` (its `## Node Ledger`), and per-node `.cache/{node-id}.md` evidence.
- Re-plan is claim-preserving and epoch-scoped: the planner authors an attested child `workflow-plan.next.md`, and every committed parent epoch is retained under `.cache/epochs/{ordinal}/`. The parent plan and its Ledger stay byte-identical — never rewrite a frozen plan in place.

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

Issue selection is an agent decision, not a hidden script decision — and it is the **orchestrator's** decision. **Zero regulation on the route between commitment points; full regulation AT the points.**

- **The origin phase is free.** Before any claim the orchestrator may dispatch read-only agents, read whatever it needs, and ask the user; the phase right-sizes itself per issue shape (zero dispatches for a trivial fix, a surveyor fan-out for a backlog sweep). One invariant: findings land in DURABLE FILES, not context — stage them under `kaola-workflow/.origin/<target-key>/` and the claim folds them into `kaola-workflow/{project}/.cache/origin/`.
- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: the ORCHESTRATOR reads the backlog (local roadmap incl. its `### Project rules`, forge issues, recent completed work, active folders and their `lane_bucket`, and the user goal), ranks by the priority frontier, states the selection aloud, and claims it. A CLEAN selection — frontier honored, no ambiguity — claims autonomously; only ambiguity or a policy conflict asks. The `workflow-planner` is then dispatched as a SYNTHESIST with the resolved target, the selection record, and the reconnaissance evidence PATHS; it never ranks the backlog.
- **Gate 1 — the commitment point is a script refusal**: `cmdStartup` / `cmdPickNext` require an explicit `--target-issue N` (or `--target-issues`), and an orchestrator-originated claim (`--target-source orchestrator_selected`) additionally requires `--selection-record <path>` or refuses `selection_record_missing` / `selection_record_invalid` with zero side effects. The record's six fields are validated present-and-non-empty and nothing deeper. An explicit-target claim writes the degenerate record itself, so `selection_record_digest:` is never optional in `workflow-state.md`.
- **Briefs carry evidence, never prescriptions.** The control boundary is unchanged and load-bearing: a pre-authored `## Nodes`, an `AUTHOR EXACTLY`, or a `do not redesign` still refuses `planner_control_boundary_violation`. Cite what you FOUND; never dictate what the plan must CONCLUDE. An under-determined brief comes back as `clarification_required` (escalate family, bounded at 3 round-trips, then stop+ask) — answer it and re-dispatch.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

### Maximize Workflow Efficiency by Faithful Decomposition

The objective is **minimum makespan and minimum wasted work at fixed correctness.** Efficiency comes from faithfully decomposing a task into its genuinely-independent units and running them at the highest *safe* concurrency — **not** from maximizing fan-out width (over-fanning fragments context and adds synthesis overhead — itself a cost), and **not** from cutting correctness gates (rework is the most expensive inefficiency of all). The adaptive path composes a task-shaped DAG for *any* shape of work; serve a new shape by composing existing roles, never a special-case lane.

- **Decompose to genuine independence, then dispatch concurrently** — fan out exactly as wide as the task decomposes, no wider, no narrower. Reserve `sequence` for true dependencies.
- **Read frontiers run concurrently today** (`code-explorer`, `knowledge-lookup`, `adversarial-verifier`; the `adversarial-verifier` majority-refute fan-out is the parallel-skeptic shape). **Planner-proven-disjoint (`parallel_safe` antichain) write** frontiers co-open in isolated legs by default — contained per-leg + reconciled by the synthesizer; serial holds only on an evidence-named serializer or a consent-gated surface (next principle).
- **Schedule critical-path-first; right-size the model tier** (don't spend Opus where Sonnet suffices — raise only at the reasoning floor); consider `speculative_open_policy` where a gate is very likely to pass.
- **Dispatch production; keep decisions.** The orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default, and what stays inline is the deciding itself. Weigh these economics per case with your own judgment; no justifier, evidence line, or approval attaches to the choice.
- **Correctness is efficiency.** Fail-closed gates + adversarial verify prevent the rework that dwarfs any parallelism win. Investigation composes as probe → assume → adversarial critique → converge (read phases fanned out; shape-first read-only then re-plan when the shape depends on findings, freeze-once per epoch). Question/bug-shaped handling is not yet shipped.
- **Escalate values, not facts** — route value / standing / irreversible calls to the `consent`-halt valve; never bolt an approval gate onto the planner.

### Parallel by Default; Serial Requires Evidence

Concurrency is the standing default for any frontier. Holding work serial is a positive claim that must cite **present-tense, checkable evidence** for a named serializer — never a guess, anticipation, or prediction:

- **S1 — data dependency**: name the concrete artifact one unit consumes from another ("name it or co-open").
- **S2 — shared irreversible effect**: name the shared resource both units mutate (resource identity, not a conflict forecast).
- **S3 — environment**: a failed worktree-support probe (a measurement).

**A serializer must be one the orchestrator cannot remove.** A blocker the workflow itself created — state produced by its own commit policy rather than by the task — is a **repair obligation discharged before dispatch**, never evidence. Repair it, then co-open; where the repair cannot be *proven* sound, halt loudly rather than serialize over it, because silent serialization buries the integrity signal it should be raising. The repair belongs to the **scheduler, not the plan**: the planner authors the shape, the scheduler clears its own residue.

Uncertainty is not a serializer — uncertain writes co-open in isolated legs and reconcile at the join. Rationale: wrong-parallel costs one bounded, visible synthesis pass; wrong-serial costs invisible wall-clock on every frontier, so the burden of proof sits on serial. This governs **mode** only: width stays governed by faithful decomposition, and the recorded evidence line is audit-only (the only mechanical check allowed is that it exists).

### Self-Sufficient by Default; CI/CD Is Not a Gate

Minimize **synergy** (coupling to systems the workflow does not own); maximize **independence**. A run must complete on a repo with **no CI/CD configured**, with no degradation.

- **CI/CD is never a required gate** — not a plan node, not a finalization precondition, not something the orchestrator / `--sink` / finalize waits on or blocks on. Coupling correctness to an external pipeline assumes infrastructure that may not exist and hands the verdict to a system we don't own.
- **Silent by default** — do not mention CI/CD in plans, prose, finalize output, roadmap, or suggestions **unless the user clearly states CI/CD is mandated** for that context. Default posture is CI/CD *absent*, not "optional"; only an explicit mandate flips it on.
- **Accuracy still comes from inside** — this does not weaken axiom 1. Keep the internal self-contained gates (adversarial verify, fail-closed barriers, gate-role nodes, the four `npm` chains, `simulate-workflow-walkthrough.js`); reject only the *external pipeline as a gate*.

### One Rule, One Wording; Runtime Divergence Requires Declaration

A rule, refusal code, or generated template has **exactly one wording**, and every agent runtime reads that wording. A runtime is a *rendering target*, never an authoring surface: the same rule may not be restated, abridged, or re-neutralized per runtime.

- **Divergence must be declared** — allowed only where a runtime's capabilities genuinely differ (Codex spawns via `agent_type` where Claude uses `subagent_type`; Kimi subagents inherit the session model). Express it as a named region in the single source or a named entry in an exemption table with a one-line reason, never as an incidental rewrite rule.
- **Generated text is runtime-neutral at the source**, not neutralized on the way out. Every per-runtime rewrite is a site where two targets can silently diverge, so the count of rewrite rules is itself the reliability metric — drive it toward zero.
- **Consumer-facing artifacts this project writes into someone else's repo** (`CLAUDE.md`, `AGENTS.md`) are read by every runtime: name no vendor, no model, and no command that does not resolve on the reader's runtime.
- **Regulating clause** — any change touching a prompt surface states which runtimes it reaches. "I edited the Claude command" is not a complete change; the surface set is part of the diff.
- **A guard is evidence only once mutation-proven.** A green suite is not evidence a guard is armed — enforcement must default to on (exempt-lists, not opt-in allowlists) and be bidirectional, or a forgotten token is silently unguarded.

### The Adaptive Workflow

The workflow runs one path; the orchestrator does not spend tokens or wall-clock choosing between paths.

- **The workflow is adaptive.** Every install ships it; there is nothing to select or configure.
- **There is no path to select or refuse, and no residue of one.** A stale `KAOLA_PATH` / `--workflow-path` request runs adaptive (the flag is a warn-and-ignore shim; the env var is ignored), rather than refusing — and the request leaves no trace: the persisted `workflow_path` field is the constant `adaptive`, never an echo, so a retired selector can never be misread as a live switch (a legacy folder's stale value is still tolerated on read). This deliberately supersedes the former "never silently substitute adaptive for a named path" stance and retires the `fast`/`full` vocabulary and the `path_not_installed` refusal — a values call (First Principle 4) that became moot once exactly one path remained.
- **When adaptive can't proceed, it recovers inside adaptive**: bounded planner repair → discard+restart → stop+ask. Repair and the in-place posture are the only fallbacks.

### A Refusal Is a Cost; Admission Is Ruled, Measured, and Ratcheted

Every refusal spends a human's attention. Admission is therefore governed by three parts that only work together — a **rule** for deciding, an **instrument** for ordering, and a **ratchet** for holding. A rule without measurement subtracts by anecdote; measurement without a ratchet regrows; a ratchet without a rule freezes whatever happens to exist.

- **Rule.** A refusal must sit at kernel-write integrity, the sink, or the consent valve — **and** be crucial there. A condition recoverable in place ships as an advisory even at those loci. A refusal whose remedy is mechanical is a missing tool wearing a uniform: perform the transformation and retire the refusal. The bound: a deviation that is itself evidence (hash mismatch, unattributed diff, chain break) is never auto-repaired — that would launder the signal. Full rules and their wording live in `docs/conventions.md` § Refusal admission.
- **Instrument.** Refusal telemetry records what each interruption costs, so the corpus is walked by measurement rather than by whatever an audit last surfaced. Until instrumented runs exist the corpus census is the honest ordering — **say which ordering is in force, and never present one as the other.**
- **Ratchet.** Enforcement is forward-only: red on new unclassified growth, silent on removal. A guard that reddens on deletion taxes the subtraction it exists to protect.
- **Removal costs a green arc, and that is the point.** Adding *or* removing a refusal requires a pinned traversal of the legal path, not only the refusing one. Budget for it; it is why subtraction gets deferred.
- **Retiring a code is one diff, not two.** A demoted code takes its recovery choreography off every prompt surface and its needle pins off the contract validators in the same change. A demotion that leaves choreography behind subtracted a token and nothing else.
- **Pin behaviour, never token spelling.** An assertion that names a refusal code is a vote against ever removing it.

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, authoring-allowed, release/discard, status, patch-branch, watch-pr, bootstrap/startup, pick-next, resume, finalize, worktree-status, worktree-finalize, sink-fallback, verify-sink, stale-worktree-check/-cleanup, legacy-worktree-cleanup, audit-labels, repair-labels, barrier-ref-sweep subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap mirror generation. `generate` composes the mirror from `kaola-workflow/.roadmap/issue-*.md` alone and makes no remote call; `validate-remote` is the only subcommand that touches the forge (closed-remote drift). Also `validate`, `init-issue`, `project-name`, `migrate`. Ported per forge (GitLab/Gitea swap `migrate` for `refresh`).
- `scripts/kaola-workflow-plan-validator.js` — adaptive-path plan validator: closed-library + four-shape grammar (`sequence`, fan-out over pairwise-disjoint write sets, bounded loop, `select(<group>)`) + unique sink + post-dominance gates + caps + disjointness + risk-assessment governance (`--json`/`--freeze`/`--resume-check`/`--freeze-checked`/`--governance-ack`); `plan_hash` lives inside `workflow-plan.md`. Emits a typed `reason` field in `barrierCheck` output (the emit envelope — precedence-ordered failure family so callers classify structurally, never by string-match).
- `scripts/kaola-workflow-adaptive-schema.js` — adaptive-path forge-neutral constants + toggle resolution; byte-identical across all four editions (cross-edition drift anchor).
- `scripts/kaola-workflow-next-action.js` — adaptive aggregator: ready-set / next node / resolved model from a frozen `workflow-plan.md` (n/a-aware; typed refusal on a stalled/corrupt DAG). Shelled by `kaola-workflow-adaptive-node.js`.
- `scripts/kaola-workflow-commit-node.js` — adaptive aggregator: composes the per-node barrier choreography (`--record-base` → `--barrier-check` + `--gate-verify`) by shelling the plan-validator. Shelled by `kaola-workflow-adaptive-node.js`; fails closed on a missing baseline; never mutates the ledger/state.
- `scripts/kaola-workflow-adaptive-handoff.js` — adaptive aggregator: collapses the planner freeze/orient chain into ONE mechanical transaction. Its OWN CLI is `--project NAME --json` (or `--plan PATH --json`), plus the pre-claim `--survey-verdict` / `--clarification-required` verbs; the freeze flags are **plan-validator** flags it shells internally, never its own argv (passing one to this script is silently ignored). Internally: SPAWN 1 `plan-validator --freeze-checked --json` validates and returns the governance payload WITHOUT writing; SPAWN 2 `plan-validator --freeze --governance-ack <planHash> --json` re-validates, asserts hash unchanged (`governance_ack_stale` refuse on tamper), writes atomically, and folds `--resume-check` into its emission. Branches on validator `result` (in-grammar → freeze + roadmap + Planning Evidence → `ready_to_run`; refuse → `plan_invalid`, no mutation). Does NOT open node1 or record its baseline — plan-run owns the full node lifecycle. `decision:ask` is audit metadata, not a gate. Run by the `workflow-planner`; the orchestrator drives the bounded repair loop on `plan_invalid`.
- `scripts/kaola-workflow-adaptive-node.js` — adaptive aggregator: owns the per-node lifecycle for `/kaola-workflow-plan-run` (core lifecycle: `orient` [read-only], `mirror-project` [idempotent worktree mirror], `open-next` [ledger + baseline], `open-ready` [running-set scheduler open], `record-evidence` [.cache], `close-and-open-next` [evidence-check + barrier + close + compliance + selector + fused advance], `close-node` [running-set scheduler close], `reconcile-running-set` [crash repair for running-set]; repair: `reopen-node` [fresh baseline on a COMPLETE node], `repair-node` [fix agent on the original write set], `revert-overflow` [write-set overflow recovery — not `reopen-node`]; expansion: `expand-open`, `expand-close`, `reexpand-open`, `amend-surface`; routing: `route-findings` [writes `.cache/findings-route.json`], `route-reexpansion` [read-only routing verdict], `final-fix-commit` [sink-owned final-fix register, --stdin]; halts + locks + speculation: `write-halt` [consent/security/test_thrash/merge_conflict/integrity escalation], `clear-halt` [consent/security only], `unlock` [stale scheduler-lock exit, CAS on holder identity], `discard-speculative`). Runs a layered guard prologue before every mutating subcommand: integrity → consent-halt fence → live-coordination mutual exclusion → body. `--freeze-checked`/`--governance-ack` belong to `kaola-workflow-plan-validator.js`; the freeze chain that uses them is driven by `kaola-workflow-adaptive-handoff.js`. Neither flag is this script's. Pure composition over `next-action.js` + `commit-node.js` + `plan-validator.js`; never imports-and-mutates them. Runs every node including the first. Ships in 4 editions; registered in COMMON_SCRIPTS and all three install.sh SUPPORT_SCRIPT_NAMES blocks.
- `scripts/kaola-workflow-replan.js` — owns claim-preserving re-plan epochs: prepare from a settled typed review outcome, fence ordinary mutation, request the planner-authored child (`workflow-plan.next.md`), verify the candidate/claim-root/frontier CAS seams, snapshot the parent epoch, journal activation, resume crash prefixes, and extend the consent ceiling one slot at a time. Ported per forge (`kaola-{gitlab,gitea}-workflow-replan.js`).
- `scripts/kaola-workflow-run-chains.js` — runs the validation chains and writes the receipt; diff-scopes chain selection in finalize context (see Validation Policy). Ported per forge.

## Running Tests
```bash
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".

Two tiers. `test:kaola-workflow:claude` is the **fast gate** (~6.5 min): every cheap step at full coverage, but the three heavyweight suites run a rotating 1/12 slice and six non-samplable suites are deferred. `test:kaola-workflow:claude:full` runs everything.

For any **cross-edition** diff (see Validation Policy), run all four chains sequentially:
```bash
npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && \
  npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
```
`test:kaola-workflow:claude:full` is **never mandated — in any case, including a release receipt.** The fast gate is sufficient evidence everywhere; the full tier is an opt-in diagnostic you reach for deliberately. See `docs/conventions.md` § Two validation tiers for exactly what the fast gate skips.

## Documentation Update Checklist

- [ ] README.md - update feature list, usage examples, env vars
- [ ] API docs - add/update endpoint descriptions and examples
- [ ] CHANGELOG.md - add entry under [Unreleased]
- [ ] Architecture docs - update if structure changed
- [ ] .env.example - add any new environment variables
- [ ] Inline comments - update where public interfaces changed

## Commands

- Install: `./install.sh --forge=github` (Claude Code), `--forge=gitlab` (GitLab edition), or `--forge=gitea` (Gitea edition). `./install-all.sh --forge=github` installs all four runtimes in one pass (Claude + Codex + opencode + Kimi); `./install-opencode.sh` and `./install-kimi.sh` install those additive runtime editions alone.
- Test: `node scripts/simulate-workflow-walkthrough.js` and `npm test`.
- Lint/typecheck/build: unknown (Node scripts only, no formal pipeline).
- Dev server: not applicable.

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and relevant surrounding conventions immediately before editing or creating files.
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Goal-driven execution: Define verifiable success criteria before starting. Keep the tests in separate custody from the code they judge — whoever implements a behavior does not author its tests. Loop until criteria pass; don't declare done on weak signals.
- Verify facts, don't fabricate: do not guess API/library behavior, interfaces, or signatures — confirm them against documentation, source, or a run before relying on them. Do not claim to understand code, errors, or requirements you have not verified; name what you do not know and find out.
- Reuse before adding: before writing a new interface, search for an existing equivalent and extend it rather than duplicate functionality.
- Escalate irreversible changes: do not unilaterally make hard-to-reverse changes or alter a user-owned contract (public API, schema or data migration, dependency or build-tooling swap, deletion of working capability); state the decision and its evidence, then get confirmation before proceeding.
- **Keep provenance out of agent-facing prompts.** Agent definitions, commands, and skills carry the *rule*, never its origin — no issue refs, decision IDs, invariant tags, or ADR citations in those surfaces. Provenance belongs in `CHANGELOG.md`, `docs/decisions/`, and commit messages. Runtime target-issue variables (`KAOLA_TARGET_ISSUE=N`, `"issue N"`) are not provenance. See `docs/conventions.md`.

## Validation Policy

- Background hooks (subagent-dispatch-log) are advisory; do not re-run their checks redundantly.
- Verify with `node scripts/simulate-workflow-walkthrough.js` before claiming workflow-related changes complete.
- **Cross-edition diffs require all four chains green.** A diff touching the edition trees (`plugins/kaola-workflow-{gitlab,gitea}/`, the codex/forge contract validators, or any edition-port script) MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green — run sequentially — recorded before Finalization. A green claude chain alone is **insufficient evidence**: `npm test` chains the four with `&&`, so it short-circuits on the first failure and a red codex/gitlab/gitea chain behind a green claude one is never reached. See `docs/conventions.md`.
- **`kaola-workflow-run-chains.js` applies that rule automatically at finalize.** In finalize context (`--project`/`--plan`, no `--chains`/`--mock-chain` override) it diff-scopes the chain selection: a non-edition-touching diff runs the `claude` chain alone, and an edition-touching diff — or an unresolved diff base — fails closed to all four. The rule itself is unchanged; only who evaluates it moved from the operator to the producer. A release tag always requires the full, unwaived four-chain receipt regardless of scope.
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
