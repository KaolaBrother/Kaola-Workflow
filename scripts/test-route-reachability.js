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
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
const exists = rel => fs.existsSync(path.join(REPO, rel));
// whitespace-normalize multi-word needles for reflow tolerance (same convention as the
// validate-*-contracts.js norm() helper) — a prose sentence line-wrapped in the source markdown
// must still match a needle written as one continuous string.
const norm = s => String(s).replace(/\s+/g, ' ');

// Control-plane literal validator — retained for the Codex dispatch-block checks below; it binds
// its checks to the agents.spawn_agent YAML object itself, never to compliant prose elsewhere in
// the same document.
function controlPlaneBlockValid(content, spec) {
  const match = content.match(/```yaml\s*\nagents\.spawn_agent:\n([\s\S]*?)\n```/);
  if (!match) return false;
  const block = match[1];
  const entries = block.split('\n').map(line => line.match(/^  ([a-z_]+): "([^"]*)"$/));
  if (entries.some(entry => !entry)) return false;
  const expectedKeys = ['task_name', 'agent_type', 'fork_turns', 'message'];
  const keys = entries.map(entry => entry[1]);
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) return false;
  const values = Object.fromEntries(entries.map(entry => [entry[1], entry[2]]));
  const message = values.message;
  return values.task_name === spec.taskName
    && values.agent_type === spec.agentType
    && values.fork_turns === 'none'
    && message.startsWith('Repository root:')
    && message.includes(spec.targetField)
    && message.includes(spec.contractField)
    && message.includes(spec.returnField)
    && message.includes('Return only')
    && !message.includes('inherit the full parent conversation');
}

