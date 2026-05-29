# Phase 2 - Ideation: issue-191

## Approaches Evaluated

### L1 — audit-labels/repair-labels port
**Option A (Selected): Direct CLI translation** — Copy cmdAuditLabels/cmdRepairLabels to GitLab/Gitea claim scripts, adapting gh→glab/tea. Add forge tests.
- Pros: matches deliberate per-forge copy pattern; bounded scope; testable
- Cons: 2 more copies to maintain
- Risk: Medium (CLI semantics verification required)
- Complexity: Small

**Option B (Rejected): Shared module** — contradicts deliberate per-forge isolation; larger blast radius for a low-severity fix.

### L2 — parseRoadmapTable pipe-in-title
**Option A (Selected): `(?:[^|\\]|\\.)+?`** — canonical escaped-string tokenizer. Fix writer to also escape `\`; add unescape step; 4 copies.
- Pros: handles all escape cases correctly; standard idiom
- Cons: two-sided contract (writer + parser + unescape must all be consistent)
- Risk: Low-Med (two-sided verification required)
- Complexity: Small per file; Medium total (4 copies + round-trip test)

**Option B (Rejected): `(?:[^|]|\\\|)+?`** — still breaks because [^|] includes backslash.
**Option C (Rejected): lookahead** — fragile at cell boundaries with escaped content.

### L3 — field() regex
**All-files (Selected): Fix all 4 + all plugin copies.** `\s*` → `[ \t]*`.
- Pros: mechanical; zero cost per additional file; removes latent trap
- Cons: touches many files
- Risk: Low
- Complexity: Small

**Scope-down (Rejected):** creates documented inconsistency; cost of deciding which are "risky enough" > cost of fixing all.

### L4 — runtime flag persistence
**Approach A (Selected): Add `runtime:` to `## Current Position` block** adjacent to `workflow_path`, always written with default. 3-forge fix if GitLab/Gitea share gap. Update workflow-state-contract.md.
- Pros: matches historical precedent (archive/issue-44); one line per claim script
- Cons: 3-forge if gap confirmed; touches byte-synced plugin copy
- Risk: Low (verify reader exists + test snapshot impact first)
- Complexity: Small

**Remove-flag (Rejected):** larger — touches routers + catch-all parser; discards documented historical intent.

### L5 — uninstall.sh orphaning
**Approach A (Selected): Auto-detect installed support dirs** — check if dirs exist, remove what's present. Also revive dead not-installed guard by making shared removals presence-conditional.
- Pros: fixes both bugs (orphaning + dead guard); user-intuitive behavior
- Cons: cannot runtime-test safely (deletes ~/.claude/*); must verify presence-conditional approach is safe for GitHub path
- Risk: Medium (highest-judgment shell change)
- Complexity: Small-Med

**Approach B (Rejected): Change default FORGE to all** — behavioral blast radius on all existing bare invocations.
**Approach C (Rejected): Add --forge=all option** — doesn't fix the bare/default invocation path.

### L6 — Doc nits
All purely additive, no approach comparison needed.
- L6a: Add KAOLA_GLAB_MOCK_SCRIPT/KAOLA_TEA_MOCK_SCRIPT adjacent to KAOLA_GH_MOCK_SCRIPT (forge order)
- L6b: Add 3 missing entries to docs/README.md (match CLAUDE.md ordering)
- L6c: Add sink-fallback to README subcommand table (grouped with sink commands)

## Advisor Findings
- All recommendations endorsed
- **Critical: 6 verifications must be resolved in Phase 3 blueprint (not left to Phase 4)**
- L5 cannot be runtime-tested; correctness via careful read + `bash -n` only
- L4 is potentially 3-forge; update workflow-state-contract.md
- GitLab/Gitea plugin copies for L3 not policed by validate-script-sync.js — explicit checklist required
- ONE branch → ONE sink-merge (not separate PRs); planner's groupings = Phase 4 implementation order

## Selected Approach
Per item as described above. All 6 items ship in one branch.

## Out of Scope (explicit)
- Shared cross-forge module for L1 (contradicts deliberate isolation pattern)
- Lookahead regex for L2 (option C)
- Changing --forge=all default for L5 (option B)
- Stripping --runtime flag/prose for L4
- Any additional features beyond the 6 named items

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
