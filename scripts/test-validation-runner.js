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
  // #709: the self-host consumed band (README/CHANGELOG/docs.api) applies ONLY to self-host repos
  // (package.json declares a test:kaola-workflow:* script). Seed a package.json so this repo reads
  // as self-host and the README-change assertion below holds (a consumer repo's README is invisible).
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-tree-'));
  try {
    git(repo, ['init', '-q']);
    write(repo, 'package.json', JSON.stringify({
      name: 'self-host-fixture', scripts: { 'test:kaola-workflow:claude': 'node scripts/simulate-workflow-walkthrough.js' },
    }) + '\n');
    git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'init']);
    write(repo, 'src/index.js', 'module.exports = 1;\n');
    write(repo, 'docs/inert.md', 'inert one\n');
    write(repo, 'README.md', 'consumed one\n');
    write(repo, 'kaola-workflow/active/.cache/evidence.md', 'state one\n');
    // warm the detectSelfHostNpm cache (self-host: package.json has the chain script)
    assert.strictEqual(runner.detectSelfHostNpm(repo), true, '#709: fixture repo with test:kaola-workflow:* is self-host');
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

  // #709: in a CONSUMER repo (no package.json / no test:kaola-workflow:* chain), CHANGELOG/README/
  // docs are validation-invisible (matching isBookkeepingPath). A finalize-sink CHANGELOG edit
  // must NOT change computeLandableTreeDigest — the self-host assumption stops leaking into consumer
  // repos.
  const consumerRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-consumer-'));
  try {
    git(consumerRepo, ['init', '-q']);
    write(consumerRepo, 'src/app.swift', 'let x = 1\n');
    write(consumerRepo, 'CHANGELOG.md', '# v1.0\n- init\n');
    write(consumerRepo, 'README.md', '# consumer app\n');
    write(consumerRepo, 'docs/design.md', 'design notes\n');
    git(consumerRepo, ['add', '-A']); git(consumerRepo, ['commit', '-q', '-m', 'init']);
    assert.strictEqual(runner.detectSelfHostNpm(consumerRepo), false,
      '#709: a consumer repo (no package.json) is NOT self-host');
    assert.strictEqual(runner.isValidationInvisible('CHANGELOG.md', [], { self_host: false }), true,
      '#709: validation-runner treats CHANGELOG as invisible in a consumer repo');
    const digestBefore = runner.computeLandableTreeDigest(consumerRepo);
    assert.match(digestBefore, HEX, '#709: consumer digest computes');
    // A finalize-sink CHANGELOG edit + README edit + docs edit — all validation-invisible in consumer
    write(consumerRepo, 'CHANGELOG.md', '# v1.1\n- finalize-sink edit\n');
    write(consumerRepo, 'README.md', '# consumer app (updated)\n');
    write(consumerRepo, 'docs/design.md', 'design notes (updated)\n');
    const digestAfter = runner.computeLandableTreeDigest(consumerRepo);
    assert.strictEqual(digestAfter, digestBefore,
      '#709: a finalize-sink CHANGELOG/README/docs edit does NOT change computeLandableTreeDigest in a consumer repo');
    // A code edit DOES change the digest (the band still catches real code)
    write(consumerRepo, 'src/app.swift', 'let x = 2\n');
    const digestAfterCode = runner.computeLandableTreeDigest(consumerRepo);
    assert.notStrictEqual(digestAfterCode, digestAfter,
      '#709: a code edit DOES change the digest in a consumer repo (the band still catches real code)');
  } finally {
    fs.rmSync(consumerRepo, { recursive: true, force: true });
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

  // ── #900: the consumer arm's final-validation RECORDER ─────────────────────────────────────────
  //
  // A consumer repo (no `test:kaola-workflow:*` chains) owns its own verification, and the finalize
  // gate reads that ownership out of a column-0 `verdict: pass` AND a column-0
  // `validated_candidate_hash` equal to a freshly recomputed code-tree hash. The verdict was always
  // writable by hand; the hash was not — no shipped command printed it — so an agent following the
  // recorded recipe verbatim earned `final_validation_unbound` on a run whose tests all passed.
  // `record` is that missing producer. What it must not get wrong is the FUNCTION (the gate's shared
  // computeCodeTreeHash, never this module's own computeLandableTreeDigest, which is a different
  // algorithm over the same band) and the TREE (the checkout the shell is in, which diverges from
  // main across exactly the pre-merge window a finalize happens in).
  //
  // Pinned here: the verb's own contract — the pure merge policy, column zero, and the CLI's
  // three-way exit code. The end-to-end producer==gate agreement, and the negative controls that
  // prove the fixture can tell a right hash from a lucky one, live in test-finalize-door.js T8
  // beside T7's self-host twin, because that is where the GATE is the reader.
  const runnerScript = path.join(__dirname, 'kaola-workflow-validation-runner.js');
  assert.strictEqual(typeof runner.recordFinalValidation, 'function',
    '#900: the record verb ships as a callable, not only as a CLI branch');
  assert.strictEqual(runner.FINAL_VALIDATION_FILE, 'final-validation.md',
    '#900: the recorder writes the file the gate reads');
  assert.deepStrictEqual(runner.RECORD_FIELDS.slice(), ['verdict', 'validation_command', 'validated_candidate_hash'],
    '#900: the verb owns exactly three field lines — the two the gate parses plus the command that produced them');
  // `Object.isFrozen(undefined)` is `true`, so the Array.isArray guard is load-bearing: without it
  // this assertion passes on a module that exports no such constant at all.
  assert.ok(Array.isArray(runner.RECORD_FIELDS) && Object.isFrozen(runner.RECORD_FIELDS),
    '#900: the owned-field list is one frozen reference, so the renderer and the ownership rule cannot drift apart');

  // renderFinalValidationRecord is PURE, and the merge policy is its whole content: every owned line
  // is dropped WHEREVER it sat and one fresh block is appended. The gate is last-match-wins and
  // fence-blind, so a superseded binding surviving BELOW the new one would win — dropping it is not
  // tidiness, it is the correctness property.
  const FIELDS_900 = {
    verdict: 'pass',
    validation_command: 'make test',
    validated_candidate_hash: 'a'.repeat(64),
  };
  const bare900 = runner.renderFinalValidationRecord('', FIELDS_900);
  for (const name of runner.RECORD_FIELDS) {
    const at = bare900.indexOf(name + ': ');
    assert.ok(at === 0 || (at > 0 && bare900[at - 1] === '\n'),
      '#900: `' + name + '` must be written at COLUMN ZERO — the gate\'s parser is `^`-anchored, so an '
      + 'indented field is silently no binding at all; got ' + JSON.stringify(bare900));
    assert.strictEqual((bare900.match(new RegExp('^' + name + ':', 'gm')) || []).length, 1,
      '#900: exactly one column-0 `' + name + '` line — a second one is a second answer; got ' + JSON.stringify(bare900));
  }
  assert.strictEqual(bare900, runner.renderFinalValidationRecord(bare900, FIELDS_900),
    '#900: re-recording the same result is BYTE-IDEMPOTENT — the file does not grow');

  // Agent prose survives byte-for-byte, and a stale binding does NOT — including one inside a code
  // fence, which the fence-blind gate already reads as live.
  const prose900 = [
    '# Final Validation', '',
    '## Command', '```', 'validation_command: superseded fenced command', '```', '',
    'verdict: fail',
    'validated_candidate_hash: ' + '0'.repeat(64), '',
    '## Notes', 'Agent evidence that must survive the merge.', ''
  ].join('\n');
  const merged900 = runner.renderFinalValidationRecord(prose900, FIELDS_900);
  assert.ok(merged900.includes('# Final Validation') && merged900.includes('## Notes')
    && merged900.includes('Agent evidence that must survive the merge.'),
    '#900: the verb MERGES — the agent\'s own evidence is not clobbered; got ' + JSON.stringify(merged900));
  assert.strictEqual((merged900.match(/^validated_candidate_hash:/gm) || []).length, 1,
    '#900: a pre-existing binding is REPLACED, not appended past; got ' + JSON.stringify(merged900));
  assert.ok(!merged900.includes('0'.repeat(64)),
    '#900: the superseded hash must be GONE, not left in the file — the gate is last-match-wins, so a '
    + 'survivor sitting after the new block would win; got ' + JSON.stringify(merged900));
  assert.ok(!/^verdict: fail$/m.test(merged900),
    '#900: a superseded verdict must not survive either; got ' + JSON.stringify(merged900));
  assert.ok(!merged900.includes('superseded fenced command'),
    '#900: a column-0 owned line INSIDE a fence is already a live binding to the fence-blind gate, so '
    + 'the verb owns it too; got ' + JSON.stringify(merged900));
  assert.strictEqual(merged900, runner.renderFinalValidationRecord(merged900, FIELDS_900),
    '#900: idempotent over pre-existing prose too, not only over a bare record');

  // The CLI. Exit 0 means THE RECORD WAS WRITTEN — never that validation passed — so the three codes
  // are contract and are read at the process boundary, where they exist.
  //
  // KAOLA_WORKFLOW_OFFLINE is set EXPLICITLY rather than inherited: a fixture that silently inherits
  // whatever the parent had is a fixture whose environment nobody chose, and the same inheritance is
  // how a guard under test gets switched off without anyone noticing.
  function runRecord900(cwd, args) {
    // spawn-class: cli-contract
    const r = spawnSync(process.execPath, [runnerScript, 'record', ...args], {
      cwd, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0' }),
    });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }

  // Built from scratch, NOT from this suite's other fixture seeders: the failure this verb exists to
  // fix is invisible in a fixture that was handed an already-correct hash.
  const recRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-record-')));
  const outsideGit = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-record-nogit-')));
  try {
    git(recRepo, ['init', '-q', '-b', 'main']);
    git(recRepo, ['config', 'user.email', 't@t.com']);
    git(recRepo, ['config', 'user.name', 'Test']);
    git(recRepo, ['config', 'commit.gpgsign', 'false']);
    write(recRepo, 'src/app.swift', 'let x = 1\n');
    for (const p of ['issue-900a', 'issue-900b']) fs.mkdirSync(path.join(recRepo, 'kaola-workflow', p, '.cache'), { recursive: true });
    git(recRepo, ['add', '-A']);
    git(recRepo, ['commit', '-q', '-m', 'init']);

    const okRec = runRecord900(recRepo, ['--project', 'issue-900a', '--verdict', 'pass', '--command', 'make test']);
    assert.strictEqual(okRec.status, 0,
      '#900: a written record exits 0; got ' + okRec.status + ' stderr=' + String(okRec.stderr || '').slice(0, 300));
    assert.strictEqual(okRec.json && okRec.json.outcome, 'recorded',
      '#900: the typed result names the outcome; got ' + JSON.stringify(okRec.json));
    assert.match(String(okRec.json && okRec.json.validated_candidate_hash), HEX,
      '#900: the verb PRINTS the hash it bound (the thing no shipped command printed before); got '
      + JSON.stringify(okRec.json && okRec.json.validated_candidate_hash));
    assert.strictEqual(okRec.json && okRec.json.candidate_root, recRepo,
      '#900: the working tree that got hashed is REPORTED, so a reader can see which one was bound; got '
      + JSON.stringify(okRec.json && okRec.json.candidate_root));
    const recPath = path.join(recRepo, 'kaola-workflow', 'issue-900a', '.cache', 'final-validation.md');
    assert.strictEqual(okRec.json && okRec.json.record_path, recPath,
      '#900: the record lands at the path the gate reads; got ' + JSON.stringify(okRec.json && okRec.json.record_path));
    const wrote = fs.readFileSync(recPath, 'utf8');
    assert.ok(new RegExp('^validated_candidate_hash: ' + okRec.json.validated_candidate_hash + '$', 'm').test(wrote),
      '#900: the printed hash is the one on disk, at column zero; got ' + JSON.stringify(wrote));
    assert.ok(/^verdict: pass$/m.test(wrote) && /^validation_command: make test$/m.test(wrote),
      '#900: the verdict and the exact command land at column zero too; got ' + JSON.stringify(wrote));

    // Byte-idempotent through the real CLI, not only through the pure renderer.
    const again = runRecord900(recRepo, ['--project', 'issue-900a', '--verdict', 'pass', '--command', 'make test']);
    assert.strictEqual(again.status, 0, '#900: re-recording exits 0');
    assert.strictEqual(fs.readFileSync(recPath, 'utf8'), wrote,
      '#900: running the recipe twice is byte-identical on disk');

    // POSITIVE CONTROL: the binding is a live content address over the tree, not a constant. Without
    // this, every assertion above would also hold for a recorder that wrote the same 64 bytes always.
    write(recRepo, 'src/app.swift', 'let x = 2\n');
    const afterEdit = runRecord900(recRepo, ['--project', 'issue-900a', '--verdict', 'pass', '--command', 'make test']);
    assert.strictEqual(afterEdit.status, 0, '#900: recording after a code edit exits 0');
    assert.notStrictEqual(afterEdit.json.validated_candidate_hash, okRec.json.validated_candidate_hash,
      '#900: a code edit MUST move the recorded hash — a value that never moves is not a binding');

    // `--verdict fail` is a successful WRITE of a failing verdict: exit 0 does not mean the tests passed.
    const failRec = runRecord900(recRepo, ['--project', 'issue-900b', '--verdict', 'fail', '--command', 'make test']);
    assert.strictEqual(failRec.status, 0,
      '#900: exit 0 means THE RECORD WAS WRITTEN, not that validation passed — a `fail` record is a '
      + 'successful write; got ' + failRec.status + ' json=' + JSON.stringify(failRec.json));
    assert.strictEqual(failRec.json && failRec.json.verdict, 'fail',
      '#900: the verdict field is what carries the outcome; got ' + JSON.stringify(failRec.json));
    assert.ok(/^verdict: fail$/m.test(fs.readFileSync(path.join(recRepo, 'kaola-workflow', 'issue-900b', '.cache', 'final-validation.md'), 'utf8')),
      '#900: and it lands at column zero so the gate can read it');

    // Exit 1 — no binding could be recorded. Typed, with the path it looked for.
    const noFolder = runRecord900(recRepo, ['--project', 'issue-900-unclaimed', '--verdict', 'pass', '--command', 'make test']);
    assert.strictEqual(noFolder.status, 1,
      '#900: an unclaimed project cannot be bound; got ' + noFolder.status + ' json=' + JSON.stringify(noFolder.json));
    assert.deepStrictEqual(noFolder.json && noFolder.json.reasons, ['project_folder_missing'],
      '#900: it REFUSES TO BIND THE WRONG CHECKOUT rather than hashing whatever tree it is standing in; got '
      + JSON.stringify(noFolder.json));
    assert.strictEqual(noFolder.json && noFolder.json.validated_candidate_hash, null,
      '#900: an inconclusive report carries no hash — a plausible-looking value bound to the wrong tree is '
      + 'worse than none; got ' + JSON.stringify(noFolder.json));

    const noGit = runRecord900(outsideGit, ['--project', 'issue-900a', '--verdict', 'pass', '--command', 'make test']);
    assert.strictEqual(noGit.status, 1,
      '#900: outside a git working tree there is no candidate to bind; got ' + noGit.status
      + ' json=' + JSON.stringify(noGit.json));
    assert.deepStrictEqual(noGit.json && noGit.json.reasons, ['candidate_root_unresolved'],
      '#900: and that is reported, never guessed at; got ' + JSON.stringify(noGit.json));

    // Exit 2 — usage. Each of these is a way to write something that would read as a binding.
    //
    // The MESSAGE is asserted alongside the code, and that is not decoration: a runtime with no
    // `record` verb at all also exits 2 (`unknown subcommand "record"`), so a bare exit-code
    // assertion here would pass vacuously against a build where nothing under test exists.
    const usageCases = [
      [['--project', 'issue-900a', '--verdict', 'maybe', '--command', 'make test'],
        'a verdict outside {pass,fail}', /--verdict must be exactly/],
      [['--project', 'issue-900a', '--command', 'make test'],
        'a missing --verdict', /--verdict must be exactly/],
      [['--project', '../escape', '--verdict', 'pass', '--command', 'make test'],
        'a --project that is not one run-folder segment', /--project must name one run folder segment/],
      [['--project', 'issue-900a', '--verdict', 'pass', '--command', ''],
        'an empty --command', /--command must be the exact validation command/],
      [['--project', 'issue-900a', '--verdict', 'pass', '--command', 'make test\nrm -rf /'],
        'a multi-line --command', /--command must be the exact validation command/],
      [['--project', 'issue-900a', '--project', 'issue-900b', '--verdict', 'pass', '--command', 'make test'],
        'a duplicated flag', /duplicate argument --project/],
    ];
    for (const [args, label, message] of usageCases) {
      const r = runRecord900(recRepo, args);
      assert.strictEqual(r.status, 2,
        '#900: ' + label + ' is a USAGE error (exit 2), distinct from "no binding could be written" (exit 1); got '
        + r.status + ' stdout=' + String(r.stdout || '').slice(0, 200) + ' stderr=' + String(r.stderr || '').slice(0, 200));
      assert.match(String(r.stderr || ''), message,
        '#900: ' + label + ' must be diagnosed by name, not merely rejected; got stderr='
        + JSON.stringify(String(r.stderr || '').slice(0, 300)));
    }
  } finally {
    fs.rmSync(recRepo, { recursive: true, force: true });
    fs.rmSync(outsideGit, { recursive: true, force: true });
  }

  // ── #974: a LEFTOVER run folder must not silently satisfy `resolveRecordFolder` ────────────────
  //
  // This resolver implements the same this-tree-first rule the gap sweep re-derives, with the same
  // bare directory test as its stop condition — and it is the one BOTH record producers write
  // through: `run-chains --project` places the chain receipt at
  // `resolveProjectRecordDir` -> `resolveRecordFolder`, and the `record` verb above writes the
  // final-validation binding through it. So a `kaola-workflow/<P>/` left in the invoking tree by
  // something other than this run captures both records, and each lands in a folder nobody reads.
  //
  // ONE TREE, ONE MUTATION, so the fixture cannot be accused of comparing two different things.
  // Leg A is the LEGITIMATE worktree-resident run folder this resolver's own comment protects — "a
  // run folder that lives only in a linked worktree is NOT written from main". Leg B is that same
  // worktree after MAIN gains the run's real, claim-created folder (`workflow-state.md` plus a live
  // `.cache`, the shape only the claim transaction writes), which is what makes the worktree copy a
  // leftover. The two situations are opposite and the resolver answers them BYTE-IDENTICALLY —
  // measured at 69264936, `{"dir":"<wt>/kaola-workflow/<P>","root":"<wt>","mainResident":false,
  // "searched":["<wt>/kaola-workflow/<P>"]}` for both — so no consumer downstream can tell them apart.
  //
  // WHAT IS PINNED IS THAT THE TWO ANSWERS DIFFER, not how. Reporting the other candidate root closes
  // it (`otherProjectRoots`, twenty-five lines below this resolver, already computes exactly that
  // list, and the `record` consumer already emits it as `other_candidate_roots` with the exit code
  // untouched); resolving elsewhere closes it; a third shape closes it. Nothing here demands a throw,
  // an exit code, or a named field — this class of failure is a vacuous pass, and a door is not the
  // repair for it. Leg C is the CONTROL: the main-resident answer that the standard worktree lane
  // depends on, unchanged.
  {
    const schema974 = require('./kaola-workflow-adaptive-schema.js');
    const tmp974 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw974-')));
    try {
      const main974 = path.join(tmp974, 'main');
      fs.mkdirSync(main974, { recursive: true });
      git(main974, ['init', '-q', '-b', 'main']);
      git(main974, ['config', 'user.email', 't@t.com']);
      git(main974, ['config', 'user.name', 'Test']);
      git(main974, ['config', 'commit.gpgsign', 'false']);
      write(main974, 'src/app.js', 'module.exports = 1;\n');
      git(main974, ['add', '-A']);
      git(main974, ['commit', '-q', '-m', 'init']);
      git(main974, ['branch', 'workflow/issue-974']);
      const wt974 = path.join(tmp974, 'wt');
      git(main974, ['worktree', 'add', '-q', wt974, 'workflow/issue-974']);

      // Leg A — the worktree is the SOLE holder. This is the answer the resolver must keep giving.
      fs.mkdirSync(path.join(wt974, 'kaola-workflow', 'issue-974', '.cache'), { recursive: true });
      const soleA = runner.resolveRecordFolder(wt974, 'issue-974', schema974);
      assert.strictEqual(soleA && soleA.dir, path.join(wt974, 'kaola-workflow', 'issue-974'),
        '#974 control: a run folder resident only in the invoking worktree still resolves there — '
        + 'binding main\'s hash to it would be the wrong tree; got ' + JSON.stringify(soleA));

      // Leg B — MAIN gains the run's REAL folder. Nothing about the worktree changed.
      fs.mkdirSync(path.join(main974, 'kaola-workflow', 'issue-974', '.cache'), { recursive: true });
      write(main974, 'kaola-workflow/issue-974/workflow-state.md', '# Workflow State\n');
      write(main974, 'kaola-workflow/issue-974/.cache/run-gaps-manual.md',
        'gap: flaky-suite — the sink suite went red once\n');
      const leftoverB = runner.resolveRecordFolder(wt974, 'issue-974', schema974);
      assert.notStrictEqual(JSON.stringify(leftoverB), JSON.stringify(soleA),
        '#974: the resolver gives the SAME answer whether the worktree folder is this run\'s only one '
        + '(leg A) or a leftover standing in front of the real, claim-created one in main (leg B). '
        + 'Two opposite topologies, one answer, and the chain receipt and the final-validation binding '
        + 'both follow it into the leftover. Which way the answer changes is the implementer\'s — '
        + 'reporting the other candidate root, or resolving elsewhere — but it cannot stay identical; '
        + 'got ' + JSON.stringify(leftoverB));
      assert.ok(fs.existsSync(path.join(main974, 'kaola-workflow', 'issue-974', 'workflow-state.md')),
        '#974 fixture: main really is carrying the claim-created run folder — the assertion above is '
        + 'about nothing without it');

      // Leg C — CONTROL: main-resident only. The standard worktree lane, where the claim creates the
      // folder in main and the linked worktree does not carry it. Unchanged by #974.
      fs.rmSync(path.join(wt974, 'kaola-workflow', 'issue-974'), { recursive: true, force: true });
      const mainOnlyC = runner.resolveRecordFolder(wt974, 'issue-974', schema974);
      assert.strictEqual(mainOnlyC && mainOnlyC.dir,
        path.join(main974, 'kaola-workflow', 'issue-974'),
        '#974 control: with no folder in the worktree at all the resolver still reaches MAIN — this is '
        + 'the lane every worktree finalize takes; got ' + JSON.stringify(mainOnlyC));
      assert.strictEqual(mainOnlyC && mainOnlyC.mainResident, true,
        '#974 control: and reports that it did, which is what the operator hint keys on; got '
        + JSON.stringify(mainOnlyC));
    } finally {
      fs.rmSync(tmp974, { recursive: true, force: true });
    }
  }

  // ── #904: the sandbox root is a PATH BUDGET, and a child must be able to bind in it ────────────
  //
  // The runner points the child's TMPDIR at its own sandbox directory. A unix domain socket path is
  // carried in `sun_path`, a fixed-width field (104 bytes on darwin, 108 on Linux), so a sandbox root
  // that is merely long makes every socket-binding child die with `listen EINVAL` — not a flake, a
  // deterministic length overflow. tsx is one such child: its IPC pipe is `$TMPDIR/tsx-<uid>/<pid>.pipe`.
  //
  // WHAT IS PINNED IS THE RESULT — a child spawned by `run` can bind a socket under the sandbox TMPDIR —
  // and NOT the shape that achieves it. The directory literal, the seed width, and whether the seed is a
  // digest at all are the implementer's; a pin on `kwv` or on 16 hex would rot the moment either moved
  // for a reason having nothing to do with this defect. The one shape property that IS pinned is the one
  // the budget must not buy: two runs of the same policy still produce the same `command_id`, because the
  // sandbox path is hashed into the identity chain and a random root would break it.
  //
  // THIS IS THE FIRST COVERAGE THE `run` SUBCOMMAND HAS EVER HAD. `defaultSandboxPaths` is not exported
  // and no suite in the repo invoked `run`, which is exactly how a 143-character root shipped. So the
  // controls below are not decoration — without them a green here proves only that something exited 0.
  //
  // TMPDIR IS FIXED BY THE FIXTURE, never inherited. `os.tmpdir()` is the first term of the budget, and
  // it is 4 characters on a box with TMPDIR unset and 48 on a stock macOS user session. Inheriting it
  // would make this test pass or fail by accident of who ran it; the fixture pins it at the same 48 the
  // defect was measured against, so the budget under test is the real one.
  if (process.platform !== 'win32') {
    const SOCK_TMPDIR_LEN = 48;               // a stock macOS `os.tmpdir()`: /var/folders/xx/…/T
    const sockBase = fs.mkdtempSync('/tmp/kw904-');
    const sockTmp = sockBase + '-' + 'p'.repeat(Math.max(1, SOCK_TMPDIR_LEN - sockBase.length - 1));
    const sockRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw904-repo-')));
    const sockOut = path.join(sockBase, 'receipt.json');
    try {
      fs.mkdirSync(sockTmp, { recursive: true });
      assert.strictEqual(sockTmp.length, SOCK_TMPDIR_LEN,
        '#904 fixture: the sandbox TMPDIR under test must be exactly ' + SOCK_TMPDIR_LEN + ' characters — '
        + 'the budget is arithmetic over path lengths, so a fixture of some other length measures some '
        + 'other budget; got ' + JSON.stringify(sockTmp));

      // The probe reproduces tsx's real pipe shape. The trailing component is fixed rather than
      // `process.pid` so the suffix width is the same on every run: a 3-digit pid would quietly buy
      // two characters of budget the real consumer does not have.
      const probe = [
        "'use strict';",
        "const fs = require('fs'); const net = require('net'); const path = require('path');",
        "const dir = path.join(process.env.TMPDIR || '/tmp', 'tsx-' + (process.getuid ? process.getuid() : 0));",
        'fs.mkdirSync(dir, { recursive: true });',
        "const sock = path.join(dir, '12345.pipe');",
        'const server = net.createServer();',
        "server.on('error', e => { process.stderr.write('BIND FAILED len=' + sock.length + ' ' + e.message + '\\n'); process.exit(1); });",
        "server.listen(sock, () => { server.close(() => { process.stdout.write('BIND OK len=' + sock.length + '\\n'); process.exit(0); }); });",
      ].join('\n');
      const probePath = path.join(sockBase, 'probe-tsx-pipe.js');
      fs.writeFileSync(probePath, probe);
      const noopPath = path.join(sockBase, 'noop.js');
      fs.writeFileSync(noopPath, "'use strict';\nprocess.exit(0);\n");

      git(sockRepo, ['init', '-q', '-b', 'main']);
      git(sockRepo, ['config', 'user.email', 't@t.com']);
      git(sockRepo, ['config', 'user.name', 'Test']);
      git(sockRepo, ['config', 'commit.gpgsign', 'false']);
      write(sockRepo, 'src/app.js', 'module.exports = 1;\n');
      git(sockRepo, ['add', '-A']);
      git(sockRepo, ['commit', '-q', '-m', 'init']);

      function runRun904(command, outputPath) {
        // spawn-class: cli-contract
        const r = spawnSync(process.execPath, [runnerScript, 'run',
          '--command', command, '--timeout-minutes', '1', '--repo-root', sockRepo,
          '--output', outputPath], {
          cwd: sockRepo, encoding: 'utf8', timeout: 180000,
          // TMPDIR set EXPLICITLY — see the note above. Everything else is inherited so `node` stays
          // resolvable on PATH, which is what makes the child a real child.
          env: Object.assign({}, process.env, { TMPDIR: sockTmp }),
        });
        let receipt = null;
        try { receipt = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch (_) {}
        return { status: r.status, stdout: r.stdout, stderr: r.stderr, receipt };
      }

      // CONTROL A — the probe itself binds under this TMPDIR. Same script, same directory, no runner.
      // Without this leg a red below is equally explained by "the fixture TMPDIR is unusable", and the
      // one axis the test claims to vary would not be the only one that varied.
      // spawn-class: cli-contract
      const directProbe = spawnSync(process.execPath, [probePath], {
        encoding: 'utf8', timeout: 60000,
        env: Object.assign({}, process.env, { TMPDIR: sockTmp }),
      });
      assert.strictEqual(directProbe.status, 0,
        '#904 control: the probe binds fine under the fixture TMPDIR directly — so anything that fails '
        + 'below fails because of the sandbox root the RUNNER built, not because of the fixture; got status='
        + directProbe.status + ' stderr=' + JSON.stringify(String(directProbe.stderr || '').slice(0, 300)));

      // CONTROL B — the runner drives a child successfully in this fixture at all. A `run` that could
      // not execute anything here would red the acceptance leg for a reason that has nothing to do
      // with path length.
      const noopRun = runRun904('node ' + noopPath, path.join(sockBase, 'noop-receipt.json'));
      assert.strictEqual(noopRun.status, 0,
        '#904 control: `run` over a child that binds nothing PASSES in this fixture; got status='
        + noopRun.status + ' stderr=' + JSON.stringify(String(noopRun.stderr || '').slice(0, 400)));
      assert.strictEqual(noopRun.receipt && noopRun.receipt.outcome, 'pass',
        '#904 control: and the receipt says so; got ' + JSON.stringify(noopRun.receipt && noopRun.receipt.outcome));

      // THE ACCEPTANCE LEG. One axis against control B: the child binds a socket under its TMPDIR.
      const sockRun = runRun904('node ' + probePath, sockOut);
      assert.strictEqual(sockRun.status, 0,
        '#904: a child spawned by `run` MUST be able to bind a unix socket under the sandbox TMPDIR. '
        + 'It cannot when the sandbox root spends the whole `sun_path` budget before the child gets a '
        + 'byte — the failure is `listen EINVAL`, deterministic, and it kills every socket-binding tool '
        + 'a consumer might validate with. got status=' + sockRun.status
        + ' outcome=' + JSON.stringify(sockRun.receipt && sockRun.receipt.outcome)
        + ' stderr=' + JSON.stringify(String(sockRun.stderr || '').slice(0, 400)));
      assert.strictEqual(sockRun.receipt && sockRun.receipt.outcome, 'pass',
        '#904: and the receipt records the pass; got ' + JSON.stringify(sockRun.receipt && sockRun.receipt.outcome));
      const sockRuns = (sockRun.receipt && sockRun.receipt.runs) || [];
      assert.strictEqual(sockRuns.length && sockRuns[0].exit_code, 0,
        '#904: the CHILD exited 0 — a runner that never ran it would also not report a bind failure; got '
        + JSON.stringify(sockRuns[0]));

      // DETERMINISM — the one property the seed genuinely buys, and the one a shorter root must keep.
      // The sandbox HOME/TMPDIR are hashed into `command_identity.effective_environment`, so a
      // `mkdtemp`-style random root would move `command_id` on every run and every inherited
      // `{command_id, required_pass_vector_id}` obligation with it.
      const det1 = runRun904('node ' + noopPath, path.join(sockBase, 'det1.json'));
      const det2 = runRun904('node ' + noopPath, path.join(sockBase, 'det2.json'));
      assert.ok(det1.receipt && HEX.test(String(det1.receipt.command_id)),
        '#904: the run produces a command_id; got ' + JSON.stringify(det1.receipt && det1.receipt.command_id));
      assert.strictEqual(det1.receipt && det1.receipt.command_id, det2.receipt && det2.receipt.command_id,
        '#904: two runs of the SAME policy against the SAME repo must produce an identical command_id — '
        + 'the sandbox path is inside the identity chain, so shortening it must not make it random; got '
        + JSON.stringify(det1.receipt && det1.receipt.command_id) + ' vs '
        + JSON.stringify(det2.receipt && det2.receipt.command_id));
      // NON-VACUITY for the line above: a different policy must move it, or "identical" would also hold
      // for a command_id that is a constant.
      const det3 = runRun904('node ' + probePath, path.join(sockBase, 'det3.json'));
      assert.notStrictEqual(det3.receipt && det3.receipt.command_id, det1.receipt && det1.receipt.command_id,
        '#904: a DIFFERENT policy moves the command_id — otherwise the equality above is satisfied by a '
        + 'constant; got ' + JSON.stringify(det3.receipt && det3.receipt.command_id));
    } finally {
      fs.rmSync(sockBase, { recursive: true, force: true });
      fs.rmSync(sockTmp, { recursive: true, force: true });
      fs.rmSync(sockRepo, { recursive: true, force: true });
    }
  }

  // ── #905: retained child output — `--keep-output <dir>` ────────────────────────────────────────
  //
  // A red receipt carries the child's output as DIGESTS ONLY, so it names no cause: the complete
  // human-readable text is a live local at hash time and is dropped on the floor. `--keep-output`
  // retains it, opt-in per invocation, and shipped with no coverage at all.
  //
  // WHAT IS PINNED IS THE RESULT. Nothing below names the directory literal, the file-naming spelling,
  // or an internal function: a retained artifact is located by its BYTES, and the index keying is
  // asserted as "a reader holding run i's digest can find run i's bytes by name" rather than as any
  // particular name. Four properties, each of them the difference between this flag being safe and
  // being a defect:
  //
  //   A. THE RECEIPT IS BYTE-UNCHANGED BY THE FLAG. This is why an opt-in flag was preferable to the
  //      two alternatives — a `raw_output_path` field re-keys `vector_id` with the destination, and
  //      inlining the text re-keys it once for everyone. If the receipt ever moves with the flag, the
  //      reason this shape was chosen is void, so it is pinned on the value AND on the field set.
  //   B. THE BYTES ARE WRITTEN AFTER THE LAST CANDIDATE DIGEST. The repetition loop digests the tree
  //      before and after every repetition and `reduceRuns` compares both, so a log written mid-loop
  //      makes the runner report its OWN output as `candidate_mutation` — turning a merely red run
  //      into a self-inflicted `inconclusive`, which is the outcome that cannot be acted on.
  //   C. AN EXISTING TARGET REFUSES, BEFORE THE CHILD RUNS. A stale file read as this run's output is
  //      a FALSE diagnosis, strictly worse than the no-diagnosis state the flag exists to fix. And a
  //      refusal arriving after a long suite has thrown away the very run it was meant to explain, so
  //      "it refuses" and "it refuses first" are two separate claims and both are asserted.
  //   D. EVERY REPETITION'S BYTES ARE RETAINED AND KEYED BY THE RECEIPT'S OWN `runs[].index`. That
  //      mapping is the whole value of the feature: it is what takes a reader from a red digest to
  //      the bytes that produced it.
  //
  // ON ARMING: the runner reads no `KAOLA_*` variable, so no inherited environment can switch this
  // mechanism off — but a fixture can still be vacuous in two ways that ARE checked below. Every leg
  // that expects retention proves the child actually ran and actually produced those bytes (the
  // digests are compared against the receipt's, and C's control leg observes a side effect the child
  // itself made), and B's location is proven to be one the candidate digest can SEE before it is used.
  if (process.platform !== 'win32') {
    const keepBase = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw905-')));
    const keepRepo = path.join(keepBase, 'repo');
    try {
      fs.mkdirSync(keepRepo);
      git(keepRepo, ['init', '-q', '-b', 'main']);
      git(keepRepo, ['config', 'user.email', 't@t.com']);
      git(keepRepo, ['config', 'user.name', 'Test']);
      git(keepRepo, ['config', 'commit.gpgsign', 'false']);
      write(keepRepo, 'src/app.js', 'module.exports = 1;\n');
      git(keepRepo, ['add', '-A']);
      git(keepRepo, ['commit', '-q', '-m', 'init']);

      // A DETERMINISTIC red child — no pid, no clock. Two runs of this policy are therefore comparable
      // byte-for-byte, so any difference between them can only have come from the flag under test.
      // Its two streams differ from each other, which is what makes "stdout and stderr are separately
      // recoverable" a falsifiable claim rather than one satisfied by a single merged file.
      const redChild = path.join(keepBase, 'red-child.js');
      fs.writeFileSync(redChild, [
        "'use strict';",
        "process.stdout.write('KW905_STDOUT: assertion 7 of 9 failed\\n  expected: alpha\\n  actual:   beta\\n');",
        "process.stderr.write('KW905_STDERR: Error: boom at line 42\\n');",
        'process.exit(1);',
      ].join('\n'));

      function runRun905(extra) {
        // spawn-class: cli-contract
        const r = spawnSync(process.execPath, [runnerScript, 'run',
          '--timeout-minutes', '1', '--repo-root', keepRepo, ...extra], {
          cwd: keepRepo, encoding: 'utf8', timeout: 180000,
        });
        return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
      }
      function receipt905(file) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
      }
      // A retained artifact is identified by its CONTENT. Reading the directory and digesting what is
      // in it is deliberate: it lets every assertion below be about what a reader can recover, and
      // leaves the naming scheme entirely to the implementer.
      // A destination that does not exist reads as "nothing was retained" rather than throwing: the
      // assertion that follows then names the property that failed, where a raw ENOENT would name only
      // a path — and "the flag did nothing at all" is precisely the state this block exists to catch.
      function retained905(dir) {
        let names = [];
        try { names = fs.readdirSync(dir).sort(); } catch (_) { names = []; }
        return names.map(name => {
          const bytes = fs.readFileSync(path.join(dir, name));
          return { name, bytes, digest: runner.sha256(bytes) };
        });
      }
      function carrying905(artifacts, digest) {
        return artifacts.filter(entry => entry.digest === digest);
      }

      // ── A. the receipt is byte-unchanged by the flag ─────────────────────────────────────────────
      const receiptOff = path.join(keepBase, 'receipt-off.json');
      const receiptOn = path.join(keepBase, 'receipt-on.json');
      const retainDir = path.join(keepBase, 'retained');   // OUTSIDE the repo: one axis only, the flag
      const off905 = runRun905(['--command', 'node ' + redChild, '--output', receiptOff]);
      const on905 = runRun905(['--command', 'node ' + redChild, '--output', receiptOn, '--keep-output', retainDir]);
      const OFF = receipt905(receiptOff);
      const ON = receipt905(receiptOn);
      assert.ok(OFF && ON, '#905: both legs must write a receipt; got off=' + off905.status + ' on=' + on905.status
        + ' stderr=' + JSON.stringify(on905.stderr.slice(0, 400)));
      assert.strictEqual(OFF.outcome, 'fail', '#905: the leg under test is a RED run — the case the flag exists for; got '
        + JSON.stringify(OFF.outcome));
      assert.strictEqual(ON.outcome, 'fail', '#905: and the retained leg is the same red run; got ' + JSON.stringify(ON.outcome));

      // NON-VACUITY, asserted BEFORE the equalities: the flag must actually have retained the child's
      // bytes. Without this leg every equality below is also satisfied by a `--keep-output` that is
      // silently ignored — which is precisely the state this suite is being written against.
      const onArtifacts = retained905(retainDir);
      assert.notStrictEqual(ON.runs[0].stdout_sha256, runner.sha256(''),
        '#905: the child under test must actually emit stdout, or "the bytes were retained" is a claim about nothing');
      assert.ok(carrying905(onArtifacts, ON.runs[0].stdout_sha256).length >= 1,
        '#905: with the flag, the child\'s stdout is RECOVERABLE — some retained artifact digests to the '
        + 'receipt\'s stdout_sha256. This is the whole feature; got ' + JSON.stringify(onArtifacts.map(a => a.name)));
      assert.ok(carrying905(onArtifacts, ON.runs[0].stderr_sha256).length >= 1,
        '#905: and so is stderr — both halves of a failure are usually needed; got '
        + JSON.stringify(onArtifacts.map(a => a.name)));
      assert.notStrictEqual(carrying905(onArtifacts, ON.runs[0].stdout_sha256)[0].name,
        carrying905(onArtifacts, ON.runs[0].stderr_sha256)[0].name,
        '#905: the two streams stay SEPARATELY recoverable — merging them loses which was which');
      // DISCOVERED, never spelled. Leg E below needs a validated command to collide with retention on
      // purpose, which means knowing the names retention will write — so they are measured here, from
      // a real run, rather than written into this suite as literals.
      const stdoutCarrier = carrying905(onArtifacts, ON.runs[0].stdout_sha256)[0].name;
      const stderrCarrier = carrying905(onArtifacts, ON.runs[0].stderr_sha256)[0].name;

      // The equalities. `vector_id` is the inherited-obligation key, so it moving with a retention
      // destination is the exact failure the rejected `raw_output_path` direction would have caused.
      assert.strictEqual(ON.vector_id, OFF.vector_id,
        '#905: two runs of the SAME failing command differing ONLY in --keep-output must produce the SAME '
        + 'vector_id. An opt-in flag was chosen over a receipt field precisely because it does not re-key '
        + 'the receipt; if this moves, the reason for the design is gone; got ' + JSON.stringify(ON.vector_id)
        + ' vs ' + JSON.stringify(OFF.vector_id));
      assert.strictEqual(ON.command_id, OFF.command_id,
        '#905: and the same command_id — retention is not part of the command\'s identity');
      assert.strictEqual(ON.candidate_digest, OFF.candidate_digest,
        '#905: and the same candidate — a retention destination outside the tree is not a tree change');
      assert.deepStrictEqual(Object.keys(ON).sort(), Object.keys(OFF).sort(),
        '#905: the receipt GAINS NO FIELD when the flag is used; got ' + JSON.stringify(Object.keys(ON).sort()));
      assert.deepStrictEqual(Object.keys(ON.runs[0]).sort(), Object.keys(OFF.runs[0]).sort(),
        '#905: nor does any runs[] entry; got ' + JSON.stringify(Object.keys(ON.runs[0]).sort()));
      // The audit block is checked on its SHAPE rather than its bytes, because its timestamps
      // legitimately differ between any two runs (:154-155). Without this, a field added to `audit`
      // would be invisible: it moves neither `vector_id` nor the top-level key set.
      assert.deepStrictEqual(Object.keys(ON.audit).sort(), Object.keys(OFF.audit).sort(),
        '#905: nor does the audit block — "no new receipt field" includes the one place an addition would '
        + 'not move vector_id; got ' + JSON.stringify(Object.keys(ON.audit).sort()));
      assert.deepStrictEqual(Object.keys(ON.audit.runs[0]).sort(), Object.keys(OFF.audit.runs[0]).sort(),
        '#905: nor any audit run entry; got ' + JSON.stringify(Object.keys(ON.audit.runs[0]).sort()));
      // Everything except the audit block and the self-hash that binds it is byte-identical.
      const durable905 = value => {
        const copy = Object.assign({}, value);
        delete copy.audit;
        delete copy.receipt_sha256;
        return runner.canonicalJson(copy);
      };
      assert.strictEqual(durable905(ON), durable905(OFF),
        '#905: every durable byte of the receipt outside the audit block is identical with and without the '
        + 'flag — the property is byte equality, not merely an equal vector_id');
      assert.strictEqual(runner.computeReceiptSha256(ON), ON.receipt_sha256,
        '#905: and the retained-leg receipt still self-verifies (the exclusion above gives up nothing)');
      assert.strictEqual(runner.computeReceiptSha256(OFF), OFF.receipt_sha256,
        '#905: as does the leg without the flag');

      // ── D. every repetition is retained, keyed by the receipt's own index ────────────────────────
      //
      // The child emits a DIFFERENT line on each repetition — a counter in its own TMPDIR, which the
      // sandbox provides and which is not the repo. Without that the per-index digests would all be
      // equal and "run i's file holds run i's bytes" would be satisfied by any mapping at all,
      // including a reversed one.
      const repChild = path.join(keepBase, 'rep-child.js');
      fs.writeFileSync(repChild, [
        "'use strict';",
        "const fs = require('fs'); const path = require('path');",
        "const counter = path.join(process.env.TMPDIR || '/tmp', 'kw905-repetition-counter');",
        "let n = 0; try { n = parseInt(fs.readFileSync(counter, 'utf8'), 10) || 0; } catch (_) { n = 0; }",
        'n += 1; fs.writeFileSync(counter, String(n));',
        "process.stdout.write('KW905_OUT repetition ' + n + '\\n');",
        "process.stderr.write('KW905_ERR repetition ' + n + '\\n');",
        'process.exit(1);',
      ].join('\n'));
      const REPETITIONS_905 = 3;
      const receiptReps = path.join(keepBase, 'receipt-reps.json');
      const retainReps = path.join(keepBase, 'retained-reps');
      const reps905 = runRun905(['--command', 'node ' + repChild, '--repetitions', String(REPETITIONS_905),
        '--output', receiptReps, '--keep-output', retainReps]);
      const REPS = receipt905(receiptReps);
      assert.ok(REPS && Array.isArray(REPS.runs) && REPS.runs.length === REPETITIONS_905,
        '#905: the run executed all ' + REPETITIONS_905 + ' repetitions; got status=' + reps905.status
        + ' runs=' + JSON.stringify(REPS && REPS.runs && REPS.runs.length) + ' stderr=' + JSON.stringify(reps905.stderr.slice(0, 400)));
      const repDigests = REPS.runs.map(entry => entry.stdout_sha256);
      assert.strictEqual(new Set(repDigests).size, REPETITIONS_905,
        '#905 arming: each repetition must have produced DIFFERENT bytes, or the index mapping below is '
        + 'unfalsifiable — every wrong mapping would also pass; got ' + JSON.stringify(repDigests));
      const repArtifacts = retained905(retainReps);
      const namesByIndex = new Map();
      for (const record of REPS.runs) {
        const out = carrying905(repArtifacts, record.stdout_sha256);
        const err = carrying905(repArtifacts, record.stderr_sha256);
        assert.ok(out.length >= 1 && err.length >= 1,
          '#905: EVERY repetition\'s bytes are retained, not just the last — repetition ' + record.index
          + ' must be recoverable from the retained artifacts; got ' + JSON.stringify(repArtifacts.map(a => a.name)));
        // The keying. A reader who has a red `runs[i]` must be able to go to repetition i's bytes FROM
        // THE INDEX — that mapping is the entire value of retention. Asserted as "the artifact carrying
        // those bytes is named for that index", which leaves the naming scheme free while still failing
        // on a mapping that is off by one, reversed, or collapsed onto a single file.
        assert.ok(out[0].name.includes(String(record.index)),
          '#905: the retained artifact holding repetition ' + record.index + '\'s stdout must be locatable FROM '
          + 'THE RECEIPT INDEX — that keying is what maps a red digest back to the bytes that produced it; '
          + 'those bytes are in ' + JSON.stringify(out[0].name));
        assert.ok(err[0].name.includes(String(record.index)),
          '#905: and so must its stderr; those bytes are in ' + JSON.stringify(err[0].name));
        assert.ok(!namesByIndex.has(out[0].name),
          '#905: each repetition gets its OWN artifact — a later repetition must not land on an earlier '
          + 'one\'s name; ' + JSON.stringify(out[0].name) + ' is claimed by two indices');
        namesByIndex.set(out[0].name, record.index);
      }

      // Still D — "for every index" includes the ordinary case of a child whose stderr stays quiet. An
      // EMPTY stream must still leave an artifact: "there is no file for run i's stderr" and "run i
      // wrote nothing to stderr" are different diagnoses, and a reader who cannot tell them apart is
      // back where the missing-output defect left them.
      const quietChild = path.join(keepBase, 'quiet-child.js');
      fs.writeFileSync(quietChild, [
        "'use strict';",
        "process.stdout.write('KW905_QUIET: stdout only, stderr stays empty\\n');",
        'process.exit(1);',
      ].join('\n'));
      const receiptQuiet = path.join(keepBase, 'receipt-quiet.json');
      const retainQuiet = path.join(keepBase, 'retained-quiet');
      const quiet905 = runRun905(['--command', 'node ' + quietChild, '--output', receiptQuiet, '--keep-output', retainQuiet]);
      const QUIET = receipt905(receiptQuiet);
      assert.ok(QUIET && Array.isArray(QUIET.runs) && QUIET.runs.length === 1,
        '#905: the quiet-child leg produced a receipt; got status=' + quiet905.status
        + ' stderr=' + JSON.stringify(quiet905.stderr.slice(0, 300)));
      assert.strictEqual(QUIET.runs[0].stderr_sha256, runner.sha256(''),
        '#905 arming: this child must genuinely write NOTHING to stderr, or the empty-stream case is not '
        + 'the one being exercised; got ' + JSON.stringify(QUIET.runs[0].stderr_sha256));
      const quietArtifacts = retained905(retainQuiet);
      assert.ok(carrying905(quietArtifacts, QUIET.runs[0].stderr_sha256).length >= 1,
        '#905: an empty stream STILL leaves a retained artifact — a silently absent file turns "the child '
        + 'said nothing" into "retention lost it"; got ' + JSON.stringify(quietArtifacts.map(a => a.name)));
      assert.ok(carrying905(quietArtifacts, QUIET.runs[0].stdout_sha256).length >= 1,
        '#905: and the non-empty stream of the same run is recoverable beside it; got '
        + JSON.stringify(quietArtifacts.map(a => a.name)));

      // ── C. an existing target refuses, and refuses BEFORE the child runs ─────────────────────────
      //
      // The clash is created by RUNNING ONCE, not by this suite guessing a file name: that is both
      // naming-agnostic and the operator's actual mistake.
      const sentinel905 = path.join(keepBase, 'the-child-ran');
      const sentinelChild = path.join(keepBase, 'sentinel-child.js');
      fs.writeFileSync(sentinelChild, [
        "'use strict';",
        "require('fs').writeFileSync(" + JSON.stringify(sentinel905) + ", 'ran\\n');",
        "process.stdout.write('KW905_SENTINEL_STDOUT\\n');",
        "process.stderr.write('KW905_SENTINEL_STDERR\\n');",
        'process.exit(1);',
      ].join('\n'));
      const clashDir = path.join(keepBase, 'retained-clash');
      const receiptFirst = path.join(keepBase, 'receipt-first.json');
      const receiptClash = path.join(keepBase, 'receipt-clash.json');

      // CONTROL — the same invocation into a FRESH directory does everything the refusal leg must not:
      // the child runs (it leaves a mark of its own), a receipt is written, and bytes are retained.
      // Without this leg, "the child did not run" below is equally explained by a fixture in which the
      // child never runs, and a runner that refused unconditionally would pass.
      const first905 = runRun905(['--command', 'node ' + sentinelChild, '--output', receiptFirst, '--keep-output', clashDir]);
      assert.ok(fs.existsSync(sentinel905),
        '#905 control: into a fresh directory the child RUNS and leaves its own mark; got status=' + first905.status
        + ' stderr=' + JSON.stringify(first905.stderr.slice(0, 400)));
      assert.ok(fs.existsSync(receiptFirst), '#905 control: and the receipt is written');
      const clashArtifacts = retained905(clashDir);
      assert.ok(clashArtifacts.length >= 1, '#905 control: and the bytes are retained');
      const clashBefore = clashArtifacts.map(entry => entry.digest).join(',');

      fs.rmSync(sentinel905, { force: true });
      assert.ok(!fs.existsSync(sentinel905), '#905 fixture: the mark is cleared before the refusal leg');
      const clash905 = runRun905(['--command', 'node ' + sentinelChild, '--output', receiptClash, '--keep-output', clashDir]);
      assert.strictEqual(clash905.status, 2,
        '#905: pointing --keep-output at a directory that already holds retained output is a USAGE error — '
        + 'overwriting destroys the earlier run\'s evidence, and appending merges two runs into one blob; '
        + 'got status=' + clash905.status + ' stderr=' + JSON.stringify(clash905.stderr.slice(0, 400)));
      assert.ok(!fs.existsSync(sentinel905),
        '#905: and it refuses BEFORE THE CHILD RUNS — the child left no mark this time. A refusal that '
        + 'arrived after a 27-minute suite would have thrown away the run it was meant to explain');
      assert.ok(!fs.existsSync(receiptClash),
        '#905: nothing at all was produced by the refused run — no receipt either');
      assert.strictEqual(clash905.stdout, '',
        '#905: and it printed no receipt to stdout; got ' + JSON.stringify(clash905.stdout.slice(0, 200)));
      assert.strictEqual(retained905(clashDir).map(entry => entry.digest).join(','), clashBefore,
        '#905: THE EARLIER RUN\'S BYTES SURVIVE UNTOUCHED. A stale file read as this run\'s output is a '
        + 'FALSE diagnosis, which is strictly worse than the no-diagnosis state the flag exists to fix');
      assert.ok(clash905.stderr.includes('--keep-output'),
        '#905: the refusal names the flag that caused it; got ' + JSON.stringify(clash905.stderr.slice(0, 300)));
      assert.ok(clashArtifacts.some(entry => clash905.stderr.includes(path.join(clashDir, entry.name))),
        '#905: and names the file it will not overwrite, so the operator can act on it rather than guess; got '
        + JSON.stringify(clash905.stderr.slice(0, 300)));

      // The same refusal when the destination exists but is not a directory at all — `--keep-output`
      // names the directory the streams land in, and silently treating a file as one would either
      // clobber it or fail deep inside the run.
      const notDirectory = path.join(keepBase, 'not-a-directory');
      fs.writeFileSync(notDirectory, 'an operator\'s own file\n');
      const notDir905 = runRun905(['--command', 'node ' + redChild, '--output', path.join(keepBase, 'receipt-notdir.json'),
        '--keep-output', notDirectory]);
      assert.strictEqual(notDir905.status, 2,
        '#905: an existing non-directory destination is a usage error too; got status=' + notDir905.status
        + ' stderr=' + JSON.stringify(notDir905.stderr.slice(0, 300)));
      assert.strictEqual(fs.readFileSync(notDirectory, 'utf8'), 'an operator\'s own file\n',
        '#905: and the operator\'s file is not touched');

      // ── B. the bytes are written AFTER the last candidate digest ─────────────────────────────────
      //
      // Runs LAST, because it is the only leg that writes into the fixture repo.
      //
      // ARMING FIRST. This leg is worthless at a validation-INVISIBLE location: there, no placement in
      // the loop could ever move the candidate, so the test would pass against the very implementation
      // it exists to forbid. So the location is proven visible to the digest — by moving it — before it
      // is used, and proven to move it back, so the observation is about this path and not about drift.
      const visibleDir = path.join(keepRepo, 'retained-visible');
      assert.strictEqual(runner.isValidationInvisible('retained-visible/probe', [], { self_host: false }), false,
        '#905 arming: the retention location for this leg must be one the candidate digest CAN see');
      const treeClean = runner.computeLandableTreeDigest(keepRepo);
      write(keepRepo, 'retained-visible/probe', 'arming probe\n');
      assert.notStrictEqual(runner.computeLandableTreeDigest(keepRepo), treeClean,
        '#905 arming: a file appearing at that location MOVES the candidate digest — otherwise a mid-loop '
        + 'write would be invisible and the assertion below would prove nothing');
      fs.rmSync(visibleDir, { recursive: true, force: true });
      assert.strictEqual(runner.computeLandableTreeDigest(keepRepo), treeClean,
        '#905 arming: and removing it restores the digest, so what is measured below is this write and '
        + 'nothing else that happened to the tree');

      const receiptVisible = path.join(keepBase, 'receipt-visible.json');   // the RECEIPT stays outside
      const visible905 = runRun905(['--command', 'node ' + redChild, '--repetitions', '2',
        '--output', receiptVisible, '--keep-output', visibleDir]);
      const VISIBLE = receipt905(receiptVisible);
      assert.ok(VISIBLE, '#905: the visible-location leg writes a receipt; got status=' + visible905.status
        + ' stderr=' + JSON.stringify(visible905.stderr.slice(0, 400)));
      const visibleArtifacts = retained905(visibleDir);
      for (const record of VISIBLE.runs) {
        assert.ok(carrying905(visibleArtifacts, record.stdout_sha256).length >= 1,
          '#905: retention really happened at the visible location — otherwise the clean outcome below is '
          + 'clean because nothing was written; got ' + JSON.stringify(visibleArtifacts.map(a => a.name)));
      }
      assert.ok(!(VISIBLE.reduction_reasons || []).includes('candidate_mutation'),
        '#905: retaining output INSIDE the validated tree must not make the runner report its own log as a '
        + 'candidate mutation. The loop digests the tree before and after every repetition, so the bytes '
        + 'have to land after the last of those digests; got reduction_reasons='
        + JSON.stringify(VISIBLE.reduction_reasons));
      assert.strictEqual(VISIBLE.outcome, 'fail',
        '#905: the run stays a plain, actionable RED — not the self-inflicted `inconclusive` a mid-loop '
        + 'write produces, which is the one outcome a reader cannot act on; got ' + JSON.stringify(VISIBLE.outcome));
      assert.deepStrictEqual(VISIBLE.reduction_reasons, [],
        '#905: with no reduction reason at all; got ' + JSON.stringify(VISIBLE.reduction_reasons));
      assert.ok(VISIBLE.runs.every(record => record.pre_candidate_digest === VISIBLE.candidate_digest
        && record.post_candidate_digest === VISIBLE.candidate_digest),
        '#905: every pre/post candidate digest still equals the vector\'s — the tree the runner validated '
        + 'was not disturbed by the runner; got ' + JSON.stringify(VISIBLE.runs.map(r => [r.pre_candidate_digest, r.post_candidate_digest])));

      // ── E. the WRITE-TIME refusal — the window a pre-flight check cannot reach ───────────────────
      //
      // C pins the check that runs BEFORE the command, and that check is structurally blind to the
      // window between itself and the write: the VALIDATED COMMAND can create a retention file while it
      // runs, and a write that merely trusts the earlier check clobbers it — with exit codes identical
      // to a clean retention, so nothing tells the operator that what they are reading is their own
      // command's artefact rather than this run's output. A guarantee stated at the wrong point in time
      // is not a guarantee, so this pins the WINDOW rather than the check.
      const COLLIDE_ARTEFACT = 'IRREPLACEABLE ARTEFACT THE VALIDATED COMMAND ITSELF WROTE\n';
      function collideChild905(file, targetName, targetDir) {
        fs.writeFileSync(file, [
          "'use strict';",
          'require(\'fs\').writeFileSync(' + JSON.stringify(path.join(targetDir, targetName)) + ', '
            + JSON.stringify(COLLIDE_ARTEFACT) + ');',
          "process.stdout.write('KW905_COLLIDE_STDOUT\\n');",
          "process.stderr.write('KW905_COLLIDE_STDERR\\n');",
          'process.exit(1);',
        ].join('\n'));
        return file;
      }
      // BOTH ORDERINGS. Retention writes the two streams in a fixed order, so which carrier the command
      // collides with must not change the outcome. It once did: a clash on the later carrier left the
      // earlier one ALREADY WRITTEN, so the directory was left holding one genuine retained file beside
      // the command's artefact — a retention that reads as COMPLETE while half of it is not this run's,
      // and a refusal whose own sentence ("no retained output was written for this run") was false.
      // Exercising both carriers is what makes that invariant independent of the write order.
      for (const carrier of [stdoutCarrier, stderrCarrier]) {
        const collideDir = path.join(keepBase, 'retained-collide-' + carrier);
        const collideChild = collideChild905(path.join(keepBase, 'collide-' + carrier + '.js'), carrier, collideDir);
        const receiptCollide = path.join(keepBase, 'receipt-collide-' + carrier + '.json');
        const collide905 = runRun905(['--command', 'node ' + collideChild, '--output', receiptCollide,
          '--keep-output', collideDir]);
        assert.strictEqual(collide905.status, 2,
          '#905: a retention file created BY THE VALIDATED COMMAND, during the run, is refused at the moment '
          + 'of writing. The pre-flight check cannot see this — the file did not exist when it looked. '
          + 'Collision on ' + JSON.stringify(carrier) + '; got status=' + collide905.status
          + ' stderr=' + JSON.stringify(collide905.stderr.slice(0, 400)));
        assert.strictEqual(fs.readFileSync(path.join(collideDir, carrier), 'utf8'), COLLIDE_ARTEFACT,
          '#905: and the command\'s own artefact is BYTE-INTACT. Overwriting it is the false diagnosis this '
          + 'flag exists to prevent, arriving by a route the up-front check does not cover. Collision on '
          + JSON.stringify(carrier));
        assert.ok(!fs.existsSync(receiptCollide),
          '#905: the refused run produces no receipt — it did not half-succeed. Collision on ' + JSON.stringify(carrier));
        assert.ok(collide905.stderr.includes(path.join(collideDir, carrier)),
          '#905: and the refusal names the file it would have written over, so the operator can act on it; got '
          + JSON.stringify(collide905.stderr.slice(0, 300)));
        assert.deepStrictEqual(fs.readdirSync(collideDir), [carrier],
          '#905: NOTHING of this run reached the directory — not one stream, and no temporary residue. A '
          + 'refusal that had already written the other carrier would leave a directory that reads as a '
          + 'complete retention while half of it belongs to the command, and would make its own message '
          + 'untrue. Collision on ' + JSON.stringify(carrier) + '; directory holds '
          + JSON.stringify(fs.readdirSync(collideDir)));
      }

      // CONTROL — one axis. The refusal is caused by the COLLISION, not by the command having touched
      // the retention directory at all: a command that writes a name retention does not use is retained
      // normally. Without this leg, a runner that refused whenever the directory was non-empty at write
      // time would pass the assertions above while making retention unusable for any command that writes
      // beside its own logs.
      const besideDir = path.join(keepBase, 'retained-beside');
      const besideChild = collideChild905(path.join(keepBase, 'beside-child.js'),
        'a-name-retention-does-not-use.txt', besideDir);
      const receiptBeside = path.join(keepBase, 'receipt-beside.json');
      const beside905 = runRun905(['--command', 'node ' + besideChild, '--output', receiptBeside,
        '--keep-output', besideDir]);
      const BESIDE = receipt905(receiptBeside);
      assert.ok(BESIDE, '#905 control: a command writing a NON-colliding name into the retention directory is '
        + 'retained normally; got status=' + beside905.status + ' stderr=' + JSON.stringify(beside905.stderr.slice(0, 300)));
      assert.notStrictEqual(beside905.status, 2,
        '#905 control: and is not refused; got status=' + beside905.status);
      const besideArtifacts = retained905(besideDir);
      assert.ok(carrying905(besideArtifacts, BESIDE.runs[0].stdout_sha256).length >= 1,
        '#905 control: this run\'s own output was retained beside the command\'s file; got '
        + JSON.stringify(besideArtifacts.map(a => a.name)));
      assert.strictEqual(fs.readFileSync(path.join(besideDir, 'a-name-retention-does-not-use.txt'), 'utf8'),
        COLLIDE_ARTEFACT, '#905 control: and the command\'s own file survived that');

      // ── F. two runners, one destination: exactly one proceeds ────────────────────────────────────
      //
      // The destructive shape the pre-flight alone allowed: two runs both pass a stat-then-write check
      // against a fresh destination, and the later one silently destroys the earlier's output with both
      // exiting as though nothing happened. Pinned as the RESULT — one proceeds, one refuses, and the
      // surviving bytes belong to the one that proceeded — because which of the two wins is a race and
      // is not the property under test.
      const { spawn } = require('child_process');
      const raceDir = path.join(keepBase, 'retained-race');
      function raceLeg905(label) {
        const sentinel = path.join(keepBase, 'race-ran-' + label);
        const script = path.join(keepBase, 'race-child-' + label + '.js');
        fs.writeFileSync(script, [
          "'use strict';",
          'require(\'fs\').writeFileSync(' + JSON.stringify(sentinel) + ', \'ran\\n\');',
          // Long enough that the two runs genuinely overlap, so the loser refuses while the winner is
          // still executing — the situation the destructive route needed.
          'const until = Date.now() + 300; while (Date.now() < until) {}',
          "process.stdout.write('KW905_RACE_" + label + " STDOUT\\n');",
          "process.stderr.write('KW905_RACE_" + label + " STDERR\\n');",
          'process.exit(0);',
        ].join('\n'));
        return { label, sentinel, script, receipt: path.join(keepBase, 'receipt-race-' + label + '.json'),
          marker: 'KW905_RACE_' + label };
      }
      const legA = raceLeg905('A');
      const legB = raceLeg905('B');
      function startRun905(leg) {
        return new Promise(resolve => {
          // spawn-class: cli-contract
          const child = spawn(process.execPath, [runnerScript, 'run', '--timeout-minutes', '1',
            '--repo-root', keepRepo, '--command', 'node ' + leg.script, '--output', leg.receipt,
            '--keep-output', raceDir], { cwd: keepRepo });
          let stderr = '';
          child.stderr.on('data', chunk => { stderr += chunk; });
          child.on('close', code => resolve(Object.assign({ code, stderr }, leg)));
        });
      }
      const raceResults = await Promise.all([startRun905(legA), startRun905(legB)]);
      const proceeded = raceResults.filter(leg => leg.code === 0);
      const refused = raceResults.filter(leg => leg.code === 2);
      assert.strictEqual(proceeded.length, 1,
        '#905: of two runs aimed at ONE destination, exactly one proceeds; got exits '
        + JSON.stringify(raceResults.map(leg => [leg.label, leg.code])));
      assert.strictEqual(refused.length, 1,
        '#905: and exactly one is refused — two runs mixing their output into one directory is the state '
        + 'retention has no way to disentangle afterwards; got exits '
        + JSON.stringify(raceResults.map(leg => [leg.label, leg.code])));
      const winner = proceeded[0];
      const loser = refused[0];
      assert.ok(fs.existsSync(winner.receipt),
        '#905: the run that proceeded wrote its receipt (' + winner.label + ')');
      assert.ok(!fs.existsSync(loser.receipt),
        '#905: the refused run wrote nothing at all, receipt included (' + loser.label + ')');
      assert.ok(fs.existsSync(winner.sentinel),
        '#905: the winner ran its command (' + winner.label + ')');
      assert.ok(!fs.existsSync(loser.sentinel),
        '#905: and the loser never STARTED its command — losing the race after a long suite would throw '
        + 'away exactly the run the retention was meant to explain (' + loser.label + ')');
      const raceArtifacts = retained905(raceDir);
      const WINNER = receipt905(winner.receipt);
      assert.ok(carrying905(raceArtifacts, WINNER.runs[0].stdout_sha256).length >= 1,
        '#905: the surviving bytes are THE WINNER\'S, matched against its own receipt; got '
        + JSON.stringify(raceArtifacts.map(a => a.name)));
      assert.ok(!raceArtifacts.some(entry => entry.bytes.includes(loser.marker)),
        '#905: and not one byte of the loser\'s output is in the directory — nothing was destroyed and '
        + 'nothing was mixed; got ' + JSON.stringify(raceArtifacts.map(a => a.name)));

      // ── G. --keep-output names a directory that does not exist YET ───────────────────────────────
      //
      // A deliberate tightening: an existing directory is now a usage error even when it is EMPTY, where
      // an empty one used to be adopted. Adoption is what made the two routes above reachable — it is the
      // difference between "this directory is mine" and "this directory was empty a moment ago" — so the
      // contract is frozen here against being loosened back by accident.
      const existingEmpty = path.join(keepBase, 'retained-existing-empty');
      fs.mkdirSync(existingEmpty);
      const emptySentinel = path.join(keepBase, 'empty-dir-child-ran');
      const contractChild = path.join(keepBase, 'contract-child.js');
      fs.writeFileSync(contractChild, [
        "'use strict';",
        'require(\'fs\').writeFileSync(' + JSON.stringify(emptySentinel) + ', \'ran\\n\');',
        "process.stdout.write('KW905_CONTRACT_STDOUT\\n');",
        "process.stderr.write('KW905_CONTRACT_STDERR\\n');",
        'process.exit(1);',
      ].join('\n'));
      const receiptEmpty = path.join(keepBase, 'receipt-existing-empty.json');
      const empty905 = runRun905(['--command', 'node ' + contractChild, '--output', receiptEmpty,
        '--keep-output', existingEmpty]);
      assert.strictEqual(empty905.status, 2,
        '#905: an EXISTING directory is a usage error even when empty. Adopting one cannot distinguish '
        + '"mine" from "empty a moment ago", which is what let a second runner in; got status='
        + empty905.status + ' stderr=' + JSON.stringify(empty905.stderr.slice(0, 400)));
      assert.ok(!fs.existsSync(emptySentinel),
        '#905: and that refusal, like the others, arrives before the command runs');
      assert.ok(!fs.existsSync(receiptEmpty), '#905: with no receipt written');
      assert.deepStrictEqual(fs.readdirSync(existingEmpty), [],
        '#905: and nothing at all written into the directory it declined');

      // CONTROL — the refusal is about the LEAF already existing, not about a path being deep. A
      // destination whose parents do not exist yet is created and retained normally; without this leg
      // the assertion above is also satisfied by a runner that refuses every path it did not find.
      const nestedLeaf = path.join(keepBase, 'retained-nested', 'deeper', 'leaf');
      const receiptNested = path.join(keepBase, 'receipt-nested.json');
      const nested905 = runRun905(['--command', 'node ' + contractChild, '--output', receiptNested,
        '--keep-output', nestedLeaf]);
      const NESTED = receipt905(receiptNested);
      assert.ok(NESTED,
        '#905 control: a destination whose PARENTS do not exist is created, not refused — the rule is '
        + 'about the leaf; got status=' + nested905.status + ' stderr=' + JSON.stringify(nested905.stderr.slice(0, 300)));
      assert.ok(fs.existsSync(emptySentinel), '#905 control: and the command ran');
      const nestedArtifacts = retained905(nestedLeaf);
      assert.ok(carrying905(nestedArtifacts, NESTED.runs[0].stdout_sha256).length >= 1,
        '#905 control: with its output retained; got ' + JSON.stringify(nestedArtifacts.map(a => a.name)));

      // ── H. the durable archive band is never a retention destination ─────────────────────────────
      //
      // `kaola-workflow/archive/**` holds closed evidence, and the band is TRACKED — a directory that
      // appears there is permanent history, and the closure audit reads a stray one as a phantom project
      // missing its state file, which is drift with nothing to repair. Retention is opt-in precisely so
      // that unredacted child output does not land in permanent history by default; refusing this
      // destination is that same decision expressed at the destination rather than at the flag.
      const bandRun = path.join(keepRepo, 'kaola-workflow', 'archive', 'old-run');
      fs.mkdirSync(bandRun, { recursive: true });
      const bandDir = path.join(bandRun, 'logs');
      const bandSentinel = path.join(keepBase, 'band-child-ran');
      const bandChild = path.join(keepBase, 'band-child.js');
      fs.writeFileSync(bandChild, [
        "'use strict';",
        'require(\'fs\').writeFileSync(' + JSON.stringify(bandSentinel) + ', \'ran\\n\');',
        "process.stdout.write('KW905_BAND_STDOUT\\n');",
        "process.stderr.write('KW905_BAND_STDERR\\n');",
        'process.exit(1);',
      ].join('\n'));
      const receiptBand = path.join(keepBase, 'receipt-band.json');
      const band905 = runRun905(['--command', 'node ' + bandChild, '--output', receiptBand,
        '--keep-output', bandDir]);
      assert.strictEqual(band905.status, 2,
        '#905: a retention destination inside the durable archive band is a usage error; got status='
        + band905.status + ' stderr=' + JSON.stringify(band905.stderr.slice(0, 400)));
      assert.ok(!fs.existsSync(bandSentinel),
        '#905: refused before the command runs, like every other --keep-output refusal');
      assert.ok(!fs.existsSync(receiptBand), '#905: with no receipt written');
      assert.deepStrictEqual(fs.readdirSync(bandRun), [],
        '#905: and NOTHING was created inside the band — an archived run\'s evidence is closed, and a '
        + 'stray directory there is permanent drift the closure audit reads as a phantom project; got '
        + JSON.stringify(fs.readdirSync(bandRun)));

      // CONTROL, one path segment. The refusal is about the ARCHIVE BAND, not about the repository and
      // not about `kaola-workflow/` at large: the same invocation one segment away is retained normally.
      // Without this leg the assertion above is equally satisfied by a runner that refuses any
      // destination under `kaola-workflow/`, or any destination inside a git working tree at all.
      fs.rmSync(bandSentinel, { force: true });
      const besideBandDir = path.join(keepRepo, 'kaola-workflow', 'notarchive', 'old-run', 'logs');
      const receiptBesideBand = path.join(keepBase, 'receipt-beside-band.json');
      const besideBand905 = runRun905(['--command', 'node ' + bandChild, '--output', receiptBesideBand,
        '--keep-output', besideBandDir]);
      const BESIDE_BAND = receipt905(receiptBesideBand);
      assert.ok(BESIDE_BAND,
        '#905 control: a destination under kaola-workflow/ but OUTSIDE the archive band is retained '
        + 'normally — the rule is the band, not the tree; got status=' + besideBand905.status
        + ' stderr=' + JSON.stringify(besideBand905.stderr.slice(0, 300)));
      assert.ok(fs.existsSync(bandSentinel), '#905 control: and the command ran');
      const besideBandArtifacts = retained905(besideBandDir);
      assert.ok(carrying905(besideBandArtifacts, BESIDE_BAND.runs[0].stdout_sha256).length >= 1,
        '#905 control: with its output retained; got ' + JSON.stringify(besideBandArtifacts.map(a => a.name)));
    } finally {
      fs.rmSync(keepBase, { recursive: true, force: true });
    }
  }

  // ── #913: an allowlisted DETERMINISTIC key is REPORTED, never silently discarded ────────────────
  //
  // `buildScrubbedEnvironment` writes HOME, TMPDIR, PATH, LANG, LC_ALL and TZ itself, and then walks
  // the caller's `--env-allowlist` SKIPPING every key it already wrote. The skip is silent: the
  // request and the behaviour disagree, and nothing on any surface says so. It lands on the one flag
  // that is the only in-runner remedy for a tool needing a real HOME — measured live, a `cargo` child
  // dies in ~10ms under the sandboxed HOME because the rustup shim finds no `.rustup`, and
  // `--env-allowlist CARGO_HOME,RUSTUP_HOME` fixes it — so the two keys an operator reaches for FIRST
  // are exactly the two that vanish without a word.
  //
  // The disposition being pinned: the key is REPORTED and does NOT take effect. It cannot take
  // effect. The sandbox HOME/TMPDIR are what hold `command_id` off this particular machine, so a real
  // HOME in the effective environment re-keys the identity per developer and every inherited
  // `{command_id, required_pass_vector_id}` obligation with it. The fix therefore owes the caller a
  // report, not an escape hatch.
  //
  // WHAT IS PINNED IS THE RESULT, and the result is what A CALLER CAN READ. Nothing below names a
  // field, a message, an exit code for the reporting leg, or an internal function: a report is located
  // by searching the whole caller-visible surface of one run — the receipt at any depth, addressed by
  // where it sits, plus stderr — for the exact key. Two places on that surface are EXCLUDED, and the
  // exclusion is the load-bearing part of this block:
  //
  //   • `command_identity.policy.env_allowlist` is the caller's own REQUEST echoed back. It says what
  //     was asked for, never what became of it, and it is byte-identical between a runner that reports
  //     and the one that discards in silence.
  //   • `command_identity.effective_environment[].key` is the environment digest's key column. `HOME`
  //     and `TMPDIR` sit there in EVERY run, allowlist or none.
  //
  // Counting either would make every assertion here green against the defect itself. Measured on the
  // unfixed runner: with both excluded, `--env-allowlist HOME` produces ZERO surface strings naming
  // HOME — that zero is the defect, stated as a number.
  //
  // Five properties, and the last three are controls that must hold BEFORE and AFTER:
  //   1. `--env-allowlist HOME` reports HOME. 2. `--env-allowlist TMPDIR` reports TMPDIR, and the two
  //      together report both. The report VARIES with the request (a constant "HOME and TMPDIR are
  //      deterministic" banner names no particular key and does not identify which one was dropped).
  //   3. CONTROL — a NON-deterministic allowlisted key still crosses, unchanged. `RUSTUP_HOME` is
  //      chosen deliberately: it CONTAINS `HOME`, so a fix that matches by substring rather than by
  //      key would swallow it, and every key assertion here is bound to the whole key for the same
  //      reason.
  //   4. CONTROL — `command_id` and `vector_id` are the same on a machine with a different HOME. This
  //      is the property a "just let it through" fix breaks, and it is why the key cannot take effect.
  //   5. CONTROL — a run passing no `--env-allowlist` at all is untouched: no report, empty stderr, and
  //      the child's environment is exactly what it was.
  //
  // The four byte-identical copies of the runner are already enforced by validate-script-sync.js (row
  // `validation-runner module copies`, first step of both chains); nothing here duplicates that.
  if (process.platform !== 'win32') {
    const base913 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw913-')));
    const repo913 = path.join(base913, 'repo');
    try {
      fs.mkdirSync(repo913);
      git(repo913, ['init', '-q', '-b', 'main']);
      git(repo913, ['config', 'user.email', 't@t.com']);
      git(repo913, ['config', 'user.name', 'Test']);
      git(repo913, ['config', 'commit.gpgsign', 'false']);
      write(repo913, 'src/app.js', 'module.exports = 1;\n');
      git(repo913, ['add', '-A']);
      git(repo913, ['commit', '-q', '-m', 'init']);

      // The child dumps the environment it was ACTUALLY handed, to a file OUTSIDE the repo — inside it
      // the write would move the candidate digest mid-loop and report the probe as `candidate_mutation`.
      // Its stdout is a fixed string and its exit is 0, so two runs of one policy are byte-comparable
      // and `vector_id` is stable across them, which is what makes the determinism leg falsifiable.
      const probe913 = path.join(base913, 'env-probe.js');
      fs.writeFileSync(probe913, [
        "'use strict';",
        "require('fs').writeFileSync(process.argv[2], JSON.stringify(process.env));",
        "process.stdout.write('KW913_PROBE\\n');",
        'process.exit(0);',
      ].join('\n'));

      // Two real, EMPTY home directories. The determinism leg varies the machine's HOME across them and
      // nothing else, and both being empty keeps git's global-config lookup identical in both — so the
      // one axis the leg claims to vary is the only one that varies.
      const homeA913 = path.join(base913, 'home-a');
      const homeB913 = path.join(base913, 'home-b');
      fs.mkdirSync(homeA913);
      fs.mkdirSync(homeB913);
      const CARGO_913 = '/kw913/sentinel/cargo';
      const RUSTUP_913 = '/kw913/sentinel/rustup';
      const LEAK_913 = 'kw913-must-not-cross-the-boundary';
      // Present in the RUNNER's environment on every leg. The two sentinels are what a pass-through
      // proves itself with; the leak is what proves the scrub is still a scrub.
      const sourceEnv913 = { CARGO_HOME: CARGO_913, RUSTUP_HOME: RUSTUP_913, KW913_LEAK: LEAK_913 };

      function runRun913(extra, home) {
        const envOut = path.join(base913, 'child-env.json');
        try { fs.rmSync(envOut, { force: true }); } catch (_) {}
        const receiptOut = path.join(base913, 'receipt-' + runRun913.seq++ + '.json');
        // spawn-class: cli-contract
        const r = spawnSync(process.execPath, [runnerScript, 'run',
          '--timeout-minutes', '1', '--repo-root', repo913,
          '--command', 'node ' + probe913 + ' ' + envOut,
          '--output', receiptOut, ...extra], {
          cwd: repo913, encoding: 'utf8', timeout: 180000,
          env: Object.assign({}, process.env, sourceEnv913, { HOME: home || homeA913 }),
        });
        let receipt = null;
        try { receipt = JSON.parse(fs.readFileSync(receiptOut, 'utf8')); } catch (_) {}
        let childEnv = null;
        try { childEnv = JSON.parse(fs.readFileSync(envOut, 'utf8')); } catch (_) {}
        return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), receipt, childEnv };
      }
      runRun913.seq = 1;

      // The caller's whole readable surface for one run, each string addressed by where it sits. The
      // PATH is searched alongside the value because a report shaped `{ HOME: "ignored" }` carries the
      // key it names as an object key rather than as a string.
      const ECHO_PATHS_913 = [
        /^command_identity\.policy\.env_allowlist(\.|$)/,
        /^command_identity\.effective_environment\.\d+\.key$/,
      ];
      function reports913(leg) {
        const units = [];
        if (leg.receipt !== null && leg.receipt !== undefined) {
          (function walk(node, at) {
            if (node && typeof node === 'object') {
              if (Array.isArray(node)) node.forEach((item, index) => walk(item, at ? at + '.' + index : String(index)));
              else for (const key of Object.keys(node).sort()) walk(node[key], at ? at + '.' + key : key);
              return;
            }
            units.push({ at, text: at + ' = ' + JSON.stringify(node) });
          })(leg.receipt, '');
        }
        const kept = units.filter(unit => !ECHO_PATHS_913.some(skip => skip.test(unit.at)));
        if (String(leg.stderr || '') !== '') kept.push({ at: '<stderr>', text: String(leg.stderr) });
        return kept;
      }
      // Bound to the WHOLE key, never a substring: `HOME` must not match inside `CARGO_HOME` or
      // `RUSTUP_HOME`, or a pass-through would read as a report about HOME and the controls below would
      // certify the fix they exist to falsify.
      function naming913(units, key) {
        const token = new RegExp('(^|[^A-Za-z0-9_])' + key + '([^A-Za-z0-9_]|$)');
        return units.filter(unit => token.test(unit.text));
      }
      function shown913(units) {
        return JSON.stringify(units.map(unit => unit.text).slice(0, 6));
      }

      // ── 1. --env-allowlist HOME ──────────────────────────────────────────────────────────────────
      const homeLeg = runRun913(['--env-allowlist', 'HOME']);
      assert.ok(homeLeg.receipt,
        '#913: `run --env-allowlist HOME` still COMPLETES and writes a receipt. Reporting is not '
        + 'refusing: the flag is how a consumer gets a HOME-needing tool to run at all, so an operator '
        + 'passing HOME alongside the keys that do work must not lose the run; got status='
        + homeLeg.status + ' stderr=' + JSON.stringify(homeLeg.stderr.slice(0, 400)));
      assert.strictEqual(homeLeg.receipt.outcome, 'pass',
        '#913: and the run itself is unaffected; got ' + JSON.stringify(homeLeg.receipt.outcome));
      assert.ok(homeLeg.childEnv, '#913: the probe ran and recorded the environment it was handed');
      const homeReports = naming913(reports913(homeLeg), 'HOME');
      assert.ok(homeReports.length >= 1,
        '#913: `--env-allowlist HOME` must produce a report NAMING HOME on the surface the caller reads '
        + '— the receipt or stderr. The runner writes HOME itself and skips it here, and today it does so '
        + 'in silence: the request and the behaviour disagree and the caller is told nothing, on the only '
        + 'flag that can get a HOME-needing tool through the sandbox. The two places the key already '
        + 'appears (the echo of the request, and the environment digest\'s key column) are excluded '
        + 'because both are byte-identical in a run that reports nothing. Found 0 of them; the surface '
        + 'outside those two holds ' + shown913(reports913(homeLeg)));
      assert.notStrictEqual(homeLeg.childEnv.HOME, homeA913,
        '#913: and the key does NOT take effect — the child keeps the sandbox HOME. Letting the real one '
        + 'through would re-key `command_id` per machine, which is the property the scrub exists to hold; '
        + 'got ' + JSON.stringify(homeLeg.childEnv.HOME));

      // ── 2. --env-allowlist TMPDIR, and the two together ──────────────────────────────────────────
      const tmpdirLeg = runRun913(['--env-allowlist', 'TMPDIR']);
      assert.ok(tmpdirLeg.receipt && tmpdirLeg.childEnv,
        '#913: `run --env-allowlist TMPDIR` completes too; got status=' + tmpdirLeg.status
        + ' stderr=' + JSON.stringify(tmpdirLeg.stderr.slice(0, 400)));
      const tmpdirReports = naming913(reports913(tmpdirLeg), 'TMPDIR');
      assert.ok(tmpdirReports.length >= 1,
        '#913: `--env-allowlist TMPDIR` must produce a report NAMING TMPDIR — the same silent skip, on '
        + 'the second key the runner writes for itself. Found 0; the surface outside the request echo and '
        + 'the digest key column holds ' + shown913(reports913(tmpdirLeg)));
      assert.notStrictEqual(tmpdirLeg.childEnv.TMPDIR, os.tmpdir(),
        '#913: and TMPDIR does not take effect either — the child keeps the sandbox TMPDIR; got '
        + JSON.stringify(tmpdirLeg.childEnv.TMPDIR));

      const bothLeg = runRun913(['--env-allowlist', 'HOME,TMPDIR']);
      assert.ok(bothLeg.receipt, '#913: both keys at once completes; got status=' + bothLeg.status
        + ' stderr=' + JSON.stringify(bothLeg.stderr.slice(0, 400)));
      const bothReports = reports913(bothLeg);
      assert.ok(naming913(bothReports, 'HOME').length >= 1 && naming913(bothReports, 'TMPDIR').length >= 1,
        '#913: passing both keys must report BOTH by name — a caller who asked for two things and got '
        + 'neither is owed two answers, not one. HOME named ' + naming913(bothReports, 'HOME').length
        + 'x, TMPDIR named ' + naming913(bothReports, 'TMPDIR').length + 'x; surface holds '
        + shown913(bothReports));

      // The report IDENTIFIES the key. Without this, a fixed banner listing every key the sandbox owns
      // satisfies all three assertions above while telling the caller nothing about their own request —
      // it names which keys are deterministic, not which of THEIRS was dropped.
      function determinismReportText913(leg) {
        const units = reports913(leg).filter(unit =>
          naming913([unit], 'HOME').length > 0 || naming913([unit], 'TMPDIR').length > 0);
        return JSON.stringify(units.map(unit => unit.text).sort());
      }
      assert.notStrictEqual(determinismReportText913(homeLeg), determinismReportText913(tmpdirLeg),
        '#913: the report must VARY with the request — asking about HOME and asking about TMPDIR cannot '
        + 'produce the same words, or the caller is being told which keys the sandbox owns rather than '
        + 'which of theirs was ignored. HOME leg: ' + determinismReportText913(homeLeg)
        + ' TMPDIR leg: ' + determinismReportText913(tmpdirLeg));

      // ── 3. CONTROL — a non-deterministic allowlisted key still crosses, unchanged ─────────────────
      const noneLeg = runRun913([]);
      assert.ok(noneLeg.receipt && noneLeg.childEnv,
        '#913 control: a run with no --env-allowlist completes; got status=' + noneLeg.status
        + ' stderr=' + JSON.stringify(noneLeg.stderr.slice(0, 400)));
      const passLeg = runRun913(['--env-allowlist', 'CARGO_HOME,RUSTUP_HOME']);
      assert.ok(passLeg.receipt && passLeg.childEnv,
        '#913 control: the pass-through leg completes; got status=' + passLeg.status
        + ' stderr=' + JSON.stringify(passLeg.stderr.slice(0, 400)));
      assert.strictEqual(passLeg.childEnv.CARGO_HOME, CARGO_913,
        '#913 control: an allowlisted NON-deterministic key still reaches the child with its value '
        + 'intact — this is the remedy the flag exists for, and the reporting fix must not narrow it; got '
        + JSON.stringify(passLeg.childEnv.CARGO_HOME));
      assert.strictEqual(passLeg.childEnv.RUSTUP_HOME, RUSTUP_913,
        '#913 control: RUSTUP_HOME too, and it is the adversarial one — it CONTAINS `HOME`, so a fix '
        + 'matching by substring instead of by key would swallow it; got '
        + JSON.stringify(passLeg.childEnv.RUSTUP_HOME));
      const passReports = reports913(passLeg);
      assert.strictEqual(naming913(passReports, 'CARGO_HOME').length + naming913(passReports, 'RUSTUP_HOME').length, 0,
        '#913 control: and neither is reported as ignored — they were not ignored; got '
        + shown913(naming913(passReports, 'CARGO_HOME').concat(naming913(passReports, 'RUSTUP_HOME'))));
      assert.deepStrictEqual(
        Object.keys(passLeg.childEnv).filter(key => key !== 'CARGO_HOME' && key !== 'RUSTUP_HOME').sort(),
        Object.keys(noneLeg.childEnv).sort(),
        '#913 control: allowlisting adds EXACTLY the requested non-deterministic keys and nothing else. '
        + 'The absolute key set is not asserted — the shell and the platform contribute to it — so this '
        + 'compares one allowlisted run against one bare run, which is the difference the flag owns');

      // ── 4. CONTROL — command_id survives a different machine HOME ────────────────────────────────
      //
      // Same policy, same repo, twice, with only the machine's HOME moved. This is what "the key cannot
      // take effect" means as a measurement, and it is what a fix that simply stops skipping breaks.
      const detA = runRun913(['--env-allowlist', 'HOME'], homeA913);
      const detB = runRun913(['--env-allowlist', 'HOME'], homeB913);
      assert.ok(detA.receipt && detB.receipt,
        '#913 control: both determinism legs produced a receipt; got ' + detA.status + '/' + detB.status);
      assert.match(String(detA.receipt.command_id), HEX, '#913 control: the leg produces a command_id');
      assert.strictEqual(detA.receipt.command_id, detB.receipt.command_id,
        '#913: allowlisting HOME must not make `command_id` depend on WHOSE machine ran it. The identity '
        + 'is the whole reason the environment is scrubbed, and an inherited `{command_id, '
        + 'required_pass_vector_id}` obligation is void the moment it moves per developer; got '
        + JSON.stringify(detA.receipt.command_id) + ' vs ' + JSON.stringify(detB.receipt.command_id));
      assert.strictEqual(detA.receipt.vector_id, detB.receipt.vector_id,
        '#913: nor `vector_id` — a report carrying a machine-specific value into the semantic record '
        + 'would move it; got ' + JSON.stringify(detA.receipt.vector_id) + ' vs '
        + JSON.stringify(detB.receipt.vector_id));
      assert.strictEqual(detA.childEnv && detA.childEnv.HOME, detB.childEnv && detB.childEnv.HOME,
        '#913: and the child saw the SAME HOME under both, which is the fact those equalities rest on; got '
        + JSON.stringify(detA.childEnv && detA.childEnv.HOME) + ' vs '
        + JSON.stringify(detB.childEnv && detB.childEnv.HOME));
      // NON-VACUITY: without this, the three equalities above are equally satisfied by a constant.
      const otherLeg = runRun913(['--env-allowlist', 'HOME', '--repetitions', '2']);
      assert.notStrictEqual(otherLeg.receipt && otherLeg.receipt.command_id, detA.receipt.command_id,
        '#913 control: a DIFFERENT policy moves `command_id`; got '
        + JSON.stringify(otherLeg.receipt && otherLeg.receipt.command_id));

      // ── 5. CONTROL — a run that asked for nothing is untouched ───────────────────────────────────
      const noneReports = reports913(noneLeg);
      assert.strictEqual(noneLeg.stderr, '',
        '#913 control: a run passing no --env-allowlist writes NOTHING to stderr — the report is owed to a '
        + 'caller who made a request, and a warning on every run is a new default, not a fix; got '
        + JSON.stringify(noneLeg.stderr.slice(0, 400)));
      assert.strictEqual(noneLeg.status, 0, '#913 control: and exits 0; got ' + noneLeg.status);
      assert.strictEqual(noneLeg.receipt.outcome, 'pass',
        '#913 control: with a passing receipt; got ' + JSON.stringify(noneLeg.receipt.outcome));
      assert.strictEqual(naming913(noneReports, 'HOME').length + naming913(noneReports, 'TMPDIR').length, 0,
        '#913 control: and no report naming HOME or TMPDIR anywhere on its surface. This is the leg that '
        + 'makes the two above mean something: a runner that mentioned the deterministic keys in every '
        + 'receipt would satisfy them while reporting nothing about anyone\'s request; got '
        + shown913(naming913(noneReports, 'HOME').concat(naming913(noneReports, 'TMPDIR'))));
      assert.notStrictEqual(noneLeg.childEnv.HOME, homeA913,
        '#913 control: the child still gets the sandbox HOME; got ' + JSON.stringify(noneLeg.childEnv.HOME));
      assert.notStrictEqual(noneLeg.childEnv.TMPDIR, os.tmpdir(),
        '#913 control: and the sandbox TMPDIR; got ' + JSON.stringify(noneLeg.childEnv.TMPDIR));
      for (const leg of [['none', noneLeg], ['home', homeLeg], ['tmpdir', tmpdirLeg], ['pass-through', passLeg]]) {
        assert.strictEqual(leg[1].childEnv.KW913_LEAK, undefined,
          '#913 control: an unlisted variable never crosses the boundary on the `' + leg[0] + '` leg — the '
          + 'scrub is still a scrub; got ' + JSON.stringify(leg[1].childEnv.KW913_LEAK));
      }
    } finally {
      fs.rmSync(base913, { recursive: true, force: true });
    }
  }

  console.log('test-validation-runner: PASSED');
}

main().catch(error => {
  process.stderr.write((error && error.stack) ? error.stack + '\n' : String(error) + '\n');
  process.exit(1);
});
