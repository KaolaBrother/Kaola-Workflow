evidence-binding: n5-finalize 3f27def5cd56
compliance: main-session-direct

## n5-finalize — terminal sink (non-delegable, run main-session-direct)

Added the #640 entry to `CHANGELOG.md` under `## [Unreleased]` → `### Fixed` (prepended,
newest-first), recording: the OPT-2 `metric_paths` shape check now refuses absolute-path /
backslash / bare-existing-directory entries mirroring the freeze-wall's exact check forms
(precedence absolute-before-backslash, local `optRoot` recompute, `OPT-2:`-prefixed per-path
reason); closes the #639 defense-in-depth residual (D-639-01); RED-first walkthrough fixtures
(3 refuse + Makefile accept-control); both in-run gates (code-reviewer + adversarial-verifier)
passed with only a cosmetic non-blocking label-ordering note; decision record D-640-01;
docs/api.md OPT-2 bullet updated; cross-edition #307, all four chains green (serial, unwaived).

Sink write set: CHANGELOG.md (the unique docs/state sink). Docs (api.md, D-640-01.md) and the
CHANGELOG are barrier-invisible allowband writes. The authoritative unwaived serial four-chain
receipt is produced by the orchestrator after the feature commit (finalize step).
