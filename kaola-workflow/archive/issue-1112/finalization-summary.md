# Finalization Summary — issue-1112

## Delivered

`install-droid.sh` installs the Droid edition's global Workflow Skills into the shared `~/.agents/skills` root (owner decision 2026-09-28: follow KPR's shared-root approach, one shared set). Components:

- `scripts/kaola-workflow-droid-skills.js`: ownership-proven install, preflight, check, uninstall and former-root retirement. Ownership proof is the record `~/.factory/kaola-workflow/agents-skills.record`, the staged render, or a frozen catalog of every released Droid render (v12.1.0–v12.3.1, three forges). Record and SKILL.md writes use the shared `writeFileAtomicReplace`.
- Runtime-neutral renders, because other runtimes that read `~/.agents/skills` (dsh documented; devin/codex/opencode per host) load them too. No `~/.factory`/`DROID_HOME` path, no `--runtime` flag, no Droid-only dispatch prose. Support scripts are at `~/.agents/kaola-workflow/scripts`.
- Hard refusal before any write: a foreign or owner-edited same-name entry in `~/.agents/skills` exits before support scripts, skills, sweep or carrier are written.
- Cross-root conflict handling: proven old KW copies in `~/.factory/skills` are retired. Unproven Kaola-named copies are preserved and the install exits 1 after the carrier step. Non-Kaola same-name pairs get an advisory `note:` and are never touched.
- Honest `--check` at both entry points:
  - `install-droid.sh --check` reports `missing` / `stale` / `conflict`, former-root duplicates, and notes.
  - `install-all.sh --check` droid row: FAIL with the first problem when droid is on PATH; `(advisory: droid not on PATH)` otherwise.
- Native facts: Factory still documents both `~/.factory/skills` (Personal) and `~/.agents/skills` (Personal compatibility). The shared root is a distribution choice, not a claim that Factory retired `.factory`.

## Issue statement walk

- Install global Skills to `~/.agents/skills`, coordinated with other carriers so same-name files don't collide. No other KW edition installs these names there. Foreign or KPR same-name entries are refused, never overwritten (test-droid-edition T3/T4, preflight block).
- Migrate old KW copies out of `~/.factory/skills` without touching personal Skills (T2/T2a/T8; QA2 cases).
- `--check` at both entry points verifies the new location and reports missing/stale, plus conflict (T5; test-install-all E2/E4; QA3).
- Header docs/usage updated. Project scope stays at Droid's documented primary `<DIR>/.factory/skills`.
- Premise correction (Factory did not retire `.factory/skills`) was already posted on the issue before close.

## Quality story

- QA of candidate e4fe355a: ACCEPT WITH DEFECTS, `/tmp/kw-i1112-qa/qa-report.md`. The single defect was that support scripts were written before the skill refusal (QA2/QA6).
- Repair 80e8114a: preflight before any write; a whole-HOME zero-write snapshot test.
- Delta recheck on 80e8114a: PASS, `/tmp/kw-i1112-qa/delta-check.md`.
- Host acceptance covered 80e8114a.
- Integration (third serial merge): rebased onto main 17aba5d8. Pre-rebase → rebased shas: fe0e8b39→75cdc4b3, e4fe355a→455053df, 80e8114a→c8807fe0. The only conflict was CHANGELOG [Unreleased], merged into one section.
- The complete chain on the rebased candidate found two conformance gaps, now fixed without any behavior change:
  - 6d9111c1: droid-skills writes go through the shared atomic replace (test-kernel-conformance partF write-surface ledger).
  - 9ba77d37: classify the second preflight CLI spawn site (spawn-classification ceiling 0).

## Integration reconciliation of generated edition trees

The gitignored `.opencode*`, `.kimi*` and `.grok*` trees in the main checkout were stale against main's #1111 command sources. Only `workflow-next` and `kaola-workflow-finalize` were affected, across the github/gitlab/gitea trees. They were regenerated from the clean integrated candidate via `sync-{opencode,kimi,grok}-edition.js --forge=github --write` and `--refresh-present` (present trees only; `opencode.json` preserved as user-owned). All 9 `--check` runs exit 0. Main git status is unchanged (the trees are ignored). Results on the exact head 9ba77d37:

- test-opencode-edition: 647 assertions, PASS, 3 trees in parity.
- test-kimi-edition: 453 assertions, PASS, 3 trees in parity.
- test-grok-edition: 158 assertions, PASS, 3 trees in parity.

## Files Changed

CHANGELOG.md, docs/api.md, docs/droid-edition.md, docs/runtime-capabilities.md, install-all.sh, install-droid.sh, scripts/kaola-workflow-droid-skills.js (new), scripts/sync-droid-edition.js, scripts/test-droid-edition.js, scripts/test-install-all.js, scripts/test-issue-1087-lane-a.js, templates/agents/runtime-capabilities.json.

## Test Coverage

All on head 9ba77d37:

- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js --project issue-1112`: chain `claude` exit 0. Receipt `.cache/chain-receipt.json` has headSha 9ba77d37e287cca9c811e18907723944a40e1fc7.
- test-droid-edition PASS; test-install-all 302 PASS; test-issue-1087-lane-a 93 PASS; test-kernel-conformance 239 PASS; test-spawn-classification PASS.
- simulate-workflow-walkthrough 204/204.
- The three editions suites above.

All installer tests use a temp HOME/DROID_HOME. The real `~/.agents/skills` and `~/.factory/skills` were never touched.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- docs/droid-edition.md
- docs/runtime-capabilities.md
- install-all.sh
- install-droid.sh
- scripts/kaola-workflow-droid-skills.js
- scripts/sync-droid-edition.js
- scripts/test-droid-edition.js
- scripts/test-install-all.js
- scripts/test-issue-1087-lane-a.js
- templates/agents/runtime-capabilities.json

## Documentation Docking

`.cache/doc-docking.md`: DOCKED.

## Follow-Up Items

Known items, not defects of this delivery. No follow-up issue filed.

- `triggers: [user, model]` frontmatter is untested under Devin/Codex/OpenCode/dsh (dsh's own renderer omits it).
- No real Droid session was run; unpublished code is never installed on the live machine.
- A runtime that also has its own KW edition (e.g. Devin `~/.config/devin/skills`) may discover both copies of a workflow skill. Both are runtime-neutral, and KW never touches the other copy.
- KPR consumer-side caveats are tracked in KaolaBrother/kaola-project-runner #212/#213 (per Host); nothing in KPR was modified.

## Readiness

READY — Host acceptance on 80e8114a. Integrated head 9ba77d37 is green on the complete chain and the editions suites.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1112/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1112/.cache/doc-docking.md
- kaola-workflow/archive/issue-1112/.cache/final-validation.md
- kaola-workflow/archive/issue-1112/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1112/finalization-summary.md
- kaola-workflow/archive/issue-1112/mission-ledger.jsonl
- kaola-workflow/archive/issue-1112/workflow-state.md
