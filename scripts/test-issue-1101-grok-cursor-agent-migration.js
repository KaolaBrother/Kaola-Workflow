#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property under
// test is what the real additive-runtime installers do to a synthetic HOME and project that already
// hold the subagent profiles an earlier release installed.
//
// #1101 — no runtime installs Kaola subagent profiles. Grok and Cursor installed them until
// 46fbe12d; ZCode, Devin, Kimi and OpenCode until v11.1.1 (#1062 retired them there, but by name,
// by the managed marker alone, or by one release's hashes). Every installer now retires them with
// the same proof (scripts/kaola-workflow-retired-agents.js):
//   removed    a Kaola-named file whose ownership record (Cursor receipt, Kimi/OpenCode manifest)
//              lists the digest it still has, or whose bytes are a render some release shipped for
//              that runtime (frozen catalog — Grok, ZCode and Devin never wrote a record);
//   preserved  every other Kaola-named file, reported with its reason; anything else untouched.
// OpenCode's opencode.json `agent.<role>` model bindings carry no ownership evidence at all, so
// they are only reported (#1101 H5).
//
// Meaning changes this suite carries:
//   Grok     — install/uninstall deleted RETIRED_AGENTS and every source-tree name by basename
//              (no proof): a user's edited planner.md is now preserved and reported.
//   ZCode    — the managed marker alone was proof: an edited, marker-bearing profile is now kept.
//   Devin    — ANY marker-bearing *.md was deleted, whatever its name: now only released renders;
//              --check fails only while a removable (released) profile is still installed.
//   Kimi     — role Skills were removed only when they matched the v9.17.2 bytes; every released
//              role-Skill render (v6.24.0–v9.17.2) now proves ownership.
//   OpenCode — the first releases (no manifest) and the nested ~/.config/opencode/.opencode/agent
//              profiles are now retired on byte proof instead of never.
//   Cursor   — a modified retired agent the old receipt recorded no longer makes the authority stale
//              (a project install first no longer fails stale_files); it is kept and reported.
//
// SAFETY: every installer runs from a sandbox COPY of the repository (its own git root, so the
// generated edition trees land in the sandbox, never in a real checkout) with HOME and every
// runtime home inside one mkdtemp sandbox; `assertSandboxed` refuses anything else; KAOLA_*,
// *_HOME, XDG_* and *_CONFIG_DIR are scrubbed and PATH is cut to node + system dirs.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'issue-1101');
const CURRENT = 'v12.2.6-46fbe12d';
const REMOVED = 'Removed retired Kaola-Workflow agent: ';
const PRESERVED = reason => `Preserved retired Kaola-Workflow agent (${reason}): `;

const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-1101-editions-')));
const REAL_HOME = fs.realpathSync(os.homedir());
const TRIPWIRES = ['.grok/agents', '.cursor/agents', '.zcode/agents', '.config/devin/agents',
  '.kimi-code/agents', '.config/opencode/agents'].map(rel => path.join(REAL_HOME, rel));
const listDir = dir => { try { return fs.readdirSync(dir).sort(); } catch (_) { return []; } };
const tripwireBefore = TRIPWIRES.map(listDir);

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
    throw new Error(`refusing to run an installer against ${real}: outside the sandbox ${SANDBOX}`);
  }
}

// A sandbox copy of the repository with its own git root: the edition installers render their
// generated trees under the checkout's main root, which is then this copy.
const REPO = path.join(SANDBOX, 'repo');
function makeRepoCopy() {
  for (const rel of ['package.json', 'scripts', 'commands', 'hooks', 'templates', 'plugins', 'opencode.json']) {
    if (fs.existsSync(path.join(ROOT, rel))) fs.cpSync(path.join(ROOT, rel), path.join(REPO, rel), { recursive: true });
  }
  for (const name of fs.readdirSync(ROOT)) {
    if (/^install.*\.sh$/.test(name) || name === 'uninstall.sh') fs.copyFileSync(path.join(ROOT, name), path.join(REPO, name));
  }
  // spawn-class: environment
  const g = spawnSync('git', ['init', '-q'], { cwd: REPO, encoding: 'utf8' });
  if (g.status !== 0) throw new Error('git init failed: ' + g.stderr);
}

let seq = 0;
function makeHome(label) {
  const home = path.join(SANDBOX, `${++seq}-${label}`);
  fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });
  fs.mkdirSync(path.join(home, 'proj'), { recursive: true });
  return home;
}

