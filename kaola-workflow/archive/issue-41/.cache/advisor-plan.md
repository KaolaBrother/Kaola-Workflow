# Advisor — Plan Gate: issue-41

Generated: 2026-05-17

## Verdict

Do not proceed to phase3-plan.md until architect-revision-1.md addresses all four blockers. Line-number verification can move into Phase 4 Task 1 prerequisites rather than blocking the plan write.

---

## Blockers (must be fixed in architect-revision-1.md)

### Blocker 1 — `analyzeIssue` crashes when issue is undefined

Task 2 step 1 adds `analysis: analyzeIssue(issue, config)` to the `claim:none` branch of `cmdStartup()`. When claim returns `none`, `issue` may be `undefined`. `analyzeIssue` calls `issueLabelNames(issue)` and reads `issue.body` — both unguarded.

**Required fix (choose one):**
- Skip `analysis` in claim:none receipts entirely (cleanest — no issue to analyze), OR
- Add `if (!issue) return null;` at top of `analyzeIssue` and accept `analysis: null` in receipts.

Edge case 1 in the blueprint addresses "no labels" only, not "no issue object." Verify by reading what `issue` is at the actual claim:none branch before deciding.

### Blocker 2 — `KAOLA_PATH` enum not enforced

Architect code: `workflow_path: process.env.KAOLA_PATH || 'full'`. This records any non-empty string verbatim (`'fasst'`, `'FAST'`, `'1'`, etc.).

**Required fix:**
```javascript
workflow_path: process.env.KAOLA_PATH === 'fast' ? 'fast' : 'full'
```

Phase 6 then only needs to check `=== 'fast'`. Edge case 6 in the blueprint contradicts the actual code — update both.

### Blocker 3 — PR-A validator breaks if PR-B doesn't follow atomically

Task 3 adds `kaola-workflow-fast` to the hardcoded skill list in `validate-kaola-workflow-contracts.js:70-80,125-138`. PR-A lands before PR-B (by dependency). Between PR-A and PR-B landing, `node scripts/validate-kaola-workflow-contracts.js` fails in main because the SKILL.md doesn't exist yet.

**Required fix — split Task 3:**
- Task 3a (PR-A): Only the `<= 265 → <= 266` cap raise in `validate-workflow-contracts.js:177`
- Task 3b (PR-B): Skill-list additions in `validate-kaola-workflow-contracts.js` — alongside Task 7 (SKILL.md creation)

### Blocker 4 — Gap 3 advisor citation pattern undefined

The hook specification says "scan content for advisor citation pattern" without defining the pattern. This is unimplementable as stated.

**Required fix — add explicit regex set to architect.md:**
```bash
ADVISOR_CITATION_REGEX='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)'
```

Example in shell hook:
```bash
echo "$CONTENT" | grep -qiE "$ADVISOR_CITATION_REGEX"
```

---

## Verification Required (gates Phase 4 Task 1, not Phase 3)

Line numbers cited in architect.md (claim.js:953, 1272, 2232, 1294; validate-kaola-workflow-contracts.js:70-80, 125-138, 164-168) were not verified by reading the files. Must be verified at the start of Phase 4 Task 1 before any insertion. Add this as an explicit prerequisite in phase3-plan.md.

---

## Three Surfaced Questions — Resolved

### (a) Plugin.json contradiction
**Resolved: Architect correct.** Phase 1 code-explorer.md was wrong. `.claude-plugin/plugin.json` has no `hooks` key and adding one violates `validate-workflow-contracts.js:162`. Gap 3 hook lives only in `hooks/hooks.json`. Codex has no PostToolUse subsystem — this is ECC-only by design, not by omission. Record as "resolved Phase 1 contradiction" in phase3-plan.md.

### (b) Line numbers
**Verify before Phase 4 Task 1.** Do not implement against architect's recalled numbers.

### (c) #44 order — safe to proceed
**Resolved: Safe.** `constraint-issue44.md` states "#41's gaps can proceed if they do not ADD new auto-pick logic." Blueprint adds no auto-pick: `analyzeIssue` is advisory, `computeRecovery` is informational, `workflow_path` is set from agent-controlled env var. Add explicit assertion to Task 8 tests: "no auto-claim follows claim:none in any code path."

---

## Lower-Priority Notes

- `TOP_TIER_LABEL_REGEX` is shown as module-level const but design decisions say "scoped inside analyzeIssue". Module-level is fine; update design decisions language to say "module-level const above `analyzeIssue`."
- Task 8 Epic 14c/14d assertions must include negative checks ("no subsequent claim call," not just "advisory field present").

---

## Summary of Required Actions

1. Write `.cache/architect-revision-1.md` with fixes for all 4 blockers
2. Write `phase3-plan.md` reflecting revised blueprint (with Task 3 split, KAOLA_PATH fix, analyzeIssue null guard, Gap 3 regex)
3. Add line-number verification as explicit Task 1 prerequisite in phase3-plan.md
4. Add Phase 1 contradiction resolution note to phase3-plan.md
5. Update `workflow-state.md` → step:complete, next_command: /kaola-workflow-phase4 issue-41
