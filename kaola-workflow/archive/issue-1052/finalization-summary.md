# Finalization summary for issue #1052

readiness: ready_for_finalization
candidate: b39af460a0ac1abf094795ef49bf29b9c18badac
baseline: 101b84b070e192527407a8c57ba80569d3f10d71

## Delivered

- Standalone Cursor CLI/local Workflow `startup` and `resume` run Repo role prep through the
  installed `--ensure-target` transaction before a new claim and on resume without re-claim.
  Generated Next first fences stay unstamped
  `node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`.
  When `--runtime cursor` and both `--product`/`--host` are omitted, all four claim trees stamp
  `product=cli`, `host=local`, and `cursorWorkspace=<opened dir>` from a living CLI-shaped ancestor
  (`…/YYYY.MM.DD-<hash>/index.js` or `cursor-agent`) **and** `--workspace` that shares git identity
  with cwd, then ensure that dir. Generic `--workspace` skips. `--worker-dir` is App-like and skips.
  Darwin reconstitutes spaced `--workspace` values from unquoted `ps args=`.
- Helper spawn uses each edition's install authority (`--forge=github|gitlab|gitea` on the helper,
  not a claim.js operator flag). Matching isolated installs do not `stale_forge`; mismatch still
  fail-closes. `status`/`list-open` stay zero-write. App/Cloud stay excluded.
- File-ready `materialized` reports `restart_boundary: new_process_same_chat`. Independently
  entered Finalize still uses `--ensure-target "$PWD"` immediately before named dispatch.
- No `sessionStart` materializer, no `--global` dual-write, no Runner change, no hand-edited
  rendered Cursor mirrors. #1051 global-contract bytes on main are kept.

## Files Changed

Tracked delta vs `101b84b0`: four claim trees, `scripts/sync-cursor-edition.js`,
`scripts/test-cursor-edition.js`, `scripts/test-issue-1052-cursor-cli-startup-prep.js`,
`package.json` (1052 suite after 1051 on `:claude` and `:claude:full`), README, docs/api.md,
docs/cursor-edition.md, docs/architecture.md, docs/runtime-capabilities.md, CHANGELOG `[Unreleased]`.

## Test Coverage

Independent `scripts/test-issue-1052-cursor-cli-startup-prep.js` (251) plus isolated
`--cli-materialization-oracle`. `#1051` suite (55) kept. `validate-script-sync.js` and
`edition-sync.js --check` OK. Producer four-chain receipt bound to this candidate. Unsharded
walkthrough 179/179 on this HEAD before the receipt run. Isolated real CLI: generated Next first
fence via a real `cursor-agent` Shell, then a new process named `investigator` dispatch
(`KW1052-LIVE-NAMED-DISPATCH-OK`). `:claude:full` was not executed.

## Validation

validation: chains_green
command: node scripts/kaola-workflow-run-chains.js --project issue-1052 --json
headSha: b39af460a0ac1abf094795ef49bf29b9c18badac
workTreeHash: clean
codeTreeHash: 67ff14a35bf20dac25f5c477da18d0d0402ac4efcb6dda2ab56251992d8f6fb3

Producer-selected all-four coverage passed from 2026-09-06T21:27:58.405Z through 21:36:49.697Z.
Claude 509424 ms, Codex 7836 ms, GitLab 94625 ms, Gitea 94541 ms; every chain exit 0 once; no
waiver, retry, timeout, or signal. Integration walkthrough
(`node scripts/simulate-workflow-walkthrough.js`) passed 179/179 on this HEAD before the receipt
run. chain-receipt.json preserves coverage and timings; final-validation.md records the command.

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-claim.js
- scripts/sync-cursor-edition.js
- scripts/test-cursor-edition.js
- scripts/test-issue-1052-cursor-cli-startup-prep.js

## Mission List

All fourteen items are done. Completed results remain immutable, including the earlier live probe
that used a living CLI-shaped parent and the later real `cursor-agent` normal-entry evidence in
`.cache/live-cli-real-entry-prep.md` (same live outcome; no new mission row). Finalization,
archive, closure, and sink are lifecycle transactions, not additional missions.

## Documentation Docking

DOCKED at the exact candidate. README, docs/api.md, docs/cursor-edition.md, architecture,
runtime-capabilities, and CHANGELOG `[Unreleased]` match the unstamped generated fence and
in-process ancestor stamp. See `.cache/doc-updater.md` and `.cache/doc-docking.md`.

Independently entered Finalize `--ensure-target "$PWD"` on this CLI workspace refused
`unmanaged_collision` on project `.cursor/commands/workflow-next.md` and
`kaola-workflow-finalize.md`. Named `doc-updater` was not started after that refuse; docking is
the orchestrator transcription above.

