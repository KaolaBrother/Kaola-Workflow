#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.


// #1101 retired every Claude subagent profile, so the agent halves of this suite moved to
// scripts/test-issue-1101-claude-agent-migration.js, which starts from real installs of earlier
// releases rather than hand-seeded ones:
//   #154 (an unmodified managed agent is rewritten to `model: inherit`)  -> no agent is installed
//        or rewritten any more; the meaning that survives — a user-modified agent is never
//        touched — is its C7;
//   #795 manifest-driven retired sweep (hash-exact managed file removed and reported; edited,
//        user-authored and markerless files kept; a second run removes nothing)  -> C2/C3/C4/C6/C7;
//   #795 an absent previous manifest sweeps nothing  -> C9 (and now reports what it kept);
//   #795 a manifest row is never a path (../ and absolute rows cannot delete outside the dir)
//        -> C9.
// What stays here is the command deploy (#973/#977).
//
// SAFETY: every install run here executes against a temp HOME under os.tmpdir();
// the real ~/.claude is never read or written.

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
// Returns stdout+stderr COMBINED.
function runInstall(home) {
  // spawn-class: environment
  const r = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) throw new Error(`install.sh exited ${r.status}\n${out}`);
  return out;
}

// ---------------------------------------------------------------------------
// #973 — AN INSTALL DOES NOT REMOVE A DEPLOYED COMMAND IT IS NOT GOING TO REPLACE.
//
// The command deploy is prune-then-recopy, and the two halves are ~420 lines
// apart. The prune is unconditional and namespace-wide over $HOME/.claude/commands;
// the recopy is whatever the forge's source command dir happens to hold. When the
// source holds nothing, the prune has already run — and $COMMANDS_DIR is
// $HOME/.claude/commands for EVERY forge, so a user with a working github install
// who runs --forge=gitlab against such a tree is left with none. github at least
// exits 1 afterwards; gitlab and gitea print "skeleton installed" and exit 0.
//
// The pin asserts NO exit code: an install that refuses BEFORE pruning removes
// nothing either, and what is left on disk is the whole property. It runs every
// forge in one loop and reports them together, because this file's assert throws
// and a per-forge assertion would hide the forges after the first.
//
// The FIRST block below pins what the prune is FOR and passes here by
// construction: the namespace prune is the only thing that clears a command
// retired in an earlier release, it must not reach the user's own files in the
// same shared dir, and the reinstall has to still UPDATE. It runs first for that
// reason — this file's assert throws, so the pins that must hold today are worth
// nothing behind one that must not.
// ---------------------------------------------------------------------------
const WORKFLOW_COMMANDS = ['kaola-workflow-finalize.md', 'workflow-init.md', 'workflow-next.md'];
const plantedBody = name => `PLANTED ${name} — on disk BEFORE the install\n`;

// A HOME in the state a working install leaves behind, plus whatever else is planted.
function plantCommandHome(names) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-973-home-'));
  const dir = path.join(home, '.claude', 'commands');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), plantedBody(name));
  return { home, dir };
}

