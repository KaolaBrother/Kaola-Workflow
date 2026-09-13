# Finalization summary — issue-1072

Candidate: `2c5e66f5101f7e523a6ead6c96bb5bd64a625248` on `workflow/issue-1072`
(base `2b1af448ba5aebbe13bde6deef130a84b409b67e`, one commit ahead, `origin/main` unmoved at check time).

## Delivered

- **#1072 — `AGENTS.md` carries local facts only (owner-authorized rewrite).** Removed from the
  root project instructions: the ADR 0017 "design of record" narrative and the restated
  four-field / three-write Mission List rule (`:8-12` at the base), the forge-is-backlog-truth
  rule and its "do not create a local issue mirror" clause (`:14-15`), the five-line
  instruction-file editing meta-rule (`:29-34`), the read-before-edit / scoped-to-measured-failures
  bullet (`:59-60`), and the never-claim-unexecuted bullet (`:68`). Every removed rule loads from
  the machine-global contract (`templates/global/kaola-workflow-global.md`) on each runtime.
  Kept as local facts: run-record paths, one-line pointers to
  `docs/decisions/0017-the-mission-list.md` and `kaola-workflow/.roadmap/_rules.md`, Source
  layout, Commands and validation, the `:61-67` Change-discipline bullets, the provenance note,
  the Documentation checklist, and a one-bullet form of the meta-rule ("owner-authorized,
  Agent-maintained content; verify the repository before editing them"). The now-empty
  `## Product and design authority` heading was dropped with its rules.
- `CLAUDE.md` drops the "Claude imports the repository instructions through the bridge above"
  narration; exactly one `@AGENTS.md` line and the word "Claude" remain.
- One `CHANGELOG.md` `[Unreleased]` → `### Changed` entry.

## Files Changed

3 files, +11/−20 (`git diff --stat 2b1af448 2c5e66f5`): `AGENTS.md` (+4/−19), `CHANGELOG.md`
(+7/−0), `CLAUDE.md` (+0/−1). No JavaScript, shell, template, or generated surface changed.

Commit: `2c5e66f5` — `docs(#1072): subtract global-contract duplicates from AGENTS.md`.

## Acceptance walk (issue #1072 body, both rounds, at `2c5e66f5`)

Measured with `git show 2c5e66f5:AGENTS.md` / `:CLAUDE.md` and `grep -c -F` / `wc`
(`/tmp/kw-1072/AGENTS.2c5e66f5.md`):

- `AGENTS.md` ≤ 60 lines — **60 lines** (410 words). Satisfied at the ceiling.
- Round-1 forbidden phrases, 0 hits each: "design of record", "exactly four fields",
  "three write", "backlog truth", "Do not impose a template".
- Round-2 forbidden phrases, 0 hits each: "immediately before editing",
  "scoped to measured failures", "that was not executed".
- Seven pinned tokens present (`test-runtime-agent-architecture.js:524-538`): `Kaola-Workflow`
  (2), `docs/decisions/0017-the-mission-list.md`, `scripts/kaola-workflow-claim.js`,
  `scripts/kaola-workflow-run-chains.js`, `scripts/kaola-workflow-sink-merge.js`, `npm test`,
  `node scripts/simulate-workflow-walkthrough.js` (1 each). Must-not patterns
  (`READ CLAUDE.md`, `## First Principles`, `KW-AGENTS-MANAGED`): 0.
- `:61-67` bullets remain: Preserve unrelated work / Tests own acceptance meaning /
  Keep agent-facing behavior free of provenance / Runtime-specific behavior — all four present
  (`AGENTS.md:47-53` at the candidate).
- `CLAUDE.md`: 1 line equal to `@AGENTS.md`, "Claude" present; A2 duplicated-section list empty.
- `test-runtime-agent-architecture.js` A1/A2 pass — exit 0 at `2c5e66f5`
  (`/tmp/kw-1072/test-runtime-agent-architecture-2c5e66f5.log`) and again as a step of the
  claude chain in the receipt.
- Remedy step 3 as amended ("keep Change discipline minus these two bullets"): satisfied.
- Remedy step 4 (`node scripts/test-runtime-agent-architecture.js`, `npm test`, CHANGELOG entry):
  satisfied; see Validation.

Acceptance legs: automated/local only. No environment, device, service, or user-acceptance
check was involved or is claimed; nothing is unexecuted.

## Deviation from the issue's pinned-token list (recorded, not a blocker)

The issue lists the seven A1 tokens from `test-runtime-agent-architecture.js` as the tokens that
must remain. `validate-workflow-contracts.js:355-361` additionally pins `kaola-workflow/.roadmap/_rules.md`
and the phrase "only optional local roadmap file" in `AGENTS.md`. The first candidate removed
`:14-15` wholesale and failed that gate (and, through `simulate-workflow-walkthrough`
`testContractValidatorOfflineSkip`, `npm test`; `/tmp/kw-1072/validate-workflow-contracts.log`,
`/tmp/kw-1072/npm-test.log`). The path fact was restored as one line — the *rule* and the phrase
"backlog truth" stay removed; no test was edited. This is a correction to the issue's measured
section and is posted as a comment on #1072 before closure (owner-scheduled; see Follow-Up).

## Correction to a completed mission result

`mission-list.md` mission 1 `result` reads "75→59 lines / 558→401 words". That figure was measured
before the `_rules.md` line was restored. The frozen candidate is **60 lines / 410 words**.
Completed results are immutable; this summary and `.cache/doc-docking.md` carry the corrected
figure. The independent supervisor's 60/410 measurement agrees.

## Test Coverage

No test was added, removed, or weakened: the change is documentation-only and the existing gates
own its meaning — A1/A2 in `test-runtime-agent-architecture.js`, the `compact durable state
contract` concept assert in `validate-workflow-contracts.js`, and the `PROJECT-INSTRUCTIONS`
global-contract duplicate gate in `test-route-reachability.js` (exit 0,
`/tmp/kw-1072/test-route-reachability-2.log`).

## Validation

verdict: pass
command: `node scripts/kaola-workflow-run-chains.js --project issue-1072 --json` (run from the
worktree `.kw/worktrees/issue-1072` at `2c5e66f5`, clean tree)
receipt: `kaola-workflow/issue-1072/.cache/chain-receipt.json` — `headSha`
`2c5e66f5101f7e523a6ead6c96bb5bd64a625248`, `workTreeHash: clean`, `codeTreeHash`
`2cf492d6be77993e546634c1ddfae1b106246e02c20bd51009889a44f77d611f`, `source: npm-default`,
scope `all-four` (reason `edition_coupling`, touched edition path `CLAUDE.md`, 3 changed files),
preamble 11/11 steps exit 0. Started 2026-09-12T21:47:20Z, completed 21:55:23Z.
chains: claude (exit 0, 52 steps, 1 attempt, 462 s), codex (exit 0, 2 steps), gitlab (exit 0,
3 steps), gitea (exit 0, 3 steps); no `accepted_red`, no `timed_out`.
log: `/tmp/kw-1072/run-chains-2c5e66f5.log` → `{"result":"pass","failed":[]}`.
walkthrough: `node scripts/simulate-workflow-walkthrough.js` at `2c5e66f5` — 178/178 scenarios
passed (`/tmp/kw-1072/walkthrough-2c5e66f5.log`).
focused gates at `2c5e66f5`: `test-runtime-agent-architecture.js` 0,
`validate-workflow-contracts.js` 0 (`/tmp/kw-1072/*-2c5e66f5.log`); at the byte-identical
pre-commit tree (one CHANGELOG digit differs): `test-route-reachability.js` 0, `npm test` 0
(`/tmp/kw-1072/*-2.log`).

finalize --check (read-only, from the worktree): `ok: true`; `mirror: ready`,
`workflow_state: pending_mirror`, `implementation_commit: not_applicable`, `staging_guard: ok`,
`validation: chains_green`, `dirty_paths: []`, `reasons: []` (`/tmp/kw-1072/finalize-check-1.json`).

## Changed Paths

Reported by `finalize --check` (`checks.changed_paths`, `dirty_paths: []`):

- `AGENTS.md`
- `CLAUDE.md`

`CHANGELOG.md` is a documentation path and is listed under Files Changed.

## Documentation Docking

`.cache/doc-docking.md` — DOCKED at `2c5e66f5`. README, docs/api.md, docs/decisions, templates,
and public-interface comments: no-impact with reasons; CHANGELOG updated.

## Follow-Up Items

- No run-discovered defect to file. The `validate-workflow-contracts.js` pinned tokens are a
  correction to #1072's measured section, not new work: posted as comment 5649517829 on #1072
  (owner-authorized, before closure), also carrying the 59→60 line and 401→410 word correction.
- Owner-scheduled sequence: finalize transaction (archive, `--keep-worktree`, close deferred to
  the sink) runs now; merge sink, issue closure, closure audit, and global install wait for the
  serial integration slot after the #1075-repaired bundle sink. No release.

## Closure decision

Close #1072 alone (singleton set) when the owner schedules the sink; no keep-open. No release or
version bump is part of this run.

## Readiness

Both missions done; chain receipt green and bound to the frozen candidate `2c5e66f5`; walkthrough
green; documentation docked; `finalize --check` ok with no reasons. Ready for the owner-scheduled
finalize transaction, merge sink, and closure audit.

## Sink Findings

post_rebase_tests: green

archived_paths:
- kaola-workflow/archive/issue-1072/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1072/.cache/doc-docking.md
- kaola-workflow/archive/issue-1072/.cache/mirror-digest.json
- kaola-workflow/archive/issue-1072/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1072/finalization-summary.md
- kaola-workflow/archive/issue-1072/mission-list.md
- kaola-workflow/archive/issue-1072/workflow-state.md
