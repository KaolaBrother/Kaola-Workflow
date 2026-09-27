#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property under
// test is what the real install.sh / uninstall.sh do to a synthetic HOME that already holds what an
// earlier release installed. The annotations are per site so a later site still declares itself.
//
// #1101 — Kaola-Workflow ships no Claude Code subagent profiles. An upgrade, a reinstall and an
// uninstall must retire what earlier releases put in ${KAOLA_AGENT_DIR:-~/.claude/agents}, and only
// what the ownership record proves Kaola wrote:
//
//   removed    a file named in the agent manifest (.kaola-workflow-agent-manifest), still carrying
//              the managed marker, whose sha256 still equals the recorded digest;
//   preserved  every other file with a Kaola role name, reported with its reason
//              (modified_since_install | no_ownership_record | non_regular); a file with any other
//              name is not Kaola's and is neither touched nor reported.
//
// The manifest itself is retired once read (a preserved file is the owner's from then on). The
// directory is shared with user-authored agents and is never pruned, followed through a symlink,
// or reached through a manifest row that is not a plain file name.
//
// Starting states are frozen from real installs (scripts/fixtures/issue-1101/, see PROVENANCE.md):
// the pre-#1101 baseline 46fbe12d (v12.2.6, seven roles, five-column manifest), v11.1.1 (fourteen
// roles), v9.12.0 (two-column manifest) and v5.11.0 (contractor/workflow-planner era plus the
// retired .kaola-agent-models.json). The suite never reads git history.
//
// Meaning changes this suite carries (#1101 Host rulings):
//   H3 — uninstall.sh used to delete any listed role file that carried the marker, with no digest
//        check, so an edited Kaola profile was deleted. It now uses the install proof: an edited or
//        unrecorded file is preserved and reported (cases E, G, H).
//   H9 — a symlinked or non-directory agents carrier no longer blocks anything; the retirement is
//        skipped for it and reported, and the rest of the install proceeds (case J).
//
// SAFETY: every child runs with HOME (and cwd) inside one mkdtemp sandbox; `assertSandboxed`
// refuses anything else; KAOLA_*, *_HOME, CLAUDE_CONFIG_DIR and XDG_* are scrubbed, PATH is cut to
// node + system dirs so no runtime CLI (claude/codex/grok/agent) is invoked; and a tripwire asserts
// the developer's real ~/.claude/agents listing is unchanged.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'issue-1101');
const INSTALL_SH = path.join(ROOT, 'install.sh');
const UNINSTALL_SH = path.join(ROOT, 'uninstall.sh');
const MARKER = 'kaola-workflow-managed-agent: true';
const CURRENT_ROLES = ['code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide'];
const REMOVED = 'Removed retired Kaola-Workflow agent: ';
const PRESERVED = reason => `Preserved retired Kaola-Workflow agent (${reason}): `;

const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-1101-claude-')));
const REAL_HOME = fs.realpathSync(os.homedir());
const REAL_AGENTS = path.join(REAL_HOME, '.claude', 'agents');
const listDir = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const realAgentsBefore = listDir(REAL_AGENTS);

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('  FAIL: ' + msg);
}

function assertSandboxed(home) {
  const real = fs.realpathSync(home);
  if (!real.startsWith(SANDBOX + path.sep) || real === REAL_HOME || REAL_HOME.startsWith(real + path.sep)) {
    throw new Error(`refusing to run an installer with HOME=${real}: outside the sandbox ${SANDBOX}`);
  }
}

let homeSeq = 0;
function makeHome(label) {
  const home = path.join(SANDBOX, `${++homeSeq}-${label}`);
  fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });
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
  env.TMPDIR = path.join(SANDBOX, 'tmp');
  fs.mkdirSync(env.TMPDIR, { recursive: true });
  return Object.assign(env, extra || {});
}

