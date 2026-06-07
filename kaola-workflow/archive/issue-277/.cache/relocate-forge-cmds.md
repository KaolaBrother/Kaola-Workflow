# Node Evidence: relocate-forge-cmds

non_tdd_reason: edition mirror of the command relocation — verbatim-structure text move, no failing unit test (category: glue / wiring — connecting existing components by mirroring the structural change already made to the Claude edition into the gitlab and gitea edition files, no behavioral logic added)

build-green: structural verification only — `git diff --stat` scoped to the 4 declared forge command files (44 ins / 478 del); finalize/claim runnable bodies removed (matches the verified Claude edition's prose-only `Step 8b` reference count of 6); preserved markers present (`## Agent Model Badge`, `You MUST pass \`model=`, `model="{` on every dispatch, sink tokens, planner/contractor handles); no forbidden strings; balanced code fences. Full `npm test` intentionally deferred to the `textlocks` node (the contract validators are RED by design until their assertions are repointed to the relocated text).

## Task

Mirror the command relocation already performed on the Claude edition (commands/kaola-workflow-phase6.md and commands/kaola-workflow-adapt.md) into the 4 declared forge-specific files:
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

## Write Set

Exactly 4 files changed (no other files touched):
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

## Changes Per File

### kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- Step 7 roadmap-regen body (rm -f block, kaola_script/ROADMAP_JS block, git add block, generated-by comment) replaced with 4-line pointer: "The roadmap-regen … `kaola-gitlab-workflow-roadmap.js generate` … lives exclusively in `agents/contractor.md`"
- Mechanical Finalization section: added pointer paragraph before the Agent block
- Contractor prompt updated: removed "exactly as written below in this command file" → "the full procedure in your contractor profile"
- Step 8a, Step 8b, Step 8 (Commit Gate) sections deleted entirely
- Step 9 and Sink Metadata Capture kept intact

### kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- Added pointer paragraph after "is fixed." (forge-specific tokens: kaola-gitlab-workflow-claim.js, kaola-gitlab-workflow-adaptive-handoff.js)
- Sections deleted: ## The grammar, ## Caps and the sink, ## A complete example, ## Shaping guidance
- Front end intro paragraph condensed (removed verbose worktree detail, matches Claude edition)
- workflow-planner Agent prompt shortened to "Follow the Method in your agent profile" pattern

### kaola-workflow-gitea/commands/kaola-workflow-phase6.md
- Same structural changes as GitLab edition
- Forge tokens preserved: kaola-gitea-workflow-roadmap.js, kaola-gitea-workflow-claim.js, sink-pr.js (Gitea uses PR not MR)

### kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- Same structural changes as GitLab edition
- Forge tokens preserved: kaola-gitea-workflow-claim.js, kaola-gitea-workflow-adaptive-handoff.js

## Verification Commands

### git diff --stat (only 4 declared files changed)
```
 plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md  | 141 ++-------------------
 plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md | 120 ++----------------
 plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md   | 141 ++-------------------
 plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md  | 120 ++----------------
 4 files changed, 44 insertions(+), 478 deletions(-)
```
Exit code: 0

### Required marker grep (all 4 files)

All files:
- `## Agent Model Badge`: 1 each
- `You MUST pass \`model=` line: 1 each
- `model="{` occurrences: phase6 = 6 each, adapt = 3 each (all Agent dispatches kept their model= line)
- Forbidden string `Agent Model Badge Contract`: 0 each
- Forbidden string `kaola_agent_model`: 0 each

phase6.md files:
- `subagent_type="contractor"`: 1 each (contractor dispatch handle kept)
- `SINK_STATE_FILE`: gitlab=5, gitea=4 (sink tokens preserved in Sink Metadata Capture + Step 9)
- `workflow_path: adaptive`: 1 each
- `## Step 8a`: 0 each (removed)
- `## Step 8b`: 0 each (removed)
- `## Step 8 - Commit Gate`: 0 each (removed)
- `## Step 9 - Sink`: 1 each (kept)
- GitLab: sink-mr.js=5, Gitea: sink-pr.js=5 (forge-specific sink tokens preserved)

adapt.md files:
- `subagent_type="workflow-planner"`: 1 each
- `ready_to_run`: 1 each
- `plan_invalid`: 1 each
- `## The grammar`: 0 each (removed)
- `## Caps and the sink`: 0 each (removed)
- `## A complete example`: 0 each (removed)
- `## Shaping guidance`: 0 each (removed)
- pointer paragraph present: 1 each

### Code fence balance
- gitlab/phase6.md: 50 fence lines (even, balanced)
- gitlab/adapt.md: 6 fence lines (even, balanced)
- gitea/phase6.md: 50 fence lines (even, balanced)
- gitea/adapt.md: 6 fence lines (even, balanced)

## Build-Green Summary

Structural verification passed:
- git diff --stat shows exactly 4 declared files, exit 0
- All required validator markers present in all 4 files
- No forbidden strings introduced
- All code fences balanced
- Forge-specific tokens preserved (kaola-gitlab-* vs kaola-gitea-*, MR vs PR)
- Step 8a/8b/8 Commit Gate removed from both phase6 editions
- Grammar/caps/example/shaping sections removed from both adapt editions
- Contractor and workflow-planner dispatch handles retained with model= lines
- Step 9 + Sink Metadata Capture section intact in both phase6 editions

Full npm test / contract validators intentionally NOT run — they are expected RED until the later textlocks node repoints assertions.
