---
name: kaola-workflow-finalize
description: Use when Kaola-Workflow for Codex work, also called kaola-workflow, is finished and needs final validation, documentation docking, issue or roadmap closure, archiving, and the sink.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, or real
dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
one enabled installed Kaola edition from `codex plugin list --json`, then execute
the bundled `kaola-workflow-codex-preflight.js` from that edition's exact
marketplace/name/version cache tuple.
Never search `$PWD/plugins` or select the lexically first cache entry:

```bash
if ! KAOLA_CODEX_PLUGIN_LIST_OUT="$(codex plugin list --json 2>&1)"; then
  printf 'profile_preflight_refused: plugin metadata unavailable: %s\n' "$KAOLA_CODEX_PLUGIN_LIST_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PLUGIN_META="$(node -e '
const value=JSON.parse(process.argv[1]);
const allowed=new Set(["kaola-workflow","kaola-workflow-gitlab","kaola-workflow-gitea"]);
const rows=(Array.isArray(value.installed)?value.installed:[]).filter(row => row && row.installed === true && row.enabled === true && allowed.has(row.name));
if(rows.length!==1)throw new Error(`expected exactly one enabled installed Kaola edition; got ${rows.length}`);
const row=rows[0];
for(const [label,item] of [["marketplace",row.marketplaceName],["name",row.name],["version",row.version]])if(typeof item!=="string"||item==="."||item===".."||!/^[A-Za-z0-9._-]+$/.test(item))throw new Error(`unsafe ${label}`);
if(row.pluginId!==`${row.name}@${row.marketplaceName}`)throw new Error("plugin identity mismatch");
process.stdout.write([row.marketplaceName,row.name,row.version].join("\t"));
' "$KAOLA_CODEX_PLUGIN_LIST_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: invalid plugin metadata: %s\n' "$KAOLA_CODEX_PLUGIN_META" >&2
  exit 1
fi
IFS=$'\t' read -r KAOLA_CODEX_MARKETPLACE KAOLA_CODEX_PLUGIN_NAME KAOLA_CODEX_PLUGIN_VERSION <<< "$KAOLA_CODEX_PLUGIN_META"
KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"
if ! KAOLA_CODEX_PREFLIGHT="$(node -e '
const fs=require("fs"),path=require("path");
const [home,base,marketplace,name,version]=process.argv.slice(1);
const resolvedHome=path.resolve(home),resolvedBase=path.resolve(base);
if(resolvedBase!==path.join(resolvedHome,".codex","plugins","cache"))throw new Error("plugin cache root escapes HOME");
let cursor=resolvedHome;
const homeStat=fs.lstatSync(cursor);
if(homeStat.isSymbolicLink()||!homeStat.isDirectory())throw new Error("HOME is unsafe");
const parts=[".codex","plugins","cache",marketplace,name,version,"scripts","kaola-workflow-codex-preflight.js"];
for(let index=0;index<parts.length;index+=1){
  cursor=path.join(cursor,parts[index]);
  const stat=fs.lstatSync(cursor);
  if(stat.isSymbolicLink())throw new Error(`symlink cache component: ${cursor}`);
  if(index<parts.length-1&&!stat.isDirectory())throw new Error(`non-directory cache component: ${cursor}`);
  if(index===parts.length-1&&!stat.isFile())throw new Error(`preflight is not a regular file: ${cursor}`);
}
process.stdout.write(cursor);
' "$HOME" "$KAOLA_CODEX_CACHE_ROOT" "$KAOLA_CODEX_MARKETPLACE" "$KAOLA_CODEX_PLUGIN_NAME" "$KAOLA_CODEX_PLUGIN_VERSION" 2>&1)"; then
  printf 'profile_preflight_refused: exact active preflight unavailable: %s\n' "$KAOLA_CODEX_PREFLIGHT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" --project-root "$PWD" --no-autofix --json 2>&1)"; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PREFLIGHT_STATUS="$(node -e 'const v=JSON.parse(process.argv[1]);if(typeof v.status!=="string")throw new Error("missing status");process.stdout.write(v.status)' "$KAOLA_CODEX_PREFLIGHT_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: malformed preflight result: %s\n' "$KAOLA_CODEX_PREFLIGHT_STATUS" >&2
  exit 1
fi
if [ "$KAOLA_CODEX_PREFLIGHT_STATUS" != ok ]; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
```

