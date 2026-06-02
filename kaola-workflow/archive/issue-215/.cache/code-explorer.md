# Code Explorer: Issue #215 — sectionBody fence-awareness gap

## sectionBody function — exact locations in all 4 files

**Root classifier** `scripts/kaola-workflow-classifier.js` lines 129–142:
```js
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  let i = 0;
  for (; i < lines.length; i++) { if (headRe.test(lines[i])) { i++; break; } }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}
```

**Codex mirror** `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` lines 129–142 — byte-identical to root.

**GitLab mirror** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` lines 97–110 — same logic, no inFence guard.

**Gitea mirror** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` lines 102–115 — same logic, no inFence guard.

**Bug**: body-collector loop uses `/^##\s/.test(lines[i])` unconditionally. A `## Some Heading` inside a fenced block matches and truncates the slice.

## scanClaimedOverlap call chain

- Root line 242: `fastScope = sectionBody(fs.readFileSync(path.join(projectDir, 'fast-summary.md'), 'utf8'), 'Scope');`
- Line 244: `const combined = phase3Content + '\n' + phase1Content + '\n' + fastScope;`
- Line 245: `const claimedPaths = extractFilePaths(combined);`
- Lines 251–256: path comparison; `hasExactOverlap = true` if match
- Result → `classify()` → `verdict: red` if overlap

- GitLab line 206: `combined += '\n' + sectionBody(fs.readFileSync(fastSummary, 'utf8'), 'Scope');`
- Gitea line 211: same pattern

## validate-script-sync.js
- File: `scripts/validate-script-sync.js`
- `COMMON_SCRIPTS` array entry 3: `'kaola-workflow-classifier.js'`
- Enforces byte-identity between `scripts/` and `plugins/kaola-workflow/scripts/`
- Fix procedure: edit `scripts/kaola-workflow-classifier.js`, then `cp scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- gitlab/gitea classifiers are NOT in this sync list; hand-edited

## Existing fence tests (added in #213)

**Root walkthrough** `scripts/simulate-workflow-walkthrough.js`:
- `testClassifierFastScopeFenceCommentRed` at lines 589–611
- Plants fast project with `## Scope` containing ` ```sh `, `# set up the harness before writing`, ` ``` `, then `- Write Set: scripts/kaola-workflow-claim.js`
- Candidate overlaps → asserts `result.verdict === 'red'` and `result.reasoning.includes('exact file path')`
- Registered at line 4096 (after `testClassifierFastScopeSectionIsolationGreen()`)
- **New test goes immediately after line 4096 registration**

**GitLab** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` lines 520–537:
- `withForge` block; fenced `# set up before writing` above `- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js`
- `assert.strictEqual(result.verdict, 'red')`
- **New test goes after line 537**

**Gitea** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` lines 526–543:
- Same pattern; claimed.js path for gitea
- **New test goes after line 543**

**Critical gap**: #213 tests only cover `# comment` (h1-ish, doesn't match `/^##\s/`). Issue #215 gap: `## ` h2 line inside fence still matches break condition and truncates.

## Test registration pattern

```js
// Around line 4096 in simulate-workflow-walkthrough.js:
testClassifierFastScopeOverlapRed();
testClassifierFastScopeDisjointGreen();
testClassifierFastScopeSectionIsolationGreen();
testClassifierFastScopeFenceCommentRed();     // #213 — line 4096
// → testClassifierFastScopeFenceHeadingRed(); goes here (#215)
testClassifierDependsOnGate();               // currently at line 4097
```

## withForge block template (gitlab #213, lines 520–537)
```js
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-');
  const dir = writeState(root, 'fast-fence-project', 28);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n# set up before writing\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(29, root);
  assert.strictEqual(result.verdict, 'red');
});
```
For #215: change fence content to ` ```markdown\n## Some Heading\n``` `, use IID 30 and prefix `kw-gl-fast-fence-h2-`.

## npm test chain
```
npm test
  ├── test:kaola-workflow:claude
  │     node scripts/validate-script-sync.js  ← byte-identity check
  │     node scripts/simulate-workflow-walkthrough.js
  ├── test:kaola-workflow:codex
  │     node scripts/validate-script-sync.js  ← again
  │     node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
  ├── test:kaola-workflow:gitlab
  │     node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
  │       └── runs test-gitlab-workflow-scripts.js via execFileSync at line 157
  └── test:kaola-workflow:gitea
        node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
          └── runs test-gitea-workflow-scripts.js via execFileSync at line 245
```

## Key file/line table
| File | Lines of interest |
|------|-------------------|
| `scripts/kaola-workflow-classifier.js` | sectionBody: 129-142; fastScope callsite: 242 |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | sectionBody: 129-142 (byte-identical) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | sectionBody: 97-110; callsite: 206 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | sectionBody: 102-115; callsite: 211 |
| `scripts/simulate-workflow-walkthrough.js` | #213 fence test def: 589-611; registration: 4096 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | #213 fence block: 520-537; withForge def: 28-39 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | #213 fence block: 526-543; withForge def: 28-39 |
| `scripts/validate-script-sync.js` | COMMON_SCRIPTS entry 3 (classifier): line 41 |
