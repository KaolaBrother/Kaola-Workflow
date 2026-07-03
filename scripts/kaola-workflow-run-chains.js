#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-run-chains.js (issue #432 — D-432-01)
//
// Machine-verifiable chain receipts. Runs the four test chains via
// child_process (NOT shell pipes — captures real exit codes), writes a
// structured chain receipt to .cache/chain-receipt.json, and exits 0 iff every
// non-waived chain passed.
//
// CONCURRENCY (#529): the four chains are independent OS process trees (separate
// $TMPDIR roots, read-only config — proven race-safe + attribution-preserving in
// #528/D-528-01). On a host with real core headroom they run CONCURRENTLY, cutting
// the four-chain makespan from sum-of-chains (~25-28 min) toward max-of-chains (~the
// slowest single chain, ~12 min). The dispatch is CORE-COUNT-GATED: a constrained
// host (< MIN_CORES_FOR_CONCURRENCY cores — the ≤4-core case D-528-01 could not prove
// safe) falls back to the byte-equivalent SERIAL path. Out-of-order completion is
// re-sorted to canonical KNOWN_CHAINS order before the receipt is written, so
// per-chain attribution + receipt ordering are preserved.
//
// Usage:
//   node kaola-workflow-run-chains.js [options]
//
// Options:
//   --chains <name,...>           Comma-separated chain names to run (default: claude,codex,gitlab,gitea)
//   --accept-known-red <name>:<issue>  Waive a known-failing chain (repeatable)
//   --project <issue-N>           Write the receipt under kaola-workflow/<issue-N>/.cache/chain-receipt.json
//                                 (the plan-dir the validator --finalize-check reads). Resolved against
//                                 the git top-level so it matches whether run from the worktree root or
//                                 the repo root. See --plan for an explicit plan path.
//   --plan <plan-path>            Write the receipt under <dir-of-plan>/.cache/chain-receipt.json — the
//                                 EXACT plan-dir the validator derives from its plan-path argument.
//   --output <path>               Override the receipt output path (default: .cache/chain-receipt.json)
//   --mock-chain <name>:<script>  (for testing) Replace a chain's command with a shell script
//   --json                        Emit a brief summary JSON to stdout after completion
//
// RECEIPT PATH (#546): plan-validator --finalize-check reads the chain receipt from
// <plan-dir>/.cache/chain-receipt.json where plan-dir == path.dirname(<plan-path>). Run from the
// worktree root (the #466 contract), the producer's bare cwd default (.cache/chain-receipt.json)
// lands at the WORKTREE ROOT, not under kaola-workflow/<project>/ — so the gate reads nothing and
// refuses chains_unverified. Pass --project <issue-N> (or --plan <path>) to land the receipt where
// the gate reads it. Precedence when several are given: --output > --plan > --project > cwd default.
//
// Env:
//   KAOLA_RUN_CHAINS_CONCURRENCY  auto (default) | serial | <N>  — pool size for the chain
//                                 dispatch. "auto" gates on core count; "serial"/"1" forces the
//                                 serial fallback; "<N>" forces a pool of N (clamped to chainCount).
//   KAOLA_RUN_CHAINS_TIMEOUT_MS   per-chain timeout in ms (default 1800000 / 30 min, #608 —
//                                 raised from the prior 900000/15min default, #512; a killed
//                                 chain's receipt entry carries `timed_out: true`, see below).
//   KAOLA_RUN_CHAINS_RETRY        max attempts PER CHAIN on a transient-infra fault (default 2 —
//                                 i.e. one retry; #550). Clamped to a >=1 integer; invalid -> default.
//
// RETRY (#550): a chain that exits non-zero is re-run ONLY when its captured output carries a
// POSITIVE transient-infra signature (TLS/handshake/ETIMEDOUT/ECONNRESET/429/EAI_AGAIN/5xx — the
// classifier's exported `isTransientFetchStderr`). A determinate red (non-zero with NO transient
// signature) is NEVER retried (precedence #1: retry must never flip a determinate red to green); a
// 900s timeout kill is non-retryable by default (a 12-min hang re-run doubles makespan for little
// gain). Retry is PER-SPEC inside the concurrent worker, so a transient on one chain never re-runs
// the other three. The receipt records the FINAL attempt's exit code + the attempt count.
//
// Receipt schema (.cache/chain-receipt.json):
//   {
//     "headSha": "<git HEAD sha>",
//     "workTreeHash": "<sha256 of git diff HEAD, or 'clean'>",
//     "codeTreeHash": "<#547: sha256 of the code-relevant landable tree — the freshness key the",
//                      // --finalize-check gate recomputes (replaces the headSha pin: a docs-only /
//                      // workflow-state-only commit no longer forces a re-run). null on git failure.>
//     "validationTestConsumes": ["<#547: the plan's validation_test_consumes band widening, replayed",
//                                // by the gate so it computes the identical band; [] when none.>"],
//     "startedAt": "<ISO timestamp>",
//     "completedAt": "<ISO timestamp>",
//     "chains": [
//       {
//         "name": "claude",
//         "exitCode": 0,
//         "command": "npm run test:kaola-workflow:claude",
//         "duration_ms": 12345,
//         "accepted_red": false,
//         "accepted_red_issue": null,
//         "attempts": 1,                // #550: how many times this chain ran (>1 == a transient retry)
//         "retried_transient": false,   // #550: true iff a transient signature triggered a re-run
//         "timed_out": false            // #608: true iff the FINAL attempt was killed by the per-chain
//                                        // timeout (KAOLA_RUN_CHAINS_TIMEOUT_MS); absent on a legacy
//                                        // receipt predating this field ⇒ treated as false by readers.
//       }
//     ]
//   }
//
// FORGE-NEUTRAL: this file carries no forge-specific CLI tokens and makes no
// forge API calls. The codex plugin copy is byte-identical; the gitlab/gitea
// ports are rename-normalised identical.
//
// SELF-HOST-ONLY (#475): this producer runs the built-in npm edition chains for the
// Kaola-Workflow self-host. A consumer (non-npm) product repo does NOT run it — its
// finalize gate is the agent-recorded `.cache/final-validation.md` evidence, enforced
// by `plan-validator --finalize-check` (consumer mode). The v6.2.0 `kaola-workflow/chains.json`
// consumer escape hatch is retired (Pure option A — no opt-in middle-ground).
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const crypto = require('crypto');
// #550: REUSE the classifier's single transient-infra signature surface (do NOT copy the array — one
// drift surface). isTransientFetchStderr returns true iff captured stdout/stderr carries a known
// transient-infra signature (TLS/handshake/ETIMEDOUT/ECONNRESET/429/EAI_AGAIN/5xx, classifier ~:853).
const { isTransientFetchStderr } = require('./kaola-workflow-classifier.js');

