#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
const installProfilesScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const nextSkill = path.join(pluginRoot, 'skills', 'kaola-workflow-next', 'SKILL.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runClaim(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'claim command failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function runClaimRaw(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  return { parsed: JSON.parse(result.stdout), exitStatus: result.status, stderr: result.stderr };
}

function assertNoLegacyCoordDirs(root) {
  for (const name of ['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers']) {
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', '.' + name)), 'legacy coordination dir must not exist: .' + name);
  }
}

function runInstallProfiles(target) {
  const result = spawnSync(process.execPath, [installProfilesScript, target], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'install profiles failed: ' + result.stderr);
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-'));
  try {
    runInstallProfiles(fresh);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert(freshConfig.includes('[features]'), 'fresh install should include managed [features]');
    assert(freshConfig.includes('multi_agent = true'), 'fresh install should enable multi_agent');
    assert(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]',
      'goals = true',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      ''
    ].join('\n'));

    runInstallProfiles(existing);
    runInstallProfiles(existing);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert(countOccurrences(updated, /^\[features\]$/gm) === 1, 'existing config must contain exactly one [features] table');
    assert(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
  }
}

// v3.21.0 (critic-1): the default Codex edition ships the #238/#239 adaptive production code (its
// classifier / plan-validator / adaptive-schema are byte-identical to root, sync-enforced), but this
// self-test previously exercised NONE of it. These cases run the CODEX scripts and lock the same
// soundness the root suite does — the curated-root candidate-side normalization (#238) and the
// per-node tree-diff barrier (#239: over-attribution, --base rejection, idempotent base).
const codexValidator = path.join(pluginRoot, 'scripts', 'kaola-workflow-plan-validator.js');
const codexClassifier = path.join(pluginRoot, 'scripts', 'kaola-workflow-classifier.js');
function git(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8' }); }
function initGitRepo(tmp) {
  git(['init', '-b', 'main'], tmp); git(['config', 'user.email', 't@t.t'], tmp); git(['config', 'user.name', 't'], tmp);
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n'); git(['add', '-A'], tmp); git(['commit', '-m', 'init'], tmp);
  const remote = tmp + '-remote'; git(['init', '--bare', remote], path.dirname(tmp)); git(['remote', 'add', 'origin', remote], tmp); git(['push', '-u', 'origin', 'main'], tmp);
}
function runVal(args, cwd) { return spawnSync(process.execPath, [codexValidator, ...args], { cwd, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } }); }
function classifyOffline(tmp, issue) {
  const r = spawnSync(process.execPath, [codexClassifier, 'classify', '--issue', String(issue)], { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  assert(r.status === 0, 'codex classifier exit 0 expected, got ' + r.status + '\n' + r.stderr);
  return JSON.parse(r.stdout.trim());
}
function plantFolder(tmp, project, issue, phase3Body) {
  const dir = path.join(tmp, 'kaola-workflow', project); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), ['# State', '', '## Project', 'name: ' + project, 'status: active', '', '## Sink', 'branch: workflow/issue-' + issue, 'issue_number: ' + issue, 'sink: merge', ''].join('\n'));
  if (phase3Body != null) fs.writeFileSync(path.join(dir, 'phase3-plan.md'), phase3Body);
}
function plantRoadmap(tmp, issue, body) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issue + '.md'), ['issue: #' + issue, 'title: t', 'status: open', 'workflow_project: —', 'next_step: ready', body, ''].join('\n'));
}
const CODEX_PLAN = ['# Workflow Plan — issue #971', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
  '| ex | code-explorer | — | — | 1 | sequence |',
  '| a | tdd-guide | ex | aaa/x.js | 1 | fanout(impl) |',
  '| b | tdd-guide | ex | bbb/y.js | 1 | fanout(impl) |',
  '| rv | code-reviewer | a,b | — | 1 | sequence |',
  '| done | finalize | rv | — | 1 | sequence |', '',
  '## Node Ledger', '', '| id | status |', '|---|---|',
  '| ex | complete |', '| a | complete |', '| b | complete |', '| rv | complete |', '| done | complete |', ''].join('\n');

