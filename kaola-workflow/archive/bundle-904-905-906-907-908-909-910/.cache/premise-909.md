# Investigation: issue #909 — two pre-existing closure-audit findings

## Verdicts

| # | Claim | Verdict |
|---|-------|---------|
| 1 | #796 carries a stale `workflow:in-progress` label | **HOLDS**, and it is the **only** one. Widened sweep found no second closed issue and no unbacked open issue. |
| 2 | `archive/bundle-429-434/` is unrepairable residue | **HOLDS in every particular**, with one correction to the issue text (line citation is stale) and one fact the issue does not state: **the residue's file is unique — the sibling archive has no `sink-receipt.json`.** |
| 3 | (implied by AC3) an unscoped audit reports the two findings | **REFUTED — it reports SIX findings across THREE classes.** A third class, `archive_summary_citation_missing` (4 findings), is absent from #909 entirely and blocks acceptance criterion 3. |

---

## Setup

- Commit: `2018521fd9e96c7f84ace0d099d3881706414bac` (`main`, 2026-08-02 00:45:18 +0800)
- Working tree at start: clean except the untracked live run folder
  `?? kaola-workflow/bundle-904-905-906-907-908-909-910/`
- Online (`gh` authenticated); `KAOLA_WORKFLOW_OFFLINE` not set — the audit's remote classes evaluated.

### Read-only proof, taken *before* running the audit

The task warned that some tooling here mutates on a bare invocation (the roadmap script does). This
one does not. Three independent checks:

1. **Static, in `main()` (`scripts/kaola-workflow-closure-audit.js:665-730`)**: the only mutating
   call chain is `executeRepairs`, reached solely under `if (args.execute)`. `regenerateRoadmap` —
   the roadmap script's mutating entry point — is called **only** from `executeRepairs`
   (line 618). The dry-run branch writes JSON to stdout and returns.
2. **Imported modules have no import-time side effects**: both `kaola-workflow-roadmap.js` and
   `kaola-workflow-active-folders.js` guard their CLI behind `require.main === module`
   (`roadmap.js:397`, `active-folders.js:301`), and `kaola-workflow-active-folders.js` contains
   **zero** `writeFileSync`/`unlinkSync`/`mkdirSync`/`rmSync`/`renameSync` calls at all. Every write
   site in `roadmap.js` sits inside `writeFileAtomicReplace` (line 128) or `createFileExclusive`
   (line 174); a grep for module-scope statements returned nothing.
3. **Empirical**: 8310-file `shasum` manifest of `kaola-workflow/` taken before and after. Result
   below under *Mutation proof*.

### Commands run (verbatim)

```
gh issue view 909 --json number,title,state,body,labels,createdAt
gh issue view 796 --json number,state,title,closedAt,labels
gh issue list --state closed --label workflow:in-progress --limit 200 --json number,title,closedAt,state
gh issue list --state open   --label workflow:in-progress --limit 200 --json number,title,createdAt,state
git ls-files kaola-workflow/archive/bundle-429-434/
git status --short --ignored -- kaola-workflow/archive/bundle-429-434/
git log main --diff-filter=A --format='%H | %ci | %s' -- kaola-workflow/archive/bundle-429-434/.cache/sink-receipt.json
git show --name-status -M 05590e2f08f45c9d0c7fe543c189b2a18583635d
node scripts/kaola-workflow-closure-audit.js --help
node scripts/kaola-workflow-closure-audit.js          # NO --execute
```

No `--execute` was passed to anything. No `gh issue edit`, no label mutation, no `git add`/`commit`/`rm`.

---

## FINDING 1 — #796's stale label

### Observations

