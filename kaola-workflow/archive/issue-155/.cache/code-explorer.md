# Code Explorer — issue-155: fail-closed remote validation

## Fail-Open Code Paths

### GitHub — `scripts/kaola-workflow-classifier.js` lines 352–359 (`cmdClassify`)
```js
try {
  const raw = ghExec(['issue', 'view', String(args.issue), '--json', 'number,title,body,labels,state']);
  issue = JSON.parse(raw);
} catch (_) {
  process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'gh issue fetch failed; defaulting to green' }) + '\n');
  return;
}
```

### GitHub — `scripts/kaola-workflow-claim.js` lines 297–312 (`classifyIssue` wrapper, three leak points)
```js
function classifyIssue(root, issueNumber) {
  const classifier = path.join(__dirname, 'kaola-workflow-classifier.js');
  if (!fs.existsSync(classifier)) return { verdict: 'green', reasoning: 'classifier unavailable' };  // leak 1
  try {
    const raw = execFileSync(process.execPath, [classifier, 'classify', ...]).trim();
    return raw ? JSON.parse(raw) : { verdict: 'green', reasoning: 'classifier empty' };  // leak 2
  } catch (e) {
    if (e.status === 2) return { verdict: 'owned', reasoning: 'active local folder already exists' };
    return { verdict: 'green', reasoning: 'classifier failed open' };  // leak 3
  }
}
```

### GitLab — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` lines 253–258 and 295–300
```js
try {
  issue = forge.viewIssue(issueIid);
} catch (_) {
  return { verdict: 'green', reasoning: 'issue fetch failed; defaulting to green' };
}
```
Also duplicated in `cmdClassify` at lines 295–300.

### GitLab — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` lines 249–255
```js
function classifyIssue(root, issueIid) {
  try {
    return classifier.classifyIssue(issueIid, root);
  } catch (_) {
    return { verdict: 'green', reasoning: 'classifier failed open' };
  }
}
```

### Gitea — same structure as GitLab
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` lines 258–263 and 299–304
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` lines 252–258

### All forges — `issueIsClosed` in active-folders
**GitHub** (`scripts/kaola-workflow-active-folders.js` lines 38–47):
```js
function issueIsClosed(issueIid) {
  if (OFFLINE || issueIid == null) return false;
  try {
    const raw = ghExec(['issue', 'view', String(issueIid), '--json', 'state']);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return String(data.state || '').toLowerCase() === 'closed';
  } catch (_) {
    return false;  // fail-open: treats remote failure as "not closed"
  }
}
```
**GitLab/Gitea** (respective active-folders files, lines 40–47): same pattern, no explicit OFFLINE guard.

---

## Typed Refusals In Use

Object shape from `claimProject`/`claimExplicitTarget`:
```js
{ status, claim, issue, project, reasoning }
```
Status values: `acquired`, `owned`, `target_occupied`, `user_target_closed`, `user_target_blocked`, `user_target_red`, `no_target`.

Classifier verdict values: `green`, `yellow`, `red`, `blocked`, `owned`.

`cmdStartup` maps `result.status` → `verdict` for non-acquired results automatically (lines 395–402 in claim.js).

**No existing `target_unavailable` or `remote_validation_unavailable`** — these are new.

---

## Offline Mode Check Patterns

Module-level constant: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`  
Present in all six affected files. No shared guard function.

Usage:
- `if (OFFLINE) return '';` — in ghExec/forge exec wrappers
- `if (OFFLINE || issueIid == null) return false;` — in GitHub's `issueIsClosed`
- `if (OFFLINE) { /* local roadmap */ return; }` — in `cmdClassify`
- GitLab/Gitea `issueIsClosed` has no explicit `OFFLINE` check (relies on `forge.viewIssue` throwing)

---

## Classifier Dispatch Differences

| Forge | Classifier invocation | Failure propagation |
|-------|-----------------------|---------------------|
| GitHub | subprocess via `execFileSync` (claim.js line ~300) | Only exit code + stdout visible |
| GitLab | direct `require()` + `classifier.classifyIssue()` in-process | Exceptions propagate to claim wrapper |
| Gitea | direct `require()` + same pattern as GitLab | Exceptions propagate to claim wrapper |

---

## Test Locations and Framework

**Primary**: `scripts/simulate-workflow-walkthrough.js` — hand-rolled `assert()`, no framework.

**gh-shim mock pattern** (established at ~line 335):
```js
const binDir = path.join(tmp, 'bin');
fs.mkdirSync(binDir, { recursive: true });
const ghShim = path.join(binDir, 'gh');
fs.writeFileSync(ghShim, [
  '#!/usr/bin/env node',
  "if (process.argv.includes('issue')) { process.exit(1); }",  // simulate auth failure
].join('\n'));
fs.chmodSync(ghShim, 0o755);
// inject via env: { PATH: binDir + ':' + process.env.PATH }
```

**GitLab/Gitea tests**: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` and Gitea equivalent use `withFakeForge(overrides, fn)` for in-process mocking.

---

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-classifier.js:352–359` | Primary GitHub fail-open in `cmdClassify` |
| `scripts/kaola-workflow-claim.js:297–312` | GitHub `classifyIssue` wrapper — 3 green leaks |
| `scripts/kaola-workflow-active-folders.js:38–47` | GitHub `issueIsClosed` fail-open |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js:253–258,295–300` | GitLab fail-open |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:249–255` | GitLab claim wrapper |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js:40–47` | GitLab `issueIsClosed` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js:258–263,299–304` | Gitea fail-open |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:252–258` | Gitea claim wrapper |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js:40–47` | Gitea `issueIsClosed` |
| `scripts/simulate-workflow-walkthrough.js` | Primary test harness |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | GitLab tests |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Gitea tests |
