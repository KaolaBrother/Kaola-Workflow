# Finalization — Summary: bundle-950-951

Issues #950 and #951. Branch `workflow/bundle-950-951`, implementation commit `8b6eeb48`.

## Delivered

**#950 — a worked example in `docs/conventions.md` outlived the defect it described.**

The filed diagnosis was refuted. The issue reported a count "stale by 6" (325 vs a measured 331);
measurement found the *claim* had inverted, which is worse. Under the forge-deletion mutation
`test-route-reachability` no longer stays green — it reds at `T19b universe: … 6 … found 4`. Writing
the filed 331 back would have preserved the false half of the sentence. And the mutated run evaluates
324 passed + 1 failed = **325**, the doc's own numeral reached for an unrelated reason, so a reader
re-checking the count would have confirmed a sentence whose claim had already flipped.

The cause is not what the issue supposed either. Nothing was re-anchored: the floor the five-defect
table describes is still `ROUTING_FORGES.length`-derived and still passes (probe: expected=8 actual=8
under the mutation). What reds is a separate band added whole by `97df0d6f` for #944 (+232 lines, zero
deletions), against a `codexEditions` literal that predates it by two months. The claim was falsified
by a **neighbour**, with nothing about its subject changing — the harder rot to notice.

Repair: the counter-example is repointed at the walkthrough's `testAxiomBlockByteIdentity`, which is
genuinely still registry-derived, passes at 12→8 surfaces, and already said so where it is written.
Two of the three carriers moved — the prose, and the source comment that asserted a mutation proof the
suite it lives in had since broken, now scoped to the single floor it sits above. The third, the
five-defect table row, is left standing as the historical observation it records, with its
assertion-count clause dated `(325→325)` so it no longer reads as current. The illustration now quotes
no assertion total.

**#951 — the A30 source-edit footer blind spot, recorded rather than built.**

The issue declined to propose a fix because what the report promises is a value call. Put to the user
with a measured option space — including the finding that the issue's own option (b) is impossible
without a new capability, and a fourth option it never considered (a rewording-invariant
occurrence-count discriminator). **Ruled: accept it, record it, change no code.** One row appended to
ADR 0017's watch list carrying both mutation legs, the mechanism of the blindness, the prose-surface
copy in `docs/opencode-edition.md` that no script consumes, and both sized-but-unbuilt mechanisms. A
stray blank line that had split that table in two was closed so the row lands in the same table.

## Files Changed

| file | nature |
|---|---|
| `docs/conventions.md` | worked example repaired; table row dated; one new paragraph |
| `docs/decisions/0017-the-mission-list.md` | one watch-list row; stray blank line removed |
| `scripts/test-route-reachability.js` | comment only — no executable change |
| `CHANGELOG.md` | `[Unreleased]`: #950 under Fixed, #951 under Added |

## Test Coverage

**No test is owed and none was added, deliberately, on both counts.**

`scripts/test-route-reachability.js` changed by comment only; the suite runs at an unchanged 331
assertions, exit 0. For #951 the absence of a guard *is* the ruling — a wording pin was refused
outright (A30's header derives against it) and the structural alternative was recorded, not built.

The prose claims were instead verified by mutation on scratch mirrors, which is the only oracle a
claim about "what a guard cannot see" admits:

- forge deletion from both edition tables → `test-generate-routing-surfaces` fails 18→12 (exact);
  `test-route-reachability` reds at T19b; the walkthrough's floor passes at 12→8; full walkthrough
  209/209 on both legs, differing on exactly one log line.
- opencode footer dropped conditionally **and** unconditionally → 563/563 green, exit 0, suite output
  byte-identical to baseline both ways.
- kimi's own remediation line deleted → K12 reds twice (521/exit 0 → 2 failures/518 passed),
  establishing that opencode is the edition missing a guard its sibling has.

## Validation

Chain receipt at `.cache/chain-receipt.json`, bound to `headSha 8b6eeb48`.

Scope decision **all-four** (`reason: edition_coupling`, base `580c6019`, 14 changed files). All four
chains exit 0: `claude`, `codex`, `gitlab`, `gitea`.

Full-scope walkthrough run separately and green: 209/209 scenarios, terminal marker present, exit 0.
Individually re-run green after the final corrections: route-reachability 331, generate-routing-surfaces
434, finalize-door 490, ledger-compare 40, opencode-edition 563 (3 trees in parity), both contract
validators, and `generate-routing-surfaces --check`.

## Changed Paths

`scripts/test-route-reachability.js` (the only code-relevant path; the rest is docs and changelog).

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. No documentation change owed beyond the CHANGELOG the commit
already carries; `doc-updater` made no edits and recorded a verified no-impact reason per checklist
item. The sweep for a fourth surface carrying the stale claim came back empty from three independent
passes, with two near-miss hits read in context and correctly excluded.

## Run gaps

`gap-sweep` swept `.cache/` and returned `sweptClasses: []` — no run-discovered defect classes.

## Follow-Up Items

None filed. Nothing discovered in this run is an unfixed repo defect. Three observations recorded
here rather than as issues, because none is a defect in the tree:

- **The `.kimi/` tree in the main checkout is stale**, so `test-kimi-edition.js` reds at D0 before
  reaching its 521 baseline. Pre-existing local state in a gitignored generated tree, present before
  this run and unrelated to this diff. The suite deliberately refuses to self-repair ("would repair
  this tree and erase the finding"), so it was left alone rather than silently regenerated. Clears
  with `node scripts/sync-kimi-edition.js --forge={github,gitlab,gitea} --write`.
- **A `git archive` mirror is not a faithful fixture** — it carries no `.git`, and
  `validate-workflow-contracts.js:666` gates its tag block on `exists('.git')`, so the contract
  validator false-passes there. Use `git clone --local` for mirrors that must run it.
- **The full walkthrough (~9 min) outlives a 600 s tool timeout.** A reaped run logs `EXIT=1` with no
  error text, which is trivially misread as a real red. Treat any walkthrough log lacking the terminal
  `Workflow walkthrough simulation passed` marker as not-a-measurement, and run it detached.

Recorded but not actionable: ADR 0017's new watch-list row is a lookup, not a task. Per the derivation
rule and the user's ruling, it is armed only by an observed escape, and none has occurred.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-950-951/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-950-951/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-950-951/.cache/doc-docking.md
- kaola-workflow/archive/bundle-950-951/.cache/doc-updater.md
- kaola-workflow/archive/bundle-950-951/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-950-951/.cache/premise-950-route-count.md
- kaola-workflow/archive/bundle-950-951/.cache/premise-951-a30-blindspot.md
- kaola-workflow/archive/bundle-950-951/.cache/premise-gaps-walkthrough-kimi.md
- kaola-workflow/archive/bundle-950-951/.cache/reverify-corrections.md
- kaola-workflow/archive/bundle-950-951/.cache/review-diff.md
- kaola-workflow/archive/bundle-950-951/.cache/run-gaps.json
- kaola-workflow/archive/bundle-950-951/.cache/verify-950-prose.md
- kaola-workflow/archive/bundle-950-951/finalization-summary.md
- kaola-workflow/archive/bundle-950-951/mission-list.md
- kaola-workflow/archive/bundle-950-951/workflow-state.md
