evidence-binding: n3-prose 99ed72fd0c13
non_tdd_reason: prompt-guidance prose added to agent/command/skill surfaces; behavior is prompt-guidance with no natural failing unit test — cross-edition parity and provenance-ban compliance are enforced by the four-chain contract validators (test-agent-profile-parity.js, validate-workflow-contracts.js, validate-kaola-workflow-contracts.js, test-route-reachability.js), not by a RED→GREEN ceremony.
regression-green: all four parity/contract validators pass before and after the change (exit 0 in both states)

## Task

Add forge-neutral co-tenant guidance prose to 16 agent/command/skill surfaces across all editions.

## Files Changed

### issue-scout (4 surfaces)
- agents/issue-scout.md — added "### Co-Tenant Mode: Disjoint Issue Selection" section between "### 2. Clustering Analysis" and "### 3. Bundle Selection Rules"
- plugins/kaola-workflow/agents/issue-scout.toml — added equivalent co-tenant mode prose block between frontier-blocked rule and output contract
- plugins/kaola-workflow-gitlab/agents/issue-scout.toml — same
- plugins/kaola-workflow-gitea/agents/issue-scout.toml — same

### adapt surfaces (6 surfaces)
- commands/kaola-workflow-adapt.md — added "**Co-tenant clean-check.**" paragraph after git-freshness paragraph, before "Once main is clean"
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md — same
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md — same
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md — same (after the git freshness paragraph in the SKILL)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md — same
- plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md — same

### finalize surfaces (6 surfaces)
- commands/kaola-workflow-finalize.md — added "**Co-tenant merge protocol.**" paragraph after "9. **Cleanup**" step and before "**Crash-resume**:" in the --sink mode section
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md — same
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md — same
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md — same (indented to match section style)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md — same
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md — same

## Verification Commands and Results

### Baseline (before changes)
```
node scripts/test-agent-profile-parity.js   → EXIT:0  (24 assertions)
node scripts/validate-kaola-workflow-contracts.js → EXIT:0
node scripts/validate-workflow-contracts.js → EXIT:0
node scripts/test-route-reachability.js     → EXIT:0  (152 assertions)
```

### After changes
```
node scripts/test-agent-profile-parity.js   → EXIT:0  (24 assertions)
node scripts/validate-kaola-workflow-contracts.js → EXIT:0
node scripts/validate-workflow-contracts.js → EXIT:0
node scripts/test-route-reachability.js     → EXIT:0  (152 assertions)
```

All validators green before and after. No regressions introduced.

## Style Compliance

- FORGE-NEUTRAL: no gh/glab/tea CLI names, no brand nouns (GitHub/GitLab/Gitea), no forge-specific request nouns (PR/MR). Used "the forge CLI", "the forge", "the forge request" where applicable; wrote "merge" and "rebase" generically.
- PROVENANCE-FREE: no #NNN issue refs, no D-NNN-NN decision IDs, no INV-NN tags, no ADR citations. Confirmed by PROVENANCE_BAN guard passing in both validate-workflow-contracts.js (agents/*.md, commands/*.md) and validate-kaola-workflow-contracts.js (*.toml, SKILL.md).
- PARITY: issue-scout.md content mirrored to all 3 .toml twins; adapt co-tenant note added to all 6 adapt surfaces; finalize co-tenant note added to all 6 finalize surfaces.
