# Finalization — Summary: bundle-992-993-994

## Delivered

Three issues, all implemented, one with a declared partial.

**#994 — a follow-up a run files now carries a typed body.** Step 7 previously said, in full, "file a
follow-up and record `filed: #N`"; nothing constrained what the filed body could assert, so the step
producing most future claimed work had no content contract. Step 7 now types it: `## Measured` for
what the run observed with every figure naming the commit and the command or artifact it came from,
`## Hypothesis` for attributions no run has confirmed and where a cause derived by reading code lands
by default, `## Proposed remedy (non-binding)` optional and labelled, plus one `searched:` line
recording the duplicate probe actually run at mechanism or symbol level. It adds no measurement
obligation — it forbids exactly one thing, an unstamped figure or an unrun attribution presented as
fact.

**#992 — a run verifies the follow-up it filed actually exists.** Step 7 now requires confirming,
after filing, that the issue exists and its body is non-empty, recording the number and body length
in the run's own record — the mission-list result line, never the `## Run gaps` row whose grammar the
scanner owns. Layer 2, a forge probe wired into `gap-sweep --check`, was **declined by the owner**:
n1-design's syntactic floor is re-affirmed, the script stays forge-neutral bookkeeping, and no new
refusal enters a design whose refusal count is zero over something that destroys nothing. No
per-forge divergence was declared — all three forges can express the check, and a region whose reason
cannot name a runtime difference is drift rather than divergence, so the prose names no forge CLI.

**#993 — the closure receipt records the run's backlog delta.** The `## Closure` block gains
`issues_closed`, `follow_ups_filed`, `follow_up_numbers` and `net_backlog_delta`, all derived from
artifacts already on disk — zero new forge calls, with a live control asserting it. `issues_closed`
is the size of the set the run's closure decision is closing, **not** a count of closes this process
performed: measurement showed the finalize transaction closes nothing on the shipped merge lane (the
sink closes afterwards, and the block is write-once), so the literal reading would have stamped a
positive delta on every ordinary run and the issue's own worked example would never have fired. No
companion disposition field was added — `issue_disposition` already sits directly above it.

## Files Changed

Prose and generated surfaces (additive only, `+16/−0` each, zero deleted lines anywhere):
`templates/routing/finalize.skeleton.md`, `commands/kaola-workflow-finalize.md`,
`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`, and the gitlab and gitea
command + SKILL surfaces.

Guards and tests (test custody — authored by `tdd-guide`, never by an implementer):
`templates/routing/required-blocks.js` (+7 tokens on `fn-forge-is-the-backlog`),
`scripts/test-bundle-finalize.js`, `scripts/test-finalize-door.js`,
`scripts/simulate-workflow-walkthrough.js`.

Production: `scripts/kaola-workflow-claim.js` and `scripts/kaola-workflow-gap-sweep.js`, each with
its three edition copies moved together — canonical and codex byte-identical.

Docs: `docs/workflow-state-contract.md`, `CHANGELOG.md`.

## Test Coverage

Every exit code read directly from its command, never after a pipe.

| suite | result |
|---|---|
| `test-bundle-finalize.js` | 192 tests, exit 0 |
| `test-finalize-door.js` | 587 assertions, exit 0 |
| `simulate-workflow-walkthrough.js` | 184/184 scenarios, **full scope, not a shard**, exit 0 |
| `test-sink-merge.js` | 1063 assertions, exit 0 |
| `test-route-reachability.js` | 331 assertions, exit 0 |
| `generate-routing-surfaces.js --check` | 18 surfaces byte-match, exit 0 |
| `validate-script-sync.js` | exit 0 |
| `edition-sync.js --check` | exit 0 |

**Both new guards are mutation-proven armed, not merely green.** The seven Step 7 tokens were each
mutated one at a time and each redded exactly its own token and no other. `follow_up_numbers` was
mutated on a single edition, leaving the other three claim copies as live controls; exactly the two
new assertions redded, on the mutated edition only, and the revert was verified byte-clean three ways.

No lint or type pipeline exists in this repo (Node scripts only) — no-impact, not skipped.

## Validation

## Changed Paths

## Mission List

## Documentation Docking

`CHANGELOG.md` gained an `## [Unreleased]` section — the file previously opened straight at
`## [9.10.0]` — carrying all three entries, including the durable record of the #992 layer-2 floor
re-affirmation that the issue's body requires. `docs/workflow-state-contract.md` gained the four new
field names in emission order, matching the file's existing bullet convention.

