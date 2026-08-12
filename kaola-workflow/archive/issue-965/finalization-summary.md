# Finalization — Summary: issue-965

## Delivered

`install-opencode.sh` and `install-kimi.sh` now converge their support-script directory on the
install manifest instead of only copying into it, closing the gap that let a script retired from the
tree live forever in a runtime home.

The defect was found by measurement, not by reading: immediately after an `install-all.sh` run
reporting **all four runtimes PASS** at `d5165f7c`, the manifest emitted 17 scripts for github while
the opencode home held **30** `.js` files and the kimi home **28**. The extras were DAG/adaptive-era
scripts the tree had already deleted. `install.sh` has always pruned (`:188`), which is why the
claude home measured exactly 17; the two additive editions had only ever copied forward.

For opencode this was more than clutter — `kaola_script()` resolves by search path over that
directory, so a retired script stayed resolvable by name.

## Files Changed

| file | change |
|---|---|
| `install-opencode.sh` | +27, sweep in `install_support_scripts()` (~:427) |
| `install-kimi.sh` | +26, same (~:223) |
| `scripts/test-opencode-edition.js` | +70, `S1b` |
| `scripts/test-kimi-edition.js` | +69, `P1b` |
| `CHANGELOG.md` | `[Unreleased] ### Fixed` |
| `docs/opencode-edition.md` | convergence stated (~:212) |
| `docs/kimi-edition.md` | convergence stated (~:228) |

The sweep enumerates the destination and intersects against what the install actually deployed, so a
delete path is never constructed from a manifest-supplied name — the discipline
`sweep_retired_agents()` already modelled. Scoped to `*.js` (`install.sh`'s scope), guarded so a
deploy that copied nothing sweeps nothing.

## Test Coverage

Authored by `tdd-guide`, which never touched a production file; implemented by `implementer`, which
never touched a test file. Custody held on both sides.

Each pin plants a retired name, a user `.js` and a non-`.js`, runs the REAL installer, and reads the
manifest through the installer's own CLI. A positive control asserts neither planted `.js` is a
manifest name, so the case cannot pass for the wrong reason.

| suite | baseline | after |
|---|---|---|
| `test-opencode-edition.js` | 3 fail / 567 | 570 pass |
| `test-kimi-edition.js` | 3 fail / 525 | 528 pass |
| `test-install-manifest-single-source.js` | pass | pass |
| `test-install-all.js` | pass | 131 pass |
| `simulate-workflow-walkthrough.js` | — | 209/209, FULL scope |

**Mutation-proven per site, one at a time**, because an N-site mutant proves >=1 and never N:
disabling opencode's sweep alone reds opencode (3 / 567) and leaves kimi green (528); disabling
kimi's alone reds kimi (3 / 525) and leaves opencode green (570). Both files were then byte-diffed
against their proven-good snapshots.

## Validation

Chains PASS. Receipt `kaola-workflow/issue-965/.cache/chain-receipt.json`, `headSha c3f4ecfc`,
equal to the branch HEAD. Selection `claude-only`, reason `non_edition_diff`, base `d5165f7c`,
`touchedEditionPaths: []` — correct, since opencode and kimi are additive editions and not among the
four chain editions; their own suites were run separately and are recorded above.

Reuse boundary, stated rather than absolutised: the suite numbers above cover the tree as committed
at `c3f4ecfc`. The `docs/opencode-edition.md` and `docs/kimi-edition.md` edits landed *after* that
commit and are prose consumed by no test in these suites.

One caveat worth carrying: the claude chain's own walkthrough step runs `--shard auto/12`. The
full-scope 209/209 run above is the one that counts.

## Changed Paths

Per the finalize transaction: `install-kimi.sh`, `install-opencode.sh`,
`scripts/test-kimi-edition.js`, `scripts/test-opencode-edition.js`. `CHANGELOG.md` and the two
edition docs are docs docked in this phase.

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. Both edition docs described the install as only *copying* support
scripts; that became an incomplete account of what the installer does to a user's directory, so both
now state the convergence and its `*.js` scope. `README.md`, `docs/api.md`, `docs/architecture.md`,
`docs/conventions.md` and `.env.example` carry explicit no-impact reasons.

## Run gaps

Scanner swept `sweptClasses: []`. Two observations, neither filed:

- `noise: pre-existing and already recorded` — `.roadmap/` held only `_rules.md` while #963 and #964
  were open on the forge, and `validate-remote` returned `ok` against that mismatch. Not caused by
  this run and not in its scope; the vacuousness of `validate-remote` is a known prior finding.
  Raised with the user rather than filed, since filing is theirs to authorize.
- `noise: fixed at source, not a separate defect` — `install-all.sh` reported all-PASS while 24
  orphans were present. Its convergence check covers the version-keyed Codex plugin, not the script
  set; with the installers now pruning, the accumulation it could not see no longer occurs.

Two claims in the issue itself were wrong and are corrected in the CHANGELOG rather than left
standing: the "mirrors install.sh" comments never advertised prune parity (they scope to the Oracle
Kernel fallback and the manifest list), and macOS `/bin/bash` 3.2.57 expands `${#arr[@]}` on an empty
local array without complaint under `set -u`, so the empty-deploy guard was never fragile.

## Follow-Up Items

None blocking. The one open question is a values call recorded for the user: the pins fix that an
*unlisted* `.js` in the installer-owned directory is swept, matching `install.sh`, rather than the
narrower manifest+hash shape opencode uses for agents. Changing that is a one-assertion edit.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-965/.cache/chain-receipt.json
- kaola-workflow/archive/issue-965/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-965/.cache/doc-docking.md
- kaola-workflow/archive/issue-965/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-965/.cache/run-gaps.json
- kaola-workflow/archive/issue-965/finalization-summary.md
- kaola-workflow/archive/issue-965/mission-list.md
- kaola-workflow/archive/issue-965/workflow-state.md
