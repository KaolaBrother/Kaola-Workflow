'use strict';
// Sandbox re-run of the outer round-2 probe against the repaired sink.
// Does not write under .kaola/outer-review-1113.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const worktree = '/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113';
const sandbox = '/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-r2fix/probe-sandbox';
const sourceRoot = path.join(sandbox, 'source');
const adapterPath = '/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v6/controls/adapter-v6.js';
const BOUND = [
  'scripts/kaola-workflow-sink-pr.js',
  'scripts/kaola-workflow-claim.js',
  'scripts/kaola-workflow-active-folders.js',
  'scripts/kaola-workflow-adaptive-schema.js',
  'scripts/kaola-workflow-classifier.js',
  'scripts/kaola-workflow-closure-contract.js',
  'scripts/test-git-fixture.js',
];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function gitBlobSha1(buf) {
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');
}

fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });
for (const rel of BOUND) {
  const dest = path.join(sourceRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(worktree, rel), dest);
}
const files = BOUND.map((rel) => {
  const bytes = fs.readFileSync(path.join(sourceRoot, rel));
  return {
    path: rel, mode: '100644', gitBlobSha1: gitBlobSha1(bytes), sha256: sha256(bytes),
    size: bytes.length, role: rel.endsWith('test-git-fixture.js') ? 'fixture-helper' : 'candidate-production'
  };
});
const manifest = {
  schema: 'issue-1113-r2fix-sandbox-bound-source',
  commit: 'worktree-repaired-sink',
  sourceRoot: path.resolve(sourceRoot),
  files
};
const manifestPath = path.join(sandbox, 'bound-source-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

process.env.KW_CANDIDATE_SOURCE = path.resolve(sourceRoot);
process.env.KW_V3_BOUND_MANIFEST = manifestPath;
process.env.KW_ISSUE_1113_TEST_ROOT = sandbox;
process.env.KW_REAL_FIXTURES_ROOT = path.join(sandbox, 'fixtures');
process.env.KW_REAL_RUNS_ROOT = path.join(sandbox, 'runs');

const adapter = require(adapterPath);
const rows = [
  ['url-closing-create', {}, 'Fixes: https://github.com/KaolaBrother/VRPCadCore/issues/143'],
  ['stale-repository-create', { repository: 'https://github.com/other/repo.git' }, 'Fixes KaolaBrother/VRPCadCore#143'],
  ['own-qualified-refusal-control', {}, 'Fixes KaolaBrother/VRPCadCore#143']
];

(async () => {
  const out = [];
  for (const [name, identityChange, headCommitMessage] of rows) {
    const identity = Object.assign(JSON.parse(JSON.stringify(adapter.identity)), identityChange);
    const r = await adapter.run({
      name, identity, expectedBase: 'main', runCwd: identity.linkedWorktree,
      issueAction: 'comment_keep_open', config: { pr_auto_merge: true }, forge: 'github',
      sourceLocation: 'live', syntheticEvidenceFixture: true,
      originUrl: 'https://github.com/KaolaBrother/VRPCadCore.git', headCommitMessage
    });
    const stderrPath = path.join(sandbox, 'runs', 'scenarios', name, 'children', 'sink-attempt-1', 'stderr.raw');
    const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : '';
    const reason = (stderr.match(/explicit_keep_open_refused:\s*[a-z_]+/) || [null])[0];
    out.push({
      name, headCommitMessage, outcome: r.outcome, reason,
      exit: r.stages && r.stages.request ? r.stages.request.exit : null,
      operationNames: (r.operations || []).map(op => op.name),
      stderr: stderr.trim()
    });
  }
  const summaryPath = path.join(sandbox, 'reprobe-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(out, null, 2) + '\n');
  const expect = {
    'url-closing-create': 'explicit_keep_open_refused: closing_linkage',
    'stale-repository-create': 'explicit_keep_open_refused: repository_conflict',
    'own-qualified-refusal-control': 'explicit_keep_open_refused: closing_linkage'
  };
  let failed = false;
  for (const row of out) {
    const banned = row.operationNames.filter(n => n === 'git.push' || n === 'pr.create' || n === 'request.record' || n === 'archive');
    const ok = row.outcome === 'refused' && row.reason === expect[row.name] && banned.length === 0;
    if (row.name === 'stale-repository-create') {
      if (!/State repository is other\/repo/.test(row.stderr) ||
          !/origin repository is KaolaBrother\/VRPCadCore/.test(row.stderr)) {
        failed = true;
        console.error('MISSING IDENTITIES', row.stderr);
      }
    }
    if (!ok) failed = true;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + row.name + ' outcome=' + row.outcome + ' reason=' + row.reason +
      ' ops=' + JSON.stringify(row.operationNames));
  }
  if (failed) process.exitCode = 1;
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
