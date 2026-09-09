# Finalization summary — bundle-1053 (issue #1053)

Candidate: `1b779b38` on `workflow/bundle-1053` (base `d02f82b7`, v10.5.0). Sink: merge. No release/tag.

## Delivered
- Two semantic additions to the shared Next authoring source `templates/routing/next.skeleton.md`: a **Task clarity**
  paragraph in "Intake, freshness, claim, and resume" (continue when outcome + acceptance basis are clear and
  authorized; investigate a missing fact first; ask only about an unresolved scope/authorization/acceptance choice while
  continuing independent investigation; maintain the issue in plain language citing what is sufficient; research/design
  requests authorize research/design only) and one verification-scope judgment sentence in "Run it".
- Regenerated from that one source: 6 tracked Next surfaces (github/gitlab/gitea × Claude command / Codex skill) and
  the 15 additive edition renders (opencode/kimi/grok/cursor/zcode × 3 forges; Cursor CLI/App/Cloud share one surface
  per forge with in-prompt host distinction). No mirror hand-edited. Compact-recovery prompts do not embed Next.
- `docs/task-quality.md` (short guide) + links/notes in `docs/README.md`, `README.md`, `docs/api.md`, `CHANGELOG.md`
  `[Unreleased]`. No new API, command, flag, role, config, state field, phase, scorer, or approval gate.
- Acceptance suite `scripts/test-issue-1053-next-task-quality.js` (264 assertions; bound-meaning detectors, in-memory
  edition rendering, non-goal pins; hermetic, no historical git object), registered on `test:kaola-workflow:claude`
  and `:claude:full`.

## Files Changed
`templates/routing/next.skeleton.md`; `commands/workflow-next.md`; `plugins/kaola-workflow{,-gitlab,-gitea}/commands/workflow-next.md`
(gitlab/gitea) and `.../skills/kaola-workflow-next/SKILL.md` (×3); `docs/task-quality.md` (new); `docs/README.md`; `README.md`;
`docs/api.md`; `CHANGELOG.md`; `scripts/test-issue-1053-next-task-quality.js` (new); `package.json` (suite registration).
15 files across two commits (`51890a2e` feature, `1b779b38` test revision).

## Test Coverage
- RED on baseline `d02f82b7`: 142 failed / 95 passed (temporary baseline worktree) — `.cache/acceptance-red.md`.
- GREEN on candidate: 264/264. Mutation arming (reviewer, on a scratch export): skeleton sentence deletions red 23/23;
  a single edition stripping a passage reds 15; on-disk hand edit of a tracked render is caught by
  `generate-routing-surfaces.js --check` (runs on all four chains).
- Declared residuals (non-blocking O1/O2): double negation / comparative inside the bound-negation window and inflected
  "remember" escape the mechanical detectors; semantic correctness stays with review and the guide by design.

## Acceptance legs
| leg | status | evidence |
|---|---|---|
| automated: `npm test` (claude+codex+gitlab+gitea chains) on `1b779b38` | PASS exit 0 | `.cache/verification.md`, `.cache/verify-1b779b38.log` |
| automated: full `simulate-workflow-walkthrough.js` on `1b779b38` | PASS 179/179 (2118 spawns) | same |
| automated: edition lane (8 suites, 5 editions × 3 forge trees in parity) on `1b779b38` | PASS exit 0 | same |
| receipt: `run-chains --project bundle-1053` on `1b779b38` | see `## Validation` (transaction finding) | `.cache/chain-receipt.json` |
| independent review (frozen `51890a2e`, re-review `1b779b38`) | PASS, 0 blocking | `.cache/code-review.md` |
| fresh-session behavior (7 decision + 4 act probes, Claude Code) | recorded | `.cache/behavior-probes.md`, `.cache/probes/` |
| real host, headless decision-class: Codex 0.153.4, OpenCode 1.18.17, Grok 1.0.24, Kimi 0.34.0, Cursor CLI 2026.09.02 | recorded, consistent | same |
| NOT executed: ZCode (binary absent), Cursor App/Cloud, interactive host sessions, live-forge probes, `:claude:full`, release gate | unexecuted — not claimed | dogfood.md |
| local install refresh (issue AC9) | after sink — see `## Post-sink install check` | — |

## Issue walk (AC1–AC9)
AC1 generation coverage → `.cache/generation.md` + suite + review point 1. AC2 clear/authorized continue, fact gap
investigate, only real decisions asked → this run asked no question (design draft resolved by investigation), probes
1–4, act-B/C/D, host fact-gap probes. AC3 small permission fix keeps refused/allowed/regression evidence → act-C,
probe 4. AC4 corrections via existing records; no learning/owner-rewrite/memory → probe 5, guide §corrections, suite
pin, this run touched no owner instruction or memory. AC5 Mission List 4 fields / 3 writes, no new mechanism →
`mission-list.md`, suite non-goal pins, review point 2. AC6 chains + walkthrough on candidate → verification.md.
AC7 seven-situation fresh-session checks with unexecuted hosts listed → behavior-probes.md. AC8 dogfood run record,
no speed/rework claim → `.cache/dogfood.md`. AC9 post-verification local carrier refresh + remote/cloud/unavailable
limits → post-sink section below.

## Documentation Docking
DOCKED — `.cache/doc-docking.md`, `.cache/doc-updater.md`.

