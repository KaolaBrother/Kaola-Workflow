# Forge closure-audit pins — #903 scoping (+ the #901 citation class) on the GitLab and Gitea ports

Test custody: I authored these pins and wrote **no production code**. Write set actually touched:

```
plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js  | 726 +++++++++
plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js    | 726 +++++++++
2 files changed, 1452 insertions(+), 0 deletions(-)
```

**Zero deletions** — no existing assertion was edited, relaxed or deleted. Not committed.

Baseline for every red proof: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (v9.1.1). Both port
closure-audit scripts were **401 lines** there; the shipped copies under test are **739 lines** each.
Both test files were **byte-identical to the baseline** before I touched them (sha256
`eadf48103ff451e1…` for the gitlab suite), so the overlay proof below is apples-to-apples.

---

## 0. The home is confirmed, not corrected

The brief's claim holds, verified by grep across both plugin `scripts/` trees:

| suite | closure-audit references |
|---|---|
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | the script path (`:57`), `runClosureAudit`/`runClosureAuditOffline`/`closureAuditShim` (`:237-272`), 20 scenarios |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | same shape at `:54`, `:213-248`, 20 scenarios |
| `plugins/kaola-workflow-{gitlab,gitea}/scripts/simulate-*-workflow-walkthrough.js` | **zero** — no harness to extend |
| `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-*-sinks.js`, `test-*-run-chains.js`, `test-*-forge-helpers.js` | **zero** |

Those two files are the only place forge closure-audit coverage exists. No write-set expansion needed.

---

## 1. Pins added — 13 per edition, mirroring the canonical set item-for-item

Registered in each file's own straight-line invocation list (gitlab `:3527-3539`, gitea `:3332-3344`),
immediately after the existing `testClosureAudit*` block. Same names in both editions, so the three
suites stay comparable by reading.

| # | scenario | impl-903 §8 item |
|---|---|---|
| P1 | `testClosureAuditProjectScopePartitions903` | 1 (+ exact envelope key sets, both dry-run shapes) |
| P2 | `testClosureAuditRejectsUnknownFlagAndHelp903` | 3 |
| P3 | `testClosureAuditMistypedProjectExitsOne903` | 2 |
| P4 | `testClosureAuditScopedCleanIsFailClosed903` | 4 |
| P5 | `testClosureAuditBundleMemberArchiveClosed903` | 5a + the unscoped-`--execute` breadth ruling |
| P6 | `testClosureAuditBundleMemberClosurePolicyNegative903` | 6 |
| P7 | `testClosureAuditBundleMemberActiveFolderClosed903` | 5b |
| P8 | `testClosureAuditScopedExecuteSparesOtherProjects903` | 7 (+ the scoped `--execute` key set) |
| P9 | `testClosureAuditCitationMissingOmittedWhenEmpty903` | 8 |
| P10 | `testClosureAuditCitationMissingReportsAndExcludesJsonl903` | 9 |
| P11 | `testClosureAuditScopingHelpers903` (in-process, no spawn) | 10 |
| P12 | `testClosureAuditScopedArchiveNameMatch903` | 11 (`name_match`, no bare prefix, unscoped carries none) |
| P13 | `testClosureAuditScopedArchiveAmbiguousMatch903` | 11 (`ambiguous_name_match`) |

Four local helpers beside them, per file: `GL_DRIFT_KEYS_903` / `GT_DRIFT_KEYS_903` (this edition's
drift key list, in insertion order), `assertKeys903`, `plantArchive903` (with `{anchor:false}` for the
identity-anchor-less folder), `plantArchiveSummary903`, and **`runClosureAuditRaw`** — the direct
`spawnSync` the exit-1 and `--help` cases need, because `runClosureAudit` (`gitlab:238`) and
`runClosureAuditOffline` (`gitlab:257`) both `assert(status === 0)` and `JSON.parse` stdout
unconditionally and so cannot observe either case.

### Forge divergence is pinned as divergence, never "fixed" into canonical wording

