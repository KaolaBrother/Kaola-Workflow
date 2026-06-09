#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const pluginRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(process.argv[2] || process.cwd());
const sourceAgentsDir = path.join(pluginRoot, 'agents');
const sourceTemplate = path.join(pluginRoot, 'config', 'agents.toml');
const sourceHooksTemplate = path.join(pluginRoot, 'config', 'hooks.json');
const targetCodexDir = path.join(projectRoot, '.codex');
const targetAgentsDir = path.join(targetCodexDir, 'agents', 'kaola-workflow');
const targetConfig = path.join(targetCodexDir, 'config.toml');
const targetHooks = path.join(targetCodexDir, 'hooks.json');
const beginMarker = '# BEGIN kaola-workflow agents';
const endMarker = '# END kaola-workflow agents';
const PLUGIN_ROOT_TOKEN = '__KW_PLUGIN_ROOT__';
const MANAGED_HOOK_ID_PREFIX = 'kaola-workflow:';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function managedBlockPattern(flags = 'm') {
  return new RegExp(`${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, flags);
}

function stripManagedBlocks(existing) {
  return existing.replace(managedBlockPattern('gm'), '');
}

function isTopLevelTable(line, table) {
  return new RegExp(`^\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?$`).test(line);
}

function isAnyTopLevelTable(line) {
  return /^\s*\[[^\]\n]+\]\s*(?:#.*)?$/.test(line);
}

function hasTopLevelTable(content, table) {
  return content.split(/\r?\n/).some(line => isTopLevelTable(line, table));
}

function removeTopLevelTable(content, table) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(line => isTopLevelTable(line, table));
  if (start === -1) return content;

  let end = start + 1;
  while (end < lines.length && !isAnyTopLevelTable(lines[end])) end++;

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function managedBlock(existing) {
  const hasExternalFeatures = hasTopLevelTable(stripManagedBlocks(existing), 'features');
  const template = hasExternalFeatures
    ? removeTopLevelTable(read(sourceTemplate).trim(), 'features')
    : read(sourceTemplate).trim();
  return `${beginMarker}\n${template}\n${endMarker}`;
}

function upsertBlock(existing, block) {
  const expression = managedBlockPattern();
  if (expression.test(existing)) {
    return existing.replace(expression, `${block}\n`);
  }

  if (existing.trim() === '') {
    return `${block}\n`;
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${block}\n`;
}

function copyAgentProfiles() {
  fs.mkdirSync(targetAgentsDir, { recursive: true });
  const copied = [];

  for (const entry of fs.readdirSync(sourceAgentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const source = path.join(sourceAgentsDir, entry.name);
    const target = path.join(targetAgentsDir, entry.name);
    fs.copyFileSync(source, target);
    copied.push(path.relative(projectRoot, target));
  }

  return copied.sort();
}

function updateConfig() {
  fs.mkdirSync(targetCodexDir, { recursive: true });
  const existing = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const next = upsertBlock(existing, managedBlock(existing));

  if (next !== existing) {
    fs.writeFileSync(targetConfig, next);
    return 'updated';
  }

  return 'unchanged';
}

function updateHooks() {
  fs.mkdirSync(targetCodexDir, { recursive: true });

  // Read template and replace the plugin root token with the absolute pluginRoot.
  // Use split/join to replace ALL occurrences (String.replace replaces only the first).
  const templateText = read(sourceHooksTemplate).split(PLUGIN_ROOT_TOKEN).join(pluginRoot);
  const managedHooks = JSON.parse(templateText);

  // Read existing hooks.json or default to empty; tolerate parse failures (WARN-first).
  let existing = { hooks: {} };
  if (fs.existsSync(targetHooks)) {
    try {
      existing = JSON.parse(read(targetHooks));
      if (!existing || typeof existing.hooks !== 'object' || existing.hooks === null) {
        existing = { hooks: {} };
      }
    } catch (e) {
      console.warn(`Kaola-Workflow Codex hooks: malformed existing hooks.json — treating as empty (${e.message})`);
      existing = { hooks: {} };
    }
  }

  // Merge: per event in managed template, drop kaola-workflow:-prefixed entries
  // from existing, then append managed entries. Preserve all non-managed entries
  // and unrelated events untouched.
  const merged = Object.assign({}, existing, { hooks: Object.assign({}, existing.hooks) });

  for (const [event, managedEntries] of Object.entries(managedHooks.hooks)) {
    const existingEntries = merged.hooks[event] || [];
    // Keep only entries whose id does NOT start with the managed prefix.
    // Guard against entries that have no id (user entries without an id).
    const kept = existingEntries.filter(e => !(e.id && e.id.startsWith(MANAGED_HOOK_ID_PREFIX)));
    merged.hooks[event] = [...kept, ...managedEntries];
  }

  const next = JSON.stringify(merged, null, 2) + '\n';
  const current = fs.existsSync(targetHooks) ? read(targetHooks) : null;

  if (next !== current) {
    fs.writeFileSync(targetHooks, next);
    return 'updated';
  }

  return 'unchanged';
}

function main() {
  assert(fs.existsSync(sourceAgentsDir), `missing source agents directory: ${sourceAgentsDir}`);
  assert(fs.existsSync(sourceTemplate), `missing source config template: ${sourceTemplate}`);
  assert(fs.existsSync(sourceHooksTemplate), `missing source hooks template: ${sourceHooksTemplate}`);

  const copied = copyAgentProfiles();
  const configStatus = updateConfig();
  const hooksStatus = updateHooks();

  console.log(`Kaola-Workflow agent profiles: copied ${copied.length} profiles`);
  console.log(`Kaola-Workflow agent profiles: config ${configStatus} at ${path.relative(projectRoot, targetConfig)}`);
  for (const file of copied) {
    console.log(`- ${file}`);
  }
  console.log(`Kaola-Workflow Codex hooks: ${hooksStatus} at ${path.relative(projectRoot, targetHooks)}`);
  console.log(`run /hooks once in Codex to review and trust these command hooks (or codex exec --dangerously-bypass-hook-trust for automation)`);
}

main();
