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
//   --write              regenerate .opencode/agent + .opencode/command from canonical;
//                         seed opencode.json only if absent (use --write-config to force).
//   --write-config       (re)write this repo's opencode.json from the template.
//   --write-config-to P  write the template opencode.json to path P (installer use).
//   --check              assert generated agent/command files are in parity with canonical.
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
const reviewerGen = require('./generate-reviewer-profiles');
const forgeLayout = require('./runtime-edition-forge');
const REVIEWER_ROLES = new Set(reviewerGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FORGE = 'github';
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');
const CANON_PLUGINS_DIR = path.join(REPO, 'templates', 'opencode', 'plugins');

// outDirs — the generated tree for one forge. github keeps the historical bare
// `.opencode/` path (so its output is unchanged by the forge axis); gitlab/gitea
// write sibling trees. Agents and hooks are forge-NEUTRAL content but still live
// per-tree, because a tree is what the installer copies wholesale.
function outDirs(forge) {
  const root = path.join(REPO, '.opencode' + forgeLayout.outSuffix(forge));
  return {
    root,
    agent: path.join(root, 'agent'),
    command: path.join(root, 'command'),
    hooks: path.join(root, 'hooks'),
    plugins: path.join(root, 'plugins'),
  };
}
const OUT_AGENT_DIR = outDirs(DEFAULT_FORGE).agent;
const OUT_COMMAND_DIR = outDirs(DEFAULT_FORGE).command;
const OUT_HOOKS_DIR = outDirs(DEFAULT_FORGE).hooks;
const OUT_PLUGINS_DIR = outDirs(DEFAULT_FORGE).plugins;
const OPENCODE_JSON = path.join(REPO, 'opencode.json');

// Runtime-neutral hook scripts (byte-copied from canonical hooks/ into the
// opencode edition). The .opencode/plugins/kaola-workflow-hooks.js adapter feeds
// them Claude-style JSON payloads and honors their exit codes.
const HOOK_SCRIPTS = [
  'kaola-workflow-subagent-dispatch-log.sh',
];

// Opencode plugin scripts (byte-copied from tracked templates/opencode/plugins/ into the
// opencode edition). The tracked template is the canonical source of truth; .opencode/plugins/
// is the gitignored generated artifact. byte-copy (no rendering) mirrors writeHooks().
const PLUGIN_SCRIPTS = [
  'kaola-workflow-hooks.js',
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

// Canonical model tier: opus → reasoning, everything else (sonnet/inherit) → standard.
function roleTier(canonModelValue) {
  return String(canonModelValue || '').toLowerCase() === 'opus' ? 'reasoning' : 'standard';
}

function listCanonAgents() {
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
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
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const tools = parseTools(fm.tools);
  const toolSet = lowerSet(tools);
  const denied = deniedPermissionAxes(toolSet);
  const isReviewer = REVIEWER_ROLES.has(agentName);

  const lines = ['---'];
  lines.push('description: ' + (fm.description || ''));
  lines.push('mode: subagent');
  // No model field: standard tier inherits opencode.json "model"; reasoning tier
  // is resolved by the opencode.json agent.<role>.model override. Keeping generated
  // agents model-agnostic is what lets the user own both tiers in one file.
  if (denied.length) {
    lines.push('permission:');
    for (const axis of denied) lines.push('  ' + axis + ': deny');
  }
  // #708: schema-2 reviewer identity. The opencode reviewer profile carries the runtime-neutral
  // behavior contract (version + hash) from the canonical Claude source, plus a freshly-stamped
  // resolved_profile_hash over the transformed opencode bytes (NOT the Claude hash — the
  // frontmatter differs, so the Claude hash no longer binds these bytes). The runtime resolver
  // these fields once fed is retired with the node executor, so their consumer today is the
  // edition suite, which checks the stamp against canonical. The hash is re-stamped AFTER the full content
  // is assembled (below) so it binds every rendered byte.
  if (isReviewer) {
    if (fm.behavior_contract_version) lines.push('behavior_contract_version: ' + fm.behavior_contract_version);
    if (fm.behavior_contract_hash) lines.push('behavior_contract_hash: ' + fm.behavior_contract_hash);
    lines.push('resolved_profile_hash: ' + ZERO_HASH);
  }
  lines.push('---');
  lines.push('');
  // #544 (folded into #543): apply the Claude→opencode script-path rewrite to the agent body too
  // (workflow-planner ships the "Re-derive" prose). Other agents are verbatim (rewriteClaudeScriptPaths
  // is a no-op when the patterns are absent). Applied to the RENDERED body so canonical agents/*.md
  // are never touched (additive D-530-02); A6 parity holds because both sides go through renderAgent.
  const bodyText = rewriteClaudeScriptPaths(body, forge).trim().replace(/\s+$/, '');
  const suffix = opencodeAgentSuffix(agentName);
  lines.push(suffix ? bodyText + '\n' + suffix.replace(/\s+$/, '') : bodyText);
  let content = lines.join('\n') + '\n';
  if (isReviewer) {
    // Re-stamp resolved_profile_hash over the final opencode bytes (the transform above changed
    // the frontmatter, so the Claude hash is invalid here). normalizeResolvedProfileHash asserts
    // exactly one hash field exists and zeroes it; sha256 + replace yields the binding hash.
    const normalized = reviewerGen.normalizeResolvedProfileHash(content);
    content = normalized.replace(ZERO_HASH, reviewerGen.sha256(normalized));
  }
  return content;
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
// their own line inside a fenced dispatch card and are removed by stripCardModelPlaceholders, so
// this matches the INSTRUCTION however it happens to be worded.
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
// SENTENCE to the end of the paragraph with `guidance`; otherwise return it untouched. Text
// before that sentence survives verbatim ("Dispatch `doc-updater` with the changed files, …").
// Running to the end of the paragraph is deliberate: every observed wording puts the instruction
// last, and its trailing clauses ("Pass it exactly as shown; never omit it.") are anaphoric
// continuations that must not outlive the sentence they refer to.
function rewriteModelDispatchParagraph(para, guidance) {
  const at = para.search(MODEL_MENTION);
  if (at < 0) return para;
  return para.slice(0, sentenceStart(para, at)) + guidance;
}

// Restate the canonical model-dispatch instruction in the edition's wording — ANCHORED to whole
// sentences, never to the `model="{...}"` token inside one.
//
// This replaces a global unanchored strip that excised the placeholder from INSIDE a prose
// sentence, leaving the surrounding backticks as a literal empty code span (``) while the
// instruction still read "Pass it exactly as shown; never omit it" — with nothing shown, beside a
// dispatch card that no longer carried a `model=` line, in a file that had already said the
// opposite 100 lines earlier. A token strip can half-apply; replacing a whole sentence run cannot.
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

// Fail-loud post-condition. After the rewrites the only `model=` text this edition may ship is its
// OWN guidance; anything else is a HARD ERROR rather than a silently shipped contradiction —
// a canonical wording the rewrite did not match, a surviving install-time placeholder, or an empty
// code span left by a token strip. This is what keeps the transform honest across canonical edits
// that have not happened yet: a reworded instruction fails the render instead of half-applying.
function assertNoModelDispatchResidue(text, label) {
  // Scan the WHOLE surface, fenced blocks included: the card placeholders are already gone by
  // this point, so ANY surviving `model=` is residue wherever it sits. Only the edition's own two
  // wordings are subtracted first.
  const probe = text
    .split(OPENCODE_MODEL_DISPATCH_BLOCK).join('')
    .split(OPENCODE_MODEL_DISPATCH_GUIDANCE).join('');
  const problems = [];
  // Exactly two backticks, never three — a ``` fence is not an empty span.
  if (/(?<!`)``(?!`)/.test(probe)) problems.push('empty code span `` — a strip cut inside a code span');
  for (const line of probe.split(/\r?\n/)) {
    if (MODEL_MENTION.test(line)) problems.push('unrewritten model= instruction: ' + line.trim());
  }
  if (problems.length) {
    throw new Error('sync-opencode-edition: a Claude-only `model=` instruction survived into '
      + (label || '(command)') + ' — this runtime has no model parameter to honour it, and the'
      + ' anchored rewrite did not match this wording:\n  - ' + problems.join('\n  - '));
  }
}

// opencode-native `kaola_script()` shell resolver (issue #544, folded into #543). The canonical
// resolver ships a CLAUDE search path verbatim — `$CLAUDE_PLUGIN_ROOT` + `$HOME/.claude/kaola-workflow`
// (a plugin-resident copy may ALSO add the gitlab/gitea forge dirs). On the opencode edition that is a
// Claude-path leak: opencode resolves scripts via an opencode-native dir honoring `$OPENCODE_CONFIG_DIR`
// (default `~/.config/opencode`), which is where install-opencode.sh deploys the support scripts. This
// constant is the wholesale replacement for every `kaola_script(){ ... return 1; }` definition line
// (both the 3-path command form and the 5-path plugin form collapse to this single opencode
// form — opencode is runtime-only, no forge axis). Single-quoted JS literal: inner `'`→`\'`, the
// shell `printf '%s\n'` backslash-n is `\\n` so the GENERATED .md carries a literal `\n` (not a JS
// newline that would split the one-line resolver).
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
const MODEL_DISPATCH_HEADING = /^##\s+Agent Model Dispatch\s*$/;

// A heading that READS like that section without being it. The substitution below is a plain `if`,
// and a canonical rename once moved the heading out from under it: nothing threw, the block was
// simply never substituted, and the surface shipped without the one paragraph telling an opencode
// reader how a role is dispatched on a runtime whose task tool takes no model. This regex is the
// missing `else` — deliberately looser than the anchor, because its whole job is to notice that the
// anchor no longer matches. A surface carrying no such section is silent, which is correct: today
// only one of the three canonical commands has one, and the other two must render without complaint.
const MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/;

// Fail-loud anchor check, the twin of assertNoModelDispatchResidue above: the substitution is this
// edition's ONLY carrier for a statement about its own runtime that canonical cannot make, so a
// canonical heading it fails to recognize must name itself rather than no-op.
function assertModelDispatchAnchorMatched(canonBody, substituted, label) {
  if (substituted) return;
  const nearMiss = canonBody.split(/\r?\n/)
    .filter(l => MODEL_DISPATCH_HEADING_NEAR_MISS.test(l) && !MODEL_DISPATCH_HEADING.test(l))
    .map(l => l.trim());
  if (!nearMiss.length) return;
  throw new Error('sync-opencode-edition: model-dispatch anchor missed in ' + (label || '(command)')
    + ' — canonical carries a section this transform did not substitute at, so the edition would'
    + ' ship without its dispatch instruction. Re-anchor MODEL_DISPATCH_HEADING to the heading'
    + ' canonical now uses:\n  - ' + nearMiss.join('\n  - '));
}

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  // Anchored model-dispatch rewrite FIRST, on canonical text only — before the loop below
  // substitutes OPENCODE_MODEL_DISPATCH_BLOCK, so the edition's own guidance is never fed back
  // through the rewrite.
  const lines = rewriteModelDispatchInstructions(body, OPENCODE_MODEL_DISPATCH_GUIDANCE).split(/\r?\n/);
  const out = [];
  let substitutedModelDispatch = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (MODEL_DISPATCH_HEADING.test(line)) {
      out.push(OPENCODE_MODEL_DISPATCH_BLOCK);
      substitutedModelDispatch = true;
      i++;
      // Skip the canonical section body up to (not including) the next heading line.
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
      continue;
    }
    // opencode path-flip (#539, Mechanism B): opencode is adaptive-only-default, so the
    // canonical "## Startup Step 0a-1 — Path Intent" section (KAOLA_ENABLE_ADAPTIVE switch
    // resolution + Branch A/B path-selection prose) is DROPPED at generation time. This
    // transform runs ONLY inside renderCommand (opencode output), so canonical is never
    // touched — avoiding a guaranteed merge conflict with #538's in-flight canonical edits.
    // Mirrors the Agent Model Dispatch strip above: detect the heading, skip its body. UNLIKE
    // that section (a flat block), this one nests `### Branch A`/`### Branch B` children,
    // so the body-skip stops at the next SIBLING `##` heading (`^##\s` rejects `###` — after
    // two hashes `\s` requires whitespace, and `###` has a third `#` there), not the first
    // `###` child. The ^## anchor isolates the section heading (surviving "(Step 0a-1)"
    // prose mentions elsewhere are not headings). Rewind trailing blank line(s) in `out` so
    // excising the section leaves a single-blank seam, not a double-blank.
    // #F7: match by the stable "Path Intent" TITLE, not the volatile step number "0a-1" — a
    // canonical renumber (e.g. "Step 0b") must not silently un-strip the section and leak the
    // path-selection switch onto the adaptive-only surface. The A22 negative assertions
    // (no KAOLA_ENABLE_ADAPTIVE, no Branch A/B) are the fail-loud net if this ever misses.
    if (/^##\s.*\bPath Intent\b/.test(line)) {
      // Rewind trailing blank line(s) in `out` then re-insert exactly ONE blank, so
      // excising the section leaves a clean single-blank seam to the next heading
      // (the body-skip below also consumes the blank that followed the section).
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      i++;
      while (i < lines.length && !/^##\s/.test(lines[i])) i++;
      continue;
    }
    // opencode strip (workflow-init Codex-note cleanup): the canonical
    // "> **Codex hooks note:** …" blockquote is Codex-specific install guidance — it points at
    // `install-codex-agent-profiles.js` (a Codex-only script with no opencode meaning) and rode
    // along when workflow-init was regenerated from the canonical Claude command. opencode
    // delivers agents/hooks via `install-opencode.sh`, so the note is dead prose on this surface.
    // Detect the blockquote opener by its stable "**Codex hooks note:**" marker (only
    // workflow-init carries it → no over-strip risk), skip the contiguous `>` body, and consume
    // the trailing blank(s) so the seam to the next paragraph collapses to a single blank
    // (mirrors the Path Intent strip above). opencode-only: this runs inside renderCommand and
    // never touches canonical commands/*.md (additive, D-530-02).
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
  // A canonical rename that walked out from under the anchor above reports itself here rather than
  // silently dropping the block.
  assertModelDispatchAnchorMatched(body, substitutedModelDispatch, label);
  let text = out.join('\n');
  // Dispatch-card `Agent(` openings → the opencode `task` form. Scoped to the literal opening
  // (a line that is exactly `Agent(` immediately followed by an indented `subagent_type=` line)
  // so it rewrites ONLY the dispatch invocation and never prose mentions of the word "agent"
  // or inline `Agent(...)` code spans.
  text = text.replace(/^Agent\(\n(\s+subagent_type=)/gm, 'task(\n$1');
  // Card placeholder lines. The prose forms are already restated by rewriteModelDispatchInstructions
  // above, so this only ever sees a card.
  text = stripCardModelPlaceholders(text);
  // Tidy trailing whitespace left behind on affected lines.
  text = text.replace(/[ \t]+\n/g, '\n');
  // #F6: the former adapt repair-loop strip (`text.replace(/downgrade to full path \/\s*/g,'')`)
  // was DEAD after #538 rewrote canonical to "NEVER downgrade to fast/full — there is no automatic
  // fallback between paths" (it matched nothing). #538 made canonical itself adaptive-only, so the
  // opencode adapt surface needs NO path-fallback strip; it is defended instead by the POSITIVE A22
  // assertion that the generated adapt carries the "NEVER downgrade to fast/full" guard plus a
  // negative guard against any un-NEVER'd fallback wording. The dead replace is removed here.
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
  text = rewriteClaudeScriptPaths(text, forge);
  // Fail loud rather than half-apply: nothing but the edition's own guidance may still say
  // `model=` by the time the surface ships.
  assertNoModelDispatchResidue(text, label);
  return text;
}

function renderCommand(canonContent, forge, label) {
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  lines.push('description: ' + (fm.description || ''));
  // opencode file-command frontmatter allows: description, agent, model, subtask.
  // Workflow commands orchestrate in the primary session and dispatch to the
  // .opencode/agent/* subagents via the task tool, so no `agent:` is set.
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body, forge, label).trim().replace(/\s+$/, ''));
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
function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
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
      console.log('generated  ' + treeLabel(forge) + '/agent/' + name + '.md');
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
    const out = renderCommand(canon, forge, treeLabel(forge) + '/command/' + file);
    const dest = path.join(out_dir, file);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      fs.writeFileSync(dest, out);
      console.log('generated  ' + treeLabel(forge) + '/command/' + file);
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
    console.log('pruned     ' + treeLabel(forge) + '/command/' + f + ' (retired surface)');
    removed++;
  }
  const agents = retiredMdFiles(dirs.agent, listCanonAgents());
  for (const f of agents) {
    fs.rmSync(path.join(dirs.agent, f), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/agent/' + f + ' (retired surface)');
    removed++;
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
    const rel = tree + '/agent/' + name + '.md';
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated agent', remedy: REMEDY.WRITE });
      continue;
    }
    const expected = renderAgent(canon, name, forge);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate', remedy: REMEDY.WRITE });
  }
  for (const file of listCanonCommands(forge)) {
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const rel = tree + '/command/' + file;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated command', remedy: REMEDY.WRITE });
      continue;
    }
    const expected = renderCommand(canon, forge, rel);
    if (read(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate', remedy: REMEDY.WRITE });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = tree + '/hooks/' + script;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy', remedy: REMEDY.WRITE });
      continue;
    }
    if (read(rel) !== read('hooks/' + script)) mismatches.push({ rel, reason: 'drifted from canonical hooks/', remedy: REMEDY.WRITE });
  }
  for (const script of PLUGIN_SCRIPTS) {
    const rel = tree + '/plugins/' + script;
    if (!fs.existsSync(path.join(REPO, rel))) {
      mismatches.push({ rel, reason: 'missing generated plugin', remedy: REMEDY.WRITE });
      continue;
    }
    const canonContent = fs.readFileSync(path.join(CANON_PLUGINS_DIR, script), 'utf8');
    if (read(rel) !== canonContent) mismatches.push({ rel, reason: 'drifted from canonical templates/opencode/plugins/', remedy: REMEDY.WRITE });
  }
  // Allowlist guard: every *.js present in the canonical plugins dir must be registered in
  // PLUGIN_SCRIPTS (the unregistered-on-disk direction). The per-script loop above covers the
  // missing-registered-file direction; this catches the reverse — a future second plugin dropped
  // into templates/opencode/plugins/ without being added to the allowlist.
  {
    const onDiskPlugins = fs.readdirSync(CANON_PLUGINS_DIR).filter(f => f.endsWith('.js'));
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
  // Retired-surface guard: a *.md in the deployed command/agent dir whose canonical source
  // was deleted (e.g. the fast/full commands) must be pruned; --write removes it.
  for (const f of retiredMdFiles(dirs.command, listCanonCommands(forge).map(x => x.slice(0, -3)))) {
    mismatches.push({ rel: tree + '/command/' + f, reason: 'retired surface not in canonical — prune (--write removes it)', remedy: REMEDY.WRITE });
  }
  for (const f of retiredMdFiles(dirs.agent, listCanonAgents())) {
    mismatches.push({ rel: tree + '/agent/' + f, reason: 'retired surface not in canonical — prune (--write removes it)', remedy: REMEDY.WRITE });
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
    + ' | --check) [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>          which forge to render (default github). github writes .opencode/;\n'
    + '                       gitlab/gitea write .opencode-<forge>/\n'
    + '  --write              regenerate the forge tree agent + command; seed opencode.json if absent\n'
    + '  --write-config       (re)write this repo opencode.json from the template (clobbers edits)\n'
    + '  --write-config-to P  write the template opencode.json to path P (installer use)\n'
    + '  --check              assert generated files are in parity with canonical\n'
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
  if (arg === '--write-config') return runWrite(true, forge);
  if (arg === '--write-config-to') {
    const target = positional[1];
    if (!target) { console.error('--write-config-to requires a path'); process.exitCode = 2; return; }
    return runWriteConfigTo(target);
  }
  if (arg === '--check') return runCheck(forge);
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, renderOpencodeJson, renderNeutralConfig,
  transformCommandBody, opencodeAgentSuffix, rewriteClaudeScriptPaths, OPENCODE_KAOLA_SCRIPT,
  rewriteModelDispatchInstructions, rewriteModelDispatchParagraph, sentenceStart,
  stripCardModelPlaceholders, assertNoModelDispatchResidue, assertModelDispatchAnchorMatched,
  OPENCODE_MODEL_DISPATCH_GUIDANCE, OPENCODE_MODEL_DISPATCH_BLOCK, MODEL_DISPATCH_HEADING,
  opencodeKaolaScript, outDirs, treeLabel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  parseFrontmatter, parseTools, roleTier, reasoningRoles,
  PERMISSION_AXES, deniedPermissionAxes,
  listCanonAgents, listCanonCommands,
  ENV_STANDARD_MODEL, ENV_REASONING_MODEL,
  // Legacy aliases (env-derived; empty by default now that pins are opt-in).
  DEFAULT_STANDARD_MODEL: ENV_STANDARD_MODEL,
  DEFAULT_REASONING_MODEL: ENV_REASONING_MODEL,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR, CANON_PLUGINS_DIR,
  OUT_AGENT_DIR, OUT_COMMAND_DIR, OUT_HOOKS_DIR, OUT_PLUGINS_DIR, OPENCODE_JSON, REPO,
  HOOK_SCRIPTS, PLUGIN_SCRIPTS,
  writePlugin, retiredMdFiles, retiredCopiedFiles, pruneRetired,
};
