# IMPL-PROSE — the two owner-ruled prose corrections, implemented

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939`
(branch `workflow/bundle-937-938-939`, base `42559b1c`, with IMPL-LANE's #937 work already in the tree).

**Verification tier: `tests-green`.** The authored suites (TDD-PROSE's) pass; nothing was authored by
this agent in any test file, and no test file was edited.

No new env var, no new file, no new field, no new helper, no new export. Every change amends a string
that already existed. The one non-string addition is a local `const blockedByLabel` per classifier
emitter (six of them), which records which of the two probes short-circuited — the caller already
computed it; nothing about any signature changed.

---

## Change 1 — the classifier `blocked` reasoning names WHICH artifact

Six emitters across four files. `blocked` was `label OR marker` with the label evaluated first and
short-circuiting, so the arm is already known at the emitter — the fix is to hoist the label result
into a named local and branch the message on it.

The shape, identical at all six sites:

```js
const blockedByLabel = issueHasWorkflowInProgressLabel(issue.labels || []);
let blocked = blockedByLabel;
if (!blocked) { …the unchanged marker probe + its transient-fault arm… }
if (blocked) { …emit, branching on blockedByLabel… }
```

Evaluation order is preserved exactly: the marker probe still runs only when the label is absent, so
the #519 transient-fault routing is untouched.

| # | file | site | edit |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-classifier.js` | `cmdClassify` — probe now :371, emitter :396-:404 (was :371 / :392) | canonical, hand-edited |
| 2 | `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | same lines | **regenerated**, `node scripts/edition-sync.js --write` |
| 3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | `classifyIssue` — probe :288, emitter :309-:317 (was :288 / :305) | hand-port |
| 4 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | `cmdClassify` — probe :376, emitter :396-:405 (was :376 / :383) | hand-port |
| 5 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | `classifyIssue` — probe :288, emitter :309-:317 | hand-port |
| 6 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | `cmdClassify` — probe :376, emitter :396-:405 | hand-port |

The ports interpolate `forge.CLAIM_LABEL` rather than the literal (both resolve to
`workflow:in-progress`; `kaola-gitlab-forge.js:7`, gitea likewise), matching how
`issueHasWorkflowInProgressLabel` already matches it in those files.

### The exact new message text, captured from the running code

Sites 1 and 2 (github/codex — driven as a real subprocess with a `gh` mock, `KAOLA_WORKFLOW_OFFLINE`
deleted from the child env):

```
issue #501 has a remote workflow claim: the workflow:in-progress label is on the issue. That label never expires — remove it from the issue to release the claim.

issue #501 has a remote workflow claim: a kw:claim marker comment is on the issue. Delete that comment to release the claim; a timestamped marker also stops blocking 24h after its last update.
```

Sites 3 and 4 (gitlab — "note", the port's own vocabulary; site 4 captured from a live CLI drive,
site 3 by evaluating the emitter's own literal):

```
issue #520 has a remote workflow claim: the workflow:in-progress label is on the issue. That label never expires — remove it from the issue to release the claim.

issue #520 has a remote workflow claim: a kw:claim marker note is on the issue. Delete that note to release the claim; a timestamped marker also stops blocking 24h after its last update.
```

Sites 5 and 6 (gitea — "comment"):

```
issue #520 has a remote workflow claim: the workflow:in-progress label is on the issue. That label never expires — remove it from the issue to release the claim.

issue #520 has a remote workflow claim: a kw:claim marker comment is on the issue. Delete that comment to release the claim; a timestamped marker also stops blocking 24h after its last update.
```

Against what the tests pin: each arm contains its own token, the two arms differ on the same issue
number, and the label arm does not mention `kw:claim` (not required, but it is the honest reading —
when the label fires the marker was never probed).

**Wording note on the 24h claim.** `if (!comment.updated_at) return true;` (`classifier.js:216`)
makes an untimestamped marker block unconditionally, so the message says *a timestamped marker*
stops blocking after 24h rather than asserting the marker expires. That is deliberate, not a hedge.

---

## Change 2 — a refusing finalize names `release` as the give-the-claim-back route

Six doors, all in `cmdFinalize`, all returning before the claim-clearing loop
(`clearAdvisoryClaim` at canonical :4716 bundle-loop / :4723 scalar). Enumerated to be sure the set
is exactly six:
`awk 'NR>=4200 && NR<=4700 && /result: .refuse./'` over canonical returns exactly those six sites.

One sentence, byte-identical at all six doors and in all four editions:

```
The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

