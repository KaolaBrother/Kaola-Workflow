# Phase 3 - Plan: issue-174

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Gaps 1–5, 7 (6 edits in one pass) | Bring GitLab Codex router to parity |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | Same 6 edits, Gitea-specific text | Bring Gitea Codex router to parity |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add `assertBefore` helper + 7 assertions | Catch drift via `npm test` |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Add `assertBefore` helper + 7 assertions | Catch drift via `npm test` |

### Build Sequence
1. A1 ‖ B1 — edit GitLab SKILL.md and Gitea SKILL.md (parallel, disjoint files)
2. A2 ‖ B2 — add validator helpers + assertions (each depends on its own track)
3. C1 — `npm test` final gate

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | A1, B1 | completely disjoint file sets (gitlab vs gitea) |
| 2 | A2, B2 | each depends only on its own track's SKILL edit |
| 3 | C1 | serial; requires both tracks complete |

### External Dependencies
None — pure documentation/contract file changes.

---

## Task List

### Task A1: Edit GitLab SKILL.md
- File: `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- Test File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set: `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- Depends On: none
- Parallel Group: 1 (with B1)
- Action: MODIFY

Apply all 6 gaps in a single pass. Work with unique-anchor string edits (no line-number assumptions). After each edit, the string must be absent/present per gap.

**Gap 1a** — Delegation Contract bash block (~line 50):
  - Old: `kaola-workflow/${PICK_NEXT_PROJECT}/workflow-state.md`
  - New: `kaola-workflow/${KAOLA_PROJECT}/workflow-state.md`

**Gap 1b** — Startup bash block project extraction (~line 120):
  - Old: `PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true`
  - New: `KAOLA_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true`
  - (LHS only; `.project` JSON key unchanged)

**Gap 2** — Insert after `KAOLA_WORKTREE_PATH=...` assignment, before `[ -n "$KAOLA_WORKTREE_PATH" ] && ... export KAOLA_WORKTREE_PATH`:
  ```bash
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  ```

**Gap 3** — Typed-refusal list (~line 132):
  - Old: `(target_occupied, user_target_blocked, user_target_red, target_mismatch, target_unavailable)`
  - New: `(target_occupied, user_target_blocked, user_target_red, target_mismatch, target_unavailable, target_unverified)`

**Gap 4** — After typed-refusal paragraph (before Classify-git-state block), add:
  ```
  Before stopping, print the refusal diagnostics:

  ```text
  Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
  ```
  ```
  (The assertion greps the string `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING` byte-exact inside a fenced text block.)

**Gap 5** — Agent Issue Selection section: renumber current step `6. State the selected issue number...` → step 7; insert new step 6 (from GitLab command doc lines 64-65):
  ```
  6. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.
     - Online: `glab issue view "$KAOLA_TARGET_ISSUE" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.
     - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
  7. State the selected issue number before calling startup.
  ```
  (String `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` must be byte-exact; no braces around variable.)

**Gap 1c** — Git Freshness Block Recovery release command (~line 165):
  - Old: `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block`
  - New: `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block`

**Gap 7** — Move `### Co-active Folders Advisory` block from under `## Routing` to under `## Startup`:
  - Delete the block from its current location under `## Routing`
  - Reinsert it after the Git Freshness Block Recovery prose and before "If GitLab is available, refresh open issues:"
  - Verify after edit: `grep -c "### Co-active Folders Advisory"` returns `1` (no duplicate)
  - Do NOT change the block's content

Post-edit verification: `grep -c PICK_NEXT_PROJECT plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` must return `0`

- Validate: (no standalone validation until A2 adds the assertions; the validator runs as part of C1)

---

### Task A2: Add GitLab validator assertions
- File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set: same file
- Depends On: A1
- Parallel Group: 2 (with B2)
- Action: MODIFY

**Step 1** — Add `assertBefore` helper after `assertNotIncludes` function definition (~line 67):
```javascript
function assertBefore(file, earlier, later) {
  const text = read(file);
  const ei = text.indexOf(earlier), li = text.indexOf(later);
  assert(ei !== -1, file + ' must include: ' + earlier);
  assert(li !== -1, file + ' must include: ' + later);
  assert(ei < li, file + ': "' + earlier + '" must appear before "' + later + '"');
}
```

**Step 2** — Add assertions after existing `kaola-workflow-next/SKILL.md` delegation assertion (~line 238):
```javascript
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

- Validate: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` must exit 0

---

### Task B1: Edit Gitea SKILL.md
- File: `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
- Write Set: same file
- Depends On: none
- Parallel Group: 1 (with A1)
- Action: MODIFY

Same 7 edits as A1 with Gitea-specific differences:
- Gap 1b anchor: `PICK_NEXT_PROJECT=` appears at line ~118
- Gap 2 insert: after line ~120 (`KAOLA_WORKTREE_PATH=` assignment), before line ~121 export guard
- Gap 1c anchor: line ~163
- Gap 3 anchor: line ~130
- Gap 7 source location: Co-active Folders Advisory at lines ~212-216 under `## Routing`
- **Gap 5**: Use `tea issues view "$KAOLA_TARGET_ISSUE" --output json` (Gitea command doc). All other text identical.

Post-edit verification: `grep -c PICK_NEXT_PROJECT plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` returns `0`; `grep -c "### Co-active Folders Advisory" plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` returns `1`

---

### Task B2: Add Gitea validator assertions
- File: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Write Set: same file
- Depends On: B1
- Parallel Group: 2 (with A2)
- Action: MODIFY

Same as A2 but using `giteaNextSkill` / `giteaSkillsBase`. Add `assertBefore` helper after `assertNotIncludes` (~line 66). Add assertions after existing Gitea next-skill delegation assertion (~line 245):
```javascript
// Issue #174: Gitea next skill parity gaps
const giteaNextSkill = `${giteaSkillsBase}/kaola-workflow-next/SKILL.md`;
assertNotIncludes(giteaNextSkill, 'PICK_NEXT_PROJECT');
assertIncludes(giteaNextSkill, 'KAOLA_VERDICT=');
assertIncludes(giteaNextSkill, 'KAOLA_REASONING=');
assertIncludes(giteaNextSkill, 'target_unverified');
assertIncludes(giteaNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
assertIncludes(giteaNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
assertBefore(giteaNextSkill, '### Co-active Folders Advisory', '## Routing');
```

- Validate: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` must exit 0

---

### Task C1: Final gate
- Depends On: A2, B2
- Action: VALIDATE

```bash
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
npm test
```
All must exit 0.

---

## Advisor Notes
- `assertIncludes`/`assertNotIncludes` helpers confirmed present in both forge validators (verified at lines 60/64 in Gitea, same structure in GitLab). Only `assertBefore` is new.
- Gap 5 offline path string `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` (no braces) confirmed byte-exact match between command docs and assertion string.
- Gap 6 (ff-only recovery behavior) correctly NOT a real gap — forge command docs have ff-only, which is correct behavior. Only PICK_NEXT_PROJECT rename needed in that section (covered by Gap 1c).
- Gap 7 `assertBefore` assertion: uses `indexOf` (first match) — must DELETE the original block from Routing, not just copy it.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Blueprint verified correct after advisor check; helpers confirmed present; no revision needed |
