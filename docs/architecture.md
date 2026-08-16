# Architecture

System boundaries, major components, data flow, and durable state. Read it as the anatomy of an
engineered agent loop: what the orchestrator owns, what the scripts own, and what survives a crash.

## The shape of a run

Kaola-Workflow is bookkeeping for an orchestrating agent. It does not schedule the agent's work,
inspect its decomposition, or judge its output. One command carries a run end to end:

```text
claim ──► write the mission list ──► run it ──► finalize ──► sink
(script)   (agent, one file)          (agent)    (script tx)  (script tx)
```

- **`/workflow-init`** — bootstraps a repository: `CLAUDE.md` guidance, docs structure, issue
  conventions. Run once per project. It also reconciles: a repository still carrying the retired
  local backlog layer (`ROADMAP.md`, `.roadmap/issue-*.md`) is diagnosed and reported, and migrated
  only on the owner's answer — never as a side effect of installing or upgrading.
- **`/workflow-next`** — the whole workflow. Selects the target, claims it, writes
  `kaola-workflow/{project}/mission-list.md`, and runs it.
- **`/kaola-workflow-finalize`** — validates, docks documentation, writes the summary, settles
  closure, archives, commits, and sinks.

Everything between the claim and finalization is the orchestrator's. It decides what to decompose,
what to dispatch, at what width, and in what order, with the frontier in front of it — and nothing
inspects that decision. There is no plan grammar, no freeze, no gate, no disjointness proof, no
fan-out cap, and no refusal in the run design. See `decisions/0017-the-mission-list.md` for the
derivation.

## The mission list

One file per run at `kaola-workflow/{project}/mission-list.md`. An H1 carrying the goal, then one
entry per mission with four fields:

| Field | Content | Written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

No script writes it; the orchestrator does, at three moments. Work the orchestrator does itself is
still an item, with `dispatched: self`.

The frontier is not computed — it is the list minus done minus in-flight, visible by reading. An
item carries no role, no write set, no dependency edge, no model, no cardinality and no shape,
because all of that is decided when the item is reached, with everything learned by then.

**Resuming** is reading the file top to bottom: the H1 is the goal, `done` items and their `result`
are what is known, `todo` items are what remains, and `in-flight` items are the only decision. The
rule there is *look for the work, not for the worker*: `dispatched` records what went out, not
whether it is still running, so check the locator — if the promised output landed, close the item;
if not, re-dispatch unless the dispatch is positively still alive.

This design exists because of one observed failure: an orchestrator running six concurrent subagents
from context alone lost all six at once to a usage limit, and with them what was in flight and what
remained. Content survived, because git already is the content record. Coordination state did not,
because it lived only in a process. So coordination state lives where content already lives — on
disk.

### What was deleted, and what it cost

The node/DAG executor is gone: the plan grammar and its four shapes, `select()`, the frozen
`workflow-plan.md` and its `## Node Ledger`, `plan_hash` and the freeze chain, roles and the role
manifest, `depends_on`, declared write sets, the post-dominance gates, the antichain disjointness
sweep, the S1/S2/S3 serializer taxonomy, fan-out caps, expansion and re-expansion, re-plan epochs,
per-node barrier baselines and evidence-binding nonces, the running-set scheduler, the durable
consent valve, and every typed refusal in the run design.

Three losses are accepted rather than replaced, and are named here so they are not discovered later
as surprises:

- **The `upstream_read` consumed-proof has no analogue.** Nothing detects an item that ignored its
  predecessor's findings. Any list-form replacement would be a role/edge system in disguise.
- **Per-role evidence richness went with the role registry.** Evidence is free-form now: whatever
  the `result` field points at.
- **Early scope-violation detection went with declared write sets.** A violation is noticed when a
  reader looks — at the finalize `## Changed Paths` report, or in review — not one node later.

**Consent is conversation.** Irreversible and value-laden calls belong to the user: ask, in
conversation, before taking one. There is no durable valve and nothing collects an approval on
anyone's behalf, so that rule in prose is the whole mechanism. It appears in all three commands and
their Codex SKILL twins; losing that sentence is losing the mechanism.

## Claim and coordination

`kaola-workflow-claim.js` owns the atomic bookkeeping around a run. The claim records which issues,
branch and worktree the run owns, in `kaola-workflow/{project}/workflow-state.md`, so a successor
knows what is already in flight.

