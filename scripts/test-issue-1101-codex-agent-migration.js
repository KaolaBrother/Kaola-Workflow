#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property under
// test is what the real Codex installer (all three plugin editions) does to a synthetic HOME and
// project that already hold what an earlier release installed.
//
// #1101 — Kaola-Workflow ships no Codex role profiles and registers none. The installer entry point
// keeps its name and CLI (install-all.sh, the preflight and older plugin caches call it); it now
// installs only the non-role content (global compact hook, hook home, global contract) and retires
// what earlier releases put in <scope>/.codex, only on proof:
//   profiles  in .codex/agents/kaola-workflow/: the ownership record (.kaola-managed-profiles.json)
//             lists the file with the digest it still has, or the bytes are a profile some release
//             shipped (the frozen RELEASED_PROFILE_SHA256 catalog — this is what proves a pre-#332
//             install that wrote no record);
//   block     `# BEGIN/END kaola-workflow agents` in config.toml: stripped only when its body is
//             exactly a body some release wrote.
// Everything else is preserved and reported (modified_since_install | no_ownership_record |
// non_regular | referenced_by_user_config | mixed_managed_block | ambiguous_markers |
// unsupported_record). A profile the remaining config still names in config_file is kept.
//
// Meaning changes this suite carries (#1101 Host rulings; replaced assertions in
// test-install-model-rendering.js and the Codex walkthroughs):
//   H2 — a retired profile NAME is no longer proof: with no record, only a released byte-exact
//        profile is removed (was: any RETIRED_PROFILE_FILES name, unconditionally — the #332 AC4
//        "retired docs-lookup pruned without a manifest" meaning now reads "a released docs-lookup
//        profile is pruned without a manifest; an edited one is preserved", case C9).
//   H9 — an ambiguous marker layout, a future-schema record or a symlinked scope path no longer
//        refuses the install (was: managed_block_ambiguous / manifest_schema_unsupported /
//        install_target_unsafe exits); the retirement keeps and reports them and the non-role
//        install proceeds. A symlinked HOME write target (hooks) still refuses (case C12).
//   The managed_role_conflict_outside refusal is gone: once the roles retire, a role table outside
//        the block is the user's (case C8).
//
// SAFETY: HOME, cwd and every project live in one mkdtemp sandbox; `assertSandboxed` refuses
// anything else; KAOLA_*, *_HOME and XDG_* are scrubbed and PATH is cut to node + system dirs; a
// tripwire asserts the developer's real ~/.codex/agents listing is unchanged.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'issue-1101');
const EDITIONS = ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'];
const installerOf = edition => path.join(ROOT, 'plugins', edition, 'scripts', 'install-codex-agent-profiles.js');
const CURRENT = 'v12.2.6-46fbe12d';
const CURRENT_ROLES = ['code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide'];
const BEGIN = '# BEGIN kaola-workflow agents';
const END = '# END kaola-workflow agents';
const REMOVED = 'Removed retired Kaola-Workflow agent: ';
const REMOVED_RECORD = 'Removed retired Kaola-Workflow agent record: ';
const REMOVED_REG = 'Removed retired Kaola-Workflow agent registrations: ';
const PRESERVED = reason => `Preserved retired Kaola-Workflow agent (${reason}): `;
const PRESERVED_REG = reason => `Preserved retired Kaola-Workflow agent registrations (${reason}): `;

const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-1101-codex-')));
const REAL_HOME = fs.realpathSync(os.homedir());
const REAL_CODEX_AGENTS = path.join(REAL_HOME, '.codex', 'agents');
const listDir = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const realBefore = listDir(REAL_CODEX_AGENTS);

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('  FAIL: ' + msg);
}
function section(name, fn) {
  const before = failed;
  try { fn(); } catch (err) { failed++; console.error(`  FAIL: ${name} threw: ${err && err.stack || err}`); }
  console.log(`${failed === before ? 'ok  ' : 'FAIL'} ${name}`);
}