function run(script, args, home, extraEnv) {
  assertSandboxed(home);
  // spawn-class: environment
  const r = spawnSync('bash', [script].concat(args), {
    cwd: path.join(home, 'cwd'), env: childEnv(home, extraEnv), encoding: 'utf8',
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const install = (home, forge, extraEnv) =>
  run(INSTALL_SH, ['--yes', `--forge=${forge || 'github'}`, '--no-settings-merge'], home, extraEnv);
const uninstall = (home, extraEnv) => run(UNINSTALL_SH, [], home, extraEnv);

// Copy one frozen era's files under `sub` (a home-relative prefix) into `destRoot`, rewriting the
// @@HOME@@ placeholder to the sandbox home the fixture now lives in. The fixture tree stores every
// leading-dot name as `dot-<name>` (the repo .gitignore excludes `.claude/`, `.codex/`, … anywhere).
const toFixtureRel = rel => rel.split('/').map(s => (s.startsWith('.') ? 'dot-' + s.slice(1) : s)).join('/');
const fromFixtureName = name => (name.startsWith('dot-') ? '.' + name.slice(4) : name);
function plantFixture(era, sub, home, destRoot) {
  const src = path.join(FIXTURES, era, 'home', toFixtureRel(sub));
  const dest = path.join(destRoot || home, sub);
  const walk = (srcRel, destRel) => {
    for (const e of fs.readdirSync(path.join(src, srcRel), { withFileTypes: true })) {
      const s = path.join(srcRel, e.name);
      const d = path.join(destRel, fromFixtureName(e.name));
      if (e.isDirectory()) { walk(s, d); continue; }
      const text = fs.readFileSync(path.join(src, s), 'utf8').split('@@HOME@@').join(home);
      fs.mkdirSync(path.dirname(path.join(dest, d)), { recursive: true });
      fs.writeFileSync(path.join(dest, d), text);
    }
  };
  walk('', '');
  return dest;
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const agentFiles = dir => listDir(dir).filter(n => n.endsWith('.md'));
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

function section(name, fn) {
  const before = failed;
  try { fn(); } catch (err) { failed++; console.error(`  FAIL: ${name} threw: ${err && err.stack || err}`); }
  console.log(`${failed === before ? 'ok  ' : 'FAIL'} ${name}`);
}

const CURRENT = 'v12.2.6-46fbe12d';
const agentsOf = home => path.join(home, '.claude', 'agents');
const carrierOf = home => path.join(home, '.claude', 'rules', 'kaola-workflow-global.md');
const homeless = (file, home) => fs.readFileSync(file, 'utf8').split(home).join('@@HOME@@');
let freshCarrier = null; // the carrier a fresh install of this tree renders (set by C1 github)

try {
  // C1 — a fresh install writes no subagent profile, no ownership record and no model binding.
  for (const forge of ['github', 'gitlab', 'gitea']) {
    section(`C1 fresh install (${forge}) ships no Claude subagent profile`, () => {
      const home = makeHome(`fresh-${forge}`);
      const r = install(home, forge);
      check(r.status === 0, `install.sh --forge=${forge} exits 0, got ${r.status}\n${r.out}`);
      check(agentFiles(agentsOf(home)).length === 0,
        `no agent profile under ~/.claude/agents, found ${agentFiles(agentsOf(home)).join(', ')}`);
      check(!fs.existsSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest')), 'no agent manifest written');
      check(!fs.existsSync(path.join(agentsOf(home), '.kaola-agent-models.json')), 'no agent model binding written');
      check(fs.existsSync(path.join(home, '.claude', 'commands', 'workflow-next.md')), 'workflow commands still installed');
      check(fs.existsSync(carrierOf(home)), 'global contract carrier still installed');
      if (forge === 'github' && fs.existsSync(carrierOf(home))) freshCarrier = homeless(carrierOf(home), home);
      check(!/Installed agent|Updated managed agent|Verified managed Kaola-Workflow agents/.test(r.out),
        'the installer reports no agent install');
    });
  }

  // C2 — upgrade from the current release: every proven profile and the record go; the global
  // contract carrier the same release installed converges on this tree's render through its own
  // receipt (no owner conflict).
  section('C2 upgrade from 46fbe12d retires all seven proven profiles and refreshes the carrier', () => {
    const home = makeHome('upgrade-current');
    plantFixture(CURRENT, '.claude', home);
    plantFixture(CURRENT, '.config', home);
    fs.writeFileSync(path.join(agentsOf(home), 'my-own-helper.md'), '---\nname: my-own-helper\n---\nmine\n');
    const r = install(home, 'github');
    check(r.status === 0, `upgrade install exits 0, got ${r.status}\n${r.out}`);
    for (const role of CURRENT_ROLES) {
      const file = path.join(agentsOf(home), role + '.md');
      check(!fs.existsSync(file), `${role}.md removed`);
      check(hasLine(r.out, REMOVED + file), `removal of ${role}.md reported`);
    }
    check(!fs.existsSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest')), 'agent manifest retired');
    check(fs.readFileSync(path.join(agentsOf(home), 'my-own-helper.md'), 'utf8') === '---\nname: my-own-helper\n---\nmine\n',
      'a user agent with an unrelated name is untouched');
    check(!lines(r.out).some(l => l.includes('my-own-helper')), 'an unrelated user agent is not reported');
    check(freshCarrier !== null && fs.existsSync(carrierOf(home)) && homeless(carrierOf(home), home) === freshCarrier,
      'the carrier the old release installed is now exactly what a fresh install of this tree renders');
    check(!/OWNER_CONFLICT/.test(r.out), 'the receipt-owned carrier refresh is not an owner conflict');
  });

  // C3 — upgrade from older releases: a five-column (v11.1.1) and a two-column (v9.12.0, v5.11.0)
  // manifest both prove ownership; v5.11.0's retired model-binding file is disposed of too.
  for (const era of ['v11.1.1', 'v9.12.0', 'v5.11.0']) {
    section(`C3 upgrade from ${era} retires every proven profile`, () => {
      const home = makeHome(`upgrade-${era}`);
      plantFixture(era, '.claude', home);
      const planted = agentFiles(agentsOf(home));
      check(planted.length >= 3, `fixture ${era} plants its profiles`);
      const r = install(home, 'github');
      check(r.status === 0, `upgrade from ${era} exits 0, got ${r.status}\n${r.out}`);
      for (const name of planted) {
        check(!fs.existsSync(path.join(agentsOf(home), name)), `${era}: ${name} removed`);
        check(hasLine(r.out, REMOVED + path.join(agentsOf(home), name)), `${era}: removal of ${name} reported`);
      }
      check(!fs.existsSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest')), `${era}: manifest retired`);
      check(!fs.existsSync(path.join(agentsOf(home), '.kaola-agent-models.json')), `${era}: no model binding left`);
    });
  }

  // C4 — reinstall is idempotent: the second run removes nothing, reports nothing and changes nothing.
  section('C4 reinstall after an upgrade is a no-op for agents', () => {
    const home = makeHome('reinstall');
    plantFixture(CURRENT, '.claude', home);
    plantFixture(CURRENT, '.config', home);
    fs.writeFileSync(path.join(agentsOf(home), 'implementer.md'),
      fs.readFileSync(path.join(agentsOf(home), 'implementer.md'), 'utf8') + '\nlocal edit\n');
    const first = install(home, 'github');
    check(first.status === 0, `first install exits 0\n${first.out}`);
    const agentsBefore = snapshot(agentsOf(home));
    const rulesBefore = snapshot(path.join(home, '.claude', 'rules'));
    const second = install(home, 'github');
    check(second.status === 0, `second install exits 0\n${second.out}`);
    check(countPrefix(second.out, REMOVED) === 0, 'the second install removes nothing');
    check(countPrefix(second.out, 'Preserved retired Kaola-Workflow agent') === 1,
      'the second install still reports the one preserved role file');
    check(JSON.stringify(snapshot(agentsOf(home))) === JSON.stringify(agentsBefore), 'agents dir unchanged by the reinstall');
    check(JSON.stringify(snapshot(path.join(home, '.claude', 'rules'))) === JSON.stringify(rulesBefore),
      'carrier unchanged by the reinstall');
  });

  // C5 — uninstall from each state, then again: proven files go, everything else stays.
  for (const era of [CURRENT, 'v9.12.0']) {
    section(`C5 uninstall retires the proven ${era} profiles and is idempotent`, () => {
      const home = makeHome(`uninstall-${era}`);
      plantFixture(era, '.claude', home);
      const planted = agentFiles(agentsOf(home));
      fs.writeFileSync(path.join(agentsOf(home), 'notes.md'), 'user notes\n');
      const r = uninstall(home);
      check(r.status === 0, `uninstall exits 0, got ${r.status}\n${r.out}`);
      for (const name of planted) {
        check(!fs.existsSync(path.join(agentsOf(home), name)), `${era}: ${name} removed by uninstall`);
        check(hasLine(r.out, REMOVED + path.join(agentsOf(home), name)), `${era}: uninstall reports ${name}`);
      }
      check(!fs.existsSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest')), `${era}: manifest retired by uninstall`);
      check(fs.readFileSync(path.join(agentsOf(home), 'notes.md'), 'utf8') === 'user notes\n', 'user file survives uninstall');
      const again = uninstall(home);
      check(again.status === 0, `second uninstall exits 0\n${again.out}`);
      check(countPrefix(again.out, REMOVED) === 0, 'a second uninstall removes no agent');
    });
  }

  // C6 — a user agent with a Kaola role name and no ownership proof is never deleted.
  section('C6 a user-authored same-name agent survives install and uninstall', () => {
    const home = makeHome('same-name');
    plantFixture(CURRENT, '.claude', home);
    const mine = '---\nname: implementer\ndescription: my own implementer\n---\nmine\n';
    const file = path.join(agentsOf(home), 'implementer.md');
    fs.writeFileSync(file, mine);
    const r = install(home, 'github');
    check(r.status === 0, `install exits 0\n${r.out}`);
    check(fs.readFileSync(file, 'utf8') === mine, 'user implementer.md byte-identical after install');
    check(hasLine(r.out, PRESERVED('modified_since_install') + file),
      'the recorded-but-replaced implementer.md is reported as modified');
    const u = uninstall(home);
    check(u.status === 0, `uninstall exits 0\n${u.out}`);
    check(fs.readFileSync(file, 'utf8') === mine, 'user implementer.md byte-identical after uninstall');
    check(hasLine(u.out, PRESERVED('no_ownership_record') + file),
      'after the record is retired the same file is reported as unrecorded');
  });

  // C7 — a Kaola profile edited after install (marker kept) is the owner's: preserved and reported.
  section('C7 an edited Kaola profile is preserved by install and by uninstall', () => {
    for (const step of ['install', 'uninstall']) {
      const home = makeHome(`modified-${step}`);
      plantFixture('v9.12.0', '.claude', home);
      const file = path.join(agentsOf(home), 'metric-optimizer.md');
      const edited = fs.readFileSync(file, 'utf8') + '\n## my addition\n';
      check(edited.includes(MARKER), 'the edited profile still carries the managed marker');
      fs.writeFileSync(file, edited);
      const r = step === 'install' ? install(home, 'github') : uninstall(home);
      check(r.status === 0, `${step} exits 0\n${r.out}`);
      check(fs.readFileSync(file, 'utf8') === edited, `${step}: edited metric-optimizer.md byte-identical`);
      check(hasLine(r.out, PRESERVED('modified_since_install') + file), `${step}: the edited profile is reported`);
      check(!fs.existsSync(path.join(agentsOf(home), 'code-reviewer.md')), `${step}: an unedited sibling is still retired`);
    }
  });

  // C9 — no ownership record: marker-bearing files are preserved; hostile manifest rows are inert.
  // C9 — without a manifest a file is removed only when its bytes are a released Claude profile
  // (the frozen catalog, as for every other runtime); anything else is kept and reported. Before
  // the Claude catalog existed (review round B2) nothing at all was provable without a manifest.
  section('C9 without a manifest only released bytes go; unsafe manifest rows never escape the dir', () => {
    const home = makeHome('no-record');
    plantFixture(CURRENT, '.claude', home);
    fs.rmSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest'));
    const edited = path.join(agentsOf(home), 'implementer.md');
    fs.appendFileSync(edited, '\nmy local note\n');
    const editedBytes = fs.readFileSync(edited, 'utf8');
    const r = install(home, 'github');
    check(r.status === 0, `install exits 0\n${r.out}`);
    for (const role of CURRENT_ROLES.filter(role => role !== 'implementer')) {
      const file = path.join(agentsOf(home), role + '.md');
      check(!fs.existsSync(file) && hasLine(r.out, REMOVED + file), `${role}.md (released bytes) removed and reported`);
    }
    check(fs.existsSync(edited) && fs.readFileSync(edited, 'utf8') === editedBytes,
      'the edited profile, not a released render, is kept byte-for-byte');
    check(hasLine(r.out, PRESERVED('no_ownership_record') + edited), 'and reported as unrecorded');

    const home2 = makeHome('hostile-manifest');
    plantFixture(CURRENT, '.claude', home2);
    const victim = path.join(home2, '.claude', 'victim.md');
    fs.writeFileSync(victim, `victim\n${MARKER}\n`);
    const manifest = path.join(agentsOf(home2), '.kaola-workflow-agent-manifest');
    fs.appendFileSync(manifest, `../victim.md\t${sha256(victim)}\n${victim}\t${sha256(victim)}\n`);
    const r2 = install(home2, 'github');
    check(r2.status === 0, `install with a hostile manifest exits 0\n${r2.out}`);
    check(fs.existsSync(victim), 'a ../ or absolute manifest row never deletes outside the agents dir');
    check(!fs.existsSync(path.join(agentsOf(home2), 'implementer.md')), 'the legitimate rows are still honoured');
    check(/not a plain file name/.test(r2.out), 'the unsafe manifest rows are reported');
  });

  // C14 (review round B2) — a released profile that no manifest row lists: docs-lookup.md from an
  // install between its retirement (2026-06-09) and the installer's retired-agent sweep
  // (299adb02, 2026-07-25) kept the managed marker and had no row. The base uninstall removed it
  // by marker; the Claude catalog now proves it, for install and for uninstall.
  section('C14 a released docs-lookup.md with no manifest row is retired by install and uninstall', () => {
    const orphan = fs.readFileSync(path.join(FIXTURES, 'orphan-80244600', 'docs-lookup.md'), 'utf8');
    for (const [label, runIt] of [['install', home => install(home, 'github')], ['uninstall', home => uninstall(home)]]) {
      const home = makeHome('orphan-' + label);
      fs.mkdirSync(agentsOf(home), { recursive: true });
      fs.writeFileSync(path.join(agentsOf(home), 'docs-lookup.md'), orphan);
      fs.writeFileSync(path.join(agentsOf(home), '.kaola-workflow-agent-manifest'), '');
      const edited = path.join(agentsOf(home), 'knowledge-lookup.md');
      fs.writeFileSync(edited, orphan.replace('docs-lookup', 'knowledge-lookup') + '\nmine\n');
      const r = runIt(home);
      check(r.status === 0, `${label} exits 0\n${r.out}`);
      const file = path.join(agentsOf(home), 'docs-lookup.md');
      check(!fs.existsSync(file), `${label}: the released docs-lookup.md is removed`);
      check(hasLine(r.out, REMOVED + file), `${label}: its removal is reported`);
      check(fs.existsSync(edited) && hasLine(r.out, PRESERVED('no_ownership_record') + edited),
        `${label}: a marker-bearing file that is not a released render is kept and reported`);
    }
  });

  // C11 — custom agent dir (KAOLA_AGENT_DIR): only the configured dir is migrated.
  section('C11 KAOLA_AGENT_DIR is the dir that gets migrated', () => {
    const home = makeHome('custom-dir');
    const custom = path.join(home, 'custom-agents');
    plantFixture(CURRENT, '.claude/agents', home, path.join(home, 'stage'));
    fs.renameSync(path.join(home, 'stage', '.claude', 'agents'), custom);
    plantFixture(CURRENT, '.claude/agents', home);
    const defaultBefore = snapshot(agentsOf(home));
    const r = install(home, 'github', { KAOLA_AGENT_DIR: custom });
    check(r.status === 0, `install with KAOLA_AGENT_DIR exits 0\n${r.out}`);
    check(agentFiles(custom).length === 0, 'every proven profile in the custom dir is retired');
    check(JSON.stringify(snapshot(agentsOf(home))) === JSON.stringify(defaultBefore),
      'the default ~/.claude/agents is not the migration target when KAOLA_AGENT_DIR is set');
    const u = uninstall(home, { KAOLA_AGENT_DIR: custom });
    check(u.status === 0, `uninstall with KAOLA_AGENT_DIR exits 0\n${u.out}`);
  });

  // C12 — symlinked carrier and symlinked entries are never followed (H9: report, do not refuse).
  section('C12 symlinked agents dir and entries are reported, never followed', () => {
    const home = makeHome('symlink');
    const elsewhere = path.join(home, 'elsewhere');
    plantFixture(CURRENT, '.claude/agents', home, path.join(home, 'stage'));
    fs.renameSync(path.join(home, 'stage', '.claude', 'agents'), elsewhere);
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.symlinkSync(elsewhere, agentsOf(home));
    const before = snapshot(elsewhere);
    const r = install(home, 'github');
    check(r.status === 0, `install with a symlinked agents dir exits 0 (H9)\n${r.out}`);
    check(JSON.stringify(snapshot(elsewhere)) === JSON.stringify(before), 'nothing behind the symlinked dir changed');
    check(hasLine(r.out, PRESERVED('non_regular') + agentsOf(home)), 'the symlinked carrier is reported');

    const home2 = makeHome('symlink-entry');
    plantFixture(CURRENT, '.claude', home2);
    const target = path.join(home2, 'real-implementer.md');
    fs.renameSync(path.join(agentsOf(home2), 'implementer.md'), target);
    fs.symlinkSync(target, path.join(agentsOf(home2), 'implementer.md'));
    const r2 = install(home2, 'github');
    check(r2.status === 0, `install with a symlinked entry exits 0\n${r2.out}`);
    check(fs.existsSync(target) && fs.lstatSync(path.join(agentsOf(home2), 'implementer.md')).isSymbolicLink(),
      'the symlinked entry and its target are untouched');
    check(hasLine(r2.out, PRESERVED('non_regular') + path.join(agentsOf(home2), 'implementer.md')),
      'the symlinked entry is reported');
  });

  // C10 — no resurrection: a stale agents/ tree in the source checkout is never deployed.
  section('C10 a stale source agents/ tree is not installed', () => {
    const src = path.join(SANDBOX, 'stale-src');
    for (const rel of ['install.sh', 'package.json', 'scripts', 'commands', 'hooks', 'templates', 'plugins']) {
      fs.cpSync(path.join(ROOT, rel), path.join(src, rel), { recursive: true });
    }
    plantFixture(CURRENT, '.claude/agents', src, path.join(src, 'stage'));
    fs.renameSync(path.join(src, 'stage', '.claude', 'agents'), path.join(src, 'agents'));
    const home = makeHome('stale-src');
    const r = run(path.join(src, 'install.sh'), ['--yes', '--forge=github', '--no-settings-merge'], home);
    check(r.status === 0, `install from a tree with a stale agents/ exits 0\n${r.out}`);
    check(agentFiles(agentsOf(home)).length === 0, 'no profile deployed from the stale tree');
  });

  // C12 (forges) — the Claude agents dir is shared by all three editions: every edition migrates it.
  for (const forge of ['gitlab', 'gitea']) {
    section(`C12 upgrade through the ${forge} edition migrates the shared agents dir`, () => {
      const home = makeHome(`forge-${forge}`);
      plantFixture('v11.1.1', '.claude', home);
      const r = install(home, forge);
      check(r.status === 0, `install --forge=${forge} exits 0\n${r.out}`);
      check(agentFiles(agentsOf(home)).length === 0, `${forge}: every proven profile retired`);
    });
  }
} finally {
  const realAgentsAfter = listDir(REAL_AGENTS);
  check(JSON.stringify(realAgentsAfter) === JSON.stringify(realAgentsBefore),
    'TRIPWIRE: the real ~/.claude/agents listing is unchanged');
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
