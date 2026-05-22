# Phase 2 - Ideation: issue-160

## Approaches Evaluated

### Option A: Fix docs to match code (selected)
- **Summary**: Update `docs/api.md` (3 discrepancies), `README.md` (1 line), and add sc11 multi-flag precedence test to 3 test suites. Zero code changes.
- **Pros**: No behavior change; sc3 continues passing; documents the actually-shipped contract; the safer default (skip dirty without consent) is preserved and explained; no risk of breaking existing users.
- **Cons**: None material.
- **Risk**: Low
- **Complexity**: Small

### Option B: Fix code to match docs (rejected)
- **Summary**: Add `--archive`-as-default for dirty worktrees and mutex validation for conflicting flags across all 4 claim scripts. Then do all of Option A's doc work. Rewrite sc3 in all 3 suites.
- **Pros**: Docs and code converge on the documented intent.
- **Cons**: Two observable breaking changes — (1) silently stashes uncommitted work when no flag given (dangerous: triggers mutation by the *absence* of a flag), (2) rejects redundant-but-defined flag combos. Must edit 4 byte-identical scripts; rewrite sc3 in 3 suites; larger blast radius.
- **Risk**: High
- **Complexity**: Large

### Option C: Fix docs + add mutex validation only (rejected)
- **Summary**: Keep skip-dirty default, but add error on multi-flag. A subset of B.
- **Cons**: Still a breaking change for consumers passing redundant flags (e.g., `--archive --export`), for zero safety gain. Silent precedence is already defined behavior; documenting it is preferable to erroring on it.
- **Risk**: Medium
- **Complexity**: Small/Medium

## Advisor Findings

Advisor confirmed Option A is correct and flagged four additional checks (all resolved):

1. **CLI help strings**: No behavioral claims in usage strings. No changes needed.
2. **Plugin READMEs**: No stale-worktree-cleanup content in GitLab/Gitea/Codex plugin READMEs. No changes needed.
3. **`--keep-branch` flag**: Behavioral docs correct. However `keep_branch: false` in the fabricated JSON schema at docs/api.md:359 must be removed — it is not an output field.
4. **Contracts validator**: Only checks function name presence, not sub-case count. Adding sc11 is safe.
5. **sc11 additional assertion**: Also assert `failed_preserve` empty to prevent false-positive pass on unexpected git behavior.

Confirmed actual JSON output shapes (two separate blocks required in docs):
- **Dry-run**: `{ dry_run: true, would_remove, would_delete_branch, skipped_dirty }`
- **Execute**: `{ dry_run: false, removed, deleted_branch, skipped_dirty, stashed, exported, failed_preserve }`

The fabricated schema contained `strategy`, `execute`, `keep_branch`, nested `summary`, and `details[]` — none exist in the actual output.

## Selected Approach
**Option A — Fix docs to match code.**

Rationale: the code is the deployed contract; sc3 and all existing tests validate the skip behavior. Option A documents the correct, safer behavior with zero risk. Option B would break users relying on "no flag = skip dirty" and require rewriting sc3. The planner and advisor both confirm Option A.

## Out of Scope (explicit)
- Do NOT add `--archive`-as-default behavior to any claim script
- Do NOT add mutex validation that errors on multi-flag input
- Do NOT rename code bucket fields (`stashed`, `exported`, etc.) — they are correct
- Do NOT add `strategy`, `keep_branch`, `execute`, `summary`, or `details` to JSON output
- Do NOT add per-pair precedence tests beyond sc11 (`--archive --force`, `--export --force` are over-testing)
- Plugin READMEs require no changes (no stale-worktree-cleanup content)
- Claim scripts require no changes

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
