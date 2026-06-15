# #486 — Question-shaped & bug-shaped issues: worked examples

Date: 2026-06-15

The adaptive path composes a task-shaped DAG for *any* shape of work. A **question without a settled
answer** ("which approach?", "is X viable?", "why does Y happen?") is served by **composing existing
roles** — never a special-case lane and **zero new grammar**. The classic open-question arc
**probe → assume → adversarially critique → converge** maps 1:1 onto `CANONICAL_ROLES` and the
`sequence`/`fanout` shapes.

The authoring guidance lives in `agents/workflow-planner.md` (Claude) and the three
`plugins/*/agents/workflow-planner.toml` Codex profiles, with a quick-reference subsection on all six
`kaola-workflow-adapt` routing surfaces (the 3 edition commands + the 3 Codex SKILL packs). The
contract validator pins the hint across all six (`scripts/validate-workflow-contracts.js`,
`adaptSurfaces486`), so a 4-of-6 propagation gap fails the chain. Every node table below is asserted
**in-grammar** by `testQuestionShaped486` in `scripts/simulate-workflow-walkthrough.js` (zero grammar
changes).

## The one hard constraint: freeze-once

The plan is frozen at authoring (`plan_hash`, immutable for the whole run); there is **no in-place
thaw**. "We don't know the answer yet" splits on one question — *does the SHAPE of the remaining work
depend on what the probe finds?*

## Case A — shape knowable, answer not

"X/Y/Z?", "is A viable?" — author the whole investigation DAG up front. All nodes are read-only, so no
`code-reviewer` is required (G1 triggers only on code-producing nodes); the `adversarial-verifier`
critiques the leading answer against the probe evidence.

```
| id       | role                | depends_on | declared_write_set | cardinality | shape    |
| probe    | code-explorer       | —          | —                  | 1           | sequence |
| assume   | planner             | probe      | —                  | 1           | sequence |
| critique | adversarial-verifier| assume     | —                  | 1           | sequence |
| converge | planner             | critique   | —                  | 1           | sequence |
| done     | finalize            | converge   | —                  | 1           | sequence |
```

