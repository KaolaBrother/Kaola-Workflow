# Planner Output — issue-191

## Recommendations Per Item

### L1 (audit-labels/repair-labels)
Approach A: Direct CLI translation — copy cmdAuditLabels/cmdRepairLabels to gitlab/gitea claim scripts, adapting `gh` → `glab`/`tea` CLI invocations. Match existing in-script CLI usage patterns. Add forge-specific tests to gitlab/gitea walkthrough scripts.
Risk: Medium (CLI semantics differences). NOT Approach B (shared module — contradicts deliberate per-forge copy pattern).

### L2 (parseRoadmapTable pipe bug)
Option A regex: `(?:[^|\\]|\\.)+?` — canonical escaped-string tokenizer. NOT Option B (still breaks because [^|] includes backslash). NOT Option C (lookahead fragile).
CRITICAL: Fix is two-sided — writer must also escape `\` → `\\`; parser must unescape after capture. Fix all 4 copies. Add round-trip test.
Verify: Does roadmap.js:85 already escape backslash? Does an unescape step exist at call sites?

### L3 (field() regex)
Fix all 4 files + plugin copies; do not scope down. Mechanical `\s*` → `[ \t]*`. 
NOTE: kaola-workflow plugin copies caught by validate-script-sync.js; GitLab/Gitea copies must be fixed independently.

### L4 (runtime flag)
Add `runtime:` to `## Current Position` block (claim.js:281-291), adjacent to `workflow_path`. Always write with default value (likely 'claude'). 
Verify: canonical default value; whether reader already calls field('runtime'); whether GitLab/Gitea claim scripts share the gap.

### L5 (uninstall.sh)
Approach A: Auto-detect installed support dirs (check if dirs exist), remove what's present regardless of FORGE. This also revives the dead not-installed guard.
NOT Approach B (changes all bare invocations); NOT Approach C (doesn't fix the default behavior).
Verify: whether shared removals (54-94) can be made presence-conditional.

### L6 (doc nits)
L6a: Add KAOLA_GLAB_MOCK_SCRIPT and KAOLA_TEA_MOCK_SCRIPT adjacent to KAOLA_GH_MOCK_SCRIPT at .env.example:37 (forge order: github, gitlab, gitea).
L6b: Add workflow-state-contract.md, agents-source.md, investigations/ to docs/README.md (match CLAUDE.md ordering).
L6c: Add sink-fallback to README.md subcommand table (530-542) grouped with other sink commands.

## 4 Required Verifications Before Implementation
1. L2: Does roadmap.js:85 already escape `\`? Is there an unescape step at call sites?
2. L4: What's the canonical default runtime value? Does any reader call field('runtime')? Do GitLab/Gitea claim scripts share the gap?
3. L5: Can shared removals (54-94) be presence-conditional safely?
4. L1: Exact glab/tea closed-state filter and label add/remove flags — match existing in-script usages.

## Biggest Risk: Multi-copy omission
GitLab/Gitea plugin copies NOT policed by validate-script-sync.js — most likely place for partial fixes. Make an explicit checklist per item.
