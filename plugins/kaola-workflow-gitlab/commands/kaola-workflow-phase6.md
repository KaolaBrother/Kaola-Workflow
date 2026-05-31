---
description: Kaola-Workflow Phase 6. Final validation, documentation, roadmap/archive, commit, and issue update.
argument-hint: <project name>
---

# Kaola-Workflow Phase 6 - Finalize

Phase 6 proves the workflow is complete and records final metadata. Do not
repair inline when final validation fails except under the Trivial Inline Edit
Exception below.

## Prerequisite

Read `workflow_path` from `kaola-workflow/{project}/workflow-state.md` (defaults to `full` when absent).

If `workflow_path: fast`:
- `fast-summary.md` must exist with status `PASSED`. If missing, stop:
  ```text
  Fast-path summary is not complete. Run /kaola-workflow-fast first.
  ```
If `workflow_path: full` (or absent):
- `phase5-review.md` must exist with status `PASSED` or `PASSED WITH FOLLOW-UPS`. If missing, stop:
  ```text
  Phase 5 is not complete. Run /kaola-workflow-phase5 first.
  ```

Read:

```text
kaola-workflow/{project}/workflow-state.md
```

If `workflow_path: fast`, also read (`fast-summary.md` is the Phase 1-5 substitute):

```text
kaola-workflow/{project}/fast-summary.md
```

If `workflow_path: full` (or absent), also read:

```text
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
kaola-workflow/{project}/phase5-review.md
```

## Resume Detection

- final validation not run -> `final-validation`
- final validation failed and no ledger row -> `route-final-fix`
- final validation fixed but not re-run -> `final-validation`
- acceptance checklist incomplete -> `acceptance-check`
- documentation gate incomplete -> `doc-update`
- documentation docking incomplete -> `doc-docking`
- phase summary missing -> `write-summary`
- closure decision gate incomplete -> `closure-decision`
- linked issue not updated -> `issue-update`
- roadmap/archive incomplete -> `roadmap-archive`
- final metadata pending -> `final-metadata`
- commit and push missing -> `commit-push`
- final workspace sync missing -> `verify-sync`

If ambiguous, stop and ask.

## Operational Guardrails

- Run or delegate fresh full validation before claiming completion.
- Do not repair inline. Final validation failures are routed unless the Trivial
  Inline Edit Exception applies.
- Do not close a GitLab issue until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Do not create tracked file edits after the final commit, except the sanctioned
  PR/MR metadata follow-up commit produced automatically by `sink-pr.js` or
  `sink-mr.js`. No other post-final commits are permitted.
- Commit and push only after documentation, issue updates, roadmap refresh,
  archive movement, and final metadata are complete.
- If `/prp-commit` is unavailable, stage the approved implementation, docs, and
  workflow artifacts for this project only.
- If push cannot complete because no upstream exists, authentication fails, or
  the remote rejects the update, stop with exact remediation steps. Do not
  create a second cleanup commit unless the user explicitly approves it.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.

## Validation Delegation Policy

Phase 6 is the final validation gate. The required full relevant project
commands must pass, but the main session does not need to personally run noisy
commands in conversation.

Main session may run small targeted commands by default:

- one focused command needed to classify a final failure
- one quick lint/typecheck/test command after a trivial inline edit
- a short smoke check for acceptance evidence

Main session must delegate expensive or noisy validation by default:

- full `cargo test`, full monorepo test suites, full builds, or coverage runs
- broad lint/typecheck commands across unrelated packages
- commands expected to produce long logs
- repeated reproduction of an already-classified final failure

Delegated validation should use a fresh validation subagent when available, or
the relevant fix agent (`tdd-guide` for behavior/regression/coverage checks,
`build-error-resolver` for build/type/lint/tooling checks). Raw output goes to:

Route behavior/test fixes to the Claude Code agent `tdd-guide`:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly
as shown — do not omit the `model=` line.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/final-validation.md
```

The main session records only the command, pass/fail result, short failure
summary, classification, evidence path, and next route.

## Validation De-Duplication

Avoid redundant validation runs.

- Phase 6 runs each full relevant final command once against the final candidate
  state.
- Do not rerun Phase 4 or Phase 5 targeted commands separately when the Phase 6
  full command already covers them.
- If a Phase 6 command already passed after the last relevant file change, cite
  its evidence path instead of rerunning it.
- After a routed fix or Trivial Inline Edit Exception edit, rerun the failed or
  affected command. Rerun broader validation only when shared infrastructure,
  dependencies, build config, or public behavior changed.

## Trivial Inline Edit Exception

The main session may make a trivial inline edit without emergency fallback only
when all conditions are true:

- the edit is one line or mechanically obvious
- no behavior, API, security, architecture, test intent, release, or design
  judgment is required
- it fixes finalization friction, formatting, an unused import, a typo, import
  ordering, or an obvious generated path/name mistake
- it stays inside the approved implementation/docs/workflow artifact scope
- it is recorded in `phase6-summary.md` or `workflow-state.md`
- affected validation is rerun or prior valid evidence is cited under
  Validation De-Duplication

Anything else is routed to `tdd-guide`, `build-error-resolver`, or back to Phase
5 when review/security behavior is implicated.

## Documentation Docking

Documentation docking is the closure check that matches documents with the
actual code and workflow changes before Git metadata is finalized.

Compare:

- changed implementation, test, config, and workflow files from `git diff`
- Phase 1 success criteria and linked issue acceptance criteria
- Phase 3 task blueprint
- Phase 4 implementation evidence
- Phase 5 review findings and follow-ups
- on the fast path (`workflow_path: fast`), substitute `fast-summary.md`
  (`## Scope`, `## Plan`, `## Implementation Evidence`, `## Review`) for the
  Phase 1/3/4/5 bullets above
- docs touched or skipped by `doc-updater`
- `README.md`, API docs, architecture docs, changelog, `.env.example`, roadmap,
  and issue comments when relevant

Every public behavior, API, setup, architecture, environment, validation, or
roadmap-impacting change must be reflected in the appropriate document or have
an explicit no-impact reason. Save the docking record to:

```text
kaola-workflow/{project}/.cache/doc-docking.md
```

If docking finds gaps, update the docs through `doc-updater` or the Trivial
Inline Edit Exception, then rerun docking before continuing.

## Closure Decision Gate

Before updating issues or reorganizing the roadmap, scan all phase artifacts for
deferred items, unresolved conflicts, partial implementation notes, open review
follow-ups, or decisions that need the user.

If none exist, record the scan in `phase6-summary.md` and continue.

If any exist:

1. Consult the configured Claude Code advisor.
2. Ask the advisor for the safest next step, whether the current item can close,
   and how follow-up issues or roadmap entries should be organized.
3. Save the response to:

```text
kaola-workflow/{project}/.cache/advisor-closure.md
```

4. Ask the user for permission before creating, closing, splitting, merging, or
   reorganizing roadmap entries or GitLab issues.

Do not treat advisor output as user approval.

## Step 1 - Final Validation

Update `workflow-state.md`:

```text
phase: 6
phase_name: Finalize
step: final-validation
next_command: /kaola-workflow-phase6 {project}
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: tdd-guide or build-error-resolver
inline_emergency_fallback_authorized: no
```

Run or delegate the full relevant project commands:

```bash
# full test suite + type check + lint + build
# coverage command when available; target >= 80%
```

Save raw delegated output to:

```text
kaola-workflow/{project}/.cache/final-validation.md
```

All must pass before continuing.

If validation fails, update a Final Validation Failure Ledger and route:

- build/type/lint/dependency/tooling -> `build-error-resolver`
- behavior/regression/coverage -> `tdd-guide`
- review/security regression -> return to Phase 5 and re-run reviewer after fix

Write fix output to:

```text
kaola-workflow/{project}/.cache/final-validation-fix-{n}.md
```

Re-run the failed command after each routed fix.

For every delegated validation or routed final-validation fix, include the
explicit `model=` parameter in the `Agent(...)` call exactly as documented above —
never omit it.

## Step 2 - Acceptance Check

Verify:

- deliverable matches Phase 1 success criteria
- all Phase 3 tasks complete
- tests pass and coverage target is met or justified
- no type errors or lint errors
- no CRITICAL or HIGH review findings remain
- no debug statements remain

On the fast path (`workflow_path: fast`), the Phase 1/3 artifacts do not exist —
source the acceptance evidence from `fast-summary.md` instead: the deliverable and
acceptance criteria from `## Scope`, the plan from `## Plan`, implementation
evidence from `## Implementation Evidence`, and the review result from `## Review`.
Also verify fast-path review compliance: in `## Required Agent Compliance`, the
`code-reviewer` row status must be a delegation status (`subagent-invoked`,
`local-fallback-explicit`, or `local-fallback-tool-unavailable`) — not `N/A` —
whenever `## Scope` lists more than one changed file or any production-path file
(outside `docs/`, `*.md`, `tests/`). `N/A` self-review is acceptable only for the
trivial band (a single docs/comment/markdown edit).

