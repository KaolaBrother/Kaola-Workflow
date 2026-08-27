# Kaola-Workflow Repository Instructions

<!-- KW-AGENTS-MANAGED-START -->
## Project Overview

Kaola-Workflow is a loop-engineering system for coding agents: a forge-issue-driven workflow in
which the orchestrator claims work, writes a mission list, and runs it by reading the frontier,
dispatching independent roles when useful, and closing items as their results land. The core scripts
live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

The design of record is [ADR 0017 — The mission list](docs/decisions/0017-the-mission-list.md). Read
the ADR before proposing anything that writes to the run record.

## The mission list

One file per run. Four fields per item. Three write moments. `kaola-workflow/<run>/mission-list.md`
carries an H1 with the goal and one entry per item:

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out, to whom, and where the output will land | before dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

`dispatched` is written before work goes out. No script owns this file; the orchestrator writes it.
An item is a mission, not a specification: it carries no role, write set, dependency edge, model, or
cardinality. Decide how to execute it only when reaching it. A mission names a recoverable outcome
or a newly discovered independent causal class; one selector, assertion, command, review round, or
mechanical oracle is not by itself a mission. Keep working through failures in the same custody and
causal boundary; `BLOCKED` means the current owner cannot safely or legitimately continue.

**Custody vs carrier.** Custody answers who may decide meaning. Dispatch answers where this item is
most economically executed. Neither inline nor dispatch is a run-wide default.

**Failure frontier.** Establish focused acceptance, inventory the affected class, repair by shared
custody, freeze the candidate, then review that exact candidate as a batch. Mutation invalidates
prior PASS evidence for changed bytes.

When resuming, `done` items and their `result` are known; `in-flight` items with a `dispatched`
locator are decisions to reconcile. Look for the work, not the worker: if the promised output landed,
close the item; otherwise re-dispatch unless the dispatch is demonstrably alive.

## Durable State Contract

- The forge is the backlog. Issue title, labels, body, and comments define the work; later comments
  override earlier text. The forge's open list is backlog truth.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local file that survives. Nothing else
  is generated or tracked under `kaola-workflow/.roadmap/`.
- `workflow-state.md` records the claim: issues, branch, and worktree. It does not describe the run.
- `mission-list.md` records the run. It is deliberately neither attested nor machine-verified.
- Active work lives in `kaola-workflow/{project}/`; those folders remain until archived or safely
  discarded.

## First Principles

The numbered axioms are tie-breakers, applied in priority order whenever a situation is not already settled; the paragraphs that follow them are standing defaults that hold whether or not anything else settles the case.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when nothing else covers a situation, resolve it by walking these axioms in order and record a one-line derivation alongside the work. Recording it is useful and never required.

**Check the premise before it shapes the work:** an issue is a claim recorded earlier against a tree that has since moved, so establish what is true *now* at the place it points and let the measurement rather than the filed text decide what gets built. The usual outcome is neither *right* nor *wrong* but right-with-a-detail-that-misroutes — a stale locator, a miscounted set, a clause that breaks if executed literally — so carry the measurement forward, never a bare verdict. Where the two disagree the issue gets corrected, not quietly worked around. Nothing inspects that you did this.

**Choose dispatch or inline per item:** re-evaluate the choice for every mission item; one item's
choice never establishes a run-wide default. The absence of an exact named role is not proof that
all native subagent dispatch is unavailable. Keep one owner for the current cohesive production
surface when handoff and integration cost exceed the benefit, but that scope does not absorb
independent research, test authorship, documentation, or review items. Dispatch when it materially
reduces main-context residue, supplies independent judgment, or enables genuinely independent
parallel work. Both modes are first-class; width follows the true work frontier. No dispatch count,
cap, disjointness proof, justification, approval, or fallback stigma attaches to the judgment.

## Working Principles

### Nothing refuses

Measurements survive; verdicts do not. Final validation records typed findings for the orchestrator
to act on. Destructive operations and pre-publication release checks still fail loudly because they
protect work nobody agreed to lose.

Missing is a routing problem, not a stop: a prerequisite is usually a mission not yet dispatched.

### Derive additively

Add only what an observed failure demands. Silence is an answer. A mechanism justified only by what a
role might get wrong argues against the design premise. Record unobserved failure classes instead of
building gates for them.

### Concurrency carries no machinery

