evidence-binding: n9-validators ad8d90f7dd37
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: assertion-surface retirement — behavior-preserving update of the validator / contract / forge-test / package.json assertion surface to the fast/full-retired tree (drop fast/full command/skill/script pins, installed_paths/resolveInstalledPaths asserts, retired sync-list entries, dead package.json tests; migrate one fast-marker finalize fixture per forge test to a seeded adaptive plan; retire the numbered-full-path repair-reconstruction unit tests). No natural failing-unit-test shape exists; the meaningful check is each edited validator + each edition chain re-run against the n2-n8 retired tree.
<!-- regression-green|build-green|smoke-integration -->
regression-green: each edited validator runs green standalone against the retired tree, and each edition chain is green EXCEPT for three UNOWNED files (one per non-codex chain) that carry a retired `workflow_path: fast` plan-absent finalize fixture — the codex chain is fully green; the claude/gitlab/gitea chains are red ONLY on those unowned files (write-set gaps, quoted below), never on any of the 9 files this node owns.

## verification_tier

regression-green

upstream_read: n1-recon 30aed1d97859
upstream_read: n8-walkthroughs b93878b6028c

## task

n9-validators: update the validator/contract/forge-test assertion surface to the fast/full-retired
state so the four chains go green — drop fast/full command/skill/script pins + installed_paths /
resolveInstalledPaths assertions from `validate-workflow-contracts.js` (×2 byte-pair) and
`validate-kaola-workflow-contracts.js`; remove the retired fast-advance/full-advance/phase4-advance
entries from `validate-script-sync.js` COMMON_SCRIPTS + RENAME_NORMALIZED_FAMILIES; drop the fast/full
command/skill counts + installed_paths asserts from the gitlab/gitea contract validators and forge
test scripts; drop the 4 dead tests + fix the stale "6-phase" description in `package.json`. Closes
n8's five `deferred_to_n9` reds. First node whose leg carries the complete retired+blessed tree → the
earliest real integration check (run each edited validator + ideally each edition chain).

## write_set (exactly the 9 files in the n9-validators plan row — nothing else touched)

- scripts/validate-workflow-contracts.js                                              (MODIFIED)
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js                        (MODIFIED — byte-twin; `cmp -s` OK)
- scripts/validate-kaola-workflow-contracts.js                                         (MODIFIED)
- scripts/validate-script-sync.js                                                      (MODIFIED)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js    (MODIFIED)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js      (MODIFIED)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js                (MODIFIED)
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js                  (MODIFIED)
- package.json                                                                         (MODIFIED)

`git status --porcelain` confirms exactly these 9 as this node's writes; the two workflow-contracts
copies end byte-identical (`cmp -s` OK). TRAP 1 honored: no substring "full" grep-delete — `escalated_to_full`,
"full accumulated root diff", "full result/durable full result" (Codex toml), "Fast-forward" git plumbing
all preserved. Did NOT commit.

## per-file retirement summary

### scripts/validate-workflow-contracts.js  (+ its byte-twin plugins/kaola-workflow/scripts/…)
- `phaseCommands` array: dropped the deleted phase1-5 + fast commands → kept finalize/adapt/plan-run.
- `routedFixFiles` array: dropped phase4/phase5 ×3 → kept finalize ×3 (model-badge asserts still pass).
- Dropped the reconstruction-ladder rung pin `fast-summary.md exists -> /kaola-workflow-fast`; kept the
  Select-Project drift-guard pin (workflow-next.md still lists fast-summary.md, Phase-D-deferred).
- Collapsed the #198/#207/#222 fast block (all pinned the deleted `kaola-workflow-fast.md` + removed
  workflow-next fast rubric rungs) to the trap-2 classifier tolerant-read pins ONLY.
- Dropped claim.js `/kaola-workflow-fast ` pin; dropped the #459 loop over deleted commands + the
  `assertManifestScript(...fast-advance/full-advance/phase4-advance...)` registration pins.
- Dropped the `install.sh --with-fast`/`--with-full` pins (kept the `--enable-adaptive is retired` pin).
- Dropped the `resolveInstalledPaths` pins on claim.js + adaptive-schema (kept path_not_installed /
  PLAN_RUN_COMMAND / schema `/kaola-workflow-plan-run`).
- Dropped `testFastStartupState` from the walkthrough-scenario concept list.
- Route-reachability: dropped the deleted `kaola-workflow-fast` / `kaola-workflow-phase1` fallback targets.
- KEPT the workflow-next `adaptive path selection` concept (fast/full tokens still present as Phase-D prose).

