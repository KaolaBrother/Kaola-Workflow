# Premise pass — issue #968

Investigation of the five claims in #968. Every verdict below is backed by a command that can be
re-run. Observations and inferences are labelled separately.

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow` (MAIN tree, not a worktree)
- Commit: `1d892a567e5da8fe501bc9b92d1619ab682a6b78` (`chore(roadmap): file #968 …`)
- Node: `v24.14.0` · Platform: darwin 25.6.0
- Working tree at start: clean except untracked `kaola-workflow/issue-968/`
- `gh issue view` fails on this box (`missing required scopes [read:project]`); every forge read
  below used `gh api repos/:owner/:repo/issues/N` or `gh issue list`, both exit 0.
- Nothing tracked was modified. This file is the only write.

---

## Verdict table

| # | Claim | Verdict |
|---|---|---|
| 1 | Distribution: median 1, mean 2.6, 14/26 singles | **CONFIRMED** (headline); **sub-claim REFUTED** — the "nine-run single streak" does not exist |
| 2 | Cap retired; `BUNDLE_SIZE_ADVISORY = 8` is non-blocking | **CONFIRMED** — exercised, not just read |
| 3 | The sentence renders to 8 consumer surfaces; README restates it twice | **CONFIRMED for the sentence; the SCOPE it implies is REFUTED** — the rule has 3 skeletons and 40 consumer surfaces, and README restates it 4 times |
| 4 | Closure is all-or-nothing in both directions | **CONFIRMED, QUALIFIED** — a per-member seam (`excludeIssues`) already exists and is already tested |
| 5 | #328 built the lane as explicitly same-scope; item 2 partially reverses intent | **QUALIFIED → substantially REFUTED** — #328's own design phase *dropped* the same-scope test as forbidden, and zero machinery reads scope |

---

## Claim 1 — the distribution

> "Last 26 archived runs: median 1 issue, mean 2.6, 14 of 26 singles."

### Verdict: **CONFIRMED** — exact to the digit. One embedded sub-claim is **REFUTED**.

### Method

`/private/tmp/.../scratchpad/dist.js` — reads `kaola-workflow/archive/`, keeps directories only,
sorts by mtime descending (equivalent to `ls -1dt`), strips `.archived-<ts>` / `.discarded-<ts>`
suffixes, counts `issue-N` as 1 and `bundle-A-B-C…` as the count of numeric segments, and discards
16 non-run directories (`parallel-classifier`, `codex-parity`, `pr-sink`, … — pre-issue-numbering
folders).

```
total dirs=393  run-shaped=377  non-run=16
```

### Observations

| Window | runs | issues | mean | median | singles |
|---|---|---|---|---|---|
| last 26 | 26 | 67 | **2.58** | **1** | **14** (53.8%) |
| last 40 | 40 | 94 | 2.35 | 1 | 24 (60.0%) |
| ALL | 377 | 507 | 1.34 | 1 | 311 (82.5%) |

Histogram, last 26 (issues-per-run → runs): `{1:14, 2:2, 3:2, 4:3, 5:1, 6:2, 7:2}`
Histogram, ALL 377: `{1:311, 2:32, 3:20, 4:6, 5:3, 6:2, 7:3}`

### Was 26 a cherry-picked window?

Swept every window from W=5 to W=60:

```
W= 5  mean=3.20  median=3    singles=2/5
W=10  mean=2.90  median=2.5  singles=4/10
W=15  mean=2.40  median=1    singles=8/15
W=20  mean=2.10  median=1    singles=12/20
W=26  mean=2.58  median=1    singles=14/26
W=33  mean=2.64  median=1    singles=17/33   <- mean maximum in the sweep
W=40  mean=2.35  median=1    singles=24/40
W=60  mean=2.13  median=1    singles=36/60
ALL   mean=1.34  median=1    singles=311/377
```

**No.** The median is 1 at every window from W=15 outward and over all history. The mean at W=26
(2.58) is near the sweep's *maximum* (2.64 at W=33), and the all-time mean is 1.34 — less than
half. The singles fraction *rises* as the window widens (53.8% at 26 → 60.0% at 40 → 82.5% over all
377). So every widening of the window makes the issue's case **stronger**, not weaker. W=26 is the
conservative choice, not a flattering one.

