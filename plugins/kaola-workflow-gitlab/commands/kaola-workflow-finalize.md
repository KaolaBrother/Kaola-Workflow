---
description: Kaola-Workflow Finalization. Final validation, documentation, roadmap/archive, commit, and issue update.
argument-hint: <project name>
---

# Kaola-Workflow Finalization

Finalization proves the workflow is complete and records final metadata. Do not repair inline (except
the Trivial Inline Edit Exception). Read `kaola-workflow/{project}/workflow-state.md` and
`kaola-workflow/{project}/workflow-plan.md`.

## In-progress re-plan control plane

<!-- PIN: replan-finalize -->

This fence outranks every Finalization prerequisite and side effect. Before validation, the
finalize transaction, archive, closure, roadmap, commit, or sink work, read the project state + transaction
status. If either reports `replan_in_progress`, the frozen parent stays authoritative and
Finalization is forbidden; read-only orientation reports `replan_phase`, `transaction_id`,
`parent_plan_hash`, `child_plan_hash` (or `none`), and `last_cas_result`. The single legal mutation
while the fence is active:

```bash
REPLAN_SCRIPT="./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/kaola-gitlab-workflow-replan.js}"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="$HOME/.claude/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitlab-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

`decision:ask` remains advisory. If resume returns `replan_planner_dispatch_required`, dispatch the
genuine `workflow-planner` in Re-plan mode with only repo root, project, `transaction_id`,
`dispatch_nonce`, profile identity, the exact `.cache/replan-planner-packet.json` path, and its
reason/source evidence. No role sequence, node ids, dependencies, write sets, cardinality, shape,
model, or exact DAG fragment may come from the orchestrator; that is
`planner_control_boundary_violation`. Only the planner writes the seeded `workflow-plan.next.md` and
`.cache/replan-planner-attestation.json`; then re-run resume. An invalid child uses the bounded
unfrozen child-repair loop (same planner, verbatim validator errors); at the bound stop with typed
evidence — never finalize the parent or route to another path. A legacy-v1 parent transitions through
this same fenced resume path.

<!-- PIN: reviewer-contract-v2-finalization -->
### Reviewer Contract Version and Freshness Gate

For an adaptive plan, resolve the frozen contract version before accepting any gate evidence.
Under `plan_schema_version: 2` and `contract_version: 2`, `--verdict-check` verifies normalized
receipts from the planner-designated `code_certifier` and, when present, `security_certifier`;
a plain verdict line is not sufficient. Each receipt must match the frozen `resolved_profile_hash`,
`review_context_hash`, and recomputed current `candidate_digest`. Treat a mismatch as the typed
failure `schema-2 certifier receipt is stale for the current candidate` and block finalization.

For every certifier, read its canonical review context and enforce every nonempty
`validation_obligations` entry against the canonical pass receipts in
`.cache/validation-vectors/`. The obligated command/vector identities and current candidate must
match exactly; a missing, failed, inconclusive, timed-out, signaled, drifted, or stale receipt keeps
the final gate open. Only after all certifier and validation-vector freshness checks pass may the
existing adaptive finalization gates authorize closure.

A verified frozen legacy plan with `contract_version: 1` keeps its existing schema-1
verdict/evidence semantics and does not acquire schema-2 receipt requirements. Never upgrade or
rewrite that plan in place.
<!-- /PIN -->

## Agent Model Badge

Every subagent dispatch below carries an explicit `model=` line — the installer fills each
`model="{...}"` placeholder from the agent's frontmatter and it is what shows the model badge.
You MUST pass `model="{...}"` in every Agent call exactly as shown; never omit the `model=` line
on any dispatch.

## Prerequisite — script-enforced barrier

The workflow path is adaptive (`workflow_path: adaptive`). `workflow-plan.md` must exist, be frozen
(re-check `plan_hash`), and every `## Node Ledger` row must be `complete` or `n/a`. The barrier is
four gates — run all four and capture each exit code DIRECTLY (never gate on a piped `| tail`):