## Run gaps

## Follow-Up Items

This Finalize does not cut a release, bump a version, or run `install-all.sh --global`. After
#1051 and #1052 are both merged and closed, this same thread cuts the one unified release and
reinstalls local coding-agent runtimes.

## Acceptance boundaries

Live real Cursor CLI `2026.09.02-c22c1a3` normal-entry prep and a subsequent new-process named
dispatch were executed on an isolated `--global` install and a disposable empty consumer. Stream-json
resolved Task `model` to `cursor-grok-4.6-medium` and encoded `subagentType.custom.name`; that does
not prove the controller JSON omitted `model`. Same-process hot load was not claimed. `:claude:full`
was not executed. This session's project `.cursor/commands` collision was not repaired.

## Sink Findings

(pending sink)

archived_paths:
- kaola-workflow/archive/issue-1052/.cache/acceptance-c4-readme-retarget.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-fixture-demonstrated-parent.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-port-matching-authority.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-c1-gate-parens.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-comment-5561808292.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-forge-ports.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red-host-identity.md
- kaola-workflow/archive/issue-1052/.cache/acceptance-red.md
- kaola-workflow/archive/issue-1052/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1052/.cache/code-review-c1-gate-parens.md
- kaola-workflow/archive/issue-1052/.cache/code-review-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/code-review-call-chain-re-review.md
- kaola-workflow/archive/issue-1052/.cache/code-review-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/code-review-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/code-review-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/code-review-comment-5561808292.md
- kaola-workflow/archive/issue-1052/.cache/code-review-final-integrated.md
- kaola-workflow/archive/issue-1052/.cache/code-review-re-review.md
- kaola-workflow/archive/issue-1052/.cache/code-review.md
- kaola-workflow/archive/issue-1052/.cache/dispatch-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/dispatch-review-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/dispatch-review-comment-5561808292.md
- kaola-workflow/archive/issue-1052/.cache/dispatch-review-final-integrated.md
- kaola-workflow/archive/issue-1052/.cache/dispatch-review-handoff-1051.md
- kaola-workflow/archive/issue-1052/.cache/doc-docking.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-c1-gate-parens.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-dispatch-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-dispatch-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-forge-ports.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater-host-identity.md
- kaola-workflow/archive/issue-1052/.cache/doc-updater.md
- kaola-workflow/archive/issue-1052/.cache/final-validation.md
- kaola-workflow/archive/issue-1052/.cache/focused-verification.md
- kaola-workflow/archive/issue-1052/.cache/handoff-1051.md
- kaola-workflow/archive/issue-1052/.cache/implementation-c1-gate-parens.md
- kaola-workflow/archive/issue-1052/.cache/implementation-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/implementation-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/implementation-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/implementation-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/implementation-comment-5561808292.md
- kaola-workflow/archive/issue-1052/.cache/implementation-forge-ports.md
- kaola-workflow/archive/issue-1052/.cache/implementation-host-identity.md
- kaola-workflow/archive/issue-1052/.cache/implementation.md
- kaola-workflow/archive/issue-1052/.cache/implementer-dispatch-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/implementer-dispatch-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/implementer-dispatch-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/implementer-dispatch-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/implementer-dispatch-comment-5561808292.md
- kaola-workflow/archive/issue-1052/.cache/live-cli-named-dispatch.md
- kaola-workflow/archive/issue-1052/.cache/live-cli-real-entry-prep.md
- kaola-workflow/archive/issue-1052/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1052/.cache/run-gaps.json
- kaola-workflow/archive/issue-1052/.cache/sequence.md
- kaola-workflow/archive/issue-1052/.cache/supervision-review-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/supervision-review-call-chain-rereview.md
- kaola-workflow/archive/issue-1052/.cache/supervision-review-dispatch.md
- kaola-workflow/archive/issue-1052/.cache/tdd-dispatch-c1-host-gate.md
- kaola-workflow/archive/issue-1052/.cache/tdd-dispatch-call-chain.md
- kaola-workflow/archive/issue-1052/.cache/tdd-dispatch-comment-5560806842.md
- kaola-workflow/archive/issue-1052/.cache/tdd-dispatch-comment-5561551896.md
- kaola-workflow/archive/issue-1052/.cache/tdd-dispatch-comment-5561808292.md
- kaola-workflow/archive/issue-1052/finalization-summary.md
- kaola-workflow/archive/issue-1052/mission-list.md
- kaola-workflow/archive/issue-1052/workflow-state.md
