# Finalization Summary — issue #1107

## Delivered

Corrected the release-tag documentation claim in `docs/api.md`. The release sequence said `--tag`
"creates the annotated tag at the verified commit"; `scripts/kaola-workflow-release.js:307` in fact
creates a **lightweight** tag ref with an atomic zero-old
`git update-ref refs/tags/<tag> <candidate> 0000000000000000000000000000000000000000`, which writes
no tag object, so there is no tagger and no tag message. `docs/api.md` now states the actual
behavior and links to `docs/conventions.md` ("Release cutting"), which already described it
correctly. A `CHANGELOG.md` `[Unreleased]` / `### Fixed` entry records the correction.

Scope was DOCS-ONLY per the Host decision: no script, test, or tag was created, moved, or deleted.
All published tags (`kaola-workflow--v12.2.5`, `--v12.2.6`, `--v12.3.0`, all lightweight) are
unchanged.

## Files Changed

| File | Change |
|---|---|
| `docs/api.md` | +4 / −1 — one sentence at :2017 now states the lightweight zero-old `update-ref` behavior. |
| `CHANGELOG.md` | +6 / −0 — new top `## [Unreleased]` / `### Fixed` entry. |

Total: 2 files, +9 / −1. (`git diff --stat a0813186..HEAD`)

## Test Coverage

No test pins the corrected doc text. `grep -rln "annotated tag" scripts/ plugins/ templates/ tests/`
returned no matches, so no test was edited or needed editing.

The only docs-consistency suite covering `docs/api.md` is `scripts/test-validation-allowband.js`
(15 assertions; `docs/api.md` is a chain-asserted CODE control). It passed, both focused and inside
the claude chain.

## Validation

(Filled by the finalize transaction.)

## Changed Paths

(Filled by the finalize transaction.)

## Acceptance — issue statement walked part by part

| Issue part | Satisfied by |
|---|---|
| `docs/api.md:2017` says "annotated tag" but the tool creates a lightweight tag | `docs/api.md:2017` now reads "creates a lightweight tag ref … atomic zero-old `git update-ref refs/tags/<tag> <candidate> 0000…`, which writes no tag object, so there is no tagger and no tag message". |
| Tool creates an atomic zero-old ref update (~:307) | Unchanged and re-read: `scripts/kaola-workflow-release.js:307`. |
| `docs/conventions.md` already correct | Unchanged; `docs/api.md` now links to it. |
| Other "annotated" claims in README/docs/CHANGELOG swept | Swept; only `docs/api.md:2017` was wrong. Remaining hits are unrelated (decision-node "annotated node", surface annotations, past released CHANGELOG sections). |
| CHANGELOG `[Unreleased]` entry | Added under `### Fixed`, exactly one `## [Unreleased]` heading. |
| Tool behavior unchanged; published tags not rewritten | No script change; `git tag --points-at HEAD` = 0. |

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. README, docs/api.md, CHANGELOG, docs/conventions.md, ADR
surface, public-interface comments, and docs/README.md index all reviewed against the change.

## Follow-Up Items

None. No run-discovered defect outside the fix. No correction comment is owed: the issue body
already described the lightweight behavior correctly, and the fix matches it.

## Readiness

- Candidate: `b6eef546a270aff015fa0e1836dbac81f25bf8ca`
- Four-chain receipt: `/tmp/kw1107/chain-receipt.json`, headSha `b6eef546…`, claude/codex/gitlab/gitea
  all exit 0, no waiver.
- `--release-check --candidate HEAD` → exit 0, "release ok (4 chains green, unwaived, at b6eef546…)".
- `.cache/final-validation.md` → `verdict: pass`.
- Sink: merge to main, no PR. Issue action: close.

Status: **ready to finalize**.

## Finalize Findings

### residue_unattributed

The `chore: finalize` commit did NOT carry the paths below: this branch's own commits touch no file in their directories, so the transaction has no evidence they are this run's work. Nothing was committed, reverted or deleted — they are exactly where they were. Read them before the sink runs: commit what belongs to the run, remove what does not.

Paths not attributed to this run:

- .local/

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1107/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1107/.cache/doc-docking.md
- kaola-workflow/archive/issue-1107/.cache/final-validation.md
- kaola-workflow/archive/issue-1107/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1107/finalization-summary.md
- kaola-workflow/archive/issue-1107/mission-ledger.jsonl
- kaola-workflow/archive/issue-1107/workflow-state.md
