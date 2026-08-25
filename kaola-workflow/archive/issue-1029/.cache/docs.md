# Issue #1029 documentation docking

## Verdict

DOCKED. The settled `main-authored-handoff` behavior changes user-facing routing guidance in the
`next` and `finalize` surfaces, so the public overview, contributor contract, architecture note,
API boundary, and current changelog all needed scoped updates. No new workflow record, prompt
schema, CLI/API field, state field, gate, or role-profile contract was documented.

## Candidate and evidence

- Candidate worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`
- Baseline SHA: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a`
- Canonical production source: `templates/routing/slots.js`, `SLOTS['main-authored-handoff']`
- Insertion sources: `templates/routing/next.skeleton.md` and `templates/routing/finalize.skeleton.md`
- Frozen wording and implementation evidence reviewed from:
  - `kaola-workflow/issue-1029/.cache/handoff-wording.md`
  - `kaola-workflow/issue-1029/.cache/implementation.md`
  - `kaola-workflow/issue-1029/.cache/tdd-red.md`
- The complete slot remains source-owned; docs link to the source paths and do not copy its
  3,043-byte agent-facing block.

## Changed documentation paths and placement rationale

- `README.md` — added a compact user-facing outcome immediately after the role overview. It
  explains that named-role briefs are self-sufficient without inherited conversation, bounded and
  falsifiable, and subordinate to installed profiles and main's authority; it points to the
  canonical slot and the two skeletons.
- `docs/conventions.md` — added the contributor contract beside the existing dispatch guidance.
  It records the seven labels in order, sparse packet/no `N/A` and no profile repetition rules,
  task-specific role-family specialization, result-not-method acceptance, and the stop/report
  boundary. It explicitly preserves dispatch-vs-inline judgment and states that the packet is not
  a record, prompt schema, grader, score, or approval gate.
- `docs/architecture.md` — added a routing-specific subsection under Editions and runtimes. It
  identifies the single canonical slot, unconditional next/finalize-only insertion, the derived
  7 runtimes x 3 forges x 2 topics = 42 surface universe (12 tracked + 30 additive), and the
  byte/semantic/mutation oracle with its verified 823 assertions and 126 caught target-only
  mutants. Existing broader runtime-count prose was not changed.
- `docs/api.md` — added the routing-surface interface at the command-surface boundary. It states
  the relationship to existing model/tier dispatch and makes the no-new-CLI/API/envelope/mission-
  list/workflow-state-field boundary explicit.
- `CHANGELOG.md` — added one concise #1029 bullet under `[9.16.0]` / `Added`, describing the
  self-sufficient seven-label named-role brief and the unchanged mission-list/CLI/state schema.
- `kaola-workflow/issue-1029/.cache/docs.md` — this evidence record, written at the requested
  path; it is not a shipped documentation surface.

## Changed files reviewed for documentation impact

The candidate's behavior diff requiring docking is `templates/routing/slots.js`, the two routing
skeletons, and the 12 generated tracked next/finalize command and skill surfaces. The changed
test-owned files (`templates/routing/required-blocks.js` and `scripts/test-route-reachability.js`)
only make the settled contract and its derived-surface oracle measurable; they require no separate
user-facing prose beyond the architecture/oracle note. The generated surfaces were not hand-edited
by this documentation leg.

## Commands and exits

All commands below ran from the candidate worktree unless stated otherwise:

```text
$ git status --short --branch
exit 0

$ git diff --check
exit 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit 0

$ node scripts/test-route-reachability.js
Route-reachability test passed (823 assertions).
exit 0
```

Read-only `rg`, `sed`, `git diff`, and `git diff --name-status` inspections all completed without
errors. The full four-chain production validation was not rerun by this docs-only leg; the focused
route oracle and generator check cover the documented routing contract, and the implementation/TDD
evidence records the same candidate's production and mutation validation.

## Exclusions checked

- No production, test, generated-surface, role-profile, `docs/decisions/`/ADR, workflow-state,
  mission-list, package metadata, issue/PR state, commit, push, or install changes were made by
  this leg.
- The existing overall runtime-count wording, including the architecture's broader edition
  inventory, was deliberately left untouched because stale runtime counts belong to #1028.
- The full agent-facing block was not duplicated into any documentation file; source links point
  to `templates/routing/slots.js` and the two skeletons.
- No provenance was added to agent-facing surfaces, and no new dispatch mandate, persisted record,
  machine-grading schema, score, approval gate, or state/API field was introduced.

## Remaining documentation risks

The repository still contains pre-existing broader runtime-count wording that may be stale; it is
the explicit #1028 boundary and remains intentionally unmodified. The local routing-specific
42-surface count in `docs/architecture.md` is reconciled to the verified oracle and does not
attempt to repair that separate inventory prose. No other documentation contradiction was found.
