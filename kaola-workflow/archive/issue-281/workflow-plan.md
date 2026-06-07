# Workflow Plan — issue #281

<!-- plan_hash: 45c7197d4f5743680d6b1911fca38bcaed1027c9ee8c0a9e8c958239f3b9fda6 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| design-blueprint | code-architect | — | — | 1 | sequence |
| design-note | implementer | design-blueprint | docs/investigations/2026-06-07-parallel-ready-set-execution-design.md | 1 | sequence |
| aggregator-core | tdd-guide | design-note | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, scripts/test-parallel-batch.js | 1 | sequence |
| next-action-core | tdd-guide | aggregator-core | scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, scripts/test-next-action.js | 1 | sequence |
| forge-forks | implementer | next-action-core | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js | 1 | sequence |
| registration | implementer | forge-forks | scripts/validate-script-sync.js, install.sh, package.json | 1 | sequence |
| contracts | implementer | registration | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence |
| plan-run-semantics | implementer | contracts | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md | 1 | sequence |
| planner-profile | implementer | plan-run-semantics | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence |
| orient-batch-aware | tdd-guide | planner-profile | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 1 | sequence |
| code-review | code-reviewer | orient-batch-aware | — | 1 | sequence |
| adversarial-verify | adversarial-verifier | code-review | — | 1 | sequence |
| docs | doc-updater | adversarial-verify | README.md, docs/architecture.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| design-blueprint | complete |
| design-note | complete |
| aggregator-core | complete |
| next-action-core | complete |
| forge-forks | complete |
| registration | complete |
| contracts | complete |
| plan-run-semantics | complete |
| planner-profile | complete |
| orient-batch-aware | complete |
| code-review | complete |
| adversarial-verify | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (design-blueprint) | subagent-invoked | # design-blueprint evidence — issue #281 parallel ready-set execution | |

| implementer (design-note) | subagent-invoked | # design-note evidence — issue #281 parallel ready-set execution | |
| tdd-guide (aggregator-core) | subagent-invoked | # aggregator-core evidence — issue #281 (node: parallel-batch STATE aggregator,  | |
| tdd-guide (next-action-core) | subagent-invoked | # next-action-core evidence — issue #281 (AC#1 / AC#5) | |
| implementer (forge-forks) | subagent-invoked | # Node Evidence: forge-forks | |
| implementer (registration) | subagent-invoked | # Node Registration Evidence — issue-281 | |
| implementer (contracts) | subagent-invoked | # Node Evidence: contracts — issue #281 | |
| implementer (plan-run-semantics) | subagent-invoked | # Node Evidence: plan-run-semantics — issue #281 | |
| implementer (planner-profile) | subagent-invoked | # Node: planner-profile — Evidence Record | |
| tdd-guide (orient-batch-aware) | subagent-invoked | # Evidence — node orient-batch-aware (issue #281, AC#5 typed refusal) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (adversarial-verify) | subagent-invoked | verdict: pass | |
| doc-updater (docs) | subagent-invoked | # docs node evidence — issue #281 parallel ready-set execution | |
| finalize (finalize) | subagent-invoked | # finalize evidence — issue #281 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #281 parallel ready-set executor. The BUILD DAG is
sequential by design: this run executes through the INSTALLED one-node-at-a-time executor,
so editing repo `scripts/` will not break the running loop and write-role `fanout(...)` buys
ZERO concurrency at build time (and would trip blast-radius governance). The FEATURE being
built supports write-role fanout; the BUILD of it does not use it.

### THE LOAD-BEARING CONSTRAINT (must be encoded in the design note AND the impl)

A script CANNOT spawn agents, and a subagent CANNOT dispatch a subagent. The harness's ONLY
real concurrency is the MAIN SESSION issuing multiple `Agent()` calls in ONE message.
Therefore the design splits responsibilities and the impl must honor the split:

- `kaola-workflow-parallel-batch.js` owns batch STATE ONLY — it never dispatches. Subcommands:
  `open-batch` (flip the N ready ledger rows to `in_progress` + record N per-member baselines
  via `commit-node --start`), `seal`/seal-member (per-member barrier via `commit-node`),
  `join` (merge disjoint member worktrees into the parent worktree, idempotently). It is PURE
  COMPOSITION over `next-action.js` + `commit-node.js` (+ `plan-validator.js`) — never
  imports-and-mutates them, mirroring how `adaptive-node.js` composes. If the design treats
  `parallel-batch.js` as "the thing that runs nodes concurrently," it is WRONG.
- The plan-run SKILL/command (MAIN SESSION) owns concurrent DISPATCH: open a batch via the
  aggregator, then issue multiple `Agent()` calls in ONE message; write-role members use
  isolated worktrees; then seal + join via the aggregator before advancing downstream.

### Design note required content (node1 `design-note`, the issue's dangling reference)

The issue's "Design Reference" cites `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`,
which does NOT exist; authoring it IS part of finishing the issue. `code-architect`
(`design-blueprint`) is READ-ONLY and produces the blueprint; the WRITE-role `implementer`
(`design-note`, `non_tdd_reason`: durable design document, no behavioral unit under test —
`code-architect` cannot Write) writes the file at the EXACT cited path so the dangling
reference resolves. The note must specify:
- the STATE-vs-DISPATCH split above (script manages state; orchestrator dispatches);
- the batch lifecycle states for crash/resume: open → dispatched → sealed → joining → joined;
- read-only sibling batches FIRST, then write-role `fanout(...)` batches over
  validator-proven disjoint write sets with isolated node worktrees + idempotent parent joins
  (an ORDERED capability, not a scope reduction);
