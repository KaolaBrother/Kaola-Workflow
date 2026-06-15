#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_AGENT_MODELS = {
  'code-explorer': 'sonnet',
  'knowledge-lookup': 'sonnet',
  planner: 'opus',
  'code-architect': 'sonnet',
  'tdd-guide': 'sonnet',
  'implementer': 'sonnet',
  'build-error-resolver': 'sonnet',
  'code-reviewer': 'sonnet',
  'security-reviewer': 'sonnet',
  'doc-updater': 'sonnet',
  'adversarial-verifier': 'sonnet',
  'issue-scout': 'sonnet',
  contractor: 'sonnet',
  'workflow-planner': 'opus',
  // #463 (write-overlap): the synthesizer resolves real write-leg merge conflicts BY INTENT — a
  // reasoning-class task. Its default is opus; a plan may RAISE but never LOWER this floor (see
  // REASONING_FLOOR_ROLES). The post-G1 intent-verifier (adversarial-verifier on a merge) is held to
  // the same floor when it is dispatched on a synthesizer's output.
  synthesizer: 'opus'
};

// #463 (write-overlap): roles whose dispatch MUST resolve to a reasoning-class model (a non-reasoning
// tier is a freeze/dispatch refusal, never a silent downgrade). The synthesizer's conflict-resolution
// path reasons about intent; a non-reasoning tier would compose bytes without understanding them.
const REASONING_FLOOR_ROLES = new Set(['synthesizer']);
function isReasoningClass(model) {
  return String(model || '').trim().toLowerCase() === 'opus';
}

// #463 Slice 1 (AC14): ENFORCE the reasoning-class floor. For a REASONING_FLOOR_ROLES role, the
// resolved model MUST be reasoning-class; a manifest/frontmatter override that LOWERS the floor — or an
// explicit `inherit` (empty), which could resolve to a non-reasoning session model — is a typed refusal,
// never a silent downgrade. A plan may RAISE but never LOWER the floor. Non-floor roles are unaffected.
// Returns { ok, role, model, floor } on pass; { ok:false, reason, role, model, floor, operator_hint }
// on a violation. ENFORCEMENT is opt-in via resolveAgentModel({enforceFloor:true}) / the CLI
// --enforce-floor flag, so the back-compat string-return contract is unchanged for existing callers;
// the step-4 synthesizer dispatch (and the post-G1 intent-verifier) opt in.
function enforceReasoningFloor(role, model) {
  const name = String(role || '').trim();
  if (!REASONING_FLOOR_ROLES.has(name)) return { ok: true, role: name, model: model || '', floor: null };
  if (isReasoningClass(model)) return { ok: true, role: name, model, floor: 'opus' };
  return {
    ok: false,
    reason: 'reasoning_floor_violation',
    role: name,
    model: model || '(inherit)',
    floor: 'opus',
    operator_hint: `Role '${name}' must resolve to a reasoning-class model (opus); resolved '${model || 'inherit'}'. `
      + 'A plan may RAISE but never LOWER this floor — remove the agent manifest/frontmatter override (to use the opus default) or set it to a reasoning-class tier.'
  };
}

function homeDir() {
  return process.env.HOME || os.homedir();
}

function defaultAgentDir() {
  return process.env.KAOLA_AGENT_DIR || path.join(homeDir(), '.claude', 'agents');
}

function extractFrontmatterModel(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return '';
  const modelLine = match[1].split(/\r?\n/).find(line => /^\s*model\s*:/.test(line));
  if (!modelLine) return '';
  return modelLine.replace(/^\s*model\s*:\s*/, '').trim().replace(/^['"]|['"]$/g, '');
}

function modelFromFile(agentName, agentDir) {
  try {
    return extractFrontmatterModel(fs.readFileSync(path.join(agentDir, `${agentName}.md`), 'utf8'));
  } catch {
    return '';
  }
}

function resolveAgentModelRaw(name, dir) {
  // 1. manifest: .kaola-agent-models.json in agentDir — written at install time
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.kaola-agent-models.json'), 'utf8'));
    if (manifest && Object.prototype.hasOwnProperty.call(manifest, name)) {
      const v = String(manifest[name] || '');
      return v.toLowerCase() === 'inherit' ? '' : v;
    }
  } catch { /* missing or unparseable — fall through */ }

  // 2. frontmatter, only if not 'inherit'
  const fm = modelFromFile(name, dir);
  if (fm && fm.toLowerCase() !== 'inherit') return fm;

  // 3. DEFAULT_AGENT_MODELS
  const def = DEFAULT_AGENT_MODELS[name];
  if (def) return def.toLowerCase() === 'inherit' ? '' : def;

  // 4. empty
  return '';
}

function resolveAgentModel(agentName, options = {}) {
  const name = String(agentName || '').trim();
  if (!name) return '';
  const dir = options.agentDir || defaultAgentDir();
  const model = resolveAgentModelRaw(name, dir);
  // #463 Slice 1 (AC14): opt-in reasoning-class floor enforcement. A floor-role resolution that LOWERS
  // the floor is a typed refusal (thrown), surfaced fail-closed to the caller — never silently honored.
  if (options.enforceFloor) {
    const check = enforceReasoningFloor(name, model);
    if (!check.ok) {
      const err = new Error(check.operator_hint);
      err.reason = check.reason;
      err.role = check.role;
      err.model = check.model;
      err.floor = check.floor;
      throw err;
    }
  }
  return model;
}

function formatAgentArgument(model) {
  if (!model) return '';
  return `model="${String(model).replace(/"/g, '\\"')}",`;
}

function parseArgs(argv) {
  const args = {
    agent: '',
    format: 'raw',
    agentDir: '',
    enforceFloor: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--raw') {
      args.format = 'raw';
    } else if (arg === '--json') {
      args.format = 'json';
    } else if (arg === '--agent-arg') {
      args.format = 'agent-arg';
    } else if (arg === '--enforce-floor') {
      args.enforceFloor = true;
    } else if (arg === '--agent-dir') {
      args.agentDir = argv[i + 1] || '';
      i += 1;
    } else if (arg.startsWith('--agent-dir=')) {
      args.agentDir = arg.slice('--agent-dir='.length);
    } else if (!args.agent) {
      args.agent = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (!args.agent) {
    console.error('usage: kaola-workflow-resolve-agent-model.js <agent-name> [--raw|--json|--agent-arg] [--enforce-floor] [--agent-dir DIR]');
    process.exit(2);
  }

  // #463 Slice 1 (AC14): --enforce-floor surfaces a reasoning-floor violation as a typed refusal + a
  // non-zero exit, fail-closed, instead of silently emitting the lowered model.
  let model;
  try {
    model = resolveAgentModel(args.agent, { agentDir: args.agentDir || undefined, enforceFloor: args.enforceFloor });
  } catch (err) {
    if (err && err.reason === 'reasoning_floor_violation') {
      const refusal = { result: 'refuse', reason: err.reason, agent: args.agent, model: err.model, floor: err.floor, operator_hint: err.message };
      if (args.format === 'json') process.stdout.write(`${JSON.stringify(refusal)}\n`);
      else console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify({ agent: args.agent, model })}\n`);
  } else if (args.format === 'agent-arg') {
    const arg = formatAgentArgument(model);
    if (arg) process.stdout.write(`${arg}\n`);
  } else if (model) {
    process.stdout.write(`${model}\n`);
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_AGENT_MODELS,
  REASONING_FLOOR_ROLES,
  isReasoningClass,
  enforceReasoningFloor,
  extractFrontmatterModel,
  formatAgentArgument,
  resolveAgentModel
};
