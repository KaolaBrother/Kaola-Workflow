#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const runner = require('./kaola-workflow-validation-runner.js');

const HEX = /^[0-9a-f]{64}$/;

function mutate(value, patch) {
  return Object.assign({}, value, patch);
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function semanticRun(overrides) {
  return Object.assign({
    index: 1,
    exit_code: 0,
    signal: null,
    timed_out: false,
    stdout_sha256: runner.sha256(''),
    stderr_sha256: runner.sha256(''),
    failure_signature_sha256: runner.sha256(runner.canonicalJson({ stdout: '', stderr: '' })),
    pre_candidate_digest: 'a'.repeat(64),
    post_candidate_digest: 'a'.repeat(64),
    execution_identity_digest: 'b'.repeat(64),
  }, overrides || {});
}

async function main() {
  // Canonical JSON is recursively key-sorted and is the only semantic-addressing encoding.
  assert.strictEqual(
    runner.canonicalJson({ z: 1, a: { y: 2, x: [3, { b: 2, a: 1 }] } }),
    '{"a":{"x":[3,{"a":1,"b":2}],"y":2},"z":1}'
  );
  assert.throws(() => runner.canonicalJson({ bad: undefined }), /unsupported canonical value/);

  const policy = runner.normalizePolicy({
    command: 'node --version && npm --version',
    cwd: 'packages/app',
    repetitions: 3,
    pass_rule: 'all',
    timeout_minutes: 5,
    env_allowlist: ['TOKEN_B', 'TOKEN_A', 'TOKEN_A'],
  });
  assert.deepStrictEqual(policy.env_allowlist, ['TOKEN_A', 'TOKEN_B']);
  assert.strictEqual(policy.cwd, 'packages/app');
  assert.throws(() => runner.normalizePolicy({ command: 'true', cwd: '../escape', timeout_minutes: 1 }), /cwd/);
  assert.throws(() => runner.normalizePolicy({ command: 'true', repetitions: 6, timeout_minutes: 1 }), /repetitions/);
  assert.throws(() => runner.normalizePolicy({ command: 'true', pass_rule: 'any', timeout_minutes: 1 }), /pass_rule/);
  assert.throws(() => runner.normalizePolicy({ command: 'true', timeout_minutes: 0 }), /timeout_minutes/);
  assert.throws(() => runner.normalizePolicy({ command: 'true', timeout_minutes: 1, env_allowlist: ['BAD-NAME'] }), /environment key/);

  // The child environment starts empty. Platform minima and deterministic sandbox values are explicit;
  // only frozen allowlisted values cross the boundary. Durable identity contains hashes, never raw values.
  const secret = 'never-persist-this-raw-secret';
  const scrubbed = runner.buildScrubbedEnvironment({
    source_env: { PATH: '/fixture/bin', ALLOWED: secret, UNLISTED: 'must-not-leak' },
    allowlist: ['ALLOWED'],
    platform: 'linux',
    isolated_home: '/isolated/home',
    isolated_tmp: '/isolated/tmp',
  });
  assert.deepStrictEqual(Object.keys(scrubbed).sort(), ['ALLOWED', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'TZ']);
  assert.strictEqual(scrubbed.ALLOWED, secret);
  assert.ok(!Object.prototype.hasOwnProperty.call(scrubbed, 'UNLISTED'));
  const envIdentity = runner.digestEnvironment(scrubbed);
  assert.ok(envIdentity.every(row => HEX.test(row.value_sha256)));
  assert.ok(!JSON.stringify(envIdentity).includes(secret));

  // The closed shell-head parser supports ordinary fixed pipelines/sequences and rejects dynamic heads.
  assert.deepStrictEqual(runner.parseSimpleCommandHeads('node test.js && npm run focused | tee out.log'), ['node', 'npm', 'tee']);
  assert.throws(() => runner.parseSimpleCommandHeads('$(printf node) test.js'), /dynamic|unsupported/);
  assert.throws(() => runner.parseSimpleCommandHeads('TOOL=node $TOOL test.js'), /dynamic|assignment|unsupported/);
  assert.throws(() => runner.parseSimpleCommandHeads('node `printf test.js`'), /dynamic|unsupported/);

  const identityBase = {
    policy,
    effective_environment: envIdentity,
    runner_node: { realpath_sha256: '1'.repeat(64), mode: 0o100755, version_output_sha256: '2'.repeat(64) },
    execution_shell: { realpath_sha256: '3'.repeat(64), mode: 0o100755, version_output_sha256: '4'.repeat(64) },
    executables: [{ command_head: 'node', realpath_sha256: '5'.repeat(64), mode: 0o100755, version_output_sha256: '6'.repeat(64) }],
    toolchains: [{ path: 'package-lock.json', mode: 0o100644, content_sha256: '7'.repeat(64) }],
  };
  const baseCommandId = runner.computeCommandId(identityBase);
  assert.match(baseCommandId, HEX);
  const identityMutations = [
    mutate(identityBase, { policy: mutate(policy, { command: 'node --help' }) }),
    mutate(identityBase, { policy: mutate(policy, { cwd: 'packages/other' }) }),
    mutate(identityBase, { policy: mutate(policy, { repetitions: 2 }) }),
    mutate(identityBase, { policy: mutate(policy, { timeout_minutes: 6 }) }),
    mutate(identityBase, { effective_environment: runner.digestEnvironment(mutate(scrubbed, { ALLOWED: 'changed' })) }),
    mutate(identityBase, { execution_shell: mutate(identityBase.execution_shell, { realpath_sha256: '8'.repeat(64) }) }),
    mutate(identityBase, { executables: [mutate(identityBase.executables[0], { version_output_sha256: '9'.repeat(64) })] }),
    mutate(identityBase, { toolchains: [mutate(identityBase.toolchains[0], { content_sha256: '0'.repeat(64) })] }),
  ];
  for (const changed of identityMutations) assert.notStrictEqual(runner.computeCommandId(changed), baseCommandId);

  // Failure signatures preserve stream and within-stream ordering but remove ANSI/local absolute paths.
  const sigA = runner.normalizeFailureSignature('\u001b[31mFAIL\u001b[0m /Users/alice/repo/a.js:2\nsecond\n', 'detail\n', {
    absolute_paths: ['/Users/alice/repo'],
  });
  const sigB = runner.normalizeFailureSignature('second\nFAIL /Users/bob/repo/a.js:2\n', 'detail\n', {
    absolute_paths: ['/Users/bob/repo'],
  });
  assert.ok(!sigA.normalized.includes('/Users/alice/repo'));
  assert.notStrictEqual(sigA.digest, sigB.digest, 'output order must participate in the normalized signature');
  assert.notStrictEqual(
    runner.normalizeFailureSignature('stdout', 'stderr').digest,
    runner.normalizeFailureSignature('stderr', 'stdout').digest,
    'stdout/stderr channel order must participate in the signature'
  );

  // Exact deterministic reducer: all-zero => pass; stable same-signature nonzero => fail; every
  // mixed, timeout, signal, mutation, or incomparable case => inconclusive (never pass).
  const candidate = 'a'.repeat(64);
  const comparable = { comparable: true, digest: 'b'.repeat(64) };
  assert.strictEqual(runner.reduceRuns([semanticRun(), semanticRun({ index: 2 })], candidate, comparable).outcome, 'pass');
  const failed = semanticRun({ exit_code: 1, failure_signature_sha256: 'c'.repeat(64) });
  assert.strictEqual(runner.reduceRuns([failed, mutate(failed, { index: 2 })], candidate, comparable).outcome, 'fail');
  const inconclusiveCases = [
    [semanticRun(), mutate(failed, { index: 2 })],
    [failed, mutate(failed, { index: 2, failure_signature_sha256: 'd'.repeat(64) })],
    [semanticRun({ timed_out: true, exit_code: null })],
    [semanticRun({ signal: 'SIGTERM', exit_code: null })],
    [semanticRun({ post_candidate_digest: 'e'.repeat(64) })],
  ];
  for (const runs of inconclusiveCases) assert.strictEqual(runner.reduceRuns(runs, candidate, comparable).outcome, 'inconclusive');
  assert.strictEqual(runner.reduceRuns([semanticRun()], candidate, { comparable: false, digest: null }).outcome, 'inconclusive');

  // Audit timestamps/durations do not affect vector_id, while every semantic result does.
  const vectorInput = {
    command_id: baseCommandId,
    candidate_digest: candidate,
    execution_identity: comparable,
    runs: [semanticRun()],
  };
  const vectorA = runner.buildValidationVector(vectorInput, [{ started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:01.000Z', duration_ms: 1000 }]);
  const vectorB = runner.buildValidationVector(vectorInput, [{ started_at: '2030-02-02T00:00:00.000Z', ended_at: '2030-02-02T00:00:09.000Z', duration_ms: 9000 }]);
  assert.strictEqual(vectorA.vector_id, vectorB.vector_id);
  assert.notStrictEqual(vectorA.receipt_sha256, vectorB.receipt_sha256);
  assert.strictEqual(runner.computeReceiptSha256(vectorA), vectorA.receipt_sha256,
    'receipt_sha256 must bind every durable field other than its self-hash slot');
  const vectorChanged = runner.buildValidationVector(mutate(vectorInput, { runs: [semanticRun({ stdout_sha256: 'f'.repeat(64) })] }), []);
  assert.notStrictEqual(vectorChanged.vector_id, vectorA.vector_id);

  // Real landable-tree identity ignores active workflow state and inert docs, but retains source,
  // tests, and the D-547 test-consumed prose band. The helper is exported for the review engine.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-tree-'));
  try {
    git(repo, ['init', '-q']);
    write(repo, 'src/index.js', 'module.exports = 1;\n');
    write(repo, 'docs/inert.md', 'inert one\n');
    write(repo, 'README.md', 'consumed one\n');
    write(repo, 'kaola-workflow/active/.cache/evidence.md', 'state one\n');
    const treeA = runner.computeLandableTreeDigest(repo);
    assert.match(treeA, HEX);
    write(repo, 'docs/inert.md', 'inert two\n');
    write(repo, 'kaola-workflow/active/.cache/evidence.md', 'state two\n');
    assert.strictEqual(runner.computeLandableTreeDigest(repo), treeA);
    write(repo, 'src/index.js', 'module.exports = 2;\n');
    const treeB = runner.computeLandableTreeDigest(repo);
    assert.notStrictEqual(treeB, treeA);
    write(repo, 'README.md', 'consumed two\n');
    const treeC = runner.computeLandableTreeDigest(repo);
    assert.notStrictEqual(treeC, treeB);
    const widenedA = runner.computeLandableTreeDigest(repo, { test_consumed_paths: ['docs/inert.md'] });
    write(repo, 'docs/inert.md', 'inert three\n');
    assert.notStrictEqual(runner.computeLandableTreeDigest(repo, { test_consumed_paths: ['docs/inert.md'] }), widenedA);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // End-to-end execution is adapter-driven for deterministic tests. The runner takes candidate
  // digests before/after every repetition, and never persists a raw allowlisted value.
  function adaptersFor(results, digests, auditBase) {
    let digestIndex = 0;
    let nowIndex = 0;
    const times = auditBase || [0, 10, 20, 30, 40, 50];
    return {
      collect_execution_identity: () => ({ comparable: true, digest: 'b'.repeat(64), command_identity: identityBase }),
      compute_candidate_digest: () => digests[digestIndex++],
      execute: ({ index }) => results[index - 1],
      now: () => times[nowIndex++],
      to_iso: ms => new Date(ms).toISOString(),
    };
  }
  const runOptions = {
    repo_root: '/fixture/repo',
    policy: mutate(policy, { cwd: '.', repetitions: 2, timeout_minutes: 1 }),
    source_env: { PATH: '/fixture/bin', TOKEN_A: secret, OTHER_SECRET: 'nope' },
    isolated_home: '/fixture/home',
    isolated_tmp: '/fixture/tmp',
  };
  const passResults = [
    { exit_code: 0, signal: null, timed_out: false, stdout: 'ok one\n', stderr: '' },
    { exit_code: 0, signal: null, timed_out: false, stdout: 'ok two\n', stderr: '' },
  ];
  const passReceipt = await runner.runValidation(runOptions, adaptersFor(passResults, [candidate, candidate, candidate, candidate, candidate]));
  assert.strictEqual(passReceipt.outcome, 'pass');
  assert.match(passReceipt.command_id, HEX);
  assert.match(passReceipt.vector_id, HEX);
  assert.strictEqual(runner.computeReceiptSha256(passReceipt), passReceipt.receipt_sha256,
    'the full execution receipt, including command identity and audit timestamps, must be content-addressed');
  assert.ok(!JSON.stringify(passReceipt).includes(secret));

  const mutatedReceipt = await runner.runValidation(runOptions, adaptersFor(passResults, [candidate, candidate, candidate, 'e'.repeat(64), 'e'.repeat(64)]));
  assert.strictEqual(mutatedReceipt.outcome, 'inconclusive');

  // Opt-in local qualification records expected/reported identities and invariant-class outcomes.
  // Different natural-language prose is intentionally ignored (only output digests are retained).
  const qualificationOptions = {
    contract_hash: '1'.repeat(64),
    context_hash: '2'.repeat(64),
    profile_hashes: { claude: '3'.repeat(64), codex: '4'.repeat(64) },
    invariant_classes: ['binding', 'fail_closed_reduction'],
  };
  const claudeInvocation = runner.qualificationInvocation('claude', 'probe');
  assert.strictEqual(claudeInvocation.executable, 'claude');
  assert.ok(claudeInvocation.args.includes('--no-session-persistence') && claudeInvocation.args.includes('--tools'),
    'the local Claude probe must be non-persistent and tool-disabled');
  const codexInvocation = runner.qualificationInvocation('codex', 'probe');
  assert.strictEqual(codexInvocation.executable, 'codex');
  assert.ok(codexInvocation.args.includes('--ephemeral') && codexInvocation.args.includes('read-only'),
    'the local Codex probe must be ephemeral and read-only');
  const qualification = await runner.qualifyLocalReviewers(qualificationOptions, {
    claude: async payload => ({
      exit_code: 0, signal: null, timed_out: false, stdout: 'Claude natural-language finding A', stderr: '',
      report: {
        contract_hash: payload.contract_hash,
        context_hash: payload.context_hash,
        profile_hash: payload.profile_hash,
        invariant_classes: { binding: 'pass', fail_closed_reduction: 'pass' },
      },
    }),
    codex: async payload => ({
      exit_code: 0, signal: null, timed_out: false, stdout: 'Codex entirely different finding B', stderr: '',
      report: {
        contract_hash: payload.contract_hash,
        context_hash: payload.context_hash,
        profile_hash: payload.profile_hash,
        invariant_classes: { binding: 'pass', fail_closed_reduction: 'pass' },
      },
    }),
  });
  assert.strictEqual(qualification.outcome, 'pass');
  assert.deepStrictEqual(qualification.runtimes.map(r => r.runtime), ['claude', 'codex']);
  assert.ok(!JSON.stringify(qualification).includes('natural-language'));
  assert.ok(!JSON.stringify(qualification).includes('entirely different'));
  const qualifiedWithChangedProse = await runner.qualifyLocalReviewers(qualificationOptions, {
    claude: async payload => ({
      exit_code: 0, stdout: 'changed prose', stderr: '',
      report: { contract_hash: payload.contract_hash, context_hash: payload.context_hash, profile_hash: payload.profile_hash, invariant_classes: { binding: 'pass', fail_closed_reduction: 'pass' } },
    }),
    codex: async payload => ({
      exit_code: 0, stdout: 'more changed prose', stderr: '',
      report: { contract_hash: payload.contract_hash, context_hash: payload.context_hash, profile_hash: payload.profile_hash, invariant_classes: { binding: 'pass', fail_closed_reduction: 'pass' } },
    }),
  });
  assert.strictEqual(qualifiedWithChangedProse.outcome, 'pass');
  assert.notStrictEqual(qualifiedWithChangedProse.qualification_id, qualification.qualification_id, 'output identity is recorded without asserting prose equality');
  const failedQualification = await runner.qualifyLocalReviewers(qualificationOptions, {
    claude: async payload => ({
      exit_code: 0, stdout: '', stderr: '',
      report: { contract_hash: payload.contract_hash, context_hash: payload.context_hash, profile_hash: payload.profile_hash, invariant_classes: { binding: 'fail', fail_closed_reduction: 'pass' } },
    }),
    codex: async () => ({ exit_code: null, timed_out: true, stdout: '', stderr: '', report: null }),
  });
  assert.strictEqual(failedQualification.outcome, 'fail',
    'a machine-reported invariant failure dominates another runtime being inconclusive');

  console.log('test-validation-runner: PASSED');
}

main().catch(error => {
  process.stderr.write((error && error.stack) ? error.stack + '\n' : String(error) + '\n');
  process.exit(1);
});
