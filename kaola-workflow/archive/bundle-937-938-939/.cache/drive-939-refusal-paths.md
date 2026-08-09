# Investigation: issue #939 — do cmdFinalize's refusal doors strand a claim over merged work?

## Verdict (question 1)

**NO** — for `cmdFinalize`, on every ordering the workflow itself can produce.

All six refusal doors precede the merge, and two independent guards make a post-refusal merge
unreachable. The only construction that puts a merge *before* a `cmdFinalize` refusal requires an
out-of-workflow hand merge; even in that construction the claim is not "stranded over nothing" (the
live folder survives in both trees, a half-archive sits on main, the roadmap source is still live),
and `release` clears **both** claim artifacts in one command.

**Door count at HEAD: 6** (unchanged from the `ecdb2c88` citation; line numbers drifted +5).
**Working recovery paths: 3, all driven green.**

One qualification, measured rather than read: the compound *does* complete **one script downstream**.
`kaola-workflow-sink-merge.js`'s own archive step runs AFTER its merge step, so an archive refusal
there leaves the branch merged into **local** main with the claim fully held. `origin/main` never
advances, no forge call is made, and the journal is left resumable — so it is an unpublished,
retryable stop, not a stranding. Details in §5.

---

## Setup

- Commit: `42559b1c8df312e462816f139080f3508df48370` (HEAD, clean except the untracked live run folder)
- Platform: darwin 25.6.0, node from `process.execPath`, git 2.x
- **Nothing was run with the real repository as cwd.** Every drive builds a throwaway fixture
  (bare "remote" + working clone + linked worktree) under
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/b8b16016-81ca-44ee-b4fd-49b69d849cd2/scratchpad/`,
  invoking `scripts/kaola-workflow-claim.js` and `scripts/kaola-workflow-sink-merge.js` by absolute
  path from the real repo.
- **Zero live forge calls.** Every run sets `KAOLA_GH_MOCK_SCRIPT` to a stateful mock that appends
  every invocation to `gh.log` and keeps the label + `<!-- kw:claim project=… -->` marker comment in
  `forge.json`, so *claim-artifact survival is read from state*, not inferred from the log.
- Fixture branches are pinned `-b main` explicitly (`git init --bare -b main`, plus
  `git config init.defaultBranch main` in the clone).
- Harness: `fx.js` (linked-worktree merge-lane fixture), `sole.js` (sole-archiver sink fixture),
  drives `d0.js` … `d7.js` in the scratchpad above.

---

## 1. The refusal-door table at HEAD

Enumerated mechanically (every bare `return;` between `function cmdFinalize()` at **4142** and its
closing `}` at **5172**, classified against the claim-clearing block whose header
`let claimLabelRemoved;` is at **4606**; the `clearAdvisoryClaim` calls are at **4610** (bundle
loop) and **4616** (scalar)).

### The six refusals that precede the claim release — the #939 set

| # | HEAD line | at `ecdb2c88` | `reason` | driven? | forge calls | claim after |
|---|---|---|---|---|---|---|
| 1 | **4253** | 4248 | `finalize_mirror_refused` (`inner_reason: mirror_sync_failed`) | yes | **none at all** | both held |
| 2 | **4282** | 4277 | `finalize_gate_unverified` (`gate: workflow_state`) | yes | 2 reads | both held |
| 3 | **4333** | 4328 | `implementation_commit_missing` | yes | 2 reads | both held |
| 4 | **4348** | 4343 | `staging_guard_multi_project` / `staging_guard_foreign_archive` | yes (both arms) | 2 reads | both held |
| 5 | **4384** | 4379 | `archive_refused` (`result.reason`, e.g. `archive_forced_refusal`, `archive_exception`) | yes | 2 reads | both held |
| 6 | **4419** | 4414 | `archive_incomplete` | yes | 2 reads | both held |

The "2 reads" are `issue list --state all --limit 200 --json number,state` and
`issue view <N> --json state` — both pure probes from `readActiveFolders`. **No door performs a
mutating forge call.** Door 1 fires before even those, so its ledger is empty.

### The one non-refusal return in the same span

| HEAD line | what | note |
|---|---|---|
| **4161** | the `--check` one-pass pre-flight emit | read-only mode, zero side effect; exits 1 when `reasons` is non-empty. Not a refusal of a finalize and deliberately excluded from the count of six. |

### The three returns AFTER the claim was already released — the inverse asymmetry

| HEAD line | what | claim state when it refuses |
|---|---|---|
| **4982** | `chore: archive` commit failed (`emitFinalizeCommitFailure`) | **already released** |
| **5103** | `finalGuard` staging guard — the *same* check as door 4 | **already released** |
| **5132** | `chore: finalize` commit failed | **already released** |

Line 5103 is worth naming: the identical staging-guard condition refuses at **4348** with the claim
intact and at **5103** with the claim already gone. That is the mirror image of #939's hypothesis
(claim released while the run is still live) and is *not* measured here — flagged, not investigated.

---

## 2. Ordering relative to the merge

Established from control flow and confirmed by drive:

- **Doors 1–4 are all above `archiveProjectDirSafely` (claim.js:4375)**, and doors 5–6 are that call
  and its verification. Nothing in `cmdFinalize` merges, pushes, or touches the mainline before any
  of them.
- On the merge lane the documented finishing sequence is `finalize --keep-worktree` → push →
  `sink-merge`. `cmdFinalize` therefore runs entirely **before** the merge by construction.
- After an archive refusal the branch tip still carries `kaola-workflow/<project>/workflow-state.md`
  (the `chore: archive` commit is downstream of the refusal). Two independent guards then stop the
  merge — measured in §3, leg 2 and §4.

`kaola-workflow-sink-merge.js` is the opposite: `SINK_STEPS = ['preflight', 'push_upstream',
'merge', 'finalize', 'stash_restore', 'archive_commit', 'push_main', 'closure']` (sink-merge.js:1190).
Its **archive is step 4, after the merge**. §5 drives it.

---

## 3. Drive D1 — the `archive_refused` door on genuinely complete work

Fixture `fx-d1-hFUn0E`: implementation commit on `workflow/issue-93901`, branch pushed to origin,
run folder live in both the worktree and main, roadmap source live, label + marker on the issue.

**Leg 1 — the door.**

```
node scripts/kaola-workflow-claim.js finalize --project issue-93901 --keep-worktree --json
  cwd = <fx>/wt/issue-93901
  env: KAOLA_WORKFLOW_OFFLINE=0 KAOLA_GH_MOCK_SCRIPT=<mock> KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1
