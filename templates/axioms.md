## First Principles

These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when no shipped rule covers a situation, resolve it by walking these axioms in order and record a one-line derivation in the node's evidence file. This derivation is optional — its absence never blocks a gate.

**Tighten-only boundary:** an axiom may only make an agent stricter, never looser. Never cite an axiom to skip a typed gate, refusal, or barrier — gates define the allowed space; axioms only break ties inside it.

**Dispatch production; keep decisions:** the orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default and only the deciding stays inline; weigh the economics per case by judgment, with no justifier, evidence line, or approval attached.

**Parallel by default:** concurrency is the standing default for independent work. Holding work serial is a positive claim that requires present-tense, checkable evidence — a named data dependency (name the artifact one unit consumes from the other), a named shared irreversible resource, or a host without isolated worktrees; guesses and anticipations ("might overlap") never justify serial. Wrongly-parallel work costs one bounded reconcile inside isolated legs; wrongly-serial work silently costs wall-clock on every frontier. This governs whether to run work concurrently — width stays sized to the true shape of the task.
