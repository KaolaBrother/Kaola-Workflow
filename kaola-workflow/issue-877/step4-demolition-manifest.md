# Step 4 — the demolition manifest

ADR 0017 build sequence step 4: *delete the node executor and let its tests fall out. Tests are
deleted with their mechanism, never repaired ahead of it.*

**Step 2 is closed** — the mission list was observed carrying this campaign end to end, resume
included (commit `27e0aab0`). That was the gate. Deletion is now authorised.

**Tooling trap:** `kaola-workflow-adaptive-node.js` and its three edition copies carry a NUL byte
near line 8400. ripgrep calls them binary and silently returns matches only below it. Use `grep -a`
/ `rg --text` / line-range reads on those four files, or half of each reads as absent.

## Ordering principle

Delete the *mechanism* and its tests in the same commit. Never leave a suite pinning a deleted
mechanism, and never repair a suite ahead of its mechanism's deletion. The three enumerated
name-lists (§4) must shrink in that same commit or the sync validators go red.

## 1. Canonical scripts — delete outright

| File | Lines | Why it dies |
|---|---:|---|
| `scripts/kaola-workflow-adaptive-node.js` | 19,003 | the entire per-node lifecycle |
| `scripts/kaola-workflow-plan-validator.js` | 7,981 | plan grammar, post-dominance, disjointness, freeze, `plan_hash` |
| `scripts/kaola-workflow-replan.js` | 5,275 | epochs and the re-plan CAS machinery |
| `scripts/kaola-workflow-adaptive-handoff.js` | 1,687 | the planner freeze/orient chain |
| `scripts/kaola-workflow-commit-node.js` | 372 | the per-node barrier choreography |
| `scripts/kaola-workflow-next-action.js` | 416 | ready-set / next-node over a frozen DAG |
| `scripts/kaola-workflow-task-mirror.js` | 170 | generates the Codex task mirror FROM `## Nodes` + the Ledger |
| `scripts/kaola-workflow-classifier.js` | 993 | `parseWriteSetCell` + the antichain/write-set overlap scan |
| `scripts/kaola-workflow-repair-state.js` | 642 | regenerates `workflow-state.md` FROM the plan |

Delete the call sites with them. `claim.js` calls the classifier via `scanClaimedOverlap` — that
whole feature (do two active runs write the same files?) has no meaning without declared write sets.

**Before deleting the plan-validator, confirm the step-3 extraction has landed** — `claim.js` and
`run-chains.js` must already be off it. `grep -n "plan-validator" scripts/kaola-workflow-claim.js
scripts/kaola-workflow-run-chains.js` must return no `require`.

## 2. Scripts that survive but must be de-coupled

| File | What to do |
|---|---|
| `scripts/kaola-workflow-ledger-compare.js` | Its guard stops a worktree→main mirror that would REGRESS the record — a worktree-management property, not node execution, and ADR 0017 does not name it. **Keep the property, re-point the derivation**: compare `status: done` item counts between the two `mission-list.md` files instead of ledger rows. If the mirror path itself is gone, delete both — but say which, do not leave it ambiguous. |
| `scripts/kaola-workflow-closure-contract.js` | drop the `epoch_lineage_preserved` field; keep the rest |
| `scripts/kaola-workflow-closure-audit.js` | drop the drift class keyed on `plan_hash` / `## Node Ledger` |
| `scripts/kaola-workflow-compact-context.js` | rewrite the instruction line to name the mission list |
| `scripts/kaola-workflow-codex-preflight.js` | keep agent-profile freshness; drop the REQUIRED-role union sourced from a plan's `## Nodes` role column |
| `scripts/kaola-workflow-resolve-agent-model.js` | keep; drop per-node tier resolution, keep the tier→model/effort mapping |
| `scripts/kaola-workflow-gap-sweep.js` | **decided by the triage report** at `.origin/877/mixed-tests-triage.md` — it keys in-run-repair detection on `nodeId`. If nothing is left once there are no nodes, delete it and its suite. |

