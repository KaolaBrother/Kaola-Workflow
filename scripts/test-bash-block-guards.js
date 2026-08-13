#!/usr/bin/env node
'use strict';

// #361: execute the fenced bash blocks embedded in command/agent prose — the exact class that
// shipped the #294 fail-open bug and #344/#345 (both would have failed instantly under execution).
// ~44 fenced bash blocks per edition are otherwise only substring-pinned by the contract validators.
// This harness EXTRACTS a named block and RUNS it in a prepared tmp fixture, asserting exit + side
// effects. The Finalization four-gate resolver is the surviving executable-prose block, with a
// cross-edition static guard; grow opportunistically.
//
// The Step-8a artifact mirror and the single-project staging rule are NO LONGER prose — they moved
// into the finalize transaction. Their failure classes (a renamed path mirrored literally, a
// ledger guard that fails CLOSED on a first sync, a fail-open staging guard) are still covered
// here, exercised against the exported script primitives instead of a bash block.
//
// Hand-rolled assert + counter; repo style (no framework).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

// Extract the bodies of ```bash fenced blocks. If `marker` is given, return only blocks whose body
// contains it. Returns an array of block bodies (without the fences).
function extractBashBlocks(content, marker) {
  const blocks = [];
  const re = /```bash\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (!marker || m[1].includes(marker)) blocks.push(m[1]);
  }
  return blocks;
}

function git(cwd, args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); }

// ---------------------------------------------------------------------------
// Test A (#361/#816): artifact mirror — a RENAMED tracked file must be mirrored to the linked
// worktree by its NEW path. The pre-fix `f="${line:3}"` left the literal "old -> new" string for a
// rename entry, so the copy silently skipped the renamed artifact (RED). The mirror now lives in
// the finalize transaction and resolves the NEW path through parsePorcelainPaths.
// ---------------------------------------------------------------------------
{
  const { mirrorFinalizationArtifacts } = require('./kaola-workflow-claim.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-mirror-rename-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.com']);
  git(repo, ['config', 'user.name', 'T']);
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'old-name.md'), 'renamed artifact body');
  const proj = 'issue-700';
  fs.mkdirSync(path.join(repo, 'kaola-workflow', proj), { recursive: true });
  const wt = path.join(tmp, 'wt');
  fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-state.md'),
    'project: ' + proj + '\nworktree_path: ' + wt + '\n');
  fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-plan.md'),
    '# Workflow Plan\n\n## Node Ledger\n\n| id | status |\n|---|---|\n| n1 | pending |\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'init']);
  git(repo, ['branch', 'workflow/' + proj]);
  git(repo, ['worktree', 'add', wt, 'workflow/' + proj]);
  // STAGE a rename (porcelain → "R  docs/old-name.md -> docs/new-name.md")
  git(repo, ['mv', 'docs/old-name.md', 'docs/new-name.md']);

  // The transaction runs FROM the linked worktree and pulls main → worktree.
  const out = mirrorFinalizationArtifacts(wt, proj);
  assert(out && out.mirror === 'mirrored',
    'A (#816): the transaction mirrors main → linked worktree, got ' + JSON.stringify(out));
  assert(fs.existsSync(path.join(wt, 'docs', 'new-name.md')),
    'A (#361): the renamed file is mirrored to the worktree by its NEW path (docs/new-name.md)');
  const litArrow = fs.readdirSync(path.join(wt, 'docs')).some(n => n.includes('->'));
  assert(!litArrow, 'A (#361): no literal "old -> new" path artifact created in the worktree');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test D (#423/#816): negative scenario — a project with NO mission-list.md. The record-regression
// guard has nothing to protect, so the mirror must FAIL OPEN (proceed, still mirroring renames)
// rather than refuse. A guard that fails closed here bricks every first sync.
// ---------------------------------------------------------------------------
{
  const { mirrorFinalizationArtifacts } = require('./kaola-workflow-claim.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-mirror-noplan-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.com']);
  git(repo, ['config', 'user.name', 'T']);
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'old-name.md'), 'artifact body');
  const proj = 'issue-800';
  fs.mkdirSync(path.join(repo, 'kaola-workflow', proj), { recursive: true });
  const wt = path.join(tmp, 'wt2');
  fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-state.md'),
    'project: ' + proj + '\nworktree_path: ' + wt + '\n');
  // Deliberately NO workflow-plan.md.
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'init']);
  git(repo, ['branch', 'workflow/' + proj]);
  git(repo, ['worktree', 'add', wt, 'workflow/' + proj]);
  git(repo, ['mv', 'docs/old-name.md', 'docs/new-name.md']);

  const out = mirrorFinalizationArtifacts(wt, proj);
  assert(out && !out.refused && out.ledger_compare === 'skipped_no_record',
    'D (#423): with no run record the mirror guard fails OPEN (skipped_no_record), got ' + JSON.stringify(out));
  assert(fs.existsSync(path.join(wt, 'docs', 'new-name.md')),
    'D (#423): renamed file is mirrored to worktree by its NEW path even when no plan present');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test E (#505/#294/#816): the single-project staging rule fails CLOSED. It moved from finalize
// prose into the transaction; a foreign project's archive band in the index must produce the typed
// `staging_guard_foreign_archive` refusal. This is the #294 fail-open class on its new home.
// ---------------------------------------------------------------------------
{
  const { checkFinalizeStagingGuard } = require('./kaola-workflow-claim.js');
  const proj = 'issue-200';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-staging-guard-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.com']);
  git(repo, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'repo');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'init']);
  // Stage a FOREIGN archive band (different project: 'issue-999').
  const foreignDir = path.join(repo, 'kaola-workflow', 'archive', 'issue-999');
  fs.mkdirSync(foreignDir, { recursive: true });
  fs.writeFileSync(path.join(foreignDir, 'workflow-state.md'), 'project: issue-999\n');
  git(repo, ['add', path.join('kaola-workflow', 'archive', 'issue-999', 'workflow-state.md')]);
  const bad = checkFinalizeStagingGuard(repo, proj);
  assert(bad && bad.ok === false && bad.reason === 'staging_guard_foreign_archive',
    'E (#505/#294): a foreign archive band (issue-999) staged for ' + proj +
    ' must refuse staging_guard_foreign_archive, got ' + JSON.stringify(bad));
  // Control: this project's OWN suffixed archive band is not foreign.
  git(repo, ['rm', '-r', '--cached', '-q', '--', path.join('kaola-workflow', 'archive', 'issue-999')]);
  fs.rmSync(foreignDir, { recursive: true, force: true });
  const ownDir = path.join(repo, 'kaola-workflow', 'archive', proj + '.archived-2026-01-01T00-00-00-000Z');
  fs.mkdirSync(ownDir, { recursive: true });
  fs.writeFileSync(path.join(ownDir, 'workflow-state.md'), 'project: ' + proj + '\n');
  git(repo, ['add', '--', 'kaola-workflow/archive']);
  const good = checkFinalizeStagingGuard(repo, proj);
  assert(good && good.ok === true,
    'E (#816): the project\'s own suffixed archive band must NOT trip the guard, got ' + JSON.stringify(good));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test F (#971): Step 9's sink-metadata capture resolves workflow-state.md against the tree the
// run folder LIVES in, not against cwd.
//
// `SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"` is cwd-relative and Step 9 carries
// no `cd`. On a worktree run the operator stands in the linked worktree while the run folder is
// resident in the MAIN checkout, so every grep in the block reads a path that does not exist and
// SINK_BRANCH comes back EMPTY — and SINK_BRANCH is what Step 11 hands the sink. The block still
// exits 0, so nothing announces it.
//
// This runs the block instead of pattern-matching it, because the property is what the variables
// hold at the end, and it runs the block from all SIX rendered surfaces rather than the skeleton,
// because a guard reads what ships. Both cwds are exercised: the worktree (RED) and main (the
// control the worktree must match).
// ---------------------------------------------------------------------------
{
  const FINALIZE_SURFACES = [
    'commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
  ];
  const proj = 'issue-4242';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-step9-sink-'));
  const repo = path.join(tmp, 'main');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.com']);
  git(repo, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'repo\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'init']);
  git(repo, ['branch', 'workflow/' + proj]);
  const wt = path.join(tmp, 'wt');
  git(repo, ['worktree', 'add', wt, 'workflow/' + proj]);
  // The claim record lives in MAIN only, uncommitted — the topology at Step 9 on every worktree
  // run, since Step 9 precedes the transaction that mirrors anything.
  fs.mkdirSync(path.join(repo, 'kaola-workflow', proj), { recursive: true });
  fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-state.md'),
    'project: ' + proj + '\nbranch: workflow/' + proj + '\nissue_number: 4242\nissue_iid: 4242\n'
    + 'worktree_path: ' + wt + '\n\n## Sink\n\nsink: merge\nissue_numbers: 4242\n');
  const real = p => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };

  // Run the extracted block and read back what it bound. HOME is redirected at the fixture so the
  // block's script resolver cannot reach this machine's real installs.
  function runStep9(body, cwd) {
    const scriptPath = path.join(tmp, 'step9.sh');
    fs.writeFileSync(scriptPath, body + '\n'
      + 'printf "BRANCH=%s\\nISSUE=%s\\nNUMS=%s\\nWT=%s\\n"'
      + ' "$SINK_BRANCH" "$SINK_ISSUE" "$SINK_ISSUE_NUMBERS" "$ACTIVE_WORKTREE_PATH"\n');
    // spawn-class: cli-contract
    const r = spawnSync('bash', [scriptPath], {
      cwd, encoding: 'utf8', timeout: 30000,
      env: Object.assign({}, process.env, { HOME: tmp, CLAUDE_PLUGIN_ROOT: '' }),
    });
    const out = {};
    for (const line of (r.stdout || '').split('\n')) {
      const m = /^(BRANCH|ISSUE|NUMS|WT)=(.*)$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
    return { exitCode: r.status, out, stderr: r.stderr || '' };
  }

  for (const surface of FINALIZE_SURFACES) {
    const blocks = extractBashBlocks(read(surface), 'SINK_BRANCH=');
    assert(blocks.length === 1,
      'F (#971): ' + surface + ' carries exactly one Step 9 capture block to execute, got '
      + blocks.length + ' — a guard that finds no block passes everything');
    if (blocks.length !== 1) continue;
    const body = blocks[0].split('{project}').join(proj);

    const fromWt = runStep9(body, wt);
    assert(fromWt.out.BRANCH === 'workflow/' + proj,
      'F (#971): ' + surface + ' — run from the linked worktree, Step 9 must bind SINK_BRANCH from '
      + 'MAIN\'s workflow-state.md; the sink consumes it. Got SINK_BRANCH=[' + fromWt.out.BRANCH + ']');
    assert(fromWt.out.ISSUE === '4242',
      'F (#971): ' + surface + ' — SINK_ISSUE captured from the worktree, got [' + fromWt.out.ISSUE + ']');
    assert(fromWt.out.NUMS === '4242',
      'F (#971): ' + surface + ' — SINK_ISSUE_NUMBERS captured from the worktree, got [' + fromWt.out.NUMS + ']');
    assert(real(fromWt.out.WT || '') === real(wt),
      'F (#971): ' + surface + ' — ACTIVE_WORKTREE_PATH still resolves to the linked worktree Step 10 '
      + 'cd\'s into; a fix that cd\'s the operator\'s shell to main must not take it with it. Got ['
      + fromWt.out.WT + ']');

    // Control: from main the same block already works, and must keep working.
    const fromMain = runStep9(body, repo);
    assert(fromMain.out.BRANCH === 'workflow/' + proj,
      'F control: ' + surface + ' — run from main, SINK_BRANCH is unchanged, got ['
      + fromMain.out.BRANCH + ']');
    assert(real(fromMain.out.WT || '') === real(wt),
      'F control: ' + surface + ' — run from main, ACTIVE_WORKTREE_PATH resolves to the worktree via '
      + 'worktree_path, got [' + fromMain.out.WT + ']');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed > 0) {
  console.error('test-bash-block-guards: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-bash-block-guards: all ' + passed + ' assertions passed (#361 bash-block execution)');
