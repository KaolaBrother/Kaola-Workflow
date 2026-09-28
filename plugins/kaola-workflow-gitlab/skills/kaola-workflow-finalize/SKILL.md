---
name: kaola-workflow-finalize
description: Use when Kaola-Workflow for Codex work, also called kaola-workflow, is finished and needs final validation, documentation docking, issue closure, archiving, and the sink.
---
# Kaola-Workflow Finalize

Closes out a run and records what it delivered.

<!-- KW-COMPACT-RECOVERY-START -->
## Finalization operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Finalization procedure.
Read project `AGENTS.md`. Then resume from existing finalization receipts.

<!-- KW-RUNTIME-DISPATCH-START -->
## Delegation

**Runtime dispatch contract (always loaded).**

Kaola-Workflow defines no subagent roles, role profiles, or subagent model and effort bindings.
Subagent capability belongs to the running Agent Harness: dispatch through its native tool and
schema, choose from the type catalog it actually exposes, and let its own defaults, limits, and
permissions — and the user's explicit instructions — decide model, effort, tools, nesting,
concurrency, isolation, and resume. Where the native schema requires a type, pass one the host
reports, under its real meaning.
Kaola-Workflow installing no profiles is never evidence that the host lacks subagent capability.

Send a bounded, self-sufficient brief naming the outcome, evidence, worktree or commit, custody, and
stop condition.

<!-- KW-RUNTIME-DELEGATION-START -->
## Runtime adapter facts

Host: Codex. If the running host is not Codex, ignore this adapter section and follow the running host's own native subagent schema and catalog.

Follow the running host's current subagent tool and the schema it exposes now. This adapter does not name types, models, nesting, or a concurrency count.
Availability follows that live schema, the host's permissions, and the user's instructions. A missing config field is not evidence the host lacks a tool.
<!-- KW-RUNTIME-DELEGATION-END -->

<!-- KW-RUNTIME-DISPATCH-END -->

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Closing issues with open work, reorganizing forge work, force-pushing, rewriting
history, and resolving real content conflicts require the proposal, reason, and user's answer.
<!-- /PIN -->

It is not a mission. Read `workflow-state.md` and the mission ledger at
`<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`; archive moves it into the run's archive folder.

## Card: validation, acceptance, and documentation

Freeze the candidate (mutation invalidates prior PASS evidence for changed bytes), then run the
producer-selected diff-scoped chains:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-run-chains.js" --project {project}
```

For a consumer without `test:kaola-workflow:*`, run its own validation and record the exact command:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-validation-runner.js" record \
  --project {project} --verdict "<pass|fail>" --command "<exact command>"
```

Pass the verdict you observed. When you record consumer evidence, the recorder writes
`.cache/final-validation.md` with column-0 `verdict:`, the exact command, and
`validated_candidate_hash`. Run that record from the candidate worktree the finalize transaction
reads. Missing, stale, or failed evidence is a reported finding: that mechanical step does not
itself reject finalize, and it does not turn an unrun check into `verdict: pass`.

On failure, repair a trivial correction inline, or dispatch the repair through the host's native
route with a brief naming the exact failure, evidence path, working directory, custody, and stop
boundary. A repair may change acceptance meaning only where you hold that meaning; a fix that
follows a review finding waits for your own verdict on the finding.

The runner **measures** the receipt and **reports** what it found; you own the verdict. The finalize
transaction writes its typed validation finding under `## Validation` in `finalization-summary.md`;
leave that heading's body empty. Preserve `chain-receipt.json` and `final-validation.md` when they
already exist. Reuse evidence that still matches this candidate. Rerun only what that evidence does
not cover. Pending coverage stays pending.

Record the candidate, the acceptance outcome, where the evidence is, and any known failure or
unverified scope. A user may own an explicit acceptance exception; record its boundary. A part of
the issue you cannot satisfy stays unresolved. Do not open a second QA pass or a documentation
ledger because finalization started. Documentation judgment belongs to the executing agent and,
when Kaola Project Runner is in use, to its own guidance. The lifecycle record is this summary
plus the validation measurement and changed-path report already written here — not a separate
`DOCKED`/`BLOCKED` file.

The finalize transaction measures `validation` and `changed_paths` (every path the branch changed
outside `kaola-workflow/` run state) and writes them under `## Validation` and `## Changed Paths`.
It fills an empty heading and never overwrites one that has a body, so leave both bodies empty.

## Card: summary

Create `finalization-summary.md` with Delivered, the candidate, evidence locations, known failures
or unverified scope, `## Validation` and `## Changed Paths` (empty, for the transaction),
Follow-Up Items, and final readiness status. Read the run records that already exist. Ask before
reorganizing forge work. A run may intentionally keep the whole issue set open only through the
recorded closure decision; never silently mix per-member outcomes. Record a keep-open decision as
`issue_action: comment_keep_open` in the `## Sink` block of `workflow-state.md` (merge sink only).

## Card: file or correct run-discovered work

