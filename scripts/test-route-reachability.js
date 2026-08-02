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

const CODEX_MODEL_ROUTING_MARKER = '<!-- PIN: codex-dispatch-model-routing -->';
function codexModelRoutingBlock(content) {
  const start = content.indexOf(CODEX_MODEL_ROUTING_MARKER);
  const end = start >= 0 ? content.indexOf('<!-- /PIN -->', start) : -1;
  return start >= 0 && end > start ? content.slice(start, end) : '';
}

function hasStandardTierDispatchException(content) {
  const normalized = norm(content);
  return /standard-tier\b.{0,180}\b(?:may|can)\b.{0,180}\b(?:use|dispatch|switch|select|escalat|downgrad)/i
    .test(normalized)
    || /standard-tier\b.{0,120}\b(?:exception|override|trigger)s?\b/i.test(normalized)
    || /per-task\b.{0,100}\b(?:model|reasoning(?:-| )effort)\b.{0,100}\bexceptions?\b.{0,50}\b(?:may|can|permit)\b/i
      .test(normalized)
    || /\b(?:temporary|recorded)\b.{0,100}\b(?:exception|override|trigger)\b/i.test(normalized)
    || /Sol\/?medium\b.{0,120}\bunavailable\b.{0,120}\b(?:use|select|substitute|fall back to)\b/i
      .test(normalized);
}

function hasProfileOwnedDispatchConflict(content) {
  const normalized = norm(content);
  return /pass\b.{0,100}\bconfigured model\b/i.test(normalized)
    || /ships its model in its installed profile/i.test(normalized)
    || /profile\b.{0,50}\bowns?\b.{0,50}\bmodel/i.test(normalized)
    || /inherit\w*\b.{0,50}\bmodel\b.{0,50}\bprofile/i.test(normalized)
    || /(?:model|reasoning effort)\b.{0,100}\b(?:inherited from|owned by|read from)\b.{0,50}\bprofile/i
      .test(normalized);
}

