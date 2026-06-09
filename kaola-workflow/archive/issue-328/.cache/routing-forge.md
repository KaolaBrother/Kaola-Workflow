# routing-forge evidence — issue #328 bundle-lane routing (forge ports)

## task
Mirror the bundle routing prose that routing-core added to the root command files into
the GitLab and Gitea command copies. Four files changed (the declared write set).
Additive only — single-issue behavior unchanged (AC#1).

## non_tdd_reason
command prose routing (forge ports) — mirror of root bundle routing modulo forge nouns,
no behavioral logic. Category: config / IaC / scaffolding (command markdown files carry
routing prose, not executable logic; the proof is regression-green, not a RED→GREEN test).

## write_set
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

## content added (per file)

### Both forge workflow-next.md
1. `/goal` paragraph: added "or one explicitly selected same-scope bundle; auto-routing
   to an unselected issue after closure is still forbidden" clause.
2. New "## Startup Step 0c — Bundle Lane (Multi-Issue)" section inserted before the
   forge's PR/MR Intent Capture section — with three subsections:
   - Explicit-bundle entry: KAOLA_TARGET_ISSUES=42,47,53 / --target-issues;
     project/branch shape (bundle-42-47-53 / workflow/bundle-42-47-53);
     adaptive-path-only; compatibility rule (KAOLA_TARGET_ISSUE unchanged; both → target_ambiguity).
   - Auto-bundle entry (AC#5/AC#6): issue-scout read-only agent; orchestrator STATES
     set before claim; scripts validate never select (#44); fallback to single-issue (AC#6).
   - Bundle closure: one finalization closes all issues; one merge/PR or merge/MR sink
     (gitea: "merge/PR"; gitlab: "merge/MR" — matching each forge's existing PR/MR noun).
3. "Bundle:" pointer added inside Step 0a-2 Fresh adaptive item.
4. Completion Contract updated to bundle-aware all-or-nothing version.

### Both forge kaola-workflow-adapt.md
5. Appended "## Bundle Lane — Multi-Issue Adaptive Claim" section with 6 subsections:
   - Bundle startup call: --target-issues A,B,C; compatibility rule.
   - Bundle project and branch shape: bundle-42-47-53, workflow/bundle-42-47-53,
     three additive workflow-state.md fields.
   - Bundle is adaptive-only.
   - Bundle authoring: one implementation-lane DAG; union labels.
   - Bundle finalization: all-or-nothing; one sink; one closure receipt.
   - Claim refusals table: 10 bundle-specific typed refusal codes.
   The adapt pair references "workflow-next.md Step 0 Bundle Lane" (matching root
   verbatim; not "Step 0c") rather than re-hosting issue-scout logic (correct
   distribution per routing-core evidence).

## forge noun differences applied
- gitlab workflow-next: "merge/MR sink" (gitlab uses MR nouns throughout)
- gitea workflow-next: "merge/PR sink" (gitea retains PR nouns throughout)
- No forge-specific branch prefix: branch is workflow/bundle-42-47-53 (verified in
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js L842:
  `const project = 'bundle-' + targets.join('-')` → branch = workflow/bundle-42-47-53
  — same as root; no forge prefix in the actual code)

## verification_commands

### before (baseline)
1. node scripts/simulate-workflow-walkthrough.js → EXIT 0
2. node scripts/validate-script-sync.js → EXIT 0

### after (regression-green)
1. node scripts/simulate-workflow-walkthrough.js → EXIT 0
2. node scripts/validate-script-sync.js → EXIT 0

## regression-green
Both checks passed before and after the edits. No behavioral scripts were modified;
these are documentation-only changes to forge command markdown files.

## grep confirmations (all 4 forge command files)

### target-issues occurrences
- plugins/kaola-workflow-gitlab/commands/workflow-next.md: 3
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md: 4
- plugins/kaola-workflow-gitea/commands/workflow-next.md: 3
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md: 4

### bundle occurrences
- plugins/kaola-workflow-gitlab/commands/workflow-next.md: 21
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md: 11
- plugins/kaola-workflow-gitea/commands/workflow-next.md: 21
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md: 11

### issue-scout occurrences (workflow-next pair only — correct per design Decision 1)
- plugins/kaola-workflow-gitlab/commands/workflow-next.md: 3
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md: 0 (correct: references workflow-next section)
- plugins/kaola-workflow-gitea/commands/workflow-next.md: 3
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md: 0 (correct: references workflow-next section)

### workflow/bundle-42-47-53 branch naming (forge-correct: no forge prefix)
- plugins/kaola-workflow-gitlab/commands/workflow-next.md: 1
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md: 1
- plugins/kaola-workflow-gitea/commands/workflow-next.md: 1
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md: 1

## before_result
simulate-workflow-walkthrough.js: EXIT 0
validate-script-sync.js: EXIT 0

## post-review fix
Advisor review found one verbatim-drift: both adapt files said "Step 0c" but root says
"Step 0". Reverted to "Step 0" in both forge adapt files. Both regression checks
re-confirmed green after the fix.

## after_result
simulate-workflow-walkthrough.js: EXIT 0 (before + after fix)
validate-script-sync.js: EXIT 0 (before + after fix)
