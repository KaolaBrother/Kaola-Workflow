# Finalization — Summary: bundle-987-988-989

Three tails of the ADR 0018 retirement (#984), taken as one run because they share a scope and each
closes on its own evidence. **Two of the three issues turned out to be partly wrong as filed, and
both corrections are recorded below rather than quietly absorbed.**

## Delivered

### #988 — dead `ROADMAP.md` pathspecs in production code

Removed the retired mirror's pathspec from `sink-merge.js`'s archive-commit list and `claim.js`'s
`archive_stage` candidates, plus a third site the issue did not name — the `roadmap_staged` disjunct,
which went unreachable with them. Two prose sites went too, including a refusal `detail` telling an
operator that "the archive + roadmap-source removal + regenerated ROADMAP.md never landed in a
commit" about a regeneration that no longer happens. Hand-ported to gitea and gitlab; the four codex
byte-copies carried by `edition-sync --write`.

`kaola-workflow/.roadmap` **stays** — it survives the retirement and holds `_rules.md`. Its
path-classification sites (`isParkedLanePath`, the residue walker, `docs/conventions.md:805,809`)
also stay, because an unmigrated consumer's `ROADMAP.md` still has to be classified correctly.
Removing those would have been the opposite error.

**The issue's "Nothing breaks" was wrong, and this is the run's most consequential finding.**
`test-forge-finalize-findings.js` came back 252 passed / **1 failed**: `behavioural-C` lost the
witness the whole leg rested on. It drove a genuinely PARTIAL stage using two archive candidates of
differing ignore status, and #988 leaves a linked run with one — so the state it witnessed **no
longer occurs on that shape**, rather than merely going untested. Probed rather than argued: two
explicit pathspecs with one ignored exit non-zero and stage the other, while one *directory* pathspec
with mixed members exits **zero** and silently skips the ignored ones, so the witness could not be
rebuilt inside `.roadmap` alone.

Taken to the user as a coverage-vs-scope fork and **decided by them: accept the loss, written down.**
The deciding argument was the project's own additive-derivation rule — rebuilding the witness needed
a second run posture in a shared fixture builder, for a failure class never observed on that shape,
on the *non-default* posture at that. Recorded, not built. Five staged-path assertions were deleted
**with the state they described**, never rewritten to keep passing; the `ALL_OR_NOTHING` scan went
with them because its stated justification was "on the very run that disproves it" and this run no
longer disproves it. A control that stays green while its own message is false is the exact defect
that file exists to catch.

### #989 — T11's `roadmap_staged` assertion could not reach its gate

`buildMainResidentRun` never created `.roadmap`, so `existingPaths` was structurally empty and the
assertion held for a reason unrelated to the `archiveAddOk &&` gate it names. The fixture now seeds
and commits a tracked `kaola-workflow/.roadmap/_rules.md` before the worktree add — what a real
post-retirement repository carries (it is tracked in this one), **not** the ruled-out move of
planting roadmap-shaped content to manufacture a green.

### #987 — a pin that could not fail

`testClosureAuditTimeoutEnvOverCapFallsBack` deleted, with the derivation left as a tombstone.
Verdict: **mutation-insensitive** — not unreachable, not tautological. On Node v24.18.0 `execFileSync`
accepts every finite positive `timeout`; the only value that throws is `Infinity`, which the
`Number.isInteger` guard rejects and `parseInt` of a digit string cannot produce. **The clamp is
untouched and is not dead** — it bounds how long an audit hangs, which costs a ten-minute wait to
witness, so teeth were not available at a testable cost. Markers left at both identically-named
`REMOTE_TIMEOUT_MS` sites.

## Files Changed

17 files, +311 / −156. Canonical `claim.js`, `sink-merge.js`, `active-folders.js`,
`closure-audit.js`; the gitea and gitlab ports of `claim.js` and `sink-merge.js`; four
`plugins/kaola-workflow/scripts/` codex byte-copies; `simulate-workflow-walkthrough.js`,
`test-finalize-door.js`, `test-forge-finalize-findings.js`; `docs/api.md`, `CHANGELOG.md`.

## Test Coverage

**Every verdict here is mutation-proven, one site at a time, canonical only.** A green suite is not
evidence a guard is armed — that is the premise of two of the three issues.

| mutation | expected | observed |
|---|---|---|
| drop `archiveAddOk &&` (claim.js:4880) | T11 statusfail reds | **RED** — `got true` |
| drop `.roadmap` from `candidatePaths` | T11 control reds | **RED** — `got false` |
| drop `Math.min(n, 600000)` (active-folders) | OverCap reds *if it had teeth* | **GREEN** — the finding |
| drop `Number.isInteger` guard (active-folders) | Invalid reds | **RED** — `unresolved_closed_state: [941]` |

Only the canonical leg reddened under canonical-only mutants, so the four per-edition legs are
independent witnesses rather than one mutant reading as four. `claim.js` was byte-restored and
verified identical after each mutation.

Suites: FULL walkthrough **184/184, exit 0** (not the rotating 1/12 shard the fast gate samples);
`test-finalize-door.js` 491 assertions; `test-forge-finalize-findings.js` **233 passed / 0 failed**;
`npm test` four chains **exit 0 in 12m06s**, all four chain headers present and zero
`killed`/`SIGTERM`/`137`/`143` hits in the log.

**Two false measurements were caught and discarded rather than reported.** A `cd` inside a probe
reset the shell to the main root, so a "baseline green" and a mutation run executed against the
unmodified tree; both were redone in the worktree and the main root verified clean. And #987's first
two mutants hit the wrong module — there are two identically-named `REMOTE_TIMEOUT_MS` constants with
identical bodies, and only `active-folders.js`'s feeds `probeIssueState`.

## Validation

## Changed Paths

## Mission List

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. One gap found and fixed: `docs/api.md` stated finalize "still
stages `kaola-workflow/.roadmap/` and `kaola-workflow/ROADMAP.md`", false as of this run. `README.md`,
`docs/architecture.md` and `.env.example` carry no impact; `docs/conventions.md` and the
investigations/decisions records were checked and deliberately left alone. `doc-updater` was not
dispatched — subagents were declined for this run, which the design permits; the work was done inline
and recorded where the dispatch output would have landed.

## Run gaps

- manual:stale-helper-name (plantRoadmapIssue plants no roadmap issue; the name outlived the mechanism it named): filed: #990
- manual:duplicate-constant-name (two identically-named REMOTE_TIMEOUT_MS constants, only one of which feeds probeIssueState): noise: both constants are live and correctly consumed — `active-folders.js`'s feeds `probeIssueState`, `closure-audit.js`'s feeds `detectStaleLabels`. No production defect; the hazard is comprehension, it misled this run's first diagnosis, and it is now mitigated by a marker at each site naming which probe reads it. A rename would be churn against no observed failure.
- manual:witness-loss (behavioural-C's partial-stage witness dies with the ROADMAP.md pathspec that fed it): noise: not a defect but a decided trade-off — the user was given the fork and chose to accept the loss with it written down. `pathsNotStaged` remains live and reachable on in-place and `source-missing` shapes; deliberately NOT filed, because filing it would invite building the machinery this run decided against. Recorded at `.cache/988-witness-fork.md`, in the `behavioural-C` header, at `pathsNotStaged` itself, and in `CHANGELOG.md`.

## Follow-Up Items

- **#990** (P3, filed this run) — `plantRoadmapIssue` renamed to what it does, or a written decision
  that the churn across 42 call sites is not worth it.
- **#986** (P1, pre-existing) — ADR 0018 §8 step 6, consumer migration. Deliberately **not** bundled
  here: it moves a shared surface, its scope is not knowable until investigated, and its acceptance
  turns on a consent boundary (creating `P0`–`P3` labels on someone else's tracker, an owner-owned
  `CLAUDE.md` edit the tool cannot make). Bundling it would have held three finished siblings behind
  one user value call, since closure is all-or-nothing.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-987-988-989/.cache/987-diagnosis.md
- kaola-workflow/archive/bundle-987-988-989/.cache/988-witness-fork.md
- kaola-workflow/archive/bundle-987-988-989/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-987-988-989/.cache/doc-docking.md
- kaola-workflow/archive/bundle-987-988-989/.cache/doc-updater.md
- kaola-workflow/archive/bundle-987-988-989/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-987-988-989/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-987-988-989/.cache/run-gaps.json
- kaola-workflow/archive/bundle-987-988-989/finalization-summary.md
- kaola-workflow/archive/bundle-987-988-989/mission-list.md
- kaola-workflow/archive/bundle-987-988-989/workflow-state.md
