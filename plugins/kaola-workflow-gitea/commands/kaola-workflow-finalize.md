---
description: Kaola-Workflow Finalization. Final validation, documentation, roadmap/archive, commit, and issue update.
argument-hint: <project name>
---

# Kaola-Workflow Finalization

Finalization proves the workflow is complete and records final metadata. Do not
repair inline when final validation fails except under the Trivial Inline Edit
Exception below.

## Prerequisite

Read `workflow_path` from `kaola-workflow/{project}/workflow-state.md` (defaults to `full` when absent).

If `workflow_path: fast`:
- `fast-summary.md` must exist with status `PASSED`. If missing, stop:
  ```text
  Fast-path summary is not complete. Run /kaola-workflow-fast first.
  ```
If `workflow_path: adaptive`:
- `workflow-plan.md` must exist, be frozen (re-check `plan_hash`), and every
  `## Node Ledger` row must be `complete` or `n/a`. Adaptive runs have no
  `phase5-review.md`; Finalization anchors on the plan's completion state. The barrier is
  **script-enforced** (#231) by three gates — run all three and capture each exit code
  DIRECTLY (never gate on a piped `| tail`, which masks failure):
  ```bash
  PLAN=kaola-workflow/{project}/workflow-plan.md
  # Resolve the validator via the kaola_script() resolver (#345): a bare relative
  # validator path is MODULE_NOT_FOUND in a consumer plugin install (no local scripts
  # dir), turning the only blocking pre-merge enforcement into a false BLOCK.
  kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
  VALIDATOR="$(kaola_script kaola-gitea-workflow-plan-validator.js)"
  node "$VALIDATOR" "$PLAN" --resume-check --json; RC=$?
  node "$VALIDATOR" "$PLAN" --gate-verify --json; GV=$?
  node "$VALIDATOR" "$PLAN" --barrier-check --json; BC=$?
  node "$VALIDATOR" "$PLAN" --verdict-check --json; VC=$?
  if [ "$RC" -ne 0 ] || [ "$GV" -ne 0 ] || [ "$BC" -ne 0 ] || [ "$VC" -ne 0 ]; then
    echo "BLOCKED: adaptive barrier failed (resume=$RC gate=$GV barrier=$BC verdict=$VC) — run /kaola-workflow-plan-run first"; exit 1
  fi
  ```
  - `--gate-verify` proves every completed code/sensitive node is post-dominated by a
    **completed** reviewer in the `## Node Ledger` (closes G1/H5). **G3 (#334): a
    non-delegable `main-session-gate` must be complete — never `n/a` — and post-dominate
    completed code nodes.**
  - `--barrier-check` re-scans the files actually written (git diff vs the merge-base
    of HEAD and `origin/main`) and refuses a sensitive write with no `security-reviewer`
    node, or an out-of-allowlist production write (closes H1/H3). Any nonzero exit
    **blocks the merge**.
  - `--verdict-check` reads every completed gate-role node's `.cache/{node-id}.md` and
    requires `verdict: pass` with `findings_blocking: 0`. Any nonzero exit **blocks the
    merge** — proves every code-reviewer/security-reviewer/adversarial-verifier/main-session-gate node
    recorded a passing verdict.
  On any failure stop with a **typed refusal** (do not proceed):
  ```text
  Adaptive plan failed the script-enforced barrier. Run /kaola-workflow-plan-run first.
  ```
If `workflow_path: full` (or absent):
- `phase5-review.md` must exist with status `PASSED` or `PASSED WITH FOLLOW-UPS`. If missing, stop:
  ```text
  Phase 5 is not complete. Run /kaola-workflow-phase5 first.
  ```

### Run-Gap Sweep Gate

Finalization is **machine-gated** on a clean run-gap sweep (#435). Before
proceeding past the prerequisite check, verify `.cache/run-gaps.json` and
`finalization-summary.md`'s `## Run gaps` section and stop with a typed
refusal if the following is true:

- **`gaps_unswept`** — emitted by
  `kaola_script kaola-gitea-workflow-gap-sweep.js --check` (using the
  edition's `kaola_script()` resolver above) when `.cache/run-gaps.json`
  contains a swept reason class with no matching entry in the `## Run gaps`
  section of `finalization-summary.md`, or when that section is absent while
  swept classes exist.
  Remedy: for each real run-discovered defect (`in_run_repair`,
  `deferred_red_chain`, or `manual:<slug>`), file a follow-up issue with the
  forge and record `filed: #N` in the `## Run gaps` section. If the item is
  not a product defect (upstream flake, tool-environment noise, or an
  already-filed and tracked waiver), record `noise: <one-line justification>`
  instead.

This typed refusal is classified structurally — do not string-match.

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
- Do not close a Gitea issue until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Do not create tracked file edits after the final commit, except the sanctioned
  PR metadata follow-up commit produced automatically by `sink-pr.js`. No other post-final commits are permitted.
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
You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the `model=` line.

## Validation Delegation Policy

Finalization is the final validation gate. The required full relevant project
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

- Finalization runs each full relevant final command once against the final candidate
  state.
- Do not rerun Phase 4 or Phase 5 targeted commands separately when the Finalization
  full command already covers them.
- If a Finalization command already passed after the last relevant file change, cite
  its evidence path instead of rerunning it.
- After a routed fix or Trivial Inline Edit Exception edit, rerun the failed or
  affected command. Rerun broader validation only when shared infrastructure,
  dependencies, build config, or public behavior changed.
- **State the actual reuse boundary, not a false absolute (#324 AC3).** When you cite
  a prior run instead of rerunning, record WHICH node/state that run covered and that
  later finalize-step edits (e.g. a `CHANGELOG.md`/docs touch in the finalize node)
  are outside it. Do NOT write a terminal absolute like `No files changed after those
  runs` when the finalize node itself changes docs/changelog afterward — say e.g.
  `validation reuse covers code/test impact through node nN; the finalize-node
  CHANGELOG edit is docs-only and outside the rerun trigger`. (At closure,
  `archiveProjectDir` also mechanically neutralizes the known false-absolute phrase in
  the archived `.cache/final-validation.md` as a backstop, but the accurate boundary
  is yours to state here.)

## Trivial Inline Edit Exception

The main session may make a trivial inline edit without emergency fallback only
when all conditions are true:

- the edit is one line or mechanically obvious
- no behavior, API, security, architecture, test intent, release, or design
  judgment is required
- it fixes finalization friction, formatting, an unused import, a typo, import
  ordering, or an obvious generated path/name mistake
- it stays inside the approved implementation/docs/workflow artifact scope
- it is recorded in `finalization-summary.md` or `workflow-state.md`
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

If none exist, record the scan in `finalization-summary.md` and continue.

If any exist, route them directly to the USER:

1. Summarize each deferred item, unresolved conflict, partial-implementation note,
   open review follow-up, or decision that needs the user — with your own
   recommendation for the safest next step and whether the current item can close.
2. Ask the user for permission before creating, closing, splitting, merging, or
   reorganizing roadmap entries or Gitea issues.

## Step 1 - Final Validation

Update `workflow-state.md`:

```text
stage: finalization
stage_name: Finalization
step: final-validation
next_command: /kaola-workflow-finalize {project}
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

Create `kaola-workflow/{project}/finalization-summary.md`:

```markdown
# Finalization Summary: {project}

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
[none needed/user approved next steps]

## Commit And Push
[pending final Git gate; final hash is reported after push and is not written back here]

## Gitea Issue
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
| final-validation fix executors | invoked/N/A | .cache/final-validation-fix-*.md | [reason if N/A] |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
```

## Step 6 - Closure Decision Gate

Run the Closure Decision Gate described above.

If deferred items, conflicts, partial work, or user-decision items exist, stop and
ask the user for permission before changing roadmap or issue organization.

If the user approves issue or roadmap reorganization, make those changes before
the final Git gate.

## Step 7 - Gitea Issue, Roadmap, Archive, And Metadata

If the project links a Gitea issue (from `phase1-research.md` on the full path,
or `issue_number` in `workflow-state.md` on the fast path):

- close it only after acceptance criteria pass and the Closure Decision Gate says
  the implementation is complete
- keep it open if follow-ups, partial implementation, or unresolved user
  decisions remain
- for `issue_action: comment_keep_open` (keep-open partial-close terminal), do NOT
  close; post the substantive partial-close comment listing the residual scope
  instead (the mechanical keep-open comment is posted by `sink-merge`)
- create/update follow-up issues only after user permission when the Closure
  Decision Gate found decision items
- comment with validation evidence and the planned commit message; add the final
  commit hash only after push if doing so does not dirty the local worktree

**Roadmap regeneration:**

The actual roadmap closure (delete `kaola-workflow/.roadmap/issue-N.md` +
regenerate `ROADMAP.md` via `kaola-gitea-workflow-roadmap.js generate`) is
performed by `cmdFinalize` / `archiveProjectDir` at Step 8b. The git-add staging
runnable body lives exclusively in `agents/contractor.md` (Step 7 of the
Mechanical Finalization Procedure): the contractor only stages the result — the
deleted per-issue file and the regenerated `ROADMAP.md` — with `git add`. It does
not re-run the delete or generate. This ensures the closure happens exactly once,
owned solely by `cmdFinalize`.

Do not reorganize roadmap entries that came from closure decision items until the user has approved the next step.

Archive is performed atomically by `cmdFinalize` in Step 8b below. Do not perform a manual copy or git mv here.

**Keep-open partial-close runs (#333/#336).** If the Closure Decision Gate keeps the issue OPEN
(partial implementation, residual follow-ups), still archive through the SAME `finalize`
subcommand, adding `--keep-open`. It stamps the archived `workflow-state.md` terminal
(`last_result: closed_keep_open`, `issue_disposition: kept-open`, no active `next_command`) so a
later resume/audit cannot mistake the archived run for active work. Never archive by manual
`mv`/`git mv` — a bypassed archive preserves claim-time state (`status: active`, pending gates)
forever (a re-run of `finalize` over such a manual archive now heals it in place, but the
supported path is `--keep-open`). See the **Keep-Open Terminal Mode** section below for the full
script-side lane (roadmap retention, guaranteed no-close sink, merge-sink-only fence).

Update `finalization-summary.md` with:

- final Gitea issue state
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
# #261/#294: a staged archive/<other>/ that is NOT the finalized project is a swept-in stray.
# Compare {project} as a fixed string (awk index/equality), never as a regex, so a project
# name carrying regex metacharacters cannot make this guard fail open (#294).
FOREIGN_ARCHIVE=$(git diff --cached --name-only \
  | grep '^kaola-workflow/archive/' \
  | awk -F'/' 'NF>=3 {print $3}' | sort -u \
  | awk -v p="{project}" '$0 != p && index($0, p ".archived-") != 1' || true)
if [ -n "$FOREIGN_ARCHIVE" ]; then
  echo "BLOCKED: a foreign project's archive band is staged (${FOREIGN_ARCHIVE}) — only {project}'s archive may be committed. Unstage the stray archive/<other>/ before committing." >&2
  exit 1
fi
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

## Keep-Open Terminal Mode (partial-close)

A run can be **complete as a cycle** while the Gitea issue must **stay OPEN** as a residual
vehicle (partial implementation, deferred follow-ups). The durable signal is one optional line
in the `## Sink` block of `workflow-state.md`:

```
issue_action: comment_keep_open      # default when absent: close
```

This field is written by the **main session** when the keep-open decision is made — at the
Closure Decision Gate, with user approval (no startup flag). Behavior under keep-open:

- The Gitea issue is **NOT closed**. `sink-merge` posts a mechanical keep-open comment instead
  of closing; the substantive partial-close comment listing the residual scope is main-session
  issue governance in **Step 7**.
- The roadmap source `kaola-workflow/.roadmap/issue-N.md` is **preserved** and `ROADMAP.md` is
  regenerated still listing #N (closure invariant `keep-open-roadmap-preserved` enforces it).
- The claim is released and the worktree/branch removed, exactly like a normal close.
- The archive is stamped `last_result: closed_keep_open` + `issue_disposition: kept-open`; the
  closure receipt records `remote_issue_closed: kept_open` and `roadmap_source_removed: kept`.

**Keep-open is merge-sink-only.** A PR sink would auto-close the kept-open issue via its
hard-coded `Closes #N` body, and `watch-pr`'s archive-on-merge would delete the preserved
roadmap source. Step 9 therefore (1) refuses a non-merge sink under keep-open before the case
statement, (2) refuses the exit-3 merge-impossible auto-pivot with a typed BLOCKED (manual
remediation, never auto-pivot), and (3) the `sink-pr.js` script itself refuses when the live OR
archived state carries `issue_action: comment_keep_open`.

The Completion Contract still applies: keep-open is **one terminal** for the run.

## Sink Metadata Capture (before contractor dispatch)

Capture sink metadata now, while `workflow-state.md` still exists. The contractor
archives it during Step 8b; the main session reuses these variables in Step 9. Shell
variables do NOT cross the subagent boundary, so this capture runs here (main session)
and the contractor re-derives its own copy.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_FLAG=""
[ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
# #369: bundle member set — sink-merge closes EVERY member (all-or-nothing), not just the primary.
SINK_ISSUE_NUMBERS=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_numbers:' | awk '{print $2}')
[ -z "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS=$(grep '^issue_numbers:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE_NUMBERS_FLAG=""
[ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
# #336: keep-open partial-close terminal — issue_action defaults to close when absent.
SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_action:' | awk '{print $2}')
SINK_ISSUE_ACTION=${SINK_ISSUE_ACTION:-close}
SINK_KEEP_OPEN_FLAG=""
[ "$SINK_ISSUE_ACTION" = "comment_keep_open" ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
ACTIVE_WORKTREE_PATH="$(pwd)"
_WT_PRE="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -n "$_WT_PRE" ] && [ -d "$_WT_PRE" ] && ACTIVE_WORKTREE_PATH="$_WT_PRE"
```

## Mechanical Finalization (delegated to the contractor)

Dispatch the contractor to execute the mechanical finalization. The full
procedure body (Step 8a artifact mirror, Step 8b cmdFinalize archive + status
close, Step 7 roadmap regen + git-add staging, and Step 8 commit gate) lives
exclusively in `agents/contractor.md` — the contractor reads it there.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical finalize {project}",
  prompt="Run the mechanical finalization for {project} (sink kind SINK_KIND, issue action SINK_ISSUE_ACTION). Execute the full procedure in your contractor profile: Step 8a (artifact mirror), Step 8b (cmdFinalize archive + status close, --keep-worktree, merge path only — add --keep-issue-open when SINK_ISSUE_ACTION is comment_keep_open), the Step 7 roadmap regen + git-add staging, and the Step 8 commit gate (chore: finalize {project}). Re-derive your own kaola_script/CLAIM_JS and re-read SINK_KIND/SINK_ISSUE_ACTION from workflow-state.md (it exists until cmdFinalize archives it). Return a compact bookkeeping summary; do NOT run Step 9 (the sink), do NOT close the issue, do NOT judge."
)
```

### Attestation boundary (closure receipt)

The contractor's Step 8b passes `--attest-contractor-spawn` to `cmdFinalize`, so a genuinely
delegated run back-fills its own dispatch marker and the closure receipt reads
`finalize_contractor_attested: attested` even where the SubagentStart hook cannot fire (a
contractor dispatched into a linked worktree, or a hookless harness). This back-fill is the
contractor's; the main session must never pass the flag on an inline run.

The adaptive plan's `finalize (<node>)` Required Agent Compliance row is recorded
`main-session-direct` (the in-plan sink bookkeeping is, by the plan-run contract, performed by the
main session). That row neither requires nor replaces the contractor's delegation of mechanical
finalization here — they are two distinct contracts on two distinct steps.

**Inline-fallback contract.** If the contractor tooling is genuinely unavailable and the session
runs the mechanical finalization inline, it must (a) record `local-fallback-tool-unavailable` with
evidence in Required Agent Compliance, and (b) NOT pass `--attest-contractor-spawn`. The resulting
`finalize_contractor_attested: missing` plus the ATTESTATION WARNING is then the truthful, expected
outcome — attestation is warn-first and never blocks finalization.

## Crash Recovery

If the session crashes after `cmdFinalize` archives the project folder but before the Step 8 `git commit` runs, finalize is resumable.

**Detect:** run from the worktree root:

```bash
node "$CLAIM_JS" resume --project {project} --json
```

A result with `"reason":"finalize_incomplete"` confirms the archive dir (`kaola-workflow/archive/{project}/`) is present but uncommitted. `"reason":"already_finalized"` means the commit already landed — no action needed.

**Recover:** re-dispatch the contractor with the same finalization prompt. Step 8b re-runs `cmdFinalize --keep-worktree`; it detects the source-missing state and stages the already-archived dir, then proceeds through Step 7 and Step 8 normally.

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
: "${SINK_ISSUE_NUMBERS_FLAG:=}"
```

Dispatch based on `SINK_KIND`:

```bash
# #336: keep-open is merge-sink-only — refuse a PR sink before dispatch.
if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
  echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink. PR sinks close via the merged PR; switch sink: merge or remove issue_action." >&2
  exit 1
fi
case "$SINK_KIND" in
  mr|pr)
    kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
    SINK_PR_JS="$(kaola_script kaola-gitea-workflow-sink-pr.js)"
    node "$SINK_PR_JS" \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      --project {project}
    ;;
  merge|*)
    kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
    SINK_MERGE_JS="$(kaola_script kaola-gitea-workflow-sink-merge.js)"
    node "$SINK_MERGE_JS" \
      --branch "$SINK_BRANCH" \
      $SINK_ISSUE_FLAG \
      $SINK_ISSUE_NUMBERS_FLAG \
      $SINK_KEEP_OPEN_FLAG \
      --project {project}
    _SINK_MERGE_EXIT=$?
    if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
      # #336: keep-open is merge-sink-only — never auto-pivot to a PR sink (its Closes #N body
      # would close the kept-open issue; watch-pr would delete the preserved roadmap source).
      if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
        echo "BLOCKED: sink-merge exited 3 (merge-impossible) on a keep-open run. Keep-open is merge-sink-only: the PR fallback body closes the issue on merge and watch-pr would delete the preserved roadmap source. Remediate the merge blocker (see .cache/sink-fallback.json) and re-run sink-merge; do not pivot to a PR sink." >&2
        exit 1
      fi
      cd "$_MAIN_ROOT"
      CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"
      node "$CLAIM_JS" sink-fallback \
        --project {project}
      SINK_PR_JS="$(kaola_script kaola-gitea-workflow-sink-pr.js)"
      node "$SINK_PR_JS" \
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
- Exit 3: merge-impossible (branch protection, non-fast-forward, permission denied). Receipt written to `.cache/sink-fallback.json`. Finalization pivots to PR creation automatically — except on keep-open runs (`SINK_KEEP_OPEN_FLAG` set), where exit 3 is a typed BLOCKED refusal requiring manual remediation of the merge blocker; keep-open is merge-sink-only.

`sink-pr.js` exit codes:
- Exit 0: branch pushed, PR opened, URL recorded in the `## Sink` block and committed in a metadata follow-up commit. If `pr_auto_merge: true` in config, auto-merge was requested.
- Exit 1: fatal error (push failed, `tea pr create` failed, or metadata commit/push failed). PR URL and manual recovery instructions printed to stderr when PR was already created.

After `sink-pr.js` exits 0, the active folder remains open. It is archived automatically when `watch-pr` detects the PR is MERGED or CLOSED on the next `/workflow-next` startup.

## Completion Contract

This phase closes exactly one issue. After issue #N is closed and the active
folder is archived, the single-issue completion contract is satisfied. Do not auto-route
into the next issue in line. Stop and await explicit re-direction from the user.
