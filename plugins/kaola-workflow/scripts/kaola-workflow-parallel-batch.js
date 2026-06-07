#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-parallel-batch.js (issue #281)
//
// The parallel-batch STATE aggregator for true parallel ready-set execution.
//
// SCOPE (blueprint §0/§9): this aggregator owns batch STATE ONLY and NEVER
// dispatches an agent. The harness's only real concurrency is the MAIN SESSION
// issuing multiple Agent() calls in one message; a script cannot spawn agents
// and a subagent cannot dispatch a subagent. The plan-run SKILL (main session)
// owns concurrent DISPATCH; this script manages the batch lifecycle so the SKILL
// can open → dispatch N → seal → join → advance. A green plan-run is NOT evidence
// of wall-clock parallelism; the unit suite proves STATE correctness only.
//
// PURE COMPOSITION over next-action.js + commit-node.js (+ plan-validator.js):
// it shells those siblings via execFileSync (mirroring adaptive-node.js:66-75)
// and never require()-and-mutates them. For ledger flips it imports the PURE
// spliceLedgerNode from adaptive-node.js (importing a pure splicer is composition;
// the mutation happens via this aggregator's OWN writeFile).
//
// Subcommands (all require --project P and --json; exit≠0 on refuse):
//   open-batch   --project P [--max N]     (MUTATES ledger + baselines + manifest)
//   seal-member  --project P --node-id N    (MUTATES ledger + manifest member)
//   seal         --project P                (MUTATES ledger + manifest)
//   join         --project P                (MUTATES parent tree + manifest)
//   status       --project P                (READ-ONLY)
//
// Manifest: kaola-workflow/{project}/.cache/active-batch.json (single active
// batch; non-hashed runtime artifact). createdAt is injected (deterministic).
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Sibling-script filename constants — the ONLY lines the forge forks rename.
// Keep each on its own clearly-named line so a port is a one-line edit.
// ---------------------------------------------------------------------------
const NEXT_ACTION = 'kaola-workflow-next-action.js';
const COMMIT_NODE = 'kaola-workflow-commit-node.js';
const VALIDATOR   = 'kaola-workflow-plan-validator.js';
const ADAPTIVE_NODE = './kaola-workflow-adaptive-node';
const PLAN_VALIDATOR = './kaola-workflow-plan-validator';
const CLASSIFIER     = './kaola-workflow-classifier';

const nextActionPath = path.join(__dirname, NEXT_ACTION);
const commitNodePath = path.join(__dirname, COMMIT_NODE);
const validatorPath  = path.join(__dirname, VALIDATOR);

// ---------------------------------------------------------------------------
// BATCH_STATES — closed batch lifecycle vocabulary (blueprint D3). Lives HERE
// (NOT in adaptive-schema.js — no node in the frozen plan may write the schema).
// ---------------------------------------------------------------------------
const BATCH_STATES = Object.freeze(['open', 'dispatched', 'sealed', 'joining', 'joined']);

const MANIFEST_NAME = 'active-batch.json';

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  try { return JSON.parse(str || ''); } catch (_) { return {}; }
}

