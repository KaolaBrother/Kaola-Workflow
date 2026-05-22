# Planner — issue-152: Phase 5/6 routed tdd-guide/build-error-resolver model badge

## Recommended Approach: Option A + Two Separate Blocks + File-Level Assertions

### Summary
Add two canonical `Agent(...)` blocks (tdd-guide + build-error-resolver) in the Validation Delegation Policy section of each affected command file. This places them above the "exactly as documented above" reference in the Fix Routing section, resolving the dangling reference. Apply identically to 6 command files (root + gitlab + gitea editions for phase5 and phase6). Add 12 file-level placeholder assertions to validate-workflow-contracts.js and 2 render assertions to test-install-model-rendering.js.

### Key Facts
- `{TDD_GUIDE_MODEL}` → `sonnet`; `{BUILD_ERROR_RESOLVER_MODEL}` → `sonnet` (both agents have `model: sonnet`)
- `{BUILD_ERROR_RESOLVER_MODEL}` is defined in install.sh but NEVER YET USED in any .md — first use
- `--profile=higher` only overrides code-architect, code-reviewer, security-reviewer → opus. tdd-guide and build-error-resolver are `sonnet` under both profiles → `phase5.includes('model="sonnet",')` is unambiguous
- No automated sync for plugin command files — manual updates required; new validator assertions will catch any missed fork

### Options Evaluated

**Option A (SELECTED): Blocks in Validation Delegation Policy**
- Insert tdd-guide + build-error-resolver Agent blocks after prose naming agents, before cache-path code fence
- "Exactly as documented above" in Fix Routing section now points to real blocks
- Mirrors Phase 4 pattern exactly
- Risk: Low. Complexity: Small.

**Option B: Blocks in Fix Routing section only**
- Insert blocks at the "exactly as documented above" site (Phase5 lines 210-224, Phase6 lines 235-251)
- "documented above" still dangling — blocks are AT the reference site, not above it
- Requires rewording "above" to "below" or restructuring
- Risk: Low. Complexity: Small-Medium.

**Option C: Blocks in both sections**
- Duplicate blocks in both Delegation Policy and Fix Routing
- Diverges from Phase 4's single canonical site; unnecessary duplication
- Risk: Low. Complexity: Medium.

### Implementation Steps
1. Root commands/kaola-workflow-phase5.md — insert tdd-guide + build-error-resolver blocks in Delegation Policy
2. Root commands/kaola-workflow-phase6.md — same
3. plugins/kaola-workflow-gitlab phase5 + phase6 — same edits (manual)
4. plugins/kaola-workflow-gitea phase5 + phase6 — same edits (manual)
5. validate-workflow-contracts.js — 12 assertIncludes calls ({TDD_GUIDE_MODEL} and {BUILD_ERROR_RESOLVER_MODEL} × 6 files)
6. test-install-model-rendering.js — add phase5/phase6 `model="sonnet",` assertions

### Not Building
- Do NOT touch kaola-workflow-fast.md (already instrumented)
- Do NOT fill prompt="..." with concrete text (keep template-shaped)
- Do NOT expand validate-script-sync.js for plugin command sync
- Do NOT add combined routing table (two separate blocks matches Phase 4 pattern)
- Do NOT reword "exactly as documented above" sentences (Option A makes them correct as-is)
