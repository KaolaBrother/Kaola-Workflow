# Advisor Gate Output — routing-core (issue #328)

## When consulted
Before substantive edits (after reading all 4 target files and the design/recon cache).

## Verdict
Approach is sound. Three structural items must be addressed before writing.

## Guidance received

### Item 1 — Distribution: selection vs claim pairs
- workflow-next pair = selection phase (Step 0). Put explicit-bundle entry, auto-bundle/issue-scout,
  compatibility rule, and Completion Contract bundle reconciliation here in full.
- adapt pair = claim phase. Document the planner's --target-issues startup call, bundle project/branch
  shape, and bundle finalization closure. Reference that the set was already selected by the router —
  do not re-host the issue-scout selection logic in adapt.
- Within each pair: mirror exactly. Content differs between pairs (selection vs claim) but must be
  identical within a pair.

### Item 2 — "Exactly one issue" contradiction
The Completion Contract in workflow-next.md and the /goal template note both assert single-issue
and would flatly contradict the new bundle section. Must EDIT these (not append around them).
Reconcile to "exactly one issue or one explicitly selected same-scope bundle." Preserve the real
invariant: no auto-continuation to an unselected next issue. State the distinction explicitly.

### Item 3 — issue-scout dispatch is prose, not a model-placeholder Agent block
design.md Decision 1 is explicit: {ISSUE_SCOUT_MODEL} deliberately does not exist and install.sh
render_command_file won't substitute it. Frame issue-scout as a read-only selection-time advisor
consistent with the router's existing dispatch-free Step 0. Restate it's read-only (cannot
claim/write/dispatch) and that scripts validate-but-never-select (#44).

### Process guidance
- Capture baseline FIRST (simulate-workflow-walkthrough.js, validate-script-sync.js,
  validate-*contracts*.js) before any edits, then again after. Record both.
- Know what the validators prove: these are .md files — validators check script byte-sync/contracts,
  not prose content. They prove non-regression.
- Scope: only the 4 declared files.
- Evidence goes to project-local kaola-workflow/issue-328/.cache/routing-core.md.

## Outcome
All three items addressed in the implementation:
1. workflow-next pair hosts selection logic; adapt pair hosts claim logic; each cross-references the other.
2. /goal template note and Completion Contract both updated in workflow-next pair.
3. issue-scout documented as inline routing prose (no {ISSUE_SCOUT_MODEL} placeholder).