## 3. Tests — delete with their mechanism

Wholly DAG, delete outright: `test-adaptive-node.js` (32,542) · `test-replan.js` (8,671) ·
`test-adaptive-handoff.js` (4,135) · `test-commit-node.js` (1,887) · `test-interior-gate-freshness.js`
(1,333) · `test-next-action.js` (1,191) · `test-plan-validator.js` (832) · `test-barrier-base-integrity.js`
(660) · `test-mega-mutation-spotcheck.js` (480) · `test-plan-shape-audit.js` (442) ·
`test-plan-design-section.js` (391) · `test-ledger-chain-tamper.js` (407) · `test-plan-run.js` (139) ·
`test-ledger-compare.js` (107, unless §2 keeps its subject).

### Triage outcomes — these are measured, not assumed

Full detail in `.origin/877/walkthrough-triage.md` and `.origin/877/mixed-tests-triage.md`. Read
them before touching a mixed suite; the numbers below are the headline only.

**`simulate-workflow-walkthrough.js` — DO NOT DELETE.** 294 scenarios: **68 DAG, 207 SURVIVOR, 19
MIXED** (plus 4 boundary cases flagged `?`, treat as MIXED). Deleting it wholesale would destroy 70%
surviving coverage — classifier, roadmap, worktree, sink-merge, watch-pr, release, closure-audit,
contract validators, labels, the dispatch-log hook and bundle-claim. Delete the DAG ordinals only.
- **The `--release-check` block is NOT a standalone scenario.** It is lines **3816-4008** (13
  sub-cases) buried *inside* `testBundle424432433ValidatorGates` (ordinal 198, spanning 3354-4233).
  Split that function: extract 3816-4008 verbatim, re-point every `planValidatorScript` call at
  `kaola-workflow-run-chains.js --release-check`, and let the rest of the function fall with the DAG.
  Its `mkRepo` / `writeReceipt` locals are shared with the dying attribution cases — re-derive them,
  do not delete them.
- **Archive completeness scenarios are pure survivors** (ordinals 99, 260, 261) and already target
  `claim.js` directly. Keep as-is.
- **Shared helpers that must NOT go as collateral:** `assert`, `runNode`/`runNodeAsync`, `json`,
  `read`, `statePath`, `writeProject`, `assertNoLegacyCoordDirs`, `plantActiveFolder(WithBase)`,
  `plantRoadmapIssue`, `classifierScript`+`runClassifierOffline`, `runClaimOnline*`,
  `runClosureAudit*`, `writeGhShimForStartup`, `writeShimFiles`, `ghMockEnv`,
  `initGitRepo(WithBareRemote)`, the `G` git-fixture module, `headOf`, `cleanup`.
- **DAG-only helpers that die with it:** `seedAdaptiveFinalizeFixture`, `alignFinalizeFixtureAcrossRoots`,
  `plantFrozenPlan`, `stampVerifiedLegacyPlan`, `injectSpineForm`/`injectDesignSection`,
  `runLegacyFreeze`, `freezeLegacyContent`, `adaptiveTmp`, `ADAPTIVE_PLAN`, `validatePlanFixture`,
  `gateWarning*`/`assert(No)GateLeak`, `plantHandoffState`.

**`test-claim-hardening.js`** — 38 groups: **8 DAG, 30 SURVIVOR** (the DAG groups are fixture-heavy,
~55% of lines). But three of the eight — **#522, #816, #837** — have DAG *fixtures* and SURVIVING
*subjects* (finalize must verify a receipt exists, report every unmet precondition in one read-only
pass, own the worktree→main mirror sync). **Do not delete their subject.** It is re-homed in the new
`scripts/test-finalize-door.js`; confirm it is covered there before removing the group. #686 (barrier
refs) and #699 (epoch/claim-root identity) delete outright. #735/#755 need re-derivation: `abandon`
survives, but its logic is keyed on ledger completeness.

