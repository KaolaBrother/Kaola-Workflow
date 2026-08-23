# Finalization — Summary: issue-1016

## Delivered

Issue #1016 binds Cursor catalog materialize to a production CLI (`scripts/kaola-workflow-ensure-cursor-catalog.js`), a second `sessionStart` hook that prints `{}`, and an `install-cursor.sh` extra-script, so a consumer with no project `.cursor/agents` gets the 14 canonical roles from `$CURSOR_HOME/agents` without rewriting the consumer `CLAUDE.md` overlay and without `Task(model=)` or `generalPurpose` impersonation.

`already-present` is all 14 dest files byte-identical to global (a lone `implementer.md` is not present). Source of truth is `$CURSOR_HOME/agents`, never git toplevel. Isolated `--global` copies do not `require` `sync-cursor-edition.js`. `copied` stops named dispatch for a new chat; `missing-source` prints `./install-cursor.sh --target "$PWD"`.

Live close evidence (fresh `agent -p` chats, Cursor CLI 2026.08.11): empty-catalog control session `27f72171` schema-rejected named `implementer` (Invalid enum; no `generalPurpose` retry); ensure then `copied` / `already-present`; new-chat session `812b7b22` resolved `implementer` → `cursor-grok-4.6-medium` and `code-reviewer` → `cursor-grok-4.6-high`. This IDE parent already had a workspace catalog at session start and named omit-model Tasks fired here without `generalPurpose`.

## Files Changed

- `scripts/kaola-workflow-ensure-cursor-catalog.js` (new)
- `scripts/sync-cursor-edition.js`
- `install-cursor.sh`
- `scripts/test-cursor-edition.js`
- `scripts/test-kernel-conformance.js`
- `README.md`
- `docs/README.md`
- `docs/cursor-edition.md`
- `docs/api.md`
- `CHANGELOG.md`

Frozen vs HEAD: `templates/routing/init.skeleton.md`, `scripts/kaola-workflow-install-manifest.js`. No `Task(model=)`. No #1013 restamp.

## Test Coverage

- Test-first baseline: 28 intended G10 FAILs / 608 passed on `f3642cb0`.
- After implement: cursor-edition 687 then 778 after adversarial R1 (isolated `ensureCursorCatalog` drive + all-14 dest pins; sibling `require('./sync-cursor-edition.js')` dropped).
- First chain run failed PART F: unledgered `kaola-workflow-ensure-cursor-catalog.js copyFileSync`. Ledger row `mirror-copy` after `67e86616`; kernel conformance 252 green.
- Independent review: pass, 0 blocking. Adversarial first pass refuted the isolated-copy pin-quality conjunct; R1 closed that counterexample. Other seven attacks not_refuted.
- Live streams independently parsed; SHA-256 recorded in `.cache/live-cursor.md`.
- Edition-only: no routing-skeleton leak; cursor-edition is the product suite. Diff-scoped chain receipt is owned under `## Validation`.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- install-cursor.sh
- scripts/kaola-workflow-ensure-cursor-catalog.js
- scripts/sync-cursor-edition.js
- scripts/test-cursor-edition.js
- scripts/test-kernel-conformance.js

## Mission List

items: 9
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`verdict: DOCKED`. README, docs index, Cursor edition guide, API Installation row, and `[Unreleased]` changelog agree on dest `<cwd>/.cursor/agents`, source `$CURSOR_HOME/agents`, three status tokens, extra-script not in the github manifest, overlay not a dispatch surface. `docs/architecture.md` and `.env.example` have no impact.

## Run gaps

The run-gap sweep returned `sweptClasses: []`; no gap row is owed.

## Follow-Up Items

None required to close #1016. R1 pin-quality (isolated roster must actually copy all 14 names) was closed in this run.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1016/.cache/adversarial.md
- kaola-workflow/archive/issue-1016/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1016/.cache/doc-docking.md
- kaola-workflow/archive/issue-1016/.cache/doc-updater.md
- kaola-workflow/archive/issue-1016/.cache/kernel-ledger.md
- kaola-workflow/archive/issue-1016/.cache/live-cursor.md
- kaola-workflow/archive/issue-1016/.cache/live.meta
- kaola-workflow/archive/issue-1016/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1016/.cache/probe-control.ndjson
- kaola-workflow/archive/issue-1016/.cache/probe-control.stderr
- kaola-workflow/archive/issue-1016/.cache/probe-envelopes.ndjson
- kaola-workflow/archive/issue-1016/.cache/probe-envelopes.stderr
- kaola-workflow/archive/issue-1016/.cache/r1-tdd.md
- kaola-workflow/archive/issue-1016/.cache/review.md
- kaola-workflow/archive/issue-1016/.cache/run-gaps.json
- kaola-workflow/archive/issue-1016/finalization-summary.md
- kaola-workflow/archive/issue-1016/implement.md
- kaola-workflow/archive/issue-1016/mission-list.md
- kaola-workflow/archive/issue-1016/tdd-green.md
- kaola-workflow/archive/issue-1016/tdd-red.md
- kaola-workflow/archive/issue-1016/workflow-state.md
