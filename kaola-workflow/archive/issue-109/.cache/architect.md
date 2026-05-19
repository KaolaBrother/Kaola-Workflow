# Code Architect: issue-109

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Insert KAOLA_CLAIM extract line; replace unguarded release line | 1 — fix |
| `scripts/validate-kaola-workflow-contracts.js` | Add 4 assertions locking the fix | 2 — regression lock |

No files to create.

## Build Sequence

1. Edit SKILL.md (fix must exist before assertions can pass).
2. Edit validate-kaola-workflow-contracts.js (assertions lock the fix).
3. Run `npm run test:kaola-workflow:codex` to verify targeted suite passes.
4. Run `npm test` to verify full suite passes.

## Task List

### Task 1 — SKILL.md: insert KAOLA_CLAIM extraction line

- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (feature worktree)
- Write Set: insert after line 117 (project extract), before existing line 118 (worktree_path extract)
- Action: INSERT one line after current line 117
- Exact new line:
  `  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true`
- Mirror: GitLab sibling line 121 (byte-for-byte)
- Post-insert: project→118, claim→119(new), worktree_path→120, export→121

### Task 2 — SKILL.md: replace unguarded release line

- File: same SKILL.md (feature worktree)
- Write Set: current line 139 (becomes 140 after Task 1 insert)
- Action: REPLACE entire line
- Old: `node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block`
- New: `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block`
- Mirror: GitLab sibling line 165 (byte-for-byte)

### Task 3 — validate-kaola-workflow-contracts.js: add regression assertions

- File: `scripts/validate-kaola-workflow-contracts.js` (feature worktree)
- Write Set: insert 4 lines after existing line 89
- Action: INSERT after last existing kaola-workflow-next assertion block

```js
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'KAOLA_CLAIM="$(node -e');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$KAOLA_PROJECT" --reason git-freshness-block');
```

- String style: backtick template literals for paths, single-quoted search tokens — matches lines 86–89

### Validate

```bash
npm run test:kaola-workflow:codex
npm test
```

## Data Flow

The startup script writes JSON to `STARTUP_OUT`. GitHub SKILL.md currently extracts `.project` and `.worktree_path` but not `.claim`. Without `.claim` as `KAOLA_CLAIM`, the freshness-block release: (a) runs unconditionally instead of only on acquired claims, and (b) passes `$KAOLA_PROJECT` (undefined) instead of `$PICK_NEXT_PROJECT`. Fix extracts KAOLA_CLAIM from the same blob in the same block and guards the release with both checks.

## Out-of-Scope

- GitLab sibling SKILL.md — reference only, must not be modified
- Other `$KAOLA_PROJECT` occurrences in GitHub SKILL.md — unrelated to freshness-block
- `kaola-workflow-claim.js` — release semantics unchanged
- Main worktree — all edits go in feature worktree only

## External Dependencies

None.