```bash
PLAN=kaola-workflow/{project}/workflow-plan.md
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
VALIDATOR="$(kaola_script kaola-gitlab-workflow-plan-validator.js)"
node "$VALIDATOR" "$PLAN" --resume-check --json; RC=$?
node "$VALIDATOR" "$PLAN" --gate-verify --json; GV=$?
# --barrier-check forwards KAOLA_FINALIZE_BASE (default UNSET → validator's origin/main default) so
# the attribution sweep can scope to a project's own diff on a shared branch; the per-node
# --barrier-check still rejects --base (anti-laundering).
BARRIER_BASE="${KAOLA_FINALIZE_BASE:-}"; BARRIER_BASE_ARG=()
[ -n "$BARRIER_BASE" ] && BARRIER_BASE_ARG=(--base "$BARRIER_BASE")
node "$VALIDATOR" "$PLAN" --barrier-check --json "${BARRIER_BASE_ARG[@]}"; BC=$?
node "$VALIDATOR" "$PLAN" --verdict-check --json; VC=$?
if [ "$RC" -ne 0 ] || [ "$GV" -ne 0 ] || [ "$BC" -ne 0 ] || [ "$VC" -ne 0 ]; then
  echo "BLOCKED: adaptive barrier failed (resume=$RC gate=$GV barrier=$BC verdict=$VC) — run /kaola-workflow-plan-run first"; exit 1
fi
```

- `--resume-check` proves `plan_hash` integrity + structure + closed library.
- `--gate-verify` proves every completed code/sensitive node is post-dominated by a **completed**
  reviewer in the `## Node Ledger` (a required reviewer silently `n/a` at runtime is caught). **G3:
  a non-delegable `main-session-gate` must be complete — never `n/a`.**
- `--barrier-check` re-scans the files actually written (git diff vs the HEAD/`origin/main`
  merge-base) and refuses a sensitive write with no `security-reviewer` node or an out-of-allowlist
  production write.
- `--verdict-check` requires machine-readable `verdict: pass` + `findings_blocking: 0` in every
  completed `code-reviewer`/`security-reviewer`/`adversarial-verifier`/`main-session-gate`
  `.cache/{node-id}.md`. **Exception:** an *investigation* `adversarial-verifier` post-dominating no
  code/sensitive node is exempt (sequence and fanout majority-refute); a *change-gate*
  `adversarial-verifier` keeps full coverage.

Any nonzero exit blocks the merge. On failure stop with the typed refusal:
```text
Adaptive plan failed the script-enforced barrier. Run /kaola-workflow-plan-run first.
```
If `workflow-plan.md` is absent, `cmdFinalize` refuses unconditionally with
`finalize_gate_unverified` / `adaptive_plan_missing`. These typed refusals are classified
structurally — do not string-match.

## Validation Gate (dual-mode by repo kind)

`--finalize-check` auto-detects mode; the attribution sweep runs for both. Never gate on CI. These
typed refusals are classified structurally — do not string-match; the remedy for a stale receipt/hash
is always a full re-run, never a hand-patch.

- **Self-host (npm)** (declares `test:kaola-workflow:*`): machine-gated on a fresh, valid
  `.cache/chain-receipt.json`. The main session runs `kaola-workflow-run-chains.js` after all code +
  test-consumed prose/docs land, as the last pre-Finalization action (do NOT delegate — the
  finalize transaction only VERIFIES the receipt). Precedence-ordered refusals: `chains_unverified` (absent),
  `chains_stale` (`codeTreeHash` ≠ code-relevant tree; inert docs + workflow state do not trigger it),
  `chains_red` (a real failing chain, `accepted_red: false` — fix it or waive
  `--accept-known-red <name>:<open-issue>`).
- **Consumer (non-npm)** (no `test:kaola-workflow:*`): does NOT run chains — the agent owns
  verification and records `.cache/final-validation.md` with a column-0 `verdict: pass` +
  `validated_candidate_hash:` (produce it with the plan-validator's `--candidate-hash --json`,
  computed LAST). `--finalize-check` gates on `final_validation_unverified` / `final_validation_failed`
  / `final_validation_unbound` / `final_validation_stale`. When the candidate is unchanged since a
  terminal change-gate run, cite it with `source: cited:<node-id>`, `validated_command`,
  `validated_at_head`, `reuse_boundary`, plus a fresh hash. Any doubt → run the command.

## Run-Gap Sweep Gate

Machine-gated (after the Chain-Receipt Gate) on a clean run-gap sweep via
`kaola-gitlab-workflow-gap-sweep.js --check` against `.cache/run-gaps.json` + the `## Run gaps` section of
`finalization-summary.md`:
- **`gaps_unswept`** — a swept reason class with no matching `## Run gaps` entry. For each real defect
  (`in_run_repair`/`deferred_red_chain`/`manual:<slug>`) file a follow-up and record `filed: #N`; for
  non-defects record `noise: <justification>`.
