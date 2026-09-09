# doc-updater evidence — issue #1053

## Files touched

1. `docs/task-quality.md` (new, 81 lines) — guide covering: what a task needs (situation, intended
   outcome, acceptance basis), a verbatim blockquote of the "Task clarity" paragraph from
   `templates/routing/next.skeleton.md`, splitting work by independently acceptable outcomes vs.
   keeping shared dependencies together, a worked example (one-line permission fix: no extra
   requirement sheet, evidence for refused/legitimate/regression paths, small change never lowers
   acceptance), a verbatim blockquote of the "Run it" verification-scope sentence, PASS-invalidation
   and no-unexecuted-check rules, corrections routing (issue comment / fix+test / docs under ADR 0023
   / ADR), explicit no-learning-loop statement, and links to ADR 0017 and ADR 0023.
2. `docs/README.md:17-19` — added one bullet under `## Core` linking `task-quality.md`.
3. `README.md:100-106` — extended the existing `workflow-next` bullet with two sentences on
   task-clarity and verification-scope guidance, linking `docs/task-quality.md`.
4. `docs/api.md:69-76` — added a `### Task-clarity guidance (#1053)` subsection after the existing
   compact-recovery paragraph (inserted after the paragraph's closing sentence, not mid-sentence),
   stating no new CLI/flag/envelope/contract and pointing to `task-quality.md`.
5. `CHANGELOG.md:1-22` — added `## [Unreleased]` above `## [10.5.0] - 2026-09-06` with an `### Added`
   entry for `docs/task-quality.md` and a `### Changed` entry describing the two Next skeleton
   guidance passages, stating no new API/command/role/config/state field/phase/approval gate and that
   all six tracked Next surfaces plus the five additive edition renders are generated from the shared
   skeleton with no hand-edited mirror.

## Source text transcribed (verbatim, from `templates/routing/next.skeleton.md`)

- Lines 48-56: the `**Task clarity.**` paragraph in "Intake, freshness, claim, and resume".
- Lines 133-137 (the relevant clause starts at line 134): the "Decide how much to explain..."
  sentence in "Run it".

Both are quoted verbatim in `docs/task-quality.md` inside blockquotes; no name, flag, count, or
result was invented.

## Validator

`node scripts/validate-workflow-contracts.js` — exit code 0, "Workflow contract validation passed".
Run twice (before and after trimming `docs/task-quality.md`), both exit 0.

## Left undone

Nothing from the assigned doc scope. This report does not claim any test or chain result beyond the
validator; per instructions, the orchestrator will append `npm test` / walkthrough evidence later.
Did not touch `scripts/`, `package.json`, `templates/`, `commands/`, `plugins/`, or `hooks/` per the
concurrency boundary.
