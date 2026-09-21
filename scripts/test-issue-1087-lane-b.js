#!/usr/bin/env node
'use strict';

// issue #1087 Lane B (F3/F4/F5 of the #1086 design): per-target global-contract GC, DORMANT
// ownership records, and per-runtime self-sufficient installers.
//
//   (v-a) one runtime's carrier conflict / symlink / malformed markers / drift never fails
//         another runtime's install or --check; --skip=RUNTIME skips that runtime's carrier.
//   (v-b) a runtime off PATH keeps its record as DORMANT; after a contract change it returns,
//         re-validates against its own record, refreshes without OWNER_CONFLICT, and blocks
//         nothing else. A hand-edited dormant carrier conflicts for that runtime only.
//   (vi)  a standalone single-runtime install, with no other runtime on PATH or pre-installed,
//         is complete including its own carrier and writes into no other runtime's home.
//
// Hermetic: every HOME, runtime root, and PATH lives under an absolute tmp sandbox. PATH holds
// only fake runtime programs plus a private node link and the system tool dirs, so no real
// runtime on this host is ever detected or written.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'kaola-workflow-global-contract.js');
const TMP = path.isAbsolute(os.tmpdir()) ? os.tmpdir() : '/tmp';
const START = '<!-- KW-GLOBAL-CONTRACT-MANAGED-START -->';

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed += 1; }
function same(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed += 1; }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function write(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { mode });
  fs.chmodSync(file, mode);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function exists(file) { try { fs.lstatSync(file); return true; } catch (_) { return false; } }

const PROGRAMS = {
  claude: ['claude'], codex: ['codex'], opencode: ['opencode'], kimi: ['kimi'], grok: ['grok'],
  cursor: ['agent'], devin: ['devin'], zcode: ['zcode'], droid: ['droid'], dsh: ['dsh'],
};

