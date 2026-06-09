# Finalization — Summary: issue-249

## Delivered

Renamed the `docs-lookup` agent to `knowledge-lookup`, broadened it into a general external-knowledge role with `WebSearch`/`WebFetch` tools (root `.md` edition), runtime-gated web prose (all `.toml` editions), web-injection defense, and an adaptive planner summon heuristic. Un-vendored the agent. Propagated the rename across all four editions (claude/codex/gitlab/gitea): plan-validators, model resolvers, install/uninstall scripts, test fixtures, phase/skill prose, adapt commands, docs.

## Files Changed

49 files (see `git status` in worktree). Key groups:
- `agents/knowledge-lookup.md` (new, git mv from docs-lookup.md)
- `.toml` editions in all 3 plugin trees (git mv + content update)
- `scripts/validate-vendored-agents.js` (un-vendoring)
- `docs/agents-source.md` (row dropped)
- 4× plan-validators, 4× resolvers (CANONICAL_ROLES + DEFAULT_AGENT_MODELS renames)
- `install.sh`, `uninstall.sh` (REQUIRED_AGENTS + placeholder rename)
- 3 test fixtures (assertion string updates)
- 12 phase/skill/adapt/planner prose files (all 4 editions)
- `README.md`, `docs/api.md`, `CHANGELOG.md`

## Test Coverage

No new behavior logic introduced — all changes are renames, config, and prompt authoring. All 4 edition test chains pass green (validated in n16). No coverage target applicable.

## Final Validation Evidence

All 4 chains confirmed green in n16 (doc-updater), cited under Validation De-Duplication:
- `npm run test:kaola-workflow:claude` → PASS
- `npm run test:kaola-workflow:codex` → PASS
- `npm run test:kaola-workflow:gitlab` → PASS
- `npm run test:kaola-workflow:gitea` → PASS

Adaptive barrier: all 4 gates (--resume-check / --gate-verify / --barrier-check / --verdict-check) exit 0 at finalization.

Evidence: `.cache/final-validation.md`

## Documentation Docking

DOCKED. Evidence: `.cache/doc-docking.md`

README.md + docs/api.md updated in n16; CHANGELOG.md added in n17.
Architecture docs + .env.example: no update required (role rename + capability broadening, no structural/env change).
docs/investigations/ excluded (frozen historical records).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | N/A |

## Follow-Up Items

n14 code-reviewer raised two non-blocking notes:
- R1: README.md/docs/api.md refs (resolved in n16)
- R2: stray `kaola-workflow/kaola-workflow/.cache/` dir must NOT be staged (staging guard enforced)

No follow-up issues required.

## Closure Decision

No deferred items, unresolved conflicts, partial implementation, or user-decision items found. Advisor closure gate: N/A — acceptance criteria all pass, implementation complete.

## Commit And Push

Pending final git gate. Final hash reported after push.

## GitHub Issue

#249 — to be closed after merge (sink: merge, issue: 249).

## Roadmap

Updated via cmdFinalize in Step 8b (closure removes `.roadmap/issue-249.md`, regenerates `ROADMAP.md`).

## Archive

`kaola-workflow/archive/issue-249/` — to be created by cmdFinalize in Step 8b.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked (n16 node) | `.cache/n16.md`, `.cache/doc-updater.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| closure advisor gate | N/A | closure scan found no deferred items | no decision items |
| final-validation fix executors | N/A | all chains green; no fix required | |
| roadmap refresh | pending (Step 8b) | `kaola-workflow/ROADMAP.md` | |
| archive completed folder | pending (Step 8b) | | |
| final commit and push | ready | git status verified; sink kind=merge, branch=workflow/issue-249 | final gate runs after this file |

## Status

READY FOR FINAL GIT GATE