For the **enumerable** version ("X, Y, or Z?"), use `select(<group>)` with a read-only `selector_source`
probe and ≥2 arms (#263).

### Read-only critic fan-out (inherits #472 concurrent dispatch)

PROBE and FALSIFY are read-only frontiers, so authored as fan-outs they ride #472's concurrent
dispatch and the validator's existing majority-refute barrier (`plan-validator.js:688-707`) — width is
the planner's call, sized to genuinely-independent angles.

```
| id       | role                | depends_on        | declared_write_set | cardinality | shape           |
| probe-a  | code-explorer       | —                 | —                  | 1           | sequence        |
| probe-b  | knowledge-lookup    | —                 | —                  | 1           | sequence        |
| assume   | planner             | probe-a,probe-b   | —                  | 1           | sequence        |
| crit1    | adversarial-verifier| assume            | —                  | 1           | fanout(critics) |
| crit2    | adversarial-verifier| assume            | —                  | 1           | fanout(critics) |
| crit3    | adversarial-verifier| assume            | —                  | 1           | fanout(critics) |
| converge | planner             | crit1,crit2,crit3 | —                  | 1           | sequence        |
| done     | finalize            | converge          | —                  | 1           | sequence        |
```

## Case B — the shape itself depends on the findings

"why is Y flaky?" — files/roles/write-set are unknowable until probed. A single frozen DAG cannot
express "probe, then decide the rest of the plan." Author a **short read-only shaping run**, then the
orchestrator **re-plans** as a fresh run (new `plan_hash`) authored FROM the findings — pure
composition, no in-place mutation:

```
   +- shaping run (short, read-only) -+        +- the real run (now authorable) -+
   |  code-explorer / knowledge-lookup|  --->  |  planner authors the build DAG  |
   |  -> planner: findings + the      | re-plan|  FROM the findings -> tdd-guide/|
   |     recommended plan SHAPE       | (fresh |  implementer / ... -> finalize  |
   |  -> finalize: findings           |  hash) |                                 |
   +----------------------------------+        +---------------------------------+
```

(A typed `findings_ready -> replan` fusion is explicitly **deferred** — see below. `revalidateForResume`
re-checks the hash precisely to forbid mid-flight mutation.)

## Bug flavor of Case B (phenomenon clear, cause/fix unclear)

The strongest-fit Case B and the least theatrical critique loop — a bug carries its own falsification
oracle: the reproduction. The role-capability split is load-bearing: `code-explorer`/`knowledge-lookup`
are read-only and cannot run a command; `adversarial-verifier` is read-only but **has Bash**, so it can
EXECUTE the existing reproduction to test a hypothesis without writing; `tdd-guide` (a write role)
authors the RED reproduction test in the **fix run**, after the re-plan.

```
  DIAGNOSIS (read-only shaping run — fix shape still unknown ⇒ Case B)
   probe   code-explorer        read the failing path + logs -> candidate root causes   [Read/Grep/Glob]
   assume  planner              2-3 root-cause hypotheses, each "a repro shows ___ if true / ___ if false"
   falsify adversarial-verifier RUNS the existing repro (has Bash, read-only) + asks
                                "root cause or symptom mask?"
   converge planner             findings: localized cause + recommended FIX shape
   finalize: findings --- re-plan (fresh plan_hash) --->
  FIX run (a normal build DAG — shape now known)
   repro   code-explorer        read the failing path
   fix     tdd-guide            RED: the reproduction test -> fix -> GREEN          (declared_write_set)
   review  code-reviewer        post-dominates the fix (G1)
   done    finalize
```

The FIX-run node table (asserted in-grammar):

```
| id     | role          | depends_on | declared_write_set | cardinality | shape    |
| repro  | code-explorer | —          | —                  | 1           | sequence |
| fix    | tdd-guide     | repro      | lib/buggy.js       | 1           | sequence |
| review | code-reviewer | fix        | —                  | 1           | sequence |
| done   | finalize      | review     | —                  | 1           | sequence |
```

Two guardrails:
1. **The falsification criterion IS a reproduction.** Do not converge on a fix until the phenomenon
   reproduces and the hypothesis predicts it; the verifier must explicitly ask **"root cause or symptom
   mask?"** (the classic failure is making the test green without understanding why — e.g. masking a
   flake with a retry).
2. **Cannot reproduce after a bounded probe → escalate, do not guess-fix.** Route to the `consent`-halt
   valve (`write-halt --reason consent`) rather than ship a speculative patch; a guess-fix to an
   unreproduced bug looks done and is not.

## Escalate values, not facts

A value / standing / irreversible call (and the un-reproducible bug above) goes to the existing
`consent`-halt valve — never bolt an approval gate onto the planner. `decision:ask` stays advisory audit
metadata; planner-first (#44/#287) is intact; this adds **no gate and no thaw**.

## Relationship to #472 / #463

- **#472 (read-axis dispatch)** is an ENABLER this design inherits: PROBE and FALSIFY are read-only
  frontiers, so authored as fan-outs they ride #472's concurrent dispatch directly (shipped, proven live
  in PR#481), including the validator's `adversarial-verifier` majority-refute fan-out.
- **#463 (write-axis dispatch)** is what the *fix run* half (`tdd-guide` RED→GREEN) would ride; write
  frontiers serial-degrade until per-leg isolation lands. This issue does **not** depend on #463 — the
  investigation half is the value.

## Deferred / out of scope (recorded)

In-place DAG thaw; `findings_ready -> replan` fusion into one run; an answer-only non-merge terminal;
a producer-keyed verifier reasoning floor; and a write-capable throwaway **spike** shape (heisenbug
localization that needs to write instrumentation).
