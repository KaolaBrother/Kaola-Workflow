#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-kimi-edition.js — structural + parity validator for the Kimi Code
// runtime edition. Hand-rolled asserts (no framework), matching the repo's
// existing test style (mirror of test-opencode-edition.js, scoped to the
// additive kimi surface). Run directly:
//   node scripts/test-kimi-edition.js
//
// The kimi edition is delivered the Kimi-native way: directory-form Skills
// under `.kimi/skills/<name>/SKILL.md` (5 command skills — adaptive-only, the
// fast/full command skills are #725-retired — + 16 kaola-role-*
// role-contract skills) plus `.kimi/hooks/` (1 byte-copied shell hook + the
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
// Not wired into `npm test` and no package.json script (the opencode-edition
// precedent: additive runtime editions keep their own runner).
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

const canonCommands = sync.listCanonCommands();                    // ['kaola-workflow-adapt.md', ...]
const canonCommandNames = canonCommands.map(f => f.slice(0, -3));  // 5 command basenames (adaptive-only, #725)
const canonAgents = sync.listCanonAgents();                        // 16 roles (top-level agents/*.md only)
const roleDirNames = canonAgents.map(a => 'kaola-role-' + a);
const skillDir = name => '.kimi/skills/' + name + '/SKILL.md';

// ---------------------------------------------------------------------------
// K1: count/structure parity — exactly 5 command Skill dirs + 16 kaola-role-*
// Skill dirs, set-equal to the canonical commands/*.md + top-level agents/*.md
// inventories (agents/profiles/higher/ is skipped by the generator's
// construction — it never matches listCanonAgents). Every SKILL.md carries a
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
    'K1: .kimi/skills/ dir set == 5 canonical commands + 16 kaola-role-* roles — got ' + JSON.stringify(dirNames));
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
for (const name of ['workflow-next', 'kaola-workflow-adapt']) {
  const content = read(skillDir(name));
  assert(/--runtime kimi\b/.test(content),
    'K2[' + name + ']: claim invocation stamps "--runtime kimi" into workflow-state.md');
  assert(content.includes('Never pass a per-call model override; sub-agents inherit the session model.'),
    'K2[' + name + ']: carries the inherit-model guidance (the stripped "MUST pass model=" prose replacement)');
}

