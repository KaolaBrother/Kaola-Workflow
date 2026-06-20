#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-opencode-edition.js — generate the opencode runtime edition from canonical.
//
// opencode is a coding-agent RUNTIME (like Codex), not a git forge, so it does
// NOT ride the install.sh --forge= (github/gitlab/gitea) machinery. It is
// delivered the opencode-native way: a project `opencode.json` plus a generated
// `.opencode/agent/*.md` + `.opencode/command/*.md` tree. This script is the
// generate-from-canonical twin of edition-sync.js: deterministic, idempotent,
// and parity-checked by test-opencode-edition.js.
//
// Two model tiers (resolvable from ONE file: opencode.json). The DEFAULT install
// expresses them as reasoning-EFFORT VARIANTS of the user's inherited model (no
// model is pinned — both tiers inherit the model opencode is already using):
//   掐理 (reasoning tier) → the inherited model's TOP effort variant (e.g. max).
//   普通 (standard tier)  → the inherited model's SECOND effort variant (e.g. high).
// The reasoning tier = the canonical `model: opus` roles PLUS the Claude Code
// "higher" profile roles (agents/profiles/higher/*), mirroring --profile=higher;
// all other roles run standard. Effort levels are provider-relative, so an effort
// map (PROVIDER_EFFORT) names the top/second variant per provider:
//   anthropic max/high · openai xhigh/high · google high/low · z.ai·zhipu max/high
// (GLM-5.2 ships exactly High + Max). An opt-in MODEL-PIN path still exists for
// users who want the tiers on DIFFERENT models (top-level "model" + agent.<role>.model
// overrides for the canonical opus roles). A fresh install never hard-codes a
// provider; generated agents are MODEL-AGNOSTIC.
//
//   --write              regenerate .opencode/agent + .opencode/command from canonical;
//                         seed opencode.json only if absent (use --write-config to force).
//   --write-config       (re)write this repo's opencode.json from the template.
//   --write-config-to P  write the template opencode.json to path P (installer use).
//   --adapt              (modifier for --write-config / --write-config-to) render the
//                         two-tier EFFORT-VARIANT config for the inherited model,
//                         detected from KAOLA_OPENCODE_INHERIT_MODEL env else the
//                         global ~/.config/opencode/opencode.json "model" field.
//                         Unknown provider → neutral template (no variants).
//   --check              assert generated agent/command files are in parity with canonical.
//
// Override the inherited model the --adapt path targets:
//   KAOLA_OPENCODE_INHERIT_MODEL    provider/model to adapt the effort tiers to.
// Pin each tier to a DIFFERENT model instead (opt-in; otherwise both inherit):
//   KAOLA_OPENCODE_STANDARD_MODEL   pin the standard tier to a provider/model
//   KAOLA_OPENCODE_REASONING_MODEL  pin the reasoning tier to a provider/model
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const schema = require('./kaola-workflow-adaptive-schema');

const REPO = path.resolve(__dirname, '..');
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_COMMANDS_DIR = path.join(REPO, 'commands');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');
const OUT_AGENT_DIR = path.join(REPO, '.opencode', 'agent');
const OUT_COMMAND_DIR = path.join(REPO, '.opencode', 'command');
const OUT_HOOKS_DIR = path.join(REPO, '.opencode', 'hooks');
const OPENCODE_JSON = path.join(REPO, 'opencode.json');

// Runtime-neutral hook scripts (byte-copied from canonical hooks/ into the
// opencode edition). The .opencode/plugins/kaola-workflow-hooks.js adapter feeds
// them Claude-style JSON payloads and honors their exit codes.
const HOOK_SCRIPTS = [
  'kaola-workflow-pre-commit.sh',
  'kaola-workflow-write-lane.sh',
  'kaola-workflow-subagent-dispatch-log.sh',
];

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

// Canonical model tier: opus → reasoning, everything else (sonnet/inherit) → standard.
function roleTier(canonModelValue) {
  return String(canonModelValue || '').toLowerCase() === 'opus' ? 'reasoning' : 'standard';
}

function listCanonAgents() {
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
}

