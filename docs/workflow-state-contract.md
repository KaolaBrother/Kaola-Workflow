# Workflow State Contract

This map is the detailed state inventory for Kaola-Workflow. Keep root memory files such as
`CLAUDE.md` and `AGENTS.md` limited to durable invariants and link here for the full contract.

A run's durable state is **two files plus evidence**: `kaola-workflow/{project}/mission-list.md`
(the coordination record — see `decisions/0017-the-mission-list.md` for its derivation) and
`kaola-workflow/{project}/workflow-state.md` (the claim record, written by the claim scripts).
Everything else under the project folder is evidence, telemetry, or a journal.

## Layer-0 Durable-Artifact Ruling

The durable kernel is **exactly four records** — Plan, Position, Evidence, Forge chain — because a
successor resuming from durable state alone has exactly four questions: *what are we doing*, *where
are we*, *what is already done and why should I believe it*, and *what has already reached the
outside world*. Every other durable artifact a run leaves behind is therefore either **derivable**
from those four or a **preference** the successor is free to re-decide.

The mission list answers the first two questions in one file: its H1 carries the goal, its `item`
lines carry the decomposition, and `status` / `dispatched` carry the position. `workflow-state.md`
carries the claim — which issue, branch, worktree and sink mode this run owns.

That claim is only worth anything once it has been applied to every file a run actually writes, so
the table below rules all of them. It is generated from — and machine-checked against — the
`KERNEL_ARTIFACT_REGISTRY` in `scripts/kaola-workflow-adaptive-schema.js`;
`scripts/test-kernel-conformance.js` asserts the two are equal row for row, in order, and that the
ruling is TOTAL over both a real archived-run corpus and every artifact name the production scripts
declare. Do not edit one side alone.

The three rulings carry different burdens of proof, and the burden is the point:

- **record** — names WHICH of the four it is. A record row with no owner is a fifth record wearing a
  label. Every script write to a `record` path must go through the crash-safe atomic replace
  (`writeFileAtomicReplace`: temp + fsync + rename).
- **derivable** — states the DERIVATION: the function and its inputs, such that a successor could
  regenerate the artifact from the four records. An unproven "derivable" is a fifth record wearing a
  label too, and is the more dangerous kind, because it also excuses itself from atomic writes.
- **preference** — states why losing it across a resume is safe: no gate reads it, or its reader
  treats absence as the normal case, or nothing writes it any more.

Matchers are project-relative paths (or patterns over them) under `kaola-workflow/{project}/`; an
archived run maps to the same relative space. The first matching row wins, and the two broad bands
at the end exist to catch what the named rows do not.