// The bound generated-tree root (KAOLA_EDITION_TREE_ROOT/FOR, see runtime-edition-forge.js) is the
// one KAOLA_ setting that must survive the scrub: without it the installers under test refresh the
// MAIN checkout's shared edition trees when this suite runs from a worktree.
const EDITION_TREE_ENV = Object.fromEntries(['KAOLA_EDITION_TREE_ROOT', 'KAOLA_EDITION_TREE_FOR']
  .filter(k => process.env[k]).map(k => [k, process.env[k]]));

const NODE_DIR = path.dirname(process.execPath);
function childEnv(home, extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('KAOLA_') || k.endsWith('_HOME') || k.startsWith('XDG_') || k.endsWith('_CONFIG_DIR')) continue;
    env[k] = v;
  }
  env.HOME = home;
  env.PATH = [NODE_DIR, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter);
  env.TMPDIR = path.join(SANDBOX, 'tmp');
  fs.mkdirSync(env.TMPDIR, { recursive: true });
  for (const v of Object.values(extra || {})) if (path.isAbsolute(v)) fs.mkdirSync(v, { recursive: true });
  return Object.assign(env, EDITION_TREE_ENV, extra || {});
}

function run(script, args, home, extraEnv) {
  assertSandboxed(home);
  for (const v of Object.values(extraEnv || {})) if (path.isAbsolute(v)) assertSandboxed(path.dirname(v));
  // spawn-class: environment
  const r = spawnSync('bash', [path.join(REPO, script)].concat(args), {
    cwd: path.join(home, 'cwd'), env: childEnv(home, extraEnv), encoding: 'utf8',
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const toFixtureRel = rel => rel.split('/').map(s => (s.startsWith('.') ? 'dot-' + s.slice(1) : s)).join('/');
const fromFixtureName = name => (name.startsWith('dot-') ? '.' + name.slice(4) : name);
// Plant `sub` of a frozen era under `dest` (home-relative when relative), rewriting @@HOME@@.
function plant(era, sub, home, dest) {
  const src = path.join(FIXTURES, era, 'home', toFixtureRel(sub));
  const to = path.isAbsolute(dest || '') ? dest : path.join(home, dest || sub);
  const walk = (s, d) => {
    for (const e of fs.readdirSync(path.join(src, s), { withFileTypes: true })) {
      const ss = path.join(s, e.name);
      const dd = path.join(d, fromFixtureName(e.name));
      if (e.isDirectory()) { walk(ss, dd); continue; }
      fs.mkdirSync(path.dirname(path.join(to, dd)), { recursive: true });
      fs.writeFileSync(path.join(to, dd), fs.readFileSync(path.join(src, ss), 'utf8').split('@@HOME@@').join(home));
    }
  };
  walk('', '');
  return to;
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mdFiles = dir => listDir(dir).filter(n => n.endsWith('.md'));
const readText = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const lines = out => out.split('\n');
const hasLine = (out, line) => lines(out).includes(line);
const countPrefix = (out, prefix) => lines(out).filter(l => l.startsWith(prefix)).length;
function snapshot(dir) {
  const out = {};
  const walk = rel => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const r = path.join(rel, e.name);
      if (e.isSymbolicLink()) out[r] = 'symlink';
      else if (e.isDirectory()) walk(r);
      else out[r] = sha256(path.join(dir, r));
    }
  };
  walk('');
  return out;
}

// Retire-and-report expectations for one planted agents dir.
function expectRetired(r, dir, planted, label) {
  for (const name of planted) {
    const file = path.join(dir, name);
    check(!fs.existsSync(file), `${label}: ${name} removed`);
    check(hasLine(r.out, REMOVED + file), `${label}: removal of ${name} reported`);
  }
}

// Per-runtime install surfaces. `global` is the agents dir the runtime's global scope used.
const RT = {
  grok: {
    script: 'install-grok.sh', era: CURRENT, globalSub: '.grok/agents',
    install: ['--global', '--yes'], project: p => ['--target', p, '--yes'], uninstall: ['--global', '--uninstall', '--yes'],
    projectAgents: p => path.join(p, '.grok', 'agents'), homeEnv: 'GROK_HOME', homeAgents: h => path.join(h, 'agents'),
  },
  cursor: {
    script: 'install-cursor.sh', era: CURRENT, globalSub: '.cursor/agents',
    install: ['--global', '--yes'], project: p => ['--target', p, '--yes'], uninstall: ['--global', '--uninstall', '--yes'],
    projectAgents: p => path.join(p, '.cursor', 'agents'), homeEnv: 'CURSOR_HOME', homeAgents: h => path.join(h, 'agents'),
  },
  zcode: {
    script: 'install-zcode.sh', era: 'v11.1.1', globalSub: '.zcode/agents',
    install: ['--global', '--yes'], project: p => ['--target', p, '--yes'], uninstall: ['--global', '--uninstall', '--yes'],
    projectAgents: p => path.join(p, '.zcode', 'agents'), homeEnv: 'ZCODE_HOME', homeAgents: h => path.join(h, 'agents'),
  },
  devin: {
    script: 'install-devin.sh', era: 'v11.1.1', globalSub: '.config/devin/agents',
    install: ['--global', '--yes'], project: p => ['--project=' + p, '--yes'], uninstall: null,
    projectAgents: p => path.join(p, '.devin', 'agents'), homeEnv: 'DEVIN_CONFIG_DIR', homeAgents: h => path.join(h, 'agents'),
  },
  kimi: {
    script: 'install-kimi.sh', era: 'v11.1.1', globalSub: '.kimi-code/agents',
    install: ['--global', '--yes'], project: p => ['--target', p, '--yes'], uninstall: ['--global', '--uninstall', '--yes'],
    projectAgents: p => path.join(p, '.kimi-code', 'agents'), homeEnv: 'KIMI_CODE_HOME', homeAgents: h => path.join(h, 'agents'),
  },
  opencode: {
    script: 'install-opencode.sh', era: 'v11.1.1', globalSub: '.config/opencode/agents',
    install: ['--global', '--yes'], project: p => ['--target', p, '--yes'], uninstall: ['--global', '--uninstall', '--yes'],
    projectAgents: p => path.join(p, '.opencode', 'agents'), homeEnv: 'OPENCODE_CONFIG_DIR', homeAgents: h => path.join(h, 'agents'),
  },
};

try {
  makeRepoCopy();

  for (const [name, rt] of Object.entries(RT)) {
    // C1 — a fresh install deploys no profile.
    section(`C1 ${name}: a fresh global install deploys no subagent profile`, () => {
      const home = makeHome(`${name}-fresh`);
      const r = run(rt.script, rt.install, home);
      check(r.status === 0, `${name} install exits 0, got ${r.status}\n${r.out}`);
      check(mdFiles(path.join(home, rt.globalSub)).length === 0, `${name}: no profile under ${rt.globalSub}`);
    });

    // C2/C6/C7 — upgrade: released profiles go; an edited one and a user file stay.
    section(`C2/C6/C7 ${name}: upgrade retires released profiles, keeps edited and user files`, () => {
      const home = makeHome(`${name}-upgrade`);
      const dir = plant(rt.era, rt.globalSub, home);
      if (name === 'grok' || name === 'cursor') { plant(CURRENT, '.config', home); }
      if (name === 'cursor') { plant(CURRENT, '.cursor/kaola-workflow', home); plant(CURRENT, '.cursor/rules', home); }
      if (name === 'grok') plant(CURRENT, '.grok/rules', home);
      const planted = mdFiles(dir);
      const editedName = planted[0];
      const edited = readText(path.join(dir, editedName)) + '\n<!-- my edit -->\n';
      fs.writeFileSync(path.join(dir, editedName), edited);
      fs.writeFileSync(path.join(dir, 'notes.md'), 'user notes\n');
      const r = run(rt.script, rt.install, home);
      check(r.status === 0, `${name} upgrade exits 0, got ${r.status}\n${r.out}`);
      expectRetired(r, dir, planted.slice(1), name);
      check(readText(path.join(dir, editedName)) === edited, `${name}: the edited ${editedName} is byte-identical`);
      check(countPrefix(r.out, 'Preserved retired Kaola-Workflow agent (') >= 1
        && lines(r.out).some(l => l.startsWith('Preserved retired Kaola-Workflow agent (') && l.endsWith(path.join(dir, editedName))),
        `${name}: the edited profile is reported`);
      check(readText(path.join(dir, 'notes.md')) === 'user notes\n', `${name}: a user file is untouched`);
      check(!lines(r.out).some(l => l.includes('notes.md')), `${name}: a user file is not reported`);

      // C4 — reinstall removes nothing more.
      const again = run(rt.script, rt.install, home);
      check(again.status === 0, `${name} reinstall exits 0\n${again.out}`);
      check(countPrefix(again.out, REMOVED) === 0, `${name}: a reinstall removes nothing`);
      check(readText(path.join(dir, editedName)) === edited, `${name}: the reinstall keeps the edited profile`);
    });

    // C5 — uninstall retires released profiles and keeps the rest (Devin ships no uninstall).
    if (rt.uninstall) {
      section(`C5 ${name}: uninstall retires released profiles, keeps a same-name user file`, () => {
        const home = makeHome(`${name}-uninstall`);
        const dir = plant(rt.era, rt.globalSub, home);
        const planted = mdFiles(dir);
        const mine = '---\nname: mine\n---\nmy own\n';
        fs.writeFileSync(path.join(dir, planted[0]), mine);
        const r = run(rt.script, rt.uninstall, home);
        check(r.status === 0, `${name} uninstall exits 0, got ${r.status}\n${r.out}`);
        expectRetired(r, dir, planted.slice(1), name + ' uninstall');
        check(readText(path.join(dir, planted[0])) === mine, `${name}: a same-name user file survives uninstall`);
        const again = run(rt.script, rt.uninstall, home);
        check(again.status === 0 && countPrefix(again.out, REMOVED) === 0, `${name}: a second uninstall removes nothing`);
      });
    }

    // C11 — the runtime's home env var and the project scope are both migrated.
    section(`C11 ${name}: ${rt.homeEnv} and the project scope are migrated`, () => {
      const home = makeHome(`${name}-scopes`);
      const custom = path.join(home, 'custom-home');
      const cdir = plant(rt.era, rt.globalSub, home, rt.homeAgents(custom));
      const plantedC = mdFiles(cdir);
      const r = run(rt.script, rt.install, home, { [rt.homeEnv]: custom });
      check(r.status === 0, `${name} install with ${rt.homeEnv} exits 0\n${r.out}`);
      expectRetired(r, cdir, plantedC, `${name} ${rt.homeEnv}`);
      const proj = path.join(home, 'proj');
      const pdir = plant(rt.era, rt.globalSub, home, rt.projectAgents(proj));
      const plantedP = mdFiles(pdir);
      const p = run(rt.script, rt.project(proj), home);
      check(p.status === 0, `${name} project install exits 0\n${p.out}`);
      expectRetired(p, pdir, plantedP, `${name} project`);
    });

    // C12 — a symlinked agents dir is reported and never followed; it does not block the install.
    section(`C12 ${name}: a symlinked agents dir is reported, not followed`, () => {
      const home = makeHome(`${name}-symlink`);
      const elsewhere = plant(rt.era, rt.globalSub, home, path.join(home, 'elsewhere'));
      const link = path.join(home, rt.globalSub);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(elsewhere, link);
      const before = snapshot(elsewhere);
      const r = run(rt.script, rt.install, home);
      check(r.status === 0, `${name} install with a symlinked agents dir exits 0\n${r.out}`);
      check(JSON.stringify(snapshot(elsewhere)) === JSON.stringify(before), `${name}: nothing behind the symlink changed`);
      check(hasLine(r.out, PRESERVED('non_regular') + link), `${name}: the symlinked carrier is reported`);
    });
  }

  // C3 — older eras: Grok v9.12.0 renders, Cursor v10.0.1 (no receipt), OpenCode v6.8.0 (no
  // manifest; project agent/ and the nested global .opencode/agent) and v9.4.0 (agent/ manifest),
  // Kimi v9.17.1 role Skills (not the v9.17.2 bytes).
  section('C3 grok v9.12.0 and cursor v10.0.1 profiles are proven by the catalog alone', () => {
    const home = makeHome('old-grok-cursor');
    const g = plant('v9.12.0', '.grok/agents', home);
    const c = plant('v10.0.1', '.cursor/agents', home);
    const pg = mdFiles(g); const pc = mdFiles(c);
    const rg = run(RT.grok.script, RT.grok.install, home);
    const rc = run(RT.cursor.script, RT.cursor.install, home);
    check(rg.status === 0 && rc.status === 0, `both installs exit 0\n${rg.out}\n${rc.out}`);
    expectRetired(rg, g, pg, 'grok v9.12.0');
    expectRetired(rc, c, pc, 'cursor v10.0.1');
  });
  section('C3 opencode v6.8.0 (no manifest, nested global) and v9.4.0 (agent/ manifest) are retired', () => {
    const home = makeHome('old-opencode');
    const proj = path.join(home, 'proj');
    const nested = plant('v6.8.0', '.config/opencode/.opencode/agent', home);
    const p6 = plant('v6.8.0', 'proj/.opencode/agent', home);
    const pn = mdFiles(nested); const pp = mdFiles(p6);
    const rg = run(RT.opencode.script, RT.opencode.install, home);
    check(rg.status === 0, `opencode global install exits 0\n${rg.out}`);
    expectRetired(rg, nested, pn, 'opencode nested global v6.8.0');
    const rp = run(RT.opencode.script, RT.opencode.project(proj), home);
    check(rp.status === 0, `opencode project install exits 0\n${rp.out}`);
    expectRetired(rp, p6, pp, 'opencode project v6.8.0');

    const home2 = makeHome('old-opencode-9');
    const p9 = plant('v9.4.0', 'proj/.opencode/agent', home2);
    const p9n = mdFiles(p9);
    const r9 = run(RT.opencode.script, RT.opencode.project(path.join(home2, 'proj')), home2);
    check(r9.status === 0, `opencode v9.4.0 upgrade exits 0\n${r9.out}`);
    expectRetired(r9, p9, p9n, 'opencode v9.4.0');
  });
  section('C3 kimi role Skills from any release (not only v9.17.2) are retired; an edited one is kept', () => {
    const home = makeHome('old-kimi-skills');
    const skills = plant('v9.17.1', '.kimi-code/skills', home);
    const names = listDir(skills).filter(n => n.startsWith('kaola-role-'));
    const edited = path.join(skills, names[0], 'SKILL.md');
    fs.appendFileSync(edited, '\nmine\n');
    const r = run(RT.kimi.script, RT.kimi.install, home);
    check(r.status === 0, `kimi install exits 0\n${r.out}`);
    for (const n of names.slice(1)) {
      check(!fs.existsSync(path.join(skills, n)), `kimi: ${n} removed`);
      check(hasLine(r.out, REMOVED + path.join(skills, n)), `kimi: removal of ${n} reported`);
    }
    check(fs.existsSync(edited), 'kimi: the edited role Skill is kept');
    check(hasLine(r.out, PRESERVED('no_ownership_record') + path.join(skills, names[0])), 'kimi: the edited role Skill is reported');
  });

  // C8 — OpenCode opencode.json agent model bindings have no ownership evidence: reported, untouched.
  section('C8 opencode: live agent.<role> model bindings in opencode.json are reported, never edited', () => {
    const home = makeHome('opencode-json');
    const cfg = path.join(home, '.config', 'opencode', 'opencode.json');
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const body = '{\n  "$schema": "https://opencode.ai/config.json",\n  // mine\n  "model": "x/y",\n'
      + '  "agent": {\n    "planner": { "model": "x/big" },\n    "my-agent": { "model": "x/z" }\n  }\n}\n';
    fs.writeFileSync(cfg, body);
    const r = run(RT.opencode.script, RT.opencode.install, home);
    check(r.status === 0, `opencode install exits 0\n${r.out}`);
    check(readText(cfg) === body, 'opencode.json is byte-identical');
    check(hasLine(r.out, `Preserved retired Kaola-Workflow agent binding (no_ownership_record): ${cfg} agent.planner`),
      'the Kaola-role binding is reported');
    check(!lines(r.out).some(l => l.includes('agent.my-agent')), 'a non-Kaola agent binding is not reported');
  });

  // Devin --check: a kept edited profile is not a failure; a released one still installed is.
  section('C9 devin --check fails only while a released profile is still installed', () => {
    const home = makeHome('devin-check');
    const dir = plant('v11.1.1', '.config/devin/agents', home);
    const planted = mdFiles(dir);
    fs.appendFileSync(path.join(dir, planted[0]), '\nedited\n');
    const i = run(RT.devin.script, RT.devin.install, home);
    check(i.status === 0, `devin install exits 0\n${i.out}`);
    const ok = run(RT.devin.script, ['--global', '--check'], home);
    check(ok.status === 0, `devin --check passes with only a kept edited profile\n${ok.out}`);
    plant('v11.1.1', '.config/devin/agents', home, path.join(home, 'again'));
    fs.copyFileSync(path.join(home, 'again', planted[1]), path.join(dir, planted[1]));
    const bad = run(RT.devin.script, ['--global', '--check'], home);
    check(bad.status !== 0, 'devin --check fails while a released profile is installed');
  });

  // C10 — a stale generated tree carrying agents/ is never deployed.
  section('C10 grok: a stale .grok/agents in the generated tree is not deployed', () => {
    plant(CURRENT, '.grok/agents', REPO, path.join(REPO, '.grok', 'agents'));
    const home = makeHome('grok-stale');
    const r = run(RT.grok.script, RT.grok.install, home);
    check(r.status === 0, `grok install from a stale tree exits 0\n${r.out}`);
    check(mdFiles(path.join(home, '.grok', 'agents')).length === 0, 'no profile deployed from the stale tree');
  });

  // Cursor upgrade order: the global receipt still records retired agents (one of them edited by
  // the owner); a project install run first must not fail stale_files — it materializes and retires
  // the project copies — and the next global install retires the rest and reports the edited one.
  // The old receipt is built on a complete current authority (fresh install) plus the 46fbe12d
  // agents and their receipt rows, so the only difference from a real upgrade is what is tested.
  section('C2 cursor: project install first after an upgrade is not blocked by a kept retired agent', () => {
    const home = makeHome('cursor-order');
    const g0 = run(RT.cursor.script, RT.cursor.install, home);
    check(g0.status === 0, `fresh global install exits 0\n${g0.out}`);
    const gdir = plant(CURRENT, '.cursor/agents', home);
    const receiptPath = path.join(home, '.cursor', 'kaola-workflow', 'cursor-authority.json');
    const receipt = JSON.parse(readText(receiptPath));
    for (const n of mdFiles(gdir)) receipt.files['agents/' + n] = { sha256: sha256(path.join(gdir, n)), mode: 0o644 };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    fs.appendFileSync(path.join(gdir, 'implementer.md'), '\nmine\n');
    plant(CURRENT, 'cproj/.cursor', home, path.join(home, 'proj', '.cursor'));
    const projReceipt = path.join(home, 'proj', '.cursor', 'kaola-workflow-materialization.json');
    fs.writeFileSync(projReceipt, readText(projReceipt).split(path.join(home, 'cproj')).join(path.join(home, 'proj')));
    const pdir = path.join(home, 'proj', '.cursor', 'agents');
    const planted = mdFiles(pdir);
    const r = run(RT.cursor.script, RT.cursor.project(path.join(home, 'proj')), home);
    check(r.status === 0, `a project install first exits 0 (no stale_files)\n${r.out}`);
    expectRetired(r, pdir, planted, 'cursor project');
    const g = run(RT.cursor.script, RT.cursor.install, home);
    check(g.status === 0, `the global install afterwards exits 0\n${g.out}`);
    expectRetired(g, gdir, mdFiles(path.join(FIXTURES, CURRENT, 'home', 'dot-cursor', 'agents')).filter(n => n !== 'implementer.md'), 'cursor global');
    check(fs.existsSync(path.join(gdir, 'implementer.md')), 'the edited global retired agent is kept');
    check(hasLine(g.out, PRESERVED('modified_since_install') + path.join(gdir, 'implementer.md')),
      'and reported as modified');
    check(!Object.keys(JSON.parse(readText(receiptPath)).files).some(rel => rel.startsWith('agents/')),
      'the new authority receipt records no agent');
  });

  // Forges: the gitea Grok project fixture migrates through --forge=gitea.
  section('C12 grok --forge=gitea project upgrade retires the gitea renders', () => {
    const home = makeHome('grok-gitea');
    const dir = plant(CURRENT, 'gproj/.grok/agents', home, path.join(home, 'proj', '.grok', 'agents'));
    const planted = mdFiles(dir);
    const r = run(RT.grok.script, ['--target', path.join(home, 'proj'), '--forge=gitea', '--yes'], home);
    check(r.status === 0, `grok gitea install exits 0\n${r.out}`);
    expectRetired(r, dir, planted, 'grok gitea');
  });
} finally {
  TRIPWIRES.forEach((dir, i) => check(JSON.stringify(listDir(dir)) === JSON.stringify(tripwireBefore[i]),
    `TRIPWIRE: the real ${dir} listing is unchanged`));
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
