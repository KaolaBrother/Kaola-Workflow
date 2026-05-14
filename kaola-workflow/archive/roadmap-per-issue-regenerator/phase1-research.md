# Phase 1 - Research / Discovery: roadmap-per-issue-regenerator

## Deliverable

1. `kaola-workflow/.roadmap/issue-{N}.md` per-issue files — each contains title, status, workflow project, current phase, claim holder, next step
2. `scripts/kaola-workflow-roadmap.js` — regenerator script: reads `.roadmap/issue-*.md` + `gh issue list` (OFFLINE-aware), writes `kaola-workflow/ROADMAP.md` idempotently
3. Phase 6 Step 7 updated — calls regenerator instead of hand-writing ROADMAP.md; archive step deletes `.roadmap/issue-{N}.md`
4. Phases 1/4/5/6 update only their own `.roadmap/issue-{N}.md` (never ROADMAP.md directly)
5. `hooks/kaola-workflow-pre-commit.sh` updated — exclude `.roadmap/` from cross-session ownership enforcement (same pattern as ROADMAP.md exclusion)
6. `validate-workflow-contracts.js` + `simulate-workflow-walkthrough.js` updated — ROADMAP.md sync check added
7. `install.sh` updated — new script in copy loop
8. Migration: first regenerator run seeds per-issue files from current ROADMAP.md table

## Why

Eliminate merge conflicts on `ROADMAP.md` when multiple sessions work on different issues simultaneously. Two sessions each commit their own `issue-{A}.md` / `issue-{B}.md` — never touching the same file — and `ROADMAP.md` becomes a generated artifact rebuilt from those inputs.

## Affected Area

| File/Dir | Change Type |
|----------|-------------|
| `kaola-workflow/.roadmap/` | NEW directory |
| `kaola-workflow/.roadmap/issue-{N}.md` | NEW per-issue files |
| `scripts/kaola-workflow-roadmap.js` | NEW regenerator script |
| `kaola-workflow/ROADMAP.md` | MODIFIED — becomes generated artifact with "do not edit" comment |
| `commands/kaola-workflow-phase6.md` | MODIFIED — Step 7 calls roadmap.js; archive deletes per-issue file |
| `commands/kaola-workflow-phase1.md` | MODIFIED — creates per-issue file at project init |
| `hooks/kaola-workflow-pre-commit.sh` | MODIFIED — add `.roadmap/` exclusion |
| `install.sh` | MODIFIED — add kaola-workflow-roadmap.js to copy loop |
| `scripts/validate-workflow-contracts.js` | MODIFIED — new assertions |
| `scripts/simulate-workflow-walkthrough.js` | MODIFIED — Epic Case for sync check |
| `commands/workflow-next.md` | MODIFIED — Startup Step 2 uses roadmap.js |

## Key Patterns Found

1. **Script structure mirror** — `scripts/kaola-workflow-claim.js`: shebang, `require('child_process')`, `OFFLINE` guard, local `assert()`, `isSafeName()`, `getRoot()`, hand-rolled arg parsing, subcommand dispatch, top-level try/catch, immutable `Object.assign()` updates
2. **Pre-commit hook exclusion pattern** — `hooks/kaola-workflow-pre-commit.sh` lines 22-31: `grep -v '^kaola-workflow/ROADMAP\.md$'` pattern; new `.roadmap/` needs same exclusion or sessions will block each other
3. **install.sh explicit copy loop** — `install.sh` lines 112-122: each script added explicitly by name; `validate-workflow-contracts.js` asserts install.sh contains the names — both files must be updated together
4. **Immutable Object.assign pattern** — `kaola-workflow-claim.js`: all field updates use `Object.assign({}, original, changes)`; never in-place mutation
5. **OFFLINE guard** — `process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at top; `ghExec` short-circuits; regenerator must skip `gh issue list` and fall back to `.roadmap/` files only when OFFLINE

## Test Patterns

- Framework: hand-rolled Node.js (`assert`, no external framework)
- Location: `scripts/validate-workflow-contracts.js` (static), `scripts/simulate-workflow-walkthrough.js` (dynamic)
- Static assertions: `assertIncludes(file, needle)` — reads repo file, checks substring
- Dynamic assertions: `assertFileIncludes(file, needle)` — checks temp-dir file; `execFileSync(process.execPath, [scriptPath])` to invoke scripts
- New test needed: `validate-workflow-contracts.js` — assert roadmap.js in install.sh; assert ROADMAP.md has "do not edit" comment; assert phase6.md references roadmap.js
- New test needed: `simulate-workflow-walkthrough.js` — run regenerator twice, assert no diff (idempotency); run regenerator with fixture .roadmap/ files, assert ROADMAP.md content matches expected
- ROADMAP.md has ZERO existing assertions in contract validator — no existing guardrails to preserve

## Config & Env

| Variable | Behavior |
|---|---|
| `KAOLA_WORKFLOW_OFFLINE` | `=1` skips `gh issue list`; regenerator falls back to `.roadmap/*.md` files only |
| `KAOLA_SESSION_ID` | Used by pre-commit hook and phase commands for ownership; roadmap.js does not need it |

## External Docs

None. All patterns are internal. Node.js built-ins (`fs`, `path`, `child_process`) already used across all scripts.

## GitHub Issue

KaolaBrother/Kaola-Workflow#5

## Completeness Score

10/10
- Goal clarity: 3/3 — concrete deliverable, explicit acceptance criteria
- Expected outcome: 3/3 — four testable acceptance criteria in issue body
- Scope boundaries: 2/2 — in/out-of-scope explicit; classifier (Stage 4) is out
- Constraints: 2/2 — pre-commit hook exclusion, OFFLINE guard, idempotency, CI sync check all identified

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient | no external library or API needed; Node.js built-ins only |

## Notes / Future Considerations

- Pre-commit hook `.roadmap/` exclusion is a blocking requirement — without it, parallel sessions will dead-lock on `.roadmap.lock` (a non-existent lock)
- `workflow-init.md` template for ROADMAP.md bootstrap will need updating to call `roadmap.js` instead of writing the table directly — deferred to Phase 3 architect review
- The per-issue file schema must match the ROADMAP.md column schema: Issue, Title, Status, Workflow Project, Next Step
