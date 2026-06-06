# Node: plan (planner) — IMPLEMENTATION BLUEPRINT — issue #255 (2-state, script-owned handoff)

## Scope contract (supersedes stale parts of explore.md)
2-state model. ONLY outcomes: `ready_to_dispatch_first_node`, `plan_invalid`, idempotent re-run → ready again.
Do NOT reintroduce `needs_user_approval`, terminal `typed_refusal`, `--authorized`, `risk_authorized`.
Branch on validator `--json` **`result`** (`in-grammar`|`refuse`), never on `decision`. `decision:ask` is audit
metadata that freezes-and-proceeds; never pauses.

### Physical CRASH-SAFE write order (binding)
One idempotent transaction; recovery = re-run from top.
1. validator `--json` → branch on `result`. (`refuse` → return `plan_invalid`, exit≠0, NO mutation; stop.)
2. `--freeze` (writes plan_hash; idempotent re-stamp). FIRST mutation.
3. `--resume-check` (integrity gate on just-frozen plan).
4. `next-action` (read; first ready node + model) — PURE via require.
5. baseline via `commit-node --node-id <id> --start` (writes .cache barrier-base; reuses if present).
6. ledger node1 pending→in_progress in workflow-plan.md (ledger is OUTSIDE plan_hash; hash-safe).
7. roadmap init-issue (+ git add) (EEXIST-skips).
8. workflow-state.md `## Planning Evidence` insert — LAST.
State pointer (## Current Position) NOT flipped (startup already set next_command: /kaola-workflow-plan-run).

---
## A. impl-handoff — scripts/kaola-workflow-adaptive-handoff.js + scripts/test-adaptive-handoff.js

### A.1 CLI
`node kaola-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]`
- `--project NAME` → plan=`kaola-workflow/<NAME>/workflow-plan.md`, state=sibling `workflow-state.md`, repo-root relative.
- `--plan PATH` → project = basename(dirname(resolve(planPath))); state = sibling.
- Exactly one of --project/--plan; neither/both → early refuse `{handoff_status:'plan_invalid',errors:['exactly one of --project or --plan required']}` exit 1.
- `--json` required (else usage, like commit-node/next-action).
- `--state-mtime ISO` optional injectable clock → `recorded_at`; when omitted, OMIT recorded_at (no `new Date()`).
- Sibling path constants (mirror commit-node 31-37, resolve via __dirname):
  VALIDATOR='kaola-workflow-plan-validator.js'; COMMIT_NODE='kaola-workflow-commit-node.js';
  ROADMAP='kaola-workflow-roadmap.js'; NEXT_ACTION require('./kaola-workflow-next-action').

### A.2 Pure core + seams
Export `runHandoff({planPath,statePath,project,json, shell, computeNextAction, resolveModel, readFile, writeFile, stateMtime})`.
Pure vs shelled:
- shelled: validator --json; --freeze --json; --resume-check --json; commit-node --node-id id --start --json; roadmap init-issue + `git add`.
- PURE: next-action via computeNextAction(planContent,{resolveModel}); ledger splice; Planning Evidence splice (writeFile).
Default `shell` = copy of commit-node `shellValidator` (execFileSync node, {exitCode,...safeJsonParse(stdout)}, capture err.stdout, fail-closed). Export as `shellHandoff`.

### A.3 Return — both branches
in-grammar (auto-run OR ask) → exit 0:
`{handoff_status:'ready_to_dispatch_first_node', checklist:{claim_acquired,plan_in_grammar,plan_frozen,resume_check_ok,first_node_opened,baseline_recorded,roadmap_staged ALL true}, first_node:{id,role,model,declared_write_set}, decision, risk}`.
NO risk_authorized. decision/risk copied verbatim from --json (audit metadata).
refuse → exit≠0 (process.exitCode=1), NO mutation (return BEFORE step 2):
`{handoff_status:'plan_invalid', result:'refuse', errors, validator_verdict:<full --json blob>}`.

### A.4 Checklist truth sources
- claim_acquired: handoff does NOT claim; truth = workflow-state.md exists+parseable. Missing/empty → plan_invalid `errors:['workflow-state.md missing — planner did not claim']`, NO mutation (fail closed).
- plan_in_grammar: validator --json result==='in-grammar'.
- plan_frozen: --freeze --json frozen===true.
- resume_check_ok: --resume-check --json ok===true.
- first_node_opened: ledger write ok AND node1 now in_progress (or already in_progress).
- baseline_recorded: commit-node --start result==='ok' (covers reused:true).
- roadmap_staged: true if init-issue printed created:/skip: AND git add ran; vacuously true when no issue_number linked.
If plan_frozen/resume_check_ok/baseline_recorded false after its step → hard infra failure → plan_invalid w/ step output, exit≠0.

### A.5 Planning Evidence insert (updateState NOT exported — claim.js 1212-1230)
Implement own guarded in-place section splice (do NOT require claim, do NOT writeState).
Anchor: insert/replace `## Planning Evidence` immediately BEFORE `## Last Updated` (fallback before `## Sink`; final fallback append EOF). → `## Sink` + trailing optional fields preserved by construction.
Idempotent replace not append:
```
const SECTION='## Planning Evidence';
const block=SECTION+'\n'+fields.join('\n')+'\n\n';
const existing=new RegExp('## Planning Evidence\\s*\\n[\\s\\S]*?(?=\\n## |\\s*$)');
let next = existing.test(content) ? content.replace(existing, block.trimEnd())
  : (content.indexOf('\n## Last Updated')>=0 ? splice-before-LastUpdated : before ## Sink else append);
```
Field schema (deterministic):
```
## Planning Evidence
plan_hash: <64-hex from --freeze planHash>
decision: <auto-run|ask>
risk: sensitivity=<bool> blast_radius=<bool> uncertain=<bool> reasons=<;-joined or —>
first_node_id: <id>
first_node_role: <role>
[recorded_at: <ISO>]   # OMITTED when --state-mtime absent
```

### A.6 Ledger write (surgical status-cell)
`## Node Ledger` is OUTSIDE plan_hash (validator 146-148) — post-freeze write is hash-safe (CODE COMMENT this).
Locate node1 row like parseLedger (validator 150-164): split body |-rows, parse header for id+status col idx, find row id===first_node.id, replace ONLY status cell (preserve extra cols). Don't regenerate.
GUARD = write iff current status==='pending'. If already in_progress → leave (first_node_opened:true). If complete/n-a → handoff past its job (resume belongs to plan-run); contract boundary, not a defended code path beyond pending-guard.

### A.7 Idempotency
--freeze re-stamps SAME hash (injectHash 716-719); baseline reuses (847-855 reused:true); init-issue EEXIST-skip; ledger guarded; Planning Evidence replace-in-place. Re-run of completed handoff → ready without double-write/double-open.

### A.8 test-adaptive-handoff.js (mirror test-commit-node.js)
Hand-rolled assert+counters; require('./kaola-workflow-adaptive-handoff')→{runHandoff,shellHandoff}; exit 1 iff failed>0 else "adaptive-handoff tests passed (N assertions)".
Most cases drive runHandoff with stub seams (no subprocess): shell stub keyed on (scriptPath,args) → canned blobs; real computeNextAction + stub resolveModel; in-memory readFile/writeFile; stateMtime undefined.
- T1 (REGRESSION): validator stub {result:'in-grammar',decision:'ask',planHash:'a'*64,risk{blastRadius:true}}; freeze{frozen:true,planHash}; resume{ok:true}; commit{result:'ok'} → assert handoff_status==='ready_to_dispatch_first_node' (NOT needs_user_approval), decision==='ask', checklist ALL true, risk echoed, NO risk_authorized key.
- T2: in-grammar+auto-run → ready, all true.
- T3: validator {result:'refuse',errors} → plan_invalid, errors surfaced, validator_verdict present, writeFile NEVER called (no mutation), exit nonzero.
- T4 (no issue): state has no issue_number → roadmap_staged:true vacuous, ready.
- T5 (idempotent): plan already node1 in_progress; freeze same hash, baseline reused:true, init-issue skip → ready, ledger byte-identical, Planning Evidence single (not duplicated).
- T6 (Sink preserved): state has ## Sink w/ trailing pr_url:/worktree_path: → after insert assert ## Sink byte-identical + ## Planning Evidence before ## Last Updated.
- T7 (precondition): state missing → plan_invalid unclaimed error, no mutation.
- T8 (shellHandoff seam): stub validator in os.tmpdir exiting 1 w/ canned JSON → assert shellHandoff captures {exitCode:1,...parsed}. temp git repo finally fs.rmSync.

---
## B. impl-wire
1. Byte-identical mirror plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js (sibling consts resolve via __dirname; no edits). gitlab/gitea forge ports NOT in #255 COMMON_SCRIPTS scope.
2. validate-script-sync.js COMMON_SCRIPTS (39-56): add `'kaola-workflow-adaptive-handoff.js',` after `'kaola-workflow-commit-node.js'` (line 55); add // #255 note.
3. package.json test:kaola-workflow:claude (line 36): insert `&& node scripts/test-adaptive-handoff.js` BETWEEN test-commit-node.js and test-release-surface-drift.js.
   → `... && node scripts/test-commit-node.js && node scripts/test-adaptive-handoff.js && node scripts/test-release-surface-drift.js && ...`

---
## C. impl-planner-profile (agents/workflow-planner.md + 3 .toml mirrors)
### C.1 agents/workflow-planner.md
(a) frontmatter desc (line 3): "...self-check, then RUNS the adaptive-handoff script (freezes mechanically on result:in-grammar) and RETURNS its checklist-backed handoff packet. Never JUDGES risk and never asks the user — decision:ask is recorded audit metadata, not a gate. Never dispatches a subagent."
(b) boundary heading (33): "## Hard boundary — never dispatch, never judge risk; freeze is mechanical (issue #44, #255)".
(c) "never freeze" bullet (40-42) → "You run the handoff, which freezes mechanically. After self-check is in-grammar, you RUN kaola-workflow-adaptive-handoff.js (Method step 4). It stamps plan_hash (--freeze) only because validator returned result:in-grammar — mechanical transition, not judgment. You don't decide to freeze; the script does it on in-grammar."
(d) "never judge risk/ask" bullet (43-45) → "You never judge risk and never ask the user. decision:auto-run vs ask is recorded by the handoff as audit metadata and the run proceeds either way — no pre-handoff approval gate. The orchestrator does not pause on ask. You make the plan in-grammar, run the handoff, return the packet."
(e) Method step 3 (103-109): final sentence → "Do not run authoring-allowed (the orchestrator owns it). Freezing is now done by the handoff in step 4, not here."
(f) Method step 4 (replace current "4. Return"):
  "4. Run the handoff (mechanical). Once in-grammar: `node <adaptive-handoff.js> --project {project} --json`. It freezes, resume-checks, opens node1 (ledger in_progress), records the node1 baseline, stages the roadmap, writes Planning Evidence into workflow-state.md (preserving ## Sink). Returns a checklist-backed packet. You do NOT judge its decision/risk fields — audit metadata.
   5. Return. Hand the handoff packet back and stop. On handoff_status:plan_invalid (validator refuse) return the packet verbatim — the ORCHESTRATOR drives the bounded repair loop; you do not retry/redesign unasked."
(g) overwrite-guard carve-out (Method step 1 idempotency, 91-93):
  "Overwrite-guard carve-out (frozen vs unfrozen): if workflow-plan.md exists AND has a plan_hash marker (<!-- plan_hash: … -->) it is FROZEN — do NOT overwrite; STOP and return (orchestrator routes to executor). If it exists with NO plan_hash it is unfrozen+invalid — when the orchestrator re-dispatches you with validator errors (repair loop), you MAY overwrite it with a corrected DAG. Detect frozen by the literal <!-- plan_hash: <64-hex> --> marker (or --resume-check --json ok:true)."
(h) output contract (123-137): planner returns EITHER claim-refusal object (unchanged) OR the handoff packet (ready: {handoff_status,checklist,first_node,decision,risk}; refuse: {handoff_status:'plan_invalid',result:'refuse',errors,validator_verdict}). On claim refusal (no state file) returns {claim_verdict,claim_reasoning}, never reaches handoff.

### C.2 the 3 .toml mirrors (BYTE-IDENTICAL — codex + gitlab + gitea), single developer_instructions=""" multi-line string:
- boundary block (8-13): heading "Hard boundary (issue #44, #255 — never dispatch, never judge risk; freeze is mechanical):"; replace never-freeze bullet → "Freeze is mechanical: after self-check is in-grammar you RUN the adaptive-handoff script, which stamps plan_hash (--freeze) BECAUSE validator returned result:in-grammar. You don't decide to freeze; the script does it on in-grammar."; replace judge/ask bullet → "Never judge risk and never ask the user — decision:auto-run vs ask is audit metadata recorded by the handoff; the run proceeds either way (no approval gate)."
- Method (14-19): step1 append carve-out (frozen w/ plan_hash → STOP; unfrozen → repair loop may overwrite). step3 → "Do NOT run authoring-allowed. Freezing is done by the handoff in step 4." Add step4: "Run the adaptive-handoff script (kaola-…-workflow-adaptive-handoff.js --project {project} --json) — freezes, resume-checks, opens node1, records baseline, stages roadmap, writes Planning Evidence (preserving ## Sink). Return its checklist-backed packet; don't judge decision/risk." Renumber old step4 Return→step5; add "On handoff_status:plan_invalid return verbatim — orchestrator drives the bounded repair loop."
- output contract (21-23): replace success object with handoff packet shape; keep refusal line.
- FORGE-NEUTRAL: keep handoff reference identical across all 3 toml (e.g. "the adaptive-handoff script"); do NOT embed forge-specific script name. VERIFY 3 remain byte-identical after edit (cross-edition drift anchor).

---
## D. impl-adapt-contract (replace "Govern + freeze" in 4 editions)
### D.1 commands/kaola-workflow-adapt.md (GitHub)
(D.1a) re-entry pointer (160-167): replace 162-165 → "but an authored-but-NOT-frozen plan does — if {project}'s workflow-plan.md exists with NO plan_hash (a prior validator refuse left it unfrozen), re-run the planner+handoff on it (the planner MAY overwrite an unfrozen invalid plan; never a frozen one), passing prior validator errors. Do NOT route to a separate freeze step — the handoff freezes mechanically."
(D.1b) dispatch prompt tail (line 204): "(4) Run plan-validator <plan> --json self-check, fix until in-grammar — do NOT run authoring-allowed. (5) Run kaola-workflow-adaptive-handoff.js --project {project} --json (freezes, resume-checks, opens node1, records baseline, stages roadmap, writes Planning Evidence; decision:ask is recorded metadata, not a gate). RETURN its handoff packet {handoff_status,checklist,first_node,decision,risk} on ready, or {handoff_status:'plan_invalid',result:'refuse',errors,validator_verdict} on validator refuse."
(D.1c) REPLACE entire ## Govern + freeze section (heading 226 → before line 266 ## Establish the task list) with new `## Read the handoff packet` section:
  - ready_to_dispatch_first_node (all checklist true) → dispatch first_node.role w/ model="<first_node.model>" scoped to first_node.declared_write_set, IMMEDIATELY (even when decision:ask, no approval gate) → then /kaola-workflow-plan-run {project}.
  - plan_invalid (validator refused; plan never froze, NOTHING written) → bounded REPAIR loop: re-dispatch workflow-planner w/ verbatim errors/validator_verdict so it overwrites the unfrozen plan w/ a corrected DAG + re-runs handoff. Retry ~2x (counter lives in orchestrator, NEVER in script). After repeated failure: REAL decision — downgrade to full path / discard+restart adaptive (`kaola-workflow-claim.js discard --project {project}` then fresh adaptive start) / STOP + surface concrete blocker w/ validator evidence. Never silently loop.
  (Drops both contractor Agent() blocks, the governs rubric, auto-run/ask/typed-refusal branch, separate freeze dispatch.)
(D.1d) planner-boundary one-liner (193): "it never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches."

### D.2 port to other 3 (same D.1a/b/c/d, preserve structure)
- gitlab/commands/kaola-workflow-adapt.md (heading 224): kaola-workflow-*.js → kaola-gitlab-workflow-*.js; "GitHub issue"→"GitLab issue"; "PR"→"MR".
- gitea/commands/kaola-workflow-adapt.md (heading 224): → kaola-gitea-workflow-*.js; "GitHub issue"→"Gitea issue"; "PR" stays.
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md (inline 140-160, NO heading, NO Agent() blocks, bare names, condensed): replace the two Govern+freeze paragraphs (140-155) w/ condensed "Read the handoff packet" prose (ready→dispatch first_node immediately even on ask→plan-run; plan_invalid→bounded repair loop→real decision). ALSO fix SKILL re-entry pointer (~99-104): "go straight to Govern + freeze" → "re-run the planner+handoff (planner may overwrite an unfrozen plan); the handoff freezes mechanically." Update SKILL line-97 boundary one-liner like D.1d.
- VERIFY: grep `Govern + freeze` and `freeze + checkpoint` after editing — both GONE in all 4.

---
## E. impl-sim (scripts/simulate-workflow-walkthrough.js)
New testAdaptiveHandoff*() fns near adaptive cases (after validatePlanFixture ~808+), define `handoffScript` next to planValidatorScript, call via runNode+JSON.parse+assert. ONLY 3 real outcomes (NO needs_user_approval/typed_refusal).
- testAdaptiveHandoffInGrammarReady(): plant project w/ workflow-state.md + UNFROZEN in-grammar auto-run plan (code-explorer→tdd-guide→code-reviewer→finalize). git init + initial commit in tmp (for record-base). Run handoff --project. Assert handoff_status ready, all checklist true, first_node.id==='explore', model non-empty, decision==='auto-run'; plan now has <!-- plan_hash:; node1 ledger in_progress; .cache barrier-base-explore exists.
- testAdaptiveHandoffAskFreezesNotApproval() (REGRESSION): plant write-role fanout(impl) shape that validates decision:ask. Run handoff. Assert ready (NOT needs_user_approval), decision==='ask', all checklist true, NO risk_authorized, plan froze.
- testAdaptiveHandoffRefuseNoMutation(): plant out-of-grammar (post-dominance leak / missing sink). Snapshot plan bytes. Run. Assert plan_invalid, result refuse, errors non-empty, validator_verdict present, exit≠0; plan byte-identical (no plan_hash); no ## Planning Evidence; no .cache barrier-base; no .roadmap/issue-*.
- testAdaptiveHandoffIdempotentReRun(): run in-grammar handoff TWICE. Assert 2nd also ready, plan_hash unchanged, node1 single in_progress, ## Planning Evidence exactly once (replaced not appended), init-issue 2nd no-op (roadmap_staged:true).
Register 4 calls ~line 6853 before console.log('Workflow walkthrough simulation passed').

---
## F. docs
- README.md: scripts entry for kaola-workflow-adaptive-handoff.js (checklist-backed planner→first-node handoff; in-grammar→freeze+resume-check+open node1+baseline+roadmap+Planning Evidence(preserve ## Sink)→ready_to_dispatch_first_node; refuse→plan_invalid no mutation; decision:ask audit metadata freezes-and-proceeds, no approval gate). Near commit-node/next-action entries.
- CLAUDE.md Key Scripts: add line after commit-node entry: "scripts/kaola-workflow-adaptive-handoff.js — adaptive aggregator: collapses contractor classify/freeze/orient/advance into ONE mechanical transition. Branches on validator result (in-grammar→freeze+resume-check+open node1+baseline+roadmap+Planning Evidence→ready_to_dispatch_first_node; refuse→plan_invalid, no mutation). decision:ask is audit metadata, not a gate. RUN by the workflow-planner; orchestrator drives the bounded repair loop on plan_invalid."
- CHANGELOG.md: NEW [Unreleased] entry (do NOT edit historical line 321): "Added kaola-workflow-adaptive-handoff.js: script-owned checklist-backed adaptive planner→first-node handoff (ADR 0004/#255)... freezes mechanically on result:in-grammar, fails closed no mutation on refuse. decision:ask is recorded audit metadata that freezes-and-proceeds (no pre-handoff approval gate). Planner profile + all 4 adapt editions updated; mirror + script-sync + test wiring."
- docs/api.md line 489 (planner desc): docs-exempt → doc-updater MAY update to new "RUNS handoff; never JUDGES risk; decision:ask metadata" boundary.
- DEFER (do NOT edit): plugins/kaola-workflow/config/agents.toml line 60 (production, out-of-lane → trips whole-plan barrier). Finalize-time follow-up note.

---
## Cross-cutting
- Frozen detection = literal <!-- plan_hash: <64-hex> --> (validator 486, 716-719). Drives planner carve-out (C) + adapt re-entry (D).
- Ledger outside hash (146-148) — post-freeze ledger write hash-safe (CODE COMMENT).
- updateState NOT exported (claim.js 339-345,1212-1230) — guarded section splice (A.5).
- .toml byte-identity across 3 mirrors = cross-edition drift anchor; keep handoff ref forge-neutral; verify after edit.
- Verify: node scripts/simulate-workflow-walkthrough.js (exit 0), node scripts/test-adaptive-handoff.js, node scripts/validate-script-sync.js, npm test.

Evidence note: read-only planner node; no production files written. Blueprint above IS the deliverable.
n/a: RED/GREEN — planner is a read-only design node (no test cycle applicable).