Cross-check on the ordering: mtime is filesystem metadata, so I re-derived the order from git
(`git log --diff-filter=A --format=%aI -- <dir> | tail -1`, the earliest commit that added anything
under each folder) for the 45 newest directories. The two orderings agree; the only disagreements
are inside identical-mtime pairs (`issue-965`/`bundle-963-964-966`; `issue-936`/`bundle-937-938-939`)
and the `issue-725` re-archive cluster. The **set** of the top 26 is identical under both orderings
(position 26 = `bundle-900-901-902-903` at 2026-08-02T00:45; position 27 = `issue-878` at
2026-08-01T16:15 — a clean 8-hour gap), so the headline figures are order-robust.

### Sub-claim REFUTED

> "`issue-924` through `issue-936` is a nine-run single streak."

There is no such streak. In that region, mtime-descending:

```
n=1  issue-935
n=1  issue-936
n=3  bundle-937-938-939     <- break
n=1  issue-934
n=1  issue-933
n=1  issue-932
n=2  bundle-930-931         <- break
n=1  issue-929.archived-2026-08-03T14-15-27-770Z
n=1  issue-928
n=1  issue-927
n=1  issue-926
n=1  issue-925
n=1  issue-924
  singles in region = 11 of 13 runs
```

It is **11 singles out of 13 runs, interrupted twice by bundles**, not a nine-run streak. The
longest *contiguous* single streak in the region is 6 (`issue-929` → `issue-924`), identical under
git-add ordering. The longest contiguous single streak anywhere in the last 60 runs is **10**, and
it is elsewhere: `issue-880` → `issue-715`.

The sub-claim is wrong in both direction and magnitude — no streak of 9 exists there, and the real
evidence in that region (11 of 13) is stronger than what was claimed. Fixing it strengthens the
issue.

### Sub-claim CONFIRMED

> "…the backlog, which now stands at 0 open."

`gh issue list --state open --limit 200` (exit 0) → **1 open issue: #968 itself**. Zero before #968
was filed. Confirmed.

---

## Claim 2 — the cap

> "`claimExplicitBundle` (`scripts/kaola-workflow-claim.js:1886-1911`) retired
> `KAOLA_BUNDLE_MAX_ISSUES` with its enforcement; `BUNDLE_SIZE_ADVISORY = 8` is non-blocking advice."

### Verdict: **CONFIRMED**, and confirmed by execution rather than by reading alone.

### Observation — the code

`scripts/kaola-workflow-claim.js:1902-1911` (line numbers exact; the function opens at 1887):

```js
  // Step 2: bundle size is SHAPE, and shape is the orchestrator's to decide — how many issues one
  // claim takes is a judgement about the work, not a fact a script can get right. Nothing is
  // enforced here: the count and a recommended ceiling ride out as ADVICE on the emitted envelope,
  // and an orchestrator that wants a wider bundle simply takes one. KAOLA_BUNDLE_MAX_ISSUES went
  // with the enforcement rather than staying as a knob that tunes a limit nothing applies.
  const BUNDLE_SIZE_ADVISORY = 8;
  const sizeAdvice = targets.length > BUNDLE_SIZE_ADVISORY
    ? { bundle_size_note: 'bundle of ' + targets.length + ' issues; ' + BUNDLE_SIZE_ADVISORY
        + ' or fewer is the recommended shape for one plan. Advice only — nothing was capped.' }
    : null;
```

`sizeAdvice` is only ever merged onto the envelope. It reaches no `return claimAnswer(...)`.

### Observation — every refusal path in `claimExplicitBundle`

```
1893  target_set_invalid_token          non-numeric token
1899  target_set_empty                  empty/missing set
1919  target_set_conflicts_active_work  activeByIssue hit
1927  target_set_has_closed_issue       probe says closed
1933  target_set_indeterminate          transient probe fault
1938  target_set_unavailable            probe unavailable
1944  target_set_conflicts_active_work  classifier owned/blocked
1948  target_set_red                    classifier red
1951  target_set_unavailable            classifier target_unavailable
1954  target_set_unverified             classifier offline no-evidence
1869  target_set_label_rollback_failed  post-mutation teardown failed
1876  target_set_unavailable            provision failed + rolled back
```

