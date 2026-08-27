# Finalization - Summary: bundle-1037-1039

Explicit user-directed bundle: Issues #1037 and #1039 through PR #1041, one merge sink followed by
the authorized repository release.

## Delivered

- Cursor installation is global-first and receipt-owned. Project materialization requires an
  explicit target, derives from current global authority, preflights collisions/symlinks/hashes,
  and uninstalls only unchanged owned bytes.
- `install-all.sh` is current-machine-only, has no Cursor Cloud mode, and rejects `--cloud` before
  any installer side effect. Cursor Cloud installation is a separate direct lifecycle available
  only after an Agent establishes it is inside the selected repository's Cloud environment setup:
  remote global plus explicit repository install, tested Build, user manual Save, then a new
  top-level Agent in the same repository.
- Standalone Cursor CLI, Cursor App local IDE, and App-started Cloud are separate measured surfaces.
  CLI point-of-use materialization is not inherited by App local or Cloud, and sessionStart remains
  compact-resume-only.
- Doctor keeps current Build/catalog identity unknown without a current live observation while
  retaining historical Cloud facts under a typed evidence stamp.
- Receipt ownership converges across full/global no-scripts/uninstall, fresh partial authority to
  ordinary project promotion, and the R4 full -> missing authority hook -> no-scripts -> promotion
  transition without retiring an independently active global live hook.
- Workflow init remains runtime-independent. Active-run instruction adoption classifies each change
  separately, preserves incompatible run state, and requires ephemeral plan-bound conversation
  consent for execution-default changes.
- ADR 0017's four-field Mission List and #1037 failure-frontier convergence strategy are preserved.

## Files Changed

The PR changes 55 files from base `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`: canonical Cursor
installer/surface logic, install-all boundary, active-run instruction helpers, canonical routing
templates and generated GitHub/GitLab/Gitea/Codex consumers, runtime capability facts, acceptance
and forge contract tests, AGENTS guidance, README, CHANGELOG, API/architecture/conventions/Cursor
runtime documentation, and ADRs 0017/0021.

## Test Coverage

- Cursor edition: 788 assertions, including mutation-backed current-vs-historical doctor identity,
  explicit target ownership, Cloud/CLI/App separation, both R3 transitions, and R4 promotion plus
  uninstall coherence.
- Runtime architecture: 798 assertions; install-all: 275; routing generation: 520.
- Mandatory walkthrough: 179/179.
- Exact candidate all-four chains include the full repository-selected Claude, Codex, GitLab, and
  Gitea suites and their preamble guards.

## Validation

Candidate `58d26e916dd9313f2aa5e671ea463cca1792895e` is pushed and clean. The exact-SHA receipt at
`.cache/chain-receipt.json` records codeTreeHash
`b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54`; all four chains exited 0
once with no accepted RED, retry, timeout, signal, waiver, or failed preamble step. Strict
`--release-check` passes. Final code review and independent detached-clone adversarial verification
both PASS with zero blocking and zero nonblocking findings.

Live evidence distinguishes standalone CLI, Cursor App 3.17.21 local IDE, two Cloud negative
controls, and the positive saved Cloud Build
`bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`: new same-repository parent
`bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d` exposed all 14 Kaola roles and exact implementer child
`bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49` returned the recorded success token without substitution.

## Changed Paths

- Runtime/install: `install-all.sh`, `install-cursor.sh`, Cursor sync/surface/install-manifest scripts.
- Portable init/adoption: project-instruction scripts/templates and all installed forge copies.
- Routing/capability: canonical skeletons, required blocks, runtime capability adapter, and generated
  command/skill surfaces for GitHub, GitLab, Gitea, and Codex.
- Tests: Cursor, runtime architecture, install-all, routing, kernel/contract/forge validators.
- Documentation: `AGENTS.md`, `README.md`, `CHANGELOG.md`, docs index/API/architecture/conventions,
  Cursor/runtime capabilities, ADR 0017, and ADR 0021.

## Mission List

All implementation, evidence, correction, repair, exact-SHA validation, and independent-review
missions are done. The only remaining missions are the transactional merge/closure/archive and the
explicitly authorized post-merge release/install convergence.

## Documentation Docking

DOCKED. `.cache/doc-updater.md` and `.cache/doc-docking.md` bind the public behavior, API, runtime
guidance, architecture, conventions, generated consumers, live evidence, and honest unknowns to
exact candidate `58d26e91`. No `.env.example` change is required because no secret, endpoint,
environment-variable, or configuration-file contract was added.

## Run gaps

`kaola-workflow-gap-sweep.js --project bundle-1037-1039 --json` returned `sweptClasses: []`. No
accepted RED, deferred validation class, unresolved owner decision, or undocumented runtime surface
remains.

## Follow-Up Items

None. Temporary Cursor Cloud test agents/environments/Builds are cleanup work authorized after the
recorded evidence is no longer needed; cleanup is not a product follow-up and will be executed after
merge/release proof.

## Status

ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1037-1039/.cache/active-init-production-repair.md
- kaola-workflow/archive/bundle-1037-1039/.cache/adversarial-verification.md
- kaola-workflow/archive/bundle-1037-1039/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1037-1039/.cache/code-review.md
- kaola-workflow/archive/bundle-1037-1039/.cache/cursor-install-investigation.md
- kaola-workflow/archive/bundle-1037-1039/.cache/cursor-production-repair.md
- kaola-workflow/archive/bundle-1037-1039/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1037-1039/.cache/doc-updater.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-adversarial-closure-r4.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-adversarial-closure.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-adversarial-verification.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-code-review-closure-r4.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-code-review-closure.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-code-review.md
- kaola-workflow/archive/bundle-1037-1039/.cache/final-live-surface-evidence.md
- kaola-workflow/archive/bundle-1037-1039/.cache/issue-1037-final-comment.md
- kaola-workflow/archive/bundle-1037-1039/.cache/issue-1039-final-comment.md
- kaola-workflow/archive/bundle-1037-1039/.cache/local-app-probe.md
- kaola-workflow/archive/bundle-1037-1039/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1037-1039/.cache/pr-1041-final-body.md
- kaola-workflow/archive/bundle-1037-1039/.cache/repair-acceptance-red.md
- kaola-workflow/archive/bundle-1037-1039/.cache/run-gaps.json
- kaola-workflow/archive/bundle-1037-1039/finalization-summary.md
- kaola-workflow/archive/bundle-1037-1039/mission-list.md
- kaola-workflow/archive/bundle-1037-1039/workflow-state.md
