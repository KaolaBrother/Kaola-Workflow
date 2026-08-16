# #984 tier-ordering — RED test suite report (tdd-guide)

## Task

ADR 0018 §5 item 2 / §8 step 2: connect the dormant priority-tier sorter
(`readPriorityConfig` / `priorityTier` / `listOpenIssues`, `kaola-workflow-claim.js:254-291`,
**zero production call sites**) to a CLI entry point the pick step can call instead of the raw
`gh issue list` splice. This report covers test authorship only — no production code was written
or touched, per test custody.

## File created

- `scripts/test-priority-list-open.js` (new file, untracked, not committed)

## The acceptance surface this suite designs (none existed to read off — this IS the spec)

The brief explicitly withheld the subcommand name and the internal function shape and asked the
test author to design the observable contract. Chosen, and stated at the top of the test file:

- **CLI**: `node kaola-workflow-claim.js list-open` — kebab-case, matching the shipped convention
  (`pick-next`, `worktree-status`, `stale-worktree-check`, ...); no existing subcommand collides.
- **stdout**: one line of JSON, `{ "issues": [...] }` — following the shipped `output()` helper's
  established pattern of wrapping a listing in a named key rather than a bare array
  (`cmdStatus` -> `{active, drift, count}`, `cmdWorktreeStatus` -> `{worktrees}`).
