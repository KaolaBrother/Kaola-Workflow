#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-run-chains.js (issue #432 — D-432-01)
//
// Machine-verifiable chain receipts. Runs the four test chains via
// child_process.spawnSync (NOT shell pipes — captures real exit codes), writes
// a structured chain receipt to .cache/chain-receipt.json, and exits 0 iff
// every non-waived chain passed.
//
// Usage:
//   node kaola-workflow-run-chains.js [options]
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

// #464: resolve the validation chain command set for THIS repo, so Kaola-Workflow's
// finalization receipt works in non-npm product repos (e.g. a Swift/Xcode app), not just
// in the Kaola-Workflow self-host. Precedence:
//   1. Repo-local config `kaola-workflow/chains.json` (`{ "chains": [{name, command}, ...] }`)
//      — wins whenever it declares at least one valid {name, command} entry.
//   2. The built-in npm edition chains, but ONLY for the KNOWN_CHAINS whose
//      `test:kaola-workflow:<name>` script is actually declared in `package.json` (so the
//      Kaola-Workflow self-host keeps its four chains, and a `--chains claude` subset works).
//   3. Otherwise a typed refusal `chains_config_missing` — instead of running `npm run` against
//      scripts that cannot exist and writing a receipt full of meaningless 254s.
// The config path uses a slash (`kaola-workflow/`), never a `kaola-workflow-` token, so the
// file stays forge-neutral (rename-normalize cannot touch it) across all four editions.
function readJsonOr(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return dflt; }
}
function resolveChains(cwd) {
  const configPath = path.join(cwd, 'kaola-workflow', 'chains.json');
  if (fs.existsSync(configPath)) {
    // The file exists, so it is a deliberate config attempt: validate it STRICTLY and fail
    // closed (chains_config_invalid) on any problem — never silently drop a malformed entry
    // (that would run fewer chains than the operator declared and pass finalize green) and
    // never fall through to the npm defaults (which would mask a broken config).
    let config;
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (e) { return { error: 'chains_config_invalid', detail: 'kaola-workflow/chains.json is not parseable JSON: ' + (e && e.message ? e.message.split('\n')[0] : 'parse error') }; }
    if (!config || typeof config !== 'object' || !Array.isArray(config.chains)) {
      return { error: 'chains_config_invalid', detail: 'kaola-workflow/chains.json must be an object with a "chains" array of {name, command}' };
    }
    const commands = {};
    const names = [];
    for (const c of config.chains) {
      const ok = c && typeof c === 'object' && typeof c.name === 'string' && typeof c.command === 'string' && c.name.trim() && c.command.trim();
      if (!ok) {
        return { error: 'chains_config_invalid', detail: 'kaola-workflow/chains.json has an entry missing a non-empty {name, command}: ' + JSON.stringify(c) };
      }
      const n = c.name.trim();
      if (!Object.prototype.hasOwnProperty.call(commands, n)) names.push(n);
      commands[n] = c.command.trim();
    }
    if (!names.length) {
      return { error: 'chains_config_invalid', detail: 'kaola-workflow/chains.json declares an empty "chains" array — add at least one {name, command}' };
    }
    return { source: 'repo-config', commands, names };
  }
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
    detail: 'no kaola-workflow/chains.json and package.json declares no test:kaola-workflow:* scripts — this repo cannot run the default npm edition chains',
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
      // Chain-name validity is checked AFTER chain resolution (a repo-config chain name
      // like "build" is valid even though it is not in KNOWN_CHAINS).
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
        'Usage: kaola-workflow-run-chains.js [--chains name,...] [--accept-known-red name:issue ...]\n' +
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

  // #464: resolve the chain command set for this repo (repo-config > npm-default > refuse).
  // `--mock-chain` (a test hook) supplies a command for a name directly, so a mocked name is
  // available even when no config/npm exists — the refusal only fires when there is nothing to run.
  const resolved = resolveChains(cwd);
  const mockNames = Object.keys(mocks);
  if (resolved.error && mockNames.length === 0) {
    const hint = resolved.error === 'chains_config_missing'
      ? 'Add kaola-workflow/chains.json with a "chains" array of {name, command} (e.g. {"name":"build","command":"xcodebuild test ..."}) for a non-npm repo, or declare the test:kaola-workflow:* scripts in package.json.'
      : 'Fix kaola-workflow/chains.json so its "chains" array has at least one {name, command} entry.';
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
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'no_chains', operator_hint: 'No chains to run. Pass --chains with at least one valid chain name, or declare chains in kaola-workflow/chains.json.' }) + '\n');
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
      timeout: 600000,
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

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main, KNOWN_CHAINS, CHAIN_COMMANDS, resolveChains };