function assertSandboxed(dir) {
  const real = fs.realpathSync(dir);
  if (!real.startsWith(SANDBOX + path.sep) || real === REAL_HOME || REAL_HOME.startsWith(real + path.sep)) {
    throw new Error(`refusing to run the installer with ${real}: outside the sandbox ${SANDBOX}`);
  }
}

let seq = 0;
function makeHome(label) {
  const home = path.join(SANDBOX, `${++seq}-${label}`);
  fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });
  fs.mkdirSync(path.join(home, 'proj'), { recursive: true });
  return home;
}

const NODE_DIR = path.dirname(process.execPath);
function childEnv(home, extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('KAOLA_') || k.endsWith('_HOME') || k.startsWith('XDG_') || k === 'CLAUDE_CONFIG_DIR') continue;
    env[k] = v;
  }
  env.HOME = home;
  env.PATH = [NODE_DIR, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter);
  return Object.assign(env, extra || {});
}

function runInstaller(installer, args, home, extraEnv) {
  assertSandboxed(home);
  for (const a of args) if (path.isAbsolute(a)) assertSandboxed(a);
  // spawn-class: environment
  const r = spawnSync(process.execPath, [installer].concat(args), {
    cwd: path.join(home, 'cwd'), env: childEnv(home, extraEnv), encoding: 'utf8',
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const installGlobal = (home, edition, env) => runInstaller(installerOf(edition || EDITIONS[0]), ['--global'], home, env);
const installProject = (home, edition, env) =>
  runInstaller(installerOf(edition || EDITIONS[0]), [path.join(home, 'proj')], home, env);
const uninstallGlobal = (home, edition) => runInstaller(installerOf(edition || EDITIONS[0]), ['--global', '--uninstall'], home);
const uninstallProject = (home, edition) =>
  runInstaller(installerOf(edition || EDITIONS[0]), [path.join(home, 'proj'), '--uninstall'], home);

// Fixture files store leading-dot names as `dot-<name>` (the repo .gitignore excludes .codex/ etc.).
const toFixtureRel = rel => rel.split('/').map(s => (s.startsWith('.') ? 'dot-' + s.slice(1) : s)).join('/');
const fromFixtureName = name => (name.startsWith('dot-') ? '.' + name.slice(4) : name);
function plantFixture(era, sub, home, destSub) {
  const src = path.join(FIXTURES, era, 'home', toFixtureRel(sub));
  const dest = path.join(home, destSub || sub);
  const walk = (s, d) => {
    for (const e of fs.readdirSync(path.join(src, s), { withFileTypes: true })) {
      const ss = path.join(s, e.name);
      const dd = path.join(d, fromFixtureName(e.name));
      if (e.isDirectory()) { walk(ss, dd); continue; }
      fs.mkdirSync(path.dirname(path.join(dest, dd)), { recursive: true });
      fs.writeFileSync(path.join(dest, dd), fs.readFileSync(path.join(src, ss), 'utf8').split('@@HOME@@').join(home));
    }
  };
  walk('', '');
  return dest;
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tomls = dir => listDir(dir).filter(n => n.endsWith('.toml'));
function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.isSymbolicLink()) out[r] = 'symlink:' + fs.readlinkSync(path.join(dir, r));
      else out[r] = sha256(path.join(dir, r));
    }
  };
  walk('');
  return out;
}
const lines = out => out.split('\n');
const hasLine = (out, line) => lines(out).includes(line);
const countPrefix = (out, prefix) => lines(out).filter(l => l.startsWith(prefix)).length;
const codexOf = scopeRoot => path.join(scopeRoot, '.codex');
const nsOf = scopeRoot => path.join(scopeRoot, '.codex', 'agents', 'kaola-workflow');
const configOf = scopeRoot => path.join(scopeRoot, '.codex', 'config.toml');
const readText = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

