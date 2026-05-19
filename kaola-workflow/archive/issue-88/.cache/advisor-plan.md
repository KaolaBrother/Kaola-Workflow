# Advisor — Phase 3 Plan Gate: Issue #88

## Verdict: One gap in architect blueprint. Request revision before Phase 4.

## Finding 1 — Gap 5 Missing From Architect (MUST FIX)

The `code-architect` blueprint covers the three-way branch in `repair()` and the `stateLooksValid()` helper (Task B steps B-1 and B-2) but omits Gap 5 entirely.

Gap 5 requires two changes to `stateContent()` in `kaola-gitlab-workflow-repair-state.js`:

**A. Insert `## Ownership Rules` block** between `## Pending Gates` and `## Last Evidence`:
```
## Ownership Rules
main_session_role: orchestrator
implementation_owner: [phase-conditional]
fix_owner: [phase-conditional]
inline_emergency_fallback_authorized: no
```

Phase-conditional values (from `routeResult.phase`):
- Phase 4 → `implementation_owner: tdd-guide` / `fix_owner: tdd-guide or build-error-resolver`
- Phases 5-6 → `implementation_owner: N/A` / `fix_owner: tdd-guide or build-error-resolver`
- Phases 1-3 → `implementation_owner: N/A` / `fix_owner: N/A`

**B. Change** `last_result: reconstructed` → `last_result: state_repaired_from_artifacts`

**Rename safety check**: `grep -rn "reconstructed"` on all GitLab scripts and test files confirms no test asserts on this string. The string appears only in `stateContent()` (line 333) and `route()` (line 267, as `step: 'router-reconstructed'` — different field, not affected). Rename is safe.

**Tests for Gap 5 required** (to be added as a new test block in Task B's test section):
1. Ownership block present: repair a phase-4-routed project; assert state includes `## Ownership Rules` and `implementation_owner: tdd-guide`
2. Phase-conditional non-phase-4: repair a phase-2-routed project; assert `implementation_owner: N/A` and `fix_owner: N/A`
3. `last_result` rename: assert state includes `last_result: state_repaired_from_artifacts`

## Finding 2 — Existing Repair Test Regression (RESOLVED — no change needed)

The existing test at lines 405-415 calls `repair.repair('repair-project', root)` with a state that has `phase: 1` and `next_command: /kaola-workflow-phase1 repair-project`, plus a written `phase3-plan.md`.

Analysis of the new three-way branch against this test:
- `stateLooksValid()` returns `true` (commandOk matches phase 1 pattern; `phase_file` field absent → check skipped; `status: active` present)
- `reconstruct()` finds `phase3-plan.md` → returns `{ phase: 4, nextCommand: '/kaola-workflow-phase4 repair-project', nextSkill: 'kaola-workflow-execute repair-project' }`
- `field(existing, 'next_command')` = `/kaola-workflow-phase1 repair-project` ≠ `/kaola-workflow-phase4 repair-project`
- → Stale branch → write updated state → return `{ repaired: true, stale: true, ... }`
- Existing assertion `result.repaired === true` (strict) → PASSES
- State includes `next_skill: kaola-workflow-execute repair-project` → PASSES
- `## GitLab` and `## Sink` sections preserved → PASSES

Conclusion: no test update needed for this regression concern.

## Finding 3 — Verified Identifiers (RESOLVED)

All identifiers used in the architect blueprint exist in the target files:
- `labelName(label)` → `kaola-gitlab-workflow-classifier.js:11`
- `extractCoarseAreas` → line 58
- `extractFilePaths` → line 46
- `parseDependsOn` → line 71
- `parseAreaLabelsFromText` → line 88 (already exists; NOT in write set)

## Advisor Recommendation

One architect revision required. Scope narrowly to Gap 5:
1. Add `## Ownership Rules` block insertion to `stateContent()` with phase-conditional values
2. Change `last_result: reconstructed` → `last_result: state_repaired_from_artifacts`
3. Add Gap 5 test assertions (ownership block present, phase-conditional values, last_result rename)

After revision: write `phase3-plan.md` and route to Phase 4.
