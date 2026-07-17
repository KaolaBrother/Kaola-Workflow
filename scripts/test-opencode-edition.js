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
const schema = require('./kaola-workflow-adaptive-schema.js');
const reviewerGenerator = require('./generate-reviewer-profiles.js');

const REPO = sync.REPO;
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(REPO, rel));
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}

// ---------------------------------------------------------------------------
// Self-provision: regenerate .opencode/ from tracked canonical sources before
// any assertion that reads it. In a clean worktree .opencode/ is fully absent
// (it is gitignored); sync --write populates agents, commands, hooks, AND the
// plugin from templates/opencode/plugins/. This makes the suite green from
// tracked sources alone with no manual seeding.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), '--write'],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('FATAL: sync-opencode-edition --write failed (test cannot proceed):');
    console.error(r.stderr || r.stdout || '(no output)');
    process.exit(1);
  }
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

// Reviewer contracts retain deterministic normalized behavior identity through the OpenCode
// transform. This is a contract/profile assertion only: foundation-model findings and prose remain
// stochastic and are never promised to match across runtimes.
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const opencodeText = read('.opencode/agent/' + role + '.md');
  const opencode = reviewerGenerator.behaviorIdentityFromCore(opencodeText);
  assert(opencode.role === canonical.role
    && opencode.behavior_contract_version === canonical.behavior_contract_version
    && opencode.behavior_contract_hash === canonical.behavior_contract_hash,
  `A6-reviewer[${role}]: OpenCode agent retains normalized reviewer behavior identity`);
  assert(opencode.core === canonical.core,
    `A6-reviewer[${role}]: OpenCode transform preserves reviewer behavior-core bytes`);
  // #708: the opencode reviewer profile carries its OWN re-stamped resolved_profile_hash (over the
  // transformed opencode bytes), so resolveReviewerProfileIdentity can bind schema-2 review receipts
  // to the exact profile bytes that produced them. The hash must be present, valid (verifyResolved
  // ProfileHash throws on mismatch), and DIFFERENT from the Claude hash (the bytes differ). Without
  // it, every review-gated adaptive plan on opencode hard-refuses at open-next with
  // review_profile_identity_unavailable.
  const ocHash = (opencodeText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(ocHash && /^[0-9a-f]{64}$/.test(ocHash),
    `A6-reviewer[${role}]: OpenCode reviewer carries a valid resolved_profile_hash`);
  reviewerGenerator.verifyResolvedProfileHash(opencodeText);
  const clHash = (read('agents/' + role + '.md').match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(ocHash !== clHash,
    `A6-reviewer[${role}]: OpenCode resolved_profile_hash is re-stamped over opencode bytes (differs from Claude)`);
  // The behavior_contract_version/hash in the opencode frontmatter must match the canonical source
  // (runtime-neutral identity, not bytes — so it survives the frontmatter transform).
  assert(new RegExp('^behavior_contract_version:\\s*' + canonical.behavior_contract_version + '\\s*$', 'm').test(opencodeText),
    `A6-reviewer[${role}]: OpenCode frontmatter carries behavior_contract_version`);
  assert(new RegExp('^behavior_contract_hash:\\s*' + canonical.behavior_contract_hash + '\\s*$', 'm').test(opencodeText),
    `A6-reviewer[${role}]: OpenCode frontmatter carries behavior_contract_hash`);
  assert(!/(?:identical|same|byte-identical)[^\n]{0,80}(?:model output|findings|verdict|review output)/i.test(opencodeText),
    `A6-reviewer[${role}]: OpenCode agent makes no stochastic-output-identity claim`);
}

// #708: end-to-end — resolveReviewerProfileIdentity(role, { reviewRuntime: 'opencode' }) must return
// ok against the installed .opencode/agent/ profile, with a resolved_profile_hash matching the file.
// This is the exact call that hard-blocked every review-gated plan on opencode (review_profile_
// unavailable / review_profile_identity_unavailable). CWD is the repo root, so the project candidate
// (.opencode/agent/<role>.md) is the first probe path and must resolve.
const adaptiveNode = require('./kaola-workflow-adaptive-node');
for (const role of reviewerGenerator.ROLES) {
  const identity = adaptiveNode.resolveReviewerProfileIdentity(role, { reviewRuntime: 'opencode' });
  assert(identity.ok === true,
    `#708[${role}]: resolveReviewerProfileIdentity(opencode) must succeed (got ${identity.reason})`);
  const fileHash = (read('.opencode/agent/' + role + '.md')
    .match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(identity.resolved_profile_hash === fileHash,
    `#708[${role}]: resolved_profile_hash must match the installed profile file`);
  assert(identity.runtime === 'opencode',
    `#708[${role}]: identity runtime is opencode`);
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
// A24 (#572): the generated opencode workflow-init carries the re-grounded adaptive
// ## Kaola-Workflow template — phase-free (no retired numbered-phase model, no
// "phase file/artifact" framing) AND in parity with the canonical GitHub template
// MODULO the runtime-noun transform (Claude Code agents → subagents). .opencode/ is
// fully gitignored, so the four-chain contract validators must not read it — this is
// the opencode-edition home for the #572 ban + parity (regenerate via --write).
// ---------------------------------------------------------------------------
{
  const TPL_START = '<!-- KW-CLAUDE-TEMPLATE-START -->';
  const TPL_END = '<!-- KW-CLAUDE-TEMPLATE-END -->';
  const extractTemplate = (text, label) => {
    const s = text.indexOf(TPL_START);
    const e = text.indexOf(TPL_END);
    assert(s !== -1 && e !== -1 && e > s,
      'A24[' + label + ']: KW-CLAUDE-TEMPLATE-START/END markers present');
    return (s !== -1 && e > s) ? text.slice(s + TPL_START.length, e).trim() : '';
  };
  const ocTpl = extractTemplate(read('.opencode/command/workflow-init.md'), 'opencode');
  // Phase-ban (mirror validate-kaola-workflow-contracts.js #572 AC4).
  assert(!/Phase\s+\d/.test(ocTpl),
    'A24 (#572): opencode workflow-init template must not teach a numbered Phase <n> model (adaptive is the unconditional default)');
  assert(!/phase file|phase artifact/i.test(ocTpl),
    'A24 (#572): opencode workflow-init template must not use "phase file/artifact" durable-state framing');
  // Parity modulo the runtime-noun transform: the opencode template equals the canonical
  // GitHub template with "Claude Code agent(s)" rewritten to "subagent(s)" (the sole template-
  // region rewrite transformCommandBody applies; see sync-opencode-edition.js).
  const canonTpl = extractTemplate(read('commands/workflow-init.md'), 'canonical-github');
  const canonTplRuntime = canonTpl.replace(/\bClaude Code agent(s?)\b/g, 'subagent$1');
  assert(ocTpl === canonTplRuntime,
    'A24 (#572): opencode workflow-init template is in parity with the canonical GitHub template modulo the runtime-noun transform (Claude Code agents → subagents)');
}

// ---------------------------------------------------------------------------
// A25: PROVENANCE_BAN — opencode prompt mirrors (.opencode/agent/*.md,
// .opencode/command/*.md) must not embed provenance tokens (#NNN issue refs,
// D-NNN-NN decision IDs, bare INV-NN invariant tags, ADR citations, PR/MR/AC#
// refs). Provenance belongs in CHANGELOG.md and docs/decisions/, never in
// dispatch-time prompt text. Positive-behavior assertions (guard catches the
// banned forms) and negative-behavior assertions (guard allows placeholders and
// grey-zone audit labels) are inlined here. See docs/conventions.md.
// ---------------------------------------------------------------------------
{
  const PROVENANCE_BAN = /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/;

  // Positive: guard MUST match these banned forms.
  assert(PROVENANCE_BAN.test('#123'),     'A25-pos: PROVENANCE_BAN must catch #123');
  assert(PROVENANCE_BAN.test('#42'),      'A25-pos: PROVENANCE_BAN must catch #42');
  assert(PROVENANCE_BAN.test('D-100-01'),'A25-pos: PROVENANCE_BAN must catch D-100-01');
  assert(PROVENANCE_BAN.test('INV-9'),   'A25-pos: PROVENANCE_BAN must catch INV-9');
  assert(PROVENANCE_BAN.test('INV-17'),  'A25-pos: PROVENANCE_BAN must catch INV-17');
  assert(PROVENANCE_BAN.test('ADR 0005'),'A25-pos: PROVENANCE_BAN must catch ADR 0005');
  assert(PROVENANCE_BAN.test('ADR-0005'),'A25-pos: PROVENANCE_BAN must catch ADR-0005');

  // Negative: guard must NOT match these allowed forms.
  assert(!PROVENANCE_BAN.test('#N'),           'A25-neg: PROVENANCE_BAN must allow #N placeholder');
  assert(!PROVENANCE_BAN.test('#<issue>'),     'A25-neg: PROVENANCE_BAN must allow #<issue> placeholder');
  assert(!PROVENANCE_BAN.test('#<n>'),         'A25-neg: PROVENANCE_BAN must allow #<n> placeholder');
  assert(!PROVENANCE_BAN.test('KAOLA_TARGET_ISSUE=N'),  'A25-neg: PROVENANCE_BAN must allow KAOLA_TARGET_ISSUE=N');
  assert(!PROVENANCE_BAN.test('--target-issue <N>'),    'A25-neg: PROVENANCE_BAN must allow --target-issue <N>');
  assert(!PROVENANCE_BAN.test('Closes #<issue>'),       'A25-neg: PROVENANCE_BAN must allow Closes #<issue>');
  assert(!PROVENANCE_BAN.test('G1'),  'A25-neg: PROVENANCE_BAN must not flag grey-zone label G1');
  assert(!PROVENANCE_BAN.test('G3'),  'A25-neg: PROVENANCE_BAN must not flag grey-zone label G3');
  assert(!PROVENANCE_BAN.test('AC7'), 'A25-neg: PROVENANCE_BAN must not flag grey-zone label AC7');
  assert(!PROVENANCE_BAN.test('M4'),  'A25-neg: PROVENANCE_BAN must not flag grey-zone label M4');

  // Surface scan: generated opencode agent + command mirrors must be provenance-free.
  const ocAgentFiles = fs.readdirSync(sync.OUT_AGENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => '.opencode/agent/' + f);
  const ocCommandFiles = fs.readdirSync(sync.OUT_COMMAND_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => '.opencode/command/' + f);
  for (const rel of [...ocAgentFiles, ...ocCommandFiles]) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(PROVENANCE_BAN);
      if (m) {
        assert(false,
          'A25: ' + rel + ':' + (i + 1) + ': PROVENANCE_BAN — provenance token "' + m[0] +
          '" must not appear in opencode prompt surfaces; see docs/conventions.md');
      }
    }
  }
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
// inherited model whose provider resolves under a CONTRACT_EFFORT_TABLE contract,
// renderOpencodeJson emits the two-tier EFFORT-VARIANT config: top-tier roles
// (canonical opus ∪ the Claude Code "higher" profile roles) get the provider's
// TOP variant; standard roles get its SECOND variant. The per-tier variant names
// are provider-relative (mapTier). Unknown provider → safe DEFAULT contract (NO
// de-tier). NODE_MODEL_TIERS {opus,sonnet} stays the portable plan vocabulary;
// this only resolves a tier.
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
// S1 (FLIPPED #544): GLM-5.2 via z.ai is served under the ANTHROPIC API contract, so its
// effort options MUST be the `thinking` budget shape — NOT reasoningEffort. Variant NAMES
// stay max/high (contract-keying flips only the OPTIONS payload, per the #544 invariant).
const glmMax = glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.max;
assert(glmMax.thinking && glmMax.thinking.type === 'enabled' && glmMax.thinking.budgetTokens === 32000,
  'S1: glm-5.2 max variant carries thinking {type:"enabled",budgetTokens:32000} (Anthropic contract), got ' + JSON.stringify(glmMax));
assert(glmMax.reasoningEffort === undefined,
  'S1: glm-5.2 max variant does NOT carry reasoningEffort (Anthropic contract → thinking budget)');
const glmHigh = glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.high;
assert(glmHigh.thinking && glmHigh.thinking.budgetTokens === 16000,
  'S1: glm-5.2 high variant carries thinking budgetTokens:16000');

// ---------------------------------------------------------------------------
// S1-contract (#544): the contract-keyed resolver. effortForProvider now keys on
// the provider's API CONTRACT, not its brand name; contractForProvider maps a
// provider id to {anthropic|openai|google|default}. GLM-via-z.ai → anthropic
// (thinking budget). Unknown provider → safe default (NO de-tier). Falsy stays
// null (backward-compat for the no-provider claude/codex dispatch path).
// ---------------------------------------------------------------------------
const glmProfile = schema.effortForProvider('zhipuai-coding-plan');
assert(glmProfile && glmProfile.top.options.thinking && !glmProfile.top.options.reasoningEffort,
  'S1-contract[glm]: effortForProvider(zhipuai-coding-plan) → anthropic-contract thinking (not reasoningEffort)');
assert(glmProfile.top.variant === 'max' && glmProfile.second.variant === 'high',
  'S1-contract[glm]: variant NAMES stay max/high (contract-keying flips OPTIONS, not names)');
assert(schema.contractForProvider('zhipuai-coding-plan') === 'anthropic'
  && schema.contractForProvider('zai') === 'anthropic'
  && schema.contractForProvider('zhipu-glm') === 'anthropic',
  'S1-contract[glm]: contractForProvider resolves zhipu/zai/zhipu-glm → anthropic');

const oaiProfile = schema.effortForProvider('openai');
assert(oaiProfile && oaiProfile.top.options.reasoningEffort === 'xhigh' && !oaiProfile.top.options.thinking,
  'S1-contract[openai]: top → reasoningEffort xhigh (no thinking)');
assert(schema.contractForProvider('openai') === 'openai' && schema.contractForProvider('gpt-5') === 'openai',
  'S1-contract[openai]: contractForProvider(openai|gpt-5) → openai');

const googProfile = schema.effortForProvider('google');
assert(googProfile && googProfile.top.options.reasoningEffort === 'high'
  && googProfile.second.options.reasoningEffort === 'low',
  'S1-contract[google]: top reasoningEffort high, second low');
assert(schema.contractForProvider('google') === 'google' && schema.contractForProvider('gemini-2.5-pro') === 'google',
  'S1-contract[google]: contractForProvider(google|gemini-2.5-pro) → google');

const unkProfile = schema.effortForProvider('acme-corp');
assert(unkProfile !== null && unkProfile.top.variant !== unkProfile.second.variant,
  'S1-contract[unknown]: effortForProvider(acme-corp) non-null + top≠second (safe default, NO de-tier)');
assert(schema.contractForProvider('acme-corp') === 'default',
  'S1-contract[unknown]: contractForProvider(acme-corp) === default');

assert(schema.effortForProvider(null) === null && schema.effortForProvider('') === null,
  'S1-contract[falsy]: effortForProvider(null|<empty>) === null (backward-compat, NOT default)');

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

// A12 (FLIPPED #544): unknown provider NO LONGER degrades — it gets the safe-DEFAULT
// contract (high/medium), so a top/second split is preserved instead of collapsing.
const unk = parseRendered({ inheritModel: 'acme/unknown-model' });
assert(unk.provider !== undefined && unk.agent !== undefined,
  'A12: unknown provider emits a safe-default provider+agent block (NO de-tier)');
assert(unk.provider.acme.models['unknown-model'].variants.high
  && unk.provider.acme.models['unknown-model'].variants.medium,
  'A12: unknown provider gets default-contract high/medium variants');
assert(unk.agent.planner.variant === 'high' && unk.agent.contractor.variant === 'medium',
  'A12: unknown provider → default contract (planner=high, contractor=medium)');

// ---------------------------------------------------------------------------
// A9: route-reachability — every receipt-emitted command target resolves to an
// installed opencode command surface (the #400 guarantee, for the opencode
// edition). Mirrors test-route-reachability.js T2, scoped to .opencode/command.
// ---------------------------------------------------------------------------
const stripSlash = c => c.replace(/^\//, '');
const emittedCommandTargets = [
  stripSlash(schema.PLAN_RUN_COMMAND),
  stripSlash(schema.ADAPT_COMMAND),
  'kaola-workflow-fast',
  'kaola-workflow-phase1'
];
const installed = new Set(genCommandFiles.map(f => f.slice(0, -3)));
for (const target of emittedCommandTargets) {
  assert(installed.has(target),
    'A9: receipt-emitted command target "/' + target + '" resolves to .opencode/command/' + target + '.md');
}

// ---------------------------------------------------------------------------
// A15–A21: content-reachability — the generated opencode commands must carry
// the PIN/CARD comments AND their companion wiring literals that a
// transformCommandBody edit could silently strip. A9 only checks file EXISTENCE
// and A6 only compares generated↔renderer (both mutate together), so NEITHER
// catches a present-but-hollow command. This block mirrors test-route-
// reachability.js T5–T11 (which enforce the same contract on the 3 Claude
// commands + 3 Codex SKILLs), scoped to the single opencode surface per command
// under .opencode/command/. Each pair asserts BOTH the PIN/CARD marker AND the
// wiring literal — fail-closed, unconditional assert() per surface, NO self-
// disarming anyHasPin gate (the T5 known-bug pattern from #505 ITEM 2 that we
// explicitly do not replicate). GREEN on arrival — characterization/lock-in.
// ---------------------------------------------------------------------------
{
  const cmdBody = name => read('.opencode/command/' + name + '.md');
  const has = (name, tok) => cmdBody(name).includes(tok);

  // A15 (mirror T5): plan-run carries the frontier-unit PIN + literal (n9-prose-skeleton).
  assert(has('kaola-workflow-plan-run', '<!-- PIN: frontier unit -->'),
    'A15: plan-run must contain <!-- PIN: frontier unit --> comment');
  assert(has('kaola-workflow-plan-run', 'frontier unit'),
    'A15: plan-run must contain "frontier unit" literal');

  // A16 (mirror T6): finalize carries the closure-audit PIN + literal (#496/#497).
  assert(has('kaola-workflow-finalize', '<!-- PIN: closure-audit -->'),
    'A16: finalize must contain <!-- PIN: closure-audit --> comment');
  assert(has('kaola-workflow-finalize', 'closure-audit'),
    'A16: finalize must contain "closure-audit" literal');

  // A17 (mirror T7): adapt + auto carry the claim-escalate PIN + result:escalate literal (#495).
  for (const name of ['kaola-workflow-adapt']) {
    assert(has(name, '<!-- PIN: claim-escalate -->'),
      'A17[' + name + ']: must contain <!-- PIN: claim-escalate --> comment');
    assert(has(name, 'result: escalate'),
      'A17[' + name + ']: must contain "result: escalate" literal');
  }

  // A18 (mirror T8): plan-run carries the leg-isolation-recipe PIN + --write-overlap-consent literal (#500 L2).
  assert(has('kaola-workflow-plan-run', '<!-- PIN: leg-isolation-recipe -->'),
    'A18: plan-run must contain <!-- PIN: leg-isolation-recipe --> comment');
  assert(has('kaola-workflow-plan-run', '--write-overlap-consent'),
    'A18: plan-run must contain "--write-overlap-consent" literal');

  // A19 (mirror T9): plan-run carries the speculative-open CARD + --speculative-consent literal (#500 L3).
  assert(has('kaola-workflow-plan-run', '<!-- CARD: speculative-open -->'),
    'A19: plan-run must contain <!-- CARD: speculative-open --> comment');
  assert(has('kaola-workflow-plan-run', '--speculative-consent'),
    'A19: plan-run must contain "--speculative-consent" literal');

  // A20 (mirror T10): fast + finalize carry the fast-compliance-backstop PIN + fast_compliance_unresolved literal (#504).
  for (const name of ['kaola-workflow-fast', 'kaola-workflow-finalize']) {
    assert(has(name, '<!-- PIN: fast-compliance-backstop -->'),
      'A20[' + name + ']: must contain <!-- PIN: fast-compliance-backstop --> comment');
    assert(has(name, 'fast_compliance_unresolved'),
      'A20[' + name + ']: must contain "fast_compliance_unresolved" literal');
  }

  // A21 (mirror T11): phase1 + fast carry the adaptive-default-contract PIN + the named-but-not-installed-path
  // refusal literal. #538 retired `path_requires_explicit_opt_in` -> `path_not_installed` (adaptive is the
  // unconditional default; reaching fast/full requires an install opt-in, refused at the claim front door with
  // `path_not_installed`). The generated opencode commands must carry the new literal (#515/#538).
  for (const name of ['kaola-workflow-phase1', 'kaola-workflow-fast']) {
    assert(has(name, '<!-- PIN: adaptive-default-contract -->'),
      'A21[' + name + ']: must contain <!-- PIN: adaptive-default-contract --> comment');
    assert(has(name, 'path_not_installed'),
      'A21[' + name + ']: must contain "path_not_installed" literal (n3-adaptive-default-contract, #515/#538)');
  }
}

// ---------------------------------------------------------------------------
// S2 (issue #537, narrowed by #609): neutral tier labels. Originally scoped to
// generator string constants ONLY (OPENCODE_BADGE_BLOCK's `mapTier` line, the
// transformCommandBody "opus-tier"/"sonnet-tier" rewrite markers, and
// opencodeAgentSuffix) and explicitly TOLERATED Claude "Opus"/"Sonnet" MODEL-name
// prose surviving from canonical bodies (e.g. the workflow-planner "(Opus)" and
// the "Opus-floor synthesizer"). #609 added a pure rewriteClaudeModelNouns()
// rewrite (applied in renderAgent + transformCommandBody) that purges those B2
// sites at generation time, so this guard is now BODY-WIDE: it forbids the
// capitalized proper-noun forms "Opus"/"Sonnet" ANYWHERE in a generated agent or
// command file, not just inside the badge section or the rewrite-marker strings.
// The check stays CASE-SENSITIVE and whole-word, so the B1 exemption — the closed
// plan `model`-column tier tokens (the lowercase `` `opus` ``/`` `sonnet` ``
// mentions in the workflow-planner's "Model assignment" guidance and the
// frozen-plan example row) — is preserved automatically: the canonical
// NODE_MODEL_TIERS {opus,sonnet} stays the cross-edition internal token
// (untouched, and never capitalized).
// ---------------------------------------------------------------------------
{
  // Extract the `## Effort Variant Resolution` badge block (heading line through
  // the line before the next heading) — the Surface-1 locus. null when absent.
  const badgeSection = body => {
    const lines = body.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Effort Variant Resolution\s*$/.test(lines[i])) { start = i; break; }
    }
    if (start < 0) return null;
    const sec = [];
    for (let i = start; i < lines.length; i++) {
      if (i > start && /^#{1,6}\s/.test(lines[i])) break;
      sec.push(lines[i]);
    }
    return sec.join('\n');
  };
  for (const file of canonCommands) {
    const body = read('.opencode/command/' + file);
    // (a) The Effort Variant Resolution section names tiers by ROLE, never by the
    //     Claude nouns opus/sonnet (the mapTier-line leak lived here).
    const sec = badgeSection(body);
    if (sec !== null) {
      assert(!/\bopus\b/i.test(sec) && !/\bsonnet\b/i.test(sec),
        'S2[' + file + ']: Effort Variant Resolution section has no Claude-tier-name (opus/sonnet) leak');
      assert(/reasoning-tier/.test(sec) && /standard-tier/.test(sec),
        'S2[' + file + ']: Effort Variant Resolution section uses neutral tier labels (reasoning-tier/standard-tier)');
    }
    // (b) The three transformCommandBody rewrites emit tier labels in dispatch prose
    //     OUTSIDE the section; "opus-tier"/"sonnet-tier" are unambiguous generator
    //     leak markers (canonical prose never produces them).
    assert(!/\bopus-tier\b/i.test(body) && !/\bsonnet-tier\b/i.test(body),
      'S2[' + file + ']: no opus-tier/sonnet-tier leak in rewrite prose');
  }
  // (c) The planner agent SUFFIX (opencode-only addition) must be neutral. The
  //     planner's verbatim canonical body legitimately keeps {opus,sonnet} as the
  //     cross-edition model-column vocabulary, so assert on the suffix in isolation.
  const suffix = sync.opencodeAgentSuffix('workflow-planner');
  assert(!/\bopus\b/i.test(suffix) && !/\bsonnet\b/i.test(suffix),
    'S2: workflow-planner opencodeAgentSuffix carries no Claude-tier-name (opus/sonnet) leak');
  assert(/reasoning tier|standard tier/i.test(suffix),
    'S2: workflow-planner opencodeAgentSuffix names tiers by role (neutral labels)');

  // (d) #609: body-wide B2 sweep — the narrowed exemption. Every generated agent
  // and command file must carry ZERO capitalized "Opus"/"Sonnet" proper-noun
  // mentions (case-sensitive, whole-word), not just inside the badge section or
  // the generator's own rewrite-marker strings. This is the check the ORIGINAL S2
  // comment (above) used to explicitly tolerate failing on; rewriteClaudeModelNouns()
  // (sync-opencode-edition.js) is what makes it pass now.
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
  const ocAgentRels = fs.readdirSync(sync.OUT_AGENT_DIR).filter(f => f.endsWith('.md')).map(f => '.opencode/agent/' + f);
  const ocCommandRels = fs.readdirSync(sync.OUT_COMMAND_DIR).filter(f => f.endsWith('.md')).map(f => '.opencode/command/' + f);
  for (const rel of [...ocAgentRels, ...ocCommandRels]) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          'S2 (#609): ' + rel + ':' + (i + 1) + ': Claude model noun "' + m[0] +
          '" leaked into generated opencode prose (B2 — use reasoning-tier/standard-tier vocabulary; B1 lowercase `opus`/`sonnet` tier tokens are exempt)');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A22 (issue #539): opencode path-flip. opencode is adaptive-only-default, so the
// canonical "## Startup Step 0a-1 — Path Intent" section (with its
// KAOLA_ENABLE_ADAPTIVE switch-resolution and Branch A/B path-selection prose) and
// the adapt repair-loop "downgrade to full path" / "fall back to full"
// auto-fallback wording are STRIPPED at generation time by transformCommandBody
// (opencode-only — the transform runs solely inside renderCommand; canonical
// commands/*.md are never touched). This locks the strip-transform. Mechanism B
// (generator-only) avoids colliding with #538's in-flight canonical edits.
// ---------------------------------------------------------------------------
{
  const wfNext = read('.opencode/command/workflow-next.md');
  assert(!wfNext.includes('## Startup Step 0a-1 — Path Intent'),
    'A22: workflow-next has NO "## Startup Step 0a-1 — Path Intent" section (stripped at generation; opencode is adaptive-only-default)');
  assert(!wfNext.includes('KAOLA_ENABLE_ADAPTIVE'),
    'A22: workflow-next has NO KAOLA_ENABLE_ADAPTIVE switch-resolution prose (Path Intent section stripped)');
  assert(!/### Branch [AB]\b/.test(wfNext),
    'A22: workflow-next has NO Branch A/B path-selection prose (Path Intent section stripped)');
  // A22 (#540): the inline "(Step 0a-1)" residue survives the Path Intent SECTION strip —
  // post-#538 the "Step 0a-1" step no longer exists, so every literal must be purged from the
  // generated opencode command (3 dangling inline mentions at L72/L159/L464 before #540).
  assert(!wfNext.includes('Step 0a-1'),
    'A22: workflow-next has NO stale "Step 0a-1" inline references (post-#538 the step no longer exists; parentheticals stripped at generation, #540)');
  // A22 (#F7): content-anchored leak canaries. These phrases live ONLY inside the canonical
  // "Path Intent" section body, so their presence in the generated tree would mean the section
  // strip missed (e.g. a canonical renumber that broke a number-keyed match). The strip is now
  // keyed to the "Path Intent" TITLE (sync-opencode-edition.js), and these catch any regression.
  for (const canary of ['path-name verbal escapes', 'fast path', 'full review']) {
    assert(!wfNext.includes(canary),
      'A22 (#F7): workflow-next has NO "' + canary + '" — a Path-Intent-section body literal that would leak only if the title-anchored section strip missed');
  }
  // A23 (#2): the claim dispatch flag must stamp the opencode runtime into workflow-state.md,
  // so the canonical "--runtime claude" is rewritten to "--runtime opencode" at generation time.
  assert(wfNext.includes('--runtime opencode'),
    'A23: workflow-next emits "--runtime opencode" (claim stamps the opencode runtime label, #2)');
  assert(!wfNext.includes('--runtime claude'),
    'A23: workflow-next has NO "--runtime claude" (rewritten to opencode at generation, #2)');

  // A25 (#645): the First Principles axiom POINTER line lives in the shared skeleton body (outside
  // every REGION marker), so it propagates into the generated opencode workflow-next as well. Lock
  // its presence so an opencode regen can never drop the consumer axiom reference.
  assert(wfNext.includes('First Principles axioms'),
    'A25 (#645): opencode workflow-next must carry the First Principles axiom pointer (shared-body reference line)');
  assert(wfNext.includes('never cite one to skip a typed gate'),
    'A25 (#645): opencode workflow-next must carry the axiom tighten-only clause');
  // A26 (#646): the {ISSUE_SCOUT_MODEL} placeholder is a CLAUDE-command-only install token —
  // install.sh renders it, but opencode has no such render step, so the sync transform STRIPS it.
  // It must never survive into the generated opencode surface (an unrendered placeholder would ship
  // as literal dispatch text — the #443/#328 leak class, on the opencode edition).
  assert(!wfNext.includes('ISSUE_SCOUT_MODEL'),
    'A26 (#646): opencode workflow-next must NOT leak the {ISSUE_SCOUT_MODEL} placeholder (stripped by the sync transform)');
  // A27 (#646/R1): token-absence alone (A26) is not enough — the GENERIC {X_MODEL} strip mangles the
  // scout-dispatch paragraph, leaving an empty inline-code span ("Dispatch it with ``") where the
  // placeholder was PLUS an "install time" resolution sentence that is FALSE for opencode (opencode
  // has no install-time render step — it centralizes the tier in opencode.json). The sync transform
  // paragraph-rewrites the whole paragraph to opencode-true wording; assert the mangled residue is
  // gone AND the clean rewrite is present, so a regression in the rewrite reds here (not just A26).
  assert(!/Dispatch it with\s+``/.test(wfNext),
    'A27 (R1): opencode workflow-next must NOT carry the empty inline-code span residue "Dispatch it with ``" (the generic {X_MODEL} strip mangling the scout dispatch)');
  assert(!wfNext.includes('resolved at install time'),
    'A27 (R1): opencode workflow-next must NOT carry the false "resolved at install time" sentence (untrue for opencode — the tier is centralized in opencode.json, not rendered at install)');
  assert(!wfNext.includes('the router does not substitute it'),
    'A27 (R1): opencode workflow-next must NOT carry the command-region "the router does not substitute it" residue (paragraph-rewritten out on the opencode surface)');
  assert(wfNext.includes('Dispatch the read-only issue-scout agent; its effort variant resolves centrally from `opencode.json`'),
    'A27 (R1): opencode workflow-next must carry the opencode-true scout-dispatch rewrite (effort variant resolves centrally from opencode.json)');
  // The generated command surface (post-render at install) must read cleanly too: the reworded
  // scout note drops the dangling "this placeholder" phrasing, which has no referent once
  // install.sh renders {ISSUE_SCOUT_MODEL} to a concrete model (the model above is then in view).
  assert(!read('commands/workflow-next.md').includes('this placeholder'),
    'A27 (obs1): generated commands/workflow-next.md must NOT carry the dangling "this placeholder" phrasing (no referent post-render)');

  // A22 (#F6): the opencode adapt surface must POSITIVELY carry the #538 adaptive-only guard
  // ("NEVER downgrade to fast/full"), and must contain NO fast/full fallback wording that is not
  // immediately NEVER-prefixed. #538 made canonical itself adaptive-only, so this replaces the old
  // (now vacuous) "no 'downgrade to full path'" strip assertions: it fails loud if a future canonical
  // edit reintroduces a REAL fallback escape (in any wording) onto the adaptive-only surface.
  const adapt = read('.opencode/command/kaola-workflow-adapt.md');
  assert(adapt.includes('NEVER downgrade to fast/full'),
    'A22 (#F6): adapt POSITIVELY carries the "NEVER downgrade to fast/full" adaptive-only guard (#538)');
  {
    const fallback = /(?:downgrade to (?:fast\/full|full path)|fall back to (?:fast\/full|full path|full))/g;
    let m; const unguarded = [];
    while ((m = fallback.exec(adapt)) !== null) {
      const pre = adapt.slice(Math.max(0, m.index - 6), m.index);
      if (!/NEVER $/.test(pre)) unguarded.push(m[0]);
    }
    assert(unguarded.length === 0,
      'A22 (#F6): adapt has NO un-NEVER\'d fast/full fallback wording (an automatic path fallback would violate #538) — found: ' + unguarded.join(', '));
  }
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
  const { mkdtempSync, writeFileSync, rmSync } = require('fs');
  const os = require('os');
  // The plugin is ESM (import/export). `node --check` on a .js file needs a
  // nearest package.json with `"type":"module"` to recognize ESM on Node <22.12,
  // and .opencode/package.json is gitignored (production runs under Bun, which
  // auto-detects ESM). Validate against a transient .mjs copy — .mjs is the
  // explicit ESM extension, so node --check parses it as a module on every Node
  // version. Hermetic: no new tracked infra, no .gitignore churn, no execution
  // (--check is syntax-only, the imports do not resolve).
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'opencode-plugin-check-'));
  const tmpMjs = path.join(tmpDir, 'plugin.mjs');
  writeFileSync(tmpMjs, read(pluginRel));
  let r;
  try {
    r = spawnSync(process.execPath, ['--check', tmpMjs], { encoding: 'utf8' });
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* tmp leak; non-fatal */ }
  }
  assert(r.status === 0, 'A11: hooks adapter plugin parses as ESM (node --check on transient .mjs; Node-version-robust)' + (r.stderr ? ' — ' + r.stderr.trim() : ''));
  const src = read(pluginRel);
  // Couple the plugin to the same hook scripts asserted in A10 (no silent rename drift).
  for (const script of sync.HOOK_SCRIPTS) {
    assert(src.includes(script), 'A11: plugin references hook script ' + script);
  }
  assert(src.includes('tool.execute.before') && src.includes('experimental.session.compacting'),
    'A11: plugin registers tool.execute.before + compaction hooks');
}

