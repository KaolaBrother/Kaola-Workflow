# Six workflow patterns, mapped to the adaptive grammar — and the one gap worth filling

**Date:** 2026-06-06
**Status:** Design — filed as issue #263
**Relates to:** `docs/investigations/dynamic-workflow-composition-2026-06-02.md`
(the "Borrowed orchestration patterns" catalogue, §lines 972–1064),
`docs/decisions/0003-adaptive-front-end-planner.md`, issue #251 (mechanical
verdict gate)

---

## Why this document exists

A six-panel "Six Workflow Patterns" diagram was raised as a possible enrichment
of the adaptive `workflow-planner`'s grammar:

1. **Classify-And-Act** — a classifier routes a task to one of N agents.
2. **Fanout-And-Synthesize** — a task fans out to N agents, then a node synthesizes.
3. **Adversarial Verification** — a worker's output is checked by N verifiers.
4. **Generate-And-Filter** — N generators produce ideas; a filter (rubric + dedupe)
   keeps the best and discards the rest.
5. **Tournament** — N attempts, pairwise judges, a final winner.
6. **Loop Until Done** — an agent runs; if there are new findings, spawn another; else done.

The honest finding, verified against the code and the existing catalogue, is that
**five of the six are already analyzed — and most are shipped.** The adaptive
grammar's three shapes (`sequence`, `fanout`, `loop`) plus the `depends_on` DAG and
the post-dominance gate floor already express them. So the value is **not** "add six
node types." It is to (a) document the five supported patterns for users and lock them
as test fixtures, and (b) design the **one** pattern the catalogue never tackled —
**Classify-And-Act** — in a form that preserves every freeze/decidability invariant.

This document does both. It changes no role profile and proposes one small, additive
grammar surface.

## The five already covered (empirically verified)

Each pattern below was validated by authoring a canonical `workflow-plan.md` and running
`scripts/kaola-workflow-plan-validator.js <plan> --json` against the live validator on
2026-06-06. The verdict column is the validator's actual output.

| Image pattern | Expressed as (roles + shape) | Catalogue row | Live validator verdict |
|---|---|---|---|
| **Fanout-And-Synthesize** | `fanout(group)` of `tdd-guide` over disjoint dirs → a `code-reviewer`/`planner` node `depends_on` all legs (the synthesize/join); the unique sink is itself a barrier | `pipeline-vs-barrier`, `multi-modal-sweep` | `in-grammar`, `decision: ask` (write-role fan-out → blast-radius — surfaces for approval, by §5 governance) |
| **Adversarial Verification** | worker → `code-reviewer` gate → read-only `fanout(verify)` of `adversarial-verifier` skeptics (empty write sets) → quorum at the sink | `adversarial-verify` (**first-class, user-mandated**) | `in-grammar`, `decision: auto-run`, `blastRadius: false` — the **read-only fan-out carve-out has shipped** (the 2026-06-02 "honest grammar caveat" is resolved) |
| **Generate-And-Filter** | read-only `fanout(gen)` of angled `planner` attempts → a `planner`/`code-reviewer` reduce node (rubric + tally) → one downstream `tdd-guide` implements the winner | `judge-panel` (read-only form **Adopt**; write-role form **Reject**) | `in-grammar`, `decision: auto-run`, `blastRadius: false` (read-only generators + a single sequential implement). The "filter/discard" is the reduce node's behavior, not a grammar feature |
| **Tournament** | a fixed bracket of pairwise judge nodes wired by `depends_on`, reducing to a final node | folded into `judge-panel` (argmax tally) | `in-grammar`, `decision: auto-run` as a read-only hand-wired bracket; **no native bracket shape** (see Out of scope) |
| **Loop Until Done** | `loop(<cap>)` re-invoking one role to a static cap, with a **mechanical** early-exit on the #251 `verdict: pass` | `loop-until-dry`, `self-repair-loop` | `in-grammar`, `decision: ask` (loop present → governance asks). The static cap is the deliberate halting guarantee; the "new findings?" test only *shortens* the loop |

