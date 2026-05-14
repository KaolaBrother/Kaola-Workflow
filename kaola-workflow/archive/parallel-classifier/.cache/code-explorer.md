# Code Explorer: parallel-classifier (issue #6)

## Script Naming and Organization

- New script: `scripts/kaola-workflow-classifier.js` (flat in /scripts/, same as all others)
- Naming convention: `kaola-workflow-{noun}.js`
- Current scripts: claim.js (392L), roadmap.js (227L), sink-merge.js (174L), repair-state.js, compact-context.js

## Primary Mirror: kaola-workflow-claim.js

- Shebang: `#!/usr/bin/env node` (no 'use strict')
- Stdlib only: fs, path, os, crypto, child_process — zero npm deps
- `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`
- `assert(cond, msg)` — throws on failure
- `isSafeName(name)` — blocks /, \, \0, ., ..
- `field(content, name)` — extracts `key: value` from markdown via regex
- `ghExec(args)` — short-circuits when OFFLINE
- `getRoot()` — via git rev-parse, falls back to process.cwd()
- `parseArgs(argv)` — hand-rolled, no commander/yargs
- main() with explicit if-chains for subcommand dispatch
- Top-level: `try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }`

## Secondary Mirror: kaola-workflow-roadmap.js

- Uses 'use strict'
- `if (require.main === module) { try { main(); } catch... }` guard — enables import
- Dispatch: `if (!sub || sub === 'generate')` style
- Output: `process.stdout.write(...)` exclusively (never console.log)

## Error Handling Pattern

- Input validation via `assert(cond, msg)`
- Operational failures: `process.exitCode = N; return` (never throw)
  - Exit 0: success
  - Exit 1: unexpected errors (caught by try/catch)
  - Exit 2: resource conflicts / retry exhaustion
- Warnings: `process.stderr.write(msg + '\n')` without exiting
- Never `process.exit()` — always `process.exitCode =`

## Test Infrastructure

Framework: plain Node.js — no Jest/tap/Mocha.

validate-workflow-contracts.js:
- `assertIncludes(relPath, needle)` — substring presence
- `assertNotIncludes(relPath, needle)` — absence
- Roots relative to `path.resolve(__dirname, '..')`
- Line 151: `assert(routerLines <= 220)` — hard 220-line cap on workflow-next.md

simulate-workflow-walkthrough.js:
- `fs.mkdtempSync` sandbox + `try/finally fs.rmSync(tmp, {recursive:true, force:true})`
- `execFileSync(process.execPath, [scriptPath, ...args], { cwd: tmpDir, encoding:'utf8', env: {...process.env, KAOLA_WORKFLOW_OFFLINE:'1'} })`
- Epic Case 1: claim/heartbeat/status/sweep
- Epic Case 2: sink-merge OFFLINE fast-path
- Epic Case 3: sink-merge rebase path
- Epic Case 4: FF retry exhaustion
- Epic Case 5A-5F: roadmap generate/migrate/validate/init-issue
- New: Epic Case 6 for classifier

## Config & Env Vars

| Variable | Effect |
|---|---|
| KAOLA_WORKFLOW_OFFLINE=1 | Skips all gh CLI calls |
| KAOLA_WORKFLOW_FORCE_FF_FAIL | Forces FF failures for testing |
| KAOLA_SESSION_ID | UUID; activates heartbeat + pre-commit guard |
| CLAUDE_PLUGIN_ROOT | Path to plugin root |

Config path: `path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json')`
Currently only `machine-id` file exists in `~/.config/kaola-workflow/`.
Pattern for creation: `fs.mkdirSync(path.dirname(p), { recursive: true })` then write.

## workflow-next.md Structure (211 lines, 220 cap = 9 lines headroom)

- Startup Step 0: claim.js sweep + claim (when KAOLA_SESSION_ID set)
- Startup Step 1: Git freshness
- Startup Step 2: Roadmap validate
- Startup Step 3: Select Project (currently single-session pick)
- Co-active Leases: multiple sessions on distinct projects
- Resume Detection

Candidate-scan loop would insert in/after Startup Step 3. Only 9 lines headroom — must be very compact or the 220-line cap in validate-workflow-contracts.js must be raised together.

## Phase Artifact Formats

phase1-research.md `## Affected Area` → two-column table: `| Path | Change |`
phase3-plan.md `### Files to Create` / `### Files to Modify` → three-column tables
phase3-plan.md task entries → `- Write Set: path1, path2` inline

## Lock Files

Lock files at: `kaola-workflow/.locks/{project}.lock`
Format: JSON parsed via `JSON.parse(fs.readFileSync(lockPath, 'utf8'))`
Fields include: session_id, project, branch, issue, etc.

## install.sh

Explicit copy loop at lines 113-123. Must add `kaola-workflow-classifier.js`.
validate-workflow-contracts.js will need: `assertIncludes('install.sh', 'kaola-workflow-classifier.js')`
