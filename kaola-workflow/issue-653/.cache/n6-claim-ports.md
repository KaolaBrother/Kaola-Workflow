evidence-binding: n6-claim-ports 7677bf6348b9
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca
upstream_read: n5-selection-rungaps f05d57b01682

non_tdd_reason: mechanical forge-port mirror of the accumulated root claim.js diff (git diff
7daa7fbaefcd6158ad15095324201ec039f7f019 -- scripts/kaola-workflow-claim.js, including working-tree
changes) — behavior-preserving hand-port modulo forge nouns, no natural failing unit test; the
forge walkthrough asserts authored in this node are the behavioral gate, extending
gitlab walkthrough:1017-1047 / gitea walkthrough:1282-1312.

regression-green: all validation green before recording this evidence.
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` ->
  "GitLab workflow walkthrough simulation passed" (26 cases incl. new
  testGitlabAttestationWarningPersistence: PASSED, testGitlabSelectionEvidenceDocking: PASSED).
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` ->
  "Gitea workflow walkthrough simulation passed" (26 cases incl. new
  testGiteaAttestationWarningPersistence: PASSED, testGiteaSelectionEvidenceDocking: PASSED).
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` ->
  "GitLab Codex workflow walkthrough simulation passed" (static M2/M4-style needles for
  '## Attestation' and 'selection_evidence' added and passing, plus the pre-existing bundle
  regression cases: testFinalizeArchiveVerifiesBeforeDelete / testFinalizeClosesIssueBundleMembers /
  testFinalizeRoadmapResidueDetection / testBundleStateIncoherent all PASSED).
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` ->
  "Gitea Codex workflow walkthrough simulation passed" (same needle pair added; same 4 bundle
  regression cases PASSED).
- `node scripts/validate-script-sync.js` -> "OK: 24 common scripts, 27 byte-identical groups, 8
  rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge
  export-superset families in sync." (the two claim ports remain a correctly-recognized
  rename-normalized family — no drift flagged).
