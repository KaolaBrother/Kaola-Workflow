#!/usr/bin/env node
'use strict';

// test-route-reachability.js — every routing target a claim/startup/resume receipt can emit
// MUST resolve to an installed surface, per edition. This is the executable twin of the
// registry-driven reachability assert in all four contract validators.
//
// The failure class it exists for: a receipt that names a route whose surface the edition never
// shipped. The forge-codex trees are where that historically happened — a Codex receipt pointing
// at a skill that did not exist in the gitlab/gitea skills/ tree — so the target set is DERIVED
// from the generated-surface registry rather than hand-typed, and every edition is checked.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
const exists = rel => fs.existsSync(path.join(REPO, rel));
// whitespace-normalize multi-word needles for reflow tolerance (same convention as the
// validate-*-contracts.js norm() helper) — a prose sentence line-wrapped in the source markdown
// must still match a needle written as one continuous string.
const norm = s => String(s).replace(/\s+/g, ' ');


// ---------------------------------------------------------------------------
// Routing-target model. The command surface is three topics — init, next, finalize — and the
// generated-surface registry is their single source: the same TOPICS table that RENDERS the
// surfaces also names them here, so a topic added, renamed or dropped flows through for free and
// a hand-typed list can never disagree with what actually ships. These are the bare targets; a
// receipt suffixes ` {project}`, and reachability is the bare target.
// ---------------------------------------------------------------------------
const { TOPICS: ROUTING_TOPICS } = require('./generate-routing-surfaces.js');
const routingTopicNames = Object.keys(ROUTING_TOPICS).sort();
const emittedSkillTargets = routingTopicNames.map(t => ROUTING_TOPICS[t].skill_basename);
const emittedCommandTargets = routingTopicNames.map(t => ROUTING_TOPICS[t].command_basename);

// Per-edition installed surfaces.
const codexEditions = [
  { name: 'github-codex', skillsDir: 'plugins/kaola-workflow/skills' },
  { name: 'gitlab-codex', skillsDir: 'plugins/kaola-workflow-gitlab/skills' },
  { name: 'gitea-codex', skillsDir: 'plugins/kaola-workflow-gitea/skills' }
];
const claudeEditions = [
  { name: 'github-claude', commandsDir: 'commands' },
  { name: 'gitlab-claude', commandsDir: 'plugins/kaola-workflow-gitlab/commands' },
  { name: 'gitea-claude', commandsDir: 'plugins/kaola-workflow-gitea/commands' }
];

function installedSkills(skillsDir) {
  const full = path.join(REPO, skillsDir);
  return new Set(
    fs.readdirSync(full, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => exists(skillsDir + '/' + name + '/SKILL.md'))
  );
}
function installedCommands(commandsDir) {
  return new Set(
    fs.readdirSync(path.join(REPO, commandsDir))
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -'.md'.length))
  );
}

// ---------------------------------------------------------------------------
// T1: every emitted CODEX skill target resolves in every codex edition (the #400 core).
// ---------------------------------------------------------------------------
for (const ed of codexEditions) {
  const surfaces = installedSkills(ed.skillsDir);
  for (const target of emittedSkillTargets) {
    assert(surfaces.has(target),
      `T1[${ed.name}]: receipt-emitted skill "${target}" resolves to ${ed.skillsDir}/${target}/SKILL.md`);
  }
}

// ---------------------------------------------------------------------------
// T2: every emitted CLAUDE command target resolves in every claude edition.
// ---------------------------------------------------------------------------
for (const ed of claudeEditions) {
  const surfaces = installedCommands(ed.commandsDir);
  for (const target of emittedCommandTargets) {
    assert(surfaces.has(target),
      `T2[${ed.name}]: receipt-emitted command "/${target}" resolves to ${ed.commandsDir}/${target}.md`);
  }
}

// ---------------------------------------------------------------------------
// T3: RED PROOF — the resolver MUST reject a missing surface. Drop every routed SKILL from a
// simulated forge-codex surface set (exactly the historical dead-zone state) and assert the SAME
// reachability check that passes T1 now reports each target unreachable. This proves the test
// bites, rather than only that the tree happens to be green.
// ---------------------------------------------------------------------------
{
  const deadZoneSurfaces = installedSkills('plugins/kaola-workflow-gitlab/skills');
  for (const target of emittedSkillTargets) deadZoneSurfaces.delete(target);
  const unreachable = emittedSkillTargets.filter(t => !deadZoneSurfaces.has(t));
  assert(unreachable.length === emittedSkillTargets.length && unreachable.length > 0,
    'T3: every routed SKILL target is flagged unreachable when dropped from the surface set');
  // Dropping ONE target must red only that one — a resolver that reds wholesale is not a resolver.
  const oneShort = installedSkills('plugins/kaola-workflow-gitea/skills');
  oneShort.delete(emittedSkillTargets[0]);
  assert(emittedSkillTargets.filter(t => !oneShort.has(t)).join(',') === emittedSkillTargets[0],
    'T3: dropping exactly one target flags exactly that target (the resolver discriminates)');
}

// ---------------------------------------------------------------------------
// T4: content-reachability — a SKILL mirroring a command must carry the command's route/wiring
// tokens, because a present-but-HOLLOW surface resolves and then does nothing. Per codex edition.
// ---------------------------------------------------------------------------
for (const ed of codexEditions) {
  const finalize = `${ed.skillsDir}/kaola-workflow-finalize/SKILL.md`;
  const next = `${ed.skillsDir}/kaola-workflow-next/SKILL.md`;
  const f = fs.readFileSync(path.join(REPO, finalize), 'utf8');
  const n = norm(fs.readFileSync(path.join(REPO, next), 'utf8'));
  assert(f.includes('issue_numbers') && f.includes('--issue-numbers'),
    `T4[${ed.name}]: finalize SKILL wires the multi-issue member-set flag (--issue-numbers)`);
  assert(n.includes('kaola-workflow/{project}/mission-list.md') && n.includes(norm('nothing depends on a stable ID')),
    `T4[${ed.name}]: next SKILL names the run's mission list AND carries the format itself`);
  assert(n.includes(norm('kaola-workflow-finalize')),
    `T4[${ed.name}]: next SKILL routes onward to finalization`);
}

// ---------------------------------------------------------------------------
// T6: closure-audit pin — all 6 finalize-route surfaces (3 Claude commands + 3 Codex SKILLs)
// must carry the <!-- PIN: closure-audit --> comment and the 'closure-audit' literal (#496/#497).
// This is the machine-enforced contract that n2-wire-closure-audit wired the sink-result handling
// and closure-audit reconciliation sweep into every finalize surface. Fail-closed: unconditional
// assert() on every surface — do NOT use a non-blocking warn gate (unlike T5's self-disarmed
// anyHasPin pattern, which is a known bug we do not replicate here).
// ---------------------------------------------------------------------------
{
  const finalizeSurfaces = [
    'commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
  ];
  for (const f of finalizeSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: closure-audit -->'),
      `T6: ${f} must contain <!-- PIN: closure-audit --> comment (n2-wire-closure-audit)`);
    assert(content.includes('closure-audit'),
      `T6: ${f} must contain "closure-audit" literal (n2-wire-closure-audit)`);
  }
}

