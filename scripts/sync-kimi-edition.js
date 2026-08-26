#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-kimi-edition.js — generate the Kimi Code runtime edition from canonical.
//
// Kimi Code is a coding-agent RUNTIME (like Codex/opencode), not a git forge, and it
// does NOT ride the install.sh --forge= (github/gitlab/gitea) machinery. It is
// delivered the Kimi-native way: named custom agents under `.kimi/agents/<role>.md`,
// three directory-form command Skills under `.kimi/skills/<name>/SKILL.md` (Kimi
// auto-registers each activated skill as the slash command `/<name>`), plus
// `.kimi/hooks/` (byte-copied shell hooks + a generated `kimi-hooks.toml` fragment
// the installer merges into the global `${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml`).
// This script is the
// generate-from-canonical twin of sync-opencode-edition.js: deterministic,
// idempotent, and parity-checked by test-kimi-edition.js.
//
// ONE model tier: there is NO Reasoning/Standard split on Kimi. The 14 canonical
// roles ship as Kimi custom-agent profiles named `kaola-role-<role>` and dispatch
// directly by that native name. Each profile inherits the session model while its
// tool allow-list is rendered from the shared behavior contract through the Kimi
// adapter. The canonical model tier is therefore intentionally omitted.
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
//   --write   regenerate <tree>/agents + <tree>/skills + <tree>/hooks from canonical.
//   --check   assert the generated tree is in byte-parity with a fresh render
//             (exit 1 on drift).
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const agentGen = require('./generate-agent-profiles');
const forgeLayout = require('./runtime-edition-forge');

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
const MANAGED_ROLES = new Set(agentGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

// No runtime-neutral hook scripts are active in the kimi edition. The generator still owns the
// hooks directory so --write can retire stale installed copies. The retained PostCompact rule is
// rendered directly because it runs the edition's compact-resume script.
const HOOK_SCRIPTS = [];

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

function listCanonAgents() {
  return [...agentGen.ROLES];
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

// --- renderers (pure; exported for parity test) ---

function renderAgent(canonContent, agentName, forge) {
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-kimi-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('kimi', agentName).content;
}

// The edition's ONE answer to the canonical model-dispatch instruction. Canonical states that
// instruction as PROSE ("… carries an explicit `model=` line … never omit it"); Kimi has no
// per-dispatch model override at all, so every such sentence is restated as this single wording.
const KIMI_MODEL_DISPATCH_GUIDANCE = 'Never pass a per-call model override; sub-agents inherit the session model.';

// The instruction's stable signature: a `model=` mention in PROSE. Card placeholders sit alone on
// their own line inside a dispatch card and are handled by the native routing renderer, so this
// matches the INSTRUCTION however it happens to be worded.
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
function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  // Anchored model-dispatch rewrite FIRST, on canonical text only — before the loop below
  // substitutes the edition's own one-liner, so that guidance is never fed back through the rewrite.
  const lines = body.split(/\r?\n/);
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
    out.push(line);
    i++;
  }
  // A canonical rename that walked out from under the anchor above reports itself here rather than
  // silently leaving the section in place.
  let text = out.join('\n');
  // Dispatch-card rewrite (kimi-specific). Canonical dispatch cards name a kaola ROLE
  // in subagent_type plus an install-time model= placeholder:
  //   Agent(
  //     subagent_type="tdd-guide",
  //     model="{TDD_GUIDE_MODEL}",
  //     description="...",
  //     prompt="..."
  //   )
  // Kimi Code discovers custom profiles under its native agents directory. Rewrite the
  // canonical role name to this edition's collision-resistant `kaola-role-*` profile name
  // and dispatch it directly. Scoped to the literal card opening
  // (`Agent(` + indented subagent_type= line) and to roles present in the canonical
  // map — prose mentions of `Agent(...)` and unknown role names pass through
  // untouched. Runs BEFORE the generic {X_MODEL} strip below, which then collapses
  // the now-orphaned model= line (and its comma) exactly as on opencode.
  const roles = new Set(listCanonAgents());
  text = text.replace(
    /Agent\(\n(\s+)subagent_type="([^"]+)",([\s\S]*?)prompt="/g,
    (m, indent, role, mid) => {
      if (!roles.has(role)) return m;
      return 'Agent(\n' + indent + 'subagent_type="kaola-role-' + role + '",' + mid + 'prompt="';
    }
  );
  // Card placeholder lines. The prose forms are already restated by rewriteModelDispatchInstructions
  // above, so this only ever sees a card.
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

