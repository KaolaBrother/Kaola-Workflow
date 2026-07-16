---
name: kaola-workflow-finalize
description: Use when reviewed Kaola-Workflow for Codex work, also called kaola-workflow, needs final validation, documentation docking, issue or roadmap closure, archiving, and Git finalization.
---

# Kaola-Workflow Finalize

Finalization proves the work is complete and records closure metadata.

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

Read `workflow_path` from `kaola-workflow/{project}/workflow-state.md` (defaults
to `full` when absent). If `workflow_path: fast`, the fast path replaces Phase
1-5: require `fast-summary.md` with status `PASSED` (stop if it is missing or not
`PASSED`), and read it as the Phase 1-5 substitute (`## Scope`, `## Plan`,
`## Implementation Evidence`, `## Review`) wherever the steps below reference
Phase 1/3/5 artifacts. If `workflow_path: adaptive`, the adaptive path
replaces Phase 1-5: require a frozen `workflow-plan.md` (re-check `plan_hash`) whose
`## Node Ledger` rows are all `complete` or `n/a`; on corruption or an incomplete
ledger, stop with a **typed refusal** (`Adaptive plan is not complete or its plan_hash
failed. Run /kaola-workflow-plan-run first.`). Read the plan + Node Ledger as the Phase
1-5 substitute.