| Artifact | Ruling | Record | Writer | Why — the derivation, the loss-safety argument, or the question it answers |
| --- | --- | --- | --- | --- |
| `mission-list.md` | record | plan | agent | the goal in its H1 and, per item, the mission / status / dispatched / result — decomposition and position in one file |
| `workflow-state.md` | record | position | script | the resume pointer: status, phase, step, pending gates, sink mode, branch, worktree, claim lineage |
| `.cache/chain-receipt.json` | record | evidence | script | the tests-green oracle receipt (npm repo kind), candidate-bound |
| `.cache/run-gaps.json` | record | evidence | script | the run-gap sweep result; its writer refuses to overwrite a prior cycle, so it is durable gap evidence |
| `.cache/origin/selection-record.json` | record | evidence | script | the gate-validated selection record; the degenerate form exists so "explicit target" is distinguishable from "record lost" |
| `/^\.cache\/validation-vectors\/[^/]+\.json$/` | record | evidence | script | local validation-runner receipts: exact command, environment digests, repeated results, bound candidate |
| `.cache/final-validation.md` | record | evidence | agent | the tests-green oracle receipt (consumer repo kind), candidate-hash bound; recorded by the agent, not a producer script |
| `.cache/selection-evidence.md` | record | evidence | agent | the no-target selection rationale, docked verbatim; not faithfully reconstructible after the claim |
| `.cache/run-gaps-manual.md` | record | evidence | agent | agent/operator-authored gap items — an input no script can regenerate |
| `finalization-summary.md` | record | evidence | agent | the terminal artifact — the run's agent-authored close-out record |
| `.cache/sink-receipt.json` | record | forge | script | step-by-step record of what has already reached the outside world; disposed at terminal success, when the forge itself becomes the authority |
| `.cache/sink-fallback.json` | record | forge | script | the sink fallback journal, same lifetime rule as sink-receipt.json |
| `/^\.cache\/[a-z-]+-envelope\.json$/` | derivable | — | script | the cached stdout of a --summary subcommand invocation; re-run the subcommand (the read-only emitters are idempotent). No script reads it back |
| `.cache/node-timings.jsonl` | preference | — | script | best-effort telemetry, writer swallows every error; its only consumer reports a diagnostic, never a verdict |
| `.cache/dispatch-log.jsonl` | preference | — | script | hook-written spawn log; advisory telemetry — no check consumes it, so losing it costs a record, never a verdict |
| `.cache/outcome-log.jsonl` | preference | — | script | the M2 refusal/outcome recorder: append-only economics telemetry whose writer swallows every error and which no gate, transition or successor decision reads — losing it costs a measurement, never a verdict. NOT derivable: which refusal fired, in which invocation, at what wall-clock is not recomputable from the four records once the process exits, and claiming a derivation there would be the more dangerous label |
| `.cache/wedged-attestation.json` | preference | — | script | historical residue; no producer and no consumer remains in the tree |
| `fast-summary.md` | preference | — | agent | legacy marker, never newly authored; both readers (classifier scope parse, router folder detection) are tolerant |
| `/^phase[0-9]+-[a-z-]+\.md$/` | preference | — | agent | retired fast/full-path phase artifacts; never newly authored, read only tolerantly |
| `/^\.cache\/\.cache\//` | preference | — | agent | historical double-nested .cache residue from a fixed path-join defect; no writer, no reader |
| `/^\.cache\/origin\//` | record | evidence | agent | pre-claim reconnaissance folded into the project at claim time |
| `/^\.cache\/[^/]+\.(?:md\|log\|txt\|json\|jsonl\|diff\|patch)$/` | record | evidence | agent | the free-form evidence band: per-item evidence and the attachments it cites — what was produced, how verified, where it lives |
| `/^[^/]+\.md$/` | record | evidence | agent | the project-root prose band: agent-authored run reports docked beside the mission list |

### What the registry no longer rules, and why

Every plan-record row except the mission list is gone with the node/DAG executor: the frozen
`workflow-plan.md` and its `## Node Ledger`, the ledger chain, epoch snapshots and re-plan
transaction files, the review-attempt journal, per-node barrier baselines, the running set, and the
scheduler lock. They were durable because a scheduler had to resume mid-schedule; there is no
schedule to resume. The mission list carries decomposition and position together, and a successor
reads it top to bottom.

Two derivable rows went with them (`run-progress.json`, `workflow-tasks.json`) — both were
projections of the Node Ledger.

### Atomicity, and the exempt classes

The atomic-write obligation is checked in both directions at runtime, not by inspection:
`scripts/kernel-write-observer.js` is preloaded into vehicle suites that drive the real production
writers, and every filesystem write landing in a project folder is recorded with its calling frame.
Completeness — no production writer reaches a `record` path off the atomic path — and scoping — the
atomic replace is used on the kernel and not off it — are then adjudicated over that stream.

One class is exempt, because the torn-write argument is discharged another way: **`mirror-copy`**
(the main↔worktree project mirror, the archive copy, the sink-staged union) copies from a source
folder that is still on disk when it runs, so a torn destination is re-derived by re-running the
idempotent copy rather than lost.

One residual is recorded rather than hidden: `mirror-copy` discharges the obligation by
re-derivation, and the archive completeness check that follows the copy compares size and digest per
file but is only as complete as its own source walk.

## Durable Sources

