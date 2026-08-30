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

- **`/workflow-init`** — bootstraps a repository: universal `AGENTS.md`, the smallest native
  entrypoint bridge, docs structure, and issue conventions. Run once per project. It also
  reconciles: a repository still carrying the retired
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

A failed command, intermediate finding, repair attempt, or review round does not by itself create a
mission. Keep working within the current promised outcome while custody and causal boundary remain
unchanged. Append a mission only for a new recoverable outcome that changes custody or for a newly
discovered independent causal class.

Finalization, Issue closure, archive, and sink are not Mission List items. The last run mission
establishes readiness for finalization. The finalization summary, closure evidence, archive state,
and sink receipt own the transaction's truth.

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

**Five additive runtime editions** — opencode, Kimi, Grok, Cursor, and ZCode — are runtimes, not forges. They are not wired
into `npm test`, `edition-sync.js`, `install.sh`, or the routing generator's render targets, but
their sync scripts derive their command surfaces from that same routing registry (via
`runtime-edition-forge.js`), so the `generate-routing-surfaces.js --write` that a routing-surface
change already mandates also brings every `.opencode`/`.kimi`/`.grok`/`.cursor`/`.zcode` tree already on the machine back into
parity — always the main checkout's trees, and never creating one that is absent. They carry their
own suites (`test-opencode-edition.js`, `test-kimi-edition.js`, `test-grok-edition.js`, `test-cursor-edition.js`, `test-zcode-edition.js`). See
`opencode-edition.md`, `kimi-edition.md`, `grok-edition.md`, `cursor-edition.md`, and `zcode-edition.md`.

### Natural-language handoff routing

Routing surfaces carry compact natural-language handoff guidance. A request sent to another role
states the requested result or question, relevant evidence and authority/custody, the exact landing
locator, and the stop condition. The existing owner receives findings, repairs them, and remains
responsible for the converged candidate and final verdict. There is no seven-label slot, required
block, ordering schema, parser, or linter; the routing generator propagates the skeleton prose to
the command and skill surfaces.

That common brief is separate from a generated runtime capability block. Both `workflow-next` and
`kaola-workflow-finalize` contain one marked `runtime-delegation` slot. The generator derives the
standard/reasoning/heavy role-membership roster from the common behavior-contract authority; the
runtime adapter supplies only the native carrier and default binding for each tier. The slot renders
Claude's native block for commands and the forge-matched Codex block for skills; each additive
edition replaces the same marked region with its own adapter render. The block exposes profile
lookup, native dispatch carrier, the generated roster and three default tier bindings, tool
boundary, honest named/built-in routes, and relevant availability/session limits. `workflow-init`
has no dispatch teaching.

The flow is one directional authority chain:

```text
templates/agents/behavior-contracts.json → role intent roster
templates/agents/runtime-capabilities.json → native carrier/default bindings
    → generate-agent-profiles.js routing guidance renderer
    → templates/routing/slots.js: runtime-delegation
    → next/finalize skeletons
    → Claude commands + Codex skills
    → additive edition marker replacement
```

No additive transform searches for Claude prose headings or invents a second runtime policy.

### Compact prompts and recovery

Next and finalize each author from one compressed routing skeleton. The dispatch rule is authored
once in `dispatch-contract.md`; each operation skeleton and the compact-recovery skeleton consume
that same slot. At generation time the compact skeleton combines its common continuation core,
that dispatch contract, and one runtime adapter into a complete runtime artifact. Runtime-specific
files are render targets, not authoring surfaces.

The recovery invariant is: after a real compact and before the next model inference, the complete
continuation prompt is present. It tells the model to reread durable state and continue Workflow
Next or Finalization, and always includes dispatch. It does not require context before or after
every tool. Claude and Codex meet it with one `SessionStart(compact)` command that directly prints
the already-generated prompt; no JS derives, selects, or composes anything at compact time. Grok
and Cursor use native Rules because their passive compact hooks cannot inject model context. Grok
installs one complete project or global Rule; Cursor installs one project `alwaysApply` Rule because
Rules are system-level context, Cloud
has no `sessionStart`, and `preCompact` cannot inject model context.

