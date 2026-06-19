# Finalization - Summary: issue-538

## Delivered

Flip the path switch (#538): adaptive is now the UNCONDITIONAL default; `fast`/`full`
become install-time opt-ins (`--with-fast`/`--with-full`). Retired the adaptive on/off
switch (`enable_adaptive`/`KAOLA_ENABLE_ADAPTIVE`/`resolveEnableAdaptive`/
`WORKFLOW_PATHS_NO_ADAPTIVE`) and every automatic fallback between paths. Config field
flips `enable_adaptive: <bool>` → `installed_paths: <array>` (adaptive implicit-always).
All 8 acceptance criteria met.

## Files Changed

58 files, +1143 / −1390 (net subtraction). 4 clusters:
- **Schema/claim/classifier** (×4 editions): `kaola-workflow-adaptive-schema.js` (byte-identical
  ×4 — `resolveInstalledPaths`/`INSTALLED_PATHS_FIELD` in, `resolveEnableAdaptive` out),
  `kaola-workflow-claim.js` (+ 2 forge ports — `path_not_installed`/`bundle_requires_adaptive`),
  `kaola-workflow-classifier.js` (+ forge — config default).
- **Installer**: `install.sh` (adaptive-only default, `--with-fast`/`--with-full`, union/spare,
  `--enable-adaptive` warn-ignore), `uninstall.sh` (config removal).
- **Router prose** (#400 6 surfaces + forge + full/fast entry surfaces): `workflow-next.md`,
  `kaola-workflow-adapt.md`, `kaola-workflow-fast.md`, `kaola-workflow-phase1.md`, the
  `kaola-workflow-{next,adapt,fast,research}` SKILLs ×3 editions.
- **Contracts/walkthroughs/tests/docs**: the ×4 `validate-*-contracts.js` + `test-route-reachability.js`,
  the 4 walkthrough chains + 2 forge test-scripts, `test-install-adaptive-config.js`,
  `test-install-model-rendering.js`, `test-claim-hardening.js`, `test-bundle-{claim,state}.js`,
  README/api.md/architecture.md/conventions.md/workflow-state-contract.md, ADR `D-538-01.md`
  (supersedes `0007`), CHANGELOG.

## Test Coverage

All four cross-edition chains green (HEAD-bound receipt `.cache/chain-receipt.json`, headSha
cf43da3f): claude exit 0 (234s), codex exit 0 (11s), gitlab exit 0 (86s), gitea exit 0 (64s).
n8 code-review independently re-ran the claude + codex chains.

## Final Validation Evidence

- `.cache/chain-receipt.json` — fresh, HEAD-bound (cf43da3f), all four chains green.
- Adaptive barrier gates all pass: `--resume-check`=0, `--gate-verify`=0, `--barrier-check`=pass,
  `--verdict-check`=0.
- n8-review (`.cache/n8-review.md`): `verdict: pass`, `findings_blocking: 0` — all 8 ACs verified,
  cross-edition completeness (schema byte-identity md5, forge-mirror parity), no dead-symbol survivors.

## Documentation Docking

DOCKED. n9-docs created `docs/decisions/D-538-01.md` and migrated README, api.md, architecture.md,
conventions.md, workflow-state-contract.md to the `installed_paths` model. Independently verified:
zero live retired-vocab, every documented symbol exists in code (no fabrication). CHANGELOG
`[Unreleased]` entry written by the finalize node.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

- **#542** — retire the stale `KAOLA_ENABLE_ADAPTIVE` example row in `.env.example` (deferred from
  this run: `.env*` matches the security-sensitive pattern → forcing a low-value G2 gate for a 2-line
  doc deletion is over-engineering, precedence #3) + optional claim.js resume-read default cleanup.

## Run gaps

- manual:env-example-stale-row (`.env.example` retired `KAOLA_ENABLE_ADAPTIVE` row): filed: #542

## Closure Decision

No deferred items requiring user decision. Two mid-run plan-repair nodes were added and fully
resolved IN-run (n6b-residual-prose) after the validator/route-reachability contracts caught the
frozen plan under-scoping the #538 propagation (9 prose surfaces + 1 install-test); both re-frozen
with `--freeze --repair` (ledger preserved, n8 post-dominates). The one genuinely-deferred residual
(`.env.example`) is filed as #542. Implementation is complete; #538 may close.

## Commit And Push

Pending final Git gate (script-owned worktree sink). Local main already advanced to cf43da3f (the
#538 principle commit) and pushed to origin to align the barrier base.

## GitHub Issue

To be closed at sink (#538).

## Roadmap

To be regenerated at closure (remove `.roadmap/issue-538.md`, regen ROADMAP.md).

## Archive

Pending (cmdFinalize archives `kaola-workflow/issue-538/`).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n9-docs.md (n9-docs node) | |
| documentation docking | invoked | .cache/n8-review.md + this summary | |
| final-validation fix executors | N/A | — | no validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | barrier gates pass, receipt green | final gate runs after this file |

## Status
ARCHIVED AFTER FINAL GIT GATE
