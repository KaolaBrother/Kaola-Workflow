#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.


// ---------------------------------------------------------------------------
// test-kimi-edition.js — structural + parity validator for the Kimi Code
// runtime edition. Hand-rolled asserts (no framework), matching the repo's
// existing test style (mirror of test-opencode-edition.js, scoped to the
// additive kimi surface). Run directly:
//   node scripts/test-kimi-edition.js
//
// The kimi edition is delivered through two distinct Kimi-native carriers:
// directory-form command Skills under `.kimi/skills/<name>/SKILL.md`, and all
// 14 custom agent profiles under `.kimi/agents/<role>.md`. Role contracts are
// agents, never Skills. ONE model tier: every custom agent inherits the
// session model, while Kimi's native `tools` allowlist enforces the role's
// canonical capability boundary. This suite locks direct named dispatch
// (`subagent_type="kaola-role-<role>"`), the zero-Claude-leak invariant, the
// all-role behavior identity, the hooks fragment, route reachability, and the
// install-kimi.sh project/global ownership, idempotency, and uninstall contract (hermetic:
// every sub-case runs the REAL installer with its own temp HOME +
// KIMI_CODE_HOME + --target under os.tmpdir()).
//
// Runs under `npm run test:kaola-workflow:editions` alongside the opencode
// suite. Still outside `npm test`, the forge chains and the fast gate: an
// additive runtime edition is not a forge, so an edition-only diff triggers no
// four-chain obligation. The script exists so the suite is runnable and
// discoverable by name rather than only by remembering the path.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const sync = require('./sync-kimi-edition.js');
const schema = require('./kaola-workflow-adaptive-schema.js');
const reviewerGenerator = require('./generate-agent-profiles.js');

const REPO = sync.REPO;

// ---------------------------------------------------------------------------
// TREE_ROOT — the checkout the GENERATED tree lives in, which is NOT where the canonical sources
// are read from. Under a linked worktree the two differ, and both halves are deliberate: the
// sources are this checkout's, because a branch's edits are the whole point of running here, and
// the tree is the main checkout's, because a tree written into a worktree dies with it. Every path
// below whose first segment is a tree label resolves here; everything else resolves against REPO.
//
// COMPUTED HERE RATHER THAN IMPORTED, and that is the point. This is a second, independent
// statement of where the tree belongs, and it is what keeps D1 able to fail: a probe derived from
// the writer's own resolution agrees with it by construction — including when both are wrong — and
// a probe that cannot disagree is the guard D1 exists to be. The fallback is the same result the
// writer must honour: where no main checkout resolves (an unpacked source tree that is no git
// checkout, which is how the installers run), the tree belongs beside the script.
// ---------------------------------------------------------------------------
const TREE_ROOT = (() => {
  const { spawnSync } = require('child_process');
  // spawn-class: environment
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) return REPO;
  const common = String(r.stdout || '').trim();
  if (!common) return REPO;
  const abs = path.resolve(REPO, common);
  // A coordination directory identifies a main checkout only when it is that checkout's own `.git`.
  // Anything else — a bare repository, a submodule's `.git/modules/<name>` — means there is no main
  // checkout to speak of, and the tree then belongs beside the script rather than inside a directory
  // git owns. K15 below asserts that outcome on disk; this is the same statement, for the probe.
  return path.basename(abs) === '.git' ? path.dirname(abs) : REPO;
})();

// The ONE expression that decides which root a repo-relative path belongs to. The labels come from
// the module's own forge axis, so a forge added later is routed without a second registration here.
const TREE_LABELS = new Set(sync.FORGES.map(f => sync.treeLabel(f)));
const rootOf = rel => (TREE_LABELS.has(String(rel).split(/[\\/]/)[0]) ? TREE_ROOT : REPO);
const read = rel => fs.readFileSync(path.join(rootOf(rel), rel), 'utf8');
const exists = rel => fs.existsSync(path.join(rootOf(rel), rel));
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}

// ---------------------------------------------------------------------------
// D0 — DRIFT IS OBSERVED BEFORE IT IS REPAIRED. (Mirror of test-opencode-edition.js's D0.)
//
// The self-provision below runs `sync --write`, which REPAIRS the generated tree. Run first, it
// destroys the only evidence that the tree on this disk had drifted from canonical: measured, this
// suite passed against a tree whose skills still pointed at a file that had been deleted, because
// the preamble had just rewritten that pointer itself before the first assertion read it. Nothing
// else reported the drift either — the two installers call `--check || --write`, a REPAIR position,
// so a developer's tree is silently corrected and the drift is never named anywhere.
//
// So the check runs HERE, ahead of the write, and reports what it found on disk.
//
// WHY THIS EXITS RATHER THAN COUNTING A FAILURE. Continuing means reaching the `--write` two blocks
// down, which repairs the tree; the next run would then be green and the finding would have erased
// itself — a red that deletes its own cause is barely better than no red. Exiting before the write
// leaves the drift on disk, so the failure is durable until someone regenerates deliberately. The
// full mismatch list is printed first: that, not the remaining assertions, is what this is for.
//
// ABSENT IS A SKIP, AND THE SKIP IS LOUD. These trees are gitignored — absent from a fresh clone
// and from every worktree. A `--check` there reports every file "missing" and would be a permanent
// false red, so absence cannot be a failure; but it cannot be a silent pass either, which is the
// defect one level down from the one this block removes. Absent trees are NAMED on their own line
// and again in the suite's last line, so "verified in parity" and "nothing was on disk to check"
// can never print the same thing. Unlike opencode, the kimi edition ships no tracked config file,
// so an absent tree leaves nothing at all for this check to hold — the skip loses no coverage that
// a present tree would have had.
//
// Each forge tree is probed on its own, because presence is per tree — `--write` materializes only
// the default forge, so a `.kimi-gitlab/` an installer left behind is checked when it is there and
// skipped when it is not.
// ---------------------------------------------------------------------------
let driftVerdict = '';
// The ONE expression that decides present-vs-absent. D0 skips on it and D1 below asserts on it, so
// there is no second path for the two to disagree about: a probe that resolves somewhere no tree is
// ever written would make D0 skip every forge in silence, and D1 is what stops that being green.
const treeRootFor = forge => path.join(TREE_ROOT, sync.treeLabel(forge));
// Named once, appended to every line D0 prints, so a verdict about a tree in ANOTHER checkout can
// never read as a verdict about this one. Empty in the ordinary posture, where the two coincide.
const treeWhere = TREE_ROOT === REPO ? '' : ' [tree root: ' + TREE_ROOT + ', not this checkout]';
{
  const { spawnSync } = require('child_process');
  const verified = [];
  const absent = [];
  assert(sync.FORGES.length > 0,
    'D0: the forge axis must be non-empty — an empty axis probes nothing and would skip in silence');
  for (const forge of sync.FORGES) {
    const label = sync.treeLabel(forge);
    if (!fs.existsSync(treeRootFor(forge))) { absent.push(label); continue; }
    // spawn-class: cli-contract
    const r = spawnSync(process.execPath,
      [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), '--forge=' + forge, '--check'],
      { encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\nkimi-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-kimi-edition.js --forge=' + forge + ' --write'
        + '\nThe suite stops here rather than continue into its own sync --write, which would repair '
        + 'this tree and erase the finding.');
      process.exit(1);
    }
    verified.push(label);
  }
  for (const label of verified) console.log('D0: ' + label + ' is present and in parity with canonical.' + treeWhere);
  for (const label of absent) {
    console.log('D0: SKIPPED — ' + label + ' is absent from disk, so nothing was compared '
      + '(gitignored generated tree; a fresh clone has none).' + treeWhere);
  }
  driftVerdict = ' [drift-check: '
    + (verified.length ? verified.length + ' tree(s) in parity (' + verified.join(', ') + ')'
                       : 'NO tree verified')
    + (absent.length ? '; ' + absent.length + ' ABSENT, not checked (' + absent.join(', ') + ')' : '')
    + ']' + treeWhere;
}

// ---------------------------------------------------------------------------
// Self-provision: regenerate .kimi/ from tracked canonical sources before any
// assertion that reads it. In a clean worktree .kimi/ is fully absent (it is
// gitignored); sync --write populates agents + command skills + hooks. This makes the suite
// green from tracked sources alone with no manual seeding.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  // spawn-class: environment
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), '--write'],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('FATAL: sync-kimi-edition --write failed (test cannot proceed):');
    console.error(r.stderr || r.stdout || '(no output)');
    process.exit(1);
  }
}

// D1 — D0's presence probe must be able to SEE a materialized tree. A probe resolving a path no
// tree is ever written to returns false for every forge, so every forge takes the ABSENT branch and
// D0 checks nothing while printing three reassuring skip lines — a guard that cannot fail, wearing
// a skip's name. The `--write` above has just materialized the default forge, so the probe must now
// find it. This calls treeRootFor, the same expression D0 skips on and NOT a restatement of it: an
// independently-written copy here would pass while the probe it is supposed to defend was broken,
// which is measured, not theorised — the first version of D1 did exactly that.
//
// It is ALSO the check that the two roots agree. TREE_ROOT is derived independently of the writer's
// own resolution, so this is where "the tree lands in the main checkout" is confronted with where
// the writer actually put it. When they diverge this reds here, before hundreds of tree reads fail
// one at a time and the file finally dies on an ENOENT with no verdict attached — which is what
// happened, measured, before this line resolved the same root the writer does.
assert(fs.existsSync(treeRootFor(sync.DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(sync.DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked '
  + 'nothing. This checkout is ' + REPO + '; the tree root resolved to ' + TREE_ROOT + '. If those '
  + 'differ, the writer put the tree somewhere else and the two resolutions have diverged');

// Walk every file under .kimi/ (skills + hooks), returning repo-relative paths.
function generatedTreeFiles() {
  const out = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(path.join(TREE_ROOT, '.kimi'), '.kimi');
  return out;
}

const canonCommands = sync.listCanonCommands();                    // ['kaola-workflow-finalize.md', ...]
const canonCommandNames = canonCommands.map(f => f.slice(0, -3));  // command basenames
const canonAgents = sync.listCanonAgents();                        // roles (top-level agents/*.md only)
const skillDir = name => '.kimi/skills/' + name + '/SKILL.md';
const agentRel = (role, forge) => sync.treeLabel(forge || sync.DEFAULT_FORGE) + '/agents/' + role + '.md';
const agentFile = role => agentRel(role, sync.DEFAULT_FORGE);
const MANAGED_AGENT_MARKER = 'kaola-workflow-managed-agent: true';

function frontmatterText(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : '';
}

// Kimi accepts either a YAML sequence or a comma-separated/inline YAML list.
// Parse both so this acceptance pins the effective allowlist, not a formatting choice.
function frontmatterList(content, key) {
  const lines = frontmatterText(content).split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp('^' + key + '\\s*:').test(line));
  if (start < 0) return null;
  const tail = lines[start].replace(new RegExp('^' + key + '\\s*:\\s*'), '').trim();
  if (tail) {
    if (tail.startsWith('[')) {
      try { return JSON.parse(tail); } catch (_) { return tail.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean); }
    }
    return tail.split(',').map(s => s.trim()).filter(Boolean);
  }
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^\s+-\s+(.+?)\s*$/);
    if (!match) break;
    out.push(match[1].replace(/^['"]|['"]$/g, ''));
  }
  return out;
}

// ---------------------------------------------------------------------------
// K0 — THE SUBJECT UNDER TEST IS THE GENERATOR, NOT THE TREE.
//
// This suite self-provisions by running `sync --write` above, so any assertion comparing the
// generated tree to `sync.render*()` — or to `sync --check`, which re-renders from the same
// sources — compares a freshly regenerated artifact to its own source and CANNOT FAIL. Measured on
// the opencode twin: a generator mutated to ship every non-reviewer role contract as a 2-line stub
// passed that suite 442/442. Those comparisons are kept where they express render DETERMINISM and
// relabelled to claim only that; the armed assertions are stated as properties of the output,
// derived from the TRACKED canonical sources at run time so the expectation moves when they do.
// ---------------------------------------------------------------------------
{
  const skillsProvisioned = fs.existsSync(path.join(TREE_ROOT, '.kimi', 'skills'));
  const agentsProvisioned = fs.existsSync(path.join(TREE_ROOT, '.kimi', 'agents'));
  assert(skillsProvisioned,
    'K0: the generated .kimi/skills command tree exists after sync --write — an ABSENT tree must fail loudly '
    + 'here rather than let every readdir-driven loop below iterate over nothing');
  assert(agentsProvisioned,
    'K0-native-agents: the generated .kimi/agents tree exists after sync --write — Kimi custom '
    + 'agents are the role carrier; role-contract Skills are not an acceptable stand-in');
  if (!skillsProvisioned) {
    // Stop here rather than let the first readdir throw: a stack trace is a worse report than one
    // line naming the cause, and every count after it would be meaningless.
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.kimi', 'skills') + ' — nothing below can be tested.');
    process.exit(1);
  }
  const trackedAgents = fs.readdirSync(path.join(REPO, 'agents'))
    .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  const trackedCommands = fs.readdirSync(path.join(REPO, 'commands'))
    .filter(f => f.endsWith('.md')).sort();
  assert(trackedAgents.length > 0 && trackedCommands.length > 0,
    'K0-roster: the canonical agents/ and commands/ inventories are both non-empty — an empty '
    + 'enforcement domain would make every per-role and per-command loop in this file vacuously true');
  // K1's count assertions below compare a just-regenerated tree against the roster that generated
  // it, so they hold however wrong that roster is. This is the live property underneath them: the
  // generator's roster predicate sees the whole tracked inventory, and a role it drops is a role
  // that silently never ships on this runtime.
  assert(JSON.stringify([...canonAgents].sort()) === JSON.stringify(trackedAgents),
    'K0-roster: listCanonAgents() is EXACTLY the tracked agents/*.md inventory; canonical='
    + JSON.stringify(trackedAgents) + ' generator=' + JSON.stringify([...canonAgents].sort()));
  assert(JSON.stringify([...canonCommands].sort()) === JSON.stringify(trackedCommands),
    'K0-roster: listCanonCommands() is EXACTLY the tracked commands/*.md inventory; canonical='
    + JSON.stringify(trackedCommands) + ' generator=' + JSON.stringify([...canonCommands].sort()));
}

// ---------------------------------------------------------------------------
// K0-body: every non-empty line of the canonical role contract survives into the generated native
// agent profile. The assertion reads the tracked behavior authority, not renderAgent(), so a
// body-dropping renderer cannot compare its own wrong output to itself and pass.
// ---------------------------------------------------------------------------
{
  let checkedLines = 0;
  for (const role of canonAgents) {
    const canonLines = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'))
      .core.split('\n').map(s => s.trim()).filter(Boolean);
    const rel = agentFile(role);
    const generated = exists(rel) ? read(rel) : '';
    const missing = canonLines.filter(line => !generated.includes(line));
    checkedLines += canonLines.length;
    assert(canonLines.length > 0,
      'K0-body[' + role + ']: the canonical role contract has a non-empty body — an empty one would '
      + 'make the survival check below vacuous');
    assert(missing.length === 0,
      'K0-body[' + role + ']: every canonical contract line survives into the native Kimi agent profile'
      + ' — ' + missing.length + ' of ' + canonLines.length + ' missing, first: '
      + JSON.stringify(String(missing[0]).slice(0, 120)));
  }
  assert(checkedLines > 0,
    'K0-body: the survival check covered at least one canonical contract line (scan bite)');
}

// ---------------------------------------------------------------------------
// K1: carrier separation and exact inventories. `.kimi/skills/` contains only the command Skills;
// `.kimi/agents/` contains one Markdown custom-agent profile per canonical role. A role Skill is
// not equivalent: Skills merely inject prompt text, while native profiles own dispatch identity
// and enforced tool access.
// ---------------------------------------------------------------------------
{
  const entries = fs.readdirSync(path.join(TREE_ROOT, '.kimi', 'skills'), { withFileTypes: true });
  const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  const expected = [...canonCommandNames].sort();
  assert(entries.length === expected.length && entries.every(e => e.isDirectory()),
    'K1: .kimi/skills/ holds exactly ' + expected.length + ' entries, all directories (no stray files)');
  assert(JSON.stringify(dirNames) === JSON.stringify(expected),
    'K1: .kimi/skills/ dir set == the ' + canonCommandNames.length
    + ' canonical commands and contains NO kaola-role-* role Skills — got ' + JSON.stringify(dirNames));
  const roleSet = dirNames.filter(d => d.startsWith('kaola-role-'));
  assert(roleSet.length === 0,
    'K1: kaola-role-* role Skill count is ZERO — roles ship as native .kimi/agents profiles');
  const cmdSet = dirNames.filter(d => !d.startsWith('kaola-role-'));
  assert(cmdSet.length === canonCommandNames.length,
    'K1: command skill count matches canonical command count (' + canonCommandNames.length + ')');

  for (const name of expected) {
    const rel = skillDir(name);
    assert(exists(rel), 'K1[' + name + ']: SKILL.md exists');
    if (!exists(rel)) continue;
    const { fm } = sync.parseFrontmatter(read(rel));
    assert(fm.name === name,
      'K1[' + name + ']: frontmatter name matches the dir name (Kimi registers /<name>) — got "' + fm.name + '"');
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'K1[' + name + ']: frontmatter has a non-empty description (required by directory-form Skills)');
  }
  const agentsRoot = path.join(TREE_ROOT, '.kimi', 'agents');
  const agentEntries = fs.existsSync(agentsRoot)
    ? fs.readdirSync(agentsRoot, { withFileTypes: true }) : [];
  const actualAgentFiles = agentEntries.filter(e => e.isFile()).map(e => e.name).sort();
  const expectedAgentFiles = canonAgents.map(role => role + '.md').sort();
  assert(agentEntries.length === expectedAgentFiles.length && agentEntries.every(e => e.isFile()),
    'K1-native-agents: .kimi/agents holds exactly ' + expectedAgentFiles.length
    + ' regular Markdown profiles (one per canonical role)');
  assert(JSON.stringify(actualAgentFiles) === JSON.stringify(expectedAgentFiles),
    'K1-native-agents: generated profile file set equals the canonical 14-role roster — got '
    + JSON.stringify(actualAgentFiles));
  for (const role of canonAgents) {
    const rel = agentFile(role);
    const profile = exists(rel) ? read(rel) : '';
    const { fm } = sync.parseFrontmatter(profile);
    assert(fm.name === 'kaola-role-' + role,
      'K1-native-agents[' + role + ']: frontmatter name is the directly dispatchable kaola-role-' + role);
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'K1-native-agents[' + role + ']: profile carries the required non-empty description');
    assert((profile.match(new RegExp(MANAGED_AGENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
      'K1-native-agents[' + role + ']: profile carries exactly one Kaola generation marker (identity hint, never ownership proof)');
  }
}

// ---------------------------------------------------------------------------
// K2: no transform residue — the generated tree carries NO install-time model
// placeholders ({X_MODEL}, model="{...}"), NO Claude "MUST pass model="
// dispatch instructions, and NO doubled-comma (,,) card artifacts (locks
// transformCommandBody's model-dispatch strip + placeholder strip + comma collapse).
// Positive side: the claim invocations stamp --runtime kimi (never
// --runtime claude), and the inherit-model guidance replaced the stripped
// "MUST pass model=" prose.
// ---------------------------------------------------------------------------
for (const rel of generatedTreeFiles()) {
  const content = read(rel);
  assert(!/\{[A-Z_]+_MODEL\}/.test(content),
    'K2: ' + rel + ': no {X_MODEL} install-time placeholder remains');
  assert(!/model="\{/.test(content),
    'K2: ' + rel + ': no model="{...}" placeholder remains');
  assert(!/MUST pass `model=|do not omit\s+the `model=` line/.test(content),
    'K2: ' + rel + ': no "MUST pass model=" / "do not omit the model= line" instruction (kimi inherits the session model)');
  assert(!/,,/.test(content),
    'K2: ' + rel + ': no doubled-comma (,,) artifact from dispatch-card placeholder strip');
  assert(!/--runtime claude\b/.test(content),
    'K2: ' + rel + ': no "--runtime claude" (rewritten to --runtime kimi at generation)');
}
for (const name of ['workflow-next']) {
  const content = read(skillDir(name));
  assert(/--runtime kimi\b/.test(content),
    'K2[' + name + ']: claim invocation stamps "--runtime kimi" into workflow-state.md');
}
// #789: workflow-next itself no longer carries ANY "MUST pass model=" dispatch instruction
// (issue-scout was its only one, and is fully retired), so there is nothing left to strip and
// replace there.
//
// THE INHERIT-MODEL PROSE REPLACEMENT HAS NO CARRIER LEFT ON THIS PATH. It was checked on
// `kaola-workflow-adapt`, the one surviving surface that dispatched an agent with an explicit
// per-call model; that surface is retired and no generated skill carries a standalone per-call
// model override to strip. The BAN half still runs — the loop above asserts no `MUST pass model=`
// survives anywhere in the tree — so what is lost HERE is the positive half: nothing in this block
// confirms the replacement PROSE is still emitted, because there is nothing left for it to replace.
//
// K2-anchor below restores that positive half against the carrier that DOES exist: the canonical
// `## Agent Model Dispatch` section, whose kimi answer is the single guidance line the strip
// leaves in its place.

// ---------------------------------------------------------------------------
// K2-declaration: the model-inheritance divergence must exist as a DECLARED EXEMPTION-TABLE ENTRY,
// not merely as prose. "One rule, one wording" permits a runtime to diverge only where its
// capabilities genuinely differ, and only when that divergence is declared as a named entry with a
// one-line reason. Prose in docs/kimi-edition.md cannot satisfy that: deleting a paragraph is
// invisible to every suite. Binding the assertion to the table makes removal fail HERE.
//
// The table used to live in scripts/test-runtime-lexicon-parity.js. That guard was deleted because
// it never had a subject — it compared the engine's ENVELOPE vocabulary against runtime surfaces
// carrying INTERFACE vocabulary, two families that live in different places by design, so its
// enforced domain was 0 of 62 and always had been. The DECLARATION is not the guard: its subject is
// real and shipping, and it is checked against the generated tree immediately below. So the entry
// moves here rather than dying with the oracle that happened to host it, reason text intact.
//
// This is the only entry that relocated, because it is the only one with a reader. The other
// fourteen were notes to a reader inside a guard that enforced nothing; they went with it, and are
// recoverable from git history if a subject ever appears.
const KIMI_RUNTIME_NATIVE = Object.freeze({
  inherit_session_model:
    'Kimi subagents always inherit the session model, so Kimi surfaces carry no per-dispatch model= override and no model: frontmatter field; the other runtimes resolve a tier per dispatch.',
});
{
  const KEY = 'inherit_session_model';
  const reason = KIMI_RUNTIME_NATIVE[KEY];
  assert(typeof reason === 'string' && reason.trim().length >= 20,
    'K2-declaration: KIMI_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason — the Kimi '
      + 'model-inheritance divergence is a DECLARED runtime difference, not an undocumented one');
  assert(/inherit/i.test(reason) && /session model/i.test(reason),
    'K2-declaration: the "' + KEY + '" reason must state that Kimi subagents inherit the session model');

  // The declaration must describe both carriers that actually ship: neither a command Skill nor
  // a native agent profile may carry a `model:` frontmatter field or per-call override.
  for (const rel of [...canonCommandNames.map(skillDir), ...canonAgents.map(agentFile)]) {
    if (!exists(rel)) continue;
    const content = read(rel);
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    assert(!fm || !/^\s*model\s*:/m.test(fm[1]),
      'K2-declaration: ' + rel + ' carries a model: frontmatter field, contradicting the declared '
        + 'inherit_session_model divergence');
    assert(!/\bmodel="/.test(content),
      'K2-declaration: ' + rel + ' carries a per-call model=" override, contradicting the declared '
        + 'inherit_session_model divergence');
  }

  // #1018: a third canonical token (fable) must not grow a kimi model: field.
  // The inherit contract is unchanged.
  const fableProbe = sync.renderAgent('---\nname: planner\nmodel: fable\n---\n\nbody\n', 'planner');
  const fableFm = fableProbe.match(/^---\n([\s\S]*?)\n---/);
  assert(!fableFm || !/^\s*model\s*:/m.test(fableFm[1]),
    'K2-fable: renderAgent of a fable-class agent still carries no model: frontmatter field');
  assert(!/\bmodel="/.test(fableProbe),
    'K2-fable: renderAgent of a fable-class agent still carries no per-call model=" override');
}

// ---------------------------------------------------------------------------
// K3: render DETERMINISM — `--check` re-renders from canonical and compares against the tree
// `--write` produced moments ago in another process, so the only disagreement it can witness is a
// renderer that is not a pure function of its input (a clock, a Set iteration order, an env read).
// It is NOT byte-parity with canonical, which was the label it used to carry: a template-mangling
// transform added to the generator leaves both sides mangled and K3 green. What catches that is
// K11 (template bytes vs the tracked canonical source) and K0-body (canonical contract lines
// survive into the generated Skill).
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  // spawn-class: environment
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), '--check'],
    { encoding: 'utf8' });
  assert(r.status === 0,
    'K3: sync-kimi-edition --check exits 0 against the tree --write just produced (render is deterministic across processes)' +
    (r.status !== 0 ? ' — ' + String(r.stderr || r.stdout).split('\n')[0] : ''));
}

// ---------------------------------------------------------------------------
// K4: zero Claude leakage across the generated tree (the kimi twin of the
// opencode S2/A scans): no $CLAUDE_PLUGIN_ROOT, no capitalized proper-noun
// "Opus"/"Sonnet" (case-sensitive, whole-word — the B1 lowercase `opus`/
// `sonnet` plan-ledger tier tokens are the portable cross-edition contract and
// are never matched), and no `.claude` token ANYWHERE — with ONE scoped
// exemption: .kimi/skills/workflow-init/SKILL.md keeps the canonical
// `.claude/rules/` scaffold references (target-project CLAUDE.md semantics the
// canonical command teaches verbatim; the opencode edition preserves the same
// lines). Every `.claude` match in that one file must be the exempt
// `.claude/rules/` form. Positive side: every generated kaola_script()
// resolver is the kimi-native form resolving under ${KIMI_CODE_HOME:-$HOME/
// .kimi-code}/kaola-workflow/scripts.
// ---------------------------------------------------------------------------
{
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
  for (const rel of generatedTreeFiles()) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          'K4: ' + rel + ':' + (i + 1) + ': Claude model noun "' + m[0] +
          '" leaked into generated kimi prose (B2 — sub-agents inherit the session model; B1 lowercase `opus`/`sonnet` tier tokens are exempt)');
      }
    }
    const content = lines.join('\n');
    assert(!/\$CLAUDE_PLUGIN_ROOT/.test(content),
      'K4: ' + rel + ': no $CLAUDE_PLUGIN_ROOT (Claude plugin path leak)');
    if (rel === '.kimi/skills/workflow-init/SKILL.md') {
      const all = (content.match(/\.claude/g) || []).length;
      const exempt = (content.match(/\.claude\/rules\//g) || []).length;
      assert(all === exempt,
        'K4: workflow-init keeps ONLY the exempt `.claude/rules/` canonical scaffold references ' +
        '(found ' + all + ' `.claude` token(s), ' + exempt + ' exempt) — any other .claude form is a leak');
    } else {
      assert(!/\.claude/.test(content),
        'K4: ' + rel + ': no `.claude` token (Claude home-path leak)');
    }
  }
  // kaola_script() resolver: every generated skill that ships one must ship the
  // kimi-native form (KIMI_KAOLA_SCRIPT) honoring $KIMI_CODE_HOME → ~/.kimi-code.
  assert(sync.KIMI_KAOLA_SCRIPT.includes('.kimi-code'),
    'K4: KIMI_KAOLA_SCRIPT resolver constant resolves under the .kimi-code home');
  assert(!sync.KIMI_KAOLA_SCRIPT.includes('.claude'),
    'K4: KIMI_KAOLA_SCRIPT resolver constant carries no .claude path');
  let resolverCount = 0;
  for (const rel of generatedTreeFiles().filter(r => r.endsWith('SKILL.md'))) {
    const content = read(rel);
    if (!content.includes('kaola_script(){')) continue;
    resolverCount++;
    const resolverLine = content.split('\n').find(l => l.includes('kaola_script(){'));
    assert(resolverLine.includes('${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts'),
      'K4: ' + rel + ': kaola_script() resolves scripts via ${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts');
  }
  assert(resolverCount > 0,
    'K4: at least one generated skill ships the kaola_script() resolver (resolver rewrite bite)');
}

