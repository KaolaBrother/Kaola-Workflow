#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-kimi-edition.js — generate the Kimi Code runtime edition from canonical.
//
// Kimi Code is a coding-agent RUNTIME (like Codex/opencode), not a git forge, and it
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
// subagent inherits the session model. The 14 canonical roles therefore ship as
// ROLE-CONTRACT Skills (`kaola-role-<role>`): the command dispatch cards are
// rewritten to `subagent_type="coder"` (write roles) / `"explore"` (read-only
// roles — computed from the canonical frontmatter `tools:` array, never hand-listed)
// plus a prompt-prefix instruction to invoke the matching role Skill. The canonical
// `model:` tier is meaningless under inherit and is skipped entirely.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). The runtime is not a
// forge, but the workflow PROSE is forge-shaped (`gh` vs `glab` vs `tea`, PR vs
// MR, per-forge support-script basenames), so a gitlab user must not receive
// GitHub-shaped skills. The forge variants are GENERATED, never hand-ported: the
// command sources come from the routing-surface registry via
// runtime-edition-forge.js, so each forge renders from the same byte-checked
// surfaces the Claude/Codex editions ship. github writes the historical bare
// `.kimi/` tree; a forge edition writes the sibling `.kimi-<forge>/`. This
// changes nothing about the edition's ADDITIVITY: it stays out of `npm test`,
// `edition-sync.js`, `install.sh`, and the SIX routing surfaces, and keeps its
// own suite (test-kimi-edition.js).
//
//   --forge=<f>  github (default) | gitlab | gitea.
//   --write   regenerate <tree>/skills + <tree>/hooks from canonical.
//   --check   assert the generated tree is in byte-parity with a fresh render
//             (exit 1 on drift).
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const reviewerGen = require('./generate-reviewer-profiles');
const forgeLayout = require('./runtime-edition-forge');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FORGE = 'github';
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');

// treeLabel — the repo-relative generated tree for one forge ('.kimi' /
// '.kimi-gitlab'). github keeps the historical bare path, so its output is
// unchanged by the forge axis.
function treeLabel(forge) {
  return '.kimi' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

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
  // Top-level agents/*.md only; the agent tree is flat (one file per role).
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
}

// The command surfaces this edition renders FROM, for a forge. Sourced from the
// routing-surface registry rather than a directory listing, so the forge variants
// are the generated, byte-checked surfaces themselves — the runtime edition holds
// no command list of its own to drift. Sorted, so the emitted order matches the
// directory order this generator used before the forge axis.
function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}

