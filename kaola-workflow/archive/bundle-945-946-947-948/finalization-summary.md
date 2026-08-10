# Finalization — Summary: bundle-945-946-947-948

Four post-#940–#944 audit observations, closed together. Every one was re-measured before anything
was built, and the premise pass changed the shape of three of the four.

## Delivered

**#945 — seven routing-surface assertions that could not fail for the reason they name.** Confirmed
exactly: under a dead sandbox all seven `--check exits 1 on a hand-edited <topic> surface` assertions
pass against a process that died at module load, because a Node module-load failure exits 1, the same
code `cmdCheck` uses to signal detected drift. The issue's own framing was **refuted**: it credited
the `clean.status` baseline as the aggregate catch, but that control is one-shot and pre-loop and
passes under a mid-loop sandbox death; the load-bearing controls are the per-victim drift-name and
revert assertions, which catch 7/7. The recurring cause was a hand-typed sandbox copy list that
staled whenever a new `require` appeared (#944 staled it; a prior incident did too). That list is now
**derived from the generator's real require graph**, with two anchors preventing it from resolving to
nothing, and the exit-code assertion now names the surface path. Proven by a negative control: with
the *same* injected require, the old hand-typed list gives 16 failures and **zero** of the seven fail
— all vacuous — while the derived list passes 434.

**#946 — a dead placeholder registration, undercounted 8×.** The mechanical claim held, but
`INVESTIGATOR_MODEL` is not a special case: **8 of 11** registered placeholders had no consumer, and
the issue's grep pathspec was defective (no `skills/` directory exists at repo root; `plugins/*/commands/`
was omitted). Its broader framing — "investigator's tier reaches no rendered surface" — is **refuted**:
that tier reaches shipped bytes through four other carriers. On the owner's ruling the list was
treated as residue rather than a capability surface, and all eight were removed from both coupled
lists in one edit. Proven to change **zero installed bytes** by A/B install into isolated sandbox
homes. No role was retired; all eight still ship.

**#947 — a dangling cross-reference on shipped Codex prose.** Confirmed, and the design call the
issue left open was **settled by evidence rather than preference**: the gate was introduced valid,
then orphaned by the commit that moved Codex profile readiness to install time, which deleted 78
lines from each skeleton with zero insertions. Restoring it is refuted — the removed section carries
6 of the 9 tokens the install-boundary guard forbids, so restoring would red that guard and reverse
four documentation surfaces. Retired instead. Scope was 5 carriers, not 1: the prose, the
`REGION:skill` comment whose sole recorded justification *was* the dead gate, and three rendered
surfaces. The directive itself was kept — deleting it would have changed what renders on six surfaces
— with only its justification rewritten.

**#947 adjacent, unfiled — the guard could not see what it was built to exclude.** The
install-boundary check forbids `profile freshness gate` and matched it case-sensitively, while the
survivor shipped as `Profile Freshness Gate`. It was green, and mutation-proven, with the dangling
reference on a shipped surface the whole time. Matching now folds case. Sequenced deliberately: the
guard was landed **red first** (4 failures), and the prose retirement turned it green — so the fix is
mutation-proven by construction rather than merely green.

**#948 — an uncovered mixture in the remediation-footer band.** Substance confirmed; the behaviour
was verified correct by hand across all seven mixtures, so it is a coverage gap, not a defect. The
issue miscounted — two subsets were absent, not one — but correctly identified the only
**branch-distinct** one; the three-way has a branch profile identical to a covered scenario. One
scenario added, no assertion authored, no footer wording pinned.

## Files Changed

| file | issue | change |
|---|---|---|
| `scripts/test-generate-routing-surfaces.js` | #945 | copy list derived from the require graph; +2 anchors; assertion message names the path (+36/−11) |
| `install.sh` | #946 | 8 dead placeholder registrations removed from both lists; coupling invariant recorded (+4/−16) |
| `templates/routing/next.skeleton.md` | #947 | dangling pointer retired; REGION justification rewritten; live rule kept |
| `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md` | #947 | regenerated, never hand-edited |
| `scripts/test-route-reachability.js` | #947 | forbidden-token matching folds case (+7/−1) |
| `scripts/test-opencode-edition.js` | #948 | one scenario added to `A30.SCENARIOS` (+10) |
| `CHANGELOG.md` | all | `[Unreleased]`: #948 Added; #947 ×2 and #945 Fixed; #946 Removed (+55) |

