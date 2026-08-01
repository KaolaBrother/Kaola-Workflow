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
// The kimi edition is delivered the Kimi-native way: directory-form Skills
// under `.kimi/skills/<name>/SKILL.md` (one Skill per canonical command, plus
// one `kaola-role-*` role-contract Skill per canonical agent — both counts are
// derived from the canonical trees, never typed here) plus `.kimi/hooks/` (1 byte-copied shell hook + the
// generated `kimi-hooks.toml` fragment the installer merges into the global
// config.toml). ONE model tier: every subagent inherits the session model (the
// Codex inherit precedent), so there is no variant/effort surface to assert —
// instead this suite locks the dispatch rewrite (read-only roles ↔
// subagent_type="explore", write roles ↔ "coder", each dispatch referencing
// its kaola-role-<role> Skill), the zero-Claude-leak invariant, the reviewer
// behavior-identity preservation, the hooks fragment, route reachability, and
// the install-kimi.sh partition/idempotency/uninstall contract (hermetic:
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
// Self-provision: regenerate .kimi/ from tracked canonical sources before any
// assertion that reads it. In a clean worktree .kimi/ is fully absent (it is
// gitignored); sync --write populates skills + hooks. This makes the suite
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
  walk(path.join(REPO, '.kimi'), '.kimi');
  return out;
}

const canonCommands = sync.listCanonCommands();                    // ['kaola-workflow-finalize.md', ...]
const canonCommandNames = canonCommands.map(f => f.slice(0, -3));  // command basenames
const canonAgents = sync.listCanonAgents();                        // roles (top-level agents/*.md only)
const roleDirNames = canonAgents.map(a => 'kaola-role-' + a);
const skillDir = name => '.kimi/skills/' + name + '/SKILL.md';

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
  const provisioned = fs.existsSync(path.join(REPO, '.kimi', 'skills'));
  assert(provisioned,
    'K0: the generated .kimi/skills tree exists after sync --write — an ABSENT tree must fail loudly '
    + 'here rather than let every readdir-driven loop below iterate over nothing');
  if (!provisioned) {
    // Stop here rather than let the first readdir throw: a stack trace is a worse report than one
    // line naming the cause, and every count after it would be meaningless.
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(REPO, '.kimi', 'skills') + ' — nothing below can be tested.');
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
// K0-body: every non-empty line of the canonical role contract survives into the generated
// kaola-role-* Skill. The kimi render wraps canonical agent bodies, and the declared rewrites
// (Claude script paths, --runtime) are substitutions, never deletions — measured: zero canonical
// body lines fail to survive, so the exemption set is EMPTY and any miss is a real transform. This
// is the assertion that a body-dropping generator cannot pass, and it reads only tracked bytes.
// ---------------------------------------------------------------------------
{
  const bodyOf = text => {
    const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    return m ? text.slice(m[0].length) : text;
  };
  let checkedLines = 0;
  for (const role of canonAgents) {
    const canonLines = bodyOf(read('agents/' + role + '.md')).split('\n').map(s => s.trim()).filter(Boolean);
    const rel = skillDir('kaola-role-' + role);
    const generated = exists(rel) ? read(rel) : '';
    const missing = canonLines.filter(line => !generated.includes(line));
    checkedLines += canonLines.length;
    assert(canonLines.length > 0,
      'K0-body[' + role + ']: the canonical role contract has a non-empty body — an empty one would '
      + 'make the survival check below vacuous');
    assert(missing.length === 0,
      'K0-body[' + role + ']: every canonical contract line survives into kaola-role-' + role
      + ' — ' + missing.length + ' of ' + canonLines.length + ' missing, first: '
      + JSON.stringify(String(missing[0]).slice(0, 120)));
  }
  assert(checkedLines > 0,
    'K0-body: the survival check covered at least one canonical contract line (scan bite)');
}

