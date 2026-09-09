# Finalization summary — bundle-1056 (Issue #1056)

Candidate: `ac307a25` (code) → `723b326a` (run-folder records only). Baseline `e72407b8`. Owner acceptance: passed independently on 2026-09-10 (env-contract 40/40, oracle 300/300, four-chain receipt exit 0 / `accepted_red=false`, per-call implementation read).

## Delivered

- **Pre-release defect fixed.** `defaultBranch(root)` in `kaola-workflow-adaptive-schema.js` consults `KAOLA_WORKFLOW_OFFLINE` and `KAOLA_GH_REMOTE_TIMEOUT_MS` on every call (`offlineNow()`, `remoteTimeoutMsNow()`); the #1055 load-time constants are gone. Probe order, clamp, fallback, and `timeout:` placement unchanged.
- **gitlab/gitea claim hand-ports** delegate to their plugin-local kernel copy (import swap only); they now honour `KAOLA_GH_REMOTE_TIMEOUT_MS` for the git probes, default 30000 unchanged.
- **#1055 records corrected by appending** `kaola-workflow/archive/bundle-1055/corrections.md` (five rows) and a comment on #1055; the archived `acceptance.md` / `adversarial.md` NUL bytes replaced by escape text (one line each); no completed Mission result rewritten.
- **Kept by ruling:** legacy non-`--sink` pipeline, 260 barrier refs, forge CLI timeouts captured at load (gh/glab/tea).

## Files Changed

`scripts/kaola-workflow-adaptive-schema.js` (+ three byte-identical plugin mirrors), `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`, `scripts/test-issue-1056-default-branch-env-contract.js` (new), `package.json` (five chain registrations), `CHANGELOG.md`, `docs/api.md`, `kaola-workflow/archive/bundle-1055/{corrections.md,acceptance.md,adversarial.md}`.

## Test Coverage

`scripts/test-issue-1056-default-branch-env-contract.js`: 40 assertions, 6 scenarios, fresh child processes with an in-process `execFileSync` mock; 10 RED on `e72407b8`; count floor; 5 GREEN pins mutant-proven. Existing suites: claim-hardening, sink-merge, forge scoping ×2, gitlab/gitea sinks and workflow-scripts, oracle, contracts, spawn-classification, suite-registration.

## Acceptance walk (Issue #1056 + owner ruling)

| item | satisfied by |
|---|---|
| failable offline / load-order / timeout regressions first | `acceptance.md` (RED on baseline, GREEN on candidate) |
| minimal fix with an explicit contract; probe order, timeout bound, fallback, per-forge behaviour kept | `impl.md`, `review.md` (character-for-character body equivalence; ports one hunk each) |
| hand-ports: import swap only | `git diff e72407b8 ac307a25 -- plugins/*/scripts/*claim.js`: one hunk each |
| re-review + full candidate-bound validation | `review.md` ready with notes (all six addressed), `validation.md` runs 1 and 2 |
| #1055 records corrected without rewriting Mission results | `corrections.md`; archived `mission-list.md` diff empty |
| legacy pipeline and barrier refs untouched | no diff outside the listed files |

## Documentation Docking

`.cache/doc-docking.md`: DOCKED.

## Follow-Up Items

None filed. Informational: forge CLI (`gh`/`glab`/`tea`) timeouts remain load-captured by ruling.

## Readiness

READY — closure decision: close #1056 via the merge sink; release 11.0.1 follows under the owner's separate authorisation.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-adaptive-schema.js
- scripts/test-issue-1056-default-branch-env-contract.js

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1056/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1056/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1056/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1056/acceptance.md
- kaola-workflow/archive/bundle-1056/finalization-summary.md
- kaola-workflow/archive/bundle-1056/impl.md
- kaola-workflow/archive/bundle-1056/mission-list.md
- kaola-workflow/archive/bundle-1056/review.md
- kaola-workflow/archive/bundle-1056/validation.md
- kaola-workflow/archive/bundle-1056/workflow-state.md
