#!/usr/bin/env node
'use strict';
// Contract test for install-all.sh — the one entrypoint that reinstalls all four
// runtime editions. Two jobs:
//   1. GUARD: assert install-all.sh references every runtime installer, checked in
//      BOTH directions — the hand-maintained list must exist in the tree, AND the
//      installer set DERIVED FROM THE TREE (top-level install*.sh minus documented
//      non-runtime entries, plus the codex installer script) must be referenced in
//      install-all.sh and present in the list. So a 5th runtime edition added later
//      fails red until install-all.sh names it, with no human required to grow a
//      literal first — a runtime can never be silently dropped from "install
//      everything" (the machine-enforced form of the operator note that let Kimi
//      slip repeatedly). A filesystem-backed synthetic 5th-installer fixture proves
//      the derivation actually scans the tree and reports an unwired installer.
//   2. BEHAVIOR: drive install-all.sh against STUB installers (via the
//      KAOLA_INSTALL_ALL_ROOT seam) and assert the per-runtime PASS/FAIL summary,
//      non-zero-on-any-failure, --strict fail-fast, --skip, and --check no-mutation.
//   3. CONVERGENCE (#795): installer-coverage is not runtime-convergence. Codex is the
//      only two-part install (agent profiles + the version-keyed marketplace plugin),
//      so a PASS that only means "the installer exited 0" hid a runtime pinned at an
//      old plugin version. These cases drive the wrapper against a STUB codex CLI (via
//      the KAOLA_CODEX_BIN seam — hermetic, no host codex is ever consulted or mutated)
//      and assert: a stale plugin is refreshed and re-read; a refresh that does not
//      take reports FAIL (a green summary can never coexist with a detected version
//      mismatch); an absent CLI / unregistered marketplace degrades to PARTIAL with a
//      reason instead of a bare PASS; --check reports the pending upgrade and mutates
//      nothing; and the tree version is read from .codex-plugin/plugin.json, never
//      package.json (repo v7.0.0 ships Codex plugin 5.0.0 — package.json is the wrong
//      number and would force a permanent false mismatch).
// Hand-rolled assert, no framework: exit 0 + sentinel on pass, exit 1 on failure.
//
// SAFETY: every case runs against a temp stub root under os.tmpdir() and an explicit
// KAOLA_CODEX_BIN. KAOLA_CODEX_BIN is set on EVERY wrapper invocation (to a
// nonexistent path when a case wants the CLI-absent branch) so a host-installed
// `codex` can never be reached, listed, removed, or re-added by this suite.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INSTALL_ALL = path.join(REPO, 'install-all.sh');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// ---- single source of truth: the four runtime installers ----
// { runtime, file: tree-relative path that MUST exist, ref: token that MUST
//   appear in install-all.sh }. Adding a 5th edition means adding a row here AND
//   wiring install-all.sh — the guard below fails until both are done.
const KNOWN_INSTALLERS = [
  { runtime: 'claude',   file: 'install.sh',                                                  ref: 'install.sh' },
  { runtime: 'opencode', file: 'install-opencode.sh',                                         ref: 'install-opencode.sh' },
  { runtime: 'codex',    file: 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js', ref: 'install-codex-agent-profiles.js' },
  { runtime: 'kimi',     file: 'install-kimi.sh',                                             ref: 'install-kimi.sh' },
];

// ---- tree-derived installer set (so the list above can never go stale) ----
// The codex installer is the one non-globbable entry: it is .js and lives in the
// plugin tree, so it is carried as a fixed known path.
const CODEX_INSTALLER = 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js';
const WRAPPER_BASENAME = 'install-all.sh';
// Documented exclusions: top-level install*.sh files that are deliberately NOT a
// per-runtime installer. install-all.sh IS the orchestrator, not a runtime. Any
// other new install*.sh is presumed a runtime installer until it is added here.
const NON_RUNTIME_INSTALLERS = new Set([WRAPPER_BASENAME]);

// Scan `root` for runtime installers. `/^install.*\.sh$/` matches install.sh and
// install-*.sh and never matches uninstall.sh (leading "u").
function discoverInstallers(root) {
  const out = fs.readdirSync(root)
    .filter(f => /^install.*\.sh$/.test(f) && !NON_RUNTIME_INSTALLERS.has(f))
    .sort()
    .map(f => ({ runtime: f, file: f, ref: f }));
  if (fs.existsSync(path.join(root, CODEX_INSTALLER))) {
    out.push({ runtime: 'codex', file: CODEX_INSTALLER, ref: path.basename(CODEX_INSTALLER) });
  }
  return out;
}

// Guard: which installers are NOT referenced in the wrapper source.
function missingFromWrapper(installers, wrapperSrc) {
  return installers.filter(i => !wrapperSrc.includes(i.ref)).map(i => i.runtime || i.ref);
}

// ---- 1. GUARD assertions against the real install-all.sh ----
assert(fs.existsSync(INSTALL_ALL), 'install-all.sh exists at repo root');
const wrapperSrc = fs.readFileSync(INSTALL_ALL, 'utf8');

for (const i of KNOWN_INSTALLERS) {
  assert(fs.existsSync(path.join(REPO, i.file)), `installer file exists in tree: ${i.file}`);
  assert(wrapperSrc.includes(i.ref), `install-all.sh references ${i.runtime} installer (${i.ref})`);
  assert(wrapperSrc.includes(i.runtime), `install-all.sh names runtime "${i.runtime}"`);
}

// The real four must be fully covered.
assert(missingFromWrapper(KNOWN_INSTALLERS, wrapperSrc).length === 0,
  'guard: all four known installers are referenced in install-all.sh');

// The other direction: every installer DISCOVERED IN THE TREE must be wired into
// install-all.sh and accounted for in KNOWN_INSTALLERS. This is what fails red for
// a new install-*.sh that nobody remembered to add to the list above.
const discovered = discoverInstallers(REPO);
const knownRefs = new Set(KNOWN_INSTALLERS.map(i => i.ref));
for (const inst of discovered) {
  assert(wrapperSrc.includes(inst.ref),
    `guard(tree-derived): install-all.sh references discovered installer ${inst.ref}`);
  assert(knownRefs.has(inst.ref),
    `guard(tree-derived): discovered installer ${inst.ref} is present in KNOWN_INSTALLERS`);
}

// Negative proof, filesystem-backed: build a fixture tree holding the four real
// installers PLUS an unwired synthetic 5th, and a wrapper source that names only
// the four. The derivation must SCAN THE TREE, surface the phantom, and report it
// missing — this is what fails red when a new runtime is dropped.
{
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-all-guard-'));
  try {
    const touch = (rel) => {
      const abs = path.join(fixtureRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '');
    };
    ['install.sh', 'install-opencode.sh', 'install-kimi.sh', 'install-phantom.sh',
     'install-all.sh', 'uninstall.sh'].forEach(touch);
    touch(CODEX_INSTALLER);
    const fixtureWrapperSrc = KNOWN_INSTALLERS.map(i => i.ref).join('\n');

    const disc = discoverInstallers(fixtureRoot);
    const discRefs = disc.map(i => i.ref);
    assert(discRefs.includes('install-phantom.sh'),
      'guard proof: derivation scans the tree and finds a new install-*.sh');
    assert(!discRefs.includes('install-all.sh'),
      'guard proof: derivation excludes the install-all.sh wrapper itself');
    assert(!discRefs.includes('uninstall.sh'),
      'guard proof: derivation excludes uninstall.sh');
    assert(discRefs.includes(path.basename(CODEX_INSTALLER)),
      'guard proof: derivation includes the codex installer script');
    assert(missingFromWrapper(disc, fixtureWrapperSrc).includes('install-phantom.sh'),
      'guard proof: an unwired discovered installer is reported missing (guard would fail red)');
    assert(missingFromWrapper(disc.filter(i => i.ref !== 'install-phantom.sh'), fixtureWrapperSrc).length === 0,
      'guard proof: fully wired installers are reported as complete');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// The RUNTIMES source-of-truth array in the wrapper lists exactly the four.
assert(/RUNTIMES=\(claude opencode codex kimi\)/.test(wrapperSrc),
  'install-all.sh RUNTIMES array lists the four runtimes in order');

// ---- 2. BEHAVIOR: drive install-all.sh against stub installers ----
const tmpRoots = [];
function freshRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-all-test-'));
  tmpRoots.push(dir);
  return dir;
}
function cleanup() { for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// Write a stub installer that records a marker when run and exits `code`.
// `kind` is 'bash' or 'node' (codex is invoked via `node`).
function writeStub(root, rel, kind, code, markerName) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const marker = path.join(root, markerName);
  if (kind === 'node') {
    fs.writeFileSync(abs,
      `require('fs').writeFileSync(${JSON.stringify(marker)}, '');\n` +
      `console.log('stub ran: ${rel}');\n` +
      `process.exit(${code});\n`);
  } else {
    fs.writeFileSync(abs,
      `#!/usr/bin/env bash\n` +
      `echo "stub ran: ${rel} args: $*"\n` +
      `: > ${JSON.stringify(marker)}\n` +
      `exit ${code}\n`);
    fs.chmodSync(abs, 0o755);
  }
  return marker;
}

// Write a stub `codex` CLI into the stub root. It models the ONE property that
// matters: the installed marketplace-plugin version is state that only `plugin add`
// changes. `plugin list --json` emits the real CLI's shape (verified against a live
// `codex plugin list --json`: {installed:[{pluginId,name,marketplaceName,version,
// installed,enabled}]}). Every invocation is appended to a call log so a case can
// prove remove/add were (or were NOT) issued.
//   installedVersion: seed version; '' / null => plugin not installed at all
//   addVersion:       version `plugin add` installs ('' => add installs nothing)
//   addExit:          exit code of `plugin add`
//   pluginName:       the `name` the installed row reports (default 'kaola-workflow');
//                     a forge edition row reports kaola-workflow-gitlab / -gitea
//   hangSeconds:      when set, `plugin list` sleeps this long instead of answering
//                     (models a wedged CLI; the wrapper must bound the read)
function writeCodexStub(root, cfg) {
  const bin = path.join(root, 'stub-codex');
  const state = path.join(root, '.codex-installed-version');
  const log = path.join(root, '.codex-calls');
  const pluginName = cfg.pluginName || 'kaola-workflow';
  fs.writeFileSync(state, cfg.installedVersion || '');
  fs.writeFileSync(log, '');
  fs.writeFileSync(bin, [
    '#!/usr/bin/env bash',
    `STATE=${JSON.stringify(state)}`,
    `LOG=${JSON.stringify(log)}`,
    `NAME=${JSON.stringify(pluginName)}`,
    'printf \'%s\\n\' "$*" >> "$LOG"',
    'if [[ "$1" == "plugin" && "$2" == "list" ]]; then',
    ...(cfg.hangSeconds ? [`  sleep ${Number(cfg.hangSeconds)}`] : []),
    '  if [[ -s "$STATE" ]]; then',
    '    v="$(cat "$STATE")"',
    '    printf \'{"installed":[{"pluginId":"%s@stub-market","name":"%s",\' "$NAME" "$NAME"',
    '    printf \'"marketplaceName":"stub-market","version":"%s","installed":true,"enabled":true}],"available":[]}\\n\' "$v"',
    '  else',
    '    printf \'{"installed":[],"available":[]}\\n\'',
    '  fi',
    '  exit 0',
    'fi',
    'if [[ "$1" == "plugin" && "$2" == "remove" ]]; then : > "$STATE"; exit 0; fi',
    'if [[ "$1" == "plugin" && "$2" == "add" ]]; then',
    `  printf '%s' ${JSON.stringify(cfg.addVersion === undefined ? '' : cfg.addVersion)} > "$STATE"`,
    `  exit ${cfg.addExit || 0}`,
    'fi',
    'exit 1',
  ].join('\n') + '\n');
  fs.chmodSync(bin, 0o755);
  return { bin, state, log };
}

// Build a stub root with the four installers at the exact paths the wrapper calls.
// opts.codes overrides exit codes per runtime (default 0 for all);
// opts.treeVersion is the .codex-plugin/plugin.json version;
// opts.packageVersion is a DECOY package.json version (the wrapper must ignore it);
// opts.installedVersion / opts.addVersion / opts.addExit drive the stub codex CLI;
// opts.noCodexCli points KAOLA_CODEX_BIN at a nonexistent path.
function stubRoot(opts) {
  opts = opts || {};
  const codes = opts.codes || {};
  const root = freshRoot();
  const markers = {
    claude:   writeStub(root, 'install.sh',            'bash', codes.claude ?? 0, '.ran-claude'),
    opencode: writeStub(root, 'install-opencode.sh',   'bash', codes.opencode ?? 0, '.ran-opencode'),
    codex:    writeStub(root, 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js', 'node', codes.codex ?? 0, '.ran-codex'),
    kimi:     writeStub(root, 'install-kimi.sh',       'bash', codes.kimi ?? 0, '.ran-kimi'),
  };
  const treeVersion = opts.treeVersion || '5.0.0';
  // opts.pluginDir / opts.pluginName let a case build a FORGE edition manifest
  // (plugins/kaola-workflow-gitlab/... declaring name kaola-workflow-gitlab).
  const pluginDir = opts.pluginDir || 'kaola-workflow';
  const pluginName = opts.pluginName || 'kaola-workflow';
  const manifest = path.join(root, 'plugins', pluginDir, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, JSON.stringify({ name: pluginName, version: treeVersion }, null, 2) + '\n');
  // Decoy: the repo version is deliberately NOT the Codex plugin version.
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ name: 'kaola-workflow', version: opts.packageVersion || '7.0.0' }, null, 2) + '\n');
  const codex = writeCodexStub(root, {
    installedVersion: opts.installedVersion === undefined ? treeVersion : opts.installedVersion,
    addVersion: opts.addVersion === undefined ? treeVersion : opts.addVersion,
    addExit: opts.addExit || 0,
    pluginName: opts.installedPluginName || pluginName,
    hangSeconds: opts.hangSeconds,
  });
  return {
    root, markers, treeVersion,
    codexBin: opts.noCodexCli ? path.join(root, 'no-such-codex-cli') : codex.bin,
    statePath: codex.state, callLogPath: codex.log,
  };
}