function canonCommandPath(basename, forge) {
  const src = forgeLayout.commandSources(forge || DEFAULT_FORGE).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge || DEFAULT_FORGE}`);
  return src.absPath;
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

// The roles dispatched as `explore`. Empty is the CORRECT answer for the current roster, not a
// missing restriction: every canonical role carries Write because every role writes its own
// findings, and Kimi's `explore` cannot write. Mapping a role to `explore` to express a tool
// restriction would cost it the ability to persist its evidence, so the restriction is carried by
// restrictionNote() instead — see the declared divergence there.
function readOnlyRoles() {
  const map = roleKindMap();
  return Object.keys(map).filter(n => map[n] === 'explore').sort();
}

// Canonical tools → the capability a role is denied when its profile grants none of them. The same
// derivation the opencode generator applies to its `permission:` block, so the two editions agree
// on what a role may do; only the mechanism differs.
//
// DECLARED DIVERGENCE: Kimi has no per-role tool configuration at all. Its Agent tool exposes three
// built-in subagent types (coder/explore/plan) and a Skill is a prompt package, not an agent
// definition — so on this runtime the restriction can only be CARRIED BY THE ROLE CONTRACT, not
// enforced by the runtime. Claude enforces it through the frontmatter `tools:` list and opencode
// through `permission: <axis>: deny`; here it is an instruction the role is bound to follow. Absent
// this line a Bash-less canonical role would silently gain shell access on kimi, because every role
// is dispatched as `coder`.
const CANONICAL_RESTRICTIONS = Object.freeze([
  { tools: ['write', 'edit'], clause: 'create or modify files' },
  { tools: ['bash'], clause: 'run shell commands' },
]);

// The role-contract restriction line for a canonical tool set, or '' when the profile withholds
// nothing. Derived from the profile; there is no hand-maintained role list to drift.
function restrictionNote(toolSet) {
  const denied = CANONICAL_RESTRICTIONS
    .filter(r => !r.tools.some(t => toolSet.has(t)))
    .map(r => r.clause);
  if (!denied.length) return '';
  return '**Tool restriction:** this role may not ' + denied.join(' and ')
    + '. If the task cannot be completed without that, report it as a finding and stop — never do it yourself.';
}

// The roles whose canonical profile withholds a capability, and the clause each is denied. Exported
// for inspection: this is the set restrictionNote() actually writes into the generated contracts.
function restrictedRoles() {
  const out = {};
  for (const name of listCanonAgents()) {
    const c = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const toolSet = lowerSet(parseTools(parseFrontmatter(c).fm.tools));
    const note = restrictionNote(toolSet);
    if (note) out[name] = note;
  }
  return out;
}

// --- renderers (pure; exported for parity test) ---

function renderAgent(canonContent, agentName, forge) {
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const isReviewer = REVIEWER_ROLES.has(agentName);
  // Canonical `tools:` is DROPPED from the Skill frontmatter (a Skill is a prompt package), so any
  // capability the profile withholds has to be restated in the contract or it is lost on kimi.
  const restriction = restrictionNote(lowerSet(parseTools(fm.tools)));
  const lines = ['---'];
  lines.push('name: kaola-role-' + agentName);
  lines.push('description: ' + (fm.description || ''));
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
  // Same additive-generation-only discipline as the opencode renderAgent (#544):
  // the Claude→kimi script-path rewrite applies to the RENDERED body so canonical
  // agents/*.md are never touched (D-530-02).
  // rewriteClaudeScriptPaths is a no-op when the patterns are absent (workflow-planner ships the
  // "Re-derive" prose parenthetical). The scoped `--runtime claude` → `--runtime kimi`
  // rewrite mirrors transformCommandBody: workflow-planner's claim-startup invocation
  // must stamp the kimi runtime into workflow-state.md on this edition.
  const bodyText = rewriteClaudeScriptPaths(body, forge)
    .replace(/--runtime claude\b/g, '--runtime kimi')
    .trim().replace(/\s+$/, '');
  if (restriction) {
    lines.push(restriction);
    lines.push('');
  }
  lines.push(bodyText);
  let content = lines.join('\n') + '\n';
  if (isReviewer) {
    const normalized = reviewerGen.normalizeResolvedProfileHash(content);
    content = normalized.replace(ZERO_HASH, reviewerGen.sha256(normalized));
  }
  return content;
}

// The edition's ONE answer to the canonical model-dispatch instruction. Canonical states that
// instruction as PROSE ("… carries an explicit `model=` line … never omit it"); Kimi has no
// per-dispatch model override at all, so every such sentence is restated as this single wording.
const KIMI_MODEL_DISPATCH_GUIDANCE = 'Never pass a per-call model override; sub-agents inherit the session model.';

// The instruction's stable signature: a `model=` mention in PROSE. Card placeholders sit alone on
// their own line inside a dispatch card and are removed by stripCardModelPlaceholders, so this
// matches the INSTRUCTION however it happens to be worded.
const MODEL_MENTION = /model=/;

// The index at which the sentence containing `at` begins — just past the last sentence terminator
// before it. A terminator is `.`/`:` + whitespace followed by a capital or a backtick, which is
// what stops "e.g." (a lowercase follower) from reading as a boundary.
function sentenceStart(text, at) {
  const re = /[.:]\s+(?=[A-Z`])/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null && m.index < at) start = m.index + m[0].length;
  return start;
}

