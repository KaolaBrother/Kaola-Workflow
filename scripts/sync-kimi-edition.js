#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-kimi-edition.js — generate the Kimi Code runtime edition from canonical.
//
// Kimi Code is a coding-agent RUNTIME (like Codex/opencode), not a git forge, so it
// does NOT ride the install.sh --forge= (github/gitlab/gitea) machinery. It is
// delivered the Kimi-native way: directory-form Skills under `.kimi/skills/<name>/
// SKILL.md` (Kimi auto-registers each activated skill as the slash command `/<name>`,
// so command skills keep their canonical basenames) plus `.kimi/hooks/` (byte-copied
// shell hooks + a generated `kimi-hooks.toml` fragment the installer merges into the
// global `${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml`). This script is the
// generate-from-canonical twin of sync-opencode-edition.js: deterministic,
// idempotent, and parity-checked by test-kimi-edition.js.
//
// ONE model tier: there is NO Reasoning/Standard split on Kimi (the Codex inherit
// precedent). Kimi Code's Agent tool supports only three built-in subagent types
// (`coder`, `explore`, `plan`) and has no per-dispatch model override — every
// subagent inherits the session model. The 16 canonical roles therefore ship as
// ROLE-CONTRACT Skills (`kaola-role-<role>`): the command dispatch cards are
// rewritten to `subagent_type="coder"` (write roles) / `"explore"` (read-only
// roles — computed from the canonical frontmatter `tools:` array, never hand-listed)
// plus a prompt-prefix instruction to invoke the matching role Skill. The canonical
// `model: opus` tier and the Claude "higher" profiles (agents/profiles/higher/*)
// are meaningless under inherit and are skipped entirely.
//
//   --write   regenerate .kimi/skills + .kimi/hooks from canonical.
//   --check   assert the generated tree is in byte-parity with a fresh render
//             (exit 1 on drift).
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const reviewerGen = require('./generate-reviewer-profiles');

const REPO = path.resolve(__dirname, '..');
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_COMMANDS_DIR = path.join(REPO, 'commands');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');
const OUT_SKILLS_DIR = path.join(REPO, '.kimi', 'skills');
const OUT_HOOKS_DIR = path.join(REPO, '.kimi', 'hooks');