function conflictingControlPlaneMutations(content) {
  return [
    ['duplicate task', content.replace('  agent_type:', '  task_name: "wrong_task"\n  agent_type:')],
    ['duplicate role', content.replace('  fork_turns:', '  agent_type: "default"\n  fork_turns:')],
    ['duplicate fork', content.replace('  message:', '  fork_turns: "all"\n  message:')],
    ['duplicate message', content.replace(
      /(agents\.spawn_agent:[\s\S]*?  message: "[^"]+")(\n```)/,
      '$1\n  message: "inherit the full parent conversation"$2')]
  ];
}

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
  assert(n.includes('kaola-workflow/{project}/mission-list.md') && n.includes(norm('docs/mission-list.md')),
    `T4[${ed.name}]: next SKILL names the run's mission list AND points at the canonical format`);
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
// T19: every Codex skill that can directly dispatch a named role must execute
// the normal, fail-closed profile gate on entry. A doctor-only probe reports
// state but cannot authorize dispatch, and downstream skills are valid direct
// resume entry points, so a router-only check is insufficient.
// ---------------------------------------------------------------------------
{
  const expectedDispatchSkills = [
    'kaola-workflow-finalize',
    'kaola-workflow-next',
  ];
  // A skill is dispatch-capable iff it instructs a role spawn. "on the spawn call" is the phrase
  // both surviving skills carry (each names the role's configured model at dispatch time); the
  // other alternatives are older spellings kept so a re-worded surface still registers rather
  // than silently dropping out of the universe.
  const dispatchSignal = /(?:on the spawn call|subagent-invoked|agents\.spawn_agent|MUST delegate|Use the `[^`]+` Codex agent role)/;
  // The init skill EMITS a CLAUDE.md template that itself describes role dispatch. That is text it
  // WRITES into a consumer repo, never an instruction it follows, so the bounded template region is
  // excluded before the universe is derived — otherwise init joins the dispatch universe on the
  // strength of a document it is merely authoring, and then reds for lacking a gate it never needs.
  const TEMPLATE_REGION = /<!-- KW-CLAUDE-TEMPLATE-START -->[\s\S]*?<!-- KW-CLAUDE-TEMPLATE-END -->/g;
  const dispatchBody = c => c.replace(TEMPLATE_REGION, '');
  const marker = '<!-- PIN: codex-profile-preflight -->';
  const requiredTokens = [
    'normal preflight gate, not `--doctor`',
    '`kaola-workflow-codex-preflight.js`',
    '`codex plugin list --json`',
    'Resolve exactly one enabled installed Kaola edition from',
    'Never search `$PWD/plugins`',
    '`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`',
    '`--project-root "$PWD" --no-autofix --json`',
    'merges persisted config from HOME through the repository root to `"$PWD"`',
    '`profile_preflight_refused`',
    '`profile_bytes_mismatch`',
    'item==="."||item===".."',
    'plugin cache root escapes HOME',
    'const parts=[".codex","plugins","cache"',
    'Re-run the gate if the installed profile set changes',
  ];
  const allPreflightBlocks = [];

  for (const edition of codexEditions) {
    const skillNames = fs.readdirSync(path.join(REPO, edition.skillsDir), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => {
        const skillPath = path.join(REPO, edition.skillsDir, name, 'SKILL.md');
        return fs.existsSync(skillPath) && dispatchSignal.test(dispatchBody(fs.readFileSync(skillPath, 'utf8')));
      })
      .sort();
    assert(JSON.stringify(skillNames) === JSON.stringify(expectedDispatchSkills),
      `T19: ${edition.skillsDir} dispatch-capable skill universe stays explicit and complete`);

    for (const name of skillNames) {
      const file = `${edition.skillsDir}/${name}/SKILL.md`;
      const content = fs.readFileSync(path.join(REPO, file), 'utf8');
      const start = content.indexOf(marker);
      const end = start >= 0 ? content.indexOf('<!-- /PIN -->', start) : -1;
      const block = start >= 0 && end > start ? content.slice(start, end) : '';
      assert(block.length > 0, `T19: ${file} carries the bounded Codex profile preflight gate`);
      allPreflightBlocks.push(block);
      for (const token of requiredTokens) {
        const normalizedBlock = norm(block);
        const needle = norm(token);
        assert(normalizedBlock.includes(needle), `T19: ${file} preflight block carries ${JSON.stringify(token)}`);
        const mutated = normalizedBlock.replace(needle, '');
        assert(!mutated.includes(needle),
          `T19 mutation: deleting ${JSON.stringify(token)} reds ${file}`);
      }
      assert(content.indexOf(marker) < content.search(dispatchSignal),
        `T19: ${file} profile gate appears before its first named-role dispatch contract`);
      assert(!block.includes('for candidate_root in "$PWD/plugins"'),
        `T19: ${file} never executes a repository-local first-match preflight`);
      assert(!block.includes('find "$candidate_root"'),
        `T19: ${file} never uses nondeterministic find/head cache selection`);
    }
  }
  assert(allPreflightBlocks.every(block => block === allPreflightBlocks[0]),
    'T19: all dispatch-capable Codex skills carry one byte-identical profile preflight block');

  // Execute the exact fenced Bash block against a fake Codex registry. A malicious
  // lexically-first repository script and an older cache version must never run;
  // all metadata/preflight failures retain the typed refusal prefix.
  const bashMatch = allPreflightBlocks[0].match(/```bash\n([\s\S]*?)\n```/);
  assert(!!bashMatch, 'T19: canonical preflight block exposes one executable Bash fence');
  if (bashMatch) {
    const gateScript = bashMatch[1];
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-active-plugin-gate-'));
    const fakeHome = path.join(fixtureRoot, 'home');
    const fakeBin = path.join(fixtureRoot, 'bin');
    const project = path.join(fixtureRoot, 'project');
    const markerPath = path.join(fixtureRoot, 'selected.txt');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    const fakeCodex = path.join(fakeBin, 'codex');
    fs.writeFileSync(fakeCodex,
      '#!/bin/sh\n'
      + 'if [ "${KAOLA_PLUGIN_LIST_EXIT:-0}" -ne 0 ]; then printf "metadata-error\\n" >&2; exit "$KAOLA_PLUGIN_LIST_EXIT"; fi\n'
      + 'if [ "$1" = plugin ] && [ "$2" = list ] && [ "$3" = --json ]; then printf "%s\\n" "$KAOLA_PLUGIN_LIST_JSON"; exit 0; fi\n'
      + 'exit 9\n');
    fs.chmodSync(fakeCodex, 0o755);

    function writeProbe(file, label) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file,
        '#!/usr/bin/env node\n'
        + 'const fs=require("fs");\n'
        + `fs.writeFileSync(process.env.KAOLA_GATE_MARKER, ${JSON.stringify(label)});\n`
        + 'process.stdout.write(process.env.KAOLA_PREFLIGHT_OUTPUT || "{\\"status\\":\\"ok\\"}\\n");\n'
        + 'process.exit(Number(process.env.KAOLA_PREFLIGHT_EXIT || 0));\n');
      fs.chmodSync(file, 0o755);
    }

    function registryJson(name, version = '4.23.1', marketplace = 'kaola-marketplace') {
      return JSON.stringify({ installed: [{
        pluginId: `${name}@${marketplace}`,
        name,
        marketplaceName: marketplace,
        version,
        installed: true,
        enabled: true,
      }] });
    }

    function runGate(extraEnv = {}) {
      return spawnSync('bash', ['-c', gateScript], {
        cwd: project,
        env: {
          ...process.env,
          HOME: fakeHome,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
          KAOLA_GATE_MARKER: markerPath,
          ...extraEnv,
        },
        encoding: 'utf8',
      });
    }

    try {
      const malicious = path.join(project, 'plugins', 'aaa', 'scripts',
        'kaola-workflow-codex-preflight.js');
      writeProbe(malicious, 'malicious-project');
      for (const name of ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea']) {
        const cacheBase = path.join(fakeHome, '.codex', 'plugins', 'cache',
          'kaola-marketplace', name);
        writeProbe(path.join(cacheBase, '4.22.0', 'scripts',
          'kaola-workflow-codex-preflight.js'), `old-${name}`);
        writeProbe(path.join(cacheBase, '4.23.1', 'scripts',
          'kaola-workflow-codex-preflight.js'), `current-${name}`);
        fs.rmSync(markerPath, { force: true });
        const run = runGate({ KAOLA_PLUGIN_LIST_JSON: registryJson(name) });
        assert(run.status === 0,
          `T19 executable: exact active ${name} metadata passes: ${run.stderr}`);
        assert(fs.existsSync(markerPath)
          && fs.readFileSync(markerPath, 'utf8') === `current-${name}`,
          `T19 executable: ${name} selects current metadata version, never project/old cache`);
      }

      const cacheRoot = path.join(fakeHome, '.codex', 'plugins', 'cache');
      const relocatedCache = path.join(fixtureRoot, 'relocated-cache');
      fs.renameSync(cacheRoot, relocatedCache);
      fs.symlinkSync(relocatedCache, cacheRoot, 'dir');
      let refused = runGate({ KAOLA_PLUGIN_LIST_JSON: registryJson('kaola-workflow') });
      assert(refused.status !== 0 && /profile_preflight_refused:/.test(refused.stderr),
        'T19 executable: symlinked plugin cache ancestor is refused with typed prefix');
      fs.rmSync(cacheRoot, { force: true });
      fs.renameSync(relocatedCache, cacheRoot);

      for (const [label, metadata] of [
        ['dot marketplace', registryJson('kaola-workflow', '4.23.1', '.')],
        ['dot-dot marketplace', registryJson('kaola-workflow', '4.23.1', '..')],
        ['dot version', registryJson('kaola-workflow', '.')],
        ['dot-dot version', registryJson('kaola-workflow', '..')],
      ]) {
        refused = runGate({ KAOLA_PLUGIN_LIST_JSON: metadata });
        assert(refused.status !== 0 && /profile_preflight_refused:/.test(refused.stderr),
          `T19 executable: ${label} metadata is refused with typed prefix`);
      }

      refused = runGate({
        KAOLA_PLUGIN_LIST_JSON: registryJson('kaola-workflow'),
        KAOLA_PREFLIGHT_EXIT: '7',
        KAOLA_PREFLIGHT_OUTPUT: '{"status":"broken"}',
      });
      assert(refused.status !== 0 && /profile_preflight_refused:/.test(refused.stderr),
        'T19 executable: nonzero preflight keeps typed refusal prefix');
      refused = runGate({
        KAOLA_PLUGIN_LIST_JSON: registryJson('kaola-workflow'),
        KAOLA_PREFLIGHT_OUTPUT: 'not-json',
      });
      assert(refused.status !== 0 && /profile_preflight_refused: malformed preflight result:/.test(refused.stderr),
        'T19 executable: malformed preflight JSON keeps typed refusal prefix');
      refused = runGate({
        KAOLA_PLUGIN_LIST_JSON: registryJson('kaola-workflow'),
        KAOLA_PLUGIN_LIST_EXIT: '8',
      });
      assert(refused.status !== 0 && /profile_preflight_refused: plugin metadata unavailable:/.test(refused.stderr),
        'T19 executable: registry command failure keeps typed refusal prefix');
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
}

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

// Edition dirs reuse the existing edition tables (a rename / 7th edition flows
// through automatically). command surfaces live on the claude editions, skill
// surfaces on the codex editions.
const MANIFEST_EDITIONS = {
  command: claudeEditions.map(e => e.commandsDir),
  skill: codexEditions.map(e => e.skillsDir),
};

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
  // Managed across every dispatch-capable Codex skill by T19, not by one
  // routing topic in this manifest.
  '<!-- PIN: codex-profile-preflight -->',
  // The consent rule is carried by EVERY topic, so one marker legitimately appears on all three.
  // The reverse sentinel keys marker -> single block, which cannot express that; the FORWARD
  // presence obligation is what enforces it here, via one manifest block per topic. Deleting a
  // topic's consent paragraph still reds — on the block, not on the sentinel.
  '<!-- PIN: consent-in-conversation -->',
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
    for (const dir of (editions[stype] || [])) {
      files.push(stype === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`);
    }
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
  const markerToBlock = new Map();

  // FORWARD — every content token present on every surface the block obligates.
  for (const b of blocks) {
    const { error, files } = deriveObligated(b, editions, topicBasename);
    if (error || files.length === 0) {
      failures.push(`orphan-manifest: block ${b.block_id} (${error || 'empty derived set'})`);
      continue;
    }
    obligatedCount += files.length;
    const first = b.content_tokens[0];
    if (isMarker(first)) markerToBlock.set(norm(first), b);
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
      for (const dir of (editions[stype] || [])) {
        inScope.push(stype === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`);
      }
    }
  }
  for (const f of inScope) {
    const content = readSurface(f);
    if (content === null) continue;
    const markers = content.match(/<!--\s*(?:PIN|CARD):[^>]*-->/g) || [];
    for (const raw of markers) {
      const m = norm(raw);
      if (foreign.has(m)) continue;
      const b = markerToBlock.get(m);
      if (!b) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} has no manifest block`);
        continue;
      }
      const { files } = deriveObligated(b, editions, topicBasename);
      if (!files.includes(f)) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} not obligated by block ${b.block_id}`);
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
    readSurface: rel => (exists(rel) ? fs.readFileSync(path.join(REPO, rel), 'utf8') : null),
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
//     Blocks legitimately led by a plain content token (9 of the 30 today) are NOT marker-led and
//     need no distinctive sibling: their first token is itself the distinctive one.
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
    assert(!error && files.length === 6,
      `consent: the ${topic} consent block must obligate all 6 of its surfaces (both/both)`);
    const marker = norm(block.content_tokens[0]);
    assert(block.content_tokens.slice(1).length > 0
      && block.content_tokens.slice(1).every(t => !marker.includes(norm(t))),
      `consent: the ${topic} consent block needs >=1 token that is not a substring of its marker`);
  }
  assert(exists('docs/mission-list.md'),
    'the canonical mission-list format the next surfaces point at must exist');
  assert(exists('templates/axioms.md'),
    'the canonical First Principles source must exist');
}

// --- SUPERSET PROOF: every legacy in-scope T-pin token folds into a manifest
//     block (⊇ the legacy surface set) or is an accepted residual. Covers the
//     #624-fix gate flags + workflow_path:adaptive explicitly. --------------
{
  const dirs = MANIFEST_EDITIONS;
  const fnCmd = dirs.command.map(d => `${d}/kaola-workflow-finalize.md`);
  const fnSkill = dirs.skill.map(d => `${d}/kaola-workflow-finalize/SKILL.md`);
  const nxCmd = dirs.command.map(d => `${d}/workflow-next.md`);
  const nxSkill = dirs.skill.map(d => `${d}/kaola-workflow-next/SKILL.md`);
  const inCmd = dirs.command.map(d => `${d}/workflow-init.md`);
  const inSkill = dirs.skill.map(d => `${d}/kaola-workflow-init/SKILL.md`);
  const FN6 = [...fnCmd, ...fnSkill], NX6 = [...nxCmd, ...nxSkill], IN6 = [...inCmd, ...inSkill];

  const LEGACY_PAIRS = [
    // consent — every topic × 6 (both/both); the rule that replaced the durable valve
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: NX6 },
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: IN6 },
    { token: 'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.', surfaces: FN6 },
    // finalize × 6
    { token: '<!-- PIN: closure-audit -->', surfaces: FN6 },
    { token: '--issue-numbers', surfaces: FN6 },
    { token: 'issue_numbers', surfaces: FN6 },
    { token: 'final-validation.md', surfaces: FN6 },
    { token: 'chain-receipt.json', surfaces: FN6 },
    { token: '## Validation', surfaces: FN6 },
    { token: '## Changed Paths', surfaces: FN6 },
    { token: '`changed_paths`', surfaces: FN6 },
    { token: '<!-- PIN: sink-reports-orchestrator-owns -->', surfaces: FN6 },
    // next × 6
    { token: 'mission-list.md', surfaces: NX6 },
    { token: 'docs/mission-list.md', surfaces: NX6 },
    { token: 'dispatched: self', surfaces: NX6 },
    { token: 'Look for the work, not for the worker.', surfaces: NX6 },
    { token: '--target-issue', surfaces: NX6 },
    { token: '--target-issues', surfaces: NX6 },
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
  // 1-edition, 1-topic synthetic universe.
  const ED = { command: ['cmd'], skill: ['skl'] };
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
    editions: { command: ['x', 'y'], skill: ['sx'] },
    surfaces: {
      'x/foo.md': '<!-- PIN: a --> anchor-token',
      'sx/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
      // y/foo.md deliberately absent
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

  // (6) SUPERSET-PROOF — a legacy pin whose token no manifest block carries and
  //     which is not allow-listed must NOT fold → the superset proof reds.
  {
    const blocks = [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }];
    const folded = foldsGeneric('unfoldable-needle', ['cmd/foo.md'], blocks, new Set(), ED, TB);
    assert(folded === false,
      'RED-PROOF superset-proof: an unfolded, non-allow-listed legacy token must fail the superset proof');
  }

  // (7) CLOSURE-AUDIT VACUOUS-GUARD (#637) — the LIVE fn-closure-audit block
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
}

// ===========================================================================
// K -> 0 — THE `condition:` DELETION TRIGGER.
//
// During the migration every refusal carries its LEGACY token twice: in `reason`
// (compat mode) and mirrored into `condition`. `condition` is MIGRATION STAGING, not a
// compatibility promise — when `REFUSAL_EMISSION_MODE` flips to 'family', `reason`
// carries the family token and `condition` becomes vestigial. The refusal sweep prints
// `distinct_condition_values=K`; K must count DOWN to zero, and until now NOTHING made
// it. The standing warning that a unified table degenerates into "one more hand-kept
// compliance mirror" lands on `condition:`, not on the registry: a legacy token nobody
// reads is pure hand-kept weight, and the only mechanism that makes weight disappear is
// a build that stays red while it is still there.
//
// THE MEASUREMENT THAT MAKES THIS TRACTABLE: every consumer of a legacy token is OURS.
// The consumer corpora below are the six routing surfaces (the 30 generated command +
// SKILL files), the contract validators, our own `scripts/test-*` / `simulate-*` suites,
// and the documentation + role profiles. There is no third party anywhere in that list.
// So a token whose consumer set is EMPTY is not a promise being kept — it is a field to
// delete, and this block says so by name, file and line.
//
// SHAPE — A RATCHET, NOT A HARD GATE, and deliberately: the first measurement found 284
// of 737 emitted tokens with no consumer at all. A hard gate would have to be disarmed
// on day one, which is how a guard becomes decorative. So:
//
//   * enforcement is DEFAULT-ON and EXEMPT-BY-BASELINE, never an opt-in allowlist. A
//     token that is NOT in the baseline and has no consumer fails immediately. A newly
//     minted legacy token is therefore loud by default, which is the whole point: the
//     forgotten token must be the noisy case, not the silent one.
//   * the baseline can only go DOWN, and that is enforced in BOTH directions. An entry
//     whose token has since acquired a consumer, or is no longer emitted at all, fails
//     as STALE and demands its own deletion. Neither failure can be satisfied by adding
//     a row; the only maintenance path is deleting rows.
//
// VACUITY IS THE REAL RISK HERE, in both directions, so both are pinned below: a scan
// too permissive reports everything consumed (the guard becomes decorative forever —
// caught by the stale-baseline direction plus an explicit floor), and a scan gone blind
// reports everything unconsumed (caught by the corpus-size floors and the blind-corpus
// mutation). The mutation battery at the end plants an orphan (must RED, naming its
// file and line) and a consumed token (must stay green), because a checker that cannot
// fail is not a checker.
// ===========================================================================
{
  const CONDITION_BASELINE_PATH = 'scripts/condition-consumer-baseline.json';

  // The emission shapes are the refusal sweep's, restated rather than imported: the
  // sweep is a top-level assertion script, not a module, so requiring it would run its
  // whole suite as a side effect. One rule, one wording is preserved MECHANICALLY
  // instead — the restatement is pinned TEXTUALLY to the sweep's own block below, so a
  // shape edited there (or an anchor renamed) reds here instead of silently forking the
  // census into two disagreeing measurements of the same K.
  //
  // ---------------------------------------------------------------------------------
  // WHAT K IS, AND WHAT IT IS NOT. Read this before quoting a census number.
  //
  // K counts SOURCE LITERALS SHAPED LIKE A REFUSAL TOKEN. It does not count refusals, and
  // the two differ in BOTH directions. Measured against the plan validator, whose K is 112:
  //
  //   OVER-COUNT — a literal that is not a refusal. Shape 1 below matches the key/quoted-
  //   value pair ANYWHERE, including an internal helper's return discriminant. The named-
  //   certifier resolver returns its failure discriminant on that key, in the same
  //   vocabulary as its `'missing'` / `'ambiguous'` siblings — which K does NOT count, only
  //   because they carry no underscore. One caller discards the field; the other
  //   interpolates it as a WORD inside a free-prose `errors[]` sentence. Driven live, four
  //   fixtures for four, every one emits the plan-grammar reason and the counted literal
  //   appears solely inside `errors[]`. Those are diagnoses, not conditions: deleting one
  //   deletes a word from an error message and changes no routing.
  //
  //   DOUBLE-COUNT — one diagnosis, two counted literals. The same refusal's `errors[]`
  //   carries both the resolver's discriminant and the G4 caller's own prefixed spelling of
  //   the identical condition, so K scores 2 where a reader would count 1.
  //
  //   UNDER-COUNT — a refusal whose reason is not a literal. The resume wall emits a whole
  //   sentence on the reason key and carries its token on `reasonCode`; the verdict-block
  //   verifier returns sentences. A computed string matches no shape here, so a genuinely
  //   emitted reason can be invisible to K entirely.
  //
  // Scale, measured by recording stdout across a full `claude:full` sweep (2,819 emitted
  // envelopes): only 33 of the 112 were ever observed as a top-level `reason`/`reasonCode`,
  // and 13 observed `reason` values were prose rather than tokens.
  //
  // CONSEQUENCE: K is a sound RATCHET (it may only shrink) and a sound index of emission
  // SITES. It is not a population of refusals, so it cannot answer "how many refusals does
  // this script have" or "is this one demotable". Answer those by driving the code and
  // reading the emitted envelope — the rule that governs every other measurement here.
  //
  // AND NOTE WHY THIS BLOCK NAMES NO TOKENS: the consumer corpora below are substring scans
  // that include the suites and the docs, so writing a token into prose ANYWHERE in reach
  // registers as a consumer for it. Measured — quoting seven of them here and in
  // docs/architecture.md moved seven entries off the zero-consumer ratchet and reddened this
  // very suite. Describe the instrument by mechanism and function, never by token.
  // ---------------------------------------------------------------------------------
  const CONDITION_EMISSION_SHAPES = [
    /(?:reason|reasonCode|status|verdict|handoff_status|inner_reason|condition)\s*:\s*'([a-z][a-z0-9_:]{3,})'/g,
    /\b(?:refuse|bad|fail)\(\s*'([a-z][a-z0-9_:]{3,})'/g,
    /reasons\.push\(\s*'([a-z][a-z0-9_:]{3,})'/g,
    /throw new Error\(\s*'([a-z][a-z0-9_]{3,})'\s*\)/g,
    /throw new Error\(\s*'([a-z][a-z0-9_]{3,}):/g,
  ];

  // Mirror of the sweep's derived-constructor stage — see its comment for why the names are
  // derived rather than listed. Pinned to the sweep's source below on the same
  // two-measurements-may-not-disagree rule that governs the static shapes.
  const REFUSAL_CONSTRUCTOR_KEYS = 'reason|reasonCode|status|verdict|handoff_status|inner_reason|condition';

  function deriveRefusalConstructors(content) {
    const names = new Set();
    const keyRe = new RegExp('^(?:' + REFUSAL_CONSTRUCTOR_KEYS + ')$');
    const carries = (param, body) => {
      const shorthand = new RegExp('(?:^|[{,]\\s*)' + param + '\\s*(?:[,}]|$)', 'm').test(body);
      const explicit = new RegExp('(?:' + REFUSAL_CONSTRUCTOR_KEYS + ')\\s*:\\s*' + param + '\\s*(?:[,}]|$)', 'm').test(body);
      return (shorthand && keyRe.test(param)) || explicit;
    };
    const arrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(\s*([A-Za-z_$][\w$]*)[^)]*\)|([A-Za-z_$][\w$]*))\s*=>\s*\(?\{([\s\S]{0,400}?)\}\)?[;,\n]/g;
    let m;
    while ((m = arrow.exec(content)) !== null) {
      const param = m[2] || m[3];
      if (param && carries(param, m[4] || '')) names.add(m[1]);
    }
    const declared = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{([\s\S]{0,600}?)\n\}/g;
    while ((m = declared.exec(content)) !== null) {
      const body = m[3] || '';
      if (/return\s*\{/.test(body) && carries(m[2], body)) names.add(m[1]);
    }
    // The three hard-coded names already have their own shape; re-deriving them would double-scan.
    for (const already of ['refuse', 'bad', 'fail']) names.delete(already);
    return names;
  }

  function refusalConstructorShape(names) {
    if (!names.size) return null;
    const alternation = [...names].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp('\\b(?:' + alternation + ')\\(\\s*\'([a-z][a-z0-9_:]{3,})\'', 'g');
  }

  // Extract the sweep's own EMISSION_SHAPES literals as `source+flags` strings.
  // The joiner is NUL and not a readable character because a regex SOURCE may itself
  // contain spaces, slashes and punctuation (shape 4 does), and a separator the payload
  // can contain makes the comparison ambiguous in exactly the direction that hides drift.
  // Returns null on ANY shape it does not recognize — a gutted array, a renamed anchor,
  // a non-literal entry — so the comparison below fails closed rather than comparing
  // against nothing.
  function extractSweepShapes(src) {
    if (typeof src !== 'string') return null;
    const m = src.match(/\nconst EMISSION_SHAPES = \[\n([\s\S]*?)\n\];\n/);
    if (!m) return null;
    const out = [];
    for (const line of m[1].split('\n')) {
      const lm = line.match(/^\s*\/(.*)\/([gimsuy]*),\s*$/);
      if (!lm) return null;
      out.push(lm[1] + '\u0000' + lm[2]);
    }
    return out.length ? out : null;
  }

  const sweepShapes = extractSweepShapes(fs.readFileSync(
    path.join(REPO, 'scripts/test-refusal-route-sweep.js'), 'utf8'));
  const mineShapes = CONDITION_EMISSION_SHAPES.map(r => r.source + '\u0000' + r.flags);
  assert(sweepShapes !== null,
    'K0 shapes: the refusal sweep\'s `const EMISSION_SHAPES = [...]` block must still be locatable — '
    + 'if it was renamed or reshaped, re-point this extractor rather than letting the two censuses fork');
  assert(sweepShapes !== null && JSON.stringify(sweepShapes) === JSON.stringify(mineShapes),
    'K0 shapes: this block\'s emission shapes must be TEXTUALLY identical to the refusal sweep\'s — '
    + 'two measurements of the same K may not disagree. sweep=' + JSON.stringify(sweepShapes)
    + ' here=' + JSON.stringify(mineShapes));

  // The derived-constructor stage is the SECOND source of census truth, so it needs the same
  // anti-fork pin as the static shapes: a constructor rule tightened in one file and not the other
  // forks K exactly as a regex would. Compared whitespace-NORMALIZED because the two copies sit at
  // different nesting depths; the pin is over the logic, not the indentation.
  function normalizeFnSource(src) {
    if (typeof src !== 'string') return null;
    const lines = src.split('\n').map(l => l.trim()).filter(l => l.length && !l.startsWith('//'));
    return lines.length ? lines.join('\n') : null;
  }
  function extractSweepFn(src, name) {
    if (typeof src !== 'string') return null;
    const m = src.match(new RegExp('\\nfunction ' + name + '\\([\\s\\S]*?\\n\\}\\n'));
    return m ? normalizeFnSource(m[0]) : null;
  }
  const sweepSrc = fs.readFileSync(path.join(REPO, 'scripts/test-refusal-route-sweep.js'), 'utf8');
  for (const [name, local] of [
    ['deriveRefusalConstructors', deriveRefusalConstructors],
    ['refusalConstructorShape', refusalConstructorShape],
  ]) {
    const theirs = extractSweepFn(sweepSrc, name);
    assert(theirs !== null,
      'K0 constructors: the refusal sweep\'s `function ' + name + '` must still be locatable — '
      + 'if it was renamed or inlined, re-point this extractor rather than letting the two censuses fork');
    assert(theirs === normalizeFnSource(local.toString()),
      'K0 constructors: `' + name + '` must be logically identical to the refusal sweep\'s copy — '
      + 'two measurements of the same K may not disagree');
  }

  // ---- the emitted universe: token -> the emission sites that mint it ------
  // PURE: `readFile` is injected so the mutation battery drives the identical scanner
  // over in-memory fixtures and never touches the real tree.
  function scanConditionEmissions(files, readFile) {
    const sites = new Map();
    for (const rel of files) {
      const content = readFile(rel);
      if (typeof content !== 'string') continue;
      const lines = content.split('\n');
      const shapes = CONDITION_EMISSION_SHAPES.slice();
      const derived = refusalConstructorShape(deriveRefusalConstructors(content));
      if (derived) shapes.push(derived);
      for (const re of shapes) {
        for (let i = 0; i < lines.length; i++) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(lines[i])) !== null) {
            if (m[1].indexOf('_') < 0) continue;
            if (!sites.has(m[1])) sites.set(m[1], []);
            const list = sites.get(m[1]);
            if (!list.some(s => s.file === rel && s.line === i + 1)) list.push({ file: rel, line: i + 1 });
          }
        }
      }
    }
    for (const list of sites.values()) {
      list.sort((a, b) => (a.file === b.file ? a.line - b.line : (a.file < b.file ? -1 : 1)));
    }
    return sites;
  }

  // ---- consumer corpora, all DERIVED (a 7th edition / a renamed validator flows
  //      through for free; a hand-typed list is how a corpus quietly goes blind) -----
  function walkRel(relDir, match, out = []) {
    const abs = path.join(REPO, relDir);
    if (!fs.existsSync(abs)) return out;
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = relDir + '/' + e.name;
      if (e.isDirectory()) walkRel(rel, match, out);
      else if (match(rel, e.name)) out.push(rel);
    }
    return out;
  }

  function buildCorpus(name, files) {
    const entries = files.map(rel => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
    // The joined blob is a fast negative filter only; the per-file loop is what names
    // the reader. Both read the SAME bytes, so the blob can never say "consumed" where
    // the loop would say otherwise.
    return { name, entries, joined: entries.map(e => e[1]).join('\n\u0000\n') };
  }

  const routingFiles = []
    .concat(...claudeEditions.map(ed => walkRel(ed.commandsDir, rel => rel.endsWith('.md'))))
    .concat(...codexEditions.map(ed => walkRel(ed.skillsDir, rel => rel.endsWith('/SKILL.md'))));
  const validatorFiles = walkRel('scripts', (rel, name) => /^validate-.*contracts.*\.js$/.test(name))
    .concat(walkRel('plugins', (rel, name) => /^validate-.*contracts.*\.js$/.test(name)));
  const suiteFiles = walkRel('scripts', (rel, name) => /^(?:test-|simulate-).*\.js$/.test(name)
    && rel.indexOf('/', 'scripts/'.length) < 0);
  const docFiles = walkRel('docs', rel => rel.endsWith('.md'))
    .concat(walkRel('agents', rel => rel.endsWith('.md')))
    .concat(walkRel('plugins', rel => /\/agents\/[^/]+\.(?:md|toml)$/.test(rel)));

  const CORPORA = [
    buildCorpus('routing-surface', routingFiles),
    buildCorpus('contract-validator', validatorFiles),
    buildCorpus('suite', suiteFiles),
    buildCorpus('doc-or-profile', docFiles),
  ];

  // CORPUS FLOORS — a corpus that quietly went blind (a renamed directory, a tightened
  // glob) would make every token look unconsumed. That direction is loud anyway (mass
  // orphan failures), but it must NAME ITSELF rather than be diagnosed from the noise.
  assert(routingFiles.length >= 6,
    'K0 corpus: the six routing surfaces must resolve to at least 6 files — got ' + routingFiles.length);
  assert(validatorFiles.length >= 4,
    'K0 corpus: the four contract validators must all resolve — got ' + validatorFiles.length);
  assert(suiteFiles.length >= 20,
    'K0 corpus: the scripts/test-* + simulate-* suite corpus must resolve — got ' + suiteFiles.length);
  assert(docFiles.length >= 5,
    'K0 corpus: the docs + role-profile corpus must resolve — got ' + docFiles.length);

  function firstReader(token, corpus) {
    if (!corpus.joined.includes(token)) return null;
    for (const [rel, content] of corpus.entries) if (content.includes(token)) return rel;
    return null;
  }

  // ---- the checker — PURE, everything injected -----------------------------
  // `emissions`: Map<token, [{file,line}]>. `corpora`: [{name, entries, joined}].
  // `baseline`: string[]. `productionReader(token, emittingFiles)`: file|null — used
  // ONLY to make the demand honest (a token whose sole reader is a sibling production
  // script needs that reader migrated first; it is still a failure, but "delete it" on
  // its own would be a wrong instruction).
  function checkConditionConsumers({ emissions, corpora, baseline, productionReader }) {
    const failures = [];
    const zero = [];
    const baselineSet = new Set(baseline);
    for (const [token, sites] of emissions) {
      const readers = [];
      for (const c of corpora) {
        const rel = firstReader(token, c);
        if (rel) readers.push(c.name + ' ' + rel);
      }
      if (readers.length) continue;
      zero.push(token);
      if (baselineSet.has(token)) continue;
      const where = sites.slice(0, 3).map(s => s.file + ':' + s.line).join(', ')
        + (sites.length > 3 ? ' (+' + (sites.length - 3) + ' more)' : '');
      const prod = typeof productionReader === 'function'
        ? productionReader(token, new Set(sites.map(s => s.file)))
        : null;
      failures.push('orphan-condition: `' + token + '` is emitted at ' + where
        + ' and read by NO routing surface, NO contract validator, NO suite and NO doc. '
        + (prod
          ? 'Its only reader is production code at ' + prod + ' — retire that reader with it, '
            + 'THEN delete this legacy token. '
          : 'DELETE the condition field at that site — carry the family + payload instead. ')
        + 'It is migration staging nobody outside production reads, and K cannot reach 0 while it stands.');
    }
    zero.sort();
    const zeroSet = new Set(zero);
    for (const token of baseline) {
      if (zeroSet.has(token)) continue;
      const why = emissions.has(token)
        ? 'now HAS a consumer'
        : 'is no longer emitted anywhere';
      failures.push('stale-baseline: `' + token + '` ' + why + ' — the ratchet moved DOWN. '
        + 'Delete this entry from ' + CONDITION_BASELINE_PATH + '; the baseline may only shrink, '
        + 'and an entry that outlives its condition is exactly the hand-kept mirror this guard exists to prevent.');
    }
    return { failures, zero };
  }

  // ---- REAL RUN -----------------------------------------------------------
  const CONDITION_CENSUS_FILES = fs.readdirSync(path.join(REPO, 'scripts'))
    .filter(f => /^kaola-workflow-.*\.js$/.test(f))
    .map(f => 'scripts/' + f)
    .sort();
  const emissions = scanConditionEmissions(CONDITION_CENSUS_FILES,
    rel => fs.readFileSync(path.join(REPO, rel), 'utf8'));
  assert(emissions.size > 100,
    'K0 census: the emitted-condition scan must be non-vacuous across all four emission shapes — got '
    + emissions.size);

  const productionSources = CONDITION_CENSUS_FILES.map(rel => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
  const productionReader = (token, emittingFiles) => {
    for (const [rel, content] of productionSources) {
      if (emittingFiles.has(rel)) continue;
      if (content.includes(token)) return rel;
    }
    return null;
  };

  const baselineRaw = JSON.parse(fs.readFileSync(path.join(REPO, CONDITION_BASELINE_PATH), 'utf8'));
  const baseline = baselineRaw.zero_consumer_conditions;
  assert(Array.isArray(baseline) && baseline.every(t => typeof t === 'string' && t.length > 0),
    'K0 baseline: ' + CONDITION_BASELINE_PATH + ' must carry a `zero_consumer_conditions` array of strings');
  assert(Array.isArray(baselineRaw._doc) && baselineRaw._doc.length > 0,
    'K0 baseline: the ledger must carry its own `_doc` — an exempt list with no stated reason is a hiding place');
  assert(new Set(baseline).size === baseline.length,
    'K0 baseline: no duplicate entries — a duplicate is a row that can be deleted without moving the ratchet');
  assert(baseline.slice().sort().join('\n') === baseline.join('\n'),
    'K0 baseline: entries must be sorted — an unsorted ledger merges dirty, and this campaign has already '
    + 'lost a whole suite to a clean merge of two appends');

  const k0 = checkConditionConsumers({ emissions, corpora: CORPORA, baseline, productionReader });
  for (const msg of k0.failures) assert(false, 'K0 ' + msg);
  assert(k0.failures.length === 0,
    'K0: every emitted legacy condition token is either read by a consumer or carried by the '
    + CONDITION_BASELINE_PATH + ' ratchet (' + k0.zero.length + ' zero-consumer tokens today)');

  // NON-VACUITY FLOOR. An independent prover measured 21 zero-consumer legacy codes over a
  // narrower universe than the census K used here; this scan measures many more (see the
  // report accompanying this change for the disagreement and why it is a superset, not a
  // contradiction). The floor pins the DIRECTION: if this ever drops below the prover's
  // number, the consumer scan has gone permissive — matching prose it should not match —
  // and the trigger has quietly become decorative. A consumed-side floor guards the mirror
  // image: a scan that matches NOTHING would report every token orphaned.
  assert(k0.zero.length >= 21,
    'K0 non-vacuity: the zero-consumer set fell to ' + k0.zero.length + ', below the 21 an independent '
    + 'prover measured. Either the migration genuinely finished (delete this floor with the baseline) '
    + 'or the consumer scan went permissive and this guard is now decorative — check which.');
  assert(emissions.size - k0.zero.length >= 100,
    'K0 non-vacuity: only ' + (emissions.size - k0.zero.length) + ' tokens were found consumed — a scan '
    + 'that finds almost nothing has gone blind, and blind reports every token as deletable');

  // ---- MUTATION BATTERY — a green suite is not evidence a guard is armed ----
  {
    // The probes are ASSEMBLED AT RUNTIME on purpose. This file is itself in the `suite`
    // corpus, so a probe token written as one literal would be "consumed" by the very
    // checker testing it — the exact self-satisfying vacuity this battery exists to
    // disprove. The assertion right below proves the assembly worked.
    const ORPHAN = 'zzz' + '_k0_orphan_' + 'probe';
    const VANISHED = 'zzz' + '_k0_vanished_' + 'probe';
    const selfSource = fs.readFileSync(__filename, 'utf8');
    assert(selfSource.indexOf(ORPHAN) < 0 && selfSource.indexOf(VANISHED) < 0,
      'K0 mutation: the probe tokens must not appear as literals in this file — otherwise this suite is '
      + 'their own consumer and every mutation below passes vacuously');

    const site = [{ file: 'scripts/kaola-workflow-probe.js', line: 42 }];
    const orphanOnly = new Map([[ORPHAN, site]]);

    // (1) PLANTED ORPHAN over the REAL corpora — must RED, and must NAME file and line.
    const planted = checkConditionConsumers({ emissions: orphanOnly, corpora: CORPORA, baseline: [] });
    assert(planted.failures.length === 1
      && planted.failures[0].indexOf(ORPHAN) >= 0
      && planted.failures[0].indexOf('scripts/kaola-workflow-probe.js:42') >= 0
      && /DELETE the condition field/.test(planted.failures[0]),
      'K0 mutation: a condition literal with no consumer must RED against the REAL corpora, naming the token '
      + 'and the file:line that emits it — got ' + JSON.stringify(planted.failures));

    // (2) PLANTED CONSUMED — the mirror image, DERIVED (never a hardcoded token, which
    //     would be consumed by this file). A token the real corpora do read must stay
    //     green at a fabricated emission site: a checker that reds on everything proves
    //     exactly as little as one that reds on nothing.
    const consumedToken = [...emissions.keys()].find(t => !k0.zero.includes(t));
    assert(typeof consumedToken === 'string',
      'K0 mutation: at least one emitted token must be genuinely consumed, or the positive half is untestable');
    const consumedProbe = checkConditionConsumers({
      emissions: new Map([[consumedToken, site]]), corpora: CORPORA, baseline: [] });
    assert(consumedProbe.failures.length === 0 && consumedProbe.zero.length === 0,
      'K0 mutation: a condition literal WITH a real consumer must stay green — got '
      + JSON.stringify(consumedProbe.failures));

    // (3) EXEMPT-BY-BASELINE — the same orphan, baselined, is silent (and still counted).
    const exempted = checkConditionConsumers({ emissions: orphanOnly, corpora: CORPORA, baseline: [ORPHAN] });
    assert(exempted.failures.length === 0 && exempted.zero.length === 1,
      'K0 mutation: a baselined orphan must be exempt from the failure and still counted in K');

    // (4) STALE BASELINE, direction A — a baselined token that GAINED a consumer must RED
    //     and demand its own row be deleted. Without this the ratchet is one-way and the
    //     ledger outlives the work, which is precisely the hand-kept mirror failure mode.
    const gained = checkConditionConsumers({
      emissions: new Map([[consumedToken, site]]), corpora: CORPORA, baseline: [consumedToken] });
    assert(gained.failures.length === 1 && /stale-baseline/.test(gained.failures[0])
      && /now HAS a consumer/.test(gained.failures[0]),
      'K0 mutation: a baselined token that acquired a consumer must RED as stale — got '
      + JSON.stringify(gained.failures));

    // (5) STALE BASELINE, direction B — a baselined token no longer emitted at all.
    const vanished = checkConditionConsumers({
      emissions: orphanOnly, corpora: CORPORA, baseline: [ORPHAN, VANISHED] });
    assert(vanished.failures.length === 1 && /stale-baseline/.test(vanished.failures[0])
      && /no longer emitted anywhere/.test(vanished.failures[0]),
      'K0 mutation: a baselined token that is no longer emitted must RED as stale — got '
      + JSON.stringify(vanished.failures));

    // (6) PERMISSIVE-SCAN VACUITY — the failure mode where the guard survives but stops
    //     biting. A corpus that matches the orphan makes it look consumed; because the
    //     baseline still carries it, the stale direction fires. The two directions
    //     together are what make "everything looks consumed" impossible to reach quietly.
    const permissive = checkConditionConsumers({
      emissions: orphanOnly,
      corpora: [{ name: 'permissive', entries: [['fake', ORPHAN]], joined: ORPHAN }],
      baseline: [ORPHAN] });
    assert(permissive.failures.length === 1 && /stale-baseline/.test(permissive.failures[0]),
      'K0 mutation: a scan gone permissive must RED through the stale direction rather than go quiet');

    // (7) BLIND-CORPUS — zero corpora reports everything orphaned. Loud, not silent.
    const blind = checkConditionConsumers({ emissions: orphanOnly, corpora: [], baseline: [] });
    assert(blind.failures.length === 1 && /orphan-condition/.test(blind.failures[0]),
      'K0 mutation: a blind consumer scan must RED loudly rather than pass');

    // (8) PRODUCTION-ONLY READER — the demand must change wording, not severity. A token
    //     whose sole reader is a sibling production script still fails, but "delete it"
    //     alone would be a wrong instruction.
    const prodOnly = checkConditionConsumers({
      emissions: orphanOnly, corpora: CORPORA, baseline: [],
      productionReader: () => 'scripts/kaola-workflow-claim.js' });
    assert(prodOnly.failures.length === 1
      && /Its only reader is production code at scripts\/kaola-workflow-claim\.js/.test(prodOnly.failures[0])
      && !/DELETE the condition field/.test(prodOnly.failures[0]),
      'K0 mutation: a production-only reader must still fail, with the migrate-then-delete instruction');

    // (9) THE SCANNER itself — both directions. An empty file set yields nothing; a
    //     synthetic emission is found at its exact line.
    assert(scanConditionEmissions([], () => '').size === 0,
      'K0 mutation: the emission scanner over an empty file set must be empty');
    const synthetic = ['// header', '', "  return { result: 'refuse', reason: '" + ORPHAN + "' };"].join('\n');
    const scanned = scanConditionEmissions(['scripts/kaola-workflow-synthetic.js'], () => synthetic);
    assert(scanned.has(ORPHAN) && scanned.get(ORPHAN)[0].line === 3
      && scanned.get(ORPHAN)[0].file === 'scripts/kaola-workflow-synthetic.js',
      'K0 mutation: the emission scanner must report the exact file and line that mints a token');
    assert(scanConditionEmissions(['x'], () => "reason: 'nounderscore'").size === 0,
      'K0 mutation: the scanner must keep the census filter (a token with no underscore is not a legacy code)');

    // (10) THE SHAPE EXTRACTOR — fails closed, never silently against nothing.
    assert(extractSweepShapes('const EMISSION_SHAPES = [\n];\n') === null,
      'K0 mutation: extractSweepShapes must return null on a gutted array rather than compare against nothing');
    assert(extractSweepShapes('# no such block') === null,
      'K0 mutation: extractSweepShapes must return null when the anchor is absent or renamed');
    assert(extractSweepShapes(null) === null,
      'K0 mutation: extractSweepShapes must be total on a non-string input');
    assert(JSON.stringify(extractSweepShapes('\nconst EMISSION_SHAPES = [\n  /a_b/g,\n];\n')) === JSON.stringify(['a_b\u0000g']),
      'K0 mutation: extractSweepShapes must read a well-formed block');
  }

  // ---- THE COUNTDOWN BANNER — K and its deletable remainder, on every run --
  const unbaselined = k0.zero.filter(t => baseline.indexOf(t) < 0).length;
  console.log('CONDITION CENSUS (K -> 0) — distinct_condition_values=' + emissions.size
    + '  consumed=' + (emissions.size - k0.zero.length)
    + '  zero_consumer=' + k0.zero.length
    + '  baselined=' + baseline.length
    + '  unbaselined=' + unbaselined);
  console.log('  the ratchet may only shrink; `condition:` is migration staging, and a token no routing '
    + 'surface, validator, suite or doc reads is a field to delete.');
  if (process.argv.indexOf('--condition-census') >= 0) {
    console.log(JSON.stringify({
      distinct_condition_values: emissions.size,
      zero_consumer_conditions: k0.zero,
      sites: k0.zero.reduce((acc, t) => {
        acc[t] = (emissions.get(t) || []).map(s => s.file + ':' + s.line);
        return acc;
      }, {}),
    }, null, 2));
  }
}

if (failed) {
  console.error(`\nRoute-reachability test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`Route-reachability test passed (${passed} assertions).`);
