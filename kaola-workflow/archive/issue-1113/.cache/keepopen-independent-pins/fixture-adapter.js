'use strict';

// Source-independent positive control for the proposed test-only adapter boundary.
// It models normalized receipts and spy calls; it does not invoke Kaola-Workflow production code.

const crypto = require('crypto');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function identityFixture(input) {
  const identity = clone(input.identity);
  return { before: clone(identity), after: clone(identity) };
}

function custodyFixture(input) {
  const manifest = clone(input.identity.evidenceManifest);
  return {
    ledgerBefore: input.identity.ledgerSha256,
    ledgerAfter: input.identity.ledgerSha256,
    artifactsBefore: clone(manifest),
    artifactsAfter: clone(manifest),
    mainHeadBefore: 'fixture-main-head:before',
    mainHeadAfter: 'fixture-main-head:before',
    mainIndexBefore: 'fixture-main-index:before',
    mainIndexAfter: 'fixture-main-index:before',
  };
}

function makeBase(input) {
  const ids = identityFixture(input);
  return {
    identityBefore: ids.before,
    identityAfter: ids.after,
    custody: custodyFixture(input),
    issueAction: input.issueAction,
    routeMode: input.routeMode,
    runCwd: input.runCwd,
    archiveRoot: input.identity.mainRoot,
    operations: [],
    pr: {
      state: 'OPEN',
      base: input.expectedBase,
      head: input.identity.branch,
      title: 'Research artifact for issue #143',
      body: 'Research context for #143; request publication only.',
      commitMessages: ['docs: attach artifact for issue #143'],
      issueMentions: [143],
      closingLinks: [],
    },
    request: {
      result: 'created',
      number: 206,
      url: 'https://github.com/KaolaBrother/VRPCadCore/pull/206',
      mainline: 'pending',
    },
    issueObservation: 'OPEN',
    receipt: {
      keepOpenRequested: input.issueAction === 'comment_keep_open',
      identity: clone(input.identity),
      issueDisposition: 'kept_open',
      requestPublication: 'created',
      mainlinePublication: 'pending',
    },
    outcome: 'success',
  };
}

function refused(input, why) {
  const result = makeBase(input);
  result.outcome = 'refused';
  result.refusal = why;
  result.operations = [{ name: 'preflight.read', target: input.identity.mainRoot }];
  result.request.result = 'none';
  result.request.number = null;
  result.request.url = null;
  result.receipt.issueDisposition = 'unknown';
  return result;
}

function applyMutant(input, result) {
  const mutant = process.env.KW1113_MUTANT;
  if (!mutant) return result;
  if (mutant === 'close-body' && input.name === 'live-create') result.pr.body = 'Closes #143';
  if (mutant === 'qualified-commit-close' && input.name === 'archive-create') {
    result.pr.commitMessages = ['docs: Resolved KaolaBrother/VRPCadCore#143'];
  }
  if (mutant === 'auto-merge' && input.name === 'live-create') {
    result.operations.push({ name: 'pr.merge', argv: 'gh pr merge --auto --squash' });
  }
  if (mutant === 'queue' && input.name === 'live-create') result.operations.push({ name: 'merge_queue' });
  if (mutant === 'identity-loss' && input.name === 'live-create') result.identityAfter.repository = 'https://github.com/other/repo.git';
  if (mutant === 'ledger-mutation' && input.name === 'live-create') result.custody.ledgerAfter = '0'.repeat(64);
  if (mutant === 'artifact-drop' && input.name === 'archive-create') result.custody.artifactsAfter.pop();
  if (mutant === 'wrong-base' && input.name === 'live-create') result.pr.base = 'wrong-base';
  if (mutant === 'wrong-head' && input.name === 'live-create') result.pr.head = 'workflow/wrong';
  if (mutant === 'duplicate-pr' && input.name === 'retry-create') {
    result.retry.createCount = 2;
    result.retry.urls[1] = 'https://github.com/KaolaBrother/VRPCadCore/pull/207';
  }
  if (mutant === 'index-mutation' && input.name === 'retry-push') result.custody.mainIndexAfter = 'fixture-main-index:changed';
  if (mutant === 'unknown-as-open' && input.name === 'live-watch-unknown') result.receipt.issueDisposition = 'kept_open';
  if (mutant === 'closed-as-kept-open' && input.name === 'archive-watch-closed') result.receipt.issueDisposition = 'kept_open';
  if (mutant === 'auto-reopen' && input.name === 'archive-watch-closed') result.operations.push({ name: 'issue.reopen' });
  if (mutant === 'unrelated-scope' && input.name === 'unrelated-watch-scope') result.watch.touchedProjects.push('issue-142');
  if (mutant === 'refusal-effect' && input.name === 'unsupported-bundle') result.operations.push({ name: 'pr.create' });
  if (mutant === 'merged-republish' && input.name === 'merged-open-not-republished') result.operations.push({ name: 'pr.create' });
  if (mutant === 'accept-missing-action' && input.name === 'missing-action') {
    result.outcome = 'success';
    result.operations.push({ name: 'pr.create' });
  }
  if (mutant === 'main-head-mutation' && input.name === 'retry-archive') result.custody.mainHeadAfter = 'fixture-main-head:changed';
  return result;
}