The exact active cache root is
`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`.
The base invocation is `--project-root "$PWD" --no-autofix --json`; the gate
merges persisted config from HOME through the repository root to `"$PWD"`. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact about the install, never a judgement about the work, so
record it as what it is. Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Kaola-Workflow Finalize

Closes out a run and records what it delivered.

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Closing an issue that still has open work in it, reorganizing issues or the roadmap, force-pushing,
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
  to run. You own verification: run the project's own validation command and record
  `kaola-workflow/{project}/.cache/final-validation.md` with a column-0 `verdict: pass` line and the
  exact command you ran.

On the self-host branch:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-claim.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)")"
fi
CLAIM_JS="$KAOLA_SCRIPTS/kaola-workflow-claim.js"
node "$KAOLA_SCRIPTS/kaola-workflow-run-chains.js" --project {project}
```

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
`result` lines are where the run recorded its own answers; the issue statement is the outer
obligation. That judgement is yours: there is no mechanical match and no per-item ledger, and a part
you cannot satisfy is a blocker, not a footnote.

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
`Working directory: ${ACTIVE_WORKTREE_PATH}`. Pass the role's configured model on the spawn call.
Update docs only when behavior, API, setup, architecture, environment, roadmap, or user-facing
workflow changed; otherwise write the no-impact reason.

Write the result to `.cache/doc-updater.md`. **Anti-fabrication, required:** instruct `doc-updater`
to transcribe verified ground truth — real `--json` or `--help` output, real signatures, existing
schema — for any API, schema, CLI or config section, or to emit `BLOCK: <what it needs>` instead.
Never invent field names, keys, enum values, or example numbers. An untraceable structured section
is a docking gap, not a doc.

## Step 5 — Documentation docking

Compare the changed code, config, test and workflow files against the issue statement, the run's own
recorded results, and `README`, the API docs, the architecture docs, the changelog,
`.env.example`, the roadmap, and the issue comments. Every public behavior, API, setup,
architecture, environment or validation change is reflected somewhere, or carries an explicit
no-impact reason. Write `.cache/doc-docking.md` — changed files reviewed, documents checked, gaps
found and fixed, no-impact reasons, and a verdict of `DOCKED` or `BLOCKED`. Only continue on
`DOCKED`.

## Step 6 — Write the summary

Create `kaola-workflow/{project}/finalization-summary.md`. It is the run's closing record and the
last thing a reader has after the folder is archived:

```markdown
# Finalization — Summary: {project}

## Delivered
## Files Changed
## Test Coverage
## Validation
## Changed Paths
## Documentation Docking
## Run gaps
## Follow-Up Items
## Status: READY FOR FINAL GIT GATE
```

`## Validation` and `## Changed Paths` are where the finalize transaction's own findings land — do
not delete them, and do not soften them. `## Run gaps` carries one line per swept gap, each either
`filed: #N` or `noise: <justification>`.

## Step 7 — Run-gap sweep

Finishing an issue includes capturing the defects the run itself discovered. Sweep them and reconcile
the two sides:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-claim.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)")"
fi
CLAIM_JS="$KAOLA_SCRIPTS/kaola-workflow-claim.js"
node "$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js" --project {project} --check
```

For each real run-discovered defect, file a follow-up and record `filed: #N`. For each non-defect,
record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scanner never observed,
append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
scanner, so what is written was actually swept.

