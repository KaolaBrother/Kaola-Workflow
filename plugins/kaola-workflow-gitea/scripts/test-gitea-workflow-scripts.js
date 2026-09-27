#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('test-gitea-workflow-scripts'); } catch (_) { /* advisory only */ }

const assert = require('assert');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createHash } = require('crypto');

// OFFLINE is captured as a module-level constant in the classifier. Remove it from the
// environment before requiring any workflow module so that withForge stubs are reachable
// during the classify-blocked and classify-red tests. Subprocesses that need OFFLINE set
// do so explicitly via their own env option.
delete process.env.KAOLA_WORKFLOW_OFFLINE;
// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// The module-top KAOLA_ENABLE_ADAPTIVE pin is removed.

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned;
// point HOME/USERPROFILE at a throwaway sandbox so nothing in this suite reads or writes the
// developer's real one. Nothing is seeded: an absent config is the shape a fresh machine has.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

// #1101: the Codex preflight sets no version floor and requires no dispatch mode, so no suite
// attests a Codex version and the shared sandbox HOME is seeded with no Codex config at all: a
// clean HOME is exactly the shape the preflight passes on (multi_agent_v2 reported, never required).

const forge = require('./kaola-gitea-forge');
const active = require('./kaola-gitea-workflow-active-folders');
const classifier = require('./kaola-gitea-workflow-classifier');
const claim = require('./kaola-gitea-workflow-claim');

const claimScript = path.join(__dirname, 'kaola-gitea-workflow-claim.js');
const classifierScript = path.join(__dirname, 'kaola-gitea-workflow-classifier.js');
const closureAuditScript = path.join(__dirname, 'kaola-gitea-workflow-closure-audit.js');

function withForge(stubs, fn) {
  const originals = {};
  for (const key of Object.keys(stubs)) {
    originals[key] = forge[key];
    forge[key] = stubs[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(stubs)) forge[key] = originals[key];
  }
}

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeState(root, project, issueNum, extra) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    'phase: 1',
    'phase_name: Research',
    'step: start',
    'next_command: /kaola-workflow-phase1 ' + project,
    'next_skill: kaola-workflow-research ' + project,
    '',
    '## Gitea',
    'issue_number: ' + issueNum,
    'full_name: group/repo',
    'project_html_url: https://gitea.example/group/repo',
    '',
    '## Sink',
    'branch: workflow/gitea-issue-' + issueNum,
    'issue_number: ' + issueNum,
    'sink: merge',
    extra || ''
  ].join('\n') + '\n');
  return dir;
}


function trustCodexProject(homeRoot, projectRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const prefix = existing.length === 0 ? '' : existing.replace(/\s*$/, '\n\n');
  fs.writeFileSync(configPath,
    prefix + '[projects.' + JSON.stringify(path.resolve(projectRoot)) + ']\ntrust_level = "trusted"\n');
}

// #1101: multi_agent_v2 is a host fact the preflight and the installer REPORT and never require or
// write (the #775 codex_multi_agent_v2_required refusal went with Kaola's roles). Fixtures that pin
// the V2-enabled report, or a project layer inheriting it from HOME, enable it here — PREPENDED so
// the feature table stays ahead of whatever tables the fixture already holds.
function enableMultiAgentV2(homeRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  fs.writeFileSync(configPath, '[features.multi_agent_v2]\nenabled = true\n\n' + existing);
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runNodeRaw(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function runNodeAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

// On macOS 15 (Darwin 25.4.0), execFileSync(scriptPath, args) hangs when
// scriptPath has ANY shebang. Solution: write only the .js logic file; callers
// set KAOLA_TEA_MOCK_SCRIPT so teaExec routes through process.execPath.
function writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function teaMockEnv(binDir) {
  const jsPath = path.join(binDir, 'tea.js');
  return fs.existsSync(jsPath) ? { KAOLA_TEA_MOCK_SCRIPT: jsPath } : {};
}

// probeTimeoutEnv — scales KAOLA_GH_REMOTE_TIMEOUT_MS for parallel test runs.
// When TEST_PARALLEL=1 (4-chain concurrent load), raises the probe margin to 2000ms
// (~6.7x) to absorb scheduling starvation; defaults to 300ms for serial runs.
// Byte-verbatim across all three driver files (simulate-workflow-walkthrough.js,
// test-gitlab-workflow-scripts.js, test-gitea-workflow-scripts.js).
function probeTimeoutEnv() { return { KAOLA_GH_REMOTE_TIMEOUT_MS: process.env.TEST_PARALLEL === '1' ? '2000' : '300' }; }

// testProbeTimeoutEnv — RED→GREEN seam: asserts probeTimeoutEnv() returns '2000' under
// TEST_PARALLEL=1 and '300' otherwise (set/restore around the assertion).
function testProbeTimeoutEnv() {
  const prev = process.env.TEST_PARALLEL;
  try {
    process.env.TEST_PARALLEL = '1';
    const r1 = probeTimeoutEnv();
    if (r1.KAOLA_GH_REMOTE_TIMEOUT_MS !== '2000') {
      throw new Error('probeTimeoutEnv must return "2000" under TEST_PARALLEL=1, got: ' + r1.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
    delete process.env.TEST_PARALLEL;
    const r2 = probeTimeoutEnv();
    if (r2.KAOLA_GH_REMOTE_TIMEOUT_MS !== '300') {
      throw new Error('probeTimeoutEnv must return "300" when TEST_PARALLEL is unset, got: ' + r2.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
    process.env.TEST_PARALLEL = '0';
    const r3 = probeTimeoutEnv();
    if (r3.KAOLA_GH_REMOTE_TIMEOUT_MS !== '300') {
      throw new Error('probeTimeoutEnv must return "300" when TEST_PARALLEL="0", got: ' + r3.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
  } finally {
    if (prev === undefined) delete process.env.TEST_PARALLEL;
    else process.env.TEST_PARALLEL = prev;
  }
  console.log('testProbeTimeoutEnv: PASSED');
}

// Run closure-audit online (mock tea via KAOLA_TEA_MOCK_SCRIPT). Mirrors runClaimOnline.
function runClosureAudit(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  assert.strictEqual(result.status, 0, 'closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Run closure-audit offline (no tea shim; remote classes must report skipped_offline).
function runClosureAuditOffline(args, cwd) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert.strictEqual(result.status, 0, 'offline closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// #903: the operator-input-error and --help cases need a DIRECT spawn. runClosureAudit and
// runClosureAuditOffline above both assert status === 0 and JSON.parse stdout unconditionally, so
// neither can observe an exit-1 run or a usage banner. KAOLA_WORKFLOW_OFFLINE is set EXPLICITLY
// rather than inherited: what these argv assertions ran under is stated, not ambient. Every
// assertion below is decided before any remote call (parseArgs throws before getRoot(); resolveScope
// throws before buildAuditReport), so offline costs the argv contract nothing.
function runClosureAuditRaw(args, cwd, extraEnv) {
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', ...(extraEnv || {}) }
  });
  assert(!result.signal, 'raw closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  return result;
}

// Write a `tea` shim (Gitea CLI) whose body is matched on the joined process.argv.
function closureAuditShim(binDir, lines) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), lines);
}

// Plant kaola-workflow/.roadmap/issue-N.md with `issue: #N` (the field readRoadmapIssues requires).
function plantClosureRoadmapSource(root, issueNumber) {
  const dir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'issue-' + issueNumber + '.md'),
    'issue: #' + issueNumber + '\ntitle: stale source\nstatus: open\n'
  );
}

// Convert an existing active folder's state file into a sink=pr folder with pr_url/pr_number.
// Mirrors the inline mutation; does NOT add a sink param to writeState.
function makePrSinkFolder(root, project, issueNumber) {
  const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
  let content = fs.readFileSync(stateFile, 'utf8');
  content = content.replace(/^sink:\s*.*$/m, 'sink: pr');
  content += 'pr_url: https://gitea.example/group/project/pulls/' + issueNumber + '\n';
  content += 'pr_number: ' + issueNumber + '\n';
  fs.writeFileSync(stateFile, content);
}

function writeTeaShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('--version')) { process.stdout.write('tea version 0.9.2\\n'); process.exit(0); }",
    "if (a.includes('issues view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issues view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
    "else process.stdout.write('[]\\n');"
  ]);
}

function writeTeaShimOpen(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('--version')) { process.stdout.write('tea version 0.9.2\\n'); process.exit(0); }",
    "if (a.includes('issues view')) process.stdout.write('{\"state\":\"open\",\"labels\":[]}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":1}\\n');",
    "else process.stdout.write('[]\\n');"
  ]);
}

