# Kaola-Workflow — Claude Code Instructions

## Project Overview

Kaola-Workflow is a loop-engineering system for coding agents — a GitHub-issue-driven workflow in
which the orchestrator claims work, writes a **mission list**, and runs it: reading the frontier,
dispatching subagents when it judges that useful, and closing items as their results land. The core
scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

The design of record is [ADR 0017 — The mission list](docs/decisions/0017-the-mission-list.md), and
the file format is [`docs/mission-list.md`](docs/mission-list.md). Read the format before proposing
anything that writes to the run record.

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

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional
  project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file. A file
  left behind is silent and nothing detects it automatically — check by hand with
  `node scripts/kaola-workflow-roadmap.js validate-remote` (exit 1 = drift).
- `workflow-state.md` is the **claim** record: which issue, which branch, which worktree. It does not
  describe the run.
- `mission-list.md` is the **run** record. It is not attested, not frozen, and not machine-verified —
  that absence is deliberate, not an oversight.
- Active work lives in `kaola-workflow/{project}/`; those active folders are the run inventory a
  successor reads first, and stay until archived or safely discarded.

## First Principles

Tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a rule.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra
   agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Irreversible and value-laden calls belong to the
   user: ask, in conversation, before taking one. There is no durable consent valve; that sentence is
   the whole mechanism.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service)
   be the judge of done. This says do not outsource the judgement — it does not say a door must slam.

## Working Principles

### Nothing refuses

The refusal count in the run design is **zero**. Measurements survive; verdicts do not. The finalize
chain-receipt check reports a typed finding on its envelope and durably in `finalization-summary.md`,
and the orchestrator decides what to do about it.

Two things are deliberately not conversions, and neither is a gate on the agent's work: the pre-tag
release gate (`kaola-workflow-run-chains.js --release-check`) still refuses, because a release tag
demands an unwaived four-chain receipt; and an archive move that would **lose a file** fails loudly,
because that is an operation refusing to destroy data.

**Missing is a routing problem, never a stop.** When something needed is absent, go get it. "Blocked
on a prerequisite" is nearly always a task nobody dispatched.

### Derive additively

> **Add only what an observed failure demands. Silence is an answer.**

Subtractive derivation asks *"may I remove this?"*, and there is always an answer that keeps it.
Additive derivation asks *"what forced this to exist?"* A mechanism justified by *"the agent might get
this wrong"* argues against the design's premise rather than for a gate. Mechanisms derived for
failure classes never actually observed are **recorded, not built** — see ADR 0017's watch list.

### Concurrency carries no machinery

No disjointness check, no antichain sweep, no serializer taxonomy, no evidence line, no fan-out cap.
The frontier is *list minus done minus in-flight*, visible by reading. Decompose to genuine
independence and dispatch that wide — no wider, no narrower. **You decide, uninspected.**

**Dispatch production; keep decisions.** Your context is the run's scarcest resource, so delegating
discretionary production is the default and what stays inline is the deciding itself. Subagents and
worktrees are offered and declinable — **a tool you cannot decline and still finish is a gate wearing
a tool's name.**

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

- `kaola-workflow-claim.js` — claim, release/discard, status, startup, pick-next, resume, finalize,
  worktrees, sink-fallback, verify-sink, labels.
- `kaola-workflow-roadmap.js` — roadmap mirror. `generate` makes no remote call; `validate-remote` is
  the only subcommand touching the forge. Ported per forge.
- `kaola-workflow-run-chains.js` — runs the validation chains, writes the receipt, diff-scopes chain
  selection at finalize. Also owns `--release-check`, the pre-tag gate.
- `kaola-workflow-adaptive-schema.js` — forge-neutral constants and shared helpers, including the
  chain-receipt evaluation and the code-tree hash that producer and finalize must compute identically.
  **Byte-identical across all four editions** — the cross-edition drift anchor.
- `kaola-workflow-sink-merge.js` — the sink. Reports what it found; the orchestrator gets the branch
  right (correct merge, resynchronize, or file a PR) and cleans up after.
- `simulate-workflow-walkthrough.js` — integration suite (hand-rolled assert, no framework).

## Running Tests

`node scripts/simulate-workflow-walkthrough.js` must exit 0. All four chains: `npm test`.

Two tiers. `test:kaola-workflow:claude` is the **fast gate**: every cheap step at full coverage, but
it **samples the walkthrough at a rotating 1/12 shard** and defers a few heavyweight suites. A green
fast gate means *the slice that came up passed* — run the walkthrough at full scope before claiming a
suite verified. `test:kaola-workflow:claude:full` runs everything and is **never mandated**, releases
included; it is an opt-in diagnostic.

## Commands

- Install: `./install.sh --forge=github|gitlab|gitea`; `./install-all.sh --forge=github` for all four
  runtimes; `./install-opencode.sh` / `./install-kimi.sh` for those additive editions alone.
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
- **Chain selection belongs to the producer.** `kaola-workflow-run-chains.js` diff-scopes it at
  finalize: a non-edition-touching diff runs the `claude` chain alone; an edition-touching diff — or an
  unresolved diff base — fails closed to all four. A release tag always requires the full, unwaived
  four-chain receipt.
- **Prose changes propagate to generated surfaces.** The command and SKILL surfaces are rendered from
  skeletons in `templates/routing/`; edit the skeleton and regenerate, never a rendered surface.
  `node scripts/generate-routing-surfaces.js --check` prints the surface count and is wired into every chain.
- **opencode and kimi are additive runtime editions**, not forges: not wired into `npm test`,
  `edition-sync.js`, or `install.sh`. An edition-only diff triggers no four-chain obligation; run its
  own suite instead.

## Documentation Map

- `README.md` — overview and install. · `CHANGELOG.md` — user-visible changes.
- `docs/mission-list.md` — **the run record's format.** · `docs/README.md` — index. ·
  `docs/architecture.md` · `docs/api.md` · `docs/conventions.md` · `docs/workflow-state-contract.md`
  · `docs/decisions/` — ADRs. · `kaola-workflow/ROADMAP.md` — roadmap mirror.

## Maintenance

Keep this file under 200 lines; move detail to `docs/` or skills. Add rules only after repeated
mistakes, review feedback, or stable conventions, and do not use `@path` imports.