const KNOWN_CHAINS = ['claude', 'codex', 'gitlab', 'gitea'];

const CHAIN_COMMANDS = {
  claude: 'npm run test:kaola-workflow:claude',
  codex:  'npm run test:kaola-workflow:codex',
  gitlab: 'npm run test:kaola-workflow:gitlab',
  gitea:  'npm run test:kaola-workflow:gitea',
};

// Parse a command string into [cmd, ...args] for spawnSync (no shell).
// For `npm run <script>` we use the npm executable directly.
function parseCommand(cmd) {
  const parts = cmd.split(/\s+/).filter(Boolean);
  return parts;
}

// #529: core-count-gated concurrent chain dispatch.
//
// Each chain spawns a subprocess TREE (node -> npm -> walkthrough -> git/finalize/sink),
// so concurrent chains need real core headroom or they oversubscribe and INVERT the win
// (the ≤4-core regime D-528-01 measured). resolveConcurrency returns the dispatch pool
// size (1 == serial). Auto policy: SERIAL below MIN_CORES_FOR_CONCURRENCY cores (the
// constrained-host case D-528-01 could not prove safe — stays on the byte-equivalent
// fallback), else min(chainCount, floor(cores / CORES_PER_CHAIN)).
//
// Env KAOLA_RUN_CHAINS_CONCURRENCY: unset / "auto" -> auto by core count; "serial" / "1"
// -> force serial; "<N>" (positive int) -> force pool size N (clamped to [1, chainCount]).
const MIN_CORES_FOR_CONCURRENCY = 8;
const CORES_PER_CHAIN = 2;
function resolveConcurrency(env, cpuCount, chainCount) {
  const cores = (Number.isFinite(cpuCount) && cpuCount > 0) ? Math.floor(cpuCount) : 1;
  const n = Math.max(1, chainCount || 1);
  const raw = ((env && env.KAOLA_RUN_CHAINS_CONCURRENCY) || '').trim().toLowerCase();
  if (raw === 'serial' || raw === '1') return 1;
  if (raw && raw !== 'auto') {
    const forced = parseInt(raw, 10);
    if (Number.isFinite(forced) && forced > 0) return Math.min(forced, n);
    // any other non-empty value (typo) falls through to auto — never crash the gate.
  }
  if (n <= 1) return 1;                                  // nothing to overlap
  if (cores < MIN_CORES_FOR_CONCURRENCY) return 1;       // constrained host -> serial (D-528-01 safety)
  return Math.min(n, Math.floor(cores / CORES_PER_CHAIN));
}

