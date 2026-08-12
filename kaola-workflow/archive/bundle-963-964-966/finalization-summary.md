# Finalization — Summary: bundle-963-964-966

Closes the entire open backlog: #963, #964, #966. Selected as one run because all three were open,
unclaimed, and share a scope — small findings from the same audit lineage, no two touching the same
file.

## Delivered

**#963 — stale S2 comments in `scripts/test-opencode-edition.js`.** Three sites credited
`rewriteClaudeModelNouns()` in the present tense ("is what makes it pass now") for a function that
exists nowhere. Verified before editing: the identifier survives in the tracked tree only inside this
file's own comments, and `CHANGELOG.md:2172` records #812 deleting it from both
`sync-opencode-edition.js` and `sync-kimi-edition.js` when the canonical sources were neutralized at
source instead. The comments now state what is true — nothing rewrites on the way out, and the sweep
passes because canonical `commands/` + `agents/` carry zero capitalized model nouns (measured: empty
result). **Comment text only; no assertion moved.** With no rewrite left to normalise a reintroduced
noun, those assertions are strictly stronger than when written: a canonical reintroduction now
reaches the generated surface and reds them. The issue's one open question — whether
`test-kimi-edition.js` mirrors any of this — was measured and answered **NO** (zero hits for all
three needles), so the scope stayed one file.

**#964 — two consumer-less helpers plus a dead knob.** Cut `runScenario` (`test-shard-lib.js`, and
its `module.exports` entry) and `makeShimSpawnFn` (`test-parallel.js`; `nodeShimSpawn` is the shim
actually wired at :249 and :301). The cut takes one **mechanism**, not two symbols: `TIMING_ON` and
its `KAOLA_TEST_SCENARIO_TIMING` env flag existed solely to serve `runScenario` and reach no doc
surface, so they die with it rather than surviving as a knob wired to nothing. **Both files kept** —
`test-parallel.js --self-test` is a live step in both claude chains and still covers
`test-shard-lib`.

**#966 — `validate-remote` reported a verdict it could not support.** The check iterates the LOCAL
sources and asks one question of each; over an empty `.roadmap/` the loop body never executes and it
printed the same bare `ok` as a genuinely reconciled set. Success now names its domain, and the count
is entries that actually reached the remote call — so an unparseable source is never reported as
compared, which would have been a fresh instance of the same lie. Ported to all four script copies.
`CLAUDE.md` and `docs/api.md` stop presenting it as the general roadmap-drift check.

### Owner rulings taken in conversation this run

1. **`ROADMAP.md`'s "active work" means CLAIMED RUNS ONLY.** So `No active work` was TRUE at
   `85209757` and the mirror needs no change; only the drift check misled. The competing reading —
   that the mirror should track the open backlog, which would have made this a much larger change
   across three forge ports — was **DECLINED**.
2. **The repair is "report what it compared."** The reverse-direction option (report
   open-on-remote-with-no-local-source) was **DECLINED**.

## Files Changed

| file | what |
|---|---|
| `scripts/kaola-workflow-roadmap.js` | `validateRemote(root, stats)` optional out-param; domain-naming success line |
| `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` | byte-identical copy |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | same, `issueIid` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | same, `issueNumber` |
| `scripts/test-opencode-edition.js` | three S2 comment sites restated |
| `scripts/test-shard-lib.js` | `runScenario`, `TIMING_ON`, env flag, export entry removed |
| `scripts/test-parallel.js` | `makeShimSpawnFn` removed |
| `CLAUDE.md` | drift-check bullet states its one direction |
| `docs/api.md` | subcommand row + three export signatures |
| `CHANGELOG.md` | three `### Fixed` entries under `[Unreleased]` |

## Test Coverage

