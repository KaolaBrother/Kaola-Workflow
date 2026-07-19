evidence-binding: n1-repair 5ea5f85f1880
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: all three findings are fix_role: implementer completing a behavior-preserving retirement (a fixture migration, an assertion-pin removal, and a mirror edit) with no natural failing unit test — correctness is verified by the four edition chains plus the opencode/kimi suites.
<!-- regression-green|build-green|smoke-integration -->
regression-green: all four edition chains (claude/codex/gitlab/gitea) plus the opencode and kimi suites ran green after the repair, over the SAME leg that was red at n11-code-certify; the three previously-red owning test files (test-bundle-finalize.js, test-gitlab-sinks.js, test-gitea-sinks.js) plus the two contract validators re-verified standalone green as well.

upstream_read: n11-code-certify 8e305ecc6190
upstream_read: n1-recon 30aed1d97859

## task

n1-repair (EPOCH-2 child plan, single fix-producer node): fix the three blocking findings the
n11-code-certify gate raised against Phase A's retirement work, within the 9-file write set
declared by the child plan — no other files touched.

- F1 (validation): migrate the three plan-absent finalize fixtures
  (`scripts/test-bundle-finalize.js`, `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`,
  `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`) off the retired `workflow_path: fast`
  seed onto the proven `seedAdaptiveFinalizeFixture` pattern already used in
  `scripts/simulate-workflow-walkthrough.js` (and in n9's `test-{gitlab,gitea}-workflow-scripts.js`).
- F2 (validation): remove ONLY the `'fast-summary.md'` entry from the
  `assertConcept('CLAUDE.md', 'compact durable state contract', [...])` list in the three contract
  validators (`scripts/validate-workflow-contracts.js`,
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`,
  `scripts/validate-kaola-workflow-contracts.js`), keeping the two `validate-workflow-contracts.js`
  copies byte-identical and leaving the classifier tolerant-read / workflow-next legacy-marker
  fast-summary pins untouched.
- F3 (correctness): stop the three Codex finalize SKILL packs
  (`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`,
  `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`,
  `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`) from shelling the deleted
  `kaola-workflow-full-advance.js` / forge ports, mirroring the refusal wiring n6 already applied to
  the three `kaola-workflow-finalize.md` COMMAND copies.

Traps observed: `classifier.js` and `validation-runner.js` were not touched; the substring "full" was
never grep-and-deleted (the byte-identical survivor `escalated_to_full` and the git-plumbing /
"full envelope" vocabulary are untouched everywhere, including in the SKILL packs' unrelated fast/full
prose at other line ranges, which was deliberately left alone as Category-C/Phase-D-deferred per the
n1-recon manifest — only the dangling full-advance SHELL block was replaced).

## F1 — fixture migration detail

Root cause: `cmdFinalize` now refuses `adaptive_plan_missing` when `workflow-plan.md` is absent
(fast/full retired), so any fixture that jumped straight from a hand-rolled `workflow_path: fast`
state to `finalize` started refusing instead of exercising the archive/closure behavior under test.

- `scripts/test-bundle-finalize.js`: added `planValidatorScript` + a local
  `seedAdaptiveFinalizeFixture(tmpRoot, project)` helper (frozen 2-node adaptive plan
  `code-explorer -> finalize`, all-`complete` ledger, `.cache/final-validation.md` with
  `verdict: pass` + a `--candidate-hash`-derived `validated_candidate_hash`). `writeBundleStateFile`/
  `writeSingleStateFile` now scaffold `phase: adaptive` / `phase_name: Adaptive` /
  `workflow_path: adaptive` (matching claim.js's real adaptive scaffold) instead of the retired fast
  triple. `seedAdaptiveFinalizeFixture` is called explicitly at each of the ~9 `finalize`-subcommand
  call sites, placed LAST — after every other fixture file (gh mock script, roadmap files, custom gh
  shims) is written — so the recorded `validated_candidate_hash` matches the tree finalize
  recomputes over at gate time (an earlier in-function seed attempt failed with
  `final_validation_stale` because `bin/gh.js` was written AFTER the seed in several tests; discovered
  by direct repro and confirmed by n8's own evidence note about the identical ordering requirement).
  `release`/`watch-pr` subcommand call sites were left unseeded (confirmed by direct repro: they never
  hit the plan gate — only `finalize` does). The one two-call crash-recovery test
  (`testCrashRecoveryFinalizeRerunAfterArchive`) seeds only before the FIRST finalize call — the
  second call resumes from the archive, which already carries the seeded plan+cache from the first
  run.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: renamed+rebuilt
  `markPlanAbsentFinalizeFixtureFast` -> `seedAdaptiveFinalizeFixture` (byte-parallel to n9's own
  `test-{gitlab,gitea}-workflow-scripts.js` copy: `computePlanHash` from the in-process
  `require('./kaola-{gitlab,gitea}-workflow-plan-validator')`, `--freeze --json` then
  `--candidate-hash --json` shelled via the forge's own plan-validator script, optional schema-2
  `active_plan_hash` state rewiring). Both call sites (`wtPath`, `mainRoot` — the `finalize
  --keep-worktree` linked-worktree E2E fixture) updated; no fixture-file-after-seed ordering issue
  here since nothing outside `kaola-workflow/` is written after the seed in either root (that path
  stays validation-invisible regardless of write order).

## F2 — validator pin detail

Removed the `'fast-summary.md'` line (only) from the `CLAUDE.md` `assertConcept` list at ~L318/322 in
all three validators. Left untouched: the classifier tolerant-read `assertIncludes(...,
'fast-summary.md')` pins, the `commands/workflow-next.md` legacy-marker pin, and the SEPARATE
`docs/workflow-state-contract.md` 'generated mirrors' `assertConcept` (still legitimately documents
the retained tolerant-read concept). `scripts/validate-workflow-contracts.js` and
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` re-diffed byte-identical after the
edit.

## F3 — SKILL shell-block detail

Replaced the `If workflow_path: full (or absent), run the read-only Phase 5 point-of-use verifier...`
paragraph plus its bash block (the `codex plugin list --json` plugin-tuple preflight used ONLY to
build `KAOLA_FULL_ADVANCE_NAME`/`KAOLA_FULL_ADVANCE`, the lstat path-verifier, and
`node "$KAOLA_FULL_ADVANCE" phase5-verify ...`) with the same typed-refusal prose
`commands/kaola-workflow-finalize.md` ~L129-135 already carries: "If `workflow-plan.md` is absent,
`cmdFinalize` refuses unconditionally ... with the typed `finalize_gate_unverified` /
`adaptive_plan_missing` refusal ... `BLOCKED: finalize_gate_unverified (adaptive_plan_missing) —
restore the frozen workflow-plan.md before Finalization.`" Text was byte-identical across all three
SKILL packs before the edit (the `case` block lists all three edition names generically) and stays
byte-identical after. Deliberately left untouched (Category-C / Phase-D-deferred per n1-recon, and
outside this node's declared correctness fix): the `workflow_path: fast` / `fast-summary.md` branch
prose at ~L149-153/351 and the `<!-- PIN: fast-compliance-backstop -->` legacy paragraph at ~L350 —
neither shells a deleted script, so leaving them is chain-safe; touching them was not requested and
would have widened scope. Confirmed no manifest/needle regression: `node scripts/test-route-reachability.js`
(2277 assertions) and both forge contract validators stayed green after the edit with NO write-set
gap surfaced.

## write_set (exact match to the declared 9-file row; `git status --porcelain` grep confirms no strays)

- scripts/test-bundle-finalize.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- scripts/validate-kaola-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

## verification_commands + results

- `node scripts/test-bundle-finalize.js` — before: `36 test(s) FAILED, 79 passed`; after:
  `test-bundle-finalize: all 149 tests passed` (exit 0).
- `cd plugins/kaola-workflow-gitlab/scripts && node test-gitlab-sinks.js` — before: uncaught
  `AssertionError` at `finalize --keep-worktree should exit 0` (line 826 pre-repair); after:
  `GitLab sink tests passed` (exit 0).
- `cd plugins/kaola-workflow-gitea/scripts && node test-gitea-sinks.js` — before: same
  `AssertionError` shape (line 791 pre-repair); after: `Gitea sink tests passed` (exit 0).
- `node scripts/validate-workflow-contracts.js` — before: refused "CLAUDE.md must document compact
  durable state contract; missing: fast-summary.md"; after: `Workflow contract validation passed`
  (exit 0).
- `node scripts/validate-kaola-workflow-contracts.js` — before: same refusal shape; after:
  `Kaola-Workflow Codex contract validation passed` (exit 0).
- `node scripts/test-route-reachability.js` — `Route-reachability test passed (2277 assertions).`
  (exit 0; unchanged before/after — confirms F3's edit trips no manifest pin).
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
  `Kaola-Workflow GitLab contract validation passed` (exit 0).
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` —
  `Kaola-Workflow Gitea contract validation passed` (exit 0).
- `npm run test:kaola-workflow:claude` — before (n11-code-certify's run): RED at
  `test-bundle-finalize.js` (F1) and `validate-workflow-contracts.js`/walkthrough (F2); after:
  exit 0 (full chain, including `test-bundle-finalize.js`, `validate-workflow-contracts.js`,
  `test-claim-hardening.js`, `simulate-workflow-walkthrough.js` -> "Workflow walkthrough simulation
  passed", `generate-routing-surfaces --check` -> all 12 surfaces byte-match, exit 0).
- `npm run test:kaola-workflow:codex` — before: RED at `validate-kaola-workflow-contracts.js` (F2);
  after: exit 0 (`Kaola-Workflow walkthrough simulation passed`, `generate-routing-surfaces --check`
  green).
- `npm run test:kaola-workflow:gitlab` — before: RED at `test-gitlab-sinks.js:826` (F1); after:
  exit 0 (`GitLab Codex workflow walkthrough simulation passed`, `generate-routing-surfaces --check`
  green).
- `npm run test:kaola-workflow:gitea` — before: RED at `test-gitea-sinks.js:791` (F1); after:
  exit 0 (`Gitea Codex workflow walkthrough simulation passed`, `generate-routing-surfaces --check`
  green).
- `node scripts/test-opencode-edition.js` — `opencode-edition test passed (396 assertions).`
  (exit 0; unowned by this leg's write set, run anyway per the scoped-verification instruction).
- `node scripts/test-kimi-edition.js` — `kimi-edition test passed (440 assertions).` (exit 0; same).

## before_result

n11-code-certify's gate run (evidence `kaola-workflow/issue-725/.cache/epochs/1/files/.cache/n11-code-certify.md`,
`8e305ecc6190`) recorded: claude chain RED at `test-bundle-finalize.js` (F1) AND
`validate-workflow-contracts.js` + `simulate-workflow-walkthrough.js`'s
`testContractValidatorOfflineSkip` (F2, shelled); codex chain RED at
`validate-kaola-workflow-contracts.js` (F2); gitlab chain RED at `test-gitlab-sinks.js:826` (F1);
gitea chain RED at `test-gitea-sinks.js:791` (F1); opencode/kimi suites green (unaffected — those two
files are outside `npm test`/the four edition chains). All three findings anchored to files outside
every prior node's declared write set (F1/F3 in unowned files per n1-recon's GAP-1 table; F2 in the
three validators, upstream of n10's correct CLAUDE.md edit).

## after_result

All 9 write-set files edited; all six required suites (claude, codex, gitlab, gitea edition chains +
opencode + kimi) exit 0 on this leg, over the SAME complete accumulated Phase-A tree n11-code-certify
reviewed (claim root base `33a1ca57`, HEAD == base, only this repair leg's 9-file diff added on top).
No write-set gap surfaced (route-reachability + both forge contract validators re-verified green after
the F3 edit). No file outside the declared 9 was modified (`git status --porcelain` cross-checked
against the 9-file list). No commit made.