// Rewrite ONE prose paragraph: if it carries a `model=` mention, replace from the START OF THAT
// SENTENCE to the end of the paragraph with `guidance`; otherwise return it untouched. Text before
// that sentence survives verbatim ("Dispatch `doc-updater` with the changed files, …"). Running to
// the end of the paragraph is deliberate: every observed wording puts the instruction last, and
// its trailing clauses ("Pass it exactly as shown; never omit it.") are anaphoric continuations
// that must not outlive the sentence they refer to.
function rewriteModelDispatchParagraph(para, guidance) {
  const at = para.search(MODEL_MENTION);
  if (at < 0) return para;
  return para.slice(0, sentenceStart(para, at)) + guidance;
}

// Restate the canonical model-dispatch instruction in the edition's wording — ANCHORED to whole
// sentences, never to the `model="{...}"` token inside one (the kimi twin of the opencode
// rewrite).
//
// This replaces a global unanchored strip that excised the placeholder from INSIDE a prose
// sentence, leaving the surrounding backticks as a literal empty code span (``) while the
// instruction still read "Pass it exactly as shown; never omit it" — with nothing shown, beside a
// dispatch card that no longer carried a `model=` line. A token strip can half-apply; replacing a
// whole sentence run cannot.
//
// Prose only: fenced code blocks pass through untouched. A wording this MISSES is not silently
// shipped — assertNoModelDispatchResidue fails the render.
function rewriteModelDispatchInstructions(text, guidance) {
  const out = [];
  let fenced = false;
  let para = [];
  function flushPara() {
    if (!para.length) return;
    out.push(rewriteModelDispatchParagraph(para.join('\n'), guidance));
    para = [];
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      flushPara();
      fenced = !fenced;
      out.push(line);
    } else if (fenced) {
      out.push(line);
    } else if (line.trim() === '') {
      flushPara();
      out.push(line);
    } else {
      para.push(line);
    }
  }
  flushPara();
  return out.join('\n');
}

// Card placeholders — the `model="{ROLE_MODEL}"` / `model="{...}"` assignment inside a dispatch
// card. LINE-anchored (the whole line is the assignment, and the line goes with it), so it can
// only ever remove a card line. The unanchored predecessor reached into prose; it also left a
// doubled comma behind, which needed a second global `,{2,}` collapse to repair — removing the
// line outright leaves nothing to repair.
function stripCardModelPlaceholders(text) {
  return text.replace(/^[ \t]*model="\{[^"\n]*\}",?[ \t]*\r?\n/gm, '');
}

// Fail-loud post-condition. Kimi has no per-dispatch model override, so after the rewrites NO
// `model=` may survive anywhere on the surface — card placeholders are already gone, and the
// edition's own guidance names no `model=` token at all. Anything left is a HARD ERROR rather than
// a silently shipped contradiction: a canonical wording the rewrite did not match, a surviving
// install-time placeholder, or an empty code span left by a token strip. This is what keeps the
// transform honest across canonical edits that have not happened yet.
function assertNoModelDispatchResidue(text, label) {
  const probe = text.split(KIMI_MODEL_DISPATCH_GUIDANCE).join('');
  const problems = [];
  // Exactly two backticks, never three — a ``` fence is not an empty span.
  if (/(?<!`)``(?!`)/.test(probe)) problems.push('empty code span `` — a strip cut inside a code span');
  for (const line of probe.split(/\r?\n/)) {
    if (MODEL_MENTION.test(line)) problems.push('unrewritten model= instruction: ' + line.trim());
  }
  if (problems.length) {
    throw new Error('sync-kimi-edition: a Claude-only `model=` instruction survived into '
      + (label || '(command)') + ' — this runtime has no per-dispatch model override to honour it,'
      + ' and the anchored rewrite did not match this wording:\n  - ' + problems.join('\n  - '));
  }
}