function listCanonCommands() {
  return fs.readdirSync(CANON_COMMANDS_DIR).filter(f => f.endsWith('.md'));
}

// --- renderers (pure; exported for parity test) ---

// opencode-edition-only body suffixes. The adaptive workflow ADOPTS the adaptive
// selection of efforts: the workflow-planner is told how its per-node {opus, sonnet}
// choice is realized as a provider-relative EFFORT VARIANT on opencode (mapTier), so it
// makes effort-aware role choices. Empty for every other agent (verbatim canonical body).
function opencodeAgentSuffix(agentName) {
  if (agentName !== 'workflow-planner') return '';
  return [
    '',
    '## opencode effort tiers (mapTier) — adaptive effort selection',
    '',
    'On the opencode runtime your per-node `model` choice (the two Kaola tiers) is realized as a',
    'reasoning-EFFORT VARIANT of the inherited model via `mapTier(tier, provider)`: the reasoning tier',
    "→ the provider's TOP effort variant, the standard tier → its SECOND (max/high on GLM-5.2 and Anthropic;",
    'xhigh/high on OpenAI; high/low on Google). opencode applies the variant per-ROLE (via',
    '`agent.<role>.variant` in opencode.json) — there is NO per-call variant override — so your',
    "tier selection is realized through ROLE CHOICE: a reasoning-heavy node uses a top-tier role",
    '(planner, code-architect, code-reviewer, security-reviewer, synthesizer, workflow-planner →',
    "top variant); an execution node uses a standard role (→ second variant). Adaptive effort",
    "selection: choose the role whose tier matches the node's reasoning weight, and set the",
    '`model` column to record that intent (authoritative on Claude Code, role-resolved on opencode).',
    '',
  ].join('\n');
}

function renderAgent(canonContent, agentName) {
  const { fm, body } = parseFrontmatter(canonContent);
  const tools = parseTools(fm.tools);
  const toolSet = lowerSet(tools);
  const readOnly = !toolSet.has('write') && !toolSet.has('edit');
  const hasBash = toolSet.has('bash');

  const lines = ['---'];
  lines.push('description: ' + (fm.description || ''));
  lines.push('mode: subagent');
  // No model field: standard tier inherits opencode.json "model"; reasoning tier
  // is resolved by the opencode.json agent.<role>.model override. Keeping generated
  // agents model-agnostic is what lets the user own both tiers in one file.
  if (readOnly) {
    lines.push('permission:');
    lines.push('  edit: deny');
    if (!hasBash) lines.push('  bash: deny');
  }
  lines.push('---');
  lines.push('');
  // #544 (folded into #543): apply the Claude→opencode script-path rewrite to the agent body too
  // (contractor ships 2 `kaola_script()` resolver definitions + the "Re-derive" prose; workflow-
  // planner ships the "Re-derive" prose only). Other agents are verbatim (rewriteClaudeScriptPaths
  // is a no-op when the patterns are absent). Applied to the RENDERED body so canonical agents/*.md
  // are never touched (additive D-530-02); A6 parity holds because both sides go through renderAgent.
  const bodyText = rewriteClaudeScriptPaths(body).trim().replace(/\s+$/, '');
  const suffix = opencodeAgentSuffix(agentName);
  lines.push(suffix ? bodyText + '\n' + suffix.replace(/\s+$/, '') : bodyText);
  return lines.join('\n') + '\n';
}

// Rewrite Claude-specific model prose for opencode. Effort is centralized in opencode.json
// (the two Kaola tiers as reasoning-EFFORT VARIANTS of the inherited model), so: (a) replace
// the recurring canonical "Agent Model Badge" block (a Claude Code feature instructing "MUST
// pass model=") with an opencode-native "Effort Variant Resolution" note; (b) rewrite the
// plan-run "Pass model=dispatch.model" and the review-fix "include the explicit model="
// instructions that reference that badge; (c) drop leftover install-time model placeholders
// from dispatch lines.
const OPENCODE_BADGE_BLOCK = [
  '## Effort Variant Resolution',
  '',
  'opencode resolves each subagent effort centrally from `opencode.json` (the two Kaola',
  'tiers as reasoning-EFFORT VARIANTS of the inherited model): reasoning-tier roles run the',
  "model's TOP effort variant, standard-tier roles its SECOND (e.g. max / high on GLM-5.2).",
  'Dispatch a role with the `task` tool using `subagent_type: "<role>"`; do NOT pass a',
  "per-call `model=` argument — the role's configured variant already selects the effort.",
  '`mapTier(tier, provider)` resolves the variant: the reasoning tier → the TOP effort variant, the standard tier → its SECOND.',
  '',
].join('\n');

