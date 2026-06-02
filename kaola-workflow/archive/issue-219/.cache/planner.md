## Approach Uniqueness

**Exactly one sensible approach.** There is a single degree of freedom — `sink-pr.js`'s `ghExec(args)` has no `opts` parameter and no mock branch, unlike `sink-merge.js` and `closure-audit.js`. The correct resolution is to add `timeout: REMOTE_TIMEOUT_MS` directly to its single inline options object, NOT to refactor it into the mock-aware `(args, opts)` parity signature. The parity refactor is the rejected alternative: it is speculative, violates surgical-change, and is unwarranted because `sink-pr.js` is never exercised online (all its walkthrough tests run in OFFLINE mode, so its real `gh` branch never executes). The issue's phrase "both mock and real branches" applies only to `sink-merge.js`, which already has both branches; `sink-pr.js` has one branch.

## Write Set (4 files)
- `scripts/kaola-workflow-sink-merge.js`
- `scripts/kaola-workflow-sink-pr.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (Codex copy, byte-identical)
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` (Codex copy, byte-identical)

## Change per File

### scripts/kaola-workflow-sink-merge.js
1. Add the timeout constant verbatim from `closure-audit.js:42-45` into the top-constant block, after the `FORCE_*` lines:
```js
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();
```

2. Add `timeout: REMOTE_TIMEOUT_MS` to the defaults position (first arg) of both `Object.assign` calls inside `ghExec`:
```js
function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
}
```

### scripts/kaola-workflow-sink-pr.js
1. Add the same `REMOTE_TIMEOUT_MS` constant verbatim into the top-constant block.

2. Add `timeout: REMOTE_TIMEOUT_MS` to the single options object in `ghExec`:
```js
function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }).trim();
}
```

### Codex copies (byte-identical)
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` and `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` must receive the exact same edits as their root siblings.

## Acceptance Check
```bash
npm test
```
Must exit 0 with "Workflow walkthrough simulation passed".

## Out of Scope
- Refactoring `sink-pr.js`'s `ghExec` to the mock-aware `(args, opts)` signature
- Unbounded remote `git` calls in the same files (git branch -d, git push --delete)
- GitLab/Gitea forge ports (already bounded)
- `closure-audit.js` / `active-folders.js` (convention source, already correct)
- CHANGELOG.md / docs / version bump