// Reviewer gate roles (code-reviewer, adversarial-verifier, security-reviewer) carry their
// schema-2 identity through the kimi render: behavior_contract_version / behavior_contract_hash
// are preserved from canonical, and a fresh resolved_profile_hash is re-stamped over the final
// kimi bytes (the canonical Claude hash never binds post-transform bytes — the same discipline
// as the opencode renderAgent). The fields ship in a body HTML comment block at column zero so
// the Skill frontmatter stays name+description only.
const REVIEWER_ROLES = new Set(reviewerGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

// Runtime-neutral hook scripts (byte-copied from canonical hooks/ into the kimi
// edition). hooks.json is Claude-shaped and is NOT copied — its entries are
// re-expressed as the Kimi [[hooks]] TOML fragment below (renderKimiHooksToml).
// Same allowlist discipline as the opencode generator's HOOK_SCRIPTS.
const HOOK_SCRIPTS = [
  'kaola-workflow-subagent-dispatch-log.sh',
];

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

function listCanonAgents() {
  // Top-level agents/*.md only — the profiles/ directory (agents/profiles/higher/*,
  // the four Claude Code opus profiles) is a directory and never matches *.md here,
  // so it is skipped by construction on the inherit-model kimi edition.
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
}

function listCanonCommands() {
  return fs.readdirSync(CANON_COMMANDS_DIR).filter(f => f.endsWith('.md'));
}

// --- role-kind resolution (read-only set computed from canonical, never hardcoded) --
//
// Kimi Code's Agent tool has no named custom subagents — only `coder` (full tools),
// `explore` (read-only), and `plan`. A canonical role is READ-ONLY (→ `explore`)
// when its frontmatter `tools:` array lacks both Write and Edit (same test the
// opencode renderAgent uses for its permission block); everything else → `coder`.
let ROLE_KIND_CACHE = null;
function roleKindMap() {
  if (ROLE_KIND_CACHE) return ROLE_KIND_CACHE;
  const map = {};
  for (const name of listCanonAgents()) {
    const c = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const toolSet = lowerSet(parseTools(parseFrontmatter(c).fm.tools));
    map[name] = (toolSet.has('write') || toolSet.has('edit')) ? 'coder' : 'explore';
  }
  ROLE_KIND_CACHE = map;
  return map;
}

function readOnlyRoles() {
  const map = roleKindMap();
  return Object.keys(map).filter(n => map[n] === 'explore').sort();
}

// --- renderers (pure; exported for parity test) ---

function renderAgent(canonContent, agentName) {
  const { fm, body } = parseFrontmatter(canonContent);
  const isReviewer = REVIEWER_ROLES.has(agentName);
  const lines = ['---'];
  lines.push('name: kaola-role-' + agentName);
  lines.push('description: ' + rewriteClaudeModelNouns(fm.description || ''));
  // `tools:` and `model:` are DROPPED: a Kimi Skill is a prompt package, not an
  // agent definition, and every subagent inherits the session model (no tiers).
  lines.push('---');
  lines.push('');
  if (isReviewer) {
    // Schema-2 reviewer identity as a body HTML comment at column zero (the runtime's
    // field regexes are line-anchored), keeping the frontmatter name+description only.
    // behavior_contract_version/hash are preserved from canonical; resolved_profile_hash
    // is re-stamped over the final kimi bytes below (the canonical Claude hash never
    // binds post-transform bytes — the opencode renderAgent discipline).
    lines.push('<!-- kimi-reviewer-identity:start -->');
    if (fm.behavior_contract_version) lines.push('behavior_contract_version: ' + fm.behavior_contract_version);
    if (fm.behavior_contract_hash) lines.push('behavior_contract_hash: ' + fm.behavior_contract_hash);
    lines.push('resolved_profile_hash: ' + ZERO_HASH);
    lines.push('<!-- kimi-reviewer-identity:end -->');
    lines.push('');
  }
  // Same additive-generation-only discipline as the opencode renderAgent (#544/#609):
  // the Claude→kimi script-path rewrite and the Claude model-noun rewrite apply to
  // the RENDERED body so canonical agents/*.md are never touched (D-530-02).
  // rewriteClaudeScriptPaths is a no-op when the patterns are absent (only contractor
  // ships `kaola_script()` definitions; contractor + workflow-planner ship the
  // "Re-derive" prose parenthetical). The scoped `--runtime claude` → `--runtime kimi`
  // rewrite mirrors transformCommandBody: workflow-planner's claim-startup invocation
  // must stamp the kimi runtime into workflow-state.md on this edition.
  const bodyText = rewriteClaudeModelNouns(rewriteClaudeScriptPaths(body))
    .replace(/--runtime claude\b/g, '--runtime kimi')
    .trim().replace(/\s+$/, '');
  lines.push(bodyText);
  let content = lines.join('\n') + '\n';
  if (isReviewer) {
    const normalized = reviewerGen.normalizeResolvedProfileHash(content);
    content = normalized.replace(ZERO_HASH, reviewerGen.sha256(normalized));
  }
  return content;
}

// kimi-native `kaola_script()` shell resolver (the kimi twin of #544's opencode
// resolver). The canonical resolver ships a Claude search path verbatim —
// `$CLAUDE_PLUGIN_ROOT` + `$HOME/.claude/kaola-workflow` (contractor's copy ALSO adds
// the gitlab/gitea forge dirs). On the kimi edition that is a Claude-path leak: kimi
// resolves scripts via the kimi home dir honoring `$KIMI_CODE_HOME` (default
// `~/.kimi-code`), which is where install-kimi.sh deploys the support scripts. This
// constant is the wholesale replacement for every `kaola_script(){ ... return 1; }`
// definition line (both the 3-path command form and the 5-path contractor form
// collapse to this single kimi form — kimi is runtime-only, no forge axis). The
// self-repo priority rule is preserved: inside the kaola-workflow repo itself,
// `./scripts` wins; anywhere else the installed copy wins. Single-quoted JS literal:
// inner `'`→`\'`, the shell `printf '%s\n'` backslash-n is `\\n` so the GENERATED
// .md carries a literal `\n` (not a JS newline that would split the one-liner).
const KIMI_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

// Rewrite the Claude script-path surface to kimi-native (kimi twin of the opencode
// rewriteClaudeScriptPaths). Applied to BOTH command bodies (via transformCommandBody)
// and agent bodies (via renderAgent) so the committed .kimi/ tree has ZERO
// `$CLAUDE_PLUGIN_ROOT` / `$HOME/.claude/kaola-workflow` tokens. Canonical sources are
// NEVER touched (additive D-530-02) — only the generated outputs. Replacement-for-
// replacement mirror of the opencode version:
//   (a) whole `kaola_script(){ ... }` definition lines → KIMI_KAOLA_SCRIPT;
//   (b) the "Re-derive your own script path(s)" prose parenthetical → the kimi list;
//   (c) the standalone REPLAN_SCRIPT resolver (two-line fallback pair + the for-loop
//       candidate pair) → the single kimi-native candidate.
function rewriteClaudeScriptPaths(text) {
  // (a) Whole resolver definition line (indent-preserving). The resolver is always a
  // single line; `.*` does not cross newlines (no `s` flag), so each definition is
  // replaced independently.
  text = text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + KIMI_KAOLA_SCRIPT);
  // (b) The path-list parenthetical in agent prose (whitespace-flexible across the two
  // agents' line breaks). Scoped to the literal "(prefer `$CLAUDE_PLUGIN_ROOT/scripts`,
  // then … then `./scripts`)" shape — only contractor + workflow-planner carry it.
  text = text.replace(
    /\(prefer\s+`\$CLAUDE_PLUGIN_ROOT\/scripts`,\s+then\s+`\$HOME\/\.claude\/kaola-workflow\/scripts`,\s+then\s+`\.\/scripts`\)/g,
    '(prefer `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts`, then `./scripts`)'
  );
  // (c1) The two-line REPLAN_SCRIPT fallback pair (adapt + finalize): a
  // $CLAUDE_PLUGIN_ROOT line followed by a $HOME/.claude line → ONE kimi-native line.
  text = text.replace(
    /^([ \t]*)\[ -f "\$REPLAN_SCRIPT" \] \|\| REPLAN_SCRIPT="\$\{CLAUDE_PLUGIN_ROOT:\+\$CLAUDE_PLUGIN_ROOT\/scripts\/kaola-workflow-replan\.js\}"\n[ \t]*\[ -f "\$REPLAN_SCRIPT" \] \|\| REPLAN_SCRIPT="\$HOME\/\.claude\/kaola-workflow\/scripts\/kaola-workflow-replan\.js"$/gm,
    '$1[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/kaola-workflow-replan.js"'
  );
  // (c2) The for-loop path list (plan-run + workflow-next): the Claude pair inside the
  // candidate list → the single kimi-native candidate.
  text = text.replace(
    /"\$\{CLAUDE_PLUGIN_ROOT:\+\$CLAUDE_PLUGIN_ROOT\/scripts\/kaola-workflow-replan\.js\}" "\$HOME\/\.claude\/kaola-workflow\/scripts\/kaola-workflow-replan\.js"/g,
    '"${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/kaola-workflow-replan.js"'
  );
  return text;
}