## Run gaps
- manual:finalize-report (archived summary `## Mission List` reads `items: 0` for a 7-row table-form mission list): filed: #1054

## Follow-Up Items
- Filed #1054 (bug, P3): the finalize Mission List coherence probe parses only the `item:`/`status:`/`result:` line form, so the table-form record every current run writes reads as 0 items; earlier archives hid it by hand-writing the `## Mission List` heading. Body 2,300 bytes, confirmed present. Run-process defects found during this run (fixture leak, truncated brief, CLI flags) were corrected
  in-run and are recorded in `.cache/dogfood.md`; O1/O2 are declared test residuals, not product defects.
- Issue correction to post before close: the local design draft was never on this machine; the issue body already
  states it is not required (no premise error; recorded as a comment for the record).

## Readiness
All 7 missions done; candidate frozen and verified; review PASS. Ready for finalize transaction, close, archive, sink.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- commands/workflow-next.md
- package.json
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/test-issue-1053-next-task-quality.js
- templates/routing/next.skeleton.md

## Mission List

items: 0
carrying an outcome while their status is not `done`: 0

(Transaction reading; the actual record has 7 rows, all `done` with results — see `mission-list.md` and #1054.)

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1053/.cache/acceptance-red.md
- kaola-workflow/archive/bundle-1053/.cache/behavior-probes.md
- kaola-workflow/archive/bundle-1053/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1053/.cache/code-review.md
- kaola-workflow/archive/bundle-1053/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1053/.cache/doc-updater.md
- kaola-workflow/archive/bundle-1053/.cache/dogfood.md
- kaola-workflow/archive/bundle-1053/.cache/generation.md
- kaola-workflow/archive/bundle-1053/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1053/.cache/probes/host-codex-design.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-codex-factgap.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-cursor-design.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-cursor-design.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-cursor-factgap-json.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-cursor-factgap.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-cursor-factgap.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-grok-design.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-grok-design.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-grok-factgap.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-grok-factgap.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-kimi-design.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-kimi-design.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-kimi-factgap.attempt1.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-kimi-factgap.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-opencode-design.log
- kaola-workflow/archive/bundle-1053/.cache/probes/host-opencode-factgap.log
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-1.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-2.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-3.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-4.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-5.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-6.md
- kaola-workflow/archive/bundle-1053/.cache/probes/probe-7.md
- kaola-workflow/archive/bundle-1053/.cache/run-gaps.json
- kaola-workflow/archive/bundle-1053/.cache/verification.md
- kaola-workflow/archive/bundle-1053/.cache/verify-1b779b38.log
- kaola-workflow/archive/bundle-1053/.cache/verify-51890a2e.log
- kaola-workflow/archive/bundle-1053/finalization-summary.md
- kaola-workflow/archive/bundle-1053/mission-list.md
- kaola-workflow/archive/bundle-1053/workflow-state.md

## Post-sink install check (issue AC9) — three evidence classes, kept separate

Run from main `0082b978` after the sink; log `.cache/install-0082b978.log`.

1. **Install command exit codes (not byte proof).** `./install-all.sh --yes --forge=github` exit 0; the installer's own
   per-runtime summary printed `PASS (exit 0)` for claude, opencode, codex (marketplace plugin content refreshed and
   converged at 10.5.0 — no version bump, no release), kimi, grok, cursor, zcode. `./install-all.sh --check` exit 0 is a
   **dry-run PLAN** per runtime ("no changes made"); it is not a per-carrier verification and is not claimed as one.
2. **Per-carrier byte verification (SHA256 + cmp, done by the orchestrator).** Installed Next surface vs the repo render
   at `0082b978` (production bytes identical to `1b779b38`): claude `~/.claude/commands/workflow-next.md`, opencode
   `~/.config/opencode/commands/workflow-next.md`, codex `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/10.5.0/skills/kaola-workflow-next/SKILL.md`,
   kimi `~/.kimi-code/skills/workflow-next/SKILL.md`, grok `~/.grok/commands/workflow-next.md`, cursor
   `~/.cursor/commands/workflow-next.md`, zcode `~/.zcode/commands/workflow-next.md` — all seven **cmp IDENTICAL**
   to their generated source (sha256 prefixes 77bd0d28 / 00baf41c / 5be7e896 / d8cc0a9e / c5626c13 / 6cc72eb4 /
   b566f956), and each carries both #1053 passages (grep 1/1). Support scripts: `kaola-workflow-claim.js` anchor
   `022133fc…` MATCH in the claude, opencode, kimi, grok, cursor, zcode homes; codex plugin copy equals the repo plugin
   copy. Edition lane re-run from the main root at `0082b978`: 8/8 suites, each edition 3/3 forge trees in parity.
3. **Global-contract receipt (`~/.config/kaola-workflow/global-contract-receipt.json`, status CURRENT at
   `0082b978`):** INSTALLED for claude-local, codex-local, opencode-local, kimi-local, grok-local, cursor-cli-local,
   cursor-app-local; **cursor-cloud = REMOTE_REQUIRED** (a saved Cloud environment cannot be written from this
   machine); **zcode-local = NOT_INSTALLED** (the `zcode` binary is absent on this machine; only the `~/.zcode` file
   carrier was written and byte-verified above). Interactive trust flows (Cursor workspace trust, Codex hook trust)
   were not exercised. No live host session on any runtime was started against the refreshed install.

Repository after install: `git status` clean; main `a4d242ab` = `origin/main`.
