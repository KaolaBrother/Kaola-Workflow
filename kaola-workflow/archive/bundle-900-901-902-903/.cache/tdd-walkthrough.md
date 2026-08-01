# Walkthrough pins — #903 scoping (+ the #901 citation class)

Test custody: I authored these pins and wrote **no production code**. Write set actually touched:
`scripts/simulate-workflow-walkthrough.js` only — `717 insertions(+), 0 deletions(-)`, one file.
**No existing assertion was edited, relaxed or deleted.** Not committed.

Baseline for every red proof: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (v9.1.1), closure-audit
sha256[0:16] `4eede4d2ffcc9b15`, 382 lines. Shipped copy under test: `765282a2661a2a4d`, 724 lines.

---

## 0. Two corrections to the brief, stated first because they changed what I could do

**(a) The forge walkthrough paths in the brief do not exist.** `scripts/simulate-gitlab-workflow-walkthrough.js`
and `scripts/simulate-gitea-workflow-walkthrough.js` are not files in this repo. The real forge
walkthroughs are `plugins/kaola-workflow-{gitlab,gitea}/scripts/simulate-{gitlab,gitea}-workflow-walkthrough.js`
(959 / 1044 lines) and they contain **zero closure-audit coverage** — no `runClosureAudit`, no
reference to any closure-audit script. Measured:

| suite | lines | `runClosureAudit` refs |
|---|---|---|
| `scripts/simulate-workflow-walkthrough.js` | 11799 | 26 |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (codex) | 1959 | 0 |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | 959 | 0 |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | 1044 | 0 |

The forge closure-audit coverage lives instead in
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:57,237-264` and
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:54,213-240` — **files no agent in
my brief owns**. See §5 for the consequence.

**(b) `scenario((` does not appear in this file.** The registration idiom is `add('name', fn)` inside
`buildRegistry()` (`:10001`). Ordinals below were computed from the actual runner (`ordinal 0` = the
shared-tmp group, then non-shared-tmp entries in registry order). `--only <prefix>` also works and is
cheaper than `--shard N/999999`; I used `--only` throughout.

---

## 1. Pins added — 13 scenarios, all 11 items of impl-903 §8

Registered at `scripts/simulate-workflow-walkthrough.js:10143-10155`, bodies at `:8219-8918`.

| # | ordinal | scenario | §8 item |
|---|---|---|---|
| S1 | 133 | `testClosureAuditProjectScopePartitions903` | 1 (+ exact envelope key sets) |
| S2 | 134 | `testClosureAuditRejectsUnknownFlagAndHelp903` | 3 |
| S3 | 135 | `testClosureAuditMistypedProjectExitsOne903` | 2 |
| S4 | 136 | `testClosureAuditScopedCleanIsFailClosed903` | 4 |
| S5 | 137 | `testClosureAuditBundleMemberArchiveClosed903` | 5a + the unscoped-`--execute` breadth ruling |
| S6 | 138 | `testClosureAuditBundleMemberClosurePolicyNegative903` | 6 |
| S7 | 139 | `testClosureAuditBundleMemberActiveFolderClosed903` | 5b |
| S8 | 140 | `testClosureAuditScopedExecuteSparesOtherProjects903` | 7 |
| S9 | 141 | `testClosureAuditCitationMissingOmittedWhenEmpty903` | 8 |
| S10 | 142 | `testClosureAuditCitationMissingReportsAndExcludesJsonl903` | 9 |
| S11 | 143 | `testClosureAuditScopingHelpers903` (unit, no spawn) | 10 |
| S12 | 144 | `testClosureAuditScopedArchiveNameMatch903` | 11 (`name_match`, no bare prefix, unscoped carries none) |
| S13 | 145 | `testClosureAuditScopedArchiveAmbiguousMatch903` | 11 (`ambiguous_name_match`) |

Three local helpers added beside them: `plantArchive903` (an archive with or without its identity
anchor), `appendStateField903` (`plantActiveFolder` writes only the scalar primary), and
`runClosureAuditRaw` — the direct `spawnSync` the exit-1 and `--help` cases need, because
`runClosureAudit` (`:1746`) and `runClosureAuditOffline` (`:1768`) `assert(status === 0)` and
`JSON.parse` stdout unconditionally.

### Beyond §8, and why

- **Exact top-level key sets** for all four envelopes (unscoped dry-run, unscoped `--execute`, scoped
  dry-run, scoped `--execute`), plus the exact `drift` key list and order and `counts` mirroring it.
  Premise §8 recorded that **no test asserted an exact key set**, so a new key could appear in the
  default report unnoticed — which is exactly the "byte-identical unscoped" claim the brief asked me
  to pin, expressed in the only form a single-version suite can express it. This also covers
  `driftCounts`, which §8 judged not worth its own test (mutation M21 confirms).