**Claiming is bookkeeping, not a gate.** A missing target, both target forms at once, an
unreachable forge, an unverifiable offline target, and a classifier that will not answer are all
findings on the emitted envelope at exit 0 with `claim: 'none'` — never a third door. The caller
acts on the fact: fix the argument, retry, work offline, or claim something else. The one claim-time
stop is a dirty working tree, and that is a consent question about the user's own uncommitted work.

**Worktrees are tools.** By default a claim provisions a repo-local worktree at
`<repo-root>/.kw/worktrees/<project>/` and records its absolute path as `worktree_path`. Set
`KAOLA_WORKTREE_NATIVE=0` to create the feature branch in place instead. Either way the run
finishes; declining the worktree costs isolation, not correctness.

### Concurrent same-repo sessions

Two mechanisms harden concurrent sessions in one checkout: a **single main-root authority** and a
**four-bucket lane classifier**.

`getCoordRoot`, `mainRootFromCoord` and `resolveMainRoot` are defined once in
`kaola-workflow-adaptive-schema.js` (the byte-identical cross-edition drift anchor) and re-exported
by `kaola-workflow-claim.js`. `writeState` computes `resolveMainRoot(root)` once at claim time and
writes `main_root:` into the `## Sink` block, so a caller launched from a linked or detached
worktree reads one authority instead of re-deriving from cwd.

`classifyLane(lane, ctx)` (`kaola-workflow-classifier.js`) is a pure function partitioning an
active-folder lane into `mine` / `live` / `stale` / `ambiguous`, driven by three claim-time fields
(`session_marker`, `claim_ts`, and `LANE_STALENESS_MS`). All three are written once at
claim time; there is no heartbeat. `cmdStatus` annotates each folder with its bucket; `cmdResume`
excludes `live` lanes and asks on `ambiguous`. See `workflow-state-contract.md` § Lane
classification for the precedence ladder.

The clean-worktree checks (`assertWorktreeClean` in `sink-merge.js`, `treeDirty` in `claim.js`)
apply `isParkedLanePath(relPath, ownedProjects)` on top of the existing fail-closed handling, so
another lane's scratch under the `PARKED_LANE_PREFIXES` paths (exported from
`kaola-workflow-adaptive-schema.js`) does not read as dirt. Real code and shared durable state stay
strict, and an unverifiable tree still reads as dirty.

## Validation

Validation is **self-owned**: a run completes on a repo with no CI/CD configured, with no
degradation, and no external pipeline is ever a gate. The repo kind is detected, never configured.

- **Self-host** — the repo's own `package.json` declares `test:kaola-workflow:*` scripts.
  `kaola-workflow-run-chains.js` runs the four edition chains as real subprocesses (capturing real
  exit codes, not shell-pipe status) and writes `.cache/chain-receipt.json`, stamped with the head
  SHA, a worktree-clean marker, and a `codeTreeHash` content address.
- **Consumer** — no such scripts. The agent owns verification: it runs the project's own validation
  command and records `.cache/final-validation.md` with a column-0 `verdict: pass` and a
  `validated_candidate_hash` bound to the tree.

`adaptiveSchema.evaluateChainReceipt(root, opts)` reads whichever applies, in process, and returns a
typed **finding** — `chains_unverified > chains_stale > chains_empty > chains_red > chains_green` on
the self-host arm, `final_validation_unverified > final_validation_failed >
final_validation_unbound > final_validation_stale > chains_green` on the consumer arm, and
`repo_kind_undetermined` when the repo kind itself cannot be established. Freshness keys on a
code-tree hash that deliberately excludes documentation and run state, so a doc edit does not
invalidate a receipt — with an exception list (`SELF_HOST_TEST_CONSUMED`) for the prose files this
repo's own chains read as input.

**The finding is a measurement, not a verdict.** Finalization reports it on the envelope under
`validation` and writes it durably into `finalization-summary.md` under `## Validation`, and the
orchestrator owns the outcome: re-run the chains, fix the red, or proceed knowingly and say which
case it was in. That is not a weakening of "own your own verdicts" — the answer still comes from
this workflow's own chains rather than from a system it does not own; it is handed to the party
accountable for the result instead of enforced against them.

`kaola-workflow-validation-runner.js` is the local owned gate for a consumer repo: it runs a
declared command in a scrubbed environment, binds executable/toolchain and candidate identity,
repeats it, and reduces the runs to `pass`, `fail`, or `inconclusive`. No hosted service is required
to decide completion.

### The one remaining refusal: the release gate

