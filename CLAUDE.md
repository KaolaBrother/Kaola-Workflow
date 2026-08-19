# Kaola-Workflow — Claude Code Instructions

## Project Overview

Kaola-Workflow is a loop-engineering system for coding agents — a GitHub-issue-driven workflow in
which the orchestrator claims work, writes a **mission list**, and runs it: reading the frontier,
dispatching subagents when it judges that useful, and closing items as their results land. The core
scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

The design of record is [ADR 0017 — The mission list](docs/decisions/0017-the-mission-list.md) — the
derivation, not the format; the format is the table below. Read the ADR before proposing anything
that writes to the run record.

## The mission list

**One file per run. Four fields per item. Three write moments.** `kaola-workflow/<run>/mission-list.md`
carries an H1 with the goal and one entry per item:

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

`dispatched` is written **before** the work goes out. Writing it after is the failure the file exists
to prevent. No script owns this file; the orchestrator writes it.

**An item is a mission, not a specification.** It carries no role, no write set, no dependency edge,
no model, no cardinality. When you reach an item you decide *then* whether to dispatch subagents or
do the work yourself, and at what width.

**Resuming**: `done` items and their `result` are what is known; `in-flight` items with a `dispatched`
locator are the decision to make. **Look for the work, not the worker** — if the promised output has
landed, close the item; otherwise re-dispatch, unless you can show the dispatch is still alive.

## Durable State Contract

- The forge is the backlog: an issue's title, labels, and comments are what the work is — comments
  override the body. There is no local mirror to keep current — **the forge's open list is the
  backlog truth**.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local file that survives, for standing
  project-local rules read directly; nothing else is generated or tracked under
  `kaola-workflow/.roadmap/`.
- `workflow-state.md` is the **claim** record: which issues, which branch, which worktree. It does not
  describe the run.
- `mission-list.md` is the **run** record. It is not attested, not frozen, and not machine-verified —
  that absence is deliberate, not an oversight.
- Active work lives in `kaola-workflow/{project}/`; those active folders are the run inventory a
  successor reads first, and stay until archived or safely discarded.

## First Principles

The numbered axioms are tie-breakers, applied in priority order whenever a situation is not already settled; the paragraphs that follow them are standing defaults that hold whether or not anything else settles the case.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when nothing else covers a situation, resolve it by walking these axioms in order and record a one-line derivation alongside the work. Recording it is useful and never required.

**Check the premise before it shapes the work:** an issue is a claim recorded earlier against a tree that has since moved, so establish what is true *now* at the place it points and let the measurement rather than the filed text decide what gets built. The usual outcome is neither *right* nor *wrong* but right-with-a-detail-that-misroutes — a stale locator, a miscounted set, a clause that breaks if executed literally — so carry the measurement forward, never a bare verdict. Where the two disagree the issue gets corrected, not quietly worked around. Nothing inspects that you did this.

**Dispatch production; keep decisions:** the orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default and only the deciding stays inline; weigh the economics per case by judgment, with no justifier, evidence line, or approval attached.

**Parallel by default:** concurrency is the standing default for independent work, and work that genuinely feeds other work runs in order because it has to. Nothing inspects that choice — no proof, no evidence line, no cap: you can tell the difference, and the frontier is in front of you. Width stays sized to the true shape of the task rather than pushed as wide as it will go.

## Working Principles

### Nothing refuses

The refusal count in the run design is **zero**: measurements survive, verdicts do not, and the finalize
chain-receipt check reports a typed finding on its envelope and durably in `finalization-summary.md` for
the orchestrator to act on. What is deliberately not converted is never a gate on the work — the pre-tag
release gate (`run-chains.js --release-check`) still refuses, a release tag demanding an unwaived
four-chain receipt, and an operation that would **destroy** something still fails loudly (an archive
that would lose a file, a sink over a tree carrying uncommitted work). Those protect work nobody agreed
to lose.

**Missing is a routing problem, never a stop** — "blocked on a prerequisite" is nearly always a task
nobody dispatched.

### Derive additively

> **Add only what an observed failure demands. Silence is an answer.**

Subtractive derivation asks *"may I remove this?"*, and there is always an answer that keeps it.
Additive derivation asks *"what forced this to exist?"* A mechanism justified by *"the agent might get
this wrong"* argues against the design's premise rather than for a gate. Mechanisms derived for
failure classes never actually observed are **recorded, not built** — see ADR 0017's watch list.

### Concurrency carries no machinery

The frontier is *list minus done minus in-flight*, visible by reading — no disjointness check, no
antichain sweep, no serializer taxonomy. Subagents and worktrees are offered and declinable —
**a tool you cannot decline and still finish is a gate wearing a tool's name.**

### Self-sufficient by default; CI/CD is not a gate

A run must complete on a repo with **no CI/CD configured**, with no degradation. CI/CD is never a
required gate and is never mentioned in prose, finalize output or suggestions unless the user states
it is mandated. Accuracy comes from inside: adversarial verification, the chains, the walkthrough.

### One rule, one wording

A rule, or a generated template, has exactly one wording, and every runtime reads it. A runtime is a
rendering target, never an authoring surface; divergence is allowed only where capabilities genuinely
differ and must be declared as a named region, never an incidental rewrite. **Consumer-facing
artifacts** (`CLAUDE.md`, `AGENTS.md`) name no vendor, no model, and no command that will not resolve
on the reader's runtime. Any change touching a prompt surface must state which runtimes it reaches,
and **a guard is evidence only once mutation-proven** — a green suite is not proof a guard is armed.

