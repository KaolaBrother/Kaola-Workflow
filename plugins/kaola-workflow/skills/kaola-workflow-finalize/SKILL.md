---
name: kaola-workflow-finalize
description: Use when reviewed Kaola-Workflow for Codex work, also called kaola-workflow, needs final validation, documentation docking, issue or roadmap closure, archiving, and Git finalization.
---

# Kaola-Workflow Finalize

Phase 6 proves the work is complete and records closure metadata.

## Goal Contract

Continue until final validation, acceptance audit, documentation docking,
roadmap refresh, archive decision, and Git finalization evidence are complete.
Before declaring completion, audit every explicit requirement against concrete
evidence. Stop only for true external authorization, materially user-owned
choices, or ambiguity that blocks correctness.

## Session Heartbeat

If a session is active, ensure the background heartbeat ticker is running:

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
fi
[ -n "${KAOLA_SESSION_ID:-}" ] && {
  _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
  if [ ! -f "$_TICKER_PID_FILE" ] || ! kill -0 "$(cat "$_TICKER_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    nohup node "$claim_script" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  fi
}
```

## Guardrails

- Run or cite fresh final validation before claiming completion.
- Do not close issues until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Commit And Push happens after docs, issues, roadmap, archive, and metadata are complete.

## Required Steps

1. Final validation: run the full relevant project commands once against the final candidate state. Save output to `.cache/final-validation.md`.
2. Acceptance check: verify Phase 1 success criteria, Phase 3 tasks, tests, review status, and absence of debug artifacts.
3. Documentation update: use the `doc-updater` Codex agent role when documentation changes are needed and subagents are available; otherwise update docs in the current session. Update docs only when behavior, API, setup, architecture, env, roadmap, or user-facing workflow changed. Save output to `.cache/doc-updater.md` or write a no-impact reason.
4. Documentation Docking: compare changed files with `README.md`, API docs, architecture docs, changelog, `.env.example`, roadmap, and issue comments when relevant. Save `.cache/doc-docking.md` with verdict `DOCKED` or `BLOCKED`.
5. Closure decision: scan all phase files for deferred items or user decisions. Ask before reorganizing issues or roadmap.
6. Refresh `kaola-workflow/ROADMAP.md`.
7. Archive `kaola-workflow/{project}/` to `kaola-workflow/archive/{project}/`.
8. Commit and push only approved files.

   ### Cross-Session Staging Guard

   Before any `git add` of files under `kaola-workflow/${KAOLA_PROJECT}/`,
   verify this session owns the project's lease. Codex relies on this
   prompt-level check (no PreToolUse hook); run it unconditionally when
   `KAOLA_SESSION_ID` is set:

   ```bash
   if [ -n "${KAOLA_SESSION_ID:-}" ]; then
     LOCK_FILE="kaola-workflow/.locks/${KAOLA_PROJECT}.lock"
     OWNER=""
     if [ -f "$LOCK_FILE" ]; then
       OWNER="$(node -e "
         try {
           const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
           process.stdout.write(d.session_id || '');
         } catch(e) { process.stdout.write(''); }
       " "$LOCK_FILE" 2>/dev/null)" || true
     fi
     if [ -z "$OWNER" ]; then
       STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
       [ -f "$STATE_FILE" ] && OWNER="$(grep -m1 '^session_id:' "$STATE_FILE" | sed 's/^session_id:[[:space:]]*//')" || true
     fi
     if [ -n "$OWNER" ] && [ "$OWNER" != "$KAOLA_SESSION_ID" ]; then
       echo "BLOCKED: cross-session staging on project '${KAOLA_PROJECT}'. Lock held by ${OWNER}; current session is ${KAOLA_SESSION_ID}." >&2
       exit 1
     fi
   fi
   ```

   Also enforce the single-project rule — if more than one
   `kaola-workflow/*/` project is staged at once, split the commit:

   ```bash
   PROJECT_COUNT=$(git diff --cached --name-only \
     | grep '^kaola-workflow/' \
     | grep -v '^kaola-workflow/\.locks/' \
     | grep -v '^kaola-workflow/\.sessions/' \
     | grep -v '^kaola-workflow/archive/' \
     | grep -v '^kaola-workflow/\.roadmap/' \
     | grep -v '^kaola-workflow/ROADMAP\.md$' \
     | awk -F'/' 'NF>=3 {print $2}' | sort -u | grep -c . || true)
   if [ "${PROJECT_COUNT:-0}" -gt 1 ]; then
     echo "BLOCKED: split your commit — multiple kaola-workflow projects staged." >&2
     exit 1
   fi
   ```

   If either check fails, do not stage; release the project under another
   lease, or coordinate manually. Do not attempt to bypass this guard.

   Before committing, dispatch to the correct sink script based on the `sink` field in `workflow-state.md`:

   ```bash
   claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
   if [ ! -f "$claim_script" ]; then
     claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
   fi
   scripts_dir="$(dirname "$claim_script")"
   SINK_KIND=$(awk '/^## Sink/,0' "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md" | grep '^sink:' | awk '{print $2}')
   SINK_KIND="${SINK_KIND:-merge}"
   SINK_BRANCH=$(grep '^branch:' "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md" | awk '{print $2}')
   case "$SINK_KIND" in
     pr)
       node "$scripts_dir/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" --project "$KAOLA_PROJECT"
       ;;
     merge|*)
       node "$scripts_dir/kaola-workflow-sink-merge.js" --branch "$SINK_BRANCH" --project "$KAOLA_PROJECT"
       ;;
   esac
   ```

## Summary File

```markdown
# Phase 6 - Summary: {project}

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
| documentation docking | invoked | .cache/doc-docking.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | invoked | kaola-workflow/archive/{project} | |
| final commit and push | invoked | git status --short --branch | clean and synced |
```

State remains in `workflow-state.md` until archive is complete.