// ---------------------------------------------------------------------------
// K1: count/structure parity — one command Skill dir per canonical command + one kaola-role-*
// Skill dirs, set-equal to the canonical commands/*.md + top-level agents/*.md
// inventories (the canonical agent tree is flat — one file per role). Every SKILL.md carries a
// frontmatter `name` (the dir name, so Kimi registers the canonical slash
// command) and a non-empty `description` (required by directory-form Skills).
// ---------------------------------------------------------------------------
{
  const entries = fs.readdirSync(path.join(REPO, '.kimi', 'skills'), { withFileTypes: true });
  const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  const expected = [...canonCommandNames, ...roleDirNames].sort();
  assert(entries.length === expected.length && entries.every(e => e.isDirectory()),
    'K1: .kimi/skills/ holds exactly ' + expected.length + ' entries, all directories (no stray files)');
  assert(JSON.stringify(dirNames) === JSON.stringify(expected),
    'K1: .kimi/skills/ dir set == ' + canonCommandNames.length + ' canonical commands + '
    + roleDirNames.length + ' kaola-role-* roles — got ' + JSON.stringify(dirNames));
  const roleSet = dirNames.filter(d => d.startsWith('kaola-role-'));
  assert(roleSet.length === canonAgents.length,
    'K1: kaola-role-* skill count matches canonical agent count (' + canonAgents.length + ')');
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
  for (const role of canonAgents) {
    const { fm } = sync.parseFrontmatter(read(skillDir('kaola-role-' + role)));
    assert(fm.name === 'kaola-role-' + role,
      'K1[kaola-role-' + role + ']: role skill named kaola-role-<role>');
  }
}