// ---------------------------------------------------------------------------
// T6b: acceptance-walk pin — all 6 finalize-route surfaces must bind their acceptance check to
// something CONCRETE. "Verify the deliverable matches the acceptance criteria" verifies against
// nothing; the check needs an object, and the object is now the run's own recorded results plus
// the issue statement. Fail-closed on all six, matched whitespace-normalized so a re-wrap that
// changes nothing semantically cannot redden the pin (and invite someone to weaken it).
// ---------------------------------------------------------------------------
{
  const finalizeSurfaces = [
    'commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
  ];
  for (const f of finalizeSurfaces) {
    // Hand-wrapped markdown: collapse whitespace before matching, or a re-wrap that changes nothing
    // semantically would redden the pin (and, worse, invite someone to weaken it).
    const content = fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\s+/g, ' ');
    assert(content.includes('mission-list.md'),
      `T6b: ${f} must bind its acceptance check to the run's own recorded results (mission-list.md)`);
    assert(/issue statement/.test(content),
      `T6b: ${f} must name the issue statement as the outer obligation`);
    assert(/covering test/.test(content) && /validation receipt/.test(content) && /prose evidence/.test(content),
      `T6b: ${f} must name the three ways a part is satisfied (covering test / validation receipt / prose evidence)`);
    assert(/judged in context/.test(content),
      `T6b: ${f} must state that satisfaction is JUDGED in context — never a mechanical match`);
    assert(/is a blocker, not a footnote/.test(content),
      `T6b: ${f} must state that an unsatisfied part is a blocker`);
  }
}

// ---------------------------------------------------------------------------
// T6c: run-gap SCANNER pin — a finalize surface that splices only the gate routes the
// orchestrator into a refusal it was never told how to clear. gap-sweep's two modes are
// exclusive: `--check` is a gate that READS `.cache/run-gaps.json` and, when the file is
// absent, refuses `artifact_missing` and exits 1. The default (scanner) mode is what WRITES
// that artifact, and `--json` is the only way it reports `sweptClasses` — the very list the
// author copies into `## Run gaps`. So each shipped finalize surface must name BOTH
// invocations, and the scan must come before the row grammar it feeds and before the gate
// that reconciles against it. A scan spliced after the gate satisfies a naive "mentions
// --json" reading while supplying nothing to either consumer.
//
// Read the RENDERED surfaces only — never the skeleton or slots.js. A pin that read the
// authoring source would go green while the shipped surfaces stayed wrong. The universe is
// DERIVED from GENERATED_SURFACES, the same registry `generate-routing-surfaces --check`
// byte-compares, which carries exactly the TRACKED surfaces: the additive .opencode/.kimi
// finalize copies are gitignored, so folding them in would make this vacuous in a fresh
// worktree while still reporting a full assertion count.
// ---------------------------------------------------------------------------
{
  const { GENERATED_SURFACES } = require('./generate-routing-surfaces.js');
  const { forgeRel } = require('./edition-sync.js');

  // Forge-correct basename, taken from edition-sync's ONE rename rule rather than typed out
  // three times: github ships the canonical (uninfixed) name, the other forges their own.
  const GAP_SWEEP_CANON = 'kaola-workflow-gap-sweep.js';
  const gapSweepBasename = forge =>
    forge === 'github' ? GAP_SWEEP_CANON : path.basename(forgeRel(GAP_SWEEP_CANON, forge));

  // The strict `## Run gaps` row grammar — the sentence that tells the author what to write.
  // Its input is the scan's sweptClasses, which is why the ordering below is the real property.
  const ROW_GRAMMAR = '<reasonClass> (<sample>): filed: #N';

  // A commented-out invocation instructs nobody (the closure-audit splice ships one on
  // purpose), so a `#`-led line is not a run however well-formed the command on it is.
  const isLive = text => !/^\s*#/.test(text);

  const finalizeSurfaces = GENERATED_SURFACES.filter(r => r.topic === 'finalize');
  assert(finalizeSurfaces.length === 6,
    `T6c universe: the finalize route ships 6 tracked surfaces (3 commands + 3 SKILLs, across `
    + `github/gitlab/gitea); got ${finalizeSurfaces.length}. A shrunken universe leaves every `
    + `assertion below vacuous while the suite still exits 0`);

  for (const row of finalizeSurfaces) {
    const base = gapSweepBasename(row.forge);
    if (!exists(row.path)) {
      assert(false, `T6c: ${row.path} is a registry-declared finalize surface but is not on disk`);
      continue;
    }
    const lines = fs.readFileSync(path.join(REPO, row.path), 'utf8').split('\n');
    // Bind to THIS surface's forge basename: a gitea surface invoking the github script is a
    // miss here, not a pass, so the pin cannot be satisfied by one basename copied everywhere.
    const invocations = lines
      .map((text, i) => ({ text, i }))
      .filter(l => l.text.includes(base) && isLive(l.text));
    const gate = invocations.find(l => l.text.includes('--check'));
    const scan = invocations.find(l => l.text.includes('--json') && !l.text.includes('--check'));

    assert(gate !== undefined,
      `T6c: ${row.path} must still splice the run-gap GATE (${base} ... --check)`);
    assert(scan !== undefined,
      `T6c: ${row.path} splices no run-gap SCAN — no live line runs ${base} with --json, so `
      + `nothing on this surface writes .cache/run-gaps.json or reports sweptClasses, and the `
      + `gate it does splice can only refuse artifact_missing`);
    if (scan) {
      assert(scan.text.includes('--project'),
        `T6c: ${row.path} runs the scan without --project, which gap-sweep requires — the `
        + `invocation exits 1 before scanning anything`);
    }
    if (scan && gate) {
      assert(scan.i < gate.i,
        `T6c: ${row.path} splices the GATE at line ${gate.i + 1} ahead of the SCAN at line `
        + `${scan.i + 1}. The gate reads the artifact the scan writes, so a scan placed after `
        + `it cannot supply what the gate already looked for`);
    }
    const grammar = lines.findIndex(text => text.includes(ROW_GRAMMAR));
    assert(grammar >= 0,
      `T6c: ${row.path} must state the strict "## Run gaps" row grammar (${ROW_GRAMMAR}) — it `
      + `is the anchor the ordering check below is measured against`);
    if (scan && grammar >= 0) {
      assert(scan.i < grammar,
        `T6c: ${row.path} states the "## Run gaps" row grammar at line ${grammar + 1} ahead of `
        + `the SCAN at line ${scan.i + 1}. sweptClasses is what tells the author WHICH rows to `
        + `write, so a scan the author reaches afterwards leaves those rows written from memory`);
    }
  }
}

// ---------------------------------------------------------------------------

// ===========================================================================
// #630 Layer-1 — required-block MANIFEST presence checker (derived-universe),
// bidirectional orphan-sentinel, the superset proof, and the by-construction
// RED-PROOF battery. ADDITIVE-SUPERSET: T1..T15 above stay byte-for-byte; the
// existing pins remain as residual-additive assertions. The manifest is the
// single source of the required-block presence contract; the surface UNIVERSE
// each block obligates is COMPUTED from topic + tags (never hand-typed), so
// obligating 4-of-6 surfaces by omission is structurally impossible.
// ===========================================================================
const { REQUIRED_BLOCKS } = require('../templates/routing/required-blocks.js');

