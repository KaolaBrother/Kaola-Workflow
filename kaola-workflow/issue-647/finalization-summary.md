# Finalization - Summary: issue-647

## Delivered

- Fixed Codex preflight and installer TOML table-state parsing for quoted/basic/literal table headers and array-of-table headers across the seven lock-step helper surfaces.
- Preserved duplicate-key ambiguity fail-closed behavior and rejected quoted single-segment dotted keys plus exact array-of-table `features.multi_agent_v2` headers as supported v2 config.
- Added cross-edition regressions for unrelated quoted Codex config tables and numeric-bound leakage.
- Updated `CHANGELOG.md` for #647.
- Updated the local Codex setup to request five multi-agent v2 threads in `/Users/ylpromax5/.codex/config.toml`.

## Final Validation Evidence

- `node scripts/kaola-workflow-run-chains.js --project issue-647` produced a green self-host receipt before the post-validation rebase:
  - claude: exit 0
  - codex: exit 0
  - gitlab: exit 0
  - gitea: exit 0
- `node plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-647/workflow-plan.md --finalize-check --json` passed before the rebase.
- The branch was then rebased onto `origin/main` `f05f15f7` (`docs: refresh README to the shipped v6.21.0 surface`) after the user warned README had changed remotely. The issue branch has no `README.md` diff against `origin/main`.
- The user explicitly approved reusing the existing green receipt without rerunning chains after that README-only rebase. `.cache/chain-receipt.json` records `originalCodeTreeHash` and `humanApprovedReuse` metadata; `.cache/final-validation.md` records the reuse boundary.

Evidence paths:
- `.cache/chain-receipt.json`
- `.cache/final-validation.md`

## Documentation Docking

DOCKED: `.cache/doc-docking.md`

- `doc-updater` audit returned `docs_updated: no` in `.cache/doc-updater.md`.
- `CHANGELOG.md` carries the user-visible #647 note.
- README/API/architecture/environment docs do not require additional updates for this internal parser bug fix.
- `kaola-workflow/ROADMAP.md` was refreshed and was already up to date.

## Run gaps

- in_run_repair (n4-review): noise: review/adversarial repair routing completed in-run; the final code-review gate passed with `findings_blocking: 0`.
- in_run_repair (n5-adversarial-repro): noise: adversarial R1/R2 findings were repaired in-run; the final adversarial gate passed with `findings_blocking: 0`.
- in_run_repair (n6-finalize): noise: finalize was reopened after upstream repair routing; no product defect remains from the reopen itself.

## Acceptance

- Official Codex manual/local runtime evidence is recorded in `.cache/n2-codex-runtime-evidence.md`.
- Implementation evidence is recorded in `.cache/n3-fix-toml-parser.md`.
- Review evidence is recorded in `.cache/n4-review.md`.
- Adversarial verification evidence is recorded in `.cache/n5-adversarial-repro.md`.
- Finalize-node evidence is recorded in `.cache/n6-finalize.md`.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | `.cache/final-validation.md`, `.cache/chain-receipt.json` | Human-approved receipt reuse after README-only rebase; chains were not rerun. |
| doc-updater | subagent-invoked | `.cache/doc-updater.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` | `node scripts/kaola-workflow-roadmap.js generate` returned `up-to-date`. |
| archive completed folder | invoked | `kaola-workflow/archive/issue-647` | Pending `cmdFinalize` archive step. |
| final commit and push | invoked | `git status --short --branch` | Pending merge sink. |
