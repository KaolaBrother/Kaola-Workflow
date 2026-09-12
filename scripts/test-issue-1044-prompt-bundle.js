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
const MARKER = 'KW-COMPACT-RECOVERY-V2';
const RUNTIMES = ['claude', 'codex', 'grok', 'cursor'];
const FORGES = ['github', 'gitlab', 'gitea'];
// #1054 item 25 (measured, not asserted by this suite as production policy): grok's persistent
// Rule and cursor's alwaysApply Rule are the ONLY always-loaded carrier of the dispatch contract
// on those hosts, so their compact-recovery render keeps the full dispatch/adapter blocks. claude
// and codex recovery instead reloads the complete installed Next/Finalize prompt, which already
// carries dispatch — repeating it in recovery would load it twice, so those two runtimes render a
// one-sentence deferred-note pointer instead. Read from the generator's own export (routing.
// RECOVERY_FULL_DISPATCH_RUNTIMES) rather than duplicating the runtime list by hand.
// Fall back to the pinned target split when the generator does not (yet) export
// RECOVERY_FULL_DISPATCH_RUNTIMES, so this suite runs (and correctly REDs) against the pre-#1054
// baseline instead of throwing.
const FULL_DISPATCH_RUNTIMES = Array.isArray(routing.RECOVERY_FULL_DISPATCH_RUNTIMES)
  ? routing.RECOVERY_FULL_DISPATCH_RUNTIMES : ['grok', 'cursor'];
const DEFERRED_NOTE_PATTERN = /already carries the full runtime dispatch contract/i;

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
const globalContract = read('templates/global/kaola-workflow-global.md').trim();
assert(count(skeleton, '<!-- SLOT:global-workflow-contract -->') === 1,
  'A1: compact skeleton names the machine-global contract slot once');
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
    // The dispatch region marker delimits the dispatch contract itself; a deferred (claude/codex)
    // render legitimately drops the marker along with the content it would otherwise wrap (so a
    // consumer keying on the marker cannot mistake a one-sentence pointer for the real contract).
    // It is required exactly once for an always-loaded carrier, and absent entirely otherwise.
    const expectMarker = FULL_DISPATCH_RUNTIMES.includes(runtime) ? 1 : 0;
    assert(count(prompt, DISPATCH_START) === expectMarker && count(prompt, DISPATCH_END) === expectMarker,
      `B1[${runtime}/${forge}]: dispatch boundary marker count matches this runtime's carrier role (expected ${expectMarker})`);
    assert(prompt.includes(MARKER), `B1[${runtime}/${forge}]: recovery marker is present`);
    if (FULL_DISPATCH_RUNTIMES.includes(runtime)) {
      assert(prompt.includes(dispatch),
        `B2[${runtime}/${forge}]: exact shared dispatch wording is embedded (always-loaded carrier)`);
    } else {
      assert(!prompt.includes(dispatch),
        `B2[${runtime}/${forge}]: the shared dispatch wording is NOT re-embedded — the full Next/Finalize reload already carries it`);
      assert(DEFERRED_NOTE_PATTERN.test(prompt),
        `B2[${runtime}/${forge}]: a deferred-note pointer explains the dispatch contract is not restated`);
      assert(!/Runtime adapter facts/.test(prompt),
        `B2[${runtime}/${forge}]: the runtime-adapter overlay is NOT re-embedded either`);
    }
    assert(count(prompt, globalContract) === 1,
      `B2[${runtime}/${forge}]: exact machine-global contract is reloaded once`);
    assert(!prompt.includes('<!-- SLOT:'),
      `B2[${runtime}/${forge}]: all generation slots are resolved`);
    assert(/completely reload the installed Workflow\s+Next prompt/.test(prompt)
      && /completely\s+reload the installed Kaola-Workflow Finalization prompt/.test(prompt),
      `B3[${runtime}/${forge}]: compact recovery reloads the complete active operation prompt`);
    assert(/Read project `AGENTS\.md`/.test(prompt)
      && /workflow-state\.md/.test(prompt) && /mission-list\.md/.test(prompt),
      `B3[${runtime}/${forge}]: prompt resumes from durable files`);
    assert(!/node\s|\.js\b|PreToolUse|PostToolUse|sidecar|opaque token|chunk bitmap/i.test(prompt),
      `B4[${runtime}/${forge}]: runtime prompt contains no executable prompt machinery`);
    if (FULL_DISPATCH_RUNTIMES.includes(runtime)) {
      // Measured per-runtime ceilings: grok's always-loaded carrier is ~7.9 KB; cursor's carries a
      // ~1.5 KB larger adapter block plus the #1062 single-binding contract and measures ~9.5 KB.
      const ceiling = { grok: 8500, cursor: 10500 }[runtime] || 8500;
      assert(bytes(prompt) >= 6500 && bytes(prompt) <= ceiling,
        `B5[${runtime}/${forge}]: complete static prompt (always-loaded carrier) stays within measured 6.5 KB–${(ceiling / 1000).toFixed(1)} KB budget (got ${bytes(prompt)} B)`);
    } else {
      // claude/codex defer the dispatch/adapter content to the full Next/Finalize reload, so their
      // recovery render is smaller by roughly that content's size; bounded loosely (not pinned to
      // today's exact byte count) so an unrelated future wording tweak doesn't false-positive here.
      assert(bytes(prompt) >= 1500 && bytes(prompt) < 5500,
        `B5[${runtime}/${forge}]: deferred-dispatch prompt is materially smaller than the always-loaded carrier budget (got ${bytes(prompt)} B)`);
    }
  }
}