// Rewrite Claude model-NOUN prose for kimi (the kimi twin of #609's opencode
// rewriteClaudeModelNouns). Kimi has NO model tiers at dispatch time — every subagent
// inherits the session model — so B2 prose ("Opus"/"Sonnet" used as if they were this
// runtime's actual models) rewrites to inherit vocabulary. B1 — the lowercase,
// backtick-wrapped plan-ledger tier tokens (`opus`/`sonnet`, `{reasoning, standard}`)
// — is the portable cross-edition contract and is NEVER matched (each pattern below
// targets one exact capitalized noun-phrase shape). Replacement text never
// reintroduces "Opus"/"Sonnet", so repeated application is a no-op (idempotent).
// Applied to BOTH agent bodies/descriptions (via renderAgent) and command
// bodies/descriptions (via renderCommand) — canonical is never touched.
function rewriteClaudeModelNouns(text) {
  // "Reasoning-class (Opus)" / "reasoning-class (Opus)" — synthesizer's description +
  // floor note (case-preserving on the leading letter so both forms rewrite cleanly).
  text = text.replace(/\b([Rr])easoning-class \(Opus\)/g,
    (m, first) => (first === 'R' ? 'S' : 's') + 'ession-model (inherited)');
  // "reasoning-class **Opus**-floor `synthesizer`" — plan-run's merge-conflict repair
  // prose (whitespace-flexible \s+ so the mid-sentence line wrap still matches).
  text = text.replace(/reasoning-class\s+\*\*Opus\*\*-floor/g, 'session-model-floor');
  // "Opus orchestrator" — workflow-planner + contractor both use this exact noun
  // phrase (whitespace-flexible \s+ — canonical prose re-wraps split it across lines).
  text = text.replace(/\bOpus\s+orchestrator\b/g, 'session-model orchestrator');
  // "separate Sonnet role" — contractor's hard-boundary heading prose.
  text = text.replace(/\bseparate Sonnet role\b/g, 'separate inherited-model role');
  // "stay on **Sonnet** even under" / "never promoted to Opus" — contractor's
  // floor-pin bullet.
  text = text.replace(/\bstay on \*\*Sonnet\*\* even under\b/g, 'stay on the inherited session model even under');
  text = text.replace(/\bnever promoted to Opus\b/g, 'never promoted away from the session model');
  // "Opus front end" — workflow-next's router-rules prose.
  text = text.replace(/\bOpus front end\b/g, 'session-model front end');
  // "**`workflow-planner`** (Opus)" / "**`workflow-planner`** subagent (Opus)" —
  // adapt's two Phase-0 mentions (both collapse to the same form).
  text = text.replace(/\*\*`workflow-planner`\*\*( subagent)? \(Opus\)/g, '**`workflow-planner`**$1 (session model)');
  // "belongs on Sonnet per CLAUDE.md model rules" — doc-updater's vendor
  // local-override note.
  text = text.replace(/\bbelongs on Sonnet per\b/g, 'belongs on the inherited session model per');
  return text;
}

