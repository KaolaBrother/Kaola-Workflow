edit-map for n1-plan
evidence-binding: n1-plan d98ae85ebe36

## Provenance caveat (read first)
`gh` is NOT available in the n1 sandbox, so the raw issue #634 body could not be read there. The FROZEN `workflow-plan.md` Plan Notes were treated as authoritative and every cited seam VERIFIED against current source. The ONE under-specified point — the exact `optimize(<id>)` block SYNTAX — is flagged in Risks. ORCHESTRATOR RESOLUTION: the issue D2 block syntax was read by the main session and MATCHES §B's proposed indented block exactly:
```
optimize(<node-id>):
  metric_command: <cmd>
  metric_paths: <comma list>
  direction: min|max
  budget_iterations: <int>
  budget_wallclock_minutes: <int>   # optional; default = tier wait budget
  regression_gate: <cmd>            # optional; default = Meta validation_command
  metric_repeats: <int>             # optional; default 1 (median-of-K)
  min_delta: <num>                  # optional; default 0 (absolute metric units)
  patience: <int>                   # optional; consecutive rejects before early stop
```
metric_command output contract: prints `metric: <number>` at column 0, last-match-wins. Risk #1 is CLOSED — n2 implements this grammar.

All cited line numbers below were opened and confirmed against the worktree source.

---
## A. File-by-file edit list (n2's 29-file write set)

### Group 1 — CANONICAL scripts that need REAL edits (edit by hand)
Only FOUR canonical scripts carry logic; the rest of the ×4 copies are produced mechanically (Group 4/5).

**1. `scripts/kaola-workflow-adaptive-schema.js`** (byte-identical ×4 anchor)
- Caps cluster at `LOOP_CAP` :276, `TEST_THRASH_LIMIT` :277, `MERGE_CONFLICT_REPAIR_LIMIT` :285, `MAX_NODES` :316-323. ADD `const OPTIMIZE_ITER_CAP = 50;` and `const OPTIMIZE_WALLCLOCK_CAP = 120;` after MAX_NODES :323.
- Export in `module.exports` (:1103-1197) beside `MAX_NODES` (:1148).
- OPTIONAL (recommended): ADD a PURE `parseMetricValue(text)` mirroring `parseNodeVerdict` (:451) — column-0 `^metric:[ \t]*(-?\d+(?:\.\d+)?)`, `g`-flagged, LAST-MATCH-WINS, returns `{ found, metric:<number>|null }`. Export beside `parseNodeVerdict` (:1165). Makes D2's metric contract machine-checkable + one-sourced.

**2. `scripts/kaola-workflow-plan-validator.js`** (GENERATED aggregator — canonical hand-edited, ports regen)
- **D1 role membership**: `CANONICAL_ROLES` :151-162 add `'metric-optimizer'`; `WRITE_ROLES` :168 add; `IMPLEMENT_ROLES` :169 add. Do NOT touch `GATE_VERDICT_ROLES` :183. `IMPLEMENT_ROLES.has → producesCode()` true (:780) ⇒ G1 (:1643) + G3 (:1663-1665) inherit post-dominance, ZERO gate-plumbing (AC1).
- **D6 evidence row**: `ROLE_TOKEN_REGISTRY` :191-199 add `'metric-optimizer': ['evidence-binding','metric_baseline','metric_final','iterations_used','regression-green'],`. Exported :3069, imported by adaptive-node :594/:651/:1153 as open-time seed — author ONCE here.
- **D2 optimize parser**: ADD `function parseOptimizeContracts(content)` next to Meta parsers (`parseSpeculativePolicy` :395, `parseWriteOverlapPolicy` :405, `parseValidationCommand` :416) — read `classifier.sectionBody(content,'Meta')`, return `Map<nodeId,contract>`. Export beside `parseSpeculativePolicy` (:3056).
- **OPT-1..6** (§C): OPT-1/2/3/4/6 as `errors.push('OPT-N: …')` after nodes parsed (~:1291 where `n.writeSet` available); **OPT-5** in gates block inside `if(sink)` after G3 (:1666) reusing `gateUncovered`. Accumulate → `{result:'refuse',reason:'plan_invalid',errors}` (:1778).
- `computePlanHash` (:1175-1180) already normalizes the WHOLE Meta body ⇒ optimize block plan_hash-covered for free ⇒ AC2 by construction. No hash change.

**3. `scripts/kaola-workflow-resolve-agent-model.js`** (byte-identical ×4 anchor)
- `DEFAULT_AGENT_MODELS` :8-28 (last `synthesizer:'opus'` :27). ADD `'metric-optimizer': 'sonnet',` (standard tier). Exported :214.