const readCalls = stub => {
  try { return fs.readFileSync(stub.callLogPath, 'utf8').split('\n').filter(Boolean); }
  catch (_) { return []; }
};
const installedVersionNow = stub => {
  try { return fs.readFileSync(stub.statePath, 'utf8'); } catch (_) { return ''; }
};

// Accepts a stub object or a bare root path. KAOLA_CODEX_BIN is ALWAYS set so the
// host `codex` is never reachable from this suite.
function runWrapper(rootOrStub, args, extraEnv) {
  const isStub = rootOrStub && typeof rootOrStub === 'object';
  const root = isStub ? rootOrStub.root : rootOrStub;
  const codexBin = isStub ? rootOrStub.codexBin : path.join(root, 'no-such-codex-cli');
  const started = Date.now();
  const r = spawnSync('bash', [INSTALL_ALL].concat(args), {
    cwd: REPO, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      KAOLA_INSTALL_ALL_ROOT: root,
      KAOLA_CODEX_BIN: codexBin,
    }, extraEnv || {}),
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), elapsedMs: Date.now() - started };
}

// Test A — all four pass: exit 0, four PASS rows, all markers created.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'A: all-pass wrapper exits 0');
  assert((r.out.match(/PASS/g) || []).length >= 4, 'A: summary reports four PASS');
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'A: all four installers actually ran');
  assert(r.out.includes('all runtimes OK'), 'A: prints all-runtimes-OK sentinel');
}

