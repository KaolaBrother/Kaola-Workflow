# Advisor Ideation Output — issue-190

## Verdict: Approach A endorsed.

## 3 Lock-Down Items Before Phase 3/4

### 1. M1 regression guard — make it a contract assertion (load-bearing)
- Before editing any SKILL.md, grep `validate-kaola-workflow-contracts.js`, gitlab/gitea variants, and `validate-workflow-contracts.js` for existing assertions on the Codex "Required Output" block or Startup sections.
- If any asserts the current Required Output by exact match, the 3 added lines break it — update that assertion in the same change.
- ADD presence-assertions for each of the 3 Codex SKILL.md files: must contain the `Startup Step 0a-1` / Path-Intent section and the three new output lines. This is the Phase 4 RED→GREEN target and anti-drift guard. Precedent: issue #174 added 7 assertions for this exact class of SKILL.md router-parity work.

### 2. M2 liveness grep is mandatory (not optional)
- Grep all 5 dead var names repo-wide before deleting.
- Expected: hits only in .env.example and docs/api.md:109. If any script reads one, stop and reconsider — don't delete.
- Don't expand beyond the two named files unless grep surfaces another reference.

### 3. KAOLA_PATH propagation — feature correctness, not gate
- Shell state doesn't persist across separate Bash calls. The `export KAOLA_PATH=fast` must land in the same shell as `node … startup` (contiguous, not in a separate subprocess).
- Validators check section presence, not behavior — won't show up in npm test. But it's the whole point of M1.
- No `--path` flag (planner's scope-out stands).

## Minor Note
SKILL.md files are intentionally per-edition; `validate-script-sync.js` is JS-only and won't fire on them. Real gate is `npm test` across all 4 editions.
