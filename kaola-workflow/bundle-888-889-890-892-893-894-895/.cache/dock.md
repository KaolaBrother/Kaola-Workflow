# Docking record — CHANGELOG and documentation for the seven-issue bundle

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
Baseline: HEAD `fa5157b3`, plus the seven implementations' uncommitted work. Nothing committed.

**Verification tier: `build-green`** — this is prose docking with no behavioural logic, so the check is
that every guard reading the touched surfaces is green and that the `[Unreleased]` reference set matches
what the release gate will demand.

---

## Files changed (the whole write-set)

| file | change |
|---|---|
| `CHANGELOG.md` | seven `[Unreleased]` entries in four sections; the existing #891 `### Removed` entry untouched |
| `docs/architecture.md` | one stale sentence (`:343-345`) — the carry-over binding route |
| `docs/api.md` | one new bullet in the Sink API (`:481-487`) — the #893 archive-mirror exemption |
| `README.md` | **not touched** — nothing stale found (see the sweep below) |

## The `[Unreleased]` section as written

`### Changed` — #889, #892, #895
`### Removed` — #891 (pre-existing, untouched), #888, #894
`### Fixed` — #893
`### Documentation` — #890

`### Documentation` was chosen for #890 over `### Changed` because #890 fixes nothing mechanically;
that heading already exists in this file's vocabulary (the `[6.23.0]` entry uses it). #895 sits in
`### Changed` rather than `### Fixed`, following the `[9.0.0]` precedent that filed guard-arming work
(`#883`) under `### Changed`.

## Drafted claims I CORRECTED against the diff

Three implementation records carried a suggested entry. Each was verified line by line; five claims
changed.

1. **#889 — "eleven hand edits".** Both the record's suggested entry and the comment block in
   `scripts/generate-reviewer-profiles.js` say a bump took *eleven* sites / *eleven* rounds. The record's
   own executed replay measured **nine** rounds and reported it "still not finished"; counting distinct
   files that need a hand edit at the old HEAD gives fifteen, not eleven. The number is not derivable
   from the diff either way, so the entry asserts only what was executed: nine rounds, still unfinished.

2. **#889 — "fails on the fifth" → what the replay actually showed.** The stronger and verifiable fact
   is the round-6 state: every reviewer validator green while the four Codex preflight copies and
   `install.sh` were still stale, caught only by `test-install-model-rendering.js`, which has no edition
   twin and runs in the claude chain alone. So **three of the four chains** could pass over a half-done
   bump. Confirmed by reading the chain wiring in the record and the two new sweep call sites in the
   diff. That is what the entry says.

