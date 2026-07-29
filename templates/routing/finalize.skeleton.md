<!-- SLOT:fz-frontmatter -->
<!-- REGION:skill -->

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
exact plan before running the block so `--plan` is also enforced. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact, not tool unavailability, so record it as what it is.
Re-run the gate if the installed profile set changes.
<!-- /PIN -->
<!-- /REGION -->

<!-- SLOT:fz-h1 -->
<!-- REGION:command -->

Finalization proves the workflow is complete and records final metadata. Do not repair inline (except
the Trivial Inline Edit Exception). Read `kaola-workflow/{project}/workflow-state.md` and
`kaola-workflow/{project}/workflow-plan.md`.
<!-- /REGION -->

## In-progress re-plan control plane

<!-- PIN: replan-finalize -->

This fence outranks every Finalization prerequisite and side effect. Before validation, the
<!-- REGION:command -->
finalize transaction, archive, closure, roadmap, commit, or sink work, read the project state + transaction
status. If either reports `replan_in_progress`, the frozen parent stays authoritative and
Finalization is forbidden; read-only orientation reports `replan_phase`, `transaction_id`,
`parent_plan_hash`, `child_plan_hash` (or `none`), and `last_cas_result`. The single legal mutation
while the fence is active:

```bash
<!-- SPLICE:fz-cmd-001 -->
<!-- /REGION -->
<!-- REGION:skill -->
finalize transaction, archive, closure, roadmap, commit, or sink work, read the project state and transaction
status. If either reports `replan_in_progress`, the frozen parent remains authoritative and
Finalization is forbidden. Read-only orientation reports the exact `replan_phase`,
`transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and `last_cas_result`.

The single legal mutation while the fence is active is:

```bash
<!-- SPLICE:fz-sk-001 -->
if [ ! -f "$REPLAN_SCRIPT" ]; then
<!-- SPLICE:fz-sk-002 -->
fi
<!-- SPLICE:fz-sk-003 -->
<!-- /REGION -->
node "$REPLAN_SCRIPT" resume --project {project} --json
```

<!-- REGION:command -->
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
<!-- /REGION -->
<!-- REGION:skill -->
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
<!-- /REGION -->

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
<!-- REGION:command -->

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
<!-- SPLICE:fz-cmd-002 -->
node "$VALIDATOR" "$PLAN" --resume-check --json; RC=$?
node "$VALIDATOR" "$PLAN" --gate-verify --json; GV=$?
# --barrier-check forwards KAOLA_FINALIZE_BASE (default UNSET → validator's origin/main default) so
# the attribution sweep can scope to a project's own diff on a shared branch; the per-node
# --barrier-check still rejects --base (anti-laundering).
BARRIER_BASE="${KAOLA_FINALIZE_BASE:-}"; BARRIER_BASE_ARG=()
[ -n "$BARRIER_BASE" ] && BARRIER_BASE_ARG=(--base "$BARRIER_BASE")
node "$VALIDATOR" "$PLAN" --barrier-check --json "${BARRIER_BASE_ARG[@]}"; BC=$?
node "$VALIDATOR" "$PLAN" --verdict-check --json; VC=$?
<!-- /REGION -->
<!-- REGION:skill -->

The workflow path is adaptive. Read `workflow_path: adaptive` from
`kaola-workflow/{project}/workflow-state.md` and require a frozen `workflow-plan.md`
(re-check `plan_hash`) whose `## Node Ledger` rows are all `complete` or `n/a`; on corruption
or an incomplete ledger, stop with a **typed refusal** (`Adaptive plan is not complete or its
plan_hash failed. Run /kaola-workflow-plan-run first.`). Read the plan + Node Ledger as the
run's completion record.

