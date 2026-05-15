# Docs Lookup: cross-machine-hardening

## gh CLI version assumption: 2.40–2.67 (stable mid-2026)
## GitHub REST API version: 2022-11-28

---

## Q1: `gh issue view N --json comments` output shape

Each comment object in the `comments` array:
```json
{
  "id": "IC_kwDOxxxxxxxx",   // GraphQL node ID string — NOT a numeric integer
  "body": "comment text",
  "createdAt": "2024-01-15T10:30:00Z",
  "author": { "login": "octocat" },
  "url": "https://github.com/owner/repo/issues/1#issuecomment-123456789"
}
```

**Critical**: `id` is an opaque GraphQL string. `updatedAt` is NOT present in default fields.
**Cannot use for numeric tiebreaker sort.**

---

## Q2: `gh api repos/{owner}/{repo}/issues/{N}/comments` REST shape

Each comment object:
```json
{
  "id": 123456789,           // integer — use for tiebreaker
  "node_id": "IC_kwDO...",
  "body": "comment text",
  "user": { "login": "octocat" },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "html_url": "https://github.com/owner/repo/issues/1#issuecomment-123456789"
}
```

Use `snake_case` field names. `id` is the numeric integer needed for tiebreaker comparison.

---

## Q3: Comment ID monotonicity

GitHub comment IDs are globally unique auto-increment integers. NOT officially guaranteed globally monotonic — edge cases in issue transfers/imports. 

**Recommended sort key**: `(created_at ASC, id ASC)`. Use `created_at` as primary, integer `id` as secondary tiebreaker only.

---

## Q4: `gh issue comment N --body 'text'` stdout

Output is the comment URL:
```
https://github.com/owner/repo/issues/42#issuecomment-123456789
```

**LATENT BUG FOUND**: Existing `claim.js:179` regex is `/comments\/(\d+)/` — this matches REST API URLs but NOT the `#issuecomment-NNN` fragment format that `gh issue comment` actually outputs.

Correct regex: `/issuecomment-(\d+)/`

This bug is currently masked because existing tests run with `KAOLA_WORKFLOW_OFFLINE=1` (ghExec returns ''). In real online use, `claim_comment_id` would be `null` after claiming, causing heartbeat to silently no-op on GitHub edits.

**Fix scope**: Add regex fix to this issue's implementation alongside tiebreaker work.

---

## Q5: `--remove-assignee @me`

Confirmed correct. `@me` resolves to the authenticated user automatically. Stable since gh 2.0.

---

## Q6: `gh issue list --json comments`

`comments` at list level = count integer only, not comment objects. Full comment content requires `gh issue view N --json comments` (GraphQL) or `gh api repos/{owner}/{repo}/issues/{N}/comments` (REST).

For tiebreaker: use REST endpoint.
For remote sweeper updated_at check: use `gh api repos/{owner}/{repo}/issues/comments/{comment_id}` to get `updated_at` for a specific comment.

---

## Summary: Key Constraints for Implementation

| Concern | Approach |
|---------|----------|
| Tiebreaker sort | `gh api repos/{o}/{r}/issues/{N}/comments` → integer `id` + `created_at` |
| Tiebreaker filter | Filter body contains `'🔒 Session claimed by '` |
| Tiebreaker winner | Lowest `created_at`; use `id` as secondary |
| Remote sweeper staleness | `gh api repos/{o}/{r}/issues/comments/{id}` → check `updated_at` |
| Regex bug (line 179) | Fix `/comments\/(\d+)/` → `/issuecomment-(\d+)/` |
| Remove assignee | `gh issue edit N --remove-assignee @me` |
| Get repo info | `gh repo view --json owner,name` or from git remote |
