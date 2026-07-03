evidence-binding: n1-engine 0efb6bc17b67
<!-- RED: failing-test signatures captured BEFORE implementation (walkthrough --only, real exit codes) -->
RED: three new RED oracles in scripts/simulate-workflow-walkthrough.js, all EXIT=1 pre-impl.
  - testSummaryDispatchSegments602 EXIT=1 — AssertionError: `#602 (a): summary must carry a dispatch segment opened=/role=/task=/mode=/effort=, got: "summary: ok"` (the --summary emitter printed only the bare `summary: ok` result token; no dispatch card in-band).
  - testCodexDispatchModeThreading603 EXIT=1 — AssertionError: `#603 (a): startup should exit 0, got 1` (`--codex-dispatch-mode` was not in KNOWN_VALUE_FLAGS → the #476 unknown_flag refusal; the state field was never written and the dispatch card stayed v1-thread-id).
  - testRunProgressMirror605 EXIT=1 — AssertionError: `#605 (a): run-progress.json must exist at the MAIN root after a worktree ledger mutation` (no derived mirror was written from a linked-worktree open-next).
<!-- GREEN: same tests passing AFTER the minimal implementation (+ full-suite counts) -->
GREEN: same three tests PASS EXIT=0 after impl (`testSummaryDispatchSegments602: PASSED`, `testCodexDispatchModeThreading603: PASSED`, `testRunProgressMirror605: PASSED`).
  - Full canonical suite: `node scripts/simulate-workflow-walkthrough.js` → EXIT=0 `Workflow walkthrough simulation passed`.
  - All six edition walkthroughs EXIT=0 (root claude, codex, gitlab, gitlab-codex, gitea, gitea-codex).
  - `node scripts/test-claim-hardening.js` EXIT=0 `claim-hardening tests passed (155 assertions)` (+6 new #603 flag-validation assertions incl. the newline-injection guard).
  - `node scripts/edition-sync.js --check` green (10 forge aggregator ports in rename-normalized parity); `node scripts/validate-script-sync.js` green (24 common scripts, 25 byte-identical groups, 8 rename-normalized families, 7 forge export-superset families in sync — codex claim.js byte twin + forge export supersets confirmed).
