# impl-init-parity node evidence

## Files Updated

All 6 files in the declared write set were updated:

1. `commands/workflow-init.md`
2. `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`
3. `plugins/kaola-workflow-gitlab/commands/workflow-init.md`
4. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`
5. `plugins/kaola-workflow-gitea/commands/workflow-init.md`
6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`

The old string:
```
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

Was replaced with:
```
- Active issue work runs in a repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

## Grep Verification Results

Old string absent (grep -rc 'sibling worktree' on all 6 files):
- commands/workflow-init.md: 0
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md: 0
- plugins/kaola-workflow-gitlab/commands/workflow-init.md: 0
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md: 0
- plugins/kaola-workflow-gitea/commands/workflow-init.md: 0
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md: 0

New string present exactly once (grep -c 'repo-local worktree at' on all 6 files):
- commands/workflow-init.md: 1
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md: 1
- plugins/kaola-workflow-gitlab/commands/workflow-init.md: 1
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md: 1
- plugins/kaola-workflow-gitea/commands/workflow-init.md: 1
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md: 1

## npm test Result

Exit code: 0

All test suites passed:
- test:kaola-workflow:claude — passed (including extractClaudeTemplate within-pair assertions)
- test:kaola-workflow:codex — passed
- test:kaola-workflow:gitlab — passed
- test:kaola-workflow:gitea — passed

Final lines of output:
- "Gitea workflow walkthrough simulation passed"
- "Gitea Codex workflow walkthrough simulation passed"
- npm_exit:0

## Surprises

None. All 6 files had exactly one occurrence of the old string. The replacement was mechanical and byte-identical across all files. The KW-CLAUDE-TEMPLATE-START...END block parity is maintained within each forge pair.