- Forge issues (GitHub, GitLab, or Gitea) are the canonical backlog and closure source when online.
- `kaola-workflow/.roadmap/issue-*.md` files are the durable local source for active roadmap rows.
  Do not purge the directory; closing an issue removes only that issue source file before
  regenerating the mirror.
- `kaola-workflow/{project}/mission-list.md` is the run's coordination record: the goal in its H1
  and one entry per mission with `item` / `status` / `dispatched` / `result`. No script writes it —
  the orchestrator does, at three moments (created, dispatched, closed). It is the one file a
  zero-context successor needs; see `decisions/0017-the-mission-list.md` for the derivation.
- `kaola-workflow/{project}/workflow-state.md` is the claim record and resume pointer. It records
  status, phase, step, next command or skill, issue number, sink mode, branch, worktree path when
  known, and the claim-time session fields. See Workflow State Fields below.
- `kaola-workflow/{project}/finalization-summary.md` is the terminal artifact, and the only place
  the finalize transaction's own two measurements survive the process that took them (`## Validation`
  and `## Changed Paths`).
- A `fast-summary.md` on disk is read only tolerantly: the classifier's defensive `## Scope` parse
  (feeding in-flight write-set overlap detection) and the router's active-folder detection both
  recognize such a marker. It is never newly authored, so these parses do not fire for a freshly
  claimed project.

## Archive Destination

`archiveProjectDir` resolves the archive destination by ONE rule: for a linked run it is always
`<mainRoot>/kaola-workflow/archive/<project>[<collision-suffix>]`, regardless of invocation cwd and
regardless of `--keep-worktree`. A `--keep-worktree` finalize is invoked FROM the linked worktree;
writing the archive there put the run's whole evidence trail inside the tree `sink-merge` removes at
cleanup. There is no valid case for archiving into a tree the sink is about to delete.

Consequences of the one rule:

- The archive is UNTRACKED on main until the sink's `archive_commit` step lands it. It never
  collides with the sink's `git checkout` of the feature branch, because the branch no longer
  carries the archive path at all.
- `cmdFinalize --keep-worktree` cannot stage a path outside its own worktree, so it records the
  archive's fate as `deferred_to_sink` (or `skipped_gitignored`) rather than claiming a commit.
- `removeWorktree` — the single choke point every destructive caller funnels through — **rescues**
  the archive when `<wt>/kaola-workflow/archive/<project>` exists and
  `<root>/kaola-workflow/archive/<project>` does not: it merge-copies the worktree archive up into
  the main checkout, verifies every regular file landed, and only then performs the git removal,
  reporting `{ removed: true, archive_rescued: true }`. A rescue that throws, or that does not
  verify, is fail-closed: the tree is left standing and the failure reports
  `{ removed: false, reason: 'mirror_sync_failed', detail }`.
- `resume --project X` treats a settled main-resident archive as `already_finalized`; it reports
  `finalize_incomplete` only while the branch still carries the live folder (proof the transaction's
  own `chore: archive` commit never landed).

### Archive completeness — the one hard stop left in finalization

`verifyArchiveComplete(srcDir, destDir)` refuses an archive that would lose a file. The property is
a **measurement, not a declaration**: the archive is complete iff every file present under
`kaola-workflow/{project}/` before the move is present, byte-for-byte (size + SHA-256), after it.
It walks the source recursively and requires every file it finds — including files no record ever
mentioned. `workflow-state.md` is additionally required unconditionally as the archive's identity
anchor. Five fixed `.cache/*.md` finalize sidecars are optional
(`final-validation.md`, `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`,
`doc-updater.md`); everything else is byte-checked.

This is an operation refusing to destroy data, not a workflow judging work — the same class as a
failed write. It replaced a required set *derived* from the Node Ledger (every `complete` row
implies its `.cache/<id>.md`), which was the same declared-set idea the finalize attribution sweep
rested on, one layer down. Nothing is weakened: the recursive source walk requires strictly more
than any ledger row ever implied.

`closure-audit` reports an `archive_content_incomplete` drift class (report-only in both modes, and
identical offline).

## Workflow State Fields

