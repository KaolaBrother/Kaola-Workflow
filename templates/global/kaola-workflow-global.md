# Global Workflow Contract

Universal contract. Project instructions add only verified local facts and stricter constraints.

## First Principles

1. Correct first; never trade correctness for speed or cost.
2. Then save human time without weakening correctness.
3. Then spend as little as possible.
4. Machines decide facts; humans decide values. Escalate irreversible or value-laden choices.
5. Own your own verdicts. Local evidence, not an external system, decides done.

## Authorization scope

- An authorization given in conversation remains valid for the exact task and scope it names.
- Ask again only for a new, expanded, or materially different irreversible or value-laden decision;
  authorization does not silently extend to adjacent work or owner-authored content outside that
  scope.

## Premise and evidence

- Measure current truth before an earlier claim shapes work; carry corrections forward.
- Read the target before writing. Verify behavior from documentation, source, or a real run; name
  unknowns honestly.
- Keep changes surgical. Add only what an observed failure demands; build no speculative gates.

## Backlog and durable state

- The forge's open issue list is backlog truth; later comments override earlier issue text.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local roadmap file that survives. Nothing
  else is generated or tracked under `.roadmap/`; there is no local backlog mirror to refresh.
- Declare top-priority labels in `kaola-workflow/config.json` under `priority_top_tier_labels`.
- `workflow-state.md` records the claim; `kaola-workflow/{project}/mission-list.md` records the run.

## Mission List

- One run has one Mission List with `item`, `status`, `dispatched`, and `result`.
- Use three write moments: create; write `dispatched` before the work goes out, including where the
  output will land; then write `result`. A completed item and its result are immutable. One dispatch
  has one result, including `FAIL` or `BLOCKED`.
- A mission is a recoverable outcome, not a specification, selector, assertion, command, review
  round, role, model, dependency edge, or write set. A failed command, intermediate finding, repair
  attempt, or review round does not create another mission.
- Append a mission only for a new recoverable outcome with new custody or a newly discovered
  independent causal class. `BLOCKED` means the current owner cannot safely or legitimately continue.
- Resume by trusting done results, reconciling in-flight locators, and continuing the frontier: the
  list minus done minus in-flight.

## Custody, carrier, and failure frontier

- Custody decides who may judge meaning; carrier decides where work runs. Re-evaluate per mission.
- Dispatch to save context, add independent judgment, or open an independent frontier; keep one
  owner when cohesive production and integration cost require it.
- Establish focused acceptance, inventory the causal class, repair under shared custody, freeze,
  then review and validate those exact bytes. Mutation invalidates affected PASS evidence.

## Test custody and completion

- Independent test custody owns acceptance meaning; production custody may maintain only mechanical
  fixtures or harness plumbing that preserves it.
- Define verifiable success, run focused proof then required integration, and record outcomes.
- Never claim an unexecuted environment, device, service, or user acceptance check passed.
- Finalization, issue closure, archive, and sink are not Mission List items. The last mission only
  establishes readiness; lifecycle records own the transaction's final truth.