// kimi-native `kaola_script()` shell resolver (the kimi twin of #544's opencode
// resolver). The canonical resolver ships a Claude search path verbatim —
// `$CLAUDE_PLUGIN_ROOT` + `$HOME/.claude/kaola-workflow` (a plugin-resident copy may ALSO add
// the gitlab/gitea forge dirs). On the kimi edition that is a Claude-path leak: kimi
// resolves scripts via the kimi home dir honoring `$KIMI_CODE_HOME` (default
// `~/.kimi-code`), which is where install-kimi.sh deploys the support scripts. This
// constant is the wholesale replacement for every `kaola_script(){ ... return 1; }`
// definition line (both the 3-path command form and the 5-path plugin form
// collapse to this single kimi form — kimi is runtime-only, no forge axis). The
// self-repo priority rule is preserved: inside the kaola-workflow repo itself,
// `./scripts` wins; anywhere else the installed copy wins. Single-quoted JS literal:
// inner `'`→`\'`, the shell `printf '%s\n'` backslash-n is `\\n` so the GENERATED
// .md carries a literal `\n` (not a JS newline that would split the one-liner).
const KIMI_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

// The forge's resolver. Only the SELF-DEV probe is forge-scoped: inside this
// repository a gitlab/gitea edition's scripts live in its plugin tree, not in
// ./scripts. The deployed dir is shared across forges on purpose — the per-forge
// basenames are distinct, so co-installed editions resolve without collision.
// Identity for github, which is what keeps the historical tree byte-unchanged.
function kimiKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge || DEFAULT_FORGE);
  return KIMI_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

// Rewrite the Claude script-path surface to kimi-native (kimi twin of the opencode
// rewriteClaudeScriptPaths). Applied to BOTH command bodies (via transformCommandBody)
// and agent bodies (via renderAgent) so the committed .kimi/ tree has ZERO
// `$CLAUDE_PLUGIN_ROOT` / `$HOME/.claude/kaola-workflow` tokens. Canonical sources are
// NEVER touched (additive D-530-02) — only the generated outputs. ONE replacement remains,
// and it mirrors the opencode version replacement-for-replacement: whole `kaola_script(){
// ... }` definition lines → KIMI_KAOLA_SCRIPT.
//
// Each rewrite rule is a site where two runtimes can silently diverge, so the count of
// rules is itself the reliability metric. The prose-parenthetical rule and the two
// REPLAN_SCRIPT resolver rules are gone with the surfaces that carried them (the planner
// agent and the re-plan machinery); they matched nothing left in the tree, and a rule that
// can no longer fire cannot be verified.
function rewriteClaudeScriptPaths(text, forge) {
  forge = forge || DEFAULT_FORGE;
  // Whole resolver definition line (indent-preserving). The resolver is always a single
  // line; `.*` does not cross newlines (no `s` flag), so each definition is replaced
  // independently.
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + kimiKaolaScript(forge));
}

// The canonical section this transform strips at — the TRIGGER, never a heading it emits (kimi
// drops the heading with the section and leaves the one-line guidance in its place).
const MODEL_DISPATCH_HEADING = /^##\s+Agent Model Dispatch\s*$/;

// A heading that READS like that section without being it. The strip below is a plain `if`, and a
// canonical rename once moved the heading out from under it: nothing threw, the section was simply
// never stripped, and the surface shipped a Claude-shaped heading over prose about a per-dispatch
// model this runtime does not have. This regex is the missing `else` — deliberately looser than the
// anchor, because its whole job is to notice that the anchor no longer matches. A surface carrying
// no such section is silent, which is correct: today only one of the three canonical commands has
// one, and the other two must render without complaint.
const MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/;