try {
  // C1 — a fresh install writes no profile and registers none; the non-role content is installed.
  for (const edition of EDITIONS) {
    section(`C1 fresh install (${edition}) installs no profile and no registration`, () => {
      const home = makeHome(`fresh-${edition}`);
      const g = installGlobal(home, edition);
      check(g.status === 0, `--global exits 0, got ${g.status}\n${g.out}`);
      check(/status: ok\s*$/.test(g.out), 'installer stdout still ends with status: ok');
      const p = installProject(home, edition);
      check(p.status === 0, `project install exits 0, got ${p.status}\n${p.out}`);
      for (const scope of [home, path.join(home, 'proj')]) {
        check(!fs.existsSync(nsOf(scope)), `no .codex/agents/kaola-workflow under ${scope}`);
        check(!readText(configOf(scope)).includes(BEGIN), `no registration block in ${configOf(scope)}`);
      }
      const hooks = JSON.parse(readText(path.join(home, '.codex', 'hooks.json')) || '{}');
      check(JSON.stringify(hooks).includes('kaola-workflow:compact-context'), 'the global compact hook is installed');
      check(fs.existsSync(path.join(home, '.codex', 'kaola-workflow', 'hooks', 'kaola-workflow-codex-compact-recovery.md')),
        'the version-less hook home is installed');
      check(readText(path.join(home, '.codex', 'AGENTS.md')).includes('KW-GLOBAL-CONTRACT-MANAGED-START'),
        'the global contract carrier is installed');
    });
  }

  // C2 — upgrade from the current release (global + project scope, every edition).
  for (const edition of EDITIONS) {
    section(`C2 upgrade from 46fbe12d via ${edition} retires profiles, record and block; keeps user config`, () => {
      const home = makeHome(`upgrade-${edition}`);
      plantFixture(CURRENT, '.codex', home);
      plantFixture(CURRENT, '.config', home);
      plantFixture(CURRENT, 'proj/.codex', home);
      const userTail = '\nmodel = "user-model"\n\n[agents.my-local-role]\ndescription = "mine"\nconfig_file = "./agents/mine.toml"\n';
      fs.appendFileSync(configOf(home), userTail);
      const g = installGlobal(home, edition);
      check(g.status === 0, `--global upgrade exits 0\n${g.out}`);
      const p = installProject(home, edition);
      check(p.status === 0, `project upgrade exits 0\n${p.out}`);
      for (const [scope, r] of [[home, g], [path.join(home, 'proj'), p]]) {
        for (const role of CURRENT_ROLES) {
          const file = path.join(nsOf(scope), role + '.toml');
          check(!fs.existsSync(file), `${edition}: ${file} removed`);
          check(hasLine(r.out, REMOVED + file), `${edition}: removal of ${role}.toml reported`);
        }
        check(hasLine(r.out, REMOVED_RECORD + path.join(nsOf(scope), '.kaola-managed-profiles.json')), 'record retirement reported');
        check(!fs.existsSync(nsOf(scope)), `${edition}: the emptied kaola-workflow namespace dir is removed`);
        check(!readText(configOf(scope)).includes(BEGIN) && !readText(configOf(scope)).includes(END),
          `${edition}: the registration block is stripped from ${configOf(scope)}`);
        check(hasLine(r.out, REMOVED_REG + configOf(scope)), 'block retirement reported');
      }
      check(readText(configOf(home)).includes(userTail.trim()), 'user config outside the block is kept byte-for-byte');
      check(readText(path.join(home, '.codex', 'AGENTS.md')).includes('KW-GLOBAL-CONTRACT-MANAGED-START')
        && !/OWNER_CONFLICT|global_contract_failed/.test(g.out), 'the carrier the old release installed converges');
    });
  }

  // C3 — upgrade from older releases: v11.1.1 (record + fourteen-role block) and v5.11.0 (pre-#332:
  // no record at all, block with the [features] header) — the catalog proves the latter.
  section('C3 upgrade from v11.1.1 (record) and v5.11.0 (no record) retires every released profile', () => {
    const home = makeHome('upgrade-old');
    plantFixture('v11.1.1', '.codex', home);
    plantFixture('v5.11.0', 'proj/.codex', home);
    check(!fs.existsSync(path.join(nsOf(path.join(home, 'proj')), '.kaola-managed-profiles.json')),
      'the v5.11.0 fixture carries no ownership record');
    const plantedG = tomls(nsOf(home));
    const plantedP = tomls(nsOf(path.join(home, 'proj')));
    const g = installGlobal(home);
    const p = installProject(home);
    check(g.status === 0 && p.status === 0, `both upgrades exit 0\n${g.out}\n${p.out}`);
    for (const n of plantedG) check(hasLine(g.out, REMOVED + path.join(nsOf(home), n)), `v11.1.1: ${n} removed`);
    for (const n of plantedP) check(hasLine(p.out, REMOVED + path.join(nsOf(path.join(home, 'proj')), n)), `v5.11.0: ${n} removed`);
    check(!readText(configOf(home)).includes(BEGIN), 'v11.1.1 fourteen-role block stripped');
    check(!readText(configOf(path.join(home, 'proj'))).includes(BEGIN), 'v5.11.0 [features]-carrying block stripped');
  });

  // C4 — reinstall is idempotent.
  section('C4 reinstall after an upgrade changes nothing and removes nothing', () => {
    const home = makeHome('reinstall');
    plantFixture(CURRENT, '.codex', home);
    plantFixture(CURRENT, '.config', home);
    fs.appendFileSync(path.join(nsOf(home), 'tdd-guide.toml'), '\n# my note\n');
    check(installGlobal(home).status === 0, 'first install exits 0');
    const before = snapshot(codexOf(home));
    const again = installGlobal(home);
    check(again.status === 0, `second install exits 0\n${again.out}`);
    check(countPrefix(again.out, 'Removed retired') === 0, 'the second install removes nothing');
    check(hasLine(again.out, PRESERVED('no_ownership_record') + path.join(nsOf(home), 'tdd-guide.toml')),
      'the kept edited profile is still reported, now as unrecorded');
    const after = snapshot(codexOf(home));
    delete before['hooks.json']; delete after['hooks.json'];
    check(JSON.stringify(after) === JSON.stringify(before), 'the .codex tree is unchanged by the reinstall');
  });

  // C5 — uninstall (project and global) from the current state, then again.
  section('C5 uninstall retires proven profiles and the block, and is idempotent', () => {
    const home = makeHome('uninstall');
    plantFixture(CURRENT, '.codex', home);
    plantFixture(CURRENT, 'proj/.codex', home);
    const p = uninstallProject(home);
    check(p.status === 0, `project uninstall exits 0\n${p.out}`);
    check(!fs.existsSync(nsOf(path.join(home, 'proj'))), 'project profiles retired');
    check(!readText(configOf(path.join(home, 'proj'))).includes(BEGIN), 'project block stripped');
    check(tomls(nsOf(home)).length === CURRENT_ROLES.length, 'a project uninstall does not touch the global scope');
    const g = uninstallGlobal(home);
    check(g.status === 0, `global uninstall exits 0\n${g.out}`);
    check(!fs.existsSync(nsOf(home)), 'global profiles retired');
    const again = uninstallGlobal(home);
    check(again.status === 0 && countPrefix(again.out, 'Removed retired') === 0, 'a second uninstall removes nothing');
  });

  // C6/C7 — same-name user profile and an edited Kaola profile are preserved.
  section('C6/C7 a user profile with a Kaola name and an edited Kaola profile are preserved', () => {
    const home = makeHome('same-name');
    plantFixture(CURRENT, '.codex', home);
    const mine = 'name = "implementer"\ndescription = "my own"\ndeveloper_instructions = "mine"\n';
    fs.writeFileSync(path.join(nsOf(home), 'implementer.toml'), mine);
    const edited = readText(path.join(nsOf(home), 'code-reviewer.toml')) + '\n# edited\n';
    fs.writeFileSync(path.join(nsOf(home), 'code-reviewer.toml'), edited);
    fs.writeFileSync(path.join(nsOf(home), 'my-custom.toml'), 'name = "my-custom"\n');
    for (const step of ['install', 'uninstall']) {
      const r = step === 'install' ? installGlobal(home) : uninstallGlobal(home);
      check(r.status === 0, `${step} exits 0\n${r.out}`);
      check(readText(path.join(nsOf(home), 'implementer.toml')) === mine, `${step}: user implementer.toml byte-identical`);
      check(readText(path.join(nsOf(home), 'code-reviewer.toml')) === edited, `${step}: edited code-reviewer.toml byte-identical`);
      check(readText(path.join(nsOf(home), 'my-custom.toml')) === 'name = "my-custom"\n', `${step}: my-custom.toml untouched`);
    }
  });
  section('C6/C7 preservation reasons are reported', () => {
    const home = makeHome('same-name-report');
    plantFixture(CURRENT, '.codex', home);
    fs.writeFileSync(path.join(nsOf(home), 'implementer.toml'), 'name = "implementer"\n');
    fs.writeFileSync(path.join(nsOf(home), 'my-custom.toml'), 'name = "my-custom"\n');
    const r = installGlobal(home);
    check(hasLine(r.out, PRESERVED('modified_since_install') + path.join(nsOf(home), 'implementer.toml')),
      'a recorded name whose bytes changed is reported as modified');
    check(hasLine(r.out, PRESERVED('no_ownership_record') + path.join(nsOf(home), 'my-custom.toml')),
      'an unrecorded file in the Kaola namespace dir is reported');
  });

  // C8 — mixed config.
  section('C8 an edited block, a user registration of a Kaola file, and ambiguous markers are kept', () => {
    const home = makeHome('mixed-block');
    plantFixture(CURRENT, '.codex', home);
    const cfg = configOf(home);
    fs.writeFileSync(cfg, readText(cfg).replace(END, '[agents.mine]\nconfig_file = "./agents/mine.toml"\n' + END));
    const before = readText(cfg);
    const r = installGlobal(home);
    check(r.status === 0, `install with an edited block exits 0\n${r.out}`);
    check(readText(cfg) === before, 'an edited block is left byte-for-byte');
    check(hasLine(r.out, PRESERVED_REG('mixed_managed_block') + cfg), 'the edited block is reported');
    for (const role of CURRENT_ROLES) {
      check(hasLine(r.out, PRESERVED('referenced_by_user_config') + path.join(nsOf(home), role + '.toml')),
        `${role}.toml, still registered by the kept block, is kept`);
    }

    const home2 = makeHome('user-registration');
    plantFixture(CURRENT, '.codex', home2);
    fs.appendFileSync(configOf(home2), '\n[agents.my-impl]\nconfig_file = "./agents/kaola-workflow/implementer.toml"\n');
    const r2 = installGlobal(home2);
    check(r2.status === 0, `install exits 0\n${r2.out}`);
    check(!readText(configOf(home2)).includes(BEGIN), 'the release-exact block is still stripped');
    check(fs.existsSync(path.join(nsOf(home2), 'implementer.toml')), 'the file a user table registers is kept');
    check(!fs.existsSync(path.join(nsOf(home2), 'tdd-guide.toml')), 'unreferenced proven profiles still go');
    check(readText(configOf(home2)).includes('[agents.my-impl]'), 'the user table outside the block is kept (no role-conflict refusal)');

    const home3 = makeHome('ambiguous');
    plantFixture(CURRENT, '.codex', home3);
    fs.appendFileSync(configOf(home3), `\n${BEGIN}\n`);
    const cfg3 = readText(configOf(home3));
    const r3 = installGlobal(home3);
    check(r3.status === 0, `ambiguous markers no longer refuse the install (H9)\n${r3.out}`);
    check(readText(configOf(home3)) === cfg3, 'an ambiguous config is left byte-for-byte');
    check(hasLine(r3.out, PRESERVED_REG('ambiguous_markers') + configOf(home3)), 'the ambiguous layout is reported');
  });

  // C9 — no record / unreadable record / hostile record rows.
  section('C9 without a record only released bytes go; hostile record rows never escape', () => {
    const home = makeHome('no-record');
    plantFixture(CURRENT, '.codex', home);
    fs.rmSync(path.join(nsOf(home), '.kaola-managed-profiles.json'));
    fs.appendFileSync(path.join(nsOf(home), 'doc-updater.toml'), '\n# edited\n');
    const r = installGlobal(home);
    check(r.status === 0, `install exits 0\n${r.out}`);
    check(!fs.existsSync(path.join(nsOf(home), 'implementer.toml')), 'a released profile is proven by the catalog alone');
    check(fs.existsSync(path.join(nsOf(home), 'doc-updater.toml')), 'an edited unrecorded profile is kept (H2: no removal by name)');
    check(hasLine(r.out, PRESERVED('no_ownership_record') + path.join(nsOf(home), 'doc-updater.toml')), 'and reported');

    const home2 = makeHome('future-record');
    plantFixture(CURRENT, '.codex', home2);
    const rec = path.join(nsOf(home2), '.kaola-managed-profiles.json');
    fs.writeFileSync(rec, JSON.stringify({ schema_version: 2, files: {} }));
    const r2 = installGlobal(home2);
    check(r2.status === 0, `a future-schema record no longer refuses the install (H9)\n${r2.out}`);
    check(fs.existsSync(rec), 'the unreadable record is kept');
    check(hasLine(r2.out, PRESERVED('unsupported_record') + rec), 'and reported');

    const home3 = makeHome('hostile-record');
    plantFixture(CURRENT, '.codex', home3);
    const victim = path.join(home3, '.codex', 'victim.toml');
    fs.writeFileSync(victim, 'victim = true\n');
    const rec3 = path.join(nsOf(home3), '.kaola-managed-profiles.json');
    const doc = JSON.parse(readText(rec3));
    doc.files['../victim.toml'] = 'sha256:' + sha256(victim);
    fs.writeFileSync(rec3, JSON.stringify(doc));
    const r3 = installGlobal(home3);
    check(r3.status === 0 && fs.existsSync(victim), 'a ../ record row never deletes outside the namespace dir');
  });

  // C10 — no resurrection: a plugin root that still carries agents/*.toml and config/agents.toml
  // (a stale checkout or an old cache next to the new installer) installs no profile.
  section('C10 stale agents/ and config/agents.toml next to the installer are never installed', () => {
    const plugin = path.join(SANDBOX, 'stale-plugin', 'plugins', 'kaola-workflow');
    fs.cpSync(path.join(ROOT, 'plugins', 'kaola-workflow'), plugin, { recursive: true });
    fs.cpSync(path.join(ROOT, 'scripts'), path.join(SANDBOX, 'stale-plugin', 'scripts'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'templates'), path.join(SANDBOX, 'stale-plugin', 'templates'), { recursive: true });
    const staleHome = makeHome('stale-src');
    plantFixture(CURRENT, '.codex/agents/kaola-workflow', staleHome, 'stale-agents');
    fs.mkdirSync(path.join(plugin, 'agents'), { recursive: true });
    for (const n of tomls(path.join(staleHome, 'stale-agents'))) {
      fs.copyFileSync(path.join(staleHome, 'stale-agents', n), path.join(plugin, 'agents', n));
    }
    const block = readText(path.join(FIXTURES, CURRENT, 'home', 'dot-codex', 'config.toml'));
    fs.writeFileSync(path.join(plugin, 'config', 'agents.toml'), block.slice(block.indexOf('\n') + 1, block.indexOf(END)));
    const home = makeHome('stale-target');
    const r = runInstaller(path.join(plugin, 'scripts', 'install-codex-agent-profiles.js'), ['--global'], home);
    check(r.status === 0, `install from a stale plugin root exits 0\n${r.out}`);
    check(!fs.existsSync(nsOf(home)), 'no profile deployed from the stale plugin root');
    check(!readText(configOf(home)).includes(BEGIN), 'no registration written from the stale template');
  });

  // C11 — scopes: a project install touches only that project; CODEX_HOME is not a retirement
  // target (no release ever installed profiles there).
  section('C11 each scope retires only itself; CODEX_HOME is never a retirement target', () => {
    const home = makeHome('scopes');
    plantFixture(CURRENT, '.codex', home);
    plantFixture(CURRENT, 'proj/.codex', home);
    const codexHome = path.join(home, 'alt-codex');
    plantFixture(CURRENT, '.codex/agents', home, 'alt-codex/agents');
    const altBefore = snapshot(path.join(codexHome, 'agents'));
    const globalBefore = snapshot(nsOf(home));
    const p = installProject(home, EDITIONS[1], { CODEX_HOME: codexHome });
    check(p.status === 0, `project install exits 0\n${p.out}`);
    check(!fs.existsSync(nsOf(path.join(home, 'proj'))), 'the project scope is retired');
    check(JSON.stringify(snapshot(nsOf(home))) === JSON.stringify(globalBefore), 'the global scope is untouched by a project install');
    check(JSON.stringify(snapshot(path.join(codexHome, 'agents'))) === JSON.stringify(altBefore),
      'files under CODEX_HOME are untouched');
  });

  // C12 — symlinks are never followed; retire-only paths report, HOME write paths still refuse.
  section('C12 symlinked scope paths are reported; a symlinked hooks target still refuses', () => {
    const home = makeHome('symlink');
    const elsewhere = path.join(home, 'elsewhere');
    plantFixture(CURRENT, '.codex/agents/kaola-workflow', home, 'elsewhere');
    fs.mkdirSync(path.join(home, 'proj', '.codex', 'agents'), { recursive: true });
    fs.symlinkSync(elsewhere, nsOf(path.join(home, 'proj')));
    const realCfg = path.join(home, 'real-config.toml');
    fs.writeFileSync(realCfg, readText(path.join(FIXTURES, CURRENT, 'home', 'dot-codex', 'config.toml')));
    fs.symlinkSync(realCfg, configOf(path.join(home, 'proj')));
    const before = snapshot(elsewhere);
    const cfgBefore = readText(realCfg);
    const r = installProject(home);
    check(r.status === 0, `a symlinked project scope no longer refuses (H9)\n${r.out}`);
    check(JSON.stringify(snapshot(elsewhere)) === JSON.stringify(before), 'nothing behind the symlinked dir changed');
    check(readText(realCfg) === cfgBefore, 'the symlinked config target is untouched');
    check(hasLine(r.out, PRESERVED('non_regular') + nsOf(path.join(home, 'proj'))), 'the symlinked dir is reported');
    check(hasLine(r.out, PRESERVED_REG('non_regular') + configOf(path.join(home, 'proj'))), 'the symlinked config is reported');

    const home2 = makeHome('symlink-hooks');
    fs.mkdirSync(path.join(home2, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(home2, 'hooks-target.json'), '{}\n');
    fs.symlinkSync(path.join(home2, 'hooks-target.json'), path.join(home2, '.codex', 'hooks.json'));
    const r2 = installGlobal(home2);
    check(r2.status !== 0 && /install_target_unsafe/.test(r2.out), 'a symlinked hooks.json write target still refuses');
  });

  // C12 — a symlinked scope `.codex` PARENT is not followed either: the whole scope is kept and
  // reported (project), or the HOME write-target check refuses before anything is touched (global).
  // Before this, the leaf-only config check rewrote config.toml behind a symlinked project .codex.
  section('C12 a symlinked project .codex is kept and reported as a whole scope', () => {
    const home = makeHome('symlink-codex-project');
    const target = plantFixture(CURRENT, 'proj/.codex', home, 'elsewhere/codex');
    fs.symlinkSync(target, codexOf(path.join(home, 'proj')));
    const before = snapshot(target);
    const r = installProject(home);
    check(r.status === 0, `a symlinked project .codex does not refuse the install (H9)\n${r.out}`);
    check(JSON.stringify(snapshot(target)) === JSON.stringify(before),
      'nothing behind the symlinked .codex changed (config.toml, profiles, record)');
    check(hasLine(r.out, PRESERVED_REG('non_regular') + configOf(path.join(home, 'proj'))),
      'the registrations behind the symlinked .codex are reported, not removed');
    check(!r.out.includes(REMOVED_REG), 'no registration block is reported removed');
    check(countPrefix(r.out, REMOVED) === 0, 'no profile is removed through the symlinked .codex');
    const u = uninstallProject(home);
    check(u.status === 0 && JSON.stringify(snapshot(target)) === JSON.stringify(before),
      `uninstall through the symlinked .codex changes nothing either\n${u.out}`);
  });

  section('C12 a symlinked global .codex refuses before anything is touched', () => {
    const home = makeHome('symlink-codex-global');
    const target = plantFixture(CURRENT, '.codex', home, 'elsewhere/codex');
    fs.symlinkSync(target, codexOf(home));
    const before = snapshot(target);
    for (const [label, r] of [['install', installGlobal(home)], ['uninstall', uninstallGlobal(home)]]) {
      check(r.status !== 0 && /_target_unsafe: .*\.codex is a symlink/.test(r.out),
        `${label} --global refuses a symlinked ~/.codex\n${r.out}`);
      check(JSON.stringify(snapshot(target)) === JSON.stringify(before), `${label}: nothing behind it changed`);
    }
  });

  // C13 — config.toml is written BEFORE any profile or record is deleted. When the write fails
  // (a read-only config.toml), the block is kept and reported, every profile it still registers is
  // kept, and the install finishes with no raw stack. Before this, the profiles were deleted first
  // and the install then crashed with EACCES, leaving the block pointing at missing files.
  section('C13 a read-only config.toml keeps the block and every profile it registers', () => {
    const home = makeHome('readonly-config');
    plantFixture(CURRENT, '.codex', home);
    const cfg = configOf(home);
    const cfgBefore = readText(cfg);
    const profilesBefore = tomls(nsOf(home));
    fs.chmodSync(cfg, 0o444);
    try {
      const r = installGlobal(home);
      check(r.status === 0, `a read-only config.toml does not fail the install\n${r.out}`);
      check(!/EACCES|\n\s+at /.test(r.out), 'no raw error or stack is printed');
      check(readText(cfg) === cfgBefore, 'the read-only config.toml is unchanged');
      check(hasLine(r.out, PRESERVED_REG('not_writable') + cfg), 'the kept block is reported as not_writable');
      check(profilesBefore.length === 7 && JSON.stringify(tomls(nsOf(home))) === JSON.stringify(profilesBefore),
        'every profile the kept block registers is kept');
      check(countPrefix(r.out, REMOVED) === 0, 'no profile is reported removed');
      check(/^status: ok$/m.test(r.out), 'the install still completes');
    } finally {
      fs.chmodSync(cfg, 0o644);
    }
    const again = installGlobal(home);
    check(again.status === 0 && readText(cfg).indexOf(BEGIN) === -1 && tomls(nsOf(home)).length === 0,
      `once writable, the next install retires the block and the profiles\n${again.out}`);
  });

  // C12 (H6) — pre-rename codex-workflow leftovers are reported, never touched.
  section('C12 pre-rename codex-workflow leftovers are only reported', () => {
    const home = makeHome('pre-rename');
    const legacy = path.join(home, '.codex', 'agents', 'codex-workflow');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'planner.toml'), 'name = "planner"\n');
    fs.writeFileSync(configOf(home), '# BEGIN codex-workflow agents\n[agents.planner]\nconfig_file = "./agents/codex-workflow/planner.toml"\n# END codex-workflow agents\n');
    const cfg = readText(configOf(home));
    const r = installGlobal(home);
    check(r.status === 0, `install exits 0\n${r.out}`);
    check(fs.existsSync(path.join(legacy, 'planner.toml')) && readText(configOf(home)) === cfg, 'nothing pre-rename is touched');
    check(hasLine(r.out, PRESERVED('no_ownership_record') + path.join(legacy, 'planner.toml')), 'the legacy profile is reported');
    check(hasLine(r.out, PRESERVED_REG('no_ownership_record') + configOf(home)), 'the legacy block is reported');
  });
} finally {
  check(JSON.stringify(listDir(REAL_CODEX_AGENTS)) === JSON.stringify(realBefore),
    'TRIPWIRE: the real ~/.codex/agents listing is unchanged');
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