// Test B — one installer fails: exit 1, loud FAIL for it, others still run/PASS.
{
  const stub = stubRoot({ codes: { opencode: 3 } });
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'B: any-failure wrapper exits non-zero (1)');
  assert(/opencode\s+FAIL/.test(r.out), 'B: summary marks opencode FAIL');
  assert(r.out.includes('FAILED with exit code 3'), 'B: loud failure banner names exit code 3');
  assert(fs.existsSync(markers.codex) && fs.existsSync(markers.kimi),
    'B: continue-through — codex and kimi still ran after opencode failed');
  assert(/claude\s+PASS/.test(r.out) && /kimi\s+PASS/.test(r.out), 'B: the three healthy runtimes PASS');
}

// Test C — --skip=kimi: kimi SKIP, not run, others pass, exit 0.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--skip=kimi']);
  assert(r.status === 0, 'C: skip-with-all-healthy exits 0');
  assert(/kimi\s+SKIP/.test(r.out), 'C: summary marks kimi SKIP');
  assert(r.out.includes('SKIPPED (--skip=kimi)'), 'C: loud skip line printed');
  assert(!fs.existsSync(markers.kimi), 'C: skipped installer did not run');
  assert(fs.existsSync(markers.claude), 'C: non-skipped installers still ran');
}

