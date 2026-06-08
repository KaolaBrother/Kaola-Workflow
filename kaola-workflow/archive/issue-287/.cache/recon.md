# Recon Evidence — node `recon` (code-architect, read-only) — issue #287

Role: code-architect. Read-only. No source files written. Deliverable = boundary-token placement map de-risking the two frozen write sets.

## Headline: frozen write sets are SUFFICIENT for every AC. No freeze break.

The single binding condition: the new boundary token + carve-out must be **forge-neutral** (no `kaola-workflow-*.js` script name — the only thing gitlab/gitea forks rewrite). Status tokens `ready_to_run`/`plan_invalid`/`AUTHOR EXACTLY`/`planner_control_boundary_violation` are all forge-neutral, so ONE `assertIncludes` needle pins all three adapt commands.

## Refusal vocabulary + carve-out (byte-agreement contract — author MUST write verbatim, pin MUST match)

- Refusal token (forge-neutral, snake_case, matches `workflow_path_refused`/`target_occupied` style):
  `planner_control_boundary_violation`
- Carve-out sentence (forge-neutral, no script name):
  > The `AUTHOR EXACTLY` / pre-shaped-DAG dispatch prompt is allowed ONLY when re-dispatching the planner after `handoff_status: plan_invalid` on an UNFROZEN plan, with the validator errors supplied as repair context; in every other case the planner refuses with `planner_control_boundary_violation`.
- Recommended cross-edition pin needle = the bare token `planner_control_boundary_violation`.

## Deliverable 1 — author-boundary's 5 files (anchors)

1. `agents/workflow-planner.md` (199 lines):
   - PRESERVE provenance comment lines **7–14** (`kaola-workflow-managed-agent: true`, `locally-authored: true`, note). validate-vendored-agents.js treats this as a LOCAL agent (asserts frontmatter@byte0, closing `\n---\n`, `name: workflow-planner`, `model:`, `kaola-workflow-managed-agent: true`). Do not disturb frontmatter (1–5) or managed marker (line 8). Insert below line 14.
   - Refusal prose anchor: the "Hard boundary — never dispatch, never judge risk" section (lines 33–50) — add as sibling boundary.
   - Return contract: "Output contract — the structured return" (lines 163–198) — add refusal object alongside claim-refusal/plan_invalid.
   - Carve-out anchor: "Overwrite-guard carve-out (frozen vs unfrozen)" bullet lines **105–111** (already distinguishes frozen do-not-overwrite vs unfrozen+invalid MAY-overwrite). Phrase consistently.
   - Do NOT delete existing pinned tokens: line 580 `NOT acquired/owned`, line 627 `EFFICIENT DAGs`.
2. `commands/kaola-workflow-adapt.md` (139 lines):
   - Planner-first ordering → "Front end: claim + author" section, around lines 87–88 (after "Once main is clean, summon the workflow-planner"); reinforce line 52 "main session never runs the claim or the authoring write itself".
   - AC5 task-list timing → "Establish the task list, then hand off" (lines 129–139); gate task-list creation on `handoff_status: ready_to_run` + reading frozen plan. Repair carve-out echoes already at lines 59–61 + 126.
   - Do NOT break pinned tokens: `subagent_type="workflow-planner"` (94), `model="{WORKFLOW_PLANNER_MODEL}"` (96), `NOT acquired or owned` (107), `do not blind-read` (109), `ready_to_run` (124), `plan_invalid` (126).
3+4. gitlab/gitea adapt commands are **FORKS** (diff confirmed): differences = script-name tokens (`kaola-gitlab-workflow-*.js` / `kaola-gitea-workflow-*.js`), kaola_script plugin-path arm, minor prose nits. Insert the SAME forge-neutral boundary prose (identical bytes for the inserted text).
5. `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md` (161 lines, codex-only — no gitlab/gitea adapt SKILL.md exists): anchors lines 101–148 (Front end), 111–115 (Re-entry/unfrozen), 156–160 (task list). Already says "do NOT run the claim or author the ## Nodes table inline" (103–105).

## Deliverable 2 — byte-mirror validator pair

`scripts/validate-workflow-contracts.js` ≡ `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (cmp IDENTICAL, 629 lines). Enforced by `validate-script-sync.js`: `validate-workflow-contracts.js` in COMMON_SCRIPTS (line 49); sync loop asserts `!a.equals(b)` fails (line 154). pin-contracts MUST edit BOTH copies identically.

## Deliverable 3 — AC6 per-edition coverage (decisive)

- `scripts/validate-workflow-contracts.js` currently pins adapt/planner tokens ONLY for the Claude edition: adapt command lines 568–579 (`subagent_type="workflow-planner"`, model, `NOT acquired or owned`, `do not blind-read`, `ready_to_run`, `plan_invalid`); planner agent 562–564, 580, 627. The ONLY gitlab/gitea command refs are PHASE commands via `routedFixFiles` (lines 148–162) — NOT the adapt command. Hypothesis CONFIRMED: gitlab/gitea adapt = UNCOVERED by this validator.
- DE-RISK: `routedFixFiles` loop (159–162) is UNCONDITIONAL and pins tokens against gitlab/gitea command files cross-edition from the Claude validator via `assertIncludes(path, needle)` (paths resolve from repo root, line 7). pin-contracts ADDS, in the Claude validator (in write set):
  1. `assertIncludes('commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation')`
  2. `assertIncludes('plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation')`
  3. `assertIncludes('plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation')`
  4. `assertIncludes('agents/workflow-planner.md', 'planner_control_boundary_violation')`
- The per-edition gitlab/gitea validators (validate-kaola-workflow-gitlab/gitea-contracts.js) already pin their own adapt commands' PRE-#287 tokens (gitlab 500–509, gitea 505–509) but are NOT in the write set → do NOT edit them. Cross-edition #287 pin comes from the Claude validator (routedFixFiles precedent).
- `scripts/validate-kaola-workflow-contracts.js` (codex validator, 495 lines, FORK — not byte-identical): skills[] loop (70–91, includes 'kaola-workflow-adapt' line 80) pins generic presence only. pin-contracts ADDS:
  5. `assertIncludes('${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md', 'planner_control_boundary_violation')`

## Deliverable 5 — test wiring

- `scripts/validate-workflow-contracts.js`: `test:kaola-workflow:claude` (package.json line 36) + required/re-exec'd inside simulate-workflow-walkthrough.js (lines 6624/6639/6689). Byte-twin enforced by validate-script-sync.js.
- `scripts/validate-kaola-workflow-contracts.js`: `test:kaola-workflow:codex` (line 37) + referenced by plugins codex walkthrough line 611.
- Run FULL `npm test` before sink (codex/gitlab/gitea validators run ONLY under npm test, not bare simulate-workflow-walkthrough.js).
- Helper: `assertIncludes(file, needle)` = `assert(norm(read(file)).includes(norm(needle)))`, `norm = s.replace(/\s+/g,' ')` (whitespace-insensitive). Use assertIncludes (NOT assertConcept) for exact token pin.

## Freeze-sufficiency verdict: SUFFICIENT for AC1–AC6. No file outside the two frozen write sets. Proceed to open both write nodes.

Residual style note for code-review: gitlab/gitea adapt #287 pins live in the Claude validator (routedFixFiles precedent), not the per-edition validators — established counter-precedent, not a blocker.