// ---------------------------------------------------------------------------
// A11-canon: tracked canonical source for the opencode plugin must exist and the
// regenerated .opencode/plugins/ copy must be byte-identical to it, so the gap
// (gitignored plugin with no tracked source) cannot silently reopen.
// ---------------------------------------------------------------------------
{
  const canonPluginRel = 'templates/opencode/plugins/kaola-workflow-hooks.js';
  assert(exists(canonPluginRel),
    'A11-canon: tracked canonical source ' + canonPluginRel + ' exists');
  if (exists(canonPluginRel) && exists('.opencode/plugins/kaola-workflow-hooks.js')) {
    assert(read(canonPluginRel) === read('.opencode/plugins/kaola-workflow-hooks.js'),
      'A11-canon: regenerated .opencode/plugins/kaola-workflow-hooks.js is byte-identical to the tracked template');
  }
}

// ---------------------------------------------------------------------------
// A11-allowlist: --check must reject an unregistered *.js present in
// templates/opencode/plugins/ (set-equality guard, unregistered-on-disk direction).
// Crash-safe: the transient probe is always removed in a finally block so no stray
// file survives even if an assertion throws.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const canonPluginsDir = sync.CANON_PLUGINS_DIR;

  // (a) Positive: the current on-disk set equals PLUGIN_SCRIPTS exactly.
  const onDiskJs = fs.readdirSync(canonPluginsDir).filter(f => f.endsWith('.js')).sort();
  const registeredJs = [...sync.PLUGIN_SCRIPTS].sort();
  assert(JSON.stringify(onDiskJs) === JSON.stringify(registeredJs),
    'A11-allowlist(a): templates/opencode/plugins/ contains EXACTLY the PLUGIN_SCRIPTS set (' +
    JSON.stringify(registeredJs) + ') — got ' + JSON.stringify(onDiskJs));

  // (b) Guard fires: inject a transient unregistered plugin, assert --check exits non-zero
  // and names the offending file and references PLUGIN_SCRIPTS in its output.
  const probeFile = path.join(canonPluginsDir, '__kw_probe_unregistered.js');
  try {
    fs.writeFileSync(probeFile, '// transient probe — must not persist\n');
    const r = spawnSync(process.execPath,
      [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), '--check'],
      { encoding: 'utf8' });
    assert(r.status !== 0,
      'A11-allowlist(b): --check must exit NON-ZERO when an unregistered .js is present in templates/opencode/plugins/');
    const combined = (r.stdout || '') + (r.stderr || '');
    assert(combined.includes('__kw_probe_unregistered.js') && combined.includes('PLUGIN_SCRIPTS'),
      'A11-allowlist(b): --check output must name the unregistered plugin and reference PLUGIN_SCRIPTS — got: ' + combined.slice(0, 400));
  } finally {
    try { fs.unlinkSync(probeFile); } catch (_) { /* best-effort cleanup */ }
  }
}

