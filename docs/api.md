# API

Document public APIs, endpoints, schemas, events, and integration contracts.

## Startup Classifier and Remote Validation

When the startup (`/workflow-next` → Startup Step 0) or explicit-target claim (`cmdStartup`, `cmdPickNext`) attempts to validate an issue against the remote forge, a network call is made to check issue state and openness. If the forge API call fails outside `KAOLA_WORKFLOW_OFFLINE=1`, the classifier now returns a **typed `target_unavailable` verdict** instead of silently returning `green`. Additionally, when offline with no local evidence for a target, the classifier returns a **typed `target_unverified` verdict**.

### Verdict: `target_unavailable`

- **Returned when**: Remote issue validation fails (GitHub `gh`, GitLab `glab`, or Gitea `tea` CLI call fails) and `KAOLA_WORKFLOW_OFFLINE=1` is NOT set
- **Applies to**: `cmdStartup --target-issue N`, `cmdPickNext`, and parallel-work classifier verdict logic
- **Impact**: Startup refuses to claim the target issue, agent must diagnose the network problem, and retry when the forge is reachable
- **Offline fallback**: When `KAOLA_WORKFLOW_OFFLINE=1`, classification proceeds without remote validation and uses local `.roadmap/issue-N.md` evidence only
- **Helper function**: New `probeIssueState(issueNum, opts)` in `scripts/kaola-workflow-active-folders.js` (all three forge editions) returns `{state, reason}`. `state` is `open`, `closed`, or `unavailable`; claim scripts treat `unavailable` as the typed refusal path outside explicit offline mode.

### Verdict: `target_unverified`

- **Returned when**: `KAOLA_WORKFLOW_OFFLINE=1` AND no local `.roadmap/issue-N.md` exists AND no active folder in the cwd repo for the target issue
- **Applies to**: `cmdStartup --target-issue N` and parallel-work classifier verdict logic
- **Distinct from**: `target_unavailable` (network failure online); `user_target_red` (overlap/risk)
- **Impact**: Startup refuses to claim with this distinct diagnostic; no active folder created; exit code 1
- **Root cause**: Offline operation requires local roadmap evidence or an active folder. When neither exists, the target cannot be verified.
- **Agent remedy**: Run online to validate the target exists on the forge, or create a `.roadmap/issue-N.md` entry offline with explicit scope.

### Bundle claim: `--target-issues` / `KAOLA_TARGET_ISSUES` (issue #328)

The startup/claim path accepts a multi-issue bundle target alongside the existing single-issue `--target-issue N` flag.

**CLI flag:** `--target-issues A,B,C` (comma-separated; sorted and deduped before validation).

**Env var:** `KAOLA_TARGET_ISSUES=A,B,C` — equivalent to the flag; resolved before flag parsing.

**Ambiguity gate (`target_ambiguity`):** If both `--target-issue` (or `KAOLA_TARGET_ISSUE`) and `--target-issues` (or `KAOLA_TARGET_ISSUES`) resolve to non-empty values simultaneously, `cmdStartup` refuses with `target_ambiguity` before any state is written. This gate fires regardless of which combination of flag vs env-var is used.

**Typed refusal codes** returned by `claimExplicitBundle` (all exit non-zero; no mutation on refusal):

