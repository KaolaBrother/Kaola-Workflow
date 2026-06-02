# Phase 6 - Summary: issue-230

## Delivered
Fail-closed guard in the GitLab/Gitea classifiers (`classifyIssue` + `cmdClassify`) for a degraded but exit-0 forge response. After `forge.viewIssue` and before the `=== 'closed'` check, a residual normalized state (anything not `open`/`closed`, i.e. `'unknown'` from `parseJson(raw,{})`) now returns the byte-identical `target_unavailable` object the catch arm already returns — mirroring the #218 `probeIssueState` fix in the parallel claim gate. The guard excludes both `'open'` and `'closed'` so a genuinely closed issue still classifies `red`. Root/Codex are unaffected (their `cmdClassify` does `JSON.parse(raw)` directly, which throws on degraded input → already fail-closed).

## Files Changed
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` — residual-state guard in classifyIssue + cmdClassify (+11)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` — same (+11)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — 4 regression tests (+131)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — 4 regression tests (+131)
- `CHANGELOG.md` — `### Fixed` entry under `[Unreleased]`
- `kaola-workflow/archive/issue-230/` — archived workflow folder
- `kaola-workflow/ROADMAP.md` — regenerated (no active work)

## Test Coverage
8 new tests (4 per forge: classifyIssue in-process + cmdClassify subprocess, each × empty-exit-0 and non-JSON-exit-0). RED before guards (returned `green`), GREEN after. No regression: closed→red, open→normal preserved.

## Final Validation Evidence
- `npm test` (claude + codex + gitlab + gitea) → exit 0. Evidence: `.cache/final-validation.log`.
- Independent: node test-gitlab-workflow-scripts.js exit 0; node test-gitea-workflow-scripts.js exit 0.

## Documentation Docking
DOCKED — see `.cache/doc-docking.md` (CHANGELOG updated; README/api/.env/arch no-impact).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| n/a | — | — | — | no failures |

## Follow-Up Items
- LOW (cosmetic, not actioned): each guard recomputes `(issue.state||'').toLowerCase()` that the next closed-check line also computes. Left as-is to minimize diff surface; not worth a follow-up.

## Closure Decision
#230 fully closes the named #218 follow-up — the classifier claim gate now fails closed on degraded exit-0 responses, with parity coverage. Acceptance met (RED-proven, GREEN, full suite green). No new deferred items or user-decision items. User pre-authorized closure (full sink per convention). No advisor-closure gate required.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
[pending close via sink-merge]

## Roadmap
Regenerated (no .roadmap source; "No active work").

## Archive
[pending — cmdFinalize Step 8b]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | .cache/doc-docking.md | internal claim-gate change; only CHANGELOG impacted, entry written directly (precise facts; anti-fabrication) — README/api/.env/arch no-impact |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan | no closure-blocking items |
| final-validation fix executors | N/A | .cache/final-validation.log | no failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
