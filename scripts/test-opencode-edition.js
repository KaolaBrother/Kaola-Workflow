#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-opencode-edition.js — structural + parity validator for the opencode
// runtime edition. Hand-rolled asserts (no framework), matching the repo's
// existing test style. Run directly:
//   node scripts/test-opencode-edition.js
//
// This is the opencode-edition twin of test-route-reachability.js + edition-sync
// --check, scoped to the additive opencode surface (.opencode/ + opencode.json)
// so it does NOT touch the claude/codex/gitlab/gitea edition machinery.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const sync = require('./sync-opencode-edition.js');

const REPO = sync.REPO;
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(REPO, rel));
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}

// --- JSONC comment stripper (string-aware) so opencode.json parses despite its
// // guidance comments AND the "https://" URL inside $schema. ---
function stripJsonc(text) {
  let out = '';
  let i = 0;
  let inStr = false;
  let strCh = '';
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += next || ''; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function parseFrontmatterKeys(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return [];
  return m[1].split(/\r?\n/).map(l => {
    const mm = l.match(/^([A-Za-z0-9_-]+)\s*:/);
    return mm ? mm[1] : null;
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// A1/A2/A3: agents — every canonical agent is generated, model-agnostic, and
// permission-mapped from its canonical tool set.
// ---------------------------------------------------------------------------
const canonAgents = sync.listCanonAgents();
const genAgentFiles = fs.readdirSync(sync.OUT_AGENT_DIR).filter(f => f.endsWith('.md'));
assert(new Set(genAgentFiles.map(f => f.slice(0, -3))).size === canonAgents.length,
  'A1: .opencode/agent/ count matches canonical agent count (' + canonAgents.length + ')');

for (const name of canonAgents) {
  const rel = '.opencode/agent/' + name + '.md';
  assert(exists(rel), 'A2[' + name + ']: generated agent exists');
  const content = read(rel);
  const keys = parseFrontmatterKeys(content);
  assert(keys.includes('description'), 'A2[' + name + ']: frontmatter has description');
  const fmText = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  assert(/^\s*mode:\s*subagent\s*$/m.test(fmText), 'A2[' + name + ']: mode is subagent');
  assert(!/^\s*model\s*:/.test(fmText),
    'A2[' + name + ']: NO model field (model-agnostic; tier resolved by opencode.json)');
  // read-only permission mapping mirrors the generator's logic.
  const canon = read('agents/' + name + '.md');
  const tools = sync.parseTools(sync.parseFrontmatter(canon).fm.tools);
  const toolSet = new Set(tools.map(t => t.toLowerCase()));
  const readOnly = !toolSet.has('write') && !toolSet.has('edit');
  if (readOnly) {
    assert(/edits*\n*\s*edit:\s*deny/.test(content) || /edit:\s*deny/.test(fmText),
      'A3[' + name + ']: read-only agent denies edit');
  }
}

// ---------------------------------------------------------------------------
// A4/A5: commands — every canonical command is generated and free of the
// install-time model placeholders (models are centralized in opencode.json).
// ---------------------------------------------------------------------------
const canonCommands = sync.listCanonCommands();
const genCommandFiles = fs.readdirSync(sync.OUT_COMMAND_DIR).filter(f => f.endsWith('.md'));
assert(new Set(genCommandFiles).size === canonCommands.length,
  'A4: .opencode/command/ count matches canonical command count (' + canonCommands.length + ')');
for (const file of canonCommands) {
  const rel = '.opencode/command/' + file;
  assert(exists(rel), 'A4[' + file + ']: generated command exists');
  const content = read(rel);
  assert(!/model="\{/.test(content),
    'A5[' + file + ']: no install-time model="{...}" placeholders remain');
}

// ---------------------------------------------------------------------------
// A14: model-prose consistency. opencode centralizes effort in opencode.json (no per-call
// model=), so EVERY surviving `model=` mention must be the "do NOT / Never pass" guidance —
// none of the Claude "pass model=" instructions, no doubled-commanda card artifacts. This
// locks the transformCommandBody rewrites (badge + plan-run + review-fix + "You MUST pass").
// ---------------------------------------------------------------------------
for (const file of canonCommands) {
  const content = read('.opencode/command/' + file);
  assert(!/Pass `model=dispatch\.model`/.test(content),
    'A14[' + file + ']: no "Pass model=dispatch.model" instruction (opencode resolves centrally)');
  assert(!/include\s+the\s+explicit `model=` parameter/.test(content),
    'A14[' + file + ']: no "include the explicit model= parameter" instruction');
  assert(!/MUST pass `model=|do not omit\s+the `model=` line/.test(content),
    'A14[' + file + ']: no "MUST pass model=" / "do not omit the model= line" instruction');
  assert(!/,,/.test(content),
    'A14[' + file + ']: no doubled-comma (,,) artifact from dispatch-card placeholder strip');
}

// ---------------------------------------------------------------------------
// A6: parity — regenerating from canonical reproduces every committed file
// byte-for-byte (the edition-sync invariant, applied to the opencode tree).
// ---------------------------------------------------------------------------
for (const name of canonAgents) {
  const expected = sync.renderAgent(read('agents/' + name + '.md'), name);
  assert(read('.opencode/agent/' + name + '.md') === expected,
    'A6[' + name + ']: generated agent in parity with canonical (run --write to fix)');
}

// A13: the workflow-planner ADOPTS adaptive effort selection — its opencode-edition body
// carries the mapTier guidance (effort tiers), and ONLY it does (other agents stay verbatim).
assert(read('.opencode/agent/workflow-planner.md').includes('mapTier'),
  'A13: workflow-planner opencode body carries the mapTier effort-tier guidance');
assert(/effort[- ]tier/i.test(read('.opencode/agent/workflow-planner.md')),
  'A13: workflow-planner opencode body names the effort tiers');
assert(!read('.opencode/agent/contractor.md').includes('mapTier'),
  'A13: non-planner agents stay verbatim (no mapTier guidance)');
assert(sync.opencodeAgentSuffix('workflow-planner').includes('mapTier')
  && sync.opencodeAgentSuffix('contractor') === '',
  'A13: opencodeAgentSuffix is non-empty only for workflow-planner');
for (const file of canonCommands) {
  const expected = sync.renderCommand(read('commands/' + file));
  assert(read('.opencode/command/' + file) === expected,
    'A6[' + file + ']: generated command in parity with canonical (run --write to fix)');
}

// ---------------------------------------------------------------------------
// A7/A8: opencode.json — valid JSONC, schema-pinned, default_agent "build", and
// byte-for-byte parity with the generator. The generator DEFAULTS to pinning
// NOTHING, so on a fresh install BOTH tiers inherit the model the user is
// already using in opencode (no provider is hard-coded); pins are opt-in.
// ---------------------------------------------------------------------------
assert(exists('opencode.json'), 'A7: opencode.json exists');
let cfg;
try {
  cfg = JSON.parse(stripJsonc(read('opencode.json')));
} catch (e) {
  assert(false, 'A7: opencode.json is valid JSONC — ' + e.message);
  cfg = {};
}
assert(cfg.$schema === 'https://opencode.ai/config.json', 'A7: $schema pinned to opencode config schema');
assert(cfg.default_agent === 'build', 'A7: default_agent is "build"');
// Committed file must equal what the generator produces under the current env
// (catches template drift / hand-edit divergence).
assert(read('opencode.json') === sync.renderOpencodeJson(),
  'A7: committed opencode.json is byte-equal to renderOpencodeJson() (regenerate via --write-config)');

function parseRendered(opts) {
  return JSON.parse(stripJsonc(sync.renderOpencodeJson(opts)));
}

// A8 (default): no pins ⇒ BOTH tiers inherit the user default — no top-level
// "model", no "agent" block. No provider is hard-coded on a fresh install.
const def = parseRendered({ standardModel: '', reasoningModel: '' });
assert(def.model === undefined, 'A8: default config pins NO top-level "model" (inherits user default)');
assert(def.agent === undefined, 'A8: default config pins NO "agent" overrides (reasoning inherits user default)');

// A8 (opt-in pin): pinning both tiers yields a provider/model string + an agent
// block covering EXACTLY the canonical opus roles.
const reasoning = sync.reasoningRoles();
const pinned = parseRendered({ standardModel: 'test/std', reasoningModel: 'test/reas' });
assert(pinned.model === 'test/std', 'A8: pinned standard tier carries the given provider/model');
const pinnedReasoning = Object.keys(pinned.agent || {}).sort();
assert(JSON.stringify(pinnedReasoning) === JSON.stringify(reasoning),
  'A8: pinned reasoning overrides cover EXACTLY the canonical opus roles (' + reasoning.join(', ') + '); got [' + pinnedReasoning.join(', ') + ']');
for (const role of reasoning) {
  assert(pinned.agent[role].model === 'test/reas',
    'A8[' + role + ']: pinned reasoning tier carries the given provider/model');
}

// ---------------------------------------------------------------------------
// A12: adaptive effort tiers (the locked-in install default). With an explicit
// inherited model whose provider is in PROVIDER_EFFORT_TABLE, renderOpencodeJson
// emits the two-tier EFFORT-VARIANT config: top-tier roles (canonical opus ∪ the
// Claude Code "higher" profile roles) get the provider's TOP variant; standard
// roles get its SECOND variant. The per-tier variant names are provider-relative
// (mapTier). Unknown provider → neutral template (degrade). NODE_MODEL_TIERS
// {opus,sonnet} stays the portable plan vocabulary; this only resolves a tier.
// ---------------------------------------------------------------------------
const topRoles = sync.topTierRoles();
const stdRoles = sync.standardTierRoles();
assert(topRoles.length > reasoning.length,
  'A12: topTierRoles() adds the higher-profile roles on top of the opus roles');
for (const role of ['code-architect', 'code-reviewer', 'security-reviewer']) {
  assert(topRoles.includes(role), 'A12: higher-profile role ' + role + ' is on the top tier');
}

// GLM-5.2 (zhipu): top=max, second=high.
const glm = parseRendered({ inheritModel: 'zhipuai-coding-plan/glm-5.2' });
assert(glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.max
  && glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.high,
  'A12: glm-5.2 defines top=max + second=high variants');
for (const role of topRoles) {
  assert(glm.agent[role].variant === 'max', 'A12[' + role + ']: top-tier role → max variant');
}
for (const role of stdRoles) {
  assert(glm.agent[role].variant === 'high', 'A12[' + role + ']: standard-tier role → high variant');
}

// OpenAI: top=xhigh, second=high (provider-relative — same tier ranks, different names).
const oai = parseRendered({ inheritModel: 'openai/gpt-5' });
assert(Object.keys(oai.provider.openai.models['gpt-5'].variants).sort().join('/') === 'high/xhigh',
  'A12: openai maps top=xhigh, second=high');
assert(oai.agent.planner.variant === 'xhigh' && oai.agent.contractor.variant === 'high',
  'A12: openai top-tier → xhigh, standard-tier → high');

// Unknown provider degrades to the neutral template (no provider/agent variant blocks).
const unk = parseRendered({ inheritModel: 'acme/unknown-model' });
assert(unk.provider === undefined && unk.agent === undefined,
  'A12: unknown provider degrades to the neutral template');

// ---------------------------------------------------------------------------
// A9: route-reachability — every receipt-emitted command target resolves to an
// installed opencode command surface (the #400 guarantee, for the opencode
// edition). Mirrors test-route-reachability.js T2, scoped to .opencode/command.
// ---------------------------------------------------------------------------
const schema = require('./kaola-workflow-adaptive-schema.js');
const stripSlash = c => c.replace(/^\//, '');
const emittedCommandTargets = [
  stripSlash(schema.PLAN_RUN_COMMAND),
  stripSlash(schema.ADAPT_COMMAND),
  stripSlash(schema.AUTO_COMMAND),
  'kaola-workflow-fast',
  'kaola-workflow-phase1'
];
const installed = new Set(genCommandFiles.map(f => f.slice(0, -3)));
for (const target of emittedCommandTargets) {
  assert(installed.has(target),
    'A9: receipt-emitted command target "/' + target + '" resolves to .opencode/command/' + target + '.md');
}

// ---------------------------------------------------------------------------
// A10: hooks — every runtime-neutral hook script is deployed under
// .opencode/hooks/ byte-identical to canonical hooks/, so the adapter plugin and
// the canonical edition share ONE source of truth (no logic drift).
// ---------------------------------------------------------------------------
for (const script of sync.HOOK_SCRIPTS) {
  const rel = '.opencode/hooks/' + script;
  assert(exists(rel), 'A10[' + script + ']: hook deployed under .opencode/hooks/');
  if (exists(rel)) {
    assert(read(rel) === read('hooks/' + script),
      'A10[' + script + ']: byte-identical to canonical hooks/' + script);
  }
}

// ---------------------------------------------------------------------------
// A11: hooks adapter plugin — present and syntactically valid (opencode loads
// .opencode/plugins/*.js at startup; a syntax error would break the session).
// ---------------------------------------------------------------------------
const pluginRel = '.opencode/plugins/kaola-workflow-hooks.js';
assert(exists(pluginRel), 'A11: hooks adapter plugin deployed at ' + pluginRel);
if (exists(pluginRel)) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, ['--check', path.join(REPO, pluginRel)], { encoding: 'utf8' });
  assert(r.status === 0, 'A11: hooks adapter plugin passes node --check' + (r.stderr ? ' — ' + r.stderr.trim() : ''));
  const src = read(pluginRel);
  // Couple the plugin to the same hook scripts asserted in A10 (no silent rename drift).
  for (const script of sync.HOOK_SCRIPTS) {
    assert(src.includes(script), 'A11: plugin references hook script ' + script);
  }
  assert(src.includes('tool.execute.before') && src.includes('experimental.session.compacting'),
    'A11: plugin registers tool.execute.before + compaction hooks');
}

if (failed) {
  console.error('\nopencode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('opencode-edition test passed (' + passed + ' assertions).');
