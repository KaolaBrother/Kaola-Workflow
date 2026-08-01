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
| `/workflow-init` | bootstrap a repository: `CLAUDE.md`, roadmap tracking, docs structure, issue conventions |
| `/workflow-next` | select, claim, write the mission list, run it |
| `/kaola-workflow-finalize` | validate, dock docs, summarize, close, archive, commit, sink |

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
         [--runtime claude|codex|opencode] [--sink merge|mr|pr] [--keep-worktree]
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
| `target_unverified` | `answer` | 0 | offline, and no local `.roadmap/issue-N.md` and no active folder for the target |
| `target_indeterminate` | `answer` | 0 | the classifier subprocess faulted transiently (spawn error, signal, timeout) through all 3 attempts. A clean non-zero exit is determinate and reports `target_unavailable` instead. `reasoning_class` is `classifier_error` |
| `dirty_tree_refused` | `consent` | 1 | in-place claim (`KAOLA_WORKTREE_NATIVE=0`) onto a dirty tree. The subject is the user's own uncommitted work, so it asks: carries an `ask` plus `options: ['commit','stash','worktree']`. An unprobeable tree reads as dirty |
| `acquired` / `owned` | — | 0 | the folder is yours |

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
author the commit and re-run), and it owns the worktree→main project-folder sync itself.

### `finalize --check` — one read-only pass

Evaluates **every** precondition in one pass and reports all of them together, so N unmet
preconditions come back from one invocation instead of one per re-run. Zero side effects.

```json
{ "project": "issue-N", "ok": true, "checks": {}, "reasons": [] }
```

`checks` carries `mirror`, `workflow_state`, `implementation_commit`, `staging_guard`, `validation`,
`changed_paths`, `dirty_paths`. `reasons` carries the most specific token per unmet precondition and
is empty when the run is finalize-ready. Nothing short-circuits: a failed rung never hides a later
one. `validation` is reported as state, never as a reason — it stopped being a precondition when it
stopped being a verdict.

### The two reports

`probeFinalizeValidationGate` takes two measurements. Neither refuses, and both land in two places —
the emitted envelope and, durably, `kaola-workflow/{project}/finalization-summary.md`. The durable
half is not optional: a conversion that emits a finding and drops the state the refusal was freezing
is a deletion, not a conversion.

| Envelope field | Durable heading | Content |
|---|---|---|
| `validation` | `## Validation` | the typed chain-receipt finding from `adaptiveSchema.evaluateChainReceipt`, computed **in process** — no subprocess, no plan file |
| `changed_paths` | `## Changed Paths` | `adaptiveSchema.changedPathsSinceBase(root, base, project)` — `git diff <base>...HEAD --name-only` minus the bookkeeping band |

`changed_paths_probe` is added to the envelope only when it is not `measured`; `unavailable` means
the branch diff could not be enumerated, which is reported as "not measured", never as a verdict
either way.

**Nothing compares `changed_paths` against a declaration, because there is no declaration.** This
used to be an attribution sweep against declared write sets that refused the remainder. Declared
write sets are gone, and a mission-list `result` is free text, not a path set — parsing one back
into one would re-invent the declaration. The comparison went; the measurement stayed, so a reader
can see what moved and notice what does not belong.

### Finalize envelope

```json
{
  "status": "closed",
  "roadmap_source_removed": "removed|absent|kept|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "archive_state_stamped": "not_needed|repaired|failed",
  "issue_disposition": "kept-open|close-pending|closed|unknown",
  "validation": { "classification": "chains_green", "green": true, "mode": "chain-receipt" },
  "changed_paths": ["scripts/foo.js"],
  "closure_receipt": {},
  "closure_invariants": { "ok": true, "violations": [] },
  "finalize_transaction": {}
}
```

- `archive_state_stamped` reports the manual-archive backstop: `repaired` when finalize healed a
  state archived by hand (live folder absent, `status: active` in the archive) by stamping it
  terminal in place; `not_needed` on the normal lane or an already-terminal archive.
