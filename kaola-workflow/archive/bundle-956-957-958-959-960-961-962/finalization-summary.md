# Finalization — Summary: bundle-956-957-958-959-960-961-962

Seven issues, all seven escalations of the #952 subtraction audit, closed as one set at `902f59a0`.
Two further findings from the same audit that had been escalated into no issue at all (D2 and D4)
were folded in with the user's agreement.

## Delivered

**Every filed issue was re-verified before it was acted on, and four were wrong about themselves.**
Two of those errors would have caused real damage:

- **#960 as filed would have redded the build.** It said `run-chain-pool.js`'s "only consumer is the
  test that exists to test it". No such test exists: the consumer is `scripts/test-parallel.js`, a
  live step in **both** claude chains whose self-test covers three separate modules. Deleting it
  whole would have broken the chains and stranded `test-shard-lib`'s only coverage. The corrected cut
  removed 52 lines from that file instead of 500.
- **#956 as filed would have deleted true documentation.** Its "23-line block" includes three lines
  describing a guard that is still armed and chain-pinned, and the mechanism was not merely removed
  but *replaced in the same commit*, so the repair is a rewrite with net zero deletion.
- **#957's headline was false.** It named `docs/api.md` and `docs/conventions.md` as the *sole*
  unbound copies of the Codex tier pair; root `README.md:180-181` is a third, in live normative prose.
- **#962 corrected itself twice.** D5's "two sites in a test-consumed doc" is one; S6 undercounted
  the dead constants by three, because `OUT_HOOKS_DIR` is defined in both sync scripts and a
  name-keyed search reads each file's own export as the other's consumer.
- **#959's cited counts did not reproduce** under any of four counting methods, though the structural
  claim they supported holds and the repair cites no counts.

What landed:

| issue | outcome |
|---|---|
| #956 | `docs/conventions.md`'s agent-profile parity block rewritten against the `ROLE_PINS` + 2/3-consensus successor that replaced `FEATURE_TOKENS` in the same commit that deleted it. Items 1 and 3 left intact — measured true and chain-pinned. |
| #957 | The Codex tier pair pointer-ized in `api.md` and `conventions.md`; root `README.md` keeps its values and gains a binding guard built from the constants. |
| #958 | `docs/architecture.md` now distinguishes the routing generator's *render targets* from the registry both sync scripts derive from, and names the consequence: a routing change leaves `.opencode`/`.kimi` stale until regenerated. |
| #959 | `docs/architecture.md:287` now reads "**Four editions** ship the same workflow across three forge CLIs" — one line, no rewrap, the load-bearing "four editions" vocabulary untouched across 243 lines. |
| #960 | `scripts/run-chain-pool.js` deleted (428 lines) with only its f6–f9 self-test coverage. |
| #961 | `scripts/fixtures-orphan-legality.js` deleted (102 lines) plus the stale exclusion comment in both byte-paired install-manifest copies. No test died — both importers were already gone. |
| #962 | S3 (87 lines of dead strips, byte-identical render proven), S4 (two uncalled CLI modes), S5 (eight comment sites rewritten across four trees, 0 net deletion), S6 (six dead constants), D3, D5, D7, D8. |
| D2, D4 | Unfiled audit findings, folded in with consent: `docs/README.md`'s removed effort mapping, and `docs/api.md`'s `cmdSinkPr` — a function git history proves never existed in any script. |

## Files Changed

29 files, **+314 / −866**.

Deleted whole: `scripts/run-chain-pool.js`, `scripts/fixtures-orphan-legality.js`.
Docs (8): `docs/{api,architecture,conventions,workflow-state-contract,README,kimi-edition,opencode-edition}.md`, `CHANGELOG.md`.
Scripts (6 canonical + forge ports across 4 trees): `kaola-workflow-claim.js`, `kaola-workflow-run-chains.js`, `kaola-workflow-install-manifest.js`, `sync-opencode-edition.js`, `sync-kimi-edition.js`, `runtime-edition-forge.js`.
Tests (5): `test-opencode-edition.js`, `test-parallel.js`, `test-run-chains.js`, `test-suite-registration.js`, `simulate-workflow-walkthrough.js` (comment only).
Guard (1): `scripts/validate-kaola-workflow-contracts.js` (+15).

## Test Coverage

Every suite below was run against the final candidate, with real exit codes captured directly.

| suite | result |
|---|---|
| `simulate-workflow-walkthrough.js` **at full scope** | exit 0 — 209/209 scenarios, `{"index":1,"total":1,"ran":209}`, 2400 spawns |
| four-chain receipt at `902f59a0` | claude 0, codex 0, gitlab 0, gitea 0 — none accepted-red |
| `test-opencode-edition.js` | exit 0, 563 assertions (identical before and after the cut) |
| `test-kimi-edition.js` | exit 0, 521 assertions (identical before and after) |
| `test-parallel.js --self-test` | exit 0, 23 assertions (36 → 23; the 13 lost are exactly the pool pins) |
| `test-run-chains.js` | exit 0, 283 assertions |
| `validate-script-sync.js`, `edition-sync.js --check`, `generate-routing-surfaces.js --check`, `test-suite-registration.js`, `validate-kaola-workflow-contracts.js` | exit 0 each |

