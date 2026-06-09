# docs node evidence — issue #328 bundle lane

**Node:** docs (doc-updater)
**Date:** 2026-06-10
**Write set:** 5 files (README.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md)

## Files updated

### README.md

- Added `issue-scout` row to the vendored Claude Code agents table (read-only selection agent, Sonnet, bundle lane).
- Added `issue-scout` prose paragraph (read-only constraints: MUST NOT claim, write files, author plans, close issues, or dispatch agents).
- Added `KAOLA_TARGET_ISSUES` and `KAOLA_BUNDLE_MAX_ISSUES` to the Environment Variables table.
- Added `## Multi-issue bundle lane (adaptive-only)` section covering:
  - Three entry modes (single-issue unchanged / explicit `--target-issues` / auto-bundle via `issue-scout`).
  - `target_ambiguity` gate (both single+multi set simultaneously → refuse).
  - Full typed-refusal vocabulary table (10 codes confirmed from grep of claim.js).
  - All-or-nothing finalization semantics.
  - Adaptive-path-only constraint.

### docs/api.md

- Added `### Bundle claim: --target-issues / KAOLA_TARGET_ISSUES (issue #328)` subsection under Startup Classifier with:
  - CLI flag and env-var contract.
  - `target_ambiguity` rule (both scalar + multi set → refuse before any state write).
  - Full typed-refusal table (10 codes, exact strings from design.md + grep).
  - All-or-nothing invariant.
  - Single-issue path unchanged statement.
  - Additive `workflow-state.md` fields sub-section (`issue_number`, `issue_numbers`, `bundle_id`, `closure_policy`) with example block.
- Added `### Bundle Lane` env-var subsection with `KAOLA_TARGET_ISSUES` and `KAOLA_BUNDLE_MAX_ISSUES`.
- Added bundle receipt additions to Closure Contract schema — three fields (`closed_issues`, `failed_issue_closures`, `roadmap_sources_removed`) attached AFTER `buildClosureReceipt()` returns, absent on single-issue receipts.

### docs/architecture.md

- Added `## Multi-Issue Bundle Execution Shape (issue #328)` section covering:
  - ASCII execution shape diagram (selection → multi-claim → one worktree/branch/folder → one plan → one plan-run → one finalization).
  - Single-issue path unchanged statement.
  - No separate scheduler (uses existing adaptive executor).
  - `issue-scout` read-only hard constraints (MUST NOT claim/write/dispatch/close).

### docs/workflow-state-contract.md

- Added `## Bundle Project State Fields (issue #328)` section with:
  - Four fields with example block (`issue_number`, `issue_numbers`, `bundle_id`, `closure_policy`).
  - Field-by-field descriptions.
  - AC#1 invariant stated explicitly (single-issue projects retain only `issue_number`; bundle fields absent).
  - Bundle project and branch naming table (GitHub/GitLab/Gitea branch prefixes, worktree path).

### docs/conventions.md

- Added `## Bundle Lane — Cross-Edition Requirement (issue #328)` section stating that bundle-related diffs MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green before Finalization.

## Validator results

All four validators exited 0 (exit codes captured directly, not via pipe):

| Validator | Command | Exit code | Sentinel |
|-----------|---------|-----------|---------|
| validate-workflow-contracts.js | `node scripts/validate-workflow-contracts.js; echo "EXIT:$?"` | 0 | `Workflow contract validation passed` |
| validate-kaola-workflow-contracts.js | `node scripts/validate-kaola-workflow-contracts.js; echo "EXIT:$?"` | 0 | `Kaola-Workflow Codex contract validation passed` |
| simulate-workflow-walkthrough.js | `node scripts/simulate-workflow-walkthrough.js; echo "EXIT:$?"` | 0 | `Workflow walkthrough simulation passed` |
| validate-script-sync.js | `node scripts/validate-script-sync.js; echo "EXIT:$?"` | 0 | `OK: 18 common scripts and 7 byte-identical file group in sync.` |

## Post-review fix (advisor pass)

- **docs/api.md line 157**: corrected `KAOLA_TARGET_ISSUES` description from "ignored on fast/full paths" to "Refused with `target_set_not_adaptive` on fast/full paths." The code path `claimExplicitBundle` fires the `target_set_not_adaptive` refusal; silent ignore was wrong.
- **docs/workflow-state-contract.md** and **README.md** bundle naming table verified correct: GitLab edition `buildBranchName(null, project)` returns `workflow/gitlab-<project>`, Gitea returns `workflow/gitea-<project>` (confirmed by grep of lines 140-142 in both forge claim ports).
- All four validators re-run and remain at EXIT:0.

## Authoring constraints honored

- Additive-only prose; existing docs kept intact.
- CHANGELOG.md not touched (belongs to finalize sink).
- Only 5 declared files written.
- Documented only what is actually implemented (confirmed by grep of claim.js).
- Excluded non-v1 items: `target_set_not_same_scope` (deferred), partial closure as success, autonomous fleet supervision.
- Refusal codes from grep output, not from superseded issue body prose.
- Bundle state fields: only three additive lines (`issue_numbers`, `bundle_id`, `closure_policy`) — no `primary_issue`, no `bundle_mode`, no `issue-bundle.json`.
- `CLOSURE_RECEIPT_FIELDS` byte-lock respected: bundle fields attached AFTER `buildClosureReceipt()` returns per Decision 5.