- `issue_disposition` is DECISION-derived on `cmdFinalize`: `kept-open` under `--keep-open`,
  `closed` when the remote probe already observed the issue closed (a finalize re-run after
  sink-merge), else `close-pending` — the default merge lane, where the sink closes the issue after
  finalize, so finalize never asserts a false `closed`.

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
| `--project <issue-N>` | write the receipt to `kaola-workflow/<issue-N>/.cache/chain-receipt.json`, resolved against the git top-level so it lands identically from the worktree root or the repo root |
| `--plan <path>` | write the receipt to `<dir-of-path>/.cache/chain-receipt.json`. A legacy path-derivation alias; `--project` is the flag to use |
| `--output <path>` | explicit override; default is `<cwd>/.cache/chain-receipt.json` |
| `--mock-chain <name>:<script>` | test hook: replace a chain's command with a shell script |
| `--json` | emit `{ result, failed, receipt }` after completion |
| `--release-check` | the pre-tag gate; see below |

Receipt-path precedence: `--output > --plan > --project > cwd default`. **Pass `--project`**: the
bare cwd default lands the receipt at the worktree root, not under `kaola-workflow/<project>/`,
where the finalize measurement reads it.

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
reader can check the claim rather than take it on trust.

### `kaola-workflow-validation-runner.js`

The owned local gate for a consumer repo. Runs in a scrubbed environment, binds
executable/toolchain and candidate identity, and reduces repeated runs to `pass`, `fail`, or
`inconclusive`.

```
kaola-workflow-validation-runner.js run --command <command> --timeout-minutes <1..120>
    [--repo-root <path>] [--cwd <repo-relative>] [--repetitions <1..5>]
    [--env-allowlist <A,B>] [--output <path>]
kaola-workflow-validation-runner.js qualify-local --contract-hash <sha256> --context-hash <sha256>
    --claude-profile-hash <sha256> --codex-profile-hash <sha256> --invariant-classes <a,b>
    [--timeout-minutes <1..120>] [--output <path>]
```

Receipts land under `.cache/validation-vectors/`. Exit 1 when the outcome is not `pass`.

## Sink API

### Merge sink

- **Script**: `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` /
  `kaola-gitea-workflow-sink-merge.js`.
- **`--sink` mode** is one resumable transaction: preflight (pure read; names any foreign dirt with
  zero mutation, auto-stashes the claim-time `.roadmap/issue-N.md`) → push branch → rebase onto the
  mainline → run the validation chains → fast-forward merge (with a bounded race retry,
  `MAX_AUTOMERGE_RETRIES=3`) → push mainline → close the issue idempotently → archive → clean up.
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

**Pre-merge guards** (all three editions):

- **Live workflow-state guard** (`assertNoLiveWorkflowFolder`) — refuses to merge a branch whose
  HEAD still contains `kaola-workflow/{project}/workflow-state.md`, inspected with
  `git cat-file -e HEAD:{path}` (committed tree state, not just the filesystem).
- **Unpushed-commits guard** (`assertBranchPushedToUpstream`) — blocks when the feature branch has
  commits ahead of its upstream, or has no upstream tracking ref. Skipped when
  `KAOLA_WORKFLOW_OFFLINE=1`.
- **Workflow-artifacts-only guard** (`assertBranchHasNonWorkflowChanges`) — refuses a branch whose
  entire diff versus the mainline is `kaola-workflow/**` artifacts, turning silent implementation
  loss into a loud, recoverable failure. Skipped when the mainline is unresolvable — it cannot
  judge, so it does not block.
- **`worktree_dirty`** — `sinkPreflight` runs `assertWorktreeClean` before the merge step
  force-removes the linked worktree, so uncommitted work is never silently destroyed. Fail-closed:
  a dirty **or** unprobeable worktree refuses, with zero mutation and the worktree intact.
  Resume-safe — an already-removed worktree matches no `worktree list` block and passes.

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

**`sink_incomplete` refusal shapes**, discriminated by `step`:

| `step` | Meaning | Recovery |
|---|---|---|
| `push_upstream` | `git push -u origin <branch>` did not verifiably reach parity with its upstream; the branch may not be backed up | the step is left NOT done, so a re-run retries it |
| `finalize` | archiving the project folder would lose files the source held; `missing` names them. Fires **before** any archive mutation, so the live folder is not deleted | restore the evidence and re-run |
| `push_main` | the fast-forward landed locally but pushing the mainline threw | branch preserved; resolve the push fault and re-run |
| `closure` | at least one issue could not be closed, or an exit-0 close could not be verified | the step is left NOT done, so a re-run retries it |

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