function initGitRepo(root) {
  let result = G.git(root, ['init'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  G.git(root, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  G.git(root, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  result = G.git(root, ['add', 'README.md'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  result = G.git(root, ['commit', '-m', 'init'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Issue #223 — three lifecycle fixes, gitea edition
// ---------------------------------------------------------------------------

// Test 1: watch-pr CLOSED path must NOT fire roadmap invariants when archive=abandoned
function testWatchPrAbandonedClosureInvariantsClean() {
  const root = tempRoot('kw-gt-watchpr-abandoned-inv-');
  try {
    initGitRepo(root);
    writeState(root, 'issue-920', 920, 'pr_url: https://gitea.example/group/repo/pulls/920');
    makePrSinkFolder(root, 'issue-920', 920);
    const result = withForge({
      viewPullRequest(prNumber) {
        assert.strictEqual(prNumber, 920);
        return { pr_number: 920, state: 'closed' };
      },
      updateIssueLabels() { return {}; },
      createIssueComment() { return { id: 9003 }; }
    }, () => claim.watchMergeRequests(root, {}));
    assert.strictEqual(result.watched, 1, 'watched must be 1');
    assert(Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'cleanups must have an entry for CLOSED PR, got: ' + JSON.stringify(result));
    const cleanup = result.cleanups[0];
    assert(cleanup.receipt && cleanup.receipt.archive === 'abandoned',
      'receipt.archive must be abandoned, got: ' + JSON.stringify(cleanup.receipt));
    assert(cleanup.closure_invariants && cleanup.closure_invariants.ok === true,
      'closure_invariants.ok must be true for abandoned PR, got: ' + JSON.stringify(cleanup.closure_invariants));
    console.log('testWatchPrAbandonedClosureInvariantsClean: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 2: claimProject must reclaim a stateless orphan dir (no workflow-state.md)
function testGiteaClaimReclaimsStatelessOrphanDir() {
  const root = tempRoot('kw-gt-claim-orphan-');
  try {
    initGitRepo(root);
    // Positive: orphan dir with no state file
    const orphanDir = path.join(root, 'kaola-workflow', 'issue-888');
    fs.mkdirSync(orphanDir, { recursive: true });
    assert(!fs.existsSync(path.join(orphanDir, 'workflow-state.md')), 'fixture: no state file should exist');
    const result = withForge({
      discoverProject() { return { full_name: null, html_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-888' }));
    assert.strictEqual(result.status, 'acquired',
      '#14 POSITIVE: orphan dir must be reclaimed, got: ' + JSON.stringify(result));
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'issue-888', 'workflow-state.md')),
      '#14 POSITIVE: workflow-state.md must be written after reclaim');
    // Negative boundary: dir with non-active (status: closed) state file must return
    // target_occupied. readActiveFolders skips inactive status, so claimProject reaches
    // the EEXIST guard added by fix #14 and checks existsSync(stateFile).
    const occupied = path.join(root, 'kaola-workflow', 'issue-889');
    fs.mkdirSync(occupied, { recursive: true });
    fs.writeFileSync(path.join(occupied, 'workflow-state.md'),
      ['# Kaola-Workflow State', '', '## Project', 'name: issue-889', 'status: closed', ''].join('\n'));
    const result2 = withForge({
      discoverProject() { return { full_name: null, html_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-889' }));
    assert.strictEqual(result2.status, 'target_occupied',
      '#14 NEGATIVE: dir with non-active state file must return target_occupied, got: ' + JSON.stringify(result2));
    console.log('testGiteaClaimReclaimsStatelessOrphanDir: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 3: cmdPatchBranch must guard against non-existent projects and unsafe names
function testGiteaPatchBranchGuards() {
  // (a) ghost project: non-existent project → exit non-zero, dir not created
  {
    const root = tempRoot('kw-gt-patchbranch-ghost-');
    try {
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'ghost-proj', '--branch', 'workflow/ghost'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(r.status !== 0, '#15(a): patch-branch ghost-proj must exit non-zero, got exit ' + r.status);
      assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'ghost-proj')), '#15(a): ghost-proj dir must not be created');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // (b) unsafe name → exit 1 with 'unsafe project name'
  {
    const root = tempRoot('kw-gt-patchbranch-escape-');
    try {
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', '../escape-poc', '--branch', 'workflow/escape'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(r.status === 1, '#15(b): patch-branch ../escape-poc must exit 1, got exit ' + r.status);
      assert(r.stderr.includes('unsafe project name'),
        '#15(b): stderr must contain "unsafe project name", got: ' + r.stderr);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // (c) positive: active project → patch-branch succeeds
  {
    const root = tempRoot('kw-gt-patchbranch-active-');
    try {
      writeState(root, 'issue-63', 63, '');
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'issue-63', '--branch', 'workflow/gitea-issue-63'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(r.status, 0, '#15(c): patch-branch on active project must exit 0, stderr: ' + r.stderr);
      const out = JSON.parse(r.stdout.trim());
      assert.strictEqual(out.patched, true, '#15(c): must return patched:true');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  console.log('testGiteaPatchBranchGuards: PASSED');
}

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: issueIid === 11 ? 'closed' : 'open', labels: [] };
  }
}, () => {
  const root = tempRoot('kw-gt-active-');
  writeState(root, 'open-project', 10);
  writeState(root, 'closed-project', 11);
  const folders = active.readActiveFolders(root);
  assert.deepStrictEqual(folders.map(folder => folder.project), ['open-project']);
  assert.strictEqual(folders[0].issue_iid, 10);
});

// probeIssueState: null issueNumber -> { state: 'open', reason: 'offline-or-null' }
{
  const result = active.probeIssueState(null);
  assert.strictEqual(result.state, 'open', 'probeIssueState(null) should return state open');
  assert.strictEqual(result.reason, 'offline-or-null', 'probeIssueState(null) should return reason offline-or-null');
}

// Case 2a (#519 RECONCILE): a GENUINE-negative status-bearing throw (a real 404 stderr) → still
// { state: 'unavailable' } with NO transient discriminant + reason 'tea issue fetch failed'. The
// .state-only contract is preserved (closure-audit / probe-memo unaffected); the claim gates refuse.
withForge({
  viewIssue() {
    const e = new Error('tea exited 1');
    e.status = 1;
    e.stderr = 'Could not resolve to an Issue with the number of 42.\n';
    throw e;
  }
}, () => {
  active.__resetIssueStateMemo();
  const result = active.probeIssueState(42);
  assert.strictEqual(result.state, 'unavailable', '#519: genuine-negative throw → state: unavailable');
  assert.strictEqual(result.transient, undefined, '#519: genuine-negative throw must NOT set transient (got ' + JSON.stringify(result) + ')');
  assert.strictEqual(result.reason, 'tea issue fetch failed', '#519: genuine-negative reason');
});

// Case 2b (#519): a TRANSIENT-infra throw (no exit status / TLS / rate-limit) → { state:'unavailable',
// transient:true } so ONLY the claim gates escalate. A bare no-status Error is spawn/killed-class
// (transient by construction) under the corrected exit-code+stderr axis.
withForge({
  viewIssue() { throw new Error('network error'); } // no status → killed-class → transient
}, () => {
  active.__resetIssueStateMemo();
  const result = active.probeIssueState(420);
  assert.strictEqual(result.state, 'unavailable', '#519: transient throw → state: unavailable');
  assert.strictEqual(result.transient, true, '#519: no-status throw → transient:true (got ' + JSON.stringify(result) + ')');
});

// probeIssueState: forge.viewIssue returns { state: 'closed' } -> { state: 'closed', reason: 'ok' }
withForge({
  viewIssue() { return { state: 'closed' }; }
}, () => {
  const result = active.probeIssueState(77);
  assert.strictEqual(result.state, 'closed', 'probeIssueState on closed issue should return state closed');
  assert.strictEqual(result.reason, 'ok', 'probeIssueState on closed issue should return reason ok');
});

// probeIssueState: forge.viewIssue returns residual state 'unknown' -> { state: 'unavailable', reason: 'tea issue state unverified' }
withForge({ viewIssue() { return { state: 'unknown' }; } }, () => {
  const result = active.probeIssueState(44);
  assert.strictEqual(result.state, 'unavailable', 'residual state must map to unavailable');
  assert.strictEqual(result.reason, 'tea issue state unverified', 'residual reason');
});

// classify blocked: stub viewIssue to return a claimed issue (has CLAIM_LABEL) with a touches path
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [forge.CLAIM_LABEL],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/new-file.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-classify-');
  const result = classifier.classifyIssue(20, root);
  assert.strictEqual(result.verdict, 'blocked');
});

withForge({
  listIssues() {
    return [
      { issue_iid: 9, number: 9, state: 'open' },
      { issue_iid: 8, number: 8, state: 'closed' },
      { issue_iid: 7, number: 7, state: 'open' }
    ];
  }
}, () => {
  const root = tempRoot('kw-gt-list-');
  try {
    assert.deepStrictEqual(claim.listOpenIssues(root).map(issue => issue.issue_iid), [7, 9]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// readPriorityConfig tests
{
  // Case a: missing config → default
  const root = tempRoot('kw-gt-rpc-');
  try {
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig missing config: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case b: valid array config → custom
  const root = tempRoot('kw-gt-rpc-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: ['critical', 'hotfix'] }));
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['critical', 'hotfix']);
    console.log('readPriorityConfig valid array: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case c: non-array value → default
  const root = tempRoot('kw-gt-rpc-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: 'not-an-array' }));
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig non-array → default: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Discriminating priority-sort test for listOpenIssues
{
  const root = tempRoot('kw-gt-sort-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'kaola-workflow', 'config.json'),
      JSON.stringify({ priority_top_tier_labels: ['critical'] })
    );
    withForge({
      listIssues() {
        return [
          { issue_iid: 5, number: 5, state: 'open', labels: ['critical'] },
          { issue_iid: 3, number: 3, state: 'open', labels: ['P0'] },
          { issue_iid: 9, number: 9, state: 'open', labels: [] },
          { issue_iid: 1, number: 1, state: 'open', labels: ['P2'] }
        ];
      }
    }, () => {
      const result = claim.listOpenIssues(root);
      assert.deepStrictEqual(
        result.map(i => i.issue_iid || i.number),
        [3, 5, 1, 9]
      );
      console.log('listOpenIssues priority sort: PASS');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: '' };
  },
  discoverProject() {
    return { full_name: 'group/repo', html_url: 'https://gitea.example/group/repo' };
  },
  ensureLabel(project, labelDef) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(labelDef.name, forge.CLAIM_LABEL);
    return { id: 1 };
  },
  updateIssueLabels(project, issueNum, opts) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(issueNum, 23);
    assert.deepStrictEqual(opts.add, [forge.CLAIM_LABEL]);
    return {};
  },
  createIssueComment(project, issueNum, body) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(issueNum, 23);
    assert(body.includes('issue-23'));
    return { id: 9001 };
  }
}, () => {
  const root = tempRoot('kw-gt-claim-');
  initGitRepo(root);
  const result = claim.claimExplicitTarget(root, { targetIssue: 23 });
  assert.strictEqual(result.status, 'acquired');
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'issue-23', 'workflow-state.md'), 'utf8');
  assert(state.includes('issue_number: 23'));
  assert(state.includes('full_name: group/repo'));
  assert(state.includes('project_html_url: https://gitea.example/group/repo'));
});

{
  const root = tempRoot('kw-gt-sink-');
  writeState(root, 'sink-project', 40);
  runNode([claimScript, 'sink-fallback', '--project', 'sink-project', '--reason', 'test'], root);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: pr'));
}

{
  const root = tempRoot('kw-gt-worktree-cleanup-');
  const kwRoot = fs.realpathSync(root) + '.kw';
  try {
    initGitRepo(root);
    const wtRelease = path.join(kwRoot, 'release-project');
    fs.mkdirSync(path.dirname(wtRelease), { recursive: true });
    let result = G.git(root, ['worktree', 'add', '-b', 'workflow/gitea-issue-70', '--', wtRelease, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'release-project', 70, 'worktree_path: ' + wtRelease);
    runNode([claimScript, 'release', '--project', 'release-project', '--reason', 'test'], root);
    assert(!fs.existsSync(wtRelease), 'Gitea release should remove linked worktree');

    const wtFinalize = path.join(kwRoot, 'finalize-project');
    result = G.git(root, ['worktree', 'add', '-b', 'workflow/gitea-issue-71', '--', wtFinalize, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'finalize-project', 71, 'worktree_path: ' + wtFinalize);
    runNode([claimScript, 'finalize', '--project', 'finalize-project', '--keep-worktree'], root);
    assert(fs.existsSync(wtFinalize), 'Gitea keep-worktree finalize should preserve worktree for final commit');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'finalize-project')), 'Gitea keep-worktree finalize should archive active folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// watch-pr: verify watchMergeRequests archives a merged PR project via forge stub.
withForge({
  viewPullRequest(prNumber) {
    assert.strictEqual(prNumber, 44);
    return { pr_number: 44, state: 'merged' };
  },
  updateIssueLabels() { return {}; },
  createIssueComment() { return { id: 9002 }; }
}, () => {
  const root = tempRoot('kw-gt-watch-pr-');
  writeState(root, 'pr-project', 44, 'pr_url: https://gitea.example/group/repo/pulls/44');
  const stateFile = path.join(root, 'kaola-workflow', 'pr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: pr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'pr-project', 'workflow-state.md')));
});

{
  const root = tempRoot('kw-gt-cwd-guard-');
  try {
    initGitRepo(root);
    const projectDir = writeState(root, 'cwd-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'cwd-project', '--reason', 'test'], {
      cwd: projectDir,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_ROOT: root }
    });
    assert.strictEqual(result.status, 1, 'cmdRelease should exit 1 when cwd is inside project dir');
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.released, false, 'cmdRelease should report released: false');
    assert.strictEqual(out.reason, 'refusing to discard current working directory', 'cmdRelease should report the CWD guard reason');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  viewIssue(iid) { return { issue_iid: iid, number: iid, state: 'closed', labels: [] }; }
}, () => {
  const root = tempRoot('kw-gt-drift-');
  try {
    writeState(root, 'drift-project', 60);
    const result = claim.partitionActiveAndDrift(root);
    assert.strictEqual(result.drift.length, 1, 'partitionActiveAndDrift should put closed-issue folder into drift');
    assert.strictEqual(result.active.length, 0, 'partitionActiveAndDrift should leave active empty when all issues are closed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- Task A: Gap 2/3 — issueHasWorkflowInProgressLabel and issueHasRemoteClaimNotes ---
// issueHasWorkflowInProgressLabel is a pure function — always testable
assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]));
assert(!classifier.issueHasWorkflowInProgressLabel([]));

// issueHasRemoteClaimNotes returns false in OFFLINE mode (by design).
// Verify the OFFLINE guard is in effect.
assert.strictEqual(classifier.issueHasRemoteClaimNotes(33), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1 (no remote access)');
assert.strictEqual(classifier.issueHasRemoteClaimNotes(34), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1');
assert.strictEqual(classifier.issueHasRemoteClaimNotes(35), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1');

// --- A remote-claim BLOCK must name WHICH of the two artifacts holds the claim ---
//
// The two probes directly above are exactly the two artifacts a re-claim can be blocked by, and
// they do NOT behave the same: the `workflow:in-progress` LABEL has no expiry anywhere and blocks
// forever, while the `kw:claim` COMMENT expires 24h after its `updated_at`. Both arms nevertheless
// emitted one undiscriminating sentence — "issue #N has a remote workflow claim" — so an operator
// could not tell which artifact to go and clear.
//
// TWO EMITTERS PER FORGE PORT, and this is where they diverge from canonical: the port carries a
// `classifyIssue` helper that RETURNS the envelope (the in-process site
// `kaola-gitea-workflow-claim.js` reaches via `classifier.classifyIssue`) AND a `cmdClassify` that
// WRITES it (the CLI site a subprocess reaches). The two hold separate copies of the same block, so
// a fix applied to one and missed on the other ships silently — `validate-script-sync.js` compares
// the forge-renamed classifier to nothing, and the export superset guard sees only key names. Both
// sites are driven here.
//
// WHAT IS PINNED — the RESULT, not a wording: each arm's `reasoning` names its OWN artifact by the
// token an operator would search for, and the two arms do not emit the same sentence. Naming both
// artifacts on both arms passes the contains-checks and fails the differ-check — that is the
// near-miss this exists to catch. BOTH ARMS DRIVE THE SAME ISSUE NUMBER deliberately: the
// undiscriminating sentence interpolates the number, so two arms on two numbers would differ
// already and the differ-check would be green against the defect.
{
  const CLAIM_LABEL_TOKEN = forge.CLAIM_LABEL;   // 'workflow:in-progress'
  const CLAIM_NOTE_TOKEN = 'kw:claim';           // the marker the comment probe greps for
  const ARM_NUM = 520;
  const freshComment = [{ body: '<!-- kw:claim project=issue-520 sess=abc -->', updated_at: new Date().toISOString() }];
  const project = { owner: 'kw-fixture', name: 'repo', full_name: 'kw-fixture/repo' };
  const findings = [];

  // ---- site 1: the in-process classifyIssue helper (what the claim port calls) ----
  const inProcessArm = (labels, comments) => {
    const root = tempRoot('kw-gt-claim-artifact-');
    try {
      return withForge({
        viewIssue(issueNum) { return { number: issueNum, issue_iid: issueNum, state: 'open', labels, body: '' }; },
        discoverProject() { return project; },
        listIssueComments() { return comments; }
      }, () => classifier.classifyIssue(ARM_NUM, root));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  };

  const helperLabelArm = inProcessArm([CLAIM_LABEL_TOKEN], []);
  const helperNoteArm = inProcessArm([], freshComment);
  // Liveness: an arm that stopped reaching the blocked emitter reds HERE rather than passing
  // vacuously through the message checks behind it.
  assert.strictEqual(helperLabelArm.verdict, 'blocked', 'classifyIssue label arm must still block');
  assert.strictEqual(helperNoteArm.verdict, 'blocked', 'classifyIssue comment arm must still block');

  if (!String(helperLabelArm.reasoning || '').includes(CLAIM_LABEL_TOKEN)) {
    findings.push('classifyIssue (in-process site): a label-held claim must NAME the '
      + CLAIM_LABEL_TOKEN + ' label — it never expires, so the operator has to remove it by hand; got: '
      + JSON.stringify(helperLabelArm.reasoning));
  }
  if (!String(helperNoteArm.reasoning || '').includes(CLAIM_NOTE_TOKEN)) {
    findings.push('classifyIssue (in-process site): a comment-held claim must NAME the '
      + CLAIM_NOTE_TOKEN + ' comment — it expires 24h after updated_at, and that is the whole '
      + 'difference from the label; got: ' + JSON.stringify(helperNoteArm.reasoning));
  }
  if (String(helperLabelArm.reasoning || '') === String(helperNoteArm.reasoning || '')) {
    findings.push('classifyIssue (in-process site): the label arm and the comment arm must not emit '
      + 'the SAME sentence; both got: ' + JSON.stringify(helperLabelArm.reasoning));
  }

  // ---- site 2: the cmdClassify CLI emitter (a separate copy of the same block) ----
  // ONLINE, so KAOLA_WORKFLOW_OFFLINE stays unset and tea is routed at a per-arm mock written
  // outside the fixture repo.
  const cliArm = (labels, comments) => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-claim-artifact-cli-'));
    const root = path.join(outer, 'repo');
    fs.mkdirSync(root, { recursive: true });
    try {
      // spawn-class: environment
      spawnSync('git', ['init', '-b', 'main'], { cwd: root, encoding: 'utf8' });
      const mock = path.join(outer, 'tea-mock.js');
      fs.writeFileSync(mock, [
        'const a = process.argv.slice(2);',
        'const labels = ' + JSON.stringify(labels) + ';',
        'const comments = ' + JSON.stringify(comments) + ';',
        "if (a[0] === 'repo' && a[1] === 'view') {",
        "  process.stdout.write(JSON.stringify({ full_name: 'kw-fixture/repo', name: 'repo', owner: { login: 'kw-fixture' } }));",
        "} else if (a[0] === 'issues' && a[1] === 'view') {",
        "  process.stdout.write(JSON.stringify({ number: parseInt(a[2], 10), state: 'open', labels: labels, body: '' }));",
        "} else if (a[0] === 'api') {",
        '  process.stdout.write(JSON.stringify(comments));',
        '} else {',
        "  process.stdout.write('');",
        '}',
      ].join('\n'));
      const env = Object.assign({}, process.env, {
        KAOLA_TEA_MOCK_SCRIPT: mock,
        KAOLA_CLASSIFIER_BACKOFF_MS: '0'
      });
      delete env.KAOLA_WORKFLOW_OFFLINE;
      // spawn-class: cli-contract
      const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', String(ARM_NUM)],
        { cwd: root, encoding: 'utf8', env });
      let json = null;
      try { json = JSON.parse(String(result.stdout).trim()); } catch (_) {}
      return { result, json };
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  };

  const cliLabelArm = cliArm([CLAIM_LABEL_TOKEN], []);
  const cliNoteArm = cliArm([], freshComment);
  assert(cliLabelArm.json && cliLabelArm.json.verdict === 'blocked',
    'cmdClassify label arm must still block; got ' + JSON.stringify(cliLabelArm.json)
    + '\nstderr: ' + cliLabelArm.result.stderr);
  assert(cliNoteArm.json && cliNoteArm.json.verdict === 'blocked',
    'cmdClassify comment arm must still block; got ' + JSON.stringify(cliNoteArm.json)
    + '\nstderr: ' + cliNoteArm.result.stderr);

  if (!String(cliNoteArm.json.reasoning || '').includes(CLAIM_NOTE_TOKEN)) {
    findings.push('cmdClassify (CLI site): a comment-held claim must NAME the ' + CLAIM_NOTE_TOKEN
      + ' comment; got: ' + JSON.stringify(cliNoteArm.json.reasoning));
  }
  if (!String(cliLabelArm.json.reasoning || '').includes(CLAIM_LABEL_TOKEN)) {
    findings.push('cmdClassify (CLI site): a label-held claim must NAME the ' + CLAIM_LABEL_TOKEN
      + ' label; got: ' + JSON.stringify(cliLabelArm.json.reasoning));
  }
  if (String(cliLabelArm.json.reasoning || '') === String(cliNoteArm.json.reasoning || '')) {
    findings.push('cmdClassify (CLI site): the label arm and the comment arm must not emit the SAME '
      + 'sentence; both got: ' + JSON.stringify(cliLabelArm.json.reasoning));
  }

  // Reported together: node's assert throws on the first failure, and a per-site fix that lands on
  // one emitter and misses the other must be visible in ONE run, not discovered a run at a time.
  assert.deepStrictEqual(findings, [],
    'the blocked reasoning must name WHICH artifact holds the claim, at BOTH emitters:\n  - '
    + findings.join('\n  - '));
}

// ADR 0018 §5 named accepted loss: the offline dependency hint (classifier.js synthesizing
// depends-on:#N by parsing 'blocked by #N' out of a local roadmap source's next_step) is retired
// with the roadmap source it read. "Task A: Gap 2 — OFFLINE branch with depends-on in roadmap"
// pinned exactly that inference and is deleted with it.

// Issue #175: OFFLINE + no roadmap + no active folder → target_unverified
{
  const tempHome = tempRoot('kw-gt-offline-nofile-');
  const root = tempRoot('kw-gt-offline-nofile-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '58'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified',
      'OFFLINE with no local evidence must return target_unverified, got: ' + out.verdict);
    assert(/no local evidence/.test(out.reasoning),
      'reasoning must mention no local evidence, got: ' + out.reasoning);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ADR 0018 §5 named accepted loss: offline claim evidence is retired with the local roadmap source
// it read — an OFFLINE classify with no active folder now correctly answers target_unverified
// regardless of a planted roadmap entry. "Issue #175: non-regression — OFFLINE with roadmap entry
// still acquires" pinned the opposite and is deleted with the mechanism it pinned.

// Issue #175: non-regression — OFFLINE with active folder for the target routes as 'owned' (NOT target_unverified)
{
  const tempHome = tempRoot('kw-gt-offline-owned-routes-');
  const root = tempRoot('kw-gt-offline-owned-routes-root-');
  try {
    writeState(root, 'issue-201', 201);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '201'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'owned',
      'active folder for target must produce owned (NOT target_unverified), got: ' + out.verdict);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: OFFLINE with an UNRELATED active folder must still produce target_unverified
{
  const tempHome = tempRoot('kw-gt-offline-unrelated-active-');
  const root = tempRoot('kw-gt-offline-unrelated-active-root-');
  try {
    writeState(root, 'issue-300', 300);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '301'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified',
      'unrelated active folder must NOT mask target_unverified for requested target, got: ' + out.verdict);
    assert(out.reasoning && out.reasoning.includes('#301'),
      'reasoning must reference requested target #301, got: ' + out.reasoning);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: end-to-end startup with no evidence → target_unverified (covers classifyIssue production path)
{
  const tempHome = tempRoot('kw-gt-offline-startup-unverified-');
  const root = tempRoot('kw-gt-offline-startup-unverified-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '302'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0, 'offline unverified startup ANSWERS at exit 0');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified');
    assert.strictEqual(out.claim, 'none');
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-302')),
      'offline unverified startup must not create an active folder');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ADR 0018 §5 named accepted loss: the offline dependency hint is retired with the local roadmap
// source it parsed 'blocked by #N' out of — the offline-blocked-startup non-regression this pinned
// is deleted with it (an OFFLINE startup with no active folder now answers target_unverified).

// Fix 2b: classifyIssue remote-claim guard via label
// classifyIssue with a reachable, unclaimed open issue and no roadmap entry → green (no block).
{
  const root = tempRoot('kw-gt-ciy-label-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    withForge({
      viewIssue(iid) { return { issue_iid: iid, number: iid, state: 'open', labels: [], body: '' }; }
    }, () => {
      const result = classifier.classifyIssue(92, root);
      // Online mode with open reachable issue and no roadmap entry → green (no block)
      assert.strictEqual(result.verdict, 'green', 'classifyIssue with reachable open issue and no roadmap entry should be green');
    });
    // Pure label check
    assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]), 'CLAIM_LABEL must trigger issueHasWorkflowInProgressLabel');
    assert(!classifier.issueHasWorkflowInProgressLabel([]), 'empty labels must not trigger issueHasWorkflowInProgressLabel');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #99: startup/pick-next explicit-target parity
{
  // startup without --target-issue must return no_target even when one active folder exists
  const root = tempRoot('kw-gt-startup-notarget-');
  try {
    writeState(root, 'sole-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 0, 'startup without --target-issue answers usage at exit 0');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'no_target', 'startup without --target-issue must return no_target');
    assert.strictEqual(out.claim, 'none');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // pick-next without --target-issue must return no_target
  const root = tempRoot('kw-gt-picknext-notarget-');
  try {
    writeState(root, 'sole-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'pick-next'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 0, 'pick-next without --target-issue answers usage at exit 0');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'no_target', 'pick-next without --target-issue must return no_target');
    assert.strictEqual(out.claim, 'none');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // explicit-target startup with owned folder must include top-level worktree_path
  const root = tempRoot('kw-gt-startup-worktree-');
  try {
    writeState(root, 'issue-99', 99, 'worktree_path: /tmp/kw-wt-99');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '99'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 0, 'explicit-target startup must exit 0');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'owned');
    assert.strictEqual(out.claim, 'owned');
    assert.ok(typeof out.worktree_path === 'string', 'explicit owned startup must emit top-level worktree_path');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #100: no-nesting — startup from a linked worktree must produce a path in the canonical
// hidden-local container (<main-root>/.kw/worktrees/), never nested under the linked worktree.
// Updated for #264: worktrees now live at <root>/.kw/worktrees/<project>, not the sibling scheme.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-sibling-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw'; // legacy path — kept for cleanup only
  const binDir = path.join(tmp, 'bin');
  writeTeaShimOpen(binDir);
  try {
    initGitRepo(tmp);
    // Simulate a linked worktree by running startup from within a hypothetical linked path.
    // We do this by creating a hidden-local dir that shares the same git common-dir.
    const linkedWt = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-5');
    fs.mkdirSync(linkedWt, { recursive: true });
    // Create a worktree so git knows about it
    G.git(tmp, ['worktree', 'add', '--detach', linkedWt], { encoding: 'utf8' });

    // Run startup from the linked worktree cwd — should produce hidden-local, not nested path
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '6'], {
      cwd: linkedWt, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1', ...teaMockEnv(binDir), PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'hidden-local startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    const expectedHiddenLocal = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-6');
    assert.strictEqual(out.worktree_path, expectedHiddenLocal,
      'startup from linked worktree must produce hidden-local path, not nested: got ' + out.worktree_path);
    assert.ok(!out.worktree_path.includes('issue-5/.kw'),
      'worktree path must not contain issue-5/.kw nesting: ' + out.worktree_path);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// Issue #149 Test 1: KAOLA_WORKTREE_NATIVE default-OFF — worktree_path must be empty when NATIVE=0
// Also asserts in-place branch created+checked-out (workflow/gitea-issue-8) + tree clean (#260).
{
  const root = tempRoot('kw-gt-native-off-');
  const binDir = path.join(root, 'bin');
  writeTeaShimOpen(binDir);
  try {
    initGitRepo(root);
    // Commit a .gitignore so the bin/ shim + kaola-workflow/ folder don't dirty the tree
    fs.writeFileSync(path.join(root, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(root, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(root, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '8'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0',
        ...teaMockEnv(binDir), PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'NATIVE=0 startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.worktree_path, '', 'NATIVE=0 must produce empty worktree_path, got: ' + out.worktree_path);
    // #260: in-place branch must be created and checked out
    const headBranch = G.git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(headBranch, 'workflow/gitea-issue-8', 'NATIVE=0 must checkout in-place branch workflow/gitea-issue-8, got: ' + headBranch);
    const treeStatus = G.git(root, ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(treeStatus, '', 'tree must be clean after in-place claim (all untracked entries gitignored), got: ' + JSON.stringify(treeStatus));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #149 Test 2: OFFLINE wins over NATIVE — worktree_path must be empty when OFFLINE=1 even if NATIVE=1
{
  const root = tempRoot('kw-gt-offline-wins-');
  try {
    initGitRepo(root);
    // Provide roadmap evidence so the classifier can acquire (not target_unverified) — required since #175
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-9.md'),
      'issue: #9\ntitle: offline-wins-fixture\nstatus: open\nworkflow_project: issue-9\nnext_step: ready\n');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '9'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1' }
    });
    assert.strictEqual(result.status, 0, 'OFFLINE=1 startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.worktree_path, '', 'OFFLINE=1 must produce empty worktree_path even with NATIVE=1, got: ' + out.worktree_path);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #1094 (V1): the claim records the foreign sink noun as Gitea's canonical `pr` — from the flag
// and from KAOLA_SINK — so watch-pr and archive see the one noun they recognize; merge is untouched.
assert.strictEqual(claim.canonicalSink('mr'), 'pr');
assert.strictEqual(claim.canonicalSink('pr'), 'pr');
assert.strictEqual(claim.canonicalSink('merge'), 'merge');
for (const [n, argv, env] of [[611, ['--sink', 'mr'], {}], [612, [], { KAOLA_SINK: 'mr' }]]) {
  const root = tempRoot('kw-gt-sink-noun-');
  const binDir = path.join(tempRoot('kw-gt-sink-noun-bin-'), 'bin'); // outside the repo: keeps the tree clean
  writeTeaShimOpen(binDir);
  try {
    initGitRepo(root);
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', String(n)].concat(argv), {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0', ...env,
        ...teaMockEnv(binDir), PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'V1 startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').pop());
    const state = fs.readFileSync(path.join(root, 'kaola-workflow', out.project, 'workflow-state.md'), 'utf8');
    assert(/^sink: pr$/m.test(state), '#1094 V1: a foreign `mr` sink must be recorded as `pr`, got:\n' + state);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(binDir), { recursive: true, force: true });
  }
}

// #725/#770: the Issue #101 KAOLA_PATH=fast startup test is retired — first (#725) because fast
// was never an installed path (refused path_not_installed), and now (#770) because the path
// SELECTOR itself is retired: a stale KAOLA_PATH=fast is silently ignored and the claim ACQUIRES
// via adaptive (never a fast-state startup, never a refusal).


function testStaleWorktreeCheck() {
  function setupRepo() {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-gt-')));
    initGitRepo(tmp);
    return tmp;
  }

  function addWorktree(repoRoot, branch, wtPath) {
    const r = G.git(repoRoot, ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: closed worktree -> stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_worktrees.some(x => x.issue_number === 200),
        'expected issue 200 in stale_worktrees, got: ' + JSON.stringify(result));
      assert(!result.stale_branches.some(x => x.issue_number === 200),
        'issue 200 should not be in stale_branches');
      assert(result.count >= 1, 'count should be >= 1');
    } finally {
      G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 2: archived-open worktree -> stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitea-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_worktrees.some(x => x.issue_number === 300),
        'expected issue 300 in stale_worktrees (archived), got: ' + JSON.stringify(result));
    } finally {
      G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 3: open + active worktree -> not stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-100');
    addWorktree(tmp, 'workflow/gitea-issue-100', wtPath);
    writeState(tmp, 'issue-100', 100);
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.active_worktrees.some(x => x.issue_number === 100),
        'expected issue 100 in active_worktrees, got: ' + JSON.stringify(result));
      assert(!result.stale_worktrees.some(x => x.issue_number === 100),
        'issue 100 should not be in stale_worktrees');
    } finally {
      G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 4: deleted-dir worktree -> state:'missing'
  // IMPORTANT: use fs.rmSync NOT git worktree remove -- registration must survive
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
    // Delete dir without removing git worktree metadata
    fs.rmSync(wtPath, { recursive: true, force: true });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_worktrees.find(x => x.issue_number === 200);
      assert(entry, 'expected issue 200 in stale_worktrees after dir deletion, got: ' + JSON.stringify(result));
      assert.strictEqual(entry.state, 'missing', 'expected state:missing, got: ' + entry.state);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 5: loose branch (no worktree) -> stale_branches
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    G.git(tmp, ['branch', 'workflow/gitea-issue-400'], { encoding: 'utf8' });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_branches.some(x => x.issue_number === 400),
        'expected issue 400 in stale_branches, got: ' + JSON.stringify(result));
      assert(!result.stale_worktrees.some(x => x.issue_number === 400),
        'issue 400 should not be in stale_worktrees');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 6: OFFLINE + archived worktree -> stale (archive-only path, no API call)
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitea-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      const result = spawnSync(process.execPath, [claimScript, 'stale-worktree-check'], {
        cwd: tmp, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(result.status, 0, result.stderr || result.stdout);
      const out = JSON.parse(result.stdout.trim());
      assert(out.stale_worktrees.some(x => x.issue_number === 300),
        'expected issue 300 stale in OFFLINE+archive mode, got: ' + JSON.stringify(out));
    } finally {
      G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  console.log('testStaleWorktreeCheck: PASSED');
}

const giteaPluginRoot = path.resolve(__dirname, '..');
const installProfilesScript = path.join(giteaPluginRoot, 'scripts', 'install-codex-agent-profiles.js');
// #1101: the entry point keeps its name (install-all.sh, the preflight's autofix, and older plugin
// caches invoke it) but installs no role profile and registers none. It retires what earlier
// releases installed, only on ownership proof, and installs the non-role Codex content: the global
// compact hook, its version-less hook home, and the global contract carrier.
//
// The frozen pre-#1101 Codex scope — seven role profiles, their ownership record, and the managed
// `# BEGIN/END kaola-workflow agents` registration block — exactly as the last role-shipping release
// installed it (scripts/fixtures/issue-1101/PROVENANCE.md). No suite reads git history.
const RELEASED_CODEX_SCOPE_FIXTURE = path.join(giteaPluginRoot, '..', '..', 'scripts', 'fixtures', 'issue-1101',
  'v12.2.6-46fbe12d', 'home', 'proj', 'dot-codex');
const KW_AGENTS_BEGIN = '# BEGIN kaola-workflow agents';

function releasedCodexBlock() {
  return fs.readFileSync(path.join(RELEASED_CODEX_SCOPE_FIXTURE, 'config.toml'), 'utf8');
}

// Plant that release's install into <scopeRoot>/.codex, after whatever config.toml the scope holds.
function plantReleasedCodexScope(scopeRoot) {
  const codexDir = path.join(scopeRoot, '.codex');
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');
  const sourceDir = path.join(RELEASED_CODEX_SCOPE_FIXTURE, 'agents', 'kaola-workflow');
  fs.mkdirSync(agentsDir, { recursive: true });
  const profiles = [];
  for (const name of fs.readdirSync(sourceDir).sort()) {
    const dest = path.join(agentsDir, name.startsWith('dot-') ? '.' + name.slice(4) : name);
    fs.copyFileSync(path.join(sourceDir, name), dest);
    if (dest.endsWith('.toml')) profiles.push(dest);
  }
  assert.ok(profiles.length > 0, 'the frozen pre-#1101 Codex fixture must carry role profiles');
  const configPath = path.join(codexDir, 'config.toml');
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  fs.writeFileSync(configPath, (existing ? existing.replace(/\s*$/, '\n\n') : '') + releasedCodexBlock());
  return { codexDir, agentsDir, configPath, profiles, record: path.join(agentsDir, '.kaola-managed-profiles.json') };
}

// The installer's retirement report lines — one place, so a wording change is one edit.
const RETIRED_REMOVED = file => 'Removed retired Kaola-Workflow agent: ' + file;
const RETIRED_RECORD_REMOVED = file => 'Removed retired Kaola-Workflow agent record: ' + file;
const RETIRED_REGISTRATIONS_REMOVED = file => 'Removed retired Kaola-Workflow agent registrations: ' + file;
const RETIRED_PRESERVED = (reason, file) => 'Preserved retired Kaola-Workflow agent (' + reason + '): ' + file;
function stdoutHasLine(stdout, line) {
  return String(stdout || '').split(/\r?\n/).includes(line);
}

function runInstallProfiles(target, extraEnv, extraArgs) {
  const args = (extraArgs && extraArgs.length) ? extraArgs : [];
  const result = spawnSync(process.execPath, [installProfilesScript, target, ...args], {
    cwd: giteaPluginRoot,
    encoding: 'utf8',
    env: extraEnv ? Object.assign({}, process.env, extraEnv) : process.env
  });
  if (result.error) throw result.error;
  assert.ok(result.status === 0, 'install profiles failed: ' + result.stderr);
  return result;
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

// #325/#525: updateHooks() hardening on the gitea installer copy — R1 (metacharacter pluginRoot),
// R2 (output is { hooks } ONLY — no $schema; Codex's strict parser rejects unknown top-level keys, and
// an existing $schema self-heals), R3 (sweep ALL events). Helpers are exported (require.main guard).
function testUpdateHooksHardening325() {
  const { buildManagedHooks, mergeHooks } = require(installProfilesScript);
  const tmplText = JSON.stringify({
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    hooks: { SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'node "__KW_PLUGIN_ROOT__/scripts/x.js"', timeout: 5 }], id: 'kaola-workflow:compact' }] },
  });
  // R1
  const built = buildManagedHooks(tmplText, 'C:\\plug"in');
  const cmd = built.hooks.SessionStart[0].hooks[0].command;
  assert.strictEqual(cmd, 'node "C:\\plug"in/scripts/x.js"', '#325 R1: pluginRoot substituted verbatim');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(built)), '#325 R1: built hooks re-serialize to valid JSON');
  // R2 (#525): output is { hooks } ONLY — Codex's parser rejects unknown top-level keys; an existing $schema self-heals.
  const freshMerge = mergeHooks({ hooks: {} }, built);
  assert.strictEqual(freshMerge.$schema, undefined, '#525: fresh-install merge carries NO $schema');
  assert.strictEqual(Object.keys(freshMerge).join(','), 'hooks', '#525: merged output has only the hooks key');
  assert.strictEqual(mergeHooks({ $schema: 'user-schema', hooks: {} }, built).$schema, undefined, '#525: an existing $schema is dropped (self-heal), not carried');
  // R3
  const shrunk = { hooks: { SessionStart: built.hooks.SessionStart } };
  const swept = mergeHooks({ hooks: { PostToolUse: [{ id: 'kaola-workflow:retired-orphan' }, { id: 'user:keep' }] } }, shrunk);
  assert.ok(!(swept.hooks.PostToolUse || []).some(e => e.id && e.id.startsWith('kaola-workflow:')), '#325 R3: orphan kaola-workflow: entry swept');
  assert.ok((swept.hooks.PostToolUse || []).some(e => e.id === 'user:keep'), '#325 R3: user entry preserved');
  // R2 black-box — #447: hooks land in temp HOME/.codex (global), not in the project dir
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-325-schema-'));
  const tempHome325 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-325-home-'));
  try {
    runInstallProfiles(freshDir, { HOME: tempHome325, USERPROFILE: tempHome325 });
    // #447 AC1: hooks land in the global ~/.codex, NOT in the project dir
    const globalHooksPath = path.join(tempHome325, '.codex', 'hooks.json');
    const projectHooksPath = path.join(freshDir, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(globalHooksPath), '#447 AC1: hooks.json must be written to global HOME/.codex, not found at: ' + globalHooksPath);
    assert.ok(!fs.existsSync(projectHooksPath), '#447 AC5: no hooks.json must be written to project .codex, found at: ' + projectHooksPath);
    const installed = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
    assert.ok(installed.$schema === undefined && Object.keys(installed).join(',') === 'hooks', '#525 (black-box): fresh-install hooks.json has only the hooks key, no $schema');
  } finally {
    fs.rmSync(freshDir, { recursive: true, force: true });
    fs.rmSync(tempHome325, { recursive: true, force: true });
  }
  console.log('testUpdateHooksHardening325 (gitea): PASSED');
}

// #409: stable-home regression — install FROM a throwaway copy of the gitea plugin tree,
// DELETE the copy, then assert every hooks.json command still resolves to an existing
// executable in a version-less home (no install-source / version-pinned path), and that
// reinstall sweeps a planted stale script. The gitea template references the generated static
// Codex recovery prompt, which remains readable after the install source is deleted.
function test409StableHomeSurvivesDirDeletion() {
  const recursiveCopyDir = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) recursiveCopyDir(s, d);
      else if (entry.isFile()) { fs.copyFileSync(s, d); fs.chmodSync(d, fs.statSync(s).mode); }
    }
  };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-409-stable-home-'));
  // #447: hooks + stable home go to global HOME/.codex; use a temp HOME so the test
  // never writes to the real ~/.codex.
  const tempHome409 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-409-home-'));
  try {
    const installSrc = path.join(work, 'ephemeral-src');
    recursiveCopyDir(giteaPluginRoot, installSrc);
    const srcInstaller = path.join(installSrc, 'scripts', 'install-codex-agent-profiles.js');
    const target = path.join(work, 'target');
    fs.mkdirSync(target, { recursive: true });

    const homeEnv409 = { HOME: tempHome409, USERPROFILE: tempHome409 };
    const first = spawnSync(process.execPath, [srcInstaller, target], {
      cwd: installSrc, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (first.error) throw first.error;
    assert.ok(first.status === 0, '#409 gt: install from ephemeral source must succeed: ' + first.stderr);

    fs.rmSync(installSrc, { recursive: true, force: true });

    // #447 AC1: hooks land in global HOME/.codex, not in the project dir
    const globalHooks409Path = path.join(tempHome409, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(globalHooks409Path), '#447/#409 gt: hooks.json must be in global HOME/.codex after install');
    assert.ok(!fs.existsSync(path.join(target, '.codex', 'hooks.json')), '#447 AC5 gt: no hooks.json must be in project .codex');

    const hooks = JSON.parse(fs.readFileSync(globalHooks409Path, 'utf8'));
    let commandCount = 0;
    for (const event of Object.keys(hooks.hooks || {})) {
      for (const entry of (hooks.hooks[event] || [])) {
        for (const h of (entry.hooks || [])) {
          if (typeof h.command !== 'string') continue;
          commandCount++;
          const m = h.command.match(/"([^"]+)"/);
          assert.ok(m, '#409 gt: hook command must carry a quoted script path: ' + h.command);
          const scriptPath = m[1];
          assert.ok(fs.existsSync(scriptPath), '#409 gt GREEN: hook script must exist after source deletion: ' + scriptPath);
          assert.ok((fs.statSync(scriptPath).mode & 0o100) !== 0, '#409 gt: hook script must be executable: ' + scriptPath);
          assert.ok(!scriptPath.includes('ephemeral-src'), '#409 gt: must NOT point at the deleted source: ' + scriptPath);
          assert.ok(!/\/\d+\.\d+\.\d+\//.test(scriptPath), '#409 gt: hook path must NOT be version-pinned: ' + scriptPath);
        }
      }
    }
    assert.ok(commandCount >= 1, '#409 gt: expected the surviving managed hook command, saw ' + commandCount);

    // #447: stable home also lives in global HOME/.codex/kaola-workflow
    const globalStableHome409 = path.join(tempHome409, '.codex', 'kaola-workflow');
    const planted = path.join(globalStableHome409, 'hooks', 'kaola-workflow-stale-orphan.sh');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    fs.writeFileSync(planted, '#!/usr/bin/env bash\nexit 0\n');
    const second = spawnSync(process.execPath, [installProfilesScript, target], {
      cwd: giteaPluginRoot, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (second.error) throw second.error;
    assert.ok(second.status === 0, '#409 gt: reinstall must succeed: ' + second.stderr);
    assert.ok(!fs.existsSync(planted), '#409 gt: reinstall must sweep the stale planted script');

    console.log('test409StableHomeSurvivesDirDeletion (gitea): PASSED');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(tempHome409, { recursive: true, force: true });
  }
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-install-existing-'));
  // #447: use a temp HOME so hooks are never written to the real ~/.codex
  const tempHomeFresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-home-fresh-'));
  const tempHomeExisting = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-home-existing-'));
  try {
    const freshHomeEnv = { HOME: tempHomeFresh, USERPROFILE: tempHomeFresh };
    const existingHomeEnv = { HOME: tempHomeExisting, USERPROFILE: tempHomeExisting };
    const freshResult = runInstallProfiles(fresh, freshHomeEnv);
    // #775/#1101: the installer writes no [features]/multi_agent flag, and — Kaola defining no
    // roles — no managed `# BEGIN kaola-workflow agents` block, no [agents.*] entry, no
    // agents/kaola-workflow/ profile, and no ownership record: a clean project scope gets nothing.
    assert.ok(!fs.existsSync(path.join(fresh, '.codex')),
      '#1101: a fresh install must write nothing into the project .codex (no config, profiles, or record)');

    // #284/#372/#447: hooks.json assertions — hooks are GLOBAL (in temp HOME/.codex)
    // #447 AC1: hooks land in the global HOME/.codex, NOT in the project dir
    const freshHooksPath = path.join(tempHomeFresh, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(freshHooksPath), '#447 AC1: fresh install must create HOME/.codex/hooks.json (global), not found at: ' + freshHooksPath);
    assert.ok(!fs.existsSync(path.join(fresh, '.codex', 'hooks.json')), '#447 AC5: no hooks.json must be written to project .codex');
    const freshHooks = JSON.parse(fs.readFileSync(freshHooksPath, 'utf8'));
    const requiredEvents = ['SessionStart'];
    for (const event of requiredEvents) {
      const entries = freshHooks.hooks[event];
      assert.ok(Array.isArray(entries) && entries.length > 0, `hooks.json must have entries for ${event}`);
      const kwEntry = entries.find(e => e.id && e.id.startsWith('kaola-workflow:'));
      assert.ok(kwEntry, `hooks.json ${event} must contain an entry whose id starts with kaola-workflow:`);
    }
    const sessionStartEntry = freshHooks.hooks['SessionStart'].find(e => e.id && e.id.startsWith('kaola-workflow:'));
    const compactCmd = sessionStartEntry && sessionStartEntry.hooks && sessionStartEntry.hooks[0] && sessionStartEntry.hooks[0].command;
    assert.ok(compactCmd && /\bcat\b/.test(compactCmd)
      && compactCmd.includes('kaola-workflow-codex-compact-recovery.md')
      && !/\bnode\b|\.js\b/.test(compactCmd),
      'SessionStart compact command must cat the generated prompt without JS, got: ' + compactCmd);
    const freshHooksText = fs.readFileSync(freshHooksPath, 'utf8');
    assert.ok(!freshHooksText.includes('__KW_PLUGIN_ROOT__'),
      'installed hooks.json must not contain literal __KW_PLUGIN_ROOT__ token');
    assert.ok(freshResult.stdout.includes('/hooks'),
      'install output must include /hooks trust line, got: ' + freshResult.stdout);

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    const existingBefore = [
      '[features]', 'goals = true', '', '[projects."/tmp/example"]', 'trust_level = "trusted"', ''
    ].join('\n');
    fs.writeFileSync(existingConfigPath, existingBefore);

    runInstallProfiles(existing, existingHomeEnv);
    runInstallProfiles(existing, existingHomeEnv);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert.strictEqual(
      countOccurrences(updated, /^\[features\]$/gm),
      1,
      'existing config must contain exactly one [features] table'
    );
    assert.ok(updated.includes('goals = true'), 'existing [features] content must be preserved');
    // #1101: idempotent and hands-off — two installs leave the user's config byte-identical (no
    // managed block, no [agents.*] entry) and create no agents/ directory.
    assert.strictEqual(updated, existingBefore, '#1101: two installs must leave an existing config.toml byte-identical');
    assert.ok(!fs.existsSync(path.join(existingCodexDir, 'agents')), '#1101: the installer must create no agents/ directory');

    // #284/#447: idempotency — hooks land in global HOME/.codex; each id appears exactly once
    const existingHooksPath = path.join(tempHomeExisting, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(existingHooksPath), '#447: global HOME/.codex/hooks.json must exist after install');
    assert.ok(!fs.existsSync(path.join(existing, '.codex', 'hooks.json')), '#447 AC5: no hooks.json in project .codex after double-run');
    const existingHooks = JSON.parse(fs.readFileSync(existingHooksPath, 'utf8'));
    // #376: per-ID no-duplicate check (an event MAY carry >1 distinct managed id, e.g. PreToolUse
    // holds both pre-commit-guard and the write-lane hook); each id must appear exactly once.
    const idCounts = {};
    for (const event of Object.keys(existingHooks.hooks || {})) {
      for (const e of existingHooks.hooks[event]) {
        if (e.id && e.id.startsWith('kaola-workflow:')) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
      }
    }
    for (const id of Object.keys(idCounts)) {
      assert.strictEqual(idCounts[id], 1,
        `idempotency: managed id ${id} must appear exactly once after 2 installs, got ${idCounts[id]}`);
    }
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
    fs.rmSync(tempHomeFresh, { recursive: true, force: true });
    fs.rmSync(tempHomeExisting, { recursive: true, force: true });
  }
}

function testStaleWorktreeCleanup() {
  function addWorktree(repoRoot, branch, wtPath) {
    const r = G.git(repoRoot, ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: dry-run — clean worktree, no --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup'], tmp, binDir);
      assert(out.dry_run === true, 'sc1: dry_run must be true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === wtPath),
        'sc1: would_remove must contain wtPath, got: ' + JSON.stringify(out.would_remove));
      assert(Array.isArray(out.would_delete_branch) && out.would_delete_branch.includes('workflow/gitea-issue-200'),
        'sc1: would_delete_branch must contain workflow/gitea-issue-200, got: ' + JSON.stringify(out.would_delete_branch));
      assert(fs.existsSync(wtPath), 'sc1: worktree dir must still exist after dry-run');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: execute-clean — clean worktree + --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out.dry_run === false, 'sc2: dry_run must be false, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(Array.isArray(out.deleted_branch) && out.deleted_branch.includes('workflow/gitea-issue-200'),
        'sc2: deleted_branch must contain workflow/gitea-issue-200, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc2: worktree dir must be removed after execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2b (#1097 review round): a LIVE sink's integration W must survive the sweep while
  // its sink receipt is resumable. The stale trigger is the CLOSED issue — the exact condition
  // that makes readActiveFolders drop the folder on its default path, so the active-set guard
  // protects nothing around a sink run — and the guard is the sink's own resumability record
  // (steps not all done). All-done (a completed sink's leftover) sweeps exactly as before.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2b-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      // The integration W lives INSIDE the repo at <root>/.kw/integrate/<project> (the arm scans
      // that path), not under the `<tmp>.kw` sibling convention the lane arms use.
      const wPath = path.join(tmp, '.kw', 'integrate', 'issue-400');
      fs.mkdirSync(path.dirname(wPath), { recursive: true });
      const rW = G.git(tmp, ['worktree', 'add', '--detach', '--', wPath, 'HEAD'], { encoding: 'utf8' });
      assert.strictEqual(rW.status, 0, 'sc2b: worktree add failed: ' + rW.stderr);
      const receiptPath = path.join(tmp, 'kaola-workflow', 'issue-400', '.cache', 'sink-receipt.json');
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      const writeReceipt = (pushMain, closureStep) => fs.writeFileSync(receiptPath, JSON.stringify({
        project: 'issue-400',
        steps: { preflight: 'done', push_upstream: 'done', merge: 'done', finalize: 'done',
          stash_restore: 'done', archive_commit: 'done', push_main: pushMain, closure: closureStep }
      }, null, 2) + '\n');
      writeReceipt('pending', 'pending');
      const out1 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out1.dry_run === false, 'sc2b: dry_run must be false, got: ' + JSON.stringify(out1));
      assert(fs.existsSync(wPath),
        'sc2b: a resumable sink receipt (steps not all done) must protect the sink\'s W from --execute — it is the publish candidate a resumed sink rebuilds');
      assert(!Array.isArray(out1.removed) || !out1.removed.some(p => p === wPath),
        'sc2b: removed must NOT contain the live sink\'s W, got: ' + JSON.stringify(out1.removed));
      writeReceipt('done', 'done');
      const out2 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(!fs.existsSync(wPath),
        'sc2b: a completed sink\'s (all steps done) leftover W must sweep exactly as before — the guard is receipt-driven, never a blanket exemption');
      assert(Array.isArray(out2.removed) && out2.removed.some(p => p === wPath),
        'sc2b: removed must contain the completed sink\'s W, got: ' + JSON.stringify(out2.removed));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2c (#1100): the LANE arm carries the same sink resumability pin. The lane worktree
  // (`<tmp>.kw/issue-<N>`, registered on a workflow/* branch) classifies on the SAME
  // (closed || archived) && !active rule as the integration arm, and readActiveFolders drops a
  // CLOSED issue's folder on its default path — so a closed issue alone would sweep the run's own
  // lane worktree while the run still owns it. The pin is the same sink-receipt.json (steps not
  // all done). All-done or absent sweeps exactly as before.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2c-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-400');
      addWorktree(tmp, 'workflow/gitea-issue-400', wtPath);
      const receiptPath = path.join(tmp, 'kaola-workflow', 'issue-400', '.cache', 'sink-receipt.json');
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      const writeReceipt = (pushMain, closureStep) => fs.writeFileSync(receiptPath, JSON.stringify({
        project: 'issue-400',
        steps: { preflight: 'done', push_upstream: 'done', merge: 'done', finalize: 'done',
          stash_restore: 'done', archive_commit: 'done', push_main: pushMain, closure: closureStep }
      }, null, 2) + '\n');
      writeReceipt('pending', 'pending');
      const out1 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out1.dry_run === false, 'sc2c: dry_run must be false, got: ' + JSON.stringify(out1));
      assert(fs.existsSync(wtPath),
        'sc2c: a resumable sink receipt (steps not all done) must protect the run\'s own LANE worktree from --execute');
      assert(!Array.isArray(out1.removed) || !out1.removed.some(p => p === wtPath),
        'sc2c: removed must NOT contain the pinned lane worktree, got: ' + JSON.stringify(out1.removed));
      assert(!Array.isArray(out1.deleted_branch) || !out1.deleted_branch.includes('workflow/gitea-issue-400'),
        'sc2c: the pinned lane worktree\'s branch must NOT be deleted either, got: ' + JSON.stringify(out1.deleted_branch));
      writeReceipt('done', 'done');
      const out2 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(!fs.existsSync(wtPath),
        'sc2c: a completed run\'s (all steps done) leftover lane worktree must sweep exactly as before — the pin is receipt-driven, never a blanket exemption');
      assert(Array.isArray(out2.removed) && out2.removed.some(p => p === wtPath),
        'sc2c: removed must contain the completed run\'s lane worktree, got: ' + JSON.stringify(out2.removed));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2e (#1102): the pin must resolve the run that OWNS the worktree. #1100 composed the
  // receipt path from `'issue-' + issueNumber`, a name the BRANCH spells; a bundle or custom-named
  // run owns its folder under another name, so both reads missed and the pin was silently inert.
  // The owner is resolved from the run records that already exist, and an unresolvable or conflicting
  // owner keeps today's behavior (unpinned) rather than guessing.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2e-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    const wtPath = path.join(kwRoot, 'bundle-400-402');
    const writeState = (projectDir, extras) => {
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'workflow-state.md'),
        ['# Kaola-Workflow State', '', '## Project', 'name: bundle-400-402', 'status: active', '']
          .concat(extras).join('\n') + '\n');
    };
    const writeReceipt = (projectDir, states) => {
      fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.cache', 'sink-receipt.json'), JSON.stringify({
        project: 'bundle-400-402',
        steps: { preflight: 'done', push_upstream: 'done', merge: 'done', finalize: 'done',
          stash_restore: 'done', archive_commit: 'done', push_main: states, closure: states }
      }, null, 2) + '\n');
    };
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      // workflow/gitea-issue-400 is the branch a bundle run of issue 400 really creates; the FOLDER
      // is bundle-400-402, so no `issue-400` folder exists anywhere.
      addWorktree(tmp, 'workflow/gitea-issue-400', wtPath);
      // The run's folder lives in the MAIN checkout, so the lane worktree stays CLEAN and the all-done
      // half below can actually be removed — otherwise `skipped_dirty` would mask the classification.
      const ownDir = path.join(tmp, 'kaola-workflow', 'bundle-400-402');
      writeState(ownDir, [
        '## Sink', 'branch: workflow/gitea-issue-400', 'issue_number: 400', 'sink: merge',
        'run_posture: worktree', 'main_root: ' + tmp, 'claim_ts: 2026-09-27T00:00:00.000Z',
        'worktree_path: ' + wtPath, 'issue_numbers: 400,402', 'bundle_id: bundle-400-402', ''
      ]);
      writeReceipt(ownDir, 'pending');
      const out1 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out1.dry_run === false, 'sc2e: dry_run must be false, got: ' + JSON.stringify(out1));
      // The classification is what the pin acts on: a DIRTY worktree survives on its own, so "still
      // exists" cannot separate a pin from a skip. `stale-worktree-check` reports the pin directly.
      const check1 = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(Array.isArray(check1.active_worktrees) && check1.active_worktrees.some(x => x.path === wtPath),
        'sc2e: the bundle run\'s lane worktree must be classified ACTIVE — the receipt lives in kaola-workflow/bundle-400-402, so a name derived as issue-400 can never find it, got: ' + JSON.stringify(check1));
      assert(!Array.isArray(check1.stale_worktrees) || !check1.stale_worktrees.some(x => x.path === wtPath),
        'sc2e: the pinned lane worktree must NOT be classified stale, got: ' + JSON.stringify(check1.stale_worktrees));
      assert(fs.existsSync(wtPath),
        'sc2e: a bundle-named run\'s mid-flight receipt must pin its lane worktree — the receipt lives in kaola-workflow/bundle-400-402, so a name derived as issue-400 can never find it');
      assert(!Array.isArray(out1.removed) || !out1.removed.some(p => p === wtPath),
        'sc2e: removed must NOT contain the bundle run\'s lane worktree, got: ' + JSON.stringify(out1.removed));
      assert(!Array.isArray(out1.deleted_branch) || !out1.deleted_branch.includes('workflow/gitea-issue-400'),
        'sc2e: the pinned lane worktree\'s branch must NOT be deleted either, got: ' + JSON.stringify(out1.deleted_branch));
      // All-done keeps today's behavior for the same custom-named run: receipt-driven, never a
      // blanket exemption.
      writeReceipt(ownDir, 'done');
      const out2 = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(!fs.existsSync(wtPath),
        'sc2e: a completed custom-named run\'s leftover lane worktree must sweep exactly as before');
      assert(Array.isArray(out2.removed) && out2.removed.some(p => p === wtPath),
        'sc2e: removed must contain the completed run\'s lane worktree, got: ' + JSON.stringify(out2.removed));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2f (#1102): IDENTITY SAFETY. `workflow/gitea-issue-<N>` is REUSED across runs of the
  // same issue, so an OLD run's leftover receipt (archived under the derived name that run really
  // used) must never pin the NEW run's worktree when the new run holds no receipt of its own.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2f-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    const wtPath = path.join(kwRoot, 'bundle-400-402');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      addWorktree(tmp, 'workflow/gitea-issue-400', wtPath);
      // The NEW run's record lives in the MAIN checkout, so the worktree stays CLEAN and the sweep
      // below is decided by the classification alone, not by `skipped_dirty`.
      const ownDir = path.join(tmp, 'kaola-workflow', 'bundle-400-402');
      fs.mkdirSync(ownDir, { recursive: true });
      fs.writeFileSync(path.join(ownDir, 'workflow-state.md'),
        ['# Kaola-Workflow State', '', '## Project', 'name: bundle-400-402', 'status: active', '',
          '## Sink', 'branch: workflow/gitea-issue-400', 'run_posture: worktree',
          'worktree_path: ' + wtPath, 'claim_ts: 2026-09-27T02:00:00.000Z', ''].join('\n') + '\n');
      const staleDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-400');
      fs.mkdirSync(path.join(staleDir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(staleDir, 'workflow-state.md'),
        ['# Kaola-Workflow State', '', '## Project', 'name: issue-400', 'status: closed', '',
          '## Sink', 'branch: workflow/gitea-issue-400', 'issue_number: 400',
          'worktree_path: ' + wtPath, 'claim_ts: 2026-09-26T00:00:00.000Z', ''].join('\n') + '\n');
      fs.writeFileSync(path.join(staleDir, '.cache', 'sink-receipt.json'), JSON.stringify({
        project: 'issue-400',
        steps: { preflight: 'done', push_upstream: 'done', merge: 'done', finalize: 'done',
          stash_restore: 'done', archive_commit: 'done', push_main: 'pending', closure: 'pending' }
      }, null, 2) + '\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(!fs.existsSync(wtPath),
        'sc2f: an OLD run\'s mid-flight receipt under archive/issue-400 must NOT pin a NEW run\'s worktree that owns bundle-400-402 and has no receipt of its own');
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2f: removed must contain the unpinned lane worktree, got: ' + JSON.stringify(out.removed));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2d (#1100): with NO sink receipt at all the closed-issue lane worktree sweeps exactly
  // as before — the pin covers a resumable sink, it is not an unknown-exemption.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2d-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(!fs.existsSync(wtPath),
        'sc2d: with no sink receipt the closed-issue lane worktree must sweep as before');
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2d: removed must contain the no-receipt lane worktree, got: ' + JSON.stringify(out.removed));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2g (#1102 repair round): identity safety in BOTH directions. The first candidate read
  // receipts from every folder sharing the resolved project name, which let an OLD run's leftover
  // receipt pin a NEW run, and it dropped the derived-name fallback, which unpinned ordinary
  // `issue-<N>` runs that #1100 protected. Every expectation here is the behavior of base 04866c50.
  {
    const mkRepo = () => {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-2g-')));
      const kwRoot = tmp + '.kw';
      const binDir = path.join(tmp, 'bin');
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-400');
      addWorktree(tmp, 'workflow/gitea-issue-400', wtPath);
      return { tmp, kwRoot, binDir, wtPath };
    };
    const cleanup2g = (fx) => {
      fs.rmSync(fx.tmp, { recursive: true, force: true });
      try { fs.rmSync(fx.kwRoot, { recursive: true, force: true }); } catch (_) {}
    };
    const state2g = (dir, name, lines) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'workflow-state.md'),
        ['# Kaola-Workflow State', '', '## Project', 'name: ' + name, 'status: active', '', '## Sink']
          .concat(lines).join('\n') + '\n');
    };
    const receipt2g = (dir, obj) => {
      fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.cache', 'sink-receipt.json'), JSON.stringify(obj));
    };
    const cls2g = (fx) => runClaimOnline(['stale-worktree-check'], fx.tmp, fx.binDir);
    const PENDING2G = { preflight: 'done', merge: 'done', push_main: 'pending', closure: 'pending' };
    const DONE2G = { preflight: 'done', merge: 'done', push_main: 'done', closure: 'done' };

    // R1 — the old same-name archived run must not pin the new run, even when the new run's state has
    // also been mirrored into the worktree (finalize Step 8a does main → worktree).
    {
      const fx = mkRepo();
      try {
        const cur = ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-27T03:00:00.000Z'];
        state2g(path.join(fx.tmp, 'kaola-workflow', 'bundle-400-402'), 'bundle-400-402', cur);
        state2g(path.join(fx.wtPath, 'kaola-workflow', 'bundle-400-402'), 'bundle-400-402', cur);
        const old = path.join(fx.tmp, 'kaola-workflow', 'archive', 'bundle-400-402');
        state2g(old, 'bundle-400-402', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-26T03:00:00.000Z']);
        receipt2g(old, { project: 'bundle-400-402', steps: PENDING2G });
        const out = cls2g(fx);
        assert(out.stale_worktrees.some(w => w.path === fx.wtPath),
          'sc2g R1: an OLD same-name archived run\'s mid-flight receipt must NOT pin the NEW run\'s worktree, got: ' + JSON.stringify(out));
      } finally { cleanup2g(fx); }
    }

    // R2 — several archives of one issue: an OLD suffixed archive holds an abandoned mid-flight
    // receipt while the CURRENT run's receipt is all-done. Only the current run counts.
    {
      const fx = mkRepo();
      try {
        const cur = path.join(fx.tmp, 'kaola-workflow', 'issue-400');
        state2g(cur, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-27T03:00:00.000Z']);
        receipt2g(cur, { project: 'issue-400', branch: 'workflow/gitea-issue-400', steps: DONE2G });
        const plain = path.join(fx.tmp, 'kaola-workflow', 'archive', 'issue-400');
        state2g(plain, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-20T03:00:00.000Z']);
        const old = path.join(fx.tmp, 'kaola-workflow', 'archive', 'issue-400.archived-2026-09-25T00-00-00-000Z');
        state2g(old, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-24T03:00:00.000Z']);
        receipt2g(old, { project: 'issue-400', branch: 'workflow/gitea-issue-400', steps: PENDING2G });
        const out = cls2g(fx);
        assert(out.stale_worktrees.some(w => w.path === fx.wtPath),
          'sc2g R2: an older suffixed archive\'s abandoned mid-flight receipt must NOT pin the current run whose own receipt is all-done, got: ' + JSON.stringify(out));
      } finally { cleanup2g(fx); }
    }

    // R3 — an ordinary issue-<N> run, mid-sink, whose recorded worktree_path no longer spells this
    // worktree. #1100 pinned it; the resolver must not unpin it.
    {
      const fx = mkRepo();
      try {
        const cur = path.join(fx.tmp, 'kaola-workflow', 'issue-400');
        state2g(cur, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: /old/location/issue-400', 'claim_ts: 2026-09-27T03:00:00.000Z']);
        receipt2g(cur, { project: 'issue-400', branch: 'workflow/gitea-issue-400', steps: PENDING2G });
        const out = cls2g(fx);
        assert(out.active_worktrees.some(w => w.path === fx.wtPath),
          'sc2g R3: a mid-sink issue-<N> run whose recorded worktree_path no longer matches must stay PINNED, got: ' + JSON.stringify(out));
      } finally { cleanup2g(fx); }
    }

    // R4 — the current run's state has no claim_ts; an older archive of the same issue carries one.
    {
      const fx = mkRepo();
      try {
        const cur = path.join(fx.tmp, 'kaola-workflow', 'issue-400');
        state2g(cur, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath]);
        receipt2g(cur, { project: 'issue-400', branch: 'workflow/gitea-issue-400', steps: PENDING2G });
        const old = path.join(fx.tmp, 'kaola-workflow', 'archive', 'issue-400');
        state2g(old, 'issue-400', ['branch: workflow/gitea-issue-400', 'worktree_path: ' + fx.wtPath, 'claim_ts: 2026-09-20T03:00:00.000Z']);
        const out = cls2g(fx);
        assert(out.active_worktrees.some(w => w.path === fx.wtPath),
          'sc2g R4: a mid-sink issue-<N> run whose state carries no claim_ts must stay PINNED, got: ' + JSON.stringify(out));
      } finally { cleanup2g(fx); }
    }
  }

  // Sub-case 3: execute-dirty-no-flag — dirty worktree + --execute (no archive/export/force)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(Array.isArray(out.skipped_dirty) && out.skipped_dirty.some(p => p === wtPath),
        'sc3: skipped_dirty must contain wtPath, got: ' + JSON.stringify(out.skipped_dirty));
      assert(!out.removed || !out.removed.some(p => p === wtPath),
        'sc3: removed must not contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(fs.existsSync(wtPath), 'sc3: worktree dir must still exist when skipped_dirty');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 4: execute-dirty-archive — dirty worktree + --execute --archive
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc4: stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc4: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc4: worktree dir must be removed after archive+execute');
      const stashResult = G.git(tmp, ['stash', 'list'], { encoding: 'utf8' });
      assert(stashResult.stdout.includes('kaola-cleanup-issue-200'),
        'sc4: stash list must contain kaola-cleanup-issue-200, got: ' + stashResult.stdout);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 5: execute-dirty-export — dirty (tracked file) + --execute --export
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc5-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      // Modify a tracked file so git diff HEAD is non-empty
      fs.writeFileSync(path.join(wtPath, 'README.md'), 'modified-for-export\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length > 0,
        'sc5: exported must have at least one entry, got: ' + JSON.stringify(out.exported));
      const patchPath = out.exported[0];
      assert(path.basename(patchPath).includes('issue-200-'),
        'sc5: exported patch filename must contain issue-200-, got: ' + patchPath);
      assert(fs.existsSync(patchPath), 'sc5: exported patch file must exist on disk');
      assert(fs.statSync(patchPath).size > 0, 'sc5: exported patch file must be non-empty');
      assert(!fs.existsSync(wtPath), 'sc5: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 6: execute-dirty-force — dirty worktree + --execute --force
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc6-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--force'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc6: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.stashed || out.stashed.length === 0,
        'sc6: stashed must be empty with --force, got: ' + JSON.stringify(out.stashed));
      assert(!out.exported || out.exported.length === 0,
        'sc6: exported must be empty with --force, got: ' + JSON.stringify(out.exported));
      assert(!fs.existsSync(wtPath), 'sc6: worktree dir must be removed after force+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 7: keep-branch — clean worktree + --execute --keep-branch
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc7-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      const branchCheck = G.git(tmp, ['rev-parse', '--verify', 'refs/heads/workflow/gitea-issue-200'], { encoding: 'utf8' });
      assert.strictEqual(branchCheck.status, 0, 'sc7: branch workflow/gitea-issue-200 must still exist, got: ' + branchCheck.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 8: execute-archive-fail — stash fails → failed_preserve, no removal
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc8-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    let lockFile = null;
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      // Make stashWorktree fail: read the real gitdir from the worktree's .git file
      // and place an index.lock there so git stash push fails
      const gitFileContent = fs.readFileSync(path.join(wtPath, '.git'), 'utf8').trim();
      const gitdirLine = gitFileContent.match(/^gitdir:\s*(.+)$/m);
      assert(gitdirLine, 'sc8: could not parse gitdir from worktree .git file');
      lockFile = path.join(gitdirLine[1].trim(), 'index.lock');
      fs.writeFileSync(lockFile, '');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.failed_preserve) && out.failed_preserve.some(p => p === wtPath),
        'sc8: failed_preserve must contain wtPath, got: ' + JSON.stringify(out));
      assert(!out.removed || !out.removed.some(p => p === wtPath),
        'sc8: removed must NOT contain wtPath when preserve failed, got: ' + JSON.stringify(out.removed));
      assert(fs.existsSync(wtPath), 'sc8: worktree dir must still exist when preserve failed');
    } finally {
      if (lockFile) { try { fs.unlinkSync(lockFile); } catch (_) {} }
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 9: untracked-only export — worktree dirty ONLY from untracked file
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc9-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      // No tracked changes — only an untracked file. git diff HEAD is empty.
      fs.writeFileSync(path.join(wtPath, 'untracked.txt'), 'hello untracked\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc9: exported must include patch + sidecar dir (length >= 2), got: ' + JSON.stringify(out.exported));
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc9: exactly one sidecar dir ending in -untracked, got: ' + JSON.stringify(out.exported));
      assert(fs.existsSync(path.join(sidecars[0], 'untracked.txt')),
        'sc9: untracked.txt must be preserved in sidecar dir');
      assert(!out.failed_preserve || !out.failed_preserve.some(p => p === wtPath),
        'sc9: wtPath must NOT be in failed_preserve, got: ' + JSON.stringify(out.failed_preserve));
      assert(!fs.existsSync(wtPath), 'sc9: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 10: mixed export — tracked modification + untracked file
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc10-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'README.md'), 'modified tracked content\n'); // tracked change
      fs.writeFileSync(path.join(wtPath, 'new-untracked.txt'), 'new file\n');          // untracked
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc10: exported must include patch + sidecar dir (length >= 2), got: ' + JSON.stringify(out.exported));
      const patches = out.exported.filter(p => p.endsWith('.patch'));
      assert(patches.length === 1, 'sc10: exactly one .patch file, got: ' + JSON.stringify(out.exported));
      assert(fs.statSync(patches[0]).size > 0, 'sc10: patch must be non-empty (tracked change present)');
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc10: exactly one sidecar dir ending in -untracked, got: ' + JSON.stringify(out.exported));
      assert(fs.existsSync(path.join(sidecars[0], 'new-untracked.txt')),
        'sc10: new-untracked.txt must be preserved in sidecar dir');
      assert(!fs.existsSync(wtPath), 'sc10: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 11: multi-flag precedence — dirty worktree + --execute --archive --export (archive wins)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive', '--export'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc11: archive must win — stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.exported) && out.exported.length === 0,
        'sc11: export must not fire when archive present, got: ' + JSON.stringify(out.exported));
      assert(!out.failed_preserve || out.failed_preserve.length === 0,
        'sc11: failed_preserve must be empty, got: ' + JSON.stringify(out.failed_preserve));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc11: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc11: worktree dir must be removed after archive+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testStaleWorktreeCleanup: PASSED');
}

testInstallProfilesFeaturesTableHandling();
testUpdateHooksHardening325();
test409StableHomeSurvivesDirDeletion();   // #409
testStaleWorktreeCheck();
testStaleWorktreeCleanup();

// --- Issue #167: closure-audit (Gitea port of GitLab issue #166 / GitHub #165) ---

function testClosureAuditOfflineRemoteClassesSkipped() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-offline-')));
  try {
    initGitRepo(tmp);
    const result = runClosureAuditOffline([], tmp);
    assert.strictEqual(result.dry_run, true, 'offline audit dry_run must be true, got: ' + result.dry_run);
    assert.strictEqual(result.offline, true, 'offline audit offline must be true, got: ' + result.offline);
    assert.strictEqual(
      result.drift.stale_in_progress_labels, 'skipped_offline',
      'offline: stale_in_progress_labels must be "skipped_offline", got: ' + JSON.stringify(result.drift.stale_in_progress_labels)
    );
    assert.strictEqual(
      result.drift.unarchived_pr_folders, 'skipped_offline',
      'offline: unarchived_pr_folders must be "skipped_offline", got: ' + JSON.stringify(result.drift.unarchived_pr_folders)
    );
    assert(
      !('unresolved_closed_state' in result.drift),
      'offline: unresolved_closed_state must be absent when offline (omit-when-empty), got: ' + JSON.stringify(result.drift.unresolved_closed_state)
    );
    console.log('testClosureAuditOfflineRemoteClassesSkipped: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleInProgressLabels() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-labels-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const labels = result.drift.stale_in_progress_labels;
    assert(
      Array.isArray(labels) && labels.length === 1 && labels[0].number === 99,
      'stale_in_progress_labels must list issue 99, got: ' + JSON.stringify(labels)
    );
    assert.strictEqual(result.counts.stale_in_progress_labels, 1, 'counts.stale_in_progress_labels must be 1, got: ' + result.counts.stale_in_progress_labels);
    console.log('testClosureAuditStaleInProgressLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditActiveFolderForClosedIssueReportsDirty() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-active-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-904', 904);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const folders = result.drift.active_folder_for_closed_issue;
    assert(
      folders.length === 1 && folders[0].project === 'issue-904' && folders[0].issue_number === 904,
      'active_folder_for_closed_issue must report issue-904, got: ' + JSON.stringify(folders)
    );
    assert.strictEqual(folders[0].dirty, true, 'planted (uncommitted) active folder must be reported dirty:true, got: ' + folders[0].dirty);
    console.log('testClosureAuditActiveFolderForClosedIssueReportsDirty: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditUnarchivedPrFolderMergedLowercase() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-unarchived-pr-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-905', 905);
    makePrSinkFolder(tmp, 'issue-905', 905);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('pr view')) { process.stdout.write('{\"state\":\"merged\"}\\n'); }",
      "else if (a.includes('issues view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const prFolders = result.drift.unarchived_pr_folders;
    assert(
      Array.isArray(prFolders) && prFolders.length === 1 && prFolders[0].project === 'issue-905' && prFolders[0].pr_state === 'merged',
      'unarchived_pr_folders must report merged PR folder issue-905 with lowercase pr_state "merged", got: ' + JSON.stringify(prFolders)
    );
    assert(prFolders[0].pr_url, 'unarchived_pr_folders entry must carry pr_url, got: ' + JSON.stringify(prFolders[0]));
    console.log('testClosureAuditUnarchivedPrFolderMergedLowercase: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteNeverTouchesActiveFolders() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-exec-safe-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-907', 907);
    const folderDir = path.join(tmp, 'kaola-workflow', 'issue-907');
    assert(fs.existsSync(folderDir), 'precondition: active folder must exist');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert.strictEqual(result.dry_run, false, '--execute must return dry_run:false');
    assert(fs.existsSync(folderDir), '--execute must NEVER delete an active folder, even for a closed issue');
    const reported = result.reported_not_repaired.active_folder_for_closed_issue;
    assert(
      Array.isArray(reported) && reported.some(e => e.issue_number === 907),
      'closed-issue active folder must appear in reported_not_repaired, got: ' + JSON.stringify(reported)
    );
    console.log('testClosureAuditExecuteNeverTouchesActiveFolders: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditDryRunNeverCallsRemoveLabel() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-dryrun-safe-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues edit') && a.includes('--remove-labels')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert.strictEqual(result.dry_run, true, 'no --execute must return dry_run:true, got: ' + result.dry_run);
    assert(!fs.existsSync(marker), 'dry-run must NOT call tea issues edit --remove-labels (marker must not exist)');
    console.log('testClosureAuditDryRunNeverCallsRemoveLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleLabelsTimeout() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-stale-labels-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    assert.strictEqual(
      result.drift.stale_in_progress_labels, 'skipped_timeout',
      'stale-labels hang must return "skipped_timeout", got: ' + JSON.stringify(result.drift.stale_in_progress_labels)
    );
    assert(
      !('unresolved_closed_state' in result.drift),
      'empty candidates must not produce unresolved_closed_state, got: ' + JSON.stringify(result.drift.unresolved_closed_state)
    );
    console.log('testClosureAuditStaleLabelsTimeout: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteDetectionTimeoutPropagates() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-exec-det-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit(['--execute'], tmp, binDir, probeTimeoutEnv());
    assert.strictEqual(
      result.repaired.labels_skipped_reason, 'detection_timeout',
      '--execute with detection timeout must set labels_skipped_reason="detection_timeout", got: ' + JSON.stringify(result.repaired.labels_skipped_reason)
    );
    assert(
      Array.isArray(result.repaired.labels_removed) && result.repaired.labels_removed.length === 0,
      'labels_removed must be empty when detection timed out, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    console.log('testClosureAuditExecuteDetectionTimeoutPropagates: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function assertKeys903(obj, expected, label) {
  assert.deepStrictEqual(Object.keys(obj), expected,
    '#903: ' + label + ' must carry exactly these keys in this order, got: ' + JSON.stringify(Object.keys(obj)));
}

// The repository-wide drift keys this edition emits, in the order buildAuditReport inserts them.
// ADR 0018 §5 retired stale_roadmap_sources and mirror_lists_closed_issues — there is no local
// roadmap source or mirror left for a closure to leave stale.
// unarchived_pr_folders is this edition's pull-request vocabulary.
// The two omit-when-empty classes (archive_summary_citation_missing, unresolved_closed_state) are
// deliberately absent: a fixture that has neither must not grow either key.
const GT_DRIFT_KEYS_903 = [
  'stale_in_progress_labels',
  'active_folder_for_closed_issue',
  'unarchived_pr_folders',
  'archive_content_incomplete'
];

// Plant an archive folder. `fields` is written verbatim into workflow-state.md so a caller can plant
// a bundle's issue_numbers / closure_policy; `{ anchor: false }` plants the anchor-LESS folder that
// archive_content_incomplete exists to report.
function plantArchive903(root, name, fields, options) {
  const dir = path.join(root, 'kaola-workflow', 'archive', name);
  fs.mkdirSync(dir, { recursive: true });
  if (!options || options.anchor !== false) {
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), fields.join('\n') + '\n');
  }
  return dir;
}

function plantArchiveSummary903(dir, lines) {
  fs.writeFileSync(path.join(dir, 'finalization-summary.md'), lines.join('\n') + '\n');
}

// §8.1 — the regression #903 IS: --project must partition, and the repository sweep must still run
// whole. Out-of-scope drift stays visible in its own half; it can neither contaminate the scoped
// verdict nor be hidden by it.
function testClosureAuditRejectsUnknownFlagAndHelp903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-argv-')));
  const notARepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-norepo-')));
  try {
    initGitRepo(tmp);

    const bogus = runClosureAuditRaw(['--bogus-flag-xyz'], tmp);
    assert.strictEqual(bogus.status, 1,
      '#903: an unknown flag must exit 1 — it was silently absorbed and answered with the full report before, got '
        + bogus.status + '\nstdout: ' + bogus.stdout);
    assert.strictEqual(bogus.stdout, '',
      '#903: on operator-input error stdout must be EMPTY, so no caller can parse a partial answer, got: ' + JSON.stringify(bogus.stdout));
    assert(/unknown flag: --bogus-flag-xyz/.test(bogus.stderr),
      '#903: stderr must name the rejected flag, got: ' + JSON.stringify(bogus.stderr));

    for (const flag of ['--help', '-h']) {
      const help = runClosureAuditRaw([flag], tmp);
      assert.strictEqual(help.status, 0, '#903: ' + flag + ' must exit 0, got ' + help.status + '\nstderr: ' + help.stderr);
      assert(/^usage:/.test(help.stdout),
        '#903: ' + flag + ' must print usage on STDOUT, got: ' + JSON.stringify(help.stdout.slice(0, 120)));
      assert.strictEqual(help.stderr, '', '#903: ' + flag + ' must write nothing to stderr, got: ' + JSON.stringify(help.stderr));
    }

    // Flags are parsed BEFORE the repo probe, so --help answers outside a git repository too.
    const helpOutside = runClosureAuditRaw(['--help'], notARepo);
    assert.strictEqual(helpOutside.status, 0,
      '#903: --help must work outside a git repository, got ' + helpOutside.status + '\nstderr: ' + helpOutside.stderr);
    assert(/^usage:/.test(helpOutside.stdout),
      '#903: --help outside a repo must still print usage, got: ' + JSON.stringify(helpOutside.stdout.slice(0, 120)));

    for (const argv of [['--project'], ['--project', '--execute'], ['--issue'], ['--issue', 'abc'], ['--issue', '0700'], ['--issue', '-1']]) {
      const bad = runClosureAuditRaw(argv, tmp);
      assert.strictEqual(bad.status, 1,
        '#903: a missing or malformed flag value must exit 1 for ' + JSON.stringify(argv) + ', got ' + bad.status
          + '\nstdout: ' + bad.stdout);
      assert.strictEqual(bad.stdout, '',
        '#903: stdout must be empty for ' + JSON.stringify(argv) + ', got: ' + JSON.stringify(bad.stdout));
    }

    // CONTROL: the fixture and the runner are live — a well-formed argv still answers at exit 0.
    const ok = runClosureAuditRaw([], tmp);
    assert.strictEqual(ok.status, 0, '#903 control: a bare run must still exit 0, got ' + ok.status + '\nstderr: ' + ok.stderr);
    assert.strictEqual(JSON.parse(ok.stdout).dry_run, true,
      '#903 control: a bare run must still emit the dry-run envelope, got: ' + ok.stdout.slice(0, 120));
    console.log('testClosureAuditRejectsUnknownFlagAndHelp903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(notARepo, { recursive: true, force: true });
  }
}

// §8.2 — the single most important new guard. The old behaviour was exit 0 with an UNSCOPED answer,
// so a mistyped project name read as "clean". Answering clean for a name that resolves to nothing is
// precisely the silent-scoping failure this flag exists to remove.
function testClosureAuditMistypedProjectExitsOne903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-mistyped-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'bundle-700-701', 700, 'issue_numbers: 700, 701');

    const mistyped = runClosureAuditRaw(['--project', 'bundle-700-70'], tmp);
    assert.strictEqual(mistyped.status, 1,
      '#903: a --project that resolves to no workflow-state.md must exit 1, never answer clean, got ' + mistyped.status
        + '\nstdout: ' + mistyped.stdout);
    assert.strictEqual(mistyped.stdout, '',
      '#903: stdout must be EMPTY — a partial or unscoped answer here is the failure itself, got: ' + JSON.stringify(mistyped.stdout));
    assert(/no workflow-state.md found for project "bundle-700-70"/.test(mistyped.stderr),
      '#903: stderr must name the unresolvable project, got: ' + JSON.stringify(mistyped.stderr));
    assert(/--issue/.test(mistyped.stderr),
      '#903: stderr must point at the --issue escape hatch, got: ' + JSON.stringify(mistyped.stderr));

    // CONTROL: the correctly-spelled name resolves and answers at exit 0 — so exit 1 above is the
    // name, not a broken fixture.
    const correct = runClosureAuditRaw(['--project', 'bundle-700-701'], tmp);
    assert.strictEqual(correct.status, 0,
      '#903 control: the correctly-spelled project must exit 0, got ' + correct.status + '\nstderr: ' + correct.stderr);
    assert.deepStrictEqual(JSON.parse(correct.stdout).scope.issue_numbers, [700, 701],
      '#903 control: the resolved scope must carry both members, got: ' + correct.stdout.slice(0, 200));

    // The escape hatch: an unresolvable --project is accepted when --issue supplies the scope.
    const byIssue = runClosureAuditRaw(['--project', 'no-such-project-xyz', '--issue', '701'], tmp);
    assert.strictEqual(byIssue.status, 0,
      '#903: an unresolvable --project WITH --issue must be accepted, got ' + byIssue.status + '\nstderr: ' + byIssue.stderr);
    const byIssueOut = JSON.parse(byIssue.stdout);
    assert.strictEqual(byIssueOut.scope.state_file, null,
      '#903: state_file must be null when nothing was resolved, got: ' + JSON.stringify(byIssueOut.scope.state_file));
    assert.deepStrictEqual(byIssueOut.scope.issue_numbers, [701],
      '#903: the scope must be exactly the --issue values, got: ' + JSON.stringify(byIssueOut.scope.issue_numbers));

    // --issue alone: no project, no state file.
    const issueOnly = JSON.parse(runClosureAuditRaw(['--issue', '701'], tmp).stdout);
    assert.strictEqual(issueOnly.scope.project, null,
      '#903: scope.project must be null when scoped by --issue alone, got: ' + JSON.stringify(issueOnly.scope.project));

    // ── The escape hatch's VERDICT, and it must run ONLINE ─────────────────────────────────────
    // MEASURED on this edition: `--project <typo> --issue N` answered current_project_clean:TRUE — a
    // mistyped project name reading clean, reached THROUGH the escape hatch rather than past the assert
    // that exists to stop it. --issue supplies numbers to scope BY; it does not supply the record the
    // name failed to resolve, so the project half of the scope never evaluated.
    //
    // Why not runClosureAuditRaw, which every leg above uses: it sets KAOLA_WORKFLOW_OFFLINE=1, and
    // OFFLINE the same argv reads clean:false because two classes token 'skipped_offline'. A pin
    // written through that runner PASSES AGAINST THE DEFECT (measured: pre-fix offline reads false,
    // pre-fix online reads true). These legs use runClosureAudit, which sets OFFLINE=0 explicitly, plus
    // a mock on tea's own hook — and tea says `issues view`, not `issue view`: keyed on the wrong verb
    // the mock falls through to `{}`, every probe reads unavailable, and the control below reads false
    // where it has to read true.
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const unresolvedOnline = runClosureAudit(['--project', 'bundle-700-70', '--issue', '701'], tmp, binDir);
    assert.strictEqual(unresolvedOnline.offline, false,
      '#903: this leg must be ONLINE or it proves nothing — offline masks the false clean, got offline: '
        + unresolvedOnline.offline);
    assertKeys903(unresolvedOnline.scope,
      ['project', 'issue_numbers', 'state_file', 'project_unresolved'],
      'the scope of an UNRESOLVED --project accepted via --issue');
    assert.strictEqual(unresolvedOnline.scope.project_unresolved, true,
      '#903: an unresolvable --project accepted via --issue must SAY the name resolved to nothing, got: '
        + JSON.stringify(unresolvedOnline.scope));
    assert.strictEqual(unresolvedOnline.current_project_clean, false,
      '#903: and it must never read clean — nothing was read for the name the operator typed, so no class '
        + 'speaks for that project. This answered TRUE; got: ' + unresolvedOnline.current_project_clean
        + ' scope: ' + JSON.stringify(unresolvedOnline.scope));
    // clean:false above must come from the UNRESOLVED SCOPE, not from a class that failed to evaluate. An
    // exact key set is what proves the tea mock ANSWERED: a dead mock reads every probe 'unavailable',
    // which adds unresolved_closed_state and would satisfy the assertion above on a dead axis.
    assertKeys903(unresolvedOnline.current_project_drift, GT_DRIFT_KEYS_903,
      'the in-scope drift of the unresolved run (an extra class here means the mock never answered)');
    for (const key of GT_DRIFT_KEYS_903) {
      assert.deepStrictEqual(unresolvedOnline.current_project_drift[key], [],
        '#903: every scoped class must be an EVALUATED empty array, so clean:false is the unresolved '
          + 'verdict and not drift that happened to be found; ' + key + ' was: '
          + JSON.stringify(unresolvedOnline.current_project_drift[key]));
    }

    // POSITIVE CONTROL — same fixture, same runner, same mock, same --issue: a RESOLVABLE --project over
    // this zero-drift repo must still read clean:TRUE, and its scope must still carry exactly THREE keys
    // (project_unresolved is omitted when false). Without this an always-false verdict would satisfy
    // every assertion above.
    const resolvedOnline = runClosureAudit(['--project', 'bundle-700-701', '--issue', '701'], tmp, binDir);
    assert.strictEqual(resolvedOnline.current_project_clean, true,
      '#903 control: a resolvable --project with the same --issue over zero drift must still read '
        + 'clean:true — this is what separates the fix from a verdict that never says clean, got: '
        + resolvedOnline.current_project_clean + ' drift: ' + JSON.stringify(resolvedOnline.current_project_drift));
    assertKeys903(resolvedOnline.scope, ['project', 'issue_numbers', 'state_file'],
      'the scope of a RESOLVABLE --project (project_unresolved is OMITTED when false)');

    // The scope LABEL is axis-independent, unlike the verdict: offline the same unresolvable argv still
    // reports project_unresolved, and reads clean:false there only because two classes never ran.
    assert.strictEqual(byIssueOut.scope.project_unresolved, true,
      '#903: the unresolved label must be on the offline answer too — it is a fact about the NAME, not '
        + 'about what could be probed, got: ' + JSON.stringify(byIssueOut.scope));
    console.log('testClosureAuditMistypedProjectExitsOne903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.4 — current_project_clean is FAIL-CLOSED: true only when every scoped class actually EVALUATED
// and came back empty. This is the assertion most likely to be written backwards, so both legs run
// over the SAME zero-drift fixture and the only difference is whether the remote classes ran.
function testClosureAuditBundleMemberActiveFolderClosed903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-member-folder-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // The previously-invisible case: primary OPEN, member CLOSED.
    writeState(tmp, 'bundle-800-801', 800, 'issue_numbers: 800, 801');
    // Primary-precedence control: a folder whose own primary is closed.
    writeState(tmp, 'issue-804', 804);
    // Over-report control: a bundle with no closed member at all.
    writeState(tmp, 'bundle-810-811', 810, 'issue_numbers: 810, 811');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view 801')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues view 804')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);

    const result = runClosureAudit([], tmp, binDir);
    const folders = result.drift.active_folder_for_closed_issue;
    const bundle = folders.filter(f => f.project === 'bundle-800-801');
    assert(bundle.length === 1 && bundle[0].issue_number === 801,
      '#903: a bundle folder whose MEMBER 801 is closed must be reported ONCE, naming 801 — the candidate set threw '
        + 'members away, so this folder was invisible. got: ' + JSON.stringify(folders));
    const primary = folders.filter(f => f.project === 'issue-804');
    assert(primary.length === 1 && primary[0].issue_number === 804,
      '#903 control: a closed PRIMARY keeps precedence and reports unchanged, got: ' + JSON.stringify(folders));
    assert(!folders.some(f => f.project === 'bundle-810-811'),
      '#903 control: a bundle with no closed member must NOT be reported — the member arm must not over-report, got: '
        + JSON.stringify(folders));
    assert.strictEqual(result.counts.active_folder_for_closed_issue, 2,
      '#903: exactly two folders are drift here (one per folder, never one per member), got: '
        + result.counts.active_folder_for_closed_issue);
    console.log('testClosureAuditBundleMemberActiveFolderClosed903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditCitationMissingOmittedWhenEmpty903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-citation-empty-')));
  try {
    initGitRepo(tmp);
    const dir = plantArchive903(tmp, 'issue-910', ['status: complete', 'step: complete', 'issue_iid: 910']);
    fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'), 'present\n');
    plantArchiveSummary903(dir, ['# Finalization', '', 'Evidence: `.cache/final-validation.md`.']);

    const dry = runClosureAuditOffline([], tmp);
    assert(!('archive_summary_citation_missing' in dry.drift),
      '#901: an archive whose citations all RESOLVE must add no key to drift, got: ' + JSON.stringify(Object.keys(dry.drift)));
    assert(!('archive_summary_citation_missing' in dry.counts),
      '#901: and no key to counts, got: ' + JSON.stringify(Object.keys(dry.counts)));
    assertKeys903(dry.drift, GT_DRIFT_KEYS_903, 'the unscoped drift object with a complete archive');
    // CONTROL: the fixture is a COMPLETE archive, so it produces no archive drift of either class.
    assert.deepStrictEqual(dry.drift.archive_content_incomplete, [],
      '#901 control: this archive has its identity anchor, so the disk-derived class must be empty too, got: '
        + JSON.stringify(dry.drift.archive_content_incomplete));

    const exec = runClosureAuditOffline(['--execute'], tmp);
    assert(!('archive_summary_citation_missing' in exec.reported_not_repaired),
      '#901: the --execute envelope must stay exactly as it was when the class is empty, got: '
        + JSON.stringify(Object.keys(exec.reported_not_repaired)));
    console.log('testClosureAuditCitationMissingOmittedWhenEmpty903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.9 — the citation rule as MEASURED: `.jsonl` append-logs are excluded and the extension is never
// truncated to `.json`; backticks are NOT required (a measured true positive in this repo's corpus is
// an unbackticked table cell); an archive with no summary stays quiet. Report-only in both modes.
function testClosureAuditCitationMissingReportsAndExcludesJsonl903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-citation-')));
  try {
    initGitRepo(tmp);
    const flagged = plantArchive903(tmp, 'issue-920', ['status: complete', 'issue_iid: 920']);
    plantArchiveSummary903(flagged, ['# Finalization', '', 'Chain receipt: `.cache/chain-receipt.json` (headSha: deadbeef)']);
    const jsonl = plantArchive903(tmp, 'issue-921', ['status: complete', 'issue_iid: 921']);
    plantArchiveSummary903(jsonl, ['# Finalization', '', 'Delete `.cache/release-receipt.jsonl` before the next release.']);
    const unbackticked = plantArchive903(tmp, 'issue-922', ['status: complete', 'issue_iid: 922']);
    plantArchiveSummary903(unbackticked, ['# Finalization', '', '| doc-updater | invoked | .cache/doc-updater.md (report) |']);
    plantArchive903(tmp, 'issue-923', ['status: complete', 'issue_iid: 923']); // no summary at all

    const dry = runClosureAuditOffline([], tmp);
    const found = dry.drift.archive_summary_citation_missing;
    assert(Array.isArray(found),
      '#901: a cited-but-absent artifact must be reported as archive_summary_citation_missing, got drift: '
        + JSON.stringify(Object.keys(dry.drift)));
    assert.deepStrictEqual(found.map(e => e.project), ['issue-920', 'issue-922'],
      '#901: exactly the backticked-json and the UNBACKTICKED table-cell citations are missing — requiring backticks '
        + 'reads tidier and silently drops a measured true positive; `.jsonl` is excluded and must not be truncated to '
        + '`.json`; an archive with no summary stays quiet. got: ' + JSON.stringify(found));
    assert.deepStrictEqual(found[0].cited_missing, ['.cache/chain-receipt.json'],
      '#901: the finding must carry the cited path so an operator can adjudicate in one ls, got: ' + JSON.stringify(found[0]));
    assert.deepStrictEqual(found[1].cited_missing, ['.cache/doc-updater.md'],
      '#901: the unbackticked citation must be reported with its path, got: ' + JSON.stringify(found[1]));
    assert.strictEqual(dry.counts.archive_summary_citation_missing, 2,
      '#901: counts must mirror the class, got: ' + dry.counts.archive_summary_citation_missing);

    const exec = runClosureAuditOffline(['--execute'], tmp);
    assert.deepStrictEqual(exec.reported_not_repaired.archive_summary_citation_missing.map(e => e.project),
      ['issue-920', 'issue-922'],
      '#901: the class is REPORT-ONLY — the cited bytes are gone and nothing here can rebuild them, got: '
        + JSON.stringify(exec.reported_not_repaired.archive_summary_citation_missing));
    for (const name of ['issue-920', 'issue-921', 'issue-922', 'issue-923']) {
      assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', name)),
        '#901: --execute must never touch an archive it reported, ' + name + ' is gone');
    }
    console.log('testClosureAuditCitationMissingReportsAndExcludesJsonl903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.10 — the scoping helpers, in-process (no spawn). Every function below is exported for exactly
// this. archiveNameMatchesProject must never match a BARE PREFIX: `P-extra` is a different project.
function testClosureAuditScopedArchiveNameMatch903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-attr-name-')));
  try {
    initGitRepo(tmp);
    // The live folder is what makes `--project bundle-700-701` resolvable; the same-named archive
    // below is the anchor-less folder the class reports.
    writeState(tmp, 'bundle-700-701', 700, 'issue_numbers: 700, 701');
    plantArchive903(tmp, 'bundle-700-701', [], { anchor: false });
    plantArchive903(tmp, 'bundle-700-701-extra', [], { anchor: false });
    plantArchive903(tmp, 'issue-555', [], { anchor: false });
    // A DOTTED sibling that is neither of the two archive suffixes. Planted COMPLETE so it adds no
    // finding and the two exact finding lists below are untouched — it is here for the ambiguity
    // assertion alone: the flag counts folders matching by NAME SHAPE, and a naive "more than one
    // archive mentions this project" count would flag `bundle-700-701` on these neighbours alone.
    plantArchive903(tmp, 'bundle-700-701.something', ['status: closed', 'step: complete', 'issue_iid: 939']);

    const scoped = runClosureAuditOffline(['--project', 'bundle-700-701'], tmp);
    const inScope = scoped.current_project_drift.archive_content_incomplete;
    assert.deepStrictEqual(inScope, [{ project: 'bundle-700-701', missing: ['workflow-state.md'], attribution: 'name_match' }],
      '#903: exactly the name-matched archive is in scope, stamped name_match — `bundle-700-701-extra` is an unrelated '
        + 'project and a bare-prefix match would swallow it. got: ' + JSON.stringify(inScope));
    assert.deepStrictEqual(scoped.repository_drift_outside_scope.archive_content_incomplete.map(f => f.project),
      ['bundle-700-701-extra', 'issue-555'],
      '#903: both unrelated archives must stay VISIBLE in the out-of-scope half, got: '
        + JSON.stringify(scoped.repository_drift_outside_scope.archive_content_incomplete));
    assert(!scoped.repository_drift_outside_scope.archive_content_incomplete.some(f => 'attribution' in f),
      '#903: only the SCOPED half is annotated, got: ' + JSON.stringify(scoped.repository_drift_outside_scope.archive_content_incomplete));
    assert(!('archive_name_ambiguous' in scoped.scope),
      '#903: no bare/timestamped pair here, so the ambiguity flag must be omitted, got: ' + JSON.stringify(scoped.scope));

    const unscoped = runClosureAuditOffline([], tmp);
    assert(!unscoped.drift.archive_content_incomplete.some(f => 'attribution' in f),
      '#903: the repository-wide findings pass through VERBATIM — no attribution key at all, got: '
        + JSON.stringify(unscoped.drift.archive_content_incomplete));
    console.log('testClosureAuditScopedArchiveNameMatch903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.11 — a bare `P` archive sitting beside a timestamped `P.archived-*` sibling: one is residue and
// neither folder says which. Reported as ambiguous, never guessed silently.
function testClosureAuditScopedArchiveAmbiguousMatch903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-attr-ambiguous-')));
  try {
    initGitRepo(tmp);
    plantArchive903(tmp, 'bundle-429-434', [], { anchor: false });
    plantArchive903(tmp, 'bundle-429-434.archived-2026-06-13T08-52-23-135Z', [
      'status: closed', 'step: complete', 'issue_iid: 429', 'issue_numbers: 429, 434'
    ]);

    const scoped = runClosureAuditOffline(['--project', 'bundle-429-434'], tmp);
    assert.strictEqual(scoped.scope.archive_name_ambiguous, true,
      '#903: a bare archive beside a timestamped sibling must be REPORTED ambiguous, got: ' + JSON.stringify(scoped.scope));
    assert.strictEqual(scoped.scope.state_file,
      'kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/workflow-state.md',
      '#903: the resolver must fall through the anchor-less bare dir to the sibling that HAS a record, got: '
        + JSON.stringify(scoped.scope.state_file));
    assert.deepStrictEqual(scoped.scope.issue_numbers, [429, 434],
      '#903: the members come from that record, got: ' + JSON.stringify(scoped.scope.issue_numbers));
    const inScope = scoped.current_project_drift.archive_content_incomplete;
    assert(inScope.length === 1 && inScope[0].attribution === 'ambiguous_name_match',
      '#903: the finding must say its attribution is ambiguous rather than imply a clean match, got: ' + JSON.stringify(inScope));

    // CONTROL: a project with only the timestamped archive is NOT ambiguous, so the flag must be
    // absent — otherwise an always-true ambiguity check would look identical to a working one.
    plantArchive903(tmp, 'bundle-500.archived-2026-06-14T00-00-00-000Z', ['status: closed', 'issue_iid: 500']);
    const clean = runClosureAuditOffline(['--project', 'bundle-500'], tmp);
    assert(!('archive_name_ambiguous' in clean.scope),
      '#903 control: one archive under one name is unambiguous, got: ' + JSON.stringify(clean.scope));

    // TWO TIMESTAMPED SIBLINGS AND NO BARE `P` — the commonest residue pair, and MEASURED invisible on
    // this edition: the rule demanded a bare `P` PLUS a suffixed sibling, so the scope adopted one of the
    // two records silently. Both halves of that one defect are pinned, because either alone still lies:
    //   * the FLAG — more than one archive folder matches, so the attribution cannot be clean;
    //   * the STAMP — annotateAttribution keyed on `finding.project === scope.project`, which could only
    //     ever match the bare-`P` half, so a timestamped sibling read `name_match` even when the flag
    //     fired and the two halves of one report disagreed.
    // Both suffix shapes, because the set has two members and a rule can be written for one of them.
    // The class is LOCAL, so the offline runner observes all of it.
    for (const [label, sibling] of [
      ['archived', '.archived-2026-02-02T00-00-00-000Z'],
      ['discarded', '.discarded-2026-02-02T00-00-00-000Z']
    ]) {
      const pairTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-attr-pair-')));
      try {
        initGitRepo(pairTmp);
        plantArchive903(pairTmp, 'proj-c.archived-2026-01-01T00-00-00-000Z', [
          'status: closed', 'step: complete', 'issue_iid: 941'
        ]);
        plantArchive903(pairTmp, 'proj-c' + sibling, [], { anchor: false });

        const pair = runClosureAuditOffline(['--project', 'proj-c'], pairTmp);
        assert.strictEqual(pair.scope.archive_name_ambiguous, true,
          '#903 (' + label + '): two archive folders match `proj-c` and no bare `P` exists — the scope must '
            + 'REPORT the ambiguity instead of adopting one record silently, got: ' + JSON.stringify(pair.scope));
        assert.strictEqual(pair.scope.state_file,
          'kaola-workflow/archive/proj-c.archived-2026-01-01T00-00-00-000Z/workflow-state.md',
          '#903 (' + label + '): the scope still resolves through the sibling that HAS a record, got: '
            + JSON.stringify(pair.scope.state_file));
        const pairFindings = pair.current_project_drift.archive_content_incomplete;
        assert.deepStrictEqual(pairFindings.map(f => f.project), ['proj-c' + sibling],
          '#903 (' + label + '): the anchor-less sibling must be pulled into scope by name SHAPE, got: '
            + JSON.stringify(pairFindings));
        assert.strictEqual(pairFindings[0].attribution, 'ambiguous_name_match',
          '#903 (' + label + '): a TIMESTAMPED sibling\'s finding must carry the ambiguous stamp too — keyed '
            + 'on the bare project name it read as an unqualified name_match while the scope itself said '
            + 'ambiguous; got: ' + JSON.stringify(pairFindings[0]));
      } finally {
        fs.rmSync(pairTmp, { recursive: true, force: true });
      }
    }

    // NEGATIVE CONTROL for the STAMP, on the fixture shape the flag legs use: one matching archive folder
    // is not ambiguous AND its finding keeps the unqualified stamp. A stamp that said
    // `ambiguous_name_match` unconditionally would satisfy every leg above.
    const soloTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-attr-solo-')));
    try {
      initGitRepo(soloTmp);
      writeState(soloTmp, 'proj-solo', 942);
      plantArchive903(soloTmp, 'proj-solo', [], { anchor: false });
      const solo = runClosureAuditOffline(['--project', 'proj-solo'], soloTmp);
      assert(!('archive_name_ambiguous' in solo.scope),
        '#903 control: ONE matching archive folder is unambiguous and the key stays omitted, got: '
          + JSON.stringify(solo.scope));
      const soloFindings = solo.current_project_drift.archive_content_incomplete;
      assert(soloFindings.length === 1 && soloFindings[0].attribution === 'name_match',
        '#903 control: and its finding keeps the unqualified stamp, got: ' + JSON.stringify(soloFindings));
    } finally {
      fs.rmSync(soloTmp, { recursive: true, force: true });
    }
    console.log('testClosureAuditScopedArchiveAmbiguousMatch903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.12 — an archive whose state names a real plan_hash with NO workflow-plan.md beside it. THIS port
// demanded workflow-plan.md there long after the canonical script had dropped the demand, so the two
// editions answered differently about the same tree — `[{"project":"issue-777","missing":
// ["workflow-plan.md"]}]` here against `[]` there — and nothing anywhere could see it: no fixture in
// either port suite wrote plan_hash at all. The required set is exactly the identity anchor now, so a
// named plan hash obliges nothing; the plan file it points at is not derivable from anything that
// still exists.
function testClosureAuditPlanHashArchiveNeedsNoPlan903() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-planhash-')));
  try {
    initGitRepo(tmp);
    plantArchive903(tmp, 'issue-777', [
      'status: closed', 'step: complete', 'issue_iid: 777', 'plan_hash: ' + 'a'.repeat(64)
    ]);
    // POSITIVE CONTROL, in the SAME sweep: an anchor-LESS archive must still be reported. An
    // archiveRequiredContent that had stopped requiring anything at all — or a class that stopped
    // running — would read exactly like the fix without it.
    plantArchive903(tmp, 'issue-778', [], { anchor: false });

    const dry = runClosureAuditOffline([], tmp);
    assert.deepStrictEqual(dry.drift.archive_content_incomplete.map(f => f.project), ['issue-778'],
      '#832: a plan_hash-bearing, plan-LESS archive must produce NO finding, while the anchor-less one '
        + 'beside it must still produce one. This port reported the plan demand here and the canonical '
        + 'reported nothing; got: ' + JSON.stringify(dry.drift.archive_content_incomplete));
    assert.strictEqual(dry.counts.archive_content_incomplete, 1,
      '#832: counts must mirror the class, got: ' + dry.counts.archive_content_incomplete);

    // The scoped TERM is what actually flipped an operator-visible verdict: under --project the demand
    // landed in current_project_drift, which is what current_project_clean is computed from.
    const scoped = runClosureAuditOffline(['--project', 'issue-777'], tmp);
    assert.deepStrictEqual(scoped.current_project_drift.archive_content_incomplete, [],
      '#832: the scoped verdict term must be empty for a plan_hash-bearing, plan-less archive — this is '
        + 'the term current_project_clean reads, got: '
        + JSON.stringify(scoped.current_project_drift.archive_content_incomplete));
    assert.deepStrictEqual(
      scoped.repository_drift_outside_scope.archive_content_incomplete.map(f => f.project), ['issue-778'],
      '#903 control: the out-of-scope anchor-less archive stays VISIBLE, so the empty in-scope half above '
        + 'is a verdict and not a sweep that never ran; got: '
        + JSON.stringify(scoped.repository_drift_outside_scope.archive_content_incomplete));

    // The SHIPPED required set, read from this edition's OWN copy. The fixtures above can only see a
    // demand for a file they omit; this sees any second required name the moment it is written — which
    // is the drift that survived here unnoticed, conditional on a field nothing planted.
    const auditSrc = fs.readFileSync(closureAuditScript, 'utf8');
    const requiredFn = auditSrc.match(/function archiveRequiredContent\(dir\) \{([\s\S]*?)\n\}/);
    assert(requiredFn, '#832: archiveRequiredContent must be readable from ' + closureAuditScript);
    const shippedRequired = Array.from(
      new Set((requiredFn[1].match(/'[^']*\.md'/g) || []).map(s => s.slice(1, -1)))
    ).sort();
    assert.deepStrictEqual(shippedRequired, ['workflow-state.md'],
      '#832: this edition\'s required set must be exactly the identity anchor — a second name here is a '
        + 'demand no fixture omits, so nothing else in this suite would see it; got: '
        + JSON.stringify(shippedRequired));
    console.log('testClosureAuditPlanHashArchiveNeedsNoPlan903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// §8.13 — a `--project` value is ONE folder name under kaola-workflow/, never a path. `--project
// ../../outside` resolved a workflow-state.md from OUTSIDE the repository and answered a scoped verdict
// on it at exit 0 — a report about a tree the audit was never pointed at, carrying an issue number that
// appears nowhere inside the repo. Same operator-input error class as a mistyped flag, so it answers the
// same way: exit 1, EMPTY stdout, message on stderr. The empty-stdout half is the load-bearing one —
// any bytes there read as a scoped answer to whoever parses them.
//
// The fixture is a CONTAINER holding the repo and the outside tree as SIBLINGS, so `../../outside` from
// <root>/kaola-workflow/<project> lands on a file this scenario planted. Without that file the pre-fix
// run exits 1 for the unrelated unresolvable-name reason and this pin would pass against the very
// defect it exists to catch.
function testClosureAuditProjectNameIsNotAPath903() {
  const container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-traversal-')));
  const repo = path.join(container, 'repo');
  try {
    fs.mkdirSync(repo, { recursive: true });
    initGitRepo(repo);
    fs.mkdirSync(path.join(container, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(container, 'outside', 'workflow-state.md'),
      'status: active\nstep: implement\nissue_number: 4242\n');
    writeState(repo, 'issue-555', 555, 'issue_numbers: 555, 556');

    const traversal = runClosureAuditRaw(['--project', '../../outside'], repo);
    assert.strictEqual(traversal.status, 1,
      '#903: a --project that is a PATH must exit 1 — `../../outside` reported a verdict on a '
        + 'workflow-state.md outside the repository at exit 0, got ' + traversal.status
        + '\nstdout: ' + traversal.stdout);
    assert.strictEqual(traversal.stdout, '',
      '#903: and stdout must be EMPTY — the traversal run printed a full scoped report there, which every '
        + 'caller reads as an answer about the project it asked for, got: ' + JSON.stringify(traversal.stdout));
    assert(/safe folder name/.test(traversal.stderr),
      '#903: stderr must name the rule that rejected the value, got: ' + JSON.stringify(traversal.stderr));
    assert(!/4242/.test(traversal.stdout),
      '#903: the outside record\'s issue number must not reach stdout — resolving it was the defect, got: '
        + JSON.stringify(traversal.stdout));

    // POSITIVE CONTROL, same fixture, same runner: a legitimate folder name still scopes at exit 0. A
    // validator that rejected every name would satisfy the assertions above on its own.
    const good = runClosureAuditRaw(['--project', 'issue-555'], repo);
    assert.strictEqual(good.status, 0,
      '#903 control: a legitimate project name must still scope at exit 0, got ' + good.status
        + '\nstderr: ' + good.stderr);
    const goodScope = JSON.parse(good.stdout).scope;
    assert.strictEqual(goodScope.state_file, 'kaola-workflow/issue-555/workflow-state.md',
      '#903 control: the scope must resolve to the IN-REPO record, got: ' + JSON.stringify(goodScope));
    assert.deepStrictEqual(goodScope.issue_numbers, [555, 556],
      '#903 control: and to that record\'s members, got: ' + JSON.stringify(goodScope.issue_numbers));
    console.log('testClosureAuditProjectNameIsNotAPath903: PASSED');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
}

// --- Task 6: fail-open fix — forge.viewIssue throws outside OFFLINE must not silently pass ---
// #507 update: a generic/unknown forge error (no e.status/e.signal) is classified as transient
// ('killed' fallback) and retried, then surfaces as verdict:indeterminate (not target_unavailable).
// A clean-nonzero (e.status set) remains determinate → target_unavailable.

// testGiteaClassifierFailClosed: when viewIssue throws (transient) and OFFLINE is not set,
// classifyIssue must return verdict:indeterminate — #507 new behavior (was target_unavailable).
// A plain Error (no status/signal/code) → classifyFetchError fallback 'killed' → transient → retried 3x.
function testGiteaClassifierFailClosed() {
  const root = tempRoot('kw-gt-classifier-fail-');
  try {
    withForge({
      viewIssue() { throw new Error('network error'); } // no status/signal → transient → indeterminate
    }, () => {
      process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
      try {
        const result = classifier.classifyIssue(500, root);
        // #507: transient forge error → verdict:indeterminate + reasoning_class:classifier_error
        assert.strictEqual(result.verdict, 'indeterminate',
          '#507: classifyIssue transient forge error → verdict:indeterminate (got: ' + result.verdict + ')');
        assert.strictEqual(result.reasoning_class, 'classifier_error',
          '#507: indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
      } finally {
        delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
      }
    });
    console.log('testGiteaClassifierFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// testGiteaOfflineBypassesFailClosed: when KAOLA_WORKFLOW_OFFLINE=1, a failing forge must not
// block classification — the offline code path must proceed normally (no network calls expected)
// ADR 0018 §5 named accepted loss: offline claim evidence is retired with the local roadmap source
// it read — testGiteaOfflineBypassesFailClosed relied on a planted roadmap entry so an OFFLINE
// classify would find local evidence and return green; that evidence path is gone, so does this.

testGiteaClassifierFailClosed();

testClosureAuditOfflineRemoteClassesSkipped();
testClosureAuditStaleInProgressLabels();
testClosureAuditActiveFolderForClosedIssueReportsDirty();
testClosureAuditUnarchivedPrFolderMergedLowercase();
testClosureAuditExecuteNeverTouchesActiveFolders();
testClosureAuditDryRunNeverCallsRemoveLabel();
testClosureAuditStaleLabelsTimeout();
testClosureAuditExecuteDetectionTimeoutPropagates();
// #903: scoping, the flag contract, the bundle-member candidate fix and the #901 citation class.
testClosureAuditRejectsUnknownFlagAndHelp903();
testClosureAuditMistypedProjectExitsOne903();
testClosureAuditBundleMemberActiveFolderClosed903();
testClosureAuditCitationMissingOmittedWhenEmpty903();
testClosureAuditCitationMissingReportsAndExcludesJsonl903();
testClosureAuditScopedArchiveNameMatch903();
testClosureAuditScopedArchiveAmbiguousMatch903();
testClosureAuditPlanHashArchiveNeedsNoPlan903();
testClosureAuditProjectNameIsNotAPath903();
testProbeTimeoutEnv();

function testGiteaProbeResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-probe-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.exit(0);"]); // empty stdout, exit 0
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(42);
    assert.strictEqual(r.state, 'unavailable',
      'empty exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'tea issue state unverified',
      'empty exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGiteaProbeResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testGiteaProbeResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-probe-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]); // non-JSON, exit 0
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(43);
    assert.strictEqual(r.state, 'unavailable',
      'non-JSON exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'tea issue state unverified',
      'non-JSON exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGiteaProbeResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

testGiteaProbeResidualEmptyExit0();
testGiteaProbeResidualNonJsonExit0();

// issue #230 / #510 / #519: classifyIssue / cmdClassify must fail-closed on a degraded exit-0 forge
// response. #510 RECONCILE: under the corrected taxonomy an exit-0 unparseable/empty body is a
// TRANSIENT fault (the _st guard maps state:'unknown' → indeterminate). It is no longer a determinate
// target_unavailable — a malformed/empty body is an infra-degradation signal, not a genuine "issue
// gone". (parseJson(raw,{}) SWALLOWS the body to {} → state:'unknown'; the _st guard surfaces it.)

function testGiteaClassifyIssueResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ['process.exit(0);']);
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  // Fresh temp HOME so nothing in this scenario reaches the developer's real config.
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-empty-home-')));
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: empty exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: empty exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGiteaClassifyIssueResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaClassifyIssueResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-nonjson-home-')));
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: non-JSON exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: non-JSON exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGiteaClassifyIssueResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaCmdClassifyResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ['process.exit(0);']);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-empty-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify empty exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify empty exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGiteaCmdClassifyResidualEmptyExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaCmdClassifyResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-nonjson-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify non-JSON exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify non-JSON exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGiteaCmdClassifyResidualNonJsonExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #264 — AC9 parity: worktreePathFor hidden-local-path + legacy-cleanup
// Feature-detecting tests: assert OLD behavior until impl-claim lands the path-
// split + cmdLegacyWorktreeCleanup into kaola-gitea-workflow-claim.js.
// When impl-claim lands, SIGNAL = typeof claim.legacySiblingWorktreePathFor === 'function'
// activates the strict new-path assertions (RED-pending forward dependency on impl-claim).
// ---------------------------------------------------------------------------

// Test #11a (§F): worktreePathFor hidden-local-path assertion.
// SIGNAL: typeof claim.legacySiblingWorktreePathFor === 'function'
// If present (impl-claim landed): assert worktreePathFor returns a path under <root>/.kw/worktrees/
// Else (not yet landed): assert worktreePathFor returns OLD sibling path (parent/<repo>.kw/<project>)
function testGiteaWorktreePathForHiddenLocal() {
  const root = tempRoot('kw-gt-264-wtpath-');
  try {
    initGitRepo(root);
    const project = 'issue-264-wtpath-test';
    const result = claim.worktreePathFor(root, project);
    const hasNewApi = typeof claim.legacySiblingWorktreePathFor === 'function';
    if (hasNewApi) {
      // impl-claim landed: new path is under <root>/.kw/worktrees/<project>
      assert(
        result.includes(path.join('.kw', 'worktrees', project)),
        'testGiteaWorktreePathForHiddenLocal: expected path under .kw/worktrees/' + project + ', got: ' + result
      );
      assert(
        !result.includes(path.join('.kw', project)) || result.includes(path.join('worktrees', project)),
        'testGiteaWorktreePathForHiddenLocal: path must not be legacy sibling, got: ' + result
      );
    } else {
      // impl-claim not yet landed: old sibling path — parent/<repo>.kw/<project>
      const endsWithKwProject = result.endsWith(path.sep + project) &&
        result.includes('.kw' + path.sep + project) &&
        !result.includes(path.join('.kw', 'worktrees'));
      assert(
        endsWithKwProject,
        'testGiteaWorktreePathForHiddenLocal: expected OLD sibling path ending in .kw/<project>, got: ' + result
      );
    }
    console.log('testGiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=' + hasNewApi + ')');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test #11b (§F): legacy-worktree-cleanup dry-run assertion.
// SIGNAL: legacy-worktree-cleanup subcommand recognized (exit 0 + JSON with dry_run field).
// If recognized (impl-claim landed): assert dry-run reports legacy path in would_remove, removes nothing.
// Else (not yet landed): SKIP with a SKIPPED line, keeping the walkthrough green.
function testGiteaLegacyWorktreeCleanupDryRun() {
  const root = tempRoot('kw-gt-264-legacy-cleanup-');
  try {
    initGitRepo(root);
    // Probe: invoke legacy-worktree-cleanup without --execute on an offline repo
    const probe = spawnSync(process.execPath, [claimScript, 'legacy-worktree-cleanup'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    // Recognized = exit 0 AND stdout is valid JSON containing dry_run key
    let recognized = false;
    let probeJson = null;
    if (probe.status === 0) {
      try {
        probeJson = JSON.parse(probe.stdout.trim());
        recognized = probeJson !== null && typeof probeJson === 'object' && 'dry_run' in probeJson;
      } catch (_) { /* not JSON */ }
    }
    if (!recognized) {
      // impl-claim not yet landed; subcommand unknown — skip gracefully
      console.log('testGiteaLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)');
      return;
    }
    // impl-claim landed: build a legacy-path worktree and assert dry-run reports it
    const mainRoot = fs.realpathSync(root);
    const legacyContainer = path.dirname(mainRoot) + path.sep + path.basename(mainRoot) + '.kw';
    const legacyWt = path.join(legacyContainer, 'issue-264-legacy');
    fs.mkdirSync(legacyWt, { recursive: true });
    const addResult = G.git(root, ['worktree', 'add', '-b', 'workflow/gitea-issue-264-legacy', '--', legacyWt, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(addResult.status, 0, 'git worktree add failed: ' + addResult.stderr);
    try {
      const dryRun = spawnSync(process.execPath, [claimScript, 'legacy-worktree-cleanup'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(dryRun.status, 0, 'legacy-worktree-cleanup dry-run must exit 0, got: ' + dryRun.status + ' stderr: ' + dryRun.stderr);
      const out = JSON.parse(dryRun.stdout.trim());
      assert.strictEqual(out.dry_run, true, 'dry-run must report dry_run:true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => JSON.stringify(p).includes('issue-264-legacy')),
        'dry-run must report legacy worktree in would_remove, got: ' + JSON.stringify(out));
      assert(fs.existsSync(legacyWt), 'dry-run must not remove the worktree');
      assert(!('would_delete_branch' in out),
        'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
      console.log('testGiteaLegacyWorktreeCleanupDryRun: PASSED');
    } finally {
      G.git(root, ['worktree', 'remove', '--force', legacyWt], { encoding: 'utf8' });
      try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaClassifyIssueResidualEmptyExit0();
testGiteaClassifyIssueResidualNonJsonExit0();
testGiteaCmdClassifyResidualEmptyExit0();
testGiteaCmdClassifyResidualNonJsonExit0();
testWatchPrAbandonedClosureInvariantsClean();
testGiteaClaimReclaimsStatelessOrphanDir();
testGiteaPatchBranchGuards();
testGiteaWorktreePathForHiddenLocal();
testGiteaLegacyWorktreeCleanupDryRun();

// ---------------------------------------------------------------------------
// AC-7 (#266/#1044/#1101): Codex preflight regression tests plus the static compact prompt.
// #1101: Kaola-Workflow installs no Codex role profiles, so the preflight neither requires nor
// validates them; the profiles_missing / profiles_stale / config_stale refusals, the exit-6 profile
// schema gate, and the exit-7 codex_multi_agent_v2_required refusal are gone. What it still gates:
// the config-layer safety of HOME and every trusted project .codex layer, and retired-role residue —
// a RETIRED_PROFILE_FILES or ownership-record file inside a Kaola-owned .codex/agents/kaola-workflow/
// directory, or the `# BEGIN/END kaola-workflow agents` block — with the installer as the one repair.
// Dispatch mode, posture, and the V2 bounds are host facts: reported, never enforced.
// ---------------------------------------------------------------------------

const giteaPreflightScript = path.join(giteaPluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');

// Every preflight/doctor run in this section goes through this one site. `home` (optional) becomes
// the child's HOME; `script` (optional) runs another copy of the preflight, e.g. a plugin-cache one.
function runGiteaPreflight(args, home, script) {
  const env = home ? { ...process.env, HOME: home, USERPROFILE: home } : process.env;
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [script || giteaPreflightScript, ...args], { encoding: 'utf8', env });
  if (result.error) throw result.error;
  let json = null;
  try { json = JSON.parse(result.stdout); } catch (_) { json = null; }
  return { status: result.status, stdout: result.stdout, json };
}

// Cases 1, 2, 5 (#266), re-expressed for #1101: a clean scope passes with nothing installed;
// residue refuses with the installer as its repair; autofix runs that installer; a refusal never
// falls back to a local mode.
function testGiteaPreflight266() {
  // #571: hermetic HOME — every preflight call reads an empty temp HOME, never the developer's.
  const emptyHomegt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-hermetic-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-preflight-'));
  const pf = args => runGiteaPreflight(args, emptyHomegt);
  const readOnly = ['--project-root', root, '--no-autofix', '--json'];
  const configPath = path.join(root, '.codex', 'config.toml');
  // A user-owned [agents.<name>] table outside the managed markers is the user's, never residue.
  const origConfig = '[agents.my-reviewer]\ndescription = "user-owned reviewer"\nconfig_file = "./agents/my-reviewer.toml"\n';
  try {
    // Project-scoped Codex layers are ignored until the project is explicitly trusted: an untrusted
    // layer's config never enters the effective runtime (and is not a refusal).
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '[features.multi_agent_v2]\nenabled = true\n');
    let r = pf(readOnly);
    assert.strictEqual(r.status, 0,
      '#266 gt trust guard: an untrusted project layer is ignored, not refused, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.project_trust, 'unknown', '#266 gt trust guard: expected unknown trust, got ' + r.json.project_trust);
    assert.strictEqual(r.json.multi_agent_v2_enabled, false,
      '#266 gt trust guard: the untrusted layer\'s multi_agent_v2 must not load');
    assert.ok(!r.json.effective_config_paths.includes(configPath),
      '#266 gt trust guard: the untrusted layer must not be an effective config path: ' + JSON.stringify(r.json.effective_config_paths));
    trustCodexProject(emptyHomegt, root);
    r = pf(readOnly);
    assert.strictEqual(r.status, 0, '#266 gt trust guard: trusted layer must pass, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.project_trust, 'trusted', '#266 gt trust guard: expected trusted, got ' + r.json.project_trust);
    assert.ok(r.json.multi_agent_v2_enabled === true && r.json.effective_config_paths.includes(configPath),
      '#266 gt trust guard: once trusted, the project layer loads');
    enableMultiAgentV2(emptyHomegt);

    // --- GREEN: a clean trusted scope passes with nothing installed ---
    fs.writeFileSync(configPath, origConfig);
    r = pf(readOnly);
    assert.strictEqual(r.status, 0,
      '#266 gt case1 RED-discriminator: clean fixture must exit 0, got ' + r.status + '\n' + r.stdout);
    assert.ok(r.json.status === 'ok' && r.json.autofixed === false,
      '#266 gt case1 RED-discriminator: clean fixture must return status:ok, got ' + JSON.stringify(r.json));

    function configWithV2Enabled(extraLines) {
      return '[features.multi_agent_v2]\nenabled = true\n' + (extraLines ? extraLines + '\n' : '') + '\n' + origConfig;
    }
    // #775/#1101: dispatch mode is binary and REPORTED — V2 on is v2-task-name, V2 off is null (there
    // is no v1 fallback), and neither is a refusal: subagent dispatch belongs to the host.
    function assertDispatchModeForConfig(body, expectedEnabled, label, checkDoctor) {
      fs.writeFileSync(configPath, body);
      const result = pf(readOnly);
      assert.strictEqual(result.status, 0,
        label + ': dispatch mode is a reported host fact, never a refusal, got ' + result.status + '\n' + result.stdout);
      assert.strictEqual(result.json.status, 'ok', label + ': status');
      assert.strictEqual(result.json.multi_agent_v2_enabled, expectedEnabled, label + ': multi_agent_v2_enabled');
      assert.strictEqual(result.json.dispatch_mode, expectedEnabled ? 'v2-task-name' : null,
        label + ': dispatch_mode must be v2-task-name when V2 is on and null when off (no v1 fallback)');
      if (checkDoctor) {
        const doctor = pf(['--doctor', '--project-root', root, '--json']);
        assert.strictEqual(doctor.status, 0, label + ': doctor must pass, got ' + doctor.status + '\n' + doctor.stdout);
        const projectScope = doctor.json.scopes.find(s => s.scope === 'project');
        assert.ok(projectScope && projectScope.dispatch_mode === (expectedEnabled ? 'v2-task-name' : null),
          label + ': doctor project scope dispatch_mode, got ' + JSON.stringify(projectScope));
      }
    }
    // NOTE: this fixture's HOME layer has V2 enabled — a project layer that does NOT set `enabled`
    // inherits HOME's true; only an EXPLICIT project-layer `enabled = false` overrides it.
    assertDispatchModeForConfig(origConfig, true, '#775 gt no project-layer V2 table -> inherits enabled=true from HOME', false);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, false,
      '#1101 gt project layer explicitly overrides enabled=false -> reported, exit 0', true);
    assertDispatchModeForConfig(configWithV2Enabled(), true, '#775 gt [features.multi_agent_v2] enabled = true', true);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, false,
      '#775 gt warning suppression alone must not enable v2', false);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\nmulti_agent_v2 = true\n\n' + origConfig, false,
      '#775 gt a retired top-level multi_agent_v2 key is not read (no more [features] grammar)', false);

    // #598 AC2 gt: effort-gated dispatch POSTURE (distinct from dispatch_mode). Report-only: every
    // posture — 'none' included, now that V2 off is no refusal — exits 0.
    function assertDispatchPostureForConfig(body, expectedPosture, label) {
      fs.writeFileSync(configPath, body);
      const result = pf(readOnly);
      assert.strictEqual(result.status, 0,
        label + ': dispatch-posture WARN must never fail preflight, got ' + result.status + '\n' + result.stdout);
      assert.strictEqual(result.json.dispatch_posture, expectedPosture,
        label + ': expected dispatch_posture ' + expectedPosture + ', got ' + result.json.dispatch_posture);
      assert.strictEqual(result.json.dispatch_posture_warning === null, expectedPosture === 'proactive',
        label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(result.json.dispatch_posture_warning));
    }
    assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 gt base fixture (V2 enabled via HOME layer, no effort)');
    assertDispatchPostureForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, 'none',
      '#1101 gt V2 off -> posture none is reported and passes');
    assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
      '#598 gt effort=ultra with V2 enabled -> proactive');
    assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
      '#598 gt effort=xhigh (below ultra) stays explicitRequestOnly');
    assertDispatchPostureForConfig(configWithV2Enabled(), 'explicitRequestOnly',
      '#775 gt V2 enabled at the project layer too, no effort -> explicitRequestOnly');
    assertDispatchPostureForConfig(configWithV2Enabled('model_reasoning_effort = "ultra"'), 'explicitRequestOnly',
      '#775 gt effort INSIDE a table is not a TOML root key -> ignored');

    // --- Case 1 RED (#1101): the managed block an earlier release wrote is retired-role residue,
    // named by path, with the exact scoped installer command as the repair; --no-autofix writes nothing.
    const blockConfig = origConfig + '\n' + releasedCodexBlock();
    fs.writeFileSync(configPath, blockConfig);
    r = pf(readOnly);
    assert.strictEqual(r.status, 1, '#266 gt case1: a managed block must exit 1, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.status, 'retired_role_residue', '#266 gt case1: must return retired_role_residue, got ' + r.json.status);
    assert.deepStrictEqual(r.json.residue_paths, [configPath], '#266 gt case1: residue_paths must name the config');
    assert.ok(r.json.residue.length === 1 && r.json.residue[0].managed_block === 'present' && r.json.safe_autofix === true,
      '#266 gt case1: one project scope with a present, safely autofixable block, got ' + JSON.stringify(r.json.residue));
    assert.ok(r.json.repair.includes(`node ${installProfilesScript} ${root}`),
      '#266 gt case1: repair must name the exact scoped installer command, got ' + r.json.repair);
    assert.strictEqual(fs.readFileSync(configPath, 'utf8'), blockConfig, '#266 gt case1: --no-autofix must not write');

    // An unbalanced marker pair is a manual repair: reported unsafe, and autofix refuses before
    // any installer run (exit 4 autofix_unsafe) with the config untouched.
    const unbalanced = origConfig + '\n' + KW_AGENTS_BEGIN + '\n[agents.implementer]\nconfig_file = "./agents/kaola-workflow/implementer.toml"\n';
    fs.writeFileSync(configPath, unbalanced);
    r = pf(readOnly);
    assert.ok(r.status === 1 && r.json.residue[0].managed_block === 'invalid' && r.json.safe_autofix === false,
      '#1101 gt: unbalanced markers are residue that is not safe to autofix, got ' + r.stdout);
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 4, '#1101 gt: autofix over unbalanced markers must exit 4, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.status, 'autofix_unsafe', '#1101 gt: status autofix_unsafe, got ' + r.json.status);
    assert.strictEqual(fs.readFileSync(configPath, 'utf8'), unbalanced, '#1101 gt: autofix_unsafe must not write the config');

    // --- Case 1 GREEN (autofix): the installer retires a released install, the user's table stays. ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-preflight-autofix-'));
    try {
      trustCodexProject(emptyHomegt, autofixRoot);
      fs.mkdirSync(path.join(autofixRoot, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(autofixRoot, '.codex', 'config.toml'), origConfig);
      const planted = plantReleasedCodexScope(autofixRoot);
      r = runGiteaPreflight(['--project-root', autofixRoot, '--json'], emptyHomegt);
      assert.strictEqual(r.status, 0,
        '#266 gt case1 autofix: must exit 0 after repair, got ' + r.status + '\n' + r.stdout);
      assert.ok(r.json.status === 'ok' && r.json.autofixed === true,
        '#266 gt case1 autofix: must return ok+autofixed:true, got ' + JSON.stringify(r.json));
      for (const file of [...planted.profiles, planted.record, planted.configPath]) {
        assert.ok(r.json.autofixed_residue_paths.includes(file), '#1101 gt autofix: must report ' + file);
      }
      assert.ok(!fs.existsSync(planted.agentsDir), '#1101 gt autofix: the Kaola-owned profile dir must be gone');
      const repaired = fs.readFileSync(planted.configPath, 'utf8');
      assert.ok(!repaired.includes(KW_AGENTS_BEGIN) && repaired.includes('[agents.my-reviewer]'),
        '#1101 gt autofix: the managed block goes, the user-owned table stays: ' + repaired);
    } finally {
      fs.rmSync(autofixRoot, { recursive: true, force: true });
    }

    // --- Case 2 RED (#1101): a planted agents/kaola-workflow/implementer.toml is residue ---
    fs.writeFileSync(configPath, origConfig);
    const kaolaAgentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
    const wpToml = path.join(kaolaAgentsDir, 'implementer.toml');
    fs.mkdirSync(kaolaAgentsDir, { recursive: true });
    fs.writeFileSync(wpToml, 'name = "implementer"\n');
    r = pf(readOnly);
    assert.strictEqual(r.status, 1, '#266 gt case2: planted implementer.toml must exit 1, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.status, 'retired_role_residue', '#266 gt case2: must return retired_role_residue, got ' + r.json.status);
    assert.deepStrictEqual(r.json.residue[0].retired_profile_files, [wpToml], '#266 gt case2: retired_profile_files names implementer.toml');
    assert.ok(fs.existsSync(wpToml), '#266 gt case2: the preflight never deletes');

    // --- Case 5 RED: the refusal must NOT emit subagent-invoked or local-fallback (no silent fallback) ---
    assert.ok(!r.stdout.includes('subagent-invoked'),
      '#266 gt case5: preflight refusal must NOT emit subagent-invoked, got: ' + r.stdout);
    assert.ok(!r.stdout.includes('local-fallback'),
      '#266 gt case5: preflight refusal must NOT emit local-fallback, got: ' + r.stdout);

    // --- Case 2 GREEN: removed -> clean again. User files are never residue: a profile outside the
    // Kaola-owned dir (even under a retired role name), a non-retired name inside it, and the user's
    // [agents.*] tables.
    fs.unlinkSync(wpToml);
    fs.writeFileSync(path.join(root, '.codex', 'agents', 'my-reviewer.toml'), 'name = "my-reviewer"\n');
    fs.writeFileSync(path.join(root, '.codex', 'agents', 'implementer.toml'), 'name = "implementer"\n');
    fs.writeFileSync(path.join(kaolaAgentsDir, 'my-custom.toml'), 'name = "my-custom"\n');
    fs.writeFileSync(configPath, origConfig + '\n[agents.implementer]\nconfig_file = "./agents/implementer.toml"\n');
    r = pf(readOnly);
    assert.strictEqual(r.status, 0,
      '#266 gt case2 GREEN: user files and tables are never residue, got ' + r.status + '\n' + r.stdout);

    console.log('testGiteaPreflight266 (#266 cases 1,2,5 / #1101 residue): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(emptyHomegt, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #598 AC1 gt: installer dispatch-posture REPORT. ATTESTATION-STYLE / NON-FATAL — the installer
// REPORTS the effective posture and multi_agent_v2 state it reads and never writes either; this never
// changes the install's exit code, and stdout still ENDS with `status: ok` (#332 AC3 invariant).
// #1101: V2 off is reported as a host fact, not as a preflight requirement; the #601 remediation
// that steered users toward an ultra effort went with Kaola's roles (Kaola sets no model or effort).
// ---------------------------------------------------------------------------
function testGiteaDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-598-posture-proj-'));
  try {
    const freshEnv = { ...process.env, HOME: postureHome };
    const fresh = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: giteaPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(fresh.status, 0, '#598 gt AC1: fresh install must exit 0: ' + fresh.stderr);
    assert.strictEqual(fresh.stdout.trim().split('\n').pop(), 'status: ok',
      '#598 gt AC1: existing #332 AC3 "stdout ends with status: ok" invariant must be preserved: ' + fresh.stdout);
    assert.ok(stdoutHasLine(fresh.stdout, 'Kaola-Workflow Codex multi_agent_v2: not enabled'),
      '#1101 gt AC1: a fresh install must report multi_agent_v2 not enabled: ' + fresh.stdout);
    assert.ok(!/codex_multi_agent_v2_required/.test(fresh.stdout),
      '#1101 gt AC1: V2 off must not be framed as a preflight requirement: ' + fresh.stdout);
    assert.ok(/Kaola-Workflow Codex dispatch posture: none/.test(fresh.stdout),
      '#775 gt AC1: a fresh install with V2 off must report posture none: ' + fresh.stdout);
    assert.ok(/0\.145\.0/.test(fresh.stdout), '#775 gt AC2: the posture report must carry its Codex-version note: ' + fresh.stdout);
    assert.ok(!/set model_reasoning_effort|model_reasoning_effort\s*=\s*"ultra"/.test(fresh.stdout),
      '#1101 gt: the non-proactive note must not direct the user to set a model or effort: ' + fresh.stdout);
    assert.ok(!fs.existsSync(path.join(postureProj, '.codex')), '#1101 gt: reporting posture writes no project config');

    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    const userConfig = 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n';
    fs.mkdirSync(path.dirname(postureConfigPath), { recursive: true });
    fs.writeFileSync(postureConfigPath, userConfig);
    const reinstalled = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: giteaPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(reinstalled.status, 0, '#598 gt AC1: re-install with V2 enabled + effort=ultra must still exit 0: ' + reinstalled.stderr);
    assert.ok(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#775 gt AC1: v2 enabled + effort=ultra must report proactive posture: ' + reinstalled.stdout);
    // #842: the label reports STATE and must not credit the RETIRED key for it — the detector reads
    // features.multi_agent_v2, and `[agents] enabled = true` is not what enabled V2 here or anywhere.
    assert.ok(/Kaola-Workflow Codex multi_agent_v2: enabled/.test(reinstalled.stdout),
      '#775 gt AC1: enabled config must report multi_agent_v2 enabled: ' + reinstalled.stdout);
    assert.ok(!/multi_agent_v2: enabled \([^)]*\[agents\]/.test(reinstalled.stdout),
      '#842 gt AC1: ...and must NOT attribute it to [agents]: ' + reinstalled.stdout);
    assert.ok(!/refuse sub-agent spawns/.test(reinstalled.stdout),
      '#598 gt AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstalled.stdout);
    assert.strictEqual(fs.readFileSync(postureConfigPath, 'utf8'), userConfig,
      '#598/#1101 gt: the installer reports posture and never writes model_reasoning_effort or multi_agent_v2');

    console.log('testGiteaDispatchPosture598 (#598 AC1 installer report): PASSED');
  } finally {
    fs.rmSync(postureProj, { recursive: true, force: true });
    fs.rmSync(postureHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #571: global-first preflight gate (Gitea edition). #1101: nothing needs installing for any repo
// to pass; what the global scope still carries is residue, which no clean project masks.
// ---------------------------------------------------------------------------
function testGiteaPreflight571() {
  // --- Test (a): a clean HOME passes every repo — V2 off is reported, not refused ---
  const tempHome571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571a-home-'));
  try {
    const env571a = { HOME: tempHome571a, USERPROFILE: tempHome571a };
    // The positional "$HOME" install form still works and leaves no role content behind.
    runInstallProfiles(tempHome571a, env571a);
    assert.ok(!fs.existsSync(path.join(tempHome571a, '.codex', 'agents')),
      '#1101 gt test(a): installing to HOME must write no agents/ content');

    const emptyProject571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571a-proj-'));
    try {
      const r = runGiteaPreflight(['--project-root', emptyProject571a, '--no-autofix', '--json'], tempHome571a);
      assert.strictEqual(r.status, 0,
        '#571 gt test(a): a clean HOME with V2 off must pass preflight, got ' + r.status + '\n' + r.stdout);
      assert.strictEqual(r.json.status, 'ok', '#571 gt test(a): status must be ok, got ' + r.json.status);
      assert.ok(r.json.multi_agent_v2_enabled === false && r.json.dispatch_mode === null && r.json.dispatch_posture === 'none',
        '#1101 gt test(a): V2 off must be reported (false/null/none), got ' + JSON.stringify(r.json));
      assert.strictEqual(r.json.scopes_checked[0], path.join(tempHome571a, '.codex'),
        '#571 gt test(a): the global scope must be checked first, got ' + JSON.stringify(r.json.scopes_checked));
      assert.ok(!fs.existsSync(path.join(emptyProject571a, '.codex')),
        '#571 gt test(a): no project .codex must be created');
    } finally {
      fs.rmSync(emptyProject571a, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571a, { recursive: true, force: true });
  }

  // --- Test (b): a global ownership record alone is residue — FAILS CLOSED with the --global repair ---
  const tempHome571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571b-home-'));
  const emptyProject571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571b-proj-'));
  try {
    const recordPath = path.join(tempHome571b, '.codex', 'agents', 'kaola-workflow', '.kaola-managed-profiles.json');
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    fs.writeFileSync(recordPath, '{"schema_version":1,"files":{}}\n');
    const r = runGiteaPreflight(['--project-root', emptyProject571b, '--no-autofix', '--json'], tempHome571b);
    assert.strictEqual(r.status, 1, '#571 gt test(b): global residue must fail closed, got exit ' + r.status + '\n' + r.stdout);
    assert.strictEqual(r.json.status, 'retired_role_residue', '#571 gt test(b): status, got ' + r.json.status);
    assert.ok(r.json.residue.length === 1 && r.json.residue[0].scope === 'global'
      && r.json.residue[0].residue_paths.length === 1 && r.json.residue[0].residue_paths[0] === recordPath,
      '#1101 gt test(b): the global scope names the record, got ' + JSON.stringify(r.json.residue));
    assert.ok(r.json.repair.includes(`node ${installProfilesScript} --global`),
      '#1101 gt test(b): the global repair is the --global installer, got ' + r.json.repair);
  } finally {
    fs.rmSync(tempHome571b, { recursive: true, force: true });
    fs.rmSync(emptyProject571b, { recursive: true, force: true });
  }

  // --- Test (c): a released global install does NOT short-circuit; autofix retires it via --global ---
  const tempHome571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571c-home-'));
  try {
    const planted = plantReleasedCodexScope(tempHome571c);
    const emptyProject571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571c-proj-'));
    try {
      let r = runGiteaPreflight(['--project-root', emptyProject571c, '--no-autofix', '--json'], tempHome571c);
      assert.strictEqual(r.status, 1,
        '#571 gt test(c): a released global install must not short-circuit, got exit ' + r.status);
      r = runGiteaPreflight(['--project-root', emptyProject571c, '--json'], tempHome571c);
      assert.ok(r.status === 0 && r.json.autofixed === true,
        '#1101 gt test(c): autofix must retire the global install, got ' + r.status + '\n' + r.stdout);
      assert.ok(!fs.existsSync(planted.agentsDir) && !fs.readFileSync(planted.configPath, 'utf8').includes(KW_AGENTS_BEGIN),
        '#1101 gt test(c): the global profiles and block must be gone');
    } finally {
      fs.rmSync(emptyProject571c, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571c, { recursive: true, force: true });
  }

  // --- Test (a2): --global installer flag targets os.homedir() ---
  const tempHome571flag = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571flag-home-'));
  try {
    const envFlag = { HOME: tempHome571flag, USERPROFILE: tempHome571flag };
    const planted = plantReleasedCodexScope(tempHome571flag);
    const globalFlagInstall = runInstallProfiles('--global', envFlag);
    const implementer = path.join(planted.agentsDir, 'implementer.toml');
    assert.ok(!fs.existsSync(implementer) && stdoutHasLine(globalFlagInstall.stdout, RETIRED_REMOVED(implementer)),
      '#571 gt test(a2): --global must retire the profiles under tempHome/.codex: ' + globalFlagInstall.stdout);
    assert.ok(fs.existsSync(path.join(tempHome571flag, '.codex', 'hooks.json')),
      '#571 gt test(a2): --global must install the hooks into tempHome/.codex');
  } finally {
    fs.rmSync(tempHome571flag, { recursive: true, force: true });
  }

  console.log('testGiteaPreflight571 (#571 global-scope gate): PASSED');
}

// ---------------------------------------------------------------------------
// #332/#1101: installer retirement — Gitea edition mirror. The installer ships no profile (AC3); an
// upgrade retires exactly what the ownership record or the released catalog proves Kaola wrote (AC4);
// a re-run is idempotent (AC5); every file without that proof is preserved and reported (AC6).
// ---------------------------------------------------------------------------
function testInstallRetirement332Gitea() {
  // AC3: fresh install — nothing in the project scope, nothing to retire, sentinel last.
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-fresh-'));
  try {
    const r = runInstallProfiles(fresh);
    assert.ok(!fs.existsSync(path.join(fresh, '.codex')),
      '#1101 gt AC3: a fresh install must write no profile, record, or config into the project');
    assert.ok(!/Removed retired|Preserved retired/.test(r.stdout), '#1101 gt AC3: nothing to retire: ' + r.stdout);
    assert.strictEqual(r.stdout.trim().split('\n').pop(), 'status: ok', '#332 gt AC3: stdout must end with status: ok');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // AC4: upgrade over the last role-shipping release, with user content and two unproven files.
  const upgrade = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-upgrade-'));
  try {
    const codexDir = path.join(upgrade, '.codex');
    fs.mkdirSync(path.join(codexDir, 'agents'), { recursive: true });
    const userConfig = '[features]\ngoals = true\n\n[agents.my-reviewer]\ndescription = "user-owned"\nconfig_file = "./agents/my-reviewer.toml"\n';
    fs.writeFileSync(path.join(codexDir, 'config.toml'), userConfig);
    const userProfile = path.join(codexDir, 'agents', 'my-reviewer.toml');
    fs.writeFileSync(userProfile, 'name = "my-reviewer"\n');
    const planted = plantReleasedCodexScope(upgrade);
    const edited = path.join(planted.agentsDir, 'code-reviewer.toml');
    fs.appendFileSync(edited, '\n# edited by the user\n');
    const unrecorded = path.join(planted.agentsDir, 'docs-lookup.toml');
    fs.writeFileSync(unrecorded, 'developer_instructions = """retired role body"""\n');

    const r = runInstallProfiles(upgrade);
    for (const file of planted.profiles.filter(f => f !== edited)) {
      assert.ok(!fs.existsSync(file) && stdoutHasLine(r.stdout, RETIRED_REMOVED(file)),
        '#1101 gt AC4: a recorded released profile is removed and reported: ' + file + '\n' + r.stdout);
    }
    assert.ok(!fs.existsSync(planted.record) && stdoutHasLine(r.stdout, RETIRED_RECORD_REMOVED(planted.record)),
      '#1101 gt AC4: the ownership record is retired once read');
    assert.ok(stdoutHasLine(r.stdout, RETIRED_REGISTRATIONS_REMOVED(planted.configPath)),
      '#1101 gt AC4: the released registration block is removed and reported: ' + r.stdout);
    const cfg = fs.readFileSync(planted.configPath, 'utf8');
    assert.ok(!cfg.includes(KW_AGENTS_BEGIN) && !cfg.includes('[agents.code-explorer]'),
      '#1101 gt AC4: no managed block or role registration survives: ' + cfg);
    assert.ok(cfg.startsWith(userConfig), '#1101 gt AC4: the user-owned config survives byte-for-byte: ' + cfg);
    assert.ok(fs.existsSync(userProfile), '#1101 gt AC4: a user profile outside the Kaola dir is untouched');
    assert.ok(fs.readFileSync(edited, 'utf8').endsWith('# edited by the user\n')
      && stdoutHasLine(r.stdout, RETIRED_PRESERVED('modified_since_install', edited)),
      '#1101 gt AC4: an edited profile is preserved and reported: ' + r.stdout);
    assert.ok(fs.existsSync(unrecorded) && stdoutHasLine(r.stdout, RETIRED_PRESERVED('no_ownership_record', unrecorded)),
      '#332/#1101 gt AC4: an unrecorded retired-name file is preserved and reported: ' + r.stdout);
    assert.strictEqual(r.stdout.trim().split('\n').pop(), 'status: ok', '#332 gt AC4: stdout must end with status: ok');

    // AC5: idempotency — nothing more is removed, config bytes are stable, the preserved stay preserved.
    const again = runInstallProfiles(upgrade);
    assert.ok(!/Removed retired/.test(again.stdout), '#332 gt AC5: a re-run removes nothing: ' + again.stdout);
    assert.strictEqual(fs.readFileSync(planted.configPath, 'utf8'), cfg, '#332 gt AC5: config bytes stable');
    assert.ok(fs.existsSync(edited) && fs.existsSync(unrecorded)
      && stdoutHasLine(again.stdout, RETIRED_PRESERVED('no_ownership_record', edited))
      && stdoutHasLine(again.stdout, RETIRED_PRESERVED('no_ownership_record', unrecorded)),
      '#332 gt AC5: the preserved files are still preserved and reported: ' + again.stdout);
  } finally {
    fs.rmSync(upgrade, { recursive: true, force: true });
  }

  // AC6: an unknown user TOML in the Kaola dir is preserved + reported.
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-custom-'));
  try {
    const agentsDir = path.join(custom, '.codex', 'agents', 'kaola-workflow');
    fs.mkdirSync(agentsDir, { recursive: true });
    const mine = path.join(agentsDir, 'my-custom.toml');
    fs.writeFileSync(mine, 'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const r = runInstallProfiles(custom);
    assert.ok(fs.existsSync(mine), '#332 gt AC6: user TOML survives');
    assert.ok(stdoutHasLine(r.stdout, RETIRED_PRESERVED('no_ownership_record', mine)),
      '#332 gt AC6: stdout reports the preserved user TOML: ' + r.stdout);
  } finally {
    fs.rmSync(custom, { recursive: true, force: true });
  }

  console.log('testInstallRetirement332Gitea (#332 AC3-AC6 / #1101 retirement): PASSED');
}

// ---------------------------------------------------------------------------
// #332/#1101: preflight residue / autofix / doctor (AC7-AC11) — Gitea edition mirror.
// ---------------------------------------------------------------------------
function testGiteaPreflight332() {
  const pf = args => runGiteaPreflight(args);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-preflight-'));
  try {
    trustCodexProject(kwSandboxHome, root);
    const planted = plantReleasedCodexScope(root);
    const readOnly = ['--project-root', root, '--no-autofix', '--json'];

    // AC7: a user-edited released profile is still residue by name; autofix hands it to the
    // installer, which preserves it (no ownership proof), so the re-verification still refuses as
    // residue (exit 1, autofix_attempted) — and the preflight neither deletes nor "restores" those bytes.
    const edited = path.join(planted.agentsDir, 'code-reviewer.toml');
    fs.appendFileSync(edited, '\n# edited by the user\n');
    const editedBytes = fs.readFileSync(edited);
    let r = pf(readOnly);
    assert.ok(r.status === 1 && r.json.status === 'retired_role_residue',
      '#332 gt AC7: a released install must refuse as retired_role_residue, got ' + r.status + '\n' + r.stdout);
    for (const file of [...planted.profiles, planted.record, planted.configPath]) {
      assert.ok(r.json.residue_paths.includes(file), '#332 gt AC7: residue_paths must name ' + file);
    }
    assert.ok(r.json.repair.includes(`node ${installProfilesScript} ${root}`),
      '#332 gt AC7: project repair must name the exact scoped installer command, got ' + r.json.repair);
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 1, '#1101 gt AC7: autofix that leaves a preserved file must exit 1, got ' + r.status + '\n' + r.stdout);
    assert.ok(r.json.status === 'retired_role_residue' && r.json.autofix_attempted === true
      && r.json.residue_paths.length === 1 && r.json.residue_paths[0] === edited,
      '#1101 gt AC7: the re-verification names only the preserved file, got ' + r.stdout);
    assert.ok(fs.readFileSync(edited).equals(editedBytes), '#1101 gt AC7: the edited file is neither deleted nor restored');
    for (const file of planted.profiles.filter(f => f !== edited)) {
      assert.ok(!fs.existsSync(file), '#1101 gt AC7: the proven profiles are retired by the autofix run: ' + file);
    }

    // AC8: once the user removes it, the scope is clean.
    fs.unlinkSync(edited);
    r = pf(readOnly);
    assert.ok(r.status === 0 && r.json.status === 'ok', '#332 gt AC8: clean scope passes, got ' + r.stdout);

    // AC7b: any retired role name in the Kaola dir is residue — docs-lookup included.
    const docsLookup = path.join(planted.agentsDir, 'docs-lookup.toml');
    fs.mkdirSync(planted.agentsDir, { recursive: true });
    fs.writeFileSync(docsLookup, 'name = "docs-lookup"\n');
    r = pf(readOnly);
    assert.ok(r.status === 1 && r.json.residue[0].retired_profile_files.includes(docsLookup),
      '#332 gt AC7b: retired_profile_files lists docs-lookup, got ' + r.stdout);
    fs.unlinkSync(docsLookup);

    // A future-schema ownership record is still residue by name — no profile-schema gate (exit 6) remains.
    fs.writeFileSync(planted.record, JSON.stringify({ schema_version: 2, files: {} }));
    r = pf(readOnly);
    assert.ok(r.status === 1 && r.json.residue_paths.includes(planted.record),
      '#1101 gt: a future-schema record is residue (exit 1), got ' + r.status + '\n' + r.stdout);
    fs.unlinkSync(planted.record);

    // AC9: an edited managed block (a retired role injected) is residue; doctor reports it
    // read-only; autofix leaves an edited block to the user (exit 1, autofix_attempted), bytes untouched.
    const cleanConfig = fs.readFileSync(planted.configPath, 'utf8');
    const editedBlock = cleanConfig + '\n' + releasedCodexBlock().replace(
      '# END kaola-workflow agents',
      '[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n\n# END kaola-workflow agents');
    fs.writeFileSync(planted.configPath, editedBlock);
    r = pf(readOnly);
    assert.ok(r.status === 1 && r.json.residue[0].managed_block === 'present',
      '#332 gt AC9: an edited managed block must be residue, got ' + r.stdout);
    const managedDoctor = pf(['--doctor', '--project-root', root, '--json']);
    const managedProjectScope = managedDoctor.json.scopes.find(s => s.scope === 'project');
    assert.ok(managedDoctor.status === 1 && managedDoctor.json.status === 'stale' && managedProjectScope
      && managedProjectScope.retired_role_residue === true && managedProjectScope.managed_block === 'present'
      && managedProjectScope.read_only === true,
      '#332 gt AC9: doctor must report the project block read-only, got ' + managedDoctor.stdout);
    assert.ok(managedProjectScope.repair.includes(`node ${installProfilesScript} ${root}`),
      '#332 gt AC9: doctor names the exact scoped installer command');
    r = pf(['--project-root', root, '--json']);
    assert.ok(r.status === 1 && r.json.status === 'retired_role_residue' && r.json.autofix_attempted === true
      && r.json.residue_paths.length === 1 && r.json.residue_paths[0] === planted.configPath,
      '#1101 gt AC9: autofix must leave an edited block to the user, got ' + r.status + '\n' + r.stdout);
    assert.strictEqual(fs.readFileSync(planted.configPath, 'utf8'), editedBlock,
      '#1101 gt AC9: neither the doctor nor the installer rewrites an edited block');
    fs.writeFileSync(planted.configPath, cleanConfig);

    // doctor AC10/AC11. The HOME is realpath'd so the plugin-cache identity check below sees the
    // same path the preflight's own __dirname resolves to.
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-doctor-home-')));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-doctor-proj-'));
    try {
      const userPlanted = plantReleasedCodexScope(home);
      trustCodexProject(home, proj);
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 1, '#332 gt AC10: doctor exit 1 on user-scope residue');
      const userScope = r.json.scopes.find(s => s.scope === 'user');
      const projectScope = r.json.scopes.find(s => s.scope === 'project');
      assert.ok(userScope.retired_role_residue === true
        && userScope.residue_paths.includes(path.join(userPlanted.agentsDir, 'implementer.toml')),
        '#332 gt AC10: user scope reports the retired profiles, got ' + JSON.stringify(userScope));
      assert.ok(userScope.repair.includes(`HOME=${home} node ${installProfilesScript} --global`),
        '#332 gt AC10: user scope repair must be the exact --global installer command, got ' + userScope.repair);
      assert.ok(projectScope.retired_role_residue === false && projectScope.repair === null,
        '#332 gt AC10: a clean project scope carries no repair');
      assert.ok(fs.existsSync(userPlanted.agentsDir), '#332 gt AC10: doctor is read-only');
      runInstallProfiles('--global', { HOME: home, USERPROFILE: home });
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.ok(r.status === 0 && r.json.status === 'ok' && r.json.retired_role_residue === false,
        '#332 gt AC10: doctor exit 0 when both scopes are clean, got ' + r.stdout);

      // AC11: a plugin-cache copy reports its marketplace/name/version identity; a cache path
      // whose version is not the manifest's is plugin_identity_invalid (exit 2).
      const pluginIdentity = JSON.parse(fs.readFileSync(
        path.join(giteaPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      function cachedPreflight(version) {
        const cacheRoot = path.join(home, '.codex', 'plugins', 'cache', 'm', pluginIdentity.name, version);
        fs.mkdirSync(path.join(cacheRoot, 'scripts'), { recursive: true });
        for (const file of ['kaola-workflow-codex-preflight.js', 'kaola-workflow-adaptive-schema.js']) {
          fs.copyFileSync(path.join(giteaPluginRoot, 'scripts', file), path.join(cacheRoot, 'scripts', file));
        }
        fs.cpSync(path.join(giteaPluginRoot, '.codex-plugin'), path.join(cacheRoot, '.codex-plugin'), { recursive: true });
        return path.join(cacheRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
      }
      const doctorArgs = ['--doctor', '--home', home, '--project-root', proj, '--json'];
      r = runGiteaPreflight(doctorArgs, null, cachedPreflight(pluginIdentity.version));
      assert.strictEqual(r.status, 0, '#332 gt AC11: a matching plugin cache must pass doctor, got ' + r.stdout);
      assert.deepStrictEqual(r.json.plugin, { name: pluginIdentity.name, version: pluginIdentity.version },
        '#332 gt AC11: doctor reports the cached plugin identity');
      r = runGiteaPreflight(doctorArgs, null, cachedPreflight('0.0.0-not-the-manifest'));
      assert.ok(r.status === 2 && r.json.status === 'plugin_identity_invalid'
        && /plugin_manifest_version_mismatch/.test(r.json.error),
        '#332 gt AC11: a mismatched cache version must be plugin_identity_invalid, got ' + r.status + '\n' + r.stdout);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }

    console.log('testGiteaPreflight332 (#332 AC7-AC11 / #1101 residue): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}


// Case 4: compact/resume packet (gitea edition)
function testGiteaCompactResume266() {
  const repoRoot = path.resolve(giteaPluginRoot, '..', '..');
  const routing = require(path.join(repoRoot, 'scripts', 'generate-routing-surfaces.js'));
  const promptPath = path.join(giteaPluginRoot, 'hooks', 'kaola-workflow-codex-compact-recovery.md');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  assert.strictEqual(prompt, routing.renderCompactRecoveryPrompt('codex', 'gitea'),
    '#1044 gt case4: installed prompt must equal its generation-time runtime rendering');
  assert.ok(prompt.includes('Recovery marker: `KW-COMPACT-RECOVERY-V2`.')
    && prompt.includes('already carries the full runtime dispatch contract')
    && !prompt.includes('KW-RUNTIME-DISPATCH-START')
    && /completely reload the installed Workflow\s+Next prompt/.test(prompt)
    && /completely\s+reload the installed Kaola-Workflow Finalization prompt/.test(prompt),
    '#1044 gt case4: static prompt must carry continuation and the dispatch deferral pointer (codex recovery defers dispatch to the full reload)');
  assert.ok(!/\bnode\b|\.js\b|PreToolUse|PostToolUse/.test(prompt),
    '#1044 gt case4: compact recovery must not execute JS or inject around tool use');
  console.log('testGiteaCompactResume266 (#1044 static prompt): PASSED');
}

function testForbiddenOnly341() {
  const validatorScript = path.join(__dirname, 'validate-kaola-workflow-gitea-contracts.js');
  const validatorSrc = fs.readFileSync(validatorScript, 'utf8');
  const idx = (needle) => validatorSrc.indexOf(needle);

  // (AC2) order pin: the forbidden-token scan loop call must precede every count assertion.
  const scanIdx = idx('assertNoForbidden(file);');
  assert.ok(scanIdx !== -1, '#341 gt: validator must contain the assertNoForbidden(file); scan loop');
  // Needles carry the `assert(` prefix so they match the real count assertions, not a
  // `.length ===` substring inside the #341 scan-loop comment. The agent-profile count assertion
  // went with the profiles themselves (#1101: the plugin ships no agents/), so the ordering
  // property is pinned on the two surface counts that remain.
  for (const countNeedle of [
    'assert(commandFiles.length ===', 'assert(skillFiles.length ==='
  ]) {
    const countIdx = idx(countNeedle);
    assert.ok(countIdx !== -1, '#341 gt: validator must contain count assert ' + countNeedle);
    assert.ok(scanIdx < countIdx,
      '#341 gt: forbidden scan must precede count assert ' + countNeedle);
  }

  // (AC1) dirty file → exit 1, message naming a forbidden reference.
  const root = tempRoot('kw-gt-forbidden-');
  try {
    const dirty = path.join(root, 'dirty.toml');
    fs.writeFileSync(dirty, 'Use ' + 'g' + 'lab' + ' to list issues\n');
    const dirtyRun = spawnSync(process.execPath, [validatorScript, '--forbidden-only', dirty], {
      encoding: 'utf8'
    });
    assert.notStrictEqual(dirtyRun.status, 0, '#341 gt: forbidden token must exit non-zero');
    assert.ok((dirtyRun.stderr || '').includes('contains forbidden reference'),
      '#341 gt: forbidden-only must report "contains forbidden reference"');

    // clean file → exit 0, sentinel. issue-scout.toml (the original #328 leak regression
    // lock) is retired (#789), and so is every agent profile (#1101); the generated Codex
    // compact-recovery prompt is a permanent, forge-vocabulary-free file the validator's own hook
    // scan covers. Root-relative path resolves from any cwd.
    const cleanRun = spawnSync(process.execPath,
      [validatorScript, '--forbidden-only', 'plugins/kaola-workflow-gitea/hooks/kaola-workflow-codex-compact-recovery.md'],
      { encoding: 'utf8' });
    assert.strictEqual(cleanRun.status, 0,
      '#341 gt: clean file must exit 0 (stderr: ' + (cleanRun.stderr || '') + ')');
    assert.ok((cleanRun.stdout || '').includes('forbidden-only check passed'),
      '#341 gt: clean run must print the forbidden-only sentinel');

    // usage refusals → exit 2 (fail closed): no files, and an unknown flag.
    const noFiles = spawnSync(process.execPath, [validatorScript, '--forbidden-only'], {
      encoding: 'utf8'
    });
    assert.strictEqual(noFiles.status, 2, '#341 gt: --forbidden-only with no files must exit 2');
    const unknownFlag = spawnSync(process.execPath,
      [validatorScript, '--forbidden' + '_only'], { encoding: 'utf8' });
    assert.strictEqual(unknownFlag.status, 2, '#341 gt: unknown flag must exit 2 (fail closed)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('testForbiddenOnly341 (#341): PASSED');
}

// #507: boundary-2 classifier fetch-retry tests (gitea edition)
// Tests use withForge to inject a throwing viewIssue stub that records call count.
function testGiteaBoundary2FetchRetry507() {
  // (a) persistent transient (spawn_fault) → classifyIssue returns verdict:indeterminate
  {
    let callCount = 0;
    const transientErr = new Error('spawn failed');
    transientErr.code = 'ENOENT';
    const root = tempRoot('kw-gt-b2a-root-');
    try {
      const result = withForge({ viewIssue: function() { callCount++; throw transientErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#507(gt-b2a): persistent transient → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(result.reasoning_class, 'classifier_error',
        '#507(gt-b2a): indeterminate must carry reasoning_class:classifier_error');
      assert.ok(callCount >= 3,
        '#507(gt-b2a): transient retried to MAX_ATTEMPTS — callCount=' + callCount + ' (expected >=3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b) clean_nonzero GENUINE-NEGATIVE (determinate) → verdict:target_unavailable, NOT retried.
  // #519 RECONCILE: a clean_nonzero stays determinate-refuse ONLY when its stderr is genuine-negative /
  // unrecognized — so this pin carries a real 404 stderr ("Could not resolve to an Issue").
  {
    let callCount = 0;
    const cleanErr = new Error('tea exited 1');
    cleanErr.status = 1;
    cleanErr.stderr = 'Could not resolve to an Issue with the number of 99.\n';
    const root = tempRoot('kw-gt-b2b-root-');
    try {
      const result = withForge({ viewIssue: function() { callCount++; throw cleanErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'target_unavailable',
        '#519(gt-b2b): genuine-negative clean_nonzero → verdict:target_unavailable (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 1,
        '#519(gt-b2b): determinate genuine NOT retried — callCount=' + callCount + ' (expected 1)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b-transient) clean_nonzero with a TRANSIENT-INFRA stderr now ESCALATES → indeterminate + RETRIED.
  {
    let callCount = 0;
    const root = tempRoot('kw-gt-b2t-root-');
    try {
      const result = withForge({ viewIssue: function() {
        callCount++;
        const e = new Error('tea exited 1');
        e.status = 1;
        e.stderr = 'error connecting to gitea.example: net/http: TLS handshake timeout\n';
        throw e;
      } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return classifier.classifyIssue(99, root); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#519(gt-b2-transient): clean_nonzero TLS-timeout stderr → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 3,
        '#519(gt-b2-transient): transient-infra clean_nonzero RETRIED to max — callCount=' + callCount + ' (expected 3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (c) forge claimExplicitTarget with transient classifyIssue → target_indeterminate result:answer
  // Exercises the #495 forward-compat handler in the gitea claim.js.
  {
    const root = tempRoot('kw-gt-b2c-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const transientErr = new Error('spawn failed');
      transientErr.code = 'ENOENT';
      const result = withForge({ viewIssue: function() { throw transientErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return claim.claimExplicitTarget(root, { targetIssue: 99 });
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result && result.status, 'target_indeterminate',
        '#507(gt-b2c): forge claimExplicitTarget persistent transient → target_indeterminate (got ' + JSON.stringify(result) + ')');
      assert.strictEqual(result && result.result, 'answer',
        '#507(gt-b2c): result must be answer (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (#511) END-TO-END determinate-refuse: a GENUINE-negative forge fault (a real 404 "Could not
  // resolve to an Issue" stderr) routes the FULL claim flow (claimExplicitTarget) to result:refuse /
  // target_unavailable — NEVER escalate. This is the #511 pin: it MUST use a genuine-negative stderr,
  // never a generic "tea exits 1" / bare network error (which now ESCALATES and would enshrine #519's
  // bug). Proves the genuine arm survives the axis replacement at the claim-flow boundary.
  {
    const root = tempRoot('kw-gt-511-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const result = withForge({ viewIssue: function() {
        const e = new Error('tea exited 1');
        e.status = 1; // clean non-zero
        e.stderr = 'Could not resolve to an Issue with the number of 99.\n';
        throw e;
      } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return claim.claimExplicitTarget(root, { targetIssue: 99 }); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result && result.status, 'target_unavailable',
        '#511(gt): genuine-negative 404 → claimExplicitTarget target_unavailable (got ' + JSON.stringify(result) + ')');
      assert.notStrictEqual(result && result.status, 'target_indeterminate',
        '#511(gt): a genuine-negative 404 is DETERMINATE — never the transient status (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testGiteaBoundary2FetchRetry507 (#507/#511/#519): PASSED');
}


testInstallRetirement332Gitea();
testGiteaPreflight266();
testGiteaDispatchPosture598();
testGiteaPreflight571();
testGiteaPreflight332();
testGiteaCompactResume266();
testForbiddenOnly341();
testGiteaBoundary2FetchRetry507();

// #725: the #543 installed_paths partition smoke is retired — the fast/full installer opt-ins
// (`--with-fast`/`--with-full`) and the seedKaolaConfig UNION writer that recorded them are gone;
// adaptive is the only installed path, so the installer never writes installed_paths.

// #579: forge active-folders liveness-marker fields regression — session_marker/claim_ts/main_root
// must be parsed from workflow-state.md and surfaced in readActiveFolders items so that
// classifyLane can bucket a live lane as 'mine' (not 'stale') in the gitea edition.
// RED against the unfixed gitea active-folders (session_marker not parsed → undefined →
// classifyLane falls through to stale). GREEN after the fix.
function testGiteaActiveFoldersSessionMarker579() {
  const root = tempRoot('kw-gt-sm579-');
  try {
    const ownSession = 's-MINE-session-579gt';
    const claimTs = new Date(Date.now() - 10000).toISOString();
    writeState(root, 'lane-mine-gt', 579,
      'session_marker: ' + ownSession + '\nmain_root: /repo/root\nclaim_ts: ' + claimTs);
    const folders = active.readActiveFolders(root, { excludeClosedIssues: false });
    assert.strictEqual(folders.length, 1, '#579(gt): expected 1 active folder');
    const item = folders[0];
    assert.strictEqual(item.session_marker, ownSession,
      '#579(gt): readActiveFolders item.session_marker must be "' + ownSession + '", got: ' + item.session_marker);
    const ctx = {
      ownSession,
      explicitResumeIssues: new Set(),
      coTenantSignal: false,
      now: Date.now(),
      staleMs: 3600000
    };
    const laneResult = classifier.classifyLane(item, ctx);
    assert.strictEqual(laneResult.bucket, 'mine',
      '#579(gt): classifyLane must yield mine for own session, got: ' + JSON.stringify(laneResult));
    console.log('testGiteaActiveFoldersSessionMarker579: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaActiveFoldersSessionMarker579();

// ── #1098 §2.2 — post-merge reconciliation of ARCHIVED sink: pr runs ─────────────────────────
// The standard PR path archives BEFORE the sink runs, so the live-folder loop never sees the run
// again. `reconciled[]` is the second face: it scans the MAIN checkout's archive band for archived
// `sink: pr` runs, reports each against actual forge state, and NEVER re-merges / re-creates / pushes
// the mainline / closes members by hand. Every block below FAILS on the pre-#1098 watcher because
// `reconciled` did not exist at all.
function gt1098WriteArchivedRun(root, project, issueNumber, opts) {
  const o = opts || {};
  const archDir = path.join(root, 'kaola-workflow', 'archive', project);
  fs.mkdirSync(archDir, { recursive: true });
  fs.writeFileSync(path.join(archDir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: closed',
    '',
    '## Gitea',
    'issue_number: ' + issueNumber,
    'full_name: group/project',
    'project_html_url: https://gitea.example/group/project',
    '',
    '## Sink',
    'branch: workflow/gitea-issue-' + issueNumber,
    'issue_number: ' + issueNumber,
    'sink: ' + (o.sink || 'pr'),
    'pr_url: ' + (o.prUrl || ('https://gitea.example/group/project/pulls/' + issueNumber)),
    'pr_number: ' + issueNumber,
    'worktree_path: ' + (o.worktreePath || ''),
    o.extra || ''
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(archDir, 'finalization-summary.md'), '# Finalization\n');
  return archDir;
}

function gt1098Stubs(extra) {
  return Object.assign({
    viewPullRequest(prNumber) { return { pr_number: prNumber, state: 'merged' }; },
    listPullRequests() { return []; },
    discoverProject() { return { full_name: 'group/project', html_url: 'https://gitea.example/group/project' }; },
    listIssueNotes() { return []; },
    updateIssue() { return null; },
    createIssueNote() { return { id: 1 }; }
  }, extra || {});
}

function testWatchPrReconcilesMergedArchivedRun() {
  const root = tempRoot('kw-gt-1098-recon-merged-');
  try {
    initGitRepo(root);
    gt1098WriteArchivedRun(root, 'issue-1098r1', 10981);
    const result = withForge(gt1098Stubs(), () => claim.watchMergeRequests(root, {}));
    assert(Array.isArray(result.reconciled),
      '#1098: watchMergeRequests must emit reconciled[], got: ' + JSON.stringify(Object.keys(result)));
    assert.strictEqual(result.reconciled.length, 1,
      '#1098: the archived merged run must appear exactly once, got: ' + JSON.stringify(result.reconciled));
    const entry = result.reconciled[0];
    assert.strictEqual(entry.folder, 'issue-1098r1');
    assert(['published', 'local_only'].indexOf(entry.archive) !== -1,
      '#1098: archive status must be published or local_only, got: ' + entry.archive);
    assert.strictEqual(result.watched, 0,
      '#1098: an archived run is not a live folder — watched must stay 0, got: ' + result.watched);
    console.log('testWatchPrReconcilesMergedArchivedRun: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWatchPrReconcilesOpenArchivedRunPending() {
  const root = tempRoot('kw-gt-1098-recon-open-');
  try {
    initGitRepo(root);
    gt1098WriteArchivedRun(root, 'issue-1098r2', 10982);
    const result = withForge(gt1098Stubs({
      viewPullRequest(prNumber) { return { pr_number: prNumber, state: 'open' }; }
    }), () => claim.watchMergeRequests(root, {}));
    const entry = (result.reconciled || []).find(e => e.folder === 'issue-1098r2');
    assert(entry, '#1098: an OPEN archived run must still be reported');
    assert.strictEqual(entry.publication, 'pending',
      '#1098: an OPEN PR is pending, not published, got: ' + entry.publication);
    console.log('testWatchPrReconcilesOpenArchivedRunPending: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWatchPrReconcilesClosedUnmergedArchivedRun() {
  const root = tempRoot('kw-gt-1098-recon-closed-');
  try {
    initGitRepo(root);
    gt1098WriteArchivedRun(root, 'issue-1098r3', 10983);
    const result = withForge(gt1098Stubs({
      viewPullRequest(prNumber) { return { pr_number: prNumber, state: 'closed' }; }
    }), () => claim.watchMergeRequests(root, {}));
    const entry = (result.reconciled || []).find(e => e.folder === 'issue-1098r3');
    assert(entry, '#1098: a CLOSED-unmerged archived run must be reported');
    assert.strictEqual(entry.publication, 'not_published',
      '#1098: a CLOSED-unmerged PR is not published, got: ' + entry.publication);
    assert.strictEqual(entry.reason, 'pr_closed_unmerged',
      '#1098: the reason must name the closed-unmerged class, got: ' + entry.reason);
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'issue-1098r3', 'workflow-state.md')),
      '#1098: reconciliation must not touch the archive');
    console.log('testWatchPrReconcilesClosedUnmergedArchivedRun: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWatchPrReconcileSkipsMergedSinkAndPlaceholder() {
  const root = tempRoot('kw-gt-1098-recon-skip-');
  try {
    initGitRepo(root);
    // A merge-sink run and an OFFLINE placeholder are NOT this face's business.
    gt1098WriteArchivedRun(root, 'issue-1098r4', 10984, { sink: 'merge' });
    gt1098WriteArchivedRun(root, 'issue-1098r5', 10985, { prUrl: 'OFFLINE_PLACEHOLDER' });
    const result = withForge(gt1098Stubs(), () => claim.watchMergeRequests(root, {}));
    assert.deepStrictEqual(result.reconciled || [], [],
      '#1098: non-PR sinks and OFFLINE placeholders must not be reconciled, got: ' + JSON.stringify(result.reconciled));
    console.log('testWatchPrReconcileSkipsMergedSinkAndPlaceholder: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWatchPrReconcileIsBoundedByTrackedAtHead() {
  const root = tempRoot('kw-gt-1098-recon-bounded-');
  try {
    initGitRepo(root);
    // Commit the archive at HEAD: the run is already reconciled into main, so the bounded scan must
    // skip it unless the operator names the issue explicitly.
    gt1098WriteArchivedRun(root, 'issue-1098r6', 10986);
    G.git(root, ['add', '-A'], { encoding: 'utf8' });
    G.git(root, ['commit', '-m', 'archive the run'], { encoding: 'utf8' });
    const bounded = withForge(gt1098Stubs(), () => claim.watchMergeRequests(root, {}));
    assert.deepStrictEqual(bounded.reconciled || [], [],
      '#1098: a run already tracked at HEAD must leave the bounded scan, got: ' + JSON.stringify(bounded.reconciled));
    // An explicit --issue names it, so the operator can always force the report.
    const named = withForge(gt1098Stubs(), () => claim.watchMergeRequests(root, { issue: 10986 }));
    assert((named.reconciled || []).length === 1,
      '#1098: an explicit --issue must reach an already-tracked run, got: ' + JSON.stringify(named.reconciled));
    console.log('testWatchPrReconcileIsBoundedByTrackedAtHead: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testWatchPrReconcilesMergedArchivedRun();
testWatchPrReconcilesOpenArchivedRunPending();
testWatchPrReconcilesClosedUnmergedArchivedRun();
testWatchPrReconcileSkipsMergedSinkAndPlaceholder();
testWatchPrReconcileIsBoundedByTrackedAtHead();

console.log('Gitea workflow script tests passed');
