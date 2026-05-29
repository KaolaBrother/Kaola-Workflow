# Planner Output — issue-192

## Problem Restatement

`buildAuditReport()` builds `candidates` as the union of three sources, then `collectClosedSet()` does one blocking `gh issue view` round-trip per distinct number:

```
candidates = roadmap-source numbers  ∪  archiveClosed (111 numbers)  ∪  active-folder numbers
```

The archive set is unbounded (grows with every closed issue) and dominates the candidate count. At 30s timeout each, 111 archive-only probes is a ~55-minute worst case. The Phase 1 finding — **archive-only probe results are never consumed by any detector** — is the lever for the fix.

### Verified invariants

1. `detectStaleRoadmapSources` (closure-audit.js:111) uses `archiveClosed.has(n)` directly; it never reads archive numbers out of `closedSet`. `closed_remote` only applies to numbers that have a roadmap source file — already probed regardless.
2. `detectMirrorClosed` (closure-audit.js:128) reads `readRoadmapIssues` which enumerates the same `issue-N.md` files as `roadmapSourceFiles()`. Mirror numbers ⊆ roadmap-source numbers. All already probed.
3. `detectActiveClosedFolders`, `detectUnarchivedPrFolders`, `detectStaleLabels` operate only on active folders / their own calls — none consume archive-only probe results.

---

## Approaches

### Option A: Skip archive-only candidates (RECOMMENDED)

**Summary:** Remove `.concat(Array.from(archiveClosed))` from the `candidates` assembly in `buildAuditReport()` (closure-audit.js:211–213). `archiveClosed` continues to be computed and passed into `detectStaleRoadmapSources` as today. Candidate set becomes `roadmap-source numbers ∪ active-folder numbers` — bounded by local working state, never by archive history.

- **Complexity:** Small (one-line change per file × 4 files)
- **Risk:** Low
- **Architectural fit:** Excellent — "surgical change", no new env vars, no pagination, no per-forge divergence
- **Pros:** True root-cause fix. Output-preserving for all active detectors (proven by invariants). Removes noisy `unresolved_closed_state` entries for archive-only probes that no detector consumes.
- **Cons:** Loses remote re-verification of archive-only numbers — but no detector uses that result. The `unresolved_closed_state` output change is technically observable (archive-only entries disappear) but is strictly less noise.

### Option B: Batch list (`gh issue list --state closed`)

**Summary:** Replace per-candidate `probeIssueState` loop with one `gh issue list --state closed --json number --limit N`, intersect returned numbers with candidates.

- **Complexity:** Medium-Large
- **Risk:** Medium — pagination is a real hazard: `--limit 1000` is repo-size-dependent magic; a repo with >1000 closed issues silently drops candidates (turns hang into silent correctness bug)
- **Pros:** Single round-trip regardless of candidate count
- **Cons:** Pagination cap, per-forge `--limit`/`--per-page` divergence, all-or-nothing timeout (coarser failure mode), larger diff, more test surface
- **Note:** Re-verifies archive-only numbers remotely, but no detector reads those results — the "benefit" is illusory

### Option C: Hybrid (A + B)

**Summary:** Skip archive-only (A) AND batch the remaining candidates (B).

- **Complexity:** Large
- **Risk:** Medium (inherits B's risks)
- **Architectural fit:** Poor — active+roadmap candidate set is already bounded once A is applied, so batching it adds all of B's risks for negligible incremental benefit
- **Verdict:** Violates "keep it simple"

---

## Recommendation: Approach A

**Decisive rationale:** The hang is caused by an unbounded term (`archiveClosed`) in the candidate count whose probe results are provably unused. Approach A removes that term with a one-line, output-preserving change applied identically across all four editions. Approach B's only incremental capability — remote-verifying archive-only numbers — verifies state that no detector consumes, while importing a real silent-correctness risk (pagination cap) and a coarser timeout failure mode.

---

## Test Strategy (Approach A — note: differs from issue's stated assertion)

**IMPORTANT:** The issue AC states "verifies audit completes without N remote calls." The issue text hints at asserting `gh issue list` called once (batch assumption = Approach B). Under Approach A, the correct assertion is: **`gh issue view` call count equals the number of non-archive-only candidates, regardless of archive size.** The test should assert independence from archive size, not assert a batch call.

**New test:** `testClosureAuditLargeArchiveSetDoesNotProbeArchiveOnly`

- Plant 50+ archive-only entries (`kaola-workflow/archive/issue-N/workflow-state.md` with `status: closed`, no `.roadmap/issue-N.md`, no active folder)
- Plant exactly 1 roadmap-source issue (e.g. 950) as the known probe target
- **Counting shim:** extend `closureAuditShim` to a counter-file-per-subcommand shim:
  - On `issue view N`: read `<binDir>/view-count`, increment, write back; emit `{"state":"closed"}`
  - On `issue list`: read/increment/write `<binDir>/list-count`; emit `[]`
  - Uses `fs.readFileSync` (try/catch → 0) + `fs.writeFileSync` (no concurrency issue — scripts are serial)
- **Assertions:**
  - `Number(read('view-count')) === 1` (only the 1 roadmap-source issue probed; archive-only numbers NOT probed)
  - 50+ archive-only numbers absent from `result.drift.unresolved_closed_state`
  - Existing tests `testClosureAuditClosedRemoteRoadmapSource` (900), `testClosureAuditArchiveClosedDrift` (901), `testClosureAuditDedupRoadmapAndArchive` (902), `testClosureAuditUnresolvedClosedState` (910) all still pass

**Port parity:** mirror the test in `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` and `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` using each edition's closure-audit shim helper.

---

## Out of Scope

- No async/`Promise.all`/parallel probes
- No pagination machinery
- No new env var or config knob
- No changes to `probeIssueState`, `collectClosedSet` signature, offline path, or `skipped_timeout` sentinels
- No touching `detectStaleLabels`/`detectUnarchivedPrFolders`
- No re-architecture of `buildAuditReport` beyond removing the archive term from `candidates`

---

## Missing Facts / Assumptions to Confirm

1. No future detector is planned to cross-check archive-local-closed vs remote-open
2. No downstream consumer of `unresolved_closed_state` keys on archive-only entries (report is JSON; confirmed report-only)
3. `detectMirrorClosed` invariant holds: `readRoadmapIssues` ⊆ `roadmapSourceFiles` (confirmed)

---

## Affected Files

- `scripts/kaola-workflow-closure-audit.js:211–213` — remove `archiveClosed` from candidates
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` — byte-identical copy; same edit
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js:213–215` — same edit for GitLab
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` — same edit for Gitea
- `scripts/simulate-workflow-walkthrough.js` — add counting-shim regression test near line 3556
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — mirror test
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — mirror test
