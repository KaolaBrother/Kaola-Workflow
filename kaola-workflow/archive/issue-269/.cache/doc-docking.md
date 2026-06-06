# Documentation Docking — issue-269

## Changed Code/Config/Workflow Files

| File | Change |
|------|--------|
| `commands/kaola-workflow-plan-run.md` | Added `(e) SELECTOR ROUTING` sub-step to step 3 contractor prompt |
| `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` | Added selector routing prose paragraph to step 3 |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` | Added `(e) SELECTOR ROUTING` (gitea script names) |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` | Added `(e) SELECTOR ROUTING` (gitlab script names) |
| `docs/api.md` | Added `## Selector routing — orchestrator contract` section |
| `CHANGELOG.md` | Added `### Fixed` entry under `[Unreleased]` |

## Documents Checked

| Document | Verdict |
|----------|---------|
| `docs/api.md` | UPDATED — new "Selector routing — orchestrator contract" section added with real commit-node JSON shapes from source |
| `CHANGELOG.md` | UPDATED — `### Fixed` entry added under `[Unreleased]` |
| `README.md` | No change needed — internal contractor prompt wiring, no user-facing API/feature |
| `docs/architecture.md` | No change needed — no structural change to system |
| `docs/conventions.md` | No change needed — no new conventions introduced |
| `docs/workflow-state-contract.md` | No change needed — workflow-state contract unchanged |
| `.env.example` | No change needed — no new environment variables |

## Gaps Found

None. All changed files are documentation (.md) only. The `docs/api.md` section uses real JSON shapes traced directly to `scripts/kaola-workflow-commit-node.js` `combineResults()` return (lines 126-137) and `scripts/kaola-workflow-plan-validator.js` (lines 982-1037), as captured in `.cache/explore.md`. No fabricated field names or values.

## Explicit No-Impact Reasons

- README.md: change is a contractor prompt instruction addition (internal orchestration wiring), not a user-facing install/configure/run step.
- Architecture docs: no new components, scripts, or data flows introduced.
- `.env.example`: no new env vars.
- Inline comments: no scripts modified.

## Verdict

DOCKED
