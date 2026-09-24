# Finalization Summary — issue-1094 (#1094)

## Delivered

Every PR/MR sink now closes the whole claimed issue set, each forge claim records one request-sink
noun, and the finalize/next prose matches. Branch `workflow/issue-1094`: implementation `edcca0f8`
(the Host-accepted diff, sha256 prefix `e257a0826047f7a0`).

Issue statement walk:

1. **Product (F2): PR/MR sinks close the whole claimed set.** `kaola-workflow-sink-pr.js` (and its
   byte-identical Codex mirror via `npm run sync:editions`), `kaola-gitea-workflow-sink-pr.js`, and
   `kaola-gitlab-workflow-sink-mr.js` accept `--issue-numbers A,B` and write one `Closes #n` per
   member; without the flag the state's `issue_numbers` line (live, then archived) supplies it; a
   singleton writes exactly `Closes #N`. Finalize's PR/MR case passes `$SINK_ISSUE_NUMBERS_FLAG`.
   Keep-open stays merge-sink-only (the #336 refusal is untouched and still tested in all three
   editions). `watch-pr` / `watch-mr` membership probing needs no change: with every member closed it
   reports `already_closed` instead of `partial`.
2. **V1: foreign sink noun normalized at claim time.** `canonicalSink` in the GitHub, Gitea and
   GitLab claims records `mr`→`pr` (GitHub, Gitea) and `pr`→`mr` (GitLab) from `--sink` or
   `KAOLA_SINK`, at both claim write sites (single and bundle). The skill's `mr|pr)` alias and the
   gitea/gitlab contract validators' `mr|pr)` expectations are unchanged; no validator pin changed.
3. **Prose.** `fz-issue-closure` (3 forges) and `finalize.skeleton.md` describe close-all on both
   sinks, only after acceptance, the closure decision and a verified merge, never by hand first; the
   receipt's "PR sink closes only the primary issue" wording was not used. N9 in `next.skeleton.md`
   now reads "After finalization, stop and await explicit redirection; never auto-route." All
   surfaces regenerated; none hand-edited.
4. **Tests.** Multi-member, archived-state fallback, and singleton closure in all three editions
   (walkthrough `testSinkPrClosesEveryMember`; `test-gitea-sinks.js` Test 2b; `test-gitlab-sinks.js`
   #1094 block) and V1 normalization in each claim (walkthrough `testClaimNormalizesForeignSinkNoun`;
   `test-gitea-workflow-scripts.js` / `test-gitlab-workflow-scripts.js` #1094 V1 blocks, flag and
   env). The new tests were shown to fail against the old sink code.
5. **Pinned expectation changed, with reason.** `scripts/fixtures/issue-1055-render-baseline.json`
   was recaptured with `--write-baseline` for the intentional finalize/next prose change (precedent
   #1089 `2244a312`, #1080 `a9e89df0`): 60 of 132 records changed, all
   `kaola-workflow-finalize` / `workflow-next` command renders; agent and `workflow-init` renders
   unchanged.

Acceptance: Host acceptance GRANTED 2026-09-24 on diff `e257a0826047f7a0` over 33 files at
`a088bbc6`, with six serial chains green (see Test Coverage).

## Files Changed

33 files vs `a088bbc6`: three sinks plus the Codex sink mirror, three claims plus the Codex claim
mirror, `templates/routing/{slots.js,finalize.skeleton.md,next.skeleton.md}` and 15 regenerated
command/skill surfaces, 5 test files, the #1055 render baseline, README, `docs/api.md`,
`docs/architecture.md`, and `CHANGELOG.md`. See `## Changed Paths` for the transaction's own list.

## Test Coverage

Serial pre-acceptance run on the accepted candidate (HEAD `a088bbc6` + diff `e257a0826047f7a0`), a
no-overlap guard before each launch (zero waits), logs in `/tmp/kw1094-run2/`, all `EXIT=0`:
`npm run test:kaola-workflow:claude:full`; gitea, gitlab, and codex chains (including the three
contract validators); `node scripts/simulate-workflow-walkthrough.js` (180/180); and
`npm run test:kaola-workflow:editions` (11/11 suites) in a hermetic clone `/tmp/kw1094-clone`.
The finalize four-chain receipt (`kaola-workflow-run-chains.js --project issue-1094`) is on
`edcca0f8`; see `## Validation`.

Test-only environment: this host has no global git identity, so the test runs set a throwaway
`KW Test <kw-test@example.invalid>` through `GIT_AUTHOR_*` / `GIT_COMMITTER_*` for fixture commits.
Run commits (implementation, finalize, archive, sink) are authored `KaolaBrother
<yanleichen@hotmail.com>` through the same variables scoped to those commands only, by Host ruling
(option 1); `~/.gitconfig` and the repo config are untouched.

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
- commands/workflow-next.md
- docs/api.md
- docs/architecture.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-sink-pr.js
- scripts/simulate-workflow-walkthrough.js
- templates/routing/finalize.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/slots.js

## Documentation Docking

`.cache/doc-docking.md`: DOCKED. README, `docs/api.md`, `docs/architecture.md` and CHANGELOG
`[Unreleased]` were fixed on the branch; `docs/README.md` and ADRs have no impact.

## Follow-Up Items

- **Shared local runtime trees (operational, not a defect).** `generate-routing-surfaces --write`
  refreshes the gitignored `.kimi` / `.grok` / `.zcode` (and cursor) trees in the MAIN checkout from
  whichever worktree runs it, so concurrent runs (#1094 and #1095) contended for them and the
  editions lane's D0 drift check reddened on the shared trees. This run did not force them; the
  editions lane was validated in a hermetic clone. After both runs land, one regeneration from
  `main` restores the local trees. No issue filed: whether the generator should scope refreshes per
  checkout is an Owner scope question.
- **Out of scope, recorded by review.** A state claimed before this change with GitHub `sink: mr`
  still routes to the merge sink (normalization is at claim time only), and uppercase `MR` / `PR`
  are not normalized — both match the case-sensitive skill alias. No issue filed.
- **No release.** No version bump, tag, or publish; CHANGELOG stays under `[Unreleased]`. Release is
  an Owner decision.

## Readiness

READY: missions 1–6 are done, Host acceptance is granted, and docs are docked. Sink: merge (default,
no PR). Closes #1094.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1094/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1094/.cache/doc-docking.md
- kaola-workflow/archive/issue-1094/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1094/finalization-summary.md
- kaola-workflow/archive/issue-1094/mission-ledger.jsonl
- kaola-workflow/archive/issue-1094/workflow-state.md
