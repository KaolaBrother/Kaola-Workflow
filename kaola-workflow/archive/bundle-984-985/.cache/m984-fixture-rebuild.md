# m984: fixture rebuild — the eleven held tests, test-forge-bundle-lane.js, test-forge-finalize-findings.js

Agent `tdd984` (tdd-guide), worktree `bundle-984-985`, branch `workflow/bundle-984-985`. **Nothing
committed** (per standing instruction) — everything below is uncommitted working-tree state. Test
paths only; production files were mutated **transiently, one site at a time, and restored from a
snapshot after each check** (per the standard of proof) — never left changed. Verified clean after
every mutation: `diff` against the pre-mutation snapshot, plus `grep -c MUTATION-984` returning 0
across `kaola-workflow-claim.js`, `kaola-workflow-closure-audit.js`,
`kaola-workflow-active-folders.js` at the end of this pass.

## Job 1 — `scripts/simulate-workflow-walkthrough.js`

### What changed

- **`plantRoadmapIssue(root, issueNumber, body)`** (was: write `kaola-workflow/.roadmap/issue-N.md`;
  now: registers a canned classifier verdict through `KAOLA_CLASSIFIER_MOCK_SCRIPT`, #495,
  `claim.js:1096-1101`). `body` is still inspected for `/blocked by #(\d+)/i` (the one shape the
  retired offline inference reacted to in `next_step`); everything else gets `{verdict:'green',
  reasoning:'no dependency block'}` — the only outcome any surviving OFFLINE-arm-dependent caller in
  this file ever produced historically (confirmed by grep: exactly one call site in the whole file
  passes a non-empty `body`, and it's an ONLINE test unaffected by this seam — see below).
- **New module-scope infra**, next to `plantActiveFolder`: `classifierMockScript` (a Node script
  written once, that reads a JSON registry file and either answers the registered verdict or
  delegates to the real classifier), `classifierMockRegistryFile`, `registerClassifierVerdict()`.
  `process.env.KAOLA_CLASSIFIER_MOCK_SCRIPT` is set ONCE, process-wide, at module load.
- **`runNode`** (the one helper that explicitly scrubs inherited `KAOLA_*` vars): re-adds
  `KAOLA_CLASSIFIER_MOCK_SCRIPT` to `baseEnv`, ahead of `extraEnv` so a caller supplying its own mock
  still wins. Every other OFFLINE spawn site in this file spreads `...process.env` directly and picks
  the var up for free — no other edit needed there.
- **THE TRAP, actually hit and resolved**: the mock **must not** intercept ONLINE classification. The
  mock self-guards on its own `KAOLA_WORKFLOW_OFFLINE` — if not `'1'`, it delegates unconditionally,
  before even checking the registry. Without this guard, `testStartupExplicitTargetRedAnswers` (which
  calls `plantRoadmapIssue(tmp, 71, 'body: a target that turns out to be closed')` then goes ONLINE
  with a gh mock reporting #71 closed) would have had its real `red` verdict silently overridden by a
  blanket green — a green that checks nothing. Verified passing with the guard in place.

### The eleven held tests — all now pass, but four needed more than the bootstrap

`testClaimStatusRelease`, `testFinalize`, `testBundleSingleIssueStateHasNoBundleFields`,
`testPlanlessAndPlannedInitialAuthority699`, `testOfflineNoHistoryClaimRoot699` — **pure bootstrap
fixes**, no assertion changes, all pass under `--only`.

`testKeepOpenArchiveStamp` — bootstrap fix **plus** a trim: it also asserted
`fs.existsSync(.roadmap/issue-333.md)`, `result.roadmap_source_removed === 'kept'`, and
`result.closure_receipt.roadmap_source_removed === 'kept'` — all three name a retired field/file.
Removed, mirroring the trim already applied to `testKeepOpenMergeFullChain` /
`testKeepOpenFinalizeFlagAlias` in the prior session. Kept: `remote_issue_closed === 'kept_open'` and
`closure_invariants.ok === true` (the aggregate invariant survives; only the roadmap-specific
sub-check under it is gone).

**The other three closure-audit tests needed a second, independent fix beyond the classifier seam —
this was not anticipated by the brief and I want to flag it plainly:**

- `testClosureAuditUnresolvedClosedState`, `testClosureAuditProbeFailureUnresolved` — measured that
  `buildAuditReport`'s candidate set for `collectClosedSet` USED TO fold in roadmap-source issue
  numbers additionally to active-folder ones (`git diff` on `kaola-workflow-closure-audit.js`:
  `candidates = srcFiles.map(...).concat(folders...)` → now `candidates = folders.map(...)` only,
  comment at claim-adjacent line 427-430). `plantRoadmapIssue` was NEVER a classifier concern for
  these two tests (closure-audit.js never calls `classifyIssue`/never reads
  `KAOLA_CLASSIFIER_MOCK_SCRIPT` at all) — it was silently the ONLY candidate source. Fix: added
  `plantActiveFolder(tmp, 'issue-NNN', NNN, null)` alongside the existing (now-inert but harmless)
  `plantRoadmapIssue` call, so the issue enters `candidates` via `readActiveFolders` instead.
- `testClosureAuditTimeoutEnvInvalidFallsBack`, `testClosureAuditTimeoutEnvOverCapFallsBack` — same
  candidate-source problem, PLUS their original discriminator (`stale_roadmap_sources`'s
  `closed_remote` reason) is a retired drift class (`detectStaleRoadmapSources` deleted per slice 4).
  Fixed the same way (`plantActiveFolder`) and re-pointed the discriminator to the surviving
  equivalent: `unresolved_closed_state` must NOT include the issue (probe succeeded, didn't crash/
  time out) AND `active_folder_for_closed_issue` MUST include it (probe correctly resolved closed).
  Same shape, same underlying property (an invalid/huge timeout must fall back/clamp rather than
  crash the remote probe), read through a field that still exists.
  - **Honesty note on `OverCapFallsBack` specifically**: I could not get a mutation-provable red for
    the "over-cap value crashes the probe without a clamp" half specifically. Measured directly on
    this Node (v24.18.0): `execFileSync(..., {timeout: <any finite number, even 1e308>})` does NOT
    throw — only `Infinity`, `NaN`, and negative values do, and `Infinity`/`NaN` both fail
    `Number.isInteger(n)` and land in the SAME fallback branch the "invalid" test already covers, not
    the `Math.min` clamp branch specifically. So on this runtime, no numeric literal can distinguish
    "clamped" from "unclamped" via a synchronous throw for a genuinely-too-large positive integer —
    the removed-clamp mutation passed (no red) on `OverCapFallsBack` while correctly redding on
    `InvalidFallsBack` (NaN does throw). This is a pre-existing, Node-version-dependent gap in the
    test's own premise (the comment's claimed "causes execFileSync to throw ERR_OUT_OF_RANGE" does
    not reproduce here) — not something ADR 0018's retirement caused or that my rebuild introduced.
    I did not invent a new mechanism to force it (that would mean either a production-code range
    check, out of my remit, or a slow-shim/wall-clock-timing fixture I judged too risky to add under
    time pressure without review). Left as observed, flagged here rather than silently accepted.

`testClosureAuditProjectScopePartitions903` — the deepest of the eleven. Its ENTIRE fixture and every
assertion were built on `stale_roadmap_sources` / `mirror_lists_closed_issues`, both fully retired
(closure-audit.js:332-337). The underlying mechanism it exists to pin — `partitionDriftByScope` /
`scopePredicate` splitting drift into `current_project_drift` vs `repository_drift_outside_scope` — is
NOT retired, and closure-audit.js still special-cases exactly two classes for NAME-based (not
issue-number-based) scope matching: `archive_content_incomplete` and `archive_summary_citation_missing`
(closure-audit.js:499-501), for exactly the reason a roadmap-source finding used to need it (the
finding carries no issue number of its own). Re-pointed the whole fixture to
`archive_summary_citation_missing` (closure-audit.js:318-330, LOCAL/OFFLINE-safe, unlike
`archive_content_incomplete` which requires `workflow-state.md` to be MISSING — that would break
`--project`'s own scope resolution, which needs to READ that file to resolve `scope.issue_numbers`).
Two archived projects, each with a valid `workflow-state.md` (for scope resolution) and a
`finalization-summary.md` citing a `.cache/final-validation.md` that was never written (for the drift
itself). All field names, drift-key orderings, and count assertions rewritten to match; added one new
assertion (`attribution === 'name_match'`) that wasn't in the original, confirming the NAME-based
predicate is what actually matched.

### A twelfth casualty found only by running the full suite, not in the brief's list

`testWatchPrAbandonedClosureInvariantsClean` (issue #223/#13) was not in the "11 held" list, the
"deleted" table, the "surgically edited" list, or the "confirmed safe" list in `m984-stop-reading.md`
— it slipped through because it was still PASSING before my change (it plants a roadmap issue AND
calls `roadmap.js generate` directly to build a real `ROADMAP.md`, both of which were still fully
functional — `plantRoadmapIssue`'s OLD file-write fed `roadmap.js generate`, a live, unretired
consumer I initially missed and had to trace back to). Re-pointing `plantRoadmapIssue` broke its setup
(`ROADMAP.md must contain #920 before watch-pr`), which is what surfaced it.

Investigated the test's actual claim: `checkClosureInvariants` (claim.js:3033-3038) no longer
evaluates ANY roadmap invariant for ANY archive disposition — the roadmap-source-absent /
roadmap-mirror-clean / keep-open-roadmap-preserved checks are ALL retired. So the test's original
regression ("fires roadmap invariants even when archive=abandoned") is now structurally unreachable
for ANY input, not merely fixed for the abandoned case — bucket-1 by the litmus test, for that half.
What survives and is NOT covered elsewhere (`testWatchPrMergedClosureReceipt` only covers the MERGED
path): a CLOSED-not-merged PR resolves to `archive:'abandoned'` and still reports
`closure_invariants.ok:true`. Surgically trimmed the dead roadmap setup/assertion (mirroring the
established `testClosureAuditExecuteRepairsRoadmapAndLabels` → `...Labels` pattern), kept the
surviving coverage, rewrote the stale "(pre-fix: false with roadmap violations)" message.

### Gates

| Gate | Result |
|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) | **exit 0** — `{"scenarios":186,"ran":186,"passed":186,"failed":0}`. Re-ran twice for stability, both exit 0. |

One transient blocker hit and resolved **by someone else, not me**: mid-session the full run hit
`Error: docs/api.md must document closure contract invariants and receipt schema; missing:
roadmap_source_removed` from `validate-workflow-contracts.js` (via `testContractValidatorOfflineSkip` /
`testContractValidatorMissingTag`) — a validator term list not yet updated for the field
`kaola-workflow-claim.js`'s own retirement dropped from its envelope. Confirmed via a full exclusion
sweep that this was the ONLY thing between me and a fully green run at that point. Not mine to fix
(production validator, entangled with the `docs/api.md` edit the team-lead reserved) — before I
reported it, a concurrent teammate landed the fix (see
`.cache/m984-contract-validators.md`, filed separately); the full run is green without me touching it.

## Job 2 — `scripts/test-forge-bundle-lane.js`

### What changed

`makeRepo()` no longer writes `kaola-workflow/.roadmap/issue-N.md` for the bundle members (42, 47) —
nothing reads that file in ANY of the four editions post-retirement. Added a static, always-green
`CLASSIFIER_MOCK_SCRIPT` (every scenario in this file wants the same green answer for both members;
no per-issue branching exists anywhere in the file, so no delegate-when-unregistered logic was
needed, unlike Job 1's helper) and wired `KAOLA_CLASSIFIER_MOCK_SCRIPT` into `runClaim`'s env for
every edition. `KAOLA_WORKFLOW_OFFLINE=1` and the hostile-shim forge mocks are UNCHANGED — the file
never went online.

### THE BLOCKER — genuinely needs a production change, stopped rather than working around it

**`root` and `codex` are fully fixed (0 failures, both). `gitlab` and `gitea` cannot be fixed from the
test side at all**, and I did not attempt a workaround. Measured, not assumed:

- `root`/`codex`'s `classifyIssue()` spawns the classifier as a SUBPROCESS
  (`kaola-workflow-claim.js:1095-1101`) and `KAOLA_CLASSIFIER_MOCK_SCRIPT` swaps which binary gets
  spawned — that's the whole seam.
- `gitlab`/`gitea`'s `classifyIssue()` (`kaola-{gitlab,gitea}-workflow-claim.js:876-882`) calls
  `classifier.classifyIssue(issueIid, root)` **IN-PROCESS** — no subprocess, no env var read anywhere
  in their classifier module (`kaola-{gitlab,gitea}-workflow-classifier.js`, confirmed by grep: zero
  hits for `MOCK` in either file). There is no subprocess to redirect and no seam to redirect it with.
- Pre-planting an active folder to dodge the OFFLINE `target_unverified` answer is not a workaround
  either: `claimExplicitBundle`'s own pre-classify active-folder check (step 4a, same file) refuses a
  target that IS already active with a DIFFERENT refusal (`target_set_conflicts_active_work`) before
  classify ever runs.
- Fixing this needs a production change: an offline classifier-mock hook ported into gitlab/gitea's
  classify dispatch, mirroring #495. That is implementer/production territory, not mine.

Set `KAOLA_CLASSIFIER_MOCK_SCRIPT` in the env for all four editions anyway (harmless no-op on
gitlab/gitea, future-proofs the fix if the hook is ever ported) and left `EDITIONS` and every
assertion (including Part C's `equal(EDITIONS.length, 4, 'NON-VACUITY...')`) untouched — I did not
narrow the file's own claimed scope to "2 of 4 editions" unilaterally; that is a values call
(accept the loss vs. port the hook) for the team-lead/owner, not a fixture-design call for me.

### Gate

| Gate | Result |
|---|---|
| `node scripts/test-forge-bundle-lane.js` | **exit 1** — **22 FAILED, 37 passed** (was 40 FAILED, 19 passed). `root`: 0 failures. `codex`: 0 failures. `gitlab`: 10 failures. `gitea`: 10 failures. Plus 2 cross-edition (Part C) failures from the 2-way split. All 22 trace to the one blocker above. |

### Mutation proof

Reproduced #862 directly: dropped `selectionRecordBytes` from the `claimBundle` opts object in
`kaola-workflow-claim.js` (the exact historical defect this file exists for). `root`'s leg reds
immediately:
```
FAIL: root: the selection record was PERSISTED at .cache/origin/selection-record.json — this is the exact byte the dead port dropped
FAIL: root: the persisted selection record is BYTE-IDENTICAL to what the caller authored
...
test-forge-bundle-lane: 28 FAILED, 31 passed   (was 22 FAILED, 37 passed)
```
Restored from snapshot; re-verified 22 FAILED / 37 passed (unchanged from before the mutation).

## Job 3 — `scripts/test-forge-finalize-findings.js`

### Root cause (already established by the brief) and what I built on top of it

Confirmed structurally: `existingPaths` in `cmdFinalize`'s linked-run archive-stage block
(`claim.js:4825-4837`) is `['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md']` filtered by
`fs.existsSync`, PLUS `destRel` only when it does not start with `..` — and `destRel` can **never**
not start with `..` on a genuinely linked run (`dest` lives under MAIN's project root; a linked
worktree's own root can never be an ancestor of that — confirmed by reading `mainRootFromCoord`/
`getCoordRoot` in `kaola-workflow-adaptive-schema.js:511-539`, and separately by measuring that an
in-place, non-worktree run resolves `mainRoot2 === linkedRoot2` and skips this ENTIRE block, so
`archive_stage` is structurally 'skipped' there too — there is no non-worktree path that reaches this
mechanism at all). With `reconcileRoadmapForClosure` retired, nothing puts the two fixed paths in a
linked worktree any more, so `existingPaths` is permanently empty on any linked run that doesn't
plant them itself.

**What changed:**

1. **Healthy-control leg**: changed the assertion from a blanket `archive_stage === 'staged'` to
   **edition-aware**: `ed.unstageType ? 'skipped' : 'staged'`.
   - root/codex (`unstageType: true`): `'staged'` is set ONLY inside `if (existingPaths.length > 0)`
     (`claim.js:4839-4843`) — a genuinely SEPARATE step from the unconditional `git rm --cached` that
     un-stages the live folder. Retirement leaves this inner block permanently unreached on a healthy
     run → `'skipped'` (the documented default) is the honest, now-observed answer.
   - **gitlab/gitea (`unstageType: false`) are UNAFFECTED by the retirement and still read
     `'staged'`** — measured directly in `kaola-gitlab-workflow-claim.js:4541-4557`: their
     `archive_stage = 'staged'` is set UNCONDITIONALLY once the combined
     `git rm --cached <live folder>` (+ optional `git add` over existing candidates) succeeds; it was
     NEVER gated on the two roadmap paths existing. My first attempt at this fix asserted `'skipped'`
     for all four editions and reds gitlab/gitea for the wrong reason — caught by running the file,
     not assumed; fixed to the edition-aware form above.
2. **Fault-injection leg** (`archive_stage_failed`/`archive_unstage_failed`): added an
   `archiveStageCandidates` fixture option that plants the SAME two fixed candidate paths Part C
   (`ignoredArchivePath`) already plants — same constants (`IGNORED_ARCHIVE_PATH`,
   `ADDABLE_ARCHIVE_PATH`), same untracked shape, WITHOUT the `.gitignore` rule — so
   `existingPaths.length > 0` genuinely holds and `lockIndex` genuinely fails the `git add` this leg's
   assertions are about. **Did NOT plant this for the healthy-control leg** (ruled out explicitly) —
   doing so there would recreate exactly the accident retirement exposed. Used only for the
   fault-injection fixture, which needs SOMETHING to fail staging on and was never claiming a healthy
   run's natural state.

**Where the brief's mechanism description ("a non-linked fixture where the dest is inside the repo")
did not match what I could measure, flagged rather than silently reinterpreted:** I could not find any
fixture shape — linked or non-linked — where `result.dest` resolves inside a linked worktree's `root`
(structurally impossible per the `mainRootFromCoord` analysis above), and a genuinely non-linked
(in-place) run never enters this code block at all (`mainRoot2 === linkedRoot2` short-circuits it), so
there is no "non-linked fixture" that reaches `archive_stage_failed` either. What I built instead —
reusing Part C's own already-accepted, already-working technique (direct-planting the two fixed
candidate paths) for Part B's separate fixture — is what empirically reaches the block, matches "the
block is genuinely reached," and matches "archive_stage itself stays — still meaningful off the linked
[retired-mechanism] path." If this diverges from what was actually intended, please say so — I judged
this the best-supported reading of the ruling's INTENT given what I could verify about the CODE, but
the literal wording pointed somewhere I could not find.

`archive_stage` itself: kept, unchanged, per the ruling ("still meaningful off the linked path").

### Gate

| Gate | Result |
|---|---|
| `node scripts/test-forge-finalize-findings.js` | **exit 0** — **253 passed, 0 failed** (was 244 passed, 9 failed at session start; the 8 `docs/api.md` finding-count-sentence failures noted in the brief as "mine, not yours" were ALREADY GONE by the time I ran this — resolved by the team-lead's concurrent `docs/api.md` edit before I got here. The 9th failure the brief flagged as team-lead's — `archive_unstaged` doc row — was also already resolved. All 9 failures I actually saw and fixed were the `archive_stage`/`archive_unstage_failed`-family ones named in the brief as mine.) |

### Mutation proof

Two mutations, both restored after:

1. Forced `archive_stage = 'staged'` unconditionally (removed the `existingPaths.length > 0` gate) —
   reproduces the pre-retirement-shaped-but-now-wrong behavior. Reds the rebuilt healthy-control
   assertion immediately:
   ```
   FAIL: behavioural[claude/canonical] a healthy LINKED finalize must record archive_stage=skipped
   (nothing left in the worktree to stage — no local roadmap source survives retirement), got:
   ...,"archive_stage":"staged",...
   ```
   (This mutation also cascaded into unrelated Part D failures via an empty-pathspec `git add --`
   side effect — expected collateral from a blunt mutation, not a separate finding.)
2. Renamed the `archive_stage_failed` finding type to `archive_stage_failed_x` at its one call site —
   reds both the rebuilt fault-injection leg (Part B) and the pre-existing Part C leg:
   ```
   FAIL: behavioural[claude/canonical] a failed archive staging must raise the typed finding
   archive_stage_failed; findings: [...,"archive_stage_failed_x",...]
   FAIL: behavioural-C[claude/canonical] the fault must raise archive_stage_failed; findings: [...]
   FAIL: static: canonical and codex must raise the same finding types; ...
   ```
   Restored; re-verified 253 passed, 0 failed both times.

## Gates — final state, each run separately

| Gate | Exit | Detail |
|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) | **0** | 186/186 scenarios passed |
| `node scripts/test-forge-bundle-lane.js` | **1** | 37 passed, 22 failed — all 22 trace to the gitlab/gitea missing-production-seam blocker (Job 2); root+codex are 0 failures |
| `node scripts/test-forge-finalize-findings.js` | **0** | 253 passed, 0 failed |
| `node scripts/validate-script-sync.js` | **0** | "OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync." |

## Where the brief was wrong, or needed correction

- **Job 1's "all 69 call sites keep working untouched" undersold the scope by four tests + one not on
  any list.** `plantRoadmapIssue`'s re-pointing alone was sufficient for 7 of the 11 held tests; the
  other 4 (all closure-audit) needed a SECOND fix (an active folder, since `buildAuditReport`'s
  candidate set used to fold in roadmap-source issue numbers additionally, not only via
  `plantRoadmapIssue`'s file) and, for two of those four, a re-pointed discriminator (the drift class
  they read is itself retired). A twelfth test (`testWatchPrAbandonedClosureInvariantsClean`) needed
  fixing too — it was on none of `m984-stop-reading.md`'s lists and was only found by running the
  full suite past where the prior session's gate run halted.
- **`testClosureAuditTimeoutEnvOverCapFallsBack`'s premise does not reproduce on Node v24.18.0** — a
  pre-existing fact, not something this retirement caused, discovered only because the standard of
  proof required mutating the clamp and it didn't red. Recorded above rather than papered over.
- **Job 2's "same seam, same fix" does not hold for gitlab/gitea** — they classify in-process with no
  mock hook anywhere, a structural difference from root/codex I had to trace through both editions'
  `classifyIssue` implementations to confirm. 22 of `test-forge-bundle-lane.js`'s failures are this,
  and need a production change I did not make.
- **Job 3's "a non-linked fixture where the dest is inside the repo" does not correspond to any
  reachable code path I could find** — measured that `dest` can never resolve inside a linked
  worktree's root (structural, not a fixture artifact) and that a genuinely non-linked run skips the
  entire mechanism. Built the fixture from Part C's own already-working technique instead; flagged the
  divergence explicitly rather than silently reinterpreting it.
- Everything else — scope boundaries (no production code shipped, no `docs/api.md`, test paths only),
  the `KAOLA_WORKFLOW_OFFLINE=1` + hostile-shim invariants for `test-forge-bundle-lane.js`, "don't
  plant roadmap-shaped content to restore 'staged'" for the healthy-control leg, "`archive_stage`
  itself stays" — held exactly as briefed.

Standing by. Everything above is uncommitted in this worktree; nothing pushed, nothing archived, no
production file left modified (verified: `grep -c MUTATION-984` returns 0 across every file I
mutated, and `git diff` on them shows only the prior session's committed-to-worktree changes).
