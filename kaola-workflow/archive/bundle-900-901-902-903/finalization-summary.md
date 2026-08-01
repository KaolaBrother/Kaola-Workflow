# Finalization — Summary: bundle-900-901-902-903

Four issues, all filed from live consumer runs of the finalize/sink/closure seam. **All four premises
were independently reproduced before anything was built** — a deliberate front-load, because five issue
premises had turned out false across the preceding four bundles.

## Delivered

**#900 — a consumer can now produce the record the gate actually reads.** The gate requires a column-0
`validated_candidate_hash`; 13 shipped surfaces asked only for `verdict: pass` and the command, and no
invocable producer existed. Added `record` to the existing `kaola-workflow-validation-runner.js`
(reuse, not a new script). *Acceptance:* following the recipe verbatim now yields `chains_green` with no
internal `require()` and no hand-copied hash — proven on a consumer fixture through the identical gate
call, plus the linked-worktree case where the same bytes read from main give `final_validation_stale`,
which is what proves the binding is the worktree's.

**#901 — the sink no longer discards archived evidence and reports success.** A consumer `.gitignore`
of `.cache/` silently lost five evidence files from HEAD, the pushed remote and a fresh clone while
reporting `archive_commit: "done"` at exit 0. Four seams fixed; `done` is now gated on **blob presence
in the published commit**. *Acceptance:* the ignored leg went 5 missing → 0 with the archive commit
3 files → 8, on both archiver postures and all three editions, each measured before and after.

**#902 — `finalize --check` no longer refuses the ordinary linked-worktree topology.** It reported
`archive_authority_missing` and exited 1 while the transaction self-healed unaided. Fixed by applying a
rule the code already stated (`claim.js:3336-3338`: a machinery-repairable sync is reported as *state*,
never as an operator-owed precondition). *Acceptance:* check and execute now agree on the #902 topology,
a genuinely absent authority still fails closed, and `checks.validation` recovered from `not_checked` to
a real measurement.

**#903 — the closure audit can be scoped to one run.** Added `--project`/`--issue`/`--help`, a
fail-closed `current_project_clean`, and out-of-scope drift as a separate summary; fixed the measured
bug that bundle members were invisible because only the scalar `issue_number` was read. *Acceptance:*
`--project bundle-900-901-902-903` reports clean with all four members resolved, while this repo's two
unrelated findings land out of scope; unscoped output is byte-identical across all four modes.

**Edition parity restored.** Both forge ports carried a live retired `plan_hash` → `workflow-plan.md`
demand that canonical had deleted, so three editions gave two different verdicts for the same archive.
Deleted on owner ruling. `docs/api.md:990`'s parity claim was false before and is true now.

## Files Changed

44 files, +12330 / −500. Unique production surface is **6 canonical files** (+1361 / −91); the other 25
production files are edition copies, convergence measured byte-for-byte port-to-port. Tests +6250 / −8.
Docs and prose: `README.md`, `docs/api.md`, `docs/conventions.md`, `CHANGELOG.md`, `CLAUDE.md`, two
`templates/routing/` authoring surfaces, 12 rendered surfaces.

## Test Coverage

**~2900 lines of new pins from five authors, in eight suites, no deletions and no existing assertion
relaxed.** `test-claim-hardening` 461→557 · `test-finalize-door` 156→233 · `test-validation-runner` +31 ·
`test-sink-merge` +68 assertions · both forge sink suites +5 pins each · walkthrough 184→198 scenarios ·
both `test-git{lab,ea}-workflow-scripts` +13 pins each.

Custody held throughout: no implementer wrote a test, and no pin was rewritten to keep passing — when a
rename landed mid-pass on the very bit a mutant had proved load-bearing, the arms survived because they
assert behaviour, not the bit's name.

**Every pin is either baseline-red or mutation-armed, stated per pin.** Baseline reds: 40
(finalize-door), 39 (claim-hardening), 19 (sink, canonical) + 20 per forge port, 11 of 13 (walkthrough),
11 of 13 per forge audit suite. Pins that green on baseline by design are gap measurements or
fail-closed anchors, each armed by a named mutant.

The load-bearing shapes, recorded because they are why these defects survived their whole life:
durability is asserted via `git ls-tree` and a **fresh clone**, never `fs.existsSync` — and never
`archive_commit: "done"`, since the defect satisfied both.

## Validation