function transformCommandBody(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Strip the "## Agent Model Badge" section (where opencode substitutes its
    // Effort Variant Resolution block, the kimi edition has no badge analogue at
    // all — there is no per-dispatch model to document) and replace its body with
    // the one-line kimi-true guidance, since canonical dispatch prose ("MUST pass
    // model=…") now lives entirely inside this section for every command that has
    // it (a standalone occurrence outside the block, if any, is separately
    // rewritten below). Detect the heading, skip its flat body up to the next
    // heading line, and leave a single-blank seam around the replacement line.
    if (/^##\s+Agent Model Badge\s*$/.test(line)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      out.push('Never pass a per-call model override; sub-agents inherit the session model.');
      out.push('');
      i++;
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
      continue;
    }
    // kimi path-flip (mirror of the opencode #539 Mechanism B strip): kimi is
    // adaptive-only-default, so the canonical "## Startup Step … — Path Intent"
    // section (KAOLA_ENABLE_ADAPTIVE switch resolution + Branch A/B prose) is DROPPED
    // at generation time. Matched by the stable "Path Intent" TITLE, not the volatile
    // step number; the body-skip stops at the next SIBLING `##` heading (the section
    // nests `### Branch A`/`### Branch B` children). Rewind trailing blanks so the
    // excision leaves a single-blank seam. Canonical is never touched.
    if (/^##\s.*\bPath Intent\b/.test(line)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      i++;
      while (i < lines.length && !/^##\s/.test(lines[i])) i++;
      continue;
    }
    // kimi strip (mirror of the opencode workflow-init Codex-note cleanup): the
    // "> **Codex hooks note:** …" blockquote is Codex-specific install guidance with
    // no kimi meaning (kimi delivers hooks via install-kimi.sh + kimi-hooks.toml).
    // Only workflow-init carries it → no over-strip risk.
    if (/^>\s*\*\*Codex hooks note:/.test(line)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      i++;
      while (i < lines.length && /^>/.test(lines[i])) i++;
      while (i < lines.length && lines[i].trim() === '') i++;
      continue;
    }
    out.push(line);
    i++;
  }
  let text = out.join('\n');
  // Dispatch-card rewrite (kimi-specific). Canonical dispatch cards name a kaola ROLE
  // in subagent_type plus an install-time model= placeholder:
  //   Agent(
  //     subagent_type="tdd-guide",
  //     model="{TDD_GUIDE_MODEL}",
  //     description="...",
  //     prompt="..."
  //   )
  // Kimi Code's Agent tool has no named custom subagents, so the card is rewritten to
  // the built-in type for the role's kind (read-only roles → "explore", write roles →
  // "coder"; roleKindMap is computed from canonical frontmatter, never hand-listed)
  // and the Skill-contract instruction is prepended to the prompt text so the spawned
  // subagent loads the role contract itself. Scoped to the literal card opening
  // (`Agent(` + indented subagent_type= line) and to roles present in the canonical
  // map — prose mentions of `Agent(...)` and unknown role names pass through
  // untouched. Runs BEFORE the generic {X_MODEL} strip below, which then collapses
  // the now-orphaned model= line (and its comma) exactly as on opencode.
  const kinds = roleKindMap();
  text = text.replace(
    /Agent\(\n(\s+)subagent_type="([^"]+)",([\s\S]*?)prompt="/g,
    (m, indent, role, mid) => {
      const kind = kinds[role];
      if (!kind) return m;
      return 'Agent(\n' + indent + 'subagent_type="' + kind + '",' + mid
        + 'prompt="First invoke the `kaola-role-' + role + '` Skill and follow its contract for the entire task. ';
    }
  );
  // Standalone "You MUST pass model="{X_MODEL}" … do not omit the `model=` line."
  // dispatch instructions that sit OUTSIDE the (now stripped) badge block — e.g.
  // adapt's planner-dispatch note (whitespace-tolerant: canonical wraps the tail
  // across a line break). Kimi has no per-dispatch model override at all.
  text = text.replace(
    /You MUST pass[^.]*?do not omit\s+the `model=` line\./g,
    'Never pass a per-call model override; sub-agents inherit the session model.'
  );
  // review-fix prose (phase4/phase5/finalize): "For every …, include the explicit
  // model= parameter in the `Agent(...)` call exactly as documented above — never
  // omit it." references the (stripped) badge. Rewrite to the kimi inherit guidance,
  // keeping the dispatch descriptor so the sentence still reads in context.
  text = text.replace(
    /For every ([^.]*?), include\s+the\s+explicit\s+`model=`\s+parameter\s+in\s+the\s+`Agent\(\.\.\.\)`\s+call\s+exactly\s+as\s+documented\s+above\s+—\s+never\s+omit\s+it\./g,
    'For every $1, never pass a per-call model override; sub-agents inherit the session model.'
  );
  // workflow-next's issue-scout dispatch names `model="{ISSUE_SCOUT_MODEL}"` plus an
  // install-time resolution note that is FALSE for kimi (no install-time render step;
  // the session model is inherited). Rewrite the whole paragraph to kimi-true wording
  // BEFORE the generic strip runs. The scout is a read-only role → `explore`.
  text = text.replace(
    /Dispatch it with `model="\{ISSUE_SCOUT_MODEL\}"` — the governed issue-scout tier\.\s+The model above is resolved at install time; the router does not substitute it\./g,
    'Dispatch it via `subagent_type="explore"` and begin its prompt with: First invoke the `kaola-role-issue-scout` Skill and follow its contract for the entire task. Never pass a per-call model override; sub-agents inherit the session model.'
  );
  // Prose: kimi-neutral wording for subagent references (was "Claude Code agent(s)").
  text = text.replace(/\bClaude Code agent(s?)\b/g, 'subagent$1');
  // Parenthesized then bare forms — real placeholders first, then literal ellipsis
  // (same regex family as the opencode transform).
  text = text.replace(/\s*\(\s*model="\{[A-Z_]+_MODEL\}"\s*\)/g, '');
  text = text.replace(/\s*model="\{[A-Z_]+_MODEL\}"/g, '');
  text = text.replace(/\s*\(\s*model="\{\.\.\.\}"\s*\)/g, '');
  text = text.replace(/\s*model="\{\.\.\.\}"/g, '');
  // Dispatch-card placeholders leave a doubled comma (",,") when the model= line
  // collapses into the preceding subagent_type line; collapse any comma run back to a
  // single comma.
  text = text.replace(/,{2,}/g, ',');
  // Tidy trailing whitespace left behind on affected lines.
  text = text.replace(/[ \t]+\n/g, '\n');
  // Inline "Step 0a-1" residue mentions in workflow-next (the Path Intent SECTION
  // strip above removed the step, leaving these dangling). Two shapes — a
  // parenthetical " (Step 0a-1)" and a conjunction " or Step 0a-1" — both collapse
  // cleanly (same scoped strip as the opencode transform; only workflow-next.md
  // carries it, so no over-strip risk).
  text = text.replace(/ \(Step 0a-1\)| or Step 0a-1/g, '');
  // The canonical workflow-next dispatch emits a claim invocation carrying the
  // literal `--runtime claude`; on the kimi edition the flag must stamp the kimi
  // runtime into workflow-state.md. Scoped to the exact flag token (word boundary) so
  // prose mentions of "claude" are untouched.
  text = text.replace(/--runtime claude\b/g, '--runtime kimi');
  // Final pass — rewrite the `kaola_script()` resolver + the "Re-derive your own
  // script path(s)" prose to the kimi-native path (no $CLAUDE_PLUGIN_ROOT, no
  // ~/.claude/kaola-workflow). Runs LAST so the resolver line (still Claude-shaped
  // above) is rewritten in full; the earlier transforms do not touch it.
  text = rewriteClaudeScriptPaths(text);
  // Rewrite B2 Claude model-noun prose to inherit vocabulary — the command-body twin
  // of the renderAgent rewrite above.
  text = rewriteClaudeModelNouns(text);
  return text;
}

