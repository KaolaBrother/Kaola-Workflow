# Phase 1 - Research / Discovery: issue-90

## Deliverable
Fix the `enouglab` typo in `plugins/kaola-workflow-gitlab/agents/code-architect.toml` and add a validator rule to `assertNoForbidden` catching all `*glab` mechanical-replacement corruptions.

## Why
Agent profiles can contain broken/nonsensical instructions while all contract tests remain green. A regex guard prevents regressions from any future mechanical GitHub→GitLab substitution artifacts.

## Affected Area
- `plugins/kaola-workflow-gitlab/agents/code-architect.toml` (line 12: `enouglab` → `enough`)
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` (add `/\b[a-z]+glab\b/i` to `assertNoForbidden` forbidden array)

## Key Patterns Found
1. `assertNoForbidden` in validate-kaola-workflow-gitlab-contracts.js:43 — regex array checked against all agent/skill/command/hook files
2. The corrupt pattern: `gh` suffix of English word replaced by `gitlab` → `enouglab` (enou + gitlab)
3. Safe regex `/\b[a-z]+glab\b/i` — matches `enouglab`, `througlab`; does NOT match `glab` (CLI tool) or `glabExec` (camelCase)

## Test Patterns
- Framework: hand-rolled assert (no test framework)
- Location: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Structure: `npm run test:kaola-workflow:gitlab` runs validator + both simulation walkthroughs

## Config & Env
None — no env vars or feature flags involved.

## External Docs
None — internal patterns sufficient.

## GitHub Issue
KaolaBrother/Kaola-Workflow#90

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only |

## Notes / Future Considerations
- Only one corruption found in the full file tree scan. The new regex rule acts as a regression guard for future term-replacement passes.
- The GitHub validator (`scripts/validate-kaola-workflow-contracts.js`) does not need changes.
