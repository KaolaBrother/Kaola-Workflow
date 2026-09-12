---
name: kaola-workflow-finalize
description: Use when Kaola-Workflow for Codex work, also called kaola-workflow, is finished and needs final validation, documentation docking, issue closure, archiving, and the sink.
---
# Kaola-Workflow Finalize

Closes out a run and records what it delivered.

<!-- KW-COMPACT-RECOVERY-START -->
## Finalization operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Finalization procedure. After
compact, the native V2 carrier restores global contract and dispatch, rereads durable state, then
completely reloads this prompt; no tool-use hook injects it. Read project `AGENTS.md`; it
supplements verified local facts and constraints. A project exception must state its scope and
must not weaken higher-priority instructions or host safety boundaries. Then resume from
existing finalization receipts.

<!-- KW-RUNTIME-DISPATCH-START -->
## Delegation

**Runtime dispatch contract (always loaded).**

Choose dispatch or inline per item: re-evaluate the choice for every mission item; one item's
choice never establishes a run-wide default. The absence of an exact named role is not proof that
all native subagent dispatch is unavailable. Keep one owner for the current cohesive production
surface when handoff and integration cost exceed the benefit, but that scope does not absorb
independent research, test authorship, documentation, or review items. Dispatch when it materially
reduces main-context residue, lets a clean context check what your own cannot, or enables genuinely
independent parallel work. Both modes are first-class; width follows the true work frontier. No
dispatch count, cap, disjointness proof, justification, approval, or fallback stigma attaches to the
judgment.

A subagent is an executor in a clean context, not a judge; where Kaola installs profiles it runs the
subagent default binding. Its handback is evidence. You hold the verdict, and you reach it by reading
the candidate — the diff, the findings, the command output — never the `result` prose alone. The
subagent burns its own narrow context, which is cheap; what you read back burns the main context,
which is the most expensive one there is and the one compaction eats. So ask for small, structured
handbacks rather than fanning out and reading everything. Fan out where breadth pays and every
handback stays small: exploring, measuring, refuting one stated claim, reviewing the same frozen
diff along different cuts (correctness, test custody, trust boundary), or producing candidates you
then choose between. Do not fan out to write the same production surface in parallel, and do not
ask the same question again expecting a different answer; more dispatch changes the cut, not the
count. When the cheaper child keeps failing an item, take it over and finish it inline; there is no
escalation ladder.

Treat the active runtime adapter below as fact authority. Inspect its effective profile discovery
and precedence, live call schema and verified fields, the subagent default binding,
model/effort/thought carrier or inheritance, tool and custody boundaries, and native background,
parallel, resume, nesting, reload, and session limits. Unknown fields stay unknown; live schema wins.

Use named, built-in, and generic routes only under their real identities. The subagent default
binding guides selection but never disables a task-sensitive override the host actually exposes. If
an exact role is absent, inspect adequate native routes; use one only when it satisfies custody,
evidence, and stop boundaries. Otherwise work inline, record the specific `capability_gap`, and
re-evaluate the next item. Never let a generic route claim a named role's identity. On a runtime
that installs no Kaola role profiles, the absence of a named role is design, not a capability gap;
choose a native route or work inline per item.

Before dispatch, write the mission's `dispatched` locator. Send a bounded, self-sufficient brief
naming the outcome, evidence, worktree or commit, custody, and stop condition. Reconcile the
promised output, not the worker.

<!-- KW-RUNTIME-DELEGATION-START -->
## Runtime adapter facts

Host: Codex. If the running host is not Codex, ignore this adapter section entirely and use the Kaola adapter installed for the actual host; if none is installed, record `capability_gap: no Kaola adapter for host <name>` and work inline.

Find the effective project or user `.codex/config.toml`, inspect its managed `[agents.<role>]` registration, then inspect the referenced `.codex/agents/kaola-workflow/<role>.toml` profile; `agents.toml` is installer source, not an installed lookup path.
Dispatch with the `spawn_agent` schema exposed by this Codex host and `agent_type: "<role>"`; omit per-call `model` and `reasoning_effort` because the TOML profile pins `gpt-5.6-luna` / `max` and file values take precedence, while preserving supported `fork_turns` and service-tier choices.

**Subagent default:** every installed Kaola TOML profile pins `model = "gpt-5.6-luna"` and `model_reasoning_effort = "max"`; file values take precedence over spawn parameters and the parent session, so omit per-call `model` and `reasoning_effort`.
**Roles:** `code-explorer`, `code-reviewer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `tdd-guide`.

The Codex host policy owns the actual tool boundary; the generated TOML profile owns the role behavior, not a duplicated tool list.
Native alternatives include the general `default`, implementation-owning `worker`, read-heavy `explorer`, and any other type the host reports; use each only under its real contract.
Honor the current session's multi-agent exposure, V1/V2 call schema, type catalog, history-fork choices, and host-owned nesting/concurrency limits; a missing custom `agent_type` does not hide other `spawn_agent` routes.
<!-- KW-RUNTIME-DELEGATION-END -->

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
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-run-chains.js" --project {project}
```