// Fail-loud anchor check, the twin of assertNoModelDispatchResidue above: the strip is this
// edition's ONLY carrier for a statement about its own runtime that canonical cannot make, so a
// canonical heading it fails to recognize must name itself rather than no-op.
function assertModelDispatchAnchorMatched(canonBody, stripped, label) {
  if (stripped) return;
  const nearMiss = canonBody.split(/\r?\n/)
    .filter(l => MODEL_DISPATCH_HEADING_NEAR_MISS.test(l) && !MODEL_DISPATCH_HEADING.test(l))
    .map(l => l.trim());
  if (!nearMiss.length) return;
  throw new Error('sync-kimi-edition: model-dispatch anchor missed in ' + (label || '(command)')
    + ' — canonical carries a section this transform did not strip, so the edition would ship'
    + ' without its dispatch instruction. Re-anchor MODEL_DISPATCH_HEADING to the heading canonical'
    + ' now uses:\n  - ' + nearMiss.join('\n  - '));
}

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  // Anchored model-dispatch rewrite FIRST, on canonical text only — before the loop below
  // substitutes the edition's own one-liner, so that guidance is never fed back through the rewrite.
  const lines = rewriteModelDispatchInstructions(body, KIMI_MODEL_DISPATCH_GUIDANCE).split(/\r?\n/);
  const out = [];
  let strippedModelDispatch = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Strip the "## Agent Model Dispatch" section (where opencode substitutes a block
    // of its own; the kimi edition has no analogue at all — there is no
    // per-dispatch model to document) and replace its body with
    // the one-line kimi-true guidance, since canonical dispatch prose ("MUST pass
    // model=…") now lives entirely inside this section for every command that has
    // it (a standalone occurrence outside the block, if any, is separately
    // rewritten below). Detect the heading, skip its flat body up to the next
    // heading line, and leave a single-blank seam around the replacement line.
    if (MODEL_DISPATCH_HEADING.test(line)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      out.push(KIMI_MODEL_DISPATCH_GUIDANCE);
      out.push('');
      strippedModelDispatch = true;
      i++;
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
      continue;
    }
    out.push(line);
    i++;
  }
  // A canonical rename that walked out from under the anchor above reports itself here rather than
  // silently leaving the section in place.
  assertModelDispatchAnchorMatched(body, strippedModelDispatch, label);
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
  // Card placeholder lines. The prose forms are already restated by rewriteModelDispatchInstructions
  // above, so this only ever sees a card.
  text = stripCardModelPlaceholders(text);
  // Tidy trailing whitespace left behind on affected lines.
  text = text.replace(/[ \t]+\n/g, '\n');
  // The canonical workflow-next dispatch emits a claim invocation carrying the
  // literal `--runtime claude`; on the kimi edition the flag must stamp the kimi
  // runtime into workflow-state.md. Scoped to the exact flag token (word boundary) so
  // prose mentions of "claude" are untouched.
  text = text.replace(/--runtime claude\b/g, '--runtime kimi');
  // Final pass — rewrite the `kaola_script()` resolver + the "Re-derive your own
  // script path(s)" prose to the kimi-native path (no $CLAUDE_PLUGIN_ROOT, no
  // ~/.claude/kaola-workflow). Runs LAST so the resolver line (still Claude-shaped
  // above) is rewritten in full; the earlier transforms do not touch it.
  text = rewriteClaudeScriptPaths(text, forge);
  // Fail loud rather than half-apply: no `model=` may still stand by the time the surface ships.
  assertNoModelDispatchResidue(text, label);
  return text;
}

function renderCommand(canonContent, commandName, forge) {
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  // Directory-form Kimi Skill: `name` + `description` are REQUIRED. The name MUST
  // stay the canonical basename so Kimi registers the same slash command
  // (`/workflow-next`, `/kaola-workflow-finalize`, …) as every other edition.
  lines.push('name: ' + commandName);
  lines.push('description: ' + (fm.description || ''));
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body, forge, skillRel(commandName, forge)).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