- **`observed_gap_unseeded`** — a hand-typed `## Run gaps` row with no machine-swept entry. Append
  `gap: <class> — <text>` to `.cache/run-gaps-manual.md`, re-run the scanner, then re-run `--check`.

Advisory: export `KAOLA_GOAL` (or set a `goal:` line in `## Meta`) so `goal_check` records `satisfied`.

## Resume Detection

final validation not run → `final-validation`; failed w/ no ledger row → `route-final-fix`; fixed but
not re-run → `final-validation`; acceptance incomplete → `acceptance-check`; doc gate → `doc-update`;
docking → `doc-docking`; summary missing → `write-summary`; closure gate → `closure-decision`; issue
not updated → `issue-update`; roadmap/archive → `roadmap-archive`; metadata pending →
`final-metadata`; commit missing → `commit-push`; sync missing → `verify-sync`. If ambiguous, stop
and ask.

## Guardrails, Delegation, De-Duplication, Trivial Edit

- Run/delegate the repo-kind-appropriate final validation before claiming completion; do not repair
  inline; do not close a GitLab issue until acceptance passes; do not archive incomplete folders or
  stage unrelated changes; commit only after docs/issue/roadmap/archive/metadata complete; no
  post-final commits except the sanctioned `sink-mr.js`/`sink-pr.js` metadata follow-up.
- **Delegation:** the main session may run one small focused command (classify a failure, a quick
  post-trivial-edit check, a short smoke). Delegate expensive/noisy validation (full suites, broad
  lint, long logs, repeated repro) to a fresh validation subagent or the fix agent — `tdd-guide` for
  behavior/regression/coverage/test-defect (it holds custody of the test artifact; no other role may
  write a test path), `build-error-resolver` for build/type/lint/tooling. Raw output →
  `kaola-workflow/{project}/.cache/final-validation.md`; record only command, result, summary,
  classification, evidence path, route, and citation boundary.
- **De-duplication:** run each full relevant command once against the final candidate; cite a prior
  pass instead of rerunning, but **state the actual reuse boundary, not a false absolute** (record
  WHICH node/state it covered; a finalize-node CHANGELOG/docs edit is outside a code/test rerun
  trigger — never write `No files changed after those runs` when the finalize node changed docs).
  The self-host receipt is keyed on the code-relevant-tree hash: inert-docs/workflow-state commits
  stay fresh; a code or `README`/`CHANGELOG`/`docs/api.md` change invalidates it.
- **Trivial Inline Edit Exception:** the main session may make a one-line/mechanically-obvious edit
  (no behavior/API/security/design judgment) that fixes finalization friction/formatting/typo/import,
  stays in scope, is recorded in `finalization-summary.md`, and reruns affected validation. It is
  **never** an edit to a test file — test custody belongs to `tdd-guide`. Anything else routes to
  `tdd-guide`/`build-error-resolver` or back through the review gate.

Routed-fix dispatches (include the `model=` line exactly):

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

## Steps

**Step 1 — Final Validation.** Update `workflow-state.md` (`stage: finalization`,
`step: final-validation`, `main_session_role: orchestrator`, `fix_owner: tdd-guide or
build-error-resolver`), then run the repo-kind validation from the Validation Gate above, saving raw
output to `kaola-workflow/{project}/.cache/final-validation.md`. On failure route
(build/type/lint/tooling → `build-error-resolver`; behavior/regression/coverage/test-defect →
`tdd-guide`, the role that owns the test artifact; review/security → the review/security gate), write
fix output to `.cache/final-validation-fix-{n}.md`, and rerun the failed command.

**Step 2 — Acceptance Check.** Walk the frozen plan's `## Acceptance` items (`A1:`, `A2:`, …) one at a
time and name what satisfies each one — a covering test, a gate receipt, or prose evidence, judged in
context. That judgement is yours: there is no mechanical match, no string diff, and no per-item
ledger; an item you cannot satisfy is a blocker, not a footnote. Then verify all planned
nodes complete, tests pass (per validation result, not a re-run universal suite), no type/lint errors,
no CRITICAL/HIGH review findings, no debug statements. Adaptive's `--verdict-check` barrier is the sole
compliance gate. A plan carrying no `## Acceptance` section (a read-only plan, or one frozen before
the section existed) has no items to walk — verify the deliverable against the issue statement instead.

**Step 3 — Documentation Update.** Read project-root `CLAUDE.md` for the Documentation Update
Checklist (create/append if missing). This is a required gate: invoke `doc-updater` with changed
files + checklist, or skip only with an explicit no-impact reason. Resolve the worktree first:

