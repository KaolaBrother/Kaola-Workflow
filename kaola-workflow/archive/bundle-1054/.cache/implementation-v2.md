# #1054 Part 1 — remove finalize's Mission List parsing/reporting

## Files changed + line ranges (canonical pre-edit line numbers)

- `scripts/kaola-workflow-claim.js`
  - Removed lines 4212-4279: the "(C) THE RUN RECORD THAT DISAGREES WITH ITSELF" comment block,
    `MISSION_ITEM_LINE` / `MISSION_STATUS_LINE` / `MISSION_RESULT_LINE`, `probeMissionListCoherence`,
    `persistMissionListToSummary`.
  - Edited the "THE THREE FINALIZE REPORTS" comment (~4654-4682): retitled "THE TWO FINALIZE
    REPORTS", dropped the `mission_list` bullet and its trailing sentence fragment about a
    self-contradicting record; removed `let finalizeMissionList = null;`, the
    `finalizeMissionList = probeMissionListCoherence(finalizeAuthorityDir);` call, and the
    `persistMissionListToSummary(finalizeAuthorityDir, finalizeMissionList);` call.
  - Edited the envelope block (~5505-5525): dropped `mission_list` from the doc comment above
    `finalizeEmit` and removed `if (finalizeMissionList) finalizeEmit.mission_list = ...`.
  - `computeGoalDeclaration` / `parseGoal` (the H1 goal read), `changed_paths`, `validation`: all
    untouched.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — identical 3 edits,
  hand-ported (confirmed the block was byte-identical to canonical before editing).
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — identical 3 edits,
  hand-ported (same confirmation).
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — propagated via
  `node scripts/edition-sync.js --write` (1 file updated, codex-sync); confirmed byte-identical to
  canonical.

## Grep across all 4 trees (canonical, codex, gitlab, gitea)

`mission_list`, `probeMissionListCoherence`, `persistMissionListToSummary`, `MISSION_ITEM_LINE` →
**0 hits in all 4 files.**

## Verification (exit codes)

| command | exit |
|---|---|
| `node scripts/validate-script-sync.js` | 0 — OK: 14 common scripts, 25 byte-identical groups, 5 forge export-superset families |
| `node scripts/test-validate-script-sync.js` | 0 — 56 assertions passed |
| `node scripts/test-forge-finalize-findings.js` | 0 — 233 passed, 0 failed |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 |
| `node scripts/test-finalize-door.js` | 1 — 839 passed, 7 failed (see below) |

## test-finalize-door.js failures (expected — the retired pins tdd-1054 is rewriting)

All 7 failures are in T17a/T17b/T17c, and all assert that finalize fills an EMPTY, pre-planted
`## Mission List` heading with the run record's item count / a status-vs-outcome contradiction —
exactly the behavior removed in this change:

1. T17a: "`## Mission List` was planted EMPTY by the Step 6 template and finalize computed its
   finding, so the finding must be IN it. ...; got \"\""
2. T17a: "the pre-planted `## Mission List` reports the run record's item count (2 items in this
   fixture); got \"\""
3. T17a: "...and the contradiction it found — the second item fills in an outcome while its status
   still reads `in-flight`; got \"\""
4. T17b: "`## Mission List` was planted EMPTY by the Step 6 template...; got \"\""
5. T17b: "the pre-planted `## Mission List` reports the run record's item count (2 items in this
   fixture); got \"\""
6. T17b: "...and the contradiction it found...; got \"\""
7. T17c: "...and so was the empty `## Mission List`; got \"\""

Did not edit `scripts/test-finalize-door.js` per instruction.

## Confirmed behavior

An orchestrator-authored `## Mission List` section in `finalization-summary.md` is left exactly as
written: `persistValidationToSummary` and `persistChangedPathsToSummary` still run (writing
`## Validation` / `## Changed Paths`), and nothing now targets `## Mission List` at all — neither
inserting content into an empty pre-planted heading nor creating the heading itself.

## Not touched (per brief, reserved for Part 2)

`scripts/kaola-workflow-ledger-compare.js` and its callers — untouched, pending the investigator's
trace at `kaola-workflow/bundle-1054/.cache/sync-guard-trace.md` and a separate Part 2 brief.

## Everything requested was satisfied

The only gap is the pre-existing T17 pins in `test-finalize-door.js`, explicitly called out in the
brief as tdd-1054's to rewrite.

---

# #1054 Part 2 — content-based mirror protection (compareLedgers), no counting

Note: the worktree was reset to baseline `662bcd33` between Part 1 and Part 2 (per team-lead), so
Part 1's edits above were re-applied fresh as part of this Part 2 pass over the same files.

## Files changed

- `scripts/kaola-workflow-ledger-compare.js` — rewritten. `countComplete` removed. `compareLedgers`
  decides by CONTENT: dest absent/empty → safe `first_sync`; dest byte-identical to src → safe
  `identical`; otherwise → unsafe `content_diverged` carrying a bounded `diff` (via `diff -u`,
  falling back to `git diff --no-index`, written to a `mkdtempSync` scratch dir); if neither tool
  produces output → unsafe `diff_unavailable`, `diff: ''`. `sourceComplete`/`destComplete` removed
  from the returned shape. CLI text/`--help` output updated to match; `module.exports` now
  `{ compareLedgers, main }` (`countComplete` no longer exported).