// THE SURFACE UNIVERSE IS TWELVE TREES, NOT SIX. Six are tracked (three claude
// command dirs + three codex skills dirs); six are GENERATED and gitignored —
// .opencode{,-gitlab,-gitea} and .kimi{,-gitlab,-gitea}. Deriving from the
// claude/codex edition tables alone left those six unchecked, which made the
// old comment here ("a rename / 7th edition flows through automatically") true
// of the editions it knew and false of the four it did not.
//
// TWO LANES, NOT TWO FILE SHAPES. A lane is where the content COMES FROM, and
// that is what a block's surface_type_tag selects:
//   command — rendered from commands/*.md: the claude command dirs, the opencode
//             command dirs, AND the kimi skills dirs (Kimi packages a command as
//             a directory-form Skill, so it is skill-SHAPED but command-lane and
//             carries the COMMAND basename).
//   skill   — rendered from the skill skeletons: the codex skills dirs.
// Conflating lane with shape is what would have put the kimi surfaces in the
// wrong bucket and derived `.kimi/skills/kaola-workflow-init/SKILL.md`, a path
// no edition ships.
//
// Every entry is a PATH BUILDER asked of the module that owns the tree, so no
// path segment is restated here. A fourth forge added to the routing registry's
// edition tables reaches all four runtimes with no edit to this file: FORGES is
// derived from those tables, and both sync modules take the forge as an argument.
const opencodeSync = require('./sync-opencode-edition.js');
const kimiSync = require('./sync-kimi-edition.js');
const grokSync = require('./sync-grok-edition.js');
const cursorSync = require('./sync-cursor-edition.js');
const zcodeSync = require('./sync-zcode-edition.js');
const {
  FORGES: ROUTING_FORGES,
  GENERATED_SURFACES: ROUTING_SURFACES,
  COMMAND_EDITIONS: ROUTING_COMMAND_EDITIONS,
  SKILL_EDITIONS: ROUTING_SKILL_EDITIONS,
} = require('./generate-routing-surfaces.js');

// The additive runtime editions, as (id, per-forge surface-path builder) pairs.
// Both builders are the generators' own, so a tree rename inside a sync module
// propagates here rather than drifting from here.
const RUNTIME_EDITIONS = [
  {
    id: 'opencode',
    surfaceFor: forge => base =>
      path.relative(REPO, path.join(opencodeSync.outDirs(forge).command, base + '.md')),
  },
  {
    id: 'kimi',
    surfaceFor: forge => base => kimiSync.skillRel(base, forge),
  },
  {
    id: 'grok',
    surfaceFor: forge => base => grokSync.commandRel(base, forge),
  },
  {
    id: 'cursor',
    surfaceFor: forge => base => cursorSync.commandRel(base, forge),
  },
  {
    id: 'zcode',
    surfaceFor: forge => base => zcodeSync.commandRel(base, forge),
  },
];

// The TRACKED half comes from the routing registry's own edition tables, not from
// the claudeEditions/codexEditions literals above. Those literals are T1..T4's
// (pre-existing, byte-frozen) edition source and are a hand-kept twin of the same
// two tables; deriving the manifest universe through them would have left the
// tracked six pinned to a hand-typed list while the generated six flowed through —
// measured, with a fourth forge planted in a mirror: 14 trees instead of 16.
const MANIFEST_EDITIONS = {
  command: [
    ...ROUTING_COMMAND_EDITIONS.map(e => ({
      id: `${e.forge}-claude`,
      surface: base => `${e.dir}/${base}.md`,
    })),
    ...RUNTIME_EDITIONS.flatMap(rt => ROUTING_FORGES.map(forge => ({
      id: `${rt.id}-${forge}`,
      surface: rt.surfaceFor(forge),
    }))),
  ],
  skill: ROUTING_SKILL_EDITIONS.map(e => ({
    id: `${e.forge}-codex`,
    surface: base => `${e.dir}/${base}/SKILL.md`,
  })),
};

// ANTI-VACUITY FLOOR ON THE UNIVERSE ITSELF. Everything below reports "clean
// over N obligated file-checks", and N is a product of these lists — so a
// derivation that silently yields a short list would report a clean sweep over a
// fraction of the tree, which is the exact defect this extension repairs.
//
// THE ANCHOR IS INDEPENDENT OF THE TABLE IT CHECKS. Computing the expected width
// from RUNTIME_EDITIONS.length would be a guard that cannot fail: deleting an
// entry shrinks the expectation and the measurement in lockstep and stays green.
// Mutation-proved — dropping the kimi entry passed, which is how this floor got
// rewritten. So the roster is read off the FILESYSTEM instead: one
// `sync-<runtime>-edition.js` module per additive runtime edition. A tree whose
// generator ships but whose entry is missing here now reds, and a runtime edition
// genuinely retired takes its module with it and the floor follows.
//
// THE BOUNDARY, stated because a comment claiming a universal its body does not
// deliver is worse than no comment: only the RUNTIME term is independently
// anchored. The FORGE term is still read from the same registry this checks, so
// deleting a forge from the edition tables shrinks the universe from twelve
// surfaces to eight and THIS FLOOR stays green — mutation-proved, and left
// registry-derived on that basis rather than re-anchored.
//
// The floor, not the suite. Do not widen this to "the suite stays green": the
// The registry-derived routing surfaces remain the independent anchor for this
// floor; no orchestration choice or spawn policy is encoded here.
const RUNTIME_EDITION_MODULES = fs.readdirSync(path.join(REPO, 'scripts'))
  .filter(f => /^sync-[a-z0-9-]+-edition\.js$/.test(f))
  .map(f => f.slice('sync-'.length, -'-edition.js'.length))
  .sort();
{
  const declared = RUNTIME_EDITIONS.map(rt => rt.id).sort();
  assert(declared.join(',') === RUNTIME_EDITION_MODULES.join(','),
    `MANIFEST universe: every additive runtime edition that ships a generator must be checked — `
    + `generators [${RUNTIME_EDITION_MODULES.join(', ')}] vs declared [${declared.join(', ')}]`);
  // One tree per (runtime x forge). The tracked runtimes are the registry's own
  // surface types (command -> claude, skill -> codex); the additive ones are the
  // generator roster read off disk. Neither term is MANIFEST_EDITIONS itself.
  const trackedRuntimes = new Set(ROUTING_SURFACES.map(r => r.surface_type)).size;
  const expected = ROUTING_FORGES.length * (trackedRuntimes + RUNTIME_EDITION_MODULES.length);
  const actual = MANIFEST_EDITIONS.command.length + MANIFEST_EDITIONS.skill.length;
  assert(actual === expected,
    `MANIFEST universe: the obligated surface tree must span every runtime x forge edition — `
    + `expected ${expected} tree(s), derived ${actual} `
    + `(${MANIFEST_EDITIONS.command.map(e => e.id).join(', ')} | `
    + `${MANIFEST_EDITIONS.skill.map(e => e.id).join(', ')})`);
  assert(ROUTING_FORGES.length > 0 && RUNTIME_EDITION_MODULES.length > 0 && actual > 0,
    'MANIFEST universe: a zero-width universe would make every check below vacuously clean');
}