`workflow-state.md` is written at claim time by `writeState` in `kaola-workflow-claim.js` and
patched in place by the later lifecycle verbs. Its blocks:

- `## Project` — `name`, `status`.
- `## Current Position` — phase, step, runtime, and next command or skill. Key fields:
  - **`workflow_path`** — always the constant `adaptive`. It is a diagnostic record, not a
    selection: nothing validates it and nothing refuses over it. A legacy folder carrying another
    value is tolerated on read.
  - **`runtime`** — the runtime that claimed the folder (`claude`, `codex`, or `opencode`).
    Persisted from the `--runtime` startup flag; defaults to `claude`.
- **`selection_record_digest`** — a single `selection_record_digest: <64 lowercase hex>` line
  written on every startup/pick-next-originated claim, scalar and bundle alike. The value is
  `sha256` of the bytes of the PERSISTED `kaola-workflow/{project}/.cache/origin/selection-record.json`.
  Nothing refuses over the record: a claim arriving without a usable one gets the canonical
  `selection_mode: none-recorded` record in its place and reports that as `selection_record_note` on
  the emitted envelope, so the digest always covers bytes that exist. See `api.md` § The typed
  selection record at claim.
- **`kaola-workflow/{project}/.cache/origin/`** — the durable home for the origin phase. Pre-claim
  reconnaissance stages under `kaola-workflow/.origin/<target-key>/` (the project folder does not
  exist before the claim), and the claim transaction folds that subtree here — relative layout and
  bytes preserved — then REMOVES the staging directory. `selection-record.json` lands in the same
  directory and is the authority: the fold runs first, so a staged file of that name never wins.
  `kaola-workflow/.origin/` is never manufactured when nothing was staged, and a fold failure never
  blocks the claim.
- `## Sink` — issue number, sink mode (`merge` or `pr`), branch name, worktree path, and
  `run_posture` (`worktree` or `in-place`, derived from the actual worktree resolution at startup by
  `deriveRunPosture(worktreePath)`; never inherited from an environment variable). An optional
  `issue_action: close | comment_keep_open` line (default `close` when absent) marks a keep-open
  partial-close terminal: the orchestrator writes `comment_keep_open` at the closure decision to
  keep the issue OPEN — `finalize` / `sink-merge` then preserve the roadmap source, comment instead
  of closing, and refuse a PR/MR sink (keep-open is merge-sink-only).

  Three **claim-time session fields** live in the `## Sink` block immediately after `run_posture`.
  They are written once by `writeState` and never refreshed — the partial-edit paths
  (`updateState` / `stampTerminalState`) do not touch them:

  - **`main_root`** — the resolved main-repo root path, computed once by `resolveMainRoot(root)`
    (exported from `kaola-workflow-adaptive-schema.js`) at claim time, so a caller running from a
    linked or detached worktree reads one authority instead of re-deriving from cwd. Absolute path,
    no trailing slash.
  - **`session_marker`** — the session identity for liveness classification, produced by
    `resolveSessionMarker(env)` (from `kaola-workflow-classifier.js`): `KAOLA_SESSION_MARKER` from
    the environment when set (letting an orchestrator mint one stable identity for the session),
    otherwise `s-<pid>-<timestamp-base36>`. Must not reuse any of the legacy `## Lease` field names
    (`session_id`, `last_heartbeat`, `expires`, `owner_session_id`, `claim_comment_id`) — those are
    erased by `removeLegacyStateBlocks`.
  - **`claim_ts`** — the ISO-8601 claim timestamp, the liveness anchor. Together with
    `LANE_STALENESS_MS = 86400000` (24 hours, exported from `kaola-workflow-adaptive-schema.js`) it
    drives the lane-freshness test.

- `## Last Evidence` — `last_command` and `last_result`, the terminal disposition tokens the closure
  paths stamp (for example `closed_keep_open`).
- `## Lease` — legacy, deprecated. Preserved for backward compatibility on read only.
- `## Closure` — appended at archive time by `appendClosureBlock`: `archived_at`,
  `issue_disposition`, `claim_label_removed`, `worktree_removed`, and `closure_invariants`.

