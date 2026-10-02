'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const out = __dirname;
const snapshot = path.join(out, 'frozen-source', 'provider-fe7e4443a8c367cfc111c65755191ae6790e810e');
const sinkPath = path.join(snapshot, 'scripts', 'kaola-workflow-sink-pr.js');
const fixture = path.join(out, 'fixtures', 'baseline-current-route');
const fixtureHome = path.join(fixture, 'isolated-home');
const project = 'issue-143';
const branch = 'workflow/issue-143';
const issue = 143;
const refusal = 'Keep-open is merge-sink-only';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeRaw(name, value) {
  fs.writeFileSync(path.join(out, name), value);
}

function git(args) {
  return spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
}

function resultOf(args) {
  return {
    status: args.status,
    stdout: args.stdout || '',
    stderr: args.stderr || '',
  };
}

function hashOrMissing(file) {
  return fs.existsSync(file) ? sha256File(file) : 'missing';
}

function requireOk(result, label) {
  assert.strictEqual(result.status, 0, label + ' failed: ' + result.stderr);
}

assert(fs.existsSync(sinkPath), 'frozen sink-pr source is missing');
const sinkSource = fs.readFileSync(sinkPath, 'utf8');
const sink = require(sinkPath);
const parseArgs = sink.parseArgs([
  '--project', project,
  '--branch', branch,
  '--issue', String(issue),
]);
assert.deepStrictEqual(parseArgs, { project, branch, issue });
const closeBody = sink.closesBody(sink.resolveMemberSet({ issue }, path.join(out, 'absent-state.md')));
assert.strictEqual(closeBody, 'Closes #143');

const guardStart = sinkSource.indexOf('const keepOpenRe = /^issue_action:');
const offlineStart = sinkSource.indexOf('if (OFFLINE)', guardStart);
assert(guardStart >= 0, 'baseline source no longer has the explicit comment_keep_open refusal');
assert(offlineStart > guardStart, 'baseline refusal is no longer before its OFFLINE return');
assert(/merge-sink-only/.test(sinkSource.slice(guardStart, offlineStart)),
  'baseline source refusal no longer identifies its merge-sink-only policy');

fs.rmSync(fixture, { recursive: true, force: true });
fs.mkdirSync(fixture, { recursive: true });
const init = spawnSync('git', ['init', '--quiet'], { cwd: fixture, encoding: 'utf8' });
writeRaw('baseline-fixture-git-init.stdout.raw', init.stdout || '');
writeRaw('baseline-fixture-git-init.stderr.raw', init.stderr || '');
writeRaw('baseline-fixture-git-init.exit', String(init.status) + '\n');
requireOk(init, 'git init in isolated fixture');

const stateFile = path.join(fixture, 'kaola-workflow', project, 'workflow-state.md');
const summaryFile = path.join(fixture, 'kaola-workflow', project, 'finalization-summary.md');
const configFile = path.join(fixtureHome, '.config', 'kaola-workflow', 'config.json');
const binDir = path.join(fixture, 'bin');
const ghLog = path.join(fixture, 'gh-argv.jsonl');
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(stateFile,
  'status: active\nissue_number: 143\nrepository: https://github.com/KaolaBrother/VRPCadCore.git\n' +
  'branch: workflow/issue-143\n\n## Sink\nsink: pr\nissue_action: comment_keep_open\n');
fs.writeFileSync(summaryFile, '# Finalization fixture\n');
fs.writeFileSync(configFile, JSON.stringify({ pr_auto_merge: true }, null, 2) + '\n');
fs.writeFileSync(ghLog, '');
fs.writeFileSync(path.join(binDir, 'gh'),
  '#!/usr/bin/env node\n' +
  "require('fs').appendFileSync(process.env.KW1113_GH_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n" +
  "process.stdout.write('{}\\n');\n");
fs.chmodSync(path.join(binDir, 'gh'), 0o755);

