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

  console.log('test-validation-runner: PASSED');
}

main().catch(error => {
  process.stderr.write((error && error.stack) ? error.stack + '\n' : String(error) + '\n');
  process.exit(1);
});
