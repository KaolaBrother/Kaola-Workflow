---
name: kaola-workflow-finalize
description: Use when Kaola-Workflow for Codex work, also called kaola-workflow, is finished and needs final validation, documentation docking, issue closure, archiving, and the sink.
---
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

Standard-tier roles: `code-explorer`, `investigator`, `knowledge-lookup`, `tdd-guide`,
`implementer`, `doc-updater`, `metric-optimizer`.

Reasoning-tier roles: `planner`, `code-architect`, `build-error-resolver`, `code-reviewer`,
`security-reviewer`, `adversarial-verifier`, `synthesizer`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override a
standard-tier role's model or reasoning effort based on task breadth, latency, prior results, risk,
or any other condition. The role classification remains unchanged.
<!-- /PIN -->

# Kaola-Workflow Finalize

Closes out a run and records what it delivered.

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Closing an issue that still has open work in it, reorganizing issues, force-pushing,
rewriting history, and resolving a real content conflict are all in that class: say what you propose
and why, then wait for the answer. Everything checkable is yours to decide and get on with.
<!-- /PIN -->

## What finalization is

Validate, dock the documentation, write the summary, settle closure, archive the run, commit, and
sink. Every step below **measures and reports**; you decide what to do about what it says. Nothing
here is a door that slams in your face, and nothing here is an excuse to ship something you know is
wrong — the point of moving the verdict is that **you** are now the party accountable for the
result, and you are the only party with enough context to be.

Read `kaola-workflow/{project}/workflow-state.md` for what this run owns, and
`kaola-workflow/{project}/mission-list.md` for what it set out to do.

## Step 1 — Final validation

Gate on repo kind. It is detected, never configured.

- **Self-host** — the repo's own `package.json` declares the `test:kaola-workflow:*` scripts. Run
  the validation-chain runner yourself, as the last pre-finalization action, after all code and all
  test-consumed prose has landed. It writes `.cache/chain-receipt.json`. Do not delegate this one:
  the finalize transaction only reads the receipt, it never produces it.
- **Consumer** — no `test:kaola-workflow:*` scripts. Do not invoke the chain runner; it has nothing
  to run. You own verification: run the project's own validation command, then record the result.
  `kaola-workflow/{project}/.cache/final-validation.md` needs three column-0 fields — a
  `verdict: pass` line, the exact command you ran, and a `validated_candidate_hash` bound to the tree
  you validated — and the recorder below writes all three.

On the self-host branch:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-run-chains.js" --project {project}
```

On the consumer branch:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-workflow-validation-runner.js" record \
  --project {project} --verdict pass --command "<the exact command you ran>"
```

Run that from the working tree you validated, which must be the tree you will run finalize from: the
binding follows the working tree the shell is in, and a linked worktree and main hash differently
until the branch merges. It prints the `candidate_root` it hashed, so check that against where you
are. The record itself lands in the run folder the gate reads it from — on a worktree run that is the
main checkout's rather than this tree's, because the gate takes the record from the authority folder and
hashes the tree its own shell is in — so `record_path` is where to look for the file. Exit 0 means the
record was written — the `verdict` field, not the exit code, carries whether your validation passed.

On failure, **repair it however you judge best.** Fix it inline for a trivial correction, or
dispatch it to whichever role fits — `tdd-guide` for a test defect, because it holds custody of the
test artifact and no other role may write a test path; `build-error-resolver` for build, type, lint
or tooling; the review gate for a review finding. There is no mandated mode, no justifier to write,
and no approval attached to that choice. Write fix output to `.cache/final-validation-fix-{n}.md`
and rerun the exact command that failed.

Run each full relevant command once against the final candidate. Citing an earlier pass instead of
rerunning is fine, but **state the actual reuse boundary rather than a false absolute**: say which
state it covered. A finalize-time documentation edit is outside a code or test rerun trigger — never
write "no files changed after those runs" when this phase changed the docs.

## Step 2 — The validation report

The finalize transaction **measures** the receipt and **reports** what it found. It does not refuse
over it and it decides nothing on your behalf: it classifies, in precedence order, whether the
receipt is absent, stale against the current code-relevant tree, empty, red, or green.

The finding lands in two places, and both are load-bearing:

- on the emitted envelope, under `validation`;
- durably in `kaola-workflow/{project}/finalization-summary.md`, under a `## Validation` heading.

**Read it and own the outcome.** A stale receipt means re-run the chains. A red chain means fix the
chain or knowingly accept it and say so in the summary. An absent receipt on a self-host repo means
you skipped Step 1. Proceeding is available to you in every one of those cases and is sometimes
right; proceeding *without saying which case you were in* is not.

The same transaction also reports the paths this run actually changed, on the envelope as
`changed_paths` and durably under a `## Changed Paths` heading. Nothing compares that list against a
declaration, because there is no declaration to compare it to — it is there so a reader can see what
moved and notice what does not belong.

## Step 3 — Acceptance

Walk what the run set out to do and name what satisfies each part — a covering test, a validation
receipt, or prose evidence, judged in context. The `done` items in `mission-list.md` and their
`result` lines are where the run recorded its own answers; the issue statements — one per claimed
member — are the outer obligation. That judgement is yours: there is no mechanical match and no
per-item ledger, and a part you cannot satisfy is a blocker, not a footnote.

Then confirm the obvious: tests pass per the validation result rather than a re-run universal suite,
no type or lint errors, no unresolved critical or high review findings, and no debug statements left
behind.

## Step 4 — Documentation update

Read the project-root `CLAUDE.md` for its Documentation Update Checklist (create or append it if
missing). Update the docs, or record an explicit no-impact reason. Resolve the worktree first:

```bash
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

Delegate to the `doc-updater` role with the changed files, the checklist, and
`Working directory: ${ACTIVE_WORKTREE_PATH}`. Follow the Codex Per-Spawn Model Routing contract above:
pass both `model` and `reasoning_effort` explicitly on the spawn call as the pair selected for
`doc-updater`'s existing tier. Per-task model or reasoning-effort exceptions are not allowed. Update docs
only when behavior, API, setup, architecture, environment, or user-facing workflow changed;
otherwise write the no-impact reason.

Write the result to `.cache/doc-updater.md`. **Anti-fabrication, required:** instruct `doc-updater`
to transcribe verified ground truth — real `--json` or `--help` output, real signatures, existing
schema — for any API, schema, CLI or config section, or to emit `BLOCK: <what it needs>` instead.
Never invent field names, keys, enum values, or example numbers. An untraceable structured section
is a docking gap, not a doc.

## Step 5 — Documentation docking

Compare the changed code, config, test and workflow files against every claimed issue's statement,
the run's own recorded results, and `README`, the API docs, the architecture docs, the changelog,
`.env.example`, and the issue comments. Every public behavior, API, setup,
architecture, environment or validation change is reflected somewhere, or carries an explicit
no-impact reason. Write `.cache/doc-docking.md` — changed files reviewed, documents checked, gaps
found and fixed, no-impact reasons, and a verdict of `DOCKED` or `BLOCKED`. Only continue on
`DOCKED`.

## Step 6 — Write the summary

The `## Run gaps` section below is written from what the sweep observed, so scan before writing it.
The scan writes `.cache/run-gaps.json` and reports its `sweptClasses` — one row of that section per
class it names — and Step 7 reconciles the section you wrote against that same artifact:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-gap-sweep.js" --project {project} --json
```

Create `kaola-workflow/{project}/finalization-summary.md`. It is the run's closing record and the
last thing a reader has after the folder is archived:

```markdown
# Finalization — Summary: {project}

## Delivered
## Files Changed
## Test Coverage
## Validation
## Changed Paths
## Mission List
## Documentation Docking
## Run gaps
## Follow-Up Items
## Status: READY FOR FINAL GIT GATE
```

`## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction's own
findings land — do not delete them, and do not soften them. `## Run gaps` carries one line per swept
gap, each either `filed: #N` or `noise: <justification>`.

Write the heading exactly `## Run gaps`, with nothing else on the line, and write each swept gap in
exactly one of two forms:

- `- <reasonClass> (<sample>): filed: #N` — gap tracked by an open issue.
- `- <reasonClass> (<sample>): noise: <one-line justification>` — gap justified as not worth tracking.