exit 1
```

```json
{"result":"refuse","reason":"archive_forced_refusal","project":"issue-93901",
 "reasoning":"archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed."}
```

forge ledger: `["issue list --state all --limit 200 --json number,state","issue view 93901 --json state"]`
claim after: `{"label_on":true,"marker_present":true,"issue_state":"open"}`
live folder in worktree: true · branch tip carries live folder: true · archive on main: false ·
roadmap source live: true · `main` and `origin/main` both unmoved.

**Leg 2 — can the merge land?**

```
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93901 --project issue-93901 --issue 93901
  cwd = <fx>/main
exit 1
```

```json
{"result":"report","status":"not_merged","reason":"run_not_finalized",
 "detail":"kaola-workflow/issue-93901/workflow-state.md still exists on branch workflow/issue-93901 — this run was never finalized, so the branch still carries live run state. Nothing was merged and nothing was pushed."}
```

forge ledger: `[]` · claim unchanged · `main` and `origin/main` unmoved.

**Leg 3 — recovery A: re-run finalize with the condition cleared.** exit 0,
`claim_label_removed: "removed"`, ledger
`[… , "issue edit 93901 --remove-label workflow:in-progress", "issue comment 93901 --body Kaola-Workflow advisory claim cleared: finalized", "api repos/{owner}/{repo}/issues/93901/comments", "api --method DELETE repos/{owner}/{repo}/issues/comments/101", …]`,
claim after: `{"label_on":false,"marker_present":false}`. Branch tip no longer carries the live folder.

Baseline control (`d0.js`, same fixture shape without the knob): exit 0, identical clearing ledger —
so "the claim survived" in leg 1 is a statement about the **door**, not about a fixture that never
reaches the claim loop.

---

## 4. Drive D2 — the shipped `--sink` form on a refused state

The command surface invokes the sink as `--sink --json`
(`commands/kaola-workflow-finalize.md:327`), whose preflight is `sinkPreflight` (sink-merge.js:1675)
and does **not** carry `assertNoLiveWorkflowFolder`. Driven on the same shape as D1 with the live
folder present in main as untracked residue (the real repo's `?? kaola-workflow/<project>/` shape):

```
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93902 --issue 93902 \
  --project issue-93902 --sink --json    cwd = <fx>/main
