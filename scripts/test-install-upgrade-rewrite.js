#!/usr/bin/env node
'use strict';

// Regression for #154: re-running install.sh over a pre-#153 install (concrete
// agent frontmatter + manifest recording the concrete hash) must rewrite each
// unmodified managed agent to `model: inherit`. A genuinely user-modified agent
// must still be skipped.

const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredAgents = ['code-explorer', 'docs-lookup', 'planner', 'code-architect',
  'tdd-guide', 'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier'];
const MANIFEST_NAME = '.kaola-workflow-agent-manifest';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function runInstall(home) {
  execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Install upgrade rewrite tests passed');
