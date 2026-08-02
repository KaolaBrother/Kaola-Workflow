# Finalization — Summary: issue-924

## Delivered

- Live Codex standard-tier subagent dispatch uses `gpt-5.6-luna` with `max` reasoning.
- Live Codex reasoning-tier subagent dispatch uses `gpt-5.6-sol` with `xhigh` reasoning.
- A standard task may temporarily use `gpt-5.6-sol` with `medium` reasoning only after recording one independently applicable trigger and task-specific rationale: broad repository understanding, serial latency or cost erosion, repeated concrete Luna failures, or architecture/migration/subtle persistent-state risk.
- Routine implementation is excluded from escalation; the override is per-spawn and changes neither role classification nor later defaults.
- If Luna/max is unavailable, Codex records the capability mismatch and completes the task inline without silently substituting another pair. Unavailability alone does not authorize Sol/medium.
- The policy is confined to live Codex next/finalize dispatch. Workflow-init and initialized shared guidance remain runtime-neutral.

## Files Changed

- Two routing skeletons and six generated Codex next/finalize skill surfaces.
- One focused route-reachability regression and mutation test.
- Six directly affected documentation records.

## Test Coverage

- `node scripts/test-route-reachability.js`: 456 assertions, including all six complete-surface availability-fallback mutants.
- `node scripts/test-generate-routing-surfaces.js`: 432 assertions.
- Independent `gpt-5.6-sol` / `xhigh` code review: pass with zero blocking findings.
- Exact byte-identity checks prove the init skeleton, all init surfaces, and all Claude command surfaces remain unchanged.

## Validation

- Candidate-bound chain receipt: all four Claude, Codex, GitLab, and Gitea chains green.
- Full unsharded walkthrough: 202/202 scenarios passed with 2,145 simulated spawns.
- `git diff --check`: pass.

## Changed Paths

- Candidate contains exactly 15 changed product, test, generated, and documentation paths; the finalize transaction appends its measured path report below.

## Documentation Docking

DOCKED. README, API, architecture, conventions, changelog, and D-687 are reconciled. No additional edit was required during the final documentation audit.

## Run gaps

No run-discovered gaps; the scanner recorded zero swept classes.

## Follow-Up Items

None required for issue #924.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-924/.cache/chain-receipt.json
- kaola-workflow/archive/issue-924/.cache/code-reviewer-r2.md
- kaola-workflow/archive/issue-924/.cache/code-reviewer-r3.md
- kaola-workflow/archive/issue-924/.cache/code-reviewer-r4.md
- kaola-workflow/archive/issue-924/.cache/code-reviewer.md
- kaola-workflow/archive/issue-924/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-924/.cache/doc-docking.md
- kaola-workflow/archive/issue-924/.cache/doc-updater.md
- kaola-workflow/archive/issue-924/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-924/.cache/run-gaps.json
- kaola-workflow/archive/issue-924/finalization-summary.md
- kaola-workflow/archive/issue-924/mission-list.md
- kaola-workflow/archive/issue-924/workflow-state.md