The frontier is list minus done minus in-flight. Independent roles and worktrees are optional tools,
not gates. Width follows the true work frontier.

### Self-sufficient by default

A run must complete in a repository without hosted automation. Accuracy comes from local evidence,
adversarial verification, chain execution, and the walkthrough.

### One rule, one wording

A universal rule or generated template has one wording. A runtime is a rendering target, never an
authoring surface. Divergence is allowed only for measured capability differences declared in the
runtime adapter. Consumer-facing universal artifacts name no vendor, model, native tool, or private
configuration path. A prompt guard counts as evidence only after mutation proves it is armed.

**New runtime adapter standard:** measure before declaring. Expose the runtime's real profile
discovery and precedence, dispatch carrier and verified call fields, all three tier defaults and
their model/effort/thought carrier or inheritance, tool and custody boundary, truthful named and
built-in routes, and native background, parallel, resume, nesting, and reload constraints. Put those
facts in the adapter-rendered `workflow-next` and finalize guidance; keep the universal decision rule
vendor-neutral. Unknown fields stay unknown and the live tool schema wins. A default binding guides
selection; it never disables automatic routing, task-sensitive overrides, or another capability the
runtime actually exposes. A generic route is used under its real identity and cannot impersonate a
custody-bearing named role.

### Test custody

The test-author role independently owns acceptance meaning and proves behavioral RED. An implementer
may maintain mechanical fixtures, generated manifests, signatures, and harness plumbing only when
acceptance meaning is unchanged. Delete a test with its retired mechanism; never rewrite a pin ahead
of the mechanism or restore a retired field merely to keep a test green.

## Key Scripts

- `kaola-workflow-claim.js` owns claim, release/discard, status, startup, selection, resume, finalize,
  worktrees, sink fallback, sink verification, and labels.
- `kaola-workflow-run-chains.js` runs validation chains, writes exact-SHA receipts, and owns the
  pre-publication release check.
- `kaola-workflow-sink-merge.js` owns the sink and reports the branch state it observed.
- `kaola-workflow-adaptive-schema.js` owns forge-neutral constants and shared helpers.
- `simulate-workflow-walkthrough.js` is the integration suite.

## Running Tests

`npm test` runs the producer-selected validation chains. `node scripts/simulate-workflow-walkthrough.js`
must exit zero before workflow changes are claimed complete. Focused runtime edition suites must also
run whenever their render, install, or routing surfaces change.

## Commands

- Install every supported runtime: `./install-all.sh`.
- The installed workflow surface is `workflow-init`, `workflow-next`, and
  `kaola-workflow-finalize`, using the native carrier of the active runtime.
- Lint/typecheck/build: unknown; the repository is standard-library scripts and shell.

For every user-visible change update `README.md`, API documentation, `CHANGELOG.md` under
`[Unreleased]`, architecture documentation when structure changed, and public-interface comments.

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when a value judgment is needed.
- Read before writing: inspect the target and its conventions immediately before editing.
- Keep the solution surgical. Reuse existing mechanisms and add no speculative abstraction.
- Define verifiable success criteria and loop until they pass.
- Verify facts against documentation, source, or a real run. Name unknowns instead of fabricating.
- Escalate irreversible public-contract, schema, data, dependency, or capability deletion choices.
- Keep provenance out of agent-facing prompts. Store origin and license facts in documentation and
  source metadata, never in role instructions.

## Validation Policy

- Run the walkthrough before claiming workflow changes complete.
- Chain selection belongs to the producer and is diff-scoped at finalize. A release always requires
  the complete unwaived receipt bound to the exact publication commit.
- Generated command and skill surfaces come from `templates/routing/`; edit the skeleton and
  regenerate, never hand-edit a rendered surface.
- An edition-only change runs its own focused suite in addition to shared static checks.
- A guard reads what ships; a threshold cannot see a rule below its bar; specify the result rather
  than a method. The observations behind these rules live in `docs/conventions.md`.

## Documentation Map

- `README.md` — overview and installation.
- `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — documentation index.
- `docs/architecture.md`, `docs/api.md`, `docs/conventions.md`,
  `docs/workflow-state-contract.md`, and `docs/decisions/` — design and contracts.

## Maintenance

Keep this universal file concise. Move details to documentation or runtime-specific overlays. Add
rules only after repeated mistakes, review feedback, or stable conventions.
<!-- KW-AGENTS-MANAGED-END -->