const indexFile = path.join(fixture, '.git', 'index');
const beforeStatus = git(['status', '--short']);
const beforeHead = git(['rev-parse', '--verify', 'HEAD']);
const before = {
  state_sha256: sha256File(stateFile),
  config_sha256: sha256File(configFile),
  git_status: resultOf(beforeStatus),
  head: resultOf(beforeHead),
  index_sha256: hashOrMissing(indexFile),
};

const commandArgs = [sinkPath, '--project', project, '--branch', branch, '--issue', String(issue)];
const childEnv = { ...process.env };
delete childEnv.GH_TOKEN;
delete childEnv.GITHUB_TOKEN;
delete childEnv.GIT_ASKPASS;
childEnv.KAOLA_WORKFLOW_OFFLINE = '1';
childEnv.KW1113_FIXTURE_HOME = fixtureHome;
childEnv.KW1113_GH_LOG = ghLog;
childEnv.NODE_OPTIONS = '--require=' + path.join(out, 'fixture-home-preload.js');
childEnv.PATH = binDir + path.delimiter + (process.env.PATH || '');
childEnv.GIT_TERMINAL_PROMPT = '0';

const child = spawnSync(process.execPath, commandArgs, {
  cwd: fixture,
  env: childEnv,
  encoding: 'utf8',
  timeout: 15000,
});
writeRaw('baseline-cli.stdout.raw', child.stdout || '');
writeRaw('baseline-cli.stderr.raw', child.stderr || '');
writeRaw('baseline-cli.exit', String(child.status) + '\n');

const afterStatus = git(['status', '--short']);
const afterHead = git(['rev-parse', '--verify', 'HEAD']);
const after = {
  state_sha256: sha256File(stateFile),
  config_sha256: sha256File(configFile),
  git_status: resultOf(afterStatus),
  head: resultOf(afterHead),
  index_sha256: hashOrMissing(indexFile),
  gh_argv: fs.readFileSync(ghLog, 'utf8'),
};

assert.strictEqual(child.status, 1, 'baseline sink-pr should refuse the explicit keep-open state');
assert((child.stderr || '').includes(refusal), 'baseline stderr must contain the source-grounded refusal');
assert.strictEqual(child.stdout || '', '', 'the refused baseline route must not emit a request receipt');
assert.strictEqual(after.state_sha256, before.state_sha256, 'refusal must preserve the state fixture');
assert.strictEqual(after.config_sha256, before.config_sha256, 'refusal must preserve isolated config');
assert.strictEqual(after.git_status.stdout, before.git_status.stdout, 'refusal must leave fixture status unchanged');
assert.strictEqual(after.head.status, before.head.status, 'refusal must not create a main commit');
assert.strictEqual(after.index_sha256, before.index_sha256, 'refusal must not mutate the index');
assert.strictEqual(after.gh_argv, '', 'OFFLINE baseline refusal must make no gh operation');

const receipt = {
  frozen_source_commit: 'fe7e4443a8c367cfc111c65755191ae6790e810e',
  parser_arguments: commandArgs.slice(1),
  parser_result: parseArgs,
  default_close_body: closeBody,
  source_guard_offset: guardStart,
  offline_branch_offset: offlineStart,
  classification: 'UNSUPPORTED_BASELINE: current explicit comment_keep_open state is refused before OFFLINE handling; current close-mode body closes #143',
  command: { executable: process.execPath, args: commandArgs, cwd: fixture, offline: true },
  command_exit: child.status,
  refusal_text: (child.stderr || '').trim(),
  before,
  after,
  fixture_has_git_commit: before.head.status === 0,
  fixture_has_worktree: false,
  no_forge_calls: after.gh_argv === '',
};
writeRaw('baseline-source-capabilities.json', JSON.stringify(receipt, null, 2) + '\n');
console.log('baseline: UNSUPPORTED_CURRENT_ROUTE (source-grounded explicit refusal; no guessed option)');
console.log('baseline-cli: exit 1; expected refusal; no gh calls; fixture state/index unchanged');
