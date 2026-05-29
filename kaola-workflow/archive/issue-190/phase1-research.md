# Phase 1 - Research / Discovery: issue-190

## Deliverable
Three independent medium-severity drift fixes:
- M1: Port `## Startup Step 0a-1 — Path Intent` block + 3 Required Output lines into 3 Codex SKILL.md routers
- M2: Remove 5 dead session-subsystem env vars from `.env.example` and 1 entry from `docs/api.md`
- M3: Bump `package-lock.json` version fields from `3.16.0` to `3.16.1`

## Why
- M1: Codex users never auto-route to the fast path; `kaola-workflow-fast` skill ships in every Codex edition but is unreachable; Codex users also lose the parallel-safety verdict at the routing boundary.
- M2: `.env.example` documents a fully-removed session subsystem, contradicting `README.md:514` ("No lease/session layer remains") and `validate-workflow-contracts.js` (asserts hook must not exist).
- M3: `package-lock.json` at 3.16.0 contradicts `package.json`, plugin manifests, and the git tag at 3.16.1 — exactly the drift class issue #186 was meant to close.

## Affected Area
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (M1)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` (M1)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` (M1)
- `.env.example` (M2)
- `docs/api.md` (M2 — line 109 only)
- `package-lock.json` (M3 — lines 3 and 9)

## Key Patterns Found
1. Source for M1 port: `commands/workflow-next.md:80-117` — `## Startup Step 0a-1 — Path Intent` verbatim
2. Insertion point for all 3 Codex SKILL.md: between end of `## Startup Step 0a` (line ~96) and `## Startup` (line ~98)
3. Required Output gap: Codex omits `Branch:`, `Workflow path:`, and `Parallel decision:` lines present in `commands/workflow-next.md:335-348`
4. M2 locations: `.env.example` lines 11-13, 15-17, 19-21, 27-29, 31-33; `docs/api.md:109`
5. M3 locations: `package-lock.json` lines 3 and 9 (`"version": "3.16.0"` → `"3.16.1"`)
6. Forge-specific fetch: GitHub uses `gh issue view`, GitLab uses `glab issue view --output json`, Gitea uses `tea issues view --output json`

## Test Patterns
- Framework: hand-rolled assert (scripts/simulate-workflow-walkthrough.js)
- Location: scripts/simulate-workflow-walkthrough.js, plugins/*/scripts/simulate-*-walkthrough.js
- Structure: validate-script-sync.js enforces script parity across editions; validate-workflow-contracts.js enforces invariants
- Relevant contract checks: validate-workflow-contracts.js:129,172 assert session hook does not exist

## Config & Env
- `KAOLA_PATH`: env var set by router to signal fast path; startup records `workflow_path: fast`
- Dead vars to remove: `KAOLA_ENFORCE_PLATFORM_SESSION`, `KAOLA_KERNEL_SESSION_SKIP`, `KAOLA_SESSION_ID`, `KAOLA_KERNEL_SESSION_FAKE_PID`, `KAOLA_COORD_ROOT`

## External Docs
None — all internal patterns.

## GitHub Issue
KaolaBrother/Kaola-Workflow#190

## Completeness Score
10/10 — goal clear, outcome testable, scope bounded to 6 files with exact locations known, no new deps or external constraints.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | all internal patterns, no external API/library behavior needed |

## Notes / Future Considerations
- The Codex routers also omit the `startup` flag to pass `KAOLA_PATH` value (e.g. `--path fast`); however since `claim.js` startup does record `workflow_path: fast` from the env var, only the router prose needs to export `KAOLA_PATH` before calling startup — no startup script change needed.
- KAOLA_COORD_ROOT: documented as override in .env.example, but getCoordRoot() never reads it (silent no-op). Removing from docs is correct; no code change needed.