function renderCommand(canonContent, commandName) {
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  // Directory-form Kimi Skill: `name` + `description` are REQUIRED. The name MUST
  // stay the canonical basename so Kimi registers the same slash command
  // (`/workflow-next`, `/kaola-workflow-finalize`, …) as every other edition.
  lines.push('name: ' + commandName);
  lines.push('description: ' + rewriteClaudeModelNouns(fm.description || ''));
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

// The generated Kimi hooks fragment. Maps the two canonical hooks/hooks.json
// entries to Kimi [[hooks]] rules: SubagentStart → dispatch-log (matcher
// omitted), and the Claude SessionStart"compact" entry → PostCompact (Kimi's
// semantic counterpart) running the compact-context script. `__KIMI_HOME__` is
// a placeholder token the installer substitutes with the real
// ${KIMI_CODE_HOME:-$HOME/.kimi-code} path at install time; the >>> / <<<
// marker comments delimit the managed block for idempotent merges.
function renderKimiHooksToml() {
  return [
    '# >>> kaola-workflow kimi hooks',
    '[[hooks]]',
    'event = "SubagentStart"',
    'command = "bash __KIMI_HOME__/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh"',
    'timeout = 30',
    '',
    '[[hooks]]',
    'event = "PostCompact"',
    'command = "node __KIMI_HOME__/kaola-workflow/scripts/kaola-workflow-compact-context.js"',
    'timeout = 5',
    '# <<< kaola-workflow kimi hooks',
    '',
  ].join('\n');
}

// --- IO helpers ---
function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function skillRel(dirName) {
  return '.kimi/skills/' + dirName + '/SKILL.md';
}

// The EXACT set of skill directories a fresh render produces: one `kaola-role-<agent>`
// per canonical agent plus one `<command>` per canonical command. Anything else in
// .kimi/skills/ is a retired surface (e.g. the deleted fast/full `kaola-workflow-fast`
// / `-phase{1..5}` commands) that a deterministic, idempotent mirror must remove — the
// generator wrote canonical surfaces but never pruned, so --check reported parity while
// the edition suite's exact-set assertion (K1) failed on the leftovers.
function expectedSkillDirs() {
  const set = new Set();
  for (const name of listCanonAgents()) set.add('kaola-role-' + name);
  for (const file of listCanonCommands()) set.add(file.slice(0, -3));
  return set;
}

function retiredSkillDirs() {
  const dir = path.join(REPO, '.kimi/skills');
  if (!fs.existsSync(dir)) return [];
  const expected = expectedSkillDirs();
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !expected.has(e.name))
    .map(e => e.name);
}

