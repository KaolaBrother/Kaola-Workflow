# Code Architect — Revision 1: issue-41

Generated: 2026-05-17

Source: advisor-plan.md blocker corrections

---

## Blocker 1 Fix — `analyzeIssue` null guard for missing issue

**Decision**: Skip `analysis` in claim:none receipts entirely. When claim is `none`, there is no selected issue — including an `analyzeIssue` call without an issue object is misleading. The receipt carries `recovery` for agent guidance; `analysis` on a non-existent issue adds noise.

**Implementation**:
- Remove `analysis: analyzeIssue(issue, config)` from claim:none receipt objects in both `cmdStartup()` and `cmdPickNext()`.
- Add null-guard defensively at the top of `analyzeIssue` anyway (belt-and-suspenders):

```javascript
function analyzeIssue(issue, config) {
  if (!issue) return null;
  // ... rest of implementation unchanged
}
```

**Updated Task 2** — claim:none branch receipt fields:
- `cmdStartup()` claim:none: add `recovery: computeRecovery(skipped || [], blocked || [])` only (no `analysis` field)
- `cmdPickNext()` claim:none: same (no `analysis` field)
- `cmdStartup()` acquired: add `workflow_path: process.env.KAOLA_PATH === 'fast' ? 'fast' : 'full'` (see Blocker 2)

**Updated Edge Case 1**: `analyzeIssue` called on `undefined` — returns `null` due to null guard. Not reached in claim:none branch since `analysis` is no longer added there.

---

## Blocker 2 Fix — `KAOLA_PATH` enum enforcement

**Decision**: Strict equality check. Only `'fast'` maps to fast-path; everything else (absent, `'full'`, typos) maps to `'full'`.

**Implementation**:
```javascript
// Before (wrong):
workflow_path: process.env.KAOLA_PATH || 'full'

// After (correct):
workflow_path: process.env.KAOLA_PATH === 'fast' ? 'fast' : 'full'
```

**Updated Edge Case 6**: `KAOLA_PATH` set to unrecognized value → strict equality `=== 'fast'` fails → `workflow_path` records `'full'`. Phase 6 checks `workflow_path === 'fast'` (exact string, never needs to handle other values).

**Phase 6 conditional** (Task 6): check `workflow_path === 'fast'`, not `workflow_path !== 'full'`.

---

## Blocker 3 Fix — Task 3 split across PR-A and PR-B

**Problem**: Task 3 as written adds `kaola-workflow-fast` to the skill list in `validate-kaola-workflow-contracts.js` in PR-A. This causes CI failure between PR-A and PR-B because the SKILL.md doesn't exist yet.

**Fix**: Split Task 3 into Task 3a (PR-A) and Task 3b (PR-B):

### Task 3a (PR-A, Group A-parallel to Task 1) — Cap Raise Only

- File: `scripts/validate-workflow-contracts.js`
- Action: Line 177 — change `<= 265` to `<= 266`
- Validate: `node scripts/validate-workflow-contracts.js`
- Must land: same PR as Task 4 (which adds the 3 lines to workflow-next.md)

### Task 3b (PR-B, Group B — alongside Task 7) — Skill List Addition

- File: `scripts/validate-kaola-workflow-contracts.js`
- Action:
  - Lines 70-80 (verify exact): add `'kaola-workflow-fast'` as 10th entry in skill name list
  - Lines 125-138 (verify exact): add `'kaola-workflow-fast'` to phase-skill iteration
- Validate: `node scripts/validate-kaola-workflow-contracts.js` (must pass with SKILL.md from Task 7)
- Must land: same PR as Task 7 (SKILL.md creation)

**Updated Parallelization Groups**:

| Group | Tasks | Constraint |
|-------|-------|-----------|
| A | 1 → 2 (sequential), 3a (parallel to 1), 4 (after 3a) | claim.js sequential; cap-raise parallel |
| B | 3b, 6, 7 (all parallel to each other) | 3b and 7 must land together |
| C | 5 | fully independent |

---

## Blocker 4 Fix — Gap 3 advisor citation regex defined

**Decision**: Explicit grep-able regex. The hook uses basic POSIX extended regex (no Perl extensions) for POSIX sh portability.

**Citation pattern** (advisor reference in a workflow artifact):
```bash
ADVISOR_PATTERN='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)|\.cache\/advisor-'
```

