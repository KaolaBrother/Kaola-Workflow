#!/usr/bin/env node
'use strict';
// #1114: a second in-place finalize of a project whose plain archive already exists
// renames the live folder to archive/<project>.archived-<ts>/ and used to leave no
// receipt. Both folders then carry workflow-state.md, resolveFinalizeAuthority
// returns archive_authority_ambiguous, and resolveSinkReceiptPath throws. The
// collision dest must carry the self-anchor currentArchiveDir already understands
// (project, claim_ts, archive_dest). A plain archive, a live directory, and the
// #1067 linked double-seen case stay as they were. Two anchors, or none, still refuse.
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('./test-git-fixture');

const editions = {
  canonical: path.join(__dirname, 'kaola-workflow-'),
  codex: path.join(__dirname, '../plugins/kaola-workflow/scripts/kaola-workflow-'),
  gitlab: path.join(__dirname, '../plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-'),
  gitea: path.join(__dirname, '../plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-'),
};

function write(base, rel, text) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function state(project, ts, status, branch) {
  return 'name: ' + project + '\n'
    + 'claim_ts: ' + ts + '\n'
    + 'status: ' + status + '\n'
    + 'issue_number: 900260\n'
    + 'branch: ' + branch + '\n';
}
function waitNextMillis() {
  const start = Date.now();
  while (Date.now() === start) {}
}
function readReceipt(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.cache', 'sink-receipt.json'), 'utf8'));
}
function relDest(root, dir) {
  return path.relative(root, dir).split(path.sep).join('/');
}

