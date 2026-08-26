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
// The adaptive-schema require went with S1-contract and A26: its only consumers here were
// `effortForProvider` / `contractForProvider` / `CONTRACT_EFFORT_TABLE`, all removed with per-role
// effort tiering. An import kept "in case" is the same dead-configuration class as the mechanism.
const reviewerGenerator = require('./generate-reviewer-profiles.js');

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
  // git owns. A33 below asserts that outcome on disk; this is the same statement, for the probe.
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
// D0 — DRIFT IS OBSERVED BEFORE IT IS REPAIRED.
//
// The self-provision below runs `sync --write`, which REPAIRS the generated tree. Run first, it
// destroys the only evidence that the tree on this disk had drifted from canonical: measured, this
// suite passed 490/505 against a tree whose commands still pointed at a file that had been deleted,
// because the preamble had just rewritten that pointer itself before the first assertion read it.
// Nothing else reported the drift either — the two installers call `--check || --write`, a REPAIR
// position, so a developer's tree is silently corrected and the drift is never named anywhere.
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
// can never print the same thing. Only the GENERATED tree is skippable: the tracked `opencode.json`
// is compared to its renderer by A7 below, unconditionally and independent of any tree's presence.
//
// Each forge tree is probed on its own, because presence is per tree — `--write` materializes only
// the default forge, so a `.opencode-gitlab/` an installer left behind is checked when it is there
// and skipped when it is not.
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
      [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), '--forge=' + forge, '--check'],
      { encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\nopencode-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-opencode-edition.js --forge=' + forge + ' --write'
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
// Self-provision: regenerate .opencode/ from tracked canonical sources before
// any assertion that reads it. In a clean worktree .opencode/ is fully absent
// (it is gitignored); sync --write populates agents, commands, hooks, AND the
// plugin from templates/opencode/plugins/. This makes the suite green from
// tracked sources alone with no manual seeding.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  // spawn-class: environment
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), '--write'],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('FATAL: sync-opencode-edition --write failed (test cannot proceed):');
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
// the writer actually put it. When they diverge this reds here, before ~570 tree reads fail one at
// a time and the file finally dies on an ENOENT with no verdict attached — which is what happened,
// measured, before this line resolved the same root the writer does.
assert(fs.existsSync(treeRootFor(sync.DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(sync.DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked '
  + 'nothing. This checkout is ' + REPO + '; the tree root resolved to ' + TREE_ROOT + '. If those '
  + 'differ, the writer put the tree somewhere else and the two resolutions have diverged');

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
// A0 — THE SUBJECT UNDER TEST IS THE GENERATOR, NOT THE TREE.
//
// This suite self-provisions by running `sync --write` above, so any assertion of the form
// `read(<generated>) === sync.render*(read(<canonical>))` compares a freshly regenerated artifact
// to its own source and CANNOT FAIL. Measured, not theorised: a generator mutated to ship every
// non-reviewer role contract as a 2-line stub instead of its full body passed this suite 442/442.
//
// So the assertions below are stated as PROPERTIES OF THE GENERATOR'S OUTPUT, derived from the
// TRACKED canonical sources at run time. They are deliberately not byte-pins on what the generator
// emits today: canonical moves, and the expectation moves with it.
//
// The identity comparisons are kept where they express a real if narrow property — the render is
// DETERMINISTIC across the --write subprocess and this process — and are relabelled to say only
// that, never "parity with canonical", which is the claim they cannot support.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(sync.OUT_AGENT_DIR) && fs.existsSync(sync.OUT_COMMAND_DIR);
  assert(provisioned,
    'A0: the generated tree exists after sync --write — an ABSENT tree must fail loudly here rather '
    + 'than let every readdir-driven loop below iterate over nothing');
  if (!provisioned) {
    // Stop here rather than let the first readdir throw: a stack trace three assertions later is a
    // worse report than one line naming the cause, and every count after it would be meaningless.
    console.error('FATAL: sync --write reported success but produced no tree at '
      + sync.OUT_AGENT_DIR + ' / ' + sync.OUT_COMMAND_DIR + ' — nothing below can be tested.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// A1/A2/A3: agents — every canonical agent is generated, model-agnostic, and
// permission-mapped from its canonical tool set.
// ---------------------------------------------------------------------------
const canonAgents = sync.listCanonAgents();
const genAgentFiles = fs.readdirSync(sync.OUT_AGENT_DIR).filter(f => f.endsWith('.md'));
assert(new Set(genAgentFiles.map(f => f.slice(0, -3))).size === canonAgents.length,
  'A1: .opencode/agent/ count matches canonical agent count (' + canonAgents.length + ')');
// A1-roster: the count above compares a just-regenerated tree against the roster that generated
// it, so it holds however wrong that roster is. The LIVE property is that the generator's roster
// predicate sees the whole TRACKED canonical inventory — read here independently of the generator.
{
  const trackedAgents = fs.readdirSync(path.join(REPO, 'agents'))
    .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(trackedAgents.length > 0,
    'A1-roster: the canonical agents/ inventory is non-empty — an empty enforcement domain would '
    + 'make every per-agent assertion in this file vacuously true');
  assert(JSON.stringify([...canonAgents].sort()) === JSON.stringify(trackedAgents),
    'A1-roster: listCanonAgents() is EXACTLY the tracked agents/*.md inventory — a role the '
    + 'predicate drops is a role that silently never ships; canonical=' + JSON.stringify(trackedAgents)
    + ' generator=' + JSON.stringify([...canonAgents].sort()));
}

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

// A3-domain: the `if (readOnly)` branch above fires for ZERO roles today (all 14 canonical roles
// grant Write), so on its own it is a conditional that reads like coverage and asserts nothing —
// and a tool-grant parse that broke and returned nothing would look exactly the same. Assert the
// partition instead of skipping it: recompute it here straight from the tracked frontmatter, with
// no generator function in the loop, so the emptiness is a stated fact and the moment a read-only
// role exists the branch above starts enforcing for real.
{
  const grantsWrite = name => {
    const line = (read('agents/' + name + '.md').match(/^tools:\s*(.+)$/m) || [])[1] || '';
    const t = line.replace(/[[\]"']/g, ' ').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    return t.includes('write') || t.includes('edit');
  };
  const independentReadOnly = canonAgents.filter(n => !grantsWrite(n)).sort();
  const generatorReadOnly = canonAgents.filter(n => {
    const set = new Set(sync.parseTools(sync.parseFrontmatter(read('agents/' + n + '.md')).fm.tools).map(t => t.toLowerCase()));
    return !set.has('write') && !set.has('edit');
  }).sort();
  assert(canonAgents.length > 0,
    'A3-domain: the canonical role set is non-empty (the A2/A3 loop above has something to enforce over)');
  assert(JSON.stringify(generatorReadOnly) === JSON.stringify(independentReadOnly),
    'A3-domain: the generator\'s tool-grant parse agrees with an independent read of the canonical '
    + '`tools:` frontmatter — generator=' + JSON.stringify(generatorReadOnly)
    + ', independent=' + JSON.stringify(independentReadOnly)
    + (independentReadOnly.length === 0
      ? ' (empty is the CORRECT answer for this roster and is asserted, not skipped)' : ''));
  for (const name of independentReadOnly) {
    const fmText = (read('.opencode/agent/' + name + '.md').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
    assert(/edit:\s*deny/.test(fmText),
      'A3-domain[' + name + ']: read-only role denies edit in its generated permission block');
  }
}

// ---------------------------------------------------------------------------
// A3-bash: the LIVE tool-restriction axis, asserted in BOTH directions.
//
// The edit axis above governs an empty set — every canonical role grants Write — so A3/A3-domain
// now carry exactly one property: that the tool-grant parse still agrees with the frontmatter, and
// that its emptiness is a stated fact rather than a silent skip. They no longer witness the
// generator emitting anything, because there is nothing for them to emit.
//
// The BASH axis is the one that ships. The generator writes `permission: bash: deny` for every
// canonical role that withholds Bash, and nothing asserted that until now: a regression in
// deniedPermissionAxes would ship those roles WITH shell access and every assertion in this file
// would stay green.
//
// BOTH directions, because a one-sided check passes a predicate that denies everything — deny-all
// is as wrong as deny-nothing and is the easier mistake to make. The expected partition is derived
// from the canonical frontmatter with a parser local to this file, so a bug in the generator's own
// parse cannot define the answer it is checked against, and a fourth restricted role is covered the
// day it is added rather than the day someone remembers to list it.
// ---------------------------------------------------------------------------
{
  const grants = (name, tool) => {
    const line = (read('agents/' + name + '.md').match(/^tools:\s*(.+)$/m) || [])[1] || '';
    return line.replace(/[[\]"']/g, ' ').split(/[,\s]+/)
      .map(s => s.trim().toLowerCase()).filter(Boolean).includes(tool);
  };
  const deniesBash = name => {
    const fmText = (read('.opencode/agent/' + name + '.md').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
    return /^\s*bash:\s*deny\s*$/m.test(fmText);
  };
  const restricted = canonAgents.filter(n => !grants(n, 'bash')).sort();
  const unrestricted = canonAgents.filter(n => grants(n, 'bash')).sort();

  // Non-vacuity on BOTH sides: with either partition empty this degrades to a one-directional
  // check, which is the failure mode it exists to avoid — so the emptiness would have to be said
  // out loud rather than inferred from a loop that quietly ran zero times.
  assert(restricted.length > 0,
    'A3-bash: at least one canonical role withholds Bash — an empty restricted set makes the '
    + 'deny-side assertion vacuous and the guard one-directional');
  assert(unrestricted.length > 0,
    'A3-bash: at least one canonical role grants Bash — an empty unrestricted set makes the '
    + 'must-NOT-deny assertion vacuous, which is what a deny-everything predicate needs to pass');

  // The generator's own predicate is checked against the independent partition, which also gives
  // deniedPermissionAxes a consumer.
  const generatorRestricted = canonAgents.filter(n => {
    const set = new Set(sync.parseTools(sync.parseFrontmatter(read('agents/' + n + '.md')).fm.tools).map(t => t.toLowerCase()));
    return sync.deniedPermissionAxes(set).includes('bash');
  }).sort();
  assert(JSON.stringify(generatorRestricted) === JSON.stringify(restricted),
    'A3-bash: deniedPermissionAxes() names the same Bash-withholding roles as the canonical '
    + 'frontmatter read independently — generator=' + JSON.stringify(generatorRestricted)
    + ', canonical=' + JSON.stringify(restricted));

  for (const name of restricted) {
    assert(deniesBash(name),
      'A3-bash[' + name + ']: canonical withholds Bash, so the generated agent MUST carry '
      + '`bash: deny` — without it this role ships with shell access on opencode');
  }
  for (const name of unrestricted) {
    assert(!deniesBash(name),
      'A3-bash[' + name + ']: canonical GRANTS Bash, so the generated agent must NOT deny it — a '
      + 'predicate that denies every role would satisfy the deny-side assertions above and fail here');
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
// A4-roster: the live property behind that count — the generator's command roster is EXACTLY the
// tracked commands/*.md inventory, read here without the generator (see A1-roster).
{
  const trackedCommands = fs.readdirSync(path.join(REPO, 'commands'))
    .filter(f => f.endsWith('.md')).sort();
  assert(trackedCommands.length > 0,
    'A4-roster: the canonical commands/ inventory is non-empty — an empty enforcement domain would '
    + 'make every per-command assertion in this file vacuously true');
  assert(JSON.stringify([...canonCommands].sort()) === JSON.stringify(trackedCommands),
    'A4-roster: listCanonCommands() is EXACTLY the tracked commands/*.md inventory; canonical='
    + JSON.stringify(trackedCommands) + ' generator=' + JSON.stringify([...canonCommands].sort()));
}
for (const file of canonCommands) {
  const rel = '.opencode/command/' + file;
  assert(exists(rel), 'A4[' + file + ']: generated command exists');
  const content = read(rel);
  assert(!/model="\{/.test(content),
    'A5[' + file + ']: no install-time model="{...}" placeholders remain');
}

// ---------------------------------------------------------------------------
// A14: model-prose consistency. opencode centralizes effort in opencode.json (no per-call
// model=), so EVERY surviving `model=` mention must be the "do NOT / Never pass" guidance.
//
// SCOPE, stated exactly. The universal over `model=` residue is NOT here — it is
// assertNoModelDispatchResidue in sync-opencode-edition.js, which hard-errors the render on any surviving
// mention (MODEL_MENTION is a bare /model=/, scanned over the whole surface, fences included).
// What remains here are the wordings canonical STILL carries, checked against the tracked tree so
// a rewrite that half-applies is caught by the suite as well as by the renderer. Two entries were
// removed with their subject: "Pass `model=dispatch.model`" and "include the explicit `model=`
// parameter" no longer appear in any canonical command, so both pinned a wording that is gone.
// ---------------------------------------------------------------------------
for (const file of canonCommands) {
  const content = read('.opencode/command/' + file);
  assert(!/MUST pass `model=|do not omit\s+the `model=` line/.test(content),
    'A14[' + file + ']: no "MUST pass model=" / "do not omit the model= line" instruction');
  assert(!/,,/.test(content),
    'A14[' + file + ']: no doubled-comma (,,) artifact from dispatch-card placeholder strip');
}

// ---------------------------------------------------------------------------
// A6: render DETERMINISM — the tree `sync --write` produced in a separate process equals what
// renderAgent produces here. That is the whole claim: this suite regenerated the tree moments ago,
// so this can never witness a disagreement with CANONICAL, only a renderer that is not a pure
// function of its input (a clock, a Set iteration order, an env read).
//
// A6-body is the armed half — see A0. The generated agent must still CARRY the canonical role
// contract, checked against tracked bytes with no generator function in the loop.
// ---------------------------------------------------------------------------
for (const name of canonAgents) {
  const expected = sync.renderAgent(read('agents/' + name + '.md'), name);
  assert(read('.opencode/agent/' + name + '.md') === expected,
    'A6[' + name + ']: renderAgent is deterministic across the --write subprocess and this process');
}

// A6-body: every non-empty line of the canonical role contract survives into the generated agent.
// The generator declares agent bodies VERBATIM apart from the Claude script-path rewrite, and that
// rewrite is a no-op on every current agent — measured: zero canonical body lines fail to survive,
// so the exemption set is EMPTY and any miss is a real transform, not a known one. A new body
// rewrite reds here on purpose: "one rule, one wording" makes a runtime divergence something to
// declare, and this is where an undeclared one surfaces.
{
  const bodyOf = text => {
    const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    return m ? text.slice(m[0].length) : text;
  };
  let checkedLines = 0;
  for (const name of canonAgents) {
    const canonLines = bodyOf(read('agents/' + name + '.md')).split('\n').map(s => s.trim()).filter(Boolean);
    const generated = read('.opencode/agent/' + name + '.md');
    const missing = canonLines.filter(line => !generated.includes(line));
    checkedLines += canonLines.length;
    assert(canonLines.length > 0,
      'A6-body[' + name + ']: the canonical role contract has a non-empty body — an empty one would '
      + 'make the survival check below vacuous');
    assert(missing.length === 0,
      'A6-body[' + name + ']: every canonical contract line survives into the generated agent — '
      + missing.length + ' of ' + canonLines.length + ' missing, first: '
      + JSON.stringify(String(missing[0]).slice(0, 120)));
  }
  assert(checkedLines > 0,
    'A6-body: the survival check covered at least one canonical contract line (scan bite)');
}

// Reviewer contracts retain deterministic normalized behavior identity through the OpenCode
// transform. This is a contract/profile assertion only: foundation-model findings and prose remain
// stochastic and are never promised to match across runtimes.
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const opencodeText = read('.opencode/agent/' + role + '.md');
  // behaviorIdentityFromCore THROWS on a body whose behavior-core markers are gone. Measured: a
  // generator that drops the reviewer body aborts this file mid-run with a stack trace, so every
  // assertion after this point is never reached and the failure count is a lie. Catch it into a
  // clean FAIL — the same shape as the identity assertions below, which is what a reader trusts.
  let opencode = null;
  try { opencode = reviewerGenerator.behaviorIdentityFromCore(opencodeText); } catch (e) {
    assert(false, `A6-reviewer[${role}]: the generated agent still carries an extractable behavior core — ${e.message}`);
    opencode = { role: null, behavior_contract_version: null, behavior_contract_hash: null, core: null };
  }
  assert(opencode.role === canonical.role
    && opencode.behavior_contract_version === canonical.behavior_contract_version
    && opencode.behavior_contract_hash === canonical.behavior_contract_hash,
  `A6-reviewer[${role}]: OpenCode agent retains normalized reviewer behavior identity`);
  assert(opencode.core === canonical.core,
    `A6-reviewer[${role}]: OpenCode transform preserves reviewer behavior-core bytes`);
  // #708: the opencode reviewer profile carries its OWN re-stamped resolved_profile_hash (over the
  // transformed opencode bytes), so the stamp binds the profile that actually ships. The runtime
  // resolver that once read it back retired with the node executor — this suite is its consumer now. The hash must be present, valid (verifyResolved
  // ProfileHash throws on mismatch), and DIFFERENT from the Claude hash (the bytes differ). Without
  // it, every review-gated adaptive plan on opencode hard-refuses at open-next with
  // review_profile_identity_unavailable.
  const ocHash = (opencodeText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(ocHash && /^[0-9a-f]{64}$/.test(ocHash),
    `A6-reviewer[${role}]: OpenCode reviewer carries a valid resolved_profile_hash`);
  // Bare, this THROWS on a bad hash and kills the run — a verdict nobody counted. The kimi twin
  // already catches it into an assertion; this is that shape.
  let ocHashVerifies = true;
  try { reviewerGenerator.verifyResolvedProfileHash(opencodeText); } catch (_) { ocHashVerifies = false; }
  assert(ocHashVerifies,
    `A6-reviewer[${role}]: resolved_profile_hash verifies over the opencode bytes (zeroed-self sha256)`);
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

// #708 END-TO-END, RETIRED WITH ITS CONSUMER. The reviewer profile hash was re-stamped over the
// opencode bytes so `resolveReviewerProfileIdentity` could bind a schema-2 review receipt to the
// exact profile that produced it, and this block drove that resolver against the installed tree.
// The resolver lived in the node executor and went with it, along with the review receipts it
// bound. The re-stamped hash itself is still generated and still checked above (A6-reviewer:
// present, valid under verifyResolvedProfileHash, and distinct from the Claude hash); what is no
// longer covered is any CONSUMER resolving that hash back to a profile, because there is none.

// A13: the retired roles must not be regenerated onto this runtime. `workflow-planner` carried the
// mapTier effort-tier guidance through `opencodeAgentSuffix` — the one agent whose opencode body
// was not verbatim; the planner role is retired, so both the role and its suffix are gone and the
// remaining claim is that EVERY agent body is now verbatim.
for (const retired of ['contractor.md', 'workflow-planner.md']) {
  assert(!fs.existsSync(path.join(TREE_ROOT, '.opencode', 'agent', retired)),
    'A13: the retired role ' + retired + ' must not ship on the opencode edition');
}
assert(sync.opencodeAgentSuffix('implementer') === ''
  && sync.opencodeAgentSuffix('code-reviewer') === '',
  'A13: opencodeAgentSuffix is empty for every surviving role — no agent body is rewritten');
// Same reading as the agent loop above: render DETERMINISM, not parity with canonical. Command
// bodies carry several DECLARED transforms (model-dispatch strip, placeholder strip, runtime
// rewrite, script-path rewrite), so a blanket line-survival rule of the A6-body kind would be a
// pin on the current transform set rather than a property. What holds the command surface honest is
// the content-reachability band instead — A14/A16/A22/A24/S2/A25 assert the PINs, wiring literals,
// template bytes and banned tokens directly against the generated files.
for (const file of canonCommands) {
  const expected = sync.renderCommand(read('commands/' + file));
  assert(read('.opencode/command/' + file) === expected,
    'A6[' + file + ']: renderCommand is deterministic across the --write subprocess and this process');
}

// ---------------------------------------------------------------------------
// A24 (#572, tightened by #812): the generated opencode workflow-init carries the
// re-grounded adaptive ## Kaola-Workflow template — phase-free (no retired
// numbered-phase model, no "phase file/artifact" framing) AND BYTE-IDENTICAL to the
// canonical GitHub template. The template is runtime-neutral AT THE SOURCE, so there is
// no longer any template-region rewrite to except: parity is exact, not modulo.
// .opencode/ is fully gitignored, so the four-chain contract validators must not read
// it — this is the opencode-edition home for the #572 ban + parity (regenerate via
// --write).
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
  // EXACT parity: transformCommandBody applies zero template-region rewrites (#812).
  const canonTpl = extractTemplate(read('commands/workflow-init.md'), 'canonical-github');
  assert(ocTpl === canonTpl,
    'A24 (#812): opencode workflow-init template is BYTE-IDENTICAL to the canonical GitHub template (no template-region rewrite exists)');
  // Vendor/runtime leak ban at the injected-template level: the block is written into a
  // CONSUMER repo and read by every runtime, so it names no vendor, no model, and no
  // command that does not resolve on the reader's runtime.
  assert(!/\bClaude\b|\bOpus\b|\bSonnet\b|\/workflow-next|\/goal|Stop-hook/.test(canonTpl),
    'A24 (#812): the injected consumer template must name no vendor, model, or runtime-specific command');
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

// #1018 / ADR 0019: fable classifies as reasoning so planner/code-architect stay
// on the per-role override list after they re-tier from opus to fable. The
// live roleTier('opus')-only branch would silently drop them to standard.
assert(sync.roleTier('fable') === 'reasoning',
  'A8-fable: roleTier(fable) classifies as reasoning, not standard');
assert(sync.roleTier('opus') === 'reasoning',
  'A8-fable: roleTier(opus) remains reasoning');
assert(sync.roleTier('sonnet') === 'standard',
  'A8-fable: roleTier(sonnet) remains standard');
assert(reasoning.includes('planner') && reasoning.includes('code-architect'),
  'A8-fable: planner and code-architect stay on the per-role override list — got [' + reasoning.join(' , ') + ']');

// A12 / S1-contract / A12-options — DELETED WITH THEIR MECHANISM. Per-role effort tiering is
// removed, so every subject these three bands read is gone:
//
//   A12            pinned `topTierRoles()` / `standardTierRoles()` — the role→tier split itself.
//   S1-contract    pinned `effortForProvider` / `contractForProvider` — the provider→API-contract
//                  resolver and its per-contract effort payloads.
//   A12-options    pinned `renderOpencodeJson({inheritModel})`'s `agent.<role>.options` payload per
//                  contract, that the two tiers stayed distinct, that no `variant`/`variants` key
//                  survived beside it, and the subagent-criterion half.
//
// With them go their two private helpers, `stableJson` and `deepHasKey`, which had no other caller
// once A26 went, and the two prior deletion notes about the `variant`-era assertions those bands
// replaced — a note about a deletion inside a band that is itself deleted documents nothing.
//
// WHY, IN ONE LINE, SO A LATER READER DOES NOT RE-ADD THEM: opencode already hands a dispatched
// subagent the parent session's effort whenever the role pins no model, measured end to end. The
// tiers were an override of correct native behaviour, not a repair, and configuration that does
// nothing but reads as live is what hid the original defect for as long as it existed.
//
// NOT LOST WITH THEM — asserted elsewhere, on machinery that survives:
//   · the reasoning-role SET is still pinned, by A8, against `reasoningRoles()` through the opt-in
//     model-pin path (`renderNeutralConfig`), which is a different feature and stays;
//   · the default render still pins NO top-level `model` and NO `agent` block — A8 again, and that
//     assertion is now the whole of what a default install emits;
//   · the plugin's surviving hooks and its single-export loader contract — A29.

// ---------------------------------------------------------------------------
// A9: route-reachability — every receipt-emitted command target resolves to an
// installed opencode command surface (the #400 guarantee, for the opencode
// edition). Mirrors test-route-reachability.js T2, scoped to .opencode/command.
// ---------------------------------------------------------------------------
// The target set is DERIVED from the generated-surface registry — the same TOPICS table that
// renders the surfaces — exactly as test-route-reachability.js T2 does. It used to be the two
// schema constants `PLAN_RUN_COMMAND` / `ADAPT_COMMAND`; both name commands that no longer exist,
// and a hand-typed pair is how a suite ends up asserting reachability for a surface nobody ships.
const { TOPICS: ROUTING_TOPICS } = require('./generate-routing-surfaces.js');
const emittedCommandTargets = Object.keys(ROUTING_TOPICS).sort()
  .map(t => ROUTING_TOPICS[t].command_basename);
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

  // A15, A17, A18, A19 — RETIRED WITH THEIR CARRIERS. All four pinned markers on
  // `kaola-workflow-plan-run` and `kaola-workflow-adapt`, and both commands are gone: the
  // frontier unit (A15) and the leg-isolation recipe (A18) belonged to the node scheduler, the
  // speculative-open card (A19) to `--speculative-consent`, and the claim-escalate pin (A17) to
  // the adapt surface. None has a surviving carrier; a repo-wide sweep of `commands/` finds only
  // `consent-in-conversation`, `sink-reports-orchestrator-owns` and `closure-audit`.

  // A16 (mirror T6): finalize carries the closure-audit PIN + literal (#496/#497).
  assert(has('kaola-workflow-finalize', '<!-- PIN: closure-audit -->'),
    'A16: finalize must contain <!-- PIN: closure-audit --> comment');
  assert(has('kaola-workflow-finalize', 'closure-audit'),
    'A16: finalize must contain "closure-audit" literal');

  // A16b: the two pins that REPLACED them, locked in on the same fail-closed shape. The sink
  // reports and the orchestrator owns the outcome; consent is a conversation with the user.
  assert(has('kaola-workflow-finalize', '<!-- PIN: sink-reports-orchestrator-owns -->'),
    'A16b: finalize must contain <!-- PIN: sink-reports-orchestrator-owns --> comment');
  for (const name of ['kaola-workflow-finalize', 'workflow-init', 'workflow-next']) {
    assert(has(name, '<!-- PIN: consent-in-conversation -->'),
      'A16b[' + name + ']: must contain <!-- PIN: consent-in-conversation --> comment');
  }

  // A20 (mirror T10) — RETIRED (#725 Phase D). The dormant fast-compliance-backstop PIN +
  // `fast_compliance_unresolved` legacy backstop on finalize was removed with the deleted fast path
  // (no project left for it to fire against), so there is nothing to lock in on the generated finalize
  // surface; retired alongside its manifest block and SUPERSET-PROOF entry.

  // A21 (mirror T11) — DELETED IN FULL. Both surfaces it probed
  // (`kaola-workflow-phase1`, `kaola-workflow-fast`) are 100% n2-deleted canonical
  // commands, and a repo-wide sweep confirms the `adaptive-default-contract` PIN
  // they carried has NO surviving surface post-retirement (it lived only on those
  // two files). Nothing to lock in; retired alongside its only carriers.
}

// S2 fixed model/effort-section assertions were deleted with the retired per-dispatch model
// mechanism. The opencode edition now inherits the session model; claim facts and Mission List
// resume context are exercised by A29 below.
// ---------------------------------------------------------------------------
// A22 (issue #539; strips retired by #962): opencode path-flip. opencode is
// adaptive-only-default, and post-#538 canonical is too: no canonical command
// carries the "## Startup Step 0a-1 — Path Intent" section, its
// KAOLA_ENABLE_ADAPTIVE switch-resolution or Branch A/B path-selection prose, or
// the adapt repair-loop "downgrade to full path" / "fall back to full"
// auto-fallback wording. The generation-time strips that once removed them
// matched nothing and are deleted (#962), so a canonical reintroduction of any
// of these patterns would flow through transformCommandBody UNTOUCHED and reach
// the generated opencode surface. These assertions are that canary — they no
// longer lock a strip-transform; they red on canonical drift.
// ---------------------------------------------------------------------------
{
  const wfNext = read('.opencode/command/workflow-next.md');
  assert(!wfNext.includes('## Startup Step 0a-1 — Path Intent'),
    'A22: workflow-next has NO "## Startup Step 0a-1 — Path Intent" section (absent from canonical, and no generation-time strip remains — a hit means canonical reintroduced it and it flowed through untouched; fix canonical)');
  assert(!wfNext.includes('KAOLA_ENABLE_ADAPTIVE'),
    'A22: workflow-next has NO KAOLA_ENABLE_ADAPTIVE switch-resolution prose (absent from canonical; no strip remains, so a hit is a canonical reintroduction reaching the generated surface — fix canonical)');
  assert(!/### Branch [AB]\b/.test(wfNext),
    'A22: workflow-next has NO Branch A/B path-selection prose (absent from canonical; no strip remains, so a hit is a canonical reintroduction reaching the generated surface — fix canonical)');
  // A22 (#540): inline "(Step 0a-1)" parentheticals once survived the SECTION strip and needed
  // a dedicated inline strip (3 dangling mentions at L72/L159/L464 before #540). Post-#538 the
  // step does not exist anywhere in canonical, so that inline strip matched nothing and is
  // deleted with the rest (#962); any literal here now means canonical grew one back.
  assert(!wfNext.includes('Step 0a-1'),
    'A22: workflow-next has NO "Step 0a-1" inline references (post-#538 the step no longer exists and no inline strip remains — a hit is a canonical reintroduction reaching the generated surface, #540)');
  // A22 (#F7): content-anchored leak canaries. These phrases were Path-Intent-section BODY
  // literals — content a heading-keyed check cannot see. Today no canonical command carries
  // them (the section itself is gone post-#538) and no strip remains to eat a reintroduction,
  // so a hit means path-selection prose re-entered canonical under ANY heading and reached the
  // generated surface.
  for (const canary of ['path-name verbal escapes', 'fast path', 'full review']) {
    assert(!wfNext.includes(canary),
      'A22 (#F7): workflow-next has NO "' + canary + '" — a Path-Intent body literal absent from canonical; a hit means path-selection prose re-entered canonical and flowed through generation untouched');
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
  // The needle is scoped to ONE line: the pointer sentence wraps in canonical, so a needle
  // spanning the wrap would be pinning the line-break rather than the rule.
  assert(wfNext.includes('Principles axioms (the `## First Principles` block'),
    'A25 (#645): opencode workflow-next must carry the First Principles axiom pointer (shared-body reference line)');
  assert(wfNext.includes('applied in priority order'),
    'A25 (#645): opencode workflow-next must carry the priority-order clause');
  // The companion tighten-only clause ("never cite one to skip a typed gate") is RETIRED with the
  // typed gates it protected: there is no gate an axiom could be cited to skip. What replaced it —
  // the derivation being useful and never required — is not a tighten-only rule and is not pinned
  // as one.
  // A26 (#646, updated #789): the {ISSUE_SCOUT_MODEL} placeholder and the issue-scout dispatch it
  // named are retired entirely — the no-target survey folded into the workflow-planner (dispatched
  // by the separate adapt surface), so workflow-next carries no agent dispatch of its own at all.
  // Assert the retired vocabulary never resurfaces on the generated opencode surface.
  assert(!wfNext.includes('ISSUE_SCOUT_MODEL'),
    'A26 (#646): opencode workflow-next must NOT leak the {ISSUE_SCOUT_MODEL} placeholder (retired)');
  assert(!wfNext.includes('issue-scout'),
    'A26 (#789): opencode workflow-next must NOT carry any retired issue-scout dispatch prose');
  // The generated command surface (post-render at install) must read cleanly too: the reworded
  // scout note drops the dangling "this placeholder" phrasing, which has no referent once
  // install.sh renders {ISSUE_SCOUT_MODEL} to a concrete model (the model above is then in view).
  assert(!read('commands/workflow-next.md').includes('this placeholder'),
    'A27 (obs1): generated commands/workflow-next.md must NOT carry the dangling "this placeholder" phrasing (no referent post-render)');

  // A22 (#F6, updated #765): no path-fallback wording on ANY generated opencode command. The
  // check used to be scoped to the adapt surface, which is gone; the ban itself is not about that
  // one file, so it now sweeps every generated command — strictly wider than before.
  {
    const fallback = /(?:downgrade to (?:fast\/full|full path)|fall back to (?:fast\/full|full path|full))/g;
    for (const file of genCommandFiles) {
      const found = read('.opencode/command/' + file).match(fallback) || [];
      assert(found.length === 0,
        'A22 (#F6): ' + file + ' carries NO fast/full downgrade/fallback wording (the paths are retired, #765) — found: ' + found.join(', '));
    }
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
// A11: compact-resume plugin — present and syntactically valid (opencode loads
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
    // spawn-class: environment
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
  assert(src.includes('experimental.session.compacting'),
    'A11: plugin registers the surviving compaction hook');
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
    // spawn-class: environment
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
// A-prune: --write is an idempotent MIRROR, not an append-only writer. A retired
// command/agent surface (a *.md whose canonical source was deleted — e.g. the
// fast/full `kaola-workflow-fast` / `-phase{1..5}` commands) must be REMOVED, and
// --check must flag it (the generator previously wrote canonical surfaces but never
// pruned, so --check reported parity while a stale surface lingered in the tree).
// Crash-safe: the transient probe is removed in a finally block.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const probe = path.join(TREE_ROOT, '.opencode', 'command', 'kaola-workflow-__kw_retired_probe.md');
  // spawn-class: environment
  const runSync = (flag) => spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), flag], { encoding: 'utf8' });
  try {
    fs.writeFileSync(probe, '# transient retired-surface probe — must not persist\n');
    // (a) --check flags the retired surface: non-zero exit, names the offender.
    const chk = runSync('--check');
    assert(chk.status !== 0,
      'A-prune(a): --check must exit NON-ZERO when a retired *.md surface is present in .opencode/command/');
    assert(((chk.stdout || '') + (chk.stderr || '')).includes('__kw_retired_probe'),
      'A-prune(a): --check output must name the retired surface');
    // (b) --write prunes it: the file is gone and --check returns to 0.
    runSync('--write');
    assert(!fs.existsSync(probe),
      'A-prune(b): --write must REMOVE the retired surface (idempotent mirror)');
    assert(runSync('--check').status === 0,
      'A-prune(b): --check exits 0 after the retired surface is pruned');
  } finally {
    try { fs.unlinkSync(probe); } catch (_) { /* best-effort cleanup */ }
  }
}

// ---------------------------------------------------------------------------
// P1 + A (issue #543) + the folded #544 Claude path-leak fix. Hermetic per
// sub-case: each provisions its OWN fresh temp HOME + temp --target under
// os.tmpdir() ($TMPDIR), runs the REAL install-opencode.sh, then inspects the
// deployed tree + the seeded ~/.config/kaola-workflow/config.json.
//
// #725 Phase A: the fast/full install-time OPT-IN PARTITION itself is retired
// (canonical no longer ships `kaola-workflow-fast.md` / `kaola-workflow-phase[1-5].md`
// — n2-deleted, so nothing exists for a --with-fast/--with-full opt-in to deploy).
// The former P2–P6/U1 opt-in-partition probes (--with-fast deploys fast,
// --with-full deploys phase1-5, UNION-preserve on reinstall, self-healing prune
// of orphaned opt-in files) are DELETED IN FULL — same "DELETED IN FULL" pattern
// n6-routing.js applied to test-route-reachability.js's T10/T11/T18: every
// surface those probes exercised is gone, so there is nothing left to lock in.
// install-opencode.sh itself still parses the `--with-fast`/`--with-full` flags
// (an unowned, deferred write-set gap — n1-recon GAP-3 — out of this node's
// scope) but they are now inert for command deployment: the adaptive-only
// surface is the only reachable outcome, which is exactly what P1 below locks in.
// U1 is RETAINED, narrowed to a pure adaptive-only install → uninstall →
// reinstall round-trip (drops the --with-fast seeding/assertions; the
// uninstall-preserves-config / reinstall-restores-adaptive-core behavior it
// verifies is still real and still exercised without any fast dependency).
//
// Adaptive-core set per issue #543 (the unconditional default install, and now
// the ONLY install outcome):
//   kaola-workflow-adapt, kaola-workflow-finalize,
//   kaola-workflow-plan-run, workflow-init, workflow-next.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } = require('fs');
  const os = require('os');

  const INSTALLER = path.join(REPO, 'install-opencode.sh');
  // Issue #1032: the retired dispatch hook must remain in the installer's bounded list, and both
  // cleanup paths must consume that list. Inspect the shipped source directly; no real home is
  // needed and a hard-coded cleanup path cannot satisfy these assertions.
  const installerSource = readFileSync(INSTALLER, 'utf8');
  const retiredHooks = installerSource.match(/\bRETIRED_HOOKS\s*=\s*\(([^)]*)\)/);
  const hasRetiredHookCleanup = body => {
    const loop = String(body).match(/^[ \t]*for[ \t]+retired[ \t]+in[^\n]*RETIRED_HOOKS[^\n]*;[ \t]*do[ \t]*\n([\s\S]*?)^[ \t]*done[ \t]*$/m);
    return !!loop && /\brm\s+-f\b/.test(loop[1]) && /\$retired\b/.test(loop[1]) && /hooks/.test(loop[1]);
  };
  const installStart = installerSource.indexOf('copy_tree() {');
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

  // F5: partition exhaustiveness — the canonical command set must be EXACTLY adaptive-core (the
  // fast/full opt-in partitions are retired; adding a new canonical command without accounting
  // for it here fails HERE, and the installer still fails CLOSED on an unrecognized command).
  {
    const canon = sync.listCanonCommands().map(f => f.replace(/\.md$/, '')).sort();
    assert(JSON.stringify(canon) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'F5: canonical commands == adaptive-core exactly (fast/full opt-in partitions retired) — canon=' + JSON.stringify(canon));
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
    // `opts.installer` runs a COPY of this checkout instead of this checkout (P7 below): the state
    // some cases need is a state of the SOURCE tree, and mutating this one is not on offer.
    // spawn-class: environment
    const r = spawnSync('bash', [opts.installer || INSTALLER].concat(args), {
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
  const clean = r => {
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(r.dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  };

  // P1 — install deploys adaptive-core, exactly, and never touches the user-owned shared config.
  {
    const r = runInstaller([]);
    assert(r.ok,
      'P1: default install-opencode.sh exits 0 (got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
      assert(hasCmd(r.dest, name),
        'P1[' + name + ']: default install deploys the adaptive-core command');
    }
    // P1 (#F5): exact-set-equality (over-deploy guard) — the dest command dir holds EXACTLY the
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
    assert(!existsSync(r.configPath),
      'P1: default install must not create ~/.config/kaola-workflow/config.json (user-owned; the\n      workflow has no install-time configuration)');
    clean(r);
  }

  // -------------------------------------------------------------------------
  // P7 (#973) — AN INSTALL DOES NOT REMOVE A DEPLOYED COMMAND IT IS NOT GOING TO
  // REPLACE.
  //
  // The command deploy is prune-then-recopy over a dir shared with the user's own
  // commands. The prune is namespace-wide over the DESTINATION; the recopy is
  // whatever the generated tree renders AND the deploy allowlist accepts. When
  // the second set is smaller, the difference is destroyed — and here nothing at
  // all notices: the agent deploy fails closed on an empty source, but it runs
  // BEFORE the command prune and says nothing about commands, and no count is
  // checked over the commands themselves. Measured against a destination holding
  // the deployed set: 3 → 0, exit 0, "Installed workflow agents+commands+…"
  // printed, three `warning:` lines on stderr.
  //
  // P7a asserts no exit code. An install that refuses BEFORE pruning removes
  // nothing either; what is left on disk is the whole property.
  //
  // P7b/P7c pin what the prune is FOR and pass here by construction — a repair
  // that narrows the prune to the deploy set loses the first, and one that defers
  // the removal past the copy loses the second.
  // -------------------------------------------------------------------------
  {
    const routing = require('./generate-routing-surfaces.js');
    // `.git` is deliberately absent and that is load-bearing: the installer regenerates the tree it
    // deploys from, the generator writes that tree at the MAIN checkout when one resolves, and a
    // copied gitdir pointer resolves to this repository — so a copy carrying `.git` would rewrite
    // the real tree from mutated canonical sources. `kaola-workflow/` is run state, skipped for size.
    const COPY_SKIP = new Set(['.git', 'kaola-workflow', 'node_modules']);
    function sourceCopy(tag) {
      const dir = fs.realpathSync(mkdtempSync(path.join(os.tmpdir(), 'opencode-p7-src-' + tag + '-')));
      for (const entry of readdirSync(REPO)) {
        if (COPY_SKIP.has(entry)) continue;
        // spawn-class: environment
        const r = spawnSync('cp', ['-R', path.join(REPO, entry), path.join(dir, entry)], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('P7 fixture: cp -R ' + entry + ' failed — ' + r.stderr);
      }
      // A THROW, not an assert: a copy whose generated tree resolves anywhere but itself must never
      // reach the installer, because the install refreshes that tree first. Failing the run is the
      // point — a recorded assertion would let the destructive install happen anyway.
      // spawn-class: environment
      const probe = spawnSync('node', [path.join(dir, 'scripts', 'sync-opencode-edition.js'), '--print-tree-root'],
        { encoding: 'utf8' });
      let treeRoot = String(probe.stdout || '').trim();
      try { treeRoot = fs.realpathSync(treeRoot); } catch (_) { /* report it raw */ }
      if (probe.status !== 0 || treeRoot !== dir) {
        try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
        throw new Error('P7 fixture: refusing to install from a copy whose generated tree lands outside it'
          + ' (status ' + probe.status + ', tree root ' + JSON.stringify(treeRoot) + ')');
      }
      return dir;
    }
    const plantedBody = name => 'PLANTED ' + name + ' — on disk BEFORE the install\n';
    function plantCommands(names) {
      const dest = mkdtempSync(path.join(os.tmpdir(), 'opencode-p7-dest-'));
      fs.mkdirSync(cmdDir(dest), { recursive: true });
      for (const name of names) fs.writeFileSync(path.join(cmdDir(dest), name), plantedBody(name));
      return dest;
    }
    const deployedCmds = dest => readdirSync(cmdDir(dest)).filter(f => f.endsWith('.md')).sort();

    // P7a — the rendered commands fall OUTSIDE the deploy allowlist. That allowlist is hand-held
    // and no generator feeds it, so a command basename that moves in the routing registry renders a
    // valid command the install skips — after pruning the deployed one. Registry row and file move
    // together, which is what a rename in the registry does.
    {
      const src = sourceCopy('a');
      const USER_OWNED = 'my-own-command.md';
      const dest = plantCommands([...ADAPTIVE_CORE.map(n => n + '.md'), USER_OWNED]);
      try {
        const registry = path.join(src, 'scripts', 'generate-routing-surfaces.js');
        const before = readFileSync(registry, 'utf8');
        const after = before.replace(/command_basename: '([a-z0-9-]+)'/g, "command_basename: 'zz-$1'");
        if (after === before) throw new Error('P7a fixture: no command_basename row to move in the routing registry');
        fs.writeFileSync(registry, after);
        for (const row of routing.GENERATED_SURFACES.filter(s => s.surface_type === 'command')) {
          const from = path.join(src, row.path);
          fs.renameSync(from, path.join(path.dirname(from), 'zz-' + path.basename(from)));
        }
        assert(deployedCmds(dest).length === ADAPTIVE_CORE.length + 1,
          'P7a (fixture): the destination holds the full deployed set before the install — a '
          + 'destination that was short to begin with cannot observe anything being removed');
        const r = runInstaller([], { dest, installer: path.join(src, 'install-opencode.sh') });
        const rendered = readdirSync(path.join(src, '.opencode', 'command')).sort();
        assert(ADAPTIVE_CORE.every(n => !rendered.includes(n + '.md')) && rendered.some(n => n.startsWith('zz-')),
          'P7a (fixture): the mutated source renders the commands under names the deploy allowlist '
          + 'does not hold — got ' + JSON.stringify(rendered));
        const lost = ADAPTIVE_CORE.filter(n => !existsSync(path.join(cmdDir(dest), n + '.md')));
        assert(lost.length === 0,
          'P7a (#973): a deployed command the install is NOT going to replace is still on disk '
          + 'afterwards — destroyed: ' + (lost.join(', ') || '(none)') + ', install exited ' + r.status);
        assert(existsSync(path.join(cmdDir(dest), USER_OWNED)),
          'P7a: the user-owned command in the same dir is untouched either way');
        clean(r);
      } finally {
        try { rmSync(src, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // P7b — WHAT THE NAMESPACE PRUNE IS FOR, and the half a narrowing repair loses. A command
    // retired in an earlier release is cleared from a LIVE install by this prune and by nothing
    // else. The scope is pinned WITH the sweep, because a prune that reaches further is the worse
    // defect and the sweep half cannot see it: the command dir is SHARED with the user's own.
    {
      const RETIRED = ['kaola-workflow-adapt.md', 'kaola-workflow-plan-run.md'];
      const KEPT = ['my-own-command.md', 'notes.txt'];
      const dest = plantCommands([...ADAPTIVE_CORE.map(n => n + '.md'), ...RETIRED, ...KEPT]);
      try {
        // Anti-vacuity, both directions: a retired name back in the deploy set would be REPLACED
        // rather than swept, and a kept name that joined it would survive because it was deployed.
        const deploySet = ADAPTIVE_CORE.map(n => n + '.md');
        assert(RETIRED.every(n => !deploySet.includes(n)) && KEPT.every(n => !deploySet.includes(n)),
          'P7b: no planted name is in the deploy set — a name that is deployed is not evidence about '
          + 'the prune at all');
        const r = runInstaller([], { dest });
        assert(r.ok, 'P7b: install over a populated command dir exits 0 (got status ' + r.status
          + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
        const left = RETIRED.filter(n => existsSync(path.join(cmdDir(dest), n)));
        assert(left.length === 0,
          'P7b: a command retired in an earlier release is SWEPT from a live install — still on '
          + 'disk: ' + left.join(', '));
        for (const n of KEPT) {
          assert(existsSync(path.join(cmdDir(dest), n))
            && readFileSync(path.join(cmdDir(dest), n), 'utf8') === plantedBody(n),
            'P7b: the sweep is SCOPED — ' + n + ', which this edition neither ships nor ever shipped, '
            + 'survives byte-intact in the shared command dir');
        }
        // The sweep is only evidence alongside a real deploy: a run that swept everything and
        // deployed nothing would satisfy the assertions above.
        const missing = ADAPTIVE_CORE.filter(n => !hasCmd(dest, n));
        assert(missing.length === 0,
          'P7b: the same install still deploys the whole command set — missing: ' + missing.join(', '));
        clean(r);
      } finally {
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // P7c — A REINSTALL STILL UPDATES. The deployed file must carry the SOURCE bytes afterwards, so
    // a repair that keeps a stale command in place rather than replacing it reds here.
    {
      const dest = plantCommands(ADAPTIVE_CORE.map(n => n + '.md'));
      try {
        const r = runInstaller([], { dest });
        assert(r.ok, 'P7c: reinstall over a populated command dir exits 0 (got status ' + r.status
          + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
        const stale = ADAPTIVE_CORE.filter(n => {
          const live = path.join(cmdDir(dest), n + '.md');
          const source = path.join(TREE_ROOT, '.opencode', 'command', n + '.md');
          return !existsSync(live) || !fs.readFileSync(live).equals(fs.readFileSync(source));
        });
        assert(stale.length === 0,
          'P7c: after the install every deployed command carries the SOURCE bytes, not the ones that '
          + 'were there before — stale: ' + stale.join(', '));
        clean(r);
      } finally {
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }
  }

  // P2–P5 (former --with-fast / --with-full / union-preserve opt-in-partition probes)
  // — DELETED IN FULL. #725 Phase A retires the fast/full opt-in partition itself;
  // every surface these probed (kaola-workflow-fast.md, kaola-workflow-phase[1-5].md)
  // is n2-deleted from canonical, so there is nothing left to opt into or lock in.

  // -------------------------------------------------------------------------
  // P8 (#977) — A REINSTALL CLEARS A RETIRED HOOK. The tracked-era .opencode
  // shipped hook scripts the root tree has since retired, so a real install can
  // carry one; commands and support scripts both self-heal on reinstall, and a
  // hook must too — otherwise the residue survives EVERY future install. The pin
  // is the disk outcome only: HOW the install identifies a retired hook is the
  // implementer's (this dir is installer-created, but whether the sweep is an
  // allowlist like the scripts dir or a retired-name list is not decided here).
  // -------------------------------------------------------------------------
  {
    const RETIRED_HOOK = 'kaola-workflow-pre-commit.sh';
    const r1 = runInstaller([]);
    assert(r1.ok, 'P8: seed install exits 0 (got status ' + r1.status
      + (r1.stderr ? ' — ' + String(r1.stderr).split('\n')[0] : '') + ')');
    const hooksDir = path.join(r1.dest, '.opencode', 'hooks');
    // Anti-vacuity: a hook back in the deploy set would be REPLACED rather than swept.
    assert(!sync.HOOK_SCRIPTS.includes(RETIRED_HOOK),
      'P8: the planted hook is not in the deploy set — a name that is deployed is not evidence '
      + 'about any sweep (deploy set: ' + JSON.stringify(sync.HOOK_SCRIPTS) + ')');
    fs.writeFileSync(path.join(hooksDir, RETIRED_HOOK),
      '#!/usr/bin/env bash\n# shipped by an older release\n');
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'P8: reinstall over a live install exits 0 (got status ' + r2.status
      + (r2.stderr ? ' — ' + String(r2.stderr).split('\n')[0] : '') + ')');
    // The sweep is only evidence alongside a real deploy.
    const missingHooks = sync.HOOK_SCRIPTS.filter(h => !existsSync(path.join(hooksDir, h)));
    assert(missingHooks.length === 0,
      'P8: the same install still deploys every current hook — missing: ' + missingHooks.join(', '));
    assert(!existsSync(path.join(hooksDir, RETIRED_HOOK)),
      'P8 (#977): a hook retired in an earlier release is removed on reinstall — '
      + RETIRED_HOOK + ' is still on disk after it');
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
    // spawn-class: environment
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
    // spawn-class: environment
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
  // S1b (#965) — INSTALLING PRUNES. S1 above asks only whether every manifest
  // script is PRESENT, which a pure copy-forward always satisfies; nothing asks
  // whether anything ELSE is there. So a config home carrying support scripts
  // from an older release keeps them for good, and the deployed set drifts up
  // release by release — measured on a real machine after an all-PASS
  // install-all: a 17-script manifest against 30 .js files on disk, the extras
  // being scripts whose source is gone from the tree (adaptive-node, autopilot,
  // next-action, …). install.sh removes exactly these ("Remove stale support
  // scripts not present in source."); this edition never learned to.
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
  // -------------------------------------------------------------------------
  {
    const cfg = mkdtempSync(path.join(os.tmpdir(), 'opencode-s1b-cfg-'));
    const scriptsDir = path.join(cfg, 'kaola-workflow', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    // Planted BEFORE the installer runs — this is an upgrade over an older install,
    // which is the only way the stale set is ever reached. RETIRED is a real name
    // this workflow shipped and deleted; the other two are what a user might leave
    // in the same directory.
    const RETIRED = 'kaola-workflow-adaptive-node.js';
    const USER_JS = 'my-local-helper.js';
    const USER_KEPT = 'notes.md';
    const KEPT_BODY = 'notes the installer never wrote\n';
    fs.writeFileSync(path.join(scriptsDir, RETIRED), '// shipped by an older release\n');
    fs.writeFileSync(path.join(scriptsDir, USER_JS), '// user-authored\n');
    fs.writeFileSync(path.join(scriptsDir, USER_KEPT), KEPT_BODY);

    const r = runGlobalInstaller([], { cfg, withScripts: true });
    assert(r.ok, 'S1b: --global install (with scripts) over an already-populated scripts dir exits 0 '
      + '(got status ' + r.status + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    // spawn-class: environment
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'S1b: install manifest lists at least one support script');
    assert(!names.includes(RETIRED) && !names.includes(USER_JS),
      'S1b: neither planted .js is a manifest name — if one ever returns to the manifest the fixture '
      + 'plants nothing stale and every pin below passes for the wrong reason (manifest holds '
      + names.length + ' names)');
    const deployedJs = readdirSync(scriptsDir).filter(f => f.endsWith('.js')).sort();
    assert(!deployedJs.includes(RETIRED),
      'S1b (#965): a support script the manifest no longer names is REMOVED by the install — '
      + RETIRED + ' is still on disk after it');
    assert(!deployedJs.includes(USER_JS),
      'S1b (#965): the sweep is the manifest ALLOWLIST, not a retired-name blocklist — an unlisted '
      + USER_JS + ' in the installer-owned scripts dir goes too, which is what install.sh does '
      + '(if the sweep should be narrower than install.sh\'s `*.js`, this is the assertion to change)');
    assert(JSON.stringify(deployedJs) === JSON.stringify([...names].sort()),
      'S1b (#965): after the install the scripts dir holds EXACTLY the manifest .js set — unexpected: '
      + (deployedJs.filter(n => !names.includes(n)).join(', ') || '(none)')
      + ' | missing: ' + (names.filter(n => !deployedJs.includes(n)).join(', ') || '(none)'));
    assert(existsSync(path.join(scriptsDir, USER_KEPT))
      && readFileSync(path.join(scriptsDir, USER_KEPT), 'utf8') === KEPT_BODY,
      'S1b (#965): the sweep is SCOPED — a non-.js file the installer neither wrote nor would write '
      + 'survives the install byte-intact (install.sh enumerates `*.js` only)');
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(cfg, { recursive: true, force: true }); } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // S1c (#981) — UNINSTALLING MUST PRUNE THE SAME RESIDUE. S1b pins the INSTALL
  // path converging on the manifest, which is why a reinstall heals a stranded
  // script. The uninstall path removes strictly by the CURRENT manifest, so a
  // support script this edition retired is the one artifact that survives an
  // uninstall which removes every current artifact around it — the same gap #977
  // closed for commands, role skills, managed agents and hooks, left open for
  // support scripts alone.
  //
  // The plant happens AFTER the seed install for U2's reason: the install path
  // sweeps stale scripts itself (S1b), so a plant the install could reach proves
  // nothing about the uninstall. Pins are disk outcomes only — whether the
  // uninstall consults a blocklist, a manifest history or something else is not
  // decided here.
  //
  // The retired name is censused from the manifest's own SUPPORT_SCRIPTS history,
  // NOT read from the installer's array: a check that reads the list it validates
  // can never catch an omission in it, which is the flaw that produced #977.
  // -------------------------------------------------------------------------
  {
    const cfg = mkdtempSync(path.join(os.tmpdir(), 'opencode-s1c-cfg-'));
    const r = runGlobalInstaller([], { cfg, withScripts: true });
    assert(r.ok, 'S1c: seed --global install (with scripts) exits 0 (got status ' + r.status
      + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : '') + ')');
    const scriptsDir = path.join(cfg, 'kaola-workflow', 'scripts');
    const manifest = path.join(REPO, 'scripts', 'kaola-workflow-install-manifest.js');
    // spawn-class: environment
    const names = spawnSync('node', [manifest, '--forge=github', '--scripts'], { encoding: 'utf8' })
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    assert(names.length > 0, 'S1c: install manifest lists at least one support script');

    // Real names this edition deployed and the tree has since deleted (retired 2026-06-26 and
    // 2026-07-31 respectively — two different retirement eras, so a fix bounded to one is caught).
    const RETIRED = ['kaola-workflow-autopilot.js', 'kaola-workflow-task-mirror.js'];
    const USER_KEPT = 'notes.md';
    const KEPT_BODY = 'notes the installer never wrote\n';
    // A user-authored .JS is the load-bearing half of the scope pin. A non-.js file survives even
    // install.sh's `*.js` sweep, so pinning only that would pass against a namespace prune of the
    // directory; an unlisted .js is exactly what such a prune takes and what the uninstall — which
    // removes by explicit name and nothing else — must leave alone.
    const USER_JS = 'my-local-helper.js';
    const USER_JS_BODY = '// user-authored\n';
    // Anti-vacuity: a planted name back in the manifest would be a CURRENT artifact, and its
    // removal below would be the manifest loop's property rather than this probe's.
    assert(RETIRED.every(n => !names.includes(n)) && !names.includes(USER_JS),
      'S1c: no planted name is in the manifest — a name the uninstall already removes by manifest '
      + 'is not evidence about retired-residue handling at all (manifest holds ' + names.length + ')');
    for (const n of RETIRED) fs.writeFileSync(path.join(scriptsDir, n), '// shipped by an older release\n');
    fs.writeFileSync(path.join(scriptsDir, USER_KEPT), KEPT_BODY);
    fs.writeFileSync(path.join(scriptsDir, USER_JS), USER_JS_BODY);

    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--global', '--uninstall', '--yes'], {
      env: Object.assign({}, process.env, { HOME: r.home, OPENCODE_CONFIG_DIR: cfg }),
      encoding: 'utf8',
    });
    assert(ru.status === 0, 'S1c: --uninstall exits 0 (got ' + ru.status
      + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');

    // Positive control: THIS uninstall ran and removed the current support scripts. Without it a
    // fixture whose uninstall silently did nothing would satisfy nothing below and still read green
    // if the retired plants happened to be absent.
    const currentLeft = names.filter(n => existsSync(path.join(scriptsDir, n)));
    assert(currentLeft.length === 0,
      'S1c: the uninstall removes the CURRENT manifest scripts — still on disk: '
      + currentLeft.slice(0, 5).join(', '));

    const leftRetired = RETIRED.filter(n => existsSync(path.join(scriptsDir, n)));
    assert(leftRetired.length === 0,
      'S1c (#981): a support script this edition RETIRED must be gone after an --uninstall that '
      + 'removes every current artifact around it. Still on disk: ' + leftRetired.join(', ')
      + '. A reinstall would heal these (S1b), so the exposure is the user who uninstalls and never '
      + 'reinstalls — inert residue, but residue the user asked to be rid of.');

    // SCOPE, pinned with the removal: this must stay a blocklist. A namespace sweep of the scripts
    // dir would take the user's own files with it and reintroduce exactly the defect #973 removed.
    assert(existsSync(path.join(scriptsDir, USER_JS))
      && readFileSync(path.join(scriptsDir, USER_JS), 'utf8') === USER_JS_BODY,
      'S1c (#981): the retired-name removal is a BLOCKLIST — an unlisted USER-AUTHORED .js in the '
      + 'scripts dir survives the uninstall byte-intact. A namespace sweep of the directory passes '
      + 'the clause above and fails this one, which is the point of testing both, and is exactly the '
      + 'defect #973 removed.');
    assert(existsSync(path.join(scriptsDir, USER_KEPT))
      && readFileSync(path.join(scriptsDir, USER_KEPT), 'utf8') === KEPT_BODY,
      'S1c (#981): a non-.js file the installer neither wrote nor would write survives too');
    try { rmSync(r.home, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(cfg, { recursive: true, force: true }); } catch (_) {}
  }

  // P6 (former self-healing-prune-of-orphaned-opt-in-files probe) — DELETED IN
  // FULL alongside P2–P5: the fast/full opt-in partition it exercised is retired,
  // so there is no opt-in scenario left to narrow-then-prune.

  // -------------------------------------------------------------------------
  // U1 (#F4): --uninstall removes the kaola-deployed surface, preserves the
  // user-owned opencode.json, and strips any stale installed_paths from the
  // shared config; a subsequent bare install returns EXACTLY the adaptive-core
  // commands (round-trip).
  // -------------------------------------------------------------------------
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'U1: seed install exits 0');
    assert(existsSync(path.join(r1.dest, 'opencode.json')), 'U1: opencode.json present before uninstall');
    // Uninstall the same scope.
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(ru.status === 0, 'U1: --uninstall exits 0 (got ' + ru.status + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');
    for (const name of ADAPTIVE_CORE) {
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
    assert(!existsSync(r1.configPath),
      'U1 (#F4): install + --uninstall must leave the user-owned shared config uncreated');
    // Round-trip: a fresh install returns the adaptive-only default.
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'U1: reinstall after uninstall exits 0');
    const back = readdirSync(cmdDir(r1.dest)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
    assert(JSON.stringify(back) === JSON.stringify([...ADAPTIVE_CORE].sort()),
      'U1 (#F4): uninstall→reinstall returns EXACTLY the adaptive-core commands — got ' + JSON.stringify(back));
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // U2 (#977) — WHAT --uninstall CLEARS THAT THE CURRENT SOURCE TREE NO LONGER
  // NAMES. U1 uninstalls a fresh install, so only freshly-deployed names are
  // ever on disk and a retired-name residue is structurally unobservable there.
  // A real box holds names from OLDER releases too; an uninstall that walks only
  // today's source tree leaves every one of them behind, deployed and live,
  // after the user asked for the edition to be gone. The plants happen AFTER
  // the seed install and never before it: the install path sweeps retired
  // commands itself (P7b), so a plant the install could reach proves nothing
  // about the uninstall. Pins are disk outcomes only — which list or mechanism
  // the uninstall consults is not decided here.
  // -------------------------------------------------------------------------
  {
    // Both retired in earlier releases (censused from the edition's history, not read from any
    // installer list): one command from each retirement era, plus a hook the tracked-era
    // .opencode really shipped. The user-owned command pins the sweep's scope in the SHARED dir.
    const RETIRED_CMDS = ['kaola-workflow-fast.md', 'kaola-workflow-plan-run.md'];
    const RETIRED_HOOK = 'kaola-workflow-pre-commit.sh';
    const USER_OWNED = 'my-own-command.md';
    const r1 = runInstaller([]);
    assert(r1.ok, 'U2: seed install exits 0 (got status ' + r1.status
      + (r1.stderr ? ' — ' + String(r1.stderr).split('\n')[0] : '') + ')');
    const hooksDir = path.join(r1.dest, '.opencode', 'hooks');
    const deploySet = ADAPTIVE_CORE.map(n => n + '.md');
    // Anti-vacuity: a planted name back in the deploy set would be freshly deployed, and its
    // removal below would be U1's property rather than this probe's.
    assert(RETIRED_CMDS.every(n => !deploySet.includes(n)) && !sync.HOOK_SCRIPTS.includes(RETIRED_HOOK),
      'U2: no planted name is in the deploy set — a name that is deployed is not evidence about '
      + 'retired-residue handling at all');
    for (const n of RETIRED_CMDS) {
      fs.writeFileSync(path.join(cmdDir(r1.dest), n), 'shipped by an older release\n');
    }
    fs.writeFileSync(path.join(hooksDir, RETIRED_HOOK),
      '#!/usr/bin/env bash\n# shipped by an older release\n');
    fs.writeFileSync(path.join(cmdDir(r1.dest), USER_OWNED), 'user-owned\n');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(ru.status === 0, 'U2: --uninstall exits 0 (got ' + ru.status
      + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');
    // Positive control: THIS uninstall ran and removes the current surface.
    const currentLeft = ADAPTIVE_CORE.filter(n => hasCmd(r1.dest, n));
    assert(currentLeft.length === 0,
      'U2: the uninstall removes the current commands — still on disk: ' + currentLeft.join(', '));
    const leftCmds = RETIRED_CMDS.filter(n => existsSync(path.join(cmdDir(r1.dest), n)));
    assert(leftCmds.length === 0,
      'U2 (#977): a command retired in an earlier release is removed by --uninstall — still on '
      + 'disk after it: ' + leftCmds.join(', '));
    assert(!existsSync(path.join(hooksDir, RETIRED_HOOK)),
      'U2 (#977): a hook retired in an earlier release is removed by --uninstall — '
      + RETIRED_HOOK + ' is still on disk after it');
    assert(existsSync(path.join(cmdDir(r1.dest), USER_OWNED)),
      'U2 (#977): the user-owned command in the SHARED dir survives the uninstall');
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
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'I1: second (idempotent) install exits 0');
    const snap2 = snapshot(r1.dest);
    assert(JSON.stringify(Object.keys(snap1).sort()) === JSON.stringify(Object.keys(snap2).sort()),
      'I1 (#F9): reinstall adds/removes NO files in the deployed tree');
    let drift = [];
    for (const k of Object.keys(snap1)) if (snap1[k] !== snap2[k]) drift.push(k);
    assert(drift.length === 0, 'I1 (#F9): reinstall leaves every deployed file byte-identical — drifted: ' + drift.slice(0, 5).join(', '));
    assert(!existsSync(r1.configPath), 'I1: no install pass creates the user-owned shared config');
    clean(r1);
  }

  // A (folded #544) — ZERO Claude path leaks across the ENTIRE deployed .opencode/
  // tree. Today kaola_script()'s search path ships the Claude env var
  // ($CLAUDE_PLUGIN_ROOT) + the Claude home dir ($HOME/.claude/kaola-workflow)
  // verbatim in EVERY command AND in the workflow-planner agent.
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

  // -------------------------------------------------------------------------
  // R1–R3 (#795) — manifest-driven retired-agent sweep.
  //
  // Commands live in a reserved `kaola-workflow-*` / `workflow-*` namespace, so the
  // command prune above is namespace-complete and a retired command self-heals.
  // Agent files are NOT namespaced (bare `code-explorer.md`) and the deployed agent
  // dir is SHARED with user-authored agents, so a blind prune is unavailable — the
  // install records a `<filename>\t<sha256>` manifest and the next install removes
  // exactly what it proves this installer wrote and the user has not touched.
  // Before this, a role retired from the tree stayed deployed and dispatchable
  // forever, and survived --uninstall too (which iterated the CURRENT source tree).
  // -------------------------------------------------------------------------
  {
    const crypto = require('crypto');
    const AGENT_MANIFEST = '.kaola-workflow-agent-manifest';
    const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

    const r1 = runInstaller([]);
    assert(r1.ok, 'R1: seed install exits 0 (got ' + r1.status + ')');
    const agentDir = path.join(r1.dest, '.opencode', 'agent');
    const manifestPath = path.join(agentDir, AGENT_MANIFEST);
    assert(existsSync(manifestPath), 'R1 (#795): the install records an agent deploy manifest');

    // The manifest describes EXACTLY the canonical agent set, at the deployed bytes.
    const lines = readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean);
    const manifestNames = lines.map(l => l.split('\t')[0]).sort();
    const canonNames = sync.listCanonAgents().map(n => n + '.md').sort();
    assert(JSON.stringify(manifestNames) === JSON.stringify(canonNames),
      'R1 (#795): manifest lists exactly the canonical agents — got ' + JSON.stringify(manifestNames));
    const hashDrift = [];
    for (const line of lines) {
      const [n, h] = line.split('\t');
      if (sha256(readFileSync(path.join(agentDir, n))) !== h) hashDrift.push(n);
    }
    assert(hashDrift.length === 0,
      'R1 (#795): every recorded hash matches the deployed bytes — drifted: ' + hashDrift.join(', '));

    // Plant the three classes the sweep must tell apart.
    const retiredBody = '---\nname: issue-scout\n---\n\nRetired role.\n';          // ours, retired
    const editedRecorded = '---\nname: legacy-role\n---\n\nOriginal.\n';           // ours, then user-edited
    const userAuthored = '---\nname: my-own-helper\n---\n\nMy own agent.\n';       // never ours
    fs.writeFileSync(path.join(agentDir, 'issue-scout.md'), retiredBody);
    fs.writeFileSync(path.join(agentDir, 'legacy-role.md'), editedRecorded + '\nUser edit.\n');
    fs.writeFileSync(path.join(agentDir, 'my-own-helper.md'), userAuthored);
    fs.appendFileSync(manifestPath,
      'issue-scout.md\t' + sha256(Buffer.from(retiredBody)) + '\n' +
      'legacy-role.md\t' + sha256(Buffer.from(editedRecorded)) + '\n');

    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'R2: reinstall exits 0 (got ' + r2.status + (r2.stderr ? ' — ' + String(r2.stderr).split('\n')[0] : '') + ')');
    assert(!existsSync(path.join(agentDir, 'issue-scout.md')),
      'R2 (#795): a retired agent recorded in the previous manifest is removed on reinstall');
    assert(/Removed retired agent: .*issue-scout\.md/.test(r2.stdout),
      'R2 (#795): the sweep names each removal — stdout: ' + r2.stdout.split('\n').slice(-6).join(' | '));
    assert(existsSync(path.join(agentDir, 'legacy-role.md')),
      'R2 (#795): a retired agent the user edited after install is left untouched');
    assert(readFileSync(path.join(agentDir, 'my-own-helper.md'), 'utf8') === userAuthored,
      'R2 (#795): a user-authored agent absent from the manifest is never swept');
    for (const a of sync.listCanonAgents()) {
      assert(existsSync(path.join(agentDir, a + '.md')),
        'R2 (#795): canonical agent ' + a + ' still deployed after the sweep');
    }
    const afterNames = readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)
      .map(l => l.split('\t')[0]).sort();
    assert(JSON.stringify(afterNames) === JSON.stringify(canonNames),
      'R2 (#795): the rewritten manifest owns only what the tree ships — got ' + JSON.stringify(afterNames));

    // Idempotent: nothing left to sweep on a converged reinstall.
    const r3 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r3.ok && !/Removed retired agent:/.test(r3.stdout),
      'R2 (#795): a converged reinstall sweeps nothing');

    // R3 — --uninstall removes what the manifest claims, INCLUDING an agent retired
    // since the last install (the old uninstall iterated the current source tree, so
    // an orphan survived it). A never-recorded user agent still survives.
    fs.writeFileSync(path.join(agentDir, 'issue-scout.md'), retiredBody);
    fs.appendFileSync(manifestPath, 'issue-scout.md\t' + sha256(Buffer.from(retiredBody)) + '\n');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(ru.status === 0, 'R3: --uninstall exits 0 (got ' + ru.status + ')');
    assert(!existsSync(path.join(agentDir, 'issue-scout.md')),
      'R3 (#795): --uninstall removes an agent retired since the last install (manifest-driven)');
    for (const a of sync.listCanonAgents()) {
      assert(!existsSync(path.join(agentDir, a + '.md')),
        'R3: --uninstall still removes canonical agent ' + a);
    }
    assert(existsSync(path.join(agentDir, 'my-own-helper.md')),
      'R3 (#795): --uninstall never touches a user-authored agent absent from the manifest');
    assert(!existsSync(manifestPath), 'R3 (#795): --uninstall removes its own manifest');
    clean(r1);
  }

  // -------------------------------------------------------------------------
  // R4 (#795) — PATH TRAVERSAL: a manifest name is never a path.
  //
  // The deploy manifest lives INSIDE the deployed agent dir and records BASENAMES.
  // A row carrying `../` (corruption, or a tampered manifest) must never reach a
  // delete outside that dir. Both destructive halves — the reinstall sweep and
  // `--uninstall` — therefore ENUMERATE the agent directory and intersect against
  // the manifest instead of building `$layout_root/agent/<manifest name>`.
  //
  // Without the guard: the sweep row clears every fail-closed check it applies
  // (absent from the source tree, present on disk, sha256 matches) and deletes the
  // outside file; and `--uninstall` deleted `$layout_root/agent/<name>` with NO
  // validation at all, so a bare `../../../x` removed a file three dirs above.
  // -------------------------------------------------------------------------
  {
    const crypto = require('crypto');
    const AGENT_MANIFEST = '.kaola-workflow-agent-manifest';
    const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
    // A deleted victim must not ABORT the block — every later assertion (notably
    // the --uninstall half) still has to run and report.
    const safeRead = p => { try { return readFileSync(p, 'utf8'); } catch (_) { return null; } };

    const r1 = runInstaller([]);
    assert(r1.ok, 'R4: seed install exits 0 (got ' + r1.status + ')');
    const agentDir = path.join(r1.dest, '.opencode', 'agent');
    const manifestPath = path.join(agentDir, AGENT_MANIFEST);

    // Victims OUTSIDE the agent dir. `.opencode/VICTIM.txt` is one level up;
    // `<dest>/DEEP-VICTIM.txt` is two — the shape the verifier reproduced.
    const upOne = path.join(r1.dest, '.opencode', 'VICTIM.txt');
    const upTwo = path.join(r1.dest, 'DEEP-VICTIM.txt');
    const upOneBody = 'one level up\n';
    const upTwoBody = 'two levels up\n';
    fs.writeFileSync(upOne, upOneBody);
    fs.writeFileSync(upTwo, upTwoBody);

    // A legitimate retired agent rides along: the guard must reject the hostile
    // rows WITHOUT disarming the sweep for real ones.
    const retiredBody = '---\nname: issue-scout\n---\n\nRetired role.\n';
    fs.writeFileSync(path.join(agentDir, 'issue-scout.md'), retiredBody);

    fs.appendFileSync(manifestPath,
      '../VICTIM.txt\t' + sha256(Buffer.from(upOneBody)) + '\n' +
      '../../DEEP-VICTIM.txt\t' + sha256(Buffer.from(upTwoBody)) + '\n' +
      upTwo + '\t' + sha256(Buffer.from(upTwoBody)) + '\n' +
      'issue-scout.md\t' + sha256(Buffer.from(retiredBody)) + '\n');

    // (a) REINSTALL sweep.
    const r2 = runInstaller([], { home: r1.home, dest: r1.dest });
    assert(r2.ok, 'R4: reinstall over a traversal-bearing manifest exits 0 (got ' + r2.status + ')');
    assert(existsSync(upOne),
      'R4 (#795): a `../`-bearing manifest entry must never let the SWEEP delete outside the agent dir');
    assert(existsSync(upTwo),
      'R4 (#795): a `../../`-bearing manifest entry must never let the SWEEP delete two dirs up');
    assert(safeRead(upTwo) === upTwoBody,
      'R4 (#795): the outside file is byte-identical after the sweep');
    assert(/not a plain file name/.test(r2.stdout + r2.stderr),
      'R4 (#795): the sweep names the rejected manifest entries loudly — got: '
        + (r2.stderr || r2.stdout).split('\n').slice(-4).join(' | '));
    assert(!existsSync(path.join(agentDir, 'issue-scout.md')),
      'R4 (#795): the traversal guard does not disarm the sweep for a legitimate retired agent');

    // (b) --uninstall. Re-plant both victims and a manifest naming them; the
    //     uninstall half had NO validation at all before this guard.
    fs.writeFileSync(upOne, upOneBody);
    fs.writeFileSync(upTwo, upTwoBody);
    const userAuthored = '---\nname: my-own-helper\n---\n\nMy own agent.\n';
    fs.writeFileSync(path.join(agentDir, 'my-own-helper.md'), userAuthored);
    fs.appendFileSync(manifestPath,
      '../VICTIM.txt\tignored\n' +
      '../../DEEP-VICTIM.txt\tignored\n');

    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home }), encoding: 'utf8' });
    assert(ru.status === 0, 'R4: --uninstall exits 0 (got ' + ru.status + ')');
    assert(existsSync(upOne),
      'R4 (#795): --uninstall must never delete a file one dir above the agent dir');
    assert(existsSync(upTwo),
      'R4 (#795): --uninstall must never delete a file two dirs above the agent dir');
    assert(safeRead(upTwo) === upTwoBody,
      'R4 (#795): the outside file survives --uninstall byte-identical');
    assert(existsSync(path.join(agentDir, 'my-own-helper.md')),
      'R4 (#795): --uninstall still never touches a user-authored agent absent from the manifest');
    for (const a of sync.listCanonAgents()) {
      assert(!existsSync(path.join(agentDir, a + '.md')),
        'R4: --uninstall still removes canonical agent ' + a);
    }
    clean(r1);
  }
}

// ---------------------------------------------------------------------------
// FA — FORGE AXIS. The runtime is not a forge, but the workflow PROSE is
// forge-shaped, so this block proves each forge renders its OWN surface and
// nothing of any other. Three properties make it a guard rather than a
// smoke test:
//   (1) the forge set is DERIVED from the routing registry, so a new forge is
//       covered the moment it exists — there is no opt-in list to forget;
//   (2) the identity check is BIDIRECTIONAL (own marker present AND every
//       other forge's marker absent), so both "gitlab tree is github-shaped"
//       and "github tree leaked a gitlab token" fail;
//   (3) the markers are DERIVED from the install manifest, so they cannot
//       drift from the basenames the installer actually deploys.
// ---------------------------------------------------------------------------
{
  const forgeLayout = require('./runtime-edition-forge.js');
  const routing = require('./generate-routing-surfaces.js');
  const { spawnSync } = require('child_process');
  const SYNC = path.join(REPO, 'scripts', 'sync-opencode-edition.js');

  // F1: ONE forge axis. The edition must not carry a second list that can drift
  // from the registry that renders the surfaces it consumes.
  assert(Array.isArray(routing.FORGES) && routing.FORGES.length >= 3,
    'FA1: the routing registry exposes a forge axis of at least 3 forges');
  assert(JSON.stringify(forgeLayout.FORGES) === JSON.stringify(routing.FORGES),
    'FA1: runtime-edition-forge FORGES is the routing registry axis, not a copy '
    + '(got ' + JSON.stringify(forgeLayout.FORGES) + ' vs ' + JSON.stringify(routing.FORGES) + ')');
  assert(JSON.stringify(sync.FORGES) === JSON.stringify(routing.FORGES),
    'FA1: sync-opencode-edition re-exports the same forge axis');

  // Marker per forge: the claim-script basename the INSTALL MANIFEST resolves for
  // that forge. Derived, so it tracks any future rename automatically.
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

    // F4: the ZERO-Claude-path-leak invariant holds on EVERY forge tree, not just
    // github. A forge-blind rewrite would leak $CLAUDE_PLUGIN_ROOT here.
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

    // F6: the rendered command set IS the routing registry's command set for this
    // forge (generated, not a hand-maintained list).
    const expected = routing.commandSurfacesForForge(forge)
      .map(r => path.basename(r.path)).sort();
    const actual = fs.readdirSync(path.join(TREE_ROOT, tree, 'command')).filter(f => f.endsWith('.md')).sort();
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      'FA6[' + forge + ']: ' + tree + '/command is exactly the routing registry command set for '
      + forge + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }

  // F7: an unknown forge is REFUSED, not silently defaulted to github.
  // spawn-class: environment
  const bad = spawnSync(process.execPath, [SYNC, '--forge=svn', '--check'], { encoding: 'utf8' });
  assert(bad.status === 2,
    'FA7: sync --forge=svn refuses with exit 2 rather than defaulting to github (got ' + bad.status + ')');
}

// ---------------------------------------------------------------------------
// FA9 — the forge axis reaches the INSTALLED tree, not just the generated one.
// This is the mechanical form of "installing against gitlab/gitea deploys
// forge-correct scripts": for every forge, a REAL hermetic install (own temp
// HOME + own --target + own config dir) must deploy exactly the support-script
// basenames that forge's install manifest names, and no other forge's. It is
// bidirectional and derived, so a hardcoded --forge=github anywhere in the
// installer fails here.
// ---------------------------------------------------------------------------
{
  const forgeLayout = require('./runtime-edition-forge.js');
  const manifest = require('./kaola-workflow-install-manifest.js');
  const { spawnSync } = require('child_process');
  const { mkdtempSync, existsSync, readdirSync, rmSync } = require('fs');
  const os = require('os');
  const INSTALLER = path.join(REPO, 'install-opencode.sh');

  for (const forge of forgeLayout.FORGES) {
    const home = mkdtempSync(path.join(os.tmpdir(), 'oc-forge-home-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'oc-forge-dest-'));
    const ocCfg = path.join(home, '.config', 'opencode');
    try {
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER, '--forge=' + forge, '--target', dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: home, OPENCODE_CONFIG_DIR: ocCfg }),
        encoding: 'utf8',
      });
      assert(r.status === 0, 'FA9[' + forge + ']: install-opencode.sh --forge=' + forge
        + ' exits 0 (got ' + r.status + ': ' + String(r.stderr || '').split('\n')[0] + ')');

      const scriptsDir = path.join(ocCfg, 'kaola-workflow', 'scripts');
      assert(existsSync(scriptsDir), 'FA9[' + forge + ']: support scripts land in the opencode-native dir');
      const deployed = readdirSync(scriptsDir).sort();
      const expected = manifest.supportScripts(forge).slice().sort();
      assert(JSON.stringify(deployed) === JSON.stringify(expected),
        'FA9[' + forge + ']: the installed support set is EXACTLY the ' + forge
        + ' manifest set (missing: ' + expected.filter(n => !deployed.includes(n)).join(',')
        + ' | unexpected: ' + deployed.filter(n => !expected.includes(n)).join(',') + ')');

      // Bidirectional: no OTHER forge's uniquely-named script may be present.
      for (const other of forgeLayout.FORGES) {
        if (other === forge) continue;
        const ownSet = new Set(expected);
        const strangers = manifest.supportScripts(other).filter(n => !ownSet.has(n) && deployed.includes(n));
        assert(strangers.length === 0,
          'FA9[' + forge + ']: the ' + forge + ' install must not deploy ' + other
          + '-only scripts — found ' + strangers.join(', '));
      }

      // The deployed COMMANDS must resolve a claim script that was actually installed.
      const cmd = fs.readFileSync(path.join(dest, '.opencode', 'command', 'workflow-next.md'), 'utf8');
      const claim = forgeLayout.scriptName('kaola-workflow-claim.js', forge);
      assert(cmd.includes(claim),
        'FA9[' + forge + ']: the deployed workflow-next resolves ' + claim);
      assert(deployed.includes(claim),
        'FA9[' + forge + ']: ' + claim + ' is among the installed support scripts — the command '
        + 'would otherwise resolve a script this install never wrote');
    } finally {
      try { rmSync(home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
}

// A26 (Layer 2 — per-call effort resolution) — DELETED WITH ITS MECHANISM. The whole band drove
// the plugin's `chat.params` hook against a generated `effort-tiers.json` sidecar: the harness, the
// contract case table, A26-sidecar (the sidecar's role→tier map), A26-hook (per-contract payloads,
// the stale cross-contract knob, the untouched-when-unresolved cases) and A26-degraded (absent and
// malformed sidecar). Per-role effort tiering is removed: opencode already hands a dispatched
// subagent the parent session's effort whenever the role pins no model, so there is no hook, no
// sidecar and no per-role payload left for any of it to assert. Nothing here is re-anchored — a
// pin rewritten to keep passing against machinery that is gone is worse than no pin.
//
// What this band was ALSO the only live proof of — that the shipped plugin LOADS, that opencode's
// `Object.values(mod)` walk finds exactly one factory, and that the surviving hooks are really
// registered rather than merely mentioned in the source — is NOT lost with it: A29 below asserts
// exactly that, against the two hooks that remain.

// ---------------------------------------------------------------------------
// A29 — the plugin LOADS, and opencode's loader walk finds exactly ONE factory.
//
// opencode's plugin loader does `for (const value of Object.values(mod))` and treats EVERY exported
// value as a plugin factory. A non-function export throws `Plugin export is not a function`
// outright; an exported HELPER is CALLED as `fn(PluginInput, options)`, which for anything taking a
// path first argument means `path.resolve(<object>)` and a thrown TypeError. Either aborts
// registration of the whole module — so one extra named export kills every hook in the file.
//
// That is measured, not hypothetical: this plugin once shipped test-only named exports beside the
// factory. They were not inert — opencode called them as factories and could abort registration of
// the compaction hook. The shipped module must keep the single-factory shape.
//
// A11 greps the plugin SOURCE for the two hook names. A grep cannot tell a registered hook from a
// mentioned one and is blind to the export shape entirely, and A26 — which was the only block that
// actually LOADED the plugin — is deleted with the tier mechanism. So this block loads the SHIPPED
// file the way opencode does, and asserts three results:
//   (a) the module's export list is exactly ["default"];
//   (b) the loader walk yields exactly one hook table, with nothing thrown and no non-function
//       export met on the way;
//   (c) the surviving compaction hook is a function on that table and does not throw when driven.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } = require('fs');
  const os = require('os');

  // The SHIPPED artifact, in place. Copied to .mjs only so `import()` treats it as ESM (the
  // deployed .js has no package.json beside it; production runs under Bun, which auto-detects).
  // The copy sits in the SAME directory, so SELF_DIR-relative resolution is unchanged.
  const shipped = path.join(TREE_ROOT, '.opencode', 'plugins', 'kaola-workflow-hooks.js');
  const asMjs = path.join(TREE_ROOT, '.opencode', 'plugins', 'kaola-workflow-hooks.a29.mjs');
  const projRoot = mkdtempSync(path.join(os.tmpdir(), 'oc-a29-proj-'));
  const homeDir = mkdtempSync(path.join(os.tmpdir(), 'oc-a29-home-'));
  const cfgDir = mkdtempSync(path.join(os.tmpdir(), 'oc-a29-cfg-'));
  const projectDir = path.join(projRoot, 'kaola-workflow', 'issue-a29');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project', 'name: issue-a29', 'status: active', '',
    '## Claim Identity', 'claim_repository_id: fixture-repo', 'claim_identity_digest: fixture-digest', '',
    '## Sink', 'branch: workflow/issue-a29', 'sink: merge', 'session_marker: fixture-session',
    'claim_ts: 2026-08-26T00:00:00Z', '',
  ].join('\n'));
  writeFileSync(path.join(projectDir, 'mission-list.md'), [
    '# Resume fixture goal', '',
    '- item: preserve the completed result',
    '  status: done',
    '  dispatched: inline',
    '  result: fixture-result.md',
  ].join('\n') + '\n');

  // The harness IS opencode's walk. It reports; it asserts nothing — a throw has to arrive here as
  // DATA, because "the loader threw" is the finding, not a crashed probe.
  const WALK_HARNESS = [
    "import { pathToFileURL } from 'node:url';",
    "const emit = (o) => process.stdout.write(JSON.stringify(o));",
    "try {",
    "  const mod = await import(pathToFileURL(process.env.KW_PLUGIN).href);",
    "  const exportNames = Object.keys(mod).sort();",
    "  const tables = []; const walkErrors = []; const nonFunctions = [];",
    // Verbatim in shape: every exported value, called as a plugin factory.
    "  for (const value of Object.values(mod)) {",
    "    if (typeof value !== 'function') { nonFunctions.push(typeof value); continue; }",
    "    try {",
    "      const t = await value({ directory: process.env.KW_ROOT, worktree: process.env.KW_ROOT });",
    "      tables.push(t && typeof t === 'object' ? t : null);",
    "    } catch (e) { walkErrors.push(String((e && e.message) || e)); }",
    "  }",
    "  const table = tables.find((t) => t && typeof t === 'object') || {};",
    "  const hookTypes = {};",
    "  for (const k of Object.keys(table)) hookTypes[k] = typeof table[k];",
    // Drive the surviving compaction hook. Neither the loader nor the hook invocation may throw.
    "  const drove = {};",
    "  const compacting = table['experimental.session.compacting'];",
    "  if (typeof compacting === 'function') {",
    "    const output = { context: [] };",
    "    try { await compacting({}, output); drove.compacting = { threw: null, contextLen: output.context.length, context: output.context }; }",
    "    catch (e) { drove.compacting = { threw: String((e && e.message) || e) }; }",
    "  }",
    "  emit({ ok: true, exportNames, tableCount: tables.filter(Boolean).length, walkErrors, nonFunctions, hookTypes, drove });",
    "} catch (e) { emit({ ok: false, error: String((e && e.stack) || e) }); }",
  ].join('\n');

  try {
    assert(existsSync(shipped), 'A29: the generated tree carries the plugin at .opencode/plugins/ (nothing to load otherwise)');
    if (existsSync(shipped)) {
      copyFileSync(shipped, asMjs);
      // spawn-class: environment
      const r = spawnSync('node', ['--input-type=module', '-e', WALK_HARNESS], {
        env: Object.assign({}, process.env, {
          HOME: homeDir, OPENCODE_CONFIG_DIR: cfgDir, KW_PLUGIN: asMjs, KW_ROOT: projRoot,
        }),
        encoding: 'utf8',
      });
      let out = null;
      try { out = JSON.parse(r.stdout); } catch (_) { out = null; }
      assert(r.status === 0 && out && out.ok,
        'A29: the loader-walk harness runs (status ' + r.status + ')'
        + (out && out.error ? ' — ' + String(out.error).split('\n')[0] : '')
        + (r.stderr ? ' — ' + String(r.stderr).split('\n')[0] : ''));

      if (out && out.ok) {
        // (a) ONE export, and it is the default. Stated as the whole list rather than "no named
        // export called X": the rule is about the SHAPE opencode walks, so a new name nobody
        // thought to exclude has to fail here too.
        assert(JSON.stringify(out.exportNames) === JSON.stringify(['default']),
          'A29: the plugin module exports EXACTLY ["default"] — every other exported value is called '
          + 'by opencode as a plugin factory, and one that is not a factory aborts registration of '
          + 'the whole file. Test-only handles hang off the default export as properties. Got '
          + JSON.stringify(out.exportNames));

        // (b) The walk itself: nothing thrown, nothing non-callable, exactly one hook table.
        assert(JSON.stringify(out.nonFunctions) === '[]',
          'A29: opencode\'s `Object.values(mod)` walk meets NO non-function export — one throws '
          + '"Plugin export is not a function" and takes the module with it. Found: '
          + JSON.stringify(out.nonFunctions));
        assert(JSON.stringify(out.walkErrors) === '[]',
          'A29: NOTHING throws while the walk calls each exported value as a factory — a helper '
          + 'exported beside the default is invoked as fn(PluginInput, options) and throws on the '
          + 'first path argument, which is how this file once killed every hook in it. Threw: '
          + JSON.stringify(out.walkErrors));
        assert(out.tableCount === 1,
          'A29: the walk yields EXACTLY ONE hook table (got ' + out.tableCount + ') — more than one '
          + 'means a second exported function is being registered as a plugin in its own right');

        // (c) The surviving compaction hook is registered as a FUNCTION and does not throw.
        assert(out.hookTypes['experimental.session.compacting'] === 'function',
          'A29: the loaded plugin registers the surviving compaction hook as a function — A11 greps '
          + 'the source, which cannot tell a registered hook from a mentioned one. Table: '
          + JSON.stringify(out.hookTypes));
        assert(out.drove && out.drove.compacting && out.drove.compacting.threw === null,
          'A29[experimental.session.compacting]: the hook returns without throwing on a project with '
          + 'no workflow state. Threw: '
          + (out.drove && out.drove.compacting ? out.drove.compacting.threw : '<hook did not run>'));
        assert(out.drove && out.drove.compacting && out.drove.compacting.contextLen === 1,
          'A29[experimental.session.compacting]: active claim state plus its Mission List contributes '
          + 'one resume context entry (got ' + (out.drove && out.drove.compacting
            ? out.drove.compacting.contextLen : '?') + ')');
        const resume = out.drove && out.drove.compacting && out.drove.compacting.context
          ? out.drove.compacting.context.join('\n') : '';
        assert(resume.includes('project `issue-a29`: status active, branch workflow/issue-a29')
          && resume.includes('sink merge') && resume.includes('Claim state:'),
          'A29[experimental.session.compacting]: resume context retains active claim facts and state locator — got ' + resume);
        assert(resume.includes('Mission List:') && resume.includes('# Resume fixture goal')
          && resume.includes('result: fixture-result.md'),
          'A29[experimental.session.compacting]: resume context carries the authored Mission List and result locator — got ' + resume);
      }
    }
  } finally {
    try { rmSync(asMjs, { force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(projRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(homeDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(cfgDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// A27 — installer drift: `seed_config` preserves an existing opencode.json and
// says nothing about what is in it, so a long-lived config keeps carrying
// settings that stopped meaning anything, with nothing anywhere that reports it.
//
// THE SUBJECT MOVED, AND THAT IS THE POINT. It used to be the config's ROLE SET,
// compared against the set the generator emits. Per-role effort tiering is
// removed and the generator emits no `agent` block at all, so that comparison has
// no baseline and no possible subject — it is deleted here rather than propped up
// with a substitute. What is stale NOW is an entry that pins per-role reasoning
// effort: inert, because a subagent runs the model and effort of the session that
// dispatched it, and still reading as live configuration to anyone who opens the
// file. That check needs no baseline, which is why it survives the removal.
//
// The owner ruling is three-part and each part is asserted separately: DETECT the
// staleness, REPORT exactly what is stale, and act only behind an EXPLICIT opt-in
// — never overwrite a user-owned file silently. The opt-in's SPELLING is not
// pinned here: the test requires that the report itself names a flag, and then
// proves that flag does the adoption. A test that froze the name would be a
// mechanism claim that rots; requiring the report to be actionable is the result.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('fs');
  const os = require('os');
  const INSTALLER = path.join(REPO, 'install-opencode.sh');
  const PASSED_FLAGS = new Set(['--target', '--yes', '--no-scripts', '--help']);

  // A stale, user-owned config: four role entries carrying a per-role effort setting, in BOTH of
  // the shapes this edition ever wrote (`options` and the older `variant`), plus one entry that
  // pins ONLY a model. That last one is the negative control INSIDE the fixture — it is the user's
  // own supported choice and must not be named, so a check that simply lists every role under
  // `agent` fails here.
  const STALE_ROLES = ['contractor', 'issue-scout', 'planner', 'workflow-planner'];
  const MODEL_ONLY_ROLE = 'code-reviewer';
  const DRIFTED = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'build',
    agent: {
      planner: { options: { reasoningEffort: 'xhigh' } },
      contractor: { options: { reasoningEffort: 'high' } },
      'issue-scout': { variant: 'high' },
      'workflow-planner': { variant: 'max' },
      'code-reviewer': { model: 'openai/gpt-5' },
    },
  }, null, 2) + '\n';

  function runInstall(dest, home, extra) {
    // spawn-class: environment
    const r = spawnSync('bash', [INSTALLER, '--target', dest, '--yes', '--no-scripts'].concat(extra || []), {
      env: Object.assign({}, process.env, { HOME: home }),
      encoding: 'utf8',
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  }
  function freshDrifted() {
    const home = mkdtempSync(path.join(os.tmpdir(), 'oc-a27-home-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'oc-a27-dest-'));
    writeFileSync(path.join(dest, 'opencode.json'), DRIFTED);
    return { home, dest, cfg: path.join(dest, 'opencode.json') };
  }
  const wipe = f => {
    try { rmSync(f.home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(f.dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  };

  let optInFlags = [];
  {
    const f = freshDrifted();
    try {
      const r = runInstall(f.dest, f.home, []);
      // Nothing refuses: a drifted config is a finding to report, not a failed install.
      assert(r.status === 0,
        'A27: an install over a DRIFTED opencode.json still exits 0 — reporting drift is a finding, '
        + 'not a refusal (got ' + r.status + ')');
      // REPORT EXACTLY WHAT IS STALE, BY NAME.
      //
      // RE-ANCHORED SUBJECT. This used to compare the config's role SET against the set the
      // generator emits, in both directions — roles it carries that are no longer shipped, and
      // roles shipped now that it lacks. That comparison is DELETED WITH ITS MECHANISM: with
      // per-role effort tiering removed the generator emits no `agent` block at all, so there is no
      // baseline left to compare against and the "missing role" direction has no possible subject.
      // The check that survives is the mirror image, and it needs no baseline: an entry pinning
      // per-role effort is inert now, and a block that does nothing while reading as live
      // configuration is exactly what the user has to be told about.
      for (const role of STALE_ROLES) {
        assert(r.out.includes(role),
          'A27: the report NAMES the role "' + role + '", whose entry pins a per-role effort setting '
          + 'that no longer does anything — a subagent runs the model and effort of the session that '
          + 'dispatched it. Both shapes this edition ever wrote count (`options` and the older '
          + '`variant`); naming the count without the names leaves the user nothing to edit.');
      }
      // NEGATIVE CONTROL, INSIDE THE FIXTURE — a model-only entry is the user's own choice.
      assert(!r.out.includes(MODEL_ONLY_ROLE),
        'A27: the report does NOT name "' + MODEL_ONLY_ROLE + '", whose entry pins only a model — '
        + 'that is a supported user choice, not a leftover. A check that lists every role under '
        + '`agent` would name it, and would be telling the user to delete their own configuration.');
      // NEVER OVERWRITE SILENTLY.
      assert(readFileSync(f.cfg, 'utf8') === DRIFTED,
        'A27: the drifted opencode.json is left BYTE-IDENTICAL — it is user-owned, and detection is '
        + 'not permission to rewrite it');
      // The report has to be actionable: it must name the flag that adopts the regenerated config.
      optInFlags = [...new Set(r.out.match(/--[a-z][a-z0-9-]+/g) || [])]
        .filter(x => !PASSED_FLAGS.has(x)).slice(0, 6);
      assert(optInFlags.length > 0,
        'A27: the drift report names an explicit opt-in flag that regenerates the config — a report '
        + 'that states the drift but not how to act on it leaves the user with nothing to do. '
        + 'Flags found in output: ' + JSON.stringify(optInFlags));
    } finally { wipe(f); }
  }

  // The opt-in actually adopts. Every flag the report named is tried; at least one must replace the
  // drifted config with what the generator emits.
  if (optInFlags.length > 0) {
    let adopted = null;
    const tried = [];
    for (const flag of optInFlags) {
      const f = freshDrifted();
      try {
        const r = runInstall(f.dest, f.home, [flag]);
        const after = existsSync(f.cfg) ? readFileSync(f.cfg, 'utf8') : '';
        tried.push(flag + '(exit ' + r.status + (after === DRIFTED ? ', unchanged' : ', rewritten') + ')');
        if (r.status === 0 && after !== DRIFTED && after !== '') { adopted = { flag, after }; break; }
      } finally { wipe(f); }
    }
    assert(adopted !== null,
      'A27: the flag the drift report names actually regenerates the config on explicit opt-in — '
      + 'tried ' + tried.join(', '));
    if (adopted) {
      // The `{ inheritModel }` argument this comparison used to pass is GONE WITH ITS MECHANISM:
      // the generator has one render now, and an argument it silently ignores is the dead-knob
      // class this whole change exists to remove. The claim is unchanged — after the opt-in the
      // file is exactly what the generator emits.
      const expected = sync.renderOpencodeJson();
      assert(adopted.after === expected,
        'A27: after the explicit opt-in, opencode.json is exactly what the generator emits '
        + '(flag ' + adopted.flag + ')');
    }
  }

  // NEGATIVE CONTROL — a guard that fires on everything is not a guard. An install over a config
  // the generator itself just wrote carries no per-role effort at all, so the check must say
  // NOTHING. Read off the report's own vocabulary rather than a role list: post-re-anchor the
  // generated config names no roles anywhere, so "no role name appeared" would be true of a check
  // that had been deleted outright.
  {
    const home = mkdtempSync(path.join(os.tmpdir(), 'oc-a27n-home-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'oc-a27n-dest-'));
    try {
      writeFileSync(path.join(dest, 'opencode.json'), sync.renderOpencodeJson());
      const r = runInstall(dest, home, []);
      assert(r.status === 0, 'A27-neg: an install over a freshly generated opencode.json exits 0 (got ' + r.status + ')');
      assert(!/drift/i.test(r.out),
        'A27-neg: a config the generator itself just wrote produces NO drift report — a check that '
        + 'fires on everything tells the user nothing. Output:\n' + r.out.trim().slice(0, 600));
      assert(!r.out.includes(STALE_ROLES[0]) && !r.out.includes(MODEL_ONLY_ROLE),
        'A27-neg: …and no role is named in it either');
    } finally {
      try { rmSync(home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }

  // -------------------------------------------------------------------------
  // A27-quiet — the three inputs on which this check must say NOTHING and must
  // never fail the install. Each is a distinct way to over-fire, and over-firing
  // here is not a cosmetic defect: the report tells a user their configuration is
  // dead and invites them to replace the file.
  //
  // The FIRST is the one the negative control above cannot reach. A27-neg feeds a
  // config with no `agent` block at all, so a check that had lost its
  // `variant`/`options` filter entirely — and simply named every role under
  // `agent` — would still pass it. The filter is the whole boundary between "this
  // setting is inert" and "this is your own model pin", and this is what holds it.
  // -------------------------------------------------------------------------
  {
    const QUIET_CASES = [
      {
        label: 'model-pins-only',
        // An `agent` block, fully populated, carrying nothing but model pins. The user's own
        // supported choice: it must be neither named nor counted, and must not raise a report.
        body: JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          default_agent: 'build',
          agent: {
            planner: { model: 'openai/gpt-5' },
            implementer: { model: 'anthropic/claude-sonnet-4-5' },
            'code-reviewer': { model: 'openai/gpt-5' },
          },
        }, null, 2) + '\n',
        why: 'an `agent` block whose entries pin ONLY a model is the user\'s own configuration — '
          + 'naming it tells them to delete their own pins, and a check that lost its effort-key '
          + 'filter would name every one of these',
      },
      {
        label: 'not-json',
        body: 'this is not json at all { " \n',
        why: 'an unreadable or non-JSON config is not this installer\'s to diagnose, and is never a '
          + 'reason to fail the install or to guess at its contents',
      },
      {
        label: 'agent-wrong-shape',
        // `agent` present but an array — a shape the reader must survive rather than index into.
        body: JSON.stringify({ $schema: 'https://opencode.ai/config.json', agent: ['planner'] }, null, 2) + '\n',
        why: 'an `agent` value of the wrong shape must be read as "nothing stale here", not crashed on',
      },
    ];
    for (const c of QUIET_CASES) {
      const home = mkdtempSync(path.join(os.tmpdir(), 'oc-a27q-home-'));
      const dest = mkdtempSync(path.join(os.tmpdir(), 'oc-a27q-dest-'));
      const cfg = path.join(dest, 'opencode.json');
      try {
        writeFileSync(cfg, c.body);
        const r = runInstall(dest, home, []);
        assert(r.status === 0,
          'A27-quiet[' + c.label + ']: the install still exits 0 (got ' + r.status + ') — ' + c.why);
        assert(!/drift/i.test(r.out),
          'A27-quiet[' + c.label + ']: NO drift report — ' + c.why + '. Output:\n'
          + r.out.trim().slice(0, 600));
        assert(readFileSync(cfg, 'utf8') === c.body,
          'A27-quiet[' + c.label + ']: the config is left BYTE-IDENTICAL — reading a user-owned file '
          + 'is not permission to rewrite it, least of all one that was not understood');
      } finally {
        try { rmSync(home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }
  }

}

// ---------------------------------------------------------------------------
// A28 — adoption must not destroy the config it replaces.
//
// A27 proves the opt-in ADOPTS. It says nothing about what happens to the file adoption
// overwrites, and that file is the user's: hand edits, model pins, permission choices. Everything
// below is the recovery half of that same ruling, asserted as four separate results:
//
//   1. the replaced config is recoverable byte-for-byte after adoption;
//   2. a SECOND adoption inside the SAME clock second does not clobber the first backup — the
//      measured defect, where two adoptions in one second shared a backup name and the second
//      overwrote the user's original with the generated config, leaving a reassuring file with
//      nothing in it worth recovering;
//   3. a backup that CANNOT be written aborts instead of replacing the file anyway — the one
//      outcome here that destroys something;
//   4. the report the user reads BEFORE opting in discloses that adopting replaces rather than
//      merges, and the path it promises is the path adoption actually writes.
//
// NEITHER the flag's spelling NOR the backup's naming scheme is pinned, for A27's reason: a test
// that freezes a mechanism is a claim that rots. The flag is discovered from the report; the
// backup is identified by its CONTENT (the bytes that were replaced), and the promised path is
// matched as a SHAPE taken from the report itself. An implementation that names backups by PID,
// counter or hash satisfies every assertion here — what it may not do is lose the file.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const {
    mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, rmSync,
  } = require('fs');
  const os = require('os');
  const INSTALLER = path.join(REPO, 'install-opencode.sh');
  const PASSED_FLAGS = new Set(['--target', '--yes', '--no-scripts', '--help']);

  // A user-owned config: stale (so the pre-flag report fires) and carrying a hand-set model pin
  // — the concrete thing adoption throws away and the backup exists to give back.
  const USER_CONFIG = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'build',
    model: 'openai/gpt-4.1',
    agent: {
      planner: { options: { reasoningEffort: 'xhigh' } },
      contractor: { options: { reasoningEffort: 'high' } },
    },
  }, null, 2) + '\n';

  function runInstall(dest, home, extra, envExtra) {
    // spawn-class: environment
    const r = spawnSync('bash', [INSTALLER, '--target', dest, '--yes', '--no-scripts'].concat(extra || []), {
      // No inherited-model env: the installer no longer reads one, and a knob set here that
      // nothing consumes is the same dead configuration the removal is about.
      env: Object.assign({}, process.env, { HOME: home }, envExtra || {}),
      encoding: 'utf8',
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  }
  function fresh() {
    const home = mkdtempSync(path.join(os.tmpdir(), 'oc-a28-home-'));
    const dest = mkdtempSync(path.join(os.tmpdir(), 'oc-a28-dest-'));
    writeFileSync(path.join(dest, 'opencode.json'), USER_CONFIG);
    return { home, dest, cfg: path.join(dest, 'opencode.json') };
  }
  const wipe = f => {
    try { chmodSync(f.dest, 0o755); } catch (_) { /* non-fatal */ }
    try { rmSync(f.home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    try { rmSync(f.dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  };
  // Everything the install left BESIDE the config. The backup is found in here by content, never
  // by name — that is what keeps the naming scheme unpinned.
  const sideFiles = dest => readdirSync(dest, { withFileTypes: true })
    .filter(e => e.isFile() && e.name !== 'opencode.json').map(e => e.name).sort();
  const sideRead = (dest, name) => { try { return readFileSync(path.join(dest, name), 'utf8'); } catch (_) { return null; } };
  const holdersOf = (dest, text) => sideFiles(dest).filter(n => sideRead(dest, n) === text);
  const brief = t => (t.length > 900 ? t.slice(0, 900) + ' …' : t);

  // A promised path, as a MATCHER. Any `<…>`/`{…}`/`[…]` placeholder becomes "anything", so the
  // report may spell its variable part however it likes; the rest must be literal.
  const shapeToRegExp = shape => {
    const SENT = '\u0000';
    const withSent = shape.replace(/<[^>]*>|\{[^}]*\}|\[[^\]]*\]/g, SENT);
    const escaped = withSent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.split(SENT).join('.+') + '$');
  };

  // ---- the report the user reads before deciding -------------------------------------------
  let report = '';
  {
    const f = fresh();
    try {
      const r = runInstall(f.dest, f.home, []);
      assert(r.status === 0,
        'A28: an install over a drifted user-owned config exits 0 (got ' + r.status + ')');
      report = r.out;
      assert(readFileSync(f.cfg, 'utf8') === USER_CONFIG,
        'A28: the reporting install left the user config byte-identical (precondition for everything below)');
    } finally { wipe(f); }
  }

  // (4a) DISCLOSE THE COST BEFORE THE OPT-IN. A user who is told only "re-run with <flag> to adopt
  // it" reasonably expects their pins to survive a merge. The wording is free; what the report may
  // not do is stay silent about the file being rewritten rather than merged into.
  assert(/\breplac(e|es|ed|ing)\b/i.test(report),
    'A28: the pre-flag drift report discloses that adopting REPLACES the existing config rather '
    + 'than merging into it — the disclosure has to arrive before the user runs the flag, because '
    + 'after it the pins are already gone. Any wording carries; this one says nothing. Report:\n'
    + brief(report));

  // (4b) …and it must say WHERE the replaced file goes. Collected as shapes, checked against the
  // real thing below: a promise nothing fulfils is worse than no promise, because it reads as a
  // recovery path the user will look for and not find.
  const promised = [...new Set(report.match(/\S*opencode\.json\S+/g) || [])]
    .map(s => s.replace(/[.,;:)\]]+$/, ''))
    .filter(s => path.basename(s) !== 'opencode.json');
  assert(promised.length > 0,
    'A28: the pre-flag drift report names WHERE the config it replaces is kept — "it is backed up" '
    + 'with no path is not a recovery path. Report:\n' + brief(report));

  // ---- discover the opt-in flag, and prove the backup on the run that finds it ---------------
  let adoptFlag = null;
  const candidates = [...new Set(report.match(/--[a-z][a-z0-9-]+/g) || [])]
    .filter(x => !PASSED_FLAGS.has(x)).slice(0, 6);
  const tried = [];
  for (const flag of candidates) {
    const f = fresh();
    try {
      const r = runInstall(f.dest, f.home, [flag]);
      const after = existsSync(f.cfg) ? readFileSync(f.cfg, 'utf8') : '';
      tried.push(flag + '(exit ' + r.status + (after === USER_CONFIG ? ', unchanged' : ', rewritten') + ')');
      if (!(r.status === 0 && after !== USER_CONFIG && after !== '')) continue;
      adoptFlag = flag;

      // (1) THE REPLACED CONFIG IS RECOVERABLE, BYTE FOR BYTE. Identified by content: whatever the
      // installer named it, one of the files it left behind has to BE the user's config.
      const keepers = holdersOf(f.dest, USER_CONFIG);
      assert(keepers.length > 0,
        'A28: adoption keeps the config it replaced, byte-for-byte, in a file beside it — the user '
        + 'opted into a new config, not into losing the old one. Files left beside it: '
        + JSON.stringify(sideFiles(f.dest)));

      // (4c) THE PROMISE IS THE PRACTICE. The path the pre-flag report named must be the path the
      // writer produces — one spelling, or the recovery instruction points somewhere empty.
      const kept = sideFiles(f.dest);
      const fulfilled = promised.filter(p => {
        const re = shapeToRegExp(p);
        return kept.some(n => re.test(n) || re.test(path.join(f.dest, n)));
      });
      assert(fulfilled.length > 0,
        'A28: the backup path the drift report PROMISES is the path adoption actually writes — '
        + 'promised ' + JSON.stringify(promised) + ', wrote ' + JSON.stringify(kept));
    } finally { wipe(f); }
    if (adoptFlag) break;
  }
  assert(adoptFlag !== null,
    'A28: the drift report names a flag that adopts the regenerated config (A27 proves this too; '
    + 'it is repeated here because every assertion below is scoped to it, and a guard that quietly '
    + 'skips when its subject is not found is not a guard) — tried ' + (tried.join(', ') || '(none)'));

  if (adoptFlag) {
    // ---- (2) TWO ADOPTIONS INSIDE ONE CLOCK SECOND ------------------------------------------
    // The clock is FROZEN on PATH for both runs. Racing the real clock is what makes this test
    // useless: two installs are seconds apart, so a name derived from the clock alone is unique
    // and the collision under test never occurs — the suite would pass against the very code that
    // loses the file. Frozen, ANY clock-derived name collides, and the assertion is about the
    // outcome (both replaced configs still recoverable), not about how uniqueness is obtained.
    const shimDir = mkdtempSync(path.join(os.tmpdir(), 'oc-a28-clock-'));
    const realDate = ['/bin/date', '/usr/bin/date'].find(p => existsSync(p));
    assert(!!realDate,
      'A28: a real `date` exists to fall through to — without one the shim below is not a frozen '
      + 'clock, it is a broken PATH, and every result under it means nothing');
    if (realDate) {
      const f = fresh();
      try {
        writeFileSync(path.join(shimDir, 'date'),
          '#!/bin/sh\n'
          // Any format request answers with one fixed stamp; everything else is the real date.
          // Format-agnostic on purpose: pinning the exact format string would re-introduce the
          // mechanism coupling this block is written to avoid, and would silently un-freeze the
          // clock the day the format changed.
          + 'case "$1" in\n'
          + "  +*) printf '%s\\n' '19700101000000'; exit 0 ;;\n"
          + 'esac\n'
          + 'exec ' + realDate + ' "$@"\n');
        chmodSync(path.join(shimDir, 'date'), 0o755);
        const frozenEnv = { PATH: shimDir + path.delimiter + process.env.PATH };

        // Fixture control: the clock really is frozen. Two reads, one value.
        // spawn-class: environment
        const t1 = spawnSync('date', ['+%Y%m%d%H%M%S'], { env: Object.assign({}, process.env, frozenEnv), encoding: 'utf8' });
        // spawn-class: environment
        const t2 = spawnSync('date', ['+%Y%m%d%H%M%S'], { env: Object.assign({}, process.env, frozenEnv), encoding: 'utf8' });
        assert(t1.status === 0 && t1.stdout.trim() !== '' && t1.stdout === t2.stdout,
          'A28: the frozen-clock shim answers two reads with ONE value — otherwise the two '
          + 'adoptions below are not in the same clock second and prove nothing (got '
          + JSON.stringify(t1.stdout) + ' then ' + JSON.stringify(t2.stdout) + ')');

        const r1 = runInstall(f.dest, f.home, [adoptFlag], frozenEnv);
        assert(r1.status === 0, 'A28: first adoption under the frozen clock exits 0 (got ' + r1.status + ')');
        const generatedFirst = readFileSync(f.cfg, 'utf8');
        const after1 = sideFiles(f.dest);

        const r2 = runInstall(f.dest, f.home, [adoptFlag], frozenEnv);
        assert(r2.status === 0, 'A28: second adoption under the frozen clock exits 0 (got ' + r2.status + ')');
        const after2 = sideFiles(f.dest);

        // Non-vacuity: the second run must have written a backup of its OWN. If it kept nothing,
        // the survival check below passes for free and measures nothing.
        assert(after2.length > after1.length,
          'A28: the second adoption inside the same clock second wrote its own backup — with no '
          + 'second write there is no collision for the check below to survive (files beside the '
          + 'config went ' + JSON.stringify(after1) + ' → ' + JSON.stringify(after2) + ')');

        // THE DEFECT, PINNED. The user's ORIGINAL must still be readable somewhere.
        assert(holdersOf(f.dest, USER_CONFIG).length > 0,
          'A28: after a SECOND adoption inside the SAME clock second, the user\'s ORIGINAL config '
          + 'is STILL recoverable — a backup name derived from the clock alone collides here, and '
          + 'the second adoption then overwrites the first backup with the generated config: a '
          + 'reassuring file holding nothing worth recovering. Files beside the config: '
          + JSON.stringify(after2));

        // And the second adoption kept what IT replaced, so neither run is the one that loses.
        assert(holdersOf(f.dest, generatedFirst).length > 0,
          'A28: the second adoption also kept the config IT replaced — the rule is per adoption, '
          + 'not "the first one is special". Files beside the config: ' + JSON.stringify(after2));
      } finally {
        wipe(f);
        try { rmSync(shimDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // ---- (3) A BACKUP THAT CANNOT BE WRITTEN ABORTS, IT DOES NOT REPLACE ANYWAY --------------
    // The destination directory is made read-only AFTER a normal install has populated it: no new
    // entry (the backup) can be created there, while the existing config file stays writable — so
    // the only thing standing between the user and a silent loss is the installer refusing.
    {
      const f = fresh();
      try {
        const seed = runInstall(f.dest, f.home, []);
        assert(seed.status === 0, 'A28: seed install exits 0 (precondition, got ' + seed.status + ')');
        assert(readFileSync(f.cfg, 'utf8') === USER_CONFIG,
          'A28: the seed install preserved the user config (precondition)');
        chmodSync(f.dest, 0o555);

        // FIXTURE CONTROL — the directory really is unwritable. Under root, or on a filesystem
        // that ignores the mode, nothing below is the scenario it claims to be; say that plainly
        // instead of failing on the guard as if the installer had misbehaved.
        let blocked = false;
        try { writeFileSync(path.join(f.dest, '.kw-writability-probe'), 'x'); }
        catch (_) { blocked = true; }
        assert(blocked,
          'A28: the fixture can actually make a new file in the destination unwritable — it cannot '
          + 'here (running as root, or a filesystem that ignores the mode), so the backup below is '
          + 'writable after all and the abort under test is never reached');

        // CONTROL — the read-only directory alone must not break an install. Without this, the
        // non-zero exit below proves nothing: it could be the tree deploy failing long before
        // adoption is reached, and the assertion would hold with no backup guard at all.
        const control = runInstall(f.dest, f.home, []);
        assert(control.status === 0,
          'A28: with the destination read-only, a NON-adopting install still exits 0 — the failure '
          + 'asserted next has to be attributable to the adoption, not to the directory (got '
          + control.status + ')');

        const r = runInstall(f.dest, f.home, [adoptFlag]);
        assert(r.status !== 0,
          'A28: an adoption whose backup CANNOT be written fails loudly instead of proceeding — '
          + 'exit ' + r.status + '. Nothing else refuses here; this one does, because carrying on '
          + 'is the case that destroys something.');
        assert(readFileSync(f.cfg, 'utf8') === USER_CONFIG,
          'A28: …and the config it could not back up is left BYTE-IDENTICAL. Replacing a file '
          + 'after failing to keep a copy of it is the exact outcome the backup exists to prevent.');
        assert(holdersOf(f.dest, USER_CONFIG).length === 0,
          'A28: the aborted adoption left no partial backup behind (precondition sanity — the copy '
          + 'genuinely could not be written, so the abort was the real path, not a stale file)');
      } finally { wipe(f); }
    }
  }
}

// ---------------------------------------------------------------------------
// A30 — THE REMEDY --check ADVISES IS THE REMEDY THAT CLEARS WHAT IT REPORTED.
//
// runCheck prints its per-mismatch reasons and then ONE closing remediation line for the whole
// set, last of all. The reasons are derived per class and are correct; the closing line is
// derived from nothing, and two of the classes runCheck can report are NOT cleared by the
// command it names:
//
//   · the tracked, USER-OWNED opencode.json read stale — `--write` deliberately preserves that
//     file, so the advised command exits 0 saying "tree already in sync" while --check still
//     exits 1 on the very mismatch it was run to fix. Only --write-config rewrites it.
//   · an unregistered plugin in templates/opencode/plugins/ — NO flag of this script clears it.
//     The remedy is a source edit adding the basename to PLUGIN_SCRIPTS, which is exactly what
//     that mismatch's own reason line already says.
//
// So the property is stated as an OUTCOME, never as a wording: take whatever runnable invocation
// of this script the output offers, RUN it, and re-check. What was advised has to clear
// everything a flag of this script can clear, and it may not offer a command that clears
// nothing. That is checkable without pinning one sentence of the message, and it keeps holding
// as the class table grows — a fourteen-way string pin would rot on the next class.
//
// WHY A SCRATCH COPY OF THE REPO. runCheck resolves REPO from its own __dirname and both write
// modes mutate that tree, so the only way to plant a mismatch is to plant it in a repo — never
// this one, whose generated trees are gitignored and whose drift D0 above exists to report. The
// scratch repo carries the source trees the generator reads plus the tracked opencode.json, is
// regenerated once, and is asserted GREEN before anything is planted: that control is also what
// catches an under-copied fixture, which would report every file missing and quietly turn every
// scenario below into a different test than the one it claims to be.
//
// The two KAOLA_OPENCODE_*_MODEL pins are scrubbed from the child environment: they change what
// renderOpencodeJson emits, so a developer with one exported would find the fixture's config
// stale before this band planted anything. The fixture's subject has to be the fixture.
//
// NOT EVERY ASSERTION HERE CAN GO RED TODAY, AND THAT IS SAID OUT LOUD. The write-clearable
// scenario and the never-blanket-advise-the-stronger-flag check are GREEN ON ARRIVAL: they lock
// in the classes today's line is right about, and they stop the repair from being made by
// swapping in --write-config — which clears 13 of the 14 classes and overwrites the model pins
// the config file itself invites the user to hand-edit.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const { mkdtempSync, cpSync, rmSync } = require('fs');
  const os = require('os');

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'oc-a30-repo-'));
  const SYNC = path.join(scratch, 'scripts', 'sync-opencode-edition.js');
  // The generator's whole input surface: it renders from agents/ and commands/, byte-copies from
  // hooks/ and templates/opencode/plugins/, and requires its siblings out of scripts/. The
  // green-baseline assertion below is what keeps this list honest — an omission reds there.
  const SOURCE_TREES = ['scripts', 'agents', 'commands', 'hooks', 'templates'];
  const childEnv = Object.assign({}, process.env);
  delete childEnv.KAOLA_OPENCODE_STANDARD_MODEL;
  delete childEnv.KAOLA_OPENCODE_REASONING_MODEL;

  const run = args => {
    // spawn-class: environment
    const r = spawnSync(process.execPath, [SYNC].concat(args), { encoding: 'utf8', env: childEnv });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  const check = () => run(['--forge=github', '--check']);

  // What --check reported, as paths. Parsed from the per-mismatch lines, which is the surface
  // the issue leaves alone; if that shape ever changes this returns nothing, and the per-scenario
  // control below ("the planted set is what was reported") reds loudly instead of passing empty.
  const reported = out => out.split('\n')
    .map(l => l.match(/^\s*-\s+(\S+)\s+—\s/))
    .filter(Boolean).map(m => m[1]).sort();

  // Every runnable invocation of THIS script the output offers, as argv tails. Deliberately
  // generous about wording and position — "Fix: node …", a bulleted line, two of them — because
  // the claim is about what a reader is handed to run, not about where it is printed. It stops
  // at a shell operator so a chained pair is read as two commands rather than one nonsense one.
  const ADVICE_RE = /node\s+\S*sync-opencode-edition\.js[^\n`'"&;]*/g;
  const advisedCommands = out => (out.match(ADVICE_RE) || [])
    .map(m => m.trim().split(/\s+/).slice(2)
      .map(t => t.replace(/[.,;:)\]`]+$/, '')).filter(Boolean));

  // The volatile surface: everything a plant or a write mode can touch. Snapshotting it is what
  // lets one scratch repo serve every leg — restore is exact, so no scenario inherits another's
  // damage and no leg inherits the previous leg's repair.
  const VOLATILE = ['opencode.json', '.opencode', path.join('templates', 'opencode', 'plugins')];
  const walkFiles = (abs, out) => {
    if (!fs.existsSync(abs)) return out;
    if (fs.statSync(abs).isFile()) { out.push(abs); return out; }
    for (const e of fs.readdirSync(abs)) walkFiles(path.join(abs, e), out);
    return out;
  };
  const volatileFiles = () => VOLATILE.reduce((acc, rel) => acc.concat(walkFiles(path.join(scratch, rel), [])), []);
  const snapshot = () => new Map(volatileFiles().map(f => [path.relative(scratch, f), fs.readFileSync(f)]));
  const restore = snap => {
    for (const f of volatileFiles()) if (!snap.has(path.relative(scratch, f))) rmSync(f, { force: true });
    for (const [rel, buf] of snap) {
      const abs = path.join(scratch, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs) || !fs.readFileSync(abs).equals(buf)) fs.writeFileSync(abs, buf);
    }
  };

  try {
    // The copy is checked before it is made. A SOURCE_TREES entry that no longer exists throws
    // out of cpSync, and an uncaught throw here is a stack trace where a named cause belongs —
    // this band runs last, so it would take the suite's own summary line with it. Measured, not
    // theorised: a fixture built with one tree deleted killed this file mid-run until this line.
    const missingTrees = SOURCE_TREES.filter(d => !fs.existsSync(path.join(REPO, d)));
    assert(missingTrees.length === 0,
      'A30: every source tree this fixture copies is present in the repo — ' + JSON.stringify(missingTrees)
      + ' is not, so the scratch repo below is missing an input the generator reads and every '
      + 'scenario would be reporting on a tree of absent files rather than on planted drift');
    for (const d of SOURCE_TREES) {
      if (fs.existsSync(path.join(REPO, d))) cpSync(path.join(REPO, d), path.join(scratch, d), { recursive: true });
    }
    cpSync(path.join(REPO, 'opencode.json'), path.join(scratch, 'opencode.json'));

    const w = run(['--forge=github', '--write']);
    assert(w.status === 0, 'A30: the scratch repo regenerates — sync --write exit ' + w.status
      + ': ' + String(w.out).split('\n').slice(0, 3).join(' | '));
    const baselineGreen = check();
    assert(baselineGreen.status === 0,
      'A30: the scratch repo is GREEN before anything is planted. Every scenario below reads its '
      + 'mismatch set as the set it planted, so a fixture that is already red — an under-copied '
      + 'source tree, an exported model pin — is a different test wearing this one\'s name. Got '
      + 'exit ' + baselineGreen.status + ': ' + baselineGreen.out.split('\n').slice(0, 5).join(' | '));

    const pristine = snapshot();
    assert(pristine.size > 0,
      'A30: the snapshot captured the volatile surface — an empty one restores nothing, so every '
      + 'scenario after the first would run against the previous one\'s leftovers');

    // The three classes, each with the flag that ACTUALLY clears it — one per REMEDY KIND, not one
    // per class: the property is about which remedy applies, and a pin over all fourteen classes
    // would rot on the fifteenth. `clearedBy` is a claim, not a fact: the `none` half is re-measured
    // every run by the maximal-flag leg below, and a wrong `write`/`write-config` half surfaces as a
    // contradiction between the never-blanket check and the sufficiency check, which cannot both
    // hold if the flag named here is not the one that clears it.
    const agentDir = path.join(scratch, '.opencode', 'agent');
    const agentMd = (fs.existsSync(agentDir)
      ? fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).sort() : [])[0] || '';
    assert(agentMd !== '',
      'A30: the regenerated fixture has a generated agent to plant drift in — with none, the '
      + 'write-clearable scenario has no subject and its green would mean nothing');
    const ROGUE_PLUGIN = 'zzz-a30-unregistered.js';
    const CLASSES = {
      'stale generated agent': {
        rel: '.opencode/agent/' + agentMd,
        clearedBy: 'write',
        // Guarded, not assumed: with no agent to drift the assertion above has already said so,
        // and a throw from here would replace that named failure with a stack trace.
        plant: () => {
          if (agentMd) fs.appendFileSync(path.join(agentDir, agentMd), '\n<!-- A30 planted drift -->\n');
        },
      },
      'stale user-owned opencode.json': {
        rel: 'opencode.json',
        clearedBy: 'write-config',
        // The hand edit the file itself invites: a pinned standard-tier model. Any edit reads
        // stale (--check byte-compares against the renderer); this is the documented one.
        plant: () => {
          const p = path.join(scratch, 'opencode.json');
          fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
            .replace('"default_agent": "build"', '"default_agent": "build",\n  "model": "example/pinned-model"'));
        },
      },
      'unregistered canonical plugin': {
        rel: 'templates/opencode/plugins/' + ROGUE_PLUGIN,
        clearedBy: 'none',
        plant: () => {
          const dir = path.join(scratch, 'templates', 'opencode', 'plugins');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, ROGUE_PLUGIN), '// A30 fixture\n');
        },
      },
    };

    // One scenario per BRANCH PROFILE of the closing advice, not per subset of the classes. The
    // producer decides two things and nothing else: which flag it names (--write-config wins over
    // --write, and neither is named when no flag clears anything), and whether a source-edit line
    // is printed. The last entry is the only mixture where a flag is advised while part of the set
    // is flag-irreducible AND the config file is not involved — the profile that tempts a producer
    // into naming the stronger flag "so at least the rest gets fixed", which would overwrite the
    // user's model pins to repair a stale agent. The all-three set is deliberately absent: its
    // profile is identical to the entry above it, so it would re-run this loop for a branch
    // already measured.
    const SCENARIOS = [
      ['stale generated agent'],
      ['stale user-owned opencode.json'],
      ['unregistered canonical plugin'],
      ['stale user-owned opencode.json', 'stale generated agent'],
      ['stale user-owned opencode.json', 'unregistered canonical plugin'],
      ['stale generated agent', 'unregistered canonical plugin'],
    ];

    let adviceSeen = 0;
    for (const ids of SCENARIOS) {
      const tag = 'A30[' + ids.join(' + ') + ']';
      const planted = ids.map(i => CLASSES[i].rel).sort();
      const flagProof = ids.filter(i => CLASSES[i].clearedBy === 'none').map(i => CLASSES[i].rel).sort();
      const needsConfigFlag = ids.some(i => CLASSES[i].clearedBy === 'write-config');
      const someFlagHelps = ids.some(i => CLASSES[i].clearedBy !== 'none');
      const plant = () => { restore(pristine); for (const i of ids) CLASSES[i].plant(); };

      // ---- the report itself, and the two controls that make the rest mean something --------
      plant();
      const c0 = check();
      assert(c0.status === 1,
        tag + ': the planted tree fails --check (exit ' + c0.status + ') — a plant that did not '
        + 'take makes every assertion below a statement about a clean tree');
      assert(JSON.stringify(reported(c0.out)) === JSON.stringify(planted),
        tag + ': --check reports EXACTLY the planted mismatches — expected ' + JSON.stringify(planted)
        + ', parsed ' + JSON.stringify(reported(c0.out)) + '. A different set means a different '
        + 'scenario; an empty one means the mismatch lines stopped being parseable and the '
        + 'outcome checks below would be comparing nothing to nothing');

      const advised = advisedCommands(c0.out);
      adviceSeen += advised.length;

      // ---- what the maximal flag can do, MEASURED, not assumed ------------------------------
      // --write-config is --write plus the forced config rewrite, so it is the most any flag of
      // this script can clear. Whatever survives IT is the flag-irreducible remainder, and that
      // is the only thing the advice is allowed to leave behind. Measured per scenario because
      // otherwise a fixture where the flag silently did nothing would let the wrong advice pass.
      plant();
      run(['--forge=github', '--write-config']);
      const irreducible = reported(check().out);
      assert(JSON.stringify(irreducible) === JSON.stringify(flagProof),
        tag + ': the strongest flag this script has (--write-config) clears everything except '
        + JSON.stringify(flagProof) + ' — measured ' + JSON.stringify(irreducible) + '. This is the '
        + 'reference the advice is held to, so a fixture where the flag did nothing would excuse '
        + 'advice that also does nothing');

      // ---- THE PROPERTY: run what it advised, and see what is left --------------------------
      plant();
      for (const cmd of advised) run(cmd);
      const surviving = reported(check().out);
      assert(JSON.stringify(surviving) === JSON.stringify(irreducible),
        tag + ': after running what --check advised, the only mismatches left are the ones NO '
        + 'flag of this script can clear. Advised ' + JSON.stringify(advised) + '; left behind '
        + JSON.stringify(surviving) + ', irreducible ' + JSON.stringify(irreducible)
        + '. A reader who does exactly what the last line of the report tells them must not be '
        + 'left holding a mismatch a different flag would have fixed');

      // ---- and nothing it advised may be a no-op --------------------------------------------
      // Individually, against a fresh plant, so the rule is order-independent: a second command
      // is not condemned for finding the first one's work already done.
      for (const cmd of advised) {
        plant();
        run(cmd);
        const left = reported(check().out);
        assert(left.length < planted.length,
          tag + ': the advised command ' + JSON.stringify(cmd) + ' clears at least one of the '
          + 'mismatches reported alongside it — run on its own it left ' + JSON.stringify(left)
          + ' of ' + JSON.stringify(planted) + ' standing. Naming a command that changes nothing '
          + 'is worse than naming none: it exits 0 and reports the tree already in sync');
      }

      // ---- per-set expectations ---------------------------------------------------------------
      if (someFlagHelps) {
        assert(advised.length >= 1,
          tag + ': --check still hands the reader a runnable command — a flag DOES clear part of '
          + 'this set, and replacing a wrong command with vague prose would regress every class '
          + 'the current line is right about');
      } else {
        assert(advised.length === 0,
          tag + ': NO flag of this script clears anything in this set, so --check offers no '
          + 'runnable invocation of it at all — it offered ' + JSON.stringify(advised) + '. The '
          + 'per-mismatch reason already names the real remedy; a command line printed under it '
          + 'is read as the fix and exits 0 having done nothing');
      }
      if (!needsConfigFlag) {
        for (const cmd of advised) {
          assert(!cmd.includes('--write-config'),
            tag + ': --write-config is NOT advised here — nothing in this set needs it, and it '
            + 'rewrites the user-owned opencode.json, destroying the model pins that file invites '
            + 'the user to hand-edit. It clears 13 of the 14 classes, which is exactly what makes '
            + 'it tempting as a blanket answer. Advised: ' + JSON.stringify(cmd));
        }
      }
      if (ids.includes('unregistered canonical plugin')) {
        assert(c0.out.includes('PLUGIN_SCRIPTS'),
          tag + ': the report still names PLUGIN_SCRIPTS — the allowlist edit is the ONLY remedy '
          + 'for this class, so the reason line that names it is the whole of what the reader gets');
      }
    }

    assert(adviceSeen > 0,
      'A30: at least one scenario yielded a parseable advised command — with none, the '
      + '"no no-op advice" and "no blanket --write-config" checks above range over an empty list '
      + 'and pass by having read nothing');

    restore(pristine);
    assert(check().status === 0,
      'A30: the scratch repo is green again after the last restore — a restore that does not '
      + 'undo a plant would have leaked one scenario into the next');
  } finally {
    try { rmSync(scratch, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// A31 + A32 — WHERE THE GENERATED TREE LANDS, AND WHO REFRESHES IT.
//
// THE OBSERVED FAILURE, which is what these two bands exist for. A run regenerated all six
// edition trees, its record says so, and every tree it wrote died with the worktree it wrote
// them in: the main checkout was never touched, and twelve files there kept prose that tells a
// reader to pass a flag canonical had already renamed. Nothing reported it — the trees are
// gitignored, so `git status` is silent, and every chain-resident guard renders the surfaces in
// memory rather than reading a tree, so all four stayed green over the twelve stale files.
//
// Two properties close that, and they are stated as RESULTS because neither is a claim about
// how a root is computed:
//
//   A31  a sync run FROM a linked worktree writes the MAIN checkout's tree, rendered from the
//        INVOKING checkout's canonical sources, and leaves no throwaway tree behind.
//   A32  the regenerate step the skeleton rule already mandates leaves every edition tree that
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

  const fixture = mkdtempSync(path.join(os.tmpdir(), 'oc-a31-'));
  const mainRoot = path.join(fixture, 'main');     // A31: the main checkout
  const wtRoot = path.join(fixture, 'wt');         // A31: a genuine linked worktree of it
  const plainRoot = path.join(fixture, 'plain');   // A31: a copy that is not a git checkout at all
  const neutralCwd = path.join(fixture, 'cwd');    // A31: a cwd belonging to no checkout
  const regenRoot = path.join(fixture, 'regen');   // A32

  // The generator's whole input surface. `plugins` carries the gitlab/gitea command sources, so a
  // non-default forge is unrenderable without it; the green-baseline assertions keep the list honest.
  const SOURCE_TREES = ['scripts', 'agents', 'commands', 'hooks', 'templates', 'plugins'];
  const childEnv = Object.assign({}, process.env);
  delete childEnv.KAOLA_OPENCODE_STANDARD_MODEL;
  delete childEnv.KAOLA_OPENCODE_REASONING_MODEL;

  const copyRepo = dest => {
    fs.mkdirSync(dest, { recursive: true });
    for (const d of SOURCE_TREES) cpSync(path.join(REPO, d), path.join(dest, d), { recursive: true });
    cpSync(path.join(REPO, 'opencode.json'), path.join(dest, 'opencode.json'));
  };
  // Identity and signing are pinned per invocation: a fixture that inherits the developer's
  // git config fails on a machine that signs commits, and a red there says nothing about the
  // property under test.
  // `protocol.file.allow` is needed for the submodule leg in A33: modern git refuses a file://
  // submodule clone by default, and that refusal would be a fixture failure wearing a finding's name.
  const git = (cwd, args) => {
    // spawn-class: environment
    const r = spawnSync('git',
      ['-c', 'user.email=a31@fixture.invalid', '-c', 'user.name=a31', '-c', 'commit.gpgsign=false',
        '-c', 'protocol.file.allow=always'].concat(args), { cwd, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
  };
  // scriptRoot is the checkout the script is INVOKED FROM; cwd is the process's working directory.
  // They are passed separately on purpose — "not cwd" is half of what A31 pins.
  // The two streams are returned SEPARATELY as well as merged. A34 below is the only caller that
  // needs them apart, and it needs them apart for a reason the merged view cannot express: this
  // script's stdout is a parsed interface in another mode, so "which stream" is itself a property.
  const runSync = (scriptRoot, cwd, args) => {
    // spawn-class: environment
    const r = spawnSync(process.execPath,
      [path.join(scriptRoot, 'scripts', 'sync-opencode-edition.js')].concat(args),
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
  const head = out => String(out).split('\n').filter(Boolean).slice(0, 4).join(' | ');

  // The forge axis, taken from the module rather than typed: one default tree, one non-default
  // tree, and one that stays absent. A32's "present is refreshed, absent is left alone" needs all
  // three, and an axis that ever shrinks below three should red here rather than silently drop a leg.
  const DEF_FORGE = sync.DEFAULT_FORGE;
  const OTHER_FORGE = sync.FORGES.filter(f => f !== DEF_FORGE)[0];
  const ABSENT_FORGE = sync.FORGES.filter(f => f !== DEF_FORGE && f !== OTHER_FORGE)[0];

  try {
    const missingTrees = SOURCE_TREES.filter(d => !fs.existsSync(path.join(REPO, d)));
    assert(missingTrees.length === 0,
      'A31: every source tree these fixtures copy is present in the repo — ' + JSON.stringify(missingTrees)
      + ' is not, so the copies below are missing an input the generator reads and every assertion '
      + 'would be reporting on a tree of absent files rather than on where a tree landed');
    assert(!!OTHER_FORGE && !!ABSENT_FORGE,
      'A31/A32: the forge axis carries at least three forges (' + JSON.stringify(sync.FORGES) + ') — '
      + 'A32 needs a present default tree, a present non-default tree and an absent one, and with '
      + 'fewer the absent-tree leg would range over nothing and pass by having checked nothing');

    // -----------------------------------------------------------------------
    // A31 — the fixture: a committed repo plus a real linked worktree.
    // -----------------------------------------------------------------------
    copyRepo(mainRoot);
    const gitSteps = [
      ['init', ['init', '-q']],
      ['add', ['add', '-A']],
      ['commit', ['commit', '-q', '--no-verify', '-m', 'a31 fixture base']],
      ['worktree', ['worktree', 'add', '-q', '-b', 'a31-branch', wtRoot]],
    ];
    let fixtureBuilt = true;
    for (const [name, args] of gitSteps) {
      const r = git(mainRoot, args);
      if (r.status !== 0) fixtureBuilt = false;
      assert(r.status === 0,
        'A31: the fixture builds — git ' + name + ' exited ' + r.status + ': ' + head(r.out)
        + '. Every assertion below reads a tree out of this repo or its worktree, so a fixture that '
        + 'did not build is a band that checked nothing');
    }
    assert(fixtureBuilt && fs.existsSync(path.join(wtRoot, 'scripts')),
      'A31: the linked worktree has a checkout to run from — without one the sync spawns below '
      + 'would fail to find their own script and every result would be an artifact of that');

    if (fixtureBuilt) {
      const w0 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--write']);
      assert(w0.status === 0,
        'A31: the fixture regenerates — sync --write exit ' + w0.status + ': ' + head(w0.out));
      const c0 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--check']);
      assert(c0.status === 0,
        'A31: the fixture is GREEN before anything is planted. The markers below are read as the '
        + 'only difference between the two checkouts, so a fixture already red — an under-copied '
        + 'source tree, an exported model pin — is a different test wearing this one\'s name. Got '
        + 'exit ' + c0.status + ': ' + head(c0.out));

      const agentFile = (fs.existsSync(path.join(mainRoot, 'agents'))
        ? fs.readdirSync(path.join(mainRoot, 'agents')).filter(f => f.endsWith('.md')).sort() : [])[0] || '';
      assert(agentFile !== '',
        'A31: the fixture has a canonical agent to plant a marker in — with none there is no '
        + 'subject and both markers would be absent from every tree for a reason that is not the '
        + 'one this band reports');

      const MAIN_MARK = 'A31-MARKER-PLANTED-IN-MAIN';
      const WT_MARK = 'A31-MARKER-PLANTED-IN-WORKTREE';
      const renderedRel = path.join(sync.treeLabel(DEF_FORGE), 'agent', agentFile);

      if (agentFile) {
        // Control: a canonical edit reaches the rendered surface AT ALL. Without it, the marker
        // assertions below could red forever against a correct implementation, and a marker that
        // never renders would make the "main's marker is gone" half true for the wrong reason.
        fs.appendFileSync(path.join(mainRoot, 'agents', agentFile), '\n' + MAIN_MARK + '\n');
        const w1 = runSync(mainRoot, mainRoot, ['--forge=' + DEF_FORGE, '--write']);
        assert(w1.status === 0,
          'A31: the fixture regenerates after the main-side plant — exit ' + w1.status + ': ' + head(w1.out));
        assert(readIf(path.join(mainRoot, renderedRel)).includes(MAIN_MARK),
          'A31: control — an edit to a canonical agent reaches its rendered surface. It did not '
          + 'reach ' + renderedRel + ', so this fixture cannot tell WHICH checkout\'s sources were '
          + 'rendered and both marker assertions below would be vacuous');

        fs.appendFileSync(path.join(wtRoot, 'agents', agentFile), '\n' + WT_MARK + '\n');
        assert(!readIf(path.join(wtRoot, 'agents', agentFile)).includes(MAIN_MARK),
          'A31: control — the worktree holds its own copy of the canonical sources. If it shared '
          + 'main\'s file, both markers would be in both checkouts and the discriminator would be gone');

        // ------------------------------------------------------------------
        // A31 — THE SUBJECT: sync --write, run from the linked worktree.
        // ------------------------------------------------------------------
        const w2 = runSync(wtRoot, wtRoot, ['--forge=' + DEF_FORGE, '--write']);
        assert(w2.status === 0,
          'A31: sync --write run from a linked worktree succeeds — exit ' + w2.status + ': ' + head(w2.out));

        const landed = readIf(path.join(mainRoot, renderedRel));
        assert(landed.includes(WT_MARK),
          'A31: a sync run from a linked worktree writes the MAIN checkout\'s edition tree. '
          + path.join(mainRoot, renderedRel) + ' does not carry the worktree\'s marker, so the '
          + 'regenerate a run performs on its branch leaves main\'s tree exactly as stale as it '
          + 'found it — the observed failure this band exists for');
        assert(!landed.includes(MAIN_MARK),
          'A31: ...and renders it from the INVOKING checkout\'s canonical sources. Main\'s tree still '
          + 'carries the marker planted in MAIN\'s agents/, which means the sources were resolved '
          + 'against the main checkout too — a sync from a worktree would then re-render main from '
          + 'its own unchanged sources and the run\'s edits would never reach any tree');
        assert(!fs.existsSync(path.join(wtRoot, sync.treeLabel(DEF_FORGE))),
          'A31: ...and leaves no throwaway tree in the worktree. '
          + path.join(wtRoot, sync.treeLabel(DEF_FORGE)) + ' exists: a tree written there is deleted '
          + 'with the worktree, which is how a run can report six trees in parity and leave twelve '
          + 'stale files behind');

        const c2 = runSync(wtRoot, wtRoot, ['--forge=' + DEF_FORGE, '--check']);
        assert(c2.status === 0,
          'A31: --check and --write agree about which root holds the tree. Run from the worktree, '
          + '--check exited ' + c2.status + ' over a tree --write had just made current: ' + head(c2.out)
          + '. A checker looking at one root while the writer writes another reports a permanent '
          + 'false red in exactly the posture a run works in');
      }
    }

    // -----------------------------------------------------------------------
    // A31 — the non-git leg. Resolving main is a new dependency on git, and the sync also runs
    // from an unpacked source tree that is no checkout at all (the installers call it from wherever
    // they were unpacked). Neither root exists there, so the tree belongs where the script does —
    // and never in the process cwd, which is the other thing "resolve against the main checkout"
    // must not be read to mean.
    // -----------------------------------------------------------------------
    copyRepo(plainRoot);
    fs.mkdirSync(neutralCwd, { recursive: true });
    assert(!fs.existsSync(path.join(plainRoot, '.git')),
      'A31: the non-git leg\'s copy really is not a git checkout — with a .git in it this leg would '
      + 'be a second copy of the leg above rather than the fallback case');
    const w3 = runSync(plainRoot, neutralCwd, ['--forge=' + DEF_FORGE, '--write']);
    assert(w3.status === 0,
      'A31: sync --write succeeds in a directory that is not a git checkout — exit ' + w3.status
      + ': ' + head(w3.out) + '. An unpacked source tree has no main checkout to resolve, and a '
      + 'resolution that throws there breaks both installers');
    assert(fs.existsSync(path.join(plainRoot, sync.treeLabel(DEF_FORGE), 'agent')),
      'A31: ...and writes the tree into the root the script itself lives in');
    assert(!fs.existsSync(path.join(neutralCwd, sync.treeLabel(DEF_FORGE))),
      'A31: ...and never into the process cwd — the tree landed in ' + neutralCwd + ', which owns '
      + 'no canonical sources and is not what "the main checkout" means');
    const c3 = runSync(plainRoot, neutralCwd, ['--forge=' + DEF_FORGE, '--check']);
    assert(c3.status === 0,
      'A31: --check agrees in the non-git case too — exit ' + c3.status + ': ' + head(c3.out));

    // -----------------------------------------------------------------------
    // A33 — THE TREE IS NEVER WRITTEN INTO A DIRECTORY GIT OWNS.
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

    // Leg 1 — bare repository with a linked worktree. Cloned from the A31 fixture, which already
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
        assert(r.status === 0, 'A33[bare]: the fixture builds — git ' + name + ' exited ' + r.status
          + ': ' + head(r.out));
      }
      if (built && fs.existsSync(path.join(bareWt, 'scripts'))) {
        treeLandingLegs.push({ tag: 'bare', checkout: bareWt });
      } else {
        assert(false, 'A33[bare]: the bare repo\'s worktree has a checkout to run from — without one '
          + 'this posture is untested and its absence would read as a pass');
      }
    }

    // Leg 2 — submodule. Its `.git` is a FILE pointing into the superproject's storage, which is
    // the posture that produces a `.git/modules/...` coordination dir.
    {
      const sup = path.join(fixture, 'super');
      fs.mkdirSync(sup, { recursive: true });
      fs.writeFileSync(path.join(sup, 'README.md'), '# A33 superproject fixture\n');
      let built = true;
      for (const [name, args] of [
        ['init', ['init', '-q']],
        ['add', ['add', '-A']],
        ['commit', ['commit', '-q', '--no-verify', '-m', 'a33 superproject']],
        ['submodule add', ['submodule', 'add', '-q', mainRoot, 'sub']],
      ]) {
        const r = git(sup, args);
        if (r.status !== 0) built = false;
        assert(r.status === 0, 'A33[submodule]: the fixture builds — git ' + name + ' exited '
          + r.status + ': ' + head(r.out));
      }
      const sub = path.join(sup, 'sub');
      if (built && fs.existsSync(path.join(sub, 'scripts'))) {
        treeLandingLegs.push({ tag: 'submodule', checkout: sub });
      } else {
        assert(false, 'A33[submodule]: the submodule has a checkout to run from — without one this '
          + 'posture is untested and its absence would read as a pass');
      }
    }

    assert(treeLandingLegs.length === 2,
      'A33: both postures were constructed (' + treeLandingLegs.length + ' of 2) — a leg that failed '
      + 'to build checks nothing, and this band is the only place either posture is exercised');

    for (const leg of treeLandingLegs) {
      const tag = 'A33[' + leg.tag + ']';
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
      assert(fs.existsSync(path.join(beside, 'agent')),
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
    // A32 — THE MANDATED REGENERATE STEP LEAVES A PRESENT TREE CURRENT.
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
    // root resolution A31 already owns: main resolves to regenRoot itself either way.
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '--no-verify', '-m', 'a32 fixture base']]) {
      const r = git(regenRoot, args);
      assert(r.status === 0, 'A32: the fixture builds — git ' + args[0] + ' exited ' + r.status + ': ' + head(r.out));
    }

    for (const forge of [DEF_FORGE, OTHER_FORGE]) {
      const w = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--write']);
      assert(w.status === 0,
        'A32: the fixture materializes ' + sync.treeLabel(forge) + ' — exit ' + w.status + ': ' + head(w.out));
      const c = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--check']);
      assert(c.status === 0,
        'A32: ' + sync.treeLabel(forge) + ' is in parity BEFORE the skeleton is edited — exit '
        + c.status + ': ' + head(c.out) + '. Every assertion below reads a --check exit as the '
        + 'answer to "did the regenerate step refresh this tree", which it is not if the tree was '
        + 'already stale');
    }
    assert(!fs.existsSync(path.join(regenRoot, sync.treeLabel(ABSENT_FORGE))),
      'A32: ' + sync.treeLabel(ABSENT_FORGE) + ' is absent from the fixture — it is the absent-tree '
      + 'leg\'s whole subject, and a tree that is there makes that leg check nothing');

    const skeleton = path.join(regenRoot, 'templates', 'routing', 'next.skeleton.md');
    assert(fs.existsSync(skeleton),
      'A32: the skeleton the regenerate step renders from is present at templates/routing — the '
      + 'edit below is what makes every tracked surface, and then every tree, stale');
    if (fs.existsSync(skeleton)) {
      const SKEL_MARK = 'A32-MARKER-FROM-THE-SKELETON';
      fs.appendFileSync(skeleton, '\n' + SKEL_MARK + '\n');

      // Control: the plant reaches the tracked surfaces. Without this the trees could be in parity
      // after the regenerate step simply because nothing ever changed, and every assertion below
      // would be green over an edit that went nowhere.
      const g0 = runGenerator(regenRoot, ['--check']);
      assert(g0.status === 1,
        'A32: control — the skeleton edit makes the tracked surfaces stale (--check exit ' + g0.status
        + ': ' + head(g0.out) + '). If it does not, the regenerate step below has nothing to '
        + 'propagate and the parity assertions pass by having observed no change at all');

      // THE SUBJECT: the step the rule mandates, and nothing else.
      const g1 = runGenerator(regenRoot, ['--write']);
      assert(g1.status === 0,
        'A32: the regenerate step succeeds — generate-routing-surfaces --write exit ' + g1.status
        + ': ' + head(g1.out));
      const g2 = runGenerator(regenRoot, ['--check']);
      assert(g2.status === 0,
        'A32: the regenerate step still does its own job — the tracked surfaces byte-match the '
        + 'skeleton afterwards (--check exit ' + g2.status + ': ' + head(g2.out) + ')');

      for (const forge of [DEF_FORGE, OTHER_FORGE]) {
        const c = runSync(regenRoot, regenRoot, ['--forge=' + forge, '--check']);
        assert(c.status === 0,
          'A32: after the regenerate step, the PRESENT tree ' + sync.treeLabel(forge) + ' is current '
          + '— --check exited ' + c.status + ': ' + head(c.out) + '. The prose reached every tracked '
          + 'surface and stopped one hop short of the tree a runtime reads, which is the whole of '
          + 'what leaves an edition deploying a renamed flag');
      }
      assert(readIf(path.join(regenRoot, sync.treeLabel(DEF_FORGE), 'command', 'workflow-next.md')).includes(SKEL_MARK),
        'A32: ...and the tree carries the edited prose itself, not merely a passing exit code — '
        + sync.treeLabel(DEF_FORGE) + '/command/workflow-next.md does not contain the marker planted '
        + 'in the skeleton');

      assert(!fs.existsSync(path.join(regenRoot, sync.treeLabel(ABSENT_FORGE))),
        'A32: ...and an ABSENT tree is left absent. The regenerate step materialized '
        + sync.treeLabel(ABSENT_FORGE) + ', handing a developer a forge tree they never installed; '
        + 'a tree that does not exist carries no stale prose and needs no refresh');

      // ---------------------------------------------------------------------
      // A32 — AND THE CHAINS GAIN NO EDITION COVERAGE. Green on arrival, and said out loud: this
      // pins a ruling rather than a repair. generate-routing-surfaces --check runs in all four
      // chains, so an edition tree read in CHECK mode would put the editions inside `npm test` —
      // the one thing the rule at CLAUDE.md's validation policy forbids, and the reason the
      // refresh belongs to --write alone. A stale tree here must not move --check's exit code, and
      // --check must not repair what it saw either: a checker that writes is how the drift that
      // started all this stayed invisible.
      // ---------------------------------------------------------------------
      const planted = path.join(regenRoot, sync.treeLabel(DEF_FORGE), 'command', 'workflow-next.md');
      if (fs.existsSync(planted)) {
        const before = fs.readFileSync(planted, 'utf8');
        fs.writeFileSync(planted, before + '\n<!-- A32 planted tree drift -->\n');
        const cPlant = runSync(regenRoot, regenRoot, ['--forge=' + DEF_FORGE, '--check']);
        assert(cPlant.status === 1,
          'A32: control — the planted tree drift is real (sync --check exit ' + cPlant.status + ': '
          + head(cPlant.out) + '). With no drift on disk the two assertions below observe nothing');
        const g3 = runGenerator(regenRoot, ['--check']);
        assert(g3.status === 0,
          'A32: a stale edition tree does not move generate-routing-surfaces --check, which runs in '
          + 'all four chains — exit ' + g3.status + ': ' + head(g3.out) + '. An edition tree read in '
          + 'CHECK mode puts the editions inside `npm test`, and reds every fresh clone and every '
          + 'worktree besides, where no tree exists to compare');
        assert(fs.readFileSync(planted, 'utf8').includes('A32 planted tree drift'),
          'A32: ...and --check did not repair it either. A check that writes destroys the evidence '
          + 'it was run to report, which is the defect the drift block at the top of this file exists '
          + 'to stop being repeated');
      }
    }

    // -----------------------------------------------------------------------
    // A34 — A REFRESH THAT REACHES ANOTHER CHECKOUT SAYS SO.
    //
    // A31 pins WHERE the tree lands, and that is unchanged and deliberate: a refresh run from a
    // linked worktree writes the MAIN checkout's trees. What it leaves behind is a reader in main
    // whose deployed-from trees just moved under them with nothing to notice — the trees are
    // gitignored, so `git status` is silent, and every chain-resident guard renders in memory
    // rather than reading a tree. The announcement is the entire remedy, and until this band
    // nothing read it: A31 and A32 are both green with the note deleted, so it could be removed
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
    // THE COUNT IS NOT ASSERTED, deliberately. It is changes APPLIED, not a file tally: a prune
    // removes a retired directory in one call and counts it once. A leg comparing the number to a
    // file count would pin an arithmetic the script does not promise and has a comment disclaiming.
    // -----------------------------------------------------------------------
    const A34_NOTE = 'NOTE';
    const a34MainTree = path.join(mainRoot, sync.treeLabel(DEF_FORGE));
    const a34Ready = fs.existsSync(a34MainTree) && fs.existsSync(path.join(wtRoot, 'scripts'));
    assert(a34Ready,
      'A34: A31\'s two-root fixture is still standing — main\'s ' + sync.treeLabel(DEF_FORGE)
      + ' is present at ' + a34MainTree + ' and the worktree has a checkout to run from. Without '
      + 'both, every leg below reports on a refresh that found no tree to touch, and each one '
      + 'would read as a pass');
    if (a34Ready) {
      // The root the note must name, in BOTH spellings. The fixture lives under a tmpdir that is a
      // symlink on macOS (/var -> /private/var) and the script prints the root git resolved, which
      // may be the realpath — so a comparison against the fixture's own spelling alone would red on
      // the platform rather than on the property.
      const a34Roots = [mainRoot];
      try { a34Roots.push(fs.realpathSync(mainRoot)); } catch (_) { /* the literal spelling stands */ }
      const namesTheOtherRoot = s => a34Roots.some(r => String(s).includes(r));

      const a34Agent = (fs.existsSync(path.join(wtRoot, 'agents'))
        ? fs.readdirSync(path.join(wtRoot, 'agents')).filter(f => f.endsWith('.md')).sort() : [])[0] || '';
      assert(a34Agent !== '' && fs.existsSync(path.join(mainRoot, 'agents', a34Agent)),
        'A34: both checkouts hold a canonical agent to edit — with none there is no way to make a '
        + 'refresh change anything, and the fires-leg below would be observing an empty refresh');

      if (a34Agent && fs.existsSync(path.join(mainRoot, 'agents', a34Agent))) {
        const a34Rendered = path.join(a34MainTree, 'agent', a34Agent);

        // SETTLE FIRST. The in-parity leg needs a refresh that genuinely changes nothing, and what
        // A31 left is not that by construction: it wrote ONE forge with --write, while
        // --refresh-present covers every tree that is present. So one run settles the tree and the
        // NEXT one is the measurement.
        runSync(wtRoot, wtRoot, ['--refresh-present']);

        // (a) SILENT WHEN NOTHING CHANGED IN THE OTHER CHECKOUT.
        const r0 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(r0.status === 0,
          'A34: --refresh-present from the linked worktree succeeds — exit ' + r0.status + ': '
          + head(r0.out));
        // One word, not the sentence. This line is only printed when a tree was found present, so
        // its presence is the whole signal; matching more of it would put this band's controls back
        // in the business of holding wording that has already been reworded twice.
        assert(r0.stdout.includes('refreshed'),
          'A34: control — that in-parity run did find a tree and refresh it (stdout: '
          + head(r0.stdout) + '). A run that found nothing present is silent for a reason that has '
          + 'nothing to do with the gate, and the assertion below would then pass forever without '
          + 'ever observing the gate it names');
        assert(!r0.stderr.includes(A34_NOTE),
          'A34: a refresh that changed NOTHING in the other checkout stays silent. It announced '
          + 'anyway: ' + head(r0.stderr) + '. The writers content-compare, so this run left the '
          + 'other checkout byte-identical — a warning attached to a run that touched nothing is '
          + 'how a reader learns to skip the one that did');

        // (b) FIRES on a real cross-checkout change, (c) NAMES the root, (d) on STDERR only.
        const WT_MARK_34 = 'A34-MARKER-FROM-THE-WORKTREE';
        fs.appendFileSync(path.join(wtRoot, 'agents', a34Agent), '\n' + WT_MARK_34 + '\n');
        const r1 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(r1.status === 0,
          'A34: the changing refresh succeeds — exit ' + r1.status + ': ' + head(r1.out));
        assert(readIf(a34Rendered).includes(WT_MARK_34),
          'A34: control — that refresh really did change the OTHER checkout. ' + a34Rendered
          + ' does not carry the marker just planted in the worktree\'s canonical agent, so there '
          + 'was no cross-checkout change to announce and the three assertions below would be '
          + 'asking whether a note fired for an event that never happened');
        assert(r1.stderr.includes(A34_NOTE),
          'A34: a refresh that changes a checkout which is not this one ANNOUNCES it. It said '
          + 'nothing: ' + head(r1.stderr) + '. The trees are gitignored and no chain reads one, so '
          + 'with this note gone the reader who could act on the change is the only one who cannot '
          + 'see it happened');
        assert(namesTheOtherRoot(r1.stderr),
          'A34: ...and names the root a reader has to go and look at. The announcement does not '
          + 'contain ' + mainRoot + ': ' + head(r1.stderr) + '. Every other line this script prints '
          + 'names a tree by its repo-relative label, which reads as "beside me" in the one posture '
          + 'where it is not, so an announcement without the absolute root repeats the confusion it '
          + 'exists to clear');
        assert(!r1.stdout.includes(A34_NOTE),
          'A34: ...and it lands on stderr, never stdout. It is on stdout: ' + head(r1.stdout)
          + '. This script\'s stdout is a parsed interface in another mode — both edition '
          + 'installers consume --print-tree-root as a filesystem path — so an advisory there is a '
          + 'line a caller will try to open');

        // (e) SILENT FROM THE CHECKOUT THAT OWNS THE TREE, THOUGH FILES ARE WRITTEN.
        const MAIN_MARK_34 = 'A34-MARKER-FROM-MAIN';
        fs.appendFileSync(path.join(mainRoot, 'agents', a34Agent), '\n' + MAIN_MARK_34 + '\n');
        const r2 = runSync(mainRoot, mainRoot, ['--refresh-present']);
        assert(r2.status === 0,
          'A34: --refresh-present from the main checkout succeeds — exit ' + r2.status + ': '
          + head(r2.out));
        assert(readIf(a34Rendered).includes(MAIN_MARK_34),
          'A34: control — the main-checkout refresh WROTE, and wrote real changes. ' + a34Rendered
          + ' does not carry the marker planted in main\'s own canonical agent, so this run changed '
          + 'nothing and the silence below would be the changed-nothing gate rather than the '
          + 'same-checkout gate this leg is for');
        assert(!r2.stderr.includes(A34_NOTE) && !r2.stdout.includes(A34_NOTE),
          'A34: ...and a refresh from the checkout that OWNS the tree says nothing, on either '
          + 'stream. It announced: ' + head(r2.out) + '. Nothing crossed a checkout boundary here — '
          + 'the reader is already looking at the tree that changed, and a note in the ordinary '
          + 'posture is the false positive that empties the real one of meaning');

        // (f) A DELETION-ONLY REFRESH FIRES TOO. The count sums the prunes, because a refresh can
        // DELETE from the other checkout and write nothing — the more destructive half of the same
        // reach, and the half a write-only count reports as a silent no-op. The stray goes into
        // MAIN's tree and the refresh runs from the WORKTREE, whose sources the tree is otherwise
        // in parity with after the settle, so the prune is the only change there is.
        runSync(wtRoot, wtRoot, ['--refresh-present']);
        const a34Stray = path.join(a34MainTree, 'agent', '__a34-retired-probe.md');
        fs.writeFileSync(a34Stray, '# A34 retired-artifact probe\n');
        const r3 = runSync(wtRoot, wtRoot, ['--refresh-present']);
        assert(!fs.existsSync(a34Stray),
          'A34: control — the stray really is a retired artifact and the refresh pruned it. It is '
          + 'still at ' + a34Stray + ', so this refresh deleted nothing and the assertion below '
          + 'would be reading a note raised by some other change');
        // Presence only. Whether the announcement names the root is pinned once, above, on the
        // firing leg; re-asserting it here made this leg red for a reason that is not its own —
        // measured, by a mutation that dropped the root and reddened two legs instead of one.
        assert(r3.stderr.includes(A34_NOTE),
          'A34: a refresh whose ONLY change in the other checkout is a deletion is announced too. '
          + 'It was silent: ' + head(r3.stderr) + '. A gate counting writes alone reports the '
          + 'destructive half of a cross-checkout reach as a no-op');
      }
    }
  } finally {
    try { rmSync(fixture, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

if (failed) {
  console.error('\nopencode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('opencode-edition test passed (' + passed + ' assertions).' + driftVerdict);
