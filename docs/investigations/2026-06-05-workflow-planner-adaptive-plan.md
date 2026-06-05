# Implementation Plan — `workflow-planner` Front-End Subagent for the Adaptive Path

**Owner-approved direction 2026-06-05. Adaptive path only. Repo root:
`/Users/ylpromax5/Workspace/Kaola-Workflow`. Current release v5.0.0 (#243).**

This plan consolidates the discovery-workflow blueprint **plus** the completeness
critic's three blocking corrections **plus** the owner's "task list = workflow nodes"
requirement. It is the implementation contract; build green-at-each-step.

---

## 1. What we are building (and why)

**The bug the owner hit.** Running the adaptive workflow via **the skill**, the claim
("starting contract") and the DAG design ran *inline* in the main session — no subagent.
Root cause: the adaptive **command** (`commands/kaola-workflow-adapt.md`) carries 3
enforced `Agent(subagent_type=…)` blocks, but the adaptive **skill**
(`plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`) carries **zero** — it is
advisory prose ("consult the planner…", "the contractor *runs*…"). A skill-driven run
follows the weak prose and does everything inline.

**The fix the owner chose.** A NEW locally-authored **`workflow-planner`** agent (Opus;
tools `Read/Write/Bash/Grep/Glob`) that the **main session dispatches ONCE** at the start
of the adaptive path. It:
1. runs claim/startup → creates the worktree + `workflow-state.md` (durable);
2. proposes **and authors** the `## Nodes` DAG + an empty `## Node Ledger` into
   `workflow-plan.md` via `Write` (durable);
3. runs the plan-validator `--json` (self-check) and **returns** a structured summary.

The **main session** then reads durable state **from files**, does git-freshness,
**governs** the risk decision (auto-run / ask-the-user / typed-refusal), and the
**contractor** stamps the freeze (`--freeze` + planning-evidence checkpoint + per-issue
roadmap). After freeze, **main establishes a task list = the DAG nodes**, then hands to
`plan-run`, whose loop updates that task list node-by-node.

**Owner decisions locked (2026-06-05):**
- Freeze + risk-ask stay with **main** (workflow-planner returns the verdict; main governs;
  contractor freezes).
- workflow-planner owns **claim + design** (the full starting contract).
- Scope: **adaptive only**, wired across **all 4 editions** (github/gitlab/gitea/codex) and
  **both** command + skill surfaces.
- Task list **is** the workflow nodes (1 task per node row, DAG order, status mirrored from
  the `## Node Ledger`).

**Hard constraint (issue #44):** subagents cannot dispatch subagents. `workflow-planner`
is a *front-end* subagent — it returns control to main; main owns **all** dispatch and
**all** judgment. It is DISTINCT from the vendored read-only `planner` agent (which stays
byte-untouched and keeps serving as an in-plan **node** role).

---

## 2. Three blocking corrections from the completeness critic (verified against source)

These were either wrong or missing in the first-pass blueprint and are now folded in.

### C1 — `claim.js` DOES need a change: signal the adaptive path into the subagent's claim
`scripts/kaola-workflow-claim.js:420` and `:469` compute the path as
`args.workflowPath || process.env.KAOLA_PATH || 'full'`, but `--workflow-path` is **never
parsed** (`grep -c -- '--workflow-path'` = 0) — the flag is half-wired. Today the router
exports `KAOLA_PATH=adaptive` in the **main** shell before its inline startup. Move the
claim into a **subagent** and that env var no longer reaches it → `requestedPath` defaults
to `'full'`, the project is stamped `workflow_path: full`, the OFF-switch toggle-refusal
(`:422-430`) never fires, and resume routing (which keys on `workflow_path: adaptive`,
`:575/:596`; `workflow-next.md:317`) breaks.

**Fix (chosen — option a, "finish the half-wired flag"):** add `--workflow-path` parsing to
`parseArgs` (populating `args.workflowPath`); the workflow-planner passes
`--workflow-path adaptive` explicitly in its `startup` command (a CLI arg is robust — no env
inheritance needed). Apply to the root `claim.js` + the 3 forge claim ports. This corrects
the blueprint's "no claim.js change" decision.

### C2 — Two codex agent-TOML count literals assert exactly 11 (the 12th TOML breaks them)
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:1955` and
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:1995` assert
`'should install 11 agent TOML files'`. Bump both 11→12 (and the contract validators at
gitlab `:139` / gitea `:138`). These four are the **only** agent-count literals (github lane
uses a self-bumping exact-set assert).

### C3 — Resume of a frozen adaptive project must NOT re-author over the plan
`workflow-next.md:317` already routes `workflow-plan.md exists → /kaola-workflow-plan-run`
ahead of any phase/adapt consideration. The NEW adaptive router branch must be
**subordinate to resume detection**: it fires **only for a fresh claim with no existing
`workflow-plan.md`**. Additionally, `workflow-planner` must **refuse-and-return (never
overwrite)** if `workflow-plan.md` already exists, leaving the route to main. Mirror the
guard in the `kaola-workflow-next` skill branch.

**Plus (should-fix):** add a regression assertion that the adapt **skill** keeps the
enforced workflow-planner + contractor-freeze delegation (so it can't silently drift back to
advisory prose — the exact bug we're fixing). **Plus (minor, accept by precedent):**
`workflow-planner.md` will be admitted into the validator's node-role library exactly as
`contractor.md` already is — note it; do not add an exclusion (surgical scope).

---

## 3. The task list = the workflow nodes (owner requirement)

- **Establish** (in `adapt`, immediately after the contractor freezes the plan): main builds
  a task list with **one item per node row** of the frozen `## Nodes` table, labeled
  `id · role`, in `depends_on` topological order. The task list **is** the DAG.
- **Update** (in `plan-run`'s loop): the contractor *advance* bracket opening a node →
  mark that task `in_progress`; the *commit* bracket completing it → `completed`; `n/a`
  nodes → skipped.
- **Guardrail:** the task list is a **live in-session mirror** for driving + showing
  progress. The durable `## Node Ledger` (contractor-written) remains the **single source of
  truth**; the task list is derived from it and never competes with it.
- Lands in: `adapt` (establish) + `plan-run` (update) command + skill, github + gitlab +
  gitea command mirrors + the github skill + codex plan-run skill.

---

## 4. Build order (dependency-respecting; run the gate after each step)

1. **Agent + guarding asserts (ride together):** create `agents/workflow-planner.md`;
   add `'workflow-planner'` to `validate-vendored-agents.js` `localAgents`; add
   `'workflow-planner':'opus'` byte-identically to all **4** `resolve-agent-model.js` copies.
   → `node scripts/validate-vendored-agents.js` + script-sync green.
2. **Install/registration wiring:** `install.sh` (REQUIRED_AGENTS; `default_agent_model`
   → opus; `model_for_placeholder` `WORKFLOW_PLANNER_MODEL`; `placeholders[]`);
   `uninstall.sh` REQUIRED_AGENTS. → install/uninstall smoke emits `workflow-planner→opus`.
3. **`claim.js` `--workflow-path` flag (C1):** add parsing to `parseArgs` in the root
   `claim.js` + 3 forge ports. Document the **two-mode handoff contract** (success → main
   reads files; refusal → no state file, main acts on the return) in the agent body + adapt
   prose. → walkthrough still green.
4. **github command + skill (the enforcement):**
   `commands/kaola-workflow-adapt.md` — prepend the enforced
   `Agent(subagent_type="workflow-planner", model="{WORKFLOW_PLANNER_MODEL}", …)` block;
   replace planner-propose + main-author prose; absorb contractor-classify but **re-run
   governance classify on the durable plan**; **keep contractor-freeze verbatim**; add the
   "main reads files → git-freshness → govern → **establish task list = nodes**" step.
   `skills/kaola-workflow-adapt/SKILL.md` — same dispatch **as prose role-name (no model
   token)**; bring contractor classify/freeze to enforced parity. → `assertEveryDispatchHasModel` green.
5. **gitlab/gitea command mirrors + codex profiles:** the 2 forge `adapt` commands
   (`-gitlab-`/`-gitea-` basenames); 3 codex `agents/workflow-planner.toml` (xhigh) +
   3 `config/agents.toml` `[agents.workflow-planner]`; bump **4** count literals
   (gitlab validator `:139`, gitea validator `:138`, gitlab test `:1955`→12, gitea test
   `:1995`→12). gitea `skillFiles` **stays 9**. → forge contract + script tests green.
6. **Router adaptive branch (C3):** `workflow-next.md` + `kaola-workflow-next` skill — when
   `KAOLA_PATH==adaptive` **and no existing `workflow-plan.md`**, skip the Step 0b inline
   claim and route to `/kaola-workflow-adapt` (which owns the dispatch); **subordinate to
   Resume Detection**; recover `KAOLA_CLAIM`/`KAOLA_PROJECT` by re-reading state; preserve
   the L22 router-no-dispatch invariant; non-adaptive (fast|full) path unchanged.
7. **plan-run task-list updates:** `plan-run` command + skill (+ forge command mirrors +
   codex skill) — mark each node's task `in_progress`/`completed` in the advance/commit
   brackets.
8. **Tests:** `test-install-model-rendering.js` (`requiredAgents += workflow-planner` +
   `manifest→opus` in both profile blocks); skill-enforcement regression assert (C3 should-fix);
   `simulate-workflow-walkthrough.js` two-mode-contract + adaptive-stamp coverage.
   → `node scripts/simulate-workflow-walkthrough.js` exits 0; `npm test` green on all 4 lanes.
9. **Docs + version:** ADR `0003-adaptive-front-end-planner.md` (supersedes 0002's
   adaptive-authoring + bootstrap-exception portions); `architecture.md` L46; `api.md`
   Workflow-Planner subsection; `README.md` roster row + badge + version lines; `CHANGELOG.md`;
   `CLAUDE.md` note. Version bumps: `package.json` + 2 `.claude-plugin/plugin.json` + 3
   `.codex-plugin/plugin.json`.

---

## 5. `workflow-planner` agent spec (`agents/workflow-planner.md`)

```
---
name: workflow-planner
description: Adaptive-path front-end planner. Dispatched ONCE by main at the start of the
  adaptive path. Runs claim/startup (worktree + workflow-state.md), authors the ## Nodes DAG
  + empty ## Node Ledger into workflow-plan.md via Write, runs the plan-validator --json, and
  RETURNS a structured summary. Never freezes, never asks the user, never judges risk, never
  dispatches a subagent. Distinct from the read-only vendored planner node role.
tools: ["Read", "Write", "Bash", "Grep", "Glob"]
model: opus
---
<!-- kaola-workflow-managed-agent: true / locally-authored: true (mirror contractor.md L7-14) -->

## Prompt Defense Baseline   (copy verbatim from agents/contractor.md)

You are the **workflow-planner**: the adaptive front-end. Main dispatches you ONCE.
HARD BOUNDARY (#44): a subagent cannot dispatch a subagent — you return control to main.

In order:
1. node <claim.js> startup --runtime claude [--sink …] --workflow-path adaptive --target-issue N
   (creates worktree + kaola-workflow/{project}/workflow-state.md). Re-derive your own
   kaola_script. Capture the real exit code; never gate on a piped | tail.
   IDEMPOTENCY: if kaola-workflow/{project}/workflow-plan.md ALREADY exists, do NOT author —
   refuse-and-return so main routes to plan-run (never overwrite a frozen plan).
2. Author via Write the ## Meta + ## Nodes DAG + empty ## Node Ledger (one row/node,
   status: pending) into kaola-workflow/{project}/workflow-plan.md.
3. node <plan-validator.js> …/workflow-plan.md --json  (CAPTURE only — you do NOT govern).
4. RETURN the structured summary.

HARD prohibitions: no --freeze; no authoring-allowed as a gate (main owns it); no user
questions; no risk judgment; no subagent dispatch; no pull/rebase (git-freshness is main's).

RETURN: { project, worktree_path (echo of Sink value, '' if none),
  claim_verdict (acquired|owned|<refusal-status>), claim_reasoning (verbatim, '' on success),
  plan_path (…/workflow-plan.md, or null if refused/plan-exists),
  validator_verdict (verbatim --json, or null) }
```
Codex parity: `plugins/*/agents/workflow-planner.toml` (all 3 packs) —
`model_reasoning_effort = "xhigh"` + `developer_instructions` encoding the same contract
(tool scoping is prose-only; Codex TOML has no tools field).

---

## 6. Durable handoff contract (two-mode) — no fragile prose→bash

`claim.js` change is limited to the `--workflow-path` flag (C1); all success-path values are
already persisted.

- **Mode A — success (`acquired`|`owned`):** FILES are authoritative; the return is a thin
  pointer. Main re-reads `workflow-state.md` (`## Sink` branch/issue/sink/worktree_path,
  `## Project`, `## Current Position` `workflow_path: adaptive`) + `workflow-plan.md`
  (internalizes the DAG) and **re-runs the validator on the durable plan** for governance
  (the planner's captured `--json` is orientation only — freeze-integrity rests on the re-run).
- **Mode B — refusal:** NO `workflow-state.md` exists (refusal returns before the single
  `writeState`). The return is the SOLE carrier of `claim_verdict`+`claim_reasoning`; main
  detects refusal by the **absence** of the state file and acts on the reasoning (must not
  blind-read state). `worktree_path` empty ⟺ repo-root run — do not fabricate a path.
- **Two intentional double-runs** (annotate so a reviewer doesn't "optimize" them away):
  (1) `authoring-allowed` by main + defense-in-depth inside `claimProject`; (2) validator
  `--json` by the planner (self-check) + re-run by governance classify (freeze-integrity).
- `watch-pr` stays a **main**, pre-dispatch call (global PR reconciliation, not project-scoped).

---

## 7. File inventory (~38 files, 4 editions)

New (5): `agents/workflow-planner.md`; `plugins/{kaola-workflow,-gitlab,-gitea}/agents/workflow-planner.toml` (3); `docs/decisions/0003-adaptive-front-end-planner.md`.

Edited, grouped:
- **Agent/registration (shared):** `validate-vendored-agents.js`; `resolve-agent-model.js` ×4
  (byte-identical); `install.sh`; `uninstall.sh`; `test-install-model-rendering.js`;
  (optional) `test-install-adaptive-config.js`.
- **claim.js (C1):** root `kaola-workflow-claim.js` + github-plugin copy + 2 forge ports
  (`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`).
- **adapt (enforcement + establish task list):** `commands/kaola-workflow-adapt.md`;
  `skills/kaola-workflow-adapt/SKILL.md`; `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-adapt.md`.
- **plan-run (task-list updates):** `commands/kaola-workflow-plan-run.md`;
  `skills/kaola-workflow-plan-run/SKILL.md`; the 2 forge plan-run commands; codex plan-run skill.
- **router (C3):** `commands/workflow-next.md`; `skills/kaola-workflow-next/SKILL.md`.
- **codex profiles + counts:** 3 `config/agents.toml`; gitlab/gitea contract validators
  (`:139`/`:138` → 12); gitlab/gitea script tests (`:1955`/`:1995` → 12).
- **docs/version:** `architecture.md`, `api.md`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`,
  `package.json`, 2 `.claude-plugin/plugin.json`, 3 `.codex-plugin/plugin.json`.

---

## 8. Top traps (do not regress)
1. `install_managed_agent()` rewrites installed frontmatter to `model: inherit`; the Opus
   badge flows ONLY via `.kaola-agent-models.json` + `{WORKFLOW_PLANNER_MODEL}` substitution +
   runtime `DEFAULT_AGENT_MODELS`. Never rely on installed frontmatter.
2. `{WORKFLOW_PLANNER_MODEL}` in a COMMAND without both install.sh list additions → literal
   token survives → `test-install-model-rendering.js` fails. In a SKILL → ships literal
   (skills are never rendered) → skill uses **prose role-name, no model token**.
3. `resolve-agent-model.js` byte-identical ×4 or script-sync fails first.
4. Forge counts: gitlab/gitea `agentFiles` 11→12 (validators **and** script tests); gitea
   `skillFiles` stays 9.
5. Vendored `planner.md`/`planner.toml` stay byte-untouched (separate file + node role).
6. Freeze-integrity: governance re-runs the validator on the durable plan; never freeze on
   the planner's captured `--json`.
7. Refusal path: no state file — branch on `claim_verdict`, don't blind-read state.
8. Adaptive router branch is subordinate to Resume Detection; workflow-planner refuses if a
   plan already exists (C3) — never overwrite a frozen plan.

---

## 9. Open items for owner confirmation
- **Version bump:** root `5.0.0 → 5.1.0` (additive new agent + enforced dispatch);
  codex packs `3.0.0 → 3.1.0`. (Recommended. A major is defensible only if the
  bootstrap-relocation is treated as breaking.)
- **gitlab/gitea scope:** SCOPED — enforce in existing surfaces; do **not** manufacture new
  gitlab/gitea adapt/plan-run *skills* (they don't exist today; that's a feature, not this
  fix). A separate pre-existing dangling-reference gap (gitea adaptive-schema/repair-state
  point at non-shipped skills) is flagged for a **follow-up parity PR**, not this change.
- **ADR:** new `0003` superseding 0002's adaptive-authoring + bootstrap-exception portions
  (vs in-place amend). Recommended: new 0003.
