# Phase 2 - Ideation: issue-118

## Approaches Evaluated

### Option A: Minimal direct edits
Make exactly the four edits to `uninstall.sh` (usage, error msg, case validation, remove_dir block), add the README line, append a single `assertIncludes('kaola-workflow-gitea')` to the Gitea contract validator.

- Pros: Smallest diff; mirrors gitlab block exactly; easy to review.
- Cons: Single string assertion doesn't catch partial implementations (e.g., directory block added but case validation forgotten — would silently accept `--forge=gitea` but exit 2).
- Risk: Low
- Complexity: S

### Option B: Refactor uninstall.sh to data-driven forge-list loop
Replace per-forge `if` blocks with a bash associative array and loop.

- Pros: Future forge additions are one-line changes; validation/removal lists can't drift.
- Cons: Bash associative arrays require bash 4+; macOS default is bash 3.2 — portability risk. Scope creep. Creates asymmetry with `install.sh` which also uses per-forge `if` blocks.
- Risk: Medium
- Complexity: Medium
- **Rejected.**

### Option C: Minimal edits + stronger contract coverage (Selected)
Approach A plus 4 targeted assertions on `uninstall.sh` in the Gitea contract validator:
1. Usage string contains `gitea`
2. Case validation contains `github|gitlab|gitea|all`
3. Forge branch `"$FORGE" = "gitea"` exists
4. Directory name `kaola-workflow-gitea` is referenced
Plus CHANGELOG entry.

- Pros: Catches partial implementations; documents four-spot contract; same style as existing validator; CHANGELOG follows project convention.
- Cons: 4 validator assertions instead of 1 (minor).
- Risk: Low
- Complexity: S

## Advisor Findings

- Approach C is sound. Risks are accurate.
- Critical verification completed: existing `uninstall.sh` `COMMANDS` glob `"$HOME/.claude/commands/kaola-workflow"*.md` already covers all Gitea command files. Agent files are forge-agnostic. Only the support directory `~/.claude/kaola-workflow-gitea` is missing — the `remove_dir` block is the only addition needed. Plan is complete.
- Validator assertion strings must match literal source (exact whitespace/quote style verified from gitlab block at uninstall.sh line 110).
- CHANGELOG entry required by project CLAUDE.md documentation checklist.

## Selected Approach
**Option C** — Minimal edits to `uninstall.sh` + stronger contract coverage in Gitea validator + CHANGELOG entry.

Rationale: The four targeted validator assertions close the gap where a partial implementation would pass a single string check. Mirrors the existing `installScript.includes(...)` contract style. CHANGELOG follows documented project convention.

## Out of Scope (explicit)
- No refactor of `uninstall.sh` to data-driven forge table (bash 3.2 risk, scope creep)
- No changes to hook-stripping Python3 block (forge-agnostic by design)
- No new walkthrough simulation case for uninstall
- No github/gitlab contract assertions for uninstall (out of scope)
- No new external deps
- No changes to `scripts/simulate-workflow-walkthrough.js`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