| Measurement | Command | Result | Exit |
|---|---|---|---|
| #796 state | `gh issue view 796 --json number,state,closedAt,labels` | `state: CLOSED`, `closedAt: 2026-07-25T10:12:31Z` | 0 |
| #796 labels | same | `bug`, **`workflow:in-progress`**, `area:workflow-phases`, `area:workflow-router` | 0 |
| All closed issues with the label | `gh issue list --state closed --label workflow:in-progress --limit 200` | **exactly one: #796** | 0 |
| All open issues with the label | `gh issue list --state open --label workflow:in-progress --limit 200` | **exactly seven: #904 #905 #906 #907 #908 #909 #910** | 0 |
| Archive exists | `ls -la kaola-workflow/archive/issue-796.archived-2026-07-25T10-00-15-000Z/` | present: `.cache/`, `workflow-plan.md` (34506 B), `workflow-state.md` (4778 B), `workflow-tasks.json` | 0 |
| Archive tracked | `git ls-files <archive>/` | 8 tracked files | 0 |
| Archive state terminal | `cat <archive>/workflow-state.md` | `name: issue-796` / **`status: closed`** | 0 |
| Archive state files now | `ls -1 kaola-workflow/archive/*/workflow-state.md \| wc -l` | **368** top-level (369 dirs, one lacks it) | 0 |
| Recursive count | `find kaola-workflow/archive -name workflow-state.md -type f \| wc -l` | **376** (8 nested under `.cache/epochs/*/files/`) | 0 |

The label is **really still attached**: it appears in `gh issue view 796`'s own label array, and the
audit's independent server-side query (`--state closed --label workflow:in-progress`) returns it.
Two independent reads agree.

### The archive state is terminal but not "finalized"

Worth naming, because it is mildly odd: `issue-796`'s archived `workflow-state.md` says
`status: closed` (the field the audit reads) but its position fields still read
`step: start`, `last_command: startup`, `last_result: folder_claimed`, and it carries a
`## Pending Gates` entry. It is a *claimed-then-closed* record, not a walked-to-completion one.
This does **not** weaken the verdict — `status: closed` is the field that matters, and the forge
agrees the issue is closed — but it means the archive is not evidence of a full finalize pass.

### The audit really lacks the mapping — verified

`detectStaleLabels()` (`scripts/kaola-workflow-closure-audit.js:404-416`) is the whole class:

```js
function detectStaleLabels() {
  if (OFFLINE) return 'skipped_offline';
  try {
    const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
    return raw ? JSON.parse(raw) : [];
  } catch (err) { ... }
}
```

It forwards the forge's `number,title,url` verbatim. There is **no** filesystem read, **no** archive
correlation, and no other code path augments the finding — `partitionDriftByScope` only filters it by
`scope.issues.has(f.number)` (line 567). So the class tells an operator *that* a closed issue is
labelled, never *which run finished it*. Confirmed.

**One correction to the issue's framing.** #909 says resolving #796 to its archive "required a grep of
368 archive state files". That is what was done, but it was not *required*: the archive folder is
named `issue-796.archived-2026-07-25T10-00-15-000Z`, so a name match resolves it in one `ls`:

```
$ ls -1d kaola-workflow/archive/*796*
kaola-workflow/archive/issue-796.archived-2026-07-25T10-00-15-000Z
```

and the content grep returns the same single file. Both routes are unambiguous here (one hit each).
The audit performs **neither** — that is the real gap, and it is the same gap either way. But the
cost of a manual resolution for a single-issue project is one `ls`, not 368 file reads. It would be
368 reads for a *bundle* member, whose number appears in no folder name.

### Widened check: open issues carrying the label

Seven open issues carry it: **#904, #905, #906, #907, #908, #909, #910** — exactly the seven this
session claimed, all created 2026-08-01. **I excluded these seven, as instructed.** After exclusion,
**zero** open issues carry the label. There is no unbacked open-issue drift.

### VERDICT 1: **HOLDS.** The finding is real, and the widened sweep makes it *exactly* one — the issue named a hypothesis and it turned out to be the complete set.

### Options for a human (I do not choose)

| Option | What it costs | What it leaves |
|---|---|---|
| **A. Remove the label manually** — `gh issue edit 796 --remove-label workflow:in-progress` | One forge write. Surgical: touches nothing else. | Class clears. Nothing else moves. |
| **B. Run `closure-audit --execute` unscoped** | Removes the label **and** unconditionally calls `regenerateRoadmap(root)` (line 618), rewriting `kaola-workflow/ROADMAP.md` as a side effect even though `stale_roadmap_sources` is empty. | Class clears. See the ROADMAP note below. |
| **C. Run `closure-audit --issue 796 --execute`** | Scoped repair: `executeRepairs` consumes only the scoped drift (line 707), so only #796's label is touched — but `regenerateRoadmap` is *still* called whole (the comment at 704-706 says so explicitly). | Same as B, scoped. |
| **D. Declare the label intentional** | Zero writes. | The class reports #796 forever; AC1's second branch ("or the label is confirmed intentional") is satisfied by the decision record. |