// opencode-native `kaola_script()` shell resolver (issue #544, folded into #543). The canonical
// resolver ships a CLAUDE search path verbatim — `$CLAUDE_PLUGIN_ROOT` + `$HOME/.claude/kaola-workflow`
// (contractor's copy ALSO adds the gitlab/gitea forge dirs). On the opencode edition that is a
// Claude-path leak: opencode resolves scripts via an opencode-native dir honoring `$OPENCODE_CONFIG_DIR`
// (default `~/.config/opencode`), which is where install-opencode.sh deploys the support scripts. This
// constant is the wholesale replacement for every `kaola_script(){ ... return 1; }` definition line
// (both the 3-path command form and the 5-path contractor form collapse to this single opencode
// form — opencode is runtime-only, no forge axis). Single-quoted JS literal: inner `'`→`\'`, the
// shell `printf '%s\n'` backslash-n is `\\n` so the GENERATED .md carries a literal `\n` (not a JS
// newline that would split the one-line resolver).
const OPENCODE_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _oc="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_oc/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_oc/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

// #544 (folded into #543): rewrite the Claude script-path surface to opencode-native. Applied to
// BOTH command bodies (via transformCommandBody) and agent bodies (via renderAgent) so the committed
// .opencode/ tree has ZERO `$CLAUDE_PLUGIN_ROOT` / `$HOME/.claude/kaola-workflow` tokens. Canonical
// sources are NEVER touched (additive D-530-02) — only the generated outputs. Two leak shapes:
//   (a) a whole `kaola_script(){ ... return 1; }` definition line (commands: 3-path form ×N;
//       contractor: 5-path form with gitlab/gitea forge dirs ×2) → wholesale replaced by
//       OPENCODE_KAOLA_SCRIPT (whitespace/indent preserved).
//   (b) the "Re-derive your own script path(s)" prose parenthetical in contractor + workflow-planner
//       ("prefer `$CLAUDE_PLUGIN_ROOT/scripts`, then `$HOME/.claude/kaola-workflow/scripts`,
//        then `./scripts`)") → collapsed to the 2-path opencode list.
function rewriteClaudeScriptPaths(text) {
  // (a) Whole resolver definition line (indent-preserving). The resolver is always a single line;
  // `.*` does not cross newlines (no `s` flag), so each definition is replaced independently.
  text = text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + OPENCODE_KAOLA_SCRIPT);
  // (b) The path-list parenthetical in agent prose (whitespace-flexible across the two agents' line
  // breaks). Scoped to the literal "(prefer `$CLAUDE_PLUGIN_ROOT/scripts`, then … then `./scripts`)"
  // shape — only contractor + workflow-planner carry it, so no over-strip risk.
  text = text.replace(
    /\(prefer\s+`\$CLAUDE_PLUGIN_ROOT\/scripts`,\s+then\s+`\$HOME\/\.claude\/kaola-workflow\/scripts`,\s+then\s+`\.\/scripts`\)/g,
    '(prefer `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts`, then `./scripts`)'
  );
  return text;
}

function transformCommandBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^##\s+Agent Model Badge\s*$/.test(line)) {
      out.push(OPENCODE_BADGE_BLOCK);
      i++;
      // Skip the original badge body up to (not including) the next heading line.
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
      continue;
    }
    // opencode path-flip (#539, Mechanism B): opencode is adaptive-only-default, so the
    // canonical "## Startup Step 0a-1 — Path Intent" section (KAOLA_ENABLE_ADAPTIVE switch
    // resolution + Branch A/B path-selection prose) is DROPPED at generation time. This
    // transform runs ONLY inside renderCommand (opencode output), so canonical is never
    // touched — avoiding a guaranteed merge conflict with #538's in-flight canonical edits.
    // Mirrors the Agent Model Badge strip above: detect the heading, skip its body. UNLIKE
    // the badge (a flat block), this section nests `### Branch A`/`### Branch B` children,
    // so the body-skip stops at the next SIBLING `##` heading (`^##\s` rejects `###` — after
    // two hashes `\s` requires whitespace, and `###` has a third `#` there), not the first
    // `###` child. The ^## anchor isolates the section heading (surviving "(Step 0a-1)"
    // prose mentions elsewhere are not headings). Rewind trailing blank line(s) in `out` so
    // excising the section leaves a single-blank seam, not a double-blank.
    if (/^##\s+Startup Step 0a-1\b/.test(line)) {
      // Rewind trailing blank line(s) in `out` then re-insert exactly ONE blank, so
      // excising the section leaves a clean single-blank seam to the next heading
      // (the body-skip below also consumes the blank that followed the section).
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      i++;
      while (i < lines.length && !/^##\s/.test(lines[i])) i++;
      continue;
    }
    out.push(line);
    i++;
  }
  let text = out.join('\n');
  // plan-run dispatch prose: opencode applies the effort variant per-role (central), so the
  // Claude "Pass model=dispatch.model (e.g. model="{ROLE_MODEL}")" instruction becomes a note
  // that the role selects the variant and dispatch.model records the planner's tier intent only.
  text = text.replace(
    /Pass `model=dispatch\.model` \(the `model` field from `dispatch`, e\.g\.\s*`model="\{[A-Z_]+_MODEL\}"`\) and `dispatch\.nonce`/g,
    "The role's effort variant is applied centrally per opencode.json (reasoning-tier roles → the model's TOP effort, standard-tier roles → its SECOND); `dispatch.model` records the tier intent only. Pass `dispatch.nonce`"
  );
  // Standalone "You MUST pass model="{ROLE_MODEL}" … do not omit the model= line." dispatch
  // instructions that sit OUTSIDE the badge block (e.g. adapt's planner-dispatch note). The
  // badge-block rewrite handles the in-block ones; this catches the survivors.
  text = text.replace(
    /You MUST pass[^.]*?do not omit\s+the `model=` line\./g,
    "Dispatch the role via `subagent_type`; its effort variant resolves centrally from `opencode.json` (reasoning-tier → the model's TOP effort, standard-tier → its SECOND). Never pass a per-call `model=`."
  );
  // review-fix prose (phase4/phase5/finalize): "For every …, include the explicit model=
  // parameter … as documented above — never omit it" references the badge (now replaced to
  // say "do NOT pass model="). Whitespace-flexible (\s+) so newlines between any tokens match.
  // Rewrite the whole sentence to the opencode variant guidance.
  text = text.replace(
    /For every[^.]*?include\s+the\s+explicit\s+`model=`\s+parameter\s+in\s+the\s+`Agent\(\.\.\.\)`\s+call\s+exactly\s+as\s+documented\s+above\s+—\s+never\s+omit\s+it\./g,
    "Dispatch each such role via `subagent_type`; its effort variant resolves centrally from `opencode.json` (reasoning-tier roles use the model's TOP effort, standard-tier its SECOND). Never pass a per-call `model=`."
  );
  // Dispatch-card `Agent(` openings → the opencode `task` form. Scoped to the literal opening
  // (a line that is exactly `Agent(` immediately followed by an indented `subagent_type=` line)
  // so it rewrites ONLY the dispatch invocation and never prose mentions of the word "agent"
  // or inline `Agent(...)` code spans.
  text = text.replace(/^Agent\(\n(\s+subagent_type=)/gm, 'task(\n$1');
  // Prose: opencode-neutral wording for subagent references (was "Claude Code agent(s)").
  text = text.replace(/\bClaude Code agent(s?)\b/g, 'subagent$1');
  // Parenthesized then bare forms — real placeholders first, then literal ellipsis.
  text = text.replace(/\s*\(\s*model="\{[A-Z_]+_MODEL\}"\s*\)/g, '');
  text = text.replace(/\s*model="\{[A-Z_]+_MODEL\}"/g, '');
  text = text.replace(/\s*\(\s*model="\{\.\.\.\}"\s*\)/g, '');
  text = text.replace(/\s*model="\{\.\.\.\}"/g, '');
  // Dispatch-card placeholders leave a doubled comma (",,") when the model= line collapses
  // into the preceding subagent_type line; collapse any comma run back to a single comma.
  text = text.replace(/,{2,}/g, ',');
  // Tidy trailing whitespace left behind on affected lines.
  text = text.replace(/[ \t]+\n/g, '\n');
  // opencode path-flip (#539, Mechanism B): strip the adapt repair-loop auto-fallback
  // wording. The canonical "After repeated failure → a REAL decision: downgrade to full
  // path / discard+restart / STOP" lists three escapes; on adaptive-only-default opencode
  // the "downgrade to full path" option is dropped (the router's Path Intent section that
  // would re-set KAOLA_PATH=full is stripped above). Removing the "downgrade to full path / "
  // prefix leaves the remaining two options (discard+restart / STOP) coherent. "fall back to
  // full" only lived inside the stripped Path Intent section, so no separate handling here.
  text = text.replace(/downgrade to full path \/\s*/g, '');
  // opencode path-flip (#540, Mechanism B continuation): the Path Intent SECTION strip above
  // removed the "## Startup Step 0a-1 — Path Intent" heading + body, but three INLINE "Step 0a-1"
  // residue mentions survive elsewhere in workflow-next (post-#538 the step no longer exists, so
  // they are dangling dead prose). Two shapes — a parenthetical " (Step 0a-1)" (e.g.
  // "Resolve the path intent first (Step 0a-1)," → "Resolve the path intent first,";
  // "resolve the path intent (Step 0a-1) *before*" → "resolve the path intent *before*") and a
  // conjunction " or Step 0a-1" ("from KAOLA_PATH or Step 0a-1 judgment" → "from KAOLA_PATH
  // judgment") — both collapse cleanly to single-space prose. Canonical commands/*.md are never
  // touched (opencode-only, additive D-530-02). Scoped to the literal "Step 0a-1" — only
  // workflow-next.md carries it, so no over-strip risk.
  text = text.replace(/ \(Step 0a-1\)| or Step 0a-1/g, '');
  // #2 (opencode runtime label): the canonical workflow-next dispatch emits a claim invocation
  // carrying the literal `--runtime claude`. On the opencode edition that flag must stamp the
  // opencode runtime into workflow-state.md, so rewrite the literal to `--runtime opencode`.
  // Scoped to the exact flag token (word boundary) so prose mentions of "claude" are untouched.
  text = text.replace(/--runtime claude\b/g, '--runtime opencode');
  // #544 (folded into #543): final pass — rewrite the `kaola_script()` resolver + the "Re-derive
  // your own script path(s)" prose to the opencode-native path (no $CLAUDE_PLUGIN_ROOT, no
  // ~/.claude/kaola-workflow). Runs LAST so the resolver line (still Claude-shaped above) is
  // rewritten in full; the earlier transforms do not touch it.
  text = rewriteClaudeScriptPaths(text);
  return text;
}