<!-- PIN: forge-is-the-backlog -->
For each real run-discovered defect, file a follow-up and record `filed: #N`. Give it a priority tier
in the same breath: an issue with neither a `P<n>` label nor a label from `priority_top_tier_labels`
sorts **last** on the open list, beneath every tiered issue.

`## Measured` carries only what this run observed; every figure there names the commit it was
measured at and the command or artifact it came from. `## Hypothesis` carries attributions no run
has confirmed; a cause derived by reading code lands there by default. `## Proposed remedy
(non-binding)` is optional and carries that label when it appears. Add one `searched:` line recording
the duplicate probe you actually ran — its query and its hit count.

After filing, confirm the issue exists and its body is non-empty, and record that in
`finalization-summary.md` under Follow-Up Items — never in a `done` ledger line, which is immutable.

When evidence corrects the current issue, post that correction as a comment on the issue before it
closes. Never close quietly against text now known to be wrong. A correction is not a follow-up — it
records what this issue turned out to be and lands on the issue it corrects.
<!-- /PIN -->

If the project links issues, every claimed GitLab issue closes on the merge and MR sinks alike,
and only after acceptance, the closure decision, and a verified merge. The merge sink closes them
itself; a request sink writes one `Closes #n` line per member, so they close when the request merges
into the default branch. Never close an issue by hand before the merge is verified. Keep-open
applies to the entire claimed set, releases all claims, and is merge-sink-only.

## Card: close, archive, sink, and reconcile

Capture branch, sink kind, issue and `issue_numbers` before archive. Both sinks take
`--issue-numbers`, which closes the whole set or none:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
if [ ! -f "$SINK_STATE_FILE" ]; then
  _COORD="$(git rev-parse --git-common-dir)"; [[ "$_COORD" != /* ]] && _COORD="$(pwd)/$_COORD"
  SINK_STATE_FILE="$(dirname "$_COORD")/$SINK_STATE_FILE"
fi
SINK_BRANCH=$(awk '/^branch:/{print $2}' "$SINK_STATE_FILE")
SINK_ISSUE=$(grep '^issue_iid:' "$SINK_STATE_FILE" | awk '{print $2}')
[ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | awk '/^sink:/{print $2}'); SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_NUMBERS=$(awk '/^issue_numbers:/{print $2}' "$SINK_STATE_FILE" | tail -1)
SINK_ISSUE_FLAG=""; [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != unset ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
SINK_ISSUE_NUMBERS_FLAG=""; [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | awk '/^issue_action:/{print $2}'); SINK_ISSUE_ACTION=${SINK_ISSUE_ACTION:-close}
SINK_KEEP_OPEN_FLAG=""; [ "$SINK_ISSUE_ACTION" = comment_keep_open ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
ACTIVE_WORKTREE_PATH=$(awk '/^worktree_path:/{print $2}' "$SINK_STATE_FILE"); [ -d "$ACTIVE_WORKTREE_PATH" ] || ACTIVE_WORKTREE_PATH="$PWD"
```

The next two blocks read these variables, and a fresh shell does not keep them: run them in the
same shell invocation as this capture block, or carry the captured values into them literally.
Capture before the transaction, because archive moves `workflow-state.md`.

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
# keep-open is merge-sink-only — an MR sink would close the kept-open issue.
if [ "$SINK_KIND" != merge ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then exit 1; fi
case "$SINK_KIND" in
  mr|pr)
    node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-sink-mr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG --project {project}
    ;;
  merge|*)
    node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
    ;;
esac
```

<!-- PIN: sink-reports-orchestrator-owns -->
The sink reports; it does not judge your work. It reports validation, ancestry, closure, and
cleanup findings and stops without merging when it cannot preserve truth; get the merge correct,
resynchronize, or publish a review request instead. Every `--sink` envelope also carries
`publication` — `published`, `not_published`, or `unknown` — naming whether the deliverable
reached the mainline, so a refusal after publication reads as merged with finalization pending.
The sink never switches or rebases your main checkout; after publication it advances that
checkout only when git can fast-forward it without touching your modifications, and otherwise
reports `cleanup.main_checkout`. Then clean up after the sink; never touch another session's
branch/worktree/folder, and ask on real content conflict. If the sink reported that it did not
complete, the step it names is where to resume; receipts keep retry idempotent.
A request sink (`sink: pr` / `sink: mr`) publishes the request and stops there — the run's archive
rides that request, and nothing is merged on its behalf. After the request merges, `watch-pr` /
`watch-mr` reconcile it, reporting publication and closeout separately, never re-merging or pushing
the mainline, and leaving manual closure of any remaining members to you only once verified.
<!-- /PIN -->

<!-- PIN: closure-audit -->
Run the closure audit after success as an after-the-fact drift detector:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js" --project {project}            # scoped verdict, dry-run (default)
# node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js" --project {project} --execute  # repair safe local drift, scoped
```

It reports scoped and outside-scope drift without turning exit zero into a verdict.
<!-- /PIN -->

Only after every issue is closed (or the user-authorized whole set is kept open), the folder is
archived, and publication is proven may finalization stop and await explicit redirection.

<!-- KW-COMPACT-RECOVERY-END -->
