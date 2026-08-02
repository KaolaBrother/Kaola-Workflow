# Finalization — Summary: bundle-911-912-913-914-916-917

Six open post-v9.2.0 audit defects, closed as one set: #911 #912 #913 #914 #916 #917.

## Delivered

**#916 — a failed main-root roadmap rebuild was swallowed.** `reconcileRoadmapForClosure`
regenerated two mirrors on a linked-worktree run and typed the outcome of one; main's ran inside
`catch (_) {}`. The premise was measured before anything was built: REACHABLE, reproduced end to
end on real filesystem state — a missing or unreadable `.roadmap/`, an unreadable issue source, an
unwritable `kaola-workflow/`, and a concurrent unlink racing the rebuild (368 of 4000 trials). In
each case finalize exited 0, the receipt read `roadmap_regenerated: "regenerated"`, stderr was
empty, and main's mirror still listed the closed issue. The receipt now carries
`roadmap_regenerated_by_root` (same enum, per root) so a reader can tell WHICH mirror is stale,
`roadmap_regenerated_main_error` carrying the caught message, and raises the typed finding
`main_roadmap_mirror_not_regenerated`. Recorded, never gated: exit stays 0. All four editions.

**#913 — `--env-allowlist` silently discarded HOME and TMPDIR.** The key still does not take
effect, because honouring it is exactly what would make `command_id` machine-dependent; the receipt
now names what was ignored in `env_allowlist_ignored`. Verified at source that the field sits
outside `computeCommandId`'s explicit hash list, so determinism is preserved by construction. Four
copies byte-identical.

**#912 — the forge sinks refused a branchless run over a worktree that does not exist.** Both ports
called `assertWorktreeClean` unconditionally where canonical skips it for `--branch TBD`; that guard
fails closed on a probe fault BEFORE matching any branch, so a transient fault refused a sink
canonical completes. The `[project]` half of the filed divergence was measured INERT — canonical
records that `ownedProjects` is "added for API consistency" and ignored — so it was not ported.

**#917 — a dropped constraint was still shipping to every consumer repo.** "advances one item per
cycle" removed from all 9 renderings via the 3 authoring surfaces, one wording across three forges
and both runtime renderings.

**#911 — documented, no behaviour change.** The mis-landing is real and reproduces
(`chains_unverified`, six-leg matrix, identical bytes verdicting differently by directory alone).
But the flag has NO producer in any of the four editions and nothing authors a `workflow-plan.md`,
and AC 1's documentation branch was already shipped. What landed is the one fact nowhere on record
— that it has no producer — falsifiable by grep.

**#914 — recorded, no finding type added.** The forges' own `archive_stage_failed` already names the
consequence the missing type announces. What was missing is that the single unscoped `git add -A` is
NOT otherwise equivalent: three measured differences are silent successes (exit 0,
`archive_stage: 'staged'`) that no additional failure type would reach. AC-2 was already satisfied
at HEAD by the previous bundle.

**Out of bundle, on the owner's ruling:** three suites were RED at the v9.2.0 release commit on any
box without a global `init.defaultBranch`. Fixed at the bare-remote call sites. A baseline red for
unrelated reasons cannot verify anything.

## Files Changed

30 files, +2096/-68 in `36f41ab9` plus the docs commit `41b4a10d`. Product: `claim.js` x4 (69 lines
each), `validation-runner.js` x4 (29 each, byte-identical), `kaola-{gitlab,gitea}-workflow-sink-merge.js`
(13/4 each), `roadmap.js` x2, `templates/routing/slots.js`, `package.json` (chain wiring).
Generated: 6 `workflow-init` renderings, `ROADMAP.md`. Docs: `api.md`, `conventions.md`, `CHANGELOG.md`.
Tests: walkthrough (+303), `test-validation-runner.js` (+286), `test-sink-merge.js` (+181), both forge
sink suites (+213/+216), and new `scripts/test-forge-finalize-findings.js`.

## Test Coverage

Every behavioural change was authored as a failing test first by `tdd-guide` and implemented
separately by `implementer` — test custody held throughout; no implementer wrote the tests it was
judged by. Each suite was verified RED by the orchestrator against unmodified code before any fix,
and each new guard was mutation-proven armed afterwards:

- #913: deleting the reporting line reds; replacing it with a CONSTANT banner also reds ("must VARY
  with the request") — the second mutant is what rules out a report that is right by accident.
