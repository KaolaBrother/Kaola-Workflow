# Finalization — Summary: issue-933

Issue #933 — *claim: adopting a reserved directory SUCCEEDS at exit 0, writing run state into the
backlog or archive band.* Commit `8de1ac9a` on `workflow/issue-933`.

## Delivered

**The demanded result:** *a claim must not write run state into a directory that is not a project
folder.*

A claim naming a reserved directory now **resolves around it and reports the swap**, rather than
adopting it. `kaola-workflow/.roadmap/` is the backlog and `kaola-workflow/archive/` the archive
band; a claim naming either — by `--project`, or by `workflow_project:` in a roadmap source — claims
the run's ordinary `issue-<N>` folder instead, and the acquiring envelope carries `reserved_project`
(the declined name, verbatim) with `reserved_project_note` explaining the substitution.

**The refusal count outside the destruction class stays zero.** That was an owner value call, asked
in conversation and ruled before any code was written: nothing is destroyed here — the directory
keeps everything it arrived with — so this is not the class where a refusal is still legal. A
reserved name is a routing problem. What keeps the substitution honest is that it is reported.
*Refusal at the claim site was considered and DECLINED; do not re-file it.*

**One wiring point, not four.** Both doors converge on a single line in `claimProject`: the startup
path resolves its own name and passes it in as `args.project`. The resolver sits there, above the
existing `isSafeName` assert.

**`issue-<N>` is the only shape a substitute can take**, not merely a convenient one. `writeState`
infers a missing issue number back out of the project *name* via `/^issue-([1-9][0-9]*)$/` alone, so
no other substitute shape can complete a claim.

## Files Changed

| file | change |
|---|---|
| `scripts/kaola-workflow-claim.js` | `unreservedProjectName` + wiring in `claimProject` + two envelope fields |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | byte-identical copy (`COMMON_SCRIPTS`) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | same shape, `issueIid` vocabulary |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same shape, `issueIid` vocabulary |
| `scripts/simulate-workflow-walkthrough.js` | new scenario `testClaimNeverAdoptsReservedDir933` (+ registry line) |
| `scripts/test-forge-claim-reserved-project.js` | **new** — per-edition sibling suite |
| `package.json` | wires the sibling into all five chain entries |
| `CHANGELOG.md`, `README.md`, `docs/api.md` | user-visible surfaces |

10 files, +805/−9.

## Test Coverage

**Custody was separated end to end.** Every test artifact was authored by `tdd-guide`; the
implementer wrote none of them and only read and ran them.

| suite | scope | result |
|---|---|---|
| `testClaimNeverAdoptsReservedDir933` | 4 doors: `--project .roadmap`, roadmap-data-no-flag, `--project archive`, `Archive` case-fold | 4/4 |
| `test-forge-claim-reserved-project.js` | 20 legs — 4 editions × 5 (both doors × both reserved shapes + case-fold) | 364 passed, 0 failed |

**Both directions are on the record, each against a named tree.** Red at `406b5639`: the walkthrough
scenario, and the forge suite at 188 passed / 176 failed — 44 per edition, identical across all
four. Green at `8de1ac9a`.

**Guards are mutation-proven, one site and one edition at a time**, with a green positive control
either side and a shasum-verified restore:

- canonical: bypass the wiring → red; make the resolver identity → red; drop *only* the envelope
  report → red on the missing field, proving the report is pinned independently of the filesystem
  assertions.
- per edition: four mutants, one edition each — every mutant reds on **exactly** its own edition's
  leg and no other.

**A green four-chain receipt did not cover the walkthrough scenario.** `test:kaola-workflow:claude`
samples the walkthrough at `--shard auto/12`; shard 3 came up and ran 17 of 206 scenarios, and this
run's scenario was not among them. The suite was therefore re-run at full scope in the shipped
worktree: `ran:206 passed:206 failed:0`, scenario `PASSED (4/4 doors)`.

## Validation

## Changed Paths

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`.

`README.md` (claim section), `docs/api.md` (claim-envelope surface, both new fields) and
`CHANGELOG.md` (`[Unreleased] / Fixed`) updated. `docs/architecture.md`,
`docs/workflow-state-contract.md`, `docs/conventions.md` and `.env.example` recorded as no-impact
with reasons — no structural change, no durable-state contract change, no new convention, no new
environment variable.

`doc-updater` was **not dispatched**; a skip-with-reason is recorded at `.cache/doc-updater.md`. This
change adds fields to a JSON envelope, which is the structured-surface class most prone to
fabricated field names and example values; every documented fact here is transcribed from a driven
run instead.

## Run gaps

- manual:forge-claim-ports-uncompared (the gitlab and gitea claim ports are divergent hand-ports that NO byte-identity guard compares to canonical): filed: #934

Measured this run: all four editions reproduced #933 identically — 44 failing assertions each,
symmetric — so a canonical-only fix would have gone green on a full unwaived four-chain receipt
while shipping the defect to half the surface. The behavioural walkthrough reaches claude+codex
only. Closed for *this* defect by `scripts/test-forge-claim-reserved-project.js`; the general
coverage gap stands and is filed as an observation carrying its measurement, proposing no mechanism.

## Follow-Up Items

- **#934** — the cross-edition coverage gap above. Filed with owner agreement; closeable with no
  code if the risk is knowingly accepted.
- **None outstanding for #933 itself.** The issue's three explicit non-goals were verified respected
  against the commit rather than assumed: no rollback change, no `active-folders.js` change, no
  widened `isSafeName` — 0 hits each.

## Process notes (recorded, not hidden)

Two errors were made and corrected inside this run, both worth the successor's attention:

1. **The whole run was done in the main root on `main`** — the shared tree — instead of the claimed
   worktree. Recovered by patch plus untracked-file copy into `.kw/worktrees/issue-933`, with all
   ten changed files verified **byte-identical between the two trees before the main root was
   reverted**, so what shipped is what was measured.
2. **An `npm test` was started and then edited underneath**, invalidating it. Stopped by task ID —
   never `pkill -f`, which would have killed a concurrent session's runs — and re-run once on a
   frozen tree. No result from the invalidated run was used.

A third near-miss is worth recording because it produced the run's sharpest finding: a
`project-<name>` second arm was added to the resolver and defended in-comment with a **false**
justification. The test author declined to pin it, having found no door to drive it through; that
refusal was overruled, and writing the pin is what exposed the error — the refusal lives *inside*
`claimProject`, not upstream, so the arm was unreachable and would have stayed green forever. The
arm was removed with its pins, and its removal was measured **observably inert** rather than argued
equivalent.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-933/.cache/chain-receipt.json
- kaola-workflow/archive/issue-933/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-933/.cache/doc-docking.md
- kaola-workflow/archive/issue-933/.cache/doc-updater.md
- kaola-workflow/archive/issue-933/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-933/.cache/repro-933.md
- kaola-workflow/archive/issue-933/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-933/.cache/run-gaps.json
- kaola-workflow/archive/issue-933/.cache/test-baseline-933.md
- kaola-workflow/archive/issue-933/finalization-summary.md
- kaola-workflow/archive/issue-933/mission-list.md
- kaola-workflow/archive/issue-933/workflow-state.md