OpenCode, Kimi, and ZCode keep their initial command as prompt authority in this measured scope.
Kimi's previously managed PostCompact hint is retired and removed on upgrade. ZCode's
measured one-million-token context and the self-lock produced by an interim PreToolUse gate argue
against adding a speculative compact lifecycle. No runtime installs a Kaola PreToolUse,
PostToolUse, or Stop prompt-recovery hook; ordinary tool calls therefore add no recovery context and
start no recovery subprocess.

### Project instruction authority

One Kaola-formatted repository has one universal instruction surface: root `AGENTS.md`. Codex,
opencode, Kimi, Grok, Cursor, and ZCode consume it directly within their documented scopes. Claude
Code enters through a thin root `CLAUDE.md` containing `@AGENTS.md` plus Claude-only overlay bytes.
Runtime-specific files never duplicate the universal managed region.

`workflow-init` delegates migration to `kaola-workflow-project-instructions.js`. Its `plan`,
`check`, and `apply` modes load the one distribution-owned consumer-template module, classify
ownership, preserve arbitrary bytes and modes outside managed markers, and return one compatibility
class per managed change: `authority_layout_equivalent` may apply during an active run without
rewriting claim, Mission List, worktree, or locators; `execution_default_change` asks in
conversation and writes nothing until that consent; `state_schema_incompatible` keeps the old
contract (`active_run_preserved`) or follows an explicit tested migration; `unknown_or_mixed`
returns `decision_required` without writing. A blanket freeze of every instruction file merely
because any run is active is retired. The byte-exact v9.17.2 redirect and released consumer-template
pair migrates whole-file once into the contract and thin bridge; a legacy `KW-CLAUDE-MANAGED` region
with any changed outer bytes instead requires an owner decision and is not written. This producer
repository's richer root contract is explicitly preserved. Workflow-init authoring surfaces name this
module and writer but contain no second universal template. A successful second apply writes nothing
and preserves identical hashes.

Runtime installation is a separate owner from that portable repository result. `workflow-init`
does not install, refresh, or choose runtime catalogs, commands, skills, hooks, or adapters; the
same init outcome is produced regardless of which runtime invoked it. Runtime installers own native
commands or skills, agent catalogs, hooks, support scripts, and adapter/capability facts.
`install-cursor.sh --global` renders canonical bytes in transaction-scoped temporary staging,
writes only `${CURSOR_HOME:-~/.cursor}/{agents,commands}`, and does not mutate an ambient Git
repository; `install-all.sh --global` inherits that Cursor behavior, installs only the current
machine, and never deploys a Cursor Cloud environment. Project `.cursor` catalogs require explicit
`--target`. Global authority and project materialization are
receipt-bound and preflight every managed path before writing. The first receipt-owning upgrade may
adopt published 10.0.1 global bytes under exact per-forge
hashes; a modified or unknown byte remains a collision, and only exact retired ambient-helper bytes
are removed. On the measured standalone CLI only,
workflow-next/finalize may invoke the installed helper with explicit `$PWD` immediately before a
named dispatch; App local and Cloud keep separate live catalogs. Only after an Agent establishes it
is in Cursor Cloud environment setup may it install the remote authority plus selected repository,
test the Build, and ask the user to click Save. The user then opens a new top-level Agent in that
same repository; its visible Build link and live catalog must match before the install is trusted.
That project materialization also installs the shared Cursor `alwaysApply` recovery Rule; no Cursor
prompt-lifecycle hook is installed.

The Cursor global transaction also receipt-owns the exact capability registry at
`${CURSOR_HOME:-~/.cursor}/kaola-workflow/templates/agents/runtime-capabilities.json`. Installed
doctor and project-materialization helpers read that managed authority instead of reaching back into
a producer checkout. The registry remains a single source for render, install, and doctor; project
catalogs do not copy it, and `--no-scripts` still installs this non-executable authority while
skipping executable helpers and hooks.

