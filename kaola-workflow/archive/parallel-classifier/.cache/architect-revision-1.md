# Code-Architect Revision 1: parallel-classifier

## Changes vs Original Blueprint

### 1. Bug 1 Fix — OFFLINE cmdClassify body handling

Corrected OFFLINE branch in `cmdClassify()` (Task 1):

```js
if (OFFLINE) {
  const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
  let labels = [];
  let body = '';
  if (fs.existsSync(roadmapFile)) {
    const content = fs.readFileSync(roadmapFile, 'utf8');
    const nextStep = field(content, 'next_step');
    if (/blocked by #\d+/i.test(nextStep)) {
      const m = nextStep.match(/#(\d+)/);
      if (m) labels = [{ name: 'depends-on:#' + m[1] }];
    }
    // read body field (may be absent — defaults to '')
    try { body = field(content, 'body'); } catch (_) {}
  }
  const result = classify({ number: args.issue, labels, body }, locks, root);
  process.stdout.write(JSON.stringify(result) + '\n');
  return;
}
```

The `field(content, 'body')` call uses the same helper already required for `next_step`. The `try/catch` ensures a missing `body:` field degrades gracefully to empty string.

### 2. Bug 2 Fix — Epic Cases 6D/6E redesigned + 6E' added

Sub-tests 6D, 6E, and new 6E' in Task 5 (`simulate-workflow-walkthrough.js`):

```js
// Sub-test 6D: OFFLINE + roadmap depends-on → blocked (conservative path)
fs.writeFileSync(path.join(roadmapDir, 'issue-13.md'),
  'issue: #13\ntitle: blocked feature\nstatus: open\nworkflow_project: —\nnext_step: blocked by #20\n');
const out6D = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '13'],
  { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
const r6D = JSON.parse(out6D);
assert(r6D.verdict === 'blocked', 'Epic Case 6D: OFFLINE + depends-on must yield blocked, got ' + r6D.verdict);
assert(r6D.reasoning.includes('OFFLINE'), 'Epic Case 6D: reasoning must mention OFFLINE');

// Sub-test 6E: online depends-on with dep OPEN → blocked
// gh shim: "issue view 15" returns issue with depends-on:#30 label; "issue view 30" returns open state
const ghShimDir = path.join(epic6Tmp, 'bin');
fs.mkdirSync(ghShimDir, { recursive: true });
const ghShimPath = path.join(ghShimDir, 'gh');
const ghShimScript = [
  '#!/bin/sh',
  'ARGS="$@"',
  'case "$ARGS" in',
  '  *"issue view 15"*)',
  '    echo \'{"number":15,"title":"needs open dep","body":"","labels":[{"name":"depends-on:#30"}],"state":"open"}\'',
  '    ;;',
  '  *"issue view 30"*)',
  '    echo \'{"state":"open","closedAt":null}\'',
  '    ;;',
  '  *)',
  '    echo \'[]\' ;;',
  'esac',
].join('\n');
fs.writeFileSync(ghShimPath, ghShimScript);
fs.chmodSync(ghShimPath, 0o755);
fs.writeFileSync(path.join(roadmapDir, 'issue-15.md'),
  'issue: #15\ntitle: needs open dep\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
const out6E = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '15'],
  { cwd: epic6Tmp, encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: ghShimDir + ':' + process.env.PATH } });
const r6E = JSON.parse(out6E);
assert(r6E.verdict === 'blocked', 'Epic Case 6E: online depends-on open must yield blocked, got ' + r6E.verdict);

// Sub-test 6E': online depends-on with dep CLOSED → not blocked
const ghShimScript2 = ghShimScript
  .replace('"state":"open","closedAt":null', '"state":"closed","closedAt":"2026-01-01T00:00:00Z"');
fs.writeFileSync(ghShimPath, ghShimScript2);
const out6E2 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '15'],
  { cwd: epic6Tmp, encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: ghShimDir + ':' + process.env.PATH } });
const r6E2 = JSON.parse(out6E2);
assert(r6E2.verdict !== 'blocked', 'Epic Case 6E\': dep closed must not yield blocked, got ' + r6E2.verdict);
```

Differences from original:
- 6D asserts `reasoning.includes('OFFLINE')` to pin the conservative-path reasoning string
- 6E is genuinely online (no OFFLINE env var), uses gh shim injected via PATH prepend
- 6E' is new — exercises closed-dependency path, verifying no over-blocking

### 3. N+1 Out-of-Scope Addition

Added as item 9 to Out-of-Scope:

> **N+1 acceptable**: Router calls classifier.js once per candidate; each online invocation performs one `gh issue view N` for depends-on resolution. For roadmaps with ≤50 open issues this is acceptable. Batching is a future optimization.

### No Other Changes

Tasks 2, 3, 4, 6, 7, data flow, parallelization plan, and build sequence are all unchanged.