for (const runtime of RUNTIMES) {
  const github = rendered.get(runtime + ':github');
  if (FULL_DISPATCH_RUNTIMES.includes(runtime)) {
    assert(FORGES.every(forge => rendered.get(runtime + ':' + forge).includes(dispatch)),
      `C1[${runtime}]: all forge renders retain the exact common contract`);
    assert(/Runtime adapter facts/.test(github), `C1[${runtime}]: runtime overlay is present`);
  } else {
    assert(FORGES.every(forge => DEFERRED_NOTE_PATTERN.test(rendered.get(runtime + ':' + forge))),
      `C1[${runtime}]: all forge renders carry the deferred-note pointer instead of the common contract`);
    assert(!/Runtime adapter facts/.test(github), `C1[${runtime}]: no runtime overlay is embedded`);
  }
}
{
  // C2 (revised for #1054 item 25): only the always-loaded-carrier runtimes embed measured
  // per-runtime adapter content, so only THEY are required to differ pairwise. claude and codex
  // now share the same deferred-note path with no runtime-specific content in the recovery render
  // itself (that specificity lives only in the full Next/Finalize reload, covered elsewhere), so
  // asserting they render byte-IDENTICAL prompts is the correct positive claim, not a relaxation.
  const deferredGroup = RUNTIMES.filter(r => !FULL_DISPATCH_RUNTIMES.includes(r));
  assert(new Set(FULL_DISPATCH_RUNTIMES.map(runtime => rendered.get(runtime + ':github'))).size
      === FULL_DISPATCH_RUNTIMES.length,
    'C2: always-loaded-carrier runtime prompts differ where measured adapter capabilities differ');
  assert(new Set(deferredGroup.map(runtime => rendered.get(runtime + ':github'))).size === 1,
    'C2: deferred-dispatch runtimes render byte-identical recovery prompts (no runtime-specific content lives in the deferred path)');
  for (const full of FULL_DISPATCH_RUNTIMES) {
    for (const deferred of deferredGroup) {
      assert(rendered.get(full + ':github') !== rendered.get(deferred + ':github'),
        `C2: ${full} (always-loaded carrier) differs from ${deferred} (deferred)`);
    }
  }
}

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
