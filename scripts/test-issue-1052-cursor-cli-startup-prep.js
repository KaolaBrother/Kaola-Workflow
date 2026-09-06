#!/usr/bin/env node
'use strict';

// Issue #1052: standalone Cursor CLI/local Workflow startup and normal resume must execute
// Repo role prep through the installed --ensure-target transaction against the CLI workspace.
// TEST CUSTODY ONLY. Drives the real claim.js CLI and the real cursor-surface helper.

const spawnCensus = require('./test-spawn-census');
spawnCensus.install('test-issue-1052-cursor-cli-startup-prep');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const REPO = path.resolve(__dirname, '..');
const CLAIM = path.join(REPO, 'scripts', 'kaola-workflow-claim.js');
const INSTALLER = path.join(REPO, 'install-cursor.sh');
const IMPLEMENTER = 'implementer.md';
// Owned explicit identity for standalone CLI/local prep. Omitted product/host is
// not CLI. Do not treat `--runtime cursor` alone as authorization to write Repo.
const CURSOR_CLI_LOCAL = Object.freeze(['--product', 'cli', '--host', 'local']);
const NAMED_FORGE_PORTS = Object.freeze([
  {
    name: 'codex-github',
    claim: path.join(REPO, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js'),
    forge: 'github',
    mockEnv: 'KAOLA_GH_MOCK_SCRIPT',
    mockField: 'ghOpen',
    claimBase: 'kaola-workflow-claim.js',
  },
  {
    name: 'gitlab',
    claim: path.join(REPO, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js'),
    forge: 'gitlab',
    mockEnv: 'KAOLA_GLAB_MOCK_SCRIPT',
    mockField: 'glabOpen',
    claimBase: 'kaola-gitlab-workflow-claim.js',
  },
  {
    name: 'gitea',
    claim: path.join(REPO, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js'),
    forge: 'gitea',
    mockEnv: 'KAOLA_TEA_MOCK_SCRIPT',
    mockField: 'teaOpen',
    claimBase: 'kaola-gitea-workflow-claim.js',
  },
]);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function tmpParent() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

function lastJson(text) {
  const lines = String(text || '').trim().split('\n').filter(l => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch (_) { /* keep scanning */ }
  }
  return null;
}

function combined(result) {
  return String(result.stdout || '') + '\n' + String(result.stderr || '');
}

function walkRel(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  function walk(dir, rel) {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const child = rel ? rel + '/' + name : name;
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs, child);
      else out.push(child);
    }
  }
  walk(root, '');
  return out;
}

function snapshotTree(root) {
  return walkRel(root).map(rel => {
    const abs = path.join(root, rel);
    const st = fs.lstatSync(abs, { bigint: true });
    if (st.isSymbolicLink()) return rel + ':symlink:' + fs.readlinkSync(abs);
    return rel + ':regular:' + fs.readFileSync(abs).toString('hex');
  });
}

function hasProjectAgents(workspace) {
  return fs.existsSync(path.join(workspace, '.cursor', 'agents', IMPLEMENTER));
}

function issueDir(workspace, n) {
  return path.join(workspace, 'kaola-workflow', 'issue-' + n);
}

function makeSandbox() {
  const tmp = fs.mkdtempSync(path.join(tmpParent(), 'kw-1052-'));
  const home = path.join(tmp, 'home');
  const cursorHome = path.join(tmp, 'cursor-home');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(cursorHome, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'agent'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.mkdirSync(path.join(tmp, 'Cursor.app'), { recursive: true });
  const classifier = path.join(tmp, 'classifier-green.js');
  fs.writeFileSync(classifier,
    'process.stdout.write(JSON.stringify({ verdict: "green", reasoning: "ok" }) + "\\n");\n'
    + 'process.exit(0);\n');
  const ghOpen = path.join(tmp, 'gh-open.js');
  fs.writeFileSync(ghOpen,
    'const a = process.argv.slice(2);\n'
    + 'if (a[0] === "issue" && a[1] === "view") {\n'
    + '  process.stdout.write(JSON.stringify({ state: "OPEN", number: 1, title: "t", body: "", labels: [] }) + "\\n");\n'
    + '  process.exit(0);\n'
    + '}\n'
    + 'process.stdout.write("");\n'
    + 'process.exit(0);\n');
  const glabOpen = path.join(tmp, 'glab-open.js');
  fs.writeFileSync(glabOpen,
    'const a = process.argv.slice(2);\n'
    + 'if (a[0] === "repo" && a[1] === "view") {\n'
    + '  process.stdout.write(JSON.stringify({ id: 1, path_with_namespace: "o/r", web_url: "http://example.test" }) + "\\n");\n'
    + '  process.exit(0);\n'
    + '}\n'
    + 'if (a[0] === "issue" && a[1] === "view") {\n'
    + '  process.stdout.write(JSON.stringify({ iid: Number(a[2]) || 1, state: "opened", title: "t", description: "", labels: [] }) + "\\n");\n'
    + '  process.exit(0);\n'
    + '}\n'
    + 'process.stdout.write("");\n'
    + 'process.exit(0);\n');
  const teaOpen = path.join(tmp, 'tea-open.js');
  fs.writeFileSync(teaOpen,
    'const a = process.argv.slice(2);\n'
    + 'if (a[0] === "repo" && a[1] === "view") {\n'
    + '  process.stdout.write(JSON.stringify({ full_name: "o/r", owner: { login: "o" }, name: "r", html_url: "http://example.test" }) + "\\n");\n'
    + '  process.exit(0);\n'
    + '}\n'
    + 'if (a[0] === "issues" && a[1] === "view") {\n'
    + '  process.stdout.write(JSON.stringify({ number: Number(a[2]) || 1, state: "open", title: "t", body: "", labels: [] }) + "\\n");\n'
    + '  process.exit(0);\n'
    + '}\n'
    + 'process.stdout.write("");\n'
    + 'process.exit(0);\n');
  const env = Object.assign({}, process.env, {
    HOME: home,
    USERPROFILE: home,
    CURSOR_HOME: cursorHome,
    PATH: bin + path.delimiter + process.env.PATH,
    KAOLA_WORKFLOW_OFFLINE: '1',
    KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    KAOLA_CLASSIFIER_TIMEOUT_MS: '500',
    KAOLA_CLASSIFIER_BACKOFF_MS: '0',
    KAOLA_PATH: 'adaptive',
    KAOLA_CLASSIFIER_MOCK_SCRIPT: classifier,
  });
  // spawn-class: environment
  const install = spawnSync('bash', [INSTALLER, '--global', '--yes'], {
    cwd: REPO, env, encoding: 'utf8', timeout: 120000,
  });
  const helper = path.join(cursorHome, 'kaola-workflow', 'scripts', 'kaola-workflow-cursor-surface.js');
  return { tmp, home, cursorHome, bin, env, helper, install, classifier, ghOpen, glabOpen, teaOpen };
}

function makeRepo(sandbox, label) {
  const repo = fs.mkdtempSync(path.join(sandbox.tmp, 'repo-' + label + '-'));
  G.init(repo, { branch: 'main' });
  G.git(repo, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.kw/\n');
  G.commitAll(repo, 'init');
  return fs.realpathSync(repo);
}

function runClaim(sandbox, cwd, argv, extraEnv) {
  return runNamedClaim(sandbox, cwd, CLAIM, argv, extraEnv);
}

function runNamedClaim(sandbox, cwd, claimPath, argv, extraEnv) {
  const env = Object.assign({}, sandbox.env, extraEnv || {});
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [claimPath].concat(argv), {
    cwd, env, encoding: 'utf8', timeout: 60000,
  });
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    json: lastJson(result.stdout) || lastJson(result.stderr),
    raw: combined(result),
  };
}

function runHelper(sandbox, args, cwd) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [sandbox.helper].concat(args), {
    cwd: cwd || sandbox.tmp,
    env: sandbox.env,
    encoding: 'utf8',
    timeout: 60000,
  });
}

