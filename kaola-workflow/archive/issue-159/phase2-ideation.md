# Phase 2 - Ideation: issue-159

## Approaches Evaluated

### Option A: Sidecar directory for untracked files
- Summary: After writing the tracked diff patch, run `git ls-files --others --exclude-standard` to enumerate untracked files, then copy each to a parallel sidecar directory (`issue-N-{ts}-untracked/`) alongside the patch. Return type changes from `string|null` to `string[]|null`; callers spread: `push(...p)`.
- Pros: Preserves all dirty content (tracked + untracked); keeps `--export` safety contract intact; pure Node `fs.copyFileSync` + standard git; fail-safe — any copy error falls through existing outer try/catch → null → failed_preserve → worktree NOT removed; no new external dependencies.
- Cons: Return type change requires one-line caller update in all 4 claim scripts (`push(p)` → `push(...p)`); nested paths need `mkdirSync(dirname, {recursive:true})` per file.
- Risk: Low
- Complexity: Low-medium (~15 new lines per exportWorktreeDiff body, replicated in 4 files)

### Option B: Refuse export when untracked files exist
- Summary: Detect untracked files via `git ls-files --others`; if any, return null immediately instead of writing the patch.
- Pros: Smallest diff; return type unchanged; literally satisfies AC wording.
- Cons: Degrades the feature — forces users with even a single untracked file to switch flags or lose work. Converts a data-loss bug into a silent refusal.
- Risk: Low technically, high in product terms
- Complexity: Trivial
- Verdict: Rejected — wrong product trade-off

### Option C: Bundle everything into a tar.gz
- Summary: Use `tar` to archive the entire worktree diff and untracked files into a single artifact.
- Pros: Single artifact, easy to distribute.
- Cons: Violates no-external-deps constraint; `tar` not available on all OSes; requires availability-checking + temp-file complexity.
- Risk: Medium-high (portability)
- Complexity: High relative to value
- Verdict: Rejected immediately

## Advisor Findings

Advisor was temporarily overloaded (HTTP 529) when consulted at the ideation gate. The planner's analysis covered all three options exhaustively, including the fourth-file finding, safety-net correctness verification, and test coverage scope. Proceeding on planner recommendation (Option A).

Key risks identified and mitigated by planner:
- **Four files, not three**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (Codex plugin mirror) also needs the fix alongside the three forge editions.
- **Test coverage asymmetry**: Only `scripts/simulate-workflow-walkthrough.js` (and the GitLab/Gitea plugin walkthrough test files) need new tests; the Codex plugin has no stale cleanup tests.
- **Empty patch legitimacy**: Untracked-only case produces a zero-byte patch; new test assertions must target sidecar content, not patch size.
- **Nested path handling**: `mkdirSync(path.dirname(dest), {recursive:true})` required before each `copyFileSync`.
- **`--exclude-standard` is load-bearing**: Keeps `.gitignore`'d trees out of the sidecar.

## Selected Approach

**Option A — Sidecar directory for untracked files**

Rationale: Only Option A fully preserves user data without degrading the feature. It is architecturally consistent with `stashWorktree()`'s `-u` flag approach, uses only Node.js built-ins and standard git, and keeps the `failed_preserve` safety bucket intact via the existing outer try/catch → null path.

## Out of Scope (explicit)

- No manifest or index file inside the sidecar directory
- No deduplication or content-hashing for efficiency
- No new CLI flags for untracked preservation
- No `git stash create` roundtrip
- No tar or external tooling (Option C)
- No refactor of the `failed_preserve` safety mechanism
- No changes to issue #160 scope (flag mutual-exclusion enforcement and docs alignment)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | HTTP 529 — proceeded on planner recommendation |
