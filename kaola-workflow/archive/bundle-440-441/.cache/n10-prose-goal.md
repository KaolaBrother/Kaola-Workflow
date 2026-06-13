evidence-binding: n10-prose-goal 9033c9d3b411

## Node: n10-prose-goal

### Task
Update finalize command + workflow-next command + 3 finalize SKILL packs with
goal-attestation + scout-goal touchpoints (#441).

### Files changed

1. `commands/kaola-workflow-finalize.md`
   Added `### Goal Attestation (advisory, v1)` section between the Run-Gap Sweep
   Gate and the `Read:` block. Documents `goal_check: satisfied|absent` field in
   the closure receipt, explains advisory-only v1 semantics, and shows how to
   supply goal context via `KAOLA_GOAL` env var or the plan `goal:` Meta line.

2. `commands/workflow-next.md`
   Added **Goal context (`KAOLA_GOAL`)** paragraph in the Auto-bundle entry section
   (immediately after the issue-scout read-only constraint). Explains that
   `KAOLA_GOAL` is passed to the scout and produces `goal_alignment` in its output,
   and that the same env var flows into `cmdFinalize` for `goal_check: satisfied`.

3. `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
4. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
5. `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`
   All three received the identical `### Goal Attestation (advisory, v1)` block
   (same wording as the command file, forge-neutral — no `gh`/`glab`/`tea` brand
   names). Inserted between the Run-Gap Sweep Gate and `## Goal Contract`.

### Forbidden-only validation

```
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js \
  --forbidden-only plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
# → Kaola-Workflow GitLab forbidden-only check passed (1 file(s)) [exit=0]

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js \
  --forbidden-only plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
# → Kaola-Workflow Gitea forbidden-only check passed (1 file(s)) [exit=0]
```

### Shared-canonical-spec discipline (#309)

The three SKILL.md files contain byte-identical `### Goal Attestation` content.
No existing pinned tokens were removed from any SKILL.md file.

### build-green
All changes are documentation/prose only (`.md` files). No scripts were modified.
Forbidden-only checks pass. No behavioral code paths were touched.