A heading carrying a qualifier reads as no section at all, and a line that is not a bullet in one of
those two forms — prose, or a row of a markdown table — is not read as a gap however plainly its
issue number sits in the text. Either way the closure record loses the count, and a gap you did map
can still come back as unswept.

## Step 7 — Run-gap sweep

Finishing an issue includes capturing the defects the run itself discovered. Sweep them and reconcile
the two sides:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-gap-sweep.js" --project {project} --check
```

<!-- PIN: forge-is-the-backlog -->
For each real run-discovered defect, file a follow-up and record `filed: #N`. Give it a priority tier
in the same breath: an issue filed without a `P0`–`P3` label sorts **last** on the open list, beneath
every tiered issue, so an urgent defect filed untiered ranks below a backlog one. For each non-defect,
record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scanner never observed,
append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
scanner, so what is written was actually swept.

Structure the body of the issue you file so the next run can separate evidence from inference. In
that body, `## Measured` carries only what this run observed, and every figure there names the
commit it was measured at and the command or artifact it came from — an unstamped number does not
belong in that section. `## Hypothesis` carries attributions no run has confirmed; a cause derived
by reading code lands there by default, phrased as a claim to test.
`## Proposed remedy (non-binding)` is optional and carries that label when it appears. Add one
`searched:` line recording the duplicate probe you actually ran — its query and its hit count, at
the mechanism or symbol level, since a title-word search will not find a symbol the forge has
tokenized. This adds no measurement obligation: it forbids exactly one thing, an unstamped figure
or an unrun attribution presented as established fact.

After filing, confirm the issue exists and its body is non-empty, and record the issue number and
the body length you saw in this run's own record — a create that failed silently leaves a
`filed: #N` pointing at nothing. That record is the mission list's result line, never the
`## Run gaps` row, whose grammar the scanner owns.

When this run's own findings contradict or correct the issue as filed — a wrong premise, a disproved
figure, a symptom that never existed, a justification the run replaced — post that correction as a
comment on the issue before it closes. Never close quietly against text now known to be wrong. A
correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the
record of what this issue turned out to be, and it lands on the issue it corrects.
<!-- /PIN -->

**File them as independent slices, not one omnibus issue.** Where the findings sit on disjoint
surfaces, they are separate issues; a single issue bundling unrelated surfaces cannot be worked
alongside anything, itself included. A later run can only take a set as wide as the backlog's
independence allows, so how these are filed sets how wide the next one can be.

Advisory: export `KAOLA_GOAL`, or set a `goal:` line in the run folder, so the closure receipt
records that a goal was DECLARED, with its source. Nothing checks whether it was achieved — do not
read it as success.

## Step 8 — Closure decision

Scan the run's own records for deferred items, unresolved conflicts, partial-implementation notes,
open review follow-ups, and anything the user should decide. If there are none, say so and continue.
If there are any, take them to the user with your recommendation and **ask before creating, closing,
splitting, merging, or reorganizing** any issue.

If the project links issues, close every Gitea issue in the set — but only
after acceptance passes and the closure decision clears. Keep them open when follow-ups, partial work,
or unresolved decisions remain — that choice is whole-run and takes every member with it.

### Keep-open terminal mode

A run can be complete as a cycle while its issues stay OPEN. The durable signal is one optional line
in the `## Sink` block of `workflow-state.md`: `issue_action: comment_keep_open` (absent means
close), written by you at the closure decision with the user's agreement.

**That one line is whole-run; there is no per-issue form of it.** Under keep-open the close is
skipped for the entire claimed set: **no member is closed, including members whose work finished
cleanly**, every member gets a mechanical keep-open comment from the sink, and **the claim is
released on every issue left open** — both artifacts, the `workflow:in-progress` label and the
`kw:claim` marker comment, since an issue meant to stay open is an issue meant to be claimable
again. The worktree and branch are removed and the archive is stamped as kept-open. Keep-open is
merge-sink-only.

So on a bundle this is priced per set, not per issue: taking it for one unresolved member leaves
every finished member open too, back in the backlog to be re-claimed. Weigh that against closing
the set and carrying the unresolved remainder into a new issue.

## Step 9 — Capture the sink metadata