2a. **#889 — the record's four-step framing went stale after dispatch, and the entry was rewritten.**
   The lead flagged that `.cache/889-production.md` §6 and §5a no longer describe the tree, and both
   claims check out against the current files:
   - `scripts/test-install-model-rendering.js:3000` now reads
     `String(reviewerGenerator.REVIEWER_BEHAVIOR_CONTRACT_VERSION)` instead of the literal `'3'`, with a
     comment stating it still pins what the *installer* recorded rather than restating the source
     profile. Grepping the file for a residual version literal returns nothing.
   - `scripts/generate-reviewer-profiles.js` now reads *"BUMPING IT — three steps"* and closes with
     *"There is no fourth step: every other consumer, in the repo and in the suites, reads this
     constant."* The `CONTRACT_VERSION_PIN_SITES` comment was rewritten too: membership is now stated as
     mechanical (files that *declare* the constant) rather than the earlier editorial carve-out.

   So the entry's headline is the **three-step** bump, and it states that a full bump touches **no test
   file at all**. My first draft's sentence about a literal "deliberately left independent … the step the
   sweep does not reach" was deleted outright — it was true when the record was written and is false now.
   `CHANGELOG.md:241` (in the released `[9.0.0]` section, *"three literals in
   test-install-model-rendering.js"*) was **not** touched: it is accurate history of the earlier 2→3
   bump. The whole `CHANGELOG.md` diff is 134 insertions and **zero deletions**, so nothing in any
   released section moved.

2b. **#889 — the `install.sh` finding is now stated as the surprising part, not a footnote.** The issue
   assumed the `<<'NODE'` heredoc could not import anything. It already did `require(process.argv[2])`,
   the generator module — verified in the diff at `install.sh:245-254`. The entry says so plainly: no
   workaround was needed, three literals simply left, and the installer is off the bump surface entirely.

3. **#888 — the deletion is NOT a speed-up.** The suggested entry did not overclaim, but the entry now
   states it outright ("**Nothing gets faster** — the re-run the carry-over promised to skip was never
   actually skipped"), because the surrounding `[9.0.0]` entry for the mechanism being deleted opens
   with *"so the documented release sequence completes without a redundant chain re-run"* and a reader
   moving down the file would otherwise carry that framing across.

4. **#894 — "curated-root vocabulary ×4" needed re-measuring.** The site-2 record states the deletion
   landed in the canonical kernel only, with the three plugin anchor copies left un-propagated. That is
   no longer true: measured just now, all four copies are byte-identical
   (`md5 3f221dea0665d0c61c9d482a46b29cf8`) and carry neither `CURATED_ROOT_PATHS` nor
   `evaluateReleasePrepCarryOver`. Someone propagated the anchor after that record was written. The
   entry says "in all four editions", which the tree now supports.

5. **#888 — `binding` is a real envelope removal and is labelled one.** Verified in the diff at
   `scripts/kaola-workflow-run-chains.js`: `runReleaseCheck` drops `binding`, `carryOver`, `routeText`
   and the `Object.assign`; the human line loses `; bound by strict sha equality`. `docs/api.md:411`
   documents the pass envelope without them, so the entry says code caught up to the doc — while still
   flagging it explicitly as a JSON contract key removal rather than burying it.

Everything else in the entries was checked against the diff before being written: the deleted symbol
names (`git grep` over the live tree returns zero hits for `evaluateReleasePrepCarryOver`,
`firstJsonDifference`, `RELEASE_VERSIONED_JSON_FILES`, `receiptBindsTo`, `captureAtomicTargetVersion`,
`readAtomicTargetVersion`, `CURATED_ROOT_*`, `extractCuratedRootPaths`); `off_surface` as a real reason
token from the deleted route (`git show HEAD:scripts/kaola-workflow-adaptive-schema.js:1544`); the
`test-release.js` count (a run just now: **247 assertions**, matching the record's post-deletion
number); the walkthrough's `#877 (14)`–`(18)` cases gone; `testActiveFoldersExcludesClosedIssue895`
present and registered; the three-way branch consult in `sinkPreflight`; and the consumer-`CLAUDE.md`
claim for #892 — both changed lines fall inside `commands/workflow-init.md`'s
`KW-CLAUDE-TEMPLATE-START`/`END` region (`:86`–`:187`), so they do reach every consumer scaffold.

## What I found stale in README / docs

**Fixed (in my write-set):**

- `docs/architecture.md:345` — *"bound at the tagged commit, or **carried over release-prep-only
  commits**, the same route `--tag` and `--release-check` now share."* A plain statement of the binding
  rule #888 deleted. Rewritten to strict `headSha` equality; the "one route both share" half is kept,
  because #881's shared-kernel delegation was deliberately retained.

**Deliberately NOT fixed, and this is the one judgment call worth reading:**

- `docs/api.md:1007` — the `--cut` refusal block still reads *"run the offline full chain receipt (skip
  if a green receipt already carries over)"*. **That block is a verbatim mirror of a string the code
  still ships.** `runCut` in all four release scripts still emits the carry-over wording — see the
  finding below. Editing the doc would make it tell the truth about the mechanism while lying about the
  CLI's actual output. The right repair is at the source, so the doc is left as a faithful mirror and
  the code residue is reported.

**Checked and genuinely not stale** (so not touched):

- `README.md` — the full mission-list statement at `:894-942` (scope ruling: reference prose stays; the
  #892 implementer already removed the dead `docs/mission-list.md` pointer and fixed the internally
  inconsistent `dispatched` placeholder). Nothing in `README.md` names the carry-over, the reviewer
  contract version, the installer compare-and-swap, or the curated-root vocabulary — grepped, zero hits.
- Every remaining `mission-list.md` reference in `README.md`, `docs/api.md` and `docs/architecture.md`
  names the **run artifact** `kaola-workflow/{project}/mission-list.md`, not the deleted doc. A tree-wide
  `git grep "docs/mission-list"` outside `kaola-workflow/archive` and `CHANGELOG.md` returns only three
  hits, all inside `kaola-workflow/.origin/877/` — frozen historical run records, correctly left alone.
- `docs/api.md:1013` — *"the same route `--tag` and `--release-check` now share"* is still true: both
  bind through the one kernel function. Left.
- `docs/architecture.md:210` and `docs/api.md:477` describe preflight as naming "any foreign dirt",
  which #893 narrows but does not falsify. The api.md bullet was added because #893 changes a refusal
  surface and CLAUDE.md mandates API docs on a user-visible change; `docs/architecture.md` was left
  because no structure changed.

**Added rather than repaired:** `docs/api.md:481-487`, the #893 exemption. The Sink API section already
documents exemption-level detail in the same bullet (the `.roadmap/issue-N.md` auto-stash), so this
matches the existing grain rather than opening a new level of detail.

## Findings outside my write-set — routing needed

1. **`runCut` still advertises the deleted carry-over, in all four editions.** This is a shipped
   operator string, not a comment:
   - `scripts/kaola-workflow-release.js:322`
   - `plugins/kaola-workflow/scripts/kaola-workflow-release.js:322`
   - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js:323`
   - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:323`

   Both halves are stale: the JSON `sequence` element `'run the offline full chain receipt (skip if a
   green receipt already carries over)'`, and the human hint `'cut: REFUSED — … a green unwaived
   four-chain receipt from the finishing run carries over, otherwise run the offline full chain; …'`.
   `--cut` is the command a human runs when they reach for the retired one-shot release, so this is the
   text most likely to be read at release time — and it tells the operator they may skip the run #888
   just made mandatory. It is also the source of the `docs/api.md:1007` block I left alone.

2. **`CLAUDE.md:178`** — *"A release tag always requires the full, unwaived four-chain receipt — bound
   at the tagged commit, or carried over release-prep-only commits."* Stale after #888. Same sentence as
   the `docs/architecture.md:345` one I fixed; `CLAUDE.md` is outside my write-set. (Note `CLAUDE.md` is
   already modified in this worktree by #892's implementer, so it needs a careful in-place edit, not a
   rewrite.)

Neither is a defect in any of the seven implementations' own scope — both are residue #888's write-set
did not reach.

## `#N` reference list in `[Unreleased]`

Extracted by running the release script's **own** `unreleasedSection` parser (`kaola-workflow-release.js:66-88`,
fence-aware termination and all) against the file as written:

```
Unreleased #N refs: [888,889,890,891,892,893,894,895]
```

Exactly `{888, 889, 890, 892, 893, 894, 895}` plus #891's pre-existing contribution. No upstream forge
numbers. #890's own convention was applied to my own prose: the two upstream references appear as
`` `openai/codex` PR 19792 `` and `issue 33447`, hashless, so they do not enter this set.

Deliberately avoided: `#881`, `#877`, `#715`, `#651`. Each names a real issue in this repository and each
was tempting to cite, but `issuesOkay` (`kaola-workflow-release.js:89-106`) computes `unknown` as
`[Unreleased]` refs minus (`--issues-closed` ∪ every `#N` in commit subjects/bodies since the last tag).
Since no commit after `v9.0.0` mentions them, any of those four would refuse `changelog_unknown_reference`
at `--prepare` — or force a false number into `--issues-closed`, which is the exact failure #890 exists
to prevent. They are referenced descriptively instead ("the previous release let a chain receipt stamped
at an *ancestor* … bind", "the one exemption it had under the archive band").

## Verification

| command | before | after |
|---|---|---|
| `node scripts/validate-workflow-contracts.js` | exit 0 | exit 0 — `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | exit 0 | exit 0 — `Kaola-Workflow Codex contract validation passed` |
| `node scripts/validate-vendored-agents.js` | exit 0 | exit 0 |
| `node scripts/generate-routing-surfaces.js --check` | exit 0 | exit 0 — `all 18 surfaces byte-match the skeleton.` |
| `node scripts/test-release.js` | exit 0 | exit 0 — `all 247 assertions passed` |
| `unreleasedSection` ref extraction | `[891]` | `[888,889,890,891,892,893,894,895]` |

Both contract validators and the ref extraction were re-run after the #889 rewrite; all three give the
same results.

`test-release.js` and `generate-routing-surfaces.js --check` are not on the brief's list; they were run
because they are the two suites that read the release-gate and routing-surface state my entries assert
facts about. The full walkthrough was **not** run — other agents hold production scripts in this
worktree, so a full-scope red could not be attributed, and nothing in this write-set is executable.

No `git checkout --`, no `git stash`, no `edition-sync.js --write`, nothing committed.

---

# Round 3 — the two post-verification #893 additions

Both landed after the first pass finished. Verified against the diff and the suite before writing.

## Fold-or-separate: I FOLDED both into the existing #893 `### Fixed` entry

The read-fault repair **never shipped** — the defect was introduced and repaired inside this bundle — so
a separate `### Fixed` bullet would announce to users a bug they never had. It is written as the third
paragraph of the #893 entry and says so explicitly: *"It never shipped in this state, so this is recorded
as part of the fix rather than as a separate one."*

`receipt.archived_paths` is a genuinely **new** user-visible envelope field and by Keep-a-Changelog
convention would sit under `### Added`. I folded it in anyway, and the reason is worth recording because
it is the one place I departed from the section vocabulary: the field is unintelligible apart from the
exemption that forced it — it exists *because* that exemption is a directory prefix — and splitting it out
would fragment one issue's single story across two sections, both carrying `(#893)`. The `[Unreleased]`
#888 entry already sets the symmetric precedent: it records a JSON envelope key *removal* inside the
mechanism's own `### Removed` bullet rather than splitting it. To keep it findable for a consumer scanning
for envelope changes, that paragraph opens with a bolded **New: `receipt.archived_paths` …**.

## Verified against the diff before writing (I did not reuse the briefing wording)

| claim | where I checked it |
|---|---|
| `receipt.archived_paths` is on the **emitted envelope's** receipt | `test-sink-merge.js:1463,1508,1550` all read `out.receipt.archived_paths` |
| present-and-empty, never absent | initialized `archived_paths: []` at `kaola-workflow-sink-merge.js:1239` (journal init), and pinned by the w10 scenario |
| read from the **index**, between add and commit | `stagedPathsUnder` (`:152-160`) runs `git diff --cached --name-only -- <pathspec> <excludes>`; called at `:2073`, after the `git add` and before the commit, with the add's own excludes |
| scoped so a sibling's residue is absent | `stagedPathsUnder(mainRoot, projectPathspec, excludes)`; pinned by w9 |
| durable copy in `finalization-summary.md` under `## Sink Findings` | `persistArchivedPathsToSummary` (`:177-193`) — adds the header only if the findings writer did not, returns early if the file is absent, and is guarded by `/^archived_paths:$/m` for crash-resume idempotence |
| the summary write rides the same commit | `:2078-2082` re-runs `git add` after a successful write |
| four-outcome read-fault repair | `:1465-1490` — `git cat-file -e` sets `branchHasPath`, `!branchHasPath → continue`; the content read follows separately, and only `branchBytes !== null && workBytes !== null && equals` exempts |
| the `ENOBUFS` trigger needs no tampering | `test-sink-merge.js:1330-1332` asserts the precondition (`overflow.error.code === 'ENOBUFS'`) as its own assertion, so the fixture proves the fault rather than assuming it |
| the untyped-crash consequence | w7 (`:1364`, `:1399`) pins that the sink still emits a well-formed typed envelope naming the unverifiable path |
| suite count | ran it: `Sink-merge (…/#893) test suite passed: 257 assertions.`, exit 0 |
| all three editions carry both halves | `archived_paths` and `stagedPathsUnder` present in all three plugin sink copies; the gitea/gitlab ports key their existence probe on `branch` directly, matching their own bucket-2 idiom (they carry no branchless split), which is the same port relationship #893 documented originally |

Two things I deliberately did **not** assert, having failed to find them in the diff: I do not say the
report is *sorted*, and I do not say anything about how a consumer should react to a stray. The code
sorts nothing and the design is explicit that adjudication is the orchestrator's.

## What was written

- `CHANGELOG.md` — the `### Fixed` #893 entry grew from one paragraph to four: the exemption (now stated
  as **four** outcomes, not three — my earlier "three ways" wording is superseded and was rewritten in
  place, not appended to); the read-fault repair; `receipt.archived_paths`; and the suite count
  (257 passing, up from the 192-passing/16-failing baseline the fix started from).