function renderCommand(canonContent) {
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  lines.push('description: ' + (fm.description || ''));
  // opencode file-command frontmatter allows: description, agent, model, subtask.
  // Workflow commands orchestrate in the primary session and dispatch to the
  // .opencode/agent/* subagents via the task tool, so no `agent:` is set.
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

function reasoningRoles() {
  return listCanonAgents()
    .map(name => {
      const c = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
      return { name, tier: roleTier(parseFrontmatter(c).fm.model) };
    })
    .filter(r => r.tier === 'reasoning')
    .map(r => r.name)
    .sort();
}

// The Claude Code "higher" profile roles (agents/profiles/higher/*). These run on the
// OPUS tier under --profile=higher; the opencode edition mirrors that by placing them
// on the TOP effort variant. Derived from the dir so it stays in sync with canonical.
function higherProfileRoles() {
  const dir = path.join(CANON_AGENTS_DIR, 'profiles', 'higher');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
}

// Reasoning-tier roles for the opencode EFFORT design = canonical opus roles ∪ the
// Claude Code "higher" profile roles (mirror --profile=higher). The narrower
// reasoningRoles() (canonical opus only) stays for the opt-in MODEL-PIN path.
function topTierRoles() {
  const set = new Set(higherProfileRoles());
  for (const name of listCanonAgents()) {
    const c = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    if (roleTier(parseFrontmatter(c).fm.model) === 'reasoning') set.add(name);
  }
  return [...set].sort();
}

function standardTierRoles() {
  const top = new Set(topTierRoles());
  return listCanonAgents().filter(n => !top.has(n)).sort();
}

// Split "provider/model" → { providerId, modelId }. null when there is no slash.
function parseModelProvider(modelStr) {
  const s = String(modelStr || '').trim();
  const i = s.indexOf('/');
  if (i <= 0) return null;
  return { providerId: s.slice(0, i), modelId: s.slice(i + 1) };
}

// The inherited model the --adapt path targets: KAOLA_OPENCODE_INHERIT_MODEL env wins,
// else the "model" field of the global ~/.config/opencode/opencode.json. '' if neither.
function detectInheritModel() {
  const env = String(process.env.KAOLA_OPENCODE_INHERIT_MODEL || '').trim();
  if (env) return env;
  const home = process.env.HOME || require('os').homedir();
  const candidates = [
    path.join(home, '.config', 'opencode', 'opencode.json'),
    path.join(home, '.opencode', 'opencode.json'),
  ];
  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      const m = txt.match(/"model"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    } catch (_) { /* not present — keep looking */ }
  }
  return '';
}

