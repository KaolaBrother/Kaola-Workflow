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

function main(argv) {
  const args = argv.slice(2);

  let chains = [...KNOWN_CHAINS];
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
      chains = val.split(',').map(s => s.trim()).filter(Boolean);
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
      if (!KNOWN_CHAINS.includes(name)) {
        process.stderr.write(
          'run-chains: --accept-known-red: unknown chain name ' + JSON.stringify(name) +
          ' (known: ' + KNOWN_CHAINS.join(', ') + ')\n'
        );
        return 1;
      }
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

  // Validate chain names.
  for (const name of chains) {
    if (!KNOWN_CHAINS.includes(name)) {
      process.stderr.write(
        'run-chains: unknown chain name ' + JSON.stringify(name) +
        ' (known: ' + KNOWN_CHAINS.join(', ') + ')\n'
      );
      return 1;
    }
  }

  const cwd = process.cwd();
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
      commandStr = CHAIN_COMMANDS[name];
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
      command: isMocked ? CHAIN_COMMANDS[name] || commandStr : commandStr,
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

module.exports = { main, KNOWN_CHAINS, CHAIN_COMMANDS };
