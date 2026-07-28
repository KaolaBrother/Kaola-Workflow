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

console.log('Install upgrade rewrite tests passed');
