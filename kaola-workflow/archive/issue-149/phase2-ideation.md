# Phase 2 - Ideation: issue-149

## Approaches Evaluated

### Option A: Strict docs-aligned gate, default OFF + test-helper migration (RECOMMENDED)
- Summary: Add `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';` at the top of all four script files. Change each provisioning gate to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`. Migrate test helpers to inject `KAOLA_WORKTREE_NATIVE: '1'` so existing assertions survive. Add tests for default-OFF and OFFLINE+NATIVE paths.
- Pros: Actually fixes the bug (code matches docs). Follows established `OFFLINE` module-const precedent. Single-line gate change per tree. Drift guard auto-verifies GitHub canonical + mirror parity. Closes secondary OFFLINE divergence in GitLab/Gitea for free in the same line edit.
- Cons: Touches three test suites (helper injection + raw bypass sites + new tests).
- Risk: Medium — must not miss raw `spawnSync` bypass sites that don't go through the helper. GitLab line ~919-920 and Gitea line ~916 are known bypasses.
- Complexity: Small/Medium — mostly mechanical one-line edits.

### Option B: Gate defaults ON (`!== '0'`)
- Summary: Add `WORKTREE_NATIVE` const but default to ON when unset.
- Pros: No test changes needed.
- Cons: Does not fix the issue. README/`.env.example` still say default-OFF; code still acts default-ON. Rejected.
- Risk: High (delivers nothing).
- Complexity: Small.

### Option C: Code-only gate, defer tests
- Summary: Add default-OFF gate immediately, fix tests separately.
- Pros: Smallest first diff.
- Cons: Build goes red immediately — existing walkthroughs assert non-empty `worktree_path` at 12+ sites. Not viable.
- Risk: High.
- Complexity: Small (but breaks build).

## Advisor Findings

Advisor approves Approach A with four refinements:

1. **CHANGELOG migration note required** — this is a behavior change for users who relied on the buggy always-on behavior. Must include "Set `KAOLA_WORKTREE_NATIVE=1` to preserve prior worktree behavior" in a Breaking/Upgrade section.
2. **Add OFFLINE=1 + NATIVE=1 test for GitHub too** (not just GitLab/Gitea) — ensures `!OFFLINE` still short-circuits when NATIVE is on; prevents silent future regression.
3. **Grep for raw spawnSync bypass sites** must be an explicit Phase 3 architect task, not an edit-time discovery — confirm GitLab ~919-920 and Gitea ~916 are the only bypasses.
4. **Drift guard fix idiom is `cp`, not parallel edits** — edit `scripts/kaola-workflow-claim.js` first, then `cp` to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.

Advisor also confirmed: Phase 4 command file already uses `${KAOLA_WORKTREE_NATIVE:-0}` = default-OFF, so the claim scripts are the sole outlier. This is a targeted bug fix, not a system design change.

## Selected Approach

**Option A** — Strict docs-aligned gate, default OFF + test-helper migration.

**Rationale:** The only approach that actually aligns code with the documented contract. Mechanically follows the existing `OFFLINE` module-const pattern. The test-helper migration is the right level of effort (not deferred, not over-engineered). Drift guard provides automatic correctness verification for the GitHub parity step.

## Out of Scope (explicit)

- README, `.env.example`, phase command files — already correct; no changes needed
- `--worktree-native` CLI flag — env-var-only matches OFFLINE precedent
- Migration logic for existing active folders with non-empty `worktree_path` — existing state is untouched; gate only affects future claims
- `provisionWorktree`, `worktree-status`, `worktree-finalize`, `stale-worktree-check` internals — only the single claim-site gate changes
- Bundled Codex walkthrough tests (`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`) — OFFLINE-only, no worktree assertions
- Auto-setting `KAOLA_WORKTREE_NATIVE=1` in install scripts or hooks
- Deprecation warnings when env var is unset
- Retroactively patching `worktree_path: ''` in existing active folders

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
