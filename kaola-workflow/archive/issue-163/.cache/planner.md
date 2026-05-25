# Planner — issue-163

## Recommendation: Option B (Full AC delivery — receipt + audit/repair)

### Key Research Corrections vs Initial Analysis
- `clearAdvisoryClaim()` returns nothing — root cause of silent failure
- Fallback must read from `result.dest + '/workflow-state.md'` (archive path, not active path — archive runs first)
- `gh issue edit --remove-label` exits 0 even when label absent → cannot distinguish `removed` from `already_absent` without prior probe → **API success → `'removed'`**; drop `already_absent` precision for now
- `checkClosureInvariants` should SKIP (not FAIL) `in-progress-label-removed` when OFFLINE — invariant cannot be verified without remote read
- Sink-merge bare `ghExec` does not route through `KAOLA_GH_MOCK_SCRIPT` but PATH-shadowing DOES reach it — however sink-merge label receipt belongs to #164
- COMMON_SCRIPTS drift-checked GitHub↔Codex; GitLab/Gitea manual sync

## Option A: Minimal receipt wiring (no audit command)
- Summary: `clearAdvisoryClaim` returns enum; fallback issue number; emit `claim_label_removed`; extend invariant check. Defer audit/repair to #165.
- Pros: Smallest diff; low regression risk.
- Cons: Does NOT satisfy AC3/AC4 as written (audit + execute mode). Requires AC renegotiation.
- Risk: Medium (depends on maintainer accepting AC deferral)
- Complexity: Low

## Option B: Full AC delivery — receipt + audit/repair (RECOMMENDED)
- Summary: Option A plus `audit-labels` (dry-run) + `--execute` to remove stale labels, following `stale-worktree-check`/`stale-worktree-cleanup` convention.
- Pros: Satisfies all ACs as written. Reuses proven pattern. Audit surface is simpler than worktree cleanup (binary present/absent).
- Cons: Larger than Option A.
- Risk: Low (established pattern)
- Complexity: Medium

## Option C: Unified label-receipt helper (anticipating #164)
- Summary: Extract `labelCleanup()` helper designed for #164 shared executor.
- Pros: One code path for all callers.
- Cons: Speculative abstraction. CLAUDE.md prohibits. #164's concrete requirements unknown.
- Risk: High (over-engineering; anchors #164 design)
- Complexity: Medium-High

## Selected Approach: Option B

**Why**: AC3 ("audit command") and AC4 ("execute mode") are explicit deliverables. Option A requires AC renegotiation; Option C adds speculative abstraction. The label-audit surface is simpler than worktree cleanup.

**Phasing**:
1. Receipt wiring in claim scripts (clearAdvisoryClaim + fallback + checkClosureInvariants)
2. Audit/repair subcommands (GitHub; GitLab/Gitea partial)
3. Multi-forge sync + tests

**Decision locked**: API success → `'removed'` (probe-first `already_absent` is future work)

## Out of Scope
- Sink-merge label receipt (bare ghExec, defer to #164)
- `emptyReceipt()` seeding (#164)
- `cmdRelease` abandoned path receipt
- `already_absent` probe-first detection
- `labelCleanup` abstraction (Option C)
- Stale label cleanup on open issues

## Missing Facts
1. Does AC3/AC4 explicitly require audit/repair in #163 or can it defer? → Default to Option B
2. Offline invariant behavior: `claim_label_removed: 'skipped_offline'` + invariant SKIP (not FAIL) when OFFLINE