The adaptive completion check is **script-enforced**, not prose: run all
four gates and capture each exit code DIRECTLY (never gate on a piped `| tail`, which
reports the tail's exit and masks failure):

```bash
validator_script="plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js"
if [ ! -f "$validator_script" ]; then
  validator_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-plan-validator.js' -print -quit 2>/dev/null)"
fi
PLAN="kaola-workflow/${KAOLA_PROJECT}/workflow-plan.md"
node "$validator_script" "$PLAN" --resume-check --json; RC=$?
node "$validator_script" "$PLAN" --gate-verify   --json; GV=$?
# forward --base to the whole-plan --barrier-check ONLY, mirroring the
# --finalize-check forwarding so the attribution sweep can scope to a project's OWN diff
# on a SHARED multi-issue branch. Sourced from the KAOLA_FINALIZE_BASE env var, defaulting
# to UNSET (→ the validator's `origin/main` default — byte-equivalent to today for
# branch-per-issue runs, so the four-chain walkthrough stays green). The per-node
# --barrier-check STILL rejects --base (the anti-laundering guard) — unchanged.
BARRIER_BASE="${KAOLA_FINALIZE_BASE:-}"
BARRIER_BASE_ARG=()
[ -n "$BARRIER_BASE" ] && BARRIER_BASE_ARG=(--base "$BARRIER_BASE")
node "$validator_script" "$PLAN" --barrier-check --json "${BARRIER_BASE_ARG[@]}"; BC=$?
node "$validator_script" "$PLAN" --verdict-check --json; VC=$?
if [ "$RC" -ne 0 ] || [ "$GV" -ne 0 ] || [ "$BC" -ne 0 ] || [ "$VC" -ne 0 ]; then
  echo "BLOCKED: adaptive barrier failed (resume=$RC gate=$GV barrier=$BC verdict=$VC) — run /kaola-workflow-plan-run first"; exit 1
fi
```

- `--resume-check` proves `plan_hash` integrity + structure + closed library.
- `--gate-verify` proves every completed code/sensitive node is post-dominated by a
  **completed** reviewer in the `## Node Ledger` — closing the G1/H5 leak where a
  required reviewer node is silently marked `n/a` at runtime. **G3: a
  non-delegable `main-session-gate` must be complete — never `n/a` — and post-dominate
  completed code nodes.**
- `--barrier-check` re-scans the files actually written (git diff vs the merge-base of
  HEAD and `origin/main`) and refuses a sensitive write with no `security-reviewer`
  node, or an out-of-allowlist production write — closing H1/H3.
- `--verdict-check` reads every completed `code-reviewer`, `security-reviewer`,
  `adversarial-verifier`, and `main-session-gate` node's `.cache/{node-id}.md` and requires a machine-readable
  `verdict: pass` with `findings_blocking: 0`. Any nonzero exit **blocks the merge** —
  this proves every gate-role node recorded a passing verdict before the plan closes.
  **Exception:** an *investigation* `adversarial-verifier` that post-dominates
  no code-producing or sensitive node is exempt from this check — its refutation is
  analytical output, not a finalize block (applies to both sequence and fanout
  majority-refute shapes). A *change-gate* `adversarial-verifier` (post-dominates a
  code-producing or sensitive node) keeps full `--verdict-check` coverage.

On any failure stop with a **typed refusal** (do not proceed): `Adaptive plan failed
the script-enforced barrier. Run /kaola-workflow-plan-run first.`

### Chain-Receipt Gate

Finalization is **machine-gated** on a fresh, valid chain receipt. The main session stamps that
receipt after all code changes and test-consumed prose/docs for the final candidate have landed, as
the last action before Finalization. Before proceeding past the prerequisite check, verify
`.cache/chain-receipt.json` and stop with a typed refusal if any of the following are true (checked
in precedence order):

- **`chains_unverified`** — `.cache/chain-receipt.json` is absent. No chains have
  been run through the gated runner; prose attestation is not accepted.
  Remedy: the orchestrator (main session) must run `kaola-workflow-run-chains.js`
  (resolved the same way as `validator_script` above) after the final candidate is assembled so the
  receipt is written against the current HEAD. Do NOT delegate this to the contractor
  subagent — the contractor only verifies.
- **`chains_stale`** — the receipt's `codeTreeHash` no longer matches the current
  code-relevant tree: code or a chain-asserted doc changed since the chains ran.
  Workflow state and inert, non-test-consumed docs do NOT trigger it; a legacy receipt without
  `codeTreeHash` falls back to the `headSha`-vs-HEAD pin. Diagnostics may identify stale paths or
  a stale kind, but the remedy is still a full restamp.
  Remedy: the orchestrator (main session) must re-run `kaola-workflow-run-chains.js`
  to regenerate the receipt against HEAD. Do NOT patch the receipt, and do NOT delegate this to
  the contractor subagent.
- **`chains_red`** — at least one chain has a non-zero exit code and
  `accepted_red: false`. A real failing chain that has not been explicitly waived
  blocks finalization.
  Remedy: fix the failing chain, OR waive it with
  `--accept-known-red <name>:<open-issue>` if it is a known-failing chain tracked
  by an open issue (the waiver is recorded durably in the receipt and the other
  chains still gate).

These typed refusals are emitted by `cmdFinalize` / the plan-validator's
finalize/verdict path and are classified structurally — do not match by string.

**Consumer product repos.** The Chain-Receipt Gate above is the **self-host (npm)** mode.
A consumer repo whose validation is not npm-based (no `test:kaola-workflow:*` scripts in
`package.json`) does **NOT** run `kaola-workflow-run-chains.js` — the agent owns verification. It records `.cache/final-validation.md` with a column-0 **`verdict: pass`**, and
`--finalize-check` (consumer mode, auto-detected by the absent npm scripts) gates on that file:
`final_validation_unverified` if it is absent, `final_validation_failed` if it lacks `verdict: pass`,
`final_validation_unbound` if it lacks a well-formed column-0 `validated_candidate_hash:` line, and
`final_validation_stale` if that recorded hash no longer equals the recomputed current code-tree
hash (the refusal payload carries `recorded_candidate_hash` + `current_candidate_hash`). Produce
the hash with the plan-validator's `--candidate-hash --json` mode (`$validator_script`) — computed
LAST, after every file the validation covered has landed — and record it as a column-0
`validated_candidate_hash:` line. On `final_validation_stale`, re-run the recorded validation
command and re-record with a fresh hash — never hand-patch the hash; workflow state and inert,
non-test-consumed docs are validation-invisible and do not stale the binding. The binding gate
compares two hashes and never re-runs tests.
If an unchanged terminal change-gate validation run covers the final candidate, the agent may cite
that run instead of rerunning by recording column-0 `verdict: pass`, `source: cited:<node-id>`,
`validated_command`, `validated_at_head`, and `reuse_boundary`, plus a fresh
`validated_candidate_hash:` computed at citation time (the binding is what proves the cited run
still covers the candidate). Any doubt about the boundary means run the command.
The attribution sweep runs for **both** repo kinds. The v6.2.0 `kaola-workflow/chains.json` opt-in
is **retired** — there is no middle-ground; a consumer repo finalizes on the agent's evidence.

### Run-Gap Sweep Gate

Finalization is **machine-gated** on a clean run-gap sweep. Before
proceeding past the prerequisite check, verify `.cache/run-gaps.json` and
`finalization-summary.md`'s `## Run gaps` section and stop with a typed
refusal if the following is true (checked after the Chain-Receipt Gate above):

- **`gaps_unswept`** — emitted by `kaola-workflow-gap-sweep.js --check`
  (resolved the same way as `validator_script` above) when
  `.cache/run-gaps.json` contains a swept reason class with no matching entry
  in the `## Run gaps` section of `finalization-summary.md`, or when that
  section is absent while swept classes exist.
  Remedy: for each real run-discovered defect (`in_run_repair`,
  `deferred_red_chain`, or `manual:<slug>`), file a follow-up issue and record
  `filed: #N` in the `## Run gaps` section. If the item is not a product
  defect (upstream flake, tool-environment noise, or an already-filed and
  tracked waiver), record `noise: <one-line justification>` instead.
- **`observed_gap_unseeded`** — emitted by the same `--check` call when an
  entry already written into `finalization-summary.md`'s `## Run gaps`
  section (mapped to `filed:` or `noise:`) has no matching machine-swept
  entry in `.cache/run-gaps.json` — i.e. someone hand-typed a `## Run gaps`
  row for a gap the scanner never observed, bypassing machine verification
  entirely. Remedy: append the matching `gap: <class> — <text>` line to
  `.cache/run-gaps-manual.md`, re-run the scanner so it is actually swept,
  then re-run `--check`.

These typed refusals are classified structurally — do not string-match.

### Goal Attestation (advisory, v1)

Export `KAOLA_GOAL` before finalizing (or set a `goal:` line in the plan's Meta
block) so `cmdFinalize`'s advisory `goal_check` records `satisfied`; see
`docs/api.md` § Goal Attestation for the full enum and rationale.

## Goal Contract

Continue until final validation, acceptance audit, documentation docking,
roadmap refresh, archive decision, and Git finalization evidence are complete.
Before declaring completion, audit every explicit requirement against concrete
evidence. Stop only for true external authorization, materially user-owned
choices, or ambiguity that blocks correctness.


## Guardrails


- Run or cite fresh final validation before claiming completion.
- Do not close issues until acceptance criteria pass.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Commit And Push happens after docs, issues, roadmap, archive, and metadata are complete.

## Required Steps

1. Final validation: on self-host (npm) run the four-chain receipt gate (test suite, type check, lint, build) after all test-consumed prose/docs and code changes have landed, as the last pre-Finalization action; on a consumer (non-npm) repo run the plan's `## Meta` `validation_command` once against the final candidate state, or cite fresh prior evidence with `source: cited:<node-id>`, `validated_command`, `validated_at_head`, and `reuse_boundary`. Save output to `.cache/final-validation.md`, then bind it: record a column-0 `validated_candidate_hash:` line produced by the plan-validator's `--candidate-hash --json` as the LAST action, after every file the validation covered has landed. **State the actual validation-reuse boundary, not a false absolute:** when you cite a prior run instead of rerunning, record which node/state it covered and that later finalize-step edits (e.g. a `CHANGELOG.md`/docs touch in the finalize node) are outside it — do NOT write a terminal absolute like `No files changed after those runs` when the finalize node itself changes docs/changelog afterward. Any doubt about the boundary means run the command. (At closure, `archiveProjectDir` also mechanically neutralizes that known false-absolute phrase in the archived `.cache/final-validation.md` as a backstop.)
<!-- PIN: fast-compliance-backstop -->
2. Acceptance check: verify Phase 1 success criteria, Phase 3 tasks, tests, review status, and absence of debug artifacts. On the fast path (`workflow_path: fast`), source these from `fast-summary.md` and verify fast-path review compliance: the `## Required Agent Compliance` `code-reviewer` row must record a real delegation status (`subagent-invoked`, `local-fallback-explicit`, or `local-fallback-tool-unavailable`) with a real evidence path or skip\_reason — not `pending`, `invoked` without evidence, or bare `N/A` without skip\_reason — whenever `## Scope` lists more than one changed file or any production-path file (outside `docs/`, `*.md`, `tests/`); `N/A` with a documented skip\_reason is allowed only for the trivial band (a single docs/comment/markdown edit). The `fast_compliance_unresolved` script refusal enforces this fail-closed at `summary-write` time; this step is a second-line gate.
   ```bash
   ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
   [ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
   ```

3. Documentation update: use the `doc-updater` Codex agent role when documentation changes are needed. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable. Pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to the doc-updater agent. Update docs only when behavior, API, setup, architecture, env, roadmap, or user-facing workflow changed. Save output to `.cache/doc-updater.md` or write a no-impact reason. Anti-fabrication (required): instruct `doc-updater` to transcribe verified ground truth — actual `node <script> --json`/`--help` output, real function signatures, or existing schema read from the code — for any API/schema/CLI-output/config section, or emit `BLOCK: <what it needs>` instead of inventing field names, keys, enum values, or example numbers; treat any untraceable structured section as a docking gap (`BLOCKED`).
4. Documentation Docking: compare changed files with `README.md`, API docs, architecture docs, changelog, `.env.example`, roadmap, and issue comments when relevant. Save `.cache/doc-docking.md` with verdict `DOCKED` or `BLOCKED`.
5. Closure decision: scan all phase files for deferred items or user decisions. Ask before reorganizing issues or roadmap.
6. Refresh `kaola-workflow/ROADMAP.md`.
7. Archive is performed atomically by `cmdFinalize` in step 8b below. Do not perform a manual copy or git mv here.

   **Keep-open partial-close terminal.** If the Closure Decision Gate keeps the issue
   OPEN (partial implementation, residual follow-ups), the durable signal is one optional line in
   the `## Sink` block: `issue_action: comment_keep_open` (default when absent: close), written by
   the main session at the gate with user approval. Still archive through the SAME `finalize`
   subcommand, adding `--keep-open` (the contractor adds `--keep-issue-open` to `cmdFinalize` when
   the field is present). It stamps the archived `workflow-state.md` terminal
   (`last_result: closed_keep_open`, `issue_disposition: kept-open`, no active `next_command`),
   PRESERVES `kaola-workflow/.roadmap/issue-N.md`, and regenerates `ROADMAP.md` still listing #N
   (closure invariant `keep-open-roadmap-preserved` enforces it). Never archive by manual
   `mv`/`git mv`. **Keep-open is merge-sink-only**: `sink-merge --keep-issue-open` comments WITHOUT
   closing; a PR/MR sink would auto-close via its `Closes #N` body, so Step 9 refuses a non-merge
   sink (and the exit-3 PR/MR auto-pivot) under keep-open, and `sink-pr.js`/`sink-mr.js` refuse a
   project carrying `issue_action: comment_keep_open`.
8. Commit and push only approved files.

   ### Staging Guard

   Enforce the single-project rule. If more than one
   `kaola-workflow/*/` project is staged at once, split the commit:

   ```bash
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

   **Before delegating to the contractor**: gate on repo kind:

   - **Self-host (npm)** — the repo's `package.json` declares the `test:kaola-workflow:*`
     scripts: run `kaola-workflow-run-chains.js` (main session, resolved the same way as
     `validator_script` above) after all test-consumed prose/docs and code changes have landed, as
     the last pre-Finalization action. The contractor only VERIFIES the resulting
     `.cache/chain-receipt.json` — it does not run the chains. `cmdFinalize` (Step 8b) enforces the
     finalize gate fail-closed before the archive rename; the contractor will return
     `finalize_gate_unverified` if the receipt is absent, stale, or red. If `chains_stale` fires,
     rerun the full gated runner; validation-invisible workflow state and inert docs do not stale
     the receipt.
   - **Consumer (non-npm)** — the repo has no `test:kaola-workflow:*` scripts: do **NOT**
     invoke `kaola-workflow-run-chains.js` (it would only return `chains_config_missing`). The
     gate is the agent's own `.cache/final-validation.md` with a column-0 `verdict: pass`,
     produced by running the plan's `## Meta` `validation_command` or by citing an unchanged
     terminal change-gate validation run with `source: cited:<node-id>`, `validated_command`,
     `validated_at_head`, and `reuse_boundary`; `--finalize-check` auto-detects consumer mode
     (absence of the npm scripts) and gates on that file. Any doubt about the boundary means run
     the command.

   The mechanical finalization below — the artifact mirror, the `cmdFinalize` archive + status close (with `--keep-worktree`, merge path only), roadmap refresh, and the `chore: finalize ${KAOLA_PROJECT}` commit gate — is deterministic bookkeeping. The `contractor` Codex agent role is the SOLE HOME of this procedure and the session MUST delegate it; the contractor runs the scripts and authors the durable bookkeeping but never dispatches a role, judges, or asks the user. Only if the `contractor` subagent tooling is genuinely unavailable may the session run it inline, and that fallback MUST be logged as `local-fallback-tool-unavailable` in the `## Required Agent Compliance` ledger. The current session keeps the sink dispatch and issue-close decision. Because a subagent runs in its own shell, capture the sink metadata (`SINK_BRANCH`, `SINK_KIND`, `SINK_ISSUE_FLAG`, `ACTIVE_WORKTREE_PATH`) in THIS session before delegating — they are reused at the sink step and do not cross the delegation boundary.

   Attestation boundary: the contractor's Step 8b passes `--attest-contractor-spawn` to `cmdFinalize`, so a genuinely delegated run back-fills its own dispatch marker and the closure receipt reads `finalize_contractor_attested: attested` even where the SubagentStart hook cannot fire (a contractor dispatched into a linked worktree, or a hookless harness) — the main session must never pass that flag on an inline run. The adaptive plan's `finalize (<node>)` Required Agent Compliance row is recorded `main-session-direct` (its in-plan sink bookkeeping is main-session-direct by the plan-run contract); that row neither requires nor replaces the contractor's delegation of mechanical finalization here. When the session legitimately runs the mechanical finalization inline (tooling unavailable), it records `local-fallback-tool-unavailable` with evidence and does NOT pass `--attest-contractor-spawn`; the resulting `finalize_contractor_attested: missing` plus the ATTESTATION WARNING is the truthful, expected, non-blocking outcome.

   Warning persistence: `cmdFinalize` also appends a `## Attestation` section to the archived `finalization-summary.md`, recording both status fields plus any non-empty ATTESTATION WARNING verbatim — a clean-looking summary must never silently drop a warning that occurred; never remove or summarize this section away.

   **Finalization recovery contract (tribal knowledge).** Three recovery rules are binding,
   not optional lore: (1) **sync order is worktree→main BEFORE the mirror** — the worktree holds the
   *complete* ledger and the main copy is stale, so sync worktree→main first; the mirror only pushes
   Finalization artifacts INTO the worktree and must never overwrite a complete worktree ledger with
   a staler main copy (the Step-8a guard below enforces this — on a refusal, sync worktree→main, do
   not bypass it); (2) **the machinery never authors the implementation commit** — if it is missing
   at finalize, surface it and stop, do not cover for it; (3) **after a sink-merge rebase detour,
   repair the MAIN checkout** named in the failure's `git -C <path>` line, never `cd` the deleted
   worktree, and finish with `--force-with-lease`.

   Before mirroring artifacts, resolve the linked worktree and copy Finalization artifacts:

   ```bash
   # Artifact mirror: copy Finalization artifacts from main worktree to linked worktree.
   # Mirror MUST run after all Finalization artifact writes.
   _COORD_ROOT_RAW="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
   if [[ "$_COORD_ROOT_RAW" != /* ]]; then _COORD_ROOT_RAW="$(pwd)/$_COORD_ROOT_RAW"; fi
   ACTIVE_WORKTREE_PATH="$(pwd)"
   _WT="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
   [ -n "$_WT" ] && [ -d "$_WT" ] && ACTIVE_WORKTREE_PATH="$_WT"
   if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]; then
     # ledger-regression guard. Refuse to copy a STALER main plan over a MORE-COMPLETE worktree
     # plan (which would reset a finished run's ledger complete->pending). FAIL-OPEN on the first sync.
     ledger_compare_script="plugins/kaola-workflow/scripts/kaola-workflow-ledger-compare.js"
     if [ ! -f "$ledger_compare_script" ]; then
       ledger_compare_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-ledger-compare.js' -print -quit 2>/dev/null)"
     fi
     if [ -n "$ledger_compare_script" ] && ! node "$ledger_compare_script" \
         --source "kaola-workflow/${KAOLA_PROJECT}/workflow-plan.md" \
         --dest "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/workflow-plan.md"; then
       echo "REFUSED: main copy staler than the worktree ledger; sync worktree->main FIRST" >&2
       exit 1
     fi
     mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
     cp -R "kaola-workflow/${KAOLA_PROJECT}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
     git status --porcelain | while IFS= read -r line; do
       f="${line:3}"
       case "$f" in kaola-workflow/*) continue;; esac
       if [ -f "$(pwd)/$f" ]; then
         mkdir -p "$ACTIVE_WORKTREE_PATH/$(dirname "$f")"
         cp "$(pwd)/$f" "$ACTIVE_WORKTREE_PATH/$f"
       fi
     done
   fi
   ```

   ### Step 8b - Finalize (Archive + Status Close)

   This step runs **only when `sink: merge`**. For `sink: pr`, skip to Step 8 — the active folder must remain open so `sink-pr.js` can write `pr_url` and `watch-pr` can archive the folder when the PR merges or closes.

   Capture sink metadata from the active state before archive. Do not read
   `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` again after this point
   on the merge path, because `cmdFinalize` renames it into `archive/`.

   ```bash
   claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
   if [ ! -f "$claim_script" ]; then
     claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
   fi
   SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
   SINK_KIND="${SINK_KIND:-merge}"
   SINK_ISSUE_FLAG=""
   [ -n "$SINK_ISSUE" ] && [ "$SINK_ISSUE" != "unset" ] && SINK_ISSUE_FLAG="--issue $SINK_ISSUE"
   SINK_ISSUE_NUMBERS=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_numbers:' | awk '{print $2}')  # bundle members
   [ -z "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS=$(grep '^issue_numbers:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE_NUMBERS_FLAG=""
   [ -n "$SINK_ISSUE_NUMBERS" ] && SINK_ISSUE_NUMBERS_FLAG="--issue-numbers $SINK_ISSUE_NUMBERS"
   # keep-open partial-close terminal — issue_action defaults to close when absent.
   SINK_ISSUE_ACTION=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^issue_action:' | awk '{print $2}')
   SINK_ISSUE_ACTION="${SINK_ISSUE_ACTION:-close}"
   SINK_KEEP_OPEN_FLAG=""
   [ "$SINK_ISSUE_ACTION" = "comment_keep_open" ] && SINK_KEEP_OPEN_FLAG="--keep-issue-open"
   ```

   If `SINK_KIND` is `merge`, run `cmdFinalize` from the linked worktree after the artifact mirror and before the commit gate:

   **Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/${KAOLA_PROJECT}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares `mainRootFromCoord(getCoordRoot(root))` with `root` (both passed through `fs.realpathSync` to resolve symlinked tmpdirs). If they differ, the main repo's `kaola-workflow/${KAOLA_PROJECT}/` is removed. When `cwd` resolves to the same directory as the git common-dir's parent (typically when `KAOLA_WORKTREE_NATIVE=0`, or when `cmdFinalize` is invoked manually from the main repo), the cleanup is a no-op because main root === caller root.

   ```bash
   if [ "$SINK_KIND" = "merge" ]; then
     (cd "$ACTIVE_WORKTREE_PATH" && node "$claim_script" finalize \
       --project "$KAOLA_PROJECT" \
       --keep-worktree $SINK_KEEP_OPEN_FLAG)
   fi
   ```

   When it runs, `cmdFinalize` atomically writes `status: closed` + `step: complete` to `workflow-state.md` and
   renames `kaola-workflow/${KAOLA_PROJECT}/` → `kaola-workflow/archive/${KAOLA_PROJECT}/`
   in the linked worktree. The rename is staged and committed in the commit gate below.

   `sink-merge` will refuse with exit 1 if `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` is still present on the branch HEAD when it runs; this is a safety guard that ensures finalize always precedes the merge.

   If `SINK_KIND` is `pr`: skip this step. Proceed to Step 8 (commit). The active folder remains open. `sink-pr.js` (Step 9) writes the PR URL into the active folder. `watch-pr` (on the next `/workflow-next` startup) detects the merged or closed PR and archives the folder automatically.

   Before sink dispatch, stage only approved implementation, docs, roadmap,
   archive, and workflow artifacts for this project, then create the final
   conventional commit on the workflow branch:

   ```bash
   : "${ACTIVE_WORKTREE_PATH:=$(pwd)}"
   git -C "$ACTIVE_WORKTREE_PATH" status --short
   git -C "$ACTIVE_WORKTREE_PATH" add <approved-files-only>
   git -C "$ACTIVE_WORKTREE_PATH" commit -m "chore: finalize ${KAOLA_PROJECT}"
   git -C "$ACTIVE_WORKTREE_PATH" status --short
   ```

   If there is nothing to commit, verify and record that the branch already
   contains the final candidate commit. Do not run a sink with uncommitted final
   changes.

   After the commit gate, dispatch to the correct sink script using the sink
   metadata captured before archive:

   ```bash
   scripts_dir="$(dirname "$claim_script")"
   : "${SINK_BRANCH:?SINK_BRANCH must be captured before archive}"
   : "${SINK_KIND:=merge}"
   : "${SINK_ISSUE_FLAG:=}"
   : "${SINK_KEEP_OPEN_FLAG:=}"
   # keep-open is merge-sink-only — refuse a PR sink before dispatch.
   if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
     echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink. PR/MR sinks close via the merged PR; switch sink: merge or remove issue_action." >&2
     exit 1
   fi
   case "$SINK_KIND" in
     pr)
       node "$scripts_dir/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
       ;;
     merge|*)
       node "$scripts_dir/kaola-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project "$KAOLA_PROJECT"
       _SINK_MERGE_EXIT=$?
       if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
         # keep-open is merge-sink-only — never auto-pivot to a PR sink (its Closes #N body
         # would close the kept-open issue; watch-pr would delete the preserved roadmap source).
         if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
           echo "BLOCKED: sink-merge exited 3 (merge-impossible) on a keep-open run. Keep-open is merge-sink-only: the PR fallback body closes the issue on merge and watch-pr would delete the preserved roadmap source. Remediate the merge blocker (see .cache/sink-fallback.json) and re-run sink-merge; do not pivot to a PR sink." >&2
           exit 1
         fi
         node "$scripts_dir/kaola-workflow-claim.js" sink-fallback \
           --project "$KAOLA_PROJECT"
         node "$scripts_dir/kaola-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
         exit $?
       fi
       [ "$_SINK_MERGE_EXIT" -ne 0 ] && exit "$_SINK_MERGE_EXIT"
       ;;
   esac
   ```

   ### Script-owned worktree sink (`--sink` mode)

   When the branch carries a worktree run (recorded `run_posture: worktree`), use the `--sink` flag to
   replace the manual 8-step choreography:

   ```bash
   node "$scripts_dir/kaola-workflow-sink-merge.js" \
     --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG \
     $SINK_KEEP_OPEN_FLAG \
     --project "$KAOLA_PROJECT" \
     --sink --json
   ```

   `--sink` mode runs a single resumable transaction:
   1. **Preflight** — refuses `sink_blocked` with `blocked_paths` listing any foreign dirt; zero mutation on refusal.
      Auto-stashes the claim-time `.roadmap/issue-N.md` if present.
   2. **Push branch** — `git push -u origin {branch}` (creates upstream if absent)
   3. **Rebase** — rebases onto `origin/main` (`--force-with-lease` on branch)
   4. **Test** — runs `npm test` (four-chain gate for cross-edition diffs)
   5. **FF-merge** — fast-forward merges branch into main
   6. **Push main** — `git push origin main`
   7. **Close issue** — idempotent (probe-before-close)
   8. **Archive** — via `cmdFinalize` internals
   9. **Cleanup** — stash restore, remove worktree

   **Co-tenant merge protocol.** Each lane cleans up its own branch, worktree, and `kaola-workflow/<project>/` folder ONLY AFTER its own merge lands — cleanup follows the merge, not the other way around. When two sessions run concurrently: the first finisher merges normally; the later finisher rebases onto the updated main and retries the fast-forward merge. A true content conflict halts and asks a human — it is NEVER auto-resolved. Do not clean up another session's branch, worktree, or project folder.

   **Crash-resume**: a step-receipt at `kaola-workflow/{project}/.cache/sink-receipt.json` tracks each step.
   Re-running the command after a crash resumes from the last incomplete step — no double-apply.

<!-- PIN: closure-audit -->
### Sink result handling and closure-audit reconciliation sweep

**Transactional catch (n1's `sink_incomplete` emit):** when `--sink --json` returns
`result:"refuse"` with `reason:"sink_incomplete"`, the sink did NOT complete — do NOT treat it as
success. Branch on `step`:

- `step:"push_main"` + `push_main:"failed"` — the merge landed locally but the remote was NOT
  advanced. The deliverable is not on the remote. Re-run `--sink` to resume (the receipt makes the
  push step idempotent). Resolve any remote fault first.
- `step:"closure"` + `remote_issue_closed:"partial"` + `failed_issue_closures:[...]` — the merge
  is on the remote but one or more issues could not be closed. Close the listed issues manually
  (`gh issue close N`) or resolve the forge fault, then re-run `--sink`.

In either case, the receipt preserves the partial state so `--sink` resumes from the incomplete step
without double-applying completed steps.

**Reconciliation sweep (defense-in-depth):** after a successful sink, run `closure-audit.js` as the
after-the-fact drift detector — it flags a closed issue still carrying `workflow:in-progress`, a
stale roadmap source, or an un-archived merged-PR folder that escaped the inline catch.

```bash
node "$scripts_dir/kaola-workflow-closure-audit.js"            # dry-run: JSON report (default)
# node "$scripts_dir/kaola-workflow-closure-audit.js" --execute  # repair safe local drift
```

Dry-run (default) reports findings as JSON without mutating state. Pass `--execute` to repair safe
local drift (stale `.roadmap` sources, ROADMAP rows, `workflow:in-progress` label on closed issues).
It never deletes folders or worktrees.

**Two-mechanism rationale:** the inline `sink_incomplete` emit is the immediate transactional catch
(fires at sink time, refuses the sinked status so the caller knows immediately). `closure-audit` is
the periodic broad reconciliation sweep (runs after the fact, catches drift that the inline path
cannot reach — e.g. a label left behind by a prior partial run or a folder not archived). Together
they form the defense-in-depth complement: transactional catch + reconciliation sweep.

## Summary File

Plain `invoked` is intentional for non-Codex-role workflow gates such as final
validation, documentation docking, roadmap refresh, archive, and final commit;
delegation vocabulary applies only to Codex role rows like `doc-updater`.

```markdown
# Finalization - Summary: {project}

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
| doc-updater | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/doc-updater.md | reason if N/A |
| documentation docking | invoked | .cache/doc-docking.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | invoked | kaola-workflow/archive/{project} | |
| final commit and push | invoked | git status --short --branch | clean and synced |
```

`sink-receipt.json` / `sink-fallback.json` are transaction journals owned by the sink script — they
exist on disk only for crash-resume, and a terminally successful sink deletes them itself. A "clean
and synced" check that finds one afterwards (an older cycle's residue) must DELETE the file, never
commit it; a journal is never part of the deliverable.

State remains in `workflow-state.md` until archive is complete.

## Completion Contract

This skill closes exactly one issue. After issue #N is closed and the active folder is archived,
the single-issue completion contract is satisfied. Stop and await explicit re-direction
from the user. Do not auto-route into the next issue in line.
