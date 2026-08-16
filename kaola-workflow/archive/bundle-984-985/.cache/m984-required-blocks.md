# forge-is-the-backlog — required-blocks.js registration

Worktree: `.kw/worktrees/bundle-984-985` (branch `workflow/bundle-984-985`). Files touched (both
additive, no deletions, nothing committed):

- `templates/routing/required-blocks.js` — +66 lines (3 new blocks appended to `REQUIRED_BLOCKS`).
- `scripts/test-route-reachability.js` — +9 lines (one new entry in `FOREIGN_MARKERS`, matching the
  existing `consent-in-conversation` precedent, with a comment explaining why).

No skeleton, no generated surface, and no other in-flight file in this shared worktree was touched.

## The real span set (differs from the brief's list in shape, not in count)

The brief said "derive the true set from the tree" — I did, and it is 6 spans across 3 files, matching
the brief's count exactly, but **not** 1 span per file as the phrasing "1 span at Step 7" for finalize
might suggest generalizes: next and init each carry the marker in **multiple separate, independently
closed `<!-- PIN: forge-is-the-backlog --> … <!-- /PIN -->` spans on the same surface**, not one
continuous region:

| topic | file | spans | line ranges (in `templates/routing/*.skeleton.md`) |
|---|---|---|---|
| next | `next.skeleton.md` | 2 | 46–51 (Step 1 "user named neither" bullet), 126–130 (Step 2 shortlist-read paragraph) |
| init | `init.skeleton.md` | 3 | 176–181 (roadmap-mirror/placeholder/purge bullets), 183–185 (roadmap-vs-workflow-run split), 190–192 (top-priority-labels override) |
| finalize | `finalize.skeleton.md` | 1 | 237–248 (run-gap filing + correction-posting) |

This is architecturally significant, not just a counting detail: it is exactly the same shape as the
existing `consent-in-conversation` marker (one marker text, legitimately repeated), **except** consent
repeats across *topics* (once each) while `forge-is-the-backlog` repeats both *across* topics AND
*within* two of the three topics. The manifest's reverse orphan-sentinel keys `marker text -> ONE
block` via a plain `Map.set` (`test-route-reachability.js:896-897`), so registering three per-topic
blocks (`nx-`, `in-`, `fn-forge-is-the-backlog`) would make each later block's `Map.set` silently
overwrite the earlier ones — every marker occurrence on next/init surfaces would then resolve against
whichever block happened to be declared last (I measured this: 61 false `orphan-surface` failures
before adding the `FOREIGN_MARKERS` entry, all naming next/init surfaces checked against the wrong
`fn-forge-is-the-backlog` block). **This was not obvious from the brief and I discovered it by running
the suite, not by inspection** — the brief's "consent-in-conversation is the closest precedent" turned
out to be closer than it stated: the precedent's `FOREIGN_MARKERS` treatment is not optional here, it
is the fix for a real failure the marker's multi-topic repetition causes.

Given that, I registered **one block per topic** (matching the brief's naming precedent exactly:
`nx-forge-is-the-backlog`, `in-forge-is-the-backlog`, `fn-forge-is-the-backlog`), with each block's
`content_tokens` drawing at least one distinctive token from **every physical span in that topic** —
so a topic-level block still catches any single span being gutted independently (proven below, span by
span).

## Entries added

```js
// templates/routing/required-blocks.js
{
  block_id: 'nx-forge-is-the-backlog',
  topic: 'next', runtime_tag: 'both', surface_type_tag: 'both',
  content_tokens: [
    '<!-- PIN: forge-is-the-backlog -->',
    'Rank by the roadmap priority frontier, then by scope.',
    'the open issue list, the active folders, and the archived summaries.',
    "read each shortlisted candidate's own body and comments",
    'Comments are current state: where a comment contradicts the body, the comment wins',
  ],
},
{
  block_id: 'in-forge-is-the-backlog',
  topic: 'init', runtime_tag: 'both', surface_type_tag: 'both',
  content_tokens: [
    '<!-- PIN: forge-is-the-backlog -->',
    'a placeholder like `unclaimed` or `TBD` produces a folder literally called that.',
    'Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.',
    'Roadmap/research sessions create or refine issues; workflow runs implement one selected set and refresh the mirror.',
    'Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`)',
  ],
},
{
  block_id: 'fn-forge-is-the-backlog',
  topic: 'finalize', runtime_tag: 'both', surface_type_tag: 'both',
  content_tokens: [
    '<!-- PIN: forge-is-the-backlog -->',
    'For each real run-discovered defect, file a follow-up and record `filed: #N`.',
    'append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the scanner, so what is written was actually swept.',
    'post that correction as a comment on the issue before it closes.',
    'Never close quietly against text now known to be wrong.',
    "A correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned out to be, and it lands on the issue it corrects.",
  ],
},
```

Plus, in `scripts/test-route-reachability.js`, `'<!-- PIN: forge-is-the-backlog -->'` was added to
`FOREIGN_MARKERS` (required — see above), with a comment naming the 61-failure measurement.

All tokens were extracted programmatically from the committed skeleton bytes (whitespace-normalized,
per `norm()`), not hand-retyped, to avoid transcription drift on the apostrophes/em-dashes in the
prose (verified: `'` U+0027 throughout, `—` U+2014 for asides; I deliberately excluded the `P0–P3`
fragment, which uses a distinct U+2013 en-dash, from any token to avoid that risk entirely).