`kaola-workflow-run-chains.js --release-check` is a check-only pre-tag gate, hosted in the file that
produces the receipt it reads. It runs no chain, writes nothing, and contacts no forge. It is
strictly tighter than the finalize measurement:

- strict `headSha` equality against the candidate (default `HEAD`); the `codeTreeHash` relaxation
  does not apply to a tag, which names an exact commit;
- a missing or `unknown` `headSha` refuses `chains_stale`;
- a receipt stamped over a dirty worktree refuses;
- **any** waived chain refuses `chains_waived` (a waiver is legal at finalize, never for a tag);
- the receipt must cover the full declared chain set, or `chains_incomplete`;
- an unresolvable chain set fails closed to `repo_kind_undetermined` rather than passing a vacuous
  coverage check.

Typed precedence: `chains_unverified > chains_stale > chains_empty > repo_kind_undetermined >
chains_incomplete > chains_red > chains_waived`. Exit 0 on pass, 1 on any refusal.

## Finalization and sink

### The finalize transaction

`kaola-workflow-claim.js finalize --project P` is one resumable script transaction: the
worktree→main artifact mirror, the archive-and-status close, roadmap staging, and the
`chore: finalize {project}` commit gate. Atomicity belongs to the script; judgment stays with the
orchestrator.

`finalize --check` evaluates every precondition in one read-only pass and reports all of them
together — mirror, `workflow_state`, `implementation_commit`, `staging_guard`, `validation`,
`dirty_paths` — so N unmet preconditions come back from one invocation instead of one per re-run.
Nothing short-circuits; a failed rung never hides a later one. `validation` is reported as state,
never as a reason.

Three measurements ride the emitted envelope and are written durably into
`finalization-summary.md`, and the durable half is not optional — a conversion that emits a finding
and drops the state the refusal was freezing is a deletion, not a conversion:

- **`validation`** → `## Validation`: the typed chain-receipt finding above.
- **`changed_paths`** → `## Changed Paths`: `git diff <base>...HEAD --name-only` with the
  bookkeeping band removed (`docs/**`, repo-root `CHANGELOG.md` / `README.md`, and
  `kaola-workflow/**`). Nothing compares that list against a declaration, because there is no
  declaration to compare it to. It is there so a reader can see what moved and notice what does not
  belong.
- **`mission_list`** → `## Mission List`: how many missions the run's own record holds, and the
  `item:` line of every one carrying an outcome while its `status` is not `done`. A run that wrote
  no record measures nothing and says nothing; a record that agrees with itself still reports. The
  record is read and never repaired, and the finalize is unaffected either way — what to do about a
  contradiction is the reader's call.

The transaction never authors the implementation commit, and it owns the worktree→main project
folder sync itself. The archive still fails loudly if it would lose a file — an operation refusing
to destroy data, which is the one hard stop left in this phase.

### Merge sink (default)

The steps are `SINK_STEPS`, in this order. **The archive happens at `finalize`, before the mainline is
pushed and before the issue is closed** — that ordering is load-bearing, not incidental: an archive
that did not happen stops the transaction while the run record is still unpublished and the issue
still open, which is only possible because nothing has been pushed or closed yet.

```text
Final commit on feature branch
    ↓
preflight        pure read; names any foreign dirt
    ↓
push_upstream    push the feature branch to origin
    ↓
merge            fetch, rebase onto origin/<default>, run the validation chains over the rebased
                 tree, then fast-forward merge with a bounded race retry
    ↓
finalize         archive the project folder — CONFIRMED, not assumed. An archive that was required
                 and did not happen stops here with sink_incomplete, before anything is published
    ↓
stash_restore    no-op today — kept for receipts an older sink left mid-run with a stash to pop
    ↓
archive_commit   stage and commit the archive at its actual destination
    ↓
push_main        push the default branch
    ↓
closure          close the issue idempotently, verified live
    ↓
clean up branch and worktree, dispose the journals
```

`.cache/sink-receipt.json` tracks each step so a re-run resumes from the last incomplete one without
double-applying. That receipt and `sink-fallback.json` are transaction journals: a terminally
successful sink deletes them itself, and a "clean and synced" check that finds one afterwards must
delete it, never commit it.

**The sink reports; the orchestrator owns the outcome.** It does not refuse and it does not decide.
It names what it found — content on the branch that no record describes, a witness bound to
different bytes, a merge that did not fast-forward — and the orchestrator resolves it. Three
resolutions are legitimate: get the merge correct (rebase and retry the fast-forward, the normal
answer when another lane merged first), resynchronize and re-run the sink so it resumes, or **file a
pull request instead** — a perfectly good resolution precisely because it stages content for review
rather than publishing it. Then clean up after the sink, own lane only.

