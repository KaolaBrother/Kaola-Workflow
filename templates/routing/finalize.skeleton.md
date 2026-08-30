<!-- SLOT:fz-frontmatter -->
<!-- SLOT:fz-h1 -->

<!-- SLOT:fz-intro -->

<!-- KW-COMPACT-RECOVERY-START -->
## Compact recovery contract

This whole block is part of the initial Finalization prompt. A compact-capable runtime re-injects it
once, after compact and before the next model turn. It is never injected by a tool-use hook.
Recovery marker: `KW-COMPACT-RECOVERY-V1`.

Read project-root `AGENTS.md` before acting; it is the universal project-rule source.
Resume Finalization from `workflow-state.md`, `mission-list.md`, and any existing finalization
receipts. A completed item and its result are immutable; one dispatch has one result, including
FAIL/BLOCKED. Freeze the candidate before review; a mutation
invalidates PASS evidence for changed bytes. Finalization, Issue closure, archive, and sink are not
Mission List items. The last run mission establishes readiness for finalization. The finalization
summary, closure evidence, archive state, and sink receipt own the transaction's truth.
A failed command, intermediate finding, repair attempt, or review round does not by itself create a
mission. Keep working within the current promised outcome while custody and causal boundary remain
unchanged. Append a mission only for a new recoverable outcome that changes custody or for a newly
discovered independent causal class.

<!-- KW-RUNTIME-DISPATCH-START -->
<!-- SLOT:runtime-dispatch-common -->

<!-- SLOT:runtime-delegation -->

<!-- KW-RUNTIME-DISPATCH-END -->

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one.
Closing issues with open work, reorganizing forge work, force-pushing, rewriting history, and
resolving real content conflicts require the proposal, reason, and user's answer.
<!-- /PIN -->

Finalization validates, docks docs, writes terminal records, settles closure, archives, commits, and
sinks. It is not a Mission List item. Read `workflow-state.md` and `mission-list.md`; completed
mission results are immutable. The last mission establishes readiness, while the summary, closure,
archive, and sink receipts own terminal truth.

## Card: validation, acceptance, and documentation

Read the claim and Mission List. Finalization is a transaction, never a mission item. A failed
command, intermediate finding, repair attempt, or review round does not by itself create a mission.
Freeze a candidate; mutation invalidates prior PASS evidence for changed bytes.

On this self-host, run producer-selected diff-scoped chains after the candidate is frozen:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-runchains-run -->
```

For a consumer without `test:kaola-workflow:*`, run its own validation and record the exact command:

```bash
<!-- SLOT:fz-scripts-resolver -->
node "$KAOLA_SCRIPTS/kaola-workflow-validation-runner.js" record \
  --project {project} --verdict pass --command "<exact command>"
```

The recorder writes `.cache/final-validation.md` with column-0 `verdict: pass`, the exact command,
and `validated_candidate_hash`; run it from the candidate worktree the finalize transaction reads.

On failure, repair a trivial correction inline or dispatch the role that owns the failure:
`tdd-guide` for acceptance meaning, `build-error-resolver` for build/type/lint/tooling, and the
review gate for a review finding. Use the live runtime adapter and a self-sufficient brief.

<!-- REGION:command — additive runtimes render this through their native dispatch carrier -->
```text
Agent(
  subagent_type="build-error-resolver",
  model="opus",
  description="Routed fix: {the failing command}",
  prompt="the exact failure, evidence path, working directory, custody, and stop boundary"
)
```
<!-- /REGION -->

The runner **measures** the receipt and **reports** what it found. It does not refuse; you own the
verdict. Record its typed result under `validation` in `finalization-summary.md`; preserve
`chain-receipt.json` and `final-validation.md`. Fix meaningful
findings, re-freeze, then rerun affected evidence.

Summarize acceptance honestly: automated/local/manual/UAT legs, exact commands, outputs, commit,
and anything unexecuted. Do not claim unavailable service, device, or physical UAT. A user may own
an explicit acceptance exception; record its boundary.

Walk the issue statement for every claimed member and name what satisfies each part: a covering
test, validation receipt, or prose evidence, judged in context. Mission results record the run's
answers, but there is no mechanical match; a part you cannot satisfy is a blocker, not a footnote.

Review the project Documentation Update Checklist and changed public behavior, APIs, setup,
architecture, environment, validation, README, API docs, architecture docs, changelog, and examples.
Dispatch documentation custody when useful; it must transcribe real signatures, JSON/help/schema or
return BLOCK, never invent fields. Write `.cache/doc-updater.md` and `.cache/doc-docking.md` with
checked files, fixes/no-impact reasons, and `DOCKED`/`BLOCKED`; continue only when docked.

The finalize transaction reports `changed_paths`. Put it under `## Changed Paths`; Nothing compares
that list against a guessed write set. `## Validation`, `## Changed Paths` and `## Mission List` are
where the finalize transaction's own findings land.

## Card: summary and run-gap reconciliation

Run the scanner first:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-gapsweep-scan -->
```

Then create `finalization-summary.md` with Delivered, Files
Changed, Test Coverage, `## Validation`, `## Changed Paths`, `## Mission List`, Documentation
Docking, `## Run gaps`, Follow-Up Items, and final readiness status.

Write the heading exactly `## Run gaps`, with nothing else on the line. Every swept class has one:

- `- <reasonClass> (<sample>): filed: #N` — gap tracked by an open issue.
- `- <reasonClass> (<sample>): noise: <one-line justification>` — gap justified as not worth tracking.

