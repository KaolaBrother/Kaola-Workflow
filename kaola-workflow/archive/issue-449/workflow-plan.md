# Workflow Plan — issue-449

<!-- plan_hash: efd568fd348739075e656c371954d3b6942a1dee481db09c54d1992cb6765d61 -->

bug(release): `kaola-workflow-release.js` `isStepDone()` is version-blind — cross-version
receipt bleed yields a fabricated `result:ok` (run-gap from #442 G1).

## Meta

labels: bug, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-version-key-isstepdone | tdd-guide | — | scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/test-release.js | 1 | sequence | sonnet |
| n2-code-review | code-reviewer | n1-version-key-isstepdone | — | 1 | sequence | opus |
| n3-changelog | doc-updater | n2-code-review | CHANGELOG.md | 1 | sequence | sonnet |
| finalize | finalize | n3-changelog | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Root cause (issue #449).** `isStepDone(receipt, step)` (`scripts/kaola-workflow-release.js` ~:247)
  matches on `r.step === step && r.status === 'done'` only — it is NOT keyed on version. The
  crash-resume step-receipt (`.cache/release-receipt.jsonl`) is scoped to one in-progress release
  (D-442-01 (existing) §5) but nothing enforces single-version. Cutting version A then a different higher
  version B in the same workspace without clearing the receipt makes every B mutation step
  short-circuit on A's `done` rows while `--cut` still emits `result:ok` with a fabricated
  `tag`/`steps_completed`. `package.json` and the git tag stay at A — a silent pass.

- **n1 (tdd-guide, sonnet) — test-first version-keying fix.** The fix is decided by the issue's
  Proposed fix; n1 carries it out:
  1. **RED first** — add a regression to `scripts/test-release.js`: cut A (`5.1.0`) then cut B
     (`5.2.0`) in the SAME repo with NO receipt clear, and assert B is actually applied (real
     `kaola-workflow--v5.2.0` tag created, `package.json` == `5.2.0`, CHANGELOG carries `[5.2.0]`)
     OR cleanly refused (`stale_receipt`) — NEVER a fabricated `result:ok` with no real tag. The
     test must FAIL against current `isStepDone`. (`test-release.js` drives the real subprocess CLI
     against the ROOT `RELEASE_SCRIPT` via `spawnSync` — assert real package.json/tag/CHANGELOG
     content, not a stubbed return, so the regression actually bites.)
  2. **GREEN** — make `isStepDone` (and the receipt read at runCut ~:445) version-keyed: a step
     counts done only when `r.version === version`. CARE: the terminal `git_tag` receipt row writes
     `tag` (not `version`); the idempotent short-circuit already matches `r.tag === expectedTag`
     (correct), but the step-skip read of `git_tag` must also distinguish version — match on the
     version embedded via `RELEASE_TAG_PREFIX + version`, or stamp `version` on the `git_tag`
     receipt row too and key uniformly. Do NOT regress the existing per-single-version idempotent
     re-run / partial-crash-resume contracts (T2/T3/T5 stay green).

- **Cross-edition propagation (#306/#307/#340 family).** The release script is a rename-normalized
  family enforced by `validate-script-sync.js` (line 85: byte-identical claude↔codex byte-pair;
  lines 257-264: gitlab/gitea rename-normalized ports against the root reference) and by
  `edition-sync.js --check` (wired into the gitlab + gitea chains). The IDENTICAL logic change MUST
  land in all four production files in n1's write set:
  - `scripts/kaola-workflow-release.js` (canonical),
  - `plugins/kaola-workflow/scripts/kaola-workflow-release.js` (codex byte-mirror — byte-identical),
  - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js` (rename-normalized),
  - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` (rename-normalized).
  The forge ports are generated from canonical via the declared rename map: fix root, then run
  `npm run sync:editions` (`node scripts/edition-sync.js --write`) to regenerate the codex mirror +
  the two forge ports, so `validate-script-sync.js` and `edition-sync.js --check` stay green. The
  canonical spec for the forge ports is the FULL accumulated root diff modulo the
  `kaola-workflow-` → `kaola-<forge>-workflow-` rename — mirror every hunk, never a per-concern
  re-edit. `test-release.js` exercises only the root script and runs only in the claude chain; the
  codex/forge correctness is enforced structurally by the sync validators, so the four-chain
  green check (#307) is the real cross-edition gate here.

- **n2 (code-reviewer, opus) — G1 gate.** Post-dominates the only code-producing node (n1).
  Opus because a subtle version-keying mistake (e.g. forgetting the `git_tag` row carries `tag`
  not `version`, or leaving one of the four edition files unsynced) reproduces the exact
  silent-pass class this issue fixes — a strong reviewer over a cheap implementer. Read-only
  (`declared_write_set: —`). Must confirm: (a) the RED test genuinely failed pre-fix and passes
  post-fix and drives the real CLI; (b) `isStepDone` is version-keyed including the `git_tag` path;
  (c) all four edition release files carry the identical (rename-normalized) change;
  (d) `validate-script-sync.js` + `edition-sync.js --check` pass; (e) emit lowercase
  `verdict: pass` / `findings_blocking: 0`.

- **n3 (doc-updater, sonnet) — CHANGELOG.** A user-visible bug fix → one CHANGELOG `[Unreleased]`
  entry under `### Fixed` referencing #449. Write set = `CHANGELOG.md`. No public-interface or API
  surface changed (internal `isStepDone` signature only), so no README/api.md update is required.
  No new decision record: the design decision (version-key `isStepDone` + the receipt parse) is
  fully captured by the issue's Proposed fix and is a surgical extension of D-442-01 (existing) §5, not a new
  architectural decision (the repo records no `D-449-*` yet; none needed).

- **n4 (finalize) — docs/state sink.** Unique terminal sink; writes only `CHANGELOG.md`
  (docs/state). Post-dominated by n3. The four-chain green evidence (#307) is recorded at
  finalize: `npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea`, run sequentially,
  must all be green (a green claude chain alone is insufficient — `npm test` short-circuits on the
  first `&&` failure).

## Node Ledger

| id | status |
| --- | --- |
| n1-version-key-isstepdone | complete |
| n2-code-review | complete |
| n3-changelog | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-version-key-isstepdone) | subagent-invoked | evidence-binding: n1-version-key-isstepdone 89f368f823df | |
| code-reviewer | subagent-invoked | evidence-binding: n2-code-review 7e8e4bd4e3f9 | |
| doc-updater (n3-changelog) | subagent-invoked | evidence-binding: n3-changelog 682d2aeab4d5 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 0eede3790157 | |
