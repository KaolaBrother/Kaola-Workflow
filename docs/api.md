# API

CLI surfaces, JSON envelopes, schemas, and integration contracts for the scripts that ship.

Structure: this document covers the surviving script surface. The run itself — how work is
decomposed, dispatched and recorded — is the mission list, which has no CLI at all: see
`decisions/0017-the-mission-list.md` for the design record and `architecture.md` for how it fits
together.

## Command surface

Three commands ship. Everything below is invoked by them or by hand.

| Command | Owns |
|---|---|
| `/workflow-init` | bootstrap a repository: universal `AGENTS.md`, a thin native entrypoint bridge, backlog guidance, docs structure, and issue conventions; migrate only recognized Kaola-owned instruction bytes, and diagnose owner decisions without writing |
| `/workflow-next` | select, claim, write the mission list, run it |
| `/kaola-workflow-finalize` | validate, dock docs, summarize, close, archive, commit, sink |

## Project instruction migration — `kaola-workflow-project-instructions.js`

```text
node scripts/kaola-workflow-project-instructions.js plan|check|apply \
  --project-root <path> --json \
  [--consent-execution-default-change <plan-sha256>]
```

The helper makes root `AGENTS.md` the one universal project contract and keeps root `CLAUDE.md` as
the `@AGENTS.md` Claude-only bridge/overlay. It never treats a native overlay as a second universal
authority.

- `plan` is read-only. It classifies both files, computes before/after SHA-256 values, and reports
  `planned`, `converged`, `applied`, `drift`, `active_run_preserved`,
  `producer_repository_preserved`, or `decision_required`. When an active-run
  `execution_default_change` needs a user value judgment, the result includes an ephemeral
  `consent.plan_sha256` plus exact `consent.apply_args`.
- `check` is read-only. A safe but unapplied plan becomes `drift` and exits 3.
- `apply` writes only a safe `planned` result, atomically and by exact path. An active-run
  execution-default change requires the exact unchanged plan token from the preceding conversation
  consent; a bare, duplicated, malformed, or stale token is non-mutating. Consent is never stored.
  The command reports the files written and becomes a byte-identical no-op after convergence.

The exact released v9.17.2 whole-file pairs, known legacy Kaola redirects, and correctly formed
current managed regions are workflow-owned. Surrounding owner bytes remain byte-identical when a
current region or redirect is replaced. A released `KW-CLAUDE-MANAGED` marker is not sufficient
ownership proof by itself: changed outer bytes make that legacy file owner-ambiguous, so the helper
returns `decision_required` without writing. Missing files may be created. Malformed markers, an
unrecognized owner-only authority, or any other split the helper cannot prove safe also returns
`decision_required`, exits 2, and writes nothing.

Classification is per managed change, not one repository-wide boolean. Each file reports one of:

| class | active-run behavior |
| --- | --- |
| `authority_layout_equivalent` | Canonicalize `AGENTS.md` and necessary thin first-read bridges. May apply while a run is active. Claim, Mission List, worktree, done results, and live locators stay byte-identical. |
| `execution_default_change` | Show exact old/new hashes; apply only after explicit conversation consent. No durable approval field is stored. |
| `state_schema_incompatible` | Preserve the old contract or run an explicit tested migration; never rewrite automatically. Top-level status is `active_run_preserved` when this is the only pending write. |
| `unknown_or_mixed` | Return `decision_required` with the ambiguity and make no write. |

A compatible authority-layout migration is not frozen merely because an unrelated state schema is
incompatible. Each active `workflow-state.md` is inspected on the production path: absent
`schema_version` and version 1 are compatible; another explicit version fences only the
state-coupled change while an independent layout-equivalent bridge may still apply.
`workflow-state.md` / `mission-list.md` are never helper writes. After a
compatible active-run layout apply, the helper may write `.cache/instruction-adoption.json` under
each active run as recovery evidence (old/new hashes, classifications, and
`fresh_session_requirement: not_inspected_by_init`). It does not inspect or mutate the installed
runtime adapter. On this producer repository, `producer_repository_preserved` protects the richer
project-specific contract. The helper creates no symlinks and does not inspect or delete
nested/local runtime instruction files.

The JSON envelope has `schema_version`, `mode`, `status`, `changed`, `files`, `writes`, and
`reasons`, plus an ephemeral `consent` object when conversation authorization is required. Each
`files.agents` / `files.claude` record carries `classification`,
`compatibility`, `before_sha256`, `after_sha256`, and `outside_bytes_preserved`.

## Routing-surface handoff interface

`/workflow-next` and `/kaola-workflow-finalize` carry compact natural-language handoff guidance.
When work is sent to another role, the request names the requested result or question, relevant
evidence and authority/custody, the exact landing locator, and the stop condition. The receiving
role's profile remains authoritative for universal behavior; the existing owner keeps product intent
and the final verdict. There is no handoff field schema, ordering rule, parser, or linter.

The separate, marked `KW-RUNTIME-DELEGATION` region is generated adapter data. It exposes native
profile discovery, the dispatch carrier, all three default tier bindings, tool boundary, honest
named/built-in alternatives, and runtime availability/limits. The common fallback remains per-item:
an absent exact role triggers a search of other adequate native child routes; a generic route keeps
its real identity; inline applies only to that item when no route fits.

`rolesByIntent()` derives the standard/reasoning/heavy role-membership roster from
`templates/agents/behavior-contracts.json`; `renderRuntimeDelegationGuidance()` places that roster
beside the runtime adapter's carrier-specific defaults. The adapter therefore cannot silently
reclassify a role by maintaining a second list.

`generate-agent-profiles.js` exports the routing interface:

| Export | Contract |
| --- | --- |
| `renderRuntimeDelegationGuidance(adapter)` | render one complete marked block from a validated adapter |
| `runtimeAdapter(runtime, forge, root)` | resolve one of the nine closed adapter variants; Codex is forge-keyed |
| `renderRuntimeDelegationGuidanceForRuntime(runtime, forge, root)` | resolve then render the block |
| `replaceRuntimeDelegationGuidance(content, runtime, forge, root)` | replace exactly one balanced marker region; missing or duplicate markers fail loudly |

`generate-routing-surfaces.js` exports `renderCompactRecoveryPrompt(runtime, forge)`. It renders a
complete direct prompt from `compact-recovery.skeleton.md`, the single
`dispatch-contract.md`, and the selected runtime adapter. Only `claude`, `codex`, `grok`, and
`cursor` have a compact-recovery rendering in the measured scope.

Commands render Claude and skills render forge-matched Codex through the routing slot. Additive
edition sync scripts replace only this marker in next/finalize; workflow-init is outside the
interface. Cursor and ZCode call fields not published by those runtimes are not serialized here:
their guidance defers to the active session's live schema, and static fields whose names or shapes
remain unverified are not emitted. Cursor omit-model is the named-profile carrier only when the
live enum contains the Kaola name; a catalog-miss host uses live built-ins as themselves while the
caller establishes whether the correct local-project or Agent-confirmed saved-Cloud project
carrier was loaded.

### Compact recovery — generated direct prompt

The generated prompt tells the runtime to reread root `AGENTS.md`, `workflow-state.md`, and
`mission-list.md`, then continue Workflow Next while any mission remains or Finalization when all
missions are done. It carries the shared dispatch contract and the runtime's measured adapter in the
same artifact. Selection happens in the model after the prompt is present; compact time performs no
state parsing, operation binding, or prompt composition.

Claude and Codex hooks execute only `cat` on their installed generated prompt. Grok calls no hook:
one generated native Rule under the matching project or global rules directory carries the same
content because passive hook stdout is ignored. Cursor likewise calls no hook: one generated `alwaysApply` project Rule carries the
same recovery content for standalone CLI, App local, and Cloud. OpenCode, Kimi, and ZCode install no
Kaola compact prompt lifecycle in this measured scope.

No runtime registers Kaola PreToolUse, PostToolUse, or Stop prompt injection. Ordinary tool calls
therefore add zero Kaola recovery bytes and start zero Kaola recovery subprocesses. There is no
session token, sidecar, chunk bitmap, acknowledgement state, or compact-time JavaScript helper.

## Emit and refusal envelopes

The scripts share a framed-output convention so a caller can always recover a machine-readable
result from a shelled subprocess.

- **Framed output.** A shelled script's result is the **last line of stdout that parses as JSON**. A
  stray log line emitted before the framed result therefore does not collapse a success into an
  empty object.
- **Envelope shape.** `{ result, ... }` where `result` is one of `answer` (act on the fact),
  `refuse` (a hard stop), `escalate` (pause and ask the user), or `consent` (a value call for the
  user). A refusal additionally carries a snake_case `reason` token and, where one exists, an
  `operator_hint`. Per-command payloads carry extra fields — additive, never required.
- The envelope is a shape, not a library: each script builds and prints its own. The kernel
  (`kaola-workflow-adaptive-schema.js`, the ×4 byte-identical anchor) still exports
  `refuse(reason, extra)`; the `answer(...)` and `emit(obj)` constructors were removed once
  measurement showed nothing had ever called them.

**The run design contains no refusals.** The refusals documented below all sit at operations, not at
the work: a release tag whose receipt does not cover it, an archive that would lose a file, a sink
step that did not complete. Everything mid-run measures and reports.

## Claim API — `kaola-workflow-claim.js`

```
usage: kaola-workflow-claim.js <subcommand> [flags]
  claim | authoring-allowed | release | status | patch-branch | watch-pr | bootstrap | startup
  | finalize | pick-next | resume | worktree-status | worktree-finalize | sink-fallback
  | verify-sink | stale-worktree-check | stale-worktree-cleanup | legacy-worktree-cleanup
  | audit-labels | repair-labels | barrier-ref-sweep

  flags: --project P [--json] [--force] [--strict] [--issue N] [--target-issue N]
         [--target-issues A,B] [--pr-number N] [--branch B] [--reason R]
         [--runtime claude|codex|opencode|kimi|grok|zcode] [--sink merge|mr|pr] [--keep-worktree]
         [--keep-open|--keep-issue-open] [--keep-branch] [--execute] [--archive] [--export]
  --help, -h   print usage and exit, with zero side effects
```

`--help` / `-h` is always a safe no-op, checked across the whole argv before any subcommand body, so
a help probe on a destructive subcommand cannot run a finalize. An **unrecognized flag** refuses
`unknown_flag` with zero mutation, before any subcommand body — a typo must never fall through to a
destructive verb.

Two flags are retired to warn-and-ignore shims and are never persisted: `--workflow-path` (adaptive
is the only path) and `--codex-dispatch-mode` (`v2-task-name` is the only mode). Passing either
prints one stderr notice and the claim proceeds unmutated.

### Claiming is bookkeeping, not a gate

`cmdStartup` / `cmdPickNext` want an explicit `--target-issue N` (or `--target-issues A,B,C`). A
missing target, both target forms at once, and a classifier that will not answer are **findings on
the envelope at exit 0** with `claim: 'none'` — never a third door. The caller re-states its reason
and claims another issue, fixes the argument, or works offline.

| Verdict | `result` | Exit | Returned when |
|---|---|---|---|
| `no_target` | `answer` | 0 | neither `--target-issue` nor `--target-issues` resolved |
| `target_ambiguity` | `answer` | 0 | both resolved simultaneously (flag or env, any combination) |
| `target_unavailable` | `answer` | 0 | remote issue validation failed (`gh` / `glab` / `tea` call failed) and `KAOLA_WORKFLOW_OFFLINE=1` is not set |
| `target_unverified` | `answer` | 0 | offline, and no active folder for the target |
| `target_indeterminate` | `answer` | 0 | the classifier subprocess faulted transiently (spawn error, signal, timeout) through all 3 attempts. A clean non-zero exit is determinate and reports `target_unavailable` instead. `reasoning_class` is `classifier_error` |
| `dirty_tree_refused` | `consent` | 1 | in-place claim (`KAOLA_WORKTREE_NATIVE=0`) onto a dirty tree. The subject is the user's own uncommitted work, so it asks: carries an `ask` plus `options: ['commit','stash','worktree']`. An unprobeable tree reads as dirty |
| `acquired` / `owned` | — | 0 | the folder is yours |