// ---------------------------------------------------------------------------
// K5: native agent dispatch + enforced tool allowlists. Kimi discovers custom
// profiles and dispatches them by their frontmatter name when a command has a
// native call. A compact command need not contain an example card: dispatch
// semantics are carried by the bounded runtime contract, and any actual call
// must retain the native profile identity. Falling back to coder/explore and
// asking it to invoke a role Skill is not the same carrier.
// ---------------------------------------------------------------------------
{
  const CARD = /Agent\(\n\s+subagent_type="([^"]+)"/g;
  for (const file of canonCommands) {
    const name = file.slice(0, -3);
    const generated = read(skillDir(name));
    const kimiCards = [...generated.matchAll(CARD)].map(m => m[1]);
    if (name === 'workflow-init') continue;
    const dispatchAt = generated.search(/Runtime dispatch contract \(always loaded\)/i);
    const dispatchEnd = generated.indexOf('<!-- KW-RUNTIME-DISPATCH-END -->', dispatchAt);
    const compactAt = generated.indexOf('<!-- KW-COMPACT-RECOVERY-START -->');
    const compactEnd = generated.indexOf('<!-- KW-COMPACT-RECOVERY-END -->', compactAt);
    assert(compactAt >= 0 && compactEnd > compactAt
        && dispatchAt > compactAt && dispatchEnd > dispatchAt && dispatchEnd < compactEnd,
      'K5[' + name + ']: generated command carries a bounded always-loaded dispatch contract');
    for (const actual of kimiCards) {
      assert(/^kaola-role-[a-z0-9-]+$/.test(actual),
        'K5[' + name + ']: any native Agent() call retains a kaola-role profile identity — got "' + actual + '"');
    }
    assert(!/subagent_type="(?:coder|explore)"/.test(generated),
      'K5[' + name + ']: generated command does not downgrade a named Kaola role to coder/explore');
    assert(!/First invoke the `kaola-role-[^`]+` Skill|invoke (?:the )?`?kaola-role-[a-z0-9-]+`? Skill/i.test(generated),
      'K5[' + name + ']: generated dispatch prompt carries no role-Skill bootstrap prefix');
  }
  assert(canonCommands.length > 0,
    'K5: the canonical command set is non-empty for native dispatch contract checks');

  const contracts = reviewerGenerator.loadBehaviorContracts().roles;
  let restrictedProfiles = 0;
  let bashProfiles = 0;
  for (const role of canonAgents) {
    const profile = exists(agentFile(role)) ? read(agentFile(role)) : '';
    const requirements = new Set(contracts[role].capability_requirements);
    const expectedTools = ['Read', 'Grep', 'Glob'];
    if (requirements.has('scoped_write')) expectedTools.splice(1, 0, 'Write', 'Edit');
    if (requirements.has('command_execution')) expectedTools.push('Bash');
    if (requirements.has('external_research')) expectedTools.push('WebSearch', 'FetchURL');
    const actualTools = frontmatterList(profile, 'tools');
    assert(Array.isArray(actualTools),
      'K5-tools[' + role + ']: native Kimi profile declares an explicit tools allowlist; omission would grant every tool');
    assert(JSON.stringify([...(actualTools || [])].sort()) === JSON.stringify([...expectedTools].sort()),
      'K5-tools[' + role + ']: tools allowlist exactly implements canonical capability requirements — expected '
      + JSON.stringify(expectedTools) + ', got ' + JSON.stringify(actualTools));
    if (!requirements.has('command_execution')) {
      restrictedProfiles++;
      assert(!(actualTools || []).includes('Bash'),
        'K5-tools[' + role + ']: role without command_execution cannot receive Bash');
    } else {
      bashProfiles++;
      assert((actualTools || []).includes('Bash'),
        'K5-tools[' + role + ']: role with command_execution retains Bash');
    }
  }
  assert(restrictedProfiles > 0 && bashProfiles > 0,
    'K5-tools: acceptance exercises both Bash-withheld and Bash-granted native profiles');

  // workflow-next no longer dispatches any agent inline (the retired issue-scout survey folded
  // into the workflow-planner's no-target mode, dispatched by the SEPARATE adapt surface), so no
  // {ISSUE_SCOUT_MODEL} placeholder or install-time-resolution prose should ever leak here.
  const wfNext = read(skillDir('workflow-next'));
  assert(!wfNext.includes('ISSUE_SCOUT_MODEL'),
    'K5[workflow-next]: no {ISSUE_SCOUT_MODEL} placeholder leaks (kimi has no install-time render step)');
  assert(!wfNext.includes('issue-scout'),
    'K5[workflow-next]: no retired issue-scout dispatch prose leaks into the router surface');
}

// ---------------------------------------------------------------------------
// K6: all-role behavior identity — every Kimi native profile retains deterministic normalized behavior
// identity through the kimi render (role / behavior_contract_version /
// behavior_contract_hash / behavior-core bytes). Contract/profile assertion
// only: foundation-model findings and prose remain stochastic and are never
// promised to match across runtimes.
// ---------------------------------------------------------------------------
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const kimiText = exists(agentFile(role)) ? read(agentFile(role)) : '';
  if (!kimiText) {
    assert(false, `K6-agent[${role}]: generated native profile exists before behavior identity is evaluated`);
    continue;
  }
  const kimi = reviewerGenerator.behaviorIdentityFromCore(kimiText);
  assert(kimi.role === canonical.role
    && kimi.behavior_contract_version === canonical.behavior_contract_version
    && kimi.behavior_contract_hash === canonical.behavior_contract_hash,
  `K6-agent[${role}]: kimi native profile retains normalized behavior identity`);
  assert(kimi.core === canonical.core,
    `K6-agent[${role}]: kimi render preserves behavior-core bytes`);
  // The kimi render carries the schema-2 identity fields (a body HTML comment block) with
  // a FRESH resolved_profile_hash re-stamped over the kimi bytes — never the reused Claude hash.
  const kimiHash = (kimiText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(kimiHash && /^[0-9a-f]{64}$/.test(kimiHash),
    `K6-agent[${role}]: kimi native profile carries a resolved_profile_hash`);
  assert((kimiText.match(/^resolved_profile_hash\s*:\s*[0-9a-f]{64}\s*$/gm) || []).length === 1,
    `K6-agent[${role}]: kimi native profile carries EXACTLY ONE resolved_profile_hash line`);
  let kimiHashVerifies = true;
  try { reviewerGenerator.verifyResolvedProfileHash(kimiText); } catch (_) { kimiHashVerifies = false; }
  assert(kimiHashVerifies,
    `K6-reviewer[${role}]: resolved_profile_hash verifies over the kimi bytes (zeroed-self sha256)`);
  const clHash = (read('agents/' + role + '.md').match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(kimiHash !== clHash,
    `K6-reviewer[${role}]: kimi hash is re-stamped over kimi bytes (not the reused Claude render hash)`);
  assert(new RegExp('^behavior_contract_version:\\s*' + canonical.behavior_contract_version + '\\s*$', 'm').test(kimiText),
    `K6-reviewer[${role}]: kimi skill preserves the canonical behavior_contract_version line`);
  assert(new RegExp('^behavior_contract_hash:\\s*' + canonical.behavior_contract_hash + '\\s*$', 'm').test(kimiText),
    `K6-reviewer[${role}]: kimi skill preserves the canonical behavior_contract_hash line`);
  assert(!/(?:identical|same|byte-identical)[^\n]{0,80}(?:model output|findings|verdict|review output)/i.test(kimiText),
    `K6-reviewer[${role}]: kimi skill makes no stochastic-output-identity claim`);
}

// ---------------------------------------------------------------------------
// K7: Kimi intentionally emits no compact or tool-use hook. The generated tree
// must contain no fragment that can reintroduce a per-session prompt lifecycle.
// ---------------------------------------------------------------------------
{
  assert(sync.renderKimiHooksToml() === '',
    'K7: compatibility renderer returns no Kimi hook fragment');
  assert(JSON.stringify(sync.expectedHookFiles()) === '[]',
    'K7: fresh generated Kimi tree has zero hook files');
  assert(!exists('.kimi/hooks/kimi-hooks.toml'),
    'K7: retired kimi-hooks.toml is pruned from the generated tree');
}
for (const script of sync.HOOK_SCRIPTS) {
  const rel = '.kimi/hooks/' + script;
  assert(exists(rel), 'K7[' + script + ']: hook deployed under .kimi/hooks/');
  if (exists(rel)) {
    const canonical = read('hooks/' + script);
    if (sync.HOOK_ADAPTATIONS[script]) {
      // Payload-adapted copy: must equal canonical with EXACTLY the pinned kimi
      // field-name adaptation applied (recomputed here — a drifted anchor throws
      // inside adaptHookForKimi, failing loudly rather than shipping unadapted).
      assert(read(rel) === sync.adaptHookForKimi(script, canonical),
        'K7[' + script + ']: equals canonical with the pinned kimi payload adaptation applied');
      assert(read(rel) !== canonical,
        'K7[' + script + ']: adaptation actually changed bytes (canonical uses Claude payload field names)');
      assert(read(rel).startsWith('# kimi-edition: payload-adapted copy'),
        'K7[' + script + ']: carries the payload-adapted marker header');
    } else {
      assert(read(rel) === canonical,
        'K7[' + script + ']: byte-identical to canonical hooks/' + script);
    }
  }
}
// ---------------------------------------------------------------------------
// K8: route reachability (mirror of test-route-reachability.js T2 + the
// opencode A9, scoped to .kimi/skills/) — every receipt-EMITTED command target
// (claim.js's next_command route constants) resolves to an installed kimi
// command skill, AND every slash-command reference inside the generated tree
// (e.g. `/kaola-workflow-adapt`, `/workflow-next`) resolves to a skill dir.
// The scan regex excludes script-path lookalikes: kaola-workflow-*.js names
// are extension-qualified and plugins/kaola-workflow-{gitlab,gitea} paths are
// preceded by a path char, so only genuine slash-command mentions match.
// ---------------------------------------------------------------------------
{
  // The target set is DERIVED from the generated-surface registry — the same TOPICS table that
  // renders the surfaces — exactly as test-route-reachability.js T2 does. It used to be the two
  // schema constants `PLAN_RUN_COMMAND` / `ADAPT_COMMAND`; both name commands that no longer
  // exist, and a hand-typed pair is how a suite ends up asserting reachability for a surface
  // nobody ships.
  const { TOPICS: ROUTING_TOPICS } = require('./generate-routing-surfaces.js');
  const emittedCommandTargets = Object.keys(ROUTING_TOPICS).sort()
    .map(t => ROUTING_TOPICS[t].command_basename);
  const installed = new Set(
    fs.readdirSync(path.join(TREE_ROOT, '.kimi', 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name)
  );
  for (const target of emittedCommandTargets) {
    assert(installed.has(target),
      'K8: receipt-emitted command target "/' + target + '" resolves to .kimi/skills/' + target + '/SKILL.md');
  }
  const SLASH_REF = /(?<![\w./-])\/(kaola-workflow-[a-z0-9-]+|workflow-(?:next|init))(?![\w.-])/g;
  const referenced = new Set();
  for (const rel of generatedTreeFiles().filter(r => r.endsWith('SKILL.md'))) {
    for (const m of read(rel).matchAll(SLASH_REF)) referenced.add(m[1]);
  }
  assert(referenced.size > 0,
    'K8: generated tree references at least one slash command (scan bite)');
  for (const target of [...referenced].sort()) {
    assert(installed.has(target),
      'K8: slash-command reference "/' + target + '" resolves to a generated skill dir under .kimi/skills/');
  }
}

// ---------------------------------------------------------------------------
// P1 / P4 / U1 / A1: install-kimi.sh contract — command Skills and native agent profiles,
// project/global scope, collision ownership, re-install idempotency
// (exactly ONE managed hooks block in config.toml), --uninstall zero-residue,
// and zero Claude-path leaks across the deployed tree. HERMETIC per sub-case:
// each run gets its OWN fresh temp HOME (seed_kaola_config writes only under
// $TMPDIR), its OWN temp KIMI_CODE_HOME (skills/support scripts/config.toml
// land only under $TMPDIR — the real ~/.kimi-code is never touched), and its
// OWN temp --target. The REAL installer runs (support scripts + hooks merge
// included; `kimi doctor config` validates the merged config on machines with
// a kimi binary).
//
// #725 Phase A: the fast/full install-time OPT-IN PARTITION itself is retired
// (canonical no longer ships `kaola-workflow-fast.md` / `kaola-workflow-phase[1-5].md`
// — n2-deleted, so nothing exists for a --with-fast/--with-full opt-in to
// deploy). The former P2/P3 opt-in-partition probes (--with-fast deploys the
// fast skill + installed_paths:["fast"], --with-full deploys phase1-5 +
// installed_paths:["full"]) are DELETED IN FULL — mirrors
// test-opencode-edition.js's P2–P6 retirement. install-kimi.sh itself still
// parses the `--with-fast`/`--with-full` flags (an unowned, deferred write-set
// gap — n1-recon GAP-3 — out of this node's scope) but they are now inert for
// skill deployment: the adaptive-only surface is the only reachable outcome,
// which is exactly what P1 below locks in.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } = require('fs');
  const os = require('os');

  const INSTALLER = path.join(REPO, 'install-kimi.sh');
  // Issue #1032: keep the retired dispatch hook in the bounded list and prove both cleanup paths
  // consume that list. This source-contract check avoids any real-home install.
  const installerSource = readFileSync(INSTALLER, 'utf8');
  const retiredHooks = installerSource.match(/\bRETIRED_HOOKS\s*=\s*\(([^)]*)\)/);
  const hasRetiredHookCleanup = body => {
    const loop = String(body).match(/^[ \t]*for[ \t]+retired[ \t]+in[^\n]*RETIRED_HOOKS[^\n]*;[ \t]*do[ \t]*\n([\s\S]*?)^[ \t]*done[ \t]*$/m);
    return !!loop && /\brm\s+-f\b/.test(loop[1]) && /\$retired\b/.test(loop[1]) && /hooks/.test(loop[1]);
  };
  const installStart = installerSource.indexOf('install_support_scripts() {');
  const uninstallStart = installerSource.indexOf('uninstall_edition() {');
  assert(retiredHooks && /\bkaola-workflow-subagent-dispatch-log\.sh\b/.test(retiredHooks[1]),
    'R1: RETIRED_HOOKS contains kaola-workflow-subagent-dispatch-log.sh');
  assert(installStart >= 0 && uninstallStart > installStart
    && hasRetiredHookCleanup(installerSource.slice(installStart, uninstallStart)),
    'R2: install cleanup consumes the bounded RETIRED_HOOKS list for hook removal');
  assert(uninstallStart >= 0 && hasRetiredHookCleanup(installerSource.slice(uninstallStart)),
    'R3: uninstall cleanup consumes the bounded RETIRED_HOOKS list for hook removal');
  // The three surviving command topics. `kaola-workflow-adapt` and `kaola-workflow-plan-run`
  // were the node executor's own surfaces and went with it.
  const ADAPTIVE_CORE = [
    'kaola-workflow-finalize', 'workflow-init', 'workflow-next',
  ];

  // Partition exhaustiveness (mirror of the opencode F5): the canonical command
  // set must be EXACTLY adaptive-core (the fast/full opt-in partitions are
  // retired) — a new canonical command left unaccounted-for fails HERE (the
  // installer also fails closed on it).
  {
    const canon = [...canonCommandNames].sort();
    assert(JSON.stringify(canon) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'P0: canonical commands == adaptive-core exactly (fast/full opt-in partitions retired) — canon=' + JSON.stringify(canon));
  }

  function runInstaller(extraArgs, opts) {
    opts = opts || {};
    extraArgs = extraArgs || [];
    const home = opts.home || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-home-'));
    const kimiHome = opts.kimiHome || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-kh-'));
    const dest = opts.dest || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-dest-'));
    const isGlobal = extraArgs.includes('--global');
    const args = ['--target', dest, '--yes'].concat(extraArgs);
    // `opts.installer` runs a COPY of this checkout instead of this checkout (P5 below): the state
    // some cases need is a state of the SOURCE tree, and mutating this one is not on offer.
    // spawn-class: environment
    const r = spawnSync('bash', [opts.installer || INSTALLER].concat(args), {
      env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }),
      encoding: 'utf8',
      timeout: opts.timeout,
    });
    return {
      ok: r.status === 0,
      status: r.status,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
      error: r.error || null,
      home, kimiHome, dest,
      configPath: path.join(home, '.config', 'kaola-workflow', 'config.json'),
      kimiConfig: path.join(kimiHome, 'config.toml'), isGlobal,
    };
  }
  const skillsDir = r => path.join(r.dest, '.kimi-code', 'skills');
  const scopedSkillsDir = r => r.isGlobal ? path.join(r.kimiHome, 'skills') : skillsDir(r);
  const agentsDir = r => r.isGlobal ? path.join(r.kimiHome, 'agents') : path.join(r.dest, '.kimi-code', 'agents');
  const deployedSkills = r => existsSync(scopedSkillsDir(r)) ? readdirSync(scopedSkillsDir(r)).sort() : [];
  const deployedAgents = r => existsSync(agentsDir(r))
    ? readdirSync(agentsDir(r)).filter(name => name.endsWith('.md')).sort() : [];
  const managedBlockCount = p => existsSync(p)
    ? readFileSync(p, 'utf8').split('\n').filter(l => l.trim() === '# >>> kaola-workflow kimi hooks').length
    : 0;
  const clean = r => {
    for (const d of [r.home, r.kimiHome, r.dest]) {
      try { rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  };
  const expectDeployed = (r, cmdNames, label) => {
    const expected = [...cmdNames].sort();
    assert(JSON.stringify(deployedSkills(r)) === JSON.stringify(expected),
      label + ': deployed skill set == exactly ' + cmdNames.length
      + ' command Skill(s), with no kaola-role-* role Skills — got ' + JSON.stringify(deployedSkills(r)));
    const expectedAgents = canonAgents.map(role => role + '.md').sort();
    assert(JSON.stringify(deployedAgents(r)) === JSON.stringify(expectedAgents),
      label + ': deployed native agent set == the canonical ' + expectedAgents.length
      + ' profiles — got ' + JSON.stringify(deployedAgents(r)));
  };
  const firstStderrLine = r => String(r.stderr).split('\n')[0];

  // P1 — project install deploys adaptive-core command Skills + all native agents, lands support
  // scripts + hook scripts under the kimi home, merges EXACTLY ONE managed hooks
  // block into config.toml, and never touches the user-owned shared config.
  {
    const r = runInstaller([]);
    assert(r.ok,
      'P1: default install-kimi.sh exits 0 (got status ' + r.status + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(existsSync(path.join(skillsDir(r), name, 'SKILL.md')),
        'P1[' + name + ']: default install deploys the adaptive-core command skill');
    }
    for (const role of canonAgents) {
      const installed = path.join(agentsDir(r), role + '.md');
      assert(existsSync(installed),
        'P1[' + role + ']: default project install deploys every native agent profile');
      if (existsSync(installed)) {
        assert(readFileSync(installed, 'utf8').includes(MANAGED_AGENT_MARKER),
          'P1[' + role + ']: installed native profile carries the ownership marker');
      }
    }
    expectDeployed(r, ADAPTIVE_CORE, 'P1 (exact-set)');
    // Support scripts (manifest-driven) + hook scripts land under the kimi home.
    const scriptsHome = path.join(r.kimiHome, 'kaola-workflow', 'scripts');
    assert(existsSync(scriptsHome),
      'P1: support scripts land at <kimi_home>/kaola-workflow/scripts');
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    // spawn-class: environment
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'P1: install manifest lists at least one support script');
    const missing = names.filter(n => !existsSync(path.join(scriptsHome, n)));
    assert(missing.length === 0,
      'P1: all manifest support scripts deployed — missing: ' + missing.slice(0, 5).join(', '));
    for (const h of sync.HOOK_SCRIPTS) {
      assert(existsSync(path.join(r.kimiHome, 'kaola-workflow', 'hooks', h)),
        'P1: hook script ' + h + ' deployed at <kimi_home>/kaola-workflow/hooks/');
    }
    assert(managedBlockCount(r.kimiConfig) === 0 && !existsSync(r.kimiConfig),
      'P1: fresh install adds no config.toml hook block or empty config shell');
    assert(!existsSync(r.configPath),
      'P1: default install must not create ~/.config/kaola-workflow/config.json (user-owned; the\n      workflow has no install-time configuration)');
    clean(r);
  }

  // P1g — global scope uses Kimi's documented user agent directory while preserving the same
  // command Skills and shared hook behavior.
  {
    const r = runInstaller(['--global']);
    assert(r.ok,
      'P1g: global install-kimi.sh exits 0 (got status ' + r.status
      + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
    expectDeployed(r, ADAPTIVE_CORE, 'P1g (global exact-set)');
    assert(agentsDir(r) === path.join(r.kimiHome, 'agents'),
      'P1g: global native agents resolve under $KIMI_CODE_HOME/agents');
    assert(scopedSkillsDir(r) === path.join(r.kimiHome, 'skills'),
      'P1g: global command Skills resolve under $KIMI_CODE_HOME/skills');
    assert(managedBlockCount(r.kimiConfig) === 0,
      'P1g: global install adds no managed hooks block');
    const r2 = runInstaller(['--global'], { home: r.home, kimiHome: r.kimiHome, dest: r.dest });
    assert(r2.ok, 'P1g: global reinstall exits 0');
    expectDeployed(r2, ADAPTIVE_CORE, 'P1g (global reinstall exact-set)');
    assert(managedBlockCount(r.kimiConfig) === 0,
      'P1g: global reinstall remains hook-free');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--global', '--uninstall', '--yes'], {
      env: Object.assign({}, process.env, { HOME: r.home, KIMI_CODE_HOME: r.kimiHome }), encoding: 'utf8',
    });
    assert(ru.status === 0, 'P1g: global uninstall exits 0 (got ' + ru.status + ')');
    assert(!existsSync(path.join(r.kimiHome, 'skills')),
      'P1g: global uninstall removes the managed command Skills directory after it becomes empty');
    assert(!existsSync(path.join(r.kimiHome, 'agents')),
      'P1g: global uninstall removes the managed native agent directory after it becomes empty');
    assert(managedBlockCount(r.kimiConfig) === 0,
      'P1g: global uninstall removes the managed hooks block');
    clean(r);
    clean(r2);
  }

  // P1o — collision ownership. A same-name custom profile without a deploy-manifest record is
  // user-owned: install must fail rather than overwrite it, and uninstall must not delete it.
  // This first leg omits the generation marker; S2 below proves forging the marker changes nothing.
  {
    const home = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-home-'));
    const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-kh-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-dest-'));
    const collisionDir = path.join(dest, '.kimi-code', 'agents');
    const collision = path.join(collisionDir, canonAgents[0] + '.md');
    const userBytes = Buffer.from('---\nname: ' + canonAgents[0] + '\ndescription: user owned\n---\n\nUSER BYTES\n');
    fs.mkdirSync(collisionDir, { recursive: true });
    fs.writeFileSync(collision, userBytes);
    const r = runInstaller([], { home, kimiHome, dest });
    assert(!r.ok,
      'P1o: project install fails closed on an unmanaged same-name native agent collision');
    assert(fs.readFileSync(collision).equals(userBytes),
      'P1o: failed install preserves the unmanaged colliding agent byte-for-byte');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
      env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }), encoding: 'utf8',
    });
    assert(ru.status === 0,
      'P1o: uninstall exits 0 beside an unmanaged same-name agent (got ' + ru.status + ')');
    assert(existsSync(collision) && fs.readFileSync(collision).equals(userBytes),
      'P1o: uninstall preserves an unmanaged same-name native agent byte-for-byte');
    clean({ home, kimiHome, dest });

    const globalHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-global-home-'));
    const globalKimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-global-kh-'));
    const globalDest = mkdtempSync(path.join(os.tmpdir(), 'kimi-owner-global-dest-'));
    const globalCollisionDir = path.join(globalKimiHome, 'agents');
    const globalCollision = path.join(globalCollisionDir, canonAgents[0] + '.md');
    fs.mkdirSync(globalCollisionDir, { recursive: true });
    fs.writeFileSync(globalCollision, userBytes);
    const rg = runInstaller(['--global'], {
      home: globalHome, kimiHome: globalKimiHome, dest: globalDest,
    });
    assert(!rg.ok,
      'P1o-global: global install fails closed on an unmanaged same-name native agent collision');
    assert(fs.readFileSync(globalCollision).equals(userBytes),
      'P1o-global: failed global install preserves the unmanaged colliding agent byte-for-byte');
    // spawn-class: environment
    const rug = spawnSync('bash', [INSTALLER, '--global', '--uninstall', '--yes'], {
      env: Object.assign({}, process.env, { HOME: globalHome, KIMI_CODE_HOME: globalKimiHome }), encoding: 'utf8',
    });
    assert(rug.status === 0,
      'P1o-global: global uninstall exits 0 beside an unmanaged same-name agent (got ' + rug.status + ')');
    assert(existsSync(globalCollision) && fs.readFileSync(globalCollision).equals(userBytes),
      'P1o-global: global uninstall preserves an unmanaged same-name agent byte-for-byte');
    clean({ home: globalHome, kimiHome: globalKimiHome, dest: globalDest });
  }

  // -------------------------------------------------------------------------
  // S2 (security review R2, #1033) — Kimi profile/legacy-carrier ownership.
  //
  // A marker embedded in the candidate file is self-asserted data, not evidence that Kaola wrote
  // the destination. Current native agents therefore use the same independent ownership contract
  // at project and global scope: `<agents>/.kaola-workflow-agent-manifest` records one plain
  // filename + SHA-256 row per deployed profile. Reinstall and uninstall may replace/delete a file
  // only while its bytes still match that record. A user edit (which naturally leaves the generated
  // marker in place) turns the file into owner-controlled data and must survive byte-for-byte.
  //
  // The retired v9 role-Skill carrier predates that manifest. Its narrow migration proof is exact
  // known shipped bytes: a byte-identical v9.17.2 role Skill may be removed, while a same-name dir
  // with even one owner edit must remain. The fixture is rendered by the actual tagged v9.17.2
  // generator, independently of the current installer's retired-name tables. Symlink cases use a
  // marker-bearing target deliberately: following grep/cp/rm semantics is the believable near-miss
  // these checks must falsify.
  // -------------------------------------------------------------------------
  {
    const crypto = require('crypto');
    const AGENT_MANIFEST = '.kaola-workflow-agent-manifest';
    const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
    const sameBytes = (file, expected) => {
      try { return readFileSync(file).equals(expected); } catch (_) { return false; }
    };
    const sameSymlink = (file, expectedTarget) => {
      try { return fs.lstatSync(file).isSymbolicLink() && fs.readlinkSync(file) === expectedTarget; }
      catch (_) { return false; }
    };
    const manifestRows = manifestPath => {
      if (!existsSync(manifestPath)) return [];
      return readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(line => {
        const fields = line.split('\t');
        return { name: fields[0], hash: fields[1], fields: fields.length };
      });
    };
    // Snapshot without following links or opening non-regular files.  In particular, an FIFO
    // manifest is represented by topology + mode only; a test oracle that reads it would hang
    // before the installer under test ever gets a verdict.
    const carrierTreeFingerprint = root => {
      const rows = [];
      const visit = (abs, rel) => {
        let stat;
        try { stat = fs.lstatSync(abs); } catch (error) {
          if (error && error.code === 'ENOENT') return;
          throw error;
        }
        const mode = (stat.mode & 0o7777).toString(8);
        if (stat.isSymbolicLink()) {
          rows.push([rel, 'symlink', mode, fs.readlinkSync(abs)]);
          return;
        }
        if (stat.isDirectory()) {
          rows.push([rel, 'directory', mode]);
          for (const name of readdirSync(abs).sort()) visit(path.join(abs, name), path.join(rel, name));
          return;
        }
        if (stat.isFile()) {
          rows.push([rel, 'file', mode, sha256(readFileSync(abs))]);
          return;
        }
        rows.push([rel, stat.isFIFO() ? 'fifo' : 'other', mode]);
      };
      visit(root, '.');
      return rows;
    };
    const carrierWorldFingerprint = roots => JSON.stringify(
      roots.map(root => [root, carrierTreeFingerprint(root)]));
    const assertCurrentAgentManifest = (r, label) => {
      const dir = agentsDir(r);
      const manifest = path.join(dir, AGENT_MANIFEST);
      assert(existsSync(manifest),
        label + ': install records a filename + SHA-256 ownership manifest beside native agents');
      if (!existsSync(manifest)) return;
      const rows = manifestRows(manifest);
      const expected = canonAgents.map(role => role + '.md').sort();
      const names = rows.map(row => row.name).sort();
      assert(rows.every(row => row.fields === 2 && /^[a-f0-9]{64}$/.test(row.hash)),
        label + ': every ownership row is exactly <plain filename> TAB <64-char lowercase SHA-256>');
      assert(JSON.stringify(names) === JSON.stringify(expected),
        label + ': ownership manifest names exactly the canonical native-agent roster — got '
        + JSON.stringify(names));
      const drift = rows.filter(row => !/^[^/\\]+\.md$/.test(row.name)
        || !existsSync(path.join(dir, row.name))
        || sha256(readFileSync(path.join(dir, row.name))) !== row.hash).map(row => row.name);
      assert(drift.length === 0,
        label + ': every manifest hash binds the deployed bytes and every name is a plain Markdown basename — drifted '
        + JSON.stringify(drift));
    };

    // S2.1 — both supported scopes publish the independent ownership record.
    for (const [label, args] of [['S2.1-project', []], ['S2.1-global', ['--global']]]) {
      const r = runInstaller(args);
      assert(r.ok, label + ': seed install exits 0 before manifest inspection');
      if (r.ok) assertCurrentAgentManifest(r, label);
      clean(r);
    }

    // S2.2 — reinstall never adopts or overwrites a profile whose recorded bytes changed.
    for (const [label, args] of [['S2.2-project', []], ['S2.2-global', ['--global']]]) {
      const r1 = runInstaller(args);
      assert(r1.ok, label + ': seed install exits 0');
      if (!r1.ok) { clean(r1); continue; }
      const profile = path.join(agentsDir(r1), canonAgents[0] + '.md');
      const original = readFileSync(profile);
      const ownerBytes = Buffer.concat([original, Buffer.from('\nUSER_EDIT_SENTINEL\n')]);
      fs.writeFileSync(profile, ownerBytes);
      const r2 = runInstaller(args, { home: r1.home, kimiHome: r1.kimiHome, dest: r1.dest });
      assert(existsSync(profile) && readFileSync(profile).equals(ownerBytes),
        label + ': reinstall preserves a user-modified manifest-recorded profile byte-for-byte even though its marker remains');
      const rows = manifestRows(path.join(agentsDir(r1), AGENT_MANIFEST));
      const row = rows.find(candidate => candidate.name === path.basename(profile));
      assert(!row || row.hash !== sha256(ownerBytes),
        label + ': reinstall never adopts the user-modified bytes into its ownership manifest (status '
        + r2.status + ')');
      clean(r1);
      clean(r2);
    }

    // S2.3 — uninstall has the same hash fence; project and global owner edits survive.
    for (const [label, args] of [['S2.3-project', []], ['S2.3-global', ['--global']]]) {
      const r = runInstaller(args);
      assert(r.ok, label + ': seed install exits 0');
      if (!r.ok) { clean(r); continue; }
      const profile = path.join(agentsDir(r), canonAgents[1] + '.md');
      const ownerBytes = Buffer.concat([readFileSync(profile), Buffer.from('\nUSER_EDIT_BEFORE_UNINSTALL\n')]);
      fs.writeFileSync(profile, ownerBytes);
      const uninstallArgs = args.includes('--global')
        ? ['--global', '--uninstall', '--yes']
        : ['--uninstall', '--target', r.dest, '--yes'];
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER].concat(uninstallArgs), {
        env: Object.assign({}, process.env, { HOME: r.home, KIMI_CODE_HOME: r.kimiHome }),
        encoding: 'utf8',
      });
      assert(existsSync(profile) && readFileSync(profile).equals(ownerBytes),
        label + ': uninstall preserves a user-modified manifest-recorded profile byte-for-byte (status '
        + ru.status + ')');
      clean(r);
    }

    // S2.4 — copying the generated marker into an unmanaged regular file cannot manufacture
    // ownership for either install or uninstall.
    for (const [label, args] of [['S2.4-project', []], ['S2.4-global', ['--global']]]) {
      const home = mkdtempSync(path.join(os.tmpdir(), 'kimi-marker-home-'));
      const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-marker-kh-'));
      const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-marker-dest-'));
      const fakeRun = { home, kimiHome, dest, isGlobal: args.includes('--global') };
      const dir = agentsDir(fakeRun);
      const profile = path.join(dir, canonAgents[2] + '.md');
      const forged = Buffer.from('---\nname: user-owned\n---\n\n# ' + MANAGED_AGENT_MARKER + '\nOWNER BYTES\n');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(profile, forged);
      const install = runInstaller(args, { home, kimiHome, dest });
      assert(!install.ok,
        label + ': install fails closed on a marker-forged same-name profile with no manifest ownership');
      assert(existsSync(profile) && readFileSync(profile).equals(forged),
        label + ': failed install preserves the marker-forged user profile byte-for-byte');
      const uninstallArgs = args.includes('--global')
        ? ['--global', '--uninstall', '--yes']
        : ['--uninstall', '--target', dest, '--yes'];
      // spawn-class: environment
      const uninstall = spawnSync('bash', [INSTALLER].concat(uninstallArgs), {
        env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }),
        encoding: 'utf8',
      });
      assert(existsSync(profile) && readFileSync(profile).equals(forged),
        label + ': uninstall cannot delete a marker-forged profile without matching manifest proof (status '
        + uninstall.status + ')');
      clean(fakeRun);
      clean(install);
    }

    // S2.5 — a destination symlink is never a profile. Marker-bearing targets make following the
    // link look owned to the retired marker-only implementation; install and uninstall must instead
    // fail closed while preserving link topology and target bytes.
    for (const [label, args] of [['S2.5-project', []], ['S2.5-global', ['--global']]]) {
      const home = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-home-'));
      const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-kh-'));
      const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-dest-'));
      const fakeRun = { home, kimiHome, dest, isGlobal: args.includes('--global') };
      const dir = agentsDir(fakeRun);
      const profile = path.join(dir, canonAgents[3] + '.md');
      const target = path.join(home, 'outside-user-profile.md');
      const targetBytes = Buffer.from('# ' + MANAGED_AGENT_MARKER + '\nOUTSIDE TARGET BYTES\n');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, targetBytes);
      fs.symlinkSync(target, profile);
      const install = runInstaller(args, { home, kimiHome, dest });
      assert(!install.ok,
        label + ': install fails closed on a same-name native-agent symlink');
      assert(sameSymlink(profile, target),
        label + ': failed install preserves the destination symlink itself');
      assert(sameBytes(target, targetBytes),
        label + ': failed install never follows or changes the symlink target');
      clean(fakeRun);
      clean(install);

      const uninstallHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-u-home-'));
      const uninstallKimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-u-kh-'));
      const uninstallDest = mkdtempSync(path.join(os.tmpdir(), 'kimi-link-u-dest-'));
      const uninstallRun = {
        home: uninstallHome, kimiHome: uninstallKimiHome, dest: uninstallDest,
        isGlobal: args.includes('--global'),
      };
      const uninstallDir = agentsDir(uninstallRun);
      const uninstallProfile = path.join(uninstallDir, canonAgents[3] + '.md');
      const uninstallTarget = path.join(uninstallHome, 'outside-user-profile.md');
      fs.mkdirSync(uninstallDir, { recursive: true });
      fs.writeFileSync(uninstallTarget, targetBytes);
      fs.symlinkSync(uninstallTarget, uninstallProfile);
      const uninstallArgs = args.includes('--global')
        ? ['--global', '--uninstall', '--yes']
        : ['--uninstall', '--target', uninstallDest, '--yes'];
      // spawn-class: environment
      const uninstall = spawnSync('bash', [INSTALLER].concat(uninstallArgs), {
        env: Object.assign({}, process.env, { HOME: uninstallHome, KIMI_CODE_HOME: uninstallKimiHome }),
        encoding: 'utf8',
      });
      assert(uninstall.status !== 0,
        label + ': uninstall fails closed on a same-name native-agent symlink');
      assert(sameSymlink(uninstallProfile, uninstallTarget),
        label + ': failed uninstall preserves the destination symlink itself');
      assert(sameBytes(uninstallTarget, targetBytes),
        label + ': failed uninstall never follows or changes the symlink target');
      clean(uninstallRun);
    }

    // S2.7 (security re-review carrier topology) — ownership metadata and the profile names it
    // protects must be regular files.  A directory or FIFO at the manifest path is not "no prior
    // manifest", and a directory at a same-name profile path is not an absent profile.  Refusal is
    // transactional: native agents are the admission wall, so no command Skill, support script,
    // hooks config, or other runtime surface may be written first.  The FIFO leg is safe because
    // the fingerprint above uses lstat only and each real installer process has a hard timeout.
    for (const [scopeLabel, args] of [['project', []], ['global', ['--global']]]) {
      for (const carrier of ['manifest-directory', 'manifest-fifo', 'profile-directory']) {
        const home = mkdtempSync(path.join(os.tmpdir(), 'kimi-carrier-home-'));
        const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-carrier-kh-'));
        const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-carrier-dest-'));
        const fakeRun = { home, kimiHome, dest, isGlobal: args.includes('--global') };
        const dir = agentsDir(fakeRun);
        const manifest = path.join(dir, AGENT_MANIFEST);
        const profile = path.join(dir, canonAgents[4] + '.md');
        fs.mkdirSync(dir, { recursive: true });
        if (carrier === 'manifest-directory') {
          fs.mkdirSync(manifest);
          fs.writeFileSync(path.join(manifest, 'OWNER_SENTINEL'), 'owner manifest directory\n');
          assert(fs.lstatSync(manifest).isDirectory(),
            'S2.7-' + scopeLabel + '-manifest-directory fixture: native manifest carrier is a directory');
        } else if (carrier === 'manifest-fifo') {
          // spawn-class: environment
          const fifo = spawnSync('mkfifo', [manifest], { encoding: 'utf8', timeout: 5000 });
          assert(fifo.status === 0 && fs.lstatSync(manifest).isFIFO(),
            'S2.7-' + scopeLabel + '-manifest-fifo fixture: native manifest carrier is a FIFO');
        } else {
          fs.mkdirSync(profile);
          fs.writeFileSync(path.join(profile, 'OWNER_SENTINEL'), 'owner profile directory\n');
          assert(fs.lstatSync(profile).isDirectory(),
            'S2.7-' + scopeLabel + '-profile-directory fixture: same-name native profile carrier is a directory');
        }
        const roots = [home, kimiHome, dest];
        const before = carrierWorldFingerprint(roots);
        const result = runInstaller(args, { home, kimiHome, dest, timeout: 10000 });
        const after = carrierWorldFingerprint(roots);
        const label = 'S2.7-' + scopeLabel + '-' + carrier;
        assert(!result.error && !result.ok,
          label + ': install refuses the non-regular native ownership carrier without blocking (status '
          + result.status + ', error ' + (result.error && result.error.code) + ')');
        assert(after === before,
          label + ': refusal happens before any agent, Skill, hook, support-script, config, or runtime mutation');
        clean(fakeRun);
        clean(result);
      }
    }

    // S2.6 — exact prior bytes, not a retired role name, decide legacy Skill ownership. Build the
    // previous carrier with the actual released generator so the installer cannot agree with a
    // fixture copied from its own current allowlist by construction.
    const oldRoot = mkdtempSync(path.join(os.tmpdir(), 'kimi-v9172-source-'));
    // spawn-class: environment
    const archive = spawnSync('git', ['archive', '--format=tar', 'kaola-workflow--v9.17.2'], {
      cwd: REPO, encoding: null, maxBuffer: 64 * 1024 * 1024,
    });
    assert(archive.status === 0 && archive.stdout.length > 0,
      'S2.6 fixture: tagged v9.17.2 source archive is available');
    let oldTreeReady = false;
    if (archive.status === 0 && archive.stdout.length > 0) {
      // spawn-class: environment
      const extract = spawnSync('tar', ['-x', '-C', oldRoot], {
        input: archive.stdout, encoding: null, maxBuffer: 64 * 1024 * 1024,
      });
      // spawn-class: environment
      const generate = spawnSync(process.execPath,
        [path.join(oldRoot, 'scripts', 'sync-kimi-edition.js'), '--forge=github', '--write'],
        { encoding: 'utf8' });
      oldTreeReady = extract.status === 0 && generate.status === 0;
      assert(oldTreeReady,
        'S2.6 fixture: released v9.17.2 generator materializes the retired role-Skill carrier');
    }
    if (oldTreeReady) {
      const oldSkills = path.join(oldRoot, '.kimi', 'skills');
      const exactRole = canonAgents[0];
      const editedRole = canonAgents[1];
      const exactName = 'kaola-role-' + exactRole;
      const editedName = 'kaola-role-' + editedRole;
      const oldExact = path.join(oldSkills, exactName);
      const oldEdited = path.join(oldSkills, editedName);
      assert(existsSync(path.join(oldExact, 'SKILL.md')) && existsSync(path.join(oldEdited, 'SKILL.md')),
        'S2.6 fixture: released tree contains both selected historical role Skills');

      for (const [label, args, operation] of [
        ['S2.6-project-reinstall', [], 'install'],
        ['S2.6-global-uninstall', ['--global'], 'uninstall'],
      ]) {
        const home = mkdtempSync(path.join(os.tmpdir(), 'kimi-oldskill-home-'));
        const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-oldskill-kh-'));
        const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-oldskill-dest-'));
        const fakeRun = { home, kimiHome, dest, isGlobal: args.includes('--global') };
        const liveSkills = scopedSkillsDir(fakeRun);
        const exactDest = path.join(liveSkills, exactName);
        const editedDest = path.join(liveSkills, editedName);
        fs.mkdirSync(liveSkills, { recursive: true });
        fs.cpSync(oldExact, exactDest, { recursive: true });
        fs.cpSync(oldEdited, editedDest, { recursive: true });
        fs.appendFileSync(path.join(editedDest, 'SKILL.md'), '\nOWNER_EDIT_SENTINEL\n');
        const editedBytes = readFileSync(path.join(editedDest, 'SKILL.md'));
        let result;
        if (operation === 'install') {
          result = runInstaller(args, { home, kimiHome, dest });
        } else {
          const uninstallArgs = ['--global', '--uninstall', '--yes'];
          // spawn-class: environment
          result = spawnSync('bash', [INSTALLER].concat(uninstallArgs), {
            env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }),
            encoding: 'utf8',
          });
        }
        assert(!existsSync(exactDest),
          label + ': exact byte-identical v9.17.2 role Skill is removed as proven Kaola output');
        assert(existsSync(path.join(editedDest, 'SKILL.md'))
          && readFileSync(path.join(editedDest, 'SKILL.md')).equals(editedBytes),
          label + ': same-name retired role Skill with owner-modified bytes remains byte-for-byte (status '
          + result.status + ')');
        clean(fakeRun);
        if (operation === 'install') clean(result);
      }
    }
    try { rmSync(oldRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }

  // P1b (#965) — INSTALLING PRUNES. P1 above asks only whether every manifest
  // script is PRESENT, which a pure copy-forward always satisfies; nothing asks
  // whether anything ELSE is there. FA9's exact-set assertion would see an
  // extra, but it installs into a home that was empty a moment earlier, so it
  // can only ever see what THIS install wrote. A kimi home carrying support
  // scripts from an older release therefore keeps them for good — measured on a
  // real machine after an all-PASS install-all: a 17-script manifest against 28
  // .js files on disk, the extras being scripts whose source is gone from the
  // tree (adaptive-node, autopilot, next-action, …). install.sh removes exactly
  // these ("Remove stale support scripts not present in source."); this edition
  // never learned to.
  //
  // The SCOPE of the sweep is pinned WITH it, because a prune that overreaches
  // is the worse defect and no assertion above would see it. The scope is
  // install.sh's, not one invented here: it enumerates `*.js` in the dir and
  // intersects each basename against the manifest, so a non-.js file survives
  // untouched — and a stray `.js` does not, in this directory the installer
  // owns and created.
  //
  // The manifest is read through the same CLI the installer reads it through,
  // so the expected set is the installed set's own source rather than a list
  // retyped here that would keep agreeing with itself after the manifest moved.
  {
    const kimiHome = mkdtempSync(path.join(os.tmpdir(), 'kimi-p1b-kh-'));
    const scriptsHome = path.join(kimiHome, 'kaola-workflow', 'scripts');
    fs.mkdirSync(scriptsHome, { recursive: true });
    // Planted BEFORE the installer runs — this is an upgrade over an older install,
    // which is the only way the stale set is ever reached. RETIRED is a real name
    // this workflow shipped and deleted; the other two are what a user might leave
    // in the same directory.
    const RETIRED = 'kaola-workflow-adaptive-node.js';
    const USER_JS = 'my-local-helper.js';
    const USER_KEPT = 'notes.md';
    const KEPT_BODY = 'notes the installer never wrote\n';
    fs.writeFileSync(path.join(scriptsHome, RETIRED), '// shipped by an older release\n');
    fs.writeFileSync(path.join(scriptsHome, USER_JS), '// user-authored\n');
    fs.writeFileSync(path.join(scriptsHome, USER_KEPT), KEPT_BODY);

    const r = runInstaller([], { kimiHome });
    assert(r.ok, 'P1b: install over an already-populated <kimi_home>/kaola-workflow/scripts exits 0 '
      + '(got status ' + r.status + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    // spawn-class: environment
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'P1b: install manifest lists at least one support script');
    assert(!names.includes(RETIRED) && !names.includes(USER_JS),
      'P1b: neither planted .js is a manifest name — if one ever returns to the manifest the fixture '
      + 'plants nothing stale and every pin below passes for the wrong reason (manifest holds '
      + names.length + ' names)');
    const deployedJs = readdirSync(scriptsHome).filter(f => f.endsWith('.js')).sort();
    assert(!deployedJs.includes(RETIRED),
      'P1b (#965): a support script the manifest no longer names is REMOVED by the install — '
      + RETIRED + ' is still on disk after it');
    assert(!deployedJs.includes(USER_JS),
      'P1b (#965): the sweep is the manifest ALLOWLIST, not a retired-name blocklist — an unlisted '
      + USER_JS + ' in the installer-owned scripts dir goes too, which is what install.sh does '
      + '(if the sweep should be narrower than install.sh\'s `*.js`, this is the assertion to change)');
    assert(JSON.stringify(deployedJs) === JSON.stringify([...names].sort()),
      'P1b (#965): after the install the scripts dir holds EXACTLY the manifest .js set — unexpected: '
      + (deployedJs.filter(n => !names.includes(n)).join(', ') || '(none)')
      + ' | missing: ' + (names.filter(n => !deployedJs.includes(n)).join(', ') || '(none)'));
    assert(existsSync(path.join(scriptsHome, USER_KEPT))
      && readFileSync(path.join(scriptsHome, USER_KEPT), 'utf8') === KEPT_BODY,
      'P1b (#965): the sweep is SCOPED — a non-.js file the installer neither wrote nor would write '
      + 'survives the install byte-intact (install.sh enumerates `*.js` only)');
    clean(r);
  }

  // -------------------------------------------------------------------------
  // P1c (#981) — UNINSTALLING MUST PRUNE THE SAME RESIDUE. P1b pins the INSTALL
  // path converging on the manifest, which is why a reinstall heals a stranded
  // script. The uninstall path removes strictly by the CURRENT manifest, so a
  // support script this edition retired is the one artifact that survives an
  // uninstall which removes every current artifact around it — including the
  // hooks directly beneath it in the same function, which #977 taught to remove
  // their retired names while the support scripts above them were left as they
  // were.
  //
  // The plant happens AFTER the seed install for U1's reason: the install path
  // sweeps stale scripts itself (P1b), so a plant the install could reach proves
  // nothing about the uninstall. Pins are disk outcomes only.
  //
  // The retired names are censused from the manifest's own SUPPORT_SCRIPTS
  // history, NOT read from the installer's array — a check that reads the list it
  // validates can never catch an omission in it. Both plants postdate this
  // edition's 2026-07-17 arrival, so both are names it really deployed.
  // -------------------------------------------------------------------------
  {
    const r = runInstaller([]);
    assert(r.ok, 'P1c: seed install exits 0 (got status ' + r.status
      + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
    const scriptsHome = path.join(r.kimiHome, 'kaola-workflow', 'scripts');
    assert(existsSync(scriptsHome), 'P1c: the seed install deployed the support scripts dir at ' + scriptsHome);
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    // spawn-class: environment
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'P1c: install manifest lists at least one support script');

    // Retired 2026-07-19 and 2026-07-31 — two retirement eras, both after this edition landed.
    const RETIRED = ['kaola-workflow-fast-advance.js', 'kaola-workflow-task-mirror.js'];
    const USER_KEPT = 'notes.md';
    const KEPT_BODY = 'notes the installer never wrote\n';
    // A user-authored .JS is the load-bearing half of the scope pin. A non-.js file survives even
    // install.sh's `*.js` sweep, so pinning only that would pass against a namespace prune of the
    // directory; an unlisted .js is exactly what such a prune takes and what the uninstall — which
    // removes by explicit name and nothing else — must leave alone.
    const USER_JS = 'my-local-helper.js';
    const USER_JS_BODY = '// user-authored\n';
    assert(RETIRED.every(n => !names.includes(n)) && !names.includes(USER_JS),
      'P1c: no planted name is in the manifest — a name the uninstall already removes by manifest is '
      + 'not evidence about retired-residue handling at all (manifest holds ' + names.length + ')');
    for (const n of RETIRED) fs.writeFileSync(path.join(scriptsHome, n), '// shipped by an older release\n');
    fs.writeFileSync(path.join(scriptsHome, USER_KEPT), KEPT_BODY);
    fs.writeFileSync(path.join(scriptsHome, USER_JS), USER_JS_BODY);

    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
      env: Object.assign({}, process.env, { HOME: r.home, KIMI_CODE_HOME: r.kimiHome }),
      encoding: 'utf8',
    });
    assert(ru.status === 0, 'P1c: --uninstall exits 0 (got ' + ru.status
      + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');

    // Positive control: THIS uninstall ran and removed the current support scripts.
    const currentLeft = names.filter(n => existsSync(path.join(scriptsHome, n)));
    assert(currentLeft.length === 0,
      'P1c: the uninstall removes the CURRENT manifest scripts — still on disk: '
      + currentLeft.slice(0, 5).join(', '));

    const leftRetired = RETIRED.filter(n => existsSync(path.join(scriptsHome, n)));
    assert(leftRetired.length === 0,
      'P1c (#981): a support script this edition RETIRED must be gone after an --uninstall that '
      + 'removes every current artifact around it. Still on disk: ' + leftRetired.join(', ')
      + '. A reinstall would heal these (P1b), so the exposure is the user who uninstalls and never '
      + 'reinstalls — inert residue, but residue the user asked to be rid of.');

    // SCOPE, pinned with the removal: this must stay a blocklist. A namespace sweep of the scripts
    // dir would take the user's own files with it and reintroduce exactly the defect #973 removed.
    assert(existsSync(path.join(scriptsHome, USER_JS))
      && readFileSync(path.join(scriptsHome, USER_JS), 'utf8') === USER_JS_BODY,
      'P1c (#981): the retired-name removal is a BLOCKLIST — an unlisted USER-AUTHORED .js in the '
      + 'scripts dir survives the uninstall byte-intact. A namespace sweep of the directory passes '
      + 'the clause above and fails this one, which is the point of testing both, and is exactly the '
      + 'defect #973 removed.');
    assert(existsSync(path.join(scriptsHome, USER_KEPT))
      && readFileSync(path.join(scriptsHome, USER_KEPT), 'utf8') === KEPT_BODY,
      'P1c (#981): a non-.js file the installer neither wrote nor would write survives too');
    clean(r);
  }

  // -------------------------------------------------------------------------
  // P5 (#973) — AN INSTALL DOES NOT REMOVE A DEPLOYED SKILL IT IS NOT GOING TO
  // REPLACE.
  //
  // The skill deploy is prune-then-recopy, and the two halves read DIFFERENT
  // sets. The prune is namespace-wide over the DESTINATION; the recopy is
  // whatever the generated tree renders AND the installer's own allowlist
  // accepts. Whenever the second set is smaller than the first, the difference
  // is destroyed — and destroyed quietly, because the only guard over the recopy
  // asks whether it deployed NOTHING, and a partial deploy is not nothing.
  //
  // P5a/P5b are the two reachable partial cases, both measured against a
  // destination holding the full deploy set:
  //   P5a — the old role-Skill carrier retired with native `.kimi/agents` profiles.
  //   P5b — the rendered command skills fall outside the deploy allowlist:
  //         17 → 14, exit 0, three `warning:` lines on stderr.
  // NEITHER asserts an exit code. An install that refuses BEFORE pruning removes
  // nothing either, and what is left on disk is the whole property; pinning a
  // status would pin one repair and reject the others.
  //
  // P5c/P5d pin what the prune is FOR, and are green here by construction —
  // they are the two ways a narrowing repair breaks something that works today:
  //   P5c — the namespace prune is the ONLY thing on the install path that
  //         clears a skill dir retired in an earlier release. Narrow it to the
  //         deploy set and those names become immortal on every live install.
  //   P5d — `cp -R src dest` onto an EXISTING dest copies INTO it. Defer a
  //         name's removal past its own copy and reinstalls stop updating:
  //         dest/X/SKILL.md stays stale while the new bytes land at
  //         dest/X/X/SKILL.md.
  //
  // Each mutated case installs from its OWN throwaway copy of this checkout,
  // because the state under test is a state of the SOURCE tree.
  // -------------------------------------------------------------------------
  {
    const routing = require('./generate-routing-surfaces.js');
    // `.git` is deliberately absent from the copy and that is load-bearing, not tidiness: the
    // installer regenerates the tree it deploys from, the generator writes that tree at the MAIN
    // checkout when one resolves, and a copied gitdir pointer resolves to this repository — so a
    // copy carrying `.git` would rewrite the real tree from mutated canonical sources.
    // `kaola-workflow/` is run state rather than installer input, and is skipped for its size.
    const COPY_SKIP = new Set(['.git', 'kaola-workflow', 'node_modules']);
    function sourceCopy(tag) {
      const dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'kimi-p5-src-' + tag + '-')));
      for (const entry of readdirSync(REPO)) {
        if (COPY_SKIP.has(entry)) continue;
        // spawn-class: environment
        const r = spawnSync('cp', ['-R', path.join(REPO, entry), path.join(dir, entry)], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('P5 fixture: cp -R ' + entry + ' failed — ' + r.stderr);
      }
      // A THROW, not an assert: a copy whose generated tree resolves anywhere but itself must never
      // reach the installer, because the install refreshes that tree first. Failing the run is the
      // point — a recorded assertion would let the destructive install happen anyway.
      // spawn-class: environment
      const probe = spawnSync('node', [path.join(dir, 'scripts', 'sync-kimi-edition.js'), '--print-tree-root'],
        { encoding: 'utf8' });
      let treeRoot = String(probe.stdout || '').trim();
      try { treeRoot = fs.realpathSync(treeRoot); } catch (_) { /* report it raw */ }
      if (probe.status !== 0 || treeRoot !== dir) {
        try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
        throw new Error('P5 fixture: refusing to install from a copy whose generated tree lands outside it'
          + ' (status ' + probe.status + ', tree root ' + JSON.stringify(treeRoot) + ')');
      }
      return dir;
    }
    const dropSrc = dir => { try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ } };

    const DEPLOY_SET = [...ADAPTIVE_CORE];
    const plantedBody = name => 'PLANTED ' + name + ' — on disk BEFORE the install\n';
    // A destination in the state a working install leaves behind: one dir per deployed skill,
    // each holding a SKILL.md whose bytes say where it came from.
    function plantSkillDirs(names, extraFiles) {
      const dest = mkdtempSync(path.join(os.tmpdir(), 'kimi-p5-dest-'));
      const skills = path.join(dest, '.kimi-code', 'skills');
      fs.mkdirSync(skills, { recursive: true });
      for (const name of names) {
        fs.mkdirSync(path.join(skills, name), { recursive: true });
        fs.writeFileSync(path.join(skills, name, 'SKILL.md'), plantedBody(name));
      }
      for (const name of extraFiles || []) fs.writeFileSync(path.join(skills, name), plantedBody(name));
      return { dest, skills };
    }
    const treeSkillDirs = src => readdirSync(path.join(src, '.kimi', 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();

    // The pre-10.0.0 "zero role source files" leg retired with the generated agents/ authority.
    // The v10 behavior source has a closed 14-role schema and generation fails before installation
    // when a role is missing, so a successful partial role deploy is no longer a reachable state.

    // P5b — the rendered command skills fall OUTSIDE the installer's deploy allowlist. The
    // allowlist is hand-maintained and no generator feeds it, so a command basename that moves in
    // the routing registry renders a valid skill the install then skips — after pruning the
    // deployed one. Here the registry row and the file it names move together, which is what a
    // rename in the registry does.
    {
      const src = sourceCopy('b');
      const { dest, skills } = plantSkillDirs(DEPLOY_SET);
      try {
        const registry = path.join(src, 'scripts', 'generate-routing-surfaces.js');
        const before = readFileSync(registry, 'utf8');
        const after = before.replace(/command_basename: '([a-z0-9-]+)'/g, "command_basename: 'zz-$1'");
        if (after === before) throw new Error('P5b fixture: no command_basename row to move in the routing registry');
        fs.writeFileSync(registry, after);
        for (const row of routing.GENERATED_SURFACES.filter(s => s.surface_type === 'command')) {
          const from = path.join(src, row.path);
          fs.renameSync(from, path.join(path.dirname(from), 'zz-' + path.basename(from)));
        }
        const r = runInstaller([], { dest, installer: path.join(src, 'install-kimi.sh') });
        const rendered = treeSkillDirs(src);
        assert(ADAPTIVE_CORE.every(n => !rendered.includes(n)) && rendered.some(n => n.startsWith('zz-')),
          'P5b (fixture): the mutated source renders the command skills under names the deploy '
          + 'allowlist does not hold — got ' + JSON.stringify(rendered.filter(n => !n.startsWith('kaola-role-'))));
        assert(canonAgents.every(role => existsSync(path.join(src, '.kimi', 'agents', role + '.md'))),
          'P5b (fixture): the mutated source still renders every native role profile, so the source '
          + 'is not empty while command Skill names fall outside their allowlist');
        const lost = ADAPTIVE_CORE.filter(n => !existsSync(path.join(skills, n, 'SKILL.md')));
        assert(lost.length === 0,
          'P5b (#973): a deployed command skill the install is NOT going to replace is still on disk '
          + 'afterwards — destroyed: ' + (lost.join(', ') || '(none)') + ', install exited ' + r.status
          + ' (' + (String(r.stderr).split('\n').filter(Boolean).length) + ' warning line(s) on stderr)');
        clean(r);
      } finally {
        dropSrc(src);
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // P5c — WHAT THE RETIRED COMMAND-SKILL PRUNE IS FOR, and the half a narrowing repair loses.
    // Command Skills occupy Kaola's reserved workflow command namespace. Retired role Skills do
    // not: their bare role identity shares the directory with owner-authored Skills, so S2.6 pins
    // their stricter exact-byte ownership rule separately. The scope is pinned WITH the sweep,
    // because a prune that reaches further is the worse defect: the skills dir is shared with
    // whatever the user put there.
    //
    // RETIRED below is the complete retired COMMAND set censused from the edition's history and
    // not from the installer's list — a probe that reads the list under test agrees with it by
    // construction. UNKNOWN_ROLE_DIRS are the negative control: names that Kaola used for the old
    // role carrier but whose planted bytes do not match a known release must remain owner data.
    {
      const RETIRED = [
        // commands/ — the two node-executor surfaces and the six fast/full opt-in surfaces
        'kaola-workflow-adapt', 'kaola-workflow-plan-run',
        'kaola-workflow-fast', 'kaola-workflow-phase1', 'kaola-workflow-phase2',
        'kaola-workflow-phase3', 'kaola-workflow-phase4', 'kaola-workflow-phase5',
      ];
      const UNKNOWN_ROLE_DIRS = [
        'kaola-role-' + canonAgents[0], 'kaola-role-issue-scout',
      ];
      const KEPT_DIRS = [...UNKNOWN_ROLE_DIRS, 'workflow-goal', 'kaola-something-else', 'my-own-skill'];
      const KEPT_FILE = 'kaola-role-notadir.md';
      const { dest, skills } = plantSkillDirs([...DEPLOY_SET, ...RETIRED, ...KEPT_DIRS], [KEPT_FILE]);
      try {
        // Anti-vacuity, both directions. A retired name that returned to the deploy set would be
        // REPLACED rather than swept, and a kept name that joined it would survive because it was
        // deployed — either way the pin below would stop measuring what it says it measures.
        assert(RETIRED.every(n => !DEPLOY_SET.includes(n)) && KEPT_DIRS.every(n => !DEPLOY_SET.includes(n)),
          'P5c: no planted name is in the deploy set — a name that is deployed is not evidence about '
          + 'the prune at all (deploy set holds ' + DEPLOY_SET.length + ' names)');
        const r = runInstaller([], { dest });
        assert(r.ok, 'P5c: install over a populated skills dir exits 0 (got status ' + r.status
          + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
        const left = RETIRED.filter(n => existsSync(path.join(skills, n)));
        assert(left.length === 0,
          'P5c: a skill dir retired in an earlier release is SWEPT from a live install — still on '
          + 'disk: ' + left.join(', '));
        for (const n of KEPT_DIRS) {
          assert(existsSync(path.join(skills, n, 'SKILL.md'))
            && readFileSync(path.join(skills, n, 'SKILL.md'), 'utf8') === plantedBody(n),
            'P5c: the sweep is SCOPED — ' + n + ', whose planted bytes have no Kaola ownership proof, '
            + 'survives byte-intact in the shared skills dir');
        }
        assert(existsSync(path.join(skills, KEPT_FILE))
          && readFileSync(path.join(skills, KEPT_FILE), 'utf8') === plantedBody(KEPT_FILE),
          'P5c: a non-directory entry survives — the sweep removes skill DIRS, and ' + KEPT_FILE
          + ' matches the namespace by name only');
        // The sweep half is only evidence alongside a real deploy: a run that swept everything and
        // deployed nothing would satisfy the four assertions above.
        const missing = DEPLOY_SET.filter(n => !existsSync(path.join(skills, n, 'SKILL.md')));
        assert(missing.length === 0,
          'P5c: the same install still deploys the whole skill set — missing: ' + missing.join(', '));
        clean(r);
      } finally {
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // P5d — A REINSTALL STILL UPDATES. The copy is `cp -R <src> <dest>/<name>`, and onto an
    // existing directory that copies INTO it: dest/X/SKILL.md keeps the old bytes while the new
    // ones land at dest/X/X/SKILL.md, which no runtime reads. So a repair that defers a name's
    // removal past that name's own copy makes every skill on every install immortal — with the
    // deploy set, the exit code and the success message all unchanged.
    {
      const { dest, skills } = plantSkillDirs(DEPLOY_SET);
      try {
        // An orphan inside a replaced skill dir: it is how a replacement is told from a merge.
        fs.writeFileSync(path.join(skills, DEPLOY_SET[0], 'left-behind.txt'), 'from an older release\n');
        const r = runInstaller([], { dest });
        assert(r.ok, 'P5d: reinstall over a populated skills dir exits 0 (got status ' + r.status
          + (r.stderr ? ' — ' + firstStderrLine(r) : '') + ')');
        const stale = [], nested = [];
        for (const name of DEPLOY_SET) {
          const live = path.join(skills, name, 'SKILL.md');
          const source = path.join(TREE_ROOT, '.kimi', 'skills', name, 'SKILL.md');
          if (!existsSync(live) || !fs.readFileSync(live).equals(fs.readFileSync(source))) stale.push(name);
          if (existsSync(path.join(skills, name, name))) nested.push(name);
        }
        assert(stale.length === 0,
          'P5d: after the install every deployed SKILL.md carries the SOURCE bytes, not the ones that '
          + 'were there before — stale: ' + stale.slice(0, 3).join(', ') + (stale.length > 3 ? ', …' : ''));
        assert(nested.length === 0,
          'P5d: no deployed skill dir holds a directory of its own name — that shape is `cp -R` onto '
          + 'an existing dir, i.e. the install stopped updating: ' + nested.slice(0, 3).join(', '));
        assert(!existsSync(path.join(skills, DEPLOY_SET[0], 'left-behind.txt')),
          'P5d: a file left inside a skill dir by an older release is gone — the copy REPLACES the '
          + 'dir rather than merging into it');
        clean(r);
      } finally {
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }
  }

  // P2/P3 (former --with-fast / --with-full opt-in-partition probes) — DELETED
  // IN FULL. #725 Phase A retires the fast/full opt-in partition itself; every
  // surface these probed (kaola-workflow-fast, kaola-workflow-phase[1-5]) is
  // n2-deleted from canonical, so there is nothing left to opt into or lock in.

  // P4 — idempotency and migration: a reinstall strips the exact retired managed
  // hooks block, preserves unrelated config, and adds no replacement hook.
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'P4: first default install exits 0');
    fs.mkdirSync(path.dirname(r1.kimiConfig), { recursive: true });
    fs.writeFileSync(r1.kimiConfig, [
      'owner_setting = true',
      '',
      '# >>> kaola-workflow kimi hooks',
      '[[hooks]]',
      'event = "PostCompact"',
      'command = "node retired-compact-context.js --state-hint"',
      '# <<< kaola-workflow kimi hooks',
      '',
    ].join('\n'));
    const r2 = runInstaller([], { home: r1.home, kimiHome: r1.kimiHome, dest: r1.dest });
    assert(r2.ok,
      'P4: second (idempotent) install exits 0 (got status ' + r2.status + (r2.stderr ? ' — ' + firstStderrLine(r2) : '') + ')');
    assert(managedBlockCount(r1.kimiConfig) === 0
      && readFileSync(r1.kimiConfig, 'utf8') === 'owner_setting = true\n',
      'P4: reinstall removes the retired block and preserves unrelated config bytes');
    assert(JSON.stringify(deployedSkills(r1)) === JSON.stringify(deployedSkills(r2)),
      'P4: re-install leaves the deployed skill set unchanged');
    assert(JSON.stringify(deployedAgents(r1)) === JSON.stringify(deployedAgents(r2)),
      'P4: re-install leaves the deployed native agent set unchanged');
    for (const role of canonAgents) {
      const installed = path.join(agentsDir(r1), role + '.md');
      const generated = path.join(TREE_ROOT, '.kimi', 'agents', role + '.md');
      assert(existsSync(installed) && existsSync(generated)
        && fs.readFileSync(installed).equals(fs.readFileSync(generated)),
      'P4[' + role + ']: managed native profile converges byte-for-byte on reinstall');
    }
    assert(!/\[\[hooks\]\]|PostCompact|compact-context/.test(readFileSync(r1.kimiConfig, 'utf8')),
      'P4: reinstall leaves no compact hook residue');
    clean(r1);
    clean(r2);
  }

  // -------------------------------------------------------------------------
  // P8 (#977) — A REINSTALL CLEARS A RETIRED HOOK, AND ONLY A RETIRED ONE.
  // The edition's first release shipped hook scripts the tree has since
  // retired, so a real kimi home can carry one; the hook deploy only writes
  // forward, so without an install-path sweep the residue survives EVERY
  // future install. Twin of the opencode P8 pin. Disk outcomes only: the
  // retired name is censused from the hook set's history, never read from the
  // installer's own list — a probe that reads the list under test agrees with
  // it by construction and can never see a name missing from it. The
  // user-authored control is the pin that matters most: the hooks dir is
  // swept by NAME, never wholesale.
  // -------------------------------------------------------------------------
  {
    const RETIRED_HOOK = 'kaola-workflow-pre-commit.sh';
    const USER_HOOK = 'my-own-hook.sh';
    const USER_BODY = '#!/usr/bin/env bash\n# user-authored, never shipped\n';
    const r1 = runInstaller([]);
    assert(r1.ok, 'P8: seed install exits 0 (got status ' + r1.status
      + (r1.stderr ? ' — ' + firstStderrLine(r1) : '') + ')');
    const hooksDir = path.join(r1.kimiHome, 'kaola-workflow', 'hooks');
    // Anti-vacuity: a hook back in the deploy set would be REPLACED rather than swept.
    assert(!sync.HOOK_SCRIPTS.includes(RETIRED_HOOK) && !sync.HOOK_SCRIPTS.includes(USER_HOOK),
      'P8: neither planted name is in the deploy set — a name that is deployed is not evidence '
      + 'about any sweep (deploy set: ' + JSON.stringify(sync.HOOK_SCRIPTS) + ')');
    // Planted AFTER the seed install: the install path sweeps retired names before it deploys,
    // so a plant the seed install could reach proves nothing about the REINSTALL's half.
    fs.writeFileSync(path.join(hooksDir, RETIRED_HOOK),
      '#!/usr/bin/env bash\n# shipped by an older release\n');
    fs.writeFileSync(path.join(hooksDir, USER_HOOK), USER_BODY);
    const r2 = runInstaller([], { home: r1.home, kimiHome: r1.kimiHome, dest: r1.dest });
    assert(r2.ok, 'P8: reinstall over a live kimi home exits 0 (got status ' + r2.status
      + (r2.stderr ? ' — ' + firstStderrLine(r2) : '') + ')');
    // The sweep is only evidence alongside a real deploy.
    const missingHooks = sync.HOOK_SCRIPTS.filter(h => !existsSync(path.join(hooksDir, h)));
    assert(missingHooks.length === 0,
      'P8: the same install still deploys every current hook — missing: ' + missingHooks.join(', '));
    assert(!existsSync(path.join(hooksDir, RETIRED_HOOK)),
      'P8 (#977): a hook retired in an earlier release is removed on reinstall — '
      + RETIRED_HOOK + ' is still on disk after it');
    assert(existsSync(path.join(hooksDir, USER_HOOK))
      && readFileSync(path.join(hooksDir, USER_HOOK), 'utf8') === USER_BODY,
      'P8 (#977): the sweep is by NAME — a user-authored hook in the same dir survives byte-intact');
    clean(r1);
  }

  // U1 — --uninstall removes the ENTIRE kaola-deployed surface: the deployed
  // command Skills + native agents, the support scripts + hook scripts under the
  // kimi home, and the managed hooks block in config.toml (the file itself is
  // preserved when it holds user content; here it held only the block so it is
  // removed). The shared kaola config is user-owned: neither install nor uninstall
  // creates or edits it.
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'U1: seed install exits 0');
    assert(existsSync(skillsDir(r1)), 'U1: skills present before uninstall');
    // #977 plants — a box that installed OLDER releases holds names today's source tree no
    // longer renders, and an uninstall over a fresh install alone can never observe what
    // happens to them. Planted AFTER the seed install and never before it: the INSTALL path
    // sweeps retired names itself (P5c), so a plant the install could reach proves nothing
    // about the uninstall. Names are censused from the edition's history, not read from the
    // installer's own retired list. The hook plant also reds the no-residue pins below when
    // it is missed — same defect, one cause.
    // Command Skills use the reserved workflow command namespace. Retired role-Skill cleanup is
    // exercised separately in S2.6 with real historical bytes; planting arbitrary same-name role
    // bytes here and expecting deletion would reintroduce the security R2 defect.
    const RETIRED_SKILLS = ['kaola-workflow-fast'];
    const RETIRED_HOOK = 'kaola-workflow-pre-commit.sh';
    assert(RETIRED_SKILLS.every(n => !ADAPTIVE_CORE.includes(n))
      && !sync.HOOK_SCRIPTS.includes(RETIRED_HOOK),
      'U1 (#977): no planted name is in the deploy set — a name that is deployed is not '
      + 'evidence about retired-residue handling at all');
    for (const n of RETIRED_SKILLS) {
      fs.mkdirSync(path.join(skillsDir(r1), n), { recursive: true });
      fs.writeFileSync(path.join(skillsDir(r1), n, 'SKILL.md'), 'shipped by an older release\n');
    }
    const kimiHooksDir = path.join(r1.kimiHome, 'kaola-workflow', 'hooks');
    fs.writeFileSync(path.join(kimiHooksDir, RETIRED_HOOK),
      '#!/usr/bin/env bash\n# shipped by an older release\n');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home, KIMI_CODE_HOME: r1.kimiHome }), encoding: 'utf8' });
    assert(ru.status === 0,
      'U1: --uninstall exits 0 (got ' + ru.status + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(!existsSync(path.join(skillsDir(r1), name)),
        'U1[' + name + ']: skill removed by --uninstall');
    }
    for (const role of canonAgents) {
      assert(!existsSync(path.join(agentsDir(r1), role + '.md')),
        'U1[' + role + ']: managed native agent removed by --uninstall');
    }
    const leftSkills = RETIRED_SKILLS.filter(n => existsSync(path.join(skillsDir(r1), n)));
    assert(leftSkills.length === 0,
      'U1 (#977): a skill retired in an earlier release is removed by --uninstall — still on '
      + 'disk after it: ' + leftSkills.join(', '));
    assert(!existsSync(path.join(kimiHooksDir, RETIRED_HOOK)),
      'U1 (#977): a hook retired in an earlier release is removed by --uninstall — '
      + RETIRED_HOOK + ' is still on disk after it');
    assert(!existsSync(skillsDir(r1)),
      'U1: the skills dir itself is gone after --uninstall (no empty-shell residue)');
    assert(!existsSync(path.join(r1.dest, '.kimi-code')),
      'U1: the project .kimi-code dir is gone after --uninstall');
    assert(!existsSync(path.join(r1.kimiHome, 'kaola-workflow')),
      'U1: support scripts + hook scripts under the kimi home are fully removed (no residue)');
    assert(managedBlockCount(r1.kimiConfig) === 0,
      'U1: ZERO kaola managed hooks blocks remain in config.toml after --uninstall');
    assert(!existsSync(r1.configPath),
      'U1: install + --uninstall must leave the user-owned shared config uncreated');
    clean(r1);
  }

  // A1 — ZERO Claude path leaks across the DEPLOYED kimi tree (the same surface
  // install-kimi.sh ships to every consumer): skills + deployed hook scripts +
  // the merged config.toml. Tokens mirror the opencode #544 scan
  // (CLAUDE_PLUGIN_ROOT / .claude/kaola-workflow); workflow-init's exempt
  // canonical `.claude/rules/` scaffold references do not match either token.
  {
    const r = runInstaller([]);
    assert(r.ok, 'A1: seed install exits 0');
    let leaks = 0;
    const leakFiles = [];
    const scanFile = (label, p) => {
      let txt;
      try { txt = readFileSync(p, 'utf8'); } catch (_) { return; }
      const m = (txt.match(/CLAUDE_PLUGIN_ROOT/g) || []).length
              + (txt.match(/\.claude\/kaola-workflow/g) || []).length;
      if (m > 0) { leaks += m; leakFiles.push(label + ' (' + m + ')'); }
    };
    const walkDeploy = (label, dir) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkDeploy(label + '/' + e.name, p);
        else scanFile(label + '/' + e.name, p);
      }
    };
    walkDeploy('skills', skillsDir(r));
    walkDeploy('agents', agentsDir(r));
    walkDeploy('hooks', path.join(r.kimiHome, 'kaola-workflow', 'hooks'));
    scanFile('config.toml', r.kimiConfig);
    assert(leaks === 0,
      'A1: ZERO Claude path leaks (CLAUDE_PLUGIN_ROOT / .claude/kaola-workflow) across the deployed kimi tree — found ' +
      leaks + ' match(es) in: ' + leakFiles.slice(0, 6).join(', ') + (leakFiles.length > 6 ? ', …' : ''));
    clean(r);
  }

  // K9 — RETIRED WITH ITS RESOLVER. This drove `resolveReviewerProfileIdentity` against a real
  // kimi install through five cases: the project-scope SKILL.md wins, a global install does not
  // override it, an empty cwd falls back to the global candidate, a stray `.opencode/agent/`
  // profile does not hijack the kimi identity, and a missing profile refuses
  // `review_profile_unavailable` rather than falling through silently. The resolver lived in the
  // node executor and went with it, along with the review receipts whose identity it bound.
  //
  // WHAT IS NOW COVERED EARLIER: every native agent profile is generated and its re-stamped
  // `resolved_profile_hash` is verified against the bytes, but the
  // runtime-DETECTION half — that a kimi install reads as kimi and not as opencode — has no
  // consumer left and therefore no test. If a reviewer-identity resolver returns, that
  // no-swallow case is the one worth restoring first: it was a real defect, not a hypothetical.
}

// ---------------------------------------------------------------------------
// K10-prune: --write is an idempotent MIRROR, not an append-only writer. A retired
// command-Skill dir and retired native agent profile must be REMOVED, and --check must flag both.
// Crash-safe: the transient probe dir is removed in a finally block.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const probeDir = path.join(TREE_ROOT, '.kimi', 'skills', 'kaola-workflow-__kw_retired_probe');
  const probeAgentDir = path.join(TREE_ROOT, '.kimi', 'agents');
  const probeAgent = path.join(probeAgentDir, '__kw_retired_probe.md');
  // spawn-class: environment
  const runSync = (flag) => spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), flag], { encoding: 'utf8' });
  try {
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, 'SKILL.md'), '# transient retired-surface probe — must not persist\n');
    fs.mkdirSync(probeAgentDir, { recursive: true });
    fs.writeFileSync(probeAgent, '---\nname: kw-retired-probe\ndescription: retired\n---\n');
    const chk = runSync('--check');
    assert(chk.status !== 0,
      'K10-prune(a): --check must exit NON-ZERO when a retired skill dir is present in .kimi/skills/');
    assert(((chk.stdout || '') + (chk.stderr || '')).includes('__kw_retired_probe'),
      'K10-prune(a): --check output must name the retired command Skill');
    assert(((chk.stdout || '') + (chk.stderr || '')).includes('.kimi/agents/__kw_retired_probe.md'),
      'K10-prune(a): --check output must name the retired native agent profile');
    runSync('--write');
    assert(!fs.existsSync(probeDir),
      'K10-prune(b): --write must REMOVE the retired skill dir (idempotent mirror)');
    assert(!fs.existsSync(probeAgent),
      'K10-prune(b): --write must REMOVE the retired native agent profile (idempotent mirror)');
    assert(runSync('--check').status === 0,
      'K10-prune(b): --check exits 0 after the retired skill dir is pruned');
  } finally {
    try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch (_) { /* best-effort cleanup */ }
    try { fs.rmSync(probeAgent, { force: true }); } catch (_) { /* best-effort cleanup */ }
    try { fs.rmdirSync(probeAgentDir); } catch (_) { /* generated profiles keep the dir non-empty */ }
  }
}

// ---------------------------------------------------------------------------
// K11 (#812/#1033, the Kimi twin of A24): workflow-init carries no second
// universal template. Both runtime surfaces name the one distribution module and
// writer, while the module's actual bytes retain the phase and vendor bans.
// ---------------------------------------------------------------------------
{
  for (const [label, body] of [
    ['kimi', read(skillDir('workflow-init'))],
    ['canonical-github', read('commands/workflow-init.md')],
  ]) {
    assert(!/KW-AGENTS-TEMPLATE-(?:START|END)/.test(body)
      && /kaola-workflow-project-instruction-templates\.js/.test(body)
      && /kaola-workflow-project-instructions\.js/.test(body),
    'K11[' + label + ']: workflow-init names the sole consumer template module and writer without embedding it');
  }
  const consumerTpl = require('./kaola-workflow-project-instruction-templates.js').AGENTS_TEMPLATE;
  assert(!/Phase\s+\d/.test(consumerTpl),
    'K11: kimi workflow-init template must not teach a numbered Phase <n> model (adaptive is the unconditional default)');
  assert(!/phase file|phase artifact/i.test(consumerTpl),
    'K11: kimi workflow-init template must not use "phase file/artifact" durable-state framing');
  assert(!/\bClaude\b|\bOpus\b|\bSonnet\b|\/workflow-next|\/goal|Stop-hook/.test(consumerTpl),
    'K11 (#812): the injected consumer template must name no vendor, model, or runtime-specific command');
}

// ---------------------------------------------------------------------------
// FA — FORGE AXIS (the kimi twin of the opencode suite's F block). The runtime is
// not a forge, but the workflow PROSE is forge-shaped, so this block proves each
// forge renders its OWN surface and nothing of any other. Three properties make
// it a guard rather than a smoke test:
//   (1) the forge set is DERIVED from the routing registry, so a new forge is
//       covered the moment it exists — there is no opt-in list to forget;
//   (2) the identity check is BIDIRECTIONAL (own marker present AND every other
//       forge's marker absent);
//   (3) the markers are DERIVED from the install manifest, so they cannot drift
//       from the basenames the installer actually deploys.
// ---------------------------------------------------------------------------
{
  const forgeLayout = require('./runtime-edition-forge.js');
  const routing = require('./generate-routing-surfaces.js');
  const manifest = require('./kaola-workflow-install-manifest.js');
  const { spawnSync } = require('child_process');
  const SYNC = path.join(REPO, 'scripts', 'sync-kimi-edition.js');

  // F1: ONE forge axis.
  assert(Array.isArray(routing.FORGES) && routing.FORGES.length >= 3,
    'FA1: the routing registry exposes a forge axis of at least 3 forges');
  assert(JSON.stringify(forgeLayout.FORGES) === JSON.stringify(routing.FORGES),
    'FA1: runtime-edition-forge FORGES is the routing registry axis, not a copy '
    + '(got ' + JSON.stringify(forgeLayout.FORGES) + ' vs ' + JSON.stringify(routing.FORGES) + ')');
  assert(JSON.stringify(sync.FORGES) === JSON.stringify(routing.FORGES),
    'FA1: sync-kimi-edition re-exports the same forge axis');

  const marker = f => forgeLayout.scriptName('kaola-workflow-claim.js', f);
  const markers = forgeLayout.FORGES.map(marker);
  assert(new Set(markers).size === markers.length,
    'FA2: the per-forge markers are distinct (' + markers.join(', ') + ') — a shared marker '
    + 'would make the bidirectional check below vacuous');

  const walk = dir => {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  };

  for (const forge of forgeLayout.FORGES) {
    const tree = sync.treeLabel(forge);

    // F3: every forge renders, and re-renders to byte-parity.
    // spawn-class: environment
    const w = spawnSync(process.execPath, [SYNC, '--forge=' + forge, '--write'], { encoding: 'utf8' });
    assert(w.status === 0, 'FA3[' + forge + ']: sync --write exits 0 (got ' + w.status + ': '
      + String(w.stderr || '').slice(0, 200) + ')');
    // spawn-class: environment
    const c = spawnSync(process.execPath, [SYNC, '--forge=' + forge, '--check'], { encoding: 'utf8' });
    assert(c.status === 0, 'FA3[' + forge + ']: sync --check is green after --write (got ' + c.status + ': '
      + String(c.stderr || '').slice(0, 300) + ')');

    const files = walk(path.join(TREE_ROOT, tree));
    assert(files.length > 0, 'FA3[' + forge + ']: ' + tree + ' is non-empty after --write');
    const bodies = files.map(f => fs.readFileSync(f, 'utf8'));

    // F4: the ZERO-Claude-path-leak invariant holds on EVERY forge tree.
    let leaks = 0;
    const leakFiles = [];
    for (let i = 0; i < files.length; i++) {
      const n = (bodies[i].match(/CLAUDE_PLUGIN_ROOT/g) || []).length
        + (bodies[i].match(/\.claude\/kaola-workflow/g) || []).length;
      if (n > 0) { leaks += n; leakFiles.push(path.relative(REPO, files[i]) + ' (' + n + ')'); }
    }
    assert(leaks === 0, 'FA4[' + forge + ']: ZERO Claude path leaks across ' + tree
      + ' — found ' + leaks + ' in: ' + leakFiles.slice(0, 6).join(', '));

    // F5: forge identity, BIDIRECTIONAL.
    const joined = bodies.join('\n');
    assert(joined.includes(marker(forge)),
      'FA5[' + forge + ']: ' + tree + ' carries its OWN forge marker ' + marker(forge));
    for (const other of forgeLayout.FORGES) {
      if (other === forge) continue;
      assert(!joined.includes(marker(other)),
        'FA5[' + forge + ']: ' + tree + ' must NOT carry the ' + other + ' marker '
        + marker(other) + ' — cross-forge prose leaked into this tree');
    }

    // F6: the rendered command-skill set IS the routing registry's command set for
    // this forge (generated, not a hand-maintained list).
    const expected = routing.commandSurfacesForForge(forge)
      .map(r => path.basename(r.path).slice(0, -3)).sort();
    const actual = fs.readdirSync(path.join(TREE_ROOT, tree, 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name).sort();
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      'FA6[' + forge + ']: ' + tree + '/skills exact set is the routing registry command set (no role Skills) for '
      + forge + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
    const forgeAgentsDir = path.join(TREE_ROOT, tree, 'agents');
    const actualAgents = fs.existsSync(forgeAgentsDir)
      ? fs.readdirSync(forgeAgentsDir, { withFileTypes: true })
        .filter(e => e.isFile()).map(e => e.name).sort() : [];
    const expectedAgents = canonAgents.map(role => role + '.md').sort();
    assert(JSON.stringify(actualAgents) === JSON.stringify(expectedAgents),
      'FA6[' + forge + ']: ' + tree + '/agents exact set is the canonical 14 native profiles '
      + '(expected ' + JSON.stringify(expectedAgents) + ', got ' + JSON.stringify(actualAgents) + ')');

    assert(!fs.existsSync(path.join(TREE_ROOT, tree, 'hooks', 'kimi-hooks.toml')),
      'FA7[' + forge + ']: generated forge tree carries no Kimi compact hook fragment');
  }

  // F8: an unknown forge is REFUSED, not silently defaulted to github.
  // spawn-class: environment
  const bad = spawnSync(process.execPath, [SYNC, '--forge=svn', '--check'], { encoding: 'utf8' });
  assert(bad.status === 2,
    'FA8: sync --forge=svn refuses with exit 2 rather than defaulting to github (got ' + bad.status + ')');
}

// ---------------------------------------------------------------------------
// FA9 — the forge axis reaches the INSTALLED tree, not just the generated one
// (the kimi twin). For every forge, a REAL hermetic install (own temp HOME +
// KIMI_CODE_HOME + --target) must deploy exactly the support-script basenames
// that forge's install manifest names, no other forge's, and a config.toml
// hooks block whose commands point at files the same install actually wrote.
// ---------------------------------------------------------------------------
{
  const forgeLayout = require('./runtime-edition-forge.js');
  const manifest = require('./kaola-workflow-install-manifest.js');
  const { spawnSync } = require('child_process');
  const { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } = require('fs');
  const os = require('os');
  const INSTALLER = path.join(REPO, 'install-kimi.sh');

  for (const forge of forgeLayout.FORGES) {
    const home = mkdtempSync(path.join(os.tmpdir(), 'km-forge-home-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'km-forge-dest-'));
    const kimiHome = path.join(home, '.kimi-code');
    try {
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER, '--forge=' + forge, '--target', dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }),
        encoding: 'utf8',
      });
      assert(r.status === 0, 'FA9[' + forge + ']: install-kimi.sh --forge=' + forge
        + ' exits 0 (got ' + r.status + ': ' + String(r.stderr || '').split('\n')[0] + ')');

      const scriptsDir = path.join(kimiHome, 'kaola-workflow', 'scripts');
      assert(existsSync(scriptsDir), 'FA9[' + forge + ']: support scripts land under the kimi home');
      const deployed = readdirSync(scriptsDir).sort();
      const expected = manifest.supportScripts(forge).slice().sort();
      assert(JSON.stringify(deployed) === JSON.stringify(expected),
        'FA9[' + forge + ']: the installed support set is EXACTLY the ' + forge
        + ' manifest set (missing: ' + expected.filter(n => !deployed.includes(n)).join(',')
        + ' | unexpected: ' + deployed.filter(n => !expected.includes(n)).join(',') + ')');

      for (const other of forgeLayout.FORGES) {
        if (other === forge) continue;
        const ownSet = new Set(expected);
        const strangers = manifest.supportScripts(other).filter(n => !ownSet.has(n) && deployed.includes(n));
        assert(strangers.length === 0,
          'FA9[' + forge + ']: the ' + forge + ' install must not deploy ' + other
          + '-only scripts — found ' + strangers.join(', '));
      }

      // No Kimi compact lifecycle is installed for any forge.
      const cfg = path.join(kimiHome, 'config.toml');
      assert(!existsSync(cfg), 'FA9[' + forge + ']: fresh install adds no config.toml hook block');

      const skill = readFileSync(path.join(dest, '.kimi-code', 'skills', 'workflow-next', 'SKILL.md'), 'utf8');
      const claim = forgeLayout.scriptName('kaola-workflow-claim.js', forge);
      assert(skill.includes(claim), 'FA9[' + forge + ']: the deployed workflow-next skill resolves ' + claim);
      assert(deployed.includes(claim),
        'FA9[' + forge + ']: ' + claim + ' is among the installed support scripts');
      const installedSkills = readdirSync(path.join(dest, '.kimi-code', 'skills')).sort();
      assert(JSON.stringify(installedSkills) === JSON.stringify([...canonCommandNames].sort()),
        'FA9[' + forge + ']: installed Skill set is exactly the three command Skills (no role Skills)');
      const installedAgents = existsSync(path.join(dest, '.kimi-code', 'agents'))
        ? readdirSync(path.join(dest, '.kimi-code', 'agents')).filter(name => name.endsWith('.md')).sort() : [];
      assert(JSON.stringify(installedAgents) === JSON.stringify(canonAgents.map(role => role + '.md').sort()),
        'FA9[' + forge + ']: installed native agent set is exactly the canonical 14 profiles');
    } finally {
      try { rmSync(home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
}

// ---------------------------------------------------------------------------
// K12 — THIS EDITION'S REMEDIATION LINE IS CORRECT, AND STAYS CORRECT.
//
// runCheck closes a failed report with one command for the whole mismatch set. On the opencode
// twin that line is wrong for two of its classes, and the repair there is to derive the line from
// the classes actually present. HERE IT IS RIGHT, and the reason is structural: every class this
// runCheck can report is a generator-owned artifact, there is no user-owned tracked file among
// them, and `--write` is the only write mode this script has. So the line is pinned as an
// OUTCOME — run what it advised, and the report it advised on must be gone — rather than left to
// be "fixed" in sympathy with a sibling whose problem this file does not have.
//
// The subject is a scratch copy of the repo, because runCheck resolves REPO from its own
// __dirname and `--write` mutates that tree; the planted drift must go somewhere that is not this
// checkout. One scenario, two classes at once, because a mixture is where a per-class rewrite of
// the line would go wrong first.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, cpSync, rmSync } = require('fs');
  const os = require('os');

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'kimi-k12-repo-'));
  const SYNC = path.join(scratch, 'scripts', 'sync-kimi-edition.js');
  const SOURCE_TREES = ['scripts', 'agents', 'commands', 'hooks', 'templates'];
  const run = args => {
    // spawn-class: environment
    const r = spawnSync(process.execPath, [SYNC].concat(args), { encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  const check = () => run(['--forge=github', '--check']);
  const reported = out => out.split('\n')
    .map(l => l.match(/^\s*-\s+(\S+)\s+—\s/))
    .filter(Boolean).map(m => m[1]).sort();
  const advisedCommands = out => (out.match(/node\s+\S*sync-kimi-edition\.js[^\n`'"&;]*/g) || [])
    .map(m => m.trim().split(/\s+/).slice(2).map(t => t.replace(/[.,;:)\]`]+$/, '')).filter(Boolean));

  try {
    const missingTrees = SOURCE_TREES.filter(d => !fs.existsSync(path.join(REPO, d)));
    assert(missingTrees.length === 0,
      'K12: every source tree this fixture copies is present in the repo — ' + JSON.stringify(missingTrees)
      + ' is not, so nothing below is reporting on planted drift');
    for (const d of SOURCE_TREES) {
      if (fs.existsSync(path.join(REPO, d))) cpSync(path.join(REPO, d), path.join(scratch, d), { recursive: true });
    }

    const w = run(['--forge=github', '--write']);
    assert(w.status === 0, 'K12: the scratch repo regenerates — sync --write exit ' + w.status
      + ': ' + String(w.out).split('\n').slice(0, 3).join(' | '));
    assert(check().status === 0,
      'K12: the scratch repo is GREEN before anything is planted — a fixture already red reports a '
      + 'mismatch set that is not the planted one, and the outcome check below would be about that');

    // Two classes at once: a stale generated native profile and a retired command-Skill directory
    // the mirror must prune.
    const skillsDir = path.join(scratch, '.kimi', 'skills');
    const agentsDir = path.join(scratch, '.kimi', 'agents');
    const roleProfile = fs.existsSync(agentsDir)
      ? fs.readdirSync(agentsDir).filter(n => n.endsWith('.md')).sort()[0] || '' : '';
    assert(roleProfile !== '',
      'K12: the regenerated fixture has a native agent profile to drift — with none there is no subject');
    const RETIRED = 'zzz-k12-retired';
    if (roleProfile) fs.appendFileSync(path.join(agentsDir, roleProfile), '\n<!-- K12 planted drift -->\n');
    fs.mkdirSync(path.join(skillsDir, RETIRED), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, RETIRED, 'SKILL.md'), '# K12 fixture\n');

    const c0 = check();
    const planted = [sync.treeLabel('github') + '/agents/' + roleProfile,
      sync.treeLabel('github') + '/skills/' + RETIRED].sort();
    assert(c0.status === 1, 'K12: the planted tree fails --check (exit ' + c0.status + ')');
    assert(JSON.stringify(reported(c0.out)) === JSON.stringify(planted),
      'K12: --check reports EXACTLY the two planted mismatches — expected ' + JSON.stringify(planted)
      + ', parsed ' + JSON.stringify(reported(c0.out)) + '; an empty parse means the mismatch lines '
      + 'stopped being parseable and the outcome check below would compare nothing to nothing');

    const advised = advisedCommands(c0.out);
    assert(advised.length >= 1,
      'K12: --check hands the reader a runnable command — every class this edition reports is '
      + 'cleared by one, so offering none would be a regression, not a repair');
    for (const cmd of advised) {
      assert(!cmd.includes('--write-config'),
        'K12: no --write-config is advised — this script has no such mode and no user-owned tracked '
        + 'config to justify one. Advised: ' + JSON.stringify(cmd)
        + '. (The opencode twin needs that flag for its config class; copying its remediation line '
        + 'across would name a flag that does not exist here.)');
    }
    for (const cmd of advised) run(cmd);
    const after = check();
    assert(after.status === 0 && reported(after.out).length === 0,
      'K12: running what --check advised clears the whole report — exit ' + after.status + ', left '
      + JSON.stringify(reported(after.out)) + '. This is the property the opencode twin lost: the '
      + 'closing line names a command that does not fix what the lines above it reported');
  } finally {
    try { rmSync(scratch, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// K13 + K14 — WHERE THE GENERATED TREE LANDS, AND WHO REFRESHES IT.
// (Mirror of test-opencode-edition.js's A31 + A32; the failure was observed on both editions.)
//
// THE OBSERVED FAILURE. A run regenerated all six edition trees, its record says so, and every
// tree it wrote died with the worktree it wrote them in: the main checkout was never touched, and
// twelve files there kept prose that tells a reader to pass a flag canonical had already renamed.
// Nothing reported it — the trees are gitignored, so `git status` is silent, and every
// chain-resident guard renders the surfaces in memory rather than reading a tree, so all four
// stayed green over the twelve stale files.
//
// Two properties close that, stated as RESULTS because neither is a claim about how a root is
// computed:
//
//   K13  a sync run FROM a linked worktree writes the MAIN checkout's tree, rendered from the
//        INVOKING checkout's canonical sources, and leaves no throwaway tree behind.
//   K14  the regenerate step the skeleton rule already mandates leaves every edition tree that
//        is PRESENT current, and does not conjure one that is absent.
//
// WHY A SCRATCH REPO WITH A REAL WORKTREE. Both write modes mutate a real tree, and the subject
// here is *which* tree — so the fixture has to own both candidate roots. It builds a repo, commits
// it, and adds a genuine linked worktree, because a linked worktree is the posture the failure was
// observed in and the only one where the two roots differ. This repo is never a candidate: its own
// trees are gitignored and D0 above exists to report their drift.
//
// THE TWO MARKERS ARE THE WHOLE DISCRIMINATOR. "Writes main's tree" is satisfiable by a change that
// simply resolves everything — sources included — against the main checkout, and that change closes
// nothing: a run's regenerate would then read main's unedited sources and write a tree that was
// already in parity, i.e. a no-op wearing a fix's name. So one marker is planted in main's canonical
// agent and one in the worktree's, and the assertions below are on BOTH: main's tree must gain the
// worktree's marker and LOSE main's own.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, cpSync, rmSync } = require('fs');
  const os = require('os');

  const fixture = mkdtempSync(path.join(os.tmpdir(), 'kimi-k13-'));
  const mainRoot = path.join(fixture, 'main');     // K13: the main checkout
  const wtRoot = path.join(fixture, 'wt');         // K13: a genuine linked worktree of it
  const plainRoot = path.join(fixture, 'plain');   // K13: a copy that is not a git checkout at all
  const neutralCwd = path.join(fixture, 'cwd');    // K13: a cwd belonging to no checkout
  const regenRoot = path.join(fixture, 'regen');   // K14

  // The generator's whole input surface. `plugins` carries the gitlab/gitea command sources, so a
  // non-default forge is unrenderable without it; the green-baseline assertions keep the list honest.
  const SOURCE_TREES = ['scripts', 'agents', 'commands', 'hooks', 'templates', 'plugins'];
  const childEnv = Object.assign({}, process.env);
  delete childEnv.KAOLA_OPENCODE_STANDARD_MODEL;
  delete childEnv.KAOLA_OPENCODE_REASONING_MODEL;

  const copyRepo = dest => {
    fs.mkdirSync(dest, { recursive: true });
    for (const d of SOURCE_TREES) cpSync(path.join(REPO, d), path.join(dest, d), { recursive: true });
    // Not a kimi input, but the sibling edition reads it: a regenerate step that refreshes both
    // editions must not trip over a tracked file this fixture simply failed to bring along.
    if (fs.existsSync(path.join(REPO, 'opencode.json'))) {
      cpSync(path.join(REPO, 'opencode.json'), path.join(dest, 'opencode.json'));
    }
  };
  // Identity and signing are pinned per invocation: a fixture that inherits the developer's
  // git config fails on a machine that signs commits, and a red there says nothing about the
  // property under test.
  // `protocol.file.allow` is needed for the submodule leg in K15: modern git refuses a file://
  // submodule clone by default, and that refusal would be a fixture failure wearing a finding's name.
  const git = (cwd, args) => {
    // spawn-class: environment
    const r = spawnSync('git',
      ['-c', 'user.email=k13@fixture.invalid', '-c', 'user.name=k13', '-c', 'commit.gpgsign=false',
        '-c', 'protocol.file.allow=always'].concat(args), { cwd, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
  };
  // scriptRoot is the checkout the script is INVOKED FROM; cwd is the process's working directory.
  // They are passed separately on purpose — "not cwd" is half of what K13 pins.
  // The two streams are returned SEPARATELY as well as merged. K16 below is the only caller that
  // needs them apart, and it needs them apart for a reason the merged view cannot express: this
  // script's stdout is a parsed interface in another mode, so "which stream" is itself a property.
  const runSync = (scriptRoot, cwd, args) => {
    // spawn-class: environment
    const r = spawnSync(process.execPath,
      [path.join(scriptRoot, 'scripts', 'sync-kimi-edition.js')].concat(args),
      { cwd, encoding: 'utf8', env: childEnv });
    return {
      status: r.status,
      out: (r.stdout || '') + (r.stderr || ''),
      stdout: r.stdout || '',
      stderr: r.stderr || '',
    };
  };
  const runGenerator = (scriptRoot, args) => {
    // spawn-class: environment
    const r = spawnSync(process.execPath,
      [path.join(scriptRoot, 'scripts', 'generate-routing-surfaces.js')].concat(args),
      { cwd: scriptRoot, encoding: 'utf8', env: childEnv });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  const readIf = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const behaviorSource = root => path.join(root, 'templates', 'agents', 'behavior-contracts.json');
  const plantBehaviorMarker = (root, role, marker) => {
    const file = behaviorSource(root);
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));
    source.roles[role].body += '\n' + marker + '\n';
    fs.writeFileSync(file, JSON.stringify(source, null, 2) + '\n');
  };
  const head = out => String(out).split('\n').filter(Boolean).slice(0, 4).join(' | ');

  // The forge axis, taken from the module rather than typed: one default tree, one non-default
  // tree, and one that stays absent. K14's "present is refreshed, absent is left alone" needs all
  // three, and an axis that ever shrinks below three should red here rather than silently drop a leg.
  const DEF_FORGE = sync.DEFAULT_FORGE;
  const OTHER_FORGE = sync.FORGES.filter(f => f !== DEF_FORGE)[0];
  const ABSENT_FORGE = sync.FORGES.filter(f => f !== DEF_FORGE && f !== OTHER_FORGE)[0];

  try {
    const missingTrees = SOURCE_TREES.filter(d => !fs.existsSync(path.join(REPO, d)));
    assert(missingTrees.length === 0,
      'K13: every source tree these fixtures copy is present in the repo — ' + JSON.stringify(missingTrees)
      + ' is not, so the copies below are missing an input the generator reads and every assertion '
      + 'would be reporting on a tree of absent files rather than on where a tree landed');
    assert(!!OTHER_FORGE && !!ABSENT_FORGE,
      'K13/K14: the forge axis carries at least three forges (' + JSON.stringify(sync.FORGES) + ') — '
      + 'K14 needs a present default tree, a present non-default tree and an absent one, and with '
      + 'fewer the absent-tree leg would range over nothing and pass by having checked nothing');

    // -----------------------------------------------------------------------
    // K13 — the fixture: a committed repo plus a real linked worktree.
    // -----------------------------------------------------------------------
    copyRepo(mainRoot);
    const gitSteps = [
      ['init', ['init', '-q']],
      ['add', ['add', '-A']],
      ['commit', ['commit', '-q', '--no-verify', '-m', 'k13 fixture base']],
      ['worktree', ['worktree', 'add', '-q', '-b', 'k13-branch', wtRoot]],
    ];
    let fixtureBuilt = true;
    for (const [name, args] of gitSteps) {
      const r = git(mainRoot, args);
      if (r.status !== 0) fixtureBuilt = false;
      assert(r.status === 0,
        'K13: the fixture builds — git ' + name + ' exited ' + r.status + ': ' + head(r.out)
        + '. Every assertion below reads a tree out of this repo or its worktree, so a fixture that '
        + 'did not build is a band that checked nothing');
    }
    assert(fixtureBuilt && fs.existsSync(path.join(wtRoot, 'scripts')),
      'K13: the linked worktree has a checkout to run from — without one the sync spawns below '
      + 'would fail to find their own script and every result would be an artifact of that');

    if (fixtureBuilt) {
      const w0 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--write']);
      assert(w0.status === 0,
        'K13: the fixture regenerates — sync --write exit ' + w0.status + ': ' + head(w0.out));
      const c0 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--check']);
      assert(c0.status === 0,
        'K13: the fixture is GREEN before anything is planted. The markers below are read as the '
        + 'only difference between the two checkouts, so a fixture already red — an under-copied '
        + 'source tree — is a different test wearing this one\'s name. Got exit ' + c0.status
        + ': ' + head(c0.out));

      const agentFile = (fs.existsSync(path.join(mainRoot, 'agents'))
        ? fs.readdirSync(path.join(mainRoot, 'agents')).filter(f => f.endsWith('.md')).sort() : [])[0] || '';
      assert(agentFile !== '',
        'K13: the fixture has a canonical agent to plant a marker in — with none there is no '
        + 'subject and both markers would be absent from every tree for a reason that is not the '
        + 'one this band reports');

      const MAIN_MARK = 'K13-MARKER-PLANTED-IN-MAIN';
      const WT_MARK = 'K13-MARKER-PLANTED-IN-WORKTREE';
      const renderedRel = agentRel(agentFile.replace(/\.md$/, ''), DEF_FORGE);

      if (agentFile) {
        // Control: a canonical edit reaches the rendered surface AT ALL. Without it, the marker
        // assertions below could red forever against a correct implementation, and a marker that
        // never renders would make the "main's marker is gone" half true for the wrong reason.
        plantBehaviorMarker(mainRoot, agentFile.replace(/\.md$/, ''), MAIN_MARK);
        const w1 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--write']);
        assert(w1.status === 0,
          'K13: the fixture regenerates after the main-side plant — exit ' + w1.status + ': ' + head(w1.out));
        assert(readIf(path.join(mainRoot, renderedRel)).includes(MAIN_MARK),
          'K13: control — an edit to canonical role behavior reaches its rendered native Kimi profile. It did not '
          + 'reach ' + renderedRel + ', so this fixture cannot tell WHICH checkout\'s sources were '
          + 'rendered and both marker assertions below would be vacuous');

        plantBehaviorMarker(wtRoot, agentFile.replace(/\.md$/, ''), WT_MARK);
        assert(!readIf(behaviorSource(wtRoot)).includes(MAIN_MARK),
          'K13: control — the worktree holds its own copy of the canonical sources. If it shared '
          + 'main\'s file, both markers would be in both checkouts and the discriminator would be gone');

        // ------------------------------------------------------------------
        // K13 — THE SUBJECT: sync --write, run from the linked worktree.
        // ------------------------------------------------------------------
        const w2 = runSync(wtRoot, wtRoot, ['--forge=' + DEF_FORGE, '--write']);
        assert(w2.status === 0,
          'K13: sync --write run from a linked worktree succeeds — exit ' + w2.status + ': ' + head(w2.out));

        const landed = readIf(path.join(mainRoot, renderedRel));
        assert(landed.includes(WT_MARK),
          'K13: a sync run from a linked worktree writes the MAIN checkout\'s edition tree. '
          + path.join(mainRoot, renderedRel) + ' does not carry the worktree\'s marker, so the '
          + 'regenerate a run performs on its branch leaves main\'s tree exactly as stale as it '
          + 'found it — the observed failure this band exists for');
        assert(!landed.includes(MAIN_MARK),
          'K13: ...and renders it from the INVOKING checkout\'s canonical sources. Main\'s tree still '
          + 'carries the marker planted in MAIN\'s agents/, which means the sources were resolved '
          + 'against the main checkout too — a sync from a worktree would then re-render main from '
          + 'its own unchanged sources and the run\'s edits would never reach any tree');
        assert(!fs.existsSync(path.join(wtRoot, sync.treeLabel(DEF_FORGE))),
          'K13: ...and leaves no throwaway tree in the worktree. '
          + path.join(wtRoot, sync.treeLabel(DEF_FORGE)) + ' exists: a tree written there is deleted '
          + 'with the worktree, which is how a run can report six trees in parity and leave twelve '
          + 'stale files behind');

        const c2 = runSync(wtRoot, wtRoot, ['--forge=' + DEF_FORGE, '--check']);
        assert(c2.status === 0,
          'K13: --check and --write agree about which root holds the tree. Run from the worktree, '
          + '--check exited ' + c2.status + ' over a tree --write had just made current: ' + head(c2.out)
          + '. A checker looking at one root while the writer writes another reports a permanent '
          + 'false red in exactly the posture a run works in');
      }
    }

    // -----------------------------------------------------------------------
    // K13 — the non-git leg. Resolving main is a new dependency on git, and the sync also runs
    // from an unpacked source tree that is no checkout at all (the installers call it from wherever
    // they were unpacked). Neither root exists there, so the tree belongs where the script does —
    // and never in the process cwd, which is the other thing "resolve against the main checkout"
    // must not be read to mean.
    // -----------------------------------------------------------------------
    copyRepo(plainRoot);
    fs.mkdirSync(neutralCwd, { recursive: true });
    assert(!fs.existsSync(path.join(plainRoot, '.git')),
      'K13: the non-git leg\'s copy really is not a git checkout — with a .git in it this leg would '
      + 'be a second copy of the leg above rather than the fallback case');
    const w3 = runSync(plainRoot, neutralCwd, ['--forge=' + DEF_FORGE, '--write']);
    assert(w3.status === 0,
      'K13: sync --write succeeds in a directory that is not a git checkout — exit ' + w3.status
      + ': ' + head(w3.out) + '. An unpacked source tree has no main checkout to resolve, and a '
      + 'resolution that throws there breaks both installers');
    assert(fs.existsSync(path.join(plainRoot, sync.treeLabel(DEF_FORGE), 'skills')),
      'K13: ...and writes the tree into the root the script itself lives in');
    assert(!fs.existsSync(path.join(neutralCwd, sync.treeLabel(DEF_FORGE))),
      'K13: ...and never into the process cwd — the tree landed in ' + neutralCwd + ', which owns '
      + 'no canonical sources and is not what "the main checkout" means');
    const c3 = runSync(plainRoot, neutralCwd, ['--forge=' + DEF_FORGE, '--check']);
    assert(c3.status === 0,
      'K13: --check agrees in the non-git case too — exit ' + c3.status + ': ' + head(c3.out));

    // -----------------------------------------------------------------------
    // K15 — THE TREE IS NEVER WRITTEN INTO A DIRECTORY GIT OWNS.
    // (Mirror of test-opencode-edition.js's A33.)
    //
    // "Resolve the tree against the main checkout" has two postures where there IS no main
    // checkout and the coordination directory is not a checkout's `.git` either:
    //
    //   bare repository + linked worktree   coordination dir = <name>.git, the bare repo itself
    //   submodule                            coordination dir = <super>/.git/modules/<name>
    //
    // A resolution that simply takes the coordination directory when it cannot take its parent
    // lands the generated tree INSIDE git's own storage. Nothing is destroyed by that and the
    // installers still deploy full counts, which is why this is small — but it is somewhere git
    // owns and may rewrite, it is somewhere no one would look, and it contradicts the rule the
    // resolution is there to implement: with no main checkout, the tree belongs beside the script.
    //
    // Stated as a result and only as a result. WHERE the tree ends up is the whole assertion; how
    // the answer is computed is not this band's business, and a fix by any route satisfies it.
    //
    // The coordination directory is asked for per posture rather than assumed, so this keeps
    // meaning the same thing if git's layout changes: whatever git says its storage is, the tree
    // is not in it.
    // -----------------------------------------------------------------------
    const coordDirOf = checkout => {
      const r = git(checkout, ['rev-parse', '--git-common-dir']);
      const raw = String(r.stdout || '').trim().split('\n')[0];
      return r.status === 0 && raw ? path.resolve(checkout, raw) : '';
    };
    const treeLandingLegs = [];

    // Leg 1 — bare repository with a linked worktree. Cloned from the K13 fixture, which already
    // carries a commit; a bare repo has no working tree of its own, so the worktree is the only
    // checkout in play and "beside the script" can only mean that worktree.
    {
      const bare = path.join(fixture, 'bare.git');
      const bareWt = path.join(fixture, 'bare-wt');
      let built = true;
      for (const [name, cwd, args] of [
        ['clone --bare', fixture, ['clone', '--bare', '-q', mainRoot, bare]],
        ['worktree add', bare, ['worktree', 'add', '-q', '--detach', bareWt, 'HEAD']],
      ]) {
        const r = git(cwd, args);
        if (r.status !== 0) built = false;
        assert(r.status === 0, 'K15[bare]: the fixture builds — git ' + name + ' exited ' + r.status
          + ': ' + head(r.out));
      }
      if (built && fs.existsSync(path.join(bareWt, 'scripts'))) {
        treeLandingLegs.push({ tag: 'bare', checkout: bareWt });
      } else {
        assert(false, 'K15[bare]: the bare repo\'s worktree has a checkout to run from — without one '
          + 'this posture is untested and its absence would read as a pass');
      }
    }

    // Leg 2 — submodule. Its `.git` is a FILE pointing into the superproject's storage, which is
    // the posture that produces a `.git/modules/...` coordination dir.
    {
      const sup = path.join(fixture, 'super');
      fs.mkdirSync(sup, { recursive: true });
      fs.writeFileSync(path.join(sup, 'README.md'), '# K15 superproject fixture\n');
      let built = true;
      for (const [name, args] of [
        ['init', ['init', '-q']],
        ['add', ['add', '-A']],
        ['commit', ['commit', '-q', '--no-verify', '-m', 'k15 superproject']],
        ['submodule add', ['submodule', 'add', '-q', mainRoot, 'sub']],
      ]) {
        const r = git(sup, args);
        if (r.status !== 0) built = false;
        assert(r.status === 0, 'K15[submodule]: the fixture builds — git ' + name + ' exited '
          + r.status + ': ' + head(r.out));
      }
      const sub = path.join(sup, 'sub');
      if (built && fs.existsSync(path.join(sub, 'scripts'))) {
        treeLandingLegs.push({ tag: 'submodule', checkout: sub });
      } else {
        assert(false, 'K15[submodule]: the submodule has a checkout to run from — without one this '
          + 'posture is untested and its absence would read as a pass');
      }
    }

    assert(treeLandingLegs.length === 2,
      'K15: both postures were constructed (' + treeLandingLegs.length + ' of 2) — a leg that failed '
      + 'to build checks nothing, and this band is the only place either posture is exercised');

    for (const leg of treeLandingLegs) {
      const tag = 'K15[' + leg.tag + ']';
      const label = sync.treeLabel(DEF_FORGE);
      const coord = coordDirOf(leg.checkout);
      assert(coord !== '',
        tag + ': git names a coordination directory for this checkout — without one the assertion '
        + 'below has no forbidden location to compare against and would pass having compared nothing');

      const w = runSync(leg.checkout, leg.checkout, ['--forge=' + DEF_FORGE, '--write']);
      assert(w.status === 0,
        tag + ': sync --write succeeds — exit ' + w.status + ': ' + head(w.out));

      const beside = path.join(leg.checkout, label);
      const inGitStorage = coord ? path.join(coord, label) : '';
      const landedAt = [beside, inGitStorage].filter(Boolean).find(p => fs.existsSync(p)) || '';

      assert(inGitStorage === '' || !fs.existsSync(inGitStorage),
        tag + ': the generated tree is NOT written inside the directory git uses for its own '
        + 'storage. It is at ' + inGitStorage + '. That directory belongs to git, which may rewrite '
        + 'or repack around it, and nobody looking for a generated tree looks there');
      assert(fs.existsSync(path.join(beside, 'skills')),
        tag + ': ...it is beside the script instead, at ' + beside + '. There is no main checkout in '
        + 'this posture — a bare repository has no working tree and a submodule\'s storage is not a '
        + 'checkout — so beside the script is the only place left that a reader owns. It landed at '
        + (landedAt || '(nowhere this band knows about)'));
      assert(!landedAt.split(path.sep).includes('.git'),
        tag + ': ...and no segment of the tree\'s path is `.git` — it landed at ' + landedAt
        + '. This is the general form of the line above: whatever git calls its storage, a generated '
        + 'tree does not live under a `.git` directory');

      const c = runSync(leg.checkout, leg.checkout, ['--forge=' + DEF_FORGE, '--check']);
      assert(c.status === 0,
        tag + ': --check agrees with --write about where the tree is — exit ' + c.status + ': '
        + head(c.out) + '. A fix that moves only the writer leaves the checker reporting every file '
        + 'missing in a posture that was working before it');
    }

    // -----------------------------------------------------------------------
    // K14 — THE MANDATED REGENERATE STEP LEAVES A PRESENT TREE CURRENT.
    //
    // The rule is "edit the skeleton and regenerate, never a rendered surface", and the regenerate
    // it names renders the tracked command/skill surfaces. The edition trees render FROM those
    // surfaces and are not part of that step, so the prose reaches every tracked surface and stops
    // one hop short of the trees a runtime actually reads.
    //
    // Stated as a result, never as a topology: after the regenerate step, an edition tree that is
    // PRESENT is in parity, whatever calls what to get there. An ABSENT tree is not created —
    // there is no stale prose in a tree that does not exist, and materializing one would hand a
    // developer a forge tree they never asked to deploy. A skip may be printed or silent; loud is
    // the house preference and neither is pinned here.
    // -----------------------------------------------------------------------
    copyRepo(regenRoot);
    // A committed repo with no worktree, so this band's subject is the regenerate step and not the
    // root resolution K13 already owns: main resolves to regenRoot itself either way.
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '--no-verify', '-m', 'k14 fixture base']]) {
      const r = git(regenRoot, args);
      assert(r.status === 0, 'K14: the fixture builds — git ' + args[0] + ' exited ' + r.status + ': ' + head(r.out));
    }

    for (const forge of [DEF_FORGE, OTHER_FORGE]) {
      const w = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--write']);
      assert(w.status === 0,
        'K14: the fixture materializes ' + sync.treeLabel(forge) + ' — exit ' + w.status + ': ' + head(w.out));
      const c = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--check']);
      assert(c.status === 0,
        'K14: ' + sync.treeLabel(forge) + ' is in parity BEFORE the skeleton is edited — exit '
        + c.status + ': ' + head(c.out) + '. Every assertion below reads a --check exit as the '
        + 'answer to "did the regenerate step refresh this tree", which it is not if the tree was '
        + 'already stale');
    }
    assert(!fs.existsSync(path.join(regenRoot, sync.treeLabel(ABSENT_FORGE))),
      'K14: ' + sync.treeLabel(ABSENT_FORGE) + ' is absent from the fixture — it is the absent-tree '
      + 'leg\'s whole subject, and a tree that is there makes that leg check nothing');

    const skeleton = path.join(regenRoot, 'templates', 'routing', 'next.skeleton.md');
    assert(fs.existsSync(skeleton),
      'K14: the skeleton the regenerate step renders from is present at templates/routing — the '
      + 'edit below is what makes every tracked surface, and then every tree, stale');
    if (fs.existsSync(skeleton)) {
      const SKEL_MARK = 'K14-MARKER-FROM-THE-SKELETON';
      fs.appendFileSync(skeleton, '\n' + SKEL_MARK + '\n');

      // Control: the plant reaches the tracked surfaces. Without this the trees could be in parity
      // after the regenerate step simply because nothing ever changed, and every assertion below
      // would be green over an edit that went nowhere.
      const g0 = runGenerator(regenRoot, ['--check']);
      assert(g0.status === 1,
        'K14: control — the skeleton edit makes the tracked surfaces stale (--check exit ' + g0.status
        + ': ' + head(g0.out) + '). If it does not, the regenerate step below has nothing to '
        + 'propagate and the parity assertions pass by having observed no change at all');

      // THE SUBJECT: the step the rule mandates, and nothing else.
      const g1 = runGenerator(regenRoot, ['--write']);
      assert(g1.status === 0,
        'K14: the regenerate step succeeds — generate-routing-surfaces --write exit ' + g1.status
        + ': ' + head(g1.out));
      const g2 = runGenerator(regenRoot, ['--check']);
      assert(g2.status === 0,
        'K14: the regenerate step still does its own job — the tracked surfaces byte-match the '
        + 'skeleton afterwards (--check exit ' + g2.status + ': ' + head(g2.out) + ')');

      for (const forge of [DEF_FORGE, OTHER_FORGE]) {
        const c = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--check']);
        assert(c.status === 0,
          'K14: after the regenerate step, the PRESENT tree ' + sync.treeLabel(forge) + ' is current '
          + '— --check exited ' + c.status + ': ' + head(c.out) + '. The prose reached every tracked '
          + 'surface and stopped one hop short of the tree a runtime reads, which is the whole of '
          + 'what leaves an edition deploying a renamed flag');
      }
      assert(readIf(path.join(regenRoot, sync.skillRel('workflow-next', DEF_FORGE))).includes(SKEL_MARK),
        'K14: ...and the tree carries the edited prose itself, not merely a passing exit code — '
        + sync.skillRel('workflow-next', DEF_FORGE) + ' does not contain the marker planted in the '
        + 'skeleton');

      assert(!fs.existsSync(path.join(regenRoot, sync.treeLabel(ABSENT_FORGE))),
        'K14: ...and an ABSENT tree is left absent. The regenerate step materialized '
        + sync.treeLabel(ABSENT_FORGE) + ', handing a developer a forge tree they never installed; '
        + 'a tree that does not exist carries no stale prose and needs no refresh');

      // ---------------------------------------------------------------------
      // K14 — AND THE CHAINS GAIN NO EDITION COVERAGE. Green on arrival, and said out loud: this
      // pins a ruling rather than a repair. generate-routing-surfaces --check runs in all four
      // chains, so an edition tree read in CHECK mode would put the editions inside `npm test` —
      // the one thing the rule at CLAUDE.md's validation policy forbids, and the reason the
      // refresh belongs to --write alone. A stale tree here must not move --check's exit code, and
      // --check must not repair what it saw either: a checker that writes is how the drift that
      // started all this stayed invisible.
      // ---------------------------------------------------------------------
      const planted = path.join(regenRoot, sync.skillRel('workflow-next', DEF_FORGE));
      if (fs.existsSync(planted)) {
        const before = fs.readFileSync(planted, 'utf8');
        fs.writeFileSync(planted, before + '\n<!-- K14 planted tree drift -->\n');
        const cPlant = runSync(regenRoot, regenRoot, ['--forge=' + DEF_FORGE, '--check']);
        assert(cPlant.status === 1,
          'K14: control — the planted tree drift is real (sync --check exit ' + cPlant.status + ': '
          + head(cPlant.out) + '). With no drift on disk the two assertions below observe nothing');
        const g3 = runGenerator(regenRoot, ['--check']);
        assert(g3.status === 0,
          'K14: a stale edition tree does not move generate-routing-surfaces --check, which runs in '
          + 'all four chains — exit ' + g3.status + ': ' + head(g3.out) + '. An edition tree read in '
          + 'CHECK mode puts the editions inside `npm test`, and reds every fresh clone and every '
          + 'worktree besides, where no tree exists to compare');
        assert(fs.readFileSync(planted, 'utf8').includes('K14 planted tree drift'),
          'K14: ...and --check did not repair it either. A check that writes destroys the evidence '
          + 'it was run to report, which is the defect the drift block at the top of this file exists '
          + 'to stop being repeated');
      }
    }

    // -----------------------------------------------------------------------
    // K16 — A REFRESH THAT REACHES ANOTHER CHECKOUT SAYS SO.
    //
    // K13 pins WHERE the tree lands, and that is unchanged and deliberate: a refresh run from a
    // linked worktree writes the MAIN checkout's trees. What it leaves behind is a reader in main
    // whose deployed-from trees just moved under them with nothing to notice — the trees are
    // gitignored, so `git status` is silent, and every chain-resident guard renders in memory
    // rather than reading a tree. The announcement is the entire remedy, and until this band
    // nothing read it: K13 and K14 are both green with the note deleted, so it could be removed
    // and every suite would stay green over the same invisibility it was added to end.
    //
    // FOUR PROPERTIES, AS RESULTS. The wording is deliberately NOT pinned — it changed twice on
    // the day it shipped, and a test holding the sentence would have reddened twice for nothing.
    // What must hold is:
    //
    //   fires    a refresh that changes something in a checkout that is not this one is announced,
    //            and the announcement names the root a reader has to go and look at. A note that
    //            reports the reach without the destination is a warning nobody can act on.
    //   silent   from the checkout that owns the tree, EVEN WHEN FILES ARE WRITTEN. This is the leg
    //            that rots into a false positive, so it carries a control proving the write really
    //            happened — without it, silence is indistinguishable from a refresh that did nothing.
    //   silent   when the refresh changed nothing there. The writers content-compare, so an
    //            in-parity refresh leaves the other checkout byte-identical; a warning attached to
    //            a run that touched nothing teaches a reader to skip the one that did not.
    //   stderr   and never stdout. Not tidiness: this script's stdout is a parsed interface in
    //            another mode — both edition installers read --print-tree-root as a filesystem path
    //            — so an advisory on that stream is a line a caller will try to open.
    //
    // THE COUNT IS NOT ASSERTED, deliberately, and this edition is where that matters most: a
    // retired skill DIRECTORY is removed with recursive:true and counted once, so a five-file
    // folder is one change. The number is changes applied, never a file tally, and a leg comparing
    // it to a file count would pin an arithmetic the script explicitly disclaims.
    // -----------------------------------------------------------------------
    const K16_NOTE = 'NOTE';
    const k16MainTree = path.join(mainRoot, sync.treeLabel(DEF_FORGE));
    const k16Ready = fs.existsSync(k16MainTree) && fs.existsSync(path.join(wtRoot, 'scripts'));
    assert(k16Ready,
      'K16: K13\'s two-root fixture is still standing — main\'s ' + sync.treeLabel(DEF_FORGE)
      + ' is present at ' + k16MainTree + ' and the worktree has a checkout to run from. Without '
      + 'both, every leg below reports on a refresh that found no tree to touch, and each one '
      + 'would read as a pass');
    if (k16Ready) {
      // The root the note must name, in BOTH spellings. The fixture lives under a tmpdir that is a
      // symlink on macOS (/var -> /private/var) and the script prints the root git resolved, which
      // may be the realpath — so a comparison against the fixture's own spelling alone would red on
      // the platform rather than on the property.
      const k16Roots = [mainRoot];
      try { k16Roots.push(fs.realpathSync(mainRoot)); } catch (_) { /* the literal spelling stands */ }
      const namesTheOtherRoot = s => k16Roots.some(r => String(s).includes(r));

      const k16Agent = (fs.existsSync(path.join(wtRoot, 'agents'))
        ? fs.readdirSync(path.join(wtRoot, 'agents')).filter(f => f.endsWith('.md')).sort() : [])[0] || '';
      assert(k16Agent !== '' && fs.existsSync(path.join(mainRoot, 'agents', k16Agent)),
        'K16: both checkouts hold a canonical agent to edit — with none there is no way to make a '
        + 'refresh change anything, and the fires-leg below would be observing an empty refresh');

      if (k16Agent && fs.existsSync(path.join(mainRoot, 'agents', k16Agent))) {
        const k16Rendered = path.join(mainRoot,
          agentRel(k16Agent.replace(/\.md$/, ''), DEF_FORGE));

        // SETTLE FIRST. The in-parity leg needs a refresh that genuinely changes nothing, and what
        // K13 left is not that by construction: it wrote ONE forge with --write, while
        // --refresh-present covers every tree that is present. So one run settles the tree and the
        // NEXT one is the measurement.
        runSync(wtRoot, wtRoot, ['--refresh-present']);

        // (a) SILENT WHEN NOTHING CHANGED IN THE OTHER CHECKOUT.
        const r0 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(r0.status === 0,
          'K16: --refresh-present from the linked worktree succeeds — exit ' + r0.status + ': '
          + head(r0.out));
        // One word, not the sentence. This line is only printed when a tree was found present, so
        // its presence is the whole signal; matching more of it would put this band's controls back
        // in the business of holding wording that has already been reworded twice.
        assert(r0.stdout.includes('refreshed'),
          'K16: control — that in-parity run did find a tree and refresh it (stdout: '
          + head(r0.stdout) + '). A run that found nothing present is silent for a reason that has '
          + 'nothing to do with the gate, and the assertion below would then pass forever without '
          + 'ever observing the gate it names');
        assert(!r0.stderr.includes(K16_NOTE),
          'K16: a refresh that changed NOTHING in the other checkout stays silent. It announced '
          + 'anyway: ' + head(r0.stderr) + '. The writers content-compare, so this run left the '
          + 'other checkout byte-identical — a warning attached to a run that touched nothing is '
          + 'how a reader learns to skip the one that did');

        // (b) FIRES on a real cross-checkout change, (c) NAMES the root, (d) on STDERR only.
        const WT_MARK_16 = 'K16-MARKER-FROM-THE-WORKTREE';
        plantBehaviorMarker(wtRoot, k16Agent.replace(/\.md$/, ''), WT_MARK_16);
        const r1 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(r1.status === 0,
          'K16: the changing refresh succeeds — exit ' + r1.status + ': ' + head(r1.out));
        assert(readIf(k16Rendered).includes(WT_MARK_16),
          'K16: control — that refresh really did change the OTHER checkout. ' + k16Rendered
          + ' does not carry the marker just planted in the worktree\'s canonical agent, so there '
          + 'was no cross-checkout change to announce and the three assertions below would be '
          + 'asking whether a note fired for an event that never happened');
        assert(r1.stderr.includes(K16_NOTE),
          'K16: a refresh that changes a checkout which is not this one ANNOUNCES it. It said '
          + 'nothing: ' + head(r1.stderr) + '. The trees are gitignored and no chain reads one, so '
          + 'with this note gone the reader who could act on the change is the only one who cannot '
          + 'see it happened');
        assert(namesTheOtherRoot(r1.stderr),
          'K16: ...and names the root a reader has to go and look at. The announcement does not '
          + 'contain ' + mainRoot + ': ' + head(r1.stderr) + '. Every other line this script prints '
          + 'names a tree by its repo-relative label, which reads as "beside me" in the one posture '
          + 'where it is not, so an announcement without the absolute root repeats the confusion it '
          + 'exists to clear');
        assert(!r1.stdout.includes(K16_NOTE),
          'K16: ...and it lands on stderr, never stdout. It is on stdout: ' + head(r1.stdout)
          + '. This script\'s stdout is a parsed interface in another mode — both edition '
          + 'installers consume --print-tree-root as a filesystem path — so an advisory there is a '
          + 'line a caller will try to open');

        // (e) SILENT FROM THE CHECKOUT THAT OWNS THE TREE, THOUGH FILES ARE WRITTEN.
        const MAIN_MARK_16 = 'K16-MARKER-FROM-MAIN';
        plantBehaviorMarker(mainRoot, k16Agent.replace(/\.md$/, ''), MAIN_MARK_16);
        const r2 = runSync(mainRoot, mainRoot, ['--refresh-present']);
        assert(r2.status === 0,
          'K16: --refresh-present from the main checkout succeeds — exit ' + r2.status + ': '
          + head(r2.out));
        assert(readIf(k16Rendered).includes(MAIN_MARK_16),
          'K16: control — the main-checkout refresh WROTE, and wrote real changes. ' + k16Rendered
          + ' does not carry the marker planted in main\'s own canonical agent, so this run changed '
          + 'nothing and the silence below would be the changed-nothing gate rather than the '
          + 'same-checkout gate this leg is for');
        assert(!r2.stderr.includes(K16_NOTE) && !r2.stdout.includes(K16_NOTE),
          'K16: ...and a refresh from the checkout that OWNS the tree says nothing, on either '
          + 'stream. It announced: ' + head(r2.out) + '. Nothing crossed a checkout boundary here — '
          + 'the reader is already looking at the tree that changed, and a note in the ordinary '
          + 'posture is the false positive that empties the real one of meaning');

        // (f) A DELETION-ONLY REFRESH FIRES TOO. The count sums the prunes, because a refresh can
        // DELETE from the other checkout and write nothing — the more destructive half of the same
        // reach, and the half a write-only count reports as a silent no-op. The stray skill folder
        // goes into MAIN's tree and the refresh runs from the WORKTREE, whose sources the tree is
        // otherwise in parity with after the settle, so the prune is the only change there is. It
        // carries two files on purpose: the whole directory counts as ONE change, which is why no
        // assertion here reads the number.
        runSync(wtRoot, wtRoot, ['--refresh-present']);
        const k16Stray = path.join(k16MainTree, 'skills', '__k16-retired-probe');
        fs.mkdirSync(k16Stray, { recursive: true });
        fs.writeFileSync(path.join(k16Stray, 'SKILL.md'), '# K16 retired-artifact probe\n');
        fs.writeFileSync(path.join(k16Stray, 'NOTES.md'), 'second file, still one change\n');
        const r3 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(!fs.existsSync(k16Stray),
          'K16: control — the stray really is a retired skill directory and the refresh pruned it. '
          + 'It is still at ' + k16Stray + ', so this refresh deleted nothing and the assertion '
          + 'below would be reading a note raised by some other change');
        // Presence only. Whether the announcement names the root is pinned once, above, on the
        // firing leg; re-asserting it here made this leg red for a reason that is not its own —
        // measured, by a mutation that dropped the root and reddened two legs instead of one.
        assert(r3.stderr.includes(K16_NOTE),
          'K16: a refresh whose ONLY change in the other checkout is a deletion is announced too. '
          + 'It was silent: ' + head(r3.stderr) + '. A gate counting writes alone reports the '
          + 'destructive half of a cross-checkout reach as a no-op');
      }
    }
  } finally {
    try { rmSync(fixture, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

if (failed) {
  console.error('\nkimi-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('kimi-edition test passed (' + passed + ' assertions).' + driftVerdict);
