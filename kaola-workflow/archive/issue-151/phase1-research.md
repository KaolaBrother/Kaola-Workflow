# Phase 1 - Research / Discovery: issue-151

## Deliverable
Update shared documentation to be forge-neutral and add explicit GitLab/Gitea command mappings where commands differ. Fix the Gitea `workflow-next.md` wording that says "MRs" instead of "PRs".

## Why
Users installing or operating the GitLab/Gitea variants may follow GitHub-specific commands or misunderstand which remote state is authoritative for their forge. The README currently presents GitHub-only script names and subcommand examples even in sections that are meant to cover all three forges.

## Affected Area

**Primary files:**
- `README.md` — lines 461-468, 480-484, 496-506, and additional occurrences at lines 559, 583, 595-603, 611, 613, 704
- `plugins/kaola-workflow-gitea/commands/workflow-next.md` — line 154 only

**Do not touch:**
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` — already consistent
- `scripts/` — no script changes needed
- `docs/api.md` — already forge-neutral (use as reference pattern)

## Key Patterns Found
1. **Forge triad pattern** (`docs/api.md:11,43`): `script-name.js` (GitHub) / `kaola-gitlab-workflow-script.js` (GitLab) / `kaola-gitea-workflow-script.js` (Gitea) — the established inline pattern for per-forge script names
2. **Contract-guarded string** (`scripts/validate-workflow-contracts.js:208`): `assertIncludes('README.md', 'No lease/session layer remains.')` — must be preserved verbatim on README line 482
3. **GitLab reference** (`plugins/kaola-workflow-gitlab/commands/workflow-next.md:153-154`): "also run `watch-mr` to archive MR folders for merged or closed MRs" — correct pattern for Gitea mirror (replace watch-mr→watch-pr and MRs→PRs)

## Test Patterns
- Framework: Node hand-rolled assert (no framework)
- Location: `scripts/validate-workflow-contracts.js`, `scripts/simulate-workflow-walkthrough.js`
- Structure: `assertIncludes(file, string)` — validate doc strings exist; run both after edits

## Config & Env
None — documentation-only change, no env vars or feature flags involved.

## External Docs
N/A — internal patterns sufficient; `docs/api.md` provides the reference triad pattern already in use.

## GitHub Issue
KaolaBrother/kaola-workflow#151

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | N/A | Internal documentation patterns only; no external library/API behavior needed |

## Notes / Future Considerations
- The operational scripts table in README lines 466-467 lists `kaola-workflow-sink-merge.js` and `kaola-workflow-sink-pr.js` without forge qualifications — these should also get triad notation
- README line 611 heading "## GitHub roadmap cycle" should become "## Forge roadmap cycle" — check if any contract tests guard this heading (none found)
- Scope is documentation only; no script changes, no test changes beyond confirming existing validators still pass