Verified no-impact: `docs/api.md` and `docs/architecture.md` do not enumerate the `## Closure`
block's fields, so no second prose copy now disagrees; `README.md` is unaffected because the
installed command surface is unchanged; no `.env.example` or config surface is touched.

Deliberately not done: the `[9.10.0]` section carries two `### Fixed` headings (confirmed, at
relative lines 29 and 179 with `Changed` and `Removed` between them). It is a published release
section unrelated to all three claimed issues, and folding it into this bundle would make this diff
less attributable. Flagged for a cleanup pass.

## Run gaps

- manual:tier-duty (Step 7 carries no priority-tier duty so an untiered filing sorts last): filed: #995
- manual:worktree-edition-write (regenerate from a linked worktree mutates the main checkout edition trees): filed: #996
- manual:malformed-gap-rows (an all-unreadable Run gaps section stamps zero rather than unknown): filed: #997

## Follow-Up Items

All three were found by **running**, not by reading, and all three were filed under the typed body
contract this run shipped — each verified after filing to exist with a non-empty body, per #992.

- **#995** (bug, P2, body 2832 chars) — ADR 0018 asserts the tier is written in the same breath as
  `filed: #N`, but no such duty was ever written into Step 7's prose. Measuring the sorter also
  **corrected the ADR's own wording**: an untiered issue is not "invisible to the sorter" — it is
  listed and sorts last, so an urgent defect filed untiered ranks below a P3.
- **#996** (bug, P2, body 3213 chars) — `generate-routing-surfaces --write` run inside a linked
  worktree mutates the main checkout's six gitignored edition trees. Doubly silent: gitignored, so
  `git status` says nothing, and `--check` deliberately never reads edition trees. Its root cause is
  filed under `## Hypothesis`, because only the effect was measured.
- **#997** (enhancement, P3, body 4159 chars) — a `## Run gaps` section whose rows all fail the strict
  grammar stamps `follow_ups_filed: 0` rather than `unknown`. Owner-deferred during #993 rather than
  reshape a parser the scanner owns; see the declared partial below.

**Declared partial on #993.** Its acceptance asks that a missing *or malformed* gap artifact degrade
to `unknown`. Missing is delivered and pinned, including two assertions that absent and empty stay
distinguishable. Malformed is **not** delivered: the parser returns the same empty array for an
all-unreadable section as for an empty one, and free-text bullets are ignored by design, so
bullet-counting is provably wrong — it fails T14's `freetext` leg. The owner ruled that two states
ship and the remainder is filed as #997.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-992-993-994/.cache/acceptance.md
- kaola-workflow/archive/bundle-992-993-994/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-992-993-994/.cache/closure-delta-impl.md
- kaola-workflow/archive/bundle-992-993-994/.cache/closure-delta-tests-red.md
- kaola-workflow/archive/bundle-992-993-994/.cache/closure-surface-survey.md
- kaola-workflow/archive/bundle-992-993-994/.cache/correction-992.md
- kaola-workflow/archive/bundle-992-993-994/.cache/correction-993.md
- kaola-workflow/archive/bundle-992-993-994/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-992-993-994/.cache/doc-docking.md
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.body
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.labels
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.md
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.title
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.url
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-tier-duty.body
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-tier-duty.labels
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-tier-duty.md
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-tier-duty.title
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-tier-duty.url
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-worktree-edition-write.body
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-worktree-edition-write.labels
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-worktree-edition-write.md
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-worktree-edition-write.title
- kaola-workflow/archive/bundle-992-993-994/.cache/followup-worktree-edition-write.url
- kaola-workflow/archive/bundle-992-993-994/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-992-993-994/.cache/run-chains-stderr.log
- kaola-workflow/archive/bundle-992-993-994/.cache/run-chains-stdout.json
- kaola-workflow/archive/bundle-992-993-994/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-992-993-994/.cache/run-gaps.json
- kaola-workflow/archive/bundle-992-993-994/.cache/sink-stderr.log
- kaola-workflow/archive/bundle-992-993-994/.cache/sink-stdout.json
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-prose-authored.md
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-prose-landed.md
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-surface-survey.md
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-tokens-mutation-proof.js
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-tokens-red-run.log
- kaola-workflow/archive/bundle-992-993-994/.cache/step7-tokens-red.md
- kaola-workflow/archive/bundle-992-993-994/finalization-summary.md
- kaola-workflow/archive/bundle-992-993-994/mission-list.md
- kaola-workflow/archive/bundle-992-993-994/workflow-state.md