### What this file no longer carries

`workflow-state.md` records **claim identity and nothing else** — which issue, which branch, which
worktree, when, by whom, and how the run will sink. The `## Pending Gates` and `## Planning
Evidence` blocks are gone with the executor that read them, and so are `plan_hash`, `decision`,
`risk`, `first_node_id`, `first_node_role` and `active_plan_hash`.

They were not kept as inert constants, and the reason is worth stating because it governs every
future edit to this contract: **a record that still names a mechanism which no longer exists is
worse than no record.** A later reader takes a field's presence as evidence the thing it describes
is real, which is exactly the drift this contract exists to prevent. "Retained but inert" is how a
corpus grows while its owners believe they are shrinking it.

**`plan_hash` has no replacement, deliberately.** It was the freshness key for a frozen plan: proof
that the bytes being executed were the bytes that were validated. The mission list is not frozen,
not attested and not machine-verified, so there is nothing for a hash to bind and no reader that
would check one. Its absence is a design property, not an oversight — the file is a convention the
orchestrator maintains and a successor reads, and correctness there comes from the orchestrator's
judgement rather than from a seal. The only content-bound witness left in a run is the chain
receipt, which binds test results to a tree, not a plan to itself.

A legacy state file that still carries these blocks parses without complaint; nothing reads them.

### Lane classification

`cmdStatus` annotates each active-folder item with a `lane_bucket` field (output of `classifyLane`
from `kaola-workflow-classifier.js`). Four values, applied by a top-down precedence ladder (first
match wins):

| Bucket | Meaning | Precedence |
|---|---|---|
| `mine` | `session_marker` matches own session identity | 1 — highest |
| `stale` | Explicit resume instruction names this issue | 2 |
| `live` | `KAOLA_COTENANT=1` blanket co-tenant signal active | 3 |
| `stale` | `claim_ts` absent or older than `LANE_STALENESS_MS` | 4 |
| `ambiguous` | `claim_ts` present and younger than `LANE_STALENESS_MS`, no stronger signal | 4 |

`cmdResume` excludes `live` lanes from the resume candidate set; `stale` and `mine` lanes are
resumable. An `ambiguous` lane, or more than one candidate, triggers the resume-ambiguity answer
(ask before overwriting).

### Delegation policy (Codex)

`delegation_policy:` records the delegation mode for Codex workflows. It defaults to `delegate`,
established without prompting; `local-authorized` is an explicit opt-out and `tool-unavailable` is
auto-detected, not a user choice.

- `delegate` — default. Invoke subagent roles when available; when role profiles are absent, keep
  `delegate` and record evidenced `local-fallback-tool-unavailable`.
- `local-authorized` — execute locally; set only when the user explicitly disables delegation.
- `tool-unavailable` — legacy/explicit value for locally-executed runs when subagent tooling is
  unavailable.

The per-role compliance vocabulary that accompanied it (`subagent-invoked`,
`local-fallback-explicit`, `local-fallback-tool-unavailable`, `n/a`, `main-session-direct`) belonged
to the retired per-node compliance ledger. Nothing writes such a ledger now: whether a mission was
dispatched or done inline is recorded in the mission list's own `dispatched` field, where
`dispatched: self` is the inline case. A legacy archived plan carrying a compliance table is read
tolerantly and never rewritten.

## Bundle Project State Fields

On a bundle project, three additive fields are written alongside `issue_number`. **Single-issue
projects retain only `issue_number` — these fields are absent on non-bundle projects.**

```
issue_number: 42
issue_numbers: 42,47,53
bundle_id: bundle-42-47-53
closure_policy: all_or_nothing
```

- **`issue_number`** — primary issue (first in the sorted set). Preserved verbatim for all tooling
  that reads single-issue state.
- **`issue_numbers`** — full comma-separated sorted set. Presence of this field identifies the
  project as a bundle.
- **`bundle_id`** — canonical bundle identifier, `bundle-<N1>-<N2>-...` in ascending numerical
  order. Used as the project folder name and as the branch-name stem.
