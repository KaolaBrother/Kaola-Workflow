# Node Evidence: relocate-claude

## task
M3 procedure relocation + M4 stale-doc fix (Claude top-level edition) for issue #277.
Move the mechanical finalization body out of `commands/kaola-workflow-phase6.md` into
`agents/contractor.md` as sole home; move the claim+author procedure body out of
`commands/kaola-workflow-adapt.md` into `agents/workflow-planner.md` as sole home; fix
the stale "adaptive does NOT provision a worktree" line in `agents/workflow-planner.md`.

## non_tdd_reason
pure procedure relocation / verbatim text move — no natural failing unit test.
Category: behavior-preserving refactor (restructure existing documentation without
changing observable behavior; the same scripts and tokens appear in the new sole-home
locations byte-for-byte; the contract validators are intentionally red until the
textlocks node repoints their assertions).

## write_set
- agents/contractor.md
- agents/workflow-planner.md
- commands/kaola-workflow-phase6.md
- commands/kaola-workflow-adapt.md

## build-green

### git diff --stat (scoped to 4 declared files only)
```
agents/contractor.md              | 117 +++++++++++++++++++++++++++++++
agents/workflow-planner.md        |  14 ++--
commands/kaola-workflow-adapt.md  | 143 ++++----------------------------------
commands/kaola-workflow-phase6.md | 117 +++----------------------------
4 files changed, 147 insertions(+), 244 deletions(-)
```
Only the 4 declared files changed. No other files touched.

### Verbatim-move greps (finalize procedure now in contractor.md)
- `node "$CLAIM_JS" finalize` → agents/contractor.md line 148 ✓
- `--keep-worktree` → agents/contractor.md line 150 ✓
- `commit -m "chore: finalize {project}"` → agents/contractor.md line 171 ✓
- `ROADMAP_JS="$(kaola_script kaola-workflow-roadmap.js)"` → contractor.md line 172 ✓
- `node "$ROADMAP_JS" generate` → contractor.md line 173 ✓
- `rm -f kaola-workflow/.roadmap/issue-N.md` → contractor.md line 163 ✓
- `git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md` → contractor.md line 179 ✓
- All runnable bash blocks ABSENT from phase6.md (only plain-text references in
  dispatch prompt and thin-pointer prose) ✓

### Preserved handle markers in phase6.md (dispatch handle retained)
- `subagent_type="contractor"` → phase6.md ✓
- `model="{CONTRACTOR_MODEL}"` → phase6.md ✓

### Preserved sink tokens in phase6.md (Step 9 main-direct; NOT moved)
- `kaola-workflow-sink-merge` → phase6.md ✓
- `kaola-workflow-sink-pr` → phase6.md ✓
- `SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"` → phase6.md ✓
- `workflow_path: adaptive` → phase6.md ✓
- "Use the sink metadata captured before Step 8b" prose → phase6.md Step 9 ✓

### Dispatch handle markers in adapt.md (handle retained)
- `subagent_type="workflow-planner"` → adapt.md ✓
- `model="{WORKFLOW_PLANNER_MODEL}"` → adapt.md ✓
- `ready_to_run` → adapt.md ✓
- `plan_invalid` → adapt.md ✓
- `NOT \`acquired\` or \`owned\`` → adapt.md ✓
- `do not blind-read` → adapt.md ✓

### Grammar concept words in workflow-planner.md (sole home)
- `workflow-plan.md` → present ✓
- `## Nodes` → present ✓
- `post-dominate` → present ✓
- `finalize` (unique sink) → present ✓
- `FANOUT_CAP` → present ✓
- `plan_hash` → present ✓
- `typed refusal` → present ✓

### M4 stale-doc fix
- Phrase "does NOT provision a worktree" → ABSENT from workflow-planner.md ✓
- Corrected text at frontmatter, body prose, and Method step 1: states adaptive
  claim provisions worktree at `<repo-root>/.kw/worktrees/<project>/`; planner
  authors at repo-root; executor operates in worktree ✓

### Balanced code fences
- agents/contractor.md: 16 fences (balanced) ✓
- agents/workflow-planner.md: 6 fences (balanced) ✓
- commands/kaola-workflow-phase6.md: 48 fences (balanced) ✓
- commands/kaola-workflow-adapt.md: 6 fences (balanced) ✓

Full `npm test` / contract validators are intentionally deferred to the `textlocks`
node, which repoints the validator assertions from the old inline locations to the
new sole-home locations. This breakage is expected and by design.

## What moved where

### Finalize seam (M3 — phase6.md → contractor.md)
Moved VERBATIM into `agents/contractor.md` as new section
"## Mechanical Finalization Procedure (Step 8a/8b/7/8)":
- Step 8a: Artifact Mirror (bash block: _COORD_ROOT_RAW / _WT mirror logic)
- Step 8b: Finalize (Archive + Status Close) (bash block: kaola_script / CLAIM_JS
  / SINK_KIND detection / cmdFinalize --keep-worktree)
- Step 7: Roadmap Regeneration and git-add Staging (bash blocks: rm -f issue-N.md,
  kaola_script / ROADMAP_JS / node generate, git add)
- Step 8: Commit Gate (bash block: git commit -m "chore: finalize {project}")
- All surrounding prose for those four steps

`commands/kaola-workflow-phase6.md` now holds only the thin dispatch handle
(Agent block + one-paragraph pointer to contractor profile) plus thin-pointer
prose for the roadmap-regen reference. No runnable body remains in phase6.md
for the contractor-owned steps.

### Claim+author seam (M3 — adapt.md → workflow-planner.md as sole home)
The grammar/authoring detail (grammar closed envelope, caps, example plan,
shaping guidance) was already in `agents/workflow-planner.md` (Method section).
The inline duplicate sections in `commands/kaola-workflow-adapt.md`
("The grammar", "Caps and the sink", "A complete example", "Shaping guidance")
were removed, making workflow-planner.md the unambiguous sole home.

The dispatch prompt in adapt.md was trimmed: instead of repeating the full
startup/Write/handoff procedure inline in the prompt string, it now points the
planner to its own profile.

### M4 stale-doc fix (workflow-planner.md)
Three occurrences of the stale claim that "adaptive does NOT provision a worktree"
(false since #265) were corrected to state the adaptive claim provisions a
repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner
authors at repo-root; the executor operates in the worktree.