// Test D — --strict fail-fast: first failure aborts, later runtimes NOT run.
{
  const stub = stubRoot({ codes: { claude: 5 } });
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--strict']);
  assert(r.status === 1, 'D: strict abort exits non-zero');
  assert(r.out.includes('--strict abort'), 'D: strict abort message printed');
  assert(fs.existsSync(markers.claude), 'D: the failing runtime ran');
  assert(!fs.existsSync(markers.opencode) && !fs.existsSync(markers.kimi),
    'D: strict stopped before later runtimes ran');
  assert(/kimi\s+NOT-RUN/.test(r.out), 'D: summary marks unreached runtime NOT-RUN');
}

// Test E — --check dry run: no installer runs, exit 0, PLAN rows.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--check']);
  assert(r.status === 0, 'E: --check exits 0');
  assert((r.out.match(/PLAN/g) || []).length >= 4, 'E: --check reports four PLAN rows');
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => !fs.existsSync(markers[n])),
    'E: --check made no changes (no installer ran)');
  assert(r.out.includes('dry-run complete'), 'E: dry-run sentinel printed');
}

// Test F — unknown arg / --help behave as arg-contract expects.
{
  const bogus = runWrapper(freshRoot(), ['--nope']);
  assert(bogus.status === 2, 'F: unknown argument exits 2');
  const help = runWrapper(freshRoot(), ['--help']);
  assert(help.status === 0 && help.out.includes('Usage: ./install-all.sh'), 'F: --help exits 0 with usage');
}

