# Finalization — Summary: bundle-1001-1002

Closes #1001 (P2) and #1002 (P3) — the entire open frontier at claim time. Both were filed by
**reading** during the previous run's Step 7, and both bodies named their own hypotheses as
unmeasured. This run established reachability by **running** before writing any code. Both premises
survived, and each measurement moved the target.

## Delivered

**#1001 — the finalize surface splices the run-gap scanner, not just the gate it feeds.**
`templates/routing/slots.js` defined one gap-sweep invocation, `fz-gapsweep-run`, and it was the
`--check` gate. The gate consumes `.cache/run-gaps.json`; the scanner produces it; the two modes are
exclusive (`main()` at `gap-sweep.js:613-617` is an if/else, and `runCheck` never calls `runScan`).
So the surface shipped step 3 of the three-step sequence `docs/conventions.md:505-535` states as a
MUST and omitted step 1, on all 12 finalize surfaces.

A new `fz-gapsweep-scan` slot renders the scanner per forge and splices at the **head of Step 6**,
ahead of the `## Run gaps` grammar its `sweptClasses` populates — not beside the gate, because a
scan placed there would run after the section it must inform. Step 7's three references to "the
scanner", including "re-run the scanner", now have an antecedent. `kaola-workflow-gap-sweep.js` is
byte-untouched.

**#1003 — the `chains_stale` operator hint names which kind of drift stalled the receipt.**
`VALIDATION_HINTS.chains_stale` was a zero-argument template while `chains_red` one line below
already took a `ctx`, so the sentence an operator reads was identical for a one-line `CHANGELOG`
edit and for a code change. #648 named this as item B.3 and it never shipped (`git log -S
"chains_stale: (ctx)"` → 0 commits). The hint now distinguishes `code` / `prose-only` / `mixed`, and
**every arm still commands the regenerate** — test-consumed prose is inside the code-tree hash by
construction, so no drift kind makes the re-run skippable. Rendered in
`attachChainsStaleDiagnostics`, because `operator_hint` is built inside `finding()` *before* the
diagnostics attach; both construction sites route through it, and the degrade path returns first so
the original sentence survives byte-for-byte.

**#1002 — a `chains_stale` finding carries its culprit paths to both consumers that dropped them.**
`stale_paths` / `stale_kind` / `stale_paths_truncated` were computed by `attachChainsStaleDiagnostics`
and discarded one frame later at two renderings: `evaluateFinalizePreconditions` flattened the finding
to its classification token, and `persistValidationToSummary` rendered a fixed field list that kept
both hashes (they ride inside `detail[0]`) but lost the paths. Both now carry them verbatim, across
all four `*claim.js` copies. `checks.validation` is unchanged — still the documented bare token.

## Files Changed

Commit `137e2108` — 17 files, +651/-6.

- `templates/routing/slots.js` (+4), `templates/routing/finalize.skeleton.md` (+9)
- 6 regenerated finalize surfaces (3 commands + 3 SKILLs, github/gitlab/gitea)
- `scripts/kaola-workflow-claim.js` + 3 port copies (+26 each)
- `scripts/test-route-reachability.js` (+87), `scripts/test-finalize-door.js` (+210),
  `scripts/simulate-workflow-walkthrough.js` (+88)
- `docs/api.md` (+19/-6), `CHANGELOG.md`

## Test Coverage

Three guards, each **mutation-proven one site at a time** — an N-site mutation proves ">=1", never N.

| guard | file | baseline | after |
|---|---|---|---|
| `T6c` — scan on every tracked surface, before gate and before row grammar | `test-route-reachability.js` | 6 FAIL / 344 pass | 368 pass |
| `T15a`–`T15e` — both consumers, both stale kinds, truncation, degrade | `test-finalize-door.js` | 13 FAIL / 716 pass | 729 pass |
| `testStaleDiagnosticsPortedToAllEditions1002` — per copy × per site | `simulate-workflow-walkthrough.js` | n/a (new) | 185/185 scenarios |
| `T16` (#1003) — hint names the drift kind, never excuses the re-run | `test-finalize-door.js` | 10 FAIL / 781 pass | 791 pass |

Test custody honoured: neither implementer authored the pins it was judged by.

Notes on arming, because a green suite is not proof:
- `T6c` derives its universe from `GENERATED_SURFACES` and asserts it is 6 **before** asserting over
  it, so the gitignored `.opencode`/`.kimi` copies cannot make it vacuous in a fresh worktree. It
  reads rendered bytes, never the skeleton, and pins **ordering** — a "contains `--json`" check would
  have passed a uselessly-placed scan.
- `T15b` is the load-bearing pin: the code-stale and prose-only envelopes were byte-identical before
  this change and demand opposite actions.
- The port pin initially passed against a **commented-out** line; comment stripping was added before
  it ever went green for the wrong reason.
- Port-pin arming was re-verified independently at finalize: deleting the `stale_kind` push from the
  **gitea** copy alone reddened the walkthrough naming that copy; restored from snapshot, `cmp`
  byte-identical.

## Documentation Docking

`DOCKED` — evidence at `.cache/doc-docking.md`. Docked inline rather than dispatched, deliberately:
both changed surfaces are ones a doc agent has previously fabricated against, and the standing rule
there is to dictate exact text or diff against real output.

- `docs/api.md` — the `finalize --check` `checks` list now names the three conditional fields, states
  `validation` remains the bare token, and warns explicitly that **`stale_paths` is not
  `changed_paths`** (drift since the receipt vs. branch against base; the two disagreed in the run
  that filed #1002). The gap-sweep section now states the modes are exclusive and the gate consumes
  without producing.
- `CHANGELOG.md` — #1001 under `### Added` (no code repaired), #1002 under `### Fixed`. Both written
  from the measurements rather than the issue text.