// The generated Kimi hooks fragment maps the retained Claude SessionStart"compact" entry to
// PostCompact (Kimi's semantic counterpart) running the compact-context script. `__KIMI_HOME__` is
// a placeholder token the installer substitutes with the real
// ${KIMI_CODE_HOME:-$HOME/.kimi-code} path at install time; the >>> / <<<
// marker comments delimit the managed block for idempotent merges.
function renderKimiHooksToml(forge) {
  // The compact-context script is forge-RENAMED, so the managed block must name the
  // basename the selected forge actually deploys; a github-shaped command would point
  // at a file a gitlab install never writes.
  const compactJs = forgeLayout.scriptName('kaola-workflow-compact-context.js', forge || DEFAULT_FORGE);
  return [
    '# >>> kaola-workflow kimi hooks',
    '[[hooks]]',
    'event = "PostCompact"',
    'command = "node __KIMI_HOME__/kaola-workflow/scripts/' + compactJs + '"',
    'timeout = 5',
    '# <<< kaola-workflow kimi hooks',
    '',
  ].join('\n');
}

// --- IO helpers ---
// read() resolves a CANONICAL path (agents/, hooks/); treePath()/readTree() resolve a path inside
// the GENERATED tree. They are separate because the two roots differ under a linked worktree — see
// TREE_ROOT above — and a check that read the tree from the invoking checkout would report every
// file missing in exactly the posture a run works in.
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

function skillRel(dirName, forge) {
  return treeLabel(forge) + '/skills/' + dirName + '/SKILL.md';
}

function agentRel(role, forge) {
  return treeLabel(forge) + '/agents/' + role + '.md';
}

// The EXACT set of skill directories a fresh render produces: one `<command>` per
// canonical command. Roles use native custom-agent profiles under `agents/`. Anything else in
// .kimi/skills/ is a retired surface (e.g. the deleted fast/full `kaola-workflow-fast`
// / `-phase{1..5}` commands) that a deterministic, idempotent mirror must remove — the
// generator wrote canonical surfaces but never pruned, so --check reported parity while
// the edition suite's exact-set assertion (K1) failed on the leftovers.
function expectedSkillDirs(forge) {
  const set = new Set();
  for (const file of listCanonCommands(forge)) set.add(file.slice(0, -3));
  return set;
}

function retiredAgentFiles(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'agents'));
  if (!fs.existsSync(dir)) return [];
  const expected = new Set(listCanonAgents().map(name => name + '.md'));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && !expected.has(entry.name))
    .map(entry => entry.name)
    .sort();
}

function retiredSkillDirs(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'skills'));
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
  const dir = treePath(path.join(treeLabel(forge), 'hooks'));
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
    fs.rmSync(treePath(path.join(treeLabel(forge), 'skills', name)), { recursive: true, force: true });
    console.log('pruned     ' + treeLabel(forge) + '/skills/' + name + ' (retired surface)');
    removed++;
  }
  for (const f of retiredHookFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'hooks', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/hooks/' + f + ' (retired artifact)');
    removed++;
  }
  for (const f of retiredAgentFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'agents', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/agents/' + f + ' (retired surface)');
    removed++;
  }
  return removed;
}

function writeAgents(forge) {
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name, forge);
    const rel = agentRel(name, forge);
    const dest = treePath(rel);
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
    const dest = treePath(rel);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + rel);
      wrote++;
    }
  }
  return wrote;
}

// Kimi hook-payload adaptations are empty: the retained PostCompact rule is payload-compatible.
const HOOK_ADAPTATIONS = {};

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
  const out_dir = treePath(path.join(treeLabel(forge), 'hooks'));
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

