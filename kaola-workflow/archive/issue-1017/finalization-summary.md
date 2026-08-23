# Finalization — Summary: issue-1017

## Delivered

Cursor `/workflow-next` and `/kaola-workflow-finalize` cards teach one omit-model `Task` dispatch wording: named type only, no `inherit` / `xhigh` / resume / `generalPurpose` costume, CLI stream envelope as effort oracle (`cursor-grok-4.6-medium` vs `cursor-grok-4.6-high`), IDE picker clamp as typed deferral (no `Task(model=)` workaround; do not claim IDE children display distinct effort). `/workflow-init` stays the all-runtime bootstrapper: no Cursor spawn block and no Cursor overlay freeze footer. Overlay source remains `templates/routing/init.skeleton.md`.

## Files Changed

- `scripts/sync-cursor-edition.js`
- `scripts/test-cursor-edition.js`
- `docs/cursor-edition.md`
- `CHANGELOG.md`

Frozen vs HEAD: `templates/routing/init.skeleton.md`, `commands/workflow-init.md`.

## Test Coverage

- `node scripts/test-cursor-edition.js` — 833 assertions, exit 0 on the worktree (linked-tree root reports parity for `.cursor`, `.cursor-gitlab`, `.cursor-gitea`).
- Inherit teaching pin rejects a card that says pass inherit to satisfy the schema (xhigh-only "Do not pass" is not inherit omit).
- G11: generated `workflow-init` must not contain envelope slugs, the full `CURSOR_MODEL_DISPATCH_BLOCK`, or a Cursor overlay freeze.

## Validation

(filled by the finalize transaction)

## Changed Paths

(filled by the finalize transaction)

## Mission List

items: 3
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`verdict: DOCKED`. See `.cache/doc-docking.md`. `docs/cursor-edition.md` and `[Unreleased]` changelog cite #1017. README / api / architecture / `.env.example` no-impact.

## Run gaps

## Follow-Up Items

None required to close #1017.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1017/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1017/.cache/doc-docking.md
- kaola-workflow/archive/issue-1017/.cache/doc-updater.md
- kaola-workflow/archive/issue-1017/.cache/run-gaps.json
- kaola-workflow/archive/issue-1017/finalization-summary.md
- kaola-workflow/archive/issue-1017/mission-list.md
- kaola-workflow/archive/issue-1017/workflow-state.md