- `README.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/workflow-state-contract.md`,
  `.env.example`, `docs/decisions/` — explicit no-impact reasons recorded in the docking file.

## Run gaps

- manual:hint-enrichment-unshipped (VALIDATION_HINTS.chains_stale is a zero-arg template while chains_red one line below takes ctx; #648 item B.3 never shipped): filed: #1003
- manual:handport-coverage-generalized (a mutant gitlab claim.js passes edition-sync, validate-script-sync and the gitlab suite; only per-behaviour token pins cover the divergent forge ports): noise: re-files #934, CLOSED 2026-08-04 with the risk knowingly accepted and no code; the one instance this run actually found is already closed by the per-copy pin shipped here
- manual:generic-payload-projection (both finalize validation renderers project a fixed field list, so any finding payload richer than that list loses keys; chains_red loses redChains[]): noise: observed but not blind — chains_red names its culprit inside detail[0], so no reader is misled; the consumer arm's final_validation_stale case was inferred by inspection and never run, and a generic renderer for an unobserved failure is what the watch-list discipline records rather than builds

## Follow-Up Items

- **#1003** (P3, filed by this run, then **worked and delivered in it** at the user's direction) —
  the `chains_stale` operator hint is now `stale_kind`-aware. Filed at 3616 bytes and verified OPEN
  after filing; adopted into this run afterwards.

  **It is deliberately NOT in this run's claimed set.** `workflow-state.md` records
  `issue_numbers: 1001,1002` with a `selection_record_digest` bound to that selection, and rewriting
  it to match a later decision would make the claim record describe something other than what was
  claimed. Its fix ships in this run's commit; its closure is an explicit act taken after the sink
  and verified CLOSED, not an all-or-nothing set closure. Recorded here because the discrepancy is
  otherwise unreadable: this run's commit contains work for an issue the claim does not name.

- **#1004** (P1, OPEN, body 4416 bytes, verified after filing) — `appendSummarySection` returns
  without writing when the heading already exists, so the finalize transaction's three findings
  (`## Validation`, `## Changed Paths`, `## Mission List`) never reach the durable summary of any run
  that built its summary from Step 6's own template. **This run hit it**: the first transaction
  emitted all three on its envelope and the archived sections were empty. Recovered by deleting the
  three empty headings and re-running `finalize --keep-worktree`, after which the script wrote them
  itself — that is the measured A/B in the issue, one axis, same file, same transaction. Corpus
  incidence at this commit: **16 of the 49** archived summaries carrying a `## Validation` heading
  are empty. That is also why the three sections below sit *after* `## Status:` — they were appended
  on the recovery run, and the transaction's own output is kept verbatim rather than reordered.

  **It is NOT in `## Run gaps` above, deliberately.** It was discovered after Step 7's sweep had
  passed, and the scanner refuses an archived project by design (`project_archived` — it "never
  re-scans or writes into an archived project"). Hand-typing a row the scanner never observed is
  precisely the failure the surface warns about and would break the gate's reverse check, so the gap
  is recorded here in prose. The seed line briefly appended to `.cache/run-gaps-manual.md` was
  removed again for the same reason: an unsweepable seed is misleading, not harmless.

Premise corrections posted to #1001 and #1002 before closure — neither issue is closed quietly
against text now known to be wrong.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-finalize-door.js
- scripts/test-route-reachability.js
- templates/routing/finalize.skeleton.md
- templates/routing/slots.js

## Mission List

items: 9
carrying an outcome while their status is not `done`: 0

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1001-1002/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1001-1002/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-1001-1002/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1001-1002/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1001-1002/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-1001-1002/.cache/run-gaps.json
- kaola-workflow/archive/bundle-1001-1002/finalization-summary.md
- kaola-workflow/archive/bundle-1001-1002/findings/adversarial-verdict.md
- kaola-workflow/archive/bundle-1001-1002/findings/census-run-gaps-artifact.md
- kaola-workflow/archive/bundle-1001-1002/findings/chains-stale-consumer-probe.md
- kaola-workflow/archive/bundle-1001-1002/findings/surface-audit-gapsweep-slot.md
- kaola-workflow/archive/bundle-1001-1002/mission-list.md
- kaola-workflow/archive/bundle-1001-1002/workflow-state.md
