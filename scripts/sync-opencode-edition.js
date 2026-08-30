#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-opencode-edition.js — generate the opencode runtime edition from canonical.
//
// opencode is a coding-agent RUNTIME (like Codex), not a git forge, so it does
// NOT ride the install.sh --forge= (github/gitlab/gitea) machinery. It is
// delivered the opencode-native way: a project `opencode.json` plus a generated
// `.opencode/agents/*.md` + `.opencode/commands/*.md` tree. This script is the
// generate-from-canonical twin of edition-sync.js: deterministic, idempotent,
// and parity-checked by test-opencode-edition.js.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). The runtime is not a
// forge, but the workflow PROSE is forge-shaped (`gh` vs `glab` vs `tea`, PR vs
// MR, per-forge support-script basenames), so a gitlab user must not receive
// GitHub-shaped commands. The forge variants are GENERATED, never hand-ported:
// the command sources come from the routing-surface registry via
// runtime-edition-forge.js, so each forge renders from the same byte-checked
// surfaces the Claude/Codex editions ship. github writes the historical bare
// `.opencode/` tree; a forge edition writes the sibling `.opencode-<forge>/`.
// This changes nothing about the edition's ADDITIVITY: it stays out of
// `npm test`, `edition-sync.js`, `install.sh`, and the SIX routing surfaces, and
// keeps its own suite (test-opencode-edition.js).
//
//   --forge=<f>          github (default) | gitlab | gitea — which forge's command
//                         surfaces to render from, and which tree to write.
//   --write              regenerate .opencode/agents + .opencode/commands + plugins from canonical;
//                         seed opencode.json only if absent (use --write-config to force).
//   --write-config       (re)write this repo's opencode.json from the template.
//   --write-config-to P  write the template opencode.json to path P (installer use).
//   --check              assert generated agents/commands are in parity with canonical.
//
// Pin a tier to a specific model (opt-in; otherwise every role inherits the session model):
//   KAOLA_OPENCODE_STANDARD_MODEL   pin the standard tier to a provider/model
//   KAOLA_OPENCODE_REASONING_MODEL  pin the reasoning tier to a provider/model
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
// #708: the reviewer-profile generator owns the deterministic resolved_profile_hash stamping
// (sha256 of the file with the hash field zeroed). The opencode transform rewrites the
// frontmatter, so the Claude hash no longer binds these bytes; we re-stamp a fresh hash over
// the opencode bytes so the stamp binds the profile that actually ships. The runtime resolver
// that once read it back to bind a review receipt retired with the node executor; the stamp is
// kept because test-opencode-edition.js verifies it against canonical, not for a runtime reader.
const agentGen = require('./generate-agent-profiles');
const forgeLayout = require('./runtime-edition-forge');
const MANAGED_ROLES = new Set(agentGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

const REPO = path.resolve(__dirname, '..');

// TREE_ROOT — where the generated tree LANDS, which is not where the canonical sources are READ.
//
// Sources come from the checkout this script was invoked out of (REPO): a run edits agents/,
// commands/ and templates/ on its branch, and a render that read them anywhere else would ship
// prose nobody wrote here — a sync that quietly re-renders another checkout from its own unchanged
// sources is a no-op wearing a regenerate's name.
//
// The tree is different. It is gitignored and derived, so a machine holds exactly one of it and it
// belongs to the MAIN checkout: a tree written inside a linked worktree dies with that worktree,
// which is how a run can regenerate all six trees, record them in parity, and still leave the only
// copy anyone deploys from carrying prose the branch had already replaced. So a sync run from a
// worktree renders the WORKTREE's sources into MAIN's tree.
//
// Two costs, both accepted: main's trees can carry prose that has not merged yet, and two worktrees
// syncing at once leave the later render standing. Both are bounded by the trees being derived —
// any --write, and either installer's check-or-write, restores them from whatever canonical says.
//
// Where there is no main checkout to resolve, the tree belongs beside this script, and never in the
// process cwd, which owns no canonical sources at all. Three postures have no main checkout: an
// unpacked source tree (how the installers run), a bare repository's linked worktree, and a
// submodule. The last two still have a coordination directory, and it is NOT a checkout's `.git` —
// it is the bare repo itself, or `<super>/.git/modules/<name>`. Taking it would put the generated
// tree inside git's own storage, which git may rewrite around and no reader would ever look in. So
// only a coordination directory that IS a `.git` names a checkout that can own the tree.
const TREE_ROOT = (() => {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const coord = schema.getCoordRoot(REPO);
  return path.basename(coord) === '.git' ? schema.mainRootFromCoord(coord) : REPO;
})();

const DEFAULT_FORGE = 'github';
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');
const CANON_PLUGINS_DIR = path.join(REPO, 'templates', 'opencode', 'plugins');

// outDirs — the generated tree for one forge. github keeps the historical bare
// `.opencode/` path (so its output is unchanged by the forge axis); gitlab/gitea
// write sibling trees. Agents and hooks are forge-NEUTRAL content but still live
// per-tree, because a tree is what the installer copies wholesale.
function outDirs(forge) {
  const root = path.join(TREE_ROOT, '.opencode' + forgeLayout.outSuffix(forge));
  return {
    root,
    agent: path.join(root, 'agents'),
    command: path.join(root, 'commands'),
    hooks: path.join(root, 'hooks'),
    plugins: path.join(root, 'plugins'),
  };
}
const OUT_AGENT_DIR = outDirs(DEFAULT_FORGE).agent;
const OUT_COMMAND_DIR = outDirs(DEFAULT_FORGE).command;
const OPENCODE_JSON = path.join(REPO, 'opencode.json');

// No runtime-neutral hook scripts are active in the opencode edition. The generator still owns
// the hooks directory so --write can retire stale installed copies.
const HOOK_SCRIPTS = [];

// No Kaola plugin executes during OpenCode compaction. Its million-token runtime profile does not
// justify a second prompt lifecycle; --write retains ownership of plugins/ only to prune the
// retired compact reader from generated trees.
const PLUGIN_SCRIPTS = [];

// Model pins are OPT-IN. Unset → no pin → both tiers inherit whatever model the
// user is already using in opencode. Set the env var only to pin a specific
// provider/model for that tier at seed time.
const ENV_STANDARD_MODEL = process.env.KAOLA_OPENCODE_STANDARD_MODEL || '';
const ENV_REASONING_MODEL = process.env.KAOLA_OPENCODE_REASONING_MODEL || '';

// --- minimal frontmatter parser (only the flat key: value surface we need) ---
function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return { fm, body: m[2] };
}

