#!/usr/bin/env node
'use strict';
// #1089 acceptance: the mission ledger replaces the Markdown Mission List.
//
// Contract under test (issue #1089 "与 KPR 的契约" + 验收 1-10, owner-accepted with HARD RETIRE:
// no mission-list.md anywhere, no fallback reader):
//   path    <canonical-root>/kaola-workflow/.ledger/issue-<N>.jsonl, a pure string join, main
//           checkout only, gitignored, never under a worktree;
//   shape   one JSON object per line, keys exactly n,name,details,status in that order, n = 1..k,
//           status in todo|in-flight|done|failed|blocked, no header;
//   writes  create (todo) -> dispatch (in-flight, details gains a locator) -> result (terminal,
//           details gains the outcome locator); done/failed lines immutable afterwards;
//   reader  absent -> unknown; present -> done lines / total lines;
//   archive the file MOVES to kaola-workflow/archive/<project>/mission-ledger.jsonl (tracked).
//
// Behavioural checks run against all four claim editions. Fixtures live in os.tmpdir(). Every
// claim CLI spawn runs with KAOLA_WORKFLOW_OFFLINE=1; offline, claim does not provision a worktree
// itself, so the linked-worktree posture is built with a real `git worktree add` at the layout
// claim uses (<main>/.kw/worktrees/<project>) and the claim / archive are driven FROM inside it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const REPO = path.resolve(__dirname, '..');
const EDITIONS = {
  canonical: { dir: path.join(REPO, 'scripts'), claim: 'kaola-workflow-claim.js' },
  codex: { dir: path.join(REPO, 'plugins/kaola-workflow/scripts'), claim: 'kaola-workflow-claim.js' },
  gitlab: { dir: path.join(REPO, 'plugins/kaola-workflow-gitlab/scripts'), claim: 'kaola-gitlab-workflow-claim.js' },
  gitea: { dir: path.join(REPO, 'plugins/kaola-workflow-gitea/scripts'), claim: 'kaola-gitea-workflow-claim.js' },
};

let checks = 0;
let failures = 0;
// A section that throws (e.g. an export missing on a baseline) is one counted failure, and the
// remaining sections still run, so every acceptance item reports its own verdict.
function step(label, fn) { try { fn(); } catch (e) { check(false, label + ' threw: ' + (e && e.message)); } }
function check(ok, msg) { checks++; if (!ok) { failures++; console.error('FAIL: ' + msg); } }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function real(p) { return fs.realpathSync(p); }

// jq is the Host's reading tool named by the contract; its presence is a PATH probe.
// spawn-class: environment
const HAS_JQ = spawnSync('jq', ['--version'], { encoding: 'utf8' }).status === 0;
function jq(args, file) {
  // The projection is computed by the external tool itself, on the file bytes.
  // spawn-class: environment
  const r = spawnSync('jq', args.concat([file]), { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

// The Host reader, written as the contract's literal rule (#1089 contract item 4): absent file ->
// unknown; present -> progress = lines whose status is "done" / total lines. Deliberately NOT the
// production validator: this is what a Runner Host holding only the file would compute.
function hostRead(file) {
  if (!fs.existsSync(file)) return { state: 'unknown' };
  const lines = read(file).split('\n').filter(l => l.trim());
  const rows = lines.map(l => JSON.parse(l));
  return { state: 'known', done: rows.filter(r => r.status === 'done').length, total: rows.length,
    byN: Object.fromEntries(rows.map(r => [r.n, r.status])) };
}

function fixtureRepo(tmp, name, withIgnoreLine) {
  const root = path.join(tmp, name);
  fs.mkdirSync(root, { recursive: true });
  G.init(root, { branch: 'main' });
  G.git(root, ['config', 'core.fsyncMethod', 'writeout-only']);
  G.git(root, ['config', 'commit.gpgsign', 'false']);
  write(path.join(root, 'README.md'), 'fixture\n');
  write(path.join(root, '.gitignore'), (withIgnoreLine ? 'kaola-workflow/.ledger/\n' : '') + '.kw/\n');
  G.git(root, ['add', '.']);
  G.gitOk(root, ['commit', '-m', 'init']);
  return root;
}

function runClaimCli(ed, cwd, n) {
  // The claim envelope (ledger_path / ledger_finding) is the property under test.
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [path.join(ed.dir, ed.claim), 'claim', '--project', 'issue-' + n, '--issue', String(n)], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
  });
  const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  let json = null;
  try { json = JSON.parse(lines[lines.length - 1]); } catch (_) {}
  return { status: r.status, json, stderr: r.stderr };
}

// Every `kaola-workflow/.ledger` directory under `base` (walks everything, dot-dirs included).
function findLedgerDirs(base) {
  const hits = [];
  (function walk(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.name === '.ledger' && path.basename(d) === 'kaola-workflow') hits.push(p);
      walk(p);
    }
  })(base);
  return hits;
}

