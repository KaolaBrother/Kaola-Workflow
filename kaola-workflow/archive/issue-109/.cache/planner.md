# Planner: issue-109

## Recommendation: Approach 1 (Pattern B — GitLab Codex parity, minimal surgical fix)

## Approaches Evaluated

### Approach 1: Pattern B Parity (GitLab sibling mirror)
**Changes**:
1. Insert `KAOLA_CLAIM` extraction after `PICK_NEXT_PROJECT` line in SKILL.md
2. Replace unguarded release line with: `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block`
3. Add 2 `assertIncludes` calls in `validate-kaola-workflow-contracts.js`

**Pros**: Minimal blast radius (2 lines in SKILL.md, 2 lines in contracts); byte-level parity with GitLab sibling; line 50 (`PICK_NEXT_PROJECT`) untouched.
**Cons**: `PICK_NEXT_PROJECT` vs `KAOLA_PROJECT` naming drift persists across plugins (non-blocking).
**Risk**: Low. **Complexity**: S.

### Approach 2: Pattern A Rename (`PICK_NEXT_PROJECT` → `KAOLA_PROJECT`)
**Changes**: Rename at lines 50 and 117 + add `KAOLA_CLAIM` + guarded release.
**Pros**: Aligns with Claude command naming.
**Cons**: Extra rename axis; touches line 50 unnecessarily; rename-incomplete is exactly the failure mode being fixed. **Risk**: Low-Medium. **Complexity**: S.

### Approach 3: Fix both GitHub + GitLab Codex routers
Out of scope. GitLab sibling already correct. **Risk**: Medium (scope creep). **Complexity**: M.

## Recommended Regression Assertions
- `assertIncludes(file, 'KAOLA_CLAIM="$(node -e')` — pins extraction
- `assertIncludes(file, '[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]')` — pins both guards together

## Explicit Out of Scope
- GitLab Codex SKILL.md (already correct)
- GitLab contracts validator
- Claude command (already correct)
- `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` rename
- Simulation changes beyond contract validator
