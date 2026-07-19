evidence-binding: n8-walkthroughs b93878b6028c
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: behavior-preserving retirement of fast/full test sections for a removed feature across the 6 walkthrough simulators (delete fast/full scenario functions + resolveInstalledPaths/installed_paths-membership/fast-startup blocks; migrate the plan-absent finalize fixtures onto the now-mandatory adaptive plan gate) — no natural failing-unit-test shape exists; the meaningful check is each edited walkthrough re-run green in its edition against the n2-n7 retired tree, exercising only the adaptive journeys.
<!-- regression-green|build-green|smoke-integration -->
regression-green: each edited walkthrough runs green on its OWN sections against the retired tree — canonical `node scripts/simulate-workflow-walkthrough.js` (all ~220 scenarios pass with the 3 n9-owned contract-validator-shelling tests set aside) and the codex port pass end-to-end (EXIT 0); the four forge/forge-codex ports pass every own-section scenario, their only residual reds being n9-owned (and two unowned) forge test scripts invoked by the walkthrough run() chain (see deferred_to_n9 below).

## verification_tier

regression-green

upstream_read: n1-recon 30aed1d97859
upstream_read: n7-opencode-kimi 2b3f8228b832

## task

n8-walkthroughs: excise the fast/full sections from all six walkthrough simulators (canonical
`scripts/simulate-workflow-walkthrough.js` + the five forge/codex ports), removing the fast/full
journey blocks, the `isFast`/fast-advance/full-advance/phase4 scenarios, the
`installed_paths`/`with_fast`/`WORKFLOW_PATHS`/`fast-summary`/`resolveInstalledPaths` references
that assert fast/full membership, while preserving every adaptive journey and the unrelated-"full"
vocabulary (trap 1). Scoped verification: each edited walkthrough runs green in its edition against
the leg's n2-n7-applied retired tree, now exercising only the adaptive journeys.

## write_set (tracked files actually changed — exact match to the binding-constraint 6-file row)

- scripts/simulate-workflow-walkthrough.js                                           (MODIFIED)
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js               (MODIFIED)
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js       (MODIFIED)
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js (MODIFIED)
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js         (MODIFIED)
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js   (MODIFIED)

`git status --porcelain | grep walkthrough` shows exactly these 6 ` M` entries; NO n9-owned
validator/test-script or any other path outside the row was touched (`git status | grep -E
'validate-*|test-*-workflow-scripts|test-*-sinks'` → none). All temporary verification skips (see
below) were reverted — `grep -rl TEMP-N9-DEFER scripts plugins` → none.

## the core migration (why finalize fixtures changed, not just deletions)

