# Phase 2 - Ideation: issue-147

## Approaches Evaluated

### Option A: Add `regenerateRoadmap` to each roadmap module (SELECTED)
- Summary: Add and export `regenerateRoadmap(root)` to GitLab and Gitea roadmap modules, refactor `cmdGenerate` to delegate to it. Claim scripts require their own roadmap module and insert the GitHub-shaped cleanup block inside `archiveProjectDir`.
- Pros: Exact structural parity with GitHub. Composition lives in one place per edition. `cmdGenerate` becomes one line (matching GitHub). Future maintainers find identical shape across all three forges.
- Cons: Touches the roadmap module (one function + export + 1-line `cmdGenerate` refactor) in addition to claim script.
- Risk: Low — composition already lives in `cmdGenerate`; extraction is mechanical.
- Complexity: Small

### Option B: Inline regeneration using already-exported primitives
- Summary: Call `readRoadmapIssues` + `buildRoadmapContent` + `writeFileAtomicReplace` directly in each claim script's cleanup block. No new export needed.
- Pros: No roadmap module export change.
- Cons: Duplicates four-line orchestration in two claim scripts. Diverges from GitHub structure. Risks silently dropping `guardAgainstMissingRoadmapSource`.
- Risk: Medium
- Complexity: Small-Medium

### Option C: Shared cross-edition helper
- Summary: Extract `regenerateRoadmap` into a shared module imported by all three forges.
- Pros: One implementation total.
- Cons: Breaks per-edition isolation convention. Scope creep for a targeted bug fix.
- Risk: High
- Complexity: Large — rejected immediately.

## Advisor Findings
Advisor confirms Option A. Key strengthening points applied:
- Test assertions must check both `.roadmap/issue-44.md` deletion AND `ROADMAP.md` content (absence of `#44`).
- Plant `.roadmap/issue-44.md` via `writeIssueRecord` so `readRoadmapIssues` parses it correctly, making the regeneration assertion non-vacuous.
- The non-fatal `catch (_)` wrapper intentionally swallows all cleanup errors including `guardAgainstMissingRoadmapSource` throws — mirrors GitHub design.

Verified before proceeding: `writeState` writes `issue_number: N` (correct key for extraction); `writeIssueRecord` signature confirmed; `cmdGenerate` output preserved by `process.stdout.write(regenerateRoadmap(getRoot()) + '\n')`.

## Selected Approach
**Option A** — Add `regenerateRoadmap` export to each roadmap module, require it in each claim script, insert GitHub-shaped cleanup block inside `archiveProjectDir` gated on `statusValue === 'closed'`.

Rationale: The success criterion is parity with GitHub. GitHub uses an exported `regenerateRoadmap(root)` called from `archiveProjectDir`. Option B's inlining duplicates orchestration and risks dropping `guardAgainstMissingRoadmapSource`. Option C is out of scope.

## Out of Scope (explicit)
- No shared cross-edition roadmap helper
- No retry or rethrow in cleanup block (non-fatal by design)
- No roadmap cleanup on `release`, `discard`, or `'abandoned'` archive paths
- No changes to `watchMergeRequests` itself
- No changes to `simulate-gitlab-workflow-walkthrough.js` or `simulate-gitea-workflow-walkthrough.js`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
