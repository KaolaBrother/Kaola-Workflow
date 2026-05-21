# Code Explorer: issue-150 — GitLab and Gitea listOpenIssues priority_top_tier_labels

## Entry Points

- `listOpenIssues()` is called during issue selection (startup, pick-next) in all three forge scripts to sort open issues for agent display.
- GitHub: `scripts/kaola-workflow-claim.js:88-102`
- GitLab: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:265-273`
- Gitea: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:268-276`

---

## 1. GitHub `listOpenIssues` — exact code (lines 65-102)

```js
// scripts/kaola-workflow-claim.js

function readPriorityConfig(root) {
  const file = path.join(root, 'kaola-workflow', 'config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
  } catch (_) {
    return ['P0', 'P1'];
  }
}

function labelName(label) {
  return String((label && label.name) || label || '');
}

function priorityTier(issue, topTierLabels) {
  const labels = (issue.labels || []).map(labelName);
  for (const label of labels) {
    if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
  }
  if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
  return { tier: 99, priority_label: '' };
}

function listOpenIssues(root) {
  if (OFFLINE) return [];
  try {
    const raw = ghExec(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,updatedAt,url']);
    const issues = JSON.parse(raw || '[]');
    const topTierLabels = readPriorityConfig(root);
    return issues.sort((a, b) => {
      const at = priorityTier(a, topTierLabels).tier;
      const bt = priorityTier(b, topTierLabels).tier;
      return at - bt || Number(a.number) - Number(b.number);
    });
  } catch (_) {
    return [];
  }
}
```

`readPriorityConfig` is exported at line 727. The `priorityTier` and `labelName` helpers are not exported.

---

## 2. GitLab `listOpenIssues` — exact code (lines 265-273)

```js
// plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js

function listOpenIssues() {
  try {
    return forge.listIssues({ state: 'opened', perPage: 100 })
      .filter(issue => issue.state === 'open')
      .sort((a, b) => Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number));
  } catch (_) {
    return [];
  }
}
```

No `root` parameter. No config read. Sorts by issue number only.

---

## 3. Gitea `listOpenIssues` — exact code (lines 268-276)

```js
// plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js

function listOpenIssues() {
  try {
    return forge.listIssues({ state: 'open', perPage: 100 })
      .filter(issue => issue.state === 'open')
      .sort((a, b) => Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number));
  } catch (_) {
    return [];
  }
}
```

Identical gap to GitLab. No `root` parameter. No config read. Sorts by issue number only.

---

## 4. Config Loading Pattern

The correct pattern to mirror is `readPriorityConfig(root)` in `scripts/kaola-workflow-claim.js:65-73`. It reads `<root>/kaola-workflow/config.json` (repo-local path, not home dir).

**Do not confuse** with the two other `readConfig()` functions in:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js:49-58`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js:50-59`

Those read `~/.config/kaola-workflow/config.json` (user home) for `mr_auto_merge`/`pr_auto_merge` — a completely different concern. Do NOT use that pattern for priority labels.

The `readPriorityConfig(root)` function must be added to both GitLab and Gitea claim scripts. The `root` argument flows from the caller; all surrounding claim functions already accept `root` as their first parameter.

---

## 5. Label Data Shape: GitHub vs GitLab vs Gitea

**GitHub** (`gh issue list --json labels`): labels arrive as an array of objects `[{ name: "P0" }, ...]`. The `labelName()` helper (`label.name || label`) normalizes each to a string. `priorityTier` maps through `labelName` before string comparisons.

**GitLab and Gitea**: `normalizeIssue()` in each forge already runs all raw label data through `labelsOf()`, which maps `{ name: "P0" }` objects to plain strings. By the time `listOpenIssues` sees an issue, `issue.labels` is already `string[]`.

**Practical consequence**: A ported `priorityTier` for GitLab/Gitea can skip the `labelName()` mapping step — labels are already strings. The sorting logic operates directly on the string array.

---

## 6. Test Files, Framework, and Existing Priority Tests

**Test files:**
| File | Role |
|------|------|
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | GitLab unit tests |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Gitea unit tests |
| `scripts/simulate-workflow-walkthrough.js` | GitHub walkthrough + unit tests |

**Framework:** Node's built-in `assert` module. No test framework. Tests run top-to-bottom as synchronous script execution.

**`withForge` pattern:** Both GitLab and Gitea test files define `withForge(stubs, fn)` which monkey-patches the live forge module for the duration of `fn()`, then restores originals. This is the mechanism for injecting stub `listIssues()` return values.

**Existing `listOpenIssues` tests (no priority):**
- GitLab: `test-gitlab-workflow-scripts.js:325-335` — stubs `listIssues()` returning 3 issues (one closed), asserts only open ones are returned in number order `[7, 9]`. Stub objects have no `labels` field.
- Gitea: `test-gitea-workflow-scripts.js:332-342` — identical structure, same assertion `[7, 9]`.

**Existing `readPriorityConfig` tests (GitHub only):**
- `scripts/simulate-workflow-walkthrough.js:1195-1220` (`testReadPriorityConfig`) — 3 cases: missing config defaults to `['P0','P1']`; valid array config returns custom labels; non-array value falls back to default.
- Called at line 1786 in the main test runner.
- No equivalent for GitLab or Gitea.

There are **no existing tests** for `priorityTier` sorting logic in any forge.

---

## 7. Gaps Summary: GitLab and Gitea vs GitHub

| Capability | GitHub | GitLab | Gitea |
|---|---|---|---|
| `readPriorityConfig(root)` function | Yes (lines 65-73) | Missing | Missing |
| `priorityTier(issue, topTierLabels)` helper | Yes (lines 79-86) | Missing | Missing |
| `labelName()` normalization helper | Yes (lines 75-77) | Not needed (labels already strings) | Not needed |
| `listOpenIssues` accepts `root` param | Yes | No | No |
| Priority-based sort in `listOpenIssues` | Yes | No — number only | No — number only |
| `readPriorityConfig` exported | Yes (line 727) | Missing | Missing |
| `readPriorityConfig` unit test | Yes (walkthrough:1195) | Missing | Missing |
| `listOpenIssues` priority sort test | Missing everywhere | Missing | Missing |

---

## Recommendations for New Development

**Follow:**
- `readPriorityConfig(root)` signature from GitHub — reads `<root>/kaola-workflow/config.json`, falls back to `['P0', 'P1']`
- `priorityTier` logic: P-number labels → numeric tier; custom top-tier labels → tier 1; else tier 99; sort by tier ascending then issue number ascending
- `withForge({ listIssues() { ... } }, ...)` stub pattern for tests
- Export `readPriorityConfig` from both plugin claim modules (mirrors GitHub line 727)

**Reuse:**
- Existing `listOpenIssues` test stub at lines 325/332 in each test file — extend with a second `withForge` block that includes `labels` in stub objects
- `testReadPriorityConfig` from `simulate-workflow-walkthrough.js:1195-1220` as template for GitLab/Gitea equivalents

**Avoid:**
- Copying `readConfig()` from sink-mr/sink-pr scripts — wrong path, wrong purpose
- Adding `labelName()` to GitLab/Gitea — unnecessary (labels already strings)
- Changing the `listIssues` forge call itself — only the post-fetch sort needs to change
