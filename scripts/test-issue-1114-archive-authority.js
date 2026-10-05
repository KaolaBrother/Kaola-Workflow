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
function stateNoTs(project, status, branch) {
  return 'name: ' + project + '\n'
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

  section('unstamped newer archive keeps the previous anchor', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-unst-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const oldTs = '2026-10-04T01:00:00.000Z';
    const newTs = '2026-10-05T02:00:00.000Z';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, oldTs, 'closed', branch));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, newTs, 'active', branch));
      const first = archiveProjectDir(tmp, project, 'closed');
      const A = first && first.dest;
      check(A && path.basename(A).startsWith(project + '.archived-'),
        'the second archive must land collision-suffixed, got ' + A);
      const anchorPath = path.join(A, '.cache', 'sink-receipt.json');
      const anchorRaw = fs.readFileSync(anchorPath, 'utf8');

      waitNextMillis();
      // The third live state carries NO claim_ts: placeCollisionAnchor refuses to
      // stamp it, so the new dest can never tie with A — and A's anchor must stay.
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', stateNoTs(project, 'active', branch));
      const second = archiveProjectDir(tmp, project, 'closed');
      const B = second && second.dest;
      check(B && B !== A && path.basename(B).startsWith(project + '.archived-'),
        'the third archive must land at a fresh suffixed dir, got ' + B);
      check(fs.existsSync(anchorPath) && fs.readFileSync(anchorPath, 'utf8') === anchorRaw,
        'an unstamped newer archive must not retire the previous anchor — the receipt must be byte-identical');
      check(!fs.existsSync(path.join(B, '.cache', 'sink-receipt.json')),
        'the unstamped dest must not gain an anchor of its own');
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.authorityDir === A && authority.innerReason !== 'archive_authority_ambiguous',
        'the previous archive must still resolve, got ' + JSON.stringify({ dir: authority.authorityDir, innerReason: authority.innerReason }));
      check(resolveSinkReceiptPath(tmp, project, branch) === anchorPath,
        'resolveSinkReceiptPath must still name the previous anchored receipt');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('corrupt dest receipt keeps the previous anchor', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-corrupt-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const oldTs = '2026-10-04T01:00:00.000Z';
    const newTs = '2026-10-05T02:00:00.000Z';
    const thirdTs = '2026-10-05T03:00:00.000Z';
    const corrupt = '{broken-json';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, oldTs, 'closed', branch));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, newTs, 'active', branch));
      const first = archiveProjectDir(tmp, project, 'closed');
      const A = first && first.dest;
      check(A && path.basename(A).startsWith(project + '.archived-'),
        'corrupt-dest: the second archive must land collision-suffixed, got ' + A);
      const aAnchor = path.join(A, '.cache', 'sink-receipt.json');
      check(fs.existsSync(aAnchor), 'corrupt-dest: the second archive must carry its anchor');
      const aAnchorRaw = fs.existsSync(aAnchor) ? fs.readFileSync(aAnchor, 'utf8') : '';

      waitNextMillis();
      // The third live folder already holds a corrupt receipt. placeCollisionAnchor refuses
      // to write a self-anchor over it (sinkReceiptHasSteps reads unparseable as owned), so
      // the rename carries the corrupt bytes into the new collision dest. That dest supplies
      // no identity: retirement must NOT remove A's anchor, or the pair goes ambiguous.
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, thirdTs, 'active', branch));
      write(tmp, 'kaola-workflow/' + project + '/.cache/sink-receipt.json', corrupt);
      const second = archiveProjectDir(tmp, project, 'closed');
      const B = second && second.dest;
      check(second && second.archived === true && B && B !== A && path.basename(B).startsWith(project + '.archived-'),
        'corrupt-dest: the third archive must land at a fresh suffixed dir, got '
        + JSON.stringify(second && { archived: second.archived, dest: B }));
      const bReceipt = B && path.join(B, '.cache', 'sink-receipt.json');
      check(bReceipt && fs.existsSync(bReceipt) && fs.readFileSync(bReceipt, 'utf8') === corrupt,
        'corrupt-dest: the corrupt receipt must be preserved byte-identical in the new dest');
      check(fs.existsSync(aAnchor) && fs.readFileSync(aAnchor, 'utf8') === aAnchorRaw,
        'corrupt-dest: the previous valid anchor must be retained byte-identical');
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.authorityDir === A && authority.innerReason !== 'archive_authority_ambiguous',
        'corrupt-dest: authority must still resolve to the previously anchored archive, got '
        + JSON.stringify({ dir: authority.authorityDir, expected: A, innerReason: authority.innerReason }));
      check(resolveSinkReceiptPath(tmp, project, branch) === aAnchor,
        'corrupt-dest: resolveSinkReceiptPath must still name the retained anchor');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('steps-bearing newer journal still retires the previous anchor', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-steps-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const oldTs = '2026-10-04T01:00:00.000Z';
    const newTs = '2026-10-05T02:00:00.000Z';
    const thirdTs = '2026-10-05T03:00:00.000Z';
    try {
      G.init(tmp, { branch: 'main' });
      write(tmp, 'kaola-workflow/archive/' + project + '/workflow-state.md', state(project, oldTs, 'closed', branch));
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, newTs, 'active', branch));
      const first = archiveProjectDir(tmp, project, 'closed');
      const A = first && first.dest;
      check(A && path.basename(A).startsWith(project + '.archived-'),
        'the second archive must land collision-suffixed, got ' + A);
      const aAnchor = path.join(A, '.cache', 'sink-receipt.json');
      check(fs.existsSync(aAnchor), 'the second archive must carry its anchor');

      waitNextMillis();
      const journalRaw = JSON.stringify({
        project: project, branch: branch, claim_ts: thirdTs,
        steps: { merge: 'done', finalize: 'pending' }
      }, null, 2) + '\n';
      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, thirdTs, 'active', branch));
      write(tmp, 'kaola-workflow/' + project + '/.cache/sink-receipt.json', journalRaw);
      const second = archiveProjectDir(tmp, project, 'closed');
      const B = second && second.dest;
      check(B && B !== A && path.basename(B).startsWith(project + '.archived-'),
        'the third archive must land at a fresh suffixed dir, got ' + B);
      const bReceipt = path.join(B, '.cache', 'sink-receipt.json');
      check(fs.existsSync(bReceipt) && fs.readFileSync(bReceipt, 'utf8') === journalRaw,
        'the steps-bearing journal must move byte-identical — a self-anchor is never written over the sink\'s own receipt');
      check(!fs.existsSync(aAnchor),
        'the stamped dest still retires the previous no-steps anchor — keeping it would tie with B once the sink records archive_dest');
      // The sink's next move: stamp archive_dest into the journal and advance the step.
      const journal = JSON.parse(fs.readFileSync(bReceipt, 'utf8'));
      journal.archive_dest = relDest(tmp, B);
      journal.steps.finalize = 'done';
      fs.writeFileSync(bReceipt, JSON.stringify(journal, null, 2) + '\n');
      const authority = resolveFinalizeAuthority(tmp, project);
      check(authority.authorityDir === B && authority.innerReason !== 'archive_authority_ambiguous',
        'once the journal names B, B must resolve cleanly, got ' + JSON.stringify({ dir: authority.authorityDir, innerReason: authority.innerReason }));
      check(resolveSinkReceiptPath(tmp, project, branch) === bReceipt,
        'resolveSinkReceiptPath must follow the stamped journal to B');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  section('retirement removes only a no-steps self-anchor', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114-ret-')));
    const project = 'i260t2';
    const branch = 'workflow/issue-900260';
    const ts1 = '2026-01-01T00:00:00.000Z';
    const ts2 = '2026-01-02T00:00:00.000Z';
    const ts3 = '2026-01-03T00:00:00.000Z';
    const ts4 = '2026-02-01T00:00:00.000Z';
    const d1 = 'kaola-workflow/archive/' + project + '.archived-2026-01-01T00-00-00-000Z';
    const d2 = 'kaola-workflow/archive/' + project + '.archived-2026-01-02T00-00-00-000Z';
    const d3 = 'kaola-workflow/archive/' + project + '.archived-2026-01-03T00-00-00-000Z';
    try {
      G.init(tmp, { branch: 'main' });
      // The sink's own skeleton shape (#931 n5): a steps-bearing receipt and no
      // workflow-state.md at all.
      write(tmp, 'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, branch: branch, claim_ts: ts1, steps: { merge: 'done' }
      }) + '\n');
      // A steps-bearing receipt that otherwise matches the anchor fields: it is
      // the sink's journal, never a no-steps self-anchor, so it stays.
      write(tmp, d1 + '/workflow-state.md', state(project, ts1, 'closed', branch));
      write(tmp, d1 + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, claim_ts: ts1, archive_dest: d1, branch: branch, steps: { merge: 'done' }
      }, null, 2) + '\n');
      write(tmp, d1 + '/notes.md', 'notes\n');
      // An unparseable receipt is never provably a self-anchor: it stays.
      write(tmp, d2 + '/workflow-state.md', state(project, ts2, 'closed', branch));
      write(tmp, d2 + '/.cache/sink-receipt.json', '{not json');
      write(tmp, d2 + '/.cache/other.json', '{}\n');
      // The one true no-steps self-anchor — the only file retirement may remove.
      write(tmp, d3 + '/workflow-state.md', state(project, ts3, 'closed', branch));
      write(tmp, d3 + '/.cache/sink-receipt.json', JSON.stringify({
        project: project, claim_ts: ts3, archive_dest: d3, branch: branch
      }) + '\n');
      write(tmp, d3 + '/finalization-summary.md', '# Finalization Summary\n');
      write(tmp, d3 + '/.cache/extra.txt', 'extra\n');

      const snapshot = {};
      const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
      (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else snapshot[path.relative(tmp, p).split(path.sep).join('/')] = fs.readFileSync(p);
        }
      })(archiveRoot);
      const preExisting = new Set(Object.keys(snapshot));

      write(tmp, 'kaola-workflow/' + project + '/workflow-state.md', state(project, ts4, 'active', branch));
      const archived = archiveProjectDir(tmp, project, 'closed');
      const D = archived && archived.dest;
      check(D && path.basename(D).startsWith(project + '.archived-'),
        'the archive must land collision-suffixed, got ' + D);

      const removed = [...preExisting].filter(rel => !fs.existsSync(path.join(tmp, rel)));
      check(JSON.stringify(removed) === JSON.stringify([d3 + '/.cache/sink-receipt.json']),
        'retirement must remove exactly the one no-steps self-anchor, got ' + JSON.stringify(removed));
      for (const rel of preExisting) {
        if (removed.indexOf(rel) !== -1) continue;
        check(fs.readFileSync(path.join(tmp, rel)).equals(snapshot[rel]),
          'pre-existing file ' + rel + ' must be byte-identical');
      }
      check(fs.existsSync(path.join(tmp, d3)) && fs.existsSync(path.join(tmp, d3, '.cache')),
        'the retired anchor\'s directory and .cache must survive — only the receipt file goes');
      const dReceipt = D && readReceipt(D);
      check(dReceipt && dReceipt.claim_ts === ts4 && dReceipt.archive_dest === relDest(tmp, D) && !('steps' in dReceipt),
        'the new dest must carry a plain no-steps self-anchor, got ' + JSON.stringify(dReceipt));
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
