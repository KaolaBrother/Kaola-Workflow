#!/usr/bin/env node
'use strict';

// Issue #1052: standalone Cursor CLI/local Workflow startup and normal resume must execute
// Repo role prep through the installed --ensure-target transaction against the CLI workspace.
// TEST CUSTODY ONLY. Drives the real claim.js CLI, generated Next default fences, and the
// real cursor-surface helper. Normal CLI-positive generated path uses demonstrated
// `--workspace` context only — not invented CURSOR_PRODUCT / KAOLA_CURSOR_* / CURSOR_WORKSPACE.
// Comment 5561551896: generic unrelated-tool `--workspace` is not CLI; both `--workspace` and
// `--worker-dir` must not take the workspace branch first as CLI; Darwin `ps args=` spaced
// opened dirs must prep the full path (unquoted ps + tokenize must not truncate).
// Comment 5561808292: each edition's isolated `install-cursor.sh --global --forge=<edition>`
// is the authority for its generated Next first fence + named claim.js. GitHub-authority
// installs must not stand in for GitLab/Gitea. Matching-authority CLI-positive must prep,
// not `cursor_prep_failed` / `stale_forge`. Mismatched forge must still fail-closed.
// Do not invent operator/Runner `--forge` on claim.js as the proof.

const spawnCensus = require('./test-spawn-census');
spawnCensus.install('test-issue-1052-cursor-cli-startup-prep');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
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

function makeSandbox(forge) {
  const selectedForge = String(forge || 'github').trim() || 'github';
  const tmp = fs.mkdtempSync(path.join(tmpParent(), 'kw-1052-' + selectedForge + '-'));
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
  const install = spawnSync('bash', [INSTALLER, '--global', '--yes', '--forge=' + selectedForge], {
    cwd: REPO, env, encoding: 'utf8', timeout: 120000,
  });
  const helper = path.join(cursorHome, 'kaola-workflow', 'scripts', 'kaola-workflow-cursor-surface.js');
  return {
    tmp, home, cursorHome, bin, env, helper, install, classifier, ghOpen, glabOpen, teaOpen,
    forge: selectedForge,
  };
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

const SYNC_JS = path.join(REPO, 'scripts', 'sync-cursor-edition.js');
const README = path.join(REPO, 'README.md');
const CURSOR_TREE_LABEL = Object.freeze({
  github: '.cursor',
  gitlab: '.cursor-gitlab',
  gitea: '.cursor-gitea',
});

function bashFences(text) {
  const out = [];
  const re = /```(?:bash|sh)\n([\s\S]*?)```/g;
  let m;
  const source = String(text || '');
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

function executableClaimLines(text, verb) {
  const lines = [];
  function take(block) {
    String(block || '').split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      if (/\bnode\b/.test(trimmed) && /\$CLAIM_JS/.test(trimmed)
        && new RegExp('\\b' + verb + '\\b').test(trimmed)) {
        lines.push(trimmed);
      }
    });
  }
  const fences = bashFences(text);
  if (fences.length) fences.forEach(take);
  else take(text);
  return lines;
}

function hasCliLocalIdentity(line) {
  return /--product(?:\s+|=)cli\b/.test(line) && /--host(?:\s+|=)local\b/.test(line);
}

function fenceHasExecutableHostGate(fence) {
  return String(fence || '').split(/\r?\n/).some(raw => {
    const line = String(raw || '').trim();
    if (!line || line.startsWith('#') || line.startsWith('<!--')) return false;
    return /^(if|elif|case)\b/.test(line) && /(product|host)/i.test(line);
  });
}

function logInvokesCliLocalIdentity(log, claimBase) {
  return String(log || '').split(/\n/).some(line =>
    line.indexOf(claimBase) >= 0
    && /\b(startup|resume)\b/.test(line)
    && /(?:^|\s)--product(?:\s+|=)cli(?:\s|$)/.test(line)
    && /(?:^|\s)--host(?:\s+|=)local(?:\s|$)/.test(line));
}

function logInvokesCliLocalWithWorkspace(log, claimBase) {
  return logInvokesCliLocalIdentity(log, claimBase)
    && String(log || '').split(/\n/).some(line =>
      line.indexOf(claimBase) >= 0
      && /\b(startup|resume)\b/.test(line)
      && /(?:^|\s)--product(?:\s+|=)cli(?:\s|$)/.test(line)
      && /(?:^|\s)--host(?:\s+|=)local(?:\s|$)/.test(line)
      && /(?:^|\s)--cursor-workspace(?:\s+|=)/.test(line));
}

function tokenizeBashLine(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  const s = String(line || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) { tokens.push(cur); cur = ''; }
    } else {
      cur += c;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function expandArgToken(tok, ctx) {
  let out = String(tok == null ? '' : tok);
  out = out.replace(/\$\{CURSOR_HOME:-[^}]+\}/g, ctx.CURSOR_HOME || '');
  out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return String(ctx[name]);
    return '';
  });
  out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return String(ctx[name]);
    return '';
  });
  return out;
}

function emittedClaimArgv(line, verb, ctx) {
  const tokens = tokenizeBashLine(line).map(tok => expandArgToken(tok, ctx));
  const idx = tokens.findIndex(t => t === verb);
  if (idx < 0) return [];
  const argv = tokens.slice(idx);
  if (argv.indexOf('--json') < 0) argv.push('--json');
  return argv;
}