// Resolve a chain name into a dispatch spec (command + waiver disposition). Shared by the
// serial and concurrent paths so both produce IDENTICAL per-chain result shapes.
function buildSpec(name, ctx) {
  const isMocked = Object.prototype.hasOwnProperty.call(ctx.mocks, name);
  let cmdParts, commandStr;
  if (isMocked) {
    cmdParts = [ctx.mocks[name]];
    commandStr = ctx.mocks[name];
  } else {
    commandStr = ctx.resolvedCommands[name];
    cmdParts = parseCommand(commandStr);
  }
  const isWaived = Object.prototype.hasOwnProperty.call(ctx.waivers, name);
  return {
    name,
    cmdParts,
    // The receipt records the canonical npm command even for a mocked chain (so a mock run's
    // receipt reads like a real run); a mock with no canonical mapping records its own script.
    command: isMocked ? (ctx.resolvedCommands[name] || CHAIN_COMMANDS[name] || commandStr) : commandStr,
    accepted_red: isWaived,
    accepted_red_issue: isWaived ? ctx.waivers[name] : null,
  };
}

// Serial chain run — spawnSync, byte-equivalent to the historical dispatch-loop body.
// #550: capture r.stdout/r.stderr into `_output` (the serial path previously DROPPED them) so the
// retry layer can classify a non-zero exit by transient signature — mirrors runChainAsync's _output.
// spawnSync exposes timeout kills via r.signal (SIGTERM) / r.error.code==='ETIMEDOUT'; surface that
// as `_timedOut` so a timeout stays non-retryable like the concurrent path.
function runChainSync(spec, cwd, timeoutMs) {
  const t0 = Date.now();
  const r = spawnSync(spec.cmdParts[0], spec.cmdParts.slice(1), {
    cwd,
    stdio: 'pipe',
    shell: false,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const duration_ms = Date.now() - t0;
  const exitCode = (r.status != null) ? r.status : (r.error ? 1 : 0);
  const timedOut = !!(r.signal === 'SIGTERM' || (r.error && r.error.code === 'ETIMEDOUT'));
  return {
    name: spec.name,
    exitCode,
    command: spec.command,
    duration_ms,
    accepted_red: spec.accepted_red,
    accepted_red_issue: spec.accepted_red_issue,
    _output: String(r.stdout || '') + String(r.stderr || '') + (r.error ? ('\n' + String((r.error && r.error.message) || r.error)) : ''),
    _timedOut: timedOut,
  };
}

// #550: re-run a SINGLE chain ONLY on a POSITIVE transient-infra signature, up to maxAttempts.
// `runOne(spec, cwd, timeoutMs)` is either runChainSync (sync) or runChainAsync (Promise); `await`
// handles both uniformly. Returns the LAST attempt's result, augmented with `attempts` and
// `retried_transient`. PRECEDENCE #1 (accuracy): a determinate red — exitCode!==0 with NO transient
// signature in _output — is NEVER retried; a timeout kill (_timedOut) is non-retryable by default.
// Retry therefore can never flip a determinate red to green; a still-red-after-retry chain stays red.
async function runChainWithRetry(spec, cwd, timeoutMs, runOne, maxAttempts) {
  const max = Math.max(1, maxAttempts | 0);
  let attempt = 0;
  let result;
  let retried = false;
  for (;;) {
    attempt++;
    result = await runOne(spec, cwd, timeoutMs);
    if (result.exitCode === 0) break;                       // green — done
    const retryable = attempt < max
      && !result._timedOut                                  // a timeout kill is non-retryable
      && isTransientFetchStderr(result._output);            // POSITIVE transient signature required
    if (!retryable) break;                                  // determinate red OR budget exhausted
    retried = true;
    await delayMs(retryBackoffMs(attempt));                 // small backoff before re-running THIS spec
  }
  result.attempts = attempt;
  result.retried_transient = retried;
  return result;
}

// #550: small fixed-ish backoff between transient retries (linear by attempt). Kept tiny so the gate
// is not slowed materially; bounded so a flapping host doesn't stall. Async (Promise) so it composes
// inside both the serial map and the concurrent worker (the worker is already async).
function retryBackoffMs(attempt) {
  return Math.min(2000, 250 * Math.max(1, attempt));
}
function delayMs(ms) {
  return new Promise((resolve) => { if (ms <= 0) resolve(); else setTimeout(resolve, ms); });
}

// Concurrent chain run — async spawn with per-child env copy + drained, buffered stdio
// (draining is REQUIRED: an undrained pipe deadlocks a chatty child once its buffer fills).
// spawn() has no `timeout` option, so the 900s per-chain bound is a manual setTimeout -> kill.
// exitCode mirrors spawnSync: timeout/error -> 1; a clean exit uses the child's code.
function runChainAsync(spec, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const base = {
      name: spec.name,
      command: spec.command,
      accepted_red: spec.accepted_red,
      accepted_red_issue: spec.accepted_red_issue,
    };
    let child;
    try {
      child = spawn(spec.cmdParts[0], spec.cmdParts.slice(1), {
        cwd,
        stdio: 'pipe',
        shell: false,
        env: { ...process.env },   // isolated copy per child
      });
    } catch (e) {
      resolve(Object.assign({}, base, { exitCode: 1, duration_ms: Date.now() - t0, _output: 'spawn threw: ' + String((e && e.message) || e) }));
      return;
    }
    const outBufs = [];
    if (child.stdout) child.stdout.on('data', (d) => outBufs.push(d));
    if (child.stderr) child.stderr.on('data', (d) => outBufs.push(d));
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch (_) {} }, timeoutMs);
    const done = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    // 'error' (e.g. ENOENT) may fire WITHOUT 'close' — resolve from whichever lands first.
    child.on('error', (err) => done(Object.assign({}, base, {
      exitCode: 1, duration_ms: Date.now() - t0, _output: 'spawn error: ' + String((err && err.message) || err),
    })));
    child.on('close', (code) => done(Object.assign({}, base, {
      exitCode: timedOut ? 1 : ((code != null) ? code : 0),
      duration_ms: Date.now() - t0,
      _output: Buffer.concat(outBufs).toString('utf8'),
      _timedOut: timedOut,
    })));
  });
}

