# 12. The finalize seam is orchestrator-owned; its mechanical residue is one transaction

Date: 2026-07-26
Status: Accepted
Issue: #816
Supersedes: the contractor sole-home relocation (issue #277 M3, recorded in ADR
0002 and `docs/conventions.md` § Subagent Seam Rule) and the finalize attestation
mirror (issue #338, `finalize_contractor_attested` / `--attest-contractor-spawn`).
Closes: the Finalization exception ADR 0004 carried forward.
Narrows: ADR 0002's lean-orchestrator split to the planner seam only.

## Context

The `contractor` was chartered as the lean-orchestrator's mechanical bookkeeper:
never dispatch, never judge. Every duty it held then migrated out from under it —
the node lifecycle to `kaola-workflow-adaptive-node.js` (ADR 0005), the claim seam
to `workflow-planner` + `kaola-workflow-adaptive-handoff.js` (ADR 0003), the
consent-halt clear to the script-owned `clear-halt` subcommand. What remained was
one seam: the Finalization archive, roadmap-mirror regen, and `chore: finalize`
staging commit.

Look at what that sole home actually contained. Step 8a was an ~80-line *scripted*
mirror block whose ledger-regression guard already shelled
`kaola-workflow-ledger-compare.js`. Step 8b was literally one `cmdFinalize` call.
Step 7 was a `git add`. Step 8 was a `git add && git commit`. Steps 8c/8c.2 were
read-only verification of receipts the orchestrator produced — the role was
forbidden to run the chains itself. An agent was doing what scripts should own,
wrapped around judgment it was forbidden to exercise.

That prohibition is the real cost. Finalization is the exception-rich phase —
receipt staleness, red chains, ledger-regression refusals, sink dead-ends — and a
role that must not judge can only *surface* every off-path event back to the
orchestrator. On the unhappy path the run paid twice: the dispatch handoff **and**
the orchestrator's reasoning. On the happy path the entire delegated body was one
script call. Either way the delegation bought nothing.

The original context-economy rationale (inline residue taxes every later decision)
is also at its weakest here: finalization is the last phase, so there are few later
decisions left to tax. And the cheap-standard-tier-vs-expensive-orchestrator token
argument only held while the mechanical body was long prose; once it is one script
call returning a typed emit, that argument dies too.

## Decision

**Judgment-adjacent seams ride the orchestrator; mechanical floors ride scripts —
no judgment-forbidden agent in between.**

1. **Ownership inversion.** The finalize seam is orchestrator-owned by design. The
   bookkeeping role retires across every runtime (Claude `agents/`, the three Codex
   `agents/*.toml` trees, the generated opencode and Kimi editions). Finalization
   was its only remaining seam, so this is full role retirement, not a scope cut.

2. **The residue folds into `cmdFinalize` as one resumable transaction.** In step
   order: Step 8a artifact mirror (with the ledger-regression guard the bash
   choreography used to carry), Step 8b archive + status close, Step 7 roadmap
   staging, Step 8 `chore: finalize {project}` commit gate. The orchestrator runs
   one command and reasons over whatever typed emit comes back. Two guardrails
   carry over unchanged, now as typed refusals inside the transaction:
   - `implementation_commit_missing` — the machinery never authors the
     implementation commit. It is surfaced and the transaction stops; it is never
     repaired by sweeping the change into the bookkeeping commit.
   - `staging_guard_foreign_archive` / `staging_guard_multi_project` — the
     single-project staging rule, moved out of command prose.

3. **Attestation inversion.** `finalize_contractor_attested`, the
   `--attest-contractor-spawn` back-fill, and the "finalize seam may have been run
   inline by main session" warning all treated inline execution as suspect. Inline
   is now the design, so the field, the flag's effect, and the warning retire.
   **Legacy tolerance on read is mandatory:** a closure receipt carrying the field
   and an archived `## Attestation` section carrying it are read and kept verbatim,
   never rewritten. `claim_planner_attested` is untouched.

4. **Validators re-pin bidirectionally.** Every finalize surface must carry **no**
   bookkeeping-role dispatch **and** must carry the one-call transaction. A
   re-introduced dispatch reds the chain; so does a dropped transaction call.

## Consequences

- The `workflow-planner` is deliberately **kept**. The claim/author/freeze seam at
  run start is a genuine reasoning delegation, where orchestrator context economy is
  at its maximum — different economics, different verdict.
- As orchestrator reasoning strengthens, this design gets better automatically; the
  bookkeeper design could only get more redundant.
- Installers gain a stale-install sweep obligation: install **and** uninstall remove
  previously-installed profiles of the retired role on every runtime, or a retired
  profile lingers and shadows.
- Crash-resume now has three named re-entry points, each covered by a test:
  pre-archive, post-archive/pre-commit (`finalize_incomplete`), and post-commit
  (`already_finalized`, a clean no-op). The mirror deliberately does not resurrect
  an archived live folder.
- The mirror treats `workflow-state.md` / `workflow-tasks.json` as DEST-OWNED: the
  worktree holds the complete run authority, so a staler main copy is never pushed
  backwards over it. The plan file keeps the stronger explicit guard (refuse, or
  copy a source at least as complete).

## Rejected alternatives

- **Keeping the role for the happy path only.** Dual custody of one seam is two
  wordings of one rule, and the off-path is where the seam actually lives; the happy
  path is one script call that needs no agent.
- **Inlining the mechanical body into command prose.** Moving the 80-line mirror
  choreography into six-plus finalize surfaces trades an agent for prose duplication
  and violates script-owned atomicity; the body belongs in the transaction script.
- **A vestigial `finalize_contractor_attested: inline_by_design` constant.** A
  receipt field whose value can never vary is noise; legacy tolerance on read covers
  the archive history.
- **Retiring `workflow-planner` in the same stroke.** Different economics — see
  Consequences.