## Step 3 - Documentation Update

Read project root `CLAUDE.md`. Look for `Documentation Update Checklist`.

This is a required documentation gate.

If checklist exists, invoke the Claude Code agent
`doc-updater` with changed files and checklist.

If missing, create or append the checklist, then invoke `doc-updater`:

You MUST pass `model="{DOC_UPDATER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="doc-updater",
  model="{DOC_UPDATER_MODEL}",
  description="Update docs for {project}",
  prompt="..."
)
```

```markdown
## Documentation Update Checklist

- [ ] README.md - update feature list, usage examples, env vars
- [ ] API docs - add/update endpoint descriptions and examples
- [ ] CHANGELOG.md - add entry under [Unreleased]
- [ ] Architecture docs - update if structure changed
- [ ] .env.example - add any new environment variables
- [ ] Inline comments - update where public interfaces changed
```

If no documentation update is needed, skip only with explicit reason and
evidence such as:

```text
no public behavior, API, setup, architecture, roadmap, or docs impact
```

```bash
# Resolve linked worktree path from workflow-state.md
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

Invoke `doc-updater` with changed files, checklist, and `Working directory: ${ACTIVE_WORKTREE_PATH}`.

Write agent output to:

```text
kaola-workflow/{project}/.cache/doc-updater.md
```

**Anti-fabrication constraint (required).** Instruct `doc-updater` to NOT invent or free-form any API/schema/CLI-output/config section. For any such section, it must transcribe verified ground truth — e.g. the actual output of `node <script> --json` / `--help`, real function signatures, or existing schema definitions read from the code — or, if the ground truth is not available to it, emit a `BLOCK: <what it needs>` line instead of guessing. Plausible-looking invented field names, keys, enum values, or example numbers are a docking failure, not a doc. The orchestrator must reject (treat as a docking gap) any doc-updater output whose structured sections are not traceable to real code or command output.

## Step 4 - Documentation Docking

Run the Documentation Docking check described above after `doc-updater` finishes.
Write the result to:

```text
kaola-workflow/{project}/.cache/doc-docking.md
```

The docking record must list:

- changed code/config/test/workflow files reviewed
- documents checked
- gaps found and fixed
- explicit no-impact reasons for skipped document classes
- final verdict: `DOCKED` or `BLOCKED`

Only continue when the final verdict is `DOCKED`.

## Step 5 - Write Summary

Create `kaola-workflow/{project}/phase6-summary.md`:

```markdown
# Phase 6 - Summary: {project}

## Delivered
[what was built]

## Files Changed
[list]

## Test Coverage
[% or reason unavailable]

## Final Validation Evidence
[commands run/delegated/cited, result, evidence path]

## Documentation Docking
[DOCKED/BLOCKED, evidence path]

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|

## Follow-Up Items
[from Phase 5 and closure scan]

## Closure Decision
[none needed/advisor consulted/user approved next steps]

## Commit And Push
[pending final Git gate; final hash is reported after push and is not written back here]

## GitLab Issue
[closed/open/none]

## Roadmap
[updated yes/no]

## Archive
[archive path or pending]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked/skipped | .cache/doc-updater.md or docs-impact check | [reason if skipped] |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked/N/A | .cache/advisor-closure.md or closure scan | [reason if N/A] |
| final-validation fix executors | invoked/N/A | .cache/final-validation-fix-*.md | [reason if N/A] |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
```

## Step 6 - Closure Decision Gate

Run the Closure Decision Gate described above.

If deferred items, conflicts, partial work, or user-decision items exist, stop
after saving `.cache/advisor-closure.md` and ask the user for permission before
changing roadmap or issue organization.

If the user approves issue or roadmap reorganization, make those changes before
the final Git gate.

## Step 7 - GitLab Issue, Roadmap, Archive, And Metadata

If the project links a GitLab issue (from `phase1-research.md` on the full path,
or `issue_iid` in `workflow-state.md` on the fast path):

- close it only after acceptance criteria pass and the Closure Decision Gate says
  the implementation is complete
- keep it open if follow-ups, partial implementation, or unresolved user
  decisions remain
- create/update follow-up issues only after user permission when the Closure
  Decision Gate found decision items
- comment with validation evidence and the planned commit message; add the final
  commit hash only after push if doing so does not dirty the local worktree

**Roadmap regeneration:**

If this project was linked to GitLab issue N, delete its per-issue roadmap file:

```bash
rm -f kaola-workflow/.roadmap/issue-N.md
```

(`rm -f` is idempotent — safe if the file is missing or no issue was linked.)

Regenerate `ROADMAP.md` from the remaining per-issue files:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-gitlab-workflow-roadmap.js)"
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" generate
```

