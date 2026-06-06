# Node: explore (code-explorer) — issue #255 handoff surface map

Read-only exploration. Findings cited file:line. **Two corrections applied to the raw
agent report** (it fabricated example values): the real validator `risk` fields are
BOOLEANS, and `next-action` returns the SHORT model alias.

## 1. plan-validator.js governance interface (VERIFIED against real output)

- `--json` (default validate): `{ result:'in-grammar'|'refuse', decision:'auto-run'|'ask',
  planHash, sink, nodeCount, risk:{ sensitivity:BOOL, blastRadius:BOOL, uncertain:BOOL, reasons:[] } }`.
  **Real observed blob:** `{"result":"in-grammar","decision":"ask","planHash":"6e54...","sink":"finalize",
  "risk":{"sensitivity":false,"blastRadius":true,"uncertain":false,"reasons":["declared write set touches SHARED_INFRA"]},"nodeCount":10}`.
  Exit 1 iff `result==='refuse'`.  (validator main ~line 800; decision at line 676; risk object line 679.)
- `--freeze` (with `--json`): emits `{ result, decision, planHash, frozen:BOOL, risk, errors }`
  (NOT the stamped `content`). Writes plan_hash into the file iff in-grammar. Idempotent:
  `injectHash` replaces an existing marker, re-freeze returns same hash + `frozen:true`. (lines 817-821.)
- `--resume-check --json`: `{ ok:BOOL, planHash }` or `{ ok:false, reason }`. Hash + library +
  structure only, NOT the full gate rubric. (lines 687, 811-816.)

## 2. next-action.js (VERIFIED)

`--json`: `{ result:'ok', readySet:[{id,role,dependsOn,model,declared_write_set,shape}], nextNode:{...}|null, allDone:BOOL }`
or `{ result:'refuse', errors }`. `model` is the SHORT alias from resolve-agent-model
(real: `"sonnet"`). allDone+empty readySet => ok (phase6 signal). stalled => refuse. Exit 1 on refuse.

## 3. commit-node.js (VERIFIED)

