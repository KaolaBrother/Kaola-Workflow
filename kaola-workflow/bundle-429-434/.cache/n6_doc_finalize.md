evidence-binding: n6_doc_finalize e96dd0258bba

## Files changed

### 1. `commands/kaola-workflow-finalize.md`
- Section: `## Step 9 - Sink`
- Added subsection `### Script-owned worktree sink (\`--sink\` mode, #429)` immediately before the `\`sink-merge.js\` exit codes:` paragraph.
- The bash snippet references `$SINK_MERGE_JS` (already resolved in the merge case block above) plus `--sink --json`.

### 2. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`
- Section: `## Step 9 - Sink`
- Added same subsection at same insertion point (before `\`sink-merge.js\` exit codes:`).

### 3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`
- Section: `## Step 9 - Sink`
- Added same subsection at same insertion point.

### 4. `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Section: step 8 sink dispatch, after the `esac` closing block, before `## Summary File`
- Added subsection `### Script-owned worktree sink (\`--sink\` mode, #429)`.
- Bash snippet uses `$scripts_dir/kaola-workflow-sink-merge.js` (claude edition script name).

### 5. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- Section: step 8 sink dispatch, after the `esac` closing block, before `## Summary File`
- Added same subsection.
- Bash snippet uses `$scripts_dir/kaola-gitlab-workflow-sink-merge.js` (gitlab edition script name).
- No `gh` CLI token introduced; no `plugins/kaola-workflow/scripts` path used.

### 6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`
- Section: step 8 sink dispatch, after the `esac` closing block, before `## Summary File`
- Added same subsection.
- Bash snippet uses `$scripts_dir/kaola-gitea-workflow-sink-merge.js` (gitea edition script name).
- No `gh` CLI token introduced; no `plugins/kaola-workflow/scripts` path used.

## #435 conflict-region check

Searched all 6 files for `gaps_unswept`, `gap-sweep`, and `## Run gaps` — none found. No #435 conflict regions were touched.

## Forbidden-token check (forge SKILLs)

Searched gitlab and gitea SKILLs for `plugins/kaola-workflow/scripts` — none found. Clean.
