# Finalization summary — bundle-1055 (Issue #1055)

Candidate: `c0abadc9` (code) → `a01b3e8e` (run-folder records only). Baseline `5cb85515` (main = v11.0.0 + bundle-1054 archive evidence).

## Delivered

**Proven deletions (net −379 lines in the 8 subtraction files: +48/−427), each with a zero-reference grep proof, a clean-room `--write` diff, and the 300-comparison render oracle:**
- the inert copy loop in `transformCommandBody` in all five `sync-*-edition.js` (CRLF/LF normalisation kept and now pinned as a no-`\r` behaviour in every edition suite), with the kimi `strippedModelDispatch` and zcode `block` remnants;
- `ZERO_HASH` ×5, `lowerSet` ×3, cursor `CURSOR_MODEL_CLASS_PINS` + `cursorModelPin`, and the four exported-but-unconsumed `*_MODEL_DISPATCH_{BLOCK,GUIDANCE}` strings in zcode/opencode with the comments that described the retired rewrite;
- sink-merge `getRoot` + `requiredArchiveFiles` (the `#901` comment kept verbatim), the dead `requiredArchiveFiles` wrapper in the gitlab/gitea hand-ports (their `getRoot` is live and stays);
- validation-runner `computeLandableBlobEntries` (orphaned since the DAG-era `plan-validator` gate was retired), codex-preflight `scopeIsFresh` (the live gate uses `scopeProfilesFresh`).

**Ownership relocations (pure moves, +119/−29 across adaptive-schema, claim, sink-pr, runtime-edition-forge; 103 real sink envelopes and every re-export identity measured unchanged):**
- sink-merge imports `getCoordRoot`/`mainRootFromCoord`/`resolveMainRoot` (+ `defaultBranch`) from adaptive-schema and `readActiveFolders` from active-folders instead of claim's forwarders;
- `defaultBranch` is defined in adaptive-schema; claim re-exports the identical function object; sink-pr no longer loads claim (9.2 ms → 1.6 ms require cost, measured, not claimed as a benefit);
- the seven byte-identical generator helpers live once in `runtime-edition-forge.js`; per-script wrappers pass `DEFAULT_FORGE`/`treeLabel` explicitly; export key sets of all five sync scripts unchanged.

**Kept, with reasons recorded in `audit.md`:** claim-native closure/archive helpers (a service module would add an installed file to 7 runtimes and 2 hand-ported forges for one consumer); the Cursor host-adaptation block in claim (single-sited, one consumer, pinned by `test-issue-1052-cursor-cli-startup-prep.js`); the legacy non-`--sink` sink-merge pipeline (~732 lines, documented public interface, 11 legacy invocations across 4 editions in `test-sink-merge.js`); the three accept-and-warn flags; legacy state strips and tolerant reads; the `legacy-worktree-cleanup` and `barrier-ref-sweep` commands; `treeLabel`/`runCheck`/`runWrite` and all per-runtime hook/permission/prune logic.

**Unmeasured benefits:** none claimed. No runtime speed or token figure is asserted anywhere in the change or its documentation.

## Files Changed

| area | files | +/− |
|---|---|---|
| canonical production scripts | 12 | +167 / −456 |
| plugin mirrors (regenerated via `npm run sync:editions`) + the two hand-port wrapper deletions | 15 | +149 / −292 |
| tests (five edition suites, cursor pin migration, new oracle) | 6 | +393 / −18 |
| fixture `scripts/fixtures/issue-1055-render-baseline.json` | 1 | +2441 |
| `CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`, `package.json` | 4 | +87 / −7 |

## Test Coverage

- `scripts/test-issue-1055-render-subtraction-oracle.js` (new, registered on `test:kaola-workflow:claude` and `:claude:full`): 300 hashed comparisons (210 agent renders + 90 command renders × LF/CRLF) against the `5cb85515` manifest; armed by four mutants (throw in `renderAgent`, command drift, agent drift, dropped command source); header carries the baseline policy.
- `scripts/test-cursor-edition.js`: the fable-tier pin reads `templates/agents/runtime-capabilities.json` and `renderRuntimeRole('cursor')` output (838 → 842 assertions); armed by an adapter mutant.
- `scripts/test-{grok,kimi,cursor,opencode,zcode}-edition.js`: CRLF/LF equality + no-`\r` acceptance for `transformCommandBody`; each armed by a per-script `split` mutant and by an in-memory `join('\r\n')` mutant.
- Existing suites exercising the relocated code: `test-sink-merge.js` (1063, four editions incl. the legacy path), `test-claim-hardening.js` (838), `test-active-folders-field-parity.js` (163), `test-validate-script-sync.js` (56), `test-validation-runner.js`, `test-edition-sync.js` (28), `test-spawn-classification.js` (724 sites), gitlab/gitea sink suites (602/604 spawns), `validate-workflow-contracts.js`.

