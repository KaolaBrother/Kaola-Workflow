# Finalization Summary — issue-1124

## Delivered

Kaola-Workflow Hermes Agent support, delivered as P0 measurement + P1 native edition:

- **P0 live measurement** on MacBook: M1–M9 CLI and A1–A7 ACP matrix in
  `docs/investigations/2026-10-28-hermes-p0-measurements.md`; the P0 result comment is
  https://github.com/KaolaBrother/Kaola-Workflow/issues/1124#issuecomment-6459562114.
- **P1 Hermes edition** (D1–D5): `scripts/sync-hermes-edition.js`, `install-hermes.sh`,
  flat `$HERMES_HOME/skills/<name>/SKILL.md`, `$HERMES_HOME/SOUL.md` managed region
  (G-a), forge-selected support scripts including the #1123 resolver guard, global-only
  scope, and `.kw-hermes[-<forge>]` build trees.
- Measured facts in `templates/agents/runtime-capabilities.json` and
  `templates/global/runtime-contract-adapters.json`; `hermes_source_v0225` separates
  source observations from P0 live probes.
- `install-all.sh`, `package.json`, `.gitignore`, claim USAGE (canonical/Codex plus
  GitLab/Gitea antigravity backfill), routing refresh, and the dedicated
  `scripts/test-hermes-edition.js` are wired. `docs/hermes-edition.md` and the
  README/API/installation/runtime-capabilities/CHANGELOG surfaces are updated.
- Review repairs: B1 identity-slot refusal, M1 source/measured split, M2 1101 gate
  coverage, m1–m11, n2 empty-SOUL guidance, n4 absent-CLI advisory, n6 source commit pin,
  and R3-B1 hermetic test PATHs.

## Candidate

- Branch: `workflow/issue-1124`
- Final candidate: `0b0f1aee` (`test(hermes): make identity-path legs hermetic (#1124)`)
- Base: `1335c6b7`
- P0 commit: `ef32d67d`; P1 commit: `2531dccd`; round-1/2/3 repairs: `51d0a0d1`,
  `b0f7ff78`, `0b0f1aee`.

## Evidence

- Owner decisions: `hermes-owner-cards-20261028` D1–D6 (D1 native delivery, D2 G-a SOUL.md,
  D3 single forge + P1 guard, D4 global-only, D5 `.kw-hermes[-<forge>]`, D6 one-shot P0).
- P0 table and live evidence: `docs/investigations/2026-10-28-hermes-p0-measurements.md`;
  P0 comment pointer above.
- P1 evidence comments:
  - round-1 repair: https://github.com/KaolaBrother/Kaola-Workflow/issues/1124#issuecomment-6461353982
  - round-2 touch-up: https://github.com/KaolaBrother/Kaola-Workflow/issues/1124#issuecomment-6461620048
  - round-3 R3-B1 repair: https://github.com/KaolaBrother/Kaola-Workflow/issues/1124#issuecomment-6461830586
- Independent review: `.kaola/review-1124.md`, four rounds (round 1 FAIL, round 2 PASS,
  round 3 FAIL on R3-B1 test hermeticity, round 4 PASS mergeable).
- Host exclusive full chain on `0b0f1aee`: `/tmp/kw-host-0b0f1aee-npmtest.log`,
  `NPM_TEST_EXIT=0`, `0 FAILED`, 27 routing surfaces byte-match.
- Focused evidence: `test-hermes-edition` pass, `test-install-all` 312,
  `test-issue-1101` 144 renders/57 blocks, `test-issue-1046` 185,
  `test-route-reachability` 154, `test-runtime-agent-architecture` 812,
  editions lane 14/14, walkthrough 205/205.
- SOUL.md owner baseline throughout: `36c1f5a2e92cd1d018311eaf4c8f1e8886672eae78212e033c681d0e3d5d506f`;
  all probe/validation writes were sandbox-only.

## Known failures or unverified scope

- Mini remains N/A: no authorized remote channel in this run; Mini needs its own P0/P1
  execution and evidence. MacBook evidence is not transferable.
- P2 per-machine certification and P3 ACP-driven KW runs are conditional future phases;
  the implementation issue is #1125. This run implements neither.
- Real-machine installation is delegated to Delegator; this run performs no installer run
  on the owner's Hermes home.
- n5 follow-up: direct `kaola-workflow-global-contract.js install --runtime hermes` can
  still create `SOUL.md`; tightening needs owner buy-in and locking. Recorded on #1124,
  not changed here.
- No release, prepare, tag, or installer was run.

## Validation

classification: chains_unverified
green: false
mode: chain-receipt

no chain receipt at /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1124/kaola-workflow/issue-1124/.cache/chain-receipt.json — run kaola-workflow-run-chains.js after the LAST commit so HEAD is covered; prose "all four chains green" is not evidence

No chain receipt found. Run kaola-workflow-run-chains.js after the last commit so HEAD is covered.

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- .gitignore
- CHANGELOG.md
- README.md
- docs/README.md
- docs/api.md
- docs/hermes-edition.md
- docs/installation.md
- docs/investigations/2026-10-28-hermes-p0-measurements.md
- docs/runtime-capabilities.md
- install-all.sh
- install-hermes.sh
- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/generate-routing-surfaces.js
- scripts/kaola-workflow-claim.js
- scripts/runtime-adapter-facts.js
- scripts/runtime-edition-forge.js
- scripts/simulate-workflow-walkthrough.js
- scripts/sync-hermes-edition.js
- scripts/test-hermes-edition.js
- scripts/test-install-all.js
- scripts/test-issue-1046-global-contract.js
- scripts/test-issue-1101-native-only.js
- scripts/test-issue-1120-ledger-handover.js
- scripts/test-issue-1123-additive-guard.js
- scripts/test-issue-1123-codex-multi-plugin.js
- scripts/test-issue-1123-multi-forge-install.js
- scripts/test-route-reachability.js
- scripts/test-runtime-agent-architecture.js
- templates/agents/runtime-capabilities.json
- templates/global/runtime-contract-adapters.json

## Follow-Up Items

- #1125 — P2/P3 implementation entry (per-machine certification and ACP).
- n5 ownership hardening for the direct global-contract CLI.
- Real Mac mini / Mac Studio installation and verification by Delegator-side execution.
- P3 ACP integration remains conditional on the measured P0 facts and owner scope.

## Readiness

Merge-ready. All four review rounds and the Host exclusive full chain passed on
`0b0f1aee`; no release or installer action is included.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1124/.cache/final-validation.md
- kaola-workflow/archive/issue-1124/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1124/finalization-summary.md
- kaola-workflow/archive/issue-1124/mission-ledger.jsonl
- kaola-workflow/archive/issue-1124/workflow-state.md
