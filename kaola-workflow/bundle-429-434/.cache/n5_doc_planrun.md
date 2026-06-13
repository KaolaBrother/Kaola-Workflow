evidence-binding: n5_doc_planrun 4222a5918b60

## Files changed

1. `commands/kaola-workflow-plan-run.md`
   - Section: `## Resume Detection`
   - Added `requires_redispatch: true` signal bullet (distinguishes absent/incomplete evidence from complete-but-barrier-not-run crash path)
   - Added barrier-overflow recovery block (`revert-overflow` subcommand, bash example using `kaola-workflow-adaptive-node.js`)
   - Added repair-node recovery block (`repair-node` subcommand, bash example)
   - Added anti-laundering invariant (`reopen-node` must not be used for barrier-overflow recovery)

2. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
   - Section: `## Resume Detection`
   - Same three additions as canonical, script name replaced: `kaola-gitlab-workflow-adaptive-node.js`

3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`
   - Section: `## Resume Detection`
   - Same three additions as canonical, script name replaced: `kaola-gitea-workflow-adaptive-node.js`

4. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
   - Section: `## Resume Detection`
   - Same three additions, using `kaola-workflow-adaptive-node.js` (Codex edition)

5. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
   - Section: `## Resume Detection`
   - Same three additions, script: `kaola-gitlab-workflow-adaptive-node.js`
   - Verified: no `gh`, `pull-request`, or `plugins/kaola-workflow/scripts` forbidden tokens in added text

6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`
   - Section: `## Resume Detection`
   - Same three additions, script: `kaola-gitea-workflow-adaptive-node.js`
   - Verified: no `gh`, `pull-request`, or `plugins/kaola-workflow/scripts` forbidden tokens in added text

## #435 conflict surfaces — none touched

The following sections were NOT modified:
- No "## Goal-Driven Autonomy" section exists in any file; none added
- No "gaps_unswept" or gap-sweep content added
- No "## Startup" sections exist; none modified
- No content outside `## Resume Detection` was altered (all three recovery hint paragraphs placed at tail of Resume Detection, immediately before `## Governance`)

## Forbidden-token verification

`grep -n '\bgh\b|pull-request|plugins/kaola-workflow/scripts'` on both forge SKILL files: CLEAN