This is a **report, not a guard**. The preflight exemption above is a directory prefix, so a stray
file under the run's own archive directory is committed along with finalize's mirror, and the sink
does not attempt to tell one from the other: the archive copies a folder that is untracked in main
and committed nowhere, so git holds no record of what belongs, and a basename allowlist cannot work
when archives carry arbitrarily-named orchestrator artifacts. The listing is uniform by design — it
makes the commit visible, it does not prevent it, and the orchestrator adjudicates.

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
- `cmdSinkPr` emits no closure receipt — the authoritative receipt for a `sink: pr` project is
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
before roadmap regeneration or removal, remote issue or label disposition, worktree/branch/claim
cleanup, terminal receipt stamping, or success output. Thrown errors, `archive_incomplete`, missing
fields, and every other result shape stop with the live authority preserved.

### Closure invariants

For a completed linked issue N:

1. `kaola-workflow/.roadmap/issue-N.md` is absent.
2. Generated `kaola-workflow/ROADMAP.md` does not list `#N` as active work.
3. `kaola-workflow/{project}/` is absent from active folders.
4. `kaola-workflow/archive/{project}/workflow-state.md` exists with `status: closed` and
   `step: complete` when a local archive is available.
5. The remote issue is closed only after acceptance passes and implementation is published.
6. The remote issue does not carry `workflow:in-progress` after closure.
7. Any branch or worktree cleanup is either complete or explicitly reported by the stale-worktree
   tooling.

`checkClosureInvariants(root, receipt, archiveDest)` checks them as named violations:

- `roadmap-source-absent` — invariant 1.
- `roadmap-mirror-clean` — invariant 2, row-anchored: only an active table row `| #N | …` at line
  start violates; cross-references to `#N` inside other rows are allowed after closure.
- `roadmap-residue-clean` — `roadmap_residue` is empty after roadmap reconciliation. A non-empty
  residue means a `.roadmap/issue-*.md` source survived finalization in one of the cleaned roots.
- `in-progress-label-removed` — invariant 6. Skipped, not violated, when `KAOLA_WORKFLOW_OFFLINE=1`
  or when `claim_label_removed` is `skipped_offline`.
- `active-folder-absent` — invariant 3.
- `archive-state-closed` — invariant 4; skipped when `archiveDest` is absent.
- `branch-worktree-resolved` — neither `worktree_removed` nor `branch_removed` is `failed`.
- `remote-members-closed` — for a bundle, every member of `issue_numbers` is closed. A member left
  in `failed_issue_closures` or `open_issues` while online is a violation. Never fires for
  single-issue receipts.

`ok` is `true` only when `violations` is empty.

**Keep-open inversion.** When the receipt records `keep_open_requested: true`,
`checkClosureInvariants` REPLACES invariants 1 and 2 with their inverse under the single name
`keep-open-roadmap-preserved`: `kaola-workflow/.roadmap/issue-N.md` MUST be preserved and the
regenerated `ROADMAP.md` MUST still list `#N`. Invariants 3, 4, 6 and 7 apply unchanged. The
inversion keys on the recorded **intent**, not on the mutable `remote_issue_closed` token, which
flips to `already_closed` when the issue was auto-closed on the forge.

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
  "roadmap_source_removed": "removed|absent|kept|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "roadmap_removed": { "/path/to/main/root": ["issue-42.md"] },
  "roadmap_residue": [],
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
- `anchored_root`, `roadmap_removed`, `roadmap_residue` and `closure` are attached **after**
  `buildClosureReceipt()` returns, because the builder filters by `CLOSURE_RECEIPT_FIELDS`.
- `roadmap_removed` — per-root map of `.roadmap/issue-*.md` filenames removed. Keys are absolute root
  paths; a worktree run carries two.
- `roadmap_residue` — absolute paths of sources that could NOT be removed. **Attached only when
  non-empty**; its absence is the clean case.
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
- `roadmap_source_removed` records `kept` — `archiveProjectDir` skips the unlink, and `ROADMAP.md`
  is regenerated still listing `#N`. The `closure-audit` `archive_closed` stale-source class
  excludes a `status: closed` archive carrying `issue_action: comment_keep_open`, so `--execute`
  never deletes the preserved source.

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
  "open_issues": [],
  "roadmap_sources_removed": ["issue-42.md", "issue-47.md", "issue-53.md"]
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
the watchers set `branch_removed: 'kept'`. `sink-merge` derives `archive` and
`roadmap_source_removed` by probing post-conditions (finalize already archived);
`roadmap_regenerated` is `skipped` because it does not regenerate the mirror. The exit-3
merge-impossible fallback returns before any receipt is emitted.

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
mandatory after closure (invariants 1, 2); **#163** guaranteed `workflow:in-progress` label cleanup
(invariant 6) and added the `audit-labels` / `repair-labels` subcommands; **#164** unified closure
execution behind the shared receipt (invariants 1–4, 6, 7); **#165** added the closure audit and
repair command for drift detection. GitLab and Gitea ports followed in #166 and #167.