function renderOpencodeJson(opts) {
  opts = opts || {};
  // Adaptive path: an explicit inherited model (provider/model) whose provider resolves under a
  // CONTRACT_EFFORT_TABLE contract renders the two-tier EFFORT-VARIANT config (the locked-in
  // install default). Everything else falls through to the neutral template.
  const inheritModel = String(opts.inheritModel || '').trim();
  const parsed = parseModelProvider(inheritModel);
  const profile = parsed ? schema.effortForProvider(parsed.providerId) : null;
  if (parsed && profile) return renderAdaptiveConfig(parsed, profile);
  return renderNeutralConfig(opts);
}

function renderAdaptiveConfig(parsed, profile) {
  const top = topTierRoles();
  const std = standardTierRoles();
  // #544: derive the contract label + knob from the provider's API contract (not its brand).
  // GLM-5.2 via z.ai → anthropic contract → thinking budget; openai/google/default → reasoningEffort.
  const contract = schema.contractForProvider(parsed.providerId);
  const contractLabel = ({
    anthropic: 'Anthropic contract → thinking budget',
    openai: 'OpenAI contract → reasoningEffort',
    google: 'Google contract → reasoningEffort',
    default: 'safe DEFAULT contract → reasoningEffort (no de-tier)',
  })[contract] || (contract + ' contract');
  const knobDescription = contract === 'anthropic' ? 'thinking.budgetTokens' : 'reasoningEffort';
  const entries = []
    .concat(top.map(r => [r, profile.top.variant]),
            std.map(r => [r, profile.second.variant]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [];
  lines.push('{');
  lines.push('  "$schema": "https://opencode.ai/config.json",');
  lines.push('  "default_agent": "build",');
  lines.push('');
  lines.push('  // Kaola-Workflow · opencode edition — TWO tiers as reasoning-EFFORT variants of your');
  lines.push('  // inherited model ' + parsed.providerId + '/' + parsed.modelId + ' (NO model is pinned — both tiers');
  lines.push('  // inherit the model you are already using in opencode). The effort KNOB is set by your');
  lines.push('  // provider\'s API CONTRACT (' + contractLabel + '; knob: ' + knobDescription + '), keyed by');
  lines.push('  // mapTier(tier, provider). tier → variant:');
  lines.push('  //   推理 (reasoning tier) → TOP effort variant "' + profile.top.variant + '".');
  lines.push('  //   普通 (standard tier)  → SECOND effort variant "' + profile.second.variant + '".');
  lines.push('  // Reasoning tier = canonical opus roles + the Claude Code "higher" profile roles');
  lines.push('  // (' + higherProfileRoles().join(', ') + '); all other roles run standard. Variants are');
  lines.push('  // defined under provider.* and selected per-role via agent.<role>.variant.');
  lines.push('  // ⚠ SWITCHING YOUR OPENCODE MODEL? Variant definitions are model-scoped');
  lines.push('  // (provider.<id>.models.<model>.variants.*) — opencode applies them from this file, with');
  lines.push('  // NO per-call override. To put these tiers on a DIFFERENT inherited model, regenerate:');
  lines.push('  //   KAOLA_OPENCODE_INHERIT_MODEL=<provider>/<model> node scripts/sync-opencode-edition.js --write-config --adapt');
  lines.push('  // (the runtime dispatch path re-resolves the provider on every dispatch regardless, so tier');
  lines.push('  // selection never silently de-tiers — but the variant DEFINITIONS above must be re-synced');
  lines.push('  // for the config side to match.)');
  lines.push('  "provider": {');
  lines.push('    "' + parsed.providerId + '": {');
  lines.push('      "models": {');
  lines.push('        "' + parsed.modelId + '": {');
  lines.push('          "variants": {');
  lines.push('            "' + profile.top.variant + '": ' + JSON.stringify(profile.top.options) + ',');
  lines.push('            "' + profile.second.variant + '": ' + JSON.stringify(profile.second.options));
  lines.push('          }');
  lines.push('        }');
  lines.push('      }');
  lines.push('    }');
  lines.push('  },');
  lines.push('  "agent": {');
  for (let i = 0; i < entries.length; i++) {
    const comma = i < entries.length - 1 ? ',' : '';
    lines.push('    "' + entries[i][0] + '": { "variant": "' + entries[i][1] + '" }' + comma);
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n') + '\n';
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
function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function writeAgents() {
  ensureDir(OUT_AGENT_DIR);
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name);
    const dest = path.join(OUT_AGENT_DIR, name + '.md');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      fs.writeFileSync(dest, out);
      console.log('generated  .opencode/agent/' + name + '.md');
      wrote++;
    }
  }
  return wrote;
}

function writeCommands() {
  ensureDir(OUT_COMMAND_DIR);
  let wrote = 0;
  for (const file of listCanonCommands()) {
    const canon = fs.readFileSync(path.join(CANON_COMMANDS_DIR, file), 'utf8');
    const out = renderCommand(canon);
    const dest = path.join(OUT_COMMAND_DIR, file);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      fs.writeFileSync(dest, out);
      console.log('generated  .opencode/command/' + file);
      wrote++;
    }
  }
  return wrote;
}