**4. `scripts/kaola-workflow-adaptive-node.js`** (GENERATED aggregator)
- **Dispatch + wait-budget override**: `buildDispatch(nodeInfo,context)` :1196-1245. `...waitBudgetMinutes(nodeInfo.model)` :1218 is the sole `wait_budget_minutes` set. After it: if `ctx.budget_wallclock_minutes` positive → `d.wait_budget_minutes = ctx.budget_wallclock_minutes`, `d.wait_budget_source='optimize_budget'`; conditionally attach `d.optimize = ctx.optimize` (mirror `goal_line` :1230 / `leg_path` :1238 so non-optimize cards stay byte-identical).
- **Thread contract into openers**: runOpenNext :2033, fused runCloseAndOpenNext :2538, runOpenReady :4721. Import `parseOptimizeContracts`; when target role is `metric-optimizer`, pass `ctx.optimize=contract` + `ctx.budget_wallclock_minutes`. buildDispatch exported :6391.

### Group 2 — CANONICAL scripts declared but expected NO-OP (barrier upper bound)
- **`scripts/kaola-workflow-next-action.js`** — `computeNextAction` :45 builds readySet with `model: node.model || resolveModel(node.role)`; metric-optimizer is ordinary IMPLEMENT node; no dispatch card built. No logic change (GENERATED_AGGREGATOR + barrier upper bound).
- **`scripts/kaola-workflow-commit-node.js`** — per-node barrier is NET-DIFF, commit-count-indifferent (D5); ≥3 intermediate commit/revert need ZERO change. No logic change.

### Group 3 — CANONICAL test files (hand-edited)
- **`scripts/simulate-workflow-walkthrough.js`** — in-process `pv.validatePlan(content)`; assert `in-grammar` on accept, `refuse`+reason/errors regex on refuse; CLI freeze via runNode(...,['--freeze']). ADD: AC1 in-grammar example (optimize node freezes green + inherits G1/G3), OPT-1..6 accept+refuse fixtures (§C), AC5 barrier-indifference (§F), AC4 verifier-reproduction (§E). Write six OPT refuse cases RED first.
- **`scripts/test-agent-model-resolver.js`** — ADD `resolveAgentModel('metric-optimizer',{agentDir:<empty tmp>})` → `'sonnet'` (mirror :33 tdd-guide case).
- **`scripts/test-adaptive-node.js`** — ADD case driving `buildDispatch({id,role:'metric-optimizer',...},{budget_wallclock_minutes:60,optimize:{…}})` → assert `wait_budget_minutes===60` + `wait_budget_source==='optimize_budget'` + optimize attached; control card (no budget) stays default.
- **`scripts/test-next-action.js`** — likely NO new case (no behavior change); barrier upper bound.
- **`scripts/test-commit-node.js`** — likely NO new case; AC5 net-diff lives in walkthrough.

### Group 4 — GENERATED aggregator ports (DO NOT hand-edit; `npm run sync:editions` regenerates)
`edition-sync.js` :46-55 GENERATED_AGGREGATORS = plan-validator, next-action, adaptive-node, commit-node; renderForgePort :89-104 renames `kaola-workflow-X`→`kaola-<forge>-workflow-X`. 12 ports (codex byte-copy + 2 renamed forge each). Action: after 4 canonical edits run `npm run sync:editions`; do NOT hand-touch.

### Group 5 — BYTE-IDENTICAL group ports (DO NOT hand-edit; `sync:editions --write` byte-copies)
`validate-script-sync.js` BYTE_IDENTICAL_GROUPS — adaptive-schema copies :178-183, resolve-agent-model copies :132-137 (6 ports; resolve-agent-model NOT renamed). Action: `npm run sync:editions --write`; validate-script-sync proves parity.

**Net for n2**: hand-edit 4 canonical scripts + up to 5 canonical test files (2 likely no-op) = ~7 real edits; remaining 18 edition copies produced by ONE `npm run sync:editions [--write]`. Barrier checks declared ⊇ actual, so over-declaring no-op members is legal.

---
## B. optimize() Meta grammar + parser design
- Home: `parseOptimizeContracts(content)` in plan-validator.js via `classifier.sectionBody(content,'Meta')`.
- Return: `Map<nodeId,{ metric_command, metric_paths:[…], direction, budget_iterations, budget_wallclock_minutes|null, regression_gate|null, metric_repeats:1, min_delta:0, patience|null }>`.
- Defaults: metric_repeats 1, min_delta 0; wallclock/regression_gate/patience optional (null absent).
- `metric: <number>` output contract: column 0, LAST-MATCH-WINS (mirror parseNodeVerdict :451-463).
- Block syntax CONFIRMED against issue D2 (indented block keyed by node id — see header resolution). Hash-safe: computePlanHash :1176-1178 trims+filters+joins-in-order the Meta body → field values covered, reorder flips hash (AC2). Parser reads RAW Meta body so indentation available for block-scoping.