- **Backticks not required** (S10): a measured true positive in this repo's corpus is an unbackticked
  table cell. Requiring backticks reads tidier and silently drops it.
- **Over-report controls** in S7 (a bundle with no closed member), S10 (an archive with no summary at
  all) and S9 (a complete archive produces no archive drift of either class).

### Deliberately NOT pinned about the #901 detector

The brief says pin the measured behaviour, not an idealised one, and do not write a pin that would
force the ~25% false-positive rate away. I therefore pinned only: report-only, omit-when-empty,
`.jsonl` excluded, backticks not required, and no-summary-stays-quiet. **No pin asserts that a prose
mention of an alternate path is not reported** — that is the accepted false-positive mode, and a pin
against it would be a demand for machinery the owner declined.

---

## 2. Baseline-red proof

Method: `git archive 9b68b096 | tar -x` into `<scratch>/base`, then overlay **only** my walkthrough
file. Nothing in the worktree was reverted — siblings have uncommitted work here.
Scratch: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/tddwalk/`

**11 of 13 red on the baseline.** Each run individually via `--only`, exit code from `$?` directly.

```
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b (closure-audit 4eede4d2ffcc9b15, 382 lines)

RED  testClosureAuditProjectScopePartitions903        exit=1
     Error: #903: the scoped dry-run envelope must carry the scope, the verdict, both halves and both
     count objects, got: ["dry_run","offline","drift","counts"]
       ^ the regression itself: --project produced the UNSCOPED envelope.
RED  testClosureAuditRejectsUnknownFlagAndHelp903     exit=1
     Error: #903: an unknown flag must exit 1 — it was silently absorbed and answered with the full
     report before, got 0
RED  testClosureAuditMistypedProjectExitsOne903       exit=1
     TypeError: Cannot read properties of undefined (reading 'issue_numbers')   [no scope block]
RED  testClosureAuditScopedCleanIsFailClosed903       exit=1
     Error: #903 control: a scoped project with zero drift and every class EVALUATED must read
     clean:true, got undefined drift: undefined
RED  testClosureAuditBundleMemberArchiveClosed903     exit=1
     Error: #903: a bundle MEMBER's stale roadmap source must be flagged too — archiveClosedIssues
     read only the scalar issue_number, so 701 was invisible, got: [{"issue_number":700,…}]
RED  testClosureAuditBundleMemberActiveFolderClosed903 exit=1
     Error: #903: a bundle folder whose MEMBER 801 is closed must be reported naming 801 …
     got: [{"project":"issue-804",…}]
RED  testClosureAuditScopedExecuteSparesOtherProjects903 exit=1
     Error: #903: the scoped --execute envelope must swap the current_project_* keys for
     repaired/reported_not_repaired, got: ["dry_run","offline","repaired","reported_not_repaired"]
RED  testClosureAuditCitationMissingReportsAndExcludesJsonl903 exit=1
     Error: #901: a cited-but-absent artifact must be reported as archive_summary_citation_missing,
     got drift: {…no such key…}