**ROADMAP side-effect note (inference, not measured).** `kaola-workflow/.roadmap/` currently holds
only `_rules.md` and `.gitkeep` — **no `issue-*.md` sources** (dot-directory named explicitly; `grep`
here is ugrep and skips them otherwise). `kaola-workflow/ROADMAP.md` already renders
`| none | No active work | — | — | — |` plus the `### Project rules` block. So a regeneration should
reproduce byte-identical content. I did **not** verify this, because the only way to verify it is to
perform the mutation. Confidence: high; refuted by any diff to `ROADMAP.md` after an `--execute` run.

Options B and C are the only ones that write a tracked file. A is the minimal action.

---

## FINDING 2 — `archive/bundle-429-434/` residue

### Observations

| Measurement | Command | Result | Exit |
|---|---|---|---|
| Every entry, incl. dotfiles | `find kaola-workflow/archive/bundle-429-434 \| sort` | 3 lines: the dir, `.cache/`, `.cache/sink-receipt.json` | 0 |
| Tracked files | `git ls-files kaola-workflow/archive/bundle-429-434/` | **exactly 1**: `.cache/sink-receipt.json` | 0 |
| Untracked / ignored | `git status --short --ignored -- kaola-workflow/archive/bundle-429-434/` | **empty** — no untracked file hides there | 0 |
| `workflow-state.md` | `test -e .../workflow-state.md` | **ABSENT** | 1 |
| Sibling archive | `ls -la kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/` | present: `.cache/` (34 entries), `workflow-plan.md`, `workflow-state.md`, `workflow-tasks.json`; **36 tracked files** | 0 |
| Sibling state valid | `cat <sibling>/workflow-state.md` | `name: bundle-429-434` / **`status: closed`** / `step: complete` / `last_result: closed` / `issue_numbers: 429,434` / `closure_policy: all_or_nothing` | 0 |

**Complete listing of the residue — every entry, tracked and untracked:**

```
kaola-workflow/archive/bundle-429-434/                          (dir, mtime 2026-06-13 16:28)
kaola-workflow/archive/bundle-429-434/.cache/                   (dir, mtime 2026-06-13 16:52)
kaola-workflow/archive/bundle-429-434/.cache/sink-receipt.json  (565 B, TRACKED)
```

That is the whole directory. One tracked file, no untracked file, no `workflow-state.md`. The issue's
description is exact.

### What the residue's `sink-receipt.json` contains

```json
{
  "project": "bundle-429-434",
  "branch": "workflow/bundle-429-434",
  "issue_number": 429,
  "issue_numbers": [429, 434],
  "resolved_default_branch": "main",
  "started_at": "2026-06-13T08:28:59.243Z",
  "updated_at": "2026-06-13T08:52:37.609Z",
  "stash_ref": null,
  "removed_duplicates": [],
  "steps": {
    "preflight": "done", "push_upstream": "done", "merge": "done",
    "worktree_sync": "done", "finalize": "done", "closure": "done",
    "stash_restore": "done", "archive_commit": "done", "push_main": "done"
  }
}
```

### Does the residue hold anything unique? **YES — and the issue does not say so.**

This is the whole question for whether removal loses information, so it was measured directly:

```
$ find "kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/" -name '*sink*'
.../.cache/n2_impl_sink.md
.../.cache/barrier-open-n2_impl_sink
.../.cache/barrier-base-n2_impl_sink
```

**The sibling archive contains no `sink-receipt.json` of any kind.** Its 34-entry `.cache/` holds
barriers, node reports, `dispatch-log.jsonl`, `node-timings.jsonl`, `provenance-log.jsonl` — and no
receipt. So the residue is **not** a duplicate: deleting the directory removes the only copy of that
run's sink receipt **from the working tree**.