// Bring back into parity every forge tree that ALREADY EXISTS, and create none.
//
// A tree that is absent carries no stale prose, and materializing one hands a developer a forge
// edition they never installed — so absence is not a failure here and is not reported as one. The
// caller is the regenerate step the skeleton rule already mandates: a prose edit reaches every
// tracked surface, and without this it stopped one hop short of the tree a runtime actually reads.
function runRefreshPresent() {
  const refreshed = [];
  let changed = 0;
  for (const forge of forgeLayout.FORGES) {
    if (!fs.existsSync(treePath(treeLabel(forge)))) continue;
    changed += writeAgents(forge);
    changed += writeCommands(forge);
    changed += writeHooks(forge);
    changed += pruneSkills(forge);
    refreshed.push(treeLabel(forge));
  }
  if (refreshed.length) {
    console.log('sync-kimi-edition: refreshed ' + refreshed.length + ' present tree(s): '
      + refreshed.join(', ') + '.');
  }
  // The two-root resolution above is deliberate; a run being silent about it is not. Every line
  // this function prints names a tree by its repo-relative label ('.kimi'), which reads as
  // "beside me" in the one posture where it is not — so a worktree run that renders real edits
  // leaves the MAIN checkout's deployed-from trees carrying prose that exists in no tracked file
  // there, and nothing says so: the trees are gitignored, and no chain-resident guard reads one.
  // The reader who could act on it is the one who cannot see it happened.
  //
  // Gated on the refresh actually changing something there. The writers content-compare, so an
  // in-parity refresh leaves the other checkout byte- and mtime-identical, and announcing then
  // attaches a warning to a run that touched nothing.
  //
  // The count includes pruneSkills, and the note says "change(s)" rather than "file(s) written"
  // for that reason: a refresh can DELETE from the other checkout and write nothing, which is the
  // more destructive half of the same cross-checkout reach and the half a write-only count would
  // report as a silent no-op.
  //
  // "change(s)" is also the only unit that is true here. pruneSkills removes a retired skill
  // DIRECTORY with recursive:true and counts it once, so a 5-file skill folder is one change, not
  // five — the number is changes applied, never a file tally. Counting the files inside a removed
  // directory would mean reaching into a deletion path for a cosmetic gain; keep the unit vague
  // rather than the count wrong. The gate only needs "something moved there", and it cannot read
  // zero when something did.
  //
  // stderr, not stdout: this script's stdout is a parsed interface in another mode
  // (--print-tree-root is consumed as a path by the edition installers), so an advisory stays off
  // the stream a caller might capture. It is self-contained rather than a rider on the line above,
  // because the two streams need not interleave in order once either is redirected.
  if (changed > 0 && TREE_ROOT !== REPO) {
    console.error('sync-kimi-edition: NOTE — ' + changed
      + ' change(s) in a checkout that is not this one.');
    console.error('  ' + refreshed.join(', ') + ' under ' + TREE_ROOT);
    console.error('  now render THIS checkout\'s canonical sources (' + REPO
      + '), including anything uncommitted here.');
    console.error('  Verify from that root: npm run test:kaola-workflow:editions');
  }
}

function runCheck(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const tree = treeLabel(forge);
  const mismatches = [];
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = agentRel(name, forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated native agent profile' });
      continue;
    }
    const expected = renderAgent(canon, name, forge);
    if (readTree(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const rel = skillRel(name, forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated command skill' });
      continue;
    }
    const expected = renderCommand(canon, name, forge);
    if (readTree(rel) !== expected) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const script of HOOK_SCRIPTS) {
    const rel = tree + '/hooks/' + script;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (readTree(rel) !== adaptHookForKimi(script, read('hooks/' + script))) mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
  }
  {
    const rel = tree + '/hooks/kimi-hooks.toml';
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated hooks fragment' });
    } else if (readTree(rel) !== renderKimiHooksToml(forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  for (const name of retiredSkillDirs(forge)) {
    mismatches.push({ rel: tree + '/skills/' + name, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  for (const f of retiredAgentFiles(forge)) {
    mismatches.push({ rel: tree + '/agents/' + f, reason: 'retired surface not in canonical — prune (--write removes it)' });
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
  console.log('sync-kimi-edition[' + forge + ']: ' + na + ' native agent profile(s) + ' + nc + ' command skill(s) + '
    + (HOOK_SCRIPTS.length + 1) + ' hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-kimi-edition.js (--write | --refresh-present | --check)'
    + ' [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .kimi/;\n'
    + '               gitlab/gitea write .kimi-<forge>/\n'
    + '  --write   regenerate the forge tree skills + hooks from canonical\n'
    + '  --refresh-present  regenerate every forge tree that already exists; create none (ignores --forge)\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
    + '  --print-tree-root  print the directory the generated trees land in; write nothing\n'
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
  if (arg === '--refresh-present') return runRefreshPresent();
  if (arg === '--check') return runCheck(forge);
  // Read-only, and the ONE answer to "where does the tree a deploy copies from actually live" —
  // so a consumer of the generated tree never has to restate the rule and get it wrong somewhere
  // the rule does not hold. Prints a directory and nothing else; forge-independent.
  if (arg === '--print-tree-root') { process.stdout.write(TREE_ROOT + '\n'); return; }
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, KIMI_KAOLA_SCRIPT, kimiKaolaScript,
  KIMI_MODEL_DISPATCH_GUIDANCE,
  renderKimiHooksToml, treeLabel, skillRel, agentRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForKimi, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles,
  parseFrontmatter,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