function parseTools(raw) {
  if (!raw) return [];
  const inner = String(raw).replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function lowerSet(arr) {
  return new Set(arr.map(x => String(x).toLowerCase()));
}

// Canonical tool → the opencode permission axis that governs it. A generated agent's restrictions
// are DERIVED from its canonical profile's `tools:` list: an axis is denied when canonical grants
// none of the tools that axis governs. The profile is the source of truth; there is no role list
// here to drift from it.
//
// This replaces a "neither Write nor Edit" predicate that NO role satisfied — all 14 canonical
// roles carry Write (every role writes its own findings), so the restriction branch never fired and
// all 14 generated agents shipped unrestricted. The emitter was fine; the predicate was the defect.
//
// DECLARED DIVERGENCE — `edit`: opencode has no `write` permission of its own. Its write tool asks
// the `edit` permission, so denying `edit` also removes the ability to create a file. A role granted
// Write but not Edit therefore CANNOT have Edit denied here without losing Write, and keeps the edit
// tool on opencode. That is a coupling in the runtime, not an incidental choice in this generator.
const PERMISSION_AXES = Object.freeze([
  { axis: 'edit', tools: ['write', 'edit'] },
  { axis: 'bash', tools: ['bash'] },
]);

// The axes to deny for a canonical tool set — those granting none of their governed tools.
function deniedPermissionAxes(toolSet) {
  return PERMISSION_AXES.filter(a => !a.tools.some(t => toolSet.has(t))).map(a => a.axis);
}

// Runtime-neutral behavior intent is the only tier input. Claude model tokens are an adapter
// rendering detail and must never change OpenCode's roster when that adapter evolves.
function roleTier(intentClass) {
  const token = String(intentClass || '').toLowerCase();
  return (token === 'reasoning' || token === 'heavy') ? 'reasoning' : 'standard';
}

function listCanonAgents() {
  return [...agentGen.ROLES];
}

// The command surfaces this edition renders FROM, for a forge. Sourced from the
// routing-surface registry rather than a directory listing, so the forge variants
// are the generated, byte-checked surfaces themselves — the runtime edition holds
// no command list of its own to drift.
// Sorted, so the emitted order is the directory order this generator used before
// the forge axis and does not depend on the registry's topic order.
function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}

