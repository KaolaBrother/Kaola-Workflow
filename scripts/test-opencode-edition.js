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
const treeRootFor = forge => path.join(REPO, sync.treeLabel(forge));
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
  for (const label of verified) console.log('D0: ' + label + ' is present and in parity with canonical.');
  for (const label of absent) {
    console.log('D0: SKIPPED — ' + label + ' is absent from disk, so nothing was compared '
      + '(gitignored generated tree; a fresh clone has none).');
  }
  driftVerdict = ' [drift-check: '
    + (verified.length ? verified.length + ' tree(s) in parity (' + verified.join(', ') + ')'
                       : 'NO tree verified')
    + (absent.length ? '; ' + absent.length + ' ABSENT, not checked (' + absent.join(', ') + ')' : '')
    + ']';
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
assert(fs.existsSync(treeRootFor(sync.DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(sync.DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked nothing');

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
// assertNoBadgeResidue in sync-opencode-edition.js, which hard-errors the render on any surviving
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
  assert(!fs.existsSync(path.join(REPO, '.opencode', 'agent', retired)),
    'A13: the retired role ' + retired + ' must not ship on the opencode edition');
}
assert(sync.opencodeAgentSuffix('implementer') === ''
  && sync.opencodeAgentSuffix('code-reviewer') === '',
  'A13: opencodeAgentSuffix is empty for every surviving role — no agent body is rewritten');
// Same reading as the agent loop above: render DETERMINISM, not parity with canonical. Command
// bodies carry several DECLARED transforms (badge strip, Path Intent strip, placeholder strip,
// runtime rewrite, comma collapse), so a blanket line-survival rule of the A6-body kind would be a
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

// ---------------------------------------------------------------------------
// A12: adaptive effort tiers (the locked-in install default). With an explicit
// inherited model whose provider resolves under a CONTRACT_EFFORT_TABLE contract,
// renderOpencodeJson emits the two-tier EFFORT-VARIANT config: top-tier roles
// (exactly the canonical reasoning-tier roles — there is no second, install-time
// model axis) get the provider's TOP variant; standard roles get its SECOND
// variant. The per-tier variant names are provider-relative (mapTier). Unknown
// provider → safe DEFAULT contract (NO de-tier). NODE_MODEL_TIERS {opus,sonnet}
// stays the portable plan vocabulary; this only resolves a tier.
// ---------------------------------------------------------------------------
const topRoles = sync.topTierRoles();
const stdRoles = sync.standardTierRoles();
assert(JSON.stringify(topRoles) === JSON.stringify(reasoning),
  'A12: topTierRoles() is EXACTLY the canonical reasoning-tier role set (one source, no install-time axis); got ['
    + topRoles.join(', ') + '] vs [' + reasoning.join(', ') + ']');
for (const role of ['code-architect', 'code-reviewer', 'security-reviewer']) {
  assert(topRoles.includes(role), 'A12: reasoning-tier role ' + role + ' is on the top tier');
}
// Retiring the install-time model axis must not re-tier a role. These stay OFF the top tier:
// `adversarial-verifier` never had a `higher` variant, so its shipped tier is standard, and
// `build-error-resolver` is hot repair work. Both are raisable per node by the frozen plan.
assert(!topRoles.includes('implementer')
  && !topRoles.includes('adversarial-verifier') && !topRoles.includes('build-error-resolver'),
  'A12: standard-tier roles stay off the top tier');

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
assert(oai.agent.planner.variant === 'xhigh' && oai.agent.implementer.variant === 'high',
  'A12: openai top-tier → xhigh, standard-tier → high');

// A12 (FLIPPED #544): unknown provider NO LONGER degrades — it gets the safe-DEFAULT
// contract (high/medium), so a top/second split is preserved instead of collapsing.
const unk = parseRendered({ inheritModel: 'acme/unknown-model' });
assert(unk.provider !== undefined && unk.agent !== undefined,
  'A12: unknown provider emits a safe-default provider+agent block (NO de-tier)');
assert(unk.provider.acme.models['unknown-model'].variants.high
  && unk.provider.acme.models['unknown-model'].variants.medium,
  'A12: unknown provider gets default-contract high/medium variants');
assert(unk.agent.planner.variant === 'high' && unk.agent.implementer.variant === 'medium',
  'A12: unknown provider → default contract (planner=high, implementer=medium)');

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
  // (c) DELETED with its mechanism: the workflow-planner opencodeAgentSuffix addendum is
  //     retired, the suffix is empty for every role (A13), and there is no suffix prose
  //     left to assert neutrality over.

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
  const probe = path.join(REPO, '.opencode', 'command', 'kaola-workflow-__kw_retired_probe.md');
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
    // spawn-class: environment
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

  // P2–P5 (former --with-fast / --with-full / union-preserve opt-in-partition probes)
  // — DELETED IN FULL. #725 Phase A retires the fast/full opt-in partition itself;
  // every surface these probed (kaola-workflow-fast.md, kaola-workflow-phase[1-5].md)
  // is n2-deleted from canonical, so there is nothing left to opt into or lock in.

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
    // spawn-class: environment
    const h = spawnSync('node', ['--input-type=module', '-e', harness], {
      env: Object.assign({}, process.env, {
        OPENCODE_CONFIG_DIR: emptyCfg, KW_PLUGIN: pluginPath,
        KW_SCRIPT: 'kaola-workflow-subagent-dispatch-log.sh', KW_FAKEROOT: fakeRoot,
      }),
      encoding: 'utf8',
    });
    assert(h.status === 0, 'H1: hookPath ESM harness runs (got ' + h.status + (h.stderr ? ' — ' + String(h.stderr).split('\n')[0] : '') + ')');
    let out; try { out = JSON.parse(h.stdout); } catch (_) { out = {}; }
    const resolvedNorm = (out.resolved || '').replace(/\\/g, '/');
    assert(resolvedNorm.includes('.opencode/hooks/kaola-workflow-subagent-dispatch-log.sh'),
      'H1 (#F3): hookPath resolves a hook via the plugin-sibling ../hooks candidate when the project + config dir have none — got ' + JSON.stringify(out.resolved));
    assert(out.missing === null,
      'H1 (#F3): hookPath returns null (fail-open) for a hook that exists nowhere');
    try { rmSync(fakeRoot, { recursive: true, force: true }); } catch (_) {}
    try { rmSync(emptyCfg, { recursive: true, force: true }); } catch (_) {}
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

    const files = walk(path.join(REPO, tree));
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
    const actual = fs.readdirSync(path.join(REPO, tree, 'command')).filter(f => f.endsWith('.md')).sort();
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

if (failed) {
  console.error('\nopencode-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('opencode-edition test passed (' + passed + ' assertions).' + driftVerdict);
