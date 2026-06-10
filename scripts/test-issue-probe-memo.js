#!/usr/bin/env node
'use strict';

// #362: per-invocation memo + batched `gh issue list` prefetch + cross-process snapshot seed for
// active-folders' issue-state probes. Counts gh-shim invocations to prove the ≥50% reduction.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-probe-')));
const counter = path.join(tmp, 'calls.log');
const mock = path.join(tmp, 'gh-mock.js');
// Mock gh: log each invocation; answer `issue list` with a 3-issue snapshot, `issue view` per-issue.
fs.writeFileSync(mock, [
  "const fs=require('fs');",
  "fs.appendFileSync(" + JSON.stringify(counter) + ", process.argv.slice(2).join(' ') + '\\n');",
  "const a=process.argv.slice(2);",
  "if(a[0]==='issue'&&a[1]==='list'){process.stdout.write(JSON.stringify([{number:101,state:'OPEN'},{number:102,state:'CLOSED'},{number:103,state:'OPEN'}]));}",
  "else if(a[0]==='issue'&&a[1]==='view'){process.stdout.write(JSON.stringify({state:'OPEN'}));}",
  "else{process.stdout.write('');}",
].join('\n'));

function countCalls() { try { return fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length; } catch (_) { return 0; } }

try {
  process.env.KAOLA_GH_MOCK_SCRIPT = mock;
  delete process.env.KAOLA_WORKFLOW_OFFLINE;
  delete process.env.KAOLA_ISSUE_STATE_SNAPSHOT;
  const af = require('./kaola-workflow-active-folders');

  // Batched prefetch: ONE `gh issue list` for 3 issues...
  af.prefetchIssueStates([101, 102, 103]);
  assert(countCalls() === 1, '#362: prefetch makes exactly ONE gh call for 3 issues, got ' + countCalls());

  // ...then issueIsClosed for each hits the memo → ZERO additional calls (vs 3 per-issue views).
  assert(af.issueIsClosed(101) === false, '#362: issue 101 open (from snapshot)');
  assert(af.issueIsClosed(102) === true, '#362: issue 102 closed (from snapshot)');
  assert(af.issueIsClosed(103) === false, '#362: issue 103 open (from snapshot)');
  assert(countCalls() === 1, '#362: memoized issueIsClosed adds ZERO gh calls — total still 1 (≥66% < 3 unbatched), got ' + countCalls());

  // probeIssueState also hits the memo.
  assert(af.probeIssueState(102).state === 'closed', '#362: probeIssueState reads the memo');
  assert(countCalls() === 1, '#362: probeIssueState memo hit adds no gh call, got ' + countCalls());

  // Snapshot serialization round-trips.
  const snap = af.getIssueStateSnapshot();
  assert(snap['102'] === 'closed' && snap['101'] === 'open', '#362: getIssueStateSnapshot serializes memo, got ' + JSON.stringify(snap));

  // Cross-process seed: a fresh process given KAOLA_ISSUE_STATE_SNAPSHOT makes ZERO gh calls.
  const subCounter = path.join(tmp, 'sub-calls.log');
  const subMock = path.join(tmp, 'gh-mock2.js');
  fs.writeFileSync(subMock, "require('fs').appendFileSync(" + JSON.stringify(subCounter) + ", 'CALLED\\n'); process.stdout.write('{\"state\":\"OPEN\"}');");
  const out = execFileSync(process.execPath, ['-e',
    "const af=require(" + JSON.stringify(path.resolve(__dirname, 'kaola-workflow-active-folders.js')) + ");" +
    "process.stdout.write(String(af.issueIsClosed(102)));"
  ], { encoding: 'utf8', env: Object.assign({}, process.env, {
    KAOLA_ISSUE_STATE_SNAPSHOT: JSON.stringify({ 102: 'closed' }),
    KAOLA_GH_MOCK_SCRIPT: subMock,
  }) });
  assert(out === 'true', '#362: seeded subprocess resolves issue 102 closed, got ' + out);
  assert(!fs.existsSync(subCounter), '#362: seeded subprocess makes ZERO gh calls (cross-process reuse)');
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

if (failed > 0) {
  console.error('issue-probe-memo tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('issue-probe-memo tests passed (' + passed + ' assertions)');
}