function stateText(n, extra) {
  return 'status: active\nissue_number: ' + n + '\nclaim_ts: 2026-09-22T00:00:00.000Z\n' + (extra || '');
}

function runEdition(edName) {
  const ed = EDITIONS[edName];
  const schema = require(path.join(ed.dir, 'kaola-workflow-adaptive-schema.js'));
  const claim = require(path.join(ed.dir, ed.claim));
  const tag = '[' + edName + '] ';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1089-'));
  const savedGoal = process.env.KAOLA_GOAL;
  delete process.env.KAOLA_GOAL;
  let main, mainReal, expected, wt, lf11, lf12, arch2, shapeFile, wmFile, good;
  try {
    step(tag + '1 path contract', () => {
      check(schema.LEDGER_DIR_REL === 'kaola-workflow/.ledger', tag + 'LEDGER_DIR_REL');
      check(schema.ARCHIVED_LEDGER_FILE === 'mission-ledger.jsonl', tag + 'ARCHIVED_LEDGER_FILE');
      check(schema.LEDGER_GITIGNORE_LINE === 'kaola-workflow/.ledger/', tag + 'LEDGER_GITIGNORE_LINE');
      check(JSON.stringify(schema.LEDGER_KEYS) === '["n","name","details","status"]', tag + 'LEDGER_KEYS order');
      check(JSON.stringify([...(schema.LEDGER_STATUSES || [])].sort()) === JSON.stringify(['blocked', 'done', 'failed', 'in-flight', 'todo']), tag + 'LEDGER_STATUSES set');
      const fakeRoot = path.join(tmp, 'does-not-exist', 'root');
      check(schema.ledgerPath(fakeRoot, 42) === fakeRoot + '/kaola-workflow/.ledger/issue-42.jsonl', tag + 'ledgerPath is a pure join, got ' + schema.ledgerPath(fakeRoot, 42));
      check(schema.ledgerPath(fakeRoot, '42') === schema.ledgerPath(fakeRoot, 42), tag + 'ledgerPath accepts a numeric string');
      check(!fs.existsSync(path.join(tmp, 'does-not-exist')), tag + 'ledgerPath touches no filesystem');
      for (const bad of [0, -1, '0', '01', 'abc', '1.5', '', null, undefined, '4 2', 'issue-4']) {
        check(!schema.ledgerPath(fakeRoot, bad), tag + 'ledgerPath rejects N=' + JSON.stringify(bad));
      }
    });
    step(tag + '1/2/3. real claim: in-place + from a linked worktree', () => {
      main = fixtureRepo(tmp, 'main', true);
      mainReal = real(main);
      expected = (n) => path.join(mainReal, 'kaola-workflow/.ledger/issue-' + n + '.jsonl');
      const c1 = runClaimCli(ed, main, 11);
      check(c1.json && c1.json.claim === 'acquired', tag + 'offline claim acquires: ' + JSON.stringify(c1.json) + c1.stderr);
      check(c1.json && c1.json.ledger_path === expected(11), tag + 'claim envelope ledger_path = main-root path, got ' + (c1.json && c1.json.ledger_path));
      check(c1.json && !('ledger_finding' in c1.json), tag + 'no ledger_finding when the ignore line is present');
      check(fs.statSync(path.join(main, 'kaola-workflow/.ledger')).isDirectory(), tag + 'claim created kaola-workflow/.ledger/ in main');
      wt = path.join(main, '.kw/worktrees/issue-12');
      G.gitOk(main, ['worktree', 'add', '-b', 'workflow/issue-12', wt]);
      const c2 = runClaimCli(ed, wt, 12);
      check(c2.json && c2.json.claim === 'acquired', tag + 'claim from linked worktree acquires: ' + JSON.stringify(c2.json) + c2.stderr);
      check(c2.json && c2.json.ledger_path === expected(12), tag + 'worktree claim: ledger_path resolves to MAIN, got ' + (c2.json && c2.json.ledger_path));
      check(claim.liveLedgerPath(wt, 12) === expected(12), tag + 'liveLedgerPath from inside the worktree returns the main path, got ' + claim.liveLedgerPath(wt, 12));
      const prep = claim.prepareMissionLedger(wt, 13);
      check(prep.ledger_path === expected(13) && !prep.ledger_finding, tag + 'prepareMissionLedger from worktree -> main path, no finding: ' + JSON.stringify(prep));
      check(findLedgerDirs(path.join(main, '.kw')).length === 0, tag + 'no kaola-workflow/.ledger anywhere under .kw/worktrees: ' + findLedgerDirs(path.join(main, '.kw')).join(','));
      check(!fs.existsSync(path.join(wt, 'kaola-workflow/.ledger')), tag + 'worktree has no kaola-workflow/.ledger');
    });
    step(tag + '2. gitignored in the fixture', () => {
      lf11 = expected(11);
      claim.writeMissionLedger(lf11, [{ name: 'first', details: '', status: 'todo' }]);
      const porcelain = G.out(main, ['status', '--porcelain', '--untracked-files=all']);
      check(!/\.ledger\//.test(porcelain), tag + 'git status -uall does not list the ledger (ignored): ' + porcelain);
      check(G.git(main, ['check-ignore', '-q', 'kaola-workflow/.ledger/issue-11.jsonl']).status === 0, tag + 'fixture check-ignore ledger exits 0');
    });
    step(tag + '7. archive, in-place posture', () => {
      write(path.join(main, 'kaola-workflow/issue-11/workflow-state.md'), stateText(11));
      const ledgerBytes = fs.readFileSync(lf11);
      const a1 = claim.archiveProjectDir(main, 'issue-11', 'closed');
      const arch1 = path.join(main, 'kaola-workflow/archive/issue-11', schema.ARCHIVED_LEDGER_FILE);
      check(a1 && a1.archived === true, tag + 'in-place archive ok: ' + JSON.stringify(a1));
      check(a1 && a1.ledger === 'moved', tag + 'in-place archive result.ledger === moved, got ' + (a1 && a1.ledger));
      check(!fs.existsSync(lf11), tag + 'in-place archive: .ledger/issue-11.jsonl gone');
      check(fs.existsSync(arch1) && fs.readFileSync(arch1).equals(ledgerBytes), tag + 'in-place archive: archive/issue-11/mission-ledger.jsonl holds identical bytes');
      check(G.git(main, ['check-ignore', '-q', 'kaola-workflow/archive/issue-11/mission-ledger.jsonl']).status === 1, tag + 'archived ledger is NOT ignored (check-ignore exits 1)');
      check(/mission-ledger\.jsonl/.test(G.out(main, ['status', '--porcelain', '--untracked-files=all'])), tag + 'archived ledger shows as trackable in git status');
      check(!fs.existsSync(path.join(main, 'kaola-workflow/archive/issue-11/mission-list.md')), tag + 'archive carries no mission-list.md');
      // no ledger -> 'absent'
      write(path.join(main, 'kaola-workflow/issue-14/workflow-state.md'), stateText(14));
      const a0 = claim.archiveProjectDir(main, 'issue-14', 'closed');
      check(a0 && a0.ledger === 'absent', tag + 'archive without a ledger reports ledger: absent, got ' + (a0 && a0.ledger));
      check(!fs.existsSync(path.join(main, 'kaola-workflow/archive/issue-14', schema.ARCHIVED_LEDGER_FILE)), tag + 'no archived ledger fabricated');
    });
    step(tag + '3/7. archive from the linked worktree', () => {
      lf12 = expected(12);
      claim.writeMissionLedger(lf12, [{ name: 'lane', details: 'dispatched: implementer -> .kw/worktrees/issue-12 | result: commit abc1234', status: 'done' }]);
      const bytes12 = fs.readFileSync(lf12);
      const wtState = path.join(wt, 'kaola-workflow/issue-12/workflow-state.md');
      write(wtState, stateText(12, 'run_posture: worktree\nworktree_path: ' + wt + '\nbranch: workflow/issue-12\n'));
      const a2 = claim.archiveProjectDir(wt, 'issue-12', 'closed');
      arch2 = path.join(mainReal, 'kaola-workflow/archive/issue-12', schema.ARCHIVED_LEDGER_FILE);
      check(a2 && a2.archived === true, tag + 'linked archive ok: ' + JSON.stringify(a2));
      check(a2 && a2.ledger === 'moved', tag + 'linked archive result.ledger === moved, got ' + (a2 && a2.ledger));
      check(!fs.existsSync(lf12), tag + 'linked archive: main .ledger/issue-12.jsonl gone');
      check(fs.existsSync(arch2) && fs.readFileSync(arch2).equals(bytes12), tag + 'linked archive: MAIN archive/issue-12/mission-ledger.jsonl holds identical bytes');
      check(!fs.existsSync(path.join(wt, 'kaola-workflow/archive/issue-12', schema.ARCHIVED_LEDGER_FILE)), tag + 'linked archive: nothing under the worktree archive');
      check(findLedgerDirs(path.join(main, '.kw')).length === 0, tag + 'still no .ledger under .kw after linked archive');
    });
    // Amendment §6 (issuecomment-5770350020): the move sits inside the archive transaction, after
    // verifyArchiveComplete, so a ledger beside its archive is reachable only by a crash — or by a
    // failed move, which must then be reported, never silent.
    step(tag + '§6 refused archive keeps the ledger live', () => {
      const lf = expected(15);
      claim.writeMissionLedger(lf, [{ name: 'lane', details: '', status: 'done' }]);
      const bytes = fs.readFileSync(lf);
      write(path.join(wt, 'kaola-workflow/issue-15/workflow-state.md'),
        stateText(15, 'run_posture: worktree\nworktree_path: ' + wt + '\nbranch: workflow/issue-15\n'));
      // main's live copy holds a file the worktree's lacks -> verifyArchiveComplete refuses.
      write(path.join(mainReal, 'kaola-workflow/issue-15/main-only-evidence.md'), '# only in main\n');
      const r = claim.archiveProjectDir(wt, 'issue-15', 'closed');
      check(r && r.archived === false && r.archive_incomplete === true, tag + '§6 fixture refuses: ' + JSON.stringify(r));
      check(r && !('ledger' in r), tag + '§6 refused archive attempts no ledger move: ' + JSON.stringify(r));
      check(fs.existsSync(lf) && fs.readFileSync(lf).equals(bytes), tag + '§6 refused archive leaves .ledger/issue-15.jsonl byte-identical');
      check(!!r.dest && !fs.existsSync(path.join(r.dest, schema.ARCHIVED_LEDGER_FILE)), tag + '§6 refused archive carries no mission-ledger.jsonl');
    });
    step(tag + '§6 failed move is reported, ledger kept', () => {
      const lf = expected(16);
      claim.writeMissionLedger(lf, [{ name: 'lane', details: '', status: 'done' }]);
      write(path.join(main, 'kaola-workflow/issue-16/workflow-state.md'), stateText(16));
      // a directory at the archived-ledger name makes the rename fail after a complete archive.
      write(path.join(main, 'kaola-workflow/issue-16', schema.ARCHIVED_LEDGER_FILE, 'blocker'), 'x');
      const r = claim.archiveProjectDir(main, 'issue-16', 'closed');
      check(r && r.archived === true && /^failed: /.test(String(r.ledger)), tag + '§6 failed move returns ledger: failed: …, got ' + JSON.stringify(r));
      check(fs.existsSync(lf), tag + '§6 failed move leaves the live ledger in place');
      const src = read(path.join(ed.dir, ed.claim));
      check(/if \(result\.ledger\) closureReceipt\.mission_ledger = result\.ledger;/.test(src),
        tag + '§6 cmdFinalize carries the move outcome on closure_receipt.mission_ledger');
      const iMove = src.indexOf('const ledger = moveMissionLedger(');
      const iVerify = src.indexOf('const v = verifyArchiveComplete(src, dest);');
      check(iVerify > 0 && iMove > iVerify, tag + '§6 the move follows verifyArchiveComplete in archiveProjectDir');
    });
    step(tag + '7. goal declaration', () => {
      let g = claim.computeGoalDeclaration([arch2]);
      check(g.declared === true && g.source === 'ledger', tag + 'goal from archived ledger: ' + JSON.stringify(g));
      const empty = path.join(tmp, 'empty.jsonl'); write(empty, '');
      g = claim.computeGoalDeclaration([empty]);
      check(g.declared === false && g.source === null, tag + 'empty ledger declares no goal: ' + JSON.stringify(g));
      g = claim.computeGoalDeclaration([path.join(tmp, 'missing.jsonl')]);
      check(g.declared === false, tag + 'absent ledger declares no goal');
      // Hard retire: a markdown mission list is not a goal source any more (no fallback reader).
      const md = path.join(tmp, 'mission-list.md'); write(md, '# Goal heading\n\n- item: x\n  status: done\n');
      g = claim.computeGoalDeclaration([path.join(tmp, 'missing.jsonl')]);
      check(g.declared === false && !g.probed.includes(md), tag + 'no fallback to a sibling mission-list.md: ' + JSON.stringify(g));
      process.env.KAOLA_GOAL = '  ship it ';
      g = claim.computeGoalDeclaration([empty]);
      check(g.declared === true && g.source === 'env', tag + 'KAOLA_GOAL -> source env: ' + JSON.stringify(g));
      delete process.env.KAOLA_GOAL;
    });
    step(tag + '2. fixture WITHOUT the ignore line', () => {
      const bare = fixtureRepo(tmp, 'bare', false);
      const giBefore = fs.readFileSync(path.join(bare, '.gitignore'));
      const p2 = claim.prepareMissionLedger(bare, 21);
      check(typeof p2.ledger_finding === 'string' && p2.ledger_finding.startsWith('ledger_not_gitignored'), tag + 'prepareMissionLedger reports ledger_not_gitignored: ' + JSON.stringify(p2));
      const c3 = runClaimCli(ed, bare, 22);
      check(c3.json && typeof c3.json.ledger_finding === 'string' && c3.json.ledger_finding.startsWith('ledger_not_gitignored'), tag + 'claim envelope carries ledger_not_gitignored: ' + JSON.stringify(c3.json));
      check(fs.readFileSync(path.join(bare, '.gitignore')).equals(giBefore), tag + '.gitignore bytes untouched');
      claim.writeMissionLedger(path.join(real(bare), 'kaola-workflow/.ledger/issue-22.jsonl'), [{ name: 'x', details: '', status: 'todo' }]);
      check(/kaola-workflow\/\.ledger\/issue-22\.jsonl/.test(G.out(bare, ['status', '--porcelain', '--untracked-files=all'])), tag + 'control: without the ignore line the ledger IS listed by git status');
    });
    step(tag + '4. shape', () => {
      good = schema.serializeLedger([
        { name: 'a', details: '', status: 'todo' },
        { name: 'b', details: 'dispatched: x', status: 'in-flight' },
        { name: 'c', details: 'result: y', status: 'done' },
        { name: 'd', details: '', status: 'failed' },
        { name: 'e', details: 'waiting owner', status: 'blocked' },
      ]);
      const vg = schema.validateLedger(good);
      check(vg.ok && vg.missions.length === 5, tag + 'validateLedger accepts serializeLedger output: ' + JSON.stringify(vg.errors));
      check(good.split('\n').filter(Boolean).every((l, i) => Object.keys(JSON.parse(l)).join(',') === 'n,name,details,status' && JSON.parse(l).n === i + 1), tag + 'serialized lines: key order + n=1..k');
      check(good.endsWith('\n') && !/^\s*[^{]/m.test(good.trim()), tag + 'no header line, newline-terminated');
      const line = (o) => JSON.stringify(o);
      const bads = {
        'wrong key order': line({ n: 1, status: 'todo', name: 'a', details: '' }),
        'extra key': line({ n: 1, name: 'a', details: '', status: 'todo', ts: 'x' }),
        'missing key': line({ n: 1, name: 'a', status: 'todo' }),
        'n gap': line({ n: 1, name: 'a', details: '', status: 'todo' }) + '\n' + line({ n: 3, name: 'b', details: '', status: 'todo' }),
        'n starts at 0': line({ n: 0, name: 'a', details: '', status: 'todo' }),
        'n starts at 2': line({ n: 2, name: 'a', details: '', status: 'todo' }),
        'bad status': line({ n: 1, name: 'a', details: '', status: 'wip' }),
        'multi-line name': line({ n: 1, name: 'a\nb', details: '', status: 'todo' }),
        'non-JSON line': line({ n: 1, name: 'a', details: '', status: 'todo' }) + '\n- item: a',
        'markdown header': '# Mission List\n' + line({ n: 1, name: 'a', details: '', status: 'todo' }),
      };
      for (const [k, text] of Object.entries(bads)) {
        check(schema.validateLedger(text + '\n').ok === false, tag + 'validateLedger rejects ' + k);
      }
      shapeFile = path.join(tmp, 'shape.jsonl'); write(shapeFile, good);
      if (HAS_JQ) {
        const proj = jq(['-c', '{n,status}'], shapeFile);
        const done = proj.split('\n').filter(Boolean).filter(l => JSON.parse(l).status === 'done').length;
        check(done === 1, tag + 'jq -c {n,status} projection yields done count 1, got ' + done);
        check(proj.split('\n').filter(Boolean).length === 5, tag + 'jq projection line per mission');
      }
    });
    step(tag + '5. write moments', () => {
      wmFile = path.join(tmp, 'wm/kaola-workflow/.ledger/issue-5.jsonl');
      fs.mkdirSync(path.dirname(wmFile), { recursive: true });
      const L = [{ name: 'implement lane', details: '', status: 'todo' }, { name: 'acceptance', details: '', status: 'todo' }];
      claim.writeMissionLedger(wmFile, L);
      const line1 = () => read(wmFile).split('\n')[0];
      check(JSON.parse(line1()).status === 'todo' && hostRead(wmFile).done === 0, tag + 'create: mission 1 todo');
      L[0].status = 'in-flight'; L[0].details = 'dispatched: implementer; output lands .kw/worktrees/issue-5 (branch workflow/issue-5)';
      claim.writeMissionLedger(wmFile, L);
      check(JSON.parse(line1()).status === 'in-flight' && /dispatched: implementer.*\.kw\/worktrees\/issue-5/.test(JSON.parse(line1()).details), tag + 'dispatch: in-flight with a dispatch locator');
      L[0].status = 'done'; L[0].details += ' | result: commit 1a2b3c4 on workflow/issue-5';
      claim.writeMissionLedger(wmFile, L);
      const doneLine = line1();
      check(JSON.parse(doneLine).status === 'done' && /result: commit 1a2b3c4/.test(JSON.parse(doneLine).details), tag + 'result: done with a result locator');
      L[1].status = 'in-flight'; L[1].details = 'dispatched: self';
      claim.writeMissionLedger(wmFile, L);
      check(line1() === doneLine, tag + 'done line bytes unchanged after mission 2 dispatch');
      L[1].status = 'done'; L[1].details += ' | result: suite green';
      claim.writeMissionLedger(wmFile, L);
      check(line1() === doneLine, tag + 'done line bytes unchanged after mission 2 result');
      check(read(wmFile).split('\n').filter(Boolean).length === 2, tag + 'one line per mission (no append)');
      const before = fs.readFileSync(wmFile);
      let threw = false;
      try { claim.writeMissionLedger(wmFile, [{ name: 'ok', details: '', status: 'done' }, { name: 'bad', details: '', status: 'maybe' }]); } catch (_) { threw = true; }
      check(threw, tag + 'writeMissionLedger refuses a bad status');
      threw = false;
      try { claim.writeMissionLedger(wmFile, [{ name: 'two\nlines', details: '', status: 'todo' }]); } catch (_) { threw = true; }
      check(threw, tag + 'writeMissionLedger refuses a multi-line name');
      check(fs.readFileSync(wmFile).equals(before), tag + 'refused write leaves previous bytes intact');
      check(fs.readdirSync(path.dirname(wmFile)).length === 1, tag + 'refused write leaves no temp file behind: ' + fs.readdirSync(path.dirname(wmFile)).join(','));
    });
    step(tag + '6. host read', () => {
      const hr = hostRead(wmFile);
      check(hr.state === 'known' && hr.done === 2 && hr.total === 2, tag + 'Host read done/total = 2/2: ' + JSON.stringify(hr));
      const hrShape = hostRead(shapeFile);
      const vShape = schema.validateLedger(read(shapeFile));
      check(hrShape.done === vShape.missions.filter(m => m.status === 'done').length && hrShape.total === vShape.missions.length, tag + 'Host read agrees with validateLedger parse');
      if (HAS_JQ) {
        const jqDone = Number(String(jq(['-s', 'map(select(.status=="done"))|length'], shapeFile)).trim());
        const jqTotal = Number(String(jq(['-s', 'length'], shapeFile)).trim());
        check(jqDone === hrShape.done && jqTotal === hrShape.total, tag + 'jq count equals Host done/total');
      }
      check(hostRead(path.join(tmp, 'wm/kaola-workflow/.ledger/issue-6.jsonl')).state === 'unknown', tag + 'absent ledger -> unknown');
      check(hostRead(schema.ledgerPath(mainReal, 11)).state === 'unknown', tag + 'archived run -> live path absent -> unknown');
    });
  } finally {
    if (savedGoal === undefined) delete process.env.KAOLA_GOAL; else process.env.KAOLA_GOAL = savedGoal;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 8. token: bundle-1087 re-encoded ----------
// Parse of kaola-workflow/archive/bundle-1087/mission-list.md (line-form layout): a mission starts at
// a line `- item: <text>` (name = <text>, one line). Following lines of the form
// `  <field>: <text>` with field in status|dispatched|result set that field; any other indented
// non-blank line continues the last field (joined by one space). details = "dispatched: <d>" plus
// " | result: <r>" when the result is non-empty — the design's fold of dispatched/result into
// details. H1, preamble and `## Missions` are scaffolding and carry no mission content.
function tokenCheck() {
  const rel = 'kaola-workflow/archive/bundle-1087/mission-list.md';
  let mdText = null;
  const shown = G.git(REPO, ['show', 'HEAD:' + rel]);
  if (shown.status === 0) mdText = shown.stdout;
  else if (fs.existsSync(path.join(REPO, rel))) mdText = read(path.join(REPO, rel));
  check(mdText !== null, 'token: bundle-1087 mission-list.md baseline readable');
  if (mdText === null) return;
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const missions = [];
  let cur = null;
  let last = null;
  for (const ln of mdText.split('\n')) {
    let m;
    if ((m = /^- item:\s?(.*)$/.exec(ln))) { cur = { item: m[1].trim(), status: '', dispatched: '', result: '' }; missions.push(cur); last = null; continue; }
    if (!cur) continue;
    if ((m = /^\s+(status|dispatched|result):\s?(.*)$/.exec(ln))) { cur[m[1]] = m[2].trim(); last = m[1]; continue; }
    if (/^\s+\S/.test(ln) && last) cur[last] = (cur[last] ? cur[last] + ' ' : '') + ln.trim();
  }
  check(missions.length === 5, 'token: parsed 5 missions from bundle-1087, got ' + missions.length);
  check(missions.every(x => schema.LEDGER_STATUSES.includes(x.status)), 'token: every parsed status is a ledger status: ' + missions.map(x => x.status).join(','));
  const ledger = schema.serializeLedger(missions.map(x => ({
    name: x.item,
    details: ['dispatched: ' + x.dispatched].concat(x.result ? ['result: ' + x.result] : []).join(' | '),
    status: x.status,
  })));
  check(schema.validateLedger(ledger).ok, 'token: re-encoded ledger validates');
  const mdBytes = Buffer.byteLength(mdText);
  const ledBytes = Buffer.byteLength(ledger);
  check(ledBytes <= mdBytes, 'token: ledger bytes ' + ledBytes + ' <= markdown bytes ' + mdBytes);
  const projection = ledger.split('\n').filter(Boolean).map(l => { const o = JSON.parse(l); return JSON.stringify({ n: o.n, status: o.status }) + '\n'; }).join('');
  const projBytes = Buffer.byteLength(projection);
  check(projBytes <= mdBytes * 0.05, 'token: {n,status} projection ' + projBytes + ' B <= 5% of ' + mdBytes + ' B');
  if (HAS_JQ) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1089-tok-')), 'l.jsonl');
    fs.writeFileSync(f, ledger);
    const jqProj = jq(['-c', '{n,status}'], f);
    check(jqProj === projection, 'token: jq -c {n,status} bytes equal the computed projection');
    check(jqProj.split('\n').filter(l => /"done"/.test(l)).length === 4, 'token: jq projection counts 4 done of 5');
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
  }
}

// ---------- 9. retire greps + presence ----------
// `(?<![\w-])` keeps the ADR filename `0017-the-mission-list.md` (a doc reference, not the retired
// run file) from matching.
const RETIRED_FILE_RE = /(?<![\w-])mission-list\.md/;
function retireChecks() {
  const kernelTokens = [/MISSION_LIST_FILE/, /compareLedgers/, /mirror-digest/, /ledger-compare/, RETIRED_FILE_RE];
  for (const ed of Object.values(EDITIONS)) {
    for (const f of [path.join(ed.dir, ed.claim), path.join(ed.dir, 'kaola-workflow-adaptive-schema.js')]) {
      const text = read(f);
      for (const re of kernelTokens) check(!re.test(text), 'retire: ' + path.relative(REPO, f) + ' has no ' + re.source);
    }
  }
  const gen = require('./generate-routing-surfaces.js');
  const rows = gen.GENERATED_SURFACES.concat(gen.RUNTIME_RECOVERY_SURFACES);
  check(rows.length >= 24, 'retire: routing render set discovered (' + rows.length + ')');
  for (const topic of ['next', 'init', 'finalize', 'compact-recovery']) {
    check(rows.some(r => r.topic === topic), 'retire: render set includes topic ' + topic);
  }
  for (const r of rows) {
    const f = path.join(REPO, r.path);
    check(fs.existsSync(f), 'retire: render exists ' + r.path);
    if (fs.existsSync(f)) check(!RETIRED_FILE_RE.test(read(f)), 'retire: render ' + r.path + ' names no mission-list.md');
    if (r.topic === 'init' && fs.existsSync(f)) check(read(f).includes('kaola-workflow/.ledger/'), 'retire: init render ' + r.path + ' names kaola-workflow/.ledger/');
  }
  const globalContract = path.join(REPO, 'templates/global/kaola-workflow-global.md');
  check(!RETIRED_FILE_RE.test(read(globalContract)), 'retire: global contract names no mission-list.md');
  check(read(globalContract).includes('kaola-workflow/.ledger/'), 'retire: global contract names kaola-workflow/.ledger/');
  for (const rel of [
    'scripts/kaola-workflow-ledger-compare.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-ledger-compare.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-ledger-compare.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-workflow-ledger-compare.js',
    'scripts/test-ledger-compare.js',
    'scripts/test-issue-1054-ledger-guard.js',
    'scripts/test-issue-1054-mission-list-carriers.js',
  ]) check(!fs.existsSync(path.join(REPO, rel)), 'retire: ' + rel + ' does not exist');
  const gi = read(path.join(REPO, '.gitignore')).split('\n').map(s => s.trim());
  check(gi.includes('kaola-workflow/.ledger/'), 'retire: repo .gitignore carries kaola-workflow/.ledger/');
  check(G.git(REPO, ['check-ignore', '-q', 'kaola-workflow/.ledger/issue-1.jsonl']).status === 0, 'this repo: git check-ignore kaola-workflow/.ledger/issue-1.jsonl exits 0');
  check(G.git(REPO, ['check-ignore', '-q', 'kaola-workflow/archive/issue-1/mission-ledger.jsonl']).status === 1, 'this repo: archived mission-ledger.jsonl is not ignored');

  // ---------- 10. docs presence ----------
  check(fs.existsSync(path.join(REPO, 'docs/decisions/0027-the-mission-ledger.md')), 'docs: docs/decisions/0027-the-mission-ledger.md exists');
  const changelog = read(path.join(REPO, 'CHANGELOG.md'));
  const unrel = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m.exec(changelog);
  check(!!unrel, 'docs: CHANGELOG has an [Unreleased] section');
  check(!!unrel && /#1089\b/.test(unrel[1]), 'docs: CHANGELOG [Unreleased] mentions #1089');
}

const requested = process.argv[2];
const names = requested ? [requested] : Object.keys(EDITIONS);
for (const n of names) {
  if (!EDITIONS[n]) throw new Error('Unknown edition ' + n);
  const before = failures;
  runEdition(n);
  console.log('  ' + n + ': ' + (failures - before) + ' failures');
}
step('8 token', tokenCheck);
step('9/10 retire+docs', retireChecks);
if (!HAS_JQ) console.log('  (jq absent: jq projection sub-checks skipped)');
console.log((failures ? 'FAIL' : 'PASS') + ': test-issue-1089-mission-ledger ' + checks + ' checks, ' + failures + ' failures');
process.exitCode = failures ? 1 : 0;
