#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.


// Regression for #154: re-running install.sh over a pre-#153 install (concrete
// agent frontmatter + manifest recording the concrete hash) must rewrite each
// unmodified managed agent to `model: inherit`. A genuinely user-modified agent
// must still be skipped.
//
// Regression for #795 (second block): a role RETIRED from the tree left its agent
// file behind in ~/.claude/agents/ forever — still dispatchable, and the residue
// accumulated on every retirement. The sweep is manifest-driven because that dir is
// SHARED with user-authored agents and the names are not namespaced, so the
// destructive half needs hard proof it only ever deletes files this installer wrote
// and the user has not touched.
//
// SAFETY: every install run here executes against a temp HOME under os.tmpdir();
// the real ~/.claude is never read or written.

const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredAgents = ['code-explorer', 'knowledge-lookup', 'planner', 'code-architect',
  'tdd-guide', 'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier'];
const MANIFEST_NAME = '.kaola-workflow-agent-manifest';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Returns stdout+stderr COMBINED: the traversal guard reports rejected manifest
// entries on stderr, and a test that only read stdout could not see them.
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

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const end = text.indexOf('\n---', 3);
  return text.slice(0, end === -1 ? text.length : end);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-upgrade-'));
try {
  const agentsDir = path.join(tmp, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // Seed a pre-#153 install: verbatim `cp source dest` (concrete `model:`), plus
  // a manifest recording the concrete-dest sha256 so each agent reads as managed.
  const manifestLines = [];
  for (const agent of requiredAgents) {
    const src = path.join(root, 'agents', `${agent}.md`);
    const dest = path.join(agentsDir, `${agent}.md`);
    const body = fs.readFileSync(src);
    fs.writeFileSync(dest, body);
    assert(/\bmodel:\s*(sonnet|opus|haiku)\b/.test(frontmatter(dest)),
      `${agent} seed frontmatter should be a concrete model (pre-#153 state)`);
    manifestLines.push(`${agent}.md\t${sha256(body)}`);
  }

  // A genuinely user-modified agent: differs from source, manifest hash will not
  // match its current content, so the installer must leave it untouched.
  const modifiedAgent = 'tdd-guide';
  const modifiedDest = path.join(agentsDir, `${modifiedAgent}.md`);
  const modifiedBody = fs.readFileSync(modifiedDest, 'utf8') + '\n<!-- user customization -->\n';
  fs.writeFileSync(modifiedDest, modifiedBody);
  // manifestLines still carries the original (pristine) hash for tdd-guide, which
  // no longer matches the modified content -> treated as user-owned.

  fs.writeFileSync(path.join(agentsDir, MANIFEST_NAME), manifestLines.join('\n') + '\n');

  // Upgrade run.
  runInstall(tmp);

  for (const agent of requiredAgents) {
    if (agent === modifiedAgent) continue;
    const fm = frontmatter(path.join(agentsDir, `${agent}.md`));
    assert(/\bmodel:\s*inherit\b/.test(fm),
      `${agent} must be rewritten to model: inherit on upgrade over a pre-#153 install`);
  }

  // User-modified agent preserved (skipped, not clobbered to inherit).
  const modifiedAfter = fs.readFileSync(modifiedDest, 'utf8');
  assert(modifiedAfter.includes('<!-- user customization -->'),
    'user-modified agent must be left untouched on upgrade');
  assert(/\bmodel:\s*sonnet\b/.test(frontmatter(modifiedDest)),
    'user-modified agent frontmatter must not be rewritten');

  // Manifest for rewritten agents must now record the inherit-form hash.
  const manifestAfter = fs.readFileSync(path.join(agentsDir, MANIFEST_NAME), 'utf8');
  for (const agent of requiredAgents) {
    if (agent === modifiedAgent) continue;
    const expected = sha256(fs.readFileSync(path.join(agentsDir, `${agent}.md`)));
    assert(manifestAfter.includes(`${agent}.md\t${expected}`),
      `${agent} manifest hash must match the rewritten installed file`);
  }

  // Idempotent: a second re-run keeps inherit and does not flap.
  runInstall(tmp);
  for (const agent of requiredAgents) {
    if (agent === modifiedAgent) continue;
    const fm = frontmatter(path.join(agentsDir, `${agent}.md`));
    assert(/\bmodel:\s*inherit\b/.test(fm),
      `${agent} must remain model: inherit after a second re-run`);
  }

  // #795 guard, riding the fixture above: `tdd-guide` is a REQUIRED agent that was
  // skipped as user-modified, so it is absent from the NEW manifest while present in
  // the old one. The retired-agent sweep must not mistake "skipped" for "retired".
  assert(fs.existsSync(modifiedDest),
    'a REQUIRED agent skipped as user-modified must never be swept as retired');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #795 — manifest-driven retired-agent sweep.
//
// A role retired from the tree leaves an orphan agent file behind. The sweep
// removes exactly the files the PREVIOUS manifest proves this installer wrote,
// that the current tree no longer ships, and that are still byte-identical to what
// was recorded. Everything else in the shared agents dir is untouchable.
// ---------------------------------------------------------------------------
const MANAGED_MARKER = 'kaola-workflow-managed-agent: true';
const managedAgentBody = (name, extra) =>
  `---\nname: ${name}\ndescription: ${name} role.\nmodel: inherit\n---\n<!--\n${MANAGED_MARKER}\n-->\n\n${name} body.\n${extra || ''}`;

const sweepTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-sweep-'));
try {
  const agentsDir = path.join(sweepTmp, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // (1) RETIRED: managed, recorded in the manifest at its true hash, and no longer
  //     shipped by the tree. This is the orphan class the issue reports.
  const retiredBody = managedAgentBody('issue-scout');
  fs.writeFileSync(path.join(agentsDir, 'issue-scout.md'), retiredBody);

  // (2) RETIRED THEN EDITED BY THE USER: in the manifest, but its current bytes no
  //     longer match the recorded hash, so it is now the user's file.
  const editedRecordedBody = managedAgentBody('legacy-role');
  fs.writeFileSync(path.join(agentsDir, 'legacy-role.md'),
    editedRecordedBody + '\n<!-- user customization -->\n');

  // (3) USER-AUTHORED: absent from the manifest entirely. The whole reason the sweep
  //     is manifest-driven rather than a blind prune.
  const userAuthoredBody = '---\nname: my-own-helper\nmodel: sonnet\n---\n\nMy own agent.\n';
  fs.writeFileSync(path.join(agentsDir, 'my-own-helper.md'), userAuthoredBody);

  // (4) USER-OWNED FILE UNDER A REQUIRED NAME: recorded in the manifest at its exact
  //     current hash, but carrying no managed marker, so the installer SKIPS it and
  //     it never reaches the new manifest. Isolates the "required != retired" guard.
  const hijackedBody = '---\nname: implementer\nmodel: sonnet\n---\n\nMy own implementer.\n';
  fs.writeFileSync(path.join(agentsDir, 'implementer.md'), hijackedBody);

  fs.writeFileSync(path.join(agentsDir, MANIFEST_NAME), [
    `issue-scout.md\t${sha256(Buffer.from(retiredBody))}`,
    `legacy-role.md\t${sha256(Buffer.from(editedRecordedBody))}`,
    `implementer.md\t${sha256(Buffer.from(hijackedBody))}`,
  ].join('\n') + '\n');

  const out = runInstall(sweepTmp);

  assert(!fs.existsSync(path.join(agentsDir, 'issue-scout.md')),
    'a retired managed agent recorded in the previous manifest must be removed');
  assert(/Removed retired agent: .*issue-scout\.md/.test(out),
    'the sweep must name each removal:\n' + out);

  assert(fs.existsSync(path.join(agentsDir, 'legacy-role.md')),
    'a retired agent the user edited after install must be left untouched');
  assert(fs.readFileSync(path.join(agentsDir, 'legacy-role.md'), 'utf8')
    .includes('<!-- user customization -->'),
    'the user-edited retired agent must keep its content');

  assert(fs.existsSync(path.join(agentsDir, 'my-own-helper.md')),
    'a user-authored agent absent from the manifest must never be swept');
  assert(fs.readFileSync(path.join(agentsDir, 'my-own-helper.md'), 'utf8') === userAuthoredBody,
    'the user-authored agent must be byte-identical after the sweep');

  assert(fs.existsSync(path.join(agentsDir, 'implementer.md')),
    'a REQUIRED-name file the installer skipped must never be swept as retired');
  assert(fs.readFileSync(path.join(agentsDir, 'implementer.md'), 'utf8') === hijackedBody,
    'the skipped required-name file must be byte-identical after the sweep');

  // The rewritten manifest owns only what the current tree ships.
  const manifestAfter = fs.readFileSync(path.join(agentsDir, MANIFEST_NAME), 'utf8');
  assert(!manifestAfter.includes('issue-scout.md'),
    'the new manifest must not carry a retired agent');
  assert(!manifestAfter.includes('legacy-role.md'),
    'the new manifest must not carry a retired agent it declined to remove');

  // Every managed agent the tree DOES ship still landed.
  for (const agent of requiredAgents) {
    assert(fs.existsSync(path.join(agentsDir, `${agent}.md`)),
      `${agent} must still be installed alongside the sweep`);
  }

  // Idempotent: a second run has nothing left to sweep and removes nothing more.
  const out2 = runInstall(sweepTmp);
  assert(!/Removed retired agent:/.test(out2),
    'a converged install sweeps nothing on re-run:\n' + out2);
  assert(fs.existsSync(path.join(agentsDir, 'my-own-helper.md'))
    && fs.existsSync(path.join(agentsDir, 'legacy-role.md')),
    'the untouchable files survive a second run too');
} finally {
  fs.rmSync(sweepTmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #795 — an ABSENT previous manifest sweeps NOTHING. install.sh deliberately does
// not write the manifest when the deploy produced no rows, so a prior partial
// install can leave a populated agents dir with no manifest at all. That state must
// mean "sweep nothing", never "sweep everything".
// ---------------------------------------------------------------------------
const noManifestTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-nomanifest-'));
try {
  const agentsDir = path.join(noManifestTmp, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const orphanBody = managedAgentBody('issue-scout');
  fs.writeFileSync(path.join(agentsDir, 'issue-scout.md'), orphanBody);
  const userBody = '---\nname: my-own-helper\nmodel: sonnet\n---\n\nMy own agent.\n';
  fs.writeFileSync(path.join(agentsDir, 'my-own-helper.md'), userBody);
  assert(!fs.existsSync(path.join(agentsDir, MANIFEST_NAME)), 'fixture starts with no manifest');

  const out = runInstall(noManifestTmp);
  assert(!/Removed retired agent:/.test(out),
    'with no previous manifest the sweep must delete nothing:\n' + out);
  assert(fs.existsSync(path.join(agentsDir, 'issue-scout.md')),
    'an unrecorded orphan is not proven ours — it survives until a manifest records it');
  assert(fs.readFileSync(path.join(agentsDir, 'my-own-helper.md'), 'utf8') === userBody,
    'a user-authored agent survives a first install into a populated dir');
} finally {
  fs.rmSync(noManifestTmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #795 — PATH TRAVERSAL: a manifest name is never a path.
//
// The manifest lives inside the agents dir and records BASENAMES. A row carrying
// `../` (corruption, or a tampered manifest) must never reach a delete outside
// $AGENTS_DIR. The sweep therefore enumerates the DIRECTORY and intersects against
// the manifest instead of building `$AGENTS_DIR/<manifest name>`.
//
// Without the guard the traversal row satisfies every fail-closed condition the
// sweep checks (not a REQUIRED_AGENT, file exists, managed marker present, sha256
// matches) and `rm -f "$AGENTS_DIR/../../VICTIM.md"` deletes $HOME/VICTIM.md.
// ---------------------------------------------------------------------------
const traversalTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-traversal-'));
try {
  const agentsDir = path.join(traversalTmp, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // The victim sits OUTSIDE the agents dir ($HOME/VICTIM.md, two levels up). It is
  // given the managed marker and its true hash so it clears every content check the
  // sweep applies — only the path shape stands between it and `rm -f`.
  const victimBody = managedAgentBody('victim');
  const victimPath = path.join(traversalTmp, 'VICTIM.md');
  fs.writeFileSync(victimPath, victimBody);

  // A second victim reachable through a name that is merely separator-bearing
  // rather than dot-dot (`sub/NESTED.md`), proving the rejection is about path
  // shape, not just `..`.
  const nestedDir = path.join(agentsDir, 'sub');
  fs.mkdirSync(nestedDir, { recursive: true });
  const nestedBody = managedAgentBody('nested');
  const nestedPath = path.join(nestedDir, 'NESTED.md');
  fs.writeFileSync(nestedPath, nestedBody);

  // A genuine retired agent rides along: the guard must reject the hostile rows
  // WITHOUT disarming the sweep for legitimate ones.
  const retiredBody = managedAgentBody('issue-scout');
  fs.writeFileSync(path.join(agentsDir, 'issue-scout.md'), retiredBody);

  fs.writeFileSync(path.join(agentsDir, MANIFEST_NAME), [
    `../../VICTIM.md\t${sha256(Buffer.from(victimBody))}`,
    `sub/NESTED.md\t${sha256(Buffer.from(nestedBody))}`,
    `${path.join(traversalTmp, 'VICTIM.md')}\t${sha256(Buffer.from(victimBody))}`,
    `issue-scout.md\t${sha256(Buffer.from(retiredBody))}`,
  ].join('\n') + '\n');

  const out = runInstall(traversalTmp);

  assert(fs.existsSync(victimPath),
    'a `../`-bearing manifest entry must never delete a file OUTSIDE the agents dir');
  assert(fs.readFileSync(victimPath, 'utf8') === victimBody,
    'the file outside the agents dir must be byte-identical after the sweep');
  assert(fs.existsSync(nestedPath),
    'a separator-bearing manifest entry must never delete a file in a subdirectory');
  assert(!/Removed retired agent: .*VICTIM\.md/.test(out),
    'the sweep must never report removing a traversal target:\n' + out);
  assert(/ignoring agent manifest entry that is not a plain file name/.test(out)
    || /not a plain file name/.test(out),
    'the installer must name the rejected manifest entries loudly:\n' + out);

  // The legitimate retired agent on the SAME manifest is still swept.
  assert(!fs.existsSync(path.join(agentsDir, 'issue-scout.md')),
    'the traversal guard must not disarm the sweep for a legitimate retired agent');
  assert(/Removed retired agent: .*issue-scout\.md/.test(out),
    'the legitimate removal is still named:\n' + out);
} finally {
  fs.rmSync(traversalTmp, { recursive: true, force: true });
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
  const KEPT = ['my-own-command.md', 'notes.txt'];
  const fresh = plantCommandHome([]);
  const upgraded = plantCommandHome([...WORKFLOW_COMMANDS, ...RETIRED, ...KEPT]);
  try {
    // Anti-vacuity, both directions: a retired name back in the deploy set would be REPLACED rather
    // than swept, and a kept name that joined it would survive because it was deployed.
    assert(RETIRED.every(n => !WORKFLOW_COMMANDS.includes(n)) && KEPT.every(n => !WORKFLOW_COMMANDS.includes(n)),
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
