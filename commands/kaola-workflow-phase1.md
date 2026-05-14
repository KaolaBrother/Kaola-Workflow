---
description: Kaola-Workflow Phase 1. Research/discovery only, with durable checkpoints and ECC exploration.
argument-hint: <task description, GitHub issue, or project name>
---

# Kaola-Workflow Phase 1 - Research / Discovery

Phase 1 discovers facts only. It does not choose a solution, design an
architecture, or write implementation code.

## Hard Gates

- If the deliverable, user value, affected area, or success criteria are
  unclear, stop and ask.
- Invoke `code-explorer` for codebase research unless the task is explicitly
  documentation-only and no codebase facts are needed.
- Invoke `docs-lookup` only when external/library/API/framework behavior is
  needed; otherwise record it as `N/A` with evidence.
- Persist raw agent outputs. Do not rely on conversation memory.
- Maintain `workflow-state.md` before and after every gate.
- Do not ask the user to confirm generated project/folder names. Routine naming
  is nonessential workflow bookkeeping and is chosen autonomously.

## Session Heartbeat

If a claim session is active, update the heartbeat before proceeding:

```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && \
  node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" heartbeat --session "$KAOLA_SESSION_ID"
```

## Resume Detection

If `$ARGUMENTS` is an existing project, read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/.cache/
```

If `phase1-research.md` exists with no pending compliance rows, Phase 1 is
complete. Route to:

```text
/kaola-workflow-phase2 {project}
```

For new work, generate the project name before writing artifacts and create the
final `kaola-workflow/{project-name}/` directory directly.

## Step 1 - Parse Requirement

Extract:

- What: concrete deliverable
- Why: user value
- Where: affected area or suspected area
- Success criteria: how completion will be judged
- GitHub issue: `owner/repo#number` or `none`

Generate a 2-4 word kebab-case name that describes the deliverable. Check for
existing `kaola-workflow/{name}/`; if it exists, append the first available
numeric suffix, for example `{name}-2`, `{name}-3`, and so on. Name generation
must be deterministic enough to resume safely: derive it from the issue title
or task description, normalize to lowercase alphanumeric words joined by
hyphens, and preserve the recorded name in `workflow-state.md`.

Do not ask for confirmation. Create:

```text
kaola-workflow/{project-name}/
kaola-workflow/{project-name}/.cache/
```

Ask only if the input does not contain enough information to produce a safe
name, or if multiple unrelated issues/tasks are competing for the same workflow
cycle.

Create or update `kaola-workflow/{project-name}/workflow-state.md`:

```markdown
phase: 1
phase_name: Research
step: requirement-parsing
next_command: /kaola-workflow-phase1 {project-name}
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: N/A
inline_emergency_fallback_authorized: no
```

## Step 2 - Codebase Exploration

Invoke the ECC subagent `code-explorer`.

Provide only the parsed requirement, linked issue summary when present, and
suspected affected area. Ask it to return:

1. Similar implementations to mirror
2. Naming and file organization conventions
3. Error handling patterns
4. Test locations, framework, and structure
5. Relevant config, env vars, feature flags

Write raw output to:

```text
kaola-workflow/{project-name}/.cache/code-explorer.md
```

Update `workflow-state.md` before invoking and after writing the cache file.

## Step 3 - External Docs Lookup

Invoke `docs-lookup` only when current external behavior matters.

The agent must use official or primary-source docs where possible and return
stable links, version assumptions, and concise constraints. It must not propose
implementation approaches.

Write raw output to:

```text
kaola-workflow/{project-name}/.cache/docs-lookup.md
```

If not needed, record:

```text
docs-lookup: N/A - internal patterns sufficient
```

## Step 4 - Completeness Gate

Score 0-10:

- Goal clarity: 0-3
- Expected outcome: 0-3
- Scope boundaries: 0-2
- Constraints: 0-2

If score is below 7, stop and ask. Do not write the phase file or route to Phase
2 until the missing information is resolved.

