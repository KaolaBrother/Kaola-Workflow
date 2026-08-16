# m984: stop reading the roadmap sources (ADR 0018 §5 item 4 / §8 step 4)

Agent `impl984stop`, worktree `bundle-984-985`, branch `workflow/bundle-984-985`. **Nothing in this
run was committed** (per standing instruction) — everything below is uncommitted working-tree state.
`docs/api.md` was **not** touched (reserved for another hand); §4 lists everything my work implies
there.

## 1. What was removed, per slice, with file:line

### Slice 1 — classifier offline arm (`scripts/kaola-workflow-classifier.js`)
- Retired the `target_unverified` local-evidence path (the `.roadmap/issue-N.md` read that used to
  gate the OFFLINE-no-active-folder answer) and the `blocked by #N` → `depends-on:#N` inference.
  OFFLINE + no active folder for the target now unconditionally answers `target_unverified` — the
  roadmap-file check that used to co-gate it is gone.
- Byte-mirrored to `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`; ported to
  `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-classifier.js`.

### Slice 2 — `scripts/kaola-workflow-claim.js`
- `projectNameForIssue(root, issueNumber)` — body reduced to `return 'issue-' + issueNumber;` (kept
  as a function, `root` kept in the signature so call sites are untouched, per the retirement
  comment at line ~303). Measured before retirement: 0/81 real calls had the `workflow_project:`
  roadmap-source field populated — the fallback below it was what every real call already took.
- `reconcileRoadmapForClosure` — deleted entirely (comment markers remain at ~3037, ~4515, ~4727-28
  pointing to where it stood and what depended on it).
- Envelope fields retired: `roadmap_source_removed`, `roadmap_regenerated`,
  `roadmap_regenerated_by_root` (+ `roadmap_regenerated_main_error`), and the
  `main_roadmap_mirror_not_regenerated` finding — all from `cmdFinalize`'s JSON envelope.
- `CLOSURE_RECEIPT_FIELDS` in `scripts/kaola-workflow-closure-contract.js` — also dropped
  `roadmap_source_removed`/`roadmap_regenerated` (comment at line ~24), and the dual-root
  `roadmap_removed`/`roadmap_residue`/bundle `roadmap_sources_removed` fields (comment at
  claim.js:~4726) — these are the same class of field the brief named and were retired alongside it.
- Byte-mirrored to `plugins/kaola-workflow/scripts/{kaola-workflow-claim.js,kaola-workflow-closure-contract.js}`;
  ported to the gitlab/gitea equivalents.

### Slice 3 — `scripts/kaola-workflow-sink-merge.js`
- Bucket-1 roadmap auto-stash and its stash-restore step retired; kept tolerant of an **older**
  receipt still carrying `stash_ref` (does not error on a legacy value, just has nothing new to
  produce). Keep-open roadmap-source retention retired.
