#!/usr/bin/env node
'use strict';

// Issue #1044 acceptance: compact recovery is authored as one small framework,
// rendered before installation into complete runtime prompts, and never composed
// by JavaScript in the agent session.

const fs = require('fs');
const path = require('path');
const routing = require('./generate-routing-surfaces.js');

const REPO = path.resolve(__dirname, '..');
const START = '<!-- KW-COMPACT-RECOVERY-START -->';
const END = '<!-- KW-COMPACT-RECOVERY-END -->';
const DISPATCH_START = '<!-- KW-RUNTIME-DISPATCH-START -->';
const DISPATCH_END = '<!-- KW-RUNTIME-DISPATCH-END -->';
const MARKER = 'KW-COMPACT-RECOVERY-V1';
const RUNTIMES = ['claude', 'codex', 'grok', 'cursor'];
const FORGES = ['github', 'gitlab', 'gitea'];

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + message); }
}
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO, rel)); }
function count(text, needle) { return String(text).split(needle).length - 1; }
function bytes(text) { return Buffer.byteLength(String(text), 'utf8'); }

const skeleton = read('templates/routing/compact-recovery.skeleton.md');
const dispatch = read('templates/routing/dispatch-contract.md').trim();
assert(count(skeleton, '<!-- SLOT:runtime-dispatch-common -->') === 1,
  'A1: compact skeleton names the shared dispatch slot once');
assert(count(skeleton, '<!-- SLOT:runtime-delegation -->') === 1,
  'A1: compact skeleton names the runtime overlay slot once');
assert(!/node\s|\.js\b|PreToolUse|PostToolUse|sidecar|opaque token|chunk bitmap/i.test(skeleton),
  'A2: common compact core carries no runtime script or tool-use state machine');
assert(!/Claude|Codex|Grok|Cursor|OpenCode|Kimi|ZCode/.test(dispatch),
  'A3: shared dispatch contract remains vendor-neutral');

const rendered = new Map();
for (const forge of FORGES) {
  for (const runtime of RUNTIMES) {
    const prompt = routing.renderCompactRecoveryPrompt(runtime, forge);
    rendered.set(runtime + ':' + forge, prompt);
    assert(count(prompt, START) === 1 && count(prompt, END) === 1,
      `B1[${runtime}/${forge}]: one compact recovery boundary`);
    assert(count(prompt, DISPATCH_START) === 1 && count(prompt, DISPATCH_END) === 1,
      `B1[${runtime}/${forge}]: one dispatch boundary`);
    assert(prompt.includes(MARKER), `B1[${runtime}/${forge}]: recovery marker is present`);
    assert(prompt.includes(dispatch),
      `B2[${runtime}/${forge}]: exact shared dispatch wording is embedded`);
    assert(!prompt.includes('<!-- SLOT:'),
      `B2[${runtime}/${forge}]: all generation slots are resolved`);
    assert(/If any mission is todo or in-flight, continue Workflow Next/.test(prompt)
      && /If every mission is\s+done, continue Kaola-Workflow Finalization/.test(prompt),
      `B3[${runtime}/${forge}]: one direct prompt covers both durable operation states`);
    assert(/Read project-root `AGENTS\.md`/.test(prompt)
      && /workflow-state\.md/.test(prompt) && /mission-list\.md/.test(prompt),
      `B3[${runtime}/${forge}]: prompt resumes from durable files`);
    assert(!/node\s|\.js\b|PreToolUse|PostToolUse|sidecar|opaque token|chunk bitmap/i.test(prompt),
      `B4[${runtime}/${forge}]: runtime prompt contains no executable prompt machinery`);
    assert(bytes(prompt) >= 4500 && bytes(prompt) <= 7500,
      `B5[${runtime}/${forge}]: direct prompt stays within measured 4.5–7.5 KB budget (got ${bytes(prompt)} B)`);
  }
}

for (const runtime of RUNTIMES) {
  const github = rendered.get(runtime + ':github');
  assert(FORGES.every(forge => rendered.get(runtime + ':' + forge).includes(dispatch)),
    `C1[${runtime}]: all forge renders retain the exact common contract`);
  assert(/Runtime adapter facts/.test(github), `C1[${runtime}]: runtime overlay is present`);
}
assert(new Set(RUNTIMES.map(runtime => rendered.get(runtime + ':github'))).size === RUNTIMES.length,
  'C2: runtime prompts differ where measured adapter capabilities differ');

for (const row of routing.RUNTIME_RECOVERY_SURFACES) {
  const committed = read(row.path);
  const expected = routing.renderCompactRecoveryPrompt(row.runtime, row.forge);
  assert(committed === expected,
    `D1: tracked prompt ${row.path} byte-matches its generated runtime artifact`);
}

for (const rel of ['commands/workflow-next.md', 'commands/kaola-workflow-finalize.md']) {
  const operation = read(rel);
  assert(operation.includes(dispatch), `${rel}: same shared dispatch authoring source is used`);
  assert(!operation.includes('<!-- SLOT:'), `${rel}: generated operation has no unresolved slot`);
}

for (const rel of [
  'scripts/kaola-workflow-compact-context.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js',
  'templates/opencode/plugins/kaola-workflow-hooks.js',
]) {
  assert(!exists(rel), `E1: retired compact runtime code is absent: ${rel}`);
}
assert(!exists('templates/routing/cards')
  || fs.readdirSync(path.join(REPO, 'templates/routing/cards')).length === 0,
  'E2: no second routing-card authoring framework remains');

console.log(`Issue #1044 prompt-framework acceptance: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
