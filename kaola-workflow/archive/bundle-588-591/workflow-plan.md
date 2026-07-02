# Workflow Plan — bundle-588-591

<!-- plan_hash: 2f0bdd62667517628b8beaa8a6350c316adfb3896f12a21f280062505945b40c -->

Same-scope bundle of two enhancements in the write co-open machinery of
`kaola-workflow-adaptive-node.js` (runOpenReady / buildDispatch / lane groups) + its test suite.

**#591 (enhancement):** thread per-member `leg_path` (and `leg_branch`) into the `open-ready`
dispatch payload. When a `parallel_safe` write frontier co-opens, `provisionLeg` creates a real
per-member worktree, but each member's `opened[].dispatch` is built with the shared `working_dir`
(`buildDispatch(..., { working_dir: working_dir || null, ... })` in the runOpenReady opened[]
mapping, currently ~`:4219`) — leg paths are only recoverable by cross-referencing the top-level
`laneGroup` descriptor. Fix: when a lane group forms, attach the member's `leg_path`/`leg_branch`
directly to that member's dispatch object, conditionally (absent on the serial/read path —
byte-identical shape today, same conditional-attach pattern as `laneGroup`). Tighten the plan-run
frontier prose (all SIX routing surfaces) to reference `dispatch.leg_path` instead of the
laneGroup cross-reference. AC: extended `LEG-PROVISION-ON` real-git test asserts each opened
member's dispatch carries its own leg_path/leg_branch equal to the provisioned worktree;
serial/read-path `open-ready` output byte-identical to today.

**#588 (enhancement):** write co-open coverage is width-2 only. Add real-git cases to
`scripts/test-adaptive-node.js`: (a) 3-leg disjoint write co-open through provision → per-leg
barriers → octopus merge (4 parents) → union barrier → group close; (b) a write antichain wider
than FANOUT_CAP asserting documented cap behavior (prefix-up-to-ceiling co-open + queued
remainder) and reconcile's `max_concurrent` handling at that width; (c) a mixed frontier (2 read
verifiers + a 2-leg write group) pinning which members open (reads first, `write_awaits_drain`)
and that the running set reflects exactly the opened set; (d) a scheduler-path task-mirror
failure asserting fail-open (ledger still advances). AC: durable-artifact assertions (ledger
rows, running-set.json, worktree/branch existence, merge parent count, diff-tree vs union of
declared sets), suite stays green, and any behavior found UNDEFINED at width ≥3 or mixed
composition is FIXED (or refused typed) rather than pinned as-is — `kaola-workflow-adaptive-node.js`
/ `kaola-workflow-next-action.js` fixes may be needed.

Cross-edition: `kaola-workflow-adaptive-node.js` and `kaola-workflow-next-action.js` are
GENERATED_AGGREGATORs (canonical + codex byte-twin + gitlab/gitea rename-generated forge ports —
4 files each, moved atomically in one node). Plan-run prose propagates to the SIX routing
surfaces (3 command files + 3 SKILL packs), provenance-free there. All four
`npm run test:kaola-workflow:*` chains must be green (run sequentially) before finalize.

## Meta

labels: enhancement, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-impl | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/test-adaptive-node.js, scripts/test-next-action.js | 10 | sequence | opus |
| n2-prose | implementer | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/plan-run-cards/frontier-batch.md | 7 | sequence | sonnet |
| n3-adversarial | adversarial-verifier | n1-impl, n2-prose | — | 1 | sequence | opus |
| n4-docs | doc-updater | n1-impl, n2-prose | CHANGELOG.md, docs/decisions/D-588-01.md, docs/decisions/D-591-01.md, docs/api.md | 4 | sequence | sonnet |
| n5-review | code-reviewer | n3-adversarial, n4-docs | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Why ONE implement node for two issues (n1-impl):** both issues edit the SAME generated
  aggregator `kaola-workflow-adaptive-node.js` and the same test file — the generated aggregator
  + codex twin + forge ports must move atomically in one node (generated_port_split wall), and a
  forge-port write must be downstream of ALL root edits (forge-port ordering wall), so two nodes
  each carrying the ×4 set are out of grammar by construction. Also #588's test-first work IS
  the natural RED for #591's payload change (the leg_path assertion extends `LEG-PROVISION-ON`),
  so splitting would sever a cohesive RED→GREEN.
- **n1-impl ∥ n2-prose antichain:** disjoint write sets, no dependency — n2's canonical spec is
  fixed by the issue AC (field names `leg_path`/`leg_branch`), not by n1's diff. Left as an
  antichain so the scheduler may overlap them; serial degrade on a coarse-prefix overlap ruling
  is safe.
- **n3-adversarial ∥ n4-docs → n5-review join:** the reviewer sits at the join so every path
  from a code-producing node to the sink passes through it (G1). The adversarial verifier is
  read-only and specifically probes #588's fix-or-refuse mandate (below).