// Unlike runInstall above this one REPORTS the status instead of throwing on it: a repair that
// refuses is a correct outcome for the cases below, and only the destination decides them.
function runInstallFrom(srcRoot, home, forge) {
  // spawn-class: environment
  const r = spawnSync('bash', [path.join(srcRoot, 'install.sh'), '--yes', `--forge=${forge}`, '--no-settings-merge'], {
    cwd: srcRoot,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}


{
  // WHAT THE NAMESPACE PRUNE IS FOR, and the two halves a repair can lose. Both installs run from
  // THIS checkout: the source is healthy here, which is the whole point.
  const RETIRED = ['workflow-goal.md', 'workflow-next-pr.md', 'kaola-workflow-adapt.md'];
  // #977 — the pre-rename era. These seven were deployed by the 2026-05 installer (a bare copy
  // with no stale-removal of any kind), renamed away in-tree, and never matched by the namespace
  // prune at any point since: they sit outside every pruned glob, so a user from that era carries
  // them forever across upgrades. Censused from git history (`git log --no-renames
  // --diff-filter=D -- commands/`), NOT read from the installer's own retired list — a probe that
  // reads the list under test agrees with it by construction and can never see a name missing
  // from it.
  const STRANDED = ['claude-workflow.md', 'claude-workflow-phase1.md', 'claude-workflow-phase2.md',
    'claude-workflow-phase3.md', 'claude-workflow-phase4.md', 'claude-workflow-phase5.md',
    'claude-workflow-phase6.md'];
  const KEPT = ['my-own-command.md', 'notes.txt'];
  const fresh = plantCommandHome([]);
  const upgraded = plantCommandHome([...WORKFLOW_COMMANDS, ...RETIRED, ...STRANDED, ...KEPT]);
  try {
    // Anti-vacuity, both directions: a retired name back in the deploy set would be REPLACED rather
    // than swept, and a kept name that joined it would survive because it was deployed.
    assert([...RETIRED, ...STRANDED].every(n => !WORKFLOW_COMMANDS.includes(n)) && KEPT.every(n => !WORKFLOW_COMMANDS.includes(n)),
      '#973: no planted name is in the deploy set — a name that is deployed is not evidence about the prune');

    runInstall(fresh.home);       // the reference result: a first install into an empty dir
    runInstall(upgraded.home);    // the same install over a populated one

    const left = RETIRED.filter(n => fs.existsSync(path.join(upgraded.dir, n)));
    assert.strictEqual(left.length, 0,
      `#973: a command retired in an earlier release is SWEPT from a live install — still on disk: ${left.join(', ')}`);
    for (const n of KEPT) {
      assert(fs.existsSync(path.join(upgraded.dir, n))
        && fs.readFileSync(path.join(upgraded.dir, n), 'utf8') === plantedBody(n),
        `#973: the sweep is SCOPED — ${n}, which this workflow neither ships nor ever shipped, `
        + 'survives byte-intact in the shared commands dir');
    }
    // The upgrade must land the same bytes a first install lands: a repair that leaves the stale
    // file in place keeps the deployed set and the exit code intact while the command never updates.
    const stale = WORKFLOW_COMMANDS.filter(n => !fs.existsSync(path.join(upgraded.dir, n))
      || !fs.readFileSync(path.join(upgraded.dir, n)).equals(fs.readFileSync(path.join(fresh.dir, n))));
    assert.strictEqual(stale.length, 0,
      `#973: after an upgrade every deployed command is byte-identical to what a FIRST install `
      + `writes, not to what was there before — stale: ${stale.join(', ')}`);
    // #977 pin, LAST in this block on purpose: this file's assert throws, and the pins above must
    // hold today, so they run ahead of one that must not. The property is the same one the RETIRED
    // trio proves the mechanism can deliver: an upgrade over a live install leaves NO name this
    // workflow ever deployed and no longer ships. Uninstall already clears these seven
    // (deliberately unasserted here — this pin is the INSTALL path's).
    const left977 = STRANDED.filter(n => fs.existsSync(path.join(upgraded.dir, n)));
    assert.strictEqual(left977.length, 0,
      `#977: a command deployed by the 2026-05-era installer and retired since is SWEPT on `
      + `upgrade like every later retirement — still on disk: ${left977.join(', ')}`);
  } finally {
    fs.rmSync(fresh.home, { recursive: true, force: true });
    fs.rmSync(upgraded.home, { recursive: true, force: true });
  }
}

{
  // ONE throwaway copy of this checkout, with every forge's command source emptied. The state
  // under test is a state of the SOURCE tree, and mutating this one is not on offer. `.git` is
  // deliberately absent so nothing in the copy can resolve back to this repository.
  const COPY_SKIP = new Set(['.git', 'kaola-workflow', 'node_modules']);
  const src = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-973-src-')));
  const homes = [];
  try {
    for (const entry of fs.readdirSync(root)) {
      if (COPY_SKIP.has(entry)) continue;
      // spawn-class: environment
      const cp = spawnSync('cp', ['-R', path.join(root, entry), path.join(src, entry)], { encoding: 'utf8' });
      assert.strictEqual(cp.status, 0, `#973 fixture: cp -R ${entry} failed — ${cp.stderr}`);
    }
    const sourceCommandDir = forge => (forge === 'github'
      ? path.join(src, 'commands')
      : path.join(src, 'plugins', `kaola-workflow-${forge}`, 'commands'));
    for (const forge of ['github', 'gitlab', 'gitea']) {
      for (const f of fs.readdirSync(sourceCommandDir(forge))) {
        if (f.endsWith('.md')) fs.unlinkSync(path.join(sourceCommandDir(forge), f));
      }
    }

    const USER_OWNED = 'my-own-command.md';
    const report = [];
    for (const forge of ['github', 'gitlab', 'gitea']) {
      const { home, dir } = plantCommandHome([...WORKFLOW_COMMANDS, USER_OWNED]);
      homes.push(home);
      assert.strictEqual(fs.readdirSync(dir).length, WORKFLOW_COMMANDS.length + 1,
        '#973 fixture: the command dir holds the deployed set before the install — a dir that was '
        + 'empty to begin with cannot observe anything being removed');
      const r = runInstallFrom(src, home, forge);
      report.push({
        forge,
        status: r.status,
        lost: WORKFLOW_COMMANDS.filter(n => !fs.existsSync(path.join(dir, n))),
        userLost: !fs.existsSync(path.join(dir, USER_OWNED)),
      });
    }
    assert(report.every(x => x.lost.length === 0),
      '#973: a deployed command the install is NOT going to replace is still on disk afterwards. '
      + 'Per forge (removed / exit): '
      + report.map(x => `${x.forge} → ${x.lost.length ? x.lost.join(' ') : '(none)'} / exit ${x.status}`).join('  |  '));
    assert(report.every(x => !x.userLost),
      '#973: the user-owned command in the same shared dir is untouched either way');
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
  }
}
console.log('Install upgrade rewrite tests passed');