The adaptive completion check is **script-enforced**, not prose: run all
four gates and capture each exit code DIRECTLY (never gate on a piped `| tail`, which
reports the tail's exit and masks failure):

```bash
<!-- SPLICE:fz-sk-004 -->
if [ ! -f "$validator_script" ]; then
<!-- SPLICE:fz-sk-005 -->
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
<!-- /REGION -->
if [ "$RC" -ne 0 ] || [ "$GV" -ne 0 ] || [ "$BC" -ne 0 ] || [ "$VC" -ne 0 ]; then
  echo "BLOCKED: adaptive barrier failed (resume=$RC gate=$GV barrier=$BC verdict=$VC) — run /kaola-workflow-plan-run first"; exit 1
fi
```

- `--resume-check` proves `plan_hash` integrity + structure + closed library.
<!-- REGION:command -->
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
<!-- /REGION -->
<!-- REGION:skill -->
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
`adaptive_plan_missing` refusal (there is no sibling verifier to shell and no
N/A pass):

```text
BLOCKED: finalize_gate_unverified (adaptive_plan_missing) — restore the frozen workflow-plan.md before Finalization.
```

### Validation Gate (dual-mode by repo kind)
<!-- /REGION -->

`--finalize-check` auto-detects mode; the attribution sweep runs for both. Never gate on CI. These
typed refusals are classified structurally — do not string-match; the remedy for a stale receipt/hash
is always a full re-run, never a hand-patch.

- **Self-host (npm)** (declares `test:kaola-workflow:*`): machine-gated on a fresh, valid
  `.cache/chain-receipt.json`. The main session runs `kaola-workflow-run-chains.js` after all code +
<!-- REGION:command -->
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
<!-- SPLICE:fz-cmd-003 -->
`finalization-summary.md`:
- **`gaps_unswept`** — a swept reason class with no matching `## Run gaps` entry. For each real defect
  (`in_run_repair`/`deferred_red_chain`/`manual:<slug>`) file a follow-up and record `filed: #N`; for
  non-defects record `noise: <justification>`.
- **`observed_gap_unseeded`** — a hand-typed `## Run gaps` row with no machine-swept entry. Append
  `gap: <class> — <text>` to `.cache/run-gaps-manual.md`, re-run the scanner, then re-run `--check`.

Advisory: export `KAOLA_GOAL` (or set a `goal:` line in `## Meta`) so `goal_check` records `satisfied`.

## Resume Detection

final validation not run → `final-validation`; failed w/ no ledger row → `route-final-fix` (its
durable counterpart is `.cache/final-fixes.json`: an entry there means the fix was already recorded,
so resume at the rerun rather than re-fixing); fixed but
not re-run → `final-validation`; acceptance incomplete → `acceptance-check`; doc gate → `doc-update`;
docking → `doc-docking`; summary missing → `write-summary`; closure gate → `closure-decision`; issue
not updated → `issue-update`; roadmap/archive → `roadmap-archive`; metadata pending →
`final-metadata`; commit missing → `commit-push`; sync missing → `verify-sync`. If ambiguous, stop
and ask.

## Guardrails, Delegation, De-Duplication, Trivial Edit

- Run/delegate the repo-kind-appropriate final validation before claiming completion; do not repair
<!-- SPLICE:fz-cmd-004 -->
  stage unrelated changes; commit only after docs/issue/roadmap/archive/metadata complete; no
<!-- SPLICE:fz-cmd-005 -->
- **Delegation:** the main session may run one small focused command (classify a failure, a quick
  post-trivial-edit check, a short smoke). Delegate expensive/noisy validation (full suites, broad
  lint, long logs, repeated repro) to a fresh validation subagent or a fix agent — `tdd-guide` for
  behavior/regression/coverage/test-defect (it holds custody of the test artifact; no other role may
  write a test path), `build-error-resolver` for build/type/lint/tooling. Which of those you pick, or
  whether you fix it inline instead, is your call: the regulation is at the recording step
  (`final-fix-commit`), never on the mode. Raw output →
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
`step: final-validation`), then run the repo-kind validation from the Validation Gate above, saving
raw output to `kaola-workflow/{project}/.cache/final-validation.md`.

On failure, **repair it however you judge best.** Fix it inline for a trivial correction, or dispatch
it to whichever role fits — `tdd-guide` for a test defect (it holds custody of the test artifact),
`build-error-resolver` for build/type/lint/tooling, the review/security gate for a review finding.
There is no mandated mode, no justifier to write, and no approval attached to that choice. Write fix
output to `.cache/final-validation-fix-{n}.md` and rerun the exact command that failed.

**Step 1b — Record the fix (the ONE commitment point).** A finalize-time fix lands outside every
`complete` node's declared write set, so the attribution sweep in Step 8a will refuse it
`unattributed_change` unless it is recorded. Record each fix into the sink-owned register — one entry
per fix, naming the exact failed command, the fix commit, the touched paths, and the green rerun
receipt bound to the post-fix candidate:

```bash
node scripts/kaola-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --candidate-hash --json
node scripts/kaola-workflow-adaptive-node.js final-fix-commit --project {project} --json --stdin <<'JSON'
{"failed_command":"<the exact command that failed>","fix_commit":"<sha>",
 "files":["<exact repo-relative path>"],
 "rerun":{"command":"<the same exact command>","exit_code":0,"candidate_hash":"<the hash above>"},
 "role":"<who produced the fix, audit-only>"}
JSON
```

