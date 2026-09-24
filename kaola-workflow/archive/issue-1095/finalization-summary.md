# Finalization Summary — issue-1095

## Delivered

Issue #1095 (delivery of review #1091): the skill-prompt accuracy and concision bundle, applied to
`templates/routing/` authoring sources and regenerated onto every routing surface (Claude commands,
Codex skills, GitHub/GitLab/Gitea editions, additive runtime editions). One commit, `5775c352`,
rebased on landed #1094 (`c6911753`).

Receipt findings applied: F1, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12; N1, N2, N3, N4, N5, N6
(with the `scripts/test-issue-1053-next-task-quality.js` heading custody update), N8; I1 (minimal),
I2, I3, I4, I5, I6; X1; T1, T2; plus the Owner-added root `.gitignore` `.kaola/` line (line 32).

Intentionally not applied: N7 (issue default: leave the ledger prose as is). F2 and N9 belong to
#1094 and landed there; this run only verified consistency (keep-open merge-sink-only; the F5 note
covers the sink block's `$SINK_ISSUE_NUMBERS_FLAG`). F5 is worded "same shell invocation, or carry the
captured values literally" because one Claude Bash call cannot clear check reasons between the
read-only check and the transaction.

## Files Changed

39 files, +673/-598 against `c6911753`: routing skeletons (finalize/next/init), `slots.js`,
`required-blocks.js`, `templates/agents/runtime-capabilities.json`, the 18 rendered command/skill
surfaces, `scripts/kaola-workflow-claim.js` (+ Codex mirror and GitLab/Gitea ports, comments only),
five test files (pinned expectations updated with reasons), the #1055 render baseline,
`CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`, `.gitignore`.

## Test Coverage

Pinned expectations changed in the same commit, each with its reason in-line: `required-blocks.js`
tokens (F1, F4, F6, F10, N1), `validate-workflow-contracts.js` recorder shape (F12),
`test-runtime-agent-architecture.js` A3 (I4), `test-generate-routing-surfaces.js` per-surface
landmark (I5), `test-issue-1053-next-task-quality.js` heading (N6), and the
`scripts/fixtures/issue-1055-render-baseline.json` recapture (routing-prose render change; 90
command renders drifted, 42 agent renders unchanged).

Acceptance legs, all on `5775c352`:
- automated: `node scripts/kaola-workflow-run-chains.js --project issue-1095 --json` → result pass;
  claude/codex/gitlab/gitea exit 0; receipt headSha 5775c352, workTreeHash clean
  (2026-09-24T06:07:15Z–06:18:33Z).
- local: 24 focused suites green; `npm run test:kaola-workflow:editions` 11/11 (13 trees in parity);
  `npm run test:kaola-workflow:claude:full` exit 0; `node scripts/simulate-workflow-walkthrough.js`
  180/180. Fixture commits need a git identity on this host, supplied as command-scoped
  `GIT_AUTHOR_*`/`GIT_COMMITTER_*` only.
- manual/UAT: Host acceptance granted on 5775c352 (spot-checks N2, I5, T1, F1).

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- .gitignore
- CHANGELOG.md
- commands/kaola-workflow-finalize.md
- commands/workflow-init.md
- commands/workflow-next.md
- docs/api.md
- docs/architecture.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-claim.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-issue-1053-next-task-quality.js
- scripts/test-priority-list-open.js
- scripts/test-runtime-agent-architecture.js
- scripts/validate-workflow-contracts.js
- templates/agents/runtime-capabilities.json
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js
- templates/routing/slots.js

## Documentation Docking

`.cache/doc-docking.md`: DOCKED. CHANGELOG `[Unreleased]`, `docs/api.md`, and
`docs/architecture.md` updated; README, docs index, conventions, and state contract checked with
no impact.

## Follow-Up Items

- Unmeasured (receipt forge info note): `glab issue view {N} --comments -F json` in the GitLab
  `nx-issue-detail-fetch` splice is unverified — `glab` is not installed on this host. Recorded
  here, not filed; no behavior change was made.
- Record fidelity: this run's claim was made with `--target-source user_named` (not a recognized
  value), so claim.js recorded `orchestrator_selected`; the issue was user-named (`user_directed`).
  The claim is otherwise valid; not re-claimed.
- Main-checkout gitignored runtime trees are shared by every worktree's `generate-routing-surfaces
  --write`; they were re-rendered from landed `c6911753` after validation (15 trees in parity).
- No release: CHANGELOG stays under `[Unreleased]`; no version bump, tag, or publish.

## Readiness

READY — mission ledger 6/6 done; chain receipt green on the candidate; docs docked; Host acceptance
granted; normal closure of #1095 through the merge sink (no keep-open).

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1095/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1095/.cache/doc-docking.md
- kaola-workflow/archive/issue-1095/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1095/finalization-summary.md
- kaola-workflow/archive/issue-1095/mission-ledger.jsonl
- kaola-workflow/archive/issue-1095/workflow-state.md