// ---------------------------------------------------------------------------
// getRoot — resolve the user-repo root via git rev-parse (cwd fallback).
// ---------------------------------------------------------------------------
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// shellNode — thin seam: execute a Node.js script and return {exitCode,...json}.
// Fail-closed: exitCode 1 + {} on throw with no stdout. (Mirrors adaptive-node.js.)
// ---------------------------------------------------------------------------
function shellNode(scriptPath, args) {
  let stdout;
  try {
    stdout = execFileSync('node', [scriptPath, ...(args || [])], { encoding: 'utf8' });
    return { exitCode: 0, ...safeJsonParse(stdout) };
  } catch (err) {
    const status = (err.status == null) ? 1 : err.status;
    return { exitCode: status, ...safeJsonParse(err.stdout) };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — composition over plan-validator / classifier (read-only require).
// ---------------------------------------------------------------------------

// parseLedgerMap — read the ## Node Ledger into a Map<id,status>. Composes the
// validator's parseLedger (pure/read-only); [] on any failure (fail-closed).
function parseLedgerMap(content) {
  try {
    const { parseLedger } = require(PLAN_VALIDATOR);
    return parseLedger(content);
  } catch (_) {
    return new Map();
  }
}

// parseWriteSet — structural declared_write_set parse, reusing the classifier's
// parseWriteSetCell so this re-check shares freeze-time semantics (comma/space
// split, the — / - empty marker). Returns a Set of normalized paths.
function parseWriteSet(cell) {
  try {
    const { parseWriteSetCell } = require(CLASSIFIER);
    return parseWriteSetCell(cell);
  } catch (_) {
    const set = new Set();
    const raw = String(cell || '').trim();
    if (!raw || raw === '—' || raw === '-') return set;
    for (const tok of raw.split(/[\s,]+/)) if (tok) set.add(tok);
    return set;
  }
}

// ---------------------------------------------------------------------------
// deriveReadyPending — readySet members whose OWN ledger status === 'pending'.
//
// next-action.js does not (yet) return readyPending; we derive it locally from
// its readySet (which excludes terminal nodes but INCLUDES in_progress) and the
// ledger statuses. This is the openable frontier (blueprint §1/D1).
// ---------------------------------------------------------------------------
function deriveReadyPending(readySet, ledger) {
  const st = id => (ledger && ledger.get(id)) || 'pending';
  return (readySet || []).filter(n => st(n.id) === 'pending');
}

// ---------------------------------------------------------------------------
// classifyBatchKind — decide the batch kind and member subset (blueprint §2/D5).
//
//   all read-only (empty write sets) → { kind:'read_only', members:<all> }
//   all write-role (non-empty)       → { kind:'write_role', members:<all> }
//   MIXED                            → { kind:'read_only', members:<read-only subset> }
//                                       (open the read-only subset first; NOT a refuse)
// ---------------------------------------------------------------------------
function classifyBatchKind(members) {
  const list = members || [];
  const isReadOnly = m => parseWriteSet(m.declared_write_set).size === 0;
  const readOnly = list.filter(isReadOnly);
  const writeRole = list.filter(m => !isReadOnly(m));

  if (writeRole.length === 0) {
    return { kind: 'read_only', members: readOnly };
  }
  if (readOnly.length === 0) {
    return { kind: 'write_role', members: writeRole };
  }
  // Mixed: open the zero-blast-radius read-only subset first.
  return { kind: 'read_only', members: readOnly };
}

// ---------------------------------------------------------------------------
// checkDisjoint — re-confirm pairwise-disjoint declared write sets, reusing the
// classifier's disjointWriteSets so this re-check cannot diverge from freeze-time
// semantics. verdict 'red' (exact/coarse overlap) → NOT disjoint (fail-closed).
// ---------------------------------------------------------------------------
function checkDisjoint(members) {
  const sets = (members || []).map(m => parseWriteSet(m.declared_write_set));
  let dj;
  try {
    const { disjointWriteSets } = require(CLASSIFIER);
    dj = disjointWriteSets(sets);
  } catch (_) {
    dj = { verdict: 'green', reasoning: 'classifier unavailable' };
  }
  return { disjoint: dj.verdict !== 'red', verdict: dj.verdict, reasoning: dj.reasoning };
}

// ---------------------------------------------------------------------------
// capMembers — clamp to min(members.length, FANOUT_CAP, --max). Document order.
// ---------------------------------------------------------------------------
function capMembers(members, opts) {
  const list = members || [];
  const fanoutCap = (opts && Number.isInteger(opts.fanoutCap) && opts.fanoutCap >= 1)
    ? opts.fanoutCap : 4;
  let cap = Math.min(list.length, fanoutCap);
  if (opts && Number.isInteger(opts.max) && opts.max >= 1) {
    cap = Math.min(cap, opts.max);
  }
  return list.slice(0, cap);
}

// ---------------------------------------------------------------------------
// crossCheckStatus — legality gate (blueprint §3, AC#5/#6). Multiple in_progress
// ledger rows are LEGAL ONLY with a valid active manifest whose member set EXACTLY
// equals them; else the orphan condition.
//
//   ≤1 in_progress + no manifest          → valid (legacy single-node path)
//   ≥1 in_progress + manifest matches set  → valid batch
//   >1 in_progress + no manifest/mismatch  → invalid, orphan
// ---------------------------------------------------------------------------
function crossCheckStatus(manifest, inProgressIds) {
  const ip = (inProgressIds || []).slice().sort();

  if (!manifest) {
    // No manifest: ≤1 in_progress is the legacy serial path (valid); >1 is orphan.
    if (ip.length <= 1) {
      return { valid: true, orphan: false, reason: ip.length === 1 ? 'single_in_progress' : 'idle' };
    }
    return { valid: false, orphan: true, reason: 'orphan_multi_in_progress' };
  }

  const memberIds = (manifest.members || []).map(m => m.id).slice().sort();
  const setsEqual = memberIds.length === ip.length && memberIds.every((id, i) => id === ip[i]);

  if (setsEqual) {
    return { valid: true, orphan: false, reason: 'valid_batch' };
  }
  return { valid: false, orphan: true, reason: 'orphan_member_set_mismatch' };
}

// ---------------------------------------------------------------------------
// allMembersTerminal — true when every manifest member's ledger row is terminal.
// ---------------------------------------------------------------------------
function allMembersTerminal(manifest, ledger) {
  const TERMINAL = new Set(['complete', 'n/a']);
  return (manifest.members || []).every(m => TERMINAL.has((ledger.get(m.id) || 'pending')));
}

// ---------------------------------------------------------------------------
// readManifest — parse the manifest, or null if absent/corrupt.
// ---------------------------------------------------------------------------
function readManifest(manifestPath, cacheExists, readFile) {
  if (cacheExists && !cacheExists(manifestPath)) return null;
  let raw;
  try { raw = readFile(manifestPath); } catch (_) { return null; }
  const parsed = safeJsonParse(raw);
  return (parsed && parsed.members) ? parsed : null;
}

// ---------------------------------------------------------------------------
// listInProgress — enumerate ALL in_progress ledger row ids (blueprint §3).
// ---------------------------------------------------------------------------
function listInProgress(ledger) {
  const ids = [];
  for (const [id, st] of ledger) {
    if (st === 'in_progress') ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// runOpenBatch — MUTATES ledger + baselines + manifest.
//
// 1. shell next-action; readyPending = openable frontier.
// 2. empty frontier → defer ({result:'ok',allDone,opened:[]}); no manifest.
// 3. classify kind + member subset (mixed → read-only subset); write_role →
//    re-confirm disjoint (fail-closed not_disjoint).
// 4. cap at min(frontier, FANOUT_CAP, --max).
// 5. flip each member ledger row → in_progress (allowFrom ['pending']); write plan.
// 6. shell commit-node --node-id id --start per member (idempotent baseline).
// 7. write manifest state:'open' LAST.
// ---------------------------------------------------------------------------
function runOpenBatch(opts) {
  const { planPath, manifestPath, max, fanoutCap, shell, readFile, writeFile, mkdirp, now } = opts;

  // Pull spliceLedgerNode (pure import — composition).
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  const nextAction = shell(nextActionPath, [planPath, '--json']);
  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }
  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: [] };
  }

  let planContent = readFile(planPath);
  const ledger = parseLedgerMap(planContent);

  const frontier = deriveReadyPending(nextAction.readySet || [], ledger);
  if (frontier.length === 0) {
    // No openable (own-pending) frontier — defer to the legacy single-node loop.
    return { result: 'ok', allDone: false, opened: [] };
  }

  // Classify; mixed frontier → the read-only subset.
  const classified = classifyBatchKind(frontier);
  const kind = classified.kind;

  // Re-confirm disjointness for write-role batches (fail-closed).
  if (kind === 'write_role') {
    const dj = checkDisjoint(classified.members);
    if (!dj.disjoint) {
      return { result: 'refuse', reason: 'not_disjoint', detail: dj.reasoning };
    }
  }

  // Cap the member set.
  const capped = capMembers(classified.members, { fanoutCap, max });

  // Flip each member's ledger row → in_progress (allowFrom ['pending']).
  for (const m of capped) {
    const spliced = spliceLedgerNode(planContent, m.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) {
      return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: m.id };
    }
    if (spliced.changed) planContent = spliced.content;
  }
  writeFile(planPath, planContent);

  // Record one baseline per member (idempotent).
  const members = [];
  for (const m of capped) {
    const baseline = shell(commitNodePath, [planPath, '--node-id', m.id, '--start', '--json']);
    const baselineOk = baseline.exitCode === 0 && baseline.result === 'ok';
    if (!baselineOk) {
      return { result: 'refuse', reason: 'baseline_failed', nodeId: m.id, baselineResult: baseline };
    }
    members.push({
      id: m.id,
      role: m.role,
      model: m.model,
      declared_write_set: m.declared_write_set,
      kind,
      baseline: 'recorded',
      worktreePath: null,
      sealed: false,
      joined: false,
    });
  }

  // Write the manifest LAST (state:'open').
  const batchId = 'batch-' + (capped.map(m => m.id).join('-'));
  const manifest = {
    batchId,
    state: 'open',
    kind,
    members,
    createdAt: (typeof now === 'function') ? now() : new Date(0).toISOString(),
  };
  if (mkdirp) mkdirp(path.dirname(manifestPath));
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    result: 'ok',
    batchId,
    state: 'open',
    kind,
    members: members.map(m => ({
      id: m.id, role: m.role, model: m.model,
      declared_write_set: m.declared_write_set, kind: m.kind,
      baseline: m.baseline, worktreePath: m.worktreePath,
    })),
    allDone: false,
  };
}

