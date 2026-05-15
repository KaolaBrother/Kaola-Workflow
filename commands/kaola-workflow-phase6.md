---
description: Kaola-Workflow Phase 6. Final validation, documentation, roadmap/archive, commit, and issue update.
argument-hint: <project name>
---

# Kaola-Workflow Phase 6 - Finalize

Phase 6 proves the workflow is complete and records final metadata. Do not
repair inline when final validation fails except under the Trivial Inline Edit
Exception below.

## Prerequisite

`phase5-review.md` must exist with status `PASSED` or `PASSED WITH FOLLOW-UPS`.
If missing, stop:

```text
Phase 5 is not complete. Run /kaola-workflow-phase5 first.
```

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
kaola-workflow/{project}/phase5-review.md
```

## Session Heartbeat

If a claim session is active, ensure the background heartbeat ticker is running:

```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && {
  _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
  if [ ! -f "$_TICKER_PID_FILE" ]; then
    nohup node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  fi
}
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
- Do not close a GitHub issue until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Do not create tracked file edits after the final commit.
- Commit and push only after documentation, issue updates, roadmap refresh,
  archive movement, and final metadata are complete.
- If `/prp-commit` is unavailable, stage the approved implementation, docs, and
  workflow artifacts for this project only.
- If push cannot complete because no upstream exists, authentication fails, or
  the remote rejects the update, stop with exact remediation steps. Do not
  create a second cleanup commit unless the user explicitly approves it.

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
   reorganizing roadmap entries or GitHub issues.

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

## Step 2 - Acceptance Check

Verify:

- deliverable matches Phase 1 success criteria
- all Phase 3 tasks complete
- tests pass and coverage target is met or justified
- no type errors or lint errors
- no CRITICAL or HIGH review findings remain
- no debug statements remain

## Step 3 - Documentation Update

Read project root `CLAUDE.md`. Look for `Documentation Update Checklist`.

This is a required documentation gate.

If checklist exists, invoke ECC `doc-updater` with changed files and checklist.

If missing, create or append the checklist, then invoke `doc-updater`:

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

Write agent output to:

```text
kaola-workflow/{project}/.cache/doc-updater.md
```

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

## GitHub Issue
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

## Step 7 - GitHub Issue, Roadmap, Archive, And Metadata

If `phase1-research.md` links a GitHub issue:

- close it only after acceptance criteria pass and the Closure Decision Gate says
  the implementation is complete
- keep it open if follow-ups, partial implementation, or unresolved user
  decisions remain
- create/update follow-up issues only after user permission when the Closure
  Decision Gate found decision items
- comment with validation evidence and the planned commit message; add the final
  commit hash only after push if doing so does not dirty the local worktree

**Roadmap regeneration:**

If this project was linked to GitHub issue N, delete its per-issue roadmap file:

```bash
rm -f kaola-workflow/.roadmap/issue-N.md
```

(`rm -f` is idempotent — safe if the file is missing or no issue was linked.)

Regenerate `ROADMAP.md` from the remaining per-issue files:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" generate
```

Stage both the deleted per-issue file and the regenerated `ROADMAP.md` together in the final commit:

```bash
git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md
```

The `<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->` comment at the top of `ROADMAP.md` signals that the file is machine-managed.

Do not reorganize roadmap entries that came from closure decision items until the user has approved the advisor-backed next step.

Archive only after summary exists:

```text
kaola-workflow/{project}/ -> kaola-workflow/archive/{project}/
```

If destination exists, append a timestamp suffix.

Update `phase6-summary.md` with:

- final GitHub issue state
- final roadmap state
- final archive path
- documentation docking result
- closure decision result
- compliance table with no `pending` rows, except `final commit and push` may be
  `ready` because it runs after this tracked file is finalized

Before the final Git gate, verify every other `Required Agent Compliance` row
across phase files is `invoked`, `skipped`, or `N/A` with evidence or skip
reason.

## Step 8 - Sink

Read the `## Sink` block from `kaola-workflow/{project}/workflow-state.md`:

```bash
SINK_BRANCH=$(grep '^branch:' kaola-workflow/{project}/workflow-state.md | awk '{print $2}')
SINK_ISSUE=$(grep '^issue_number:' kaola-workflow/{project}/workflow-state.md | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' kaola-workflow/{project}/workflow-state.md | grep '^sink:' | awk '{print $2}')
SINK_KIND=${SINK_KIND:-merge}
```

If `SINK_ISSUE` is `unset`, omit `--issue`. Build the issue flag conditionally:

```bash
SINK_ISSUE_FLAG=""
[ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
```

Dispatch based on `SINK_KIND`:

```bash
case "$SINK_KIND" in
  pr)
    node ~/.claude/kaola-workflow/scripts/kaola-workflow-sink-pr.js \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      --project {project}
    ;;
  merge|*)
    node ~/.claude/kaola-workflow/scripts/kaola-workflow-sink-merge.js \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      --project {project}
    ;;
esac
```

`sink-merge.js` exit codes:
- Exit 0: branch merged onto main, issue closed (online), local branch deleted. Confirm worktree is on main with `git status --short --branch`.
- Exit 1: conflict or fatal error. Rebase conflict remediation printed to stderr. Re-run after resolving.
- Exit 2: FF race exhausted after MAX_AUTOMERGE_RETRIES retries. Follow printed remediation instructions.

`sink-pr.js` exit codes:
- Exit 0: branch pushed, PR opened, URL recorded in lock file and `## Sink` block. If `pr_auto_merge: true` in config, auto-merge was requested.
- Exit 1: fatal error (push failed or `gh pr create` failed). Error printed to stderr.

After `sink-pr.js` exits 0, the lease remains active. The PR lease releases automatically when `watch-pr` detects the PR is MERGED or CLOSED on the next `/workflow-next` startup.