Capture this now, while `workflow-state.md` still exists — the merge path archives it in Step 10:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
if [ ! -f "$SINK_STATE_FILE" ]; then   # the record stays where the claim wrote it; you may not be there
  _SINK_COORD="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
  if [[ "$_SINK_COORD" != /* ]]; then _SINK_COORD="$(pwd)/$_SINK_COORD"; fi
  SINK_STATE_FILE="$(dirname "$_SINK_COORD")/$SINK_STATE_FILE"
fi
SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}'); SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_FLAG=""; [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
# every issue in the set — the sink closes all of them, or none.
SINK_ISSUE_NUMBERS=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_numbers:' | awk '{print $2}')
[ -z "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS=$(grep '^issue_numbers:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE_NUMBERS_FLAG=""; [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_action:' | awk '{print $2}'); SINK_ISSUE_ACTION=${SINK_ISSUE_ACTION:-close}
SINK_KEEP_OPEN_FLAG=""; [ "$SINK_ISSUE_ACTION" = "comment_keep_open" ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
ACTIVE_WORKTREE_PATH="$(pwd)"
_WT_PRE="$(node -e "try{const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" "$SINK_STATE_FILE" 2>/dev/null)" || true
[ -n "$_WT_PRE" ] && [ -d "$_WT_PRE" ] && ACTIVE_WORKTREE_PATH="$_WT_PRE"
```

## Step 10 — The finalize transaction

The mechanical residue is ONE resumable script transaction, not prose and not a delegation: the
artifact mirror, the archive and status close, and the
`chore: finalize {project}` commit gate. Judgment stays with you; atomicity stays with the script.
Run it yourself from the linked worktree and reason over the typed emit:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG)
```

Preconditions are a CHECKLIST, not a ladder. `--check` evaluates every precondition in one read-only
pass and reports all of them together, so N unmet preconditions come back from ONE invocation
instead of one per re-run:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree --check --json)
```

It makes zero side effect: clear everything in `reasons`, then run the transaction once. `checks` also
carries state the transaction settles itself — a project folder the mirror will construct, a sync it
will perform — and a token there that `reasons` does not repeat is not yours to clear. The emit names
each step it completed, so a resumed run is readable from the emit alone, and the transaction is
idempotent — re-running the SAME call resumes at whichever step it stopped on.

Two things the transaction will not do for you, and should not: it never authors the implementation
commit (if implementation-shaped changes are uncommitted, author the commit yourself and re-run),
and it owns the worktree-to-main project-folder sync itself (never hand-copy a staler main copy over
a complete worktree one — if the sync fails, the main checkout is not writable; fix that and
re-run). Keep whatever the transaction appends to the archived summary verbatim; never rewrite it or
summarize it away.

**The archive still fails loudly if it would lose a file.** That is an operation refusing to destroy
data, not a workflow judging your work, and it is the one hard stop left in this phase. Every file
present under `kaola-workflow/{project}/` before the move must be present under
`kaola-workflow/archive/{project}/` after it.

Stage only this project. Do not stage another project's workflow state, and do not stage unrelated
user changes; if the transaction reports that you have, unstage the foreign paths, split the commit,
and re-run — it resumes.

## Step 11 — Sink

Use the metadata captured in Step 9; do not re-read the active `workflow-state.md` on the merge
path, because it has already been archived.

```bash
_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
: "${SINK_BRANCH:?SINK_BRANCH must be captured before the finalize transaction}"; : "${SINK_KIND:=merge}"
: "${SINK_ISSUE_FLAG:=}"; : "${SINK_ISSUE_NUMBERS_FLAG:=}"
# keep-open is merge-sink-only — a PR sink would close the kept-open issue.
if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
  echo "keep-open is supported on the merge sink only." >&2; exit 1
fi
case "$SINK_KIND" in
  mr|pr)
    node "$KAOLA_SCRIPTS/kaola-gitea-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
    ;;
  merge|*)
    node "$KAOLA_SCRIPTS/kaola-gitea-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
    ;;
esac
cd "$_MAIN_ROOT" 2>/dev/null || true   # the sink may have removed the worktree this shell was in
```

`--sink` mode is one resumable transaction: preflight (naming any foreign dirt it found, with zero
mutation) → push branch → rebase onto the mainline → run the validation chains → fast-forward merge
→ push mainline → close the issue, idempotently → archive → clean up. `kaola-workflow/{project}/.cache/sink-receipt.json` tracks each
step so a re-run resumes from the last incomplete one without double-applying. That receipt and
`sink-fallback.json` are transaction journals: a terminally successful sink deletes them itself, and
a "clean and synced" check that finds one afterwards must DELETE it, never commit it — a journal is
never part of the deliverable.

<!-- PIN: sink-reports-orchestrator-owns -->
### The sink reports; you own the outcome

The sink does not judge your work and it does not decide whether it should land. It tells you what
it found — chains that came back red over the rebased tree, content on the branch that no record
describes, a witness bound to different bytes than the ones being published, a merge that did not
fast-forward — and then **you** are accountable for the branch ending up right.

**Reporting is not merging anyway.** When the sink finds one of those things it records the finding
and **stops without merging** — stopping leaves every option open, and merging forecloses them. What
changed is that it hands you a named finding and a route instead of a verdict, not that it publishes
content it could not vouch for.

**What it tells you is not everything worth knowing.** In particular the sink does not check that the
branch carries implementation: on `--sink` nothing reports a branch whose entire diff is workflow
bookkeeping, and it will merge, push and close every issue in the set. Silence there is not a
clearance. You know whether your run produced work, so confirm that before you sink — afterwards the
mainline is published and the issues are closed, which is recoverable only in public.

It also stops the way any operation stops — a push that did not land, an archive move that would
lose a file, a tree it does not own, a record it would have to misreport. It stops rather than
destroy or lie. That is an operation failing, not a judgement of your work.

This is not "merge anyway and report." Resolution is your responsibility and you own the whole
outcome. Three resolutions are available and all three are legitimate:

- **get the merge correct** — rebase onto the updated mainline and retry the fast-forward, which is
  the normal answer when another lane merged first;
- **resynchronize** — reconcile whatever diverged, then re-run the sink so it resumes;
- **file a pull request instead** — a perfectly good resolution precisely because it stages the
  content for review rather than publishing it. Reach for it when the right call is a human's.

Then clean up after the sink: dispose of the journals, remove your own branch and worktree, and
leave the folder archived. **Clean up your own lane only, and only after your own merge lands.**
Never touch another session's branch, worktree, or folder. A true content conflict halts and asks a
human — it is never auto-resolved.

The distinction that matters here is not refuse-versus-proceed. It is who is accountable for the
branch ending up right, and the answer is you, because you are the only party with the context to
fix it.
<!-- /PIN -->

<!-- PIN: closure-audit -->
### Reconciliation sweep

After a successful sink, run the closure audit as an after-the-fact drift detector. It flags a
closed issue still carrying the in-progress label, or an un-archived merged folder that the sink's
own reporting did not catch.

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js" --project {project}            # scoped verdict, dry-run (default)
# node "$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js" --project {project} --execute  # repair safe local drift, scoped
```

Dry-run is the default and reports without mutating. `--execute` repairs safe local drift — an
in-progress label on a closed issue — and never deletes folders or worktrees. `--project` partitions the report rather than narrowing the sweep: `current_project_clean`
is the verdict for this run alone, and whatever the sweep found elsewhere stays visible under
`repository_drift_outside_scope`, so it can neither contaminate that verdict nor hide behind it. That
verdict is fail-closed — `true` only when every scoped class actually evaluated, so an offline run is
never `true`, and a `false` is not by itself a finding: read the counts. A name that resolves to no
record is the same rule applied to the scope itself: nothing was read for it, so the verdict is `false`
and `scope.project_unresolved` says why. The exit code carries no verdict either — 0 is every
successful run, drift and an unresolved name included, and 1 means the invocation itself was wrong,
which is what a mistyped project name with no `--issue` beside it still is.

The sink's own report is the immediate catch; this is the after-the-fact drift detector
that finds what escaped it. Together they are defense in depth. If the sink reported that it did not
complete, the step it names is where to resume, not where to give up: the receipt makes every
completed step idempotent, so re-running applies only what is left.
<!-- /PIN -->

## Completion contract

This phase closes every issue in one explicitly selected set — all of them, or none; a run carrying
a single issue is that set with one member. After the issues are closed and the active folder is
archived, the completion contract is satisfied. Stop and await explicit re-direction from the user. Do not auto-route into the next issue
in line.
