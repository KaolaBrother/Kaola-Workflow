# Advisor Response — issue-148 Ideation

## Verdict
Go with Option A (full implementation). No missed approaches. Risks are accurately assessed.

## README Verification (Required Before Committing)
Check README lines 455-510 before finalizing. The edition-shared command table is the binding constraint.

**Result (verified):**
- README:461 — `stale-worktree-check` listed in edition-agnostic operational scripts table (no forge qualifier)
- README:505 — invocation shown as `node scripts/kaola-workflow-claim.js stale-worktree-check` without forge qualification
- Option B (doc-only) would require README caveats too, making it not truly doc-only. Option A confirmed.

## Strengthening Points for Implementation

1. **`git for-each-ref` prefix must be forge-specific**: Use `refs/heads/workflow/gitlab-issue-*` for GitLab and `refs/heads/workflow/gitea-issue-*` for Gitea — NOT the generic `refs/heads/workflow/` prefix. Using the generic prefix causes cross-forge branch interference when multiple forges are active in the same repo.

2. **`extractIssueNumber` regex per edition**: GitLab: `/workflow\/gitlab-issue-(\d+)/`; Gitea: `/workflow\/gitea-issue-(\d+)/`. Do not share across editions.

3. **5 test sub-cases per edition** (not 6): The 6th GitHub sub-case uses `gh` shim for issue state resolution. GL/GT use `withForge({ viewIssue })` stubs instead — no `gh` shim needed. Sub-cases: (1) closed worktree stale, (2) archived worktree stale, (3) open+active not stale, (4) deleted-dir state:missing, (5) loose stale branch.

4. **Use `withForge({ viewIssue })` not `gh` shims**: Both GL and GT test files already use `withForge(stubs, fn)` pattern for forge API substitution. The `viewIssue` stub must return `{ state: 'closed' }` for stale issue numbers and `{ state: 'open' }` for active ones.

5. **Do not export `cmdStaleWorktreeCheck`**: GitHub doesn't export it; GL/GT must follow the same convention.

## Summary
No blocking concerns. After README verification (completed — Option A confirmed), implementation can proceed.