- `scripts/kaola-workflow-claim.js`
  - `mirrorFinalizationArtifacts` (~3555-3665 baseline): doc comment rewritten to describe the
    content-based decision and the retired auto-repair. On `!verdict.safe`, the `mergeCopyDir`
    worktree→main "repair" + re-compare is REMOVED entirely; the function now refuses immediately
    under the same pinned `mirror_sync_failed` reason, with `detail` naming both absolute paths
    (`srcRecord`, `destRecord`) plus `verdict.diff` when present. Safe branch: `ledgerCompare =
    'pass'` (kept as-is, covering both `first_sync` and `identical`, preserving the existing
    envelope token for the non-divergent case).
  - `probeFinalizeMirror` (~3863-3932 baseline): `sync_required` state retired — any unsafe verdict
    now returns `state: 'sync_failed'` unconditionally (the writability probe that used to
    distinguish `sync_required`/`sync_failed` is removed, since the transaction never auto-repairs a
    divergence any more). Doc comment and the state-token list updated accordingly.
  - `predictFinalizeAuthority`'s doc comment (~4017-4025 baseline): dropped the "exactly as
    `sync_required`" cross-reference (that state no longer exists); `pending_mirror` behavior itself
    unchanged.
- Hand-ported the identical 4 edits into `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
  and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (confirmed blocks were
  byte-identical to canonical pre-edit).
- `mergeCopyDir` is NOT dead: still called at claim.js:592 (worktree/main archive residue merge,
  unrelated) and at the retained main→worktree copy (~3639 post-edit). No removal needed.

## Propagation

`node scripts/edition-sync.js --write` → 4 files updated: codex-sync
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, byte-sync all 3 non-canonical copies of
`kaola-workflow-ledger-compare.js`. Confirmed byte-identical to canonical via `diff`/`cmp` after.

## Verify (exit codes)

| command | exit |
|---|---|
| `node scripts/validate-script-sync.js` | 0 — OK: 14 common scripts, 25 byte-identical groups, 5 forge export-superset families (confirms `countComplete` removal is fine — not in any export-superset family) |
| `node scripts/test-validate-script-sync.js` | 0 — 56 assertions |
| `node scripts/test-ledger-compare.js` (tdd-1054 had ALREADY rewritten this file by the time I ran it) | 0 — 22 assertions, all new content-based pins, none weakened |
| `node scripts/test-issue-1054-ledger-guard.js` (tdd-1054's new part-2 acceptance suite, appeared mid-task) | **1 — 26 passed, 2 failed** (see below) |
| `node scripts/test-finalize-door.js` (tdd-1054 had ALREADY rewritten the T17 pins) | 0 — 839 assertions, no failures |
| `node scripts/test-forge-finalize-findings.js` | 0 — 233 passed |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 |
| `node scripts/test-claim-hardening.js` (NOT in the brief's list; ran it proactively since it pins the retired repair) | **1 — 827 passed, 6 failed, all T2a** (see below) |

### test-issue-1054-ledger-guard.js — 2 failures, believed to be a TEST FIXTURE bug, not a production defect

2a and 2b assert `readMissionList(fx.wtPath, project)` finds the record after a successful
`finalize --keep-worktree` (status 0 in both cases — the mirror/archive itself succeeded). Both got
`null`. Root cause: `archiveProjectDirSafely` always archives into the **main root**
(`kaola-workflow/archive/<project>/mission-list.md` under `fx.mainRoot`), never under the linked
worktree — confirmed directly by walking both trees after a reproduction run, and confirmed as
pre-existing, unrelated-to-this-issue behavior by `scripts/test-forge-finalize-findings.js:392`,
which reads its own archived summary from `fx.mainRoot`, not the worktree. The new fixture's
`readMissionList` helper only checks `fx.wtPath` (live) then `fx.wtPath/kaola-workflow/archive/`
(archived) — never `fx.mainRoot`. Did not edit the test file. This looks like a one-line fixture fix
(check `fx.mainRoot`'s archive too) for tdd-1054, not a defect in `compareLedgers`,
`mirrorFinalizationArtifacts`, or `probeFinalizeMirror`.

### test-claim-hardening.js — 6 failures, all in T2a, expected fallout (not in the brief's required list; ran proactively)

T2a pins the exact retired behavior: "staler main + writable → `--check` classifies `sync_required`
... the transaction then repairs worktree→main (worktree wins, `ledger_compare:
synced_from_worktree`)". This is precisely the automatic repair the corrected #1054 scope removes.
T2b (staler main + unwritable → fail-closed) and T2c (first sync → `ledger_compare: 'pass'`) both
still pass. Did not edit the test file.

## Direct measurements (all match the brief's expectations exactly)

- `compareLedgers(bundle-1053 table, same)` → `{"safe":true,"reason":"identical"}`
- `compareLedgers(3-rows-stripped, full)` → `safe:false, reason:'content_diverged'`, diff names the
  missing row content (verified: the removed mission rows appear as `-` lines in the diff)
- `compareLedgers(lineA, lineA-with-done→todo)` → `safe:false, reason:'content_diverged'`, diff shows
  the `status: done` → `status: todo` change
- `compareLedgers(x, null)` → `{"safe":true,"reason":"first_sync"}`

## Not done / flagged, not fixed

- `docs/api.md:1808-1809` still documents `countComplete(missionListText)` as a public function of
  `kaola-workflow-ledger-compare.js` — now stale. Left untouched, same as Part 1's `mission_list`
  envelope-field doc drift — the trace (§2/§97-99) and Part 1's report both flagged documentation as
  a separate item (#1054's "item 4"), not assigned to me in either brief.
