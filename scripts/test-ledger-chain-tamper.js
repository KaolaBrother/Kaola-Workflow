#!/usr/bin/env node
'use strict';
// Ledger tamper-evidence hash chain — RED tamper detection + honest-path GREEN + migration.
//
// Two failure modes are pinned here:
//   1. WEDGING HONEST RUNS (the dominant risk): the single write choke-point must carry
//      genesis + every multi-row-write shape (open-ready Phase 2, foldSelectorArms,
//      reactivate/repair resets, appendLedgerRows) as ONE per-write entry with a deltas[]
//      array, and verification must stay green after each. A headless plan must PASS
//      untouched (migration). Proven end-to-end through the real CLI and through the wrapper.
//   2. VACUOUS DETECTION: an out-of-band ## Node Ledger edit (flip a never-opened writer to
//      complete; flip a gate to n/a) and a deleted/corrupt journal (head present) must REFUSE
//      with a typed reason — from BOTH the in-process guard and the validator --resume-check.
//
// Hand-rolled asserts (no framework), matching the repo convention.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const schema = require('./kaola-workflow-adaptive-schema');
const validator = require('./kaola-workflow-plan-validator');
const adaptiveNode = require('./kaola-workflow-adaptive-node');

const adaptiveNodeScript = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
const validatorScript = path.join(__dirname, 'kaola-workflow-plan-validator.js');
const GIT_ISOLATION_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const LINEAGE = 'a'.repeat(64);
const OTHER_LINEAGE = 'b'.repeat(64);

let passed = 0;
const failures = [];
function check(cond, msg) { if (cond) { passed++; } else { failures.push(msg); console.error('FAIL: ' + msg); } }

function cli(args, cwd, input) {
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_')));
  return spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', timeout: 120000,
    ...(input != null ? { input } : {}),
    env: { ...baseEnv, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' },
  });
}
function lastJson(result) {
  const lines = String(result.stdout || '').trim().split('\n').filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return { __unparsed: result.stdout, __stderr: result.stderr, __status: result.status }; }
}
function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
}
function initGitRepo(tmp) {
  git(tmp, 'init', '-b', 'main');
  git(tmp, 'config', 'user.email', 'test@example.com');
  git(tmp, 'config', 'user.name', 'Test User');
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  git(tmp, 'add', 'README.md');
  git(tmp, 'commit', '-m', 'init');
}

const PLAN_BODY = [
  '# Workflow Plan — issue #777', '', '## Meta', 'plan_form: spine', 'labels: enhancement', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| writer | tdd-guide | — | lib/impl.js | 1 | sequence |',
  '| reviewer | code-reviewer | writer | — | 1 | sequence |',
  '| finalize | finalize | reviewer | — | 1 | sequence |', '',
  '## Node Ledger', '', '| id | status |', '|---|---|',
  '| writer | pending |', '| reviewer | pending |', '| finalize | pending |', '',
].join('\n');

// Stamp a plan_hash marker (the v1 manual-freeze the walkthrough uses via
// stampVerifiedLegacyPlan) — a legacy spine plan freezes without the schema-2 gate wall,
// which is orthogonal to the ledger-chain machinery under test.
function stampPlan(body) {
  const hash = validator.computePlanHash(body);
  return body.replace('# Workflow Plan — issue #777',
    '# Workflow Plan — issue #777\n\n<!-- plan_hash: ' + hash + ' -->');
}

function writeState(projectDir, lineage) {
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
    '# Workflow State', '', '## Project', 'name: issue-777', 'status: active',
    'epoch_schema_version: 2',
    'epoch_lineage_id: ' + (lineage || LINEAGE),
    'claim_identity_digest: ' + 'c'.repeat(64),
    'claim_root_base_digest: ' + 'd'.repeat(64), '',
  ].join('\n'));
}