// ---------------------------------------------------------------------------
// sealOne — INTERNAL: barrier + close + manifest member flip for one member.
// Returns { ok, reason?, barrierOut?, manifest, planContent }. Does NOT advance.
// ---------------------------------------------------------------------------
function sealOne(member, ctx) {
  const { planPath, shell, readFile } = ctx;
  let { manifest, planContent } = ctx;
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  // Per-node barrier (unchanged commit-node --node-id N).
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', member.id, '--json']);
  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    return { ok: false, reason: 'barrier_failed', barrierOut, manifest, planContent };
  }

  // Close: ledger row → complete (allowFrom ['in_progress','n/a']).
  const closeResult = spliceLedgerNode(planContent, member.id, 'complete', { allowFrom: ['in_progress', 'n/a'] });
  if (closeResult.changed) planContent = closeResult.content;

  // Append a compliance row (mirrors adaptive-node close path).
  let evidence = '';
  try { evidence = readFile(path.join(ctx.cacheDir, member.id + '.md')); } catch (_) {}
  const { spliceComplianceRow } = (function () {
    // spliceComplianceRow is not exported; replicate the canonical append shape inline.
    return {
      spliceComplianceRow: (content, role, nodeId, summary) => appendComplianceRow(content, role, nodeId, summary),
    };
  })();
  const role = member.role || 'unknown';
  const summary = evidence ? evidence.split('\n')[0].slice(0, 80) : 'evidence present';
  planContent = spliceComplianceRow(planContent, role, member.id, summary);

  // Flip manifest member sealed:true.
  manifest = {
    ...manifest,
    members: manifest.members.map(m => m.id === member.id ? { ...m, sealed: true } : m),
  };

  return { ok: true, barrierOut, manifest, planContent };
}