**But it is permanently recoverable from git history**, verified:

```
$ git show 4d857a233e195b9712ef43de24558afae0960fad:kaola-workflow/archive/bundle-429-434/.cache/sink-receipt.json
{ "project": "bundle-429-434", ... }        # exit 0, full content
```

For calibration: 43 of the 369 archives carry a `.cache/sink-receipt.json`, so its presence is
common-but-not-universal (12%). Its absence from a completed archive is not anomalous.

### How it got committed — accident, not carve-out

Only **two** commits on `main` ever touched the path (`--all` shows many more, but those are
`kaola-workflow barrier base` snapshot commits on run branches, not deliberate edits):

| Commit | Time | Subject | What it did to the path |
|---|---|---|---|
| `4d857a23` | 2026-06-13 16:52:35 | `chore: archive bundle-429-434 [sink]` | **ADDED** the file. The *entire commit* is this one file: `1 file changed, 25 insertions(+)`. |
| `05590e2f` | 2026-06-13 16:58:00 | `chore: clean up bundle-429-434 active project dir after sink` | **36 pure renames** (`R100`), `kaola-workflow/bundle-429-434/*` → `kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/*`, plus 16 changed lines in `workflow-state.md`. It did **not** touch the residue. |

So the sequence, six minutes apart, was:

1. The sink wrote its receipt to `archive/<project>/.cache/` — the **bare project name**.
2. The archive mover then relocated the run folder to `archive/<project>.archived-<ts>/` — the
   **timestamped name**.

Two writers, two different destination conventions, and the receipt landed in a directory the archive
mover never populated. **This is an accident of path derivation, not a deliberate carve-out.** It is
also the exact failure the script's own `#832` comment names as the class's derivation
(`kaola-workflow-closure-audit.js:288-289`):

> `an archive gutted afterwards (the worktree that held it was deleted, or the sink's own receipt writer mkdir-ed a bare '.cache/' skeleton)`

The residue is the observed instance that derived `archive_content_incomplete`.

### Report-only: confirmed, but the issue's line citation is STALE

**#909 cites `closure-audit.js:340-342`. At HEAD those lines are the wrong code.** Lines 335-340 are
the precision comment for the *`#901` citation class* (`archiveCitedMissing`), a different detector:

```js
// Precision, measured over this repo's 368-archive corpus (436 bare-relative citations across 118
// summaries): 4 archives flagged, 3 of them real losses. ...
```

Verified identical at `7350ba9c` and `2018521f`, so this is not drift introduced after filing —
the citation was wrong or was taken against an in-flight worktree copy.

**The real report-only proof is in two places.** First, the derivation comment at lines 299-301:

```js
// ... LOCAL and report-only either way: an incomplete archive is not repairable, so --execute reports
// it and never touches it.
```

Second — and this is the load-bearing one, because it is *code* — `executeRepairs` at lines 647-654:

```js
  const reportedNotRepaired = {
    active_folder_for_closed_issue: report.drift.active_folder_for_closed_issue,
    unarchived_pr_folders: report.drift.unarchived_pr_folders,
    // #832: an incomplete archive is not repairable — the lost bytes are gone by construction
    // (computePlanHash over a reconstruction cannot reproduce the frozen marker). Report it and
    // never delete or rewrite it.
    archive_content_incomplete: report.drift.archive_content_incomplete
  };
```

`archive_content_incomplete` appears in `executeRepairs` **only** inside `reportedNotRepaired`. The
function's three mutation sites are `fs.unlinkSync` over `stale_roadmap_sources` (line 610),
`regenerateRoadmap` (618) and `gh issue edit` over `stale_in_progress_labels` (628). None reads the
archive class. **`--execute` cannot clear `archive_content_incomplete`.** Confirmed.

### Widened sweep: archives lacking `workflow-state.md`

```
$ for d in kaola-workflow/archive/*/; do [ ! -e "$d/workflow-state.md" ] && echo "MISSING: $d"; done
MISSING: kaola-workflow/archive/bundle-429-434/
```

**Exactly one, out of 369 archive directories.** The hypothesis is the complete set.

### Widened sweep: name-collision pairs