// The generated Kimi hooks fragment. Maps the two canonical hooks/hooks.json
// entries to Kimi [[hooks]] rules: SubagentStart → dispatch-log (matcher
// omitted), and the Claude SessionStart"compact" entry → PostCompact (Kimi's
// semantic counterpart) running the compact-context script. `__KIMI_HOME__` is
// a placeholder token the installer substitutes with the real
// ${KIMI_CODE_HOME:-$HOME/.kimi-code} path at install time; the >>> / <<<
// marker comments delimit the managed block for idempotent merges.
function renderKimiHooksToml(forge) {
  // The compact-context script is forge-RENAMED, so the managed block must name the
  // basename the selected forge actually deploys; a github-shaped command would point
  // at a file a gitlab install never writes. Hook SCRIPTS are forge-neutral.
  const compactJs = forgeLayout.scriptName('kaola-workflow-compact-context.js', forge || DEFAULT_FORGE);
  return [
    '# >>> kaola-workflow kimi hooks',
    '[[hooks]]',
    'event = "SubagentStart"',
    'command = "bash __KIMI_HOME__/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh"',
    'timeout = 30',
    '',
    '[[hooks]]',
    'event = "PostCompact"',
    'command = "node __KIMI_HOME__/kaola-workflow/scripts/' + compactJs + '"',
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

function skillRel(dirName, forge) {
  return treeLabel(forge) + '/skills/' + dirName + '/SKILL.md';
}

// The EXACT set of skill directories a fresh render produces: one `kaola-role-<agent>`
// per canonical agent plus one `<command>` per canonical command. Anything else in
// .kimi/skills/ is a retired surface (e.g. the deleted fast/full `kaola-workflow-fast`
// / `-phase{1..5}` commands) that a deterministic, idempotent mirror must remove — the
// generator wrote canonical surfaces but never pruned, so --check reported parity while
// the edition suite's exact-set assertion (K1) failed on the leftovers.
function expectedSkillDirs(forge) {
  const set = new Set();
  for (const name of listCanonAgents()) set.add('kaola-role-' + name);
  for (const file of listCanonCommands(forge)) set.add(file.slice(0, -3));
  return set;
}

function retiredSkillDirs(forge) {
  const dir = path.join(REPO, treeLabel(forge), 'skills');
  if (!fs.existsSync(dir)) return [];
  const expected = expectedSkillDirs(forge);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !expected.has(e.name))
    .map(e => e.name);
}

// The hook files a fresh render produces: the byte-copied scripts plus the generated TOML fragment.
function expectedHookFiles() {
  return HOOK_SCRIPTS.concat(['kimi-hooks.toml']);
}

// Retired BYTE-COPIED artifacts in the generator-owned hooks dir: a file whose extension is one
// this generator writes there but whose basename it no longer emits (the retired
// `kaola-workflow-write-lane.sh` / `kaola-workflow-pre-commit.sh` hooks, which nothing registers
// and which --write kept re-shipping because a generator that only ever ADDS makes every retired
// artifact immortal).
//
// Deliberately narrow. ONE directory, never recursive, regular files only, and only the extensions
// this generator itself writes there — so it cannot reach a subdirectory or an unrelated file type
// a user placed alongside. The tree ROOT is never swept.
function retiredHookFiles(forge) {
  const dir = path.join(REPO, treeLabel(forge), 'hooks');
  if (!fs.existsSync(dir)) return [];
  const expected = new Set(expectedHookFiles());
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => ['.sh', '.toml'].includes(path.extname(n)) && !expected.has(n))
    .sort();
}

function pruneSkills(forge) {
  let removed = 0;
  for (const name of retiredSkillDirs(forge)) {
    fs.rmSync(path.join(REPO, treeLabel(forge), 'skills', name), { recursive: true, force: true });
    console.log('pruned     ' + treeLabel(forge) + '/skills/' + name + ' (retired surface)');
    removed++;
  }
  for (const f of retiredHookFiles(forge)) {
    fs.rmSync(path.join(REPO, treeLabel(forge), 'hooks', f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/hooks/' + f + ' (retired artifact)');
    removed++;
  }
  return removed;
}

function writeAgents(forge) {
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name, forge);
    const rel = skillRel('kaola-role-' + name, forge);
    const dest = path.join(REPO, rel);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + rel);
      wrote++;
    }
  }
  return wrote;
}

function writeCommands(forge) {
  let wrote = 0;
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const out = renderCommand(canon, name, forge);
    const rel = skillRel(name, forge);
    const dest = path.join(REPO, rel);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + rel);
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