```bash
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

```text
Agent(
  subagent_type="doc-updater",
  model="{DOC_UPDATER_MODEL}",
  description="Update docs for {project}",
  prompt="changed files, checklist, Working directory: ${ACTIVE_WORKTREE_PATH}"
)
```

Write to `.cache/doc-updater.md`. **Anti-fabrication (required):** instruct `doc-updater` to
transcribe verified ground truth (real `--json`/`--help` output, real signatures, existing schema)
for any API/schema/CLI/config section, or emit `BLOCK: <what it needs>` — never invent field
names/keys/enum values/example numbers. Reject any untraceable structured section as a docking gap.

**Step 4 — Documentation Docking.** Compare changed code/config/test/workflow files against Phase
1 criteria, the task blueprint, implementation + review evidence, and `README`/API/architecture/
changelog/`.env.example`/roadmap/issue comments. Every public behavior/API/setup/architecture/env/
validation/roadmap change is reflected or has an explicit no-impact reason. Write `.cache/doc-docking.md`
(changed files reviewed, documents checked, gaps found+fixed, no-impact reasons, verdict `DOCKED` or
`BLOCKED`). Only continue on `DOCKED`.

**Step 5 — Write Summary.** Create `kaola-workflow/{project}/finalization-summary.md` with sections:
Delivered, Files Changed, Test Coverage, Final Validation Evidence, Documentation Docking, a Final
Validation Failure Ledger table (Failing Command | Classification | Routed To | Evidence | Status),
Follow-Up Items, `## Run gaps` (one line per swept `(reasonClass, sample)` as `filed: #N` or
`noise: <justification>`; omit if empty), Closure Decision, GitLab Issue, Roadmap, Archive, a
`## Required Agent Compliance` table (doc-updater, documentation docking, final-validation fix
executors, roadmap refresh, archive completed folder, final commit and push — each with
Status/Evidence/Skip Reason; no `pending` rows except `final commit and push` may be `ready`), and
`## Status: READY FOR FINAL GIT GATE`.

**Step 6 — Closure Decision Gate.** Scan all node evidence for deferred items, unresolved
conflicts, partial-implementation notes, open review follow-ups, or user-decision items. If none,
record the scan and continue. If any exist, route them to the USER with your recommendation and **ask
before creating/closing/splitting/merging/reorganizing** any issue or roadmap entry.

**Step 7 — GitLab Issue, Roadmap, Archive, Metadata.** If the project links an `issue_number`: close
it only after acceptance passes and the Closure Decision Gate clears; keep it open if follow-ups /
partial work / unresolved decisions remain; for `issue_action: comment_keep_open` do NOT close — post
the substantive partial-close comment (the mechanical keep-open comment is posted by `sink-merge`).
The actual roadmap closure (rm `.roadmap/issue-N.md` + regenerate `ROADMAP.md`) and archive are done
once by the finalize transaction in Step 8b, which also stages the result — do not rm/generate/`git
mv` here. Update `finalization-summary.md` with the
final issue/roadmap/archive/docking/closure state; verify every other Required Agent Compliance row
is `invoked`/`skipped`/`N/A` with evidence (except `final commit and push` may be `ready`).

## Staging Guard