- **`closure_policy`** — always `all_or_nothing`. Every issue in the set must be closeable before
  any issue is closed; partial closure is not a success state. Enforced by `sink-merge` closing
  every member of `issue_numbers` on the success path and by the `remote-members-closed` closure
  invariant, which flags any member left unclosed while online.

### Bundle coherence invariant

`bundle_id` and `issue_numbers` must be mutually consistent at all times:

```
bundle_id == "bundle-" + sorted(issue_numbers).join("-")
```

**Do not hand-edit `issue_numbers` or `bundle_id` independently.** If a repair is needed, update
BOTH fields together so the invariant holds.

### Bundle project and branch naming

| Artifact | Naming convention |
|----------|------------------|
| Active folder | `kaola-workflow/bundle-42-47-53/` |
| GitHub branch | `workflow/bundle-42-47-53` |
| GitLab branch | `workflow/gitlab-bundle-42-47-53` |
| Gitea branch | `workflow/gitea-bundle-42-47-53` |
| Worktree path | `.kw/worktrees/bundle-42-47-53/` |

The numbers in the bundle identifier are always in ascending sorted order, matching the order in
`issue_numbers`.

## Closure contract cross-reference

The closure contract — the invariants a completed issue must satisfy, the closure receipt schema,
and which path populates which field — lives in `api.md` § Closure Contract, with its
machine-readable half in `scripts/kaola-workflow-closure-contract.js`. The archived
`workflow-state.md` carries the same terminal facts in its `## Closure` block.

## Generated Mirrors

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`. Treat it as a
  mirror, not a source.
- Regenerate the mirror after issue state changes, after removing the source file for a closed
  issue, or after creating a new per-issue source file.
- **Single-owner finalize invariant**: during finalize, the per-issue source removal
  (`kaola-workflow/.roadmap/issue-N.md`) and `ROADMAP.md` regeneration are performed exactly once by
  `cmdFinalize` / `archiveProjectDir`. The transaction's staging step only stages the result with
  `git add`; it does not re-run the removal or the regeneration.
- `kaola-workflow-roadmap.js generate` must not replace a generated roadmap that still lists active
  issues with `none` solely because `.roadmap/` is missing.
- An **optional** project-local file `kaola-workflow/.roadmap/_rules.md` may carry standing
  project-specific workflow rules. When present and non-empty, `generate` (and `validate`, and the
  GitLab/Gitea `refresh`) appends its contents to the `ROADMAP.md` `## Rules` section under a
  `### Project rules` sub-heading. The `_` prefix keeps it out of the `^issue-\d+\.md$` issue-row
  matcher, so it is never read as a roadmap row. When the file is absent or empty the generated
  output is byte-identical to the built-in Rules block. Because the content lives in the project's
  own committed repo, it survives both regeneration and plugin updates — unlike a hand-edit of the
  generated mirror (wiped on regen) or an edit of the shared `RULES_BLOCK` (leaks into every
  project).

## Legacy Or Transitional State

- `.locks/`, `.sessions/`, `.tickers/`, heartbeat files, lease blocks, startup receipts, and session
  id environment state are legacy coordination mechanisms. They may appear in archived historical
  artifacts only.
- Do not document legacy coordination folders as permanent contract items in generated root memory.
- If legacy state appears in an active folder, repair or migrate it toward the active-folder
  contract rather than preserving it as authoritative state.
- A frozen `workflow-plan.md`, a `## Node Ledger`, a `plan_hash`, `.cache/epochs/`,
  `.cache/running-set.json`, `workflow-tasks.json` and per-node `.cache/barrier-*` files belong to
  the retired node/DAG executor. They survive only in archived runs, are read by nothing, and are
  never newly authored. `refs/kaola-workflow/barrier/*` refs from those runs can be reclaimed with
  `kaola-workflow-claim.js barrier-ref-sweep`, a one-shot collector that keeps every ref belonging
  to a live project and fails closed (deletes nothing) if the worktree set cannot be enumerated.
