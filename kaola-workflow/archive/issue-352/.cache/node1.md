# node1 — implementer evidence (issue #352)

non_tdd_reason: prose/markup edit — removes a hardcoded absolute maintainer path from Markdown instruction text; no behavioral unit under test; verification is grep-cleanliness + template byte-pair contract validators.

## Change (lines 16-22, byte-identical across the three command editions)
BEFORE: preferred source listed as 1. /Volumes/WorkspaceA/ylminiserver/workspace/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md, 2. ../andrej-karpathy-skills/... relative sibling.
AFTER: 1. ../andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md (relative sibling discovery); fallback = KARPATHY_SKILLS_PATH env var, else ask the user, else the concise in-command fallback. NO machine-specific absolute path remains.

## Files changed (git diff --stat)
commands/workflow-init.md | 5 ++---; plugins/kaola-workflow-gitea/commands/workflow-init.md | 5 ++---; plugins/kaola-workflow-gitlab/commands/workflow-init.md | 5 ++---; 3 files, +6/-9. The three SKILL.md partners carried no offending path → left byte-unchanged (declared only for the #301 co-occurrence guard).

## Verification — regression-green
1. grep -rn '/Volumes/WorkspaceA' commands plugins → exit 1, ZERO matches (CLEAN).
2. Cross-edition identity: rewritten block diff claude↔gitlab exit 0, claude↔gitea exit 0.
3. KW-CLAUDE-TEMPLATE region (84-164) untouched.
4. node scripts/validate-workflow-contracts.js → exit 0 "Workflow contract validation passed"; node scripts/validate-kaola-workflow-contracts.js → exit 0 "Kaola-Workflow Codex contract validation passed" (template byte-pairs green). Full four chains run at the review gate.
