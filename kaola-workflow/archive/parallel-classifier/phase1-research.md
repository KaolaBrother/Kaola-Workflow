# Phase 1 - Research / Discovery: parallel-classifier

## Deliverable

`scripts/kaola-workflow-classifier.js` — a Node.js script that classifies whether a candidate GitHub issue is safe to work on in parallel alongside currently-claimed sessions. Returns verdict `green | yellow | red | blocked` with reasoning.

Plus:
- Candidate-scan loop in `commands/workflow-next.md` Startup Step 3 (auto mode, compact — 9 lines headroom)
- `~/.config/kaola-workflow/config.json` with `parallel_mode: auto`

## Why

Enables a second `/goal` session to automatically pick a different safe open issue without any user prompt, making multi-session parallelism truly autonomous.

## Affected Area

| Path | Change |
|------|--------|
| `scripts/kaola-workflow-classifier.js` | NEW — classifier script |
| `commands/workflow-next.md` | MODIFY — candidate-scan loop in Startup Step 3 |
| `install.sh` | MODIFY — add classifier.js to explicit copy loop |
| `scripts/validate-workflow-contracts.js` | MODIFY — assertions for new script + install.sh entry |
| `scripts/simulate-workflow-walkthrough.js` | MODIFY — Epic Case 6 (classifier scenarios) |
| `~/.config/kaola-workflow/config.json` | NEW (runtime, not in repo) — parallel_mode: auto |
| `README.md` | MODIFY — add classifier.js to Scripts Reference table |
| `CHANGELOG.md` | MODIFY — entry under [Unreleased] |

## Key Patterns Found

1. **Script skeleton** — `kaola-workflow-claim.js:1-30`: shebang, stdlib requires, `OFFLINE` const, `assert`, `isSafeName`, `field`, `ghExec`, `getRoot`, `parseArgs`
2. **Output pattern** — `process.stdout.write(...)` exclusively; `process.exitCode = N` not `process.exit(N)`; top-level `try { main() } catch` wrapper
3. **Importable guard** — `kaola-workflow-roadmap.js`: `if (require.main === module) { ... }` enables require() from tests
4. **Config path pattern** — `kaola-workflow-claim.js:getMachineId()`: `path.join(os.homedir(), '.config', 'kaola-workflow', filename)` with `fs.mkdirSync(path.dirname(p), { recursive: true })` before write
5. **Lock file reads** — `kaola-workflow-claim.js`: `path.join(root, 'kaola-workflow', '.locks', project + '.lock')` → `JSON.parse(fs.readFileSync(...))`
6. **Epic Case structure** — `scripts/simulate-workflow-walkthrough.js:561+`: `fs.mkdtempSync` sandbox, `execFileSync(process.execPath, [scriptPath, ...args], { cwd, env: {...process.env, KAOLA_WORKFLOW_OFFLINE:'1'} })`, `assert(condition, 'Epic Case N: message')`
7. **Contract assertion pattern** — `scripts/validate-workflow-contracts.js`: `assertIncludes('install.sh', 'kaola-workflow-classifier.js')` etc.

## Test Patterns

- Framework: hand-rolled Node.js assertions (no external framework)
- Location: `scripts/validate-workflow-contracts.js` (static), `scripts/simulate-workflow-walkthrough.js` (dynamic)
- Structure: Epic Cases in simulate-walkthrough; each sub-test uses `fs.mkdtempSync` sandbox + OFFLINE mode
- New: Epic Case 6 with sub-tests for green/yellow/red/blocked verdicts

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — skips all `gh` CLI calls (classifier must guard every `gh` call)
- `KAOLA_SESSION_ID` — activates multi-session mode
- Config file: `~/.config/kaola-workflow/config.json` (new) — `{ "parallel_mode": "auto" }`
- Lock files: `kaola-workflow/.locks/{project}.lock` — JSON with session_id, project, branch, issue fields

## External Docs

None — stdlib only (fs, path, os, child_process).

## GitHub Issue

KaolaBrother/Kaola-Workflow#6

## Completeness Score

10/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | stdlib-only project; no external APIs or frameworks |

## Notes / Future Considerations

- `workflow-next.md` is at 211 lines with a 220-line hard cap (validated by validate-workflow-contracts.js line 151). The candidate-scan loop must fit in ≤9 lines OR the cap must be raised (with a matching contract-validator update).
- The classifier reads `phase1-research.md` (Affected Area table) and `phase3-plan.md` (Files to Create/Modify tables and Write Set lines) from claimed projects. It does NOT write to them except for the yellow-verdict "shared-infra warning" note.
- OFFLINE mode: when `KAOLA_WORKFLOW_OFFLINE=1`, classifier cannot check `depends-on` label state via `gh`; should default to treating unresolved dependencies as `blocked` (safe conservative).
- `config.json` is a runtime file — it lives in `~/.config/`, not in the repo. `install.sh` should NOT copy it; it is created on first classifier invocation if absent (defaults to `{ "parallel_mode": "auto" }`).