// ---------------------------------------------------------------------------
// appendComplianceRow — append a row to ## Required Agent Compliance (creating the
// section below ## Node Ledger if absent). Bare-role string for review roles.
// ---------------------------------------------------------------------------
function appendComplianceRow(content, role, nodeId, summary) {
  const SECTION = '## Required Agent Compliance';
  const HEADER_ROW = '| Requirement | Status | Evidence | Skip Reason |';
  const SEPARATOR  = '|-------------|--------|----------|-------------|';
  const bareRoles = ['code-reviewer', 'security-reviewer'];
  const requirementCell = bareRoles.includes(role) ? role : role + ' (' + nodeId + ')';
  const newRow = '| ' + requirementCell + ' | subagent-invoked | ' + summary + ' | |';

  if (content.includes(SECTION)) {
    const sectionIdx = content.indexOf('\n' + SECTION);
    if (sectionIdx < 0) return content.trimEnd() + '\n' + newRow + '\n';
    const nextSection = content.indexOf('\n## ', sectionIdx + 1);
    if (nextSection >= 0) return content.slice(0, nextSection) + '\n' + newRow + content.slice(nextSection);
    return content.trimEnd() + '\n' + newRow + '\n';
  }

  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = content.indexOf(ledgerMarker);
  const afterLedger = ledgerIdx >= 0 ? content.indexOf('\n## ', ledgerIdx + 1) : -1;
  const newSection = '\n' + SECTION + '\n\n' + HEADER_ROW + '\n' + SEPARATOR + '\n' + newRow + '\n';
  if (afterLedger >= 0) return content.slice(0, afterLedger) + newSection + content.slice(afterLedger);
  return content.trimEnd() + newSection;
}

