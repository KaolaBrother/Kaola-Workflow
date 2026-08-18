# Implementation — #1004 fill-if-empty summary sections

**Task**: make `appendSummarySection` fill a pre-planted heading whose body is empty, in place, and
leave a heading carrying content exactly as written; `replace: true` unchanged. Port to all four
claim.js copies; correct the prose the change falsifies.

**Verification tier**: `tests-green` — the authored suite (`scripts/test-finalize-door.js` T17a/b/c
and the walkthrough pin `testFillIfEmptySummarySectionPortedToAllEditions1004`) passes. I authored
none of it.

**Worktree**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004`

---

## Files changed (6)

| file | change |
|---|---|
| `scripts/kaola-workflow-claim.js` | writer + 3 comment blocks |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | same, byte-identical to canonical |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | same (hand-port, own offsets) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same (hand-port, own offsets) |
| `scripts/kaola-workflow-sink-merge.js` | 1 comment block |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | same comment, byte-identity mirror |

`git diff --stat` over exactly those six: `160 insertions(+), 80 deletions(-)`.

Nothing else in my write set was touched. `CHANGELOG.md` and `docs/api.md` also show modified in the
worktree — **those are not mine**, they appeared during my run (another agent), and I preserved them.
`scripts/test-finalize-door.js` and `scripts/simulate-workflow-walkthrough.js` were modified before I
started and I never wrote to either.

---

## The code change (identical in all four claim.js copies)

```diff
     const existing = s.match(new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
+    const block = [heading, ''].concat(lines).join('\n') + '\n';
     if (existing) {
-      if (!replace) return false;
-      // Cut the heading through to the next `## ` heading (never a `### ` sub-heading, which is
-      // three hashes and so cannot match) or to end of file.
+      // The section runs from its heading to the next `## ` heading (never a `### ` sub-heading,
+      // which is three hashes and so cannot match) or to end of file.
       const after = s.indexOf('\n## ', existing.index + heading.length);
+      if (!replace) {
+        // Fill-if-empty, SPLICED WHERE IT SITS. Cutting the section and letting the tail of this
+        // function re-append it would also fill the heading, and would move it below every heading
+        // that followed it; the document order is the orchestrator's, not this writer's.
+        const end = after < 0 ? s.length : after + 1;
+        if (s.slice(existing.index + heading.length, end).trim() !== '') return false;
+        const tail = s.slice(end);
+        writeFile(p, s.slice(0, existing.index) + block + (tail ? '\n' + tail : ''));
+        return true;
+      }
+      // Cut the heading through to the end of its section, and re-append at the tail below.
       s = s.slice(0, existing.index) + (after < 0 ? '' : s.slice(after + 1));
       if (!s.trim()) s = '';
     }
-    const block = [heading, ''].concat(lines).join('\n') + '\n';
     writeFile(p, s ? (s.trimEnd() + '\n\n' + block) : block);
```

It is the hoist the brief described: `after` moved above the early return and reused; `block` hoisted
so the fill branch can write it. No second scan, no second read, no new argument. The `replace: true`
path is byte-unchanged in effect — it still cuts and re-appends at the tail, so it still relocates.

Four states, as required: heading absent -> falls through to the unchanged tail append; heading
present with empty body (`''` or `'\n'` or any whitespace) -> spliced in place; heading present with
content -> `return false`, file untouched; `replace: true` -> untouched.

---

## Comments rewritten

**1. `scripts/kaola-workflow-claim.js:3929-3946`** (the block above the writer). The false clause
("every other caller is byte-identical to before") is gone; "idempotent ... (the heading is checked
first)" became "(a section already carrying content is left exactly as written)"; the #938 paragraph
now says what `replace` alone does — relocate to the tail — and a new #1004 paragraph states the
rule:

> `#1004: idempotence is by CONTENT, not by heading. Step 6 of the finalize surface tells the
> orchestrator to pre-create ## Validation, ## Changed Paths and ## Mission List, so keying on the
> heading meant an obedient run computed all three findings and then dropped them — 15, 17 and 3
> empty sections in this repository's own 157 archived summaries. A heading whose body is blank is
> the finding's own slot and gets FILLED where it sits; a heading whose body carries prose is the
> operator's record and is never overwritten.`

**2. `scripts/kaola-workflow-claim.js:4251-4258`** (#907 accumulator rationale) — "idempotent BY
HEADING" became "idempotent BY CONTENT (#1004)", and the consequence was restated to stay true:
a per-fault write would "land the first fault and then decline over the section it had just filled,
silently dropping every one after it".

**3. `scripts/kaola-workflow-claim.js:5218-5221`** (the `residue_stage_failed` site) — "idempotent by
heading" became "idempotent by content (#1004), so a second fault in the same run would have found
the section already filled and been silently dropped."

**4. `scripts/kaola-workflow-sink-merge.js:264-271`** — the analogy was false after this change, so
the shared property (swallow-on-error) is kept and the divergence is named:

> `## Sink Findings sits in the same finalization-summary.md, under the same swallow-on-error
> discipline as the ## Validation and ## Changed Paths sections the finalize report writes there — a
> measurement writer must never be able to fail the operation it reports on. It parts company with
> them on idempotence: this one is guarded on the HEADING's presence, where those two are guarded on
> the CONTENT under it (#1004) — the finalize Step 6 skeleton pre-creates their headings bare, so a
> presence guard there dropped the finding. Nothing pre-creates ## Sink Findings, and one caller
> writes it once.`

Issue numbers appear only in in-source comments, matching the surrounding convention. No prompt
surface was touched.

---

## Per-copy landing

| copy | `appendSummarySection` | `#1004` comment | fill branch | #907 site | residue site |
|---|---|---|---|---|---|
| `scripts/kaola-workflow-claim.js` | 3947 | 3941 | 3959 | 4254 | 5220 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 3947 | 3941 | 3959 | 4254 | 5220 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 3724 | 3718 | 3736 | 4030 | 4927 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 3721 | 3715 | 3733 | 4027 | 4923 |

Byte-identity, measured with `cmp` (exit 0 = identical):

- `scripts/kaola-workflow-claim.js` vs `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` -> `0`
- `scripts/kaola-workflow-sink-merge.js` vs `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` -> `0`

---

## Verification

Each exit code read directly from `$?`, never after a pipe.

| command | before | after |
|---|---|---|
| `node scripts/test-finalize-door.js` | exit **1** — `FAILED (16 failures, 830 passed)` = 846 total | exit **0** — `finalize-door tests passed (846 assertions)` |
| `node scripts/simulate-workflow-walkthrough.js --only testFillIfEmptySummarySectionPortedToAllEditions1004` | exit **1** — `#1004 port guard: scripts/kaola-workflow-claim.js — a ## Validation heading planted by Step 6 with NOTHING under it must be FILLED` | exit **0** — `PASSED` |
| `node scripts/validate-script-sync.js` | exit **0** | exit **0** — 14 common scripts, 27 byte-identical groups in sync |
| `node scripts/generate-routing-surfaces.js --check` | exit **0** | exit **0** — all 18 surfaces byte-match |

846 assertions at exit 0 — the number the test author measured against a correct candidate.

### Beyond the four (regression sweep, all exit 0 after)

`node scripts/test-sink-merge.js`, `test-run-chains.js`, `test-route-reachability.js`,
`test-generate-routing-surfaces.js`, `validate-workflow-contracts.js` — the five other suites that
mention `appendSummarySection` / `## Validation` / `## Sink Findings`.

Walkthrough subset, exit 0: `testArchiveIntegrityPortedToAllEditions832`,
`testStaleDiagnosticsPortedToAllEditions1002`, `testSinkPrUsesFinalizationSummary`,
`testFinalizeReportsMissionListOutcomeWithoutDone`, `testFinalizeNullFolderFallbackReadsArchive`.

### Mutation proof of the two hand-ports

Byte-snapshotted, mutated one at a time (the fill branch reverted to `if (!replace) return false;`),
pin re-run, file restored from the snapshot and `cmp`-verified back to `0`:

- gitea mutant -> pin exit **1**, named `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- gitlab mutant -> pin exit **1**, named `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

So the port pin is armed per copy, and each hand-port carries the behaviour rather than riding on
another copy's green.

---

## Deliberately NOT touched

- **`plugins/kaola-workflow-gitlab/.../kaola-gitlab-workflow-sink-merge.js:209-211` and the gitea
  twin** — they carry a stale variant of the comment naming a `## Attestation` section that exists
  nowhere. Pre-existing rot, out of scope per the brief, left as found.
- **`scripts/test-finalize-door.js` and `scripts/simulate-workflow-walkthrough.js`** — another role's
  custody. Read and run only.
- **`CHANGELOG.md`, `docs/api.md`** — modified by another agent during my run; preserved untouched.
- **No commit, no `git add`.** Working tree left dirty for the orchestrator.
- `npm test` / `run-chains` not run — the orchestrator's at finalize.

## Cut deliberately

The fill path does not normalize blank runs in the text *preceding* the heading it fills; it splices
at `existing.index` and keeps the prefix verbatim. Only the section being filled is rewritten. If a
future caller needs the whole file normalized, that is a different job and would force this to change.