## Step 5 - Write Phase File

Create `kaola-workflow/{project-name}/phase1-research.md`:

```markdown
# Phase 1 - Research / Discovery: {project-name}

## Deliverable
[what]

## Why
[user value]

## Affected Area
[files/modules]

## Key Patterns Found
1. [pattern + file:line]
2. [pattern + file:line]
3. [pattern + file:line]

## Test Patterns
- Framework: [framework]
- Location: [path]
- Structure: [pattern]

## Config & Env
[relevant env vars, flags, config files]

## External Docs
[links/version assumptions or none]

## GitHub Issue
[owner/repo#number or none]

## Completeness Score
[X/10]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | invoked/N/A | .cache/docs-lookup.md or docs impact check | [reason if N/A] |

## Notes / Future Considerations
[deferred questions or none]
```

Update `workflow-state.md`:

```text
phase: 1
step: complete
next_command: /kaola-workflow-phase2 {project-name}
```

Continue to Phase 2 when Phase 1 evidence and compliance rows are complete.

## Step 5b - Per-Issue Roadmap File (Conditional)

If a GitHub issue number N was extracted in Step 1:

1. Resolve the title:
   - ONLINE: `gh issue view N --json title -q .title`
   - OFFLINE: use the title from `phase1-research.md`, or `—` if absent

2. Resolve the workflow-project: the current `kaola-workflow/{project}` folder name.

3. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" init-issue \
  --issue N \
  --title "TITLE" \
  --status open \
  --workflow-project "WORKFLOW_PROJECT" \
  --next-step "ready"
```

4. Stage the new file (skip if `init-issue` printed `skip:`):

```bash
git add kaola-workflow/.roadmap/issue-N.md
```

Note: Phases 4 and 5 do NOT update this file. Phase 6 Step 7 deletes it.

If no GitHub issue is linked (`phase1-research.md` records `GitHub Issue: none`), skip this step.

## Step 6 - Cut Feature Branch

If a claim session is active (`KAOLA_SESSION_ID` is set) and `workflow-state.md`
contains a `## Sink` block, cut the feature branch now.

Read the branch name from the Sink block:

```bash
SINK_BRANCH=$(grep '^branch:' kaola-workflow/{project}/workflow-state.md | awk '{print $2}')
```

If `SINK_BRANCH` is empty or `TBD`, skip this step — no session is active or
the branch name is not yet resolved.

**Worktree precondition** — run before any git branch operation:

```bash
git status --porcelain
```

If the output is non-empty (dirty worktree), stop immediately with:

```text
ERROR: Worktree is dirty. Commit or discard your changes before cutting the
feature branch. Do NOT auto-stash. Resolve manually, then re-run Phase 1.
```

Do not stash automatically.

**Branch creation (idempotent):**

```bash
if git show-ref --verify --quiet refs/heads/"$SINK_BRANCH"; then
  # Branch already exists — resume case
  git checkout "$SINK_BRANCH"
else
  git checkout -b "$SINK_BRANCH"
fi
```

**Stage 1 migration** — if the Sink block showed `branch: TBD` before the
branch name was resolved, call `patch-branch` to backfill the lock file, Sink
block, and GitHub claim comment:

```bash
# Only if the stored branch was TBD (legacy lease)
if [ "$(grep '^branch:' kaola-workflow/{project}/workflow-state.md | awk '{print $2}')" = "TBD" ]; then
  node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-claim.js" \
    patch-branch \
    --project {project} \
    --session "$KAOLA_SESSION_ID" \
    --branch "$SINK_BRANCH"
fi
```

After this step the worktree is on `{branch}`. Phase 4 implementation work
begins on this branch.

Update `workflow-state.md`:

```text
phase: 1
step: complete
next_command: /kaola-workflow-phase2 {project-name}
```

Continue to Phase 2 when Phase 1 evidence and compliance rows are complete.
