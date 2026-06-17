#!/usr/bin/env node
'use strict';

// #361: execute the fenced bash blocks embedded in command/agent prose — the exact class that
// shipped the #294 fail-open bug and #344/#345 (both would have failed instantly under execution).
// ~44 fenced bash blocks per edition are otherwise only substring-pinned by the contract validators.
// This harness EXTRACTS a named block and RUNS it in a prepared tmp fixture, asserting exit + side
// effects. It starts with the two highest-value blocks (contractor Step-8a artifact mirror; the
// Finalization four-gate resolver) and a cross-edition static guard; grow opportunistically.
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
// Test A (#361): contractor Step-8a artifact mirror — a RENAMED tracked file must be mirrored to the
// linked worktree by its NEW path. The pre-fix `f="${line:3}"` left the literal "old -> new" string
// for a rename entry, so `cp` silently skipped the renamed artifact (RED). The fix mirrors the new path.
// ---------------------------------------------------------------------------
{
  const block = extractBashBlocks(read('agents/contractor.md'), 'git status --porcelain | while')[0];
  assert(!!block, 'A: contractor Step-8a artifact-mirror bash block is extractable');
  if (block) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bashblock-stepa-'));
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.com']);
    git(repo, ['config', 'user.name', 'T']);
    // committed file we will rename
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'old-name.md'), 'renamed artifact body');
    // project state folder with a worktree_path pointing at a real linked worktree
    const proj = 'issue-700';
    fs.mkdirSync(path.join(repo, 'kaola-workflow', proj), { recursive: true });
    const wt = path.join(tmp, 'wt');
    fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-state.md'),
      'project: ' + proj + '\nworktree_path: ' + wt + '\n');
    // #423: the Step-8a ledger-compare guard requires the --source plan to exist and be readable.
    // Add a minimal workflow-plan.md with a ## Node Ledger section so the guard can parse it.
    // Using a pending row (not complete) ensures sourceComplete=0, destComplete=0 => fail-open/safe.
    fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-plan.md'),
      '# Workflow Plan\n\n## Node Ledger\n\n| id | status |\n|---|---|\n| n1 | pending |\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'init']);
    git(repo, ['branch', 'workflow/' + proj]);
    git(repo, ['worktree', 'add', wt, 'workflow/' + proj]);
    // STAGE a rename (porcelain → "R  docs/old-name.md -> docs/new-name.md")
    git(repo, ['mv', 'docs/old-name.md', 'docs/new-name.md']);

    // run the extracted block with {project} substituted, from the repo root
    const script = block.replace(/\{project\}/g, proj);
    const sp = path.join(tmp, 'stepa.sh');
    fs.writeFileSync(sp, script);
    const res = spawnSync('bash', [sp], { cwd: repo, encoding: 'utf8' });
    assert(res.status === 0, 'A: Step-8a block exits 0; stderr: ' + res.stderr);
    // GREEN: the renamed NEW path is mirrored into the worktree.
    assert(fs.existsSync(path.join(wt, 'docs', 'new-name.md')),
      'A (#361): the renamed file is mirrored to the worktree by its NEW path (docs/new-name.md)');
    // and NO literal "old -> new" path artifact was created.
    const litArrow = fs.readdirSync(path.join(wt, 'docs')).some(n => n.includes('->'));
    assert(!litArrow, 'A (#361): no literal "old -> new" path artifact created in the worktree');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