- downstream stays CLOSED until every required batch member is `complete`/`n/a`;
- the rule that multiple `in_progress` ledger rows are LEGAL ONLY with a valid active batch
  manifest; otherwise it is a typed refusal / repair-state concern.
If a specific AC bullet proves genuinely infeasible under the script-can't-dispatch
constraint, document it as an honest partial in the note — never silently drop it.

### Per-node write-set rationale (FILE_CEILING = 6, four-edition parity)

The new aggregator + its registration span ~25-30 production files, decomposed so each node's
write set ≤ 6 and groups one concern:
- `aggregator-core` (tdd-guide): the root + claude-plugin `parallel-batch.js` are
  BYTE-IDENTICAL COMMON_SCRIPTS entries (validate-script-sync.js lines 147-155 compare
  `scripts/<name>` vs `plugins/kaola-workflow/scripts/<name>`), so both move in ONE node, with
  `test-parallel-batch.js` (a sibling of `test-adaptive-node.js`) added test-first. Batch-state
  logic (open/seal/join, manifest validity, multiple-in_progress legality) is BEHAVIORAL with a
  natural failing unit test → `tdd-guide`, NOT implementer.
- `next-action-core` (tdd-guide): root + claude `next-action.js` (byte-identical pair) gain the
  AC#1/AC#5 distinction between READY-PENDING and active IN_PROGRESS rows (today it computes the
  full `readySet` but returns `nextNode: readySet[0]` and refuses on any stalled DAG). Behavioral
  → `tdd-guide`, with `test-next-action.js` additions.
- `forge-forks` (implementer, `non_tdd_reason`: behavior-preserving renamed ports of the
  root scripts — `kaola-gitlab-workflow-*` / `kaola-gitea-workflow-*`; `adaptive-schema.js` is
  NOT renamed but this node does not touch it; coverage is the root tdd-guide tests).
- `registration` (implementer, `non_tdd_reason`: wiring/registration — COMMON_SCRIPTS array in
  `validate-script-sync.js`, the THREE `install.sh` SUPPORT_SCRIPT_NAMES blocks, and the
  `package.json` test runner gaining `node scripts/test-parallel-batch.js`; no behavioral unit).
  `validate-script-sync.js` and `validate-kaola-workflow-contracts.js` have NO claude-plugin
  byte-identical sibling (confirmed absent), so only the root copies are edited.
- `contracts` (implementer, `non_tdd_reason`: contract presence-assertions, no behavioral unit).
  Root + claude `validate-workflow-contracts.js` are a byte-identical pair → both here. Plus root
  `validate-kaola-workflow-contracts.js` (asserts the pluginRoot copies exist) and the two forge
  `validate-kaola-workflow-{gitlab,gitea}-contracts.js` script-name enumerations. 5 files ≤ 6.
  NOTE: the forge TEST files (`test-{gitlab,gitea}-workflow-scripts.js`) do NOT enumerate the
  aggregator scripts today (verified `grep -c = 0`), so they are NOT a required surface — the
  brief listed them speculatively; do not add a spurious count-bump there.
- `plan-run-semantics` (implementer, `non_tdd_reason`: prose/skill semantics — change "one role
  node at a time" → "one FRONTIER UNIT at a time" across the root command + the two forge
  commands + the claude SKILL; verified by the TEXT-PRESENCE contract assertions in `contracts`).
- `planner-profile` (implementer, `non_tdd_reason`: prose — add the "author EFFICIENT DAGs
  (minimize the safe critical path, expose independent work as siblings, serialize only for true
  deps / shared lanes / selectors / loops / gates)" instruction to `agents/workflow-planner.md`
  + the THREE `plugins/*/agents/workflow-planner.toml`. The `--adaptive/` and `--help/` codex
  dirs are NOT git-tracked scratch — NOT shipping surfaces, intentionally excluded).

### Executor consistency trap (pre-empt)

The contract presence-assertion STRINGS added in `contracts` must BYTE-MATCH the prose strings
the `plan-run-semantics` and `planner-profile` nodes add (e.g. the "frontier unit" /
"efficient" phrasing). Ordering among the sequential impl nodes is free — the PER-NODE barrier
checks write-set containment + gates/evidence, NOT `npm test`; byte-identity and
assertion-matches-prose only need to hold at FINALIZE. Keep the assertion substrings stable.

### Verification reality (gates G1, strong test nodes)

A green plan-run is NOT evidence the parallel feature works. "Verified" =
`node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough simulation
passed") + `npm test` (which now runs `test-parallel-batch.js` after the `registration`
package.json edit) + the new `test-parallel-batch.js` unit tests + `test-next-action.js`
additions + the contract presence-assertions. `code-review` (code-reviewer) post-dominates
EVERY code-producing node (G1) — design-note, aggregator-core, next-action-core, forge-forks,
registration, contracts, plan-run-semantics, planner-profile. `adversarial-verify`
(adversarial-verifier, read-only, empty write set) re-tests the finished claim and feeds the
sink. `docs` (doc-updater) updates README "Supported adaptive patterns" (line ~574) +
`docs/architecture.md`; CHANGELOG.md lives ONLY on the `finalize` sink (no double-write).
Sink: merge (run posture worktree).