- Four cross-edition chains, run SEQUENTIALLY (not `&&`-shortcircuited), each exit 0:
  `npm run test:kaola-workflow:claude` CLAUDE_CHAIN_EXIT_STATUS=0 (includes
  testAttestationWarningPersistence: PASSED, testSelectionEvidenceDocking: PASSED from n2/n5,
  "Workflow walkthrough simulation passed", routing-surfaces checks green — unaffected by this
  node, confirms no regression);
  `npm run test:kaola-workflow:codex` CODEX_CHAIN_EXIT_STATUS=0 (includes
  testAttestationWarningPersistenceCodex: PASSED, testSelectionEvidenceDockingCodex: PASSED,
  "Kaola-Workflow walkthrough simulation passed" — unaffected by this node, confirms no
  regression);
  `npm run test:kaola-workflow:gitlab` GITLAB_CHAIN_EXIT_STATUS=0 ("Kaola-Workflow GitLab contract
  validation passed", "GitLab workflow walkthrough simulation passed", "GitLab Codex workflow
  walkthrough simulation passed" — the two forge chains that were previously lagging by design
  per Plan Notes are now FULLY GREEN with the ported claim.js behavior exercised);
  `npm run test:kaola-workflow:gitea` GITEA_CHAIN_EXIT_STATUS=0 ("Kaola-Workflow Gitea contract
  validation passed", "Gitea workflow walkthrough simulation passed", "Gitea Codex workflow
  walkthrough simulation passed", same posture).

## Accumulated diff verified before porting

`git diff 7daa7fbaefcd6158ad15095324201ec039f7f019 -- scripts/kaola-workflow-claim.js` (includes
committed + uncommitted root changes) contains EXACTLY 4 hunks, matching n2's and n5's isolation
claims byte-for-byte:
1. `appendClosureBlock` — extended with 2 new column-0 fields (`claim_planner_attested`,
   `finalize_contractor_attested`) in the fields object literal (n2, A3).
2. New function `persistAttestationToSummary(destDir, receipt)` inserted beside
   `appendClosureBlock` (n2, A3).
3. New function `probeSelectionEvidence(cacheDirCandidates)` inserted immediately after (n5, D3).
4. `cmdFinalize`: two new call sites after `checkDispatchAttestations(...)` (persist +
   selection-evidence probe attach), plus TWO extended `appendClosureBlock({...})` call-site
   object literals gaining the 2 new fields — the single-issue `cmdFinalize` path AND the
   bundle-watch **merged-branch only** (`checkDispatchAttestations`/`appendClosureBlock` inside
   the `state === 'merged'` arm of the watch-pr closure loop; the sibling `state === 'closed'`
   (abandoned) arm's `checkDispatchAttestations` call was confirmed NOT touched by the root diff
   — it has no `appendClosureBlock` call to extend, matching n2's evidence note "the bundle
   watch-pr merged-closure path" — singular).

n3 and n4 confirmed to contribute ZERO claim.js hunks, consistent with n1-design's isolation note
and n3/n5's own evidence.

## Hunk inventory mirrored (per upstream node)

- **n2-attestation**: `persistAttestationToSummary` function + its `cmdFinalize` call site
  (`if (result.dest) persistAttestationToSummary(result.dest, closureReceipt);`); the
  `appendClosureBlock` field-literal extension (`claimPlannerAttested`/`finalizeContractorAttested`)
  applied at its TWO call sites (`cmdFinalize`'s `invariantResult`-keyed call, and the
  bundle-watch merged-branch `folderInvariants`-keyed call).
- **n5-selection-rungaps**: `probeSelectionEvidence` function + its single `cmdFinalize` call site
  (`closureReceipt.selection_evidence = probeSelectionEvidence([archiveCacheDir, liveCacheDir]);`),
  inserted immediately after n2's `persistAttestationToSummary` call in both files, same relative
  order as root.

## Forge-noun adaptations made

None required in the ported claim.js code itself — the 4 hunks (2 new functions + field-literal
extensions + call sites) are 100% forge-neutral (no `gh`/`glab`/`tea` CLI tokens, no
issue-vs-merge-request terminology) and were inserted byte-for-byte identical to root's new code,
verified via a direct text diff of the new regions against root (only line-number offsets differ,
consistent with each port's pre-existing structural divergence). Insertion points were matched to
each port's OWN existing surrounding comment text (gitlab's `reconcileRoadmapForClosure` preceding
comment reads "reused by archiveProjectDir's close loop AND cmdFinalize's source-missing backstop
so a crash-resume converges (the #395 fix)"; gitea's reads "(reused by the cmdFinalize
source-missing backstop for crash-resume convergence — the #395 fix)" — pre-existing wording
divergence between the two ports, left untouched; my new functions were inserted before each
port's own existing text, not root's).

One STRUCTURAL divergence confirmed and respected, not adapted: both gitlab and gitea have a
THIRD `checkDispatchAttestations` call site (the `state === 'closed'`/abandoned branch of the
watch loop, using `claimLabelStatus2`/`folderInvariants` but with NO `appendClosureBlock` call
following it) that root also has and that the accumulated diff does NOT touch — left untouched in
both ports, matching root exactly (verified via `grep -n` producing 3 `checkDispatchAttestations([`
call sites in all three files: root, gitlab, gitea, with the diff only touching 2 of the 3 in
each).

Forge-noun distinction observed in the WALKTHROUGH ASSERTS I authored (not the ported code): gitlab
single-issue project fixtures use `## GitLab` / `issue_iid:` / `sink: merge` (matching
testGitlabFinalizeRoadmapResidueDetection's established minimal shape); gitea fixtures omit the
`## Gitea` section entirely and use `sink: pr` (matching testGiteaFinalizeRoadmapResidueDetection's
established minimal shape) — gitea's PR terminology vs gitlab's MR terminology, following each
edition's pre-existing test-fixture convention rather than inventing a new one.

## Per-file summary

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — mirrored all 4 hunks
  (2 new functions inserted before `reconcileRoadmapForClosure`; `appendClosureBlock`'s field
  string extended with 2 new lines; `cmdFinalize`'s single-issue path gained the 2 new call sites
  + the `appendClosureBlock` call gained 2 new object-literal fields; the bundle-watch
  merged-branch `appendClosureBlock` call gained the same 2 fields). Syntax-checked
  (`node -c`), both new functions confirmed defined exactly once.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — identical mirror, same 4
  hunks at gitea's own line numbers. Syntax-checked, both new functions confirmed defined exactly
  once.
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — 2 new
  behavioral test functions inserted after `testGitlabPlannerAttestBackfill` (and registered
  immediately after that call in the invocation list):
  `testGitlabAttestationWarningPersistence` (seeds `.cache/dispatch-log.jsonl` with a
  contractor-only entry, runs `finalize` offline via the established
  `glWriteProject` + minimal-single-issue-state pattern, asserts
  `closure_receipt.claim_planner_attested === 'missing'`, the archived `finalization-summary.md`
  carries column-0 `claim_planner_attested: missing` + the verbatim ATTESTATION WARNING string,
  and the archived `workflow-state.md` `## Closure` block carries the same field) and
  `testGitlabSelectionEvidenceDocking` (two sub-cases: a project with `.cache/selection-evidence.md`
  seeded pre-finalize asserts `closure_receipt.selection_evidence === 'present'` and the file's
  survival under the archived `.cache/`; a sibling project with nothing seeded asserts `'absent'`).
  Both mirror root's `testAttestationWarningPersistence` / `testSelectionEvidenceDocking` in
  assertion shape, adapted to this edition's offline `glWriteProject`-based finalize-test
  convention (rather than root's online startup+finalize round-trip via a gh shim) since that is
  the established idiom for finalize-behavior tests throughout this file (e.g.
  `testGitlabFinalizeRoadmapResidueDetection`).
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — identical pair
  (`testGiteaAttestationWarningPersistence`, `testGiteaSelectionEvidenceDocking`), inserted after
  `testGiteaPlannerAttestBackfill` and registered the same way, using `gtWriteProject` +
  `_initGitRepo` + `gtPlantRoadmapIssue`.
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` — 2 new
  static source-text needle assertions added beside the pre-existing M2/M4 `run_posture` /
  `claim_planner_attested` checks, following the same throw-typed-Error convention: the ported
  claim.js source must include `'## Attestation'` and `'selection_evidence'`. This file is a thin
  static-needle + `run()`-delegate wrapper (does not itself simulate `finalize`); the deep
  behavioral coverage lives in the main gitlab walkthrough above, which
  `npm run test:kaola-workflow:gitlab` runs immediately before this file in the same chain.
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` — identical
  pair of needle assertions, same convention.

## Declared-write-set discipline

No file outside the 6 declared repo-relative paths (plus this evidence file) was touched. No new
test files were created (write-set discipline per n1-design's closing note); all new assertions
live inside the 4 already-declared walkthrough files.