function runEdition(edition) {
  const prefix = editions[edition];
  const { archiveProjectDir, resolveFinalizeAuthority } = require(prefix + 'claim.js');
  const { resolveSinkReceiptPath } = require(prefix + 'sink-merge.js');
  let failures = 0;
  let checks = 0;
  function check(ok, msg) {
    checks++;
    if (!ok) { failures++; console.error('FAIL: ' + msg); }
  }
  function section(label, fn) {
    try { fn(); }
    catch (error) { check(false, label + ' threw: ' + (error && error.message)); }
  }

  section('repeat finalize', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const oldTs = '2026-10-04T01:00:00.000Z';
    const newTs = '2026-10-05T02:00:00.000Z';
    const thirdTs = '2026-10-05T03:00:00.000Z';
    try {
      G.init(tmp, { branch: 'main' });
      const plain = path.join(tmp, 'kaola-workflow', 'archive', project);
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, oldTs, 'closed', branch));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, newTs, 'active', branch));
      const archived = archiveProjectDir(tmp, project, 'closed');
      check(archived && archived.archived === true && archived.dest && path.basename(archived.dest).startsWith(project + '.archived-'),
        'repeat finalize must land a collision archive, got ' + JSON.stringify(archived && { archived: archived.archived, dest: archived.dest }));
      const dest = archived && archived.dest;
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.innerReason !== 'archive_authority_ambiguous' && authority.authorityDir === dest,
        'repeat finalize must resolve the new archive, got ' + JSON.stringify({ innerReason: authority.innerReason, authorityDir: authority.authorityDir, dest }));
      let receiptPath = null;
      let threw = null;
      try { receiptPath = resolveSinkReceiptPath(tmp, project, branch); }
      catch (error) { threw = error.message; }
      const expectedReceipt = dest && path.join(dest, '.cache', 'sink-receipt.json');
      check(receiptPath === expectedReceipt,
        'resolveSinkReceiptPath must return the new archive receipt, got ' + receiptPath + (threw ? ' threw ' + threw : ''));
      let unbound = null;
      try { unbound = resolveSinkReceiptPath(tmp, project); }
      catch (error) { unbound = error.message; }
      check(unbound === expectedReceipt, 'resolve without a branch still returns the anchored receipt, got ' + unbound);
      let wrongBranch = false;
      try { resolveSinkReceiptPath(tmp, project, 'workflow/issue-other'); }
      catch (error) { wrongBranch = /archive_authority_ambiguous/.test(error.message); }
      check(wrongBranch, 'a different branch must not be handed the anchored archive');
      let receipt = null;
      try { receipt = readReceipt(dest); } catch (error) { receipt = { error: error.message }; }
      check(receipt && receipt.project === project && receipt.claim_ts === newTs
        && receipt.archive_dest === relDest(tmp, dest) && receipt.branch === branch && !('steps' in receipt),
        'anchor shape must be project/claim_ts/archive_dest/branch and must not invent steps, got ' + JSON.stringify(receipt));
      check(fs.existsSync(path.join(plain, 'workflow-state.md')) && !fs.existsSync(path.join(plain, '.cache', 'sink-receipt.json')),
        'the pre-existing plain archive stays, and does not gain a receipt');

      waitNextMillis();
      const firstDest = dest;
      const firstReceipt = path.join(firstDest, '.cache', 'sink-receipt.json');
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, thirdTs, 'active', branch));
      const again = archiveProjectDir(tmp, project, 'closed');
      const againAuthority = resolveFinalizeAuthority(tmp, project);
      check(again && again.dest && again.dest !== firstDest && againAuthority.authorityDir === again.dest
        && againAuthority.innerReason !== 'archive_authority_ambiguous',
        'a further finalize must resolve the newest collision archive, got ' + JSON.stringify({ dest: again && again.dest, authority: againAuthority.authorityDir, innerReason: againAuthority.innerReason }));
      check(!fs.existsSync(firstReceipt), 'the previous no-steps anchor must not keep tying with the newest archive');
      const newest = again && again.dest && readReceipt(again.dest);
      check(newest && newest.claim_ts === thirdTs && newest.archive_dest === relDest(tmp, again.dest) && !('steps' in newest),
        'the newest archive carries its own anchor, got ' + JSON.stringify(newest));
      check(resolveSinkReceiptPath(tmp, project, branch) === path.join(again.dest, '.cache', 'sink-receipt.json'),
        'resolveSinkReceiptPath follows the newest anchor');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('plain single archive', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-plain-')));
    const project = 'issue-1114-plain';
    const branch = 'workflow/issue-1114';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'active', branch));
      const archived = archiveProjectDir(tmp, project, 'closed');
      const dest = path.join(tmp, 'kaola-workflow', 'archive', project);
      check(archived && archived.dest === dest, 'a first archive uses the plain directory, got ' + (archived && archived.dest));
      check(!fs.existsSync(path.join(dest, '.cache', 'sink-receipt.json')), 'a plain archive does not gain an anchor receipt');
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.innerReason == null && authority.authorityDir === dest,
        'a plain single archive still resolves, got ' + JSON.stringify(authority));
      check(resolveSinkReceiptPath(tmp, project, branch) === path.join(dest, '.cache', 'sink-receipt.json'),
        'resolveSinkReceiptPath still names the plain archive receipt path');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('live directory', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-live-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const current = 'kaola-workflow/archive/' + project + '.archived-2026-10-05T07-09-39-753Z';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, '2026-10-04T01:00:00.000Z', 'closed', branch));
      write(tmp, current + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'closed', branch));
      write(tmp, current + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, claim_ts: '2026-10-05T02:00:00.000Z', archive_dest: current, branch: branch
      }));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, '2026-10-05T04:00:00.000Z', 'active', branch));
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.livePresent === true && authority.authorityDir === path.join(tmp, 'kaola-workflow', project) && !authority.innerReason,
        'a live directory still resolves beside an anchored archive, got ' + JSON.stringify({ live: authority.livePresent, dir: authority.authorityDir, innerReason: authority.innerReason }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('unanchored pair stays ambiguous', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-ambig-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const newer = 'kaola-workflow/archive/' + project + '.archived-2026-10-05T07-09-39-753Z';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, '2026-10-04T01:00:00.000Z', 'closed', branch));
      write(tmp, newer + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'closed', branch));
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.innerReason === 'archive_authority_ambiguous' && !authority.authorityDir,
        'two claimed archives and no anchor must not be chosen by timestamp, got ' + JSON.stringify(authority));
      let refused = false;
      try { resolveSinkReceiptPath(tmp, project, branch); }
      catch (error) { refused = /archive_authority_ambiguous/.test(error.message); }
      check(refused, 'resolveSinkReceiptPath must still refuse an unanchored pair');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('two self-anchors stay ambiguous', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-two-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const older = 'kaola-workflow/archive/' + project + '.archived-2026-10-04T01-00-00-000Z';
    const newer = 'kaola-workflow/archive/' + project + '.archived-2026-10-05T07-09-39-753Z';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, older + '/workflow-state.md', state(project, '2026-10-04T01:00:00.000Z', 'closed', branch));
      write(tmp, older + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, claim_ts: '2026-10-04T01:00:00.000Z', archive_dest: older, branch: branch
      }));
      write(tmp, newer + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'closed', branch));
      write(tmp, newer + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, claim_ts: '2026-10-05T02:00:00.000Z', archive_dest: newer, branch: branch
      }));
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.innerReason === 'archive_authority_ambiguous',
        'two self-anchors are unbreakable; timestamps must not pick, got ' + authority.innerReason);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('sink receipt is not rewritten', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-sink-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const sinkReceipt = {
      project: project,
      branch: branch,
      claim_ts: '2026-10-05T02:00:00.000Z',
      started_at: '2026-10-05T02:00:01.000Z',
      steps: { merge: 'done', finalize: 'pending' }
    };
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, '2026-10-04T01:00:00.000Z', 'closed', branch));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'active', branch));
      const raw = JSON.stringify(sinkReceipt, null, 2) + '\n';
      write(tmp, 'kaola-workflow/' + project + '/.cache/sink-receipt.json', raw);
      const archived = archiveProjectDir(tmp, project, 'closed');
      const moved = fs.readFileSync(path.join(archived.dest, '.cache', 'sink-receipt.json'), 'utf8');
      check(moved === raw, 'a receipt that already has steps must move unchanged');
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.innerReason === 'archive_authority_ambiguous',
        'a sink receipt without archive_dest does not become the anchor, got ' + authority.innerReason);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('linked double-seen', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-link-')));
    const main = path.join(tmp, 'main');
    const wt = path.join(tmp, 'linked');
    const project = 'issue-1067';
    const old = 'kaola-workflow/archive/' + project;
    const current = old + '.archived-2026-09-12T13-08-06-899Z';
    try {
      fs.mkdirSync(main);
      G.init(main, { branch: 'main' });
      write(main, 'README.md', 'fixture\n');
      write(main, old + '/mission-list.md', '# Historical doc pointer\n');
      G.gitOk(main, ['add', '.']);
      G.gitOk(main, ['commit', '-m', 'historical run']);
      G.gitOk(main, ['worktree', 'add', '-b', 'workflow/issue-1067', wt]);
      write(main, current + '/workflow-state.md', state(project, '2026-09-12T12:00:00.000Z', 'closed', 'workflow/issue-1067'));
      const fromWt = resolveFinalizeAuthority(wt, project);
      check(fs.realpathSync(fromWt.authorityDir) === fs.realpathSync(path.join(main, current)),
        'linked crash resume still selects the sole state-bearing archive, got ' + fromWt.authorityDir + ' reason ' + fromWt.innerReason);
      write(main, old + '.archived-older/workflow-state.md', state(project, '2026-08-01T00:00:00.000Z', 'closed', 'workflow/issue-1067'));
      const ambiguous = resolveFinalizeAuthority(main, project);
      check(ambiguous.innerReason === 'archive_authority_ambiguous',
        'two claimed archives seen from main stay ambiguous, got ' + ambiguous.innerReason);
      write(main, current + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, branch: 'workflow/issue-1067', claim_ts: '2026-09-12T12:00:00.000Z', archive_dest: current
      }));
      const picked = resolveFinalizeAuthority(main, project);
      check(picked.authorityDir === path.join(main, current) && !picked.innerReason,
        'one self-anchor beside an older claimed archive resolves, got ' + JSON.stringify({ dir: picked.authorityDir, innerReason: picked.innerReason }));
      check(resolveSinkReceiptPath(main, project, 'workflow/issue-1067') === path.join(main, current, '.cache', 'sink-receipt.json'),
        'the #1067 anchored journal path is unchanged');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('linked repeat finalize', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-lw-')));
    const main = path.join(tmp, 'main');
    const wt = path.join(tmp, 'linked');
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    try {
      fs.mkdirSync(main);
      G.init(main, { branch: 'main' });
      write(main, 'README.md', 'fixture\n');
      G.gitOk(main, ['add', '.']);
      G.gitOk(main, ['commit', '-m', 'init']);
      G.gitOk(main, ['worktree', 'add', '-b', branch, wt]);
      write(main, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, '2026-10-04T01:00:00.000Z', 'closed', branch));
      write(wt, 'kaola-workflow/' + project + '/workflow-state.md', state(project, '2026-10-05T02:00:00.000Z', 'active', branch));
      const archived = archiveProjectDir(wt, project, 'closed');
      check(archived && archived.archived === true && String(archived.dest || '').startsWith(main),
        'a linked finalize archives under main, got ' + (archived && archived.dest));
      const fromMain = resolveFinalizeAuthority(main, project);
      const fromWt = resolveFinalizeAuthority(wt, project);
      check(fromMain.authorityDir === archived.dest && !fromMain.innerReason,
        'main resolves the linked collision archive, got ' + JSON.stringify({ dir: fromMain.authorityDir, innerReason: fromMain.innerReason }));
      check(fromWt.authorityDir && fs.realpathSync(fromWt.authorityDir) === fs.realpathSync(archived.dest) && !fromWt.innerReason,
        'the worktree resolves the same archive, got ' + JSON.stringify({ dir: fromWt.authorityDir, innerReason: fromWt.innerReason }));
      check(resolveSinkReceiptPath(main, project, branch) === path.join(archived.dest, '.cache', 'sink-receipt.json'),
        'the sink receipt path follows the main-relative anchor');
      const receipt = readReceipt(archived.dest);
      check(receipt.archive_dest === relDest(fs.realpathSync(main), archived.dest) && !('steps' in receipt),
        'the linked anchor is main-relative and has no steps, got ' + JSON.stringify(receipt));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  console.log('Issue 1114 archive authority (' + edition + '): ' + checks + ' checks, ' + failures + ' failures');
  return failures;
}

const requested = process.argv[2];
const names = requested ? [requested] : Object.keys(editions);
let failed = false;
for (const name of names) {
  if (!editions[name]) throw new Error('Unknown edition ' + name);
  if (runEdition(name) > 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