Shell implementation in hook body:
```bash
if echo "$CONTENT" | grep -qiE "$ADVISOR_PATTERN"; then
  # has advisor citation — verify .cache/advisor-*.md exists
  CACHE_DIR="$(dirname "$FILE_PATH")/.cache"
  if ! ls "$CACHE_DIR"/advisor-*.md >/dev/null 2>&1; then
    echo "phantom-advisor: $FILE_PATH cites advisor but no .cache/advisor-*.md found" >&2
    exit 2
  fi
fi
```

**Known limitation** (unchanged from 3A selection): Only catches citations written to workflow artifact files. Citations only in conversation (never written to a file) are not caught. Documented in phase2-ideation.md.

**Updated Task 5** write-set: `hooks/kaola-workflow-phantom-advisor.sh` (with the above regex and logic), `hooks/hooks.json` (PostToolUse entry).

---

## Additional Corrections from Advisor Notes

### TOP_TIER_LABEL_REGEX placement

Corrected language: `TOP_TIER_LABEL_REGEX` is a **module-level const** defined above `analyzeIssue`. This is intentional — it prevents re-allocating the regex on every call. The design decisions section language is updated: "module-level const above `analyzeIssue`, not folded into `parsePriorityTier`."

### Task 8 negative assertions

Epic 14c and 14d assertions must include negative checks:
- Epic 14c: assert `analyzeIssue` returns the advisory struct AND assert no subsequent auto-claim call was made.
- Epic 14d: assert `computeRecovery` returns correct enum AND assert no subsequent auto-claim follows the claim:none receipt.
- Case 8M: assert claim:none receipt has `recovery` field AND assert no auto-claim in the code path that wrote the receipt.

---

## Line Number Verification (Phase 4 Task 1 Prerequisite)

Architect-cited line numbers were not verified against actual files. Phase 4 Task 1 must begin by verifying:

```bash
# Verify parsePriorityTier boundary and analyzeIssue insertion point
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(948,960).forEach((l,i)=>console.log(i+949,l))"

# Verify cmdStartup() claim:none branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(1268,1280).forEach((l,i)=>console.log(i+1269,l))"

# Verify cmdPickNext() claim:none branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(2228,2238).forEach((l,i)=>console.log(i+2229,l))"

# Verify cmdStartup() acquired branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(1290,1300).forEach((l,i)=>console.log(i+1291,l))"

# Verify validate-kaola-workflow-contracts.js skill list area
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/validate-kaola-workflow-contracts.js','utf8').split('\n'); lines.slice(65,145).forEach((l,i)=>console.log(i+66,l))"
```

Update actual insertion-point line numbers in task list before executing any edit.

---

## Resolved: Phase 1 Contradiction (plugin.json)

Recorded explicitly: `.claude-plugin/plugin.json` has no `hooks` key. Adding one violates `validate-workflow-contracts.js:162`. Phase 1 code-explorer.md was incorrect in stating plugin.json "mirrors the same 3 hooks." Gap 3 phantom-advisor hook registers ONLY in `hooks/hooks.json`. This is by design — Codex has no PostToolUse subsystem.

---

## Resolved: #44 Order — Safe to Proceed

`constraint-issue44.md` permits #41 to proceed before #44 provided no new auto-pick logic is added. The revised blueprint:
- `analyzeIssue` outputs are advisory (no control flow)
- `computeRecovery` is informational (no script-level auto-claim)
- `workflow_path` is set by agent via env var (not decided by script)
Task 8 tests must assert: "no auto-claim follows claim:none in any code path."

---

## Summary of All Changes from Original architect.md

| # | Original | Revised |
|---|----------|---------|
| 1 | `analysis: analyzeIssue(issue, config)` in claim:none receipts | Removed from claim:none; null guard added to function |
| 2 | `process.env.KAOLA_PATH \|\| 'full'` | `process.env.KAOLA_PATH === 'fast' ? 'fast' : 'full'` |
| 3 | Task 3 both cap-raise and skill-list in PR-A | Task 3a (cap only) in PR-A; Task 3b (skill list) in PR-B |
| 4 | "scan for advisor citation pattern" (undefined) | Explicit regex with grep -qiE implementation |
| 5 | TOP_TIER_LABEL_REGEX "scoped inside analyzeIssue" | "module-level const above analyzeIssue" |
| 6 | Task 8 assertions advisory-only (positive) | Task 8 adds negative assertions (no auto-claim) |
| 7 | Line numbers unverified | Explicit verification step as Phase 4 Task 1 prerequisite |
