# Finalization — Summary: bundle-980-981

Issues: **#980** (a sink that red-stops after the worktree removal leaves the staged journal parked
in an unnamed tmpdir) and **#981** (retired support scripts survive an opencode or kimi
`--uninstall`). Both were filed by the preceding bundle-976-977-978 run and disclosed there as
pre-existing rather than introduced. Both premises were re-measured against the current tree before
anything was built, and both held — #980's more broadly than it was filed.

## Delivered

**#980 — the staged run journal is now named when a sink stops before landing it.**
Both sink routes copy `<worktree>/kaola-workflow/<project>/` into an OS tmpdir (`kw-wtsync-*`) before
the forced worktree removal and land it per file (#707 h) only after the merge succeeds. The premise
check found the uncovered window on **both** routes, not one: `--sink`'s merge step stops without
naming the stage at `:2224` (red post-rebase gate), `:2249` (red chain during fast-forward recovery),
`:2267` (non-fast-forward) and `:2289` (rebase conflict, bare stderr, no envelope); `sinkMergeMain`
has the identical four at `:3321`, `:3340`, `:3353` and `:3372`. Both additionally pass an **uncaught**
`git checkout` (`:2246`, `:3330`) between the removal and the landing. At every one of those exits the
worktree is already gone, so the staged copy is the run's only surviving journal.

The fix names the path in the failure output, but **structurally rather than per stop**: a
module-scoped note is armed where the stage succeeds and disarmed where the landing completes, so it
reports on every exit in that window instead of on an enumerated list — including the two uncaught
`checkout` throws an enumeration would have missed, and any stop added between the two later. It
writes to **stderr**, so stdout stays byte-identical and no envelope consumer moves. The `#707 h`
landing pins and `sinkLandStagedUnion`'s `existsSync` destination probe — which the #978 implementer
explicitly declined to change — are untouched. Landed in all four sink copies.

**#981 — a support script an edition retired is now removed by an opencode or kimi `--uninstall`.**
The install path already converges on the manifest (#965), which is why a reinstall heals a stranded
script; uninstall removed strictly by the *current* manifest, so a retired name was the one artifact
surviving an uninstall that removed every current artifact around it — including, in kimi's case, the
hooks in the same function that #977 had already taught to remove their retired names. Both editions
now declare `RETIRED_SUPPORT_SCRIPTS` and sweep it on the uninstall path, outside the manifest guard
(a retired script is absent from the manifest by definition, so its removal must not depend on the
manifest being readable).

The retired set was censused **independently**, as the issue required: `git log -L` over
`SUPPORT_SCRIPTS` in `kaola-workflow-install-manifest.js`, cross-checked against
`git log --no-renames --diff-filter=D` over `scripts/`. The two agree on 13 names. Never read from
the installer's own array — a list validated against itself cannot show an omission, which is the
flaw that produced #977. Bounded per edition by when each shipped support scripts: opencode from
2026-06-19 (`74da6a5b`) carries all 13; kimi from 2026-07-17 (`f6dbf40d`) carries 11, because
`autopilot` (retired 06-26) and `parallel-batch` (07-02) were gone before that edition existed. Each
base is removed alongside its two forge-port spellings, since the deployed basename depends on the
forge the home was installed under and that need not be the forge the uninstall is invoked with; the
prefix expansion was verified on the real macOS `/bin/bash` 3.2.57. Every name still passes
`is_plain_basename` before it becomes a delete path. It stays a **blocklist** — a namespace sweep
would reintroduce exactly the defect #973 removed.

## Files Changed

| file | what |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | #980 note: arm/disarm + `process.on('exit')` handler |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte-identical codex mirror |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | hand-ported #980 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | hand-ported #980 |
| `install-opencode.sh` | #981: `RETIRED_SUPPORT_SCRIPTS` (13) + `remove_retired_support_scripts` |
| `install-kimi.sh` | #981: `RETIRED_SUPPORT_SCRIPTS` (11) + `remove_retired_support_scripts` |
| `scripts/test-sink-merge.js` | #980 arms (w), (w2), and the (#707 h) false-alarm control |
| `scripts/test-opencode-edition.js` | #981 arm S1c |
| `scripts/test-kimi-edition.js` | #981 arm P1c |
| `CHANGELOG.md` · `docs/opencode-edition.md` · `docs/kimi-edition.md` | documentation docking |

## Test Coverage

Five arms, **every one mutation-proven** via an explicit backup copy (never `git checkout --`):

| arm | pins | mutant that proves it armed |
|---|---|---|
| `(#980 w)` | discoverability of the staged journal after a red-gate stop, as a **disjunction** — reachable from a named path *or* already in the operator band — so it pins the result, not the method | both arm calls stripped → fails on the pin itself, premises intact (bytes survive, path unreachable) |
| `(#980 w2)` | all four sink copies carry the pair, counted against the canonical's own stage/landing site count | one gitlab arm stripped → caught (`expected 2 armed, got 1`) |
| `(#707 h)` | **false-alarm control** — a completed worktree sink must not warn about a journal it landed | see Run gaps: held by the handler's `existsSync` probe, not by the disarm; recorded rather than overstated |
| `(#981 S1c)` | opencode: two real retired names gone after `--uninstall`, with a positive control that the current manifest set was removed; plus a blocklist **scope** clause | removal call dropped → caught; namespace-sweep mutant → caught on the scope clause |
| `(#981 P1c)` | kimi: the same two clauses | removal call dropped → caught; namespace-sweep mutant → caught |

The scope clause is pinned with a **user-authored `.js`**, which is the load-bearing half: a non-`.js`
file survives even `install.sh`'s `*.js` sweep, so pinning only that would pass against a namespace
prune of the directory.

Suite totals: sink-merge **1083** assertions, opencode-edition **663**, kimi-edition **627**.
Walkthrough at **full scope: 210/210 scenarios, 0 failed** — not the rotating 1/12 sample.
`test:kaola-workflow:claude` real exit **0**. `edition-sync --check` 8/8 aggregator ports in parity,
`validate-script-sync` OK across 27 byte-identical groups, `generate-routing-surfaces --check` 18/18.

## Validation

`classification: chains_green` — `mode: chain-receipt`, `green: true`, detail *"4 chain(s) green over
this tree"*, `operator_hint: null`. The receipt at `.cache/chain-receipt.json` binds
`headSha aa7a49448786cb2cd5d1edb907da66d19a22d805` — the implementation commit — with
`codeTreeHash 8f922a8f…`, and `scope.decision: all-four` for `reason: edition_coupling` over 12
changed files (the six edition-touching paths are the four sink copies plus the two edition docs).
Run serially under `KAOLA_RUN_CHAINS_CONCURRENCY=serial`; a parallel run is spawn-bound here and
produces false reds.

| chain | exitCode | accepted_red | timed_out | attempts | duration |
|---|---|---|---|---|---|
| claude | 0 | false | false | 1 | 453s |
| codex | 0 | false | false | 1 | 6s |
| gitlab | 0 | false | false | 1 | 83s |
| gitea | 0 | false | false | 1 | 93s |

Read on `exitCode`, which is the field that carries the result — not `ok`, which these entries do not
have. No chain was an accepted red, none timed out, and each passed on its first attempt.

## Changed Paths

As reported by the transaction (`changed_paths`), nine code paths:

```
install-kimi.sh
install-opencode.sh
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
scripts/kaola-workflow-sink-merge.js
scripts/test-kimi-edition.js
scripts/test-opencode-edition.js
scripts/test-sink-merge.js
```

`dirty_paths: []`. The commit also carries `CHANGELOG.md`, `docs/opencode-edition.md` and
`docs/kimi-edition.md`, which are documentation rather than code paths. Nothing here is foreign to
this run: the four sink copies and the two installers are the two fixes, the three test files are
their oracles.

## Mission List

`items: 7`, `outcome_while_not_done: []` — all seven items `done`, every one carrying a `result`, and
no item carrying an outcome it had not earned.

That second field was **not** clean on the first pass: it reported `[33]`, because the final item
carried a `result` while still `status: in-flight` — the exact malformed-record shape #970 exists to
detect, written by this run into its own record. The work behind it was genuinely complete; the record
was not. It was corrected in place and the idempotent transaction re-run to confirm, rather than
explained away. The detection is recorded here because a run that only reports its clean second
reading is hiding the thing the mechanism was built to surface.

`closure_invariants: {ok: true, violations: []}`. Transaction steps: `mirror: mirrored`,
`ledger_compare: pass`, `impl_commit: not_applicable` (authored before finalize, as it must be),
`roadmap_staged: true`, `archive_stage: staged`, `archive_commit: deferred_to_sink`.

## Documentation Docking

`DOCKED` — record at `.cache/doc-docking.md`. `CHANGELOG.md` gained two `[Unreleased] / Fixed`
entries; `docs/opencode-edition.md` and `docs/kimi-edition.md` had their `--uninstall` paragraphs
updated for `RETIRED_SUPPORT_SCRIPTS` (widening "absent from the source tree" to "and from the
install manifest", since a support script is retired by leaving the manifest) and now name the new
arms alongside U1. `docs/api.md` was checked and deliberately **not** edited: the change adds no
export and no receipt field, no section of it describes the staging mechanism, and it is
test-consumed, so editing it would have staled the receipt for nothing.

## Run gaps

Scanner swept `.cache/` and found no gap classes (`sweptClasses: []`) — this run recorded its
findings in `mission-list.md` rather than as per-node evidence files.

- `noise: the one defect this run found in its own work was fixed inside the run, not deferred.`
  The adversarial review measured `(w2)`'s disarm assertion, which justified itself with "or a
  COMPLETED sink prints a warning about a staged copy it already landed and deleted". That is
  **false**: dropping both disarm calls leaves `(#707 h)` green, because the landing deletes the
  stage and the handler's `existsSync` probe then finds nothing to report. The disarm *is*
  load-bearing, but for the narrower case that probe cannot see — a cleanup `rmSync` that fails
  leaves the directory on disk after a successful landing, and an un-disarmed note would then warn
  about a copy the run already landed. Both the `(w2)` message and the `(#707 h)` comment were
  rewritten to state what was measured, including the explicit note that `(#707 h)` does not arm the
  disarm. Nothing is owed forward.

## Follow-Up Items

**None filed, deliberately.** One derived observation is recorded here and *not* filed as an issue,
because it was reached by reading the code rather than by observing a failure, and this project's
discipline is to add only what an observed failure demands:

- On both routes `sinkLandStagedUnion` is wrapped in `try { … } catch (_) {}` and the following
  `fs.rmSync(wtStageDir, …)` runs regardless, so a landing that throws part-way deletes the staged
  copy with the unlanded remainder still in it. That is a *destroy* shape adjacent to #980 rather
  than the *stop* shape #980 is about, and this run's fix does not change it (the note cannot help:
  the directory is already gone by the time the handler probes it). **No failure of this kind has
  been observed**, so per ADR 0017's watch-list discipline it is recorded, not built and not filed.
  The preceding run's own lesson was over-filing exactly this class.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-980-981/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-980-981/.cache/doc-docking.md
- kaola-workflow/archive/bundle-980-981/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-980-981/.cache/run-gaps.json
- kaola-workflow/archive/bundle-980-981/finalization-summary.md
- kaola-workflow/archive/bundle-980-981/mission-list.md
- kaola-workflow/archive/bundle-980-981/workflow-state.md