Test custody was held throughout: `tdd-guide` authored every test-path change (#945, #948, the guard
fix), `implementer` wrote `install.sh` and the skeleton, and neither wrote the other's artifact.

## Test Coverage

Re-run **serially by the orchestrator**, in the worktree, with absolute paths and real exit codes —
no subagent's green was taken on faith, and this suite is spawn-bound and false-reds under
concurrency:

| suite | result |
|---|---|
| `simulate-workflow-walkthrough.js` (FULL scope) | 209/209 scenarios, `"total":1` unsharded, exit 0 |
| `test-generate-routing-surfaces.js` | 434 assertions, exit 0 (was 432) |
| `test-route-reachability.js` | 331 assertions, exit 0 |
| `test-opencode-edition.js` | 563 assertions, exit 0 (was 555), 3 trees in parity |
| `generate-routing-surfaces.js --check` | all 18 surfaces byte-match, exit 0 |
| `test-install-model-rendering.js` | exit 0 |
| `validate-workflow-contracts.js` | exit 0 |

The full-scope walkthrough was run **in addition to** the chains, because the `claude` chain samples
it at `--shard auto/12` and a sampled green is not a verified suite.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED`. Evidence: `.cache/doc-docking.md`, `.cache/doc-updater.md`.

`CHANGELOG.md` was written **before** the receipt run, so the receipt is not staled by a
finalize-time doc edit. No other doc change is owed: the only live-surface references to the
placeholder machinery are in `docs/decisions/` and `docs/investigations/`, which `docs/README.md`
sanctions as dated historical records. `docs/api.md`, `README.md`, `docs/workflow-state-contract.md`
and `docs/agents-source.md` are test-consumed and were deliberately not edited. The Codex readiness
boundary already reads correctly in `README.md`, `docs/architecture.md`, `docs/conventions.md` and
`docs/api.md`, so #947 required no doc change.

## Run gaps

- `doc-badge-overclaim` — filed: #949
- `doc-stale-assertion-count` — filed: #950
- `a30-footer-line-unpinned` — filed: #951
- `derived-copylist-lazy-require` — noise: a bounded, deliberately-recorded residue of #945's own fix,
  not a defect in it. The walk sees requires that executed; every repo-local require in the graph is
  top-level today, so the graph is fully realized, and the residue is visible rather than silent
  because the baseline assertion carries the child's stderr and names `Cannot find module` directly.
  Building the static scan that would close it means parsing around `require(...)` literals embedded
  in `slots.js`'s shell snippets — a mechanism for a failure class never observed, which this repo's
  watch-list discipline records rather than builds.
- `opencode-tree-stale-in-main` — noise: generated per-checkout state, not a tracked defect.
  `git ls-files .opencode` returns 0 files. The main checkout's copy is stale against
  `agents/synthesizer.md` since `97df0d6f`, so the opencode suite fails at D0 *there*; the worktree
  this run used was unaffected and its three trees were in parity. Fixed by regenerating locally, not
  by a repo change.
- `codex-install-cache-stale` — noise: the installed Codex plugin cache is at 7.5.5 while the repo is
  9.5.5. A reinstall matter observed while reading installed bytes, orthogonal to all four issues.

## Follow-Up Items

- #949 — two doc surfaces claim the model badge renders on every subagent dispatch; three do.
- #950 — `docs/conventions.md:325` cites an assertion count stale by 6.
- #951 — A30 cannot see the source-edit footer line being dropped when a flag is already named.

All three are pre-existing or contract-level, none blocks this bundle, and #949's fix touches a
test-consumed file so it deliberately did not land here.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-945-946-947-948/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-945-946-947-948/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-945-946-947-948/.cache/doc-docking.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/doc-updater.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/impl-945.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/impl-946.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/impl-947-t19.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/impl-947.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/impl-948.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-945-946-947-948/.cache/premise-945.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/premise-946.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/premise-947.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/premise-948.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-945-946-947-948/.cache/run-gaps.json
- kaola-workflow/archive/bundle-945-946-947-948/finalization-summary.md
- kaola-workflow/archive/bundle-945-946-947-948/mission-list.md
- kaola-workflow/archive/bundle-945-946-947-948/workflow-state.md
