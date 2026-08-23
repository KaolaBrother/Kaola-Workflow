#!/usr/bin/env node
'use strict';

// Materialize <cwd>/.cursor/agents from $CURSOR_HOME/agents (the 14 Kaola roles
// only). Self-contained: this file must require() when copied alone under
// $CURSOR_HOME/kaola-workflow/scripts/ with no sync-cursor-edition.js beside it.

const fs = require('fs');
const path = require('path');

const CANON_AGENT_NAMES = Object.freeze([
  'adversarial-verifier',
  'build-error-resolver',
  'code-architect',
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'metric-optimizer',
  'planner',
  'security-reviewer',
  'synthesizer',
  'tdd-guide',
]);

function listCanonAgents() {
  return CANON_AGENT_NAMES.slice();
}

function filesEqual(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const left = fs.readFileSync(a);
  const right = fs.readFileSync(b);
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
}

function ensureCursorCatalog(opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const cursorHome = opts.cursorHome
    || process.env.CURSOR_HOME
    || path.join(process.env.HOME || '', '.cursor');
  const names = listCanonAgents();
  const srcDir = path.join(cursorHome, 'agents');
  const destDir = path.join(cwd, '.cursor', 'agents');
  const srcImplementer = path.join(srcDir, 'implementer.md');

  if (!names.length || !fs.existsSync(srcImplementer)) {
    return { status: 'missing-source' };
  }

  let inSync = names.length > 0;
  for (const name of names) {
    const dest = path.join(destDir, name + '.md');
    const src = path.join(srcDir, name + '.md');
    if (!fs.existsSync(dest) || !filesEqual(dest, src)) {
      inSync = false;
      break;
    }
  }
  if (inSync) return { status: 'already-present' };

  fs.mkdirSync(destDir, { recursive: true });
  for (const name of names) {
    const src = path.join(srcDir, name + '.md');
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(destDir, name + '.md'));
  }
  return { status: 'copied' };
}

function main() {
  const cwd = process.cwd();
  const cursorHome = process.env.CURSOR_HOME
    || path.join(process.env.HOME || '', '.cursor');
  let result;
  try {
    result = ensureCursorCatalog({ cwd: cwd, cursorHome: cursorHome });
  } catch (e) {
    const msg = String((e && e.message) || e);
    const token = /\bmissing-source\b/.test(msg) ? 'missing-source' : msg;
    process.stdout.write(token + '\n');
    process.exit(1);
    return;
  }
  const token = result && result.status ? String(result.status) : '';
  process.stdout.write(token + '\n');
  process.exit(token === 'already-present' || token === 'copied' ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  ensureCursorCatalog,
  listCanonAgents,
  CANON_AGENT_NAMES,
};
