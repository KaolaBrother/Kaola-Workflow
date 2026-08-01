# Finalization — Summary: bundle-888-889-890-892-893-894-895

Seven issues, one scope: the deferred residue of the #891 run and the v9.0.0 release cut.
Implementation commit `6fdbf714`; receipt commit `28d6bbd6`.

## Delivered

- **#888** — the release-prep carry-over is deleted. Its precondition was unreachable: the sink's
  `chore: archive` commit always interposes off-surface, so the route refused every time it was
  asked. `--release-check` now binds by exact `headSha` alone; the four-chain, unwaived, clean-stamp
  demand is unchanged and the chain run at the release commit is mandatory. The `binding` and
  `carryOver` envelope keys went with it — `docs/api.md` had never documented them, so removing them
  made code and doc agree. Removing `receiptBindsTo` required care: with `carryOver` gone its body
  evaluates to always-true, which would have silently made a `chains_stale` arm unreachable and
  disarmed `--verify`'s staleness warning. The result was verified byte-for-byte against the
  pre-#881 line.
- **#889** — one exported `REVIEWER_BEHAVIOR_CONTRACT_VERSION` plus a pin sweep, so an incomplete
  bump fails on the *first* validator in every chain and names every outstanding site in one message.
  `install.sh` left the bump surface entirely: its heredoc already required the generator module, so
  the issue's central constraint ("cannot import anything") was simply false. Four contract
  validators' failure messages now derive from the same constant as their conditions — three were
  reporting "version 2" while asserting `=== 3`. The two vacuous fixture regexes now match the
  version as a digit run and assert that they substituted something.
- **#890** — convention only. Upstream forge references in the changelog carry no `#`, so a bare
  `#N` keeps meaning an issue in this repo. The extractor is deliberately *not* taught `owner/repo`
  slugs: a writer who reintroduces the hash finds out at `--prepare`, which is a loud, non-destructive,
  zero-mutation refusal.
- **#892** — the mission-list format has one wording, carried in `templates/routing/`.
  `docs/mission-list.md` is deleted; its dead pointer reached **12 installed surfaces across 4
  runtimes**, not the 6 the issue counted. init's restatement is a proven-verbatim subset of the next
  wording, declared in `required-blocks.js`.
- **#893** — the sink no longer refuses finalize's own archive mirror, so the documented worktree
  finishing sequence stops blocking itself. Existence is probed separately from content, so an
  unreadable or oversized branch copy reads as *unverifiable* rather than *absent*. The sink now
  reports every own-archive path it commits, on the envelope and in this summary.
- **#894** — two support layers orphaned by #891 removed: the installer compare-and-swap half (×3
  copies, −213 lines) and the curated-root vocabulary (×4 anchor copies).
- **#895** — the canonical assertion that a closed issue's folder is excluded from the active set is
  restored, with two independently-armed sub-cases covering the batched-prefetch and per-issue paths.

## Files Changed

66 paths. Net **+2222 / −1742** across 65 files plus one deletion (`docs/mission-list.md`).
No new files: no new scripts, no new suites, no new validators.

## Test Coverage

| suite | result |
|---|---|
| four validation chains | claude 0 (220.9s) · codex 0 (5.9s) · gitlab 0 (58.1s) · gitea 0 (56.2s) — all `accepted_red:false`, `timed_out:false`, `attempts:1` |
| `simulate-workflow-walkthrough.js` (FULL scope) | `{"scenarios":184,"ran":184,"passed":184,"failed":0}` |
| `test-sink-merge.js` | 257 assertions, 0 failed |
| `test-release.js` / `test-finalize-door.js` | 247 / 153 assertions |
| `test-route-reachability.js` | 323 assertions |
| `test-opencode-edition.js` / `test-kimi-edition.js` | 490 / 505 assertions |

Every new or widened guard was mutation-proven armed, and the orchestrator independently re-proved
two of them rather than accepting the authoring agent's word: reintroducing the read-fault defect
reds exactly 7 assertions, and neutering the archive-path reporting reds 7.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. Four docking defects were found by adversarial audit and
fixed, including a consumer-facing `README.md` contradicting itself on the `dispatched` field and a
shipped operator string that told a release operator the now-mandatory chain run was skippable.

## Run gaps

- manual:coverage (`--sink` never runs the `run_not_finalized` measurement the legacy path runs.): filed: #896
- manual:coverage (three plausible `issueIsClosed` regressions survive the new #895 scenario): filed: #897
- manual:coverage (re-introducing the exact mechanism #888 deleted is invisible to every authored suite.): filed: #898
- manual:design (the #892 dead-pointer class is unguarded in both directions.): noise: #892 itself ruled that a third instance of the class is the observation that would force such a guard, and this is the second. Recorded, not built, per derive-additively.
- manual:design (`CONTRACT_VERSION_PIN_SITES` is a hand-typed list with no completeness guard): noise: not an observed failure. The exposure is a future forge port, and every reference was enumerated as complete today.
- manual:design (#893's own-archive exemption is a directory prefix): noise: owner-ruled after measurement established that no sound discriminator exists between a stray and the mirror. The answer is the uniform report above, which makes the commit visible rather than preventing it.

## Follow-Up Items

- #896, #897, #898 as above.
- #878 remains the reference-only watch list; nothing from this run was added to it.

## Status: READY FOR FINAL GIT GATE