This lane records **validation apparatus only** — tests, fixtures, build/tooling glue, allowband
docs: repairing the thing that JUDGES the product does not move the product, so the certification
standing over it still holds and the bound green rerun receipt is the whole oracle. A fix touching
**production behavior** is refused `final_fix_production_surface`, zero-write, and no receipt or
entry field admits it: a behavior change arriving after every reviewer is discharged is a deviation
that is itself evidence — evidence that the standing certification no longer describes the candidate
— so it is reported, never converted into an admission. That refusal is a fork, not a dead end: it
carries the typed exit `shape_refutation`, because if no authority in the frozen plan can certify the
change then the SHAPE is what is refuted, and the re-plan epoch is the way out.

This lane closes at the sink's first irreversible step: once the branch is pushed the record is
immutable history and the verb refuses `final_fix_after_sink_started`. Recovery after that point is a
follow-up issue, never a history rewrite.

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
<!-- SPLICE:fz-cmd-006 -->
`## Status: READY FOR FINAL GIT GATE`.

**Step 6 — Closure Decision Gate.** Scan all node evidence for deferred items, unresolved
conflicts, partial-implementation notes, open review follow-ups, or user-decision items. If none,
record the scan and continue. If any exist, route them to the USER with your recommendation and **ask
before creating/closing/splitting/merging/reorganizing** any issue or roadmap entry.

<!-- SPLICE:fz-cmd-007 -->
it only after acceptance passes and the Closure Decision Gate clears; keep it open if follow-ups /
partial work / unresolved decisions remain; for `issue_action: comment_keep_open` do NOT close — post
the substantive partial-close comment (the mechanical keep-open comment is posted by `sink-merge`).
The actual roadmap closure (rm `.roadmap/issue-N.md` + regenerate `ROADMAP.md`) and archive are done
once by the finalize transaction in Step 8b, which also stages the result — do not rm/generate/`git
mv` here. Update `finalization-summary.md` with the
final issue/roadmap/archive/docking/closure state.

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
<!-- SPLICE:fz-cmd-008 -->
`issue_action: comment_keep_open`.

## Sink Metadata Capture (before the finalize transaction)

Capture now, while `workflow-state.md` still exists — the merge path archives it in Step 8b, and the
transaction re-derives its own copy of every durable field it needs:

```bash
<!-- SPLICE:fz-cmd-009 -->
<!-- SPLICE:fz-cmd-020 -->
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
<!-- SPLICE:fz-cmd-010 -->
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
<!-- SPLICE:fz-cmd-011 -->
if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
  echo "BLOCKED: issue_action: comment_keep_open is only supported on the merge sink." >&2; exit 1
fi
case "$SINK_KIND" in
<!-- SPLICE:fz-cmd-012 -->
    ;;
  merge|*)
<!-- SPLICE:fz-cmd-013 -->
    node "$SINK_MERGE_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project}
    _SINK_MERGE_EXIT=$?
    if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
<!-- SPLICE:fz-cmd-014 -->
      if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
<!-- SPLICE:fz-cmd-015 -->
      fi
      cd "$_MAIN_ROOT"
<!-- SPLICE:fz-cmd-016 -->
      node "$CLAIM_JS" sink-fallback --project {project}
<!-- SPLICE:fz-cmd-017 -->
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
<!-- SPLICE:fz-cmd-018 -->
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
<!-- SPLICE:fz-cmd-019 -->
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
<!-- /REGION -->
<!-- REGION:skill -->
  test-consumed prose/docs land, as the last pre-Finalization action (do NOT delegate — the finalize
  transaction only VERIFIES the receipt). Precedence-ordered refusals: `chains_unverified` (absent), `chains_stale`
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

<!-- SPLICE:fz-sk-006 -->
  Remedy: for each real run-discovered defect (`in_run_repair`,
<!-- SPLICE:fz-sk-007a -->
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
- Do not close issues until every `## Acceptance` item is satisfied.
- Do not archive incomplete workflow folders.
- Do not stage unrelated user changes.
- Commit And Push happens after docs, issues, roadmap, archive, and metadata are complete.
- Repair a failed final validation **however you judge best** — inline for a trivial correction, or
  dispatched to whichever role fits (`tdd-guide` for a test defect, the role that owns the test
  artifact; `build-error-resolver` for build/type/lint/tooling; the review/security gate for a review
  finding). No mandated mode, no justifier, no approval attaches to that choice. Write fix output to
  `.cache/final-validation-fix-{n}.md` and rerun the exact command that failed.