### Runtime capability divergence

The machine authority is `templates/agents/runtime-capabilities.json`; the cited human map is
[`runtime-capabilities.md`](runtime-capabilities.md). It distinguishes direct loading from a bridge,
records profile/dispatch/model/tool/hook/install carriers, and keeps unproved facts as `unknown`.
Its routing-only guidance additionally exposes built-in/generic routes and native background,
parallel, resume, nesting, history, or cold-start boundaries where evidence establishes them. It
does not impose a Kaola concurrency cap or lowest-common-denominator runtime.

Runtimes and forges remain independent axes. The closed role inventory has seven runtime families
and nine adapter variants: one Claude, three Codex forge variants, and one each for opencode, Kimi,
Grok, Cursor, and ZCode. Additive installers still take `--forge` to select routing/forge prose; that
does not create another role-behavior adapter.

### Agent behavior and native profiles

`templates/agents/behavior-contracts.json` is the only behavioral authority for all 14 roles.
`scripts/generate-agent-profiles.js` composes each role with the selected native adapter, producing
126 deterministic renders. Root `agents/*.md`, the 42 Codex TOMLs, and additive runtime profiles are
outputs. No output is edited as a semantic source.

The behavior source owns purpose, inputs, authority/custody, writes, deliverable, verification, stop
conditions, capability requirements, and `standard` / `reasoning` / `heavy` intent. It contains no
runtime, vendor, native model, tool syntax, home path, or hook vocabulary. Adapters own those native
differences and may not carry arbitrary universal prompt prose.

Every render carries a shared `behavior_contract_hash` and a render-specific
`resolved_profile_hash`. Shared-behavior mutation must reach all nine variants for that role;
adapter mutation must stay inside one runtime family. Byte identity remains required for true
forge-neutral twins, but cross-runtime sentence equality is not the oracle.

`delegation_guidance` is routing-only adapter data and is deliberately excluded from the adapter
hash used by native profiles. A wording or capability-exposure correction regenerates the marked
next/finalize blocks without churning 126 `resolved_profile_hash` values for unchanged profile
bytes. Runtime-guidance reachability has its own structural and mutation checks.

Provenance is a separate axis in `templates/agents/provenance.json` and
[`agents-source.md`](agents-source.md). It is validated and durable but excluded from prompt bodies
and behavior/render hashes.

Codex profile readiness remains an install-time boundary. The profile installer verifies source,
manifest, writes, pruning, hooks, and installed bytes; `kaola-workflow-codex-preflight.js --doctor`
is an explicit diagnostic. Live next/finalize surfaces do not turn it into an entry gate.
The effective project or user `.codex/config.toml` is the installed registration authority: its
managed `[agents.<role>]` blocks point to `.codex/agents/kaola-workflow/<role>.toml`. Bundled
`agents.toml` remains installer source and is not an installed profile-discovery path.

### Model intent

Role intent is only `standard`, `reasoning`, or `heavy`. The selected adapter maps that intent to a
native default model/effort value or session inheritance, and next/finalize exposes that binding at
the point of dispatch. It remains a default rather than scheduler state or a prohibition on native
task-sensitive choices. No mission-list field records a model pair, and Kaola does not add runtime
limits on automatic, background, parallel, resume, nesting, history, or service-tier behavior.
Finalize's operational examples pass the Claude tier model while retaining runtime-default effort,
or the Codex tier model plus `reasoning_effort`; a task-sensitive override, supported inheritance,
and other runtime-owned choices remain valid.
Current mappings and limitations are documented in
[`runtime-capabilities.md`](runtime-capabilities.md) and each additive edition guide.

Execution choice is equally local: one missing exact role causes a search of the active runtime's
other adequate native routes for that mission item. A built-in or generic child keeps its real
identity; a custody brief does not make it impersonate the missing role. Inline execution is the
fallback for that item only when no adequate route exists, after which the next item is re-evaluated.

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