function writeHooks(forge) {
  const out_dir = path.join(REPO, treeLabel(forge), 'hooks');
  ensureDir(out_dir);
  let wrote = 0;
  for (const script of HOOK_SCRIPTS) {
    const src = path.join(CANON_HOOKS_DIR, script);
    const dest = path.join(out_dir, script);
    const content = adaptHookForKimi(script, fs.readFileSync(src, 'utf8'));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log((HOOK_ADAPTATIONS[script] ? 'adapted    ' : 'copied     ') + treeLabel(forge) + '/hooks/' + script);
      wrote++;
    }
  }
  const toml = renderKimiHooksToml(forge);
  const tomlDest = path.join(out_dir, 'kimi-hooks.toml');
  if (!fs.existsSync(tomlDest) || fs.readFileSync(tomlDest, 'utf8') !== toml) {
    fs.writeFileSync(tomlDest, toml);
    console.log('generated  ' + treeLabel(forge) + '/hooks/kimi-hooks.toml');
    wrote++;
  }
  return wrote;
}

function runWrite(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const a = writeAgents(forge);
  const c = writeCommands(forge);
  const h = writeHooks(forge);
  const p = pruneSkills(forge);
  const total = a + c + h + p;
  console.log('sync-kimi-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

function runCheck(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const tree = treeLabel(forge);
  const mismatches = [];
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = skillRel('kaola-role-' + name, forge);
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated role skill' });
      continue;
    }
    const expected = renderAgent(canon, name, forge);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const rel = skillRel(name, forge);
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated command skill' });
      continue;
    }
    const expected = renderCommand(canon, name, forge);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = tree + '/hooks/' + script;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (read(rel) !== adaptHookForKimi(script, read('hooks/' + script))) mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
  }
  {
    const rel = tree + '/hooks/kimi-hooks.toml';
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated hooks fragment' });
    } else if (read(rel) !== renderKimiHooksToml(forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  for (const name of retiredSkillDirs(forge)) {
    mismatches.push({ rel: tree + '/skills/' + name, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  // Same for the byte-copied hooks: one this generator no longer emits is retired, and --check
  // called such a tree green until it was reported here.
  for (const f of retiredHookFiles(forge)) {
    mismatches.push({ rel: tree + '/hooks/' + f, reason: 'retired artifact no longer emitted — prune (--write removes it)' });
  }
  if (mismatches.length) {
    console.error('sync-kimi-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-kimi-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands(forge).length;
  console.log('sync-kimi-edition[' + forge + ']: ' + na + ' role skill(s) + ' + nc + ' command skill(s) + '
    + (HOOK_SCRIPTS.length + 1) + ' hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-kimi-edition.js (--write | --check) [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .kimi/;\n'
    + '               gitlab/gitea write .kimi-<forge>/\n'
    + '  --write   regenerate the forge tree skills + hooks from canonical\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const forge = forgeArg ? forgeArg.slice('--forge='.length) : DEFAULT_FORGE;
  try {
    forgeLayout.assertForge(forge);
  } catch (e) {
    console.error('sync-kimi-edition: ' + e.message);
    process.exitCode = 2;
    return;
  }
  const arg = argv.filter(a => !a.startsWith('--forge='))[0];
  if (arg === '--write') return runWrite(forge);
  if (arg === '--check') return runCheck(forge);
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, KIMI_KAOLA_SCRIPT, kimiKaolaScript,
  rewriteModelDispatchInstructions, rewriteModelDispatchParagraph, sentenceStart,
  stripCardModelPlaceholders, assertNoModelDispatchResidue, assertModelDispatchAnchorMatched,
  KIMI_MODEL_DISPATCH_GUIDANCE, MODEL_DISPATCH_HEADING,
  renderKimiHooksToml, treeLabel, skillRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForKimi, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles,
  parseFrontmatter, parseTools,
  roleKindMap, readOnlyRoles,
  CANONICAL_RESTRICTIONS, restrictionNote, restrictedRoles,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
