---
name: kaola-workflow-finalize
description: Use when reviewed Kaola-Workflow for Codex work, also called kaola-workflow, needs final validation, documentation docking, issue or roadmap closure, archiving, and Git finalization.
---

# Kaola-Workflow Finalize

Finalization proves the work is complete and records closure metadata.

Read `workflow_path` from `kaola-workflow/{project}/workflow-state.md` (defaults
to `full` when absent). If `workflow_path: fast`, the fast path replaces Phase
1-5: require `fast-summary.md` with status `PASSED` (stop if it is missing or not
`PASSED`), and read it as the Phase 1-5 substitute (`## Scope`, `## Plan`,
`## Implementation Evidence`, `## Review`) wherever the steps below reference
Phase 1/3/5 artifacts.

## Goal Contract

Continue until final validation, acceptance audit, documentation docking,
roadmap refresh, archive decision, and Git finalization evidence are complete.
Before declaring completion, audit every explicit requirement against concrete
evidence. Stop only for true external authorization, materially user-owned
choices, or ambiguity that blocks correctness.


## Guardrails


- Run or cite fresh final validation before claiming completion.
- Do not close issues until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Commit And Push happens after docs, issues, roadmap, archive, and metadata are complete.

## Required Steps

1. Final validation: run the full relevant project commands once against the final candidate state. Save output to `.cache/final-validation.md`.
2. Acceptance check: verify Phase 1 success criteria, Phase 3 tasks, tests, review status, and absence of debug artifacts. On the fast path (`workflow_path: fast`), source these from `fast-summary.md` and verify fast-path review compliance: the `## Required Agent Compliance` `code-reviewer` row must record a delegation status (`subagent-invoked`, `local-fallback-explicit`, or `local-fallback-tool-unavailable`), not `N/A`, whenever `## Scope` lists more than one changed file or any production-path file (outside `docs/`, `*.md`, `tests/`); `N/A` self-review is allowed only for the trivial band (a single docs/comment/markdown edit).
   ```bash
   ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
   [ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
   ```

