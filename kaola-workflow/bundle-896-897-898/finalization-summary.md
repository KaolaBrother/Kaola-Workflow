# Finalization — Summary: bundle-896-897-898

Closes #896, #897 and #898 as one all-or-nothing set. Branch `workflow/bundle-896-897-898`,
implementation commit `6eed9801`.

## Delivered

**#896 — answered, no code change, under the issue's own outcome (b).** The `run_not_finalized`
measurement's absence from `--sink` is not a gap. `main()` routes `--sink` to `runSinkTransaction` and
returns at `:2517`, before the legacy precondition block at `:2520`, so of four pre-merge guards only
`worktree_dirty` runs there — and that is correct, because `SINK_STEPS` carries its own `finalize`
step calling `archiveProjectDir`. On that path the sink *is* the finalizer, and a live run folder on
the branch is the expected sole-archiver posture that every existing `test-sink-merge` scenario uses.
Porting the measurement would stop the routed finishing flow, and `sinkPreflight`'s only handler
hardcodes `result:'refuse'`, which "Nothing refuses" forbids for a verdict about the work.
The issue's two code citations named the wrong file: `assertNoLiveWorkflowFolder` is at
`kaola-workflow-sink-merge.js:319-346` with its call site at `:2572`, not in `claim.js` at all.
`docs/api.md` is corrected instead.

