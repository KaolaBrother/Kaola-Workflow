#!/usr/bin/env node
// @generated from scripts/kaola-workflow-replan.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const schema = require('./kaola-workflow-adaptive-schema');
const validator = require('./kaola-gitea-workflow-plan-validator');
const { generateMirror } = require('./kaola-gitea-workflow-task-mirror');
const { runReplanHandoff } = require('./kaola-gitea-workflow-adaptive-handoff');

const MAX_BUFFER = 64 * 1024 * 1024;
const HEX64_RE = /^[0-9a-f]{64}$/;
const OBJECT_ID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function nowIso(opts) {
  return opts && typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
}

function getRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function assertProjectName(project) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(project || ''))) {
    throw new Error('unsafe_project_name');
  }
}

function projectPaths(repoRoot, project) {
  assertProjectName(project);
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  const cacheDir = path.join(projectDir, '.cache');
  return {
    repoRoot,
    project,
    projectDir,
    cacheDir,
    planPath: path.join(projectDir, 'workflow-plan.md'),
    statePath: path.join(projectDir, 'workflow-state.md'),
    childPath: path.join(projectDir, schema.REPLAN_PLAN_NEXT_NAME),
    transactionPath: path.join(cacheDir, schema.REPLAN_TRANSACTION_NAME),
    packetPath: path.join(cacheDir, schema.REPLAN_PLANNER_PACKET_NAME),
    attestationPath: path.join(cacheDir, schema.REPLAN_PLANNER_ATTESTATION_NAME),
    consentPath: path.join(cacheDir, schema.EPOCH_CONSENT_EXTENSIONS_NAME),
    lockPath: path.join(cacheDir, schema.SCHEDULER_LOCK_NAME),
    epochsDir: path.join(cacheDir, 'epochs'),
    transactionHistoryDir: path.join(cacheDir, 'committed-transactions'),
    sourceHistoryDir: path.join(cacheDir, 'replan-sources'),
  };
}

function ensureProjectAuthorityPaths(paths) {
  try {
    for (const dir of [path.join(paths.repoRoot, 'kaola-workflow'), paths.projectDir]) {
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('authority_directory_invalid');
    }
    const cacheStat = fs.lstatSync(paths.cacheDir);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) throw new Error('authority_directory_invalid');
  } catch (error) {
    return { ok: false, reason: 'replan_authority_path_invalid', detail: error.message };
  }
  return { ok: true };
}

function readJson(filePath) {
  return JSON.parse(readAuthorityText(filePath));
}

function readJsonOrNull(filePath) {
  try { return readJson(filePath); } catch (_) { return null; }
}

function entryExists(filePath) {
  try { fs.lstatSync(filePath); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function readAuthorityBytes(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error('authority_file_type_invalid');
  }
  return fs.readFileSync(filePath);
}

function readAuthorityText(filePath) {
  return readAuthorityBytes(filePath).toString('utf8');
}

function readAuthorityJson(filePath) {
  return JSON.parse(readAuthorityText(filePath));
}

function readAuthorityJsonOrNull(filePath) {
  if (!entryExists(filePath)) return null;
  return readAuthorityJson(filePath);
}

function exactDigest(filePath) {
  return schema.sha256Hex(readAuthorityBytes(filePath));
}

function fireFailpoint(opts, name) {
  if (opts && typeof opts.failpoint === 'function') {
    try { opts.failpoint(name); }
    catch (error) { error.code = 'KAOLA_REPLAN_FAILPOINT'; throw error; }
  }
  if (process.env.KAOLA_REPLAN_FAILPOINT === name) {
    const error = new Error('replan_failpoint:' + name);
    error.code = 'KAOLA_REPLAN_FAILPOINT';
    throw error;
  }
}

function durableLabelBase(label) {
  const text = String(label || '');
  return text.split(':')[0];
}

function assertDurableLabel(label) {
  if (!schema.REPLAN_DURABLE_WRITE_LABELS.includes(durableLabelBase(label))) {
    throw new Error('replan_durable_label_invalid:' + label);
  }
}

function durableWriteFile(filePath, content, opts, label) {
  assertDurableLabel(label);
  schema.writeFileAtomicReplace(filePath, content);
  fireFailpoint(opts, label);
}

function durableWriteJson(filePath, value, opts, label) {
  durableWriteFile(filePath, schema.canonicalJson(value) + '\n', opts, label);
}

function durableRename(from, to, opts, label) {
  assertDurableLabel(label);
  fs.renameSync(from, to);
  fsyncDirectory(path.dirname(to));
  fireFailpoint(opts, label);
}

function durableUnlink(filePath, opts, label) {
  assertDurableLabel(label);
  fs.unlinkSync(filePath);
  fsyncDirectory(path.dirname(filePath));
  fireFailpoint(opts, label);
}

function durableCreateEmptyFile(filePath, opts, label) {
  assertDurableLabel(label);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'wx');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fsyncDirectory(path.dirname(filePath));
  fireFailpoint(opts, label);
}

function durableCreateExclusiveFile(filePath, bytes, opts, label) {
  assertDurableLabel(label);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(filePath, 'wx', 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
    fs.fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (error.code !== 'EEXIST') throw error;
    const existing = readAuthorityBytes(filePath);
    if (!existing.equals(bytes)) throw new Error('history_receipt_collision');
    return false;
  }
  fs.closeSync(fd);
  fsyncDirectory(path.dirname(filePath));
  fireFailpoint(opts, label);
  return true;
}

function deterministicPathLabel(prefix, ordinal, rel) {
  return prefix + ':' + String(ordinal).padStart(4, '0') + ':'
    + schema.sha256Hex(Buffer.from(String(rel), 'utf8')).slice(0, 16);
}

function withProjectLock(paths, subcommand, body) {
  const authority = ensureProjectAuthorityPaths(paths);
  if (!authority.ok) return schema.refuse(authority.reason, { detail: authority.detail });
  const lock = schema.acquireProjectLock(paths.lockPath, { subcommand });
  if (!lock.ok) {
    return schema.refuse(lock.stale ? 'scheduler_lock_stale' : 'scheduler_lock_held', {
      holder: lock.holder || null,
      operator_hint: lock.stale
        ? 'Remove the stale scheduler.lock explicitly from one session, then retry.'
        : 'Another project mutation owns scheduler.lock; retry after it completes.',
    });
  }
  try { return body(); } finally { lock.release(); }
}

function git(root, args, opts) {
  return execFileSync('git', ['-C', root, ...args], Object.assign({
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER,
  }, opts || {}));
}

