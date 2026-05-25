# Phase 2 - Ideation: issue-166

## Approaches Evaluated

### Option A: Faithful parity port (dedicated standalone script) — SELECTED
- Summary: New `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
  mirroring `scripts/kaola-workflow-closure-audit.js` structurally; all remote calls
  through the forge object; PR→MR substitutions only; preserve GitHub JSON shape.
- Pros: Matches AC ("JSON matching the GitHub shape, MR where PR applies"); mirrors the
  established dedicated-script pattern; minimal blast radius; symmetric with GitHub source
  so future maintenance tracks 1:1.
- Cons: Touches two shared GitLab modules additively (forge.listIssues, roadmap exports).
- Risk: Low. Complexity: Medium.

### Option B: Receipt-adopting port (closure-contract wired in)
- Summary: Same script but builds closure receipts / invariants like cmdWatchMr.
- Pros: Consistent with the receipt-heavier parts of the GitLab edition.
- Cons: Breaks JSON shape parity with GitHub (violates AC); conflates drift-reporting with
  closure-execution surfaces the codebase deliberately separates; closure-audit is a
  REPORTER (sibling of stale-worktree-check), not an executor.
- Risk: Medium. Complexity: Large. REJECTED.

### Option C: Self-contained script with raw glab escape hatch
- Summary: New script calls `forge.glabExec([...])` / client-side label filtering instead
  of extending the forge.
- Pros: New file fully self-contained; no shared-module edits.
- Cons: Breaks the GitLab "all glab goes through the forge" convention (grep-proven: the
  only glabExec call site outside forge is a forge unit test); client-side filtering is
  unbounded as issue history grows.
- Risk: Medium (convention drift / scaling). REJECTED.

## Five design decisions (resolved)
- **D1 Stale-label detection**: extend `forge.listIssues({state, labels})` additively
  (`args.push('--label', label)` per label). Verified `glab issue list` uses `--label`.
- **D2 MR vs PR rename + state casing**: rename only PR-specific surface
  (`unarchived_mr_folders`, `mr_url`, `mr_state`, `sink==='mr'`, `f.mr_url`); KEEP
  `issue_number` in output items; inline `mrIidFromFolder` (mr_iid or regex on mr_url);
  compare **lowercase** `state==='merged'||state==='closed'` (NO .toUpperCase()). Highest-risk
  silent bug — guard test named explicitly.
- **D3 roadmapDir**: add `roadmapDir` to GitLab roadmap module exports (restores symmetry
  with GitHub; single source of truth for the .roadmap path).
- **D4 Archive issue field**: inline `field(content,'issue_iid')||field(content,'issue_number')`
  read; do NOT export the private `firstPositiveInteger`. Without iid-first read, class (d)
  archive_closed drift never fires on GitLab archives.
- **D5 Closure-contract**: NO. Stay a minimal faithful mirror; closure-audit is a reporter,
  not a closure executor; AC requires GitHub shape parity.

## Advisor Findings
Advisor verdict: plan sound, proceed; no missed approaches, no risk re-rating. Required
three pre-Phase-3 verifications — all completed: (1) `glab issue list` label flag is
`--label` (singular, repeatable); (2) no separate `plugins/kaola-workflow-gitlab-codex/`
tree (only 3 plugin trees → no extra copy/sync obligation); (3) add a direct forge-API
test for `listIssues({labels})` in `test-gitlab-forge-helpers.js` separate from
audit-behavior tests. D2 lowercase-state compare flagged as highest-risk silent bug —
name the guard test to make the casing constraint visible. Full text in
`.cache/advisor-ideation.md`.

## Selected Approach
**Option A — Faithful parity port.** Dedicated standalone
`kaola-gitlab-workflow-closure-audit.js`, all remote calls through the forge (D1a extend
listIssues), export roadmapDir from GitLab roadmap (D3a), inline mrIidFromFolder +
lowercase MR-state compare (D2), inline issue_iid-first archive read (D4), no
closure-contract (D5a). Preserves GitHub JSON shape with PR→MR substitutions only.

## Out of Scope (explicit)
- No folder/worktree deletion in `--execute`; classes (e)/(f) report-only in both modes.
- No new drift classes beyond the five output keys.
- No receipt / closure-contract wiring.
- No GitLab port of `audit-labels`/`repair-labels` (separate concern; remain GitHub-only).
- No edits to GitHub source `scripts/kaola-workflow-closure-audit.js` (parity port — don't
  drift the source).
- No new test framework (hand-rolled assert only).
- No widening of active-folders' public API; no client-side issue dumping for labels.
- No rename of `issue_number` in output items.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md (model=opus; Sonnet rate-limited) | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
