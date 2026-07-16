#!/usr/bin/env node
'use strict';

// Unit tests for the adaptive executor script-handle resolution (#344).
// Hand-rolled assert + counter; repo style (no framework).
//
// #344: every adaptive lifecycle call in the plan-run surface is `node "$KAOLA_SCRIPTS/…"`,
// but $KAOLA_SCRIPTS was never defined in any edition — undefined in a consumer plugin install
// (no local scripts dir). These tests assert (1) every edition defines the handle BEFORE its
// first use, and (2) the canonical kaola_script() resolver's fallback chain actually resolves
// a script in a consumer-repo-shaped fixture (no ./scripts; plugin-cache layout).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ---- (1) Static: every plan-run edition defines the handle before its first $KAOLA_SCRIPTS use ----
// Command editions define `KAOLA_SCRIPTS=` via kaola_script(); the Codex SKILL uses the
// plugin-cache find-fallback. In every case the assignment must precede the first reference.
const EDITIONS = [
  { name: 'canonical', file: 'commands/kaola-workflow-plan-run.md', needsResolver: true },
  { name: 'gitlab', file: 'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md', needsResolver: true },
  { name: 'gitea', file: 'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md', needsResolver: true },
  { name: 'codex-skill', file: 'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md', needsResolver: false },
];

for (const ed of EDITIONS) {
  const body = read(ed.file);
  const defIdx = body.indexOf('KAOLA_SCRIPTS=');
  const useIdx = body.indexOf('"$KAOLA_SCRIPTS/');
  assert(defIdx !== -1, `${ed.name}: plan-run must define KAOLA_SCRIPTS (#344)`);
  assert(useIdx !== -1, `${ed.name}: plan-run is expected to reference $KAOLA_SCRIPTS`);
  assert(defIdx !== -1 && useIdx !== -1 && defIdx < useIdx,
    `${ed.name}: KAOLA_SCRIPTS must be defined BEFORE its first use (#344) — no reference may precede the definition`);
  if (ed.needsResolver) {
    assert(/kaola_script\(\)\{/.test(body),
      `${ed.name}: plan-run must define the kaola_script() resolver (#344)`);
  } else {
    // Codex SKILL: plugin-cache find-fallback probe.
    assert(body.includes('$HOME/.codex/plugins/cache') && body.includes('-print -quit'),
      `codex-skill: plan-run must resolve KAOLA_SCRIPTS via the plugin-cache find-fallback (#344)`);
  }
}

// ---- (2) Behavioral: extract the REAL canonical kaola_script() and exercise its fallback chain ----
// Pull the exact one-liner the command ships, so resolver drift fails this test.
const canonical = read('commands/kaola-workflow-plan-run.md');
const fnMatch = canonical.match(/^kaola_script\(\)\{.*\}$/m);
assert(!!fnMatch, 'canonical: kaola_script() one-liner must be extractable for behavioral test');

function resolveWith(fnLine, scriptName, { cwd, env }) {
  const harness = `${fnLine}\nkaola_script "${scriptName}"\n`;
  const hp = path.join(cwd, '.kaola-script-harness.sh');
  fs.writeFileSync(hp, harness);
  try {
    return execFileSync('bash', [hp], { cwd, env, encoding: 'utf8' }).trim();
  } catch (_) {
    return '__NONZERO__';
  }
}

if (fnMatch) {
  const fnLine = fnMatch[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-planrun-'));
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(fakeHome, { recursive: true });

  // Fixture A — consumer repo: package.json name != kaola-workflow, NO ./scripts dir,
  // CLAUDE_PLUGIN_ROOT points at the installed plugin cache that carries the script.
  const consumer = path.join(tmp, 'consumer');
  fs.mkdirSync(consumer, { recursive: true });
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'consumer-app' }));
  const pluginRoot = path.join(tmp, 'plugincache');
  fs.mkdirSync(path.join(pluginRoot, 'scripts'), { recursive: true });
  const pluginScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-node.js');
  fs.writeFileSync(pluginScript, '// stub');
  const consumerEnv = { ...process.env, HOME: fakeHome, CLAUDE_PLUGIN_ROOT: pluginRoot };
  const consumerOut = resolveWith(fnLine, 'kaola-workflow-adaptive-node.js', { cwd: consumer, env: consumerEnv });
  assert(consumerOut === pluginScript || consumerOut === path.join('.', '') + pluginScript,
    `consumer-repo fallback: resolver must resolve to the plugin-cache path (got "${consumerOut}", want "${pluginScript}")`);
  assert(consumerOut !== '__NONZERO__' && consumerOut.length > 0,
    'consumer-repo fallback: resolver must NOT fail/empty in a consumer install (#344 — the bug class)');

  // Fixture B — in-repo: package.json name == kaola-workflow with ./scripts present → prefers ./scripts.
  const inrepo = path.join(tmp, 'inrepo');
  fs.mkdirSync(path.join(inrepo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(inrepo, 'package.json'), JSON.stringify({ name: 'kaola-workflow' }));
  fs.writeFileSync(path.join(inrepo, 'scripts', 'kaola-workflow-adaptive-node.js'), '// stub');
  const inrepoOut = resolveWith(fnLine, 'kaola-workflow-adaptive-node.js', { cwd: inrepo, env: { ...process.env, HOME: fakeHome } });
  assert(inrepoOut === './scripts/kaola-workflow-adaptive-node.js',
    `in-repo: resolver must prefer ./scripts when name==kaola-workflow (got "${inrepoOut}")`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// Reviewer contract v2 execution card dependencies. The runtime guidance consumes
// these pure fields; it must never carry an independently reimplemented gate mode.
{
  const schema = require('./kaola-workflow-adaptive-schema');
  assert(typeof schema.deriveGateMode === 'function',
    'review-v2 plan-run dependency: deriveGateMode is exported from adaptive-schema');
  assert(typeof schema.requiredReviewTokens === 'function',
    'review-v2 plan-run dependency: requiredReviewTokens is exported from adaptive-schema');
  assert(typeof schema.buildReviewContext === 'function',
    'review-v2 plan-run dependency: buildReviewContext is exported from adaptive-schema');
}

if (failed > 0) {
  console.error(`test-plan-run: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`test-plan-run: all ${passed} assertions passed (#344 script-handle resolution)`);
