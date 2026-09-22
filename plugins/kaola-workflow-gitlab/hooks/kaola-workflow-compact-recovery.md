<!-- KW-COMPACT-RECOVERY-START -->
# Kaola-Workflow compact recovery

Recovery marker: `KW-COMPACT-RECOVERY-V2`.

# Global Workflow Contract

Universal contract. Project instructions supplement verified local facts and constraints. A
project exception must state its scope and must not weaken higher-priority instructions or host
safety boundaries.

## First Principles

1. Machines decide facts; humans decide values. Continue inside already-granted authorization and
   scope. Unauthorized irreversible or value-laden calls still go to the user.
2. Own your own verdicts. Local evidence, not an external system, decides done.

## Premise and evidence

- Read the target before writing.
- Keep changes surgical. Serve the user's goal and proven problems; avoid speculative mechanisms.

## Backlog and durable state

- The forge's open issue list is backlog truth; later comments with explicit corrections win.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local roadmap file that survives. Nothing
  else is generated or tracked under `.roadmap/`; there is no local backlog mirror to refresh.
- Declare top-priority labels in `kaola-workflow/config.json` under `priority_top_tier_labels`.
- `kaola-workflow/{project}/workflow-state.md` records the claim;
  `kaola-workflow/.ledger/issue-<N>.jsonl` in the main checkout records the run.
- Organizing issues does not auto-claim and does not auto-create a mission ledger. Daily governance
  does not auto-create a run; when an active run exists, other operations respect it.

## Mission Ledger

- One run has one mission ledger at `<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`, where `N`
  is the run's `issue_number`. It is gitignored, lives only in the main checkout, and is never
  copied into a worktree.
- One JSON object per line, one line per mission, keys exactly `n`, `name`, `details`, `status`;
  `status` is `todo`, `in-flight`, `done`, `failed`, or `blocked`. No header and no other keys.
- Only the run's Main Orchestrator writes it, rewriting the whole file, at three write moments:
  create with `todo`; before the work goes out, set `in-flight` and add to `details` where it went,
  including where the output will land; then set the terminal status and add where the outcome
  landed. A `done` or `failed` line is immutable. One dispatch has one result, including `failed`
  or `blocked`.
- A mission is a recoverable outcome. A failed command, intermediate finding, repair attempt, or
  review round does not create another mission. `blocked` means the current owner cannot safely or
  legitimately continue.
- Resume by trusting done lines, reconciling in-flight locators, and continuing the frontier: the
  ledger minus done minus in-flight.
- Mutation invalidates affected PASS evidence.
- Finalization, issue closure, archive, and sink are not missions. Archive moves the ledger to
  `kaola-workflow/archive/<project>/mission-ledger.jsonl`. The last mission only establishes
  readiness; lifecycle records own the transaction's final truth.

## Resume the active operation

Read project `AGENTS.md`, active `workflow-state.md`, and the run's mission ledger
(`<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`). With open work,
completely reload the installed Workflow Next prompt and resume its frontier without intake or
claim. When all missions are done,
completely reload the installed Kaola-Workflow Finalization prompt and continue from its receipts.

The Next or Finalization reload above already carries the full runtime dispatch contract and runtime adapter facts, so this recovery step does not restate them.

<!-- KW-COMPACT-RECOVERY-END -->