// Test G — an EMPTY --skip= value must not crash (bash 3.2 empty-array-under-set-u trap).
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--skip=']);
  assert(r.status === 0 && !/unbound variable/.test(r.out),
    'G: an empty --skip= value is a no-op, not a crash: ' + r.out.split('\n').slice(-3).join(' | '));
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'G: with an empty skip list all four runtimes still run');
}

// ---- 3. CONVERGENCE (#795): PASS must mean "at HEAD", not "the installer exited 0" ----

// Test H — a STALE marketplace plugin is refreshed, the transition is logged, and the
// re-read proves it took. This is the live v6.24.0 -> v7.0.0 sync failure: install-all
// said `codex PASS` while `codex plugin list` still reported the old version.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'H: a converged run exits 0');
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'H: the stale plugin transition is logged loudly (4.24.0 -> 5.0.0)');
  assert(/marketplace plugin converged: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'H: convergence is confirmed after the refresh');
  assert(/codex\s+PASS/.test(r.out), 'H: codex reads PASS once genuinely converged');
  const calls = readCalls(stub);
  assert(calls.some(c => c.startsWith('plugin remove kaola-workflow@stub-market')),
    'H: `codex plugin remove <pluginId>` was issued — calls: ' + JSON.stringify(calls));
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow@stub-market')),
    'H: `codex plugin add <pluginId>` was issued — calls: ' + JSON.stringify(calls));
  assert(installedVersionNow(stub) === '5.0.0',
    'H: the runtime ends at the TREE version — got ' + JSON.stringify(installedVersionNow(stub)));
  assert(r.out.includes('all runtimes OK'), 'H: all-clear only after real convergence');
}