Computed with the script's own `archiveNameMatchesProject` rule (`name === P`, `P.archived-*`,
`P.discarded-*`), over stems derived from all 369 names:

| Project stem | Members | State files | Shape |
|---|---|---|---|
| `bundle-429-434` | 2 | bare=**NO**, `.archived-2026-06-13T08-52-23-135Z`=YES | **residue pair — the only one** |
| `issue-500` | 2 | bare=YES (29 files), `.archived-2026-06-16T11-10-56-036Z`=YES (31 files) | two complete archives |
| `issue-725` | 5 | all 5 =YES (94/67/88/121/44 files) | five complete archives (the #725 epic's replans) |

Three ambiguous stems, but **only `bundle-429-434` has the residue shape**. `issue-500` and
`issue-725` are name collisions that would set `scope.archive_name_ambiguous` on a scoped run — they
are a *scoping* consideration, not drift, and the unscoped audit correctly reports neither. No other
pair of the same shape exists.

### VERDICT 2: **HOLDS in every particular** — one tracked file, no untracked file, no `workflow-state.md`, valid sibling, report-only class, sole instance. Two corrections: the line citation is stale, and **the residue's receipt is unique to the working tree** (recoverable from git history).

### Options for a human (I do not choose)

| Option | What it costs | What it loses / leaves |
|---|---|---|
| **A. Delete `kaola-workflow/archive/bundle-429-434/`** (`git rm -r`) | One commit removing one tracked file. | Working tree loses the only copy of that run's sink receipt. **Recoverable forever** at `4d857a23`. `archive_content_incomplete` drops to 0 in every clone. |
| **B. Move the receipt into the sibling first, then delete** — `git mv .../bundle-429-434/.cache/sink-receipt.json .../bundle-429-434.archived-2026-06-13T08-52-23-135Z/.cache/`, then remove the empty dir | One commit, two path changes. | Loses nothing at all: the receipt lands in the archive it belongs to (whose `.cache/` has no receipt), matching the 43 archives that carry one. Class clears. **This is the only option with zero information loss.** |
| **C. Reconstruct a `workflow-state.md` in the residue** (AC2's first branch) | Authoring a state file that describes no run — the sibling already holds the real one. | Class clears, but the archive corpus gains a fabricated record and the ambiguous pair stays ambiguous. The script's own comment (652-653) says a reconstruction cannot reproduce the frozen marker. |
| **D. Leave it; record the decision** (AC3's second branch) | Zero writes. | The class reports `bundle-429-434` in every clone forever. Satisfied only by writing the decision down somewhere durable. |

Note that A, B and C all mutate a **tracked** path, which is why #909 flags this as needing an
explicit call. B strictly dominates A on information preservation at the same cost.

---

## THE COMPLETE UNSCOPED AUDIT FINDING SET

`node scripts/kaola-workflow-closure-audit.js` (no flags, no `--execute`) — **exit 0, stderr empty**:

```json
{
  "dry_run": true,
  "offline": false,
  "drift": {
    "stale_roadmap_sources": [],
    "mirror_lists_closed_issues": [],
    "stale_in_progress_labels": [
      {
        "number": 796,
        "title": "Single-issue routing wording can mislead the agent: named-issue substitution, task-description survey override, bundle-primed vocabulary, scout residue",
        "url": "https://github.com/KaolaBrother/Kaola-Workflow/issues/796"
      }
    ],
    "active_folder_for_closed_issue": [],
    "unarchived_pr_folders": [],
    "archive_content_incomplete": [
      {
        "project": "bundle-429-434",
        "missing": [
          "workflow-state.md"
        ]
      }
    ],
    "archive_summary_citation_missing": [
      {
        "project": "bundle-440-441",
        "cited_missing": [
          ".cache/chain-receipt.json"
        ]
      },
      {
        "project": "bundle-513-514",
        "cited_missing": [
          ".cache/chain-receipt.json"
        ]
      },
      {
        "project": "issue-455",
        "cited_missing": [
          ".cache/doc-updater.md"
        ]
      },
      {
        "project": "issue-891",
        "cited_missing": [
          ".cache/chain-receipt.json"
        ]
      }
    ]
  },
  "counts": {
    "stale_roadmap_sources": 0,
    "mirror_lists_closed_issues": 0,
    "stale_in_progress_labels": 1,
    "active_folder_for_closed_issue": 0,
    "unarchived_pr_folders": 0,
    "archive_content_incomplete": 1,
    "archive_summary_citation_missing": 4
  }
}
```

**SIX findings across THREE classes. #909 names two of them.** The `unresolved_closed_state` key is
absent, meaning every remote probe resolved — nothing was skipped or timed out, so the report is a
measurement and not a partial one.

### THE CLASS #909 DOES NOT MENTION — `archive_summary_citation_missing` (4 findings)

This is `#901`'s detector: it reads each archive's `finalization-summary.md`, extracts bare-relative
`.cache/…` citations, and reports the ones that do not resolve inside that archive. **AC3 cannot be
met without adjudicating these four**, and #909's text does not acknowledge they exist. Each was
inspected:

**1. `bundle-440-441` — `.cache/chain-receipt.json` — REAL LOSS**

`finalization-summary.md` cites it twice, both times as positive evidence:

```
52:Chain receipt: `.cache/chain-receipt.json` (headSha: 05590e2f).
61:- chain-receipt: all 4 chains exit 0 — receipt at `.cache/chain-receipt.json`
```

`.cache/` holds `sink-receipt.json` and node artifacts but **no `chain-receipt.json`**. The summary
asserts a receipt at a path in its own archive and the bytes are gone.

**2. `bundle-513-514` — `.cache/chain-receipt.json` — REAL LOSS**

```
38:did not bite). HEAD-bound `.cache/chain-receipt.json` produced by `run-chains.js` over the final commit.
```

`.cache/` has 22 entries and **no receipt of any kind** (not even a `sink-receipt.json`). Same shape.

**3. `issue-455` — `.cache/doc-updater.md` — REAL LOSS**

Cited as Evidence in the compliance table:

```
84:| doc-updater | invoked | .cache/doc-updater.md (report) / docs diffs | |
85:| documentation docking | invoked | .cache/doc-docking.md | |
```

`.cache/` holds `code-reviewer.md`, `dispatch-log.jsonl`, `doc-docking.md`, `planner.md`,
`sink-receipt.json`, `tdd-guide.md`. **`doc-docking.md` is present; `doc-updater.md` is not** — and
the table lists them as two distinct rows, so this is not a rename. Genuine loss.

**4. `issue-891` — `.cache/chain-receipt.json` — FALSE POSITIVE, already adjudicated in code**

The summary says, in the sentence that contains the token:

```
54:The receipt landed at the repository-root `.cache/chain-receipt.json` because the run carried no
55:`--project` context, which is the path finalize probed and did not find.
```

That is prose *about where the receipt went* (repository root), not a claim it is in the archive.
The archive's `.cache/` holds only `origin`. This is **exactly** the case the detector's own comment
at `closure-audit.js:338-340` describes:

> `The fourth cites a receipt while naming, in the same sentence, the repository-root path it actually landed at — a prose mention is not a claim of presence, and no structural rule separates the two ... So this reports the citation and the operator adjudicates; it is never a verdict and never repairs.`

The live measurement reproduces the `#901` implementer's measurement exactly — **4 flagged, 3 real
losses, 1 known false positive** — so no new citation drift has appeared since that class shipped.
(Note this is the same #891 whose receipt landed at the repository root for want of `--project` —
the defect filed as **#910** in this bundle. This finding is that bug's fossil.)

### What would clear each finding

| Finding | Repairable by `--execute`? | What clears it |
|---|---|---|
| `stale_in_progress_labels` — #796 | **YES** (line 628, `gh issue edit --remove-label`) | Remove the label, or record it as intentional. |
| `archive_content_incomplete` — `bundle-429-434` | **NO** — report-only (line 653) | Delete the residue, relocate its receipt then delete, reconstruct a state file, or record the decision. |
| `archive_summary_citation_missing` × 4 | **NO** — report-only (lines 658-660) | Not repairable by any means: the cited bytes are gone. **Only a decision on record can clear these** — and for `issue-891` the correct decision is "false positive", already argued in the detector's own comment. AC3's second branch is the only route. |

**Consequence for AC3.** "Zero findings" is **unreachable** for this repository: three of the six are
lost bytes that nothing can rebuild. AC3 is therefore satisfiable only via its second branch — every
remaining finding a decision on record. That means #909's scope, as written, is short by four
findings.

---

## Mutation proof

`git status --short` — **byte-identical before and after** every command in this investigation:

```
?? kaola-workflow/bundle-904-905-906-907-908-909-910/
```

```
$ diff status-before.txt status-after.txt && echo IDENTICAL
IDENTICAL

$ git diff --stat HEAD
(empty)
```

**No tracked file changed.** `kaola-workflow/ROADMAP.md` hash unchanged at
`39f936baaac63fbd63823629d775bf7f79e6f460` before and after.

### One honest note on the content manifest

The 8310-file `shasum` manifest of `kaola-workflow/` was **not** byte-identical across the window.
Four lines differed, **all inside the untracked live run folder**
`kaola-workflow/bundle-904-905-906-907-908-909-910/`:

- `.cache/chain-receipt.json` — appeared, then was gone by the final check
- `.cache/premise-904.md` — appeared
- `mission-list.md` — content changed

These are **concurrent sibling agents in this session**, not the audit. Attribution:
`grep -n "chain-receipt" scripts/kaola-workflow-closure-audit.js` returns **zero matches** — the
audit script cannot produce that file; `chain-receipt.json` is written by `run-chains.js` and
friends. The folder is fully untracked (`git ls-files` on it returns 0 files). Nothing outside that
one untracked folder moved, and `git diff --stat HEAD` is empty.

My own only write is this file:
`/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/premise-909.md`

---

## Inferences (labelled — these are mine, not measurements)

1. **The residue is a two-writer path-derivation accident.** — confidence: **high**. Basis: the
   `[sink]` commit contains that file *alone*, and the archive relocation happened in a separate
   commit six minutes later under a different name convention; the script's own `#832` comment names
   this exact mechanism. Refuted by: any commit or script showing the bare path was created
   deliberately.
2. **Option B (relocate the receipt, then delete) loses nothing.** — confidence: **high**. Basis: the
   sibling archive verifiably has no `sink-receipt.json`, 43 other archives carry one at exactly that
   relative path, and both directories are already tracked. Refuted by: a consumer that reads
   `archive/<bare-name>/.cache/sink-receipt.json` by path — I did not search for one.
3. **`--execute` unscoped would leave `ROADMAP.md` byte-identical.** — confidence: **high**, but
   **UNVERIFIED**. Basis: `.roadmap/` holds no `issue-*.md` sources and the mirror already renders
   "No active work". Refuted by: any diff to `ROADMAP.md` after such a run. Verifying it requires
   performing the mutation, so I did not.
4. **AC3's "zero findings" branch is unreachable.** — confidence: **high**. Basis: three of six
   findings are unrepairable-by-construction lost bytes and the detectors are report-only in both
   modes. Refuted by: recovering the cited artifacts from git history and re-committing them into the
   archives — which I did **not** test for `bundle-440-441` / `bundle-513-514` / `issue-455`.

---

## Open (unmeasured, and why)

- **Whether the three genuinely-lost cited artifacts are recoverable from git history**, the way the
  residue receipt is. Not measured: it is a separate multi-archive history search, outside the two
  findings I was asked to verify, and it changes the *options* for a class #909 does not name. Worth
  a follow-up — if `bundle-440-441`'s `chain-receipt.json` was ever committed, inference 4 weakens.
- **Whether any code reads `archive/<bare-name>/.cache/sink-receipt.json`.** Not measured: it would
  need a repo-wide consumer search, and it only matters if Option A or B is chosen.
- **The `--execute` ROADMAP regeneration outcome.** Cannot be measured without mutating; I am
  read-only and it is a user decision either way.
- **Why `issue-796`'s archived state reads `step: start` / `last_result: folder_claimed`** despite
  `status: closed`. Noted above as an oddity; chasing it is a different investigation and does not
  bear on the label verdict.