**`test-run-chains.js`** — **0 DAG, 41 SURVIVOR.** Keep the whole suite. One caveat: **T29**
(lines 967-1001) proves finalize does not vacuously pass an empty `chains[]` receipt, but drives it
through `plan-validator --finalize-check`. Re-point it at wherever that check now lives; do not let
it disappear with its host.

**`test-gap-sweep.js`** — 24 scenarios: 1 MIXED, 23 SURVIVOR. Trim the `in_run_repair` half of T1.
Eight other scenarios merely *use* a nodeId fixture as a cheap vehicle to synthesise a swept class;
swap it for the `deferred_red_chain` or `manual:*` fixture already in the suite.

**`kaola-workflow-gap-sweep.js` SURVIVES** — verdict settled. Of its three reason classes only
`in_run_repair` (nodeId with >1 open events) dies; `deferred_red_chain` (from the surviving
run-chains receipt) and `manual:<slug>` are fully meaningful, and the whole gate half has zero node
dependency. Drop the one class, keep the script.

**`test-sink-merge.js`** — 18 scenarios: **3 DAG** (i, j, n — ledger-derived evidence requirements and
an epoch-authority fixture), **15 SURVIVOR**.

**`test-refusal-route-sweep.js` — DELETE ENTIRELY.** Not by cell count but by subject: ADR 0017
retires the refusal mechanism itself. `sink_verdict` *is* R3 and becomes a report; `consent_required`
becomes the orchestrator asking the user. The registry it sweeps has no successor, so the suite has
no subject. `KERNEL_REFUSAL_REGISTRY` and the route-contract machinery go with it.

**`test-interior-gate-freshness.js`, `test-barrier-base-integrity.js`** — confirmed 100% DAG.

## 4. The three enumerated name-lists — shrink in the same commit

| List | Location | Today |
|---|---|---|
| `SUPPORT_SCRIPTS` | `scripts/kaola-workflow-install-manifest.js:61-87` | 25 entries, 12 of them dying. Single source for install.sh — no `case "$FORGE"` edit needed. |
| `GENERATED_AGGREGATORS` | `scripts/edition-sync.js:52-74` | 10 entries, 7 dying |
| `COMMON_SCRIPTS` | `scripts/validate-script-sync.js:45-104` | 22 entries, 9 dying. Also check `BYTE_IDENTICAL_GROUPS` at `:117+`. |

Also `package.json` — every deleted suite is a hard-coded token in `test:kaola-workflow:claude` and
`test:kaola-workflow:claude:full`. Both must be edited, and the `description` field still says
"task-shaped DAG of role nodes".

## 5. Per-edition twins

Every deleted canonical script has hand-ported twins under `plugins/kaola-workflow-gitlab/scripts/`
and `plugins/kaola-workflow-gitea/scripts/` (renamed `kaola-{gitlab,gitea}-workflow-*.js`) and a
same-named copy under `plugins/kaola-workflow/scripts/`. Delete all three per file. The five
edition walkthroughs (`simulate-{kaola-workflow,gitlab,gitea}-*.js`, 8,324 lines total) pin the node
lifecycle independently and need the same triage treatment as the canonical one.

Run `node scripts/edition-sync.js --write` after, never hand-edit a mirror.

## Acceptance

1. `npm run test:kaola-workflow:claude` is GREEN. It is RED at HEAD only inside `test-adaptive-node`,
   which this manifest deletes, so there is no pre-existing red left to hide behind.
2. All four chains green: `claude`, `codex`, `gitlab`, `gitea`.
3. No surviving file references a deleted script — by `require`, by name in a list, by npm token, or
   in prose.
4. `node scripts/validate-script-sync.js`, `node scripts/edition-sync.js --check`,
   `node scripts/validate-workflow-contracts.js` all green.
5. No surviving suite was repaired to keep pinning a deleted mechanism. Deletions only.