function writeMissionList(workspace, issue, extraInFlight) {
  const dir = issueDir(workspace, issue);
  const body = [
    '# Mission — fixture',
    '',
    '| item | status | dispatched | result |',
    '|---|---|---|---|',
    '| Completed outcome | done | inline | PASS: frozen completed result |',
    '| ' + (extraInFlight || 'In-flight outcome') + ' | in-flight | implementer → worktree |  |',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'mission-list.md'), body);
  return body;
}

function diagnosticIsInstallFault(text) {
  const blob = String(text || '');
  if (/Task unsupported/i.test(blob)) return false;
  return /collision|unmanaged|symlink|authorit|install|receipt|stale/i.test(blob);
}

function acquired(json) {
  return !!(json && (json.claim === 'acquired' || json.status === 'acquired'));
}

function stateField(workspace, issue, name) {
  const p = path.join(issueDir(workspace, issue), 'workflow-state.md');
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.+)$', 'm'));
  return m ? m[1].trim() : '';
}

function assertNoExtraRepoWrite(r, workspace, label) {
  assert(r.status === 0 && acquired(r.json) && !hasProjectAgents(workspace),
    label + ' (got ' + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 300) + ')');
}

const sandbox = makeSandbox();
try {
  assert(sandbox.install.status === 0 && fs.existsSync(sandbox.helper),
    '#1052-fixture: isolated --global install must succeed and receipt the helper (status='
    + sandbox.install.status + ' stderr=' + String(sandbox.install.stderr || '').slice(0, 300) + ')');

  // --- startup on empty consumer: prep before claim, match real ensure-target, restart-required
  {
    const workspace = makeRepo(sandbox, 'startup');
    const nested = path.join(workspace, 'nested-cwd');
    fs.mkdirSync(nested, { recursive: true });
    const neighbor = makeRepo(sandbox, 'neighbor');
    const twin = fs.mkdtempSync(path.join(sandbox.tmp, 'twin-'));
    const twinEnsure = runHelper(sandbox, ['--ensure-target', twin, '--forge=github', '--json'], twin);
    let twinBody = null;
    try { twinBody = JSON.parse(twinEnsure.stdout); } catch (_) { /* asserted below */ }
    assert(twinEnsure.status === 0 && twinBody && (twinBody.status === 'materialized' || twinBody.status === 'current'),
      '#1052-helper-control: isolated helper --ensure-target still materializes (status='
      + twinEnsure.status + ' body=' + JSON.stringify(twinBody) + ')');

    const r = runClaim(sandbox, nested, [
      'startup', '--target-issue', '10521', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const agents = path.join(workspace, '.cursor', 'agents', IMPLEMENTER);
    const receipt = path.join(workspace, '.cursor', 'kaola-workflow-materialization.json');
    const nestedAgents = path.join(nested, '.cursor', 'agents', IMPLEMENTER);
    const neighborAgents = path.join(neighbor, '.cursor', 'agents', IMPLEMENTER);
    assert(r.status === 0 && r.json && (r.json.claim === 'acquired' || r.json.status === 'acquired'),
      '#1052-startup-empty: Cursor CLI/local startup must still acquire after prep (got '
      + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 400) + ')');
    assert(fs.existsSync(agents) && fs.existsSync(receipt),
      '#1052-startup-empty: startup must prepare the CLI workspace via ensure-target before named dispatch can be skipped (missing '
      + agents + ' or receipt)');
    assert(!fs.existsSync(nestedAgents),
      '#1052-startup-empty: decoy nested cwd must not receive Repo prep');
    assert(!fs.existsSync(neighborAgents),
      '#1052-startup-empty: a neighboring repo must not receive Repo prep');
    const managed = rel => walkRel(path.join(rel, '.cursor'))
      .filter(name => name !== 'kaola-workflow-materialization.json');
    const managedSnap = root => managed(root).map(name =>
      name + ':' + fs.readFileSync(path.join(root, '.cursor', name)).toString('hex'));
    assert(JSON.stringify(managedSnap(workspace)) === JSON.stringify(managedSnap(twin)),
      '#1052-startup-empty: startup prep must reuse the full ensure-target write set, not an agents-only copy — workspace='
      + JSON.stringify(managed(workspace)) + ' twin=' + JSON.stringify(managed(twin)));
    let receiptBody = null;
    try { receiptBody = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch (_) { /* asserted below */ }
    assert(receiptBody && receiptBody.kind === 'cursor_project_materialization' && receiptBody.target === workspace,
      '#1052-startup-empty: project receipt must be the real ensure-target transaction for the CLI workspace (got '
      + JSON.stringify(receiptBody) + ')');
    const restart = JSON.stringify(r.json);
    assert(/new_process_same_chat/.test(restart) || r.json.restart_required === true
      || r.json.reload_boundary === 'new_process_same_chat'
      || (r.json.cursor_prep && r.json.cursor_prep.restart_boundary === 'new_process_same_chat'),
      '#1052-startup-empty: a materializing write must report the measured CLI restart-required boundary new_process_same_chat (got '
      + JSON.stringify(r.json) + ')');
    assert(!/live-loaded|same-process hot load succeeded/i.test(r.raw),
      '#1052-startup-empty: must not claim live-loaded profiles without live verification');
  }

  // --- fail-closed collision: no claim folder, no overwrite, install fault not Task-unsupported
  {
    const workspace = makeRepo(sandbox, 'collision');
    const collisionFile = path.join(workspace, '.cursor', 'agents', IMPLEMENTER);
    fs.mkdirSync(path.dirname(collisionFile), { recursive: true });
    fs.writeFileSync(collisionFile, 'UNMANAGED_OWNER_BYTES\n');
    const before = snapshotTree(path.join(workspace, '.cursor'));
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10522', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const after = snapshotTree(path.join(workspace, '.cursor'));
    assert(r.status !== 0 && !(r.json && (r.json.claim === 'acquired' || r.json.status === 'acquired')),
      '#1052-collision: unmanaged canonical-name collision must fail closed before claim mutation (got status='
      + r.status + ' json=' + JSON.stringify(r.json) + ')');
    assert(!fs.existsSync(issueDir(workspace, 10522)),
      '#1052-collision: issue folder must not exist when prep fails closed');
    assert(JSON.stringify(after) === JSON.stringify(before)
      && fs.readFileSync(collisionFile, 'utf8') === 'UNMANAGED_OWNER_BYTES\n',
      '#1052-collision: target must not be partially overwritten');
    assert(diagnosticIsInstallFault(r.raw),
      '#1052-collision: diagnostic must be an install fault, not Task-unsupported — ' + r.raw.slice(0, 400));
  }

  // --- symlink fail-closed
  {
    const workspace = makeRepo(sandbox, 'symlink');
    const owner = path.join(workspace, 'outside-owner.md');
    const link = path.join(workspace, '.cursor', 'agents', IMPLEMENTER);
    fs.writeFileSync(owner, 'SYMLINK_OWNER_BYTES\n');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(owner, link);
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10523', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    assert(r.status !== 0 && !fs.existsSync(issueDir(workspace, 10523))
      && fs.lstatSync(link).isSymbolicLink()
      && fs.readFileSync(owner, 'utf8') === 'SYMLINK_OWNER_BYTES\n',
      '#1052-symlink: managed-basename symlink must fail closed without following it (status='
      + r.status + ' json=' + JSON.stringify(r.json) + ')');
    assert(diagnosticIsInstallFault(r.raw),
      '#1052-symlink: diagnostic must be an install fault — ' + r.raw.slice(0, 400));
  }

  // --- missing global authority
  {
    const workspace = makeRepo(sandbox, 'noauth');
    const isolatedHome = path.join(sandbox.tmp, 'empty-cursor-home');
    fs.mkdirSync(isolatedHome, { recursive: true });
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10524', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']), { CURSOR_HOME: isolatedHome });
    assert(r.status !== 0 && !fs.existsSync(issueDir(workspace, 10524)) && !hasProjectAgents(workspace),
      '#1052-missing-authority: missing global authority must fail closed before claim (status='
      + r.status + ' json=' + JSON.stringify(r.json) + ')');
    assert(diagnosticIsInstallFault(r.raw) && !/Task unsupported/i.test(r.raw),
      '#1052-missing-authority: must report an install fault, not Task-unsupported — ' + r.raw.slice(0, 400));
  }

  // --- stale global authority
  {
    const workspace = makeRepo(sandbox, 'stale');
    const globalAgent = path.join(sandbox.cursorHome, 'agents', IMPLEMENTER);
    const original = fs.readFileSync(globalAgent);
    fs.writeFileSync(globalAgent, 'STALE_GLOBAL_AUTHORITY_BYTES\n');
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10525', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    fs.writeFileSync(globalAgent, original);
    assert(r.status !== 0 && !fs.existsSync(issueDir(workspace, 10525)) && !hasProjectAgents(workspace),
      '#1052-stale-authority: hash-stale global authority must fail before claim mutation (status='
      + r.status + ' json=' + JSON.stringify(r.json) + ')');
    assert(diagnosticIsInstallFault(r.raw),
      '#1052-stale-authority: diagnostic must be an install fault — ' + r.raw.slice(0, 400));
  }

  // --- resume of an existing run: check missing roles, no re-claim, preserve Mission List
  {
    const workspace = makeRepo(sandbox, 'resume');
    const first = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10526', '--runtime', 'claude', '--json',
    ]);
    assert(first.json && (first.json.claim === 'acquired' || first.json.status === 'acquired'),
      '#1052-resume-seed: non-Cursor startup must acquire the fixture run (got '
      + JSON.stringify(first.json) + ')');
    const statePath = path.join(issueDir(workspace, 10526), 'workflow-state.md');
    const stateBefore = fs.readFileSync(statePath, 'utf8');
    const missionBefore = writeMissionList(workspace, 10526);
    assert(!hasProjectAgents(workspace),
      '#1052-resume-seed: the claude startup must not have written Cursor project roles');
    const resume = runClaim(sandbox, workspace, [
      'resume', '--project', 'issue-10526', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const stateAfter = fs.readFileSync(statePath, 'utf8');
    const missionAfter = fs.readFileSync(path.join(issueDir(workspace, 10526), 'mission-list.md'), 'utf8');
    assert(resume.json && resume.json.resumed === true && resume.json.project === 'issue-10526',
      '#1052-resume: resume must keep the existing run identity (got ' + JSON.stringify(resume.json) + ')');
    assert(hasProjectAgents(workspace),
      '#1052-resume: missing/stale roles must still be prepared on resume');
    assert(stateAfter === stateBefore,
      '#1052-resume: resume must not mutate the existing claim identity/state bytes');
    assert(missionAfter === missionBefore,
      '#1052-resume: completed Mission List results and in-flight rows must be preserved');
    assert(resume.json.claim !== 'acquired',
      '#1052-resume: must not perform a second claim');
  }

  // --- already-consistent re-entry is a no-write; a refresh that writes reports restart
  {
    const workspace = makeRepo(sandbox, 'idem');
    const ensure = runHelper(sandbox, ['--ensure-target', workspace, '--forge=github', '--json'], workspace);
    assert(ensure.status === 0, '#1052-idempotent-seed: helper ensure of the workspace must succeed');
    const before = snapshotTree(path.join(workspace, '.cursor'));
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10527', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const after = snapshotTree(path.join(workspace, '.cursor'));
    assert(r.json && (r.json.claim === 'acquired' || r.json.status === 'acquired'),
      '#1052-idempotent: consistent CLI startup must still claim (got ' + JSON.stringify(r.json) + ')');
    assert(JSON.stringify(after) === JSON.stringify(before),
      '#1052-idempotent: already-consistent ensure must be a byte-level no-write');
    const agentPath = path.join(workspace, '.cursor', 'agents', IMPLEMENTER);
    fs.unlinkSync(agentPath);
    const refresh = runClaim(sandbox, workspace, [
      'resume', '--project', 'issue-10527', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    assert(fs.existsSync(agentPath),
      '#1052-refresh: a missing managed role on resume must be restored by ensure-target');
    const refreshJson = JSON.stringify(refresh.json || {});
    assert(/new_process_same_chat/.test(refreshJson) || refresh.json.restart_required === true
      || refresh.json.reload_boundary === 'new_process_same_chat'
      || (refresh.json && refresh.json.cursor_prep && refresh.json.cursor_prep.restart_boundary === 'new_process_same_chat'),
      '#1052-refresh: a safe refresh that writes must surface restart-required (got '
      + JSON.stringify(refresh.json) + ')');
  }

  // --- worktree vs workspace: prep the opened CLI workspace, not the write-worktree
  {
    const workspace = makeRepo(sandbox, 'worktree');
    const r = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10528', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']), {
      KAOLA_WORKFLOW_OFFLINE: '',
      KAOLA_GH_MOCK_SCRIPT: sandbox.ghOpen,
    });
    const wt = r.json && (r.json.worktree_path || (r.json.folder && r.json.folder.worktree_path) || '');
    assert(hasProjectAgents(workspace),
      '#1052-workspace-vs-worktree: CLI workspace must receive Repo prep (json='
      + JSON.stringify(r.json) + ')');
    if (wt) {
      assert(!fs.existsSync(path.join(wt, '.cursor', 'agents', IMPLEMENTER)),
        '#1052-workspace-vs-worktree: claim-created write-worktree must not be the ensure target ('
        + wt + ')');
    }
  }

  // --- non-Cursor runtime, App/Cloud explicit product/host, read-only status/list: no extra Repo writes
  {
    const workspace = makeRepo(sandbox, 'negatives');
    const claude = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10529', '--runtime', 'claude', '--json',
    ]);
    assert(claude.json && (claude.json.claim === 'acquired' || claude.json.status === 'acquired')
      && !hasProjectAgents(workspace),
      '#1052-non-cursor: --runtime claude must not write Cursor project roles (got '
      + JSON.stringify(claude.json) + ')');

    const appLocal = makeRepo(sandbox, 'app-local');
    const app = runClaim(sandbox, appLocal, [
      'startup', '--target-issue', '10530', '--runtime', 'cursor',
      '--product', 'app', '--host', 'local', '--json',
    ]);
    assert(app.json && (app.json.claim === 'acquired' || app.json.status === 'acquired')
      && !hasProjectAgents(appLocal),
      '#1052-app-local: explicit Cursor App/local must not infer CLI ensure or write project roles (got '
      + JSON.stringify(app.json) + ' raw=' + app.raw.slice(0, 300) + ')');

    const appCloud = makeRepo(sandbox, 'app-cloud');
    const cloud = runClaim(sandbox, appCloud, [
      'startup', '--target-issue', '10531', '--runtime', 'cursor',
      '--product', 'app', '--host', 'cloud', '--json',
    ]);
    assert(cloud.json && (cloud.json.claim === 'acquired' || cloud.json.status === 'acquired')
      && !hasProjectAgents(appCloud),
      '#1052-app-cloud: explicit Cursor App/Cloud must not apply CLI ensure (got '
      + JSON.stringify(cloud.json) + ' raw=' + cloud.raw.slice(0, 300) + ')');

    const ro = makeRepo(sandbox, 'readonly');
    const beforeStatus = snapshotTree(ro);
    const status = runClaim(sandbox, ro, ['status', '--runtime', 'cursor', '--json']);
    const list = runClaim(sandbox, ro, ['list-open', '--runtime', 'cursor', '--json']);
    const afterStatus = snapshotTree(ro);
    assert(status.status === 0 && list.status === 0 && JSON.stringify(afterStatus) === JSON.stringify(beforeStatus)
      && !hasProjectAgents(ro),
      '#1052-readonly: ordinary status/list-open keep zero-write semantics under --runtime cursor');
    const beforeCliStatus = snapshotTree(ro);
    const statusCli = runClaim(sandbox, ro, ['status', '--runtime', 'cursor'].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const listCli = runClaim(sandbox, ro, ['list-open', '--runtime', 'cursor'].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    const afterCliStatus = snapshotTree(ro);
    assert(statusCli.status === 0 && listCli.status === 0
      && JSON.stringify(afterCliStatus) === JSON.stringify(beforeCliStatus)
      && !hasProjectAgents(ro),
      '#1052-readonly-cli-local: status/list-open stay zero-write even with explicit CLI/local identity');
  }

  // --- host identity: extra Repo writes only for explicit --product cli --host local
  {
    const cases = [
      {
        label: '#1052-identity-omitted: --runtime cursor with product/host omitted is identity-unknown and must not write Repo',
        argv: ['startup', '--target-issue', '10540', '--runtime', 'cursor', '--json'],
      },
      {
        label: '#1052-identity-cli-cloud: --runtime cursor --product cli --host cloud is not CLI/local and must not write Repo',
        argv: ['startup', '--target-issue', '10541', '--runtime', 'cursor',
          '--product', 'cli', '--host', 'cloud', '--json'],
      },
      {
        label: '#1052-identity-product-unknown: --runtime cursor --product unknown must not write Repo',
        argv: ['startup', '--target-issue', '10542', '--runtime', 'cursor',
          '--product', 'unknown', '--json'],
      },
      {
        label: '#1052-identity-host-unknown: --runtime cursor --host unknown must not write Repo',
        argv: ['startup', '--target-issue', '10543', '--runtime', 'cursor',
          '--host', 'unknown', '--json'],
      },
      {
        label: '#1052-identity-host-cloud-no-product: --runtime cursor --host cloud without product is not explicit CLI/local',
        argv: ['startup', '--target-issue', '10544', '--runtime', 'cursor',
          '--host', 'cloud', '--json'],
      },
      {
        label: '#1052-identity-product-cli-no-host: --product cli without --host local is an incomplete pair and must not write Repo',
        argv: ['startup', '--target-issue', '10545', '--runtime', 'cursor',
          '--product', 'cli', '--json'],
      },
      {
        label: '#1052-identity-host-local-no-product: --host local without --product cli is not explicit CLI and must not write Repo',
        argv: ['startup', '--target-issue', '10546', '--runtime', 'cursor',
          '--host', 'local', '--json'],
      },
    ];
    for (const spec of cases) {
      const workspace = makeRepo(sandbox, 'id-' + spec.argv[2]);
      const r = runClaim(sandbox, workspace, spec.argv);
      assertNoExtraRepoWrite(r, workspace, spec.label);
    }

    const resumeWorkspace = makeRepo(sandbox, 'id-resume-omitted');
    const seed = runClaim(sandbox, resumeWorkspace, [
      'startup', '--target-issue', '10549', '--runtime', 'claude', '--json',
    ]);
    assert(acquired(seed.json),
      '#1052-identity-resume-omitted-seed: claude startup must acquire (got ' + JSON.stringify(seed.json) + ')');
    const resumeOmitted = runClaim(sandbox, resumeWorkspace, [
      'resume', '--project', 'issue-10549', '--runtime', 'cursor', '--json',
    ]);
    assert(resumeOmitted.json && resumeOmitted.json.resumed === true
      && resumeOmitted.json.project === 'issue-10549'
      && !hasProjectAgents(resumeWorkspace),
      '#1052-identity-resume-omitted: resume --runtime cursor without product/host must not write Repo (got '
      + JSON.stringify(resumeOmitted.json) + ')');
  }

  // --- cwd = claim-created write-worktree: prep recorded CLI workspace (main_root), not worktree
  {
    const workspace = makeRepo(sandbox, 'wt-cwd');
    const decoy = makeRepo(sandbox, 'wt-decoy');
    const first = runClaim(sandbox, workspace, [
      'startup', '--target-issue', '10547', '--runtime', 'claude', '--json',
    ], {
      KAOLA_WORKFLOW_OFFLINE: '',
      KAOLA_GH_MOCK_SCRIPT: sandbox.ghOpen,
    });
    const wt = first.json && (first.json.worktree_path || (first.json.folder && first.json.folder.worktree_path) || '');
    const mainRoot = stateField(workspace, 10547, 'main_root') || workspace;
    assert(first.status === 0 && acquired(first.json) && wt && fs.existsSync(wt),
      '#1052-worktree-cwd-seed: claude startup must create a write-worktree (got '
      + JSON.stringify(first.json) + ')');
    assert(!hasProjectAgents(workspace) && !hasProjectAgents(wt),
      '#1052-worktree-cwd-seed: non-Cursor seed must not have written Cursor project roles');
    // Linked write-worktrees do not automatically carry the live kaola-workflow folder.
    // Copy it so resume can locate the run; the oracle is which tree receives Repo prep.
    fs.cpSync(issueDir(workspace, 10547), issueDir(wt, 10547), { recursive: true });
    const resume = runClaim(sandbox, wt, [
      'resume', '--project', 'issue-10547', '--runtime', 'cursor',
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    assert(resume.json && resume.json.resumed === true && resume.json.project === 'issue-10547',
      '#1052-worktree-cwd: resume from write-worktree cwd must keep the existing run (got '
      + JSON.stringify(resume.json) + ' raw=' + resume.raw.slice(0, 400) + ')');
    assert(hasProjectAgents(mainRoot) || hasProjectAgents(workspace),
      '#1052-worktree-cwd: Repo prep must target the recorded CLI workspace/main_root, not silent cwd ('
      + mainRoot + ')');
    assert(!fs.existsSync(path.join(wt, '.cursor', 'agents', IMPLEMENTER)),
      '#1052-worktree-cwd: claim-created write-worktree must not receive extra Repo writes (' + wt + ')');
    assert(!hasProjectAgents(decoy),
      '#1052-worktree-cwd: a decoy cwd/repo must not receive Repo prep');
  }

  // --- explicit --cursor-workspace locator beats invoking-process git toplevel
  {
    const workspace = makeRepo(sandbox, 'explicit-ws');
    const decoyCwd = makeRepo(sandbox, 'explicit-decoy-cwd');
    const r = runClaim(sandbox, decoyCwd, [
      'startup', '--target-issue', '10548', '--runtime', 'cursor',
      '--cursor-workspace', workspace,
    ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
    assert(r.status === 0 && acquired(r.json),
      '#1052-cursor-workspace: explicit CLI workspace locator must still allow claim (got '
      + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 400) + ')');
    assert(hasProjectAgents(workspace),
      '#1052-cursor-workspace: prep must target --cursor-workspace, not the decoy git toplevel');
    assert(!hasProjectAgents(decoyCwd),
      '#1052-cursor-workspace: decoy cwd git toplevel must not receive extra Repo writes');
  }

  // --- named forge claim.js ports: generated Next identity flags are accepted and prep runs
  function refusedUnknownIdentity(r) {
    return !!(r.json && r.json.reason === 'unknown_flag'
      && Array.isArray(r.json.unknownFlags)
      && (r.json.unknownFlags.indexOf('--product') >= 0 || r.json.unknownFlags.indexOf('--host') >= 0
        || r.json.unknownFlags.indexOf('--cursor-workspace') >= 0));
  }
  function portOnlineEnv(port) {
    const extra = { KAOLA_WORKFLOW_OFFLINE: '' };
    extra[port.mockEnv] = sandbox[port.mockField];
    return extra;
  }
  for (const port of NAMED_FORGE_PORTS) {
    const tag = '#1052-port[' + port.name + ']';
    assert(fs.existsSync(port.claim), tag + ': named claim.js must exist at ' + port.claim);

    {
      const workspace = makeRepo(sandbox, port.name + '-startup');
      const nested = path.join(workspace, 'nested-cwd');
      fs.mkdirSync(nested, { recursive: true });
      const twin = fs.mkdtempSync(path.join(sandbox.tmp, 'twin-' + port.name + '-'));
      const twinEnsure = runHelper(sandbox, ['--ensure-target', twin, '--forge=github', '--json'], twin);
      let twinBody = null;
      try { twinBody = JSON.parse(twinEnsure.stdout); } catch (_) { /* below */ }
      assert(twinEnsure.status === 0 && twinBody && (twinBody.status === 'materialized' || twinBody.status === 'current'),
        tag + '-helper-control: installed helper --ensure-target still materializes (status='
        + twinEnsure.status + ' body=' + JSON.stringify(twinBody) + ')');
      const r = runNamedClaim(sandbox, nested, port.claim, [
        'startup', '--target-issue', '11521', '--runtime', 'cursor',
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(!refusedUnknownIdentity(r),
        tag + '-startup-flags: named claim.js must accept explicit --product cli --host local, not unknown_flag (got '
        + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 400) + ')');
      assert(r.status === 0 && acquired(r.json),
        tag + '-startup-empty: CLI/local startup must still acquire after prep (got '
        + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 400) + ')');
      const agents = path.join(workspace, '.cursor', 'agents', IMPLEMENTER);
      const receipt = path.join(workspace, '.cursor', 'kaola-workflow-materialization.json');
      assert(fs.existsSync(agents) && fs.existsSync(receipt),
        tag + '-startup-empty: must execute installed --ensure-target Repo prep on the CLI workspace');
      assert(!fs.existsSync(path.join(nested, '.cursor', 'agents', IMPLEMENTER)),
        tag + '-startup-empty: decoy nested cwd must not receive Repo prep');
      const managed = rel => walkRel(path.join(rel, '.cursor'))
        .filter(name => name !== 'kaola-workflow-materialization.json');
      const managedSnap = root => managed(root).map(name =>
        name + ':' + fs.readFileSync(path.join(root, '.cursor', name)).toString('hex'));
      assert(JSON.stringify(managedSnap(workspace)) === JSON.stringify(managedSnap(twin)),
        tag + '-startup-empty: prep must reuse the full installed ensure-target write set, not an agents-only copy');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-app');
      const app = runNamedClaim(sandbox, workspace, port.claim, [
        'startup', '--target-issue', '11530', '--runtime', 'cursor',
        '--product', 'app', '--host', 'local', '--json',
      ]);
      assert(!refusedUnknownIdentity(app),
        tag + '-app-local-flags: App/local identity flags must be known (got ' + JSON.stringify(app.json) + ')');
      assertNoExtraRepoWrite(app, workspace,
        tag + '-app-local: explicit Cursor App/local must not infer CLI ensure or write project roles');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-omitted');
      const omitted = runNamedClaim(sandbox, workspace, port.claim, [
        'startup', '--target-issue', '11540', '--runtime', 'cursor', '--json',
      ]);
      assertNoExtraRepoWrite(omitted, workspace,
        tag + '-identity-omitted: --runtime cursor without product/host must still claim and must not write Repo');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-incomplete');
      const incomplete = runNamedClaim(sandbox, workspace, port.claim, [
        'startup', '--target-issue', '11545', '--runtime', 'cursor',
        '--product', 'cli', '--json',
      ]);
      assert(!refusedUnknownIdentity(incomplete),
        tag + '-identity-product-cli-no-host: --product cli must be a known flag (got '
        + JSON.stringify(incomplete.json) + ')');
      assertNoExtraRepoWrite(incomplete, workspace,
        tag + '-identity-product-cli-no-host: incomplete pair must skip ensure but still claim');
    }

    {
      const resumeWorkspace = makeRepo(sandbox, port.name + '-resume-omitted');
      const seed = runNamedClaim(sandbox, resumeWorkspace, port.claim, [
        'startup', '--target-issue', '11549', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(seed.json),
        tag + '-identity-resume-omitted-seed: non-Cursor startup must acquire (got '
        + JSON.stringify(seed.json) + ')');
      const resumeOmitted = runNamedClaim(sandbox, resumeWorkspace, port.claim, [
        'resume', '--project', 'issue-11549', '--runtime', 'cursor', '--json',
      ]);
      assert(resumeOmitted.json && resumeOmitted.json.resumed === true
        && resumeOmitted.json.project === 'issue-11549'
        && !hasProjectAgents(resumeWorkspace),
        tag + '-identity-resume-omitted: resume without product/host must not write Repo (got '
        + JSON.stringify(resumeOmitted.json) + ')');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-resume-cli');
      const seed = runNamedClaim(sandbox, workspace, port.claim, [
        'startup', '--target-issue', '11526', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(seed.json),
        tag + '-resume-seed: non-Cursor startup must acquire (got ' + JSON.stringify(seed.json) + ')');
      const missionBefore = writeMissionList(workspace, 11526);
      const resume = runNamedClaim(sandbox, workspace, port.claim, [
        'resume', '--project', 'issue-11526', '--runtime', 'cursor',
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(!refusedUnknownIdentity(resume),
        tag + '-resume-flags: resume --product cli --host local must not be unknown_flag (got '
        + JSON.stringify(resume.json) + ')');
      assert(resume.json && resume.json.resumed === true && resume.json.project === 'issue-11526',
        tag + '-resume: resume must keep the existing run (got ' + JSON.stringify(resume.json) + ')');
      assert(hasProjectAgents(workspace),
        tag + '-resume: missing roles must be prepared on CLI/local resume');
      const missionAfter = fs.readFileSync(path.join(issueDir(workspace, 11526), 'mission-list.md'), 'utf8');
      assert(missionAfter === missionBefore,
        tag + '-resume: Mission List bytes must be preserved');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-wt-cwd');
      const first = runNamedClaim(sandbox, workspace, port.claim, [
        'startup', '--target-issue', '11547', '--runtime', 'claude', '--json',
      ], portOnlineEnv(port));
      const wt = first.json && (first.json.worktree_path || (first.json.folder && first.json.folder.worktree_path) || '');
      const mainRoot = stateField(workspace, 11547, 'main_root') || workspace;
      assert(first.status === 0 && acquired(first.json) && wt && fs.existsSync(wt),
        tag + '-worktree-cwd-seed: non-Cursor startup must create a write-worktree (got '
        + JSON.stringify(first.json) + ' raw=' + first.raw.slice(0, 300) + ')');
      fs.cpSync(issueDir(workspace, 11547), issueDir(wt, 11547), { recursive: true });
      const resume = runNamedClaim(sandbox, wt, port.claim, [
        'resume', '--project', 'issue-11547', '--runtime', 'cursor',
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(!refusedUnknownIdentity(resume),
        tag + '-worktree-cwd-flags: resume CLI/local from write-worktree cwd must accept identity flags (got '
        + JSON.stringify(resume.json) + ')');
      assert(resume.json && resume.json.resumed === true && resume.json.project === 'issue-11547',
        tag + '-worktree-cwd: resume from write-worktree cwd must keep the run (got '
        + JSON.stringify(resume.json) + ' raw=' + resume.raw.slice(0, 400) + ')');
      assert(hasProjectAgents(mainRoot) || hasProjectAgents(workspace),
        tag + '-worktree-cwd: Repo prep must target recorded main_root, not write-worktree cwd');
      assert(!fs.existsSync(path.join(wt, '.cursor', 'agents', IMPLEMENTER)),
        tag + '-worktree-cwd: write-worktree must not receive extra Repo writes');
    }

    {
      const workspace = makeRepo(sandbox, port.name + '-explicit-ws');
      const decoyCwd = makeRepo(sandbox, port.name + '-explicit-decoy');
      const r = runNamedClaim(sandbox, decoyCwd, port.claim, [
        'startup', '--target-issue', '11548', '--runtime', 'cursor',
        '--cursor-workspace', workspace,
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(!refusedUnknownIdentity(r),
        tag + '-cursor-workspace-flags: --cursor-workspace must be a known flag (got '
        + JSON.stringify(r.json) + ')');
      assert(r.status === 0 && acquired(r.json),
        tag + '-cursor-workspace: explicit locator must still allow claim (got '
        + JSON.stringify(r.json) + ' raw=' + r.raw.slice(0, 400) + ')');
      assert(hasProjectAgents(workspace),
        tag + '-cursor-workspace: prep must target --cursor-workspace, not decoy cwd');
      assert(!hasProjectAgents(decoyCwd),
        tag + '-cursor-workspace: decoy cwd must not receive extra Repo writes');
    }
  }
} finally {
  try { fs.rmSync(sandbox.tmp, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
}

spawnCensus.report();
if (failed) {
  console.error('\nissue-1052 cursor CLI startup/resume prep FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('issue-1052 cursor CLI startup/resume prep passed (' + passed + ' assertions).');
