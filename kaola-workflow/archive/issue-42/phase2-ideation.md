# Phase 2 - Ideation: issue-42

## Approaches Evaluated

### Option A: Prose-Only Stdout Scraping (Minimum Touch)
- Summary: Keep sink-merge.js as-is; parse its stdout in Phase 6 bash to detect "not fast-forward" text; conditionally call sink-pr.js from the same Phase 6 dispatch block.
- Pros: Zero changes to claim.js; no new exit code; no new subcommand.
- Cons: Stdout scraping is brittle — message text can change without notice; classification lives in bash prose, not in JS where it can be tested; duplicates the merge-vs-PR state mutation already managed by updateSinkLease(); fails when sink-merge.js changes its output format.
- Risk: High
- Complexity: Small

### Option B: Structured Receipt + `claim.js sink-fallback` (Selected)
- Summary: Add exit code 3 to sink-merge.js for "pivot to PR" cases. Before attempting the local FF merge, run `git push --dry-run origin main` to classify the failure reason. Write a structured `.cache/sink-fallback.json` receipt with `reason`, `allow_list` token, and `triggered_at`. Phase 6 reads the receipt on exit 3, calls a new `cmdSinkFallback` subcommand in claim.js that (a) updates the Sink block with `sink_fallback_reason:`, (b) invokes sink-pr.js, and (c) propagates the exit code.
- Pros: Classification in JS (testable); single source of truth for Sink state via updateSinkLease(); Phase 6 dispatch is one small conditional; Epic Case 18 tests can stub exit codes cleanly; future reason-tokens are addable without touching Phase 6 bash.
- Cons: Adds a new exit code contract (3 is non-standard for merge tools); empirical pre-flight verification needed (git push --dry-run against GH branch protection must be confirmed to produce GH006 before committing).
- Risk: Low-Medium
- Complexity: Medium

### Option C: sink-merge.js Invokes sink-pr.js Internally
- Summary: sink-merge.js detects the FF failure, pivots to sink-pr.js directly, and exits 0 on PR creation success.
- Pros: Phase 6 dispatch unchanged; one call site.
- Cons: Violates single-responsibility — merge tool should not know about PR creation; makes sink-merge.js non-atomic and untestable in isolation; swallows the pivot decision from claim.js / workflow-state.md; complicates Epic Case 18 test design.
- Risk: Medium
- Complexity: Small (deceptively)

## Advisor Findings
(from `.cache/advisor-ideation.md`)

Advisor confirmed Option B as the correct choice. Six items flagged for Phase 3 pinning:

1. **Reason-token mapping table**: Before coding, write an explicit table mapping each `git push --dry-run` stderr pattern to an allow-list token. `remote: error: GH006` → `branch_protected`; "rejected" with "non-fast-forward" → `non_fast_forward`; permission denied → `permission_denied`. Anything not in the allow-list is a transient failure (network, rate-limit) and must NOT trigger the pivot.

2. **Empirical pre-flight verification**: `git push --dry-run origin main` against a branch-protection rule must be confirmed to produce GH006 stderr before committing to that as the primary classifier. This check must be done in Phase 3 or Phase 4 before the reason-token table is finalized. Document the test command and its output as part of Phase 3 plan.

3. **`cmdSinkFallback` field preservation**: Must call `updateSinkLease()` (L769-799 of kaola-workflow-claim.js) rather than writing the Sink block from scratch. This preserves `branch:`, `issue_number:`, `claimed_at:`, and the `## Lease` block. Only `sink_fallback_reason:` is new.

4. **Phase 6 post-pivot exit semantics**: After `cmdSinkFallback` is called, Phase 6 must propagate whatever exit code sink-pr.js returns. No retry, no fallback-of-fallback. If sink-pr.js fails, Phase 6 exits non-zero.

5. **Grep acceptance criterion timing**: The acceptance test "grep for workflow-next-pr returns only archive references and CHANGELOG entry" must run AFTER Phase 6 archives the issue-42 folder (since `kaola-workflow/issue-42/` will contain references during development). Phase 3 must place this assertion in the post-archive validation step, not during Phase 4 testing.

6. **codex-parity and cross-machine-followups scrub decision**: `kaola-workflow/codex-parity/phase2-ideation.md` and `kaola-workflow/cross-machine-followups/phase2-ideation.md` both reference `workflow-next-pr`. Phase 3 must check `kaola-workflow/codex-parity/workflow-state.md` to determine whether to annotate (active work) or scrub (stale design docs). Whichever decision is made must be recorded explicitly in the task blueprint.

## Selected Approach
**Option B: Structured Receipt + `claim.js sink-fallback`**

Rationale: Classification stays in JS (testable, version-controlled contract), Sink block state is managed exclusively through `updateSinkLease()` (no duplication), Phase 6 dispatch is minimal, and Epic Case 18 tests map cleanly to exit-code stubs. The pre-flight `git push --dry-run` approach requires empirical verification in Phase 3 before the reason-token table is locked, but this is low risk given the GH006 error is well-documented.

## Out of Scope (explicit)
- `set-sink` subcommand or runtime sink override
- Label-based intent detection on GitHub issues
- Per-repo sink override config files
- Draft PR / stacked PR creation paths
- Reverse pivot (PR → merge after branch protection removed)
- NLU for intent parsing beyond the `KAOLA_SINK` env var that already exists
- Removing or redesigning the `KAOLA_SINK` env var wire itself

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