- #912: each port mutated ALONE — gitlab-only mutant reds gitlab and leaves gitea green, and vice
  versa. An all-sites mutant would have proven one port while claiming two.
- #916: the original silent-swallow shape planted by the orchestrator — both defect cases red, the
  healthy control stays green.
- #914's new guard: a fake type in the gitlab port reds it; falsifying the docs counts reds it.

## Validation

## Changed Paths

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. `doc-updater` was deliberately not dispatched: every surface this
run touches is API/schema-shaped (receipt fields, finding-type registries and their counts, a CLI
flag's semantics), which is the class where a delegated pass fabricates plausible field names, and
the counts had already drifted once inside this bundle. Seven gaps found and fixed, including four
nothing would have caught: `docs/api.md:340`'s type enumeration was missing #916's new type; the
finalize envelope had no `roadmap_regenerated_by_root`, so #916's entire point was undocumented; a
section heading was itself count-coupled and would rot on the next added type; and the counts were
stale in two places.

## Run gaps

- manual:forge-roadmap-rules-divergence (the gitlab/gitea roadmap.js generators emit a different RULES_BLOCK than canonical (4 bullets vs 5, only 2 overlapping); original divergence, zero commits, invisible to validate-script-sync, and the rendered workflow-init surfaces disagree with the forge generators' own output): filed: #918
- manual:forge-claim-dead-code (the gitlab/gitea claim.js ports carry persistExpansionRollupToSummary/parseExpansionRecords reading workflow-plan.md that canonical deleted (grep count 0 in canonical)): filed: #919
- manual:false-mechanism-in-finding-message (canonical's archive_stage_failed asserts `git add` is all-or-nothing over its pathspec list; measured false, exit 1 AND ROADMAP.md staged): filed: #920
- manual:api-doc-field-absent-on-forges (docs/api.md:330 documents archive_unstaged unconditionally; measured 1x canonical, 0x on both forge ports, while sibling residue_unstaged is 1/1/1): filed: #921
- manual:forge-archive-staging-unscoped (the forge unscoped `git add -A kaola-workflow/` sweeps a FOREIGN project's live folder and archive band into `chore: archive <project>` past both staging guards at exit 0; a scoping gap no failure type can reach because it succeeds): filed: #922
- manual:forge-branchless-unported (#711 branchless runs are implemented in canonical and absent from both forge ports (12 references vs 1); a forge `--branch TBD --sink` passes preflight and would then push/merge against a branch literally named TBD): filed: #923
- manual:suite-reads-operator-git-config (test-sink-merge and both forge sink suites created bare remotes with no explicit initial branch, so they were RED at the v9.2.0 release commit on any box without a global init.defaultBranch; fixed in this run): noise: not filed because it was FIXED in this run (commit 36f41ab9) - the schema offers only filed/noise and this is neither; an out-of-bundle blocker fixed on the owner ruling, verified with no git config and with a hostile one
- manual:finding-type-count-drift (#916 added a seventh finalize finding type in the same bundle whose prose stated six; docs/api.md and the CHANGELOG were briefly false with every chain green, and nothing recounts types against prose): noise: not filed because it was REPAIRED in this run - docs/api.md and the CHANGELOG now state the measured 7/7/6/6, and scripts/test-forge-finalize-findings.js was added so the next recurrence reds a chain instead of shipping

## Follow-Up Items

Six issues filed, all approved by the owner in conversation: #918 #919 #920 #921 #922 #923.

**#918, #919, #921, #922 and #923 are all the same seam.** `edition-sync.js:30-34` keeps the
data-layer forge ports hand-ported, absent from `COMMON_SCRIPTS` and `RENAME_NORMALIZED_FAMILIES`,
so no parity or byte-identity check can see them. Five independent divergences surfaced there in one
run — a pattern in the coverage model rather than five unrelated bugs, and worth addressing as one.

#922 is the one with a data-integrity consequence: on GitLab and Gitea an archive commit can carry
another live run's folder and report success doing it.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/911-measurement.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/914-analysis.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/916-premise.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/doc-docking.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/.cache/run-gaps.json
- kaola-workflow/archive/bundle-911-912-913-914-916-917/finalization-summary.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/mission-list.md
- kaola-workflow/archive/bundle-911-912-913-914-916-917/workflow-state.md