`GL_DRIFT_KEYS_903` carries `unarchived_mr_folders` and `GT_DRIFT_KEYS_903` carries
`unarchived_pr_folders`; P11 asserts each edition's own folder class is matched by the **shape-based
default arm** of `scopePredicate` (so neither needs a key of its own). `docs/api.md:886-890`'s
merge-request vocabulary is preserved verbatim. The gitea suite's shims use `issues view`/`issues
list` (its CLI's argv) and the gitlab suite's use `issue view`/`issue list`; archive fixtures write
`issue_iid` in both, matching each file's existing D4 convention.

### Deliberately NOT pinned about the #901 detector

Only the **measured** behaviour: report-only, omit-when-empty, `.jsonl` excluded and never truncated
to `.json`, backticks not required, an archive with no summary stays quiet. **No pin asserts that a
prose mention of an alternate path goes unreported** — that is the accepted ~25% false-positive mode,
and a pin against it would demand machinery the owner declined.

---

## 2. Baseline-red proof — 11 of 13 red, per edition

Method: `git archive 9b68b096 | tar -x` into `<scratch>/base`, then overlay **only** my test file.
**Nothing in the worktree was reverted** — four siblings have uncommitted work there.

The forge suites are straight-line statement lists with no `--only` filter, so `run-one.js` applies a
purely mechanical transform to the **shipped** file: every column-zero bare `name();` invocation is
commented out, the trailing promise chain is truncated, and the single target invocation is appended.
Every pin body and assertion message is byte-identical to what ships; only the invocation list
changes. The harness refuses a target it cannot find in the shipped file.

```
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b   (both ports: closure-audit 401 lines)

RED  testClosureAuditProjectScopePartitions903
     AssertionError: #903: the scoped dry-run envelope must carry exactly these keys in this order,
     got: ["dry_run","offline","drift","counts"]
       ^ the regression itself: --project produced the UNSCOPED envelope.
RED  testClosureAuditRejectsUnknownFlagAndHelp903
     AssertionError: #903: an unknown flag must exit 1 — it was silently absorbed and answered with
     the full report before, got 0
RED  testClosureAuditMistypedProjectExitsOne903
     AssertionError: #903: a --project that resolves to no workflow-state.md must exit 1, never
     answer clean, got 0
RED  testClosureAuditScopedCleanIsFailClosed903
     AssertionError: #903 control: a scoped project with zero drift and every class EVALUATED must
     read clean:true, got: undefined drift: undefined
RED  testClosureAuditBundleMemberArchiveClosed903
     AssertionError: #903: a bundle MEMBER's stale roadmap source must be flagged too … got:
     [{"issue_number":700,"file":"kaola-workflow/.roadmap/issue-700.md","reason":"archive_closed"}]
RED  testClosureAuditBundleMemberActiveFolderClosed903
     AssertionError: #903: a bundle folder whose MEMBER 801 is closed must be reported ONCE, naming
     801 … got: [{"project":"issue-804","issue_number":804,"dirty":true}]
RED  testClosureAuditScopedExecuteSparesOtherProjects903
     AssertionError: #903: the scoped --execute envelope must carry exactly these keys in this order,
     got: ["dry_run","offline","repaired","reported_not_repaired"]
RED  testClosureAuditCitationMissingReportsAndExcludesJsonl903
     AssertionError: #901: a cited-but-absent artifact must be reported as
     archive_summary_citation_missing, got drift: [... no such key ...]
RED  testClosureAuditScopingHelpers903        TypeError: ca.parseArgs is not a function
RED  testClosureAuditScopedArchiveNameMatch903
     TypeError: Cannot read properties of undefined (reading 'archive_content_incomplete')
RED  testClosureAuditScopedArchiveAmbiguousMatch903
     TypeError: Cannot read properties of undefined (reading 'archive_name_ambiguous')