## Non-vacuity

Every block's first token is the marker; every block carries 4–5 further tokens, none of which are
substrings of `<!-- PIN: forge-is-the-backlog -->`. The manifest's own `NON-VACUITY FLOOR` assertion
(`test-route-reachability.js`, the block iterating `REQUIRED_BLOCKS` checking `toks.slice(1).some(t =>
!marker.includes(norm(t)))`) passes for all three — confirmed as part of the full green run below.

## Per-entry (per-span) mutation evidence

Each mutation: snapshot the target generated surface first (never `git checkout` — this worktree
carries uncommitted work from several other agents), delete just that span's prose (marker + `/PIN`
kept), run `test-route-reachability.js`, quote the failure, restore from the snapshot, re-verify the
restored file is byte-identical to the snapshot. One site at a time — six mutations for six physical
spans, not one N-site mutant.

**1. next span 1** (`commands/workflow-next.md:36-41`, "user named neither" bullet) — gutted:
```
FAIL: MANIFEST missing-token: block nx-forge-is-the-backlog token "Rank by the roadmap priority frontier, then by scope." absent from commands/workflow-next.md
FAIL: MANIFEST missing-token: block nx-forge-is-the-backlog token "the open issue list, the active folders, and the archived summaries." absent from commands/workflow-next.md
Route-reachability test FAILED: 7 failure(s), 330 passed.
```
(7 = 2 tokens × 3 surfaces sharing the mutated github canon — the tracked `commands/workflow-next.md`
plus the in-memory opencode/kimi github renders — + the 1 "clean over N" summary assertion.)

**2. next span 2** (`commands/workflow-next.md:118-122`, shortlist-read paragraph) — gutted:
```
FAIL: MANIFEST missing-token: block nx-forge-is-the-backlog token "read each shortlisted candidate's own body and comments" absent from commands/workflow-next.md
FAIL: MANIFEST missing-token: block nx-forge-is-the-backlog token "Comments are current state: where a comment contradicts the body, the comment wins" absent from commands/workflow-next.md
Route-reachability test FAILED: 7 failure(s), 330 passed.
```

**3. init span A** (`commands/workflow-init.md:156-161`, roadmap-mirror/placeholder/purge bullets) —
gutted:
```
FAIL: MANIFEST missing-token: block in-forge-is-the-backlog token "a placeholder like `unclaimed` or `TBD` produces a folder literally called that." absent from commands/workflow-init.md
FAIL: MANIFEST missing-token: block in-forge-is-the-backlog token "Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file." absent from commands/workflow-init.md
Route-reachability test FAILED: 7 failure(s), 330 passed.
```

