<!-- KW-COMPACT-RECOVERY-START -->
# Kaola-Workflow compact recovery

Recovery marker: `KW-COMPACT-RECOVERY-V2`.

# Global Workflow Contract

Universal contract. Project instructions supplement verified local facts and constraints. A
project exception must state its scope and must not weaken higher-priority instructions or host
safety boundaries.

## First Principles

1. Correct first; never trade correctness for speed or cost.
2. Then save human time without weakening correctness.
3. Then spend as little as possible.
4. Machines decide facts; humans decide values. Continue inside already-granted authorization and
   scope. Unauthorized irreversible or value-laden calls still go to the user.
5. Own your own verdicts. Local evidence, not an external system, decides done.

## Premise and evidence

- Measure current truth before an earlier claim shapes work; carry corrections forward.
- Read the target before writing. Distinguish evidence, inference, and unknown. Verify at the
  scope of the change.
- Keep changes surgical. Serve the user's goal and proven problems; avoid speculative mechanisms. A
  user-requested feature is not refused for lack of a prior observed failure.

## Backlog and durable state

- The forge's open issue list is backlog truth; later comments with explicit corrections win.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local roadmap file that survives. Nothing
  else is generated or tracked under `.roadmap/`; there is no local backlog mirror to refresh.
- Declare top-priority labels in `kaola-workflow/config.json` under `priority_top_tier_labels`.
- `kaola-workflow/{project}/workflow-state.md` records the claim;
  `kaola-workflow/{project}/mission-list.md` records the run.
- Organizing issues does not auto-claim and does not auto-create a Mission List. Daily governance
  does not auto-create a run; when an active run exists, other operations respect it.

## Mission List

- One run has one Mission List with `item`, `status`, `dispatched`, and `result`.
- Use three write moments: create; write `dispatched` before the work goes out, including where the
  output will land; then write `result`. A completed item and its result are immutable. One dispatch
  has one result, including `FAIL` or `BLOCKED`.
- A mission is a recoverable outcome. A failed command, intermediate finding, repair attempt, or
  review round does not create another mission. `BLOCKED` means the current owner cannot safely or
  legitimately continue.
- Resume by trusting done results, reconciling in-flight locators, and continuing the frontier: the
  list minus done minus in-flight.
- Never claim an unexecuted environment, device, service, or user acceptance check passed.
  Mutation invalidates affected PASS evidence.
- Finalization, issue closure, archive, and sink are not Mission List items. The last mission only
  establishes readiness; lifecycle records own the transaction's final truth.

## Resume the active operation

Read project `AGENTS.md`, active `workflow-state.md`, and `mission-list.md`. With open work,
completely reload the installed Workflow Next prompt and resume its frontier without intake or
claim. When all missions are done,
completely reload the installed Kaola-Workflow Finalization prompt and continue from its receipts.

The Next or Finalization reload above already carries the full runtime dispatch contract and runtime adapter facts, so this recovery step does not restate them.

<!-- KW-COMPACT-RECOVERY-END -->