GREEN ON BASELINE  testClosureAuditBundleMemberClosurePolicyNegative903     exit=0
GREEN ON BASELINE  testClosureAuditCitationMissingOmittedWhenEmpty903       exit=0
```

Identical results for both editions (`<scratch>/baseline-gitlab.log`, `<scratch>/baseline-gitea.log`);
only the drift key name differs in P10's failure text (`unarchived_pr_folders` on gitea).

### The two that CANNOT red on the baseline, and why that is structural

Both assert an **absence**, and the baseline has nothing to be absent. P6 asserts a `partial`-policy
member is *not* flagged — true on the baseline for the wrong reason, because no member expansion
exists there at all. P9 asserts the citation class is omitted when empty — vacuously true where the
class does not exist. A baseline red is unobtainable for either **by construction**: they guard a
future deletion inside the new machinery. **Their arming rests entirely on mutation, so I ran those
mutations FIRST** — M6, M7 and M7c below — before writing anything else about them.

---

## 3. Positive / mutation controls — 22 mutations, each RED, on BOTH editions

Harness `<scratch>/mutate.js`: apply **one** anchored edit to the port's closure-audit inside
`<scratch>/new` (= baseline tree + the two shipped port closure-audit files), run the named pin(s),
then restore the pristine copy by an **exact inverse write** — never `git checkout --`, which would
have destroyed sibling work. The harness **rejects** a missing or non-unique anchor rather than
silently no-op-ing, and it re-verifies byte-identical restoration at the end (it did, both runs).

| id | mutation | pin(s) | gitlab | gitea |
|---|---|---|---|---|
| M1 | `scopePredicate` → `() => true` | P1, P12 | RED | RED |
| M2 | `parseArgs` unknown-flag `throw` → `continue` | P2 | RED | RED |
| M3 | the `--help` early return disabled | P2 | RED | RED |
| M4 | `resolveScope`'s unresolvable-`--project` assert neutered | P3 | RED | RED |
| M5 | `driftIsClean` ignores non-array (the naive "written backwards" form) | P4, P11 | RED | RED |
| **M6** | the `closure_policy` check deleted (always `stateIssueNumbers`) | **P6** | RED | RED |
| **M7** | the citation class assigned unconditionally in `buildAuditReport` | **P9** | RED | RED |
| **M7c** | `reported_not_repaired` citation guard removed (`… \|\| []`, so JSON-visible) | **P9** | RED | RED |
| M8 | scoped `--execute` fed the whole report instead of `inScope` | P8 | RED | RED |
| M9 | `archiveNameMatchesProject` → `name.startsWith(project)` | P11, P12 | RED | RED |
| M10 | the `.jsonl` exclusion unanchored (`$` dropped) | P10 | RED | RED |
| M11 | the citation regex requires a backtick prefix | P10 | RED | RED |
| M12 | `annotateAttribution` → `return finding` | P12, P13 | RED | RED |
| M13 | `archiveNameIsAmbiguous` → `return false` | P13 | RED | RED |
| M14 | the candidate set drops `folders.reduce(… issue_numbers …)` | P7 | RED | RED |
| M15 | `detectActiveClosedFolders`' member arm deleted | P7 | RED | RED |
| M16 | `archiveClosedIssues` reads the scalar primary only | P5 | RED | RED |
| M17 | a skipped class placed in the in-scope half only | P4 | RED | RED |
| M18 | `archive_name_ambiguous` emitted unconditionally | P1, P13 | RED | RED |
| M19 | an extra key added to the unscoped dry-run envelope | P1 | RED | RED |
| M20 | scoped `--execute` also emits `current_project_clean` | P8 | RED | RED |
| M21 | `driftCounts` drops the key for a non-array class | P4 | RED | RED |

Logs: `<scratch>/mutations-gitlab.log`, `<scratch>/mutations-gitea.log`.

### M21 caught a defect in MY OWN pin, and I fixed the pin, not the mutation

M21 first ran against P1 (following the canonical map) and came back **GREEN**. A mutation that
passes means the test is wrong: P1's fixture is **online**, so every class is an array and dropping
the non-array arm of `driftCounts` is unobservable there. The rule lives in the **offline** leg, so I
added an explicit `assertKeys903` on both count objects to P4's offline leg — a skipped class must
still get a count key valued 0, or a reader cannot tell "counted zero" from "never mentioned". M21
then reds P4 on both editions (`a skipped class counts 0 findings, stale_in_progress_labels was:
undefined`). Recorded because the canonical notes map M21 to their S1; that mapping does not transfer.

### The `KAOLA_WORKFLOW_OFFLINE` trap, handled explicitly in both directions

- P4's `clean:true` **positive control** runs through `runClosureAudit`, which sets
  `KAOLA_WORKFLOW_OFFLINE: '0'` explicitly, and the pin **asserts `offline === false` before it
  asserts `clean === true`**. Had it inherited `'1'`, both remote classes would have been
  `'skipped_offline'`, `clean` would have read `false`, and the control would have agreed with the
  fail-closed leg **for the wrong reason** — leaving an always-false verdict indistinguishable from a
  working one. The `offline === false` assertion is what makes that impossible to regress into.
- `runClosureAuditRaw` sets `KAOLA_WORKFLOW_OFFLINE: '1'` explicitly rather than inheriting, so what
  the argv pins ran under is stated, not ambient. Every assertion there is decided before any remote
  call (`parseArgs` throws before `getRoot()`; `resolveScope` throws before `buildAuditReport`).
- No pin reuses a fixture builder that could smuggle an env value in: `plantArchive903` and
  `plantArchiveSummary903` touch the filesystem only.

### Every pin also carries an in-test control, not only a mutation

P1 asserts the unscoped sweep still finds **both** findings (scoping partitions, it does not narrow
detection) and that unscoped findings carry no `attribution`. P2 ends with a well-formed bare run at
exit 0. P3 runs the correctly-spelled name (exit 0, both members resolved) beside the mistyped one.
P5/P6 both assert the **primary** is flagged, which is what proves the fixture is live. P7 carries
two controls: a closed **primary** still reports unchanged, and a bundle with no closed member is not
reported at all. P8 asserts an unrelated source **and** a never-stale source both survive on disk.
P9 asserts the same archive produces no `archive_content_incomplete` either. P10's `issue-921`
(`.jsonl`) and `issue-923` (no summary) are its negative legs. P13 asserts a project with only a
timestamped archive is **not** ambiguous — otherwise an always-true ambiguity check would look
identical to a working one.

### The mock is number-keyed, and that is what this surface needs

P7 is the only pin that needs per-issue answers (primary open, member closed), and its shim matches
`issues view 801` / `issue view 801` before the generic arm. There is **no post-close probe in the
closure-audit surface** — `buildAuditReport` calls `readActiveFolders(root, {excludeClosedIssues:
false})`, which skips `prefetchIssueStates` entirely, and `collectClosedSet` is the single probe
caller — so no close→re-probe sequencing exists here to mis-bucket. The stateful-mock concern the
brief raises belongs to the sink/claim surfaces, not this one.

---

## 4. Suites — real exit codes, `echo $?` / `$?` directly, never through a pipe. Run SERIALLY.

| what | tree | exit |
|---|---|---|
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | the worktree | **0** — 13 `…903: PASSED`, 547 spawns |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | the worktree | **0** — 13 `…903: PASSED`, 548 spawns |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | the worktree | **0** |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | the worktree | **0** |
| `scripts/validate-script-sync.js` | the worktree | **0** (15 common scripts, 27 byte-identical groups, 6 forge export-superset families) |
| `scripts/test-spawn-classification.js` | the worktree | **0** (601 sites / 60 files, 176 classified) |

Arming and coverage are proved separately: arming by the 22 mutation rows above, coverage by the 13
`…903: PASSED` lines in each full run — the pins **executed**, not merely registered.

### `test-spawn-classification.js` is GREEN, and nothing in it names my files

The two violations `tdd-walkthrough` reported (in `scripts/test-sink-merge.js` and
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`) are gone — the sibling annotated them.
My own new sites add **zero** unclassified sites, measured rather than assumed: `--table` reports
`test-gitlab-workflow-scripts.js: 61` and `test-gitea-workflow-scripts.js: 60` in the worktree, and
**the same two numbers** on the pristine `9b68b096` mirror. The one new spawn site per file
(`runClosureAuditRaw`) is annotated `// spawn-class: cli-contract`, which is what it is: argv →
handler → envelope → exit code. No ceiling was raised.

