#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (err) {
    process.stderr.write('\n--- CHILD FAILURE: ' + script + ' ---\n');
    const out = tail30(err.stdout);
    if (out.trim()) process.stderr.write('stdout (last 30 lines):\n' + out + '\n');
    const errOut = tail30(err.stderr);
    if (errOut.trim()) process.stderr.write('stderr (last 30 lines):\n' + errOut + '\n');
    process.stderr.write('--- END CHILD OUTPUT ---\n');
    throw err;
  }
}

// M4 + M2 (#277): static source-text assertions — the gitea fork claim.js must contain the
// run_posture derivation (M4) and the dispatch-attestation function (M2).
// (#284): Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart including
// dispatch-log) are now wired via config/hooks.json + install-codex-agent-profiles.js.
const giteaClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js'), 'utf8');
if (!giteaClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement run_posture');
}
if (!giteaClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}

// #284: config/hooks.json must exist, parse, and register the SubagentStart dispatch-log hook.
const hooksConfigPath = path.join(root, 'plugins/kaola-workflow-gitea/config/hooks.json');
if (!fs.existsSync(hooksConfigPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must be valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       e.hooks && e.hooks.some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must have a kaola-workflow: entry whose command references ' +
    'kaola-workflow-subagent-dispatch-log.sh'
  );
}

// #400: adaptive-route scenario — the gitea-codex edition ships the adaptive SKILL pack and a Codex
// claim/startup/resume receipt routes to a SKILL that EXISTS (the pre-#400 dead zone was 0 adaptive
// coverage here). Walk the schema-emitted route -> installed SKILL -> the inherited #405/#392/#369/#380
// wiring tokens, exactly as a Codex runtime would resolve them.
{
  const skillsRoot = path.join(root, 'plugins/kaola-workflow-gitea/skills');
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js'));
  for (const skill of [schema.PLAN_RUN_SKILL, schema.ADAPT_SKILL]) {
    const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      throw new Error('#400: gitea-codex receipt routes to ' + skill + ' but ' + skillFile + ' is missing (the forge-codex dead zone)');
    }
  }
  const planRun = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-plan-run/SKILL.md'), 'utf8');
  if (!planRun.includes('kaola-gitea-workflow-adaptive-node.js')) {
    throw new Error('#400: gitea-codex plan-run SKILL must call the forge-renamed kaola-gitea-workflow-adaptive-node.js');
  }
  if (!planRun.includes('model_variant_missing') || !planRun.includes('<role>-max')) {
    throw new Error('#405: gitea-codex plan-run SKILL must inherit the <role>-max tier→profile dispatch prose');
  }
  if (!planRun.includes('evidence-binding')) {
    throw new Error('#392: gitea-codex plan-run SKILL must inherit the evidence-binding nonce prose');
  }
  const adapt = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-adapt/SKILL.md'), 'utf8');
  if (!adapt.includes('kaola-gitea-workflow-claim.js') || !adapt.includes('kaola-workflow-plan-run')) {
    throw new Error('#400: gitea-codex adapt SKILL must claim via the forge port and hand off to kaola-workflow-plan-run');
  }
  const next = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-next/SKILL.md'), 'utf8');
  if (!next.includes('workflow-plan.md exists -> kaola-workflow-plan-run') || !next.includes('auto-bundle')) {
    throw new Error('#380: gitea-codex next SKILL must carry the adaptive route + auto-bundle restructure');
  }
  const finalize = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-finalize/SKILL.md'), 'utf8');
  if (!finalize.includes('--issue-numbers') || !finalize.includes('issue_numbers')) {
    throw new Error('#369: gitea-codex finalize SKILL must wire the bundle member-set flag (--issue-numbers)');
  }
}

run('validate-kaola-workflow-gitea-contracts.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

console.log('Gitea Codex workflow walkthrough simulation passed');