function canonCommandPath(basename, forge) {
  const src = forgeLayout.commandSources(forge || DEFAULT_FORGE).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge || DEFAULT_FORGE}`);
  return src.absPath;
}

// --- renderers (pure; exported for parity test) ---

// opencode-edition-only body suffixes: empty for every role — every agent body ships as the
// verbatim canonical body. The only non-empty branch belonged to the retired workflow-planner (an
// effort-tier addendum, itself since removed), and the roster is readdirSync-derived, so no
// surviving agent reaches a suffix. Kept and exported because renderAgent and the parity test
// consume the empty contract.
function opencodeAgentSuffix() {
  return '';
}

function renderAgent(canonContent, agentName, forge) {
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-opencode-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('opencode', agentName).content;
}

// Rewrite Claude-specific model prose for opencode. Claude Code dispatches carry an explicit
// per-call `model=`; opencode has no such parameter, so: (a) replace the recurring canonical
// "## Agent Model Dispatch" section with the opencode-native block below — canonical's heading is
// the TRIGGER this transform matches at, never the heading it emits; (b) rewrite the plan-run "Pass
// model=dispatch.model" and the review-fix "include the explicit model=" instructions that reference
// that section; (c) drop leftover install-time model placeholders from dispatch lines.
//
// Both wordings state what an agent ACTUALLY GETS, never a mechanism that delivers it. Two earlier
// wordings named one: first the effort `variant`, then per-role effort configuration. Neither
// described what happens — opencode's task tool hands a subagent the dispatching session's own model
// and variant whenever the role pins no model, so effort is inherited, not configured and not passed.
// A prompt surface that names a mechanism dates the moment the mechanism changes, and this one has
// now dated twice. The heading is matched verbatim by the edition suite's block locator, so it moves
// in the same change as that anchor, never on its own.
//
// The task tool's parameters are `description`, `prompt`, `subagent_type`, `task_id` and `command`
// — read from the shipped 1.18.11 binary's schema literal. There is no model or effort parameter to
// pass or to withhold, which is why the block states the inheritance rather than warning against an
// argument that does not exist.
const OPENCODE_MODEL_DISPATCH_BLOCK = [
  '## Model and effort are inherited',
  '',
  'A subagent runs the model and reasoning effort of the session that dispatched it. Nothing is',
  'configured per role, and there is nothing to pass: the `task` tool takes a `subagent_type`, a',
  '`prompt` and a `description`, and has no model or effort parameter at all. To make a dispatched',
  "role think harder, raise the session's own effort — every role you dispatch follows it.",
  '',
  'Dispatch a role with the `task` tool using `subagent_type: "<role>"`.',
  '',
].join('\n');

// The edition's ONE answer to the canonical model-dispatch instruction. Canonical states that
// instruction as PROSE ("… carries an explicit `model=` line … never omit it"); opencode's task tool
// has no model parameter, so every such sentence is restated as this single wording.
const OPENCODE_MODEL_DISPATCH_GUIDANCE =
  'Dispatch the role via `subagent_type`. It runs the session\'s own model and reasoning effort — '
  + 'the task tool has no model or effort parameter.';

// The instruction's stable signature: a `model=` mention in PROSE. Card placeholders sit alone on
// their own line inside a fenced dispatch card and are handled by the native routing renderer, so
// this matches the INSTRUCTION however it happens to be worded.
const OPENCODE_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _oc="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_oc/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_oc/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

// The forge's resolver. Only the SELF-DEV probe is forge-scoped: inside this
// repository a gitlab/gitea edition's scripts live in its plugin tree, not in
// ./scripts. The deployed dir is shared across forges on purpose — the per-forge
// basenames are distinct, so co-installed editions resolve without collision.
// Identity for github, which is what keeps the historical tree byte-unchanged.
function opencodeKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return OPENCODE_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

// #544 (folded into #543): rewrite the Claude script-path surface to opencode-native. Applied to
// BOTH command bodies (via transformCommandBody) and agent bodies (via renderAgent) so the committed
// .opencode/ tree has ZERO `$CLAUDE_PLUGIN_ROOT` / `$HOME/.claude/kaola-workflow` tokens. Canonical
// sources are NEVER touched (additive D-530-02) — only the generated outputs. ONE leak shape
// remains: a whole `kaola_script(){ ... return 1; }` definition line (commands: 3-path form ×N;
// plugin-resident: 5-path form with gitlab/gitea forge dirs) → wholesale replaced by
// OPENCODE_KAOLA_SCRIPT (whitespace/indent preserved).
//
// Each rewrite rule here is a site where two runtimes can silently diverge, so the count of rules
// is itself the reliability metric. The prose-parenthetical rule and the two REPLAN_SCRIPT resolver
// rules are gone with the surfaces that carried them (the planner agent and the re-plan machinery);
// they matched nothing left in the tree, and a rule that can no longer fire cannot be verified.
function rewriteClaudeScriptPaths(text, forge) {
  forge = forge || DEFAULT_FORGE;
  // Whole resolver definition line (indent-preserving). The resolver is always a single line;
  // `.*` does not cross newlines (no `s` flag), so each definition is replaced independently.
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + opencodeKaolaScript(forge));
}

// The canonical section this transform substitutes at — the TRIGGER, never a heading it emits.
function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  // Anchored model-dispatch rewrite FIRST, on canonical text only — before the loop below
  // substitutes OPENCODE_MODEL_DISPATCH_BLOCK, so the edition's own guidance is never fed back
  // through the rewrite.
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    i++;
  }
  // A canonical rename that walked out from under the anchor above reports itself here rather than
  // silently dropping the block.
  let text = out.join('\n');
  if (text.includes(agentGen.DELEGATION_GUIDANCE_START)) {
    text = agentGen.replaceRuntimeDelegationGuidance(text, 'opencode', forge);
  }
  // Dispatch-card `Agent(` openings → the opencode `task` form. Scoped to the literal opening
  // (a line that is exactly `Agent(` immediately followed by an indented `subagent_type=` line)
  // so it rewrites ONLY the dispatch invocation and never prose mentions of the word "agent"
  // or inline `Agent(...)` code spans.
  text = text.replace(/^Agent\(\n(\s+subagent_type=)/gm, 'task(\n$1');
  text = text.replace(/^\s+model="[^"]+",?\n/gm, '');
  // Card placeholder lines. The prose forms are already restated by rewriteModelDispatchInstructions
  // above, so this only ever sees a card.
  // Tidy trailing whitespace left behind on affected lines.
  text = text.replace(/[ \t]+\n/g, '\n');
  // #F6: the former adapt repair-loop strip (`text.replace(/downgrade to full path \/\s*/g,'')`)
  // was DEAD after #538 rewrote canonical to "NEVER downgrade to fast/full — there is no automatic
  // fallback between paths" (it matched nothing). #538 made canonical itself adaptive-only, so the
  // opencode adapt surface needs NO path-fallback strip; it is defended instead by the POSITIVE A22
  // assertion that the generated adapt carries the "NEVER downgrade to fast/full" guard plus a
  // negative guard against any un-NEVER'd fallback wording. The dead replace is removed here.
  // #2 (opencode runtime label): the canonical workflow-next dispatch emits a claim invocation
  // carrying the literal `--runtime claude`. On the opencode edition that flag must stamp the
  // opencode runtime into workflow-state.md, so rewrite the literal to `--runtime opencode`.
  // Scoped to the exact flag token (word boundary) so prose mentions of "claude" are untouched.
  text = text.replace(/--runtime claude\b/g, '--runtime opencode');
  // #544 (folded into #543): final pass — rewrite the `kaola_script()` resolver + the "Re-derive
  // your own script path(s)" prose to the opencode-native path (no $CLAUDE_PLUGIN_ROOT, no
  // ~/.claude/kaola-workflow). Runs LAST so the resolver line (still Claude-shaped above) is
  // rewritten in full; the earlier transforms do not touch it.
  text = rewriteClaudeScriptPaths(text, forge);
  // Fail loud rather than half-apply: nothing but the edition's own guidance may still say
  // `model=` by the time the surface ships.
  return text;
}

function renderCommand(canonContent, forge, label) {
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  lines.push('description: ' + (fm.description || ''));
  // opencode file-command frontmatter allows: description, agent, model, subtask.
  // Workflow commands orchestrate in the primary session and dispatch to the
  // .opencode/agents/* subagents via the task tool, so no `agent:` is set.
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body, forge, label).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

function reasoningRoles() {
  const contracts = agentGen.loadBehaviorContracts(REPO);
  return Object.entries(contracts.roles)
    .map(([name, contract]) => ({ name, tier: roleTier(contract.intent_class) }))
    .filter(r => r.tier === 'reasoning')
    .map(r => r.name)
    .sort();
}

// The opencode config this edition seeds. Every role runs the model and reasoning effort of the
// session that dispatched it — opencode's task tool hands a subagent the parent's model and variant
// whenever the role pins no model, so there is nothing per-role to configure and nothing to keep in
// sync when the session's model changes. The only thing this file can still express is the opt-in
// model PIN, which is a different feature: see renderNeutralConfig.
function renderOpencodeJson(opts) {
  return renderNeutralConfig(opts || {});
}

function renderNeutralConfig(opts) {
  opts = opts || {};
  // Explicit opts win; otherwise fall back to the env-derived pins. Empty/blank
  // ⇒ no pin ⇒ that tier inherits the user's opencode default model.
  const pinStandard = opts.standardModel !== undefined ? opts.standardModel : ENV_STANDARD_MODEL;
  const pinReasoning = opts.reasoningModel !== undefined ? opts.reasoningModel : ENV_REASONING_MODEL;
  const reasoning = reasoningRoles();
  const std = String(pinStandard || '').trim();
  const rea = String(pinReasoning || '').trim();
  // Commas keep this strict-JSON-valid (the parity test parses with JSON.parse
  // after stripping // comments): a property gets a trailing comma only if a
  // REAL property follows it — commented-out lines are stripped, so they don't
  // count as a following property.
  const hasStd = !!std;
  const hasRea = !!rea;
  const commaDefault = (hasStd || hasRea) ? ',' : '';
  const commaModel = hasRea ? ',' : '';

  const lines = [];
  lines.push('{');
  lines.push('  "$schema": "https://opencode.ai/config.json",');
  lines.push('  "default_agent": "build"' + commaDefault);
  lines.push('');
  lines.push('  // Kaola-Workflow · opencode edition — TWO model tiers:');
  lines.push('  //   普通模型 (standard tier)  → top-level "model".');
  lines.push('  //   推理模型 (reasoning tier) → "agent.<role>.model" overrides for');
  lines.push('  //                               the reasoning roles: ' + reasoning.join(', ') + '.');
  lines.push('  // DEFAULT: nothing is pinned, so BOTH tiers inherit the model you are');
  lines.push('  // already using in opencode. To pin a tier, uncomment & set it below');
  lines.push('  // (any provider/model works, e.g. "anthropic/claude-sonnet-4-5",');
  lines.push('  // "openai/gpt-4o", "google/gemini-2.5-pro"). This file is user-owned:');
  lines.push('  // re-running `node scripts/sync-opencode-edition.js --write` regenerates');
  lines.push('  // agents/commands but preserves your model choices here.');

  if (std) {
    lines.push('  "model": "' + std + '"' + commaModel);
  } else {
    lines.push('  // "model": "<inherits your opencode default>",');
  }

  if (rea) {
    lines.push('');
    lines.push('  "agent": {');
    for (let i = 0; i < reasoning.length; i++) {
      const comma = i < reasoning.length - 1 ? ',' : '';
      lines.push('    "' + reasoning[i] + '": { "model": "' + rea + '" }' + comma);
    }
    lines.push('  }');
  } else {
    lines.push('  // Pin the reasoning tier only to put it on a different model:');
    lines.push('  // "agent": {');
    for (let i = 0; i < reasoning.length; i++) {
      const comma = i < reasoning.length - 1 ? ',' : '';
      lines.push('  //   "' + reasoning[i] + '": { "model": "<inherits your opencode default>" }' + comma);
    }
    lines.push('  // }');
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

// --- IO helpers ---
// read() resolves a CANONICAL path (agents/, hooks/, the tracked opencode.json); treePath()/
// readTree() resolve a path inside the GENERATED tree. They are separate because the two roots
// differ under a linked worktree — see TREE_ROOT above — and a check that read the tree from the
// invoking checkout would report every file missing in exactly the posture a run works in.
function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function treePath(rel) {
  return path.join(TREE_ROOT, rel);
}
function readTree(rel) {
  return fs.readFileSync(treePath(rel), 'utf8');
}
function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

// treeLabel — the repo-relative tree name for log lines ('.opencode' or
// '.opencode-gitlab'), so a multi-forge run says which tree it wrote.
function treeLabel(forge) {
  return '.opencode' + forgeLayout.outSuffix(forge);
}

function writeAgents(forge) {
  const out_dir = outDirs(forge).agent;
  ensureDir(out_dir);
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name, forge);
    const dest = path.join(out_dir, name + '.md');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      fs.writeFileSync(dest, out);
      console.log('generated  ' + treeLabel(forge) + '/agents/' + name + '.md');
      wrote++;
    }
  }
  return wrote;
}

function writeCommands(forge) {
  const out_dir = outDirs(forge).command;
  ensureDir(out_dir);
  let wrote = 0;
  for (const file of listCanonCommands(forge)) {
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const out = renderCommand(canon, forge, treeLabel(forge) + '/commands/' + file);
    const dest = path.join(out_dir, file);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      fs.writeFileSync(dest, out);
      console.log('generated  ' + treeLabel(forge) + '/commands/' + file);
      wrote++;
    }
  }
  return wrote;
}

function writeConfig(force) {
  if (!force && fs.existsSync(OPENCODE_JSON)) {
    console.log('preserve   opencode.json (user-owned; use --write-config to overwrite)');
    return 0;
  }
  fs.writeFileSync(OPENCODE_JSON, renderOpencodeJson());
  console.log((force ? 'rewrote    ' : 'seeded     ') + 'opencode.json');
  return 1;
}

function writeHooks(forge) {
  const out_dir = outDirs(forge).hooks;
  ensureDir(out_dir);
  let wrote = 0;
  for (const script of HOOK_SCRIPTS) {
    const src = path.join(CANON_HOOKS_DIR, script);
    const dest = path.join(out_dir, script);
    const content = fs.readFileSync(src, 'utf8');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log('copied     ' + treeLabel(forge) + '/hooks/' + script);
      wrote++;
    }
  }
  return wrote;
}

function writePlugin(forge) {
  const out_dir = outDirs(forge).plugins;
  ensureDir(out_dir);
  let wrote = 0;
  for (const script of PLUGIN_SCRIPTS) {
    const src = path.join(CANON_PLUGINS_DIR, script);
    const dest = path.join(out_dir, script);
    const content = fs.readFileSync(src, 'utf8');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      console.log('copied     ' + treeLabel(forge) + '/plugins/' + script);
      wrote++;
    }
  }
  return wrote;
}

// Retired *.md surfaces in an out dir whose basename is not in the expected canonical set.
// A deterministic, idempotent mirror must remove them: the generator wrote canonical
// surfaces but never pruned, so a deleted canonical command (the retired fast/full
// `kaola-workflow-fast` / `-phase{1..5}`) lingered in the deployed tree while --check
// reported parity — the edition suite's exact-count assertion (A4) caught the drift.
function retiredMdFiles(outDir, expectedBasenames) {
  if (!fs.existsSync(outDir)) return [];
  const expected = new Set(expectedBasenames);
  return fs.readdirSync(outDir)
    .filter(f => f.endsWith('.md') && !expected.has(f.slice(0, -3)))
    .sort();
}

// Retired BYTE-COPIED artifacts in a generator-owned subdirectory: a file whose extension is one
// this generator writes into that dir but whose basename it no longer emits (the retired
// `kaola-workflow-write-lane.sh` / `kaola-workflow-pre-commit.sh` hooks, which nothing registers
// and which --write kept re-shipping because a generator that only ever ADDS makes every retired
// artifact immortal).
//
// Deliberately narrow. It looks at ONE directory, never recurses, skips anything that is not a
// regular file, and only considers the extensions this generator itself writes there — so it
// cannot reach `.opencode/node_modules/`, the tree's own `.gitignore`, or any subdirectory or
// unrelated file type a user placed alongside. The tree ROOT is never swept.
function retiredCopiedFiles(outDir, expectedBasenames, extensions) {
  if (!fs.existsSync(outDir)) return [];
  const expected = new Set(expectedBasenames);
  return fs.readdirSync(outDir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => extensions.includes(path.extname(n)) && !expected.has(n))
    .sort();
}

function pruneRetired(forge) {
  const dirs = outDirs(forge);
  let removed = 0;
  for (const f of retiredCopiedFiles(dirs.hooks, HOOK_SCRIPTS, ['.sh'])) {
    fs.rmSync(path.join(dirs.hooks, f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/hooks/' + f + ' (retired artifact)');
    removed++;
  }
  for (const f of retiredCopiedFiles(dirs.plugins, PLUGIN_SCRIPTS, ['.js'])) {
    fs.rmSync(path.join(dirs.plugins, f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/plugins/' + f + ' (retired artifact)');
    removed++;
  }
  const cmds = retiredMdFiles(dirs.command, listCanonCommands(forge).map(f => f.slice(0, -3)));
  for (const f of cmds) {
    fs.rmSync(path.join(dirs.command, f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/commands/' + f + ' (retired surface)');
    removed++;
  }
  const agents = retiredMdFiles(dirs.agent, listCanonAgents());
  for (const f of agents) {
    fs.rmSync(path.join(dirs.agent, f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/agents/' + f + ' (retired surface)');
    removed++;
  }
  // Current OpenCode discovers plural directories. The generator fully owned the retired
  // singular trees, so remove only the Markdown surfaces it could have generated, then remove
  // the directory when empty; unrelated file types keep the directory alive.
  for (const legacyName of ['agent', 'command']) {
    const legacyDir = path.join(dirs.root, legacyName);
    if (!fs.existsSync(legacyDir)) continue;
    for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      fs.rmSync(path.join(legacyDir, entry.name), { force: true });
      console.log('pruned     ' + treeLabel(forge) + '/' + legacyName + '/' + entry.name
        + ' (retired singular carrier)');
      removed++;
    }
    try { fs.rmdirSync(legacyDir); } catch (_) { /* preserve unrelated residue */ }
  }
  return removed;
}

function runWrite(configForce, forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const a = writeAgents(forge);
  const c = writeCommands(forge);
  const h = writeHooks(forge);
  const p = writePlugin(forge);
  const j = writeConfig(configForce);
  const pr = pruneRetired(forge);
  const total = a + c + h + p + j + pr;
  console.log('sync-opencode-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

// Bring back into parity every forge tree that ALREADY EXISTS, and create none.
//
// A tree that is absent carries no stale prose, and materializing one hands a developer a forge
// edition they never installed — so absence is not a failure here and is not reported as one. The
// caller is the regenerate step the skeleton rule already mandates: a prose edit reaches every
// tracked surface, and without this it stopped one hop short of the tree a runtime actually reads.
//
// The user-owned opencode.json is deliberately untouched: it is a tracked file the user is invited
// to hand-edit, not part of the generated tree, and --write-config remains the only thing that
// rewrites it.
function runRefreshPresent() {
  const refreshed = [];
  let changed = 0;
  for (const forge of forgeLayout.FORGES) {
    if (!fs.existsSync(outDirs(forge).root)) continue;
    changed += writeAgents(forge);
    changed += writeCommands(forge);
    changed += writeHooks(forge);
    changed += writePlugin(forge);
    changed += pruneRetired(forge);
    refreshed.push(treeLabel(forge));
  }
  if (refreshed.length) {
    console.log('sync-opencode-edition: refreshed ' + refreshed.length + ' present tree(s): '
      + refreshed.join(', ') + '.');
  }
  // The two-root resolution above is deliberate; a run being silent about it is not. Every line
  // this function prints names a tree by its repo-relative label ('.opencode'), which reads as
  // "beside me" in the one posture where it is not — so a worktree run that renders real edits
  // leaves the MAIN checkout's deployed-from trees carrying prose that exists in no tracked file
  // there, and nothing says so: the trees are gitignored, and no chain-resident guard reads one.
  // The reader who could act on it is the one who cannot see it happened.
  //
  // Gated on the refresh actually changing something there. The writers content-compare, so an
  // in-parity refresh leaves the other checkout byte- and mtime-identical, and announcing then
  // attaches a warning to a run that touched nothing.
  //
  // The count includes pruneRetired, and the note says "change(s)" rather than "file(s) written"
  // for that reason: a refresh can DELETE from the other checkout and write nothing, which is the
  // more destructive half of the same cross-checkout reach and the half a write-only count would
  // report as a silent no-op.
  //
  // "change(s)" is also the only unit that stays true across both editions. A prune can remove a
  // whole retired directory in one call and count it once, so the number is changes applied, never
  // a file tally — measured on the kimi side, where a 5-file skill directory counts as 1. Keep the
  // unit vague rather than the count wrong: the gate only needs "something moved there", and it
  // cannot read zero when something did.
  //
  // stderr, not stdout: this script's stdout is a parsed interface in another mode
  // (--print-tree-root is consumed as a path by the edition installers), so an advisory stays off
  // the stream a caller might capture. It is self-contained rather than a rider on the line above,
  // because the two streams need not interleave in order once either is redirected.
  if (changed > 0 && TREE_ROOT !== REPO) {
    console.error('sync-opencode-edition: NOTE — ' + changed
      + ' change(s) in a checkout that is not this one.');
    console.error('  ' + refreshed.join(', ') + ' under ' + TREE_ROOT);
    console.error('  now render THIS checkout\'s canonical sources (' + REPO
      + '), including anything uncommitted here.');
    console.error('  Verify from that root: npm run test:kaola-workflow:editions');
  }
}

// Installer entrypoint: write the template opencode.json to an arbitrary path
// (honors the KAOLA_OPENCODE_*_MODEL pin env vars). The installer guards the
// "preserve existing" semantics; this unconditionally writes the target.
function runWriteConfigTo(target) {
  fs.writeFileSync(target, renderOpencodeJson());
  console.log('seeded     ' + target);
}

// What actually clears a mismatch. Every mismatch below carries one, decided where the mismatch is
// constructed — the class is what knows its own remedy, and the closing advice is derived from the
// set of remedies reported rather than fixed in advance.
const REMEDY = {
  WRITE: 'write',                 // --write regenerates or prunes it
  WRITE_CONFIG: 'write-config',   // only --write-config clears it: --write preserves the user-owned config
  SOURCE_EDIT: 'source-edit',     // no flag of this script clears it; the reason names the edit
};

// The closing remediation lines for a non-empty mismatch set.
//
// --write is the right answer for most classes and the wrong one for two, and both wrong cases fail
// quietly: --write exits 0 reporting "tree already in sync" while --check still exits 1, so a reader
// who follows a blanket line is told the repair succeeded when nothing was repaired.
//
// --write-config is runWrite(true) — a strict superset of --write — so when anything in the set needs
// it, it is the one command that clears the whole flag-clearable part. It is never named otherwise,
// because it overwrites the model pins opencode.json itself invites the user to hand-edit.
//
// When no flag clears anything in the set, no invocation of this script is offered at all: a command
// printed under the reasons is read as the fix, and this one would exit 0 having done nothing.
function remediationLines(mismatches, forge) {
  const remedies = new Set(mismatches.map(m => m.remedy));
  const lines = [];
  const flag = remedies.has(REMEDY.WRITE_CONFIG) ? '--write-config'
    : remedies.has(REMEDY.WRITE) ? '--write' : '';
  if (flag) {
    lines.push('Fix: node scripts/sync-opencode-edition.js --forge=' + forge + ' ' + flag);
    if (flag === '--write-config') {
      lines.push('     (--write preserves the user-owned opencode.json and leaves it stale;'
        + ' --write-config rewrites it, discarding any model pins set there.)');
    }
  }
  const sourceEdits = mismatches.filter(m => m.remedy === REMEDY.SOURCE_EDIT).map(m => m.rel);
  if (sourceEdits.length) {
    lines.push('No flag of this script clears ' + sourceEdits.join(', ') + ' — apply the source edit '
      + (sourceEdits.length === 1 ? 'its reason names' : 'their reasons name') + ' above.');
  }
  return lines;
}

function runCheck(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const tree = treeLabel(forge);
  const dirs = outDirs(forge);
  const mismatches = [];
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = tree + '/agents/' + name + '.md';
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated agent', remedy: REMEDY.WRITE });
      continue;
    }
    const expected = renderAgent(canon, name, forge);
    if (readTree(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate', remedy: REMEDY.WRITE });
  }
  for (const file of listCanonCommands(forge)) {
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const rel = tree + '/commands/' + file;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated command', remedy: REMEDY.WRITE });
      continue;
    }
    const expected = renderCommand(canon, forge, rel);
    if (readTree(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate', remedy: REMEDY.WRITE });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = tree + '/hooks/' + script;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy', remedy: REMEDY.WRITE });
      continue;
    }
    if (readTree(rel) !== read('hooks/' + script)) mismatches.push({ rel, reason: 'drifted from canonical hooks/', remedy: REMEDY.WRITE });
  }
  for (const script of PLUGIN_SCRIPTS) {
    const rel = tree + '/plugins/' + script;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated plugin', remedy: REMEDY.WRITE });
      continue;
    }
    const canonContent = fs.readFileSync(path.join(CANON_PLUGINS_DIR, script), 'utf8');
    if (readTree(rel) !== canonContent) mismatches.push({ rel, reason: 'drifted from canonical templates/opencode/plugins/', remedy: REMEDY.WRITE });
  }
  // Allowlist guard: every *.js present in the canonical plugins dir must be registered in
  // PLUGIN_SCRIPTS (the unregistered-on-disk direction). The per-script loop above covers the
  // missing-registered-file direction; this catches the reverse — a future second plugin dropped
  // into templates/opencode/plugins/ without being added to the allowlist.
  {
    const onDiskPlugins = fs.existsSync(CANON_PLUGINS_DIR)
      ? fs.readdirSync(CANON_PLUGINS_DIR).filter(f => f.endsWith('.js'))
      : [];
    const registeredSet = new Set(PLUGIN_SCRIPTS);
    for (const file of onDiskPlugins) {
      if (!registeredSet.has(file)) {
        mismatches.push({
          rel: 'templates/opencode/plugins/' + file,
          reason: "unregistered plugin '" + file + "' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist",
          // The allowlist is source, so neither write mode touches this: the reason above is the
          // whole remedy, and the closing lines must not offer a command instead of it.
          remedy: REMEDY.SOURCE_EDIT,
        });
      }
    }
  }
  // Retired-surface guard: a *.md in the deployed commands/agents dir whose canonical source
  // was deleted (e.g. the fast/full commands) must be pruned; --write removes it.
  for (const f of retiredMdFiles(dirs.command, listCanonCommands(forge).map(x => x.slice(0, -3)))) {
    mismatches.push({ rel: tree + '/commands/' + f, reason: 'retired surface not in canonical — prune (--write removes it)', remedy: REMEDY.WRITE });
  }
  for (const f of retiredMdFiles(dirs.agent, listCanonAgents())) {
    mismatches.push({ rel: tree + '/agents/' + f, reason: 'retired surface not in canonical — prune (--write removes it)', remedy: REMEDY.WRITE });
  }
  for (const legacyName of ['agent', 'command']) {
    const legacyDir = path.join(dirs.root, legacyName);
    if (!fs.existsSync(legacyDir)) continue;
    for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      mismatches.push({
        rel: tree + '/' + legacyName + '/' + entry.name,
        reason: 'retired singular native carrier — prune (--write removes it)',
        remedy: REMEDY.WRITE,
      });
    }
  }
  // Same for the byte-copied artifacts: a hook or plugin this generator no longer emits is retired,
  // and --check called such a tree green until it was reported here.
  for (const f of retiredCopiedFiles(dirs.hooks, HOOK_SCRIPTS, ['.sh'])) {
    mismatches.push({ rel: tree + '/hooks/' + f, reason: 'retired artifact no longer emitted — prune (--write removes it)', remedy: REMEDY.WRITE });
  }
  for (const f of retiredCopiedFiles(dirs.plugins, PLUGIN_SCRIPTS, ['.js'])) {
    mismatches.push({ rel: tree + '/plugins/' + f, reason: 'retired artifact no longer emitted — prune (--write removes it)', remedy: REMEDY.WRITE });
  }
  // #F8: opencode.json parity — the installer freshness gate (install-opencode.sh) and the docs
  // bill --check as the "parity assert", yet runCheck never validated the committed config, so a
  // corrupted opencode.json passed. Compare it to the renderer output (test A7 does the same).
  if (fs.existsSync(OPENCODE_JSON) && read('opencode.json') !== renderOpencodeJson()) {
    mismatches.push({ rel: 'opencode.json', reason: 'stale — regenerate via --write-config', remedy: REMEDY.WRITE_CONFIG });
  }
  if (mismatches.length) {
    console.error('sync-opencode-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    for (const line of remediationLines(mismatches, forge)) console.error(line);
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands(forge).length;
  const np = PLUGIN_SCRIPTS.length;
  console.log('sync-opencode-edition[' + forge + ']: ' + na + ' agent(s) + ' + nc + ' command(s) + ' + np + ' plugin(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-opencode-edition.js (--write | --write-config | --write-config-to PATH'
    + ' | --refresh-present | --check) [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>          which forge to render (default github). github writes .opencode/;\n'
    + '                       gitlab/gitea write .opencode-<forge>/\n'
    + '  --write              regenerate the forge tree agent + command; seed opencode.json if absent\n'
    + '  --refresh-present    regenerate every forge tree that already exists; create none (ignores\n'
    + '                       --forge, and leaves opencode.json alone)\n'
    + '  --write-config       (re)write this repo opencode.json from the template (clobbers edits)\n'
    + '  --write-config-to P  write the template opencode.json to path P (installer use)\n'
    + '  --check              assert generated files are in parity with canonical\n'
    + '  --print-tree-root    print the directory the generated trees land in; write nothing\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const forge = forgeArg ? forgeArg.slice('--forge='.length) : DEFAULT_FORGE;
  try {
    forgeLayout.assertForge(forge);
  } catch (e) {
    console.error('sync-opencode-edition: ' + e.message);
    process.exitCode = 2;
    return;
  }
  const positional = argv.filter(a => !a.startsWith('--forge='));
  const arg = positional[0];
  if (arg === '--write') return runWrite(false, forge);
  if (arg === '--refresh-present') return runRefreshPresent();
  if (arg === '--write-config') return runWrite(true, forge);
  if (arg === '--write-config-to') {
    const target = positional[1];
    if (!target) { console.error('--write-config-to requires a path'); process.exitCode = 2; return; }
    return runWriteConfigTo(target);
  }
  if (arg === '--check') return runCheck(forge);
  // Read-only, and the ONE answer to "where does the tree a deploy copies from actually live" —
  // so a consumer of the generated tree never has to restate the rule and get it wrong somewhere
  // the rule does not hold. Prints a directory and nothing else; forge-independent.
  if (arg === '--print-tree-root') { process.stdout.write(TREE_ROOT + '\n'); return; }
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, renderOpencodeJson, renderNeutralConfig,
  transformCommandBody, opencodeAgentSuffix, rewriteClaudeScriptPaths, OPENCODE_KAOLA_SCRIPT,
  OPENCODE_MODEL_DISPATCH_GUIDANCE, OPENCODE_MODEL_DISPATCH_BLOCK,
  opencodeKaolaScript, outDirs, treeLabel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  parseFrontmatter, parseTools, roleTier, reasoningRoles,
  PERMISSION_AXES, deniedPermissionAxes,
  listCanonAgents, listCanonCommands,
  ENV_STANDARD_MODEL, ENV_REASONING_MODEL,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR, CANON_PLUGINS_DIR,
  OUT_AGENT_DIR, OUT_COMMAND_DIR, OPENCODE_JSON, REPO,
  HOOK_SCRIPTS, PLUGIN_SCRIPTS,
  writePlugin, retiredMdFiles, retiredCopiedFiles, pruneRetired,
};
