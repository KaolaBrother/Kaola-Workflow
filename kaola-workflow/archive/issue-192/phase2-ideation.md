# Phase 2 - Ideation: issue-192

## Approaches Evaluated

### Option A: Skip archive-only candidates (SELECTED)
- **Summary:** Remove `archiveClosed`'s contribution from the `candidates` union in `buildAuditReport()` (closure-audit.js:211–213). `archiveClosedIssues(root)` continues to be computed and passed into `detectStaleRoadmapSources`. The candidate set becomes `roadmap-source numbers ∪ active-folder numbers` — bounded by local state, never by archive history.
- **Pros:** True root-cause fix (removes unbounded term). Output-preserving for all active detectors (proven: all five detectors traced). No new env vars, no pagination, no per-forge divergence. One-line change × 4 files. Removes noisy `unresolved_closed_state` entries for archive-only numbers.
- **Cons:** Loses remote re-verification of archive-only numbers — but no detector uses those results, so there is no behavioral loss. The `unresolved_closed_state` output change (fewer entries) is technically observable but is strictly less noise, and is sanctioned by AC #2.
- **Risk:** Low
- **Complexity:** Small

### Option B: Batch list (`gh issue list --state closed`)
- **Summary:** Replace per-candidate `probeIssueState` loop with one `gh issue list --state closed --json number --limit N`; intersect returned numbers with candidates.
- **Pros:** Single round-trip regardless of candidate count.
- **Cons:** Pagination is a real hazard — `--limit 1000` is a repo-size-dependent magic number; >1000 closed issues silently drops candidates (turns hang into silent correctness bug). All-or-nothing timeout (coarser failure). Per-forge `--limit`/`--per-page` divergence. Larger diff, more test surface.
- **Risk:** Medium (pagination silent-correctness hazard)
- **Complexity:** Medium-Large

### Option C: Hybrid (A + B)
- **Summary:** Skip archive-only (A) AND batch the remaining candidates (B).
- **Pros:** Fewest round-trips in theory.
- **Cons:** Inherits all of B's risks to optimize a candidate set that A already bounded. Violates "keep it simple."
- **Risk:** Medium
- **Complexity:** Large

## Advisor Findings

Advisor confirmed Approach A on two independent grounds:

1. **Invariant proof holds** — archive-only numbers have probe results that no detector reads. The only observable output delta is that archive-only numbers that time out stop appearing in `unresolved_closed_state` — strictly less noise.

2. **AC #2 explicitly sanctions A** — "Archived `status: closed` evidence is handled without revalidating every historical issue when that is sufficient for local drift classes." Approach B's only added capability verifies data no detector consumes while importing a pagination silent-correctness risk.

Three downstream requirements flagged:
- **Correctness-critical edit boundary:** Remove ONLY `archiveClosed` from candidates; keep `archiveClosedIssues()` computed and passed to `detectStaleRoadmapSources`. Over-removal silently breaks stale-roadmap-source detection.
- **Test must fail against old code** (50 archive-only + 1 roadmap-source → old=51 probes, new=1 probe). Must use `KAOLA_WORKFLOW_OFFLINE:'0'` and counting shim must read-increment-write to disk.
- **Read actual code before editing** — line numbers passed through two agent summaries; GitLab/Gitea are not line-for-line identical to canonical.

## Selected Approach

**Approach A — Skip archive-only candidates from `collectClosedSet`'s input**

Rationale: Removes the unbounded archive term from candidates with a one-line, output-preserving, synchronous-model-preserving change, identical across all four editions. AC #2 explicitly endorses trusting local archive evidence without remote revalidation. Approach B adds risk to verify data no detector consumes.

## Out of Scope (explicit)

- No async/`Promise.all`/parallel probes — forbidden by the `execFileSync`-only constraint
- No pagination machinery or `--limit` tuning
- No new env var or config knob
- No changes to `probeIssueState`, `collectClosedSet` signature, offline path, or `skipped_timeout` sentinels
- No touching `detectStaleLabels` or `detectUnarchivedPrFolders`
- No re-architecture of `buildAuditReport` beyond removing the archive term from `candidates`
- No change to the logic that computes `archiveClosed` — it still feeds `detectStaleRoadmapSources`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
