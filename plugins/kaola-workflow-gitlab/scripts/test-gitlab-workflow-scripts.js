#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('test-gitlab-workflow-scripts'); } catch (_) { /* advisory only */ }

const assert = require('assert');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

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
const kwHostileGlabShim = path.join(kwSandboxHome, 'unexpected-glab.js');
fs.writeFileSync(kwHostileGlabShim, 'process.exit(97);\n');
process.env.KAOLA_GLAB_MOCK_SCRIPT = kwHostileGlabShim;

// #775: no sandbox running this suite has a `codex` binary on PATH, so every
// kaola-workflow-codex-preflight.js invocation needs a version-floor attestation or it would
// refuse codex_version_unsupported before any other check runs. Pinned globally (like HOME above)
// so every spawnSync call in this file that merges ...process.env inherits it automatically.
process.env.KAOLA_CODEX_VERSION = '0.145.0';

// #775: seed [agents] enabled=true into the shared sandbox HOME too — owner decision D2 means
// preflight would otherwise refuse codex_multi_agent_v2_required (exit 7) before reaching any of
// the profile-freshness checks the tests below that reuse kwSandboxHome are actually about.
fs.mkdirSync(path.join(kwSandboxHome, '.codex'), { recursive: true });
fs.writeFileSync(path.join(kwSandboxHome, '.codex', 'config.toml'), '[features.multi_agent_v2]\nenabled = true\n\n');

const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
const classifier = require('./kaola-gitlab-workflow-classifier');
const claim = require('./kaola-gitlab-workflow-claim');

const claimScript = path.join(__dirname, 'kaola-gitlab-workflow-claim.js');
const classifierScript = path.join(__dirname, 'kaola-gitlab-workflow-classifier.js');
const closureAuditScript = path.join(__dirname, 'kaola-gitlab-workflow-closure-audit.js');

function withForge(stubs, fn) {
  const originals = {};
  const effectiveStubs = { ...stubs };
  if (Object.prototype.hasOwnProperty.call(stubs, 'viewIssue')) {
    for (const dependency of ['discoverProject', 'listIssueNotes']) {
      if (!Object.prototype.hasOwnProperty.call(stubs, dependency)) {
        effectiveStubs[dependency] = function unexpectedClassifierForgeCall() {
          throw new Error('unexpected forge call: missing fixture dependency ' + dependency);
        };
      }
    }
  }
  for (const key of Object.keys(effectiveStubs)) {
    originals[key] = forge[key];
    forge[key] = effectiveStubs[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(effectiveStubs)) forge[key] = originals[key];
  }
}