---

## 5. Does the ports' scoped `main()` actually work? YES — measured, first execution

impl-903 §9 recorded that neither port's scoped `main()` had ever been run end-to-end. It has now:
**all 13 pins pass on both ports**, exercising `--project`, `--issue`, `--project + --issue`,
`--project + --execute`, `--help`, `-h`, `--help` outside a git repository, and six operator-input
error paths, through the real CLI at a real process boundary. Specifically confirmed working on both
ports: the scoped and unscoped envelope shapes and key order; member resolution from `issue_numbers`;
archive resolution through `.archived-*`; the fail-closed `clean` verdict; skipped classes in both
halves; scoped `--execute` sparing other projects while still rebuilding the mirror whole; both
`attribution` values; and the omit-when-empty citation class. I found **no defect in the ports'
scoping code** — the code that had never run works.

---

## 6. Findings — reported, NOT fixed

### F1 (blocking-adjacent, MEASURED): the ports' `archiveRequiredContent` is a LIVE behavioural divergence, not dead code

impl-903 §7 and `tdd-walkthrough` both flagged this as *dead* code because
`listRecordedNodeEvidence` no longer exists in any `claim.js` (confirmed: `grep -c` returns **0** in
both ports' `claim.js`, so the `typeof === 'function'` arm is indeed inert). **But the `plan_hash` /
`active_plan_hash` → `workflow-plan.md` demand above it is NOT inert.** Measured on a fixture archive
carrying `plan_hash: abc123def456` and no `workflow-plan.md`, offline, same tree:

| edition | `archive_content_incomplete` |
|---|---|
| canonical `scripts/kaola-workflow-closure-audit.js` | `[]` |
| `kaola-gitlab-workflow-closure-audit.js` | `[{"project":"issue-777","missing":["workflow-plan.md"]}]` |
| `kaola-gitea-workflow-closure-audit.js` | `[{"project":"issue-777","missing":["workflow-plan.md"]}]` |

The canonical copy **deleted** that rule with the mechanism that made it derivable (its
`archiveRequiredContent` is now five lines: the identity anchor and nothing else). The ports kept it,
at `kaola-gitlab-workflow-closure-audit.js:274-297` and the gitea twin. So the three editions give
**different answers for the same archive**, and this divergence is **not** among the ones
`docs/api.md:886-890` records as deliberate. It also feeds `--project`: a scoped verdict reads
`clean:false` on the ports and `clean:true` canonically for such an archive.

**I wrote no pin for it.** A test is deleted with its mechanism, never repaired ahead of it — pinning
retired machinery would pin it in place. It needs deleting (matching canonical) or an owner ruling
that the divergence is intended and a `docs/api.md` entry saying so. `residue-sweep` /
`retired-lexicon` may already own the deletion.

### F2 (all four editions, low impact): `--project` accepts a path-traversal value at exit 0

`resolveProjectIssues` does `path.join(root, 'kaola-workflow', project, 'workflow-state.md')` with no
validation of `project`, while `active-folders.js` already has an `isSafeName` guard it does not use.
Measured: from a fresh repo, `--project ../../outside` where `<parent>/outside/workflow-state.md`
exists resolves a scope from **outside the repository** and exits 0 with
`"state_file": "../outside/workflow-state.md"`, `"issue_numbers": [4242,4243]`. Identical on the
**canonical** copy, so it is not a port defect and not a cross-edition divergence — a shared one.
Read-only, operator-supplied, local dev tool, so the impact is a contract wrinkle rather than a
security issue: the docs say `--project` names "one workflow project", and a traversal name silently
resolves instead of producing the promised exit 1. **No pin**: whether to reject or to accept is a
design call, and pinning today's behaviour would freeze something nobody decided.

### F3 (cosmetic): a misplaced comment in `resolveProjectIssues`

The `#903:` comment about a bare `P` archive beside a `P.archived-*` sibling sits immediately above
the `return { resolved: false … }` line, where it describes nothing — the ambiguity logic is in
`archiveNameIsAmbiguous`. Both ports and the canonical copy carry it identically. Comment placement
only; no behaviour.

### F4: `--project <name>.archived-<ts>` passed directly is still untested

As impl-903 §9 says. `archiveNameMatchesProject` matches it exactly so it should work. I wrote no pin
for an un-measured invocation form: a mechanism no observed failure demands.

---

## Artifacts

`<scratch>/tddforge/` under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/`:
`base/` (pristine `9b68b096`), `new/` (+ the two shipped port closure-audit files), `run-one.js`,
`mutate.js`, `port-to-gitea.js`, `baseline-gitlab.log`, `baseline-gitea.log`,
`mutations-gitlab.log`, `mutations-gitea.log`, `full-gitlab.log`, `full-gitea.log`, `wt-gitlab.log`,
`wt-gitea.log`, `fx-divergence/`, `fx-traversal/`.