// Build the render opts for the --adapt path: detect the inherited model and, if found,
// hand it to renderOpencodeJson so it emits the two-tier EFFORT-VARIANT config. A missing
// detection degrades to {} (the neutral template) with a warning.
function buildAdaptOpts(adapt) {
  if (!adapt) return {};
  const inheritModel = detectInheritModel();
  if (!inheritModel) {
    console.warn('sync-opencode-edition: --adapt could not detect an inherited model; writing the neutral template.');
  }
  return inheritModel ? { inheritModel } : {};
}

function writeConfig(force, adapt) {
  if (!force && fs.existsSync(OPENCODE_JSON)) {
    console.log('preserve   opencode.json (user-owned; use --write-config to overwrite)');
    return 0;
  }
  const opts = buildAdaptOpts(adapt);
  fs.writeFileSync(OPENCODE_JSON, renderOpencodeJson(opts));
  const tag = (adapt && opts.inheritModel) ? ' (adapted → ' + opts.inheritModel + ')' : '';
  console.log((force ? 'rewrote    ' : 'seeded     ') + 'opencode.json' + tag);
  return 1;
}

function writeHooks() {
  ensureDir(OUT_HOOKS_DIR);
  let wrote = 0;
  for (const script of HOOK_SCRIPTS) {
    const src = path.join(CANON_HOOKS_DIR, script);
    const dest = path.join(OUT_HOOKS_DIR, script);
    const content = fs.readFileSync(src, 'utf8');
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log('copied     .opencode/hooks/' + script);
      wrote++;
    }
  }
  return wrote;
}

