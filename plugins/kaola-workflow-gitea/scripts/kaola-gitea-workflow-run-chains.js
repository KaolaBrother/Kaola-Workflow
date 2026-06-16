#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-run-chains.js (issue #432 — D-432-01)
//
// Machine-verifiable chain receipts. Runs the four test chains via
// child_process.spawnSync (NOT shell pipes — captures real exit codes), writes
// a structured chain receipt to .cache/chain-receipt.json, and exits 0 iff
// every non-waived chain passed.
//
// Usage:
//   node kaola-gitea-workflow-run-chains.js [options]
//
// Options:
//   --chains <name,...>           Comma-separated chain names to run (default: claude,codex,gitlab,gitea)
//   --accept-known-red <name>:<issue>  Waive a known-failing chain (repeatable)
//   --output <path>               Override the receipt output path (default: .cache/chain-receipt.json)
//   --mock-chain <name>:<script>  (for testing) Replace a chain's command with a shell script
//   --json                        Emit a brief summary JSON to stdout after completion
//
// Receipt schema (.cache/chain-receipt.json):
//   {
//     "headSha": "<git HEAD sha>",
//     "workTreeHash": "<sha256 of git diff HEAD, or 'clean'>",
//     "startedAt": "<ISO timestamp>",
//     "completedAt": "<ISO timestamp>",
//     "chains": [
//       {
//         "name": "claude",
//         "exitCode": 0,
//         "command": "npm run test:kaola-workflow:claude",
//         "duration_ms": 12345,
//         "accepted_red": false,
//         "accepted_red_issue": null
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
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

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

function main(argv) {
  const args = argv.slice(2);

  let requestedChains = null; // null = run all resolved chains (config or npm-default)
  let outputPath = path.join(process.cwd(), '.cache', 'chain-receipt.json');
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
      outputPath = path.resolve(process.cwd(), args[++i]);
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
        'Usage: kaola-gitea-workflow-run-chains.js [--chains name,...] [--accept-known-red name:issue ...]\n' +
        '                                    [--output path] [--json]\n' +
        '\n' +
        'Runs the four test chains (claude, codex, gitlab, gitea) and writes a chain receipt.\n' +
        'Exit 0 when all non-waived chains pass; non-zero otherwise.\n'
      );
      return 0;
    } else {
      process.stderr.write('run-chains: unknown argument: ' + a + '\n');
      return 1;
    }
  }

  const cwd = process.cwd();

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

  // Ensure .cache directory exists before running chains.
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // Run each chain sequentially, capturing real exit codes.
  const chainResults = [];
  for (const name of chains) {
    const isMocked = Object.prototype.hasOwnProperty.call(mocks, name);
    let cmdParts;
    let commandStr;
    if (isMocked) {
      cmdParts = [mocks[name]];
      commandStr = mocks[name];
    } else {
      commandStr = resolvedCommands[name];
      cmdParts = parseCommand(commandStr);
    }

    const t0 = Date.now();
    const r = spawnSync(cmdParts[0], cmdParts.slice(1), {
      cwd,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf8',
      timeout: resolveTimeoutMs(process.env),
    });
    const duration_ms = Date.now() - t0;

    const exitCode = (r.status != null) ? r.status : (r.error ? 1 : 0);
    const isWaived = Object.prototype.hasOwnProperty.call(waivers, name);

    chainResults.push({
      name,
      exitCode,
      command: isMocked ? (resolvedCommands[name] || CHAIN_COMMANDS[name] || commandStr) : commandStr,
      duration_ms,
      accepted_red: isWaived,
      accepted_red_issue: isWaived ? waivers[name] : null,
    });
  }

  const completedAt = new Date().toISOString();

  const receipt = {
    headSha,
    workTreeHash,
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
    process.stderr.write(
      'run-chains: ' + failed.length + ' chain(s) failed: ' + failed.map(ch => ch.name).join(', ') + '\n'
    );
  }

  return overallExitCode;
}

// #512: per-chain spawnSync timeout — overridable so a passing-but-slow chain (claude ~574s)
// is captured, not killed. Default raised to 900000 (15 min) from the prior hardcoded 600000.
function resolveTimeoutMs(env) {
  const v = parseInt((env && env.KAOLA_RUN_CHAINS_TIMEOUT_MS) || '', 10);
  return (Number.isFinite(v) && v > 0) ? v : 900000;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main, KNOWN_CHAINS, CHAIN_COMMANDS, resolveChains, resolveTimeoutMs };
