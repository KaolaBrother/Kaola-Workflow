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

### Verdict: `target_indeterminate` (issue #495)

- **Returned when**: The classifier subprocess spawned by `classifyIssue` in `claim.js` faults transiently (spawn error, signal kill, or timeout) and the fault persists through **all 3 attempts** (1 original + up to 2 retries). A clean non-zero exit from the subprocess is **not** retried — it is determinate (`target_unavailable`). `status === 2` from the subprocess means an active folder already exists and is returned immediately as `owned`, never reaching retry.
- **Applies to**: `cmdStartup --target-issue N` and `cmdPickNext` (single-issue path only; see `target_set_indeterminate` for the bundle path)
- **Distinct from**: `target_unavailable` (determinate: the classifier subprocess ran and made a decision — forge unreachable, or classifier exited non-zero); `target_unverified` (determinate: offline + no local evidence)
- **`result` field**: `result: 'escalate'` — this is the only single-issue startup verdict that carries `result: escalate`. The determinate forge-unreachable verdict `target_unavailable` carries `result: 'refuse'`. Other determinate verdicts (`user_target_red`, `target_unverified`, etc.) do not carry a `result` field on the pre-#495 paths.
- **Agent routing**: On `result: 'escalate'`, **pause and ask the user** whether to retry or abort. This is the front-door analog of the consent valve (#44/#287) — at claim time no plan or ledger exists, so there is no adaptive-node write-halt ledger marker; the escalation is a plain consent-halt asking a human to decide whether the transient fault has cleared.
- **Impact**: No active folder is created; `claim: 'none'`; exit non-zero. The `reasoning` field names the error code and signal from the final failed attempt. The `reasoning_class` field is `'classifier_error'`.
- **On `result: 'refuse'`**: Hard stop — do not retry; diagnose the underlying condition named by `reasoning`.

### Bundle claim: `--target-issues` / `KAOLA_TARGET_ISSUES` (issue #328)

The startup/claim path accepts a multi-issue bundle target alongside the existing single-issue `--target-issue N` flag.

**CLI flag:** `--target-issues A,B,C` (comma-separated; sorted and deduped before validation).

**Env var:** `KAOLA_TARGET_ISSUES=A,B,C` — equivalent to the flag; resolved before flag parsing.

**Ambiguity gate (`target_ambiguity`):** If both `--target-issue` (or `KAOLA_TARGET_ISSUE`) and `--target-issues` (or `KAOLA_TARGET_ISSUES`) resolve to non-empty values simultaneously, `cmdStartup` refuses with `target_ambiguity` before any state is written. This gate fires regardless of which combination of flag vs env-var is used.

**`result` field on bundle startup refusals (issue #495):** Determinate failure verdicts (`target_set_unavailable`, `target_set_red`, `target_set_conflicts_active_work`, `target_set_has_closed_issue`) carry `result: 'refuse'` — hard stop, do not retry. The new indeterminate verdict `target_set_indeterminate` carries `result: 'escalate'` — pause and ask the user whether to retry or abort (same consent-halt posture as the single-issue `target_indeterminate` path). Pre-#495 verdicts (e.g. `target_set_unverified`, `target_set_empty`, early validation gates) do not carry a `result` field and remain unchanged.

**Typed refusal codes** returned by `claimExplicitBundle` (all exit non-zero; no mutation on refusal):

| Code | `result` field | Condition |
|------|----------------|-----------|
| `target_ambiguity` | — | Both scalar and multi-target provided simultaneously |
| `target_set_empty` | — | Resolved issue list is empty after sort+dedup |
| `target_set_too_large` | — | Bundle size exceeds `KAOLA_BUNDLE_MAX_ISSUES` (default 4) |
| `bundle_requires_adaptive` | `refuse` | Bundle requested but `workflow_path` is not `adaptive` |
| `target_set_conflicts_active_work` | `refuse` | One or more targets overlap an already-claimed active folder |
| `target_set_has_closed_issue` | `refuse` | One or more targets are already closed on the forge |
| `target_set_red` | `refuse` | One or more targets are red per the overlap classifier |
| `target_set_unavailable` | `refuse` | Remote forge validation failed (unreachable; not offline mode) |
| `target_set_indeterminate` | `escalate` | Classifier subprocess faulted transiently on one or more targets and exhausted all 3 attempts (issue #495); pause and ask the user |
| `target_set_unverified` | — | Offline with no local evidence for one or more targets |
| `target_set_label_rollback_failed` | — | Claim succeeded but in-progress-label rollback on a partial failure itself failed |
| `target_set_mismatch` | — | Bundle re-startup — persisted `issue_numbers` does not match the claimed `--target-issues` set (issue #430) |
| `bundle_state_incoherent` | — | Handoff or orient — `bundle_id` is present in `workflow-state.md` but `issue_numbers` is absent or inconsistent with `bundle_id` (issue #430) |

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
  - `0`: merge succeeded, branch pushed, issue(s) genuinely closed (verified live on the success path, not just a `0` exit from the close call — issue #619)
  - `1`: merge failed (non-recoverable; includes pre-merge guard failures: live workflow-state, unpushed commits, or no upstream tracking ref) OR a post-merge issue close that could not be verified closed on the forge (issue #619 — see Failure handling below). `main()` propagates any non-zero `postMergeCleanup` exit code, not only `3`.
  - `2`: fast-forward race condition exhausted after MAX_AUTOMERGE_RETRIES attempts
  - `3`: merge-impossible error (branch protected, non-fast-forward, permission denied); also returned if project archive dir exists during receipt write (root/Codex/GitLab/Gitea guard, issue #216); auto-fallback to PR sink
- **Failure handling** (issue #168, hardened fail-closed by issue #619):
  - A `gh issue close` (or forge-equivalent) call that exits `0` is no longer trusted as proof of closure: `postMergeCleanup` now re-probes the live issue state on the SUCCESS path too, at both the legacy single-issue close and the bundle-member loop (previously the probe only ran in the catch branch, for the pre-existing already-closed-exits-1 case). An exit-0-but-still-open close is bucketed `remote_issue_closed: 'failed'` (or added to `failed_issue_closures` for a bundle member).
  - A close that was genuinely attempted and failed (or could not be verified closed) now fails the WHOLE sink closed: `postMergeCleanup` emits a typed refuse envelope — `{result:'refuse', reason:'sink_incomplete', step:'closure', remote_issue_closed, closure_receipt, closure_invariants}` — and exit code `1`, instead of `status:'merged'` exit `0`. The merge into the default branch has already happened by this point (irreversible); this only prevents a failed close from being reported as a completed sink. This mirrors the `--sink` transaction's pre-existing `sink_incomplete` closure refusal (issue #497) on the legacy direct-merge path, which previously had no such refusal.
  - This refusal fires only when a close was genuinely attempted — a sink with nothing to close (no `--issue`/`--issue-numbers` passed, `KAOLA_WORKFLOW_OFFLINE=1`, or a keep-open run) is never false-flagged.
  - A stderr warning is still emitted alongside the refuse envelope (e.g., `sink-merge: WARNING: gh issue close exited 0 for N but the issue is still OPEN`).
  - Label removal still attempts to proceed even if issue close fails.
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

- **`KAOLA_RUN_CHAINS_TIMEOUT_MS`** (default 1800000) — Per-chain `spawnSync`/`spawn` kill ceiling in milliseconds for `kaola-workflow-run-chains.js`. Raised from a prior hardcoded 600000 (10 min) to 900000 (15 min, issue #512) because the claude chain was measured at ~574s standalone and was being false-killed at that ceiling, then raised again to 1800000 (30 min, issue #608) after a live run on a constrained host exceeded even the 900000ms bound, producing a `chains_red` failure that was structurally indistinguishable from a genuine test regression. Non-numeric, zero, or negative values fall back to the 1800000ms default. **No upper clamp** — a long-running local test suite is not a remote-hang risk (contrast with `KAOLA_GH_REMOTE_TIMEOUT_MS`'s #185 clamp). A chain killed by this ceiling now carries `timed_out: true` in its `.cache/chain-receipt.json` entry (issue #608; absent on a receipt written before this field existed ⇒ read as `false`), and the plain-text failure summary labels a timed-out chain inline (e.g. `claude (TIMEOUT at 1800s — raise KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)`) so an operator scanning stderr can tell a timeout from a genuine red without opening the receipt; the `--finalize-check` `chains_red` operator hint names the same remedy only when a red chain actually timed out. See `docs/decisions/D-608-01.md`.

### Bundle Lane

- **`KAOLA_TARGET_ISSUES`** — Comma-separated list of issue numbers for an explicit bundle claim (e.g. `KAOLA_TARGET_ISSUES=42,47,53`). Equivalent to `--target-issues 42,47,53`. Must not be set together with `KAOLA_TARGET_ISSUE` (triggers `target_ambiguity` refusal). Refused with `bundle_requires_adaptive` on fast/full paths. Numbers are sorted and deduped before validation.

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
- **`KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL=1`** (issue #619) — Force the `--sink` transaction's `push_upstream` step to throw, simulating a transient push failure. Proves the transaction does not false-report `push_upstream: 'done'` (and eventually `status:'sinked'`) when the feature branch was never actually backed up on the remote. Test-only; never set in production.
- **`KAOLA_WORKFLOW_DEBUG_CWD=path`** — When set, sink-merge writes the final `process.cwd()` to the specified file on exit. Used by test suite to verify CWD restoration after worktree removal. Applies to all three editions.

### Offline and Derivation Test Hooks

- **`KAOLA_WORKFLOW_OFFLINE=1`** — Skip all network calls (GitHub/GitLab/Gitea API, git fetch, git push). Used for local testing without network access. Applies to all three editions (GitHub, GitLab, Gitea).

## Adaptive Refusal / Emit Protocol (issue #355)

The adaptive scripts share a framed-output + refusal contract so a caller can always recover a machine-readable result from a shelled subprocess.

- **Framed output (last-line JSON).** A shelled script's result is the **last line of stdout that parses as JSON** (`safeJsonParse` in `commit-node.js` / `adaptive-node.js` tries the whole payload first, then the last valid JSON line). A stray log/debug/warning line emitted *before* the framed result therefore no longer collapses a success into an empty `{}` (a false refusal). The `shellNode` seam returns `{ ...parsed, exitCode }` with **`exitCode` set LAST** — a payload field named `exitCode` can never clobber the real process exit status.
- **Refusal envelope.** The canonical refusal shape is `{ result: 'refuse', reason, ... }`; callers branch on `result === 'refuse'` and read `reason` (a snake_case token). Per-subcommand payloads may carry **extra** fields (e.g. `nodeId`, `errors`, `status`) — additive, never required. The shared constructors live in `kaola-workflow-adaptive-schema.js` (the ×4 byte-identical anchor): `refuse(reason, extra)` builds the envelope, and `emit(obj)` writes **exactly one compact JSON line** (single-line so the last-line parser always round-trips it; pass `{ stream: process.stderr }` only for genuine out-of-band logs).
- **Refusals go to stdout.** A non-zero exit still carries its reason on **stdout** (not stderr). `kaola-workflow-task-mirror.js` previously printed its refusals on stderr while `shellNode` parsed `err.stdout` only — so the reason was always lost and `refreshTaskMirror` degraded to a bare `'failed'`. Its `missing_arg` / `plan_not_found` / `plan_not_frozen` refusals now emit the envelope on stdout (exit 1 preserved, the legacy `status` key kept for backward compat), and `refreshTaskMirror` surfaces the recovered `reason`.
- **`operator_hint` field (issue #445 / D-445-01).** Every typed outcome that carries a `reason` (`result: refuse`, `result: halt`, `result: warn`) now also carries a top-level `operator_hint: string` field — a one-sentence human-readable remediation hint generated at emit time from a per-aggregator `OPERATOR_HINT_REGISTRY`. The `operator_hint` field is at the SAME level as `result`/`reason` (never nested inside `triage` or `proposed_repair`). A success envelope with no `reason` carries no `operator_hint`; its presence is itself the signal that there is a next step.

  ```json
  {
    "result": "refuse",
    "reason": "write_set_overflow",
    "operator_hint": "Node n4 wrote outside its declared set. Run: node scripts/kaola-workflow-adaptive-node.js revert-overflow --node-id n4",
    "nodeId": "n4"
  }
  ```

  **Vocabulary contract (D-445-01 §3):** `write_set_overflow` family hints MUST reference `revert-overflow`, NEVER `drop-base`. A crash-repair / reopen-writer hint MUST reference `repair-node`. NO hint string in any aggregator contains a forge CLI token (`gh` / `glab` / `tea`) — hints are forge-neutral and ship in all four editions. The three aggregators hosting `OPERATOR_HINT_REGISTRY` are `adaptive-node.js`, `commit-node.js`, and `plan-validator.js`; the registry lives INSIDE each script (co-located with its emit sites, no shared import). The human channel (`operator_hint`) and the machine channel (`proposed_repair`, D-440-01) name the SAME #424/#434 primitives.

  **`--summary` mode (issue #446 / D-446-01 §4).** When `--summary` is passed to `adaptive-node.js`, the subcommand prints ONE line instead of full JSON:

  ```
  summary: <result> [| opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode> effort=<E>]... [| reason: <reason>] [| hint: <operator_hint>]
  ```

  `result` is always present; `| reason: <reason>` appears only when a `reason` is set; `| hint: <operator_hint>` appears only when an `operator_hint` is present. The full envelope JSON is simultaneously written to `.cache/<op>-envelope.json`, where `<op>` is the subcommand name (e.g. `.cache/close-and-open-next-envelope.json`). On `result: refuse` the interactive loop reads `.cache/<op>-envelope.json` for full detail; on success the one-line summary is sufficient. **Default output (no `--summary`) is byte-unchanged full JSON** — `--summary` is purely additive and opt-in. All orchestration scripts and tests that parse full-JSON stdout are unaffected.

  **Dispatch segments (issue #602).** `open-next`, `open-ready`, and the fused advance in `close-and-open-next` insert one machine-parsable `| opened=...` segment per opened node, positioned right after the leading `summary: <result>` token and before `| reason:` / `| hint:`. Each segment reads `opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode> effort=<E>`, drawn from that node's `opened[].dispatch` (or `opened.dispatch` on a single open): `task` is `dispatch.codex_task_name`, `mode` is `dispatch.codex_dispatch_mode`, and `effort` is the literal `inherit` when `dispatch.codex_reasoning_effort_source` is `parent_session`; otherwise it is the concrete effort or `unresolved`. The unresolved sentinel is reserved for a genuinely unresolved tier and refuses as `codex_tier_unresolved`. A batch `open-ready` open emits one segment per member, in member order. Close-only outcomes, `allDone`, and `result: refuse` carry no `opened=` segments, so the line is unchanged in those cases. This is additive to the summary **line** only — the full `--json` envelope (no `--summary`) is byte-identical to pre-#602 output.

### Validator subcommand emit/refuse (issue #406 — the #355 follow-up)

The plan-validator's per-subcommand payloads carried a legacy `{ ok:false, … }` shape kept for back-compat. Issue #406 migrates them toward the canonical `{ result, reason/reasonCode, … }` envelope **without** breaking the shells that parse them, in two classes:

- **Class A — dual-emit (gate-verify / verdict-check / resume-check).** `verifyGateExecution`, `verifyVerdictBlock`, and `revalidateForResume` now emit `{ result:'pass'|'refuse', reasonCode:<snake_case> }` **alongside** the established `ok` (and the human `reason` string, which `--resume-check` stderr, `adaptive-handoff`, and `adaptive-node` still echo — the typed token lives in the **new** `reasonCode` field, never by overwriting `reason`). `result` always agrees with `ok`. Every consumer (`commit-node` `gateVerify.ok`/`verdictCheck.ok`, the integrity-gate `resumeCheck.ok` reads across `adaptive-node`/`adaptive-handoff`, and the ~148 walkthrough `.ok` asserts) keeps reading `ok` — these are **dual-emit shims**. **Removal date:** the `ok` shim is removed once #401-P2 lands and all consumers read `result`/`reasonCode` (target: the release after #401-P2).
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

Every mutating `adaptive-node.js` subcommand runs a layered guard prologue **before** its body (zero mutation on refuse), in this fixed order: **(0) worktree-authority split** (a `main()` pre-dispatch guard, #466) → **(1) integrity** → **(2) consent-halt fence** → **(3) live-coordination mutual exclusion** → **(4) body**. The reason codes:

- **`worktree_authority_split`** (#466) — a PRE-dispatch guard that runs in `main()` before the layered prologue, on every mutating lifecycle subcommand (`open-next` / `open-ready` / `close-node` / `close-and-open-next` / `reconcile-running-set` / `write-halt` / `clear-halt` / `reopen-node` / `revert-overflow` / `repair-node` / `route-findings` / `record-evidence --stdin`). The adaptive lifecycle resolves the project folder (`workflow-plan.md` / `## Node Ledger` / `.cache/<node-id>.md` evidence / barrier baselines) **cwd-relative** (via `git rev-parse --show-toplevel`); when a linked `worktree_path` is recorded for the project AND that worktree exists on disk but the command is invoked from the MAIN repo root (`realRepoRoot === mainRoot` ⇒ not a linked worktree), durable state would be written under the main checkout while the role agents edit the worktree — a split that stays invisible until finalization. Refuses with **zero mutation** and an `operator_hint` to `cd` into the worktree. `orient` + `mirror-project` (the main→worktree copy, which must run from the main root) + `record-evidence --verify` are read-only / legitimately-main-root and **exempt**; native posture (no `worktree_path` recorded, or a recorded-but-missing worktree) is **unguarded**. The `/kaola-workflow-plan-run` prose `cd`s into `$ACTIVE_WORKTREE_PATH` right after `mirror-project`, so the happy path never trips this — the guard is the fail-loud backstop for a lifecycle call that escapes the worktree cwd.
- **`plan_integrity_failed`** (#387) — the pre-mutation `--resume-check` integrity gate found the frozen plan tampered/invalid (`plan_hash` mismatch, broken graph). Run on `open-ready`, `close-node` (the serial `open-next`/`close-and-open-next` deliberately do NOT add it — `orient` already runs `--resume-check` on the documented resume path).
- **`halt_pending`** (#391b) — a durable `consent_halt: pending` marker is set in the `## Node Ledger`. Fences `open-next`, `open-ready`, `close-and-open-next`, `close-node`. Clear it with `clear-halt` (now re-runnable after a crash — #391a widens the gate to also fire on a stranded `escalated_to_full` state marker, and writes state-first/plan-last so a re-run finishes the clear).
- **`serial_node_live`** (#383) — a live serial node (one `in_progress` row, no scheduler fan-out) blocks fanning out (`open-ready`). Carries `{inProgress, runningSet, repair}`.
- **`scheduler_active`** (#383) — a live `running-set.json` fan-out blocks `open-next`, `reopen-node`. Carries the same context. (The retired parallel-batch surface's sibling `batch_active` reason no longer exists — `active-batch.json` has no producer left.)
- **`scheduler_locked`** (#585) — another scheduler invocation holds the project-scoped O_EXCL `.cache/scheduler.lock` and its holder is LIVE. Fires at the `main()` CLI boundary, BEFORE the layered guard prologue, on exactly the `SPLIT_GUARDED_SUBCOMMANDS` set. Non-blocking (no spin-wait/queue — one serial orchestrator is the designed model); carries `{holder:{pid,host,ts,subcommand}, lockPath}`. See § Scheduler mutual-exclusion lock below.
- **`scheduler_lock_stale`** (#585) — the same lock, but the holder is CLASSIFIED dead/aged (a dead same-host PID, or an old/corrupt cross-host payload). The lock is NEVER auto-removed; the `operator_hint` names the holder (subcommand/pid/host/since) and the one-session manual recovery (`rm "<lockPath>"`, then re-run). See § Scheduler mutual-exclusion lock below and `docs/decisions/D-585-01.md` for the rejected auto-takeover design.
- **`evidence_unbound` / `evidence_stale`** (#392) — the close gate (`close-node` / `close-and-open-next`) verifies the evidence's `evidence-binding: <node-id> <nonce>` header against the per-open nonce (the barrier-base SHA prefix surfaced by `open-next`/`open-ready`). A header naming a different node → `evidence_unbound` (copied across nodes); a stale nonce → `evidence_stale` (replayed/copied from a prior open). Absent on disk (no recorded baseline) → the binding check is skipped (backward-compatible).
- **`closed_member_dropped`** (#384) — `reconcile-running-set` gained a CLOSE direction: a ledger-terminal (`complete`/`n.a`) member still in an `open` running set (a crash between `close-node`'s plan write and its set removal) is dropped; `orient` routes that wedge there (`running_set_close_incomplete` + `repair: 'reconcile-running-set'`) instead of looping. Every rollback / close-direction drop also shells `--drop-base` per affected node (#385) so a stale baseline never absorbs foreign writes on re-open.
- **`barrier_unavailable` / `barrier_unverifiable` — writer kill-safety reconciliation (issue #611, D-611-01).** `reconcile-running-set` gained a writer-kill-safety pass: every WRITER member leaving the live set on that call (rolled back / capped out / stale) is diffed against its declared write set via `--barrier-check` BEFORE the `--drop-base` loop, producing a per-writer verdict in the response's `writerReconciliation` array (`adopt` on an explicit `result: 'pass'|'ok'`, or the vacuous `no_barrier_base` case; `halt` on a confirmed `write_set_overflow`/`barrier_refused`, an unshellable/non-object barrier result (`barrier_unavailable`), or a resultless/unrecognized barrier result (`barrier_unverifiable` — a crashed/killed/non-JSON/missing-validator subprocess is UNVERIFIED, never silently adopted)); a top-level `writerHalt` is `true` when any writer halted. See § `reconcile-running-set` — writer kill-safety verdicts below for the full JSON shape and classifier truth table.
- **`delegation_outcome` — typed evidence shape (issue #611).** An evidence file MAY carry a column-0 `delegation_outcome: <token>` line recording how a delegated node's dispatch resolved. The vocabulary (`DELEGATION_OUTCOME_VOCABULARY`) is closed: `completed | returned_partial | interrupted_unresponsive | interrupted_obsolete`; absent ⇒ `completed` (back-compat — existing evidence with no such line stays green). An unrecognized token is a typed `checkEvidenceShape` refusal (`missingTokenClass: 'delegation_outcome'`), enforced BEFORE the per-role branches and the universal `n/a` carve-out, so the vocabulary governs every role uniformly.
- **`node_not_in_ledger` — additive `diagnostic` field (issue #425).** When `open-next` (via `spliceLedgerNode` / `readLedgerStatuses`) cannot find an `id` column in the `## Node Ledger` — because the section is present but uses a non-canonical header (e.g. `| node | status |`) — the `node_not_in_ledger` refusal payload now carries an additive `diagnostic` field:
  ```json
  { "result": "refuse", "reason": "node_not_in_ledger", "nodeId": "<id>",
    "diagnostic": { "ledger_present": true, "columns_found": ["node", "status"], "id_column_required": true } }
  ```
  This makes the failure self-diagnosing: the operator is told the ledger section exists but its header lacks the `id` column, and can apply `plan-validator.js <plan> --freeze --repair` to normalize it before re-opening. When the ledger section is entirely absent (a genuinely missing entry), `diagnostic` is omitted and the refusal has its prior shape.
- **`no_barrier_base` — new `adaptive-node.js` hint (issue #590).** The close-time reason itself is pre-existing, emitted by `plan-validator.js` when no per-node baseline was recorded (unchanged). What's new is that `adaptive-node.js`'s own `OPERATOR_HINT_REGISTRY` now carries an entry for it (previously it fell through to the generic fallback hint), naming the idempotent `open-next` re-invoke as the repair — re-running `open-next` re-records the baseline without disturbing an already-`in_progress` row. See `docs/decisions/D-590-01.md` (the companion baseline-first `open-next` reorder that makes the underlying dead-end unreachable on a fresh open).
- Non-blocking warnings (informational, do not refuse): **`verdict_unparsed`** (#403.4 — a verdict-bearing role's evidence has a `Verdict:` line the strict column-0 finalize check won't recognize, e.g. a capital key), and **`baselineReused`** (#403.3 — `open-next` surfaces the validator's anti-laundering baseline-reuse decision).
- **Finalize-check typed refusals (#424):** `drop_base_window_open` (`--drop-base` called while a node is `in_progress`); `unattributed_change` (a file in the whole-plan diff is declared only by a non-complete node — attribution sweep); `root_mismatch` (plan-path root does not match the project root).
- **Finalize validation-gate typed refusals (#432/#475, dual-mode):** SELF-HOST (npm) — `chains_unverified` (no `.cache/chain-receipt.json` exists or is readable); `chains_stale` (the receipt's `codeTreeHash` does not match the current code-relevant tree — #547 D-547-01; a legacy receipt lacking the field falls back to the `headSha`-vs-`HEAD` pin); `chains_red` (one or more chains recorded a non-zero exit code in the receipt — use `--accept-known-red name:issue` to waive a known-red chain with a tracking issue). A JSON `chains_stale` refusal may add best-effort stale culprit diagnostics (`stale_paths`, `stale_paths_truncated`, `stale_kind`), but the typed `reason`, decision order, operator hint, and remedy remain unchanged. CONSUMER (non-npm; #475) — `final_validation_unverified` (no/empty `.cache/final-validation.md`); `final_validation_failed` (present but no column-0 `verdict: pass`); **`final_validation_unbound`** (issue #653 — no well-formed column-0 `validated_candidate_hash:` line, so the pass verdict is not bound to a candidate snapshot); **`final_validation_stale`** (issue #653 — the recorded hash no longer equals a fresh recompute over the current tree; payload carries `recorded_candidate_hash` + `current_candidate_hash`). Consumer precedence: `final_validation_unverified > final_validation_failed > final_validation_unbound > final_validation_stale`. The repo kind is auto-detected (package.json `test:kaola-workflow:*` scripts). See § Candidate-hash binding for consumer final-validation (issue #653) below for the producer mode and parser.
- **Speculative-open kernel typed outcomes (#439, D-419 Part 4; write graduation #596, D-596-01):** `gate_not_complete` fires in TWO slots — at **open** (`open-next` of a node — read-only, or since #596 also write-bearing — whose ONLY unsatisfied dependency is an open gate; it is speculative-eligible and is NOT opened serially; carries `speculativeGate`, points at `open-ready --speculative-consent`) and at **close** (a `speculative:true` member cannot commit to `complete` until its gate is `complete` — it is held, so its review pointer + discard handle survive; never deadlocks since the gate is an upstream dependency; unchanged by #596). `speculative_review_required` (NON-blocking, attached to a successful gate `close-node`/`close-and-open-next` whose verdict was `fail` — names the `speculative` members that bet on it; a READ member the operator KEEPs or `discard-speculative`s, a WRITE member is `discard-speculative`-ONLY — no KEEP option, see below); `not_speculative` / `not_in_running_set` (`discard-speculative` of a non-speculative or non-live node). **`speculative_write_excluded` (#596; `parent_dirty` added #615)** — `open-ready`'s `reason` when zero speculative writers opened this call because ALL candidates were excluded; the accompanying `speculativeWriteExcluded: { reason, nodeIds }` object also rides alongside a `result:'ok'` PARTIAL open (some speculative writers opened, siblings excluded) — `reason` is `'no_leg_capability'` (the host cannot provision a leg, so EVERY write candidate is excluded; read speculation is unaffected), `'overlaps_live_writer'` (a candidate's declared set collides with a currently-live writer per the SAME `--parallel-safe` re-check normal write co-open uses; only the overlapping candidate(s) are excluded, disjoint siblings still open), or `'parent_dirty'` (#615 — the parent worktree carries out-of-allowband production dirt from already-closed serial siblings, verified via the SAME `--parent-clean-check` fence the last-member close runs; co-opening over that dirt would reach a structurally unsatisfiable last-member close, so EVERY write candidate is excluded from THIS open — read speculation is unaffected, and the excluded write(s) simply wait for their gate normally). See the speculative-open kernel section below.
- **`serialDegradeReason` (#616) — the non-speculative co-open sibling of `speculativeWriteExcluded`.** `open-ready`'s response carries an additive `serialDegradeReason: 'parent_dirty'` field (string) on a **SUCCESSFUL single-write open** (`result:'ok'`, `opened:[<one write node>]`) — the opposite polarity of `speculativeWriteExcluded`, which rides an **empty/no-open** response — set ONLY when a normal (non-speculative) ≥2-member write frontier never even attempted a lane-group co-open, and instead degraded straight to a single serial write, BECAUSE `parentCarriesProductionDirt()` returned true (the SAME `--parent-clean-check` fence #615's `speculativeWriteExcluded: { reason: 'parent_dirty' }` reuses — a persistently dirty parent is now visible on the non-speculative path too, instead of silently serializing every write frontier forever). The field is **absent** (no key on the response at all — byte-identical to pre-#616) for every other serial-degrade cause, none of which ever evaluate the parent-clean fence: a single ready write node (`writeNodes.length < 2`), `!legCoupled` (no leg capability), `groupCeiling < 2` (an operator-capped fan-out below 2), or `!grp.ok` (the validator's `--parallel-safe` re-check found a genuine overlap).

### Scheduler mutual-exclusion lock (`.cache/scheduler.lock`, issue #585)

`kaola-workflow/{project}/.cache/scheduler.lock` is a project-scoped O_EXCL lockfile that makes the running-set scheduler's mutual exclusion an OS-level guarantee instead of the prior advisory-only in-memory guard (a pure state-file read + refusal decision, no lock at all). `adaptive-node.js`'s `main()` acquires it — via `acquireProjectLock` in `adaptive-schema.js` — for exactly the mutating `SPLIT_GUARDED_SUBCOMMANDS` set (`open-next`, `open-ready`, `close-node`, `close-and-open-next`, `reconcile-running-set`, `write-halt`, `clear-halt`, `reopen-node`, `revert-overflow`, `repair-node`, `route-findings`, `discard-speculative`), BEFORE the layered guard prologue and the entire subcommand body, and releases it in a `finally` (plus a module-level `process.on('exit')` backstop for a crash that skips the `finally`). `orient`, `mirror-project`, and `record-evidence --verify` are read-only and never acquire it.

**Holder payload:**

```json
{ "pid": 12345, "host": "example-host", "ts": 1751500000000, "subcommand": "open-ready" }
```

**Claim contract.** `fs.openSync(lockPath, 'wx')` (O_EXCL | O_CREAT) either succeeds (write the payload, `fsync`, return `{ok:true, release}`) or fails `EEXIST`, in which case the holder is CLASSIFIED, never removed: `isStaleLock(holder)` returns `true` for a dead same-host PID (`process.kill(pid, 0)` throws `ESRCH`) or an old/corrupt cross-host payload (age > `LANE_STALENESS_MS`, 24h), and `false` for a live PID or a fresh (possibly mid-write) payload. The classification only SELECTS the refusal reason (`scheduler_locked` for a live holder, `scheduler_lock_stale` for a dead one) — it can never cause an acquire, so a misclassification's worst case is a wrong hint flavor, never a lost mutual-exclusion guarantee. There is deliberately NO auto-takeover of a stale lock — see `docs/decisions/D-585-01.md` for the empirical refutation that led to this fail-closed design. Recovery from a genuinely dead holder is ONE explicit operator `rm "<lockPath>"` (named literally in the `scheduler_lock_stale` `operator_hint`), then a re-run.

The lockfile is a **transient coordination artifact**, not durable workflow state: it is barrier-exempt (the `kaola-workflow/` prefix allowband), never survives to `kaola-workflow/archive/{project}/`, and its absence on disk is the normal (unlocked) state between invocations. See `docs/workflow-state-contract.md` for its place in the `.cache/` inventory.

### Speculative-open kernel (`speculative_open_policy`, #439 / D-419 Part 4; write graduation #596 / D-596-01)

A node may optimistically run **ahead of an open gate dependency** — betting the gate passes, rolling back if it fails. Through #439 this was read-only only; **#596 graduates write-bearing nodes onto the same bet**, behind the same policy tiers plus three additional static conditions (below). Activation is policy-tiered (#597, D-597-01):

- **`## Meta` field `speculative_open_policy`** (hash-covered; the freeze-legal set is `off` (serial waiting only — no speculative open), `consent` (per-run consent carrier required), and `auto` (fully-automatic activation with no per-run consent) — since #597 (D-597-01, superseding the D-419-02 consent ceremony as the default posture) `auto` is the freeze-time DEFAULT materialized when the field is absent). Parsed by `plan-validator.js parseSpeculativePolicy`; a non-legal value freeze-refuses `speculative_policy_unsupported`.
- **at `consent` only: the per-run consent carrier `open-ready --speculative-consent`** (never persisted in the frozen plan — orthogonal to the policy field). At `auto`, activation is automatic on `open-ready` and `--speculative-consent` is accepted as a no-op; at `off` there is no speculative open.

**Eligibility (mechanical, `next-action.js`):** the additive `speculativePending` set = a node whose own status is `pending`, that is not already a normal ready node, whose single unsatisfied direct dependency is a gate (`GATE_VERDICT_ROLES`) currently `in_progress`. A **read-only** node (empty declared write set) satisfies this unconditionally, exactly as in #439. A **write-bearing** node (#596) additionally requires: its declared write set is EXACTLY resolvable (`hasUnresolvableEntry`, the SAME resolvability guard the `--parallel-safe` coarse relaxation already applies — no directory-shaped or glob token), it declares no PROTECTED file (`classifier.isProtected`), and it is not the plan's unique sink (`uniqueSink`) — a speculative sink would let a bet-on-a-gate write skip the sink's own terminal position. Emitted at `speculative_open_policy: auto` (the #597 default) and `consent` — the key is **omitted entirely at `off`**, so `next-action.js` output at `off` is byte-identical to pre-#439 and the open-time `gate_not_complete` branch (which keys on this set) never fires off-policy.

**Subcommands / markers (`adaptive-node.js`):** `open-ready --speculative-consent` opens the speculative frontier (only when the normal frontier is empty) stamping each running-set entry `speculative: true` + `speculativeGate: <gate-id>` ([INV-25]); a **close-time guard** holds a speculative member (`gate_not_complete`) until its gate is `complete`, so a gate `verdict:fail` can still surface `speculative_review_required` and the member is still `discard-speculative`-able (the concurrent work already happened — only the formal `complete` is deferred). `discard-speculative --node-id N` rolls a speculative member back GC-safely — **ledger reset → revert the node's in-lane declared writes to the anchored baseline SHA (read from `.cache` BEFORE any drop; a no-op for an empty read-node write set, and for a #596 write member — see below) → `--drop-base` → remove from the running set** — composing with #424's `drop_base_window_open` lock and #434's no-re-snapshot posture (it keeps the baseline as the revert target, not a laundering path). Both are in the #466 worktree-authority split-guard set. At `off` ⇒ no speculative open, no `speculativePending` key ⇒ byte-identical to the pre-speculation serial behavior (`off` is an explicit opt-out since #597; the absent-field default is `auto`).

**Write member mechanics (#596, D-596-01).** A speculative write candidate opens WITH a provisioned per-member leg — the EXISTING #463/D-542-01 leg machinery (a `.kw/legs/<project>/<node-id>` worktree; base = the parent's HEAD) — never the parent worktree, even for a lone candidate (a size-1 `lane_group` forms; `closeGroupMember` already degenerates a 1-member group to "last member" at close, so no new merge code was needed). `runOpenReady`'s `selectSpeculativeWriteGroup` RE-VERIFIES exact-path disjointness of every write candidate against every currently-live writer via the SAME `--parallel-safe` predicate normal co-open uses before ever forming the group; an overlapping candidate is EXCLUDED from this open (its disjoint siblings are unaffected — see `speculativeWriteExcluded` above), and the group counts against the WRITE fan-out cap (`resolveFanoutCap`, folded with `--max`), never the read cap. **Fail-closed on a validator subprocess failure (#599, D-599-01):** a non-ok `--parallel-safe` result lacking a well-formed `overlapping` array (subprocess crash, garbled JSON) mirrors `tryFormLaneGroup`'s posture and excludes EVERY speculative write candidate from that open — not just the pair a malformed result would have named; a well-formed non-ok result carrying a real (even empty) `overlapping` array is unaffected and still runs the existing per-pair exclusion. A host with no leg capability excludes ALL write candidates from that open (`speculativeWriteExcluded: { reason: 'no_leg_capability' }`); read speculation is unaffected. On a gate `verdict: pass`, a speculative write member closes through the EXISTING per-leg barrier → group barrier → octopus-merge path, unchanged. On a gate `verdict: fail`, a speculative write member is **DISCARD-ONLY** — `discard-speculative` skips the in-lane-write revert step entirely (the leg was never applied to the parent tree, so there is nothing there to revert, and a NEW file the leg was going to create does not exist at the baseline SHA — `git checkout <baseSha> -- <path>` would hard-fail), tears down the leg (worktree + branch + leg-base ref, via the same `teardownLeg` every leg-lifecycle site uses; `sweepOrphanLegs` is the crash backstop), and purges the stale evidence file so a future re-open reseeds cleanly. The success envelope additionally carries `legTornDown: boolean`, `evidenceDiscarded: boolean`, and (only when this discard cleared the LAST live member of its `lane_group`) `groupCleared: true`. This is a deliberate asymmetry with the read half's KEEP-or-discard operator review — a write built on a refuted premise is rework risk, so it is torn down unconditionally, never offered as still-valid evidence. `reconcile-running-set` gains a matching crashed-speculative-write arm: a crashed write member whose ledger row flipped to `in_progress` (the general roll-forward candidate) rolls FORWARD only if its gate is CONFIRMED `complete` with `verdict: pass` AT RECONCILE TIME; any other gate state (still open, failed, unparseable, or unreadable) rolls it BACK via the existing drop path (folded into the pre-existing `rolledBack` array — no new response field), with the same evidence purge applied to every rolled-back or capped-out speculative write member. Read speculative members and every non-speculative member are unaffected by all of the above (`kind === 'write'` gates every new arm).

### Write-overlap relaxation (`write_overlap_policy`, #463 / D-419 — sequencing step 1)

The WRITE-side analogue of the speculative-read kernel — DISTINCT field (writes clobber where reads do not, so they are gated with at least as much). `## Meta` field **`write_overlap_policy`** (hash-covered; legal `off` (default) / `disjoint` / `coarse`; `exact` is refused at freeze — `write_overlap_policy_unsupported` — exact-file optimism deferred) is still parsed for frozen-plan back-compat, but since #593 (D-593-01) it no longer gates anything at this seam — see below. The validator's coarse-area write-overlap block is **DETECT**, not **PREVENT**, at the `--parallel-safe` co-open check, made safe by the single relaxation predicate `writeOverlapRelaxable`. **Post-#546-G2 (D-546-G2, accuracy-first DECISION B) and #593 (D-593-01)** the predicate splits by `dj.kind` under a single RETAINED safety net that gates EVERY relaxation at EVERY class/tier: (NET-1) a `synthesizer`/`code-reviewer` gate post-dominates **the relaxed legs themselves** (leg-scoped `gateUncovered` over the `--nodes` set — NOT a whole-plan `producesCode` check, which is vacuously-empty for docs-only legs and would relax an unreviewed frontier); and (NET-2) **no PROTECTED concrete file** in either set. The class then decides the rest:
  - **`shared-infra`** (same `SHARED_INFRA` area, **exact-file-disjoint** — e.g. two `scripts/` files) co-opens **BY DEFAULT** under the retained net — **NO `write_overlap_policy:coarse`** and **NO `--write-overlap-consent`** required. The set is disjoint by construction, the gate covers the merged union, and the per-leg barrier still catches textual conflict, so the operator-consent ceremony added nothing the structural net does not already guarantee.
  - **`coarse`** (NON-shared, exact-file-disjoint — e.g. two cross-edition antichains both under `plugins/`) **also co-opens BY DEFAULT under the same retained net (#593, D-593-01)** — as safe as `shared-infra` for the same reason: disjoint by construction, the gate covers the union, the per-leg barrier catches textual conflict. `write_overlap_policy` / `--write-overlap-consent` are VESTIGIAL here — parsed but neither enable nor block the relaxation. The one added guard is **resolvability** (`hasUnresolvableEntry`): if either set carries a directory-shaped (trailing `/`) or glob (`* ? [ ] { }`) entry, exact-path disjointness is unprovable and `coarse` keeps the PREVENT verdict for that pair.
  - **`exact`** (exact-file overlap or a case-collision, or any future class) **NEVER relaxes here** — real reconciliation is the runtime `merge_conflict` barrier's job, deferred.

`classifier.disjointWriteSets()` gains an additive `kind ∈ {exact, coarse, shared-infra}` (the `verdict` stays pure — `scanClaimedOverlap`/#232 antichain/G-SEL-4 ignore it); `classifier.isProtected()` marks the concrete-file guard set (lockfiles, `CHANGELOG.md`, `ROADMAP.md`, install manifests, archive/roadmap artifacts, the `kaola-workflow-adaptive-schema.js` ×4 anchor) — blocking at every tier. At no-gate / PROTECTED (any class), `exact`, or a `coarse` pair with a non-exactly-resolvable entry, the `overlapping_write_sets` refusal stands verbatim. The `--parallel-safe` envelope surfaces a `relaxed[]` audit list of what was downgraded. **Scope:** step 1 only — the runtime (`merge_conflict` HALT, the `synthesizer` write role, per-leg `.kw` worktrees + the dependency-level commit barrier) + the live-harness AC18 probe remain; #463 stays OPEN.

### Dispatch fidelity (`enterBatch`, #472 — run the authored width concurrently)

The read-axis scheduler (#303/#375/#377/#438/#439) marks N rows `in_progress`, but no issue shipped a *dispatcher* — across 21 traced runs `everConcurrent` was false in every one. #472 closes that fidelity gap (run the plan as the planner authored it; **not** a width mandate — width stays the planner's call).

- **`runOpenNext` divert (`adaptive-node.js`):** at a fresh INDEPENDENT ≥2 delegable frontier (auto-pick, no `--node-id`), `open-next` returns `{result:'ok', enterBatch:true, frontier:[...], opened:null}` with **zero mutation** instead of silently single-opening `readySet[0]` — mirroring `orient` + `close-and-open-next`. A width-1 frontier / dependency chain single-opens serially; an explicit `--node-id` is exempt; a write in the mix serial-degrades (the #463/#437 path).
- **Skeleton default (6 plan-run surfaces):** on `enterBatch:true`, run `open-ready` then dispatch the frontier's role agents **in ONE assistant message** (the single-message dispatch is the only thing that yields real concurrency — one-per-turn is itself a serial barrier). This is the DEFAULT, not the voluntary `frontier-batch` card it was before.
- **`deriveMaxSimultaneousOpen(timingsContent)`:** derives `{maxSimultaneousOpen, everConcurrent}` from the existing durable `node-timings.jsonl` `opened`/`closed` events (a pure interval sweep, conservative on same-`ts` close→open hand-offs). `everConcurrent` (max ≥ 2) is the PROOF the authored width actually ran concurrently. **#472 stays OPEN** until a recorded live run shows `everConcurrent:true` — green chains prove only that the seam exists (the trap that left this dormant through five prior closures).
- **`#558` auto-surfaced dispatch fidelity:** `orient` (`adaptive-node.js runOrient`) now emits `dispatchFidelity: {maxSimultaneousOpen, everConcurrent}` in its success envelope on every run — it reads `node-timings.jsonl` and calls `deriveMaxSimultaneousOpen`, so a regression to silent serialization auto-surfaces on a REAL run instead of only via a hand-run probe. The field is purely additive and fail-closed (absent/unreadable telemetry ⇒ a zeroed `{maxSimultaneousOpen:0, everConcurrent:false}` trace, never a refuse — telemetry must never block a lifecycle transition). A no-fan-out serial run legitimately reports `everConcurrent:false`; it is a fidelity TRACE, not a gate.

### `## Meta` fields `validation_command` / `validation_test_consumes` (#547 / D-547-01)

- **`validation_command: <cmd>`** (hash-covered; reader-only, no freeze gate) — the consumer's validation command, recorded ONCE by the planner at freeze (`plan-validator.js parseValidationCommand`). Each node and Finalization reuse it instead of re-deriving a full-suite command per node (the "record once, cite don't re-run" discipline; closes the Stage-1 omission). Absent ⇒ `null`.
- **`validation_test_consumes: a/b.md, c.md`** (hash-covered; `parseValidationTestConsumes`) — the OPTIONAL widening of the code-tree-hash keep-as-code set for a self-hosting fork whose chain tests read prose beyond the built-in `SELF_HOST_TEST_CONSUMED`. Listed files stay code-relevant for the receipt freshness hash (so a real change to them is never cited-as-unchanged). The producer records the resolved list in the receipt so the gate replays the identical band. Absent ⇒ `[]`.

#### Schema-2 extension of the same validation namespace

`parseValidationPolicy(content, {contract})` preserves the D-547-01 field instead of adding a
second command authority. For a verified contract-1 plan it returns this explicit compatibility
mapping without changing the frozen plan or imposing runner semantics:

```json
{
  "plan_schema_version": 1,
  "contract_version": 1,
  "command": "<validation_command or null>",
  "cwd": ".",
  "repetitions": 1,
  "pass_rule": "all",
  "timeout_minutes": null,
  "env_allowlist": [],
  "runner_required": false,
  "source": "legacy-d547"
}
```

Schema 2 refines that same `validation_command` with hash-covered sibling fields:

| Field | Contract |
|---|---|
| `validation_cwd` | Normalized repository-relative path; default `.`; no absolute path, drive prefix, backslash, or empty/`.`/`..` segment except the sole default `.`. |
| `validation_repetitions` | Integer `1..5`; default `1`. |
| `validation_pass_rule` | Exactly `all`. |
| `validation_timeout_minutes` | Integer `1..120`; required with `validation_command` on a code-producing schema-2 plan. |
| `validation_env_allowlist` | Canonically sorted, duplicate-free comma list of shell identifiers; default empty. |

Unknown or duplicate `validation_*` fields refuse as `validation_policy_unknown_field` or
`validation_policy_duplicate_field`. Invalid values refuse as `validation_cwd_invalid`,
`validation_repetitions_invalid`, `validation_pass_rule_invalid`, `validation_timeout_invalid`, or
`validation_env_allowlist_invalid`. A code-producing schema-2 plan lacking the command or timeout
refuses as `validation_policy_required` inside the ordinary `plan_invalid` freeze envelope.

`kaola-workflow-validation-runner.js` executes this policy locally:

```bash
node scripts/kaola-workflow-validation-runner.js run \
  --command '<exact frozen command>' \
  --cwd . --repetitions 1 --timeout-minutes 30 \
  --env-allowlist KEY_A,KEY_B --output <receipt.json>
```

The child starts from a scrubbed environment containing only deterministic/platform-minimum keys
plus the allowlist. Durable identity includes exact command bytes, normalized cwd and policy,
digests of effective allowlisted values, Node/shell/simple-command executable realpath-mode-version
identity, relevant lock/toolchain files, and the landable candidate digest. Raw secret values and raw
child output are not stored. Each repetition records exit/signal/timeout, output digests, a normalized
failure signature, and equal pre/post candidate digests. Reduction is exact: all comparable zero
exits are `pass`; all comparable nonzero exits with one stable failure signature are `fail`; mixed
results, timeout, signal, candidate mutation, or incomparable identity are `inconclusive`.
`vector_id` hashes deterministic semantic fields only; `receipt_sha256` also binds audit timestamps.

The opt-in `qualify-local` subcommand runs local Claude and Codex probes through injectable process
adapters and records contract/profile/context identities plus invariant-class outcomes. It compares
contract conformance, never equality of natural-language findings, explanations, or verdict prose.
The runner is a self-contained local authority; no external pipeline is part of the contract.

### Reviewer contract 2: plan, context, receipt, and refusal API

#### Contract selection and authoring schema

`resolvePlanContract` is the single version boundary:

- a hash-verified already-frozen plan with no `plan_schema_version` is contract 1
  (`source: verified-legacy-frozen`) and remains byte-preserving;
- a new draft must declare `plan_schema_version: 2`;
- a new field-absent draft refuses `plan_schema_version_missing`;
- a newly authored explicit version 1 refuses `plan_schema_version_legacy_new`; and
- duplicate or unsupported values refuse `plan_schema_version_duplicate` or
  `plan_schema_version_unknown`.

Schema-2 `## Meta` additionally carries `code_certifier`, `security_certifier`,
`inherited_frontier_digest`, and `inherited_frontier_classes`. The schema-2 node header is:

```text
| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
```

Every gate has a nonempty `gate_claim` and `gate_surface` and an aggregation of `sequence`,
`replicated_majority`, or `partitioned_all`. A change-gate `adversarial-verifier` carries a sorted
`certifies` producer list; an investigation verifier carries an empty list; code/security producer
sets are validator-derived. Plan schema 2 maps only to dispatch `contract_version: 2`; a missing,
future, or mismatched plan/dispatch/journal version refuses before spawn or lifecycle mutation.

#### Graph-derived mode and three independent axes

`deriveGateMode(planView, node)` is the only mode classifier. It returns `null` for other roles. An
`adversarial-verifier` is `change_gate` exactly when it can forward-reach the unique sink and at least
one declared/derived change producer can forward-reach it; otherwise it is `investigation`. This is
forward reachability, not strict post-dominance. Required-token seeding, dispatch, close, journal,
reducer, repair-state, verdict, and final freshness checks all consume this result rather than role
prose or a caller-supplied mode.

The normalized result has separate axes:

| Axis | Values | Owner |
|---|---|---|
| `execution_status` | `complete` or `failed` | Harness, from terminal execution and identity/evidence verification. |
| `domain_outcome` | code/security: `approved` or `changes_requested`; adversarial: `refuted`, `not_refuted`, or `indeterminate` | Reviewer domain. |
| `gate_effect` | `pass`, `fail`, or `none` | Harness, derived from role, mode, outcome, and admitted blockers. |

`execution_status` and `gate_effect` are reserved: model-authored values refuse as
`review_reserved_harness_field`. A complete investigation derives `gate_effect:none` for every valid
adversarial outcome and closes without a product-repair attempt. A change-gate adversarial receipt
passes only on `not_refuted`; `refuted` and `indeterminate` fail. Code/security pass only on
`approved` with zero admitted blockers. Missing, malformed, stale, or mismatched execution is
`failed` and routes bounded role retry; it is never converted to analytical `indeterminate`.

#### Runtime-neutral context and runtime-specific dispatch

At gate open the executor writes canonical JSON to
`.cache/review-contexts/<review_context_hash>.json`. It binds plan/behavior/claim/epoch/logical-gate,
graph-derived mode, claim root, landable candidate, inherited frontier, scope lineage, discovery or
closure phase, prior findings, repair delta, and validation obligations. The context excludes runtime,
model/tool, `resolved_profile_hash`, evidence transport, timestamps, and absolute paths.

The dispatch envelope separately carries `plan_schema_version`, `contract_version`, behavior version
and hash, runtime-specific `resolved_profile_hash`, context hash/path, candidate digest, mode,
logical-gate metadata, and the frozen claim/surface/aggregation. Evidence must echo its required
identity tokens. Before findings are parsed, close recomputes and compares every binding. Principal
typed failures are `review_contract_version_mismatch`, `review_context_mismatch`,
`review_behavior_mismatch`, `review_profile_mismatch`, `review_candidate_mismatch`, and
`review_gate_mode_mismatch`.

A complete member writes a canonical normalized receipt to
`.cache/review-receipts/<review_context_hash>/<node-id>.json`. The receipt binds evidence nonce,
context/behavior/profile/candidate identities, harness-derived axes, surface, normalized findings and
resolutions, validation vectors, optional certifier digest, and raw-evidence SHA-256. Missing,
duplicate, failed, or surface-mismatched group members refuse rather than vote.

#### Findings, convergence, and typed re-plan handoff

`finding-anchor-v1` admits exactly one primary anchor of
`candidate_range`, `deleted_base_range`, `tree_entry_change`, `required_absence`, or
`evidence_observation`, plus sorted secondary anchors. The harness validates Git/evidence membership,
recomputes the structured trigger digest, and assigns
`uid = sha256(canonical_json({scope_lineage_id, primary_anchor}))`. Model ids, prose, proof digests,
and secondary anchors do not define identity. Conflicting immutable records for one UID refuse
`finding_uid_collision`.

The first attempt in a scope lineage is `discovery`; later attempts are `closure`. Closure must
classify every prior UID as open or resolved, bind a new blocker to the repair delta, provide
current-candidate resolution evidence for removed UIDs, strictly shrink the open set, and retain a
comparable passing vector for every inherited validation obligation. A new in-scope blocker outside
the repair delta yields `review_scope_expanded`; two distinct consecutive non-progress attempts yield
`review_nonconvergent`. Both settle as:

```json
{
  "result": "replan_required",
  "reason": "review_scope_expanded|review_nonconvergent",
  "attempt_id": "<durable schema-2 attempt>",
  "lifecycle_settled": true
}
```

This packet is a typed stop/handoff only. The current bundle does not select a writer, thaw the frozen
plan, author replacement topology, or activate a child epoch; claim-preserving epoch activation is a
separate contract.

#### Reducers and G4 common-certifier wall

| Aggregation | Code/security | Adversarial |
|---|---|---|
| `sequence` | One member; approval with no blocker passes. | One member; mode maps the domain outcome to `pass`/`fail`/`none`. |
| `replicated_majority` | Any blocker vetoes; otherwise strict-majority approval is required. | Strict-majority `not_refuted` wins; a refuted tie is `refuted`; other no-majority mixtures are `indeterminate`. |
| `partitioned_all` | Every distinct required surface must approve with no blocker. | Any `refuted` surface wins, else any `indeterminate`, else `not_refuted`. |

G4 resolves the planner-designated `code_certifier` and conditional `security_certifier` to a real
sequence node or exact logical group. Removing that certifier must eliminate every relevant
producer-to-sink path; group members must be reachable and the join must require every declared
member. Branch-local reviews alone do not satisfy G4. An `inherited_frontier_digest` with `code`
and/or `security` classes creates virtual producers before all roots, so a zero-writer child cannot
launder inherited unapproved work. Finalization recomputes role-specific current digests and requires
fresh bound certifier receipts. G4 failures are structured `g4_*` / `gate_*` families carried inside
the ordinary `plan_invalid` freeze result.

### `## Meta` field `optimize(<node-id>)` — the metric-optimizer contract (issue #634 / D-634-01)

`metric-optimizer` is a closed-library role (`CANONICAL_ROLES`/`WRITE_ROLES`/`IMPLEMENT_ROLES`,
`kaola-workflow-plan-validator.js`; model tier `sonnet`, `kaola-workflow-resolve-agent-model.js`)
serving *direction-not-destination* work — no fixed acceptance threshold is knowable at freeze. It
is an ordinary `sequence`-shaped `IMPLEMENT_ROLES` member: `producesCode()` is true for it exactly as
for `implementer`/`tdd-guide`, so **G1 `code-reviewer` and G3 `main-session-gate` post-dominance are
inherited with no gate-plumbing change.**

**The `optimize(<node-id>):` Meta block (`parseOptimizeContracts`).** One block per
`metric-optimizer` node, keyed by node id, read from the RAW `## Meta` body (fence-scoped exactly
like `parseSpeculativePolicy`/`parseValidationCommand`), so a header must sit at column 0 and its
fields are indented:

```
optimize(n3):
  metric_command: node scripts/bench-walkthrough.js --emit-metric
  metric_paths: bench/suite.js
  direction: min
  budget_iterations: 20
  budget_wallclock_minutes: 60        # optional; default = tier-derived wait budget
  regression_gate: npm test           # optional; default = Meta validation_command
  metric_repeats: 3                   # optional; default 1 (median-of-K)
  min_delta: 0.5                      # optional; default 0 (absolute metric units)
  patience: 5                         # optional; consecutive rejects before early stop
```

`metric_paths` is comma/whitespace-separated and normalized through the same parser as
`declared_write_set` (`classifier.parseWriteSetCell`), so OPT-2 disjointness (below) compares both
under identical normalization. Absent optional fields parse to `null` except `metric_repeats`
(default `1`) and `min_delta` (default `0`). `computePlanHash` already normalizes the whole `## Meta`
body, so the contract is `plan_hash`-covered automatically — mutating any field flips the hash (a
`--resume-check` refusal on tamper), with no hash-computation change.

**Bounded budget caps (`kaola-workflow-adaptive-schema.js`).** `OPTIMIZE_ITER_CAP = 50` and
`OPTIMIZE_WALLCLOCK_CAP = 120` (minutes) — byte-identical ×4, living beside `MAX_NODES` in the cap
cluster.

**Output contract (`parseMetricValue`, `kaola-workflow-adaptive-schema.js`).** `metric_command`'s
stdout must carry a column-0 `metric: <number>` line (a signed decimal); last-match-wins, mirroring
`parseNodeVerdict`'s discipline. One-sourced so the role's own evidence and the OPT-5 verifier's
reproduction check parse it identically.

**Freeze rules (OPT-1..6, all fail-closed `errors.push('OPT-N: …')` refusals folded into
`{result:'refuse', reason:'plan_invalid'}`):**

- **OPT-1** — exactly one `optimize(<id>)` block per `metric-optimizer` node, and every block keys a
  node that exists and is `metric-optimizer` (a mis-keyed, missing, or **duplicate** block refuses —
  including a decoy `optimize(<id>):` header fenced inside `## Meta`. `optimizeHeaderCounts` counts
  raw headers from the same fence-inclusive body `parseOptimizeContracts` reads, so a second header
  for one node is caught before `parseOptimizeContracts`'s last-wins `Map.set` can silently clobber the
  first block with a tampered field.)
- **OPT-2 (metric harness definition)** — `metric_command` is named (implicitly required: it is THE
  command that prints the measured metric, so a block with no `metric_command` used to freeze
  in-grammar and only die later at dispatch); `metric_paths` is non-empty, disjoint from the node's
  `declared_write_set`, and every entry is an **exactly-resolvable single file** — a directory-shaped
  (`bench/`), glob (`bench/*.js`), `../`-aliasing (`bench/../src/hot.js`), absolute-path (`/tmp/x.js`,
  `C:\bench\x.js`), backslash-separated (`bench\suite.js`), or bare existing-directory (a slash-less
  name that resolves to a real directory) entry refuses, mirroring the same shape refusals the
  write-set freeze-wall already applies: `hasUnresolvableEntry` (dir-shape/glob detection) plus the
  `../`-segment, absolute-path, backslash, and `statSync`-based bare-existing-directory checks. The
  metric harness can never live inside the mutable scope — a *runtime* write to a metric path is
  separately caught by the existing per-node barrier (a write outside the declared set).
- **OPT-3 (bounded budget)** — `budget_iterations` an integer in `1..OPTIMIZE_ITER_CAP`;
  `budget_wallclock_minutes`, when present, an integer in `1..OPTIMIZE_WALLCLOCK_CAP`.
- **OPT-4** — `direction ∈ {min, max}`; `metric_repeats` an integer ≥ 1; `min_delta` a number ≥ 0.
- **OPT-5 (reproduction gate)** — a change-gate `adversarial-verifier` must post-dominate every
  `metric-optimizer` node, computed via the same `gateUncovered` reachability-after-gate-removal
  check G1/G2 use. The measured metric claim is the node's entire deliverable, so a plan with an
  optimize node uncovered by a downstream `adversarial-verifier` never freezes.
- **OPT-6** — a `regression_gate` must resolve non-empty: the block's own field, or (if absent) the
  Meta `validation_command`. Neither present ⇒ refused — a metric-only ratchet with no regression
  gate is Goodhart bait.

**Numeric field notation — documentation-only, no separate rule.** `budget_iterations`,
`budget_wallclock_minutes`, `metric_repeats`, and `min_delta` all parse through the same `num()`
helper (a plain `Number()`), so any `Number()`-parseable form — hex (`0x14`), exponent (`2e1`), etc. —
converts to its numeric value exactly like a plain decimal. There is no dedicated freeze rule keyed
on notation: OPT-3/OPT-4 bind on the *converted* value, so an out-of-range or malformed field is
caught by the existing bound checks regardless of how it was written — no unbounded escape via an
unusual numeric form.

**Evidence contract (D6).** `ROLE_TOKEN_REGISTRY['metric-optimizer']` (see "Export:
`ROLE_TOKEN_REGISTRY`" below) = `['evidence-binding', 'metric_baseline', 'metric_final',
'iterations_used', 'regression-green']`. `checkEvidenceShape` (`kaola-workflow-adaptive-node.js`)
carries a dedicated `metric-optimizer` branch — unlike the presence-only checks for `tdd-guide`/
`implementer`, it requires each of the four non-binding tokens (`evidence-binding` is checked
earlier, universally, for every role) to carry a **non-empty** column-0 value
(`^<token>:[ \t]*(\S.*)$`), not merely the token key: the seeded open-time stub already carries every
D6 token *key*, so a bare presence check would let a node close COMPLETE on a fully hollow stub with
zero ratchet log. The value itself is otherwise not validated (presence-only, per the function's
documented contract).

**Dispatch-card threading.** `optimizeDispatchCtx(planContent, role, nodeId)`
(`kaola-workflow-adaptive-node.js`) resolves the frozen `optimize(<id>)` contract for a
`metric-optimizer` node and attaches it to the dispatch card as `dispatch.optimize`; when the
contract's `budget_wallclock_minutes` is a positive number it also overrides
`dispatch.wait_budget_minutes` (source `optimize_budget`, replacing the tier-derived
`planner_model`/`role_default` value — see "`opened` payload — `dispatch` sub-object" below). A
non-optimize node, or an optimize node without a frozen contract, gets `{}` back (spread no-op) —
every other dispatch card stays byte-identical to pre-#634.

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
  "codeTreeHash": "<#547: code-relevant-tree content hash; the chains_stale freshness key>",
  "validationTestConsumes": ["<#547: plan validation_test_consumes band widening; [] when none>"],
  "startedAt": "<ISO 8601 timestamp>",
  "chains": [
    { "name": "claude",  "exitCode": 0, "timed_out": false },
    { "name": "codex",   "exitCode": 0, "timed_out": false },
    { "name": "gitlab",  "exitCode": 0, "timed_out": false },
    { "name": "gitea",   "exitCode": 0, "timed_out": false }
  ]
}
```

`exit: 0` means the chain passed; any other value is a failure. `timed_out` (issue #608) is `true` only when the FINAL attempt for that chain was killed by the per-chain kill ceiling (`KAOLA_RUN_CHAINS_TIMEOUT_MS`) rather than exiting on its own — it distinguishes a timeout kill from a genuine test failure without re-running anything; absent on a receipt written before this field existed, which readers must treat as `false`. The receipt is read by `--finalize-check` (self-host mode) to enforce `chains_unverified`, `chains_stale`, and `chains_red` refusals. The receipt records a `source` field (`npm-default`). The `--finalize-check` chain gate is **name-agnostic** — it iterates whatever `chains[]` the receipt records and refuses if any is non-zero and unwaived.

**#547 (D-547-01) freshness re-key.** `chains_stale` now compares `codeTreeHash` — a content address of the code-relevant landable tree (`computeCodeTreeHash`: the #424 allowband + the whole `kaola-workflow/` state tree excluded, MINUS the test-consumed prose `README.md`/`CHANGELOG.md`/`docs/api.md`/`docs/workflow-state-contract.md`/`docs/agents-source.md` + the plan's `validation_test_consumes`, which stay code) — instead of the commit-SHA pin. A commit touching only inert docs (narrative/ADRs, NOT the chain-asserted set above) or workflow-state since the chains ran leaves the hash unchanged, so the receipt stays fresh and the chains are not needlessly re-run; a change to code or a chain-asserted doc (including `README.md`/`CHANGELOG.md`) still flips it. The producer records `codeTreeHash` via the same exported helper the gate recomputes (they never disagree); a legacy receipt lacking the field falls back to the `headSha` pin (fail-closed).

**`--finalize-check` `chains_stale` diagnostics (issue #648 / D-648-01).** When self-host
`--finalize-check --json` refuses with `reason: "chains_stale"`, the refusal envelope may include
best-effort culprit fields:

```json
{
  "result": "refuse",
  "reason": "chains_stale",
  "stale_paths": ["src/example.js"],
  "stale_kind": "code",
  "stale_paths_truncated": true
}
```

- **`stale_paths: string[]`** — sorted validation-visible paths changed since the receipt's stamped
  `headSha`, plus untracked validation-visible paths. The list is capped at 20 entries. Paths ignored
  by `isValidationInvisible()` are omitted, using the receipt's `validationTestConsumes` band so the
  producer and gate classify the same prose set.
- **`stale_paths_truncated: true`** — present only when more than 20 validation-visible stale paths
  exist. Absent means the emitted `stale_paths` list is complete for the best-effort scan.
- **`stale_kind: "code"|"prose-only"|"mixed"`** — classifies the emitted stale set by whether the
  visible paths are code-relevant, validation-consumed prose, or both.

These fields are diagnostic only. They are emitted only when the receipt has a clean stamped head and
the local git diff can be computed; otherwise the refusal degrades to the pre-existing generic
`chains_stale` envelope. Consumers must continue to branch on `reason: "chains_stale"` and apply the
same remedy: rerun the full gated runner and write a fresh receipt. The diagnostic fields do not
alter refusal precedence, `operator_hint`, chain decision semantics, or the attribution sweep.

**Configurable kill ceiling (#512, recalibrated #608).** The per-chain `spawnSync` timeout is configurable via `KAOLA_RUN_CHAINS_TIMEOUT_MS` (default 1800000ms / 30 min, raised from a prior 900000ms / 15 min default after a live run on a constrained host exceeded that bound; invalid/zero/negative → default; no upper clamp). See `resolveTimeoutMs(env)` exported from `kaola-workflow-run-chains.js`. The receipt schema is additively extended (issue #608) — see the `timed_out` field above — not otherwise changed; only the kill ceiling and the receipt's record of whether it fired are governed by this area. See `docs/decisions/D-608-01.md`.

**Dual-mode finalize gate (#475) — self-host vs consumer.** `--finalize-check` auto-detects the repo kind (by whether `package.json` declares any `test:kaola-workflow:*` script) and gates accordingly. `kaola-workflow-run-chains.js` is **self-host-only**:

1. **Self-host (npm)** — `package.json` declares `test:kaola-workflow:*` scripts. The contractor runs `run-chains.js` to produce `.cache/chain-receipt.json`, and `--finalize-check` enforces the chain-receipt gate (`chains_unverified` > `chains_stale` > `chains_red`). `run-chains.js` resolves only the built-in npm edition chains; with no such scripts it refuses `chains_config_missing` and writes no receipt.
2. **Consumer (non-npm)** — a product repo whose validation is not npm-based (a Swift/Xcode app, a Makefile project) does **NOT** run `run-chains.js`. The agent **owns verification** ("Agent Owns Reasoning; Scripts Own Atomicity", #44): it records `.cache/final-validation.md` with a column-0 `verdict: pass`, and `--finalize-check` (consumer mode) gates on that file — `final_validation_unverified` (absent/empty) > `final_validation_failed` (no `verdict: pass`). When a terminal change-gate validation run is cited instead of rerun, agent-facing workflow prose requires column-0 citation lines `source: cited:<node-id>`, `validated_command`, `validated_at_head`, and `reuse_boundary`; these lines document the reuse boundary for humans and later agents. The machine gate intentionally remains unchanged and does not parse those citation fields. The v6.2.0 `kaola-workflow/chains.json` opt-in is **retired** (Pure option A — no opt-in middle-ground).
3. The **attribution sweep** (every `git diff <base>...HEAD` change must be in the `.md` allowband or a `complete` node's declared write set, else `unattributed_change`) runs for **both** modes — the allowband-aware freshness check, so an un-attributed code change is caught regardless of repo kind.

### Candidate-hash binding for consumer final-validation (issue #653 / D-653-01)

The consumer-mode gate above (`final_validation_unverified` / `final_validation_failed`)
previously accepted a bare column-0 `verdict: pass` with no proof it was ever computed against
the candidate tree being finalized — a stale `.cache/final-validation.md` left over from an
earlier candidate would pass silently. `--finalize-check` (consumer mode) now additionally binds
the verdict to a content-address hash of the tree it validated.

**Producer:**

```bash
node scripts/kaola-workflow-plan-validator.js <workflow-plan.md> --candidate-hash [--json]
```

Read-only; executes no tests. Emits the deterministic `computeCodeTreeHash` snapshot of the
CURRENT candidate (committed + working landable tree, minus validation-invisible paths) over the
same `validation_test_consumes` band the self-host chain-receipt producer uses — the frozen
plan's `## Meta` block is the shared source, so producer and gate can never disagree about what
counts as code-relevant. The hash root is `git rev-parse --show-toplevel` (the same discipline as
the #547 self-host arm).

```json
{ "result": "ok", "mode": "candidate-hash", "validated_candidate_hash": "<64-hex-lowercase>" }
```

A git failure (cannot snapshot the worktree) refuses the typed `candidate_hash_unavailable`
(exit 1) instead of emitting a partial or default hash. Non-JSON output prints the exact
recordable column-0 line (`validated_candidate_hash: <hash>`).

**Recording contract.** The agent records the emitted value as a column-0
`validated_candidate_hash:` line in `.cache/final-validation.md`, computed LAST — after every
file the validation covered has landed. Any later relevant edit stales the binding.

**Parser.** `parseValidatedCandidateHash(text)`, exported from `kaola-workflow-adaptive-schema.js`
(×4 byte-identical), follows the exact `parseNodeVerdict` discipline: pure, native multiline
regex, fence-blind column-0 anchor (`^validated_candidate_hash:[ \t]*([0-9a-fA-F]{64})[ \t]*$`,
case-insensitive on the hex, lowercased on read), last-well-formed-match-wins. Returns
`{ present, hash }` — `present` is `true` on any column-0 `validated_candidate_hash:` line
regardless of well-formedness, so a malformed 64-hex value trips the same fail-closed refusal as
an absent field, never a silent partial bind.

**Gate.** In the consumer arm of `--finalize-check`, after the existing `verdict: pass` check:
`!present || !hash` refuses **`final_validation_unbound`**; otherwise the gate recomputes the
current candidate hash (via the same `computeCodeTreeHash` call, or the `--current-code-tree`
test seam) and, on a mismatch, refuses **`final_validation_stale`** with payload
`recorded_candidate_hash` + `current_candidate_hash`. A matching hash's pass payload gains
`validated_candidate_hash`. Extended consumer precedence: `final_validation_unverified >
final_validation_failed > final_validation_unbound > final_validation_stale`. Two operator hints:
`final_validation_unbound` → "final-validation.md lacks a column-0 validated_candidate_hash —
recompute via --candidate-hash --json and re-record after confirming the tree still matches the
validated candidate; if uncertain, re-run the validation command"; `final_validation_stale` → "a
relevant source/test/test-consumed file changed after validation — re-run the recorded
validation_command and re-record final-validation.md (including a fresh hash); never hand-patch
the hash".

**The gate compares two hashes and never re-executes a test.** #475's "the agent owns
verification" boundary is unchanged — this closes only the missing-binding hole, not the
verification boundary itself. The self-host chain-receipt arm is untouched in decision terms
(`boundCandidateHash` stays `null` there, so the key is omitted from that arm's pass payload).
#648's citation fields (`source: cited:<node-id>`, `validated_command`, `validated_at_head`,
`reuse_boundary`) are likewise untouched — prose-only, no parser exists for them — but a citation
now additionally requires a FRESH `validated_candidate_hash:` line computed at citation time,
since the binding is what proves the cited run still covers the candidate. See
`docs/decisions/D-653-01.md` for the full design.

**Pre-tag release gate — `--release-check` (issue #651 / D-651-01).** A check-only,
PLAN-INDEPENDENT twin of the `--finalize-check` chain-receipt arm, invoked directly on
`kaola-workflow-plan-validator.js` with no plan path — at release time the adaptive run is long
archived:

```bash
node scripts/kaola-workflow-plan-validator.js --release-check [--json] [--candidate <sha-ish>] [--receipt <path>]
```

- **Receipt default:** `<git-toplevel>/.cache/chain-receipt.json` — the same bare-cwd path
  `kaola-workflow-run-chains.js`'s default stamp and `kaola-workflow-release.js` both read;
  override with `--receipt`.
- **Candidate:** defaults to `HEAD`; `--candidate <sha-ish>` normalizes via
  `git rev-parse --verify <arg>^{commit}` (an unresolvable candidate fails CLOSED into the stale
  arm). STRICT sha equality against the receipt's `headSha` — the #547 `codeTreeHash`
  content-address relaxation used at adaptive finalize does NOT apply here; a release tag names
  one exact commit.
- **Coverage requirement.** The receipt must COVER every `test:kaola-workflow:*` edition chain
  `package.json` declares. Expected set resolution: `['claude','codex','gitlab','gitea'].filter(n
  => typeof scripts['test:kaola-workflow:'+n] === 'string')` — the identical predicate
  `kaola-workflow-run-chains.js`'s own chain resolution and the `--finalize-check` repo-kind
  discriminator both use, so producer and gate can never disagree about what "the full chain set"
  means. A legitimately-produced subset receipt (e.g. `run-chains.js --chains claude`) is valid
  *producer* output but is never sufficient *release* evidence.
- **Typed refusal precedence** (structural `reason`, never string-matched):
  `chains_unverified` (missing or unparseable receipt) > `chains_stale` (`headSha`
  unbound/`'unknown'`/missing, or `headSha` != candidate — both attempt the hint-only
  `stale_paths`/`stale_kind` culprit diagnostics reused from `--finalize-check`/D-648-01,
  degrading to none when the stamped receipt has no clean bound `headSha` to diff from; or
  `workTreeHash !== 'clean'`, i.e. stamped over a dirty worktree, which attaches no diagnostics)
  > `chains_empty` (empty `chains[]`) > `repo_kind_undetermined` (the expected chain set cannot
  be resolved — `package.json` missing, unreadable, or unparseable, or zero
  `test:kaola-workflow:*` scripts declared; fails CLOSED rather than treat an unresolvable set as
  vacuously covered — deliberately stricter than `--finalize-check`'s ENOENT→consumer-mode
  downgrade, since a release is self-host-by-definition) > `chains_incomplete` (the receipt's
  `chains[]` is a strict subset of the resolved expected set) > `chains_red` (an unwaived red
  chain) > `chains_waived` (ANY `accepted_red` chain refuses — a waiver is legal at adaptive
  finalize but never for a release tag). Coverage is checked BEFORE greenness, so an incomplete
  receipt refuses `chains_incomplete` even when every chain it does carry is green.
- **Pass envelope:**
  ```json
  { "result": "pass", "mode": "release-check", "candidate": "<full sha>", "chains": [{ "name": "claude", "exitCode": 0, "accepted_red": false }] }
  ```
- **Refuse envelope:** the shared `{ result: "refuse", reason, operator_hint, errors: [...] }`
  shape, plus mode-specific fields — `missingChains: string[]` + `expectedChains: string[]` on
  `chains_incomplete` (e.g.
  `{"missingChains":["codex","gitlab","gitea"],"expectedChains":["claude","codex","gitlab","gitea"]}`
  for a claude-only receipt), `redChains: [{name, exitCode, timed_out}]` on `chains_red`,
  `waivedChains: [{name, exitCode, accepted_red_issue}]` on `chains_waived`, and
  `stale_paths`/`stale_paths_truncated`/`stale_kind` (see above) on a sha-mismatch or
  unbound-headSha `chains_stale`. `repo_kind_undetermined` carries no extra structural fields
  beyond the shared shape.
- Self-owned (Self-Sufficient by Default): reads only the receipt file and local `git`; no forge
  or CI/CD calls; zero fs writes; `process.exitCode` only.

See `docs/conventions.md` § Release for the documented pre-tag sequence this gate is wired into,
and `docs/decisions/D-651-01.md` for the design record.

**Release transaction CLI.** `node scripts/kaola-workflow-release.js` accepts
`--verify`, `--prepare --version X.Y.Z [--codex-version A.B.C]`, `--tag --version X.Y.Z`,
`--cut`, or `--push`; add `--json` for the stable machine envelope. `--root <path>` selects a
repository root. `--prepare` also accepts `--date YYYY-MM-DD`; `--issues-closed N,N` supplies the
online closed-issue input used by verify/prepare fixtures.

Success fields are mode-specific:

- prepare: `result:"ok"`, `mode:"prepare"`, `version`, `codex_version`,
  `codex_version_source:"derived"|"explicit"`, `prepared_surface:[{file,sha256}]`,
  `tag:null`, `candidate_authorized:false`; an unchanged replay returns the common identity/surface
  fields plus `idempotent:true` (and omits the new-prepare-only source/authorization fields);
- tag: `result:"ok"`, `mode:"tag"`, `version`, `codex_version`, `candidate_sha`, `tag`,
  and `tag_tree_verified:true`; a fully agreeing replay returns the common binding fields plus
  `idempotent:true` (and omits `tag_tree_verified`);
- verify: `result:"ok"`, `verification:"online"|"offline"`, `changelog_refs`,
  `closed_issues`, `chain_greenness`, and conditional `chain_warning`;
- push: `result:"ok"`, `version`, `tag`, `guidance`.

Every refusal has `result:"refuse"` and stable `reason`; probe failures may add `exit_code`,
changelog refusal adds `missing`, resume dirt may add `changed`, and `--cut` returns
`reason:"cut_compatibility_refusal"` plus `sequence`. Authorization-relevant reason families include
version/binding and release-receipt errors, candidate provenance/content errors, chain receipt errors,
tag conflict/publication-receipt errors, and typed Git-probe or tag create/rollback errors. Consumers
must branch on `reason`, not human text. See `docs/conventions.md` § Release cutting for the exact
state and mutation boundaries. A completed `prepared` row for a prior version in
`.cache/release-receipt.jsonl` makes `--prepare` for the next version refuse
`reason:"stale_release_receipt"`; delete `.cache/release-receipt.jsonl` (and the stale
`.cache/chain-receipt.json`) before starting the next release's `--prepare`.

This CLI does not replace the plan-independent `kaola-workflow-plan-validator.js --release-check`
contract above. The executable order is prepare → release-only commit → offline full-chain receipt →
`--release-check` → tag → post-tag validation/push/publish. Neither command consults an external
pipeline as a gate.

### Export: `ROLE_TOKEN_REGISTRY` (issue #433)

Exported from `scripts/kaola-workflow-plan-validator.js`. The single source of truth for the evidence token vocabulary per role — the token shapes that `open-next`/`open-ready` seed into `.cache/<node-id>.md` stubs and that the close gate verifies.

```js
const { ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator');
// ROLE_TOKEN_REGISTRY: { [role: string]: string[] }
// e.g. { 'code-reviewer': ['verdict: pass', 'findings_blocking: 0'], ... }
```

Each entry is an array of token stubs the evidence file must contain (or have filled by the role agent). Consuming scripts (`kaola-workflow-adaptive-node.js`) import this export to seed `.cache/<node-id>.md` at open time and to validate token presence at close time without reimplementing the vocabulary.

### `opened` payload — `dispatch` sub-object (issue #444 / D-444-01)

All three openers (`open-next`, `open-ready`, and the fused advance in `close-and-open-next`) now produce an `opened.dispatch` sub-object assembled by a single shared `buildDispatch(nodeInfo, context)` function. This closes the #411-class drift: one producer means the three call sites cannot diverge. The pre-existing sibling fields on `opened` (`id`, `role`, `model`, etc.) remain for one release (back-compat), then can be removed.

Stable field set:

```
dispatch: {
  node_id:            string,           // node identifier
  role:               string,           // role token (e.g. 'code-reviewer')
  model:              string|null,      // plan-tier ('reasoning'|'standard'; legacy 'opus'|'sonnet'
                                         //   aliases also accepted, see below) or null
  codex_model:        string|null,      // effective parent-session model from fresh proof; null until
                                         //   proof is available (or when the tier is unresolved)
  codex_model_source: 'parent_session'|'role_default',
  codex_reasoning_effort: string|null,  // effective parent-session effort from fresh proof, or null
  codex_reasoning_effort_source: 'parent_session'|'role_default',
  codex_profile_mode: 'inherit'|null,   // known role profiles omit both runtime keys
  codex_profile_tier: 'standard'|'reasoning'|null, // declarative role class; not a runtime override
  codex_profile_compatible: boolean,   // true for every known inheriting role profile
  codex_session_proof_status?: 'fresh'|'absent'|'stale', // emitted for Codex dispatches
  codex_session_proof_source?: 'session_jsonl',          // bounded parent proof source
  working_dir:        string|undefined, // active worktree path (null until #444 P3)
  declared_write_set: string,           // RAW write-set cell (byte-fidelity)
  evidence_file:      string,           // '.cache/<node-id>.md'
  nonce:              string|null,      // per-open binding nonce (barrier-base SHA prefix)
  required_tokens:    string[],         // from ROLE_TOKEN_REGISTRY (or deriveRequiredTokens)
  forge_rider:        string|null,      // null until a concrete rider is supplied
  guards:             string[],         // computed by deriveGuards (see below)
  goal_line?:         string,           // optional (issue #642); populated from the node's
                                         //   `## Node Briefs` entry when one is authored; key absent
                                         //   when no brief/goal_line was supplied
  upstream_evidence?: Array<{node_id: string, role: string, path: string}>, // optional (issue #642);
                                         //   one entry per `depends_on` id whose upstream role is a
                                         //   PRODUCER role; `path` is the project-qualified
                                         //   `.cache/<node-id>.md` evidence file (barrier-exempt);
                                         //   NEVER a nonce (see anti-fabrication note below); absent
                                         //   for a root/depless node or a briefless plan
  leg_path?:          string,           // optional (issue #591); this member's OWN provisioned
                                         //   `.kw/legs/<project>/<node-id>` worktree — present only
                                         //   when a write lane group co-opens this member; absent/null
                                         //   on the serial or read-only path
  leg_branch?:        string,           // optional (issue #591); this member's leg branch name
                                         //   (`kw/legs/<project>/<node-id>`); absent alongside leg_path
  model_display?:     { claude: string, codex: string, opencode: string }, // optional (issue #610);
                                         //   present only when `model` resolves to a non-null tier
                                         //   (absent for a model-less / role-static node)
  wait_budget_minutes: number,          // tier-derived (reasoning=40 / standard=20 /
                                         //   role-default=20), optimizer-derived, or the frozen
                                         //   planner override; ALWAYS present, never null
  wait_budget_source:  'planner_model' | 'role_default' | 'optimize_budget' | 'planner_override',
                                         // which branch produced the budget
  optimize?:           object,          // optional (issue #634); the frozen optimize(<node-id>)
                                         //   contract — present only for a metric-optimizer node with
                                         //   a frozen contract; see "`## Meta` field `optimize(<node-id>)`"
                                         //   above
}
```

When the validator-shaped node carries `wait_budget_minutes`, `buildDispatch(nodeInfo, context)`
defensively revalidates it against the effective role/model and emits the same integer with source
`planner_override`. The single builder feeds `open-next`, `open-ready`, and fused
`close-and-open-next`; `open-ready` persists the value/source in each durable running-set member,
including rolling top-up members, and `reconcile-running-set` preserves them on survivor
redispatch. Without an override, no optional descriptor/member key is introduced and the existing
tier, role-default, or optimizer dispatch object remains byte-compatible.

**`wait_budget_minutes` / `wait_budget_source` (issue #611 / D-611-01).** Unconditional, unlike the
optional `goal_line`/`leg_path`/`model_display` fields above — every dispatch card carries a wait
budget, never a bare absence, so no join loop is left to guess a timeout. `waitBudgetMinutes(model)`
first runs the raw `model` cell through `normalizeTier()` (a legacy `opus`/`sonnet` cell resolves to
the same budget as its neutral counterpart), then returns `{ wait_budget_minutes,
wait_budget_source }`: tier `reasoning` → `{40, 'planner_model'}`, `standard` → `{20,
'planner_model'}`, any absent/blank/unrecognized tier → `{20, 'role_default'}` (a concrete
role-default, never `null`). The Codex Join Protocol rule this backs: a `running` agent is never
interrupted before its `wait_budget_minutes` elapses. See `docs/plan-run-cards/join-protocol.md` for
the full join-loop/escalation-ladder mechanics that consume this field.

**`optimize` / the `optimize_budget` wait-budget override (issue #634 / D-634-01).** Conditionally
attached exactly like `goal_line`/`leg_path` — `optimizeDispatchCtx()` resolves the frozen
`optimize(<node-id>)` contract for a `metric-optimizer` node and folds it into `buildDispatch()`'s
context; when the contract's `budget_wallclock_minutes` is a positive number it overrides
`wait_budget_minutes`/`wait_budget_source` (`'optimize_budget'`) ahead of the tier-derived value
above, and the contract itself is attached as `dispatch.optimize`. A non-optimize node, or an
optimize node without a frozen contract, gets neither key — its dispatch card is byte-identical to
pre-#634. See "`## Meta` field `optimize(<node-id>)`" above for the full contract shape.

**`codex_model` / `codex_reasoning_effort`, `codex_profile_*`, and `model_display` (issues #610 and #687; current-runtime profile adapter).** A non-null normalized tier selects declarative role metadata and the wait budget; it does not select a Codex runtime pair. Every known role profile omits top-level `model` and `model_reasoning_effort`, so `codexProfilePolicy(role, model)` emits `codex_profile_mode:'inherit'`, the role's `standard`/`reasoning` metadata class, and `codex_profile_compatible:true`. `dispatchEffort()` initially returns a null pair with `parent_session` sources; `buildDispatch()` fills the effective pair only from a fresh, current-thread parent `session_jsonl` proof and exposes `codex_session_proof_status`/`codex_session_proof_source`. Plan-run omits transient runtime overrides and then requires the named child profile to bind correctly and the child's persisted model/effort to equal the re-read parent/card pair. Missing or stale proof, binding drift, and child mismatch refuse as typed runtime failures; `codex_tier_unresolved` remains reserved for a tier that did not normalize. A reasoning-floor role additionally requires fresh parent proof at `gpt-5.6-sol`/`xhigh` or an accepted stronger effort, with missing, stale, and below/unclassified states refusing as `reasoning_floor_proof_missing`, `reasoning_floor_proof_stale`, or `reasoning_floor_violation`. `model_display` remains conditionally attached exactly like `goal_line`/`leg_path` — `buildDispatch()` (and every other `dispatch`/`opened`/`first_node` emitter) calls `modelDisplay(model)` and attaches the key only when the node's resolved tier is non-null. `modelDisplay(tier)` first normalizes legacy aliases, then returns a runtime-native string per key: `claude` is the `Agent(model=…)` alias; `codex` is `"parent session (<tier> tier metadata)"`; and `opencode` is `"<rank> effort variant"`. The raw plan-tier `model` field remains unchanged.

**`leg_path` / `leg_branch` (issue #591 / D-591-01).** Conditionally attached exactly like `goal_line` — `buildDispatch()` sets them only when the caller supplies non-null, non-blank values. `runOpenReady()`'s `opened[]` map is the only caller that ever supplies them, and only for a member co-opened into a write lane group (`legs[n.id]` from the Phase-1 leg provisioning); `open-next`, `close-and-open-next`'s fused advance, and every serial/read-only `open-ready` call pass neither, so `dispatch` there is byte-identical to pre-#591 (no `leg_path`/`leg_branch` key at all). Dispatch each co-opened write leg directly from its own `dispatch.leg_path`/`dispatch.leg_branch` — no need to cross-reference the separate top-level `laneGroup` descriptor (which remains present for group-level observability only; see "`open-ready` response — `laneGroup` field" below).

**`goal_line` / `upstream_evidence` — the durable node-to-node channel (issue #642 / D-642-01).** Conditionally attached exactly like `leg_path`: `deriveDispatchChannel(planContent, node, project, options)` supplies both, and `buildDispatch()` attaches each only when non-empty, so a briefless plan or a root/depless node produces a `dispatch` byte-identical to pre-#642. `goal_line` is the node's `## Node Briefs` entry (a new hash-covered plan section — a column-0 `### <node-id>` heading per brief; `computePlanHash` appends brief coverage only when the section is present, so a briefless plan hashes unchanged). `upstream_evidence` is derived from every frozen `depends_on` edge, re-looked-up from the plan (never from a carried context), as `{node_id, role, path}`. Normally `path` is the project-qualified `.cache/<node-id>.md` evidence file. When a non-last isolated write member is complete but its lane group has not merged, `open-ready` instead points the dependent read to that member's absolute leg-resident artifact; the existing `merge_awaits_read_drain` fence keeps the leg alive until that reader closes, after which the group merge makes the normal parent path authoritative. A declared leg path is fail-closed: missing leg evidence never falls back to a parent seed or decoy. **Anti-fabrication invariant:** `upstream_evidence` entries, every opener, and the cached `.cache/<op>-envelope.json` NEVER carry the upstream's evidence-binding nonce — only line 1 of the upstream's own evidence file (`evidence-binding: <node-id> <nonce>`) carries it, so a consumer cannot fabricate a read-proof from anything the dispatch machinery hands it; it must actually open the upstream file. All three openers (`open-next`, `open-ready`, `close-and-open-next`'s fused advance) wire both fields; a batch `open-ready` open derives each member's OWN brief and OWN upstream list, never shared. On resume/compaction, the in-progress node's re-dispatch context (`goal_line` + `upstream_evidence`) comes from the cached `.cache/<op>-envelope.json` (disk is authoritative — never reconstructed from memory).

**Close-time consumed-proof — `checkUpstreamConsumed` (issue #642 / D-642-01).** Run in both close paths (`close-and-open-next`, `close-node`) immediately after the evidence-shape check and before the barrier — zero ledger mutation on refuse. For each producer upstream in the frozen `depends_on` set whose status is not `n/a` (skipped upstreams are exempt — nothing to consume) and whose `upstream_read: <up-id>` key is present in the consumer's evidence (DD-5 back-compat: the key's KEY presence, not any nonce, gates enforcement — an old in-flight consumer recorded before this feature shipped has no such key and stays exempt), the check reads the upstream's line-1 binding nonce and requires the consumer's evidence to carry a matching column-0 `upstream_read: <up-id> <nonce>` line. A missing or stale echo is a typed `{ result: 'refuse', reason: 'upstream_not_consumed', offending: <up-id>, expectedPath }` — **HARD** (the close genuinely refuses) only when the consumer's role is an `IMPLEMENT_ROLES` member (`tdd-guide`, `build-error-resolver`, `implementer`, `metric-optimizer`) consuming a producer node; every other pairing (e.g. a gate depending on a producer) is advisory only and never blocks. A universal n/a-skip carve-out — a consumer whose own evidence is `n/a — <reason>` proves nothing about whether it read anything, so it is exempt regardless of the echo — mirrors `checkEvidenceShape`'s own n/a carve-out, so the two close gates render the same verdict on the same n/a evidence. Reopening the UPSTREAM (`reopen-node`) rotates its line-1 nonce (`forceRotate`), so any consumer that already echoed the old nonce fails this check on its own next close until it re-reads and re-echoes; reopening the CONSUMER discards its own prior echo the same way.

**Evidence-recording contract per role-kind (issue #643 / D-643-01).** There is one contract, derived from each role's own `tools:` front-matter manifest — no hand-list, no per-agent guesswork. A role WITHOUT `Write`/`Edit` in its tool manifest cannot self-write `.cache` evidence: it RETURNS its full structured deliverable as its final message, and the orchestrator persists it verbatim via `record-evidence --stdin`, which re-injects the node's `evidence-binding: <node-id> <nonce>` header — the role must never add, alter, or strip that header itself. A role WITH `Write`/`Edit` in its manifest SELF-WRITES its evidence directly into the seeded `.cache/{node-id}.md`, reading and preserving the seeded `evidence-binding:` header verbatim and appending its content below it. `ROLE_TOKEN_REGISTRY` (above) is the single source of the content-bearing token(s) each role's evidence must carry beyond `evidence-binding`. For a current nonce-bound open, `checkEvidenceShape` requires every registry class to have a non-empty value (an alternation like `files_to_create|files_to_modify` is satisfied by any one alternative), so removing the seeded keys and substituting free-form prose or a compact summary cannot pass. Only a legacy/offline call without an expected nonce retains the old absent-key exemption for an in-flight artifact; a present key must still be non-empty. A future-agent wall (`validate-vendored-agents.js`'s `checkFutureAgentWall`) machine-enforces both halves — a registry row with at least two tokens (or an explicit `PRESENCE_ONLY_RATIONALE` entry) and a role-kind evidence needle whose KIND is derived the same way (Write/Edit present ⇒ write-kind SELF-WRITE needle required; absent ⇒ read-kind RETURN needle required) — on every node-role agent, so the next agent added to the roster cannot silently ship without either half; an agent `.md` with no parsable `tools:` line at all refuses `agent_contract_manifest_missing` rather than defaulting to the weaker read-kind needle.

**`deriveGuards(nodeInfo)`** computes the `guards[]` array deterministically from the node's role and declared write set. Guard vocabulary (stable order):

- `'read-only'` — GATE_ROLES: `code-reviewer`, `security-reviewer`, `adversarial-verifier`, `main-session-gate`.
- `'RED-fixture-in-$TMPDIR'` — `tdd-guide` role (#424: RED fixtures must not be written to the worktree).
- `'sync:editions'` — write set contains a GENERATED_AGGREGATORS sibling (any of canonical + codex + forge ports); anchor-gated on `edition-sync.js` availability (inert when absent).

### `route-findings` subcommand (issue #446 / D-446-01)

New subcommand on `scripts/kaola-workflow-adaptive-node.js`. Parses a gate node's evidence file (`.cache/{node-id}.md`) `finding:` lines into a structured routing table at `.cache/findings-route.json`. It is a **subcommand, not a new script** — it inherits the existing install-manifest registration of `adaptive-node.js` (no new `SUPPORT_SCRIPT_NAMES` or install-manifest entry required).

**CLI:**

```bash
node scripts/kaola-workflow-adaptive-node.js route-findings --project P --node-id N
```

**Behavior:**

- Reads `.cache/{node-id}.md`, parses each `finding:` line.
- Resolves each finding's `file` against the frozen plan's declared write sets to determine `owning_node`.
- Writes `.cache/findings-route.json` as an array of routing objects (one per parsed `finding:` line).
- Returns `{ result: 'refuse', errors: [...] }` when `--node-id` is missing.

**`.cache/findings-route.json` schema:**

```json
[
  {
    "finding_id": "F1",
    "file": "scripts/kaola-workflow-adaptive-node.js",
    "owning_node": "n4",
    "fix_role": "implementer",
    "status": "open"
  }
]
```

Field contract:

| Field | Type | Description |
|---|---|---|
| `finding_id` | `string` | The finding's identifier from the evidence file (`F1`, `F2`, …) |
| `file` | `string` | The file the finding concerns, parsed from the `finding:` line |
| `owning_node` | `string \| null` | The frozen-plan node whose declared write set contains `file`. **`null` = plan-repair signal**: no node declared the file, so the orchestrator must widen a write set or add a node before a writer can fix it |
| `fix_role` | `string` | Inferred role to route the fix: (1) `security` in finding text → `security-reviewer`; (2) last code-producing node that declared `file` → `implementer`; (3) no producing node → `code-reviewer` |
| `status` | `"open" \| "n/a"` | `open` for an actionable finding; `n/a` for an explicitly dismissed/non-blocking line |

**Auto-invoke on gate-node close.** `close-and-open-next` automatically invokes `route-findings` when the closing node's role is in the `VERDICT_ROLES` set (`code-reviewer`, `security-reviewer`, `adversarial-verifier`, `main-session-gate`). The auto-invoke is **silent and non-blocking**: any error is logged to stderr and NEVER blocks the node advance. A gate node closing clean still produces a `findings-route.json` (possibly an empty array); a gate node with findings produces the routing table as a side effect with no extra operator step. Non-`VERDICT_ROLES` closes do NOT invoke `route-findings`.

**Install surface:** unchanged — `route-findings` is a subcommand of `adaptive-node.js`, which is already in `COMMON_SCRIPTS` and all three `install.sh` `SUPPORT_SCRIPT_NAMES` blocks. No new manifest entry.

---

### `record-evidence --verify` (issue #444 / D-444-01 §4)

New READ-ONLY mode of the `record-evidence` subcommand. Verifies on-disk `.cache/<node-id>.md` without stdin transit — enables proactive pre-close evidence validation with no side effects.

**CLI:** `node kaola-workflow-adaptive-node.js record-evidence --project P --node-id N --verify`

**Returns (JSON):**

- `{ result: 'ok', nodeId, role, evidence_file, evidence_source }` — evidence present, binding header valid, all role tokens found; `evidence_source` is `parent` or `leg`.
- `{ result: 'refuse', reason: 'evidence_absent', nodeId, role, evidence_file, evidence_source }` — the authoritative parent/leg artifact does not exist; a declared leg never falls back to parent evidence.
- `{ result: 'refuse', reason: 'evidence_stale'|'evidence_unbound'|'evidence_shape_failed', nodeId, role, missingTokenClass, evidence_file, evidence_source, expected, detail }` — same reason vocabulary as the close gate (#392).

`--verify` uses `checkEvidenceShape` (the same checker the `close-node` / `close-and-open-next` gate uses), so the two cannot drift. `--verify` writes nothing. `--stdin` and `--verify` are mutually exclusive.

### Lane-group co-open and group-scoped close barrier (issue #437, D-419 P2)

When `KAOLA_LANE_CONTAINMENT=1`, `open-ready` can co-open ≥2 pairwise-disjoint write nodes
as a lane group. The group state is tracked inside `running-set.json` and the barrier is
deferred to the last member's close.

#### `running-set.json` — `lane_group` extension

An optional top-level key `lane_group` is added to `running-set.json`
(`kaola-workflow/{project}/.cache/running-set.json`). Absent when flag OFF; absent after the
group clears (last member close + barrier pass).

```json
{
  "state": "open",
  "max_concurrent": 4,
  "lane_group": {
    "group_id": "lg-n2a-n2b",
    "members": ["n2a", "n2b"],
    "closed_members": [],
    "baseline": "<commit-sha>",
    "write_union": ["scripts/x.js", "scripts/y.js"],
    "openedAt": "2026-06-13T10:12:00.000Z"
  },
  "nodes": [
    { "id": "n2a", "group_id": "lg-n2a-n2b", "role": "implementer", "kind": "write",
      "declared_write_set": "scripts/x.js", "model": "reasoning", "baseline": "recorded" }
  ]
}
```

Field contract:

| field | type | description |
|---|---|---|
| `group_id` | string | `'lg-' + sortedMemberIds.join('-')`, sanitized for file/ref keys |
| `members` | string[] | FULL bare member id list — STABLE during group lifetime (never shrunk) |
| `closed_members` | string[] | accumulates each member id as it closes; last-member = every other id is in this set |
| `baseline` | string | shared group baseline SHA, recorded via `--record-base --node-id <group_id>` at open time |
| `write_union` | string[] | union of each member's `declared_write_set` (convenience snapshot; barrier re-reads the plan) |
| `openedAt` | ISO 8601 | set at open time |

Each node entry inside `nodes` gains an optional `group_id` string field (the lane group it
belongs to). Serial / read-only nodes have no `group_id` field.

**Top-level `max_concurrent` when `lane_group` is present (issue #588 / D-588-01).** For a
write lane group, `max_concurrent` is pinned to the WRITE-cap ceiling the group actually
co-opened under (`resolveFanoutCap` folded with `--max`; default 4) — **not** the read-only
cap (`resolveFanoutCapReadonly`, default 8) used on a pure-read frontier. This lets
`reconcile-running-set` use `max_concurrent` as a single crash-resume roll-forward ceiling
correctly for both frontier kinds; recording the read cap for a write group previously let a
crash-resume reconcile roll a write group forward to more members than co-open could ever
legally open (fixed by #588 — see the CHANGELOG and decision record for the pre-fix defect).

#### `--parallel-safe --nodes A,B[,C] --json` (plan-validator.js)

READ-ONLY check exposing the existing antichain pair-loop predicates (exact-file overlap +
`classifier.disjointWriteSets`). No fs writes, no baseline, no git diff. Called by
`tryFormLaneGroup` (adaptive-node.js L2522) before forming a co-open group.

**CLI:**
```bash
node scripts/kaola-workflow-plan-validator.js <planPath> --parallel-safe --nodes A,B --json
```

**Success response:**
```json
{ "result": "ok", "nodes": ["A", "B"], "overlapping": [] }
```

**Refuse response (overlap):**
```json
{
  "result": "refuse",
  "reason": "overlapping_write_sets",
  "nodes": ["A", "B"],
  "overlapping": [{ "a": "A", "b": "B", "kind": "exact", "path": "scripts/x.js" }]
}
```

`overlapping[].kind` is `'exact'` (exact-file clash) or the classifier verdict string (e.g.
`'yellow'`) for coarse/shared-infra overlap.

**Other typed refusals:**

| reason | condition |
|---|---|
| `missing_nodes` | `--nodes` flag absent |
| `too_few_nodes` | fewer than 2 node ids supplied |
| `node_not_found` | one or more named ids are not in the frozen plan |

#### `--group-barrier --group-id <id> [--member <id>] [--skip-root-pin] --json` (plan-validator.js)

The GROUP-scoped close barrier. Invoked once at the LAST group member's close. Diffs the group
baseline → a now-snapshot and calls `barrierCheck` with `opts.groupMembers` (the UNION
allowlist). An out-of-union path hits the EXISTING rank-4 `unattributed_write` /
`write_set_overflow` arm — no new reason code.

**CLI:**
```bash
node scripts/kaola-workflow-plan-validator.js <planPath> \
  --group-barrier --group-id lg-n2a-n2b --json
```

**Success response** (barrierCheck envelope):
```json
{ "result": "pass", "errors": [] }
```

**Typed refusals:**

| reason | condition |
|---|---|
| `write_set_overflow` / `unattributed_write` | a diff path belongs to no member's declared set |
| `running_set_unreadable` | cannot read/parse `running-set.json` |
| `group_not_found` | named `group_id` absent or mismatched in `running-set.json`; or `lane_group.members` is empty |
| `no_group_base` | no recorded baseline for `<group_id>` |
| `barrier_base_mismatch` | `.cache` SHA ≠ gc-anchored ref SHA (anti-laundering guard, #368) |
| `root_mismatch` | barrier called outside the repo toplevel (suppress with `--skip-root-pin`) |

Reads `running-set.json` from beside the plan to learn `lane_group.members` and the baseline.
The `--member <id>` flag supplements `lg.members` in the alternate ordering where the last
member is removed before the barrier runs (not required under the preferred ordering).

#### `open-ready` response — `laneGroup` field

When a co-open forms a lane group, the `open-ready` response carries an additive `laneGroup`
field (absent on the serial/read path):

```json
{
  "result": "ok",
  "kind": "write",
  "opened": [{ "id": "n2a", ... }, { "id": "n2b", ... }],
  "laneGroup": {
    "group_id": "lg-n2a-n2b",
    "members": ["n2a", "n2b"],
    "baseline": "<sha>",
    "write_union": ["scripts/x.js", "scripts/y.js"]
  },
  "taskTransitions": [...]
}
```

On the serial/read path (`laneGroup` absent) the response shape is byte-identical to pre-#437.

**Per-member leg routing lives on `dispatch`, not `laneGroup` (issue #591 / D-591-01).** Each
`opened[]` entry's own `dispatch` sub-object carries that member's `leg_path`/`leg_branch`
(see the `dispatch` sub-object stable field set above) — dispatch each leg directly from its
own member's `dispatch.leg_path`/`dispatch.leg_branch`, with no need to cross-reference
`laneGroup` for routing. `laneGroup` (and its convenience `write_union`/`baseline`) is
retained for group-level observability only.

#### `close-node` response — `barrier` field extension

For a group member, `close-node` extends the `barrier` field beyond the per-node shape:

| `barrier` value | condition |
|---|---|
| `'deferred_to_group'` | non-last member; diff barrier deferred; compliance row carries this literal |
| `'group_passed'` | last member; group barrier ran and passed; `lane_group` cleared |

On the serial path the `barrier` field is absent (unchanged from pre-#437). Typed refusals
gained for group members:

| reason | condition |
|---|---|
| `member_vacuity` | in-lane `git status --porcelain` returned no changes and evidence has no `no_op: <reason>` line |
| `group_barrier_failed` | the group barrier refused (passthrough of the validator's reason) |

### `reconcile-running-set` — writer kill-safety verdicts (issue #611, D-611-01)

The Codex Join Protocol's writer kill-safety mechanism, layered onto the existing
`reconcile-running-set` crash-repair subcommand (no new subcommand — reuse before adding). After
classifying which members roll forward, roll back, or are stale/capped-out (the pre-existing
mechanics), every WRITER member (`kind === 'write'`) that is LEAVING the live set on this call is
diffed against its declared write set via `--barrier-check` — the SAME baseline+diff the per-node
barrier uses — BEFORE the existing `--drop-base` loop (which removes the baseline the diff needs). A
read/gate member is never a writer and is skipped.

**Response fields (additive to the pre-existing `rolledForward`/`rolledBack`/`closedDropped`/`staleDropped`):**

```json
{
  "result": "ok",
  "reconciled": true,
  "rolledForward": ["n3-impl"],
  "rolledBack": ["n4-impl"],
  "writerReconciliation": [
    { "node_id": "n4-impl", "verdict": "adopt", "reason": "in_write_set", "outOfWriteSet": [] },
    { "node_id": "n5-impl", "verdict": "halt", "reason": "write_set_overflow", "outOfWriteSet": ["scripts/unrelated.js"] }
  ],
  "writerHalt": true,
  "state": "open"
}
```

`classifyWriterReconcile(nodeId, bc)` truth table — POSITIVE CONFIRMATION, fail-closed (`adopt`
requires an EXPLICIT clean result; every other shape halts):

| `bc` (the `--barrier-check` result) | `verdict` | `reason` | `outOfWriteSet` |
|---|---|---|---|
| `null` / non-object (shell threw, or unparseable) | `halt` | `barrier_unavailable` | `[]` |
| `{result:'refuse', outOfAllow:[…non-empty]}` | `halt` | `write_set_overflow` (or `bc.reason` if present) | the named paths |
| `{result:'refuse', reason:'no_barrier_base'}` | `adopt` | `no_baseline` (vacuous — writer never wrote under tracking) | `[]` |
| `{result:'refuse', …other}` | `halt` | `barrier_refused` (or `bc.reason` if present) | `[]` |
| `{result:'pass'}` / `{result:'ok'}` | `adopt` | `in_write_set` | `[]` |
| resultless (e.g. `{exitCode:N}` from a crashed/killed/non-JSON subprocess) or an unrecognized `result` token | `halt` | `barrier_unverifiable` | `[]` |

`verdict: adopt` needs no further action. `verdict: halt` means the writer's changes could not be
confirmed clean — do **not** re-open the node directly; resolve the named `outOfWriteSet` paths
first (`revert-overflow` to discard them, attempt-bound `repair-node` when the frozen DAG still has
one admissible owner, planner-owned `kaola-workflow-replan.js` when repair returns
`repair_requires_replan`, or a consent halt if the resolution is a judgment call), THEN re-open.
Skipping straight to `open-next`/`open-ready`
on a `halt` verdict is the halt-then-reopen laundering hole this mechanism closes.

Reconcile itself is **non-destructive** — it never auto-deletes a file. The design issue's own AC3
asked for a typed `adopt | revert | halt` output; the shipped classifier emits only `adopt|halt`
from `reconcile-running-set`, with `revert` retained as the vocabulary token the ORCHESTRATOR may
act on via the pre-existing `revert-overflow` subcommand — see `docs/decisions/D-611-01.md` §
Alternatives considered for why the revert is a separate, explicit step rather than something
reconcile performs inline. See `docs/plan-run-cards/join-protocol.md` § 4 for the full
orchestrator-facing procedure.

## Configuration

Configuration files control workflow behavior and issue sorting.

### Global config

`~/.config/kaola-workflow/config.json` (optional):

```json
{
  "parallel_mode": "auto",
  "pr_auto_merge": false,
  "mr_auto_merge": false,
  "installed_paths": []
}
```

- `parallel_mode` — Parallel-work classification strategy (`auto` or other); see README § Classifier configuration
- `pr_auto_merge` — Enable automatic PR merge after creation (GitHub + Gitea editions; squash merge with source branch deletion; non-fatal if merge fails)
- `mr_auto_merge` — Enable automatic MR merge after creation (GitLab edition; equivalent to `glab mr merge --auto-merge`; non-fatal if merge fails)
- `installed_paths` — List of install-time opt-in paths (`"fast"` and/or `"full"`); default `[]` (adaptive-only). Adaptive is implicit-always and never appears in this array. Written by `install.sh --with-fast` / `--with-full` (read-modify-write UNION, preserving other fields; never removes). Resolved by `resolveInstalledPaths(config)` in `kaola-workflow-adaptive-schema.js`. No env override. See `docs/workflow-state-contract.md` § Adaptive Path — `installed_paths` Config Field
- `KAOLA_LANE_CONTAINMENT` (#376) — fail-closed env flag (default false; only `1`/`true`/`yes` enables) that arms rules (a)/(b) — the lane-containment arm — of the write-lane PreToolUse hook (`hooks/kaola-workflow-write-lane.sh`). When ON and a `kaola-workflow/<project>/.cache/running-set.json` manifest of open write-nodes exists, the hook DENIES (exit 2) an out-of-lane `Write`/`Edit` — inside a member worktree outside its declared lane, or in the parent worktree matching an open node's lane. Fail-open (exit 0) on a missing flag/manifest, malformed stdin, or non-git cwd; dormant until the #377 scheduler produces the manifest. Successor of the retired #320 `KAOLA_BATCH_CWD_ENFORCED`.
- `KAOLA_GATE_WINDOW_FENCE` (#607) — a SECOND, independent switch on the SAME write-lane hook, arming rule (c) — the gate-window fence — evaluated FIRST, ahead of the `KAOLA_LANE_CONTAINMENT` rules above (so it fires regardless of that flag's setting). DEFAULT-ON: only `0`/`false`/`no` disables it; any other value, including unset, keeps it ON. While any node in `running-set.json` carries `kind:'gate'` (an open `main-session-gate` — see `docs/workflow-state-contract.md` § `kind: 'gate'` member), the hook DENIES (exit 2) an in-worktree, out-of-band `Write`/`Edit` landing outside the workflow bands (`kaola-workflow/`, any `.cache/`), UNLESS it is under the `.kw/` band (member worktrees / per-node legs / co-open speculative work), inside a member worktree (governed by rules (a)/(b) instead), or under a live co-open writer's own declared lane (so a #596 speculative write co-opened behind the same gate is unaffected). Every existing fail-open exit is unchanged when no gate is open: a missing manifest, an unparseable stdin payload, or a non-git cwd all still exit 0. See `docs/decisions/D-607-01.md`.

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

Validates a frozen adaptive `workflow-plan.md` against the closed grammar and computes the auto-run / ask / typed-refusal governance decision (issue #227; see README § Adaptive path). The agent freely authors any in-grammar DAG of role nodes; this script proves the result is in-grammar and classifies its risk. It is **toggle-agnostic** — it never reads `installed_paths` or any path-selection config (path selection is gated at `claimProject`, never at well-formedness or resume). Root and its byte-identical Codex copy share the contract; the GitLab and Gitea editions carry the same contract in a forge-adapted copy.

Plan sections are identified structurally, outside Markdown fences. An opening backtick or tilde fence establishes its delimiter family and run length; only a same-family delimiter with at least that run length and an empty suffix closes it. Headings inside a fence, after a shorter delimiter, or after an info-suffixed delimiter line are decoys, not section boundaries. A requested section has the state `absent`, `present`, or `ambiguous`: duplicate genuine headings and unclosed fencing are malformed input and refuse structurally instead of selecting an arbitrary body. `## Node Briefs` uses the same transition for its `### <node-id>` entries. Consequently a fenced-decoy-only Briefs heading is equivalent to an absent Briefs section and preserves the briefless plan hash, while genuine Briefs are hash-covered and duplicate or unclosed Briefs refuse as `briefs_section_ambiguous` before freeze.

**Usage:**

```bash
kaola-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze [--repair]] [--resume-check] [--gate-verify] [--record-base --node-id ID] [--barrier-check [--node-id ID] [--base REF]] [--verdict-check [--node-id ID]] [--selector-check --node-id ID]
```

**Modes** (not mutually exclusive — a silent precedence applies when more than one mode flag is given, no error is raised): `--resume-check` takes effect first, then `--freeze`, then `--gate-verify`, then `--record-base`, then `--barrier-check`, then `--selector-check`, then `--verdict-check`, then the default validate (`resume-check > freeze > gate-verify > record-base > barrier-check > selector-check > verdict-check > default`); `--help` / `-h` / no args short-circuit ahead of all of them. `--json` is not a mode — it composes with whichever mode runs.

- **default** — Validate and print the governance verdict. In-grammar prints `in-grammar: auto-run` or `in-grammar: ask — <reasons>`; out of grammar prints `typed refusal (out of grammar): <errors>`.
- **`--freeze`** — Validate, and if in-grammar, compute the `plan_hash` and write it into the plan file as an HTML comment. Prints `frozen (<decision>) plan_hash=<sha256>` on success. After freeze the plan's `## Meta` + `## Nodes` are author-immutable. With **`--repair`** (issue #308), first reconcile the `## Node Ledger` to `## Nodes` — adding a `pending` row for any node present in `## Nodes` but missing from the ledger, **never** dropping or rewriting an existing status — then freeze. The reconcile cannot move `plan_hash` (the hash covers only `## Meta` + `## Nodes`), so a node added to a frozen plan can be re-frozen-with-repair to give it a schedulable ledger row without re-stamping. The JSON output adds `"reconciled": [<ids>]`.
  - **Write-set shape refusals (issue #381, freeze-only; round-2 shapes #388).** `validatePlan`'s per-entry loop refuses two write-set shapes that freeze in-grammar today but are **dead at the exact-path barrier** (`barrierCheck` matches by exact membership, so a directory grant can never match a real file write and would escalate a mechanical authoring artifact to a mid-run consent halt): (i) a **directory-shaped** entry — a token ending in `/` after `classifier.normalizeRepoPath` (`src/`, `./src/`, `src//`) → `node <id> declared_write_set entry "<tok>" is directory-shaped — declare exact file paths`; and (ii) a token containing a **`..`** path segment → `node <id> declared_write_set token "<tok>" contains '..' — declare exact in-repo file paths`. Both are checked at freeze as write-set **shape** refusals, independent of write-set size (there is no per-node file-count ceiling — #453). Exact root-level / dot-leading files (`Dockerfile`, `.gitlab-ci.yml`, `.github/workflows/x.yml`) are unaffected (the check keys on a trailing `/` only). This is **freeze-only**: `--resume-check` does **not** apply it, so an in-flight plan frozen by a pre-#381 validator (a then-legal directory entry) still resumes — its barrier failure now classifies as `write_set_granularity` (#404, see the "Validator subcommand emit/refuse" section above) and surfaces a per-class actionable consent-halt ("re-author to the exact files + re-freeze"). (The mid-run **auto-repair** lane — auto-narrowing a directory grant to the enumerated files without a consent halt — was **proven unbuildable-safe and permanently deferred** in #404: `revalidateForResume` only asserts `stored === computePlanHash(content)`, but `freezePlan→injectHash` re-stamps the hash over the just-mutated `## Nodes`, so any post-repair integrity gate validates the mutated plan against its own fresh hash and is always green — freeze is the only legitimacy oracle and cannot check itself. #404 ships the typed `write_set_granularity` classification + per-class halts only; the auto-repair machine is not built.) **Round-2 shapes (#388):** a second pass of freeze-only write-set shape refusals adds checks for additional dead-at-barrier patterns identified after #381.
  - **`ledger_header_invalid` (issue #425, freeze-only).** `validatePlan` refuses when a `## Node Ledger` section is present but its header row does not carry `id` as its first data column (case-insensitive; `| id | status |` is canonical). The refusal names the columns that WERE found: `ledger_header_invalid: found columns [<col>, ...], expected first column "id"`. This is a **freeze wall**: the error fires at `--freeze` (and default `--json` validate) but NOT at `--resume-check`, so a plan frozen by a pre-#425 validator whose ledger uses a non-canonical header still resumes without interruption. **How to fix:** rename the first column to `id` and re-freeze; or use `--freeze --repair` to auto-normalize recognized aliases (`node`, `node_id`, `node-id` → `id`), then re-freeze. `--repair` emits `"header_normalized": true` in its JSON output. Rationale: D-425-01.
  - **`generated_port_split` (issue #431, freeze-only).** `validatePlan` refuses when a node's declared write set contains a canonical script that is a member of `GENERATED_AGGREGATORS` (imported from `scripts/edition-sync.js`, anchor-gated inert when the module is absent) but does NOT also declare all three edition peers (the Codex byte-twin `plugins/kaola-workflow/scripts/<base>` and both forge-named ports) in the SAME node. The refusal names the node and the missing peers: `generated_port_split: node <id> declares "<canonical>" without edition peers <peers> in the same node — declare all four edition files together`. This is a **freeze wall**: the error fires at `--freeze` (and default `--json` validate) but NOT at `--resume-check`. **How to fix:** move the port declarations into the same node as the canonical so all four edition files are co-declared (a single node may — and must — declare all four edition files together; there is no per-node file-count ceiling, #453). Rationale: D-431-01. **Atomic freeze (#389):** `freezePlan` now writes the `plan_hash` via `writeFileAtomicReplace` (write-to-temp-then-rename), eliminating a torn-plan race where a crash mid-write left `workflow-plan.md` truncated; existing behavior is byte-identical on non-crash paths. **Point-of-use `model_invalid` gate (#390):** the `model_invalid` typed refusal (a non-empty model cell outside the two-tier vocabulary) fires at the point of use in `computeNextAction` (`open-next`/dispatch), not at `--resume-check` — so a hash-stamped or pre-#382 plan that passes `--resume-check` but carries an out-of-vocabulary tier is refused before the node is dispatched (freeze-time still refuses a fresh tier via the #382 wall; #390 additionally refuses a finalize-sink model at freeze for symmetry).
  - **`glob_in_path` (issue #587, freeze-only).** `validatePlan`'s per-token write-set shape loop refuses a token containing a **glob metacharacter** (`* ? [ ] { }`) — checked in the same per-token pass as the #388 shape checks (after `backslash_in_path`, before the trailing-`/` directory-shaped and `..` arms), so `**/*.md` or `src/*.js` is reported as `glob_in_path` rather than silently accepted. A glob token parses in-grammar today (`areaForPath` degenerates it to a bogus area like `**`, which can look disjoint from a sibling leg's write set at freeze) but never matches at the **exact-path barrier**, so it dies late at runtime as `write_set_overflow` — the same "mechanical authoring artifact escalates to a maximally-expensive consent halt" failure mode the #381/#388 shape checks close. Refusal: `node <id> declared_write_set token "<tok>" contains a glob metacharacter (glob_in_path) — declare exact file paths (a glob never matches at the exact-path barrier; expand it to the concrete files)`. Freeze-only, same as its sibling shape checks. Rationale: D-587-01.
  - **`parallel_allowband_collision` (issue #587, freeze-only).** The `.md` allowband (`docs/**`, `CHANGELOG.md`, `README.md` — see "`.md` files as production surfaces" above) is barrier-**invisible**: the per-node barrier never flags a write inside it, and `git merge` silently both-applies two legs' edits to it. That makes a collision invisible to BOTH the freeze disjointness proof (two legs on different allowband files, or the same file never declared by either, can look disjoint) AND the runtime barrier. `validatePlan` now requires the allowband be declared on **exactly one leg** of any parallel group — checked for a declared `fanout(<group>)` group (alongside the existing pairwise-disjoint check) and for an inferred antichain-sibling pair (alongside the #232 concurrent-sibling exact/coarse checks) — refusing when 2 or more legs each declare a `CHANGELOG.md` / `README.md` / `docs/**` path, even DIFFERENT allowband surfaces (`CHANGELOG.md` on one leg, `README.md` on another). Excludes `kaola-workflow/{project}/**` (per-node `.cache` evidence legitimately differs per leg). Serial runs are unaffected — this is a parallel-group-only freeze check. Refusal shapes: `fan-out group "<g>" declares a barrier-invisible allowband surface on <n> legs (<id>:"<path>", ...) (parallel_allowband_collision) — ...` and `concurrent siblings <A> and <B> both declare a barrier-invisible allowband surface ("<p1>", "<p2>") (parallel_allowband_collision) — ...`. Rationale: D-587-01.
  - **Cross-node case-fold (issue #587).** The two cross-node exact-path/coarse-area disjointness comparisons above — the declared fan-out group's `classifier.disjointWriteSets` call and the #232 antichain-sibling exact-clobber check — now lowercase the path (and, for the coarse arm, the `areaForPath` result) before comparing across nodes/legs, so `Src/x.js` on one leg and `src/x.js` on another are recognized as the same physical file and refuse at freeze on a case-insensitive filesystem. This is additive to the EXISTING reasons (`fan-out group "<g>" write sets not pairwise disjoint (...)`, `concurrent siblings <A> and <B> both write "<path>" (parallel non-fanout write overlap)`) — no new reason code, no relaxation of an existing one. `classifier.normalizeRepoPath` and the same-node sibling `case_collision` check (#388) are unaffected. The `--parallel-safe` runtime co-open check retains its own separate exact-file-overlap loop, which this change does NOT touch (its coarse/shared-infra arm is case-folded incidentally, since it also calls `classifier.disjointWriteSets`). Rationale: D-587-01.
  - **Per-node model tier (issue #382; renamed to neutral tier tokens by issue #610).** `## Nodes` carries an optional **`model`** column with the closed two-tier vocabulary `NODE_MODEL_TIERS = {reasoning, standard}` (defined in `kaola-workflow-adaptive-schema.js`); `—`/absent ⇒ today's role-static resolution (back-compat, hash-stable). **Legacy aliases:** the pre-#610 tokens `opus`/`sonnet` remain permanently accepted and normalize to `reasoning`/`standard` respectively via `normalizeTier(token)` — every tier consumer (`TIER_RANK`, `dispatchEffort`, `mapTier`, `dispatchEffortOpencode`, `dispatchModelClaude`, `dispatchModelCodex`, the synthesizer reasoning-floor check) routes through this one normalizer, so a legacy cell resolves identically to its neutral counterpart everywhere. Frozen/archived plans keep their bytes — an alias validates at parse with no rewrite, `plan_hash` and `--resume-check` are unaffected, and legacy aliases continue to dispatch identically to their neutral counterparts; only newly authored plans are expected to write the neutral tokens. The planner assigns the tier per node (it is the only component that sees the task; #44); `next-action.computeNextAction` resolves `node.model || resolveModel(node.role)`, so an absent cell uses the static role default. The tier threads through every dispatch surface (serial `open-next`, the `open-ready` running-set scheduler — whose `running-set.json` members persist `model` for crash/reconcile re-dispatch — and the batch path). **Freeze-time refusals:** a non-empty cell outside the vocabulary (neutral token or legacy alias) → `node <id> model "<tok>" is not a valid tier (model_invalid)`; a `main-session-gate` carrying a model → refusal (it is never dispatched as a subagent). **Per-edition dispatch mapping:** on Claude editions the tier maps to the `Agent(model=…)` param via `dispatchModelClaude` (`reasoning`→`"opus"`, `standard`→`"sonnet"`). On current Codex, every standalone role profile omits both runtime keys and inherits the parent session; the role's standard/reasoning class remains declarative metadata and determines the 20/40-minute default wait budget. Dispatch cards carry `codex_profile_mode:'inherit'`, `codex_profile_tier`, and `codex_profile_compatible` with `parent_session` sources. On opencode, `mapTier` resolves the tier to a `TIER_RANK` (`reasoning`→`top`, `standard`→`second`) and then to a provider-contract effort variant (see `docs/opencode-edition.md`). Codex plan-run omits transient `model`/`reasoning_effort` arguments in both V2 and V1, loads a bounded thread-bound parent JSONL proof, and requires the named child profile plus the persisted child `turn_context.model`/`.effort` to match the re-read parent/card pair. Missing or stale proof, ambiguous binding, a profile mismatch, or a child-pair mismatch fails closed with typed refusals; a genuinely unresolved declarative tier remains `codex_tier_unresolved`. Both modes use `fork_turns: "none"`. Each Codex DAG node role writes its full nonce-bound result directly to `dispatch.evidence_file`, returns only a compact summary, and plan-run runs `record-evidence --verify` before exposing the file through `dispatch.upstream_evidence`; an encrypted summary failure may continue only with a terminal child and a verified cache artifact. The out-of-ledger `workflow-planner` and `contractor` roles keep their complete canonical workflow artifacts as the durable full result, return a compact summary, and mirror into a seeded cache when supplied. The `<role>-max` variants shipped in #405 are retired (#451, #582). `plan_hash` covers `## Meta` + `## Nodes`, so model assignments seal at freeze and survive `--resume-check`. **`model_display` envelope field:** every dispatch/handoff emission that carries a non-null `model` additionally attaches a `model_display` object via `modelDisplay(tier)` — see the "`opened` payload — `dispatch` sub-object" section above for the field shape and per-runtime string formats.

  - **Per-node join-floor override.** `## Nodes` may carry an optional
    `wait_budget_minutes` column. Absent, blank, `-`, and `—` cells project no override key, so
    legacy validator, descriptor, dispatch, and running-set shapes remain byte-compatible. A
    present cell must be a strict base-10 integer from the effective role/model floor (standard 20,
    reasoning 40) through 720 inclusive. `finalize` and `main-session-gate` refuse it because they
    are nondelegable; a `metric-optimizer` also refuses it when
    `optimize(<id>).budget_wallclock_minutes` is present. Typed reasons are
    `wait_budget_noninteger`, `wait_budget_below_floor`, `wait_budget_above_cap`,
    `wait_budget_nondelegable`, and `wait_budget_conflict`. The validator-shaped node exposes
    optional numeric `wait_budget_minutes`; next-action conditionally projects that field after
    resolving the effective role/model and reapplying current validation. This point-of-use wall
    permits an old frozen plan with a previously unknown column to remain hash/resume compatible,
    but refuses an invalid value before activation.
- **`--resume-check`** — Re-validate **only** closed-library membership, structural grammar, and `plan_hash` integrity — **not** the full gate rubric (re-running it would brick an in-flight plan if the rubric tightened after freeze). Prints `resume ok` or `typed refusal: <reason>`.
- **`--gate-verify`** (issue #231) — Verify gate **execution** over the `## Node Ledger`: a *completed* `code-reviewer` must post-dominate every completed code-producing node (G1), a *completed* `security-reviewer` every completed sensitive node (G2), and (issue #334) a *completed* `main-session-gate` every completed code-producing node when the plan declares one (**G3** — a non-delegable acceptance gate also has no legal `n/a` route, so an `n/a` gate row is an unsatisfied gate outright). A required gate left pending or marked `n/a` while a node it covers is `complete` is an unsatisfied gate. PURE + toggle-agnostic (reads parsed nodes + ledger only). Prints `gate execution verified` or `typed refusal: <unsatisfied>`. Surfaced non-blocking by `routeAdaptive` (as `pendingGates`) and enforced as a hard merge gate in Finalization.
- **`--record-base --node-id ID`** (issue #239) — Snapshot the **full worktree** (tracked + untracked, honoring `.gitignore`) as node `ID`'s per-instance baseline at node start, via a throwaway index (`git add -A` into a temp `GIT_INDEX_FILE` outside the repo → `git write-tree`), and store the tree SHA in `.cache/barrier-base-<id>`. **Idempotent**: if a baseline already exists for the node it is *reused* (`reused: true`), so a crash + re-dispatch or a consent-halt re-entry never re-snapshots a now-dirty tree and launders the crashed attempt's writes. Refuses without `--node-id`. Prints `recorded base <tree> for node <id>` / `reused base …`.
- **`--barrier-check [--node-id ID] [--base REF]`** (issue #231; per-node tree-diff #239) — Re-scan the files actually written and refuse on (a) a Phase-5 **sensitive** actual write when the plan has no `security-reviewer` node (closes H1), (b) an out-of-**allowlist** production write — a non-docs, non-test, non-`kaola-workflow/` write not in the allowlist (closes H3), or (c) a **foreign-project archive** write — an actual write under `kaola-workflow/archive/<X>/` whose `<X>` is neither the finalized project nor its `<project>.archived-<ts>` collision-rename (issue #261). Fix (c) scopes the otherwise-blanket `kaola-workflow/` artifact exemption so a stray cross-issue `archive/<other>/` folder cannot reach a protected branch undetected; the finalized project is `opts.project`, threaded from the validator's `projTag` (the basename of the directory holding `workflow-plan.md`), and the check is fail-closed (absent project ⇒ any archive write is treated as foreign). Two modes:
  - **Whole-plan** (no `--node-id`, the Finalization merge gate): `git diff --name-only` vs the merge-base of `HEAD` and `--base` (default `origin/main`; cumulative, so committed sensitive writes are not invisible), allowlist = the **union** of all declared write sets, plus the v3.20.1 ledger-consistency floor.
  - **Per-node** (`--node-id ID`): tree-diff (`git diff-tree`) the current full-worktree snapshot against the node's **recorded node-start snapshot** (`--record-base`), so it attributes **exactly this node's own changes** — new / modified / deleted, tracked or untracked — without over-attributing prior nodes' still-uncommitted source or pre-existing strays, and checks them against the node's **own** declared write set. `--base` is **rejected** here (the baseline is the recorded snapshot; honoring `--base HEAD` after a commit would empty the diff and neuter the gate); fail-closed if no base was recorded.

  PURE core (`barrierCheck(content, actualPaths, opts)`); only the CLI shells out to git, failing closed (typed refusal) on any git error. Prints `barrier ok` or `typed refusal: <errors>`.
- **`--verdict-check [--node-id ID]`** (issue #251) — Verify every completed gate-role node under the frozen plan contract. For contract 1 it requires the legacy `.cache` evidence block `verdict: pass` and `findings_blocking: 0`; an explicit adversarial fan-out uses exact frozen membership/dependency origin and majority-refute (`refutes * 2 >= verdicts.length` refuses, so an even-width tie fails). For contract 2 it loads each member's evidence-bound normalized receipt, checks schema/context/behavior/profile/candidate identity plus current-candidate freshness, then applies the declared `sequence`, `replicated_majority`, or `partitioned_all` reducer; a complete investigation's `gate_effect:none` is accepted analytically. The gate-role set is `code-reviewer`, `security-reviewer`, `adversarial-verifier`, and (issue #334) `main-session-gate`. Exit 1 on any failure. Per-node (`--node-id ID`) checks one node and non-gate roles self-skip; whole-plan checks all completed gate-role nodes. In the legacy fan-out path, independent groups cannot contribute votes to one another; missing receipts, foreign/duplicate bindings, and stale baseline nonces refuse before tallying. Reopen/reset rotates the attributable seeds. The role-prefix `.cache/adversarial-verifier-*.md` reader remains only as a narrow read-only contract-1 compatibility path when an archived cardinality>1 plan proves one attributable fan-out identity. PURE + toggle-agnostic. Wired informational per-node in `kaola-workflow-commit-node.js` and enforced as a hard merge gate in Finalization. Prints `verdict ok` or `typed refusal: verdict-check failed`.
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

**Grammar (out of grammar ⇒ typed refusal):** every role drawn from the runtime-closed installed library (the eleven canonical roles — including `implementer`, which is an IMPLEMENT_ROLES member requiring `code-reviewer` post-dominance (G1) like `tdd-guide`, but for changes with no natural failing-unit-test — unioned with any maintainer-added `agents/*.md`); a single unique `finalize` sink; an acyclic DAG; exactly four node shapes — `sequence`, `fanout(<group>)` (homogeneous role, width ≤ `FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`), write-role members pairwise-disjoint), `loop(<cap>)` (cap ≤ `LOOP_CAP` = 5), and `select(<group>)` (issue #263: Classify-And-Act arm — see G-SEL rules below); read-only roles declare no write set; and the computed **post-dominance** gates — **G1** `code-reviewer` post-dominates every code-producing node (implement roles, plus any write role writing a non-docs file), **G2** `security-reviewer` post-dominates every sensitive node, and (issue #334, active only when present) **G3** a non-delegable `main-session-gate` post-dominates every code-producing node. Post-dominance is computed as reachability-after-gate-removal over the unique sink. **Non-delegable main-session gate (`main-session-gate`, #334):** a *built-in role token* (like the `finalize` sink — no `agents/*.md` profile, never dispatched as a subagent; the main session itself performs the acceptance check, e.g. a GPU/visual confirmation or human sign-off, and records `verdict: pass|fail` into `.cache/{id}.md`). It is read-only (declares no write set), shape `sequence` only (never a fan-out member, loop, or select arm — refused otherwise), a `GATE_VERDICT_ROLES` member (so `--verdict-check` requires its verdict and G-SEL-2 forbids it as a select arm), and excluded from frontier fan-out membership. G3 (freeze) plus its runtime `--gate-verify` check (no legal `n/a` route) make finalization provably impossible until the gate is complete with a passing verdict. The `## Nodes` `cardinality` column is **reserved/advisory** — parsed but neither validated nor used by the grammar or the gates (fan-out width is the count of nodes sharing a `fanout(<group>)` token; the loop bound is the `loop(<cap>)` cap), yet its text still contributes to `plan_hash` as part of `## Nodes`, so it must be present and stable. **G-SEL rules (Classify-And-Act, #263):** G-SEL-1: a select group needs ≥ 2 arms; all arms must name the same `selector_source` (which must exist in the plan, be read-only, and be listed in every arm's `depends_on`); every arm in a `select(<group>)` group MUST carry a non-empty `selector_source` value — a blank arm is a typed refusal: `G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared` (issue #268; additive — no existing gate is relaxed); additionally, group names are a **global namespace** — if a name is shared by arms whose `selector_source` nodes differ, the validator emits a typed refusal: `G-SEL-1: select group name "<name>" used by arms with different selector_source nodes; use distinct group names for independent groups` (issue #271; additive — no existing gate is relaxed). Authoring rule: independent select groups MUST use distinct group names. G-SEL-2: gate roles (`code-reviewer`, `security-reviewer`, `adversarial-verifier`) cannot be select arms. G-SEL-3: no-op by design (G1/G2 post-dominance already applies to all nodes including arms). G-SEL-4: arm write sets must be pairwise disjoint-or-identical. **Sync-group gap (#274):** if any node's `declared_write_set` contains one half of a byte-identical sync pair — a `COMMON_SCRIPTS` member's `scripts/` ↔ `plugins/kaola-workflow/scripts/` mirror, or any member of a `BYTE_IDENTICAL_GROUPS` entry — without the peer(s) appearing in *some* node's write set, the validator emits a typed refusal: `sync-group gap: node <id> declares "<path>" without its byte-identical peer "<peer path>" (#274)` (group form appends the group label). The sync sets are read from `validate-script-sync.js`'s exported `COMMON_SCRIPTS`/`BYTE_IDENTICAL_GROUPS` and are a graceful no-op when that module is absent (Codex/GitLab/Gitea copies, installed user projects). **Agent-registration gap (#340):** when the **union** of all nodes' write sets adds a new agent profile (`agents/<name>.md` or a plugin `agents/<name>.toml` that does not yet exist on disk) but omits any path in that agent's 22-path *registration surface* — the three sibling edition profiles, the three `config/agents.toml` codex-dispatch templates, `validate-vendored-agents.js`, `install.sh`/`uninstall.sh` `REQUIRED_AGENTS`, `resolve-agent-model.js` (×4), the plan-validator `CANONICAL_ROLES` (×4), the gitlab/gitea contract-validator agent counts, and the two forge `test-*-workflow-scripts.js` counts — the validator emits a typed refusal: `agent-registration gap: plan adds new agent "<name>" but no node declares "<req>" — an agent-set delta must carry its full registration surface (#340)`. These registries are exact-match (keyed on no symbol of the new file), so #306 symbol-grep cannot find them. The check is **anchor-gated** to the Kaola-Workflow repo itself (inert unless `<root>/scripts/validate-vendored-agents.js` exists), uses the **union** across nodes (the 22-path surface is normally spread across several nodes — the check is count-independent), and fires on additions only — a role *removal* is indistinguishable from an edit in a declared write set (covered by the planner prose checklist + the derived parity guards in the contract validators). **Forge-port ordering gap (#340):** a node whose write set contains a gitlab/gitea **edition-named port** of a root script (`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-<x>.js` ↦ `scripts/kaola-workflow-<x>.js`) must be a **transitive descendant** of every *other* node that writes that root script — the canonical mirror spec is the full accumulated root diff, which only exists after all root edits land. Same-node root+port co-writes (atomic mirror) and a port with no root-writing node in the plan (forge-only fix) are allowed; otherwise the validator refuses: `forge-port ordering gap: node <id> writes port "<p>" but node <other> writes its root source "<rootSrc>" and is not upstream of <id> — order forge-port mirror nodes after ALL root edits and mirror the full accumulated root diff (#340)`.

**Governance (in-grammar plans only):** `decision = ask` when risky, else `auto-run` — over-approximated and fail-closed (uncertain ⇒ risky). Risk is any **sensitivity** (frozen `## Meta` labels in a Phase-5 category, or a declared write set matching the auth / payments / user-data / filesystem / external-API / secrets patterns), any **blast-radius** (write-role fan-out N ≥ 2, a `SHARED_INFRA` touch, or a bounded loop), or **uncertainty** (frozen labels absent). An `auto-run` authorization is provisional and revocable at the per-node barrier, which is now **script-enforced** (issue #231): `--gate-verify` proves the required reviewers actually executed over the `## Node Ledger`, `--verdict-check` (#251) proves those reviewers actually *approved* (the legacy verdict/majority-refute contract for contract 1, or fresh bound normalized receipts plus the declared reducer for contract 2; fail-closed and blocking at the Finalization merge gate), and `--barrier-check` re-scans the files actually written and refuses a surprise sensitive or out-of-allowlist write. The static `auto-run` verdict is no longer the entire enforceable authorization boundary.

**`plan_hash`:** SHA-256 over the whitespace-normalized author-immutable `## Meta` (frozen `labels:`) + `## Nodes` sections; the mutable `## Node Ledger` and the hash comment itself are excluded. Stored inside `workflow-plan.md` as `<!-- plan_hash: <64-hex> -->` and re-checked on every load — a mismatch is tampering and yields a typed refusal on `--resume-check`. The full `workflow-plan.md` artifact contract (`## Meta`, the `## Nodes` table schema, and the `## Node Ledger`) is documented in `docs/workflow-state-contract.md`. A barrier consent-halt is durable in BOTH `workflow-state.md` (`escalated_to_full: consent`) and the non-hashed `## Node Ledger` (`consent_halt: pending`, issue #234), so a lost/regenerated `workflow-state.md` cannot silently drop the halt.

**Authoring-entry guard (`kaola-workflow-claim.js authoring-allowed`, issue #235):** `/kaola-workflow-adapt` runs `node kaola-workflow-claim.js authoring-allowed --project <p>` BEFORE authoring/freezing a plan; it unconditionally returns `{ "status": "authoring_allowed", "allowed": true }` (exit 0). Adaptive authoring is never refused — there is no on/off switch (#538). The validator stays selection-agnostic — it never reads `installed_paths` or any path-selection state.

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

These two scripts form the atomicity interface for the adaptive executor. They are wired into the per-node loop of `kaola-workflow-plan-run` and **called directly by the main session** (the #272 realignment: `kaola-workflow-adaptive-node.js` owns the per-node lifecycle as typed script transactions run main-session-direct — there is no contractor round-trip in the per-node loop): the main session runs `kaola-workflow-next-action.js` for the ready set and `kaola-workflow-commit-node.js --node-id X --start` / `--node-id X` for the per-node *advance* and *commit* brackets, dispatches the role, and owns the consent-halt decision. The aggregator's **whole-plan** mode (no `--node-id`) is exercised by unit tests only; Finalization runs its merge gate by calling the plan-validator directly (this preserves the `--resume-check`/`plan_hash` integrity check that the whole-plan barrier does not run), not via the aggregator. Both ship in all four editions (canonical `scripts/`, Codex copy, and forge-named GitLab/Gitea ports); all are registered in `validate-script-sync.js` and the three `install.sh` SUPPORT_SCRIPT_NAMES blocks.

### Script: `kaola-workflow-replan.js` — claim-preserving epoch transaction (#699 / D-699-01)

`kaola-workflow-replan.js` is the sole mutation authority for replacing a frozen adaptive DAG
without replacing its claim or laundering its candidate. The GitHub/Codex script name is
`kaola-workflow-replan.js`; the generated forge ports are `kaola-gitlab-workflow-replan.js` and
`kaola-gitea-workflow-replan.js`. The public CLI is:

```bash
# Begin from a settled typed review attempt.
node scripts/kaola-workflow-replan.js prepare \
  --project <project> --source-attempt <attempt-id> \
  --reason review_repair_requires_replan --json

# The only legal mutation while a transition is fenced.
node scripts/kaola-workflow-replan.js resume --project <project> --json

# Read the fence/transaction state without mutation.
node scripts/kaola-workflow-replan.js status --project <project> --json

# One user-authorized, one-slot ceiling extension after consent_halt.
node scripts/kaola-workflow-replan.js extend-consent \
  --project <project> --user-turn-reference <ref> \
  --consent-reason <reason> --json

# Recursively verify every retained epoch snapshot and active-state binding.
node scripts/kaola-workflow-replan.js verify-snapshots --project <project> --json
```

Schema-2 epoch 1 recognizes exactly two active-authority forms. `planless` means epoch 1,
`active_plan_hash: none`, Planning Evidence hash/first-node fields all `none`, no
`workflow-plan.md`, and no epoch snapshot. `planned` means epoch 1 with one frozen plan whose exact
hash equals both state hashes and whose first node equals the Planning Evidence id/role; there is
still no epoch snapshot. `kaola-workflow-adaptive-handoff.js` publishes planless → planned in one
state replacement.

`verifyCurrentEpochAuthority(projectDir)` is the one shared function every prepare, resume, archive,
finalize, and watch caller composes — no caller rebuilds a partial variant of these rules. It
separates the *active* (non-transaction) epoch's authority into tiers, closing the self-host defect
where legal execution progress was mistaken for authoring tamper:

- **Immutable authored surface** — the plan's `## Meta`/`## Nodes`/`## Node Briefs` bytes. Verified
  by exact hash equality (`readStoredHash` = `computePlanHash` = the state's `active_plan_hash`);
  divergence refuses `state_active_plan_invalid` or `state_active_plan_hash_mismatch`.
- **Legal runtime surfaces** — `## Node Ledger` (exactly one row per authored node, legal status
  vocabulary, dependency-consistent progress; refuses `state_ledger_authority_invalid` /
  `state_ledger_progress_invalid`), `## Required Agent Compliance` (exact authored requirement rows
  with closed-node evidence binding; refuses `state_compliance_authority_invalid` /
  `state_compliance_progress_invalid`), and the `workflow-tasks.json` mirror (semantic equivalence to
  Nodes plus Ledger status and source plan hash, timestamps excluded; refuses
  `state_task_mirror_mismatch`). These surfaces legally progress after commitment and are validated
  by parse/consistency rules, never by raw-byte comparison against a staged copy.
- **Epoch envelope authority** — `epoch_schema_version` and `epoch_lineage_id` (plus their
  `claim_identity_digest`/`claim_root_base_digest` basis) are stable per-claim fields checked by
  `validateEpochStateAuthority`. A state that omits the entire envelope reads as pre-epoch legacy
  input; a state carrying only part of it refuses `state_epoch_schema_missing`. A present-but-wrong
  version refuses `state_epoch_schema_unsupported`; a missing, malformed, or recomputed-mismatched
  lineage id refuses `state_epoch_lineage_missing` / `state_epoch_lineage_invalid` /
  `state_epoch_lineage_basis_invalid` / `state_epoch_lineage_mismatch`.

The result carries `authority_kind: 'planless' | 'planned'` and, for `planned`, a
`mutable_progress_digest` over the current Ledger/Compliance/task-mirror snapshot (informational, not
a compare-and-swap key). Stale first-node fields refuse `state_planning_evidence_stale_first_node`; a
plan-declared epoch position that disagrees with state refuses `state_epoch_position_mismatch`; and,
while a re-plan transaction is fenced, a mismatched committed receipt refuses
`state_epoch_receipt_mismatch`. `kaola-workflow-claim.js` composes this current-epoch result with
`verifyAllEpochSnapshots` as `verifyArchiveEpochAuthority`, run once before archive and again against
the archived destination and closure receipt, so a planned/current-authority tamper cannot pass
merely because its snapshot sequence remains intact.

Offline claim setup is also mechanical: `KAOLA_WORKFLOW_OFFLINE=1` overrides both values of
`KAOLA_WORKTREE_NATIVE`, so it creates neither a worktree nor an in-place feature branch. A repository
with history binds the exact commit/tree object ids; an initialized repository without history binds
the repository object-width all-zero commit and its locally recomputed canonical empty-tree id. The
sentinel is accepted only as that exact zero/empty pair, and a missing/unprovable Git root refuses
`claim_root_unavailable`.

For a review-driven transition, `repair-node` itself writes `.cache/replan-source.json` before
returning `repair_requires_replan`. This schema-2 `repair_outcome` envelope binds the typed result,
attempt/reason/producer slice, parent plan, epoch/claim/root, exact journal and attempt digests, and
effective candidate digest under `outcome_digest`. A retry with the same semantic payload reuses the
record; a competing payload refuses `replan_source_conflict`. `prepare` never accepts an
operator-authored bootstrap substitute: it re-reads the exact failed, lifecycle-settled, unconsumed
attempt and verifies the journal/evidence/candidate bindings.

`prepare` validates the frozen parent, durable source authority, claim lineage, candidate, inherited
frontier, and transition budget under the existing project
`.cache/scheduler.lock`. It writes `.cache/replan-transaction.json` and the state fence before any
planner request. A successful first prepare emits `result:"prepared"`; an existing incomplete
transaction emits `result:"resume_required"`. The transaction phases are:

| Phase | Current authority | Resume action |
|---|---|---|
| `prepared` | Frozen parent | Verify parent/source/CAS; write the planner packet and exact empty child seed. |
| `planner_pending` | Frozen parent | Require a genuine `workflow-planner` dispatch and digest-bound attestation for `workflow-plan.next.md`; main may not provide the child topology. |
| `child_frozen` | Frozen parent | Recheck the child and `pre_snapshot` CAS, then build and verify the immutable parent snapshot. |
| `parent_archived` | Parent until promotion begins | Recheck the snapshot and `pre_activation` CAS, then roll forward the activation journal. |
| `committed` | Child | Verify activation outputs and clear/repair only the stale state fence; repeat resume returns `already_committed`. |

The four CAS records are `prepare`, `pre_freeze`, `pre_snapshot`, and `pre_activation`. Each binds
`candidate_digest`, `claim_root_base_digest`, and `inherited_frontier_digest`. A pre-promotion
mismatch emits `reason:"replan_candidate_changed"`, preserves the parent authority, records the
failed planner attempt, seeds a new child-authoring attempt against the current candidate, and does
not advance `plan_epoch` or `automatic_review_replans`. The focused proof exercises all 12
seam/axis combinations independently and requires the mismatch receipt to be the only durable
effect—no epoch, counter, dispatch, snapshot, task, Case-B, or activation change.

Activation is intentionally not described as one filesystem-atomic operation. Its ordered,
digest-bound journal steps are `child_plan_promoted`, `child_state_promoted_fenced`,
`task_mirror_promoted`, `active_cache_cleaned`, `transaction_committed`, and `state_unfenced`.
After plan promotion there is no rollback to the parent; ordinary mutation remains fenced and
`resume` verifies each completed prefix before rolling forward the next one.

The planner packet contains the repository/project identity, typed source evidence, stable claim
root, current candidate/inherited frontier, budget, acceptance requirements, exact child path,
profile identity, dispatch nonce, and the transaction's immutable `snapshot_authority_projection`
plus its digest. It must not prescribe nodes, roles, dependencies, write sets, cardinality, shape,
model, or build order. Child validation requires schema/contract version 2, a fully pending Ledger,
parent/lineage/root/frontier/source/planner bindings, and the inherited G4 code/security certifier
declarations. Despite its historical name, the child's `parent_snapshot_manifest_digest` equals the
projection digest—not the later full manifest-file digest. A zero-new-writer child therefore cannot
turn inherited code or sensitive work into baseline; final certifier receipts must still bind the
relevant final digest.

The claim-level review transition budget starts at `REVIEW_REPLAN_LIMIT = 2`. Failed dispatch,
validation, CAS, snapshot, or crash retries cost zero; a committed review-driven replacement costs
one. When the count reaches the verified ceiling, prepare durably records `consent_halt` and emits
`replan_consent_required` before planner dispatch. `extend-consent` appends one hash-chained ledger
entry whose `new_ceiling` is exactly `prior_ceiling + 1`; a user-turn reference cannot be reused to
create extra capacity. The only zero-cost transition is a one-shot, no-review
`diagnosis_to_build` route. It is considered only when neither a failed/unresolved review journal
nor a repair-outcome file exists. The completed schema-2 parent must declare exact digests for four
regular, contained artifacts—`diagnosis_root_cause`, `falsified_alternatives`,
`acceptance_contract`, and `recommendation`—whose parsed values are terminal
`diagnosis_complete` records (the recommendation kind is `recommended_shape`). Parent writers may
touch only those artifact paths, and the child must cite the exact proof and recommendation digests.
Untyped, repeated, writer-bearing, review-driven, or citation-missing variants count or refuse.

Every parent epoch is copied to `.cache/epochs/<parent-plan-epoch>/files/**` before active-cache
cleanup. The schema-2 full manifest stores and re-derives the earlier projection, but separately
seals the exact child path/hash/digest, planner attestation, sorted path/mode/size/digest file index,
`manifest_self_digest`, and exact manifest-file digest. This two-way seal is non-circular: the child
binds immutable parent authority before it exists, then the later manifest binds the exact child.
Because the snapshot copies the complete project proof tree (except the scheduler lock and existing
`epochs/**`), it preserves the authoritative review journal and every attempt's complete `rebind`
ledger, node evidence, contexts, receipts, certifiers, validation vectors, and dispatch provenance.
Cleanup is manifest-allowlisted and digest-checked; epoch, transaction, consent, lineage, and dispatch
authority are never removed. Finalization and closure recursively verify every file plus the
projection/child/transaction/attestation/live-state chain.

`REPLAN_DURABLE_WRITE_LABELS` is an exact ordered inventory of 41 base labels spanning prepare,
fences, packet/child publication, snapshot, activation, cleanup, reauthor, consent, and typed failure
paths. Five families add deterministic suffixes: staged snapshot file, cleanup intent, and cache
unlink use `<sorted-ordinal>:<path-digest>`; candidate-changed transaction/state writes use
`<cas-seam>`. The durable helpers fire immediately after their operations. Tests lock the exact
inventory/dynamic grammar and execute every discovered main-path prefix with one-resume convergence
plus a second resume that leaves bytes and cardinalities unchanged; the registered consent/failure
side labels must not be described as directly failpoint-executed until a later test proves that.

Verified legacy v1 parents stay byte-immutable on contract v1. They may finish under the legacy
rules, or enter a v2 child only through the explicit compatibility path that proves a corroborated
claim root, snapshots exact v1 plan/state/journal/evidence/rebind bytes, derives the inherited
frontier, and dispatches a fresh planner. Historical schema-1 snapshots whose child field is still
`pending` are read-only compatible only when the manifest self/exact digests, copied child row,
transaction child, planner attestation, promoted live plan, and descendant state all agree; success
reports `legacy_external_binding`, otherwise `legacy_snapshot_binding_unsealed`. A newly authored
child missing schema 2 is invalid, and schema-2 committed validation never accepts `pending`.

Common typed refusals include `replan_in_progress`, `replan_integrity_mismatch`,
`replan_planner_dispatch_required`, `replan_planner_attestation_invalid`, `replan_child_invalid`,
`replan_candidate_changed`, `replan_snapshot_incomplete`, `replan_task_mirror_failed`,
`replan_cache_cleanup_failed`, `replan_consent_required`, `replan_consent_ledger_invalid`,
`legacy_claim_root_unprovable`, `legacy_snapshot_binding_unsealed`, and the active-state consistency
reasons above. While fenced, `orient` is read-only and reports the phase/hashes;
ordinary node mutation, normal handoff, task-mirror refresh, archive, and Finalization refuse. The
only mutation route is `kaola-workflow-replan.js resume --project <project>`.

**Verification boundary.** This section defines the accepted machine contract and the implemented
API surface; it is not a claim that the current candidate has completed terminal certification. The
versioned-authority engine documented above (`kaola-workflow-replan.js`, adaptive-schema, and the
plan-validator's epoch-aware checks) is implemented, and its focused suite plus resume/sync/forbidden-
token checks are green. The lifecycle/publication caller repair (archive, finalize, release, and watch
cleanup composing `verifyArchiveEpochAuthority`; the walkthrough's nested subprocess-timeout fix) and
the packaged-edition fixture repair (Codex/GitLab/Gitea snapshot-authority fixtures) are separate,
still-in-progress write surfaces. Terminal certification is withheld until the named code and security
certifiers and the three read-only falsification nodes (budget exhaustion, history/archive integrity,
and publication/edition parity) each record a pass — consult the project's Node Ledger and per-node
gate evidence for current status rather than treating any status prose here as a live scoreboard.

### Authoritative contract-1 review journal and direct repair (D-682-01)

`kaola-workflow-adaptive-node.js` persists review transactions at
`kaola-workflow/{project}/.cache/review-attempts.json`. The schema below is the verified legacy
contract-1 form; contract 2 uses the version-exact context/receipt/journal API documented above and
never rewrites a contract-1 journal in place. The contract-1 top-level schema is:

```json
{
  "schema_version": 1,
  "plan_hash": "<64-hex>",
  "attempts": []
}
```

Every attempt requires these fields: `attempt_id`, positive gate-local `ordinal`, `plan_hash`,
`logical_gate`, `transaction_key`, `candidate_digest`, `generations`, `settlement_command`,
`outcome`, `reason`, `receipts`, `findings`, `route_candidates`, `lifecycle_settled`, `repair`, and
`consumed_by`; `producer_bindings` is present on newly-created attempts. `logical_gate` contains
`key`, `kind`, display `id`, sorted unique `origin`, and sorted unique `members`. Its authoritative
`key` is the JSON encoding of `{kind, origin, members}`; the display id and reusable fan-out label do
not define identity. Ordinals are unique, contiguous positive integers within that key, and physical
array position has no chronological authority.

`transaction_key` is SHA-256 over the journal `plan_hash`, canonical logical-gate key,
`candidate_digest`, and sorted `{member, nonce}` generations. Each receipt stores its full bound
evidence body and SHA-256. The candidate digest is a SHA-256 of the sorted Git tree listing built from
`HEAD` plus all working-tree changes, excluding the active `kaola-workflow/{project}/` subtree,
`.kw/`, and `.git/`; journal and ledger writes therefore do not change the reviewed product digest.
New `producer_bindings` preserve each executed producer's original `baseline`, equal `anchored_ref`,
`open_token`, derived `generation`, and barrier `ref`.

The shared `evaluateEffectiveVerdict` predicate passes only when all three conditions hold:

- the last column-0 verdict is `pass`;
- `findings_blocking` is zero (an absent count retains the historical zero default); and
- no canonical finding remains with `scope=in_scope`, `action=fix`, and a status other than
  `resolved` or `deferred`.

A sequence attempt has exactly one receipt and settles to that effective result. A fan-out attempt
may remain `outcome:null`, `lifecycle_settled:false` while receipts are provisional; an outcome is
written only after every exact member has a receipt, and passes only on a strict majority. Receipt
bodies are immutable once an aggregate outcome exists. A failed settlement writes in this order:
attempt/outcome → gate ledger rows `pending` → running-set removal →
`lifecycle_settled:true`. The response is `result:"review_failed"` with the exact `attempt_id`.
Failed members are pending for re-execution, but the settled unconsumed journal attempt remains the
authoritative blocker. `orient`, ordinary openers, and `reopen-node` return
`review_attempt_unresolved`; an interrupted settlement is resumed with its recorded
`settlement_command` rather than reclassified. Passing closes complete the ordinary ledger,
compliance, selector, and running-set transaction before marking the journal attempt settled.

Repair is invoked directly and attempt-bound:

```bash
node scripts/kaola-workflow-adaptive-node.js repair-node \
  --project <project> --attempt-id <attempt-id> --node-id <agent-selected-writer> --json
```

The harness does not select the writer. Before mutation it requires the proposed writer to be the
unique maximal executed write-producing ancestor common to the logical gate, verifies the persisted
writer barrier tuple, recomputes the unchanged candidate digest, and reruns the original writer
barrier. Zero or multiple eligible owners, candidate drift, identity drift, or a failed original
barrier return `repair_requires_replan` without mutation. A different writer after selection returns
`repair_writer_mismatch`.

The durable repair order is: persist `repair.selected_writer` with `settled:false`; fold downstream
gates and reopen the writer using its original baseline; delete stale downstream baselines and stale
completed gate receipts; seed the writer repair brief; persist `repair.settled:true`; then persist
`consumed_by`. Retrying after any step resumes the same attempt and does not create a second repair.
When cleanup considers multiple attempts bound to the same candidate and writer, it selects the
greatest validated `ordinal` independently for each gate member; array order cannot cause an older
pass to delete a newer unresolved failure. Exactly five settled-and-consumed failed attempts are
allowed per canonical logical-gate key; the next returns `result:"repair_limit_reached"` with
`limit:5` and no repair mutation.

`route_candidates` is validated against the receipts' canonical findings. `ownership_candidates`
is sorted and unique, and `owning_node` is populated only when exactly one candidate exists.
`.cache/findings-route.json` is a regenerable projection of the highest-ordinal authoritative
attempt for the source gate; it is never journal authority and never chooses among multiple owners.

The shared atomic replace helper fsyncs the temporary file before rename, then fsyncs the parent
directory after the rename so a settled durable-state write cannot revert to its pre-rename directory
entry after power loss (the R17 durability follow-up deferred by D-682-01, closed by #685 — see
D-683-01). The directory fsync is platform fail-soft: a directory that cannot be opened or fsynced
degrades silently and never turns a previously-accepted write into a refusal, and never swallows a real
rename or ENOSPC error.

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
| `wait_budget_minutes` | integer, optional | Validated frozen planner override; omitted when the node has no override |

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

## Fast / Full Transaction Scripts (issues #456 / #457 / #458)

The fast path and the full path's per-phase mechanical transitions are owned by typed transaction scripts the main session runs directly (ADR 0004), not by the `contractor`. Each requires `--json`, emits a single JSON object on stdout, and mutates durable files in crash-safe order; refusals are typed (`{ "result": "refuse", "reason": "...", "operator_hint": "..." }`, exit 1) with zero mutation. The main session owns ALL judgment and hands the script the verbatim content; the script never dispatches a role, judges, routes, or asks. Each is idempotent/resume-safe and preserves an existing `## Sink` block byte-for-byte.

- **`kaola-workflow-fast-advance.js` (#456)** — `orient` (read-only), `plan-setup`, `plan-capture --stdin`, `execute-setup`, `acceptance-run`, `acceptance-consequence --decision proceed|escalate`, `summary-write --verdict PASSED|ESCALATED --stdin`. Owns `fast-summary.md` + its `## Status` lifecycle.
- **`kaola-workflow-full-advance.js` (#457)** — `orient` (read-only), `phase1-complete` (checkpoint; refuses if `phase1-research.md` is absent — never authors it), `phase2-finalize` / `phase3-finalize` / `phase5-finalize` (each `--stdin`: author the phase file from the orchestrator's packet + advance the pointer). Authors `phase{2,3,5}-*.md` with a RESOLVED `## Required Agent Compliance` table and **self-validates each rendered phase file against the real `repair-state.unresolvedCompliance(content, stateContent)` boundary gate before writing** (fails closed with `unresolved_compliance`); the default compliance status is `delegation_policy`-aware (`delegate`→`subagent-invoked`, `local-authorized`→`local-fallback-explicit`, `tool-unavailable`→`local-fallback-tool-unavailable`, else `invoked`).
- **`kaola-workflow-phase4-advance.js` (#458)** — `orient` (read-only), `init-progress` (stamp `phase4-progress.md` from `phase3-plan.md` `### Task N:` blocks; create-only), `open-task --task N`, `record-failure --task N --stdin` (append a Failure Routing Ledger row; deduped), `close-task --task N --stdin` (mark the task complete + flip its `tdd-guide executor task N` compliance row to a policy-aware resolved status + advance; on the last close it self-validates the whole table at the phase-4→5 boundary gate). Every table-cell value is sanitized (`|`→fullwidth `｜`) so an orchestrator-supplied name/path cannot shift columns and corrupt the table.

Editions: each is rename-normalized per edition (the lone `require` of `repair-state` carries the forge prefix; command/skill route names stay edition-neutral via the KW-split). Registered in `kaola-workflow-install-manifest.js` `SUPPORT_SCRIPTS` + `validate-script-sync.js` (`COMMON_SCRIPTS` + `RENAME_NORMALIZED_FAMILIES`); the #459 contract validators pin both the registration and the absence of a contractor dispatch on every migrated command/SKILL surface.

## Contractor Agent (issue #242 Part B; narrowed to Finalization-only by #456/#457/#458)

The `contractor` is a mechanical Sonnet agent registered across all four editions. It is the bookkeeper half of the lean-orchestrator design. **Its scope is now Finalization only.** The fast-path mechanical transitions (#456), the full-path Phase 1/2/3/5 checkpoint + phase-file authoring (#457), and the full-path Phase 4 progress/task/failure-ledger bookkeeping (#458) are now owned by typed transaction scripts (`kaola-workflow-fast-advance.js`, `kaola-workflow-full-advance.js`, `kaola-workflow-phase4-advance.js`) the main session runs directly — exactly like the adaptive per-node loop (`kaola-workflow-adaptive-node.js`, #272). After this migration the contractor is dispatched at exactly one seam:

- **Finalization** (Stage C): Opus delegates the mechanical finalization block (Step 8a artifact mirror, `cmdFinalize` archive, roadmap regen, the `chore: finalize` commit gate) to the contractor, then resumes at Step 9 (the sink: merge/PR), the issue-close decision, and all governance. This is the **SOLE remaining contractor-owned transition** (ADR 0004 keeps Phase 6 contractor-owned as a temporary exception, pending a dedicated finalization transaction script).

Phase 1 (research) checkpoints — the `workflow-state.md` write and the per-issue roadmap `init-issue` staging — are now part of the script-owned full path (#457): `kaola-workflow-full-advance.js phase1-complete` writes the checkpoint and the command prose runs `init-issue` directly; Opus still owns the research dispatches, the completeness gate, the `phase1-research.md` synthesis, and the branch cut. The per-node executor loop and the fast/full phase transitions do **not** go through the contractor — see § Adaptive Executor Aggregators above and the fast/full transaction scripts.

### Role

The contractor runs the Finalization workflow scripts, parses the `.cache` evidence and verdicts the Opus orchestrator hands it, and **authors the durable finalization bookkeeping**: the archive, the roadmap-mirror regen, and the `chore: finalize` staging commit. It returns a compact summary. It is deterministic plumbing, not a decision-maker. (Phase files, phase-state checkpoints, and `fast-summary.md` authoring are now script-owned, not contractor work.)

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
- **Codex `.toml` agent profile** — `agents/contractor.toml` (three byte-identical copies across the Codex, GitLab, and Gitea plugin editions; Claude uses `agents/contractor.md`). Like every current Codex role profile, contractor omits top-level `model` and `model_reasoning_effort` and inherits both values from the parent session; its standard class remains declarative metadata. Standalone TOMLs carry `description` and `nickname_candidates` metadata matching `config/agents.toml`. Per-edition `config/agents.toml` also carries a `[agents.contractor]` block (three byte-identical copies across all Codex editions).

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

**Global-first short-circuit (#571):** Before project inspection, checks `~/.codex` (`os.homedir()/.codex`). If that scope is fresh (exists and all role/block checks pass), returns immediately with exit 0 and `scope: 'global'` — no project-local copy is inspected or written, and autofix is not triggered. Falls through to steps 1–6 only when the global scope is absent or stale. An enabled V2 scope with unsafe nested collaboration exposure refuses as `codex_v2_encrypted_transport_unsafe`; a reserved or hidden role schema refuses as `codex_v2_role_transport_unsafe`. Neither is an autofixable profile-staleness case. Fail-closed: the short-circuit adds only a PASS case; every existing typed refusal still fires when the global scope is not fresh.

1. Resolves `--project-root` (or `process.cwd()`) and checks `.codex/agents/kaola-workflow/` for per-role `.toml` files, **schema-validating** each required profile (a non-empty top-level `name` matching the role, both top-level runtime keys omitted so the role inherits the parent session, and non-blank `developer_instructions` containing the role-appropriate durable-full-result plus compact-summary contract). An exact legacy Sol/medium or Sol/xhigh managed pair is stale and migratable; a partial pair or any other explicit runtime pin is malformed.
2. Reads `.codex/config.toml`, locates the managed block between `# BEGIN kaola-workflow agents` and `# END kaola-workflow agents`, asserts every required role has an `[agents.{role}]` entry inside it, and flags any retired/foreign `[agents.*]` *inside* the markers.
3. Required-role set: the union of (a) all roles in the bundled `config/agents.toml` template (read dynamically — no hardcoded count) and (b) the roles named in the frozen plan's `## Nodes` table when `--plan <path>` is supplied.
4. Stale/retired Kaola `.toml` files left in the target dir (listed in the local `.kaola-managed-profiles.json` manifest, or in the retired-files list `docs-lookup.toml`) are detected; unknown user-owned TOMLs are **reported, never deleted** (the `extra_unmanaged` field).
5. **Auto-install when safe**: if the only problem is a stale/missing/malformed managed block, profile file, or stale Kaola file, runs `install-codex-agent-profiles.js`, then re-verifies ALL checks. On success, returns exit 0 with `autofixed: true`.
6. **Typed refusal when unsafe**: if an enabled MultiAgentV2 config permits nested Code Mode collaboration, uses the reserved `collaboration` namespace with visible role fields, hides Kaola's role fields, a conflicting `[agents.*]` table exists OUTSIDE the managed markers, the local manifest declares an unsupported (future) `schema_version`, the installer is unavailable/errors, or the plan names a role absent from the template, exits non-zero with a typed-refusal JSON. `--no-autofix` forces the refusal path (useful in tests).
7. **Never a silent `subagent-invoked`**: any non-`ok` status is a STOP for the caller.

**MultiAgentV2 role-transport gate (correctness-fatal; Codex 0.144.1):** every live-scope result
carries `codex_v2_transport_mode` (`"direct-only"|"nested-allowed"|"unknown"|"not_applicable"`),
`codex_v2_direct_transport_ready`, `codex_v2_tool_namespace`,
`codex_v2_role_metadata_visible`, `codex_v2_role_transport_ready`, and
`codex_v2_transport_warning`. `non_code_mode_only = false` exposes plaintext through the nested
Code Mode adapter even though V2 expects a Responses-encrypted task, so it refuses as
`codex_v2_encrypted_transport_unsafe`. A second boundary applies to direct tools: the server reserves
`collaboration.spawn_agent` for the hidden-metadata schema. Setting
`hide_spawn_agent_metadata = false` under that name adds `agent_type`/model fields and rejects the
first request with HTTP 400; leaving metadata hidden removes Kaola role selection. The proven
role-aware posture is `tool_namespace = "agents"`, `hide_spawn_agent_metadata = false`, and
`non_code_mode_only = true`; any reserved, hidden, or ambiguous role schema refuses as
`codex_v2_role_transport_unsafe`. Both refusals return exit 7 before any spawn or autofix and require
a fresh session after repair. The `plugin_cache` doctor scope has no live config and reports
namespace/mode `"n/a"`, readiness `null`, and warning `null`.

**Dispatch-posture report (additive, non-fatal — issue #598):** every result envelope,
success AND every typed refusal, additionally carries `dispatch_posture`
(`"none"|"explicitRequestOnly"|"proactive"`), `model_reasoning_effort` (the raw root-level
TOML value, or `null` when unset), `multi_agent_enabled` (the base `[features] multi_agent`
boolean), and `dispatch_posture_warning` (the exact remediation string, or `null` when the
posture is already `proactive`). This is the effort-gated Codex runtime MultiAgentMode —
distinct from the pre-existing `dispatch_mode`/`multi_agent_v2_enabled` fields (#332/#571),
which only report whether the spawn *tools* are exposed, not whether the runtime will
actually accept a spawn: `[features] multi_agent`/`multi_agent_v2` both absent-or-false →
`"none"`; otherwise a root-level `model_reasoning_effort = "ultra"` → `"proactive"`, any
other value or absent → `"explicitRequestOnly"`. **ATTESTATION-STYLE / NON-FATAL by
construction** — these four fields never change `status` or the exit code, on either the
normal gate or `--doctor`. On the normal gate's plain-text (non-`--json`) success output,
a `warn: <dispatch_posture_warning>` line follows the `ok: N roles verified` line whenever
the posture is non-`proactive`; the exit code stays `0`. **Version-guarded:** the
effort→mode coupling is Codex CLI runtime behavior verified on codex-tui 0.142.5 and may
change in a future release; the installer prints this caveat verbatim as its final
dispatch-posture line.

**MultiAgentV2 bounds report (additive, non-fatal — issue #611, D-611-01):** every result envelope
(the same success/refusal branches the `dispatch_posture*` fields ride on) additionally carries six
fields reporting the effective v2 concurrency slot budget and wait-timeout bounds:

```
max_concurrent_threads_per_session:        number | null,
max_concurrent_threads_per_session_source: 'config' | 'observed_default' | 'not_applicable' | 'n/a',
effective_subagent_width:                  number | null,
min_wait_timeout_ms:                       number | null,
max_wait_timeout_ms:                       number | null,
default_wait_timeout_ms:                   number | null,
```

All six are gated on `multi_agent_v2_enabled` (the same boolean `dispatch_mode`/`multi_agent_v2_enabled`
detection already derives, #332/#571): when v2 is not active, every field reports `null` (source
`'not_applicable'`), mirroring how `dispatch_posture` itself collapses to `"none"` when the features
are off. When v2 IS active: `max_concurrent_threads_per_session` reports the configured
`[features.multi_agent_v2] max_concurrent_threads_per_session` verbatim (`source: 'config'`) when it
is a positive integer; when absent or non-positive/non-integer, it falls back to the OBSERVED default
of **4** (`source: 'observed_default'`) — this number comes from the issue's own controlled probe on
codex-tui 0.142.5 ("4 available concurrency slots, including you"), NOT from published Codex
documentation, so it is labeled observed rather than a guaranteed default. `effective_subagent_width`
is `max(threads - 1, 0)` — the budget INCLUDES the orchestrator thread. `min_wait_timeout_ms` /
`max_wait_timeout_ms` / `default_wait_timeout_ms` are read ONLY when explicitly present in
`[features.multi_agent_v2]` (either the inline-object or dotted-table TOML syntax); there is
deliberately NO fabricated numeric fallback for these three, so they report `null` when absent. On
the `--doctor` `plugin_cache` scope (a cached source tree, no live runtime config to derive bounds
from) all six fields mirror the `dispatch_posture: 'n/a'` convention: every numeric field is `null`
and `max_concurrent_threads_per_session_source` reads `'n/a'`. See
`docs/decisions/D-611-01.md` and `docs/plan-run-cards/join-protocol.md` § 5.

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
| `7` | `codex_v2_encrypted_transport_unsafe` | enabled V2 exposes collaboration through nested Code Mode instead of the direct encrypted transport |

**JSON output (`--json`):**

Success:
```json
{ "status": "ok", "scope": "global", "roles_checked": ["code-explorer", "..."], "extra_unmanaged": [], "autofixed": false, "codex_v2_transport_mode": "direct-only", "codex_v2_direct_transport_ready": true, "codex_v2_tool_namespace": "agents", "codex_v2_role_metadata_visible": true, "codex_v2_role_transport_ready": true, "codex_v2_transport_warning": null, "dispatch_posture": "explicitRequestOnly", "model_reasoning_effort": null, "multi_agent_enabled": true, "dispatch_posture_warning": "Codex will refuse sub-agent spawns unless explicitly requested this session (multi_agent_mode: explicitRequestOnly). To dispatch now, explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker), set model_reasoning_effort = \"ultra\" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) for proactive delegation.", "max_concurrent_threads_per_session": 4, "max_concurrent_threads_per_session_source": "observed_default", "effective_subagent_width": 3, "min_wait_timeout_ms": null, "max_wait_timeout_ms": null, "default_wait_timeout_ms": null }
```

The `scope` field is additive (#571): `"global"` when the global `~/.codex` scope satisfied the gate; `"project"` when the project scope satisfied it (with or without autofix). Existing callers that assert only `status` and `autofixed` are unaffected. The three `codex_v2_transport*` fields, four `dispatch_posture*` fields (#598), and six `multi_agent_v2` bounds fields (#611) are present on every live-scope result.

Typed refusals (non-zero exit) carry `status`, `stale: true`, `safe_autofix`, `repair`, `extra_unmanaged`, the same transport, dispatch-posture, and bounds fields, plus a status-specific payload: `malformed: [{role, file, reasons}]` (`profiles_malformed`), `stale_files: [...]` (`profiles_stale`), `stale_roles_in_block: [...]` (`managed_block_stale`), `missing_roles: [...]` (`profiles_missing`/`config_stale`), or `conflicting_roles_outside_markers: [...]` (`autofix_unsafe`). The transport refusal additionally carries `scope` and `config_path`.

**Doctor mode (`--doctor`)** — READ-ONLY, never runs the installer (even without `--no-autofix`). Reports freshness for four scope classes:

- `repository` — the bundled source profiles beside the preflight script, schema- and reviewer-contract-checked;
- `user` — `<home>/.codex` (`--home` overrides `os.homedir()`; a test/diagnostic hook);
- `project` — `<project-root>/.codex`;
- `plugin_cache` — each cached source-profile set under `<home>/.codex/plugins/cache/<marketplace>/<plugin>/<version>/agents`, schema- and exact-source-byte-checked, `read_only: true`.

`--json` emits `{ status: 'ok'|'stale', scopes: [{scope, codex_dir, exists, managed_block, profiles, missing_roles, missing_from_block, malformed, stale_profiles, profile_byte_drift, stale_files, stale_roles_in_block, conflicting_roles_outside, extra_unmanaged, manifest, codex_v2_transport_mode, codex_v2_direct_transport_ready, codex_v2_tool_namespace, codex_v2_role_metadata_visible, codex_v2_role_transport_ready, codex_v2_transport_warning, dispatch_posture, model_reasoning_effort, multi_agent_enabled, dispatch_posture_warning, max_concurrent_threads_per_session, max_concurrent_threads_per_session_source, effective_subagent_width, min_wait_timeout_ms, max_wait_timeout_ms, default_wait_timeout_ms, read_only, repair}, ...] }`. Exit code is 0 only when the repository source is valid, the `user` and `project` scopes are clean-or-absent, and every discovered plugin cache matches the bundled source. It is 1 when the repository source is malformed, either installed scope is stale, or any plugin-cache profile is malformed or byte-drifted. Unsafe V2 transport or role schema also makes its live scope stale. Plugin caches remain read-only, but their drift is gate-affecting; their repair is the exact `codex plugin remove <plugin>@<marketplace> && codex plugin add <plugin>@<marketplace>  # refresh plugin cache` command. Every stale scope carries a concrete repair.

The six transport/role fields are present on every live or cache scope; for `plugin_cache`, mode/namespace read `'n/a'`, readiness/metadata read `null`, and warning reads `null`. The four `dispatch_posture*` fields (#598, non-fatal — see above) are also present on every live or cache scope; for `plugin_cache`, they read `dispatch_posture: 'n/a'`, `model_reasoning_effort: null`, `multi_agent_enabled: false`, `dispatch_posture_warning: null` because a cached source tree has no live runtime config. The six `multi_agent_v2` bounds fields (#611, non-fatal — see above) likewise use `null` numeric values and `'n/a'` as the source for `plugin_cache`. Repository output is source-contract evidence rather than a live transport/config report. Without `--json`, each scope line is followed by its exact `repair` when stale, a `transport` line for unsafe V2, and a `warn` line whenever that scope's posture is non-`proactive`.

---

### Script: `install-codex-agent-profiles.js`

Installs the Codex-native role profiles. Ships in the **3 plugin trees only** (codex/gitlab/gitea), byte-identical (enforced by `validate-script-sync.js`). Run by the Codex `kaola-workflow-init` skill (NOT by `install.sh`).

**`--global` flag (#571):** sets `projectRoot = os.homedir()` regardless of `cwd` or argument order (position-robust, like `--with-fast`/`--with-full`). Installs profiles into `~/.codex/agents/kaola-workflow/`, writes the managed block into `~/.codex/config.toml`, and refreshes global hooks — one install, all repos. The preflight gate accepts the global scope. The positional `projectRoot` form (`"$PWD"` / `"$HOME"`) remains a supported project-local override. `--global` composes with `--with-fast`/`--with-full` (independent flags). Use `--global` for the documented default install and upgrade flow.

Default-on validate → install → prune → manifest → post-verify (no install flags):

1. **Source schema wall** — `validateSourceProfiles(pluginRoot)`: every `config_file` resolves, every `agents/*.toml` is referenced by exactly one `[agents.*]` entry, and every profile passes `validateProfileText`. Generated reviewer profiles additionally require reviewer contract version 2, the embedded normalized behavior core and matching `behavior_contract_hash`, one valid self-normalized `resolved_profile_hash`, the closed top-level schema, and no runtime/model pin. On failure, prints `profile_schema_error: ...` plus `profile_source_repair: node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check`, then exits 1 **before any write**.
2. **V2 role-transport wall** — reads the target `config.toml` before any write. Nested/ambiguous encrypted transport prints `codex_v2_encrypted_transport_unsafe: ...`; a reserved/hidden role schema prints `codex_v2_role_transport_unsafe: ...`. Both exit 1, and the installer does not silently change user-owned feature settings.
3. **Manifest guard** — if the target manifest declares a `schema_version` newer than supported, prints `manifest_schema_unsupported: ...` and exits 1 (never prunes against a future manifest).
4. Copies each source profile via write-temp-then-rename (no torn profiles on crash), upserts the managed `[agents.*]` block, copies hook scripts into the global stable home, and merges the managed entries into `~/.codex/hooks.json` (#325/#447 semantics).
5. **Prune** — removes target `.toml` files that are no longer current AND are either listed in the previous manifest (`stale-managed`) or in the retired list `docs-lookup.toml` (`retired`, works with no manifest). Unknown user TOMLs are left in place and reported as `unmanaged extra`.
6. **Manifest** — writes `.codex/agents/kaola-workflow/.kaola-managed-profiles.json` (`schema_version: 1`, plugin name/version, ISO `installed_at`, `roles`, per-file `sha256`, reviewer `profile_contracts` carrying `behavior_contract_version`, `behavior_contract_hash`, and `resolved_profile_hash`, and `retired_files_removed`).
7. **Post-verify** — re-reads every installed profile, requires exact bundled-source bytes, revalidates reviewer profile identities, and asserts that the managed block carries every template role; on failure prints `post_verify_failed: ...` and exits 1.
8. Prints `Kaola-Workflow Codex multi_agent_v2 transport: <mode>` plus the effective role namespace/metadata readiness with the posture/bounds report, then `status: ok` as the machine-checkable final sentinel.

These checks prove repository, installed, and discovered plugin-cache **filesystem bytes and embedded identities**. They do not attest that a proprietary runtime loaded those bytes into a prompt, and deterministic profile identity does not imply identical stochastic model output.

Exported helpers (require-safe; `require.main` guard means `require()` never runs the installer): `validateProfileText`, `validateSourceProfiles`, `pruneStaleProfiles`, `readManifest`, `writeManifest`, `buildManagedHooks`, `mergeHooks`, `updateHooks`, `detectCodexDispatchMode`, plus the constants `RETIRED_PROFILE_FILES`, `MANIFEST_BASENAME`, `EFFORT_VALUES`, `CODEX_V2_TRANSPORT_UNSAFE_STATUS`, `CODEX_V2_DIRECT_TRANSPORT_NOTE`, `CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS`, `CODEX_V2_ROLE_TOOL_NAMESPACE`, and `CODEX_V2_ROLE_TRANSPORT_NOTE`.

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

**Note:** The Codex plugin manifest (`plugin.json`) has no `hooks` key. The lifecycle wiring lives in the global `~/.codex/hooks.json` written by `install-codex-agent-profiles.js`: this script is registered as a `SessionStart` (`compact`) hook (id `kaola-workflow:compact-context`) there, with the hook script copied into `~/.codex/kaola-workflow/scripts`. It is also invokable on demand via stdin (see invocation below).

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

## Codex `~/.codex/hooks.json` managed-entry contract

`install-codex-agent-profiles.js` (invoked by the Codex `kaola-workflow-init` skill)
writes the global `~/.codex/hooks.json` containing the three managed
Kaola-Workflow hook entries. Agent profiles and the managed `[agents.*]` config block
install **globally** into `~/.codex` by default (#571 — one install, all repos); hook
entries and hook scripts are also machine-global. Project-local is a supported override:
pass the repo path positionally to the installer. The Codex plugin manifest (`plugin.json`) has no `hooks` key;
`~/.codex/hooks.json` is the sole wiring point for Codex lifecycle hooks.

### Managed-entry identification

Each managed entry carries an `id` field starting with `kaola-workflow:`. The installer
identifies managed entries by that prefix and uses an idempotent merge-by-id strategy:

- For each event in the managed template, existing entries whose `id` starts with
  `kaola-workflow:` are dropped and the managed entries are appended.
- User entries (no `id`, or a non-`kaola-workflow:` id) are preserved untouched.
- Events not present in the managed template are left entirely unchanged.
- If the existing `~/.codex/hooks.json` is missing or malformed JSON, it is treated as
  empty with a warning printed to stderr (WARN-first; the install proceeds).

### Template token substitution

The source template (`plugins/kaola-workflow/config/hooks.json`) uses the token
`__KW_PLUGIN_ROOT__` in every command path. The installer copies all hook-referenced
scripts into the version-less stable home `~/.codex/kaola-workflow/{hooks,scripts}`
and replaces ALL token occurrences (using `split/join`, not `String.replace`) with
that stable home, not the versioned plugin-cache path. Written command paths in
`~/.codex/hooks.json` are therefore absolute and survive plugin-cache garbage
collection, throwaway install trees, and project worktree changes.

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
Kaola-Workflow Codex hooks: updated at ~/.codex/hooks.json
Kaola-Workflow Codex hooks: copied <n> hook script(s) into stable home ~/.codex/kaola-workflow (swept <n> stale)
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
  matcher string in `~/.codex/hooks.json` may need adjustment.
- **Uninstall scope:** `uninstall.sh` strips the managed entries from the global
  `~/.codex/hooks.json` and removes the global `~/.codex/kaola-workflow` hook home.
  Agent profiles and the managed config block are removed from the project directory
  where `uninstall.sh` is run. Older project-local `.codex/hooks.json` files from
  pre-#447 installs should be removed to avoid double-firing.

---

## Module Exports — Public API Functions

The following functions are exported from sink, claim, re-plan, and forge modules for use by test suites and advanced integrations:

### GitHub Edition

**`scripts/kaola-workflow-sink-merge.js`:**
- `classifyMergeError(error)` — Classifies a push/merge error into `permission_denied`, `branch_protected`, `non_fast_forward`, or `null`. Used by `postMergeCleanup` to determine merge-impossible conditions and trigger fallback-to-PR behavior.

**`scripts/kaola-workflow-claim.js`:**
- `getCoordRoot(root)` — Derives the coordination root (shared state directory) from a repository root. Returns `<repo>/.git/kaola-workflow/` when `.git` is a directory, or falls back to `<repo>/kaola-workflow/` for worktrees.

**`scripts/kaola-workflow-replan.js`:**
- `prepareReplan(opts)` — Validates and durably prepares one claim-scoped epoch transition from a settled typed source attempt.
- `resumeReplan(opts)` — Idempotently advances the transaction through planner request, child freeze, parent snapshot, and journaled activation.
- `appendConsentExtension(opts)` / `verifyConsentLedger(ledger, epochLineageId)` — Append and verify exactly-one-slot, hash-chained consent extensions.
- `verifySnapshotManifest(epochDir)` / `verifyAllEpochSnapshots(projectDir, expected?)` — Recursively verify immutable epoch files, manifest self-digests, sequence, lineage, active-state binding, and consent ceiling.
- `readStatus(opts)` — Read the current re-plan fence and transaction status without mutation.
- `validateChildPlan(childBytes, transaction)` / `validateChildHandoffAuthority(paths, transaction)` — Enforce schema-2 child bindings, all-pending Ledger, exact child path, and durable pre-freeze CAS authority.
- `buildPlannerPacket(paths, transaction)` — Produce the topology-free evidence packet consumed by `workflow-planner` re-plan mode, including the precomputed `transaction.snapshot.authority_projection` and `authority_digest`; callers must pass a full transaction built by `buildTransaction`, not a partial legacy fixture.

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

5. **Branch cleanup**: Local branches matching `workflow/issue-*` (GitHub), `workflow/gitlab-issue-*` (GitLab), or `workflow/gitea-issue-*` (Gitea) are deleted unless `--keep-branch` is set — but never unconditionally (issue #620). `--execute` resolves the repo's default branch once, then for each candidate proves `git merge-base --is-ancestor <branch> <defBranch>` before running `git branch -D`; when that ancestry cannot be proven it falls back to the SAFE `git branch -d`, which git itself refuses when the branch carries genuinely unmerged work. A branch that survives (refused by `-d`) is never destroyed — it is reported in the new `skipped_unmerged` bucket (see below) with its tip SHA, instead of being silently force-deleted. This closes the exact data-loss shape (#617) `stale-worktree-cleanup` exists to remedy: `worktreeDirtyState` only detects *uncommitted* changes, so a branch with committed-but-unmerged work previously read as "clean" and was force-deleted anyway.

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
  "failed_preserve": [],
  "skipped_unmerged": []
}
```

**`skipped_unmerged` (issue #620).** An array of `{ branch, tip }` entries — one per candidate
branch whose committed work could not be proven merged into the resolved default branch (via
`git merge-base --is-ancestor`) AND whose safe `git branch -d` was refused by git itself (a
genuinely unmerged branch). `tip` is the branch's current commit SHA, recorded so the branch can
be recovered manually (`git branch <name> <tip>` after `git fetch`/`git worktree add`, if the
local ref itself was later pruned). This bucket is empty on a repo where every candidate branch
was already merged or safely deletable — it is not populated defensively.

**A pushed-and-at-parity branch is deleted, not skipped (R4 clarification).** A branch that is
pushed and at parity with its own configured upstream is deleted by the SAFE `-d` leg and lands in
`deleted_branch`, not `skipped_unmerged` — git considers a branch "merged" once it is an ancestor
of its own upstream, independent of whether it is also an ancestor of the resolved `defBranch`
used for the `-D` proof above. This is **not data loss**: the tip remains reachable via
`refs/remotes/origin/<branch>` and on the remote itself. It means `deleted_branch` does not imply
"ancestor-proven into `defBranch`" for every entry — only that the branch was not one `-d` refused
to delete.

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

**Fail-closed archive result boundary (#699).** The shared
`archiveSucceeded(result)` predicate returns true only for `{ archived: true }` or the idempotent
retry result `{ skipped: "source-missing" }`. Finalize, release/discard, and merged/closed PR/MR
watch callers must pass this post-call predicate before roadmap regeneration/removal, remote issue or
label disposition, worktree/branch/claim cleanup, terminal receipt stamping, or success output.
Thrown/caught errors, `archive_incomplete`, snapshot or destination-verification failures, missing
fields, and every other result shape stop with the live authority preserved. Successful watch and
finalize receipts derive `epoch_lineage_preserved` only after this predicate and recursive epoch
verification both pass.

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
  "selection_evidence": "present|absent",
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

**Attestation warning persistence to the archive (issue #653 / D-653-01).** The receipt fields above are otherwise ephemeral — recorded only in the finalize CLI's JSON stdout and the mutable `.cache/dispatch-log.jsonl`. `persistAttestationToSummary(destDir, receipt)` (`kaola-workflow-claim.js` + byte-identical Codex copy) durably appends a script-owned, presence-guarded (`/^## Attestation$/m`, create-if-absent) `## Attestation` section to the archived `finalization-summary.md`:

```
## Attestation
claim_planner_attested: <value>
finalize_contractor_attested: <value>
<every receipt.warnings entry starting with 'ATTESTATION WARNING' or 'attestation:', verbatim, one per line>
```

Both column-0 status fields are always written, even when both are `attested` — a clean result is a positive statement, not an absence. Called in `cmdFinalize` immediately after `checkDispatchAttestations`, before `computeGoalCheck`. `appendClosureBlock`'s field set independently gains the same two attestation fields in the archived `workflow-state.md`'s `## Closure` block (see `docs/workflow-state-contract.md`), so the archive carries two durable, mutually-reinforcing copies of the attestation outcome. **Known residual:** a contractor-authored summary that pre-seeds a column-0 `## Attestation` heading before finalize suppresses the append (the presence guard exists for crash-resume idempotence, not tamper-resistance) — fenced by the `## Closure` block + stdout receipt still carrying the true fields in the same run, and by finalize prose forbidding removal/summarization of the section; see `docs/decisions/D-653-01.md`.

**`selection_evidence` (issue #653 / D-653-01).** Advisory-only field, `null` default in `emptyReceipt()` (the `goal_check`-style template). `probeSelectionEvidence(cacheDirCandidates)` (`kaola-workflow-claim.js` + byte-identical Codex copy) iterates `[archiveCacheDir, liveCacheDir]` — the same candidate order and precedence the attestation probe uses — testing each for a file matching `/^selection-evidence\./`, returning `'present'` on the first match or `'absent'` if none is found. No invariant, no warning on absence: a user-named claim legitimately has none, since `issue-scout` only runs on the auto-bundle branch. The docked artifact and its persistence mechanism are documented in `docs/workflow-state-contract.md`.

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

`ok` is `true` only when `violations` is empty. An archive-result failure is a hard refusal at the
`archiveSucceeded` boundary, so `cmdWatchPr`/`cmdWatchMr` stop before cleanup or terminal success.
Warnings remain available for post-success receipt/attestation observations; they do not convert a
failed archive into an accepted result.

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

### Goal Attestation (`goal_check`, advisory, v1)

`cmdFinalize` emits a `goal_check` field in the closure receipt:

```
goal_check: satisfied | absent
```

- **`satisfied`** — `KAOLA_GOAL` was set (non-empty) when `cmdFinalize` ran, OR the
  `workflow-plan.md` contains a `goal:` line in its Meta block.
- **`absent`** — neither source was present at close time.
- **`unsatisfied`** is reserved for future enforcement; it is not emitted in v1.

`goal_check` is **advisory in v1**: it is recorded in the closure receipt for audit
purposes but does NOT block finalization regardless of its value.

**How to supply goal context.** Export `KAOLA_GOAL` before the finalization run:

```bash
export KAOLA_GOAL="harden the finalize flow and close the goal-attestation gap"
```

Alternatively, include a `goal:` line in the adaptive plan's Meta block — the
planner writes this at authoring time and `cmdFinalize` reads it from the archived
plan. Both paths produce `goal_check: satisfied`. `computeGoalCheck()` in
`scripts/kaola-workflow-claim.js` implements the v1 rule (env var wins, then the
plan's `goal:` line, else `absent`); the enum values are declared in
`scripts/kaola-workflow-closure-contract.js`.

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

**`sink_incomplete` refuse envelope (issue #497; `push_upstream` shape added by issue #619).**
When a hard `push_upstream`, `push_main`, or `closure` failure occurs, `sink-merge` emits a
refuse envelope to stdout (exit 1) instead of `status:sinked`. There are three distinct shapes
discriminated by `step`:

`step:"push_upstream"` (issue #619) — `git push -u origin <branch>` did not verifiably reach
parity with its upstream (`branch@{u}` ahead-count is not `0` after the push attempt); the
feature branch may not be backed up on the remote. The `push_upstream` step is left NOT done so
a re-run retries it.

```json
{
  "result": "refuse",
  "reason": "sink_incomplete",
  "step": "push_upstream",
  "push_upstream": "failed",
  "branch": "<branch-name>",
  "detail": "..."
}
```

`step:"push_main"` — the FF-merge landed locally but `git push origin <defBranch>`
threw. The branch is preserved; re-run `--sink` after resolving the push fault.

```json
{
  "result": "refuse",
  "reason": "sink_incomplete",
  "step": "push_main",
  "push_main": "failed",
  "branch": "<branch-name>",
  "default_branch": "<defBranch>",
  "detail": "..."
}
```

`step:"closure"` — the merge landed and `push_main` succeeded, but at least one
issue could not be closed on the forge (a bundle member or the primary issue), OR an
exit-0 close could not be verified closed on a live post-close probe (issue #619).
The `closure` step is left NOT done so a re-run retries it.

```json
{
  "result": "refuse",
  "reason": "sink_incomplete",
  "step": "closure",
  "remote_issue_closed": "partial",
  "closed_issues": [N, ...],
  "failed_issue_closures": [M, ...],
  "branch": "<branch-name>",
  "detail": "..."
}
```

**Closure gate covers the no-primary bundle shape (issue #592).** The close
loop that produces the outcomes above runs whenever a primary issue
(`--issue`) OR at least one bundle member (`--issue-numbers`) is present —
`!OFFLINE && (args.issue != null || issueNumbers.length > 0)`. A bundle sink
invoked with only `--issue-numbers A,B,C` (no `--issue`) closes every member;
the loop no longer requires a primary issue to run at all. The gate previously
keyed on `args.issue != null` alone, so a no-primary bundle sink skipped the
entire close loop yet still fell through to `stepDone("closure")`, reporting
`status: "sinked"` with zero issues closed — and because `resume` treats a
`"done"` step as already satisfied, the miss was permanent until manually
repaired.

In both cases the **sink-receipt** (`.cache/sink-receipt.json`) is updated
before the refuse emit:

- `push_main: "failed"` is written to the receipt on the `push_main` failure
  path (a new enum value for this field; the success path leaves the field
  absent until `stepDone("push_main")` records it as `done`).
- `remote_issue_closed: "partial"` and `failed_issue_closures: [M, ...]` are
  written to the receipt on the `closure` failure path. `remote_issue_closed`
  previously only held `"closed"` / `"failed"` / `"kept_open"` — `"partial"` is
  a new value, used exclusively when at least one member of a bundle could not
  be closed while others succeeded.
- `closed_issues: [N, ...]` (sorted ascending) is written to the sink-receipt
  whenever the closure step closes at least one issue, on BOTH the success and
  failure paths (issue #592). Previously it was recorded only alongside the
  `partial` failure — a successful closure fell straight through to
  `stepDone("closure")` with no `closed_issues` field, byte-equivalent to a
  closure that closed nothing. A resumed `--sink` can now read the field to
  verify what already closed rather than silently treat a `"done"` step as
  proof nothing is left to do.

`assertWorktreeClean` and transient probe faults (#496): `assertWorktreeClean`
runs BEFORE any destructive sink mutation. On a transient `git status` probe
failure (e.g. held `index.lock`), `assertWorktreeClean` **throws** (one bounded
retry absorbs a momentary fault first). This is a thrown `Error`, not a JSON
envelope — the caller sees exit 1 with a stderr message identifying the
transient fault. Re-run `sink-merge` after resolving the fault (e.g. removing
the stale lock file).

**`lingering_lane_group` refuse envelope (issue #552, fail-closed backstop).**
`sinkPreflight` runs FIRST in the `--sink` transaction (a pure read, zero
mutation). A clean write-parallel group completion DELETES the running-set
`lane_group` key (the `adaptive-node` `closeGroupMember` last-member path runs the
synthesizer + group barrier, merges every leg into the feature branch, then drops
the key). So a `lane_group` key that STILL EXISTS at sink time means a group never
cleanly synthesized + merged its legs — the surviving legs' committed work is NOT
on the branch, and advancing main would silently lose it. `sinkPreflight` reads
`running-set.json` from BOTH the live `kaola-workflow/<project>/.cache/` and the
post-finalize `kaola-workflow/archive/<project>/.cache/` locations and, if either
carries a non-empty `lane_group`, refuses (exit 1, ZERO mutation, main not
advanced) so the deliverable can never be lost. The runtime fix
(`closeGroupMember` derives "last member" from the authoritative ledger, and
`reconcile-running-set` self-heals `closed_members` + retains the close-direction
member's leg) prevents the desync in the first place; this backstop is the
defense-in-depth guard at the one irreversible point. `next-action`'s `allDone`
stays pure-ledger by design (#272) — the teeth live at the sink, not in the
aggregator. Remediation: run `reconcile-running-set`, resume the adaptive run so
the last member synthesizes + merges all legs, then re-run `--sink`.

```json
{
  "result": "refuse",
  "reason": "lingering_lane_group",
  "detail": "running-set.json (...) still carries a lane_group \"...\" with N member(s) and M leg(s) ..."
}
```

The same `lingering_lane_group` backstop is ALSO wired into the LEGACY (non-`--sink`)
main-advance path (`sink-merge.js` `main()`, the in-place merge sink finalize routes
through by default) as the FIRST precondition — issue #561 closed the asymmetry where
only the `--sink` transaction carried it, so an in-place adaptive run that left a
residual `lane_group` could no longer advance main with unmerged legs. The runtime
`adaptive-node` fixes (ledger-derived `isLast` + reconcile self-heal) still prevent the
desync upstream regardless of which sink path follows; both paths now carry the backstop.

**`worktree_dirty` refuse envelope (issue #562, fail-closed data-loss guard).**
`sinkPreflight` (the `--sink` transaction) now also runs `assertWorktreeClean` BEFORE the
merge step force-removes the linked worktree (`git worktree remove --force`). Previously
only the LEGACY path carried this guard; the `--sink` path force-removed with no clean
precondition, so a worktree carrying uncommitted work could be silently destroyed.
`assertWorktreeClean` throws on a dirty OR unprobeable worktree (fail-closed, #496/#506);
`sinkPreflight` converts that to a typed refusal (exit 1, ZERO mutation, worktree intact).
Resume-safe: an already-removed worktree matches no `worktree list` block and passes.
Remediation: commit or discard the worktree changes, then re-run `--sink`.

```json
{
  "result": "refuse",
  "reason": "worktree_dirty",
  "detail": "sink-merge refused: the linked worktree for branch ... has uncommitted changes ..."
}
```

### Sink journal disposal at terminal success (issue #653 / D-653-01)

`sink-receipt.json` and `sink-fallback.json` are crash-resume transaction journals owned by
`sink-merge.js` — previously they had no terminal cleanup and accumulated indefinitely in both
the live and archived `.cache/` directories after a successful sink.

`disposeSinkJournals(mainRoot, project)` (`kaola-workflow-sink-merge.js` + byte-identical Codex
copy, hand-mirrored into the divergent gitlab/gitea sink-merge ports) unlinks all four candidate
paths:

```
kaola-workflow/<project>/.cache/sink-receipt.json
kaola-workflow/<project>/.cache/sink-fallback.json
kaola-workflow/archive/<project>/.cache/sink-receipt.json
kaola-workflow/archive/<project>/.cache/sink-fallback.json
```

Per-file `try`/`catch`: `ENOENT` is treated as already-disposed (not a failure); any other unlink
error is a non-fatal stderr warning that never fails an otherwise-successful sink. Returns `true`
iff nothing remains on disk afterward.

**Call-site ordering is the correctness argument.** The call sits immediately after
`finalReceipt` is parsed from disk into memory, strictly AFTER every `SINK_STEPS` entry, the #484
ancestry freshness guard, and worktree/branch teardown have all completed — so ANY earlier crash
or refusal path returns before ever reaching the dispose call, and the journal survives for
resume exactly as before this issue (`testSinkTransactionCrashResume`'s pre-terminal-success
assertions are byte-unchanged). The terminal-success emit gains `journal_disposed: true|false`
alongside the unchanged `result`/`status`/`receipt` fields:

```json
{ "result": "ok", "status": "sinked", "journal_disposed": true, "receipt": { "...": "..." } }
```

A stray `sink-receipt.json`/`sink-fallback.json` found on a later "clean and synced" check (an
older cycle's residue, or a receipt from a pre-#653 run) must be deleted, never committed — a
journal is never part of the deliverable. See `docs/decisions/D-653-01.md`.

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