The structural reason this works: a "pattern" is **not** a node type. It is a sub-graph
drawn with `depends_on` edges plus the right role on the join, over an orthogonal
primitive set — **fan-out × reduce × loop × verdict** — that already composes. The
2026-06-02 catalogue says it plainly: *"The three shapes are a grammar, not a menu of
phases. The interesting question is what an agent can build out of them."* The five
patterns above are answers to that question, and they were already enumerated there.

**What is genuinely shipped (not just designed):** `adversarial-verifier` is a canonical,
always-installed role (`kaola-workflow-plan-validator.js:49`); the read-only fan-out
carve-out validates today (P3 above, `blastRadius: false`); #251 added a script-read
`verdict: pass|fail` vocabulary (`parseNodeVerdict` in
`kaola-workflow-adaptive-schema.js:99`) and `--verdict-check` so the loop's exit and the
quorum tally are mechanically enforced rather than agent-asserted.

## The one gap: Classify-And-Act

The catalogue surveyed **verification and orchestration** patterns. It never surveyed
**conditional routing** — the classify-and-act shape where a decision node inspects the
task and routes to *one of several mutually-exclusive arms*, leaving the others un-run.

Verified out-of-grammar today. Authoring two mutually-exclusive arms with a `select(...)`
shape is refused by the validator:

```
$ node scripts/kaola-workflow-plan-validator.js select.md --json
{"result":"refuse","errors":["node arm-csv has invalid shape \"select(fix)\"", ...]}
```

The only legal workaround is to author both arms as a `fanout` — but then **both arms
run**:

```
$ node scripts/kaola-workflow-plan-validator.js both-arms.md --json
{"result":"in-grammar","decision":"ask","risk":{"blastRadius":true,...}}   # BOTH arms execute
```

### Why it's a real gap

The `workflow-planner` is **author-time blind**: it freezes the DAG *before any
exploration runs*. So for an issue whose fix lives in either the CSV exporter **or** the
HTML renderer — undecidable until `code-explorer` has looked — the planner today must
either (a) author both write-role arms (both run: wasted work, doubled blast radius,
spurious `ask`) or (b) guess one arm and risk being wrong. Classify-and-act is exactly
the missing tool: explore first, then commit to the matching arm.

### Why the naive form is forbidden — and what the precedent is

A *runtime classifier that picks a live branch* would break the invariant the whole
validator rests on: the plan is **frozen** (`plan_hash`) and gates are proven by
**post-dominance over a static graph**. If which arm exists were decided at runtime, you
could no longer *prove* `code-reviewer` post-dominates every implement node. Runtime DAG
mutation is therefore rejected, unconditionally.

But the catalogue already contains the safe precedent: **`staged-escalation`** —
*"an always-present node whose body is trigger-gated (records `N/A` with scan evidence
when the trigger does not fire)"*, marked **"already expressible — ordinary
post-dominance applies,"** with **G2's security escalation as the shipped instance.**

**Selective execution is `staged-escalation` generalized from 0-or-1 to exactly-1-of-N.**
Every arm is authored and frozen; the validator computes post-dominance over the **full
superset** of arms (strictly *more* conservative — whichever arm runs, its path still
crosses the gate); and at runtime exactly one arm executes while the rest are marked
`n/a`. Nothing is added to the graph at run time. The freeze and the gates are untouched.

### The spine constraint: selection must be script-decidable, never agent prose

This is the load-bearing rule, and the design philosophy already demands it elsewhere:
`staged-escalation` requires *"a static, durable-state predicate"*; `loop-until-dry` and
`completeness-critic` both rule an **agent-judged predicate out-of-grammar → typed
refusal**; `adversarial-verify` keeps the **tally in the orchestrator**, not in a
subagent. A classifier that *decides which arm in prose* is out-of-grammar by these
existing rules.

In-grammar selective execution therefore means:

1. A **read-only classifier node** (`code-explorer` or `planner`; zero blast radius) emits
   a **structured selector verdict** into its `.cache` evidence — e.g. `selector: arm-csv`
   — using the same fence-blind, column-0-anchored discipline as #251's `verdict:` line.