## Closure audit and repair — `kaola-workflow-closure-audit.js`

Reports **closure drift** — completed work that still shows as active — across local roadmap
sources, the generated `ROADMAP.md`, active folders, archive state, remote issue state, and the
`workflow:in-progress` label. A dedicated script, not a `claim.js` subcommand.

```bash
node scripts/kaola-workflow-closure-audit.js             # dry-run: report drift as JSON, change nothing
node scripts/kaola-workflow-closure-audit.js --execute   # repair safe local drift
```

| Key | Meaning |
|-----|---------|
| `stale_roadmap_sources` | `.roadmap/issue-N.md` exists for a closed issue. `reason` is `closed_remote` (closed on the forge) or `archive_closed` (an archive says `status: closed` but the source survives). `closed_remote` wins when both apply |
| `mirror_lists_closed_issues` | Generated `ROADMAP.md` still lists a closed issue |
| `stale_in_progress_labels` | Closed remote issues still carrying `workflow:in-progress` |
| `active_folder_for_closed_issue` | An active folder whose linked issue is closed. `dirty` flags uncommitted content. **Report-only** |
| `unarchived_pr_folders` | An active `sink: pr` folder whose PR is MERGED/CLOSED but was never archived. **Report-only** |
| `archive_content_incomplete` | An archived run whose folder is missing a required artifact. **Report-only in both modes**, and identical offline |
| `unresolved_closed_state` | (omitted when empty) Issue numbers whose closed state could not be determined because the remote check timed out or failed. Present in both `drift` and `counts` |

**Safe-repair boundary.** `--execute` only ever (1) deletes stale `.roadmap/issue-N.md` sources,
(2) regenerates `ROADMAP.md`, and (3) removes `workflow:in-progress` from closed issues when online.
It **never** deletes active folders or worktrees. The report-only classes are carried verbatim into
`reported_not_repaired` in both modes — they may hold un-finalized work.

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
| **Surface** | roadmap sources, `ROADMAP.md`, active folders, archive state, remote issue state, advisory labels (invariants 1, 2, 3, 5, 6) | Git worktrees and branches (invariant 7) |
| **`--execute` repairs** | stale `.roadmap` sources, mirror regeneration, stale labels | removes worktrees and deletes local branches |
| **Never touches** | worktrees, branches, **active folders** | roadmap sources, `ROADMAP.md`, labels, archive folders |

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

## Roadmap Operations — `kaola-workflow-roadmap.js`

Manages the local roadmap mirror (`kaola-workflow/ROADMAP.md`) and per-issue metadata files
(`kaola-workflow/.roadmap/issue-{N}.md`).

| Subcommand | Contract |
|---|---|
| `generate` | regenerate `ROADMAP.md` from `.roadmap/issue-*.md` sources alone. **Makes no remote call.** Atomic write-replace; no change = no-op. Guards against replacing a non-empty generated ROADMAP when `.roadmap/` is missing |
| `validate` | assert `ROADMAP.md` is current with its sources. Exit 0 on match; exit 1 plus a remediation message when stale |
| `validate-remote` | the only subcommand that touches the forge. Iterates `.roadmap/issue-*.md` marked `status: open` and checks whether each is closed remotely. Exit 0 when clean; exit 1 with remediation on drift. Skips all network calls under `KAOLA_WORKFLOW_OFFLINE=1` |
| `migrate` | one-time: parse the current `ROADMAP.md` table and create per-issue sources. Skips existing files. GitLab and Gitea swap this for `refresh` |
| `init-issue --issue N [--title] [--status] [--workflow-project] [--next-step]` | create one `.roadmap/issue-{N}.md`. Exclusive creation — fails if the file exists |
| `project-name --issue N` | print the `workflow_project` field from `.roadmap/issue-{N}.md`. Exit 1 if the field is missing or `—` |

