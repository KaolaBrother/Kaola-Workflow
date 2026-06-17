evidence-binding: n1-enforce-coverage 3185c6a963ff
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: enforcement-coverage — adding substring/shared-fn pins and a guard-runner bash-block case OVER already-shipped guards and parity contracts; every new assert is GREEN-ON-ARRIVAL by construction (the guards/functions exist and pass against current reality), so there is no new behavior with a natural failing unit test.
<!-- regression-green|build-green|smoke-integration -->
verification_tier: build-green

## Verification

Baseline: v6.4.0 release commit (388a207e) — the four chains were green at that release; no pre-edit baseline re-run was captured. Starting point was a clean worktree on the released-green commit, so the baseline is known-green by the release tag.

After edits — all four chains sequential:
- `npm run test:kaola-workflow:claude` → exit 0
- `npm run test:kaola-workflow:codex`  → exit 0
- `npm run test:kaola-workflow:gitlab` → exit 0
- `npm run test:kaola-workflow:gitea`  → exit 0

Byte-identity check: `diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` → empty (exit 0).

## Escalation findings (negative — clean)

- FOREIGN_ARCHIVE guard text confirmed present in all three edition finalize commands (root, gitlab, gitea) before pinning — no fail-open recurrence found.
- All grepped shared function names (`closeIssueIdempotent`, `buildBranchName`, `checkDispatchAttestations`, `isSharedInfra`, `isProtected`, `readPlanNodes`, `isAdaptiveWorkflowState`, `adaptiveStateValid`, `isSafeName`, `readRoadmapIssues`, `roadmapDir`, `deriveMemberSet`, `readStateIssueNumbers`, `probeIssueClosed`) confirmed present in both gitlab and gitea forge ports before pinning — no missing shared function found.
- The `<!-- PIN: frontier unit -->` comment confirmed present on all 6 plan-run surfaces before the T5 flip — green-on-arrival as planned.
- FOREIGN_ARCHIVE is NOT in the finalize SKILLs (only in commands) — no escalation needed, only commands are in scope for ITEM 1.

## Files changed

1. `scripts/validate-workflow-contracts.js` — added #505 ITEM 1 pins: `FOREIGN_ARCHIVE=$(git diff --cached`, `BLOCKED: a foreign project's archive band is staged`, `## Staging Guard` via `assertIncludes` on `commands/kaola-workflow-finalize.md`.
2. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — BYTE-IDENTICAL copy of root (per validate-script-sync.js requirement); same #505 ITEM 1 pins added identically.
3. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — added #505 ITEM 1 pins on `pluginRoot/commands/kaola-workflow-finalize.md` (gitlab edition only); added #505 ITEM 3 shared-fn-presence pins for `kaola-gitlab-workflow-{claim,classifier,repair-state,roadmap,sink-merge}.js`.
4. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — added #505 ITEM 1 pins on `pluginRoot/commands/kaola-workflow-finalize.md` (gitea edition only); added #505 ITEM 3 shared-fn-presence pins for `kaola-gitea-workflow-{claim,classifier,repair-state,roadmap,sink-merge}.js`.
5. `scripts/test-route-reachability.js` — flipped T5 else-branch from `console.warn` to `assert(anyHasPin, ...)` (#505 ITEM 2).
6. `scripts/test-bash-block-guards.js` — added Test E: extracts the FOREIGN_ARCHIVE Staging Guard bash block from `commands/kaola-workflow-finalize.md`, runs it in a $TMPDIR fixture with a foreign `kaola-workflow/archive/issue-999/` band staged for project `issue-200`, asserts exit 1 (#505 ITEM 1(b)).