### Test custody

Whoever implements a behaviour does not author its tests. `tdd-guide` holds the test artifact;
`implementer` reads and runs tests but never writes them. **A test is deleted with its mechanism,
never repaired ahead of it** — never rewrite a pin so it keeps passing against machinery that is
gone, and never re-add a field to satisfy a test.

## Key Scripts

- `kaola-workflow-claim.js` — claim, release/discard, status, startup, pick-next, list-open, resume,
  finalize, worktrees, sink-fallback, verify-sink, labels. `list-open` orders the open issue list by
  its `P0`–`P3` priority tier without selecting one for you.
- `kaola-workflow-run-chains.js` — runs the chains, writes the receipt, diff-scopes chain selection at
  finalize; also owns `--release-check`, the pre-tag gate. · `kaola-workflow-sink-merge.js` — the sink;
  reports what it found, and the orchestrator gets the branch right and cleans up after.
- `kaola-workflow-adaptive-schema.js` — forge-neutral constants and shared helpers, incl. chain-receipt
  evaluation and the code-tree hash producer and finalize must compute identically. **Byte-identical
  across all four editions** — the cross-edition drift anchor. · `simulate-workflow-walkthrough.js` —
  integration suite (hand-rolled assert, no framework).

## Running Tests

`node scripts/simulate-workflow-walkthrough.js` must exit 0. All four chains: `npm test`.

Two tiers. `test:kaola-workflow:claude` is the **fast gate**: every cheap step at full coverage, but it
**samples the walkthrough at a rotating 1/12 shard** and defers a few heavyweight suites — green means
*the slice that came up passed*, so run the walkthrough at full scope before claiming a suite verified.
`test:kaola-workflow:claude:full` runs everything, is **never mandated** (releases included), opt-in.

## Commands

- Install: `./install.sh --forge=github|gitlab|gitea`; `./install-all.sh --forge=github` for every
  runtime; `./install-opencode.sh` / `./install-kimi.sh` / `./install-grok.sh` for those additive editions alone.
- The installed command surface is three: `/workflow-init`, `/workflow-next`, `/kaola-workflow-finalize`.
- Lint/typecheck/build: unknown (Node scripts only, no formal pipeline).

On any user-visible change, update: `README.md` · API docs · `CHANGELOG.md` under `[Unreleased]` ·
architecture docs if structure changed · inline comments where public interfaces changed.

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and its conventions immediately before editing.
- Keep it simple and surgical: solve the requested problem, touch only what it requires, and add no
  speculative abstractions. **There is already too much in this project.**
- Goal-driven execution: define verifiable success criteria before starting, and loop until they pass.
- Verify facts, don't fabricate: confirm API/library behaviour against documentation, source, or a
  run. Name what you do not know and find out. Reuse before adding: extend, don't duplicate.
- Escalate irreversible changes: do not unilaterally alter a user-owned contract (public API, schema
  or data migration, dependency swap, deletion of working capability) — state the decision and its
  evidence, then get confirmation.
- **Keep provenance out of agent-facing prompts.** Agent definitions, commands and skills carry the
  *rule*, never its origin. Provenance belongs in `CHANGELOG.md`, `docs/decisions/`, and commit messages.

## Validation Policy

- Background hooks (subagent-dispatch-log) are advisory; do not re-run their checks redundantly.
- Verify with the walkthrough suite before claiming workflow changes complete.
- **Chain selection belongs to the producer.** `kaola-workflow-run-chains.js` diff-scopes it at finalize:
  a non-edition-touching diff runs the `claude` chain alone; an edition-touching diff, or an unresolved
  diff base, fails closed to all four. A release tag always requires the full, unwaived four-chain
  receipt, bound to the tagged commit by exact `headSha` equality.
- **Prose changes propagate to generated surfaces.** Command and SKILL surfaces render from skeletons in
  `templates/routing/` — edit the skeleton and regenerate, never a rendered surface.
  `node scripts/generate-routing-surfaces.js --check` prints the surface count and runs in every chain.
- **opencode, kimi, and grok are additive runtime editions**, not forges: absent from `npm test`,
  `edition-sync.js` and `install.sh`. An edition-only diff owes no four-chain run; run its own suite.
- **A guard reads what ships, not what was authored**; a threshold cannot see a rule beneath its bar; and
  **specify the result, never the method** — a mechanism claim in a brief rots and makes the agent wrong,
  where the same fact as evidence only makes it check; affordable exactly when the result is falsifiable
  and the check is not the doer's. All three, with the observations that forced each: `docs/conventions.md`.

## Documentation Map

- `README.md` — overview and install. · `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — index. · `docs/architecture.md` · `docs/api.md` · `docs/conventions.md` ·
  `docs/workflow-state-contract.md` · `docs/decisions/` — ADRs.

## Maintenance

Keep this file under 200 lines — recommended, never enforced: past it you get a notice and an offer
to trim, not a failure. Move detail to `docs/` or skills. Add rules only after repeated mistakes,
review feedback, or stable conventions, and do not use `@path` imports.
