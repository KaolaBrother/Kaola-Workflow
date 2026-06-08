#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-parallel-batch.js (issue #281)
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
const NEXT_ACTION = 'kaola-gitea-workflow-next-action.js';
const COMMIT_NODE = 'kaola-gitea-workflow-commit-node.js';
const VALIDATOR   = 'kaola-gitea-workflow-plan-validator.js';
const ADAPTIVE_NODE = './kaola-gitea-workflow-adaptive-node';
const PLAN_VALIDATOR = './kaola-gitea-workflow-plan-validator';
const CLASSIFIER     = './kaola-gitea-workflow-classifier';

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
// snapshotMember / anchorMergeRef (#292) — local gc-safe snapshot recipe.
//
// Re-implemented LOCALLY (D1): pure git, zero edition token, so the diff is
// byte-identical across all 4 ports automatically; we do NOT export the
// validator's snapshotWorktree/anchorBase internals (byte-synced ×4, would
// widen the blast radius). Mirrors validator:913-945.
//
// snapshotMember: write-tree of a member worktree's FULL landable state via an
//   out-of-repo GIT_INDEX_FILE (read-tree HEAD → add -A → write-tree). Returns
//   the tree SHA, or null on any git failure (degraded-mode trigger).
// anchorMergeRef: wrap the tree in a commit (commit-tree, explicit identity so
//   it works with git user.* unset) and pin it under a ref so `git gc` cannot
//   prune it between seal and join (#239 pattern). Returns the commit SHA.
// ---------------------------------------------------------------------------
function snapshotMember(worktreeRoot, tag) {
  const os = require('os');
  const fs = require('fs');
  const idx = path.join(os.tmpdir(), 'kw-batch-idx-' + process.pid + '-' + String(tag).replace(/[^A-Za-z0-9_-]/g, '_'));
  try { fs.unlinkSync(idx); } catch (_) {}
  try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: idx });
  try {
    try { execFileSync('git', ['-C', worktreeRoot, 'read-tree', 'HEAD'], { env, stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    execFileSync('git', ['-C', worktreeRoot, 'add', '-A'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    return execFileSync('git', ['-C', worktreeRoot, 'write-tree'], { env, encoding: 'utf8' }).trim();
  } catch (_) {
    return null;
  } finally {
    try { fs.unlinkSync(idx); } catch (_) {}
    try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  }
}
function anchorMergeRef(repoRoot, refName, tree) {
  const env = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'kaola-workflow', GIT_AUTHOR_EMAIL: 'kaola-workflow@localhost',
    GIT_COMMITTER_NAME: 'kaola-workflow', GIT_COMMITTER_EMAIL: 'kaola-workflow@localhost',
  });
  const commit = execFileSync('git', ['-C', repoRoot, 'commit-tree', tree, '-m', 'kaola-workflow batch merge ref'], { env, encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repoRoot, 'update-ref', refName, commit], { stdio: ['ignore', 'ignore', 'ignore'] });
  return commit;
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
//   ≤1 in_progress (with or without manifest) → valid (legacy single-node path)
//   ≥1 in_progress + manifest matches set      → valid batch
//   >1 in_progress + no manifest/mismatch      → invalid, orphan
//
// #293 (align): the ≤1 guard is hoisted ABOVE the manifest branch so a single
// in_progress row is legacy-valid regardless of the manifest — matching the
// runOrient AC#5 gate (else if inProgressNodes.length > 1).
// ---------------------------------------------------------------------------
function crossCheckStatus(manifest, inProgressIds) {
  const ip = (inProgressIds || []).slice().sort();

  // ≤1 in_progress — always the legacy single-node path regardless of manifest.
  if (ip.length <= 1) {
    return { valid: true, orphan: false, reason: ip.length === 1 ? 'single_in_progress' : 'idle' };
  }

  if (!manifest) {
    // >1 in_progress + no manifest → orphan.
    return { valid: false, orphan: true, reason: 'orphan_multi_in_progress' };
  }

  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  const memberIds = (manifest.members || []).filter(m => !m.sealed).map(m => m.id).slice().sort();
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
  const {
    planPath, manifestPath, max, fanoutCap, shell, readFile, writeFile, mkdirp, now,
    project, projTag, repoRoot, worktreeAdd, worktreeRemove, snapshotMember: snapMember, anchorMergeRef: anchorRef,
  } = opts;

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

  // WRITE-ROLE WORKTREE ACTIVATION + DEGRADED MODE (#292, D3/D4/D5).
  //
  // Each write-role member runs in an ISOLATED linked git worktree so its writes
  // (a) are seal-barriered MEMBER-SCOPED (the per-member plan copy makes the
  // validator's findRepoRoot resolve the member worktree → the diff sees ONLY this
  // member's lane → out-of-lane overflow refuses) and (b) are captured as a
  // gc-anchored mergeRef at seal for join to check out. If the worktree capability
  // is unavailable (non-git dir, git error), open-batch DEGRADES with ZERO mutation
  // so the orchestrator falls back to the serial legacy path — the false-green is
  // killed by construction (a write-role manifest ⇒ every member has a real
  // worktreePath, so a falsy mergeRef at join is corruption, never silent success).
  const isWriteRole = kind === 'write_role';
  let seedCommit = null;
  const memberWorktrees = {}; // id → worktreePath (created, for rollback)
  const degradedReturn = () => {
    // Roll back any worktrees created so far BEFORE any ledger/manifest mutation
    // (none has happened yet — manifest is written LAST), so this leaves zero orphans.
    for (const id of Object.keys(memberWorktrees)) {
      if (typeof worktreeRemove === 'function') worktreeRemove(memberWorktrees[id]);
    }
    return { result: 'ok', degraded: true, reason: 'worktree_unavailable', opened: [], allDone: false };
  };

  if (isWriteRole) {
    // Seed every member worktree from the parent's CURRENT (uncommitted) state so the
    // member's --start baseline (recorded AFTER seeding) attributes ONLY this member's
    // own writes — prior terminal nodes' uncommitted writes cancel (#239 invariant).
    if (typeof snapMember !== 'function' || typeof anchorRef !== 'function'
        || typeof worktreeAdd !== 'function' || !repoRoot) {
      return degradedReturn();
    }
    const seedTree = snapMember(repoRoot, 'seed-' + (projTag || 'plan'));
    if (!seedTree) return degradedReturn();
    seedCommit = anchorRef('refs/kaola-workflow/batch-seed/' + (projTag || 'plan'), seedTree);
    if (!seedCommit) return degradedReturn();
  }

  // BASELINES-FIRST: record all N baselines BEFORE any ledger flip or plan write.
  // commit-node --start is record-base-only / idempotent / ledger-independent, so
  // recording a baseline before the row is flipped is safe. On any baseline failure
  // we return refuse having made ZERO plan/ledger mutation (no orphan). NOTE: this
  // survives a crash DURING baseline recording but does NOT make open-batch fully
  // atomic — the plan-write → manifest-write gap remains (two files can't be written
  // atomically). Still fails closed. For write-role members the worktree is
  // provisioned + the plan copied + the baseline recorded against the MEMBER plan.
  const members = [];
  for (const m of capped) {
    let memberWtPath = null;
    let baselinePlanPath = planPath;
    if (isWriteRole) {
      // Provision the isolated worktree seeded from the parent's current state.
      memberWtPath = path.join(repoRoot, '.kw', 'batch', (projTag || 'plan'), m.id);
      const added = worktreeAdd(memberWtPath, seedCommit);
      if (!added || added.ok !== true) return degradedReturn();
      memberWorktrees[m.id] = memberWtPath;
      // Copy the plan into the member worktree's project dir so the barrier resolves
      // findRepoRoot → the member worktree (member-scoped diff).
      const memberPlanDir = path.join(memberWtPath, 'kaola-workflow', project);
      if (mkdirp) mkdirp(memberPlanDir);
      baselinePlanPath = path.join(memberPlanDir, 'workflow-plan.md');
      try { writeFile(baselinePlanPath, planContent); } catch (_) { return degradedReturn(); }
    }
    const baseline = shell(commitNodePath, [baselinePlanPath, '--node-id', m.id, '--start', '--json']);
    const baselineOk = baseline.exitCode === 0 && baseline.result === 'ok';
    if (!baselineOk) {
      // Roll back created worktrees so a baseline failure leaves zero orphans, then
      // refuse (no ledger/manifest mutation yet). Read-only path is unchanged.
      for (const id of Object.keys(memberWorktrees)) {
        if (typeof worktreeRemove === 'function') worktreeRemove(memberWorktrees[id]);
      }
      return { result: 'refuse', reason: 'baseline_failed', nodeId: m.id, baselineResult: baseline };
    }
    members.push({
      id: m.id,
      role: m.role,
      model: m.model,
      declared_write_set: m.declared_write_set,
      kind,
      baseline: 'recorded',
      worktreePath: memberWtPath,
      mergeRef: null,
      sealed: false,
      joined: false,
    });
  }

  // Flip each member's ledger row → in_progress (allowFrom ['pending']).
  for (const m of capped) {
    const spliced = spliceLedgerNode(planContent, m.id, 'in_progress', { allowFrom: ['pending'] });
    if (!spliced.found) {
      return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: m.id };
    }
    if (spliced.changed) planContent = spliced.content;
  }
  writeFile(planPath, planContent);

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
  const { planPath, shell, readFile, project, projTag, repoRoot, snapshotMember: snapMember, anchorMergeRef: anchorRef } = ctx;
  let { manifest, planContent } = ctx;
  const { spliceLedgerNode } = require(ADAPTIVE_NODE);

  // MEMBER-SCOPED BARRIER (#292, D3): a write-role member ran in an isolated worktree,
  // so its barrier must shell commit-node with the MEMBER plan copy → the validator's
  // findRepoRoot resolves the member worktree → the tree-diff sees ONLY this member's
  // own lane (an out-of-lane write refuses barrier_failed). A read-only member (no
  // worktreePath) keeps the parent planPath — byte-unchanged for the read-only path.
  const isWriteRole = !!member.worktreePath;
  const barrierPlanPath = isWriteRole
    ? path.join(member.worktreePath, 'kaola-workflow', project, 'workflow-plan.md')
    : planPath;
  const barrierOut = shell(commitNodePath, [barrierPlanPath, '--node-id', member.id, '--json']);
  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    return { ok: false, reason: 'barrier_failed', barrierOut, manifest, planContent };
  }

  // mergeRef capture (#292, D2): a gc-anchored COMMIT of the member worktree's sealed
  // state, keyed by (projTag, member.id). join checks out THIS SHA — decoupled from
  // worktree liveness; survives gc across a crash. Captured AFTER the barrier passes.
  let mergeRef = member.mergeRef || null;
  if (isWriteRole) {
    const tree = (typeof snapMember === 'function') ? snapMember(member.worktreePath, 'merge-' + member.id) : null;
    mergeRef = (tree && typeof anchorRef === 'function')
      ? anchorRef('refs/kaola-workflow/batch-merge/' + (projTag || 'plan') + '/' + member.id, tree)
      : null;
    if (!mergeRef) {
      return { ok: false, reason: 'merge_ref_failed', manifest, planContent };
    }
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

  // Flip manifest member sealed:true (+ persist the captured mergeRef for join).
  manifest = {
    ...manifest,
    members: manifest.members.map(m => m.id === member.id ? { ...m, sealed: true, mergeRef } : m),
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
  const {
    planPath, cacheDir, manifestPath, nodeId, shell, readFile, writeFile, cacheExists,
    project, projTag, repoRoot, snapshotMember, anchorMergeRef,
  } = opts;

  const manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }
  const member = manifest.members.find(m => m.id === nodeId);
  if (!member) {
    return { result: 'refuse', reason: 'not_a_member', nodeId };
  }

  if (member.sealed) {
    return { result: 'ok', sealed: nodeId, state: manifest.state, alreadySealed: true };
  }

  let planContent = readFile(planPath);
  const sealed = sealOne(member, {
    planPath, cacheDir, shell, readFile, manifest, planContent,
    project, projTag, repoRoot, snapshotMember, anchorMergeRef,
  });
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
  const {
    planPath, cacheDir, manifestPath, shell, readFile, writeFile, cacheExists,
    project, projTag, repoRoot, snapshotMember, anchorMergeRef,
  } = opts;

  let manifest = readManifest(manifestPath, cacheExists, readFile);
  if (!manifest) {
    return { result: 'refuse', reason: 'no_active_batch' };
  }

  let planContent = readFile(planPath);
  const sealedIds = [];
  const failures = [];

  for (const member of manifest.members) {
    if (member.sealed) { sealedIds.push(member.id); continue; }
    const res = sealOne(member, {
      planPath, cacheDir, shell, readFile, manifest, planContent,
      project, projTag, repoRoot, snapshotMember, anchorMergeRef,
    });
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
  const { manifestPath, shell, readFile, writeFile, cacheExists, gitCheckout, worktreeRemove } = opts;

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
    // FAIL-CLOSED (#292, D4): a write-role member with no captured mergeRef is
    // corruption (a write-role manifest INVARIANTLY has one per member after seal),
    // OR the io shim is missing its gitCheckout seam — refuse, NEVER mark joined.
    // This is what kills the false-green: joined:true is reachable ONLY after a real
    // checkout of the gc-anchored mergeRef commit into the PARENT worktree.
    if (!m.mergeRef || typeof gitCheckout !== 'function') {
      return { result: 'refuse', reason: 'missing_merge_ref', nodeId: m.id, state: 'joining' };
    }
    const paths = Array.from(parseWriteSet(m.declared_write_set));
    const res = gitCheckout(m.mergeRef, paths);
    if (!res || res.ok !== true) {
      // Leave manifest 'joining'; resume re-runs only the unmerged remainder.
      return { result: 'refuse', reason: 'join_failed', nodeId: m.id, detail: res && res.detail, state: 'joining' };
    }
    manifest = { ...manifest, members: manifest.members.map(x => x.id === m.id ? { ...x, joined: true } : x) };
    joined.push(m.id);
    // Cleanup (#292, §3.6): the mergeRef is gc-anchored, so the worktree is no longer
    // needed — remove it best-effort AFTER the checkout lands. .kw/ is gitignored so a
    // leftover never enters a sink commit; the mergeRef stays (bounded by node count).
    if (m.worktreePath && typeof worktreeRemove === 'function') {
      worktreeRemove(m.worktreePath);
    }
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
  // projTag mirrors the validator's (project) ref token (validator:1003): the project
  // folder name sanitized. Keys the per-member mergeRef so concurrent projects never collide.
  const projTag    = path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_') || 'plan';
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
    // R3 FIX (#292): the merge source is a gc-anchored COMMIT ref captured at seal,
    // NOT the worktree filesystem path. `git checkout <ref> -- <paths>` lands the
    // member's declared writes into the PARENT worktree (repoRoot, -C). Passing a
    // filesystem path here was the R3 bug (`fatal: invalid reference: <path>`).
    gitCheckout: (mergeRef, paths) => {
      try {
        execFileSync('git', ['-C', repoRoot, 'checkout', mergeRef, '--', ...paths], { encoding: 'utf8' });
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: String(err && err.message || err) };
      }
    },
    // Worktree lifecycle (#292): provision/teardown one isolated linked worktree per
    // write-role member, seeded from a detached seed commit (the parent's current state).
    worktreeAdd: (wtPath, seedCommit) => {
      try {
        execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '--detach', wtPath, seedCommit],
          { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: String(err && err.message || err) };
      }
    },
    worktreeRemove: (wtPath) => {
      try {
        execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wtPath],
          { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: String(err && err.message || err) };
      }
    },
    // gc-safe member snapshot/anchor (#292): pure-git, edition-neutral (zero forge token).
    snapshotMember: (worktreeRoot, tag) => snapshotMember(worktreeRoot, tag),
    anchorMergeRef: (refName, tree) => {
      try { return anchorMergeRef(repoRoot, refName, tree); } catch (_) { return null; }
    },
    repoRoot,
  };

  const ctx = { planPath, statePath, cacheDir, manifestPath, project, projTag, repoRoot, fanoutCap, max, nodeId, ...io };

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