- Then RECORD the fix — the one regulated step: `node scripts/kaola-workflow-adaptive-node.js
  final-fix-commit --project {project} --json --stdin`, one entry per fix (exact failed command, fix
  commit, touched paths, green rerun receipt bound to the post-fix candidate). The finalize
  attribution sweep credits that register as a third source; an unrecorded finalize-time fix refuses
  `unattributed_change`. The register records **validation apparatus only**: a fix touching production
  behavior refuses `final_fix_production_surface` and no receipt admits it — that deviation is itself
  evidence the standing certification no longer describes the candidate, so the refusal routes to
  `shape_refutation` (a re-plan that puts a certifying authority over the work) instead of being
  laundered into an entry. The lane closes at the sink's first irreversible step: once
  the branch is pushed the verb refuses `final_fix_after_sink_started` and recovery is a follow-up
  issue, never a history rewrite.
- A one-line, mechanically obvious inline edit (no behavior/API/security/design judgment) that fixes
  finalization friction, formatting, a typo, or an import stays legal — recorded in
  `finalization-summary.md`, with affected validation rerun. It is **never** an edit to a test file:
  test custody belongs to `tdd-guide`, and no other role may write a test path.

## Required Steps

<!-- SPLICE:fz-sk-009a -->
2. Acceptance check: walk the frozen plan's `## Acceptance` items (`A1:`, `A2:`, …) one at a time and name what satisfies each one — a covering test, a gate receipt, or prose evidence, judged in context (never a mechanical match, never a per-item ledger); an item you cannot satisfy is a blocker, not a footnote. Then verify planned nodes, tests, review status, and absence of debug artifacts. Adaptive's `--verdict-check` barrier (see the Prerequisite gate above) is the sole compliance gate. A plan carrying no `## Acceptance` section (a read-only plan, or one frozen before the section existed) has no items to walk — verify the deliverable against the issue statement instead.
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
   subcommand, adding `--keep-open` (and `--keep-issue-open` to `cmdFinalize` when the field is
   present). It stamps the archived `workflow-state.md` terminal
   (`last_result: closed_keep_open`, `issue_disposition: kept-open`, no active `next_command`),
   PRESERVES `kaola-workflow/.roadmap/issue-N.md`, and regenerates `ROADMAP.md` still listing #N
   (closure invariant `keep-open-roadmap-preserved` enforces it). Never archive by manual
