# Code Explorer — roadmap-per-issue-regenerator

## Agent Output

### Entry Points

- `kaola-workflow/ROADMAP.md` — single tracked file, written by Phase 6 Step 7 and refreshed by workflow-next Startup Step 2
- `commands/kaola-workflow-phase6.md` lines 379-380 — only phase command that explicitly writes to ROADMAP.md
- `commands/workflow-next.md` lines 89-91 — Startup Step 2 ensures file exists and syncs from GitHub issues
- `commands/workflow-init.md` lines 190-211 — canonical bootstrap template for ROADMAP.md

### 1. Similar Implementations to Mirror

**scripts/kaola-workflow-claim.js**
- Shebang `#!/usr/bin/env node`
- `const { execFileSync } = require('child_process')` — all git/gh calls use execFileSync, never exec or spawn
- `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` — guard at top of file
- `function assert(cond, msg) { if (!cond) throw new Error(msg); }` — defined locally, no shared assertion lib
- `function isSafeName(name)` — path-traversal guard; checks for /, \, \0, ., ..
- Argument parsing: hand-rolled for loop over argv, --flag value pairs (no third-party parser)
- `function getRoot()` — calls execFileSync('git', ['rev-parse', '--show-toplevel']), falls back to process.cwd()
- Subcommand dispatch: process.argv[2] selects command, each is a top-level function cmdFoo()
- Top-level error boundary: `try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }`
- `Object.assign({}, original, changes)` for all field updates (immutable pattern)

**scripts/kaola-workflow-sink-merge.js**
- Second env var: `const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10)` — test injection
- `ghExec(args)` wraps execFileSync('gh', args) and short-circuits on OFFLINE
- All execFileSync calls use `{ encoding: 'utf8' }`
- `process.stderr.write(...)` for errors/warnings, `process.stdout.write(...)` for output; never console.*

### 2. Naming and File Organization Conventions

- Script naming: `kaola-workflow-{verb}-{noun}.js` kebab-case with kaola-workflow- prefix
- install.sh copies scripts by explicit filename list (not glob); lines 112-122
- Commands reference installed scripts via `node ~/.claude/kaola-workflow/scripts/{script}.js`
- validate-workflow-contracts.js asserts install.sh contains specific script names — new script requires new assertion

### 3. Error Handling Patterns

- Fatal errors: thrown as new Error(msg), caught at main() catch boundary, stderr + exitCode=1
- Race/retry exhaustion: process.exitCode = 2 then return (no throw)
- Non-fatal (branch delete, label): wrapped in try { } catch (_) {} — silently swallowed
- ghExec returns '' when OFFLINE; callers must handle ''
- execFileSync throws on non-zero exit

### 4. Test Locations, Framework, and Structure

- No external test framework; hand-rolled Node.js with local assert function
- scripts/validate-workflow-contracts.js — static contract checks; reads real repo files
- scripts/simulate-workflow-walkthrough.js — dynamic simulation; creates fs.mkdtempSync temp dirs
- Assertion helpers: assert, assertNext, assertFileIncludes, assertCommandIncludes, assertHookOutput, assertRepair
- simulate-workflow-walkthrough.js line 140: writes `ROADMAP.md` fixture as '# Roadmap\n'
- simulate-workflow-walkthrough.js line 293: checks phase6-summary compliance row text
- validate-workflow-contracts.js: ZERO assertions about ROADMAP.md content or structure currently

### 5. Relevant Config, Env Vars

| Variable | Behavior |
|---|---|
| KAOLA_WORKFLOW_OFFLINE | =1 disables all gh and git fetch/push calls |
| KAOLA_WORKFLOW_FORCE_FF_FAIL | Integer; first N FF merge attempts fail (test injection) |
| KAOLA_SESSION_ID | Identifies current session; pre-commit hook exits 0 if unset |
| CLAUDE_PLUGIN_ROOT | Prefix for finding installed scripts; falls back to ./ |

### 6. Current ROADMAP.md Structure

Canonical 5-column schema:
```markdown
| Issue | Title | Status | Workflow Project | Next Step |
```
- Columns: Issue, Title, Status, Workflow Project, Next Step
- Header: "# Kaola-Workflow Roadmap" + explanation line + "## Active Work" section + "## Rules" section

### 7. How Phase Commands Currently Reference ROADMAP.md

- Phase 6 Step 7 (lines 379-380): "Refresh kaola-workflow/ROADMAP.md from open GitHub issues when available."
- Phase 6 compliance row: `| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |`
- workflow-next Startup Step 2: ensures ROADMAP.md exists and syncs from GitHub
- Phases 1, 2, 3, 4, 5: NO ROADMAP.md references

### 8. Pre-commit Hook Scope — CRITICAL FINDING

File: `hooks/kaola-workflow-pre-commit.sh`

The hook explicitly EXCLUDES kaola-workflow/ROADMAP.md:
```bash
KW_PATHS="$(printf '%s\n' "$STAGED" \
  | grep '^kaola-workflow/' \
  | grep -v '^kaola-workflow/\.locks/' \
  | grep -v '^kaola-workflow/\.sessions/' \
  | grep -v '^kaola-workflow/archive/' \
  | grep -v '^kaola-workflow/ROADMAP\.md$')" || true
```

The hook does NOT exclude kaola-workflow/.roadmap/. A staged file at
`kaola-workflow/.roadmap/issue-5.md` would:
1. Pass the `grep '^kaola-workflow/'` filter
2. Have `.roadmap` extracted as the "project name" by `awk -F'/' 'NF >= 3 { print $2 }'`
3. Look for `kaola-workflow/.locks/.roadmap.lock`
4. Potentially block commits if a session owns that lock

Resolution: add `grep -v '^kaola-workflow/\.roadmap/'` to the hook's exclusion block.

### Key Files

| File | Role |
|------|------|
| kaola-workflow/ROADMAP.md | Current single roadmap file to be replaced |
| hooks/kaola-workflow-pre-commit.sh | Excludes ROADMAP.md but NOT .roadmap/ — critical constraint |
| scripts/kaola-workflow-claim.js | Pattern mirror for new script |
| scripts/kaola-workflow-sink-merge.js | Pattern mirror for git/gh ops |
| scripts/validate-workflow-contracts.js | Zero ROADMAP assertions today — test target |
| scripts/simulate-workflow-walkthrough.js | Writes ROADMAP fixture, checks compliance row — test target |
| install.sh | Explicit script list — new script requires explicit addition |
| commands/kaola-workflow-phase6.md | Only phase writing ROADMAP.md (Step 7) |
| commands/workflow-next.md | Startup Step 2 syncs ROADMAP.md |
| commands/workflow-init.md | Bootstrap template and canonical schema |
