# Finalization — Summary: issue-1035

## Delivered

- Restored the common per-item dispatch contract: an unavailable exact named role never becomes a
  run-wide inline posture, and an adequate native generic child is used honestly as itself rather
  than impersonating a custody-bearing role.
- Restored adapter-owned lookup, native dispatch carrier, three-tier model and effort defaults,
  native route exposure, reload/resume/nesting boundaries, and task-sensitive override freedom in
  both workflow-next and kaola-workflow-finalize for Claude, Codex, OpenCode, Kimi, Grok, Cursor,
  and ZCode.
- Kept AGENTS.md as the runtime-neutral authority, CLAUDE.md as the Claude-only thin bridge, and
  non-Claude runtime guidance independent of CLAUDE.md.
- Measured Cursor directly on supported CLI versions, corrected the earlier documentation-only
  premise, and froze project custom roles, writable generalPurpose identity, three tier profiles,
  parallel dispatch, reload behavior, and the observed nesting boundary without universalizing one
  host catalog.
- Recorded the future-runtime design standard in repository AGENTS.md and closed all four code-review
  findings, including executable Codex V2 finalize calls with required task_name fields.

## Files Changed

The delivery changes the universal design record and public documentation, runtime capability and
behavior authorities, the shared next/finalize routing skeletons, generated GitHub/GitLab/Gitea
command and Codex skill surfaces, additive runtime renderers, and independent architecture,
routing, model-rendering, edition, and walkthrough acceptance tests.

## Test Coverage

- Runtime architecture: 719 assertions, including mutation-proven role-to-tier reachability,
  item-local fallback, Codex V2 task_name completeness, and universal/non-Codex field isolation.
- Routing surfaces: 496 assertions; generated routing: 18 byte-matching surfaces; generated agent
  profiles: 14 roles × 7 runtimes, 126 deterministic renders.
- Additive editions: OpenCode 887, Kimi 848, Grok 711, Cursor 834, and ZCode 856 assertions.
- Workflow walkthrough: 179/179 scenarios, spawn census 2118.
- Direct Cursor evidence: exact tdd-guide/doc-updater dispatch, writable generalPurpose under its own
  identity, medium/high/xhigh tier resolution, current finalize guidance, parallel dispatch, reload,
  and measured nesting behavior.

## Validation

Candidate `6db8609ca33d7d800de8a3acb5839a51877242a0` has a clean exact-SHA all-four receipt: Claude,
Codex, GitLab, and Gitea each passed once with no waiver, accepted red, retry, timeout, or signal.
Independent code review resolved R1-R4 and returned APPROVE; adversarial closure returned
PASS/not_refuted with zero blockers.

## Changed Paths

The finalize transaction appends its exact changed-path inventory here.

## Mission List

Every implementation, acceptance, live-measurement, documentation, review, publication, and global
runtime-install mission is complete. Consumer repositories remain owner-scoped and run workflow
initialization independently, as directed by the owner.

## Documentation Docking

`DOCKED`. README, CHANGELOG `[Unreleased]`, API, architecture, conventions, runtime capabilities,
additive-edition guides, and ADR 0021 describe the shipped runtime-native boundaries. README already
documents Codex V2 task-name dispatch. No #1035 documentation blocker remains.

## Run gaps

## Follow-Up Items

None. Issue #1035, version/tag publication, and global runtime installation are complete. Consumer
workflow initialization is performed by each consumer and is outside this run by owner direction.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1035/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1035/.cache/doc-docking.md
- kaola-workflow/archive/issue-1035/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1035/.cache/run-gaps.json
- kaola-workflow/archive/issue-1035/finalization-summary.md
- kaola-workflow/archive/issue-1035/mission-list.md
- kaola-workflow/archive/issue-1035/workflow-state.md

## Post-Finalize Release

- Release-only candidate: `92fbcee41713448f9506b405c5a9d410343bea04`; exactly eight allowed release files changed from sink/archive commit `9fd55eeabd722dacbfd08ffda540bfa48d3cac25`.
- Pre-tag receipt: clean, exact-SHA, unwaived Claude/Codex/GitLab/Gitea chains, all exit 0 in one attempt; strict `--release-check` passed for the same SHA.
- Tag transaction: `kaola-workflow--v10.0.1` created and raw tag-tree bytes verified; tag-present `npm test` passed all four chains.
- Publication: origin `main` and `refs/tags/kaola-workflow--v10.0.1` both resolved to the candidate; GitHub published `https://github.com/KaolaBrother/Kaola-Workflow/releases/tag/kaola-workflow--v10.0.1` as a non-draft, non-prerelease Latest release.
- Closure: GitHub issue #1035 is closed and the temporary workflow branch is deleted.
- Installation convergence: `install-all.sh --global --yes --forge=github` reported PASS for Claude, OpenCode, Codex, Kimi, Grok, Cursor, and ZCode; the following dry-run check read the installed Codex marketplace plugin at 10.0.1 with no refresh pending.
- Consumer boundary: no consumer repository was modified; each consumer runs workflow initialization itself by owner direction.
