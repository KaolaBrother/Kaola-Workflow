# Finalization — Summary: bundle-930-931

Closes #930 and #931 as one set, all-or-nothing.

## Delivered

**#930 — archiving refuses a reserved directory instead of relocating it.** `archiveProjectDir`
derived its destination from the project name alone and moved whatever directory that named, so a run
claimed as `.roadmap` had the entire backlog relocated into the archive at exit 0 with
`closure_invariants {ok: true}` and nothing warned; under `--keep-worktree` it also committed the
deletion of the tracked sources onto the branch the sink merges. A guard at the top of
`archiveProjectDir` now returns `{archived: false, reason: 'archive_reserved_directory'}` for every
dot-prefixed name and for `archive` in any casing. It sits above the linked/in-place split, so neither
archive lane can be fixed without the other, and above the `source-missing` early return, which
`closureContract.archiveSucceeded` reads as success — a guard after it would have stopped the move
while still letting closure remove the roadmap source and close the issue. The claim side is
deliberately unchanged per owner ruling; only the destruction is closed.

**#931 — a collision-suffixed sink archive now names the directory it was pushed off.** When the
destination already existed the sink committed the suffixed directory and reported `status: sinked` at
exit 0, leaving the complete archive untracked under the unsuffixed name with nothing in the record
pointing at it. A repo-relative `archive_collision:` line now joins the committed `## Sink Findings`
block. It asks whether a **real archive** stands at the plain path rather than whether anything exists
there — the distinction is load-bearing because the sink manufactures that directory itself when main
holds no live project folder, so an existence-only test reports a collision against its own skeleton
and names a directory journal disposal is about to delete.

Both land in all four editions and are pinned per edition behaviourally, not by inspection.

## Files Changed

14 files, +1881/−17, one commit `5ccc2819` on `workflow/bundle-930-931`.

- Production, 8 files: the four `*claim.js` copies (#930, +58 each) and the four `*sink-merge.js`
  copies (#931, +128 canonical/codex, +98 gitlab/gitea).
- Tests, 3 files: `test-sink-merge.js`, `simulate-workflow-walkthrough.js`,
  `test-forge-archive-scoping.js`.
- Docs, 3 files: `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md`.

## Test Coverage

Custody held throughout: `tdd-guide` authored every test, `implementer` never wrote one, and each
suite was proven RED on the pre-change baseline before its fix existed.

- **#930** — `testArchiveNeverRelocatesReservedDir930` in the walkthrough (4 names × 2 lanes, root
  edition) plus a `#930` section in `test-forge-archive-scoping.js` driving the linked-worktree lane
  **per edition, all four**. Four method-neutral assertions; set-equality against a pre-run snapshot
  with a named, mutation-armed `KNOWN_ADDITIONS` allowance. Per-edition arming proven 88/44 → 110/22
  (root+github only, gitlab and gitea still red) → 188/0.
- **#931** — (n1)/(n2) headline pins, (n3) no-fabrication control, (n4) four-edition sweep, and (n5), a
  **biconditional** over one fixture and one axis that reds in *both* directions on *opposite*
  producers. Driven behaviourally per edition through each forge's mock hook.

## Validation

Chain receipt `kaola-workflow/bundle-930-931/.cache/chain-receipt.json`, bound to `5ccc2819` by exact
`headSha` equality, `scope.changedFileCount: 14` matching the diff exactly, `scope.selection:
edition_coupling` so all four chains ran: **claude, codex, gitlab, gitea all exit 0.**

Run from the worktree on a settled tree with every subagent stood down, and the run **completed before
finalize was invoked** rather than outliving it — the specific error that manufactured #931's own
false-red receipt.

Full scope, not the 1/12 fast-gate shard: walkthrough **203/203 exit 0**; `test-sink-merge` exit 0;
`test-forge-archive-scoping` 188/0; `test-bundle-finalize` 149; `test-claim-hardening` 766;
`validate-script-sync` and `edition-sync --check` exit 0 with four Oracle Kernel copies identical.
Both port sink suites run and green (gitlab 577 spawns, gitea 573).

## Changed Paths

See `## Files Changed`. Nothing outside the 14 listed files was touched; the run record folder
`kaola-workflow/bundle-930-931/` is untracked run evidence, not a deliverable.

## Documentation Docking

**DOCKED.** Three surfaces carry the change: `docs/api.md` (the `archive_reserved_directory` refusal
row and the `archive_collision` paragraph), `docs/workflow-state-contract.md` (the `workflow_project`
hazard paragraph, which named the invisibility but not the destruction), and `CHANGELOG.md`.

The docs were adversarially reviewed and **two defects were found in them and fixed**: all three
surfaces initially enumerated the refused set without the case-fold that is the entire substance of
#930's repair, so a reader would have learned that `Archive` is archivable; and the CHANGELOG carried
three claims measured false, including one — "nothing under the refused directory is touched" — that
was the same defect routed to the implementer for repair and then repeated in prose.

## Run gaps

- manual:claim-side-rollback-destroys-reserved-dir (adv-930 R3, CONFIRMED and pre-existing): filed: #932
- manual:sink-collision-undisclosed-under-keep-worktree (the sink has no destination, so a collision produced there is not disclosed): noise: a scope boundary, not a defect. The disclosure fires where the sink archived; under `--keep-worktree` `cmdFinalize` archives instead. The observed 2026-08-03 incident is the sole-archiver shape and IS covered; this shape has never occurred, and closing it means writing `claim.js`, which #930's owner ruling scoped out.
- manual:sink-stage-skip-coupling-fails-silently-toward-over-report (the failure is silent and toward over-reporting): noise: a maintenance hazard, not a present defect. `SINK_STAGE_SKIP` was verified exhaustively to be exactly the set the sink writes into a project `.cache/`, and is read rather than restated so the two uses cannot drift. Mitigated by a comment at the predicate; building for a third journal that does not exist would be deriving subtractively.
- manual:archive-guard-does-not-cover-exports (nothing is destroyed on baseline or candidate): noise: driven benign both ways. With or without a pre-existing `archive/exports/` a collision simply suffixes and the salvage patch survives byte-for-byte. Covering it would settle a live disagreement between two production sites with no failure forcing it.
- manual:crash-window-drops-a-true-collision-disclosure (adv-931 R3, reasoned not driven): noise: reasoned, never driven, and unobserved. A death between the in-memory `archive_dest` write and `stepDone('finalize')` loses the disclosure on resume. Independent of the discrimination route taken.

## Follow-Up Items

**#932** — filed above, with the user's agreement.

Nothing else is deferred. Both issues' demanded results are delivered in full, and every
recorded-not-built decision is justified in `## Run gaps` above and in `mission-list.md`.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-930-931/.cache/adv-930.md
- kaola-workflow/archive/bundle-930-931/.cache/adv-931.md
- kaola-workflow/archive/bundle-930-931/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-930-931/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-930-931/.cache/impl-930.md
- kaola-workflow/archive/bundle-930-931/.cache/impl-931.md
- kaola-workflow/archive/bundle-930-931/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-930-931/.cache/premise-930.md
- kaola-workflow/archive/bundle-930-931/.cache/premise-931.md
- kaola-workflow/archive/bundle-930-931/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-930-931/.cache/run-gaps.json
- kaola-workflow/archive/bundle-930-931/.cache/tests-930.md
- kaola-workflow/archive/bundle-930-931/.cache/tests-931.md
- kaola-workflow/archive/bundle-930-931/finalization-summary.md
- kaola-workflow/archive/bundle-930-931/mission-list.md
- kaola-workflow/archive/bundle-930-931/workflow-state.md
