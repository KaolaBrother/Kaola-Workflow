# Phase 2 - Ideation: issue-169

## Approaches Evaluated

### Option A: Surgical fix matching Phase 1 deliverables (SELECTED)
- Summary: Add `target_unverified` verdict in offline classifier path, wire through `claimExplicitTarget()`, extract `verdict`/`reasoning` in Step 0b wrapper, add Step 0 target-existence validation, add additive top-level CLI form.
- Pros: Lowest blast radius (~30 LOC scripts, ~10 LOC docs, ~80 LOC tests); pure `classify()` unchanged; online path untouched; `cmdStartup` already propagates `reasoning` via `Object.assign`
- Cons: Two script copies (scripts/ + plugins/) need explicit diff verification
- Risk: Low
- Complexity: Small

### Option B: Lift unverified detection into `claimExplicitTarget()`
- Summary: Skip classifier change; have claim script check offline + roadmap directly
- Pros: Classifier output enum stays at 5 values
- Cons: Couples claim script to roadmap-file layout; duplicates existing classifier logic; contradicts Phase 1 deliverable #1; harder to test
- Risk: Medium
- Complexity: Small (but wrong shape)

### Option C: Full CLI subcommand restructure
- Summary: Replace `process.argv[2]` check with a proper subcommand parser
- Pros: Cleaner long-term ergonomics
- Cons: Out of scope; risks breaking `classify --issue N` callers; not requested
- Risk: Medium
- Complexity: Large

## Advisor Findings
Approach A approved. Key sharpenings:
1. **Add missing test** `testClassifierOfflineUnverifiedWithUnrelatedActiveFolder`: target M offline with no roadmap AND unrelated active folder for issue N must return `target_unverified`, NOT `user_target_red`. This short-circuits `classify()` before it can see unrelated active folders as risk overlap.
2. **Step 0 validation ordering**: new target-existence check must precede Step 0a-1 (path rubric) so agent cannot fabricate fast/full judgment for unverified target.
3. **`activeFolders` item shape confirmed**: `.issue_number` field (line 325 of classifier). Predicate: `activeFolders.some(f => f.issue_number === args.issue)`.
4. **Line 328 early-return confirmed**: fires BEFORE offline block — same-target-already-active case is already handled.

## Selected Approach
**Option A — Surgical fix**

Rationale: Matches Phase 1 deliverables exactly. Minimal blast radius. Each component (classifier verdict, claim routing, wrapper extraction, CLI ergonomics, test coverage) is independently verifiable. The architectural shape — each refusal verdict owns its typed branch in `claimExplicitTarget()`, classifier owns offline/online verdict decisions — is already established in the codebase.

## Implementation Order (Phase 3 task write sets)
1. Classifier: add `target_unverified` verdict + `cmdClassify(argv)` refactor + `--help`/top-level `--issue N` (both copies)
2. Claim: add `target_unverified` branch in `claimExplicitTarget()` (both copies)
3. Docs: `commands/workflow-next.md` — Step 0b extraction + Step 0 target-existence check (item 7 inside existing Step 0 list) + Required Output update + one sentence of consumer-repo prose ("validate against the active consumer repository, not against `KaolaBrother/Kaola-Workflow`")
4. Docs: `plugins/.../SKILL.md` — mirror extraction changes + same consumer-repo wording
5. Tests: update `testClassifierOfflineBypassesFailClosed` + add 4 new test functions (verified target, owned folder, unrelated active folder unverified, top-level `--issue` + `--help`) + ONE consumer-repo isolation assertion (added to one of the new tests — not a separate test); register in runner

## Out of Scope (explicit)
- GitLab/Gitea forge port updates (same gap, separate follow-up issues)
- `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` rename in SKILL.md
- `target_mismatch` / `target_occupied` in `claimExplicitTarget()`
- Legacy `.sessions/*.json` cleanup
- Pure `classify()` refactor
- Full CLI parser rewrite
- New fixture infrastructure for "downstream project" — existing `writeGhShimForStartup` + `initGitRepo` already model a downstream project (fixture data is `owner:test, name:repo`); no new helpers needed
- New top-level step numbering (e.g., "Step 0c") — target-existence check is item 7 inside the existing Step 0 numbered list

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