// ---------------------------------------------------------------------------
// runSealMember — MUTATES ledger + manifest member. Seals ONE member; does NOT
// advance. Refuses on barrier fail (no close). (blueprint §2 seal-member.)
// ---------------------------------------------------------------------------
function runSealMember(opts) {
  const { planPath, cacheDir, manifestPath, nodeId, shell, readFile, writeFile, cacheExists } = opts;

  const manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }
  const member = manifest.members.find(m => m.id === nodeId);
  if (!member) {
    return { result: 'refuse', reason: 'not_a_member', nodeId };
  }

  let planContent = readFile(planPath);
  const sealed = sealOne(member, { planPath, cacheDir, shell, readFile, manifest, planContent });
  if (!sealed.ok) {
    return { result: 'refuse', reason: sealed.reason, nodeId, barrierOut: sealed.barrierOut };
  }

  // Persist plan (ledger + compliance) then manifest.
  writeFile(planPath, sealed.planContent);
  writeFile(manifestPath, JSON.stringify(sealed.manifest, null, 2));

  return { result: 'ok', sealed: nodeId, state: sealed.manifest.state };
}

// ---------------------------------------------------------------------------
// runSeal — MUTATES ledger + manifest. Seal every still-open member in document
// order; manifest → 'sealed' only when ALL members complete/n/a. (blueprint §2.)
// ---------------------------------------------------------------------------
function runSeal(opts) {
  const { planPath, cacheDir, manifestPath, shell, readFile, writeFile, cacheExists } = opts;

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }

  let planContent = readFile(planPath);
  const sealedIds = [];
  const failures = [];

  for (const member of manifest.members) {
    if (member.sealed) { sealedIds.push(member.id); continue; }
    const res = sealOne(member, { planPath, cacheDir, shell, readFile, manifest, planContent });
    if (!res.ok) {
      failures.push({ id: member.id, reason: res.reason });
      continue;
    }
    manifest = res.manifest;
    planContent = res.planContent;
    sealedIds.push(member.id);
  }

  writeFile(planPath, planContent);

  // Transition manifest → 'sealed' only when ALL members are terminal in the ledger.
  const ledger = parseLedgerMap(planContent);
  const pending = manifest.members.filter(m => !m.sealed).map(m => m.id);
  const allTerminal = allMembersTerminal(manifest, ledger) && failures.length === 0;
  if (allTerminal) {
    manifest = { ...manifest, state: 'sealed' };
  }
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    result: failures.length === 0 ? 'ok' : 'refuse',
    state: manifest.state,
    sealed: sealedIds,
    pending,
    failures,
  };
}

// ---------------------------------------------------------------------------
// runJoin — MUTATES parent tree + manifest. Precondition: manifest NOT in
// {open,dispatched} (else not_all_sealed). No-op for all-read-only. For each
// write-role member with a worktreePath, path-scoped + idempotent git checkout.
// IDEMPOTENT: a repeat call sees state {sealed,joining,joined} and returns the
// same {result:'ok',state:'joined',...}; deletion is the orchestrator's job.
// ---------------------------------------------------------------------------
function runJoin(opts) {
  const { manifestPath, shell, readFile, writeFile, cacheExists, gitCheckout } = opts;

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }

  // Precondition: refuse ONLY when not yet sealed. {sealed,joining,joined} proceed
  // (joining/joined make a repeat call idempotent — see blueprint §3).
  if (manifest.state === 'open' || manifest.state === 'dispatched') {
    return { result: 'refuse', reason: 'not_all_sealed', state: manifest.state };
  }

  const readOnlyMembers = manifest.members.filter(m => parseWriteSet(m.declared_write_set).size === 0);
  const writeRoleMembers = manifest.members.filter(m => parseWriteSet(m.declared_write_set).size > 0);

  const skipped_read_only = readOnlyMembers.map(m => m.id);
  const joined = [];

  // Mark 'joining' (crash-safe) before touching the parent tree.
  if (writeRoleMembers.length > 0 && manifest.state !== 'joined') {
    manifest = { ...manifest, state: 'joining' };
    writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  for (const m of writeRoleMembers) {
    if (m.joined) { joined.push(m.id); continue; } // idempotent: already merged
    if (m.worktreePath && typeof gitCheckout === 'function') {
      const paths = Array.from(parseWriteSet(m.declared_write_set));
      const res = gitCheckout(m.worktreePath, paths);
      if (!res || res.ok !== true) {
        // Leave manifest 'joining'; resume re-runs only the unmerged remainder.
        return { result: 'refuse', reason: 'join_failed', nodeId: m.id, detail: res && res.detail };
      }
    }
    manifest = { ...manifest, members: manifest.members.map(x => x.id === m.id ? { ...x, joined: true } : x) };
    joined.push(m.id);
  }

  // All members merged (or none to merge) → state 'joined'.
  manifest = { ...manifest, state: 'joined' };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return { result: 'ok', state: 'joined', joined, skipped_read_only };
}