This is not "merge anyway and report". The distinction that matters is not refuse-versus-proceed; it
is who is accountable for the branch ending up right. Under a refusal the answer was nobody, because
the door said no. Here it is the orchestrator, the only party with the context to fix it. A true
content conflict still halts and asks a human.

### PR sink (intent-based or fallback)

```text
Final commit ──► push branch ──► create PR/MR ──► record pr_url + pr_number in workflow-state.md
    ──► metadata follow-up commit (worktree clean, folder stays active)
    ──► next /workflow-next: watch-pr detects MERGED/CLOSED ──► archive the folder
```

Selection: a PR intent in the user's prompt sets `KAOLA_SINK=pr` before startup; otherwise
`sink: merge`. A merge sink that exits 3 (merge-impossible — branch protected, non-fast-forward,
permission denied) can pivot to a PR, except under keep-open, where a PR body's `Closes #N` would
close the issue the run deliberately kept open.

### Closure

`kaola-workflow-closure-contract.js` holds the machine-readable receipt schema; every closure path
(`cmdFinalize`, `watch-pr` / `watch-mr`, `sink-merge`) seeds a full receipt from `emptyReceipt()`
via `buildClosureReceipt()` and emits `closure_receipt` plus `closure_invariants`.
`kaola-workflow-closure-audit.js` is the after-the-fact drift detector: dry-run by default,
`--execute` repairs safe local drift and never deletes folders or worktrees. See `api.md` § Closure
Contract.

## Backlog

**The forge is the backlog — there is no local mirror of it** (`decisions/0018-the-forge-is-the-backlog.md`).
An issue's title, labels, and comments are what the work is; comments override the body where they
disagree. `claim.js list-open` returns the whole open issue list ordered by its bare `P0`–`P3`
priority-label tier, then by number — ordering, never selecting; the orchestrator still picks. Before
claiming, the pick step reads each shortlisted candidate's own body and comments (never the full
list). The one surviving local file is the optional `kaola-workflow/.roadmap/_rules.md`, for standing
project-local rules, read directly by the pick step.

## Editions and runtimes

**Four editions** ship the same workflow across three forge CLIs: the canonical GitHub
tree in `scripts/` plus `plugins/kaola-workflow/` (Codex), `plugins/kaola-workflow-gitlab/`, and
`plugins/kaola-workflow-gitea/`. Most scripts are rename-normalized copies —
`kaola-workflow-<name>.js` becomes `kaola-{forge}-workflow-<name>.js` — and `scripts/edition-sync.js`
plus `scripts/validate-script-sync.js` enforce that. `kaola-workflow-adaptive-schema.js` is the one
file held **byte-identical** across all four trees: it is the cross-edition drift anchor, and every
constant shared between a producer and a consumer lives there so the two cannot disagree.

**Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not wired
into `npm test`, `edition-sync.js`, `install.sh`, or the routing generator's render targets, but
their sync scripts derive their command surfaces from that same routing registry (via
`runtime-edition-forge.js`), so the `generate-routing-surfaces.js --write` that a routing-surface
change already mandates also brings every `.opencode`/`.kimi` tree already on the machine back into
parity — always the main checkout's trees, and never creating one that is absent. They carry their
own suites (`test-opencode-edition.js`, `test-kimi-edition.js`). See
`opencode-edition.md` and `kimi-edition.md`.

### Runtime capability divergence

Where the four runtimes differ, they differ **here** — one table, one place. Every cell is a **tier
label plus a pointer**, never a restatement of the mechanism: a restated fact rots away from its
source, and the re-derivation this table exists to end is exactly what a rotted copy causes. Read the
label for how much of the capability exists; read the pointer for what it is.

The labels: **full** — the shared mechanism covers this runtime directly · **partial** — covered,
with a limitation the pointer names · **rendered** — generated from a shared source, which the
runtime consumes and never authors · **substituted** — the runtime lacks the shared primitive, so the
workflow routes the capability through a different one · **inherited** — no control exists at any
level; the session's value carries.

**The forge axis multiplies two of the four columns.** claude and codex each ship against three
forges (github, gitlab, gitea), so a claude or codex pointer may resolve to three trees rather than
one — where it does, the pointer's own path says so, and where the artifact is forge-independent it
does not. opencode and kimi take `--forge` inside their own standalone installers instead. Runtimes
and forge editions are different axes; this table is indexed by runtime.