A project name that would not be a project folder is **resolved, not refused** (#933). The reserved
set is `archive` (case-folded) and any dot-prefixed name — `kaola-workflow/.roadmap/` is the backlog
and `kaola-workflow/archive/` the archive band, and a claim must not write run state into either.
The name reaches the claim through one door, `--project`, which is not filtered by `isSafeName`,
which answers path safety only. It converges on `claimProject`, which substitutes the run's ordinary
`issue-<N>` folder and reports the swap on the acquiring envelope:

| Field | Content |
|---|---|
| `reserved_project` | the declined directory, verbatim as supplied (`.roadmap`, `Archive`) |
| `reserved_project_note` | prose naming what was declined and what was claimed instead |

Both are absent when no substitution happened. The claim still reports `acquired` at exit 0: nothing
is destroyed, so this is not the destruction class where a refusal is legal, and the substitution is
reported rather than silent. `project`, `selected_project` and `workflow-state.md`'s `name:` all
carry the substitute, so a later resume reads one answer.

`probeIssueState(issueNum, opts)` in `kaola-workflow-active-folders.js` (all three forge editions)
returns `{state, reason}` with `state` one of `open`, `closed`, `unavailable`.

### Bundle claim — `--target-issues` / `KAOLA_TARGET_ISSUES`

`--target-issues A,B,C` (comma-separated, sorted and deduped before validation), or the equivalent
`KAOLA_TARGET_ISSUES=A,B,C`. `claimExplicitBundle` validates the complete set before mutating
anything: if any member fails validation the whole bundle is refused and no folder is created.

**A `target_set_X` classifies and exits exactly like its scalar twin `X`.** The bundle lane reports
the same fact about a set that the scalar lane reports about one issue, and a fact does not change
meaning — or exit code — because it was asked about three issues. `claim.js` holds the twin map
(`TARGET_SET_TWINS`) as data and derives both `result` and the exit code from it, so a new bundle
token cannot be added to one half only.

| Code | `result` | Exit | Condition |
|------|----------|------|-----------|
| `target_set_invalid_token` | `answer` | 0 | a token that is not a positive integer; the offender is echoed |
| `target_set_empty` | `answer` | 0 | the resolved list is empty after sort+dedup |
| `target_set_red` | `answer` | 0 | one or more targets are already closed on the forge (the classifier's `red`) |
| `target_set_unavailable` | `answer` | 0 | remote validation failed, **or** provisioning failed and was cleanly rolled back |
| `target_set_unverified` | `answer` | 0 | offline with no local evidence for one or more targets |
| `target_set_indeterminate` | `escalate` | 0 | classifier faulted transiently on one or more targets through all 3 attempts; pause and ask |
| `target_set_conflicts_active_work` | `refuse` | 1 | a target is already held by an active folder, **or** the derived bundle folder already exists |
| `target_set_has_closed_issue` | `refuse` | 1 | one or more targets are already closed on the forge |
| `target_set_label_rollback_failed` | `refuse` | 1 | the claim succeeded but in-progress-label rollback on a partial failure itself failed. The **only** code on this surface where a forge mutation survives the answer — `partial` carries the applied-step record (`dir`, `worktree`, `worktreePath`, `labeled`, `inPlaceBranch`, `baseBranch`) a human needs for cleanup |

A caller must branch on `claim` / `result`, not on the exit code.

`bundle_state_incoherent` is not a claim-surface code: it fires downstream when `bundle_id` is
present in `workflow-state.md` but `issue_numbers` is absent or inconsistent with it.

Bundle projects gain three additive `workflow-state.md` fields (`issue_numbers`, `bundle_id`,
`closure_policy`); single-issue projects carry only `issue_number`. See
`workflow-state-contract.md` § Bundle Project State Fields.

### The typed selection record at claim

Selection is orchestrator-owned. Two flags record how the claim originated:

| Flag | Values | Default |
| --- | --- | --- |
| `--target-source` | `user_directed` \| `orchestrator_selected` | `user_directed` |
| `--selection-record` | path to a JSON record | — |

**Record fields** (six, by convention — the claim does not validate them): `selection_mode`,
`selection_bundle`, `selection_priority_basis`, `selection_rejected`, `selection_disjointness`,
`clarifications`.

**Nothing here refuses.** What the caller supplied is reported and the claim proceeds:

| Input | Behaviour |
| --- | --- |
| a record that parses as a JSON object | persisted **byte-for-byte** as authored; never graded; no note |
| `--target-source orchestrator_selected` with no `--selection-record` | the canonical `selection_mode: "none-recorded"` record stands in its place; `selection_record_note` on the envelope names the flag |
| `--selection-record <path>` absent or unreadable | same, and the note names the path that would not read |
| bytes that will not parse as a JSON object | same, and the note says so. This is the ONE property still checked — a record a later reader cannot parse is not a record |

The fields of an authored record are never inspected: they carry the orchestrator's reasoning, and a
script that graded reasoning would be re-deciding what the agent already decided.

**On every acquiring claim** (scalar and bundle): the record is persisted at
`kaola-workflow/<project>/.cache/origin/selection-record.json` (an orchestrator-supplied file copied
through byte-unchanged); `selection_record_digest: <64 lowercase hex>` — `sha256` of the persisted
bytes — is stamped into `workflow-state.md` and echoed on the emitted claim JSON.

**`.origin/` staging fold (same transaction).** Pre-claim reconnaissance has no durable home, so the
origin phase stages findings under `kaola-workflow/.origin/<target-key>/`, where `<target-key>` is
the project name the claim resolves to (`issue-<N>`, or `bundle-<a>-<b>[-<c>]`). If that directory
exists at claim time its whole subtree is moved into `kaola-workflow/<project>/.cache/origin/`
preserving relative layout and bytes, and the staging directory is removed. Absent staging is a
clean no-op, and the fold never blocks the claim.

### Worktree provisioning

`KAOLA_WORKTREE_NATIVE` is ON by default. A claim provisions a repo-local worktree at
`<repo-root>/.kw/worktrees/<project>/` and records the absolute path as `worktree_path` in the
`## Sink` block.

Provisioning is attempted unless `KAOLA_WORKTREE_NATIVE=0`, `KAOLA_WORKFLOW_OFFLINE=1`, or the repo
has no git history.

**`NATIVE=0` in-place branch** (online, git history, HEAD not detached): the claim creates and
checks out the feature branch in the repo root (`workflow/issue-N` on GitHub,
`workflow/gitlab-issue-N`, `workflow/gitea-issue-N`), recording the pre-checkout branch as
`base_branch`. On `release` / `discard` the scripts restore `base_branch` (or the repo default when
absent), delete the feature branch, archive the folder to
`kaola-workflow/archive/<project>.discarded-<ts>/`, and commit that discard archive locally so a
later sink's preflight does not see it as foreign dirt.

Edge cases:

- **Dirty tree** → the consent valve (`dirty_tree_refused`, above). Nothing is created and HEAD is
  unmoved.
- **Detached HEAD** → the claim still acquires; in-place branch creation is skipped (record-only),
  no `base_branch` is recorded, and an `inPlaceNote` is surfaced.
- **Offline or no git history** → in-place creation does not fire; a plain repo-root run.
- **Re-claim on an existing feature branch** → checked out without `-b`; `base_branch` is `''`.

**On provisioning failure** the claim still succeeds; the returned JSON and `workflow-state.md`
carry a `worktree_error` field (collapsed to one line) plus a classified `worktree_error_class`, and
`worktree_path` stays `''`.

Discriminator:

- `worktree_path: ''`, no `worktree_error`, no `base_branch` → intentional repo-root run.
- `worktree_path: ''`, no `worktree_error`, `base_branch` present → `NATIVE=0` in-place branch.
- `worktree_path: ''` and `worktree_error` present → provisioning was attempted and failed.

### Durable-field guards

`writeState` / `patch-branch` refuse a newline or CR in any durable field value (typed throw) — a
`branch: $'main\nworktree_path: /tmp/EVIL'` would otherwise inject a forged field. Branch-creation
sites (`provisionWorktree`, the in-place `checkout -b`, `patch-branch`) guard the branch with
`assertSafeBranchArg`, which throws on a `-`-leading, NUL-carrying, or newline-carrying branch.

## Finalize transaction — `claim.js finalize`

```bash
node scripts/kaola-workflow-claim.js finalize --project {project} --keep-worktree [--keep-issue-open]
node scripts/kaola-workflow-claim.js finalize --project {project} --check --json
```

One resumable transaction: the worktree→main artifact mirror, the archive-and-status close, roadmap
staging, and the `chore: finalize {project}` commit gate. It is idempotent — re-running the same
call resumes at whichever step it stopped on — and the emit names every step it completed.

It never authors the implementation commit (if implementation-shaped changes are uncommitted,
author the commit and re-run), and it owns the project-folder sync itself, in **both** directions —
worktree→main and main→worktree. Either direction failing is typed the same way, `mirror_sync_failed`,
and fails closed before anything downstream has run, so a sync the script cannot perform is a refusal
the operator can read rather than an untyped crash.

### `finalize --check` — one read-only pass

Evaluates **every** precondition in one pass and reports all of them together, so N unmet
preconditions come back from one invocation instead of one per re-run. Zero side effects.

```json
{ "project": "issue-N", "ok": true, "checks": {}, "reasons": [], "authority": {} }
```

`checks` carries `mirror`, `workflow_state`, `implementation_commit`, `staging_guard`, `validation`,
`changed_paths`, `dirty_paths`, and — only when a `chains_stale` finding named them — `stale_paths`,
`stale_kind` and `stale_paths_truncated`. `validation` is the bare classification token; the three
stale fields sit beside it rather than inside it, so a reader can tell a prose edit from a code
change without re-deriving the hashes. They are the finding's own values, verbatim, and absent when
it declined to diagnose — an empty list would read as "measured, nothing changed". **`stale_paths` is
not `changed_paths`**: the first is drift since the receipt was stamped, the second is this branch
against its base, and the two routinely disagree. `reasons` carries the most specific token per unmet precondition and
is empty when the run is finalize-ready. Nothing short-circuits: a failed rung never hides a later
one. `validation` is reported as state, never as a reason — it stopped being a precondition when it
stopped being a verdict.

**`checks` and `reasons` answer different questions**, and the split is what a caller acts on. A token
in `reasons` is an operator obligation. A token that appears only in `checks` is state the transaction
settles itself: `sync_required` is the long-standing case, and `workflow_state: 'pending_mirror'` is
the other one — an authority absent from this working tree that the mirror step will construct from the
main checkout. `pending_mirror` never enters `reasons` and never makes `ok` false. The reserved
`archive_authority_missing` is unchanged and still lands in both, because it names a condition
execution cannot repair.

The `authority` block (`--check` only) names where the authority is proven and where the transaction
will read it, so the check and the transaction cannot silently disagree about which tree they mean:

| Key | Meaning |
|-----|---------|
| `main_root` | Absolute realpath of the main checkout; falls back to the run root when unresolvable |
| `linked_root` | Absolute realpath of the linked worktree the run was invoked from; `null` on an in-place run |
| `source` | `live` \| `archive` \| `pending_mirror` \| `none` — where the authority is proven **today**. `none` means no single authority could be proven (absent, or ambiguous) |
| `source_dir` | The directory that proves the authority today, or `null`. On `pending_mirror` this is the **main-resident** run folder the mirror will copy |
| `dest_dir` | The directory the transaction will read the authority from. Equals `source_dir` except on `pending_mirror`, where it is `<linked_root>/kaola-workflow/<project>`. `null` when `source` is `none` |

### The three reports

The finalize transaction takes three measurements — two from `probeFinalizeValidationGate`, one from
`probeMissionListCoherence`. None refuses, and each lands in two places — the emitted envelope and,
durably, `kaola-workflow/{project}/finalization-summary.md`. The durable half is not optional: a
conversion that emits a finding and drops the state the refusal was freezing is a deletion, not a
conversion.

| Envelope field | Durable heading | Content |
|---|---|---|
| `validation` | `## Validation` | the typed chain-receipt finding from `adaptiveSchema.evaluateChainReceipt`, computed **in process** — no subprocess, no plan file |
| `changed_paths` | `## Changed Paths` | `adaptiveSchema.changedPathsSinceBase(root, base, project)` — `git diff <base>...HEAD --name-only` minus the bookkeeping band |
| `mission_list` | `## Mission List` | `{ items, outcome_while_not_done }` — how many missions the run's own record holds, and the `item:` line of each one carrying an outcome while its `status` is not `done` |

**The durable write is fill-if-empty, and it never overwrites prose.** All three land through one
writer, `appendSummarySection`, and what it does turns on what the heading already holds: absent,
and the section is appended at the tail; present with an empty body, and it is filled **in place**,
keeping its position relative to its neighbours; present with content, and it is left exactly as
written. So the transaction never overwrites prose an orchestrator wrote, and the section is
idempotent by **content rather than by heading** — a crash-resumed re-entry still cannot stack a
second copy of a section that already says something, while a summary that pre-created the three
headings, as the finalize surface's Step 6 instructs, receives the measurements instead of dropping
them. `## Finalize Findings` is written by the same function under a different rule (see below).

`changed_paths_probe` is added to the envelope only when it is not `measured`; `unavailable` means
the branch diff could not be enumerated, which is reported as "not measured", never as a verdict
either way.

**Nothing compares `changed_paths` against a declaration, because there is no declaration.** This
used to be an attribution sweep against declared write sets that refused the remainder. Declared
write sets are gone, and a mission-list `result` is free text, not a path set — parsing one back
into one would re-invent the declaration. The comparison went; the measurement stayed, so a reader
can see what moved and notice what does not belong.

`mission_list` is present only when the run wrote a `mission-list.md` — a run without one emits the
envelope it emitted before, and writes no section. A record that agrees with itself still reports,
with an empty `outcome_while_not_done`: a key appearing only on a contradictory run would be
indistinguishable from a report that never ran. The record is read and never repaired, and nothing
about the exit code, `status` or `reasons` turns on it.

### Finalize envelope

```json
{
  "status": "closed",
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "resolved_project_note": "prose naming the supplied spelling and the one it resolved to",
  "archive_state_stamped": "not_needed|repaired|failed",
  "issue_disposition": "kept-open|close-pending|closed|unknown",
  "validation": { "classification": "chains_green", "green": true, "mode": "chain-receipt" },
  "changed_paths": ["scripts/foo.js"],
  "mission_list": { "items": 6, "outcome_while_not_done": [25, 52] },
  "closure_receipt": {},
  "closure_invariants": { "ok": true, "violations": [] },
  "finalize_transaction": {}
}
```

- `resolved_project_note` reports that the supplied `--project` did not match the run's directory
  name and was resolved to the one that exists. It is **absent** when the spelling was already exact.
  `--project` is the one input the transaction never reconciled against the durable record, and the
  marker it builds is matched by exact substring — so on a case-insensitive filesystem a mis-cased
  slug used to let every path-based step succeed while the claim-marker delete silently matched
  nothing, and the archive was written under the supplied spelling while git's case-sensitive index
  left the live run folder tracked beside it. The name is therefore resolved **once, before anything
  is composed from it**, and every downstream read — archive path, the removal
  pathspec, the marker, the receipt — sees the resolved spelling. The resolution is uniform across
  filesystems: it neither refuses nor stays silent. The same field appears on the `--check`
  pre-flight envelope, which must name the same folder the run will, and on the sink's envelope,
  where the candidate names come from the branch's git tree rather than the filesystem — the sink
  runs from the default-branch checkout, which does not carry the run folder until the merge lands.

- `archive_state_stamped` reports the manual-archive backstop: `repaired` when finalize healed a
  state archived by hand (live folder absent, `status: active` in the archive) by stamping it
  terminal in place; `not_needed` on the normal lane or an already-terminal archive.
- `issue_disposition` is DECISION-derived on `cmdFinalize`: `kept-open` under `--keep-open`,
  `closed` when the remote probe already observed the issue closed (a finalize re-run after
  sink-merge), else `close-pending` — the default merge lane, where the sink closes the issue after
  finalize, so finalize never asserts a false `closed`.

**The crash-resume backstop moves main's surviving live folder aside; it does not delete it.** When
the archive has already landed and a crash left `<mainRoot>/kaola-workflow/<project>/` standing, that
folder is renamed to `<archive-authority>/.orphan-main-live-<ISO-ts>/`. The goal is only to stop the
active-folder scan from reading a finished run as a live claim, and a move achieves that with nothing
lost — the earlier `rmSync` destroyed main-only evidence that was in no archive, at exit 0. It is
nested **inside** the resolved archive authority rather than placed beside it, which is measured and
load-bearing: a sibling `archive/<project>.orphan-<ts>` makes the next sink refuse `sink_blocked`
naming the rescued evidence as foreign dirt, while the nested form is covered by the own-archive
exemption, so the sink completes and its `archive_commit` step lands the orphan in git history. Three
fields report it:

| Field | Meaning |
|---|---|
| `main_live_orphan` | `moved` \| `failed` \| `skipped_authority_outside_main`. The last means the archive authority is not under the main checkout, so the folder was deliberately left alone — moving it into a tree the sink is about to force-remove would be a new destruction route |
| `main_live_orphaned_to` | the absolute destination, on `moved` |
| `main_live_orphan_error` | the failure detail, on `failed`. A failed rename leaves the folder exactly where it was: the worst case is a phantom claim the operator can see, never a loss |

`main_live_cleaned_on_resume: true` is retained and is now set only when the move actually succeeded.

**A git fault in the commit gate is reported, not swallowed.** Five `git` calls in that block ran
under `catch (_) {}`, or read any non-zero exit as an answer. The consequence was that a corrupt
index, a full disk, a permission, a held index lock, or one hazard-named path aborting a whole
pathspec all arrived as `finalize_commit: "nothing_to_commit"` at exit 0 — with the healthy files
beside them left uncommitted, the `chore: archive` and `chore: finalize` commits never authored, and
nothing durable recording that anything had been dropped. **The rule now separated is "nothing was
staged" from "we could not tell".** The first is a claim about the working tree; a failed probe does
not support it.

| Field | Meaning |
|---|---|
| `archive_stage` | `skipped` (default) \| `staged` \| `failed`. Covers the archive bookkeeping — the `git rm -r --cached` of the live run folder and the `git add` of the archive paths. A failure here means the branch may still carry the live folder that `chore: archive` exists to remove |
| `archive_stage_detail` | git's own message on `failed` |
| `archive_unstaged` | **canonical and Codex only** — the GitLab and Gitea ports raise `archive_stage_failed` without this field. The archive paths that did not reach the index, capped at 50. Read back **from the index** after the failed `git add`, never inferred from its exit code: a gitignored path beside an addable one exits non-zero having staged the addable one, so the attempted list is not the unstaged list. Absent entirely when that read itself failed, because the honest answer is then to say nothing |
| `roadmap_staged` | now derived from the **outcome** of the archive `git add`, not from the paths merely existing on disk. It was `true` whenever the files were present, which is a statement about the filesystem where a statement about the index was owed |
| `archive_commit_probe` | `failed` when the archive's `git diff --cached --quiet` exited neither 0 nor 1. Exit 1 means "something is staged" and 0 means "nothing is"; anything else is git failing, and reading it as "nothing" is how a fault became a success |
| `archive_commit_probe_detail` | git's own message |
| `residue_stage` | `skipped` (default — no residue to stage) \| `staged` \| `failed` \| **`unprobeable`** \| **`nothing_attributable`**. Neither of the last two is `skipped`, and for the same reason: `unprobeable` means the `git status --porcelain` that enumerates the residue failed, and `nothing_attributable` means there was residue and every path of it was unattributable (see `residue_unattributed`). A run that says there was nothing to stage when there was is the false statement both values exist to avoid |
| `residue_stage_detail` | git's own message on `failed`. Also re-emitted on stderr with a `WARNING` prefix, so a terminal reader loses nothing the previously-inherited stderr showed |
| `residue_probe_detail` | git's own message on `unprobeable` |
| `residue_unstaged` | the paths that did not reach the index, capped at 50 — present on **all four editions**. Read back from the index on the same basis as `archive_unstaged`, and absent when that read failed |
| `residue_unattributed` | the worktree paths the transaction could not attribute to this run, capped at 50 — present on **all four editions**, absent when there are none. They are **not** in the `chore: finalize` commit and they are **still on disk**: nothing is committed, reverted or deleted. Attribution is by directory, from the branch's own commits (`<base>..HEAD`) — a path whose directory holds no file this branch committed is not this run's work as far as the transaction can tell. The run's own untracked work beside a committed sibling is therefore still staged, as before |
| `residue_attribution` | `unattributable_unknown`, present only when the attribution above could not be made at all — git could not be asked, or the branch carries no commits of its own. The residue is staged exactly as it was before this classification existed, and this field is why: with no evidence of what the run authored, "all of it is foreign" would be an ordinary run left unfinished rather than a finding |
| `finalize_commit_probe` | `failed` when the finalize commit's `git diff --cached --quiet` exited neither 0 nor 1 |
| `finalize_commit_probe_detail` | git's own message |
| `findings` | the **de-duplicated list of typed fault names** raised anywhere in the block: `archive_unstage_failed`, `archive_stage_failed`, `archive_commit_probe_failed`, `residue_probe_failed`, `residue_stage_failed`, `residue_unattributed`, `finalize_commit_probe_failed`, `claim_release_skipped_offline`. Absent or empty on a healthy **online** run |

`finalize_commit` gains the value **`'unknown'`**, and it means *we could not tell*, not *nothing
happened*. It is set when the residue probe or the staged probe failed — one could not enumerate what
to stage, the other could not read what was staged, and neither supports the claim
`nothing_to_commit` makes about the working tree. **An operator seeing `unknown` should re-read the
worktree by hand before trusting the closure.** One honest limit: when it is the *enumerating* probe
that failed, the record cannot name the uncommitted paths, and it says so rather than implying a list
exists.

Every fault is also written durably to `finalization-summary.md` under `## Finalize Findings`, one
section per fault naming its step and quoting git. The write is **restating, not append-once**: the
flush may run more than once in a block and each run rewrites the whole `## Finalize Findings`
section from the accumulated set. A per-fault append would have landed the first fault and silently
dropped the rest, which is the same silence being converted here; an append-once flush would instead
have dropped every fault recorded after it, including `residue_stage_failed`, which is raised after
the residue probe. Ordering matters for a second reason: a finding that fires on a **healthy** run
makes the transaction modify an already-committed archived summary, so the flush runs before the
residue is enumerated and the modified summary is carried by the finalize commit rather than left
dirtying the tree.

**The exit stays 0 on all of it** — this is report, not refuse. On a healthy **online** run none of
these fields fires: a good finalize reports `staged`/`staged`/`committed` with no `findings`. A
healthy **offline** run is the one exception, and it always raises exactly
`claim_release_skipped_offline`. The claim release returns before any forge call when
`KAOLA_WORKFLOW_OFFLINE=1`, so `claim_label_removed` records `skipped_offline` and the run walks away
from artifacts a prior online claim may already have posted. Nothing local records whether it was
claimed online, so the finding is worded conditionally and names the issues it applies to; it is a
report, not a gate, and `closure_invariants.ok` stays `true` — `skipped_offline` remains an allowed
value of that invariant, unchanged.

**One edition difference in the finding-type count.** The GitLab and Gitea ports raise **seven**
finding types where canonical and Codex raise **eight**. The delta is exactly one, `archive_unstage_failed`.
All four editions now stage the archive the same way — a `git rm -r --cached` of the live run folder
followed by a scoped `git add` of a computed candidate-path list — but the forge ports run both calls
inside **one** try/catch, so a fault in either raises the single `archive_stage_failed`, while
canonical isolates them and can name which of the two failed.

**`archive_unstage_failed` is still not owed to the forges.** Their `archive_stage_failed` message
already names the live-folder consequence `archive_unstage_failed` announces, so a genuine failure
loses nothing — the operator learns the branch may still carry the live folder either way, and only
the attribution between the two calls is coarser.

**The staging divergence itself is closed (#922).** The forge ports previously used a single unscoped
`git add -A 'kaola-workflow/'` with no `git rm -r --cached` and no candidate list. That shape's
failure modes were all *successes* — exit 0 with `archive_stage: 'staged'` — which is why no
additional *failure* type would have reached them: a `.gitignore`d child under `kaola-workflow/` was
silently skipped where canonical's explicit pathspec exits non-zero; the live run folder's removal
reached the index only incidentally, swept up by the unscoped pathspec rather than staged on purpose;
and a **foreign
project's live folder or archive band was swept into the `chore: archive` commit**, making neither
run's diff attributable on a checkout with concurrent runs. Scoping the pathspec is what closed all
three; adding a finding type never could have.

**Opt-in exit gate.** The JSON is always emitted and the exit is 0 by default. Pass `--strict` to
make the exit code reflect the invariant verdict: **exit 4** when `closure_invariants.ok === false`.

### Typed refusals that remain

- `finalize_gate_unverified` with `gate: 'workflow_state'` — the selected authority has no readable
  regular state file. A source-missing archive is a narrow crash-resume exemption: the archive must
  already be terminal-stamped. The `inner_reason` names which sub-case, and
  `archive_authority_ambiguous` means several exact/suffixed archives match, so no transaction
  authority can be proven. No closure side effect is made.
- **The archive refuses to lose a file.** See `workflow-state-contract.md` § Archive completeness.
  That is an operation refusing to destroy data, not a workflow judging work.

### Goal declaration (advisory)

`cmdFinalize` records whether a goal was **declared**. It does not, and never did, check whether the
goal was met.

```
goal_declared:        true | false
goal_declared_source: 'env' | 'plan' | null
goal_declared_probed: [ '<abs>/mission-list.md', ... ]
```

`computeGoalDeclaration()` resolves `KAOLA_GOAL` first (non-empty after trim → `source: 'env'`,
`probed: []`), then reads the H1 of `mission-list.md` in the archive destination, then in the live
folder (`source: 'plan'`). A folder carrying no mission list declares nothing, which is the honest
answer. Advisory: recorded for audit, never blocking.

**This replaced the retired `goal_check`**, whose enum (`satisfied | unsatisfied | absent`) rendered
a presence check as a verdict: the negative case was unreachable and the positive case named an
acceptance check that exists nowhere in this workflow. Archived receipts carrying `goal_check` are
correct as history and are never migrated.

## Validation — `kaola-workflow-run-chains.js`

Runs the four edition chains as real subprocesses (capturing real exit codes, not shell-pipe
status) and writes a structured receipt. Exits 0 iff every non-waived chain passed.

```
Usage: kaola-workflow-run-chains.js [--chains name,...] [--accept-known-red name:issue ...]
                                    [--project issue-N | --plan plan-path | --output path] [--json]
       kaola-workflow-run-chains.js --release-check [--candidate <sha-ish>] [--receipt path] [--json]
```

| Flag | Meaning |
|---|---|
| `--chains <name,...>` | comma-separated chain names to run (default: the resolved set) |
| `--accept-known-red <name>:<issue>` | waive a known-failing chain; repeatable. Both halves must be non-empty |
| `--project <issue-N>` | write the receipt to `kaola-workflow/<issue-N>/.cache/chain-receipt.json` in the working tree that **holds the run folder** — the invoking tree when it carries it, otherwise the main checkout. From a linked worktree whose run folder is main-resident, the receipt therefore lands in main, where the finalize gate reads it. Falls back to `<invoking tree>/kaola-workflow/<issue-N>/` when no run folder resolves, which is the ordinary first run in a plain repository |
| `--plan <path>` | write the receipt to `<dir-of-path>/.cache/chain-receipt.json`. A legacy path-derivation alias; `--project` is the flag to use. It has **no producer**: no prompt, command, skill or routing surface in any of the four editions passes `--plan` — the run-chains invocation they render passes `--project` — and nothing outside a test fixture authors a `workflow-plan.md` for its argument to name |
| `--output <path>` | explicit override; default is `<cwd>/.cache/chain-receipt.json` |
| `--mock-chain <name>:<script>` | test hook: replace a chain's command with a shell script |
| `--json` | emit `{ result, failed, receipt }` after completion |
| `--release-check` | the pre-tag gate; see below |

Receipt-path precedence: `--output > --plan > --project > cwd default`. **Pass `--project`**: the
bare cwd default lands the receipt at the worktree root, not under `kaola-workflow/<project>/`,
where the finalize measurement reads it.

**The record follows the run folder; the hash follows the invoking tree.** Only the `--project`
receipt path resolves across working trees. `codeTreeHash` is still computed over the tree the
command was invoked from, so a receipt produced in a linked worktree describes that worktree's
candidate and lands in the checkout the gate will read — both at once, which is the point. `--plan`
and `--output` are explicit caller-supplied paths and resolve against cwd unchanged; a **relative**
`--plan` from a linked worktree therefore still lands under the invoking tree.

**Diff-scoped chain selection.** When the caller pins neither `--chains` nor `--mock-chain` and the
invocation is finalize-context (`--project` or `--plan`), `classifyScope` resolves the diff base and
the changed-file set: any changed path that couples to a non-`claude` edition — or an unresolved
base or diff — selects all four (fail-closed); otherwise the `claude` chain alone. A bare run
(no `--project`/`--plan`) is left unscoped. The decision and its evidence are recorded verbatim in
the receipt as `scope`.

An empty effective chain set refuses `no_chains` and writes **no** receipt: a `chains: []` receipt
would otherwise read as a zero-chains-verified pass.

**Concurrency.** The four chains are independent OS process trees. On a host with core headroom they
run concurrently (max-of-chains makespan); a constrained host falls back to a byte-equivalent serial
path. Out-of-order completions are re-sorted to canonical order before the receipt is written.
Override with `KAOLA_RUN_CHAINS_CONCURRENCY` (`auto` | `serial` | `<N>`).

### Chain receipt schema — `.cache/chain-receipt.json`

```json
{
  "headSha": "<git HEAD sha>",
  "workTreeHash": "<sha256 of git diff HEAD, or 'clean'>",
  "codeTreeHash": "<sha256 of the code-relevant landable tree — the freshness key>",
  "validationTestConsumes": [],
  "startedAt": "<iso>",
  "completedAt": "<iso>",
  "source": "<how the chain set was resolved>",
  "scope": { "decision": "claude-only|all-four|explicit|no_narrowing", "reason": "", "base": null,
             "touchedEditionPaths": [], "changedFileCount": 0, "chains": [] },
  "preamble": { "steps": [] },
  "chains": [
    { "name": "claude", "exitCode": 0, "command": "npm run test:kaola-workflow:claude",
      "duration_ms": 0, "accepted_red": false, "accepted_red_issue": null, "attempts": 1,
      "retried_transient": false, "timed_out": false, "signal": null, "steps": [] }
  ]
}
```

A chain killed by the per-chain timeout carries `timed_out: true` (absent on a receipt written
before the field existed ⇒ read as `false`), and the plain-text failure summary labels it inline so
an operator can tell a timeout from a genuine red without opening the receipt. `signal` carries the
OS signal name that killed the final attempt's child, or `null` on a normal exit.

The receipt is written **always** — a red receipt is still a record — and atomically, so a crashed
re-run leaves the prior receipt byte-intact.

### `--release-check` — the pre-tag release gate

Verifies an **existing** receipt against a release candidate. Check-only: runs no chain, writes
nothing, contacts no forge. Hosted here because this is the file that produces the receipt it reads;
the verdict itself is `adaptiveSchema.evaluateReleaseReceipt`, so the finalize measurement and this
gate share one band, one hash and one precedence family.

Deltas from the finalize measurement, each load-bearing:

- no project folder — at release time the run is archived, so the receipt default is the git
  top-level's `.cache/chain-receipt.json` (override with `--receipt`);
- **strict `headSha` equality** against the candidate (default `HEAD`), and no alternative binding:
  anything else refuses `chains_stale`. The `codeTreeHash` content-address relaxation does not
  apply, and neither does an ancestor relaxation — #881 shipped one and #888 measured that the
  sink's archive commit always puts off-surface paths between the finishing run's receipt and the
  release commit, so it never fired. A tag names an exact commit, and the four-chain run at that
  commit is mandatory;
- a missing or `unknown` `headSha` refuses, never passes;
- a **dirty-stamped** receipt (`workTreeHash !== 'clean'`) refuses — the chains validated the commit
  plus uncommitted edits, not the tree the tag would name;
- **any** waived chain refuses `chains_waived` — a waiver is legal at finalize, never for a tag;
- the receipt must cover the **full** declared chain set, else `chains_incomplete`;
- an unresolvable chain set fails closed to `repo_kind_undetermined`, because passing coverage
  against an empty expected set would let any receipt through.

Typed precedence — coverage before greenness:
`chains_unverified > chains_stale > chains_empty > repo_kind_undetermined > chains_incomplete >
chains_red > chains_waived`.

```json
{ "result": "refuse", "reason": "chains_stale", "operator_hint": "...", "errors": ["..."] }
{ "result": "pass", "mode": "release-check", "candidate": "<sha>", "chains": [] }
```

Exit 0 on pass, 1 on any refusal. `kaola-workflow-release.js --cut` refuses and names this command
in its remediation sequence.

### Kernel validation exports — `kaola-workflow-adaptive-schema.js`

The measurement surface lives in the byte-identical cross-edition anchor so producer and gate cannot
disagree.

| Export | Contract |
|---|---|
| `classifyRepoKind(root)` | `{ kind: 'self-host' \| 'consumer' \| 'undetermined', pkgPath, detail, chains }`. Three states, not two, so a transient fault never silently downgrades a self-host repo to the weaker consumer reading: `package.json` absent ⇒ genuine consumer; present but unreadable or unparseable ⇒ `undetermined`; readable with no `test:kaola-workflow:*` script ⇒ genuine consumer |
| `evaluateChainReceipt(root, opts)` | the validation finding. `opts: { cacheDir (required), project, receiptPath, head, currentCodeTree, testConsumedExtra }`. Returns `{ classification, green, mode, chains, detail, operator_hint, ... }` |
| `evaluateReleaseReceipt(root, opts)` | the release gate body. `opts: { receiptPath, candidate }`. Returns `{ ok: true, mode, candidate, chains }` or `{ ok: false, reason, operator_hint, errors, ... }` |
| `changedPathsSinceBase(root, base, project)` | sorted, deduped branch diff minus the bookkeeping band; `null` when git fails |
| `isBookkeepingPath(p, project)` | pure. True for repo-root `CHANGELOG.md` / `README.md`, `docs/**` at any depth, and `kaola-workflow/{project}/**`. Path-SHAPE, not suffix: a nested `plugins/.../README.md` is outside the band, and `agents/*.md`, `commands/*.md`, `plugins/*/skills/**`, `plugins/*/agents/*.toml` are behavioral and stay visible |
| `computeCodeTreeHash(root, project, testConsumedExtra, opts)` | the freshness key: a content address over the code-relevant landable tree |
| `resolveFinalizeCheckRoot(planRoot)` | resolves the candidate root from the caller's cwd when the run folder lives in another working tree of the same repository (proven by `git worktree list`, not guessed), so a source-missing resume validates the tree that will actually merge |
| `VALIDATION_TEST_CONSUMES` | one shared constant, currently `[]`. Both the producer (`run-chains.js`) and the gate read it, so they cannot disagree. Widening it makes the freshness key **stricter**, never looser |
| `SELF_HOST_TEST_CONSUMED` | the prose files this repo's own chains read as input, so a change to one can flip a chain verdict and must stay code-visible: `README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md`, `docs/agents-source.md`. Applies only to a self-host repo |

**Classification families.** Self-host arm:
`chains_unverified > chains_stale > chains_empty > chains_red > chains_green`. Consumer arm:
`final_validation_unverified > final_validation_failed > final_validation_unbound >
final_validation_stale > chains_green`. `repo_kind_undetermined` classifies the one state in which
no measurement can be taken at all.

**Freshness.** The self-host arm prefers the `codeTreeHash` content address and falls back to the
`headSha` pin for a legacy receipt that predates the field. On the fallback, a sha mismatch alone
cannot distinguish "the code advanced" from "the workflow advanced HEAD past its own receipt with a
bookkeeping commit", so `headAdvanceIsValidationInvisible` asks which paths actually moved before
saying stale — an inert advance is not staleness.

**Consumer arm.** The agent owns verification, so the measurement is the agent's recorded
`.cache/final-validation.md`: presence, a column-0 `verdict: pass`, and a column-0
`validated_candidate_hash` equal to the recomputed code-tree hash. It compares two hashes; it never
re-executes tests. An absent or malformed binding is `final_validation_unbound` (an omitted field
must not read as bound); a mismatch is `final_validation_stale`, with both hashes carried so a
reader can check the claim rather than take it on trust. The producer of all three fields is
`kaola-workflow-validation-runner.js record` below — the field the gate requires is the one an
agent writing the file by hand is likeliest to omit, and both remediation hints name that verb.

### Kernel path-stream decoders — `kaola-workflow-adaptive-schema.js`

Every reader that turns a git path stream back into filenames goes through the same anchor, so a
name git can print is a name the caller can hand back to git. The rule they exist to enforce: **a
path is returned as the file's literal name**, and `git add -- <returned path>` matches the file on
disk. Anything less produced a `fatal: pathspec … did not match any files` that aborted a whole
collective `git add`, taking healthy files with it.

| Export | Contract |
|---|---|
| `parsePorcelainPaths(statusText)` | `git status --porcelain` output → repo-relative POSIX paths. **Auto-detects the record format**: a NUL anywhere selects `-z` porcelain, where a rename is two records, destination **first**, no arrow; otherwise LF porcelain with the `XY <source> -> <dest>` arrow. Rename and copy return the destination only. C-quoting is **decoded**, not merely unwrapped, and nothing is trimmed. The arrow is split only on an `R`/`C` status, so an untracked file literally named `a -> b` survives. Never throws; `''`/`null`/`undefined` → `[]`. Order is git's; no sort, no de-dup |
| `splitNulPaths(text)` | the whole parser for a **plain** path stream — `diff --name-only -z`, `diff --cached --name-only -z`, `log --name-only -z`, `ls-files --others -z`, `ls-tree -r -z`. One field per record, no status column and no rename source, so handing such a stream to `parsePorcelainPaths` would eat three characters off every path. Empty records dropped, everything else verbatim |
| `unquoteCStyle(field)` | decodes one C-quoted field (`"n\303\266te.md"` → `nöte.md`) for a stream that genuinely cannot take `-z`. Unquoted input is returned unchanged, so it is safe to apply unconditionally. Caveat: `git diff --name-only`, unlike `git status --porcelain`, does **not** quote a leading or trailing space, so unquoting alone is lossless only if you also do not trim |

**Prefer `-z` where you can add it** — it is unambiguous, and the one case LF cannot resolve is an
unquoted source path that literally contains ` -> `. Not adding it is safe for `git status
--porcelain`: measured on git 2.50.1, status quotes every path containing `"`, `\`, a control
character or a leading/trailing space, and (unless `core.quotePath=false`) every non-ASCII byte, all
of which the decoder reverses.

**Deliberately not converted**, so nobody waits on it: `computeCodeTreeHash`, `filterVisiblePaths`,
`visibleChangedPathsSince` and `headAdvanceIsValidationInvisible` still split on newlines. Those feed
a hash and a visibility classifier that the producer and the gate compute through the same one
function, so a quoted path is consistent on both sides and the worst case is a spurious
`chains_stale`. Converting them would change `codeTreeHash` inputs and could stale live receipts —
an unforced risk with no observed failure behind it.

### `kaola-workflow-validation-runner.js`

The owned local gate for a consumer repo. Runs in a scrubbed environment, binds
executable/toolchain and candidate identity, and reduces repeated runs to `pass`, `fail`, or
`inconclusive`. `record` is the separate verb that binds an already-run validation to the tree it ran
against, so the consumer arm above has an invocable producer rather than a format to reproduce.

```
kaola-workflow-validation-runner.js run --command <command> --timeout-minutes <1..120>
    [--repo-root <path>] [--cwd <repo-relative>] [--repetitions <1..5>]
    [--env-allowlist <A,B>] [--output <path>] [--keep-output <dir>]
kaola-workflow-validation-runner.js qualify-local --contract-hash <sha256> --context-hash <sha256>
    --claude-profile-hash <sha256> --codex-profile-hash <sha256> --invariant-classes <a,b>
    [--timeout-minutes <1..120>] [--output <path>]
kaola-workflow-validation-runner.js record --project <name> --verdict pass|fail
    --command "<the exact validation command you ran>" [--output <path>]
```

Receipts land under `.cache/validation-vectors/`. Exit 1 when the outcome is not `pass`.

#### `--env-allowlist <A,B>` — and the keys it cannot grant

The runner sandboxes the environment so `command_id` is a function of the inputs and not of the
machine, and a few keys are written by the sandbox itself for that reason — `HOME` and `TMPDIR` among
them. Allowlisting one of those **does not take effect**: the sandbox's own value stands, because the
alternative is a `command_id` that changes with whoever ran it.

What changed is that it is no longer silent. The receipt carries `env_allowlist_ignored`, a sorted
array naming exactly the requested keys the sandbox wrote for itself — `["HOME"]` for
`--env-allowlist HOME,CARGO_HOME`, and `[]` when nothing was ignored. A key the sandbox does not own,
such as `CARGO_HOME` or `RUSTUP_HOME`, passes through and takes effect as before and is not listed.

The field is outside both digests, so `command_id` and `vector_id` are byte-unmoved by it. It is the
remedy for a tool that needs a real `HOME`: allowlist the specific variables that tool reads rather
than `HOME` itself.

#### `--keep-output <dir>` — retain the child's raw streams so a red receipt is diagnosable

The receipt binds `stdout_sha256`, `stderr_sha256` and a normalized failure-signature digest per
repetition and keeps none of the preimages, so a `fail` with an empty `reduction_reasons` says a
command failed identically N times and nothing says what it printed. `--keep-output` is the opt-in
that closes that, and **only that**:

- `<dir>` is always a **directory**, at every repetition count. Files are `run-<index>.stdout` and
  `run-<index>.stderr`, where `<index>` is the receipt's own `runs[].index` — that keying is the whole
  value of the flag, because it is what maps a red repetition's digest back to the bytes behind it.
  The two streams stay in separate files; merging them loses which was which. An empty stream is an
  empty file, not an absent one.
- **The receipt is byte-identical with and without the flag.** No receipt field is added, no
  `vector_id` or `command_id` moves, and the `runs[]` field set is unchanged. Retention is a side
  channel, never part of validation identity.
- The write happens **after** the last candidate digest is taken, so a destination anywhere in the
  repository — including a validation-visible path — cannot make the runner report its own log as
  `candidate_mutation`. **The consequence is that an interrupted run retains nothing** — not even a
  prefix, and not the repetitions that had already completed: the bytes are buffered until the last
  repetition finishes, so a run killed part-way leaves the directory empty (measured, under both
  SIGTERM and SIGKILL). That is deliberate and is not going to change. Writing inside the loop would
  move the candidate digest between the pre- and post-repetition measurements on any destination
  inside the candidate band, which the flag permits, and the runner would report `candidate_mutation`
  against its own log — a false red on the verdict itself, which is strictly worse than losing a
  diagnostic aid. An empty directory after a kill is the flag working as designed, not a fault.
- **It refuses rather than overwrite, and it refuses before the child runs.** An existing
  `run-<index>.<stream>`, a `<dir>` that exists and is not a directory, or a destination resolving
  inside the durable archive band `kaola-workflow/archive/**` all exit `2` with nothing executed and
  nothing written. An earlier run's bytes read as this run's are a false diagnosis, which is worse
  than the no-diagnosis state the flag exists to fix; and a refusal arriving after a long suite would
  throw away the run it was meant to explain.
- **Retained bytes are raw.** Absolute paths are redacted and nothing else, so a secret the child
  echoes is retained verbatim — choose the destination accordingly. There is no truncation cap:
  `MAX_OUTPUT_BYTES` already bounds a completed run (exceeding it kills the child into
  `inconclusive`, so oversized output never reaches retention), and a cap here would delete the tail
  of a failure, which is usually the part naming the cause.

`docs/decisions/D-697-01.md` records why this is opt-in with a caller-named destination rather than
always-on: the default posture — raw child output is not persisted — is unchanged.

#### `record` — bind a consumer validation to the tree it validated

Writes `kaola-workflow/<project>/.cache/final-validation.md` with the three column-0 fields the
consumer arm requires: `verdict`, `validation_command`, and `validated_candidate_hash`. The hash is
`adaptiveSchema.computeCodeTreeHash(candidateRoot, project, VALIDATION_TEST_CONSUMES)` — the gate's own
function, reached over the gate's own root resolution, so producer and gate cannot compute different
answers over the same tree.

- **It hashes the working tree the shell is in.** `candidate_root` is echoed on the result for exactly
  that reason. A linked worktree and the main checkout hash differently until the branch merges, so a
  record written from the wrong checkout binds the wrong candidate and the gate reports
  `final_validation_stale`. Standing in a checkout that does not carry the run folder is
  `project_folder_missing` — it refuses to bind rather than silently hashing the tree it is in.
- **The verdict is a field, not the exit code.** `0` means the record was written, `--verdict fail`
  included; the gate then reads `final_validation_failed`. `1` is `outcome: "inconclusive"` with
  `reasons` naming why no binding could be recorded (`candidate_root_unresolved`,
  `project_folder_missing`, `candidate_hash_unresolved`). `2` is an argument or usage error.
- **Merge, never clobber.** The verb owns only its three field lines, recognised at column zero
  anywhere in the file; every owned line is removed wherever it sat and one fresh block is appended, so
  repeating the call is byte-idempotent and surrounding agent prose survives. Ownership includes a
  column-0 field line inside a code fence, deliberately — the gate reads the file fence-blind, so such
  a line is already a live binding and leaving one behind would leave a second answer.
- `other_candidate_roots` lists other working trees of the same repository that also carry the run
  folder, `[]` when none, with an operator hint when it is not empty.

The verb's name is spelled in the kernel's remediation hints for both `final_validation_unbound` and
`final_validation_stale` (`kaola-workflow-adaptive-schema.js`), so a rename has to change both hints in
all four byte-identical copies. Nothing keeps the two spellings in step.

## Sink API

### Merge sink

- **Script**: `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` /
  `kaola-gitea-workflow-sink-merge.js`.
- **`--sink` mode** is one resumable transaction: preflight (pure read; names any foreign dirt with
  zero mutation) → push branch → rebase onto the mainline → run the validation chains →
  fast-forward merge (with a bounded race retry, `MAX_AUTOMERGE_RETRIES=3`) → push mainline →
  close the issue idempotently → archive → clean up.
- Preflight does **not** count finalize's own archive mirror as foreign dirt (issue #893): untracked
  paths under `kaola-workflow/archive/<project>/` — the tree `cmdFinalize --keep-worktree` writes into
  the main checkout and leaves for this sink's archive step to commit. Existence and content are two
  separate probes (`git cat-file -e`, then the content read), giving four outcomes: **not carried** by
  the branch → exempt; **carried and byte-equal** → exempt; **carried and divergent** → foreign dirt,
  because two archives disagreeing refuses rather than letting one side win; **carried but unreadable
  or truncated** → unverifiable, which is not the same fact as absent, so foreign dirt too (a copy
  merely larger than `GIT_MAX_BUFFER` overflows the content read on an otherwise healthy repo). The
  exemption is scoped to this project on a segment boundary (a sibling project's tree, and a
  project-name prefix look-alike, both still refuse) and is classification-only — no exempted path is
  ever removed.
- `.cache/sink-receipt.json` tracks each step so a re-run resumes from the last incomplete one
  without double-applying.
- **The `finalize` step's archive is confirmed, not assumed.** `archiveProjectDir` is judged by what it
  reports doing: `archived === true` is the only outcome that counts as archived, and
  `skipped === 'source-missing'` the only one that counts as no archive being needed (the keep-worktree
  flow, where the branch already archived and committed). Anything else — a thrown error other than the
  `TypeError`/`ReferenceError` export-drift class, or a return that claims neither — records an archive
  failure, and the transaction stops with `{result: 'refuse', reason: 'sink_incomplete', step:
  'finalize', archive_refusal}` at exit `1`. The stop happens **before** the step is marked done, so the
  sink remains resumable and a re-run retries the archive. Nothing is merged, pushed or closed on that
  path. This is deliberately not keyed on `receipt.archive_dest` being unset: both legitimate no-archive
  outcomes leave it unset exactly as a failure does, so the receipt cannot distinguish them and only the
  return can.

**Pre-merge guards** (all three editions). **Which path runs them is not uniform, and the difference
is load-bearing**: `--sink` routes to `runSinkTransaction` and returns before the legacy precondition
block is ever reached, so of the four below **only `worktree_dirty` runs on `--sink`** — it lives in
`sinkPreflight`, which the transaction owns. The other three are legacy-path only, and **they do not
all mean the same thing by their absence** — the difference has been measured, so do not infer it:

- `assertNoLiveWorkflowFolder`'s absence is **not a gap**. `SINK_STEPS` carries its own `finalize` step
  calling `archiveProjectDir`, so on `--sink` the sink *is* the finalizer, and a live run folder on the
  branch is the expected sole-archiver posture rather than an error.
- `assertBranchHasNonWorkflowChanges`'s absence **is** a real difference in behaviour, and nothing
  downstream substitutes for it. Constructed and measured on both paths with the same fixture: the
  legacy path emits `no_implementation_changes` and stops with nothing merged or pushed, while `--sink`
  merges, pushes the mainline and closes the issue. The predicate itself, evaluated against the very
  tree `--sink` published, does return the finding — it is never consulted on that path rather than
  being satisfied by it. This is deliberate and carries no guard: the orchestrator owns whether the
  branch ends up right and knows whether its own run produced implementation. It is documented here so
  that the silence is not read as a clearance.
- `assertBranchPushedToUpstream` is legacy-path only and additionally skipped when
  `KAOLA_WORKFLOW_OFFLINE=1`. Note the same offline skip applies to
  `assertBranchHasNonWorkflowChanges`, so on the legacy path that report only ever occurs online.

Two kinds stop the legacy path, and the difference is what the operator is owed, not whether it stops.
The **KEEP** guards (`assertCleanWorktree`, `assertBranchPushedToUpstream`, `assertWorktreeClean`)
protect work that proceeding would destroy, so they throw and offer no sanctioned way past. The
**CONVERTED** ones judge the state of the work, so they emit a typed envelope carrying a named finding
and a route forward. A converted guard still stops the sink — nothing is merged and nothing is pushed
— it just reports rather than refusing, because the orchestrator may legitimately overrule it.

- **Live workflow-state guard** (`assertNoLiveWorkflowFolder`) — CONVERTED, legacy path only. Emits a
  typed `run_not_finalized` report (`result: 'report'`, `status: 'not_merged'`, exit `1`) when the
  branch still carries `kaola-workflow/{project}/workflow-state.md`. The probe is scoped to the
  **branch tip** — `git cat-file -e {branch}:{path}`, not `HEAD:` — so it can run *before* the
  destructive worktree removal and checkout (#346); after checkout the two forms coincide. Committed
  tree state, not the filesystem. The finding carries both remediations (finalize then recommit, or
  `git rm -r` the folder on the branch).
- **Unpushed-commits guard** (`assertBranchPushedToUpstream`) — KEEP, legacy path only. Blocks when
  the feature branch has commits ahead of its upstream, or has no upstream tracking ref. Skipped
  when `KAOLA_WORKFLOW_OFFLINE=1`.
- **Workflow-artifacts-only guard** (`assertBranchHasNonWorkflowChanges`) — CONVERTED, legacy path
  only, and additionally skipped entirely when `KAOLA_WORKFLOW_OFFLINE=1`. Emits a typed
  `no_implementation_changes` report when a branch's entire diff versus the mainline is
  `kaola-workflow/**` artifacts, turning silent implementation loss into a loud, recoverable
  failure. Skipped when the mainline is unresolvable — it cannot judge, so it does not block.
- **`worktree_dirty`** — `sinkPreflight` runs `assertWorktreeClean` before the merge step
  force-removes the linked worktree, so a worktree carrying uncommitted work is refused rather than
  removed. Fail-closed:
  a dirty **or** unprobeable worktree refuses, with zero mutation and the worktree intact.
  Resume-safe — an already-removed worktree matches no `worktree list` block and passes. The
  status probe reads every untracked record (`-uall`), not tracked ones alone, and exempts only
  paths under the worktree's own throwaway lane content (`kaola-workflow/`, `.kw/`) — issue #973
  / #975; before that widening, `--untracked-files=no` could not report an untracked path at all,
  so a worktree whose only uncommitted content was untracked probed clean and was destroyed. Two
  untracked record shapes are never exempt even under a lane prefix (#978): a decoded path
  containing a backslash — porcelain's only separator is `/`, so a backslash is a literal filename
  character, not a lane boundary — and a path ending in `/`, the collapsed record git emits for an
  embedded repository it will not descend into. Both refuse, on the `--sink` transaction and the
  legacy route alike, where they were previously exempted and destroyed. The third residual the
  #975 entry recorded — the legacy route removing the worktree-only run journal — is closed with
  them: the legacy route now stages and lands the run's own project folder around its removal, as
  `--sink` already did.

**Exit codes**: `0` merged, branch pushed, issues verifiably closed · `1` merge failed
(non-recoverable, including pre-merge guard failures) or a post-merge close that could not be
verified · `2` fast-forward race exhausted · `3` merge-impossible (branch protected,
non-fast-forward, permission denied). `classifyMergeError(error)` is exported from all three
editions and classifies into `permission_denied`, `branch_protected`, `non_fast_forward`, or `null`.

**Closure is verified, not assumed.** A `gh issue close` that exits `0` is not trusted as proof:
`postMergeCleanup` re-probes the live issue state on the success path too, at both the single-issue
close and the bundle-member loop. An exit-0-but-still-open close is bucketed
`remote_issue_closed: 'failed'` (or added to `failed_issue_closures`), and the sink emits a typed
refusal rather than reporting a completed sink. The refusal fires only when a close was genuinely
attempted — a sink with nothing to close is never false-flagged.

**`sink_incomplete` refusal shapes**, discriminated by `step` — and, within `finalize`, by
`archive_refusal`, since two different archive faults share that step:

| `step` | Meaning | Recovery |
|---|---|---|
| `push_upstream` | `git push -u origin <branch>` did not verifiably reach parity with its upstream; the branch may not be backed up | the step is left NOT done, so a re-run retries it |
| `finalize`, `archive_refusal: "archive_incomplete"` | the archive would not be a faithful copy: `missing` names files the source held that the destination lacks, `mismatched` names every entry that did not verify byte-for-byte — which is two different facts, so see `uncomparable` below. Fires **before** any archive mutation, so the live folder is not deleted | restore the evidence and re-run |
| `finalize`, `archive_refusal: "archive_exception"` \| `"archive_forced_refusal"` \| `"archive_not_performed"` | the archive did not happen at all — a throw other than the `TypeError`/`ReferenceError` export-drift class (`archive_exception`), the `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` test seam (`archive_forced_refusal`), or a return reporting neither `archived: true` nor `skipped: "source-missing"` (`archive_not_performed`). Nothing was pushed to the mainline and no issue was closed | resolve the fault (for example a non-writable `kaola-workflow/archive/`) and re-run; the step is left NOT done |
| `finalize`, `archive_refusal: "archive_reserved_directory"` (issue #930) | the project name is a reserved directory under `kaola-workflow/` — any name beginning with `.`, or `archive` **in any casing**, since the comparison is case-folded to match a case-insensitive filesystem, where `Archive` and `archive` are one directory — so the source is not a project folder at all. Fires at the very top of `archiveProjectDir`, before the linked/in-place split and before the `source-missing` return, so **the archive step** moved, copied, stamped and deleted nothing. That is a statement about the archive step alone: earlier stages of the same `finalize` transaction have already written inside the directory (step 8a's mirror, and the summary writers, which create `finalization-summary.md` there) | the run was claimed against a name that can never be archived; release or discard it and re-claim under a real project name |
| `archive_commit` | the archive was staged and committed, but a file the archive holds on disk did not become a blob at `HEAD`. `archive_missing_paths` names every one and `archive_add_errors` carries the `git add` output. Returned before teardown, so the branch, the worktree and the on-disk archive are all retained — nothing recoverable is lost | fix whatever git could not index (a mode, a permission) and re-run; the step is left NOT done |
| `push_main` | the fast-forward landed locally but pushing the mainline threw | branch preserved; resolve the push fault and re-run |
| `closure` | at least one issue could not be closed, or an exit-0 close could not be verified | the step is left NOT done, so a re-run retries it |

**`verifyArchiveComplete` returns three keys, not two.** `mismatched[]` conflated two different
facts — *this file arrived with different bytes* and *this entry could not be byte-compared at all*
(a symlink, a directory or a device where a regular file was required, or a source subtree the walk
could not read). A reader could not tell "restore the correct bytes" from "this is not a file", and
the caller that compares main's surviving live folder reads presence only, so the second class was
invisible to it. `uncomparable[]` names exactly that second half. It is a strict **subset** of
`mismatched[]` and never a replacement: every existing reader and every existing pin keeps the answer
it had, and a reader needing the distinction subtracts. There is still one source walk, one call and
one answer. The sentinels `'<root>'` and `'<dest>'` mean the source or destination directory itself
could not be read or does not exist.

`missing` and `mismatched` are both reported by `finalize`, `release`, `watch-pr`/`watch-mr` and the
abandon sweep. The last three previously reported `missing` alone, so an entry that failed only on
the uncomparable half refused while naming nothing.

```json
{
  "result": "refuse", "reason": "sink_incomplete", "step": "closure",
  "remote_issue_closed": "partial",
  "closed_issues": [42], "failed_issue_closures": [47],
  "branch": "<branch-name>", "detail": "..."
}
```

`closed_issues` (sorted ascending) is written to the sink receipt whenever the closure step closes
at least one issue, on **both** the success and failure paths, so a resumed `--sink` can read what
already closed rather than treat a `"done"` step as proof nothing is left.

`receipt.archived_paths` (issue #893) is an array of repo-relative paths naming everything the
archive step committed under this project's own `kaola-workflow/archive/<project>/` pathspec. It is
**present and empty** when that step committed nothing there, never absent — a consumer telling
"committed nothing" from "this sink does not report" cannot route on a field that is sometimes
missing. The set is read from the **index** (`git diff --cached --name-only`, with the same excludes
as the add) between staging and the commit, not from any list of what the sink intended to plant, so
it neither under-claims a file that rode in unnoticed nor over-claims one this sink never touched;
another project's archive residue is correctly absent. The same paths are appended to the committed
`finalization-summary.md` under `## Sink Findings` as an `archived_paths:` list, so the record
survives after the envelope scrolls away and the journals are disposed; the writer never creates that
file and is idempotent across a crash-resumed re-entry.

**`archive_collision` names the directory that was already there (issue #931).** When the archive
destination `kaola-workflow/archive/<project>/` already exists, `archiveProjectDir` writes to
`kaola-workflow/archive/<project>.archived-<ts>/` instead and leaves the pre-existing directory
untouched. The suffixed path then rides `archive_dest` and every `archived_paths` entry, so the fact
was *encoded* in the committed record but never *stated* — a reader had to already know what produces
`.archived-` to tell a collision from an ordinary archive, and the directory holding the rest of the
evidence was named nowhere. A single `archive_collision:` line is now written into the same committed
`## Sink Findings` block, in repo-relative form, naming the pre-existing directory and saying that it
was left in place and is a second archive standing for the project. It reports only what it measured,
and the question it asks is deliberately narrow: **not whether something exists at the plain path, but
whether a real archive stands there.** The distinction is load-bearing, because the sink manufactures
that very directory itself — when main holds no live project folder, the receipt path falls back to the
archive band and writing the first journal creates `kaola-workflow/archive/<project>/.cache/`, which is
then enough to push the destination onto a suffixed path. An existence-only test therefore reports a
collision against the sink's own skeleton, names a directory that journal disposal is about to delete,
and commits that. So a lone `.cache/` holding nothing but sink journals is not an archive, and the line
is absent entirely when there was no collision — its absence carries information. It is a recorded
measurement, **not** a
finding — no `findings` key reaches the envelope and no `FINDING` line reaches stderr, because a
collision is a fact about where the archive landed rather than a fault in the merge. The disclosure
covers the posture in which the sink itself archived; under `--keep-worktree` the archive was
performed by `finalize` and the sink has no destination to compare.

This is a **report, not a guard**. The preflight exemption above is a directory prefix, so a stray
file under the run's own archive directory is committed along with finalize's mirror, and the sink
does not attempt to tell one from the other: the archive copies a folder that is untracked in main
and committed nowhere, so git holds no record of what belongs, and a basename allowlist cannot work
when archives carry arbitrarily-named orchestrator artifacts. The listing is uniform by design — it
makes the commit visible, it does not prevent it, and the orchestrator adjudicates.

**Gitignored archive evidence is force-added, and the commit is verified per file.** A consumer
`.gitignore` rule written as a basename — `.cache/` rather than the archive band — does not match the
archive *directory*, so a directory-level ignore probe answers "not ignored" while every evidence file
underneath is unstageable. The archive step therefore probes per file, force-adds exactly the
ignored-untracked files under this project's own archive pathspec, and then confirms against
`git ls-tree -r` that each required file really is a blob at `HEAD` rather than trusting the add's exit
status. Three fields report it, each written only when non-empty:

| Field | Where | Meaning |
|---|---|---|
| `archive_forced_paths` | receipt | The files staged with `git add -f` because the consumer's own ignore rules covered them. Overriding a rule the consumer wrote is recorded, never silent — the same paths are named on stderr. It can never name a transaction journal: the four journal paths are subtracted from the required set and from the force-add allowlist alike |
| `archive_missing_paths` | receipt + refusal envelope | Required files the archive holds on disk that are **not** blobs at `HEAD`. Measured unconditionally, including in the keep-worktree posture where `archive_dest` is unset — that posture lost the same files |
| `archive_add_errors` | refusal envelope | The `git add` statuses, verbatim. They were previously discarded, which is what made a failed stage indistinguishable from a successful one |

A required file that could not be indexed is `{result: 'refuse', reason: 'sink_incomplete', step:
'archive_commit'}` at exit `1`, returned **before** teardown so the branch, the worktree and the
on-disk archive are all retained. The whole-band case is unchanged: when the archive path itself is
ignored, the step still declines to force-add and completes as `skipped_gitignored`, now with the
uncommitted required files itemized rather than merely counted. Force-add and an honest skip are
mutually exclusive.

All three names are **forge-neutral** — identical in all three editions, unlike the deliberate MR/PR
divergences recorded for the closure audit below — because they describe git-local facts and carry no
route noun. On the finalize side, `finalize_transaction.archive_ignored_evidence` names the archived
evidence a consumer's ignore rules cover, so a folder handed to the sink says which of its files git
would refuse to stage unaided.

**An embedded repository boundary inside the archive is inventoried, not refused.** A nested `.git`
**directory**, or a gitfile that resolves, makes git collapse that subtree into a single `160000`
gitlink: `ls-tree -r` returns no blobs beneath it, `ls-files -o -i` reports nothing there so nothing
is force-addable, and an operator's own `git add -f` exits `128` with `is in submodule`. Demanding
those files anyway produced a non-convergent `sink_incomplete` with no remedy reachable from inside
the sink, because the remedy lives outside git's index. The required-file walk now skips the whole
subtree at a **measured** boundary — `rev-parse --show-toplevel` inside the directory equals the
directory itself — and `receipt.archive_embedded_repos` names each boundary, with the working remedy
on stderr: remove the boundary (delete the nested `.git`, or `git worktree remove`) and re-run. This
is the same answer the gitignored-archive case already reaches: proceed, itemize the loss, name the
remedy. A junk `.git`-named **file** does not collapse anything — git commits its siblings normally —
so it stays byte-for-byte inside the blob gate; skipping on the mere presence of a `.git` entry would
have silently dropped healthy files from the gate that exists to catch exactly that loss.

The close loop runs whenever a primary issue (`--issue`) **or** at least one bundle member
(`--issue-numbers`) is present, so a bundle sink invoked with only `--issue-numbers` closes every
member.

**The sink reports; the orchestrator owns the outcome.** These refusals are operation-level: a step
that did not complete says so, and the step is left resumable. What the sink does not do is judge
the work. Content on the branch that no record describes, a witness bound to different bytes, or a
merge that did not fast-forward are **reported**, and the orchestrator resolves them — get the merge
correct, resynchronize, or file a PR instead — then cleans up after the sink. A true content
conflict halts and asks a human; it is never auto-resolved.

`assertWorktreeClean` throws (not a JSON envelope) on a transient `git status` probe failure after
one bounded retry absorbs a momentary fault: the caller sees exit 1 with a stderr message naming the
fault. Re-run after resolving it (for example, removing a stale `index.lock`).

### PR sink

- **Script**: `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` /
  `kaola-gitea-workflow-sink-pr.js`.
- **Contract**: push branch, create the PR/MR (`gh pr create` / `glab mr create` / `tea pr create`),
  record `pr_url` and `pr_number` in the `## Sink` block, then create a deliberate metadata
  follow-up commit (`chore: record PR metadata for {project}`) so the worktree is left clean.
- **Exit codes**: `0` created and recorded · `1` push or creation failed.
- **Offline**: `KAOLA_WORKFLOW_OFFLINE=1` writes an `OFFLINE_PLACEHOLDER` commit instead of real
  metadata.
- The folder stays active until `watch-pr` / `watch-mr` observes MERGED or CLOSED; both archive it.
- The PR sink emits no closure receipt — the authoritative receipt for a `sink: pr` project is
  emitted by the watcher at merge. This is documented behavior, not a gap.

### Sink journal disposal

`sink-receipt.json` and `sink-fallback.json` are crash-resume transaction journals owned by
`sink-merge.js`. `disposeSinkJournals(mainRoot, project)` unlinks all four candidate paths (live and
archived `.cache/`) at terminal success. A journal found after a successful sink must be **deleted**,
never committed — it is never part of the deliverable.

## Closure Contract

This section defines the closure-system invariants for a completed linked issue N. It is the
human-readable counterpart to the machine-readable schema in
`scripts/kaola-workflow-closure-contract.js`. Every closure path (`cmdFinalize`,
`cmdWatchPr` / `cmdWatchMr`, and `sink-merge`) seeds a full receipt from `emptyReceipt()` via the
shared `buildClosureReceipt()` helper (issue #164) and emits `closure_receipt` plus
`closure_invariants` in its JSON output.

**Fail-closed archive result boundary.** The shared `archiveSucceeded(result)` predicate returns
true only for `{ archived: true }` or the idempotent retry result `{ skipped: "source-missing" }`.
Finalize, release/discard, and merged/closed PR/MR watch callers must pass this post-call predicate
before remote issue or label disposition, worktree/branch/claim cleanup, terminal receipt stamping,
or success output. Thrown errors, `archive_incomplete`, missing fields, and every other result shape
stop with the live authority preserved.

### Closure invariants

For a completed linked issue N:

1. `kaola-workflow/{project}/` is absent from active folders.
2. `kaola-workflow/archive/{project}/workflow-state.md` exists with `status: closed` when a local
   archive is available; the existing sink receipt and closure facts provide the rest of the safety
   evidence.
3. The remote issue is closed only after acceptance passes and implementation is published.
4. The remote issue does not carry `workflow:in-progress` after closure.
5. Any branch or worktree cleanup is either complete or explicitly reported by the stale-worktree
   tooling.

`checkClosureInvariants(root, receipt, archiveDest)` checks them as named violations:

- `in-progress-label-removed` — invariant 4. Skipped, not violated, when `KAOLA_WORKFLOW_OFFLINE=1`
  or when `claim_label_removed` is `skipped_offline`.
- `active-folder-absent` — invariant 1.
- `archive-state-closed` — invariant 2; skipped when `archiveDest` is absent.
- `branch-worktree-resolved` — neither `worktree_removed` nor `branch_removed` is `failed`.
- `remote-members-closed` — for a bundle, every member of `issue_numbers` is closed. A member left
  in `failed_issue_closures` or `open_issues` while online is a violation. Never fires for
  single-issue receipts.

`ok` is `true` only when `violations` is empty.

**Retired: the roadmap-source invariants.** The `.roadmap/issue-N.md`-absent and
`ROADMAP.md`-does-not-list-`#N` invariants above, and the keep-open inversion that preserved their
counterparts under `keep-open-roadmap-preserved`, went with `reconcileRoadmapForClosure` under ADR
0018 §5 — there is no local roadmap source or mirror left for a closure to leave clean or preserved.

**Retired: the WARN-FIRST attestation invariant.** `claim_planner_attested` went with its producer
chain (`checkDispatchAttestations`, the `--attest-planner-spawn` back-fill) when the mandatory
planner seam was retired; no closure path records or checks a dispatch attestation, on any edition.
The finalize seam never had one — it is orchestrator-owned by design, so inline execution there is
the design, not a bypass. A legacy receipt carrying `claim_planner_attested` or the earlier-retired
`finalize_contractor_attested` field is read and kept **verbatim**; nothing rewrites one.

### Closure receipt schema

Field names and enum values are exported from `scripts/kaola-workflow-closure-contract.js` as
`CLOSURE_RECEIPT_FIELDS`. `emptyReceipt(project, issueNumber)` returns a receipt with every status
field defaulted to `failed` — fail-loud: an unpopulated receipt reads as total failure, never silent
success.

```json
{
  "project": "issue-N",
  "issue_number": "N",
  "archive": "closed|abandoned|skipped|failed",
  "anchored_root": "/absolute/path/to/main/root",
  "remote_issue_closed": "closed|already_closed|kept_open|partial|close_pending|skipped_offline|failed",
  "closure": { "attempted": [], "closed": [], "failed": [], "skipped_offline": [], "kept_open": [] },
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "worktree_removed": "removed|missing|kept|failed",
  "branch_removed": "removed|kept|failed",
  "selection_evidence": "present|absent",
  "goal_declared": false,
  "goal_declared_source": null,
  "goal_declared_probed": [],
  "warnings": []
}
```

- `anchored_root` — the resolved main root at finalize time. Absent on single-root runs where the
  resolution is trivial.
- `anchored_root` and `closure` are attached **after** `buildClosureReceipt()` returns, because the
  builder filters by `CLOSURE_RECEIPT_FIELDS`.
- `closure` — per-issue audit record; all five sub-fields are arrays of issue numbers.
- `selection_evidence` — advisory. `probeSelectionEvidence` checks the archive then live `.cache/`
  for a file matching `/^selection-evidence\./`. No invariant and no warning on absence: a
  user-named claim legitimately has none.

**Pre-sink close-pending qualifier.** `cmdFinalize` runs BEFORE `sink-merge` closes the members, so
on a normal online finalize the members are not yet closed — but not because of a partial failure.
Two fields disambiguate that from a real partial close:

- `remote_issue_closed: close_pending` — the truthful online token for "online, the close happens at
  sink". `already_closed` still wins when the issue is already closed on the forge.
- `close_disposition: close_pending` — set only by `cmdFinalize` on the merge lane.
  `checkClosureInvariants` SKIPS `remote-members-closed` when it is present. `sink-merge` and
  `watch-pr` (post-sink) leave it unset, so the invariant fires there truthfully.

**Keep-open partial-close lane.** When the `## Sink` block carries `issue_action:
comment_keep_open` (written at the closure decision; default `close` when absent),
`cmdFinalize --keep-issue-open` and `sink-merge --keep-issue-open` run the keep-open terminal:

- `remote_issue_closed` records `kept_open`, also under OFFLINE — the decision is local and known.
  Truth still wins: online and already closed on the forge records `already_closed` plus a warning.
  `sink-merge` posts a mechanical keep-open comment with no `close`/`fix`/`resolve #N` substring
  instead of closing; the claim label is removed in both modes.

**Keep-open is merge-sink-only**, fenced at three layers: the finalize prose refuses a non-merge
sink under keep-open; a `sink-merge` exit-3 is a blocked refusal requiring manual remediation rather
than an auto-pivot to a `Closes #N` PR; and `sink-pr.js` / `sink-mr.js` themselves refuse when the
live or archived state carries `issue_action: comment_keep_open`. `sink-merge` also re-reads the
archived state and honors the field even if the flag was not passed.

**Bundle projects — additive receipt fields.** Attached after `buildClosureReceipt()` returns;
absent on single-issue receipts.

```json
{
  "issue_numbers": [42, 47, 53],
  "closed_issues": [42, 47, 53],
  "failed_issue_closures": [],
  "open_issues": []
}
```

Every bundle member lands in exactly one of `closed_issues`, `failed_issue_closures` and
`open_issues`. `remote_issue_closed` for a
bundle is `closed` (all members) or `partial` when online — never `skipped_offline`, which is the
offline-only token. A `partial` close trips `remote-members-closed`, so it is never reported as a
clean success.

**Retired: attestation persistence to the archive.** `persistAttestationToSummary` and the
script-owned `## Attestation` section went with the attestation invariant above: nothing appends to
the archived `finalization-summary.md` at close, and `appendClosureBlock` writes no attestation
field to the `## Closure` block. An archived summary that already carries a `## Attestation`
section is a legacy record and is left byte-identical; nothing rewrites one.

**Offline behavior** is explicit: local invariants (1–4) are always checked; remote actions
(`remote_issue_closed`, `claim_label_removed`) record `skipped_offline` rather than `failed`.

### `buildClosureReceipt()`

`buildClosureReceipt(project, issueNumber, steps)` is the single mapping point every closure path
uses to produce a receipt, exported from each forge's claim module (`kaola-workflow-claim.js`,
`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`).

### `sink-merge` closure receipt

`sink-merge` is the only path that sets `remote_issue_closed: 'closed'` and
`branch_removed: 'removed'` — it owns the remote-close and branch-delete steps. `cmdFinalize` and
the watchers set `branch_removed: 'kept'`. `sink-merge` derives `archive` by probing post-conditions
(finalize already archived). The exit-3 merge-impossible fallback returns before any receipt is
emitted.

### `watch-pr` / `watch-mr` output

```json
{
  "watched": 1,
  "cleanups": [{
    "folder": "issue-N",
    "claim_label_removed": "removed",
    "receipt": { "project": "issue-N", "archive": "closed", "branch_removed": "kept" },
    "closure_invariants": { "ok": true, "violations": [] }
  }]
}
```

`cleanups[]` and `warnings[]` are preserved for backward compatibility; `receipt` and
`closure_invariants` are additive. On the MERGED lane the disposition is OBSERVATION-derived via
`probeIssueState`: `closed` when observed closed, `kept-open` when observed open (a merged PR with
no close keyword), `unknown` when the probe is unavailable.

### Closure history

The contract was decomposed across four issues, all shipped: **#162** made roadmap source cleanup
mandatory after closure — that reconciliation was retired under ADR 0018 §5, so this is history,
not current behaviour; **#163** guaranteed `workflow:in-progress` label cleanup
(`in-progress-label-removed`) and added the `audit-labels` / `repair-labels` subcommands; **#164**
unified closure execution behind the shared receipt; **#165** added the closure audit and repair
command for drift detection. GitLab and Gitea ports followed in #166 and #167.

## Closure audit and repair — `kaola-workflow-closure-audit.js`

Reports **closure drift** — completed work that still shows as active — across active folders,
archive state, remote issue state, and the `workflow:in-progress` label. A dedicated script, not a
`claim.js` subcommand.

```bash
node scripts/kaola-workflow-closure-audit.js                             # repository-wide, dry-run: report drift as JSON, change nothing
node scripts/kaola-workflow-closure-audit.js --execute                   # repository-wide, repair safe local drift
node scripts/kaola-workflow-closure-audit.js --project <name>            # scoped verdict, dry-run
node scripts/kaola-workflow-closure-audit.js --project <name> --execute  # scoped verdict + scoped repair
node scripts/kaola-workflow-closure-audit.js --issue <N> [--issue <M>]   # scope by issue number(s); repeatable
node scripts/kaola-workflow-closure-audit.js --help                      # usage on stdout, exit 0
```

**Scoping partitions the report; it never narrows the sweep.** The repository sweep always runs whole,
so no remote-call count changes and out-of-scope drift is never suppressed. `--project <name>` reads
its member issues from that project's own `workflow-state.md` (live folder first, then
`archive/<name>`, `archive/<name>.archived-*`, `archive/<name>.discarded-*`) and is not repeatable;
`--issue <N>` is. Passing either switches the envelope to the scoped shape: `scope`,
`current_project_clean`, `current_project_drift`, `current_project_counts`,
`repository_drift_outside_scope`, `repository_counts_outside_scope`. Passing neither is the
repository-wide default, whose envelope is unchanged.

| Fact | Contract |
|---|---|
| `current_project_clean` | **Fail-closed** — `true` only when every scoped class actually evaluated and came back empty. A class that returned `"skipped_offline"` or `"skipped_timeout"` makes it `false`, so an offline scoped run is never `true` and `false` must not be read as "drift found" without the counts. A `--project` that resolved to no record makes it `false` too — the same rule applied to the scope itself, since nothing was read for the name the operator gave, whatever the classes say about `--issue` numbers passed beside it |
| `scope.project_unresolved` | (omitted unless `true`) The named `--project` resolved to no `workflow-state.md` anywhere. It is what makes a `null` `scope.state_file` legible — the name was given and found nothing, rather than never given — and it is why the verdict above is `false` |
| a skipped class | appears verbatim in **both** halves — it never evaluated, so neither half may claim it clean |
| exit `0` | every successful run, **including one that found drift**. There is deliberately no verdict in the exit code |
| exit `1` | operator-input error only: unknown flag, a missing or malformed flag value, or a `--project` resolving to no `workflow-state.md` anywhere with no `--issue` given. stdout is empty. Answering "clean" for a mistyped project name is the failure this replaces |
| `attribution` | on scoped archive findings only, `"name_match"` or `"ambiguous_name_match"`. The two archive classes are attributed by name alone, because the artifact they report missing is itself the record that would carry an issue number |
| scoped `--execute` | repairs only in-scope drift — `stale_in_progress_labels` is already filtered to the scope's own issues before the repair runs, so a scoped run never touches an out-of-scope label |

| Key | Meaning |
|-----|---------|
| `stale_in_progress_labels` | Closed remote issues still carrying `workflow:in-progress` |
| `active_folder_for_closed_issue` | An active folder whose linked issue is closed. `dirty` flags uncommitted content. **Report-only** |
| `unarchived_pr_folders` | An active `sink: pr` folder whose PR is MERGED/CLOSED but was never archived. **Report-only** |
| `archive_content_incomplete` | An archived run whose folder is missing its `workflow-state.md` identity anchor — the only unconditionally required artifact. **Report-only in both modes**, and identical offline |
| `unresolved_closed_state` | (omitted when empty) Issue numbers whose closed state could not be determined because the remote check timed out or failed. Present in both `drift` and `counts` |
| `archive_summary_citation_missing` | (omitted when empty) An archived `finalization-summary.md` cites a bare-relative `.cache/…` artifact that is not in the archive — a record pointing at evidence nobody can read. **Report-only**, and it carries the cited path so one `ls` settles it. Append-log citations (`.jsonl`) are excluded: their disposal is a documented step, so absence there is correct. A narrative mention of a path that lives elsewhere reads as a citation, so the class has a known false-positive mode and is a prompt to adjudicate, not a verdict |

**Safe-repair boundary.** `--execute` only ever removes `workflow:in-progress` from closed issues
when online. It **never** deletes active folders or worktrees. The report-only classes are carried
verbatim into `reported_not_repaired` in both modes — they may hold un-finalized work.

**Offline** (`KAOLA_WORKFLOW_OFFLINE=1`): local-only classes still run; remote-dependent classes
report the string `"skipped_offline"` rather than an array, and `--execute` performs no remote label
removal. A non-offline forge failure reports an empty array plus a stderr warning — never silently
downgraded to `skipped_offline`.

**Timeouts**: `detectStaleLabels` and `detectUnarchivedPrFolders` / `detectUnarchivedMrFolders`
return `"skipped_timeout"`. In `--execute`, a repair-phase timeout breaks the loop and sets
`labels_skipped_reason: "timeout"`; a detection-phase timeout yields
`labels_skipped_reason: "detection_timeout"`; offline yields `"offline"`.

**GitLab** ships `kaola-gitlab-workflow-closure-audit.js` with the same contract and JSON shape,
routed through `kaola-gitlab-forge.js`. MR substitutions: `unarchived_pr_folders` becomes
`unarchived_mr_folders` with `mr_url` / `mr_state`, gated on `sink: mr` folders, matched against
GitLab's **lowercase** state values. **Gitea** ships `kaola-gitea-workflow-closure-audit.js`,
keeping `unarchived_pr_folders` and likewise matching lowercase state.

### `audit-labels` and `repair-labels`

Two `claim.js` subcommands that find and fix closed issues still carrying `workflow:in-progress`.

**`audit-labels`** — scan-only:

```json
{ "stale": [{ "number": 127, "title": "...", "url": "..." }], "count": 1 }
```

**`repair-labels`** — dry-run by default, `--execute` performs removal:

```bash
node scripts/kaola-workflow-claim.js repair-labels             # dry-run
node scripts/kaola-workflow-claim.js repair-labels --execute   # remove
```

```json
{ "dry_run": true,  "would_remove": [{ "number": 127, "title": "...", "url": "..." }] }
{ "dry_run": false, "removed": [127], "failed": [] }
```

GitLab and Gitea expose the same `audit-labels` / `repair-labels` subcommands at full **parity**,
routed through `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js`. The JSON shape
is identical; the only forge difference is that the issue `url` field is sourced from each forge's
`web_url`. Receipt wiring — `clearAdvisoryClaim` returning the status enum and finalize/watch
emitting `claim_label_removed` — is shared across all three forges.

### How closure-audit differs from the worktree tooling

They cover **disjoint** drift surfaces and are intentionally separate:

| | `closure-audit` | `stale-worktree-check` / `-cleanup` |
|---|---|---|
| **Surface** | active folders, archive state, remote issue state, advisory labels (invariants 1, 2, 3, 4) | Git worktrees and branches (invariant 5) |
| **`--execute` repairs** | stale labels | removes worktrees and deletes local branches |
| **Never touches** | worktrees, branches, **active folders** | labels, archive folders |

Run both for full coverage.

## Worktree maintenance

### `claim.js stale-worktree-check`

Detects worktrees and branches for issues that are not active. A worktree or branch is stale when
its linked issue is closed (per the forge API) OR its project folder is archived locally, AND the
issue is not in the active folder set.

```bash
node scripts/kaola-workflow-claim.js stale-worktree-check
```

```json
{
  "stale_worktrees": [{ "path": "/path", "branch": "workflow/issue-42", "head": "abc123",
                        "issue_number": 42, "state": "clean|dirty|missing" }],
  "stale_branches":  [{ "branch": "workflow/issue-43", "issue_number": 43 }],
  "active_worktrees":[{ "path": "/path", "branch": "workflow/issue-44", "issue_number": 44 }],
  "count": 2
}
```

Detection, per worktree or branch: extract the issue number from the branch name
(`workflow/issue-(\d+)`); skip if the issue is in the active folder set; otherwise mark stale when
the issue is closed on the forge (skipped offline) or `kaola-workflow/archive/issue-<N>` exists.
`count` is `stale_worktrees.length + stale_branches.length`. Exit 0.

The JSON shape is identical across all three forges; GitLab and Gitea match their own branch prefix
(`workflow/gitlab-issue-*`, `workflow/gitea-issue-*`).

### `claim.js stale-worktree-cleanup`

Removes what `stale-worktree-check` finds. Dry-run by default.

| Flag | Effect |
|---|---|
| `--execute` | perform the removal; without it, scan and report only |
| `--archive` | for dirty worktrees, stash uncommitted changes first (recoverable via `git stash list`) |
| `--export` | for dirty worktrees, write a patch to `kaola-workflow/archive/exports/issue-N-{ts}.patch` and copy untracked files into a sibling `issue-N-{ts}-untracked/` directory |
| `--force` | for dirty worktrees, discard uncommitted changes with no recovery path |
| `--keep-branch` | remove the worktree but preserve the local branch (useful for an open PR) |

With no strategy flag, dirty worktrees are skipped and reported in `skipped_dirty`. The strategy
flags are not mutually exclusive and raise no error; a silent precedence applies:
`--archive > --export > --force`.

**Branch deletion is never unconditional.** `--execute` resolves the default branch once, then for
each candidate proves `git merge-base --is-ancestor <branch> <defBranch>` before running
`git branch -D`. When ancestry cannot be proven it falls back to the safe `git branch -d`, which git
itself refuses for genuinely unmerged work. A branch that survives is reported in
`skipped_unmerged` with its tip SHA, never force-deleted — `worktreeDirtyState` only detects
*uncommitted* changes, so a branch with committed-but-unmerged work would otherwise read as clean.

A branch pushed and at parity with its own upstream is deleted by the safe `-d` leg and lands in
`deleted_branch`, not `skipped_unmerged`: git considers it merged once it is an ancestor of its own
upstream. That is not data loss — the tip remains reachable via `refs/remotes/origin/<branch>` — but
it means `deleted_branch` does not imply "ancestor-proven into the default branch" for every entry.

```json
{ "dry_run": true,  "would_remove": [], "would_delete_branch": [], "skipped_dirty": [] }
{ "dry_run": false, "removed": [], "deleted_branch": [], "skipped_dirty": [], "stashed": [],
  "exported": [], "failed_preserve": [], "skipped_unmerged": [] }
```

Exit `0` on success (either mode), `1` on an execution error.

### `claim.js legacy-worktree-cleanup`

Discovers and removes worktrees provisioned under the old sibling-container path
(`<repo-parent>/<repo-name>.kw/<project>/`) before the repo-local `.kw/worktrees/` layout. Separate
from `stale-worktree-cleanup`, which targets issue staleness, not path-layout migration.

Same `--execute` / `--archive` / `--export` / `--force` flags. Branch refs are preserved — only the
worktree registration and directory are removed. After all legacy worktrees are removed the
now-empty container directory is deleted. The command refuses to operate if the current working
directory is inside a target legacy worktree.

### `claim.js barrier-ref-sweep`

A one-shot collector for `refs/kaola-workflow/barrier/*` refs stranded by the retired node executor.
It keeps every ref whose tag belongs to a live project, determined across **every** worktree root
(`git worktree list --porcelain -z`, byte-exact) by an active-folder tag or a `workflow-state.md`
that exists but cannot be read (unprovable-dead ⇒ keep). Add-only on collisions, scoped strictly to
`barrier/<tag>/*`, and fails closed — deleting nothing — if the worktree set cannot be enumerated.

## Roadmap layer — retired

`kaola-workflow-roadmap.js` (all four editions), the `ROADMAP.md` mirror it generated, and the
per-issue `kaola-workflow/.roadmap/issue-{N}.md` sources it read and wrote are gone —
[ADR 0018](decisions/0018-the-forge-is-the-backlog.md) §5 retired the whole layer: the mirror, the
sources, the closure-receipt fields, the closure invariants, the drift classes, and the sink's
roadmap stash bucket. `generate`, `validate`, `validate-remote`, `migrate`/`refresh`, `init-issue`
and `project-name` no longer exist on any edition. The forge is the backlog now — an issue's title,
labels and comments are the work, comments overriding the body — and there is no local copy to keep
current.

**What survives.** `kaola-workflow/.roadmap/` is still a reserved project-name directory (see
`reserved_project` above) and still holds one optional file, `_rules.md`, for standing project-local
rules — read directly by the pick step, never generated (see `workflow-state-contract.md` § Durable
Sources). Finalizing (`cmdFinalize`) no longer reconciles a roadmap mirror — that automatic
reconciliation (`reconcileRoadmapForClosure`) was retired with the rest of the layer — but finalize's
`roadmap_staged` field (above) still stages `kaola-workflow/.roadmap/` into the archive commit when it
is found on disk, so a not-yet-migrated consumer repo's tracked files under it land in the commit
rather than being left as untracked residue. A freshly initialized repo never creates that path.

`kaola-workflow/ROADMAP.md` was staged alongside it until #988 and no longer is. Nothing generates or
modifies the mirror after the retirement, so the pathspec could only ever match an unmigrated
consumer's frozen, unchanged copy — a no-op stage that read as a live claim that the tool still
maintains a mirror. The sink's archive commit dropped the same pathspec in the same change. A
consumer's own `ROADMAP.md` is untouched either way: migrating it off is a separate, deliberate act
(see ADR 0018 §8 step 6), never something an upgrade or a finalize performs.

## Run-gap sweep — `kaola-workflow-gap-sweep.js`

```
Usage: kaola-workflow-gap-sweep.js --project <name> [--json] [--check]
                                   [--summary <path>] [--output <path>] [--offline]
```

Two modes, and they are exclusive — neither runs the other. The **scanner** (default) scans the run's
`.cache/` for gaps the run itself discovered, writes `.cache/run-gaps.json`, and under `--json`
reports the `sweptClasses` the `## Run gaps` section is written from. The **gate** (`--check`) reads
that artifact back and verifies every swept gap is mapped in `finalization-summary.md` `## Run gaps`,
one line each, either `filed: #N` or `noise: <justification>`. An orchestrator-authored row the
scanner never observed is added to `.cache/run-gaps-manual.md` and re-swept, so what is written was
actually swept.

The gate consumes; it never produces. Run against an artifact no scanner wrote it refuses
`artifact_missing` and exits 1, which is why the finalize surface splices **both** invocations — the
scan in Step 6, ahead of the section its `sweptClasses` populates, and the gate in Step 7 to
reconcile the two sides.

## Telemetry — `kaola-workflow-telemetry-report.js`

```
usage: kaola-workflow-telemetry-report.js --project <name> [--json]
```

Ranks the recorded outcome population of one project by measured interruption cost, reading the
existing `.cache/{outcome-log.jsonl, node-timings.jsonl}` telemetry. An **answer verb**: exit 0
always, writes nothing, never refuses. An absent sidecar is the ordinary case (the writers are
best-effort) and reads as an empty file. Damaged JSONL lines are counted and reported, not fatal.

## Release — `kaola-workflow-release.js`

```
usage: kaola-workflow-release.js --verify | --prepare --version X.Y.Z [--codex-version A.B.C]
                                 | --tag --version X.Y.Z | --push [--json]
```

`--cut` is deliberately **refused** and returns the correct sequence instead:

```
--prepare --version X.Y.Z
commit only the release files
run the offline full chain receipt at the release commit
pass kaola-workflow-run-chains.js --release-check
--tag --version X.Y.Z
```

The `--release-check` step is the gate documented above. `--prepare` bumps the versioned files;
`--tag` creates the annotated tag at the verified commit — the same route `--tag` and
`--release-check` now share — and `--push` publishes.

## Installation and edition sync

| Script | Contract |
|---|---|
| `generate-agent-profiles.js --check\|--write\|--print-manifest` | validates the complete 14-role behavior, runtime-capability, and provenance authorities; composes seven runtime families through nine adapter variants; writes/checks the 14 Claude profiles, 42 Codex profiles, three Codex registries, and the 126-render manifest; exposes logical profile renders to the five additive edition generators; and renders/replaces runtime-native next/finalize guidance through the API above. `delegation_guidance` is routing-only and excluded from the native-profile adapter hash, so its change does not churn unchanged profile hashes. `--check` exits non-zero on tracked output drift. Generated prompts exclude provenance. |
| `kaola-workflow-project-instructions.js plan\|check\|apply --project-root <path> --json [--consent-execution-default-change <plan-sha256>]` | ownership-safe AGENTS-first project migration described above, including per-file active-state schema fencing and ephemeral unchanged-plan consent. The installed GitHub, GitLab, and Gitea copies are identical. |
| `run-edition-tests.js <scripts/test-*.js>...` | executes every explicitly declared additive edition suite, even after a prior failure; prints child output, retains every failed suite in the final summary, and exits non-zero after all attempts when any child failed. The package script declares opencode, Kimi, Grok, Cursor, and ZCode explicitly so suite registration can see the full lane. |
| `kaola-workflow-install-manifest.js --forge=<github\|gitlab\|gitea> (--scripts\|--hooks)` | the single source of the support-file list an installer copies. Prints one name per line. Exits 2 on an unknown argument, a missing flag, or an **empty** list — an empty manifest would copy zero support files, so it refuses rather than silently installing nothing. Exports `SUPPORT_SCRIPTS`, `SUPPORT_HOOKS`, `FORGES`, `supportScripts`, `supportHooks`, `renameIfPorted` |
| `edition-sync.js (--check \| --write \| --materialize-kernel)` | materializes the rename-normalized edition copies from the canonical tree and the byte-identical kernel into each edition. `--check` is the read-only verdict |
| `validate-script-sync.js` | enforces cross-edition parity, including `BYTE_IDENTICAL_GROUPS`, which auto-expands when a new `.toml` is added to the codex tree |
| `sync-opencode-edition.js` / `sync-kimi-edition.js` / `sync-grok-edition.js` / `sync-cursor-edition.js` / `sync-zcode-edition.js` | additive runtime editions outside `npm test` and the forge chains. Each requests native role bytes and its marked next/finalize guidance from `generate-agent-profiles.js`; none parses Claude role prose as semantic input. `workflow-init` has no runtime dispatch block and is not replaced. `--refresh-present` regenerates every edition tree already on the machine and creates none — it is what the routing generator's `--write` calls, so a routing-prose change leaves no present tree stale. `--print-tree-root` prints the single absolute generated-tree root and writes nothing. Cursor additionally accepts `--write --tree-root=<absolute empty real directory>` for installer-owned isolated staging and refuses relative, missing, symlink, or occupied roots; its normal installer never regenerates the repository tree. Other installers resolve their source from `--print-tree-root`, including from a linked worktree. A cross-checkout refresh reports changed trees and the editions check on stderr without contaminating stdout. |
| `install-zcode.sh` | additive ZCode installer (project `--target` / `--global`, forge axis, regenerate/uninstall/no-scripts/yes). Project installs stage agents/commands and sync profiles to user scope; global installs write the user carrier. Issue #1044 installs no prompt-lifecycle hooks or prompt components. Upgrade/uninstall remove only receipt-owned legacy project/user Kaola declarations and preserve foreign config. |
| `install-all.sh` | thin current-machine-only runtime orchestrator. It invokes each local runtime installer and has no Cursor Cloud deployment mode. Cursor Cloud setup uses `install-cursor.sh` directly only after the Agent establishes it is in that remote environment setup. |
| `install-cursor.sh` | additive Cursor installer (`--target DIR` / `--global`, forge axis, regenerate/uninstall/no-scripts/yes/doctor). It renders in isolated staging, writes receipt-owned agents/commands plus one `alwaysApply` Rule, and merges an empty Kaola hook mapping that retires only known legacy entries. Explicit project materialization provides the same Rule to standalone CLI, App local, and Cloud. Receipts, collisions, symlinks, authority freshness, uninstall, and doctor remain fail-closed/evidence-bound. |
| `kaola-workflow-cursor-surface.js --doctor [--json] [--target DIR] [--product cli\|app\|unknown] [--host local\|cloud\|unknown] [--forge=...]` | Cursor filesystem/evidence reporter; reads adapter surface facts and receipt state without inferring sibling products or hosts. Unqualified current `runtime_build` and `named_catalog` remain `unknown` absent live observation; `evidence_stamp` and `selected_host` carry historical measured facts. |
| `kaola-workflow-cursor-surface.js --install --scope global\|project [--target DIR] --source-tree DIR [--support-source DIR] [--no-scripts] [--authority-only] [--forge=...]` | receipt-owned global authority or explicit project transaction used by `install-cursor.sh`; copies the generated recovery Rule and strips legacy Kaola prompt hooks while preserving foreign entries. |
| `kaola-workflow-cursor-surface.js --ensure-target DIR [--forge=...]` | installed standalone-CLI pre-dispatch materializer. It has no ambient target, never bootstraps or repairs authority, returns `current` or `materialized`, and fails closed before target mutation on every authority/ownership fault. Generated Cursor next/finalize invoke it only for CLI/local immediately before named dispatch; App local and Cloud are excluded. Cloud environment setup instead invokes the installer directly for its remote machine and selected repository after the Agent confirms that host. |
| `kaola-workflow-cursor-surface.js --uninstall --scope global\|project [--target DIR]` | removes only receipt-recorded files whose current hashes still match and only exact recorded Kaola hook entries; preserves modified or unproved bytes. |
| `install-codex-agent-profiles.js` | authoritative Codex install/upgrade transaction; validates source profiles and targets, writes and prunes the managed set, records the manifest, installs hooks, and verifies the result before success |
| `kaola-workflow-codex-preflight.js --doctor` | explicit user-invoked diagnostic for installed plugin, agent-profile, managed-config, manifest, and hook state. Ordinary workflow entry/resume never invokes it or treats its result as a readiness gate |

## Configuration

### Global config

`~/.config/kaola-workflow/config.json` (optional):

```json
{ "pr_auto_merge": false, "mr_auto_merge": false }
```

User-owned: no installer creates or edits this file. A key left behind by an older install (e.g. the
retired `parallel_mode`) is ignored, never rewritten.

- `pr_auto_merge` — auto-merge after PR creation (GitHub + Gitea; squash merge with source branch
  deletion; non-fatal if the merge fails).
- `mr_auto_merge` — the GitLab equivalent (`glab mr merge --auto-merge`).

### Project-local config

`kaola-workflow/config.json` (optional, checked into the repo):

```json
{ "priority_top_tier_labels": ["hotfix", "critical"] }
```

- `priority_top_tier_labels` — labels that sort as tier 1 regardless of P-label, overriding the
  default `["P0", "P1"]`. Read by `readPriorityConfig` in `kaola-workflow-claim.js`. A non-array or
  missing value falls back to the default.

### Agent model resolution

`templates/agents/behavior-contracts.json` assigns every role one runtime-neutral `intent_class`:
`standard`, `reasoning`, or `heavy`. It contains no vendor or model identifier. The selected entry in
`templates/agents/runtime-capabilities.json` maps that intent to a native carrier or inheritance:

- Claude defaults are `sonnet` / `opus` / `fable` with runtime-default effort; installed profiles
  inherit and the dispatch guidance carries the default selection;
- Codex profiles omit a fixed model under host policy, while dispatch defaults are
  `gpt-5.6-luna`/max, `gpt-5.6-sol`/medium, and `gpt-5.6-sol`/high;
- opencode and Kimi inherit the session model/effort under the documented adapter boundary;
- Grok carries native effort while inheriting the session model;
- Cursor carries the native model/effort parameter in generated profile frontmatter; omit-model
  dispatch is the named-catalog carrier on CLI, local App, and correctly saved Cloud environments;
- ZCode carries an explicit model plus camelCase `thoughtLevel`.

The exact current mappings are machine data and are summarized in `runtime-capabilities.md`.
Next/finalize expose them as default dispatch bindings, not as mission-list state, a fixed pipeline,
or a ban on runtime-supported task-sensitive choices. A missing required native capability yields a
specific per-item `capability_gap`; it is not emulated by granting wider tools, impersonating a
named role, silently dropping the restriction, or declaring the rest of the run inline.

Finalize carries executable-shaped defaults for its validation and documentation handoffs: Claude
examples pass the tier model and retain runtime-default effort; Codex examples pass the tier model
and `reasoning_effort`. A task-sensitive override or supported inherited pair remains valid. Codex
lookup starts at the effective project or user `.codex/config.toml`: its managed
`[agents.<role>]` registration references `.codex/agents/kaola-workflow/<role>.toml`, while bundled
`agents.toml` is only installer source.

## Environment Variables

### Timeouts

- **`KAOLA_GH_REMOTE_TIMEOUT_MS`** (default 30000) — timeout for all forge API calls made by
  `ghExec`, `glabExec` and `teaExec`: issue and PR state checks, closure audits, label operations.
  On timeout the affected operation returns an `unavailable` or `skipped_timeout` sentinel instead
  of failing hard. Non-numeric, zero or negative values fall back to the default; values above
  600000 (10 minutes) are clamped, so a large value cannot silently disable the hang protection.
  Applies to all three forge editions.
- **`KAOLA_RUN_CHAINS_TIMEOUT_MS`** (default 1800000, 30 min) — per-chain kill ceiling for
  `run-chains.js`. Non-numeric, zero or negative values fall back to the default. **No upper clamp**
  — a long local test suite is not a remote-hang risk. A chain killed by this ceiling carries
  `timed_out: true` in the receipt.
- **`KAOLA_RUN_CHAINS_RETRY`** (default 2, i.e. one retry) — max attempts per chain on a
  transient-infra fault. A chain that exits non-zero is re-run only when its captured output carries
  a positive transient signature (TLS/handshake/ETIMEDOUT/ECONNRESET/429/EAI_AGAIN/5xx). Clamped to
  an integer ≥ 1.
- **`KAOLA_RUN_CHAINS_CONCURRENCY`** (`auto` | `serial` | `<N>`) — pool size for the chain dispatch.
  `auto` gates on core count; `serial` (or `1`) forces the serial fallback; `<N>` forces a pool of
  N, clamped to the chain count.

### Targeting and posture

- **`KAOLA_TARGET_ISSUE`** / **`KAOLA_TARGET_ISSUES`** — the scalar and bundle target. Setting both
  answers `target_ambiguity` at exit 0, writing nothing. Bundle numbers are sorted and deduped
  before validation.
- **`KAOLA_WORKTREE_NATIVE`** (ON by default; `0` disables) — see Worktree provisioning above.
- **`KAOLA_SINK`** — `pr` selects the PR sink; the default is the merge sink.
- **`KAOLA_GOAL`** — advisory goal text. Finalization records that a goal was DECLARED, with its
  source; nothing checks whether it was met.
- **`KAOLA_SESSION_MARKER`** — a stable session identity for lane classification; otherwise
  `s-<pid>-<timestamp-base36>` is minted at claim time.
- **`KAOLA_COTENANT=1`** — declares an active co-tenant, so other lanes classify as `live` and are
  left untouched.
- **`KAOLA_WORKFLOW_OFFLINE=1`** — skip all network calls (forge API, `git fetch`, `git push`).
  Applies to all three forge editions.

### Test hooks

Test-only. Do not use in production.

- **`KAOLA_WORKFLOW_FORCE_FF_FAIL=N`** — fail the first N fast-forward attempts in `ffMergeLoop`.
- **`KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=token`** — force a merge-impossible error in
  `postMergeCleanup`; the token becomes `classifyMergeError`'s result.
- **`KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL=1`** — force the `push_upstream` step to throw.
- **`KAOLA_WORKFLOW_DEBUG_CWD=path`** — sink-merge writes its final `process.cwd()` to the path on
  exit, so a test can verify CWD restoration after worktree removal.
- **`KAOLA_GH_MOCK_SCRIPT`** — honored by both `claim.js` and `sink-merge.js`, so the receipt paths
  are testable without a live forge CLI.

## Module Exports

### GitHub edition

**`scripts/kaola-workflow-claim.js`** — `getCoordRoot(root)` derives the coordination root:
`<repo>/.git/kaola-workflow/` when `.git` is a directory, else `<repo>/kaola-workflow/` for a
worktree. Also exports `mainRootFromCoord`, `resolveMainRoot`, `resolveSessionMarker`,
`claimProject`, `claimExplicitTarget`, `claimExplicitBundle`, `buildClosureReceipt`,
`checkClosureInvariants`, `verifyArchiveComplete`, `archiveProjectDir`, `appendClosureBlock`,
`removeWorktree`, `provisionWorktree`, `readActiveFolders`,
`readPriorityConfig`, `treeDirty`, `commitDiscardArchive`, and the label/worktree maintenance
commands.

**`scripts/kaola-workflow-sink-merge.js`** — `classifyMergeError(error)`, plus the sink transaction
primitives.

**`scripts/kaola-workflow-run-chains.js`** — `main`, `KNOWN_CHAINS`, `CHAIN_COMMANDS`,
`resolveChains`, `resolveTimeoutMs`, `resolveConcurrency`, `resolveChainRetry`, `runChainWithRetry`,
`resolveOutputPath`, `getGitTopLevel`, `classifyScope`, `resolveDiffBase`, `computeChangedFiles`,
`forgeReferencedScripts`, `isEditionCouplingPath`.

**`scripts/kaola-workflow-ledger-compare.js`** — `countComplete(missionListText)`,
`compareLedgers(srcText, destText)`. Record-regression guard for the finalize Step-8a artifact
mirror: fails closed only when the destination `mission-list.md` records strictly more
`status: done` items than the source about to overwrite it, fail-open otherwise. Forge-neutral
(byte-identical across editions); required by `kaola-workflow-claim.js`.

### GitLab edition

**`kaola-gitlab-workflow-sink-merge.js`** — `classifyMergeError(error)` (same contract as GitHub,
plus the `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` hook), `closeLinkedIssue(root, project, issueIid,
opts)`, `fastForwardMain(args, opts)`, `finalValidationPassed(root, project)`,
`runDirectMerge(args, opts)`.

**`kaola-gitlab-workflow-claim.js`** — `getCoordRoot(root)` (same contract); `cmdSinkFallback()`
checks both the live folder and the archive before updating state, returning
`{updated: false, reason: 'project archived'}` rather than recreating an archived project.

### Gitea edition

**`kaola-gitea-forge.js`** — `teaExec(args, opts)` (validates tea ≥ 0.9.2; honors
`KAOLA_WORKFLOW_OFFLINE=1`; accepts an injected `execFileSync`), `labelsOf`, `uniqueLabels`,
`preserveWorkflowLabels`, `normalizeState`, `normalizeProject`, `normalizeIssue`,
`normalizePullRequest`, `discoverProject`, `listIssues`, `viewIssue`, `updateIssueLabels`,
`closeIssue`, `createIssueComment`, `listIssueComments`, `updateIssueComment`, `createPullRequest`,
`viewPullRequest`, `listPullRequests`, `mergePullRequest` (passes `opts.sha` as `head_commit_id`),
`checkServerVersion` (Gitea ≥ 1.17), `checkRepoSquashEnabled`, `ensureLabel`.

**`kaola-gitea-workflow-sink-pr.js`** — `ensurePullRequest(args, opts)` creates or reuses a PR and
returns `{pr, project}`, updating the `## Sink` block with `pr_url`, `pr_number`, `full_name` and
`project_html_url`.

**`kaola-gitea-workflow-sink-merge.js`** — `classifyMergeError(error)`, `closeLinkedIssue(root,
project, issueIid, opts)`, `fastForwardMain(args, opts)`, `finalValidationPassed(root, project)`,
`runDirectMerge(args, opts)`, `assertBranchHasNonWorkflowChanges(...)`.
