evidence-binding: e3-lifecycle-publication-repair ab570f6a38d1
upstream_read: e1-epoch3-authority-blueprint a224da30381a
upstream_read: e2-versioned-epoch-repair 5558d54a8213
prior_generation_handback_read: e3-lifecycle-publication-repair 0e932924a6e7

RED: The prior e3 generation's core RED (handback 0e932924a6e7) was that the shared E2 planless
verifier ACCEPTED malformed epoch authority, so the composed destructive callers could not refuse.
Its hermetic probe recorded, for each single-field mutation on one fresh planless claim:
  {"mutation":"missing_schema","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
  {"mutation":"unknown_schema","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
  {"mutation":"missing_lineage","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
  {"mutation":"tampered_lineage","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
Because verifyCurrentEpochAuthority/verifyAllEpochSnapshots returned ok:true, the release/finalize/
watch callers would have archived a corrupted authority (the malformed-authority destructive-caller
refusal could not be proven inside E3 and was handed back to E2). This resume also reproduced a tree
RED that blocked node close: `node scripts/edition-sync.js --check` exited 1 because the Codex claim
mirror (plugins/kaola-workflow/scripts/kaola-workflow-claim.js) differed from canonical by the 12-line
epoch_lineage_preserved rebind hunk in checkClosureInvariants; `grep -c "Rebind the"` was 1 in
canonical and 0 in the Codex mirror AND 0 in both forge claim ports — the handback's "manually mirrored
to both forge claim ports and generated to Codex" was not actually present in the tree.

GREEN: E2 attempt-2 (5558d54a8213) hardened both shared verifiers, unblocking the E3 RED. Fresh
final-tree runs (real $? captured directly, never through a pipe):
  - malformed-authority caller probe ($TMPDIR, fresh planless claim per mutation, one field tampered
    each): all four now REFUSE from verifyCurrentEpochAuthority with typed reasons
    state_epoch_schema_missing / state_epoch_schema_unsupported / state_epoch_lineage_missing /
    state_epoch_lineage_mismatch; the `release` caller exits 1 AND preserves the live project for
    every mutation (live_project_preserved:true); release stdout carries the E2 reason verbatim
    ({"released":false,"result":"refuse","reason":"state_epoch_lineage_mismatch",...}).
  - node scripts/test-adaptive-handoff.js -> exit 0, "adaptive-handoff tests passed (170 assertions)".
  - node scripts/test-adaptive-node.js -> exit 0, "adaptive-node tests passed (2237 assertions)".
  - node scripts/test-claim-hardening.js -> exit 0, "claim-hardening tests passed (266 assertions)".
  - node scripts/test-bundle-finalize.js -> exit 0, "test-bundle-finalize: all 149 tests passed".
  - node scripts/simulate-workflow-walkthrough.js --only testReviewOutcomeTransport699 --only
    testManualArchiveBackstop --only testPlanlessAndPlannedInitialAuthority699 --only
    testArchiveCallersFailClosed699 --only testFinalizeArchiveVerifiesBeforeDelete --only
    testArchiveCompleteSourceRelative676 -> exit 0, "Walkthrough --only subset passed (6 scenarios)".
    testPlanlessAndPlannedInitialAuthority699 now includes the added durable regression: the four
    malformed epoch-authority mutations each stop the destructive `release` caller with the exact E2
    reason AND leave the live project on disk (guards against a false-positive stop).
  - node scripts/edition-sync.js --check -> exit 0, "12 forge aggregator ports, 25 COMMON_SCRIPTS
    mirrors, and 27 byte-identical groups in parity with canonical".
  - node scripts/validate-script-sync.js -> exit 0, "25 common scripts, 27 byte-identical groups,
    8 rename-normalized families, 2 hooks.json families, and 7 forge export-superset families in sync".
  - node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> exit 0.
  - node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> exit 0.
  - node --check on all four claim editions + the canonical walkthrough -> clean parse.

## Found already-done vs. completed this resume

Already-done by the prior generation (verified correct, not just green):
  - The claim-hardening #699 schema-2 fixtures already use real buildClaimAnchors digests (no
    `'1'.repeat(64)`/`'2'.repeat(64)`/`'3'.repeat(64)` placeholder remains anywhere in the file);
    the fresh-claim block exercises the real verifier and asserts canonical SHA-256 authority.
  - test-bundle-finalize.js's testCanonicalPlanlessEpochOneArchive699 fixture now carries
    `epoch_lineage_id: anchors.epoch_lineage_id` (line ~1517) and asserts the valid planless shape
    ARCHIVES SUCCESSFULLY — a positive fixture that genuinely exercises the shared verifier (omitting
    lineage yields archived:false, confirmed transitively by the caller probe). Both fixtures now pass
    for the right reason, not by asserting a refusal.
  - The lifecycle/archive-caller/source-rotation/first-node-publication implementation and the
    canonical checkClosureInvariants epoch_lineage_preserved rebind hunk were present in canonical.

Completed this resume (inside the declared write set):
  - Proved the handback's blocked RED is now GREEN end-to-end: malformed E2 authority refuses at both
    shared verifiers and every composed destructive caller (release), with the live project preserved.
  - Added a durable regression to scripts/simulate-workflow-walkthrough.js
    (testPlanlessAndPlannedInitialAuthority699) covering all four malformed epoch-authority mutations
    at the caller level, asserting nonzero exit + exact E2 reason + live-project preservation.
  - Ported the 12-line epoch_lineage_preserved rebind hunk (checkClosureInvariants) into both forge
    claim ports (plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js,
    plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js) — byte-identical logic; all
    referenced helpers (archiveEpochLineagePreserved, fs.existsSync) already present in both ports.
  - Re-synced the Codex claim mirror (plugins/kaola-workflow/scripts/kaola-workflow-claim.js) to
    byte-identity with canonical (the COMMON_SCRIPTS copy edition-sync --write performs), clearing the
    single edition-sync drift.
  - Ran the deferred read-only parity/validation reruns (edition-sync --check, validate-script-sync,
    both forge contract validators).

## Finding routed out of write set (classified, not worked around)

classification: cross-edition test-fixture gap, 699-introduced, root cause E3-claim-owned, fixture
files unallocated in the plan write sets.

Both forge walkthroughs crash before any finalize/archive scenario:
  - plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:316 (testGitlabAdaptive)
  - plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:597 (testGiteaAdaptive)
Both do `JSON.parse(spawnNode(claimScript, ['claim', ... '--workflowPath', 'adaptive'], tmp).stdout)`
on a temp dir that is never `git init`-ed, so the 699 claim-anchor requirement (buildClaimAnchors,
added in THIS run's claim diff: 4 additions, 0 at base d59b191c) returns `claim_root_unavailable` with
empty stdout -> "SyntaxError: Unexpected end of JSON input" -> the whole walkthrough aborts. The
canonical walkthrough's equivalent (testAdaptiveOffClaimRefusal) was updated with `initGitRepo(tmp)`
(scripts/simulate-workflow-walkthrough.js:1465); the two forge ports were not. These crashes are
independent of every edit in this node (the rebind hunk lives in checkClosureInvariants, never reached
by `claim`; running the gitlab claim from the worktree root succeeds; from a non-git temp dir it
refuses identically with or without my hunk). Fix belongs to whoever owns the forge walkthroughs:
mirror `initGitRepo`/`git init` into testGitlabAdaptive and testGiteaAdaptive (and any other bare-dir
adaptive-claim step) to match the canonical fixture. These files are NOT in the E3 declared write set
(E3 owns scripts/simulate-workflow-walkthrough.js only; E4 owns the package-fixture tests, not the
walkthroughs), so this is left for a plan write-set expansion / repair node. It will block the
`test:kaola-workflow:{gitlab,gitea}` chains at finalization until fixed.

## Bindings

upstream-bindings: e1-epoch3-authority-blueprint a224da30381a; e2-versioned-epoch-repair 5558d54a8213
plan-hash: f696f5a02b2d9a2b1f8822b75b26fa479d650e18346a779f75a571425420d9d0

# Follow-up (post-e4): two defects routed back from the e4 packaged-fixture agent

The e4 agent unblocked the two forge walkthrough/test-script crashes and thereby unmasked two
pre-existing defects; both were routed to this node.

## Finding 2 (production regression) — legacy-but-planned state misclassified as planless

RED: `verifyCurrentEpochAuthority` classifies a pre-#699 envelope-absent state as
`{ok:true, legacy:true}` (via validateEpochStateAuthority) but did NOT branch on that flag before the
schema-2 active/planless split. `active_plan_hash` defaults to 'none' for a legacy state, forcing
every legacy project down the strict planless branch; a legacy state carrying a real (old-format)
`plan_hash` + a real workflow-plan.md then refused `state_planless_authority_invalid`. Reproduced with
an isolated probe (the M2 #277 issue-970 legacy fixture shape): `verifyCurrentEpochAuthority` returned
`{"result":"refuse","reason":"state_planless_authority_invalid"}` while `verifyAllEpochSnapshots`
already returned `{"ok":true,"snapshots":[]}` (it guards `!epochAuthority.legacy` before building a
binding — the asymmetry localized the fix to verifyCurrentEpochAuthority alone). This blocked
finalize/archive of ANY pre-#699 planned project.

Chosen semantic: honor the classifier flag — `if (epochAuthority.legacy) return { ok: true,
authority_kind: 'legacy' }` immediately after the epoch-authority check, restoring the pre-#699
acceptance the archive/finalize consumers had before this gate existed. Safe because only an
envelope-absent state is ever classified legacy (a partially stripped schema-2 state already refuses
above), and the sole reachable legacy caller is the archive gate (checks only `.ok`); the
replan-prepare caller is gated on `epoch_schema_version === EPOCH_SCHEMA_VERSION` so it never sees a
legacy state.

GREEN: fix applied to canonical `scripts/kaola-workflow-replan.js` + all three ports
(`plugins/kaola-workflow/scripts/kaola-workflow-replan.js` byte-synced,
`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-replan.js` hand-ported —
identical edition-neutral hunk, present in all four). Probe now returns
`{"ok":true,"authority_kind":"legacy"}`. Added a focused regression to `scripts/test-replan.js`
(legacy state WITH a real plan → both verifiers accept) and corrected the pre-existing
envelope-absent test to assert `authority_kind === 'legacy'` (the old `=== 'planless'` was incidental
fall-through behavior; a pre-#699 state is not a schema-2 planless shape). `node scripts/test-replan.js`
-> exit 0, `test-replan: PASSED (957 assertions)`. Both forge walkthroughs' M2 (#277) finalize
scenario now passes.

## Finding 1 (incomplete schema-1 legacy snapshot fixture) — chosen option (c), reframed

The forge `testXxxReplanEditionContract699` archiveRoot block hand-wrote a `schema_version:1` epoch
manifest and asserted `verifyAllEpochSnapshots(...).ok`. schema-1 routes through
`verifyLegacyExternalBinding`, which requires the full external-seal chain (workflow-plan.next.md,
committed transaction, planner attestation, ...) that no live path produces anymore
(REPLAN_TRANSACTION_SCHEMA_VERSION is permanently 2). Option (b) is intractable
(`verifySchema2SnapshotBinding` requires an entire committed-transaction lifecycle output); option (a)
would port ~300 lines of non-importable test-replan internals into two files. The positive
byte-preservation is already covered canonically (test-bundle-finalize #699 via verifyArchiveComplete;
archiveProjectDir is edition-mirrored), so I took option (c) reframed as a STRONG fail-closed edition
contract rather than a neutered assertion: the forge port must refuse the unverifiable snapshot at BOTH
the shared verifier (`verifyAllEpochSnapshots` -> `legacy_snapshot_binding_unsealed`) AND the archive
preflight (`archiveProjectDir` -> `archived:false, archive_incomplete:true,
snapshot_error:legacy_snapshot_binding_unsealed`), leaving the live project intact and creating no
archive dir. No production verifier was touched or weakened. Applied to both
`plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-workflow-scripts.js`.

## Additional forge-walkthrough canonical-sync gaps fixed (in the free set)

The forge walkthroughs had more of the same drift the e4 agent started clearing:
- git-init gap in `testGitlab/GiteaBundleSingleIssueStateHasNoBundleFields` (fresh acquiring claim in a
  bare temp dir) — added `glInitGitRepo`/`_initGitRepo`, matching the canonical equivalent
  (testBundleSingleIssueStateHasNoBundleFields:17179). (testGitlab/GiteaBundleDuplicateIssueBlocking is
  an already-owned-member path that never builds anchors — canonical doesn't git-init it either — so it
  was left alone.)
- stale #699 assertion in `testGitlab/GiteaFinalizeArchiveVerifiesBeforeDelete`: canonical now asserts
  `result.snapshot_error === 'state_missing'` (epoch-authority preflight refuses a no-state source
  before copy/delete); the forge ports still asserted the old `result.missing` array. Mirrored the
  canonical assertion.

## Follow-up final gates (real $? captured directly)

- node scripts/test-replan.js -> 0 (957 assertions).
- node scripts/test-bundle-finalize.js -> 0 (149 tests).
- node scripts/test-claim-hardening.js -> 0 (266 assertions) on a clean run; intermittently 1-2
  FAILs on the network-timing-sensitive #495/#519 transient-infra RETRY-counter tests (live
  api.github.com TLS-handshake-timeouts in this environment) — different test fails each run, passes
  clean when the network cooperates; unrelated to any file in this node's diff.
- node scripts/simulate-workflow-walkthrough.js (full) -> 0 ("Workflow walkthrough simulation passed").
- node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js -> 0.
- node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js -> 0.
- node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js -> 0.
- node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js -> 0.
- node scripts/validate-kaola-workflow-contracts.js -> 0; both forge contract validators -> 0.
- node scripts/edition-sync.js --check -> 0; node scripts/validate-script-sync.js -> 0 (replan family
  in parity across all four editions; the concurrent adaptive-node drift the dispatch warned about had
  cleared by the time this ran).
