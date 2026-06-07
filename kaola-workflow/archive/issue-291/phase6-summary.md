# Phase 6 - Summary: issue-291

## Delivered
Hardening pass for the #281 parallel-batch follow-ups (R1/R2/R4), applied across all four editions:
- **R1** — `runSealMember` idempotency guard (no duplicate `## Required Agent Compliance` row on re-run).
- **R2** — `runOpenBatch` baselines-first ordering (a mid-loop baseline failure makes zero plan/ledger mutation; honestly scoped — not fully atomic, the plan-write→manifest-write gap remains).
- **R4** — partial-seal legality via an unsealed-subset predicate at BOTH AC#5 gate sites (`crossCheckStatus` + `runOrient`), non-regressing against P6c/T20b/T20d.

## Files Changed (11)
- Base (harden, tdd-guide): `scripts/kaola-workflow-parallel-batch.js`, `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js`, `scripts/kaola-workflow-adaptive-node.js`, `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`, `scripts/test-parallel-batch.js`, `scripts/test-adaptive-node.js`
- Forge ports (harden-forge, implementer): `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`
- Doc (finalize): `CHANGELOG.md`

## Test Coverage
Hand-rolled assert harness (no framework). New: `test-parallel-batch.js` 80→86 assertions (R1/R2/R4a), `test-adaptive-node.js` 136→138 assertions (R4b partial-seal fixture). Cross-edition behavior covered by base unit tests + gitlab/gitea contracts + walkthroughs.

## Final Validation Evidence
- 4 adaptive barrier gates: resume-check=0, gate-verify=0, barrier-check=0 (whole-plan, 10-file diff within union allowlist, no sensitive/out-of-allow), verdict-check=0.
- `npm test` (claude/codex/gitlab/gitea) — evidence `.cache/final-validation.md`.
- `validate-script-sync.js` OK (Claude↔Codex pair byte-identical). Forge ports verified character-identical to the base hunks (diff comparison).

## Documentation Docking
DOCKED. doc-updater SKIPPED with explicit reason: internal-script hardening with NO public behavior / API / CLI-output / env var / architecture impact; the only doc surface is the CHANGELOG `[Unreleased]` entry, authored inline (Trivial Inline Edit Exception / finalize node deliverable). README / api / architecture / .env.example unaffected.

## Follow-Up Items
- **F1 (pre-existing, NOT introduced by #291):** `crossCheckStatus` and `runOrient` diverge on a single-`in_progress` + all-sealed-manifest input (one flags orphan, the other falls through to the legacy single-node path). Surfaced by the #291 adversarial-verifier (`scope=pre_existing, action=follow_up, status=deferred`), recorded in `.cache/adversarial-verify.md` and the CHANGELOG. Non-blocking; offered to the user as an optional follow-up issue.

## Closure Decision
Advisor consulted (closure decision gate). No blocking deferred items: F1 is pre-existing and machine-readably recorded (`--verdict-check` returned `unresolvedFixes:[]`). Release decision: merge UNRELEASED (CHANGELOG `[Unreleased]`, no version bump/tag) — the goal was to finish the issue, not cut a release; mirrors the #266 merged-unreleased precedent.

## In-Run Plan Repair
A `harden-forge` (implementer) node was inserted mid-run (`harden → harden-forge → code-review`, G1 post-dominance preserved, `--freeze` re-stamp, ledger preserved) after the G1 code-review surfaced that the same R1/R2/R4 bugs lived in the gitlab/gitea edition-named ports — judged IN SCOPE for a complete hardening.

## Commit And Push
[pending final Git gate — contractor commit + sink-merge]

## GitHub Issue
[pending — closed by sink-merge --issue 291]

## Roadmap
[pending — cmdFinalize closure + regen]

## Archive
[pending — cmdFinalize → kaola-workflow/archive/issue-291/]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | CHANGELOG [Unreleased] entry (inline) | no public behavior/API/CLI/env/architecture impact; CHANGELOG is the only doc surface |
| documentation docking | invoked | this summary (DOCKED) | |
| closure advisor gate | invoked | advisor consulted at closure | |
| code-review gate (G1) | invoked | .cache/code-review.md (verdict: pass, 0 blocking) | |
| adversarial-verify gate | invoked | .cache/adversarial-verify.md (verdict: pass, NOT-REFUTED) | |
| final-validation | invoked | .cache/final-validation.md | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status / barrier gates | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