RED  testClosureAuditScopingHelpers903                exit=1
     TypeError: archiveNameMatchesProject is not a function      [not exported pre-#903]
RED  testClosureAuditScopedArchiveNameMatch903        exit=1
     TypeError: Cannot read properties of undefined (reading 'archive_content_incomplete')
RED  testClosureAuditScopedArchiveAmbiguousMatch903   exit=1
     TypeError: Cannot read properties of undefined (reading 'archive_name_ambiguous')
```

### The two that CANNOT red on the baseline, and why that is structural

```
GREEN  testClosureAuditBundleMemberClosurePolicyNegative903      exit=0 on baseline
GREEN  testClosureAuditCitationMissingOmittedWhenEmpty903        exit=0 on baseline
```

Both assert an **absence**, and the baseline has nothing to be absent. S6 asserts a `partial`-policy
member is *not* flagged — true on the baseline for the wrong reason (no member expansion exists at
all). S9 asserts the citation class is omitted when empty — vacuously true where the class does not
exist. A baseline red is unobtainable for either **by construction**, not by weak authoring: they
guard against a *future* deletion inside the new machinery. Their arming therefore rests entirely on
mutation (M6, M7, M7c below), which is why I ran those first.

---

## 3. Positive / mutation controls — every pin, mutated on a scratch mirror

Harness `<scratch>/mutate.js`: for each mutation, rebuild `<scratch>/mut` from `<scratch>/new`
(baseline tree + shipped closure-audit + my walkthrough), apply **one** edit, run the named
scenarios. The harness rejects a non-unique or missing anchor rather than silently no-op-ing.
**Never `git checkout --`** — reverting in the worktree would destroy sibling work.

| id | mutation | scenario(s) | result |
|---|---|---|---|
| M1 | `scopePredicate` → `() => true` | S1, S12 | **RED** |
| M2 | `parseArgs` unknown-flag `throw` → `continue` | S2 | **RED** |
| M3 | `if (args.help)` early return disabled | S2 | **RED** (`--help must print usage on STDOUT, got: {`) |
| M4 | `resolveScope`'s unresolvable-`--project` assert neutered | S3 | **RED** (`must exit 1, got 0`) |
| M5 | `driftIsClean` ignores non-array (the naive "written backwards" form) | S4, S11 | **RED** (`got: true`) |
| **M6** | `closure_policy` check deleted (always `stateIssueNumbers`) | **S6** | **RED** |
| **M7** | citation class assigned unconditionally in `buildAuditReport` | **S9** | **RED** (`got: []`) |
| M7b | `reported_not_repaired` citation guard removed | S9 | **GREEN — invalid mutation, see below** |
| **M7c** | same, but `… \|\| []` so the value is JSON-visible | **S9** | **RED** |
| M8 | scoped `--execute` fed the whole report instead of `inScope` | S8 | **RED** (`got: [556,704,705]`) |
| M9 | `archiveNameMatchesProject` → `name.startsWith(project)` | S11, S12 | **RED** |
| M10 | `.jsonl` extension test unanchored (`$` dropped) | S10 | **RED** (`issue-923` flagged) |
| M11 | citation regex requires a backtick prefix | S10 | **RED** (`issue-922` lost) |
| M12 | `annotateAttribution` → `return finding` | S12, S13 | **RED** |
| M13 | `archiveNameIsAmbiguous` → `return false` | S13 | **RED** |
| M14 | candidate set drops `folders.reduce(… issue_numbers …)` | S7 | **RED** |
| M15 | `detectActiveClosedFolders` member arm deleted | S7 | **RED** |
| M16 | `archiveClosedIssues` reads the scalar primary only | S5 | **RED** |
| M17 | a skipped class placed in the in-scope half only | S4, S11 | **RED** (`got: undefined`) |
| M18 | `archive_name_ambiguous` emitted unconditionally | S1, S12 | **RED** |
| M19 | an extra key added to the unscoped dry-run envelope | S1 | **RED** |
| M20 | scoped `--execute` also emits `current_project_clean` | S8 | **RED** |
| M21 | `driftCounts` drops a key for a non-array class | S1 | **RED** |

**M7b is not a valid mutation, and this is worth recording.** Removing
`if (report.drift.archive_summary_citation_missing)` from `executeRepairs` (`:630`) assigns
`undefined`, and `JSON.stringify` **omits keys whose value is `undefined`** — so the mutation is
unobservable through stdout and no CLI-level test can red it. M7c (`… || []`) makes the value
JSON-visible and reds the pin immediately, proving the assertion is armed. Consequence for the
implementation: **that particular `if` is not load-bearing** — `JSON.stringify` already does the
omission. It documents intent; it is not the mechanism. Not a defect.

### Explicit `KAOLA_WORKFLOW_OFFLINE`, per the brief's warning

The trap named in my brief is real and I avoided it in both directions:

- S4's `clean:true` **positive control** runs through `runClosureAudit` (`:1757`), which sets
  `KAOLA_WORKFLOW_OFFLINE: '0'` explicitly. Had it inherited `'1'`, `stale_in_progress_labels` and
  `unarchived_pr_folders` would have been `'skipped_offline'`, `clean` would have been `false`, and
  **the control would have agreed with the fail-closed leg for the wrong reason** — leaving an
  always-false verdict indistinguishable from the real one.
- `runClosureAuditRaw` sets `KAOLA_WORKFLOW_OFFLINE: '1'` explicitly rather than inheriting, so what
  the argv pins ran under is stated rather than ambient. Every assertion there is decided before any
  remote call (`parseArgs` throws before `getRoot()`; `resolveScope` throws before `buildAuditReport`).

### Arming and coverage proved separately

Arming: the 24 mutation rows above — each names the one edit and the assertion that caught it.
Coverage: the full-scope run in §4 shows all 13 pins actually **executed** (13 `…903: PASSED` lines),
not merely registered. A green suite alone would prove neither.

---

## 4. Suite results — real exit codes, `echo $?` directly, never through a pipe

| what | tree | exit |
|---|---|---|
| `simulate-workflow-walkthrough.js --only testClosureAudit` (36 scenarios: 23 existing + 13 new) | `<scratch>/new` = baseline + shipped closure-audit **only** | **0** |
| `simulate-workflow-walkthrough.js` **FULL SCOPE** | the worktree, incl. all sibling edits | **0** — `{"scenarios":197,"ran":197,"passed":197,"failed":0}`, 2052 spawns |
| `validate-script-sync.js` | worktree | **0** |
| `test-kernel-conformance.js` | worktree | **0** (254 assertions) |

Full scope, not the 1/12 fast-gate shard. 197 = 184 before + my 13. All 23 pre-existing closure-audit
scenarios pass unchanged — I red no existing pin, and I edited none.

Suites were run **serially**. The one full-scope run I attempted in the isolated scratch mirror
exited 1 on `testContractValidatorMissingTag` — **environmental, not mine**: `git archive | tar -x`
output is not a git repository, and that scenario reds identically on the **pristine** baseline
mirror with no closure-audit change at all (verified, exit 1). The worktree run above is the
authoritative full-scope result.

---

## 5. §8 items I did NOT write, and things found

### Everything in §8 is written. Nothing from that list was skipped.

### Not mine to write, with the reason

- **#900's pins** (impl-900 §8 items 1-7 — the `record` verb's consumer leg, producer==gate parity,
  linked-worktree binding, `renderFinalValidationRecord` unit, column-zero, typed exits). impl-900
  itself names `test-finalize-door.js` beside T7 as the alternative home, and every item is a
  validation-runner / finalize-door surface. Those files belong to the sibling `tdd-guide`.
- **#902's pins** (impl-902 §8 items 1-7) are entirely `test-claim-hardening.js` — the `mk837`/`mk816`/
  `mk941` fixtures and `runFinalize816`/`runFinalize837`. Same sibling.
- **#901's five pins** are `test-sink-merge.js` and the forge `test-*-sinks.js`. Note impl-901's item 5
  (the claim-side disposal gate) says it needs a **new `KAOLA_WORKFLOW_FORCE_*` env seam** and that
  "adding one is a design call I did not make unilaterally." I have not made it either: inventing a
  production seam is production code and a design decision, both outside test custody. **It needs an
  owner ruling before anyone writes that pin.**

### Findings — reported, not fixed

1. **`test-spawn-classification.js` is RED in the worktree, and it is not mine.** Two violations:
   `scripts/test-sink-merge.js` 4 unclassified sites vs a ceiling of 3 (line 2111 is the new one), and
   `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` 54 vs a ceiling of 52 (lines 1913,
   2078). Attribution is exact: the same checker **passes** on the pristine `9b68b096` tree with only
   my walkthrough overlaid (`spawn-classification passed … 592 spawn sites across 60 files`), and both
   flagged files are ` M` from the sibling sink-tests agent. The fix is to annotate the new sites
   `// spawn-class: …`; the checker says explicitly that raising the ceiling is not a fix. My own new
   spawn site is annotated and the walkthrough is not flagged.
2. **The forge ports' scoped `main()` has no end-to-end coverage anywhere, and no assigned owner.**
   impl-903 §9 states plainly that the gitlab/gitea scoped `main()` "has **never been run**
   end-to-end". The suites that could run it — `test-{gitlab,gitea}-workflow-scripts.js` — are in no
   agent's write set in my brief, and the forge *walkthroughs* have no closure-audit harness to extend.
   Per `feedback_no_cross_edition_coverage_comparison`, my canonical pins do **not** cover the ports:
   each edition's suite defends its own copy. 13 pins protect the canonical scoping surface and
   **zero** protect either port's. This is the largest remaining hole in this bundle's test coverage.
3. **The residue impl-903 §7 flagged is still there** (both forge ports' `archiveRequiredContent`
   carries the retired Node-Ledger mechanism and a lazy `require` of a `listRecordedNodeEvidence` that
   no longer exists). I did not write a pin against it: **a test is deleted with its mechanism, never
   repaired ahead of it**, and pinning dead code would pin it in place. It needs deleting or a ruling.
4. **`--project <name>.archived-<ts>` passed directly** remains untested, as impl-903 §9 says.
   `archiveNameMatchesProject` matches it exactly so it should work; I judged a pin for an
   un-measured invocation form to be a mechanism no observed failure demands.

---

## Artifacts

`<scratch>/tddwalk/` — `base/` (pristine `9b68b096` + my walkthrough), `new/` (+ shipped
closure-audit), `mutate.js`, `mutations.log`, `new-green.log`, `full-worktree-final.log`,
`full-isolated.log`.