function repositoryIdentity(root) {
  try {
    const remote = String(git(root, ['remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    if (remote) return remote;
  } catch (_) {}
  try {
    const common = String(git(root, ['rev-parse', '--git-common-dir'])).trim();
    return 'local:' + fs.realpathSync(path.resolve(root, common, '..'));
  } catch (_) {
    return 'local:' + fs.realpathSync(root);
  }
}

function objectFormat(root, commit) {
  try {
    const value = String(git(root, ['rev-parse', '--show-object-format'], { stdio: ['ignore', 'pipe', 'ignore'] })).trim().toLowerCase();
    if (value === 'sha1' || value === 'sha256') return value;
  } catch (_) {}
  return String(commit || '').length === 64 ? 'sha256' : 'sha1';
}

function parseStateFields(content) {
  return schema.parseStateFields(content);
}

function stateIssueNumbers(fields) {
  const raw = String(fields.issue_numbers || '').trim();
  const values = raw ? raw.split(',') : [fields.issue_number];
  return schema.normalizeIssueNumbers(values);
}

function currentBranch(root) {
  try { return String(git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim(); }
  catch (_) { return 'HEAD'; }
}

function verifyClaimRootBase(repoRoot, rootInput) {
  let root;
  try { root = schema.buildClaimRootBase(rootInput); }
  catch (error) { return { ok: false, reason: error.message }; }
  if (objectFormat(repoRoot, root.commit) !== root.object_format) {
    return { ok: false, reason: 'claim_root_object_format_mismatch' };
  }
  const zeroCommit = /^0+$/.test(root.commit);
  if (zeroCommit) {
    try {
      git(repoRoot, ['rev-parse', '--verify', 'HEAD'], { stdio: ['ignore', 'ignore', 'ignore'] });
      return { ok: false, reason: 'claim_root_history_appeared' };
    } catch (_) {}
    let emptyTree;
    try {
      emptyTree = String(execFileSync('git', ['-C', repoRoot, 'hash-object', '-t', 'tree', '--stdin'], {
        input: Buffer.alloc(0), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER,
      })).trim().toLowerCase();
    } catch (_) { return { ok: false, reason: 'claim_root_tree_missing' }; }
    if (emptyTree !== root.tree) {
      return { ok: false, reason: 'claim_root_tree_mismatch', expected: root.tree, actual: emptyTree };
    }
    return { ok: true, root, no_history: true };
  }
  try {
    git(repoRoot, ['cat-file', '-e', root.commit + '^{commit}'], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) {
    return { ok: false, reason: 'claim_root_commit_missing' };
  }
  let tree;
  try { tree = String(git(repoRoot, ['rev-parse', root.commit + '^{tree}'])).trim().toLowerCase(); }
  catch (_) { return { ok: false, reason: 'claim_root_tree_missing' }; }
  if (tree !== root.tree) return { ok: false, reason: 'claim_root_tree_mismatch', expected: root.tree, actual: tree };
  return { ok: true, root };
}

function deriveLegacyClaimRoot(input) {
  const repoRoot = input && input.repoRoot;
  const branch = input && input.branch;
  if (!repoRoot || !branch || currentBranch(repoRoot) !== branch) {
    return { ok: false, reason: 'legacy_claim_root_unprovable' };
  }
  if (input.persisted_root) {
    const verified = verifyClaimRootBase(repoRoot, input.persisted_root);
    return verified.ok ? { ok: true, root: verified.root, source: 'persisted_claim_root' }
      : { ok: false, reason: 'legacy_claim_root_unprovable', detail: verified.reason };
  }
  const commits = Array.from(new Set((input.barrier_open_commits || [])
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean)));
  if (commits.length !== 1 || !OBJECT_ID_RE.test(commits[0])) {
    return { ok: false, reason: 'legacy_claim_root_unprovable' };
  }
  const commit = commits[0];
  let tree;
  try {
    git(repoRoot, ['cat-file', '-e', commit + '^{commit}'], { stdio: ['ignore', 'ignore', 'ignore'] });
    tree = String(git(repoRoot, ['rev-parse', commit + '^{tree}'])).trim().toLowerCase();
    git(repoRoot, ['merge-base', '--is-ancestor', commit, 'HEAD'], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) {
    return { ok: false, reason: 'legacy_claim_root_unprovable' };
  }
  const root = schema.buildClaimRootBase({
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    object_format: objectFormat(repoRoot, commit), commit, tree, branch,
  });
  return { ok: true, root, source: 'first_runnable_frontier_barrier_open' };
}

function barrierOpenCommits(cacheDir) {
  let names = [];
  try { names = fs.readdirSync(cacheDir).filter(name => name.startsWith('barrier-open-')).sort(); }
  catch (_) { names = []; }
  const values = [];
  for (const name of names) {
    try {
      const value = readAuthorityText(path.join(cacheDir, name)).trim().toLowerCase();
      if (value) values.push(value);
    } catch (_) { return null; }
  }
  return values;
}

function resolveClaimLineage(paths, stateContent) {
  const fields = parseStateFields(stateContent);
  const issueNumbers = stateIssueNumbers(fields);
  const branch = String(fields.branch || '');
  const worktreePath = fs.realpathSync(String(fields.worktree_path || paths.repoRoot));
  if (worktreePath !== fs.realpathSync(paths.repoRoot)) {
    return { ok: false, reason: 'claim_worktree_mismatch' };
  }
  let root;
  let legacy = false;
  if (String(fields.epoch_schema_version || '') === String(schema.EPOCH_SCHEMA_VERSION)) {
    try {
      root = schema.buildClaimRootBase({
        schema_version: schema.EPOCH_SCHEMA_VERSION,
        object_format: fields.claim_root_object_format,
        commit: fields.claim_root_base_commit,
        tree: fields.claim_root_base_tree,
        branch,
      });
    } catch (error) { return { ok: false, reason: error.message }; }
  } else {
    legacy = true;
    const derived = deriveLegacyClaimRoot({
      repoRoot: paths.repoRoot,
      branch,
      barrier_open_commits: barrierOpenCommits(paths.cacheDir),
    });
    if (!derived.ok) return derived;
    root = derived.root;
  }
  const rootCheck = verifyClaimRootBase(paths.repoRoot, root);
  if (!rootCheck.ok) return rootCheck;
  let identity;
  try {
    identity = schema.buildClaimIdentity({
      schema_version: schema.EPOCH_SCHEMA_VERSION,
      repository_id: fields.claim_repository_id && fields.claim_repository_id !== 'none'
        ? fields.claim_repository_id : repositoryIdentity(paths.repoRoot),
      issue_numbers: issueNumbers,
      primary_issue: Number(fields.issue_number),
      bundle_id: fields.bundle_id || null,
      closure_policy: fields.closure_policy || 'all_or_nothing',
      branch,
      worktree_path: worktreePath,
      claim_ts: fields.claim_ts,
      session_marker: fields.session_marker,
    });
  } catch (error) { return { ok: false, reason: error.message }; }
  const lineage = schema.buildEpochLineage(identity, root);
  if (!legacy) {
    if (fields.claim_identity_digest !== lineage.claim_identity_digest
        || fields.claim_root_base_digest !== lineage.claim_root_base_digest
        || fields.epoch_lineage_id !== lineage.epoch_lineage_id) {
      return { ok: false, reason: 'claim_lineage_digest_mismatch' };
    }
  }
  return Object.assign({ ok: true, legacy }, lineage);
}

function listTree(root, treeish) {
  const raw = git(root, ['ls-tree', '-r', '-z', treeish], { encoding: 'buffer' });
  const records = new Map();
  for (const record of Buffer.from(raw).toString('utf8').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('candidate_tree_record_invalid');
    const meta = record.slice(0, tab).trim().split(/\s+/);
    const file = record.slice(tab + 1);
    if (!/^[0-7]{6}$/.test(meta[0] || '') || !OBJECT_ID_RE.test(meta[2] || '')) {
      throw new Error('candidate_tree_record_invalid');
    }
    records.set(file, { mode: meta[0], type: meta[1], oid: meta[2].toLowerCase() });
  }
  return records;
}

function snapshotWorktreeTree(repoRoot, rootCommit) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-replan-index-'));
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: path.join(scratch, 'index') });
  try {
    git(repoRoot, /^0+$/.test(String(rootCommit || '')) ? ['read-tree', '--empty'] : ['read-tree', rootCommit],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
    git(repoRoot, ['add', '-A'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    return String(git(repoRoot, ['write-tree'], { env })).trim().toLowerCase();
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function candidatePathExcluded(file, project) {
  return file.startsWith('kaola-workflow/' + project + '/')
    || file.startsWith('.kw/') || file.startsWith('.git/');
}

function codeRelevant(file) {
  const p = String(file).toLowerCase();
  if (/\.(?:js|cjs|mjs|ts|tsx|jsx|py|rb|rs|go|java|kt|swift|c|cc|cpp|h|hpp|sh|bash|zsh|fish|ps1|sql|wasm)$/.test(p)) return true;
  if (/^(?:scripts|src|lib|app|test|tests|spec|templates|commands|agents|plugins)\//.test(p)) return true;
  return /(?:^|\/)(?:package\.json|tsconfig\.json|cargo\.toml|go\.mod|makefile|dockerfile)$/.test(p);
}

function securityRelevant(file) {
  const p = String(file).toLowerCase();
  return /(?:auth|security|secret|credential|permission|sandbox|lock|claim|closure|consent|signature|attest|provenance|token|key)/.test(p)
    || /(?:^|\/)(?:\.github|hooks|config)\//.test(p);
}

function blobSha256(repoRoot, record) {
  if (!record) return null;
  if (record.type === 'commit') return schema.sha256Hex(Buffer.from(record.oid, 'utf8'));
  return schema.sha256Hex(execFileSync('git', ['-C', repoRoot, 'cat-file', 'blob', record.oid], {
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER,
  }));
}

function digestSemantic(value) {
  try { return schema.sha256Canonical(value); }
  catch (_) { return schema.sha256Hex(Buffer.from(JSON.stringify(value), 'utf8')); }
}

function deriveCandidateObservation(paths, lineage, attempt, opts) {
  const root = lineage.claim_root_base;
  const verified = verifyClaimRootBase(paths.repoRoot, root);
  if (!verified.ok) return verified;
  let currentTree;
  let base;
  let current;
  try {
    currentTree = snapshotWorktreeTree(paths.repoRoot, root.commit);
    base = listTree(paths.repoRoot, root.tree);
    current = listTree(paths.repoRoot, currentTree);
  } catch (error) {
    return { ok: false, reason: 'candidate_digest_unavailable', detail: error.message };
  }
  const names = Array.from(new Set([...base.keys(), ...current.keys()])).sort();
  const entries = [];
  for (const file of names) {
    if (candidatePathExcluded(file, paths.project)) continue;
    const before = base.get(file) || null;
    const after = current.get(file) || null;
    if (before && after && before.mode === after.mode && before.oid === after.oid) continue;
    let kind = !after ? 'deleted' : !before ? 'added' : 'modified';
    if (after && after.mode === '120000') kind = 'symlink';
    if (after && after.mode === '160000') kind = 'gitlink';
    entries.push({
      path: file,
      kind,
      mode: after ? after.mode : null,
      blob_digest: after ? blobSha256(paths.repoRoot, after) : null,
      code_relevant: codeRelevant(file),
      security_relevant: securityRelevant(file),
    });
  }
  const candidate = schema.digestCandidateView({
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: lineage.claim_root_base_digest,
    base_tree: root.tree,
    entries,
  });
  const changedEntryDigests = candidate.candidate_view.entries.map(entry => schema.sha256Canonical(entry)).sort();
  const codeEntries = candidate.candidate_view.entries.filter(entry => entry.code_relevant);
  const securityEntries = candidate.candidate_view.entries.filter(entry => entry.security_relevant);
  const obligations = attempt && Array.isArray(attempt.validation_obligations)
    ? attempt.validation_obligations.map(digestSemantic).sort() : [];
  const scopeIds = [];
  if (attempt && HEX64_RE.test(String(attempt.scope_lineage_id || '').toLowerCase())) {
    scopeIds.push(String(attempt.scope_lineage_id).toLowerCase());
  }
  const classes = [];
  if (codeEntries.length) classes.push('code');
  if (securityEntries.length) classes.push('security');
  const frontier = schema.digestInheritedFrontierView({
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: lineage.claim_root_base_digest,
    candidate_digest: candidate.candidate_digest,
    code_digest: schema.sha256Canonical(codeEntries),
    security_digest: schema.sha256Canonical(securityEntries),
    inherited_frontier_classes: classes,
    changed_entry_digests: changedEntryDigests,
    validation_obligation_digests: obligations,
    scope_lineage_ids: scopeIds,
  });
  return {
    ok: true,
    observed_at: nowIso(opts),
    claim_root_base_digest: lineage.claim_root_base_digest,
    candidate_digest: candidate.candidate_digest,
    inherited_frontier_digest: frontier.inherited_frontier_digest,
    candidate_view: candidate.candidate_view,
    inherited_frontier_view: frontier.inherited_frontier_view,
    inherited_frontier_classes: classes,
  };
}

function casTuple(observation) {
  return {
    candidate_digest: observation.candidate_digest,
    claim_root_base_digest: observation.claim_root_base_digest,
    inherited_frontier_digest: observation.inherited_frontier_digest,
  };
}

function sameCasTuple(a, b) {
  return a && b && a.candidate_digest === b.candidate_digest
    && a.claim_root_base_digest === b.claim_root_base_digest
    && a.inherited_frontier_digest === b.inherited_frontier_digest;
}

function computeReviewCandidateDigest(repoRoot, project) {
  const tree = snapshotWorktreeTree(repoRoot, 'HEAD');
  const listing = String(git(repoRoot, ['ls-tree', '-r', tree], { encoding: 'utf8' }));
  const activePrefix = 'kaola-workflow/' + project + '/';
  const lines = listing.split(/\r?\n/).filter(Boolean).filter(line => {
    const tab = line.indexOf('\t');
    const file = tab >= 0 ? line.slice(tab + 1) : '';
    return !file.startsWith(activePrefix) && !file.startsWith('.kw/') && !file.startsWith('.git/');
  }).sort();
  return schema.sha256Hex(Buffer.from(lines.join('\n') + (lines.length ? '\n' : ''), 'utf8'));
}

function readSource(paths, planHash, sourceAttemptId, options) {
  const journalPath = path.join(paths.cacheDir, 'review-attempts.json');
  const sourcePath = path.join(paths.cacheDir, 'replan-source.json');
  let journal;
  let handoff;
  try { journal = readAuthorityJsonOrNull(journalPath); handoff = readAuthorityJsonOrNull(sourcePath); }
  catch (_) { return { ok: false, reason: 'replan_source_authority_invalid' }; }
  if (!journal || !Array.isArray(journal.attempts)) {
    return { ok: false, reason: 'replan_source_journal_missing' };
  }
  let planContent;
  let schema2ReviewGates;
  try {
    planContent = options && typeof options.planContent === 'string'
      ? options.planContent : readAuthorityText(paths.planPath);
    if (validator.readStoredHash(planContent) !== planHash) {
      return { ok: false, reason: 'replan_source_plan_hash_mismatch' };
    }
    schema2ReviewGates = validator.schema2ReviewGateContracts(planContent);
  } catch (_) {
    return { ok: false, reason: 'replan_source_plan_hash_mismatch' };
  }
  const journalCheck = schema.validateReviewJournal(journal, planHash,
    { schema2_review_gates: schema2ReviewGates });
  if (!journalCheck.ok) return { ok: false, reason: journalCheck.reason, detail: journalCheck.detail || null };
  const attemptId = sourceAttemptId || (handoff && handoff.attempt_id);
  const attempt = journal.attempts.find(row => row && row.attempt_id === attemptId);
  if (!attempt || attempt.lifecycle_settled !== true || attempt.outcome !== 'fail'
      || attempt.consumed_by != null || String(attempt.plan_hash || journal.plan_hash || '') !== planHash) {
    return { ok: false, reason: 'replan_source_attempt_unsettled' };
  }
  if (options && options.verifyCandidate) {
    const effective = schema.effectiveCandidate(attempt);
    let current = null;
    try {
      // Compare like for like. A contract-2 attempt seals its candidate identity with the
      // deterministic validation runner's LANDABLE tree digest — the same band the reviewer's
      // context bound, and the same value the rebind overlay re-bases onto. A contract-1 attempt
      // sealed the legacy raw ls-tree digest, so that lane keeps the raw comparison. The
      // discriminator is per-ATTEMPT, never the journal's schema_version: reading the attempt's own
      // contract is the narrower, fail-closed form of a property the journal validator already
      // enforces uniformly (a schema-2 journal rejects any attempt that is not contract-2), so it
      // stays correct without depending on that validator having run first.
      // Fail-closed: any failure here lands on `current = null` and refuses. Never fall back to the
      // other algorithm, and never `||`-chain the two — that would be a silent pass.
      current = attempt.contract_version === 2
        ? require('./kaola-workflow-validation-runner').computeLandableTreeDigest(paths.repoRoot,
          { test_consumed_paths: validator.parseValidationTestConsumes(planContent) })
        : computeReviewCandidateDigest(paths.repoRoot, paths.project);
    } catch (_) { current = null; }
    if (!current || current !== effective.digest) {
      return { ok: false, reason: 'replan_source_candidate_changed' };
    }
  }
  if (!handoff || handoff.schema_version !== 2 || handoff.kind !== 'repair_outcome'
      || handoff.result !== 'repair_requires_replan' || handoff.attempt_id !== attemptId) {
    return { ok: false, reason: handoff && handoff.schema_version === 1
      ? 'replan_source_schema_invalid' : 'replan_source_outcome_missing' };
  }
  const state = parseStateFields(readAuthorityText(paths.statePath));
  const sourceLineage = options && options.lineage;
  const producerSlice = Array.isArray(handoff.producer_slice)
    ? Array.from(new Set(handoff.producer_slice.map(String))).sort() : null;
  const effective = schema.effectiveCandidate(attempt);
  const payload = {
    schema_version: 2,
    kind: 'repair_outcome',
    result: 'repair_requires_replan',
    attempt_id: attemptId,
    reason: handoff.reason,
    producer_slice: producerSlice,
    parent_plan_hash: planHash,
    epoch_lineage_id: sourceLineage ? sourceLineage.epoch_lineage_id : state.epoch_lineage_id,
    claim_identity_digest: sourceLineage ? sourceLineage.claim_identity_digest : state.claim_identity_digest,
    claim_root_base_digest: sourceLineage ? sourceLineage.claim_root_base_digest : state.claim_root_base_digest,
    review_journal_digest: exactDigest(journalPath),
    review_attempt_digest: schema.sha256Hex(Buffer.from(schema.canonicalJson(attempt), 'utf8')),
    effective_candidate_digest: effective && effective.digest,
  };
  const envelopeMismatch = Object.keys(payload).filter(key => handoff[key] !== payload[key]
    && key !== 'producer_slice');
  if (!producerSlice || producerSlice.some(id => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))
      || !/^[a-z][a-z0-9_]*$/.test(String(handoff.reason || ''))
      || envelopeMismatch.length
      || schema.canonicalJson(handoff.producer_slice) !== schema.canonicalJson(producerSlice)
      || handoff.outcome_digest !== schema.sha256Canonical(payload)
      || typeof handoff.persisted_at !== 'string' || !Number.isFinite(Date.parse(handoff.persisted_at))) {
    return { ok: false, reason: 'replan_source_envelope_mismatch', detail: envelopeMismatch.join(',') || 'envelope_digest_or_shape' };
  }
  const allowedEnvelopeKeys = [...Object.keys(payload), 'outcome_digest', 'persisted_at'].sort();
  if (schema.canonicalJson(Object.keys(handoff).sort()) !== schema.canonicalJson(allowedEnvelopeKeys)) {
    return { ok: false, reason: 'replan_source_envelope_mismatch' };
  }
  if (handoff.parent_plan_hash !== planHash
      || handoff.epoch_lineage_id !== payload.epoch_lineage_id
      || handoff.claim_identity_digest !== payload.claim_identity_digest
      || handoff.claim_root_base_digest !== payload.claim_root_base_digest) {
    return { ok: false, reason: 'replan_source_lineage_mismatch' };
  }
  if (handoff.review_journal_digest !== exactDigest(journalPath)
      || handoff.review_attempt_digest !== schema.sha256Hex(Buffer.from(schema.canonicalJson(attempt), 'utf8'))
      || handoff.effective_candidate_digest !== (effective && effective.digest)) {
    return { ok: false, reason: 'replan_source_digest_mismatch' };
  }
  if (!effective || !HEX64_RE.test(String(effective.digest || ''))) {
    return { ok: false, reason: 'replan_source_outcome_missing' };
  }
  for (const receipt of attempt.receipts) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(receipt.node_id || ''))) {
      return { ok: false, reason: 'replan_source_evidence_path_invalid' };
    }
    const evidencePath = path.join(paths.cacheDir, receipt.node_id + '.md');
    let stat;
    let body;
    try { stat = fs.lstatSync(evidencePath); body = fs.readFileSync(evidencePath, 'utf8'); }
    catch (_) { return { ok: false, reason: 'replan_source_evidence_missing' }; }
    // The journal was structurally validated above, and it fixes the receipt shape: a schema-1
    // journal guarantees every receipt carries `body` plus `receipt_sha256 === sha256(body)`; a
    // schema-2 journal guarantees every receipt carries a hex64 `raw_evidence_sha256` over the same
    // evidence bytes and embeds no body. Bind EVERY digest the receipt actually declares — never
    // fewer, so a receipt carrying both shapes must satisfy both — and refuse a receipt that
    // declares none. This is conjunctive on purpose: do NOT rewrite it as "pick a shape, check that
    // one", which would let an extra hand-written body/receipt_sha256 pair route past the
    // authoritative raw_evidence_sha256.
    const bodyDigest = schema.sha256Hex(Buffer.from(body, 'utf8'));
    const declaresEmbeddedBody = receipt.body !== undefined || receipt.receipt_sha256 !== undefined;
    const declaresRawEvidence = receipt.raw_evidence_sha256 !== undefined;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
        || (!declaresEmbeddedBody && !declaresRawEvidence)
        || (declaresEmbeddedBody && (body !== receipt.body || bodyDigest !== receipt.receipt_sha256))
        || (declaresRawEvidence && bodyDigest !== receipt.raw_evidence_sha256)) {
      return { ok: false, reason: 'replan_source_evidence_mismatch' };
    }
  }
  const source = {
    authority_kind: 'review_outcome',
    attempt_id: attemptId,
    source_attempt_ids: [attemptId],
    source_reason: 'review_repair_requires_replan',
    producer_slice: producerSlice,
    findings: Array.isArray(attempt.findings) ? attempt.findings : [],
    rebind: Array.isArray(attempt.rebind) ? attempt.rebind : [],
    case_b_evidence: null,
    scope_lineage_id: HEX64_RE.test(String(attempt.scope_lineage_id || '').toLowerCase())
      ? String(attempt.scope_lineage_id).toLowerCase() : null,
    legacy_candidate_digest: attempt.candidate_digest || null,
    legacy_candidate_residue_digest: attempt.candidate_residue_digest || null,
    journal_digest: handoff.review_journal_digest,
    handoff_digest: exactDigest(sourcePath),
    repair_outcome_digest: handoff.outcome_digest,
  };
  source.source_evidence_digest = schema.sha256Canonical(source);
  if (!reviewSourceCarriesFrontier(source)) {
    return { ok: false, reason: 'replan_source_findings_missing', detail: 'source_frontier_empty' };
  }
  return { ok: true, source, attempt, journal };
}

// #729 — REPLAN-SIDE FRONTIER INVARIANT. A review-authored transition consumes an epoch
// and authorizes a whole child plan; `findings` is the ONLY record of what failed that
// crosses that boundary (the packet's `source.findings`, and the source_evidence_digest
// the child plan is frozen against). A settled FAILED attempt carrying an EMPTY canonical
// frontier therefore authorizes a child epoch with nothing to repair — observed live as a
// read-only adversary -> docs writer -> review plan whose own text recorded that "no
// security frontier or unresolved finding was supplied", after which the same defect was
// rediscovered and burned another epoch.
//
// The producer seam already refuses to SETTLE a failed schema-2 gate with an empty open
// frontier; this is the independent CONSUMER wall, so a corrupted, hand-written, rotated,
// or pre-guard journal fails closed here instead of being laundered into an epoch.
//
// SCOPE — `review_outcome` ONLY. The `diagnosis_to_build` authority legitimately carries
// `findings: []`: nothing failed, and its evidence is the four sealed diagnosis artifacts
// verified by verifyCaseBProof. Widening this to every authority kind would hard-block
// Case B outright.
//
// PREDICATE — non-empty `findings`, deliberately NOT "non-empty OPEN frontier". An attempt
// that fails only on progress (resolution proof missing, validation drift) legitimately
// carries findings whose status is all `resolved`: the record of what failed is intact and
// the child has something to route. Demanding an open UID there would false-refuse a legal
// transition; demanding a non-empty ARRAY refuses exactly the case with no record at all.
//
// NOT DECIDED HERE (#729 case b) — "the findings exist but the child plan contains no write
// node capable of repairing them". Coverage is deliberately left unbound rather than
// approximated, because every mechanical proxy available at this seam is unsound:
//   * Anchor-path containment (each open anchor path must fall inside the union of the child's
//     declared write sets) fails three ways. `evidence_observation` is a legal anchor kind that
//     carries NO path at all — it is what the canonical schema-2 fixture uses; a schema-1
//     finding's `file=` token is optional and never validated; and a declared write set may
//     legally be directory-shaped or a glob, which the validator itself (hasUnresolvableEntry)
//     refuses to reason about for exact-path membership. Worse, the anchor records where the
//     defect was OBSERVED, not where the repair belongs — a defect anchored in the caller is
//     routinely fixed in the callee, so containment would false-refuse correct plans.
//   * `fix_role` presence (the child must contain a node of the reviewer's suggested role) is
//     advisory routing, not a contract: a planner that repairs a `fix_role: tdd-guide` finding
//     with an implementer plus a test node is legal and would be false-refused.
//   * "at least one node with a non-empty write set" is sound but useless here: it does not
//     catch the observed defect (that child HAD a docs writer), and it contradicts the
//     validator's documented affordance that a zero-writer child may satisfy an inherited
//     frontier through its named certifier alone.
// A sound check needs the child plan to DECLARE which inherited finding uids each writer owns,
// so coverage becomes set comparison rather than inference. That is a plan-grammar addition in
// the validator, not something this seam can derive from what it is handed.
function reviewSourceCarriesFrontier(source) {
  if (!source) return false;
  if (source.authority_kind === 'diagnosis_to_build') return true;
  return Array.isArray(source.findings) && source.findings.length > 0;
}

function validCaseBEvidence(request) {
  if (!request || request.transition_reason !== 'diagnosis_to_build'
      || request.planned_transition !== 'diagnosis_to_build'
      || request.parent_complete !== true || request.unresolved_review !== false
      || !Array.isArray(request.writers) || request.writers.length === 0
      || request.writers.some(writer => !writer || writer.artifacts_only !== true)
      || !['diagnosis_root_cause_digest', 'falsified_alternatives_digest', 'acceptance_contract_digest', 'recommendation_digest']
        .every(key => HEX64_RE.test(String(request[key] || '').toLowerCase()))) return false;
  return true;
}

const CASE_B_EVIDENCE_KEYS = Object.freeze([
  'diagnosis_root_cause', 'falsified_alternatives', 'acceptance_contract', 'recommendation',
]);

function validateCaseBEvidenceRows(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every(row => row && typeof row.statement === 'string'
    && row.statement.trim() && row.digest === schema.sha256Canonical({ statement: row.statement }));
}

function findCaseBArtifact(paths, digest) {
  const matches = [];
  for (const parent of ['diagnosis', 'case-b']) {
    const dir = path.join(paths.cacheDir || path.join(paths.projectDir, '.cache'), parent);
    if (!entryExists(dir)) continue;
    const walk = current => {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('case_b_evidence_path_invalid');
      for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const abs = path.join(current, entry.name);
        const child = fs.lstatSync(abs);
        if (child.isDirectory()) walk(abs);
        else if (child.isFile() && !child.isSymbolicLink() && child.nlink === 1) {
          if (schema.sha256Hex(fs.readFileSync(abs)) === digest) matches.push(abs);
        } else throw new Error('case_b_evidence_path_invalid');
      }
    };
    walk(dir);
  }
  if (matches.length !== 1) return null;
  const abs = matches[0];
  const rel = path.relative(paths.projectDir, abs).replace(/\\/g, '/');
  return { abs, path: rel, digest, value: JSON.parse(readAuthorityText(abs)) };
}

function verifyCaseBProof(paths, parentPlan, source, transitionReason, lineageInput) {
  if (transitionReason !== 'diagnosis_to_build') {
    return { ok: false, reason: 'case_b_reason_invalid' };
  }
  const meta = metaFields(parentPlan);
  if (meta.contract_version !== '2' || meta.planned_transition !== 'diagnosis_to_build') {
    return { ok: false, reason: 'case_b_parent_meta_invalid' };
  }
  const nodes = validator.parseNodes(parentPlan);
  const ledger = validator.parseLedger(parentPlan);
  if (!nodes.length || nodes.some(node => node.role !== 'finalize' && ledger.get(node.id) !== 'complete')) {
    return { ok: false, reason: 'case_b_parent_incomplete' };
  }
  const verifiedArtifacts = {};
  const allowedPaths = new Set();
  const metaKeys = {
    diagnosis_root_cause: 'diagnosis_root_cause_digest',
    falsified_alternatives: 'falsified_alternatives_digest',
    acceptance_contract: 'acceptance_contract_digest',
    recommendation: 'recommendation_digest',
  };
  for (const key of CASE_B_EVIDENCE_KEYS) {
    const digest = String(meta[metaKeys[key]] || '').toLowerCase();
    if (!HEX64_RE.test(digest)) {
      return { ok: false, reason: 'case_b_evidence_invalid', field: key };
    }
    let record;
    try { record = findCaseBArtifact(paths, digest); }
    catch (error) { return { ok: false, reason: error.message, field: key }; }
    if (!record) return { ok: false, reason: 'case_b_evidence_missing', field: key };
    const value = record.value;
    if (!value || value.schema_version !== 2 || value.status !== 'diagnosis_complete'
        || value.terminal !== true || value.kind !== (key === 'recommendation' ? 'recommended_shape' : key)) {
      return { ok: false, reason: 'case_b_evidence_type_invalid', field: key };
    }
    if (key === 'diagnosis_root_cause'
        && (!(typeof value.root_cause === 'string' && value.root_cause.trim())
          || !validateCaseBEvidenceRows(value.evidence))) {
      return { ok: false, reason: 'case_b_evidence_content_invalid', field: key };
    }
    if (key === 'falsified_alternatives'
        && (!Array.isArray(value.alternatives) || !value.alternatives.length
          || value.alternatives.some(row => !row || typeof row.alternative !== 'string'
            || !row.alternative.trim() || row.result !== 'falsified'
            || !validateCaseBEvidenceRows(row.evidence)))) {
      return { ok: false, reason: 'case_b_evidence_content_invalid', field: key };
    }
    if (key === 'acceptance_contract'
        && (!Array.isArray(value.acceptance_criteria) || !value.acceptance_criteria.length
          || value.acceptance_criteria.some(row => typeof row !== 'string' || !row.trim()))) {
      return { ok: false, reason: 'case_b_evidence_content_invalid', field: key };
    }
    if (key === 'recommendation'
        && (!(typeof value.recommended_shape === 'string' && value.recommended_shape.trim())
          || !(typeof value.rationale === 'string' && value.rationale.trim()))) {
      return { ok: false, reason: 'case_b_evidence_content_invalid', field: key };
    }
    const rel = record.path;
    allowedPaths.add('kaola-workflow/' + paths.project + '/' + rel);
    allowedPaths.add(rel);
    verifiedArtifacts[key] = { path: rel, digest, kind: value.kind, status: value.status };
  }
  const allowedRoles = new Set(['code-explorer', 'knowledge-lookup', 'code-architect', 'planner',
    'implementer', 'tdd-guide']);
  const writers = [];
  for (const node of nodes) {
    if (!node.writeSet || node.writeSet.size === 0) continue;
    if (!allowedRoles.has(node.role)) return { ok: false, reason: 'case_b_writer_role_invalid', node: node.id };
    const writes = Array.from(node.writeSet).sort();
    if (!writes.length || writes.some(file => !allowedPaths.has(String(file).replace(/\\/g, '/')))) {
      return { ok: false, reason: 'case_b_writer_surface_invalid', node: node.id };
    }
    writers.push({ id: node.id, role: node.role, artifacts_only: true, write_set: writes });
  }
  if (!writers.length) return { ok: false, reason: 'case_b_writer_missing' };
  let lineage = lineageInput || null;
  if (!lineage) {
    try {
      const state = parseStateFields(readAuthorityText(path.join(paths.projectDir, 'workflow-state.md')));
      lineage = { epoch_lineage_id: state.epoch_lineage_id,
        claim_identity_digest: state.claim_identity_digest, claim_root_base_digest: state.claim_root_base_digest };
    } catch (_) { lineage = {}; }
  }
  const ledgerRows = Array.from(ledger.entries()).map(([id, status]) => ({ id, status }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const payload = {
    schema_version: 2,
    transition_reason: 'diagnosis_to_build',
    parent_plan_hash: validator.readStoredHash(parentPlan),
    parent_plan_exact_digest: schema.sha256Hex(Buffer.from(parentPlan, 'utf8')),
    completed_ledger: ledgerRows,
    artifacts: verifiedArtifacts,
    writers,
    recommended_shape_digest: verifiedArtifacts.recommendation.digest,
    epoch_lineage_id: lineage.epoch_lineage_id,
    claim_identity_digest: lineage.claim_identity_digest,
    claim_root_base_digest: lineage.claim_root_base_digest,
  };
  if (![payload.epoch_lineage_id, payload.claim_identity_digest, payload.claim_root_base_digest]
    .every(value => HEX64_RE.test(String(value || '')))) {
    return { ok: false, reason: 'case_b_lineage_invalid' };
  }
  return { ok: true, payload, proof_digest: schema.sha256Canonical(payload),
    request: {
      transition_reason: 'diagnosis_to_build', planned_transition: 'diagnosis_to_build',
      parent_complete: true, unresolved_review: false, writers,
      diagnosis_root_cause_digest: verifiedArtifacts.diagnosis_root_cause.digest,
      falsified_alternatives_digest: verifiedArtifacts.falsified_alternatives.digest,
      acceptance_contract_digest: verifiedArtifacts.acceptance_contract.digest,
      recommendation_digest: verifiedArtifacts.recommendation.digest,
    } };
}

function readSourceAuthority(paths, parentPlan, parentPlanHash, opts, lineage) {
  const journalPath = path.join(paths.cacheDir, 'review-attempts.json');
  const outcomePath = path.join(paths.cacheDir, 'replan-source.json');
  const reviewAuthorityPresent = entryExists(journalPath) || entryExists(outcomePath);
  if (reviewAuthorityPresent) {
    if (opts.transitionReason === 'diagnosis_to_build') {
      return { ok: false, reason: 'case_b_review_authority_present' };
    }
    const review = readSource(paths, parentPlanHash, opts.sourceAttemptId,
      { verifyCandidate: true, planContent: parentPlan, lineage });
    if (!review.ok) return review;
    return Object.assign(review, { transition_reason: 'review_repair_requires_replan', case_b: null });
  }
  if (opts.transitionReason !== 'diagnosis_to_build') {
    return { ok: false, reason: 'replan_source_journal_missing' };
  }
  const proof = verifyCaseBProof(paths, parentPlan, null, 'diagnosis_to_build', lineage);
  if (!proof.ok) return proof;
  const attemptId = 'diagnosis:' + proof.proof_digest;
  const source = {
    authority_kind: 'diagnosis_to_build',
    attempt_id: attemptId,
    source_attempt_ids: [attemptId],
    source_reason: 'diagnosis_to_build',
    producer_slice: proof.payload.writers.map(row => row.id).sort(),
    findings: [],
    rebind: [],
    case_b_evidence: proof.payload.artifacts,
    scope_lineage_id: null,
    legacy_candidate_digest: null,
    legacy_candidate_residue_digest: null,
    journal_digest: null,
    handoff_digest: null,
    proof_digest: proof.proof_digest,
  };
  source.source_evidence_digest = proof.proof_digest;
  return {
    ok: true,
    source,
    attempt: { attempt_id: attemptId, validation_obligations: [], findings: [], rebind: [] },
    journal: null,
    transition_reason: 'diagnosis_to_build',
    case_b: proof,
  };
}

function evaluateTransitionBudget(state, request, authority) {
  const count = Number(state && state.automatic_review_replans || 0);
  const cachedCeiling = Number(state && state.authorized_epoch_ceiling || schema.REVIEW_REPLAN_LIMIT);
  const ceiling = authority && Number.isSafeInteger(authority.ceiling)
    ? authority.ceiling : schema.REVIEW_REPLAN_LIMIT;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(cachedCeiling)
      || cachedCeiling !== ceiling || ceiling < schema.REVIEW_REPLAN_LIMIT) {
    return { ok: false, reason: 'replan_consent_ledger_invalid', count, ceiling, cost: 1,
      case_b_exemption: false };
  }
  const consumed = state && (state.case_b_exemption_consumed === true
    || String(state.case_b_exemption_consumed) === 'true');
  const caseB = !consumed && authority && authority.case_b_verified === true
    && validCaseBEvidence(request);
  const cost = caseB ? 0 : 1;
  if (!caseB && count >= ceiling) {
    return { ok: false, reason: 'replan_consent_required', count, ceiling, cost, case_b_exemption: false };
  }
  return { ok: true, count_before: count, count_after: count + cost, ceiling, cost,
    consent_ledger_digest: authority && authority.consent_ledger_digest || null,
    case_b_proof: authority && authority.case_b_proof || null,
    case_b_exemption: caseB, case_b_exemption_consumed_after: consumed || caseB };
}

function consentAuthority(paths, epochLineageId, state) {
  let ledger = null;
  if (entryExists(paths.consentPath)) {
    try { ledger = readAuthorityJson(paths.consentPath); }
    catch (_) { return { ok: false, reason: 'replan_consent_ledger_invalid' }; }
  }
  const verified = verifyConsentLedger(ledger, epochLineageId);
  if (!verified.ok) return verified;
  const cached = Number(state.authorized_epoch_ceiling || schema.REVIEW_REPLAN_LIMIT);
  if (!Number.isSafeInteger(cached) || cached !== verified.ceiling) {
    return { ok: false, reason: 'replan_consent_ledger_invalid' };
  }
  return { ok: true, ceiling: verified.ceiling, consent_ledger_digest: verified.digest,
    ledger, entries: verified.entries };
}

function ledgerDigest(planContent) {
  const ledger = validator.parseLedger(planContent);
  const rows = Array.from(ledger.entries()).map(([id, status]) => ({ id, status }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return schema.sha256Canonical(rows);
}

function authorityStateView(fields) {
  const stable = [
    'epoch_schema_version', 'claim_repository_id', 'claim_identity_digest',
    'claim_root_object_format', 'claim_root_base_commit', 'claim_root_base_tree',
    'claim_root_base_digest', 'epoch_lineage_id', 'plan_epoch', 'active_plan_hash',
    'inherited_frontier_digest', 'inherited_frontier_classes', 'automatic_review_replans',
    'authorized_epoch_ceiling', 'case_b_exemption_consumed', 'active_snapshot_manifest_digest',
  ];
  const out = {};
  for (const key of stable) out[key] = fields && fields[key] == null ? 'none' : String(fields[key]);
  return out;
}

function buildSnapshotAuthorityProjection(transaction) {
  return {
    schema_version: 2,
    epoch_lineage_id: transaction.epoch_lineage_id,
    parent_plan_epoch: transaction.parent.plan_epoch,
    transaction_id: transaction.transaction_id,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    parent: {
      plan_hash: transaction.parent.plan_hash,
      plan_exact_digest: transaction.parent.plan_digest,
      task_mirror_exact_digest: transaction.parent.task_mirror_exact_digest,
      ledger_semantic_digest: transaction.parent.ledger_digest,
      state_authority_digest: transaction.parent.state_authority_digest,
    },
    source: {
      source_evidence_digest: transaction.source.source_evidence_digest,
      review_journal_digest: transaction.source.journal_digest,
      findings_digest: schema.sha256Canonical(transaction.source.findings || []),
      rebind_digest: schema.sha256Canonical(transaction.source.rebind || []),
    },
    entry_cas: casTuple(transaction.cas.prepare),
  };
}

function replacePlanningHash(content, hash) {
  const text = String(content);
  if (/^plan_hash:[ \t]*.*$/m.test(text)) return text.replace(/^plan_hash:[ \t]*.*$/m, 'plan_hash: ' + hash);
  const heading = /^## Planning Evidence[ \t]*$/m.exec(text);
  if (heading) {
    const end = text.indexOf('\n', heading.index);
    return text.slice(0, end + 1) + 'plan_hash: ' + hash + '\n' + text.slice(end + 1);
  }
  const sink = /^## Sink[ \t]*$/m.exec(text);
  const block = '## Planning Evidence\nplan_hash: ' + hash + '\n\n';
  return sink ? text.slice(0, sink.index) + block + text.slice(sink.index) : text + '\n' + block;
}

function planningRiskLine(risk) {
  const value = risk || {};
  const reasons = Array.isArray(value.reasons) && value.reasons.length ? value.reasons.join('; ') : '—';
  return 'sensitivity=' + Boolean(value.sensitivity)
    + ' blast_radius=' + Boolean(value.blastRadius)
    + ' uncertain=' + Boolean(value.uncertain)
    + ' reasons=' + reasons;
}

function replacePlanningEvidence(content, child) {
  const text = String(content);
  const block = [
    '## Planning Evidence',
    'plan_hash: ' + child.plan_hash,
    'decision: ' + child.decision,
    'risk: ' + child.risk_line,
    'first_node_id: ' + child.first_node_id,
    'first_node_role: ' + child.first_node_role,
    '',
  ].join('\n');
  const heading = /^## Planning Evidence[ \t]*$/m.exec(text);
  if (heading) {
    const next = /^## [^\n]+[ \t]*$/gm;
    next.lastIndex = heading.index + heading[0].length;
    const following = next.exec(text);
    return text.slice(0, heading.index) + block + text.slice(following ? following.index : text.length);
  }
  const sink = /^## Sink[ \t]*$/m.exec(text);
  return sink ? text.slice(0, sink.index) + block + text.slice(sink.index) : text + '\n' + block;
}

function sectionTableRows(content, heading) {
  const match = new RegExp('^## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*$', 'm').exec(content);
  if (!match) return [];
  const rest = content.slice(match.index + match[0].length).split(/\r?\n/);
  const lines = [];
  for (const line of rest) {
    if (/^## /.test(line)) break;
    if (/^\|.*\|[ \t]*$/.test(line)) lines.push(line);
  }
  if (lines.length < 2) return [];
  const header = lines[0].split('|').slice(1, -1).map(value => value.trim().toLowerCase());
  return lines.slice(1).filter(line => !/^\|(?:[ :|-]+\|)+[ \t]*$/.test(line)).map(line => {
    const cells = line.split('|').slice(1, -1).map(value => value.trim());
    return Object.fromEntries(header.map((name, index) => [name, cells[index] || '']));
  });
}

function sectionHasOnlyTableContent(content, heading) {
  const match = new RegExp('^## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*$', 'm').exec(content);
  if (!match) return false;
  const rest = content.slice(match.index + match[0].length).split(/\r?\n/);
  for (const line of rest) {
    if (/^## /.test(line)) break;
    if (line.trim() && !/^\|.*\|[ \t]*$/.test(line)) return false;
  }
  return true;
}

// `opts.deferReasons` is an OPT-IN caller policy: a Set/array of reasons the caller is
// prepared to handle itself. Only the four RUN-STATE PROGRESS tiers below (ledger
// authority/progress, compliance authority/progress) can be deferred — they are the only
// tiers nothing later in the ladder reads, so evaluation can legally continue past them.
// A deferred failure is recorded and the remaining tiers (epoch position, replan
// transaction, committed-transaction history) still run; any failure that is NOT deferrable
// returns immediately, exactly as the default does. Without the option every tier returns on
// its first failure, so every existing caller is byte-identical.
//
// This is what makes a caller's "these reasons are downgradable" policy true rather than
// merely intended: a downgradable failure can no longer hide the tiers behind it, because
// the ladder is finished before the verdict is formed, and the verdict names EVERY failure.
function verifyCurrentEpochAuthority(projectDir, opts) {
  const deferSet = opts && opts.deferReasons
    ? (typeof opts.deferReasons.has === 'function'
      ? opts.deferReasons : new Set(opts.deferReasons))
    : null;
  const deferred = [];
  // Returns true when the caller authorized deferring this reason (failure recorded,
  // evaluation continues); false means the caller must return the refusal now.
  const deferFailure = (reason, extra) => {
    if (!deferSet || !deferSet.has(reason)) return false;
    deferred.push(Object.assign({ reason }, extra || {}));
    return true;
  };
  const statePath = path.join(projectDir, 'workflow-state.md');
  if (!fs.existsSync(statePath)) return schema.refuse('state_missing');
  const state = parseStateFields(fs.readFileSync(statePath, 'utf8'));
  const epochAuthority = schema.validateEpochStateAuthority(state);
  if (!epochAuthority.ok) return schema.refuse(epochAuthority.reason);
  // A pre-#699 state carries no epoch envelope at all (validateEpochStateAuthority
  // returns legacy). The schema-2 active/planless split below never applied to it:
  // active_plan_hash defaults to 'none' and would force every legacy project —
  // planned or not — down the strict planless branch. Accept it here, restoring the
  // pre-#699 acceptance the archive/finalize consumers had before this gate existed.
  // Only an envelope-absent state reaches this branch; a partially stripped schema-2
  // state already refused above, so this cannot launder a tampered current authority.
  if (epochAuthority.legacy) return { ok: true, authority_kind: 'legacy' };
  const planPath = path.join(projectDir, 'workflow-plan.md');
  const taskPath = path.join(projectDir, 'workflow-tasks.json');
  const snapshotsDir = path.join(projectDir, '.cache', 'epochs');
  const snapshotCount = fs.existsSync(snapshotsDir)
    ? fs.readdirSync(snapshotsDir).filter(name => /^\d+$/.test(name)).length : 0;
  const activeHash = state.active_plan_hash || 'none';
  const planningHash = state.plan_hash || 'none';
  if (activeHash === 'none') {
    const transactionPath = path.join(projectDir, '.cache', schema.REPLAN_TRANSACTION_NAME);
    if (Number(state.plan_epoch || 1) !== 1 || planningHash !== 'none' || fs.existsSync(planPath)
        || (state.first_node_id || 'none') !== 'none'
        || (state.first_node_role || 'none') !== 'none' || snapshotCount !== 0
        || (state.active_snapshot_manifest_digest || 'none') !== 'none'
        || fs.existsSync(transactionPath)) {
      return schema.refuse('state_planless_authority_invalid');
    }
    if (fs.existsSync(taskPath)) {
      try {
        const mirror = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
        if (mirror && (mirror.source_plan_hash || (Array.isArray(mirror.tasks) && mirror.tasks.length))) {
          return schema.refuse('state_planless_authority_invalid');
        }
      } catch (_) { return schema.refuse('state_planless_authority_invalid'); }
    }
    return { ok: true, authority_kind: 'planless' };
  }
  if (!fs.existsSync(planPath)) return schema.refuse('state_active_plan_missing');
  const plan = fs.readFileSync(planPath, 'utf8');
  const exactHash = validator.readStoredHash(plan);
  if (!exactHash || exactHash !== validator.computePlanHash(plan)) return schema.refuse('state_active_plan_invalid');
  if (planningHash !== activeHash || exactHash !== activeHash) return schema.refuse('state_active_plan_hash_mismatch');
  const nodes = validator.parseNodes(plan);
  if (!nodes.length) return schema.refuse('state_active_plan_invalid');
  if (state.first_node_id !== nodes[0].id || state.first_node_role !== nodes[0].role) {
    return schema.refuse('state_planning_evidence_stale_first_node');
  }
  const ledgerRows = sectionTableRows(plan, 'Node Ledger');
  const nodeIds = nodes.map(node => node.id);
  // A deferred ledger tier leaves no trustworthy status map, so the two progress checks
  // that READ it are skipped rather than evaluated against garbage; their own tiers are
  // moot once the table they project is already reported broken.
  let ledger = null;
  if (ledgerRows.length !== nodes.length
      || new Set(ledgerRows.map(row => row.id)).size !== nodes.length
      || ledgerRows.some(row => !nodeIds.includes(row.id)
        || !['pending', 'in_progress', 'complete', 'n/a'].includes(row.status))) {
    if (!deferFailure('state_ledger_authority_invalid')) return schema.refuse('state_ledger_authority_invalid');
  } else {
    ledger = new Map(ledgerRows.map(row => [row.id, row.status]));
  }
  if (ledger) {
    for (const node of nodes) {
      if (['in_progress', 'complete', 'n/a'].includes(ledger.get(node.id))
          && node.dependsOn.some(dep => !['complete', 'n/a'].includes(ledger.get(dep)))) {
        if (!deferFailure('state_ledger_progress_invalid')) return schema.refuse('state_ledger_progress_invalid');
        break;
      }
    }
  }
  const complianceAuthority = validator.validateRequiredAgentCompliance(plan, nodes);
  let complianceRows = null;
  if (!complianceAuthority.ok) {
    const complianceDetail = { detail: complianceAuthority.detail || complianceAuthority.reason };
    if (!deferFailure('state_compliance_authority_invalid', complianceDetail)) {
      return schema.refuse('state_compliance_authority_invalid', complianceDetail);
    }
  } else {
    complianceRows = complianceAuthority.rows;
  }
  if (complianceRows && ledger) {
    const expectedRequirements = new Map(nodes.map(node => [node.role + ' (' + node.id + ')', node.id]));
    for (const row of complianceRows) {
      const id = expectedRequirements.get(row.requirement);
      const status = String(row.status || '').toLowerCase();
      if (ledger.get(id) === 'complete' && (status === 'pending'
          || (!row.evidence && !row.skip_reason))) {
        if (!deferFailure('state_compliance_progress_invalid')) return schema.refuse('state_compliance_progress_invalid');
        break;
      }
    }
  }
  // `workflow-tasks.json` is NOT an authority tier and is deliberately not compared here.
  // It is a pure projection of this very plan — `generateMirror` derives its source hash,
  // its row set, and every row's status from the same `readStoredHash`/`parseNodes`/
  // `parseLedger` reads this function has already performed — with exactly one writer
  // (the task-mirror CLI) and no consumer that reads its CONTENT for a decision. Comparing
  // it against re-derivations of its own input can only report that some caller has not
  // regenerated it yet, which is a lag in a regenerable file, never a divergent authority.
  // Worse, it was fail-CLOSED over a surface whose write is deliberately fail-OPEN, and it
  // ran in a prologue that precedes `orient` — the designated mirror reconciler — so a
  // settlement that legally rewinds ledger rows without regenerating (or any swallowed
  // mirror-write fault) wedged the project with `legal_mutation: "none"` and no in-band
  // exit. The immutable exact-hash tier and the ledger/compliance tiers above already carry
  // every authority claim this block could make.
  const fields = metaFields(plan);
  if (fields.plan_epoch && Number(fields.plan_epoch) !== Number(state.plan_epoch)) {
    return schema.refuse('state_epoch_position_mismatch');
  }
  const transactionPath = path.join(projectDir, '.cache', schema.REPLAN_TRANSACTION_NAME);
  if (fs.existsSync(transactionPath)) {
    let transaction;
    try { transaction = JSON.parse(fs.readFileSync(transactionPath, 'utf8')); }
    catch (_) { return schema.refuse('replan_transaction_invalid'); }
    const checked = schema.validateReplanTransaction(transaction);
    if (!checked.ok) return schema.refuse(checked.reason);
    if (transaction.phase === 'committed' && transaction.outcome === 'committed') {
      if (transaction.epoch_lineage_id !== state.epoch_lineage_id
          || transaction.parent.claim_root_base_digest !== state.claim_root_base_digest
          || transaction.parent.plan_epoch + 1 !== Number(state.plan_epoch)
          || transaction.child.plan_hash !== activeHash
          || transaction.child.first_node_id !== nodes[0].id
          || transaction.child.first_node_role !== nodes[0].role
          || transaction.snapshot.manifest_digest !== state.active_snapshot_manifest_digest
          || transaction.budget.prospective_count_after !== Number(state.automatic_review_replans)
          || transaction.budget.ceiling !== Number(state.authorized_epoch_ceiling)
          || state.replan_status !== 'none' || state.replan_phase !== 'committed'
          || state.replan_transaction_id !== transaction.transaction_id) {
        return schema.refuse('state_epoch_receipt_mismatch');
      }
      const history = readCommittedTransactionAuthority(projectDir, transaction.transaction_id);
      if (!history.ok) return schema.refuse(history.reason, { detail: history.detail || null });
    }
  }
  // The ladder ran to completion and every failure it met was one the caller authorized
  // deferring. Report the whole failure list, not just the first: a caller downgrading on
  // reason membership must be able to check EVERY reason it is about to accept.
  if (deferred.length) {
    return Object.assign(
      schema.refuse(deferred[0].reason, deferred[0].detail ? { detail: deferred[0].detail } : undefined),
      { deferrable_only: true, deferred_failures: deferred });
  }
  return { ok: true, authority_kind: 'planned', plan_hash: activeHash,
    first_node_id: nodes[0].id, first_node_role: nodes[0].role,
    mutable_progress_digest: schema.sha256Canonical({
      ledger: ledgerRows, compliance: complianceRows,
    }) };
}

function verifyActivePlanningEvidence(projectDir) {
  return verifyCurrentEpochAuthority(projectDir);
}

function stateWithFence(baseContent, lineage, transaction, values) {
  const baseFields = parseStateFields(baseContent);
  const fields = Object.assign({
    epoch_schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_repository_id: lineage.claim_identity.repository_id,
    claim_identity_digest: lineage.claim_identity_digest,
    claim_root_object_format: lineage.claim_root_base.object_format,
    claim_root_base_commit: lineage.claim_root_base.commit,
    claim_root_base_tree: lineage.claim_root_base.tree,
    claim_root_base_digest: lineage.claim_root_base_digest,
    epoch_lineage_id: lineage.epoch_lineage_id,
    plan_epoch: transaction.parent.plan_epoch,
    active_plan_hash: transaction.parent.plan_hash,
    inherited_frontier_digest: transaction.cas.prepare.inherited_frontier_digest,
    inherited_frontier_classes: transaction.source.inherited_frontier_classes,
    automatic_review_replans: transaction.budget.count_before,
    authorized_epoch_ceiling: transaction.budget.ceiling,
    case_b_exemption_consumed: transaction.budget.case_b_exemption_consumed_before,
    replan_status: transaction.outcome === 'consent_halt' ? 'consent_halt' : 'in_progress',
    replan_transaction_id: transaction.transaction_id,
    replan_phase: transaction.phase,
    active_snapshot_manifest_digest: baseFields.active_snapshot_manifest_digest || 'none',
  }, values || {});
  return schema.writeEpochStateBlock(replacePlanningHash(baseContent, fields.active_plan_hash), fields);
}

function transactionActivationJournal() {
  const out = {};
  for (const step of schema.REPLAN_ACTIVATION_STEPS) out[step] = { status: 'not_started', digest: null, at: null };
  return out;
}

function plannerDispatchNonce(transactionId, plannerAttempt) {
  return schema.sha256Canonical({
    transaction_id: transactionId,
    role: 'workflow-planner',
    planner_attempt: plannerAttempt,
  }).slice(0, 12);
}

function buildTransaction(paths, opts, parentPlan, parentState, lineage, source, attempt, observation, budget) {
  const parentPlanHash = validator.readStoredHash(parentPlan);
  const parentEpoch = Number(parseStateFields(parentState).plan_epoch || 1);
  const transactionId = schema.sha256Canonical({
    schema_version: schema.REPLAN_TRANSACTION_SCHEMA_VERSION,
    epoch_lineage_id: lineage.epoch_lineage_id,
    parent_plan_epoch: parentEpoch,
    parent_plan_hash: parentPlanHash,
    source_reason: source.source_reason,
    source_attempt_ids: source.source_attempt_ids.slice().sort(),
    prepare_candidate_digest: observation.candidate_digest,
    prepare_inherited_frontier_digest: observation.inherited_frontier_digest,
  });
  const createdAt = nowIso(opts);
  const dispatchNonce = plannerDispatchNonce(transactionId, 1);
  const transaction = {
    schema_version: schema.REPLAN_TRANSACTION_SCHEMA_VERSION,
    transaction_id: transactionId,
    epoch_lineage_id: lineage.epoch_lineage_id,
    planner_attempt: 1,
    phase: 'prepared',
    outcome: 'in_progress',
    transition_reason: opts.transitionReason,
    transition_cost: budget.cost,
    case_b_exemption: budget.case_b_exemption,
    created_at: createdAt,
    updated_at: createdAt,
    predecessor: opts.predecessor || null,
    parent: {
      plan_epoch: parentEpoch,
      contract_version: lineage.legacy ? 1 : 2,
      plan_hash: parentPlanHash,
      plan_digest: schema.sha256Hex(Buffer.from(parentPlan, 'utf8')),
      plan_bytes_base64: Buffer.from(parentPlan, 'utf8').toString('base64'),
      ledger_digest: ledgerDigest(parentPlan),
      task_mirror_exact_digest: exactDigest(path.join(paths.projectDir, 'workflow-tasks.json')),
      state_pre_fence_digest: schema.sha256Hex(Buffer.from(parentState, 'utf8')),
      state_bytes_base64: Buffer.from(parentState, 'utf8').toString('base64'),
      state_authority_digest: null,
      claim_identity: lineage.claim_identity,
      claim_identity_digest: lineage.claim_identity_digest,
      claim_root_base: lineage.claim_root_base,
      claim_root_base_digest: lineage.claim_root_base_digest,
      legacy_import: lineage.legacy,
    },
    source: Object.assign({}, source, {
      rotated_from: opts.rotatedSource || null,
      inherited_frontier_classes: observation.inherited_frontier_classes,
      prepare_candidate_view: observation.candidate_view,
      prepare_inherited_frontier_view: observation.inherited_frontier_view,
      effective_candidate_digest: observation.candidate_digest,
      validation_obligations: Array.isArray(attempt.validation_obligations) ? attempt.validation_obligations : [],
    }),
    cas: {
      prepare: Object.assign({ seam: 'prepare', result: 'match' }, observation),
      pre_freeze: null,
      pre_snapshot: null,
      pre_activation: null,
    },
    budget: {
      count_before: budget.count_before,
      prospective_count_after: budget.count_after,
      ceiling: budget.ceiling,
      transition_cost: budget.cost,
      case_b_exemption: budget.case_b_exemption,
      case_b_exemption_consumed_before: String(parseStateFields(parentState).case_b_exemption_consumed || 'false') === 'true',
      case_b_exemption_consumed_after: budget.case_b_exemption_consumed_after,
      consent_ledger_digest: budget.consent_ledger_digest || null,
      case_b_proof: budget.case_b_proof || null,
    },
    planner: {
      packet_path: '.cache/' + schema.REPLAN_PLANNER_PACKET_NAME,
      child_path: schema.REPLAN_PLAN_NEXT_NAME,
      packet_digest: null,
      dispatch_nonce: dispatchNonce,
      profile_identity: 'workflow-planner-replan-v1',
      pending_at: null,
      attestation_digest: null,
      output_precondition: 'absent_or_empty',
      child_repair_attempts: 0,
    },
    child: {
      contract_version: null,
      digest: null,
      plan_hash: null,
      semantic_digest: null,
      ledger_digest: null,
      all_pending: null,
      freeze_time: null,
      bytes_base64: null,
    },
    // #737: the image the planner actually signed, plus the frozen witness the freeze
    // produced from it. Recorded at planner_pending / freeze time; read only as digests.
    child_authored: null,
    snapshot: {
      epoch_path: '.cache/epochs/' + parentEpoch,
      authority_projection: null,
      authority_digest: null,
      manifest_digest: null,
      manifest_self_digest: null,
      verified: false,
    },
    activation: transactionActivationJournal(),
    attempts: [],
    failure: null,
  };
  const expectedFencedState = stateWithFence(parentState, lineage, transaction);
  transaction.parent.state_authority_digest = schema.sha256Canonical(
    authorityStateView(parseStateFields(expectedFencedState)));
  transaction.snapshot.authority_projection = buildSnapshotAuthorityProjection(transaction);
  transaction.snapshot.authority_digest = schema.sha256Canonical(transaction.snapshot.authority_projection);
  return transaction;
}

function verifyParentAuthority(paths, transaction) {
  let plan;
  let state;
  try { plan = readAuthorityText(paths.planPath); state = readAuthorityText(paths.statePath); }
  catch (error) { return { ok: false, reason: 'replan_parent_missing', detail: error.message }; }
  if (schema.sha256Hex(Buffer.from(plan, 'utf8')) !== transaction.parent.plan_digest
      || validator.readStoredHash(plan) !== transaction.parent.plan_hash) {
    return { ok: false, reason: 'replan_parent_plan_changed' };
  }
  const authority = schema.sha256Canonical(authorityStateView(parseStateFields(state)));
  if (authority !== transaction.parent.state_authority_digest) {
    if (transaction.phase === 'prepared'
        && schema.sha256Hex(Buffer.from(state, 'utf8')) === transaction.parent.state_pre_fence_digest) {
      return { ok: true, plan, state, state_needs_fence: true };
    }
    return { ok: false, reason: 'replan_parent_state_changed' };
  }
  return { ok: true, plan, state };
}

function verifySourceAuthority(paths, transaction) {
  // #729 frontier: every resume phase routes through here, so this is the single wall that
  // covers the STORED frontier at `prepared` (before the planner packet copies it verbatim),
  // at `planner_pending` (before the child freeze), and at `child_frozen`/`parent_archived`
  // (before the snapshot authority projection digests it). The readSource re-read below only
  // proves the source on DISK is unchanged and digest-identical — it never inspects the
  // transaction's own copy of `findings`, which validateReplanTransaction does not recompute
  // either. Without this the empty array survives the whole transaction unexamined.
  if (!reviewSourceCarriesFrontier(transaction.source)) {
    return { ok: false, reason: 'replan_source_findings_missing', detail: 'stored_frontier_empty' };
  }
  if (transaction.source.authority_kind === 'diagnosis_to_build') {
    const parentPlan = Buffer.from(transaction.parent.plan_bytes_base64, 'base64').toString('utf8');
    const proof = verifyCaseBProof(paths, parentPlan, null, 'diagnosis_to_build', {
      epoch_lineage_id: transaction.epoch_lineage_id,
      claim_identity_digest: transaction.parent.claim_identity_digest,
      claim_root_base_digest: transaction.parent.claim_root_base_digest,
    });
    return proof.ok && proof.proof_digest === transaction.source.source_evidence_digest
      ? { ok: true } : { ok: false, reason: proof.reason || 'replan_source_changed' };
  }
  const journalPath = path.join(paths.cacheDir, 'review-attempts.json');
  const sourcePath = path.join(paths.cacheDir, 'replan-source.json');
  try {
    if (exactDigest(journalPath) !== transaction.source.journal_digest
        || exactDigest(sourcePath) !== transaction.source.handoff_digest) {
      return { ok: false, reason: 'replan_source_changed' };
    }
  } catch (_) { return { ok: false, reason: 'replan_source_changed' }; }
  const reread = readSource(paths, transaction.parent.plan_hash, transaction.source.attempt_id,
    { planContent: Buffer.from(transaction.parent.plan_bytes_base64, 'base64').toString('utf8'), lineage: {
      epoch_lineage_id: transaction.epoch_lineage_id,
      claim_identity_digest: transaction.parent.claim_identity_digest,
      claim_root_base_digest: transaction.parent.claim_root_base_digest,
    } });
  if (!reread.ok || reread.source.source_evidence_digest !== transaction.source.source_evidence_digest) {
    return { ok: false, reason: reread.reason || 'replan_source_changed' };
  }
  return { ok: true };
}

function updateTransaction(paths, transaction, opts, label) {
  transaction.updated_at = nowIso(opts);
  durableWriteJson(paths.transactionPath, transaction, opts, label);
}

function updateFenceState(paths, transaction, opts, values, label) {
  const current = readAuthorityText(paths.statePath);
  const lineage = {
    claim_identity: transaction.parent.claim_identity,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_base: transaction.parent.claim_root_base,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    epoch_lineage_id: transaction.epoch_lineage_id,
  };
  durableWriteFile(paths.statePath, stateWithFence(current, lineage, transaction, values), opts, label);
}

function historyReceipt(relPath, bytes, extra) {
  return Object.assign({
    path: relPath,
    digest: schema.sha256Hex(bytes),
    size: bytes.length,
  }, extra || {});
}

// `historyBytes` lets a caller supply the exact committed bytes it already holds
// (the rotated `.cache/committed-transactions/{id}.json` copy) instead of the live
// `.cache/replan-transaction.json`. Every proof below is unchanged and still runs
// over whichever bytes were selected.
function describeCommittedRotation(paths, transaction, historyBytes) {
  if (!transaction) return { ok: true, predecessor: null, predecessor_bytes: null,
    rotated_source: null, rotated_source_bytes: null };
  let transactionBytes = historyBytes || null;
  if (!transactionBytes) {
    try { transactionBytes = readAuthorityBytes(paths.transactionPath); }
    catch (error) { return { ok: false, reason: 'replan_transaction_history_unreadable', detail: error.message }; }
  }
  let parsed;
  try { parsed = JSON.parse(transactionBytes.toString('utf8')); }
  catch (_) { return { ok: false, reason: 'replan_transaction_history_invalid' }; }
  const checked = schema.validateReplanTransaction(parsed);
  if (!checked.ok || parsed.transaction_id !== transaction.transaction_id
      || parsed.phase !== 'committed' || parsed.outcome !== 'committed'
      || !activationComplete(parsed, 'state_unfenced')) {
    return { ok: false, reason: 'replan_transaction_history_invalid' };
  }
  const predecessor = historyReceipt(
    '.cache/committed-transactions/' + transaction.transaction_id + '.json',
    transactionBytes,
    { transaction_id: transaction.transaction_id, schema_version: transaction.schema_version });
  let rotatedSource = null;
  let rotatedSourceBytes = null;
  if (transaction.source.authority_kind !== 'diagnosis_to_build') {
    try {
      const epochDir = path.join(paths.epochsDir, String(transaction.parent.plan_epoch));
      // The transaction's source was frozen into its parent snapshot before
      // activation. Read that immutable copy; the live producer may already
      // have published the successor source.
      rotatedSourceBytes = readSnapshotFile(epochDir, '.cache/replan-source.json');
      if (schema.sha256Hex(rotatedSourceBytes) !== transaction.source.handoff_digest) {
        return { ok: false, reason: 'replan_source_history_mismatch' };
      }
      const digest = schema.sha256Hex(rotatedSourceBytes);
      rotatedSource = historyReceipt('.cache/replan-sources/' + digest + '.json', rotatedSourceBytes,
        { transaction_id: transaction.transaction_id });
    } catch (error) {
      return { ok: false, reason: 'replan_source_history_unreadable', detail: error.message };
    }
  }
  return { ok: true, predecessor, predecessor_bytes: transactionBytes,
    rotated_source: rotatedSource, rotated_source_bytes: rotatedSourceBytes };
}

function persistCommittedRotation(paths, rotation, opts) {
  try {
    if (rotation.predecessor) {
      const predecessorPath = path.join(paths.projectDir, ...rotation.predecessor.path.split('/'));
      durableCreateExclusiveFile(predecessorPath, rotation.predecessor_bytes, opts, 'after_predecessor_history');
      const reread = readAuthorityBytes(predecessorPath);
      if (reread.length !== rotation.predecessor.size
          || schema.sha256Hex(reread) !== rotation.predecessor.digest) {
        return { ok: false, reason: 'replan_transaction_history_mismatch' };
      }
    }
    if (rotation.rotated_source) {
      const sourcePath = path.join(paths.projectDir, ...rotation.rotated_source.path.split('/'));
      durableCreateExclusiveFile(sourcePath, rotation.rotated_source_bytes, opts, 'after_source_history');
      const reread = readAuthorityBytes(sourcePath);
      if (reread.length !== rotation.rotated_source.size
          || schema.sha256Hex(reread) !== rotation.rotated_source.digest) {
        return { ok: false, reason: 'replan_source_history_mismatch' };
      }
    }
  } catch (error) {
    if (error && error.code === 'KAOLA_REPLAN_FAILPOINT') throw error;
    return { ok: false, reason: error.message === 'history_receipt_collision'
      ? 'replan_history_receipt_collision' : 'replan_history_write_failed', detail: error.message };
  }
  return { ok: true };
}

// The live `.cache/replan-transaction.json` is the only place a committed
// predecessor is normally read from, so a sanctioned scratch reset that removes it
// would silently author an epoch >= 3 successor with `predecessor: null` — a
// transaction the schema-2 lineage validator correctly refuses on the next read.
// The durable `.cache/committed-transactions/` receipts survive that reset (they
// are not cleanup-eligible), so the predecessor is recoverable from them.
//
// Identity is filtered FIRST so ambiguity is decided on the merits of the lineage
// match, never on a shape defect elsewhere in the directory. Every surviving proof
// is delegated to the existing authority helpers.
function recoverCommittedRotation(paths, parentPlanHash, parentEpoch, lineage) {
  let names;
  try { names = fs.readdirSync(paths.transactionHistoryDir).sort(); }
  catch (_) { names = []; }
  const matched = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const stem = name.slice(0, -'.json'.length);
    if (!HEX64_RE.test(stem)) continue;
    let bytes;
    let candidate;
    try {
      bytes = readAuthorityBytes(path.join(paths.transactionHistoryDir, name));
      candidate = JSON.parse(bytes.toString('utf8'));
    } catch (_) { continue; }
    if (!candidate || typeof candidate !== 'object' || candidate.schema_version !== 2) continue;
    if (candidate.transaction_id !== stem) continue;
    if (!candidate.parent || !candidate.child || !candidate.source) continue;
    if (candidate.child.plan_hash !== parentPlanHash) continue;
    if (Number(candidate.parent.plan_epoch) + 1 !== Number(parentEpoch)) continue;
    if (candidate.epoch_lineage_id !== lineage.epoch_lineage_id) continue;
    if (candidate.parent.claim_identity_digest !== lineage.claim_identity_digest) continue;
    if (candidate.parent.claim_root_base_digest !== lineage.claim_root_base_digest) continue;
    matched.push({ transaction: candidate, bytes });
  }
  if (matched.length !== 1) {
    return { ok: false, reason: 'replan_committed_predecessor_unresolved',
      detail: matched.length ? 'ambiguous_committed_predecessor' : 'no_committed_predecessor',
      matched: matched.length };
  }
  const [only] = matched;
  const receipt = historyReceipt(
    '.cache/committed-transactions/' + only.transaction.transaction_id + '.json',
    only.bytes,
    { transaction_id: only.transaction.transaction_id, schema_version: only.transaction.schema_version });
  const authority = readCommittedTransactionAuthority(paths.projectDir,
    only.transaction.transaction_id, receipt);
  if (!authority.ok) {
    return { ok: false, reason: authority.reason, detail: authority.detail || null, matched: matched.length };
  }
  const rotation = describeCommittedRotation(paths, authority.transaction, authority.bytes);
  if (!rotation.ok) {
    return { ok: false, reason: rotation.reason, detail: rotation.detail || null, matched: matched.length };
  }
  return { ok: true, rotation, matched: matched.length };
}

function prepareReplan(opts) {
  const repoRoot = fs.realpathSync(opts.repoRoot || getRepoRoot());
  const paths = projectPaths(repoRoot, opts.project);
  return withProjectLock(paths, 'replan prepare', () => prepareReplanUnlocked(paths, opts));
}

function prepareReplanUnlocked(paths, opts) {
  let existing;
  let committedRotation = { ok: true, predecessor: null, predecessor_bytes: null,
    rotated_source: null, rotated_source_bytes: null };
  try { existing = readAuthorityJsonOrNull(paths.transactionPath); }
  catch (_) { return schema.refuse('replan_transaction_invalid'); }
  if (!existing && entryExists(paths.transactionPath)) return schema.refuse('replan_transaction_invalid');
  if (existing) {
    const checked = schema.validateReplanTransaction(existing);
    if (!checked.ok) return schema.refuse(checked.reason);
    if (existing.phase === 'committed' && existing.activation.state_unfenced.status === 'complete') {
      let requestedAttempt = opts.sourceAttemptId || null;
      if (!requestedAttempt) {
        try {
          const handoff = readAuthorityJson(path.join(paths.cacheDir, 'replan-source.json'));
          requestedAttempt = handoff && handoff.attempt_id || null;
        } catch (_) {}
      }
      if (!requestedAttempt || existing.source.source_attempt_ids.includes(requestedAttempt)) {
        return { result: 'already_committed', transaction_id: existing.transaction_id };
      }
      const outputs = verifyCompletedActivationOutputs(paths, existing);
      if (!outputs.ok) return schema.refuse('replan_activation_integrity_failure', {
        step: outputs.step, detail: outputs.detail || null, path: outputs.path || null,
      });
      const snapshots = verifyAllEpochSnapshots(paths.projectDir);
      if (!snapshots.ok) return schema.refuse('replan_snapshot_incomplete', {
        detail: snapshots.reason || snapshots.detail || null,
      });
      committedRotation = describeCommittedRotation(paths, existing);
      if (!committedRotation.ok) return schema.refuse(committedRotation.reason, {
        detail: committedRotation.detail || null,
      });
      existing = null;
    }
    if (existing && existing.outcome === 'candidate_changed') {
      return reauthorCandidate(paths, existing, opts);
    }
    if (existing) {
      return { result: 'resume_required', reason: existing.outcome === 'consent_halt'
        ? 'replan_consent_required' : 'replan_in_progress', transaction_id: existing.transaction_id, phase: existing.phase };
    }
  }
  let parentPlan;
  let parentState;
  try {
    parentPlan = readAuthorityText(paths.planPath);
    parentState = readAuthorityText(paths.statePath);
  } catch (error) { return schema.refuse('replan_parent_missing', { detail: error.message }); }
  const parentPlanHash = validator.readStoredHash(parentPlan);
  if (!parentPlanHash || validator.computePlanHash(parentPlan) !== parentPlanHash) {
    return schema.refuse('replan_parent_hash_invalid');
  }
  const parentStateFields = parseStateFields(parentState);
  if (String(parentStateFields.epoch_schema_version || '') === String(schema.EPOCH_SCHEMA_VERSION)) {
    const planning = verifyActivePlanningEvidence(paths.projectDir);
    if (!planning.ok) return schema.refuse(planning.reason);
  }
  const lineage = resolveClaimLineage(paths, parentState);
  if (!lineage.ok) return schema.refuse(lineage.reason, { detail: lineage.detail || null });
  const sourceResult = readSourceAuthority(paths, parentPlan, parentPlanHash, opts, lineage);
  if (!sourceResult.ok) return schema.refuse(sourceResult.reason, { detail: sourceResult.detail || null });
  const observation = deriveCandidateObservation(paths, lineage, sourceResult.attempt, opts);
  if (!observation.ok) return schema.refuse(observation.reason, { detail: observation.detail || null });
  const state = parseStateFields(parentState);
  const consent = consentAuthority(paths, lineage.epoch_lineage_id, state);
  if (!consent.ok) return schema.refuse(consent.reason);
  const caseB = sourceResult.case_b || { ok: false };
  const request = caseB.ok ? caseB.request : { transition_reason: opts.transitionReason };
  const budgetAuthority = Object.assign({}, consent, {
    case_b_verified: caseB.ok,
    case_b_proof: caseB.ok ? { payload: caseB.payload, proof_digest: caseB.proof_digest } : null,
  });
  const budget = evaluateTransitionBudget(state, request, budgetAuthority);
  if (!budget.ok && budget.reason === 'replan_consent_ledger_invalid') {
    return schema.refuse(budget.reason);
  }
  // Consent is prospective authority. A refused third automatic transition
  // leaves the active transaction, source, plan/state/tasks, snapshots, and
  // receipt histories byte-identical.
  if (!budget.ok) {
    return schema.refuse('replan_consent_required', {
      automatic_review_replans: Number(state.automatic_review_replans || 0),
      authorized_epoch_ceiling: Number(state.authorized_epoch_ceiling || schema.REVIEW_REPLAN_LIMIT),
    });
  }
  // Placed AFTER the consent/budget block so a consent refusal keeps its zero
  // side effects, and BEFORE the rotation is persisted so the recovered receipts
  // are written through the same idempotent exclusive-create path.
  if (!committedRotation.predecessor && Number(state.plan_epoch || 1) > 1) {
    const recovered = recoverCommittedRotation(paths, parentPlanHash,
      Number(state.plan_epoch || 1), lineage);
    if (!recovered.ok) return schema.refuse(recovered.reason, {
      detail: recovered.detail || null,
      matched: recovered.matched === undefined ? null : recovered.matched,
    });
    committedRotation = recovered.rotation;
  }
  const persistedRotation = persistCommittedRotation(paths, committedRotation, opts);
  if (!persistedRotation.ok) return schema.refuse(persistedRotation.reason, {
    detail: persistedRotation.detail || null,
  });
  const transaction = buildTransaction(paths, Object.assign({}, opts, {
    transitionReason: sourceResult.transition_reason,
    predecessor: committedRotation.predecessor,
    rotatedSource: committedRotation.rotated_source,
  }), parentPlan, parentState, lineage,
    sourceResult.source, sourceResult.attempt, observation, budget);
  fs.mkdirSync(paths.cacheDir, { recursive: true });
  durableWriteJson(paths.transactionPath, transaction, opts, 'after_tx_prepared');
  durableWriteFile(paths.statePath, stateWithFence(parentState, lineage, transaction), opts,
    'after_state_prepared_fence');
  return { result: 'prepared', transaction_id: transaction.transaction_id,
    epoch_lineage_id: transaction.epoch_lineage_id, phase: transaction.phase };
}

function buildPlannerPacket(paths, transaction) {
  return {
    schema_version: 1,
    transaction_id: transaction.transaction_id,
    repository_id: transaction.parent.claim_identity.repository_id,
    project: paths.project,
    worktree_path: transaction.parent.claim_identity.worktree_path,
    transition_reason: transaction.transition_reason,
    source: {
      attempt_ids: transaction.source.source_attempt_ids,
      source_reason: transaction.source.source_reason,
      source_evidence_digest: transaction.source.source_evidence_digest,
      producer_slice: transaction.source.producer_slice,
      findings: transaction.source.findings,
      rebind: transaction.source.rebind,
    },
    claim: {
      claim_identity_digest: transaction.parent.claim_identity_digest,
      claim_root_base_digest: transaction.parent.claim_root_base_digest,
      epoch_lineage_id: transaction.epoch_lineage_id,
      parent_plan_epoch: transaction.parent.plan_epoch,
      parent_plan_hash: transaction.parent.plan_hash,
      snapshot_authority_projection: transaction.snapshot.authority_projection,
      snapshot_authority_digest: transaction.snapshot.authority_digest,
    },
    candidate: {
      candidate_digest: transaction.cas.prepare.candidate_digest,
      inherited_frontier_digest: transaction.cas.prepare.inherited_frontier_digest,
      inherited_frontier_classes: transaction.source.inherited_frontier_classes,
      validation_obligations: transaction.source.validation_obligations,
    },
    budget: {
      automatic_review_replans: transaction.budget.count_before,
      authorized_epoch_ceiling: transaction.budget.ceiling,
      transition_cost: transaction.budget.transition_cost,
      case_b_exemption: transaction.budget.case_b_exemption,
      case_b_proof: transaction.budget.case_b_proof,
      consent_ledger_digest: transaction.budget.consent_ledger_digest,
    },
    acceptance_requirements: [
      'Preserve the claim, branch, worktree, claim root, and epoch lineage.',
      'Author a schema-2 child plan whose complete ledger is pending.',
      'Carry every inherited code/security frontier and unresolved finding to reachable certifier work.',
      'Write only the exact child output path and return the digest-bound planner attestation.',
    ],
    child_output_path: schema.REPLAN_PLAN_NEXT_NAME,
    planner_profile_identity: transaction.planner.profile_identity,
    dispatch_nonce: transaction.planner.dispatch_nonce,
  };
}

function seedPlannerOutput(paths, opts) {
  if (entryExists(paths.childPath)) {
    const stat = fs.lstatSync(paths.childPath);
    if (!stat.isFile() || stat.size !== 0) return { ok: false, reason: 'replan_child_prepopulated' };
    return { ok: true };
  }
  durableCreateEmptyFile(paths.childPath, opts, 'after_child_seeded');
  return { ok: true };
}

function observeCas(paths, transaction, seam, opts) {
  const lineage = {
    claim_identity: transaction.parent.claim_identity,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_base: transaction.parent.claim_root_base,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    epoch_lineage_id: transaction.epoch_lineage_id,
  };
  const observation = deriveCandidateObservation(paths, lineage, {
    validation_obligations: transaction.source.validation_obligations,
    scope_lineage_id: transaction.source.scope_lineage_id,
  }, opts);
  if (!observation.ok) return observation;
  const mutation = opts && opts.casMutation;
  if (mutation && mutation.seam === seam
      && ['candidate_digest', 'claim_root_base_digest', 'inherited_frontier_digest'].includes(mutation.axis)) {
    observation[mutation.axis] = mutation.value;
  }
  const match = sameCasTuple(casTuple(transaction.cas.prepare), casTuple(observation));
  return Object.assign({ seam, result: match ? 'match' : 'mismatch' }, observation);
}

function candidateChanged(paths, transaction, observation, opts) {
  const expected = casTuple(transaction.cas.prepare);
  const actual = casTuple(observation);
  const changedAxes = Object.keys(expected).filter(axis => expected[axis] !== actual[axis]);
  const axis = changedAxes.length === 1 ? changedAxes[0] : 'multiple';
  // prepare is the immutable transaction-identity tuple. A later prepared
  // retry that observes drift records the mismatch in failure.actual without
  // overwriting the tuple from which transaction_id was derived.
  if (observation.seam !== 'prepare') transaction.cas[observation.seam] = observation;
  transaction.outcome = 'candidate_changed';
  transaction.failure = { reason: 'replan_candidate_changed', seam: observation.seam,
    axis, expected, actual, at: nowIso(opts) };
  const labelSeam = String(observation.seam).replace(/_/g, '-');
  updateTransaction(paths, transaction, opts, 'after_tx_candidate_changed:' + labelSeam);
  updateFenceState(paths, transaction, opts, { replan_status: 'candidate_changed' },
    'after_state_candidate_changed:' + labelSeam);
  return schema.refuse('replan_candidate_changed', {
    transaction_id: transaction.transaction_id,
    seam: observation.seam,
    axis,
    expected: axis === 'multiple' ? transaction.failure.expected : transaction.failure.expected[axis],
    actual: axis === 'multiple' ? transaction.failure.actual : transaction.failure.actual[axis],
  });
}

function failedAttemptReceipt(paths, transaction) {
  let child = null;
  let attestation = null;
  try {
    const bytes = readAuthorityBytes(paths.childPath);
    if (bytes.length) child = { digest: schema.sha256Hex(bytes), bytes_base64: bytes.toString('base64') };
  } catch (_) {}
  try {
    const bytes = readAuthorityBytes(paths.attestationPath);
    attestation = { digest: schema.sha256Hex(bytes), bytes_base64: bytes.toString('base64') };
  } catch (_) {}
  return {
    schema_version: 1,
    transaction_id: transaction.transaction_id,
    outcome: 'candidate_changed',
    phase: transaction.phase,
    planner_attempt: transaction.planner_attempt,
    failure: transaction.failure,
    prepare_cas: casTuple(transaction.cas.prepare),
    prepare_inherited_frontier_view: transaction.source.prepare_inherited_frontier_view,
    failed_cas: transaction.failure && transaction.failure.actual || null,
    child,
    attestation,
  };
}

function repairCandidateReauthorPrefix(paths, transaction, opts) {
  if (transaction.phase !== 'prepared' || transaction.outcome !== 'in_progress'
      || !Array.isArray(transaction.attempts) || transaction.attempts.length === 0) {
    return { ok: true };
  }
  const receipt = transaction.attempts[transaction.attempts.length - 1];
  if (!receipt || receipt.outcome !== 'candidate_changed') return { ok: true };
  const phaseBySeam = {
    prepare: 'prepared',
    pre_freeze: 'planner_pending',
    pre_snapshot: 'child_frozen',
    pre_activation: 'parent_archived',
  };
  const seam = receipt.failure && receipt.failure.seam;
  const priorFrontier = receipt.prepare_inherited_frontier_view;
  let normalizedFrontier;
  try { normalizedFrontier = schema.digestInheritedFrontierView(priorFrontier); }
  catch (_) { return { ok: false, reason: 'replan_transaction_attempt_invalid' }; }
  const expectedPriorId = schema.sha256Canonical({
    schema_version: transaction.schema_version,
    epoch_lineage_id: transaction.epoch_lineage_id,
    parent_plan_epoch: transaction.parent.plan_epoch,
    parent_plan_hash: transaction.parent.plan_hash,
    source_reason: transaction.source.source_reason,
    source_attempt_ids: transaction.source.source_attempt_ids.slice().sort(),
    prepare_candidate_digest: receipt.prepare_cas && receipt.prepare_cas.candidate_digest,
    prepare_inherited_frontier_digest: receipt.prepare_cas && receipt.prepare_cas.inherited_frontier_digest,
  });
  if (!seam || phaseBySeam[seam] !== receipt.phase
      || receipt.transaction_id !== expectedPriorId
      || normalizedFrontier.inherited_frontier_digest !== receipt.prepare_cas.inherited_frontier_digest) {
    return { ok: false, reason: 'replan_transaction_attempt_invalid' };
  }

  let childStat = null;
  try { childStat = fs.lstatSync(paths.childPath); }
  catch (error) {
    if (error.code !== 'ENOENT') return { ok: false, reason: 'replan_child_integrity_failure' };
  }
  if (childStat && (!childStat.isFile() || childStat.isSymbolicLink() || childStat.nlink !== 1)) {
    return { ok: false, reason: 'replan_child_integrity_failure' };
  }
  const childBytes = childStat ? readAuthorityBytes(paths.childPath) : Buffer.alloc(0);
  if (childBytes.length) {
    if (!receipt.child || schema.sha256Hex(childBytes) !== receipt.child.digest
        || childBytes.toString('base64') !== receipt.child.bytes_base64) {
      return { ok: false, reason: 'replan_child_integrity_failure' };
    }
    durableWriteFile(paths.childPath, '', opts, 'after_child_reauthor_seeded');
  } else if (!childStat) {
    durableCreateEmptyFile(paths.childPath, opts, 'after_child_reauthor_seeded');
  }

  const lineage = {
    claim_identity: transaction.parent.claim_identity,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_base: transaction.parent.claim_root_base,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    epoch_lineage_id: transaction.epoch_lineage_id,
  };
  const baseState = Buffer.from(transaction.parent.state_bytes_base64, 'base64').toString('utf8');
  const priorTransaction = {
    transaction_id: receipt.transaction_id,
    phase: receipt.phase,
    outcome: 'candidate_changed',
    parent: transaction.parent,
    source: { inherited_frontier_classes: normalizedFrontier.inherited_frontier_view.inherited_frontier_classes },
    cas: { prepare: receipt.prepare_cas },
    budget: transaction.budget,
  };
  const priorState = stateWithFence(baseState, lineage, priorTransaction, { replan_status: 'candidate_changed' });
  const reboundState = stateWithFence(baseState, lineage, transaction);
  let stateBytes;
  try {
    const stateStat = fs.lstatSync(paths.statePath);
    if (!stateStat.isFile() || stateStat.isSymbolicLink() || stateStat.nlink !== 1) {
      throw new Error('state_authority_file_type_invalid');
    }
    stateBytes = readAuthorityBytes(paths.statePath);
  } catch (_) { return { ok: false, reason: 'replan_parent_state_changed' }; }
  const stateDigest = schema.sha256Hex(stateBytes);
  const priorDigest = schema.sha256Hex(Buffer.from(priorState, 'utf8'));
  const reboundDigest = schema.sha256Hex(Buffer.from(reboundState, 'utf8'));
  if (stateDigest === priorDigest) {
    durableWriteFile(paths.statePath, reboundState, opts, 'after_state_reauthor_fence');
  } else if (stateDigest !== reboundDigest) {
    return { ok: false, reason: 'replan_parent_state_changed' };
  }
  return { ok: true };
}

function reauthorCandidate(paths, transaction, opts) {
  if (activationComplete(transaction, 'child_plan_promoted')) {
    return schema.refuse('replan_activation_integrity_failure', { step: 'candidate_changed_after_promotion' });
  }
  // #729 frontier: the re-author rebuilds the successor transaction from the STORED
  // `transaction.source` and never re-reads the journal, so the readSource wall does not
  // cover it. An empty stored frontier must not be laundered into a fresh transaction.
  if (!reviewSourceCarriesFrontier(transaction.source)) {
    return schema.refuse('replan_source_findings_missing', { detail: 'stored_frontier_empty' });
  }
  const lineage = {
    ok: true,
    legacy: transaction.parent.legacy_import,
    claim_identity: transaction.parent.claim_identity,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_base: transaction.parent.claim_root_base,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    epoch_lineage_id: transaction.epoch_lineage_id,
  };
  const observation = deriveCandidateObservation(paths, lineage, {
    validation_obligations: transaction.source.validation_obligations,
    scope_lineage_id: transaction.source.scope_lineage_id,
  }, opts);
  if (!observation.ok) return schema.refuse(observation.reason, { detail: observation.detail || null });
  const parentPlan = Buffer.from(transaction.parent.plan_bytes_base64, 'base64').toString('utf8');
  const parentState = Buffer.from(transaction.parent.state_bytes_base64, 'base64').toString('utf8');
  const budget = {
    count_before: transaction.budget.count_before,
    count_after: transaction.budget.prospective_count_after,
    ceiling: transaction.budget.ceiling,
    cost: transaction.budget.transition_cost,
    consent_ledger_digest: transaction.budget.consent_ledger_digest,
    case_b_proof: transaction.budget.case_b_proof,
    case_b_exemption: transaction.budget.case_b_exemption,
    case_b_exemption_consumed_after: transaction.budget.case_b_exemption_consumed_after,
  };
  const next = buildTransaction(paths, Object.assign({}, opts, {
    transitionReason: transaction.transition_reason,
  }), parentPlan, parentState, lineage, transaction.source, {
    validation_obligations: transaction.source.validation_obligations,
  }, observation, budget);
  next.planner_attempt = transaction.planner_attempt + 1;
  next.planner.dispatch_nonce = plannerDispatchNonce(next.transaction_id, next.planner_attempt);
  next.attempts = (transaction.attempts || []).concat([failedAttemptReceipt(paths, transaction)]);
  durableWriteJson(paths.transactionPath, next, opts, 'after_tx_reauthored');
  const repaired = repairCandidateReauthorPrefix(paths, next, opts);
  if (!repaired.ok) return schema.refuse(repaired.reason);
  return { result: 'reauthored', transaction_id: next.transaction_id,
    prior_transaction_id: transaction.transaction_id, phase: next.phase };
}

function plannerDispatchRecord(paths, transaction) {
  const logPath = path.join(paths.cacheDir, 'dispatch-log.jsonl');
  let lines = [];
  try {
    const stat = fs.lstatSync(logPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
    lines = readAuthorityText(logPath).split(/\r?\n/).filter(Boolean);
  }
  catch (_) { return null; }
  const pendingAt = Date.parse(transaction.planner.pending_at || '');
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    if (row.agent_type !== 'workflow-planner'
        || row.project !== paths.project
        || row.transaction_id !== transaction.transaction_id
        || row.dispatch_nonce !== transaction.planner.dispatch_nonce) continue;
    let cwd;
    try { cwd = fs.realpathSync(row.cwd); } catch (_) { continue; }
    if (cwd !== fs.realpathSync(paths.repoRoot)) continue;
    const ts = Date.parse(row.ts || '');
    if (!Number.isFinite(ts) || (Number.isFinite(pendingAt) && ts < pendingAt)) continue;
    return row;
  }
  return null;
}

// #737: the planner attests the image it AUTHORED; `resume` owns the freeze that stamps
// plan_hash (and, for schema-2, seeds Required Agent Compliance), so the frozen bytes may
// legally differ from the attested bytes. The freeze records the witness pair on the
// transaction (`child_authored.digest` -> `child_authored.frozen_digest`), and every
// child-identity seam below is therefore PURE DIGEST ARITHMETIC over bytes that were
// already recorded. A seam must never re-derive the stamp by calling freezePlan /
// validatePlan or by reading the live worktree: the declared_write_set walls are
// deliberately freeze-only so a legacy in-flight plan never bricks, and re-applying them
// at audit time would retroactively invalidate an immutable, unrepairable sealed epoch.
function attestedChildBinds(attestedDigest, frozenDigest, authored) {
  if (attestedDigest === frozenDigest) return true;
  return !!authored && authored.digest === attestedDigest && authored.frozen_digest === frozenDigest;
}

function verifyPlannerAttestation(paths, transaction) {
  let child;
  let attestation;
  let packetBytes;
  try {
    const childStat = fs.lstatSync(paths.childPath);
    const packetStat = fs.lstatSync(paths.packetPath);
    if (!childStat.isFile() || childStat.isSymbolicLink() || childStat.nlink !== 1
        || !packetStat.isFile() || packetStat.isSymbolicLink() || packetStat.nlink !== 1) {
      throw new Error('planner_authority_file_type_invalid');
    }
    child = readAuthorityBytes(paths.childPath);
    attestation = readAuthorityJson(paths.attestationPath);
    packetBytes = readAuthorityBytes(paths.packetPath);
  } catch (error) { return { ok: false, reason: 'replan_planner_attestation_invalid', detail: error.message }; }
  if (child.length === 0) return { ok: false, reason: 'replan_planner_dispatch_required' };
  const claimedDigest = attestation.attestation_digest;
  const semantic = Object.assign({}, attestation);
  delete semantic.attestation_digest;
  // #737: the freeze writes the stamped bytes over the authored image BEFORE the
  // child_frozen journal is durable, so replay after a crash in that gap reads frozen
  // bytes under an authored attestation. The recorded authored image is the only
  // admissible substitute — it is byte-pinned to its own digest and to the attestation
  // that signed it. Digest arithmetic only; the live bytes are never re-derived.
  let attested = child;
  if (attestation.child_digest !== schema.sha256Hex(child)) {
    const record = transaction.child_authored;
    const recorded = record && typeof record.bytes_base64 === 'string'
      ? Buffer.from(record.bytes_base64, 'base64') : null;
    if (!recorded || !recorded.length
        || schema.sha256Hex(recorded) !== record.digest
        || record.digest !== attestation.child_digest
        || record.attestation_digest !== claimedDigest) {
      return { ok: false, reason: 'replan_planner_attestation_invalid' };
    }
    attested = recorded;
  }
  if (!HEX64_RE.test(String(claimedDigest || '')) || schema.sha256Canonical(semantic) !== claimedDigest
      || attestation.schema_version !== 1
      || attestation.transaction_id !== transaction.transaction_id
      || attestation.project !== paths.project
      || attestation.packet_digest !== schema.sha256Hex(packetBytes)
      || attestation.packet_digest !== transaction.planner.packet_digest
      || attestation.dispatch_nonce !== transaction.planner.dispatch_nonce
      || attestation.profile_identity !== transaction.planner.profile_identity
      || attestation.child_path !== schema.REPLAN_PLAN_NEXT_NAME
      || attestation.child_digest !== schema.sha256Hex(attested)) {
    return { ok: false, reason: 'replan_planner_attestation_invalid' };
  }
  let worktree;
  try { worktree = fs.realpathSync(attestation.worktree_path); } catch (_) { worktree = null; }
  if (worktree !== fs.realpathSync(paths.repoRoot) || !plannerDispatchRecord(paths, transaction)) {
    return { ok: false, reason: 'replan_planner_attestation_invalid' };
  }
  return { ok: true, attestation, attestation_digest: claimedDigest, child: attested,
    child_digest: schema.sha256Hex(attested), attestation_file_digest: exactDigest(paths.attestationPath) };
}

function metaFields(planContent) {
  const out = Object.create(null);
  const located = schema.locateSection(planContent, 'Meta');
  if (located.start < 0) return out;
  const body = planContent.slice(located.start, located.next < 0 ? planContent.length : located.next);
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

function validateChildPlan(childBytes, transaction) {
  const content = Buffer.from(childBytes).toString('utf8');
  const stored = validator.readStoredHash(content);
  if (!stored || stored !== validator.computePlanHash(content)) return { ok: false, reason: 'replan_child_hash_invalid' };
  const validated = validator.validatePlan(content, { root: transaction.parent.claim_identity.worktree_path });
  if (!validated || validated.result === 'refuse') {
    return { ok: false, reason: 'replan_child_invalid', errors: validated && validated.errors || [] };
  }
  const meta = metaFields(content);
  const required = {
    contract_version: '2',
    epoch_lineage_id: transaction.epoch_lineage_id,
    plan_epoch: String(transaction.parent.plan_epoch + 1),
    parent_plan_hash: transaction.parent.plan_hash,
    parent_snapshot_manifest_digest: transaction.snapshot.authority_digest,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    inherited_frontier_digest: transaction.cas.prepare.inherited_frontier_digest,
    transition_reason: transaction.transition_reason,
    source_evidence_digest: transaction.source.source_evidence_digest,
    planner_binding: transaction.planner.dispatch_nonce,
    inherited_frontier_classes: transaction.source.inherited_frontier_classes.length
      ? transaction.source.inherited_frontier_classes.join(',') : 'none',
  };
  for (const [key, value] of Object.entries(required)) {
    if (meta[key] !== value) return { ok: false, reason: 'replan_child_binding_invalid', field: key };
  }
  if (meta.epoch_schema_version !== '2'
      || !meta.code_certifier || !meta.security_certifier) {
    return { ok: false, reason: 'replan_child_binding_invalid' };
  }
  if (transaction.transition_reason === 'diagnosis_to_build') {
    const proof = transaction.budget.case_b_proof;
    if (!proof || meta.diagnosis_source_digest !== proof.proof_digest
        || meta.recommended_shape_digest !== proof.payload.recommended_shape_digest) {
      return { ok: false, reason: 'replan_child_binding_invalid', field: 'diagnosis_citation' };
    }
  } else if (meta.diagnosis_source_digest || meta.recommended_shape_digest) {
    return { ok: false, reason: 'replan_child_binding_invalid', field: 'diagnosis_citation' };
  }
  const ledger = validator.parseLedger(content);
  const nodes = validator.parseNodes(content);
  if (!nodes.length || ledger.size !== nodes.length || nodes.some(node => ledger.get(node.id) !== 'pending')) {
    return { ok: false, reason: 'replan_child_ledger_not_pending' };
  }
  return {
    ok: true,
    content,
    plan_hash: stored,
    decision: validated.decision,
    risk_line: planningRiskLine(validated.risk),
    first_node_id: nodes[0].id,
    first_node_role: nodes[0].role,
    semantic_digest: schema.sha256Canonical({ meta, nodes: nodes.map(node => ({ id: node.id, role: node.role,
      depends_on: node.dependsOn, declared_write_set: node.writeSetRaw })) }),
    ledger_digest: ledgerDigest(content),
  };
}

function validateChildHandoffAuthority(paths, transaction) {
  const exactChildPath = path.resolve(paths.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
  if (!path.isAbsolute(paths.projectDir) || !path.isAbsolute(paths.childPath)
      || path.resolve(paths.childPath) !== exactChildPath) {
    return schema.refuse('replan_child_path_invalid');
  }
  const preFreeze = transaction && transaction.cas && transaction.cas.pre_freeze;
  if (!preFreeze) return schema.refuse('replan_pre_freeze_cas_missing');
  if (preFreeze.seam !== 'pre_freeze' || preFreeze.result !== 'match'
      || !sameCasTuple(casTuple(preFreeze), casTuple(transaction.cas.prepare))) {
    return schema.refuse('replan_pre_freeze_cas_mismatch');
  }
  return { ok: true, exact_child_path: exactChildPath, pre_freeze: preFreeze };
}

function freezeAttestedChildWithHandoff(paths, transaction, attested, opts) {
  const checked = validateChildHandoffAuthority(paths, transaction);
  if (!checked.ok) return checked;
  const exactChildPath = checked.exact_child_path;
  const preFreeze = checked.pre_freeze;
  const authority = {
    verified: true,
    candidate_match: preFreeze.candidate_digest === transaction.cas.prepare.candidate_digest,
    claim_root_match: preFreeze.claim_root_base_digest === transaction.parent.claim_root_base_digest,
    inherited_frontier_match: preFreeze.inherited_frontier_digest
      === transaction.cas.prepare.inherited_frontier_digest,
    transaction_id: transaction.transaction_id,
    child_path: exactChildPath,
    child_digest: attested.child_digest,
    dispatch_nonce: transaction.planner.dispatch_nonce,
    planner_attestation_digest: attested.attestation_digest,
  };
  const expected = {
    child_path: exactChildPath,
    epoch_lineage_id: transaction.epoch_lineage_id,
    plan_epoch: transaction.parent.plan_epoch + 1,
    parent_plan_hash: transaction.parent.plan_hash,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    inherited_frontier_digest: preFreeze.inherited_frontier_digest,
    planner_binding: transaction.planner.dispatch_nonce,
  };
  const handoff = opts && typeof opts.replanHandoff === 'function'
    ? opts.replanHandoff : runReplanHandoff;
  let result;
  let childWriteLabeled = false;
  try {
    result = handoff({
      transactionId: transaction.transaction_id,
      childPath: exactChildPath,
      childContent: Buffer.from(attested.child).toString('utf8'),
      authority,
      expected,
      validatorOptions: { root: transaction.parent.claim_identity.worktree_path },
      writeFile(filePath, content) {
        if (path.resolve(String(filePath || '')) !== exactChildPath) {
          throw new Error('replan_child_path_invalid');
        }
        durableWriteFile(exactChildPath, content, opts, 'after_child_frozen_bytes');
        childWriteLabeled = true;
      },
    });
  } catch (error) {
    if (error && error.code === 'KAOLA_REPLAN_FAILPOINT') throw error;
    return schema.refuse(error && error.message === 'replan_child_path_invalid'
      ? 'replan_child_path_invalid' : 'replan_child_invalid', { detail: error.message });
  }
  if (!result || result.result !== 'child_frozen') return result || schema.refuse('replan_child_invalid');
  if (!childWriteLabeled) {
    const stable = readAuthorityText(exactChildPath);
    durableWriteFile(exactChildPath, stable, opts, 'after_child_frozen_bytes');
  }
  let frozenBytes;
  try { frozenBytes = readAuthorityBytes(exactChildPath); }
  catch (error) { return schema.refuse('replan_child_integrity_failure', { detail: error.message }); }
  const frozenDigest = schema.sha256Hex(frozenBytes);
  if (result.transaction_id !== transaction.transaction_id
      || result.authored_child_digest !== attested.child_digest
      || result.frozen_child_digest !== frozenDigest
      || result.planner_attestation_digest !== attested.attestation_digest
      || validator.readStoredHash(frozenBytes.toString('utf8')) !== result.child_plan_hash) {
    return schema.refuse('replan_child_integrity_failure');
  }
  return Object.assign({}, result, { child_bytes: frozenBytes });
}

function verifyFrozenChildAuthority(paths, transaction) {
  let childBytes;
  let attestation;
  try {
    childBytes = readAuthorityBytes(paths.childPath);
    attestation = readAuthorityJson(paths.attestationPath);
  } catch (error) {
    return { ok: false, reason: 'replan_child_integrity_failure', detail: error.message };
  }
  const childDigest = schema.sha256Hex(childBytes);
  const storedChild = Buffer.from(transaction.child.bytes_base64 || '', 'base64');
  const child = validateChildPlan(childBytes, transaction);
  const semanticAttestation = Object.assign({}, attestation);
  delete semanticAttestation.attestation_digest;
  if (!child.ok || childDigest !== transaction.child.digest
      || !childBytes.equals(storedChild)
      || child.plan_hash !== transaction.child.plan_hash
      || attestation.transaction_id !== transaction.transaction_id
      || !attestedChildBinds(attestation.child_digest, childDigest, transaction.child_authored)
      || attestation.attestation_digest !== transaction.planner.attestation_digest
      || schema.sha256Canonical(semanticAttestation) !== attestation.attestation_digest
      || exactDigest(paths.attestationPath) !== transaction.planner.attestation_file_digest) {
    return { ok: false, reason: 'replan_child_integrity_failure' };
  }
  return { ok: true, child_bytes: childBytes, child, attestation };
}

function lstatRegular(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) throw new Error(stat.isSymbolicLink() ? 'snapshot_symlink_refused' : 'snapshot_special_file_refused');
  if (stat.nlink !== 1) throw new Error('snapshot_hardlink_refused');
  return stat;
}

function snapshotExcluded(rel) {
  return rel === '.cache/' + schema.SCHEDULER_LOCK_NAME
    || rel === '.cache/epochs' || rel.startsWith('.cache/epochs/');
}

function enumerateProjectFiles(projectDir) {
  const records = [];
  const folded = new Map();
  const walk = (absDir, relDir) => {
    const dirStat = fs.lstatSync(absDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      if (snapshotExcluded(rel)) continue;
      const safe = rel.replace(/\\/g, '/');
      if (!safe || safe.startsWith('/') || safe.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('snapshot_path_invalid');
      }
      const lower = safe.toLocaleLowerCase('en-US');
      if (folded.has(lower) && folded.get(lower) !== safe) throw new Error('snapshot_case_collision');
      folded.set(lower, safe);
      const abs = path.join(absDir, entry.name);
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) throw new Error('snapshot_symlink_refused');
      if (stat.isDirectory()) walk(abs, safe);
      else {
        if (!stat.isFile()) throw new Error('snapshot_special_file_refused');
        if (stat.nlink !== 1) throw new Error('snapshot_hardlink_refused');
        records.push({ path: safe, abs });
      }
    }
  };
  walk(projectDir, '');
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function fsyncDirectory(dir) {
  let fd;
  try { fd = fs.openSync(dir, 'r'); fs.fsyncSync(fd); } catch (_) {}
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {} }
}

function copySnapshotFile(record, filesRoot, opts, ordinal) {
  const before = lstatRegular(record.abs);
  const bytes = fs.readFileSync(record.abs);
  const after = lstatRegular(record.abs);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mode !== after.mode || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) {
    throw new Error('snapshot_source_changed');
  }
  const dest = path.join(filesRoot, ...record.path.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (entryExists(dest)) {
    const existing = lstatRegular(dest);
    if (existing.size !== bytes.length || schema.sha256Hex(fs.readFileSync(dest)) !== schema.sha256Hex(bytes)) {
      throw new Error('snapshot_stage_file_conflict');
    }
  } else {
    const fd = fs.openSync(dest, 'wx', before.mode & 0o777);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fireFailpoint(opts, deterministicPathLabel('after_snapshot_stage_file', ordinal, record.path));
  }
  const copied = lstatRegular(dest);
  if (copied.size !== bytes.length || schema.sha256Hex(fs.readFileSync(dest)) !== schema.sha256Hex(bytes)) {
    throw new Error('snapshot_copy_verify_failed');
  }
  return {
    path: record.path,
    size: bytes.length,
    mode: (before.mode & 0o777).toString(8).padStart(3, '0'),
    digest: schema.sha256Hex(bytes),
  };
}

function buildSnapshot(paths, transaction, opts) {
  const epochDir = path.join(paths.epochsDir, String(transaction.parent.plan_epoch));
  try {
    const cacheStat = fs.lstatSync(paths.cacheDir);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    if (entryExists(paths.epochsDir)) {
      const epochsStat = fs.lstatSync(paths.epochsDir);
      if (!epochsStat.isDirectory() || epochsStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    }
  } catch (error) {
    return { ok: false, reason: 'replan_snapshot_incomplete', detail: error.message };
  }
  if (entryExists(epochDir)) {
    const verified = verifySnapshotManifest(epochDir);
    if (!verified.ok || verified.manifest.transaction_id !== transaction.transaction_id) {
      return { ok: false, reason: 'replan_snapshot_incomplete', detail: verified.reason || 'snapshot_epoch_conflict' };
    }
    return verified;
  }
  fs.mkdirSync(paths.epochsDir, { recursive: true });
  const stage = path.join(paths.epochsDir, '.staging-' + transaction.transaction_id);
  let stageCreated = false;
  if (entryExists(stage)) {
    const stat = fs.lstatSync(stage);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, reason: 'replan_snapshot_incomplete' };
  }
  try {
    if (!entryExists(stage)) {
      fs.mkdirSync(stage, { recursive: false });
      fs.mkdirSync(path.join(stage, 'files'));
      fsyncDirectory(stage);
      stageCreated = true;
      fireFailpoint(opts, 'after_snapshot_stage_created');
    }
    const filesRoot = path.join(stage, 'files');
    if (!entryExists(filesRoot)) throw new Error('snapshot_stage_files_missing');
    const frozen = verifyFrozenChildAuthority(paths, transaction);
    if (!frozen.ok) throw new Error(frozen.reason);
    const sourceRecords = enumerateProjectFiles(paths.projectDir);
    const files = sourceRecords.map((record, index) => copySnapshotFile(record, filesRoot, opts, index + 1));
    const afterPaths = enumerateProjectFiles(paths.projectDir).map(record => record.path);
    if (JSON.stringify(afterPaths) !== JSON.stringify(sourceRecords.map(record => record.path))) {
      throw new Error('snapshot_source_changed');
    }
    const manifest = {
      schema_version: 2,
      epoch_lineage_id: transaction.epoch_lineage_id,
      parent_plan_epoch: transaction.parent.plan_epoch,
      transaction_id: transaction.transaction_id,
      transaction_predecessor: transaction.predecessor,
      rotated_source: transaction.source.rotated_from,
      created_at: transaction.created_at,
      claim_identity: transaction.parent.claim_identity,
      claim_identity_digest: transaction.parent.claim_identity_digest,
      claim_root_base: transaction.parent.claim_root_base,
      claim_root_base_digest: transaction.parent.claim_root_base_digest,
      entry_cas: casTuple(transaction.cas.prepare),
      exit_cas: casTuple(transaction.cas.pre_snapshot),
      snapshot_authority_projection: transaction.snapshot.authority_projection,
      snapshot_authority_digest: transaction.snapshot.authority_digest,
      parent: {
        plan_hash: transaction.parent.plan_hash,
        plan_digest: transaction.parent.plan_digest,
        ledger_digest: transaction.parent.ledger_digest,
        state_pre_fence_digest: transaction.parent.state_pre_fence_digest,
        state_authority_digest: transaction.parent.state_authority_digest,
      },
      source: {
        source_evidence_digest: transaction.source.source_evidence_digest,
        journal_digest: transaction.source.journal_digest,
        findings_digest: schema.sha256Canonical(transaction.source.findings),
        rebind_digest: schema.sha256Canonical(transaction.source.rebind),
      },
      candidate_view: transaction.cas.prepare.candidate_view,
      inherited_frontier_view: transaction.cas.prepare.inherited_frontier_view,
      child: {
        path: schema.REPLAN_PLAN_NEXT_NAME,
        digest: transaction.child.digest,
        plan_hash: transaction.child.plan_hash,
        attestation_digest: transaction.planner.attestation_digest,
        attestation_exact_digest: transaction.planner.attestation_file_digest,
      },
      files,
    };
    manifest.manifest_self_digest = schema.snapshotManifestDigest(manifest);
    const manifestBytes = schema.canonicalJson(manifest) + '\n';
    const manifestPath = path.join(stage, 'manifest.json');
    if (entryExists(manifestPath)) {
      if (readAuthorityText(manifestPath) !== manifestBytes) throw new Error('snapshot_manifest_conflict');
    } else {
      const manifestFd = fs.openSync(manifestPath, 'wx', 0o600);
      try { fs.writeFileSync(manifestFd, manifestBytes, 'utf8'); fs.fsyncSync(manifestFd); }
      finally { fs.closeSync(manifestFd); }
      fireFailpoint(opts, 'after_snapshot_manifest_written');
    }
    fsyncDirectory(filesRoot);
    fsyncDirectory(stage);
    durableRename(stage, epochDir, opts, 'after_snapshot_epoch_renamed');
    const verified = verifySnapshotManifest(epochDir);
    if (!verified.ok) return { ok: false, reason: 'replan_snapshot_incomplete', detail: verified.reason };
    return verified;
  } catch (error) {
    if (error && error.code === 'KAOLA_REPLAN_FAILPOINT') throw error;
    return { ok: false, reason: 'replan_snapshot_incomplete', detail: error.message };
  }
}

function enumerateRegularRelative(rootDir) {
  const out = [];
  const walk = (dir, relDir) => {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      const abs = path.join(dir, entry.name);
      const child = fs.lstatSync(abs);
      if (child.isSymbolicLink()) throw new Error('snapshot_symlink_refused');
      if (child.isDirectory()) walk(abs, rel);
      else {
        if (!child.isFile() || child.nlink !== 1) throw new Error('snapshot_special_file_refused');
        out.push({ path: rel, abs, stat: child });
      }
    }
  };
  walk(rootDir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function projectDirForEpoch(epochDir) {
  return path.dirname(path.dirname(path.dirname(epochDir)));
}

function snapshotFileRecord(manifest, rel) {
  return manifest.files.find(row => row.path === rel) || null;
}

function readSnapshotFile(epochDir, rel) {
  return readAuthorityBytes(path.join(epochDir, 'files', ...rel.split('/')));
}

function readCommittedTransactionAuthority(projectDir, transactionId, expectedReceipt, seen) {
  const visited = seen || new Set();
  if (visited.has(transactionId)) return { ok: false, reason: 'replan_transaction_history_cycle' };
  visited.add(transactionId);
  const cacheDir = path.join(projectDir, '.cache');
  const activePath = path.join(cacheDir, schema.REPLAN_TRANSACTION_NAME);
  const historyPath = path.join(cacheDir, 'committed-transactions', transactionId + '.json');
  let selectedPath = null;
  let bytes = null;
  try {
    if (entryExists(activePath)) {
      const activeBytes = readAuthorityBytes(activePath);
      const active = JSON.parse(activeBytes.toString('utf8'));
      if (active.transaction_id === transactionId) {
        selectedPath = activePath;
        bytes = activeBytes;
      }
    }
    if (!bytes) {
      selectedPath = historyPath;
      bytes = readAuthorityBytes(historyPath);
    }
  } catch (error) {
    return { ok: false, reason: 'replan_transaction_history_unreadable', detail: error.message };
  }
  const digest = schema.sha256Hex(bytes);
  if (expectedReceipt && (expectedReceipt.transaction_id !== transactionId
      || expectedReceipt.path !== '.cache/committed-transactions/' + transactionId + '.json'
      || expectedReceipt.digest !== digest || expectedReceipt.size !== bytes.length)) {
    return { ok: false, reason: 'replan_transaction_history_receipt_mismatch' };
  }
  let transaction;
  try { transaction = JSON.parse(bytes.toString('utf8')); }
  catch (_) { return { ok: false, reason: 'replan_transaction_history_invalid' }; }
  const checked = schema.validateReplanTransaction(transaction);
  if (!checked.ok || transaction.transaction_id !== transactionId
      || transaction.phase !== 'committed' || transaction.outcome !== 'committed'
      || !activationComplete(transaction, 'state_unfenced')) {
    return { ok: false, reason: 'replan_transaction_history_invalid', detail: checked.reason || null };
  }
  if (transaction.schema_version === 2 && transaction.predecessor) {
    const predecessor = readCommittedTransactionAuthority(projectDir,
      transaction.predecessor.transaction_id, transaction.predecessor, visited);
    if (!predecessor.ok) return predecessor;
    if (predecessor.transaction.parent.plan_epoch + 1 !== transaction.parent.plan_epoch
        || predecessor.transaction.child.plan_hash !== transaction.parent.plan_hash) {
      return { ok: false, reason: 'replan_transaction_predecessor_mismatch' };
    }
  }
  if (transaction.schema_version === 2 && transaction.source.rotated_from) {
    try {
      const sourcePath = path.join(projectDir, ...transaction.source.rotated_from.path.split('/'));
      const sourceBytes = readAuthorityBytes(sourcePath);
      if (sourceBytes.length !== transaction.source.rotated_from.size
          || schema.sha256Hex(sourceBytes) !== transaction.source.rotated_from.digest) {
        return { ok: false, reason: 'replan_source_history_receipt_mismatch' };
      }
      JSON.parse(sourceBytes.toString('utf8'));
    } catch (error) {
      return { ok: false, reason: 'replan_source_history_unreadable', detail: error.message };
    }
  }
  return { ok: true, transaction, bytes, digest, path: selectedPath };
}

function verifySchema2SnapshotBinding(epochDir, manifest, manifestBytes) {
  const projectDir = projectDirForEpoch(epochDir);
  let archivedTx;
  let archivedPlan;
  let archivedState;
  let archivedTasks;
  let childBytes;
  let attestationBytes;
  let attestation;
  try {
    archivedTx = JSON.parse(readSnapshotFile(epochDir, '.cache/' + schema.REPLAN_TRANSACTION_NAME).toString('utf8'));
    archivedPlan = readSnapshotFile(epochDir, 'workflow-plan.md');
    archivedState = readSnapshotFile(epochDir, 'workflow-state.md');
    archivedTasks = readSnapshotFile(epochDir, 'workflow-tasks.json');
    childBytes = readSnapshotFile(epochDir, schema.REPLAN_PLAN_NEXT_NAME);
    attestationBytes = readSnapshotFile(epochDir, '.cache/' + schema.REPLAN_PLANNER_ATTESTATION_NAME);
    attestation = JSON.parse(attestationBytes.toString('utf8'));
  } catch (error) {
    return { ok: false, reason: 'snapshot_authority_unreadable', detail: error.message };
  }
  const txCheck = schema.validateReplanTransaction(archivedTx);
  if (!txCheck.ok || archivedTx.transaction_id !== manifest.transaction_id
      || archivedTx.snapshot.authority_digest !== manifest.snapshot_authority_digest
      || schema.canonicalJson(archivedTx.snapshot.authority_projection)
        !== schema.canonicalJson(manifest.snapshot_authority_projection)
      || (archivedTx.schema_version === 2
        && (schema.canonicalJson(archivedTx.predecessor) !== schema.canonicalJson(manifest.transaction_predecessor)
          || schema.canonicalJson(archivedTx.source.rotated_from) !== schema.canonicalJson(manifest.rotated_source)))) {
    return { ok: false, reason: 'snapshot_authority_transaction_mismatch' };
  }
  const recomputed = buildSnapshotAuthorityProjection(archivedTx);
  recomputed.parent.plan_exact_digest = schema.sha256Hex(archivedPlan);
  recomputed.parent.plan_hash = validator.readStoredHash(archivedPlan.toString('utf8'));
  recomputed.parent.task_mirror_exact_digest = schema.sha256Hex(archivedTasks);
  recomputed.parent.ledger_semantic_digest = ledgerDigest(archivedPlan.toString('utf8'));
  recomputed.parent.state_authority_digest = schema.sha256Canonical(
    authorityStateView(parseStateFields(archivedState.toString('utf8'))));
  if (schema.canonicalJson(recomputed) !== schema.canonicalJson(manifest.snapshot_authority_projection)
      || schema.sha256Canonical(recomputed) !== manifest.snapshot_authority_digest) {
    return { ok: false, reason: 'snapshot_authority_projection_mismatch' };
  }
  const childRow = snapshotFileRecord(manifest, schema.REPLAN_PLAN_NEXT_NAME);
  const attestationRow = snapshotFileRecord(manifest, '.cache/' + schema.REPLAN_PLANNER_ATTESTATION_NAME);
  const childDigest = schema.sha256Hex(childBytes);
  const attestationExactDigest = schema.sha256Hex(attestationBytes);
  const childMeta = metaFields(childBytes.toString('utf8'));
  const childNodes = validator.parseNodes(childBytes.toString('utf8'));
  const attestationSemantic = Object.assign({}, attestation);
  delete attestationSemantic.attestation_digest;
  if (!childRow || !attestationRow
      || childRow.digest !== childDigest || childDigest !== manifest.child.digest
      || childDigest !== archivedTx.child.digest
      || !attestedChildBinds(attestation.child_digest, childDigest, archivedTx.child_authored)
      || validator.readStoredHash(childBytes.toString('utf8')) !== manifest.child.plan_hash
      || manifest.child.plan_hash !== archivedTx.child.plan_hash
      || (archivedTx.schema_version === 2 && (!childNodes.length
        || archivedTx.child.first_node_id !== childNodes[0].id
        || archivedTx.child.first_node_role !== childNodes[0].role))
      || childMeta.parent_snapshot_manifest_digest !== manifest.snapshot_authority_digest
      || attestationRow.digest !== attestationExactDigest
      || manifest.child.attestation_exact_digest !== attestationExactDigest
      || manifest.child.attestation_digest !== attestation.attestation_digest
      || archivedTx.planner.attestation_digest !== attestation.attestation_digest
      || archivedTx.planner.attestation_file_digest !== attestationExactDigest
      || schema.sha256Canonical(attestationSemantic) !== attestation.attestation_digest) {
    return { ok: false, reason: 'snapshot_child_binding_invalid' };
  }
  const manifestDigest = schema.sha256Hex(manifestBytes);
  let liveTx = null;
  let liveState = null;
  try { liveTx = readAuthorityJson(path.join(projectDir, '.cache', schema.REPLAN_TRANSACTION_NAME)); } catch (_) {}
  try { liveState = parseStateFields(readAuthorityText(path.join(projectDir, 'workflow-state.md'))); } catch (_) {}
  if (!liveTx || liveTx.transaction_id !== manifest.transaction_id
      || (liveTx.phase === 'committed' && liveTx.outcome === 'committed')) {
    const sealed = readCommittedTransactionAuthority(projectDir, manifest.transaction_id);
    if (!sealed.ok) return sealed;
    if (sealed.transaction.snapshot.manifest_digest !== manifestDigest
        || sealed.transaction.child.digest !== childDigest
        || sealed.transaction.child.plan_hash !== manifest.child.plan_hash
        || sealed.transaction.planner.attestation_digest !== manifest.child.attestation_digest) {
      return { ok: false, reason: 'snapshot_transaction_receipt_mismatch' };
    }
  }
  if (liveTx && liveTx.transaction_id === manifest.transaction_id) {
    if (liveTx.snapshot.manifest_digest && liveTx.snapshot.manifest_digest !== manifestDigest) {
      return { ok: false, reason: 'snapshot_manifest_exact_digest_mismatch' };
    }
    if (liveState && liveTx.phase === 'committed'
        && liveState.active_snapshot_manifest_digest !== manifestDigest) {
      return { ok: false, reason: 'snapshot_active_manifest_mismatch' };
    }
  }
  let liveChild = null;
  try { liveChild = readAuthorityBytes(path.join(projectDir, schema.REPLAN_PLAN_NEXT_NAME)); } catch (_) {}
  if (!liveChild || !liveChild.length) {
    try { liveChild = readAuthorityBytes(path.join(projectDir, 'workflow-plan.md')); } catch (_) {}
  }
  if (liveChild && liveState && liveState.active_snapshot_manifest_digest === manifestDigest) {
    const liveContent = liveChild.toString('utf8');
    if (validator.readStoredHash(liveContent) !== manifest.child.plan_hash
        || validator.computePlanHash(liveContent) !== manifest.child.plan_hash) {
      return { ok: false, reason: 'snapshot_active_child_mismatch' };
    }
    if (!sectionHasOnlyTableContent(liveContent, 'Required Agent Compliance')) {
      return { ok: false, reason: 'snapshot_active_child_mismatch', detail: 'active_child_trailing_surface_invalid' };
    }
  }
  return { ok: true, binding_status: 'schema2_projection_bound' };
}

function verifyLegacyExternalBinding(epochDir, manifest, manifestBytes) {
  const projectDir = projectDirForEpoch(epochDir);
  try {
    const childBytes = readSnapshotFile(epochDir, schema.REPLAN_PLAN_NEXT_NAME);
    const childDigest = schema.sha256Hex(childBytes);
    const childMeta = metaFields(childBytes.toString('utf8'));
    if (childMeta.parent_snapshot_manifest_digest !== 'pending') throw new Error('legacy_child_not_pending');
    const childRow = snapshotFileRecord(manifest, schema.REPLAN_PLAN_NEXT_NAME);
    const copiedAttestationBytes = readSnapshotFile(epochDir, '.cache/' + schema.REPLAN_PLANNER_ATTESTATION_NAME);
    const copiedAttestation = JSON.parse(copiedAttestationBytes.toString('utf8'));
    const manifestDigest = schema.sha256Hex(manifestBytes);
    const receipt = readCommittedTransactionAuthority(projectDir, manifest.transaction_id);
    if (!receipt.ok) throw new Error(receipt.reason + (receipt.detail ? ':' + receipt.detail : ''));
    const sealedTx = receipt.transaction;
    const copiedAttestationSemantic = Object.assign({}, copiedAttestation);
    delete copiedAttestationSemantic.attestation_digest;
    if (!childRow || childRow.digest !== childDigest || manifest.child.digest !== childDigest
        || manifest.child.plan_hash !== validator.readStoredHash(childBytes.toString('utf8'))
        || sealedTx.schema_version !== 1 || sealedTx.phase !== 'committed' || sealedTx.outcome !== 'committed'
        || sealedTx.child.digest !== childDigest || sealedTx.child.plan_hash !== manifest.child.plan_hash
        || sealedTx.planner.attestation_digest !== manifest.child.attestation_digest
        || copiedAttestation.attestation_digest !== manifest.child.attestation_digest
        || schema.sha256Canonical(copiedAttestationSemantic) !== copiedAttestation.attestation_digest
        || sealedTx.snapshot.manifest_digest !== manifestDigest) {
      throw new Error('legacy_external_seal_mismatch');
    }
    return { ok: true, binding_status: receipt.path.endsWith(schema.REPLAN_TRANSACTION_NAME)
      ? 'legacy_external_binding' : 'legacy_committed_receipt_binding' };
  } catch (error) {
    return { ok: false, reason: 'legacy_snapshot_binding_unsealed', detail: error.message };
  }
}

function verifySnapshotManifest(epochDir) {
  let manifest;
  let manifestBytes;
  try {
    const epochsDir = path.dirname(epochDir);
    const cacheDir = path.dirname(epochsDir);
    for (const dir of [cacheDir, epochsDir]) {
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    }
    const epochStat = fs.lstatSync(epochDir);
    if (!epochStat.isDirectory() || epochStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    const manifestPath = path.join(epochDir, 'manifest.json');
    const manifestStat = fs.lstatSync(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) {
      throw new Error('snapshot_manifest_type_invalid');
    }
    const filesStat = fs.lstatSync(path.join(epochDir, 'files'));
    if (!filesStat.isDirectory() || filesStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    manifestBytes = fs.readFileSync(manifestPath);
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) { return { ok: false, reason: 'snapshot_manifest_missing', detail: error.message }; }
  const shape = schema.validateSnapshotManifestShape(manifest);
  if (!shape.ok) return manifest && manifest.schema_version === 1
    ? { ok: false, reason: 'legacy_snapshot_binding_unsealed', detail: shape.reason } : shape;
  const folded = new Map();
  for (const file of manifest.files) {
    const lower = file.path.toLocaleLowerCase('en-US');
    if (folded.has(lower) && folded.get(lower) !== file.path) {
      return manifest.schema_version === 1
        ? { ok: false, reason: 'legacy_snapshot_binding_unsealed', detail: 'snapshot_case_collision', path: file.path }
        : { ok: false, reason: 'snapshot_case_collision', path: file.path };
    }
    folded.set(lower, file.path);
  }
  const filesRoot = path.join(epochDir, 'files');
  let actual;
  try { actual = enumerateRegularRelative(filesRoot); }
  catch (error) { return { ok: false, reason: error.message }; }
  const expectedPaths = manifest.files.map(file => file.path);
  if (JSON.stringify(actual.map(file => file.path)) !== JSON.stringify(expectedPaths)) {
    return manifest.schema_version === 1
      ? { ok: false, reason: 'legacy_snapshot_binding_unsealed', detail: 'snapshot_file_index_mismatch' }
      : { ok: false, reason: 'snapshot_file_index_mismatch' };
  }
  // Snapshot integrity is CONTENT-addressed: size + per-file digest here, plus the
  // recomputed authority projection below. The manifest still RECORDS each file's
  // creation mode as forensic metadata, but verification deliberately does NOT compare
  // it. Permission bits are not part of the seal's security argument — nothing ever
  // executes or restores a snapshot file (they are read as bytes and never copied back
  // or chmod'ed), and no consumer reads the recorded `mode`. They are also not carried
  // by the transports these snapshots travel through: git stores only 100644/100755, so
  // the 0600 that the exclusive-authority writers create comes back 0644 through any
  // archive commit, clone, or fresh worktree checkout — and archive extraction or a
  // `core.fileMode=false` / non-POSIX checkout loses even the executable bit. Comparing
  // modes therefore generated permanent false negatives on byte-perfect evidence.
  for (let index = 0; index < actual.length; index++) {
    const got = actual[index];
    const want = manifest.files[index];
    if (got.stat.size !== want.size || schema.sha256Hex(fs.readFileSync(got.abs)) !== want.digest) {
      return manifest.schema_version === 1
        ? { ok: false, reason: 'legacy_snapshot_binding_unsealed', detail: 'snapshot_file_digest_mismatch', path: want.path }
        : { ok: false, reason: 'snapshot_file_digest_mismatch', path: want.path };
    }
  }
  const binding = manifest.schema_version === 2
    ? verifySchema2SnapshotBinding(epochDir, manifest, manifestBytes)
    : verifyLegacyExternalBinding(epochDir, manifest, manifestBytes);
  if (!binding.ok) return binding;
  return {
    ok: true,
    manifest,
    manifest_digest: schema.sha256Hex(manifestBytes),
    manifest_self_digest: manifest.manifest_self_digest,
    epoch_dir: epochDir,
    binding_status: binding.binding_status,
  };
}

function verifyAllEpochSnapshots(projectDir, expected) {
  const epochsDir = path.join(projectDir, '.cache', 'epochs');
  let binding = expected || null;
  try {
    const state = parseStateFields(readAuthorityText(path.join(projectDir, 'workflow-state.md')));
    const epochAuthority = schema.validateEpochStateAuthority(state);
    if (!epochAuthority.ok) return epochAuthority;
    if (!binding && !epochAuthority.legacy) {
        binding = {
          epoch_lineage_id: epochAuthority.epoch_lineage_id,
          claim_root_base_digest: epochAuthority.claim_root_base_digest,
          plan_epoch: Number(state.plan_epoch),
          active_plan_hash: state.active_plan_hash,
          active_snapshot_manifest_digest: state.active_snapshot_manifest_digest,
          authorized_epoch_ceiling: Number(state.authorized_epoch_ceiling || schema.REVIEW_REPLAN_LIMIT),
        };
    }
  } catch (_) { return { ok: false, reason: 'snapshot_state_binding_unreadable' }; }
  try {
    for (const dir of [path.dirname(projectDir), projectDir]) {
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    }
    const cacheDir = path.join(projectDir, '.cache');
    if (entryExists(cacheDir)) {
      const cacheStat = fs.lstatSync(cacheDir);
      if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) throw new Error('snapshot_directory_invalid');
    }
  } catch (error) {
    return { ok: false, reason: 'snapshot_epochs_unreadable', detail: error.message };
  }
  if (binding && binding.active_plan_hash === 'none') {
    const authority = verifyCurrentEpochAuthority(projectDir);
    if (!authority.ok || authority.authority_kind !== 'planless'
        || binding.plan_epoch !== 1 || binding.active_snapshot_manifest_digest !== 'none') {
      return authority.ok ? { ok: false, reason: 'state_planless_authority_invalid' } : authority;
    }
    return { ok: true, snapshots: [], authority_kind: 'planless' };
  }
  let entries = [];
  try {
    const epochsStat = fs.lstatSync(epochsDir);
    if (!epochsStat.isDirectory() || epochsStat.isSymbolicLink()) throw new Error('snapshot_epochs_type_invalid');
    entries = fs.readdirSync(epochsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return { ok: false, reason: 'snapshot_epochs_unreadable', detail: error.message };
    }
  }
  const snapshots = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.staging-')) return { ok: false, reason: 'snapshot_staging_incomplete', epoch: entry.name };
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) return { ok: false, reason: 'snapshot_epoch_entry_invalid', epoch: entry.name };
    const checked = verifySnapshotManifest(path.join(epochsDir, entry.name));
    if (!checked.ok) return checked;
    snapshots.push({ epoch: Number(entry.name), manifest_digest: checked.manifest_digest,
      transaction_id: checked.manifest.transaction_id, manifest: checked.manifest });
  }
  if (binding) {
    if (!Number.isSafeInteger(binding.plan_epoch) || binding.plan_epoch < 1
        || snapshots.length !== binding.plan_epoch - 1) {
      return { ok: false, reason: 'snapshot_epoch_sequence_invalid' };
    }
    for (let index = 0; index < snapshots.length; index++) {
      const row = snapshots[index];
      if (row.epoch !== index + 1 || row.manifest.parent_plan_epoch !== row.epoch
          || row.manifest.epoch_lineage_id !== binding.epoch_lineage_id
          || row.manifest.claim_root_base_digest !== binding.claim_root_base_digest) {
        return { ok: false, reason: 'snapshot_lineage_binding_invalid', epoch: row.epoch };
      }
    }
    if (snapshots.length) {
      const last = snapshots[snapshots.length - 1];
      if (last.manifest_digest !== binding.active_snapshot_manifest_digest) {
        return { ok: false, reason: 'snapshot_active_manifest_mismatch' };
      }
    } else if (binding.active_snapshot_manifest_digest !== 'none') {
      return { ok: false, reason: 'snapshot_active_manifest_mismatch' };
    }
    try {
      const livePlan = readAuthorityText(path.join(projectDir, 'workflow-plan.md'));
      if (validator.readStoredHash(livePlan) !== binding.active_plan_hash) {
        return { ok: false, reason: 'snapshot_active_plan_mismatch' };
      }
    } catch (_) { return { ok: false, reason: 'snapshot_active_plan_mismatch' }; }
    const consentPath = path.join(projectDir, '.cache', schema.EPOCH_CONSENT_EXTENSIONS_NAME);
    let consentLedger = null;
    if (entryExists(consentPath)) {
      try { consentLedger = readAuthorityJson(consentPath); }
      catch (_) { return { ok: false, reason: 'replan_consent_ledger_invalid' }; }
    }
    const consent = verifyConsentLedger(consentLedger, binding.epoch_lineage_id);
    if (!consent.ok || consent.ceiling !== binding.authorized_epoch_ceiling) return consent.ok
      ? { ok: false, reason: 'replan_consent_ledger_invalid' } : consent;
  }
  return { ok: true, snapshots: snapshots.map(({ manifest, ...row }) => row) };
}

function activationComplete(transaction, step) {
  return transaction.activation[step] && transaction.activation[step].status === 'complete';
}

function markActivation(paths, transaction, step, digest, opts, extra) {
  transaction.activation[step] = Object.assign({ status: 'complete', digest: digest || null, at: nowIso(opts) }, extra || {});
  const labels = {
    child_plan_promoted: 'after_tx_child_plan_promoted',
    child_state_promoted_fenced: 'after_tx_child_state_promoted_fenced',
    task_mirror_promoted: 'after_tx_task_mirror_promoted',
    active_cache_cleaned: 'after_tx_active_cache_cleaned',
  };
  updateTransaction(paths, transaction, opts, labels[step]);
}

function promotedState(paths, transaction, fenced) {
  const current = Buffer.from(transaction.parent.state_bytes_base64, 'base64').toString('utf8');
  const values = {
    epoch_schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_repository_id: transaction.parent.claim_identity.repository_id,
    claim_identity_digest: transaction.parent.claim_identity_digest,
    claim_root_object_format: transaction.parent.claim_root_base.object_format,
    claim_root_base_commit: transaction.parent.claim_root_base.commit,
    claim_root_base_tree: transaction.parent.claim_root_base.tree,
    claim_root_base_digest: transaction.parent.claim_root_base_digest,
    epoch_lineage_id: transaction.epoch_lineage_id,
    plan_epoch: transaction.parent.plan_epoch + 1,
    active_plan_hash: transaction.child.plan_hash,
    inherited_frontier_digest: transaction.cas.prepare.inherited_frontier_digest,
    inherited_frontier_classes: transaction.source.inherited_frontier_classes,
    automatic_review_replans: transaction.budget.prospective_count_after,
    authorized_epoch_ceiling: transaction.budget.ceiling,
    case_b_exemption_consumed: transaction.budget.case_b_exemption_consumed_after,
    replan_status: fenced ? 'in_progress' : 'none',
    replan_transaction_id: transaction.transaction_id,
    replan_phase: 'committed',
    active_snapshot_manifest_digest: transaction.snapshot.manifest_digest,
  };
  return schema.writeEpochStateBlock(replacePlanningEvidence(current, transaction.child), values);
}

function cleanupAllowed(rel, transaction) {
  if (rel === schema.REPLAN_PLAN_NEXT_NAME) return true;
  if (/^\.cache\/(?:running-set\.json|active-batch\.json|barrier-(?:base|open|ref)-)/.test(rel)) return true;
  const parentNodes = new Set(validator.parseNodes(Buffer.from(transaction.parent.plan_bytes_base64, 'base64').toString('utf8')).map(node => node.id));
  if (/^\.cache\/[^/]+\.md$/.test(rel) && parentNodes.has(path.basename(rel, '.md'))) return true;
  return /^\.cache\/(?:review-contexts|review-receipts|review-certifiers|validation-vectors|review-findings|epoch-projections)\//.test(rel);
}

function writeCleanupProgress(paths, transaction, cleanup, opts, label) {
  transaction.activation.active_cache_cleaned.cleanup = cleanup;
  updateTransaction(paths, transaction, opts, label);
}

function cleanupActiveCache(paths, transaction, opts) {
  const epochDir = path.join(paths.epochsDir, String(transaction.parent.plan_epoch));
  const manifest = readJson(path.join(epochDir, 'manifest.json'));
  const prior = transaction.activation.active_cache_cleaned.cleanup;
  const cleanup = prior && Array.isArray(prior.entries) ? prior : { schema_version: 1, entries: [] };
  const eligible = manifest.files.filter(entry => cleanupAllowed(entry.path, transaction)
    && !entry.path.startsWith('.cache/epochs/')
    && entry.path !== '.cache/' + schema.REPLAN_TRANSACTION_NAME
    && entry.path !== '.cache/' + schema.EPOCH_CONSENT_EXTENSIONS_NAME
    && entry.path !== '.cache/dispatch-log.jsonl');
  for (let ordinal = 0; ordinal < eligible.length; ordinal++) {
    const entry = eligible[ordinal];
    const rel = entry.path;
    const intentLabel = deterministicPathLabel('after_tx_cleanup_intent', ordinal + 1, rel);
    const unlinkLabel = deterministicPathLabel('after_cache_unlinked', ordinal + 1, rel);
    const abs = path.join(paths.projectDir, ...rel.split('/'));
    let receipt = cleanup.entries.find(row => row.path === rel);
    if (receipt && receipt.disposition === 'removed') {
      if (entryExists(abs)) throw new Error('cleanup_removed_path_reappeared:' + rel);
      continue;
    }
    if (receipt && receipt.disposition === 'preserved') {
      if (!entryExists(abs)) throw new Error('cleanup_preserved_path_missing:' + rel);
      let liveDigest = null;
      try {
        const stat = fs.lstatSync(abs);
        if (stat.isFile() && !stat.isSymbolicLink()) liveDigest = schema.sha256Hex(fs.readFileSync(abs));
      } catch (_) {}
      if (liveDigest !== receipt.observed_digest) throw new Error('cleanup_preserved_path_changed:' + rel);
      continue;
    }
    if (!entryExists(abs)) {
      if (receipt && receipt.disposition === 'delete_intent') {
        receipt.disposition = 'removed';
        receipt.removed_digest = entry.digest;
        continue;
      }
      throw new Error('cleanup_missing_without_receipt:' + rel);
    }
    let stat;
    try { stat = fs.lstatSync(abs); } catch (_) { throw new Error('cleanup_unreadable:' + rel); }
    const liveDigest = stat.isFile() && !stat.isSymbolicLink()
      ? schema.sha256Hex(fs.readFileSync(abs)) : null;
    if (!stat.isFile() || stat.isSymbolicLink() || liveDigest !== entry.digest) {
      if (receipt && receipt.disposition === 'delete_intent') {
        receipt.disposition = 'preserved';
        receipt.reason = 'changed_after_delete_intent';
        receipt.observed_digest = liveDigest;
      } else {
        receipt = { path: rel, manifest_digest: entry.digest, disposition: 'preserved',
          reason: 'digest_changed_or_nonregular', observed_digest: liveDigest };
        cleanup.entries.push(receipt);
      }
      writeCleanupProgress(paths, transaction, cleanup, opts, intentLabel);
      continue;
    }
    if (!receipt) {
      receipt = { path: rel, manifest_digest: entry.digest, disposition: 'delete_intent' };
      cleanup.entries.push(receipt);
      writeCleanupProgress(paths, transaction, cleanup, opts, intentLabel);
    }
    durableUnlink(abs, opts, unlinkLabel);
    receipt.disposition = 'removed';
    receipt.removed_digest = entry.digest;
  }
  cleanup.entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema_version: cleanup.schema_version,
    entries: cleanup.entries,
    removed: cleanup.entries.filter(row => row.disposition === 'removed')
      .map(row => ({ path: row.path, digest: row.removed_digest })),
    preserved: cleanup.entries.filter(row => row.disposition === 'preserved')
      .map(row => ({ path: row.path, reason: row.reason, observed_digest: row.observed_digest })),
  };
}

function verifyCleanupReceipt(paths, transaction) {
  const cleanup = transaction.activation.active_cache_cleaned.cleanup;
  if (!cleanup || !Array.isArray(cleanup.entries)) return { ok: false, reason: 'cleanup_receipt_missing' };
  const terminal = transaction.phase === 'committed'
    && activationComplete(transaction, 'transaction_committed');
  for (const row of cleanup.entries) {
    const abs = path.join(paths.projectDir, ...String(row.path || '').split('/'));
    if (row.disposition === 'removed') {
      if (!HEX64_RE.test(String(row.manifest_digest || ''))
          || !HEX64_RE.test(String(row.removed_digest || ''))) {
        return { ok: false, reason: 'cleanup_receipt_incomplete', path: row.path };
      }
      // After commit, epoch-local review/cache paths may legitimately be
      // recreated by the next epoch. The digest-bound receipt proves the prior
      // deletion; only an in-progress activation pins live absence.
      if (!terminal && entryExists(abs)) return { ok: false, reason: 'cleanup_removed_path_reappeared', path: row.path };
    } else if (row.disposition === 'preserved') {
      if (!HEX64_RE.test(String(row.manifest_digest || ''))
          || !(row.observed_digest === null || HEX64_RE.test(String(row.observed_digest || '')))) {
        return { ok: false, reason: 'cleanup_receipt_incomplete', path: row.path };
      }
      if (terminal) continue;
      let digest = null;
      try {
        const stat = fs.lstatSync(abs);
        if (stat.isFile() && !stat.isSymbolicLink()) digest = schema.sha256Hex(fs.readFileSync(abs));
      } catch (_) {}
      if (digest !== row.observed_digest) return { ok: false, reason: 'cleanup_preserved_path_changed', path: row.path };
    } else {
      return { ok: false, reason: 'cleanup_receipt_incomplete', path: row.path };
    }
  }
  return { ok: true };
}

function transactionCommitDigest(transaction) {
  return schema.sha256Canonical({
    epoch: transaction.parent.plan_epoch + 1,
    plan_hash: transaction.child.plan_hash,
    count: transaction.budget.prospective_count_after,
    snapshot: transaction.snapshot.manifest_digest,
  });
}

function verifyCompletedActivationOutputs(paths, transaction) {
  const terminal = transaction.phase === 'committed'
    && activationComplete(transaction, 'state_unfenced');
  if (activationComplete(transaction, 'child_plan_promoted')) {
    try {
      const plan = readAuthorityText(paths.planPath);
      if (terminal
        ? (validator.readStoredHash(plan) !== transaction.child.plan_hash
          || validator.computePlanHash(plan) !== transaction.child.plan_hash)
        : exactDigest(paths.planPath) !== transaction.child.digest) {
        return { ok: false, step: 'child_plan_promoted' };
      }
    } catch (_) { return { ok: false, step: 'child_plan_promoted' }; }
  }
  if (activationComplete(transaction, 'child_state_promoted_fenced')) {
    const expected = promotedState(paths, transaction, true);
    const digest = schema.sha256Hex(Buffer.from(expected));
    if (transaction.activation.child_state_promoted_fenced.digest !== digest) {
      return { ok: false, step: 'child_state_promoted_fenced' };
    }
    if (!activationComplete(transaction, 'transaction_committed')) {
      try {
        if (exactDigest(paths.statePath) !== digest) return { ok: false, step: 'child_state_promoted_fenced' };
      } catch (_) { return { ok: false, step: 'child_state_promoted_fenced' }; }
    }
  }
  if (activationComplete(transaction, 'task_mirror_promoted')) {
    try {
      if (!terminal && exactDigest(path.join(paths.projectDir, 'workflow-tasks.json'))
          !== transaction.activation.task_mirror_promoted.digest) {
        return { ok: false, step: 'task_mirror_promoted' };
      }
    } catch (_) { return { ok: false, step: 'task_mirror_promoted' }; }
  }
  if (activationComplete(transaction, 'active_cache_cleaned')) {
    const cleanup = verifyCleanupReceipt(paths, transaction);
    if (!cleanup.ok) return { ok: false, step: 'active_cache_cleaned', detail: cleanup.reason, path: cleanup.path };
    if (transaction.activation.active_cache_cleaned.digest
        !== schema.sha256Canonical(transaction.activation.active_cache_cleaned.cleanup)) {
      return { ok: false, step: 'active_cache_cleaned' };
    }
  }
  if (activationComplete(transaction, 'transaction_committed')
      && transaction.activation.transaction_committed.digest !== transactionCommitDigest(transaction)) {
    return { ok: false, step: 'transaction_committed' };
  }
  if (activationComplete(transaction, 'state_unfenced')) {
    const expected = promotedState(paths, transaction, false);
    if (transaction.activation.state_unfenced.digest !== schema.sha256Hex(Buffer.from(expected))) {
      return { ok: false, step: 'state_unfenced' };
    }
  }
  return { ok: true };
}

function activate(paths, transaction, opts) {
  const outputs = verifyCompletedActivationOutputs(paths, transaction);
  if (!outputs.ok) return schema.refuse('replan_activation_integrity_failure', {
    step: outputs.step, detail: outputs.detail || null, path: outputs.path || null,
  });
  if (!activationComplete(transaction, 'child_plan_promoted')) {
    const childBytes = Buffer.from(transaction.child.bytes_base64, 'base64');
    durableWriteFile(paths.planPath, childBytes.toString('utf8'), opts, 'after_plan_child_promoted');
    if (exactDigest(paths.planPath) !== transaction.child.digest) {
      return schema.refuse('replan_activation_integrity_failure', { step: 'child_plan_promoted' });
    }
    markActivation(paths, transaction, 'child_plan_promoted', transaction.child.digest, opts);
  } else if (exactDigest(paths.planPath) !== transaction.child.digest) {
    return schema.refuse('replan_activation_integrity_failure', { step: 'child_plan_promoted' });
  }

  if (!activationComplete(transaction, 'child_state_promoted_fenced')) {
    const state = promotedState(paths, transaction, true);
    durableWriteFile(paths.statePath, state, opts, 'after_state_child_promoted_fenced');
    markActivation(paths, transaction, 'child_state_promoted_fenced', schema.sha256Hex(Buffer.from(state)), opts);
  }

  if (!activationComplete(transaction, 'task_mirror_promoted')) {
    let mirror;
    try {
      const childContent = readAuthorityText(paths.planPath);
      mirror = generateMirror({ planContent: childContent, now: transaction.child.freeze_time });
      if (!mirror || mirror.status === 'plan_not_frozen' || mirror.source_plan_hash !== transaction.child.plan_hash
          || !Array.isArray(mirror.tasks) || mirror.tasks.some(task => task.ledger_status !== 'pending')) {
        throw new Error('mirror_not_all_pending');
      }
      const bytes = JSON.stringify(mirror, null, 2) + '\n';
      durableWriteFile(path.join(paths.projectDir, 'workflow-tasks.json'), bytes, opts,
        'after_tasks_child_promoted');
      markActivation(paths, transaction, 'task_mirror_promoted', schema.sha256Hex(Buffer.from(bytes)), opts);
    } catch (error) {
      if (error && error.code === 'KAOLA_REPLAN_FAILPOINT') throw error;
      transaction.failure = { reason: 'replan_task_mirror_failed', detail: error.message, at: nowIso(opts) };
      updateTransaction(paths, transaction, opts, 'after_tx_failure_task_mirror');
      return schema.refuse('replan_task_mirror_failed', { detail: error.message });
    }
  }

  if (!activationComplete(transaction, 'active_cache_cleaned')) {
    try {
      const cleanup = cleanupActiveCache(paths, transaction, opts);
      const digest = schema.sha256Canonical(cleanup);
      markActivation(paths, transaction, 'active_cache_cleaned', digest, opts, { cleanup });
    } catch (error) {
      if (error && error.code === 'KAOLA_REPLAN_FAILPOINT') throw error;
      transaction.failure = { reason: 'replan_cache_cleanup_failed', detail: error.message, at: nowIso(opts) };
      updateTransaction(paths, transaction, opts, 'after_tx_failure_cleanup');
      return schema.refuse('replan_cache_cleanup_failed', { detail: error.message });
    }
  }

  if (!activationComplete(transaction, 'transaction_committed')) {
    transaction.phase = 'committed';
    transaction.outcome = 'committed';
    transaction.failure = null;
    transaction.activation.transaction_committed = {
      status: 'complete', digest: transactionCommitDigest(transaction), at: nowIso(opts),
    };
    updateTransaction(paths, transaction, opts, 'after_tx_committed');
  }

  if (!activationComplete(transaction, 'state_unfenced')) {
    const state = promotedState(paths, transaction, false);
    durableWriteFile(paths.statePath, state, opts, 'after_state_unfenced');
    transaction.activation.state_unfenced = {
      status: 'complete', digest: schema.sha256Hex(Buffer.from(state)), at: nowIso(opts),
    };
    updateTransaction(paths, transaction, opts, 'after_tx_state_unfenced');
  } else {
    const state = promotedState(paths, transaction, false);
    const digest = schema.sha256Hex(Buffer.from(state));
    if (transaction.activation.state_unfenced.digest !== digest) {
      return schema.refuse('replan_activation_integrity_failure', { step: 'state_unfenced' });
    }
    try {
      if (exactDigest(paths.statePath) !== digest) {
        durableWriteFile(paths.statePath, state, opts, 'after_state_unfenced');
      }
    } catch (_) {
      durableWriteFile(paths.statePath, state, opts, 'after_state_unfenced');
    }
  }
  return {
    result: 'committed',
    transaction_id: transaction.transaction_id,
    epoch_lineage_id: transaction.epoch_lineage_id,
    plan_epoch: transaction.parent.plan_epoch + 1,
    plan_hash: transaction.child.plan_hash,
    snapshot_manifest_digest: transaction.snapshot.manifest_digest,
  };
}

function resumeReplan(opts) {
  const repoRoot = fs.realpathSync(opts.repoRoot || getRepoRoot());
  const paths = projectPaths(repoRoot, opts.project);
  return withProjectLock(paths, 'replan resume', () => resumeReplanUnlocked(paths, opts));
}

function resumeReplanUnlocked(paths, opts) {
  let transaction;
  try { transaction = readAuthorityJsonOrNull(paths.transactionPath); }
  catch (_) { return schema.refuse('replan_transaction_invalid'); }
  if (!transaction) return schema.refuse(entryExists(paths.transactionPath)
    ? 'replan_transaction_invalid' : 'replan_transaction_missing');
  const checked = schema.validateReplanTransaction(transaction);
  if (!checked.ok) return schema.refuse(checked.reason);
  const reauthorRecovery = repairCandidateReauthorPrefix(paths, transaction, opts);
  if (!reauthorRecovery.ok) return schema.refuse(reauthorRecovery.reason);
  if (transaction.phase === 'committed' && activationComplete(transaction, 'state_unfenced')) {
    const outputs = verifyCompletedActivationOutputs(paths, transaction);
    if (!outputs.ok) return schema.refuse('replan_activation_integrity_failure', {
      step: outputs.step, detail: outputs.detail || null, path: outputs.path || null,
    });
    try {
      if (exactDigest(paths.statePath) === transaction.activation.state_unfenced.digest) {
        return { result: 'already_committed', transaction_id: transaction.transaction_id,
          plan_hash: transaction.child.plan_hash, snapshot_manifest_digest: transaction.snapshot.manifest_digest };
      }
    } catch (_) {}
    return activate(paths, transaction, opts);
  }
  if (transaction.outcome === 'candidate_changed') {
    return reauthorCandidate(paths, transaction, opts);
  }
  if (transaction.outcome === 'consent_halt') {
    const stateContent = readAuthorityText(paths.statePath);
    const state = parseStateFields(stateContent);
    const consent = consentAuthority(paths, transaction.epoch_lineage_id, state);
    if (!consent.ok) return schema.refuse(consent.reason);
    if (consent.ceiling <= transaction.budget.count_before) {
      return schema.refuse('replan_consent_required', { transaction_id: transaction.transaction_id,
        automatic_review_replans: transaction.budget.count_before, authorized_epoch_ceiling: transaction.budget.ceiling });
    }
    transaction.outcome = 'in_progress';
    transaction.failure = null;
    transaction.budget.ceiling = consent.ceiling;
    transaction.budget.consent_ledger_digest = consent.consent_ledger_digest;
    transaction.budget.prospective_count_after = transaction.budget.count_before + transaction.transition_cost;
    transaction.parent.state_bytes_base64 = Buffer.from(stateContent, 'utf8').toString('base64');
    transaction.parent.state_pre_fence_digest = schema.sha256Hex(Buffer.from(stateContent, 'utf8'));
    transaction.parent.state_authority_digest = schema.sha256Canonical(authorityStateView(state));
    updateTransaction(paths, transaction, opts, 'after_tx_consent_resumed');
  }

  if (transaction.phase === 'prepared') {
    const authority = verifyParentAuthority(paths, transaction);
    if (!authority.ok) return schema.refuse(authority.reason);
    const sourceAuthority = verifySourceAuthority(paths, transaction);
    if (!sourceAuthority.ok) return schema.refuse(sourceAuthority.reason);
    const observed = observeCas(paths, transaction, 'prepare', opts);
    if (!observed.ok) return schema.refuse(observed.reason);
    if (!sameCasTuple(casTuple(transaction.cas.prepare), casTuple(observed))) return candidateChanged(paths, transaction, observed, opts);
    const packet = buildPlannerPacket(paths, transaction);
    durableWriteJson(paths.packetPath, packet, opts, 'after_packet_written');
    const seeded = seedPlannerOutput(paths, opts);
    if (!seeded.ok) return schema.refuse(seeded.reason);
    transaction.planner.packet_digest = exactDigest(paths.packetPath);
    transaction.planner.pending_at = nowIso(opts);
    transaction.phase = 'planner_pending';
    updateTransaction(paths, transaction, opts, 'after_tx_planner_pending');
    updateFenceState(paths, transaction, opts, null, 'after_state_planner_pending_fence');
    return schema.refuse('replan_planner_dispatch_required', {
      transaction_id: transaction.transaction_id,
      phase: transaction.phase,
      packet_path: transaction.planner.packet_path,
      child_path: transaction.planner.child_path,
      dispatch_nonce: transaction.planner.dispatch_nonce,
      planner_profile_identity: transaction.planner.profile_identity,
    });
  }

  if (transaction.phase === 'planner_pending') {
    const authority = verifyParentAuthority(paths, transaction);
    if (!authority.ok) return schema.refuse(authority.reason);
    const sourceAuthority = verifySourceAuthority(paths, transaction);
    if (!sourceAuthority.ok) return schema.refuse(sourceAuthority.reason);
    let childStat;
    try { childStat = fs.lstatSync(paths.childPath); }
    catch (_) { return schema.refuse('replan_planner_dispatch_required', { transaction_id: transaction.transaction_id }); }
    if (!childStat.isFile() || childStat.isSymbolicLink() || childStat.size === 0) {
      return schema.refuse('replan_planner_dispatch_required', { transaction_id: transaction.transaction_id });
    }
    const attested = verifyPlannerAttestation(paths, transaction);
    if (!attested.ok) return schema.refuse(attested.reason, { detail: attested.detail || null });
    const observed = observeCas(paths, transaction, 'pre_freeze', opts);
    if (!observed.ok) return schema.refuse(observed.reason);
    let journalPreFreeze = false;
    if (transaction.cas.pre_freeze) {
      if (transaction.cas.pre_freeze.seam !== 'pre_freeze'
          || transaction.cas.pre_freeze.result !== 'match'
          || !sameCasTuple(casTuple(transaction.cas.pre_freeze), casTuple(transaction.cas.prepare))) {
        return schema.refuse('replan_pre_freeze_cas_mismatch');
      }
      if (!sameCasTuple(casTuple(transaction.cas.pre_freeze), casTuple(observed))) {
        return candidateChanged(paths, transaction, observed, opts);
      }
    } else {
      transaction.cas.pre_freeze = observed;
      if (observed.result !== 'match') return candidateChanged(paths, transaction, observed, opts);
      journalPreFreeze = true;
    }
    // #737: the record of the image the planner signed is refreshed on EVERY pass through
    // this phase, in BOTH CAS arms. A planner that repairs an invalid child and RE-ATTESTS
    // inside the same transaction must never be judged against the draft it replaced —
    // recording it once would permanently wedge that documented bounded repair loop.
    const priorAuthored = transaction.child_authored;
    if (!priorAuthored || priorAuthored.digest !== attested.child_digest
        || priorAuthored.attestation_digest !== attested.attestation_digest) {
      transaction.child_authored = {
        schema_version: 1,
        digest: attested.child_digest,
        attestation_digest: attested.attestation_digest,
        bytes_base64: attested.child.toString('base64'),
        frozen_digest: null,
      };
      journalPreFreeze = true;
    }
    if (journalPreFreeze) {
      // The matching CAS receipt and the attested authored image are durable before the
      // child handoff can freeze any bytes. A crash after this write replays the same
      // authority tuple against the same attested image.
      updateTransaction(paths, transaction, opts, 'after_tx_pre_freeze_cas');
    }
    const handoff = freezeAttestedChildWithHandoff(paths, transaction, attested, opts);
    if (!handoff || handoff.result !== 'child_frozen') {
      return handoff || schema.refuse('replan_child_invalid');
    }
    const child = validateChildPlan(handoff.child_bytes, transaction);
    if (!child.ok) return schema.refuse(child.reason, { field: child.field || null, errors: child.errors || [] });
    if (child.plan_hash !== handoff.child_plan_hash) return schema.refuse('replan_child_integrity_failure');
    transaction.planner.attestation_digest = attested.attestation_digest;
    transaction.planner.attestation_file_digest = attested.attestation_file_digest;
    // #737: record the frozen witness the freeze already returned and verified against the
    // bytes on disk. Every later seam compares this digest instead of re-deriving the stamp,
    // which is what keeps the sealed archive pure arithmetic over immutable bytes.
    transaction.child_authored = Object.assign({}, transaction.child_authored,
      { frozen_digest: handoff.frozen_child_digest });
    transaction.child = {
      contract_version: 2,
      digest: handoff.frozen_child_digest,
      plan_hash: handoff.child_plan_hash,
      decision: child.decision,
      risk_line: child.risk_line,
      first_node_id: child.first_node_id,
      first_node_role: child.first_node_role,
      semantic_digest: child.semantic_digest,
      ledger_digest: child.ledger_digest,
      all_pending: true,
      freeze_time: nowIso(opts),
      bytes_base64: handoff.child_bytes.toString('base64'),
    };
    transaction.phase = 'child_frozen';
    updateTransaction(paths, transaction, opts, 'after_tx_child_frozen');
    updateFenceState(paths, transaction, opts, null, 'after_state_child_frozen_fence');
  }

  if (transaction.phase === 'child_frozen') {
    const fence = parseStateFields(readAuthorityText(paths.statePath));
    if (fence.replan_transaction_id !== transaction.transaction_id
        || fence.replan_phase !== 'child_frozen' || fence.replan_status !== 'in_progress') {
      updateFenceState(paths, transaction, opts, null, 'after_state_child_frozen_fence');
    }
    const authority = verifyParentAuthority(paths, transaction);
    if (!authority.ok) return schema.refuse(authority.reason);
    const sourceAuthority = verifySourceAuthority(paths, transaction);
    if (!sourceAuthority.ok) return schema.refuse(sourceAuthority.reason);
    const childBytes = Buffer.from(transaction.child.bytes_base64, 'base64');
    if (schema.sha256Hex(childBytes) !== transaction.child.digest) return schema.refuse('replan_child_integrity_failure');
    const liveChild = verifyFrozenChildAuthority(paths, transaction);
    if (!liveChild.ok) return schema.refuse(liveChild.reason, { detail: liveChild.detail || null });
    const observed = observeCas(paths, transaction, 'pre_snapshot', opts);
    if (!observed.ok) return schema.refuse(observed.reason);
    transaction.cas.pre_snapshot = observed;
    if (observed.result !== 'match') return candidateChanged(paths, transaction, observed, opts);
    updateTransaction(paths, transaction, opts, 'after_tx_pre_snapshot_cas');
    const snapshot = buildSnapshot(paths, transaction, opts);
    if (!snapshot.ok) {
      transaction.failure = { reason: 'replan_snapshot_incomplete', detail: snapshot.detail || snapshot.reason, at: nowIso(opts) };
      updateTransaction(paths, transaction, opts, 'after_tx_failure_snapshot');
      return schema.refuse('replan_snapshot_incomplete', { detail: snapshot.detail || snapshot.reason });
    }
    transaction.snapshot.manifest_digest = snapshot.manifest_digest;
    transaction.snapshot.manifest_self_digest = snapshot.manifest_self_digest;
    transaction.snapshot.verified = true;
    transaction.phase = 'parent_archived';
    transaction.failure = null;
    updateTransaction(paths, transaction, opts, 'after_tx_parent_archived');
    updateFenceState(paths, transaction, opts, null, 'after_state_parent_archived_fence');
  }

  if (transaction.phase === 'parent_archived') {
    const snapshot = verifySnapshotManifest(path.join(paths.epochsDir, String(transaction.parent.plan_epoch)));
    if (!snapshot.ok || snapshot.manifest_digest !== transaction.snapshot.manifest_digest) {
      return schema.refuse('replan_snapshot_incomplete', { detail: snapshot.reason || 'manifest_digest_changed' });
    }
    let livePlanDigest = null;
    try { livePlanDigest = exactDigest(paths.planPath); } catch (_) {}
    const promotionBegan = activationComplete(transaction, 'child_plan_promoted')
      || livePlanDigest === transaction.child.digest;
    if (!promotionBegan) {
      const authority = verifyParentAuthority(paths, transaction);
      if (!authority.ok) return schema.refuse(authority.reason);
      const sourceAuthority = verifySourceAuthority(paths, transaction);
      if (!sourceAuthority.ok) return schema.refuse(sourceAuthority.reason);
      const observed = observeCas(paths, transaction, 'pre_activation', opts);
      if (!observed.ok) return schema.refuse(observed.reason);
      transaction.cas.pre_activation = observed;
      if (observed.result !== 'match') return candidateChanged(paths, transaction, observed, opts);
      updateTransaction(paths, transaction, opts, 'after_tx_pre_activation_cas');
    } else if (!transaction.cas.pre_activation || transaction.cas.pre_activation.result !== 'match') {
      // Promotion is irreversible. It may begin only after the durable fourth
      // CAS receipt; a child plan with no matching receipt is manual-recovery
      // integrity failure, never an excuse to recalculate against mutable HEAD.
      return schema.refuse('replan_activation_integrity_failure', { step: 'pre_activation' });
    }
    return activate(paths, transaction, opts);
  }

  if (transaction.phase === 'committed') return activate(paths, transaction, opts);
  return schema.refuse('replan_transaction_invalid');
}

function verifyConsentLedger(ledger, epochLineageId) {
  if (ledger == null) return { ok: true, entries: [], ceiling: schema.REVIEW_REPLAN_LIMIT, digest: null };
  if (!ledger || ledger.schema_version !== 1 || !Array.isArray(ledger.entries)) {
    return { ok: false, reason: 'replan_consent_ledger_invalid' };
  }
  let previous = null;
  let ceiling = schema.REVIEW_REPLAN_LIMIT;
  const userTurns = new Set();
  for (const entry of ledger.entries) {
    if (!entry || entry.schema_version !== 1 || entry.epoch_lineage_id !== epochLineageId
        || entry.prior_ceiling !== ceiling || entry.new_ceiling !== ceiling + 1 || entry.increment !== 1
        || !entry.user_turn_reference || !entry.requested_at || !entry.reason
        || entry.previous_entry_digest !== previous || userTurns.has(entry.user_turn_reference)) {
      return { ok: false, reason: 'replan_consent_ledger_invalid' };
    }
    const expectedExtensionId = schema.sha256Canonical({
      schema_version: 1,
      epoch_lineage_id: epochLineageId,
      prior_ceiling: ceiling,
      new_ceiling: ceiling + 1,
      increment: 1,
      user_turn_reference: entry.user_turn_reference,
      previous_entry_digest: previous,
    });
    if (entry.extension_id !== expectedExtensionId) {
      return { ok: false, reason: 'replan_consent_ledger_invalid' };
    }
    const copy = Object.assign({}, entry);
    delete copy.entry_digest;
    if (schema.sha256Canonical(copy) !== entry.entry_digest) {
      return { ok: false, reason: 'replan_consent_ledger_invalid' };
    }
    previous = entry.entry_digest;
    ceiling = entry.new_ceiling;
    userTurns.add(entry.user_turn_reference);
  }
  return { ok: true, entries: ledger.entries, ceiling, digest: previous };
}

function appendConsentExtension(opts) {
  const repoRoot = fs.realpathSync(opts.repoRoot || getRepoRoot());
  const paths = projectPaths(repoRoot, opts.project);
  return withProjectLock(paths, 'replan extend-consent', () => {
    if (!opts.userTurnReference || !opts.reason) return schema.refuse('replan_consent_reference_required');
    const stateContent = readAuthorityText(paths.statePath);
    const state = parseStateFields(stateContent);
    const lineageId = state.epoch_lineage_id;
    if (!HEX64_RE.test(String(lineageId || ''))) return schema.refuse('claim_lineage_digest_mismatch');
    let transaction;
    try { transaction = readAuthorityJsonOrNull(paths.transactionPath); }
    catch (_) { return schema.refuse('replan_transaction_invalid'); }
    if (transaction) {
      const transactionCheck = schema.validateReplanTransaction(transaction);
      if (!transactionCheck.ok) return schema.refuse(transactionCheck.reason);
      if (transaction.epoch_lineage_id !== lineageId
          || (!['consent_halt', 'committed'].includes(transaction.outcome))) {
        return schema.refuse('replan_consent_not_requested');
      }
    }
    let ledger = { schema_version: 1, entries: [] };
    if (entryExists(paths.consentPath)) {
      try { ledger = readAuthorityJson(paths.consentPath); }
      catch (_) { return schema.refuse('replan_consent_ledger_invalid'); }
    }
    const verified = verifyConsentLedger(ledger, lineageId);
    if (!verified.ok) return schema.refuse(verified.reason);
    const duplicate = verified.entries.find(entry => entry.user_turn_reference === String(opts.userTurnReference));
    if (duplicate) {
      if (duplicate.reason !== String(opts.reason)) return schema.refuse('replan_consent_reference_reused');
      const repaired = schema.writeEpochStateBlock(stateContent, { authorized_epoch_ceiling: verified.ceiling });
      durableWriteFile(paths.statePath, repaired, opts, 'after_state_consent_ceiling');
      return { result: 'consent_already_extended', extension_id: duplicate.extension_id,
        authorized_epoch_ceiling: verified.ceiling, entry_digest: duplicate.entry_digest };
    }
    const cachedCeiling = Number(state.authorized_epoch_ceiling || schema.REVIEW_REPLAN_LIMIT);
    if (cachedCeiling !== verified.ceiling) return schema.refuse('replan_consent_ledger_invalid');
    if (Number(state.automatic_review_replans || 0) < cachedCeiling) {
      return schema.refuse('replan_consent_not_requested');
    }
    const requestedAt = nowIso(opts);
    const extensionId = schema.sha256Canonical({
      schema_version: 1,
      epoch_lineage_id: lineageId,
      prior_ceiling: verified.ceiling,
      new_ceiling: verified.ceiling + 1,
      increment: 1,
      user_turn_reference: String(opts.userTurnReference),
      previous_entry_digest: verified.digest,
    });
    const base = {
      schema_version: 1,
      extension_id: extensionId,
      epoch_lineage_id: lineageId,
      prior_ceiling: verified.ceiling,
      new_ceiling: verified.ceiling + 1,
      increment: 1,
      user_turn_reference: String(opts.userTurnReference),
      requested_at: requestedAt,
      reason: String(opts.reason),
      previous_entry_digest: verified.digest,
    };
    const entry = Object.assign({}, base, { entry_digest: schema.sha256Canonical(base) });
    ledger.entries.push(entry);
    durableWriteJson(paths.consentPath, ledger, opts, 'after_consent_ledger');
    const updated = schema.writeEpochStateBlock(stateContent, { authorized_epoch_ceiling: entry.new_ceiling });
    durableWriteFile(paths.statePath, updated, opts, 'after_state_consent_ceiling');
    return { result: 'consent_extended', extension_id: entry.extension_id,
      authorized_epoch_ceiling: entry.new_ceiling, entry_digest: entry.entry_digest };
  });
}

function readStatus(opts) {
  const repoRoot = fs.realpathSync(opts.repoRoot || getRepoRoot());
  const paths = projectPaths(repoRoot, opts.project);
  const authority = ensureProjectAuthorityPaths(paths);
  if (!authority.ok) return schema.refuse(authority.reason, { detail: authority.detail });
  let transaction = null;
  try { transaction = readAuthorityJsonOrNull(paths.transactionPath); }
  catch (_) { transaction = {}; }
  let state = '';
  try { if (entryExists(paths.statePath)) state = readAuthorityText(paths.statePath); }
  catch (_) { return schema.refuse('replan_authority_path_invalid'); }
  const fence = schema.readReplanFence(state, transaction);
  return Object.assign({ result: fence.ok ? 'status' : 'refuse' }, fence);
}

function parseArgs(argv) {
  const out = { json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') out.json = true;
    else if (arg === '--project') out.project = argv[++index];
    else if (arg === '--source-attempt') out.sourceAttemptId = argv[++index];
    else if (arg === '--reason') out.transitionReason = argv[++index];
    else if (arg === '--user-turn-reference') out.userTurnReference = argv[++index];
    else if (arg === '--consent-reason') out.consentReason = argv[++index];
    else throw new Error('unknown_arg:' + arg);
  }
  return out;
}

function main() {
  const subcommand = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (!args.project) throw new Error('--project required');
  let result;
  if (subcommand === 'prepare') {
    result = prepareReplan({ project: args.project, sourceAttemptId: args.sourceAttemptId,
      transitionReason: args.transitionReason || 'review_repair_requires_replan' });
  } else if (subcommand === 'resume') {
    result = resumeReplan({ project: args.project });
  } else if (subcommand === 'status') {
    result = readStatus({ project: args.project });
  } else if (subcommand === 'extend-consent') {
    result = appendConsentExtension({ project: args.project, userTurnReference: args.userTurnReference,
      reason: args.consentReason });
  } else if (subcommand === 'verify-snapshots') {
    const root = getRepoRoot();
    result = verifyAllEpochSnapshots(path.join(root, 'kaola-workflow', args.project));
  } else {
    throw new Error('unknown_subcommand:' + subcommand);
  }
  schema.emit(result);
  if (result && result.result === 'refuse') process.exitCode = 1;
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    schema.emit(schema.refuse('replan_internal_error', { detail: error.message }));
    process.exitCode = 1;
  }
}

module.exports = {
  parseStateFields,
  verifyClaimRootBase,
  deriveLegacyClaimRoot,
  computeReviewCandidateDigest,
  deriveCandidateObservation,
  evaluateTransitionBudget,
  verifyCaseBProof,
  prepareReplan,
  resumeReplan,
  appendConsentExtension,
  verifyConsentLedger,
  verifySnapshotManifest,
  verifyAllEpochSnapshots,
  readStatus,
  validateChildPlan,
  validateChildHandoffAuthority,
  buildPlannerPacket,
  buildSnapshotAuthorityProjection,
  verifyActivePlanningEvidence,
  verifyCurrentEpochAuthority,
};
