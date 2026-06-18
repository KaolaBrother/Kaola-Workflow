# Finalization - Summary: issue-528

## Delivered
A #486 Case-B read-only shaping investigation of issue #528 (cross-chain "C1" parallelism for the four-chain `npm test` gate), concluding with decision record **D-528-01**: the affirmative "ship a concurrent `run-chains.js`" verdict is **NOT finalizable on an 18-core host** → serial four-chain dispatch stays, **no code ships** (fork B of the issue's forked acceptance criterion). The four-chain frame is genuinely NOT futile the way single-chain C1 was (ideal-core win ~460-860s; attribution structurally clean — 0/5000-trial `KNOWN_CHAINS.indexOf` re-sort mismatches; no cross-chain race observed), but the make-or-break ≤4-core contended-host win cannot be measured on this 18-core machine (macOS has no hard core-cap), so under the inverted burden it is refuted. An explicit two-part reopen condition (a contended ≤4-core benchmark) is recorded.

## Files Changed
- `docs/decisions/D-528-01.md` (new) — the decision record.
- `CHANGELOG.md` — `## [Unreleased]` → `### Changed` entry for #528.
- (workflow artifacts under `kaola-workflow/issue-528/` archived at closure)

## Test Coverage
N/A — zero code change (docs-only). No test added/removed/weakened. Coverage of the workflow scripts is unchanged.

## Final Validation Evidence
- `kaola-workflow-run-chains.js --chains claude` → `result: pass` (claude exit 0, ~650s), receipt bound to HEAD `834c19b6`. Evidence: `.cache/chain-receipt.json`, `.cache/final-validation.md`.
- `plan-validator --finalize-check` → `result: pass` (chain-receipt mode, 2 changes attributed, both `.md` allowband).
- Adaptive barrier: resume=0 gate=0 barrier=0 verdict=0 (verdict-check exempted the investigation adversarial-verifier per #509).
- Selective execution (claude-only) justified: docs-only change, no edition-tree script touched (#307 four-chain requirement N/A); codex byte-identical + gitlab/gitea carry no CHANGELOG assertion ⇒ claude green is provably sufficient. This is the lever D-528-01 itself documents.

## Documentation Docking
DOCKED — `.cache/doc-docking.md`. The change is itself documentation (decision record + CHANGELOG); no README/API/architecture/env impact (fork B ships no code).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None to file as issues. The reopen condition (a contended ≤4-core benchmark showing a median four-chain win > 2× the serial-Σ jitter band while preserving deterministic ordered attribution) is recorded as the durable REOPEN section in `docs/decisions/D-528-01.md` — the same posture D-526-01 took for its reopen condition (a decision-record reopen clause, not a speculative pre-filed issue).

## Run gaps
None — `gap-sweep --project issue-528` returned `sweptClasses: []` (no in-run repair, no deferred/waived red chain, no manual gap). `gap-sweep --check` → `result: pass` (mapped 0, filed 0, noise 0).

## Closure Decision
None needed. No deferred items, unresolved conflicts, partial implementation, or user-decision items. The investigation reached a clean, evidence-backed conclusion (fork B); the deliverable IS the decision record. Issue #528 closes — its forked acceptance criterion permits exactly this "documented not-worth-it / not-finalizable" outcome (option b), continuing the D-523/D-526 evidence-first discipline.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
#528 — to be closed at sink (acceptance criterion option b satisfied).

## Roadmap
To be regenerated at closure (remove `.roadmap/issue-528.md`, regenerate `ROADMAP.md`).

## Archive
Pending — `kaola-workflow/archive/issue-528/` at cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | docs-impact check (.cache/doc-docking.md) | deliverable IS the docs (decision record + CHANGELOG); no README/API/arch/env impact — fork B ships no code |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | — | validation passed first run (claude chain green) |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
