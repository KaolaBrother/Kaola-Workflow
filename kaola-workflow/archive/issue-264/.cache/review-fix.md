verdict: pass
fix_node: blocker-resolution

# Fix record — issue #264 blocker (B1) + non-blocking findings

Applied to 3 files (strict write-set lane):
- `commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`

## BLOCKER RESOLUTION — Working directory moved into prompts

**Finding B1:** `Working directory: ${ACTIVE_WORKTREE_PATH}` was placed as a bare Agent()-block
sibling field (between `description=` and `prompt=`) at 6 dispatch sites per file. The contractor
(the only consumer via Method 5) reads this directive from the dispatch PROMPT only — a sibling
field is dropped silently. The contractor brackets ran at repo-root → impl never landed on
`workflow/issue-N`.

**Fix:** At ALL 6 dispatch sites in each of the 3 files, the bare sibling-field line was REMOVED
and the directive was MOVED to the FIRST sentence of `prompt="..."`, using the form:

```
prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative
path from this directory (it is the provisioned worktree for adaptive; when it equals the repo
root, behavior is unchanged). <original prompt text...>"
```

Sites fixed per file (6 per file, 18 total across all 3):
1. orient contractor (`description="Adaptive orient {project}"`)
2. advance contractor (`description="Adaptive advance {project}"`)
3. tdd-guide (`description="Adaptive node {node-id} {project}"`)
4. code-reviewer (`description="Adaptive review {project}"`)
5. build-error-resolver (`description="Adaptive fix {project}"`)
6. commit+advance contractor (`description="Adaptive commit+advance {project}"`)

Post-fix grep confirmation (each file):
- `grep -c "Working directory:"` = 9 per file (6 in prompt= lines + 2 in section prose + 1 in
  fan-out prose note — zero bare sibling-field occurrences)
- Eyeball: every occurrence on a `prompt=` line or in narrative prose; none as a bare block field.

## MEDIUM — mirror once-guard added

**Finding:** The mirror block had no idempotence guard; on resume it would re-copy main's
claim-time folder over the worktree's advanced ledger.

**Fix:** Added `&& [ ! -f "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/workflow-plan.md" ]` to
the mirror condition. The mirror now only fires when the worktree copy does not yet exist. On
resume, the worktree copy is authoritative and the mirror is skipped.

Before:
```bash
if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]; then
```
After:
```bash
if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ] && [ ! -f "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/workflow-plan.md" ]; then
```
Comment updated to: "mirror once at first entry; on resume the worktree copy is authoritative"

Applied to all 3 files.

## LOW — resolver -d existence check added

**Finding:** The resolver fallback only checked `[ -z ]`; if `worktree_path` is recorded but the
directory was removed, the mirror would create a bare dir and dispatch there.

**Fix:** Added `|| [ ! -d "$ACTIVE_WORKTREE_PATH" ]` guard, consistent with phase6's pattern.

Before:
```bash
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```
After:
```bash
[ -z "$ACTIVE_WORKTREE_PATH" ] || [ ! -d "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

Applied to all 3 files.

## Suite results (all 3 exit 0)

```
node scripts/simulate-workflow-walkthrough.js
  ...
  testPlanRunWiredForWorktree: PASSED
  Workflow walkthrough simulation passed

node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
  ...
  GitLab workflow walkthrough simulation passed

node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
  ...
  Gitea workflow walkthrough simulation passed
```

Note: the three suites do NOT cover the blocker (as documented in review.md B1 — D4 residual
risk). The directive-in-prompt fix is verified by grep/eyeball (zero bare sibling-field
occurrences post-fix) and by the Codex SKILL.md being the canonical correct form.