It names the route (`release`), where to run it (the main root), why not from where the operator is
standing (`cmdRelease`'s `refusing to discard current working directory`, canonical :5324), and what
`release` actually does — `archiveProjectDirSafely(root, project, 'abandoned', '.discarded-…')`,
`removeWorktree`, branch delete, then `clearAdvisoryClaim` (`cmdRelease` at canonical :5319).
Re-running finalize stays the primary advice in every door; the route is worded as the exit, not the
retry.

Canonical sites below are the door's `reason:` line, the stable anchor; the amended field sits a few
lines under each.

| # | door | field amended | canonical `reason:` line |
|---|---|---|---|
| 1 | `finalize_gate_unverified` | `operator_hint`, via `finalizeAuthorityHint` (:3927) | :4363 — **all four arms of the helper**, by a local `route` const appended to each return |
| 2 | `finalize_mirror_refused` | `operator_hint` | :4325 |
| 3 | `implementation_commit_missing` | `operator_hint` | :4411 |
| 4 | `staging_guard_multi_project` | `operator_hint` | :4431 (`reason: guard.reason`) |
| 5 | `archive_refused` | **`reasoning`** — no `operator_hint` added, per the ruling | :4473 |
| 6 | `archive_incomplete` | **`reasoning`** — no `operator_hint` added, per the ruling | :4504 |

Door 1's hint has four arms and the test fixture drives only one (`archive_authority_missing`). All
four were amended: they are one door, and an operator hitting `archive_state_not_closed` is in the
same position as one hitting the generic arm. The shared `route` local keeps the four copies from
being four wordings.

**One site deliberately NOT touched.** There is a *second* `staging_guard_multi_project` refusal, the
post-commit `finalGuard` (canonical :5235, gitlab :4911, gitea :4906). It fires **after** the
claim-clearing loop, so the claim is already released there and the route would be false advice. Its
hint already says "the archive is already recorded, so the re-run resumes at the commit step", which
is correct for it. Left alone on purpose.

### The exact assembled text per door (canonical; the ports and the codex mirror are identical)

`finalize_gate_unverified` (generic arm shown; the other three arms take the same suffix):

```
Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made. The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

`finalize_mirror_refused`:

```
The transaction owns the project-folder sync between the main checkout and the linked worktree, in BOTH directions, and could not perform it — one of the two trees is unwritable, or the main copy could not be repaired. `detail` names the tree and the error. Make that tree writable, then re-run finalize. Never hand-copy a staler main ledger over the worktree. No archive or closure side effect was made. The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

`implementation_commit_missing`:

```
The branch carries no implementation commit while implementation-shaped changes are uncommitted. Author the implementation commit yourself, then re-run finalize. The machinery authors only the finalize bookkeeping commit; no archive or closure side effect was made. The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

`staging_guard_multi_project` (the pre-archive door):

```
Split the commit: the index carries workflow state that does not belong to this project. Unstage it, then re-run finalize. No archive or closure side effect was made. The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

`archive_refused` (`reasoning`):

```
archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed. The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

`archive_incomplete` (`reasoning`; `<which-files>` and `<archiveIncompleteRemedy>` are the existing
runtime-computed parts, unchanged):

```
<which-files>; every live project folder was left in place — no roadmap/issue/label side effect was performed. The archive must reproduce every file the source contains, byte for byte and entry kind for entry kind. <archiveIncompleteRemedy> The claim is still held. Fixing this and re-running finalize is how the run finishes; if it will not be finished at all, `release` from the main root — not from inside the project folder, which it refuses — gives the claim back, archiving the run as abandoned and tearing down its worktree and branch.
```

Counted per edition: `grep -c "will not be finished at all"` → **6** in each of
`scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`.

---

## Files changed by this agent

| file | change |
|---|---|
| `scripts/kaola-workflow-classifier.js` | change 1, canonical |
| `scripts/kaola-workflow-claim.js` | change 2, canonical (6 doors) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | change 1, 2 sites |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | change 2, 6 doors |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | change 1, 2 sites |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | change 2, 6 doors |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | **generated** — `edition-sync.js --write` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | **generated** — `edition-sync.js --write` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | **generated** — swept up by the same `--write`; carries IMPL-LANE's canonical sink change, none of mine. This regen was pending before I started |

No test file touched. No `docs/`, no `CHANGELOG.md`, no `templates/routing/`, no
`scripts/kaola-workflow-sink-merge.js`.

---

## Verification

Baselines were taken in this worktree before any edit and match TDD-PROSE's recorded reds exactly.

| # | command | before | after |
|---|---|---|---|
| 1 | `node scripts/test-bundle-state.js` | exit 1 — `3 test(s) FAILED, 26 passed` | **exit 0** — `all 29 tests passed` |
| 2 | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | exit 1 — `AssertionError`, 6-entry `actual[]` | **exit 0** — `GitLab workflow script tests passed` |
| 3 | `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | exit 1 — `AssertionError`, 6-entry `actual[]` | **exit 0** — `Gitea workflow script tests passed` |
| 4 | `node scripts/test-finalize-door.js` | exit 1 — `40 failures, 450 passed` | **exit 0** — `finalize-door tests passed (490 assertions)` |
| 5 | `node scripts/simulate-workflow-walkthrough.js` (FULL) | 209/209 (IMPL-LANE) | **exit 0** — `{"scenarios":209,"ran":209,"passed":209,"failed":0}` |
| 6a | `node scripts/edition-sync.js --write` | — | **exit 0** — `write complete (3 file(s) updated)` |
| 6b | `node scripts/validate-script-sync.js` | — | **exit 0** — `OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families, and 6 forge export-superset families in sync.` |
| 7 | `node scripts/generate-routing-surfaces.js --check` | — | **exit 0** — `all 18 surfaces byte-match the skeleton` (untouched by this work) |
| + | `node scripts/test-spawn-classification.js` | — | **exit 0** — `644 spawn sites across 65 files, 212 classified, 432 grandfathered` (no spawn site added) |

Intermediate measurement worth keeping: after the canonical edits alone, finalize-door went
`40 → 30` failures with the `root` edition entirely green and 10 reds each on codex/gitlab/gitea —
i.e. the four editions are genuinely independent legs, and the codex 10 were cleared by the
`edition-sync` regen rather than by an edit.

### The residual red the brief predicted did NOT appear

The brief said to expect `validate-script-sync.js` still red on
`kaola-workflow-claim.js` / `kaola-workflow-sink-merge.js` gitlab+gitea export drift
(`resolveProjectSlug`). **It is green.** `resolveProjectSlug` is present 3× in canonical and 3× in
each of the two forge ports — IMPL-LANE's port work had already landed in the worktree by the time I
started. Nothing I own is red, and nothing is left red.

### Two mutation probes, because a green guard is not a proof it is armed

Both were reverted byte-exactly from a backup taken immediately before, and both suites were re-run
green afterwards.

1. Appended `// mutation probe` to `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` →
   `validate-script-sync.js` **exit 1** (`Fix: copy the canonical version`). So the COMMON_SCRIPTS
   byte-identity leg reads the **working tree**, and the green above is about my regenerated mirror,
   not about the HEAD blobs.
2. Commented out `resolveProjectSlug,` in the gitlab claim port's `module.exports` (line 6368) →
   `validate-script-sync.js` **exit 1** with
   `forge claim module.exports superset: … omits canonical export(s) [resolveProjectSlug]`. So the
   export-superset leg is armed too, and the green on that specific check is real.

After the reverts: `validate-script-sync.js` exit 0, `test-finalize-door.js` exit 0
(490 assertions).

---

## Deliberately left undone

* **Command / SKILL prose.** Not touched, per the brief. Those surfaces render from
  `templates/routing/`, `--check` is green at 18 surfaces, and the tests pin only the envelope.
  My read: they **should** eventually carry the route — #939's residual is stated as "no refusal
  envelope *and no command surface* names `release`", and this change closes only the first half.
  That is a skeleton edit plus a regeneration, and it is somebody's call, not mine.
* **`docs/api.md` / `CHANGELOG.md` / ADRs.** Owned by a later step. `docs/api.md` documents the
  finalize refusal envelopes and now describes six `operator_hint`/`reasoning` strings that have
  grown a sentence; whoever owns the docs step should check whether any of them is quoted there.
* **The second `staging_guard_multi_project` door** (post-claim-clear) — reasoned above; changing it
  would put false advice in front of an operator whose claim is already released.
* **No test file, and no `scripts/kaola-workflow-sink-merge.js`,** as instructed.

## Findings about the tests

None. All three pins are well-formed: every leg asserts reachability before it asserts a message,
1a carries an aged-marker positive control, and the same-issue-number choice in the classifier pins
is what makes the differ-check non-vacuous. I found nothing I would ask to be changed.