// Bounded concurrent pool over `specs`. Each of `concurrency` workers drains a shared
// index; results are collected out-of-order then RE-SORTED to `specs` order (== the
// canonical KNOWN_CHAINS-filtered order) so the receipt is deterministic.
// #550: the worker wraps runChainAsync in runChainWithRetry so a transient retry stays PER-SPEC —
// a transient on one chain re-runs ONLY that chain, never the other three.
async function runConcurrent(specs, cwd, timeoutMs, concurrency, maxAttempts) {
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < specs.length) {
      const spec = specs[next++];
      results.set(spec.name, await runChainWithRetry(spec, cwd, timeoutMs, runChainAsync, maxAttempts));
    }
  }
  const pool = Math.max(1, Math.min(concurrency, specs.length));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return specs.map((s) => results.get(s.name));   // canonical-order re-sort
}

// #546: resolve the git top-level so a --project receipt lands at the SAME absolute path whether
// run-chains is invoked from the worktree root (the #466 contract) or the repo root. Mirrors the
// validator's `git -C <cwd> rev-parse --show-toplevel` discriminator; falls back to cwd when git
// cannot resolve it (e.g. not a checkout) so the flag still produces a deterministic path.
function getGitTopLevel(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || r.error) return cwd;
  return r.stdout.trim() || cwd;
}

// #546: resolve the receipt output path from the parsed flags, honoring precedence
// --output > --plan > --project > cwd default. --project <issue-N> -> the plan-dir
// kaola-workflow/<issue-N>/.cache (resolved against the git top-level); --plan <path> -> the EXACT
// plan-dir the validator derives (path.dirname(<plan-path>))/.cache. The validator reads
// <plan-dir>/.cache/chain-receipt.json, so both flags land the receipt where the gate looks.
function resolveOutputPath(opts, cwd) {
  if (opts.output != null) return path.resolve(cwd, opts.output);
  if (opts.plan != null) {
    return path.join(path.dirname(path.resolve(cwd, opts.plan)), '.cache', 'chain-receipt.json');
  }
  if (opts.project != null) {
    return path.join(getGitTopLevel(cwd), 'kaola-workflow', opts.project, '.cache', 'chain-receipt.json');
  }
  return path.join(cwd, '.cache', 'chain-receipt.json');
}

