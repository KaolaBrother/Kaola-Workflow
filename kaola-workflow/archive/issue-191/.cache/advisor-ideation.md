# Advisor Ideation Output — issue-191

## Verdict: Endorse all planner selections.

## Decisions
- L1: Direct CLI translation (not shared module); add forge tests
- L2: Regex Option A `(?:[^|\\]|\\.)+?`; resolve two-sided contract in Phase 3
- L3: Fix all 4 files + ALL plugin copies
- L4: Persist runtime (one line in writeState); 3-forge fix; update workflow-state-contract.md
- L5: Auto-detect installed dirs; revive dead guard (make shared removals presence-conditional)
- L6: Additive docs

## 6 Verifications → Phase 3 Architect Must Resolve Before Blueprint
1. L2: Does roadmap.js:85 escape `\` today? Is there any unescape step at call sites (108, 208)?
2. L4: What's the canonical default runtime value? Does any reader call field('runtime')? Do GitLab/Gitea claim scripts share the parse-but-drop gap?
3. L5: Can shared removals (54-94) be made presence-conditional without breaking GitHub-only path?
4. L1: Exact glab/tea closed-state filter flag and label add/remove invocation — match existing in-script usages
5. L4 extra: Does any walkthrough test pin exact workflow-state.md template content? (L4 adds a line to writeState)
6. L4 extra: Do Codex routers actually pass --runtime? If not, defaulting absent→claude mislabels Codex-created state

## Key Gotchas
- L4 is a 3-forge fix (GitHub claim.js + GitLab/Gitea if they share the gap). Update docs/workflow-state-contract.md to document new runtime field. Also touches byte-synced plugin copy.
- L2: If no unescape exists today and pipe-in-title is the only real case, scope to pipe-only fix (not full backslash-handling). Architect decides scope.
- L5: Cannot be runtime-tested safely (deletes ~/.claude/* dirs). Correctness rests on careful read + `bash -n` (already in npm test). Do NOT run uninstall.sh to test.
- L3: GitLab/Gitea plugin copies NOT policed by validate-script-sync.js — make explicit file checklist.
- This is ONE branch → ONE sink-merge; planner's "5 PRs" = implementation order within Phase 4, not separate deliverables.
- L3/L4 dogfooding risk: modifying active-folders.js, classifier.js, and writeState which the agent uses for its own Phase 6. npm test must be green.