Four-chain receipt over this candidate: `claude`, `codex`, `gitlab`, `gitea` — all `exitCode 0`,
`accepted_red false`, `timed_out false`. `codeTreeHash 5e4b8f67…`. **The gate's own verdict:
`validation: chains_green`, `ok: true`, `reasons: []`.**

Independently, by the orchestrator, from the worktree with `pwd` confirmed on every command: the
walkthrough at **full scope** (the chain runs it at a 1/12 shard) → **198/198 scenarios, 2079 spawns**,
which differs from the baseline's 184/184 / 1958 and is therefore positive proof it exercised this
bundle; plus `generate-routing-surfaces --check` (18 surfaces), `validate-script-sync`,
`validate-workflow-contracts`, `validate-kaola-workflow-contracts`, `test-spawn-classification` — all 0.

**Reuse boundary, stated rather than absolute:** the chains ran after all code and all test-consumed
prose had landed. Documentation written *during* this finalize phase is limited to
`.cache/doc-updater.md`, `.cache/doc-docking.md`, this summary and `.cache/run-gaps-manual.md` — all
under `kaola-workflow/`, which is validation-invisible, so the receipt's candidate is unchanged. No
tracked doc was edited after the chain run; `docs/architecture.md` was deliberately left alone for that
reason and its no-impact reason is recorded.

**One finding at the gate, and it is filed:** the receipt was written to the worktree's run folder while
the gate reads the authority (main's), so it first classified `chains_unverified`. Resolved by placing
the receipt in the authority folder — the receipt's content is path-independent, `kaola-workflow/` is
validation-invisible so placement cannot alter the hash, the copy was byte-identical, and the gate
returning `chains_green` is what proves it correct. Filed as #910; it is #900's producer/gate root
divergence, unsplit for the chain runner.

## Changed Paths

`changed_paths` was `[]` at check time because nothing was committed — the whole bundle lands as one
diff at the finalize commit. The 44-file working set is enumerated above and in the transaction's own
report below.

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`. Four gaps found and fixed during docking. 14/14 consumer surfaces
carry the required field and the recorder command, verified with `.opencode*`/`.kimi*` paths named
explicitly because this box's `grep` is ugrep and skips dot-directories. No untraceable structured
section: every flag, key and exit code was measured from live output.

## Run gaps

- manual:destruction (two routes delete a live copy uncompared): filed: #906
- manual:path-quoting (six non-`-z` readers remain): filed: #907
- manual:coverage (five guards unpinned by construction): filed: #908
- manual:drift (this repository carries two pre-existing closure-audit findings): filed: #909
- manual:producer-gate (run-chains --project P from a linked worktree writes the receipt to the): filed: #910

## Follow-Up Items

#906 destruction-safety in the archive path (two routes delete a live copy uncompared) · #907 latent
path-quoting readers and a permanently unclearable `.git`-file block · #908 five guards unpinned by
construction, each with its declined mechanism and signature recorded · #909 this repository's two
pre-existing closure-audit findings · #910 the chain runner's receipt path.

**Nine defects came from adversarial review after eleven suites, 197/197 scenarios and every
implementer's own mutation proofs were green** — including one that destroyed evidence at exit 0, one
where the recorder replaced `final_validation_unbound` with `final_validation_stale`, and one guard
whose condition was unreachable. That is the load-bearing fact about this run: the green suites were
necessary and nowhere near sufficient.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-900-901-902-903/.cache/adv-guards.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/adv-review.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-900-901-902-903/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-900-901-902-903/.cache/doc-docking.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/doc-updater.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/fix-audit.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/fix-claim-sink.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/fix-runner.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-900.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-901-ports.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-901.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-902.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-903.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-claim-ports.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-parity.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/impl-prose.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-900-901-902-903/.cache/premise-900.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/premise-901.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/premise-902.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/premise-903.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/run-gaps.json
- kaola-workflow/archive/bundle-900-901-902-903/.cache/tdd-finalize.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/tdd-forge-audit.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/tdd-parity.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/tdd-sinks.md
- kaola-workflow/archive/bundle-900-901-902-903/.cache/tdd-walkthrough.md
- kaola-workflow/archive/bundle-900-901-902-903/finalization-summary.md
- kaola-workflow/archive/bundle-900-901-902-903/mission-list.md
- kaola-workflow/archive/bundle-900-901-902-903/workflow-state.md
