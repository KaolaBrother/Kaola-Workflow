---
description: Kaola-Workflow Finalization. Final validation, documentation docking, closure, archive, commit, and sink.
argument-hint: <project name>
---
# Kaola-Workflow Finalization

`/kaola-workflow-finalize` closes out a run and records what it delivered.

<!-- KW-COMPACT-RECOVERY-START -->
## Finalization operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Finalization procedure.
Read project `AGENTS.md`. Then resume from existing finalization receipts.

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
the candidate — the diff, the findings, the command output — never the `result` prose alone. Ask for
small, structured handbacks rather than fanning out and reading everything. Fan out where breadth
pays and every handback stays small: exploring, measuring, refuting one stated claim, reviewing the
same frozen diff along different cuts (correctness, test custody, trust boundary), or producing
candidates you then choose between. When the cheaper child keeps failing an item, take it over and
finish it inline.

Use named, built-in, and generic routes only under their real identities. The subagent default
binding guides selection but never disables a task-sensitive override the host actually exposes. If
an exact role is absent, inspect adequate native routes; use one only when it satisfies custody,
evidence, and stop boundaries. Otherwise work inline, record the specific `capability_gap`, and
re-evaluate the next item. Never let a generic route claim a named role's identity. On a runtime
that installs no Kaola role profiles, the absence of a named role is design, not a capability gap;
choose a native route or work inline per item.

Send a bounded, self-sufficient brief naming the outcome, evidence, worktree or commit, custody, and
stop condition.

<!-- KW-RUNTIME-DELEGATION-START -->
## Runtime adapter facts

Host: Claude. If the running host is not Claude, ignore this adapter section entirely and use the Kaola adapter installed for the actual host; if none is installed, record `capability_gap: no Kaola adapter for host <name>` and work inline.

Find named profiles in project `.claude/agents/`, user `~/.claude/agents/`, plugin `agents/`, managed settings, or the current session's `--agents`; managed/session/project/user/plugin precedence remains Claude-owned, and the Kaola installer uses the user directory by default.
Dispatch with `Agent` and `subagent_type: "<role>"`; installed Kaola profiles pin `model: sonnet`, so omit the per-call model unless the item needs a stronger child.

**Subagent default:** every installed Kaola profile pins `model: sonnet`; effort is not pinned and follows the runtime default; omit the per-call model unless the item needs a stronger child.
**Roles:** `code-explorer`, `code-reviewer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `tdd-guide`.

The named profile's native `tools` allowlist carries the role tool boundary.
Native alternatives include the full `general-purpose` agent, read-only `Explore` and `Plan`, catch-all `claude`, background or isolated children, and optional agent teams; use only the route whose real capability fits the current item.
Inspect the current Agent/Task type catalog and effective precedence. Claude currently permits recursive subagents to its native depth limit, which can be configured by the host; do not infer total child unavailability from one missing custom name.
<!-- KW-RUNTIME-DELEGATION-END -->

<!-- KW-RUNTIME-DISPATCH-END -->

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Closing issues with open work, reorganizing forge work, force-pushing, rewriting
history, and resolving real content conflicts require the proposal, reason, and user's answer.
<!-- /PIN -->

Finalization validates, docks docs, writes terminal records, settles closure, archives, commits, and
sinks. It is not a mission. Read `workflow-state.md` and the mission ledger at
`<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`; archive moves it into the run's archive folder.

## Card: validation, acceptance, and documentation

Freeze a candidate; mutation invalidates prior PASS evidence for changed bytes.

Run the producer-selected diff-scoped chains after the candidate is frozen:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-run-chains.js" --project {project}
```

For a consumer without `test:kaola-workflow:*`, run its own validation and record the exact command:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
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

```text
Agent(
  subagent_type="implementer",
  description="Routed fix: {the failing command}",
  prompt="the exact failure, evidence path, working directory, custody, and stop boundary"
)
```

The runner **measures** the receipt and **reports** what it found; you own the verdict. Record its
typed result under `validation` in `finalization-summary.md`; preserve `chain-receipt.json` and
`final-validation.md`. Fix meaningful findings, re-freeze, then rerun affected evidence.

Record the acceptance legs — automated/local/manual/UAT — with exact commands, outputs, commit,
and anything unexecuted. A user may own an explicit acceptance exception; record its boundary.

Walk the issue statement for every claimed member and name what satisfies each part: a covering
test, validation receipt, or prose evidence, judged in context. Mission results record the run's
answers, but there is no mechanical match; a part you cannot satisfy is a blocker, not a footnote.

Review AGENTS.md's documentation checklist against changed public behavior — APIs, setup,
architecture, environment, validation, README, API docs, architecture docs, changelog, and
examples. Dispatch `doc-updater` when useful; it must transcribe real signatures, JSON/help/schema
or return BLOCK, never invent fields. Write one docking evidence file, `.cache/doc-docking.md`,
with checked files, fixes/no-impact reasons, and `DOCKED`/`BLOCKED`; continue only when docked.

The finalize transaction reports `changed_paths` — every path the branch changed outside
`kaola-workflow/` run state. Put it under `## Changed Paths`. `## Validation`
and `## Changed Paths` are where the finalize transaction's own findings land.

## Card: summary

Create `finalization-summary.md` with Delivered, Files Changed, Test Coverage, `## Validation`,
`## Changed Paths`, Documentation Docking, Follow-Up Items, and final readiness status. Scan all
run records for deferred items, partial work, conflicts, review follow-ups, and user value
decisions. Ask before reorganizing forge work. A run may intentionally keep the whole issue set
open only through the recorded closure decision; never silently mix per-member outcomes.

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
closes. Never close quietly against text now known to be wrong. A correction is not a follow-up — it
records what this issue turned out to be and lands on the issue it corrects.
<!-- /PIN -->

If the project links issues, every claimed GitHub issue closes on the merge and PR sinks alike,
and only after acceptance, the closure decision, and a verified merge. The merge sink closes them
itself; a request sink writes one `Closes #n` line per member, so they close when the request merges
into the default branch. Never close an issue by hand before the merge is verified. Keep-open
applies to the entire claimed set, releases all claims, and is merge-sink-only.

## Card: close, archive, sink, and reconcile

Capture branch, sink kind, issue and `issue_numbers` before archive. Both sinks take
`--issue-numbers`, which closes the whole set or none:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
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
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG --project {project}
    ;;
  merge|*)
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
    ;;
esac
```

<!-- PIN: sink-reports-orchestrator-owns -->
The sink reports; it does not judge your work. It reports validation, ancestry, publication,
closure, and cleanup findings and stops without merging when it cannot preserve truth;
get the merge correct, resynchronize, or publish a review request instead. Then clean up after the
sink; never touch another session's branch/worktree/folder, and ask on real content conflict.
<!-- /PIN -->

<!-- PIN: closure-audit -->
Run the closure audit after success as an after-the-fact drift detector:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
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