| | claude | codex | opencode | kimi |
|---|---|---|---|---|
| **dispatch carrier** | full — `agents/`; § Agent profiles below | full — `plugins/kaola-workflow/config/agents.toml` (registry); `plugins/*/agents/*.toml` | full — `docs/opencode-edition.md` § What gets generated | substituted — `docs/kimi-edition.md` § Roles as Skills; enforced by `KIMI_RUNTIME_NATIVE` in `scripts/test-kimi-edition.js` |
| **command / skill surface** | rendered — `scripts/generate-routing-surfaces.js` (`COMMAND_EDITIONS`); skeletons in `templates/routing/` | rendered — `scripts/generate-routing-surfaces.js` (`SKILL_EDITIONS`); skeletons in `templates/routing/` | rendered — `docs/opencode-edition.md` § Installer command set; consumes `commandSources()` via `scripts/sync-opencode-edition.js` | rendered — `docs/kimi-edition.md` § Installer command set; consumes `commandSources()` via `scripts/sync-kimi-edition.js` |
| **hooks** | full — `hooks/hooks.json`; merge at `install.sh` (`MERGE_SETTINGS`) | full — `plugins/*/config/hooks.json` (three trees, and unlike the other codex artifacts these differ per forge); merge at `plugins/*/scripts/install-codex-agent-profiles.js` | substituted — `docs/opencode-edition.md` § Hooks; `templates/opencode/plugins/kaola-workflow-hooks.js` | partial — `docs/kimi-edition.md` § Hooks; event mapping `docs/decisions/D-703-01.md` |
| **model & tier handling** | full — `scripts/kaola-workflow-resolve-agent-model.js` (header comment); shipped rule at `commands/kaola-workflow-finalize.md` § Agent Model Dispatch | full — `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` in `scripts/kaola-workflow-adaptive-schema.js`; every carrier copy and the guard binding them, `docs/conventions.md` § Bundle Lane | partial — `docs/opencode-edition.md` § Model and effort — inherited from the session | inherited — `docs/kimi-edition.md` § One model tier — every subagent inherits the session model; enforced by `KIMI_RUNTIME_NATIVE` in `scripts/test-kimi-edition.js` |
| **install path** | full — `install.sh` | partial — the split stated at `install-all.sh` (§ Codex marketplace-plugin convergence); profiles and hooks at `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` | substituted — `install-opencode.sh`; `docs/opencode-edition.md` § Deploy layout — project vs global (scope-dependent) | substituted — `install-kimi.sh`; `docs/kimi-edition.md` § Deploy layout — project vs global (scope-dependent) |

The label grades the capability, not the pointer. Two cells carry **two** pointers because one alone
loses half the fact: codex model & tier separates the source constants from the carrier set that
renders them, and kimi's dispatch carrier separates the readable description from the
machine-enforced declaration. The weakest pointer is claude's dispatch carrier: no prose names the
dispatch mechanism itself, so the first pointer is the directory, and § Agent profiles below carries
only what the profiles contain. claude and codex have no per-edition doc, which is why their cells
point at code where opencode's and kimi's point at prose.

**No `hooks.json` in any edition registers a `PreToolUse` or `PostToolUse` hook** — across all six
they register `SessionStart` and `SubagentStart` only, and
`docs/decisions/0011-oracle-test-and-kernel-extraction.md` establishes that absence. It is a statement
about that file family, which is claude and codex; it does not generalize to the additive editions,
and opencode's plugin does register a pre-tool event (`templates/opencode/plugins/kaola-workflow-hooks.js`).

### Agent profiles

Each role has a canonical `agents/<name>.md` (installed by `install.sh` for Claude) and a `.toml`
triple across the three plugin editions. Every Codex profile omits top-level `model` and
`model_reasoning_effort`; the dispatching workflow, rather than the profile, supplies the runtime
pair for each spawn. All three `.toml` twins for a profile are byte-identical and forge-neutral — no
CLI binaries, no forge brands.

`code-reviewer`, `adversarial-verifier` and `security-reviewer` are **generated**, not hand-authored:
their behavior lives in `templates/reviewers/behavior-contracts.json`, their closed tool/model
adapters in `templates/reviewers/runtime-adapters.json`, and `scripts/generate-reviewer-profiles.js`
is the sole writer of the rendered outputs. A shared `behavior_contract_hash` binds the
runtime-neutral core; each render's `resolved_profile_hash` binds its complete bytes. This proves
deterministic source and installed bytes — it does not make stochastic model findings identical.

