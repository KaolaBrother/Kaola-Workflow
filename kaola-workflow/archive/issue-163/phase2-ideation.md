# Phase 2 - Ideation: issue-163

## Approaches Evaluated

### Option A: Minimal receipt wiring (no audit command)
- Summary: `clearAdvisoryClaim` returns enum; fallback issue number; emit `claim_label_removed`; extend invariant check. Defer audit/repair to #165.
- Pros: Smallest diff; low regression risk.
- Cons: Does NOT satisfy AC3/AC4 as written (audit + execute mode). Requires AC renegotiation.
- Risk: Medium (depends on maintainer accepting AC deferral)
- Complexity: Low

### Option B: Full AC delivery — receipt + audit/repair (SELECTED)
- Summary: Option A plus `audit-labels` (dry-run) + `--execute` to remove stale labels. GitHub only for audit/repair subcommands; GitLab/Gitea get receipt wiring only. Follows `stale-worktree-check`/`stale-worktree-cleanup` convention.
- Pros: Satisfies all ACs as written. Reuses proven pattern. Audit surface is simpler than worktree cleanup (binary present/absent).
- Cons: Larger diff than Option A.
- Risk: Low (established pattern)
- Complexity: Medium

### Option C: Unified label-receipt helper (anticipating #164)
- Summary: Extract `labelCleanup()` helper designed for #164 shared executor.
- Pros: One code path for all callers.
- Cons: Speculative abstraction. CLAUDE.md prohibits. #164's concrete requirements unknown.
- Risk: High (over-engineering; anchors #164 design)
- Complexity: Medium-High

## Advisor Findings

Advisor confirmed Option B. Key locked decisions:

**D1 — GitHub-only audit/repair subcommands**: GitLab/Gitea get receipt wiring only. Half-finished cross-forge subcommands cause more confusion than absent ones.

**D2 — Offline invariant SKIPS (not FAILS)**: When `OFFLINE=1`, `in-progress-label-removed` invariant must SKIP, not violate. Receipt value `'skipped_offline'`; cannot verify without remote read.

**D3 — Test surface**: Need ≥5 tests with stateful gh.js shim covering: finalize happy path, null-folder fallback, offline, watch-pr receipt, audit dry-run + execute.

**D4 — `removed` vs `already_absent`**: API success → `'removed'`. Probe-first `already_absent` detection is future work.

**Advisory on context risk**: Advisor flagged #164 and #165 remain at non-trivial complexity. If context pressure drops quality, pause and report rather than declaring success on weak signals.

## Selected Approach
Option B: Full AC delivery — receipt wiring + GitHub-only audit/repair subcommands.

**Why**: AC3 ("audit command") and AC4 ("execute mode") are explicit deliverables. Option A requires AC renegotiation. Option C adds speculative abstraction (CLAUDE.md prohibits). The label-audit surface is simpler than worktree cleanup.

## Out of Scope (explicit)
- Sink-merge label receipt (bare ghExec not mockable; defer to #164)
- `emptyReceipt()` seeding (#164)
- `cmdRelease` abandoned-path receipt
- `already_absent` probe-first detection
- `labelCleanup()` abstraction (Option C)
- Stale label cleanup on open issues
- GitLab/Gitea audit/repair subcommands

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
