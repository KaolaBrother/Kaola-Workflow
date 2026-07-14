# Workflow State Contract

This map is the detailed state inventory for Kaola-Workflow. Keep root memory
files such as `CLAUDE.md` and `AGENTS.md` limited to durable invariants and link
here for the full contract.

## Durable Sources

- Forge issues (GitHub, GitLab, or Gitea) are the canonical backlog and closure source when online.
- `kaola-workflow/.roadmap/issue-*.md` files are the durable local source for
  active roadmap rows. Do not purge the directory; closing an issue removes only
  that issue source file before regenerating the mirror.
- `kaola-workflow/{project}/workflow-state.md` is the active resume pointer. It
  records status, phase, step, pending gates, next command or skill, issue
  number, sink mode, branch, worktree path when known, and delegation policy.
  See the Workflow State Fields section below for the complete field inventory.
- Phase artifacts under `kaola-workflow/{project}/` are durable evidence while
  the project is active: `phase1-research.md`, `phase2-ideation.md`,
  `phase3-plan.md`, `phase4-progress.md`, `phase5-review.md`, and
  `finalization-summary.md`.
- Fast-path projects use `fast-summary.md` instead of the full Phase 1-5 set.
- Adaptive-path projects (`workflow_path: adaptive`, issue #227) use
  `workflow-plan.md` instead of the full Phase 1-5 set — the frozen DAG is the
  spine. It contains a `## Meta` block (frozen issue `labels:`), a machine-readable
  `## Nodes` table (`| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | wait_budget_minutes |`;
  `shape` ∈ `sequence` / `fanout(<group>)` / `loop(<cap>)` / `select(<group>)` (issue #263 Classify-And-Act);
  `selector_source` names the read-only classifier node whose `.cache` evidence determines which
  `select` arm executes — absent or `—` for non-arm nodes (backward-compatible: missing column treated as non-arm);
  a single unique `finalize` sink; `cardinality` is a reserved/advisory column — parsed but not
  validated or used by the grammar or gates, though its text still feeds `plan_hash`
  as part of `## Nodes`, so keep it present and stable; `wait_budget_minutes` is optional, with an
  absent/blank/dash cell preserving the tier-derived dispatch default and a validated integer cell
  freezing an extension of that floor), a `## Node Ledger` (`status` ∈ `pending`/`in_progress`/`complete`/`n/a`),
  and a script-computed `plan_hash` (an HTML comment `<!-- plan_hash: <sha256> -->`)
  that **lives inside `workflow-plan.md`** — never in `workflow-state.md`, because
  repair-state runs precisely when `workflow-state.md` is missing. The validator/claim
  scripts (never the agent) compute and re-check it. **Gate compliance rows for
  `code-reviewer`/`security-reviewer` must use the bare role string** (the anchored
  `DELEGATION_CONTROLLED_REQUIREMENTS` matcher), with per-instance disambiguation in
  the Evidence column only. The barrier commit order is `.cache` evidence → Node
  Ledger row → `workflow-state.md` pointer LAST, so a crash mid-node is recoverable.
- `.cache/` files under an active project hold supporting evidence referenced by
  phase artifacts or summaries. Key `.cache/` entries:
  - `dispatch-log.jsonl` — written by the `kaola-workflow-subagent-dispatch-log.sh`
    SubagentStart hook; each line is a JSON object recording a subagent spawn
    (`ts`, `agent_type`, `agent_id`, `cwd`, plus `model_planned` always resolved
    from the agent manifest and `model` the runtime-supplied tier — codex CLI
    only; empty otherwise). Used by `checkDispatchAttestations`
    at closure time for WARN-FIRST subagent-seam attestation (see `docs/api.md` § Closure Contract).
  - `selection-evidence.md` (issue #653 / D-653-01) — written by the `workflow-next.md` router,
    BEFORE the executor is dispatched, only on the no-issue-named auto-bundle branch: the
    `issue-scout`'s entire JSON recommendation, verbatim and fenced, with a one-line
    `selection_mode: auto-bundle|single-issue` header. Archives with the cycle automatically (no
    special-casing at `archiveProjectDir`). `probeSelectionEvidence` (`kaola-workflow-claim.js`)
    checks `[archiveCacheDir, liveCacheDir]` for any file matching `/^selection-evidence\./` and
    attaches `selection_evidence: present|absent` to the closure receipt (advisory only — a
    user-named claim legitimately has none, since the scout never runs on that branch). See
    `docs/api.md` § Closure Contract.
  - `review-attempts.json` (D-682-01) — the authoritative, plan-bound review transaction journal.
    It is schema version 1 and carries the frozen `plan_hash` plus immutable attempts keyed by a
    canonical logical-gate identity (gate kind + sorted origin/member sets), contiguous positive
    gate-local ordinals, candidate and receipt digests, exact evidence generations, canonical
    findings/routing rows, original producer barrier bindings, settlement state, and repair
    consumption. Physical `attempts[]` order is not chronology; the greatest validated ordinal is
    authoritative within a logical gate. The candidate digest excludes the active project subtree,
    `.kw/`, and `.git/`, so journal/ledger/cache transitions cannot change the reviewed product
    identity.

    The journal is evidence for the existing ledger/running-set lifecycle, not another scheduler.
    An attempt is written before a gate lifecycle transition. A failed sequence or fully-voted
    fan-out folds every logical-gate member to `pending`, removes those members from the running set,
    and only then records `lifecycle_settled:true`. This is a held-pending state: the rows are pending,
    but the settled unconsumed failure fences `orient`, normal opening, and generic reopen until an
    attempt-bound repair consumes it. An interrupted settlement is retried through its recorded
    `settlement_command`; a provisional fan-out remains unsettled until every exact member votes and
    a strict majority is computed. Passing close paths settle the journal only after the ordinary
    complete/compliance/running-set transition lands.

    Direct repair records the agent-selected writer before any ledger mutation, retains that writer's
    original baseline, then durably reopens the writer before deleting stale downstream artifacts.
    `repair.settled:true` precedes `consumed_by`, making retries at every seam idempotent. Cleanup uses
    the highest ordinal independently for each matching gate member, so reordering the JSON array
    cannot delete a newer live failure. Consumed repair count is scoped to the canonical logical-gate
    key: five are allowed and the sixth refuses as `repair_limit_reached`. Canonical routing remains
    in the journal; `findings-route.json` is only a regenerable projection. See `docs/api.md` §
    Authoritative review journal and direct repair.
  - `running-set.json` — tracks which nodes are currently in the running set
    (`{ state: 'opening'|'open', max_concurrent?: number, nodes: [...], updatedAt }`; per-node fields: `id`, `role`, `kind`,
    `baseline`, optional `opening` marker and `openedAt`). `max_concurrent` is set at
    `open-ready` time (`min(cap, --max || cap)`) and read by `reconcile-running-set` to
    cap roll-forward re-opens; absence implies 1 (fail-closed). Prevents double-open;
    a crashed `opening` state routes to `reconcile-running-set`. Since D-542-01, a planner-proven
    **disjoint write antichain co-opens by default** (isolated parallel legs + a mandatory
    synthesizer reconcile), so a multi-node write running set is the normal case rather than the
    exception; `KAOLA_PARALLEL_WRITES=0` forces a single-node serial running set. See the
    **`lane_group` extension** below.

    A member with a frozen override also carries `wait_budget_minutes` and
    `wait_budget_source: 'planner_override'`. These fields are copied into the durable manifest
    before dispatch and preserved by initial open, rolling top-up, survivor rewrites, and
    `reconcile-running-set`, so crash re-dispatch uses the same frozen value. Reconciliation counts
    stable members once, admits only eligible `opening:true` members up to `max_concurrent`, resets
    capped-out ledger rows to `pending`, and retains the same override metadata on every survivor.
    The running-set member ids and `in_progress` ledger rows must remain consistent after repair.

    **`kind: 'gate'` member (issue #607).** `open-next` and the `close-and-open-next` fused
    advance record an opened `main-session-gate` into `running-set.json` as a minimal entry
    (`{ id, role, kind: 'gate', declared_write_set, model, baseline: 'recorded', openedAt? }`) —
    the ONLY state channel that makes an open gate window visible to the write-lane hook's
    gate-window fence (rule (c); default-ON, `KAOLA_GATE_WINDOW_FENCE=0` opt-out), since a
    `main-session-gate` is opened serially and never lands in an `open-ready` batch frontier.
    Written AFTER the ledger flip to `in_progress`; removed by the same close paths that remove
    any other member (id-keyed). A crashed, non-`opening` lone gate is PRESERVED (not rolled back)
    by `reconcile-running-set` — an intended fail-closed tripwire, since clearing it would silently
    reopen the fenced window. A gate entry is excluded from every write-oriented scheduler count —
    `liveHasLeglessWrite`, `selectSpeculativeWriteGroup`, the `open-ready` read-slot base
    (`cap - liveNodes.filter(n => n.kind !== 'gate').length`), and the `reconcile-running-set`
    roll-forward budget all explicitly filter it out — so it never affects write co-open, slot
    accounting, or crash-resume ceilings. See `docs/decisions/D-607-01.md` and the narrow
    exception to `[INV-2]` this recording introduces, noted in `docs/architecture.md`.

    **`lane_group` key (issue #437; default-written for disjoint co-open since D-542-01).**
    When `open-ready` forms a write lane group, an optional top-level `lane_group` key is added to
    `running-set.json`. Its full schema is documented in `docs/api.md` § Lane-group co-open. State
    contract notes:

    - **Written by default for disjoint co-open frontiers.** A planner-proven disjoint write
      frontier co-opens as a lane group by default (D-542-01), so `running-set.json` carries a
      `lane_group` key whenever such a frontier is live. The key is **absent only** under an
      explicit serial opt-out (`KAOLA_PARALLEL_WRITES=0`) or for a non-disjoint (overlapping)
      frontier that did not form a group — in which case `running-set.json` is byte-identical to a
      serial/read-only run (absent `lane_group` ⟹ `null` ⟹ `closeGroupMember` is never entered).
    - **Absent when no group is live.** The key is cleared (the whole key is deleted, not set to
      `null`) when the last group member passes the group barrier and the group is dissolved.
    - **Size-1 leg group for a write co-opening behind live reads (issue #641).** When a lone
      leg-contained writer co-opens *behind* a live read frontier (the mirror of #622), it forms a
      **size-1** `lane_group` — the same descriptor shape and same `merge_awaits_read_drain` hold at
      the last-member merge, so the reads observe an untouched parent until the drain. A consent-tier
      `observes: scratch` R2b co-open is the exception: it is **legless** (no `lane_group`, no leg
      worktree — the writer must see the dirty parent's uncommitted context) and, being a single
      legless writer, the next tick's `write_node_exclusive` (G3) blocks any further open until it
      closes.
    - **Outside `plan_hash`.** `lane_group` is a runtime scheduler artifact, not plan structure.
      It is written into `running-set.json` (a non-hashed `.cache/` artifact), not into
      `workflow-plan.md`. The `plan_hash` covers only `## Meta` and the complete `## Nodes` section,
      including an optional `wait_budget_minutes` header and its cells — `lane_group`
      changes never invalidate the frozen plan hash.
    - **Two-phase crash-safety.** The group open follows the same crash-safe two-phase pattern as
      the single-node open: `running-set.json` is first written with `state:'opening'` AND `lane_group`
      present BEFORE any ledger row flips; then promoted to `state:'open'` after all baselines and
      ledger flips succeed. A crash with `state:'opening'` routes to `reconcile-running-set`.
    - **Group baseline co-residence.** The group baseline is stored in `.cache/barrier-base-<group_id>`
      and anchored at `refs/kaola-workflow/barrier-base/<sanitized-group_id>` — the same mechanism
      as per-node baselines, keyed by `group_id`. It is recorded BEFORE the `opening` manifest write
      (orphan-baseline direction is safe). It is dropped via `--drop-base --node-id <group_id>` after
      a barrier pass, or during reconcile rollback when all members roll back.
    - **`closed_members` vs `members`.** `members` is the FULL bare id list, stable during the group
      lifetime. `closed_members` is an accumulating id list updated at each non-last-member close.
      The last-member detector reads `closed_members` (not the ledger) so a group-barrier invocation
      can safely run while the last member's ledger row is still `in_progress`.
    - **Reconcile-running-set.** The `#437` block in `reconcile-running-set` carries forward group
      survival logic: `lane_group` survives if ≥1 member id is in `survivorIds`; if all members roll
      back, `lane_group` is deleted and the group baseline is dropped.
    - **Read entries may now co-reside with a live `lane_group` (issue #622).** `nodes` in
      `running-set.json` can carry a `kind:'read'` entry alongside a live `lane_group`'s write
      members — previously impossible, since `write_node_exclusive` refused any co-open while any
      write was live. Only a LEGLESS write (no `lane_group`) still excludes co-open entirely. See
      `docs/architecture.md` and `docs/decisions/D-622-01.md`.
    - **Tracked evidence-stub seeding at formation (issue #633).** At group formation, `open-ready`
      seeds each `toOpen` member's `.cache/{node-id}.md` evidence stub and COMMITS it as a tracked
      file on the parent branch (via the `legMirrorPath` helper, `kw-stub: <group_id>` commit)
      BEFORE `baseRev` is captured and legs branch off — so every leg inherits the stub as an
      ordinary tracked file rather than an untracked parent-side write, preventing a "untracked
      working tree file … would be overwritten by merge" collision at the last-member merge. A
      commit failure here refuses the open (`stub_commit_failed`). This precedes, and is unrelated
      to, the per-node barrier commit order described above (it is a scheduler-owned commit at
      OPEN time, never part of a node's own barrier/ledger/pointer sequence).
    - **Leg-authoritative evidence read at close and downstream dispatch (issue #633).** A write-role lane-group member
      self-writes its REAL evidence INSIDE its own leg (the absolute `dispatch.leg_path` its
      working_dir names), never synced back to the parent before group merge. `close-node`,
      `record-evidence --verify`, and a dependent read's `dispatch.upstream_evidence` resolve current
      `lane_group` membership first and use the member's own leg copy of `.cache/{node-id}.md` via
      `legMirrorPath`. A declared leg whose artifact is missing refuses `evidence_absent`; it never
      falls back to the parent's tracked seed or a parent decoy. Every non-lane-group case (a legless
      write or a read node) continues to use the parent copy. See `docs/decisions/D-622-01.md`.
  - `active-batch.json` — retired parallel-batch manifest (`state: 'opening'|'open'|'sealed'|'joined'`).
    No live component writes this file anymore — its sole writer, `kaola-workflow-parallel-batch.js`,
    was retired (D-586-01) once the per-node running-set scheduler fully absorbed its
    responsibilities. The `batch_active` backward-compat detection that
    `kaola-workflow-adaptive-node.js`'s guard prologue kept after that retirement was itself
    removed (D-594-01), along with the sibling `active_batch_exists` plan-repair-reopen refusals —
    a residual file on disk is now silently inert to every mutation guard. Only `orient`'s
    read-only manifest legality reconstruction still reads it (always `null` in producible state).
  - `scheduler.lock` (issue #585) — a **transient coordination artifact**, not durable workflow
    state. A project-scoped O_EXCL lockfile (`fs.openSync(path, 'wx')`) that `adaptive-node.js`
    `main()` acquires before every mutating scheduler subcommand body and releases in a `finally`;
    its holder payload is `{ pid, host, ts, subcommand }`. Barrier-exempt (the `kaola-workflow/`
    prefix allowband) — a held lock can never trip the per-node write-set barrier — and it is never
    archived as live state (its absence on disk is the normal, unlocked state between
    invocations, and `archiveProjectDir` does not special-case it because a project should never
    be finalized while it is held). A dead holder's lock is classified stale (`isStaleLock`) but
    NEVER auto-removed; safe manual removal (`rm`) is ONLY appropriate for a confirmed-dead holder,
    from ONE operator session at a time. See `docs/api.md` § Scheduler mutual-exclusion lock and
    `docs/decisions/D-585-01.md`.
  - `barrier-base-<id>` — per-node baseline commit tree SHA recorded by `--record-base`
    at node-open time. Used by `--barrier-check --node-id <id>` to tree-diff exactly
    that node's own writes. Idempotent (reused on re-entry, never re-snapshotting a
    dirty tree). Dropped by `--drop-base` on rollback/close-direction reconcile.
  - `barrier-open-<id>` — freshness token recording the HEAD SHA at node-open time;
    used to detect `stale:head_advanced` (the worktree advanced between baseline
    recording and the barrier check). Absent on disk → binding check is skipped
    (backward-compatible).
  - `chain-receipt.json` — the self-host chain-verification receipt `run-chains.js` writes and
    `--finalize-check` gates on (full schema and gate precedence in `docs/api.md` §
    `kaola-workflow-run-chains.js`). **Fail-closed since #618** on two previously fail-open shapes: (1) a
    per-chain child terminated by an OS signal (an external OOM-kill or operator `SIGKILL`, not
    necessarily the run-chains own per-chain timeout) now always maps to `exitCode: 1` on both the
    sync and async dispatch paths — never falling through to a false-green `0` — and the
    terminating signal name is recorded in a new `signal` field (`null` on a normal exit); (2) a
    fresh, HEAD-bound receipt whose `chains[]` array is empty (zero chains verified) is now a typed
    `chains_empty` refusal in `--finalize-check`, precedence-ordered between `chains_stale` and
    `chains_red`, mirroring the producer's own `no_chains` refusal to *write* an empty-chains
    receipt in the first place. See `docs/decisions/D-617-01.md`.
  - `final-validation.md` — the CONSUMER (non-npm) repo-kind equivalent of `chain-receipt.json`;
    recorded by the agent, not a producer script. A column-0 `verdict: pass` line is the base
    gate; a column-0 `validated_candidate_hash: <64-hex>` line (issue #653 / D-653-01) binds that
    verdict to the exact candidate tree it validated. Produce the hash via
    `kaola-workflow-plan-validator.js --candidate-hash --json` (read-only, no tests executed),
    computed LAST — after every file the validation covered has landed. `--finalize-check`
    (consumer mode) refuses `final_validation_unbound` (no well-formed hash line) or
    `final_validation_stale` (the recorded hash no longer equals a fresh recompute over the
    current tree, once workflow-state and inert non-test-consumed docs are excluded) before
    accepting the verdict. A citation of a prior terminal validation run (`source: cited:<node-id>`
    / `validated_command` / `validated_at_head` / `reuse_boundary`, #648) still requires a FRESH
    hash computed at citation time. See `docs/api.md` § Candidate-hash binding for consumer
    final-validation and `docs/decisions/D-653-01.md`.
- `kaola-workflow/archive/{project}/` keeps completed, abandoned, or stale
  project folders after finalize or discard.
- **Closure normalization (#324):** when `archiveProjectDir` archives a project with
  `status: closed`, it also normalizes the terminal state so a later audit reading only the
  archive cannot mistake it for an in-flight run: the `## Pending Gates` body is rewritten to
  `- none`, `last_command`/`last_result` become `finalize`/`closed`, any
  `finalization-summary.md` has its pre-sink sentinels (`READY FOR FINAL GIT GATE`,
  `Pending final git gate. …`) neutralized, and the known false-absolute phrase
  (`No files changed after those runs`) in `.cache/final-validation.md` is rewritten to a
  reuse-boundary caveat (#324 AC3 backstop) — all before the folder is renamed into `archive/`. A
  `discard`/`release` archive (non-`closed`) deliberately keeps mid-run state. The accurate
  validation-reuse boundary is stated by the agent per the finalize Validation De-Duplication
  guidance; the archive-time rewrite is only a mechanical backstop for the known phrase.
- **Terminal stamp + closure receipt (#333):** the #324 normalization is extended (and extracted
  into the pure `stampTerminalState` helper) so a `closed` archive is fully terminal. In addition
  to the #324 rewrites, the archived `workflow-state.md` gets `next_command`/`next_skill` rewritten
  to `none (archived)` (an archived run must not advertise an active resume command — an adaptive
  archive would otherwise keep `/kaola-workflow-plan-run {project}` forever); the Planning Evidence
  `plan_hash` refreshed from the FINAL `workflow-plan.md` frozen `<!-- plan_hash: … -->` comment (a
  mid-run re-freeze re-stamps only the plan file, leaving the state on the claim-time hash); and the
  `## Last Updated` line refreshed to the archive timestamp. After the rename, a compact `## Closure`
  block is appended recording `archived_at`, `issue_disposition`, `claim_label_removed`,
  `worktree_removed`, `closure_invariants`, and (issue #653 / D-653-01) `claim_planner_attested` /
  `finalize_contractor_attested` (presence-guarded / idempotent). `issue_disposition`
  enum: `kept-open | close-pending | closed | unknown`. On the `cmdFinalize` lane disposition is
  DECISION-derived — the default merge lane is honestly `close-pending` because the orchestrator
  closes the issue AFTER sink-merge, and `--keep-open` records `kept-open` + `last_result:
  closed_keep_open`; on the `watch-pr`/`watch-mr` MERGED lane it is OBSERVATION-derived via
  `probeIssueState` (a merged PR/MR does not imply a closed issue — `kept-open` when the probe sees
  the issue open, `unknown` when the probe is unavailable). A **manual-archive backstop** in
  `cmdFinalize` heals a state that was archived by a manual `mv`/`git mv` (live folder gone,
  `status: active` in the archive): re-running `finalize` over it stamps it terminal in place and
  reports `archive_state_stamped: repaired` (`not_needed` when already terminal, `failed` on error).
  The keep-worktree commit choreography runs commit-last so the `## Closure` append + backstop
  writes land inside the `chore: archive` commit. NOTE for out-of-repo tooling: a `next_command:
  none (archived)` only ever appears under `kaola-workflow/archive/`; `resume`/`status`/`repair-state`
  read active folders only and never see it.
- **Attestation persistence (issue #653 / D-653-01):** independently of the `## Closure` block's
  `claim_planner_attested`/`finalize_contractor_attested` fields above, `cmdFinalize` also appends
  a script-owned, presence-guarded `## Attestation` section to the archived
  `finalization-summary.md` — the same two status fields plus every non-empty `ATTESTATION
  WARNING`/`attestation:` warning, verbatim — so a warning that fired during the run survives the
  archive even if a summary is otherwise read as clean. See `docs/api.md` § Closure Contract.
- Closure of a completed linked issue is governed by explicit invariants and an
  auditable receipt schema. See `docs/api.md` § Closure Contract for the nine
  closure invariants (seven hard-gating + two WARN-FIRST detection invariants added in #277),
  the receipt field/enum schema, and the flow mapping. The closure contract is
  implemented in `scripts/kaola-workflow-closure-contract.js`.

  **Sink-receipt schema extensions (#517, #518):**

  - **`branch_head`** (cycle-identity binding, #518) — the branch-tip SHA stamped into
    `sink-receipt.json` at `loadOrInitReceipt` init time. At load time, a receipt whose
    `branch_head` is absent (pre-#518), does not equal the current branch tip, AND is not
    an ancestor of the current branch tip is treated as a stale prior-cycle receipt and
    reinitialized (emits `stale_sink_receipt`). A receipt whose `branch_head` is an ancestor
    of the current tip belongs to the current cycle and is resumed normally. The #484 ancestry
    backstop (post-step-loop check that the feature branch tip is an ancestor of the default
    branch) is preserved as a defense-in-depth layer. Absent in receipts written before #518;
    conservatively treated as unbound at load time.

  - **`remote_issue_closed: "reopened_after_autoclose"`** (post-push keep-open verification,
    #517) — a new value in the `remote_issue_closed` enum, recorded when `keepIssueOpen` is
    true and a post-`push_main` probe finds the issue was auto-closed by GitHub's commit-keyword
    mechanism, and the workflow successfully reopened it. Distinguishes a corrected auto-close
    event from the nominal `"kept_open"` path (no auto-close interference) and from the failure
    `"failed"` path (reopen attempted but failed). The existing enum values are unchanged:
    `"closed"` (workflow closed it), `"kept_open"` (bypassed and confirmed open),
    `"partial"` (mixed bundle outcome), `"close_pending"` (deferred to sink-merge),
    `"failed"` (close attempted and failed).

  - **`closed_issues`** (closure gate + verify-then-retry resume, #592) — the sorted array of
    issue numbers closed by the `closure` step is now recorded on the sink-receipt on BOTH the
    success and failure paths; previously it was written only alongside a `"partial"` failure,
    so a successful closure left the field absent. The `closure` step's own gate was also
    widened to run whenever a primary issue (`--issue`) OR at least one bundle member
    (`--issue-numbers`) is present, rather than requiring a primary issue — a bundle sink
    invoked with only `--issue-numbers` (no `--issue`) now closes every member instead of
    skipping the close loop while still recording the step `"done"`. See `docs/api.md` §
    Closure Contract for the full gate condition and JSON shape.

  - **`remote_closed_after_publish: "verified" | "failed"`** (publish-before-close hard gate,
    #617) — recorded by `checkClosureInvariants` whenever a caller supplies the implementation
    commit and sink-target refs (`sink-merge`'s `postMergeCleanup`, and the `closure` step's own
    re-check immediately before it), verifying via `git merge-base --is-ancestor` that the
    implementation commit is actually an ancestor of the sink target before trusting the receipt's
    close. A caller that supplies neither ref (`cmdFinalize`'s merge-lane, which defers its own
    close) leaves the field unset — the invariant is a pure no-op there, unchanged from before
    #617. Wires the `remote-closed-after-publish` closure invariant, declared since #164 but never
    evaluated until this fix. `kaola-workflow-sink-merge.js`'s `SINK_STEPS` also reorders `closure`
    to run **last** (after `push_main`, not three steps before it) — a merge sink can no longer
    close an issue before its implementation has actually reached the pushed default branch. See
    `docs/decisions/D-617-01.md`.

  - **`published_head`** (fresh post-rebase cycle tracking, #631) — an ADDITIVE field stamped
    into `sink-receipt.json` at the `closure` step's gate, once the live feature-branch tip
    resolves as genuinely published (`git merge-base --is-ancestor` into the sink target
    verified). Unlike `branch_head` (#518, stamped once at receipt init, BEFORE `doRebase` runs),
    `published_head` captures the branch's FRESH tip after a mid-flight rebase (a concurrent
    `origin/main` advance racing a `--sink` run) rewrites its commits — a rebase that lands
    genuine content but orphans the pre-rebase `branch_head` SHA from the sink target's ancestry.
    `branch_head` is **never mutated** by this fix; its #518 cycle-identity role is unchanged.
    `cmdVerifySink` resolves the implementation commit via `r.published_head || r.branch_head`,
    preferring the fresh field and falling back to `branch_head` only for legacy receipts written
    before this field existed. This closes a false `impl_commit_not_ancestor` verify-sink failure
    on a cleanly rebased, genuinely published sink. See `docs/decisions/D-619-01.md`.

  - **Terminal journal disposal (issue #653 / D-653-01).** `sink-receipt.json` and
    `sink-fallback.json` are crash-resume transaction journals, not durable deliverable state.
    `disposeSinkJournals(mainRoot, project)` unlinks all four candidate paths (live + archive
    `.cache/`, both filenames) once `finalReceipt` has been captured into memory and every
    `SINK_STEPS` entry, the `branch_head`/`published_head` ancestry guard, and worktree/branch
    teardown have all completed — so an earlier crash or refusal never reaches the dispose call
    and the journal survives for resume unchanged. The terminal-success emit gains
    `journal_disposed: true|false`. A stray journal found on a later "clean and synced" check (an
    older cycle's residue) must be deleted, never committed. See `docs/api.md` § Sink journal
    disposal at terminal success.

## Workflow State Fields

The `workflow-state.md` file contains several key blocks:

- `## Current Position` — Active phase, step, workflow path, runtime, and next command or skill. Key fields:
  - **workflow_path** — Workflow execution path (`full`, `fast`, or `adaptive`). Persisted from the `KAOLA_PATH` environment variable (set `KAOLA_PATH=fast` to request the fast path), or the `--workflow-path` startup flag when supplied; defaults to `adaptive`. `claimProject` validates the persisted value: adaptive is always legal; `fast`/`full` require membership in `installed_paths` (`~/.config/kaola-workflow/config.json`) — any other value is a **typed `path_not_installed` refusal**, never a silent downgrade.
  - **runtime** — The runtime that claimed the folder (`claude`, `codex`, or `opencode`). Persisted from the `--runtime` startup flag; defaults to `claude`.
- `## Sink` — Issue number, sink mode (merge or pr), branch name, worktree path, and `run_posture` (`worktree` or `in-place`). `run_posture` is derived from the actual worktree resolution at startup via `deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`; it is never inherited from an environment variable. Adaptive runs always provision a worktree, so `run_posture: worktree` is the normal adaptive value. An optional `issue_action: close | comment_keep_open` line (default `close` when absent, issue #336) marks a keep-open partial-close terminal: the main session writes `comment_keep_open` at the Closure Decision Gate to keep the issue OPEN — `finalize`/`sink-merge` then preserve the roadmap source, comment instead of closing, and refuse a PR/MR sink (keep-open is merge-sink-only).
  Three **claim-time session fields** are written by `writeState` (in `kaola-workflow-claim.js`)
  and are never refreshed — `updateState`/`stampTerminalState` partial-edit paths do not touch
  them. All three live in the `## Sink` block, immediately after `run_posture`:

  - **`main_root`** — The resolved main-repo root path, computed once by `resolveMainRoot(root)`
    (exported from `kaola-workflow-adaptive-schema.js`) at claim time. The executor reads this
    field back from the local `workflow-state.md` instead of re-deriving from cwd, eliminating
    an authority split when a node runs from a linked or detached worktree. Absent on pre-#579
    state files; the executor falls back to `getMainRoot(repoRoot)` when absent
    (backward-compatible). Value is an absolute path with no trailing slash.
  - **`session_marker`** — The session identity for liveness classification, produced by
    `resolveSessionMarker(env)` (from `kaola-workflow-classifier.js`): `KAOLA_SESSION_MARKER`
    from the environment when set (allowing an orchestrator to mint one stable identity for the
    session), otherwise `s-<pid>-<timestamp-base36>`. Stamped once at claim time; never refreshed.
    Must not reuse any of the retired `## Lease` field names (`session_id`, `last_heartbeat`,
    `expires`, `owner_session_id`, `claim_comment_id`) — those are erased by `removeLegacyStateBlocks`.
  - **`claim_ts`** — The ISO-8601 claim timestamp (`new Date().toISOString()`), the liveness
    anchor. Together with `LANE_STALENESS_MS = 86400000` (24 hours, exported from
    `kaola-workflow-adaptive-schema.js`), it drives the lane-freshness test: a `claim_ts` whose
    age exceeds the threshold is classified `stale` (safe to resume as a leftover); a `claim_ts`
    within the threshold is `ambiguous` (prompt before overwriting a potential active co-tenant).

  A fourth field in the same block, **`codex_dispatch_mode`** (issue #603), is **optional** —
  written only when the startup surface (`cmdStartup`) receives `--codex-dispatch-mode`,
  immediately after the three claim-time session fields above. The flag is value-validated
  BEFORE any claim mutation via `resolveCodexDispatchModeFlag` (`kaola-workflow-claim.js`): the
  legal set is exactly two literals, `v2-task-name` or `v1-thread-id`; any other value, or one
  carrying a newline, refuses the claim with `invalid_codex_dispatch_mode` and zero mutation
  (the same newline-injection fence as `worktree_path`/`branch`, via `assertNoNewline`). When
  absent, the field is omitted entirely (byte-identical to pre-#603 state files) and the
  adaptive dispatch-card builder (`resolveCodexDispatchMode` in `kaola-workflow-adaptive-node.js`)
  falls back to the `KAOLA_CODEX_DISPATCH_MODE`/`CODEX_DISPATCH_MODE` environment override, then
  to the `v1-thread-id` fail-closed default. Like the three fields above, it is written once at
  claim time and never refreshed.

  `cmdStatus` annotates each active-folder item with a `lane_bucket` field (output of
  `classifyLane` from `kaola-workflow-classifier.js`). Four possible values, applied via a
  top-down precedence ladder (first match wins):

  | Bucket | Meaning | Precedence |
  |---|---|---|
  | `mine` | `session_marker` matches own session identity | 1 — highest |
  | `live` | `KAOLA_COTENANT=1` blanket co-tenant signal active | 3 |
  | `stale` | Explicit resume instruction names this issue, OR `claim_ts` absent or older than `LANE_STALENESS_MS` | 2 / 4 |
  | `ambiguous` | `claim_ts` present and younger than `LANE_STALENESS_MS`, no stronger signal | 4 |

  `cmdResume` excludes `live` lanes from the resume candidate set; `stale` and `mine` lanes
  are resumable. An `ambiguous` lane triggers the existing resume-ambiguity refusal (ask before
  overwriting).

- `## Lease` — (Legacy, deprecated) Coordination metadata; preserved for backward compatibility
- `delegation_policy:` — Delegation mode for Codex workflows. Defaults to
  `delegate`, established without prompting the user; `local-authorized` is an
  explicit opt-out and `tool-unavailable` is auto-detected, not a user choice:
  - `delegate` — Default. Invoke subagent roles when available (records `subagent-invoked` in compliance ledgers); when role profiles are absent, keep `delegate` and record evidenced `local-fallback-tool-unavailable` rows
  - `local-authorized` — Execute locally; set only when the user explicitly disables delegation (records `local-fallback-explicit`)
  - `tool-unavailable` — Legacy/explicit value for locally-executed runs when subagent tooling is unavailable (records `local-fallback-tool-unavailable`); new runs detect this per-row under `delegate` rather than selecting it at startup

Phase artifacts record delegation decisions in their **Required Agent Compliance** ledgers
using the same four-token vocabulary: `subagent-invoked`, `local-fallback-explicit`,
`local-fallback-tool-unavailable`, or `N/A`. This audit trail documents what authority
was invoked for each delegated task.

When `delegation_policy:` is present, Codex repair-state checks phase compliance
ledgers before crossing a phase boundary. Codex role rows must match the policy:
`delegate` requires `subagent-invoked` unless every role row is an evidenced
`local-fallback-tool-unavailable`; `local-authorized` requires
`local-fallback-explicit`; `tool-unavailable` requires evidenced
`local-fallback-tool-unavailable`. Plain `invoked` remains reserved for
non-Codex-role workflow gates such as advisor review, final validation,
documentation docking, roadmap refresh, archive, and final commit.

**Adaptive `finalize` sink row — `main-session-direct` (issue #338).** The adaptive plan's
mandatory `finalize` DAG sink node is, by the plan-run contract, executed by the main session
directly (no `Agent()` dispatch). Its Required Agent Compliance row therefore carries the status
`main-session-direct` — a sink-node-only token that sits OUTSIDE the four-token delegation
vocabulary above and is NOT delegation-controlled (a `finalize (<node>)` requirement matches none
of repair-state's `DELEGATION_CONTROLLED_REQUIREMENTS`, so the token never trips a delegation
check). It is deliberately NOT `local-fallback-*`: inline sink execution is the designed behavior,
not a fallback. This row is distinct from the Finalization-phase mechanical bookkeeping, which is
delegated to the `contractor` and attested separately via the closure receipt's
`finalize_contractor_attested` field.

## Bundle Project State Fields (issue #328)

On a bundle project, three additive fields are written to `workflow-state.md` alongside the existing `issue_number` field. **Single-issue projects retain only `issue_number` — these fields are absent on non-bundle projects (AC#1 invariant).**

```
issue_number: 42
issue_numbers: 42,47,53
bundle_id: bundle-42-47-53
closure_policy: all_or_nothing
```

- **`issue_number`** — Primary issue (first in the sorted set). Preserved verbatim for all tooling that reads single-issue state (backward-compatible).
- **`issue_numbers`** — Full comma-separated sorted set of issue numbers. Presence of this field identifies the project as a bundle project.
- **`bundle_id`** — Canonical identifier for the bundle: `bundle-<N1>-<N2>-...` (issues in ascending numerical order). Used as the project folder name (`kaola-workflow/bundle-42-47-53/`) and as the branch name stem.
- **`closure_policy`** — Always `all_or_nothing` for v1 bundle projects. Every issue in the set must be closeable before any issue is closed; partial closure is not a success state. Enforced (#369) by `sink-merge` closing every member of `issue_numbers` on the success path and by the `remote-members-closed` closure invariant, which flags (warn-first-but-VISIBLE) any member left unclosed while online — so a partial close trips `closure_invariants.ok = false` rather than reporting a clean success.

### Bundle coherence invariant (issue #430)

`bundle_id` and `issue_numbers` must be mutually consistent at all times:

```
bundle_id == "bundle-" + sorted(issue_numbers).join("-")
```

This invariant is enforced at three independent points:

1. **Claim time (`cmdStartup`)** — a `target_set_mismatch` refusal fires if the `--target-issues` set does not match the persisted `issue_numbers`.
2. **Handoff time (`adaptive-handoff.js runHandoff`)** — a `bundle_state_incoherent` refusal fires if `bundle_id` is present but `issue_numbers` is absent or the derived bundle ID from `issue_numbers` does not match `bundle_id`.
3. **Orient time (`adaptive-node.js orient`)** — the same `bundle_state_incoherent` refusal fires at every plan-run entry.

**Do not hand-edit `issue_numbers` or `bundle_id` independently.** If a repair is needed, update BOTH fields together so the invariant holds, then re-verify at the next startup or orient.

### Bundle project and branch naming

| Artifact | Naming convention |
|----------|------------------|
| Active folder | `kaola-workflow/bundle-42-47-53/` |
| GitHub branch | `workflow/bundle-42-47-53` |
| GitLab branch | `workflow/gitlab-bundle-42-47-53` |
| Gitea branch | `workflow/gitea-bundle-42-47-53` |
| Worktree path | `.kw/worktrees/bundle-42-47-53/` |

The numbers in the bundle identifier are always in ascending sorted order, matching the order in `issue_numbers`.

## Adaptive Path — `installed_paths` Config Field (#538)

The adaptive path (issue #227) is the unconditional default — no switch to flip, nothing to
configure for a standard install. `fast` and `full` are install-time opt-ins recorded in the shared
config.

- **Location & default.** A list-valued `installed_paths` field in the existing global store
  `~/.config/kaola-workflow/config.json` (the same file as `parallel_mode`; one shared path, no
  per-edition namespace). **Default `[]`** (absent or malformed reads as `[]` = adaptive-only).
  Adaptive is implicit-always and never appears in the array.
- **Resolution.** `resolveInstalledPaths(config)` (exported from
  `kaola-workflow-adaptive-schema.js`) reads `installed_paths`, drops unknown tokens, and returns a
  frozen subset of `["fast","full"]`. No env override — "installed" is an on-disk fact, not a
  per-session toggle. There is no env override for `installed_paths`.
- **install.sh** opt-ins: `--with-fast` and `--with-full`. The installer performs a read-modify-
  write UNION — it never removes an already-installed path. A bare `./install.sh` reinstalls what
  is already installed. `uninstall.sh` removes the config file; reset to adaptive-only = uninstall
  → reinstall.
- **Selection semantics.** `isLegalWorkflowPath(value, installedPaths)` (from the schema) is the
  single legality gate: adaptive is unconditionally legal; `fast`/`full` require membership in
  `installedPaths`. It is **not** read by `repair-state.js`/`routeAdaptive`, by
  `kaola-workflow-plan-validator.js`, or by the two `claim.js` resume surfaces.
- **Finish-in-flight.** An already-frozen adaptive project (a `workflow-plan.md` exists) resumes
  to completion regardless of any config change. Both `claim.js` resume surfaces (`writeState`
  next_command default and `resumeFallbackCommand`) and `routeAdaptive` recognize
  `workflow_path: adaptive` and emit `/kaola-workflow-plan-run {project}` toggle-agnostically —
  never `/kaola-workflow-phase{N}`.

## Codex Task Mirror (issue #266, AC-C + AC-D)

`kaola-workflow/{project}/workflow-tasks.json` is a **durable artifact** generated
by `kaola-workflow-task-mirror.js` from the frozen `workflow-plan.md`. It is part of
the adaptive-path durable state and must be treated as a generated mirror — never
hand-authored.

**Runtime generation/reconcile (issue #282):** generation is wired into the runtime, not
left to a manual CLI call. The adaptive handoff (`kaola-workflow-adaptive-handoff.js`)
generates the mirror once the plan is frozen, so it exists from the first plan-run entry,
and `kaola-workflow-adaptive-node.js orient` reconciles it on **every** plan-run resume by
shelling the task-mirror CLI (the write lands in that subprocess, so `orient` stays
read-only with respect to the plan/ledger/state). Both are best-effort: a non-frozen plan
degrades silently and the compact-resume hook tolerates an absent mirror.

**Source of truth chain (important):**

The three levels of task state must never be confused:

1. `## Node Ledger` in `workflow-plan.md` — **correctness truth**. The authoritative
   record of node lifecycle state. Scripts and barrier logic read only this.
2. `workflow-tasks.json` — **durable mirror** derived from the `## Node Ledger` (and
   the `## Nodes` table). Generated; regenerated on resume when missing, unparseable,
   or when the stored `source_plan_hash` does not match the current plan hash.
3. Codex UI task list — **ephemeral UI mirror** of `workflow-tasks.json`. It mirrors
   the file; it is **NOT correctness state** and must never be treated as the reverse.
   Writing a task item complete in the UI does not update the `## Node Ledger` and
   confers no workflow guarantees. When the UI task list and `workflow-tasks.json`
   disagree, `workflow-tasks.json` (and by extension the `## Node Ledger`) is
   authoritative.

**When to regenerate:** on plan-run resume, compare the on-disk
`workflow-tasks.json.source_plan_hash` against `readStoredHash` from the current
`workflow-plan.md`. Regenerate when the file is missing, unparseable, or the stored
hash does not match. When the hashes match, regeneration is still idempotent and
cheap (the ledger advances under a fixed `plan_hash`); run it to keep the mirror
current.

**Schema:**

```json
{
  "source_plan_hash": "<64-hex, from the frozen plan_hash>",
  "tasks": [
    { "id": "explore", "role": "code-explorer", "status": "completed", "ledger_status": "complete" }
  ],
  "last_synced_from_ledger": "<ISO timestamp>"
}
```

Field rules:
- `source_plan_hash`: the `plan_hash` from `workflow-plan.md` (`readStoredHash`); absent on an unfrozen plan — the mirror is only meaningful for a frozen plan, and the generator refuses with `{ "status": "plan_not_frozen" }` when the hash is absent.
- `tasks[]`: ordered by `## Nodes` row order. `ledger_status` is the raw value from `## Node Ledger` (`complete`/`in_progress`/`pending`/`n/a`); `status` is the UI-facing mapping: `n/a` ledger → `status:"completed"` (for Codex UI compatibility, the skipped arm still appears completed), all others map one-to-one.
- `last_synced_from_ledger`: the timestamp at which the mirror was last written; injected deterministically in tests via `generateMirror({ planContent, now })`.

See `docs/api.md` § Codex Harness Scripts for the generator CLI and the full `ledger_status → status` mapping table.

## Script-Owned Mechanical Transitions (issues #456 / #457 / #458 / #272)

Every mechanical transition that mutates `workflow-state.md` or a phase file is owned
by a typed transaction script the main session runs directly (ADR 0004) — the
`contractor` subagent is no longer in the per-phase loop. Each writes in crash-safe
order (`.cache`/phase file first, the `workflow-state.md` pointer last), is idempotent
on resume, and preserves any `## Sink` block byte-for-byte.

| Path | Script | Owns |
|------|--------|------|
| Fast | `kaola-workflow-fast-advance.js` (#456) | `.cache`/`fast-summary.md` + `## Status` lifecycle + the fast `step` pointer |
| Full Phase 1/2/3/5 | `kaola-workflow-full-advance.js` (#457) | the per-phase checkpoint + `phase{2,3,5}-*.md` authoring |
| Full Phase 4 | `kaola-workflow-phase4-advance.js` (#458) | `phase4-progress.md` (Tasks / Failure Routing Ledger / compliance rows) + the per-task `step`/`task` pointer |
| Adaptive per-node | `kaola-workflow-adaptive-node.js` (#272) | the `## Node Ledger` per-node lifecycle |
| Finalization (Phase 6) | `contractor` subagent | the archive, roadmap-mirror regen, `chore: finalize` staging commit (SOLE remaining contractor-owned transition) |

The full/Phase-4 scripts author each phase file's `## Required Agent Compliance` table
with RESOLVED rows whose status is `delegation_policy`-aware (a `delegate` project gets
`subagent-invoked`, etc.) and self-validate the rendered file against
`repair-state.unresolvedCompliance(content, stateContent)` before writing, so a phase
file can never advance the pointer into a boundary the resume/finalize router would
reject. The packets handed to these scripts on stdin (the Selected Approach, blueprint,
review verdict, per-task outcome) are transient inputs, not durable state fields. The
#459 contract validators forbid a contractor dispatch from returning to any migrated
surface.

## Barrier Ref Lifecycle (issue #686)

Each writer/reviewer node anchors its barrier baseline under a git ref so `git gc` cannot prune the
baseline commit while the node's window is open. `refs/kaola-workflow/` carries three ref namespaces, each
with its own lifecycle:

| Namespace | Anchored | Dropped / reaped |
|---|---|---|
| `refs/kaola-workflow/barrier/<sanitize(project)>/<node>` | per-node/writer baseline, at open by `--record-base` | on pass by the window-locked `--drop-base` (D-424-01), **and at archive + by the one-shot `barrier-ref-sweep`** (#686) |
| `refs/kaola-workflow/barrier-base/<sanitize(group_id)>` | lane-group baseline, at group open | when the last member passes the group barrier, or on reconcile rollback — NOT touched by #686 |
| `refs/kaola-workflow/leg-base/<project>/<node>` | leg baseline, at leg provisioning | torn down with the leg — NOT touched by #686 |

(The `.cache/barrier-base-<sanitize>` **file** is a baseline snapshot on disk; it is distinct from the
`refs/kaola-workflow/barrier-base/` group-ref namespace above.)

**Reap at archive.** `archiveProjectDir` — the single convergence point for finalize-closed,
discard-abandoned, and the active-folders backstop — deletes this project's own
`refs/kaola-workflow/barrier/<tag>/*` refs after the archive is verified. The reap is **fail-soft**: a
ref-delete failure can never throw, block, or roll back the archive (the evidence is already archived); a
missed ref is left for the legacy sweep.

**Legacy sweep.** `kaola-workflow-claim.js barrier-ref-sweep` is a one-shot collector for pre-#686 stranded
refs. It keeps every ref whose tag belongs to a live project — determined across **every** worktree root
(`git worktree list --porcelain -z`, byte-exact) by three signals: an active-folder tag (network-free), a
live `.cache/running-set.json`, or a project whose `workflow-state.md` exists-but-unreadable
(unprovable-dead ⇒ keep). It is ADD-only on collisions (fail-safe under-reap), scoped strictly to
`barrier/<tag>/*`, and fails closed (deletes nothing) if the worktree set cannot be enumerated. See
[D-686-01](decisions/D-686-01.md) for the full keep-signal discipline and the documented out-of-band
residual limitations (#691).

## Generated Mirrors

- `kaola-workflow/ROADMAP.md` is generated from
  `kaola-workflow/.roadmap/issue-*.md`. Treat it as a mirror, not a source.
- Regenerate the mirror after issue state changes, after removing the source file
  for a closed issue, or after creating a new per-issue source file.
- **Single-owner finalize invariant**: during issue finalize, the per-issue source
  removal (`kaola-workflow/.roadmap/issue-N.md`) and `ROADMAP.md` regeneration are
  performed exactly once by `cmdFinalize` / `archiveProjectDir` (Finalization Step 8b).
  The Mechanical-Finalization Step 7 (in `agents/contractor.md`) only stages
  the result with `git add`; it does not re-run the rm or the regenerate.
- `kaola-workflow-roadmap.js generate` must not replace a generated roadmap that
  still lists active issues with `none` solely because `.roadmap/` is missing.
- An **optional** project-local file `kaola-workflow/.roadmap/_rules.md` may carry
  standing project-specific workflow rules. When present and non-empty, `generate`
  (and `validate`, and the GitLab/Gitea `refresh`) appends its contents to the
  `ROADMAP.md` `## Rules` section under a `### Project rules` sub-heading. The `_`
  prefix keeps it out of the `^issue-\d+\.md$` issue-row matcher, so it is never
  read as a roadmap row. When the file is absent or empty the generated output is
  byte-identical to the built-in Rules block (zero behavior change). Because the
  content lives in the project's own committed repo, it survives both regeneration
  and plugin updates — unlike a hand-edit of the generated mirror (wiped on regen)
  or an edit of the shared `RULES_BLOCK` (leaks into every project).
- `kaola-workflow/{project}/.cache/run-progress.json` (issue #605) is a **generated,
  non-authoritative** snapshot of the frozen plan's `## Node Ledger`, written at the MAIN repo
  root by `kaola-workflow-adaptive-node.js` after every successful ledger-mutating subcommand
  (`open-next`, `open-ready`, `close-node`, `close-and-open-next`, `reconcile-running-set`,
  `reopen-node`, `repair-node`, `write-halt`, `clear-halt`) — but only on a linked-worktree run
  (the resolved `main_root` differs from the executing repo root); a serial in-repo run's ledger
  is already root-visible, so the mirror is never written for it. Treat it exactly like
  `ROADMAP.md`: a mirror, never a source, never hand-edited.
- Schema: `{ plan_hash, updated_at, op, node_ledger: [{ id, role, status }], in_progress, all_done }`.
  `node_ledger` preserves `## Node Ledger` row order (`role` looked up from `## Nodes`, `null` if
  not found); `in_progress` is the subset of ids with `status: in_progress`; `all_done` is `true`
  only when every row is `complete` or `n/a` in a non-empty ledger; `op` is the triggering
  subcommand name; `plan_hash` (or `null`) lets a consumer detect staleness against the live
  frozen plan.
- The mirror is **write-only and fail-open**: no script ever reads it back to make a decision, and
  a write failure never blocks or refuses the triggering node operation — it only adds a
  `run_progress_mirror: "failed"` warn field to that operation's result envelope. It is absent
  whenever no worktree is linked or before the first ledger-mutating op runs, and is removed with
  the rest of the project's `.cache/` at finalize/archive (not separately preserved).

## Legacy Or Transitional State

- `.locks/`, `.sessions/`, `.tickers/`, heartbeat files, lease blocks,
  startup receipts, and session id environment state are legacy coordination
  mechanisms. They may appear in archived historical artifacts only.
- Do not document legacy coordination folders as permanent contract items in
  generated root memory.
- If legacy state appears in an active folder, repair or migrate it toward the
  active-folder contract rather than preserving it as authoritative state.
