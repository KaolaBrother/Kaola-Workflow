# Lean-Orchestrator — Part B Plan (Contractor Offload)

**Date:** 2026-06-04
**Tracking issue:** [#242](https://github.com/KaolaBrother/Kaola-Workflow/issues/242)
**Status:** planned, not started
**Parent plan:** [docs/investigations/lean-orchestrator-contractor-2026-06-04.md](lean-orchestrator-contractor-2026-06-04.md)

This document was produced in issue #242 **run 1** (Part A shipped + Part B planned) by the `code-architect` adaptive node; Part B **implementation is run 2**. Decision-4 (planner-proposes-DAG) is a run-2 evaluation item, not implemented in run 1.

This plan resolves the four open decisions from the parent plan and gives an executable, file-level build order grounded in the actual repo surfaces. It is decision-complete; no TBD.

---

## Decisions summary

| # | Decision | Verdict | One-line rationale |
|---|----------|---------|--------------------|
| 1 | Per-node contractor vs. Opus-calls-aggregator in the adaptive loop | **Direct aggregator in the loop; contractor only at phase 6 + phase 1.** Phases 2–5 bracketing is direct aggregator too. | The per-node step is already script-encapsulated (`commit-node`/`next-action`, #231 "script-enforced, not prose"); the contractor only earns its round-trip on fuzzy/bulky prose+evidence authoring (phase 6 ~715 lines, phase 1 evidence consolidation). |
| 2 | `next-action`/`commit-node`: byte-identical group vs. `COMMON_SCRIPTS` | **`COMMON_SCRIPTS` (plan-validator family), both scripts.** Plus `SUPPORT_SCRIPT_NAMES` in all 3 forge blocks. | Discriminator is forge-coupling, not preference: `commit-node` shells the forge-named `plan-validator` (`--barrier-check`/`--gate-verify`) → renamed gitlab/gitea ports, like `plan-validator.js`. Keep `next-action` in the same family for one coherent registration story. |
| 3 | Contractor profile under `--profile=higher` | **Stay sonnet. No `profiles/higher/contractor.md`.** | Higher raises *judgment* roles to opus; the contractor is explicitly non-judgment. `install_agent_files` already falls back to the base agent when no higher override exists — omission is the correct mechanism. |
| 4 | Delegate DAG *planning* (the `## Nodes` table) to a `planner` subagent | **Keep-as-is (orchestrator authors). Reject the structural change.** Run-2 evaluation; not implemented in run 1. | The propose-without-authoring path already exists (`adapt.md:147`); `planner` has no Write, so it could only *propose*; the orchestrator must comprehend the DAG anyway to govern/freeze/`plan_hash`/dispatch — delegating saves keystrokes, not comprehension. #44 + freeze-integrity confirm. |

---

## Decision detail + rationale

### Decision 1 — Direct aggregator in the loop; contractor at the fuzzy/bulky seams

**Verdict:** Adopt the committed plan's lean. The discriminator, applied uniformly:

- **Script-encapsulated mechanical step → Opus calls the aggregator directly.** Where the procedure is already fully captured by a deterministic script, there is no prose for a contractor to "interpret"; inserting a Sonnet round-trip buys nothing and adds latency. The adaptive per-node barrier is **script-enforced** (#231 — `--record-base` / `--barrier-check` / `--gate-verify` in `plan-run.md:92-164`). So the per-node loop calls `commit-node`/`next-action` directly from the main session.
- **Fuzzy/bulky durable-file authoring from subagent prose + `.cache` evidence → contractor.** Where the work is "read a pile of prose/evidence and author ledger rows / phase files / roadmap notes / closure summaries," a Sonnet contractor compresses real Opus context.

**Seam assignment (this *refines* the committed doc's seam list — flagged explicitly):**

| Seam | Owner | Why |
|------|-------|-----|
| Adaptive node→node handoff (per-node loop) | **Direct aggregator** (Opus calls `commit-node`/`next-action`) | Already script-enforced; highest recurrence — a contractor round-trip *per node* is exactly the cost the tradeoff note warns against. |
| **Phase 6 finalize** (~715 lines) | **Contractor** | The big mechanical block: Step 8a artifact mirror, parse closure receipt, roadmap regen, `cmdFinalize` archive, commit-gate staging. Bulky and prose-heavy. |
| **Phase 1** | **Contractor** | Checkpoint writes / evidence consolidation / phase-file scaffolding — fuzzy synthesis-adjacent authoring. |
| **Phases 2–5 dispatch bracketing** | **Direct aggregator** (refinement of doc's "contractor brackets each dispatch") | Post-dispatch barrier/ledger/state writes are mechanical and script-shaped; the same "script-encapsulated → direct" rule applies. |

**Opus retains** (judgment, never the contractor): governance verdict (auto-run vs. ask vs. typed-refusal per `plan-run.md:67-84`), role dispatch, consent-halt/escalation, and the **sink exit-code + close recheck**. Grounded confirmation: `gh issue close` happens *inside* `sink-merge.js` (exit 0 = "issue closed online", `phase6.md:700`); the Opus recheck is verifying the exit codes (`phase6.md:679-703`) and confirming the issue actually closed (memory: close can exit 0 yet leave the issue OPEN). The mechanical block is cleanly separable from the sink dispatch + exit-code judgment.

**File-plan implication:** the per-node `plan-run` loop and phases 2–5 get **aggregator-script wiring only**; the contractor is invoked **only in `phase6.md` and `phase1.md`** seam text via `model="{CONTRACTOR_MODEL}"`.

### Decision 2 — Both aggregators join the `COMMON_SCRIPTS` (plan-validator) family

**Verdict:** Register `kaola-workflow-next-action.js` and `kaola-workflow-commit-node.js` in `COMMON_SCRIPTS` (`validate-script-sync.js:39-53`), **not** `BYTE_IDENTICAL_GROUPS`. Discriminator (read from the two existing precedents):

- `adaptive-schema.js` is in `BYTE_IDENTICAL_GROUPS` (all 4 trees) **because it `require()`s nothing forge-specific** (forge-neutral constants).
- `plan-validator.js` is in `COMMON_SCRIPTS` (Claude ↔ github-Codex only; gitlab/gitea carry **renamed ports** that `require()` the forge classifier) **because it `require()`s the forge-specific classifier**.

`commit-node` wraps `--barrier-check`/`--gate-verify` — i.e., it shells the **forge-named** `plan-validator`, so it is forge-coupled → follows `plan-validator`'s registration exactly. Keep `next-action` in the same family for one coherent registration story.

**Registration + mirror story (per script, both):**
1. Add the canonical name to `COMMON_SCRIPTS` in `validate-script-sync.js`.
2. Copy the canonical script to `plugins/kaola-workflow/scripts/` (github-Codex) byte-identical.
3. Create gitlab/gitea **renamed ports** that `require()` the forge classifier/validator.
4. **Add to `SUPPORT_SCRIPT_NAMES` in ALL THREE forge blocks of `install.sh`** (github `:142`, gitlab `:167`, gitea `:193`) — github by canonical name, gitlab/gitea by renamed port — or they never install.

### Decision 3 — Contractor stays sonnet; no higher-profile override

**Verdict:** `agents/contractor.md` ships `model: sonnet`; do **not** create `agents/profiles/higher/contractor.md`. The higher profile raises *judgment* roles to opus; the contractor is explicitly non-judgment. `install_agent_files` (`install.sh:336-338`) only substitutes a `profiles/higher/$file_name` when it exists, else falls back to the base agent. **File-plan implication:** Stage B adds one file (`agents/contractor.md`), no profiles file.

### Decision 4 — Keep orchestrator-authors-the-table (reject the structural change); run-2 evaluation only

**Verdict:** Recommend **keep-as-is**. Do not delegate authoring of the `## Nodes` table to a `planner` subagent.

- **What delegation could save:** *authoring*-context (the keystrokes of typing the table). `planner` has tools `Read/Grep/Glob` only (no Write) — it can at most *propose* a table the main session must still write, validate, and freeze.
- **What it cannot save:** *comprehension*-context. The orchestrator must fully internalize the DAG anyway to govern it, own the `plan_hash`'d artifact it freezes, and dispatch each node.
- **The propose-path already exists:** `adapt.md:147-159` already documents an optional `planner` *consult* — "do NOT author the plan table."
- **#44 + documented intent** push the same way.

**Concrete files if adopted (run 2, for completeness — NOT run 1):** the **adapt** surface only — `commands/kaola-workflow-adapt.md` (Claude), gitlab/gitea `commands/kaola-workflow-adapt.md`, `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`. **Not** gitlab/gitea skills (none exist). So **4 files**. Recommendation stands: reject; keep the existing optional consult.

---

## Mirror topology (load-bearing — file counts derive from this, not from "x4")

The four editions are **asymmetric** (counted from the actual tree):

| Surface | Claude command | github-Codex skill | gitlab cmd | gitlab skill | gitea cmd | gitea skill | files/touch |
|---------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **plan-run** | yes | `kaola-workflow-plan-run/SKILL.md` | yes | — | yes | — | **4** |
| **adapt** | yes | `kaola-workflow-adapt/SKILL.md` | yes | — | yes | — | **4** |
| **phase6** | yes | `kaola-workflow-finalize/SKILL.md` | yes | yes | yes | yes | **6** |
| **phase1** | yes | `kaola-workflow-research/SKILL.md` | yes | yes | yes | yes | **6** |

Key facts: (a) the github plugin has **no `commands/` dir** — skills-only; (b) gitlab/gitea carry adaptive **commands** (adapt, plan-run) but have **no adapt/plan-run skill mirrors**; (c) Codex skill mirrors are named by **role** (`finalize`=phase6, `research`=phase1, `execute`=phase4, `plan`=phase2/3, `review`=phase5). The phase6/phase1 seams touch 6 files each; plan-run/adapt seams touch only 4.

---

## Staged, file-level build order

### Stage A — Aggregator scripts (atomicity layer; no command behavior change yet)

`kaola-workflow-next-action.js` — `--json`: ready-set / next node / resolved model for the adaptive loop. `kaola-workflow-commit-node.js` — `--json`: the safe commit choreography in one call — `--record-base` (start) ... `--barrier-check` + `--gate-verify` (end) → ledger row → `workflow-state.md` pointer LAST.

Files: both canonical (`scripts/`); both byte-identical github-Codex copies (`plugins/kaola-workflow/scripts/`); gitlab/gitea **renamed ports**; `validate-script-sync.js` (`COMMON_SCRIPTS`); `install.sh` `SUPPORT_SCRIPT_NAMES` x3 blocks; `test-next-action.js` + `test-commit-node.js`; `package.json` test chain; `simulate-workflow-walkthrough.js`; gitlab/gitea contract validators + walkthroughs. **~16-18 files → ≥3 run-2 nodes.** Shippable independently (no command/skill text changes) → de-risks B.

### Stage B — Contractor agent + installer registration

`agents/contractor.md` (`model: sonnet`, tools `Read/Write/Edit/Bash/Grep/Glob`, managed marker, `name: contractor`); `validate-vendored-agents.js` add `'contractor'` to `localAgents` (`:25`) — exact-set assert (`:53`) fails otherwise; provenance-exempt (no `docs/agents-source.md` row); `install.sh` `REQUIRED_AGENTS` (`:40`), `default_agent_model` (`:399`), `model_for_placeholder` (`:444`, `CONTRACTOR_MODEL`), `render_command_file` placeholders (`:495`); resolver `DEFAULT_AGENT_MODELS` `contractor: 'sonnet'` x4 byte-identical; install-render tests assert `contractor: sonnet` for both profiles.

**Why contractor needs `model_for_placeholder` but `adversarial-verifier` does not:** `adversarial-verifier` is dispatched *dynamically* (runtime-resolved) → lives in `DEFAULT_AGENT_MODELS` + manifest but not `model_for_placeholder`. The contractor is invoked at **known, static seams** (phase6, phase1) carrying a literal `model="{CONTRACTOR_MODEL}"` → behaves like static roles (tdd-guide, code-reviewer), **must** be in `model_for_placeholder` + `render_command_file`. The `emit_agent_model_manifest` loop (`:466`) auto-covers `contractor` once it is in `REQUIRED_AGENTS`. No `profiles/higher/contractor.md`. **~10 files (4 = resolver copies) → ≤2 nodes.**

### Stage C — Seam rewires (mirrored per the asymmetric topology)

- **C1 plan-run node-handoff (aggregator-direct; 4 files):** `commands/kaola-workflow-plan-run.md` (replace inline `--record-base`/`--barrier-check` blocks with `next-action`/`commit-node` calls; loop stays Opus) + github-Codex SKILL + gitlab/gitea commands.
- **C2 phase6 contractor offload (6 files):** `commands/kaola-workflow-phase6.md` (wrap Steps 8a/roadmap/archive/commit in a `contractor` dispatch; Opus keeps Step 9 sink + exit-code branch + close recheck) + finalize SKILL x3 + gitlab/gitea commands.
- **C3 phase1 contractor offload (6 files):** `commands/kaola-workflow-phase1.md` + research SKILL x3 + gitlab/gitea commands.
- **C4 phases 2–5 dispatch bracketing (aggregator-direct, NOT contractor):** Claude `phase{2,3,4,5}.md` + Codex skill mirrors (`plan`/`execute`/`review`) x3 + gitlab/gitea phase commands. **≈20+ files → per-phase nodes.**

C2 and C3 each sit exactly at `FILE_CEILING(6)` → one node each. C4 busts the ceiling → per-phase nodes.

---

## Gates each stage must pass

`validate-script-sync.js` (resolver copies + new COMMON_SCRIPTS byte-identical) — A, B; `validate-vendored-agents.js` (exact set incl. contractor) — B; `validate-workflow-contracts.js` (+ forge variants) — C; `simulate-workflow-walkthrough.js` exit 0 — A, C; full 4-edition `npm test` (manifest `contractor: sonnet` both profiles; renamed ports load; forge walkthroughs) — A, B, C; install dry-run both profiles — B. Parity per the topology map (4 files for plan-run/adapt; 6 for phase6/phase1/phaseN). `verify_real_exit_code` discipline (capture `$?`, never `| tail`). Version bump + CHANGELOG + docs map when interfaces change.

---

## Run-2 authored as an adaptive DAG (rough decomposition)

Run 2 is **large** and should itself split into multiple adaptive runs:

- **Run 2a — Stage A:** `planner` consult → `tdd-guide` (canonical scripts + sync + claude tests) → `tdd-guide` (github-Codex mirror + walkthrough) → `tdd-guide` (gitlab+gitea ports + contracts + install blocks) → `code-reviewer` → `doc-updater` → `finalize`.
- **Run 2b — Stage B:** `code-architect` consult → `tdd-guide` (agent + vendored-validator + REQUIRED_AGENTS/placeholder/DEFAULT) → `tdd-guide` (resolver 4-copy DEFAULT edit + install-render tests) → `code-reviewer` → **`security-reviewer` (G2 — model-resolution/install surface)** → `finalize`.
- **Run 2c — Stage C1+C2:** C1 plan-run (4 files) → C2 phase6 (6 files) → `code-reviewer` → `doc-updater` → `finalize`.
- **Run 2d — Stage C3+C4:** phase1 + per-phase 2–5 nodes, each `code-reviewer`-gated; likely splits into two runs.

Stage B touches the model-resolution/install surface → **sensitive → "ask the user first"** at freeze. Author each plan's `## Nodes` table in the **main session** (Decision 4), optionally consulting `planner`/`code-architect` to *propose* the decomposition.

---

## Cross-cutting acceptance criteria (Part B)

- [ ] Aggregators registered in `COMMON_SCRIPTS` + all 3 `SUPPORT_SCRIPT_NAMES` blocks; renamed gitlab/gitea ports load + pass forge contracts.
- [ ] `agents/contractor.md` (`model: sonnet`) installs; `contractor` in `localAgents`, `REQUIRED_AGENTS`, `model_for_placeholder`, `render_command_file`, `DEFAULT_AGENT_MODELS` (x4 byte-identical); manifest emits `contractor: sonnet` for both profiles; no higher profile file.
- [ ] Adaptive loop + phases 2–5 call aggregators directly; phase6 + phase1 dispatch the contractor; Opus retains governance + sink exit-code + close recheck.
- [ ] All gates green; parity per the asymmetric topology.
- [ ] Version bumped; CHANGELOG updated; docs map updated for the two new scripts + the contractor boundary.