function runWrite(configForce, adapt) {
  const a = writeAgents();
  const c = writeCommands();
  const h = writeHooks();
  const j = writeConfig(configForce, adapt);
  const total = a + c + h + j;
  console.log('sync-opencode-edition: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

// Installer entrypoint: write the template opencode.json to an arbitrary path
// (honors the KAOLA_OPENCODE_*_MODEL pin env vars). The installer guards the
// "preserve existing" semantics; this unconditionally writes the target. With --adapt
// it emits the two-tier EFFORT-VARIANT config for the detected inherited model.
function runWriteConfigTo(target, adapt) {
  const opts = buildAdaptOpts(adapt);
  fs.writeFileSync(target, renderOpencodeJson(opts));
  const tag = (adapt && opts.inheritModel) ? ' (adapted → ' + opts.inheritModel + ')' : '';
  console.log('seeded     ' + target + tag);
}

function runCheck() {
  const mismatches = [];
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = '.opencode/agent/' + name + '.md';
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated agent' });
      continue;
    }
    const expected = renderAgent(canon, name);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const file of listCanonCommands()) {
    const canon = read('commands/' + file);
    const rel = '.opencode/command/' + file;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated command' });
      continue;
    }
    const expected = renderCommand(canon);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = '.opencode/hooks/' + script;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (read(rel) !== read('hooks/' + script)) mismatches.push({ rel, reason: 'drifted from canonical hooks/' });
  }
  if (mismatches.length) {
    console.error('sync-opencode-edition: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-opencode-edition.js --write');
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands().length;
  console.log('sync-opencode-edition: ' + na + ' agent(s) + ' + nc + ' command(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-opencode-edition.js (--write | --write-config | --write-config-to PATH | --check) [--adapt]\n'
    + '  --write              regenerate .opencode/agent + .opencode/command; seed opencode.json if absent\n'
    + '  --write-config       (re)write this repo opencode.json from the template (clobbers edits)\n'
    + '  --write-config-to P  write the template opencode.json to path P (installer use)\n'
    + '  --adapt              modifier: render the two-tier EFFORT-VARIANT config for the inherited\n'
    + '                       model (KAOLA_OPENCODE_INHERIT_MODEL env, else global opencode.json "model")\n'
    + '  --check              assert generated files are in parity with canonical\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const adapt = argv.includes('--adapt');
  const positional = argv.filter(a => a !== '--adapt');
  const arg = positional[0];
  if (arg === '--write') return runWrite(false, adapt);
  if (arg === '--write-config') return runWrite(true, adapt);
  if (arg === '--write-config-to') {
    const target = positional[1];
    if (!target) { console.error('--write-config-to requires a path'); process.exitCode = 2; return; }
    return runWriteConfigTo(target, adapt);
  }
  if (arg === '--check') return runCheck();
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, renderOpencodeJson, renderAdaptiveConfig, renderNeutralConfig,
  transformCommandBody, opencodeAgentSuffix, rewriteClaudeScriptPaths, OPENCODE_KAOLA_SCRIPT,
  parseFrontmatter, parseTools, roleTier, reasoningRoles,
  higherProfileRoles, topTierRoles, standardTierRoles,
  parseModelProvider, detectInheritModel, buildAdaptOpts,
  listCanonAgents, listCanonCommands,
  ENV_STANDARD_MODEL, ENV_REASONING_MODEL,
  // Legacy aliases (env-derived; empty by default now that pins are opt-in).
  DEFAULT_STANDARD_MODEL: ENV_STANDARD_MODEL,
  DEFAULT_REASONING_MODEL: ENV_REASONING_MODEL,
  CANON_AGENTS_DIR, CANON_COMMANDS_DIR, CANON_HOOKS_DIR,
  OUT_AGENT_DIR, OUT_COMMAND_DIR, OUT_HOOKS_DIR, OPENCODE_JSON, REPO,
  HOOK_SCRIPTS,
};