- `--node-id ID --start --json` => `{ result:'ok', mode:'per-node-start', nodeId, recordBase:{result,nodeId,base,reused?}, overallOk:true }`.
  (Real observed: base=`55dc91...`, exit 0.) Idempotent (#239) — reuses baseline.
- `--node-id ID --json` (per-node end) => barrierCheck blocking, gateVerify+verdictCheck informational.
- The handoff records the first node's baseline by shelling **commit-node ... --node-id <id> --start --json**
  (NOT the validator directly), per issue step 8.

## 4. claim.js state writes — THE GAP (why #255 exists)

`writeState(root,data)` (lines 285-336) emits fixed sections in order: `## Project`,
`## Current Position`, `## Pending Gates`, `## Last Evidence`, `## Last Updated`, `## Sink`
(+ optional trailing `worktree_path`/`worktree_error`/`pr_url`/`pr_number`, lines 332-335).
**No `## Planning Evidence` section exists and no subcommand writes one** — today the contractor
hand-edits, non-deterministically. The handoff MUST write it deterministically.
**Surgical seam:** `updateState(root, project, updater)` (lines 339-345) — read-modify-write used
by cmdPatchBranch. The handoff must use this (or an equivalent careful section insert), NOT
`writeState` (which regenerates and would drop ## Sink trailing optional fields). Confirm whether
`updateState` is exported by claim.js; if not, the handoff implements a guarded section insert that
preserves `## Sink` byte-for-byte.

## 5. roadmap.js init-issue (VERIFIED)

`cmdInitIssue` (lines 286-311): args `--issue N --title TEXT --status open --workflow-project NAME
--next-step adaptive`. Idempotent via `createFileExclusive` (openSync 'wx'); EEXIST => `skip:` + returns false.
Produces `kaola-workflow/.roadmap/issue-N.md` with `issue/title/status/workflow_project/next_step`.

## 6. "Govern + freeze" contractor section to REPLACE (4 editions)

- `commands/kaola-workflow-adapt.md`: `## Govern + freeze` heading line 226; classify contractor lines 235-242;
  freeze+checkpoint contractor lines 258-265.
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`: heading line 224; same 2-dispatch structure;
  forge tokens `kaola-gitlab-workflow-*.js`, "GitLab issue"/"MR".
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`: heading line 224; forge tokens `kaola-gitea-workflow-*.js`, "Gitea issue".
- `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`: NO `## Govern + freeze` heading;
  inline bold prose lines 140-160 (classify 140-143, freeze 150-155); bare script names; condensed.
- GitHub/GitLab/Gitea structurally identical (forge-renamed tokens only); SKILL.md condensed.

## 7. Planner #44 boundary text to shift (PRIMARY = in declared write-sets)

- `agents/workflow-planner.md`: `## Hard boundary — never dispatch, never judge, never freeze (issue #44)` line 33,
  body 34-48 (the "never freeze … --freeze is a governance act the main session owns" bullet).
- `plugins/kaola-workflow/agents/workflow-planner.toml`: hard boundary lines 8-13, prose inside a single
  `developer_instructions = """..."""` multi-line string (newline-dash bullets, no TOML arrays).
  GitLab + Gitea `.toml` BYTE-IDENTICAL to the codex one (confirmed).
- Also `commands/kaola-workflow-adapt.md` line 193 + SKILL.md line 97 ("it never freezes, judges risk, asks…")
  — in declared write-sets (adapt contracts).

### SECONDARY boundary-description sites NOT in any declared write lane (scope note)
- `docs/api.md` line 489 (planner description) — under `docs/` => **isDocsPath-exempt** => the `docs`
  node (doc-updater) can update it safely without tripping the barrier.
- `plugins/kaola-workflow/config/agents.toml` line 60 (description field) — **production, out-of-lane**;
  editing trips the whole-plan barrier. DEFER to a follow-up (note at finalize) OR confirm exemption.
- IMMUTABLE historical records — do NOT rewrite: `agents/contractor.md` line 32 (that's the CONTRACTOR's
  own boundary, unrelated), `docs/decisions/0003-*` line 42, `CHANGELOG.md` line 321 (add a NEW entry instead).

## 8. validate-script-sync.js COMMON_SCRIPTS

Array lines 39-56; last entry `'kaola-workflow-commit-node.js'`. Insert `'kaola-workflow-adaptive-handoff.js'`
right after it. Checked only between `scripts/` and `plugins/kaola-workflow/scripts/` (Claude<->Codex).

## 9. package.json

`test:kaola-workflow:claude` line 36. Insert `&& node scripts/test-adaptive-handoff.js` between
`test-commit-node.js` and `test-release-surface-drift.js`.

## 10. Test harness pattern (test-commit-node.js / test-next-action.js)

Hand-rolled `assert(cond,msg)` with passed/failed counters; require the module + call pure cores
directly (`combineResults`, `computeNextAction`); stub validator written to `os.tmpdir()` and injected
via the exported `shellValidator` seam; fixture builder `makePlan(nodeRows, ledgerRows)`; exit 1 iff failed>0
else print "<name> tests passed". For test-adaptive-handoff.js: export a pure `runHandoff(opts)` + a shell
seam; temp git repo for record-base; `finally fs.rmSync(tmp,{recursive:true})`.

## 11. Walkthrough sim (simulate-workflow-walkthrough.js, 6864 lines)

Adaptive cases start line 623. Helpers: `adaptiveTmp(slug)` (630-633), `validatePlanFixture(...)` (~800-808).
Case fns call the script via execFileSync + JSON.parse + assert; registered in order at lines 6827-6853;
insert new `testAdaptiveHandoff*()` calls at ~6853 before final `console.log('Workflow walkthrough simulation passed')` (6854).
Add cases for the 4 outcomes: ready_to_dispatch_first_node / needs_user_approval / typed_refusal / idempotent-resume.

## 12. Executor dovetail (commands/kaola-workflow-plan-run.md lines 68-84)

Resume branches: in_progress+absent/partial .cache => re-dispatch role; in_progress+COMPLETE .cache+barrier
not run => commit bracket ONLY (lines 73-75); unfrozen plan => route to /kaola-workflow-adapt. **Handoff
contract:** open node1 `in_progress` + record baseline; then orchestrator dispatches node1 role; then
plan-run resume sees in_progress+complete-cache => commit bracket. Handoff NEVER shells the commit bracket.
Only non-idempotent step = the in_progress ledger write — GUARD it (skip if already in_progress).

## Handoff script shape (recommended) — REVISED per 2 newest owner comments (2026-06-06)

**SIMPLER 2-state design. No risk-based pre-handoff stop gate. `decision:ask` is audit metadata only,
NOT a user-approval pause. NO `--authorized` flag, NO `needs_user_approval`, NO terminal `typed_refusal`.**

- CLI: `--project NAME` (or `--plan PATH`) `--json`. Derive plan path from project.
- Branch on validator `--json` **`result`** (not `decision`):
  - `result: in-grammar` (whether `decision` is auto-run OR ask) =>
    record `decision`/`risk` as METADATA -> `--freeze` -> `--resume-check` ->
    updateState planning-evidence preserving `## Sink` (include decision/risk as audit metadata) ->
    roadmap init-issue (+ git add) -> next-action(first node+model) ->
    mark node1 `in_progress` (GUARDED: skip if already in_progress) ->
    commit-node `--node-id node1 --start` (baseline) =>
    `{ handoff_status:'ready_to_dispatch_first_node', checklist:{claim_acquired, plan_in_grammar,
    plan_frozen, resume_check_ok, first_node_opened, baseline_recorded, roadmap_staged} ALL true,
    first_node:{id,role,model,declared_write_set}, decision, risk }`. (No `risk_authorized` field — there is no risk gate.)
  - `result: refuse` => `{ handoff_status:'plan_invalid', result:'refuse', errors, validator_verdict }`,
    exit≠0, **NO mutation** (no freeze, no ledger/state/roadmap write). Orchestrator loops back to
    workflow-planner for DAG repair/redesign + revalidate. Only after repeated repair failure does the
    orchestrator make a REAL decision (downgrade to full path / discard+restart / surface concrete blocker).
- Crash-safe order: baseline/evidence + ledger row BEFORE the workflow-state.md pointer (state pointer LAST).
- Idempotent/resume-safe: `--freeze` re-stamps same hash; `--record-base` reuses; init-issue EEXIST-skips;
  in_progress ledger write guarded. Re-running a completed handoff returns ready without double-writing.
- Export pure core (`runHandoff(opts)`) + a shell seam; greenfield (no existing handoff file).
- Planner-INVOKED: the workflow-planner RUNS this (mechanical) and returns the packet; never judges.
  On `plan_invalid` the orchestrator (not the planner) drives the bounded repair loop.

## Evidence note
Read-only node; no production files written. Findings above ARE the node deliverable.
n/a: RED/GREEN — code-explorer is a read-only research node (no test cycle applicable).