The walkthrough was run at **full scope deliberately**: the fast gate samples a rotating 1/12 shard,
so green there is not a verified suite. It was also run **serially**, with no other agent active,
because the suite is spawn-bound and a parallel run produces false reds that cannot be attributed.

**Custody held throughout.** No implementer wrote a test. The `test-parallel.js` excision and the
A22 comment repair were both done by `tdd-guide`; the new README guard was authored by `tdd-guide`
and mutation-proven before it was believed. The tdd-guide that cut the pool coverage explicitly
declined to run the in-tree self-test afterwards, on the grounds that a passing suite is a verdict on
the implementation it does not grade — that run was taken by the orchestrator, and it was green.

## Validation

Four-chain receipt at `902f59a0`, `headSha` bound to the implementation commit,
`scope.changedFileCount: 29` matching the diff exactly — the cheap oracle that the chains saw this
change rather than an empty scope. All four chains exit 0, none accepted-red.

The receipt was taken **after** every test-consumed doc was final (`docs/api.md`,
`docs/workflow-state-contract.md`, `CHANGELOG.md`, `README.md`), since editing any of them moves
`computeCodeTreeHash` and would have staled a receipt taken earlier.

## Changed Paths

29 paths, all inside this bundle's scope: `docs/`, `scripts/`, `plugins/*/scripts/`, `CHANGELOG.md`.
No foreign project's workflow state, no unrelated user change. The six rendered edition trees were
copied into the worktree to run the edition suites and are gitignored, so nothing from them is
committed.

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`. Three independent passes: an adversarial Fable docs review of
every claim the diff adds, an independent CLAUDE.md-checklist pass by `doc-updater` (PASS, zero gaps,
zero edits), and the four-chain receipt. One gap found and fixed — see below.

## Run gaps

- manual:stale-comment (scripts/test-opencode-edition.js:761-762, 869-871 and 883-884 credit `rewriteClaudeModelNouns()` in the present tense): filed: #963
- manual:dead-code (`runScenario` in scripts/test-shard-lib.js and `makeShimSpawnFn` in scripts/test-parallel.js were already consumer-less at HEAD): filed: #964
- manual:stale-artifact (the MAIN checkout's four non-github rendered edition trees): noise: not a code defect and nothing committable — these are gitignored derived artifacts, so there is no tracked change to file against. Repaired during finalization instead, with the user's agreement: `--write` for the non-github forges took the stale count from 1 to 0 in each of `.opencode-gitlab`, `.opencode-gitea`, `.kimi-gitlab` and `.kimi-gitea`, verified afterwards to have touched no tracked file.

The two filed items are genuine defects with measurements attached and the search discipline they
need recorded in the issue bodies; the third was a derived-artifact staleness with a one-command
remedy, so it was fixed rather than queued.

## Follow-Up Items

- **#963** and **#964**, filed above with their measurements and the search discipline required
  before acting on them.
- **Not filed, recorded only:** `docs/investigations/*.md` (18 files) and
  `kaola-workflow/.origin/877/*.md` (6 files) carry ~90 further `plan-validator` mentions, all
  accurate history. They sit outside `docs/decisions/**`, which the retention policy names
  explicitly. Naming those directories in the policy too would spare a future sweep from
  re-deriving that they are exempt.
- **Not filed, recorded only:** `docs/architecture.md:289-290`'s "Most scripts are rename-normalized
  copies" holds for the gitlab/gitea trees but not the Codex tree, which keeps canonical filenames.
  "Most" hedges it into truth, and it sits outside #959's filed target, so it was left alone rather
  than widening that issue's scope.
- **Watch-list wording**, from the #962 premise pass: the opencode deletion transforms have no
  over-match observer, and with the S3 cut landed that exposure narrows to
  `stripCardModelPlaceholders` alone. A narrower row was drafted in `premise-962.md`. Nothing built —
  no failure has been observed, and the register of record is for exactly that case.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/doc-docking.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/doc-updater.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/.cache/run-gaps.json
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/finalization-summary.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-957-readme-guard.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-960-module.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-960-test.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-961.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-962-s5.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-962-sync.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-docs-1.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/impl-docs-2.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/mission-list.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-956.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-957.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-958.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-959.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-960.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-961.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-962.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/premise-d2-d4.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/repair-a22-comments.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/review-a-docs.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/review-b-subtractions.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/review-c-guard-editions.md
- kaola-workflow/archive/bundle-956-957-958-959-960-961-962/workflow-state.md