2. A **script** (a sibling of `commit-node`'s quorum/tally step) reads that verdict,
   confirms it names exactly one arm of the declared group, and **mechanically** marks the
   unselected arms' ledger rows `n/a`. The agent *judges*; the routing is *mechanical and
   reproducible from durable rows on resume* — exactly the #251 upgrade, applied to routing.

If selection cannot be made script-decidable for real use cases, the honest verdict is
**Reject as redundant with `staged-escalation`** — do not ship an agent-prose router.

## The design

### 1. Grammar surface (no fourth shape)

Classify-and-act stays inside `{sequence, fanout, loop}` at the *shape* level — the arms
are ordinary `sequence` branches that each `depends_on` the classifier. The new surface
is a **selection group** annotation plus a **selector source**, declared in the plan the
way `fanout(<group>)` names its group:

- Arms carry `select(<group>)` in a new **optional** column (or reuse the reserved
  `cardinality` column's sibling slot — TBD at implementation; keep `plan_hash` coverage).
- The classifier node is named as the group's `selector_source` (a `## Selectors` meta
  block, or a per-group line, kept inside the hashed `## Nodes`/`## Meta` region so freeze
  covers it).

This mirrors the existing precedent that `fanout(impl)` is a group label the validator
already parses; `select(fix)` is a sibling label with mutual-exclusion semantics instead
of concurrent-disjoint semantics.

### 2. Selector verdict vocabulary (extends #251)

Extend `parseNodeVerdict` (`kaola-workflow-adaptive-schema.js:99`) — today `{pass, fail}`
— with a parallel `parseNodeSelector` that reads `^selector:[ \t]*([arm-id])` at column 0
from the classifier's `.cache/<classifier-id>.md`. Reuse the exact fence-blind, last-match-
wins, native-multiline-regex discipline (no classifier dependency, cross-edition
byte-identical). Returns `{ found, selector: <arm-id>|null }`.

### 3. Mechanical routing step (extends `commit-node`)

A new bracket in `kaola-workflow-commit-node.js` (sibling to the quorum/decision step): on
completing a `selector_source` node, read its selector verdict and write `n/a` to every
arm in the group **except** the named one. Fails closed: a missing/unparseable selector,
or a selector naming an id **not** in the declared group, is a typed refusal (halt), never
a silent "run them all" or "run none."

### 4. Validator rules (the walls)

The validator (`kaola-workflow-plan-validator.js`) gains, all fail-closed:

- **G-SEL-1 — exactly-one membership.** A `select(<group>)` group must have ≥ 2 arms, each
  with a `selector_source` resolving to a real, earlier read-only node that all arms
  `depends_on`. Exactly one is selected at runtime; the validator proves the *structure*,
  the script enforces the *count*.
- **G-SEL-2 — gates are never selectable.** A `code-reviewer` or `security-reviewer` node
  (or any gate role) inside a `select(...)` group is **out-of-grammar → typed refusal.**
  This is defense-in-depth: the runtime post-dominance-execution cross-check already
  rejects an `n/a` gate that covers a `complete` node (validator lines 295–321), so a gate
  can never be silently routed around even if selected away — but selectability of a gate
  must be refused at *author* time too, not merely caught at the barrier.
- **G-SEL-3 — post-dominance over the superset.** Unchanged machinery: gates must
  post-dominate every arm. Because all arms are present in the frozen graph, this is
  strictly more conservative than post-dominating only the taken arm. An `n/a` arm that
  wrote nothing is already invisible to the write-attribution check (validator line 455),
  so skipping an arm cannot smuggle an unreviewed write.
- **G-SEL-4 — disjoint or identical write sets across arms.** Two arms that might each run
  (they cannot — exactly one does) still must not *declare* the same file, so a stale
  declaration can never be mis-attributed. Reuse `disjointWriteSets()`.

### 5. Governance (§5 risk table)

Risk is assessed over the **union of all arms** (the superset), exactly as today — the
plan is frozen with every arm visible, so a write-role arm makes the plan `ask`, a
sensitive arm forces G2, etc. The classifier itself is read-only → **zero** blast radius,
so adding the selector never *raises* risk on its own. Net effect on authorization:
selective execution can only *lower* realized blast radius (one arm instead of all), while
the *authorized* envelope stays the conservative union. No safety gate moves.

### 6. Verdict: **Adapt** (in the catalogue's Adopt/Adapt/Reject framing)

Classify-and-act is **Adapted**, not Adopted whole: the prose-routing form is **Rejected**
(out-of-grammar, like `loop-until-dry`'s agent predicate); the **script-decidable**
selector form is adopted, mirroring how `adversarial-verify` kept the tally mechanical and
in the orchestrator. One new primitive (the selector verdict + routing step), no new shape,
no new role, every invariant preserved.

## What this is explicitly NOT

- **Not runtime DAG mutation.** No node is created, and no edge is added, at run time. The
  frozen `plan_hash` is unchanged in meaning.
- **Not agent-prose routing.** The selector is a structured `.cache` verdict consumed by a
  script. An "I'll decide which arm looks right" main-session judgment is out-of-grammar.
- **Not gate-selectable.** Marking a `code-reviewer`/`security-reviewer` selectable is a
  typed refusal (G-SEL-2), independent of the existing barrier cross-check.
- **Not unbounded.** Exactly one of N (a fixed, frozen N ≤ a small cap) arms runs; this is
  not a general `switch` with a default-fallthrough or runtime-discovered arms.

## Out of scope (named, not hidden)

- **Tournament as a first-class bracket shape.** Pairwise-judge brackets are expressible
  today as hand-wired `depends_on` and are rare in a code-change workflow; a native
  `bracket` shape is deferred as low-value ergonomics, consistent with the 2026-06-02
  "no fourth production" stance.
- **A `synthesize`/`reduce` shape keyword.** The reduce/join node is already "a node that
  `depends_on` the whole group," and the 2026-06-02 doc explicitly declined a join-policy
  annotation as inert on the sequential-checkpointing substrate. Documenting the recipe
  (this document + the README) is the chosen treatment, not a keyword.
- **Write-role judge-panel / N competing implementations.** Already **Rejected** by the
  catalogue (maximally-overlapping write sets; no winner-merge/loser-discard mechanism over
  the single-writer ledger). Selective execution does **not** revive it: its arms are
  *mutually-exclusive* (one runs), not *competing* (all run, pick a winner).

## Acceptance criteria (for the issue)

1. A `select(<group>)` plan with a read-only `selector_source` and ≥ 2 disjoint arms
   validates `in-grammar`; a single-arm or gate-containing group is a typed refusal
   (G-SEL-1/G-SEL-2).
2. `parseNodeSelector` (or equivalent) reads a column-0 `selector: <arm-id>` from
   `.cache`, fence-blind, last-match-wins, cross-edition byte-identical; unit-covered in
   the schema module.
3. The routing step marks exactly the unselected arms `n/a`, recomputed from durable rows
   on resume; a missing/foreign selector halts (fail-closed), never runs-all/runs-none.
4. Gate post-dominance and write-attribution hold over the superset; an `n/a` arm cannot
   smuggle an unreviewed write (existing checks, re-asserted under selection).
5. `simulate-workflow-walkthrough.js` gains a selective-execution case that flips the
   currently-`refuse` `select()` fixture (this document's tripwire) to `in-grammar`.
6. Parity: the new schema constant/helper is byte-synced across all four editions
   (`validate-script-sync.js`); the renamed forks get a structural/region assertion.

## Companion deliverables (shipping alongside this design, not blocked on the issue)

- **README** — a "Supported adaptive patterns" subsection documenting the five
  already-supported recipes (sequence/plan-implement, fan-out-and-synthesize,
  adversarial-verify, bounded loop) with their governance decision, so users understand
  how an adaptive plan is composed. Classify-and-act is listed as "planned" with a link to
  the issue.
- **Simulation tests** — a `testAdaptivePatternLibrary` case authoring a canonical plan per
  supported pattern, asserting the live validator verdict, plus the `select()`-is-refused
  tripwire that the issue will flip.