### scripts/validate-kaola-workflow-contracts.js (codex)
- `skills` array: dropped research/ideation/plan/execute/review/fast → kept init/next/finalize/adapt/plan-run.
- Updated the next-SKILL status pin to the regenerated retired wording
  `Workflow path: {adaptive — the only workflow path` (n6 legitimately reworded).
- Collapsed the fast SKILL block to the trap-2 classifier tolerant-read pins.
- Dropped execute/review skill pins, the #77 negatives on deleted skills, the #459 contractor-free loop
  over deleted skills, and reduced delegationSkills + the invoked-note loop to the survivors (finalize/next).
- Dropped claim.js `/kaola-workflow-fast ` pin; route-reachability dropped `kaola-workflow-fast`/`-research`.

### scripts/validate-script-sync.js
- COMMON_SCRIPTS: dropped kaola-workflow-{fast-advance,full-advance,phase4-advance}.js + their comments.
- RENAME_NORMALIZED_FAMILIES: dropped the 3 forge-port families (fast-advance/full-advance/phase4-advance).
- Result: `OK: 22 common scripts, 28 byte-identical groups, 5 rename-normalized families …` (green).

### plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-kaola-workflow-{gitlab,gitea}-contracts.js
- command/skill counts 11 → 5 (6 fast/phase surfaces deleted; survivors init/next/finalize/adapt/plan-run).
- Dropped the #459 contractor-free loop over deleted commands + deleted-skill contractor sweep + fast SKILL.
- Reduced delegationNegativeChecks + delegationSkills + the invoked-note loop to survivors (finalize/next).
- Updated the next-SKILL status pin to the retired wording; collapsed the fast cmd/SKILL block to the
  classifier tolerant-read pins + kept the Select-Project fast-summary pin.
- Route-reachability: dropped `kaola-workflow-fast`/`kaola-workflow-research` fallback targets.

### plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-workflow-scripts.js
- Renamed+rebuilt `markPlanAbsentFinalizeFixtureFast` → `seedAdaptiveFinalizeFixture` (mirrors n8's
  proven walkthrough helper: frozen adaptive plan all-complete + gate-passing consumer final-validation.md
  with a `--candidate-hash`-derived hash + optional schema-2 epoch-authority patch). Updated the lone
  worktree-cleanup finalize call site. (gitlab: added `git branch -M main` in that fixture so the adaptive
  finalize gate's `main...HEAD` diff resolves — the gitea copy already seeds init.defaultBranch=main.)
- Deleted the retired fast tests: cmdResume fast fallback (#208), fast-path repair keep/recon/discover/
  ambiguity (#199/#201), KAOLA_PATH=fast startup (#101), and the #543 installed_paths partition smoke.
- Retired the numbered-full-path repair-reconstruction unit tests (repair-project, Gap4 stateLooksValid,
  Gap5 three-way valid+current/valid+stale/compliance-gate, Fix-1 CLI exit code, Issue #107 guard/allow) —
  repair-state now reconstructs ONLY adaptive projects (probe: `repair.repair()` on a numbered-phase state
  → `{"repaired":false,"reason":"no adaptive plan available for repair"}`). KEPT the survivors that still
  pass: terminal-complete detection (finalization-summary.md → complete:true) and the Gap5 stateContent
  formatter tests. Updated the module-top installed_paths comment (classifier still tolerantly reads it).
- Both scripts pass standalone: "GitLab/Gitea workflow script tests passed" (EXIT 0).

### package.json
- Dropped the 4 dead tests (test-fast-audit / test-fast-advance / test-full-advance / test-phase4-advance)
  from the `test:kaola-workflow:claude` chain; kept test-bash-block-guards + test-run-chains.
- Replaced the stale "6-phase … Research, Ideation, Plan, Execute, Review, Finalize" description with an
  adaptive-DAG description. JSON re-parses valid.

## four-chain results (this leg carries the complete n2-n8 retired tree — earliest real integration check)

- **codex**: GREEN — full chain EXIT 0 (validate-script-sync + validate-kaola-workflow-contracts +
  simulate-kaola-workflow-walkthrough + active-folders-field-parity + generate-routing-surfaces --check).
- **claude**: RED ONLY on the UNOWNED `scripts/test-bundle-finalize.js` (36 test(s) FAILED, 79 passed).
  Everything else GREEN: validate-script-sync, test-validate-script-sync, adaptive-node (2479),
  plan-run (38), bundle-state (37), bundle-claim (79), AND — verified by running every chain step after
  the short-circuit — test-route-reachability (2277), validate-workflow-contracts, the canonical
  `simulate-workflow-walkthrough.js` ("Workflow walkthrough simulation passed"), generate-routing-surfaces
  --check, test-generate-routing-surfaces (all EXIT 0). The canonical walkthrough passing CLOSES n8's three
  `deferred_to_n9` contract-validator-shelling tests (testContractValidator{OfflineSkip,ReflowTolerant,MissingTag}).
- **gitlab**: RED ONLY on the UNOWNED `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:826`.
  Green: validate-kaola-workflow-gitlab-contracts (passed), test-gitlab-workflow-scripts (mine, passed),
  the walkthrough own-sections up to the sinks run() shell. This CLOSES n8's deferred gitlab reds
  (test-gitlab-workflow-scripts.js + validate-kaola-workflow-gitlab-contracts.js).
- **gitea**: RED ONLY on the UNOWNED `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js:791`.
  Green: validate-kaola-workflow-gitea-contracts (passed), test-gitea-workflow-scripts (mine, passed),
  walkthrough own-sections. CLOSES n8's deferred gitea reds.

Residual failure quoted precisely (identical root cause on all three unowned files — a retired
`workflow_path: fast` plan-absent finalize fixture, which n4 now refuses):
`{"result":"refuse","reason":"finalize_gate_unverified","gate":"workflow_path","inner_reason":"adaptive_plan_missing","workflow_path":"fast","operator_hint":"Restore the frozen workflow-plan.md before Finalization. No archive or closure side effect was made.","errors":["adaptive_plan_missing"]}`

## surfaced write-set gaps (NOT in this node's write set — plan-level repair required)

- **GAP-A (NEW — keeps the CLAUDE chain red; unanticipated by n1/n8):**
  `scripts/test-bundle-finalize.js` still calls the retired `markPlanAbsentFinalizeFixtureFast` (state
  `workflow_path: fast`) then finalizes → 36 tests fail `adaptive_plan_missing`. This file is in NO
  node's write set (checked workflow-plan.md; n4 owns test-bundle-state.js + test-bundle-claim.js, NOT
  test-bundle-finalize.js). The claude chain therefore cannot go fully green until this file is migrated
  to `seedAdaptiveFinalizeFixture` (same fix applied to the two forge -workflow-scripts.js this node owns).
- **GAP-B / GAP-C (KNOWN — n1 §Binding-constraint (a) + n8's surfaced GAP; keep gitlab/gitea red):**
  `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (:826) and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (:791) carry the same `workflow_path: fast`
  plan-absent finalize fixture → `adaptive_plan_missing`. Neither is in any node's write set
  (this node owns test-{gitlab,gitea}-workflow-scripts.js, NOT the -sinks.js files).

**Recommended repair:** add these three files (`scripts/test-bundle-finalize.js`,
`plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js`) to a writer's leg (or a
follow-up node) and apply the identical `seedAdaptiveFinalizeFixture` migration this node used for the two
forge `-workflow-scripts.js` files. All three share one root cause (n4's plan-absent→`adaptive_plan_missing`
collapse) and one fix. Note GAP-1..4 from n1 §2 (codex finalize/init SKILL prose, required-blocks.js,
install-opencode.sh/install-kimi.sh/.env.example staleness) were NOT pinned by any validator this node
edits, so they did not force any drop here.

## before_result

Baseline on this leg (n2-n8 applied, assertion surface not yet retired): all three canonical validators
RED — `validate-workflow-contracts.js` threw `commands/kaola-workflow-phase1.md is missing`;
`validate-kaola-workflow-contracts.js` threw `plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md
is missing`; `validate-script-sync.js` listed 9 missing retired scripts. The gitlab/gitea contract
validators expected 11 command/skill files (only 5 remain); the forge test scripts + package.json still
referenced deleted fast/full scripts and fast-marker fixtures. All four chains RED.

## after_result

All 9 owned files pass their targeted checks: the two workflow-contracts copies green + byte-identical;
validate-kaola-workflow-contracts green; validate-script-sync green; both forge contract validators green;
both forge `-workflow-scripts.js` green standalone; package.json valid + dead tests removed + description
fixed. codex chain fully GREEN; claude/gitlab/gitea chains GREEN on every owned + downstream reference and
RED ONLY on the three UNOWNED fast-marker finalize fixture files surfaced above (GAP-A/B/C). No file outside
the 9-file write set was modified; no commit made.
