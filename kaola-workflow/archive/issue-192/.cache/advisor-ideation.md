# Advisor Output — Ideation Gate, issue-192

## Decision: Proceed with Approach A

**Both lines of evidence converge on A:**

1. The planner's invariant proof is solid. Archive-only numbers have probe results that no detector reads. All five detectors traced — invariants hold. The only observable output delta is that archive-only numbers that time out stop appearing in `unresolved_closed_state`, which is strictly less noise.

2. AC #2 explicitly sanctions A: "Archived `status: closed` evidence is handled without revalidating every historical issue when that is sufficient for local drift classes." That is a near-verbatim description of Approach A. Approach B's only added capability — remotely re-verifying archive-only numbers — verifies data no detector consumes, while importing the pagination silent-correctness risk. A wins on the issue's own terms.

The `unresolved_closed_state` delta is not materially user-owned given AC #2. No user escalation needed.

---

## Three Things to Nail Downstream

**1. Correctness-critical edit boundary:** Remove ONLY `archiveClosed`'s contribution to the `candidates` union. Keep `archiveClosedIssues(root)` computed and still passed into `detectStaleRoadmapSources`. If the implementer over-removes (deletes the whole `archiveClosed` computation), stale-roadmap-source detection silently breaks while the obvious tests still pass. Call this out explicitly in Phase 3 plan.

**2. Test must be a real regression guard (not a rubber-stamp):**
- Must **fail against the current code** (50 archive-only + 1 roadmap-source → old code probes 51, new code probes 1)
- Must use `KAOLA_WORKFLOW_OFFLINE:'0'` — otherwise `probeIssueState` short-circuits and view-count is 0 regardless of the fix
- Counting shim must read-increment-write to disk (each `gh` call is a fresh `execFileSync` subprocess; in-memory counter won't survive)

**3. Ground the edit in actual code:** Line numbers and the candidates assembly shape (`.concat`? spread? Set union?) have passed through two agent summaries. Read the real lines in all four files before touching them. After editing canonical + Codex copy, run `validate-script-sync.js` plus all three suites. GitHub vs GitLab line-number difference (211–213 vs 213–215) is a hint the files aren't identical line-for-line — don't assume a blind copy works.