A heading qualifier, prose, or a line that is not a bullet in one of those two forms — prose, or a
row of a markdown table — is not read as a gap. Reconcile the summary against `.cache/run-gaps.json`;
hand-written observations must first enter `.cache/run-gaps-manual.md` and be swept.

After the rows exist, run the reconciliation gate:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-gapsweep-run -->
```

Scan all run records for deferred items, partial work, conflicts, review follow-ups, and user value
decisions. Ask before reorganizing forge work. A run may intentionally keep the whole issue set open
only through the recorded closure decision; never silently mix per-member outcomes.

## Card: file or correct run-discovered work

<!-- PIN: forge-is-the-backlog -->
For each real run-discovered defect, file a follow-up and record `filed: #N`. Give it a priority tier
in the same breath: an issue filed without a `P0`–`P3` label sorts **last** on the open list, beneath
every tiered issue. For a hand-written gap, append the matching `gap: <class> — <text>` line to
`.cache/run-gaps-manual.md` and re-run the scanner, so what is written was actually swept.

`## Measured` carries only what this run observed; every figure there names the commit it was
measured at and the command or artifact it came from. `## Hypothesis` carries attributions no run
has confirmed; a cause derived by reading code lands there by default. `## Proposed remedy
(non-binding)` is optional and carries that label when it appears. Add one `searched:` line recording
the duplicate probe you actually ran — its query and its hit count.

After filing, confirm the issue exists and its body is non-empty, and record the issue number and the
body length you saw in this run's own record. That record is the mission list's result line, never
the `## Run gaps` row.

When evidence corrects the current issue, post that correction as a comment on the issue before it
closes. Never close quietly against text now known to be wrong. A correction is not a follow-up: a
follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned
out to be, and it lands on the issue it corrects.
<!-- /PIN -->

<!-- SPLICE:fz-issue-closure -->
after acceptance and the closure decision. Keep-open applies to the entire claimed set, releases all
claims, and is merge-sink-only; otherwise every issue closes or none does.

## Card: close, archive, sink, and reconcile

Capture branch, sink kind, issue and `issue_numbers` before archive. `--issue-numbers` closes the
whole set or none:

```bash
<!-- SLOT:fz-scripts-resolver -->
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
if [ ! -f "$SINK_STATE_FILE" ]; then
  _COORD="$(git rev-parse --git-common-dir)"; [[ "$_COORD" != /* ]] && _COORD="$(pwd)/$_COORD"
  SINK_STATE_FILE="$(dirname "$_COORD")/$SINK_STATE_FILE"
fi
SINK_BRANCH=$(awk '/^branch:/{print $2}' "$SINK_STATE_FILE")
<!-- SPLICE:fz-sink-issue -->
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | awk '/^sink:/{print $2}'); SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_NUMBERS=$(awk '/^issue_numbers:/{print $2}' "$SINK_STATE_FILE" | tail -1)
SINK_ISSUE_FLAG=""; [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != unset ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
SINK_ISSUE_NUMBERS_FLAG=""; [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | awk '/^issue_action:/{print $2}'); SINK_ISSUE_ACTION=${SINK_ISSUE_ACTION:-close}
SINK_KEEP_OPEN_FLAG=""; [ "$SINK_ISSUE_ACTION" = comment_keep_open ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
ACTIVE_WORKTREE_PATH=$(awk '/^worktree_path:/{print $2}' "$SINK_STATE_FILE"); [ -d "$ACTIVE_WORKTREE_PATH" ] || ACTIVE_WORKTREE_PATH="$PWD"
```

Run the read-only check as one precondition checklist, clear every reported reason, then run the
same ONE resumable script transaction. It never authors implementation commits. The transaction
owns worktree-to-main project-folder sync; never hand-copy a staler main copy. If sync fails because
the main project folder is not writable, repair that destination's access and rerun the check:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize --project {project} --keep-worktree --check --json)
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG)
```

Stage only this project; never stage another run's archive/state or unrelated user changes.
The archive still fails loudly if it would lose a file. Every run file must land under
`kaola-workflow/archive/`. Then use the captured metadata for the forge-specific sink:

```bash
<!-- SPLICE:fz-keepopen-comment -->
if [ "$SINK_KIND" != merge ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then exit 1; fi
case "$SINK_KIND" in
<!-- SPLICE:fz-sink-pr-case -->
    ;;
  merge|*)
<!-- SPLICE:fz-sink-merge-run -->
    ;;
esac
```

Keep-open is whole-run and merge-only. Close/archive/sink truth belongs to their receipts, not the
Mission List. Journals are never deliverables and successful cleanup removes only this lane.

<!-- PIN: sink-reports-orchestrator-owns -->
The sink does not judge your work; it is a reporting mechanism, not a workflow judging your work.
It reports validation, ancestry, publication, closure, and
cleanup findings and stops without merging when it cannot preserve truth. This is not "merge anyway
and report." You remain the person who is accountable for the branch ending up right: get the merge
correct, resynchronize, or publish a review request instead. Then clean up after the sink; never
touch another session's branch/worktree/folder, and ask on real content conflict.
<!-- /PIN -->

<!-- PIN: closure-audit -->
Run the closure audit after success as an after-the-fact drift detector:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-closure-audit-run -->
```

It reports scoped and outside-scope drift without turning exit zero into a verdict. If the sink
reported that it did not complete, the step it names is where to resume; receipts keep retry
idempotent.
<!-- /PIN -->

Only after every issue is closed (or the user-authorized whole set is kept open), the folder is
archived, and publication is proven may finalization stop and await explicit redirection.

<!-- KW-COMPACT-RECOVERY-END -->