| Code | Condition |
|------|-----------|
| `target_ambiguity` | Both scalar and multi-target provided simultaneously |
| `target_set_empty` | Resolved issue list is empty after sort+dedup |
| `target_set_too_large` | Bundle size exceeds `KAOLA_BUNDLE_MAX_ISSUES` (default 4) |
| `target_set_not_adaptive` | Bundle requested but `workflow_path` is not `adaptive` |
| `target_set_conflicts_active_work` | One or more targets overlap an already-claimed active folder |
| `target_set_has_closed_issue` | One or more targets are already closed on the forge |
| `target_set_red` | One or more targets are red per the overlap classifier |
| `target_set_unavailable` | Remote forge validation failed (unreachable; not offline mode) |
| `target_set_unverified` | Offline with no local evidence for one or more targets |
| `target_set_label_rollback_failed` | Claim succeeded but in-progress-label rollback on a partial failure itself failed |
| `target_set_mismatch` | Bundle re-startup — persisted `issue_numbers` does not match the claimed `--target-issues` set (issue #430) |
| `bundle_state_incoherent` | Handoff or orient — `bundle_id` is present in `workflow-state.md` but `issue_numbers` is absent or inconsistent with `bundle_id` (issue #430) |

**All-or-nothing invariant:** `claimExplicitBundle` validates the complete set before mutating any state. If any single issue in the set fails validation the entire bundle is refused and no active folder is created.

**Single-issue path unchanged:** passing `--target-issue N` only (no `--target-issues`) produces byte-identical behavior to prior releases. No `issue_numbers`, `bundle_id`, or `closure_policy` fields appear on single-issue projects.

#### Additive `workflow-state.md` fields on bundle projects

On a successful bundle claim, three additive lines are written alongside the existing `issue_number: <primary>` line in `workflow-state.md`:

```
issue_number: 42
issue_numbers: 42,47,53
bundle_id: bundle-42-47-53
closure_policy: all_or_nothing
```

- `issue_number` — primary issue (first in sorted set); preserved for backward compatibility with all tooling that reads single-issue state.
- `issue_numbers` — full comma-separated sorted set; identifies this as a bundle project.
- `bundle_id` — canonical identifier for the bundle (`bundle-<N1>-<N2>-...`); used as the project folder name and as part of the branch name.
- `closure_policy` — always `all_or_nothing` for v1 bundles.

Single-issue projects retain only `issue_number` (no `issue_numbers`, `bundle_id`, or `closure_policy`). See `docs/workflow-state-contract.md` for the full field contract.

### Cross-project claim-overlap verdicts (`scanClaimedOverlap`)

When a candidate issue is classified, its footprint is compared against every already-claimed active project to avoid two concurrent projects clobbering the same files:

- **red** — an exact-file or coarse-area overlap with a claimed project (or a claimed project still at phase ≤ 2 with no extractable footprint, the conservative backstop). Selecting this target would collide.
- **yellow** — a **curated root-file** overlap (issue #238): both sides name the same root-level CI / supply-chain / manifest / secrets file (`Dockerfile`, `.env`, `package.json`, `requirements.txt`, `pom.xml`, …; the frozen list lives in `kaola-workflow-adaptive-schema.js`). Detected **two-sided** — on the candidate issue body and on the claimed side (structured frozen `## Nodes` write sets *and* phase-3 prose). Slashless root files have no other detector, so the matcher canonicalizes sentence punctuation (a leading `./`, a trailing `.`, collapsed `//`) before exact membership (v3.21.0), and over-asks (yellow) rather than over-blocks when either side names the file only in prose. Yellow is **proceed with caution**, not a block.
- **green** — no overlap; file sets are disjoint on the available evidence.

### Timeout-Bounded Remote Calls (issue #178)

All forge API calls made by `ghExec`, `glabExec`, and `teaExec` subprocess wrappers now respect the `KAOLA_GH_REMOTE_TIMEOUT_MS` environment variable (default 30000ms).

- **Scope**: Issue and PR/MR state checks during `probeIssueState` (active-folder startup validation), closure audit drift detection, and label repairs
- **Default**: 30 seconds (30000ms). Set lower in tests (e.g., 300ms) to simulate hangs
- **Timeout behavior**: When a subprocess call times out (exceeds the configured duration), the calling code receives a timeout error. `probeIssueState` returns `{state: 'unavailable', reason: 'timeout'}`, treated as a transient failure distinct from offline mode
- **Audit operations**: `detectStaleLabels` and `detectUnarchivedPrFolders` / `detectUnarchivedMrFolders` return the sentinel string `'skipped_timeout'` when a remote call times out (parallel to existing `'skipped_offline'` for offline mode)
- **Audit JSON field `unresolved_closed_state`**: When a closure-audit drift check cannot verify whether an issue is closed (remote call times out OR fails — e.g. auth/rate-limit/network error), the issue number is added to `unresolved_closed_state` array in both `drift` and `counts` sections. This field is omitted when empty
- **Label repair**: In `closure-audit --execute`, if a label edit times out mid-loop, the repair loop breaks immediately and sets `labels_skipped_reason: 'timeout'` on the repair record (distinct from `labels_skipped_reason: 'offline'` when `KAOLA_WORKFLOW_OFFLINE=1`). A DETECTION-phase timeout (stale-label detection, not repair) yields `labels_skipped_reason: 'detection_timeout'` (issue #184)
- **Applies to all three forge editions**: GitHub (`gh`), GitLab (`glab`), and Gitea (`tea`)

## Sink API

The Finalization sink is responsible for delivering completed work to the repository and updating GitHub, GitLab, or Gitea metadata.

### Merge Sink

- **Script**: `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea)
- **Invocation**: Called from Finalization Step 9 when `sink: merge` is configured
- **Contract**: Atomic fetch, rebase onto `origin/main`, fast-forward merge with race-condition retry (MAX_AUTOMERGE_RETRIES=3), branch deletion, and issue closure
  - GitHub: uses `gh` CLI
  - GitLab: uses `glab` CLI and GitLab forge API
  - Gitea: uses `tea` CLI
- **Pre-merge guards** (validated before fetch and rebase):
  - **Live workflow-state guard** (`assertNoLiveWorkflowFolder`):
    - All three editions (GitHub, GitLab, Gitea) refuse to merge a branch whose HEAD still contains `kaola-workflow/{project}/workflow-state.md`
    - Uses `git cat-file -e HEAD:{path}` to inspect committed tree state (not just filesystem)
    - Exits 1 with detailed remediation instructions when live folder detected
    - Guards against accidentally merging incomplete workflows that skip finalization
  - **Unpushed-commits guard** (`assertBranchPushedToUpstream`, issue #137):
    - All three editions (GitHub, GitLab, Gitea) block merge if feature branch has unpushed commits ahead of its upstream tracking ref
    - Also blocks when no upstream tracking ref is set (branch not pushed yet)
    - Reports branch name, upstream ref, ahead count, and up to 5 representative commit titles in error message
    - Exits 1 with remediation hint (`git push -u origin <branch>`)
    - Prevents accidental merge of incomplete or out-of-sync branches
    - Skipped when `KAOLA_WORKFLOW_OFFLINE=1`
  - **Workflow-artifacts-only guard** (`assertBranchHasNonWorkflowChanges`, issue #264, AC7):
    - All three editions (GitHub, GitLab, Gitea) refuse to merge a branch whose entire diff vs `origin/main` consists solely of `kaola-workflow/**` workflow artifacts — turning silent implementation loss into a loud, recoverable failure
    - Exits 1 with a list of the workflow-only changed files and a remediation note
    - Skipped when `origin/main` is unresolvable (mirror already up-to-date, no integration base to diff against) — cannot judge, so does not block
- **Exit codes**:
  - `0`: merge succeeded, branch pushed, issue closed (or close failure emits warning but exit code stays 0)
  - `1`: merge failed (non-recoverable; includes pre-merge guard failures: live workflow-state, unpushed commits, or no upstream tracking ref)
  - `2`: fast-forward race condition exhausted after MAX_AUTOMERGE_RETRIES attempts
  - `3`: merge-impossible error (branch protected, non-fast-forward, permission denied); also returned if project archive dir exists during receipt write (root/Codex/GitLab/Gitea guard, issue #216); auto-fallback to PR sink
- **Failure handling** (issue #168):
  - When issue close fails, a stderr warning is emitted (e.g., `sink-merge: WARNING: issue close failed for N; receipt.remote_issue_closed=failed. Manually run: gh issue close N`) instead of silently swallowing the error
  - Exit code remains 0 because the merge itself succeeded; the receipt records `remote_issue_closed: 'failed'` for audit purposes
  - Label removal attempts to proceed even if issue close fails
- **Failure classification** (`classifyMergeError` function):
  - Exported from all three sink-merge modules (GitHub, GitLab, Gitea)
  - Classifies push/merge errors into: `permission_denied`, `branch_protected`, `non_fast_forward`, or `null` (unclassifiable)
  - GitLab and Gitea additionally support forced merge-impossible state via `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` env var (test hook)
- **Offline support**: `KAOLA_WORKFLOW_OFFLINE=1` skips all network calls (applies to all three editions)

### PR Sink

- **Script**: `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea)
- **Invocation**: Called from Finalization Step 9 when `sink: pr` is configured, or auto-fallback from merge sink exit 3
- **Contract**: Push branch, create PR/MR via `gh pr create` (GitHub), `glab mr create` (GitLab), or `tea pr create` (Gitea), record PR URL and number in workflow-state.md `## Sink` block, then create deliberate metadata follow-up commit (`chore: record PR metadata for {project}`) to leave worktree clean
- **Exit codes**:
  - `0`: PR/MR created successfully, metadata commit written, worktree clean
  - `1`: branch push or PR/MR creation failed
- **Metadata commit**: Automatic follow-up commit written by sink script after PR creation; not a user action
- **Offline support**: `KAOLA_WORKFLOW_OFFLINE=1` writes `OFFLINE_PLACEHOLDER` commit instead of real PR/MR metadata; applies to GitHub, GitLab, and Gitea editions
- **Config**: `pr_auto_merge` key in `~/.config/kaola-workflow/config.json` enables auto-merge after PR creation (GitHub + Gitea editions; non-fatal if merge fails). `mr_auto_merge` key enables the same for GitLab edition. Reads config internally; no dispatch changes required.

## Environment Variables

### Timeout Control

- **`KAOLA_GH_REMOTE_TIMEOUT_MS`** (default 30000) — Timeout in milliseconds for all forge API calls made by `ghExec`, `glabExec`, and `teaExec`. Controls how long to wait for GitHub, GitLab, or Gitea API responses during issue state checks, closure audits, and label operations. When a call times out, affected operations return `unavailable` or `skipped_timeout` sentinels instead of failing hard. Set lower in tests to simulate API hangs (e.g., `KAOLA_GH_REMOTE_TIMEOUT_MS=300` to timeout after 300ms). Applies to all three forge editions (GitHub, GitLab, Gitea). Non-numeric, zero, or negative values fall back to the 30000ms default (issue #184). Values above 600000ms (10 minutes) are clamped to 600000ms; this cap prevents excessively large values from silently disabling the hang protection (issue #185).

### Bundle Lane

- **`KAOLA_TARGET_ISSUES`** — Comma-separated list of issue numbers for an explicit bundle claim (e.g. `KAOLA_TARGET_ISSUES=42,47,53`). Equivalent to `--target-issues 42,47,53`. Must not be set together with `KAOLA_TARGET_ISSUE` (triggers `target_ambiguity` refusal). Refused with `target_set_not_adaptive` on fast/full paths. Numbers are sorted and deduped before validation.

- **`KAOLA_BUNDLE_MAX_ISSUES`** (default `4`) — Maximum number of issues allowed in a single bundle. Bundles whose resolved size exceeds this cap are refused with `target_set_too_large`. Applies to both explicit (`--target-issues`) and scout-recommended bundles.

### Worktree Provisioning

- **`KAOLA_WORKTREE_NATIVE`** (ON by default; set to `0` to disable) — By default the claim/startup scripts (all three editions: GitHub, GitLab, Gitea) provision a per-issue repo-local Git worktree at `<repo-root>/.kw/worktrees/<project>/` and record the absolute path as `worktree_path` in the active folder's Sink block. Set `KAOLA_WORKTREE_NATIVE=0` to opt out of worktrees; when opted out and online with git history, the scripts instead create and check out the feature branch in-place in the repo root (see below). Worktree provisioning applies to **all** workflow paths (full, fast, and adaptive); the adaptive path no longer exempts itself (#264).

  **When provisioning is attempted:** Provisioning occurs unless one of the following holds: `KAOLA_WORKTREE_NATIVE=0`, `KAOLA_WORKFLOW_OFFLINE` is `1`, or the repo has no git history (`git rev-parse HEAD` fails). When `KAOLA_WORKTREE_NATIVE=0` (opted out), provisioning is skipped and `worktree_path` is `''`; however, the scripts then take the in-place branch path described below. When offline or no git history, the claim proceeds as a repo-root run with no branch created and `worktree_path` is `''`.

  **NATIVE=0 in-place branch creation (online + git history + HEAD not detached):** When `KAOLA_WORKTREE_NATIVE=0`, online, and the repo has git history, the claim/startup scripts create and check out the feature branch (`workflow/issue-N` on GitHub, `workflow/gitlab-issue-N` on GitLab, `workflow/gitea-issue-N` on Gitea) directly in the repo root — equivalent to `git checkout -b <branch>` (or `git checkout <branch>` if the branch already exists). The pre-checkout branch is recorded as `base_branch` in the `## Sink` block of `workflow-state.md`. On `discard`/`release`, the scripts restore `base_branch` (or the repo default branch when `base_branch` is absent) and delete the created feature branch.

  **NATIVE=0 edge cases:**
  - **Dirty working tree** (NATIVE=0 + online + git history + HEAD on a real branch + uncommitted changes): `claim` returns a typed refusal with `status: dirty_tree_refused` and `claim: 'none'`. No project folder and no branch are created. Commit or stash your changes, or use a worktree (`KAOLA_WORKTREE_NATIVE=1`).
  - **Detached HEAD** (NATIVE=0 + online + git history + HEAD detached): claim still acquires (`status: acquired`), but in-place branch creation is skipped (record-only). No `base_branch` is recorded; a surfaced note (`inPlaceNote`) is included in the returned JSON. Dirty detached HEAD is not refused — it falls through to this record-only path.
  - **Offline or no git history**: in-place branch creation does not fire. Claim proceeds as a plain repo-root run (identical to prior behavior). No note is surfaced.
  - **Re-claim on existing branch** (folder absent, feature branch present, HEAD on feature branch): the branch is checked out (no `-b`), claim acquires, `base_branch` is recorded as `''` (feature branch is its own head — no prior branch to restore).

  **On provisioning failure:** If worktree provisioning is attempted (NATIVE=1, online, git history) but throws, the claim still succeeds (status: `acquired`) and the returned JSON and `workflow-state.md` carry a `worktree_error` field describing the failure. `worktree_path` remains `''`. This is distinct from a deliberate repo-root run: an opted-out / offline / no-history run means `worktree_error` is absent entirely; `worktree_error` present means a real provisioning failure occurred.

  **Known limitation:** The worktree-provision failure path (NATIVE=1 + online + `git worktree add` throws → `worktree_error`) records no in-place branch — the code leaves `base_branch` empty and creates no branch in this case. This is unchanged from before issue #260 and is tracked as a follow-up.

  **Discriminator:**
  - `worktree_path: ''`, no `worktree_error`, no `base_branch` → intentional repo-root run (offline or no git history — provisioning suppressed by policy)
  - `worktree_path: ''`, no `worktree_error`, `base_branch` present → NATIVE=0 in-place branch created; `base_branch` names the branch to restore on discard
  - `worktree_path: ''` and `worktree_error` present → provisioning was attempted (NATIVE=1) and failed

### Test Hooks

The following environment variables are **test-only hooks** used by the test suite to simulate failure scenarios. Do not use in production.

### Sink-Merge Test Hooks

- **`KAOLA_WORKFLOW_FORCE_FF_FAIL=N`** — Fail the first N fast-forward merge attempts in `ffMergeLoop`. Used to test FF race-condition retry logic. Applies to GitHub, GitLab, and Gitea editions.
- **`KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=token`** — Force a merge-impossible error in `postMergeCleanup` by throwing a synthetic error. The token becomes the classification result returned by `classifyMergeError`. Used to test auto-fallback-to-PR behavior. Applies to GitHub, GitLab, and Gitea editions.
- **`KAOLA_WORKFLOW_DEBUG_CWD=path`** — When set, sink-merge writes the final `process.cwd()` to the specified file on exit. Used by test suite to verify CWD restoration after worktree removal. Applies to all three editions.

### Offline and Derivation Test Hooks

- **`KAOLA_WORKFLOW_OFFLINE=1`** — Skip all network calls (GitHub/GitLab/Gitea API, git fetch, git push). Used for local testing without network access. Applies to all three editions (GitHub, GitLab, Gitea).

## Adaptive Refusal / Emit Protocol (issue #355)

The adaptive scripts share a framed-output + refusal contract so a caller can always recover a machine-readable result from a shelled subprocess.

- **Framed output (last-line JSON).** A shelled script's result is the **last line of stdout that parses as JSON** (`safeJsonParse` in `commit-node.js` / `adaptive-node.js` tries the whole payload first, then the last valid JSON line). A stray log/debug/warning line emitted *before* the framed result therefore no longer collapses a success into an empty `{}` (a false refusal). The `shellNode` seam returns `{ ...parsed, exitCode }` with **`exitCode` set LAST** — a payload field named `exitCode` can never clobber the real process exit status.
- **Refusal envelope.** The canonical refusal shape is `{ result: 'refuse', reason, ... }`; callers branch on `result === 'refuse'` and read `reason` (a snake_case token). Per-subcommand payloads may carry **extra** fields (e.g. `nodeId`, `errors`, `status`) — additive, never required. The shared constructors live in `kaola-workflow-adaptive-schema.js` (the ×4 byte-identical anchor): `refuse(reason, extra)` builds the envelope, and `emit(obj)` writes **exactly one compact JSON line** (single-line so the last-line parser always round-trips it; pass `{ stream: process.stderr }` only for genuine out-of-band logs).
- **Refusals go to stdout.** A non-zero exit still carries its reason on **stdout** (not stderr). `kaola-workflow-task-mirror.js` previously printed its refusals on stderr while `shellNode` parsed `err.stdout` only — so the reason was always lost and `refreshTaskMirror` degraded to a bare `'failed'`. Its `missing_arg` / `plan_not_found` / `plan_not_frozen` refusals now emit the envelope on stdout (exit 1 preserved, the legacy `status` key kept for backward compat), and `refreshTaskMirror` surfaces the recovered `reason`.

### Validator subcommand emit/refuse (issue #406 — the #355 follow-up)

The plan-validator's per-subcommand payloads carried a legacy `{ ok:false, … }` shape kept for back-compat. Issue #406 migrates them toward the canonical `{ result, reason/reasonCode, … }` envelope **without** breaking the shells that parse them, in two classes:

- **Class A — dual-emit (gate-verify / verdict-check / resume-check).** `verifyGateExecution`, `verifyVerdictBlock`, and `revalidateForResume` now emit `{ result:'pass'|'refuse', reasonCode:<snake_case> }` **alongside** the established `ok` (and the human `reason` string, which `--resume-check` stderr, `adaptive-handoff`, and `adaptive-node` still echo — the typed token lives in the **new** `reasonCode` field, never by overwriting `reason`). `result` always agrees with `ok`. Every consumer (`commit-node` `gateVerify.ok`/`verdictCheck.ok`, the integrity-gate `resumeCheck.ok` reads across `adaptive-node`/`parallel-batch`/`adaptive-handoff`, and the ~148 walkthrough `.ok` asserts) keeps reading `ok` — these are **dual-emit shims**. **Removal date:** the `ok` shim is removed once #401-P2 lands and all consumers read `result`/`reasonCode` (target: the release after #401-P2).
- **Class C — migrated (`--selector-check` / `--verdict-check` CLI arg-errors).** The standalone-CLI refuse paths now emit `{ result:'refuse', reason, … }` (the success shapes keep `ok:true`, and the fused `--node-end` `selectorCheck` keeps `ok` — `commit-node` reads `fused.selectorCheck.ok===true`). The two walkthrough `scJson.ok===false` asserts flipped to `result==='refuse'` (the only deliberate consumer change).
- **`barrierCheck` typed reason + surfaced arrays (additive).** `barrierCheck` returns a typed `reason` carrying the **highest-precedence** matched failure family, so consumers classify the refusal **structurally** (never English-substring matching `errors`). Precedence and the five codes:

  | precedence | `reason` | fires when | surfaced array |
  |---|---|---|---|
  | 1 | `foreign_archive` | a write into another project's `kaola-workflow/archive/<other>/` band | `foreignArchiveHits` |
  | 2 | `sensitive_write_unreviewed` | a Phase-5 sensitive production write on a plan with no `security-reviewer` node | `sensitiveHits` |
  | 3 | `write_set_overflow` | a production write outside the (per-node OWN / whole-plan union) declared allowlist | `outOfAllow` |
  | 3a | `write_set_granularity` | a **#404** subtype of overflow: every `outOfAllow` file is a strict subtree of one of THIS node's OWN bare directory tokens (`src/` / `src`) — the mechanical granularity artifact; structural literal-string-prefix detection, **no** mutation / re-freeze / auto-repair | `outOfAllow` |
  | 4 | `unattributed_write` | a production write declared only by a non-complete (n/a/pending) node | `unattributed` |

  `reason` is `null` when `result==='pass'`. This is **additive** — no consumer reads `barrierCheck.reason` today; it feeds the plan-run per-class actionable consent-halt messages (the operator is told exactly which family + which files, instead of one opaque ~45-min escalation). `write_set_granularity` is the one shape the freeze wall cannot pre-catch (a bare token that becomes a directory by write-time); the auto-repair lane for it was **proven unbuildable-safe** (freeze is the only legitimacy oracle and cannot re-check a plan it just re-stamped) and is **permanently deferred** (#404 ships as the typed-classification + per-class halts only).

### Validator freeze-chain fusion (`--freeze-checked`, issue #408 — the #366 follow-up)

`adaptive-handoff`'s freeze chain collapsed from **3** validator spawns (validate → freeze → resume-check) to **2** (Option A):

- **`--freeze-checked --json`** (SPAWN 1) — validates and returns the governance payload `{ result:'in-grammar', decision, risk, planHash:<computed>, frozen:false, governance:{decision,risk} }` **WITHOUT** writing (refuse → the same `{ result:'refuse', errors }`). The handoff runs decision-record governance off this payload.
- **`--freeze --governance-ack <planHash> --json`** (SPAWN 2) — re-validates, **asserts the `planHash` from SPAWN 1 still matches** the plan's current hash (the plan was not edited between governance and freeze — else `refuse governance_ack_stale`, **no** write), writes the `plan_hash` atomically (`writeFileAtomicReplace`, #389), and **folds `--resume-check`** into its emission (`{ frozen:true, planHash, resumeOk:true }` — the freeze already computed the hash `--resume-check` would re-verify). Plain `--freeze` (no `--governance-ack`) stays byte-stable (no `resumeOk` field). Option B (in-process import-and-mutate) was rejected — it crosses the "compose, never import-and-mutate" aggregator rule.

### Mutual-exclusion + integrity reason codes (Cluster S — #383/#384/#387/#391/#392)

Every mutating `adaptive-node.js` / `parallel-batch.js` subcommand runs a layered guard prologue **before** its body (zero mutation on refuse), in this fixed order: **(1) integrity** → **(2) consent-halt fence** → **(3) live-coordination mutual exclusion** → **(4) body**. The reason codes:

- **`plan_integrity_failed`** (#387) — the pre-mutation `--resume-check` integrity gate found the frozen plan tampered/invalid (`plan_hash` mismatch, broken graph). Run on `open-ready`, `close-node`, `open-batch`, `top-up` (the serial `open-next`/`close-and-open-next` deliberately do NOT add it — `orient` already runs `--resume-check` on the documented resume path).
- **`halt_pending`** (#391b) — a durable `consent_halt: pending` marker is set in the `## Node Ledger`. Fences `open-next`, `open-ready`, `close-and-open-next`, `close-node`, `open-batch`, `top-up`. Clear it with `clear-halt` (now re-runnable after a crash — #391a widens the gate to also fire on a stranded `escalated_to_full` state marker, and writes state-first/plan-last so a re-run finishes the clear).
- **`serial_node_live`** (#383) — a live serial node (one `in_progress` row, no scheduler/batch) blocks fanning out (`open-ready`, `open-batch`). Carries `{inProgress, runningSet, batchState, repair}`.
- **`scheduler_active`** (#383) — a live `running-set.json` fan-out blocks `open-next`, `open-batch`, `top-up`, `reopen-node`. Carries the same context.
- **`batch_active`** (#383) — a live `active-batch.json` blocks `open-next`, `open-ready`, `reopen-node`. Carries the same context.
- **`evidence_unbound` / `evidence_stale`** (#392) — the close gate (`close-node` / `close-and-open-next`) verifies the evidence's `evidence-binding: <node-id> <nonce>` header against the per-open nonce (the barrier-base SHA prefix surfaced by `open-next`/`open-ready`). A header naming a different node → `evidence_unbound` (copied across nodes); a stale nonce → `evidence_stale` (replayed/copied from a prior open). Absent on disk (no recorded baseline) → the binding check is skipped (backward-compatible).
- **`closed_member_dropped`** (#384) — `reconcile-running-set` gained a CLOSE direction: a ledger-terminal (`complete`/`n.a`) member still in an `open` running set (a crash between `close-node`'s plan write and its set removal) is dropped; `orient` routes that wedge there (`running_set_close_incomplete` + `repair: 'reconcile-running-set'`) instead of looping. Every rollback / close-direction drop also shells `--drop-base` per affected node (#385) so a stale baseline never absorbs foreign writes on re-open.
- **`node_not_in_ledger` — additive `diagnostic` field (issue #425).** When `open-next` (via `spliceLedgerNode` / `readLedgerStatuses`) cannot find an `id` column in the `## Node Ledger` — because the section is present but uses a non-canonical header (e.g. `| node | status |`) — the `node_not_in_ledger` refusal payload now carries an additive `diagnostic` field:
  ```json
  { "result": "refuse", "reason": "node_not_in_ledger", "nodeId": "<id>",
    "diagnostic": { "ledger_present": true, "columns_found": ["node", "status"], "id_column_required": true } }
  ```
  This makes the failure self-diagnosing: the operator is told the ledger section exists but its header lacks the `id` column, and can apply `plan-validator.js <plan> --freeze --repair` to normalize it before re-opening. When the ledger section is entirely absent (a genuinely missing entry), `diagnostic` is omitted and the refusal has its prior shape.
- Non-blocking warnings (informational, do not refuse): **`verdict_unparsed`** (#403.4 — a verdict-bearing role's evidence has a `Verdict:` line the strict column-0 finalize check won't recognize, e.g. a capital key), and **`baselineReused`** (#403.3 — `open-next` surfaces the validator's anti-laundering baseline-reuse decision).
- **Finalize-check typed refusals (#424):** `drop_base_window_open` (`--drop-base` called while a node is `in_progress`); `unattributed_change` (a file in the whole-plan diff is declared only by a non-complete node — attribution sweep); `root_mismatch` (plan-path root does not match the project root).
- **Chain-receipt typed refusals (#432):** `chains_unverified` (no `.cache/chain-receipt.json` exists or is readable); `chains_stale` (the receipt's `headSha` does not match the current `HEAD`); `chains_red` (one or more chains recorded a non-zero exit code in the receipt — use `--accept-known-red name:issue` to register a waiver for a known-red chain with a tracking issue).

### Script: `kaola-workflow-run-chains.js` (issue #432)

Runs all four edition test chains via `spawnSync` with real process exit codes (no shell pipe tricks that mask failures) and produces a machine-verifiable chain receipt.

**CLI:**

```bash
node scripts/kaola-workflow-run-chains.js [--accept-known-red <name>:<issue>] --project <P>
```

`--accept-known-red` may be repeated; each value registers a named chain as waived with a tracking issue reference. The contractor runs this at Finalization Step 8c and cites the receipt path as evidence.

**Output artifact:** `.cache/chain-receipt.json`

**Schema:**

```json
{
  "headSha": "<git HEAD sha>",
  "workTreeHash": "<working-tree hash>",
  "startedAt": "<ISO 8601 timestamp>",
  "chains": [
    { "name": "claude",  "exit": 0 },
    { "name": "codex",   "exit": 0 },
    { "name": "gitlab",  "exit": 0 },
    { "name": "gitea",   "exit": 0 }
  ]
}
```

`exit: 0` means the chain passed; any other value is a failure. The receipt is read by `--finalize-check` to enforce `chains_unverified`, `chains_stale`, and `chains_red` refusals.

### Export: `ROLE_TOKEN_REGISTRY` (issue #433)

Exported from `scripts/kaola-workflow-plan-validator.js`. The single source of truth for the evidence token vocabulary per role — the token shapes that `open-next`/`open-ready` seed into `.cache/<node-id>.md` stubs and that the close gate verifies.

```js
const { ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator');
// ROLE_TOKEN_REGISTRY: { [role: string]: string[] }
// e.g. { 'code-reviewer': ['verdict: pass', 'findings_blocking: 0'], ... }
```

Each entry is an array of token stubs the evidence file must contain (or have filled by the role agent). Consuming scripts (`kaola-workflow-adaptive-node.js`) import this export to seed `.cache/<node-id>.md` at open time and to validate token presence at close time without reimplementing the vocabulary.

## Configuration

Configuration files control workflow behavior and issue sorting.

### Global config

`~/.config/kaola-workflow/config.json` (optional):

```json
{
  "parallel_mode": "auto",
  "pr_auto_merge": false,
  "mr_auto_merge": false,
  "enable_adaptive": false
}
```

- `parallel_mode` — Parallel-work classification strategy (`auto` or other); see README § Classifier configuration
- `pr_auto_merge` — Enable automatic PR merge after creation (GitHub + Gitea editions; squash merge with source branch deletion; non-fatal if merge fails)
- `mr_auto_merge` — Enable automatic MR merge after creation (GitLab edition; equivalent to `glab mr merge --auto-merge`; non-fatal if merge fails)
- `enable_adaptive` — Opt-in switch for the adaptive workflow path (issue #227); default OFF. Written by `install.sh --enable-adaptive=yes` (read-modify-write, preserving `parallel_mode`); overridable per session by the `KAOLA_ENABLE_ADAPTIVE` environment variable (precedence: env > config > OFF). See `docs/workflow-state-contract.md` § Adaptive Path Switch
- `KAOLA_LANE_CONTAINMENT` (#376) — fail-closed env flag (default false; only `1`/`true`/`yes` enables) that arms the write-lane containment PreToolUse hook (`hooks/kaola-workflow-write-lane.sh`). When ON and a `kaola-workflow/<project>/.cache/running-set.json` manifest of open write-nodes exists, the hook DENIES (exit 2) an out-of-lane `Write`/`Edit` — inside a member worktree outside its declared lane, or in the parent worktree matching an open node's lane. Fail-open (exit 0) on a missing flag/manifest, malformed stdin, or non-git cwd; dormant until the #377 scheduler produces the manifest. Successor of the retired #320 `KAOLA_BATCH_CWD_ENFORCED`.

### Agent model manifest (`~/.claude/agents/.kaola-agent-models.json`)

Written by `install.sh` at install time; removed by `uninstall.sh`. Path respects `KAOLA_AGENT_DIR` when set.

```json
{ "<agent-name>": "<model-string>", ... }
```

Maps each installed agent to the model string selected for the active profile (e.g. `"planner": "claude-opus-4-5"`). Read by `resolve-agent-model` with this precedence: **manifest → frontmatter (if not `inherit`) → `DEFAULT_AGENT_MODELS` → `''`**. Ensures dynamically dispatched adaptive nodes resolve to the correct profile-aware model and render the model badge, rather than silently inheriting the orchestrator's model.

### Project-local config

`kaola-workflow/config.json` (optional, checked into repo):

```json
{
  "priority_top_tier_labels": ["hotfix", "critical"]
}
```

- `priority_top_tier_labels` — Array of custom priority labels that sort as tier 1 (high priority) regardless of P-label. Overrides default `["P0", "P1"]` when present. If not an array or missing, falls back to `["P0", "P1"]`. Read by `readPriorityConfig` in `scripts/kaola-workflow-claim.js` at startup to customize issue sort order.

## Roadmap Operations

### Script: `kaola-workflow-roadmap.js`

Manages the local roadmap mirror (`kaola-workflow/ROADMAP.md`) and per-issue metadata files (`kaola-workflow/.roadmap/issue-{N}.md`).

**Subcommands:**

- **`generate`** — Regenerates `ROADMAP.md` from `.roadmap/issue-*.md` sources. Atomic write-replace; no change = no-op. Guards against replacing a non-empty generated ROADMAP when the `.roadmap/` source directory is missing.
- **`validate`** — Asserts `ROADMAP.md` is current with `.roadmap/` sources. Exits 0 if match; exits 1 and prints remediation message if stale.
- **`validate-remote`** — Detects closed-remote drift: iterates `.roadmap/issue-*.md` marked `status: open` and checks if each issue is closed on the remote (via GitHub/GitLab/Gitea APIs). Reports issues that should have been finalized. Exits 0 if no drift; exits 1 with remediation guidance if drift found. Skips all network calls when `KAOLA_WORKFLOW_OFFLINE=1`.
- **`migrate`** — One-time migration: parses the current `ROADMAP.md` table and creates per-issue `.roadmap/issue-{N}.md` files. Skips existing files.
- **`init-issue --issue N [--title ...] [--status ...] [--workflow-project ...] [--next-step ...]`** — Creates a single `.roadmap/issue-{N}.md` entry. Exclusive creation (fails if file already exists).
- **`project-name --issue N`** — Reads the `workflow_project` field from `.roadmap/issue-{N}.md` and outputs it to stdout. Used by claim scripts to resolve project folder names. Exits 1 if field is missing or `"—"`.

**Roadmap Closure Cleanup (Automatic):**

When an active workflow folder is finalized (`cmdFinalize`) or archived after a PR merge (`watch-pr` on MERGED status), the closure process automatically removes the corresponding `.roadmap/issue-{N}.md` file and regenerates `ROADMAP.md`. This ensures the local roadmap never contains stale entries for closed issues. The cleanup is scoped to closed-status archives only; abandoned folders leave the roadmap entry untouched (so the issue can be reopened if needed). When finalizing from a linked worktree, `cmdFinalize` stages only the finalized project's own paths — its `kaola-workflow/archive/<project>/` band, the `kaola-workflow/<project>/`→archive rename (recorded as a `git rm -r --cached` of the live folder plus a `git add` of the archive dest), `kaola-workflow/.roadmap/`, and `kaola-workflow/ROADMAP.md` — rather than a broad `git add -A kaola-workflow/`, so a stray foreign `kaola-workflow/archive/<other>/` is never swept into the finalize commit (issue #261).

`cmdFinalize` accepts `--keep-open` (and `--keep-issue-open`) for a keep-open partial-close run (the Closure Decision Gate kept the issue open). Since issue #336 this is the full script-side keep-open sink lane, not the #333 stamp-only stub: it stamps the archived `workflow-state.md` (`last_result: closed_keep_open`, `issue_disposition: kept-open`, no active `next_command`), records `remote_issue_closed: kept_open` + `roadmap_source_removed: kept` in the receipt, and PRESERVES `kaola-workflow/.roadmap/issue-N.md` (`archiveProjectDir` skips the unlink) while still regenerating `ROADMAP.md` (which keeps listing `#N`). Keep-open is also derivable from the durable `## Sink` field `issue_action: comment_keep_open` (belt-and-suspenders: the flag OR the field triggers it, so a contractor that forgets the flag cannot silently close-mode the run). See the **Keep-open partial-close lane** subsection under § Closure Contract for the full behavior matrix and the merge-sink-only fence.

## Adaptive Plan Validation

### Script: `kaola-workflow-plan-validator.js`

Validates a frozen adaptive `workflow-plan.md` against the closed grammar and computes the auto-run / ask / typed-refusal governance decision (issue #227; see README § Adaptive path). The agent freely authors any in-grammar DAG of role nodes; this script proves the result is in-grammar and classifies its risk. It is **toggle-agnostic** — it never reads the `enable_adaptive` install switch or its `KAOLA_ENABLE_ADAPTIVE` env mirror (the switch gates path *selection* only, never well-formedness or resume). Root and its byte-identical Codex copy share the contract; the GitLab and Gitea editions carry the same contract in a forge-adapted copy.

**Usage:**

```bash
kaola-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze [--repair]] [--resume-check] [--gate-verify] [--record-base --node-id ID] [--barrier-check [--node-id ID] [--base REF]] [--verdict-check [--node-id ID]] [--selector-check --node-id ID]
```

**Modes** (not mutually exclusive — a silent precedence applies when more than one mode flag is given, no error is raised): `--resume-check` takes effect first, then `--freeze`, then `--gate-verify`, then `--record-base`, then `--barrier-check`, then `--selector-check`, then `--verdict-check`, then the default validate (`resume-check > freeze > gate-verify > record-base > barrier-check > selector-check > verdict-check > default`); `--help` / `-h` / no args short-circuit ahead of all of them. `--json` is not a mode — it composes with whichever mode runs.

- **default** — Validate and print the governance verdict. In-grammar prints `in-grammar: auto-run` or `in-grammar: ask — <reasons>`; out of grammar prints `typed refusal (out of grammar): <errors>`.
- **`--freeze`** — Validate, and if in-grammar, compute the `plan_hash` and write it into the plan file as an HTML comment. Prints `frozen (<decision>) plan_hash=<sha256>` on success. After freeze the plan's `## Meta` + `## Nodes` are author-immutable. With **`--repair`** (issue #308), first reconcile the `## Node Ledger` to `## Nodes` — adding a `pending` row for any node present in `## Nodes` but missing from the ledger, **never** dropping or rewriting an existing status — then freeze. The reconcile cannot move `plan_hash` (the hash covers only `## Meta` + `## Nodes`), so a node added to a frozen plan can be re-frozen-with-repair to give it a schedulable ledger row without re-stamping. The JSON output adds `"reconciled": [<ids>]`.
  - **Write-set shape refusals (issue #381, freeze-only; round-2 shapes #388).** `validatePlan`'s per-entry loop refuses two write-set shapes that freeze in-grammar today but are **dead at the exact-path barrier** (`barrierCheck` matches by exact membership, so a directory grant can never match a real file write and would escalate a mechanical authoring artifact to a mid-run consent halt): (i) a **directory-shaped** entry — a token ending in `/` after `classifier.normalizeRepoPath` (`src/`, `./src/`, `src//`) → `node <id> declared_write_set entry "<tok>" is directory-shaped — declare exact file paths`; and (ii) a token containing a **`..`** path segment → `node <id> declared_write_set token "<tok>" contains '..' — declare exact in-repo file paths`. Both are checked **before** the `FILE_CEILING` count. Exact root-level / dot-leading files (`Dockerfile`, `.gitlab-ci.yml`, `.github/workflows/x.yml`) are unaffected (the check keys on a trailing `/` only). This is **freeze-only**: `--resume-check` does **not** apply it, so an in-flight plan frozen by a pre-#381 validator (a then-legal directory entry) still resumes — its barrier failure now classifies as `write_set_granularity` (#404, see the "Validator subcommand emit/refuse" section above) and surfaces a per-class actionable consent-halt ("re-author to the exact files + re-freeze"). (The mid-run **auto-repair** lane — auto-narrowing a directory grant to the enumerated files without a consent halt — was **proven unbuildable-safe and permanently deferred** in #404: `revalidateForResume` only asserts `stored === computePlanHash(content)`, but `freezePlan→injectHash` re-stamps the hash over the just-mutated `## Nodes`, so any post-repair integrity gate validates the mutated plan against its own fresh hash and is always green — freeze is the only legitimacy oracle and cannot check itself. #404 ships the typed `write_set_granularity` classification + per-class halts only; the auto-repair machine is not built.) **Round-2 shapes (#388):** a second pass of freeze-only write-set shape refusals adds checks for additional dead-at-barrier patterns identified after #381.
  - **`ledger_header_invalid` (issue #425, freeze-only).** `validatePlan` refuses when a `## Node Ledger` section is present but its header row does not carry `id` as its first data column (case-insensitive; `| id | status |` is canonical). The refusal names the columns that WERE found: `ledger_header_invalid: found columns [<col>, ...], expected first column "id"`. This is a **freeze wall**: the error fires at `--freeze` (and default `--json` validate) but NOT at `--resume-check`, so a plan frozen by a pre-#425 validator whose ledger uses a non-canonical header still resumes without interruption. **How to fix:** rename the first column to `id` and re-freeze; or use `--freeze --repair` to auto-normalize recognized aliases (`node`, `node_id`, `node-id` → `id`), then re-freeze. `--repair` emits `"header_normalized": true` in its JSON output. Rationale: D-425-01.
  - **`generated_port_split` (issue #431, freeze-only).** `validatePlan` refuses when a node's declared write set contains a canonical script that is a member of `GENERATED_AGGREGATORS` (imported from `scripts/edition-sync.js`, anchor-gated inert when the module is absent) but does NOT also declare all three edition peers (the Codex byte-twin `plugins/kaola-workflow/scripts/<base>` and both forge-named ports) in the SAME node. The refusal names the node and the missing peers: `generated_port_split: node <id> declares "<canonical>" without edition peers <peers> in the same node — declare all four edition files together`. This is a **freeze wall**: the error fires at `--freeze` (and default `--json` validate) but NOT at `--resume-check`. **How to fix:** move the port declarations into the same node as the canonical so all four edition files are co-declared (a single node may declare all four without violating `FILE_CEILING` when counting file entries; the four files count as four). Rationale: D-431-01. **Atomic freeze (#389):** `freezePlan` now writes the `plan_hash` via `writeFileAtomicReplace` (write-to-temp-then-rename), eliminating a torn-plan race where a crash mid-write left `workflow-plan.md` truncated; existing behavior is byte-identical on non-crash paths. **Point-of-use `model_invalid` gate (#390):** the `model_invalid` typed refusal (a non-empty model cell outside the two-tier vocabulary) fires at the point of use in `computeNextAction` (`open-next`/dispatch), not at `--resume-check` — so a hash-stamped or pre-#382 plan that passes `--resume-check` but carries an out-of-vocabulary tier is refused before the node is dispatched (freeze-time still refuses a fresh tier via the #382 wall; #390 additionally refuses a finalize-sink model at freeze for symmetry).
  - **Per-node model tier (issue #382).** `## Nodes` carries an optional **`model`** column with the closed two-tier vocabulary `NODE_MODEL_TIERS = {opus, sonnet}` (defined in `kaola-workflow-adaptive-schema.js`); `—`/absent ⇒ today's role-static resolution (back-compat, hash-stable). The planner assigns the tier per node (it is the only component that sees the task; #44); resolution precedence is **plan beats install** — `next-action.computeNextAction` resolves `node.model || resolveModel(node.role)`, so `--profile=higher` becomes the fallback for unassigned nodes. The tier threads through every dispatch surface (serial `open-next`, the `open-ready` running-set scheduler — whose `running-set.json` members persist `model` for crash/reconcile re-dispatch — and the batch path). **Freeze-time refusals:** a non-empty cell outside the vocabulary → `node <id> model "<tok>" is not a valid tier (model_invalid)`; a `main-session-gate` carrying a model → refusal (it is never dispatched as a subagent). On Claude editions the tier maps to the `Agent(model=…)` param; on Codex the `opus` tier selects the `<role>-max` xhigh effort-variant profile (shipped in #405). `plan_hash` covers `## Meta` + `## Nodes`, so model assignments seal at freeze and survive `--resume-check`.
- **`--resume-check`** — Re-validate **only** closed-library membership, structural grammar, and `plan_hash` integrity — **not** the full gate rubric (re-running it would brick an in-flight plan if the rubric tightened after freeze). Prints `resume ok` or `typed refusal: <reason>`.
- **`--gate-verify`** (issue #231) — Verify gate **execution** over the `## Node Ledger`: a *completed* `code-reviewer` must post-dominate every completed code-producing node (G1), a *completed* `security-reviewer` every completed sensitive node (G2), and (issue #334) a *completed* `main-session-gate` every completed code-producing node when the plan declares one (**G3** — a non-delegable acceptance gate also has no legal `n/a` route, so an `n/a` gate row is an unsatisfied gate outright). A required gate left pending or marked `n/a` while a node it covers is `complete` is an unsatisfied gate. PURE + toggle-agnostic (reads parsed nodes + ledger only). Prints `gate execution verified` or `typed refusal: <unsatisfied>`. Surfaced non-blocking by `routeAdaptive` (as `pendingGates`) and enforced as a hard merge gate in Finalization.
- **`--record-base --node-id ID`** (issue #239) — Snapshot the **full worktree** (tracked + untracked, honoring `.gitignore`) as node `ID`'s per-instance baseline at node start, via a throwaway index (`git add -A` into a temp `GIT_INDEX_FILE` outside the repo → `git write-tree`), and store the tree SHA in `.cache/barrier-base-<id>`. **Idempotent**: if a baseline already exists for the node it is *reused* (`reused: true`), so a crash + re-dispatch or a consent-halt re-entry never re-snapshots a now-dirty tree and launders the crashed attempt's writes. Refuses without `--node-id`. Prints `recorded base <tree> for node <id>` / `reused base …`.
- **`--barrier-check [--node-id ID] [--base REF]`** (issue #231; per-node tree-diff #239) — Re-scan the files actually written and refuse on (a) a Phase-5 **sensitive** actual write when the plan has no `security-reviewer` node (closes H1), (b) an out-of-**allowlist** production write — a non-docs, non-test, non-`kaola-workflow/` write not in the allowlist (closes H3), or (c) a **foreign-project archive** write — an actual write under `kaola-workflow/archive/<X>/` whose `<X>` is neither the finalized project nor its `<project>.archived-<ts>` collision-rename (issue #261). Fix (c) scopes the otherwise-blanket `kaola-workflow/` artifact exemption so a stray cross-issue `archive/<other>/` folder cannot reach a protected branch undetected; the finalized project is `opts.project`, threaded from the validator's `projTag` (the basename of the directory holding `workflow-plan.md`), and the check is fail-closed (absent project ⇒ any archive write is treated as foreign). Two modes:
  - **Whole-plan** (no `--node-id`, the Finalization merge gate): `git diff --name-only` vs the merge-base of `HEAD` and `--base` (default `origin/main`; cumulative, so committed sensitive writes are not invisible), allowlist = the **union** of all declared write sets, plus the v3.20.1 ledger-consistency floor.
  - **Per-node** (`--node-id ID`): tree-diff (`git diff-tree`) the current full-worktree snapshot against the node's **recorded node-start snapshot** (`--record-base`), so it attributes **exactly this node's own changes** — new / modified / deleted, tracked or untracked — without over-attributing prior nodes' still-uncommitted source or pre-existing strays, and checks them against the node's **own** declared write set. `--base` is **rejected** here (the baseline is the recorded snapshot; honoring `--base HEAD` after a commit would empty the diff and neuter the gate); fail-closed if no base was recorded.

  PURE core (`barrierCheck(content, actualPaths, opts)`); only the CLI shells out to git, failing closed (typed refusal) on any git error. Prints `barrier ok` or `typed refusal: <errors>`.
- **`--verdict-check [--node-id ID]`** (issue #251) — Verify that every completed gate-role node's `.cache` evidence file carries `verdict: pass` and `findings_blocking: 0`. The gate-role set is `code-reviewer`, `security-reviewer`, `adversarial-verifier`, and (issue #334) `main-session-gate`. Exit 1 on any failure. Per-node (`--node-id ID`): checks one node; non-gate roles self-skip (exit 0, `ok: true`). Whole-plan (no `--node-id`): checks all completed gate-role nodes in the ledger; an `adversarial-verifier` fan-out applies majority-refute over sibling per-instance `.cache/adversarial-verifier-*.md` files. PURE + toggle-agnostic. Wired informational per-node in `kaola-workflow-commit-node.js` and enforced as a hard merge gate in Finalization. Prints `verdict ok` or `typed refusal: verdict-check failed`.
- **`--selector-check --node-id ID`** (issue #263) — Check which `select` arm the `selector_source` node chose and compute which arms to mark `n/a`. Requires `--node-id`. Non-selector nodes (not a `selector_source` of any group) return `{ ok: true, isSelector: false, armsToNa: [] }` and exit 0 — never false-blocks. A `selector_source` node with a missing or foreign `selector: <arm-id>` value in its `.cache/<id>.md` evidence returns `{ ok: false, isSelector: true, errors: [...] }` and exits 1 (fail-closed, blocking the commit). Success: `{ ok: true, isSelector: true, selected: "<arm-id>", group: "<group>", armsToNa: ["<arm-id>", ...] }`. The caller (contractor) transcribes `armsToNa` into `n/a` ledger rows; `next-action.js` treats `n/a` arms as terminal so only the selected arm becomes ready. Wired BLOCKING per-node in `kaola-workflow-commit-node.js`.
- **`--json`** — Emit the machine-readable result object (below) instead of the human line; composes with any mode.
- **`--help` / `-h` / no args** — Print usage and exit 0.

**Exit codes:** `0` on success (in-grammar auto-run/ask, frozen, resume ok); `1` on any typed refusal (out-of-grammar plan, unreadable plan path, `--freeze` of an out-of-grammar plan, failed `--resume-check`) and on an uncaught error.

**JSON result shapes** (`--json`):

- Default validate, in-grammar:
  ```json
  {
    "result": "in-grammar",
    "decision": "auto-run",
    "planHash": "<sha256>",
    "sink": "<node-id>",
    "risk": { "sensitivity": false, "blastRadius": false, "uncertain": false, "reasons": [] },
    "nodeCount": 4
  }
  ```
- Refusals come in three shapes depending on where validation fails:
  - **Unreadable plan path**: `{ "result": "refuse", "errors": ["cannot read plan: <path>"] }` — no `planHash`, no `sink`.
  - **No parseable `## Nodes` table** (early return before a sink can be computed): `{ "result": "refuse", "errors": ["plan has no parseable ## Nodes table"], "planHash": "<sha256>" }` — `planHash` present, `sink` omitted.
  - **Grammar / gate refusal** (library, structure, caps, disjointness, or a post-dominance gate failed): `{ "result": "refuse", "errors": ["..."], "planHash": "<sha256>", "sink": "<node-id>|null" }` — both present (`sink` is `null` when there is no unique `finalize` terminal).
- `--freeze`: `{ "result", "decision", "planHash", "frozen": true|false, "risk", "errors" }` — sync-group gap, **agent-registration gap (#340)**, and **forge-port ordering gap (#340)** refusals (see Grammar above) are among the typed refusals that prevent `frozen:true`; these checks also run on the default `--json` validate but not on `--resume-check`, `--gate-verify`, `--barrier-check`, or `--verdict-check`.
- `--resume-check`: `{ "ok": true, "planHash": "<sha256>" }` or `{ "ok": false, "reason": "..." }`
- `--gate-verify`: `{ "ok": true, "unsatisfied": [] }` or `{ "ok": false, "unsatisfied": [{ "requirement": "G1 gate execution", "reason": "..." }] }`
- `--record-base`: `{ "result": "ok", "nodeId": "<id>", "base": "<tree-sha>" }` (fresh) or `{ ..., "reused": true }` (idempotent re-entry); `{ "result": "refuse", "errors": ["--record-base requires --node-id <id>"] }` without a node id.
- `--barrier-check`: `{ "result": "pass"|"refuse", "errors": ["..."], "sensitiveHits": ["..."], "outOfAllow": ["..."] }` — a foreign-project archive refusal (#261) surfaces as an `errors` entry naming the offending `kaola-workflow/archive/<other>/` path(s); the object shape is unchanged. (Per-node mode additionally refuses `--base is not allowed with --node-id` and `no recorded per-node base for "<id>"`.)
- `--verdict-check`: per-node non-gate-role self-skip: `{ "ok": true, "nodeId": "<id>", "role": "<role>", "verdict": null, "findings_blocking": null, "found": false }`; per-node gate pass: `{ "ok": true, "nodeId": "<id>", "role": "<role>", "verdict": "pass", "findings_blocking": 0, "found": true }`; per-node gate fail: `{ "ok": false, "nodeId": "<id>", "role": "<role>", "verdict": "fail"|null, "findings_blocking": N|null, "found": bool, "reason": "..." }`; whole-plan: `{ "ok": bool, "failures": [...], "checked": ["<node-id>", ...] }`.
- `--selector-check`: three shapes depending on outcome:
  - Non-selector node: `{ "ok": true, "isSelector": false, "armsToNa": [] }`
  - Selector with missing/foreign value (exit 1): `{ "ok": false, "isSelector": true, "errors": ["selector_source \"<id>\" produced no selector: line"] }`
  - Selector with valid selected arm: `{ "ok": true, "isSelector": true, "selected": "<arm-id>", "group": "<group>", "armsToNa": ["<arm-id>", ...] }`

**Grammar (out of grammar ⇒ typed refusal):** every role drawn from the runtime-closed installed library (the eleven canonical roles — including `implementer`, which is an IMPLEMENT_ROLES member requiring `code-reviewer` post-dominance (G1) like `tdd-guide`, but for changes with no natural failing-unit-test — unioned with any maintainer-added `agents/*.md`); a single unique `finalize` sink; an acyclic DAG; exactly four node shapes — `sequence`, `fanout(<group>)` (homogeneous role, width ≤ `FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`), write-role members pairwise-disjoint), `loop(<cap>)` (cap ≤ `LOOP_CAP` = 5), and `select(<group>)` (issue #263: Classify-And-Act arm — see G-SEL rules below); read-only roles declare no write set; ≤ `FILE_CEILING` (6) files per node; and the computed **post-dominance** gates — **G1** `code-reviewer` post-dominates every code-producing node (implement roles, plus any write role writing a non-docs file), **G2** `security-reviewer` post-dominates every sensitive node, and (issue #334, active only when present) **G3** a non-delegable `main-session-gate` post-dominates every code-producing node. Post-dominance is computed as reachability-after-gate-removal over the unique sink. **Non-delegable main-session gate (`main-session-gate`, #334):** a *built-in role token* (like the `finalize` sink — no `agents/*.md` profile, never dispatched as a subagent; the main session itself performs the acceptance check, e.g. a GPU/visual confirmation or human sign-off, and records `verdict: pass|fail` into `.cache/{id}.md`). It is read-only (declares no write set), shape `sequence` only (never a fan-out member, loop, or select arm — refused otherwise), a `GATE_VERDICT_ROLES` member (so `--verdict-check` requires its verdict and G-SEL-2 forbids it as a select arm), and excluded from parallel-batch membership. G3 (freeze) plus its runtime `--gate-verify` check (no legal `n/a` route) make finalization provably impossible until the gate is complete with a passing verdict. The `## Nodes` `cardinality` column is **reserved/advisory** — parsed but neither validated nor used by the grammar or the gates (fan-out width is the count of nodes sharing a `fanout(<group>)` token; the loop bound is the `loop(<cap>)` cap), yet its text still contributes to `plan_hash` as part of `## Nodes`, so it must be present and stable. **G-SEL rules (Classify-And-Act, #263):** G-SEL-1: a select group needs ≥ 2 arms; all arms must name the same `selector_source` (which must exist in the plan, be read-only, and be listed in every arm's `depends_on`); every arm in a `select(<group>)` group MUST carry a non-empty `selector_source` value — a blank arm is a typed refusal: `G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared` (issue #268; additive — no existing gate is relaxed); additionally, group names are a **global namespace** — if a name is shared by arms whose `selector_source` nodes differ, the validator emits a typed refusal: `G-SEL-1: select group name "<name>" used by arms with different selector_source nodes; use distinct group names for independent groups` (issue #271; additive — no existing gate is relaxed). Authoring rule: independent select groups MUST use distinct group names. G-SEL-2: gate roles (`code-reviewer`, `security-reviewer`, `adversarial-verifier`) cannot be select arms. G-SEL-3: no-op by design (G1/G2 post-dominance already applies to all nodes including arms). G-SEL-4: arm write sets must be pairwise disjoint-or-identical. **Sync-group gap (#274):** if any node's `declared_write_set` contains one half of a byte-identical sync pair — a `COMMON_SCRIPTS` member's `scripts/` ↔ `plugins/kaola-workflow/scripts/` mirror, or any member of a `BYTE_IDENTICAL_GROUPS` entry — without the peer(s) appearing in *some* node's write set, the validator emits a typed refusal: `sync-group gap: node <id> declares "<path>" without its byte-identical peer "<peer path>" (#274)` (group form appends the group label). The sync sets are read from `validate-script-sync.js`'s exported `COMMON_SCRIPTS`/`BYTE_IDENTICAL_GROUPS` and are a graceful no-op when that module is absent (Codex/GitLab/Gitea copies, installed user projects). **Agent-registration gap (#340):** when the **union** of all nodes' write sets adds a new agent profile (`agents/<name>.md` or a plugin `agents/<name>.toml` that does not yet exist on disk) but omits any path in that agent's 22-path *registration surface* — the three sibling edition profiles, the three `config/agents.toml` codex-dispatch templates, `validate-vendored-agents.js`, `install.sh`/`uninstall.sh` `REQUIRED_AGENTS`, `resolve-agent-model.js` (×4), the plan-validator `CANONICAL_ROLES` (×4), the gitlab/gitea contract-validator agent counts, and the two forge `test-*-workflow-scripts.js` counts — the validator emits a typed refusal: `agent-registration gap: plan adds new agent "<name>" but no node declares "<req>" — an agent-set delta must carry its full registration surface (#340)`. These registries are exact-match (keyed on no symbol of the new file), so #306 symbol-grep cannot find them. The check is **anchor-gated** to the Kaola-Workflow repo itself (inert unless `<root>/scripts/validate-vendored-agents.js` exists), uses the **union** across nodes (the 22-path surface cannot fit `FILE_CEILING`=6 in one node), and fires on additions only — a role *removal* is indistinguishable from an edit in a declared write set (covered by the planner prose checklist + the derived parity guards in the contract validators). **Forge-port ordering gap (#340):** a node whose write set contains a gitlab/gitea **edition-named port** of a root script (`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-<x>.js` ↦ `scripts/kaola-workflow-<x>.js`) must be a **transitive descendant** of every *other* node that writes that root script — the canonical mirror spec is the full accumulated root diff, which only exists after all root edits land. Same-node root+port co-writes (atomic mirror) and a port with no root-writing node in the plan (forge-only fix) are allowed; otherwise the validator refuses: `forge-port ordering gap: node <id> writes port "<p>" but node <other> writes its root source "<rootSrc>" and is not upstream of <id> — order forge-port mirror nodes after ALL root edits and mirror the full accumulated root diff (#340)`.

**Governance (in-grammar plans only):** `decision = ask` when risky, else `auto-run` — over-approximated and fail-closed (uncertain ⇒ risky). Risk is any **sensitivity** (frozen `## Meta` labels in a Phase-5 category, or a declared write set matching the auth / payments / user-data / filesystem / external-API / secrets patterns), any **blast-radius** (write-role fan-out N ≥ 2, a `SHARED_INFRA` touch, or a bounded loop), or **uncertainty** (frozen labels absent). An `auto-run` authorization is provisional and revocable at the per-node barrier, which is now **script-enforced** (issue #231): `--gate-verify` proves the required reviewers actually executed over the `## Node Ledger`, `--verdict-check` (#251) proves those reviewers actually *approved* (a parseable `verdict: pass` / `findings_blocking: 0`, majority-refute over an `adversarial-verifier` fan-out, fail-closed and blocking at the Finalization merge gate), and `--barrier-check` re-scans the files actually written and refuses a surprise sensitive or out-of-allowlist write. The static `auto-run` verdict is no longer the entire enforceable authorization boundary.

**`plan_hash`:** SHA-256 over the whitespace-normalized author-immutable `## Meta` (frozen `labels:`) + `## Nodes` sections; the mutable `## Node Ledger` and the hash comment itself are excluded. Stored inside `workflow-plan.md` as `<!-- plan_hash: <64-hex> -->` and re-checked on every load — a mismatch is tampering and yields a typed refusal on `--resume-check`. The full `workflow-plan.md` artifact contract (`## Meta`, the `## Nodes` table schema, and the `## Node Ledger`) is documented in `docs/workflow-state-contract.md`. A barrier consent-halt is durable in BOTH `workflow-state.md` (`escalated_to_full: consent`) and the non-hashed `## Node Ledger` (`consent_halt: pending`, issue #234), so a lost/regenerated `workflow-state.md` cannot silently drop the halt.

**Authoring-entry guard (`kaola-workflow-claim.js authoring-allowed`, issue #235):** the only switch-reading guard besides `claimProject` selection. `/kaola-workflow-adapt` runs `node kaola-workflow-claim.js authoring-allowed --project <p>` BEFORE authoring/freezing a plan; it returns `{ "status": "authoring_allowed", "allowed": true }` when the `enable_adaptive` switch is ON, else a typed `{ "status": "authoring_refused", "allowed": false, "reasoning": "...OFF...#44" }` (exit 0; the caller branches on `status`). The validator stays toggle-agnostic — the switch is read only here and in `claimProject`.

## Forge Contract Validators (issue #341)

`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and its gitea
twin enforce forge-neutrality (`assertNoForbidden`) across every plugin command/skill/hook/agent/
config file, scanning **before** any file-count assertion so a forge-CLI leak (`gh`/`glab`, a forge
brand, a forge request noun) is never masked by a transiently-stale agent/command/skill count (the
#328 latent defect). Each validator also exposes a standalone, count-independent mode for a
forge-touching adaptive node to verify just its own changed files:

```
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <file> [<file> ...]
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js  --forbidden-only <file> [<file> ...]
```

- **Path resolution:** each `<file>` is repo-root-relative or absolute. The root is anchored via
  `__dirname` (three levels up from the script), so the check resolves correctly from any cwd —
  including a `.kw/worktrees/<project>/` worktree running its own copy of the validator. Absolute
  paths are normalized with `path.relative(root, file)`, so out-of-tree fixture files resolve too.
- **Exit codes:** `0` on a clean scan (stdout sentinel `… forbidden-only check passed (<n> file(s))`);
  `1` when a forbidden token is found (uncaught `assert`, message
  `<file> contains forbidden reference: <regex>` — identical failure shape to the full chain); `2`
  on a usage error (no files after `--forbidden-only`) or an unknown flag (fail closed, so a typo can
  never silently degrade into running the full chain).
- **Zero args preserves the full contract chain:** the `package.json` chains invoke each validator
  with no arguments, which runs the complete per-edition validation exactly as before.

## Adaptive Executor Aggregators (issue #242 Part B, wired in Stage C)

These two scripts form the atomicity interface for the adaptive executor. They are wired into the per-node loop of `kaola-workflow-plan-run`, **run by the `contractor`** (v5.0.0 intent realignment — the main session is not exposed to the loop scripts; v4.1.0's "aggregator-direct" wiring was reversed): the contractor runs `kaola-workflow-next-action.js` for the ready set and `kaola-workflow-commit-node.js --node-id X --start` / `--node-id X` for the per-node *advance* and *commit* brackets, returning the ready set + barrier exit code to the Opus main session, which dispatches the role and owns the consent-halt decision. The aggregator's **whole-plan** mode (no `--node-id`) is exercised by unit tests only; Finalization runs its merge gate by calling the plan-validator directly (this preserves the `--resume-check`/`plan_hash` integrity check that the whole-plan barrier does not run), not via the aggregator. Both ship in all four editions (canonical `scripts/`, Codex copy, and forge-named GitLab/Gitea ports); all are registered in `validate-script-sync.js` and the three `install.sh` SUPPORT_SCRIPT_NAMES blocks.

### Script: `kaola-workflow-next-action.js`

Computes the ready-set, next node, and resolved model for the adaptive executor from a frozen `workflow-plan.md`. Implemented over the plan-validator's exported `parseNodes`/`parseLedger` (no reimplementation); model resolution via `resolveAgentModel`.

**Usage:**

```bash
node scripts/kaola-workflow-next-action.js <plan-path> --json
```

**Behavior:**

- Parses `## Nodes` and `## Node Ledger` from the plan file.
- Validates every ledger status present is in the `LEDGER_STATUSES` enum; absent nodes default to `pending`.
- Computes the ready-set in document order: a node is ready iff its own status is not in `{complete, n/a}` and every `depends_on` entry has status in `{complete, n/a}` (n/a-aware predicate).
- `allDone:true` (empty ready-set, all nodes terminal) is the Finalization handoff signal — `result:'ok'`, exit 0.
- Empty ready-set while at least one node is non-terminal = stalled DAG — `result:'refuse'`, exit 1.
- Always emits JSON to stdout. The `--json` flag is conventional (matches usage text) but output is always JSON.

**Exit codes:**

- `0` — `result:'ok'` (ready-set computed, or `allDone:true`).
- `1` — `result:'refuse'` (unreadable plan, no parseable `## Nodes`, out-of-enum ledger status, or stalled DAG).

**JSON result shapes:**

- Success:
  ```json
  {
    "result": "ok",
    "readySet": [
      {
        "id": "node-id",
        "role": "code-writer",
        "dependsOn": ["prev-node"],
        "model": "claude-sonnet-4-5",
        "declared_write_set": "scripts/foo.js",
        "shape": "sequence"
      }
    ],
    "nextNode": { "id": "node-id", "role": "code-writer", "dependsOn": [...], "model": "...", "declared_write_set": "...", "shape": "..." },
    "allDone": false
  }
  ```
  When all nodes are terminal: `readySet:[]`, `nextNode:null`, `allDone:true`.

- Refuse:
  ```json
  { "result": "refuse", "errors": ["cannot read plan: <path>"] }
  ```
  Other refuse messages: `"plan has no parseable ## Nodes table"`, `"node <id> has out-of-enum ledger status \"<st>\""`, `"plan is stalled: no ready nodes and not all nodes are terminal (deadlock or corrupt ledger)"`.

**`readySet` item fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Node ID from `## Nodes` table |
| `role` | string | Role name (e.g. `code-writer`) |
| `dependsOn` | string[] | Upstream node IDs |
| `model` | string | Resolved model string via `resolveAgentModel` |
| `declared_write_set` | string | Raw write-set text from the node row |
| `shape` | string | Node shape kind (`sequence`, `fanout`, `loop`, or `select`) |

---

### Script: `kaola-workflow-commit-node.js`

Composes per-node and whole-plan barrier choreography into one auditable call by shelling the plan-validator subcommands. Does **not** mutate the ledger or `workflow-state.md`.

**Usage:**

```bash
# Per-node start — record baseline (idempotent)
node scripts/kaola-workflow-commit-node.js <plan-path> --node-id <id> --start --json

# Per-node end — barrier-check (blocking) + gate-verify (informational)
node scripts/kaola-workflow-commit-node.js <plan-path> --node-id <id> --json

# Whole-plan — barrier-check + gate-verify (both blocking, Finalization merge gate)
node scripts/kaola-workflow-commit-node.js <plan-path> --json
```

**Modes:**

| Flags | Mode | What runs | `overallOk` depends on |
|-------|------|-----------|------------------------|
| `--node-id ID --start` | `per-node-start` | `--record-base` only (idempotent) | record-base `result:'ok'` |
| `--node-id ID` | `per-node` | `--barrier-check --node-id ID` (blocking) + `--selector-check --node-id ID` (blocking) + `--gate-verify` (informational) + `--verdict-check --node-id ID` (informational) | barrier pass AND selector pass |
| *(no `--node-id`)* | `whole-plan` | `--barrier-check` (blocking) + `--gate-verify` (blocking) | barrier pass AND gate-verify ok |

**Safety invariants:**

- Record-base runs only at node START. Running it at end-time would equal the post-write tree and neuter the barrier.
- Fails closed: a missing per-node baseline causes the validator to refuse, never a fabricated pass.
- Per-node gate-verify and verdict-check are informational (`informational:true` on the field), excluded from `overallOk`, because the downstream reviewer is still pending when a node commits. Whole-plan gate-verify is blocking.
- Per-node selector-check is **blocking** (`overallOk = barrierPass && selectorPass`). A non-selector node always returns `isSelector:false` and never blocks; null `selectorCheck` (no `--node-id` given) is treated as a pass (backward-compatible).

**Exit codes:**

- `0` — `overallOk:true`.
- `1` — `overallOk:false`, or early-refuse on invalid flags.

**JSON output schema:**

```json
{
  "result": "ok" | "refuse",
  "mode": "per-node-start" | "per-node" | "whole-plan" | null,
  "nodeId": "string" | null,
  "recordBase": { "exitCode": 0, "result": "ok", "nodeId": "...", "base": "<tree-sha>" } | null,
  "barrierCheck": { "exitCode": 0, "result": "pass"|"refuse", "reason": null|"foreign_archive"|"sensitive_write_unreviewed"|"write_set_overflow"|"write_set_granularity"|"unattributed_write", "errors": [], "sensitiveHits": [], "outOfAllow": [], "foreignArchiveHits": [], "unattributed": [] } | null,
  "gateVerify": { "exitCode": 0, "ok": true, "result": "pass"|"refuse", "reasonCode": null|"gate_unsatisfied"|"...", "unsatisfied": [] } | null,
  "verdictCheck": { "exitCode": 0, "ok": true, "result": "pass"|"refuse", "reasonCode": null|"verdict_not_pass"|"...", "nodeId": "...", "role": "...", "verdict": "pass"|null, "findings_blocking": 0|null, "found": true|false } | null,
  "selectorCheck": { "exitCode": 0, "ok": true, "isSelector": false, "armsToNa": [] } | null,
  "overallOk": true | false
}
```

- `recordBase` is populated only in `per-node-start` mode; `null` otherwise.
- `barrierCheck` is populated in `per-node` and `whole-plan` modes; `null` in `per-node-start`.
- `gateVerify` is populated in `per-node` mode (tagged `informational:true`) and `whole-plan` mode; `null` in `per-node-start`.
- `verdictCheck` is populated in `per-node` mode (tagged `informational:true`) and `whole-plan` mode; `null` in `per-node-start`.
- `selectorCheck` is populated in `per-node` mode (blocking); `null` in `per-node-start` and `whole-plan`. When the node is a `selector_source`, `selectorCheck.isSelector` is `true` and `selectorCheck.armsToNa` lists the arms the contractor marks `n/a`.
- In per-node mode, `gateVerify` and `verdictCheck` carry `"informational": true` — this field signals the caller not to gate on the result.
- Early-refuse shapes (invalid flags, no shelling occurs):
  ```json
  {
    "result": "refuse", "mode": null, "nodeId": null,
    "recordBase": null, "barrierCheck": null, "gateVerify": null,
    "overallOk": false,
    "errors": ["--start requires --node-id"]
  }
  ```
  Also: `"errors": ["--node-id requires a value"]` when `--node-id` flag is present but value is missing or starts with `--`.

## Selector routing — orchestrator contract

When a `selector_source` node completes, the contractor reads `selectorCheck` from the per-node `commit-node --json` output and routes unselected arms before the fused advance.

### Fields (per-node mode only; `null` in `per-node-start` and `whole-plan`)

```json
// non-selector node
{ "ok": true, "isSelector": false, "armsToNa": [] }

// selector — valid selected arm (exit 0)
{ "ok": true, "isSelector": true, "selected": "arm-b", "group": "impl", "armsToNa": ["arm-a", "arm-c"] }

// selector — missing or foreign value (exit 1, fail-closed)
{ "ok": false, "isSelector": true, "errors": ["selector_source \"decide\" produced no selector: line"] }
```

### Contractor protocol

1. **`selectorCheck.isSelector === false`** — non-selector node; skip this section entirely.
2. **`selectorCheck.isSelector === true` and `selectorCheck.ok === true`** — read `armsToNa`. For each arm-id in that list, write its `## Node Ledger` row to `n/a` with note `selected: <selectorCheck.selected> (not this arm)`. These writes MUST precede the fused advance (`next-action` reads the ledger synchronously; missing n/a rows leave arms as `pending`, stalling the ready set).
3. **`selectorCheck.isSelector === true` and `selectorCheck.ok === false`** — missing or foreign selector. Do NOT mark any arm. Report the condition and stop; the orchestrator owns the halt.

### How n/a rows interact with `next-action`

`next-action` treats `complete` and `n/a` as the TERMINAL set:

- **`depends_on` predicate**: a node whose `depends_on` names an n/a arm is unblocked — the skipped arm satisfies the join as though completed.
- **`allDone` predicate**: n/a arms count toward plan completion; once the selected arm reaches `complete` and all skipped arms carry `n/a`, `allDone` becomes `true` and the plan routes to Finalization.

### Resume re-entry

On resume, the `## Node Ledger` n/a rows are already written (durable). `next-action` re-reads the ledger and treats those arms as TERMINAL — no re-routing step is needed.

## Contractor Agent (issue #242 Part B, wired in Stage C)

The `contractor` is a mechanical Sonnet agent registered across all four editions. It is the bookkeeper half of the lean-orchestrator design. As of Stage D (issue #242 Part B complete) the contractor is dispatched at **both** fuzzy/bulky seams:

- **Finalization** (Stage C): Opus delegates the mechanical finalization block (Step 8a artifact mirror, `cmdFinalize` archive, roadmap regen, the `chore: finalize` commit gate) to the contractor, then resumes at Step 9 (the sink: merge/PR), the issue-close decision, and all governance.
- **Phase 1 / research** (Stage D): `kaola-workflow-phase1` (the research/scout phase) delegates its deterministic mechanical bookkeeping — the `workflow-state.md` checkpoint write (preserving the `## Sink` block byte-for-byte) and the per-issue roadmap `init-issue` staging — to the contractor. Opus retains the research dispatches (code-explorer/knowledge-lookup), the completeness gate, the **`phase1-research.md` synthesis** (interpretation of findings — the contractor never authors this), and the Step 6 branch cut (git mutation).

The per-node executor loop does **not** go through the contractor — see § Adaptive Executor Aggregators above.

### Role

The contractor runs the workflow scripts, parses subagent prose and `.cache` evidence that the Opus orchestrator hands it, and **authors the durable bookkeeping**: ledger rows, phase files, the roadmap mirror, and the archive. It returns a compact summary. It is deterministic plumbing, not a decision-maker.

### Hard boundary — never dispatch, never judge, never gate

This boundary is the reason the contractor exists as a separate Sonnet role (issue #44: the agent owns reasoning; scripts own atomicity):

- **Never dispatches a role.** Choosing which subagent runs next is the orchestrator's decision. The contractor does not spawn, fan out, or route.
- **Never judges, assesses risk, or grades.** The contractor does not decide whether a change is correct, complete, or regression-free. It does not assess severity.
- **Never acts as a gate.** The contractor does not halt a plan, ask the user a question, or surface a risk escalation. Those are orchestrator responsibilities.

### Model

`sonnet` — stays Sonnet even under `--profile=higher`. There is deliberately no `profiles/higher/contractor.md`. Mechanical transcription cannot be judgment-upgraded by installing a higher profile; only judgment roles benefit from Opus. The install-time manifest emits `contractor: sonnet`. See the Agent model manifest subsection under Configuration for the manifest format.

### Tools

`Read, Write, Edit, Bash, Grep, Glob` — Write and Edit author the durable bookkeeping files; Bash runs the workflow scripts.

### Registration (all four editions)

The contractor is registered in all four editions identically:

- **`agents/contractor.md`** — canonical Claude Code agent file (`model: sonnet`, `locally-authored: true`; provenance-exempt in `validate-vendored-agents.js` `localAgents` because it is not vendored upstream).
- **`install.sh`** — listed in `REQUIRED_AGENTS`; `default_agent_model` entry maps to sonnet; `model_for_placeholder` maps to `CONTRACTOR_MODEL`; `render_command_file` emits the model placeholder.
- **`uninstall.sh`** — listed in `REQUIRED_AGENTS` for clean removal.
- **`kaola-workflow-resolve-agent-model.js`** — `DEFAULT_AGENT_MODELS` includes `contractor: 'sonnet'`; four byte-identical copies (canonical `scripts/` + Codex + GitLab + Gitea plugins).
- **Codex `.toml` agent profile** — `agents/contractor.toml` (three byte-identical copies across the Codex, GitLab, and Gitea plugin editions; Claude uses `agents/contractor.md`) with `model_reasoning_effort = "low"`. Per-edition `config/agents.toml` also carries a `[agents.contractor]` block (three byte-identical copies across all Codex editions).

---

## Workflow-Planner Agent (adaptive front end)

The `workflow-planner` is a locally-authored Opus agent that fronts the adaptive path. The main
session dispatches it **once** at the start of an adaptive run; it claims the issue and authors the
plan, then returns control. It is DISTINCT from the vendored read-only `planner` agent (a Phase-2 /
in-plan node role) — `workflow-planner` is the front-end orchestration role, not an in-plan node.

### Purpose

Offload the two seams that ADR 0002 left running inline in the main Opus context on the adaptive
path — the starting **claim** and the `## Nodes` **DAG authoring** — into a single front-end
subagent, so the orchestrator's context stays lean. The agent never freezes, judges risk, asks the
user, or dispatches; it claims, authors, self-checks, and returns. The main session keeps every
judgment.

### Tools and model

`Read, Write, Bash, Grep, Glob`; model **Opus** (fixed — profile-invariant, like the contractor's
fixed Sonnet). `Write` authors `workflow-plan.md`; `Bash` runs the claim/startup and the validator
self-check.

### Ordered contract

The agent runs these steps in order, then returns:

1. **Claim** — `node kaola-workflow-claim.js startup --workflow-path adaptive --target-issue <N>`,
   which writes `workflow-state.md`, stamps `workflow_path: adaptive`, and provisions a worktree at
   `.kw/worktrees/<project>/` (same as full/fast paths; see Worktree Provisioning above). The planner
   authors the plan at repo-root; the executor (`/kaola-workflow-plan-run`) operates inside the
   provisioned worktree so implementation lands on `workflow/issue-N`.
   (`claim.js` needs no code change: `--workflow-path` is parsed by the generic kebab→camel handler,
   so a subagent shell that does not inherit the orchestrator's `KAOLA_PATH` still records the path.)
2. **Author** — write the `## Meta` + `## Nodes` DAG + an **empty** `## Node Ledger` into
   `workflow-plan.md` via `Write`.
3. **Self-check** — run the plan-validator `--json` for orientation only (`kaola-workflow-plan-validator.js <plan> --json`).
   This is NOT the authoritative freeze gate; the main session re-runs the validator on the durable
   plan when it governs.
4. **Return** — emit the structured summary below and hand control back to the main session.

### Structured return

```json
{
  "project": "<project-folder-name>",
  "worktree_path": "<path to the provisioned worktree, or '' if provisioning was skipped/failed>",
  "claim_verdict": "owned | <typed refusal verdict>",
  "claim_reasoning": "<one-line reasoning from the claim>",
  "plan_path": "<path to the authored workflow-plan.md, or null on a claim refusal>",
  "validator_verdict": "<the self-check verdict line, or null on a claim refusal>"
}
```

### Two-mode durable handoff

- **Success.** Every value the main session needs is durable: `workflow-state.md` (Sink block) and
  `workflow-plan.md` are authoritative. The main session reads those **files**, never the planner's
  prose — the structured return is an index, not the source of truth.
- **Claim refusal.** No `workflow-state.md` is written, so there is no durable state to read. The
  structured return is then the **sole** carrier of `claim_verdict` + `claim_reasoning`, and the main
  session branches on the **absence** of the state file rather than blind-reading it.

### Hard boundary — never judge risk, never ask, never dispatch

- **Freeze is mechanical.** The planner RUNS `kaola-workflow-adaptive-handoff.js`, which stamps the
  `plan_hash` freeze automatically on `result:in-grammar`. The planner does not decide to freeze —
  the script does it on an in-grammar result.
- **Never judges risk.** `decision:auto-run` vs `ask` is audit metadata recorded by the handoff;
  the run proceeds either way. The planner makes the plan in-grammar, runs the handoff, and returns
  the packet — it does not govern the risk decision.
- **Never asks the user.** User consent is an orchestrator responsibility; `decision:ask` is not a
  pre-handoff approval gate.
- **Never dispatches a subagent.** A subagent cannot dispatch a subagent (governing harness
  constraint); the agent runs scripts (shells the handoff) and returns the packet to main.

### Decision-record id preflight (#337)

A **freeze-time-once** content check inside `kaola-workflow-adaptive-handoff.js` (step 1.5, after
the validator's in-grammar verdict and BEFORE `--freeze`, so the no-mutation-on-refuse contract
holds). When an **unfrozen** plan hardcodes a decision-record id (`D-<issue>-NN`, the
consumer-project convention) that the target repo already records, the handoff refuses instead of
freezing a stale number into durable history:

- **Candidate:** any `D-<n>-<seq>` token in the plan file (write-set paths, `## Plan Notes`,
  anywhere) **not** annotated with the literal suffix `(existing)` — e.g. `D-210-01 (existing)`
  marks a deliberate reference to an already-shipped record and is exempt (the follow-up pattern:
  "`D-210-01 (existing)` covered the first half; this cycle writes `D-210-02`").
- **Conflict:** the candidate (word-bounded) appears in any `*.md` under the plan repo's `docs/`
  (filename or content) or in its `CHANGELOG.md` (the partial-close pattern leaves shipped ids in
  the changelog).
- **Refusal shape:** `handoff_status:'plan_invalid'`, `result:'refuse'`, each error prefixed
  `decision_id_conflict:` (naming the id, up to 3 hit paths, and the three remediations: renumber
  to the next free `D-<issue>-NN`, use the `D-<issue>-NEXT` placeholder for the doc-updater node to
  resolve, or annotate `(existing)`), plus an additive machine-readable `conflicts` field
  (`[{id, hits}]`) and `validator_verdict` carrying the in-grammar step-1 verdict (the refusal is
  handoff-level, not grammar-level). Exit non-zero; nothing mutated — the refusal feeds the
  existing bounded planner repair loop.
- **Non-goals (deliberate exemptions):** already-frozen plans are skipped (idempotent handoff
  re-runs and post-execution resumes can never self-conflict with a record the run itself wrote),
  and the validator's `--freeze`/`--resume-check` paths are untouched (mid-run plan-repairs go
  through them directly). `D-<issue>-NEXT` placeholders never match. Pure-core callers that do not
  inject the `findDecisionIdHits` seam keep exact prior behavior (fail-open by construction; the
  CLI `main()` wires the default docs/CHANGELOG scanner).

Full rationale: `docs/decisions/0003-adaptive-front-end-planner.md`.

### Worktree project-folder mirror (#335)

A fresh adaptive worktree is provisioned at claim time (before any plan exists) and the planner
authors + freezes the plan in the MAIN checkout, so the linked worktree never receives the
untracked `kaola-workflow/<project>/`. The `kaola-workflow-adaptive-node.js mirror-project`
subcommand is the **one mechanical transaction** that transports it; it is shelled by the handoff
(step 7) and re-run idempotently at every `/kaola-workflow-plan-run` entry. It is read-only on the
ledger and `workflow-state.md` and runs strictly before any node baseline is recorded, so the
mirrored files are part of every per-node baseline and never attributed as node writes.

- **CLI:** `node kaola-workflow-adaptive-node.js mirror-project --project P --json` (exit ≠ 0 on
  refuse; the `validateProjectName` #318 guard applies). It resolves the MAIN checkout via
  `git rev-parse --git-common-dir` (so it works from a worktree cwd) and the worktree from the
  main state's `worktree_path:`.
- **`status: skipped`** (`result:'ok'`) — no `worktree_path` (in-place / offline / bundle lane:
  `reason:'no_worktree'`) or the recorded worktree dir is gone (`reason:'worktree_dir_missing'`).
- **`status: exists`** (`result:'ok'`) — the worktree already has a `workflow-plan.md`; NEVER
  overwritten (on resume the worktree copy is authoritative, #264). This makes the subcommand
  idempotent and safe to re-run at every entry.
- **`status: mirrored`** (`result:'ok'`) — atomic **copy → `plan_hash` re-verify → rename promote**:
  the source folder is copied to a `.mirror-tmp-<project>` dir, the validator `--resume-check`
  re-derives and compares the `plan_hash` on the COPIED plan (AC4), and only on success is the tmp
  dir `rename`d into place (same-filesystem atomic). The verified `planHash` is surfaced.
- **Refusals (exit 1):** `state_missing` (run claim/startup first), `source_plan_missing` (route to
  `/kaola-workflow-adapt`), `mirror_verify_failed` (the copied plan failed `plan_hash` re-verification
  — destination left untouched, all-or-nothing), `mirror_failed` (fs error; best-effort tmp cleanup).
- **Handoff packet field:** the handoff attaches `worktree_mirror:{ status, reason?, planHash?, path? }`
  to the `ready_to_run` packet. It is **best-effort** — a mirror refuse/failure (`status:'failed'`)
  does NOT flip `handoff_status` (the plan IS valid; provisioning is enforced at plan-run entry +
  `orient`), mirroring the `roadmap_staged` and #282 task-mirror conventions.
- **`orient` fail-closed:** when the worktree plan is absent, `orient` refuses
  `plan_not_mirrored` (the MAIN checkout has the frozen folder — `repair` names the exact
  `mirror-project` command) or `plan_missing` (truly unauthored — route to `/kaola-workflow-adapt`).
  The probe is CLI-wired; library callers without it keep the prior tolerant behavior byte-for-byte.

---

## Codex Harness Scripts (issue #266)

Three scripts harden the Codex edition against config drift, silent inline execution, and state loss after compaction. All three are installed via `SUPPORT_SCRIPT_NAMES` in `install.sh` (not `SUPPORT_HOOK_NAMES`).

### Script: `kaola-workflow-codex-preflight.js`

Hard-gates Codex role-profile/config freshness before any `subagent-invoked` compliance row may be written. TRUE 4-tree byte-identical (all four editions share the same file, authored require-free of edition code — only `fs`/`path`/`os` and an inline TOML-block scanner). Since #332 it also schema-validates each installed profile and detects stale/retired Kaola files; the small schema regexes + constants (`RETIRED_PROFILE_FILES`, `EFFORT_VALUES`, `MANIFEST_BASENAME`, `validateProfileText`) are deliberately mirrored from `install-codex-agent-profiles.js` (the claude `scripts/` tree has no installer to require).

**CLI:**

```bash
node scripts/kaola-workflow-codex-preflight.js --project-root <dir> [--plan <plan-path>] [--no-autofix] [--json]
node scripts/kaola-workflow-codex-preflight.js --doctor [--project-root <dir>] [--home <dir>] [--json]
```

**Behavior (normal gate):**

1. Resolves `--project-root` (or `process.cwd()`) and checks `.codex/agents/kaola-workflow/` for per-role `.toml` files, **schema-validating** each required profile (a non-empty top-level `name` matching the role, a legal `model_reasoning_effort`, a non-blank `developer_instructions`).
2. Reads `.codex/config.toml`, locates the managed block between `# BEGIN kaola-workflow agents` and `# END kaola-workflow agents`, asserts every required role has an `[agents.{role}]` entry inside it, and flags any retired/foreign `[agents.*]` *inside* the markers.
3. Required-role set: the union of (a) all roles in the bundled `config/agents.toml` template (read dynamically — no hardcoded count) and (b) the roles named in the frozen plan's `## Nodes` table when `--plan <path>` is supplied.
4. Stale/retired Kaola `.toml` files left in the target dir (listed in the local `.kaola-managed-profiles.json` manifest, or in the retired-files list `docs-lookup.toml`) are detected; unknown user-owned TOMLs are **reported, never deleted** (the `extra_unmanaged` field).
5. **Auto-install when safe**: if the only problem is a stale/missing/malformed managed block, profile file, or stale Kaola file, runs `install-codex-agent-profiles.js`, then re-verifies ALL checks. On success, returns exit 0 with `autofixed: true`.
6. **Typed refusal when unsafe**: if a conflicting `[agents.*]` table exists OUTSIDE the managed markers, the local manifest declares an unsupported (future) `schema_version`, the installer is unavailable/errors, or the plan names a role absent from the template, exits non-zero with a typed-refusal JSON. `--no-autofix` forces the refusal path (useful in tests).
7. **Never a silent `subagent-invoked`**: any non-`ok` status is a STOP for the caller.

**Exit codes:**

| Exit code | `status` | Meaning |
|-----------|----------|---------|
| `0` | `ok` | Fresh (or auto-fixed-then-fresh) |
| `1` | `profiles_malformed` / `profiles_stale` / `profiles_missing` / `config_stale` / `managed_block_stale` | Stale (autofixable) — `--no-autofix` refusal |
| `2` | `template_missing` | bundled `config/agents.toml` not found |
| `3` | `role_not_in_template` | plan names a role absent from the template |
| `4` | `autofix_unsafe` | hand-authored `[agents.*]` outside the managed markers |
| `5` | `installer_failed` | installer missing / errored / still stale after re-verify |
| `6` | `profile_schema_version_unsupported` | local manifest `schema_version` is newer than this installer supports — upgrade kaola-workflow |

**JSON output (`--json`):**

Success:
```json
{ "status": "ok", "roles_checked": ["code-explorer", "..."], "extra_unmanaged": [], "autofixed": false }
```

Typed refusals (non-zero exit) carry `status`, `stale: true`, `safe_autofix`, `repair`, and `extra_unmanaged`, plus a status-specific payload: `malformed: [{role, file, reasons}]` (`profiles_malformed`), `stale_files: [...]` (`profiles_stale`), `stale_roles_in_block: [...]` (`managed_block_stale`), `missing_roles: [...]` (`profiles_missing`/`config_stale`), or `conflicting_roles_outside_markers: [...]` (`autofix_unsafe`).

**Doctor mode (`--doctor`)** — READ-ONLY, never runs the installer (even without `--no-autofix`). Reports freshness for three scopes:

- `user` — `<home>/.codex` (`--home` overrides `os.homedir()`; a test/diagnostic hook);
- `project` — `<project-root>/.codex`;
- `plugin_cache` — cached source profiles under `<home>/.codex/plugins/cache/<marketplace>/<plugin>/<version>/agents`, schema-checked, `read_only: true`.

`--json` emits `{ status: 'ok'|'stale', scopes: [{scope, codex_dir, exists, managed_block, profiles, missing_roles, malformed, stale_files, stale_roles_in_block, extra_unmanaged, manifest, read_only, repair}, ...] }`. Exit code is 0 when the `user` and `project` scopes are clean-or-absent and 1 when either is stale; `plugin_cache` findings are evidence-only and never set the exit code (they distinguish runtime/plugin-cache freshness from generated `.codex/` state). Each stale scope carries a concrete `repair` command.

---

### Script: `install-codex-agent-profiles.js`

Installs the Codex-native role profiles into a project's `.codex/`. Ships in the **3 plugin trees only** (codex/gitlab/gitea), byte-identical (enforced by `validate-script-sync.js`). Run by the Codex `kaola-workflow-init` skill (NOT by `install.sh`). Default-on validate → install → prune → manifest → post-verify (no install flags):

1. **Source schema wall** — `validateSourceProfiles(pluginRoot)`: every `config_file` resolves, every `agents/*.toml` is referenced by exactly one `[agents.*]` entry, and every profile passes `validateProfileText`. On failure, prints `profile_schema_error: ...` to stderr and exits 1 **before any write**.
2. **Manifest guard** — if the target manifest declares a `schema_version` newer than supported, prints `manifest_schema_unsupported: ...` and exits 1 (never prunes against a future manifest).
3. Copies each source profile via write-temp-then-rename (no torn profiles on crash), upserts the managed `[agents.*]` block, and merges the managed `.codex/hooks.json` entries (#325 semantics).
4. **Prune** — removes target `.toml` files that are no longer current AND are either listed in the previous manifest (`stale-managed`) or in the retired list `docs-lookup.toml` (`retired`, works with no manifest). Unknown user TOMLs are left in place and reported as `unmanaged extra`.
5. **Manifest** — writes `.codex/agents/kaola-workflow/.kaola-managed-profiles.json` (`schema_version: 1`, plugin name/version, ISO `installed_at`, `roles`, per-file `sha256`, `retired_files_removed`).
6. **Post-verify** — re-reads every installed profile and asserts the managed block carries every template role; on failure prints `post_verify_failed: ...` and exits 1.
7. Prints `status: ok` as the last line — the machine-checkable success sentinel.

Exported helpers (require-safe; `require.main` guard means `require()` never runs the installer): `validateProfileText`, `validateSourceProfiles`, `pruneStaleProfiles`, `readManifest`, `writeManifest`, `buildManagedHooks`, `mergeHooks`, `updateHooks`, plus the constants `RETIRED_PROFILE_FILES`, `MANIFEST_BASENAME`, `EFFORT_VALUES`.

---

### Script: `kaola-workflow-task-mirror.js`

Generates `kaola-workflow/{project}/workflow-tasks.json` from the frozen `workflow-plan.md`. COMMON_SCRIPTS 2-tree byte-identical (claude + codex share the same base-named file); gitlab and gitea carry edition-named ports (`kaola-gitlab-workflow-task-mirror.js` / `kaola-gitea-workflow-task-mirror.js`) with a single `require` line swapped to the edition-named plan-validator — exactly the `next-action`/`commit-node` pattern.

**CLI:**

```bash
node scripts/kaola-workflow-task-mirror.js --project <name> [--now <iso>] [--json]
```

Resolves `kaola-workflow/<project>/workflow-plan.md`, writes `kaola-workflow/<project>/workflow-tasks.json`. `--json` echoes the written object to stdout.

**Exported API (for tests):**

```js
const { generateMirror, mapLedgerStatus } = require('./kaola-workflow-task-mirror');
// generateMirror({ planContent, now }) -> { source_plan_hash, tasks, last_synced_from_ledger }
// mapLedgerStatus(ledger_status) -> { status, ledger_status }
```

**Schema (written JSON):**

```json
{
  "source_plan_hash": "<64-hex>",
  "tasks": [
    { "id": "explore", "role": "code-explorer", "status": "completed", "ledger_status": "complete" }
  ],
  "last_synced_from_ledger": "<ISO timestamp>"
}
```

**`ledger_status` → `status` mapping:**

| `ledger_status` | `status` emitted | `ledger_status` field emitted |
|-----------------|-----------------|-------------------------------|
| `complete`      | `completed`     | `"complete"` |
| `in_progress`   | `in_progress`   | `"in_progress"` |
| `pending`       | `pending`       | `"pending"` |
| `n/a`           | `completed`     | `"n/a"` (skipped Classify-And-Act arm — appears completed in the UI) |
| unknown/absent  | `pending`       | raw value (conservative) |

**Runtime invocation (issue #282):** the mirror is generated **automatically** — it is no longer only a manually-invokable CLI. The adaptive handoff (`kaola-workflow-adaptive-handoff.js`) generates it once the plan is frozen + integrity-checked, so it exists from the first plan-run entry; and `kaola-workflow-adaptive-node.js orient` reconciles it (by shelling this CLI) on **every** plan-run resume. Both invocations are best-effort — a non-frozen plan degrades silently, and `orient` stays read-only with respect to the plan/ledger/state (the write happens in this CLI's own subprocess). The CLI remains runnable by hand.

**Rebuild-if-stale rule:** on resume, compare `workflow-tasks.json.source_plan_hash` against `readStoredHash(planContent)` from the current plan. Regenerate when the file is missing, unparseable, or the stored hash differs. When hashes match, regenerate anyway to pick up current ledger status — it is idempotent and cheap.

**Exit codes:**

- `0` — file written successfully.
- non-zero — typed refusal: `{ "status": "plan_not_frozen" }` when the plan has no `plan_hash` (the mirror is only meaningful for a frozen plan); also on unreadable plan.

---

### Script: `kaola-workflow-codex-compact-resume.js`

The Codex compact/resume entrypoint. A self-contained stdin/stdout filter that reads durable workflow artifacts and emits a deterministic resume packet. Edition-named ×3 (codex: `kaola-workflow-codex-compact-resume.js`, gitlab: `kaola-gitlab-workflow-codex-compact-resume.js`, gitea: `kaola-gitea-workflow-codex-compact-resume.js`); only the filename comment differs across editions.

**Note:** The Codex plugin manifest (`plugin.json`) has no `hooks` key. The lifecycle wiring lives in the project-local `.codex/hooks.json` written by `install-codex-agent-profiles.js`: this script is registered as a `SessionStart` (`compact`) hook (id `kaola-workflow:compact-context`) there. It is also invokable on demand via stdin (see invocation below).

**Invocation (on demand):**

```bash
echo '{"cwd":"<repo-root>"}' | node plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
```

Reads the `cwd` field from optional stdin JSON; walks up from `cwd` to find the `kaola-workflow/` directory. Emits the resume packet to stdout. Swallows errors to a `[skipped]` stderr line; always exits 0 (fail-open, never blocks a session).

**Resume packet (6 sections, deterministic order):**

```
Kaola-Workflow compact resume:
active project: <project-name>
next skill/command: <next command from workflow-state.md>
in-progress node: <node-id> (role: <role>)
pending gates: <gate-node-id>, ...
consent-halt markers: consent_halt=<none|pending> escalated_to_full=<value> inline_emergency_fallback_authorized=<value>
task mirror: completed: N, in_progress: N, pending: N, in_progress_task: <node-id>
```

When `workflow-tasks.json` is absent, section 6 reads `task mirror: not generated`.

**Sources read (all read-only; no state mutation):**

| Artifact | What is extracted |
|----------|-------------------|
| `workflow-state.md` | Active project name, `next_command`, consent/fallback markers |
| `workflow-plan.md` `## Node Ledger` | In-progress node id + role, pending gate nodes |
| `workflow-tasks.json` | Task counts by status, in-progress task id |

**AC-F:** Zero `CLAUDE_PLUGIN_ROOT` references; no `require()` of edition code — only stdlib `fs` and `path`. Claude-settings-free.

---

## Codex `.codex/hooks.json` managed-entry contract

`install-codex-agent-profiles.js` (invoked by `./install.sh`) writes a project-local
`.codex/hooks.json` containing the three managed Kaola-Workflow hook entries. The
Codex plugin manifest (`plugin.json`) has no `hooks` key; this file is the sole
wiring point for Codex lifecycle hooks.

### Managed-entry identification

Each managed entry carries an `id` field starting with `kaola-workflow:`. The installer
identifies managed entries by that prefix and uses an idempotent merge-by-id strategy:

- For each event in the managed template, existing entries whose `id` starts with
  `kaola-workflow:` are dropped and the managed entries are appended.
- User entries (no `id`, or a non-`kaola-workflow:` id) are preserved untouched.
- Events not present in the managed template are left entirely unchanged.
- If the existing `.codex/hooks.json` is missing or malformed JSON, it is treated as
  empty with a warning printed to stderr (WARN-first; the install proceeds).

### Template token substitution

The source template (`plugins/kaola-workflow/config/hooks.json`) uses the token
`__KW_PLUGIN_ROOT__` in every command path. The installer replaces ALL occurrences
(using `split/join`, not `String.replace`) with the absolute path to the plugin root
directory at install time. Written command paths in `.codex/hooks.json` are therefore
absolute and resolve correctly regardless of the working directory when Codex runs the hook.

### The three managed entries

| Event | Matcher | id | Command script |
|-------|---------|-----|----------------|
| `SessionStart` | `compact` | `kaola-workflow:compact-context` | `scripts/kaola-workflow-codex-compact-resume.js` |
| `PreToolUse` | `Bash` | `kaola-workflow:pre-commit-guard` | `hooks/kaola-workflow-pre-commit.sh` |
| `SubagentStart` | `*` | `kaola-workflow:subagent-dispatch-log` | `hooks/kaola-workflow-subagent-dispatch-log.sh` |

(The `PostToolUse` `kaola-workflow:phantom-advisor` entry was retired in #372 with the
advisor gates; an upgrade install de-registers any stale copy from existing settings.)

All three entries carry a `timeout` field (5 seconds) and
a `description` field. These values come directly from the template; the installer
does not add or modify them beyond the token substitution above.

### Installer console output

The installer prints:

```
Kaola-Workflow Codex hooks: updated at .codex/hooks.json
run /hooks once in Codex to review and trust these command hooks (or codex exec --dangerously-bypass-hook-trust for automation)
```

(or `unchanged` in place of `updated` when no diff was produced.)

### Caveats

- **`/hooks` one-time trust step (AC1):** after install, run `/hooks` once in Codex
  to review and trust the command hooks (content-hash trust). Editing a hook file
  marks it untrusted again. For automation use `codex exec --dangerously-bypass-hook-trust`.
- **`multi_agent` precondition (AC5):** `SubagentStart` requires Codex `multi_agent`
  enabled. With it off the hook never fires and `checkDispatchAttestations` reads
  `claim_planner_attested: missing` / `finalize_contractor_attested: missing` —
  non-fatal, WARN-first (closure still succeeds).
- **Matcher caveat:** the `PreToolUse`/`PostToolUse` matchers (`Bash`, `Write|Edit`)
  follow Claude Code tool names. If a Codex build uses different tool-event names the
  matcher string in `.codex/hooks.json` may need adjustment.
- **Uninstall scope:** `uninstall.sh` strips the managed entries from the
  `.codex/hooks.json` in the directory it is run from. Because the file is
  project-local (not global), running `uninstall.sh` from a different directory
  leaves any copy written there intact.

---

## Module Exports — Public API Functions

The following functions are exported from sink and claim modules for use by test suites and advanced integrations:

### GitHub Edition

**`scripts/kaola-workflow-sink-merge.js`:**
- `classifyMergeError(error)` — Classifies a push/merge error into `permission_denied`, `branch_protected`, `non_fast_forward`, or `null`. Used by `postMergeCleanup` to determine merge-impossible conditions and trigger fallback-to-PR behavior.

**`scripts/kaola-workflow-claim.js`:**
- `getCoordRoot(root)` — Derives the coordination root (shared state directory) from a repository root. Returns `<repo>/.git/kaola-workflow/` when `.git` is a directory, or falls back to `<repo>/kaola-workflow/` for worktrees.

**`scripts/kaola-workflow-roadmap.js`:**
- `regenerateRoadmap(root)` — Silently regenerates `ROADMAP.md` from `.roadmap/issue-*.md` sources. Returns `'generated'` if content changed, `'up-to-date'` if no change. Used by claim scripts during finalization to clean up roadmap entries. Does not print to stdout.
- `validateRemote(root)` — Detects closed-remote drift by checking each open-status entry in `.roadmap/issue-*.md` against remote issue state. Returns array of issue numbers that are marked open locally but closed on the remote. Empty array indicates no drift.
- `readRoadmapIssues(dir)` — Parses all `.roadmap/issue-*.md` files in a directory and returns an array of issue objects (with `issue`, `title`, `status`, `workflow_project`, `next_step` fields). Filters out invalid entries.
- `roadmapDir(root)` — Returns the path to `.roadmap/` directory (utility function).
- `buildRoadmapContent(issues, dir)` — Constructs the markdown table for `ROADMAP.md` from an issue array. Used by generate and validate subcommands. When `dir` (the `.roadmap/` directory) is provided and `<dir>/_rules.md` exists and is non-empty after trimming, that file's contents are appended to the Rules section under a `### Project rules` sub-heading; when `dir` is omitted or `_rules.md` is absent/empty, output is byte-identical to the built-in Rules block. All `buildRoadmapContent` call sites within a script must thread `dir` consistently so the `generate` output matches the `validate` recomputation (and the GitLab/Gitea `refresh` command preserves project rules).

### GitLab Edition

**`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`:**
- `classifyMergeError(error)` — Classifies a push/merge error (same contract as GitHub). Additionally respects `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` test hook for deterministic merge-impossible simulation.
- `closeLinkedIssue(root, project, issueIid, opts)` — GitLab-specific function to close a linked issue after merge. Used in test scenarios.
- `fastForwardMain(args, opts)` — Legacy single-pass merge implementation (used by tests).
- `finalValidationPassed(root, project)` — Checks `finalization-summary.md` for final validation evidence. Required before direct merge runs.
- `runDirectMerge(args, opts)` — Main entry point for the direct merge pipeline. Performs all 9 steps (fetch, rebase, FF retry, test, push, close issue, delete branch).

**`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`:**
- `getCoordRoot(root)` — Same contract as GitHub edition. Derives the coordination root for shared state storage.
- `cmdSinkFallback()` — Fallback sink implementation invoked when merge sink fails. Checks both live folder and archive folder before updating state; returns `{updated: false, reason: 'project archived'}` if either path does not exist (live) or archive path exists, preventing recreation of archived projects. Otherwise updates sink state to `mr` and returns `{updated: true, sink: 'mr', reason}`. This is called after merge sink exits 3 during auto-fallback.

**`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`:**
- `regenerateRoadmap(root)` — Silently regenerates `ROADMAP.md` from `.roadmap/issue-*.md` sources. Returns `'generated'` if content changed, `'up-to-date'` if no change. Used by claim scripts during finalization to clean up roadmap entries. Does not print to stdout.
- `validateRemote(root)` — Detects closed-remote drift by checking each open-status entry in `.roadmap/issue-*.md` against GitLab issue state. Returns array of issue IIDs that are marked open locally but closed on the remote.

### Gitea Edition

**`plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`:**
- `teaExec(args, opts)` — Execute `tea` CLI commands with version validation (tea >= 0.9.2). Supports `KAOLA_WORKFLOW_OFFLINE=1` for offline testing and optional `execFileSync` injection for test runners.
- `labelsOf(raw)` — Extract label names from mixed label objects (strings or objects with `.name` or `.title` properties).
- `uniqueLabels(raw)` — Return deduplicated label names.
- `preserveWorkflowLabels(currentLabels, nextLabels)` — Ensure workflow labels (`workflow:in-progress`, `workflow:queued`) are preserved when updating issue labels.
- `normalizeState(raw)` — Normalize issue/PR state strings to `open`, `closed`, or `merged`.
- `normalizeProject(raw)` — Normalize Gitea project objects to canonical form: `{owner, name, full_name, html_url}`.
- `normalizeIssue(raw)` — Normalize Gitea issue objects to canonical form: `{number, issue_iid, id, title, body, state, labels, updated_at, url}`.
- `normalizePullRequest(raw)` — Normalize Gitea PR objects to canonical form: `{number, pr_number, id, title, state, pr_url, source_branch, target_branch}`.
- `discoverProject(opts)` — Discover current project via `tea repo view` or git remote fallback.
- `listIssues(opts)` — List all issues (default limit 100, supports state filter).
- `viewIssue(issueNum, opts)` — Fetch a single issue by number.
- `updateIssueLabels(project, issueNum, opts)` — Add or remove labels from an issue.
- `closeIssue(issueNum, opts)` — Close an issue by number.
- `createIssueComment(project, issueNum, body, opts)` — Create a comment on an issue.
- `listIssueComments(project, issueNum, opts)` — List all comments on an issue.
- `updateIssueComment(project, issueNum, commentId, body, opts)` — Update an issue comment.
- `createPullRequest(opts)` — Create a pull request with optional source/target branch, title, and description.
- `viewPullRequest(prNumber, opts)` — Fetch a single PR by number.
- `listPullRequests(opts)` — List all pull requests.
- `mergePullRequest(project, prNumber, opts)` — Merge a PR with optional squash and branch removal. When `opts.sha` is set, passes it as `head_commit_id` in the merge request body (Gitea API field; issue #121).
- `checkServerVersion(opts)` — Verify Gitea server version is ≥ 1.17 by reading the `version` field from `/api/v1/version`. Throws if server is too old. Called automatically by `mergePullRequest` when `opts.autoMerge` is set.
- `checkRepoSquashEnabled(project, opts)` — Validate that the Gitea repository supports squash merges before attempting a squash merge. Throws an error if squash is not enabled.
- `ensureLabel(project, labelDef, opts)` — Create a label if it does not exist; return existing label if found.

**`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`:**
- `ensurePullRequest(args, opts)` — Create or reuse a pull request. Returns `{pr, project}` with PR metadata (url, number, state, source_branch) and project info (full_name, html_url). Automatically updates `workflow-state.md` Sink block with pr_url, pr_number, full_name, and project_html_url.
- **Exit codes**:
  - `0`: PR created/reused successfully, metadata recorded in workflow-state.md and finalization-summary.md

**`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`:**
- `ensureMergeReady(args, opts)` — Validate final merge conditions and execute the merge pipeline. Returns merge result with exit code.
- `readProjectInfo(root, project)` — Read project full_name and html_url from workflow-state.md, with fallback to `discoverProject()` from git remote.
- `finalValidationPassed(root, project)` — Check if finalization-summary.md contains passing final validation evidence.
- **Exit codes**:
  - `0`: merge succeeded, branch pushed, issue closed, worktree cleaned
  - `2`: fast-forward race condition exhausted after MAX_AUTOMERGE_RETRIES attempts
  - `3`: merge-impossible error (branch protected, non-fast-forward, permission denied); auto-fallback to PR sink

**`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`:**
- `regenerateRoadmap(root)` — Silently regenerates `ROADMAP.md` from `.roadmap/issue-*.md` sources. Returns `'generated'` if content changed, `'up-to-date'` if no change. Used by claim scripts during finalization to clean up roadmap entries. Does not print to stdout.
- `validateRemote(root)` — Detects closed-remote drift by checking each open-status entry in `.roadmap/issue-*.md` against Gitea issue state. Returns array of issue numbers that are marked open locally but closed on the remote.

## Stale Worktree Detection

### Script: `kaola-workflow-claim.js stale-worktree-check`

Detects Git worktrees and branches for issues that are no longer active. A worktree or branch is considered "stale" when its linked issue is closed (as reported by GitHub/GitLab/Gitea API) OR its project folder is archived locally (exists in `kaola-workflow/archive/{project}`), AND the issue is not currently in the active folder set.

**Invocation:**

```bash
node scripts/kaola-workflow-claim.js stale-worktree-check
```

**GitLab edition:**

```bash
node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check
```

**Gitea edition:**

```bash
node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check
```

The JSON return shape is identical across all three forges. GL/GT editions match branches on their forge-specific prefix (`workflow/gitlab-issue-*` / `workflow/gitea-issue-*`) instead of the GitHub `workflow/issue-*` prefix.

**Output schema (JSON):**

```json
{
  "stale_worktrees": [
    {
      "path": "/path/to/worktree",
      "branch": "workflow/issue-42",
      "head": "abc123def456",
      "issue_number": 42,
      "state": "clean|dirty|missing"
    }
  ],
  "stale_branches": [
    {
      "branch": "workflow/issue-43",
      "issue_number": 43
    }
  ],
  "active_worktrees": [
    {
      "path": "/path/to/active/worktree",
      "branch": "workflow/issue-44",
      "issue_number": 44
    }
  ],
  "count": 2
}
```

**Output fields:**

- **`stale_worktrees`** — Registered Git worktrees (from `git worktree list --porcelain`) whose linked issue is closed or archived, and not in the active folder set.
  - `path` — Filesystem path to the worktree
  - `branch` — Branch name (e.g., `workflow/issue-42`)
  - `head` — Current HEAD commit hash from worktree metadata
  - `issue_number` — Issue number extracted from branch name (via regex `workflow/issue-(\d+)`)
  - `state` — Worktree filesystem state: `clean` (no modifications), `dirty` (uncommitted changes), or `missing` (registered but directory deleted)

- **`stale_branches`** — Local Git branches named `workflow/issue-*` (detected via `git for-each-ref refs/heads/workflow/`) that have no corresponding registered worktree AND whose linked issue is closed or archived, and not in the active folder set.
  - `branch` — Branch name
  - `issue_number` — Issue number extracted from branch name

- **`active_worktrees`** — Registered worktrees whose linked issue is still open and active (appears in the active folder set).
  - `path`, `branch`, `issue_number` — Same as stale worktrees

- **`count`** — Total number of stale items (sum of `stale_worktrees.length + stale_branches.length`)

**Stale detection logic:**

For each worktree or branch:

1. Extract the issue number from the branch name using regex `workflow/issue-(\d+)`.
2. Check if the issue is active (in the set of active folder issue numbers from `workflow-state.md`).
3. If active: skip (not stale).
4. Otherwise, check if the issue is closed OR archived:
   - **Closed**: Call GitHub/GitLab/Gitea API to check issue state (skipped when `KAOLA_WORKFLOW_OFFLINE=1`).
   - **Archived**: Check if `kaola-workflow/archive/issue-<N>` exists locally.
5. If either condition is true, mark the worktree/branch as stale.

**Offline mode** (`KAOLA_WORKFLOW_OFFLINE=1`):

When offline, GitHub/GitLab/Gitea API calls are skipped. Stale detection uses only the archive-existence check. Worktrees/branches for archived issues are still reported as stale, but worktrees/branches for closed (but not archived) issues are not reported.

**Exit code:**

- `0` — Execution succeeded; JSON output written to stdout

### Script: `kaola-workflow-claim.js stale-worktree-cleanup`

Removes stale Git worktrees and branches identified by `stale-worktree-check`. Provides safe, reversible cleanup strategies for both clean and dirty worktrees.

**Invocation:**

```bash
# Dry-run (no changes)
node scripts/kaola-workflow-claim.js stale-worktree-cleanup

# GitHub edition with all options
node scripts/kaola-workflow-claim.js stale-worktree-cleanup --execute --archive --keep-branch

# GitLab edition
node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-cleanup --execute

# Gitea edition
node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-cleanup --execute
```

**Flags:**

- **`--execute`** — Perform actual removal. Without this flag, the command runs in dry-run mode, scanning for stale items and reporting what would be removed without making changes.
- **`--archive`** — For dirty worktrees, stash uncommitted changes before removal. Changes are recoverable via `git stash list`.
- **`--export`** — For dirty worktrees, write a patch file to `kaola-workflow/archive/exports/` before removal. Tracked changes are captured in a `.patch` file (recoverable via `git apply`). Untracked files (which `git diff` does not capture) are copied verbatim into a sibling `issue-N-{timestamp}-untracked/` sidecar directory, preserving their relative paths.
- **`--force`** — For dirty worktrees, discard all uncommitted changes without recovery.
- **`--keep-branch`** — Remove the git worktree but preserve the local branch. Useful for open PRs that should remain available. When omitted, both worktree and branch are deleted.

When no strategy flag (`--archive`, `--export`, or `--force`) is given, dirty worktrees are skipped and reported in the `skipped_dirty` field; no changes are made to them. When more than one strategy flag is given, they are not mutually exclusive and no error is raised — a silent precedence applies: `--archive` takes effect first, then `--export`, then `--force` (`archive > export > force`).

**Behavior:**

1. **Dry-run mode** (default, no `--execute`): Scans for stale worktrees and branches using the same logic as `stale-worktree-check`, prints report of what would be removed, exits without making changes.

2. **Clean worktrees**: Removed via `git worktree remove`. Branches deleted (unless `--keep-branch` is set).

3. **Dirty worktrees** (uncommitted changes):
   - No strategy flag: dirty worktrees are skipped and reported in `skipped_dirty`. No changes are made to them.
   - With `--archive`: Changes are stashed; worktree is removed. User can recover via `git stash list` and `git stash pop`.
   - With `--export`: Tracked changes written to `kaola-workflow/archive/exports/issue-N-{timestamp}.patch` (recoverable via `git apply`). Untracked files copied to a sibling `issue-N-{timestamp}-untracked/` directory. Worktree is removed. Both artifacts are reported in the `exported` field of JSON output.
   - With `--force`: Changes are discarded immediately. Worktree is removed. No recovery path.

4. **Missing worktrees**: Registered in git but filesystem deleted. Branch cleanup still proceeds.

5. **Branch cleanup**: Local branches matching `workflow/issue-*` (GitHub), `workflow/gitlab-issue-*` (GitLab), or `workflow/gitea-issue-*` (Gitea) are deleted unless `--keep-branch` is set.

**Exit codes:**

- `0` — Dry-run completed successfully, or removals executed successfully
- `1` — Error during execution (invalid flags, git error, filesystem error)

**JSON output:**

**Dry-run** (no `--execute`):

```json
{
  "dry_run": true,
  "would_remove": [],
  "would_delete_branch": [],
  "skipped_dirty": []
}
```

**Execute** (`--execute`):

```json
{
  "dry_run": false,
  "removed": [],
  "deleted_branch": [],
  "skipped_dirty": [],
  "stashed": [],
  "exported": [],
  "failed_preserve": []
}
```

**Typical cleanup workflow:**

```bash
# 1. Check what's stale
node scripts/kaola-workflow-claim.js stale-worktree-check

# 2. Dry-run cleanup to see what would be removed
node scripts/kaola-workflow-claim.js stale-worktree-cleanup

# 3. Review the report and decide on strategy

# 4. Execute with chosen strategy
# For worktrees with uncommitted work:
node scripts/kaola-workflow-claim.js stale-worktree-cleanup --execute --archive

# Or for worktrees with no work:
node scripts/kaola-workflow-claim.js stale-worktree-cleanup --execute --force

# 5. For open PRs, preserve branch while removing worktree:
node scripts/kaola-workflow-claim.js stale-worktree-cleanup --execute --archive --keep-branch

# 6. Verify cleanup completed
node scripts/kaola-workflow-claim.js stale-worktree-check
```

**Offline mode** (`KAOLA_WORKFLOW_OFFLINE=1`):

The command still removes local worktrees and branches. Archive/export strategies work normally. The detection of which worktrees/branches are "stale" uses only the local archive-existence check (no remote API calls to verify if issues are closed).

### Script: `kaola-workflow-claim.js legacy-worktree-cleanup`

Discovers and removes Git worktrees that were provisioned under the old sibling-container path (`<repo-parent>/<repo-name>.kw/<project>/`) before the repo-local `.kw/worktrees/` layout was introduced (#264). This is a separate subcommand from `stale-worktree-cleanup` (which targets issue-closed/archived staleness, not path-layout migration).

**Invocation:**

```bash
# Dry-run (default — no changes)
node scripts/kaola-workflow-claim.js legacy-worktree-cleanup

# Execute removal
node scripts/kaola-workflow-claim.js legacy-worktree-cleanup --execute

# Execute with dirty-worktree handling
node scripts/kaola-workflow-claim.js legacy-worktree-cleanup --execute --archive
node scripts/kaola-workflow-claim.js legacy-worktree-cleanup --execute --export
node scripts/kaola-workflow-claim.js legacy-worktree-cleanup --execute --force
```

**Flags:**

- **`--execute`** — Perform actual removal. Without this flag, the command dry-runs and prints what would change.
- **`--archive`** — For dirty worktrees, stash uncommitted changes before removal (recoverable via `git stash`).
- **`--export`** — For dirty worktrees, write a patch file to `kaola-workflow/archive/exports/` before removal.
- **`--force`** — For dirty worktrees, discard uncommitted changes without recovery.

When no strategy flag is given, dirty worktrees are skipped and reported in `skipped_dirty`. Branch refs are preserved (only the worktree registration and filesystem directory are removed). After all legacy worktrees are removed, the now-empty legacy container directory is deleted. The command refuses to operate if the current working directory is inside a target legacy worktree.

**JSON output:**

```json
{
  "dry_run": true,
  "would_remove": [],
  "skipped_dirty": []
}
```

```json
{
  "dry_run": false,
  "removed": [],
  "skipped_dirty": [],
  "stashed": [],
  "exported": [],
  "failed_preserve": []
}
```

## Closure Contract

This section defines the closure-system invariants for a completed linked issue
N. It is the human-readable counterpart to the machine-readable schema in
`scripts/kaola-workflow-closure-contract.js`. As of issue #164, all closure
paths (`cmdFinalize`, `cmdWatchPr`/`cmdWatchMr`, and `sink-merge`) seed a full
receipt from `emptyReceipt()` via the shared `buildClosureReceipt()` helper and
emit `closure_receipt` plus `closure_invariants` in their JSON output.

### Closure invariants

For a completed linked issue N:

1. `kaola-workflow/.roadmap/issue-N.md` is absent.
2. Generated `kaola-workflow/ROADMAP.md` does not list `#N` as active work.
3. `kaola-workflow/{project}/` is absent from active folders.
4. `kaola-workflow/archive/{project}/workflow-state.md` exists with `status: closed` and `step: complete` when local archive is available.
5. The remote issue is closed only after acceptance criteria pass and implementation is published.
6. The remote issue does not have `workflow:in-progress` after closure.
7. Any branch/worktree cleanup is either complete or explicitly reported by stale-worktree tooling.

**Keep-open inversion (issue #336).** A tenth invariant, `keep-open-roadmap-preserved`, applies ONLY when the receipt carries `remote_issue_closed: kept_open` (a keep-open partial-close finalize). On a keep-open run, `checkClosureInvariants` REPLACES invariants 1 and 2 with their inverse: `kaola-workflow/.roadmap/issue-N.md` MUST be preserved and the regenerated `ROADMAP.md` MUST still list `#N`. A missing source or a mirror that dropped `#N` is the violation. Invariants 3, 4, 6, 7 apply unchanged (the project folder is still archived `status: closed`; only the issue-close step differs).

**WARN-FIRST detection invariants (issue #277 M2):** The following two invariants are recorded in the receipt but do NOT affect `closure_invariants.ok`. Missing attestation adds a warning and sets the receipt field to `missing`; it never blocks closure. The detector is log-gated: if no `dispatch-log.jsonl` is found in the project `.cache/`, both fields are set to `missing` and a warning `'attestation: dispatch-log not found (SubagentStart hook not installed) — detector inactive'` is added — closure is not blocked.

8. `claim-planner-attested` — A workflow-planner subagent spawn is recorded in the dispatch log (`.cache/dispatch-log.jsonl`) BEFORE the plan was frozen.
9. `finalize-contractor-attested` — A contractor subagent spawn is recorded in the dispatch log during the finalize window.

**Dual-root producer + contractor self-attest (issue #338).** The dispatch-log producer
(`hooks/kaola-workflow-subagent-dispatch-log.sh`) resolves BOTH the hook's own cwd toplevel and
the dispatched agent's `cwd` (`AGENT_CWD`) toplevel, appending to each distinct active project —
so a contractor dispatched into a linked **worktree** is logged where `cmdFinalize` (run in the
worktree) reads its `.cache/`. In-place runs are unchanged (one root, one append). Independently,
`cmdFinalize --attest-contractor-spawn` back-fills a `contractor`/`finalize-backfill` entry into
the archived `.cache/dispatch-log.jsonl` (mirror of the `--attest-planner-spawn` flag at the
claim seam); the contractor profile's Step 8b passes it so `finalize_contractor_attested` reads
`attested` even on hookless harnesses. The flag is gated: an inline main-session finalize that
omits it still reads `missing` (the inline-bypass detector fires). On a **pr** sink the contractor
skips Step 8b, so a pr-sink receipt may legitimately read `missing` — expected and non-blocking
(warn-first). The flag was added ONLY to the contractor seam in the gitlab/gitea claim ports; the
planner-flag parity gap in those ports is a separate follow-up.

### Closure receipt schema

The closure receipt is an auditable record of every closure step. Field names
and enum values are exported from `scripts/kaola-workflow-closure-contract.js`
as `CLOSURE_RECEIPT_FIELDS`; `emptyReceipt(project, issueNumber)` returns a
receipt with every status field defaulted to `failed` (fail-loud: an
unpopulated receipt reads as total failure, never silent success) and
`warnings` empty.

```json
{
  "project": "issue-N",
  "issue_number": "N",
  "archive": "closed|abandoned|skipped|failed",
  "anchored_root": "/absolute/path/to/main/root",
  "roadmap_source_removed": "removed|absent|kept|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "roadmap_removed": {
    "/path/to/main/root": ["issue-42.md"],
    "/path/to/worktree/root": ["issue-42.md"]
  },
  "roadmap_residue": [],
  "remote_issue_closed": "closed|already_closed|kept_open|partial|close_pending|skipped_offline|failed",
  "closure": {
    "attempted": [],
    "closed": [],
    "failed": [],
    "skipped_offline": [],
    "kept_open": []
  },
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "worktree_removed": "removed|missing|kept|failed",
  "branch_removed": "removed|kept|failed",
  "claim_planner_attested": "attested|missing|failed",
  "finalize_contractor_attested": "attested|missing|failed",
  "warnings": []
}
```

**New receipt fields (issue #426/#427/#428):**

- `anchored_root` (string) — the resolved main root path at finalize time. Absent on single-root (non-worktree) runs where the resolution is trivial. Added by issue #426 (copy-then-verify-then-delete); see D-426-01.
- `roadmap_removed` (object) — per-root map of `.roadmap/issue-*.md` filenames removed during finalization. Keys are absolute root paths; values are filename arrays. Present on worktree runs with dual-root cleanup (issue #428). Single-root runs carry one key. Added by issue #428; see D-428-01.
- `roadmap_residue` (array of string) — absolute paths of `.roadmap/issue-*.md` sources that could NOT be removed during finalization. Empty on a clean close; non-empty is a `roadmap-residue-clean` invariant violation. Added by issue #428; see D-428-01.
- `closure` (object) — per-issue-close audit record. Added by issue #427; see D-427-01. All five sub-fields are arrays of issue numbers:
  - `attempted` — issue numbers for which a close was attempted.
  - `closed` — issue numbers successfully closed by this caller.
  - `failed` — issue numbers whose close call failed.
  - `skipped_offline` — issue numbers skipped because `KAOLA_WORKFLOW_OFFLINE=1`.
  - `kept_open` — issue numbers skipped because `keepIssueOpen` was requested.

**Pre-sink close-pending qualifier (issue #396, D2).** `cmdFinalize` runs BEFORE `sink-merge` closes the members, so on a NORMAL online finalize the member(s) are not yet closed — but not because of a partial FAILURE. Two builder fields disambiguate this from a real partial close:

- `remote_issue_closed: close_pending` — the truthful ONLINE token for "online, the close happens at sink" (the scalar path previously lied `skipped_offline` while online; #396.2). `already_closed` still wins when the issue is already closed on the forge.
- `close_disposition: close_pending` — set ONLY by `cmdFinalize` on the merge lane. `checkClosureInvariants` SKIPS the `remote-members-closed` invariant when this is `close_pending` (the members WILL close at sink), defusing the pre-sink alarm that fired on every happy-path bundle finalize (#396.4). `sink-merge` / `watch-pr` (post-sink) leave `close_disposition` unset, so the invariant fires there truthfully on a genuine partial close.
- `keep_open_requested: true|false` — records the keep-open INTENT. `checkClosureInvariants` keys the keep-open inversion on this recorded intent, NOT on the mutable `remote_issue_closed` token (which flips to `already_closed` when the issue was auto-closed on the forge, wrongly flipping the checker into the close branch; #396.3).

**Opt-in exit gate (issue #395.5, D1).** `cmdFinalize` always emits the receipt JSON and exits 0 by default (the contractor choreography + tests read the JSON, not `$?`). Pass `--strict` to additionally make the exit code reflect the invariant verdict: **exit 4** when `closure_invariants.ok === false`. No existing caller passes `--strict`, so the default behavior is byte-compatible.

**Durable-state field guards (issue #398).** `writeState` / `patch-branch` refuse a newline/CR in any durable field value (typed throw — a `branch: $'main\nworktree_path: /tmp/EVIL'` would otherwise inject a forged field). Branch creation sites (`provisionWorktree`, the in-place `checkout -b`, `patch-branch`) guard the branch with `assertSafeBranchArg` (throws on a `-`-leading / NUL / newline branch) — not just `removeBranch` at teardown. A raw worktree error is collapsed to one line and accompanied by a classified `worktree_error_class` token (#403.8).

**Keep-open partial-close lane (issue #336).** When the `## Sink` block carries `issue_action: comment_keep_open` (written by the main session at the Closure Decision Gate, default when absent: `close`), `cmdFinalize --keep-issue-open` and `sink-merge --keep-issue-open` run the keep-open terminal:

- `remote_issue_closed` records the decision token `kept_open` (also under OFFLINE — the keep-open decision is local and known, and `checkClosureInvariants` keys on it). Truth still wins: when online and the issue is ALREADY closed on the forge, `cmdFinalize` records `already_closed` and pushes a warning. `sink-merge` posts a mechanical keep-open comment (no `close/fix/resolve #N` substring) instead of closing; the claim label is still removed in BOTH modes.
- `roadmap_source_removed` records `kept` — `archiveProjectDir` skips the `.roadmap/issue-N.md` unlink, and `ROADMAP.md` is regenerated still listing `#N` (the `keep-open-roadmap-preserved` invariant enforces it). The closure-audit `archive_closed` stale-source class EXCLUDES a `status: closed` archive that carries `issue_action: comment_keep_open`, so a later `--execute` never deletes the preserved source; `closed_remote` still reaps a genuinely-closed issue.

**Keep-open is merge-sink-only.** A PR/MR sink would auto-close the kept-open issue via its hard-coded `Closes #N` body, and `watch-pr`/`watch-mr`'s archive-on-merge (`archiveProjectDir 'closed'` with no `keepRoadmapSource`) would delete the preserved source. This is fenced at THREE layers: (1) the finalize prose refuses a non-merge sink under keep-open before the case statement; (2) on `sink-merge` exit 3 (merge-impossible) the in-arm PR/MR auto-pivot is a typed BLOCKED refusal requiring manual remediation of the merge blocker — never an auto-pivot to a `Closes #N` sink; (3) `sink-pr.js`/`sink-mr.js` themselves refuse (typed `merge-sink-only` assert) when the live OR archived state carries `issue_action: comment_keep_open`. `sink-merge` also re-reads the archived state and honors `issue_action: comment_keep_open` even if `--keep-issue-open` was not passed (defense-in-depth against the one irreversible step).

**Bundle projects — additive receipt fields (issue #328):** On a bundle project, three additional fields are attached to the closure receipt AFTER `buildClosureReceipt()` returns. They are absent on single-issue receipts.

```json
{
  "closed_issues": [42, 47, 53],
  "failed_issue_closures": [],
  "open_issues": [],
  "roadmap_sources_removed": ["issue-42.md", "issue-47.md", "issue-53.md"]
}
```

- `closed_issues` — issue numbers successfully closed (or already closed) on the forge.
- `failed_issue_closures` — issue numbers whose remote close call failed online.
- `open_issues` (#369) — issue numbers probed STILL OPEN while online. Every bundle member lands in
  EXACTLY one of these three arrays (no silent-neither); `sink-merge` closes every member on the
  success path, so a member here means the close did not complete.
- `roadmap_sources_removed` — `.roadmap/issue-N.md` filenames removed during finalization (one per issue in the bundle).
- `remote_issue_closed` for a bundle is `closed` (all members closed) or `partial` (#369: some member
  failed/open) when ONLINE — never `skipped_offline`, which is the offline-only token. A `partial`
  close trips the `remote-members-closed` closure invariant (warn-first-but-VISIBLE), so a partial
  bundle close is never reported as a clean success.

`claim_planner_attested` and `finalize_contractor_attested` are WARN-FIRST detection fields (issue #277 M2). Both default to `'failed'` in `emptyReceipt()`. `checkDispatchAttestations` (called from the closure path in `kaola-workflow-claim.js`) reads `.cache/dispatch-log.jsonl`, sets each field to `attested` or `missing`, and pushes any warnings. It never modifies `closure_invariants.violations` — missing attestation is advisory only.

Offline behavior is explicit: local invariants (1-4) are always checked; remote
actions (`remote_issue_closed`, `claim_label_removed`) record `skipped_offline`
under `KAOLA_WORKFLOW_OFFLINE=1` rather than `failed`.

### `buildClosureReceipt()` helper (issue #164)

`buildClosureReceipt(project, issueNumber, steps)` is the single mapping point
that every closure path uses to produce a receipt. It is exported from each
forge's claim module (`kaola-workflow-claim.js`, `kaola-gitlab-workflow-claim.js`,
`kaola-gitea-workflow-claim.js`).

1. Seeds the receipt with `emptyReceipt(project, issueNumber)` (every status
   field defaults to `failed`).
2. Overwrites only fields present in `steps` that are valid
   `CLOSURE_RECEIPT_FIELDS`.
3. Appends any `steps.warnings` entries to `receipt.warnings`.

Because seeding is fail-loud, a step the caller never reports stays `failed` —
the receipt can never read as silent success. `sink-merge` reaches the helper
through its existing `require('./kaola-workflow-claim.js')` (no circular
dependency), and the byte-identical Codex copy carries the same export.

### `cmdFinalize` output (issue #162)

`cmdFinalize` emits a JSON result that includes receipt fields populated by
`archiveProjectDir()`. Fields are written before any potential failure so the
record is never silent on partial runs:

```json
{
  "roadmap_source_removed": "removed|absent|kept|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "closure_invariants": {
    "ok": true,
    "violations": []
  }
}
```

`closure_invariants` checks six invariants at closure time (issue #164 adds the
last three local checks; the signature is now `checkClosureInvariants(root,
receipt, archiveDest)`):

- `roadmap-source-absent` — `kaola-workflow/.roadmap/issue-N.md` is gone after cleanup. On a keep-open run (`remote_issue_closed: kept_open`, issue #336) this is REPLACED by `keep-open-roadmap-preserved` — the source MUST survive and `ROADMAP.md` MUST still list `#N`.
- `roadmap-mirror-clean` — generated `kaola-workflow/ROADMAP.md` no longer lists `#N` as active work (row-anchored, issue #339: only an active table row `| #N | …` at line start violates; cross-references to `#N` inside other rows are allowed after closure). Also REPLACED by `keep-open-roadmap-preserved` on a keep-open run.
- `roadmap-residue-clean` (issue #428) — `roadmap_residue` is empty after `reconcileRoadmapForClosure` runs. A non-empty residue means a `.roadmap/issue-*.md` source survived finalization in one of the cleaned roots (main or worktree). Applies to linked worktree runs where dual-root cleanup is performed; on single-root runs the residue check still applies but the residue can only originate from the one root.
- `in-progress-label-removed` — `workflow:in-progress` label was removed from the remote issue. Skipped (not violated) when `KAOLA_WORKFLOW_OFFLINE=1` or when `claim_label_removed` is `'skipped_offline'`.
- `active-folder-absent` — no live `kaola-workflow/{project}/` folder remains in active folders after archive (issue #164).
- `archive-state-closed` — when `archiveDest` is provided, the archived `workflow-state.md` shows `status: closed` or `abandoned`; skipped (not violated) when `archiveDest` is absent (issue #164).
- `branch-worktree-resolved` — neither `worktree_removed` nor `branch_removed` is `failed` (issue #164).
- `remote-members-closed` (#369) — for a bundle, every member of `issue_numbers` is closed; a member
  left in `failed_issue_closures` or `open_issues` (recorded while online) is a violation (warn-first
  but VISIBLE: `closure_invariants.ok` becomes `false`). Never fires for single-issue receipts (which
  carry neither array).

The `remote-closed-after-publish` invariant (closure invariant 5) is intentionally
deferred to issue #165, where the `remote_issue_closed` field is unified across
all paths.

`ok` is `true` only when `violations` is empty. When `archiveProjectDir()` cannot
complete a receipt step, `cmdWatchPr`/`cmdWatchMr` surface the failure via a
`warnings` array in their JSON output rather than swallowing the error silently.

`cmdFinalize` output now includes `claim_label_removed` (issue #163):

```json
{
  "roadmap_source_removed": "removed|absent|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "claim_label_removed": "removed|skipped_offline|failed",
  "closure_invariants": {
    "ok": true,
    "violations": []
  }
}
```

`cmdFinalize` output also includes `archive_state_stamped` and `issue_disposition` (issue #333):

```json
{
  "archive_state_stamped": "not_needed|repaired|failed",
  "issue_disposition": "kept-open|close-pending|closed|unknown"
}
```

`archive_state_stamped` reports the manual-archive backstop: `repaired` when `cmdFinalize` healed a state that had been archived MANUALLY (live folder absent, `status: active` in the archive — a `mv`/`git mv` that bypassed `archiveProjectDir`) by stamping it terminal in place; `not_needed` when no manual archive needed healing (the normal lane, or an already-terminal archive on re-run); `failed` on a swallowed error. `issue_disposition` records the issue's terminal disposition: on `cmdFinalize` it is DECISION-derived — `kept-open` under `--keep-open`, otherwise `closed` if the remote probe already observed the issue closed (a finalize re-run after sink-merge), else `close-pending` (the default merge lane — the orchestrator closes the issue AFTER sink-merge, so `cmdFinalize` never asserts a false `closed`). On the `cmdWatchPr`/`cmdWatchMr` MERGED lane the disposition (recorded only in the archived state's `## Closure` block, not the JSON receipt) is OBSERVATION-derived via `probeIssueState`: `closed` when the issue is observed closed, `kept-open` when observed open (a merged PR/MR with no close keyword), `unknown` when the probe is unavailable. On that lane the receipt's `remote_issue_closed` is likewise probe-informed (`already_closed` vs `skipped_offline`, both existing enum values — no closure-contract change). The archived `workflow-state.md` carries the same `issue_disposition` plus `archived_at`/`claim_label_removed`/`worktree_removed`/`closure_invariants` in a `## Closure` block; the closure receipt schema itself is unchanged.

`cmdWatchPr`/`cmdWatchMr` emit a `cleanups` array with per-folder `claim_label_removed` status when label cleanup is attempted. As of issue #164 each entry also carries the full per-folder `receipt` (built via `buildClosureReceipt`) and its `closure_invariants`:

```json
{
  "watched": 1,
  "cleanups": [{
    "folder": "issue-N",
    "claim_label_removed": "removed",
    "receipt": {
      "project": "issue-N",
      "issue_number": "N",
      "archive": "closed",
      "roadmap_source_removed": "removed",
      "roadmap_regenerated": "regenerated",
      "remote_issue_closed": "skipped_offline",
      "claim_label_removed": "removed",
      "worktree_removed": "removed",
      "branch_removed": "kept",
      "warnings": []
    },
    "closure_invariants": { "ok": true, "violations": [] }
  }]
}
```

The `cleanups[]` and `warnings[]` keys are preserved for backward compatibility;
the `receipt` and `closure_invariants` fields are additive.

### `sink-merge` closure receipt (issue #164)

On a successful direct merge, `sink-merge` (all forges) emits a closure receipt
to stdout after branch cleanup. `sink-merge` is the only path that sets
`remote_issue_closed: 'closed'` and `branch_removed: 'removed'` — it owns the
remote-issue-close and branch-delete steps. `cmdFinalize` and the watchers set
`branch_removed: 'kept'`. The emitted JSON:

```json
{
  "status": "merged",
  "closure_receipt": {
    "project": "issue-N",
    "issue_number": "N",
    "archive": "closed",
    "roadmap_source_removed": "absent",
    "roadmap_regenerated": "skipped",
    "remote_issue_closed": "closed",
    "claim_label_removed": "removed",
    "worktree_removed": "removed",
    "branch_removed": "removed",
    "warnings": []
  },
  "closure_invariants": { "ok": true, "violations": [] }
}
```

`sink-merge` derives `archive`/`roadmap_source_removed` by probing
post-conditions (finalize already archived); `roadmap_regenerated` is `skipped`
because `sink-merge` does not regenerate the mirror. The exit-3
merge-impossible fallback returns before any receipt is emitted; when the
project was already archived before the failed push, `postMergeCleanup` skips
the `.cache/sink-fallback.json` receipt write entirely (issue #216 guard). `sink-merge`'s `ghExec` now honors `KAOLA_GH_MOCK_SCRIPT`, matching
`claim.js`, so the receipt path is testable without a live `gh` CLI.

`sink-merge --keep-issue-open` (issue #336, requires `--issue`) runs the keep-open Step 8: it posts a mechanical keep-open comment instead of closing, records `remote_issue_closed: kept_open` and `roadmap_source_removed: kept` (the source survives), and still removes the claim label. It also re-reads the archived `workflow-state.md` and honors `issue_action: comment_keep_open` even if the flag was not passed (defense-in-depth — an accidental close is the one irreversible step). Everything else — Step 0 worktree removal, rebase, FF-merge loop, push, Step 9 branch deletion, attestation, invariants — is shared and unchanged, which is what eliminates the manual FF-push/worktree/branch cleanup a keep-open run previously needed.

**`sink:pr` deferral**: `cmdSinkPr` does not emit a closure receipt — it leaves
the active folder open. The authoritative closure receipt for a `sink:pr`
project is emitted by `cmdWatchPr`/`cmdWatchMr` when the PR/MR merges. This is
documented behavior, not a gap; no schema change is needed.

### `audit-labels` and `repair-labels` (issue #163; GitLab port #166, Gitea port #167)

Two subcommands find and fix closed issues that still carry `workflow:in-progress`.

**`audit-labels`** — scan-only, emits JSON:
```json
{ "stale": [{ "number": 127, "title": "...", "url": "..." }], "count": 1 }
```

**`repair-labels`** — dry-run by default, `--execute` performs removal:
```bash
# dry-run (default): shows what would be removed
node scripts/kaola-workflow-claim.js repair-labels

# execute: removes stale labels from all matching closed issues
node scripts/kaola-workflow-claim.js repair-labels --execute
```

Dry-run output:
```json
{ "dry_run": true, "would_remove": [{ "number": 127, "title": "...", "url": "..." }] }
```

Execute output:
```json
{ "dry_run": false, "removed": [127], "failed": [] }
```

GitLab and Gitea expose the same `audit-labels`/`repair-labels` subcommands at full parity, routed through `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` respectively. The JSON shape is identical; the only forge difference is that the issue `url` field is sourced from each forge's `web_url`. (Receipt wiring — `clearAdvisoryClaim` returning the status enum and `cmdFinalize`/watch commands emitting `claim_label_removed` — is shared across all three forges.)

### Closure audit and repair (issue #165; GitLab port #166; Gitea port #167)

#### Script: `kaola-workflow-closure-audit.js`

A single command that reports **closure drift** — completed work that still
shows as active — across local roadmap sources, the generated `ROADMAP.md`,
active folders, archive state, remote issue state, and the
`workflow:in-progress` label. It is a dedicated script (invoked directly, like
`sink-merge`), not a `claim.js` subcommand:

```bash
# dry-run (default): report drift as JSON, change nothing
node scripts/kaola-workflow-closure-audit.js

# execute: repair safe local drift + remove stale labels on closed issues
node scripts/kaola-workflow-closure-audit.js --execute
```

**Drift classes reported:**

| Key | Meaning |
|-----|---------|
| `stale_roadmap_sources` | `.roadmap/issue-N.md` exists for a closed issue. `reason` is `closed_remote` (issue N is closed on the forge) or `archive_closed` (an archive `workflow-state.md` says `status: closed` but the source survives). `closed_remote` wins when both apply. |
| `mirror_lists_closed_issues` | Generated `ROADMAP.md` still lists a closed issue (derived from the same closed set). |
| `stale_in_progress_labels` | Closed remote issues that still carry `workflow:in-progress`. |
| `active_folder_for_closed_issue` | An active `kaola-workflow/{project}/` folder whose linked issue is closed. `dirty` flags uncommitted content. **Report-only.** |
| `unarchived_pr_folders` | An active `sink: pr` folder whose PR is `MERGED`/`CLOSED` but was never archived (the watcher never ran). **Report-only.** |
| `unresolved_closed_state` | (omitted when empty) Issue numbers for which the closed state could not be determined because the remote state check timed out or failed (e.g. auth/rate-limit/network error) (issue #178, broadened in #184). Present in both `drift` and `counts` sections. |

**Dry-run output** (default):
```json
{
  "dry_run": true,
  "offline": false,
  "drift": {
    "stale_roadmap_sources": [{ "issue_number": 127, "file": "kaola-workflow/.roadmap/issue-127.md", "reason": "closed_remote" }],
    "mirror_lists_closed_issues": [127],
    "stale_in_progress_labels": [{ "number": 127, "title": "...", "url": "..." }],
    "active_folder_for_closed_issue": [{ "project": "issue-150", "issue_number": 150, "dirty": false }],
    "unarchived_pr_folders": [{ "project": "issue-152", "issue_number": 152, "pr_url": "...", "pr_state": "MERGED" }],
    "unresolved_closed_state": [128, 129]
  },
  "counts": { "stale_roadmap_sources": 1, "mirror_lists_closed_issues": 1, "stale_in_progress_labels": 1, "active_folder_for_closed_issue": 1, "unarchived_pr_folders": 1, "unresolved_closed_state": 2 }
}
```

**Execute output** (`--execute`):
```json
{
  "dry_run": false,
  "offline": false,
  "repaired": { "roadmap_sources_removed": [127], "roadmap_regenerated": true, "labels_removed": [127], "labels_failed": [], "labels_skipped_reason": "timeout" },
  "reported_not_repaired": { "active_folder_for_closed_issue": [...], "unarchived_pr_folders": [...] }
}
```

Field notes:
- `labels_skipped_reason` is present when label removal does not complete: `"timeout"` (repair-phase API call times out, issue #178), `"detection_timeout"` (stale-label DETECTION phase timed out, so the repair loop never ran; issue #184), `"offline"` (KAOLA_WORKFLOW_OFFLINE=1), or other reasons. Omitted when `labels_removed` array contains all attempted removals.

**Safe-repair boundary.** `--execute` only ever (1) deletes stale
`.roadmap/issue-N.md` sources, (2) regenerates `ROADMAP.md`, and (3) removes
`workflow:in-progress` from closed issues when online. It **never** deletes
active folders or worktrees. Classes `active_folder_for_closed_issue` and
`unarchived_pr_folders` are carried verbatim into `reported_not_repaired` in
both modes — they may hold un-finalized work, so they are surfaced for a human
(use `finalize`/`release`, or run `watch-pr` for the PR case).

**Offline behavior** (`KAOLA_WORKFLOW_OFFLINE=1`). Local-only classes still run
(`stale_roadmap_sources` via `archive_closed`, `active_folder_for_closed_issue`).
Remote-dependent classes (`stale_in_progress_labels`, `unarchived_pr_folders`)
report the string `"skipped_offline"` rather than an array, and `--execute`
performs no remote label removal. A non-offline `gh` failure reports an empty
array plus a stderr warning — it is never silently downgraded to `skipped_offline`.

**Timeout behavior** (issue #178). When `KAOLA_GH_REMOTE_TIMEOUT_MS` is set and
a remote call times out, `detectStaleLabels` and `detectUnarchivedPrFolders`/
`detectUnarchivedMrFolders` return the string `"skipped_timeout"` rather than an
array. In `--execute`, if a label removal times out mid-loop, the repair loop
breaks immediately and `labels_skipped_reason: "timeout"` is set on the repair
record; a DETECTION-phase timeout instead yields `labels_skipped_reason:
"detection_timeout"` (issue #184). `unresolved_closed_state` is populated with
issue numbers whose closed state could not be determined because the remote
check timed out or failed (e.g. auth/rate-limit/network error; broadened in
issue #184).

#### How this differs from `stale-worktree-check` / `stale-worktree-cleanup`

These cover **disjoint** drift surfaces and are intentionally separate commands:

| | `closure-audit` | `stale-worktree-check` / `-cleanup` |
|---|---|---|
| **Surface** | Roadmap sources, `ROADMAP.md`, active folders, archive state, remote issue state, advisory labels (closure invariants 1, 2, 3, 5, 6) | Git worktrees and branches (closure invariant 7) |
| **Question answered** | "Is finished work still showing as active in local roadmap/folders or as advisory remote state?" | "Are there leftover Git worktrees/branches for closed/archived issues?" |
| **`--execute` repairs** | Stale `.roadmap` sources + regenerate `ROADMAP.md` + remove stale `workflow:in-progress` labels | Removes Git worktrees and deletes local branches (with `--archive`/`--export`/`--force` for dirty worktrees) |
| **Never touches** | Worktrees, branches, **active folders** | Roadmap sources, `ROADMAP.md`, labels, archive folders |

Run both for full closure-drift coverage: `closure-audit` owns roadmap/label/folder
drift; `stale-worktree-check`/`-cleanup` owns worktree/branch drift. `closure-audit`
deliberately **reports but never removes** active folders and unarchived PR folders,
delegating worktree/branch teardown to `stale-worktree-cleanup` and folder teardown
to `finalize`/`release`/`watch-pr`.

#### GitLab edition (issue #166)

The GitLab edition ships `kaola-gitlab-workflow-closure-audit.js` with the same
contract and JSON shape, routing all remote calls through `kaola-gitlab-forge.js`
instead of raw `gh`:

```bash
node ~/.claude/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js
node ~/.claude/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js --execute
```

MR substitutions: the `unarchived_pr_folders` class becomes `unarchived_mr_folders`
with item fields `mr_url`/`mr_state`, gated on `sink: mr` folders. MR state is
matched against the **lowercase** `merged`/`closed` values returned by
`forge.viewMergeRequest` (GitLab normalizes state to lowercase, unlike GitHub's
uppercase `gh pr view`). `--execute` removes `workflow:in-progress` via
`forge.updateIssue(iid, { unlabels })`. Offline behavior, the safe-repair
boundary, and report-only classes are identical to the GitHub edition. The
`audit-labels`/`repair-labels` subcommands are available at parity on this edition
via `kaola-gitlab-workflow-claim.js` (see the label-audit/repair note above).

#### Gitea edition (issue #167)

The Gitea edition ships `kaola-gitea-workflow-closure-audit.js` with the same
contract and JSON shape, routing all remote calls through `kaola-gitea-forge.js`
instead of raw `gh`:

```bash
node ~/.claude/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js
node ~/.claude/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js --execute
```

Gitea keeps the GitHub `unarchived_pr_folders` class and its `pr_url`/`pr_state`
item fields, gated on `sink: pr` folders. As with the GitLab edition, PR state is
matched against the **lowercase** `merged`/`closed` values returned by
`forge.viewPullRequest` (Gitea normalizes state to lowercase, unlike GitHub's
uppercase `gh pr view`); `forge.viewPullRequest` takes a PR number, so the folder's
`pr_url` is resolved to a number first. `--execute` removes `workflow:in-progress`
via `forge.updateIssueLabels(project, n, { remove })`. Offline behavior, the
safe-repair boundary, and report-only classes are identical to the GitHub edition.
The `audit-labels`/`repair-labels` subcommands are available at parity on this
edition via `kaola-gitea-workflow-claim.js` (see the label-audit/repair note above).

### Flow mapping

Existing closure code is mapped to the contract below. This issue documents the
mapping; it does not change any runtime path. Cross-forge parity gaps are named
here and deferred to the listed follow-up issues.

| Closure surface | Invariants covered | Current behavior | Follow-up |
|-----------------|--------------------|------------------|-----------|
| `cmdFinalize` / `archiveProjectDir` | 1, 2, 3, 4 | **Shipped (#164)**: Seeds full receipt via `buildClosureReceipt`; output includes `closure_receipt` plus `closure_invariants` (6 checks); `worktree_removed` captured, `branch_removed: 'kept'`. `removeLegacyStateBlocks` runs on GitHub but is missing from GitLab/Gitea `archiveProjectDir`. | ~~#162~~ ~~#164~~ |
| `sink-merge` (all forges) | 1, 2, 3, 4, 6, 7 | **Shipped (#164)**: Runs `checkClosureInvariants` and emits `closure_receipt` + `closure_invariants` on successful merge; the only path that sets `remote_issue_closed: 'closed'` and `branch_removed: 'removed'`; `ghExec` honors `KAOLA_GH_MOCK_SCRIPT`. Remote-close *assertion* (invariant 5) deferred to #165. | ~~#163~~ ~~#164~~, #165 |
| `sink-pr` / PR-MR fallback | 3, 5 | `cmdSinkPr` leaves the active folder open until `watch-pr`/`watch-mr`; closure receipt is emitted by the watcher at merge (documented deferral, #164). `cmdSinkFallback` live-folder guard checks archive on GitLab/Gitea but GitHub misses that archive check. | ~~#164~~ |
| `watch-pr` / `watch-mr` | 1, 2, 3, 4, 6, 7 | **Shipped (#164)**: Per-folder `receipt` + `closure_invariants` attached to each `cleanups[]` entry on MERGED; `cleanups[]`/`warnings[]` preserved. Closure can still be delayed if the watcher never runs (drift detection → #165). | ~~#164~~, #165 |
| `clearAdvisoryClaim` (label cleanup) | 6 | **Shipped (#163)**: Returns `'removed'`/`'skipped_offline'`/`'failed'`; callers capture result into `claim_label_removed` receipt field. `cmdFinalize` has null-folder fallback reading issue number from archive path. `cmdWatchPr`/`cmdWatchMr` emit `cleanups[]`. All forges expose `audit-labels`/`repair-labels` subcommands for stale-label repair (GitLab #166 / Gitea #167). | |
| `stale-worktree-check` / `stale-worktree-cleanup` | 7 | Reports/removes stale worktrees and branches; relied on for invariant 7's "explicitly reported" clause. Complemented by `closure-audit` (#165), which covers the roadmap/label/folder drift surface (invariants 1, 2, 3, 5, 6) and explicitly defers worktree/branch teardown here. | ~~#165~~ |
| `closure-audit` (GitHub, #165) | 1, 2, 3, 5, 6 | **Shipped (#165)**: dedicated `kaola-workflow-closure-audit.js` reports stale roadmap sources, mirror-listed closed issues, stale in-progress labels, active folders for closed issues, and unarchived PR folders; `--execute` repairs the safe local roadmap/label classes only. Report-only for folders/PR drift. GitLab port shipped (#166, `unarchived_mr_folders`); Gitea port shipped (#167, `kaola-gitea-workflow-closure-audit.js`, keeps `unarchived_pr_folders`). | ~~#166~~ ~~#167~~ |

### Follow-up scope

This issue ships the contract and the machine-readable schema only. Enforcement
and repair are decomposed into:

- #162 — Make roadmap source cleanup mandatory after issue closure (invariants 1, 2). **Shipped**: `archiveProjectDir()` now populates explicit receipt fields (`roadmap_source_removed`, `roadmap_regenerated`); `cmdFinalize` output includes these fields plus `closure_invariants`; `cmdWatchPr`/`cmdWatchMr` emit `warnings` on receipt failures.
- #163 — Guarantee `workflow:in-progress` label cleanup for closed issues (invariant 6). **Shipped**: `clearAdvisoryClaim()` now returns `'removed'`/`'skipped_offline'`/`'failed'`; `cmdFinalize` and watch commands emit `claim_label_removed`; `checkClosureInvariants` checks the `in-progress-label-removed` invariant (skips when offline); `audit-labels`/`repair-labels` subcommands for stale-label repair (GitHub at #163; GitLab/Gitea parity in #166/#167).
- #164 — Unify closure execution behind a shared closure receipt (invariants 1-4, 6, 7). **Shipped**: `buildClosureReceipt()` helper seeds `emptyReceipt()` across all four forge trees; `cmdFinalize`, `cmdWatchPr`/`cmdWatchMr`, and `sink-merge` all emit `closure_receipt` + `closure_invariants`; `checkClosureInvariants` extended with `active-folder-absent`, `archive-state-closed`, `branch-worktree-resolved`; `sink-merge` `ghExec` honors `KAOLA_GH_MOCK_SCRIPT`. Invariant 5 (`remote-closed-after-publish`) and `sink:pr` deferral remain documented-only, deferred to #165.
- #165 — Add closure audit and repair command for stale completed work (drift detection + repair). **Shipped (GitHub edition)**: new dedicated script `kaola-workflow-closure-audit.js` reports six closure-drift classes (invariants 1, 2, 3, 5, 6) and, with `--execute`, removes stale `.roadmap` sources + regenerates `ROADMAP.md` + removes stale `workflow:in-progress` labels. Report-only for active folders and unarchived PR folders. GitLab port shipped (#166) as `kaola-gitlab-workflow-closure-audit.js` (`unarchived_mr_folders`, lowercase MR state, forge-routed); Gitea port shipped (#167) as `kaola-gitea-workflow-closure-audit.js` (keeps `unarchived_pr_folders`, lowercase PR state, forge-routed). Cross-forge closure-audit coverage is now complete.