exit 1
{"result":"refuse","reason":"sink_blocked",
 "foreign_dirt":["kaola-workflow/issue-93902/.cache/evidence.md","kaola-workflow/issue-93902/mission-list.md"],
 "detail":"main checkout carries changes not owned by this sink; resolve (commit/stash/restore) before re-running."}
```

`main`, `origin/main` unmoved; forge ledger `[]`; claim held.

So both sink forms stop: the legacy path on `run_not_finalized`, the `--sink` path on the untracked
main-side duplicate that a refused finalize necessarily leaves behind. **No merge is reachable after
a `cmdFinalize` archive refusal on this topology.**

---

## 5. Drive D3 — the post-merge archive refusal that IS reachable (sole-archiver sink)

The one shipped lane where the archive runs after the merge. Fixture `sa-d3-I7ueEW`: single working
tree, live run folder committed on the branch, main holding only the roadmap — the shape
`test-sink-merge.js buildSoleArchiverFixture` builds.

```
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93903 --issue 93903 \
  --project issue-93903 --sink --json    cwd = <fx>/main
  env: KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1 KAOLA_WORKFLOW_SKIP_TESTGATE=1
exit 1
```

```json
{"result":"refuse","reason":"sink_incomplete","step":"finalize",
 "archive_refusal":"archive_forced_refusal","branch":"workflow/issue-93903","default_branch":"main",
 "detail":"archiving kaola-workflow/issue-93903/ did not happen (archive_forced_refusal): … Refusing to report status:sinked over an archive the sink did not perform. Nothing was pushed to main and no issue was closed; the live project folder was not deleted and the finalize step is left NOT done so a re-run retries the archive."}
```

| measurement | before | after |
|---|---|---|
| local `main` | `da14d7ae37` | **`5ac9a4dc57`** (= branch tip) |
| `origin/main` | `da14d7ae37` | `da14d7ae37` (**unmoved**) |
| branch ancestor of local main | false | **true** |
| branch ancestor of `origin/main` | false | false |
| `DELIVERABLE.txt` @ local main | `<absent>` | `"the deliverable"` |
| `DELIVERABLE.txt` @ origin/main | `<absent>` | `<absent>` |
| forge ledger | — | `[]` |
| claim | label+marker on | **label+marker on** |

journal `kaola-workflow/issue-93903/.cache/sink-receipt.json`:
`{"preflight":"done","push_upstream":"done","merge":"done","finalize":"pending","stash_restore":"pending","archive_commit":"pending","push_main":"pending","closure":"pending"}`

**Reading:** the merge landed **locally**, nothing was published, no forge call was made, and the
step ledger is left resumable. Holding the claim here is correct — the run still owns live state on
main's tip and the work is not shared. **Recovery (leg 2):** re-running `--sink` with the condition
cleared exits 0, pushes main, closes the issue, and removes the label.

---

## 6. Drive D4 — the `archive_incomplete` door under a REAL and PERSISTENT condition

The forced-refusal seam clears on the next run, so the hostile case needs a condition a re-run
cannot fix. Lever: a **symlink inside the live run folder** (`.cache/evidence-link.md`) — an entry
`verifyArchiveComplete` (claim.js:5925) cannot reduce to bytes, so it lands in `mismatched[]`.

**Leg 1 — door 6 fires:** exit 1

```json
{"result":"refuse","reason":"archive_incomplete","project":"issue-93904","missing":[],
 "mismatched":[".cache/evidence-link.md"],
 "dest":"<fx>/main/kaola-workflow/archive/issue-93904",
 "reasoning":"the archive copy does not faithfully reproduce the live project (.cache/evidence-link.md); every live project folder was left in place — no roadmap/issue/label side effect was performed. …"}
