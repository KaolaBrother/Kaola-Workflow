evidence-binding: n1-guard-hardening-fix f6077183028a
role: tdd-guide
node: n1-guard-hardening-fix (issue-715, plan epoch 3)
fix_target: N5-A + N5-B of kaola-workflow/issue-715/.cache/epochs/2/files/.cache/n5-falsify-branch-commit.md
  (epoch-2 refutation; B4a/W5/B3/W6/RC1 demonstrations + anchors), hardening the epoch-2 F1 repair
  (kaola-workflow/issue-715/.cache/epochs/2/files/.cache/n1-branch-commit-fix.md)

RED: all five inverted cells failed against the epoch-2 candidate BEFORE any producer edit —
  (1) simulate-workflow-walkthrough.js --only testReleaseDetachedHeadLyingBaseSkipsArchiveCommit —
    Error: "#715 N5-A: a detached entry with base_branch falsified to the HEAD sentinel must truthfully
    report discard_archive_committed:false, got: {...,\"discard_archive_committed\":true,\"discard_archive_branch\":\"HEAD\"}"
    (B4a reproduced: commit landed on the detached HEAD);
  (2) --only testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips —
    Error: "#715 N5-A: a base_branch naming the discarded feature branch must truthfully report
    discard_archive_committed:false, got: {...,\"discard_archive_committed\":true,\"discard_archive_branch\":\"workflow/issue-801\"}"
    (B3 reproduced: commit landed on the discarded branch);
  (3) --only testWatchPrClosedSweepDetachedLyingBaseHeadSkips —
    Error: "#715 N5-A: a detached sweep with base_branch falsified to the HEAD sentinel ... got:
    {...,\"discard_archive_committed\":true,\"discard_archive_branch\":\"HEAD\"}" (W5 reproduced);
  (4) --only testWatchPrClosedSweepArbitraryLaneLyingBaseSkips —
    Error: "#715 N5-A: a sweep with base_branch falsified to the current arbitrary lane ... got:
    {...,\"discard_archive_committed\":true,\"discard_archive_branch\":\"workflow/other-lane\"}" (W6 reproduced);
  (5) --only testReleaseHeadRepointRaceDowngradesArchiveCommit —
    Error: "#715 N5-B: a HEAD re-point during the commit must downgrade the emit to
    discard_archive_committed:false, got: {...,\"discard_archive_committed\":true,\"discard_archive_branch\":\"main\"}"
    (RC1 reproduced: false receiving-branch disclosure, main tip unmoved);
  node scripts/test-claim-hardening.js — "claim-hardening tests FAILED (6 failures, 479 passed)":
    "FAIL: #715 N5-A: the guard must reject the detached-HEAD sentinel as a base outright, got {\"committed\":true,\"branch\":\"HEAD\"}",
    "FAIL: #715 N5-A: the guard must refuse a base naming the branch being discarded (release posture), got {\"committed\":true,\"branch\":\"workflow/issue-910\"}" (+ its detail pin),
    "FAIL: #715 N5-A: the guard must refuse a base naming the current non-default lane at the sweep posture, got {\"committed\":true,\"branch\":\"workflow/issue-910\"}",
    "FAIL: #715 N5-B: a HEAD re-point during the commit must downgrade to committed:false, got {\"committed\":true,\"branch\":\"main\"}" (+ its actual-receiver pin) (pre-impl)

GREEN: all five RED scenarios now pass — `node scripts/simulate-workflow-walkthrough.js` →
  "Workflow walkthrough simulation passed" (exit 0; includes testReleaseDetachedHeadLyingBaseSkipsArchiveCommit:
  no commit anywhere, committed:false + branch "HEAD" disclosed, main + detached tips unchanged, residue
  manually committable on main; testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips: truthful skip,
  no chore commit on any ref, both tips unchanged, archive at neither ref;
  testWatchPrClosedSweepDetachedLyingBaseHeadSkips + testWatchPrClosedSweepArbitraryLaneLyingBaseSkips:
  truthful skip with disclosure, both ref tips unchanged, residue on disk;
  testReleaseHeadRepointRaceDowngradesArchiveCommit: committed:false with the ACTUAL receiver "race"
  disclosed — never "main" — main tip unchanged, raced commit recoverable on race; plus the epoch-2
  testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase / testWatchPrClosedSweepSkipsCommitOffBaseBranch
  still green). `node scripts/test-claim-hardening.js` → "claim-hardening tests passed (485 assertions)"
  (479 pre-existing-pass + the 6 formerly-failing pins; 21 new #715 N5-A/N5-B assertions total: sentinel
  rejected outright, discarded-branch base rejected, non-existent base rejected via rev-parse --verify,
  arbitrary-lane base rejected at the sweep posture, honest path commits + merge-base --is-ancestor passes,
  HEAD-repoint race downgrades with the actual receiver disclosed). Full gate green:
  test-sink-merge.js (105 assertions), test-bundle-finalize.js (149 tests), validate-script-sync.js (OK:
  25 common scripts, 28 byte-identical groups in sync), edition-sync.js --check (parity),
  plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js ("GitLab sink tests passed"),
  plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js ("Gitea sink tests passed"),
  test-kimi-edition.js (577 assertions), test-opencode-edition.js (547 assertions) — all pass, exit 0.

fix_summary: commitDiscardArchive(result, project, baseBranch, opts) hardened INSIDE the helper so both
  call sites inherit it (defense in depth, exactly where the epoch-2 guard was placed). N5-A (before
  staging): (a) base==='HEAD' (the rev-parse detached sentinel) rejected outright; (b) base must name a
  real local branch ref — argument-array `git rev-parse --verify refs/heads/<base>`, never shell
  interpolation; (c) base naming opts.discardedBranch refused (release passes featureBranch — it KNOWS
  the discarded branch; sweep passes folder.branch); (d) at the sweep posture base must equal
  opts.defaultBase (the sweep has only the pre-read operator-controlled state base and no restore step,
  so only the repo's default branch is provably surviving-and-integration — a falsified base naming the
  current arbitrary lane is refused; the release's restored base carries no default constraint because
  the restore itself established it). N5-B (after the commit): the checkout is RE-RESOLVED
  (rev-parse --abbrev-ref HEAD) and must still equal the guarded base, and the HEAD commit must be
  reachable from base (argument-array `merge-base --is-ancestor HEAD base`); any mismatch downgrades to
  { committed: false } with the ACTUAL receiving branch disclosed (never the stale pre-race base),
  leaving the off-base commit recoverable. Every refusal/downgrade is truthful (committed:false +
  branch disclosed + detail + loud warning at the emit sites) and leaves the archive as recoverable
  residue; nothing throws past the emit (all new probes sit inside the existing try). Byte-stable
  truthful cells kept: honest on-base commit (R0/R1/W1), detached honest-base skip with the unchanged
  "not the surviving base branch" detail (B1/W4/A2), symbolic-ref resolution (B2), lying base='HEAD' on
  the feature branch skip (B4b), diff-quiet race committed:true with no duplicate (RC2), commit failure
  truthful committed:false (R2a/R2b), OFFLINE never skips a commit that runs, pathspec scoping
  (`-- <rel>` of the ACTUAL dest) unchanged. Propagation: plugins/kaola-workflow/scripts/ byte-replicated
  via cp (diff empty — validate-script-sync OK; edition-sync.js --write NOT run, not generated);
  gitlab/gitea ports hand-mirrored — helper body byte-identical to canonical (md5 c767f927efd3f6c507ae159194b4bcf2
  in all three), call-site hunks mirrored modulo forge nouns (watch-mr/closed). Write set exactly as
  declared: the four claim.js trees + scripts/simulate-workflow-walkthrough.js +
  scripts/test-claim-hardening.js + this evidence file.