// ---------------------------------------------------------------------------
// P1–P5 + A (issue #543): install-time opt-in partition for the opencode edition
// (--with-fast / --with-full parity with install.sh) AND the folded #544 Claude
// path-leak fix. Hermetic per sub-case: each provisions its OWN fresh temp HOME
// + temp --target under os.tmpdir() ($TMPDIR), runs the REAL install-opencode.sh,
// then inspects the deployed tree + the seeded ~/.config/kaola-workflow/config.json.
// RED on arrival — the partition is not implemented yet (the installer's header
// at L22–37 explicitly defers #538 parity: "scoped out for now … This installer
// deploys the FULL command set") and the leak is pervasive (kaola_script()
// ships the Claude search path verbatim in every command + contractor +
// workflow-planner). n5-implementer-opencode owns GREEN.
//
// Adaptive-core set per issue #543 (the unconditional default install):
//   kaola-workflow-adapt, kaola-workflow-finalize,
//   kaola-workflow-plan-run, workflow-init, workflow-next.
// Opt-in sets: --with-fast ⇒ {kaola-workflow-fast}; --with-full ⇒ {phase1..phase5}.
// installed_paths canonical order mirrors install.sh L730: [p for p in ("fast","full") if p in paths].
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } = require('fs');
  const os = require('os');

  const INSTALLER = path.join(REPO, 'install-opencode.sh');
  const ADAPTIVE_CORE = [
    'kaola-workflow-adapt', 'kaola-workflow-finalize',
    'kaola-workflow-plan-run', 'workflow-init', 'workflow-next',
  ];
  const FAST_ONLY = ['kaola-workflow-fast'];
  const FULL_ONLY = [
    'kaola-workflow-phase1', 'kaola-workflow-phase2', 'kaola-workflow-phase3',
    'kaola-workflow-phase4', 'kaola-workflow-phase5',
  ];

  // F5: partition exhaustiveness — the canonical command set must be EXACTLY adaptive-core ∪ fast ∪
  // full. Adding a 13th canonical command without assigning it to a partition fails HERE (and the
  // installer now also fails CLOSED on an unrecognized command, so it cannot silently widen the default).
  {
    const canon = sync.listCanonCommands().map(f => f.replace(/\.md$/, '')).sort();
    const partitioned = [...ADAPTIVE_CORE, ...FAST_ONLY, ...FULL_ONLY].sort();
    assert(JSON.stringify(canon) === JSON.stringify(partitioned),
      'F5: canonical commands == adaptive-core ∪ fast ∪ full (assign any new command to a partition) — canon=' + JSON.stringify(canon));
  }

  // Hermetic single-shot installer run. Each call gets its OWN fresh HOME (so
  // seed_kaola_config writes only under $TMPDIR) and its OWN --target (so the
  // .opencode/ tree deploys only under $TMPDIR — never the repo's committed
  // .opencode/, never the real ~). --no-scripts skips copying support scripts
  // into the hermetic ~/.claude/ (orthogonal to the partition; keeps fixtures
  // small and respects the RED-fixture-in-$TMPDIR guard).
  function runInstaller(extraArgs, opts) {
    opts = opts || {};
    const home = opts.home || mkdtempSync(path.join(os.tmpdir(), 'opencode-p-home-'));
    const dest = opts.dest || mkdtempSync(path.join(os.tmpdir(), 'opencode-p-dest-'));
    const args = ['--target', dest, '--yes', '--no-scripts'].concat(extraArgs || []);
    const r = spawnSync('bash', [INSTALLER].concat(args), {
      env: Object.assign({}, process.env, { HOME: home }),
      encoding: 'utf8',
    });
    return {
      ok: r.status === 0,
      status: r.status,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
      home, dest,
      configPath: path.join(home, '.config', 'kaola-workflow', 'config.json'),
    };
  }
  const cmdDir = dest => path.join(dest, '.opencode', 'command');
  const hasCmd = (dest, name) => existsSync(path.join(cmdDir(dest), name + '.md'));
  const readConfig = p => {
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch (_) { return null; }
  };
  const clean = r => {
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(r.dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  };

  // P1 — default install deploys adaptive-core ONLY (no fast, no phase1-5) and
  // seeds installed_paths:[]. Today RED: install-opencode.sh always deploys the
  // FULL command set (12 files incl. fast + phase1-5).
  {
    const r = runInstaller([]);
    assert(r.ok,
      'P1: default install-opencode.sh exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(hasCmd(r.dest, name),
        'P1[' + name + ']: default install deploys the adaptive-core command');
    }
    for (const name of FAST_ONLY) {
      assert(!hasCmd(r.dest, name),
        'P1[' + name + ']: default install does NOT deploy the fast-only command (it is the --with-fast opt-in)');
    }
    for (const name of FULL_ONLY) {
      assert(!hasCmd(r.dest, name),
        'P1[' + name + ']: default install does NOT deploy the full-only phase command (it is the --with-full opt-in)');
    }
    // P1 (#F5): exact-set-equality (over-deploy guard) — the dest command dir holds EXACTLY the 6
    // adaptive-core commands, nothing else (catches a future stray/unpartitioned command leaking in).
    const deployed = readdirSync(cmdDir(r.dest)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
    assert(JSON.stringify(deployed) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'P1 (#F5): default install deploys EXACTLY the adaptive-core set and nothing else — got ' + JSON.stringify(deployed));
    // P1 (#F9): the NON-command surfaces actually land at the project layout opencode resolves
    // (<project>/.opencode/{agent,plugins,hooks}) — not just commands. A missing surface fails here
    // instead of vacuously passing (the leak block below previously `continue`d on a missing dir).
    for (const a of sync.listCanonAgents()) {
      assert(existsSync(path.join(r.dest, '.opencode', 'agent', a + '.md')),
        'P1 (#F9): project install deploys agent ' + a + ' under .opencode/agent/');
    }
    assert(existsSync(path.join(r.dest, '.opencode', 'plugins', 'kaola-workflow-hooks.js')),
      'P1 (#F9): project install deploys the hooks plugin under .opencode/plugins/');
    for (const h of sync.HOOK_SCRIPTS) {
      assert(existsSync(path.join(r.dest, '.opencode', 'hooks', h)),
        'P1 (#F9): project install deploys hook ' + h + ' under .opencode/hooks/');
    }
    const cfg = readConfig(r.configPath);
    assert(cfg !== null,
      'P1: default install seeds ~/.config/kaola-workflow/config.json');
    assert(cfg && Array.isArray(cfg.installed_paths),
      'P1: default install seeds installed_paths as a list');
    assert(cfg && JSON.stringify(cfg.installed_paths) === '[]',
      'P1: default install installed_paths deep-equals [] (adaptive-only, no opt-ins) — got ' + JSON.stringify(cfg && cfg.installed_paths));
    clean(r);
  }

  // P2 — --with-fast deploys fast (+ adaptive-core) and writes installed_paths:["fast"].
  // Today RED: --with-fast is an unknown arg → exit 2, nothing deployed.
  {
    const r = runInstaller(['--with-fast']);
    assert(r.ok,
      'P2: --with-fast install exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(hasCmd(r.dest, name),
        'P2[' + name + ']: --with-fast install still deploys adaptive-core');
    }
    for (const name of FAST_ONLY) {
      assert(hasCmd(r.dest, name),
        'P2[' + name + ']: --with-fast install deploys the fast-only command');
    }
    for (const name of FULL_ONLY) {
      assert(!hasCmd(r.dest, name),
        'P2[' + name + ']: --with-fast does NOT deploy the full-only phase commands');
    }
    const cfg = readConfig(r.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '["fast"]',
      'P2: --with-fast installed_paths deep-equals ["fast"] — got ' + JSON.stringify(cfg && cfg.installed_paths));
    clean(r);
  }

  // P3 — --with-full deploys phase1-5 (+ adaptive-core) and writes installed_paths:["full"].
  // Today RED: --with-full is an unknown arg → exit 2.
  {
    const r = runInstaller(['--with-full']);
    assert(r.ok,
      'P3: --with-full install exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(hasCmd(r.dest, name),
        'P3[' + name + ']: --with-full install still deploys adaptive-core');
    }
    for (const name of FULL_ONLY) {
      assert(hasCmd(r.dest, name),
        'P3[' + name + ']: --with-full install deploys the full-only phase command');
    }
    for (const name of FAST_ONLY) {
      assert(!hasCmd(r.dest, name),
        'P3[' + name + ']: --with-full does NOT deploy the fast-only command');
    }
    const cfg = readConfig(r.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '["full"]',
      'P3: --with-full installed_paths deep-equals ["full"] — got ' + JSON.stringify(cfg && cfg.installed_paths));
    clean(r);
  }

  // P4 — --with-fast --with-full deploys BOTH (adaptive-core ∪ fast ∪ full) and
  // writes installed_paths:["fast","full"] in that canonical order.
  {
    const r = runInstaller(['--with-fast', '--with-full']);
    assert(r.ok,
      'P4: --with-fast --with-full install exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE.concat(FAST_ONLY, FULL_ONLY)) {
      assert(hasCmd(r.dest, name),
        'P4[' + name + ']: --with-fast --with-full deploys every command (adaptive-core ∪ fast ∪ full)');
    }
    const cfg = readConfig(r.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '["fast","full"]',
      'P4: --with-fast --with-full installed_paths deep-equals ["fast","full"] in canonical order — got ' + JSON.stringify(cfg && cfg.installed_paths));
    clean(r);
  }

  // P5 — UNION never removes: install --with-fast once, then BARE re-install
  // (no opt-in flags) into the SAME dest/HOME must PRESERVE installed_paths:["fast"]
  // and the fast command file. Mirrors install.sh EFFECTIVE_FAST/EFFECTIVE_FULL
  // (L215–216: existing opt-ins stay effective across re-installs).
  {
    const r1 = runInstaller(['--with-fast']);
    assert(r1.ok, 'P5: first --with-fast install exits 0');
    // Re-run into the SAME home + dest with NO opt-in flags.
    const r2 = spawnSync('bash',
      [INSTALLER, '--target', r1.dest, '--yes', '--no-scripts'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(r2.status === 0,
      'P5: bare re-install into the same dest/HOME exits 0 (got status ' + r2.status + (r2.stderr ? ' — ' + String(r2.stderr).split('\n')[0] : '') + ')');
    const cfg = readConfig(r1.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '["fast"]',
      'P5: bare re-install PRESERVES installed_paths:["fast"] (UNION never removes) — got ' + JSON.stringify(cfg && cfg.installed_paths));
    for (const name of FAST_ONLY) {
      assert(hasCmd(r1.dest, name),
        'P5[' + name + ']: fast command still deployed after bare re-install (UNION preserves prior opt-ins)');
    }
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // G1 (#F1) — the --global install deploys DIRECTLY under the config root
  // (${OPENCODE_CONFIG_DIR}/{agent,command,plugins,hooks}), NOT a nested
  // .opencode/. opencode scans the config dir itself as its global ".opencode
  // equivalent"; the old nested ~/.config/opencode/.opencode/ was never scanned
  // → the entire global install was dead. Hermetic: own HOME + own
  // OPENCODE_CONFIG_DIR (so it never touches the real ~/.config/opencode).
  // -------------------------------------------------------------------------
  function runGlobalInstaller(extraArgs, opts) {
    opts = opts || {};
    const home = opts.home || mkdtempSync(path.join(os.tmpdir(), 'opencode-g-home-'));
    const cfg = opts.cfg || mkdtempSync(path.join(os.tmpdir(), 'opencode-g-cfg-'));
    const args = ['--global', '--yes'].concat(opts.withScripts ? [] : ['--no-scripts']).concat(extraArgs || []);
    const r = spawnSync('bash', [INSTALLER].concat(args), {
      env: Object.assign({}, process.env, { HOME: home, OPENCODE_CONFIG_DIR: cfg }),
      encoding: 'utf8',
    });
    return {
      ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '',
      home, cfg, configPath: path.join(home, '.config', 'kaola-workflow', 'config.json'),
    };
  }
  {
    const r = runGlobalInstaller([]);
    assert(r.ok, 'G1: --global install exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    // Commands/agents/plugin/hooks land DIRECTLY under the config root.
    for (const name of ADAPTIVE_CORE) {
      assert(existsSync(path.join(r.cfg, 'command', name + '.md')),
        'G1[' + name + ']: --global deploys adaptive-core command at <config>/command/ (un-nested)');
    }
    for (const name of FAST_ONLY.concat(FULL_ONLY)) {
      assert(!existsSync(path.join(r.cfg, 'command', name + '.md')),
        'G1[' + name + ']: --global default does NOT deploy the opt-in command');
    }
    for (const a of sync.listCanonAgents()) {
      assert(existsSync(path.join(r.cfg, 'agent', a + '.md')),
        'G1: --global deploys agent ' + a + ' at <config>/agent/ (un-nested)');
    }
    assert(existsSync(path.join(r.cfg, 'plugins', 'kaola-workflow-hooks.js')),
      'G1: --global deploys the hooks plugin at <config>/plugins/ (opencode global plugin dir)');
    for (const h of sync.HOOK_SCRIPTS) {
      assert(existsSync(path.join(r.cfg, 'hooks', h)),
        'G1: --global deploys hook ' + h + ' at <config>/hooks/ (sibling of the plugin)');
    }
    // The nested ~/.config/opencode/.opencode/ that opencode never scans must NOT exist.
    assert(!existsSync(path.join(r.cfg, '.opencode')),
      'G1 (#F1): --global creates NO nested .opencode/ under the config root (opencode never scans it)');
    // opencode.json lands at the config root.
    assert(existsSync(path.join(r.cfg, 'opencode.json')),
      'G1: --global seeds opencode.json at the config root');
    // G1 (#F1 + #544): the leak invariant must also hold on the GLOBAL layout F1 newly enabled
    // (the project-layout leak block below greps r.dest/.opencode; the global tree lives un-nested
    // under r.cfg and was never under any leak test while the global install was dead).
    {
      let gleaks = 0; const gfiles = [];
      for (const [label, dir] of [
        ['command', path.join(r.cfg, 'command')],
        ['agent', path.join(r.cfg, 'agent')],
        ['plugins', path.join(r.cfg, 'plugins')],
        ['hooks', path.join(r.cfg, 'hooks')],
      ]) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
          let txt; try { txt = readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
          const m = (txt.match(/CLAUDE_PLUGIN_ROOT/g) || []).length + (txt.match(/\.claude\/kaola-workflow/g) || []).length;
          if (m > 0) { gleaks += m; gfiles.push(label + '/' + f + ' (' + m + ')'); }
        }
      }
      assert(gleaks === 0,
        'G1 (#544): ZERO Claude path leaks across the GLOBAL deployed tree — found ' + gleaks + ' in: ' + gfiles.slice(0, 6).join(', '));
    }
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(r.cfg, { recursive: true, force: true }); } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // S1 (#F9) — support scripts land at the opencode-native resolver root
  // (${OPENCODE_CONFIG_DIR}/kaola-workflow/scripts), the dir kaola_script()
  // searches in the deployed commands. Runs a global install WITH scripts.
  // -------------------------------------------------------------------------
  {
    const r = runGlobalInstaller([], { withScripts: true });
    assert(r.ok, 'S1: --global install (with scripts) exits 0 (got status ' + r.status + ')');
    const scriptsDir = path.join(r.cfg, 'kaola-workflow', 'scripts');
    assert(existsSync(scriptsDir), 'S1 (#F9): support scripts dir exists at <config>/kaola-workflow/scripts');
    // Every manifest script for the github forge must be present.
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'S1: install manifest lists at least one support script');
    let missing = [];
    for (const n of names) if (!existsSync(path.join(scriptsDir, n))) missing.push(n);
    assert(missing.length === 0, 'S1 (#F9): all manifest support scripts deployed — missing: ' + missing.slice(0, 5).join(', '));
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(r.cfg, { recursive: true, force: true }); } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // P6 (#F2) — reinstall is SELF-HEALING: after a --with-fast --with-full
  // install, narrowing installed_paths to [] then a BARE reinstall PRUNES the
  // orphaned fast/phase command files (copy_tree was additive-only before).
  // This is the "reset to adaptive-only" half P5 (the UNION-preserve half)
  // does not cover.
  // -------------------------------------------------------------------------
  {
    const r1 = runInstaller(['--with-fast', '--with-full']);
    assert(r1.ok, 'P6: --with-fast --with-full install exits 0');
    for (const name of ADAPTIVE_CORE.concat(FAST_ONLY, FULL_ONLY)) {
      assert(hasCmd(r1.dest, name), 'P6[' + name + ']: opt-in install deploys every command');
    }
    // Narrow the shared config back to adaptive-only (simulates an opt-out / a reset).
    const cfg = readConfig(r1.configPath);
    cfg.installed_paths = [];
    writeFileSync(r1.configPath, JSON.stringify(cfg, null, 2) + '\n');
    // Bare reinstall (no opt-in flags) into the SAME home + dest.
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'P6: bare reinstall after narrowing installed_paths exits 0');
    for (const name of ADAPTIVE_CORE) {
      assert(hasCmd(r1.dest, name), 'P6[' + name + ']: adaptive-core SURVIVES the reset reinstall');
    }
    for (const name of FAST_ONLY.concat(FULL_ONLY)) {
      assert(!hasCmd(r1.dest, name),
        'P6[' + name + '] (#F2): orphaned opt-in command PRUNED by the reset reinstall (copy_tree self-heals)');
    }
    const after = readdirSync(cmdDir(r1.dest)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
    assert(JSON.stringify(after) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'P6 (#F2): reset reinstall converges to EXACTLY the 6 adaptive-core commands — got ' + JSON.stringify(after));
    const cfg2 = readConfig(r1.configPath);
    assert(cfg2 && JSON.stringify(cfg2.installed_paths) === '[]',
      'P6: installed_paths stays [] after the reset reinstall');
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // U1 (#F4) — --uninstall removes the kaola-deployed surface, preserves the
  // user-owned opencode.json, and resets installed_paths:[]; a subsequent bare
  // install returns EXACTLY the 6 adaptive-core commands (round-trip).
  // -------------------------------------------------------------------------
  {
    const r1 = runInstaller(['--with-fast']);
    assert(r1.ok, 'U1: seed install (--with-fast) exits 0');
    assert(hasCmd(r1.dest, 'kaola-workflow-fast'), 'U1: fast command present before uninstall');
    assert(existsSync(path.join(r1.dest, 'opencode.json')), 'U1: opencode.json present before uninstall');
    // Uninstall the same scope.
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(ru.status === 0, 'U1: --uninstall exits 0 (got ' + ru.status + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE.concat(FAST_ONLY)) {
      assert(!hasCmd(r1.dest, name), 'U1[' + name + ']: command removed by --uninstall');
    }
    for (const a of sync.listCanonAgents()) {
      assert(!existsSync(path.join(r1.dest, '.opencode', 'agent', a + '.md')),
        'U1: agent ' + a + ' removed by --uninstall');
    }
    assert(!existsSync(path.join(r1.dest, '.opencode', 'plugins', 'kaola-workflow-hooks.js')),
      'U1: hooks plugin removed by --uninstall');
    assert(existsSync(path.join(r1.dest, 'opencode.json')),
      'U1 (#F4): opencode.json PRESERVED by --uninstall (user-owned model config)');
    const cfg = readConfig(r1.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '[]',
      'U1 (#F4): --uninstall resets installed_paths:[] — got ' + JSON.stringify(cfg && cfg.installed_paths));
    // Round-trip: a fresh install returns the adaptive-only default.
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'U1: reinstall after uninstall exits 0');
    const back = readdirSync(cmdDir(r1.dest)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
    assert(JSON.stringify(back) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'U1 (#F4): uninstall→reinstall returns EXACTLY the 6 adaptive-core commands — got ' + JSON.stringify(back));
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // I1 (#F9) — idempotency: a default install run twice into the same dest/HOME
  // yields a byte-identical .opencode tree + identical opencode.json (proves
  // seed_config preserve-if-absent across reinstall) + unchanged shared config.
  // -------------------------------------------------------------------------
  {
    const snapshot = dest => {
      const out = {};
      const walk = (dir, rel) => {
        if (!existsSync(dir)) return;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const r = rel ? rel + '/' + e.name : e.name;
          if (e.isDirectory()) walk(path.join(dir, e.name), r);
          else { try { out[r] = readFileSync(path.join(dir, e.name), 'utf8'); } catch (_) { out[r] = '<unreadable>'; } }
        }
      };
      walk(path.join(dest, '.opencode'), '.opencode');
      try { out['opencode.json'] = readFileSync(path.join(dest, 'opencode.json'), 'utf8'); } catch (_) {}
      return out;
    };
    const r1 = runInstaller([]);
    assert(r1.ok, 'I1: first default install exits 0');
    const snap1 = snapshot(r1.dest);
    const cfg1 = readFileSync(r1.configPath, 'utf8');
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'I1: second (idempotent) install exits 0');
    const snap2 = snapshot(r1.dest);
    assert(JSON.stringify(Object.keys(snap1).sort()) === JSON.stringify(Object.keys(snap2).sort()),
      'I1 (#F9): reinstall adds/removes NO files in the deployed tree');
    let drift = [];
    for (const k of Object.keys(snap1)) if (snap1[k] !== snap2[k]) drift.push(k);
    assert(drift.length === 0, 'I1 (#F9): reinstall leaves every deployed file byte-identical — drifted: ' + drift.slice(0, 5).join(', '));
    assert(readFileSync(r1.configPath, 'utf8') === cfg1, 'I1: shared config unchanged across idempotent reinstall');
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // H1 (#F3) — direct unit assertion of hookPath's GLOBAL resolution. The
  // plugin (an ESM module) exports hookPath for test only; an ESM harness imports
  // it and proves that, for a project with NO .opencode/hooks and an EMPTY
  // OPENCODE_CONFIG_DIR, hookPath still resolves a hook via the plugin-sibling
  // `../hooks` candidate (SELF_DIR from import.meta.url) — the global-layout case
  // findRoot never reaches — and returns null (fail-open) for a non-existent hook.
  // -------------------------------------------------------------------------
  {
    const pluginPath = path.join(REPO, '.opencode', 'plugins', 'kaola-workflow-hooks.js');
    const fakeRoot = mkdtempSync(path.join(os.tmpdir(), 'opencode-h1-proj-'));   // exists, no .opencode/hooks
    const emptyCfg = mkdtempSync(path.join(os.tmpdir(), 'opencode-h1-cfg-'));    // empty: no <cfg>/hooks
    const harness = [
      "import { pathToFileURL } from 'node:url';",
      "const { hookPath } = await import(pathToFileURL(process.env.KW_PLUGIN).href);",
      "const resolved = hookPath(process.env.KW_FAKEROOT, process.env.KW_SCRIPT);",
      "const missing = hookPath(process.env.KW_FAKEROOT, 'definitely-not-a-real-hook.sh');",
      "process.stdout.write(JSON.stringify({ resolved, missing }));",
    ].join('\n');
    const h = spawnSync('node', ['--input-type=module', '-e', harness], {
      env: Object.assign({}, process.env, {
        OPENCODE_CONFIG_DIR: emptyCfg, KW_PLUGIN: pluginPath,
        KW_SCRIPT: 'kaola-workflow-pre-commit.sh', KW_FAKEROOT: fakeRoot,
      }),
      encoding: 'utf8',
    });
    assert(h.status === 0, 'H1: hookPath ESM harness runs (got ' + h.status + (h.stderr ? ' — ' + String(h.stderr).split('\n')[0] : '') + ')');
    let out; try { out = JSON.parse(h.stdout); } catch (_) { out = {}; }
    const resolvedNorm = (out.resolved || '').replace(/\\/g, '/');
    assert(resolvedNorm.includes('.opencode/hooks/kaola-workflow-pre-commit.sh'),
      'H1 (#F3): hookPath resolves a hook via the plugin-sibling ../hooks candidate when the project + config dir have none — got ' + JSON.stringify(out.resolved));
    assert(out.missing === null,
      'H1 (#F3): hookPath returns null (fail-open) for a hook that exists nowhere');
    try { rmSync(fakeRoot, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(emptyCfg, { recursive: true, force: true }); } catch (_) {}
  }

  // A (folded #544) — ZERO Claude path leaks across the ENTIRE deployed .opencode/
  // tree. Today kaola_script()'s search path ships the Claude env var
  // ($CLAUDE_PLUGIN_ROOT) + the Claude home dir ($HOME/.claude/kaola-workflow)
  // verbatim in EVERY command AND in the contractor + workflow-planner agents.
  // The opencode edition must resolve scripts via an opencode-native path (no
  // Claude env vars, no .claude/ dir). This greps command/*.md + agent/*.md +
  // plugins/*.js + hooks/*.sh on a FRESHLY-installed hermetic tree (the same
  // surface install-opencode.sh deploys for every consumer) and asserts 0 matches.
  {
    const r = runInstaller([]);
    let leaks = 0;
    const leakFiles = [];
    const roots = [
      ['command', path.join(r.dest, '.opencode', 'command')],
      ['agent',   path.join(r.dest, '.opencode', 'agent')],
      ['plugins', path.join(r.dest, '.opencode', 'plugins')],
      ['hooks',   path.join(r.dest, '.opencode', 'hooks')],
    ];
    for (const [label, dir] of roots) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        let txt;
        try { txt = readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
        const m = (txt.match(/CLAUDE_PLUGIN_ROOT/g) || []).length
                + (txt.match(/\.claude\/kaola-workflow/g) || []).length;
        if (m > 0) { leaks += m; leakFiles.push(label + '/' + f + ' (' + m + ')'); }
      }
    }
    assert(leaks === 0,
      'A (#544): ZERO Claude path leaks (CLAUDE_PLUGIN_ROOT / .claude/kaola-workflow) across the deployed .opencode/ tree — found ' + leaks + ' match(es) in: ' + leakFiles.slice(0, 6).join(', ') + (leakFiles.length > 6 ? ', …' : ''));
    clean(r);
  }
}

if (failed) {
  console.error('\nopencode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('opencode-edition test passed (' + passed + ' assertions).');