// Resolve the HEAD sha in the current working directory.
function getHeadSha(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || r.error) return 'unknown';
  return r.stdout.trim();
}

// Compute a hash of `git diff HEAD` output. Returns 'clean' when the diff is empty.
function getWorkTreeHash(cwd) {
  const r = spawnSync('git', ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  const diff = (r.status === 0 && !r.error) ? (r.stdout || '') : '';
  if (diff.length === 0) return 'clean';
  return crypto.createHash('sha256').update(diff).digest('hex');
}

// #475 (supersedes the #464 consumer escape hatch): run-chains.js is now SELF-HOST-only.
// The v6.2.0 per-repo `kaola-workflow/chains.json` consumer contract is RETIRED — there is no
// opt-in middle-ground (Pure option A). A consumer (non-npm) product repo no longer authors
// chains.json + re-runs a suite to produce a chain receipt; its finalize gate is the agent's
// recorded `.cache/final-validation.md` evidence ("Agent Owns Reasoning; Scripts Own Atomicity",
// #44), enforced by `plan-validator --finalize-check` in consumer mode. resolveChains therefore
// resolves ONLY the built-in npm edition chains for the KNOWN_CHAINS whose `test:kaola-workflow:<name>`
// script is declared in package.json (the self-host); otherwise a typed `chains_config_missing`
// refusal (a consumer repo simply never runs this producer).
function readJsonOr(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return dflt; }
}
function resolveChains(cwd) {
  const pkg = readJsonOr(path.join(cwd, 'package.json'), null);
  const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
  const npmNames = KNOWN_CHAINS.filter(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  if (npmNames.length) {
    const commands = {};
    for (const n of npmNames) commands[n] = CHAIN_COMMANDS[n];
    return { source: 'npm-default', commands, names: npmNames };
  }
  return {
    error: 'chains_config_missing',
    detail: 'package.json declares no test:kaola-workflow:* scripts — this repo cannot run the npm edition chains. A consumer (non-npm) repo gates finalize on the agent-recorded .cache/final-validation.md (#475), not a chain receipt.',
  };
}

async function main(argv) {
  const args = argv.slice(2);

  let requestedChains = null; // null = run all resolved chains (config or npm-default)
  // #546: collect the receipt-path flags; resolve AFTER parsing so precedence (--output > --plan >
  // --project > cwd default) holds regardless of argument order.
  const pathOpts = { output: null, plan: null, project: null };
  const waivers = {};   // name -> issue token
  const mocks = {};     // name -> shell script path (test hook)
  let asJson = false;

  // Parse arguments.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--chains') {
      const val = args[++i];
      if (!val) {
        process.stderr.write('run-chains: --chains requires a value\n');
        return 1;
      }
      requestedChains = val.split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--accept-known-red') {
      const val = args[++i];
      if (!val || !val.includes(':')) {
        process.stderr.write(
          'run-chains: --accept-known-red requires format <name>:<issue-number> (colon-separated)\n' +
          '  example: --accept-known-red codex:234\n'
        );
        return 1;
      }
      const colonIdx = val.indexOf(':');
      const name = val.slice(0, colonIdx).trim();
      const issue = val.slice(colonIdx + 1).trim();
      if (!name || !issue) {
        process.stderr.write(
          'run-chains: --accept-known-red: both <name> and <issue-number> must be non-empty\n' +
          '  got: ' + JSON.stringify(val) + '\n'
        );
        return 1;
      }
      // Chain-name validity is checked AFTER chain resolution (against the resolved npm-default
      // edition names + any --mock-chain name), not against a hardcoded list.
      waivers[name] = issue;
    } else if (a === '--output') {
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --output requires a path\n'); return 1; }
      pathOpts.output = val;
    } else if (a === '--project') {
      // #546: write the receipt under kaola-workflow/<issue-N>/.cache (the validator's plan-dir).
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --project requires a value (e.g. issue-546)\n'); return 1; }
      pathOpts.project = val;
    } else if (a === '--plan') {
      // #546: write the receipt under <dir-of-plan>/.cache (the EXACT plan-dir the validator derives).
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --plan requires a plan-file path\n'); return 1; }
      pathOpts.plan = val;
    } else if (a === '--mock-chain') {
      const val = args[++i];
      if (!val || !val.includes(':')) {
        process.stderr.write('run-chains: --mock-chain requires format <name>:<script-path>\n');
        return 1;
      }
      const colonIdx = val.indexOf(':');
      mocks[val.slice(0, colonIdx)] = val.slice(colonIdx + 1);
    } else if (a === '--json') {
      asJson = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: kaola-workflow-run-chains.js [--chains name,...] [--accept-known-red name:issue ...]\n' +
        '                                    [--project issue-N | --plan plan-path | --output path] [--json]\n' +
        '\n' +
        'Runs the four test chains (claude, codex, gitlab, gitea) and writes a chain receipt.\n' +
        'Exit 0 when all non-waived chains pass; non-zero otherwise.\n' +
        '\n' +
        'Receipt path (#546): plan-validator --finalize-check reads <plan-dir>/.cache/chain-receipt.json.\n' +
        '  --project issue-N  -> kaola-workflow/issue-N/.cache/chain-receipt.json (resolved at the git top-level)\n' +
        '  --plan plan-path   -> <dir-of-plan>/.cache/chain-receipt.json (the exact plan-dir the validator derives)\n' +
        '  --output path      -> explicit override; default is <cwd>/.cache/chain-receipt.json\n' +
        'Precedence: --output > --plan > --project > cwd default.\n' +
        '\n' +
        'On a host with core headroom the chains run CONCURRENTLY (max-of-chains makespan);\n' +
        'a constrained host falls back to serial. Override with KAOLA_RUN_CHAINS_CONCURRENCY\n' +
        '(auto | serial | <N>).\n'
      );
      return 0;
    } else {
      process.stderr.write('run-chains: unknown argument: ' + a + '\n');
      return 1;
    }
  }

  const cwd = process.cwd();
  // #546: resolve the receipt path now that cwd is known + all flags are parsed.
  const outputPath = resolveOutputPath(pathOpts, cwd);

  // #475: resolve the npm edition chain set for this repo (npm-default > chains_config_missing refuse).
  // The chains.json repo-config tier is retired (consumer repos gate on final-validation.md).
  // `--mock-chain` (a test hook) supplies a command for a name directly, so a mocked name is
  // available even when no config/npm exists — the refusal only fires when there is nothing to run.
  const resolved = resolveChains(cwd);
  const mockNames = Object.keys(mocks);
  if (resolved.error && mockNames.length === 0) {
    // #475: run-chains.js is self-host-only. A consumer (non-npm) repo does NOT run this producer —
    // its finalize gate is the agent-recorded .cache/final-validation.md, enforced by
    // plan-validator --finalize-check in consumer mode. So the only refusal is chains_config_missing
    // (this repo declares no edition test scripts), and the hint points at the consumer contract.
    const hint = 'This repo declares no test:kaola-workflow:* scripts, so it cannot run the npm edition chains. Only the Kaola-Workflow self-host runs these; a consumer (non-npm) repo does NOT run run-chains.js — finalize gates on the agent-recorded .cache/final-validation.md (#475).';
    if (asJson) {
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: resolved.error, operator_hint: hint, errors: [resolved.detail] }) + '\n');
    } else {
      process.stderr.write('run-chains: ' + resolved.error + ' — ' + resolved.detail + '\n  ' + hint + '\n');
    }
    return 1; // typed refusal, no receipt (a non-npm repo gets no misleading 4-red receipt)
  }
  const resolvedCommands = resolved.commands || {};
  const availableNames = [...new Set([...(resolved.names || []), ...mockNames])];
  const chainSource = resolved.error ? 'mock' : resolved.source;

  // Effective chain list: the requested subset (if any) else every resolved chain.
  const chains = requestedChains != null ? requestedChains : [...availableNames];

  // Refuse an EMPTY effective chain set with NO receipt. Otherwise a zero-chain run would
  // write a `chains: []` receipt, and the name-agnostic finalize-check gate (which only filters
  // for red chains) would PASS it — a zero-chains-verified finalization. Reachable via
  // `--chains ","` (splits/filters to []) or a config that resolves to nothing.
  if (chains.length === 0) {
    if (asJson) {
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'no_chains', operator_hint: 'No chains to run. Pass --chains with at least one valid edition chain name (a declared `test:kaola-workflow:*` script). A consumer (non-npm) repo does not run chains — finalize gates on the agent-recorded .cache/final-validation.md (#475).' }) + '\n');
    } else {
      process.stderr.write('run-chains: no chains to run — the resolved/requested chain set is empty\n');
    }
    return 1; // no receipt — never write an empty-chains receipt that would pass the gate
  }

  // Validate requested chain names against the RESOLVED set (not a hardcoded list).
  for (const name of chains) {
    if (!availableNames.includes(name)) {
      process.stderr.write(
        'run-chains: unknown chain name ' + JSON.stringify(name) +
        ' (available in this repo [' + chainSource + ']: ' + availableNames.join(', ') + ')\n'
      );
      return 1;
    }
  }
  // Validate waiver names against the resolved set too.
  for (const name of Object.keys(waivers)) {
    if (!availableNames.includes(name)) {
      process.stderr.write(
        'run-chains: --accept-known-red: unknown chain name ' + JSON.stringify(name) +
        ' (available in this repo [' + chainSource + ']: ' + availableNames.join(', ') + ')\n'
      );
      return 1;
    }
  }

  const startedAt = new Date().toISOString();
  const headSha = getHeadSha(cwd);
  const workTreeHash = getWorkTreeHash(cwd);
  // #547 (D-547-01): the code-relevant-tree content hash — the chain-receipt freshness key the
  // plan-validator --finalize-check gate recomputes. Computed via the SAME exported helper the gate
  // calls (require, like next-action.js) so producer and gate never disagree. The plan's optional
  // `validation_test_consumes` band widening is read from the frozen plan and RECORDED in the receipt
  // so the gate replays the IDENTICAL band. Any failure → null/[] → the gate falls back to the headSha
  // pin (fail-closed). Self-host-only, so the require is reached only on the Kaola-Workflow repo.
  const planValidator = require('./kaola-workflow-plan-validator.js');
  const gitTop = getGitTopLevel(cwd);
  let validationTestConsumes = [];
  try {
    let planContent = null;
    if (pathOpts.plan) planContent = fs.readFileSync(pathOpts.plan, 'utf8');
    else if (pathOpts.project) planContent = fs.readFileSync(path.join(gitTop, 'kaola-workflow', pathOpts.project, 'workflow-plan.md'), 'utf8');
    if (planContent) validationTestConsumes = planValidator.parseValidationTestConsumes(planContent);
  } catch (_) { validationTestConsumes = []; }
  const codeTreeHash = planValidator.computeCodeTreeHash(gitTop, pathOpts.project || null, validationTestConsumes);

  // Ensure .cache directory exists before running chains.
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // Build per-chain dispatch specs in canonical (chains == KNOWN_CHAINS-filtered) order.
  const ctx = { mocks, waivers, resolvedCommands };
  const specs = chains.map((name) => buildSpec(name, ctx));
  const timeoutMs = resolveTimeoutMs(process.env);
  // #550: per-chain transient-retry budget (default 2 == one retry). Both dispatch paths wrap their
  // single-run primitive in runChainWithRetry so a transient-infra fault re-runs ONLY that chain.
  const maxAttempts = resolveChainRetry(process.env);

  // #529: core-count-gated serial-vs-concurrent dispatch. concurrency <= 1 -> the
  // byte-equivalent serial fallback; > 1 -> a bounded concurrent pool, results re-sorted
  // to canonical order. Both paths produce identical per-chain result shapes.
  const concurrency = resolveConcurrency(process.env, os.cpus().length, specs.length);

  let dispatchResults;
  if (concurrency <= 1) {
    // Serial: run each chain in canonical order, retrying only the current spec on a transient fault
    // before advancing (await keeps the sequential ordering of the byte-equivalent serial path).
    dispatchResults = [];
    for (const spec of specs) {
      dispatchResults.push(await runChainWithRetry(spec, cwd, timeoutMs, runChainSync, maxAttempts));
    }
  } else {
    dispatchResults = await runConcurrent(specs, cwd, timeoutMs, concurrency, maxAttempts);
    // Concurrent runs are not watchable live — surface each FAILED chain's captured output
    // so a failure is debuggable from the run-chains output alone.
    for (const ch of dispatchResults) {
      if (ch.exitCode !== 0 && ch._output) {
        process.stderr.write(
          '\n===== chain "' + ch.name + '" failed (exit ' + ch.exitCode +
          (ch._timedOut ? ', TIMED OUT' : '') + ') =====\n' + ch._output + '\n'
        );
      }
    }
  }

  // Strip the internal _output field (kept as _timedOut is PROMOTED below). #550: the receipt
  // additively records `attempts` (the FINAL attempt's exitCode is the chain verdict) and
  // `retried_transient`. #608: `timed_out` promotes the internal _timedOut marker so a receipt
  // reader (the plan-validator finalize gate, an operator) can distinguish a timeout kill from a
  // genuine test failure without re-running anything. Readers index by name/exitCode/accepted_red
  // (plan-validator --finalize-check, #522 schema test), so these are backward-compatible additions.
  const chainResults = dispatchResults.map((ch) => ({
    name: ch.name,
    exitCode: ch.exitCode,
    command: ch.command,
    duration_ms: ch.duration_ms,
    accepted_red: ch.accepted_red,
    accepted_red_issue: ch.accepted_red_issue,
    attempts: (typeof ch.attempts === 'number' && ch.attempts >= 1) ? ch.attempts : 1,
    retried_transient: ch.retried_transient === true,
    timed_out: ch._timedOut === true,
  }));

  const completedAt = new Date().toISOString();

  const receipt = {
    headSha,
    workTreeHash,
    codeTreeHash,
    validationTestConsumes,
    startedAt,
    completedAt,
    source: chainSource,
    chains: chainResults,
  };

  // Write receipt (always — a red receipt is still a record).
  fs.writeFileSync(outputPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  // Determine exit code: 0 iff all non-waived chains passed.
  const failed = chainResults.filter(ch => ch.exitCode !== 0 && !ch.accepted_red);
  const overallExitCode = failed.length > 0 ? 1 : 0;

  if (asJson) {
    process.stdout.write(JSON.stringify({
      result: overallExitCode === 0 ? 'pass' : 'fail',
      failed: failed.map(ch => ch.name),
      receipt: outputPath,
    }) + '\n');
  } else if (overallExitCode !== 0) {
    // #608: label a TIMED-OUT chain distinctly from a determinate red in the failure summary line
    // itself, naming the remedy env var — an operator scanning stderr (not the JSON receipt) can
    // tell "raise the timeout" from "fix the test" at a glance.
    const label = (ch) => ch.name + (ch.timed_out
      ? ' (TIMEOUT at ' + Math.round(timeoutMs / 1000) + 's — raise KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)'
      : '');
    process.stderr.write(
      'run-chains: ' + failed.length + ' chain(s) failed: ' + failed.map(label).join(', ') + '\n'
    );
  }

  return overallExitCode;
}

