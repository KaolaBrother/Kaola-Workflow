# Phase 2 - Ideation: issue-122

## Approaches Evaluated

### Option A: Add readConfig() to Gitea and GitLab sink scripts
- Summary: Mirror the GitHub baseline pattern — each sink reads config internally, dispatch stays unaware. Add `readConfig()`, `maybeAutoMergeFromConfig()`, and wire into `main()` with `--merge` CLI priority.
- Pros: Exact parity with GitHub baseline; dispatch (phase6.md, SKILL.md) unchanged; tested pattern; minimal surface area
- Cons: Slight code duplication across three sinks (acceptable — pattern is stable)
- Risk: Low
- Complexity: Small

### Option B: Move config reading into a shared util imported by all sinks
- Summary: Extract `readConfig()` into a shared module (e.g., `scripts/kaola-workflow-config.js`) imported by GitHub, Gitea, and GitLab sinks.
- Pros: No duplication
- Cons: Cross-plugin shared module adds coupling; changes three sinks plus a new file; higher blast radius; GitHub sink already works — touching it for refactor is risk with no user value
- Risk: Medium
- Complexity: Medium

### Option C: Add --auto-merge to dispatch (phase6.md + SKILL.md)
- Summary: Pass `--auto-merge` flag from dispatch when config says true; read config in the shell command, not the script.
- Pros: Scripts stay simple
- Cons: Breaks the config-internal architecture; requires config parsing in bash; phase6.md says config-driven but would become flag-driven; incompatible with GitHub baseline model
- Risk: High
- Complexity: Medium

## Advisor Findings
Option A is sound. No missed approaches, no blocking risks. Three implementation refinements:
1. Signature asymmetry is valid: Gitea `maybeAutoMergeFromConfig(pr, project, configOverride)` vs GitLab `maybeAutoMergeFromConfig(mr, configOverride)` — forced by forge API shape.
2. Tests: use `configOverride` for trigger tests (positive/negative) + one HOME-stub test for `readConfig()` path/parse/defaults.
3. `maybeAutoMergeFromConfig` calls the existing wrapper (`mergePullRequest` / `mergeMergeRequest`) not forge directly.
4. Downstream note: verify Gitea forge honors `autoMerge: true` — non-blocking for this issue.

## Selected Approach
**Option A** — Add `readConfig()` to Gitea and GitLab sink scripts.

Rationale: Exact GitHub baseline parity with zero dispatch changes. The config-internal model is already documented and proven. Option B introduces cross-plugin coupling with no user value. Option C is architecturally incompatible.

### Key Design Decisions
- `--merge` CLI flag wins over config: `if (args.merge && !OFFLINE) ... else if (!OFFLINE) maybeAutoMergeFromConfig(...)`
- OFFLINE skips both paths
- Config keys: `pr_auto_merge` (Gitea), `mr_auto_merge` (GitLab)
- Hardcoded merge opts: `autoMerge: true, squash: true, removeSourceBranch: true`
- `configOverride` third param enables unit tests without HOME-stubbing
- `maybeAutoMergeFromConfig` calls the existing local wrapper, not forge directly

## Out of Scope (explicit)
- Do NOT change phase6.md commands or SKILL.md files
- Do NOT modify forge layer (kaola-gitea-forge.js, kaola-gitlab-forge.js)
- Do NOT add new config keys or CLI flags
- Do NOT read config inside ensurePullRequest / ensureMergeRequest
- Do NOT refactor readConfig() into a shared module (Option B)
- Do NOT change the GitHub baseline (scripts/kaola-workflow-sink-pr.js)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
