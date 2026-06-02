# advisor — issue-218 closure gate

## Verdict: PROCEED — nothing blocks closing #218
Acceptance met, both reviewers cleared, npm test green across 4 editions, docs DOCKED.

## Decisions
1. Close #218 now: YES. "Finish the issue" authorizes the close; sink: merge matches this repo's direct-to-main convention (#217/#219 were direct commits, no PRs). No PR needed.
2. Classifier follow-up: SURFACE it, do NOT auto-create the GitHub issue. Intersection of closure-gate "ask before creating issues" + /goal "follow advisor" → conservative reading: document + surface to user in the issue close comment and final report; let the user decide whether to file. Auto-filing is outward-facing and not required to finish #218.

## Sink-step risks to handle deliberately
3. Staging hygiene (non-obvious trap): untracked `docs/investigations/dynamic-workflow-composition-2026-06-02.md` (endorsed-design doc, unrelated, pre-existing) is NOT caught by the Staging Guard (which only counts kaola-workflow/* projects). Do NOT `git add -A`/`git add .`. Stage EXPLICITLY: 4 code/test files + CHANGELOG.md + roadmap delete/regen (.roadmap/issue-218.md deletion + ROADMAP.md) + archived kaola-workflow/archive/issue-218/ folder. Nothing else.
4. CHANGELOG rebase conflict with #216: sink-merge rebases onto latest origin/main. If the other machine merged #216, both entries target the top of [Unreleased] Fixed → possible CHANGELOG.md conflict. This is MECHANICAL (additive collision), consistent with the user's "no conflicts" constraint which was about substance (none). If sink-merge exits 1 on a CHANGELOG-only conflict → resolve by KEEPING BOTH entries and continue. If any conflict lands in the port *-active-folders.js / test files → STOP and surface (assumption broke).

## Order
save closure → comment #218 (evidence + commit msg + classifier follow-up) → cmdFinalize (archive) → explicit-stage commit → sink-merge → confirm on main + branch gone before declaring done.
