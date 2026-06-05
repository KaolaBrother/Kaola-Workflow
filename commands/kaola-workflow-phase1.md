---
description: Kaola-Workflow Phase 1. Research/discovery only, with durable checkpoints and agent exploration.
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

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the `model=` line.

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

Create or update `kaola-workflow/{project-name}/workflow-state.md`. If the
file already contains `## Sink`, preserve those blocks exactly;
only update the phase position, pending gates, and evidence fields. Do not
replace the whole file with the minimal snippet below.

If a linked GitHub issue number `N` is known and no `## Sink` block exists yet,
add a lightweight `## Sink` block with `branch: TBD`, `issue_number: N`,
`claimed_at: N/A`, and `sink: merge`. This lets later sessions recognize the
active issue even before `phase1-research.md` exists.

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

Invoke the Claude Code agent `code-explorer`:

```text
Agent(
  subagent_type="code-explorer",
  model="{CODE_EXPLORER_MODEL}",
  description="Research {project-name}",
  prompt="..."
)
```

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

Invoke `docs-lookup` only when current external behavior matters. Pass its model explicitly:

```text
Agent(
  subagent_type="docs-lookup",
  model="{DOCS_LOOKUP_MODEL}",
  description="Lookup docs for {project-name}",
  prompt="..."
)
```

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

Capture the resolved project name and issue number before delegating (shell variables do not cross the subagent boundary):

```bash
RESEARCH_PROJECT="{project-name}"
RESEARCH_ISSUE=$(grep '^issue_number:' "kaola-workflow/{project-name}/workflow-state.md" | awk '{print $2}')
```

## Mechanical Checkpoint (delegated to the contractor)

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical checkpoint {project-name}",
  prompt="Run the mechanical bookkeeping for Phase 1 of {project-name}. phase1-research.md is already written on disk (do NOT author or edit it — the research synthesis is the orchestrator's). Execute the Step 5 workflow-state.md checkpoint update (phase: 1 / step: complete / next_command: /kaola-workflow-phase2 {project-name}), PRESERVING any existing ## Sink block byte-for-byte, and Step 5b (the per-issue roadmap init-issue + git add kaola-workflow/.roadmap/issue-N.md staging), exactly as written below in this command file. Return a compact bookkeeping summary; do NOT cut the feature branch (Step 6), do NOT invoke code-explorer/docs-lookup, do NOT judge or interpret findings."
)
```

Update `workflow-state.md`:

```text
phase: 1
step: complete
next_command: /kaola-workflow-phase2 {project-name}
```

Preserve any existing `## Sink` blocks during this update.

Continue to Phase 2 when Phase 1 evidence and compliance rows are complete.

## Step 5b - Per-Issue Roadmap File (Conditional)

If a GitHub issue number N was extracted in Step 1:

1. Resolve the title:
   - ONLINE: `gh issue view N --json title -q .title`
   - OFFLINE: use the title from `phase1-research.md`, or `—` if absent

2. Resolve the workflow-project: the current `kaola-workflow/{project}` folder name.

3. Run:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-workflow-roadmap.js)"
if [ -f "$ROADMAP_JS" ]; then
  node "$ROADMAP_JS" init-issue \
    --issue N \
    --title "TITLE" \
    --status open \
    --workflow-project "WORKFLOW_PROJECT" \
    --next-step "ready"
fi
```

4. Stage the new file (skip if `init-issue` printed `skip:`):

```bash
git add kaola-workflow/.roadmap/issue-N.md
```

Note: Phases 4 and 5 do NOT update this file. Phase 6 Step 7 deletes it.

If no GitHub issue is linked (`phase1-research.md` records `GitHub Issue: none`), skip this step.

## Step 6 - Cut Feature Branch

If a claim session is active or recoverable and `workflow-state.md`
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

If the Sink block showed `branch: TBD` before the branch name was resolved,
call `patch-branch` to backfill the Sink block:

```bash
if [ "$(grep '^branch:' kaola-workflow/{project}/workflow-state.md | awk '{print $2}')" = "TBD" ]; then
  kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
  CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"
  [ -f "$CLAIM_JS" ] && node "$CLAIM_JS" \
    patch-branch \
    --project {project} \
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

Preserve any existing `## Sink` blocks during this update.

Continue to Phase 2 when Phase 1 evidence and compliance rows are complete.