// ---------------------------------------------------------------------------
// K2: no transform residue — the generated tree carries NO install-time model
// placeholders ({X_MODEL}, model="{...}"), NO Claude "MUST pass model="
// dispatch instructions, and NO doubled-comma (,,) card artifacts (locks
// transformCommandBody's badge strip + placeholder strip + comma collapse).
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
// THE INHERIT-MODEL PROSE REPLACEMENT HAS NO CARRIER LEFT. It was checked on
// `kaola-workflow-adapt`, the one surviving surface that dispatched an agent with an explicit
// model badge; that surface is retired and no generated skill carries a per-call model override to
// strip. The BAN half still runs — the loop above asserts no `MUST pass model=` survives anywhere
// in the tree — so what is lost is the positive half: nothing confirms the replacement PROSE is
// still emitted, because there is nothing left for it to replace.

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

  // The declaration must describe the tree that actually ships: no generated Skill may carry a
  // `model:` frontmatter field or a per-call `model=` override.
  for (const name of [...canonCommandNames.map(n => n), ...roleDirNames]) {
    const rel = skillDir(name);
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
// K5: dispatch-card rewrite — Kimi Code's Agent tool has no named custom
// subagents, so every canonical dispatch card (Agent(subagent_type="<role>",
// model="{...}", …)) is rewritten to the built-in type for the role's kind:
// canonical frontmatter `tools:` lacking Write/Edit → "explore", everything
// else → "coder" (roleKindMap is computed from canonical, never hand-listed),
// and the prompt is prefixed with the instruction to invoke the matching
// kaola-role-<role> Skill. Cards are compared PER COMMAND, IN ORDER, so a
// dropped/mis-paired rewrite fails here. workflow-next dispatches no agent inline
// (retired issue-scout survey folded into the workflow-planner's no-target mode,
// dispatched by the separate adapt surface), so it carries no Agent() cards at all.
// ---------------------------------------------------------------------------
{
  const kinds = sync.roleKindMap();
  const CANON_CARD = /Agent\(\n\s+subagent_type="([^"]+)"/g;
  const KIMI_CARD = /Agent\(\n\s+subagent_type="(coder|explore)",[\s\S]*?prompt="First invoke the `kaola-role-([^`]+)` Skill and follow its contract for the entire task\./g;
  let totalCards = 0;
  for (const file of canonCommands) {
    const name = file.slice(0, -3);
    const canonCards = [...read('commands/' + file).matchAll(CANON_CARD)]
      .map(m => m[1]).filter(r => kinds[r]);
    const kimiCards = [...read(skillDir(name)).matchAll(KIMI_CARD)]
      .map(m => ({ kind: m[1], role: m[2] }));
    totalCards += canonCards.length;
    assert(kimiCards.length === canonCards.length,
      'K5[' + name + ']: generated dispatch-card count matches canonical (' + canonCards.length + ') — got ' + kimiCards.length);
    const n = Math.min(canonCards.length, kimiCards.length);
    for (let i = 0; i < n; i++) {
      assert(kimiCards[i].role === canonCards[i],
        'K5[' + name + '#' + i + ']: dispatch prompt invokes the `kaola-role-' + canonCards[i] +
        '` Skill (got `kaola-role-' + kimiCards[i].role + '`)');
      assert(kimiCards[i].kind === kinds[canonCards[i]],
        'K5[' + name + '#' + i + ']: ' + canonCards[i] + ' dispatched as subagent_type="' + kinds[canonCards[i]] +
        '" (canonical tools ' + (kinds[canonCards[i]] === 'explore' ? 'lack Write/Edit → explore' : 'include Write/Edit → coder') +
        '; got "' + kimiCards[i].kind + '")');
    }
  }
  assert(totalCards > 0,
    'K5: canonical commands carry at least one Agent() dispatch card (rewrite bite)');
  // roleKindMap vs an INDEPENDENT reading of the canonical tool grants.
  //
  // The loop this replaces was `for (const role of sync.readOnlyRoles())` — and readOnlyRoles()
  // returns [], so it iterated over nothing and asserted nothing while reading like coverage. Empty
  // is the CORRECT answer for the current roster (all 14 roles grant Write), which is exactly why a
  // silent skip is the wrong shape: a predicate that broke and started returning [] would look
  // identical. So the domain is asserted, not iterated: the kind map is compared against the same
  // partition recomputed here straight from the tracked frontmatter, with no generator function in
  // the loop. Both directions are named, so the assertion says something whether the read-only set
  // is empty or not, and it starts enforcing per-member the moment a read-only role exists.
  {
    const grantsWrite = role => {
      const line = (read('agents/' + role + '.md').match(/^tools:\s*(.+)$/m) || [])[1] || '';
      const tools = line.replace(/[[\]"']/g, ' ').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      return tools.includes('write') || tools.includes('edit');
    };
    const expectedExplore = canonAgents.filter(r => !grantsWrite(r)).sort();
    const expectedCoder = canonAgents.filter(grantsWrite).sort();
    assert(expectedCoder.length + expectedExplore.length === canonAgents.length
      && canonAgents.length > 0,
      'K5-kinds: the tool-grant partition covers every canonical role (' + canonAgents.length + ')');
    assert(JSON.stringify([...sync.readOnlyRoles()].sort()) === JSON.stringify(expectedExplore),
      'K5-kinds: readOnlyRoles() is EXACTLY the set of canonical roles granting neither Write nor '
      + 'Edit — independently recomputed=' + JSON.stringify(expectedExplore)
      + ', generator=' + JSON.stringify([...sync.readOnlyRoles()].sort())
      + (expectedExplore.length === 0
        ? ' (empty is the CORRECT answer for this roster and is asserted, not skipped)' : ''));
    for (const role of expectedExplore) {
      assert(kinds[role] === 'explore', 'K5-kinds: read-only role ' + role + ' dispatches as explore');
    }
    for (const role of expectedCoder) {
      assert(kinds[role] === 'coder', 'K5-kinds: write-capable role ' + role + ' dispatches as coder');
    }
  }

  // -------------------------------------------------------------------------
  // K5-restriction: the LIVE tool-restriction axis, asserted in BOTH directions.
  //
  // On kimi this matters more than anywhere else, and the generator says why: a Skill is a prompt
  // package, canonical `tools:` is DROPPED from the frontmatter, and every role is dispatched as
  // `coder`. So the restriction can only be carried by the contract PROSE — absent that line a
  // Bash-less canonical role silently gains shell access on this runtime. Nothing asserted it: this
  // suite had no restriction assertion at all, so a regression in restrictionNote() shipped three
  // roles with shell access and stayed green.
  //
  // BOTH directions, because a one-sided check passes a predicate that restricts everything, and
  // deny-all is as wrong as deny-nothing. The partition is derived from the canonical frontmatter by
  // the local parser above, so the generator's own parse cannot define the answer it is checked
  // against, and a fourth restricted role is covered the day it is added.
  //
  // This block is also the CONSUMER of sync.restrictedRoles(), which shipped exported "for
  // inspection" with none. An exported function nobody calls is indistinguishable from a broken one.
  {
    const grantsBash = role => {
      const line = (read('agents/' + role + '.md').match(/^tools:\s*(.+)$/m) || [])[1] || '';
      return line.replace(/[[\]"']/g, ' ').split(/[,\s]+/)
        .map(s => s.trim().toLowerCase()).filter(Boolean).includes('bash');
    };
    const SHELL_CLAUSE = 'may not run shell commands';
    const restricted = canonAgents.filter(r => !grantsBash(r)).sort();
    const unrestricted = canonAgents.filter(grantsBash).sort();
    const contractOf = role => read(skillDir('kaola-role-' + role));

    // Non-vacuity on BOTH sides: with either partition empty this degrades to a one-directional
    // check, which is the failure mode it exists to avoid.
    assert(restricted.length > 0,
      'K5-restriction: at least one canonical role withholds Bash — an empty restricted set makes '
      + 'the restriction-present assertion vacuous and the guard one-directional');
    assert(unrestricted.length > 0,
      'K5-restriction: at least one canonical role grants Bash — an empty unrestricted set makes '
      + 'the must-NOT-restrict assertion vacuous, which is what a restrict-everything predicate '
      + 'needs to pass');

    // restrictedRoles() gains a consumer: its key set must be the independently derived one. It
    // covers the write/edit clause too, so it is compared as a SUPERSET-free exact set against the
    // roles withholding either governed capability, not against the Bash partition alone.
    const generatorRestricted = Object.keys(sync.restrictedRoles()).sort();
    const anyWithheld = canonAgents.filter(r => {
      const line = (read('agents/' + r + '.md').match(/^tools:\s*(.+)$/m) || [])[1] || '';
      const t = line.replace(/[[\]"']/g, ' ').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      return !(t.includes('write') || t.includes('edit')) || !t.includes('bash');
    }).sort();
    assert(JSON.stringify(generatorRestricted) === JSON.stringify(anyWithheld),
      'K5-restriction: restrictedRoles() names exactly the canonical roles withholding a governed '
      + 'capability — generator=' + JSON.stringify(generatorRestricted)
      + ', canonical=' + JSON.stringify(anyWithheld));

    for (const role of restricted) {
      assert(contractOf(role).includes(SHELL_CLAUSE),
        'K5-restriction[' + role + ']: canonical withholds Bash, so the generated role contract MUST '
        + 'carry "' + SHELL_CLAUSE + '" — a Skill drops canonical `tools:` and every role dispatches '
        + 'as coder, so without this line the role has shell access on kimi');
    }
    for (const role of unrestricted) {
      assert(!contractOf(role).includes(SHELL_CLAUSE),
        'K5-restriction[' + role + ']: canonical GRANTS Bash, so the generated contract must NOT '
        + 'forbid shell commands — a predicate restricting every role would satisfy the assertions '
        + 'above and fail here');
    }
  }
  // Every kaola-role-* reference inside a command skill resolves to a generated
  // role skill dir (no dangling Skill reference).
  const roleDirSet = new Set(roleDirNames);
  for (const file of canonCommands) {
    const name = file.slice(0, -3);
    for (const m of read(skillDir(name)).matchAll(/kaola-role-([a-z0-9-]+)/g)) {
      assert(roleDirSet.has('kaola-role-' + m[1]),
        'K5[' + name + ']: kaola-role-' + m[1] + ' reference resolves to a generated role skill');
    }
  }
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
// K6: reviewer behavior identity (mirror of the opencode A6-reviewer block) —
// the three reviewer roles retain their deterministic normalized behavior
// identity through the kimi render (role / behavior_contract_version /
// behavior_contract_hash / behavior-core bytes). Contract/profile assertion
// only: foundation-model findings and prose remain stochastic and are never
// promised to match across runtimes.
// ---------------------------------------------------------------------------
for (const role of reviewerGenerator.ROLES) {
  const canonical = reviewerGenerator.behaviorIdentityFromCore(read('agents/' + role + '.md'));
  const kimiText = read(skillDir('kaola-role-' + role));
  const kimi = reviewerGenerator.behaviorIdentityFromCore(kimiText);
  assert(kimi.role === canonical.role
    && kimi.behavior_contract_version === canonical.behavior_contract_version
    && kimi.behavior_contract_hash === canonical.behavior_contract_hash,
  `K6-reviewer[${role}]: kimi role skill retains normalized reviewer behavior identity`);
  assert(kimi.core === canonical.core,
    `K6-reviewer[${role}]: kimi render preserves reviewer behavior-core bytes`);
  // The kimi render carries the schema-2 identity fields (a body HTML comment block) with
  // a FRESH resolved_profile_hash re-stamped over the kimi bytes — never the reused Claude hash.
  const kimiHash = (kimiText.match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1];
  assert(kimiHash && /^[0-9a-f]{64}$/.test(kimiHash),
    `K6-reviewer[${role}]: kimi skill carries a resolved_profile_hash`);
  assert((kimiText.match(/^resolved_profile_hash\s*:\s*[0-9a-f]{64}\s*$/gm) || []).length === 1,
    `K6-reviewer[${role}]: kimi skill carries EXACTLY ONE resolved_profile_hash line`);
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
// K7: hooks — the generated kimi-hooks.toml fragment maps the two canonical
// hooks.json entries to Kimi [[hooks]] rules (SubagentStart → dispatch-log,
// and the Claude SessionStart"compact" entry → PostCompact →
// compact-context.js), and the 1 runtime-neutral shell script is
// byte-identical to canonical hooks/.
// ---------------------------------------------------------------------------
{
  const toml = read('.kimi/hooks/kimi-hooks.toml');
  // Determinism only — .kimi/ is gitignored, so this compares the fragment --write just produced
  // against the same renderer. The armed assertions are the structural ones below (rule count,
  // event partition, exact command lines, managed-block markers) and the hook-script comparisons
  // further down, which read the TRACKED canonical hooks/.
  assert(toml === sync.renderKimiHooksToml(),
    'K7: renderKimiHooksToml is deterministic across the --write subprocess and this process');
  // Declared before K7-canon below, which reads it: a `const` referenced above its declaration is a
  // temporal-dead-zone ReferenceError that both `node --check` and a bare `require()` step over.
  const blocks = toml.match(/^\[\[hooks\]\]$/gm) || [];
  // K7-canon: the fragment's two rules must map the TRACKED canonical hooks.json entries, so a
  // generator that stopped reading canonical (or mapped one entry twice) is caught against source
  // rather than against itself.
  {
    let canonHooks = null;
    try { canonHooks = JSON.parse(read('hooks/hooks.json')); } catch (_) { canonHooks = null; }
    assert(canonHooks && canonHooks.hooks && typeof canonHooks.hooks === 'object',
      'K7-canon: the tracked canonical hooks/hooks.json parses — the kimi fragment is DERIVED from '
      + 'it, so an unreadable source must fail here rather than silently justify whatever was rendered');
    const canonEvents = canonHooks && canonHooks.hooks
      ? Object.keys(canonHooks.hooks).filter(k => Array.isArray(canonHooks.hooks[k])).sort() : [];
    // DERIVED, not pinned: the fragment must carry one rule per canonical event. Writing `=== 2` on
    // both sides would pin today's corpus size, and the natural repair for a count pin is to bump
    // the number — which restores green with a canonical hook silently unmapped.
    assert(canonEvents.length > 0 && blocks.length === canonEvents.length,
      'K7-canon: the fragment carries one [[hooks]] rule per canonical event entry — canonical='
      + JSON.stringify(canonEvents) + ' (' + canonEvents.length + '), fragment rules=' + blocks.length);
    // The count above is only half of it: the fragment must map THESE two events, not any two.
    // SessionStart"compact" is the Claude spelling of the Kimi PostCompact rule, so the pairing is
    // named rather than assumed — a canonical event renamed on one side alone reds here.
    assert(JSON.stringify(canonEvents) === JSON.stringify(['SessionStart', 'SubagentStart']),
      'K7-canon: the canonical event set the kimi fragment maps is {SessionStart, SubagentStart} — '
      + 'got ' + JSON.stringify(canonEvents) + '; the kimi counterparts asserted above are '
      + '{PostCompact, SubagentStart}, so a rename on either side must be reconciled deliberately');
  }
  assert(blocks.length === 2,
    'K7: kimi-hooks.toml carries EXACTLY 2 [[hooks]] rules (mapped from canonical hooks.json) — got ' + blocks.length);
  const ALLOWED_EVENTS = new Set(['SubagentStart', 'PostCompact']);
  const events = [...toml.matchAll(/^event = "([^"]+)"$/gm)].map(m => m[1]);
  assert(events.length === 2 && events.every(e => ALLOWED_EVENTS.has(e)),
    'K7: every [[hooks]] event is a valid Kimi event ∈ {SubagentStart, PostCompact} — got ' + JSON.stringify(events));
  assert(events.filter(e => e === 'SubagentStart').length === 1
    && events.filter(e => e === 'PostCompact').length === 1,
    'K7: event partition is SubagentStart×1 + PostCompact×1 (the canonical 2-entry map)');
  assert(/event = "SubagentStart"\ncommand = "bash __KIMI_HOME__\/kaola-workflow\/hooks\/kaola-workflow-subagent-dispatch-log\.sh"/.test(toml),
    'K7: SubagentStart → dispatch-log.sh (matcher omitted)');
  assert(/event = "PostCompact"\ncommand = "node __KIMI_HOME__\/kaola-workflow\/scripts\/kaola-workflow-compact-context\.js"/.test(toml),
    'K7: PostCompact → compact-context.js (the Kimi semantic counterpart of SessionStart"compact")');
  assert(toml.startsWith('# >>> kaola-workflow kimi hooks') && toml.includes('# <<< kaola-workflow kimi hooks'),
    'K7: managed-block markers (# >>> / # <<< kaola-workflow kimi hooks) delimit the fragment for idempotent merges');
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
    fs.readdirSync(path.join(REPO, '.kimi', 'skills'), { withFileTypes: true })
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
// P1 / P4 / U1 / A1: install-kimi.sh contract — the install-time COMMAND-skill
// deploy (every adaptive-core command, all kaola-role-* always), re-install idempotency
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
    const home = opts.home || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-home-'));
    const kimiHome = opts.kimiHome || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-kh-'));
    const dest = opts.dest || mkdtempSync(path.join(os.tmpdir(), 'kimi-i-dest-'));
    const args = ['--target', dest, '--yes'].concat(extraArgs || []);
    // spawn-class: environment
    const r = spawnSync('bash', [INSTALLER].concat(args), {
      env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }),
      encoding: 'utf8',
    });
    return {
      ok: r.status === 0,
      status: r.status,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
      home, kimiHome, dest,
      configPath: path.join(home, '.config', 'kaola-workflow', 'config.json'),
      kimiConfig: path.join(kimiHome, 'config.toml'),
    };
  }
  const skillsDir = r => path.join(r.dest, '.kimi-code', 'skills');
  const deployedSkills = r => existsSync(skillsDir(r)) ? readdirSync(skillsDir(r)).sort() : [];
  const managedBlockCount = p => existsSync(p)
    ? readFileSync(p, 'utf8').split('\n').filter(l => l.trim() === '# >>> kaola-workflow kimi hooks').length
    : 0;
  const clean = r => {
    for (const d of [r.home, r.kimiHome, r.dest]) {
      try { rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  };
  const expectDeployed = (r, cmdNames, label) => {
    const expected = [...cmdNames, ...roleDirNames].sort();
    assert(JSON.stringify(deployedSkills(r)) === JSON.stringify(expected),
      label + ': deployed skill set == ' + cmdNames.length + ' command(s) + ' + roleDirNames.length
      + ' kaola-role-* roles — got ' + JSON.stringify(deployedSkills(r)));
  };
  const firstStderrLine = r => String(r.stderr).split('\n')[0];

  // P1 — install deploys adaptive-core commands + all role skills, lands support
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
    for (const role of roleDirNames) {
      assert(existsSync(path.join(skillsDir(r), role, 'SKILL.md')),
        'P1[' + role + ']: default install deploys every role skill (roles always install)');
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
    assert(managedBlockCount(r.kimiConfig) === 1,
      'P1: config.toml carries EXACTLY ONE kaola managed hooks block');
    assert(readFileSync(r.kimiConfig, 'utf8').includes('[[hooks]]'),
      'P1: merged config.toml carries the [[hooks]] rules');
    assert(!existsSync(r.configPath),
      'P1: default install must not create ~/.config/kaola-workflow/config.json (user-owned; the\n      workflow has no install-time configuration)');
    clean(r);
  }

  // P2/P3 (former --with-fast / --with-full opt-in-partition probes) — DELETED
  // IN FULL. #725 Phase A retires the fast/full opt-in partition itself; every
  // surface these probed (kaola-workflow-fast, kaola-workflow-phase[1-5]) is
  // n2-deleted from canonical, so there is nothing left to opt into or lock in.

  // P4 — idempotency: a default install run TWICE into the same
  // HOME/KIMI_CODE_HOME/target leaves EXACTLY ONE managed hooks block in
  // config.toml (strip + re-append, never duplicate), the identical deployed
  // skill set, and an unchanged shared kaola config.
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'P4: first default install exits 0');
    const r2 = runInstaller([], { home: r1.home, kimiHome: r1.kimiHome, dest: r1.dest });
    assert(r2.ok,
      'P4: second (idempotent) install exits 0 (got status ' + r2.status + (r2.stderr ? ' — ' + firstStderrLine(r2) : '') + ')');
    assert(managedBlockCount(r1.kimiConfig) === 1,
      'P4: config.toml still carries EXACTLY ONE managed hooks block after re-install (idempotent merge)');
    assert(JSON.stringify(deployedSkills(r1)) === JSON.stringify(deployedSkills(r2)),
      'P4: re-install leaves the deployed skill set unchanged');
    const hookBlockCount = readFileSync(r1.kimiConfig, 'utf8').match(/^\[\[hooks\]\]$/gm) || [];
    assert(hookBlockCount.length === 2,
      'P4: re-installed config.toml carries exactly the 2 [[hooks]] rules (no duplication)');
    clean(r1);
    clean(r2);
  }

  // U1 — --uninstall removes the ENTIRE kaola-deployed surface: the deployed
  // skills (commands + roles), the support scripts + hook scripts under the
  // kimi home, and the managed hooks block in config.toml (the file itself is
  // preserved when it holds user content; here it held only the block so it is
  // removed). The shared kaola config is user-owned: neither install nor uninstall
  // creates or edits it.
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'U1: seed install exits 0');
    assert(existsSync(skillsDir(r1)), 'U1: skills present before uninstall');
    // spawn-class: environment
    const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r1.dest, '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home, KIMI_CODE_HOME: r1.kimiHome }), encoding: 'utf8' });
    assert(ru.status === 0,
      'U1: --uninstall exits 0 (got ' + ru.status + (ru.stderr ? ' — ' + String(ru.stderr).split('\n')[0] : '') + ')');
    for (const name of [...ADAPTIVE_CORE, ...roleDirNames]) {
      assert(!existsSync(path.join(skillsDir(r1), name)),
        'U1[' + name + ']: skill removed by --uninstall');
    }
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
  // WHAT IS NOW UNCOVERED: the reviewer SKILL.md is still generated and its re-stamped
  // `resolved_profile_hash` is still verified against the bytes (earlier in this file), but the
  // runtime-DETECTION half — that a kimi install reads as kimi and not as opencode — has no
  // consumer left and therefore no test. If a reviewer-identity resolver returns, that
  // no-swallow case is the one worth restoring first: it was a real defect, not a hypothetical.
}

// ---------------------------------------------------------------------------
// K10-prune: --write is an idempotent MIRROR, not an append-only writer. A retired
// skill dir (whose canonical source was deleted — e.g. the fast/full commands) must
// be REMOVED, and --check must flag it (the generator previously wrote canonical
// surfaces but never pruned, so --check reported parity while a stale dir lingered).
// Crash-safe: the transient probe dir is removed in a finally block.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const probeDir = path.join(REPO, '.kimi', 'skills', 'kaola-workflow-__kw_retired_probe');
  // spawn-class: environment
  const runSync = (flag) => spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), flag], { encoding: 'utf8' });
  try {
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, 'SKILL.md'), '# transient retired-surface probe — must not persist\n');
    const chk = runSync('--check');
    assert(chk.status !== 0,
      'K10-prune(a): --check must exit NON-ZERO when a retired skill dir is present in .kimi/skills/');
    assert(((chk.stdout || '') + (chk.stderr || '')).includes('__kw_retired_probe'),
      'K10-prune(a): --check output must name the retired skill dir');
    runSync('--write');
    assert(!fs.existsSync(probeDir),
      'K10-prune(b): --write must REMOVE the retired skill dir (idempotent mirror)');
    assert(runSync('--check').status === 0,
      'K10-prune(b): --check exits 0 after the retired skill dir is pruned');
  } finally {
    try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch (_) { /* best-effort cleanup */ }
  }
}