function sandbox(label) {
  const root = fs.mkdtempSync(path.join(TMP, `kw-1087b-${label}-`));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  const tools = path.join(root, 'tools');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(tools, 'node'));
  const env = {
    HOME: home,
    PATH: [bin, tools, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
    TMPDIR: root,
    LANG: process.env.LANG || 'C',
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CODEX_HOME: path.join(home, '.codex'),
    OPENCODE_CONFIG_DIR: path.join(home, '.config', 'opencode'),
    KIMI_CODE_HOME: path.join(home, '.kimi-code'),
    GROK_HOME: path.join(home, '.grok'),
    CURSOR_HOME: path.join(home, '.cursor'),
    DEVIN_CONFIG_DIR: path.join(home, '.config', 'devin'),
    ZCODE_HOME: path.join(home, '.zcode'),
    DROID_HOME: path.join(home, '.factory'),
    DSH_HOME: path.join(home, '.dsh'),
    // Absent app bundles: only command discovery can detect Cursor or ZCode here.
    KAOLA_CURSOR_APP_PATH: path.join(root, 'no-Cursor.app'),
    KAOLA_ZCODE_APP_PATH: path.join(root, 'no-ZCode.app'),
    KAOLA_CANDIDATE_SHA: '0'.repeat(40),
  };
  const box = {
    root, home, bin, env,
    on(runtime) { for (const name of PROGRAMS[runtime]) write(path.join(bin, name), '#!/bin/sh\nexit 0\n', 0o755); },
    off(runtime) { for (const name of PROGRAMS[runtime]) fs.rmSync(path.join(bin, name), { force: true }); },
    carrier(runtime) {
      return {
        claude: path.join(env.CLAUDE_CONFIG_DIR, 'rules', 'kaola-workflow-global.md'),
        codex: path.join(env.CODEX_HOME, 'AGENTS.md'),
        opencode: path.join(env.OPENCODE_CONFIG_DIR, 'AGENTS.md'),
        kimi: path.join(env.KIMI_CODE_HOME, 'AGENTS.md'),
        grok: path.join(env.GROK_HOME, 'rules', 'kaola-workflow-global.md'),
        cursor: path.join(env.CURSOR_HOME, 'rules', 'kaola-workflow-global.mdc'),
        devin: path.join(env.DEVIN_CONFIG_DIR, 'AGENTS.md'),
        zcode: path.join(env.ZCODE_HOME, 'AGENTS.md'),
        droid: path.join(env.DROID_HOME, 'AGENTS.md'),
        dsh: path.join(env.DSH_HOME, 'AGENTS.md'),
      }[runtime];
    },
    record(id) { return path.join(home, '.config', 'kaola-workflow', 'global-contract-targets', `${id}.json`); },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
  return box;
}

function gc(box, args, expected) {
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [CLI, ...args, '--json'], {
    cwd: box.root, env: box.env, encoding: 'utf8', timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch (_) { /* asserted below */ }
  ok(json, `gc ${args.join(' ')} prints one JSON envelope (stdout=${result.stdout} stderr=${result.stderr})`);
  if (expected !== undefined) same(result.status, expected, `gc ${args.join(' ')} exit (${result.stdout})`);
  return { status: result.status, json };
}
function row(envelope, id) { return envelope.targets.find(item => item.id === id); }

// ---------------------------------------------------------------------------
// (v-a) per-target independence
// ---------------------------------------------------------------------------
{
  const box = sandbox('independence');
  try {
    for (const runtime of Object.keys(PROGRAMS)) box.on(runtime);
    const ownerText = '# Owner instructions\n\nKeep this byte.\n';
    write(box.carrier('kimi'), ownerText);

    const kimi = gc(box, ['install', '--runtime', 'kimi', '--nonce', 'A'], 0).json;
    same(kimi.status, 'INSTALLED', 'v-a: per-target kimi install succeeds');
    same(kimi.targets.map(item => item.id), ['kimi-local'], 'v-a: --runtime kimi selects only kimi-local');
    ok(read(box.carrier('kimi')).startsWith(ownerText), 'v-a: owner bytes survive managed insertion');
    ok(exists(box.record('kimi-local')), 'v-a: kimi writes its own per-target record');
    for (const other of Object.keys(PROGRAMS).filter(name => name !== 'kimi')) {
      ok(!exists(box.carrier(other)), `v-a: kimi install writes no ${other} carrier`);
    }
    ok(!exists(path.join(box.home, '.config', 'kaola-workflow', 'global-contract-receipt.json')),
      'v-a: per-target install never writes the shared batch receipt');

    // Break three OTHER runtimes' carriers, each in a way that used to abort the whole batch.
    write(box.carrier('codex'), `${START}\nhand edited region with no receipt\n<!-- KW-GLOBAL-CONTRACT-MANAGED-END -->\n`);
    write(path.join(box.root, 'foreign'), 'foreign\n');
    fs.mkdirSync(path.dirname(box.carrier('grok')), { recursive: true });
    fs.symlinkSync(path.join(box.root, 'foreign'), box.carrier('grok'));
    write(box.carrier('zcode'), `${START}\n${START}\nmalformed\n`);

    same(gc(box, ['check', '--runtime', 'kimi', '--nonce', 'A'], 0).json.status, 'CURRENT',
      'v-a: kimi --check stays CURRENT while codex/grok/zcode carriers are broken');
    const kimiBytes = read(box.carrier('kimi'));
    same(gc(box, ['install', '--runtime', 'kimi', '--nonce', 'A'], 0).json.status, 'INSTALLED',
      'v-a: kimi reinstall succeeds while other carriers are broken');
    same(read(box.carrier('kimi')), kimiBytes, 'v-a: kimi reinstall is byte-idempotent');

    same(gc(box, ['install', '--runtime', 'codex'], 2).json.status, 'OWNER_CONFLICT',
      'v-a: the hand-edited codex carrier conflicts for codex');
    same(gc(box, ['install', '--runtime', 'grok'], 2).json.status, 'PREFLIGHT_BLOCKED',
      'v-a: the symlinked grok carrier blocks grok');
    same(gc(box, ['install', '--runtime', 'zcode'], 2).json.status, 'PREFLIGHT_BLOCKED',
      'v-a: malformed zcode markers block zcode');

    // One call, several targets: rows are independent commits.
    const mixed = gc(box, ['install', '--runtime', 'codex,grok,opencode,zcode', '--nonce', 'A'], 2).json;
    same(row(mixed, 'opencode-local').status, 'INSTALLED', 'v-a: opencode installs in the same call as three failures');
    same(row(mixed, 'codex-local').status, 'OWNER_CONFLICT', 'v-a: codex row reports its own conflict');
    same(row(mixed, 'grok-local').status, 'PREFLIGHT_BLOCKED', 'v-a: grok row reports its own preflight block');
    same(row(mixed, 'zcode-local').status, 'PREFLIGHT_BLOCKED', 'v-a: zcode row reports its own preflight block');
    ok(read(box.carrier('opencode')).includes('Contract nonce: A'), 'v-a: opencode carrier was written');
    ok(!exists(box.record('codex-local')), 'v-a: a conflicted target writes no record');

    // Cross-runtime DRIFT is not this runtime's failure.
    same(gc(box, ['check', '--runtime', 'opencode', '--nonce', 'B'], 3).json.status, 'DRIFT',
      'v-a: opencode reports its own drift after a contract change');
    same(gc(box, ['check', '--runtime', 'kimi', '--nonce', 'A'], 0).json.status, 'CURRENT',
      'v-a: kimi --check ignores opencode drift');

    // A broken shared batch receipt is only advisory evidence to a per-target run.
    write(path.join(box.home, '.config', 'kaola-workflow', 'global-contract-receipt.json'), '{"schema_version":999}\n');
    const advisory = gc(box, ['check', '--runtime', 'kimi', '--nonce', 'A'], 0).json;
    same(advisory.status, 'CURRENT', 'v-a: an unreadable batch receipt does not fail kimi --check');
    ok((advisory.advisories || []).some(item => item.kind === 'legacy_receipt_unreadable'),
      'v-a: the unreadable batch receipt is reported as an advisory line');
  } finally { box.cleanup(); }
}

// ---------------------------------------------------------------------------
// (v-b) DORMANT round trip
// ---------------------------------------------------------------------------
{
  const box = sandbox('dormant');
  try {
    box.on('kimi'); box.on('codex');
    const ownerText = '# Kimi owner rules\n';
    write(box.carrier('kimi'), ownerText);
    gc(box, ['install', '--runtime', 'kimi,codex', '--nonce', 'A'], 0);
    same(JSON.parse(read(box.record('kimi-local'))).status, 'INSTALLED', 'v-b: detected kimi record is INSTALLED');

    box.off('kimi');
    const dormantCheck = gc(box, ['check', '--runtime', 'kimi', '--nonce', 'B'], 3).json;
    const dormantRow = row(dormantCheck, 'kimi-local');
    same([dormantRow.status, dormantRow.detected, dormantRow.record_status], ['DRIFT', false, 'DORMANT'],
      'v-b: off PATH, kimi keeps its record as DORMANT and reports its stale carrier');
    ok(exists(box.record('kimi-local')), 'v-b: going off PATH releases nothing');
    same(gc(box, ['install', '--runtime', 'codex', '--nonce', 'B'], 0).json.status, 'INSTALLED',
      'v-b: codex refreshes to the new contract while kimi is dormant');

    // Legacy batch run while kimi is away: its row is kept as DORMANT, not dropped.
    const batch = gc(box, ['install', '--nonce', 'B'], 0).json;
    const kept = row(batch, 'kimi-local');
    same(kept.status, 'DORMANT', 'v-b: batch keeps the absent runtime row as DORMANT');
    ok(kept.path === box.carrier('kimi') && kept.install_sha256 === sha(fs.readFileSync(box.carrier('kimi'))),
      'v-b: the DORMANT row keeps path and install hash');
    ok(read(box.carrier('kimi')).includes('Contract nonce: A'), 'v-b: a dormant carrier is not rewritten');

    // Kimi returns after the contract changed.
    box.on('kimi');
    const back = gc(box, ['install', '--runtime', 'kimi', '--nonce', 'B'], 0).json;
    same(row(back, 'kimi-local').status, 'INSTALLED', 'v-b: returning kimi refreshes without OWNER_CONFLICT');
    same(row(back, 'kimi-local').refreshed, true, 'v-b: returning kimi rewrote its stale carrier');
    const text = read(box.carrier('kimi'));
    ok(text.startsWith(ownerText) && text.split('Contract nonce: B').length === 2 && !text.includes('Contract nonce: A'),
      'v-b: refreshed carrier holds one new contract and the owner bytes');
    same(gc(box, ['check', '--nonce', 'B'], 0).json.status, 'CURRENT',
      'v-b: the batch view is CURRENT after the per-target refresh (evidence is shared)');

    // Legacy batch return path: batch install after a contract change no longer conflicts.
    box.off('kimi');
    gc(box, ['install', '--nonce', 'C'], 0);
    box.on('kimi');
    same(gc(box, ['install', '--nonce', 'D'], 0).json.status, 'INSTALLED',
      'v-b: batch install after the runtime returns refreshes instead of OWNER_CONFLICT');

    // A dormant carrier edited by hand conflicts for that runtime only.
    box.off('kimi');
    fs.writeFileSync(box.carrier('kimi'), read(box.carrier('kimi')).replace('Contract nonce: D', 'hand edit'));
    box.on('kimi');
    const conflict = gc(box, ['install', '--runtime', 'kimi,codex', '--nonce', 'E'], 2).json;
    same(row(conflict, 'kimi-local').status, 'OWNER_CONFLICT', 'v-b: a mismatched dormant carrier conflicts for kimi');
    same(row(conflict, 'codex-local').status, 'INSTALLED', 'v-b: the kimi conflict blocks nothing else');

    // Per-target install of an undetected runtime records DORMANT ownership.
    const fresh = gc(box, ['install', '--runtime', 'droid'], 0).json;
    same([row(fresh, 'droid-local').status, row(fresh, 'droid-local').detected], ['DORMANT', false],
      'v-b: an explicit install of an undetected runtime is recorded DORMANT');
  } finally { box.cleanup(); }
}

// ---------------------------------------------------------------------------
// Per-target uninstall + shared-reference registry contract (stubbed; Lane A owns the module)
// ---------------------------------------------------------------------------
{
  const box = sandbox('uninstall');
  try {
    box.on('kimi'); box.on('codex');
    const log = path.join(box.root, 'refs.log');
    const stub = path.join(box.root, 'shared-refs-stub.js');
    write(stub, [
      "const fs = require('fs');",
      `const log = ${JSON.stringify(log)};`,
      'module.exports = {',
      "  registerSharedRef(block, runtime, meta) { fs.appendFileSync(log, JSON.stringify(['register', block, runtime, meta]) + '\\n'); },",
      "  deregisterSharedRef(block, runtime) { fs.appendFileSync(log, JSON.stringify(['deregister', block, runtime]) + '\\n'); return { remaining: ['codex'] }; },",
      '  listRefs() { return []; },',
      '};',
      '',
    ].join('\n'));
    box.env.KAOLA_SHARED_REFS_MODULE = stub;
    const ownerText = '# Kimi owner rules\nline two\n';
    write(box.carrier('kimi'), ownerText);
    const installed = gc(box, ['install', '--runtime', 'kimi,codex'], 0).json;
    same(installed.shared_refs.kimi.status, 'REGISTERED', 'refs: kimi registered its shared-block reference');
    const codexBytes = read(box.carrier('codex'));
    const removed = gc(box, ['uninstall', '--runtime', 'kimi'], 0).json;
    same(row(removed, 'kimi-local').status, 'UNINSTALLED', 'uninstall: kimi per-target uninstall succeeds');
    same(read(box.carrier('kimi')), ownerText, 'uninstall: kimi carrier returns to the exact owner bytes');
    ok(!exists(box.record('kimi-local')), 'uninstall: kimi record is removed');
    same(read(box.carrier('codex')), codexBytes, 'uninstall: codex carrier is untouched');
    ok(exists(box.record('codex-local')), 'uninstall: codex record is untouched');
    same(removed.shared_refs.kimi, { status: 'DEREGISTERED', remaining: ['codex'] },
      'refs: kimi deregistration reports the remaining references');
    const calls = read(log).trim().split('\n').map(line => JSON.parse(line));
    same(calls.map(call => call.slice(0, 3)), [
      ['register', 'kaola-config-dir', 'kimi'], ['register', 'kaola-config-dir', 'codex'],
      ['deregister', 'kaola-config-dir', 'kimi'],
    ], 'refs: registry calls are keyed by runtime id on the shared config block');
    same(calls[0][3].target_ids, ['kimi-local'], 'refs: register meta names the runtime targets');

    // A modified carrier refuses uninstall for its own target only.
    fs.appendFileSync(box.carrier('codex'), 'owner edit\n');
    same(gc(box, ['uninstall', '--runtime', 'codex'], 2).json.status, 'OWNER_CONFLICT',
      'uninstall: a modified codex carrier refuses uninstall');
    ok(exists(box.record('codex-local')), 'uninstall: the refused target keeps its record');
    delete box.env.KAOLA_SHARED_REFS_MODULE;
    const noModule = gc(box, ['install', '--runtime', 'kimi'], 0).json;
    ok(['UNAVAILABLE', 'REGISTERED'].includes(noModule.shared_refs.kimi.status),
      'refs: without the stub the registry module is either the real one or reported UNAVAILABLE');
  } finally { box.cleanup(); }
}

// ---------------------------------------------------------------------------
// install-all as a pure orchestrator over per-target installers; --skip skips carriers
// ---------------------------------------------------------------------------
{
  const box = sandbox('install-all');
  try {
    for (const runtime of Object.keys(PROGRAMS)) box.on(runtime);
    const stubRoot = path.join(box.root, 'tree');
    const installers = {
      claude: 'install.sh', opencode: 'install-opencode.sh', kimi: 'install-kimi.sh', grok: 'install-grok.sh',
      cursor: 'install-cursor.sh', zcode: 'install-zcode.sh', devin: 'install-devin.sh', droid: 'install-droid.sh',
      dsh: 'install-dsh.sh',
    };
    for (const [runtime, file] of Object.entries(installers)) {
      // Each stub does only what a real installer's LAST step does: install its own carrier.
      write(path.join(stubRoot, file),
        `#!/bin/bash\nnode ${JSON.stringify(CLI)} install --runtime ${runtime} --json >/dev/null\n`, 0o755);
    }
    write(path.join(stubRoot, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js'),
      `const r = require('child_process').spawnSync(process.execPath, [${JSON.stringify(CLI)}, 'install', '--runtime', 'codex', '--json']);\nprocess.exit(r.status);\n`);
    const allEnv = { ...box.env, KAOLA_INSTALL_ALL_ROOT: stubRoot, KAOLA_GLOBAL_CONTRACT_CLI: CLI,
      KAOLA_CODEX_BIN: path.join(box.root, 'no-codex-cli') };
    const runAll = args => spawnSync('bash', [path.join(ROOT, 'install-all.sh'), '--yes', ...args], {
      cwd: box.root, env: allEnv, encoding: 'utf8', timeout: 120000,
    });

    write(box.carrier('codex'), `${START}\nforeign region\n<!-- KW-GLOBAL-CONTRACT-MANAGED-END -->\n`);
    const first = runAll(['--skip=grok']);
    same(first.status, 1, `install-all: exits 1 because codex alone failed (${first.stdout}${first.stderr})`);
    ok(/codex\s+FAIL/.test(first.stdout), 'install-all: codex row FAILs on its own conflict');
    for (const runtime of ['claude', 'opencode', 'kimi', 'cursor', 'zcode', 'devin', 'droid', 'dsh']) {
      ok(new RegExp(`${runtime}\\s+PASS`).test(first.stdout), `install-all: ${runtime} still PASSes`);
      ok(exists(box.carrier(runtime)) && exists(box.record(`${runtime === 'cursor' ? 'cursor-cli' : runtime}-local`)),
        `install-all: ${runtime} carrier and record installed by its own installer`);
    }
    ok(/grok\s+SKIP/.test(first.stdout), 'install-all: grok row is SKIP');
    ok(!exists(box.carrier('grok')) && !exists(box.record('grok-local')),
      'install-all: --skip=grok writes no grok carrier and no grok record');

    // --check: one line per runtime; a DORMANT runtime is advisory; a detected drift fails only its row.
    box.off('dsh');
    fs.appendFileSync(box.carrier('dsh'), 'owner edit while away\n');
    fs.appendFileSync(box.carrier('kimi'), 'owner edit\n');
    const check = runAll(['--check', '--skip=grok,codex']);
    same(check.status, 1, 'install-all --check: exits 1 because detected kimi drifted');
    ok(/\[global-contract\] kimi: carrier DRIFT/.test(check.stdout), 'install-all --check: kimi reports its own drift');
    ok(/kimi\s+FAIL/.test(check.stdout), 'install-all --check: kimi row fails');
    ok(/\[global-contract\] dsh: carrier DRIFT.*DORMANT, advisory/.test(check.stdout),
      'install-all --check: dsh off PATH is reported as a DORMANT advisory line');
    ok(/dsh\s+PLAN/.test(check.stdout), 'install-all --check: dsh advisory does not fail its row');
    for (const runtime of ['claude', 'opencode', 'cursor', 'zcode', 'devin', 'droid']) {
      ok(new RegExp(`\\[global-contract\\] ${runtime}: carrier CURRENT`).test(check.stdout)
        && new RegExp(`${runtime}\\s+PLAN`).test(check.stdout),
      `install-all --check: ${runtime} is CURRENT on its own line`);
    }
  } finally { box.cleanup(); }
}

// ---------------------------------------------------------------------------
// (vi) standalone single-runtime installs are complete, with no other runtime present
// ---------------------------------------------------------------------------
function otherCarriers(box, runtime) {
  return Object.keys(PROGRAMS).filter(name => name !== runtime && exists(box.carrier(name)));
}
function standalone(runtime, command, args, extraCheck) {
  const box = sandbox(`solo-${runtime}`);
  try {
    box.on(runtime);
    // spawn-class: environment
    const result = spawnSync(command[0], [...command.slice(1), ...args], {
      cwd: box.root, env: box.env, encoding: 'utf8', timeout: 300000,
    });
    same(result.status, 0, `vi[${runtime}]: standalone installer exits 0 (${String(result.stderr).slice(-800)})`);
    ok(exists(box.carrier(runtime)), `vi[${runtime}]: installs its own global-contract carrier`);
    const record = JSON.parse(read(box.record(`${runtime === 'cursor' ? 'cursor-cli' : runtime}-local`)));
    same(record.status, 'INSTALLED', `vi[${runtime}]: its own record is INSTALLED`);
    same(gc(box, ['check', '--runtime', runtime], 0).json.status, 'CURRENT',
      `vi[${runtime}]: its carrier checks CURRENT right after the standalone install`);
    same(otherCarriers(box, runtime), [], `vi[${runtime}]: no other runtime's carrier was written`);
    ok(!exists(path.join(box.home, '.config', 'kaola-workflow', 'global-contract-receipt.json')),
      `vi[${runtime}]: no shared batch receipt was written`);
    if (extraCheck) extraCheck(box, result);
  } finally { box.cleanup(); }
}

standalone('kimi', ['bash', path.join(ROOT, 'install-kimi.sh')], ['--global', '--yes']);
standalone('dsh', ['bash', path.join(ROOT, 'install-dsh.sh')], ['--global', '--yes'], box => {
  for (const home of ['.claude', '.codex', '.kimi-code', '.grok', '.cursor', '.zcode', path.join('.config', 'opencode'),
    path.join('.config', 'devin'), '.factory']) {
    ok(!exists(path.join(box.home, home)), `vi[dsh]: standalone dsh install creates no ${home}`);
  }
  // spawn-class: environment
  const check = spawnSync('bash', [path.join(ROOT, 'install-dsh.sh'), '--global', '--check'], {
    cwd: box.root, env: box.env, encoding: 'utf8', timeout: 120000,
  });
  same(check.status, 0, `vi[dsh]: install-dsh.sh --check passes on its own carrier (${check.stderr})`);
  // Another runtime's broken carrier cannot fail dsh --check (the F3 wrapper case).
  write(box.carrier('devin'), `${START}\nforeign\n`);
  // spawn-class: environment
  const again = spawnSync('bash', [path.join(ROOT, 'install-dsh.sh'), '--global', '--check'], {
    cwd: box.root, env: box.env, encoding: 'utf8', timeout: 120000,
  });
  same(again.status, 0, `vi[dsh]: a malformed devin carrier does not fail dsh --check (${again.stderr})`);
});
standalone('codex', [process.execPath, path.join(ROOT, 'plugins', 'kaola-workflow', 'scripts',
  'install-codex-agent-profiles.js')], ['--global'], (box, result) => {
  ok(/Kaola-Workflow Codex global contract: INSTALLED at /.test(result.stdout),
    'vi[codex]: the profile installer reports its own carrier');
  ok(/status: ok\s*$/.test(result.stdout), 'vi[codex]: installer stdout still ends with status: ok');
});
standalone('claude', ['bash', path.join(ROOT, 'install.sh')], ['--yes', '--no-settings-merge']);

console.log(`issue-1087 lane-b per-target global contract: ${passed} passed`);