- **exit 0** always, including under `KAOLA_WORKFLOW_OFFLINE=1`.
- The array is the full open-issue set, tier-sorted then number-sorted — never truncated,
  filtered, or reduced to a single "winner" (`next.skeleton.md:39`, "You select the target. No
  script picks for you.").

Whoever implements this may rename the subcommand or the envelope key; this suite is what they
then have to satisfy, and the choice + reasoning is documented in the test file's header comment
so that renaming is a visible, deliberate act rather than a silent mismatch.

## Mock strategy

Reused the established `KAOLA_GH_MOCK_SCRIPT` seam (`kaola-workflow-claim.js:213`, the same
mechanism `simulate-workflow-walkthrough.js` and `test-bundle-claim.js` use) — a node script
invoked in place of `gh` via `execFileSync(process.execPath, [mock, ...args])`. No existing mock
in the tree answers `issue list` (both `test-bundle-claim.js`'s and the walkthrough's mocks only
handle `repo view` / `issue view` / `issue edit` / `issue comment` / `label create` / `api`), so
`writeIssueListGhMock()` is new but follows the same generated-script pattern byte-for-byte
(same argv-join-and-match style, same `fs.mkdirSync`+`fs.writeFileSync` shape). `gh` is never
shelled for real; `HOME`/`USERPROFILE` are sandboxed per `test-bundle-claim.js`'s precedent.

## Assertions authored, one line each

1. **`testTierOrdering`** — 5 issues with bare `P0`/`P1`/`P2` labels, arrival order deliberately
   scrambled *within* each tier (20 before 10, 50 before 5). Asserts the exact output sequence
   `[10,20,99,5,50]`. This specifically kills a "sort by tier only, arrival order as tiebreak"
   near-miss, which would produce `[20,10,99,50,5]` instead — a plain "does it sort" check would
   not catch that mutant, this fixture does by construction.
2. **`testUnlabeledSortsLastAndSurvives`** — one issue with no `P` label at all (tier 99) mixed
   with `P0`/`P1` issues. Asserts count === 3 (nothing dropped), the unlabeled issue's number is
   present, and the exact order `[12,30,7]` (unlabeled last).
3. **`testOrderingIsNotSelecting`** — 7 issues spanning every tier including two unlabeled/other.
   Asserts **set equality** (not just count) between the input issue numbers and the output issue
   numbers, plus `length > 1`. Set equality is the deliberate choice here: a count-only check can
   coincidentally match a wrong subset (e.g. "top N"); set equality cannot. This is the assertion
   that fails if a later change made the entry point return "the top one" instead of the whole
   list reordered.
4. **`testPriorityTopTierLabelsOverride`** — the same two-issue fixture (`#1` labeled `hotfix`
   only, `#2` labeled `P2`) run twice against two separate fixture roots: once with no
   `kaola-workflow/config.json` (expect `[2,1]` — default `["P0","P1"]` does not promote
   `hotfix`, tier 99 sorts after `P2`'s tier 2) and once with `config.json` containing
   `{"priority_top_tier_labels":["hotfix"]}` (expect `[1,2]` — `hotfix` now promotes to tier 1,
   ahead of `P2`'s tier 2). A third assertion checks the order **flips** between the two runs on
   the identical input — a flip is only reachable if the override is actually read *and* actually
   applied to the sort key, not merely parsed and discarded.
5. **`testOfflineIsSaneNotThrown`** — `KAOLA_WORKFLOW_OFFLINE=1`, deliberately **no** gh mock
   present at all (proving no forge call is attempted). Asserts exit 0, parseable JSON stdout, and
   an `issues` array present (may be empty) — "behaves sanely" is operationalized as "does not
   throw / crash / emit a non-JSON stack trace", which is what item 5 of the brief actually asked
   to be tested, as opposed to any particular offline row content (there is none to have offline).

All five brief items (1-5) are honestly testable at the CLI-process layer and none needed a
vacuous assertion — `listOpenIssues`/`priorityTier`/`readPriorityConfig` are pure/deterministic
given a mocked forge response and a fixture root, so the whole contract is drivable from outside
the process boundary without reaching into internals.

## RED verified at baseline

Baseline commit: **`8ca7e88554bfa444701978b9fadbee602556a19c`**
(`docs(0018): the self-host require hazard in step 5` — HEAD of `workflow/bundle-984-985` at the
time this suite was authored; `git status` was clean apart from other agents' concurrent,
unrelated in-flight edits to `templates/routing/*` / `commands/workflow-next.md` / `CHANGELOG.md`,
none of which this suite touches or depends on).

Command: `node scripts/test-priority-list-open.js`

```
FAIL: testTierOrdering: list-open exits 0, got 1 stderr=unknown subcommand: list-open

FAIL: testTierOrdering: stdout is { issues: [...] }, got ""
FAIL: testUnlabeledSortsLastAndSurvives: exits 0, got 1 stderr=unknown subcommand: list-open

FAIL: testUnlabeledSortsLastAndSurvives: all 3 input issues must be present (ordering is not selecting — next.skeleton.md:39), got []
FAIL: testUnlabeledSortsLastAndSurvives: the unlabeled issue #7 (tier 99) must still be in the list, got []
FAIL: testUnlabeledSortsLastAndSurvives: expected [12,30,7] (P0, P1, then unlabeled last), got []
FAIL: testOrderingIsNotSelecting: length must equal the input open-issue count (7), got 0 -> []
FAIL: testOrderingIsNotSelecting: the returned issue numbers must be EXACTLY the input set (reordered, never filtered) — expected {1,2,3,4,5,6,7}, got {}
FAIL: testOrderingIsNotSelecting: a 7-issue backlog must not collapse to a single "picked" issue
FAIL: testPriorityTopTierLabelsOverride(no config): exits 0, got 1
FAIL: testPriorityTopTierLabelsOverride(no config): default fallback must NOT promote "hotfix" — expected [2,1], got []
FAIL: testPriorityTopTierLabelsOverride(with config): exits 0, got 1
FAIL: testPriorityTopTierLabelsOverride(with config): priority_top_tier_labels:["hotfix"] must promote #1 ahead of #2 — expected [1,2], got []
FAIL: testPriorityTopTierLabelsOverride: order must FLIP between the no-config and with-config runs on the identical fixture — got [] then []
FAIL: testOfflineIsSaneNotThrown: KAOLA_WORKFLOW_OFFLINE=1 must exit 0 (not throw), got status=1 stderr=unknown subcommand: list-open

FAIL: testOfflineIsSaneNotThrown: stdout must be parseable JSON, got ""
FAIL: testOfflineIsSaneNotThrown: response must carry an `issues` array even offline, got null

test-priority-list-open: 17 test(s) FAILED, 0 passed
EXIT:1
```

Failure signature (representative): `testTierOrdering — stderr: unknown subcommand: list-open`,
exit 1. All 17 assertions fail the same way — the CLI surface being pinned does not exist yet at
this commit, which is exactly what a pre-implementation suite should show.

## Suite self-consistency check (not a green run — none is possible pre-implementation)

Each expected ordering above was hand-traced against the **actual shipped** `priorityTier` /
`readPriorityConfig` logic at `kaola-workflow-claim.js:254-291` (bare `/^P\d+$/i` match first,
then `priority_top_tier_labels` membership -> tier 1, else tier 99; stable sort by
`tier, then number`) to confirm the suite is a satisfiable spec — a correct `list-open` that
calls the existing `listOpenIssues(root)` unmodified and prints `{ issues: <result> }` should turn
this suite fully green, not red-forever. This was a manual trace against source, not an executed
green run, since the entry point does not exist at baseline.

## Not committed

Per instructions, `scripts/test-priority-list-open.js` and this report are left uncommitted in
the worktree.

## Things worth flagging back (brief vs. tree)

- The brief was accurate on every premise checked: `listOpenIssues` has zero production call
  sites (confirmed — not present anywhere outside `kaola-workflow-claim.js` itself, and not even
  in `module.exports`, unlike its sibling `readPriorityConfig` which *is* exported), and
  `next.skeleton.md:39` does read "You select the target. No script picks for you." verbatim.
- Nothing in the brief was found wrong. The one genuine judgment call — naming the CLI subcommand
  and the output envelope, since neither exists anywhere in the tree, an open issue body, or a
  teammate's in-flight `.cache` report — is documented above and in the test file's header rather
  than treated as settled; if the implementer or team lead prefers different names, the suite is
  the artifact to edit (test custody), not to route around.
