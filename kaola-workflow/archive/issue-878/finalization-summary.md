# Finalization — Summary: issue-878

Closes #878. Branch `workflow/issue-878`, implementation commit `54ac5454`.

## Delivered

**The watch list is now self-sufficient in the committed doc, and its backlog mirror is closed.**

My opening concern was **overstated and was retracted before any work began**: I warned that closing
#878 would discard the register of mechanisms deliberately not built. It would not. The issue's own
body says "the table lives in the committed doc", and
`docs/decisions/0017-the-mission-list.md` § *The watch list — derived, never observed, therefore not
built* holds all seven rows with their arming observations. #878 was a pointer whose stated purpose was
discoverability from the backlog, not custody of the content.

What was genuinely at risk was smaller and is fixed. Two rows named a mechanism without saying where it
went — the live-writers row said only "CAS with the conflict returned as data; lease with liveness
probe", the consent-valve row only "the consent valve" — while the symbols and the recovery commit
lived solely in the generated roadmap's `Next Step`, whose source file closure deletes. Both rows now
name their symbols (`acquireProjectLock` / `probeLockLiveness`; the halt marker, its two journals and
`consentScopeDigest`) and record removal in `c4caa8d3`, recoverable at `b3bc7acf` — the same anchor the
lexicon row already cited. Measured, not recalled: all three symbols return the same removal commit and
the same last-present parent.

The section now states outright that it is the register of record and the only one, and why the pointer
was closed: a permanently-open issue that is explicitly *not work* is a standing invitation to schedule
it. `kaola-workflow/.roadmap/_rules.md` points at the doc instead of the issue.

**Also, at the user's request mid-run: the changelog citation rule now covers this repository's own past
issues.** `docs/conventions.md` already required another forge's references to carry no `#`, but never
said the same refusal catches a real, closed, *local* issue cited as background — because the verifier's
known set is `--issues-closed` plus every `#\d+` in commit messages since the last tag, not "issues that
exist here". Measured cutting v9.1.0, where four background citations refused
`changelog_unknown_reference` and cost a full diagnosis. Added as a sibling bullet to the existing rule
rather than a new section, since the two cases share one cause.

## Files Changed

4 files in `54ac5454`: `docs/decisions/0017-the-mission-list.md`, `docs/conventions.md`,
`kaola-workflow/.roadmap/_rules.md`, `CHANGELOG.md`. Documentation only — no script, no generated
surface, no test.

## Test Coverage

None added and none owed: nothing executable changed. A sweep of `docs/`, `CLAUDE.md`, `templates/`,
`commands/`, `agents/`, `plugins/`, `.opencode`, `.kimi` and `.roadmap/` — dot-directories named
explicitly, since ugrep skips them — found zero remaining `#878` references besides the roadmap source
that closure removes.

## Validation

Four chains green, bound to `54ac5454` by exact `headSha`: `claude` 224s, `codex` 6s, `gitlab` 57s,
`gitea` 56s, every chain `exitCode: 0` with zero red steps and nothing waived.

Worth recording: the diff-scoper chose **all-four** under `edition_coupling`, because
`docs/conventions.md` and `docs/decisions/` are edition-coupled paths. I had predicted a docs-only diff
would demand the `claude` chain alone. That prediction was wrong, and the scoper is right.

## Changed Paths

## Documentation Docking

**DOCKED.** This run *is* documentation. `CHANGELOG.md` carries both entries.
`docs/decisions/0017-the-mission-list.md` and `docs/conventions.md` are the changes themselves.
`README.md` — no impact, no command surface or install step changed. `docs/api.md` — no impact, no
envelope, field or exit code moved. `docs/architecture.md` — no impact, no module or boundary moved.
`CLAUDE.md` — no impact; it already says "see ADR 0017's watch list" without an issue number, which
remains correct and needed no edit.

## Run gaps

- manual:overstated-concern-retracted (I warned that closing this issue would discard the watch-list register): noise: an orchestration misjudgement, corrected by reading the issue body before acting rather than after. No repo defect. Recorded because the pattern — raising a blocking concern from memory of what a thing is, instead of from the thing itself — is worth not repeating.
- manual:diff-scope-prediction-wrong (I predicted a docs-only diff would demand the claude chain alone): noise: my prediction was wrong and the scoper was right; docs/conventions.md and docs/decisions/ are edition-coupled. Nothing to fix — recorded so the next run does not repeat the wrong expectation and mistake a correct all-four demand for a scoping bug.

## Follow-Up Items

None. With #878 closed the backlog is empty.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-878/.cache/chain-receipt.json
- kaola-workflow/archive/issue-878/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-878/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-878/.cache/run-gaps.json
- kaola-workflow/archive/issue-878/finalization-summary.md
- kaola-workflow/archive/issue-878/mission-list.md
- kaola-workflow/archive/issue-878/workflow-state.md