// ---------------------------------------------------------------------------
// K3: byte-parity — regenerating from canonical reproduces every committed
// file byte-for-byte (sync --check exits 0 on the just-written tree).
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts', 'sync-kimi-edition.js'), '--check'],
    { encoding: 'utf8' });
  assert(r.status === 0,
    'K3: sync-kimi-edition --check exits 0 (generated tree in byte-parity with canonical)' +
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
// dropped/mis-paired rewrite fails here. workflow-next's issue-scout dispatch
// is prose (not an Agent() card) and gets its own rewrite assertion.
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
  // roleKindMap sanity: the read-only set is computed from canonical frontmatter.
  for (const role of sync.readOnlyRoles()) {
    assert(kinds[role] === 'explore',
      'K5: readOnlyRoles member ' + role + ' maps to explore');
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
  // workflow-next's prose scout dispatch: the {ISSUE_SCOUT_MODEL} card-free
  // dispatch is rewritten to kimi-true wording (explore + role Skill + inherit).
  const wfNext = read(skillDir('workflow-next'));
  assert(!wfNext.includes('ISSUE_SCOUT_MODEL'),
    'K5[workflow-next]: no {ISSUE_SCOUT_MODEL} placeholder leaks (kimi has no install-time render step)');
  assert(!wfNext.includes('resolved at install time'),
    'K5[workflow-next]: no false "resolved at install time" sentence (rewritten to kimi-true wording)');
  assert(wfNext.includes('Dispatch it via `subagent_type="explore"`')
    && wfNext.includes('kaola-role-issue-scout'),
    'K5[workflow-next]: scout dispatch rewritten to subagent_type="explore" + kaola-role-issue-scout Skill (issue-scout is read-only)');
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
  assert(toml === sync.renderKimiHooksToml(),
    'K7: committed kimi-hooks.toml is byte-equal to renderKimiHooksToml() (regenerate via --write)');
  const blocks = toml.match(/^\[\[hooks\]\]$/gm) || [];
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
  // #725 Phase A: claim.js never emits a non-adaptive route target post-retirement
  // (no isFast branch survives) — the emitted-target set shrinks to the 2 real
  // adaptive targets (mirrors test-opencode-edition.js's A9 retirement).
  const stripSlash = c => c.replace(/^\//, '');
  const emittedCommandTargets = [
    stripSlash(schema.PLAN_RUN_COMMAND),
    stripSlash(schema.ADAPT_COMMAND),
  ];
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
// deploy (adaptive-core 5, all 16 kaola-role-* always), re-install idempotency
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
  const ADAPTIVE_CORE = [
    'kaola-workflow-adapt', 'kaola-workflow-finalize',
    'kaola-workflow-plan-run', 'workflow-init', 'workflow-next',
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
  const readConfig = p => {
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch (_) { return null; }
  };
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
      label + ': deployed skill set == ' + cmdNames.length + ' command(s) + 16 kaola-role-* roles — got ' + JSON.stringify(deployedSkills(r)));
  };
  const firstStderrLine = r => String(r.stderr).split('\n')[0];

  // P1 — default (and now ONLY) install deploys adaptive-core commands + all
  // role skills, lands support scripts + hook scripts under the kimi home,
  // merges EXACTLY ONE managed hooks block into config.toml, and seeds
  // installed_paths:[].
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
    const cfg = readConfig(r.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '[]',
      'P1: default install seeds installed_paths:[] (adaptive-only) — got ' + JSON.stringify(cfg && cfg.installed_paths));
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
  // removed) — and resets installed_paths:[] in the shared kaola config.
  {
    const r1 = runInstaller([]);
    assert(r1.ok, 'U1: seed install exits 0');
    assert(existsSync(skillsDir(r1)), 'U1: skills present before uninstall');
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
    const cfg = readConfig(r1.configPath);
    assert(cfg && JSON.stringify(cfg.installed_paths) === '[]',
      'U1: --uninstall resets installed_paths:[] (parallel_mode preserved) — got ' + JSON.stringify(cfg && cfg.installed_paths));
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

  // K9 — kimi reviewer profile resolution end-to-end: a review-gated plan on a REAL kimi
  // install resolves the kimi-native reviewer SKILL.md. detectReviewRuntime recognizes the
  // <kimi-home>/kaola-workflow/scripts layout (and is NOT swallowed by the opencode
  // <config>/kaola-workflow/scripts pattern — a project carrying .opencode/agent/ must not
  // hijack the kimi identity), reviewerProfilePath probes project → global → self-dev, and
  // the generated SKILL.md's re-stamped resolved_profile_hash passes the runtime's
  // zeroed-self sha256 verification. Each probe runs the deployed support script in a
  // subprocess so __dirname/process.cwd() match a real consumer invocation.
  {
    const probe = (scriptsHome, cwd, home, kimiHome) => {
      const script = 'const m=require(' + JSON.stringify(path.join(scriptsHome, 'kaola-workflow-adaptive-node.js')) + ');'
        + "const r=m.resolveReviewerProfileIdentity('code-reviewer',{});"
        + 'console.log(JSON.stringify({ok:r.ok,reason:r.reason||null,runtime:r.runtime||null,'
        + 'hash:r.resolved_profile_hash||null,path:r.profile_path||null}));';
      const r = spawnSync(process.execPath, ['-e', script],
        { cwd, env: Object.assign({}, process.env, { HOME: home, KIMI_CODE_HOME: kimiHome }), encoding: 'utf8' });
      try { return JSON.parse(String(r.stdout).trim()); }
      catch (_) { return { ok: false, reason: 'probe_crash: ' + String(r.stderr || r.stdout).split('\n')[0] }; }
    };

    const r1 = runInstaller([]);
    assert(r1.ok, 'K9: seed install (project scope) exits 0');
    const scriptsHome = path.join(r1.kimiHome, 'kaola-workflow', 'scripts');
    const projectSkill = path.join(skillsDir(r1), 'kaola-role-code-reviewer', 'SKILL.md');
    const deployedHash = p => (readFileSync(p, 'utf8')
      .match(/^resolved_profile_hash\s*:\s*([0-9a-f]{64})\s*$/m) || [])[1] || null;

    // case 1 — project-scope candidate resolves (ok:true, runtime 'kimi', verified hash).
    const p1 = probe(scriptsHome, r1.dest, r1.home, r1.kimiHome);
    assert(p1.ok === true && p1.runtime === 'kimi',
      'K9[project]: reviewer identity resolves on a real kimi install — got ' + JSON.stringify(p1));
    assert(p1.path === fs.realpathSync(projectSkill),
      'K9[project]: resolved profile is the project-scope SKILL.md — got ' + p1.path);
    assert(p1.hash && p1.hash === deployedHash(projectSkill),
      'K9[project]: resolved_profile_hash verifies against the deployed SKILL.md bytes');

    // case 2 — a global install into the SAME kimi home does not override the project win.
    const rg = spawnSync('bash', [INSTALLER, '--global', '--yes'],
      { env: Object.assign({}, process.env, { HOME: r1.home, KIMI_CODE_HOME: r1.kimiHome }), encoding: 'utf8' });
    assert(rg.status === 0,
      'K9[global-seed]: --global install exits 0 (got ' + rg.status + (rg.stderr ? ' — ' + String(rg.stderr).split('\n')[0] : '') + ')');
    const globalSkill = path.join(r1.kimiHome, 'skills', 'kaola-role-code-reviewer', 'SKILL.md');
    assert(existsSync(globalSkill), 'K9[global-seed]: global skill deployed at <kimi-home>/skills/');
    const p2 = probe(scriptsHome, r1.dest, r1.home, r1.kimiHome);
    assert(p2.ok === true && p2.path === fs.realpathSync(projectSkill),
      'K9[priority]: project candidate wins over the global one — got ' + JSON.stringify(p2));

    // case 3 — without a project candidate (empty cwd), the global candidate is used.
    const emptyCwd = mkdtempSync(path.join(os.tmpdir(), 'kimi-i-empty-'));
    const p3 = probe(scriptsHome, emptyCwd, r1.home, r1.kimiHome);
    assert(p3.ok === true && p3.path === fs.realpathSync(globalSkill),
      'K9[global]: falls back to the global <kimi-home>/skills candidate — got ' + JSON.stringify(p3));

    // case 4 — a stray .opencode/agent profile in the project does NOT hijack the kimi
    // identity (the detectReviewRuntime kimi branch fires before the opencode pattern).
    fs.mkdirSync(path.join(r1.dest, '.opencode', 'agent'), { recursive: true });
    fs.writeFileSync(path.join(r1.dest, '.opencode', 'agent', 'code-reviewer.md'),
      '---\nname: code-reviewer\ndescription: stray opencode profile (must be ignored on kimi)\n---\n');
    const p4 = probe(scriptsHome, r1.dest, r1.home, r1.kimiHome);
    assert(p4.ok === true && p4.runtime === 'kimi' && p4.path === fs.realpathSync(projectSkill),
      'K9[no-swallow]: a stray .opencode/agent profile does not hijack the kimi identity — got ' + JSON.stringify(p4));

    // case 5 — no kimi reviewer profile anywhere → typed refusal (never a silent fallthrough).
    rmSync(path.join(r1.dest, '.kimi-code'), { recursive: true, force: true });
    rmSync(path.join(r1.kimiHome, 'skills'), { recursive: true, force: true });
    const p5 = probe(scriptsHome, emptyCwd, r1.home, r1.kimiHome);
    assert(p5.ok === false && p5.reason === 'review_profile_unavailable',
      'K9[negative]: missing kimi reviewer profile refuses review_profile_unavailable — got ' + JSON.stringify(p5));
    try { rmSync(emptyCwd, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    clean(r1);
  }
}

if (failed) {
  console.error('\nkimi-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('kimi-edition test passed (' + passed + ' assertions).');
