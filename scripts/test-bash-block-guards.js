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
// Test B (#361/#345): the Finalization four-gate barrier resolves the validator via kaola_script.
// Execute the resolver PORTION of the block (def + VALIDATOR=...) in a fixture and assert it resolves
// to an existing path — the consumer-repo brick #345 fixed would leave VALIDATOR empty / bare.
// ---------------------------------------------------------------------------
{
  const block = extractBashBlocks(read('commands/kaola-workflow-finalize.md'), '--barrier-check')[0];
  assert(!!block, 'B: Finalization four-gate barrier bash block is extractable');
  if (block) {
    // static: the block must use the resolver and carry NO bare validator path (the #345 contract).
    assert(block.includes('VALIDATOR="$(kaola_script kaola-workflow-plan-validator.js)"'),
      'B (#345): the gate block resolves the validator via kaola_script');
    assert(!block.includes('node scripts/kaola-workflow-plan-validator.js "$PLAN" --resume-check'),
      'B (#345): the gate block carries NO bare validator path');
    // dynamic: run the resolver portion (up to and including VALIDATOR=) in a kaola-workflow-named
    // fixture with ./scripts present, and confirm it resolves to a real file.
    const upto = block.indexOf('VALIDATOR="$(kaola_script kaola-workflow-plan-validator.js)"');
    const resolverPortion = block.slice(0, upto)
      + 'VALIDATOR="$(kaola_script kaola-workflow-plan-validator.js)"\nprintf %s "$VALIDATOR"\n';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bashblock-gate-'));
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'kaola-workflow' }));
    fs.writeFileSync(path.join(tmp, 'scripts', 'kaola-workflow-plan-validator.js'), '// stub');
    const sp = path.join(tmp, 'gate.sh');
    fs.writeFileSync(sp, resolverPortion);
    const res = spawnSync('bash', [sp], { cwd: tmp, encoding: 'utf8', env: { ...process.env, HOME: tmp } });
    assert(res.status === 0 && res.stdout === './scripts/kaola-workflow-plan-validator.js',
      'B (#345): the resolver portion executes and resolves VALIDATOR to ./scripts/... got "' + res.stdout + '" (exit ' + res.status + ')');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test C (#361/#345): cross-edition static guard — the forge Finalization four-gate blocks must also
// resolve via kaola_script and carry no bare validator path. (The forge command files are not under
// this canonical chain's dynamic harness; this static guard complements the #345 forge validator pins.)
// ---------------------------------------------------------------------------
for (const ed of [
  { file: 'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md', name: 'kaola-gitlab-workflow-plan-validator.js' },
  { file: 'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md', name: 'kaola-gitea-workflow-plan-validator.js' },
]) {
  const block = extractBashBlocks(read(ed.file), '--barrier-check')[0];
  assert(!!block, 'C: ' + ed.file + ' four-gate block is extractable');
  if (block) {
    assert(block.includes('VALIDATOR="$(kaola_script ' + ed.name + ')"'),
      'C (#345): ' + ed.file + ' resolves the validator via kaola_script');
    assert(!block.includes('node scripts/' + ed.name + ' "$PLAN" --resume-check'),
      'C (#345): ' + ed.file + ' carries NO bare validator path');
  }
}

// ---------------------------------------------------------------------------
// Test D (#423/#816): negative scenario — a project with NO workflow-plan.md. The ledger-regression
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
  assert(out && !out.refused && out.ledger_compare === 'skipped_no_plan',
    'D (#423): with no plan the ledger guard fails OPEN (skipped_no_plan), got ' + JSON.stringify(out));
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

if (failed > 0) {
  console.error('test-bash-block-guards: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-bash-block-guards: all ' + passed + ' assertions passed (#361 bash-block execution)');
