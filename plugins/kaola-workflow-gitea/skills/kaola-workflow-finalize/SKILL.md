---
name: kaola-workflow-finalize
description: Use when reviewed Kaola-Workflow for Codex work, also called kaola-workflow, needs final validation, documentation docking, issue or roadmap closure, archiving, and Git finalization.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, re-plan,
or real dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
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
KAOLA_CODEX_PREFLIGHT_ARGS=(--project-root "$PWD" --no-autofix --json)
if [ -n "${KAOLA_CODEX_PREFLIGHT_PLAN:-}" ]; then
  KAOLA_CODEX_PREFLIGHT_ARGS+=(--plan "$KAOLA_CODEX_PREFLIGHT_PLAN")
fi
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" "${KAOLA_CODEX_PREFLIGHT_ARGS[@]}" 2>&1)"; then
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
merges persisted config from HOME through the repository root to `"$PWD"`. When this
skill owns a frozen adaptive plan, set `KAOLA_CODEX_PREFLIGHT_PLAN` to that
exact plan before running the block so `--plan` is also enforced. Continue only
after exit 0 and parsed `status: "ok"`. Exact-byte drift such as
`profile_bytes_mismatch` is `profile_preflight_refused`: STOP before any
`agents.spawn_agent` call, never record `subagent-invoked`, and do not relabel
profile/config drift as tool unavailability or local fallback. Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Kaola-Workflow Finalize

## In-progress re-plan control plane

<!-- PIN: replan-finalize -->

This fence outranks every Finalization prerequisite and side effect. Before validation, contractor
dispatch, archive, closure, roadmap, commit, or sink work, read the project state and transaction
status. If either reports `replan_in_progress`, the frozen parent remains authoritative and
Finalization is forbidden. Read-only orientation reports the exact `replan_phase`,
`transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and `last_cas_result`.

The single legal mutation while the fence is active is:

```bash
REPLAN_SCRIPT="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js"
if [ ! -f "$REPLAN_SCRIPT" ]; then
  REPLAN_SCRIPT="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-replan.js' -print -quit 2>/dev/null)"
