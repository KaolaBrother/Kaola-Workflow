#!/usr/bin/env node
'use strict';

// test-issue-1123-multi-forge-install.js — #1123 P2 acceptance, entirely in sandbox HOMEs.
//
// Proves, without touching the real ~/.claude:
//   1. install.sh --forge=github,gitea installs the multi entries, both support dirs, and
//      exactly ONE compact hook;
//   2. repo A (github.com) and repo B (mapped gitea host) run the installed /workflow-next
//      resolver block and get the github / gitea CLAIM_JS;
//   3. A calls only the gh mock and B only the tea mock, with no reinstall between;
//   4. uninstall.sh --forge=gitea leaves the multi entry, repoints the hook at github, makes
//      B fail forge_not_installed and leaves A working;
//   5. install.sh --forge=github single-forge output is byte-identical to commands/, scripts/
//      and the compact prompt.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const temps = [];

function check(name, fn) {
  try { fn(); passed++; } catch (err) {
    failed++;
    console.error('FAIL: ' + name + '\n  ' + (err && err.stack ? err.stack : err));
  }
}

function temp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function sandboxHome() {
  const home = temp('kw-p2-home-');
  fs.mkdirSync(home, { recursive: true });
  return home;
}

function toolPath() {
  const dir = temp('kw-p2-bin-');
  fs.symlinkSync(process.execPath, path.join(dir, 'node'));
  for (const candidate of ['/opt/homebrew/bin/python3', '/usr/bin/python3']) {
    if (fs.existsSync(candidate)) { fs.symlinkSync(candidate, path.join(dir, 'python3')); break; }
  }
  return dir;
}

function envFor(home, bin) {
  return {
    HOME: home,
    PATH: bin + ':/usr/bin:/bin:/usr/sbin:/sbin',
    TMPDIR: path.join(home, 'tmp'),
  };
}