// ---------------------------------------------------------------------------
// K11 (#812, the kimi twin of test-opencode-edition.js's A24): the generated kimi
// workflow-init Skill carries the re-grounded adaptive ## Kaola-Workflow template —
// phase-free (no retired numbered-phase model, no "phase file/artifact" framing) AND
// BYTE-IDENTICAL to the canonical GitHub template. The template is runtime-neutral AT
// THE SOURCE, so no template-region rewrite exists to except: parity is exact.
//
// This is TEMPLATE-CONTENT parity against the canonical source, which K3 structurally
// cannot prove: this suite self-provisions .kimi/ via `sync --write`, so K3's
// `sync --check` compares the generated tree against the tree it just wrote — that is
// sync IDEMPOTENCY, never content parity. A template-mangling transform added to
// sync-kimi-edition.js keeps K3 green (both sides mangled) and is caught only here.
// .kimi/ is fully gitignored, so the four-chain contract validators must not read it —
// this is the kimi-edition home for the template ban + parity (regenerate via --write).
// ---------------------------------------------------------------------------
{
  const TPL_START = '<!-- KW-CLAUDE-TEMPLATE-START -->';
  const TPL_END = '<!-- KW-CLAUDE-TEMPLATE-END -->';
  const extractTemplate = (text, label) => {
    const s = text.indexOf(TPL_START);
    const e = text.indexOf(TPL_END);
    assert(s !== -1 && e !== -1 && e > s,
      'K11[' + label + ']: KW-CLAUDE-TEMPLATE-START/END markers present');
    return (s !== -1 && e > s) ? text.slice(s + TPL_START.length, e).trim() : '';
  };
  const kimiTpl = extractTemplate(read(skillDir('workflow-init')), 'kimi');
  // Phase-ban (mirror validate-kaola-workflow-contracts.js AC4).
  assert(!/Phase\s+\d/.test(kimiTpl),
    'K11: kimi workflow-init template must not teach a numbered Phase <n> model (adaptive is the unconditional default)');
  assert(!/phase file|phase artifact/i.test(kimiTpl),
    'K11: kimi workflow-init template must not use "phase file/artifact" durable-state framing');
  // EXACT parity: transformCommandBody applies zero template-region rewrites (#812).
  const canonTpl = extractTemplate(read('commands/workflow-init.md'), 'canonical-github');
  assert(kimiTpl === canonTpl,
    'K11 (#812): kimi workflow-init template is BYTE-IDENTICAL to the canonical GitHub template (no template-region rewrite exists)');
  // Vendor/runtime leak ban at the injected-template level (the kimi twin of A24's).
  assert(!/\bClaude\b|\bOpus\b|\bSonnet\b|\/workflow-next|\/goal|Stop-hook/.test(canonTpl),
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

    const files = walk(path.join(REPO, tree));
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
    const actual = fs.readdirSync(path.join(REPO, tree, 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('kaola-role-'))
      .map(e => e.name).sort();
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      'FA6[' + forge + ']: ' + tree + '/skills command set is exactly the routing registry set for '
      + forge + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');

    // F7: the managed hooks fragment names a script this forge's manifest ACTUALLY
    // installs. A forge-blind fragment would wire the hook to a basename that no
    // gitlab/gitea install ever writes — a dead hook that no parity check would see.
    const frag = fs.readFileSync(path.join(REPO, tree, 'hooks', 'kimi-hooks.toml'), 'utf8');
    const installed = new Set(manifest.supportScripts(forge));
    const referenced = (frag.match(/kaola-[A-Za-z0-9._-]*\.js/g) || []);
    assert(referenced.length > 0, 'FA7[' + forge + ']: the hooks fragment references at least one script');
    for (const ref of referenced) {
      assert(installed.has(ref),
        'FA7[' + forge + ']: hooks fragment references "' + ref + '", which the ' + forge
        + ' install manifest does not deploy — the hook would point at a missing file');
    }
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

      // The merged hooks block must reference only scripts/hooks this install wrote.
      const cfg = path.join(kimiHome, 'config.toml');
      assert(existsSync(cfg), 'FA9[' + forge + ']: the install merges a config.toml hooks block');
      const toml = readFileSync(cfg, 'utf8');
      for (const ref of (toml.match(/kaola-[A-Za-z0-9._-]*\.js/g) || [])) {
        assert(existsSync(path.join(scriptsDir, ref)),
          'FA9[' + forge + ']: config.toml hook references ' + ref + ', which this install did not write');
      }

      const skill = readFileSync(path.join(dest, '.kimi-code', 'skills', 'workflow-next', 'SKILL.md'), 'utf8');
      const claim = forgeLayout.scriptName('kaola-workflow-claim.js', forge);
      assert(skill.includes(claim), 'FA9[' + forge + ']: the deployed workflow-next skill resolves ' + claim);
      assert(deployed.includes(claim),
        'FA9[' + forge + ']: ' + claim + ' is among the installed support scripts');
    } finally {
      try { rmSync(home, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      try { rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
}

if (failed) {
  console.error('\nkimi-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('kimi-edition test passed (' + passed + ' assertions).');