// #512/#608: per-chain spawnSync/spawn timeout — overridable so a passing-but-slow chain is
// captured, not killed. Default raised to 1800000 (30 min) from the prior 900000 (15 min, #512),
// which was itself raised from a hardcoded 600000: live runs on a constrained host exceeded 900s
// (a red receipt at exactly the old bound, indistinguishable from a genuine failure without
// re-reading the run) — the receipt's `timed_out` field (see the schema comment above) now
// surfaces that distinction directly, and the failure summary names this env var as the remedy.
function resolveTimeoutMs(env) {
  const v = parseInt((env && env.KAOLA_RUN_CHAINS_TIMEOUT_MS) || '', 10);
  return (Number.isFinite(v) && v > 0) ? v : 1800000;
}

// #550: max attempts PER CHAIN on a transient-infra fault (default 2 == one retry). Mirrors the
// resolveTimeoutMs/resolveConcurrency env-resolver style. Clamped to a sane >=1 integer; any invalid
// value (non-numeric / <1) falls back to the default so a typo never disables the gate or loops.
function resolveChainRetry(env) {
  const v = parseInt((env && env.KAOLA_RUN_CHAINS_RETRY) || '', 10);
  return (Number.isFinite(v) && v >= 1) ? v : 2;
}

if (require.main === module) {
  main(process.argv).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write('run-chains: fatal: ' + ((err && err.stack) || err) + '\n'); process.exit(1); }
  );
}

module.exports = { main, KNOWN_CHAINS, CHAIN_COMMANDS, resolveChains, resolveTimeoutMs, resolveConcurrency, resolveChainRetry, runChainWithRetry, runChainSync, runChainAsync, resolveOutputPath, getGitTopLevel };