function runBash(script, args, opts) {
  // spawn-class: environment
  const res = spawnSync('/bin/bash', [script].concat(args), {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: envFor(opts.home, opts.bin),
    timeout: 180000,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function read(file) { return fs.readFileSync(file, 'utf8'); }

function makeRepo(name, origin) {
  const dir = temp('kw-p2-repo-' + name + '-');
  // spawn-class: environment
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  git(['init', '-q', '.']);
  git(['config', 'user.email', 'p2@example.invalid']);
  git(['config', 'user.name', 'P2']);
  git(['commit', '-q', '--allow-empty', '-m', 'base']);
  git(['remote', 'add', 'origin', origin]);
  return dir;
}

function mergeMachineConfig(home, forgeHosts) {
  const file = path.join(home, '.config', 'kaola-workflow', 'config.json');
  let doc = {};
  if (fs.existsSync(file)) {
    try { doc = JSON.parse(read(file)); } catch (_) { doc = {}; }
  }
  doc.forge_hosts = Object.assign({}, doc.forge_hosts || {}, forgeHosts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

function extractResolverBlock(commandFile, outFile) {
  const text = read(commandFile);
  const start = text.indexOf('kaola_script_github(){');
  const end = text.indexOf('node "$CLAIM_JS" list-open', start);
  assert(start >= 0 && end > start, 'installed entry carries the multi resolver block');
  fs.writeFileSync(outFile, text.slice(start, end));
  return outFile;
}

function runResolverBlock(block, cwd, home, bin) {
  // spawn-class: cli-contract
  const res = spawnSync('/bin/bash', ['-c',
    'source "$1"; printf "KW_FORGE=%s\\nCLAIM_JS=%s\\n" "${KW_FORGE:-}" "${CLAIM_JS:-}"',
    '_', block], { cwd, encoding: 'utf8', env: envFor(home, bin), timeout: 60000 });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function resolvedClaim(stdout) {
  const line = String(stdout).split('\n').find(l => l.startsWith('CLAIM_JS='));
  assert(line, 'resolver block did not emit CLAIM_JS: ' + stdout);
  return line.slice('CLAIM_JS='.length).replace(/^'|'$/g, '');
}

function writeMock(file, marker) {
  fs.writeFileSync(file, [
    "const fs = require('fs');",
    'fs.appendFileSync(' + JSON.stringify(marker) + ", process.argv.slice(2).join(' ') + '\\n');",
    "process.stdout.write('[]\\n');",
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// 1 + 5: multi install in HOME1, single install in HOME2
// ---------------------------------------------------------------------------
const bin = toolPath();
const home = sandboxHome();
const install = runBash(path.join(ROOT, 'install.sh'), ['--yes', '--forge=github,gitea'], { home, bin });

check('install.sh --forge=github,gitea exits 0', () => {
  assert.strictEqual(install.status, 0, install.stdout + install.stderr);
});

for (const name of ['workflow-next', 'workflow-init', 'kaola-workflow-finalize']) {
  check('installed multi command matches the committed multi render: ' + name, () => {
    assert.strictEqual(
      read(path.join(home, '.claude', 'commands', name + '.md')),
      read(path.join(ROOT, 'templates', 'routing', 'multi', name + '.md')));
  });
}

check('both support directories carry the resolver', () => {
  for (const dir of ['kaola-workflow', 'kaola-workflow-gitea']) {
    assert(fs.existsSync(path.join(home, '.claude', dir, 'scripts', 'kaola-workflow-forge-resolve.js')),
      dir + ' resolver missing');
  }
});

check('settings carry exactly one managed compact entry pointing at github', () => {
  const settings = JSON.parse(read(path.join(home, '.claude', 'settings.json')));
  const entries = (settings.hooks && settings.hooks.SessionStart) || [];
  const managed = entries.filter(e => e && e.id === 'kaola-workflow:compact-context');
  assert.strictEqual(managed.length, 1, 'expected one compact entry, got ' + managed.length);
  const cmd = managed[0].hooks[0].command;
  assert(cmd.includes(path.join(home, '.claude', 'kaola-workflow', 'hooks', 'kaola-workflow-compact-recovery.md')),
    cmd);
});

// ---------------------------------------------------------------------------
// 2 + 3: repo A / repo B resolver and forge-CLI selection
// ---------------------------------------------------------------------------
const repoA = makeRepo('A', 'https://github.com/example/a.git');
const repoB = makeRepo('B', 'https://git.example.com/example/b.git');
mergeMachineConfig(home, { 'git.example.com': 'gitea' });
const block = extractResolverBlock(path.join(home, '.claude', 'commands', 'workflow-next.md'),
  path.join(home, 'resolver-block.sh'));

const aResolved = runResolverBlock(block, repoA, home, bin);
const bResolved = runResolverBlock(block, repoB, home, bin);

check('repo A resolves github and the github CLAIM_JS', () => {
  assert(aResolved.stdout.includes('KW_FORGE=github'), aResolved.stdout + aResolved.stderr);
  assert(aResolved.stdout.includes(path.join(home, '.claude', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js')),
    aResolved.stdout);
});

check('repo B resolves gitea and the gitea CLAIM_JS', () => {
  assert(bResolved.stdout.includes('KW_FORGE=gitea'), bResolved.stdout + bResolved.stderr);
  assert(bResolved.stdout.includes(path.join(home, '.claude', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js')),
    bResolved.stdout);
});

check('repo A calls only gh, repo B calls only tea, with no reinstall between', () => {
  // Distinct markers per mock, so a call is attributable to one CLI.
  const aGh = path.join(home, 'a-gh.calls');
  const aTea = path.join(home, 'a-tea.calls');
  const bGh = path.join(home, 'b-gh.calls');
  const bTea = path.join(home, 'b-tea.calls');
  for (const f of [aGh, aTea, bGh, bTea]) fs.rmSync(f, { force: true });

  writeMock(path.join(home, 'a-gh.js'), aGh);
  writeMock(path.join(home, 'a-tea.js'), aTea);
  // The claim path comes from the resolver block's own CLAIM_JS, not a hardcoded edition path.
  assert.strictEqual(resolvedClaim(aResolved.stdout),
    path.join(home, '.claude/kaola-workflow/scripts/kaola-workflow-claim.js'));
  // spawn-class: cli-contract
  const aRun2 = spawnSync(process.execPath, [resolvedClaim(aResolved.stdout), 'list-open'], {
    cwd: repoA, encoding: 'utf8', timeout: 60000,
    env: Object.assign(envFor(home, bin), {
      KAOLA_GH_MOCK_SCRIPT: path.join(home, 'a-gh.js'),
      KAOLA_TEA_MOCK_SCRIPT: path.join(home, 'a-tea.js'),
    }),
  });
  assert.strictEqual(aRun2.status, 0, aRun2.stderr);
  assert(fs.existsSync(aGh), 'repo A did not call gh');
  assert(!fs.existsSync(aTea), 'repo A called tea');

  writeMock(path.join(home, 'b-gh.js'), bGh);
  writeMock(path.join(home, 'b-tea.js'), bTea);
  assert.strictEqual(resolvedClaim(bResolved.stdout),
    path.join(home, '.claude/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js'));
  // spawn-class: cli-contract
  const bRun = spawnSync(process.execPath, [resolvedClaim(bResolved.stdout), 'list-open'], {
    cwd: repoB, encoding: 'utf8', timeout: 60000,
    env: Object.assign(envFor(home, bin), {
      KAOLA_GH_MOCK_SCRIPT: path.join(home, 'b-gh.js'),
      KAOLA_TEA_MOCK_SCRIPT: path.join(home, 'b-tea.js'),
    }),
  });
  assert.strictEqual(bRun.status, 0, bRun.stderr);
  assert(fs.existsSync(bTea), 'repo B did not call tea');
  assert(!fs.existsSync(bGh), 'repo B called gh');
});

check('install-all --check reports Claude installed vs expected forge sets', () => {
  const out = runBash(path.join(ROOT, 'install-all.sh'),
    ['--check', '--forge=github,gitea', '--skip=opencode,codex,kimi,grok,cursor,zcode,devin,droid,dsh,antigravity,hermes'],
    { home, bin });
  assert(out.stdout.includes('[forge] claude: installed=github,gitea expected=github,gitea'),
    out.stdout + out.stderr);
});

// ---------------------------------------------------------------------------
// 4: uninstall gitea, keep the multi entry, repoint the hook, B refuses
// ---------------------------------------------------------------------------
const uninstall = runBash(path.join(ROOT, 'uninstall.sh'), ['--forge=gitea'], { home, bin });

check('uninstall.sh --forge=gitea exits 0 and removes only the gitea support dir', () => {
  assert.strictEqual(uninstall.status, 0, uninstall.stdout + uninstall.stderr);
  assert(!fs.existsSync(path.join(home, '.claude', 'kaola-workflow-gitea')));
  assert(fs.existsSync(path.join(home, '.claude', 'kaola-workflow')));
});

check('the multi entry survives a per-forge uninstall byte-for-byte', () => {
  for (const name of ['workflow-next', 'workflow-init', 'kaola-workflow-finalize']) {
    assert.strictEqual(
      read(path.join(home, '.claude', 'commands', name + '.md')),
      read(path.join(ROOT, 'templates', 'routing', 'multi', name + '.md')));
  }
});

check('the compact hook survives and points at the remaining github support dir', () => {
  const settings = JSON.parse(read(path.join(home, '.claude', 'settings.json')));
  const managed = (settings.hooks.SessionStart || []).filter(e => e && e.id === 'kaola-workflow:compact-context');
  assert.strictEqual(managed.length, 1);
  assert(managed[0].hooks[0].command.includes(path.join(home, '.claude', 'kaola-workflow', 'hooks')),
    managed[0].hooks[0].command);
});

check('after uninstall, repo B refuses with forge_not_installed and repo A still works', () => {
  const postB = runResolverBlock(block, repoB, home, bin);
  assert(postB.stderr.includes('forge_not_installed'), postB.stderr);
  // The block must STOP on refusal, not continue with an empty CLAIM_JS.
  // spawn-class: cli-contract
  const stopped = spawnSync('/bin/bash', ['-c', 'source "$1"', '_', block], {
    cwd: repoB, encoding: 'utf8', env: envFor(home, bin), timeout: 60000,
  });
  assert.strictEqual(stopped.status, 1, 'resolver refusal did not stop the step: ' + stopped.stdout + stopped.stderr);
  assert(stopped.stderr.includes('forge_not_installed'), stopped.stderr);
  const postA = runResolverBlock(block, repoA, home, bin);
  assert(postA.stdout.includes('KW_FORGE=github'), postA.stdout + postA.stderr);
});

// ---------------------------------------------------------------------------
// 5: single-forge install is byte-identical to today's render
// ---------------------------------------------------------------------------
const home2 = sandboxHome();
const single = runBash(path.join(ROOT, 'install.sh'), ['--yes', '--forge=github'], { home: home2, bin });

check('install.sh --forge=github exits 0', () => {
  assert.strictEqual(single.status, 0, single.stdout + single.stderr);
});

check('single-forge commands are byte-identical to commands/*.md', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'commands')).filter(f => f.endsWith('.md'))) {
    assert.strictEqual(read(path.join(ROOT, 'commands', file)),
      read(path.join(home2, '.claude', 'commands', file)), file);
  }
});

check('single-forge support scripts are byte-identical to their sources', () => {
  const dest = path.join(home2, '.claude', 'kaola-workflow', 'scripts');
  for (const file of fs.readdirSync(dest)) {
    const source = path.join(ROOT, 'scripts', file);
    if (fs.existsSync(source)) assert.strictEqual(read(source), read(path.join(dest, file)), file);
  }
});

check('single-forge compact prompt is byte-identical to hooks/', () => {
  assert.strictEqual(
    read(path.join(ROOT, 'hooks', 'kaola-workflow-compact-recovery.md')),
    read(path.join(home2, '.claude', 'kaola-workflow', 'hooks', 'kaola-workflow-compact-recovery.md')));
});

check('single-forge commands are not the multi render', () => {
  assert.notStrictEqual(
    read(path.join(home2, '.claude', 'commands', 'workflow-next.md')),
    read(path.join(ROOT, 'templates', 'routing', 'multi', 'workflow-next.md')));
});

// ---------------------------------------------------------------------------
for (const dir of temps) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

if (failed) {
  console.error('test-issue-1123-multi-forge-install: ' + failed + ' FAILED, ' + passed + ' passed');
  process.exit(1);
}
console.log('OK: test-issue-1123-multi-forge-install.js — ' + passed + ' checks');