**A defect found while measuring #896 — a sink whose archive failed reported success.** The catch
around `archiveProjectDir` rethrew only `TypeError`/`ReferenceError` (the #555 export-drift class) and
swallowed everything else, leaving `receipt.archive_dest` unset; the #700 guard is scoped to a *set*
dest, so it could not fire. Reproduced with `chmod 555 kaola-workflow/archive`: exit 0,
`status: sinked`, the live `workflow-state.md` and `mission-list.md` pushed to `origin/main`, the issue
closed, main left dirty. Fixed across all four editions by keying on what `archiveProjectDir`
*reported* — `archived === true` the only success, `skipped === 'source-missing'` the only legitimate
no-op — because both legitimate no-archive outcomes leave the dest unset exactly as the defect does.
`archiveProjectDir` returns its own `archive_exception` rather than throwing, so a fix written at the
catch arm alone would not have closed the original reproduction. The
`KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL` return-path door is closed by the same key.

**#897 — three assertions.** A failed probe read as closed, an empty answer read as closed, and
deletion of the `KAOLA_WORKFLOW_OFFLINE` short-circuit. Behaviour unchanged; coverage only.

**#898 — `T5j` pins exact `headSha` equality as the only binding route,** and two of the issue's four
claims were refuted in the process. A *broad* relaxation does not depend on a 1-in-12 shard:
`test-kernel-conformance.js` spawns the walkthrough unsharded, so broad reds the fast gate at
probability 1.0. And the fence the issue proposed cannot be built — the pass envelope is rebuilt
key-by-key, so its keys are identical under pristine, narrow and broad alike. The *narrow* route was
the only real exposure, and detection of it goes 0.0 → 1.0.

**Three additions authorized mid-run by the user.** `CONSUMER_DOCS_PATH` rejects a routing surface
naming a `docs/…` path the reader will not have, with the allowance *derived* from the init scaffold
rather than enumerated. The opencode and kimi suites now `--check` for edition drift *before*
`--write`, instead of self-healing the thing they measure. And `kaola-workflow/dp/` — a `node_ledger`
left by the DAG executor ADR 0017 deleted — is removed.

## Files Changed

13 files, +1105/-32, all in `6eed9801`.

- `scripts/kaola-workflow-sink-merge.js` and three edition copies — the archive-confirmation fix.
- `scripts/validate-workflow-contracts.js` and its mandated byte mirror under
  `plugins/kaola-workflow/scripts/` — `CONSUMER_DOCS_PATH`.
- `scripts/test-sink-merge.js`, `scripts/simulate-workflow-walkthrough.js`,
  `scripts/test-finalize-door.js`, `scripts/test-opencode-edition.js`,
  `scripts/test-kimi-edition.js` — test-only.
- `docs/api.md`, `CHANGELOG.md` — documentation.
- `kaola-workflow/dp/.cache/run-progress.json` — deleted.

## Test Coverage

Authored under test custody throughout: no agent that implemented a behaviour wrote its tests.

- `test-sink-merge.js` — `(x1)` pins the archive failure with six clauses (envelope emitted, not
  `sinked`, non-zero exit, envelope names the failure, `origin/main` untouched with both live files
  absent and no close, journal survives with finalize not done). Proven RED on baseline `3e2019f6`
  at 8 failed / 274 passed, then green at 283. `(x2)` and `(x3)` fence the two legitimate no-archive
  cases and the #555 rethrow.
- `simulate-workflow-walkthrough.js` — three sub-cases on
  `testActiveFoldersExcludesClosedIssue895`, each mutation-proven against *both* the old and the new
  scenario; the offline case additionally carries attribution proof.
- `test-finalize-door.js` — `T5j`, proven across four legs (pristine 0, narrow 1, broad 1, pristine 0)
  with the carry-over hunks reverse-applied from `6fdbf714`. Under narrow, `test-finalize-door.js`
  reds **alone**.
- `test-opencode-edition.js` / `test-kimi-edition.js` — drift check, mutation-proven armed in both,
  with the absent-tree case proven not to false-red on a fresh clone.

## Validation

Four chains green, bound to `6eed9801` by exact `headSha`, judged by receipt content rather than exit
code: `claude` 222.3s, `codex` 5.8s, `gitlab` 57.1s, `gitea` 56.2s. Every chain carries
`exitCode: 0`, `accepted_red: false`, `attempts: 1`, `timed_out: false`, and every step within them is
`exitCode: 0`. Nothing waived.

The `claude` chain samples the walkthrough at `--shard auto/12`, so it does not on its own verify the
suite. Full scope is discharged twice independently: a dedicated pre-commit run at 184/184, and
`test-kernel-conformance.js` inside the chain, which spawns the walkthrough unsharded.

## Changed Paths

## Documentation Docking

## Run gaps

- manual:legacy-only-guard (assertBranchHasNonWorkflowChanges is wired into the legacy sink path only): filed: #899
- manual:production-redundancy (removing the KAOLA_WORKFLOW_OFFLINE guard from issueIsClosed alone): noise: not a coverage hole. ghExec's own guard masks each single-site removal, so the output is identical to correct behaviour and no readActiveFolders assertion can distinguish them. Chasing it with a test would produce an unfalsifiable assertion, which is the exact defect #897 existed to remove.
- manual:guard-not-in-npm-surface (sync-opencode-edition.js/sync-kimi-edition.js --check now runs): noise: deliberate. CLAUDE.md rules opencode and kimi additive editions that run their own suite, and test:kaola-workflow:editions is that surface; a bare --check step would false-red every fresh clone, since the trees are gitignored build products. Recorded so a later audit does not read the absent grep hit as an absent check.
- manual:check-coverage-limit (CONSUMER_DOCS_PATH does not catch a docs/ path that is both unbackticked and extension-less): noise: a deliberate false-negative-over-false-positive choice, recorded in the code comment at the check itself. Catching it would require a rule that cannot distinguish a path from prose.
- manual:unexplained-environment (a subagent scratch mirror under the session scratchpad was wiped mid-run): noise: not reproducible across ~12 later full runs, and every rmSync in both suites targets mkdtemp/os.tmpdir. Recorded as unexplained rather than attributed to the suites on no evidence.

## Follow-Up Items

- **#899** — `assertBranchHasNonWorkflowChanges` is legacy-path-only, the same shape #896 turned out to
  be. Filed with its premise explicitly marked NOT CONSTRUCTED and with the construction recipe that
  would settle it, because three issues in the preceding bundle shipped on premises that proved false
  — including #896's own. Outcome (4), "something else already stops it", is named in the issue as a
  legitimate close.
- **#878** remains open and unscheduled by design — reference only.

## Status: READY FOR FINAL GIT GATE