---
## C. OPT-1..OPT-6 — invariant · marker · fixtures
All emit `errors.push('OPT-N: …')` ⇒ `{result:'refuse',reason:'plan_invalid'}`. Each fixture = fully-valid optimize plan with ONE field mutated.
- **OPT-1** 1:1 metric-optimizer↔optimize block. ACCEPT one node+block. REFUSE (a) node no block; (b) optimize(nX) nX absent or role≠metric-optimizer.
- **OPT-2** metric_paths non-empty AND disjoint from declared_write_set (AC3; normalize via classifier.normalizeRepoPath). ACCEPT paths=bench/suite.js write=src/hot.js. REFUSE shared path (or empty).
- **OPT-3** 1≤budget_iterations≤50 and (present) wallclock≤120. ACCEPT 20/60. REFUSE 51/0 or 121.
- **OPT-4** direction∈{min,max}, metric_repeats≥1, min_delta≥0. ACCEPT min/3/0.5. REFUSE down (or 0, or -1).
- **OPT-5** change-gate adversarial-verifier post-dominates every optimize node (AC4): `gateUncovered(nodes, n=>n.role==='metric-optimizer','adversarial-verifier',sink)` empty. Post-dominance over producesCode optimize ⇒ advVerifierIsChangeGate :811 true ⇒ non-exempt from --verdict-check. ACCEPT verifier on optimize→sink path. REFUSE optimize reaches sink w/o adversarial-verifier post-dominator.
- **OPT-6** regression_gate present OR inherited from Meta validation_command (parseValidationCommand :416). ACCEPT block omits but Meta has validation_command. REFUSE neither.

---
## D. Evidence contract
- ROLE_TOKEN_REGISTRY row (authored ONCE, plan-validator :191-199, exported :3069, seeded by adaptive-node): `'metric-optimizer': ['evidence-binding','metric_baseline','metric_final','iterations_used','regression-green']`.
- checkEvidenceShape/verifyVerdictBlock require each token NON-EMPTY. n3 agent profile mirrors the five tokens verbatim.
- Per-iteration log line (D4): `iter <k>: <metric> <accepted|rejected> <summary>` per iteration (accepted AND rejected).

---
## E. Dispatch-card threading + wait-budget override
- Single builder buildDispatch in adaptive-node.js :1196-1245 (next-action has none). wait_budget set solely by waitBudgetMinutes(nodeInfo.model) :1218.
- Override: ctx.budget_wallclock_minutes positive → wait_budget_minutes = it, wait_budget_source='optimize_budget'. Existing wait-budget ladder applies (no daemon).
- ctx.optimize attached conditionally (mirror goal_line :1230 / leg_path :1238).
- Threaded from openers runOpenNext :2033, fused :2538, open-ready :4721 via parseOptimizeContracts(planContent) keyed on target node id.
- D7 (AC4): optimize plan whose adversarial-verifier posts verdict:fail blocks finalize via --verdict-check (advVerifierIsChangeGate :811 true). Walkthrough asserts this.

---
## F. Barrier-indifference proof points (D5 / AC5)
- Per-node barrier barrierCheck net-diff (declared ⊇ actual, snapshot→snapshot), NOT commit-count-aware; --leg-barrier anchored leg-base→HEAD range; --group-barrier --merge-commit base→M on COMMITS. None counts intermediate commits.
- Characterization test (walkthrough): metric-optimizer leg with ≥3 intermediate commit/revert cycles + UNCHANGED declared_write_set passes per-node net-diff + --leg-barrier + commit-based --group-barrier. NO barrier machinery change.

---
## G. Risks / ambiguities
1. optimize() block SYNTAX — RESOLVED by orchestrator (matches issue D2; see header). n2 implements §B grammar.
2. Cap VALUES 50/120 — issue proposed defaults; no existing constant conflicts (LOOP_CAP=5, TEST_THRASH=3, MAX_NODES=200 unrelated). Authoritative.
3. parseMetricValue in schema.js is a RECOMMENDATION; plan says "mirror parseNodeVerdict discipline". Clean reuse-consistent way to make metric contract machine-assertable; low risk either way.
4. next-action.js + commit-node.js declared but expected NO-OP (barrier upper bound). If a real edit is needed, surface it — do not invent a change to satisfy the declaration.
5. OPT reason-code style: recommend OPT-N: errors-array idiom (matches G1/G2/G3, no new reason codes).
6. Downstream (n3/n4): metric-optimizer ABSENT everywhere in code today (grep hit only 3 docs) → every registration surface is an ADD. n3 mirrors the FIVE evidence tokens verbatim; keep plugin .toml prose forge-neutral + provenance-free. Forge CONTRACT validators + test-{gitlab,gitea}-workflow-scripts.js are HAND-PORTS with role/count/parity assertions (distinct from generated aggregator ports) — genuine hand-edits for the new role count.
7. #307 four-chain: cross-edition diff — all four chains green (sequential). n2 runs claude chain after sync:editions; n4 records full four-chain green; n6 re-runs independently.

map-complete: 29 files mapped (4 canonical-edit + 2 canonical no-op + 5 canonical tests + 12 generated ports + 6 byte-copy ports), OPT-1..6 all fixtured