3. Documentation update: use the `doc-updater` Codex agent role when documentation changes are needed. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable. Pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to the doc-updater agent. Update docs only when behavior, API, setup, architecture, env, roadmap, or user-facing workflow changed. Save output to `.cache/doc-updater.md` or write a no-impact reason. Anti-fabrication (required): instruct `doc-updater` to transcribe verified ground truth — actual `node <script> --json`/`--help` output, real function signatures, or existing schema read from the code — for any API/schema/CLI-output/config section, or emit `BLOCK: <what it needs>` instead of inventing field names, keys, enum values, or example numbers; treat any untraceable structured section as a docking gap (`BLOCKED`).
4. Documentation Docking: compare changed files with `README.md`, API docs, architecture docs, changelog, `.env.example`, roadmap, and issue comments when relevant. Save `.cache/doc-docking.md` with verdict `DOCKED` or `BLOCKED`.
5. Closure decision: scan all phase files for deferred items or user decisions. Ask before reorganizing issues or roadmap.
6. Refresh `kaola-workflow/ROADMAP.md`.
7. Archive is performed atomically by `cmdFinalize` in step 8b below. Do not perform a manual copy or git mv here.

   **Keep-open partial-close terminal (#333/#336).** If the Closure Decision Gate keeps the issue
   OPEN (partial implementation, residual follow-ups), the durable signal is one optional line in
   the `## Sink` block: `issue_action: comment_keep_open` (default when absent: close), written by
   the main session at the gate with user approval. Still archive through the SAME `finalize`
   subcommand, adding `--keep-open` (the contractor adds `--keep-issue-open` to `cmdFinalize` when
   the field is present). It stamps the archived `workflow-state.md` terminal
   (`last_result: closed_keep_open`, `issue_disposition: kept-open`, no active `next_command`),
   PRESERVES `kaola-workflow/.roadmap/issue-N.md`, and regenerates `ROADMAP.md` still listing #N
   (closure invariant `keep-open-roadmap-preserved` enforces it). Never archive by manual
   `mv`/`git mv`. **Keep-open is merge-sink-only**: `sink-merge --keep-issue-open` notes WITHOUT
   closing; an MR/PR sink would auto-close via its `Closes #N` body, so Step 9 refuses a non-merge
   sink (and the exit-3 MR/PR auto-pivot) under keep-open, and `sink-mr.js`/`sink-pr.js` refuse a
   project carrying `issue_action: comment_keep_open`.
8. Commit and push only approved files.

   ### Staging Guard

   Enforce the single-project rule. If more than one
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

   The mechanical finalization below — the artifact mirror, the `cmdFinalize` archive + status close (with `--keep-worktree`, merge path only), roadmap refresh, and the `chore: finalize ${KAOLA_PROJECT}` commit gate — is deterministic bookkeeping. The `contractor` Codex agent role is the SOLE HOME of this procedure and the session MUST delegate it; the contractor runs the scripts and authors the durable bookkeeping but never dispatches a role, judges, or asks the user. Only if the `contractor` subagent tooling is genuinely unavailable may the session run it inline, and that fallback MUST be logged as `local-fallback-tool-unavailable` in the `## Required Agent Compliance` ledger. The current session keeps the sink dispatch and issue-close decision. Because a subagent runs in its own shell, capture the sink metadata (`SINK_BRANCH`, `SINK_KIND`, `SINK_ISSUE_FLAG`, `ACTIVE_WORKTREE_PATH`) in THIS session before delegating — they are reused at the sink step and do not cross the delegation boundary.

   Attestation boundary (#338): the contractor's Step 8b passes `--attest-contractor-spawn` to `cmdFinalize`, so a genuinely delegated run back-fills its own dispatch marker and the closure receipt reads `finalize_contractor_attested: attested` even where the SubagentStart hook cannot fire (a contractor dispatched into a linked worktree, or a hookless harness) — the main session must never pass that flag on an inline run. The adaptive plan's `finalize (<node>)` Required Agent Compliance row is recorded `main-session-direct` (its in-plan sink bookkeeping is main-session-direct by the plan-run contract); that row neither requires nor replaces the contractor's delegation of mechanical finalization here. When the session legitimately runs the mechanical finalization inline (tooling unavailable), it records `local-fallback-tool-unavailable` with evidence and does NOT pass `--attest-contractor-spawn`; the resulting `finalize_contractor_attested: missing` plus the ATTESTATION WARNING is the truthful, expected, non-blocking outcome.

   **Finalization recovery contract (tribal knowledge, #399).** Three recovery rules are binding,
   not optional lore: (1) **sync order is worktree→main BEFORE the mirror** — the worktree holds the
   *complete* ledger and the main copy is stale, so sync worktree→main first; the mirror only pushes
   Finalization artifacts INTO the worktree and must never overwrite a complete worktree ledger with
   a staler main copy (the Step-8a guard below enforces this — on a refusal, sync worktree→main, do
   not bypass it); (2) **the machinery never authors the implementation commit** — if it is missing
   at finalize, surface it and stop, do not cover for it; (3) **after a sink-merge rebase detour,
   repair the MAIN checkout** named in the failure's `git -C <path>` line, never `cd` the deleted
   worktree, and finish with `--force-with-lease`.

   Before mirroring artifacts, resolve the linked worktree and copy Finalization artifacts:

   ```bash
   # Artifact mirror: copy Finalization artifacts from main worktree to linked worktree.
   # Mirror MUST run after all Finalization artifact writes.
   _COORD_ROOT_RAW="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
   if [[ "$_COORD_ROOT_RAW" != /* ]]; then _COORD_ROOT_RAW="$(pwd)/$_COORD_ROOT_RAW"; fi
   ACTIVE_WORKTREE_PATH="$(pwd)"
   _WT="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
   [ -n "$_WT" ] && [ -d "$_WT" ] && ACTIVE_WORKTREE_PATH="$_WT"
   if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]; then
     # #399: ledger-regression guard. Refuse to copy a STALER main plan over a MORE-COMPLETE worktree
     # plan (which would reset a finished run's ledger complete->pending). FAIL-OPEN on the first sync.
     # The guard is forge-neutral (kaola-workflow-ledger-compare.js) but ships in this edition's tree.
     ledger_compare_script="plugins/kaola-workflow-gitlab/scripts/kaola-workflow-ledger-compare.js"
     if [ ! -f "$ledger_compare_script" ]; then
       ledger_compare_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitlab/*/scripts/kaola-workflow-ledger-compare.js' -print -quit 2>/dev/null)"
     fi
     if [ -n "$ledger_compare_script" ] && ! node "$ledger_compare_script" \
         --source "kaola-workflow/${KAOLA_PROJECT}/workflow-plan.md" \
         --dest "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/workflow-plan.md"; then
       echo "REFUSED: main copy staler than the worktree ledger; sync worktree->main FIRST" >&2
       exit 1
     fi
     mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
     cp -R "kaola-workflow/${KAOLA_PROJECT}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
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

   ### Step 8b - Finalize (Archive + Status Close)

   This step runs **only when `sink: merge`**. For `sink: mr` or `sink: pr`, skip
   to the commit gate so `sink-mr.js` can write MR metadata into the active
   folder and `watch-mr` can archive it when the MR merges or closes.

   Capture sink metadata from the active state before archive. Do not read
   `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` again after this point
   on the merge path, because `cmdFinalize` renames it into `archive/`.

   ```bash
   claim_script="plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js"
   if [ ! -f "$claim_script" ]; then
     claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-claim.js' -print -quit 2>/dev/null)"
   fi
   SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
   SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
   SINK_KIND="${SINK_KIND:-merge}"
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_iid:' "$SINK_STATE_FILE" | awk '{print $2}')
   [ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE_FLAG=""
   [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
   SINK_ISSUE_NUMBERS=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_numbers:' | awk '{print $2}')  # #369 bundle members
   [ -z "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS=$(grep '^issue_numbers:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE_NUMBERS_FLAG=""
   [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
   # #336: keep-open partial-close terminal — issue_action defaults to close when absent.
   SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_action:' | awk '{print $2}')
   SINK_ISSUE_ACTION="${SINK_ISSUE_ACTION:-close}"
   SINK_KEEP_OPEN_FLAG=""
   [ "$SINK_ISSUE_ACTION" = "comment_keep_open" ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
   if [ "$SINK_KIND" = "merge" ]; then
     (cd "$ACTIVE_WORKTREE_PATH" && node "$claim_script" finalize \
       --project "$KAOLA_PROJECT" \
       --keep-worktree $SINK_KEEP_OPEN_FLAG)
   fi
   ```

   **Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/${KAOLA_PROJECT}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares `mainRootFromCoord(getCoordRoot(root))` with `root` (both passed through `fs.realpathSync` to resolve symlinked tmpdirs). If they differ, the main repo's `kaola-workflow/${KAOLA_PROJECT}/` is removed. When `cwd` resolves to the same directory as the git common-dir's parent (typically when `KAOLA_WORKTREE_NATIVE=0`, or when `cmdFinalize` is invoked manually from the main repo), the cleanup is a no-op because main root === caller root.

   When it runs, this atomically writes `status: closed` + `step: complete` to
   `workflow-state.md` and renames `kaola-workflow/${KAOLA_PROJECT}/` →
   `kaola-workflow/archive/${KAOLA_PROJECT}/` in the linked worktree. The rename
   is staged and committed in the commit gate below.

   `sink-merge` will refuse with exit 1 if `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` is still present on the branch HEAD when it runs; this is a safety guard that ensures finalize always precedes the merge.

   Before sink dispatch, stage only approved implementation, docs, roadmap,
   archive, and workflow artifacts for this project, then create the final
   conventional commit on the workflow branch:

   ```bash
   : "${ACTIVE_WORKTREE_PATH:=$(pwd)}"
   git -C "$ACTIVE_WORKTREE_PATH" status --short
   git -C "$ACTIVE_WORKTREE_PATH" add <approved-files-only>
   git -C "$ACTIVE_WORKTREE_PATH" commit -m "chore: finalize ${KAOLA_PROJECT}"
   git -C "$ACTIVE_WORKTREE_PATH" status --short
   ```

   If there is nothing to commit, verify and record that the branch already
   contains the final candidate commit. Do not run a sink with uncommitted final
   changes.

   After the commit gate, dispatch to the correct sink script using the sink
   metadata captured before archive:

   ```bash
   scripts_dir="$(dirname "$claim_script")"
   : "${SINK_BRANCH:?SINK_BRANCH must be captured before archive}"
   : "${SINK_KIND:=merge}"
   : "${SINK_ISSUE_FLAG:=}"
   : "${SINK_ISSUE_NUMBERS_FLAG:=}"
   : "${SINK_KEEP_OPEN_FLAG:=}"
   # #336: keep-open is merge-sink-only — refuse an MR/PR sink before dispatch.
   if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
     echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink. MR/PR sinks close via the merged MR; switch sink: merge or remove issue_action." >&2
     exit 1
   fi
   case "$SINK_KIND" in
     mr|pr)
       node "$scripts_dir/kaola-gitlab-workflow-sink-mr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
       ;;
     merge|*)
       node "$scripts_dir/kaola-gitlab-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project "$KAOLA_PROJECT"
       _SINK_MERGE_EXIT=$?
       if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
         # #336: keep-open is merge-sink-only — never auto-pivot to an MR sink (its Closes #N body
         # would close the kept-open issue; watch-mr would delete the preserved roadmap source).
         if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
           echo "BLOCKED: sink-merge exited 3 (merge-impossible) on a keep-open run. Keep-open is merge-sink-only: the MR fallback body closes the issue on merge and watch-mr would delete the preserved roadmap source. Remediate the merge blocker (see .cache/sink-fallback.json) and re-run sink-merge; do not pivot to an MR sink." >&2
           exit 1
         fi
         node "$scripts_dir/kaola-gitlab-workflow-claim.js" sink-fallback \
           --project "$KAOLA_PROJECT"
         node "$scripts_dir/kaola-gitlab-workflow-sink-mr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
         exit $?
       fi
       [ "$_SINK_MERGE_EXIT" -ne 0 ] && exit "$_SINK_MERGE_EXIT"
       ;;
   esac
   ```

## Summary File

Plain `invoked` is intentional for non-Codex-role workflow gates such as final
validation, documentation docking, roadmap refresh, archive, and final commit;
delegation vocabulary applies only to Codex role rows like `doc-updater`.

```markdown
# Finalization - Summary: {project}

## Delivered
...

## Final Validation Evidence
command, result, evidence path

## Documentation Docking
DOCKED, .cache/doc-docking.md

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | .cache/final-validation.md | |
| doc-updater | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/doc-updater.md | reason if N/A |
| documentation docking | invoked | .cache/doc-docking.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | invoked | kaola-workflow/archive/{project} | |
| final commit and push | invoked | git status --short --branch | clean and synced |
```

State remains in `workflow-state.md` until archive is complete.

## Completion Contract

This skill closes exactly one issue. After issue #N is closed and the active folder is archived,
the single-issue completion contract is satisfied. Stop and await explicit re-direction
from the user. Do not auto-route into the next issue in line.