**No new test was authored, and that is the deliberate outcome, not an omission.** Two of the three
issues are pure subtraction — comment text (#963) and dead code (#964) — where the discipline is that
a test dies with its mechanism and is never repaired ahead of it. The #966 change is a stdout string;
its oracle is the issue's own reproduction, which was executed live against the real forge rather
than simulated:

| case | fixture | result | exit |
|---|---|---|---|
| vacuous | `.roadmap/` holds only `_rules.md` | `ok: nothing compared — no open local sources. This checks .roadmap/issue-*.md outward and cannot see an issue open on the remote with no local source` | 0 |
| counted | one source for #963 (OPEN on remote) | `ok: 1 open local source compared against the remote, none closed there` | 0 |
| drift | one source for #965 (CLOSED on remote) | `roadmap drift: issue-965.md marked open but closed on remote; run finalize or remove stale .roadmap files` | 1 |

The drift case is the regression control: it proves the pre-existing detection path still fires after
the edit. Probe files were removed and `git status` verified clean of them.

Existing suites run against the final candidate, each exit code read on its own:

- `simulate-workflow-walkthrough.js` at **FULL scope** (not the 1/12 fast-gate shard) — **209/209
  scenarios, 0 failed**, exit 0.
- `test-opencode-edition.js` — 570 assertions, exit 0, **with 3 trees in parity**. The first run was
  a partly vacuous green (`drift-check: NO tree verified; 3 ABSENT`) because a fresh worktree has no
  gitignored `.opencode`; the reported run is the one after `sync-opencode-edition.js --write`, which
  actually read the surface.
- `test-parallel.js --self-test` — 23 assertions, 0 failed, exit 0. Identical to the post-#960
  baseline recorded in `archive/bundle-956-…/review-b-subtractions.md`, which is what shows the cut
  removed dead code and no assertion.
- `validate-script-sync.js`, `validate-workflow-contracts.js`, `test-forge-roadmap-rules.js` (90
  passed), `test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`, and both forge
  contract validators — all exit 0.

The two forge suites are the load-bearing ones for #966: they pin `validateRemote`'s return with
`assert.deepStrictEqual(…, [996])` / `[9960]`, which is why the count rides an optional out-param
instead of a changed return shape.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. `CHANGELOG.md`, `CLAUDE.md` and `docs/api.md` updated;
`README.md:1010`, `docs/architecture.md` and `.env.example` reviewed with explicit no-impact reasons.
The `.env.example` check was deliberate rather than pro forma, because #964 removed an environment
variable: `KAOLA_TEST_SCENARIO_TIMING` appeared in no doc surface anywhere, so its removal orphans
nothing. `docs/api.md` named `validateRemote(root)` in three places, not one — the two forge sections
would have been left stale by an edit that only fixed the canonical section.

## Run gaps

- manual:guard-threshold (the CLAUDE.md line check in scripts/validate-workflow-contracts.js:339 enforces a 198-line ceiling while its own message and CLAUDE.md's Maintenance rule both say 200): filed: #967

## Follow-Up Items

One, **filed as #967** on the owner's explicit instruction. It was put to them in conversation rather
than filed unilaterally, because the instruction for this run was to *finish* the backlog and filing
reopens it at one; the owner chose to file.

**#967 — the `CLAUDE.md` line guard enforces 198, not 200.**
`scripts/validate-workflow-contracts.js:339` asserts
`read('CLAUDE.md').split(/\r?\n/).length < 200`. A trailing newline contributes one extra empty
element, so a file with 199 physical lines fails under a message that says the target is 200 — and
`CLAUDE.md`'s own Maintenance section says "Keep this file under 200 lines". **Observed, not read:**
taking the file to 199 lines threw at module load and red the whole contracts validator, surfacing in
the walkthrough only as an opaque `testContractValidatorOfflineSkip` failure. Because the assertion
sits at column 0 of the module body, its failure takes down the entire CLI rather than reporting a
scoped finding. Cost this run one diagnose-and-fix cycle. The fix is one line either way — trim
before splitting, or restate the target as 198 — and rewording alone is a legitimate closure.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-963-964-966/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-963-964-966/.cache/doc-docking.md
- kaola-workflow/archive/bundle-963-964-966/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-963-964-966/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-963-964-966/.cache/run-gaps.json
- kaola-workflow/archive/bundle-963-964-966/finalization-summary.md
- kaola-workflow/archive/bundle-963-964-966/mission-list.md
- kaola-workflow/archive/bundle-963-964-966/workflow-state.md