function codexDispatchCallSite(content, skillName) {
  if (skillName === 'kaola-workflow-next') {
    const match = content.match(/## Delegation\s*([\s\S]*?)(?:\n## |$)/);
    return match ? match[1] : '';
  }
  if (skillName === 'kaola-workflow-finalize') {
    const match = content.match(/Delegate to the `doc-updater` role([\s\S]*?)\nWrite the result/);
    return match ? match[1] : '';
  }
  return '';
}

function codexDispatchCallSiteValid(content, skillName) {
  const callSite = norm(codexDispatchCallSite(content, skillName));
  return callSite.includes('`model`')
    && callSite.includes('`reasoning_effort`')
    && /per-spawn model routing/i.test(callSite)
    && !hasProfileOwnedDispatchConflict(content)
    && !hasStandardTierDispatchException(content);
}

// This is deliberately a prose-contract validator, not a profile/config assertion: the routing
// decision is made for each spawn, after the role's existing standard/reasoning classification is
// known. The negative check prevents a plausible near-miss where a fixed standard pair quietly
// regains a per-task exception elsewhere on the same live dispatch surface.
function codexModelRoutingContractValid(content) {
  const block = codexModelRoutingBlock(content);
  if (!block) return false;
  const normalized = norm(block);
  return normalized.includes('Standard-tier roles dispatch with `model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`.')
    && normalized.includes('Reasoning-tier roles dispatch with `model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.')
    && normalized.includes('These mappings are fixed for every spawn.')
    && normalized.includes('Do not escalate, downgrade, or otherwise override a standard-tier role\'s model or reasoning effort based on task breadth, latency, prior results, risk, or any other condition.')
    && normalized.includes('The role classification remains unchanged.')
    && !normalized.includes('gpt-5.6-luna')
    && !hasStandardTierDispatchException(content);
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
  const allModelRoutingBlocks = [];

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

      const modelRoutingBlock = codexModelRoutingBlock(content);
      assert(codexModelRoutingContractValid(content),
        `T19 model routing: ${file} carries the bounded Codex per-spawn standard/reasoning contract`);
      if (modelRoutingBlock) {
        allModelRoutingBlocks.push(modelRoutingBlock);
        const mutations = [
          ['standard model', modelRoutingBlock.replace('gpt-5.6-sol', 'gpt-5.6-terra')],
          ['standard effort', modelRoutingBlock.replace('reasoning_effort: "medium"', 'reasoning_effort: "high"')],
          ['reasoning model', modelRoutingBlock.replace(
            'Reasoning-tier roles dispatch with\n`model: "gpt-5.6-sol"`',
            'Reasoning-tier roles dispatch with\n`model: "gpt-5.6-terra"`')],
          ['reasoning effort', modelRoutingBlock.replace('reasoning_effort: "xhigh"', 'reasoning_effort: "high"')],
          ['fixed mapping', modelRoutingBlock.replace('fixed for every spawn', 'selected for each spawn')],
          ['classification stability', modelRoutingBlock.replace('remains unchanged', 'may change')],
        ];
        for (const [label, mutatedBlock] of mutations) {
          assert(!codexModelRoutingContractValid(content.replace(modelRoutingBlock, mutatedBlock)),
            `T19 model-routing mutation: ${label} reds ${file}`);
        }
        const temporaryException = content.replace(modelRoutingBlock,
          `${modelRoutingBlock}\nA standard-tier task may use Sol/xhigh for complex work.`);
        assert(!codexModelRoutingContractValid(temporaryException)
          && !codexDispatchCallSiteValid(temporaryException, name),
          `T19 model-routing mutation: a standard-tier escalation reds ${file}`);
        const downgradeException = content.replace(modelRoutingBlock,
          `${modelRoutingBlock}\nA standard-tier task may use Sol/low for routine work.`);
        assert(!codexModelRoutingContractValid(downgradeException)
          && !codexDispatchCallSiteValid(downgradeException, name),
          `T19 model-routing mutation: a standard-tier downgrade reds ${file}`);
        const triggerList = content.replace(modelRoutingBlock,
          `${modelRoutingBlock}\nStandard-tier triggers:\n- low-risk tasks use Sol/low.`);
        assert(!codexModelRoutingContractValid(triggerList)
          && !codexDispatchCallSiteValid(triggerList, name),
          `T19 model-routing mutation: a standard-tier trigger list reds ${file}`);
        const perTaskException = content.replace(modelRoutingBlock,
          `${modelRoutingBlock}\nPer-task model exceptions may use Sol/high for quick work.`);
        assert(!codexModelRoutingContractValid(perTaskException)
          && !codexDispatchCallSiteValid(perTaskException, name),
          `T19 model-routing mutation: a generic per-task exception reds ${file}`);
        const availabilityException = `${content}\nIf Sol/medium is unavailable, use Terra/high instead.`;
        assert(!codexModelRoutingContractValid(availabilityException)
          && !codexDispatchCallSiteValid(availabilityException, name),
          `T19 complete-surface mutation: a standard-tier availability exception reds ${file}`);
      }

      const callSite = codexDispatchCallSite(content, name);
      assert(codexDispatchCallSiteValid(content, name),
        `T19 call site: ${file} requires both per-spawn model and reasoning effort without profile inheritance`);
      if (codexDispatchCallSiteValid(content, name)) {
        const withoutModel = content.replace(callSite, callSite.replace('`model`', '`selected value`'));
        const withoutEffort = content.replace(callSite,
          callSite.replace('`reasoning_effort`', '`selected effort`'));
        const laterConflict = `${content}\nPass the role's configured model on the spawn call.`;
        const inheritanceConflict = `${content}\nInherit the model from the role's installed profile.`;
        assert(!codexDispatchCallSiteValid(withoutModel, name),
          `T19 call-site mutation: omitting model reds ${file}`);
        assert(!codexDispatchCallSiteValid(withoutEffort, name),
          `T19 call-site mutation: omitting reasoning_effort reds ${file}`);
        assert(!codexDispatchCallSiteValid(laterConflict, name),
          `T19 call-site mutation: a later configured-model conflict reds ${file}`);
        assert(!codexDispatchCallSiteValid(inheritanceConflict, name),
          `T19 call-site mutation: a later profile-inheritance conflict reds ${file}`);
      }
    }
  }
  assert(allPreflightBlocks.every(block => block === allPreflightBlocks[0]),
    'T19: all dispatch-capable Codex skills carry one byte-identical profile preflight block');
  assert(allModelRoutingBlocks.length === codexEditions.length * expectedDispatchSkills.length
    && allModelRoutingBlocks.every(block => block === allModelRoutingBlocks[0]),
    'T19 model routing: all six Codex next/finalize skills carry one byte-identical routing contract');

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
// surfaces to eight and this suite stays green at an unchanged assertion count —
// mutation-proved. That case is caught by test-generate-routing-surfaces.js's
// "registry derives 18 surfaces" assertion, in the always-selected claude chain,
// which is why the forge term is left registry-derived rather than re-anchored.
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
    }
  }
  return map;
})();

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
  '<!-- PIN: codex-dispatch-model-routing -->',
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
    // Tracked surfaces come off disk; the six generated trees come from the
    // in-memory render. A generated path that the render did not produce falls
    // through to the disk read and then to `null`, which reds as absent-surface —
    // absent-but-expected is loud, never skipped.
    readSurface: rel => (GENERATED_SURFACE_CONTENT.has(rel)
      ? GENERATED_SURFACE_CONTENT.get(rel)
      : (exists(rel) ? fs.readFileSync(path.join(REPO, rel), 'utf8') : null)),
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
    { token: 'dispatched: self', surfaces: NX_ALL },
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

if (failed) {
  console.error(`\nRoute-reachability test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`Route-reachability test passed (${passed} assertions).`);
