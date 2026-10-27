#!/usr/bin/env node
'use strict';

// test-issue-1123-multi-sink.js — #1123 review round-1 B1/M1/M2 regression.
//
// B1: the multi finalize must route `sink: mr` to the request sink, never the destructive
// merge sink. The test runs the rendered sink block with a stubbed `node` for every
// forge x SINK_KIND and pins `fz-sink-pr-run` to the single-forge `fz-sink-pr-case` arm.
// M1: init's forge branch must be preceded by a resolver; Next's issue-detail block carries
// the same-shell instruction.
// M2: every multi resolver refusal prints the reason and stops the step.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MULTI = path.join(ROOT, 'templates', 'routing', 'multi');
const FINALIZE = fs.readFileSync(path.join(MULTI, 'kaola-workflow-finalize.md'), 'utf8');
const NEXT = fs.readFileSync(path.join(MULTI, 'workflow-next.md'), 'utf8');
const INIT = fs.readFileSync(path.join(MULTI, 'workflow-init.md'), 'utf8');

function sinkBlock(text) {
  const sinkCase = text.indexOf('case "$SINK_KIND" in');
  assert(sinkCase >= 0, 'multi finalize has no sink case');
  const guard = text.lastIndexOf('[ -n "$KW_FORGE" ]', sinkCase);
  const start = guard >= 0 ? guard : sinkCase;
  const end = text.indexOf('```', start);
  assert(end > start, 'multi finalize sink case has no closing fence');
  return text.slice(start, end).trimEnd();
}

const block = sinkBlock(FINALIZE);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-multi-sink-'));
const script = path.join(tmp, 'sink.sh');

function runSink(forge, kind, opts) {
  const withForge = !opts || opts.withForge !== false;
  fs.writeFileSync(script, [
    '#!/bin/bash',
    'node(){ printf "%s\\n" "$*"; }',
    block,
  ].join('\n'));
  const env = Object.assign({}, process.env, {
    KW_FORGE: forge,
    SINK_KIND: kind,
    SINK_BRANCH: 'b',
    SINK_ISSUE_FLAG: '',
    SINK_ISSUE_NUMBERS_FLAG: '',
    SINK_KEEP_OPEN_FLAG: '',
    SINK_KEEP_OPEN_PR: '',
    KAOLA_SCRIPTS: '/ks',
  });
  if (!withForge) delete env.KW_FORGE;
  // spawn-class: cli-contract
  const res = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    timeout: 30000,
    env,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}
const EXPECTED = {
  github: { pr: 'kaola-workflow-sink-pr.js', mr: 'kaola-workflow-sink-pr.js', merge: 'kaola-workflow-sink-merge.js' },
  gitlab: { pr: 'kaola-gitlab-workflow-sink-mr.js', mr: 'kaola-gitlab-workflow-sink-mr.js', merge: 'kaola-gitlab-workflow-sink-merge.js' },
  gitea: { pr: 'kaola-gitea-workflow-sink-pr.js', mr: 'kaola-gitea-workflow-sink-pr.js', merge: 'kaola-gitea-workflow-sink-merge.js' },
};

const routeCount = Object.keys(EXPECTED).length
  * Object.keys(EXPECTED[Object.keys(EXPECTED)[0]]).length;

try {
  assert(/case "\$SINK_KIND" in\s*\n\s*pr\|mr\)/.test(block), 'multi sink case must carry pr|mr');

  for (const forge of ['github', 'gitlab', 'gitea']) {
    for (const kind of ['pr', 'mr', 'merge']) {
      const out = runSink(forge, kind);
      assert.strictEqual(out.status, 0, forge + '/' + kind + ': ' + out.stderr);
      assert(out.stdout.includes(EXPECTED[forge][kind]),
        forge + '/' + kind + ' routed to the wrong sink: ' + out.stdout.trim());
      if (kind !== 'merge') {
        assert(!out.stdout.includes('sink-merge.js'),
          forge + '/' + kind + ' reached the destructive merge sink: ' + out.stdout.trim());
      }
    }
  }

  // A fresh shell has no KW_FORGE; the block must refuse rather than silently no-op.
  const noForge = runSink('github', 'pr', { withForge: false });
  assert.strictEqual(noForge.status, 1, 'sink block without KW_FORGE must exit 1');
  assert(noForge.stderr.includes('same shell as the resolver'), noForge.stderr);
  assert(!noForge.stdout.includes('sink-'), 'sink block ran a sink without KW_FORGE: ' + noForge.stdout);

  const nextGuard = NEXT.indexOf('[ -n "$KW_FORGE" ]');
  assert(nextGuard >= 0, 'multi next issue-detail block lacks the KW_FORGE guard');
  assert(NEXT.includes('run this block in the same shell as the resolver above'));
  const nextFile = path.join(tmp, 'next-issue-detail.sh');
  fs.writeFileSync(nextFile, NEXT.slice(nextGuard, NEXT.indexOf('```', nextGuard)));
  const nextEnv = Object.assign({}, process.env);
  delete nextEnv.KW_FORGE;
  // spawn-class: cli-contract
  const nextRun = spawnSync('/bin/bash', [nextFile], { encoding: 'utf8', env: nextEnv, timeout: 30000 });
  assert.strictEqual(nextRun.status, 1, 'next issue-detail without KW_FORGE must exit 1');
  assert(nextRun.stderr.includes('same shell as the resolver'), nextRun.stderr);

  // fz-sink-pr-run is derived from fz-sink-pr-case; pin that mechanically.
  const { SPLICES } = require(path.join(ROOT, 'templates', 'routing', 'slots.js'));
  for (const forge of ['github', 'gitlab', 'gitea']) {
    const caseValue = SPLICES['fz-sink-pr-case'][forge];
    const lines = caseValue.split('\n');
    assert(/^\s{2}(?:mr\|)?pr\)$/.test(lines[0]), forge + ': unexpected single-forge arm');
    const expectedRun = lines.slice(1).map(line => line.replace(/^ {4}/, '')).join('\n');
    assert.strictEqual(SPLICES['fz-sink-pr-run'][forge], expectedRun,
      forge + ': multi request run drifted from the single-forge arm');
  }

  // M1: init's forge branch is chosen by a resolver, and Next's issue-detail block says
  // it must run in the same shell (the agent must not pick the branch).
  const initResolver = INIT.indexOf('resolve --shell --installed');
  const initCase = INIT.indexOf('case "$KW_FORGE" in');
  assert(initResolver >= 0 && initCase > initResolver,
    'multi init has no resolver before its forge case');
  assert(NEXT.includes('same shell as the resolver above'),
    'multi next issue-detail block lacks the same-shell instruction');

  // M2: every refusal prints the reason and stops; no empty CLAIM_JS continues.
  for (const [label, text] of [['next', NEXT], ['init', INIT], ['finalize', FINALIZE]]) {
    const refusals = text.split('CLAIM_JS=""').length - 1;
    assert(refusals > 0, label + ': expected resolver refusal branches');
    const stops = text.split('return 1 2>/dev/null || exit 1').length - 1;
    assert.strictEqual(stops, refusals, label + ': every refusal must return/exit');
    assert(text.includes('forge resolution refused'), label + ': refusal must print');
    assert(text.includes('reason is on stderr above'), label + ': refusal must point at the resolver reason');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('OK: test-issue-1123-multi-sink.js — ' + routeCount + ' sink routes + B1/M1/M2 render pins');