// ---------------------------------------------------------------------------
// runStatus — READ-ONLY. Returns the parsed manifest (or {active:false}) plus a
// cross-check of manifest members vs ledger in_progress rows. Never mutates.
// ---------------------------------------------------------------------------
function runStatus(opts) {
  const { planPath, manifestPath, readFile, cacheExists } = opts;

  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}
  const ledger = parseLedgerMap(planContent);
  const inProgress = listInProgress(ledger);

  const manifest = readManifest(manifestPath, cacheExists, readFile);
  const crossCheck = crossCheckStatus(manifest, inProgress);

  if (!manifest) {
    return { result: 'ok', active: false, inProgress, crossCheck };
  }

  return {
    result: 'ok',
    active: true,
    batchId: manifest.batchId,
    state: manifest.state,
    kind: manifest.kind,
    members: (manifest.members || []).map(m => ({
      id: m.id,
      sealed: !!m.sealed,
      joined: !!m.joined,
      ledgerStatus: ledger.get(m.id) || 'pending',
    })),
    inProgress,
    crossCheck,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-parallel-batch.js <subcommand> --project P --json [options]\n' +
      '  open-batch   --project P [--max N]\n' +
      '  seal-member  --project P --node-id N\n' +
      '  seal         --project P\n' +
      '  join         --project P\n' +
      '  status       --project P\n'
    );
    return;
  }

  const subcommand = args[0];
  const hasJson    = args.includes('--json');
  const projectIdx = args.indexOf('--project');
  const nodeIdIdx  = args.indexOf('--node-id');
  const maxIdx     = args.indexOf('--max');

  if (!hasJson) {
    process.stdout.write('{"result":"refuse","errors":["--json is required"]}\n');
    process.exitCode = 1;
    return;
  }
  if (!(projectIdx >= 0 && projectIdx + 1 < args.length)) {
    process.stdout.write(JSON.stringify({ result: 'refuse', errors: ['--project is required'] }) + '\n');
    process.exitCode = 1;
    return;
  }

  const project = args[projectIdx + 1];
  const nodeId  = nodeIdIdx >= 0 ? args[nodeIdIdx + 1] : null;
  const maxRaw  = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : null;
  const max     = Number.isInteger(maxRaw) ? maxRaw : null;

  const repoRoot   = getRoot();
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  const planPath   = path.join(projectDir, 'workflow-plan.md');
  const statePath  = path.join(projectDir, 'workflow-state.md');
  const cacheDir   = path.join(projectDir, '.cache');
  const manifestPath = path.join(cacheDir, MANIFEST_NAME);

  const fs = require('fs');
  const { resolveFanoutCap } = (function () {
    try { return require('./kaola-workflow-adaptive-schema'); } catch (_) { return {}; }
  })();
  const fanoutCap = (typeof resolveFanoutCap === 'function') ? resolveFanoutCap(process.env) : 4;

  const io = {
    shell: (scriptPath, scriptArgs) => shellNode(scriptPath, scriptArgs),
    readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content, 'utf8'),
    cacheExists: (fpath) => fs.existsSync(fpath),
    mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
    now: () => new Date().toISOString(),
    gitCheckout: (worktreePath, paths) => {
      try {
        execFileSync('git', ['-C', projectDir, 'checkout', worktreePath, '--', ...paths], { encoding: 'utf8' });
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: String(err && err.message || err) };
      }
    },
  };

  const ctx = { planPath, statePath, cacheDir, manifestPath, project, fanoutCap, max, nodeId, ...io };

  let result;
  if (subcommand === 'open-batch') {
    result = runOpenBatch(ctx);
  } else if (subcommand === 'seal-member') {
    if (!nodeId) result = { result: 'refuse', errors: ['--node-id required for seal-member'] };
    else result = runSealMember(ctx);
  } else if (subcommand === 'seal') {
    result = runSeal(ctx);
  } else if (subcommand === 'join') {
    result = runJoin(ctx);
  } else if (subcommand === 'status') {
    result = runStatus(ctx);
  } else {
    result = { result: 'refuse', errors: ['unknown subcommand: ' + subcommand] };
  }

  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.result === 'refuse') process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  BATCH_STATES,
  deriveReadyPending,
  classifyBatchKind,
  checkDisjoint,
  capMembers,
  crossCheckStatus,
  runOpenBatch,
  runSealMember,
  runSeal,
  runJoin,
  runStatus,
  shellNode,
};