fi
[ -n "$REPLAN_SCRIPT" ] && [ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitea-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

`decision:ask` remains advisory. If resume returns `replan_planner_dispatch_required`, dispatch
the genuine `workflow-planner` profile in Re-plan dispatch mode with only repository root, project,
`transaction_id`, `dispatch_nonce`, profile identity, the exact
`.cache/replan-planner-packet.json` path, and its reason/source evidence. No role sequence, node
ids, dependencies, write sets, cardinality, shape, model, or exact DAG fragment may come from the
orchestrator; that is `planner_control_boundary_violation`. Only the planner writes the seeded
`workflow-plan.next.md` and `.cache/replan-planner-attestation.json`; then run the same resume
command. Missing or mismatched proof is `replan_planner_attestation_invalid`.

An invalid child uses the bounded unfrozen child-repair loop with the same planner and verbatim
validator errors; the main session never repairs the child DAG. At the bound, stop with typed
evidence—never finalize the parent, start another claim, or route to another path. A verified
legacy-v1 parent transitions through the same fenced resume path; normal legacy behavior outside a
transaction remains unchanged.

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

Adaptive is the only workflow path. Read `workflow_path: adaptive` from
`kaola-workflow/{project}/workflow-state.md` and require a frozen `workflow-plan.md`
(re-check `plan_hash`) whose `## Node Ledger` rows are all `complete` or `n/a`; on corruption
or an incomplete ledger, stop with a **typed refusal** (`Adaptive plan is not complete or its
plan_hash failed. Run /kaola-workflow-plan-run first.`). Read the plan + Node Ledger as the
Phase 1-5 substitute.

The adaptive completion check is **script-enforced**, not prose: run all
four gates and capture each exit code DIRECTLY (never gate on a piped `| tail`, which
reports the tail's exit and masks failure):

```bash
validator_script="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js"
if [ ! -f "$validator_script" ]; then
  validator_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-plan-validator.js' -print -quit 2>/dev/null)"
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

If `workflow-plan.md` is absent, `cmdFinalize` refuses unconditionally — before any
archive/close side effect — with the typed `finalize_gate_unverified` /
`adaptive_plan_missing` refusal (there is no retired fast/full verifier to shell and no
N/A pass):

```text
BLOCKED: finalize_gate_unverified (adaptive_plan_missing) — restore the frozen workflow-plan.md before Finalization.
```

### Validation Gate (dual-mode by repo kind)

`--finalize-check` auto-detects mode; the attribution sweep runs for both. Never gate on CI. These
typed refusals are classified structurally — do not string-match; the remedy for a stale receipt/hash
is always a full re-run, never a hand-patch.

- **Self-host (npm)** (declares `test:kaola-workflow:*`): machine-gated on a fresh, valid
  `.cache/chain-receipt.json`. The main session runs `kaola-workflow-run-chains.js` after all code +
  test-consumed prose/docs land, as the last pre-Finalization action (do NOT delegate — the contractor
  only verifies). Precedence-ordered refusals: `chains_unverified` (absent), `chains_stale`
  (`codeTreeHash` ≠ code-relevant tree; inert docs + workflow state do not trigger it), `chains_red`
  (a real failing chain, `accepted_red: false` — fix it or waive `--accept-known-red <name>:<open-issue>`).
- **Consumer (non-npm)** (no `test:kaola-workflow:*`): does NOT run chains — the agent owns
  verification and records `.cache/final-validation.md` with a column-0 `verdict: pass` +
  `validated_candidate_hash:` (produce it with the plan-validator's `--candidate-hash --json` mode
  via `$validator_script`, computed LAST). `--finalize-check` gates on `final_validation_unverified`
  / `final_validation_failed` / `final_validation_unbound` / `final_validation_stale`. When the
  candidate is unchanged since a terminal change-gate run, cite it with `source: cited:<node-id>`,
  `validated_command`, `validated_at_head`, `reuse_boundary`, plus a fresh `validated_candidate_hash:`.
  Any doubt → run the command. The attribution sweep runs for both repo kinds.

### Run-Gap Sweep Gate

Finalization is **machine-gated** on a clean run-gap sweep. Before
proceeding past the prerequisite check, verify `.cache/run-gaps.json` and
`finalization-summary.md`'s `## Run gaps` section and stop with a typed
refusal if the following is true (checked after the Chain-Receipt Gate above):

- **`gaps_unswept`** — emitted by `kaola-gitea-workflow-gap-sweep.js --check`
  (resolved the same way as `claim_script` above) when `.cache/run-gaps.json`
  contains a swept reason class with no matching entry in the `## Run gaps`
  section of `finalization-summary.md`, or when that section is absent while
  swept classes exist.
  Remedy: for each real run-discovered defect (`in_run_repair`,
  `deferred_red_chain`, or `manual:<slug>`), file a follow-up issue with the
  forge and record `filed: #N` in the `## Run gaps` section. If the item is
  not a product defect (upstream flake, tool-environment noise, or an
  already-filed and tracked waiver), record `noise: <one-line justification>`
  instead.
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

1. Final validation: on self-host (npm) run the four-chain receipt gate (test suite, type check, lint, build) after all test-consumed prose/docs and code changes have landed, as the last pre-Finalization action; on a consumer (non-npm) repo run the plan's `## Meta` `validation_command` once against the final candidate state, or cite fresh prior evidence with `source: cited:<node-id>`, `validated_command`, `validated_at_head`, and `reuse_boundary`. Save output to `.cache/final-validation.md`, then bind it: record a column-0 `validated_candidate_hash:` line produced by the plan-validator's `--candidate-hash --json` as the LAST action, after every file the validation covered has landed. Any doubt about the boundary means run the command.
2. Acceptance check: verify Phase 1 success criteria, Phase 3 tasks, tests, review status, and absence of debug artifacts. Adaptive's `--verdict-check` barrier (see the Prerequisite gate above) is the sole compliance gate.
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
   closing; a PR sink would auto-close via its `Closes #N` body, so Step 9 refuses a non-merge sink
   (and the exit-3 PR auto-pivot) under keep-open, and `sink-pr.js` refuses a project carrying
   `issue_action: comment_keep_open`.
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
     `claim_script` above) after all test-consumed prose/docs and code changes have landed, as the
     last pre-Finalization action. The contractor only VERIFIES the resulting
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
     # The guard is forge-neutral (kaola-workflow-ledger-compare.js) but ships in this edition's tree.
     ledger_compare_script="plugins/kaola-workflow-gitea/scripts/kaola-workflow-ledger-compare.js"
     if [ ! -f "$ledger_compare_script" ]; then
       ledger_compare_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-workflow-ledger-compare.js' -print -quit 2>/dev/null)"
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

   This step runs **only when `sink: merge`**. For `sink: mr` or `sink: pr`, skip
   to the commit gate so `sink-pr.js` can write PR metadata into the active
   folder and `watch-pr` can archive it when the PR merges or closes.

   Capture sink metadata from the active state before archive. Do not read
   `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` again after this point
   on the merge path, because `cmdFinalize` renames it into `archive/`.

   ```bash
   claim_script="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js"
   if [ ! -f "$claim_script" ]; then
     claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-claim.js' -print -quit 2>/dev/null)"
   fi
   SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
   SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
   SINK_KIND="${SINK_KIND:-merge}"
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
   [ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
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
   if [ "$SINK_KIND" = "merge" ]; then
     (cd "$ACTIVE_WORKTREE_PATH" && node "$claim_script" finalize \
       --project "$KAOLA_PROJECT" \
       --keep-worktree $SINK_KEEP_OPEN_FLAG)
   fi
   ```

   **Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/${KAOLA_PROJECT}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares `mainRootFromCoord(getCoordRoot(root))` with `root` (both passed through `fs.realpathSync` to resolve symlinked tmpdirs). If they differ, the main repo's `kaola-workflow/${KAOLA_PROJECT}/` is removed. When `cwd` resolves to the same directory as the git common-dir's parent (typically when `KAOLA_WORKTREE_NATIVE=0`, or when `cmdFinalize` is invoked manually from the main repo), the cleanup is a no-op because main root === caller root.

   When it runs, this atomically writes `status: closed` + `step: complete` to
   `workflow-state.md` and renames `kaola-workflow/${KAOLA_PROJECT}/` →
   `kaola-workflow/archive/${KAOLA_PROJECT}/` in the linked worktree. The rename
   is staged and committed in the commit gate below.

   `sink-merge` will refuse with exit 1 if `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` is still present on the branch HEAD when it runs; this is a safety guard that ensures finalize always precedes the merge.

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
   : "${SINK_ISSUE_NUMBERS_FLAG:=}"
   : "${SINK_KEEP_OPEN_FLAG:=}"
   # keep-open is merge-sink-only — refuse a PR sink before dispatch.
   if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
     echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink. PR sinks close via the merged PR; switch sink: merge or remove issue_action." >&2
     exit 1
   fi
   case "$SINK_KIND" in
     mr|pr)
       node "$scripts_dir/kaola-gitea-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
       ;;
     merge|*)
       node "$scripts_dir/kaola-gitea-workflow-sink-merge.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project "$KAOLA_PROJECT"
       _SINK_MERGE_EXIT=$?
       if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
         # keep-open is merge-sink-only — never auto-pivot to a PR sink (its Closes #N body
         # would close the kept-open issue; watch-pr would delete the preserved roadmap source).
         if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
           echo "BLOCKED: sink-merge exited 3 (merge-impossible) on a keep-open run. Keep-open is merge-sink-only: the PR fallback body closes the issue on merge and watch-pr would delete the preserved roadmap source. Remediate the merge blocker (see .cache/sink-fallback.json) and re-run sink-merge; do not pivot to a PR sink." >&2
           exit 1
         fi
         node "$scripts_dir/kaola-gitea-workflow-claim.js" sink-fallback \
           --project "$KAOLA_PROJECT"
         node "$scripts_dir/kaola-gitea-workflow-sink-pr.js" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project "$KAOLA_PROJECT"
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
   node "$scripts_dir/kaola-gitea-workflow-sink-merge.js" \
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
  (`tea issue close N`) or resolve the forge fault, then re-run `--sink`.

In either case, the receipt preserves the partial state so `--sink` resumes from the incomplete step
without double-applying completed steps.

**Reconciliation sweep (defense-in-depth):** after a successful sink, run `closure-audit.js` as the
after-the-fact drift detector — it flags a closed issue still carrying `workflow:in-progress`, a
stale roadmap source, or an un-archived merged-PR folder that escaped the inline catch.

```bash
node "$scripts_dir/kaola-gitea-workflow-closure-audit.js"            # dry-run: JSON report (default)
# node "$scripts_dir/kaola-gitea-workflow-closure-audit.js" --execute  # repair safe local drift
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