The single-project rule lives INSIDE the finalize transaction, not in this prose: it compares
`{project}` as a fixed string (never a regex) and refuses before any side effect with the typed
`staging_guard_foreign_archive` (a foreign project's `archive/` band is staged) or
`staging_guard_multi_project` (more than one `kaola-workflow/*/` project is staged). On either,
unstage the foreign paths — split the commit — and re-run the transaction; it resumes.

## Keep-Open Terminal Mode (partial-close)

A run can be complete as a cycle while the issue stays OPEN. The durable signal is one optional line
in the `## Sink` block: `issue_action: comment_keep_open` (default absent: close), written by the main
session at the Closure Decision Gate with user approval. Under keep-open the issue is NOT closed
(`sink-merge` posts a mechanical keep-open comment), the roadmap source `.roadmap/issue-N.md` is
preserved and `ROADMAP.md` still lists #N (invariant `keep-open-roadmap-preserved`), the claim is
released and worktree/branch removed, and the archive is stamped `last_result: closed_keep_open` /
`issue_disposition: kept-open`. **Keep-open is merge-sink-only**: Step 9 refuses a non-merge sink and
the exit-3 MR/PR auto-pivot under keep-open, and `sink-mr.js`/`sink-pr.js` refuse a project carrying
`issue_action: comment_keep_open`.

## Sink Metadata Capture (before the finalize transaction)

Capture now, while `workflow-state.md` still exists — the merge path archives it in Step 8b, and the
transaction re-derives its own copy of every durable field it needs:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}'); SINK_KIND=${SINK_KIND:-merge}
SINK_ISSUE_FLAG=""; [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
# bundle members — sink-merge closes EVERY member (all-or-nothing).
SINK_ISSUE_NUMBERS=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_numbers:' | awk '{print $2}')
[ -z "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS=$(grep '^issue_numbers:' "$SINK_STATE_FILE" | awk '{print $2}')
SINK_ISSUE_NUMBERS_FLAG=""; [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_action:' | awk '{print $2}'); SINK_ISSUE_ACTION=${SINK_ISSUE_ACTION:-close}
SINK_KEEP_OPEN_FLAG=""; [ "$SINK_ISSUE_ACTION" = "comment_keep_open" ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
ACTIVE_WORKTREE_PATH="$(pwd)"
_WT_PRE="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -n "$_WT_PRE" ] && [ -d "$_WT_PRE" ] && ACTIVE_WORKTREE_PATH="$_WT_PRE"
```

## Mechanical Finalization (one script transaction)

Gate on repo kind first: self-host runs `kaola-workflow-run-chains.js` (main session) as the last
pre-Finalization action and the transaction only VERIFIES `.cache/chain-receipt.json`; consumer gates
on `.cache/final-validation.md`. The mechanical residue is NOT prose and NOT a delegation — the
artifact mirror (with its ledger-regression guard), the archive + status close, the roadmap staging,
and the `chore: finalize {project}` commit gate are ONE resumable script transaction. Run it yourself
from the linked worktree and reason over the typed emit:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG)
```

Preconditions are a CHECKLIST, not a ladder. `finalize --check` evaluates EVERY precondition in one
read-only pass and reports all of them together, so N unmet preconditions come back from ONE
invocation instead of one refusal per re-run:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree --check --json)
```

It emits `{ project, ok, checks, reasons }` (exit 0 when `ok`), where `checks` always carries
`mirror`, `workflow_state`, `implementation_commit`, `staging_guard`, `validation`, and
`dirty_paths`, and `reasons` names the most specific token per UNMET precondition. It makes zero
side effect — clear every reason it lists, then run the transaction once.

Judgment stays with you; the transaction owns atomicity. Typed refusals it can return, each with no
further side effect: `finalize_mirror_refused` with `inner_reason: mirror_sync_failed` (the
transaction OWNS the worktree→main project-folder sync and could not perform it — make the main
checkout writable and re-run; never hand-copy a staler main ledger over the worktree),
`implementation_commit_missing`
(implementation-shaped changes are uncommitted and the branch carries no implementation commit —
author it yourself and re-run; the machinery authors only the finalize bookkeeping commit),
`staging_guard_foreign_archive` / `staging_guard_multi_project` (split the commit),
`finalize_gate_unverified` (resolve the inner reason), and `archive_incomplete`. The emitted
`finalize_transaction` object reports each step (`mirror`, `ledger_compare`, `impl_commit`,
`roadmap_staged`, `archive_commit`, `finalize_commit`) so a resumed run is readable from the emit
alone. `cmdFinalize` also appends a `## Attestation` section to the archived summary — keep it
verbatim, including a legacy section carrying retired fields; never rewrite one.

**Crash recovery.** The transaction is idempotent and resumes at whichever step it stopped on.
`node "$(kaola_script kaola-gitlab-workflow-claim.js)" resume --project {project} --json` reports
`finalize_incomplete` (archive present, uncommitted) or `already_finalized` (settled — nothing to
resume). Recover by re-running the SAME one-call transaction.

## Step 9 - Sink

Use the sink metadata captured before Step 8b (do not re-read the active `workflow-state.md` on the
merge path; it may already be archived).

```bash
_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
: "${SINK_BRANCH:?SINK_BRANCH must be captured before Step 8b}"; : "${SINK_KIND:=merge}"
: "${SINK_ISSUE_FLAG:=}"; : "${SINK_ISSUE_NUMBERS_FLAG:=}"
# keep-open is merge-sink-only — refuse an MR sink before dispatch.
if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
  echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink." >&2; exit 1
fi
case "$SINK_KIND" in
  mr|pr)
    SINK_MR_JS="$(kaola_script kaola-gitlab-workflow-sink-mr.js)"
    node "$SINK_MR_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
    ;;
  merge|*)
    SINK_MERGE_JS="$(kaola_script kaola-gitlab-workflow-sink-merge.js)"
    node "$SINK_MERGE_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project}
    _SINK_MERGE_EXIT=$?
    if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
      # keep-open never auto-pivots to an MR sink (its Closes #N body would close the kept-open issue).
      if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
        echo "BLOCKED: sink-merge exited 3 (merge-impossible) on a keep-open run — remediate the blocker (see .cache/sink-fallback.json) and re-run sink-merge; do not pivot to an MR sink." >&2; exit 1
      fi
      cd "$_MAIN_ROOT"
      CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
      node "$CLAIM_JS" sink-fallback --project {project}
      SINK_MR_JS="$(kaola_script kaola-gitlab-workflow-sink-mr.js)"
      node "$SINK_MR_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
      exit $?
    fi
    [ "$_SINK_MERGE_EXIT" -ne 0 ] && exit "$_SINK_MERGE_EXIT"
    ;;
esac
cd "$_MAIN_ROOT" 2>/dev/null || true   # sink-merge may have removed the worktree this shell was in
```

### Script-owned worktree sink (`--sink` mode)

When the branch carries a worktree run (`run_posture: worktree`), `--sink` replaces the manual
choreography with one resumable transaction: preflight (refuses `sink_blocked` with `blocked_paths`,
auto-stashes `.roadmap/issue-N.md`) → push branch → rebase onto `origin/main` → `npm test` (four-chain
gate) → FF-merge → push main → close issue (idempotent) → archive via `cmdFinalize` → cleanup.

```bash
node "$SINK_MERGE_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json
```

**Co-tenant merge protocol.** Each lane cleans up its OWN branch/worktree/folder only AFTER its own
merge lands; the later of two concurrent finishers rebases onto updated main and retries the
fast-forward. A true content conflict halts and asks a human — never auto-resolved. Do not clean up
another session's branch/worktree/folder.

**Crash-resume.** `kaola-workflow/{project}/.cache/sink-receipt.json` tracks each step; re-running
resumes from the last incomplete step. `sink-receipt.json`/`sink-fallback.json` are transaction
journals — a terminally successful sink deletes them itself; a `clean and synced` check that finds one
must DELETE it, never commit it.

`sink-merge.js` exit codes: 0 merged + issue closed + journals disposed (confirm `git status --short
--branch` shows no lingering journal); 1 conflict/fatal (re-run after resolving); 2 FF race exhausted;
3 merge-impossible (receipt in `.cache/sink-fallback.json`, pivots to MR — except keep-open, a typed
BLOCKED). `sink-mr.js`: 0 pushed + MR opened + URL recorded; 1 fatal. After `sink-mr.js` exit 0 the
folder stays open and is archived when `watch-mr` sees the MR MERGED/CLOSED on the next
`/workflow-next` startup.

<!-- PIN: closure-audit -->
### Sink result handling and closure-audit reconciliation sweep

**Transactional catch:** when `--sink --json` returns `result:"refuse"` with
`reason:"sink_incomplete"`, the sink did NOT complete — branch on `step`: `push_main` +
`push_main:"failed"` (merge landed locally, remote not advanced — re-run `--sink`, resolve the remote
fault first); `closure` + `remote_issue_closed:"partial"` + `failed_issue_closures:[...]` (close the
listed issues manually or resolve the forge fault, then re-run `--sink`). The receipt makes resume
idempotent.

**Reconciliation sweep (defense-in-depth):** after a successful sink, run `closure-audit.js` — it
flags a closed issue still carrying `workflow:in-progress`, a stale roadmap source, or an un-archived
merged-PR folder that escaped the inline catch.

```bash
CLOSURE_AUDIT_JS="$(kaola_script kaola-gitlab-workflow-closure-audit.js)"
node "$CLOSURE_AUDIT_JS"            # dry-run: JSON report (default)
# node "$CLOSURE_AUDIT_JS" --execute  # repair safe local drift
```

Dry-run reports without mutating; `--execute` repairs safe local drift (stale `.roadmap` sources,
ROADMAP rows, `workflow:in-progress` on closed issues) and never deletes folders or worktrees. The
inline `sink_incomplete` emit is the immediate transactional catch; `closure-audit` is the after-the-
fact reconciliation sweep — together, defense in depth.

## Completion Contract

This phase closes exactly one issue. After issue #N is closed and the active folder is archived, the
single-issue completion contract is satisfied. Do not auto-route into the next issue. Stop and await
explicit re-direction from the user.
