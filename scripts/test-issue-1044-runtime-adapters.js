#!/usr/bin/env node
'use strict';

// Issue #1044 acceptance: each runtime uses its measured native carrier. Claude,
// Codex, and Grok read one generated prompt at compact; Cursor uses one project
// Rule across CLI/App/Cloud; OpenCode/Kimi/ZCode add no compact lifecycle.

const fs = require('fs');
const path = require('path');
const routing = require('./generate-routing-surfaces.js');
const manifest = require('./kaola-workflow-install-manifest.js');
const cursor = require('./sync-cursor-edition.js');
const grok = require('./sync-grok-edition.js');
const kimi = require('./sync-kimi-edition.js');
const opencode = require('./sync-opencode-edition.js');
const zcode = require('./sync-zcode-edition.js');

const REPO = path.resolve(__dirname, '..');
const MARKER = 'KW-COMPACT-RECOVERY-V1';
let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + message); }
}
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO, rel)); }
function json(rel) { return JSON.parse(read(rel)); }

function hookRows(mapping, event) {
  const hooks = mapping && mapping.hooks && typeof mapping.hooks === 'object' ? mapping.hooks : {};
  return Array.isArray(hooks[event]) ? hooks[event] : [];
}
function assertStaticCompactHook(mapping, label) {
  const hooks = mapping && mapping.hooks && typeof mapping.hooks === 'object' ? mapping.hooks : {};
  const events = Object.keys(hooks).filter(key => !['version', 'enabled', 'events'].includes(key));
  assert(JSON.stringify(events) === JSON.stringify(['SessionStart']),
    `${label}: SessionStart is the only event`);
  const rows = hookRows(mapping, 'SessionStart');
  assert(rows.length === 1 && rows[0].matcher === 'compact',
    `${label}: one compact matcher row`);
  const executors = rows[0] && Array.isArray(rows[0].hooks) ? rows[0].hooks : [];
  const command = executors[0] && String(executors[0].command || '');
  assert(executors.length === 1 && executors[0].type === 'command',
    `${label}: one command carrier`);
  assert(/^cat\s+"[^"]*kaola-workflow-(?:codex-)?compact-recovery\.md"$/.test(command),
    `${label}: carrier directly reads a generated Markdown prompt (got ${command})`);
  assert(!/node|\.js\b|PreToolUse|PostToolUse|Stop/.test(JSON.stringify(mapping)),
    `${label}: no JavaScript or ordinary-tool lifecycle`);
}

for (const [label, rel] of [
  ['Claude GitHub', 'hooks/hooks.json'],
  ['Claude GitLab', 'plugins/kaola-workflow-gitlab/hooks/hooks.json'],
  ['Claude Gitea', 'plugins/kaola-workflow-gitea/hooks/hooks.json'],
  ['Codex GitHub', 'plugins/kaola-workflow/config/hooks.json'],
  ['Codex GitLab', 'plugins/kaola-workflow-gitlab/config/hooks.json'],
  ['Codex Gitea', 'plugins/kaola-workflow-gitea/config/hooks.json'],
]) assertStaticCompactHook(json(rel), `A1[${label}]`);

assert(JSON.stringify(grok.expectedHookFiles()) === '[]'
  && grok.expectedRuleFiles().includes('kaola-workflow-compact-recovery.md')
  && routing.renderCompactRecoveryPrompt('grok', 'github').includes(MARKER),
  'A2[Grok]: adapter emits one native Rule and no compact hook');

const cursorHooks = JSON.parse(cursor.renderCursorHooksJson());
const cursorRule = cursor.renderCursorRecoveryRule('github');
assert(cursorHooks.hooks && Object.keys(cursorHooks.hooks).length === 0,
  'B1[Cursor]: generated hooks mapping is empty');
assert(/^---\n[\s\S]*^alwaysApply:\s*true$/m.test(cursorRule),
  'B1[Cursor]: recovery carrier is an always-applied project Rule');
assert(/standalone CLI[\s\S]*App local[\s\S]*Cloud/i.test(cursorRule),
  'B1[Cursor]: one Rule explicitly covers CLI, App local, and Cloud');
assert(cursorRule.includes(routing.renderCompactRecoveryPrompt('cursor', 'github').trim()),
  'B2[Cursor]: Rule embeds the complete generated Cursor prompt');
assert(cursorRule.includes(MARKER) && !/\.js\b|PreToolUse|PostToolUse/.test(cursorRule),
  'B2[Cursor]: Rule has the marker and no executable prompt lifecycle');
assert(JSON.stringify(cursor.expectedHookFiles()) === '[]',
  'B2[Cursor]: no executable Cursor hook file is emitted');

assert(kimi.renderKimiHooksToml('github') === ''
  && JSON.stringify(kimi.expectedHookFiles()) === '[]',
  'C1[Kimi]: no PostCompact or tool-use hook is generated');
assert(JSON.stringify(opencode.PLUGIN_SCRIPTS) === '[]'
  && !exists('templates/opencode/plugins/kaola-workflow-hooks.js'),
  'C1[OpenCode]: no compact plugin is generated');
const zcodeConfig = JSON.parse(zcode.renderZcodeConfigJson('github'));
assert(!zcodeConfig.hooks || Object.keys(zcodeConfig.hooks).length === 0,
  'C1[ZCode]: project config has no Kaola hook declaration');

assert(!manifest.SUPPORT_SCRIPTS.some(name => /compact-(?:context|resume)\.js$/.test(name)),
  'D1: shared install manifest contains no compact JavaScript');
for (const forge of manifest.FORGES) {
  assert(!manifest.supportScripts(forge).some(name => /compact-(?:context|resume)\.js$/.test(name)),
    `D1[${forge}]: forge install emits no compact JavaScript`);
}
assert(read('install.sh').includes('kaola-workflow-compact-recovery.md')
  && read('install-grok.sh').includes('kaola-workflow-compact-recovery.md'),
  'D2: Claude and Grok installers deploy the generated prompt artifact');
assert(/hookReferencedRelPaths/.test(read('plugins/kaola-workflow/scripts/install-codex-agent-profiles.js')),
  'D2: Codex installer resolves the prompt referenced by its trusted hook mapping');

const caps = json('templates/agents/runtime-capabilities.json').runtimes;
const expectedEvents = {
  claude: ['SessionStart'],
  'codex-github': ['SessionStart'],
  'codex-gitlab': ['SessionStart'],
  'codex-gitea': ['SessionStart'],
  grok: ['always-loaded native rule'],
  cursor: ['alwaysApply project rule'],
  opencode: [],
  kimi: [],
  zcode: [],
};
for (const [runtime, expected] of Object.entries(expectedEvents)) {
  const protocol = caps[runtime] && caps[runtime].compact_protocol;
  assert(protocol && JSON.stringify(protocol.events) === JSON.stringify(expected),
    `E1[${runtime}]: declared compact carrier matches measured runtime design`);
  assert(protocol && /(?:zero|none|no|not).*?(?:tool|hook|subprocess|context)/i.test(
    String(protocol.tool || protocol.pending || '')),
    `E2[${runtime}]: ordinary tool-use recovery cost is explicitly absent`);
}

const allMappings = [
  json('hooks/hooks.json'),
  json('plugins/kaola-workflow/config/hooks.json'),
  cursorHooks,
  zcodeConfig,
];
assert(!/(?:PreToolUse|PostToolUse|PostToolUseFailure|PermissionRequest|\bStop\b)/.test(
  JSON.stringify(allMappings)),
  'F1: all productized #1044 mappings add 0 ordinary-tool recovery events');

console.log(`Issue #1044 runtime-adapter acceptance: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
