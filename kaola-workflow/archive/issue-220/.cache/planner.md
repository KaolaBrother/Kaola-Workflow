# Fast Planner — issue-220

## Write set (1 file, single area)
- scripts/validate-script-sync.js (edit lines 45 and 53-72)

## Approaches
Exactly one sensible approach. Fast-path eligible. closure-contract.js sets a binding precedent (group-only).

## Exact change
### Edit A — add 4th BYTE_IDENTICAL_GROUP (after closure-contract group, before closing `]`):
```javascript
  {
    label: 'resolve-agent-model module copies',
    files: [
      'scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js',
    ],
  },
```
Root path is files[0] = reference (matches closure-contract ordering).

### Edit B — remove line 45 from COMMON_SCRIPTS (RECOMMENDED):
Delete `  'kaola-workflow-resolve-agent-model.js',`
Rationale: new group is a strict superset of the root-vs-Codex check (group loop compares scripts/ reference against plugins/kaola-workflow/scripts/ copy + adds gitlab+gitea; missing-file branches preserve root+Codex absence coverage). Zero coverage lost. Produces the true mirror of closure-contract (group-only, absent from COMMON_SCRIPTS). Auto OK-line: 11→10 common scripts, 2→3 groups.

## Acceptance check commands
1. `node scripts/validate-script-sync.js` → exit 0, "OK: 10 common scripts and 3 byte-identical file group in sync."
2. NEGATIVE (decisive — proves new coverage fires):
   `printf '\n//x\n' >> plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js` then validator must exit 1 citing "resolve-agent-model module copies: ... differs", then `git checkout --` to revert.
3. `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex`

## Out of scope
- npm :gitlab/:gitea chain wiring (separate concern; explicitly excluded by issue).
- Line-109 grammar ("group" singular) — pre-existing, leave it.
- The 4 resolve-agent-model.js files themselves (already byte-identical, md5 8ea7bc0ae24ef301673779996039f4cb).