// ===========================================================================
// PART A — UNIT: the write choke-point wrapper over the four multi-row shapes +
// genesis + no-op, with the chain ACTIVE. Proves ONE entry per WRITE regardless of
// how many rows flip, and green verification after each (the anti-wedge property).
// ===========================================================================
function unitMultiRowWrapper() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-777u-')));
  try {
    const projectDir = path.join(tmp, 'kaola-workflow', 'issue-777');
    fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
    const planPath = path.join(projectDir, 'workflow-plan.md');
    const cacheDir = path.join(projectDir, '.cache');
    writeState(projectDir, LINEAGE);

    const hash = validator.computePlanHash(PLAN_BODY);
    const frozen = PLAN_BODY.replace('# Workflow Plan — issue #777', '# Workflow Plan — issue #777\n\n<!-- plan_hash: ' + hash + ' -->');
    fs.writeFileSync(planPath, frozen);

    const readFile = p => fs.readFileSync(p, 'utf8');
    const rawWrite = (p, c) => schema.writeFileAtomicReplace(p, c);
    const mkWrap = subcommand => adaptiveNode.makeLedgerChainWriteFile(rawWrite, { planPath, statePath: path.join(projectDir, 'workflow-state.md'), cacheDir, readFile, subcommand });

    const readJournal = () => JSON.parse(fs.readFileSync(path.join(cacheDir, schema.LEDGER_CHAIN_JOURNAL_NAME), 'utf8'));
    const verify = () => adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    const setStatus = (content, id, st) => content.replace(
      new RegExp('\\| ' + id + ' \\| [a-z_/]+ \\|'), '| ' + id + ' | ' + st + ' |');

    // (1) GENESIS: first ledger transition (open writer). One write => genesis snapshot +
    //     the transition entry; head stamped; verify green.
    let cur = readFile(planPath);
    let next = setStatus(cur, 'writer', 'in_progress');
    mkWrap('open-next')(planPath, next);
    let j = readJournal();
    check(j.entries.length === 2 && j.entries[0].genesis === true && j.entries[1].genesis === false,
      'A1 genesis: first transition writes [genesis, transition], got ' + j.entries.length + ' entries');
    check(j.entries[0].post_ledger_digest === schema.ledgerChainMapDigest(cur),
      'A1 genesis snapshots the PRE-transition ledger (not forged history)');
    check(schema.ledgerChainHeadFromContent(readFile(planPath)) === j.entries[1].entry_digest,
      'A1 head stamped == last entry digest');
    check(verify().ok === true, 'A1 verify green after genesis');
    check(validator.computePlanHash(readFile(planPath)) === hash, 'A1 head stamp does NOT move plan_hash');

    // (2) appendLedgerRows shape (expand-open): add THREE new rows absent->pending in ONE write.
    cur = readFile(planPath);
    next = cur.replace('| finalize | pending |',
      '| finalize | pending |\n| u1 | pending |\n| u2 | pending |\n| u3 | pending |');
    mkWrap('expand-open')(planPath, next);
    j = readJournal();
    let last = j.entries[j.entries.length - 1];
    check(j.entries.length === 3 && last.deltas.length === 3 && last.deltas.every(d => d.from === null && d.to === 'pending'),
      'A2 appendLedgerRows: 3 added rows => ONE entry with 3 absent->pending deltas, got ' + JSON.stringify(last.deltas));
    check(verify().ok === true, 'A2 verify green after multi-row append');

    // (3) open-ready Phase 2 shape: flip THREE rows pending->in_progress in ONE write.
    cur = readFile(planPath);
    next = setStatus(setStatus(setStatus(cur, 'u1', 'in_progress'), 'u2', 'in_progress'), 'u3', 'in_progress');
    mkWrap('open-ready')(planPath, next);
    j = readJournal();
    last = j.entries[j.entries.length - 1];
    check(j.entries.length === 4 && last.deltas.length === 3 && last.deltas.every(d => d.to === 'in_progress'),
      'A3 open-ready Phase 2: 3 rows flipped in one write => ONE entry, 3 deltas, got ' + JSON.stringify(last.deltas));
    check(verify().ok === true, 'A3 verify green after multi-row open');

    // (4) foldSelectorArms shape: flip several in_progress arms -> n/a in ONE write.
    cur = readFile(planPath);
    next = setStatus(setStatus(cur, 'u2', 'n/a'), 'u3', 'n/a');
    mkWrap('close-and-open-next')(planPath, next);
    j = readJournal();
    last = j.entries[j.entries.length - 1];
    check(j.entries.length === 5 && last.deltas.length === 2 && last.deltas.every(d => d.to === 'n/a'),
      'A4 foldSelectorArms: several arms -> n/a in one write => ONE entry, got ' + JSON.stringify(last.deltas));
    check(verify().ok === true, 'A4 verify green after n/a fold');

    // (5) reactivate/repair reset shape: flip several complete/in_progress rows -> pending in ONE write.
    cur = setStatus(readFile(planPath), 'u1', 'complete');
    mkWrap('close-node')(planPath, cur); // land u1 complete first (single-row)
    cur = readFile(planPath);
    next = setStatus(setStatus(cur, 'u1', 'pending'), 'writer', 'pending');
    mkWrap('repair-node')(planPath, next);
    j = readJournal();
    last = j.entries[j.entries.length - 1];
    check(last.deltas.length === 2 && last.deltas.every(d => d.to === 'pending'),
      'A5 reactivate/repair: multi-row reset -> pending in one write => ONE entry, got ' + JSON.stringify(last.deltas));
    check(verify().ok === true, 'A5 verify green after multi-row reset');

    // (6) NO-OP write (ledger unchanged): appends NO entry; head preserved; verify green.
    const beforeLen = readJournal().entries.length;
    const headBefore = schema.ledgerChainHeadFromContent(readFile(planPath));
    // rewrite identical ledger but with a stale in-memory head to prove the wrapper re-stamps
    // the committed head rather than corrupting it backwards.
    const staleHeadContent = schema.stampLedgerChainHead(readFile(planPath), '9'.repeat(64));
    mkWrap('close-node')(planPath, staleHeadContent);
    check(readJournal().entries.length === beforeLen, 'A6 no-op ledger write appends NO chain entry');
    check(schema.ledgerChainHeadFromContent(readFile(planPath)) === headBefore, 'A6 no-op write preserves the committed head (no backward corruption)');
    check(verify().ok === true, 'A6 verify green after no-op');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ===========================================================================
// PART B — UNIT: vacuous-detection guard. From an honest head+journal, tamper the ledger
// and delete the journal; the in-process guard helper and the kernel verifier must REFUSE.
// ===========================================================================
function unitTamperDetection() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-777t-')));
  try {
    const projectDir = path.join(tmp, 'kaola-workflow', 'issue-777');
    fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
    const planPath = path.join(projectDir, 'workflow-plan.md');
    const cacheDir = path.join(projectDir, '.cache');
    const journalPath = path.join(cacheDir, schema.LEDGER_CHAIN_JOURNAL_NAME);
    writeState(projectDir, LINEAGE);
    const readFile = p => fs.readFileSync(p, 'utf8');
    const rawWrite = (p, c) => schema.writeFileAtomicReplace(p, c);

    const hash = validator.computePlanHash(PLAN_BODY);
    fs.writeFileSync(planPath, PLAN_BODY.replace('# Workflow Plan — issue #777', '# Workflow Plan — issue #777\n\n<!-- plan_hash: ' + hash + ' -->'));
    // Build an honest head+journal: open writer, close writer + open reviewer.
    adaptiveNode.makeLedgerChainWriteFile(rawWrite, { planPath, statePath: path.join(projectDir, 'workflow-state.md'), cacheDir, readFile, subcommand: 'open-next' })(
      planPath, readFile(planPath).replace('| writer | pending |', '| writer | in_progress |'));
    adaptiveNode.makeLedgerChainWriteFile(rawWrite, { planPath, statePath: path.join(projectDir, 'workflow-state.md'), cacheDir, readFile, subcommand: 'close-and-open-next' })(
      planPath, readFile(planPath).replace('| writer | in_progress |', '| writer | complete |').replace('| reviewer | pending |', '| reviewer | in_progress |'));

    const honestPlan = readFile(planPath);
    const honestJournal = readFile(journalPath);
    check(adaptiveNode.verifyLedgerChainForPlan(planPath, readFile).ok === true, 'B0 honest state verifies green');

    // TAMPER 1: flip a never-opened writer (finalize) pending -> complete.
    fs.writeFileSync(planPath, honestPlan.replace('| finalize | pending |', '| finalize | complete |'));
    let r = adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    check(r.ok === false && r.reason === 'ledger_chain_ledger_mismatch',
      'B1 flip never-opened writer -> complete REFUSES (ledger_chain_ledger_mismatch), got ' + JSON.stringify(r));

    // TAMPER 2: flip a gate (reviewer) in_progress -> n/a.
    fs.writeFileSync(planPath, honestPlan.replace('| reviewer | in_progress |', '| reviewer | n/a |'));
    r = adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    check(r.ok === false && r.reason === 'ledger_chain_ledger_mismatch',
      'B2 flip gate -> n/a REFUSES (ledger_chain_ledger_mismatch), got ' + JSON.stringify(r));

    // TAMPER 3: restore the honest plan, DELETE the journal (head still present).
    fs.writeFileSync(planPath, honestPlan);
    fs.unlinkSync(journalPath);
    r = adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    check(r.ok === false && r.reason === 'ledger_chain_journal_missing',
      'B3 head present + journal deleted REFUSES (ledger_chain_journal_missing) — deleting the journal is not a bypass, got ' + JSON.stringify(r));

    // TAMPER 4: corrupt the journal (truncate an entry digest).
    fs.writeFileSync(journalPath, honestJournal.replace(/"entry_digest": "[0-9a-f]{4}/, '"entry_digest": "0000'));
    r = adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    check(r.ok === false && /ledger_chain_/.test(String(r.reason)),
      'B4 corrupt journal entry_digest REFUSES, got ' + JSON.stringify(r));

    // TAMPER 5: wrong-epoch journal (lineage swap) — a journal from another epoch cannot vouch.
    fs.writeFileSync(journalPath, honestJournal.replace(new RegExp(LINEAGE, 'g'), OTHER_LINEAGE));
    r = adaptiveNode.verifyLedgerChainForPlan(planPath, readFile);
    check(r.ok === false, 'B5 wrong-epoch journal REFUSES, got ' + JSON.stringify(r));

    // MIGRATION: a headless plan (chain not in force) PASSES untouched.
    fs.writeFileSync(planPath, PLAN_BODY); // no plan_hash, no head
    check(adaptiveNode.verifyLedgerChainForPlan(planPath, readFile).ok === true,
      'B6 migration: a headless plan PASSES (not in force)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ===========================================================================
// PART C — UNIT: validator revalidateForResume honours the chain via the injected
// readCache seam (content-pure), and the freeze path RESETS the head.
// ===========================================================================
function unitResumeSeamAndFreezeReset() {
  const hash = validator.computePlanHash(PLAN_BODY);
  const frozen = PLAN_BODY.replace('# Workflow Plan — issue #777', '# Workflow Plan — issue #777\n\n<!-- plan_hash: ' + hash + ' -->');
  const opened = frozen.replace('| writer | pending |', '| writer | in_progress |');
  const oldMap = schema.ledgerChainStatusMap(frozen);
  const newMap = schema.ledgerChainStatusMap(opened);
  const ext = schema.extendLedgerChain({
    oldHead: null, oldJournal: null, epochLineageId: LINEAGE, planHash: hash, subcommand: 'open-next',
    oldLedgerDigest: schema.ledgerChainMapDigest(oldMap), newLedgerDigest: schema.ledgerChainMapDigest(newMap),
    deltas: schema.ledgerChainDeltas(oldMap, newMap),
    oldExpansionDigest: schema.ledgerChainExpansionDigest(frozen), newExpansionDigest: schema.ledgerChainExpansionDigest(opened),
  });
  const headPlan = schema.stampLedgerChainHead(opened, ext.head);
  const journal = { schema_version: 1, epoch_lineage_id: LINEAGE, entries: ext.entries };
  const readCacheGood = name => name === schema.LEDGER_CHAIN_JOURNAL_NAME ? JSON.stringify(journal) : null;

  // honest resume passes
  let r = validator.revalidateForResume(headPlan, { readCache: readCacheGood, epochLineageId: LINEAGE });
  check(r.ok === true, 'C1 revalidateForResume passes an honest head+journal, got ' + JSON.stringify(r));
  // tamper: flip a ledger row -> refuse
  const tampered = headPlan.replace('| reviewer | pending |', '| reviewer | complete |');
  r = validator.revalidateForResume(tampered, { readCache: readCacheGood, epochLineageId: LINEAGE });
  check(r.ok === false && r.reasonCode === 'ledger_chain_ledger_mismatch',
    'C2 revalidateForResume REFUSES a tampered ledger, got ' + JSON.stringify(r));
  // journal missing -> refuse
  r = validator.revalidateForResume(headPlan, { readCache: () => null, epochLineageId: LINEAGE });
  check(r.ok === false && r.reasonCode === 'ledger_chain_journal_missing',
    'C3 revalidateForResume REFUSES when the journal is missing, got ' + JSON.stringify(r));
  // headless plan -> passes (migration), no readCache needed
  r = validator.revalidateForResume(frozen, {});
  check(r.ok === true, 'C4 revalidateForResume passes a headless plan (migration)');

  // FREEZE RESET: freezePlan strips a live head so a mid-run --freeze re-adopts on next transition.
  check(schema.ledgerChainHeadFromContent(validator.freezePlan(headPlan, {}).content || '') === null,
    'C5 freezePlan strips the ledger-chain head (chain-reset), and the freeze is hash-neutral');
}

// ===========================================================================
// PART D — END-TO-END through the real CLI (git + freeze). Genesis, honest linear
// advance, and tamper refusal from BOTH the guard and --resume-check, plus the
// laundering backstop on the integrity-less close-and-open-next.
// ===========================================================================
function e2eHonestAndTamper() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-777e-')));
  try {
    initGitRepo(tmp);
    const project = 'issue-777';
    const projectDir = path.join(tmp, 'kaola-workflow', project);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'impl.js'), 'module.exports = 0;\n');
    const planPath = path.join(projectDir, 'workflow-plan.md');
    const journalPath = path.join(projectDir, '.cache', schema.LEDGER_CHAIN_JOURNAL_NAME);
    fs.writeFileSync(planPath, stampPlan(PLAN_BODY));
    writeState(projectDir, LINEAGE);
    check(lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp)).ok === true, 'D0 stamped plan resume-checks clean');
    git(tmp, 'add', '-A'); git(tmp, 'commit', '-m', 'freeze');

    // GENESIS via a real open-next.
    const open1 = lastJson(cli([adaptiveNodeScript, 'open-next', '--project', project, '--json'], tmp));
    check(open1.result !== 'refuse', 'D1 open-next (genesis) honest, got ' + JSON.stringify(open1));
    check(fs.existsSync(journalPath), 'D1 journal appears after the first transition');
    check(schema.ledgerChainHeadFromContent(fs.readFileSync(planPath, 'utf8')) != null, 'D1 head stamped into the plan');
    let j = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    check(j.entries[0].genesis === true && j.entries.length === 2, 'D1 genesis + transition recorded');

    // honest resume-check passes.
    let rc = lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp));
    check(rc.ok === true, 'D2 honest --resume-check passes, got ' + JSON.stringify(rc));

    // honest linear advance: record evidence + close writer -> reviewer opens.
    fs.writeFileSync(path.join(tmp, 'lib', 'impl.js'), 'module.exports = 1;\n');
    cli([adaptiveNodeScript, 'record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp,
      'evidence-binding: writer ' + open1.nonce + '\nRED: writer failed before impl\nred_baseline: ' + open1.nonce + '\n');
    const close1 = lastJson(cli([adaptiveNodeScript, 'close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp));
    check(close1.result !== 'refuse' && close1.opened && close1.opened.id === 'reviewer',
      'D3 honest close-and-open-next advances writer->reviewer, got ' + JSON.stringify(close1));
    check(lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp)).ok === true, 'D3 resume-check still green after advance');

    const honestPlan = fs.readFileSync(planPath, 'utf8');
    const honestJournal = fs.readFileSync(journalPath, 'utf8');

    // TAMPER (guard): flip never-opened finalize -> complete; open-next must REFUSE.
    fs.writeFileSync(planPath, honestPlan.replace('| finalize | pending |', '| finalize | complete |'));
    let tOpen = lastJson(cli([adaptiveNodeScript, 'open-next', '--project', project, '--json'], tmp));
    check(tOpen.result === 'refuse' && tOpen.reason === 'ledger_chain_ledger_mismatch',
      'D4 guard REFUSES a tampered ledger (open-next), got ' + JSON.stringify(tOpen));
    let tRc = lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp));
    check(tRc.ok === false && tRc.reasonCode === 'ledger_chain_ledger_mismatch',
      'D4 --resume-check REFUSES a tampered ledger, got ' + JSON.stringify(tRc));

    // TAMPER (gate -> n/a).
    fs.writeFileSync(planPath, honestPlan.replace('| reviewer | in_progress |', '| reviewer | n/a |'));
    check(lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp)).reasonCode === 'ledger_chain_ledger_mismatch',
      'D5 --resume-check REFUSES a gate flipped to n/a');

    // TAMPER (journal deleted, head present).
    fs.writeFileSync(planPath, honestPlan);
    fs.unlinkSync(journalPath);
    check(lastJson(cli([validatorScript, planPath, '--resume-check', '--json'], tmp)).reasonCode === 'ledger_chain_journal_missing',
      'D6 --resume-check REFUSES when the journal is deleted (head present)');
    check(lastJson(cli([adaptiveNodeScript, 'open-next', '--project', project, '--json'], tmp)).reason === 'ledger_chain_journal_missing',
      'D6 guard REFUSES a deleted journal');

    // LAUNDERING backstop: close-and-open-next carries NO integrity layer (it must stay
    // byte-identical for the serial close), so a tamper before it is not caught by its guard —
    // the write-seam verify-before-extend is the backstop. Restore the honest state, record
    // honest reviewer evidence (so the evidence gate passes and the close REACHES its ledger
    // write), tamper the ledger out of band, then confirm the close REFUSES rather than
    // laundering the tampered ledger into a fresh chain entry.
    fs.writeFileSync(planPath, honestPlan);
    fs.writeFileSync(journalPath, honestJournal);
    cli([adaptiveNodeScript, 'record-evidence', '--project', project, '--node-id', 'reviewer', '--stdin', '--json'], tmp,
      'evidence-binding: reviewer ' + close1.opened.nonce + '\nverdict: pass\nfindings_blocking: 0\n');
    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('| finalize | pending |', '| finalize | complete |'));
    const launder = lastJson(cli([adaptiveNodeScript, 'close-and-open-next', '--project', project, '--node-id', 'reviewer', '--json'], tmp));
    check(launder.result === 'refuse' && /ledger_chain_/.test(String(launder.reason)),
      'D7 close-and-open-next (integrity-less) REFUSES rather than laundering a tamper, got ' + JSON.stringify(launder));

    // MIGRATION end-to-end: a fresh headless project resume-checks clean.
    const mtmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-777m-')));
    try {
      initGitRepo(mtmp);
      const mdir = path.join(mtmp, 'kaola-workflow', project);
      fs.mkdirSync(mdir, { recursive: true });
      const mplan = path.join(mdir, 'workflow-plan.md');
      fs.writeFileSync(mplan, stampPlan(PLAN_BODY));
      writeState(mdir, LINEAGE);
      check(lastJson(cli([validatorScript, mplan, '--resume-check', '--json'], mtmp)).ok === true,
        'D8 migration: a stamped headless plan resume-checks clean (chain not in force)');
    } finally { fs.rmSync(mtmp, { recursive: true, force: true }); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

unitMultiRowWrapper();
unitTamperDetection();
unitResumeSeamAndFreezeReset();
e2eHonestAndTamper();

if (failures.length) {
  console.error('\n' + failures.length + ' assertion(s) FAILED (' + passed + ' passed)');
  process.exit(1);
}
console.log('ledger-chain tamper-evidence: all ' + passed + ' assertions passed');
