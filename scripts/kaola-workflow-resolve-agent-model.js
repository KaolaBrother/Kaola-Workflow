#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_AGENT_MODELS = {
  'code-explorer': 'sonnet',
  'docs-lookup': 'sonnet',
  planner: 'opus',
  'code-architect': 'sonnet',
  'tdd-guide': 'sonnet',
  'build-error-resolver': 'sonnet',
  'code-reviewer': 'sonnet',
  'security-reviewer': 'sonnet',
  'doc-updater': 'sonnet',
  'adversarial-verifier': 'sonnet',
  contractor: 'sonnet'
};

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

function resolveAgentModel(agentName, options = {}) {
  const name = String(agentName || '').trim();
  if (!name) return '';
  const dir = options.agentDir || defaultAgentDir();

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

function formatAgentArgument(model) {
  if (!model) return '';
  return `model="${String(model).replace(/"/g, '\\"')}",`;
}

function parseArgs(argv) {
  const args = {
    agent: '',
    format: 'raw',
    agentDir: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--raw') {
      args.format = 'raw';
    } else if (arg === '--json') {
      args.format = 'json';
    } else if (arg === '--agent-arg') {
      args.format = 'agent-arg';
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
    console.error('usage: kaola-workflow-resolve-agent-model.js <agent-name> [--raw|--json|--agent-arg] [--agent-dir DIR]');
    process.exit(2);
  }

  const model = resolveAgentModel(args.agent, { agentDir: args.agentDir || undefined });
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
  extractFrontmatterModel,
  formatAgentArgument,
  resolveAgentModel
};