For a consumer without `test:kaola-workflow:*`, run its own validation and record the exact command:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-validation-runner.js" record \
  --project {project} --verdict pass --command "<exact command>"
```

The recorder writes `.cache/final-validation.md` with column-0 `verdict: pass`, the exact command,
and `validated_candidate_hash`; run it from the candidate worktree the finalize transaction reads.

On failure, repair a trivial correction inline, or dispatch a suggested route: `tdd-guide` or
yourself for acceptance meaning; `implementer` or yourself for a build, type, lint, or tooling
failure; after your own verdict on a review finding, `implementer` or yourself for the fix. Use the
live runtime adapter and a self-sufficient brief.


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

Review AGENTS.md's documentation checklist against changed public behavior — APIs, setup,
architecture, environment, validation, README, API docs, architecture docs, changelog, and examples
— and follow it; do not relist its files here. Dispatch `doc-updater` when useful; it must
transcribe real signatures, JSON/help/schema or return BLOCK, never invent fields. Write one docking
evidence file, `.cache/doc-docking.md`, with checked files, fixes/no-impact reasons, and
`DOCKED`/`BLOCKED`; continue only when docked.

The finalize transaction reports `changed_paths`. Put it under `## Changed Paths`; Nothing compares
that list against a guessed write set. `## Validation` and `## Changed Paths` are where the finalize
transaction's own findings land.

## Card: summary

Create `finalization-summary.md` with Delivered, Files Changed, Test Coverage, `## Validation`,
`## Changed Paths`, Documentation Docking, Follow-Up Items, and final readiness status.

Scan all run records for deferred items, partial work, conflicts, review follow-ups, and user value
decisions. Ask before reorganizing forge work. A run may intentionally keep the whole issue set open
only through the recorded closure decision; never silently mix per-member outcomes.

## Card: file or correct run-discovered work

<!-- PIN: forge-is-the-backlog -->
For each real run-discovered defect, file a follow-up and record `filed: #N`. Give it a priority tier
in the same breath: an issue filed without a `P0`–`P3` label sorts **last** on the open list, beneath
every tiered issue.

`## Measured` carries only what this run observed; every figure there names the commit it was
measured at and the command or artifact it came from. `## Hypothesis` carries attributions no run
has confirmed; a cause derived by reading code lands there by default. `## Proposed remedy
(non-binding)` is optional and carries that label when it appears. Add one `searched:` line recording
the duplicate probe you actually ran — its query and its hit count.

After filing, confirm the issue exists and its body is non-empty, and record that in this run's own
finalize-transaction record — never in a completed Mission's result, which stays immutable.

When evidence corrects the current issue, post that correction as a comment on the issue before it
closes. Never close quietly against text now known to be wrong. A correction is not a follow-up: a
follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned
out to be, and it lands on the issue it corrects.
<!-- /PIN -->

If the project links issues, close every GitHub issue in the set — but only
after acceptance and the closure decision. Keep-open applies to the entire claimed set, releases all
claims, and is merge-sink-only; otherwise every issue closes or none does.

## Card: close, archive, sink, and reconcile

Capture branch, sink kind, issue and `issue_numbers` before archive. `--issue-numbers` closes the
whole set or none:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
if [ ! -f "$SINK_STATE_FILE" ]; then
  _COORD="$(git rev-parse --git-common-dir)"; [[ "$_COORD" != /* ]] && _COORD="$(pwd)/$_COORD"
  SINK_STATE_FILE="$(dirname "$_COORD")/$SINK_STATE_FILE"
fi
SINK_BRANCH=$(awk '/^branch:/{print $2}' "$SINK_STATE_FILE")
SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
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
# keep-open is merge-sink-only — a PR sink would close the kept-open issue.
if [ "$SINK_KIND" != merge ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then exit 1; fi
case "$SINK_KIND" in
  pr)
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
    ;;
  merge|*)
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
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
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js" --project {project}            # scoped verdict, dry-run (default)
# node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js" --project {project} --execute  # repair safe local drift, scoped
```

It reports scoped and outside-scope drift without turning exit zero into a verdict. If the sink
reported that it did not complete, the step it names is where to resume; receipts keep retry
idempotent.
<!-- /PIN -->

Only after every issue is closed (or the user-authorized whole set is kept open), the folder is
archived, and publication is proven may finalization stop and await explicit redirection.

<!-- KW-COMPACT-RECOVERY-END -->