Advisory: export `KAOLA_GOAL`, or set a `goal:` line in the run folder, so the closure receipt
records that a goal was DECLARED, with its source. Nothing checks whether it was achieved — do not
read it as success.

## Step 8 — Closure decision

Scan the run's own records for deferred items, unresolved conflicts, partial-implementation notes,
open review follow-ups, and anything the user should decide. If there are none, say so and continue.
If there are any, take them to the user with your recommendation and **ask before creating, closing,
splitting, merging, or reorganizing** any issue or roadmap entry.

If the project links an issue, close the GitHub issue — but only
after acceptance passes and the closure decision clears. Keep it open when follow-ups, partial work,
or unresolved decisions remain.

### Keep-open terminal mode

A run can be complete as a cycle while the issue stays OPEN. The durable signal is one optional line
in the `## Sink` block of `workflow-state.md`: `issue_action: comment_keep_open` (absent means
close), written by you at the closure decision with the user's agreement. Under keep-open the issue
is not closed — the sink posts a mechanical keep-open comment — the roadmap source
`.roadmap/issue-N.md` is preserved and the mirror still lists the issue, the claim is released, the
worktree and branch are removed, and the archive is stamped as kept-open. Keep-open is
merge-sink-only.

## Step 9 — Capture the sink metadata

Capture this now, while `workflow-state.md` still exists — the merge path archives it in Step 10:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-claim.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)")"
fi
CLAIM_JS="$KAOLA_SCRIPTS/kaola-workflow-claim.js"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
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
_WT_PRE="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -n "$_WT_PRE" ] && [ -d "$_WT_PRE" ] && ACTIVE_WORKTREE_PATH="$_WT_PRE"
```

## Step 10 — The finalize transaction

The mechanical residue is ONE resumable script transaction, not prose and not a delegation: the
artifact mirror, the archive and status close, the roadmap staging, and the
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

It makes zero side effect: clear everything it lists, then run the transaction once. The emit names
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
  pr)
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
    ;;
  merge|*)
    node "$KAOLA_SCRIPTS/kaola-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
    ;;
esac
cd "$_MAIN_ROOT" 2>/dev/null || true   # the sink may have removed the worktree this shell was in
```

`--sink` mode is one resumable transaction: preflight (naming any foreign dirt it found, with zero
mutation, and auto-stashing the claim-time `.roadmap/issue-N.md`) → push branch → rebase onto the
mainline → run the validation chains → fast-forward merge → push mainline → close the issue,
idempotently → archive → clean up. `kaola-workflow/{project}/.cache/sink-receipt.json` tracks each
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

It still stops for one class of thing, and that is not a verdict: an operation that would destroy
something. A dirty main root or a linked worktree with uncommitted changes, a probe it could not
run, an archive that would lose a file. Those protect work nobody agreed to lose, so they fail
loudly rather than reporting and continuing.

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
closed issue still carrying the in-progress label, a stale roadmap source, or an un-archived merged
folder that the sink's own reporting did not catch.

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-claim.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)")"
fi
CLAIM_JS="$KAOLA_SCRIPTS/kaola-workflow-claim.js"
node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"            # dry-run: report only (default)
# node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js" --execute  # repair safe local drift
```

Dry-run is the default and reports without mutating. `--execute` repairs safe local drift — stale
roadmap sources, mirror rows, an in-progress label on a closed issue — and never deletes folders or
worktrees. The sink's own report is the immediate catch; this is the after-the-fact drift detector
that finds what escaped it. Together they are defense in depth. If the sink reported that it did not
complete, the step it names is where to resume, not where to give up: the receipt makes every
completed step idempotent, so re-running applies only what is left.
<!-- /PIN -->

## Completion contract

This phase closes exactly one issue, or every issue in one explicitly selected set — all of them, or
none. After the issue is closed and the active folder is archived, the completion contract is
satisfied. Stop and await explicit re-direction from the user. Do not auto-route into the next issue
in line.
