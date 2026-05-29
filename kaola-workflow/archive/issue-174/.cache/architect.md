# Code Architect — issue-174

## Design Decisions
- Source of truth for Gap 5 is the **forge command doc** (not GitHub SKILL.md) — uses `--output json`, no `gh`/GitHub tokens
- `assertBefore` helper does NOT currently exist in either validator — must be added or validators crash
- Gap 7 is a MOVE (delete + reinsert), not a copy — must end with exactly 1 occurrence
- Tracks A (GitLab) and B (Gitea) are fully parallel (disjoint write sets)

## Files to Modify
| File | Changes |
|------|---------|
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Gaps 1-5, 7 (A1) |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | Gaps 1-5, 7 (B1) |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | assertBefore helper + 7 assertions (A2) |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | assertBefore helper + 7 assertions (B2) |

## Task A1: Edit GitLab SKILL.md
File: `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
Work bottom-up or use unique-anchor string edits to avoid line-shift issues.

- Gap 7: MOVE `### Co-active Folders Advisory` block from `## Routing` section to under `## Startup` section, after Git Freshness Block Recovery prose and before "If GitLab is available, refresh open issues:". Delete original; insert copy. Verify: `grep -c "### Co-active Folders Advisory"` returns 1.
- Gap 1c (line ~165): In Git Freshness Block Recovery, change `PICK_NEXT_PROJECT` to `KAOLA_PROJECT` in the release command (both the test and the argument).
- Gap 5 (between step 5 code block and current step 6 "State the selected issue"): Renumber current step 6→7, insert new step 6 from GitLab command doc (lines 63-65 of `commands/workflow-next.md`): online uses `glab issue view "$KAOLA_TARGET_ISSUE" --output json`; offline checks `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md`. String `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` must be byte-exact.
- Gap 4 (after typed-refusal paragraph, before Classify-git-state block): Add "Before stopping, print the refusal diagnostics:" and fenced text block containing exactly: `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING`
- Gap 3 (line ~132): In typed-refusal list, add `, target_unverified` as final entry.
- Gap 2 (after `KAOLA_WORKTREE_PATH=` assignment, before `[ -n "$KAOLA_WORKTREE_PATH" ]` export guard): Insert two lines:
  ```
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  ```
- Gap 1b (line ~120): Change `PICK_NEXT_PROJECT=` to `KAOLA_PROJECT=` (LHS only; JSON key `.project` stays)
- Gap 1a (line ~50): Change `kaola-workflow/${PICK_NEXT_PROJECT}/` to `kaola-workflow/${KAOLA_PROJECT}/`
Verify: `grep -c PICK_NEXT_PROJECT` returns 0.

## Task A2: Add GitLab validator assertions
File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
1. Add `assertBefore` helper after `assertNotIncludes` (~line 67):
   ```js
   function assertBefore(file, earlier, later) {
     const text = read(file);
     const ei = text.indexOf(earlier), li = text.indexOf(later);
     assert(ei !== -1, file + ' must include: ' + earlier);
     assert(li !== -1, file + ' must include: ' + later);
     assert(ei < li, file + ': "' + earlier + '" must appear before "' + later + '"');
   }
   ```
2. After existing `kaola-workflow-next/SKILL.md` delegation assertion (~line 238), add:
   ```js
   // Issue #174: GitLab next skill parity gaps
   const gitlabNextSkill = `${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`;
   assertNotIncludes(gitlabNextSkill, 'PICK_NEXT_PROJECT');
   assertIncludes(gitlabNextSkill, 'KAOLA_VERDICT=');
   assertIncludes(gitlabNextSkill, 'KAOLA_REASONING=');
   assertIncludes(gitlabNextSkill, 'target_unverified');
   assertIncludes(gitlabNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
   assertIncludes(gitlabNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
   assertBefore(gitlabNextSkill, '### Co-active Folders Advisory', '## Routing');
   ```
Validation: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → exit 0. Depends on A1.

## Task B1: Edit Gitea SKILL.md
File: `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
Same 7 edits as A1 with Gitea offsets (line ~118 for Gap 1b, ~120 for Gap 2 anchor, ~163 for Gap 1c, ~130 for Gap 3, ~212 for Gap 7 source).
Gap 5: Use Gitea command doc (lines 63-65 of `commands/workflow-next.md`): online uses `tea issues view "$KAOLA_TARGET_ISSUE" --output json`.
Verify: `grep -c PICK_NEXT_PROJECT` returns 0; `grep -c "### Co-active Folders Advisory"` returns 1.

## Task B2: Add Gitea validator assertions
File: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
Same as A2 but using `giteaNextSkill` / `giteaSkillsBase`.
Validation: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → exit 0. Depends on B1.

## Build Sequence
1. A1 ‖ B1 (parallel — disjoint files)
2. A2 ‖ B2 (parallel — each depends only on its own track)
3. Run both validators (parallel)
4. C1: `npm test` (serial final gate)

## Edge Cases
1. `assertBefore` must be added first in A2/B2 or the validator crashes with ReferenceError
2. Gap 5: `--output json` not `--json`; no `gh`/`GitHub`/`KaolaBrother` tokens
3. Gap 7 is a MOVE — delete original, insert copy; verify single occurrence
4. Gap 1b: only LHS variable name changes; `JSON.parse(...).project` key is unchanged
5. Byte-exact strings: `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING` and `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md`