// Test D (#423): negative scenario — full/fast-path project (no workflow-plan.md, no ledger-compare
// script available). The Step-8a block must exit 0 and still mirror renames. When kaola_script
// cannot locate kaola-workflow-ledger-compare.js (LEDGER_COMPARE_JS is empty), the `[ -n ... ]`
// guard short-circuits and the block proceeds without a refusal.
// ---------------------------------------------------------------------------
{
  const block = extractBashBlocks(read('agents/contractor.md'), 'git status --porcelain | while')[0];
  assert(!!block, 'D: contractor Step-8a artifact-mirror bash block is extractable for no-plan scenario');
  if (block) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bashblock-stepa-noplan-'));
    const repo = path.join(tmp, 'repo');
    // Hermetic HOME: ensures kaola_script finds nothing in ~/.claude/kaola-workflow/
    const fakeHome = path.join(tmp, 'home');
    fs.mkdirSync(repo, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.com']);
    git(repo, ['config', 'user.name', 'T']);
    // committed file we will rename
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'old-name.md'), 'artifact body');
    // project state with worktree_path but NO workflow-plan.md (full/fast-path project)
    const proj = 'issue-800';
    fs.mkdirSync(path.join(repo, 'kaola-workflow', proj), { recursive: true });
    const wt = path.join(tmp, 'wt2');
    fs.writeFileSync(path.join(repo, 'kaola-workflow', proj, 'workflow-state.md'),
      'project: ' + proj + '\nworktree_path: ' + wt + '\n');
    // Deliberately NO workflow-plan.md — simulates full/fast-path
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'init']);
    git(repo, ['branch', 'workflow/' + proj]);
    git(repo, ['worktree', 'add', wt, 'workflow/' + proj]);
    // STAGE a rename
    git(repo, ['mv', 'docs/old-name.md', 'docs/new-name.md']);

    const script = block.replace(/\{project\}/g, proj);
    const sp = path.join(tmp, 'stepa-noplan.sh');
    fs.writeFileSync(sp, script);
    // Run with a hermetic HOME (no ~/.claude/...) and unset CLAUDE_PLUGIN_ROOT so kaola_script
    // cannot find ledger-compare.js → LEDGER_COMPARE_JS is empty → guard is skipped → exit 0.
    const env = Object.assign({}, process.env, { HOME: fakeHome, CLAUDE_PLUGIN_ROOT: '' });
    const res = spawnSync('bash', [sp], { cwd: repo, encoding: 'utf8', env });
    assert(res.status === 0,
      'D (#423): Step-8a exits 0 when no workflow-plan.md and no ledger-compare available; stderr: ' + res.stderr);
    // Renames must still be mirrored even without the ledger guard
    assert(fs.existsSync(path.join(wt, 'docs', 'new-name.md')),
      'D (#423): renamed file is mirrored to worktree by its NEW path even when no plan present');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test E (#505/#294): FOREIGN_ARCHIVE staging guard fail-closed. The guard in
// `commands/kaola-workflow-finalize.md ## Staging Guard` must exit 1 when a foreign
// project's archive band is staged. This tests the #294 class of fail-open bug on the
// EXACT bash prose that npm test never executes otherwise.
// ---------------------------------------------------------------------------
{
  const block = extractBashBlocks(read('commands/kaola-workflow-finalize.md'), 'FOREIGN_ARCHIVE')[0];
  assert(!!block, 'E: Staging Guard bash block (FOREIGN_ARCHIVE) is extractable from kaola-workflow-finalize.md');
  if (block) {
    // Substitute {project} with the project being finalized ('issue-200')
    const proj = 'issue-200';
    const script = block.replace(/\{project\}/g, proj);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bashblock-staginggrd-'));
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.com']);
    git(repo, ['config', 'user.name', 'T']);
    // Create a committed file so the repo has a HEAD
    fs.writeFileSync(path.join(repo, 'README.md'), 'repo');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'init']);
    // Stage a FOREIGN archive file (different project: 'issue-999') — this must trigger exit 1
    const foreignDir = path.join(repo, 'kaola-workflow', 'archive', 'issue-999');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'workflow-state.md'), 'project: issue-999\n');
    git(repo, ['add', path.join('kaola-workflow', 'archive', 'issue-999', 'workflow-state.md')]);
    const sp = path.join(tmp, 'staginggrd.sh');
    fs.writeFileSync(sp, script);
    const res = spawnSync('bash', [sp], { cwd: repo, encoding: 'utf8' });
    assert(res.status === 1,
      'E (#505/#294): Staging Guard exits 1 when a foreign archive band (issue-999) is staged for project ' + proj + '; got exit ' + res.status + '; stderr: ' + res.stderr);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error('test-bash-block-guards: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-bash-block-guards: all ' + passed + ' assertions passed (#361 bash-block execution)');