// Test I — THE INVARIANT: a green summary can never coexist with a detected version
// mismatch. `plugin add` exits 0 but the version does not move (the version-keyed cache
// kept serving the old build); the wrapper must RE-READ, catch it, and refuse to be green.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'I: a runtime still older than the tree makes the wrapper exit non-zero');
  assert(/codex\s+FAIL/.test(r.out), 'I: the un-converged runtime reads FAIL, not PASS');
  assert(!/codex\s+PASS/.test(r.out), 'I: no PASS row for a runtime that did not converge');
  assert(/still reports 4\.24\.0 after refresh \(tree 5\.0\.0\)/.test(r.out),
    'I: the detected mismatch is named with both versions');
  assert(!r.out.includes('all runtimes OK'),
    'I: the all-clear sentinel is withheld when a runtime is not at HEAD');
}

// Test J — `codex plugin add` fails outright: FAIL with the reason, wrapper exits 1.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addExit: 9 });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'J: a failed plugin refresh makes the wrapper exit non-zero');
  assert(/codex\s+FAIL/.test(r.out), 'J: a failed plugin refresh reads FAIL');
  assert(/plugin add .* failed/.test(r.out), 'J: the failing command is named');
}

// Test J2 — --strict aborts on a convergence failure too (kimi is never reached).
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addExit: 9 });
  const r = runWrapper(stub, ['--yes', '--strict']);
  assert(r.status === 1, 'J2: --strict exits non-zero on a convergence failure');
  assert(r.out.includes('--strict abort after codex marketplace-plugin convergence failed'),
    'J2: the strict abort names the convergence step');
  assert(!fs.existsSync(stub.markers.kimi), 'J2: --strict stopped before kimi ran');
}

// Test K — --check reports the PENDING upgrade and changes nothing.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--check']);
  assert(r.status === 0, 'K: --check with a stale plugin still exits 0');
  assert(/PENDING marketplace plugin upgrade: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'K: --check reports the pending Codex plugin upgrade');
  assert(installedVersionNow(stub) === '4.24.0',
    'K: --check made NO change to the installed plugin version');
  const calls = readCalls(stub);
  assert(!calls.some(c => c.startsWith('plugin add') || c.startsWith('plugin remove')),
    'K: --check issued no mutating codex calls — calls: ' + JSON.stringify(calls));
  assert(r.out.includes('dry-run complete'), 'K: dry-run sentinel still printed');
  assert(!/codex\s+FAIL/.test(r.out), 'K: a dry run states, it does not grade');
}

// Test L — codex CLI ABSENT is NOT APPLICABLE, not UNVERIFIED. With no `codex` on
// PATH there is no marketplace plugin to converge, so there is nothing this wrapper
// could check and nothing is degraded. Reporting a standing "convergence is
// UNVERIFIED" on such a box was a behavior regression: an ABSENT CLI is not a
// DETECTED mismatch. The row still carries its reason, so it is never a BARE pass.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', noCodexCli: true });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'L: an absent codex CLI does not fail the wrapper');
  assert(/NOT APPLICABLE/.test(r.out),
    'L: an absent CLI is reported NOT APPLICABLE, not a failed/unverified convergence');
  assert(/CLI not found/.test(r.out), 'L: the reason is printed');
  assert(!/codex\s+PARTIAL/.test(r.out),
    'L: absent tooling no longer permanently degrades the codex row to PARTIAL');
  assert(!/convergence is UNVERIFIED/.test(r.out),
    'L: a box with no Codex installed is not reported as permanently UNVERIFIED');
  assert(r.out.includes('all runtimes OK'),
    'L: the all-clear is printed — with the N/A reason named, never a bare green');
  assert(/N\/A: codex CLI not found/.test(r.out),
    'L: the codex row carries the N/A reason so the PASS is never bare');
  assert(fs.existsSync(stub.markers.kimi), 'L: later runtimes still install');
}