n4 collapsed a plan-absent finalize to an unconditional `adaptive_plan_missing` refusal. The old
`markPlanAbsentFinalizeFixtureFast(root, project)` helper made a plan-absent finalize succeed by
marking the state `workflow_path: fast` (the retired fast N/A gate skipped verification). Post-
retirement that shortcut is illegal, so the helper was RENAMED → `seedAdaptiveFinalizeFixture` and
REBUILT to seed the minimum an authored adaptive run leaves behind so finalize's adaptive
`--finalize-check` proceeds to the archive/closure behavior each fixture actually asserts:
 - a minimal FROZEN adaptive plan (`code-explorer -> finalize`; or `code-explorer -> tdd-guide(writeSet)
   -> code-reviewer -> finalize` when the fixture commits real production files on the feature branch,
   so the tdd-guide node's declared write set ATTRIBUTES them for the finalize attribution sweep);
 - a consumer-mode `.cache/final-validation.md` with `verdict: pass` + a `validated_candidate_hash`
   from the validator's `--candidate-hash` (matching the finalize-time code tree);
 - for a schema-2 (startup-authored) state, the epoch-authority binding (`active_plan_hash`/`plan_hash`/
   `first_node_id`/`first_node_role`) + a `workflow-tasks.json` mirror, so `verifyArchiveEpochAuthority`
   no longer refuses `state_planless_authority_invalid`; a pre-epoch (legacy) plantActiveFolder state
   is accepted as-is (the legacy authority path ignores the plan file).
Two mechanical consequences handled per-fixture: (1) the candidate hash must be recorded AFTER the
last code-band write, so fixtures that write a gh/glab/tea shim (`bin/*.js`) or a bundle mock after
the old seed had the seed moved to just before finalize; (2) worktree E2E fixtures that commit a
feature file and finalize FROM the linked worktree seed into the worktree (not main) with the
feature path in the write set. One deliberately-non-git fixture and one manual-state keep-open
fixture had `initGitRepo` added (the adaptive gate needs git for candidate-hash + the sweep).

## per-file excision summary

### scripts/simulate-workflow-walkthrough.js (canonical)
- Helper: `markPlanAbsentFinalizeFixtureFast` → `seedAdaptiveFinalizeFixture` (rebuilt as above; 36 call sites renamed).
- DELETED fast scenario fns + registrations: `testRepairFastPath`, `testRepairFastEscalation`,
  `testRepairFastNoArgSingle`, `testRepairFastNoArgAmbiguous` (repair-state no longer routes fast),
  plus the retired numbered-ladder repair `testRepair` (routed `/kaola-workflow-phase2`) — all removed
  from `SHARED_TMP_NAMES` / `runSharedTmpGroup` / the scenario registry. `testFastStartupState`,
  `testResumeFastEmptyNextCommand`, `testFastE2EMergeFullChain` (fast startup/resume/E2E) DELETED +
  deregistered.
- `testRepairFinalizationRoute`: removed only the R3 block (retired `routeFinalization` /
  phase5-review->finalization-names); kept R1/R2/R4 (finalization-summary completion + surviving
  phase6->finalization legacy migration).
- `testAdaptiveAuditCoverage` I4: replaced the `resolveInstalledPaths` contract + fast/full
  `isLegalWorkflowPath` membership asserts (resolveInstalledPaths is removed → would throw) with a
  minimal adaptive-only assert (`WORKFLOW_PATHS===['adaptive']`, adaptive legal, fast/bogus illegal).
- testFinalize: seed now writes a gate-passing final-validation; its #324-AC3 false-absolute claim is
  APPENDED below the verdict (gate passes AND the claim is still neutralized in the archive).
- testFinalizeIncompleteWorktreeReentryFix: archived crash-state given a frozen plan + gate + state
  `workflow_path: fast`→`adaptive` (a real crash archives the plan).
- KEPT (trap 1 / decision 2, all still green): `testClassifierFastScope*` (classifier's retained,
  untouchable fast-summary `## Scope` overlap reads); `testAdaptiveResumeReconcilesNextCommand`
  (adaptive reconciles a stale `/kaola-workflow-phase4`; legacy `workflow_path: full` tolerance
  controls); `escalated_to_full` adaptive vocab; the module-top `installed_paths: []` adaptive-default
  seed; negative "must-NOT-retain phaseN" closure assertions.

### plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (codex)
- Helper rebuilt (via the port's `runVal`/`codexValidator`) + 10 call sites renamed.
- DELETED `testCodexInstalledPathsPartition543` (#543) + its call — it drove the retired codex-installer
  `--with-fast`/`--with-full` → `installed_paths` UNION writer, which n5 removed (seedKaolaConfig now
  never writes installed_paths).
- `testKeepOpenArchiveStamp333`: added `initGitRepo` (adaptive gate needs git).
- `testCodexBundleFinalizeAllOpenCloseIsPending`: seed moved after the gh-mock write.
- Module-top comment de-referenced the retired `resolveInstalledPaths`.

### plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- Helper rebuilt (gitlab validator + inline freeze/candidate-hash) + 9 call sites renamed.
- DELETED `testRepairFastEscalation` + its call; removed the retired R3 `routeFinalization` block from
  `testRepairFinalizationRoute` (kept R1/R2/R4).
- Seed moved after the bundle-mock write in the #342-S5 and #508 bundle finalize fixtures.
- Module-top installed_paths comment updated to adaptive-only.

### plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
- Same set of edits as the gitlab port (gitea validator; `testRepairFastEscalation` deleted; R3
  removed; #342-S5 + #508 bundle seeds reordered; module-top comment updated).

### plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js
- Helper rebuilt (gitlab validator + `glSpawn`) + 3 call sites renamed. Finalize fixtures are git
  repos with legacy-minimal states → plan+gate seed suffices; no other fast blocks present.

### plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js
- Helper rebuilt (gitea validator + `gtSpawn`) + call sites renamed; mirror of the gitlab-codex port.

Trap 1 honored across all six: only the specific fast/full-PATH tokens were excised; `escalated_to_full`,
"full envelope/diff", git plumbing, and the classifier's tolerant fast-summary reads were preserved.
No grep-and-delete of the substring "full" was performed.

## verification_commands + results (per walkthrough)

1. `node scripts/simulate-workflow-walkthrough.js` — own sections GREEN. Full un-skipped run reaches
   116 PASSED then stops at the deferred `testContractValidatorOfflineSkip` (shells the n9-owned
   `validate-workflow-contracts.js`, still asserting `commands/kaola-workflow-phase1.md is missing`).
   With that + `testContractValidatorReflowTolerant` + `testContractValidatorMissingTag` (the only
   three tests that shell n9's validator) set aside, the FULL suite passes: "Workflow walkthrough
   simulation passed" (EXIT 0, ~220 scenarios). Verified via temporary skip, reverted.
2. `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — EXIT 0, "Kaola-Workflow
   walkthrough simulation passed" (full pass, NO deferred residual).
3. `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — own sections
   GREEN ("GitLab workflow walkthrough simulation passed" with the run() forge scripts set aside);
   deferred failure below.
4. `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` — own
   sections GREEN ("GitLab Codex workflow walkthrough simulation passed" with run() forge scripts set
   aside); deferred failure below.
5. `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — own sections
   GREEN ("Gitea workflow walkthrough simulation passed" with run() forge scripts set aside).
6. `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` — own
   sections GREEN ("Gitea Codex workflow walkthrough simulation passed" with run() forge scripts set aside).
7. `node -c` syntax-checks green on all 6; `git status --porcelain | grep walkthrough` = exactly the 6 files.

## deferred_to_n9 (walkthrough run()/exec chains that shell still-stale n9-owned scripts — NOT touched)

deferred_to_n9: scripts/validate-workflow-contracts.js — testContractValidator{OfflineSkip,ReflowTolerant,MissingTag} shell it; refuses "commands/kaola-workflow-phase1.md is missing" (n2-deleted command; n9 owns this validator). Canonical's ONLY residual red.
deferred_to_n9: plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js — run() at simulate-gitlab-workflow-walkthrough.js:1655 / simulate-gitlab-codex-...:155; a fast-marker finalize fixture inside it refuses finalize_gate_unverified/adaptive_plan_missing (n9-owned).
deferred_to_n9: plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js — run() at simulate-gitea-workflow-walkthrough.js:1735 / simulate-gitea-codex-...:125; same adaptive_plan_missing fast-marker fixture (n9-owned).
deferred_to_n9: plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — run() at simulate-gitlab-codex-...:154; refuses "expected 11 GitLab command files" (n2 deleted 6 fast/phase commands; n9-owned).
deferred_to_n9: plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — run() at simulate-gitea-codex-...:124; refuses "expected 11 Gitea command files" (n9-owned).

## WRITE-SET GAP surfaced (unowned by any #725 node — neither n8 nor n9)

GAP (forge sink test scripts carry a retired fast-marker finalize fixture): `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` and `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` each still call the old `markPlanAbsentFinalizeFixtureFast` (state `workflow_path: fast`) and finalize, now refusing `adaptive_plan_missing`. Both are RED standalone AND are shelled by the gitlab/gitea/codex walkthrough run() chains, so they keep those chains red. They are in NO node's declared write set (grep of workflow-plan.md: absent), so neither this node (write set = the 6 walkthroughs) nor n9 (write set lists only test-{gitlab,gitea}-workflow-scripts.js, not the -sinks.js) will fix them. Recommended remedy: extend n9's write set (or add a follow-up) to migrate the two `*-sinks.js` fast-marker finalize fixtures to a seeded adaptive plan, mirroring this node's helper — otherwise the four-chain gate cannot go fully green at finalize.

## before_result

Serial-chain reality: at this leg's start, all six walkthroughs were RED because the underlying n2-n7
retirement had landed but the walkthroughs still (a) exercised the retired fast/full scenarios
(repair-state fast routing, fast startup/resume/E2E, the codex `--with-fast` installer partition,
`resolveInstalledPaths`), and (b) jumped claim→finalize through the retired plan-absent shortcut,
which n4 now refuses `adaptive_plan_missing`. `node scripts/simulate-workflow-walkthrough.js`
initially threw in `testFinalize` (`finalize should report closed` — finalize refused).

## after_result

Every edited walkthrough runs GREEN on its own sections against the retired tree, exercising only the
adaptive journeys: the canonical + codex suites pass fully (codex EXIT 0 end-to-end; canonical EXIT 0
with the 3 n9-validator-shelling tests set aside) and the four forge/forge-codex ports pass every
own-section scenario. The only residual reds are the n9-owned contract validators / forge test scripts
invoked by the walkthrough run() chains (recorded as deferred_to_n9) plus the two unowned
`*-sinks.js` scripts (surfaced as a write-set gap). No file outside the 6-walkthrough write set was
modified; all temporary verification skips were reverted. No commit made.