**4. init span B** (`commands/workflow-init.md:163-165`, roadmap-vs-workflow-run split) — gutted:
```
FAIL: MANIFEST missing-token: block in-forge-is-the-backlog token "Roadmap/research sessions create or refine issues; workflow runs implement one selected set and refresh the mirror." absent from commands/workflow-init.md
Route-reachability test FAILED: 4 failure(s), 330 passed.
```

**5. init span C** (`commands/workflow-init.md:170-172`, top-priority-labels override) — gutted:
```
FAIL: MANIFEST missing-token: block in-forge-is-the-backlog token "Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`)" absent from commands/workflow-init.md
Route-reachability test FAILED: 4 failure(s), 330 passed.
```

**6. finalize span** (`commands/kaola-workflow-finalize.md:213-224`, run-gap filing + correction) —
gutted:
```
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "For each real run-discovered defect, file a follow-up and record `filed: #N`." absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the scanner, so what is written was actually swept." absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "post that correction as a comment on the issue before it closes." absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "Never close quietly against text now known to be wrong." absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "A correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned out to be, and it lands on the issue it corrects." absent from commands/kaola-workflow-finalize.md
Route-reachability test FAILED: 16 failure(s), 330 passed.
```

After each mutation the target file was restored from its snapshot and `diff` against the snapshot
confirmed byte-identity before moving to the next span. Also proved empirically (not asserted): before
the `FOREIGN_MARKERS` fix, adding only the three `required-blocks.js` entries produced **61
orphan-surface failures**, every one naming a next/init surface checked against the wrong
(`fn-forge-is-the-backlog`) block — this is the falsifier for "registering three plain per-topic
blocks is sufficient," and it is why the `FOREIGN_MARKERS` entry exists.

## Gate exit codes (echoed separately, final state — all mutations restored)

```
node scripts/test-route-reachability.js         -> EXIT 0  (331 assertions, 0 failures)
node scripts/generate-routing-surfaces.js --check -> EXIT 0  (18/18 byte-match)
node scripts/validate-workflow-contracts.js      -> EXIT 0  ("Workflow contract validation passed")
node scripts/validate-kaola-workflow-contracts.js -> EXIT 1
```

The fourth gate's failure is **pre-existing and unrelated to this task**:
```
Error: plugins/kaola-workflow/scripts/kaola-workflow-claim.js must match scripts/kaola-workflow-claim.js
```
`git status` shows `scripts/kaola-workflow-claim.js`, its three plugin-tree mirrors, and the
gitlab/gitea classifiers all modified-but-uncommitted in this shared worktree, and the diff between
`scripts/kaola-workflow-claim.js` and its plugin copy is 158 lines of roadmap-closure-reconciliation
code (`reconcileRoadmapForClosure`, #395/#705/#916) — a sync step from another agent's in-flight work,
with zero connection to routing, pins, or `required-blocks.js`. I did not touch
`kaola-workflow-claim.js` or any of its mirrors. This is the byte-identity sync guard from
`docs/conventions.md`'s "one rule, one wording" contract, and it is production-code sync, not a test
path — out of my custody to fix. Flagging it rather than working around it.

## Where the brief's claims held vs. did not

- **Held:** the pin's true span set matches the brief's file/count breakdown (next 2, init 3, finalize
  1) and the finalize span's exact final wording, verbatim.
- **Held:** `consent-in-conversation` really is the closest precedent — but closer than stated: it is
  not just a naming-convention example, its `FOREIGN_MARKERS` treatment is a required mechanism here,
  confirmed by the 61-failure measurement above, not merely a style choice to imitate.
- **Not stated in the brief, discovered by running the tree:** next and init each carry the marker in
  *multiple, independently-scoped* spans on one surface (not one span per topic), which is what makes
  the `Map.set`-overwrite failure mode reachable in the first place. A topic-level block with one
  token per span is what I used to resolve it while staying inside the brief's registration
  granularity ("per surface topic").
- **Everything else in the brief matched:** registration site (`required-blocks.js`), non-vacuity
  requirement, mutate-one-site-at-a-time discipline, snapshot-not-`git checkout` discipline, and the
  four gates to run.