// The SIX generated trees are gitignored and absent from a fresh checkout, so
// they are rendered IN MEMORY through the sync modules' own renderers — the same
// bytes `sync --check` asserts the on-disk tree equals. That is provisioning-
// free and hermetic, and it cannot be defeated by a stale or missing tree: there
// is no "skip when absent" path here, because a check that quietly enforces
// nothing when its subject is missing is the defect, not the safeguard.
const GENERATED_SURFACE_CONTENT = (() => {
  const map = new Map();
  for (const forge of ROUTING_FORGES) {
    for (const row of ROUTING_SURFACES.filter(r => r.surface_type === 'command' && r.forge === forge)) {
      const base = path.basename(row.path, '.md');
      const canon = fs.readFileSync(path.join(REPO, row.path), 'utf8');
      const ocRel = path.relative(REPO, path.join(opencodeSync.outDirs(forge).command, base + '.md'));
      map.set(ocRel, opencodeSync.renderCommand(canon, forge, ocRel));
      map.set(kimiSync.skillRel(base, forge), kimiSync.renderCommand(canon, base, forge));
      map.set(grokSync.commandRel(base, forge), grokSync.renderCommand(canon, base, forge));
      map.set(cursorSync.commandRel(base, forge), cursorSync.renderCommand(canon, base, forge));
      map.set(zcodeSync.commandRel(base, forge), zcodeSync.renderCommand(canon, base, forge));
    }
  }
  return map;
})();

// The one reader of the live surface tree, shared by the real run and by the
// red-proofs that mutate a copy of it. Tracked surfaces come off disk; the six
// generated trees come from the in-memory render. A generated path the render
// did not produce falls through to the disk read and then to `null`, which reds
// as absent-surface — absent-but-expected is loud, never skipped.
const readRealSurface = rel => (GENERATED_SURFACE_CONTENT.has(rel)
  ? GENERATED_SURFACE_CONTENT.get(rel)
  : (exists(rel) ? fs.readFileSync(path.join(REPO, rel), 'utf8') : null));

const SHARED_TEST_MARKER = '<!-- PIN: manifest-shared-marker-probe -->';

// ---------------------------------------------------------------------------
// Topic basenames are read from the generated-surface registry.
// Topic basenames — READ FROM THE GENERATED-SURFACE REGISTRY, the same TOPICS table that renders
// the surfaces and drives the T1/T2 emitted-target set. That is the no-drift anchor: a rename or a
// fourth topic follows here for free, and a hand-typed basename can never disagree with what
// ships. finalize is symmetric; next and init are ASYMMETRIC (command basenames workflow-next /
// workflow-init vs skill basenames kaola-workflow-next / kaola-workflow-init).
const TOPIC_BASENAME = Object.fromEntries(routingTopicNames.map(t => [t, {
  command: ROUTING_TOPICS[t].command_basename,
  skill: ROUTING_TOPICS[t].skill_basename,
}]));

// Markers physically present on the in-scope surfaces that are managed by
// contracts OUTSIDE the #630 required-block manifest (structural section cards,
// not presence obligations, and unpinned by any validator). The reverse
// orphan-sentinel skips these so it reds ONLY on a rogue or self-disarmed
// marker (a manifest block deleted while its marker survives on the surface),
// never on a legitimately-foreign one.
const FOREIGN_MARKERS = new Set([
  // The consent rule is carried by EVERY topic, so one marker legitimately appears on all three.
  // The reverse sentinel keys marker -> single block, which cannot express that; the FORWARD
  // presence obligation is what enforces it here, via one manifest block per topic. Deleting a
  // topic's consent paragraph still reds — on the block, not on the sentinel.
  '<!-- PIN: consent-in-conversation -->',
  // Same shape as consent-in-conversation: the forge-is-the-backlog rule is restated once per
  // topic (next, init, finalize) rather than pointed at, and next/init each carry MULTIPLE spans
  // of this one marker text on the same surface. The reverse sentinel keys marker -> single block
  // via a plain Map, so registering nx-/in-/fn-forge-is-the-backlog would each overwrite the
  // last one in — every occurrence would resolve to whichever block happened to be declared last,
  // reporting orphan-surface on the other two topics' surfaces (measured: 61 false failures before
  // this entry was added). The three FORWARD presence blocks below are what actually enforce each
  // topic's wording; deleting any one span still reds its own block.
  '<!-- PIN: forge-is-the-backlog -->',
].map(norm));

// Legacy in-scope pin tokens the derived-universe manifest cannot fold cleanly (present on a
// strict SUBSET of a block's obligated set). EMPTY is the correct state, not a disarmed one: every
// legacy pin below folds into a manifest block whose derived set covers its surfaces. An entry
// here is a DECLARED exception and must carry the reason it cannot fold.
const RESIDUAL_ALLOWLIST = new Set([].map(norm));

const isMarker = t => /^<!--\s*(?:PIN|CARD):/.test(String(t).trim());

// deriveObligated — COMPUTE the exact obligated file set for a block from its
// topic + tags. Returns { error, files }. A tag that is unknown, or a
// runtime/surface-type inconsistency (claude-live carrying skill, or codex-live
// carrying command), yields an orphan-manifest error (empty file set).
function deriveObligated(block, editions, topicBasename) {
  const rt = block.runtime_tag, st = block.surface_type_tag;
  const okRt = rt === 'claude-live' || rt === 'codex-live' || rt === 'both';
  const okSt = st === 'command' || st === 'skill' || st === 'both';
  if (!okRt || !okSt || !topicBasename[block.topic]) return { error: 'bad-tag', files: [] };
  if (rt === 'claude-live' && st === 'skill') return { error: 'orphan-manifest', files: [] };
  if (rt === 'codex-live' && st === 'command') return { error: 'orphan-manifest', files: [] };
  let types;
  if (rt === 'claude-live') types = ['command'];
  else if (rt === 'codex-live') types = ['skill'];
  else types = st === 'both' ? ['command', 'skill'] : [st];
  const files = [];
  for (const stype of types) {
    const base = topicBasename[block.topic][stype];
    // Each edition owns its own path shape (flat `<dir>/<base>.md` vs directory-
    // form `<dir>/<base>/SKILL.md`); the LANE picks the basename, the edition
    // picks the layout. Asking the edition is what lets one lane hold surfaces of
    // both shapes — which the kimi trees are.
    for (const ed of (editions[stype] || [])) files.push(ed.surface(base));
  }
  return { error: null, files };
}