// Test L2 — a HUNG `codex plugin list` is BOUNDED. Before this the read had no
// timeout at all, so a wedged CLI hung install-all.sh forever. A timeout is a check
// that DID apply and could not be completed => UNVERIFIED (PARTIAL), not N/A.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', hangSeconds: 120 });
  const r = runWrapper(stub, ['--yes'], { KAOLA_CODEX_LIST_TIMEOUT_SECS: '2' });
  assert(r.status === 0, 'L2: a hung codex CLI does not fail the wrapper (got ' + r.status + ')');
  assert(r.elapsedMs < 60000,
    'L2: the wrapper is BOUNDED by the ceiling, not by the hung CLI — took ' + r.elapsedMs + 'ms');
  assert(/timed out after 2s/.test(r.out),
    'L2: the timeout is named with the ceiling — tail: ' + r.out.split('\n').slice(-6).join(' | '));
  assert(/codex\s+PARTIAL/.test(r.out),
    'L2: a check that applies but could not complete reads PARTIAL (UNVERIFIED), not N/A');
  assert(/convergence is UNVERIFIED/.test(r.out),
    'L2: a timed-out read is genuinely unverified');
  assert(!/NOT APPLICABLE/.test(r.out),
    'L2: a hung CLI is not the absent-tooling case');
  assert(fs.existsSync(stub.markers.kimi), 'L2: later runtimes still install after a bounded read');
}

// Test M — the marketplace plugin is not installed at all: skipped-with-reason, no
// attempt to guess a marketplace and add it.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'M: an unregistered marketplace does not fail the wrapper');
  assert(/codex\s+PARTIAL/.test(r.out), 'M: codex reads PARTIAL when the plugin is not installed');
  assert(/not installed from a codex marketplace/.test(r.out), 'M: the reason is printed');
  const calls = readCalls(stub);
  assert(!calls.some(c => c.startsWith('plugin add')),
    'M: the wrapper never invents a marketplace to add — calls: ' + JSON.stringify(calls));
}

// Test N — the tree version comes from .codex-plugin/plugin.json, NOT package.json.
// The decoy package.json says 4.24.0 (== the installed version), so a wrapper that read
// package.json would call this converged; the plugin manifest says 5.0.0, so it is stale.
{
  const stub = stubRoot({ treeVersion: '5.0.0', packageVersion: '4.24.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'N: the tree version is read from .codex-plugin/plugin.json, not package.json');
  assert(installedVersionNow(stub) === '5.0.0', 'N: it converged to the plugin-manifest version');
}

// Test O — --skip=codex skips convergence too (no codex call at all).
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes', '--skip=codex']);
  assert(r.status === 0, 'O: --skip=codex exits 0');
  assert(/codex\s+SKIP/.test(r.out), 'O: codex reads SKIP');
  assert(!/marketplace plugin/.test(r.out), 'O: no convergence work is done for a skipped runtime');
  assert(readCalls(stub).length === 0,
    'O: the codex CLI was never invoked — calls: ' + JSON.stringify(readCalls(stub)));
}

// Test P — the agent-profile installer failed: convergence is not attempted, and the row
// says so rather than silently looking like a plain installer failure.
{
  const stub = stubRoot({ codes: { codex: 4 }, treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'P: a failed codex installer still fails the wrapper');
  assert(/codex\s+FAIL/.test(r.out), 'P: codex reads FAIL');
  assert(/plugin convergence not attempted/.test(r.out),
    'P: the summary states convergence was not attempted after an installer failure');
  assert(readCalls(stub).length === 0, 'P: no codex CLI calls after an installer failure');
}

// Test R — the plugin NAME is DERIVED from the forge-selected manifest, never hardcoded.
// The gitlab/gitea .codex-plugin/plugin.json declare kaola-workflow-gitlab / -gitea, so a
// wrapper pinned to the literal `kaola-workflow` matched no installed row on those editions
// and convergence silently found nothing to check (a permanent false green).
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '4.24.0',
    pluginDir: 'kaola-workflow-gitlab', pluginName: 'kaola-workflow-gitlab',
  });
  const r = runWrapper(stub, ['--yes', '--forge=gitlab']);
  assert(r.status === 0, 'R: the gitlab-forge run exits 0 (got ' + r.status + ')');
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'R: the forge edition plugin row is FOUND and its staleness detected — tail: '
      + r.out.split('\n').slice(-8).join(' | '));
  assert(installedVersionNow(stub) === '5.0.0',
    'R: the forge edition converged to the tree version — got ' + JSON.stringify(installedVersionNow(stub)));
  const calls = readCalls(stub);
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow-gitlab@stub-market')),
    'R: the refresh names the FORGE plugin id, not the hardcoded github one — calls: ' + JSON.stringify(calls));
}