**None is keyed on `targets.length`.** There is no size refusal.

### Observation — exercised

```
$ node scripts/test-bundle-claim.js
Test (4): a 9-issue bundle acquires and carries size advice
Test (4b): a 5-issue bundle acquires with no size advice
…
test-bundle-claim: all 196 tests passed
REAL EXIT=0
```

Test (4) drives `startup --target-issues 11,12,…,19` against a mocked forge and asserts `exit 0`,
`claim === 'acquired'`, `bundle_id === 'bundle-11-…-19'`, and a `bundle_size_note` naming "9 issues".
A nine-issue bundle acquires. The issue's "A 7-issue claim acquires today" is an understatement.

### Observation — surviving references

`KAOLA_BUNDLE_MAX_ISSUES`, tracked tree, 16 files. Categorised:

- **Live code — 4 hits, all one historical comment**, byte-identical across the four editions:
  `scripts/kaola-workflow-claim.js:1905`, `plugins/kaola-workflow/scripts/…:1905`,
  `plugins/kaola-workflow-gitlab/scripts/…:1395`, `plugins/kaola-workflow-gitea/scripts/…:1396`.
  All read "…went with the enforcement…" — a retirement note, not a use.
- **History (fine):** `CHANGELOG.md:1961, 1983, 2340, 3360`; `kaola-workflow/archive/**` (7 hits).
- **This issue's own record:** `kaola-workflow/.roadmap/issue-968.md:5`, `ROADMAP.md:10`.
- **FINDING — two LIVE docs still describe the retired cap as existing:**
  - `docs/decisions/D-420-01.md:213` — "`KAOLA_BUNDLE_MAX_ISSUES`, default 4, `agents/issue-scout.md:82`"
  - `docs/investigations/2026-06-12-goal-driven-automation-design.md:80` — "count ≤ `KAOLA_BUNDLE_MAX_ISSUES` (default 4)"

  Both state **default 4**, not 8. Both also cite `agents/issue-scout.md`, a file that no longer
  exists (issue-scout was folded into `workflow-planner` in #789 — `CHANGELOG.md:2340`). *Inference,
  high confidence:* these are dated historical records (an ADR and a dated investigation), so they
  are describing the world as it was, not asserting the present — this is a documentation-hygiene
  observation, not a defect that contradicts the code. Flagged because a reader grepping the name
  finds "default 4" in `docs/` before finding the retirement.

`target_set_too_large`: **7 hits, zero in live code, zero in live tests, zero in live docs** —
`CHANGELOG.md:1983` (the deletion record) and 6 hits inside `kaola-workflow/archive/issue-328/.cache/`.
The enforcement is gone with nothing left behind.

Dot-directory sweep (`.opencode`, `.kimi`, `.claude`, `.codex`, `.cache`, explicit paths, not ugrep):
**zero hits** for all four identifiers. `.github/` does not exist in this repo.

---

## Claim 3 — the surface count

> "the sentence renders to 8 consumer surfaces — 6 via `generate-routing-surfaces` plus
> `.opencode/command/workflow-next.md:47` and `.kimi/skills/workflow-next/SKILL.md:48` — and
> `README.md:883-884` and `:1298` restate it by hand."

### Verdict: **CONFIRMED for that one sentence. The scope it implies is REFUTED** — the issue is
counting one sentence and treating it as the rule's footprint. The rule has **three** authoring
skeletons and **40** consumer surfaces, and README restates it **four** times, not two.

### Observation — the cited sentence: exactly 8, line numbers exact

"A run normally carries one issue" — 12 tracked+untracked hits, of which 8 are consumer surfaces:

| # | Surface | Line |
|---|---|---|
| 1 | `commands/workflow-next.md` | 48 |
| 2 | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | 66 |
| 3 | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | 48 |
| 4 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | 66 |
| 5 | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | 48 |
| 6 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | 66 |
| 7 | `.opencode/command/workflow-next.md` | **47** |
| 8 | `.kimi/skills/workflow-next/SKILL.md` | **48** |

Plus the authoring file `templates/routing/next.skeleton.md:58`, `README.md:883`, and this issue's
own roadmap/mirror rows. The two cited untracked line numbers are exact. There is no
`plugins/kaola-workflow/commands/` directory — the canonical Claude command lives at repo-root
`commands/`, which is why the count is 6 and not 8 tracked.

`node scripts/generate-routing-surfaces.js --check` → exit 0, "all **18** surfaces byte-match the
skeleton." 18 = 3 topics (next / init / finalize) × 6 tracked surfaces. `.opencode` and `.kimi` are
gitignored (`.gitignore:5,6`) and reached by their own sync transforms, which is why they are not in
the 18.

### Observation — the rule's ACTUAL footprint

The same admission rule is stated in **six** distinct phrasings across **three** skeletons:

| Phrasing | Authoring file | Consumer surfaces |
|---|---|---|
| P1 "A run normally carries one issue…share a coherent scope" | `templates/routing/next.skeleton.md:58-60` | **8** |
| P2 "Each run implements exactly one issue, or one explicitly selected same-scope set" | `next.skeleton.md:268` | **8** |
| P3 "A run claims one issue — or one explicitly selected same-scope set" | **`templates/routing/init.skeleton.md:153`** | **8** |
| P4 "Each workflow run targets one issue; finishing it is the terminal event" | **`init.skeleton.md:167`** | **8** |
| P5 "This phase closes exactly one issue, or every issue in one explicitly selected set — all of them, or none" | **`templates/routing/finalize.skeleton.md:439`** | **8** |
| P6 "Each `/workflow-next` run targets one issue and ends at Finalization closure" | — (hand) | `README.md:131` |

**40 consumer surfaces**, from **3 skeletons**. The issue's Scope section names
`templates/routing/next.skeleton.md` alone.

`next.skeleton.md:271-273` carries a seventh statement, of the *closure* half:

> A multi-issue closure is all-or-nothing: finalization closes every issue in the set, removes every
> matching `.roadmap/issue-N.md` source, regenerates the roadmap mirror once, archives one folder,
> and stops.

*Inference, high confidence:* editing only `next.skeleton.md:58-60` and `:268` leaves P3, P4 and P5
saying the old rule on 24 surfaces. P4 in particular ("Each workflow run targets one issue") is a
flat absolute with no bundle escape hatch, and would directly contradict a "three to five issues"
default. Refuted by: a rendered diff showing P3/P4/P5 unchanged and non-contradictory — I do not
believe that diff exists.

### Observation — README is hand-maintained, and restates the rule 4 times

`README.md` appears in no generator: it is absent from `scripts/generate-routing-surfaces.js` and
`scripts/edition-sync.js` (`git grep -ln "README.md" -- <both>` → no output). Hand-maintained.

| Line | Text |
|---|---|
| **131** | "Each `/workflow-next` run targets one issue and ends at Finalization closure." — **missed by the issue**, and a flat absolute with no bundle exception |
| 883-884 | "A run normally carries one issue. Several may share a run when they are all open, unclaimed, and share a coherent scope" — cited |
| 1298 | "The bundle lane lets N **same-scope** issues share one worktree…" — cited |
| **1306** | "several issues share a run when they are all open, unclaimed, and **coherent in scope**. That is a shape judgement and nothing caps it" — **missed by the issue**; note the variant wording *coherent in scope*, which a grep for "coherent scope" does not find |

The issue names 2 of the 4.

### FINDING — an existing numeric recommendation the issue does not mention

`README.md:1312`:

> "Bundle SIZE is not one of those validations — how many issues a claim takes is the orchestrator's
> call, so a wide set acquires and the envelope carries `bundle_size_note` (the count plus a
> **recommended 8**) as advice."

This is the **only** place in live prose that recommends a bundle size, and it says **8**, matching
`BUNDLE_SIZE_ADVISORY = 8` in all four editions. The issue's item 1 would put "**three to five**" on
8 `next` surfaces. 3-5 does not strictly contradict "8 or fewer", but it makes two different numbers
live in two places under a "one rule, one wording" convention, and the runtime note a wide bundle
actually receives would still say 8. *Inference, medium-high confidence:* whoever writes item 1 must
either reconcile with `README.md:1312` + `BUNDLE_SIZE_ADVISORY`, or state explicitly that the floor
(3) and the advisory ceiling (8) are different knobs. Refuted by: a reading in which the two numbers
never appear to the same reader — unlikely, since `bundle_size_note` is emitted onto the claim
envelope the orchestrator reads.

---

## Claim 4 — keep-open

> "Closure is all-or-nothing in BOTH directions — `kept_open: keepIssueOpen ? issueSet : []` at
> `scripts/kaola-workflow-claim.js:4911` — so keep-open applies to the whole set and one stalled
> member keeps every sibling open."

### Verdict: **CONFIRMED** for the forge-closure decision. **QUALIFIED** — a per-member seam already
exists one layer down, and is already tested. The proposed watch-list row's "mechanism already
sized" is half-built, not unbuilt.

### Observation — the cited line is exact

`scripts/kaola-workflow-claim.js:4905-4912`:

```js
    const issueSet = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
    closureReceipt.closure = {
      attempted:       issueSet,
      closed:          closedIssues.slice(),
      failed:          failedIssueClosures.slice(),
      skipped_offline: OFFLINE ? issueSet : [],
      kept_open:       keepIssueOpen ? issueSet : [],   // <- line 4911
    };
```

### Observation — keep-open is a run-level boolean with no member axis

- `scripts/kaola-workflow-claim.js:137` — `if (key === '--keep-open') { args.keepOpen = true; continue; }`
- `:144` — `if (key === '--keep-issue-open') { args.keepOpen = true; continue; }`

Both are bare booleans; neither consumes a value. There is no `--keep-open 951` form.

- `:4379-4383` — `let keepIssueOpen = !!args.keepOpen;` falling back to reading
  `issue_action` from `workflow-state.md`, a single scalar field for the whole project.
- `scripts/kaola-workflow-sink-merge.js:384` — `KNOWN_FLAGS` has `--keep-issue-open` as a bare
  boolean; `:410` sets it to `true`.
- `scripts/kaola-workflow-sink-merge.js:1906`, in the comment on `deriveSinkKeepOpen`:

  > "**Whole-run posture: there is no per-member keep-open flag in the sink API.**"

  The code says so in its own words.

### Observation — the close loop is gated on the whole-run boolean

`scripts/kaola-workflow-claim.js:4819-4839`:

```js
  if (!keepIssueOpen && !OFFLINE && !mergeLaneDeferred) {
      // Bundle: close each member that is still open (i.e. in openIssues bucket)
      for (let i = openIssues.length - 1; i >= 0; i--) { … closedIssues.push(n) … }
```

With `keepIssueOpen === true` the loop never runs, so **no member closes**. Confirmed in both
directions.

Per-member *outcome* buckets do exist (`closedIssues` / `failedIssueClosures` / `openIssues`, lines
4753-4755, and `remoteIssueClosed` can be `'partial'` at 4835-4839) — but those record what
*happened*, including failures. They are not an intake for "close these four, hold this one".

### Observation — a per-member seam DOES exist (the issue misses this)

`scripts/kaola-workflow-claim.js:2442-2467`, `reconcileRoadmapForClosure`:

```js
// #705: opts.keepRoadmapSource keeps EVERY member's source (whole-run keep-open); opts.excludeIssues
// is the PER-MEMBER form — a set/array of member numbers whose sources are RETAINED while the rest
// are still removed (a mixed close/keep-open bundle: the kept-open issue stays tracked, the closing
// members' sources go). An open issue must never be dropped from the mirror.
…
  const excludeSet = (opts && Array.isArray(opts.excludeIssues))
    ? new Set(opts.excludeIssues.map(Number)) : null;
…
  const keepThis = !!(opts && opts.keepRoadmapSource) || (excludeSet !== null && excludeSet.has(Number(issueN)));
```

A **mixed close/keep-open bundle** is named in the comment as the case it serves. It is reachable
through the public `archiveProjectDir` and is **already tested per-member**:

`scripts/test-sink-merge.js:747, 781`:
```
Test (#705 g): archiveProjectDir excludeIssues keeps ONLY the kept-open member roadmap source in a
               mixed bundle; the closing member is …
    const res = claim.archiveProjectDir(tmpRoot, project, 'closed', undefined, { excludeIssues: [keepN] });
```

Its sole production caller degenerates to whole-run — `scripts/kaola-workflow-sink-merge.js:2263`:

```js
          excludeIssues: keepOpenAtFinalize ? finalizeMembers : [],
```

i.e. every member or none. *Inference, high confidence:* the per-member roadmap-retention half of
the proposed watch-list mechanism is **already built and already tested**; what is missing is a
per-member intake (a flag or state field) and a per-member forge-close decision. The row's
"mechanism already sized" column should say so, or a future reader will re-derive an existing seam.
Refuted by: showing `excludeIssues` is dead or non-functional — the test at `test-sink-merge.js:747`
passes as part of `test-sink-merge.js`, so it is live.

### What happens TODAY to a 5-member bundle where 4 are finished and 1 cannot close

Exactly two outcomes are reachable, both whole-set:

1. **Finalize normally.** All 5 close. Nothing in the machinery knows one member "cannot close" —
   that is a human judgement with no representation in state. The 5th closes with the rest.
2. **Finalize `--keep-open` / `issue_action: comment_keep_open`.** `keepIssueOpen` is true, the close
   loop at `:4819` is skipped, `kept_open` is the whole `issueSet`, all 5 roadmap sources are
   retained (`keepRoadmapSource`), and the sink posts keep-open comments per member
   (`sink-merge.js:988-989`) without closing any. **All 5 stay open**, including the 4 finished ones.

There is no third path. Editing `issue_numbers` in `workflow-state.md` before finalize is not a
supported valve either: `deriveMemberSet` re-derives the member set from state
(`sink-merge.js:1136-1173`) and warns on a mismatch with `--issue-numbers`, and
`closure_policy: all_or_nothing` is a validated field (below), so a hand-edited set would be a
contract violation rather than a feature.

### FINDING — all-or-nothing is not merely a cost; it is a validated durable contract

The issue treats all-or-nothing as an emergent cost. It is a **declared, validated, machine-read**
field:

- Written at claim: `scripts/kaola-workflow-claim.js:1776` → `closure_policy: 'all_or_nothing'`;
  emitted at `:950`; defaulted at `:825`.
- **Validated**: `scripts/kaola-workflow-adaptive-schema.js:164` —
  `closure_policy: nonEmptyString(input.closure_policy, 'claim_closure_policy_invalid')`, and it is
  in the field list at `:252`. This file is the byte-identical cross-edition anchor.
- **Consumed, with behaviour that changes on its value**: `scripts/kaola-workflow-closure-audit.js:272-279` —

  ```js
    // #903: a bundle archive closes all_or_nothing, so EVERY member issue closed with it. Reading
    // only the scalar primary left members invisible to the archive_closed stale-source class — a
    // measured gap, not a hypothesis. Any OTHER closure_policy cannot promise that, so it
    // contributes the primary alone; `--execute` deletes the sources this set authorizes …
    const policy = field(content, 'closure_policy');
    const numbers = (!policy || policy === 'all_or_nothing')
      ? stateIssueNumbers(content)
      : [parseInt(field(content, 'issue_number'), 10)];
  ```

  A non-`all_or_nothing` policy makes the audit fall back to the primary alone — and `--execute`
  **deletes** roadmap sources on the strength of that set.
- **Pinned in all four editions' suites**: `scripts/simulate-workflow-walkthrough.js:13548-13551`
  ("closure_policy must appear exactly once"), `:10208-10219` (the `#903` negative control using
  `closure_policy: 'partial'`), and the gitlab/gitea walkthrough twins.
- **Documented as a contract**: `docs/workflow-state-contract.md:382` — "**`closure_policy`** —
  always `all_or_nothing`. Every issue in the set must be closeable before any issue is closed;
  partial closure is not a success state."
- **Stated in prose on 8 finalize surfaces**: P5, "all of them, or none."

*Inference, high confidence:* the issue's "Do not build a closure valve" is the right call, but its
stated reason ("it has not been observed") understates the case. Building one would require touching
a validated schema field, a `--execute`-authorising audit branch, four editions' walkthroughs, a
documented state contract, and 8 finalize surfaces. Refuted by: a design that keeps
`closure_policy: all_or_nothing` byte-identical while allowing partial closure — I do not see one.

---

## Claim 5 — intent

> "the bundle lane was built in #328 as explicitly same-scope, so replacing the admission test
> partially reverses stated design intent."

### Verdict: **QUALIFIED → substantially REFUTED.** #328's *proposal* said same-scope; #328's own
design phase **explicitly dropped** the same-scope test as forbidden by #44, and did so for a reason
that *supports* the issue's item 2. Nothing mechanical reads scope. The "reversal" is a prose
alignment, not a reversal of built intent.

### Observation — what #328 proposed

`gh api repos/:owner/:repo/issues/328` (exit 0). Title: *"enhancement(adaptive): add same-scope
multi-issue bundle workflow"*. Same-scope appears throughout. Section B, "Bundle selection rules":

> **Auto-bundle mode** should only choose a set when all of the following are true: … issues share a
> coherent scope signal … issue count is below a conservative cap.
> Suggested cap: `KAOLA_BUNDLE_MAX_ISSUES default 4`

`target_set_not_same_scope` was listed as a "typed refusal candidate".

**Note the scoping:** the scope rule was proposed for **auto-bundle mode** — a read-only
`issue-scout` clustering the backlog. For **explicit** bundles (`--target-issues A,B,C`, the only
mode that exists today) #328 said only "validate the target set is same-scope enough for bundle mode
**or require explicit user intent**". AC#2 (explicit bundle) says nothing about scope; AC#5/AC#6 are
about auto-mode.

### Observation — #328's design phase DROPPED it, on #44 grounds

`kaola-workflow/archive/issue-328/.cache/design.md:256-265`:

| `target_set_not_same_scope` | **DEFERRED (NOT v1)** | see #44 ruling below |

> **#44 RULING on `target_set_not_same_scope` — DROPPED from v1.** A claim SCRIPT refusing an
> explicitly-user-named set on "scope" = a script overriding explicit user intent, which #44 forbids
> ("when the user names an issue, use that exact issue; scripts validate and claim but must not fall
> back"). Same-scope-ness is the issue-scout's AUTO-mode judgment surfaced to the orchestrator BEFORE
> claim (AC#5: agent states the set, scripts validate availability only). **So scope is never a
> claim-script refusal.** The `state-foundation`/`claim-startup` tests must NOT assert
> `target_set_not_same_scope`. (If a reviewer wants it documented, it belongs in the issue-scout role
> prose + routing docs as **advisory**, not as a claim refusal.)

`git grep target_set_not_same_scope` → **4 hits, all inside `kaola-workflow/archive/issue-328/.cache/`.**
Zero in live code, tests, or docs. It was never built.

### Observation — the auto-mode carrier is retired

The one place #328 intended scope-coherence to live was the `issue-scout` role. `CHANGELOG.md:2340`:
"`issue-scout` folded into `workflow-planner`; the standalone pre-claim survey hop is retired (#789)."
`agents/issue-scout.md` no longer exists. So the only home #328 gave the same-scope judgement is gone.

### Observation — zero machinery reads scope

```
$ grep -rn "scope_signal|scopeCoheren|sameScope|same_scope|scopeCheck|coherent" scripts/*.js
scripts/test-bundle-state.js:227      (unrelated: bundle_state_incoherent)
scripts/test-forge-bundle-lane.js:26  (unrelated: prose)
scripts/test-install-model-rendering.js:3039 (unrelated: prose)
```

No script computes, validates, stores, or refuses on scope coherence. No `workflow-state.md` field
records it (`docs/workflow-state-contract.md:368-390` lists `issue_number`, `issue_numbers`,
`bundle_id`, `closure_policy` — no scope field). `.cache/issue-bundle.json`'s `scope` field, proposed
in #328 §D, has no live producer or consumer.

**Same-scope is prose guidance, and only prose guidance.**

### What IS load-bearing from #328

The all-or-nothing **closure policy** — see Claim 4. #328 §"Non-goals for v1" states it directly:
"Do not support partial closure as a normal success state. V1 finalization is all-or-nothing." That
one *was* built, validated, and pinned across four editions. So of #328's two constraints, the issue
picks the one that was dropped (scope) as the "stated design intent" being reversed, and treats the
one that was actually built (all-or-nothing) as an incidental cost.

*Inference, high confidence:* item 2 does not reverse #328's built intent — it **completes** it, by
retiring from prose a test #328's own design ruled illegitimate in code for the same reason item 2
gives (the orchestrator's judgement, not the script's). Refuted by: evidence that the same-scope
prose was *re-established as intent after* the #328 design ruling — I checked `CHANGELOG.md` for the
#328 entry (`:3360`, "adaptive: same-scope multi-issue bundle lane (#328) — An additive lane that
finishes a coherent set of same-scope issues in one adaptive run") and found only the original
same-scope framing carried into the changelog headline, never a fresh ruling. The value call the
issue asks the user to settle is therefore **smaller than it presents**: it is a prose-vs-prose
alignment where the machinery has been neutral since v1.

*Caveat, stated plainly:* "smaller than the issue claims" is not "zero". The user still owns the
call, because the change alters what a run *is* to every future orchestrator reading 40 surfaces.
What the measurement removes is the claim that a **built** mechanism or a **live** design ruling
stands against it.

---

## Additional findings the issue missed or contradicts

1. **`README.md:131`** — "Each `/workflow-next` run targets one issue and ends at Finalization
   closure." A flat absolute with no bundle exception, in the README's overview. Not in the issue's
   scope list. Would be left contradicting a "three to five" default.
2. **`README.md:1306`** — a fourth hand restatement, using the variant wording "**coherent in
   scope**". A grep for "coherent scope" misses it.
3. **`templates/routing/init.skeleton.md:153` and `:167`** — the init skeleton carries the rule
   twice, rendering to 16 surfaces. `:167`'s "Each workflow run targets one issue; finishing it is
   the terminal event" is another flat absolute. The issue's scope names only `next.skeleton.md`.
4. **`templates/routing/finalize.skeleton.md:439`** — "closes exactly one issue, or every issue in
   one explicitly selected set — **all of them, or none**", on 8 more surfaces.
5. **`README.md:1312`** — the only live prose recommending a bundle size, and it says **8**,
   matching `BUNDLE_SIZE_ADVISORY`. A new "three to five" floor must reconcile with it.
6. **`closure_policy: all_or_nothing`** is a schema-validated, audit-consumed, four-edition-pinned
   contract (Claim 4) — a stronger reason not to build a closure valve than the issue gives.
7. **Per-member `excludeIssues`** already exists and is already tested per-member (Claim 4). The
   watch-list row's "mechanism already sized" is partly already implemented.
8. **`docs/decisions/D-420-01.md:213` and `docs/investigations/2026-06-12-…:80`** still describe
   `KAOLA_BUNDLE_MAX_ISSUES` "default 4" and cite the deleted `agents/issue-scout.md`. Historical
   documents, but they are what a grep finds first.
9. **`.opencode`/`.kimi` are gitignored** (`.gitignore:5,6`) and exist only in the main tree —
   consistent with the lead's instruction; any sweep from a worktree would report them absent.

## Open — not measured

- Whether the `.opencode`/`.kimi` sync transforms would carry a *changed* paragraph correctly. Not
  exercised: doing so requires running the sync, which mutates those trees. Prior recorded experience
  in this project is that those transforms fail **silently** on a renamed anchor, so a rewrite that
  changes the paragraph's opening words is the risky shape.
- Whether the **installed** runtime surfaces (`~/.claude`, `~/.codex`, …) match the repo. Out of
  scope for a premise pass; the claims are about repo surfaces.
- Cost/benefit of 3-5 versus 1: not measurable from the archive. The archive records issues-per-run,
  not wall-clock or rework per issue, so nothing here shows a wider run is *better* — only that runs
  are in fact narrow. The issue does not claim otherwise, but the distribution is not evidence for
  the remedy.