function resumeSection(text) {
  const source = String(text || '');
  const start = source.search(/^## Resume\b/m);
  if (start < 0) return '';
  const rest = source.slice(start);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function generateWorkflowNext(sandbox, forge) {
  const treeRoot = path.join(sandbox.tmp, 'gen-next-' + forge);
  fs.mkdirSync(treeRoot, { recursive: true });
  // spawn-class: environment
  const generated = spawnSync(process.execPath, [
    SYNC_JS, '--write', '--forge=' + forge, '--tree-root=' + treeRoot,
  ], {
    cwd: REPO, env: sandbox.env, encoding: 'utf8', timeout: 120000,
  });
  const label = CURSOR_TREE_LABEL[forge] || '.cursor';
  const nextPath = path.join(treeRoot, label, 'commands', 'workflow-next.md');
  return {
    status: generated.status,
    raw: combined(generated),
    nextPath,
    text: fs.existsSync(nextPath) ? fs.readFileSync(nextPath, 'utf8') : '',
    treeRoot,
  };
}

function installTargetNext(sandbox, forge, consumer) {
  const args = [INSTALLER, '--target', consumer, '--yes', '--forge=' + forge];
  // spawn-class: environment
  const installed = spawnSync('bash', args, {
    cwd: REPO, env: sandbox.env, encoding: 'utf8', timeout: 120000,
  });
  const nextPath = path.join(consumer, '.cursor', 'commands', 'workflow-next.md');
  return {
    status: installed.status,
    raw: combined(installed),
    nextPath,
    text: fs.existsSync(nextPath) ? fs.readFileSync(nextPath, 'utf8') : '',
  };
}

function cursorPrep(json) {
  return (json && json.cursor_prep) || null;
}

function prepFailedStaleForge(json, raw) {
  const blob = String(raw || '');
  return !!(json && json.reason === 'cursor_prep_failed') || /stale_forge/.test(blob);
}

function firstExecutableStartupFence(text) {
  for (const fence of bashFences(text)) {
    if (executableClaimLines(fence, 'startup').length > 0) return String(fence || '').trim();
  }
  return '';
}

function stripInventedCursorGates(env) {
  const out = Object.assign({}, env);
  delete out.CURSOR_PRODUCT;
  delete out.CURSOR_HOST;
  delete out.KAOLA_CURSOR_PRODUCT;
  delete out.KAOLA_CURSOR_HOST;
  delete out.CURSOR_WORKSPACE;
  return out;
}

function writeLivingFenceParent(tmp, relParts) {
  const runner = path.join.apply(path, [tmp].concat(relParts));
  fs.mkdirSync(path.dirname(runner), { recursive: true });
  // Keep the parent image alive while bash runs the fence. `exec` would replace
  // that image and drop demonstrated argv; grandchild claim.js must still
  // observe it. Do not invent CURSOR_PRODUCT / CURSOR_WORKSPACE here.
  fs.writeFileSync(runner, [
    '#!/usr/bin/env node',
    '"use strict";',
    'const { spawnSync } = require("child_process");',
    'const fence = process.env.KAOLA_FENCE || "";',
    'const cwd = process.env.KAOLA_FENCE_CWD || process.cwd();',
    'const r = spawnSync("bash", ["--noprofile", "--norc", "-c", fence], {',
    '  stdio: "inherit",',
    '  cwd: cwd,',
    '  env: process.env',
    '});',
    'process.exit(r.status == null ? 1 : r.status);',
    ''
  ].join('\n'), { mode: 0o755 });
  return runner;
}

function writeDemonstratedCursorParent(tmp) {
  // Real Cursor CLI (2026.09.02-c22c1a3) keeps `index.js --workspace <dir>` (or
  // `--worker-dir`) alive as an ancestor of the tool bash.
  return writeLivingFenceParent(tmp, ['fake-cursor-cli', '2026.09.02-c22c1a3', 'index.js']);
}

function writeUnrelatedWorkspaceParent(tmp) {
  // Generic `--workspace` on an unrelated tool is not standalone Cursor CLI.
  return writeLivingFenceParent(tmp, ['unrelated-tool']);
}

function tokenizePsCommandLineLikeProduction(line) {
  const out = [];
  let cur = '';
  let quote = '';
  const text = String(line || '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseWorkspaceFlagFromTokens(tokens) {
  const argv = Array.isArray(tokens) ? tokens : [];
  for (let i = 0; i < argv.length; i++) {
    const tok = String(argv[i] == null ? '' : argv[i]);
    if (tok === '--workspace') {
      const val = argv[i + 1];
      if (val != null && String(val).trim() !== '' && !String(val).startsWith('--')) {
        return String(val).trim();
      }
    } else if (tok.indexOf('--workspace=') === 0) {
      return tok.slice('--workspace='.length).trim();
    }
  }
  return '';
}

function truncatedPrefixOfSpacedPath(full) {
  const dir = path.dirname(full);
  const base = path.basename(full);
  const first = String(base).split(/\s+/)[0];
  return path.join(dir, first);
}

function makeSpacedRepo(sandbox, label) {
  const dir = path.join(sandbox.tmp, 'kaola workspace with spaces-' + label);
  fs.mkdirSync(dir, { recursive: true });
  G.init(dir, { branch: 'main' });
  G.git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.kw/\n');
  G.commitAll(dir, 'init');
  return fs.realpathSync(dir);
}

function addIndependentWorktree(sandbox, mainRepo, label) {
  const wt = path.join(sandbox.tmp, 'opened-wt-' + label + '-');
  const dest = fs.mkdtempSync(wt);
  fs.rmSync(dest, { recursive: true, force: true });
  G.gitOk(mainRepo, ['worktree', 'add', dest, '-b', 'kw-1052-opened-' + label]);
  return fs.realpathSync(dest);
}

const sandbox = makeSandbox('github');
const extraAuthorities = [];
const authoritiesByForge = { github: sandbox };
function getAuthority(forge) {
  const name = String(forge || 'github').trim() || 'github';
  if (!authoritiesByForge[name]) {
    const created = makeSandbox(name);
    authoritiesByForge[name] = created;
    extraAuthorities.push(created);
  }
  return authoritiesByForge[name];
}
try {
  assert(sandbox.install.status === 0 && fs.existsSync(sandbox.helper),
    '#1052-fixture: isolated --global --forge=github install must succeed and receipt the helper (status='
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
  function portOnlineEnv(port, box) {
    const extra = { KAOLA_WORKFLOW_OFFLINE: '' };
    extra[port.mockEnv] = box[port.mockField];
    return extra;
  }
  for (const port of NAMED_FORGE_PORTS) {
    const tag = '#1052-port[' + port.name + ']';
    const authority = getAuthority(port.forge);
    assert(authority.install.status === 0 && fs.existsSync(authority.helper),
      tag + '-isolated-authority: install-cursor.sh --global --forge=' + port.forge
      + ' must succeed and receipt the helper (status=' + authority.install.status
      + ' stderr=' + String(authority.install.stderr || '').slice(0, 300) + ')');
    assert(fs.existsSync(port.claim), tag + ': named claim.js must exist at ' + port.claim);
    if (port.forge !== 'github') {
      const mismatchWs = makeRepo(authority, port.name + '-mismatch-github-claim');
      const mismatch = runNamedClaim(authority, mismatchWs, CLAIM, [
        'startup', '--target-issue', '11581', '--runtime', 'cursor',
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(mismatch.status !== 0
        && mismatch.json && mismatch.json.reason === 'cursor_prep_failed'
        && /stale_forge/.test(mismatch.raw),
        tag + '-mismatched-github-claim: github kaola-workflow-claim.js against isolated --forge='
        + port.forge + ' authority must still fail-closed stale_forge; do not weaken the check (got '
        + JSON.stringify(mismatch.json) + ' raw=' + mismatch.raw.slice(0, 400) + ')');
    }

    {
      const workspace = makeRepo(authority, port.name + '-startup');
      const nested = path.join(workspace, 'nested-cwd');
      fs.mkdirSync(nested, { recursive: true });
      const twin = fs.mkdtempSync(path.join(authority.tmp, 'twin-' + port.name + '-'));
      const twinEnsure = runHelper(authority, ['--ensure-target', twin, '--forge=' + port.forge, '--json'], twin);
      let twinBody = null;
      try { twinBody = JSON.parse(twinEnsure.stdout); } catch (_) { /* below */ }
      assert(twinEnsure.status === 0 && twinBody && (twinBody.status === 'materialized' || twinBody.status === 'current'),
        tag + '-helper-control: installed helper --ensure-target --forge=' + port.forge
        + ' still materializes (status='
        + twinEnsure.status + ' body=' + JSON.stringify(twinBody) + ')');
      const r = runNamedClaim(authority, nested, port.claim, [
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
      const workspace = makeRepo(authority, port.name + '-app');
      const app = runNamedClaim(authority, workspace, port.claim, [
        'startup', '--target-issue', '11530', '--runtime', 'cursor',
        '--product', 'app', '--host', 'local', '--json',
      ]);
      assert(!refusedUnknownIdentity(app),
        tag + '-app-local-flags: App/local identity flags must be known (got ' + JSON.stringify(app.json) + ')');
      assertNoExtraRepoWrite(app, workspace,
        tag + '-app-local: explicit Cursor App/local must not infer CLI ensure or write project roles');
    }

    {
      const workspace = makeRepo(authority, port.name + '-omitted');
      const omitted = runNamedClaim(authority, workspace, port.claim, [
        'startup', '--target-issue', '11540', '--runtime', 'cursor', '--json',
      ]);
      assertNoExtraRepoWrite(omitted, workspace,
        tag + '-identity-omitted: --runtime cursor without product/host must still claim and must not write Repo');
    }

    {
      const workspace = makeRepo(authority, port.name + '-incomplete');
      const incomplete = runNamedClaim(authority, workspace, port.claim, [
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
      const resumeWorkspace = makeRepo(authority, port.name + '-resume-omitted');
      const seed = runNamedClaim(authority, resumeWorkspace, port.claim, [
        'startup', '--target-issue', '11549', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(seed.json),
        tag + '-identity-resume-omitted-seed: non-Cursor startup must acquire (got '
        + JSON.stringify(seed.json) + ')');
      const resumeOmitted = runNamedClaim(authority, resumeWorkspace, port.claim, [
        'resume', '--project', 'issue-11549', '--runtime', 'cursor', '--json',
      ]);
      assert(resumeOmitted.json && resumeOmitted.json.resumed === true
        && resumeOmitted.json.project === 'issue-11549'
        && !hasProjectAgents(resumeWorkspace),
        tag + '-identity-resume-omitted: resume without product/host must not write Repo (got '
        + JSON.stringify(resumeOmitted.json) + ')');
    }

    {
      const workspace = makeRepo(authority, port.name + '-resume-cli');
      const seed = runNamedClaim(authority, workspace, port.claim, [
        'startup', '--target-issue', '11526', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(seed.json),
        tag + '-resume-seed: non-Cursor startup must acquire (got ' + JSON.stringify(seed.json) + ')');
      const missionBefore = writeMissionList(workspace, 11526);
      const resume = runNamedClaim(authority, workspace, port.claim, [
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
      const workspace = makeRepo(authority, port.name + '-wt-cwd');
      const first = runNamedClaim(authority, workspace, port.claim, [
        'startup', '--target-issue', '11547', '--runtime', 'claude', '--json',
      ], portOnlineEnv(port, authority));
      const wt = first.json && (first.json.worktree_path || (first.json.folder && first.json.folder.worktree_path) || '');
      const mainRoot = stateField(workspace, 11547, 'main_root') || workspace;
      assert(first.status === 0 && acquired(first.json) && wt && fs.existsSync(wt),
        tag + '-worktree-cwd-seed: non-Cursor startup must create a write-worktree (got '
        + JSON.stringify(first.json) + ' raw=' + first.raw.slice(0, 300) + ')');
      fs.cpSync(issueDir(workspace, 11547), issueDir(wt, 11547), { recursive: true });
      const resume = runNamedClaim(authority, wt, port.claim, [
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
      const workspace = makeRepo(authority, port.name + '-explicit-ws');
      const decoyCwd = makeRepo(authority, port.name + '-explicit-decoy');
      const r = runNamedClaim(authority, decoyCwd, port.claim, [
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

  // --- C1–C4: generated Next / installed consumer call chain (not claim.js --product app) ---
  {
    const readme = fs.readFileSync(README, 'utf8');
    assert(/workflow-next/i.test(readme),
      '#1052-c4-readme-surface: README already names workflow-next, so a docs skip is invalid');
    assert(/Cursor CLI\/App\/Cloud/.test(readme),
      '#1052-c4-readme-surface: README already names Cursor CLI/App/Cloud, so a docs skip is invalid');
    assert(/startup/i.test(readme) && /resume/i.test(readme)
      && /--ensure-target/.test(readme)
      && /Cursor CLI/i.test(readme)
      && /(CLI\/local|product=cli)/i.test(readme),
      '#1052-c4-readme-prep: README must state Cursor CLI/local startup/resume Repo --ensure-target prep');
    assert(/--worker-dir/.test(readme)
      && /(App-like|App\/Cloud|App-started Cloud)/i.test(readme)
      && /--worker-dir[\s\S]{0,220}(App-like|App\/Cloud|App-started Cloud)[\s\S]{0,120}(skip|skips|must not|does not|do not)[\s\S]{0,80}ensure/i.test(readme),
      '#1052-c4-readme-app-cloud: README must state App/Cloud or App-like --worker-dir do not receive CLI ensure');
  }

  const demonstratedParent = writeDemonstratedCursorParent(sandbox.tmp);
  const unrelatedParent = writeUnrelatedWorkspaceParent(sandbox.tmp);

  function measureDarwinPsArgs(script, argv, fenceCwd) {
    const child = spawn(process.execPath, [script].concat(argv), {
      cwd: fenceCwd || sandbox.tmp,
      env: Object.assign({}, sandbox.env, {
        KAOLA_FENCE: 'sleep 30',
        KAOLA_FENCE_CWD: fenceCwd || sandbox.tmp,
      }),
      stdio: 'ignore',
    });
    const listed = spawnSync('ps', ['-ww', '-p', String(child.pid), '-o', 'args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const line = String(listed.stdout || '').trim();
    try { child.kill('SIGKILL'); } catch (_) { /* probe only */ }
    return line;
  }

  {
    assert(process.platform === 'darwin',
      '#1052-c2-spaced-darwin-host: spaced --workspace pin requires this Darwin host (got '
      + process.platform + ')');
    const commentWorkspace = '/tmp/kaola workspace with spaces';
    const sleeper = path.join(sandbox.tmp, 'ps-sleeper.js');
    fs.writeFileSync(sleeper, 'setInterval(function () {}, 1000);\n');
    const child = spawn(process.execPath, [sleeper, '--workspace', commentWorkspace], {
      cwd: sandbox.tmp,
      env: sandbox.env,
      stdio: 'ignore',
    });
    const listed = spawnSync('ps', ['-ww', '-p', String(child.pid), '-o', 'args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const psLine = String(listed.stdout || '').trim();
    try { child.kill('SIGKILL'); } catch (_) { /* probe only */ }
    const naiveWorkspace = parseWorkspaceFlagFromTokens(tokenizePsCommandLineLikeProduction(psLine));
    console.error('MEASURED Darwin ps -ww -p PID -o args=: ' + psLine);
    console.error('MEASURED tokenizePsCommandLine+parseDemonstratedCursorParentArgv workspace=: '
      + naiveWorkspace);
    assert(psLine.length > 0 && psLine.indexOf(commentWorkspace) >= 0,
      '#1052-c2-spaced-ps-contains-full: host ps args= must contain the full opened path (line='
      + JSON.stringify(psLine) + ')');
    assert(psLine.indexOf("'" + commentWorkspace + "'") < 0
      && psLine.indexOf('"' + commentWorkspace + '"') < 0,
      '#1052-c2-spaced-ps-unquoted: this Darwin ps args= must not insert quotes around the spaced path (line='
      + JSON.stringify(psLine) + ')');
    assert(naiveWorkspace === '/tmp/kaola',
      '#1052-c2-spaced-naive-truncate: unquoted ps + whitespace tokenize must return /tmp/kaola (got '
      + JSON.stringify(naiveWorkspace) + ' line=' + JSON.stringify(psLine) + ')');
  }

  for (const port of NAMED_FORGE_PORTS) {
    const tag = '#1052-generated[' + port.name + ']';
    const authority = getAuthority(port.forge);
    assert(authority.install.status === 0 && fs.existsSync(authority.helper),
      tag + '-isolated-authority: install-cursor.sh --global --forge=' + port.forge
      + ' must succeed and receipt the helper (status=' + authority.install.status
      + ' stderr=' + String(authority.install.stderr || '').slice(0, 300) + ')');
    if (port.forge !== 'github') {
      const mismatchWs = makeRepo(authority, port.forge + '-mismatch-github-claim');
      const mismatch = runNamedClaim(authority, mismatchWs, CLAIM, [
        'startup', '--target-issue', '12581', '--runtime', 'cursor',
      ].concat(CURSOR_CLI_LOCAL).concat(['--json']));
      assert(mismatch.status !== 0
        && mismatch.json && mismatch.json.reason === 'cursor_prep_failed'
        && /stale_forge/.test(mismatch.raw),
        tag + '-mismatched-github-claim: github kaola-workflow-claim.js against isolated --forge='
        + port.forge + ' authority must still fail-closed stale_forge; do not weaken the check (got '
        + JSON.stringify(mismatch.json) + ' raw=' + mismatch.raw.slice(0, 400) + ')');
    }
    const gen = generateWorkflowNext(sandbox, port.forge);
    assert(gen.status === 0 && gen.text,
      tag + '-sync: isolated sync-cursor-edition.js --write --tree-root must emit workflow-next.md (status='
      + gen.status + ' raw=' + String(gen.raw || '').slice(0, 300) + ')');

    const surfaces = [{ label: 'generated', text: gen.text }];
    if (port.forge === 'github') {
      const consumer = makeRepo(sandbox, port.forge + '-install-target');
      const installed = installTargetNext(sandbox, port.forge, consumer);
      assert(installed.status === 0 && installed.text,
        tag + '-install-target: isolated install-cursor.sh --target must write .cursor/commands/workflow-next.md (status='
        + installed.status + ' raw=' + String(installed.raw || '').slice(0, 300) + ')');
      surfaces.push({ label: 'installed', text: installed.text });
    }
    for (const surface of surfaces) {
      const st = tag + '-' + surface.label;
      const startupLines = executableClaimLines(surface.text, 'startup')
        .filter(line => /--runtime(?:\s+|=)cursor\b/.test(line));
      const resumeLines = executableClaimLines(surface.text, 'resume');
      const appStartup = startupLines.filter(line => !hasCliLocalIdentity(line));
      const appResume = resumeLines.filter(line => !hasCliLocalIdentity(line));
      const firstClaimFence = firstExecutableStartupFence(surface.text);
      assert(firstClaimFence.length > 0,
        st + '-c1-first-claim-fence: generated Next must emit the skeleton then-claim-it startup fence');
      assert(appStartup.length > 0,
        st + '-c1-app-startup: App/Cloud consumers of this command file must have an executable startup path that does not stamp --product cli --host local (shared-file forge)');
      assert(appResume.length > 0,
        st + '-c1-app-resume: App/Cloud consumers of this command file must have an executable resume path that does not stamp --product cli --host local (shared-file forge)');
      const cliOperatorFences = bashFences(surface.text).filter(fence =>
        executableClaimLines(fence, 'startup').concat(executableClaimLines(fence, 'resume'))
          .some(hasCliLocalIdentity));
      assert(cliOperatorFences.every(fenceHasExecutableHostGate),
        st + '-c1-host-gate: any CLI-stamped startup/resume fence must have an executable shell if/case on product/host; host-negative prose is not a gate');
    }

    const nextText = gen.text;
    const firstClaimFence = firstExecutableStartupFence(nextText);
    const appStartupLine = executableClaimLines(nextText, 'startup').find(line => !hasCliLocalIdentity(line));
    const appResumeLine = executableClaimLines(nextText, 'resume').find(line => !hasCliLocalIdentity(line));
    assert(firstClaimFence,
      tag + '-c1-emitted-startup: generated Next must emit the default first claim.js startup fence');
    assert(executableClaimLines(nextText, 'resume').length > 0,
      tag + '-c1-emitted-resume: generated Next must emit an executable claim.js resume line');

    const issueN = 12521;
    const expandCtx = (cwd, extra) => Object.assign({
      PWD: cwd,
      CLAIM_JS: port.claim,
      KAOLA_TARGET_ISSUES: String(issueN),
      CURSOR_HOME: sandbox.cursorHome,
      HOME: sandbox.home,
    }, extra || {});

    if (port.forge === 'github') {
      const appStartArgv = emittedClaimArgv(appStartupLine || executableClaimLines(firstClaimFence, 'startup')[0],
        'startup', expandCtx(sandbox.tmp));
      const appWs = makeRepo(sandbox, port.forge + '-app-exec');
      const appRun = runNamedClaim(sandbox, appWs, port.claim, appStartArgv.map(tok => {
        if (tok === String(issueN) || tok === '$KAOLA_TARGET_ISSUES') return String(issueN);
        return tok;
      }));
      const appPrep = cursorPrep(appRun.json);
      assert(appRun.status === 0 && acquired(appRun.json) && !hasProjectAgents(appWs)
        && !(appPrep && appPrep.status === 'materialized'),
        tag + '-c1-app-drive: App/Cloud executing the installed Next startup argv must not trigger ensureCursorCliLocalPrep / extra Repo writes (argv='
        + JSON.stringify(appStartArgv) + ' json=' + JSON.stringify(appRun.json) + ' raw='
        + appRun.raw.slice(0, 300) + ')');

      if (appResumeLine) {
        const seedApp = makeRepo(sandbox, port.forge + '-app-resume-seed');
        const seed = runNamedClaim(sandbox, seedApp, port.claim, [
          'startup', '--target-issue', '12531', '--runtime', 'claude', '--json',
        ]);
        assert(acquired(seed.json),
          tag + '-c1-app-resume-seed: claude startup must acquire (got ' + JSON.stringify(seed.json) + ')');
        const appResumeArgv = emittedClaimArgv(appResumeLine, 'resume', expandCtx(seedApp));
        const appResumeRun = runNamedClaim(sandbox, seedApp, port.claim, appResumeArgv);
        const appResumePrep = cursorPrep(appResumeRun.json);
        assert(appResumeRun.json && appResumeRun.json.resumed === true && !hasProjectAgents(seedApp)
          && !(appResumePrep && appResumePrep.status === 'materialized'),
          tag + '-c1-app-resume-drive: App/Cloud executing the installed Next resume argv must not trigger CLI ensure (argv='
          + JSON.stringify(appResumeArgv) + ' json=' + JSON.stringify(appResumeRun.json) + ')');
      }
    }

    const resumeFence = (bashFences(resumeSection(nextText))[0] || '').trim();
    assert(resumeFence.length > 0,
      tag + '-c3-fence: generated ## Resume must contain an executable bash fence');
    const claimDest = path.join(authority.cursorHome, 'kaola-workflow', 'scripts', port.claimBase);
    fs.mkdirSync(path.dirname(claimDest), { recursive: true });
    fs.copyFileSync(port.claim, claimDest);
    const claimSrcDir = path.dirname(port.claim);
    for (const name of fs.readdirSync(claimSrcDir).sort()) {
      if (!name.endsWith('.js')) continue;
      const src = path.join(claimSrcDir, name);
      const dest = path.join(path.dirname(claimDest), name);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }

    const coldWs = makeRepo(sandbox, port.forge + '-cold-resume');
    const coldSeed = runNamedClaim(sandbox, coldWs, port.claim, [
      'startup', '--target-issue', '12533', '--runtime', 'claude', '--json',
    ]);
    assert(acquired(coldSeed.json),
      tag + '-c3-seed: claude startup must acquire (got ' + JSON.stringify(coldSeed.json) + ')');
    writeMissionList(coldWs, 12533);

    const wrapDir = path.join(sandbox.tmp, 'node-wrap-' + port.forge);
    fs.mkdirSync(wrapDir, { recursive: true });
    const argvLog = path.join(sandbox.tmp, 'node-argv-' + port.forge + '.log');
    fs.writeFileSync(path.join(wrapDir, 'node'),
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$KAOLA_NODE_ARGV_LOG"\nexec "' + process.execPath + '" "$@"\n',
      { mode: 0o755 });

    function runCold(claimJsValue) {
      const env = Object.assign({}, authority.env, {
        PATH: wrapDir + path.delimiter + authority.env.PATH,
        KAOLA_NODE_ARGV_LOG: argvLog,
        CURSOR_HOME: authority.cursorHome,
        HOME: authority.home,
      });
      if (claimJsValue === undefined) delete env.CLAIM_JS;
      else env.CLAIM_JS = claimJsValue;
      try { fs.unlinkSync(argvLog); } catch (_) { /* first run */ }
      // spawn-class: cli-contract
      return spawnSync('bash', ['--noprofile', '--norc', '-c', resumeFence], {
        cwd: coldWs, env, encoding: 'utf8', timeout: 60000,
      });
    }

    const coldUnset = runCold(undefined);
    const logUnset = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : '';
    const invokedUnset = logUnset.indexOf(port.claimBase) >= 0 && /\bresume\b/.test(logUnset);
    assert(invokedUnset,
      tag + '-c3-cold-unset: compact-recovery Resume fragment with CLAIM_JS unset must invoke named '
      + port.claimBase + ' resume, not node "" (status=' + coldUnset.status
      + ' stdout=' + JSON.stringify(String(coldUnset.stdout || '').slice(0, 200))
      + ' log=' + JSON.stringify(logUnset.slice(0, 300)) + ')');

    const coldEmpty = runCold('');
    const logEmpty = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : '';
    const invokedEmpty = logEmpty.indexOf(port.claimBase) >= 0 && /\bresume\b/.test(logEmpty);
    assert(invokedEmpty,
      tag + '-c3-cold-empty: Resume fragment with CLAIM_JS="" must still resolve and invoke named claim.js resume (log='
      + JSON.stringify(logEmpty.slice(0, 300)) + ')');

    function hostGateEnv(kind, extra) {
      const env = Object.assign({}, authority.env, {
        PATH: wrapDir + path.delimiter + authority.env.PATH,
        KAOLA_NODE_ARGV_LOG: argvLog,
        CURSOR_HOME: authority.cursorHome,
        HOME: authority.home,
      }, extra || {});
      delete env.CLAIM_JS;
      delete env.CURSOR_PRODUCT;
      delete env.CURSOR_HOST;
      delete env.KAOLA_CURSOR_PRODUCT;
      delete env.KAOLA_CURSOR_HOST;
      // kind 'cli': documented CURSOR pair only (KAOLA twins stay unset).
      // kind 'kaola': documented KAOLA twins only (CURSOR_* stay unset).
      // kind 'cli-four': both pairs together (kept; must not be the only CLI pin).
      // kind 'app' / other: all four unset. Sibling `agent` stays on PATH; that is not CLI.
      if (kind === 'cli' || kind === 'cli-four') {
        env.CURSOR_PRODUCT = 'cli';
        env.CURSOR_HOST = 'local';
      }
      if (kind === 'kaola' || kind === 'cli-four') {
        env.KAOLA_CURSOR_PRODUCT = 'cli';
        env.KAOLA_CURSOR_HOST = 'local';
      }
      return env;
    }

    function runHostGateFence(fence, cwd, kind, extra) {
      try { fs.unlinkSync(argvLog); } catch (_) { /* first run */ }
      // spawn-class: cli-contract
      return spawnSync('bash', ['--noprofile', '--norc', '-c', fence], {
        cwd, env: hostGateEnv(kind, extra), encoding: 'utf8', timeout: 120000,
      });
    }

    function readArgvLog() {
      return fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : '';
    }

    function runLivingFence(parentBin, fence, cwd, extraEnv, parentArgv) {
      const env = stripInventedCursorGates(Object.assign({}, authority.env, {
        PATH: wrapDir + path.delimiter + authority.env.PATH,
        KAOLA_NODE_ARGV_LOG: argvLog,
        CURSOR_HOME: authority.cursorHome,
        HOME: authority.home,
        KAOLA_FENCE: fence,
        KAOLA_FENCE_CWD: cwd,
        CURSOR_INVOKED_AS: 'cursor-agent',
      }, extraEnv || {}));
      delete env.CLAIM_JS;
      try { fs.unlinkSync(argvLog); } catch (_) { /* first run */ }
      // spawn-class: cli-contract
      return spawnSync(parentBin, parentArgv, {
        cwd, env, encoding: 'utf8', timeout: 120000,
      });
    }

    function runDemonstratedFence(fence, cwd, extraEnv, parentArgv) {
      return runLivingFence(demonstratedParent, fence, cwd, extraEnv, parentArgv);
    }

    function cliWorkspaceArgv(opened) {
      return ['--workspace', opened, '--model', 'cursor-grok-4.6-xhigh'];
    }

    function appWorkerArgv() {
      return ['--worker-dir', path.join(sandbox.tmp, 'app-worker-' + port.forge)];
    }

    function claimStartupInvocations(log) {
      return String(log || '').split(/\n/).filter(line =>
        line.indexOf(port.claimBase) >= 0 && /\bstartup\b/.test(line));
    }

    {
      const appWs = makeRepo(sandbox, port.forge + '-c1-app-first-resume');
      const appSeed = runNamedClaim(sandbox, appWs, port.claim, [
        'startup', '--target-issue', '12561', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(appSeed.json),
        tag + '-c1-host-gate-first-resume-seed: claude startup must acquire (got '
        + JSON.stringify(appSeed.json) + ')');
      writeMissionList(appWs, 12561);
      const appFirst = runHostGateFence(resumeFence, appWs, 'app');
      const appFirstLog = readArgvLog();
      const appFirstJson = lastJson(appFirst.stdout) || lastJson(appFirst.stderr);
      const appFirstPrep = cursorPrep(appFirstJson);
      assert(!logInvokesCliLocalIdentity(appFirstLog, port.claimBase)
        && !(appFirstPrep && appFirstPrep.status === 'materialized')
        && !hasProjectAgents(appWs),
        tag + '-c1-host-gate-first-resume: compact-recovery first ## Resume fence in an App/Cloud-like env (CLAIM_JS unset, no CLI product/host, sibling agent still on PATH) must not invoke named '
        + port.claimBase + ' with --product cli --host local and must not set cursor_prep.status=materialized (status='
        + appFirst.status + ' log=' + JSON.stringify(appFirstLog.slice(0, 400))
        + ' json=' + JSON.stringify(appFirstJson) + ')');
    }

    {
      const opened = makeRepo(sandbox, port.forge + '-c1-first-claim-cli');
      const firstLine = executableClaimLines(firstClaimFence, 'startup')[0] || '';
      const cliRun = runDemonstratedFence(firstClaimFence, opened, {
        KAOLA_TARGET_ISSUES: '12571',
        PWD: opened,
      }, cliWorkspaceArgv(opened));
      const cliLog = readArgvLog();
      const cliJson = lastJson(cliRun.stdout) || lastJson(cliRun.stderr);
      const cliPrep = cursorPrep(cliJson);
      const startups = claimStartupInvocations(cliLog);
      assert(startups.length === 1,
        tag + '-c1-first-claim-cli-single: default then-claim-it fence with demonstrated CLI --workspace (no invented CURSOR_PRODUCT/HOST/WORKSPACE/KAOLA_CURSOR_*) must be one startup, not a later gated fence (line='
        + firstLine + ' log=' + JSON.stringify(cliLog.slice(0, 500)) + ')');
      const cliRaw = String(cliRun.stderr || '') + '\n' + String(cliRun.stdout || '');
      assert(!prepFailedStaleForge(cliJson, cliRaw)
        && cliRun.status === 0 && acquired(cliJson) && hasProjectAgents(opened)
        && cliPrep && (cliPrep.status === 'materialized' || cliPrep.status === 'current'),
        tag + '-c1-first-claim-cli-matching-authority: isolated install-cursor.sh --global --forge='
        + port.forge + ' + generated ' + port.forge + ' Next first unstamped fence + '
        + port.claimBase + ' living parent --workspace must prep, not cursor_prep_failed/stale_forge (status='
        + cliRun.status + ' json=' + JSON.stringify(cliJson) + ' raw='
        + cliRaw.slice(0, 400)
        + ' log=' + JSON.stringify(cliLog.slice(0, 400)) + ')');
      const prepTarget = cliPrep && cliPrep.target;
      assert(!prepTarget || fs.realpathSync(prepTarget) === opened,
        tag + '-c1-first-claim-cli-target: prep target must be the demonstrated --workspace opened dir, not invoking git toplevel alone (target='
        + prepTarget + ' opened=' + opened + ')');
    }

    {
      const appOpened = makeRepo(sandbox, port.forge + '-c1-first-claim-app');
      const appRun = runDemonstratedFence(firstClaimFence, appOpened, {
        KAOLA_TARGET_ISSUES: '12572',
        PWD: appOpened,
      }, appWorkerArgv());
      const appLog = readArgvLog();
      const appJson = lastJson(appRun.stdout) || lastJson(appRun.stderr);
      const appPrep = cursorPrep(appJson);
      assert(appRun.status === 0 && acquired(appJson) && !hasProjectAgents(appOpened)
        && !(appPrep && appPrep.status === 'materialized')
        && !logInvokesCliLocalIdentity(appLog, port.claimBase),
        tag + '-c1-first-claim-app: same default first claim fence with App-like demonstrated context (--worker-dir, no --workspace, CURSOR_INVOKED_AS=cursor-agent, sibling agent on PATH, no invented gate env) must not obtain local-CLI prep or forge --product cli --host local that materializes (status='
        + appRun.status + ' json=' + JSON.stringify(appJson) + ' log='
        + JSON.stringify(appLog.slice(0, 400)) + ')');
    }

    {
      const unknownWs = makeRepo(sandbox, port.forge + '-c1-first-claim-unknown');
      const unknownRun = runHostGateFence(firstClaimFence, unknownWs, 'app', {
        KAOLA_TARGET_ISSUES: '12573',
        PWD: unknownWs,
      });
      const unknownLog = readArgvLog();
      const unknownJson = lastJson(unknownRun.stdout) || lastJson(unknownRun.stderr);
      const unknownPrep = cursorPrep(unknownJson);
      assert(unknownRun.status === 0 && acquired(unknownJson) && !hasProjectAgents(unknownWs)
        && !(unknownPrep && unknownPrep.status === 'materialized')
        && !logInvokesCliLocalIdentity(unknownLog, port.claimBase),
        tag + '-c1-first-claim-unknown: default first claim fence with no demonstrated --workspace must not obtain local-CLI prep (status='
        + unknownRun.status + ' json=' + JSON.stringify(unknownJson) + ' log='
        + JSON.stringify(unknownLog.slice(0, 400)) + ')');
    }

    {
      const consumer = makeRepo(sandbox, port.forge + '-c1-generic-workspace');
      const genericRun = runLivingFence(unrelatedParent, firstClaimFence, consumer, {
        KAOLA_TARGET_ISSUES: '12576',
        PWD: consumer,
      }, ['--workspace', consumer]);
      const genericLog = readArgvLog();
      const genericJson = lastJson(genericRun.stdout) || lastJson(genericRun.stderr);
      const genericPrep = cursorPrep(genericJson);
      assert(genericRun.status === 0 && acquired(genericJson) && !hasProjectAgents(consumer)
        && !(genericPrep && genericPrep.status === 'materialized')
        && !logInvokesCliLocalIdentity(genericLog, port.claimBase),
        tag + '-c1-generic-workspace-not-cli: first generated fence as grandchild of living unrelated-tool --workspace <repo> (not YYYY.MM.DD-hash/index.js) must keep unknown/App/Cloud non-writing; a generic --workspace flag is not CLI identity (status='
        + genericRun.status + ' json=' + JSON.stringify(genericJson) + ' log='
        + JSON.stringify(genericLog.slice(0, 400)) + ' parent=' + unrelatedParent + ')');
    }

    {
      const bothWs = makeRepo(sandbox, port.forge + '-c1-workspace-and-worker');
      const workerDir = path.join(sandbox.tmp, 'app-worker-both-' + port.forge);
      fs.mkdirSync(workerDir, { recursive: true });
      const bothRun = runDemonstratedFence(firstClaimFence, bothWs, {
        KAOLA_TARGET_ISSUES: '12577',
        PWD: bothWs,
      }, ['--workspace', bothWs, '--worker-dir', workerDir, '--model', 'cursor-grok-4.6-xhigh']);
      const bothLog = readArgvLog();
      const bothJson = lastJson(bothRun.stdout) || lastJson(bothRun.stderr);
      const bothPrep = cursorPrep(bothJson);
      assert(bothRun.status === 0 && acquired(bothJson) && !hasProjectAgents(bothWs)
        && !(bothPrep && bothPrep.status === 'materialized')
        && !logInvokesCliLocalIdentity(bothLog, port.claimBase),
        tag + '-c1-workspace-and-worker-dir: ancestor with both --workspace and --worker-dir must not take the workspace branch first as CLI; preserve App/unknown non-writing (status='
        + bothRun.status + ' json=' + JSON.stringify(bothJson) + ' log='
        + JSON.stringify(bothLog.slice(0, 400)) + ')');
    }

    {
      const main = makeRepo(sandbox, port.forge + '-c2-opened-wt-main');
      const openedWt = addIndependentWorktree(sandbox, main, port.forge + '-direct');
      const wtRun = runDemonstratedFence(firstClaimFence, openedWt, {
        KAOLA_TARGET_ISSUES: '12574',
        PWD: openedWt,
      }, cliWorkspaceArgv(openedWt));
      const wtJson = lastJson(wtRun.stdout) || lastJson(wtRun.stderr);
      const wtPrep = cursorPrep(wtJson);
      assert(wtRun.status === 0 && acquired(wtJson) && hasProjectAgents(openedWt)
        && wtPrep && (wtPrep.status === 'materialized' || wtPrep.status === 'current'),
        tag + '-c2-cli-opened-worktree: CLI opened directly in an independent worktree (--workspace=that worktree, no invented CURSOR_WORKSPACE) must prep that worktree (json='
        + JSON.stringify(wtJson) + ' raw=' + String(wtRun.stderr || wtRun.stdout || '').slice(0, 300) + ')');
      assert(!hasProjectAgents(main),
        tag + '-c2-cli-opened-worktree-not-main: recorded main_root/main checkout must not receive Repo prep when --workspace is the independent worktree');
    }

    {
      const main = makeRepo(sandbox, port.forge + '-c2-main-open');
      const otherWt = addIndependentWorktree(sandbox, main, port.forge + '-cwd');
      const mainRun = runDemonstratedFence(firstClaimFence, otherWt, {
        KAOLA_TARGET_ISSUES: '12575',
        PWD: otherWt,
      }, cliWorkspaceArgv(main));
      const mainJson = lastJson(mainRun.stdout) || lastJson(mainRun.stderr);
      const mainPrep = cursorPrep(mainJson);
      assert(mainRun.status === 0 && acquired(mainJson) && hasProjectAgents(main)
        && mainPrep && (mainPrep.status === 'materialized' || mainPrep.status === 'current'),
        tag + '-c2-main-cli-other-cwd: main-workspace CLI (--workspace=main) whose shell cwd is another worktree must prep the opened main, not cwd/git toplevel (json='
        + JSON.stringify(mainJson) + ' raw=' + String(mainRun.stderr || mainRun.stdout || '').slice(0, 300) + ')');
      assert(!hasProjectAgents(otherWt),
        tag + '-c2-main-cli-other-cwd-not-wt: shell-cwd worktree must not receive Repo prep when demonstrated --workspace is main');
    }

    {
      const spaced = makeSpacedRepo(sandbox, port.forge);
      const truncated = truncatedPrefixOfSpacedPath(spaced);
      fs.mkdirSync(truncated, { recursive: true });
      G.init(truncated, { branch: 'main' });
      G.git(truncated, ['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(truncated, '.gitignore'), '.kw/\n');
      G.commitAll(truncated, 'truncated prefix decoy');
      const spacedPs = measureDarwinPsArgs(demonstratedParent, cliWorkspaceArgv(spaced), spaced);
      const spacedNaive = parseWorkspaceFlagFromTokens(tokenizePsCommandLineLikeProduction(spacedPs));
      console.error('MEASURED [' + port.forge + '] CLI parent ps args=: ' + spacedPs);
      console.error('MEASURED [' + port.forge + '] naive workspace=: ' + spacedNaive);
      const spacedRun = runDemonstratedFence(firstClaimFence, spaced, {
        KAOLA_TARGET_ISSUES: '12578',
        PWD: spaced,
      }, cliWorkspaceArgv(spaced));
      const spacedLog = readArgvLog();
      const spacedJson = lastJson(spacedRun.stdout) || lastJson(spacedRun.stderr);
      const spacedPrep = cursorPrep(spacedJson);
      const prepTarget = spacedPrep && spacedPrep.target
        ? fs.realpathSync(spacedPrep.target)
        : '';
      assert(spacedRun.status === 0 && acquired(spacedJson)
        && hasProjectAgents(spaced)
        && spacedPrep && (spacedPrep.status === 'materialized' || spacedPrep.status === 'current')
        && prepTarget === spaced,
        tag + '-c2-spaced-workspace-full: demonstrated CLI --workspace with spaces must prep the full opened dir via Darwin ps args= → tokenizePsCommandLine, not silently skip and not the truncated prefix (status='
        + spacedRun.status + ' json=' + JSON.stringify(spacedJson) + ' target=' + prepTarget
        + ' opened=' + spaced + ' truncated=' + truncated
        + ' ps=' + JSON.stringify(spacedPs)
        + ' naive=' + JSON.stringify(spacedNaive)
        + ' log=' + JSON.stringify(spacedLog.slice(0, 400)) + ')');
      assert(!hasProjectAgents(truncated),
        tag + '-c2-spaced-workspace-not-prefix: existing truncated prefix must not receive Repo prep (truncated='
        + truncated + ')');
    }

    {
      const everyWs = makeRepo(sandbox, port.forge + '-c1-app-every-fence');
      const everySeed = runNamedClaim(sandbox, everyWs, port.claim, [
        'startup', '--target-issue', '12563', '--runtime', 'claude', '--json',
      ]);
      assert(acquired(everySeed.json),
        tag + '-c1-host-gate-every-seed: claude startup must acquire (got '
        + JSON.stringify(everySeed.json) + ')');
      writeMissionList(everyWs, 12563);
      const operatorFences = bashFences(nextText).filter(fence =>
        executableClaimLines(fence, 'startup').length > 0
        || executableClaimLines(fence, 'resume').length > 0);
      const everyRun = runHostGateFence(operatorFences.join('\n'), everyWs, 'app', {
        KAOLA_TARGET_ISSUES: '12563',
        PWD: everyWs,
      });
      const everyLog = readArgvLog();
      const everyJson = lastJson(everyRun.stdout) || lastJson(everyRun.stderr);
      const everyPrep = cursorPrep(everyJson);
      assert(!logInvokesCliLocalIdentity(everyLog, port.claimBase)
        && !(everyPrep && everyPrep.status === 'materialized')
        && !hasProjectAgents(everyWs),
        tag + '-c1-host-gate-every-fence: App executing every startup/resume bash fence must not run the cli/local identity; prose-only skip does not count (status='
        + everyRun.status + ' log=' + JSON.stringify(everyLog.slice(0, 500))
        + ' json='         + JSON.stringify(everyJson) + ')');
    }
  }
} finally {
  extraAuthorities.forEach(s => {
    try { fs.rmSync(s.tmp, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  });
  try { fs.rmSync(sandbox.tmp, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
}

spawnCensus.report();
if (failed) {
  console.error('\nissue-1052 cursor CLI startup/resume prep FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('issue-1052 cursor CLI startup/resume prep passed (' + passed + ' assertions).');
