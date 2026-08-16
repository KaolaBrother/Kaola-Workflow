# Finalize prose: comment what you corrected

## Task
Add prose to `templates/routing/finalize.skeleton.md` Step 7, inside the existing
`<!-- PIN: forge-is-the-backlog -->` span, requiring a run to post its corrections as a comment on
the issue it corrects — before closure — as distinct from filing a follow-up. Per ADR 0018 §5 item 9
/ §8 step 3. Regenerate surfaces and run the gates; do not touch `required-blocks.js` or `claim.js`.

## Final prose added (verbatim, quote this for the required-blocks.js registration)

Inserted after the existing `filed:` / `noise:` paragraph, still inside the same PIN span:

> When this run's own findings contradict or correct the issue as filed — a wrong premise, a disproved
> figure, a symptom that never existed, a justification the run replaced — post that correction as a
> comment on the issue before it closes. Never close quietly against text now known to be wrong. A
> correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the
> record of what this issue turned out to be, and it lands on the issue it corrects.

The full pin span now reads (unchanged lines above kept verbatim):

```
<!-- PIN: forge-is-the-backlog -->
For each real run-discovered defect, file a follow-up and record `filed: #N`. For each non-defect,
record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scanner never observed,
append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
scanner, so what is written was actually swept.

When this run's own findings contradict or correct the issue as filed — a wrong premise, a disproved
figure, a symptom that never existed, a justification the run replaced — post that correction as a
comment on the issue before it closes. Never close quietly against text now known to be wrong. A
correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the
record of what this issue turned out to be, and it lands on the issue it corrects.
<!-- /PIN -->
```

No per-forge splice was added to `templates/routing/slots.js`. The new sentences name no `gh`/`glab`/
`tea` invocation, matching the existing "file a follow-up and record `filed: #N`" sentence right above
it, which also names no command — same "result, not method" register, so no divergence point exists
to splice.

## Files changed

- `templates/routing/finalize.skeleton.md` — the only file I hand-edited. One `Edit` call, net +5
  lines (4 prose lines + 1 blank separator) inserted between the existing paragraph and the existing
  `<!-- /PIN -->` closer. `git diff HEAD --stat` on this file reports `+8` lines total, but that
  8-line figure also carries the `<!-- PIN: forge-is-the-backlog -->` / `<!-- /PIN -->` marker pair
  itself, which was **already present as an uncommitted change before I started** (added by another
  agent earlier this run, per ADR 0018 §8 step 3) — not something I added. I verified this by running
  `git diff HEAD -- templates/routing/finalize.skeleton.md`, which shows the marker lines as `+` (i.e.
  absent from the last commit, present only as pre-existing working-tree state).
- Everything else touched under this run's worktree (`scripts/kaola-workflow-claim.js` and its three
  plugin copies, `templates/routing/init.skeleton.md`, `templates/routing/next.skeleton.md`,
  `templates/routing/slots.js`, `CHANGELOG.md`, `docs/decisions/0018-the-forge-is-the-backlog.md`,
  `scripts/test-priority-list-open.js`) is **other agents' in-flight work, not mine** — I did not
  touch any of it. `node scripts/generate-routing-surfaces.js --write` regenerates from the *current*
  state of all three skeletons regardless of who edited them, so it also re-rendered the surfaces for
  `workflow-init` and `workflow-next` (their `commands/*.md` and `SKILL.md` copies, plus `.opencode*`
  and `.kimi*` trees) to reflect those other agents' skeleton edits. That is the generator's normal,
  correct behavior (surfaces must byte-match the skeletons at all times) and not something I can or
  should scope down — I did not hand-edit any of those source skeletons.
- Regenerated surfaces for `kaola-workflow-finalize` specifically (12 files, all derived, none hand-
  edited): `commands/kaola-workflow-finalize.md`; `plugins/kaola-workflow-{gitlab,gitea}/commands/
  kaola-workflow-finalize.md`; `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/
  skills/kaola-workflow-finalize/SKILL.md`; `.opencode{,​-gitlab,-gitea}/command/kaola-workflow-
  finalize.md`; `.kimi{,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md`.

I did not commit anything, per instructions.

## Gates — each exit code reported separately

| gate | exit code | notes |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --write` | 0 | "rendered 18 surfaces." |
| `node scripts/generate-routing-surfaces.js --check` | 0 | "all 18 surfaces byte-match the skeleton." |
| `node scripts/validate-workflow-contracts.js` | 0 | "Workflow contract validation passed" |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 | "Kaola-Workflow Codex contract validation passed" |
| `node scripts/test-route-reachability.js` | 1 | "73 failure(s), 330 passed" — unchanged from the documented baseline, confirmed below |

Also ran, per the brief's warning about ordering pins: no red from `validate-workflow-contracts.js`
(it's the one carrying `assertBefore('Write the mission list','Run it')`-style checks over these
skeletons) — my insertion sits well after that region of the file and does not touch any of the
sentences those ordering pins anchor to.

### Confirming I did not make route-reachability worse

The brief states the baseline is 73 orphan-surface failures "by design." I isolated my specific
5-line prose addition from the pre-existing (uncommitted, not-mine) PIN marker to make sure I wasn't
either hiding a regression or over-claiming credit:

- With the PIN marker present but **my prose paragraph removed** (marker + original single paragraph
  only, i.e. the state as another agent had already left it before dispatching me): regenerate +
  reachability → **73 failures, 330 passed**, 12 of them naming `kaola-workflow-finalize` surfaces.
- With the PIN marker present **and my prose paragraph added** (the actual final state): regenerate +
  reachability → **73 failures, 330 passed**, same 12 `kaola-workflow-finalize` lines.

Identical count either way — adding prose inside an already-present, already-orphaned pin span does
not add a new orphan-surface report; the marker's mere presence is what the check flags, once per
surface, regardless of how much text sits inside it. So my change added zero new reachability
failures. (An earlier, cruder check via `git stash` on the whole file gave a misleading 61-vs-73
comparison, because stashing the file reverted it all the way to the last **commit**, which predates
the marker's addition entirely — not to "the state right before my edit." The isolated before/after
above supersedes that and is the one to trust.)

## What in the brief turned out to be WRONG

Nothing in the brief's instructions or constraints was wrong. One clarification worth flagging: the
brief describes the marker span as "the existing pin span" as if it were settled/committed state — it
is, but it is **uncommitted** (added by another agent earlier this run, not yet part of any commit).
That doesn't change what I did, but it's relevant to whoever registers the `required-blocks.js` entry
next: the marker itself, not just my added sentences, is still only a working-tree change on this
branch.