- `docs/api.md` — the Sink API exemption bullet rewritten for the four outcomes and the two separate
  probes; and a new two-paragraph block after the `closed_issues` paragraph documenting
  `receipt.archived_paths`, its index-derived provenance, the durable `finalization-summary.md` copy, and
  — as its own paragraph — that it is **a report, not a guard**, with the reason no discriminator exists.

Nothing else touched. No released section edited: the whole `CHANGELOG.md` diff is **169 insertions, 0
deletions**.

## Re-confirmed `#N` set

```
Unreleased #N refs: [888,889,890,891,892,893,894,895]
```

Unchanged, as expected — both additions are #893. Extracted again with the release script's own
`unreleasedSection` parser. No upstream forge number carries a `#`.

## Verification (round 3)

| command | result |
|---|---|
| `node scripts/validate-workflow-contracts.js` | exit 0 — `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | exit 0 — `Kaola-Workflow Codex contract validation passed` |
| `node scripts/test-sink-merge.js` | exit 0 — `passed: 257 assertions` |
| `unreleasedSection` ref extraction | `[888,889,890,891,892,893,894,895]` |

`test-sink-merge.js` is not on the brief's list; I ran it because the entry now asserts its count.

No `git checkout --`, no `git stash`, no `edition-sync.js --write`, nothing committed. The two findings
from round 1 still stand and still need routing: `runCut` advertising the deleted carry-over in all four
`*-release.js` copies, and `CLAUDE.md:178`.