**Closure cleanup is automatic.** When an active folder is finalized (`cmdFinalize`) or archived
after a PR merge (`watch-pr` on MERGED), closure removes the corresponding `.roadmap/issue-{N}.md`
and regenerates `ROADMAP.md`. Scoped to closed-status archives only; abandoned folders leave the
entry untouched so the issue can be reopened. Finalizing from a linked worktree stages only the
finalized project's own paths — its `kaola-workflow/archive/<project>/` band, the live-folder→archive
rename, `kaola-workflow/.roadmap/`, and `kaola-workflow/ROADMAP.md` — rather than a broad
`git add -A kaola-workflow/`, so a stray foreign archive folder is never swept into the commit.

**Exports:** `regenerateRoadmap(root)` (returns `'generated'` or `'up-to-date'`; prints nothing),
`validateRemote(root)`, `readRoadmapIssues(dir)`, `roadmapDir(root)`, and
`buildRoadmapContent(issues, dir)`. When `dir` is provided and `<dir>/_rules.md` is non-empty, its
contents are appended to the Rules section under `### Project rules`; all call sites within a script
must thread `dir` consistently so `generate` output matches the `validate` recomputation.

## Run-gap sweep — `kaola-workflow-gap-sweep.js`

```
Usage: kaola-workflow-gap-sweep.js --project <name> [--json] [--check]
                                   [--summary <path>] [--output <path>] [--offline]
```

Two modes. The **scanner** (default) scans the run's `.cache/` for gaps the run itself discovered
and writes `.cache/run-gaps.json`. The **gate** (`--check`) verifies every swept gap is mapped in
`finalization-summary.md` `## Run gaps`, one line each, either `filed: #N` or
`noise: <justification>`. An orchestrator-authored row the scanner never observed is added to
`.cache/run-gaps-manual.md` and re-swept, so what is written was actually swept.

## Telemetry — `kaola-workflow-telemetry-report.js`

```
usage: kaola-workflow-telemetry-report.js --project <name> [--json]
```

Ranks the recorded outcome population of one project by measured interruption cost, reading
`.cache/{outcome-log.jsonl, node-timings.jsonl, dispatch-log.jsonl}`. An **answer verb**: exit 0
always, writes nothing, never refuses. An absent sidecar is the ordinary case (all three writers are
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
| `kaola-workflow-install-manifest.js --forge=<github\|gitlab\|gitea> (--scripts\|--hooks)` | the single source of the support-file list an installer copies. Prints one name per line. Exits 2 on an unknown argument, a missing flag, or an **empty** list — an empty manifest would copy zero support files, so it refuses rather than silently installing nothing. Exports `SUPPORT_SCRIPTS`, `SUPPORT_HOOKS`, `FORGES`, `supportScripts`, `supportHooks`, `renameIfPorted` |
| `edition-sync.js (--check \| --write \| --materialize-kernel)` | materializes the rename-normalized edition copies from the canonical tree and the byte-identical kernel into each edition. `--check` is the read-only verdict |
| `validate-script-sync.js` | enforces cross-edition parity, including `BYTE_IDENTICAL_GROUPS`, which auto-expands when a new `.toml` is added to the codex tree |
| `sync-opencode-edition.js` / `sync-kimi-edition.js` | the additive runtime editions; not wired into `npm test` or the forge chains |
| `kaola-workflow-codex-preflight.js` | verifies the installed Codex plugin, agent profiles and managed hook entries against their sources |

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

There is **no install-written agent model manifest**. `install.sh` deletes a pre-existing
`~/.claude/agents/.kaola-agent-models.json` on upgrade and never reads one. `KAOLA_AGENT_DIR` is
respected when set.

`resolve-agent-model` resolves in three steps: **explicit model from the caller → frontmatter (when
not `inherit`) → `DEFAULT_AGENT_MODELS`**, falling back to `''` only when no step answers. For an
installed agent the frontmatter step is inert, because install rewrites every installed agent's
frontmatter to `model: inherit`. It governs exactly one case: an ad-hoc dispatch against this
repository's source `agents/` tree. Each role's source frontmatter is therefore held byte-equal to
its `DEFAULT_AGENT_MODELS` entry (asserted by `test-agent-model-resolver.js`).

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

**`scripts/kaola-workflow-roadmap.js`** — see Roadmap Operations above.

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

**`kaola-gitlab-workflow-roadmap.js`** — `regenerateRoadmap(root)`, `validateRemote(root)`.

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

**`kaola-gitea-workflow-roadmap.js`** — `regenerateRoadmap(root)`, `validateRemote(root)`.