- **next-action ×4 + test-next-action.js in n1's write set:** anticipatory — #588 names
  `next-action.js` as a possible fix surface for undefined width/mix behavior. Declared so a
  discovered fix never stalls the run on write_set_overflow; unwritten declared files are
  harmless.

### Model rationale
- **n1-impl opus:** reasoning-floor node — width-≥3 octopus semantics, cap/reconcile
  interactions, mixed-frontier scheduling, and the judgment call "fix vs refuse-typed vs pin"
  on any behavior found undefined. Misjudgment propagates to the whole bundle.
- **n2-prose / n4-docs sonnet:** mechanical propagation / documentation of an already-made
  decision.
- **n3-adversarial + n5-review opus:** gates over the most safety-critical subsystem (write
  co-open) — a strong gate over a subtle diff.

### Implementation notes for n1-impl (tdd-guide)
- RED first: extend `LEG-PROVISION-ON` (test-adaptive-node.js ~:5520) with per-member
  `dispatch.leg_path`/`dispatch.leg_branch` assertions equal to the provisioned worktree path /
  `kw/legs/<project>/<id>` branch; keep the existing dormancy guard (dispatch `working_dir` stays
  the shared root — S2 dormant; leg routing is the NEW fields, do not flip working_dir).
- #591 GREEN: in `runOpenReady`'s opened[] mapping, thread the member's leg from the
  `laneGroupEntry.legs` into `buildDispatch` context; attach CONDITIONALLY (absent — not null —
  on serial/read path) to preserve byte-identical serial output; existing shape tests must stay
  green as the byte-identity proof.
- #588 cases (a)–(d) per the issue AC; durable-artifact assertions only (ledger rows,
  running-set.json, worktree/branch existence, octopus parent count, diff-tree vs declared-set
  union), matching the existing `LEG-*`/`SYNTH-*` quality bar. Suite is ~1127 assertions today
  and the #585 project-scoped scheduler lock is live — co-open subprocess tests run under the
  lock; sequential-behavior tests, no two-process race probes needed here.
- Cited line numbers in both issues may have drifted — re-locate in current code
  (`buildDispatch` ~:1085, opened[] mapping ~:4208-4228, group formation ~:3998-4030,
  `provisionLeg` ~:3620, reconcile ceiling ~:4803-4814).
- Undefined-behavior triage: FIX in adaptive-node/next-action (all four editions via
  edition-sync regeneration) or land a typed refusal — NEVER pin undefined behavior as-is.
- Regenerate forge ports via edition-sync after every canonical edit; codex twin is
  byte-identical.

### Implementation notes for n2-prose (implementer)
- non_tdd_reason: routing-surface prose propagation; no natural failing unit test (no contract
  currently pins the laneGroup cross-reference wording).
- Replace the "cross-reference the laneGroup descriptor" instruction with `dispatch.leg_path` /
  `dispatch.leg_branch` as the per-member routing fact in the write-leg dispatch discipline
  bullet (root command ~:183-193) — the absolute-path / `cd "<legPath>" &&` discipline itself is
  unchanged. Mirror across all six surfaces modulo forge nouns (forge-neutral, provenance-free
  on these surfaces). Also update `docs/plan-run-cards/frontier-batch.md` (~:73-74 discipline
  bullet and the ~:88 opened[] shape line to include the conditional dispatch legs fields).
- Do NOT edit contract validators — no validator pins the changed prose (verified at planning);
  if an unexpected needle trips, that is a route-findings escalation, not a silent validator
  edit.

### Gate charter for n3-adversarial (adversarial-verifier, read-only)
- Attempt to refute: (1) "serial/read-path open-ready output is byte-identical" — inspect the
  diff for any unconditional field attach; (2) "no undefined width/mix behavior was pinned
  as-is" — check each new #588 case pins BEHAVIOR THAT IS DEFENSIBLY CORRECT, not whatever the
  code happened to do; (3) the durable-artifact quality bar (no stdout-sentinel assertions);
  (4) six-surface prose parity modulo forge nouns.

### Decision records (n4-docs)
- D-588-01 and D-591-01 verified next-free at planning (no existing D-588-*/D-591-* in
  docs/decisions/, docs/, or CHANGELOG.md).
- docs/api.md: extend the `opened` payload `dispatch` sub-object section and the `open-ready`
  `laneGroup` section with the conditional `leg_path`/`leg_branch` fields.
- CHANGELOG under [Unreleased]: one entry per issue.

## Node Ledger

| id | status |
| --- | --- |
| n1-impl | complete |
| n2-prose | complete |
| n3-adversarial | complete |
| n4-docs | complete |
| n5-review | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-impl) | subagent-invoked | evidence-binding: n1-impl 8f1ffe45f655 | |
| implementer (n2-prose) | subagent-invoked | evidence-binding: n2-prose fb74ac35a6ba | |
| adversarial-verifier (n3-adversarial) | subagent-invoked | evidence-binding: n3-adversarial cedd99611aaf | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs c7df06888125 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review f889f7743413 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 81bb18cfd6e2 | |