async function run(input) {
  const name = input.name;
  const result = makeBase(input);

  if (name === 'legacy-default-close') {
    result.pr.body = 'Closes #143';
    result.pr.closingLinks = [143];
    result.receipt.issueDisposition = 'closed';
    result.operations = [
      { name: 'pr.list' }, { name: 'pr.create' }, { name: 'request.record' }, { name: 'archive.push' },
    ];
    return applyMutant(input, result);
  }

  const invalidNames = new Set([
    'legacy-keep-open-refusal', 'missing-action', 'malformed-action', 'conflicting-action',
    'missing-repository', 'malformed-repository', 'repository-mismatch',
    'missing-digest', 'malformed-digest', 'digest-mismatch',
    'missing-member', 'malformed-member', 'member-mismatch', 'unsupported-bundle', 'mixed-disposition',
    'missing-branch', 'malformed-branch', 'branch-mismatch', 'unsupported-forge', 'wrong-base-existing-pr',
    'wrong-head-existing-pr', 'closed-unmerged-existing-pr',
  ]);
  if (invalidNames.has(name)) {
    const refusedResult = refused(input, name);
    if (name.startsWith('wrong-') || name === 'closed-unmerged-existing-pr') {
      refusedResult.operations.push({ name: 'pr.view' });
    }
    return applyMutant(input, refusedResult);
  }

  if (name === 'live-create' || name === 'archive-create' || name === 'open-probe-failure') {
    result.operations = [
      { name: input.sourceLocation === 'live' ? 'archive' : 'archive.resume', target: input.identity.mainRoot },
      { name: 'pr.list' }, { name: 'pr.create' }, { name: 'request.record', target: input.identity.mainRoot },
      { name: 'archive.push', target: input.identity.branch },
    ];
    if (name === 'open-probe-failure') {
      result.outcome = 'unknown';
      result.issueObservation = 'UNKNOWN';
      result.receipt.issueDisposition = 'unknown';
    }
    return applyMutant(input, result);
  }

  if (name === 'live-open-reuse' || name === 'archive-open-reuse') {
    result.request.result = 'reused';
    result.receipt.requestPublication = 'reused';
    result.operations = [
      { name: input.sourceLocation === 'live' ? 'archive' : 'archive.resume', target: input.identity.mainRoot },
      { name: 'pr.list' }, { name: 'pr.view' }, { name: 'request.record', target: input.identity.mainRoot },
      { name: 'archive.push', target: input.identity.branch },
    ];
    return applyMutant(input, result);
  }

  if (name.startsWith('merged-')) {
    result.pr.state = 'MERGED';
    result.request.result = 'reused';
    result.request.mainline = 'published';
    result.receipt.requestPublication = 'reused';
    result.receipt.mainlinePublication = 'published';
    result.operations = [
      { name: 'pr.view' }, { name: 'archive.default-branch-verify', target: input.identity.mainRoot },
      { name: 'issue.view', target: '143' },
    ];
    if (name === 'merged-closed-violation') {
      result.issueObservation = 'CLOSED';
      result.receipt.issueDisposition = 'violation';
    } else if (name === 'merged-probe-unknown') {
      result.issueObservation = 'UNKNOWN';
      result.receipt.issueDisposition = 'unknown';
    }
    return applyMutant(input, result);
  }

  if (name.startsWith('retry-')) {
    const boundary = name.slice('retry-'.length);
    result.request.result = boundary === 'create' || boundary === 'record' || boundary === 'push' ? 'reused' : 'created';
    result.receipt.requestPublication = result.request.result;
    result.operations = [
      { name: 'archive', target: input.identity.mainRoot }, { name: 'pr.list' },
      { name: boundary === 'create' ? 'pr.create' : 'pr.view' }, { name: 'request.record', target: input.identity.mainRoot },
      { name: 'archive.push', target: input.identity.branch },
    ];
    result.retry = {
      boundary,
      attempts: 2,
      firstAttemptBoundary: boundary,
      recoveryRequest: 'https://github.com/KaolaBrother/VRPCadCore/pull/206',
      createCount: 1,
      firstAttemptOperations: boundary === 'archive'
        ? ['archive']
        : boundary === 'create'
          ? ['archive', 'pr.list', 'pr.create']
          : boundary === 'record'
            ? ['archive', 'pr.list', 'pr.create', 'request.record']
            : ['archive', 'pr.list', 'pr.create', 'request.record', 'archive.push'],
      recoveryOperations: boundary === 'archive'
        ? ['archive', 'pr.list', 'pr.create', 'request.record', 'archive.push']
        : ['archive.resume', 'pr.list', 'pr.view', 'request.record', 'archive.push'],
      urls: [
        'https://github.com/KaolaBrother/VRPCadCore/pull/206',
        'https://github.com/KaolaBrother/VRPCadCore/pull/206',
      ],
    };
    return applyMutant(input, result);
  }

  if (name.includes('-watch-') || name === 'unrelated-watch-scope') {
    const state = name.endsWith('-open') ? 'OPEN' : name.endsWith('-closed') ? 'CLOSED' : 'UNKNOWN';
    result.outcome = 'observed';
    result.issueObservation = state;
    result.receipt.issueDisposition = state === 'OPEN' ? 'kept_open' : state === 'CLOSED' ? 'violation' : 'unknown';
    result.operations = [
      { name: 'pr.view', target: input.identity.project }, { name: 'issue.view', target: '143' },
    ];
    result.watch = { lane: input.sourceLocation, touchedProjects: ['issue-143'], unrelatedProjectUnchanged: true };
    return applyMutant(input, result);
  }

  throw new Error('fixture adapter has no case for ' + name + ' (fixture sha256 ' + fileHash(name) + ')');
}

module.exports = { run };