Stage both the deleted per-issue file and the regenerated `ROADMAP.md` together in the final commit:

```bash
git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md
```

The `<!-- generated by scripts/kaola-gitlab-workflow-roadmap.js — do not edit -->` comment at the top of `ROADMAP.md` signals that the file is machine-managed.

Do not reorganize roadmap entries that came from closure decision items until the user has approved the advisor-backed next step.

Archive is performed atomically by `cmdFinalize` in Step 8b below. Do not perform a manual copy or git mv here.

Update `phase6-summary.md` with:

- final GitLab issue state
- final roadmap state
- final archive path
- documentation docking result
- closure decision result
- compliance table with no `pending` rows, except `final commit and push` may be
  `ready` because it runs after this tracked file is finalized

Before the final Git gate, verify every other `Required Agent Compliance` row
across phase files is `invoked`, `skipped`, or `N/A` with evidence or skip
reason.

## Staging Guard

Enforce the single-project rule before committing. If more than one
`kaola-workflow/*/` project is staged at once, split the commit:

```bash
PROJECT_COUNT=$(git diff --cached --name-only \
  | grep '^kaola-workflow/' \
  | grep -v '^kaola-workflow/archive/' \
  | grep -v '^kaola-workflow/\.roadmap/' \
  | grep -v '^kaola-workflow/ROADMAP\.md$' \
  | awk -F'/' 'NF>=3 {print $2}' | sort -u | grep -c . || true)
if [ "${PROJECT_COUNT:-0}" -gt 1 ]; then
  echo "BLOCKED: split your commit — multiple kaola-workflow projects staged." >&2
  exit 1
fi
```

If the check fails, do not stage; split the commit or coordinate manually.

## Step 8a - Artifact Mirror

Before staging, mirror Phase 6 artifacts from the main worktree into the linked worktree (if active):

```bash
# Artifact mirror: copy Phase 6 artifacts from main worktree to linked worktree.
# Mirror MUST run after all Phase 6 artifact writes.
_COORD_ROOT_RAW="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW" != /* ]]; then _COORD_ROOT_RAW="$(pwd)/$_COORD_ROOT_RAW"; fi
ACTIVE_WORKTREE_PATH="$(pwd)"
_WT="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -n "$_WT" ] && [ -d "$_WT" ] && ACTIVE_WORKTREE_PATH="$_WT"
if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]; then
  mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"
  cp -R "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"
  git status --porcelain | while IFS= read -r line; do
    f="${line:3}"
    case "$f" in kaola-workflow/*) continue;; esac
    if [ -f "$(pwd)/$f" ]; then
      mkdir -p "$ACTIVE_WORKTREE_PATH/$(dirname "$f")"
      cp "$(pwd)/$f" "$ACTIVE_WORKTREE_PATH/$f"
    fi
  done
fi
```

## Step 8b - Finalize (Archive + Status Close)

This step runs **only when `sink: merge`**. For `sink: mr` or `sink: pr`, skip
to Step 8 — the active folder must remain open. `sink-mr.js` (Step 9) writes
`mr_url` into the active folder and creates a deliberate metadata follow-up
commit so the worktree is clean. `watch-mr` archives the folder when the MR
merges or closes.

