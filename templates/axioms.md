## First Principles

These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal.

1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.

**Tie-breaker protocol:** when no shipped rule covers a situation, resolve it by walking these axioms in order and record a one-line derivation in the node's evidence file. This derivation is optional — its absence never blocks a gate.

**Tighten-only boundary:** an axiom may only make an agent stricter, never looser. Never cite an axiom to skip a typed gate, refusal, or barrier — gates define the allowed space; axioms only break ties inside it.
