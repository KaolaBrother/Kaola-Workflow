# Finalization — Summary: bundle-984-985

## Delivered

**ADR 0018 §8 steps 1–5: the forge is the backlog.** Six commits, 91 files, +2,442 / −10,428.

- **#985 — the pick step reads issues, not titles.** `/workflow-next` selected and claimed work from a title line alone. It now reads each **shortlisted** candidate's body and comments before claiming, comments winning where they contradict the body, and says so aloud at selection. Bound to the shortlist deliberately: reading the whole backlog trades a drift class for a rate class. `gh`/`glab` use their own porcelain; `tea` has no comments view, so gitea runs through `kaola-gitea-forge.js`'s existing `tea api` transport rather than a second owner/repo-resolution copy in shell.
- **#984 — the local backlog layer is retired.** `kaola-workflow-roadmap.js` in all four editions, the `ROADMAP.md` mirror, the per-issue `.roadmap/issue-N.md` sources, the roadmap closure-receipt fields and closure invariants, closure-audit's two roadmap drift classes and the `main_roadmap_mirror_not_regenerated` finding, the sink's roadmap auto-stash and keep-open retention, and the dual-root mirror reconciliation — all deleted.
- **Priority became real.** `claim.js list-open` orders the open issue list by a bare `P0`–`P3` forge label — **ordering, never selecting**. This connected a sorter that had shipped in all four `claim.js` copies with **zero production call sites** since the day it was written. Labels created and the two open issues tiered; verified end to end (`#985 [P1]  #984 [P2]` — the higher issue number sorting first is the proof it is tier order, not arrival order).
- **`workflow-init`'s injected guidance now lands in a `KW-CLAUDE-MANAGED` region**, so init can reconcile what it owns rather than only ever add. It previously landed unmarked and init could not tell its own wording from the user's — which is why one consumer's `CLAUDE.md` had fused tool text and a hand-added amendment into a single unsplittable line.
- **Finalization requires a run to comment what it corrected**, not only to file what it found. *A correction is not a follow-up.*
- **Fixed:** `archive_commit` could stage nothing, exit 0 and report success when an `:(exclude,glob)` named a directory that is a strict string prefix of the include's leaf directory. Reproduced on git 2.54.0, isolated by a one-variable-at-a-time grid, second trigger path in the glob tail measured and scoped in the comment.

### Named accepted losses

An offline claim with no active folder now answers `target_unverified`; the offline `blocked by #N` → `depends-on:#N` inference is gone with the prose it parsed. `kaola-workflow/.roadmap/_rules.md` survives as the one optional local file, read **directly** by the pick step.

## Files Changed

91 files, +2,442 / −10,428 across six commits: `25054b07` (the retirement), `4ae77702`, `53aa2b23`, `a8ebf58e`, `f1577407`, `2933711c` (five chain-driven test repairs).

## Test Coverage

New suite `scripts/test-priority-list-open.js` — authored RED (17/17 at `8ca7e885`), proven non-vacuous before acceptance (the `KAOLA_GH_MOCK_SCRIPT` seam sits in `ghExec`, which is exactly what `listOpenIssues` calls), and **mutation-proven**: turning ordering into selecting (`.slice(0, 1)`) reds 6 assertions across 3 test functions. Registered in `test:kaola-workflow:claude` and `:claude:full`.

Rebuilt rather than deleted, because their subjects outlived their witnesses: `simulate-workflow-walkthrough.js`'s `plantRoadmapIssue` helper (one function, 69 call sites, re-pointed at the existing `KAOLA_CLASSIFIER_MOCK_SCRIPT` seam), `test-forge-bundle-lane.js` (the #862 oracle — its forge legs needed the mock seam ported into both forge `classifyIssue` paths, since narrowing the file's scope would have deleted coverage of exactly the editions #862's defect lived in), and `test-forge-finalize-findings.js`'s linked-run legs.

Deleted with their mechanisms: 10 canonical `testRoadmap*` functions, `test-forge-roadmap-rules.js` entire, the #428 roadmap-residue tests, and the roadmap-source door case in `testClaimNeverAdoptsReservedDir933`.

## Validation

## Changed Paths

## Mission List

## Documentation Docking

`DOCKED`. `docs/api.md` (envelope, closure receipt, closure-audit contract, the test-parsed finding-type count sentence `nine/eight` → `seven/eight`, and the `## Roadmap Operations` section rewritten to a retired notice), `docs/workflow-state-contract.md` (durable-sources bullet, `### Roadmap issue-source fields`, the whole `## Generated Mirrors` section, closure invariants renumbered 1–7 → 1–5 with every downstream citation repaired), `README.md` (~18 hits, the `Roadmap cycle` section renamed `Backlog cycle`), `docs/architecture.md` (`## Roadmap` → `## Backlog`), `docs/README.md` (decision index), `CHANGELOG.md` (Added ×4, Removed, Fixed), `CLAUDE.md` (Durable State Contract), and ADR 0018's own Status line.

One sequencing gap, recorded because step 6 can repeat it: `docs/api.md` was docked **before** the deletion step, so the agent doing that pass correctly left the roadmap script-reference section alone and said so — then the script was deleted and nobody returned. Found by an agent reading past its own scope, not by a gate.

## Run gaps

- manual:pin-cannot-fail (OverCapFallsBack does not red under its own mutation on this Node version): filed: #987
- manual:dead-mirror-references (production code still names the deleted ROADMAP.md in sink-merge roadmapPathspecs): filed: #988
- manual:fixture-cannot-reach-gate (test-finalize-door T11 roadmap_staged assertion cannot exercise the archiveAddOk gate): filed: #989
- manual:consumer-migration-unbuilt (ADR 0018 step 6 consumer migration is designed and measured but not built): filed: #986

## Follow-Up Items

- **#986 (P1)** — ADR 0018 step 6, consumer migration. The remaining step and the one the record names as carrying the risk. Filed with everything the dry run measured: 82 tracked files / 287,087 bytes, **exactly 2 homeless lines** needing a preservation comment, the consumer `CLAUDE.md` assertion that reads `0 == 81` the moment sources are deleted in a file this tool cannot edit, 11 further `ROADMAP.md` citations across five live consumer documents only the consumer can repair, and the rule that the mirror leaves disk and index in one movement.
- **#987 (P2)** — a pin that cannot fail.
- **#988 (P3)** — dead mirror pathspecs that read as a live claim.
- **#989 (P3)** — a fixture that cannot reach the gate its assertion names.

Dropped rather than filed, on measurement: an audit of other `git add` sites for the exclude-prefix shape. Every `:(exclude` construction in production across all four editions lives in `sink-merge.js`, and the only two real pathspecs are the pair already fixed. A class of one needs no audit.

## Status: READY FOR FINAL GIT GATE
