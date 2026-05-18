#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function readConfig() {
  const defaults = { pr_auto_merge: false };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, defaults, parsed);
  } catch (_) {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    } catch (_2) {}
    return defaults;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
  }
  return args;
}

function updateStateSinkBlock(stateFile, prUrl, prNumber) {
  if (!fs.existsSync(stateFile)) return;
  const content = fs.readFileSync(stateFile, 'utf8');

  // Find the ## Sink block; skip silently if absent
  if (!/^## Sink\s*$/m.test(content)) return;

  // Replace or insert pr_url and pr_number within the Sink block.
  // The Sink block ends at the next ## header or EOF.
  const SINK_BLOCK_RE = /(^## Sink\s*$[\s\S]*?)(?=\n## |\s*$)/m;
  const match = SINK_BLOCK_RE.exec(content);
  if (!match) return;

  let sinkSection = match[1];
  const prUrlLine = 'pr_url: ' + prUrl;
  const prNumberLine = 'pr_number: ' + prNumber;

  if (/^pr_url:.*$/m.test(sinkSection)) {
    sinkSection = sinkSection.replace(/^pr_url:.*$/m, prUrlLine);
  } else {
    sinkSection = sinkSection.trimEnd() + '\n' + prUrlLine;
  }

  if (/^pr_number:.*$/m.test(sinkSection)) {
    sinkSection = sinkSection.replace(/^pr_number:.*$/m, prNumberLine);
  } else {
    sinkSection = sinkSection.trimEnd() + '\n' + prNumberLine;
  }

  const updated = content.replace(SINK_BLOCK_RE, sinkSection);
  fs.writeFileSync(stateFile, updated);
}

function appendSummary(summaryFile, prUrl, prNumber) {
  fs.appendFileSync(summaryFile, '\nPR URL: ' + prUrl + '\nPR number: ' + prNumber + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }

  const root = getRoot();
  const config = readConfig();
  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  const summaryFile = path.join(root, 'kaola-workflow', args.project, 'phase6-summary.md');

  if (OFFLINE) {
    const prUrl = 'OFFLINE_PLACEHOLDER';
    const prNumber = 0;
    updateStateSinkBlock(stateFile, prUrl, prNumber);
    appendSummary(summaryFile, prUrl, prNumber);
    // Metadata commit in OFFLINE mode (no push — no remote)
    const relState = path.relative(root, stateFile);
    const relSummary = path.relative(root, summaryFile);
    spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        process.stderr.write('[offline] metadata commit skipped: ' +
          (commitResult.stderr ? commitResult.stderr.toString().trim() : 'unknown error') + '\n');
      }
    }
    return;
  }

  // Step 3 — push branch
  execFileSync('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

  // Step 4 — create PR
  const prCreateArgs = [
    'pr', 'create',
    '--head', args.branch,
    '--base', 'main',
    '--fill',
  ];
  if (args.issue != null) {
    prCreateArgs.push('--body', 'Closes #' + args.issue);
  }

  const prUrl = ghExec(prCreateArgs);

  // Step 5 — assert URL
  assert(prUrl.startsWith('https://'), 'gh pr create did not return a valid URL: ' + prUrl);

  // Step 6 — parse PR number
  const prNumMatch = prUrl.match(/\/pull\/(\d+)/);
  const prNumber = prNumMatch ? parseInt(prNumMatch[1], 10) : 0;

  // Step 7 — update workflow-state.md Sink block
  updateStateSinkBlock(stateFile, prUrl, prNumber);

  // Step 8 — append to phase6-summary.md
  appendSummary(summaryFile, prUrl, prNumber);

  // Metadata commit — deliberate follow-up commit for clean worktree
  const relState = path.relative(root, stateFile);
  const relSummary = path.relative(root, summaryFile);
  spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
  const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
  if (diffResult.status !== 0) {
    const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
      'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
    if (commitResult.status !== 0) {
      throw new Error(
        'PR created at ' + prUrl + ' but metadata commit failed.\n' +
        'Manual recovery: git add ' + relState + ' ' + relSummary +
        " && git commit -m 'chore: record PR metadata for " + args.project + "'" +
        ' && git push origin ' + args.branch
      );
    }
    const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', args.branch], { stdio: 'pipe' });
    if (pushResult.status !== 0) {
      throw new Error(
        'PR created at ' + prUrl + ' but metadata push failed.\n' +
        'Manual recovery: git push origin ' + args.branch
      );
    }
  }

  // Step 9 — optional auto-merge
  if (config.pr_auto_merge === true) {
    try {
      ghExec(['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch']);
    } catch (mergeErr) {
      process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
    }
  }
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
