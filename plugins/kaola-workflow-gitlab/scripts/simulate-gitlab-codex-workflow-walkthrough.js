#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('simulate-gitlab-codex-workflow-walkthrough'); } catch (_) { /* advisory only */ }

const { execFileSync } = require('child_process');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
const fs = require('fs');
const NOTE_426 = "the refusal must NAME the missing state file (the epoch-authority preflight it used to route through is retired; the surviving archive reports the absent file directly)";
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// Hermetic HOME is set by test-gitlab-workflow-scripts.js (seeded with installed_paths:[]);
// child scripts inherit the HOME already set in that module's module-top sandbox.

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

// A run folder that is FINALIZE-READY and carries no plan. The frozen `## Nodes` / `## Node
// Ledger` / compliance plan this used to seed existed only to clear the `adaptive_plan_missing`
// refusal and the declared-write-set attribution sweep, both deleted. What finalize still
// measures is the validation record, bound to the tree by the kernel hash the door recomputes.
function seedAdaptiveFinalizeFixture(rootDir, project) {
  const dir = path.join(rootDir, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js'));
  let cand = '';
  try { cand = schema.computeCodeTreeHash(rootDir, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
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

// M4 (#277): static source-text assertion — the gitlab fork claim.js must contain the run_posture
// derivation.
// #284: Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart) are now wired
// via plugins/kaola-workflow-gitlab/config/hooks.json; M1 dispatch-log hook ships in this release.
const gitlabClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'), 'utf8');
if (!gitlabClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement run_posture');
}
// NARROWED (were the M2 #277 + n6 #653 presence guards). They required the port source to contain
// claim_planner_attested (the warn-first attestation field) and ## Attestation (the
// warning-persistence block). Both producers are retired with the planner-attestation chain, so
// requiring them now would be requiring the retirement not to have happened — and re-adding a
// field to satisfy a suite is the failure mode, not the fix. What survives is the direction a
// retirement can still regress in: neither token may REAPPEAR in the port source.
if (gitlabClaimSrc.includes('claim_planner_attested')) {
  throw new Error('gitlab-codex: kaola-gitlab-workflow-claim.js must NOT reintroduce the retired claim_planner_attested field');
}
if (gitlabClaimSrc.includes('## Attestation')) {
  throw new Error('gitlab-codex: kaola-gitlab-workflow-claim.js must NOT reintroduce the retired ## Attestation persistence block');
}
// n6 (#653 finding D3, gitlab-codex mirror): the selection-evidence probe is live and stays pinned.
if (!gitlabClaimSrc.includes('selection_evidence')) {
  throw new Error('#653: gitlab-codex: kaola-gitlab-workflow-claim.js must implement the selection_evidence probe');
}

// #284: static assertion — config/hooks.json must exist, parse, and register the SubagentStart
// dispatch-log hook (M1), proving the Codex lifecycle hook producer is wired in this edition.
const hooksJsonPath = path.join(root, 'plugins/kaola-workflow-gitlab/config/hooks.json');
if (!fs.existsSync(hooksJsonPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must parse as valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       (e.hooks || []).some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must contain a kaola-workflow: entry whose command references kaola-workflow-subagent-dispatch-log.sh'
  );
}

// #400: the route scenario — a gitlab-codex claim/startup/resume receipt must route to a SKILL that
// EXISTS (the pre-#400 dead zone was zero coverage here). The route set collapsed from five topics
// to three, so this walks the three that ship rather than the plan-run/adapt pair it was written
// for; the property is unchanged and is exactly the one the dead zone violated.
{
  const skillsRoot = path.join(root, 'plugins/kaola-workflow-gitlab/skills');
  // Every SKILL the edition ships must be resolvable, and the set must be non-empty — an empty
  // skills dir would satisfy a per-entry loop vacuously, which is the dead zone by another name.
  const shipped = fs.readdirSync(skillsRoot).filter(n => fs.existsSync(path.join(skillsRoot, n, 'SKILL.md')));
  for (const topic of ['kaola-workflow-next', 'kaola-workflow-finalize', 'kaola-workflow-init']) {
    if (!shipped.includes(topic)) {
      throw new Error('#400: gitlab-codex must ship the ' + topic + ' SKILL; got ' + JSON.stringify(shipped));
    }
  }
  // The next SKILL must still tell the reader that ONE run may carry several issues — the
  // multi-issue claim shape #380 restructured. This used to pin the literal `auto-bundle`; that
  // token left the prose when the surfaces regenerated while the shape it named did not, and an
  // assertion on a word is a vote against ever rewording it.
  const next = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-next/SKILL.md'), 'utf8');
  if (!/issues.{0,80}share one run|bundle/i.test(next)) {
    throw new Error('#380: gitlab-codex next SKILL must describe the multi-issue claim shape');
  }
  // The finalize SKILL wires the #369 bundle member-set flag.
  const finalize = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-finalize/SKILL.md'), 'utf8');
  if (!finalize.includes('--issue-numbers') || !finalize.includes('issue_numbers')) {
    throw new Error('#369: gitlab-codex finalize SKILL must wire the bundle member-set flag (--issue-numbers)');
  }
}
run('validate-kaola-workflow-gitlab-contracts.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

// bundle-426-427-428-430 regression tests ported to gitlab-codex edition.
const glClaimScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js');
// DELETED: the #426 archive-completeness probe and the #430 bundle-coherence pair.
//
// #430 drove `glAdaptiveNode orient`, the node-lifecycle CLI, over a frozen plan whose
// hash the plan validator computed — three retired mechanisms to reach one refusal.
// #426 (verifyArchiveComplete refuses before deleting) survives and is pinned for this forge
// by simulate-gitlab-workflow-walkthrough.js, which drives the same claim.js entry point.
console.log('GitLab Codex workflow walkthrough simulation passed');
