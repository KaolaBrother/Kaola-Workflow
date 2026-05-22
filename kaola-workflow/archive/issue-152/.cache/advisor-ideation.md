# Advisor Gate — issue-152: Phase 5/6 routed tdd-guide/build-error-resolver model badge

## Verdict
Option A (blocks in Validation Delegation Policy) is sound. Expand scope to Phase 4.

## Key Finding: Phase 4 Has the Same Gap

Phase 4 Validation Delegation Policy (line ~114) names `build-error-resolver` in prose only. Phase 4 Step 3 (line 306-308) says "exactly as documented above" — but only the tdd-guide Agent block exists above it. The build-error-resolver block is missing, creating the identical dangling reference as Phase 5/6.

Verified: all three Phase 4 copies (root, gitlab, gitea) have the same gap at lines 115 and 307.

Recommendation: expand scope to fix Phase 4 build-error-resolver gap in the same commit. Leaving Phase 4 broken creates a follow-up issue that does the same 3-file edit later.

Note for Phase 4: only the build-error-resolver block needs to be added. The tdd-guide block already exists in Phase 4 Step 1 (Delegate Task), and it carries the correct `{TDD_GUIDE_MODEL}` model parameter.

## `{BUILD_ERROR_RESOLVER_MODEL}` Substitution Confirmed

`install.sh` lines 383 and 400 wire the substitution:
- Line 383: `BUILD_ERROR_RESOLVER_MODEL) resolve_agent_model_for_install build-error-resolver ;;`
- Line 400: `BUILD_ERROR_RESOLVER_MODEL` in the substitution target list

Resolves to `sonnet`. First use in any .md file will be this fix.

## Fast Path Clean

`kaola-workflow-fast.md` has no `build-error-resolver` references at all. No gap there.

## Assertion Counts (Updated for Phase 4 Expansion)

**validate-workflow-contracts.js — 15 new assertIncludes calls:**
- Phase 4 (3 files): `{BUILD_ERROR_RESOLVER_MODEL}` × 3 = 3 assertions
- Phase 5 (3 files): `{TDD_GUIDE_MODEL}` + `{BUILD_ERROR_RESOLVER_MODEL}` × 3 = 6 assertions
- Phase 6 (3 files): `{TDD_GUIDE_MODEL}` + `{BUILD_ERROR_RESOLVER_MODEL}` × 3 = 6 assertions

**test-install-model-rendering.js — 2 render assertions:**
- `assert(phase5.includes('model="sonnet",'), ...)` — new
- `assert(phase6.includes('model="sonnet",'), ...)` — new
- Phase 4 already has `model="sonnet",` from tdd-guide block; no new render assertion needed

## Render Assertion Scope

The `model="sonnet",` render assertions for phase5/phase6 are weak (presence-only) but consistent with project convention (same as phase4 assertion). Acceptable.

## Approach Confirmation

Option A (blocks in Validation Delegation Policy) remains correct:
- Blocks placed above "documented above" references → references become accurate
- Two separate blocks matches Phase 4's pattern
- No prose rewording needed

## No Action Required On

- planner.md "exactly as documented above" note — Phase 4 phrasing (line 307) uses same wording as Phase 5/6 lines 224/250; fixing all resolves all three
- validate-script-sync.js — plugin command sync is out of scope per planner
- prompt="..." — keep template-shaped per planner