- Byte-mirrored / ported across all four editions.
- **Genuine production bug found and fixed** in `archive_commit` (all four editions), exposed — not
  caused — by this retirement. Fix: the live-path excludes (`excludeLiveReceipt`/`excludeLiveFallback`,
  `exLiveRcpt`/`exLiveFb` in the ports) are now only appended when `livePathspec` itself is in
  `commitPaths` (`liveTracked` true) — otherwise nothing includes that subtree and the exclude has no
  include to narrow. **Comment corrected in two passes** after team-lead could not reproduce the
  original wording ("any unreached subtree"): the precisely measured trigger is narrower — `git add`
  (git 2.54.0) silently stages NOTHING at all, exit 0, only when an `:(exclude,glob)`'s directory
  component is a literal STRING PREFIX of another pathspec's (the include's) leaf directory
  component — e.g. exclude `kaola-workflow/issue-9500/**/x` beside an include whose leaf dir is
  `issue-9500.archived-<ts>` (a #700 collision-suffixed dest, built from the same `args.project`). A
  second real include pathspec masks it either way (verified — this is why `stagedRoadmap` going
  empty is what exposed it). **Second correction, from team-lead's own independent verification**:
  the "unrelated subtree is safe" half of my claim held only for OUR OWN glob tail
  (`**/sink-receipt.json` / `**/sink-fallback.json`) — a wider tail (`**` alone, or `**/x`) trips the
  bug regardless of the prefix relationship, an independent second trigger path. The comment now
  scopes that boundary explicitly to our own tail rather than implying it generalizes. Verified via a
  minimal isolated git repro (commands + output sent to team-lead), a standalone end-to-end
  reproduction, the walkthrough's own `testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge`
  (now passes), and `node scripts/test-sink-merge.js` (1063 assertions, unchanged pass count —
  re-confirmed after both comment corrections).
- **For the record (team-lead's instruction)**: this bug could always have fired — the #700
  collision-suffixed dest shares the triggering prefix with the live-exclude whenever the archive
  collision-suffixes, independent of anything this run touched. A second include (from roadmap
  regeneration) was simply almost always present, masking it. **The retirement did not create this
  defect; it removed the mask that was hiding it** — the same shape as the `archive_stage` finding
  below (§5): two independent cases in this one run of the retirement revealing something that was
  already latent. Both are candidates for a follow-up issue at finalize rather than living only in a
  code comment and this report.

### Slice 4 — `scripts/kaola-workflow-closure-audit.js` (all four editions)
- Removed `roadmapSourceFiles(root)` and `archiveClosedIssues(root)` (the `.roadmap/issue-N.md`
  scanner and the closed-archive-issue-number collector).
- Removed `detectStaleRoadmapSources` (drift class `stale_roadmap_sources`) and `detectMirrorClosed`
  (drift class `mirror_lists_closed_issues`).
- **Measured before retiring `mirror_lists_closed_issues`**: its issue-number set was always a
  **strict subset** of `stale_roadmap_sources`'s `closed_remote`-reasoned entries — both classes read
  the identical `kaola-workflow/.roadmap/issue-N.md` sources via `readRoadmapIssues` over the same
  `roadmapDir`, and `mirror_lists_closed_issues` never flagged anything that wouldn't also trip
  `closed_remote`. Confirms the brief's framing.
- `executeRepairs` — the stale-source-removal + `regenerateRoadmap` repair block is gone.
  `--execute` now only removes `workflow:in-progress` from closed issues when online; `repairedObj`
  no longer carries `roadmap_sources_removed`/`roadmap_regenerated`.
- `buildAuditReport`/`scopePredicate` updated to match (no `srcFiles`/`archiveClosed` locals, no
  roadmap-class special-case branch in `scopePredicate` — verified the default arm already produces
  identical scoping for every surviving class).
- USAGE/docstring/`main()` stale-comment/`module.exports` updated to match (this needed a second pass
  after an initial miss, caught by grepping all 4 editions for the retired symbol names).
- Verified via `node scripts/validate-script-sync.js` (all 4 editions in sync) and direct CLI
  sanity-runs (dry-run + `--execute`, exit 0, correct envelope shape) on canonical and both forge
  ports.

## 2. Every test deleted, and the mechanism it died with (`scripts/simulate-workflow-walkthrough.js`)

Deleted whole (function body + registry `add()` entry), each tied to a retired mechanism above:

| Test | Died with |
|---|---|
| `testClosureAuditKeepOpenExclusion` | keep-open roadmap-source retention (slice 3) + `archive_closed` stale-source class (slice 4) |
| `testKeepOpenInvariantUnit` | same |
| `testClosureAuditClosedRemoteRoadmapSource` | `detectStaleRoadmapSources` / `stale_roadmap_sources` |
| `testClosureAuditArchiveClosedDrift` | `stale_roadmap_sources` (`archive_closed` reason) + `archiveClosedIssues` |
| `testClosureAuditDedupRoadmapAndArchive` | dedup logic between the two retired drift classes |
| `testClosureAuditMirrorListsClosedIssues` | `detectMirrorClosed` / `mirror_lists_closed_issues` |
| `testClosureAuditBundleMemberArchiveClosed903` | `archiveClosedIssues` bundle-member path |
| `testClosureAuditBundleMemberClosurePolicyNegative903` | same |
| `testClosureAuditScopedExecuteSparesOtherProjects903` | scoped `--execute`'s retired roadmap-source repair |
| `testClosureAuditArchiveOnlyNotProbed` | `roadmapSourceFiles` probe ordering |
| **#916 block** (9 helper functions + `testFinalizeCleansRoadmapEntry`, `testFinalizeFromLinkedWorktreeCleansRoadmapEntry`, `testFinalizeLinkedWorktreeMainRoadmapUnreadableSourceIsRecorded916`, `testFinalizeLinkedWorktreeMainRoadmapSourceLossIsRecorded916`, `testFinalizeLinkedWorktreeMainRoadmapHealthyControl916`, `testFinalizeLinkedWorktreeKeepWorktreeSkipsMainRoadmapRebuild916`, `testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource`, `testFinalizeRoadmapCleanupFailureReceipt`, `testWatchPrRoadmapCleanupWarning`) | `reconcileRoadmapForClosure` (dual-root roadmap cleanup at finalize) |
| `testFinalizeRoadmapResidueDetection` | `roadmap_residue` receipt field |
| `testAdaptiveOffStartupRefusal` | roadmap-source-gated startup path |
| `testAdaptiveOnStartupAcquires` | same |
| `testClassifierOfflineVerifiedRoadmapAcquires` | classifier's retired `.roadmap/issue-N.md` local-evidence read (slice 1) |
| `testClaimNeverDeletesWhatItDidNotCreate932` | roadmap-source deletion path it was pinning |

Renamed + partially edited (roadmap assertions removed, surviving coverage kept):
- `testClosureAuditExecuteRepairsRoadmapAndLabels` → `testClosureAuditExecuteRepairsLabels` (label-removal coverage kept).
- `testBundleFinalizeRoadmapCleanup` → `testBundleFinalizeReceiptFields` (`closed_issues`/`failed_issue_closures`/`issue_numbers`/`closure_invariants` coverage kept).

Surgically edited (only the roadmap-specific assertion/setup removed): `testWatchPrMergedClosureReceipt`,
`testKeepOpenMergeFullChain`, `testKeepOpenFinalizeFlagAlias`, `testSinkMergeKeepOpenOnlineMock`,
`testSinkMergePostPushReopenOnMock`, `testFinalizeNarrowStagingExcludesForeignArchive`.

Confirmed safe with **no changes needed** (empirically re-verified via `--only` this session):
`testWorktreeNativeOfflineWins`, `testClosureAuditScopingHelpers903`,
`testClosureAuditScopedArchiveAmbiguousMatch903`, `testClosureAuditScopedCleanIsFailClosed903`.

## 3. HELD — not touched, needs a fixture-design call I don't have authority to make

**Correction, applied this pass**: `testClaimStatusRelease` was originally deleted as bucket-1
(mistaken — its subject, the claim → status → release lifecycle, is not retired; only its bootstrap
died). Per your ruling I reverted the deletion **from `git show HEAD:...` (read-only; no `git
checkout` touched the shared worktree)**: the original function body, its `runSharedTmpGroup(tmp)`
call, and its `SHARED_TMP_NAMES` entry are all restored byte-for-byte, in their original position
(first in the shared-tmp group, ahead of `testFinalize`). It is now HELD, not deleted, and fails
predictably at its own dead bootstrap (`Error: startup should acquire explicit issue`) exactly like
`testFinalize` — confirmed via `--only testClaimStatusRelease`. `testClosureAuditKeepOpenExclusion`
and `testKeepOpenInvariantUnit` are unchanged, confirmed true bucket-1 (their pinned mechanisms —
`stale_roadmap_sources` and the `keep-open-roadmap-preserved` field — are genuinely gone).

These **11** walkthrough tests still bootstrap via `plantRoadmapIssue` + `startup --target-issue`,
which no longer acquires anything OFFLINE (nothing reads the roadmap source it plants — slice 1).
Their *subject* is not retired; only their bootstrap is broken, and a safe substitute (e.g.
`plantActiveFolder`, already used elsewhere) requires guessing at hidden implicit preconditions I'm
not positioned to guess correctly — this class goes to `tdd-guide` alongside the `plantRoadmapIssue`
helper's re-pointing to `KAOLA_CLASSIFIER_MOCK_SCRIPT` (#495) and `test-forge-bundle-lane.js`:

`testClaimStatusRelease`, `testFinalize`, `testKeepOpenArchiveStamp`,
`testClosureAuditUnresolvedClosedState`, `testClosureAuditProbeFailureUnresolved`,
`testClosureAuditTimeoutEnvInvalidFallsBack`, `testClosureAuditTimeoutEnvOverCapFallsBack`,
`testClosureAuditProjectScopePartitions903`, `testBundleSingleIssueStateHasNoBundleFields`,
`testPlanlessAndPlannedInitialAuthority699`, `testOfflineNoHistoryClaimRoot699`.

`testClaimStatusRelease` and `testFinalize` are both shared-tmp group members, so the full unsharded
walkthrough now halts at `testClaimStatusRelease` first (throw-at-first-failure semantics; it runs
before `testFinalize` in original order) — see gate results below. A `--only`-based exclusion sweep
of the **entire rest of the registry** (everything outside these 11 held tests, and outside every
other shared-tmp-group member since `--only` cannot cherry-pick within a shared-tmp group) returned
exit 0.

`test-forge-bundle-lane.js` remains exactly as it was left before this session (untouched, 40 FAILED
/ 19 passed, re-confirmed this session) — **explicitly ruled**: leave it untouched and red, its
mechanism (#862 `selectionRecordBytes` opts-threading) is not retired, only its bootstrap is
collateral, and re-bootstrapping is test authoring that belongs to `tdd-guide`. Same seam as the
walkthrough fix: `claim.js:1096-1101`'s `KAOLA_CLASSIFIER_MOCK_SCRIPT` (#495) lets the file keep
`KAOLA_WORKFLOW_OFFLINE=1` and its hostile exit-97 forge shim while dropping its dependence on
roadmap-file evidence — no new machinery, #862 coverage preserved, does not need to go online.

### `testClaimNeverAdoptsReservedDir933`, case `issue: 9331` — RULED bucket-1, deleted

Discovered while re-verifying the exclusion sweep after the `testClaimStatusRelease` revert; flagged
rather than edited, per the stop instruction. **Ruling received: bucket-1, confirmed correct** — of
the 4 parameterized cases, only `issue: 9331` (`viaRoadmapData: true`, door `'startup'`) used the
retired `workflow_project:` roadmap-source door into `claimProject`; the other 3 (`9330`, `9332`,
`9333`) all go through the `--project`-flag `claim` door, unaffected. `projectNameForIssue` is
literally `return 'issue-' + issueNumber;` now — the door isn't unbootstrappable, it's gone from the
tree. Litmus answers no for the right reason ("the thing it tested does not exist," not "the fixture
can't reach it").

**Executed**: removed the `CASES[1]` entry (issue 9331) with a retirement comment, and its now-
vestigial plumbing — the `'workflow_project: ' + (c.viaRoadmapData ? c.given : '—')` ternary collapsed
to the constant `'workflow_project: —'` it always evaluated to once no surviving case sets
`viaRoadmapData`. Confirmed via `--only testClaimNeverAdoptsReservedDir933`: `PASSED (3/3 doors)`.

**Second pass, on ruling**: flagged (not extended) the now-also-unreachable `door: 'startup'` argv
branch rather than removing it unilaterally, since it wasn't named in the instruction. Team-lead
checked and ruled: reachability, not category (argv vs. roadmap-source planting), is the test — no
surviving case sets `door: 'startup'` any more (all three set `door: 'claim'`, now redundantly, since
9331 was the only case that ever varied it), so the branch and the field are residue this run
authored, not pre-existing vestige. **Executed**: collapsed `argv` to its one surviving form
(`['claim', '--project', c.given, '--issue', String(c.issue)]`) and removed the now-constant `door:
'claim'` key from all three remaining case objects, since nothing reads `c.door` any more. Confirmed
via `grep -n "\.door\b"`: zero remaining references. Re-verified: `--only
testClaimNeverAdoptsReservedDir933` → `PASSED (3/3 doors)`; the full exclusion sweep (177 selected,
"176 scenarios passed", exit 0); `node -c`; `validate-script-sync.js` (exit 0). Full unsharded
walkthrough re-confirmed unchanged — still halts at `testClaimStatusRelease` first, as expected.

## 4. Complete list of `docs/api.md` edits this work implies (file untouched by me)

1. **Line 78**, classifier verdict table, `target_unverified` row — condition column currently reads
   "offline, and no local `.roadmap/issue-N.md` and no active folder for the target"; drop the
   roadmap-file clause — it's now unconditionally "offline, and no active folder for the target".
2. **Lines 300-317**, `cmdFinalize` JSON envelope example — remove the three lines:
   `"roadmap_source_removed": ...`, `"roadmap_regenerated": ...`, `"roadmap_regenerated_by_root": {...}`.
3. **Lines 319-326** — remove the whole bullet describing `roadmap_regenerated_by_root` /
   `roadmap_regenerated_main_error` / the `main_roadmap_mirror_not_regenerated` finding.
4. **Line 394**, `findings` de-duplicated fault-name list — remove
   `main_roadmap_mirror_not_regenerated` from the list.
5. **Lines 425-430 and 432-435**, "One edition difference in the finding-type count" — **the known
   trap from the brief, confirmed exactly**: update **nine → eight** (canonical/Codex) and
   **eight → seven** (GitLab/Gitea); the delta explanation (`archive_unstage_failed`) is unaffected
   and stays as-is.
6. **Lines 1105-1126**, closure-receipt JSON example (`CLOSURE_RECEIPT_FIELDS`) — remove
   `"roadmap_source_removed"`, `"roadmap_regenerated"`, `"roadmap_removed"`, `"roadmap_residue"`.
7. **Lines 1130-1135** — remove/rewrite the bullets describing `roadmap_removed` and
   `roadmap_residue` (neither field exists any more).
8. **Lines 1159-1162**, "Keep-open partial-close lane" — remove the `roadmap_source_removed` bullet
   in full; it names a retired field, a retired regeneration side effect, and the retired
   `archive_closed` stale-source class all in one sentence.
9. **Lines 1173-1181**, bundle receipt additive-fields JSON example — remove
   `"roadmap_sources_removed": [...]`.
10. **Lines 1206-1211**, "`sink-merge` closure receipt" — rewrite "`sink-merge` derives `archive` and
    `roadmap_source_removed` by probing post-conditions (finalize already archived);
    `roadmap_regenerated` is `skipped` because it does not regenerate the mirror." to just
    "`sink-merge` derives `archive` by probing post-conditions (finalize already archived)."
11. **Line 1272**, scoped-`--execute` Fact/Contract table — remove the row "scoped `--execute` |
    repairs only in-scope drift, but still rebuilds `ROADMAP.md` whole — ..."; there is no rebuild
    left, scoped or unscoped.
12. **Lines 1276-1277**, closure-audit Key/Meaning table — remove the `stale_roadmap_sources` and
    `mirror_lists_closed_issues` rows entirely.
13. **Lines 1285-1286**, "Safe-repair boundary" — "`--execute` only ever (1) deletes stale
    `.roadmap/issue-N.md` sources, (2) regenerates `ROADMAP.md`, and (3) removes
    `workflow:in-progress` from closed issues when online." → items (1) and (2) are gone; becomes
    "`--execute` only ever removes `workflow:in-progress` from closed issues when online."

**Checked and found NOT implicated** (so as not to over-claim): line 1271's `attribution` field is
about `archive_content_incomplete`/`archive_summary_citation_missing`, unrelated to the retired
classes — confirmed by reading `annotateAttribution`'s call sites, no edit needed. Lines
1453/1667/1687 document `regenerateRoadmap(root)` as an export of `kaola-workflow-roadmap.js`
itself — untouched per the brief, correctly still accurate. No `blocked by #N` / `depends-on:#N`
text exists anywhere in `docs/api.md` today, so slice 1's second retirement (the inference) implies
no doc edit.

I assessed whether the `archive_stage` finding (§5 below) implies an api.md edit and concluded **no**:
line 380 already documents `skipped` as `archive_stage`'s *default* value with no claim about which
conditions produce which outcome, so no wording there is contradicted — this is a test-fixture design
question, not a doc-accuracy defect.

## 5. Reported, not fixed: `archive_stage` finding in `cmdFinalize` (claim.js) — separate from the sink-merge.js bug

Distinct code path from the fix in §1/slice 3. In `cmdFinalize`'s `finalizeTx` (~line 4790-4890), the
archive-stage candidate list is `['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md']` plus,
in-place only, `destRel` — excluded on a **linked** run because `destRel.startsWith('..')`. Once
roadmap regeneration is retired, on a linked run **neither** roadmap path exists any more, so
`existingPaths.length === 0` and the `git add` staging block is never entered at all —
`archive_stage` now reads `'skipped'` where the healthy-control fixture in
`test-forge-finalize-findings.js` expects `'staged'`. This is not a bug in the code I touched: it's a
genuine structural consequence — the linked-run `archive_stage` mechanism's only historical source of
"something local to stage" was the now-retired roadmap regeneration's side effect, and there is
nothing left in the worktree for it to prove itself against in the ordinary case. Deciding what
`archive_stage` should report (or what the fixture should plant) post-retirement is a design call I
don't have authority to make unilaterally, so I left the test's assertions as-is and report this
instead. 4 of `test-forge-finalize-findings.js`'s 12 failures are this finding
(`archive_stage`/`archive_unstage_failed`/`archive_unstaged` fields + the durable-write assertion +
the git-property assertion); the remaining 8 are the known api.md-count-sentence trap (§4 item 5) plus
one `archive_unstaged` undocumented-field assertion that cascades from the same root cause.

## 6. Gates — each run, exit code echoed separately

| Gate | Result |
|---|---|
| `node scripts/validate-script-sync.js` | **exit 0** — "OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at HEAD." |
| `node scripts/validate-workflow-contracts.js` | exit 0 (run earlier this session, unaffected by later edits; canonical + codex byte-mirror pass together) |
| `node scripts/validate-kaola-workflow-contracts.js` | exit 0 (same) |
| `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) | **exit 1** — halts at `testClaimStatusRelease` (`Error: startup should acquire explicit issue`), first in shared-tmp-group order among the 11 HELD tests. **Everything outside the 11 held tests verified separately** via a `--only`-based exclusion sweep of the whole registry (177 selected, "176 scenarios" reported — same 1-count naming discrepancy noted throughout this run, not a new concern): exit 0. (`testClaimNeverAdoptsReservedDir933`'s dead case is gone, no longer needs a separate exclusion.) |
| `node scripts/test-forge-finalize-findings.js` | **exit 1** — 241 passed, 12 failed. 4 are the `archive_stage` finding (§5, reported not fixed); 8 are the known api.md-count-sentence trap + one cascading `archive_unstaged`-doc mismatch (§4 item 5, expected and owned — fixing it means editing api.md, which is out of scope for this hand). |
| (context) `node scripts/test-sink-merge.js` | exit 0 — 1063 assertions, unchanged, confirms the sink-merge.js fix (§1/slice 3) didn't regress anything |
| (context) `node scripts/test-forge-bundle-lane.js` | exit 1 — 19 passed, 40 failed, **unchanged from before this session**, unrelated to any of the four slices |

## 7. Where the brief was wrong, or needed correction

- The brief's framing of `main_roadmap_mirror_not_regenerated` as a slice-4 item was **correct as
  written**, but its downstream count claim needed the exact numbers confirmed by running the gate
  rather than assumed — confirmed: nine/eight → eight/seven, exactly as the brief predicted.
- The brief did not anticipate the **git-pathspec production bug** in `sink-merge.js`'s
  `archive_commit` (§1/slice 3) — this was discovered, not specified, and required an out-of-brief
  judgment call (fix directly vs. report-only) which I resolved as "fix directly": it's a
  straightforward code correction exposed by the retirement, not a test-design or fixture question.
- The brief did not anticipate the **`archive_stage` finding** in claim.js's separate `finalizeTx`
  mechanism (§5) — genuinely new, well-understood, but correctly left unfixed since resolving it
  requires deciding what the fixture (or the field's meaning) should be post-retirement.
- The brief's api.md-implication list ("the finding-count sentences... and the
  `main_roadmap_mirror_not_regenerated` row removal") undercounted the scope by roughly 10x — the
  actual implied edit set spans 13 locations across three separate documented schemas (the finalize
  envelope, the closure receipt, and the closure-audit drift/repair contract), not just the one
  count-sentence pair. See §4 for the full list.
- Everything else in the fixed internal order, scope boundaries (no `docs/api.md`, no
  `templates/routing/*`, no `scripts/kaola-workflow-roadmap.js`, no test authoring/repair-ahead-of-
  retirement), and cross-edition reach requirements held exactly as specified.

## 8. Ownership rulings received and acted on this pass

- **`test-forge-bundle-lane.js`**: ruled leave untouched/red, goes to `tdd-guide` — matches what I
  had already done; no change required.
- **The "bucket 2" distinction** (bootstrap died vs. mechanism retired; litmus: "would this test
  still be meaningful if `plantRoadmapIssue` produced a green verdict tomorrow?"): accepted and
  applied. Under it, `testClaimStatusRelease`'s original deletion was wrong — **reverted this pass**,
  from `git show HEAD:...` (read-only), restoring the exact original function, its shared-tmp-group
  call, and its `SHARED_TMP_NAMES` entry. `testClosureAuditKeepOpenExclusion` and
  `testKeepOpenInvariantUnit` were re-confirmed correct as true bucket-1 (their pinned mechanisms are
  genuinely gone) — left deleted, no action taken.
- **`archive_stage` finding** (§5): ruled `'skipped'` is the honest post-retirement answer on a
  linked run, the assertion is what has to move, and the fault-injection leg needs a non-linked
  fixture since `archive_stage_failed`/`archive_unstaged` live inside a block a linked run can no
  longer enter. Fixture-design, so not mine — joins the tdd brief alongside `plantRoadmapIssue` and
  `test-forge-bundle-lane.js`.
- **`testClaimNeverAdoptsReservedDir933`'s `issue: 9331` case**: ruled bucket-1, confirmed correct —
  its subject (the `workflow_project:` roadmap door) is structurally gone, not merely
  unbootstrappable. **Executed**: removed the case and its now-vestigial `viaRoadmapData` ternary
  (collapsed to the constant it always evaluated to). Flagged, rather than extended on my own
  initiative, the now-also-unreachable `door: 'startup'` argv branch — ruled on separately:
  reachability, not category, is the test, and a branch with no case left is residue *this run*
  authored, not pre-existing vestige to leave alone. **Executed**: collapsed `argv` to its one
  surviving form and removed the now-constant `door: 'claim'` key from all three remaining cases.
- **The sink-merge `archive_commit` comment**: reproduced, verified narrower than originally stated,
  and rewritten across all four editions — see §1/slice 3 for the corrected mechanism and the
  verbatim repro sent separately. Confirmed distinct from the `archive_stage` finding (§5) — no
  misattribution between the two.

Standing by. Everything above is uncommitted in this worktree; nothing pushed, nothing archived.
