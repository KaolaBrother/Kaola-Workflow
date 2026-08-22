# Finalization — Summary: issue-1014

## Delivered

Issue #1014 makes Cursor `/workflow-next` load Kaola `Task` types from the workspace `.cursor/agents` catalog and omit per-call `model` (including `inherit`), so the #1013 frontmatter pins can fire. Canonical next gained `## Agent Model Dispatch` (Claude still passes `model=`; Cursor substitutes the shared omit-model named-role block and forbids `generalPurpose` impersonation). `install-cursor.sh --global` still writes un-nested `${CURSOR_HOME}/{agents,commands}` and, from a git work tree, also dual-writes `<toplevel>/.cursor/{agents,commands}`. The init overlay no longer says to pass the role's configured model.

Live close evidence (fresh `agent -p` chats, Cursor CLI 2026.08.11): Probe A still schema-rejects named `implementer` when the workspace catalog is empty; `--global` dual-write then a new xhigh parent resolved `implementer` → `cursor-grok-4.6-medium` and `code-reviewer` → `cursor-grok-4.6-high`; a next-card parent with no catalog did not impersonate via `generalPurpose`.

## Files Changed

- `templates/routing/next.skeleton.md`
- `templates/routing/init.skeleton.md`
- `commands/workflow-next.md` and gitlab/gitea twins
- `commands/workflow-init.md` and gitlab/gitea twins + three `kaola-workflow-init` skills
- `scripts/sync-cursor-edition.js`
- `install-cursor.sh`
- `scripts/test-cursor-edition.js`
- `scripts/validate-workflow-contracts.js` and Codex plugin mirror
- gitlab/gitea contract validators
- `README.md`
- `docs/README.md`
- `docs/cursor-edition.md`
- `CHANGELOG.md`

## Test Coverage

- Test-first baseline: 22 new cursor-edition failures with 560 passes at `3a289108`; contract validators threw on missing next heading.
- After implement: cursor-edition 584 green; generate `--check` 18/18; route-reachability 504; grok 543; opencode 680; kimi 645; walkthrough 186/186.
- First chain run failed `validate-script-sync.js` (Codex COMMON_SCRIPTS mirror). Copy landed in `e25ac72b`; `validate-script-sync.js` then exit 0.
- Independent review: one high (that mirror) — resolved. Adversarial verifier refuted “GREEN cannot lie” on inherit-omit needle tightness and an unused `copyListCanonAgents` production bind; those are pin-quality notes, not product defects, and did not block close.

## Validation

Candidate-bound receipt `kaola-workflow/issue-1014/.cache/chain-receipt.json` completed 2026-08-22. `headSha` `e25ac72b813d6cafbd14c5c33dab0c0d804523f7`, `workTreeHash` `clean`, `codeTreeHash` `13a2b7d46719b7d7577ff26d0a03890433ea47285953f7ba932d5d8599240825`. Scope `all-four` (`edition_coupling`). Claude 0, Codex 0, GitLab 0, Gitea 0; one attempt each; no retry, timeout, signal, or accepted red.

## Changed Paths

The tracked delivery paths are listed under `## Files Changed`; the finalize transaction appends its measured changed-path finding here.

## Mission List

All five mission-list items are `done` (measure, RED pins, implement, suites+walkthrough, live close evidence). The finalize transaction appends its measured mission-list finding here.

## Documentation Docking

`verdict: DOCKED`. README, docs index, Cursor edition guide, `[Unreleased]` changelog, and issue plan-of-record comments agree. `docs/api.md`, `docs/architecture.md` (pointer still valid), and `.env.example` have no impact.

## Run gaps

The run-gap sweep returned `sweptClasses: []`; no gap row is owed.

## Follow-Up Items

None required to close #1014. Optional later pin-tightening (inherit-omit teaching vs Invalid-enum leftover token; bind `copyListCanonAgents` on a production copy path) was recorded in `.cache/adversarial.md` and is not a close blocker.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1014/.cache/adversarial.md
- kaola-workflow/archive/issue-1014/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1014/.cache/doc-docking.md
- kaola-workflow/archive/issue-1014/.cache/doc-updater.md
- kaola-workflow/archive/issue-1014/.cache/live-cursor.md
- kaola-workflow/archive/issue-1014/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1014/.cache/probe-23-install.log
- kaola-workflow/archive/issue-1014/.cache/probe-23.meta
- kaola-workflow/archive/issue-1014/.cache/probe-23.ndjson
- kaola-workflow/archive/issue-1014/.cache/probe-23.stderr
- kaola-workflow/archive/issue-1014/.cache/probe-4.meta
- kaola-workflow/archive/issue-1014/.cache/probe-4.ndjson
- kaola-workflow/archive/issue-1014/.cache/probe-4.stderr
- kaola-workflow/archive/issue-1014/.cache/probe-a.meta
- kaola-workflow/archive/issue-1014/.cache/probe-a.ndjson
- kaola-workflow/archive/issue-1014/.cache/probe-a.stderr
- kaola-workflow/archive/issue-1014/.cache/review.md
- kaola-workflow/archive/issue-1014/.cache/run-gaps.json
- kaola-workflow/archive/issue-1014/finalization-summary.md
- kaola-workflow/archive/issue-1014/implement.md
- kaola-workflow/archive/issue-1014/measure-locators.md
- kaola-workflow/archive/issue-1014/mission-list.md
- kaola-workflow/archive/issue-1014/suites-green.md
- kaola-workflow/archive/issue-1014/tdd-green.md
- kaola-workflow/archive/issue-1014/tdd-red.md
- kaola-workflow/archive/issue-1014/workflow-state.md
