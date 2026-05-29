# Phase 2 - Ideation: issue-190

## Approaches Evaluated

### M1 — Option A: Faithful logic port with reference adaptation (SELECTED)
- Summary: Insert full `## Startup Step 0a-1 — Path Intent` section (from commands/workflow-next.md:80-117) between `## Startup Step 0a` and `## Startup` in each of the 3 Codex SKILLs, with 3 per-edition adaptations. Append 3 lines to `## Required Output` in each.
- Pros: Full behavioral parity with Claude command; keeps safety-critical fast-path eligibility rubric; additive only; Parallel decision and Workflow path are free (KAOLA_VERDICT and KAOLA_PATH already in scope); anti-drift protection via new contract assertions.
- Cons: ~35 lines × 3 files of prose; three reference substitutions must be correct per edition.
- Risk: Low
- Complexity: Low-Medium

### M1 — Option B: Minimal/simplified Codex variant
- Summary: Keep only rules 1-2 (honor KAOLA_PATH, prompt sniff) and default-full, drop issue-fetch rubric.
- Pros: Less prose.
- Cons: Drops the structural eligibility check that is the entire point of the gate; creates Claude/Codex behavioral divergence; defeats the issue intent.
- Risk: Medium
- Complexity: Low

### M1 — Option C: Shared snippet include
- Summary: Extract Step 0a-1 once; reference from all editions.
- Pros: Single source.
- Cons: No include mechanism in SKILL.md prose; fetch line must differ per edition anyway; over-engineered.
- Risk: Medium
- Complexity: Medium-High

### M2 — Delete stale vars (only approach)
- Remove 5 env-var blocks + hook ref from .env.example; remove docs/api.md:109.
- Risk: Low (pending liveness grep confirmation)
- Complexity: Small

### M3 — Hand-edit package-lock.json (SELECTED over npm install)
- Edit lines 3 and 9: "3.16.0" → "3.16.1"
- npm install risks churning lockfile with unrelated dependency changes.
- Risk: Low
- Complexity: Small

## Advisor Findings
Approach A endorsed. Three lock-down items before implementation:
1. Grep validators before editing SKILL.md; add presence-assertions for new sections as Phase 4 RED→GREEN target (anti-drift guard, precedent: issue #174).
2. M2 liveness grep is mandatory — all 5 vars must hit only .env.example and docs/api.md:109 before deletion.
3. `export KAOLA_PATH=fast` must be contiguous with `node … startup` in the same shell (not across subprocess boundaries).

## Selected Approach
- **M1:** Option A — faithful port with per-edition reference adaptation, plus contract assertions as regression guard.
- **M2:** Direct deletion after mandatory liveness grep.
- **M3:** Hand-edit (lines 3 and 9).

## Out of Scope (explicit)
- No `--path` CLI flag on startup script
- No bash-block edits in `## Startup` sections
- No separate classifier invocation (reuse KAOLA_VERDICT)
- No shared-snippet abstraction
- No simplification of the eligibility rubric
- No `npm install` for M3
- No edits to `commands/workflow-next.md`
- No changes beyond the 6 named files unless grep surfaces an unexpected reference

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
