# Phase 3 - Plan: issue-109

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Insert KAOLA_CLAIM extraction line; replace unguarded release with combined guard | Bug fix: extraction missing, release uses unset $KAOLA_PROJECT |
| `scripts/validate-kaola-workflow-contracts.js` | Add 4 assertIncludes/assertNotIncludes calls after line 89 | Regression lock for extraction, combined guard, project var, and buggy pattern removal |

### Build Sequence
1. Edit SKILL.md — insert extraction, replace release (fix must land before assertions can pass)
2. Edit validate-kaola-workflow-contracts.js — add 4 assertions (depends on Task 1)
3. Run `npm run test:kaola-workflow:codex` to verify targeted suite
4. Run `npm test` for full suite

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | 1 then 2 | Task 2 assertions depend on Task 1 changes existing |

### External Dependencies
None.

## Task List

### Task 1: Fix SKILL.md — extraction and release guard
- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Test File: `scripts/validate-kaola-workflow-contracts.js` (locked by Task 2)
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Depends On: none
- Parallel Group: serial
- Action: MODIFY

**Edit A — Insert KAOLA_CLAIM extraction line** (after line 117, before KAOLA_WORKTREE_PATH extract):

Existing line 117:
```
  PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
```
Insert immediately after it:
```
  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
```
Mirror: GitLab sibling line 121 (byte-for-byte)

**Edit B — Replace unguarded release line** (current line 139, shifts to 140 after Edit A):

Old:
```
node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```
New:
```
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block
```
Mirror: GitLab sibling line 165 (byte-for-byte)

- Validate: `npm run test:kaola-workflow:codex`

### Task 2: Add regression assertions to validate-kaola-workflow-contracts.js
- File: `scripts/validate-kaola-workflow-contracts.js`
- Test File: same file (assertions are the test)
- Write Set: `scripts/validate-kaola-workflow-contracts.js`
- Depends On: Task 1
- Parallel Group: serial
- Action: MODIFY

Insert after existing line 89 (after last kaola-workflow-next assertion):
```js
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'KAOLA_CLAIM="$(node -e');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$KAOLA_PROJECT" --reason git-freshness-block');
```
String style: backtick template literals for paths, single-quoted tokens — matches existing lines 86–89 and line 92 convention.

- Validate: `npm run test:kaola-workflow:codex`

## Advisor Notes
- Build sequence is dependency-safe; Edit tool matches by content (not line number) so post-Task-1 line drift is cosmetic.
- simulate-kaola-workflow-walkthrough.js does not exercise the freshness-block path; contract assertions are the correct line of defense.
- Edge cases: empty KAOLA_CLAIM → fails closed; empty PICK_NEXT_PROJECT → fails closed. Both covered by combined guard.
- The 4th assertion (assertNotIncludes for old buggy pattern) locks out partial-revert regression — keep it.
- Scope verified: `grep -n 'KAOLA_PROJECT' SKILL.md` returned line 139 only — no other orphan references.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | advisor found no gaps; grep verification passed | no revision loop needed |