## Acceptance walk (Issue #1055)

| acceptance item | satisfied by |
|---|---|
| re-verify real consumers on the implementation baseline; record baseline and per-item basis | `audit.md` (+ `audit-generators.md`, `audit-lifecycle.md`): baseline `5cb85515`, drift from `db6af1be` = test files only; dispositions table with basis per item |
| deletions backed by failable acceptance or subtraction; test author migrates source-shape tests | oracle + clean-room `--write` diff (308 files/side, zero drift); cursor pin migrated by `tdd-guide` (`acceptance.md`) |
| ownership direction clear; CLI/transaction/error/candidate-binding/recovery unchanged; net deletion vs relocation separated | `impl-section2.md`, `adversarial.md` §B (103 identical sink envelopes), `review.md` (ready with notes, all addressed); this summary separates the two |
| generator sharing verified on bytes, modes, idempotence, stale-artefact pruning; only authored sources changed, propagated by existing mechanisms | `adversarial.md` §A (bytes + modes), 15 `--check` runs = 0 in the main checkout after `--write`, `npm run sync:editions` + `validate-script-sync.js` exit 0 |
| conditional legacy interfaces concluded per item; undecided compatibility kept; no external state touched | `audit.md` dispositions + two HUMAN_DECISION_REQUIRED items (legacy pipeline support policy; owner-run `barrier-ref-sweep` for 260 stale refs); nothing cleared |
| focused suites, edition suites, full candidate-bound chain, walkthrough; install check when the install boundary moved; unexecuted hosts marked unknown | `validation.md`: run-chains receipt on `c0abadc9` (all-four, exit 0), five edition suites at 3/3 trees, `install-all.sh --check` exit 0; unknowns listed |
| README/docs/api/CHANGELOG/ADR/public-interface comments; final report lists deletions, relocations, kept items, unmeasured benefits | `.cache/doc-docking.md` DOCKED; this summary and the closing report |

## Documentation Docking

`.cache/doc-docking.md`: DOCKED (CHANGELOG `[Unreleased]`, `docs/api.md`, `docs/architecture.md` fixed; README, docs index, ADR: no impact with reasons).

## Follow-Up Items

- filed: #1056 (P3, area:scripts) — gitlab/gitea claim hand-ports keep a local `defaultBranch` while the kernel now ships one with zero consumers in those trees; also records the latent load-order `OFFLINE` capture measured by the adversarial verifier.
- HUMAN_DECISION_REQUIRED (not filed; the owner decides): (1) support policy for the legacy non-`--sink` sink-merge pipeline — options keep / deprecate-then-retire in a later major / retire now; recommendation: announce deprecation first, only on an explicit ruling; (2) the 260 stale `refs/kaola-workflow/barrier/*` refs on this machine — the owner may run `node scripts/kaola-workflow-claim.js barrier-ref-sweep` themselves; this run touched nothing.
- Observed, no action: `sync-*-edition.js --write` from a worktree targets the main checkout's runtime trees (`--print-tree-root`); recorded for future subtraction proofs.

## Readiness

READY — all nine missions done, receipt bound to the frozen candidate, documentation docked, follow-up filed and verified, closure decision: close #1055 via the merge sink.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
- plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/kaola-workflow-sink-merge.js
- scripts/kaola-workflow-sink-pr.js
- scripts/kaola-workflow-validation-runner.js
- scripts/runtime-edition-forge.js
- scripts/sync-cursor-edition.js
- scripts/sync-grok-edition.js
- scripts/sync-kimi-edition.js
- scripts/sync-opencode-edition.js
- scripts/sync-zcode-edition.js
- scripts/test-cursor-edition.js
- scripts/test-grok-edition.js
- scripts/test-issue-1055-render-subtraction-oracle.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-zcode-edition.js

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1055/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1055/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1055/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1055/acceptance.md
- kaola-workflow/archive/bundle-1055/adversarial.md
- kaola-workflow/archive/bundle-1055/audit-generators.md
- kaola-workflow/archive/bundle-1055/audit-lifecycle.md
- kaola-workflow/archive/bundle-1055/audit.md
- kaola-workflow/archive/bundle-1055/docs.md
- kaola-workflow/archive/bundle-1055/finalization-summary.md
- kaola-workflow/archive/bundle-1055/impl-section1.md
- kaola-workflow/archive/bundle-1055/impl-section2.md
- kaola-workflow/archive/bundle-1055/impl-section3.md
- kaola-workflow/archive/bundle-1055/mission-list.md
- kaola-workflow/archive/bundle-1055/review.md
- kaola-workflow/archive/bundle-1055/validation.md
- kaola-workflow/archive/bundle-1055/workflow-state.md
