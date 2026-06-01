# Phase 3 - Plan: issue-211

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/validate-workflow-contracts.js` | Insert inline `sectionBody()` + `resumeClausePair()` helpers (after `assertEveryDispatchHasModel`, before `const retired = [`); insert cross-forge baseline-compare loop (after the codex-manifest parity `for` loop, before the CHANGELOG `assert`) | The parity assertion. Rides the existing `node scripts/validate-workflow-contracts.js` invocation in package.json `:claude` chain — no new wiring. `fs`/`path` already required; no new imports. |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | `cp` the edited root file over it byte-for-byte | In `validate-script-sync.js` COMMON_SCRIPTS; the sync guard (runs first in the chain) fails if it drifts. |

### Build Sequence
1. Edit root `scripts/validate-workflow-contracts.js` — Block 1 (helpers) + Block 2 (compare loop), **keyed off anchor text, not line numbers** (advisor caveat 1).
2. `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-for-byte mirror).
3. Clean-pass first: `node scripts/validate-workflow-contracts.js` on the untouched SKILL.md tree → must PASS (this is the **AC#3 artifact** — forge-specific prose not falsely flagged).
4. Prove failing direction A (DC body divergence) → expect non-zero + DC message → revert.
5. Prove failing direction B (resume 2nd-line divergence) → expect non-zero + resume message → revert.
6. `node scripts/validate-script-sync.js` (mirror in sync).
7. `node scripts/validate-workflow-contracts.js` (final clean).
8. `node scripts/simulate-workflow-walkthrough.js`.
9. `npm test`.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | 1 | single task, two coupled files (root + byte-identical mirror) must be edited in lockstep |

### External Dependencies
None. `fs`/`path` already required in the validator (L4-5). No new packages, no `require()` of the classifier (slicer inlined).

## Task List

### Task 1: Add cross-forge Delegation Contract + resume clause parity assertion
- File: `scripts/validate-workflow-contracts.js`
- Test File: N/A (hand-rolled `assert()`; the parity assertion IS the test; planted divergence is the failing-test-first — see Validate)
- Write Set: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Depends On: none
- Parallel Group: serial
- Action: MODIFY (root) + MODIFY-via-cp (mirror)
- Implement:
  - Block 1 (helpers): inline `sectionBody(content, heading)` (verbatim from `kaola-workflow-classifier.js`, stops at next `/^#{1,2}\s/`) + `resumeClausePair(content)` (findIndex of `On resume, extract and reassign`, return that line + next line). See `.cache/architect.md` for exact code.
  - Block 2 (compare loop): `nextSkillEditions` = [github baseline, gitlab, gitea]; read github baseline; slice DC body + resume pair; optional non-empty baseline guard; for gitlab/gitea assert `sectionBody(...) === baselineDelegationContract` and `resumeClausePair(...) === baselineResumeClause`, with per-assertion messages naming the diverging file + clause + github baseline path.
  - Strict byte-equality (`===`); NO whitespace normalization, NO substring matching for the comparison itself.
- Mirror: existing codex `plugin.json` baseline-compare loop at `validate-workflow-contracts.js` (reads all 3 editions, asserts each equals baseline[0]); failure-message style of the existing `<file> ... must match <baseline>` asserts.
- Validate (advisor caveat 2 — print line before sed, confirm BOTH non-zero exit AND the correct message; re-read live line numbers, they may have shifted):
  ```bash
  node scripts/validate-workflow-contracts.js                                # clean pass (AC#3 artifact)
  sed -n '33p' plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md   # confirm inside DC body
  sed -i '' '33s/$/ /' plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
  node scripts/validate-workflow-contracts.js                                # NON-ZERO + DC-section message
  git checkout -- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
  sed -n '233p' plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md   # confirm resume 2nd line
  sed -i '' '233s/absent/absebt/' plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
  node scripts/validate-workflow-contracts.js                                # NON-ZERO + resume-clause message
  git checkout -- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
  node scripts/validate-script-sync.js                                       # in sync
  node scripts/validate-workflow-contracts.js                                # "Workflow contract validation passed"
  node scripts/simulate-workflow-walkthrough.js                              # "Workflow walkthrough simulation passed"
  npm test
  ```

## Out of Scope (explicit)
- `scripts/validate-kaola-workflow-contracts.js` (Codex validator; L89/95/100 github-presence pins stay as the anchor).
- gitlab/gitea forge contract validators.
- `package.json` (no wiring change — already in `:claude` chain).
- SKILL.md content (inputs being asserted; currently in parity).
- No 4th canonical copy of the DC body or resume clause.
- No fenced-code-block guard for the slicer (heading-naïveté can only cause a false negative across all 3 editions, never a false positive).

## Advisor Notes
Advisor (`.cache/advisor-plan.md`) confirms the plan is sound, dependency-safe, and implementable; no gaps → architect-revision loop skipped. Three Phase-4 caveats adopted: (1) edit by anchor text not line numbers; (2) negative tests are rigorous TDD-red — print target line + confirm correct message + non-zero exit; (3) AC#3 evidence is the clean pass against the untouched tree. One Phase-6 sequencing flag: a CHANGELOG `assert` sits right after the insertion point — confirm what it enforces before the Phase 6 docs step adds an `[Unreleased]` entry.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor found no blueprint gaps; revision loop not triggered |