function testCodexAdaptiveCuratedAndBarrier() {
  // ---- #238 candidate-side curated normalization (punctuation must still route to yellow) ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-curated-'));
    try {
      plantFolder(tmp, 'curated-claimed', 330, null);
      const planPath = path.join(tmp, 'kaola-workflow', 'curated-claimed', 'workflow-plan.md');
      fs.writeFileSync(planPath, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | Dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
      assert(runVal([planPath, '--freeze'], tmp).status === 0, 'codex: freeze curated plan');
      for (const [num, body] of [[331, 'body: edits the Dockerfile. also src/server.js'], [332, 'body: tweak ./Dockerfile and src/server.js'], [333, 'body: edits the dockerfile. also src/server.js']]) {
        plantRoadmap(tmp, num, body);
        const r = classifyOffline(tmp, num);
        // 333 is lowercase "dockerfile." — case-insensitive curated match (v3.21.0).
        assert(r.verdict === 'yellow' && /curated root file "Dockerfile"/.test(r.reasoning), 'codex #238: punctuated/case-insensitive curated overlap must be yellow ("' + body + '"), got ' + JSON.stringify(r));
      }
      // claimed-PROSE side (no frozen plan): a curated overlap declared only in prose is still yellow.
      plantFolder(tmp, 'prose-claimed', 360, '# Phase 3\nWe will edit the Dockerfile.\n');
      plantRoadmap(tmp, 361, 'body: also edits the Dockerfile and src/app.js');
      assert(classifyOffline(tmp, 361).verdict === 'yellow', 'codex F9: claimed-prose curated overlap must be yellow');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // green control needs ISOLATION (no other claimed project naming Dockerfile), or it would overlap.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-curated-green-'));
    try {
      plantFolder(tmp, 'overblock-claimed', 350, null);
      plantRoadmap(tmp, 351, 'body: edits the Dockerfile only, nothing else');
      assert(classifyOffline(tmp, 351).verdict === 'green', 'codex F10: candidate-only curated vs phase<=2 claimed must stay green');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // ---- #239 per-node tree-diff barrier (over-attribution, --base reject, idempotent) ----
  const mkRepo = () => {
    const grepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-barrier-'));
    initGitRepo(grepo);
    const proj = path.join(grepo, 'kaola-workflow', 'issue-971'); fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md'); fs.writeFileSync(planPath, CODEX_PLAN);
    assert(runVal([planPath, '--freeze'], grepo).status === 0, 'codex: freeze barrier plan');
    git(['add', '-A'], grepo); git(['commit', '-m', 'plan'], grepo);
    return { grepo, planPath };
  };
  const cu = g => { fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(g + '-remote', { recursive: true, force: true }); };
  const w = (g, rel, c) => { const p = path.join(g, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  // over-attribution: stray untracked at base must NOT be attributed to the node
  { const { grepo, planPath } = mkRepo(); try {
      w(grepo, 'stray/leftover.js', 's\n');
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'aaa/x.js', 'x\n');
      const r = runVal([planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass', 'codex #239: stray untracked must NOT be over-attributed, got ' + r.stdout);
    } finally { cu(grepo); } }
  // overflow into sibling lane must refuse
  { const { grepo, planPath } = mkRepo(); try {
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'aaa/x.js', 'x\n'); w(grepo, 'bbb/y.js', 'y\n');
      const r = runVal([planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 1 && /bbb\/y\.js/.test(r.stdout), 'codex #239: overflow into sibling lane must refuse, got ' + r.stdout);
    } finally { cu(grepo); } }
  // --base rejected per-node + idempotent record-base
  { const { grepo, planPath } = mkRepo(); try {
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'bbb/y.js', 'y\n');
      const rb = runVal([planPath, '--barrier-check', '--node-id', 'a', '--base', 'HEAD', '--json'], grepo);
      assert(rb.status === 1 && /--base/.test(rb.stdout), 'codex #239: --base must be rejected per-node, got ' + rb.stdout);
      const rb2 = runVal([planPath, '--record-base', '--node-id', 'a', '--json'], grepo);
      assert(rb2.status === 0 && JSON.parse(rb2.stdout).reused === true, 'codex #239: re-record must reuse the baseline, got ' + rb2.stdout);
    } finally { cu(grepo); } }
  console.log('Codex adaptive #238/#239 coverage: PASSED');
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-active-folders-'));
  try {
    // No-evidence offline case must return target_unverified (post-#169 contract).
    const unverified = runClaimRaw(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(unverified.exitStatus === 1,
      'startup with no local evidence must exit 1, got ' + unverified.exitStatus);
    assert(unverified.parsed.verdict === 'target_unverified',
      'no-evidence startup must return target_unverified, got: ' + unverified.parsed.verdict);
    assert(unverified.parsed.claim === 'none',
      'no-evidence startup must report claim=none, got: ' + unverified.parsed.claim);
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-163')),
      'kaola-workflow/issue-163 must NOT be created when target is unverified');

    // Seed local roadmap evidence so the offline classifier can verify the target.
    const roadmapDir = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-163.md'),
      'issue: #163\ntitle: —\nstatus: open\nworkflow_project: issue-163\nnext_step: ready\n'
    );

    const acquired = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(acquired.claim === 'acquired', 'Codex startup should acquire explicit issue');
    assert(acquired.project === 'issue-163', 'Codex startup should derive project from issue');
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-163', 'workflow-state.md');
    const state = fs.readFileSync(stateFile, 'utf8');
    assert(state.includes('issue_number: 163'), 'state should record issue number');
    assert(state.includes('sink: pr'), 'state should record PR sink');
    assert(/^run_posture: (worktree|in-place)$/m.test(state), 'M4 (#277): Codex state must contain run_posture: worktree or in-place');
    assert(!state.includes('## ' + 'Lease'), 'state should not contain a retired ownership block');
    assertNoLegacyCoordDirs(tmp);

    const owned = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex'], tmp);
    assert(owned.claim === 'owned', 'Codex startup should reuse active folder');

    const status = runClaim(['status'], tmp);
    assert(status.count === 1, 'status should report one active folder');

    // M2 (#277): warn-first attestation — finalize must emit closure_receipt with
    // claim_planner_attested and finalize_contractor_attested; both 'missing' in offline test
    // (no dispatch-log), but closure_invariants.ok must still be true (warn-first contract).
    plantRoadmap(tmp, 163, '');
    const finalizeResult = runClaim(['finalize', '--project', 'issue-163'], tmp);
    assert(finalizeResult.status === 'closed', 'M2 (#277): Codex finalize must return status:closed');
    assert(
      finalizeResult.closure_receipt && 'claim_planner_attested' in finalizeResult.closure_receipt,
      'M2 (#277): Codex closure_receipt must have claim_planner_attested field'
    );
    assert(
      finalizeResult.closure_receipt && 'finalize_contractor_attested' in finalizeResult.closure_receipt,
      'M2 (#277): Codex closure_receipt must have finalize_contractor_attested field'
    );
    assert(
      finalizeResult.closure_receipt.claim_planner_attested === 'missing' ||
      finalizeResult.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): Codex claim_planner_attested must be missing or attested'
    );
    assert(
      finalizeResult.closure_receipt.finalize_contractor_attested === 'missing' ||
      finalizeResult.closure_receipt.finalize_contractor_attested === 'attested',
      'M2 (#277): Codex finalize_contractor_attested must be missing or attested'
    );
    assert(
      finalizeResult.closure_invariants && finalizeResult.closure_invariants.ok === true,
      'M2 (#277): Codex closure_invariants.ok must be true (warn-first: attestation miss is not a hard violation)'
    );

    const skill = fs.readFileSync(nextSkill, 'utf8');
    assert(skill.includes('active folders'), 'next skill should route via active folders');
    assert(!skill.includes(['verify', 'startup'].join('-')), 'next skill should not require startup verifier');
    assert(!skill.includes(['can', 'hand' + 'off'].join('-')), 'next skill should not describe old transfer flow');

    const validator = path.join(repoRoot, 'scripts', 'validate-kaola-workflow-contracts.js');
    assert(fs.existsSync(validator), 'Codex contract validator must exist');

    testInstallProfilesFeaturesTableHandling();
    testCodexAdaptiveCuratedAndBarrier();

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