// Test R2 — the derivation is real, not a coincidence: with the gitlab manifest in the
// tree but the installed row still reporting the github name, there is no matching row
// and the wrapper says so instead of silently reporting converged.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '4.24.0',
    pluginDir: 'kaola-workflow-gitlab', pluginName: 'kaola-workflow-gitlab',
    installedPluginName: 'kaola-workflow',
  });
  const r = runWrapper(stub, ['--yes', '--forge=gitlab']);
  assert(r.status === 0, 'R2: a non-matching installed row does not fail the wrapper');
  assert(/kaola-workflow-gitlab/.test(r.out),
    'R2: the wrapper names the DERIVED plugin it looked for — tail: ' + r.out.split('\n').slice(-6).join(' | '));
  assert(/codex\s+PARTIAL/.test(r.out),
    'R2: no matching installed row is UNVERIFIED, never a silent converged');
}

// Test Q — static guards on the REAL wrapper + tree (the stubs above prove behavior; these
// pin the version SOURCE and the hermetic seam so neither can be quietly swapped).
{
  assert(wrapperSrc.includes('.codex-plugin/plugin.json'),
    'Q: install-all.sh reads the Codex plugin version from .codex-plugin/plugin.json');
  assert(!/^CODEX_PLUGIN_NAME="kaola-workflow"/m.test(wrapperSrc),
    'Q: the Codex plugin NAME is never hardcoded (it is read out of the forge-selected manifest)');
  assert(wrapperSrc.includes('codex_tree_plugin_name'),
    'Q: install-all.sh derives the plugin name from the tree manifest');
  assert(wrapperSrc.includes('KAOLA_CODEX_LIST_TIMEOUT_SECS'),
    'Q: the `codex plugin list` read is bounded by a configurable ceiling');
  assert(/NOT APPLICABLE/.test(wrapperSrc),
    'Q: absent tooling has its own NOT-APPLICABLE vocabulary, distinct from UNVERIFIED');
  for (const forgeDir of ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea']) {
    const m = path.join(REPO, 'plugins', forgeDir, '.codex-plugin', 'plugin.json');
    let declared = null;
    try { declared = JSON.parse(fs.readFileSync(m, 'utf8')).name; } catch (_) {}
    assert(declared === forgeDir,
      `Q: ${forgeDir}/.codex-plugin/plugin.json declares its own plugin name — got ${JSON.stringify(declared)}`);
  }
  assert(!/CODEX_PLUGIN_MANIFEST=.*package\.json/.test(wrapperSrc),
    'Q: install-all.sh never sources the Codex plugin version from package.json');
  assert(wrapperSrc.includes('plugin list --json'),
    'Q: install-all.sh reads the installed version from `codex plugin list --json`');
  assert(wrapperSrc.includes('KAOLA_CODEX_BIN'),
    'Q: install-all.sh honors the KAOLA_CODEX_BIN test seam (hermetic chains)');
  assert(/PARTIAL/.test(wrapperSrc), 'Q: the PARTIAL (skipped-with-reason) status exists');
  const treeManifest = path.join(REPO, 'plugins', 'kaola-workflow', '.codex-plugin', 'plugin.json');
  assert(fs.existsSync(treeManifest), 'Q: the real .codex-plugin/plugin.json exists in the tree');
  let treeVer = null;
  try { treeVer = JSON.parse(fs.readFileSync(treeManifest, 'utf8')).version; } catch (_) {}
  assert(typeof treeVer === 'string' && /^\d+\.\d+\.\d+$/.test(treeVer),
    'Q: the real .codex-plugin/plugin.json declares a semver version — got ' + JSON.stringify(treeVer));
}

cleanup();

if (failed) {
  console.error(`\ninstall-all contract test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`install-all contract test passed (${passed} assertions).`);