// checkManifest — PURE (no fs / no exit). readSurface(rel) -> string|null is
// injected (real: fs+exists; fixtures: an in-memory map). Returns
// { failures:[], obligatedCount }.
function checkManifest({ blocks, readSurface, editions, topicBasename, foreignMarkers }) {
  const failures = [];
  const foreign = foreignMarkers instanceof Set
    ? foreignMarkers
    : new Set((foreignMarkers || []).map(norm));
  let obligatedCount = 0;
  // A marker may intentionally lead more than one topic block, so the reverse
  // sentinel resolves by the block whose derived surface set contains the file.
  const markerToBlocks = new Map();

  // FORWARD — every content token present on every surface the block obligates.
  for (const b of blocks) {
    const { error, files } = deriveObligated(b, editions, topicBasename);
    if (error || files.length === 0) {
      failures.push(`orphan-manifest: block ${b.block_id} (${error || 'empty derived set'})`);
      continue;
    }
    obligatedCount += files.length;
    const first = b.content_tokens[0];
    if (isMarker(first)) {
      const marker = norm(first);
      if (!markerToBlocks.has(marker)) markerToBlocks.set(marker, []);
      markerToBlocks.get(marker).push(b);
    }
    for (const f of files) {
      const content = readSurface(f);
      if (content === null) {
        failures.push(`absent-surface: block ${b.block_id} obligates ${f} (not found)`);
        continue;
      }
      const nc = norm(content);
      for (const tok of b.content_tokens) {
        if (!nc.includes(norm(tok))) {
          failures.push(`missing-token: block ${b.block_id} token ${JSON.stringify(tok)} absent from ${f}`);
        }
      }
    }
  }

  // REVERSE orphan-sentinel — scan every in-scope surface for PIN/CARD markers;
  // each MUST map to a manifest block whose first token is that marker AND whose
  // obligated set includes this surface, else orphan-surface red (unless the
  // marker is a declared foreign marker managed outside this manifest).
  const inScope = [];
  for (const topic of Object.keys(topicBasename)) {
    for (const stype of ['command', 'skill']) {
      const base = topicBasename[topic][stype];
      for (const ed of (editions[stype] || [])) inScope.push(ed.surface(base));
    }
  }
  for (const f of inScope) {
    const content = readSurface(f);
    if (content === null) continue;
    const markers = content.match(/<!--\s*(?:PIN|CARD):[^>]*-->/g) || [];
    for (const raw of markers) {
      const m = norm(raw);
      if (foreign.has(m)) continue;
      const candidates = markerToBlocks.get(m) || [];
      if (candidates.length === 0) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} has no manifest block`);
        continue;
      }
      const matches = candidates.filter(b => deriveObligated(b, editions, topicBasename).files.includes(f));
      if (matches.length === 0) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} is not obligated by any of the ${candidates.length} manifest blocks`);
      } else if (matches.length > 1) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} is ambiguously obligated by blocks ${matches.map(b => b.block_id).join(', ')}`);
      }
    }
  }

  return { failures, obligatedCount };
}

// foldsGeneric — the superset-proof primitive: does a legacy (token,surfaces)
// pin fold into a manifest block whose derived obligated set ⊇ the legacy
// surfaces, or is it an accepted residual? Parameterized so both the real proof
// and the red-proof fixture drive the identical logic.
function foldsGeneric(token, legacySurfaces, blocks, allowlist, editions, topicBasename) {
  if (allowlist.has(norm(token))) return true;
  return blocks.some(b =>
    b.content_tokens.some(t => norm(t) === norm(token)) &&
    legacySurfaces.every(s => deriveObligated(b, editions, topicBasename).files.includes(s)));
}

// --- REAL-RUN invocation: manifest presence over the live surface tree -------
{
  const realResult = checkManifest({
    blocks: REQUIRED_BLOCKS,
    readSurface: readRealSurface,
    editions: MANIFEST_EDITIONS,
    topicBasename: TOPIC_BASENAME,
    foreignMarkers: FOREIGN_MARKERS,
  });
  for (const msg of realResult.failures) assert(false, `MANIFEST ${msg}`);
  assert(realResult.failures.length === 0,
    `MANIFEST: derived-universe presence check clean over ${realResult.obligatedCount} obligated file-checks`);
}

// --- NON-VACUITY FLOOR (manifest-wide) — every marker-led block must carry at least ONE
//     distinctive token that is not a substring of its own marker.
//
//     WHY A FLOOR AND NOT A PER-BLOCK RULE: the #637 lesson was, until now, re-applied by hand,
//     one bespoke assert per block (the three that follow). A block nobody wrote an assert for
//     was unguarded — and two such blocks had in fact gone vacuous: `pr-frontier-unit` ('frontier
//     unit' is a substring of `<!-- PIN: frontier unit -->`) and `pr-gate-instrumentation` (marker
//     ONLY, zero distinctive tokens). Both passed every check while pinning nothing: the marker's
//     mere presence satisfied the block even if the prose under it were rewritten to say the
//     opposite. This floor is the general form, so the class cannot return via a new block.
//
//     FLOOR, NOT CEILING: it demands >=1 distinctive token, not that EVERY token be distinctive —
//     a vacuous token may legitimately ride along when a legacy proof still names it (the T5
//     SUPERSET-PROOF names the 'frontier unit' literal). The three bespoke asserts below are the
//     stricter no-vacuous-token-at-all rule and are deliberately KEPT: replacing them with this
//     weaker floor would be a regression, not a simplification.
//     FAILS CLOSED: a floor that `continue`s past shapes it does not recognize is itself vacuous.
//     Three degenerate shapes must RED rather than be skipped: an empty/absent content_tokens array
//     (demands nothing, and checkManifest's per-token loop over [] is a no-op, so nothing else reds
//     it either), and a comment-shaped first token that is not a PIN/CARD marker — `<!-- pin: x -->`
//     (isMarker is case-SENSITIVE) or `<!-- NOTE: ... -->` — which would otherwise slip past both
//     this floor and the reverse orphan-sentinel that keys on recognized markers.
//     Blocks legitimately led by a plain content token are NOT marker-led and need no distinctive
//     sibling: their first token is itself the distinctive one.
{
  const violations = [];
  for (const b of REQUIRED_BLOCKS) {
    const toks = b.content_tokens;
    if (!Array.isArray(toks) || toks.length === 0) {
      violations.push(b.block_id + ' (no content_tokens — the block demands nothing)');
      continue;
    }
    const first = toks[0];
    if (/^\s*<!--/.test(String(first)) && !isMarker(first)) {
      violations.push(b.block_id + ' (comment-shaped first token is not a PIN/CARD marker: '
        + JSON.stringify(String(first)) + ')');
      continue;
    }
    if (!isMarker(first)) continue;             // content-led block: first token is itself distinctive
    const marker = norm(first);
    if (!toks.slice(1).some(t => !marker.includes(norm(t)))) {
      violations.push(b.block_id + ' (marker-only or substring-only — pins nothing)');
    }
  }
  assert(violations.length === 0,
    'NON-VACUITY FLOOR: every marker-led block needs >=1 token that is not a substring of its own '
      + 'marker, every block needs >=1 token, and a comment-shaped first token must be a recognized '
      + 'PIN/CARD marker; offenders: ' + JSON.stringify(violations));
}

// --- CONSENT BLOCK SANITY: the consent rule replaced a durable valve, so its manifest blocks are
//     the only thing standing between the three topics and a silently-deleted mechanism. Assert
//     one block per topic, each obligating all six of its surfaces, with a distinctive token that
//     is not a substring of its own marker. ------------------------------------------------
{
  for (const topic of routingTopicNames) {
    const block = REQUIRED_BLOCKS.find(b => b.topic === topic
      && b.content_tokens[0] === '<!-- PIN: consent-in-conversation -->');
    assert(!!block, `consent: ${topic} must carry a consent-in-conversation manifest block`);
    if (!block) continue;
    const { error, files } = deriveObligated(block, MANIFEST_EDITIONS, TOPIC_BASENAME);
    // The width is DERIVED, not the literal 6 that stood here while four editions
    // were invisible: a both/both block obligates every tree in both lanes.
    const everyTree = MANIFEST_EDITIONS.command.length + MANIFEST_EDITIONS.skill.length;
    assert(!error && files.length === everyTree,
      `consent: the ${topic} consent block must obligate all ${everyTree} of its surfaces (both/both), got ${files.length}`);
    const marker = norm(block.content_tokens[0]);
    assert(block.content_tokens.slice(1).length > 0
      && block.content_tokens.slice(1).every(t => !marker.includes(norm(t))),
      `consent: the ${topic} consent block needs >=1 token that is not a substring of its marker`);
  }
  assert(exists('templates/axioms.md'),
    'the canonical First Principles source must exist');
}

// --- AXIOM POINTER SANITY: the `next` surfaces reach the axiom layer by a short POINTER — the
//     layer itself is embedded in the workflow-init CLAUDE.md template, and the pointer is what
//     tells a reader in a consumer repo that a tie-breaking order exists and where to read it.
//     Its presence obligation is the manifest block below, and this band is what makes the BLOCK's
//     own deletion loud.
//
//     WHY A BAND AND NOT JUST THE BLOCK: the block is content-led — the pointer sits in the shared
//     skeleton body with no PIN marker around it — so the reverse orphan-sentinel, which keys
//     marker -> block, cannot notice it leave. That is not hypothetical: this block was declared,
//     then deleted with the routing-surface extraction, and every suite stayed green for months
//     because all twelve surfaces went on carrying the pointer regardless. A presence obligation
//     nothing notices the absence of is one edit from gone, and this is the shape of edit that
//     took it.
//
//     A POINTER, NOT THE BLOCK. Do not widen this to the axiom text: carrying the five axioms onto
//     a `next` surface is a different decision from pointing at them, and the byte-identity guard
//     that owns the embeds is testAxiomBlockByteIdentity, not this file.
{
  const AXIOM_POINTER_BLOCK = 'nx-first-principles';
  const block = REQUIRED_BLOCKS.find(b => b.block_id === AXIOM_POINTER_BLOCK);
  // Named, not derived — the block IS the subject — but asserted, so a rename reds here instead of
  // quietly resolving to `undefined` and checking nothing.
  assert(!!block,
    `axiom pointer: the manifest must carry the ${AXIOM_POINTER_BLOCK} block — it is the only `
    + 'presence obligation on the axiom pointer, and being content-led it leaves no marker behind '
    + 'for the reverse orphan-sentinel to trip on');
  if (block) {
    const { error, files } = deriveObligated(block, MANIFEST_EDITIONS, TOPIC_BASENAME);
    assert(block.topic === 'next',
      `axiom pointer: ${AXIOM_POINTER_BLOCK} must stay on the next topic, got ${JSON.stringify(block.topic)}`);

    // WIDTH, CHECKED TWICE, because the two comparisons fail on different things and neither
    // subsumes the other.
    //
    // (a) DERIVED — the block must obligate the FULL both/both universe, whatever that universe
    //     currently is. This is what catches a tag NARROWED (surface_type_tag dropped to
    //     'command'), which would silently stop watching the three Codex skill packs while the
    //     manifest still looked like it covered the topic.
    const everyTree = MANIFEST_EDITIONS.command.length + MANIFEST_EDITIONS.skill.length;
    assert(!error && files.length === everyTree,
      `axiom pointer: the ${AXIOM_POINTER_BLOCK} block must obligate all ${everyTree} next surfaces `
      + `(both/both), got ${files.length}${error ? ' (' + error + ')' : ''}`);

    // (b) LITERAL — and this one is the count itself, not a comparison against the registry. Read
    //     off the same edition tables it measures, (a) shrinks in lockstep with them: delete a
    //     forge and both sides fall from twelve to eight together, and the pointer stops being
    //     checked on four surfaces with nothing red. That is the failure mode the sibling floors in
    //     this file and in testAxiomBlockByteIdentity both document about their own forge term. The
    //     literal is what makes the forge term visible HERE.
    //     It is a two-place edit on purpose: a fourth forge, or a third additive runtime, reds this
    //     line, and the correct response is to confirm the NEW surfaces carry the pointer and then
    //     move the number — never to move the number first.
    const NEXT_SURFACES = 21;   // 3 forges x (claude command + codex skill + opencode + kimi + grok + cursor + zcode)
    assert(files.length === NEXT_SURFACES,
      `axiom pointer: the axiom pointer is obligated on ${files.length} next surface(s), expected `
      + `${NEXT_SURFACES}. If the surface universe legitimately changed, verify the pointer is on `
      + `every new surface BEFORE changing this number; derived set: ${files.join(', ')}`);
  }
}

// --- SUPERSET PROOF: every legacy in-scope T-pin token folds into a manifest
//     block (⊇ the legacy surface set) or is an accepted residual. Covers the
//     #624-fix gate flags + workflow_path:adaptive explicitly. --------------
{
  // Surface lists per topic, asked of the editions rather than string-built, and
  // named for the lane rather than a count — they were FN_ALL/NX_ALL/IN_ALL while six
  // trees were invisible, and a name carrying a stale number is how a widened
  // universe stays unnoticed.
  const lanes = topic => [
    ...MANIFEST_EDITIONS.command.map(e => e.surface(TOPIC_BASENAME[topic].command)),
    ...MANIFEST_EDITIONS.skill.map(e => e.surface(TOPIC_BASENAME[topic].skill)),
  ];
  const FN_ALL = lanes('finalize'), NX_ALL = lanes('next'), IN_ALL = lanes('init');

  const LEGACY_PAIRS = [
    // consent — every topic × 6 (both/both); the rule that replaced the durable valve
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: NX_ALL },
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: IN_ALL },
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: FN_ALL },
    // finalize × 6
    { token: '<!-- PIN: closure-audit -->', surfaces: FN_ALL },
    { token: '--issue-numbers', surfaces: FN_ALL },
    { token: 'issue_numbers', surfaces: FN_ALL },
    { token: 'final-validation.md', surfaces: FN_ALL },
    { token: 'chain-receipt.json', surfaces: FN_ALL },
    { token: '## Validation', surfaces: FN_ALL },
    { token: '## Changed Paths', surfaces: FN_ALL },
    { token: '`changed_paths`', surfaces: FN_ALL },
    { token: '<!-- PIN: sink-reports-orchestrator-owns -->', surfaces: FN_ALL },
    // next × 6
    { token: 'mission-list.md', surfaces: NX_ALL },
    { token: 'Look for the work, not for the worker.', surfaces: NX_ALL },
    { token: '--target-issue', surfaces: NX_ALL },
    { token: '--target-issues', surfaces: NX_ALL },
  ];

  for (const p of LEGACY_PAIRS) {
    const ok = foldsGeneric(p.token, p.surfaces, REQUIRED_BLOCKS, RESIDUAL_ALLOWLIST, MANIFEST_EDITIONS, TOPIC_BASENAME);
    assert(ok,
      `SUPERSET-PROOF: legacy token ${JSON.stringify(p.token)} must fold into a manifest block (⊇ its ${p.surfaces.length} legacy surface(s)) or be an accepted residual`);
  }
}

// --- RED-PROOF battery: by-construction self-tests over in-memory fixtures (NO
//     real-tree mutation). Each plants a defect and asserts the checker reds. -
{
  // 1-edition-per-lane, 1-topic synthetic universe. Editions are path builders,
  // exactly as the real ones are, so the fixtures drive the identical code path.
  const flat = dir => base => `${dir}/${base}.md`;
  const skillDir = dir => base => `${dir}/${base}/SKILL.md`;
  const ED = {
    command: [{ id: 'cmd', surface: flat('cmd') }],
    skill: [{ id: 'skl', surface: skillDir('skl') }],
  };
  const TB = { t: { command: 'foo', skill: 'foo' } };
  const mapSurface = surfaces => rel => (Object.prototype.hasOwnProperty.call(surfaces, rel) ? surfaces[rel] : null);

  function expectRed(label, { blocks, surfaces, editions = ED, topicBasename = TB, foreignMarkers = new Set() }) {
    const r = checkManifest({ blocks, readSurface: mapSurface(surfaces), editions, topicBasename, foreignMarkers });
    assert(r.failures.length > 0, `RED-PROOF ${label}: checkManifest must report >=1 failure on the planted defect`);
  }

  // (1) DROPPED — surface present, one content token removed from an obligated
  //     surface → missing-token red.
  expectRed('dropped-block', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    surfaces: {
      'cmd/foo.md': '<!-- PIN: a --> anchor-token',
      'skl/foo/SKILL.md': '<!-- PIN: a -->', // anchor-token DROPPED here
    },
  });

  // (2) HOLLOWED — marker kept, the distinctive 2nd token gone from every
  //     obligated surface → red (proves bare markers are insufficient).
  expectRed('hollowed-block', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'deep-content'] }],
    surfaces: {
      'cmd/foo.md': 'prose <!-- PIN: a --> prose',
      'skl/foo/SKILL.md': 'prose <!-- PIN: a --> prose',
    },
  });

  // (3) NEW-SURFACE-MISSING — a 2nd synthetic edition y is auto-obligated by a
  //     both/both block; its file is absent → absent-surface red (proves the
  //     obligated set expands automatically, no hand-typed file list).
  expectRed('new-surface-missing', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    editions: {
      command: [{ id: 'x', surface: flat('x') }, { id: 'y', surface: flat('y') }],
      skill: [{ id: 'sx', surface: skillDir('sx') }],
    },
    surfaces: {
      'x/foo.md': '<!-- PIN: a --> anchor-token',
      'sx/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
      // y/foo.md deliberately absent
    },
  });

  // (3b) NEW-SHAPE-MISSING — the same proof for a SKILL-SHAPED entry sharing the
  //      COMMAND lane, which is exactly what the kimi trees are. Without this the
  //      lane/shape split would be exercised only by the real tree, and a
  //      regression that collapsed shape back onto lane would still look green
  //      here. `z` derives `z/foo/SKILL.md`, not `z/foo.md`.
  expectRed('new-shape-missing', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    editions: {
      command: [{ id: 'x', surface: flat('x') }, { id: 'z', surface: skillDir('z') }],
      skill: [{ id: 'sx', surface: skillDir('sx') }],
    },
    surfaces: {
      'x/foo.md': '<!-- PIN: a --> anchor-token',
      'sx/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
      'z/foo.md': '<!-- PIN: a --> anchor-token', // the FLAT path — the skill-dir one is absent
    },
  });

  // (4) ORPHAN-MANIFEST — an inconsistent tag pair (claude-live + skill) yields
  //     an empty/error derived set → orphan-manifest red.
  expectRed('orphan-manifest', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'claude-live', surface_type_tag: 'skill',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    surfaces: { 'cmd/foo.md': '<!-- PIN: a --> anchor-token' },
  });

  // (5) ORPHAN-SURFACE — the forward pass is clean, but a rogue marker with no
  //     manifest block sits on a surface → reverse-sentinel red (catches R2
  //     self-disarm: a deleted manifest block whose marker survives on-surface).
  {
    const blocks = [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }];
    const surfaces = {
      'cmd/foo.md': '<!-- PIN: a --> anchor-token <!-- PIN: rogue -->',
      'skl/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
    };
    const r = checkManifest({ blocks, readSurface: mapSurface(surfaces), editions: ED, topicBasename: TB, foreignMarkers: new Set() });
    assert(r.failures.length > 0 && r.failures.some(m => m.startsWith('orphan-surface')),
      'RED-PROOF orphan-surface: a rogue marker with no manifest block must red the reverse orphan-sentinel');
  }

  // (6) SHARED-MARKER NON-OBLIGATED — a known shared marker is carried by a
  // command-only manifest block but appears on the in-scope skill surface. The
  // forward obligation is clean; the reverse sentinel must reach the new
  // candidates.length > 0 / matches.length === 0 branch rather than treating
  // this as an unknown marker.
  {
    const blocks = [{ block_id: 'shared-marker-command-only', topic: 't',
      runtime_tag: 'claude-live', surface_type_tag: 'command',
      content_tokens: [SHARED_TEST_MARKER, 'anchor-token'] }];
    const surfaces = {
      'cmd/foo.md': `${SHARED_TEST_MARKER} anchor-token`,
      'skl/foo/SKILL.md': `${SHARED_TEST_MARKER} unrelated-surface-prose`,
    };
    const r = checkManifest({
      blocks,
      readSurface: mapSurface(surfaces),
      editions: ED,
      topicBasename: TB,
      foreignMarkers: new Set(),
    });
    const expected = `orphan-surface: marker ${JSON.stringify(SHARED_TEST_MARKER)} on skl/foo/SKILL.md `
      + 'is not obligated by any of the 1 manifest blocks';
    assert(r.obligatedCount === 1 && r.failures.length === 1 && r.failures[0] === expected,
      'RED-PROOF shared-marker-non-obligated: the known shared marker must take the exact '
      + `matches.length === 0 rejection, with clean forward obligations; got ${JSON.stringify(r.failures)}`);
  }

  // (7) SHARED-MARKER AMBIGUITY — two same-marker command blocks genuinely
  // overlap on the observed command surface. Both forward obligations are
  // clean; the reverse sentinel must reach matches.length > 1 and name both
  // owning blocks. An exact failure assertion keeps this tied to the branch.
  {
    const blocks = [
      { block_id: 'shared-marker-overlap-a', topic: 't', runtime_tag: 'claude-live',
        surface_type_tag: 'command', content_tokens: [SHARED_TEST_MARKER, 'anchor-a'] },
      { block_id: 'shared-marker-overlap-b', topic: 't', runtime_tag: 'claude-live',
        surface_type_tag: 'command', content_tokens: [SHARED_TEST_MARKER, 'anchor-b'] },
    ];
    const surfaces = {
      'cmd/foo.md': `${SHARED_TEST_MARKER} anchor-a anchor-b`,
      'skl/foo/SKILL.md': 'skill-surface-without-the-shared-marker',
    };
    const r = checkManifest({
      blocks,
      readSurface: mapSurface(surfaces),
      editions: ED,
      topicBasename: TB,
      foreignMarkers: new Set(),
    });
    const expected = `orphan-surface: marker ${JSON.stringify(SHARED_TEST_MARKER)} on cmd/foo.md `
      + 'is ambiguously obligated by blocks shared-marker-overlap-a, shared-marker-overlap-b';
    assert(r.obligatedCount === 2 && r.failures.length === 1 && r.failures[0] === expected,
      'RED-PROOF shared-marker-ambiguity: overlapping known-marker blocks must take the exact '
      + `matches.length > 1 rejection and name both blocks; got ${JSON.stringify(r.failures)}`);
  }

  // (8) SUPERSET-PROOF — a legacy pin whose token no manifest block carries and
  //     which is not allow-listed must NOT fold → the superset proof reds.
  {
    const blocks = [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }];
    const folded = foldsGeneric('unfoldable-needle', ['cmd/foo.md'], blocks, new Set(), ED, TB);
    assert(folded === false,
      'RED-PROOF superset-proof: an unfolded, non-allow-listed legacy token must fail the superset proof');
  }

  // (9) CLOSURE-AUDIT VACUOUS-GUARD (#637) — the LIVE fn-closure-audit block
  //     (imported straight from the real manifest, not a synthetic stand-in) is
  //     exercised against a fixture where every real finalize surface's marker
  //     is PRESERVED but its interior prose is GUTTED. Pre-fix, the block's 2nd
  //     content_token ('closure-audit') is a bare SUBSTRING of its own marker
  //     ('<!-- PIN: closure-audit -->'), so a marker-only surface trivially
  //     satisfies it and the checker stays vacuous-green on the gut — this case
  //     must RED. (Confirmed pre-fix: this assertion fails, proving the bug is
  //     real; post-fix — a distinctive non-marker-substring token added to the
  //     manifest — it passes.)
  {
    const closureAuditBlock = REQUIRED_BLOCKS.find(b => b.block_id === 'fn-closure-audit');
    assert(!!closureAuditBlock,
      'RED-PROOF closure-audit-vacuous-guard: fn-closure-audit block must exist in the manifest');
    const obligated = deriveObligated(closureAuditBlock, MANIFEST_EDITIONS, TOPIC_BASENAME).files;
    const guttedSurfaces = {};
    for (const f of obligated) guttedSurfaces[f] = '<!-- PIN: closure-audit -->'; // marker kept, interior GUTTED
    const r = checkManifest({
      blocks: [closureAuditBlock],
      readSurface: mapSurface(guttedSurfaces),
      editions: MANIFEST_EDITIONS,
      topicBasename: TOPIC_BASENAME,
      foreignMarkers: FOREIGN_MARKERS,
    });
    assert(r.failures.length > 0,
      'RED-PROOF closure-audit-vacuous-guard: gutting the closure-audit interior while keeping the bare PIN marker must red the derived-universe checker (a content_token that is a substring of its own marker is vacuous)');
  }

  // (10) AXIOM-POINTER PER-SURFACE INDEPENDENCE — the LIVE nx-first-principles block, exercised
  //     against a copy of the REAL surface tree with the pointer paragraph removed from ONE
  //     surface at a time. A guard is evidence only once mutation-proven, and an N-site mutant
  //     proves >=1, never N: this loops the mutation over every obligated surface separately and
  //     requires the failure to NAME the surface it was planted on, so "one surface reds" can
  //     never be mistaken for "the surfaces are watched".
  //
  //     THE MUTATION IS STRUCTURAL, NOT TOKEN-SHAPED. It removes the whole pointer paragraph, the
  //     way a surface actually loses it. Deleting exactly the substrings the manifest greps for
  //     would prove the loop runs, not that the tokens track the prose a reader depends on.
  //
  //     GREEN CONTROL FIRST. A loop that reds for a reason unrelated to the planted defect reads
  //     as a proof and is not one, so the unmutated tree is asserted clean before anything is cut.
  {
    const block = REQUIRED_BLOCKS.find(b => b.block_id === 'nx-first-principles');
    assert(!!block, 'RED-PROOF axiom-pointer: the nx-first-principles block must exist to mutate');
    if (block) {
      const obligated = deriveObligated(block, MANIFEST_EDITIONS, TOPIC_BASENAME).files;
      const real = {};
      for (const f of obligated) real[f] = readRealSurface(f);
      const unreadable = obligated.filter(f => real[f] === null);
      assert(unreadable.length === 0,
        'RED-PROOF axiom-pointer: every obligated next surface must be readable before it can be '
        + 'mutated; unreadable: ' + JSON.stringify(unreadable));

      const missingTokenFailures = surfaces => checkManifest({
        blocks: [block],
        readSurface: mapSurface(surfaces),
        editions: MANIFEST_EDITIONS,
        topicBasename: TOPIC_BASENAME,
        foreignMarkers: FOREIGN_MARKERS,
      }).failures.filter(m => m.startsWith(`missing-token: block ${block.block_id} `));

      const control = missingTokenFailures(real);
      assert(control.length === 0,
        'RED-PROOF axiom-pointer (green control): the unmutated tree must produce no missing-token '
        + 'failure for the axiom pointer — got ' + JSON.stringify(control));

      // The loop below asks "is the pin armed on each surface separately", and that question only
      // has an answer against a tree that still carries the pointer everywhere. On a tree that has
      // already lost it, every iteration inherits the standing failure and the loop emits a wall of
      // cascade instead of a finding. So it runs only behind the control — which is ASSERTED, not
      // assumed, one line up, and the real breakage is already reported there and by the real-run
      // MANIFEST check. Nothing goes unenforced in the skipped case; what is skipped is a verdict
      // that would be noise.
      if (control.length === 0) {
        // The paragraph's lead is a literal, and a surface whose pointer cannot be located is
        // reported as unwitnessed rather than skipped, so a reworded lead reds here instead of
        // quietly turning the mutation into a no-op.
        const POINTER_LEAD = '**First Principles.**';
        const stripPointer = body => {
          const lines = String(body).split('\n');
          const start = lines.findIndex(l => l.startsWith(POINTER_LEAD));
          if (start < 0) return null;
          let end = start;
          while (end < lines.length && lines[end].trim() !== '') end++;
          while (end < lines.length && lines[end].trim() === '') end++;
          return lines.slice(0, start).concat(lines.slice(end)).join('\n');
        };
        // A failure names the surface it was found on as its suffix; the surface is what this loop
        // reports, never the token list, which would bury the finding it exists to make readable.
        const surfaceOf = m => m.slice(m.lastIndexOf(' absent from ') + ' absent from '.length);

        const unwitnessed = [];
        for (const target of obligated) {
          const stripped = stripPointer(real[target]);
          if (stripped === null) {
            unwitnessed.push(`${target} — no paragraph led by ${JSON.stringify(POINTER_LEAD)} to remove`);
            continue;
          }
          const named = new Set(
            missingTokenFailures(Object.assign({}, real, { [target]: stripped })).map(surfaceOf));
          if (!named.has(target)) {
            unwitnessed.push(`${target} — removing its pointer reddened no failure naming it `
              + `(named instead: ${[...named].join(', ') || 'nothing'})`);
            continue;
          }
          named.delete(target);
          if (named.size > 0) {
            unwitnessed.push(`${target} — removing its pointer also reddened ${[...named].join(', ')}, `
              + 'so a per-surface failure cannot be told from a tree-wide one');
          }
        }
        assert(unwitnessed.length === 0,
          `RED-PROOF axiom-pointer: removing the pointer paragraph from any ONE of the `
          + `${obligated.length} next surfaces must red naming THAT surface and no other; `
          + `unwitnessed: ${JSON.stringify(unwitnessed)}`);
      }
    }
  }
}

if (failed) {
  console.error(`\nRoute-reachability test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`Route-reachability test passed (${passed} assertions).`);
