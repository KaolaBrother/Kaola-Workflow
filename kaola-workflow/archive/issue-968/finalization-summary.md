# Finalization — Summary: issue-968

## Delivered

**A run's default shape is a bundle of three to five issues, and bundle admission turns on
independent closure rather than shared scope.** Prose only; no script logic changed.

- **The default inverted.** `A run normally carries one issue` became `A run normally carries three
  to five issues`, with one issue kept as the stated exception. Three is a floor on what is taken
  from what the frontier already offers — never a licence to invent work — and eight remains the
  recommended ceiling, so the floor and the pre-existing advisory read as the two distinct knobs
  they are. `BUNDLE_SIZE_ADVISORY` is untouched.
- **The admission test replaced.** `share a coherent scope` became `closeable on its own evidence`.
  Shared scope survives as one admissible route, buying a shared investigation; **disjoint write
  surfaces are the other and buy real concurrency**, and are preferred when both are on offer. This
  was the substantive defect: issues sharing a scope share files, and sharing files is exactly what
  forces serialization inside a run, so the old rule admitted the bundles that parallelize worst.
- **A runs-alone test keyed on blast radius, not diff size.** An issue runs alone when it moves
  something the other members read, when closing it needs a value call from the user, or when its
  scope is not knowable until investigated. A large change inside one module bundles fine; a
  one-line change to a shared anchor does not.
- **Follow-up filing brought into the same rule.** The finalize run-gap step now directs findings on
  disjoint surfaces to be filed as independent slices rather than one omnibus issue, because a later
  run can only take a set as wide as the backlog's independence allows.

Settled with the user in conversation, per First Principle 4: replacing the admission test, keeping
the 3-5 floor and 8 ceiling as separate knobs with no code change, and extending scope to all three
skeletons including the consumer-facing `CLAUDE.md` template.

## Files Changed

30 files. Authoring sources: `templates/routing/next.skeleton.md`, `init.skeleton.md`,
`finalize.skeleton.md`, and two entries in `templates/routing/slots.js` (`nx-claim-run` now leads
with `--target-issues`; `fz-issue-closure` closes every issue in the set). Rendered: 18 tracked
routing surfaces across the four editions. Hand-maintained: `README.md`, `CHANGELOG.md`, `CLAUDE.md`,
`docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/decisions/0017-the-mission-list.md`
(one new watch-list row), `.env.example`, and one comment in `scripts/test-bundle-claim.js`.

Beyond the tracked diff, the same change propagated to **18 edition surfaces** across the six
`.opencode*` and `.kimi*` trees, verified by reading the shipped bytes rather than by trusting a
`--check` exit code.

## Test Coverage

No new tests. The change is prose with no behavioural logic, and no assertion anywhere pinned the
retired wording — measured, not assumed: a sweep of every test script and validator for the six
replaced phrases returned only one stale **comment**, which `tdd-guide` repaired under test custody
with the assertion count unchanged at 196.

- Full walkthrough at full scope: **209 scenarios ran, 209 passed, 0 failed**, shard 1/1.
- Edition suites: opencode **570** assertions, kimi **528**, all six trees reported in parity.
- `generate-routing-surfaces --check`: all 18 surfaces byte-match.
- `validate-workflow-contracts`: passed.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. `docs/api.md`, `docs/conventions.md`, `docs/README.md`,
`docs/opencode-edition.md`, `docs/kimi-edition.md`, `docs/agents-source.md` and all 14 `agents/*.md`
role profiles were swept and found to encode nothing of the retired rule. Historical records
(`CHANGELOG` back-entries, `docs/decisions/D-*.md`, `docs/investigations/`, archived runs) keep the
old wording as history, which is correct. One gap was found and fixed during docking: `.env.example`
still described a per-issue worktree.

## Run gaps

- manual:verification-blind-spot (Neither `sync-opencode-edition.js --check` nor `sync-kimi-edition.js --check` runs in any of the four chains): filed: #969

## Follow-Up Items

- **#969** — the edition sync `--check` runs in no chain, so a skeleton edit that regenerates the 18
  tracked surfaces and stops leaves all six edition trees stale with four green chains certifying it.
  Hit directly during this run and escaped only by running six syncs by hand.
- **ADR 0017 watch list** — a bundle member that cannot close while its siblings are finished.
  Recorded, not built: keep-open is whole-run with no member axis, so one undecided member holds
  every finished sibling open. The row corrects the sizing, since the per-member roadmap-retention
  seam (`excludeIssues`) already exists and is already tested; what is absent is a per-member intake
  and forge-close decision. Arming it would mean touching `closure_policy: all_or_nothing`, which is
  a schema-validated, audit-consumed, four-edition-pinned contract.

## Run notes

Five claims in the issue as filed were measured wrong and corrected on the record before closure
(`#968` comment): the surface count, a nine-run single streak that does not exist, the claim that no
per-member closure seam is built, a weaker rationale than the real one for not building it, and the
blocking value call — the bundle lane's own design phase had already dropped the same-scope test on
the grounds that a claim script refusing a user-named set overrides explicit user intent, so this
change completes that ruling rather than reversing it.

Every defect found this run was a count or a boundary, never the rule itself: three surface counts
moved after measurement, and two sweeps stopped at a file or region boundary rather than at the
rule's real footprint. Two adversarial reviews on the Fable model both returned `fail` on the first
pass; every finding was verified independently and fixed.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-968/.cache/chain-receipt.json
- kaola-workflow/archive/issue-968/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-968/.cache/doc-docking.md
- kaola-workflow/archive/issue-968/.cache/doc-updater.md
- kaola-workflow/archive/issue-968/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-968/.cache/pins-968.md
- kaola-workflow/archive/issue-968/.cache/premise-968.md
- kaola-workflow/archive/issue-968/.cache/refute-fable-968.md
- kaola-workflow/archive/issue-968/.cache/review-fable-968.md
- kaola-workflow/archive/issue-968/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-968/.cache/run-gaps.json
- kaola-workflow/archive/issue-968/finalization-summary.md
- kaola-workflow/archive/issue-968/mission-list.md
- kaola-workflow/archive/issue-968/workflow-state.md
