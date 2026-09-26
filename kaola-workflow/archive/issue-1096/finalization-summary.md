# Finalization Summary — issue-1096

## Delivered

Issue #1096 (Slices 1+2, decision D1=b): the sink preflight's directory-vs-file gap closed by one
unified untracked rule, plus publication and cleanup facts on the sink envelope. One commit
`94785512` on `workflow/issue-1096`, base `1cbd7e2a` (v12.2.6).

The unified `??` rule (D1=b — it deletes the #715 / #1075 / worktree-path exemptions): an untracked
path is foreign dirt only when it conflicts with a candidate tip tree — present AT THE PATH in the
`branch` tree (what `git checkout <branch>` writes) or in the `origin/<defBranch>` tree (what the
ff-merge can bring onto the working copy mid-transaction), or when an ANCESTOR folder of it exists as
a FILE in either tree. That ancestor leg is the round-1 review repair: `cat-file -e` cannot resolve a
path THROUGH a blob, so `untrackedPathConflictsWithCandidateFolder()` probes each ancestor with
`cat-file -t` and refuses on `blob`. A `??` path that conflicts with nothing is not refused, is not
staged, and is not committed — not-refusing is not mutation. The rebase's replay of intermediate
commits is deliberately out of scope and named as such (#1097); the rule claims only the two tip
trees.

Envelope facts on `--sink --json`: `publication` (`published` / `not_published` / `unknown`) and a
`cleanup` record per remote and local branch (`removed` / `deleted` / `skipped_missing` /
`skipped_offline` / `failed: <first git line>`).

## Files Changed

19 files, +1400/-739 against `1cbd7e2a`:

- `scripts/kaola-workflow-sink-merge.js` — canonical rule + ancestor probe + publication/cleanup
  machinery, and its byte-identical Codex copy `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
  (refreshed with `npm run sync:editions`).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` and the Gitea twin —
  the same change hand-ported (edition-sync's documented scope: these two are hand-ports, Codex is the
  generated copy).
- `scripts/test-sink-merge.js` — the #715 l/m and #1075 a/b legs replaced by #1096 a/b1/b2/b3/c/d (b3
  per edition: the directory-vs-file collision in both shapes), the gh mock's
  `KAOLA_GH_MOCK_FAIL_CLOSE` arm, and the 6-leg publication/cleanup envelope suite.
- `scripts/test-issue-1067-archive-identity.js`, `scripts/simulate-workflow-walkthrough.js` — the
  affected legs updated.
- `docs/api.md`, `docs/workflow-state-contract.md`, `README.md`, `CHANGELOG.md` (`[Unreleased]`).
- `templates/routing/finalize.skeleton.md` plus the 6 regenerated finalize surfaces and
  `scripts/fixtures/issue-1055-render-baseline.json`.

## Test Coverage

Acceptance legs, all on `94785512`:

- automated (producer chain): `node scripts/kaola-workflow-run-chains.js --project issue-1096 --json`
  — result pass, claude/codex/gitlab/gitea all exit 0, no waivers; receipt `headSha 94785512`,
  `workTreeHash clean`, `codeTreeHash 41fdeccb…`, scope decision `all-four` (`edition_coupling`),
  2026-09-26T06:59:38Z–07:11:18Z.
- focused: `node scripts/test-sink-merge.js` — 1196 assertions, 0 failures (includes the four
  per-edition #1096 b3 directory-vs-file legs and the AC6 envelope legs: closure failure ⇒
  `sink_incomplete` with `publication: published`; `FORCE_PUSH_MAIN_FAIL` ⇒ `not_published`;
  `receive.denyDeletes` ⇒ `cleanup.remote_branch` reporting `failed: …` while the branch survives).
- `node scripts/test-issue-1067-archive-identity.js` — 22 checks × 4 editions.
- `node scripts/simulate-workflow-walkthrough.js` — 180/180, exit 0.
- `npm test` — exit 0, zero failures across all four chains.
- manual/UAT: Host review gate round 2 PASS on `94785512`; acceptance granted.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- docs/api.md
- docs/workflow-state-contract.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-sink-merge.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-issue-1067-archive-identity.js
- scripts/test-sink-merge.js
- templates/routing/finalize.skeleton.md

## Documentation Docking

README.md, docs/api.md, docs/workflow-state-contract.md, CHANGELOG.md `[Unreleased]`, and the
public-interface comments all updated in the commit; the 6 finalize surfaces regenerated from their
skeleton. Checklist and per-file reasons: `.cache/doc-docking.md` — DOCKED.

## Follow-Up Items

- #1097 — the rebase's replay of intermediate commits is not covered by the #1096 rule (named in
  `docs/api.md` and the preflight comment). Owner-filed; not started here by instruction.
- #1098 — direct-merge-out-of-shared-checkout and PR-path gaps. Owner-filed; not started here by
  instruction.
- This run filed no new follow-up issue: the review round's three findings (ancestor-file gap, stale
  contract paragraph, missing acceptance legs) were defects in this candidate and were repaired
  in-run, not product defects needing a separate issue.

## Readiness

Missions complete (ledger 4/4 `done`); candidate frozen at `94785512` with clean tree; chain receipt
and recorded verdict bound to that tree. Ready for the finalize transaction (archive) and the merge
sink to main. No release, tag, PR, or version change: Kaola-Workflow stays v12.2.6 and
`package.json` is untouched.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1096/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1096/.cache/doc-docking.md
- kaola-workflow/archive/issue-1096/.cache/final-validation.md
- kaola-workflow/archive/issue-1096/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1096/finalization-summary.md
- kaola-workflow/archive/issue-1096/mission-ledger.jsonl
- kaola-workflow/archive/issue-1096/workflow-state.md
