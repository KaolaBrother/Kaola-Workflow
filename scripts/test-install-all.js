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
// Hand-rolled assert, no framework: exit 0 + sentinel on pass, exit 1 on failure.

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

// Build a stub root with the four installers at the exact paths the wrapper calls.
// `codes` overrides exit codes per runtime (default 0 for all).
function stubRoot(codes) {
  codes = codes || {};
  const root = freshRoot();
  const markers = {
    claude:   writeStub(root, 'install.sh',            'bash', codes.claude ?? 0, '.ran-claude'),
    opencode: writeStub(root, 'install-opencode.sh',   'bash', codes.opencode ?? 0, '.ran-opencode'),
    codex:    writeStub(root, 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js', 'node', codes.codex ?? 0, '.ran-codex'),
    kimi:     writeStub(root, 'install-kimi.sh',       'bash', codes.kimi ?? 0, '.ran-kimi'),
  };
  return { root, markers };
}

function runWrapper(root, args) {
  const r = spawnSync('bash', [INSTALL_ALL].concat(args), {
    cwd: REPO, encoding: 'utf8',
    env: Object.assign({}, process.env, { KAOLA_INSTALL_ALL_ROOT: root }),
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Test A — all four pass: exit 0, four PASS rows, all markers created.
{
  const { root, markers } = stubRoot();
  const r = runWrapper(root, ['--yes']);
  assert(r.status === 0, 'A: all-pass wrapper exits 0');
  assert((r.out.match(/PASS/g) || []).length >= 4, 'A: summary reports four PASS');
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'A: all four installers actually ran');
  assert(r.out.includes('all runtimes OK'), 'A: prints all-runtimes-OK sentinel');
}

// Test B — one installer fails: exit 1, loud FAIL for it, others still run/PASS.
{
  const { root, markers } = stubRoot({ opencode: 3 });
  const r = runWrapper(root, ['--yes']);
  assert(r.status === 1, 'B: any-failure wrapper exits non-zero (1)');
  assert(/opencode\s+FAIL/.test(r.out), 'B: summary marks opencode FAIL');
  assert(r.out.includes('FAILED with exit code 3'), 'B: loud failure banner names exit code 3');
  assert(fs.existsSync(markers.codex) && fs.existsSync(markers.kimi),
    'B: continue-through — codex and kimi still ran after opencode failed');
  assert(/claude\s+PASS/.test(r.out) && /kimi\s+PASS/.test(r.out), 'B: the three healthy runtimes PASS');
}

// Test C — --skip=kimi: kimi SKIP, not run, others pass, exit 0.
{
  const { root, markers } = stubRoot();
  const r = runWrapper(root, ['--yes', '--skip=kimi']);
  assert(r.status === 0, 'C: skip-with-all-healthy exits 0');
  assert(/kimi\s+SKIP/.test(r.out), 'C: summary marks kimi SKIP');
  assert(r.out.includes('SKIPPED (--skip=kimi)'), 'C: loud skip line printed');
  assert(!fs.existsSync(markers.kimi), 'C: skipped installer did not run');
  assert(fs.existsSync(markers.claude), 'C: non-skipped installers still ran');
}

// Test D — --strict fail-fast: first failure aborts, later runtimes NOT run.
{
  const { root, markers } = stubRoot({ claude: 5 });
  const r = runWrapper(root, ['--yes', '--strict']);
  assert(r.status === 1, 'D: strict abort exits non-zero');
  assert(r.out.includes('--strict abort'), 'D: strict abort message printed');
  assert(fs.existsSync(markers.claude), 'D: the failing runtime ran');
  assert(!fs.existsSync(markers.opencode) && !fs.existsSync(markers.kimi),
    'D: strict stopped before later runtimes ran');
  assert(/kimi\s+NOT-RUN/.test(r.out), 'D: summary marks unreached runtime NOT-RUN');
}

// Test E — --check dry run: no installer runs, exit 0, PLAN rows.
{
  const { root, markers } = stubRoot();
  const r = runWrapper(root, ['--check']);
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
  const { root, markers } = stubRoot();
  const r = runWrapper(root, ['--yes', '--skip=']);
  assert(r.status === 0 && !/unbound variable/.test(r.out),
    'G: an empty --skip= value is a no-op, not a crash: ' + r.out.split('\n').slice(-3).join(' | '));
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'G: with an empty skip list all four runtimes still run');
}

cleanup();

if (failed) {
  console.error(`\ninstall-all contract test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`install-all contract test passed (${passed} assertions).`);