Before archive, capture sink metadata from the active `workflow-state.md`. Do
not read `kaola-workflow/{project}/workflow-state.md` again after this point on
the merge path, because `cmdFinalize` renames it into `archive/`.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE=$(grep '^issue_iid:' "$SINK_STATE_FILE" | awk '{print $2}')
[ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_FLAG=""
[ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"

if [ "$SINK_KIND" = "merge" ]; then
  (cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
    --project "$KAOLA_PROJECT" \
    --keep-worktree)
fi
```

When it runs, `cmdFinalize` atomically writes `status: closed` + `step:
complete` to `workflow-state.md` and renames `kaola-workflow/{project}/` →
`kaola-workflow/archive/{project}/` in the linked worktree. The rename is
included in the Step 8 commit via git rename detection.

If `SINK_KIND` is `mr` or `pr`: skip this archive step. Proceed to Step 8
(commit). The active folder remains open. `sink-mr.js` (Step 9) writes the MR
URL into the active folder and then immediately creates a deliberate metadata
follow-up commit (`chore: record MR metadata for {project}`) so the worktree
is clean after sink. `watch-mr` (on the next `/workflow-next` startup) detects
the merged or closed MR and archives the folder automatically.

## Step 8 - Commit Gate

The sink must only receive committed work. Before dispatching to `sink-merge`
or `sink-mr`, stage only the approved implementation, documentation, roadmap,
archive, and workflow artifacts for this project, then create the final
conventional commit on the workflow branch.

Minimum gate:

```bash
: "${ACTIVE_WORKTREE_PATH:=$(pwd)}"
git -C "$ACTIVE_WORKTREE_PATH" status --short
git -C "$ACTIVE_WORKTREE_PATH" add <approved-files-only>
git -C "$ACTIVE_WORKTREE_PATH" commit -m "chore: finalize {project}"
git -C "$ACTIVE_WORKTREE_PATH" status --short
```

If there is nothing to commit, verify the branch already contains the final
candidate commit and record that evidence in `phase6-summary.md`. Do not run a
sink with uncommitted final changes.

## Step 9 - Sink

Use the sink metadata captured before Step 8b. Do not read the active
`workflow-state.md` here on the merge path; it may already be archived.

```bash
# Capture main repo root before sink dispatch.
# --git-common-dir always resolves to the shared .git dir (mirrors lines 305-306, 533-534, 565-566).
# --show-toplevel returns the worktree root sink-merge is about to delete (issue #33).
_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
: "${SINK_BRANCH:?SINK_BRANCH must be captured before Step 8b}"
: "${SINK_KIND:=merge}"
: "${SINK_ISSUE_FLAG:=}"
```

Dispatch based on `SINK_KIND`:

```bash
case "$SINK_KIND" in
  mr|pr)
    kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
    SINK_MR_JS="$(kaola_script kaola-gitlab-workflow-sink-mr.js)"
    node "$SINK_MR_JS" \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      --project {project}
    ;;
  merge|*)
    kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
    SINK_MERGE_JS="$(kaola_script kaola-gitlab-workflow-sink-merge.js)"
    node "$SINK_MERGE_JS" \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      --project {project}
    _SINK_MERGE_EXIT=$?
    if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
      cd "$_MAIN_ROOT"
      CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
      node "$CLAIM_JS" sink-fallback \
        --project {project}
      SINK_MR_JS="$(kaola_script kaola-gitlab-workflow-sink-mr.js)"
      node "$SINK_MR_JS" \
        --branch "$SINK_BRANCH" \
        $SINK_ISSUE_FLAG \
        --project {project}
      exit $?
    fi
    [ "$_SINK_MERGE_EXIT" -ne 0 ] && exit "$_SINK_MERGE_EXIT"
    ;;
esac
# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
cd "$_MAIN_ROOT" 2>/dev/null || true
```

`sink-merge.js` exit codes:
- Exit 0: branch merged onto main, issue closed (online), local branch deleted. Confirm worktree is on main with `git status --short --branch`.
- Exit 1: conflict or fatal error. Rebase conflict remediation printed to stderr. Re-run after resolving.
- Exit 2: FF race exhausted after MAX_AUTOMERGE_RETRIES retries. Follow printed remediation instructions.
- Exit 3: merge-impossible (branch protection, non-fast-forward, permission denied). Receipt written to `.cache/sink-fallback.json`. Phase 6 pivots to MR creation automatically.

`sink-mr.js` exit codes:
- Exit 0: branch pushed, MR opened, URL recorded in the `## Sink` block and committed in a metadata follow-up commit. If `mr_auto_merge: true` in config, auto-merge was requested.
- Exit 1: fatal error (push failed, `glab mr create` failed, or metadata commit/push failed). MR URL and manual recovery instructions printed to stderr when MR was already created.

After `sink-mr.js` exits 0, the active folder remains open. It is archived automatically when `watch-mr` detects the MR is MERGED or CLOSED on the next `/workflow-next` startup.

## Completion Contract

This phase closes exactly one issue. After issue #N is closed and the active
folder is archived, the single-issue completion contract is satisfied. Do not auto-route
into the next issue in line. Stop and await explicit re-direction from the user.