```

ledger: 2 reads · claim: both artifacts held · **half-archive left on main**:
`archive/issue-93904/` = `[".cache","finalization-summary.md","mission-list.md","workflow-state.md"]`
· both live folders survive.

**Leg 2 — recovery A fails, as designed.** Re-running finalize with nothing fixed refuses
identically, and writes a *second* archive residue at a collision-suffixed dest
(`issue-93904.archived-2026-08-09T02-59-18-281Z`). Ledger `[]`, claim still held. Observation worth
recording: **each refused re-run leaves another archive-band residue directory on main.**

**Leg 3 — recovery B: `release`.** exit 0

```json
{"released":true,"project":"issue-93904","claim_label_removed":"removed","archived":true,
 "dest":"<fx>/main/kaola-workflow/archive/issue-93904.discarded-2026-08-09T02-59-18-451Z",
 "discard_archive_committed":true,"discard_archive_branch":"main"}
```

ledger: `issue edit --remove-label` + `issue comment … cleared: discarded` +
`api …/comments` + `api --method DELETE …/comments/101` → claim after
`{"label_on":false,"marker_present":false}`. **Both artifacts cleared** on the same condition that
permanently blocks finalize, because `cmdRelease` runs in-place (`fs.renameSync`) and a rename
preserves the symlink, so the completeness check passes.

**Leg 4 — recovery C: remove the offending entry, re-run finalize.** exit 0, `status: closed`,
`claim_label_removed: "removed"`, both artifacts cleared.

---

## 7. Drive D7 — the most hostile ordering I could construct

Work genuinely complete, **merged AND published to `origin/main`** by hand *before* finalize runs,
then door 6 fires with the archive already half-written.

```
git -C main merge --no-ff -m 'Merge workflow/issue-93940' workflow/issue-93940
git -C main push origin main
→ MERGED + PUBLISHED before finalize: true
→ src/app.js @origin/main: "module.exports = 2; // the deliverable"
→ live run folder ON origin/main: true

node scripts/kaola-workflow-claim.js finalize --project issue-93940 --keep-worktree --json
  cwd = <fx>/wt/issue-93940
exit 1
{"result":"refuse","reason":"archive_incomplete","missing":[],"mismatched":[".cache/evidence-link.md"],
 "dest":"<fx>/main/kaola-workflow/archive/issue-93940"}
```

State at that instant: **work merged + published = true, claim held = label on, marker present.**
Half-archive on main = `[".cache","finalization-summary.md","mission-list.md","workflow-state.md"]`;
live folder present in the worktree AND in main's working tree.

This is the closest thing to a YES that exists, and it does **not** qualify, for two measured reasons:

1. **It is not reachable from inside the workflow.** Nothing in the workflow performs that merge:
   §3 leg 2 and §4 show both sink forms refusing before it, and the merge had to be typed by hand.
2. **The claim is not held "over nothing."** Live run state is present in three places (worktree,
   main's working tree, `origin/main`'s tip) and the roadmap source is live. A re-claim of that
   issue while all of that exists would be the actual defect.

**Recovery on that exact state** — `release` from the main root, exit 0, both artifacts cleared:

```json
{"released":true,"project":"issue-93940","claim_label_removed":"removed","archived":true,
 "dest":"<fx>/main/kaola-workflow/archive/issue-93940.discarded-…","discard_archive_committed":true,
 "discard_archive_branch":"main"}