For non-generated roles, adding a feature paragraph to an `agents/<name>.md` requires mirroring the
token into all three `.toml` twins before it can be pinned in `test-agent-profile-parity.js`;
`validate-script-sync.js` `BYTE_IDENTICAL_GROUPS` enforces byte identity across each triple.

Codex profile readiness is an install-time boundary. `install-codex-agent-profiles.js` is the
authoritative install/upgrade transaction and verifies its completed writes before success;
`kaola-workflow-codex-preflight.js --doctor` remains an explicit diagnostic. The live Codex
`next`/`finalize` routing surfaces do not re-certify persisted configuration on entry or resume.

### Model resolution

For Claude Code, there is no install-time model axis and no install-written manifest. `install.sh` deletes a
pre-existing `~/.claude/agents/.kaola-agent-models.json` on upgrade. The resolver
(`kaola-workflow-resolve-agent-model.js`) is:

```text
explicit model passed by the caller  ->  frontmatter (when not `inherit`)  ->  DEFAULT_AGENT_MODELS  ->  ''
```

**The frontmatter step is inert for an installed agent**: `install_managed_agent()` rewrites every
installed agent's frontmatter to `model: inherit`, and the step skips `inherit`. It governs exactly
one case — an ad-hoc dispatch against this repository's source `agents/` tree. Because that is a
real path, each role's source frontmatter is held byte-equal to its `DEFAULT_AGENT_MODELS` entry
(asserted by `test-agent-model-resolver.js`), so a role resolves to the same tier from either
directory.

For Claude Code, commands carry an explicit `model="{...}"` placeholder on every dispatch, which the
installer fills from the agent's own installed profile; the filled literal is what selects the model
the dispatched role runs on — without it the role inherits the session's model. opencode applies its
resolved tier dynamically.

Codex keeps the same role classification but maps it to a model / reasoning-effort pair at spawn
time. Two different files own the two halves, and they are easy to confuse: **which roles take which
tier** is declared once by `CODEX_PINNED_STANDARD_ROLES` and `CODEX_PINNED_REASONING_ROLES` in
`kaola-workflow-adaptive-schema.js`, rendered from there into the Codex SKILL surfaces — see
`conventions.md` § Bundle Lane for every carrier copy and the guard that binds the roster to those
constants. **What each tier resolves to** is a separate fact in a separate place, and the schema holds
no model or effort literal at all: it is authored twice, as named constants (`CODEX_STANDARD_MODEL`,
`CODEX_STANDARD_EFFORT`, `CODEX_REASONING_MODEL`, `CODEX_REASONING_EFFORT`) in
`kaola-workflow-codex-preflight.js`, and as typed literals in the dispatch-routing pin of
`templates/routing/next.skeleton.md` and `finalize.skeleton.md`, which is what ships to the SKILL
surfaces. The two are bound: `test-route-reachability.js` builds its expected efforts from those
constants and asserts every shipped surface states the matching one, so the prose and the validator
cannot drift apart, and `validate-kaola-workflow-contracts.js` cross-binds preflight to the
installer's own copies. Note the shape of that binding — it pins the **effort** and accepts any model
string, so a model change is caught by the contract validator rather than by the prose check. Both mappings are fixed, so a standard-tier task never
changes model or reasoning effort for task-specific reasons. No other runtime's model resolution
changes.

## Testing

`node scripts/simulate-workflow-walkthrough.js` is the integration suite (hand-rolled assert, no
framework); it must exit 0 with `Workflow walkthrough simulation passed`.

Two tiers. `npm run test:kaola-workflow:claude` is the **fast gate**: every cheap step at full
coverage, but one heavyweight suite runs a rotating 1/12 slice and three non-samplable suites are
deferred whole. `test:kaola-workflow:claude:full` runs everything and is never mandated — the fast gate is
sufficient evidence everywhere, including a release receipt; the full tier is an opt-in diagnostic.
See `conventions.md` § Two validation tiers.

Chain selection at finalize belongs to the producer: `run-chains.js` diff-scopes it from
`--project` / `--plan`. A non-edition-touching diff runs the `claude` chain alone; an
edition-touching diff — or an unresolved diff base — fails closed to all four. A release tag always
requires the full, unwaived four-chain receipt regardless of scope, bound at the tagged commit by
strict `headSha` equality and nothing else — the same one route `--tag` and `--release-check` share.