function pruneSkills() {
  let removed = 0;
  for (const name of retiredSkillDirs()) {
    fs.rmSync(path.join(REPO, '.kimi/skills', name), { recursive: true, force: true });
    console.log('pruned     .kimi/skills/' + name + ' (retired surface)');
    removed++;
  }
  return removed;
}

function writeAgents() {
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name);
    const dest = path.join(REPO, skillRel('kaola-role-' + name));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + skillRel('kaola-role-' + name));
      wrote++;
    }
  }
  return wrote;
}

function writeCommands() {
  let wrote = 0;
  for (const file of listCanonCommands()) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(path.join(CANON_COMMANDS_DIR, file), 'utf8');
    const out = renderCommand(canon, name);
    const dest = path.join(REPO, skillRel(name));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + skillRel(name));
      wrote++;
    }
  }
  return wrote;
}

// Kimi hook-payload adaptation. Canonical hooks are byte-copied EXCEPT where Kimi's
// event payload uses different field names than Claude's (verified empirically against
// kimi-code 0.26.0):
//   - SubagentStart: Kimi names the sub-agent `agent_name` (Claude: `agent_type`).
// Each adaptation is a single anchored string rewrite; a missing or ambiguous anchor
// is a HARD ERROR so a canonical edit that drifts the anchor fails loudly here instead
// of silently shipping an unadapted hook. PostCompact (cwd) is payload-compatible
// and stays byte-identical.
const HOOK_ADAPTATIONS = {
  'kaola-workflow-subagent-dispatch-log.sh': [
    ["p.agent_type||''", "(p.agent_type||p.agent_name||'')"],
  ],
};