function withClassifierForge(stubs, fn) {
  for (const dependency of ['viewIssue', 'discoverProject', 'listIssueNotes']) {
    if (!Object.prototype.hasOwnProperty.call(stubs, dependency)) {
      throw new Error('unexpected forge call: missing fixture dependency ' + dependency);
    }
  }
  return withForge({ listIssues() { return []; }, ...stubs }, fn);
}

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeState(root, project, issueIid, extra) {
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
    '## GitLab',
    'issue_iid: ' + issueIid,
    'project_id: 77',
    'path_with_namespace: group/project',
    'project_web_url: https://gitlab.example/group/project',
    '',
    '## Sink',
    'branch: workflow/gitlab-issue-' + issueIid,
    'issue_number: ' + issueIid,
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

// #775: fixtures below expect preflight to pass at exit 0 for a "fresh, fully working" install —
// that now additionally requires the top-level [agents] table's enabled=true (owner decision D2:
// Kaola never writes this itself). PREPENDED, never appended: TOML forbids re-declaring a bare
// [agents] header once an [agents.<role>] sub-table has already opened it, and the managed block
// (when present, e.g. a project config after install-codex-agent-profiles.js) opens exactly that.
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

function runClaimOnline(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...glabMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

// On macOS 15 (Darwin 25.4.0), execFileSync(scriptPath, args) hangs when
// scriptPath has ANY shebang. Solution: write only the .js logic file; callers
// set KAOLA_GLAB_MOCK_SCRIPT so glabExec routes through process.execPath.
function writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function glabMockEnv(binDir) {
  const jsPath = path.join(binDir, 'glab.js');
  return fs.existsSync(jsPath) ? { KAOLA_GLAB_MOCK_SCRIPT: jsPath } : {};
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

// Run closure-audit online (mock glab via KAOLA_GLAB_MOCK_SCRIPT). Mirrors GitHub runClosureAudit.
function runClosureAudit(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...glabMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  assert.strictEqual(result.status, 0, 'closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Run closure-audit offline (no glab shim; remote classes must report skipped_offline).
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

// Mirror the GitHub closureAuditShim but write a `glab` shim (GitLab CLI).
function closureAuditShim(binDir, lines) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), lines);
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

// Convert an existing active folder's state file into a sink=mr folder with mr_url/mr_iid.
// Mirrors the GitHub inline mutation; does NOT add a sink param to writeState.
function makeMrSinkFolder(root, project, issueNumber) {
  const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
  let content = fs.readFileSync(stateFile, 'utf8');
  content = content.replace(/^sink:\s*.*$/m, 'sink: mr');
  content += 'mr_url: https://gitlab.example/group/project/-/merge_requests/' + issueNumber + '\n';
  content += 'mr_iid: ' + issueNumber + '\n';
  fs.writeFileSync(stateFile, content);
}

function writeGlabShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('issue view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issue view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
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
// Issue #223 — three lifecycle fixes, gitlab edition
// ---------------------------------------------------------------------------

// Test 1: watch-mr CLOSED path must NOT fire roadmap invariants when archive=abandoned
function testWatchMrAbandonedClosureInvariantsClean() {
  const root = tempRoot('kw-gl-watchmr-abandoned-inv-');
  try {
    initGitRepo(root);
    writeState(root, 'issue-920', 920, 'mr_iid: 920');
    makeMrSinkFolder(root, 'issue-920', 920);
    const result = withForge({
      viewMergeRequest(mrIid) {
        assert.strictEqual(mrIid, 920);
        return { mr_iid: 920, state: 'closed' };
      },
      discoverProject() { return { project_id: 1, path_with_namespace: 'group/project' }; },
      listIssueNotes() { return []; },
      updateIssue() { return null; },
      createIssueNote() { return { id: 9003 }; }
    }, () => claim.watchMergeRequests(root, {}));
    assert.strictEqual(result.watched, 1, 'watched must be 1');
    assert(Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'cleanups must have an entry for CLOSED MR, got: ' + JSON.stringify(result));
    const cleanup = result.cleanups[0];
    assert(cleanup.receipt && cleanup.receipt.archive === 'abandoned',
      'receipt.archive must be abandoned, got: ' + JSON.stringify(cleanup.receipt));
    assert(cleanup.closure_invariants && cleanup.closure_invariants.ok === true,
      'closure_invariants.ok must be true for abandoned MR, got: ' + JSON.stringify(cleanup.closure_invariants));
    console.log('testWatchMrAbandonedClosureInvariantsClean: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 2: claimProject must reclaim a stateless orphan dir (no workflow-state.md)
function testGitlabClaimReclaimsStatelessOrphanDir() {
  const root = tempRoot('kw-gl-claim-orphan-');
  try {
    initGitRepo(root);
    // Positive: orphan dir with no state file
    const orphanDir = path.join(root, 'kaola-workflow', 'issue-888');
    fs.mkdirSync(orphanDir, { recursive: true });
    assert(!fs.existsSync(path.join(orphanDir, 'workflow-state.md')), 'fixture: no state file should exist');
    const result = withForge({
      discoverProject() { return { project_id: null, path_with_namespace: null, web_url: null }; }
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
      discoverProject() { return { project_id: null, path_with_namespace: null, web_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-889' }));
    assert.strictEqual(result2.status, 'target_occupied',
      '#14 NEGATIVE: dir with non-active state file must return target_occupied, got: ' + JSON.stringify(result2));
    console.log('testGitlabClaimReclaimsStatelessOrphanDir: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 3: cmdPatchBranch must guard against non-existent projects and unsafe names
function testGitlabPatchBranchGuards() {
  // (a) ghost project: non-existent project → exit non-zero, dir not created
  {
    const root = tempRoot('kw-gl-patchbranch-ghost-');
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
    const root = tempRoot('kw-gl-patchbranch-escape-');
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
    const root = tempRoot('kw-gl-patchbranch-active-');
    try {
      writeState(root, 'issue-63', 63, '');
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'issue-63', '--branch', 'workflow/gitlab-issue-63'], {
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
  console.log('testGitlabPatchBranchGuards: PASSED');
}

withForge({
  listIssueNotes() { return []; },
  discoverProject() { return { project_id: 1 }; },
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: issueIid === 11 ? 'closed' : 'open', labels: [] };
  }
}, () => {
  const root = tempRoot('kw-gl-active-');
  writeState(root, 'open-project', 10);
  writeState(root, 'closed-project', 11);
  const folders = active.readActiveFolders(root);
  assert.deepStrictEqual(folders.map(folder => folder.project), ['open-project']);
  assert.strictEqual(folders[0].issue_iid, 10);
});

// Claim classification is a unit seam: an empty HOME and hostile glab shim must remain untouched.
{
  const home = tempRoot('kw-gl-hermetic-home-');
  const bin = tempRoot('kw-gl-hermetic-bin-');
  const called = path.join(home, 'unexpected-glab-call');
  const shim = path.join(bin, 'glab');
  fs.writeFileSync(shim, '#!/bin/sh\ntouch "' + called + '"\nexit 97\n');
  fs.chmodSync(shim, 0o755);
  const oldHome = process.env.HOME;
  const oldPath = process.env.PATH;
  process.env.HOME = home;
  process.env.PATH = bin;
  const issue = iid => ({ issue_iid: iid, number: iid, state: 'open', labels: [], body: 'no repository paths' });
  try {
    withClassifierForge({
      viewIssue: issue,
      discoverProject() { return { project_id: 1 }; },
      listIssueNotes() { return []; },
    }, () => assert.strictEqual(classifier.classifyIssue(640, tempRoot('kw-gl-hermetic-empty-')).verdict, 'green'));
    withClassifierForge({
      viewIssue: issue,
      discoverProject() { return { project_id: 1 }; },
      listIssueNotes() { return [{ body: '<!-- kw:claim project=owned -->' }]; },
    }, () => assert.strictEqual(classifier.classifyIssue(641, tempRoot('kw-gl-hermetic-note-')).verdict, 'blocked'));
    withClassifierForge({
      viewIssue: issue,
      discoverProject() { return { project_id: 1 }; },
      listIssueNotes() { const e = new Error('fixture transient'); e.transient = true; throw e; },
    }, () => assert.strictEqual(classifier.classifyIssue(642, tempRoot('kw-gl-hermetic-indeterminate-')).verdict, 'indeterminate'));
    const complete = {
      viewIssue: issue,
      discoverProject() { return { project_id: 1 }; },
      listIssueNotes() { return []; },
    };
    for (const dependency of ['viewIssue', 'discoverProject', 'listIssueNotes']) {
      const missing = { ...complete };
      delete missing[dependency];
      assert.throws(() => withClassifierForge(missing, () => {
        throw new Error('fixture callback must not run');
      }), new RegExp('missing fixture dependency ' + dependency), 'missing ' + dependency + ' must fail locally by dependency name');
    }
    assert(!fs.existsSync(called), 'hermetic claim fixtures must not invoke the hostile glab shim');
  } finally {
    process.env.HOME = oldHome;
    process.env.PATH = oldPath;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

// --- Task 2: probeIssueState ---
// Case 1: issueIid null → { state: 'open', reason: 'offline-or-null' }
{
  const result = active.probeIssueState(null);
  assert.strictEqual(result.state, 'open', 'probeIssueState(null) must return state: open');
  assert.strictEqual(result.reason, 'offline-or-null', 'probeIssueState(null) must return reason: offline-or-null');
  console.log('probeIssueState null: PASS');
}

// Case 2a (#519 RECONCILE): a GENUINE-negative status-bearing throw (a real 404 stderr) → still
// { state: 'unavailable' } with NO transient discriminant + reason 'glab issue fetch failed'. The
// .state-only contract is preserved (closure-audit / probe-memo unaffected); the claim gates refuse.
withForge({
  viewIssue() {
    const e = new Error('glab exited 1');
    e.status = 1;
    e.stderr = 'GraphQL: Could not resolve to an Issue with the number of 42. (repository.issue)\n';
    throw e;
  }
}, () => {
  active.__resetIssueStateMemo();
  const result = active.probeIssueState(42);
  assert.strictEqual(result.state, 'unavailable', '#519: genuine-negative throw → state: unavailable');
  assert.strictEqual(result.transient, undefined, '#519: genuine-negative throw must NOT set transient (got ' + JSON.stringify(result) + ')');
  assert.strictEqual(result.reason, 'glab issue fetch failed', '#519: genuine-negative reason');
  console.log('probeIssueState genuine throw: PASS');
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
  console.log('probeIssueState transient throw: PASS');
});

// Case 3: forge.viewIssue returns { state: 'closed' } → { state: 'closed', reason: 'ok' }
withForge({
  listIssueNotes() { return []; },
  discoverProject() { return { project_id: 1 }; },
  viewIssue(issueIid) {
    return { issue_iid: issueIid, state: 'closed' };
  }
}, () => {
  const result = active.probeIssueState(43);
  assert.strictEqual(result.state, 'closed', 'probeIssueState closed issue must return state: closed');
  assert.strictEqual(result.reason, 'ok', 'probeIssueState closed issue must return reason: ok');
  console.log('probeIssueState closed: PASS');
});

// Case 4: forge.viewIssue returns residual/unknown state → { state: 'unavailable', reason: 'glab issue state unverified' }
withForge({ viewIssue() { return { state: 'unknown' }; } }, () => {
  const result = active.probeIssueState(44);
  assert.strictEqual(result.state, 'unavailable', 'residual state must map to unavailable');
  assert.strictEqual(result.reason, 'glab issue state unverified', 'residual reason');
});

withClassifierForge({
  listIssueNotes() { return []; },
  discoverProject() { return { project_id: 1 }; },
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [forge.CLAIM_LABEL],
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/new-file.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-classify-');
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
  const root = tempRoot('kw-gl-list-');
  try {
    assert.deepStrictEqual(claim.listOpenIssues(root).map(issue => issue.issue_iid), [7, 9]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// readPriorityConfig tests
{
  // Case a: missing config → default
  const root = tempRoot('kw-gl-rpc-');
  try {
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig missing config: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case b: valid array config → custom
  const root = tempRoot('kw-gl-rpc-');
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
  const root = tempRoot('kw-gl-rpc-');
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
  const root = tempRoot('kw-gl-sort-');
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
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  updateIssue(issueIid, opts) {
    assert.strictEqual(issueIid, 23);
    assert.deepStrictEqual(opts.labels, [forge.CLAIM_LABEL]);
    return { issue_iid: issueIid, state: 'open' };
  },
  createIssueNote(project, issueIid, body) {
    assert.strictEqual(project.project_id, 77);
    assert.strictEqual(issueIid, 23);
    assert(body.includes('issue-23'));
    return { id: 9001 };
  }
}, () => {
  const root = tempRoot('kw-gl-claim-');
  initGitRepo(root);
  const result = claim.claimExplicitTarget(root, { targetIssue: 23 });
  assert.strictEqual(result.status, 'acquired');
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'issue-23', 'workflow-state.md'), 'utf8');
  assert(state.includes('issue_iid: 23'));
  assert(state.includes('project_id: 77'));
  assert(state.includes('path_with_namespace: group/project'));
});

{
  const root = tempRoot('kw-gl-sink-');
  writeState(root, 'sink-project', 40);
  runNode([claimScript, 'sink-fallback', '--project', 'sink-project', '--reason', 'test'], root);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: mr'));
}

{
  const root = tempRoot('kw-gl-worktree-cleanup-');
  const kwRoot = fs.realpathSync(root) + '.kw';
  try {
    initGitRepo(root);
    // #725: the adaptive finalize gate diffs against the default base branch (`main` when offline),
    // so name the fixture's default branch `main` before adding the worktrees.
    G.git(root, ['branch', '-M', 'main'], { encoding: 'utf8' });
    const wtRelease = path.join(kwRoot, 'release-project');
    fs.mkdirSync(path.dirname(wtRelease), { recursive: true });
    let result = G.git(root, ['worktree', 'add', '-b', 'workflow/gitlab-issue-70', '--', wtRelease, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'release-project', 70, 'worktree_path: ' + wtRelease);
    runNode([claimScript, 'release', '--project', 'release-project', '--reason', 'test'], root);
    assert(!fs.existsSync(wtRelease), 'GitLab release should remove linked worktree');

    const wtFinalize = path.join(kwRoot, 'finalize-project');
    result = G.git(root, ['worktree', 'add', '-b', 'workflow/gitlab-issue-71', '--', wtFinalize, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'finalize-project', 71, 'worktree_path: ' + wtFinalize);
    runNode([claimScript, 'finalize', '--project', 'finalize-project', '--keep-worktree'], root);
    assert(fs.existsSync(wtFinalize), 'GitLab keep-worktree finalize should preserve worktree for final commit');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'finalize-project')), 'GitLab keep-worktree finalize should archive active folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

withForge({
  viewMergeRequest(mrIid) {
    assert.strictEqual(mrIid, 44);
    return { mr_iid: 44, state: 'merged' };
  },
  updateIssue() { return null; },
  createIssueNote() { return { id: 9002 }; }
}, () => {
  const root = tempRoot('kw-gl-watch-mr-');
  writeState(root, 'mr-project', 44, 'mr_iid: 44');
  const stateFile = path.join(root, 'kaola-workflow', 'mr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: mr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'mr-project', 'workflow-state.md')));
});

{
  const root = tempRoot('kw-gl-cwd-guard-');
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
  const root = tempRoot('kw-gl-drift-');
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
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
  },
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes(project, issueIid) {
    return [{ body: '<!-- kw:claim project=issue-' + issueIid + ' -->', updated_at: new Date().toISOString() }];
  }
}, () => {
  assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]));
  assert(!classifier.issueHasWorkflowInProgressLabel([]));
  assert(classifier.issueHasRemoteClaimNotes(33), 'recent kw:claim note should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() { return [{ body: '<!-- kw:claim sess=abc -->' }]; }
}, () => {
  assert(classifier.issueHasRemoteClaimNotes(34), 'missing updated_at should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() {
    return [{ body: '<!-- kw:claim project=old -->', updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }];
  }
}, () => {
  assert(!classifier.issueHasRemoteClaimNotes(35), 'stale note (>24h) should return false');
});

// --- A remote-claim BLOCK must name WHICH of the two artifacts holds the claim ---
//
// The three probes directly above are exactly the two artifacts a re-claim can be blocked by, and
// they do NOT behave the same: the `workflow:in-progress` LABEL has no expiry anywhere and blocks
// forever, while the `kw:claim` NOTE expires 24h after its `updated_at` (the third probe above is
// that expiry). Both arms nevertheless emitted one undiscriminating sentence — "issue #N has a
// remote workflow claim" — so an operator could not tell which artifact to go and clear.
//
// TWO EMITTERS PER FORGE PORT, and this is where they diverge from canonical: the port carries a
// `classifyIssue` helper that RETURNS the envelope (the in-process site `kaola-gitlab-workflow-claim.js`
// reaches) AND a `cmdClassify` that WRITES it (the CLI site a subprocess reaches). The two hold
// separate copies of the same block, so a fix applied to one and missed on the other ships silently
// — `validate-script-sync.js` compares the forge-renamed classifier to nothing, and the export
// superset guard sees only key names. Both sites are driven here.
//
// WHAT IS PINNED — the RESULT, not a wording: each arm's `reasoning` names its OWN artifact by the
// token an operator would search for, and the two arms do not emit the same sentence. Naming both
// artifacts on both arms passes the contains-checks and fails the differ-check — that is the
// near-miss this exists to catch. BOTH ARMS DRIVE THE SAME ISSUE IID deliberately: the
// undiscriminating sentence interpolates the number, so two arms on two numbers would differ
// already and the differ-check would be green against the defect.
{
  const CLAIM_LABEL_TOKEN = forge.CLAIM_LABEL;   // 'workflow:in-progress'
  const CLAIM_NOTE_TOKEN = 'kw:claim';           // the marker the note probe greps for
  const ARM_IID = 520;
  const freshNote = [{ body: '<!-- kw:claim project=issue-520 sess=abc -->', updated_at: new Date().toISOString() }];
  const project = { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  const findings = [];

  // ---- site 1: the in-process classifyIssue helper (what the claim port calls) ----
  const inProcessArm = (labels, notes) => {
    const root = tempRoot('kw-gl-claim-artifact-');
    try {
      return withForge({
        viewIssue(issueIid) { return { issue_iid: issueIid, number: issueIid, state: 'open', labels, body: '' }; },
        discoverProject() { return project; },
        listIssueNotes() { return notes; }
      }, () => classifier.classifyIssue(ARM_IID, root));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  };

  const helperLabelArm = inProcessArm([CLAIM_LABEL_TOKEN], []);
  const helperNoteArm = inProcessArm([], freshNote);
  // Liveness: an arm that stopped reaching the blocked emitter reds HERE rather than passing
  // vacuously through the message checks behind it.
  assert.strictEqual(helperLabelArm.verdict, 'blocked', 'classifyIssue label arm must still block');
  assert.strictEqual(helperNoteArm.verdict, 'blocked', 'classifyIssue note arm must still block');

  if (!String(helperLabelArm.reasoning || '').includes(CLAIM_LABEL_TOKEN)) {
    findings.push('classifyIssue (in-process site): a label-held claim must NAME the '
      + CLAIM_LABEL_TOKEN + ' label — it never expires, so the operator has to remove it by hand; got: '
      + JSON.stringify(helperLabelArm.reasoning));
  }
  if (!String(helperNoteArm.reasoning || '').includes(CLAIM_NOTE_TOKEN)) {
    findings.push('classifyIssue (in-process site): a note-held claim must NAME the '
      + CLAIM_NOTE_TOKEN + ' note — it expires 24h after updated_at, and that is the whole difference '
      + 'from the label; got: ' + JSON.stringify(helperNoteArm.reasoning));
  }
  if (String(helperLabelArm.reasoning || '') === String(helperNoteArm.reasoning || '')) {
    findings.push('classifyIssue (in-process site): the label arm and the note arm must not emit the '
      + 'SAME sentence; both got: ' + JSON.stringify(helperLabelArm.reasoning));
  }

  // ---- site 2: the cmdClassify CLI emitter (a separate copy of the same block) ----
  // ONLINE, so KAOLA_WORKFLOW_OFFLINE stays unset and glab is routed at a per-arm mock written
  // outside the fixture repo, overriding this suite's global hostile shim.
  const cliArm = (labels, notes) => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-claim-artifact-cli-'));
    const root = path.join(outer, 'repo');
    fs.mkdirSync(root, { recursive: true });
    try {
      // spawn-class: environment
      spawnSync('git', ['init', '-b', 'main'], { cwd: root, encoding: 'utf8' });
      const mock = path.join(outer, 'glab-mock.js');
      fs.writeFileSync(mock, [
        'const a = process.argv.slice(2);',
        'const labels = ' + JSON.stringify(labels) + ';',
        'const notes = ' + JSON.stringify(notes) + ';',
        "if (a[0] === 'repo' && a[1] === 'view') {",
        "  process.stdout.write(JSON.stringify({ id: 77, path_with_namespace: 'group/project' }));",
        "} else if (a[0] === 'issue' && a[1] === 'view') {",
        "  process.stdout.write(JSON.stringify({ iid: parseInt(a[2], 10), state: 'opened', labels: labels, description: '' }));",
        "} else if (a[0] === 'api') {",
        '  process.stdout.write(JSON.stringify(notes));',
        '} else {',
        "  process.stdout.write('');",
        '}',
      ].join('\n'));
      const env = Object.assign({}, process.env, {
        KAOLA_GLAB_MOCK_SCRIPT: mock,
        KAOLA_CLASSIFIER_BACKOFF_MS: '0'
      });
      delete env.KAOLA_WORKFLOW_OFFLINE;
      // spawn-class: cli-contract
      const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', String(ARM_IID)],
        { cwd: root, encoding: 'utf8', env });
      let json = null;
      try { json = JSON.parse(String(result.stdout).trim()); } catch (_) {}
      return { result, json };
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  };

  const cliLabelArm = cliArm([CLAIM_LABEL_TOKEN], []);
  const cliNoteArm = cliArm([], freshNote);
  assert(cliLabelArm.json && cliLabelArm.json.verdict === 'blocked',
    'cmdClassify label arm must still block; got ' + JSON.stringify(cliLabelArm.json)
    + '\nstderr: ' + cliLabelArm.result.stderr);
  assert(cliNoteArm.json && cliNoteArm.json.verdict === 'blocked',
    'cmdClassify note arm must still block; got ' + JSON.stringify(cliNoteArm.json)
    + '\nstderr: ' + cliNoteArm.result.stderr);

  if (!String(cliNoteArm.json.reasoning || '').includes(CLAIM_NOTE_TOKEN)) {
    findings.push('cmdClassify (CLI site): a note-held claim must NAME the ' + CLAIM_NOTE_TOKEN
      + ' note; got: ' + JSON.stringify(cliNoteArm.json.reasoning));
  }
  if (!String(cliLabelArm.json.reasoning || '').includes(CLAIM_LABEL_TOKEN)) {
    findings.push('cmdClassify (CLI site): a label-held claim must NAME the ' + CLAIM_LABEL_TOKEN
      + ' label; got: ' + JSON.stringify(cliLabelArm.json.reasoning));
  }
  if (String(cliLabelArm.json.reasoning || '') === String(cliNoteArm.json.reasoning || '')) {
    findings.push('cmdClassify (CLI site): the label arm and the note arm must not emit the SAME '
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
  const tempHome = tempRoot('kw-gl-offline-nofile-');
  const root = tempRoot('kw-gl-offline-nofile-root-');
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

// ADR 0018 §5 named accepted loss: offline claim evidence (classifier.js treating a local roadmap
// source as proof an issue exists) is retired with the source it read — an OFFLINE classify with no
// active folder now correctly answers target_unverified regardless of a planted roadmap entry.
// "Issue #175: non-regression — OFFLINE with roadmap entry still acquires" pinned the opposite and
// is deleted with the mechanism it pinned.

// Issue #175: non-regression — OFFLINE with active folder for the target routes as 'owned' (NOT target_unverified)
{
  const tempHome = tempRoot('kw-gl-offline-owned-routes-');
  const root = tempRoot('kw-gl-offline-owned-routes-root-');
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
  const tempHome = tempRoot('kw-gl-offline-unrelated-active-');
  const root = tempRoot('kw-gl-offline-unrelated-active-root-');
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
  const tempHome = tempRoot('kw-gl-offline-startup-unverified-');
  const root = tempRoot('kw-gl-offline-startup-unverified-root-');
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
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
  },
  discoverProject() { return { project_id: 77, path_with_namespace: 'g/p' }; },
  listIssueNotes() { return []; }
}, () => {
  const result = classifier.classifyIssue(92, '/tmp');
  assert.strictEqual(result.verdict, 'blocked', 'classifyIssue must block on CLAIM_LABEL');
  assert(/remote workflow claim/.test(result.reasoning));
});

// Issue #99: startup/pick-next explicit-target parity
{
  // startup without --target-issue must return no_target even when one active folder exists
  const root = tempRoot('kw-gl-startup-notarget-');
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
  const root = tempRoot('kw-gl-picknext-notarget-');
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
  const root = tempRoot('kw-gl-startup-worktree-');
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sibling-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw'; // legacy path — kept for cleanup only
  try {
    initGitRepo(tmp);
    // Simulate a linked worktree by running startup from within a hypothetical linked path.
    // We do this by creating a hidden-local dir that shares the same git common-dir.
    const linkedWt = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-5');
    fs.mkdirSync(linkedWt, { recursive: true });
    // Create a worktree so git knows about it
    G.git(tmp, ['worktree', 'add', '--detach', linkedWt], { encoding: 'utf8' });

    // Provide a glab shim so the classifier doesn't fail-close on forge error
    const binDir100 = path.join(tmp, 'bin100');
    fs.mkdirSync(binDir100, { recursive: true });
    writeShimFiles(path.join(binDir100, 'glab'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) process.stdout.write('{\"state\":\"open\"}\\n');",
      "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
      "else process.stdout.write('[]\\n');"
    ]);

    // Run startup from the linked worktree cwd — should produce hidden-local, not nested path
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '6'], {
      cwd: linkedWt, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1',
             ...glabMockEnv(binDir100),
             PATH: binDir100 + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
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


function testStaleWorktreeCheck() {
  // Helper: initGitRepo adapted for a fresh isolated tmp each sub-case
  function setupRepo() {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-gl-')));
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitlab-issue-300', wtPath);
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-100');
    addWorktree(tmp, 'workflow/gitlab-issue-100', wtPath);
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
  // IMPORTANT: use fs.rmSync NOT git worktree remove — the registration must survive
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
    // Delete the directory without removing git worktree metadata
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
    writeGlabShimForStale(binDir);
    G.git(tmp, ['branch', 'workflow/gitlab-issue-400'], { encoding: 'utf8' });
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
    addWorktree(tmp, 'workflow/gitlab-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      // Run OFFLINE — no binDir needed, no API calls made
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

const gitlabPluginRoot = path.resolve(__dirname, '..');
const installProfilesScript = path.join(gitlabPluginRoot, 'scripts', 'install-codex-agent-profiles.js');
// Derived from the plugin's own roster rather than pinned as an integer. The installer's contract is
// "install exactly the roster it ships", so measuring the roster is the assertion; a hard-coded count
// only turns every roster change into a false red in a file that has nothing to do with the roster.
const GL_ROSTER_TOMLS = fs.readdirSync(path.join(gitlabPluginRoot, 'agents'))
  .filter(f => f.endsWith('.toml')).sort();

function runInstallProfiles(target, extraEnv, extraArgs) {
  const args = (extraArgs && extraArgs.length) ? extraArgs : [];
  const result = spawnSync(process.execPath, [installProfilesScript, target, ...args], {
    cwd: gitlabPluginRoot,
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

// #325/#525: updateHooks() hardening on the gitlab installer copy — R1 (metacharacter pluginRoot),
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
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-325-schema-'));
  const tempHome325 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-325-home-'));
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
  console.log('testUpdateHooksHardening325 (gitlab): PASSED');
}

// #409: stable-home regression — install FROM a throwaway copy of the gitlab plugin tree,
// DELETE the copy, then assert every hooks.json command still resolves to an existing
// executable in a version-less home (no install-source / version-pinned path), and that
// reinstall sweeps a planted stale script. The gitlab template references the edition-named
// kaola-gitlab-workflow-codex-compact-resume.js — hookReferencedRelPaths auto-adjusts.
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-409-stable-home-'));
  // #447: hooks + stable home go to global HOME/.codex; use a temp HOME so the test
  // never writes to the real ~/.codex.
  const tempHome409 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-409-home-'));
  try {
    const installSrc = path.join(work, 'ephemeral-src');
    recursiveCopyDir(gitlabPluginRoot, installSrc);
    const srcInstaller = path.join(installSrc, 'scripts', 'install-codex-agent-profiles.js');
    const target = path.join(work, 'target');
    fs.mkdirSync(target, { recursive: true });

    const homeEnv409 = { HOME: tempHome409, USERPROFILE: tempHome409 };
    const first = spawnSync(process.execPath, [srcInstaller, target], {
      cwd: installSrc, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (first.error) throw first.error;
    assert.ok(first.status === 0, '#409 gl: install from ephemeral source must succeed: ' + first.stderr);

    fs.rmSync(installSrc, { recursive: true, force: true });

    // #447 AC1: hooks land in global HOME/.codex, not in the project dir
    const globalHooks409Path = path.join(tempHome409, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(globalHooks409Path), '#447/#409 gl: hooks.json must be in global HOME/.codex after install');
    assert.ok(!fs.existsSync(path.join(target, '.codex', 'hooks.json')), '#447 AC5 gl: no hooks.json must be in project .codex');

    const hooks = JSON.parse(fs.readFileSync(globalHooks409Path, 'utf8'));
    let commandCount = 0;
    for (const event of Object.keys(hooks.hooks || {})) {
      for (const entry of (hooks.hooks[event] || [])) {
        for (const h of (entry.hooks || [])) {
          if (typeof h.command !== 'string') continue;
          commandCount++;
          const m = h.command.match(/"([^"]+)"/);
          assert.ok(m, '#409 gl: hook command must carry a quoted script path: ' + h.command);
          const scriptPath = m[1];
          assert.ok(fs.existsSync(scriptPath), '#409 gl GREEN: hook script must exist after source deletion: ' + scriptPath);
          assert.ok((fs.statSync(scriptPath).mode & 0o100) !== 0, '#409 gl: hook script must be executable: ' + scriptPath);
          assert.ok(!scriptPath.includes('ephemeral-src'), '#409 gl: must NOT point at the deleted source: ' + scriptPath);
          assert.ok(!/\/\d+\.\d+\.\d+\//.test(scriptPath), '#409 gl: hook path must NOT be version-pinned: ' + scriptPath);
        }
      }
    }
    assert.ok(commandCount >= 1, '#409 gl: expected the surviving managed hook command, saw ' + commandCount);

    // #447: stable home also lives in global HOME/.codex/kaola-workflow
    const globalStableHome409 = path.join(tempHome409, '.codex', 'kaola-workflow');
    const planted = path.join(globalStableHome409, 'hooks', 'kaola-workflow-stale-orphan.sh');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    fs.writeFileSync(planted, '#!/usr/bin/env bash\nexit 0\n');
    const second = spawnSync(process.execPath, [installProfilesScript, target], {
      cwd: gitlabPluginRoot, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (second.error) throw second.error;
    assert.ok(second.status === 0, '#409 gl: reinstall must succeed: ' + second.stderr);
    assert.ok(!fs.existsSync(planted), '#409 gl: reinstall must sweep the stale planted script');

    console.log('test409StableHomeSurvivesDirDeletion (gitlab): PASSED');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(tempHome409, { recursive: true, force: true });
  }
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-install-existing-'));
  // #447: use a temp HOME so hooks are never written to the real ~/.codex
  const tempHomeFresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-home-fresh-'));
  const tempHomeExisting = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-home-existing-'));
  try {
    const freshHomeEnv = { HOME: tempHomeFresh, USERPROFILE: tempHomeFresh };
    const existingHomeEnv = { HOME: tempHomeExisting, USERPROFILE: tempHomeExisting };
    const freshResult = runInstallProfiles(fresh, freshHomeEnv);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    // #775: the installer no longer writes any [features]/multi_agent flag at all — owner decision
    // D2 keeps [agents].enabled a user hand-edit reported (never written) by preflight.
    assert.ok(!freshConfig.includes('[features]'), '#775: fresh install must NOT write any [features] table');
    assert.ok(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');
    assert.ok(freshConfig.includes('[agents.code-explorer]'), 'fresh install should include managed [agents.*] entries');
    // #332: the installer now also writes a .kaola-managed-profiles.json manifest into
    // this dir, so count TOML entries only (raw readdir includes the manifest dotfile).
        const freshAgentsDir = path.join(fresh, '.codex', 'agents', 'kaola-workflow');
    assert.strictEqual(
      fs.readdirSync(freshAgentsDir).filter(f => f.endsWith('.toml')).length,
      GL_ROSTER_TOMLS.length,
      'the installer must place exactly the roster the plugin ships'
    );
    assert.ok(
      fs.existsSync(path.join(freshAgentsDir, '.kaola-managed-profiles.json')),
      '#332: fresh install must write the managed-profiles manifest'
    );

    // --- #284/#447: hooks.json assertions (fresh install) ---
    // #447 AC1: hooks land in global HOME/.codex, NOT in the project dir
    const freshHooksPath = path.join(tempHomeFresh, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(freshHooksPath), '#447 AC1: fresh install must create HOME/.codex/hooks.json (global), not found at: ' + freshHooksPath);
    assert.ok(!fs.existsSync(path.join(fresh, '.codex', 'hooks.json')), '#447 AC5: no hooks.json must be written to project .codex');
    const freshHooks = JSON.parse(fs.readFileSync(freshHooksPath, 'utf8'));

    // SessionStart compact-resume is the surviving managed lifecycle hook.
    for (const event of ['SessionStart']) {
      const entries = freshHooks.hooks[event];
      assert.ok(Array.isArray(entries) && entries.length > 0,
        `hooks.json must have entries for event ${event}`);
      const managed = entries.filter(e => e.id && e.id.startsWith('kaola-workflow:'));
      assert.ok(managed.length >= 1,
        `hooks.json event ${event} must have at least one kaola-workflow: entry (got ${managed.length})`);
    }

    // SessionStart compact command must reference the GITLAB edition script name
    const sessionStartEntries = freshHooks.hooks['SessionStart'];
    const compactEntry = sessionStartEntries.find(e => e.id && e.id.startsWith('kaola-workflow:'));
    assert.ok(compactEntry, 'SessionStart must have a kaola-workflow: managed entry');
    const compactCmd = (compactEntry.hooks || []).map(h => h.command).join(' ');
    assert.ok(
      compactCmd.includes('kaola-gitlab-workflow-codex-compact-resume.js'),
      `SessionStart command must reference kaola-gitlab-workflow-codex-compact-resume.js, got: ${compactCmd}`
    );

    // No unreplaced __KW_PLUGIN_ROOT__ token should remain in the written file
    const freshHooksText = fs.readFileSync(freshHooksPath, 'utf8');
    assert.ok(
      !freshHooksText.includes('__KW_PLUGIN_ROOT__'),
      'hooks.json must not contain literal __KW_PLUGIN_ROOT__ after install'
    );

    // Installer stdout must include the /hooks trust line
    assert.ok(
      freshResult.stdout.includes('/hooks'),
      'installer stdout must include /hooks trust line'
    );

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]', 'goals = true', '', '[projects."/tmp/example"]', 'trust_level = "trusted"', ''
    ].join('\n'));

    runInstallProfiles(existing, existingHomeEnv);
    runInstallProfiles(existing, existingHomeEnv);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert.strictEqual(
      countOccurrences(updated, /^\[features\]$/gm),
      1,
      'existing config must contain exactly one [features] table'
    );
    assert.ok(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert.ok(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');

    // --- #284/#447: idempotency — hooks land in global HOME/.codex (not project); each id once ---
    const existingHooksPath = path.join(tempHomeExisting, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(existingHooksPath), '#447: global HOME/.codex/hooks.json must exist after install');
    assert.ok(!fs.existsSync(path.join(existing, '.codex', 'hooks.json')), '#447 AC5: no hooks.json in project .codex after double-run');
    const existingHooks = JSON.parse(fs.readFileSync(existingHooksPath, 'utf8'));
    // #376: per-ID no-duplicate check (an event MAY carry >1 distinct managed id, e.g. PreToolUse holds
    // both pre-commit-guard and the write-lane hook); each kaola-workflow: id must appear exactly once.
    const idCounts = {};
    for (const event of Object.keys(existingHooks.hooks || {})) {
      for (const e of existingHooks.hooks[event]) {
        if (e.id && e.id.startsWith('kaola-workflow:')) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
      }
    }
    for (const id of Object.keys(idCounts)) {
      assert.strictEqual(idCounts[id], 1, `after double-run, managed id ${id} must appear exactly once (got ${idCounts[id]}) — idempotency violation`);
    }
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
    fs.rmSync(tempHomeFresh, { recursive: true, force: true });
    fs.rmSync(tempHomeExisting, { recursive: true, force: true });
  }
}

// Issue #149: Test 1 — default-OFF (KAOLA_WORKTREE_NATIVE=0 must not provision worktree)
// Also asserts in-place branch created+checked-out (workflow/gitlab-issue-601) + tree clean (#260).
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-native-off-')));
  try {
    initGitRepo(root);
    // Commit a .gitignore so the bin/ shim + kaola-workflow/ folder don't dirty the tree
    fs.writeFileSync(path.join(root, '.gitignore'), 'bin149/\nkaola-workflow/\n.kw/\n');
    G.git(root, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(root, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    const binDir149 = path.join(root, 'bin149');
    fs.mkdirSync(binDir149, { recursive: true });
    writeShimFiles(path.join(binDir149, 'glab'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) process.stdout.write('{\"state\":\"open\"}\\n');",
      "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
      "else process.stdout.write('[]\\n');"
    ]);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '601'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0',
             ...glabMockEnv(binDir149),
             PATH: binDir149 + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(r.status, 0, 'exit 0 when KAOLA_WORKTREE_NATIVE=0\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.strictEqual(out.worktree_path, '', 'worktree_path empty when KAOLA_WORKTREE_NATIVE=0');
    // #260: in-place branch must be created and checked out
    const headBranch = G.git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(headBranch, 'workflow/gitlab-issue-601', 'NATIVE=0 must checkout in-place branch workflow/gitlab-issue-601, got: ' + headBranch);
    const treeStatus = G.git(root, ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(treeStatus, '', 'tree must be clean after in-place claim (all untracked entries gitignored), got: ' + JSON.stringify(treeStatus));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    const kwRoot = root + '.kw';
    if (fs.existsSync(kwRoot)) fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Issue #149: Test 2 — OFFLINE wins over NATIVE (OFFLINE=1 must suppress worktree even when NATIVE=1)
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-offline-wins-')));
  try {
    initGitRepo(root);
    plantClosureRoadmapSource(root, 602);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '602'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1' }
    });
    assert.strictEqual(r.status, 0, 'exit 0 when OFFLINE=1 even with NATIVE=1\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.strictEqual(out.worktree_path, '', 'worktree_path empty when OFFLINE=1 even with NATIVE=1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    const kwRoot = root + '.kw';
    if (fs.existsSync(kwRoot)) fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// --- Task 5: fail-open fix — classifier must not silently pass on forge failure ---
// #507 update: a generic/unknown forge error (no e.status/e.signal) is classified as transient
// ('killed' fallback) and retried, then surfaces as verdict:indeterminate (not target_unavailable).
// A clean-nonzero (e.status set) remains determinate → target_unavailable.

// testGitLabClassifierFailClosed: in-process classifyIssue with transient error → indeterminate
// #507: new behavior — a plain Error (no status/signal/code) → classifyFetchError fallback 'killed'
// → transient → retried 3x → verdict:indeterminate. Old behavior was target_unavailable.
withClassifierForge({
  viewIssue() { throw new Error('network error'); }, // no status/signal → transient → indeterminate
  discoverProject() { return { project_id: 1 }; },
  listIssueNotes() { return []; }
}, () => {
  process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
  const root = tempRoot('kw-gl-t5-classify-fail-');
  try {
    const result = classifier.classifyIssue(200, root);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#507: classifyIssue transient forge error → verdict:indeterminate (got: ' + result.verdict + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#507: indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGitLabClassifierFailClosed: PASS');
  } finally {
    delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// testGitLabStartupFailClosed: claimExplicitTarget with transient error → target_indeterminate/escalate
// #507: a transient forge error → indeterminate → reported as result:answer, never a refusal.
withForge({
  viewIssue() { throw new Error('network error'); } // no status/signal → transient → indeterminate
}, () => {
  process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
  const root = tempRoot('kw-gl-t5-startup-fail-');
  try {
    const result = claim.claimExplicitTarget(root, { targetIssue: 201 });
    assert.strictEqual(result.status, 'target_indeterminate',
      '#507: claimExplicitTarget transient forge error → target_indeterminate (got: ' + result.status + ')');
    assert.strictEqual(result.result, 'answer',
      '#507: claimExplicitTarget transient forge error → result:answer (got: ' + result.result + ')');
    assert.strictEqual(result.claim, 'none',
      'claimExplicitTarget must return claim:none on forge failure, got: ' + result.claim);
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-201')),
      'claimExplicitTarget must not create an active folder when forge fails');
    console.log('testGitLabStartupFailClosed: PASS');
  } finally {
    delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ADR 0018 §5 named accepted loss: offline claim evidence is retired with the local roadmap source
// it read — testGitLabOfflineBypassesFailClosed relied on a planted roadmap entry so an OFFLINE
// classify would find local evidence and acquire; that evidence path is gone, so acquisition is too.

function testStaleWorktreeCleanup() {
  function addWorktree(repoRoot, branch, wtPath) {
    const r = G.git(repoRoot, ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: dry-run — clean worktree, no --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup'], tmp, binDir);
      assert(out.dry_run === true, 'sc1: dry_run must be true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === wtPath),
        'sc1: would_remove must contain wtPath, got: ' + JSON.stringify(out.would_remove));
      assert(Array.isArray(out.would_delete_branch) && out.would_delete_branch.includes('workflow/gitlab-issue-200'),
        'sc1: would_delete_branch must contain workflow/gitlab-issue-200, got: ' + JSON.stringify(out.would_delete_branch));
      assert(fs.existsSync(wtPath), 'sc1: worktree dir must still exist after dry-run');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: execute-clean — clean worktree + --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out.dry_run === false, 'sc2: dry_run must be false, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(Array.isArray(out.deleted_branch) && out.deleted_branch.includes('workflow/gitlab-issue-200'),
        'sc2: deleted_branch must contain workflow/gitlab-issue-200, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc2: worktree dir must be removed after execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 3: execute-dirty-no-flag — dirty worktree + --execute (no archive/export/force)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc5-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc6-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc7-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      const branchCheck = G.git(tmp, ['rev-parse', '--verify', 'refs/heads/workflow/gitlab-issue-200'], { encoding: 'utf8' });
      assert.strictEqual(branchCheck.status, 0, 'sc7: branch workflow/gitlab-issue-200 must still exist, got: ' + branchCheck.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 8: execute-archive-fail — stash fails → failed_preserve, no removal
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc8-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    let lockFile = null;
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc9-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc10-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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

// ---------------------------------------------------------------------------
// closure-audit (issue #166 — GitLab port of GitHub issue #165)
// ---------------------------------------------------------------------------

function testClosureAuditOfflineRemoteClassesSkipped() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-offline-')));
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
      result.drift.unarchived_mr_folders, 'skipped_offline',
      'offline: unarchived_mr_folders must be "skipped_offline", got: ' + JSON.stringify(result.drift.unarchived_mr_folders)
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-labels-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-active-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-904', 904);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
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

function testClosureAuditUnarchivedMrFolderMergedLowercase() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-unarchived-mr-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-905', 905);
    makeMrSinkFolder(tmp, 'issue-905', 905);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('mr view')) { process.stdout.write('{\"state\":\"merged\"}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const mrFolders = result.drift.unarchived_mr_folders;
    assert(
      Array.isArray(mrFolders) && mrFolders.length === 1 && mrFolders[0].project === 'issue-905' && mrFolders[0].mr_state === 'merged',
      'unarchived_mr_folders must report merged MR folder issue-905 with lowercase mr_state "merged", got: ' + JSON.stringify(mrFolders)
    );
    assert(mrFolders[0].mr_url, 'unarchived_mr_folders entry must carry mr_url, got: ' + JSON.stringify(mrFolders[0]));
    console.log('testClosureAuditUnarchivedMrFolderMergedLowercase: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteNeverTouchesActiveFolders() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-exec-safe-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-907', 907);
    const folderDir = path.join(tmp, 'kaola-workflow', 'issue-907');
    assert(fs.existsSync(folderDir), 'precondition: active folder must exist');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-dryrun-safe-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue update') && a.includes('--unlabel')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert.strictEqual(result.dry_run, true, 'no --execute must return dry_run:true, got: ' + result.dry_run);
    assert(!fs.existsSync(marker), 'dry-run must NOT call glab issue update --unlabel (marker must not exist)');
    console.log('testClosureAuditDryRunNeverCallsRemoveLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleLabelsTimeout() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-stale-labels-timeout-')));
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

function testGitlabProbeIssueStateOfflineGuard() {
  const activeFoldersPath = path.join(__dirname, 'kaola-gitlab-workflow-active-folders.js');
  const result = spawnSync(process.execPath, ['-e',
    'const active = require(' + JSON.stringify(activeFoldersPath) + ');' +
    'const r = active.probeIssueState(42);' +
    'process.stdout.write(JSON.stringify(r) + "\\n");'
  ], {
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert.strictEqual(result.status, 0, 'subprocess must exit 0, stderr: ' + result.stderr);
  const r = JSON.parse(result.stdout.trim());
  assert.strictEqual(r.state, 'open', 'OFFLINE probeIssueState(42) must return state:open, got: ' + r.state);
  assert.strictEqual(r.reason, 'offline-or-null', 'OFFLINE probeIssueState(42) must return reason:offline-or-null, got: ' + r.reason);
  console.log('testGitlabProbeIssueStateOfflineGuard: PASSED');
}

function testGitlabProbeResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-probe-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.exit(0);"]); // empty stdout, exit 0
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(42);
    assert.strictEqual(r.state, 'unavailable',
      'empty exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'glab issue state unverified',
      'empty exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGitlabProbeResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testGitlabProbeResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-probe-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]); // non-JSON, exit 0
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(43);
    assert.strictEqual(r.state, 'unavailable',
      'non-JSON exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'glab issue state unverified',
      'non-JSON exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGitlabProbeResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteDetectionTimeoutPropagates() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-exec-det-timeout-')));
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
// unarchived_mr_folders is this edition's merge-request vocabulary.
// The two omit-when-empty classes (archive_summary_citation_missing, unresolved_closed_state) are
// deliberately absent: a fixture that has neither must not grow either key.
const GL_DRIFT_KEYS_903 = [
  'stale_in_progress_labels',
  'active_folder_for_closed_issue',
  'unarchived_mr_folders',
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-argv-')));
  const notARepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-norepo-')));
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-mistyped-')));
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
    // pre-fix online reads true). These legs use runClosureAudit, which sets OFFLINE=0 explicitly,
    // plus a mock on glab's own hook.
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
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
    // exact key set is what proves the glab mock ANSWERED: a dead mock reads every probe 'unavailable',
    // which adds unresolved_closed_state and would satisfy the assertion above on a dead axis.
    assertKeys903(unresolvedOnline.current_project_drift, GL_DRIFT_KEYS_903,
      'the in-scope drift of the unresolved run (an extra class here means the mock never answered)');
    for (const key of GL_DRIFT_KEYS_903) {
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-member-folder-')));
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
      "if (a.includes('issue view 801')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue view 804')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-citation-empty-')));
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
    assertKeys903(dry.drift, GL_DRIFT_KEYS_903, 'the unscoped drift object with a complete archive');
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-citation-')));
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-attr-name-')));
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-attr-ambiguous-')));
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
      const pairTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-attr-pair-')));
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
    const soloTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-attr-solo-')));
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-planhash-')));
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
  const container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-traversal-')));
  const repo = path.join(container, 'repo');
  try {
    fs.mkdirSync(repo, { recursive: true });
    initGitRepo(repo);
    fs.mkdirSync(path.join(container, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(container, 'outside', 'workflow-state.md'),
      'status: active\nstep: implement\nissue_iid: 4242\n');
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

testInstallProfilesFeaturesTableHandling();
testUpdateHooksHardening325();
test409StableHomeSurvivesDirDeletion();   // #409
testStaleWorktreeCheck();
testStaleWorktreeCleanup();
testClosureAuditOfflineRemoteClassesSkipped();
testClosureAuditStaleInProgressLabels();
testClosureAuditActiveFolderForClosedIssueReportsDirty();
testClosureAuditUnarchivedMrFolderMergedLowercase();
testClosureAuditExecuteNeverTouchesActiveFolders();
testClosureAuditDryRunNeverCallsRemoveLabel();
testClosureAuditStaleLabelsTimeout();
testGitlabProbeIssueStateOfflineGuard();
testGitlabProbeResidualEmptyExit0();
testGitlabProbeResidualNonJsonExit0();
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

// issue #230 / #510 / #519: classifyIssue / cmdClassify must fail-closed on a degraded exit-0 forge
// response. #510 RECONCILE: under the corrected taxonomy an exit-0 unparseable/empty body is a
// TRANSIENT fault (the strict-parse seam throws a SyntaxError → transient → indeterminate, mirroring
// root's in-`try` JSON.parse). It is no longer a determinate target_unavailable — a malformed/empty
// body is an infra-degradation signal, not a genuine "issue gone". (The old shared parseJson(raw,{})
// SWALLOWED it to {} → state:'unknown'; the strictViewIssue seam now surfaces it.)

function testGitlabClassifyIssueResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ['process.exit(0);']);
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  // Fresh temp HOME so nothing in this scenario reaches the developer's real config.
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-empty-home-')));
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: empty exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: empty exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGitlabClassifyIssueResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabClassifyIssueResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-nonjson-home-')));
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: non-JSON exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: non-JSON exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGitlabClassifyIssueResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabCmdClassifyResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ['process.exit(0);']);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-empty-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify empty exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify empty exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGitlabCmdClassifyResidualEmptyExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabCmdClassifyResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-nonjson-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify non-JSON exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify non-JSON exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGitlabCmdClassifyResidualNonJsonExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #264 — AC9 parity: worktreePathFor hidden-local-path + legacy-cleanup
// Feature-detecting tests: assert OLD behavior until impl-claim lands the path-
// split + cmdLegacyWorktreeCleanup into kaola-gitlab-workflow-claim.js.
// When impl-claim lands, SIGNAL = typeof claim.legacySiblingWorktreePathFor === 'function'
// activates the strict new-path assertions (RED-pending forward dependency on impl-claim).
// ---------------------------------------------------------------------------

// Test #10a (§F): worktreePathFor hidden-local-path assertion.
// SIGNAL: typeof claim.legacySiblingWorktreePathFor === 'function'
// If present (impl-claim landed): assert worktreePathFor returns a path under <root>/.kw/worktrees/
// Else (not yet landed): assert worktreePathFor returns OLD sibling path (parent/<repo>.kw/<project>)
function testGitlabWorktreePathForHiddenLocal() {
  const root = tempRoot('kw-gl-264-wtpath-');
  try {
    initGitRepo(root);
    const project = 'issue-264-wtpath-test';
    const result = claim.worktreePathFor(root, project);
    const hasNewApi = typeof claim.legacySiblingWorktreePathFor === 'function';
    if (hasNewApi) {
      // impl-claim landed: new path is under <root>/.kw/worktrees/<project>
      assert(
        result.includes(path.join('.kw', 'worktrees', project)),
        'testGitlabWorktreePathForHiddenLocal: expected path under .kw/worktrees/' + project + ', got: ' + result
      );
      assert(
        !result.includes(path.join('.kw', project)) || result.includes(path.join('worktrees', project)),
        'testGitlabWorktreePathForHiddenLocal: path must not be legacy sibling, got: ' + result
      );
    } else {
      // impl-claim not yet landed: old sibling path — parent/<repo>.kw/<project>
      const endsWithKwProject = result.endsWith(path.sep + project) &&
        result.includes('.kw' + path.sep + project) &&
        !result.includes(path.join('.kw', 'worktrees'));
      assert(
        endsWithKwProject,
        'testGitlabWorktreePathForHiddenLocal: expected OLD sibling path ending in .kw/<project>, got: ' + result
      );
    }
    console.log('testGitlabWorktreePathForHiddenLocal: PASSED (hasNewApi=' + hasNewApi + ')');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test #10b (§F): legacy-worktree-cleanup dry-run assertion.
// SIGNAL: legacy-worktree-cleanup subcommand recognized (exit 0 + JSON with dry_run field).
// If recognized (impl-claim landed): assert dry-run reports legacy path in would_remove, removes nothing.
// Else (not yet landed): SKIP with a SKIPPED line, keeping the walkthrough green.
function testGitlabLegacyWorktreeCleanupDryRun() {
  const root = tempRoot('kw-gl-264-legacy-cleanup-');
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
      console.log('testGitlabLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)');
      return;
    }
    // impl-claim landed: build a legacy-path worktree and assert dry-run reports it
    const mainRoot = fs.realpathSync(root);
    const legacyContainer = path.dirname(mainRoot) + path.sep + path.basename(mainRoot) + '.kw';
    const legacyWt = path.join(legacyContainer, 'issue-264-legacy');
    fs.mkdirSync(legacyWt, { recursive: true });
    const addResult = G.git(root, ['worktree', 'add', '-b', 'workflow/gitlab-issue-264-legacy', '--', legacyWt, 'HEAD'], { encoding: 'utf8' });
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
      console.log('testGitlabLegacyWorktreeCleanupDryRun: PASSED');
    } finally {
      G.git(root, ['worktree', 'remove', '--force', legacyWt], { encoding: 'utf8' });
      try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGitlabClassifyIssueResidualEmptyExit0();
testGitlabClassifyIssueResidualNonJsonExit0();
testGitlabCmdClassifyResidualEmptyExit0();
testGitlabCmdClassifyResidualNonJsonExit0();
testWatchMrAbandonedClosureInvariantsClean();
testGitlabClaimReclaimsStatelessOrphanDir();
testGitlabPatchBranchGuards();
testGitlabWorktreePathForHiddenLocal();
testGitlabLegacyWorktreeCleanupDryRun();

// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the 3 new scripts (gitlab edition).
// Cases 1-2 (stale config, missing profiles), Case 3 (task-mirror),
// Case 4 (compact-resume), Case 5 (no-silent-inline-fallback).
// ---------------------------------------------------------------------------

const gitlabPreflightScript     = path.join(gitlabPluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
const gitlabCompactResumeScript = path.join(gitlabPluginRoot, 'scripts', 'kaola-gitlab-workflow-codex-compact-resume.js');

// Shared mission-list fixture (consistent across editions)
const GITLAB_FIXTURE_MISSION_LIST = [
  '# Retire the node executor and land the mission list',
  '',
  '- item: extract what is load-bearing before the host dies',
  '  status: done',
  '  dispatched: extract subagent, output to the shared kernel',
  '  result: scripts/kaola-workflow-adaptive-schema.js',
  '',
  '- item: delete the node executor and re-wire everything that names it',
  '  status: in-flight',
  '  dispatched: demolish subagent, deletions land across scripts/ and plugins/',
  '',
  '- item: rewrite the routing surfaces',
  '  status: todo',
  ''
].join('\n');

// Case 1 + Case 2 + Case 5: preflight tests (stale config, missing profiles, no-silent-fallback)
function testGitlabPreflight266() {
  // #571: hermetic-HOME retrofit — spawn each preflight call with an empty temp HOME so the
  // new global-first short-circuit finds no ~/.codex and falls through to project-scope assertions.
  const emptyHomeGl = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-hermetic-home-'));
  const hEnvGl = { ...process.env, HOME: emptyHomeGl, USERPROFILE: emptyHomeGl };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-preflight-'));
  try {
    // Install every shipped profile into the fixture.
    const installResult = spawnSync(process.execPath, [installProfilesScript, root], {
      cwd: gitlabPluginRoot, encoding: 'utf8'
    });
    if (installResult.error) throw installResult.error;
    assert.ok(installResult.status === 0, 'gitlab preflight fixture install failed: ' + installResult.stderr);

    // Project-scoped Codex layers are ignored until the project is explicitly trusted.
    const trustRequiredResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.strictEqual(trustRequiredResult.status, 4,
      '#266 gl trust guard: unknown project trust must exit 4, got ' + trustRequiredResult.status
        + '\n' + trustRequiredResult.stdout);
    const trustRequiredJson = JSON.parse(trustRequiredResult.stdout);
    assert.strictEqual(trustRequiredJson.status, 'project_trust_required',
      '#266 gl trust guard: expected project_trust_required, got ' + trustRequiredJson.status);
    assert.strictEqual(trustRequiredJson.project_trust, 'unknown',
      '#266 gl trust guard: expected unknown trust, got ' + trustRequiredJson.project_trust);
    trustCodexProject(emptyHomeGl, root);
    enableMultiAgentV2(emptyHomeGl);

    // --- GREEN: fresh fixture must pass preflight ---
    const freshResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.strictEqual(freshResult.status, 0,
      '#266 gl case1 RED-discriminator: fresh fixture must exit 0, got ' + freshResult.status + '\n' + freshResult.stdout);
    const freshJson = JSON.parse(freshResult.stdout);
        assert.strictEqual(freshJson.status, 'ok',
          '#266 gl case1 RED-discriminator: fresh fixture must return status:ok, got ' + freshJson.status);

        // --- Case 1 RED: remove a role from the managed block → config_stale ---
        const configPath = path.join(root, '.codex', 'config.toml');
        const origConfig = fs.readFileSync(configPath, 'utf8');
        // #775: config/agents.toml's managed block no longer opens with [features] — managedBlock()
        // is the raw bundled template, so there is nothing to strip here. `configWithAgentsEnabled`
        // PREPENDS a user-owned [agents] table (TOML forbids re-declaring [agents] once the managed
        // block's [agents.<role>] sub-tables have already opened it).
        function configWithAgentsEnabled(extraLines) {
          return '[features.multi_agent_v2]\nenabled = true\n' + (extraLines ? extraLines + '\n' : '') + '\n' + origConfig;
        }
        // #775: dispatch mode is binary now — the whole 0.142/0.144 transport-mode grammar
        // (tool_namespace / hide_spawn_agent_metadata / non_code_mode_only, the dotted/quoted/
        // array-of-table [features.multi_agent_v2] parsing edge cases, the codex_v2_*_transport_unsafe
        // refusals) is retired along with the [features.multi_agent_v2] table shape; the ONLY
        // question left is whether the top-level [agents] table's `enabled` is true (v2-task-name,
        // exit 0) or not (codex_multi_agent_v2_required, exit 7 — there is no v1 fallback).
        function assertDispatchModeForConfig(body, expectedEnabled, label, checkDoctor) {
          fs.writeFileSync(configPath, body);
          const result = spawnSync(process.execPath,
            [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
            { encoding: 'utf8', env: hEnvGl });
          if (!expectedEnabled) {
            assert.strictEqual(result.status, 7,
              label + ': v2-disabled config must refuse with exit 7, got ' + result.status + '\n' + result.stdout);
            const json = JSON.parse(result.stdout);
            assert.strictEqual(json.status, 'codex_multi_agent_v2_required', label + ': status');
            assert.strictEqual(json.multi_agent_v2_enabled, false, label + ': multi_agent_v2_enabled');
            assert.strictEqual(json.dispatch_mode, null, label + ': dispatch_mode must be null when v2 is disabled (no v1 fallback)');
            return;
          }
          assert.strictEqual(result.status, 0,
            label + ': v2-enabled config must pass preflight, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert.strictEqual(json.dispatch_mode, 'v2-task-name', label + ': dispatch_mode');
          assert.strictEqual(json.multi_agent_v2_enabled, true, label + ': multi_agent_v2_enabled');
          if (checkDoctor) {
            const doctorResult = spawnSync(process.execPath,
              [gitlabPreflightScript, '--doctor', '--project-root', root, '--json'],
              { encoding: 'utf8', env: hEnvGl });
            const doctorJson = JSON.parse(doctorResult.stdout);
            const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
            assert.ok(projectScope && projectScope.dispatch_mode === 'v2-task-name',
              label + ': doctor project scope expected v2-task-name, got ' + JSON.stringify(projectScope));
          }
        }
        // NOTE: this fixture's HOME layer already has [agents].enabled = true seeded (so the
        // "GREEN: fresh fixture must pass preflight" check above passes) — a project layer that
        // does NOT set `enabled` inherits HOME's true; only an EXPLICIT project-layer
        // `enabled = false` can override it back off.
        assertDispatchModeForConfig(origConfig, true, '#775 gl no project-layer [agents] table -> inherits enabled=true from HOME', false);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, false, '#775 gl project layer explicitly overrides enabled=false', false);
        assertDispatchModeForConfig(configWithAgentsEnabled(), true, '#775 gl [agents]\\nenabled = true', true);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, false,
          '#775 gl warning suppression alone must not enable v2', false);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\nmulti_agent_v2 = true\n\n' + origConfig, false,
          '#775 gl a retired top-level multi_agent_v2 key is not read (no more [features] grammar)', false);

        // #598 AC2 gl: effort-gated MultiAgentMode dispatch-POSTURE (distinct from dispatch_mode
        // above — posture reflects whether the runtime will REFUSE a spawn, not just whether the
        // tools are exposed). #775: 'none' now ALWAYS coincides with the codex_multi_agent_v2_required
        // refusal, so every case here uses a v2-enabled config and must still exit 0.
        function assertDispatchPostureForConfig(body, expectedPosture, label) {
          fs.writeFileSync(configPath, body);
          const result = spawnSync(process.execPath,
            [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
            { encoding: 'utf8', env: hEnvGl });
          assert.strictEqual(result.status, 0,
            label + ': dispatch-posture WARN must never fail preflight, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert.strictEqual(json.dispatch_posture, expectedPosture,
            label + ': expected dispatch_posture ' + expectedPosture + ', got ' + json.dispatch_posture);
          assert.strictEqual(json.dispatch_posture_warning === null, expectedPosture === 'proactive',
            label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
        }
        assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 gl base fixture ([agents] enabled via HOME layer, no effort)');
        // NOTE: a 'none' posture ALWAYS now coincides with codex_multi_agent_v2_required (exit 7) —
        // there is no longer a passing-preflight case that reports posture 'none'.
        assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
          '#598 gl effort=ultra with [agents] enabled -> proactive');
        assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
          '#598 gl effort=xhigh (below ultra) stays explicitRequestOnly');
        assertDispatchPostureForConfig(configWithAgentsEnabled(), 'explicitRequestOnly',
          '#775 gl [agents] enabled=true at the project layer too, no effort -> explicitRequestOnly');
        assertDispatchPostureForConfig(
          configWithAgentsEnabled('model_reasoning_effort = "ultra"'),
          'explicitRequestOnly', '#775 gl effort INSIDE the [agents] table is not a valid TOML root key -> ignored');

        fs.writeFileSync(configPath, origConfig);
        const staleConfig = origConfig.replace('[agents.planner]', '[agents.STALE-planner]');
        fs.writeFileSync(configPath, staleConfig);

    const staleResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.notStrictEqual(staleResult.status, 0,
      '#266 gl case1: stale managed block must cause non-zero exit, got ' + staleResult.status);
    const staleJson = JSON.parse(staleResult.stdout);
    assert.strictEqual(staleJson.status, 'config_stale',
      '#266 gl case1: must return config_stale, got ' + staleJson.status);
    assert.ok(Array.isArray(staleJson.missing_roles) && staleJson.missing_roles.includes('planner'),
      '#266 gl case1: missing_roles must include planner, got ' + JSON.stringify(staleJson.missing_roles));

    // --- Case 1 GREEN (autofix): ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-preflight-autofix-'));
    try {
      trustCodexProject(emptyHomeGl, autofixRoot);
      fs.mkdirSync(path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow'), { recursive: true });
      fs.writeFileSync(path.join(autofixRoot, '.codex', 'config.toml'), staleConfig);
      const srcAgentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
      const dstAgentsDir = path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow');
      for (const f of fs.readdirSync(srcAgentsDir)) {
        fs.copyFileSync(path.join(srcAgentsDir, f), path.join(dstAgentsDir, f));
      }
      const autofixResult = spawnSync(process.execPath,
        [gitlabPreflightScript, '--project-root', autofixRoot, '--json'],
        { encoding: 'utf8', env: hEnvGl });
      assert.strictEqual(autofixResult.status, 0,
        '#266 gl case1 autofix: must exit 0 after repair, got ' + autofixResult.status + '\n' + autofixResult.stdout);
      const autofixJson = JSON.parse(autofixResult.stdout);
      assert.ok(autofixJson.status === 'ok' && autofixJson.autofixed === true,
        '#266 gl case1 autofix: must return ok+autofixed:true, got ' + JSON.stringify(autofixJson));
    } finally {
      fs.rmSync(autofixRoot, { recursive: true, force: true });
    }

    // Restore config for case 2
    fs.writeFileSync(configPath, origConfig);

    // --- Case 2 RED: remove a profile toml file → profiles_missing ---
    const wpToml = path.join(root, '.codex', 'agents', 'kaola-workflow', 'planner.toml');
    const savedToml = fs.readFileSync(wpToml);
    fs.unlinkSync(wpToml);

    const missingResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.notStrictEqual(missingResult.status, 0,
      '#266 gl case2: missing profile toml must cause non-zero exit, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert.strictEqual(missingJson.status, 'profiles_missing',
      '#266 gl case2: must return profiles_missing, got ' + missingJson.status);
    assert.ok(Array.isArray(missingJson.missing_roles) && missingJson.missing_roles.includes('planner'),
      '#266 gl case2: missing_roles must include planner');

    // Restore toml
    fs.writeFileSync(wpToml, savedToml);

    // --- Case 2 GREEN: restored → fresh again ---
    const restoredResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.strictEqual(restoredResult.status, 0,
      '#266 gl case2 GREEN: restored fixture must pass, got ' + restoredResult.status);

    // --- Case 5 RED: absent profile → REFUSES, stdout must NOT contain subagent-invoked or local-fallback ---
    fs.unlinkSync(wpToml);
    const refusalResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGl });
    assert.notStrictEqual(refusalResult.status, 0,
      '#266 gl case5 RED: absent profile must cause non-zero exit, got ' + refusalResult.status);
    assert.ok(!refusalResult.stdout.includes('subagent-invoked'),
      '#266 gl case5: preflight refusal must NOT emit subagent-invoked, got: ' + refusalResult.stdout);
    assert.ok(!refusalResult.stdout.includes('local-fallback'),
      '#266 gl case5: preflight refusal must NOT emit local-fallback, got: ' + refusalResult.stdout);
    // Restore
    fs.writeFileSync(wpToml, savedToml);

    console.log('testGitlabPreflight266 (#266 cases 1,2,5): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(emptyHomeGl, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #598 AC1 gl: installer dispatch-posture REPORT. ATTESTATION-STYLE / NON-FATAL — the
// installer must REPORT the effective effort-gated MultiAgentMode posture and, when
// non-proactive, the exact remediation, and this must NEVER change the install's own
// exit code. Also asserts stdout still ENDS with `status: ok` (#332 AC3 invariant).
// ---------------------------------------------------------------------------
// #775: the installer NEVER writes [agents] enabled=true (owner decision D2) — a fresh install
// therefore now reports posture 'none' and multi_agent_v2 'NOT enabled'. The installer itself
// still always exits 0 (unconditional profile install); only the later PREFLIGHT dispatch-time
// check refuses via codex_multi_agent_v2_required.
function testGitlabDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-598-posture-proj-'));
  try {
    const freshEnv = { ...process.env, HOME: postureHome };
    const fresh = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: gitlabPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(fresh.status, 0, '#598 gl AC1: fresh install must exit 0: ' + fresh.stderr);
    assert.strictEqual(fresh.stdout.trim().split('\n').pop(), 'status: ok',
      '#598 gl AC1: existing #332 AC3 "stdout ends with status: ok" invariant must be preserved: ' + fresh.stdout);
    assert.ok(/Kaola-Workflow Codex multi_agent_v2: NOT enabled \(see codex_multi_agent_v2_required at preflight\)/.test(fresh.stdout),
      '#775 gl AC1: a fresh install (no [agents] enabled=true) must report multi_agent_v2 not enabled: ' + fresh.stdout);
    assert.ok(/Kaola-Workflow Codex dispatch posture: none/.test(fresh.stdout),
      '#775 gl AC1: a fresh install with no [agents] enabled=true must report posture none: ' + fresh.stdout);
    assert.ok(/0\.145\.0/.test(fresh.stdout), '#775 gl AC1/AC2: report must carry the version-guard note: ' + fresh.stdout);

    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    const beforeUltra = fs.readFileSync(postureConfigPath, 'utf8');
    fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n\n' + beforeUltra);
    const reinstalled = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: gitlabPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(reinstalled.status, 0, '#598 gl AC1: re-install with [agents] enabled + effort=ultra must still exit 0: ' + reinstalled.stderr);
    assert.ok(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#775 gl AC1: v2 enabled + effort=ultra must report proactive posture: ' + reinstalled.stdout);
    // #842: the label reports STATE and must not credit the RETIRED key for it — the detector reads
    // features.multi_agent_v2, and `[agents] enabled = true` is not what enabled V2 here or
    // anywhere. Same predicates as AC1 in scripts/test-install-model-rendering.js: one claim, one
    // wording, across all four chains that pinned the old label.
    assert.ok(/Kaola-Workflow Codex multi_agent_v2: enabled/.test(reinstalled.stdout),
      '#775 gl AC1: enabled config must report multi_agent_v2 enabled: ' + reinstalled.stdout);
    assert.ok(!/multi_agent_v2: enabled \([^)]*\[agents\]/.test(reinstalled.stdout),
      '#842 gl AC1: ...and must NOT attribute it to [agents]: ' + reinstalled.stdout);
    assert.ok(!/refuse sub-agent spawns/.test(reinstalled.stdout),
      '#598 gl AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstalled.stdout);
    // #601: the remediation (still printed while posture is non-proactive, i.e. the FIRST fresh
    // install above) must LEAD with the always-available, always-documented in-session ask,
    // before the effort-gated (undocumented/server-gated) ultra clause.
    const askIdx601 = fresh.stdout.indexOf('explicitly ask for sub-agents');
    const ultraIdx601 = fresh.stdout.indexOf('model_reasoning_effort = "ultra"');
    assert.ok(askIdx601 !== -1 && ultraIdx601 !== -1 && askIdx601 < ultraIdx601,
      '#601 gl: remediation must lead with the in-session ask before the effort-gated ultra clause: ' + fresh.stdout);

    console.log('testGitlabDispatchPosture598 (#598 AC1 installer report): PASSED');
  } finally {
    fs.rmSync(postureProj, { recursive: true, force: true });
    fs.rmSync(postureHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #571: global-first preflight gate — install once to ~/.codex, all repos pass (GitLab edition).
// ---------------------------------------------------------------------------
function testGitlabPreflight571() {
  // --- Test (a): global-only install ⇒ gate PASSES (scope:'global') ---
  // RED-first discriminator: old gate checks project scope only → exit 1 (RED); GREEN after gate change.
  const tempHome571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571a-home-'));
  try {
    const env571a = { ...process.env, HOME: tempHome571a, USERPROFILE: tempHome571a };
    const setupInstall = spawnSync(process.execPath, [installProfilesScript, tempHome571a], {
      cwd: gitlabPluginRoot, encoding: 'utf8', env: env571a
    });
    assert.strictEqual(setupInstall.status, 0,
      '#571 gl test(a): positional-form install to tempHome must exit 0: ' + setupInstall.stderr);
    enableMultiAgentV2(tempHome571a);

    const emptyProject571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571a-proj-'));
    try {
      const r = spawnSync(process.execPath,
        [gitlabPreflightScript, '--project-root', emptyProject571a, '--no-autofix', '--json'],
        { encoding: 'utf8', env: env571a });
      assert.strictEqual(r.status, 0,
        '#571 gl test(a) RED-discriminator: global-only install must pass preflight, got ' +
        r.status + '\n' + r.stdout);
      const j = JSON.parse(r.stdout);
      assert.strictEqual(j.status, 'ok', '#571 gl test(a): status must be ok, got ' + j.status);
      assert.strictEqual(j.scope, 'global', '#571 gl test(a): scope must be global, got ' + j.scope);
      assert.ok(!fs.existsSync(path.join(emptyProject571a, '.codex')),
        '#571 gl test(a): no project .codex must be created when global scope satisfies the gate');
    } finally {
      fs.rmSync(emptyProject571a, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571a, { recursive: true, force: true });
  }

  // --- Test (b): neither scope valid ⇒ FAILS CLOSED ---
  const tempHome571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571b-home-'));
  const emptyProject571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571b-proj-'));
  try {
    // #775: seed [agents] enabled=true so this test still reaches the profile-availability check
    // it was designed to prove, rather than short-circuiting on codex_multi_agent_v2_required.
    enableMultiAgentV2(tempHome571b);
    const r = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', emptyProject571b, '--no-autofix', '--json'],
      { encoding: 'utf8', env: { ...process.env, HOME: tempHome571b, USERPROFILE: tempHome571b } });
    assert.notStrictEqual(r.status, 0,
      '#571 gl test(b): neither scope valid must fail closed, got exit ' + r.status);
    const j = JSON.parse(r.stdout);
    assert.ok(j.status === 'profiles_missing' || j.status === 'config_stale',
      '#571 gl test(b): fail-closed must return profiles_missing or config_stale, got ' + j.status);
  } finally {
    fs.rmSync(tempHome571b, { recursive: true, force: true });
    fs.rmSync(emptyProject571b, { recursive: true, force: true });
  }

  // --- Test (c): stale global does NOT short-circuit ---
  const tempHome571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571c-home-'));
  try {
    const env571c = { ...process.env, HOME: tempHome571c, USERPROFILE: tempHome571c };
    const setupC = spawnSync(process.execPath, [installProfilesScript, tempHome571c], {
      cwd: gitlabPluginRoot, encoding: 'utf8', env: env571c
    });
    assert.strictEqual(setupC.status, 0, '#571 gl test(c): setup install must exit 0');
    fs.unlinkSync(
      path.join(tempHome571c, '.codex', 'agents', 'kaola-workflow', 'planner.toml'));

    const emptyProject571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571c-proj-'));
    try {
      const r = spawnSync(process.execPath,
        [gitlabPreflightScript, '--project-root', emptyProject571c, '--no-autofix', '--json'],
        { encoding: 'utf8', env: env571c });
      assert.notStrictEqual(r.status, 0,
        '#571 gl test(c): stale global must not short-circuit, got exit ' + r.status);
    } finally {
      fs.rmSync(emptyProject571c, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571c, { recursive: true, force: true });
  }

  // --- Test (a2): --global installer flag targets os.homedir() ---
  const tempHome571flag = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-571flag-home-'));
  try {
    const envFlag = { ...process.env, HOME: tempHome571flag, USERPROFILE: tempHome571flag };
    const globalFlagInstall = spawnSync(process.execPath, [installProfilesScript, '--global'], {
      cwd: gitlabPluginRoot, encoding: 'utf8', env: envFlag
    });
    assert.strictEqual(globalFlagInstall.status, 0,
      '#571 gl test(a2): --global flag install must exit 0: ' + globalFlagInstall.stderr);
    assert.ok(
      fs.existsSync(path.join(tempHome571flag, '.codex', 'agents', 'kaola-workflow', 'planner.toml')),
      '#571 gl test(a2): --global flag must write planner.toml to tempHome/.codex');
  } finally {
    fs.rmSync(tempHome571flag, { recursive: true, force: true });
  }

  console.log('testGitlabPreflight571 (#571 global-scope gate): PASSED');
}

// ---------------------------------------------------------------------------
// #332: installer schema + prune + manifest (AC3-AC6) — GitLab edition mirror.
// ---------------------------------------------------------------------------
const GL_NAME_RE = /^name\s*=\s*"([^"]+)"\s*$/m;
function gitlabListTomls(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.toml')).sort();
}
function testInstallSchemaPruneManifest332Gitlab() {
  const manifestBase = '.kaola-managed-profiles.json';

  // AC3: fresh install — exactly the shipped roster, no docs-lookup, name on each, manifest, sentinel.
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-install-fresh-'));
  try {
    const r = runInstallProfiles(fresh);
    const agentsDir = path.join(fresh, '.codex', 'agents', 'kaola-workflow');
    const tomls = gitlabListTomls(agentsDir);
    assert.deepStrictEqual(tomls, GL_ROSTER_TOMLS, '#332 gl AC3: fresh install must place exactly the roster the plugin ships');
    assert.ok(!tomls.includes('docs-lookup.toml'), '#332 gl AC3: docs-lookup.toml must not be installed');
    for (const f of tomls) {
      const role = f.replace(/\.toml$/, '');
      const m = fs.readFileSync(path.join(agentsDir, f), 'utf8').match(GL_NAME_RE);
      assert.ok(m && m[1] === role, '#332 gl AC3: ' + f + ' must have name = "' + role + '"');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    assert.strictEqual(manifest.schema_version, 1, '#332 gl AC3: manifest schema_version 1');
    assert.strictEqual(manifest.roles.length, GL_ROSTER_TOMLS.length, '#332 gl AC3: manifest must list every shipped role');
    for (const role of ['code-reviewer', 'adversarial-verifier', 'security-reviewer']) {
      const file = role + '.toml';
      const sourceBytes = fs.readFileSync(path.join(gitlabPluginRoot, 'agents', file));
      const installedBytes = fs.readFileSync(path.join(agentsDir, file));
      assert.ok(sourceBytes.equals(installedBytes),
        'reviewer contract: installed ' + file + ' must byte-match the selected source');
      const text = installedBytes.toString('utf8');
      assert.deepStrictEqual(manifest.profile_contracts[file], {
        behavior_contract_version: Number(text.match(/^behavior_contract_version: (\d+)$/m)[1]),
        behavior_contract_hash: text.match(/^behavior_contract_hash: ([0-9a-f]{64})$/m)[1],
        resolved_profile_hash: text.match(/^resolved_profile_hash: ([0-9a-f]{64})$/m)[1],
      }, 'reviewer contract: manifest must bind behavior/profile identity for ' + file);
    }
    assert.strictEqual(r.stdout.trim().split('\n').pop(), 'status: ok', '#332 gl AC3: stdout must end with status: ok');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // AC4 + AC9 write-path: upgrade-over-old-state repairs malformed + retired files.
  const upgrade = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-install-upgrade-'));
  try {
    const agentsDir = path.join(upgrade, '.codex', 'agents', 'kaola-workflow');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'code-explorer.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """stale no-name body"""\n');
    fs.writeFileSync(path.join(agentsDir, 'docs-lookup.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """retired role body"""\n');
    fs.writeFileSync(path.join(upgrade, '.codex', 'config.toml'), [
      '# BEGIN kaola-workflow agents', '[features]', 'multi_agent = true',
      '[agents.docs-lookup]', 'config_file = "./agents/kaola-workflow/docs-lookup.toml"',
      '# END kaola-workflow agents', ''
    ].join('\n'));
    const r = runInstallProfiles(upgrade);
    assert.ok(!fs.existsSync(path.join(agentsDir, 'docs-lookup.toml')), '#332 gl AC4: retired docs-lookup pruned');
    const ce = fs.readFileSync(path.join(agentsDir, 'code-explorer.toml'), 'utf8');
    assert.ok(GL_NAME_RE.test(ce) && ce.match(GL_NAME_RE)[1] === 'code-explorer', '#332 gl AC4: code-explorer rewritten with name');
    const cfg = fs.readFileSync(path.join(upgrade, '.codex', 'config.toml'), 'utf8');
    assert.ok(cfg.includes('[agents.knowledge-lookup]') && !cfg.includes('[agents.docs-lookup]'),
      '#332 gl AC9: block must register knowledge-lookup and drop docs-lookup');
    assert.ok(r.stdout.includes('docs-lookup.toml (retired)'), '#332 gl AC4: stdout reports retired prune');

    // AC5: idempotency.
    const m1 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    runInstallProfiles(upgrade);
    const m2 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    assert.strictEqual(JSON.stringify(m1.files), JSON.stringify(m2.files), '#332 gl AC5: manifest.files stable');
  } finally {
    fs.rmSync(upgrade, { recursive: true, force: true });
  }

  // AC6: unknown user TOML preserved + reported.
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-install-custom-'));
  try {
    runInstallProfiles(custom);
    const agentsDir = path.join(custom, '.codex', 'agents', 'kaola-workflow');
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'), 'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const r = runInstallProfiles(custom);
    assert.ok(fs.existsSync(path.join(agentsDir, 'my-custom.toml')), '#332 gl AC6: user TOML survives');
    assert.ok(r.stdout.includes('unmanaged extra profiles left in place: my-custom.toml'), '#332 gl AC6: stdout reports unmanaged extra');
  } finally {
    fs.rmSync(custom, { recursive: true, force: true });
  }

  console.log('testInstallSchemaPruneManifest332Gitlab (#332 AC3-AC6,AC9-path): PASSED');
}

// ---------------------------------------------------------------------------
// #332: preflight schema/stale/manifest/doctor (AC7-AC11) — GitLab edition mirror.
// ---------------------------------------------------------------------------
function testGitlabPreflight332() {
  function pf(args) {
    return spawnSync(process.execPath, [gitlabPreflightScript, ...args], { encoding: 'utf8' });
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-preflight-'));
  try {
    trustCodexProject(kwSandboxHome, root);
    runInstallProfiles(root);
    const agentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
    const ce = path.join(agentsDir, 'code-explorer.toml');
    const savedCe = fs.readFileSync(ce, 'utf8');

    const reviewer = path.join(agentsDir, 'code-reviewer.toml');
    fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace(
      'Precision-first code review specialist', 'Precision-first modified code review specialist'));
    let r = pf(['--project-root', root, '--no-autofix', '--json']);
    let j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'profiles_stale',
      'reviewer contract: modified project profile must refuse as profiles_stale');
    assert.strictEqual(j.repair, `node ${installProfilesScript} ${root}`,
      'reviewer contract: project repair must name the exact scoped installer command');
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 0, 'reviewer contract: project profile drift must autofix');
    assert.ok(fs.readFileSync(reviewer).equals(
      fs.readFileSync(path.join(gitlabPluginRoot, 'agents', 'code-reviewer.toml'))),
    'reviewer contract: project autofix must restore exact source bytes');

    // AC7a: malformed -> profiles_malformed under --no-autofix
    fs.writeFileSync(ce, savedCe.replace(/^name = "code-explorer"\n/m, ''));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    assert.notStrictEqual(r.status, 0, '#332 gl AC7a: malformed must refuse');
    j = JSON.parse(r.stdout);
    assert.strictEqual(j.status, 'profiles_malformed', '#332 gl AC7a: status profiles_malformed');
    assert.strictEqual(j.malformed[0].role, 'code-explorer', '#332 gl AC7a: malformed role correct');

    // AC8: autofix repairs.
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 0, '#332 gl AC8: autofix exits 0');
    j = JSON.parse(r.stdout);
    assert.ok(j.status === 'ok' && j.autofixed === true, '#332 gl AC8: ok autofixed');

    // AC7b: stale docs-lookup -> profiles_stale.
    fs.copyFileSync(ce, path.join(agentsDir, 'docs-lookup.toml'));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'profiles_stale', '#332 gl AC7b: profiles_stale');
    assert.ok(j.stale_files.includes('docs-lookup.toml'), '#332 gl AC7b: stale_files lists docs-lookup');
    pf(['--project-root', root, '--json']);
    assert.ok(!fs.existsSync(path.join(agentsDir, 'docs-lookup.toml')), '#332 gl AC7b: autofix prunes docs-lookup');

    // AC9: an injected retired role changes the canonical managed bytes, so
    // config_stale wins; doctor retains the role-level evidence.
    const cfgPath = path.join(root, '.codex', 'config.toml');
    fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace('# END kaola-workflow agents',
      '[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n\n# END kaola-workflow agents'));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'config_stale',
      '#332 gl AC9: canonical managed-block drift must return config_stale, got ' + j.status);
    const managedDoctor = pf(['--doctor', '--project-root', root, '--json']);
    const managedDoctorJson = JSON.parse(managedDoctor.stdout);
    const managedProjectScope = managedDoctorJson.scopes.find(s => s.scope === 'project');
    assert.ok(managedDoctor.status !== 0 && managedProjectScope && managedProjectScope.managed_block_drift === true,
      '#332 gl AC9: doctor must report canonical managed-block drift');
    assert.ok(managedProjectScope.stale_roles_in_block.includes('docs-lookup'),
      '#332 gl AC9: doctor stale_roles_in_block lists docs-lookup');
    pf(['--project-root', root, '--json']);

    // schema_version 2 -> exit 6.
    const manifestPath = path.join(agentsDir, '.kaola-managed-profiles.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schema_version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    r = pf(['--project-root', root, '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status === 6 && j.status === 'profile_schema_version_unsupported', '#332 gl: exit 6 on future manifest');
    manifest.schema_version = 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // doctor AC10/AC11.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-doctor-home-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-332-doctor-proj-'));
    try {
      runInstallProfiles(home);
      enableMultiAgentV2(home);
      runInstallProfiles(proj);
      trustCodexProject(home, proj);
      fs.copyFileSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'code-explorer.toml'),
        path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 1, '#332 gl AC10: doctor exit 1 on stale user scope');
      j = JSON.parse(r.stdout);
      const userScope = j.scopes.find(s => s.scope === 'user');
      assert.ok(userScope.stale_files.includes('docs-lookup.toml'), '#332 gl AC10: user scope reports docs-lookup');
      assert.strictEqual(userScope.repair, `node ${installProfilesScript} ${home}`,
        '#332 gl AC10: user scope repair must be the exact scoped installer command');
      fs.unlinkSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      runInstallProfiles(home);
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 0, '#332 gl AC10: doctor exit 0 when both clean');
      const pluginIdentity = JSON.parse(fs.readFileSync(
        path.join(gitlabPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      const cacheRoot = path.join(home, '.codex', 'plugins', 'cache', 'm',
        pluginIdentity.name, pluginIdentity.version);
      const cacheAgents = path.join(cacheRoot, 'agents');
      fs.mkdirSync(cacheRoot, { recursive: true });
      fs.cpSync(path.join(gitlabPluginRoot, 'agents'), cacheAgents, { recursive: true });
      fs.cpSync(path.join(gitlabPluginRoot, 'config'), path.join(cacheRoot, 'config'), { recursive: true });
      fs.cpSync(path.join(gitlabPluginRoot, '.codex-plugin'), path.join(cacheRoot, '.codex-plugin'),
        { recursive: true });
      const cachedReviewer = path.join(cacheAgents, 'code-reviewer.toml');
      fs.writeFileSync(cachedReviewer, fs.readFileSync(cachedReviewer, 'utf8').replace(
        'Precision-first code review specialist', 'Precision-first cached code review specialist'));
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 1, '#332 gl AC11: stale plugin_cache must fail doctor');
      j = JSON.parse(r.stdout);
      const cacheScope = j.scopes.find(s => s.scope === 'plugin_cache');
      assert.ok(cacheScope && cacheScope.read_only === true && cacheScope.stale_profiles.length > 0,
        '#332 gl AC11: cache scope read_only + stale profile evidence');
      assert.strictEqual(cacheScope.repair,
        'codex plugin remove ' + pluginIdentity.name + '@m && codex plugin add '
          + pluginIdentity.name + '@m  # refresh plugin cache',
        '#332 gl AC11: cache scope must name the exact refresh command');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }

    fs.writeFileSync(ce, savedCe);
    console.log('testGitlabPreflight332 (#332 AC7-AC11): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}


// Case 4: compact/resume packet (gitlab edition)
function testGitlabCompactResume266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-compact-'));
  try {
    const projectName = 'issue-266-compact';
    const projDir = path.join(root, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# State', '',
      '## Project',
      'name: issue-266-compact',
      'status: active', '',
      '## Sink',
      'branch: workflow/issue-266',
      'issue_number: 266',
      ''
    ].join('\n'));

    fs.writeFileSync(path.join(projDir, 'mission-list.md'), GITLAB_FIXTURE_MISSION_LIST);

    const input = JSON.stringify({ cwd: root });

    // --- GREEN: run compact-resume → deterministic claim + Mission List packet ---
    const r1 = spawnSync(process.execPath, [gitlabCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.status, 0,
      '#266 gl case4: compact-resume must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const lines1 = r1.stdout.trim().split('\n');

    assert.strictEqual(lines1[0], 'Kaola-Workflow compact resume:',
      '#266 gl case4: line[0] must be header, got ' + lines1[0]);
    assert.ok(lines1[1].includes('issue-266-compact'),
      '#266 gl case4: active project must include project name, got ' + lines1[1]);
    assert.ok(lines1.some(line => line === 'claim status: active'),
      '#266 gl case4: packet must retain claim status, got ' + r1.stdout);
    assert.ok(lines1.some(line => line === 'branch: workflow/issue-266'),
      '#266 gl case4: packet must retain sink branch, got ' + r1.stdout);
    // The goal is the mission list's H1 — the one thing a zero-context successor needs first.
    const goalLine = lines1.find(line => line.startsWith('goal:')) || '';
    assert.ok(goalLine.includes('Retire the node executor'),
      '#266 gl case4: goal line must carry the mission list H1, got ' + goalLine);
    // In-flight items are the decision to make, so each must carry its dispatched locator:
    // "look for the work, not the worker" needs somewhere to look.
    const inFlightLine = lines1.find(line => line.startsWith('in-flight:')) || '';
    assert.ok(inFlightLine.includes('delete the node executor'),
      '#266 gl case4: in-flight line must name the in-flight item, got ' + inFlightLine);
    assert.ok(inFlightLine.includes('dispatched:') && inFlightLine.includes('demolish subagent'),
      '#266 gl case4: in-flight line must carry the dispatched locator, got ' + inFlightLine);
    assert.ok(!inFlightLine.includes('extract subagent'),
      '#266 gl case4: a done item must not appear on the in-flight line, got ' + inFlightLine);
    const countsLine = lines1.find(line => line.startsWith('mission counts:')) || '';
    assert.ok(countsLine.includes('done: 1') && countsLine.includes('in-flight: 1') && countsLine.includes('todo: 1'),
      '#266 gl case4: progress line must count every status, got ' + countsLine);

    // --- Determinism: two runs → identical stdout ---
    const r2 = spawnSync(process.execPath, [gitlabCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.stdout, r2.stdout,
      '#266 gl case4 det: two compact-resume runs must produce identical stdout');

    // --- A claim with no mission list yet is a normal state, not an error: the file is a
    // convention, not a precondition. The packet still resumes the claim.
    fs.rmSync(path.join(projDir, 'mission-list.md'));
    const rNoList = spawnSync(process.execPath, [gitlabCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(rNoList.status, 0,
      '#266 gl case4: a claim with no mission list must still exit 0, got ' + rNoList.status);
    const linesNoList = rNoList.stdout.trim().split('\n');
    const noListGoal = linesNoList.find(line => line.startsWith('goal:')) || '';
    assert.ok(noListGoal.includes('unknown'),
      '#266 gl case4: an absent mission list must read as an unknown goal, got ' + noListGoal);
    const noListCounts = linesNoList.find(line => line.startsWith('mission counts:')) || '';
    assert.ok(noListCounts.includes('done: 0') && noListCounts.includes('todo: 0'),
      '#266 gl case4: an absent mission list must count zero items, got ' + noListCounts);

    // --- RED discriminator: no workflow-state → empty stdout ---
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-compact-empty-'));
    try {
      const rEmpty = spawnSync(process.execPath, [gitlabCompactResumeScript],
        { input: JSON.stringify({ cwd: emptyRoot }), encoding: 'utf8' });
      assert.strictEqual(rEmpty.status, 0,
        '#266 gl case4 RED: empty root must exit 0, got ' + rEmpty.status);
      assert.strictEqual(rEmpty.stdout.trim(), '',
        '#266 gl case4 RED: no workflow dir must produce no output, got: ' + rEmpty.stdout);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    console.log('testGitlabCompactResume266 (#266 case 4): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}


// ADR 0018 §5: checkClosureInvariants no longer evaluates any roadmap invariant at all, for any
// archive disposition — the roadmap-mirror-clean cross-reference test (#339) pinned exactly that
// invariant and is deleted with it.

function testForbiddenOnly341() {
  const validatorScript = path.join(__dirname, 'validate-kaola-workflow-gitlab-contracts.js');
  const validatorSrc = fs.readFileSync(validatorScript, 'utf8');
  const idx = (needle) => validatorSrc.indexOf(needle);

  // (AC2) order pin: the forbidden-token scan loop call must precede every count assertion.
  const scanIdx = idx('assertNoForbidden(file);');
  assert.ok(scanIdx !== -1, '#341 gl: validator must contain the assertNoForbidden(file); scan loop');
  // Needles carry the `assert(` prefix so they match the real count assertions, not a
  // `.length ===` substring inside the #341 scan-loop comment. The agent-profile count assertion
  // is gone — the derived config/agents.toml parity guard covers agents/ enumeration-free — so the
  // ordering property is pinned on the two surface counts that remain.
  for (const countNeedle of [
    'assert(commandFiles.length ===', 'assert(skillFiles.length ==='
  ]) {
    const countIdx = idx(countNeedle);
    assert.ok(countIdx !== -1, '#341 gl: validator must contain count assert ' + countNeedle);
    assert.ok(scanIdx < countIdx,
      '#341 gl: forbidden scan must precede count assert ' + countNeedle);
  }

  // (AC1) dirty file → exit 1, message naming a forbidden reference.
  const root = tempRoot('kw-gl-forbidden-');
  try {
    const dirty = path.join(root, 'dirty.toml');
    fs.writeFileSync(dirty, 'Open issues via ' + 'g' + 'h' + ' issue list\n');
    const dirtyRun = spawnSync(process.execPath, [validatorScript, '--forbidden-only', dirty], {
      encoding: 'utf8'
    });
    assert.notStrictEqual(dirtyRun.status, 0, '#341 gl: forbidden token must exit non-zero');
    assert.ok((dirtyRun.stderr || '').includes('contains forbidden reference'),
      '#341 gl: forbidden-only must report "contains forbidden reference"');

    // clean file → exit 0, sentinel. issue-scout.toml (the original #328 leak regression
    // lock) is retired (#789); metric-optimizer.toml is an equally permanent, GitHub-vocabulary-free
    // agent profile. Root-relative path resolves from any cwd.
    const cleanRun = spawnSync(process.execPath,
      [validatorScript, '--forbidden-only', 'plugins/kaola-workflow-gitlab/agents/metric-optimizer.toml'],
      { encoding: 'utf8' });
    assert.strictEqual(cleanRun.status, 0,
      '#341 gl: clean file must exit 0 (stderr: ' + (cleanRun.stderr || '') + ')');
    assert.ok((cleanRun.stdout || '').includes('forbidden-only check passed'),
      '#341 gl: clean run must print the forbidden-only sentinel');

    // usage refusals → exit 2 (fail closed): no files, and an unknown flag.
    const noFiles = spawnSync(process.execPath, [validatorScript, '--forbidden-only'], {
      encoding: 'utf8'
    });
    assert.strictEqual(noFiles.status, 2, '#341 gl: --forbidden-only with no files must exit 2');
    const unknownFlag = spawnSync(process.execPath,
      [validatorScript, '--forbidden' + '_only'], { encoding: 'utf8' });
    assert.strictEqual(unknownFlag.status, 2, '#341 gl: unknown flag must exit 2 (fail closed)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('testForbiddenOnly341 (#341): PASSED');
}

// #507: boundary-2 classifier fetch-retry tests (gitlab edition)
// Tests use withForge to inject a throwing viewIssue stub that records call count.
// Tests are synchronous (classifyIssue is sync); they use assert from require('assert').
function testGitlabBoundary2FetchRetry507() {
  // (a) persistent transient (spawn_fault) → classifyIssue returns verdict:indeterminate
  {
    let callCount = 0;
    const transientErr = new Error('spawn failed');
    // spawn_fault: no e.status, no e.signal, ENOENT code
    transientErr.code = 'ENOENT';
    const root = tempRoot('kw-gl-b2a-root-');
    const tempHome = tempRoot('kw-gl-b2a-home-');
    try {
      const result = withClassifierForge({
        viewIssue: function() { callCount++; throw transientErr; },
        discoverProject() { return { project_id: 1 }; },
        listIssueNotes() { return []; },
      }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#507(gl-b2a): persistent transient → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(result.reasoning_class, 'classifier_error',
        '#507(gl-b2a): indeterminate must carry reasoning_class:classifier_error');
      assert.ok(callCount >= 3,
        '#507(gl-b2a): transient retried to MAX_ATTEMPTS — callCount=' + callCount + ' (expected >=3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
      try { fs.rmSync(tempHome, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b) clean_nonzero GENUINE-NEGATIVE (determinate) → verdict:target_unavailable, NOT retried.
  // #519 RECONCILE: the axis is now stderr-error-CLASS. A clean_nonzero stays determinate-refuse ONLY
  // when its stderr is genuine-negative / unrecognized — so this pin carries a real GitLab 404 stderr
  // ("Could not resolve to an Issue") to prove the genuine arm refuses without retry (a transient-infra
  // stderr would now ESCALATE — covered by (b-transient) below).
  {
    let callCount = 0;
    const cleanErr = new Error('glab exited 1');
    cleanErr.status = 1; // clean non-zero: determinate
    cleanErr.stderr = 'GraphQL: Could not resolve to an Issue with the number of 99. (repository.issue)\n';
    const root = tempRoot('kw-gl-b2b-root-');
    try {
      const result = withClassifierForge({
        viewIssue: function() { callCount++; throw cleanErr; },
        discoverProject() { return { project_id: 1 }; },
        listIssueNotes() { return []; },
      }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'target_unavailable',
        '#519(gl-b2b): genuine-negative clean_nonzero → verdict:target_unavailable (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 1,
        '#519(gl-b2b): determinate genuine NOT retried — callCount=' + callCount + ' (expected 1)');
      // #668(gl-b2b-leak): the human-facing classification reasoning is a fixed, forge-neutral
      // refusal sentence — it must never echo the raw fetch-error text verbatim, nor carry generic
      // CLI diagnostic tokens an unstubbed forge call could emit on failure (auth/flag/status-code
      // noise). This wires the invariant the #659 evidence previously verified only by a manual grep
      // over full test output.
      assert.ok(typeof result.reasoning === 'string' && !result.reasoning.includes(cleanErr.stderr.trim()),
        '#668(gl-b2b-leak): reasoning must NOT echo the raw fetch-error text verbatim (got ' + JSON.stringify(result.reasoning) + ')');
      assert.ok(!/Unknown/.test(result.reasoning),
        '#668(gl-b2b-leak): reasoning must NOT leak an "Unknown"-style CLI diagnostic token (got ' + JSON.stringify(result.reasoning) + ')');
      assert.ok(!/401/.test(result.reasoning),
        '#668(gl-b2b-leak): reasoning must NOT leak a "401"-style CLI diagnostic token (got ' + JSON.stringify(result.reasoning) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b-transient) clean_nonzero with a TRANSIENT-INFRA stderr now ESCALATES → indeterminate + RETRIED.
  // The axis-replacement core: a non-zero exit whose stderr is a TLS timeout flips to transient.
  {
    let callCount = 0;
    const root = tempRoot('kw-gl-b2t-root-');
    try {
      const result = withClassifierForge({ viewIssue: function() {
        callCount++;
        const e = new Error('glab exited 1');
        e.status = 1;
        e.stderr = 'error connecting to gitlab.com: net/http: TLS handshake timeout\n';
        throw e;
      }, discoverProject() { return { project_id: 1 }; }, listIssueNotes() { return []; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return classifier.classifyIssue(99, root); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#519(gl-b2-transient): clean_nonzero TLS-timeout stderr → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 3,
        '#519(gl-b2-transient): transient-infra clean_nonzero RETRIED to max — callCount=' + callCount + ' (expected 3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (c) forge claimExplicitTarget with transient classifyIssue → target_indeterminate result:answer
  // Exercises the #495 forward-compat handler in the gitlab claim.js.
  {
    const root = tempRoot('kw-gl-b2c-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const transientErr = new Error('spawn failed');
      transientErr.code = 'ENOENT';
      // Stub viewIssue on the forge module — classifier.classifyIssue calls forge.viewIssue,
      // and claim.classifyIssue delegates to classifier.classifyIssue → routes through the
      // #495 forward-compat indeterminate handler in claimExplicitTarget.
      const result = withClassifierForge({
        viewIssue: function() { throw transientErr; },
        discoverProject() { return { project_id: 1 }; },
        listIssueNotes() { return []; },
      }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return claim.claimExplicitTarget(root, { targetIssue: 99 });
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result && result.status, 'target_indeterminate',
        '#507(gl-b2c): forge claimExplicitTarget persistent transient → target_indeterminate (got ' + JSON.stringify(result) + ')');
      assert.strictEqual(result && result.result, 'answer',
        '#507(gl-b2c): result must be answer (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (#511) END-TO-END DETERMINATE: a GENUINE-negative forge fault (a real 404 "Could not
  // resolve to an Issue" stderr) routes the FULL claim flow (claimExplicitTarget) to
  // target_unavailable — NEVER the indeterminate status. This is the #511 pin: it MUST use a
  // genuine-negative stderr, never a generic "glab exits 1" / bare network error (which is
  // transient and would enshrine #519's bug). The DETERMINATE/INDETERMINATE split is the whole
  // content of this pin, and it lives in `status`; both arms answer, so `result` discriminates
  // nothing here and asserting it would pin a constant.
  {
    const root = tempRoot('kw-gl-511-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const result = withClassifierForge({ viewIssue: function() {
        const e = new Error('glab exited 1');
        e.status = 1; // clean non-zero
        e.stderr = 'GraphQL: Could not resolve to an Issue with the number of 99. (repository.issue)\n';
        throw e;
      }, discoverProject() { return { project_id: 1 }; }, listIssueNotes() { return []; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return claim.claimExplicitTarget(root, { targetIssue: 99 }); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result && result.status, 'target_unavailable',
        '#511(gl): genuine-negative 404 → claimExplicitTarget target_unavailable (got ' + JSON.stringify(result) + ')');
      assert.notStrictEqual(result && result.status, 'target_indeterminate',
        '#511(gl): a genuine-negative 404 is DETERMINATE — never the transient status (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testGitlabBoundary2FetchRetry507 (#507/#511/#519): PASSED');
}


testInstallSchemaPruneManifest332Gitlab();
testGitlabPreflight266();
testGitlabDispatchPosture598();
testGitlabPreflight571();
testGitlabPreflight332();
testGitlabCompactResume266();
testForbiddenOnly341();
testGitlabBoundary2FetchRetry507();

// #725: the #543 installed_paths partition smoke is retired — the fast/full installer opt-ins
// (`--with-fast`/`--with-full`) and the seedKaolaConfig UNION writer that recorded them are gone;
// adaptive is the only installed path, so the installer never writes installed_paths.

// #579: forge active-folders liveness-marker fields regression — session_marker/claim_ts/main_root
// must be parsed from workflow-state.md and surfaced in readActiveFolders items so that
// classifyLane can bucket a live lane as 'mine' (not 'stale') in the gitlab edition.
// RED against the unfixed gitlab active-folders (session_marker not parsed → undefined →
// classifyLane falls through to stale). GREEN after the fix.
function testGitlabActiveFoldersSessionMarker579() {
  const root = tempRoot('kw-gl-sm579-');
  try {
    const ownSession = 's-MINE-session-579gl';
    const claimTs = new Date(Date.now() - 10000).toISOString();
    writeState(root, 'lane-mine-gl', 579,
      'session_marker: ' + ownSession + '\nmain_root: /repo/root\nclaim_ts: ' + claimTs);
    const folders = active.readActiveFolders(root, { excludeClosedIssues: false });
    assert.strictEqual(folders.length, 1, '#579(gl): expected 1 active folder');
    const item = folders[0];
    assert.strictEqual(item.session_marker, ownSession,
      '#579(gl): readActiveFolders item.session_marker must be "' + ownSession + '", got: ' + item.session_marker);
    const ctx = {
      ownSession,
      explicitResumeIssues: new Set(),
      coTenantSignal: false,
      now: Date.now(),
      staleMs: 3600000
    };
    const laneResult = classifier.classifyLane(item, ctx);
    assert.strictEqual(laneResult.bucket, 'mine',
      '#579(gl): classifyLane must yield mine for own session, got: ' + JSON.stringify(laneResult));
    console.log('testGitlabActiveFoldersSessionMarker579: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGitlabActiveFoldersSessionMarker579();

console.log('GitLab workflow script tests passed');
