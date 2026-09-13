#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER = path.join(ROOT, 'install-cursor.sh');
const CAPABILITY_SOURCE = path.join(ROOT, 'templates', 'agents', 'runtime-capabilities.json');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(command, args, options) {
  // spawn-class: environment
  return spawnSync(command, args, Object.assign({ cwd: ROOT, encoding: 'utf8' }, options || {}));
}

function output(result) {
  return String(result.stdout || '') + String(result.stderr || '');
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-issue-1045-'));
  try {
    const renderRoot = path.join(tmp, 'render');
    fs.mkdirSync(renderRoot, { recursive: true });
    const render = run(process.execPath, [path.join(ROOT, 'scripts', 'sync-cursor-edition.js'),
      '--write', '--tree-root=' + renderRoot]);
    assert.strictEqual(render.status, 0, output(render));

    const rendered = ['workflow-next.md', 'kaola-workflow-finalize.md'].map(name => ({
      name,
      text: fs.readFileSync(path.join(renderRoot, '.cursor', 'commands', name), 'utf8'),
    }));
    // #1069: the dispatch-carrier wording now rides the always-loaded Rule; the
    // generated commands carry the pointer only.
    const agentGen = require(path.join(ROOT, 'scripts', 'generate-agent-profiles.js'));
    const gc = require(path.join(ROOT, 'scripts', 'kaola-workflow-global-contract.js'));
    const registry = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'templates', 'global', 'runtime-contract-adapters.json'), 'utf8'));
    const rule = gc.renderContract({
      source: fs.readFileSync(
        path.join(ROOT, 'templates', 'global', 'kaola-workflow-global.md'), 'utf8'),
      target: registry.targets.find(row => row.id === 'cursor-cli-local'),
    }).toString('utf8');
    assert.match(rule,
      /exact-binding[^.]*post-resolution assertion/i,
      'always-loaded Rule: exact-binding policy must be a post-resolution assertion');
    assert.match(rule,
      /flat `subagent_type(?::[^`]+)?`[^.]*MUST omit[^.]*per-call `model`/i,
      'always-loaded Rule: named call uses the flat field and forbids a model override');
    assert.doesNotMatch(rule,
      /(?:call|dispatch|construct)[^.]{0,180}`subagentType\.custom\.name`/i,
      'always-loaded Rule: provider encoding must not be a controller call instruction');
    for (const surface of rendered) {
      assert.strictEqual(
        surface.text.split(agentGen.ALWAYS_LOADED_DISPATCH_POINTER).length - 1, 1,
        surface.name + ': command carries the always-loaded-carrier pointer exactly once');
      assert.doesNotMatch(surface.text, /KW-RUNTIME-DISPATCH-(?:START|END)/,
        surface.name + ': command carries no dispatch markers');
      assert.doesNotMatch(surface.text,
        /(?:call|dispatch|construct)[^.]{0,180}`subagentType\.custom\.name`/i,
        surface.name + ': provider encoding must not be a controller call instruction');
    }

    const home = path.join(tmp, 'home');
    const cursorHome = path.join(tmp, 'cursor-home');
    fs.mkdirSync(home, { recursive: true });
    const env = Object.assign({}, process.env, { HOME: home, CURSOR_HOME: cursorHome });
    const install = run('bash', [INSTALLER, '--global', '--yes'], { env });
    assert.strictEqual(install.status, 0, output(install));

    const installedCapability = path.join(cursorHome, 'kaola-workflow', 'templates', 'agents',
      'runtime-capabilities.json');
    assert.ok(fs.existsSync(installedCapability),
      'global authority installs the doctor capability source');
    assert.strictEqual(sha256(installedCapability), sha256(CAPABILITY_SOURCE),
      'installed doctor capability source byte-matches the single adapter registry');

    const helper = path.join(cursorHome, 'kaola-workflow', 'scripts',
      'kaola-workflow-cursor-surface.js');
    const target = path.join(tmp, 'fresh-target');
    fs.mkdirSync(target, { recursive: true });
    const doctor = run(process.execPath, [helper, '--doctor', '--json', '--target', target,
      '--product', 'cli', '--host', 'local'], { cwd: target, env });
    assert.strictEqual(doctor.status, 0, output(doctor));
    const report = JSON.parse(doctor.stdout);
    assert.strictEqual(report.runtime, 'cursor');
    assert.strictEqual(report.product_surface, 'cli');
    assert.strictEqual(report.execution_host, 'local');
    assert.match(report.dispatch_contract.call_shape, /subagent_type/);
    assert.strictEqual(report.dispatch_contract.named_model_field, 'omit');
    assert.strictEqual(report.dispatch_contract.exact_binding, 'post_resolution_assertion');
    assert.strictEqual(report.dispatch_contract.provider_model_evidence,
      'providerOptions.cursor.modelName');

    const ensure = run(process.execPath, [helper, '--ensure-target', target, '--json'], {
      cwd: target, env,
    });
    assert.strictEqual(ensure.status, 0, output(ensure));
    const ensured = JSON.parse(ensure.stdout);
    assert.ok(ensured.status === 'materialized' || ensured.status === 'current',
      'installed helper still materializes a target without a source checkout');

    const receipt = JSON.parse(fs.readFileSync(path.join(cursorHome, 'kaola-workflow',
      'cursor-authority.json'), 'utf8'));
    assert.ok(receipt.files['kaola-workflow/templates/agents/runtime-capabilities.json'],
      'global authority receipt owns the installed capability registry');

    process.stdout.write('issue-1045 cursor conformance passed (24 assertions).\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