function adaptHookForKimi(script, content) {
  const rules = HOOK_ADAPTATIONS[script] || [];
  let out = content;
  for (const pair of rules) {
    const anchor = pair[0];
    const replacement = pair[1];
    if (!out.includes(anchor)) {
      throw new Error('kimi hook adaptation anchor not found in canonical ' + script + ': ' + anchor);
    }
    if (out.indexOf(anchor) !== out.lastIndexOf(anchor)) {
      throw new Error('kimi hook adaptation anchor is not unique in canonical ' + script + ': ' + anchor);
    }
    out = out.replace(anchor, replacement);
  }
  if (rules.length) {
    out = '# kimi-edition: payload-adapted copy (Kimi hook field names) — generated by\n'
      + '# scripts/sync-kimi-edition.js from canonical hooks/' + script + '; do not hand-edit.\n'
      + out;
  }
  return out;
}

function writeHooks() {
  ensureDir(OUT_HOOKS_DIR);
  let wrote = 0;
  for (const script of HOOK_SCRIPTS) {
    const src = path.join(CANON_HOOKS_DIR, script);
    const dest = path.join(OUT_HOOKS_DIR, script);
    const content = adaptHookForKimi(script, fs.readFileSync(src, 'utf8'));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log((HOOK_ADAPTATIONS[script] ? 'adapted    ' : 'copied     ') + '.kimi/hooks/' + script);
      wrote++;
    }
  }
  const toml = renderKimiHooksToml();
  const tomlDest = path.join(OUT_HOOKS_DIR, 'kimi-hooks.toml');
  if (!fs.existsSync(tomlDest) || fs.readFileSync(tomlDest, 'utf8') !== toml) {
    fs.writeFileSync(tomlDest, toml);
    console.log('generated  .kimi/hooks/kimi-hooks.toml');
    wrote++;
  }
  return wrote;
}

function runWrite() {
  const a = writeAgents();
  const c = writeCommands();
  const h = writeHooks();
  const p = pruneSkills();
  const total = a + c + h + p;
  console.log('sync-kimi-edition: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

function runCheck() {
  const mismatches = [];
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = skillRel('kaola-role-' + name);
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated role skill' });
      continue;
    }
    const expected = renderAgent(canon, name);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const file of listCanonCommands()) {
    const name = file.slice(0, -3);
    const canon = read('commands/' + file);
    const rel = skillRel(name);
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated command skill' });
      continue;
    }
    const expected = renderCommand(canon, name);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = '.kimi/hooks/' + script;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (read(rel) !== adaptHookForKimi(script, read('hooks/' + script))) mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
  }
  {
    const rel = '.kimi/hooks/kimi-hooks.toml';
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated hooks fragment' });
    } else if (read(rel) !== renderKimiHooksToml()) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  for (const name of retiredSkillDirs()) {
    mismatches.push({ rel: '.kimi/skills/' + name, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  if (mismatches.length) {
    console.error('sync-kimi-edition: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-kimi-edition.js --write');
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands().length;
  console.log('sync-kimi-edition: ' + na + ' role skill(s) + ' + nc + ' command skill(s) + '
    + (HOOK_SCRIPTS.length + 1) + ' hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-kimi-edition.js (--write | --check)\n'
    + '  --write   regenerate .kimi/skills + .kimi/hooks from canonical\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
  );
}

function main() {
  const arg = process.argv[2];
  if (arg === '--write') return runWrite();
  if (arg === '--check') return runCheck();
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, rewriteClaudeModelNouns, KIMI_KAOLA_SCRIPT,
  renderKimiHooksToml,
  adaptHookForKimi, HOOK_ADAPTATIONS,
  parseFrontmatter, parseTools,
  roleKindMap, readOnlyRoles,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_COMMANDS_DIR, CANON_HOOKS_DIR,
  OUT_SKILLS_DIR, OUT_HOOKS_DIR, REPO,
  HOOK_SCRIPTS,
};
