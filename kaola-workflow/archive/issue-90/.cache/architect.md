# Architect Output — Issue #90

## Files to Create
None.

## Files to Modify

| File | Change |
|------|--------|
| `.kw/issue-90/plugins/kaola-workflow-gitlab/agents/code-architect.toml` | Line 12: `small enouglab for` → `small enough for` |
| `.kw/issue-90/plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add `,` after `/pull request/i`; insert `/\b[a-z]+glab\b/i` as next line |

## Exact Diff for validator (lines 54-57)

Before:
```
    /PR number/,
    /pull request/i
  ];
```
After:
```
    /PR number/,
    /pull request/i,
    /\b[a-z]+glab\b/i
  ];
```

## Build Sequence
1. Preflight grep — confirm only one `*glab` hit
2. Task 1 — Fix typo in code-architect.toml (write: agents/code-architect.toml)
3. Task 2 — Append regex to validator (write: validate-kaola-workflow-gitlab-contracts.js)
4. Run `npm run test:kaola-workflow:gitlab` (from .kw/issue-90/)
5. Run `node scripts/simulate-workflow-walkthrough.js` (from .kw/issue-90/)

## Parallelization
- Tasks 1 and 2: disjoint write sets, can run in parallel after preflight
- Tasks 3 and 4 (validation): run in parallel once both edits done

## Out of Scope
- GitHub validator, docs, READMEs
- Refactoring assertNoForbidden
- Any file outside the .kw/issue-90 worktree
