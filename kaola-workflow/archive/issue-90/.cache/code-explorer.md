# Code Explorer Output — Issue #90

## Summary
One corruption found: `code-architect.toml:12` has `enouglab` (should be `enough`). No other `*glab` corruptions in any other agent/skill/command/hook file.

## Corruptions Found

| File | Line | Corrupted Text |
|------|------|----------------|
| `plugins/kaola-workflow-gitlab/agents/code-architect.toml` | 12 | `small enouglab for` |

## GitLab Contract Validator — `assertNoForbidden` (lines 43–58)

File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`

```js
function assertNoForbidden(file) {
  const text = read(file);
  const forbidden = [
    /\$HOME\/\.claude\/kaola-workflow\/scripts/,
    /(^|[^A-Za-z0-9_-])\.\/scripts([^A-Za-z0-9_-]|$)/,
    /plugins\/kaola-workflow\/scripts/,
    /\bgh\b/,
    /github\.com/i,
    /api\.github\.com/i,
    /GitHub/,
    /PR URL/,
    /PR number/,
    /pull request/i
  ];
  for (const re of forbidden) assert(!re.test(text), file + ' contains forbidden reference: ' + re);
}
```

Applied over: commandFiles, skillFiles, hookFiles, agentFiles, config/agents.toml (lines 114-116).

## Recommended Changes

1. Fix `code-architect.toml:12`: `enouglab` → `enough`
2. Add to `forbidden` array: `/\b[a-z]+glab\b/i`
   - Catches `enouglab`, `througlab`, and any future `*glab` corruptions
   - Does NOT match standalone `glab` (CLI tool) or `glabExec` (camelCase identifier)

## Test Command

```
npm run test:kaola-workflow:gitlab
```

Runs: validate-vendored-agents.js + validate-kaola-workflow-gitlab-contracts.js + simulate-gitlab-workflow-walkthrough.js + simulate-gitlab-codex-workflow-walkthrough.js

## GitHub Validator

`scripts/validate-kaola-workflow-contracts.js` — uses `assertNotIncludes` style, not `assertNoForbidden`. No changes needed (corruption flows only GitHub→GitLab).
