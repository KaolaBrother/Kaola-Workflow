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
cap, disjointness proof, justification, or fallback stigma attaches to the judgment; Workflow adds
no separate approval requirement, and dispatch remains subject to the active host/session permission
policy.