<!-- SPLICE:fz-sk-009b -->
8. Commit and push only approved files.

   ### Staging Guard

   The single-project rule lives INSIDE the finalize transaction, not in this prose: it compares the
   project name as a fixed string (never a regex) and refuses before any side effect with the typed
   `staging_guard_foreign_archive` (a foreign project's `archive/` band is staged) or
   `staging_guard_multi_project` (more than one `kaola-workflow/*/` project is staged). On either,
   unstage the foreign paths — split the commit — and re-run the transaction; it resumes.

   **Before running the finalize transaction**: gate on repo kind:

   - **Self-host (npm)** — the repo's `package.json` declares the `test:kaola-workflow:*`
     scripts: run `kaola-workflow-run-chains.js` (main session, resolved the same way as
<!-- SPLICE:fz-sk-009c -->
     `.cache/chain-receipt.json` — it does not run the chains. `cmdFinalize` (Step 8b) enforces the
     finalize gate fail-closed before the archive rename and returns
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

   The mechanical finalization below — the artifact mirror (with its ledger-regression guard), the
   `cmdFinalize` archive + status close (with `--keep-worktree`, merge path only), the roadmap staging, and
   the `chore: finalize ${KAOLA_PROJECT}` commit gate — is ONE resumable script transaction, not prose and
   not a delegation. Run it yourself and reason over the typed emit: judgment stays with the session,
   atomicity stays with the script. Keep the sink dispatch and issue-close decision here too, and capture
   the sink metadata (`SINK_BRANCH`, `SINK_KIND`, `SINK_ISSUE_FLAG`, `ACTIVE_WORKTREE_PATH`) before the
   transaction archives `workflow-state.md`.

   Preconditions are a CHECKLIST, not a ladder: `finalize --check --json` evaluates EVERY precondition in
   one read-only pass and reports all of them together, so N unmet preconditions come back from ONE
   invocation instead of one refusal per re-run. It emits `{ project, ok, checks, reasons }` (exit 0 when
   `ok`), where `checks` always carries `mirror`, `workflow_state`, `implementation_commit`,
   `staging_guard`, `validation`, and `dirty_paths`, and `reasons` names the most specific token per UNMET
   precondition. It makes zero side effect — clear every reason it lists, then run the transaction once.

   Typed refusals the transaction can return, each with no further side effect:
   `finalize_mirror_refused` with `inner_reason: mirror_sync_failed` (the transaction OWNS the
   worktree→main project-folder sync and could not perform it — make the main checkout writable and
   re-run; never hand-copy a staler main ledger over the worktree), `implementation_commit_missing`
   (implementation-shaped changes are uncommitted and the branch carries no implementation commit — author
   it yourself and re-run; the machinery authors only the finalize bookkeeping commit),
   `staging_guard_foreign_archive` / `staging_guard_multi_project` (split the commit),
   `finalize_gate_unverified` (resolve the inner reason), and `archive_incomplete`. The emitted
   `finalize_transaction` object reports each step (`mirror`, `ledger_compare`, `impl_commit`,
   `roadmap_staged`, `archive_commit`, `finalize_commit`) so a resumed run is readable from the emit alone.

   Crash recovery: the transaction is idempotent and resumes at whichever step it stopped on. A
   `resume --project ${KAOLA_PROJECT} --json` reporting `finalize_incomplete` means the archive exists but
   the finalize commit did not land — re-run the SAME one-call transaction and continue; a resume reporting
   `already_finalized` means the transaction is settled — do not re-run it.

   Warning persistence: `cmdFinalize` appends a `## Attestation` section to the archived
   `finalization-summary.md`, recording the claim/author-seam status plus any non-empty ATTESTATION WARNING
   verbatim — a clean-looking summary must never silently drop a warning that occurred; never remove or
   summarize this section away, and never rewrite a legacy section carrying retired fields.

   **Finalization recovery contract (tribal knowledge).** Three recovery rules are binding,
   not optional lore: (1) **the transaction owns the project-folder sync** — the worktree holds the
   *complete* ledger and the main copy is stale, and repairing that is machinery work, not yours: the
   transaction syncs the worktree project folder up into main itself, then pushes Finalization artifacts
   INTO the worktree, and never overwrites a complete worktree ledger with a staler main copy. Do not
   hand-copy in either direction; a `mirror_sync_failed` refusal means the main checkout is unwritable —
   fix that and re-run; (2) **the machinery never authors the implementation commit** — if it is missing
   at finalize, the transaction surfaces it and stops, and so do you: do not cover for it; (3) **after a
   sink-merge rebase detour, repair the MAIN checkout** named in the failure's `git -C <path>` line, never
   `cd` the deleted worktree, and finish with `--force-with-lease`.

<!-- REGION:github -->

   ### Step 8b - Finalize (Archive + Status Close)
<!-- /REGION -->

<!-- SPLICE:fz-sk-010 -->

<!-- SPLICE:fz-sk-011 -->

<!-- REGION:gitlab,gitea -->
   Capture sink metadata from the active state before archive. Do not read
   `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` again after this point
   on the merge path, because `cmdFinalize` renames it into `archive/`.

<!-- /REGION -->
   ```bash
<!-- SPLICE:fz-sk-012a -->
   if [ ! -f "$claim_script" ]; then
<!-- SPLICE:fz-sk-012b -->
   fi
   SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
<!-- REGION:github -->
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
<!-- /REGION -->
   SINK_KIND=$(awk '/^## Sink/,0' "$SINK_STATE_FILE" | grep '^sink:' | awk '{print $2}')
   SINK_KIND="${SINK_KIND:-merge}"
<!-- REGION:gitlab -->
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_iid:' "$SINK_STATE_FILE" | awk '{print $2}')
   [ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
<!-- /REGION -->
<!-- REGION:gitea -->
   SINK_BRANCH=$(grep '^branch:' "$SINK_STATE_FILE" | awk '{print $2}')
   SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
   [ -z "$SINK_ISSUE" ] && SINK_ISSUE=$(grep '^issue_number:' "$SINK_STATE_FILE" | awk '{print $2}')
<!-- /REGION -->
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
<!-- REGION:github -->
   ```

   If `SINK_KIND` is `merge`, run `cmdFinalize` from the linked worktree after the artifact mirror and before the commit gate:

   **Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/${KAOLA_PROJECT}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares `mainRootFromCoord(getCoordRoot(root))` with `root` (both passed through `fs.realpathSync` to resolve symlinked tmpdirs). If they differ, the main repo's `kaola-workflow/${KAOLA_PROJECT}/` is removed. When `cwd` resolves to the same directory as the git common-dir's parent (typically when `KAOLA_WORKTREE_NATIVE=0`, or when `cmdFinalize` is invoked manually from the main repo), the cleanup is a no-op because main root === caller root.

   ```bash
<!-- /REGION -->
   if [ "$SINK_KIND" = "merge" ]; then
     (cd "$ACTIVE_WORKTREE_PATH" && node "$claim_script" finalize \
       --project "$KAOLA_PROJECT" \
       --keep-worktree $SINK_KEEP_OPEN_FLAG)
   fi
   ```
<!-- REGION:gitlab,gitea -->

   **Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/${KAOLA_PROJECT}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares `mainRootFromCoord(getCoordRoot(root))` with `root` (both passed through `fs.realpathSync` to resolve symlinked tmpdirs). If they differ, the main repo's `kaola-workflow/${KAOLA_PROJECT}/` is removed. When `cwd` resolves to the same directory as the git common-dir's parent (typically when `KAOLA_WORKTREE_NATIVE=0`, or when `cmdFinalize` is invoked manually from the main repo), the cleanup is a no-op because main root === caller root.
<!-- /REGION -->

<!-- SPLICE:fz-sk-013a -->

   `sink-merge` will refuse with exit 1 if `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md` is still present on the branch HEAD when it runs; this is a safety guard that ensures finalize always precedes the merge.

<!-- REGION:github -->
   If `SINK_KIND` is `pr`: skip this step. Proceed to Step 8 (commit). The active folder remains open. `sink-pr.js` (Step 9) writes the PR URL into the active folder. `watch-pr` (on the next `/workflow-next` startup) detects the merged or closed PR and archives the folder automatically.

<!-- /REGION -->
   The commit gate is part of the SAME transaction: it stages this project's
   approved bookkeeping plus the Finalization residue and authors
   `chore: finalize ${KAOLA_PROJECT}` on the workflow branch. It never authors the
   implementation commit, and it never stages another project's workflow state.
   Confirm the emitted `finalize_transaction.finalize_commit` reads `committed` or
   `nothing_to_commit` (the branch already carries the final candidate commit):

   ```bash
   : "${ACTIVE_WORKTREE_PATH:=$(pwd)}"
   git -C "$ACTIVE_WORKTREE_PATH" status --short
   git -C "$ACTIVE_WORKTREE_PATH" log --oneline -2
   ```

   Do not run a sink with uncommitted final changes.

   After the commit gate, dispatch to the correct sink script using the sink
   metadata captured before archive:

   ```bash
   scripts_dir="$(dirname "$claim_script")"
   : "${SINK_BRANCH:?SINK_BRANCH must be captured before archive}"
   : "${SINK_KIND:=merge}"
   : "${SINK_ISSUE_FLAG:=}"
<!-- REGION:gitlab,gitea -->
   : "${SINK_ISSUE_NUMBERS_FLAG:=}"
<!-- /REGION -->
   : "${SINK_KEEP_OPEN_FLAG:=}"
<!-- SPLICE:fz-sk-014 -->
   if [ "$SINK_KIND" != "merge" ] && [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
<!-- SPLICE:fz-sk-015 -->
     exit 1
   fi
   case "$SINK_KIND" in
<!-- SPLICE:fz-sk-016 -->
       ;;
     merge|*)
<!-- SPLICE:fz-sk-017 -->
       _SINK_MERGE_EXIT=$?
       if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
<!-- SPLICE:fz-sk-018 -->
         if [ -n "$SINK_KEEP_OPEN_FLAG" ]; then
<!-- SPLICE:fz-sk-019 -->
           exit 1
         fi
<!-- SPLICE:fz-sk-020 -->
           --project "$KAOLA_PROJECT"
<!-- SPLICE:fz-sk-021 -->
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
<!-- SPLICE:fz-sk-022 -->
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
<!-- SPLICE:fz-sk-023 -->

In either case, the receipt preserves the partial state so `--sink` resumes from the incomplete step
without double-applying completed steps.

**Reconciliation sweep (defense-in-depth):** after a successful sink, run `closure-audit.js` as the
after-the-fact drift detector — it flags a closed issue still carrying `workflow:in-progress`, a
<!-- SPLICE:fz-sk-024 -->

```bash
<!-- SPLICE:fz-sk-025 -->
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
<!-- /REGION -->