```

**Operator trap, driven:** running the same `release` with cwd *inside* the project folder refuses —
`{"released":false,"reason":"refusing to discard current working directory"}` (claim.js:5185), exit 1,
claim untouched. The recovery must be invoked from the main root.

---

## 8. The recovery ladder, all legs driven

| # | path | condition it clears | result | evidence |
|---|---|---|---|---|
| A | re-run `finalize` after fixing the condition | transient (seam off, permission restored) or fixed persistent | exit 0, **both** artifacts cleared | §3 leg 3, §6 leg 4 |
| B | `cmdRelease` from the **main root** | anything, incl. a persistent linked-lane archive fault | exit 0, **both** artifacts cleared | §6 leg 3, §7 |
| C | re-run `sink-merge --sink` | the sink's own post-merge archive stop | exit 0, publishes + closes + removes the label | §5 leg 2 |

Extra measurement (D8): a symlink in the run folder that permanently blocks the **linked-worktree**
finalize does **not** block the sink — the in-place lane renames rather than copies, the symlink is
preserved into the archive, and the sink completes at exit 0 with `archived_paths` including
`mission-link.md`. So the condition that makes recovery A impossible still leaves B and C.

**`cmdRelease`'s own hazard warning at HEAD** (claim.js:5274-5277 — the task cited :5271 at
`ecdb2c88`; :5271 is now the scalar `clearAdvisoryClaim` call itself):

```js
const releaseWarnings = [];
if (claimLabelRemoved !== 'removed' && claimLabelRemoved !== 'skipped_offline') {
  releaseWarnings.push('claim label removal status: ' + claimLabelRemoved +
    ' — the workflow:in-progress label may still be on the issue; the next claim could hit user_target_blocked.');
}
```

---

## 9. Inferences

- **The six doors are correct as written** — confidence high. Every one of them fires with the
  mainline untouched and both claim artifacts intact, and in every in-workflow ordering the run
  still owns live state at that moment. Refuted by: any driven ordering in which a door fires with
  the branch already merged *by the workflow itself* and no live run state anywhere.
- **#939 closes with no code** — confidence high for the `cmdFinalize` scope it names. The compound
  it recorded no longer completes there, three recovery paths work, and the residual gap is
  routing: neither `commands/kaola-workflow-finalize.md` nor any refusal envelope names `release`
  as the give-the-claim-back route. `docs/api.md:833` names it for exactly one archive reason
  (`archive_reserved_directory`) and nowhere else. Refuted by: an ordering where all three recovery
  paths refuse on the same state.
- **The sink's post-merge archive stop (§5) is the closest live instance of the shape #939 describes**
  — confidence high that it is reachable, medium that it is worth anything. Nothing is published, no
  forge call is made, and the journal resumes. Refuted by: a state where the sink's archive refuses
  *after* `push_main`.

---

## 10. Observations outside #939's question (recorded, not pursued)

1. **Three post-claim-release refusals** (4982, 5103, 5132). 5103 re-runs the *same* staging guard as
   door 4 but after the claim is gone. The inverse hazard; unmeasured here.
2. **The sink's CLOSE path leaves the marker comment.** D3 leg 2 ledger:
   `issue edit … --remove-label` fired, no `api …/comments` fetch, no DELETE — claim after
   `{"label_on":false,"marker_present":true,"issue_state":"closed"}`. This is **deliberate and
   documented** (sink-merge.js:965-970: "a marker on a CLOSED issue is inert — the classifier
   short-circuits on closed state"). Not a defect; recorded so the asymmetry against the keep-open
   arm is not re-discovered as one.
3. **The #936 keep-open fix is armed.** D5: keep-open `--sink` ledger =
   `["issue view … --jq .state","issue edit … --remove-label workflow:in-progress","api repos/{owner}/{repo}/issues/93905/comments","api --method DELETE repos/{owner}/{repo}/issues/comments/101","issue view … --jq .state"]`,
   claim after `{"label_on":false,"marker_present":false,"issue_state":"open"}`.
4. **Archive residue accumulates on repeated `archive_incomplete` refusals** (§6 leg 2): each refused
   re-run leaves a further `<project>.archived-<ts>` directory on main. `resolveFinalizeAuthority`
   refuses `archive_authority_ambiguous` when more than one archive-band entry matches *and* the live
   source is gone — so this is inert while the live folder survives, and becomes a second-order
   problem only if the live folder is later removed by hand.

## 11. Open

- The `--check` pre-flight (4151-4161) was not driven against any of the six doors; whether it
  predicts all six is unmeasured.
- The three post-claim-release refusals were not driven.
- Levers that did not reproduce (recorded so they are not retried): an **empty** `workflow-state.md`
  does not trip door 2 (an empty file is still a regular file — a symlink does); staging **one**
  foreign project alone does not trip door 4 (`projects.size > 1` needs both); making **main's**
  mission list richer does not trip door 1 — `compareLedgers` refuses only when the **worktree**
  records strictly more `status: done` items than main (`ledger-compare.js:47-58`, measured directly:
  `compareLedgers(rich, thin) -> {"safe":true,…,"sourceComplete":3,"destComplete":1}`).
